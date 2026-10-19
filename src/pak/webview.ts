import * as vscode from 'vscode';
import { randomBytes } from 'crypto';

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** 画面のスクリプトで使う文言(VS Codeの表示言語に合わせて翻訳したもの) */
function webviewStrings(): Record<string, string> {
	return {
		openFailed: vscode.l10n.t('Failed to open the pak file.'),
		properties: vscode.l10n.t('Properties'),
		image: vscode.l10n.t('Image'),
		children: vscode.l10n.t('Children'),
		noFields: vscode.l10n.t('(no fields)'),
		name: vscode.l10n.t('Name'),
		value: vscode.l10n.t('Value'),
		type: vscode.l10n.t('Type'),
		kind: vscode.l10n.t('Kind'),
		zoom: vscode.l10n.t('Zoom'),
		imagePreview: vscode.l10n.t('Image preview (right-click or Shift+F10 to copy)'),
		copyName: vscode.l10n.t('Copy Name'),
		copyValue: vscode.l10n.t('Copy Value'),
		copyNameAndValue: vscode.l10n.t('Copy Name and Value'),
		open: vscode.l10n.t('Open'),
		copyImage: vscode.l10n.t('Copy Filled with Transparent Color'),
		copyTransparent: vscode.l10n.t('Copy with Transparency'),
		copied: vscode.l10n.t('Copied: {0}', '{0}'),
		imageCopied: vscode.l10n.t('Copied the image.'),
		copyFailed: vscode.l10n.t('Copy failed: {0}', '{0}'),
	};
}

export function getWebviewContent(webview: vscode.Webview, mediaUri: vscode.Uri, fileName: string): string {
	const nonce = randomBytes(16).toString('base64');
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'viewer.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'viewer.css'));
	// </script> で途切れないよう < をエスケープして埋め込む
	const strings = JSON.stringify(webviewStrings()).replace(/</g, '\\u003c');
	const structure = escapeHtml(vscode.l10n.t('pak structure'));

	return `<!DOCTYPE html>
<html lang="${escapeHtml(vscode.env.language)}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fileName)}</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <nav id="tree-pane" aria-label="${structure}">
    <div id="tree" role="tree" aria-label="${structure}"></div>
  </nav>
  <main id="detail-pane">
    <div id="detail-title"></div>
    <div id="detail-body"></div>
  </main>
  <div id="message" role="alert"></div>
  <div id="menu" role="menu" tabindex="-1"></div>
  <div id="toast" role="status" aria-live="polite"></div>
  <script type="application/json" id="l10n">${strings}</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
