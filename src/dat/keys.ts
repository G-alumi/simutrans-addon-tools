/**
 * obj= の種類ごとに makeobj が読むキーの一覧(Simutrans Standard)
 * Simutrans本体 src/simutrans/descriptor/writer/*_writer.cc(ba0fc81)から作った。人が読む版は docs/datのキー一覧.md
 */

/** 値の種類 */
export type KeyValue =
	| 'number'
	| 'float'
	| 'bool'
	| 'string'
	| 'image'
	| 'coord'
	| 'numbers'
	| 'climates'
	/** 音の番号か、音のファイル名 */
	| 'sound'
	| { words: readonly string[] }
	/** 別のオブジェクトの name=。special は名前の代わりに書ける語 */
	| { ref: string; special?: readonly string[] };

/** キーの1件。key の {名前} は添字(PLACEHOLDERS) */
export interface KeyDef {
	key: string;
	value: KeyValue;
}

const DIR8 = ['s', 'w', 'sw', 'se', 'n', 'e', 'ne', 'nw'];
const NSEW = ['n', 's', 'e', 'w'];
const RIBI = [
	'-', 'n', 'e', 'ne', 's', 'ns', 'se', 'nse', 'w', 'nw', 'ew', 'new', 'sw', 'nsw', 'sew', 'nsew',
	'nse1', 'new1', 'nsw1', 'sew1', 'nsew1', 'nse2', 'new2', 'nsw2', 'sew2', 'nsew2',
];

/** 添字に書けるもの。null は数字 */
const PLACEHOLDERS: Record<string, readonly string[] | null> = {
	n: null,
	dir: DIR8,
	nsew: NSEW,
	ribi: RIBI,
	diagonal: [...RIBI, 'close1', 'close2'],
	/** way の坂。古い書き方は 3 6 9 12 */
	slope: ['n', 'w', 'e', 's', '3', '6', '9', '12'],
	slope369: ['3', '6', '9', '12'],
	axis: ['ns', 'ew'],
	pillar: ['s', 'w'],
	tunnel: NSEW.flatMap((d) => ['', 'l', 'r', 'm'].map((a) => d + a)),
	sign: ['n', 's', 'w', 'e', 'nw', 'se', 'sw', 'ne', 'ns', 'ew'],
};

export const WAYTYPES = ['none', 'road', 'track', 'electrified_track', 'maglev_track', 'monorail_track', 'narrowgauge_track', 'water', 'air', 'schiene_tram', 'tram_track', 'power', 'decoration'];
export const CLIMATES = ['water', 'desert', 'tropic', 'mediterran', 'temperate', 'tundra', 'rocky', 'arctic'];
const ENGINE_TYPES = ['diesel', 'electric', 'steam', 'bio', 'sail', 'fuel_cell', 'hydrogene', 'battery', 'unknown'];
const BUILDING_TYPES = ['res', 'com', 'ind', 'cur', 'mon', 'tow', 'hq', 'harbour', 'dock', 'fac', 'stop', 'extension', 'depot', 'any'];
const LOCATIONS = ['land', 'water', 'city', 'river', 'shore', 'forest'];

/** obj= に書ける種類。makeobj は大文字小文字を区別する */
export const OBJ_TYPES = [
	'bridge', 'building', 'citycar', 'crossing', 'factory', 'good', 'ground', 'ground_obj', 'pedestrian', 'roadsign',
	'menu', 'cursor', 'symbol', 'smoke', 'field', 'misc', 'sound', 'tree', 'tunnel', 'vehicle', 'way-object', 'way',
];

const waytype: KeyValue = { words: WAYTYPES };

function keys(value: KeyValue, ...names: string[]): KeyDef[] {
	return names.map((key) => ({ key, value }));
}

/** 季節の添字が付く形と付かない形 */
function withSeason(value: KeyValue, ...names: string[]): KeyDef[] {
	return names.flatMap((key) => [{ key, value }, { key: `${key}[{n}]`, value }]);
}

