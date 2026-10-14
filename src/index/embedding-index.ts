import { Notice, type App } from 'obsidian';
import { embedInBatches } from '../ai/embedding-client';
import { INDEX_FILE_NAME, INDEX_VERSION } from '../constants';
import { embeddingConfigError } from '../settings-data';
import type { IndexStatus, PluginSettings, RetrievedChunk } from '../types';
import { errorMessage, hashText, isHiddenPath, titleFromPath } from '../utils';
import { chunkMarkdown } from './chunk';
import { rankChunks } from './similarity';

export class IndexMissingError extends Error {
	constructor() {
		super('还没有语义索引。');
		this.name = 'IndexMissingError';
	}
}

export class IndexModelMismatchError extends Error {
	constructor(indexedModel: string, currentModel: string) {
		super(`索引是用模型 ${indexedModel} 建立的，当前设置是 ${currentModel}。请重建索引。`);
		this.name = 'IndexModelMismatchError';
	}
}

interface FileRecord {
	mtime: number;
	hash: string;
	chunkIds: string[];
}

interface StoredChunk {
	id: string;
	path: string;
	title: string;
	heading: string;
	text: string;
	embedding: number[];
}

interface StoredIndex {
	version: number;
	model: string;
	updatedAt: number;
	files: Record<string, FileRecord>;
	chunks: StoredChunk[];
}

export interface IndexHost {
	app: App;
	manifest: { id: string };
	settings: PluginSettings;
}

interface PreparedFile {
	path: string;
	title: string;
	mtime: number;
	hash: string;
	chunks: Array<{ heading: string; text: string }>;
}

export class EmbeddingIndex {
	private data: StoredIndex | null = null;
	private building = false;
	private readonly timers = new Map<string, number>();
	private readonly deferred: Array<() => Promise<void>> = [];

	constructor(private readonly host: IndexHost) {}

	async load(): Promise<void> {
		const path = this.indexPath();
		if (!(await this.host.app.vault.adapter.exists(path))) {
			this.data = null;
			return;
		}
		try {
			const raw = await this.host.app.vault.adapter.read(path);
			this.data = parseIndex(raw);
		} catch {
			this.data = null;
			new Notice('语义索引文件无法读取，请重建索引。');
		}
	}

	destroy(): void {
		for (const timer of this.timers.values()) {
			window.clearTimeout(timer);
		}
		this.timers.clear();
		this.deferred.splice(0);
	}

	isBuilding(): boolean {
		return this.building;
	}

	hasIndex(): boolean {
		return this.data !== null;
	}

	getStatus(): IndexStatus {
		return {
			ready: this.data !== null,
			chunkCount: this.data?.chunks.length ?? 0,
			fileCount: this.data ? Object.keys(this.data.files).length : 0,
			updatedAt: this.data?.updatedAt ?? 0,
			model: this.data?.model ?? '',
		};
	}

	scheduleUpdate(path: string): void {
		if (!this.hasIndex() && !this.building) {
			return;
		}
		const existing = this.timers.get(path);
		if (existing !== undefined) {
			window.clearTimeout(existing);
		}
		const timer = window.setTimeout(() => {
			this.timers.delete(path);
			this.runOrDefer(() => this.updateFile(path));
		}, 2000);
		this.timers.set(path, timer);
	}

	scheduleRemove(path: string): void {
		if (!this.hasIndex() && !this.building) {
			return;
		}
		this.clearTimer(path);
		this.runOrDefer(() => this.removeFile(path));
	}

	scheduleRemovePrefix(folderPath: string): void {
		if (!this.hasIndex() && !this.building) {
			return;
		}
		this.runOrDefer(() => this.removePrefix(folderPath));
	}

	scheduleRename(oldPath: string, newPath: string, isFolder: boolean): void {
		if (!this.hasIndex() && !this.building) {
			return;
		}
		this.clearTimer(oldPath);
		this.runOrDefer(() =>
			isFolder ? this.renamePrefix(oldPath, newPath) : this.renameFile(oldPath, newPath),
		);
	}

