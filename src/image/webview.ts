import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import * as sc from '../shared/specialColors';

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** 画面のスクリプトで使う文言(VS Codeの表示言語に合わせて翻訳したもの) */
function webviewStrings(): Record<string, string> {
	return {
		copied: vscode.l10n.t('Copied to clipboard.'),
		copyFailed: vscode.l10n.t('Copy failed: {0}', '{0}'),
		openFailed: vscode.l10n.t('Failed to open the image.'),
		decodeFailed: vscode.l10n.t('The image could not be decoded (unsupported format or corrupted file).'),
		minimize: vscode.l10n.t('Minimize'),
		expand: vscode.l10n.t('Expand'),
	};
}

/** 特別表示で使う色の対応表(画面のスクリプトに渡す) */
function specialColorTables() {
	const main = sc.RGBTAB.slice(0, sc.PLAYER_COLOR_COUNT);
	const sub = sc.RGBTAB.slice(sc.PLAYER_COLOR_COUNT, sc.LIGHT_START);
	return {
		// プレイヤーカラー表示: [元の色, 表示する色]
		player: [
			...main.map((c, i) => [c, sc.PLAYER_PINK[i]]),
			...sub.map((c, i) => [c, sc.PLAYER_LIGHT_GREEN[i]]),
		],
		// 夜間表示: 発光色の [元の色, 夜の色]
		nightLights: sc.RGBTAB.slice(sc.LIGHT_START).map((c, i) => [c, sc.NIGHT_LIGHTS[i]]),
		nightMultiplier: sc.NIGHT_MULTIPLIER,
		transparentKey: sc.TRANSPARENT_KEY,
	};
}

export function getWebviewContent(webview: vscode.Webview, mediaUri: vscode.Uri, fileName: string): string {
	const nonce = randomBytes(16).toString('base64');
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'viewer.js'));
	const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, 'viewer.css'));
	// </script> で途切れないよう < をエスケープして埋め込む
	const strings = JSON.stringify(webviewStrings()).replace(/</g, '\\u003c');
	const colors = JSON.stringify(specialColorTables());
	const t = (s: string) => escapeHtml(vscode.l10n.t(s));

	return `<!DOCTYPE html>
<html lang="${escapeHtml(vscode.env.language)}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src blob:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fileName)}</title>
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="container">
    <canvas id="canvas"></canvas>
  </div>
  <div id="message" role="alert"></div>
  <div id="overlay">
    <table>
      <tr><td>${t('File name')}</td><td id="ov-filename"></td></tr>
      <tr><td>${t('Format')}</td><td id="ov-format"></td></tr>
      <tr><td>${t('File size')}</td><td id="ov-filesize"></td></tr>
      <tr><td>${t('Width')}</td><td id="ov-width"></td></tr>
      <tr><td>${t('Height')}</td><td id="ov-height"></td></tr>
    </table>
  </div>
  <div id="context-menu" role="menu" tabindex="-1">
    <button id="copy-btn" role="menuitem" tabindex="-1">${t('Copy to clipboard')}</button>
  </div>
  <div id="special-panel">
    <div id="special-header">
      <span id="special-title">${t('Simutrans display')}</span>
      <button id="special-toggle" aria-expanded="true" title="${t('Minimize')}" aria-label="${t('Minimize')}">&#x2212;</button>
    </div>
    <div id="special-body">
      <label><input type="checkbox" id="opt-player"> ${t('Player colors')}</label>
      <label><input type="checkbox" id="opt-night"> ${t('Night mode')}</label>
    </div>
  </div>
  <div id="toast" role="status"></div>
  <script type="application/json" id="l10n">${strings}</script>
  <script type="application/json" id="special-colors">${colors}</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
