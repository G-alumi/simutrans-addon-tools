// datの読み込みと画像の指定の読み方を、makeobj の動きに合わせて確かめる
// 実行: npm run test:dat

import * as assert from 'assert';
import { extractNames, parseDat } from '../../dat/datDocument';
import { parseImageRef } from '../../dat/imageRef';

suite('parseImageRef', () => {
	test('ファイル名.行.列', () => {
		assert.deepStrictEqual(parseImageRef('train.1.2'), { path: 'train', row: 1, col: 2, start: 0, end: 9 });
	});

	test('> と空白、オフセットはリンクの範囲に入れない', () => {
		const value = '> images/way.0.3,10,-4';
		const ref = parseImageRef(value)!;
		assert.strictEqual(ref.path, 'images/way');
		assert.strictEqual(value.slice(ref.start, ref.end), 'images/way.0.3');
	});

	test('ファイル名.番号 は列が無い', () => {
		assert.deepStrictEqual(parseImageRef('icon.5'), { path: 'icon', row: 5, col: undefined, start: 0, end: 6 });
	});

	test('値の後ろのコメントは数字の後ろで止まる', () => {
		const value = 'foo.0.14\t# flat';
		const ref = parseImageRef(value)!;
		assert.strictEqual(value.slice(ref.start, ref.end), 'foo.0.14');
	});

	test('フォルダ名の . はファイル名の区切りにしない', () => {
		assert.strictEqual(parseImageRef('../v1.2/car.0.0')!.path, '../v1.2/car');
	});

	test('画像でないもの', () => {
		for (const value of ['', '-', ' - ', 'train', 'train.<$0>.0', 'name.abc']) {
			assert.strictEqual(parseImageRef(value), undefined, value);
		}
	});
});

suite('parseDat', () => {
	test('区切り線・コメント・字下げした行', () => {
		const objects = parseDat('obj=way\n# comment\n cell_size=64\nImage[S] =a.0.0\n-----\nname=b\n');
		assert.strictEqual(objects.length, 2);
		assert.deepStrictEqual(objects[0].entries.map((e) => e.key), ['obj', 'image[s]']);
		assert.strictEqual(objects[0].entries[1].valueStart, 10);
		assert.deepStrictEqual(objects[1].entries.map((e) => e.value), ['b']);
	});
});

suite('extractNames', () => {
	test('オブジェクトごとの obj と name、名前の位置', () => {
		const names = extractNames('Obj=vehicle\nName=Foo Bar\n---\nobj=way\n---\nname=baz\n');
		assert.deepStrictEqual(names, [
			{ obj: 'vehicle', name: 'Foo Bar', line: 1, start: 5, end: 12 },
			{ obj: '', name: 'baz', line: 5, start: 5, end: 8 },
		]);
	});
});