	async rebuildAll(onProgress?: (done: number, total: number) => void): Promise<void> {
		const problem = embeddingConfigError(this.host.settings);
		if (problem) {
			throw new Error(problem);
		}
		if (this.building) {
			throw new Error('索引正在建立。');
		}

		this.building = true;
		try {
			const prepared = await this.prepareFiles();
			const texts = prepared.flatMap((file) => file.chunks.map((chunk) => chunk.text));
			const vectors = await embedInBatches(this.host.settings, texts, onProgress);
			if (vectors.length !== texts.length) {
				throw new Error('Embedding 接口返回的向量数量和文本数量不一致。');
			}

			const next = this.assemble(prepared, vectors);
			this.data = next;
			await this.save();
		} finally {
			this.building = false;
			await this.flushDeferred();
		}
	}

	async search(query: string, excludePath: string | null): Promise<RetrievedChunk[]> {
		const problem = embeddingConfigError(this.host.settings);
		if (problem) {
			throw new Error(problem);
		}
		if (!this.data) {
			throw new IndexMissingError();
		}
		const currentModel = this.host.settings.embeddingModel.trim();
		if (this.data.model !== currentModel) {
			throw new IndexModelMismatchError(this.data.model, currentModel);
		}

		const vectors = await embedInBatches(this.host.settings, [query.slice(0, 2000)]);
		const queryVector = vectors[0];
		if (!queryVector) {
			throw new Error('Embedding 接口没有返回向量。');
		}
		return rankChunks(this.data.chunks, queryVector, this.host.settings.topK, excludePath);
	}

	private async prepareFiles(): Promise<PreparedFile[]> {
		const prepared: PreparedFile[] = [];
		for (const file of this.host.app.vault.getMarkdownFiles()) {
			if (isHiddenPath(file.path)) {
				continue;
			}
			try {
				const content = await this.host.app.vault.cachedRead(file);
				prepared.push({
					path: file.path,
					title: titleFromPath(file.path),
					mtime: file.stat.mtime,
					hash: hashText(content),
					chunks: chunkMarkdown(content, titleFromPath(file.path)),
				});
			} catch {
				new Notice(`跳过无法读取的笔记：${file.path}`);
			}
		}
		return prepared;
	}

	private assemble(files: PreparedFile[], vectors: number[][]): StoredIndex {
		const index: StoredIndex = {
			version: INDEX_VERSION,
			model: this.host.settings.embeddingModel.trim(),
			updatedAt: Date.now(),
			files: {},
			chunks: [],
		};
		let cursor = 0;
		for (const file of files) {
			const chunkIds: string[] = [];
			file.chunks.forEach((chunk, chunkIndex) => {
				const embedding = vectors[cursor];
				cursor += 1;
				if (!embedding) {
					return;
				}
				const id = `${file.path}::${chunkIndex}`;
				chunkIds.push(id);
				index.chunks.push({
					id,
					path: file.path,
					title: file.title,
					heading: chunk.heading,
					text: chunk.text,
					embedding,
				});
			});
			index.files[file.path] = {
				mtime: file.mtime,
				hash: file.hash,
				chunkIds,
			};
		}
		return index;
	}

	private async updateFile(path: string): Promise<void> {
		if (!this.data || isHiddenPath(path)) {
			return;
		}
		const file = this.host.app.vault.getFileByPath(path);
		if (!file || file.extension !== 'md') {
			await this.removeFile(path);
			return;
		}
		const content = await this.host.app.vault.cachedRead(file);
		const hash = hashText(content);
		if (this.data.files[path]?.hash === hash) {
			return;
		}
		const title = titleFromPath(path);
		const chunks = chunkMarkdown(content, title);
		const vectors = await embedInBatches(
			this.host.settings,
			chunks.map((chunk) => chunk.text),
		);
		this.removeChunks(path);
		const chunkIds: string[] = [];
		chunks.forEach((chunk, chunkIndex) => {
			const embedding = vectors[chunkIndex];
			if (!embedding) {
				return;
			}
			const id = `${path}::${chunkIndex}`;
			chunkIds.push(id);
			this.data?.chunks.push({
				id,
				path,
				title,
				heading: chunk.heading,
				text: chunk.text,
				embedding,
			});
		});
		if (this.data) {
			this.data.files[path] = { mtime: file.stat.mtime, hash, chunkIds };
			this.data.updatedAt = Date.now();
			await this.save();
		}
	}

