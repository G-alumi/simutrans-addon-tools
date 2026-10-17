import * as vscode from 'vscode';
import * as path from 'path';
import { decodeImage } from './image';
import { childLabels, xrefTarget } from './labels';
import { decodeString, FieldValue, getName, PakNode, parsePak } from './parser';
import { OBJ_TYPES, SCHEMAS } from './schema';
import { getWebviewContent } from './webview';

/** 画面に渡すノード。画像のピクセルは大きいので含めず、画面から要求されたときに送る */
interface ViewNode {
	/** ツリーの通し番号(画像を要求するときに使う) */
	id: number;
	/** 種別のバッジに出す文字(FourCC) */
	badge: string;
	label: string;
	/** [名前, 値, 型] */
	fields: [string, string, string][];
	/** ゲームが読めないなど、注意書きがあれば */
	note?: string;
	/** ピクセルを持つ画像なら大きさ */
	image?: { width: number; height: number };
	children: ViewNode[];
}

/** 画面から届くメッセージ */
type WebviewMessage =
	| { type: 'ready' }
	| { type: 'getImages'; ids: number[] };

/** raw のフィールドをこのバイト数までは16進で出す。それより長いものはバイト数だけ */
const MAX_HEX_BYTES = 32;

export class PakEditorProvider implements vscode.CustomReadonlyEditorProvider {
	static readonly viewType = 'simutrans-addon-tools.pakViewer';

	constructor(private readonly extensionUri: vscode.Uri) {}

	openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
		return { uri, dispose: () => {} };
	}

	async resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
		const uri = document.uri;
		const webview = webviewPanel.webview;
		const mediaUri = vscode.Uri.joinPath(this.extensionUri, 'media', 'pak');
		const fileName = path.basename(uri.fsPath);

		webview.options = {
			enableScripts: true,
			localResourceRoots: [mediaUri],
		};
		webview.html = getWebviewContent(webview, mediaUri, fileName);

		// 画像を要求されたときのために、通し番号 → ノード を残しておく
		let nodes: PakNode[] = [];

		const load = async () => {
			try {
				const bytes = await vscode.workspace.fs.readFile(uri);
				const pak = parsePak(bytes);
				nodes = [];
				const tree = toViewNode(pak.root, fileName, nodes);
				tree.fields.unshift(
					['file', fileName, ''],
					['size', `${bytes.length.toLocaleString()} bytes`, ''],
					['header', pak.header.trimEnd(), 'string'],
					['compiler_version', String(pak.compilerVersion), 'u32'],
				);
				await webview.postMessage({ type: 'load', tree });
			} catch (err) {
				await webview.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
			}
		};

		// 画面のスクリプトの準備ができてから送る。画面が作り直されると ready が再度届くので、その都度読み込み直す
		webview.onDidReceiveMessage((msg: WebviewMessage) => {
			switch (msg.type) {
				case 'ready':
					load();
					break;
				case 'getImages': {
					const images = msg.ids.map((id) => {
						const img = nodes[id] && decodeImage(nodes[id]);
						return img
							? { id, width: img.width, height: img.height, rgba: new Uint8Array(img.rgba.buffer) }
							: { id };
					});
					webview.postMessage({ type: 'images', images });
					break;
				}
			}
		});
	}
}

function toViewNode(node: PakNode, label: string, nodes: PakNode[]): ViewNode {
	const id = nodes.length;
	nodes.push(node);
	const labels = childLabels(node);
	const view: ViewNode = {
		id,
		badge: badge(node.type),
		label,
		fields: viewFields(node),
		note: note(node),
		children: [],
	};
	const { w, h } = node.fields;
	if (node.type === 'image' && typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
		view.image = { width: w, height: h };
	}
	// 名前を持つノード(車両や建物など)は名前で、それ以外は親から見た役割で表す
	view.children = node.children.map((c, i) => toViewNode(c, getName(c) || labels[i], nodes));
	return view;
}

/** 種別のバッジ: FourCC の末尾の \0 を除いたもの。表示できない文字を含む未知の種別は16進 */
function badge(type: string): string {
	const fourcc = OBJ_TYPES[type] ?? type;
	if (/^[\x20-\x7E]+\0*$/.test(fourcc)) {
		return fourcc.replace(/\0+$/, '');
	}
	return [...fourcc].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function note(node: PakNode): string | undefined {
	if (node.version < 0) {
		return vscode.l10n.t('Unknown node type. The game skips this node and its children.');
	}
	if (!SCHEMAS[node.type]?.[node.version]) {
		return vscode.l10n.t('Unknown version {0}. The fields cannot be read.', node.version);
	}
	if (node.unread > 0) {
		return vscode.l10n.t('{0} bytes at the end of the body were not read.', node.unread);
	}
	return undefined;
}

function viewFields(node: PakNode): [string, string, string][] {
	const schema = SCHEMAS[node.type];
	const out: [string, string, string][] = [];
	// バージョンのある種別だけバージョンを出す
	if (schema && (Object.keys(schema).length > 1 || node.version > 0)) {
		out.push(['version', String(node.version), '']);
	}
	const types = new Map(schema?.[node.version] ?? []);
	for (const [name, value] of Object.entries(node.fields)) {
		const type = types.get(name) ?? '';
		if (node.type === 'xref' && name === 'type') {
			out.push([name, xrefTarget(node)!.type, 'fourcc']);
		} else if (value instanceof Uint8Array && isString(node, name)) {
			out.push([name, decodeString(value), 'string']);
		} else {
			out.push([name, formatValue(value), type]);
		}
	}
	return out;
}

/** 文字列として読むフィールドか */
function isString(node: PakNode, name: string): boolean {
	return (node.type === 'text' && name === 'text') || (node.type === 'xref' && name === 'name') || name === 'sound_name';
}

function formatValue(value: FieldValue): string {
	if (!(value instanceof Uint8Array)) {
		return String(value);
	}
	if (value.length > MAX_HEX_BYTES) {
		return `(${value.length.toLocaleString()} bytes)`;
	}
	return [...value].map((b) => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
}
