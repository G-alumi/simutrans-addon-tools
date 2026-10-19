// @ts-check
// pakビュワーの画面側スクリプト(mock/pak-viewer/index.html を元にしたもの)
// - ノードの木は拡張機能から受け取る。画像のピクセルは大きいので、表示やコピーで必要になったときに要求する
// - 左のツリーで選んだノードの「自分のプロパティ + 画像 + 直下の子の一覧」を右に出す

// @ts-ignore acquireVsCodeApi はWebviewで用意される
const vscode = acquireVsCodeApi();
const L10N = JSON.parse(/** @type {HTMLElement} */ (document.getElementById('l10n')).textContent || '{}');

const TRANSPARENT_COLOR = 0xE7FFFF;
/** 画面側に残しておく画像の数(大きいpakでは全部の画像を持つと数百MBになる) */
const IMAGE_CACHE_SIZE = 500;

/**
 * @typedef {{ id: number, badge: string, label: string, fields: [string, string, string][], note?: string,
 *   image?: { width: number, height: number }, children: ViewNode[], parent?: ViewNode | null }} ViewNode
 * @typedef {{ width: number, height: number, rgba: Uint8ClampedArray }} Img
 */

/** @type {ViewNode | null} */
let root = null;
/** 通し番号 → ノード @type {ViewNode[]} */
let byId = [];
/** @type {Set<number>} */
let expanded = new Set();
/** フォーカス中 = 選択中のノード(選択はフォーカスに追従) @type {ViewNode} */
let current;
let zoom = 2;

const treeEl = /** @type {HTMLElement} */ (document.getElementById('tree'));
const titleEl = /** @type {HTMLElement} */ (document.getElementById('detail-title'));
const bodyEl = /** @type {HTMLElement} */ (document.getElementById('detail-body'));
const messageEl = /** @type {HTMLElement} */ (document.getElementById('message'));

// ======================================================================
// 読み込み
// ======================================================================
window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'load':
      showMessage('');
      setTree(msg.tree);
      break;
    case 'error':
      showMessage(`${L10N.openFailed}\n${msg.message}`);
      break;
    case 'images':
      for (const img of msg.images) { receiveImage(img); }
      break;
  }
});

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.classList.toggle('show', text !== '');
}

/** @param {ViewNode} tree */
function setTree(tree) {
  root = tree;
  byId = [];
  (function link(node, parent) {
    node.parent = parent;
    byId[node.id] = node;
    node.children.forEach((c) => link(c, node));
  })(tree, null);
  imageCache.clear();

  // タブを切り替えて画面が作り直されても、開いていたノードと選択を残す
  const saved = vscode.getState() || {};
  expanded = new Set((saved.expanded || [root.id]).filter((id) => byId[id]));
  current = byId[saved.current] || root;
  zoom = saved.zoom || zoom;
  renderTree();
  renderDetail();
  focusTreeItem();
}

function saveState() {
  vscode.setState({ expanded: [...expanded], current: current.id, zoom });
}

// ======================================================================
// 画像(拡張機能に要求して受け取る)
// ======================================================================
/** 通し番号 → 画像。古いものから捨てる @type {Map<number, Img | null>} */
const imageCache = new Map();
/** 届くのを待っている処理 @type {Map<number, ((img: Img | null) => void)[]>} */
const waiting = new Map();
/** @type {number[]} */
let toRequest = [];

/**
 * @param {number} id
 * @returns {Promise<Img | null>}
 */
function getImage(id) {
  const cached = imageCache.get(id);
  if (cached !== undefined) { return Promise.resolve(cached); }
  return new Promise((resolve) => {
    const list = waiting.get(id);
    if (list) { list.push(resolve); return; }
    waiting.set(id, [resolve]);
    // 同じタイミングで要求されたものはまとめて送る
    if (toRequest.length === 0) {
      queueMicrotask(() => {
        vscode.postMessage({ type: 'getImages', ids: toRequest });
        toRequest = [];
      });
    }
    toRequest.push(id);
  });
}

