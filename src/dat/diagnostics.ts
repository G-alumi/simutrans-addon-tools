import * as vscode from 'vscode';
import { DatObject, parseDat } from './datDocument';
import { checkCounterpart, constraintsOf, IGNORE_ONE_SIDED, isIgnoreOneSided, isVehicleName, objOf, opposite, unknownKeys, VehicleConstraints } from './checks';
import { parseImageRef } from './imageRef';
import { findKeyDef } from './keys';
import { NameIndex } from './nameIndex';
import { PngImage } from './png';
import { referenceTarget } from './references';
import { ADD_TO_IGNORE_LIST_COMMAND, getCellSize, isValidCellSize } from './settings';

const SECTION = 'simutrans-addon-tools';
const SOURCE = 'simutrans';
/** 書き換えてから計算するまでの待ち時間(ミリ秒) */
const DELAY = 300;

type Code = 'unknownKey' | 'unresolvedReference' | 'missingImage' | 'constraintOneSided' | 'constraintMismatch';

/**
 * 開いているdatの警告
 * - 開いたとき・書き換えたときに計算する。開いていないファイルには出さない
 * - ほかのdatの索引、画像ファイル、設定が変わったときは、開いているもの全部を計算し直す
 */
export class DatDiagnostics implements vscode.Disposable {
	private readonly collection = vscode.languages.createDiagnosticCollection('simutrans-dat');
	private readonly timers = new Map<string, NodeJS.Timeout>();
	/** 画像の大きさ(読めなければ null)。更新日時が変わったら読み直す */
	private readonly sizes = new Map<string, { mtime: number; size: Promise<{ width: number; height: number } | null> }>();
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly index: NameIndex) {
		const watcher = vscode.workspace.createFileSystemWatcher('**/*.png');
		const all = () => vscode.workspace.textDocuments.forEach((d) => this.schedule(d));
		this.disposables.push(
			this.collection,
			watcher,
			watcher.onDidCreate(all),
			watcher.onDidChange(all),
			watcher.onDidDelete(all),
			index.onDidChange(all),
			vscode.workspace.onDidOpenTextDocument((d) => this.schedule(d)),
			vscode.workspace.onDidChangeTextDocument((e) => this.schedule(e.document)),
			vscode.workspace.onDidCloseTextDocument((d) => this.collection.delete(d.uri)),
			vscode.workspace.onDidChangeConfiguration((e) => {
				if (e.affectsConfiguration(SECTION)) {
					all();
				}
			}),
		);
		all();
	}

	private schedule(document: vscode.TextDocument) {
		if (document.languageId !== 'simutrans-dat') {
			return;
		}
		const key = document.uri.toString();
		clearTimeout(this.timers.get(key));
		this.timers.set(key, setTimeout(() => {
			this.timers.delete(key);
			this.update(document);
		}, DELAY));
	}

	private async update(document: vscode.TextDocument) {
		const version = document.version;
		const diagnostics = await this.compute(document);
		// 計算中に書き換えられたら、次の計算に任せる
		if (!document.isClosed && document.version === version) {
			this.collection.set(document.uri, diagnostics);
		}
	}

	private async compute(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
		const config = vscode.workspace.getConfiguration(SECTION, document.uri);
		const text = document.getText();
		const lines = text.split(/\r?\n/);
		const result: vscode.Diagnostic[] = [];
		const add = (range: vscode.Range, message: string, code: Code, severity = vscode.DiagnosticSeverity.Warning) => {
			const d = new vscode.Diagnostic(range, message, severity);
			d.source = SOURCE;
			d.code = code;
			result.push(d);
		};
		const checkReferences = config.get<boolean>('diagnostics.unresolvedReference', true);
		const checkConstraints = config.get<boolean>('diagnostics.constraintMismatch', true);
		const ignoreKeys = config.get<string[]>('diagnostics.ignoreKeys', []);
		const ignoreReferences = new Set(config.get<string[]>('diagnostics.ignoreReferences', []));
		const names = checkReferences ? await this.index.allNames() : new Set<string>();
		const vehicles = new Map<string, VehicleConstraints[]>();
		if (checkConstraints) {
			for (const v of await this.index.vehicles()) {
				vehicles.set(v.name, [...vehicles.get(v.name) ?? [], v]);
			}
		}
		const mismatchSeverity = config.get<string>('diagnostics.constraintMismatchSeverity', 'error') === 'warning'
			? vscode.DiagnosticSeverity.Warning
			: vscode.DiagnosticSeverity.Error;

		for (const object of parseDat(text)) {
			if (config.get<boolean>('diagnostics.unknownKey', true)) {
				for (const e of unknownKeys(object, ignoreKeys)) {
					add(new vscode.Range(e.line, 0, e.line, e.key.length), vscode.l10n.t('"{0}" is not read for obj={1}.', e.key, objOf(object)!), 'unknownKey');
				}
			}
			if (checkReferences) {
				for (const e of object.entries) {
					const target = referenceTarget(e.key, e.value);
					if (!target || (target === 'vehicle' && !isVehicleName(e.value))) {
						continue;
					}
					const name = `${target}/${e.value}`;
					if (!names.has(name) && !ignoreReferences.has(name)) {
						add(valueRange(e), vscode.l10n.t('No {0} named "{1}" was found in the workspace.', target, e.value), 'unresolvedReference');
					}
				}
			}
			if (config.get<boolean>('diagnostics.missingImage', true) && !document.isUntitled) {
				for (const [range, message] of await this.checkImages(document, object)) {
					add(range, message, 'missingImage');
				}
			}
			if (checkConstraints && objOf(object) === 'vehicle') {
				this.checkConstraints(object, vehicles, lines, add, mismatchSeverity);
			}
		}
		return result;
	}

	/** 連結設定の食い違い。A(このオブジェクト)の constraint の行に出す */
	private checkConstraints(
		object: DatObject,
		vehicles: Map<string, VehicleConstraints[]>,
		lines: string[],
		add: (range: vscode.Range, message: string, code: Code, severity?: vscode.DiagnosticSeverity) => void,
		mismatchSeverity: vscode.DiagnosticSeverity,
	) {
		const nameEntry = object.entries.find((e) => e.key === 'name');
		if (!nameEntry || nameEntry.value === '') {
			return;
		}
		const aName = nameEntry.value;
		for (const dir of ['prev', 'next'] as const) {
			const opp = opposite(dir);
			for (const e of constraintsOf(object, dir)) {
				const others = vehicles.get(e.value);
				if (!isVehicleName(e.value) || !others) {
					continue;
				}
				const results = others.map((b) => checkCounterpart(aName, b[opp]));
				if (results.includes('ok')) {
					continue;
				}
				if (results.includes('oneSided')) {
					if (!isIgnoreOneSided(lines[e.line - 1] ?? '')) {
						add(valueRange(e), vscode.l10n.t('"{0}" has no constraint[{1}]. They can be coupled, but only one side is set.', e.value, opp), 'constraintOneSided');
					}
				} else {
					add(valueRange(e), vscode.l10n.t('Cannot be coupled because constraint[{1}] of "{0}" does not include this vehicle.', e.value, opp), 'constraintMismatch', mismatchSeverity);
				}
			}
		}
	}

	/** 見つからない画像ファイルと、画像の範囲外のマス */
	private async checkImages(document: vscode.TextDocument, object: DatObject): Promise<[vscode.Range, string][]> {
		const cell = getCellSize(document, object);
		if (!isValidCellSize(cell.size)) {
			return [];
		}
		const obj = objOf(object);
		const dir = vscode.Uri.joinPath(document.uri, '..');
		const result: [vscode.Range, string][] = [];
		for (const e of object.entries) {
			const ref = findKeyDef(obj, e.key)?.value === 'image' ? parseImageRef(e.value) : undefined;
			if (!ref) {
				continue;
			}
			const range = new vscode.Range(e.line, e.valueStart + ref.start, e.line, e.valueStart + ref.end);
			const file = ref.path.replace(/\\/g, '/') + '.png';
			const size = await this.imageSize(vscode.Uri.joinPath(dir, file));
			if (size === undefined) {
				result.push([range, vscode.l10n.t('Image file not found: {0}', file)]);
				continue;
			}
			if (size === null) {
				continue;
			}
			const cols = Math.floor(size.width / cell.size);
			const rows = Math.floor(size.height / cell.size);
			let { row, col } = ref;
			if (col === undefined) {
				// ファイル名.番号 の形。makeobj(image_writer.cc)と同じく、行は「縦のマスの数」で割る
				col = cols > 0 ? row % cols : -1;
				row = rows > 0 ? Math.trunc(row / rows) : -1;
			}
			if (row < 0 || col < 0 || row >= rows || col >= cols) {
				result.push([range, vscode.l10n.t('Row {0}, column {1} is outside the image ({2}x{3}px, cell size {4}px).', row, col, size.width, size.height, cell.size)]);
			}
		}
		return result;
	}

	/** 画像の大きさ。ファイルが無ければ undefined、PNGとして読めなければ null */
	private async imageSize(uri: vscode.Uri): Promise<{ width: number; height: number } | null | undefined> {
		let mtime: number;
		try {
			mtime = (await vscode.workspace.fs.stat(uri)).mtime;
		} catch {
			return undefined;
		}
		const key = uri.toString();
		const cached = this.sizes.get(key);
		if (cached && cached.mtime === mtime) {
			return cached.size;
		}
		const size = Promise.resolve(vscode.workspace.fs.readFile(uri)).then((data) => PngImage.readSize(data), () => null);
		this.sizes.set(key, { mtime, size });
		return size;
	}

	dispose() {
		this.timers.forEach((t) => clearTimeout(t));
		this.disposables.forEach((d) => d.dispose());
	}
}

