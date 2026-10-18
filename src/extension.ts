import * as vscode from 'vscode';
import { ImageEditorProvider } from './image/imageEditor';
import { PakEditorProvider } from './pak/pakEditor';
import { ImageHoverProvider, ImageLinkProvider } from './dat/imageLinks';
import { CHANGE_PAK_SIZE_COMMAND, changePakSize, TOGGLE_IMAGE_PREVIEW_COMMAND, toggleImagePreview } from './dat/settings';
import { NameIndex } from './dat/nameIndex';
import { DatDefinitionProvider, DatReferenceHoverProvider, DatReferenceProvider } from './dat/definition';

export function activate(context: vscode.ExtensionContext) {
	const nameIndex = new NameIndex();
	context.subscriptions.push(
		nameIndex,
		vscode.languages.registerDefinitionProvider({ language: 'simutrans-dat' }, new DatDefinitionProvider(nameIndex)),
		vscode.languages.registerHoverProvider({ language: 'simutrans-dat' }, new DatReferenceHoverProvider(nameIndex)),
		vscode.languages.registerReferenceProvider({ language: 'simutrans-dat' }, new DatReferenceProvider(nameIndex)),
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
		vscode.commands.registerCommand(TOGGLE_IMAGE_PREVIEW_COMMAND, toggleImagePreview)
	);
}

export function deactivate() {}
