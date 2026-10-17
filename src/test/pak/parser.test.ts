// 実際のpakを読み、スキーマでボディをちょうど読み切れるかを確かめる
// (フィールドの型・個数やバージョン判定が間違っていると、余りやはみ出しが出る)
//
// 環境変数 PAK_TEST_DIR でpakファイルを探すフォルダ(サブフォルダも含む)を指定したときだけ動く
// 実行: npm run test:pak

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { decodeImage } from '../../pak/image';
import { PakNode, parsePak } from '../../pak/parser';
import { SCHEMAS } from '../../pak/schema';

function findPaks(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...findPaks(p));
		} else if (entry.name.toLowerCase().endsWith('.pak')) {
			out.push(p);
		}
	}
	return out;
}

/** ノードの問題点(なければ undefined) */
function problem(node: PakNode): string | undefined {
	if (node.version < 0) {
		return 'unknown type';
	}
	if (!SCHEMAS[node.type]?.[node.version]) {
		return 'unknown version';
	}
	if (node.unread !== 0) {
		return 'body not fully read';
	}
	if (node.type === 'image') {
		const { len, pixel_data: pixels, w, h } = node.fields;
		if (typeof len === 'number' && pixels instanceof Uint8Array && len * 2 !== pixels.length) {
			return 'len does not match pixel data';
		}
		if ((w as number) > 0 && (h as number) > 0 && !decodeImage(node)) {
			return 'pixel data cannot be decoded';
		}
	}
	return undefined;
}

suite('pak parser (実際のpak)', () => {
	test('全ノードのボディをスキーマでちょうど読み切れる', function () {
		const pakDir = process.env.PAK_TEST_DIR;
		if (!pakDir) {
			this.skip();
		}
		this.timeout(0);

		const files = findPaks(pakDir);
		assert.ok(files.length > 0, `no .pak files in ${pakDir}`);

		// 問題の種類ごとに、件数と最初の例をまとめる
		const problems = new Map<string, { count: number; example: string }>();
		const add = (key: string, example: string) => {
			const p = problems.get(key);
			if (p) { p.count++; } else { problems.set(key, { count: 1, example }); }
		};
		const walk = (node: PakNode, file: string, at: string) => {
			const where = `${at}/${node.type}`;
			const p = problem(node);
			if (p) { add(`${node.type} v${node.version}: ${p}`, `${file} ${where} (size=${node.size}, unread=${node.unread})`); }
			node.children.forEach((c, i) => walk(c, file, `${where}[${i}]`));
		};

		for (const file of files) {
			const rel = path.relative(pakDir, file);
			try {
				const pak = parsePak(fs.readFileSync(file));
				if (pak.root.type === '\0\0\0\0') {
					// ルートのヘッダが0で潰れたpak。本体も未知の種別として読み飛ばし、後ろも読まないので空のpakと同じ
					continue;
				}
				if (pak.trailing !== 0) { add('trailing bytes after root', `${rel} (${pak.trailing} bytes)`); }
				walk(pak.root, rel, '');
			} catch (e) {
				add(`parse error: ${(e as Error).message.replace(/\d+/g, 'N')}`, `${rel}: ${(e as Error).message}`);
			}
		}

		const report = [...problems].map(([key, { count, example }]) => `${key} ×${count}\n    e.g. ${example}`);
		assert.deepStrictEqual(report, [], `problems in ${files.length} files`);
	});
});
