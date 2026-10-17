// Simutrans本体の特別色の定義(simutrans/src/simutrans から転記)
// 色は 0xRRGGBB

/** descriptor/image.cc の rgbtab。画像中でこの色のピクセルが特別色として扱われる */
export const RGBTAB: readonly number[] = [
	// プレイヤーカラー(メイン)
	0x244B67, 0x395E7C, 0x4C7191, 0x6084A7, 0x7497BD, 0x88ABD3, 0x9CBEE9, 0xB0D2FF,
	// プレイヤーカラー(サブ)
	0x7B5803, 0x8E6F04, 0xA18605, 0xB49D07, 0xC6B408, 0xD9CB0A, 0xECE20B, 0xFFF90D,
	// 発光色・非暗転色
	0x57656F, // Dark windows, lit yellowish at night
	0x7F9BF1, // Lighter windows, lit blueish at night
	0xFFFF53, // Yellow light
	0xFF211D, // Red light
	0x01DD01, // Green light
	0x6B6B6B, // Non-darkening grey 1 (menus)
	0x9B9B9B, // Non-darkening grey 2 (menus)
	0xB3B3B3, // non-darkening grey 3 (menus)
	0xC9C9C9, // Non-darkening grey 4 (menus)
	0xDFDFDF, // Non-darkening grey 5 (menus)
	0xE3E3FF, // Nearly white light at day, yellowish light at night
	0xC1B1D1, // Windows, lit yellow
	0x4D4D4D, // Windows, lit yellow
	0xFF017F, // purple light
	0x0101FF, // blue light
];

export const PLAYER_COLOR_COUNT = 8;
/** RGBTAB のうち発光色が始まる位置 */
export const LIGHT_START = PLAYER_COLOR_COUNT * 2;

/** display/simgraph16.cc の display_night_lights。RGBTAB[LIGHT_START + i] の夜の色 */
export const NIGHT_LIGHTS: readonly number[] = [
	0xD3C380, 0x80C3D3, 0xFFFF53, 0xFF211D, 0x01DD01,
	0x6B6B6B, 0x9B9B9B, 0xB3B3B3, 0xC9C9C9, 0xDFDFDF,
	0xFFFFE3, 0xD3C380, 0xD3C380, 0xE100E1, 0x0101FF,
];

/** display/simgraph16.cc の special_pal のうち、プレイヤーカラー表示に使う2段(ピンク系・ライトグリーン系) */
export const PLAYER_PINK: readonly number[] = [
	0x57002B, 0x6F0B45, 0x871C5C, 0x9F2D73, 0xB73E8A, 0xE64AAE, 0xF579C2, 0xFF9CD1,
];
export const PLAYER_LIGHT_GREEN: readonly number[] = [
	0x008000, 0x00C400, 0x00E100, 0x00F000, 0x00FF00, 0x40FF40, 0x5EFF5E, 0x80FF80,
];

/** pakで透明として扱われる色 */
export const TRANSPARENT_KEY = 0xE7FFFF;

/**
 * 夜間表示の暗さ。ゲームの一番暗い夜(set_daynight_level(4)、明るさ設定0)と同じ倍率
 * calc_base_pal_from_night_shift: R,G は 0.75^night、B は 0.83^night
 */
export const NIGHT_MULTIPLIER = { rg: Math.pow(0.75, 4), b: Math.pow(0.83, 4) };
