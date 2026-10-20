import { DatEntry, DatObject, parseDat } from './datDocument';
import { findKeyDef, OBJ_TYPES } from './keys';

/** キーの [ ] の中の空白を詰める(makeobj と同じ) */
function normalizeKey(key: string): string {
	return key.replace(/\[[^\]]*\]/g, (s) => s.replace(/ /g, ''));
}

/** オブジェクトの obj= の値 */
export function objOf(object: DatObject): string | undefined {
	return object.entries.find((e) => e.key === 'obj')?.value.trim();
}

/**
 * その obj= の種類で読まれないキー。種類が分からないときは調べない
 * ignoreKeys は `キー` か `obj/キー`(大文字小文字は区別しない)
 */
export function unknownKeys(object: DatObject, ignoreKeys: readonly string[]): DatEntry[] {
	const obj = objOf(object);
	if (obj === undefined || !OBJ_TYPES.includes(obj)) {
		return [];
	}
	const ignored = new Set(ignoreKeys.map((k) => normalizeKey(k.toLowerCase())));
	return object.entries.filter((e) => {
		const key = normalizeKey(e.key);
		return !findKeyDef(obj, key) && !ignored.has(key) && !ignored.has(`${obj.toLowerCase()}/${key}`);
	});
}

export type ConstraintDir = 'prev' | 'next';

export function opposite(dir: ConstraintDir): ConstraintDir {
	return dir === 'prev' ? 'next' : 'prev';
}

/** 連結の設定。makeobj と同じく [0] から順に、抜けたところか値が空のところまで読む */
export function constraintsOf(object: DatObject, dir: ConstraintDir): DatEntry[] {
	const byKey = new Map(object.entries.map((e) => [normalizeKey(e.key), e]));
	const result: DatEntry[] = [];
	for (let i = 0; ; i++) {
		const entry = byKey.get(`constraint[${dir}][${i}]`);
		if (!entry || entry.value === '') {
			return result;
		}
		result.push(entry);
	}
}

/** constraint の値が車両の名前か(none は「つながる車両なし」、any は「どの車両でも」) */
export function isVehicleName(value: string): boolean {
	return value.toLowerCase() !== 'none' && value !== 'any';
}

/** 車両の名前と連結の設定 */
export interface VehicleConstraints {
	name: string;
	prev: string[];
	next: string[];
}

export function extractVehicles(text: string): VehicleConstraints[] {
	return parseDat(text).flatMap((object) => {
		const name = object.entries.find((e) => e.key === 'name')?.value;
		if (objOf(object) !== 'vehicle' || !name) {
			return [];
		}
		return [{
			name,
			prev: constraintsOf(object, 'prev').map((e) => e.value),
			next: constraintsOf(object, 'next').map((e) => e.value),
		}];
	});
}

/**
 * A の constraint[dir] に B があるとき、B の constraint[反対] (counterpart) を見た結果
 * - oneSided: B 側が空白。連結はできるが片方だけの設定
 * - mismatch: B 側に A も any も無い。連結できない
 */
export function checkCounterpart(aName: string, counterpart: readonly string[]): 'ok' | 'oneSided' | 'mismatch' {
	if (counterpart.length === 0) {
		return 'oneSided';
	}
	return counterpart.some((v) => v === aName || v === 'any') ? 'ok' : 'mismatch';
}

/** 次の1行の「片方だけの設定」の警告を出さないコメント */
export const IGNORE_ONE_SIDED = '# @ignore-one-sided';

export function isIgnoreOneSided(line: string): boolean {
	return line.trim() === IGNORE_ONE_SIDED;
}
