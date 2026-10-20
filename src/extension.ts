import * as vscode from 'vscode';
import { ImageEditorProvider } from './image/imageEditor';
import { PakEditorProvider } from './pak/pakEditor';
import { ImageHoverProvider, ImageLinkProvider } from './dat/imageLinks';
import { ADD_TO_IGNORE_LIST_COMMAND, addToIgnoreList, CHANGE_PAK_SIZE_COMMAND, changePakSize, TOGGLE_IMAGE_PREVIEW_COMMAND, toggleImagePreview } from './dat/settings';
import { NameIndex } from './dat/nameIndex';
import { DatDefinitionProvider, DatReferenceHoverProvider, DatReferenceProvider } from './dat/definition';
import { DatCompletionProvider } from './dat/completion';
import { DatKeyHoverProvider } from './dat/keyHover';
import { DatCodeActionProvider, DatDiagnostics } from './dat/diagnostics';
import { DatDocumentSymbolProvider, DatFoldingRangeProvider, DatRenameProvider, DatWorkspaceSymbolProvider } from './dat/symbols';

export function activate(context: vscode.ExtensionContext) {
	const nameIndex = new NameIndex();
	context.subscriptions.push(
		nameIndex,
		vscode.languages.registerDefinitionProvider({ language: 'simutrans-dat' }, new DatDefinitionProvider(nameIndex)),
		vscode.languages.registerHoverProvider({ language: 'simutrans-dat' }, new DatReferenceHoverProvider(nameIndex)),
		vscode.languages.registerReferenceProvider({ language: 'simutrans-dat' }, new DatReferenceProvider(nameIndex)),
		vscode.languages.registerHoverProvider({ language: 'simutrans-dat' }, new DatKeyHoverProvider()),
		vscode.languages.registerCompletionItemProvider({ language: 'simutrans-dat' }, new DatCompletionProvider(nameIndex), ...DatCompletionProvider.triggerCharacters),
		new DatDiagnostics(nameIndex),
		vscode.languages.registerDocumentSymbolProvider({ language: 'simutrans-dat' }, new DatDocumentSymbolProvider()),
		vscode.languages.registerFoldingRangeProvider({ language: 'simutrans-dat' }, new DatFoldingRangeProvider()),
		vscode.languages.registerWorkspaceSymbolProvider(new DatWorkspaceSymbolProvider(nameIndex)),
		vscode.languages.registerRenameProvider({ language: 'simutrans-dat' }, new DatRenameProvider(nameIndex)),
		vscode.languages.registerCodeActionsProvider({ language: 'simutrans-dat' }, new DatCodeActionProvider(), { providedCodeActionKinds: DatCodeActionProvider.providedCodeActionKinds }),
		vscode.window.registerCustomEditorProvider(
			ImageEditorProvider.viewType,
			new ImageEditorProvider(context.extensionUri),
			{ supportsMultipleEditorsPerDocument: true }
		),
		vscode.window.registerCustomEditorProvider(
			PakEditorProvider.viewType,
			new PakEditorProvider(context.extensionUri),
			{ supportsMultipleEditorsPerDocument: true }
		),
		vscode.languages.registerDocumentLinkProvider({ language: 'simutrans-dat' }, new ImageLinkProvider()),
		vscode.languages.registerHoverProvider({ language: 'simutrans-dat' }, new ImageHoverProvider()),
		// ホバーの「pakサイズを変更」から呼ばれる
		vscode.commands.registerCommand(CHANGE_PAK_SIZE_COMMAND, changePakSize),
		vscode.commands.registerCommand(TOGGLE_IMAGE_PREVIEW_COMMAND, toggleImagePreview),
		// クイックフィックスの「無視リストに追加」から呼ばれる
		vscode.commands.registerCommand(ADD_TO_IGNORE_LIST_COMMAND, addToIgnoreList)
	);
}

export function deactivate() {}
