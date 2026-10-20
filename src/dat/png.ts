import * as zlib from 'zlib';
import { LocalizableError } from '../shared/localizableError';

/**
 * PNGを読んで、フィルターを戻した行のデータを持つ
 * 一部を切り出すだけなので、全体をRGBAにはしない
 */
export class PngImage {
	private constructor(
		readonly width: number,
		readonly height: number,
		private readonly colorType: number,
		private readonly bitDepth: number,
		private readonly palette: Buffer,
		private readonly trns: Buffer | undefined,
		private readonly stride: number,
		private readonly rows: Buffer,
	) {}

	/** 画像の大きさだけを読む(IHDR は先頭のチャンク) */
	static readSize(data: Uint8Array): { width: number; height: number } {
		const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
		if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('latin1', 12, 16) !== 'IHDR') {
			throw new LocalizableError('Not a PNG file.');
		}
		return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
	}

	static decode(data: Uint8Array): PngImage {
		const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
		if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
			throw new LocalizableError('Not a PNG file.');
		}
		let width = 0, height = 0, bitDepth = 0, colorType = 0;
		let palette: Buffer = Buffer.alloc(0);
		let trns: Buffer | undefined;
		const idat: Buffer[] = [];
		for (let pos = 8; pos + 8 <= buf.length;) {
			const length = buf.readUInt32BE(pos);
			const type = buf.toString('latin1', pos + 4, pos + 8);
			const body = buf.subarray(pos + 8, pos + 8 + length);
			pos += 12 + length;
			if (type === 'IHDR') {
				width = body.readUInt32BE(0);
				height = body.readUInt32BE(4);
				bitDepth = body[8];
				colorType = body[9];
				if (body[12] !== 0) {
					throw new LocalizableError('Interlaced PNG is not supported.');
				}
			} else if (type === 'PLTE') {
				palette = body;
			} else if (type === 'tRNS') {
				trns = body;
			} else if (type === 'IDAT') {
				idat.push(body);
			} else if (type === 'IEND') {
				break;
			}
		}
		const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
		if (!channels || width === 0 || height === 0) {
			throw new LocalizableError('Unsupported PNG format.');
		}
		const bpp = Math.max(1, (channels * bitDepth) >> 3);
		const stride = Math.ceil((width * channels * bitDepth) / 8);
		const raw = zlib.inflateSync(Buffer.concat(idat));
		const rows = Buffer.alloc(stride * height);
		for (let y = 0; y < height; y++) {
			const filter = raw[y * (stride + 1)];
			const src = y * (stride + 1) + 1;
			const dst = y * stride;
			for (let i = 0; i < stride; i++) {
				const a = i >= bpp ? rows[dst + i - bpp] : 0;
				const b = y > 0 ? rows[dst - stride + i] : 0;
				const c = i >= bpp && y > 0 ? rows[dst - stride + i - bpp] : 0;
				let v = raw[src + i];
				switch (filter) {
					case 1: v += a; break;
					case 2: v += b; break;
					case 3: v += (a + b) >> 1; break;
					case 4: {
						const p = a + b - c;
						const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
						v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
						break;
					}
				}
				rows[dst + i] = v & 0xff;
			}
		}
		return new PngImage(width, height, colorType, bitDepth, palette, trns, stride, rows);
	}

	/** (x, y) から w×h を切り出し、RGBAのPNGにする */
	crop(x: number, y: number, w: number, h: number): Buffer {
		const rgba = Buffer.alloc(w * h * 4);
		for (let j = 0; j < h; j++) {
			for (let i = 0; i < w; i++) {
				rgba.set(this.pixel(x + i, y + j), (j * w + i) * 4);
			}
		}
		return encodePng(w, h, rgba);
	}

	/** 1ピクセルの [R, G, B, A](16ビットのものは上位8ビットを使う) */
	private pixel(x: number, y: number): number[] {
		const row = y * this.stride;
		const depth = this.bitDepth;
		const sample = (index: number) => {
			if (depth === 8) { return this.rows[row + index]; }
			if (depth === 16) { return this.rows[row + index * 2]; }
			const bit = index * depth;
			return (this.rows[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
		};
		// 8ビット未満の灰色を0〜255に広げる
		const gray = (v: number) => depth < 8 ? Math.round((v * 255) / ((1 << depth) - 1)) : v;
		const trns = this.trns;
		switch (this.colorType) {
			case 0: {
				const v = sample(x);
				const transparent = trns && trns.length >= 2 && trns.readUInt16BE(0) === (depth === 16 ? this.rows.readUInt16BE(row + x * 2) : v);
				return [gray(v), gray(v), gray(v), transparent ? 0 : 255];
			}
			case 2: {
				const r = sample(x * 3), g = sample(x * 3 + 1), b = sample(x * 3 + 2);
				const transparent = trns && trns.length >= 6 && depth === 8 && trns.readUInt16BE(0) === r && trns.readUInt16BE(2) === g && trns.readUInt16BE(4) === b;
				return [r, g, b, transparent ? 0 : 255];
			}
			case 3: {
				const i = sample(x);
				return [this.palette[i * 3] ?? 0, this.palette[i * 3 + 1] ?? 0, this.palette[i * 3 + 2] ?? 0, trns?.[i] ?? 255];
			}
			case 4:
				return [sample(x * 2), sample(x * 2), sample(x * 2), sample(x * 2 + 1)];
			default:
				return [sample(x * 4), sample(x * 4 + 1), sample(x * 4 + 2), sample(x * 4 + 3)];
		}
	}
}

/** 8ビットRGBAのPNGを作る */
function encodePng(width: number, height: number, rgba: Buffer): Buffer {
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y++) {
		rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', zlib.deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

function chunk(type: string, body: Buffer): Buffer {
	const out = Buffer.alloc(12 + body.length);
	out.writeUInt32BE(body.length, 0);
	out.write(type, 4, 'latin1');
	body.copy(out, 8);
	out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
	return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	return c >>> 0;
});

function crc32(data: Buffer): number {
	let c = 0xffffffff;
	for (const byte of data) {
		c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}
