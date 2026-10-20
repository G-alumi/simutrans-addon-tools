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

const TOP_SPEED = 'Top speed (km/h)';
const BUILD_COST = 'Construction cost (1/100 credits)';
const MAINTENANCE = 'Maintenance (1/100 credits)';
const MONTHLY_MAINTENANCE = 'Monthly maintenance (1/100 credits)';
const AXLE_LOAD_LIMIT = 'Axle load limit (tonnes)';
const CLIP_BELOW = '1 clips the parts overlapping the ground below';
const FRONT_IMAGE = 'Image drawn in front of vehicles';
const BACK_IMAGE = 'Image drawn behind vehicles';
const WEIGHT = 'Likelihood of appearing';
const PASSENGERS = 'Passenger generation';
const SMOKE = 'Smoke type';
const WAY_TYPE = 'Type of way';
const PLACED_ON = 'Type of way it can be placed on';
const DIR_IMAGE = 'Image for each direction';
const SEASON_IMAGES = 'Number of seasonal images';

/**
 * キーの説明(英語。日本語は l10n/bundle.l10n.ja.json)。人が読む版は docs/datのキー一覧.md の「説明」
 * キーの末尾の [{n}] を除いた形でも探す(季節の添字や、[n] が付くだけで意味が同じもの)
 */
