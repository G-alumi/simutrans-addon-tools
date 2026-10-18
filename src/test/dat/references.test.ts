// 参照のキーの読み方を、makeobj の動きに合わせて確かめる
// 実行: npm run test:dat

import * as assert from 'assert';
import { extractReferences, isReferencedType, referenceTarget } from '../../dat/references';

suite('referenceTarget', () => {
	test('参照先の種類', () => {
		assert.strictEqual(referenceTarget('freight', 'Coal'), 'good');
		assert.strictEqual(referenceTarget('outputgood[2]', 'Coal'), 'good');
		assert.strictEqual(referenceTarget('constraint[prev][0]', 'Foo'), 'vehicle');
		assert.strictEqual(referenceTarget('smoke', 'Rauch'), 'smoke');
		assert.strictEqual(referenceTarget('way', 'rail_160'), 'way');
		assert.strictEqual(referenceTarget('fields', 'farm'), 'field');
	});

	test('[ ] の中の空白は詰める', () => {
		assert.strictEqual(referenceTarget('constraint[ next ][ 1 ]', 'Foo'), 'vehicle');
	});

	test('参照でないもの', () => {
		assert.strictEqual(referenceTarget('name', 'Foo'), undefined);
		assert.strictEqual(referenceTarget('waytype', 'track'), undefined);
		assert.strictEqual(referenceTarget('freight', ''), undefined);
		assert.strictEqual(referenceTarget('constraint[next][0]', 'None'), undefined);
	});
});

suite('extractReferences', () => {
	test('参照の値の位置と参照先', () => {
		const refs = extractReferences('obj=vehicle\nname=A\nfreight=Coal\nconstraint[next][0]=none\nconstraint[prev][0]=B\n');
		assert.deepStrictEqual(refs, [
			{ obj: 'good', name: 'Coal', line: 2, start: 8, end: 12 },
			{ obj: 'vehicle', name: 'B', line: 4, start: 20, end: 21 },
		]);
	});

	test('参照される種類', () => {
		assert.ok(isReferencedType('good'));
		assert.ok(!isReferencedType('building'));
	});
});
