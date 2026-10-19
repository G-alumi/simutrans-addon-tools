// pakファイルのパーサー(pakcompare の pakcompare/parser.py から移植)
// 仕様は pakcompare の docs/pak_format.md と、Simutrans本体の descriptor/reader/*_reader.cc を参照

import { FieldType, OBJ_TYPES, SCHEMAS } from './schema';
import { LocalizableError } from '../shared/localizableError';

export type FieldValue = number | bigint | Uint8Array;

export interface PakNode {
	/** obj_type名(schema.ts の OBJ_TYPES のキー)。未知の種別は FourCC そのもの */
	type: string;
	/** 未知の種別は -1 */
	version: number;
	/** スキーマに沿って読んだフィールド。未知のバージョンは空 */
	fields: Record<string, FieldValue>;
	/** ボディのバイト数 */
	size: number;
	/** ボディのうち読まなかった(スキーマに無い)バイト数。スキーマが合っていれば0 */
	unread: number;
	children: PakNode[];
}

export interface PakFile {
	/** 0x1A より前のヘッダ文字列(例: "Simutrans object file\nCompiled with SimObjects 0.1.3exp\n") */
	header: string;
	/** makeobj のバージョン(ヘッダ直後のu32) */
	compilerVersion: number;
	root: PakNode;
	/** ルートノードの後に残ったバイト数。正常なら0 */
	trailing: number;
}

const FOURCC_TO_NAME = new Map(Object.entries(OBJ_TYPES).map(([name, fourcc]) => [fourcc, name]));

// バージョン概念がなく、常にversion 0としてボディ先頭から読む種別
const NO_VERSION_TYPES = new Set([
	'text', 'ground', 'root', 'menu', 'cursor', 'symbol', 'field', 'smoke',
	'miscimages', 'imagelist', 'imagelist2d', 'factory_smoke', 'xref',
]);
// 先頭u16の値そのもの(0x8001等)をversionとして使う種別
const MARKER_VERSION_TYPES = new Set(['factory_field_class', 'factory_field_group']);
// 先頭u16の最上位ビットを見ず、下位15bitを無条件でversionとする種別
const UNCONDITIONAL_MASK_TYPES = new Set(['way', 'way_obj']);
// ボディが空のときだけ無条件でversion 0とする種別
const SIZE_ZERO_IS_VERSION_0_TYPES = new Set(['way', 'tunnel']);
// 効果音をファイル名で指定したときの sound / sound_id の値
const LOAD_SOUND = -2;

export class PakParseError extends LocalizableError {}

/** ノードボディを先頭から順に読み進めるカーソル */
class Cursor {
	pos = 0;
	private readonly view: DataView;

	constructor(readonly data: Uint8Array) {
		this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	}

	remaining(): number {
		return this.data.length - this.pos;
	}

	peekU16(): number {
		return this.view.getUint16(this.pos, true);
	}

	read(type: FieldType): FieldValue {
		const v = this.view;
		const p = this.pos;
		switch (type) {
			case 'u8': this.pos += 1; return v.getUint8(p);
			case 'u16': this.pos += 2; return v.getUint16(p, true);
			case 'u32': this.pos += 4; return v.getUint32(p, true);
			case 'u64': this.pos += 8; return toNumber(v.getBigUint64(p, true));
			case 'sint8': this.pos += 1; return v.getInt8(p);
			case 'sint16': this.pos += 2; return v.getInt16(p, true);
			case 'sint32': this.pos += 4; return v.getInt32(p, true);
			case 'sint64': this.pos += 8; return toNumber(v.getBigInt64(p, true));
			case 'sound_name': {
				const len = v.getUint8(p);
				this.pos += 1;
				return this.bytes(len);
			}
			case 'raw': {
				// raw は常に最後のフィールドなので、ボディの残り全部を読む
				return this.bytes(this.remaining());
			}
		}
	}

	private bytes(len: number): Uint8Array {
		if (this.pos + len > this.data.length) {
			throw new RangeError('Out of bounds');
		}
		const raw = this.data.subarray(this.pos, this.pos + len);
		this.pos += len;
		return raw;
	}
}

/** 安全に表せる範囲なら number にする(価格などは実際にはこの範囲に収まる) */
function toNumber(value: bigint): number | bigint {
	return Number.MIN_SAFE_INTEGER <= value && value <= Number.MAX_SAFE_INTEGER ? Number(value) : value;
}

