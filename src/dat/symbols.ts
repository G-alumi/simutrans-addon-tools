import * as vscode from 'vscode';
import { extractNames } from './datDocument';
import { NameIndex } from './nameIndex';
import { objectSpans } from './outline';

/** アウトライン(アウトラインビュー・パンくず・Ctrl+Shift+O)。項目はオブジェクトだけ */
export class DatDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
	provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
		return objectSpans(document.getText()).map((s) => {
			const range = new vscode.Range(s.startLine, 0, s.lastLine, document.lineAt(s.lastLine).text.length);
			const selection = s.name
				? new vscode.Range(s.name.line, s.name.valueStart, s.name.line, s.name.valueStart + s.name.value.length)
				: new vscode.Range(s.startLine, 0, s.startLine, 0);
			return new vscode.DocumentSymbol(s.name?.value ?? vscode.l10n.t('(no name)'), s.obj ?? '', vscode.SymbolKind.Object, range, selection);
		});
	}
}

/**
 * 折りたたみ。name= の行から区切り線の手前まで
 * VS Code はたたんだ範囲の1行目しか見せないので、name= より上の obj= やコメントは範囲に入れない
 */
export class DatFoldingRangeProvider implements vscode.FoldingRangeProvider {
	provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
		return objectSpans(document.getText())
			.filter((s) => s.name && s.lastLine > s.name.line)
			.map((s) => new vscode.FoldingRange(s.name!.line, s.lastLine));
	}
}

/** ワークスペース内の名前検索(Ctrl+T) */
export class DatWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
	constructor(private readonly index: NameIndex) {}

	async provideWorkspaceSymbols(query: string): Promise<vscode.SymbolInformation[]> {
		return (await this.index.allNameEntries())
			.filter((n) => matches(n.name, query))
			.map((n) => new vscode.SymbolInformation(n.name, vscode.SymbolKind.Object, n.obj, new vscode.Location(n.uri, new vscode.Range(n.line, n.start, n.line, n.end))));
	}
}

/** query の文字がこの順に含まれるか(大文字小文字は区別しない。細かい絞り込みと並べ替えは VS Code がする) */
function matches(name: string, query: string): boolean {
	const lower = name.toLowerCase();
	let i = 0;
	for (const c of query.toLowerCase()) {
		i = lower.indexOf(c, i);
		if (i < 0) {
			return false;
		}
		i += c.length;
	}
	return true;
}

/**
 * 名前の一括変更(name= の値の上で F2)
 * 参照先の種類が合う参照だけ書き換える。翻訳ファイルは書き換えない
 */
export class DatRenameProvider implements vscode.RenameProvider {
	constructor(private readonly index: NameIndex) {}

	prepareRename(document: vscode.TextDocument, position: vscode.Position): vscode.Range {
		const found = nameAt(document, position);
		if (!found) {
			throw new Error(vscode.l10n.t('Place the cursor on the value of name= to rename.'));
		}
		return found.range;
	}

	async provideRenameEdits(document: vscode.TextDocument, position: vscode.Position, newName: string): Promise<vscode.WorkspaceEdit | undefined> {
		const found = nameAt(document, position);
		if (!found) {
			return undefined;
		}
		if (newName === '' || /[\r\n]/.test(newName)) {
			throw new Error(vscode.l10n.t('The name cannot be empty or contain line breaks.'));
		}
		const edit = new vscode.WorkspaceEdit();
		edit.replace(document.uri, found.range, newName);
		for (const r of await this.index.references(found.name, found.obj)) {
			edit.replace(r.uri, new vscode.Range(r.line, r.start, r.line, r.end), newName);
		}
		return edit;
	}
}

/** カーソルの位置にある name= の値 */
function nameAt(document: vscode.TextDocument, position: vscode.Position): { range: vscode.Range; obj: string; name: string } | undefined {
	const n = extractNames(document.getText()).find((e) => e.line === position.line);
	if (!n) {
		return undefined;
	}
	const range = new vscode.Range(n.line, n.start, n.line, n.end);
	return range.contains(position) ? { range, obj: n.obj, name: n.name } : undefined;
}
