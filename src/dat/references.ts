import { parseDat } from './datDocument';

/**
 * 別のオブジェクトを名前で参照しているキーと、参照先の種類(obj=)
 * makeobj で xref として書き出されるもの(descriptor/writer の vehicle/factory/tunnel_writer.cc)
 */
const REFERENCE_KEYS: [RegExp, string][] = [
	[/^(freight|freightimagetype\[\d+\]|inputgood\[\d+\]|outputgood\[\d+\])$/, 'good'],
	[/^constraint\[(prev|next)\]\[\d+\]$/, 'vehicle'],
	[/^smoke$/, 'smoke'],
	[/^way$/, 'way'],
	[/^fields(\[\d+\])?$/, 'field'],
];

/** キーが参照しているオブジェクトの種類。参照でなければ undefined */
export function referenceTarget(key: string, value: string): string | undefined {
	// makeobj はキーの [ ] の中の空白を詰めて読む
	const normalized = key.replace(/\[[^\]]*\]/g, (s) => s.replace(/ /g, ''));
	const found = REFERENCE_KEYS.find(([pattern]) => pattern.test(normalized));
	if (!found || value === '') {
		return undefined;
	}
	// constraint の none は「つながる車両が無い」の意味(大文字小文字は区別しない)
	if (found[1] === 'vehicle' && value.toLowerCase() === 'none') {
		return undefined;
	}
	return found[1];
}

/** 参照される種類か(「参照元 N件」を出すかどうか) */
export function isReferencedType(obj: string): boolean {
	return REFERENCE_KEYS.some(([, type]) => type === obj);
}

/** 参照の1件(値の位置と、参照先の種類と名前) */
export interface DatReference {
	obj: string;
	name: string;
	line: number;
	start: number;
	end: number;
}

export function extractReferences(text: string): DatReference[] {
	const refs: DatReference[] = [];
	for (const object of parseDat(text)) {
		for (const e of object.entries) {
			const obj = referenceTarget(e.key, e.value);
			if (obj) {
				refs.push({ obj, name: e.value, line: e.line, start: e.valueStart, end: e.valueStart + e.value.length });
			}
		}
	}
	return refs;
}
