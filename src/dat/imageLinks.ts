import * as vscode from 'vscode';
import { CHANGE_PAK_SIZE_COMMAND, CellSize, getCellSize, isImagePreviewEnabled, isValidCellSize, TOGGLE_IMAGE_PREVIEW_COMMAND } from './settings';
import { parseDat } from './datDocument';
import { PngImage } from './png';
import { parseImageRef } from './imageRef';
import { errorMessage } from '../shared/localize';

/** datに書かれた画像の指定 */
interface ImageSpec {
	/** ファイル名.行.列 の範囲 */
	range: vscode.Range;
	uri: vscode.Uri;
	row: number;
	/** 無いときは row が通し番号 */
	col?: number;
	/** 1マスの大きさ */
	cell: CellSize;
}

/** キーの値が画像の指定ではないもの(名前に .数字 を含むことがある) */
const NOT_IMAGE_KEYS = new Set(['obj', 'name', 'copyright']);

/** 画像の指定を探す。画像ファイルが無いものは除く(ファイル名の間違いに気づけるように) */
async function findImageSpecs(document: vscode.TextDocument, line?: number): Promise<ImageSpec[]> {
	const dir = vscode.Uri.joinPath(document.uri, '..');
	const specs: ImageSpec[] = [];
	for (const object of parseDat(document.getText())) {
		const entries = object.entries.filter((e) => line === undefined || e.line === line);
		if (entries.length === 0) {
			continue;
		}
		const cell = getCellSize(document, object);
		if (!isValidCellSize(cell.size)) {
			continue;
		}
		for (const entry of entries) {
			if (NOT_IMAGE_KEYS.has(entry.key) || entry.key.startsWith('constraint')) {
				continue;
			}
			const ref = parseImageRef(entry.value);
			if (!ref) {
				continue;
			}
			specs.push({
				range: new vscode.Range(entry.line, entry.valueStart + ref.start, entry.line, entry.valueStart + ref.end),
				uri: vscode.Uri.joinPath(dir, ref.path.replace(/\\/g, '/') + '.png'),
				row: ref.row,
				col: ref.col,
				cell,
			});
		}
	}

	const exists = new Map<string, Promise<boolean>>();
	const fileExists = (uri: vscode.Uri) => {
		const key = uri.toString();
		if (!exists.has(key)) {
			exists.set(key, Promise.resolve(vscode.workspace.fs.stat(uri)).then(() => true, () => false));
		}
		return exists.get(key)!;
	};
	const found = await Promise.all(specs.map((s) => fileExists(s.uri)));
	return specs.filter((_, i) => found[i]);
}

/** 画像の指定(ファイル名.行.列)を、その画像ファイルを開くリンクにする */
export class ImageLinkProvider implements vscode.DocumentLinkProvider {
	async provideDocumentLinks(document: vscode.TextDocument): Promise<vscode.DocumentLink[]> {
		return (await findImageSpecs(document)).map((s) => new vscode.DocumentLink(s.range, s.uri));
	}
}

/** 画像の指定にマウスを乗せると、そのマスの画像を出す */
export class ImageHoverProvider implements vscode.HoverProvider {
	/** 読んだ画像(同じ画像のマスを続けて見ることが多いので、少しだけ残す) */
	private readonly cache = new Map<string, { mtime: number; image: Promise<PngImage> }>();

	async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
		const spec = (await findImageSpecs(document, position.line)).find((s) => s.range.contains(position));
		if (!spec) {
			return undefined;
		}
		const markdown = new vscode.MarkdownString();
		markdown.supportHtml = true;
		markdown.supportThemeIcons = true;
		markdown.isTrusted = { enabledCommands: [CHANGE_PAK_SIZE_COMMAND, TOGGLE_IMAGE_PREVIEW_COMMAND] };
		const preview = isImagePreviewEnabled(document);
		const { size } = spec.cell;
		let { row, col } = spec;
		if (!preview) {
			// 画像は読まないので、ファイル名.番号 の形は行・列に直さない
			markdown.appendText(col === undefined
				? vscode.l10n.t('Image index {0}', row)
				: vscode.l10n.t('Row {0}, column {1}', row, col));
		} else {
			try {
				const image = await this.load(spec.uri);
				const cols = Math.floor(image.width / size);
				const rows = Math.floor(image.height / size);
				if (col === undefined) {
					// ファイル名.番号 の形。makeobj(image_writer.cc)と同じく、行は「縦のマスの数」で割る
					col = cols > 0 ? row % cols : -1;
					row = rows > 0 ? Math.trunc(row / rows) : -1;
				}
				markdown.appendText(vscode.l10n.t('Row {0}, column {1}', row, col));
				markdown.appendMarkdown('\n\n');
				if (row < 0 || col < 0 || row >= rows || col >= cols) {
					markdown.appendText(vscode.l10n.t('This cell is outside the image ({0}x{1}px).', image.width, image.height));
				} else {
					const png = image.crop(col * size, row * size, size, size);
					markdown.appendMarkdown(`<img src="data:image/png;base64,${png.toString('base64')}" width="${size}" height="${size}">`);
				}
			} catch (err) {
				markdown.appendText(vscode.l10n.t('Failed to read the image: {0}', errorMessage(err)));
			}
		}

		// ボタンは1行に並べる。cell_size= で決まっているときは設定を変えても効かないので、大きさはボタンにしない
		const args = encodeURIComponent(JSON.stringify([document.uri.toString()]));
		const sizeButton = spec.cell.from === 'cell_size'
			? `${size}px (cell_size)`
			: commandLink(`$(edit) ${size}px`, vscode.l10n.t('Change pak size'), CHANGE_PAK_SIZE_COMMAND, args);
		const previewButton = preview
			? commandLink(`$(eye-closed) ${vscode.l10n.t('Hide preview')}`, vscode.l10n.t('Hide preview'), TOGGLE_IMAGE_PREVIEW_COMMAND, args)
			: commandLink(`$(eye) ${vscode.l10n.t('Show preview')}`, vscode.l10n.t('Show preview'), TOGGLE_IMAGE_PREVIEW_COMMAND, args);
		markdown.appendMarkdown(`\n\n${sizeButton} &nbsp;·&nbsp; ${previewButton}`);
		return new vscode.Hover(markdown, spec.range);
	}

	private async load(uri: vscode.Uri): Promise<PngImage> {
		const key = uri.toString();
		const { mtime } = await vscode.workspace.fs.stat(uri);
		const cached = this.cache.get(key);
		if (cached && cached.mtime === mtime) {
			return cached.image;
		}
		const image = Promise.resolve(vscode.workspace.fs.readFile(uri)).then((data) => PngImage.decode(data));
		this.cache.delete(key);
		this.cache.set(key, { mtime, image });
		image.catch(() => this.cache.delete(key));
		// 大きな画像もあるので、残すのは最近の数枚だけにする
		while (this.cache.size > 4) {
			this.cache.delete(this.cache.keys().next().value!);
		}
		return image;
	}
}

/** ホバーに置くコマンドのリンク(title はマウスを乗せたときの説明) */
function commandLink(label: string, title: string, command: string, args: string): string {
	return `[${label}](command:${command}?${args} "${title.replace(/"/g, '')}")`;
}
