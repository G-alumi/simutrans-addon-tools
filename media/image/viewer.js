// @ts-check
// 画像ビュワーの画面側スクリプト
// - 画像は拡張機能からバイト列(PNGなど)またはRGBA(APD)で受け取る
// - canvasは表示領域と同じ大きさに固定し、見えている範囲だけをドットバイドットで描く
// - Simutrans表示(プレイヤーカラー・夜間)は表示だけを変える。コピーされるのは元の画像

// @ts-ignore acquireVsCodeApi はWebviewで用意される
const vscode = acquireVsCodeApi();
const L10N = JSON.parse(/** @type {HTMLElement} */ (document.getElementById('l10n')).textContent || '{}');

const container = /** @type {HTMLElement} */ (document.getElementById('container'));
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('canvas'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
const messageEl = /** @type {HTMLElement} */ (document.getElementById('message'));

/** 元の画像(コピーにはこれを使う) @type {ImageBitmap | null} */
let bitmap = null;
/** Simutrans表示を反映した画像。表示を変えていないときは null @type {ImageBitmap | null} */
let shown = null;
/** 元の画像のピクセル。Simutrans表示を初めて使うときに取り出す @type {ImageData | null} */
let sourceData = null;
let fileInfo = {};

// 表示状態: 倍率と、画像の中心の表示領域の中心からのずれ(CSSピクセル)
let scale = 1;
let tx = 0;
let ty = 0;

// ======================================================================
// 読み込み
// ======================================================================
window.addEventListener('message', async (event) => {
  const msg = event.data;
  if (msg.type === 'load') {
    fileInfo = msg.fileInfo;
    try {
      bitmap = await decode(msg.image);
      sourceData = msg.image.kind === 'rgba' ? new ImageData(toClamped(msg.image.pixels), msg.image.width, msg.image.height) : null;
      await updateShown();
    } catch (err) {
      vscode.postMessage({ type: 'decodeFailed', message: `${L10N.decodeFailed}\n${err instanceof Error ? err.message : err}` });
      return;
    }
    showMessage('');
    updateOverlay();
    vscode.postMessage({ type: 'loaded', width: bitmap.width, height: bitmap.height });
    requestDraw();
  } else if (msg.type === 'error') {
    showMessage(`${L10N.openFailed}\n${msg.message}`);
  }
});

/** 色の値を変えずに(色空間の変換やアルファの乗算をせずに)ビットマップにする */
const BITMAP_OPTIONS = /** @type {ImageBitmapOptions} */ ({ premultiplyAlpha: 'none', colorSpaceConversion: 'none' });

function toClamped(pixels) {
  return new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength);
}

async function decode(image) {
  if (image.kind === 'rgba') {
    return createImageBitmap(new ImageData(toClamped(image.pixels), image.width, image.height), BITMAP_OPTIONS);
  }
  const blob = new Blob([image.bytes], { type: image.mime });
  if (image.mime !== 'image/svg+xml') {
    return createImageBitmap(blob, BITMAP_OPTIONS);
  }
  // SVGは createImageBitmap(blob) で読めないので、img要素を経由する
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.classList.toggle('show', text !== '');
}

// ======================================================================
// 描画
// ======================================================================
let drawRequested = false;

/** 描画は1フレームに1回にまとめる */
function requestDraw() {
  if (drawRequested) { return; }
  drawRequested = true;
  requestAnimationFrame(() => {
    drawRequested = false;
    draw();
  });
}