function receiveImage({ id, width, height, rgba }) {
  const img = rgba ? { width, height, rgba: new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength) } : null;
  imageCache.set(id, img);
  if (imageCache.size > IMAGE_CACHE_SIZE) {
    imageCache.delete(/** @type {number} */ (imageCache.keys().next().value));
  }
  (waiting.get(id) || []).forEach((resolve) => resolve(img));
  waiting.delete(id);
}

// ======================================================================
// ツリー
// ======================================================================
function visibleNodes() {
  /** @type {{ node: ViewNode, level: number }[]} */
  const out = [];
  (function walk(n, level) {
    out.push({ node: n, level });
    if (expanded.has(n.id)) { n.children.forEach((c) => walk(c, level + 1)); }
  })(/** @type {ViewNode} */ (root), 1);
  return out;
}

function renderTree() {
  const hadFocus = treeEl.contains(document.activeElement);
  const fragment = document.createDocumentFragment();
  for (const { node, level } of visibleNodes()) {
    const el = document.createElement('div');
    el.className = 'treeitem';
    el.id = 'tree-' + node.id;
    el.dataset.id = String(node.id);
    el.dataset.menu = 'tree';
    el.setAttribute('role', 'treeitem');
    el.setAttribute('aria-level', String(level));
    el.setAttribute('aria-selected', String(node === current));
    el.tabIndex = node === current ? 0 : -1;
    el.style.paddingLeft = `${(level - 1) * 14 + 4}px`;
    const tw = document.createElement('span');
    tw.className = 'twisty';
    if (node.children.length) {
      el.setAttribute('aria-expanded', String(expanded.has(node.id)));
      tw.textContent = expanded.has(node.id) ? '▼' : '▶';
    }
    const label = document.createElement('span');
    label.textContent = node.label;
    el.append(tw, makeBadge(node.badge), label);
    fragment.appendChild(el);
  }
  treeEl.replaceChildren(fragment);
  if (hadFocus) { focusTreeItem(); }
}

function makeBadge(text) {
  const badge = document.createElement('span');
  badge.className = 'type-badge';
  badge.textContent = text;
  return badge;
}

function treeItem(node) {
  return document.getElementById('tree-' + node.id);
}

function focusTreeItem() {
  const el = treeItem(current);
  if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); }
}

/** 選択を移す。大きいpakでも軽いように、ツリーは作り直さず選択の表示だけ変える */
function select(node, focus = true) {
  const prev = treeItem(current);
  if (prev) { prev.setAttribute('aria-selected', 'false'); prev.tabIndex = -1; }
  current = node;
  const el = treeItem(current);
  if (el) { el.setAttribute('aria-selected', 'true'); el.tabIndex = 0; }
  if (focus) { focusTreeItem(); }
  renderDetail();
  saveState();
}

function toggle(node) {
  if (!node.children.length) { return; }
  if (expanded.has(node.id)) { expanded.delete(node.id); } else { expanded.add(node.id); }
  renderTree();
  saveState();
}

treeEl.addEventListener('keydown', (e) => {
  if (!root) { return; }
  if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) { copyText(current.label); e.preventDefault(); return; }
  const vis = visibleNodes().map((v) => v.node);
  const i = vis.indexOf(current);
  const isOpen = expanded.has(current.id);
  switch (e.key) {
    case 'ArrowDown': select(vis[Math.min(i + 1, vis.length - 1)]); break;
    case 'ArrowUp': select(vis[Math.max(i - 1, 0)]); break;
    case 'Home': select(vis[0]); break;
    case 'End': select(vis[vis.length - 1]); break;
    case 'ArrowRight':
      if (current.children.length) {
        if (!isOpen) { toggle(current); } else { select(current.children[0]); }
      }
      break;
    case 'ArrowLeft':
      if (current.children.length && isOpen) { toggle(current); } else if (current.parent) { select(current.parent); }
      break;
    case 'Enter':
    case ' ':
      toggle(current);
      break;
    default:
      return;
  }
  e.preventDefault();
});

