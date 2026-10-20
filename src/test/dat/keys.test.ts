// キー一覧の照合と補完で入れる形を確かめる
// 実行: npm run test:dat

import * as assert from 'assert';
import { findKeyDef, keyLabel, keySnippet, keysOf } from '../../dat/keys';

suite('findKeyDef', () => {
	test('添字のあるキー', () => {
		assert.strictEqual(findKeyDef('vehicle', 'emptyimage[sw]')?.value, 'image');
		assert.deepStrictEqual(findKeyDef('vehicle', 'constraint[ next ][ 1 ]')?.value, { ref: 'vehicle', special: ['none', 'any'] });
		assert.strictEqual(findKeyDef('way', 'image[-][0]')?.value, 'image');
		assert.strictEqual(findKeyDef('way', 'diagonal[close2]')?.value, 'image');
		assert.strictEqual(findKeyDef('tunnel', 'backimage[sm][1]')?.value, 'image');
		assert.strictEqual(findKeyDef('building', 'backimage[0][1][0][0][0][2]')?.value, 'image');
	});

	test('共通のキーと、factory で使える building のキー', () => {
		assert.strictEqual(findKeyDef('good', 'name')?.value, 'string');
		assert.strictEqual(findKeyDef('factory', 'dims')?.value, 'numbers');
		assert.strictEqual(findKeyDef(undefined, 'copyright')?.value, 'string');
	});

	test('その種類で読まれないキー', () => {
		assert.strictEqual(findKeyDef('vehicle', 'emptyimage[x]'), undefined);
		assert.strictEqual(findKeyDef('vehicle', 'catering_level'), undefined);
		assert.strictEqual(findKeyDef('factory', 'type'), undefined);
		assert.strictEqual(findKeyDef(undefined, 'speed'), undefined);
		assert.strictEqual(findKeyDef('Vehicle', 'speed'), undefined);
	});
});

suite('keySnippet / keyLabel', () => {
	const def = keysOf('vehicle').find((d) => d.key === 'freightimage[{n}][{dir}]')!;

	test('添字は数字の入力欄と選択肢', () => {
		assert.strictEqual(keySnippet(def), 'freightimage[${1:0}][${2|s,w,sw,se,n,e,ne,nw|}]');
	});

	test('一覧には添字の名前を出す', () => {
		assert.strictEqual(keyLabel(def), 'freightimage[n][dir]');
	});
});