/** 画像の左上の位置と、1ドットの大きさ(どちらもcanvasのピクセル単位) */
function layout() {
  const dpr = window.devicePixelRatio || 1;
  const s = scale * dpr;
  const w = bitmap ? bitmap.width : 0;
  const h = bitmap ? bitmap.height : 0;
  return {
    s,
    ox: Math.round(canvas.width / 2 + tx * dpr - (w * s) / 2),
    oy: Math.round(canvas.height / 2 + ty * dpr - (h * s) / 2),
  };
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  updateScaleLabel();
  if (!bitmap) { return; }
  const { s, ox, oy } = layout();

  // 見えている範囲(画像のピクセル単位)
  const x0 = Math.max(0, Math.floor(-ox / s));
  const y0 = Math.max(0, Math.floor(-oy / s));
  const x1 = Math.min(bitmap.width, Math.ceil((canvas.width - ox) / s));
  const y1 = Math.min(bitmap.height, Math.ceil((canvas.height - oy) / s));
  if (x1 <= x0 || y1 <= y0) { return; }

  // 拡大はドットバイドット、縮小は滑らかに
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(shown ?? bitmap, x0, y0, x1 - x0, y1 - y0, ox + x0 * s, oy + y0 * s, (x1 - x0) * s, (y1 - y0) * s);

  // 8倍以上ではマスの境界線を、見えているマスの分だけ引く
  if (scale >= 8) {
    ctx.fillStyle = 'rgba(128, 128, 128, 0.5)';
    const top = oy + y0 * s;
    const left = ox + x0 * s;
    const height = (y1 - y0) * s;
    const width = (x1 - x0) * s;
    for (let x = x0; x < x1; x++) {
      ctx.fillRect(Math.round(ox + (x + 1) * s) - 1, top, 1, height);
    }
    for (let y = y0; y < y1; y++) {
      ctx.fillRect(left, Math.round(oy + (y + 1) * s) - 1, width, 1);
    }
  }
}

/** VS Codeのステータスバーに出す倍率・マウス位置を拡張機能に送る */
let statusCoord = '';
function postStatus() {
  vscode.postMessage({ type: 'status', zoom: `${Math.round(scale * 100)}%`, coord: statusCoord });
}

function updateScaleLabel() {
  postStatus();
}

// 表示領域の大きさが変わったらcanvasの大きさを合わせる
new ResizeObserver(() => {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(container.clientWidth * dpr);
  canvas.height = Math.round(container.clientHeight * dpr);
  draw();
}).observe(container);

// ======================================================================
// 拡大縮小・移動
// ======================================================================
function nextScale(current, zoomIn) {
  if (zoomIn) {
    if (current < 1) { return Math.min(1, Math.round(current / 0.25) * 0.25 + 0.25); }
    return Math.min(12, Math.floor(current) + 1);
  } else {
    if (current > 1) { return Math.max(1, Math.ceil(current) - 1); }
    return Math.max(0.25, Math.round(current / 0.25) * 0.25 - 0.25);
  }
}

// ホイールで拡大縮小(マウスの位置を基準にする)
container.addEventListener('wheel', (e) => {
  e.preventDefault();
  const prevScale = scale;
  scale = nextScale(scale, e.deltaY < 0);
  const ratio = scale / prevScale;
  const rect = container.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  tx = (e.clientX - cx) * (1 - ratio) + ratio * tx;
  ty = (e.clientY - cy) * (1 - ratio) + ratio * ty;
  requestDraw();
}, { passive: false });

// ドラッグで移動
let isPanning = false;
let startX = 0;
let startY = 0;

container.addEventListener('mousedown', (e) => {
  if (e.button === 2) { return; }
  e.preventDefault();
  isPanning = true;
  startX = e.clientX - tx;
  startY = e.clientY - ty;
  container.classList.add('panning');
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 2) { return; }
  isPanning = false;
  container.classList.remove('panning');
});

document.addEventListener('mouseleave', () => {
  isPanning = false;
  container.classList.remove('panning');
  if (statusCoord) {
    statusCoord = '';
    postStatus();
  }
});

