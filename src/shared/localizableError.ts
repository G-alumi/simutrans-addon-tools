/**
 * 画面に出すときに翻訳できるエラー
 * pakやpngの読み込みは VS Code に依存させない(単体テストで動かす)ので、ここでは英語の文と差し込む値だけを持つ。
 * 訳すのは画面に出すところ(localize.ts の errorMessage)
 */
export class LocalizableError extends Error {
	readonly args: (string | number)[];

	/** template は l10n のキー。{0} などに args が入る */
	constructor(readonly template: string, ...args: (string | number)[]) {
		super(template.replace(/\{(\d+)\}/g, (s, i) => String(args[Number(i)] ?? s)));
		this.args = args;
	}
}
