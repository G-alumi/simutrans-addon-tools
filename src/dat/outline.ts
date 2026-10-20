import { DatEntry, parseDat } from './datDocument';

/** アウトラインと折りたたみに使う、オブジェクトの範囲 */
export interface ObjectSpan {
	/** obj= の値(無ければ undefined) */
	obj?: string;
	/** name= の行(値が空なら undefined) */
	name?: DatEntry;
	startLine: number;
	/** 区切り線の手前の、空行でない最後の行 */
	lastLine: number;
}

/** キーの無いオブジェクト(ファイル末尾の区切り線の後など)は除く */
export function objectSpans(text: string): ObjectSpan[] {
	const lines = text.split(/\r?\n/);
	return parseDat(text).filter((o) => o.entries.length > 0).map((o) => {
		let lastLine = o.endLine - 1;
		while (lastLine > o.startLine && lines[lastLine].trim() === '') {
			lastLine--;
		}
		const name = o.entries.find((e) => e.key === 'name');
		return {
			obj: o.entries.find((e) => e.key === 'obj')?.value.trim(),
			name: name && name.value !== '' ? name : undefined,
			startLine: o.startLine,
			lastLine,
		};
	});
}
