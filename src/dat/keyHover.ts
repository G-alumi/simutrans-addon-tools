import * as vscode from 'vscode';
import { describeValue } from './completion';
import { parseDat } from './datDocument';
import { findKeyDef, keyDescription } from './keys';

/** キーにマウスを乗せると、そのキーの説明と値の種類を出す */
export class DatKeyHoverProvider implements vscode.HoverProvider {
	provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
		const object = parseDat(document.getText()).find((o) => o.startLine <= position.line && position.line < o.endLine);
		const entry = object?.entries.find((e) => e.line === position.line);
		if (!entry || position.character >= entry.key.length) {
			return undefined;
		}
		const obj = object!.entries.find((e) => e.key === 'obj')?.value.trim();
		const def = findKeyDef(obj, entry.key);
		if (!def) {
			return undefined;
		}
		const markdown = new vscode.MarkdownString();
		const description = keyDescription(obj, def);
		if (description) {
			markdown.appendText(vscode.l10n.t(description));
			markdown.appendMarkdown('\n\n');
		}
		markdown.appendText(describeValue(def.value));
		return new vscode.Hover(markdown, new vscode.Range(entry.line, 0, entry.line, entry.key.length));
	}
}