const COMMON: KeyDef[] = [
	{ key: 'obj', value: { words: OBJ_TYPES } },
	...keys('string', 'name', 'copyright'),
	{ key: 'cell_size', value: 'number' },
];
const DATES = keys('number', 'intro_year', 'intro_month', 'retire_year', 'retire_month');
const ICONS = keys('image', 'cursor', 'icon');

/** building と factory で共通(factory では type を makeobj が fac にする) */
const BUILDING: KeyDef[] = [
	{ key: 'dims', value: 'numbers' },
	{ key: 'level', value: 'number' },
	{ key: 'climates', value: 'climates' },
	...keys('bool', 'noinfo', 'noconstruction', 'needs_ground'),
	{ key: 'animation_time', value: 'number' },
	{ key: 'clusters', value: 'numbers' },
	...keys('number', 'build_time', 'passengers', 'hq_level'),
	{ key: 'waytype', value: waytype },
	...keys('bool', 'enables_pax', 'enables_post', 'enables_ware'),
	...keys('number', 'chance', 'preservation_year', 'preservation_month', 'height_clearance',
		'capacity', 'maintenance', 'cost', 'station_capacity', 'station_maintenance', 'station_price', 'allow_underground'),
	{ key: 'extension_building', value: 'bool' },
	...keys('image', 'backimage[{n}][{n}][{n}][{n}][{n}]', 'backimage[{n}][{n}][{n}][{n}][{n}][{n}]',
		'frontimage[{n}][{n}][{n}][{n}][{n}]', 'frontimage[{n}][{n}][{n}][{n}][{n}][{n}]'),
	...ICONS,
	...DATES,
];

const SKIN = keys('image', 'image[{n}]');

