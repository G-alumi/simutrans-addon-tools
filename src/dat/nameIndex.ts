import * as vscode from 'vscode';
import { DatName, extractNames } from './datDocument';
import { DatReference, extractReferences } from './references';
import { extractVehicles, VehicleConstraints } from './checks';

/** 索引の1件 */
export interface NameEntry extends DatName {
	uri: vscode.Uri;
}

export interface ReferenceEntry extends DatReference {
	uri: vscode.Uri;
}

/** 同時に読むファイルの数 */
const READ_CONCURRENCY = 16;

/**
 * ワークスペース内のdatの name= と、名前での参照(freight= など)の索引
 * - 起動時に全部のdatを読み、以降はファイルの作成・変更・削除と、開いているdatの編集で更新する
 * - 開いているdatはエディターの内容(保存前のものも)を使う。開いていないものはUTF-8として読む
 */
export class NameIndex implements vscode.Disposable {
	/** datのURIごとの名前と参照 */
	private readonly files = new Map<string, { names: NameEntry[]; refs: ReferenceEntry[]; vehicles: VehicleConstraints[] }>();
	private readonly changed = new vscode.EventEmitter<void>();
	private readonly disposables: vscode.Disposable[] = [];
	/** 索引が変わったとき(ファイルごとに呼ばれる) */
	readonly onDidChange = this.changed.event;
	/** 最初の読み込みが終わったら解決する */
	readonly ready: Promise<void>;

	constructor() {
		const watcher = vscode.workspace.createFileSystemWatcher('**/*.dat');
		this.disposables.push(
			this.changed,
			watcher,
			watcher.onDidCreate((uri) => this.updateFromDisk(uri)),
			watcher.onDidChange((uri) => this.updateFromDisk(uri)),
			watcher.onDidDelete((uri) => this.remove(uri)),
			vscode.workspace.onDidChangeTextDocument((e) => this.updateFromDocument(e.document)),
			// 保存せずに閉じたときは、ファイルの内容に戻す
			vscode.workspace.onDidCloseTextDocument((document) => {
				if (document.languageId === 'simutrans-dat') {
					this.updateFromDisk(document.uri);
				}
			}),
		);
		this.ready = this.build();
	}

	/** 名前が一致するものを返す。obj を渡すと種類も一致するものだけにする */
	async lookup(name: string, obj?: string): Promise<NameEntry[]> {
		await this.ready;
		const result: NameEntry[] = [];
		for (const { names } of this.files.values()) {
			result.push(...names.filter((e) => e.name === name && (obj === undefined || e.obj === obj)));
		}
		return result;
	}

	/** その種類の名前の一覧(重複なし) */
	async namesOf(obj: string): Promise<string[]> {
		await this.ready;
		const result = new Set<string>();
		for (const { names } of this.files.values()) {
			names.filter((e) => e.obj === obj).forEach((e) => result.add(e.name));
		}
		return [...result];
	}

	/** その種類と名前を参照しているところを返す */
	async references(name: string, obj: string): Promise<ReferenceEntry[]> {
		await this.ready;
		const result: ReferenceEntry[] = [];
		for (const { refs } of this.files.values()) {
			result.push(...refs.filter((e) => e.name === name && e.obj === obj));
		}
		return result;
	}

	/** 全部の名前 */
	async allNameEntries(): Promise<NameEntry[]> {
		await this.ready;
		return [...this.files.values()].flatMap((f) => f.names);
	}

	/** 種類と名前の組(`obj/名前`)の一覧 */
	async allNames(): Promise<Set<string>> {
		await this.ready;
		const result = new Set<string>();
		for (const { names } of this.files.values()) {
			names.forEach((e) => result.add(`${e.obj}/${e.name}`));
		}
		return result;
	}

	/** 車両の連結の設定の一覧 */
	async vehicles(): Promise<VehicleConstraints[]> {
		await this.ready;
		return [...this.files.values()].flatMap((f) => f.vehicles);
	}

	private async build(): Promise<void> {
		await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: vscode.l10n.t('Indexing dat files') }, async () => {
			const uris = await vscode.workspace.findFiles('**/*.dat');
			let next = 0;
			const worker = async () => {
				while (next < uris.length) {
					await this.updateFromDisk(uris[next++]);
				}
			};
			await Promise.all(Array.from({ length: READ_CONCURRENCY }, worker));
		});
	}

	private updateFromDocument(document: vscode.TextDocument) {
		if (document.languageId !== 'simutrans-dat' || document.uri.scheme !== 'file') {
			return;
		}
		this.set(document.uri, document.getText());
	}

	private async updateFromDisk(uri: vscode.Uri) {
		// 開いているものはエディターの内容のほうが新しい
		const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
		if (open && !open.isClosed && open.isDirty) {
			this.set(uri, open.getText());
			return;
		}
		try {
			const bytes = await vscode.workspace.fs.readFile(uri);
			// 拡張子が .dat でもdatでないもの(ICUのデータなど)がある。NUL を含むものは読まない
			if (bytes.includes(0)) {
				this.remove(uri);
				return;
			}
			this.set(uri, new TextDecoder('utf-8').decode(bytes));
		} catch {
			this.remove(uri);
		}
	}

	private set(uri: vscode.Uri, text: string) {
		this.files.set(uri.toString(), {
			names: extractNames(text).map((n) => ({ ...n, uri })),
			refs: extractReferences(text).map((r) => ({ ...r, uri })),
			vehicles: extractVehicles(text),
		});
		this.changed.fire();
	}

	private remove(uri: vscode.Uri) {
		if (this.files.delete(uri.toString())) {
			this.changed.fire();
		}
	}

	dispose() {
		this.disposables.forEach((d) => d.dispose());
	}
}
