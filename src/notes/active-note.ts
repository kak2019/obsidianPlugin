import { MarkdownView, type App } from 'obsidian';
import { MAX_NOTE_CHARS } from '../constants';
import type { ActiveNote } from '../types';
import { titleFromPath } from '../utils';

export function findOpenMarkdownView(app: App): MarkdownView | null {
	const active = app.workspace.getActiveViewOfType(MarkdownView);
	if (active?.file) {
		return active;
	}

	const preferredPath =
		app.workspace.activeEditor?.file?.path ?? app.workspace.getActiveFile()?.path ?? null;
	const openViews: MarkdownView[] = [];
	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		if (leaf.view instanceof MarkdownView && leaf.view.file) {
			openViews.push(leaf.view);
		}
	}

	if (preferredPath) {
		const matched = openViews.find((view) => view.file?.path === preferredPath);
		if (matched) {
			return matched;
		}
	}
	return openViews[0] ?? null;
}

export function readActiveNote(app: App): ActiveNote | null {
	const view = findOpenMarkdownView(app);
	const file = view?.file;
	if (!view || !file) {
		return null;
	}
	const content = view.editor.getValue();
	return {
		path: file.path,
		title: titleFromPath(file.path),
		content,
		truncated: content.length > MAX_NOTE_CHARS,
	};
}
