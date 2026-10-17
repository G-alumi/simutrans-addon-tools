// image ノードのピクセルデータをRGBAにする
// 形式は Simutrans本体の descriptor/reader/image_reader.cc(読み込み)と
// descriptor/writer/image_writer.cc(makeobj の書き出し)を参照

import { PakNode } from './parser';
import { RGBTAB } from '../shared/specialColors';

export interface DecodedImage {
	/** タイルの左上から見た画像の位置 */
	x: number;
	y: number;
	width: number;
	height: number;
	/** width×height のRGBA。透明部分は (0,0,0,0) */
	rgba: Uint8ClampedArray;
}

const TRANSPARENT_RUN = 0x8000;
/** 0x8000 + この数 までが特別色(RGBTAB の番号) */
const SPECIAL_COUNT = RGBTAB.length;
/** これ以降は半透明色。(色番号*31 + 不透明度0〜30) */
const ALPHA_START = 0x8020;

/** 5bit → 8bit(上位ビットを下に複製して 0x1F が 0xFF になるようにする) */
const expand5 = (v: number) => (v << 3) | (v >> 2);
const expand4 = (v: number) => (v << 4) | v;
const expand3 = (v: number) => (v << 5) | (v << 2) | (v >> 1);

/**
 * ピクセル値を [r, g, b, a] にする
 * - 0x0000〜0x7FFF: RGB555
 * - 0x8000〜0x801E: 特別色(プレイヤーカラー・発光色)。RGBTAB の色そのものにする
 * - 0x8020〜: 半透明。色番号が31未満なら特別色、それ以外はRGB343
 */
function pixelToRgba(pix: number, out: Uint8ClampedArray, o: number): void {
	let rgb: number;
	let alpha = 255;
	if (pix < 0x8000) {
		out[o] = expand5((pix >> 10) & 0x1F);
		out[o + 1] = expand5((pix >> 5) & 0x1F);
		out[o + 2] = expand5(pix & 0x1F);
		out[o + 3] = 255;
		return;
	} else if (pix < ALPHA_START) {
		rgb = RGBTAB[pix - 0x8000] ?? 0;
	} else {
		const aux = pix - ALPHA_START;
		const color = Math.floor(aux / 31);
		// ゲームは不透明度 (0〜30 + 1)/32 で重ねて描く
		alpha = (aux % 31 + 1) * 8;
		if (color < SPECIAL_COUNT) {
			rgb = RGBTAB[color];
		} else {
			const c = color - SPECIAL_COUNT;
			rgb = (expand3((c >> 7) & 0x7) << 16) | (expand4((c >> 3) & 0xF) << 8) | expand3(c & 0x7);
		}
	}
	out[o] = rgb >> 16;
	out[o + 1] = (rgb >> 8) & 0xFF;
	out[o + 2] = rgb & 0xFF;
	out[o + 3] = alpha;
}

/**
 * image ノードを解読する。ピクセルを持たない(空の)画像や壊れたデータは undefined
 *
 * データは行ごとに「透明ラン長, 色ラン長, 色×ラン長」の繰り返しで、行末は透明ラン長の位置に0が来る。
 * 色ラン長の最上位ビット(TRANSPARENT_RUN)は半透明のランの印、透明ラン長の最上位ビットは無視する
 */
export function decodeImage(node: PakNode): DecodedImage | undefined {
	const f = node.fields;
	const raw = f.pixel_data;
	if (node.type !== 'image' || !(raw instanceof Uint8Array)) {
		return undefined;
	}
	const x = f.x as number;
	const y = f.y as number;
	const width = f.w as number;
	const height = f.h as number;
	if (width <= 0 || height <= 0) {
		return undefined;
	}

	const words = new Uint16Array(raw.length >> 1);
	const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
	for (let i = 0; i < words.length; i++) {
		let w = view.getUint16(i * 2, true);
		// version 0 ではプレイヤーカラーの番号が1つずれている
		if (node.version === 0 && w >= 0x8000 && w <= 0x800F) {
			w++;
		}
		words[i] = w;
	}

	// version 2 より前は、各行先頭の透明ラン長に左端の余白が含まれている
	let left = 0;
	if (node.version < 2) {
		left = Infinity;
		let p = 0;
		for (let row = 0; row < height; row++) {
			if (p >= words.length) { return undefined; }
			left = Math.min(left, words[p]);
			const next = skipRow(words, p);
			if (next === undefined) { return undefined; }
			p = next;
		}
	}

	const rgba = new Uint8ClampedArray(width * height * 4);
	let p = 0;
	for (let row = 0; row < height; row++) {
		let col = 0;
		let first = true;
		for (;;) {
			if (p >= words.length) { return undefined; }
			const clear = words[p++];
			if (!first && clear === 0) {
				break; // 行末
			}
			col += (clear & ~TRANSPARENT_RUN) - (first ? left : 0);
			first = false;
			if (p >= words.length) { return undefined; }
			const count = words[p++] & ~TRANSPARENT_RUN;
			if (p + count > words.length) { return undefined; }
			for (let i = 0; i < count; i++, col++) {
				if (col >= 0 && col < width) {
					pixelToRgba(words[p + i], rgba, (row * width + col) * 4);
				}
			}
			p += count;
		}
	}
	return { x, y, width, height, rgba };
}

/** 1行分を読み飛ばし、次の行の先頭位置を返す。データが途切れていれば undefined */
function skipRow(words: Uint16Array, p: number): number | undefined {
	do {
		p++; // 透明ラン長
		if (p >= words.length) { return undefined; }
		p += (words[p] & ~TRANSPARENT_RUN) + 1; // 色ラン長と色
		if (p >= words.length) { return undefined; }
	} while (words[p] !== 0);
	return p + 1;
}
