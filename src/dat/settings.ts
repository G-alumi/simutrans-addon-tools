import * as vscode from 'vscode';
import { atoi, DatObject } from './datDocument';

/** makeobj が受け付ける1マスの大きさの範囲(makeobj.cc) */
const MIN_CELL_SIZE = 16;
const MAX_CELL_SIZE = 32766;

const SECTION = 'simutrans-addon-tools';
export const CHANGE_PAK_SIZE_COMMAND = 'simutrans-addon-tools.changePakSize';
export const TOGGLE_IMAGE_PREVIEW_COMMAND = 'simutrans-addon-tools.toggleImagePreview';
export const ADD_TO_IGNORE_LIST_COMMAND = 'simutrans-addon-tools.addToIgnoreList';

/** 1マスの大きさと、それがどこで決まったか */
export interface CellSize {
	size: number;
	/** cell_size=: オブジェクトの中、override: pakSizeOverrides のパターン、setting: pakSize */
	from: 'cell_size' | 'override' | 'setting';
	/** from が override のときのパターン */
	pattern?: string;
}

/**
 * 画像の1マスの大きさ。強いものから順に
 * 1. オブジェクトの中の cell_size=(makeobj と同じ)
 * 2. 設定 pakSizeOverrides で、datのパスに最初に一致したもの(ワークスペースからの相対パスのglob)
 * 3. 設定 pakSize
 */
export function getCellSize(document: vscode.TextDocument, object?: DatObject): CellSize {
	const entry = object?.entries.find((e) => e.key === 'cell_size');
	if (entry) {
		return { size: atoi(entry.value), from: 'cell_size' };
	}
	const config = vscode.workspace.getConfiguration(SECTION, document.uri);
	const folder = vscode.workspace.getWorkspaceFolder(document.uri);
	if (folder) {
		const overrides = config.get<Record<string, number>>('pakSizeOverrides', {});
		for (const [pattern, size] of Object.entries(overrides)) {
			if (vscode.languages.match({ pattern: new vscode.RelativePattern(folder, pattern) }, document) > 0) {
				return { size, from: 'override', pattern };
			}
		}
	}
	return { size: config.get<number>('pakSize', 128), from: 'setting' };
}

export function isValidCellSize(size: number): boolean {
	return Number.isInteger(size) && size >= MIN_CELL_SIZE && size < MAX_CELL_SIZE;
}

/** ホバーの「pakサイズを変更」から呼ばれる。大きさを入力してもらい、どこに保存するかを選んでもらう */
export async function changePakSize(uri: string): Promise<void> {
	const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
	const current = getCellSize(document);
	const input = await vscode.window.showInputBox({
		title: vscode.l10n.t('Change pak size'),
		prompt: vscode.l10n.t('The size of one image cell (such as 64, 128 or 256)'),
		value: String(current.size),
		validateInput: (v) => isValidCellSize(Number(v))
			? undefined
			: vscode.l10n.t('Enter an integer from {0} to {1}.', MIN_CELL_SIZE, MAX_CELL_SIZE - 1),
	});
	if (input === undefined) {
		return;
	}
	const size = Number(input);

	const relative = vscode.workspace.getWorkspaceFolder(document.uri) ? vscode.workspace.asRelativePath(document.uri, false) : undefined;
	const target = await pickTarget(document, vscode.l10n.t('Where to save pak size {0}', size), true);
	if (target === undefined) {
		return;
	}

	const config = vscode.workspace.getConfiguration(SECTION, document.uri);
	if (target === 'file') {
		// 最初に一致したものが使われるので、先頭に入れる
		const overrides = config.inspect<Record<string, number>>('pakSizeOverrides')?.workspaceValue ?? {};
		const rest = Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== relative));
		await config.update('pakSizeOverrides', { [relative!]: size, ...rest }, vscode.ConfigurationTarget.Workspace);
	} else {
		await config.update('pakSize', size, target);
	}

	// もっと強い指定があって効かないときは知らせる
	const result = getCellSize(document);
	if (result.size !== size) {
		vscode.window.showWarningMessage(result.from === 'override'
			? vscode.l10n.t('Saved, but the pattern "{0}" in pakSizeOverrides takes precedence for this file ({1}px).', result.pattern!, result.size)
			: vscode.l10n.t('Saved, but the workspace setting takes precedence.'));
	}
}

