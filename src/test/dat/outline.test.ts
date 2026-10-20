// アウトラインと折りたたみの範囲を確かめる
// 実行: npm run test:dat

import * as assert from 'assert';
import { objectSpans } from '../../dat/outline';

suite('objectSpans', () => {
	test('オブジェクトごとの範囲。末尾の空行と、キーの無いオブジェクトは除く', () => {
		const text = '# comment\nobj=good\nname=Coal\nvalue=1\n\n---\nobj=building\nname=\ndims=1,1\n---\n';
		assert.deepStrictEqual(objectSpans(text).map((s) => [s.obj, s.name?.value, s.name?.line, s.startLine, s.lastLine]), [
			['good', 'Coal', 2, 0, 3],
			['building', undefined, undefined, 6, 8],
		]);
	});
});
