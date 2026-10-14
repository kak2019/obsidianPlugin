import type { App } from 'obsidian';
import type { RetrievedChunk } from '../types';
import { hashText, isHiddenPath, titleFromPath } from '../utils';
import { chunkMarkdown } from './chunk';

interface LexChunk {
	path: string;
	title: string;
	heading: string;
	text: string;
	terms: Map<string, number>;
}

export interface LexicalStatus {
	ready: boolean;
	building: boolean;
	fileCount: number;
	chunkCount: number;
}

export class LexicalIndex {
	private ready = false;
	private building = false;
	private chunks: LexChunk[] = [];
	private documentFrequency = new Map<string, number>();
	private fileHashes = new Map<string, string>();
	private pendingBuild: Promise<void> | null = null;
	private readonly timers = new Map<string, number>();
	private readonly deferred: Array<() => Promise<void> | void> = [];

	constructor(private readonly app: App) {}

	getStatus(): LexicalStatus {
		return {
			ready: this.ready,
			building: this.building,
			fileCount: this.fileHashes.size,
			chunkCount: this.chunks.length,
		};
	}

	ensureReady(): Promise<void> {
		if (this.ready) {
			return Promise.resolve();
		}
		if (!this.pendingBuild) {
			this.pendingBuild = this.rebuild().finally(() => {
				this.pendingBuild = null;
			});
		}
		return this.pendingBuild;
	}

	search(query: string, excludePath: string | null, topK: number): RetrievedChunk[] {
		const queryTerms = uniqueTerms(tokenize(query));
		if (queryTerms.length === 0 || this.chunks.length === 0) {
			return [];
		}
		const total = this.chunks.length;
		const scored: RetrievedChunk[] = [];
		for (const chunk of this.chunks) {
			if (excludePath && chunk.path === excludePath) {
				continue;
			}
			let score = 0;
			for (const term of queryTerms) {
				const frequency = chunk.terms.get(term) ?? 0;
				if (frequency === 0) {
					continue;
				}
				const docs = this.documentFrequency.get(term) ?? 0;
				const idf = Math.log(1 + (total - docs + 0.5) / (docs + 0.5));
				score += idf * (frequency / (frequency + 1));
			}
			if (queryTerms.some((term) => chunk.title.toLowerCase().includes(term))) {
				score += 1.5;
			}
			if (score <= 0) {
				continue;
			}
			scored.push({
				path: chunk.path,
				title: chunk.title,
				heading: chunk.heading,
				text: chunk.text,
				score,
			});
		}
		scored.sort((left, right) => right.score - left.score);
		return scored.slice(0, Math.max(0, topK));
	}

	scheduleUpdate(path: string): void {
		if (!this.ready && !this.building) {
			return;
		}
		const existing = this.timers.get(path);
		if (existing !== undefined) {
			window.clearTimeout(existing);
		}
		const timer = window.setTimeout(() => {
			this.timers.delete(path);
			this.runOrDefer(() => this.updateFile(path));
		}, 1500);
		this.timers.set(path, timer);
	}

	scheduleRemove(path: string): void {
		if (!this.ready && !this.building) {
			return;
		}
		this.clearTimer(path);
		this.runOrDefer(() => this.removeFile(path));
	}

	scheduleRemovePrefix(folderPath: string): void {
		if (!this.ready && !this.building) {
			return;
		}
		this.runOrDefer(() => this.removePrefix(folderPath));
	}

	scheduleRename(oldPath: string, newPath: string, isFolder: boolean): void {
		if (!this.ready && !this.building) {
			return;
		}
		this.clearTimer(oldPath);
		this.runOrDefer(() =>
			isFolder ? this.renamePrefix(oldPath, newPath) : this.renameFile(oldPath, newPath),
		);
	}

	destroy(): void {
		for (const timer of this.timers.values()) {
			window.clearTimeout(timer);
		}
		this.timers.clear();
		this.deferred.splice(0);
	}

	private async rebuild(): Promise<void> {
		this.building = true;
		try {
			const nextChunks: LexChunk[] = [];
			const nextHashes = new Map<string, string>();
			for (const file of this.app.vault.getMarkdownFiles()) {
				if (isHiddenPath(file.path)) {
					continue;
				}
				try {
					const content = await this.app.vault.cachedRead(file);
					const title = titleFromPath(file.path);
					nextHashes.set(file.path, hashText(content));
					nextChunks.push(...chunksFor(file.path, title, content));
				} catch {
					continue;
				}
			}
			this.chunks = nextChunks;
			this.fileHashes = nextHashes;
			this.recomputeFrequency();
			this.ready = true;
		} finally {
			this.building = false;
			await this.flushDeferred();
		}
	}