treeEl.addEventListener('mousedown', (e) => {
  const target = /** @type {HTMLElement} */ (e.target);
  const item = /** @type {HTMLElement | null} */ (target.closest('.treeitem'));
  if (!item) { return; }
  const node = byId[Number(item.dataset.id)];
  if (e.button === 0 && target.classList.contains('twisty')) { toggle(node); }
  if (node !== current) { select(node); } else { focusTreeItem(); }
  e.preventDefault();   // テキスト選択やフォーカス移動の既定動作を止める(フォーカスは自前で管理)
});
treeEl.addEventListener('dblclick', (e) => {
  const target = /** @type {HTMLElement} */ (e.target);
  const item = /** @type {HTMLElement | null} */ (target.closest('.treeitem'));
  if (item && !target.classList.contains('twisty')) { toggle(byId[Number(item.dataset.id)]); }
});

// ======================================================================
// 右ペイン
// ======================================================================
/** 子ノードのサムネイルは見えたものから画像を要求する */
const thumbObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) { continue; }
    const canvas = /** @type {HTMLCanvasElement} */ (entry.target);
    thumbObserver.unobserve(canvas);
    drawImage(canvas, Number(canvas.dataset.id), 1);
  }
}, { root: bodyEl, rootMargin: '200px' });

function renderDetail() {
  const node = current;
  titleEl.replaceChildren(makeBadge(node.badge), document.createTextNode(node.label));

  // どのノードでも「自分のプロパティ + (画像) + 直下の子の一覧」を出す
  thumbObserver.disconnect();
  bodyEl.textContent = '';
  if (node.note) {
    const p = document.createElement('p');
    p.className = 'note';
    p.textContent = node.note;
    bodyEl.appendChild(p);
  }
  bodyEl.append(heading(L10N.properties), node.fields.length ? renderProps(node.fields) : emptyNote(L10N.noFields));

  if (node.image) {
    bodyEl.append(heading(L10N.image), renderZoomBar(), renderPreview(node));
  }

  if (node.children.length) {
    // 子がすべて画像ならサムネイル、それ以外は表で一覧にする
    bodyEl.append(heading(L10N.children), node.children.every((c) => c.image) ? renderThumbs(node.children) : renderChildren(node.children));
  }
}

function heading(text) {
  const h = document.createElement('h3');
  h.textContent = text;
  return h;
}

function emptyNote(text) {
  const p = document.createElement('p');
  p.className = 'empty';
  p.textContent = text;
  return p;
}

// 子ノード一覧の「値」欄: そのノードが持つ文字列の値(TEXTの文字列 / XREFの参照先名)。無いものは空欄
function summary(node) {
  const field = (name) => (node.fields.find((f) => f[0] === name) || [])[1] || '';
  switch (node.badge) {
    case 'TEXT': return field('text');
    case 'XREF': return field('name');
    default: return '';
  }
}

// 右ペインの一覧から子ノードへ移動する(ツリーも開いてフォーカスを移す)
function goTo(node) {
  if (!expanded.has(node.parent.id)) {
    expanded.add(node.parent.id);
    renderTree();
  }
  select(node);
}

// 一覧の中は矢印キーで移動し、Tabでは一覧全体を1つの停止点として扱う
// (container に data-roving、各項目に data-item を付ける)
function focusItem(el) {
  el.closest('[data-roving]').querySelectorAll('[data-item]').forEach((r) => { r.tabIndex = r === el ? 0 : -1; });
  el.focus();
}

/**
 * @param {HTMLElement} container
 * @param {{ onEnter?: (item: HTMLElement) => void, onCopy: (item: HTMLElement, e: KeyboardEvent) => void }} handlers
 */
function makeRoving(container, { onEnter, onCopy }) {
  container.dataset.roving = '';
  const items = () => /** @type {HTMLElement[]} */ ([...container.querySelectorAll('[data-item]')]);
  items()[0].tabIndex = 0;
  container.addEventListener('keydown', (e) => {
    const item = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-item]'));
    if (!item) { return; }
    const list = items();
    const i = list.indexOf(item);
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) { onCopy(item, e); e.preventDefault(); return; }
    let next;
    switch (e.key) {
      case 'ArrowDown': case 'ArrowRight': next = list[Math.min(i + 1, list.length - 1)]; break;
      case 'ArrowUp': case 'ArrowLeft': next = list[Math.max(i - 1, 0)]; break;
      case 'Home': next = list[0]; break;
      case 'End': next = list[list.length - 1]; break;
      case 'Enter':
        if (!onEnter) { return; }
        onEnter(item);
        e.preventDefault();
        return;
      default: return;
    }
    e.preventDefault();
    focusItem(next);
  });
  container.addEventListener('mousedown', (e) => {
    const item = /** @type {HTMLElement} */ (e.target).closest('[data-item]');
    if (item) { focusItem(item); e.preventDefault(); }
  });
  if (onEnter) {
    container.addEventListener('dblclick', (e) => {
      const item = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-item]'));
      if (item) { onEnter(item); }
    });
  }
}