const TYPE_KEYS: Record<string, KeyDef[]> = {
	vehicle: [
		{ key: 'waytype', value: waytype },
		{ key: 'engine_type', value: { words: ENGINE_TYPES } },
		...keys('number', 'cost', 'payload', 'loading_time', 'speed'),
		{ key: 'weight', value: 'float' },
		...keys('number', 'axle_load', 'power', 'runningcost', 'fixed_cost', 'maintenance', 'gear', 'length'),
		{ key: 'sound', value: 'sound' },
		{ key: 'freight', value: { ref: 'good' } },
		{ key: 'smoke', value: { ref: 'smoke' } },
		...keys('image', 'emptyimage[{dir}]', 'freightimage[{dir}]', 'freightimage[{n}][{dir}]'),
		{ key: 'freightimagetype[{n}]', value: { ref: 'good' } },
		...keys({ ref: 'vehicle', special: ['none', 'any'] }, 'constraint[prev][{n}]', 'constraint[next][{n}]'),
		...DATES,
	],
	building: [{ key: 'type', value: { words: BUILDING_TYPES } }, ...BUILDING],
	factory: [
		{ key: 'location', value: { words: LOCATIONS } },
		...keys('number', 'productivity', 'range', 'distributionweight', 'mapcolor', 'pax_level',
			'expand_probability', 'expand_minimum', 'expand_range', 'expand_times'),
		{ key: 'electricity_producer', value: 'bool' },
		...keys('number', 'electricity_boost', 'passenger_boost', 'mail_boost',
			'electricity_demand', 'electricity_amount', 'passenger_demand', 'mail_demand'),
		{ key: 'sound', value: 'sound' },
		{ key: 'sound_interval', value: 'number' },
		{ key: 'smoke', value: { ref: 'smoke' } },
		...keys('coord', 'smoketile', 'smokeoffset', 'smoketile[{n}]', 'smokeoffset[{n}]'),
		...keys('number', 'smokeuplift', 'smokelifetime'),
		{ key: 'inputgood[{n}]', value: { ref: 'good' } },
		...keys('number', 'inputsupplier[{n}]', 'inputcapacity[{n}]', 'inputfactor[{n}]'),
		{ key: 'outputgood[{n}]', value: { ref: 'good' } },
		...keys('number', 'outputcapacity[{n}]', 'outputfactor[{n}]'),
		{ key: 'fields', value: { ref: 'field' } },
		{ key: 'has_snow', value: 'bool' },
		...keys('number', 'production_per_field', 'storage_capacity', 'spawn_weight'),
		{ key: 'fields[{n}]', value: { ref: 'field' } },
		{ key: 'has_snow[{n}]', value: 'bool' },
		...keys('number', 'production_per_field[{n}]', 'storage_capacity[{n}]', 'spawn_weight[{n}]',
			'probability_to_spawn', 'max_fields', 'min_fields', 'start_fields'),
		...BUILDING,
	],
	good: [
		{ key: 'metric', value: 'string' },
		...keys('number', 'value', 'catg', 'speed_bonus', 'weight_per_unit', 'mapcolor'),
	],
	way: [
		{ key: 'waytype', value: waytype },
		...keys('number', 'cost', 'maintenance', 'topspeed', 'max_weight', 'axle_load'),
		{ key: 'clip_below', value: 'bool' },
		{ key: 'system_type', value: 'number' },
		{ key: 'draw_as_ding', value: 'bool' },
		...withSeason('image', 'image[{ribi}]', 'frontimage[{ribi}]',
			'imageup[{slope}]', 'frontimageup[{slope}]', 'imageup2[{slope}]', 'frontimageup2[{slope}]',
			'diagonal[{diagonal}]', 'frontdiagonal[{diagonal}]'),
		...ICONS,
		...DATES,
	],
	'way-object': [
		...keys(waytype, 'waytype', 'own_waytype'),
		...keys('number', 'cost', 'maintenance', 'topspeed'),
		...keys('image', 'frontimage[{ribi}]', 'backimage[{ribi}]',
			'frontimageup[{slope369}]', 'backimageup[{slope369}]', 'frontimageup2[{slope369}]', 'backimageup2[{slope369}]',
			'frontdiagonal[{diagonal}]', 'backdiagonal[{diagonal}]'),
		...ICONS,
		...DATES,
	],
	bridge: [
		{ key: 'waytype', value: waytype },
		...keys('number', 'topspeed', 'cost', 'maintenance', 'pillar_distance'),
		{ key: 'pillar_asymmetric', value: 'bool' },
		...keys('number', 'max_length', 'max_lenght', 'max_height', 'axle_load'),
		{ key: 'clip_below', value: 'bool' },
		...['back', 'front'].flatMap((side) => ['', '2'].flatMap((v) => withSeason('image',
			`${side}image${v}[{axis}]`, `${side}start${v}[{nsew}]`, `${side}ramp${v}[{nsew}]`, `${side}pillar${v}[{pillar}]`))),
		...ICONS,
		...DATES,
	],
	tunnel: [
		{ key: 'waytype', value: waytype },
		...keys('number', 'topspeed', 'cost', 'maintenance', 'axle_load'),
		{ key: 'way', value: { ref: 'way' } },
		...withSeason('image', 'frontimage[{tunnel}]', 'backimage[{tunnel}]'),
		...ICONS,
		...DATES,
	],
	crossing: [
		...keys(waytype, 'waytype[0]', 'waytype[1]'),
		...keys('number', 'speed[0]', 'speed[1]', 'animation_time_open', 'animation_time_closed'),
		{ key: 'sound', value: 'sound' },
		...keys('image', 'openimage[{axis}][{n}]', 'front_openimage[{axis}][{n}]', 'closedimage[{axis}][{n}]', 'front_closedimage[{axis}][{n}]'),
		...DATES,
	],
	roadsign: [
		{ key: 'waytype', value: waytype },
		...keys('number', 'cost', 'maintenance', 'min_speed', 'offset_left'),
		...keys('bool', 'is_signal', 'is_presignal', 'is_prioritysignal', 'is_longblocksignal',
			'single_way', 'free_route', 'is_private', 'no_foreground', 'end_of_choose'),
		...keys('image', 'image[{n}]', 'image[{sign}][{n}]', 'frontimage[{n}]', 'frontimage[{sign}][{n}]',
			'diagonal[{n}]', 'diagonal[{n}][{n}]', 'frontdiagonal[{n}]', 'frontdiagonal[{n}][{n}]'),
		...ICONS,
		...DATES,
	],
	citycar: [
		...keys('number', 'distributionweight', 'speed'),
		{ key: 'image[{dir}]', value: 'image' },
		...DATES,
	],
	pedestrian: [
		...keys('number', 'distributionweight', 'steps_per_frame', 'offset'),
		...keys('image', 'image[{dir}]', 'image[{dir}][{n}]'),
		...DATES,
	],
	tree: [
		{ key: 'climates', value: 'climates' },
		...keys('number', 'seasons', 'distributionweight'),
		{ key: 'image[{n}][{n}]', value: 'image' },
	],
	ground_obj: [
		{ key: 'climates', value: 'climates' },
		...keys('number', 'seasons', 'distributionweight', 'cost', 'speed'),
		{ key: 'trees_on_top', value: 'bool' },
		{ key: 'waytype', value: waytype },
		...keys('image', 'image[{n}][{n}]', 'image[{dir}][{n}]'),
	],
	ground: keys('image', 'image[{n}][{n}]'),
	sound: [
		{ key: 'sound_name', value: 'string' },
		{ key: 'sound_nr', value: 'number' },
	],
	menu: SKIN,
	cursor: SKIN,
	symbol: SKIN,
	smoke: SKIN,
	field: SKIN,
	misc: SKIN,
};