export function isImagePreviewEnabled(document: vscode.TextDocument): boolean {
	return vscode.workspace.getConfiguration(SECTION, document.uri).get<boolean>('imagePreview', true);
}

/** 設定 diagnostics.ignoreReferences のうち、その種類の名前(obj/名前 の 名前 の部分) */
export function getIgnoredReferenceNames(document: vscode.TextDocument, obj: string): string[] {
	const list = vscode.workspace.getConfiguration(SECTION, document.uri).get<string[]>('diagnostics.ignoreReferences', []);
	return list.filter((e) => e.startsWith(`${obj}/`)).map((e) => e.slice(obj.length + 1));
}

/** ホバーの「プレビューを隠す/表示」から呼ばれる。今と逆の値を、選んだ場所に保存する */
export async function toggleImagePreview(uri: string): Promise<void> {
	const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
	const enable = !isImagePreviewEnabled(document);
	const target = await pickTarget(document, enable ? vscode.l10n.t('Where to save the setting to show the preview') : vscode.l10n.t('Where to save the setting to hide the preview'), false);
	if (target === undefined || target === 'file') {
		return;
	}
	await vscode.workspace.getConfiguration(SECTION, document.uri).update('imagePreview', enable, target);
	if (isImagePreviewEnabled(document) !== enable) {
		vscode.window.showWarningMessage(vscode.l10n.t('Saved, but the workspace setting takes precedence.'));
	}
}

/** クイックフィックスの「無視リストに追加」から呼ばれる。setting は diagnostics.ignoreKeys など */
export async function addToIgnoreList(uri: string, setting: string, value: string): Promise<void> {
	const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
	const target = await pickTarget(document, vscode.l10n.t('Where to add {0} to the ignore list', value), false);
	if (target === undefined || target === 'file') {
		return;
	}
	const config = vscode.workspace.getConfiguration(SECTION, document.uri);
	// 保存先に値が無ければ、今効いている値(ユーザーの値か既定値)に足す
	const inspected = config.inspect<string[]>(setting);
	const current = (target === vscode.ConfigurationTarget.Workspace ? inspected?.workspaceValue : undefined)
		?? inspected?.globalValue ?? inspected?.defaultValue ?? [];
	if (!current.includes(value)) {
		await config.update(setting, [...current, value], target);
	}
	if (!vscode.workspace.getConfiguration(SECTION, document.uri).get<string[]>(setting, []).includes(value)) {
		vscode.window.showWarningMessage(vscode.l10n.t('Saved, but the workspace setting takes precedence.'));
	}
}

/** 設定の保存先を選んでもらう(ワークスペースとして開いていないファイルではユーザーだけ) */
async function pickTarget(document: vscode.TextDocument, title: string, withFile: boolean): Promise<'file' | vscode.ConfigurationTarget | undefined> {
	const folder = vscode.workspace.getWorkspaceFolder(document.uri);
	type Item = vscode.QuickPickItem & { target: 'file' | vscode.ConfigurationTarget };
	const items: Item[] = [];
	if (folder) {
		if (withFile) {
			items.push({ label: vscode.l10n.t('This file only'), description: vscode.workspace.asRelativePath(document.uri, false), target: 'file' });
		}
		items.push({ label: vscode.l10n.t('Workspace'), description: folder.name, target: vscode.ConfigurationTarget.Workspace });
	}
	items.push({ label: vscode.l10n.t('User'), description: vscode.l10n.t('All workspaces'), target: vscode.ConfigurationTarget.Global });
	const picked = await vscode.window.showQuickPick(items, { title, placeHolder: vscode.l10n.t('Choose where to save the setting') });
	return picked?.target;
}
