// 補完のひな形を確かめる
// 実行: npm run test:dat

import * as assert from 'assert';
import { unknownKeys } from '../../dat/checks';
import { parseDat } from '../../dat/datDocument';
import { templateSnippet, TEMPLATES } from '../../dat/templates';

suite('templates', () => {
	test('どのひな形にも、その種類で読まれないキーが無い', () => {
		for (const t of TEMPLATES) {
			const objects = parseDat(t.text);
			assert.strictEqual(objects.length, 1, t.title);
			assert.deepStrictEqual(unknownKeys(objects[0], []).map((e) => e.key), [], t.title);
		}
	});

	test('スニペットにする', () => {
		const text = 'obj=vehicle\nname=\ngear=100\nwaytype=water\nemptyimage[s]=image.0.0\n\nfreightimage[s]=> image.1.0\nfoo=a|b,c';
		assert.strictEqual(templateSnippet(text), [
			'obj=vehicle',
			'name=${1}',
			'gear=${2:100}',
			'waytype=${3|water,none,road,track,electrified_track,maglev_track,monorail_track,narrowgauge_track,air,schiene_tram,tram_track,power,decoration|}',
			'emptyimage[s]=${4:image}.0.0',
			'',
			'freightimage[s]=> ${4:image}.1.0',
			'foo=${5|a,b\\,c|}',
		].join('\n'));
	});
});
