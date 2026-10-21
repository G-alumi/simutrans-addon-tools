// datの警告の判定を確かめる
// 実行: npm run test:dat

import * as assert from 'assert';
import { checkCounterpart, constraintDirOf, constraintsOf, duplicateKeys, extractVehicles, isIgnoreOneSided, renumberAfterRemoval, unknownKeys } from '../../dat/checks';
import { parseDat } from '../../dat/datDocument';

suite('unknownKeys', () => {
	test('その種類で読まれないキー。無視リストのものと、種類が分からないものは出さない', () => {
		const [object] = parseDat('obj=vehicle\nname=A\nspeed=100\ntopspeed=100\ncatering_level=1\npower=1');
		assert.deepStrictEqual(unknownKeys(object, []).map((e) => e.key), ['topspeed', 'catering_level']);
		assert.deepStrictEqual(unknownKeys(object, ['Vehicle/Catering_Level', 'way/topspeed']).map((e) => e.key), ['topspeed']);
		assert.deepStrictEqual(unknownKeys(object, ['topspeed', 'catering_level']), []);
		assert.deepStrictEqual(unknownKeys(parseDat('obj=foo\nbar=1')[0], []), []);
	});
});

suite('duplicateKeys', () => {
	test('前に同じキー(添字も同じ)がある行。[ ] の中の空白は無視し、<...> の展開は調べない', () => {
		const [object] = parseDat('obj=vehicle\nname=A\nconstraint[prev][0]=B\nconstraint[ prev ][0]=C\nName=D\nimage[<0-3>]=x\nimage[<0-3>]=y');
		assert.deepStrictEqual(duplicateKeys(object).map((d) => [d.entry.line, d.first.line]), [[3, 2], [4, 1]]);
	});

	test('constraint は最初の行を読む', () => {
		const [object] = parseDat('obj=vehicle\nconstraint[prev][0]=B\nconstraint[prev][0]=C');
		assert.deepStrictEqual(constraintsOf(object, 'prev').map((e) => e.value), ['B']);
	});
});

suite('constraint', () => {
	test('[0] から順に、抜けたところまで読む', () => {
		const [object] = parseDat('obj=vehicle\nconstraint[prev][0]=A\nconstraint[ prev ][1]=B\nconstraint[prev][3]=C\nconstraint[next][0]=');
		assert.deepStrictEqual(constraintsOf(object, 'prev').map((e) => e.value), ['A', 'B']);
		assert.deepStrictEqual(constraintsOf(object, 'next'), []);
	});

	test('constraint の向き', () => {
		assert.strictEqual(constraintDirOf('constraint[ next ][0]'), 'next');
		assert.strictEqual(constraintDirOf('constraint[prev][1]'), 'prev');
		assert.strictEqual(constraintDirOf('freight'), undefined);
	});

	test('行を消したときに後ろの番号を詰める', () => {
		const [object] = parseDat('obj=vehicle\nconstraint[prev][0]=A\nconstraint[prev][1]=B\nconstraint[next][0]=X\nconstraint[prev][2]=C');
		assert.deepStrictEqual(renumberAfterRemoval(object, 'prev', 2), [{ line: 4, key: 'constraint[prev][1]' }]);
		assert.deepStrictEqual(renumberAfterRemoval(object, 'prev', 1), [{ line: 2, key: 'constraint[prev][0]' }, { line: 4, key: 'constraint[prev][1]' }]);
		assert.deepStrictEqual(renumberAfterRemoval(object, 'prev', 4), []);
	});

	test('車両ごとの連結の設定', () => {
		assert.deepStrictEqual(extractVehicles('obj=vehicle\nname=A\nconstraint[next][0]=B\n---\nobj=good\nname=G\n---\nobj=vehicle\n'), [
			{ name: 'A', prev: [], next: ['B'] },
		]);
	});

	test('相手側の設定の判定', () => {
		assert.strictEqual(checkCounterpart('A', []), 'oneSided');
		assert.strictEqual(checkCounterpart('A', ['X', 'A']), 'ok');
		assert.strictEqual(checkCounterpart('A', ['any']), 'ok');
		assert.strictEqual(checkCounterpart('A', ['none']), 'mismatch');
		assert.strictEqual(checkCounterpart('A', ['X', 'none']), 'mismatch');
	});

	test('片方だけの設定の警告を消すコメント', () => {
		assert.ok(isIgnoreOneSided('# @ignore-one-sided '));
		assert.ok(!isIgnoreOneSided('# @ignore-one-sided-other'));
	});
});