	private async updateFile(path: string): Promise<void> {
		if (isHiddenPath(path)) {
			return;
		}
		const file = this.app.vault.getFileByPath(path);
		if (!file || file.extension !== 'md') {
			this.removeFile(path);
			return;
		}
		const content = await this.app.vault.cachedRead(file);
		const hash = hashText(content);
		if (this.fileHashes.get(path) === hash) {
			return;
		}
		this.removeFile(path);
		const title = titleFromPath(path);
		this.chunks.push(...chunksFor(path, title, content));
		this.fileHashes.set(path, hash);
		this.recomputeFrequency();
	}

	private removeFile(path: string): void {
		this.chunks = this.chunks.filter((chunk) => chunk.path !== path);
		this.fileHashes.delete(path);
		this.recomputeFrequency();
	}

	private removePrefix(folderPath: string): void {
		const prefix = `${folderPath.replace(/\/+$/, '')}/`;
		this.chunks = this.chunks.filter((chunk) => !chunk.path.startsWith(prefix));
		for (const path of [...this.fileHashes.keys()]) {
			if (path.startsWith(prefix)) {
				this.fileHashes.delete(path);
			}
		}
		this.recomputeFrequency();
	}

	private async renameFile(oldPath: string, newPath: string): Promise<void> {
		if (!this.fileHashes.has(oldPath)) {
			await this.updateFile(newPath);
			return;
		}
		const title = titleFromPath(newPath);
		for (const chunk of this.chunks) {
			if (chunk.path === oldPath) {
				chunk.path = newPath;
				chunk.title = title;
			}
		}
		const hash = this.fileHashes.get(oldPath);
		this.fileHashes.delete(oldPath);
		if (hash) {
			this.fileHashes.set(newPath, hash);
		}
	}

	private async renamePrefix(oldPath: string, newPath: string): Promise<void> {
		const oldPrefix = `${oldPath.replace(/\/+$/, '')}/`;
		const newPrefix = `${newPath.replace(/\/+$/, '')}/`;
		for (const chunk of this.chunks) {
			if (!chunk.path.startsWith(oldPrefix)) {
				continue;
			}
			chunk.path = `${newPrefix}${chunk.path.slice(oldPrefix.length)}`;
			chunk.title = titleFromPath(chunk.path);
		}
		for (const path of [...this.fileHashes.keys()]) {
			if (!path.startsWith(oldPrefix)) {
				continue;
			}
			const hash = this.fileHashes.get(path);
			this.fileHashes.delete(path);
			if (hash) {
				this.fileHashes.set(`${newPrefix}${path.slice(oldPrefix.length)}`, hash);
			}
		}
	}

	private recomputeFrequency(): void {
		this.documentFrequency.clear();
		for (const chunk of this.chunks) {
			for (const term of chunk.terms.keys()) {
				this.documentFrequency.set(term, (this.documentFrequency.get(term) ?? 0) + 1);
			}
		}
	}

	private clearTimer(path: string): void {
		const existing = this.timers.get(path);
		if (existing !== undefined) {
			window.clearTimeout(existing);
			this.timers.delete(path);
		}
	}

	private runOrDefer(task: () => Promise<void> | void): void {
		if (this.building) {
			this.deferred.push(task);
			return;
		}
		void task();
	}

	private async flushDeferred(): Promise<void> {
		const tasks = this.deferred.splice(0);
		for (const task of tasks) {
			await task();
		}
	}
}

function chunksFor(path: string, title: string, content: string): LexChunk[] {
	const raw = chunkMarkdown(content, title);
	const source = raw.length > 0 ? raw : [{ heading: title, text: title }];
	return source.map((chunk) => ({
		path,
		title,
		heading: chunk.heading,
		text: chunk.text,
		terms: termFrequency(tokenize(chunk.text)),
	}));
}

function tokenize(text: string): string[] {
	const tokens: string[] = [];
	const latin = text.toLowerCase().match(/[a-z0-9_]+/g);
	if (latin) {
		tokens.push(...latin);
	}
	const cjkRuns = text.match(/[\u3400-\u9fff]+/g);
	if (cjkRuns) {
		for (const run of cjkRuns) {
			if (run.length === 1) {
				tokens.push(run);
				continue;
			}
			for (let index = 0; index < run.length - 1; index++) {
				tokens.push(run.slice(index, index + 2));
			}
		}
	}
	return tokens;
}

function uniqueTerms(tokens: string[]): string[] {
	return [...new Set(tokens)];
}

function termFrequency(tokens: string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const token of tokens) {
		counts.set(token, (counts.get(token) ?? 0) + 1);
	}
	return counts;
}
