import * as vscode from 'vscode';
import { LocalizableError } from './localizableError';

/** 画面に出すエラーの文。LocalizableError は訳す */
export function errorMessage(err: unknown): string {
	if (err instanceof LocalizableError) {
		return vscode.l10n.t(err.template, ...err.args);
	}
	return err instanceof Error ? err.message : String(err);
}