const DESCRIPTIONS: Record<string, Record<string, string>> = {
	common: {
		obj: 'Object type',
		name: 'Name',
		copyright: 'Author',
		cell_size: 'Size of one image cell (px)',
		intro_year: 'Year of introduction',
		intro_month: 'Month of introduction',
		retire_year: 'Year it can no longer be built',
		retire_month: 'Month it can no longer be built',
		cursor: 'Cursor of the tool',
		icon: 'Icon of the tool',
	},
	vehicle: {
		waytype: 'Type of way it runs on',
		engine_type: 'Engine type. electric runs only on electrified ways',
		cost: 'Purchase price (1/100 credits)',
		payload: 'Capacity',
		loading_time: 'Time to load or unload a full load (ms)',
		speed: TOP_SPEED,
		weight: 'Weight of the vehicle (tonnes)',
		axle_load: 'Axle load (tonnes). Compared with the axle load limit of ways and bridges',
		power: 'Power (kW)',
		runningcost: 'Running cost per tile (1/100 credits)',
		fixed_cost: MONTHLY_MAINTENANCE,
		maintenance: MONTHLY_MAINTENANCE,
		gear: 'Gear ratio (100 means 1.00). Multiplied with power',
		length: 'Length of the vehicle (1/16 tile)',
		sound: 'Sound while running',
		freight: 'Freight carried',
		smoke: SMOKE,
		'emptyimage[{dir}]': 'Image when empty',
		'freightimage[{dir}]': 'Image when loaded',
		'freightimage[{n}][{dir}]': 'Image when loaded with freight n',
		'freightimagetype[{n}]': 'Freight that uses the images freightimage[n][..]',
		'constraint[prev][{n}]': 'Vehicle that can be coupled in front',
		'constraint[next][{n}]': 'Vehicle that can be coupled behind',
	},
	building: {
		type: 'Building type',
		dims: 'Size (width,height) and number of layouts (rotations)',
		level: 'Base for passenger and mail generation, station capacity and costs',
		climates: 'Climates where it can be built',
		noinfo: '1 hides the info window on click',
		noconstruction: '1 hides the construction image',
		needs_ground: '1 draws the ground under the building. Required if the tile has transparent pixels',
		animation_time: 'Duration of one animation frame (ms)',
		clusters: 'Buildings with the same number are built together',
		build_time: 'Built when the city population exceeds this (for attractions, 0 means outside cities)',
		passengers: PASSENGERS,
		hq_level: 'Headquarters level',
		waytype: 'Type of way served by the stop or depot',
		enables_pax: 'The stop handles passengers',
		enables_post: 'The stop handles mail',
		enables_ware: 'The stop handles goods',
		chance: 'Chance of being built (%)',
		preservation_year: 'The city does not replace it until this date',
		preservation_month: 'The city does not replace it until this date',
		height_clearance: 'Height of the building (height levels). Used to check whether bridges and ways can pass above. 255 derives it from the images',
		capacity: 'Station capacity',
		maintenance: MONTHLY_MAINTENANCE,
		cost: BUILD_COST,
		station_capacity: 'Same as capacity',
		station_maintenance: 'Same as maintenance',
		station_price: 'Same as cost',
		allow_underground: '0: above ground only, 1: underground only, 2: both',
		extension_building: 'Obsolete (use type=extension)',
		'backimage[{n}][{n}][{n}][{n}][{n}]': 'Image of the building',
		'frontimage[{n}][{n}][{n}][{n}][{n}]': FRONT_IMAGE,
	},
	factory: {
		location: 'Placement condition',
		productivity: 'Base production',
		range: 'Random range of production',
		distributionweight: WEIGHT,
		mapcolor: 'Color on the map (palette index)',
		pax_level: PASSENGERS,
		expand_probability: 'Probability of expansion',
		expand_minimum: 'Minimum expansion',
		expand_range: 'Range of expansion',
		expand_times: 'Number of expansions',
		electricity_producer: '1 makes it a power plant',
		electricity_boost: 'Production increase from electricity supply (1000 = 100%)',
		passenger_boost: 'Production increase from passenger supply (1000 = 100%)',
		mail_boost: 'Production increase from mail supply (1000 = 100%)',
		electricity_demand: 'Electricity demand',
		electricity_amount: 'Electricity demand (old name)',
		passenger_demand: 'Passenger demand',
		mail_demand: 'Mail demand',
		sound: 'Sound of the factory',
		sound_interval: 'Sound interval (ms)',
		smoke: SMOKE,
		smoketile: 'Tile the smoke comes from',
		smokeoffset: 'Position of the smoke within the tile',
		smokeuplift: 'Rising speed of the smoke',
		smokelifetime: 'Time until the smoke disappears',
		'inputgood[{n}]': 'Input good',
		'inputsupplier[{n}]': 'Number of suppliers of the input',
		'inputcapacity[{n}]': 'Storage of the input',
		'inputfactor[{n}]': 'Consumption ratio of the input (%)',
		'outputgood[{n}]': 'Product',
		'outputcapacity[{n}]': 'Storage of the product',
		'outputfactor[{n}]': 'Production ratio of the product (%)',
		fields: 'Field type',
		has_snow: 'Whether the field has a snow image',
		production_per_field: 'Production per field',
		storage_capacity: 'Storage of the field',
		spawn_weight: 'Likelihood of this field type being chosen',
		probability_to_spawn: 'Probability of adding fields',
		max_fields: 'Maximum number of fields',
		min_fields: 'Minimum number of fields',
		start_fields: 'Number of fields at the start',
	},
	good: {
		metric: 'Unit (t, persons, etc.)',
		value: 'Base fare',
		catg: 'Freight category (vehicles of the same category can carry it)',
		speed_bonus: 'Fare bonus for fast delivery',
		weight_per_unit: 'Weight per unit (kg)',
		mapcolor: 'Color on the map etc. (palette index)',
	},
	way: {
		waytype: WAY_TYPE,
		cost: BUILD_COST,
		maintenance: MAINTENANCE,
		topspeed: TOP_SPEED,
		max_weight: 'Weight limit (unused in the game)',
		axle_load: AXLE_LOAD_LIMIT,
		clip_below: CLIP_BELOW,
		system_type: 'Subtype of the way (elevated, runway, etc.)',
		draw_as_ding: '1 draws it as an object instead of ground',
		'image[{ribi}]': 'Image of the way',
		'frontimage[{ribi}]': FRONT_IMAGE,
		'imageup[{slope}]': 'Slope image',
		'frontimageup[{slope}]': 'Slope image drawn in front of vehicles',
		'imageup2[{slope}]': 'Double slope image',
		'frontimageup2[{slope}]': 'Double slope image drawn in front of vehicles',
		'diagonal[{diagonal}]': 'Diagonal image',
		'frontdiagonal[{diagonal}]': 'Diagonal image drawn in front of vehicles',
	},
	'way-object': {
		waytype: PLACED_ON,
		own_waytype: 'Its own type. overheadline makes it a catenary (electrifies the way)',
		cost: BUILD_COST,
		maintenance: MAINTENANCE,
		topspeed: TOP_SPEED,
		'frontimage[{ribi}]': FRONT_IMAGE,
		'backimage[{ribi}]': BACK_IMAGE,
		'frontimageup[{slope369}]': 'Slope image drawn in front of vehicles',
		'backimageup[{slope369}]': 'Slope image drawn behind vehicles',
		'frontimageup2[{slope369}]': 'Double slope image drawn in front of vehicles',
		'backimageup2[{slope369}]': 'Double slope image drawn behind vehicles',
		'frontdiagonal[{diagonal}]': 'Diagonal image drawn in front of vehicles',
		'backdiagonal[{diagonal}]': 'Diagonal image drawn behind vehicles',
	},
	bridge: {
		waytype: WAY_TYPE,
		topspeed: TOP_SPEED,
		cost: 'Construction cost per tile (1/100 credits)',
		maintenance: 'Maintenance per tile (1/100 credits)',
		pillar_distance: 'Pillar spacing (tiles). 0 means no pillars',
		pillar_asymmetric: '1 omits one pillar on north and west slopes',
		max_length: 'Maximum length (tiles). 0 means unlimited',
		max_lenght: 'Maximum length (tiles). 0 means unlimited',
		max_height: 'Maximum height. 0 means unlimited',
		axle_load: AXLE_LOAD_LIMIT,
		clip_below: CLIP_BELOW,
		...Object.fromEntries(['back', 'front'].flatMap((side) => [
			[`${side}image[{axis}]`, 'Bridge image (middle)'],
			[`${side}start[{nsew}]`, 'Bridge image (end)'],
			[`${side}ramp[{nsew}]`, 'Bridge image (ramp end)'],
			[`${side}pillar[{pillar}]`, 'Pillar image'],
			[`${side}image2[{axis}]`, 'Bridge image (middle, for double slopes)'],
			[`${side}start2[{nsew}]`, 'Bridge image (end, for double slopes)'],
			[`${side}ramp2[{nsew}]`, 'Bridge image (ramp end, for double slopes)'],
			[`${side}pillar2[{pillar}]`, 'Pillar image (for double slopes)'],
		])),
	},
	tunnel: {
		waytype: WAY_TYPE,
		topspeed: TOP_SPEED,
		cost: BUILD_COST,
		maintenance: MAINTENANCE,
		axle_load: AXLE_LOAD_LIMIT,
		way: 'Way inside the tunnel',
		'frontimage[{tunnel}]': 'Portal image drawn in front of vehicles',
		'backimage[{tunnel}]': 'Portal image drawn behind vehicles',
	},
	crossing: {
		'waytype[0]': 'Type of the first way',
		'waytype[1]': 'Type of the second way',
		'speed[0]': 'Top speed on the first way (km/h)',
		'speed[1]': 'Top speed on the second way (km/h)',
		animation_time_open: 'Duration of one animation frame while open (ms)',
		animation_time_closed: 'Duration of one animation frame while closed (ms)',
		sound: 'Sound when closing',
		'openimage[{axis}][{n}]': 'Image while open',
		'front_openimage[{axis}][{n}]': 'Image while open, drawn in front',
		'closedimage[{axis}][{n}]': 'Image while closed',
		'front_closedimage[{axis}][{n}]': 'Image while closed, drawn in front',
	},
	roadsign: {
		waytype: PLACED_ON,
		cost: BUILD_COST,
		maintenance: MAINTENANCE,
		min_speed: 'Minimum speed to pass (km/h)',
		offset_left: 'Shift of the sign for left-hand traffic (px). 0 means no shift',
		is_signal: 'Signal',
		is_presignal: 'Pre-signal (two-block signal)',
		is_prioritysignal: 'Priority signal',
		is_longblocksignal: 'Long block signal (multi-block signal)',
		single_way: 'One-way',
		free_route: 'Route choice',
		is_private: 'Private way',
		no_foreground: 'No foreground image',
		end_of_choose: 'End of a route choice section',
		'image[{n}]': 'Image (by number)',
		'image[{sign}][{n}]': 'Image for each direction and state',
		'frontimage[{n}]': FRONT_IMAGE,
		'frontimage[{sign}][{n}]': FRONT_IMAGE,
		'diagonal[{n}]': 'Image on a diagonal way',
		'frontdiagonal[{n}]': 'Image on a diagonal way',
	},
	citycar: {
		distributionweight: WEIGHT,
		speed: TOP_SPEED,
		'image[{dir}]': DIR_IMAGE,
	},
	pedestrian: {
		distributionweight: WEIGHT,
		steps_per_frame: 'Steps per animation frame',
		offset: 'Offset of the walking position from the center of the way',
		'image[{dir}]': DIR_IMAGE,
		'image[{dir}][{n}]': 'Animation image for each direction',
	},
	tree: {
		climates: 'Climates where it grows',
		seasons: SEASON_IMAGES,
		distributionweight: WEIGHT,
		'image[{n}][{n}]': 'Image for each growth stage and season',
	},
	ground_obj: {
		climates: 'Climates where it appears',
		seasons: SEASON_IMAGES,
		distributionweight: WEIGHT,
		cost: 'Removal cost',
		speed: 'Movement speed',
		trees_on_top: '1 allows trees on top',
		waytype: 'Where it moves',
		'image[{n}][{n}]': 'Image (stationary objects)',
		'image[{dir}][{n}]': 'Image for each direction (moving objects)',
	},
	ground: {
		'image[{n}][{n}]': 'Ground image',
	},
	sound: {
		sound_name: 'Sound file name',
		sound_nr: 'Old sound number',
	},
	skin: {
		'image[{n}]': 'Image n',
	},
};

const SKIN_TYPES = ['menu', 'cursor', 'symbol', 'smoke', 'field', 'misc'];

/** キーの説明(英語)。factory は building の説明も使う */
export function keyDescription(obj: string | undefined, def: KeyDef): string | undefined {
	const type = obj !== undefined && SKIN_TYPES.includes(obj) ? 'skin' : obj;
	const tables = [
		...(type !== undefined && Object.hasOwn(DESCRIPTIONS, type) ? [DESCRIPTIONS[type]] : []),
		...(type === 'factory' ? [DESCRIPTIONS.building] : []),
		DESCRIPTIONS.common,
	];
	for (const key of [def.key, def.key.replace(/\[\{n\}\]$/, '')]) {
		for (const table of tables) {
			if (Object.hasOwn(table, key)) {
				return table[key];
			}
		}
	}
	return undefined;
}

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