function makeTable(label, headers) {
  const table = document.createElement('table');
  table.className = 'props';
  table.setAttribute('role', 'grid');
  table.setAttribute('aria-label', label);
  const head = table.insertRow();
  headers.forEach((t) => {
    const th = document.createElement('th');
    th.textContent = t;
    head.appendChild(th);
  });
  return table;
}

function addRow(table, cells, data) {
  const tr = table.insertRow();
  tr.className = 'row';
  tr.tabIndex = -1;
  tr.dataset.item = '';
  Object.assign(tr.dataset, data);
  cells.forEach(([text, cls]) => {
    const td = tr.insertCell();
    td.className = cls;
    td.textContent = text;
  });
}

function renderProps(fields) {
  const table = makeTable(L10N.properties, [L10N.name, L10N.value, L10N.type]);
  fields.forEach(([name, value, ftype]) => {
    addRow(table, [[name, 'name'], [value, 'value'], [ftype, 'ftype']], { menu: 'prop', name, value });
  });
  makeRoving(table, { onCopy: (row) => copyText(row.dataset.value || '') });
  return table;
}

function renderChildren(children) {
  const table = makeTable(L10N.children, [L10N.name, L10N.value, L10N.kind]);
  children.forEach((c) => {
    const value = summary(c);
    addRow(table, [[c.label, 'name'], [value, 'value'], [c.badge, 'ftype']], { menu: 'child', id: c.id, name: c.label, value });
  });
  makeRoving(table, {
    onEnter: (row) => goTo(byId[Number(row.dataset.id)]),
    onCopy: (row) => copyText(row.dataset.value || ''),
  });
  return table;
}

function renderZoomBar() {
  const bar = document.createElement('div');
  bar.className = 'zoom-bar';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', L10N.zoom);
  [1, 2, 4, 8].forEach((z) => {
    const b = document.createElement('button');
    b.textContent = `×${z}`;
    b.setAttribute('aria-pressed', String(z === zoom));
    b.addEventListener('click', () => {
      zoom = z;
      saveState();
      renderDetail();
      /** @type {HTMLElement} */ (document.querySelector('.zoom-bar button[aria-pressed="true"]')).focus();
    });
    bar.appendChild(b);
  });
  return bar;
}

function renderPreview(node) {
  const wrap = document.createElement('div');
  wrap.className = 'checker';
  const canvas = makeCanvas(node, zoom);
  canvas.tabIndex = 0;
  canvas.dataset.menu = 'image';
  canvas.setAttribute('aria-label', L10N.imagePreview);
  drawImage(canvas, node.id, zoom);
  canvas.addEventListener('keydown', (e) => {
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      copyImage(node.id, e.shiftKey);   // Ctrl+C: コピー / Ctrl+Shift+C: 透過コピー
      e.preventDefault();
    }
  });
  wrap.appendChild(canvas);
  return wrap;
}

function renderThumbs(nodes) {
  const box = document.createElement('div');
  box.className = 'thumbs';
  box.setAttribute('role', 'listbox');
  box.setAttribute('aria-label', L10N.children);
  nodes.forEach((n) => {
    const t = document.createElement('div');
    t.className = 'thumb';
    t.tabIndex = -1;
    t.setAttribute('role', 'option');
    Object.assign(t.dataset, { item: '', menu: 'image', id: n.id });
    const wrap = document.createElement('div');
    wrap.className = 'checker';
    const c = makeCanvas(n, 1);
    thumbObserver.observe(c);
    wrap.appendChild(c);
    const cap = document.createElement('span');
    cap.textContent = n.label;
    t.append(wrap, cap);
    box.appendChild(t);
  });
  makeRoving(box, {
    onEnter: (t) => goTo(byId[Number(t.dataset.id)]),
    onCopy: (t, e) => copyImage(Number(t.dataset.id), e.shiftKey),
  });
  return box;
}

