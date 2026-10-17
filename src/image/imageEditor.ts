import * as vscode from 'vscode';
import * as path from 'path';
import { getWebviewContent } from './webview';

const MIME_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.bmp': 'image/bmp',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
};

/** 失敗したときに読み直すまでの待ち時間(ファイルの書き込み途中だった場合に備える) */
const RETRY_DELAY_MS = 300;

/**
 * 画面に渡す画像データ
 * - encoded: PNGなどのファイルのバイト列。画面側でデコードする
 * - rgba: APDを拡張機能側で合成したRGBAのピクセル列
 */
type ImagePayload =
	| { kind: 'encoded'; mime: string; bytes: Uint8Array }
	| { kind: 'rgba'; width: number; height: number; pixels: Uint8Array };

/** 画面から届くメッセージ */
type WebviewMessage =
	| { type: 'ready' }
	| { type: 'decodeFailed'; message: string }
	| { type: 'loaded'; width: number; height: number }
	| { type: 'status'; zoom: string; coord: string };

export class ImageEditorProvider implements vscode.CustomReadonlyEditorProvider {
	static readonly viewType = 'simutrans-addon-tools.imageViewer';

	constructor(private readonly extensionUri: vscode.Uri) {}

	openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
		return { uri, dispose: () => {} };
	}

	async resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
		const uri = document.uri;
		const webview = webviewPanel.webview;
		const mediaUri = vscode.Uri.joinPath(this.extensionUri, 'media', 'image');

		// 画像はバイト列で渡すので、画面から直接読めるのは画面用のスクリプトとCSSだけにする
		webview.options = {
			enableScripts: true,
			localResourceRoots: [mediaUri],
		};
		webview.html = getWebviewContent(webview, mediaUri, path.basename(uri.fsPath));

		// ステータスバーにマウスの位置・ファイル名・画像の大きさ・ファイルサイズ・倍率を出す
		const status = new ImageStatusBar(path.basename(uri.fsPath));
		webviewPanel.onDidChangeViewState(() => status.setVisible(webviewPanel.active));
		webviewPanel.onDidDispose(() => status.dispose());

		// 1回目の読み込みに失敗したら1回だけ読み直し、それでも失敗したらエラーを表示する
		let attempt = 0;
		const load = async () => {
			attempt++;
			try {
				const [stat, image] = await Promise.all([vscode.workspace.fs.stat(uri), readImage(uri)]);
				status.setFileSize(stat.size);
				await webview.postMessage({
					type: 'load',
					fileInfo: {
						fileName: path.basename(uri.fsPath),
						fileSize: stat.size,
						format: path.extname(uri.fsPath).replace('.', '').toUpperCase() || '?',
					},
					image,
				});
			} catch (err) {
				fail(err instanceof Error ? err.message : String(err));
			}
		};
		const fail = (message: string) => {
			if (attempt < 2) {
				setTimeout(load, RETRY_DELAY_MS);
				return;
			}
			webview.postMessage({ type: 'error', message });
		};

		// 画面のスクリプトの準備ができてから送る(先に送るとメッセージが届かないことがある)
		// 非表示から戻ったときなど、画面が作り直されると ready が再度届くので、その都度読み込み直す
		webviewPanel.webview.onDidReceiveMessage((msg: WebviewMessage) => {
			switch (msg.type) {
				case 'ready':
					attempt = 0;
					load();
					break;
				case 'decodeFailed':
					fail(msg.message);
					break;
				case 'loaded':
					status.setImageSize(msg.width, msg.height);
					status.setVisible(webviewPanel.active);
					break;
				case 'status':
					status.setZoom(msg.zoom);
					status.setCoord(msg.coord);
					break;
			}
		});
	}
}

/** 画像を開いているエディターがアクティブな間だけ出すステータスバーの項目 */
class ImageStatusBar {
	private readonly fileName = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 104);
	private readonly coord = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 105);
	private readonly size = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 103);
	private readonly fileSize = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 102);
	private readonly zoom = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 101);
	private visible = false;

	constructor(fileName: string) {
		this.fileName.name = this.fileName.tooltip = vscode.l10n.t('File name');
		this.fileName.text = fileName;
		this.coord.name = this.coord.tooltip = vscode.l10n.t('Pointer position');
		this.size.name = this.size.tooltip = vscode.l10n.t('Image size');
		this.fileSize.name = this.fileSize.tooltip = vscode.l10n.t('File size');
		this.zoom.name = this.zoom.tooltip = vscode.l10n.t('Zoom');
		this.zoom.text = '100%';
	}

	setCoord(text: string) {
		this.coord.text = text;
		this.update();
	}

	setImageSize(width: number, height: number) {
		this.size.text = `${width}x${height}`;
		this.update();
	}

	setFileSize(bytes: number) {
		this.fileSize.text = formatBytes(bytes);
		this.update();
	}

	setZoom(text: string) {
		this.zoom.text = text;
		this.update();
	}

	setVisible(visible: boolean) {
		this.visible = visible;
		this.update();
	}

	private update() {
		for (const item of [this.fileName, this.coord, this.size, this.fileSize, this.zoom]) {
			if (this.visible && item.text) {
				item.show();
			} else {
				item.hide();
			}
		}
	}

	dispose() {
		this.fileName.dispose();
		this.coord.dispose();
		this.size.dispose();
		this.fileSize.dispose();
		this.zoom.dispose();
	}
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) { return `${bytes} B`; }
	if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function readImage(uri: vscode.Uri): Promise<ImagePayload> {
	const bytes = await vscode.workspace.fs.readFile(uri);
	const ext = path.extname(uri.fsPath).toLowerCase();
	if (ext === '.apd') {
		return decodeApd(bytes);
	}
	return { kind: 'encoded', mime: MIME_TYPES[ext] ?? 'application/octet-stream', bytes: plainBytes(bytes) };
}

/**
 * ただの Uint8Array に複製する
 * Node.js の Buffer のまま画面へ送ると toJSON で {type:'Buffer', data:[...]} に変換されてしまい、バイト列として届かない
 */
function plainBytes(bytes: Uint8Array): Uint8Array {
	return new Uint8Array(bytes);
}

async function decodeApd(bytes: Uint8Array): Promise<ImagePayload> {
	// apd-js-tools はESMなので、webpackでまとめずに実行時に読み込む
	const apdTools = await import(/* webpackIgnore: true */ 'apd-js-tools') as unknown as {
		parseApd: (buf: Buffer) => { width: number; height: number; layers: unknown[] };
		flattenApd: (apd: { width: number; height: number; layers: unknown[] }) => Buffer;
		bgraToRgba: (buf: Buffer) => Buffer;
	};
	const apd = apdTools.parseApd(Buffer.from(bytes));
	const bgra = apdTools.flattenApd(apd);

	// flattenApd は下の行から順に並んでいる(0行目が一番下)ので上下を反転する
	const { width, height } = apd;
	const rowBytes = width * 4;
	const flipped = Buffer.allocUnsafe(bgra.length);
	for (let y = 0; y < height; y++) {
		bgra.copy(flipped, y * rowBytes, (height - 1 - y) * rowBytes, (height - y) * rowBytes);
	}
	const rgba = apdTools.bgraToRgba(flipped);
	return { kind: 'rgba', width, height, pixels: plainBytes(rgba) };
}
