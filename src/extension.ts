import * as vscode from 'vscode';
import { ImageEditorProvider } from './image/imageEditor';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			ImageEditorProvider.viewType,
			new ImageEditorProvider(context.extensionUri),
			{ supportsMultipleEditorsPerDocument: true }
		)
	);

	// エクスプローラーの右クリックメニューからも開けるようにする
	context.subscriptions.push(
		vscode.commands.registerCommand('simutrans-addon-tools.openImage', (uri?: vscode.Uri) => {
			if (!uri) {
				vscode.window.showErrorMessage(vscode.l10n.t('Please select an image file.'));
				return;
			}
			vscode.commands.executeCommand('vscode.openWith', uri, ImageEditorProvider.viewType);
		})
	);
}

export function deactivate() {}
