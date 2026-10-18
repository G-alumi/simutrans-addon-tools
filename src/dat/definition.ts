import * as vscode from 'vscode';
import { extractNames, parseDat } from './datDocument';
import { NameIndex } from './nameIndex';
import { isReferencedType, referenceTarget } from './references';

/** カーソルの位置にある参照(freight= や constraint[prev][0]= などの値) */
function findReferenceAt(document: vscode.TextDocument, position: vscode.Position): { range: vscode.Range; obj: string; name: string } | undefined {
	for (const object of parseDat(document.getText())) {
		const entry = object.entries.find((e) => e.line === position.line);
		if (!entry) {
			continue;
		}
		const obj = referenceTarget(entry.key, entry.value);
		const range = new vscode.Range(entry.line, entry.valueStart, entry.line, entry.valueStart + entry.value.length);
		return obj && range.contains(position) ? { range, obj, name: entry.value } : undefined;
	}
	return undefined;
}

/** カーソルの位置にある名前。参照の値か、参照される種類のオブジェクトの name= の値 */
function findSymbolAt(document: vscode.TextDocument, position: vscode.Position): { range: vscode.Range; obj: string; name: string } | undefined {
	const ref = findReferenceAt(document, position);
	if (ref) {
		return ref;
	}
	const n = extractNames(document.getText()).find((e) => e.line === position.line);
	if (!n || !isReferencedType(n.obj)) {
		return undefined;
	}
	const range = new vscode.Range(n.line, n.start, n.line, n.end);
	return range.contains(position) ? { range, obj: n.obj, name: n.name } : undefined;
}

/** 参照の値から、その名前の name= へ移動する */
export class DatDefinitionProvider implements vscode.DefinitionProvider {
	constructor(private readonly index: NameIndex) {}

	async provideDefinition(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.LocationLink[] | undefined> {
		const ref = findReferenceAt(document, position);
		if (!ref) {
			// name= の値では自分自身を返す。今いる場所が定義だと、VS Code は代わりに参照元の一覧を出す
			// (editor.gotoLocation.alternativeDefinitionCommand)
			const symbol = findSymbolAt(document, position);
			return symbol && [{ originSelectionRange: symbol.range, targetUri: document.uri, targetRange: symbol.range, targetSelectionRange: symbol.range }];
		}
		return (await this.index.lookup(ref.name, ref.obj)).map((n) => {
			const target = new vscode.Range(n.line, n.start, n.line, n.end);
			return { originSelectionRange: ref.range, targetUri: n.uri, targetRange: target, targetSelectionRange: target };
		});
	}
}

/** 参照の値にマウスを乗せると、移動先のファイルと行を出す */
export class DatReferenceHoverProvider implements vscode.HoverProvider {
	constructor(private readonly index: NameIndex) {}

	async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
		const ref = findReferenceAt(document, position);
		if (!ref) {
			return undefined;
		}
		const found = await this.index.lookup(ref.name, ref.obj);
		const markdown = new vscode.MarkdownString();
		// 種類と名前をdatの書き方でコードの枠に出す(datと同じ色分けになる)
		markdown.appendCodeblock(`obj=${ref.obj}\nname=${ref.name}`, 'simutrans-dat');
		if (found.length === 0) {
			markdown.appendText(vscode.l10n.t('Not found in the workspace.'));
		}
		for (const n of found) {
			// #L行 を付けると、その行を開く
			const uri = n.uri.with({ fragment: `L${n.line + 1}` });
			const label = `${vscode.workspace.asRelativePath(n.uri)}:${n.line + 1}`.replace(/[\\[\]]/g, '\\$&');
			markdown.appendMarkdown(`- [${label}](${uri.toString()})\n`);
		}
		return new vscode.Hover(markdown, ref.range);
	}
}

/** 名前を参照しているところの一覧(Shift+F12 など) */
export class DatReferenceProvider implements vscode.ReferenceProvider {
	constructor(private readonly index: NameIndex) {}

	async provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext): Promise<vscode.Location[] | undefined> {
		const symbol = findSymbolAt(document, position);
		if (!symbol) {
			return undefined;
		}
		const locations = (await this.index.references(symbol.name, symbol.obj))
			.map((r) => new vscode.Location(r.uri, new vscode.Range(r.line, r.start, r.line, r.end)));
		if (context.includeDeclaration) {
			const names = await this.index.lookup(symbol.name, symbol.obj);
			locations.unshift(...names.map((n) => new vscode.Location(n.uri, new vscode.Range(n.line, n.start, n.line, n.end))));
		}
		return locations;
	}
}