// マウス移動: 移動 & 座標表示
window.addEventListener('mousemove', (e) => {
  if (isPanning) {
    tx = e.clientX - startX;
    ty = e.clientY - startY;
    requestDraw();
  }
  if (!bitmap) { return; }
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const { s, ox, oy } = layout();
  const imgX = Math.floor(((e.clientX - rect.left) * dpr - ox) / s);
  const imgY = Math.floor(((e.clientY - rect.top) * dpr - oy) / s);
  const coord = (imgX >= 0 && imgX < bitmap.width && imgY >= 0 && imgY < bitmap.height) ? `${imgX}, ${imgY}` : '';
  if (coord !== statusCoord) {
    statusCoord = coord;
    postStatus();
  }
});

// ダブルクリックで元に戻す
container.addEventListener('dblclick', () => {
  scale = 1;
  tx = 0;
  ty = 0;
  requestDraw();
});

// ======================================================================
// Simutrans表示(左下のパネル)
// ======================================================================
const COLORS = JSON.parse(/** @type {HTMLElement} */ (document.getElementById('special-colors')).textContent || '{}');
const PLAYER_MAP = new Map(COLORS.player);
const NIGHT_LIGHT_MAP = new Map(COLORS.nightLights);

const specialPanel = /** @type {HTMLElement} */ (document.getElementById('special-panel'));
const specialToggle = /** @type {HTMLButtonElement} */ (document.getElementById('special-toggle'));
const optPlayer = /** @type {HTMLInputElement} */ (document.getElementById('opt-player'));
const optNight = /** @type {HTMLInputElement} */ (document.getElementById('opt-night'));

// タブを切り替えて画面が作り直されても設定が残るようにする
const savedState = vscode.getState() || {};
optPlayer.checked = !!savedState.player;
optNight.checked = !!savedState.night;
setCollapsed(!!savedState.collapsed);

function saveState() {
  vscode.setState({ player: optPlayer.checked, night: optNight.checked, collapsed: specialPanel.classList.contains('collapsed') });
}

function setCollapsed(collapsed) {
  specialPanel.classList.toggle('collapsed', collapsed);
  specialToggle.setAttribute('aria-expanded', String(!collapsed));
  specialToggle.textContent = collapsed ? '+' : '−';
  specialToggle.title = collapsed ? L10N.expand : L10N.minimize;
  specialToggle.setAttribute('aria-label', specialToggle.title);
}

specialToggle.addEventListener('click', () => {
  setCollapsed(!specialPanel.classList.contains('collapsed'));
  saveState();
});

for (const opt of [optPlayer, optNight]) {
  opt.addEventListener('change', async () => {
    saveState();
    await updateShown();
    requestDraw();
  });
}

// 設定を素早く切り替えたとき、古い結果で上書きしないための番号
let shownGeneration = 0;

/** 現在の設定で表示用の画像を作り直す */
async function updateShown() {
  const generation = ++shownGeneration;
  if (!bitmap || (!optPlayer.checked && !optNight.checked)) {
    shown = null;
    return;
  }
  if (!sourceData) {
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const c2d = /** @type {OffscreenCanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));
    c2d.drawImage(bitmap, 0, 0);
    sourceData = c2d.getImageData(0, 0, bitmap.width, bitmap.height);
  }
  const result = await createImageBitmap(applySimutransColors(sourceData, optPlayer.checked, optNight.checked), BITMAP_OPTIONS);
  if (generation === shownGeneration) { shown = result; }
}

/**
 * 特別色の表示を反映したピクセルを作る
 * - プレイヤーカラー: メインをピンク系、サブをライトグリーン系に置き換える(夜間でも暗くしない)
 * - 夜間: 発光色はゲームの夜の色に、それ以外はゲームの一番暗い夜と同じ倍率で暗くする
 * - 透明部分と透明色(#E7FFFF)はそのまま
 */
function applySimutransColors(src, player, night) {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const d = out.data;
  const { rg, b: bm } = COLORS.nightMultiplier;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) { continue; }
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    if (key === COLORS.transparentKey) { continue; }
    let to = player ? PLAYER_MAP.get(key) : undefined;
    if (to === undefined && night) {
      to = NIGHT_LIGHT_MAP.get(key);
      if (to === undefined) {
        d[i] = (d[i] * rg) | 0;
        d[i + 1] = (d[i + 1] * rg) | 0;
        d[i + 2] = (d[i + 2] * bm) | 0;
        continue;
      }
    }
    if (to !== undefined) {
      d[i] = to >> 16;
      d[i + 1] = (to >> 8) & 0xFF;
      d[i + 2] = to & 0xFF;
    }
  }
  return out;
}