/** その種類のキー(共通のキーを含む)。種類が分からなければ共通のキーだけ */
export function keysOf(obj: string | undefined): KeyDef[] {
	return [...COMMON, ...(obj !== undefined ? TYPE_KEYS[obj] ?? [] : [])];
}

/** 添字があるキーか */
export function hasPlaceholder(def: KeyDef): boolean {
	return def.key.includes('{');
}

const patterns = new Map<string, RegExp>();

function patternOf(def: KeyDef): RegExp {
	let re = patterns.get(def.key);
	if (!re) {
		const source = def.key.split(/(\{\w+\})/).map((part) => {
			const m = /^\{(\w+)\}$/.exec(part);
			if (!m) {
				return part.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
			}
			const words = PLACEHOLDERS[m[1]];
			return words ? `(?:${words.map((w) => w.replace(/-/g, '\\-')).join('|')})` : '\\d+';
		}).join('');
		re = new RegExp(`^${source}$`);
		patterns.set(def.key, re);
	}
	return re;
}

/** datに書かれたキー(小文字)に当たる定義。makeobj と同じく [ ] の中の空白は詰める */
export function findKeyDef(obj: string | undefined, key: string): KeyDef | undefined {
	const normalized = key.replace(/\[[^\]]*\]/g, (s) => s.replace(/ /g, ''));
	return keysOf(obj).find((def) => patternOf(def).test(normalized));
}

/** 補完で入れる形(VS Code のスニペット)。添字は選択肢か数字の入力欄にする */
export function keySnippet(def: KeyDef): string {
	let i = 0;
	return def.key.replace(/\{(\w+)\}/g, (_, name: string) => {
		i++;
		const words = PLACEHOLDERS[name];
		return words ? `\${${i}|${words.join(',')}|}` : `\${${i}:0}`;
	});
}

/** 一覧に出す形(添字は名前にする) */
export function keyLabel(def: KeyDef): string {
	return def.key.replace(/\{(\w+)\}/g, '$1');
}