	private async removeFile(path: string): Promise<void> {
		if (!this.data || !this.data.files[path]) {
			return;
		}
		this.removeChunks(path);
		this.data.updatedAt = Date.now();
		await this.save();
	}

	private async removePrefix(folderPath: string): Promise<void> {
		if (!this.data) {
			return;
		}
		const prefix = `${folderPath.replace(/\/+$/, '')}/`;
		const paths = Object.keys(this.data.files).filter((path) => path.startsWith(prefix));
		if (paths.length === 0) {
			return;
		}
		for (const path of paths) {
			this.removeChunks(path);
		}
		this.data.updatedAt = Date.now();
		await this.save();
	}

	private async renameFile(oldPath: string, newPath: string): Promise<void> {
		if (!this.data) {
			return;
		}
		const record = this.data.files[oldPath];
		if (!record) {
			await this.updateFile(newPath);
			return;
		}
		this.retargetChunks(oldPath, newPath);
		delete this.data.files[oldPath];
		this.data.files[newPath] = record;
		this.data.updatedAt = Date.now();
		await this.save();
	}

	private async renamePrefix(oldPath: string, newPath: string): Promise<void> {
		if (!this.data) {
			return;
		}
		const oldPrefix = `${oldPath.replace(/\/+$/, '')}/`;
		const newPrefix = `${newPath.replace(/\/+$/, '')}/`;
		const paths = Object.keys(this.data.files).filter((path) => path.startsWith(oldPrefix));
		for (const path of paths) {
			const record = this.data.files[path];
			if (!record) {
				continue;
			}
			const nextPath = `${newPrefix}${path.slice(oldPrefix.length)}`;
			this.retargetChunks(path, nextPath);
			delete this.data.files[path];
			this.data.files[nextPath] = record;
		}
		if (paths.length > 0) {
			this.data.updatedAt = Date.now();
			await this.save();
		}
	}

	private retargetChunks(oldPath: string, newPath: string): void {
		if (!this.data) {
			return;
		}
		const title = titleFromPath(newPath);
		const chunkIds: string[] = [];
		for (const chunk of this.data.chunks) {
			if (chunk.path !== oldPath) {
				continue;
			}
			const suffix = chunk.id.split('::').pop() ?? '0';
			chunk.path = newPath;
			chunk.title = title;
			chunk.id = `${newPath}::${suffix}`;
			chunkIds.push(chunk.id);
		}
		const record = this.data.files[oldPath] ?? this.data.files[newPath];
		if (record) {
			record.chunkIds = chunkIds;
		}
	}

	private removeChunks(path: string): void {
		if (!this.data) {
			return;
		}
		this.data.chunks = this.data.chunks.filter((chunk) => chunk.path !== path);
		delete this.data.files[path];
	}

	private async save(): Promise<void> {
		if (!this.data) {
			return;
		}
		await this.host.app.vault.adapter.write(this.indexPath(), JSON.stringify(this.data));
	}

	private indexPath(): string {
		return `${this.host.app.vault.configDir}/plugins/${this.host.manifest.id}/${INDEX_FILE_NAME}`;
	}

	private clearTimer(path: string): void {
		const existing = this.timers.get(path);
		if (existing !== undefined) {
			window.clearTimeout(existing);
			this.timers.delete(path);
		}
	}

	private runOrDefer(task: () => Promise<void>): void {
		if (this.building) {
			this.deferred.push(task);
			return;
		}
		void task().catch((error: unknown) => {
			new Notice(errorMessage(error));
		});
	}

	private async flushDeferred(): Promise<void> {
		const tasks = this.deferred.splice(0);
		for (const task of tasks) {
			try {
				await task();
			} catch (error) {
				new Notice(errorMessage(error));
			}
		}
	}
}

function parseIndex(raw: string): StoredIndex | null {
	const parsed: unknown = JSON.parse(raw);
	if (!parsed || typeof parsed !== 'object') {
		return null;
	}
	const record = parsed as Partial<StoredIndex>;
	if (record.version !== INDEX_VERSION || !record.model || !record.files || !Array.isArray(record.chunks)) {
		return null;
	}
	return {
		version: INDEX_VERSION,
		model: record.model,
		updatedAt: record.updatedAt ?? 0,
		files: record.files,
		chunks: record.chunks,
	};
}
