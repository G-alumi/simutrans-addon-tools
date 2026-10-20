import * as vscode from 'vscode';
import { parseDat } from './datDocument';
import { CLIMATES, findKeyDef, hasPlaceholder, KeyDef, keyDescription, KeyValue, keyLabel, keysOf, keySnippet } from './keys';
import { NameIndex } from './nameIndex';
import { getIgnoredReferenceNames } from './settings';

/** 補完の一覧やホバーに出す、値の種類の説明 */
export function describeValue(value: KeyValue): string {
	if (typeof value === 'object') {
		return 'ref' in value ? vscode.l10n.t('Name of {0}', `obj=${value.ref}`) : value.words.join(' | ');
	}
	switch (value) {
		case 'number': return vscode.l10n.t('Integer');
		case 'float': return vscode.l10n.t('Decimal');
		case 'bool': return vscode.l10n.t('0 or 1');
		case 'string': return vscode.l10n.t('Text');
		case 'image': return vscode.l10n.t('Image');
		case 'coord': return vscode.l10n.t('Coordinates (x,y)');
		case 'numbers': return vscode.l10n.t('Integers separated by commas');
		case 'climates': return vscode.l10n.t('Climates');
		case 'sound': return vscode.l10n.t('Sound number or file name');
	}
}

/**
 * datの補完
 * - キーの位置(= より前): そのオブジェクトの obj= の種類のキー
 * - 値の位置(= より後): obj= の種類、決まった語、参照先の名前(ワークスペースの name= と diagnostics.ignoreReferences)
 */
export class DatCompletionProvider implements vscode.CompletionItemProvider {
	static readonly triggerCharacters = ['=', ','];

	constructor(private readonly index: NameIndex) {}

	async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken, context: vscode.CompletionContext): Promise<vscode.CompletionItem[] | undefined> {
		const line = document.lineAt(position.line).text;
		// makeobj が読み飛ばす行(コメント・空白始まり)と区切り線
		if (/^[# -]/.test(line)) {
			return undefined;
		}
		const object = parseDat(document.getText()).find((o) => o.startLine <= position.line && position.line < o.endLine);
		const others = object?.entries.filter((e) => e.line !== position.line) ?? [];
		const obj = others.find((e) => e.key === 'obj')?.value.trim();
		const eq = line.indexOf('=');
		if (eq < 0 || position.character <= eq) {
			return this.keyItems(obj, new Set(others.map((e) => e.key)), position, eq < 0 ? position.character : eq, eq < 0);
		}
		const items = await this.valueItems(document, obj, line.slice(0, eq).trimEnd().toLowerCase(), line, eq, position);
		// , で出すのは気候の一覧だけ
		return context.triggerCharacter === ',' && items?.[0]?.kind !== vscode.CompletionItemKind.Value ? undefined : items;
	}

	private keyItems(obj: string | undefined, written: Set<string>, position: vscode.Position, end: number, withEquals: boolean): vscode.CompletionItem[] {
		const range = new vscode.Range(position.line, 0, position.line, end);
		return keysOf(obj)
			// 添字の無いキーは1つのオブジェクトに1回だけ書く
			.filter((def) => hasPlaceholder(def) || !written.has(def.key))
			.map((def, i) => {
				const item = new vscode.CompletionItem(keyLabel(def), vscode.CompletionItemKind.Property);
				item.insertText = new vscode.SnippetString(keySnippet(def) + (withEquals ? '=' : ''));
				item.detail = describeValue(def.value);
				const description = keyDescription(obj, def);
				if (description) {
					item.documentation = vscode.l10n.t(description);
				}
				item.range = range;
				// キー一覧の順に並べる
				item.sortText = String(i).padStart(4, '0');
				return item;
			});
	}

	private async valueItems(document: vscode.TextDocument, obj: string | undefined, key: string, line: string, eq: number, position: vscode.Position): Promise<vscode.CompletionItem[] | undefined> {
		const def: KeyDef | undefined = findKeyDef(obj, key);
		if (!def || typeof def.value !== 'object' && def.value !== 'climates') {
			return undefined;
		}
		if (def.value === 'climates') {
			// , か空白で区切った今の語だけを置き換える
			const before = line.slice(0, position.character);
			const start = Math.max(eq + 1, before.search(/[^, ]*$/));
			const range = new vscode.Range(position.line, start, position.line, position.character);
			return CLIMATES.map((w) => withRange(new vscode.CompletionItem(w, vscode.CompletionItemKind.Value), range));
		}
		const range = new vscode.Range(position.line, eq + 1, position.line, line.length);
		if ('words' in def.value) {
			const kind = def.key === 'obj' ? vscode.CompletionItemKind.Class : vscode.CompletionItemKind.EnumMember;
			return def.value.words.map((w) => withRange(new vscode.CompletionItem(w, kind), range));
		}
		const target = def.value.ref;
		const items = (def.value.special ?? []).map((w) => withRange(new vscode.CompletionItem(w, vscode.CompletionItemKind.Keyword), range));
		const names = new Set([...await this.index.namesOf(target), ...getIgnoredReferenceNames(document, target)]);
		for (const name of names) {
			const item = withRange(new vscode.CompletionItem(name, vscode.CompletionItemKind.Reference), range);
			item.detail = `obj=${target}`;
			items.push(item);
		}
		return items;
	}
}

function withRange(item: vscode.CompletionItem, range: vscode.Range): vscode.CompletionItem {
	item.range = range;
	return item;
}