function detectVersion(typeName: string, cursor: Cursor): number {
	if (NO_VERSION_TYPES.has(typeName)) {
		return 0;
	}
	if (typeName === 'image') {
		// 独自方式: ボディのoffset 6のu8がversion
		return cursor.data.length > 6 ? cursor.data[6] : 0;
	}
	if (SIZE_ZERO_IS_VERSION_0_TYPES.has(typeName) && cursor.data.length === 0) {
		return 0;
	}
	if (typeName === 'factory_supplier') {
		// 本体は 0x8001 だけを version 1 とし、それ以外は先頭u16を capacity として読む(capacity は 0x8000 以上もありうる)
		if (cursor.peekU16() === 0x8001) {
			cursor.pos += 2;
			return 1;
		}
		return 0;
	}
	if (MARKER_VERSION_TYPES.has(typeName)) {
		return cursor.read('u16') as number;
	}
	if (UNCONDITIONAL_MASK_TYPES.has(typeName)) {
		return (cursor.read('u16') as number) & 0x7FFF;
	}
	// 標準方式: 先頭u16の最上位ビットが立っていればバージョン付き。
	// 立っていなければversion 0とし、この2バイトはそのバージョンの最初のフィールドとして読ませる
	if (cursor.remaining() < 2) {
		return 0;
	}
	const peek = cursor.peekU16();
	if (peek & 0x8000) {
		cursor.pos += 2;
		return peek & 0x7FFF;
	}
	return 0;
}

function decodeFields(typeName: string, version: number, cursor: Cursor): Record<string, FieldValue> {
	const fields: Record<string, FieldValue> = {};
	const schema = SCHEMAS[typeName]?.[version];
	if (!schema) {
		// 未知のバージョン: フィールドは読めないが、ノードの境界はヘッダのsizeで決まるので木の読み込みは続けられる
		return fields;
	}
	for (const [name, type] of schema) {
		if (type === 'sound_name' && fields.sound !== LOAD_SOUND && fields.sound_id !== LOAD_SOUND) {
			continue;
		}
		fields[name] = cursor.read(type);
	}
	return fields;
}

function readNode(buf: Uint8Array, view: DataView, pos: number): [PakNode, number] {
	if (pos + 8 > buf.length) {
		throw new PakParseError('Unexpected end of file at offset {0}.', pos);
	}
	const fourcc = String.fromCharCode(...buf.subarray(pos, pos + 4));
	const nchildren = view.getUint16(pos + 4, true);
	let size = view.getUint16(pos + 6, true);
	pos += 8;
	if (size === 0xFFFF) {
		if (pos + 4 > buf.length) {
			throw new PakParseError('Unexpected end of file at offset {0}.', pos);
		}
		size = view.getUint32(pos, true);
		pos += 4;
	}
	if (pos + size > buf.length) {
		throw new PakParseError('Node body exceeds the end of file at offset {0}.', pos);
	}
	const body = buf.subarray(pos, pos + size);
	pos += size;

	let node: PakNode;
	const typeName = FOURCC_TO_NAME.get(fourcc);
	if (typeName === undefined) {
		// 読み込み処理が存在しない未知の種別
		node = { type: fourcc, version: -1, fields: {}, size, unread: size, children: [] };
	} else {
		const cursor = new Cursor(body);
		const version = detectVersion(typeName, cursor);
		let fields: Record<string, FieldValue>;
		try {
			fields = decodeFields(typeName, version, cursor);
		} catch (e) {
			if (e instanceof RangeError) {
				throw new PakParseError('Node body of {0} v{1} is too short at offset {2}.', typeName, version, pos - size);
			}
			throw e;
		}
		node = { type: typeName, version, fields, size, unread: cursor.remaining(), children: [] };
	}

	for (let i = 0; i < nchildren; i++) {
		const [child, next] = readNode(buf, view, pos);
		node.children.push(child);
		pos = next;
	}
	return [node, pos];
}

/** pakファイルのバイト列全体を読む */
export function parsePak(data: Uint8Array): PakFile {
	const end = data.indexOf(0x1A);
	if (end < 0 || end + 5 > data.length) {
		throw new PakParseError('Not a pak file (header not found).');
	}
	const header = new TextDecoder('latin1').decode(data.subarray(0, end));
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const compilerVersion = view.getUint32(end + 1, true);
	const [root, pos] = readNode(data, view, end + 5);
	return { header, compilerVersion, root, trailing: data.length - pos };
}

/** NULで切ってUTF-8として読む(text の text、xref の name など) */
export function decodeString(raw: Uint8Array): string {
	const nul = raw.indexOf(0);
	return new TextDecoder('utf-8').decode(nul < 0 ? raw : raw.subarray(0, nul));
}

/** ノードの名前(子の先頭が text ならその文字列)。名前を持たないノードは undefined */
export function getName(node: PakNode): string | undefined {
	const first = node.children[0];
	if (first?.type !== 'text') {
		return undefined;
	}
	const raw = first.fields.text;
	return raw instanceof Uint8Array ? decodeString(raw) : undefined;
}