// ======================================================================
// ファイル情報(Iキー)
// ======================================================================
const overlay = /** @type {HTMLElement} */ (document.getElementById('overlay'));

function formatBytes(bytes) {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function setText(id, text) {
  /** @type {HTMLElement} */ (document.getElementById(id)).textContent = text;
}

function updateOverlay() {
  setText('ov-filename', fileInfo.fileName ?? '');
  setText('ov-format', fileInfo.format ?? '');
  setText('ov-filesize', fileInfo.fileSize !== undefined ? formatBytes(fileInfo.fileSize) : '');
  setText('ov-width', bitmap ? `${bitmap.width} px` : '');
  setText('ov-height', bitmap ? `${bitmap.height} px` : '');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeMenu(); }
  // メニューを開いた状態で↑↓を押したら項目を選択する
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && contextMenu.style.display === 'block') { copyBtn.focus(); e.preventDefault(); }
  if ((e.key === 'i' || e.key === 'I') && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const visible = overlay.style.display === 'block';
    overlay.style.display = visible ? 'none' : 'block';
    if (!visible) { updateOverlay(); }
  }
});

// ======================================================================
// 右クリックメニュー
// ======================================================================
const contextMenu = /** @type {HTMLElement} */ (document.getElementById('context-menu'));
const copyBtn = /** @type {HTMLButtonElement} */ (document.getElementById('copy-btn'));

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!bitmap) { return; }
  contextMenu.style.display = 'block';
  // 画面からはみ出さないように位置を調整
  const r = contextMenu.getBoundingClientRect();
  contextMenu.style.left = `${Math.min(e.clientX, window.innerWidth - r.width - 4)}px`;
  contextMenu.style.top = `${Math.min(e.clientY, window.innerHeight - r.height - 4)}px`;
  // キーボード(Shift+F10など)で開いたときだけ項目を選択状態にする。マウスのときはメニュー自体にフォーカスし、何も選択しない
  const byKeyboard = e.button !== 2 || (e.clientX === 0 && e.clientY === 0);
  (byKeyboard ? copyBtn : contextMenu).focus();
});

function closeMenu() {
  contextMenu.style.display = 'none';
}

// メニューの外を押したときだけ閉じる(メニュー内で閉じるとボタンのclickが発生しない)
window.addEventListener('mousedown', (e) => {
  if (!contextMenu.contains(/** @type {Node} */ (e.target))) { closeMenu(); }
}, true);

copyBtn.addEventListener('click', () => {
  closeMenu();
  copyImage();
});

function copyImage() {
  if (!bitmap) { return; }
  const c = new OffscreenCanvas(bitmap.width, bitmap.height);
  /** @type {OffscreenCanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(bitmap, 0, 0);
  // クリックの直後に書き込みを始める必要があるので、PNGへの変換はPromiseのまま渡す
  navigator.clipboard.write([new ClipboardItem({ 'image/png': c.convertToBlob({ type: 'image/png' }) })])
    .then(() => showToast(L10N.copied, false))
    .catch((err) => showToast(L10N.copyFailed.replace('{0}', err instanceof Error ? err.message : String(err)), true));
}

// ======================================================================
// 通知
// ======================================================================
const toast = /** @type {HTMLElement} */ (document.getElementById('toast'));
let toastTimer = 0;

function showToast(text, isError) {
  toast.textContent = text;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), isError ? 4000 : 1500);
}

// 準備ができたことを拡張機能に知らせる(これを受けて画像が送られてくる)
vscode.postMessage({ type: 'ready' });
