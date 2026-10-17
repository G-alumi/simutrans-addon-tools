// image ノードの解読を、makeobj で実際に作ったpakで確かめる
// makeobj が PATH に無いときは飛ばす
// 実行: npm run test:pak

import * as assert from 'assert';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as zlib from 'zlib';
import { decodeImage } from '../../pak/image';
import { PakNode, parsePak } from '../../pak/parser';
import { RGBTAB, TRANSPARENT_KEY } from '../../shared/specialColors';

const SIZE = 32;
type Rgba = [number, number, number, number];

/** テスト画像(32×32)。何も描かない所は透明色 #E7FFFF */
function testPattern(): Rgba[] {
	const px: Rgba[] = Array.from({ length: SIZE * SIZE }, () => [0xE7, 0xFF, 0xFF, 255]);
	const put = (x: number, y: number, rgb: number, a = 255) => {
		px[y * SIZE + x] = [rgb >> 16, (rgb >> 8) & 0xFF, rgb & 0xFF, a];
	};
	// 特別色(不透明)
	RGBTAB.forEach((c, i) => put(1 + i, 2, c));
	// 普通の色(不透明)。RGB555に落ちる
	[0xFFFFFF, 0x000000, 0x081018, 0x7B2D43, 0xE7FFFE, 0x0F0F0F].forEach((c, i) => put(2 + i, 4, c));
	// 半透明。特別色はそのまま、普通の色はRGB343に落ちる。不透明度7以下は透明になる
	[[RGBTAB[0], 128], [RGBTAB[16], 200], [0xC86432, 128], [0xFFFFFF, 10], [0x123456, 7], [0xABCDEF, 254], [0x00FF00, 0]]
		.forEach(([c, a], i) => put(3 + i, 6, c, a));
	// 1行の中で不透明・半透明・透明が入れ替わる
	put(1, 8, 0xFF0000);
	put(2, 8, 0x00FF00, 100);
	put(3, 8, 0x0000FF, 100);
	put(4, 8, 0xFF00FF);
	put(5, 8, TRANSPARENT_KEY);
	put(6, 8, RGBTAB[3], 50);
	put(9, 8, 0x808080);
	// 行頭から描く行(左端の余白なし)
	put(0, 10, 0x404040);
	return px;
}

const expand5 = (v: number) => (v << 3) | (v >> 2);
const expand4 = (v: number) => (v << 4) | v;
const expand3 = (v: number) => (v << 5) | (v << 2) | (v >> 1);

/** makeobj で変換して読み直したときに期待する色 */
function expected([r, g, b, a]: Rgba): Rgba {
	const rgb = (r << 16) | (g << 8) | b;
	const t = 255 - a; // makeobj は不透明度を反転して扱う(0 = 不透明)
	if (rgb === TRANSPARENT_KEY || t >= 0xF8) {
		return [0, 0, 0, 0];
	}
	const special = RGBTAB.includes(rgb);
	if (t === 0) {
		return special ? [r, g, b, 255] : [expand5(r >> 3), expand5(g >> 3), expand5(b >> 3), 255];
	}
	const alpha = (30 - (t >> 3) + 1) * 8;
	return special ? [r, g, b, alpha] : [expand3(r >> 5), expand4(g >> 4), expand3(b >> 5), alpha];
}

function encodePng(px: Rgba[]): Buffer {
	const chunk = (type: string, data: Buffer) => {
		const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(zlib.crc32(td));
		return Buffer.concat([len, td, crc]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(SIZE, 0);
	ihdr.writeUInt32BE(SIZE, 4);
	ihdr[8] = 8; // ビット深度
	ihdr[9] = 6; // RGBA
	const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
	for (let y = 0; y < SIZE; y++) {
		for (let x = 0; x < SIZE; x++) {
			raw.set(px[y * SIZE + x], y * (1 + SIZE * 4) + 1 + x * 4);
		}
	}
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
		chunk('IHDR', ihdr),
		chunk('IDAT', zlib.deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

function findImages(node: PakNode): PakNode[] {
	return node.type === 'image' ? [node] : node.children.flatMap(findImages);
}

suite('pak image', () => {
	test('makeobj で作った画像を元の色に戻せる', function () {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sat-pakimage-'));
		try {
			const source = testPattern();
			fs.writeFileSync(path.join(dir, 'test.png'), encodePng(source));
			fs.writeFileSync(path.join(dir, 'test.dat'), 'obj=menu\nname=TestImage\nimage[0]=test.0.0\n');
			const r = spawnSync('makeobj', ['pak32', 'test.pak', 'test.dat'], { cwd: dir, encoding: 'utf8' });
			if (r.error) {
				this.skip(); // makeobj が無い
			}
			assert.ok(fs.existsSync(path.join(dir, 'test.pak')), `makeobj failed:\n${r.stdout}${r.stderr}`);

			const images = findImages(parsePak(fs.readFileSync(path.join(dir, 'test.pak'))).root);
			assert.strictEqual(images.length, 1);
			const img = decodeImage(images[0]);
			assert.ok(img);

			// 解読した画像をタイル全体に置き直して、1ピクセルずつ比べる
			const actual: Rgba[] = Array.from({ length: SIZE * SIZE }, () => [0, 0, 0, 0]);
			for (let y = 0; y < img.height; y++) {
				for (let x = 0; x < img.width; x++) {
					const o = (y * img.width + x) * 4;
					actual[(img.y + y) * SIZE + img.x + x] = [img.rgba[o], img.rgba[o + 1], img.rgba[o + 2], img.rgba[o + 3]];
				}
			}
			const diffs: string[] = [];
			source.forEach((p, i) => {
				const want = expected(p);
				if (want.join() !== actual[i].join()) {
					diffs.push(`(${i % SIZE},${Math.floor(i / SIZE)}) src=${p} want=${want} got=${actual[i]}`);
				}
			});
			assert.deepStrictEqual(diffs, []);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
