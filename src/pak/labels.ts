// 子ノードに意味のあるラベルを付ける
// 並び順は pakcompare の docs/node_hierarchy.md / docs/xref_semantics.md(出典は makeobj の descriptor/writer/*.cc)

import { decodeString, PakNode } from './parser';
import { OBJ_TYPES } from './schema';

const FOURCC_TO_NAME = new Map(Object.entries(OBJ_TYPES).map(([name, fourcc]) => [fourcc, name]));

export interface XrefTarget {
	/** 参照先のobj_type名。未知の種別は FourCC そのもの */
	type: string;
	name: string;
	fatal: boolean;
}

/** xref ノードの参照先 */
export function xrefTarget(node: PakNode): XrefTarget | undefined {
	const { type, fatal, name } = node.fields;
	if (node.type !== 'xref' || typeof type !== 'number' || !(name instanceof Uint8Array)) {
		return undefined;
	}
	// type は FourCC をリトルエンディアンでu32にしたもの
	const fourcc = String.fromCharCode(type & 0xFF, (type >> 8) & 0xFF, (type >> 16) & 0xFF, type >>> 24);
	return { type: FOURCC_TO_NAME.get(fourcc) ?? fourcc, name: decodeString(name), fatal: fatal !== 0 };
}

/**
 * 「省略された」印のダミーxref(画像リストや煙が無いときに代わりに入る、名前が空のもの)か。
 * 他のオブジェクトへの参照ではない
 */
export function isDummyXref(node: PakNode): boolean {
	const target = xrefTarget(node);
	return target !== undefined && target.name === '' && (target.type === 'imagelist' || target.type === 'smoke');
}

/** node の子それぞれのラベル */
export function childLabels(node: PakNode): string[] {
	const children = node.children;
	const labels = genericLabels(children);

	// 名前を持つオブジェクトは 子0 = 名前、子1 = 著作権表示
	if (children[0]?.type === 'text') {
		labels[0] = 'name';
		if (children[1]?.type === 'text') {
			labels[1] = 'copyright';
		}
	}

	switch (node.type) {
		case 'vehicle': {
			labelAt(labels, children, 2, 'freight');
			labelAt(labels, children, 3, 'smoke');
			labelAt(labels, children, 4, 'emptyimage');
			labelAt(labels, children, 5, 'freightimage');
			const leaders = countField(node, 'leader_count');
			const trailers = countField(node, 'trailer_count');
			const freightImageTypes = countField(node, 'freight_image_type');
			let i = 6;
			for (let k = 0; k < leaders; k++) { labelAt(labels, children, i++, `leader[${k}]`); }
			for (let k = 0; k < trailers; k++) { labelAt(labels, children, i++, `trailer[${k}]`); }
			for (let k = 0; k < freightImageTypes; k++) { labelAt(labels, children, i++, `freightimagetype[${k}]`); }
			// 複数の貨物画像を使うときは、番号の無い貨物に使う既定の貨物が最後に付く
			if (freightImageTypes > 0) { labelAt(labels, children, i, 'freightimagetype[default]'); }
			break;
		}
		case 'factory': {
			// 子0 = 建物、子1 = 煙(FSMO またはダミーxref)、続いて FSUP×n、FPRO×n、FFIE
			labelAt(labels, children, 0, 'building');
			labelAt(labels, children, 1, 'smoke');
			labelByType(labels, children, 'factory_supplier', 'supplier');
			labelByType(labels, children, 'factory_product', 'product');
			labelByType(labels, children, 'factory_field_group', 'fields', false);
			break;
		}
		case 'factory_supplier':
		case 'factory_product':
			labelAt(labels, children, 0, 'good');
			break;
		case 'factory_smoke':
			labelAt(labels, children, 0, 'smoke');
			break;
		case 'factory_field_group':
			labelByType(labels, children, 'factory_field_class', 'field');
			break;
		case 'factory_field_class':
			labelAt(labels, children, 0, 'field');
			break;
		case 'tunnel':
			// way= を指定したときだけ入る
			labelByType(labels, children, 'xref', 'way', false);
			break;
	}
	return labels;
}

/** 既定のラベル: 同じ種別が複数あれば `種別[番号]`、1つだけなら種別名 */
function genericLabels(children: PakNode[]): string[] {
	const total = new Map<string, number>();
	for (const c of children) { total.set(c.type, (total.get(c.type) ?? 0) + 1); }
	const seen = new Map<string, number>();
	return children.map((c) => {
		const n = seen.get(c.type) ?? 0;
		seen.set(c.type, n + 1);
		return total.get(c.type)! > 1 ? `${c.type}[${n}]` : c.type;
	});
}

function labelAt(labels: string[], children: PakNode[], index: number, label: string): void {
	if (index < children.length) {
		labels[index] = label;
	}
}

function labelByType(labels: string[], children: PakNode[], type: string, label: string, indexed = true): void {
	let n = 0;
	children.forEach((c, i) => {
		if (c.type === type) {
			labels[i] = indexed ? `${label}[${n++}]` : label;
		}
	});
}

function countField(node: PakNode, name: string): number {
	const v = node.fields[name];
	return typeof v === 'number' && v > 0 ? v : 0;
}
