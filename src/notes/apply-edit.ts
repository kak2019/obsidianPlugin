import { Notice, type App } from 'obsidian';
import { findOpenMarkdownView } from './active-note';

export type NoteInsertMode = 'cursor' | 'selection' | 'append';

export function applyNoteEdit(app: App, expectedPath: string, content: string): boolean {
	if (!content.trim()) {
		new Notice('没有可写入的内容。');
		return false;
	}
	const view = findOpenMarkdownView(app);
	const file = view?.file;
	if (!view || !file || file.path !== expectedPath) {
		new Notice('当前打开的笔记已经换过，没有写入。');
		return false;
	}
	view.editor.setValue(content);
	new Notice('已写入当前笔记。');
	return true;
}

export function insertIntoActiveNote(app: App, content: string, mode: NoteInsertMode): boolean {
	const text = content.trim();
	if (!text) {
		new Notice('没有可写入的内容。');
		return false;
	}
	const view = findOpenMarkdownView(app);
	if (!view?.file) {
		new Notice('没有找到已打开的笔记。请在主编辑区打开一篇笔记。');
		return false;
	}
	const editor = view.editor;
	if (mode === 'selection') {
		if (view.getMode() === 'preview' || !editor.somethingSelected()) {
			new Notice('请先在笔记里选中要替换的文字。');
			return false;
		}
		editor.replaceSelection(text);
		new Notice('已替换选中内容。');
		return true;
	}
	if (mode === 'append') {
		const current = view.getViewData();
		const prefix = current.length === 0 || current.endsWith('\n') ? '' : '\n\n';
		view.setViewData(`${current}${prefix}${text}\n`, false);
		new Notice('已追加到文末。');
		return true;
	}
	if (view.getMode() === 'preview') {
		const current = view.getViewData();
		const prefix = current.length === 0 || current.endsWith('\n') ? '' : '\n\n';
		view.setViewData(`${current}${prefix}${text}\n`, false);
		new Notice('当前是阅读模式，已追加到文末。');
		return true;
	}
	editor.replaceSelection(text);
	new Notice('已插入到光标处。');
	return true;
}
