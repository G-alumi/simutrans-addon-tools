/**
 * datの1行分の設定(キー=値)
 * makeobj の読み込み(dataobj/tabfile.cc)に合わせる:
 * - 行頭が # か半角スペースの行は読み飛ばす
 * - 行頭が - の行はオブジェクトの区切り
 * - キーは右側の空白を除いて小文字にする。値の途中の # はコメントにならない
 */
export interface DatEntry {
	line: number;
	/** 小文字にしたキー([ ] を含む) */
	key: string;
	value: string;
	/** 行の中で値が始まる位置 */
	valueStart: number;
}

/** 区切り線から区切り線までのオブジェクト */
export interface DatObject {
	startLine: number;
	endLine: number;
	entries: DatEntry[];
}

export function parseDat(text: string): DatObject[] {
	const lines = text.split(/\r?\n/);
	const objects: DatObject[] = [];
	let current: DatObject = { startLine: 0, endLine: 0, entries: [] };
	lines.forEach((line, i) => {
		if (line.startsWith('-')) {
			current.endLine = i;
			objects.push(current);
			current = { startLine: i + 1, endLine: i + 1, entries: [] };
			return;
		}
		if (line.startsWith('#') || line.startsWith(' ')) {
			return;
		}
		const eq = line.indexOf('=');
		if (eq < 0) {
			return;
		}
		current.entries.push({ line: i, key: line.slice(0, eq).trimEnd().toLowerCase(), value: line.slice(eq + 1), valueStart: eq + 1 });
	});
	current.endLine = lines.length;
	objects.push(current);
	return objects;
}

/** オブジェクトの名前(name=)。obj と name は makeobj と同じく、書かれたとおりの文字列で比べる */
export interface DatName {
	obj: string;
	name: string;
	line: number;
	/** 行の中で名前が始まる位置と終わる位置 */
	start: number;
	end: number;
}

/** オブジェクトごとの obj= と name= を取り出す(name= の無いオブジェクトは除く) */
export function extractNames(text: string): DatName[] {
	const names: DatName[] = [];
	for (const object of parseDat(text)) {
		const name = object.entries.find((e) => e.key === 'name');
		if (!name || name.value === '') {
			continue;
		}
		const obj = object.entries.find((e) => e.key === 'obj')?.value ?? '';
		names.push({ obj, name: name.value, line: name.line, start: name.valueStart, end: name.valueStart + name.value.length });
	}
	return names;
}

/** C の atoi と同じく、先頭の空白と符号を読み、数字が続くところまでを整数にする(読めなければ 0) */
export function atoi(s: string): number {
	const m = /^\s*([+-]?\d+)/.exec(s);
	return m ? parseInt(m[1], 10) : 0;
}