/** 画像が届く前から場所を取っておけるよう、先に大きさを決めたcanvasを作る */
function makeCanvas(node, z) {
  const canvas = document.createElement('canvas');
  canvas.className = 'preview';
  canvas.dataset.id = String(node.id);
  canvas.width = node.image.width * z;
  canvas.height = node.image.height * z;
  return canvas;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} id
 * @param {number} z
 */
async function drawImage(canvas, id, z) {
  const img = await getImage(id);
  if (!img || !canvas.isConnected) { return; }
  const src = new OffscreenCanvas(img.width, img.height);
  /** @type {OffscreenCanvasRenderingContext2D} */ (src.getContext('2d')).putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, img.width * z, img.height * z);
}

// ======================================================================
// コピー
// ======================================================================
const toastEl = /** @type {HTMLElement} */ (document.getElementById('toast'));
let toastTimer = 0;
function toast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), isError ? 5000 : 2000);
}

function errorText(err) {
  return L10N.copyFailed.replace('{0}', err instanceof Error ? err.message : String(err));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(L10N.copied.replace('{0}', text.replace(/\n/g, ' ')));
  } catch (err) {
    toast(errorText(err), true);
  }
}

/**
 * 通常コピー: 透明部分を #E7FFFF で塗る / 透過コピー: #E7FFFF を透明にする
 * 半透明ピクセルはどちらもアルファ値を保つ
 * @param {number} id
 * @param {boolean} transparent
 */
function copyImage(id, transparent) {
  const tr = TRANSPARENT_COLOR >> 16, tg = (TRANSPARENT_COLOR >> 8) & 255, tb = TRANSPARENT_COLOR & 255;
  const blob = getImage(id).then((img) => {
    if (!img) { throw new Error('no image'); }
    const data = new Uint8ClampedArray(img.rgba);
    for (let i = 0; i < data.length; i += 4) {
      if (transparent) {
        if (data[i] === tr && data[i + 1] === tg && data[i + 2] === tb) { data[i + 3] = 0; }
      } else if (data[i + 3] === 0) {
        data[i] = tr; data[i + 1] = tg; data[i + 2] = tb; data[i + 3] = 255;
      }
    }
    const c = new OffscreenCanvas(img.width, img.height);
    /** @type {OffscreenCanvasRenderingContext2D} */ (c.getContext('2d')).putImageData(new ImageData(data, img.width, img.height), 0, 0);
    return c.convertToBlob({ type: 'image/png' });
  });
  // クリックの直後に書き込みを始める必要があるので、画像の取得とPNGへの変換はPromiseのまま渡す
  navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    .then(() => toast(L10N.imageCopied))
    .catch((err) => toast(errorText(err), true));
}

// ======================================================================
// 右クリックメニュー
// ======================================================================
const menuEl = /** @type {HTMLElement} */ (document.getElementById('menu'));
/** @type {HTMLElement | null} */
let menuReturnFocus = null;

/** @param {HTMLElement} target */
function menuItemsFor(target) {
  const d = target.dataset;
  switch (d.menu) {
    case 'tree': {
      const node = byId[Number(d.id)];
      return [{ label: L10N.copyName, hint: 'Ctrl+C', run: () => copyText(node.label) }];
    }
    case 'prop':
      return [
        { label: L10N.copyValue, hint: 'Ctrl+C', run: () => copyText(d.value || '') },
        { label: L10N.copyNameAndValue, run: () => copyText(`${d.name}=${d.value}`) },
      ];
    case 'child':
      return [
        { label: L10N.open, hint: 'Enter', run: () => goTo(byId[Number(d.id)]) },
        { label: L10N.copyValue, hint: 'Ctrl+C', run: () => copyText(d.value || '') },
        { label: L10N.copyNameAndValue, run: () => copyText(`${d.name}=${d.value}`) },
      ];
    case 'image': {
      const id = Number(d.id);
      return [
        { label: L10N.copyImage, hint: 'Ctrl+C', run: () => copyImage(id, false) },
        { label: L10N.copyTransparent, hint: 'Ctrl+Shift+C', run: () => copyImage(id, true) },
      ];
    }
  }
  return [];
}

