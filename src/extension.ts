import * as vscode from 'vscode';
import { ImageEditorProvider } from './image/imageEditor';
import { PakEditorProvider } from './pak/pakEditor';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			ImageEditorProvider.viewType,
			new ImageEditorProvider(context.extensionUri),
			{ supportsMultipleEditorsPerDocument: true }
		),
		vscode.window.registerCustomEditorProvider(
			PakEditorProvider.viewType,
			new PakEditorProvider(context.extensionUri),
			{ supportsMultipleEditorsPerDocument: true }
		)
	);
}

export function deactivate() {}
