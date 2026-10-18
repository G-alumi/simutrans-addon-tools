import { atoi } from './datDocument';

/** 画像の指定(ファイル名.行.列,x,y) */
export interface ImageRef {
	/** 拡張子 .png を省いたパス(datのあるフォルダからの相対パス) */
	path: string;
	row: number;
	/** `ファイル名.番号` の形で列が無いときは undefined(番号は左上から横に数えた通し番号) */
	col?: number;
	/** 値の中で ファイル名.行.列 が始まる位置と終わる位置 */
	start: number;
	end: number;
}

/**
 * 値を画像の指定として読む。makeobj(descriptor/writer/image_writer.cc)と同じ読み方をする
 * - 先頭の > (拡大縮小しない画像)と前後の空白は除く
 * - 最後の / より後ろの最初の . までがファイル名
 * - 展開記法(<$0> など)を含むものは、展開しないと決まらないので扱わない
 */
export function parseImageRef(value: string): ImageRef | undefined {
	if (value.includes('<')) {
		return undefined;
	}
	let start = 0;
	if (value.startsWith('>')) {
		start = 1;
	}
	while (start < value.length && /\s/.test(value[start])) {
		start++;
	}
	const key = value.slice(start).trimEnd();
	if (key === '' || key === '-') {
		return undefined;
	}
	const dot = key.indexOf('.', key.lastIndexOf('/') + 1);
	if (dot <= 0) {
		return undefined;
	}
	const numkey = key.slice(dot + 1);
	const m = /^\s*[+-]?\d+(?:\.\s*[+-]?\d+)?/.exec(numkey);
	if (!m) {
		return undefined;
	}
	const second = numkey.indexOf('.');
	return {
		path: key.slice(0, dot),
		row: atoi(numkey),
		col: second >= 0 ? atoi(numkey.slice(second + 1)) : undefined,
		start,
		end: start + dot + 1 + m[0].length,
	};
}