function openMenu(x, y, items, returnFocus, byKeyboard) {
  menuEl.textContent = '';
  items.forEach((item) => {
    const b = document.createElement('button');
    b.setAttribute('role', 'menuitem');
    b.tabIndex = -1;
    b.textContent = item.label;
    if (item.hint) {
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = item.hint;
      b.appendChild(hint);
    }
    b.addEventListener('click', () => { closeMenu(); item.run(); });
    menuEl.appendChild(b);
  });
  menuReturnFocus = returnFocus;
  menuEl.style.display = 'block';
  // 画面からはみ出さないように位置を調整
  const r = menuEl.getBoundingClientRect();
  menuEl.style.left = `${Math.min(x, window.innerWidth - r.width - 4)}px`;
  menuEl.style.top = `${Math.min(y, window.innerHeight - r.height - 4)}px`;
  // キーボードで開いたときだけ先頭の項目を選択状態にする。マウスのときはメニュー自体にフォーカスし、何も選択しない
  /** @type {HTMLElement} */ ((byKeyboard ? menuEl.querySelector('button') : menuEl)).focus();
}

function closeMenu(restoreFocus = true) {
  if (menuEl.style.display !== 'block') { return; }
  menuEl.style.display = 'none';
  if (restoreFocus && menuReturnFocus) { menuReturnFocus.focus(); }
  menuReturnFocus = null;
}

// 既定の右クリックメニューは常に出さない
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const el = /** @type {HTMLElement} */ (e.target);
  if (menuEl.contains(el)) { return; }
  const target = /** @type {HTMLElement | null} */ (el.closest('[data-menu]'));
  if (!target) { closeMenu(false); return; }

  // マウスで右クリックした項目を選択状態にする(Windowsのツリーと同じ挙動)
  if (target.dataset.menu === 'tree') {
    const node = byId[Number(target.dataset.id)];
    if (node !== current) { select(node); }
  } else if (target.hasAttribute('data-item')) {
    focusItem(target);
  }
  const focusEl = target.dataset.menu === 'tree' ? /** @type {HTMLElement} */ (treeItem(current)) : target;

  // キーボード(アプリケーションキー / Shift+F10)の場合は要素の位置に出す
  let x = e.clientX, y = e.clientY;
  const byKeyboard = e.button !== 2 || (x === 0 && y === 0);
  if (byKeyboard) {
    const r = focusEl.getBoundingClientRect();
    x = r.left + Math.min(24, r.width / 2);
    y = r.top + Math.min(r.height, 22);
  }
  openMenu(x, y, menuItemsFor(target), focusEl, byKeyboard);
});

menuEl.addEventListener('keydown', (e) => {
  const items = /** @type {HTMLElement[]} */ ([...menuEl.querySelectorAll('button')]);
  const i = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  switch (e.key) {
    case 'ArrowDown': items[(i + 1) % items.length].focus(); break;
    case 'ArrowUp': items[(i <= 0 ? items.length : i) - 1].focus(); break;
    case 'Home': items[0].focus(); break;
    case 'End': items[items.length - 1].focus(); break;
    case 'Escape': closeMenu(); break;
    case 'Tab': closeMenu(); break;
    default: return;   // Enter / Space はボタンの既定動作(click)に任せる
  }
  e.preventDefault();
});

// メニューの外を押したときだけ閉じる(メニュー内で閉じるとclickが発火しない)
document.addEventListener('mousedown', (e) => {
  if (!menuEl.contains(/** @type {Node} */ (e.target))) { closeMenu(false); }
}, true);
window.addEventListener('blur', () => closeMenu(false));
window.addEventListener('resize', () => closeMenu(false));

// 準備ができたことを拡張機能に知らせる(これを受けてノードの木が送られてくる)
vscode.postMessage({ type: 'ready' });