function valueRange(e: { line: number; valueStart: number; value: string }): vscode.Range {
	return new vscode.Range(e.line, e.valueStart, e.line, e.valueStart + e.value.length);
}

/** 警告のクイックフィックス */
export class DatCodeActionProvider implements vscode.CodeActionProvider {
	static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

	provideCodeActions(document: vscode.TextDocument, _range: vscode.Range, context: vscode.CodeActionContext): vscode.CodeAction[] {
		const actions: vscode.CodeAction[] = [];
		const objects = parseDat(document.getText());
		for (const diagnostic of context.diagnostics) {
			if (diagnostic.source !== SOURCE) {
				continue;
			}
			const line = diagnostic.range.start.line;
			const object = objects.find((o) => o.startLine <= line && line < o.endLine);
			const entry = object?.entries.find((e) => e.line === line);
			if (!object || !entry) {
				continue;
			}
			if (diagnostic.code === 'unknownKey') {
				actions.push(ignoreListAction(document, diagnostic, 'diagnostics.ignoreKeys', `${objOf(object)}/${entry.key}`));
			} else if (diagnostic.code === 'unresolvedReference') {
				actions.push(ignoreListAction(document, diagnostic, 'diagnostics.ignoreReferences', `${referenceTarget(entry.key, entry.value)}/${entry.value}`));
			} else if (diagnostic.code === 'constraintOneSided') {
				const action = new vscode.CodeAction(vscode.l10n.t('Ignore this warning for this line (add a comment)'), vscode.CodeActionKind.QuickFix);
				action.diagnostics = [diagnostic];
				action.edit = new vscode.WorkspaceEdit();
				const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
				action.edit.insert(document.uri, new vscode.Position(line, 0), IGNORE_ONE_SIDED + eol);
				actions.push(action);
			}
		}
		return actions;
	}
}

function ignoreListAction(document: vscode.TextDocument, diagnostic: vscode.Diagnostic, setting: string, value: string): vscode.CodeAction {
	const action = new vscode.CodeAction(vscode.l10n.t('Add {0} to the ignore list', value), vscode.CodeActionKind.QuickFix);
	action.diagnostics = [diagnostic];
	action.command = { title: action.title, command: ADD_TO_IGNORE_LIST_COMMAND, arguments: [document.uri.toString(), setting, value] };
	return action;
}
