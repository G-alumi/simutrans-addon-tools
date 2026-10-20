// キーの説明が全部のキーにあり、日本語訳もあることを確かめる
// 実行: npm run test:dat

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { keyDescription, keysOf, OBJ_TYPES } from '../../dat/keys';

suite('keyDescription', () => {
	const ja: Record<string, string> = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../l10n/bundle.l10n.ja.json'), 'utf8'));

	test('すべての種類のすべてのキーに説明と日本語訳がある', () => {
		const missing: string[] = [];
		for (const obj of OBJ_TYPES) {
			for (const def of keysOf(obj)) {
				const description = keyDescription(obj, def);
				if (!description) {
					missing.push(`${obj}: ${def.key}`);
				} else if (!(description in ja)) {
					missing.push(`${obj}: ${def.key} (ja)`);
				}
			}
		}
		assert.deepStrictEqual(missing, []);
	});

	test('種類ごとに違う説明になる', () => {
		const cost = (obj: string) => keyDescription(obj, keysOf(obj).find((d) => d.key === 'cost')!);
		assert.strictEqual(cost('vehicle'), 'Purchase price (1/100 credits)');
		assert.strictEqual(cost('ground_obj'), 'Removal cost');
	});

	test('factory は building の説明も使い、季節の添字は付かない形と同じ説明', () => {
		const dims = keysOf('factory').find((d) => d.key === 'dims')!;
		assert.strictEqual(keyDescription('factory', dims), 'Size (width,height) and number of layouts (rotations)');
		const season = keysOf('way').find((d) => d.key === 'image[{ribi}][{n}]')!;
		assert.strictEqual(keyDescription('way', season), 'Image of the way');
	});
});
