import { Notice, Plugin, TFile, TFolder } from 'obsidian';
import { registerCommands } from './commands';
import { VIEW_TYPE_CHAT } from './constants';
import { EmbeddingIndex } from './index/embedding-index';
import { LexicalIndex } from './index/lexical-index';
import { sanitizeSettings } from './settings-data';
import { NoteAssistantSettingTab } from './settings';
import type { ChatSession, PluginSettings } from './types';
import { ChatView } from './ui/chat-view';
import { errorMessage } from './utils';

export default class NoteAssistantPlugin extends Plugin {
	settings!: PluginSettings;
	index!: EmbeddingIndex;
	lexical!: LexicalIndex;
	chatSession: ChatSession = {
		mode: 'ask',
		webSearch: false,
		busy: false,
		messages: [],
	};

	async onload(): Promise<void> {
		await this.loadSettings();
		this.index = new EmbeddingIndex(this);
		await this.index.load();
		this.lexical = new LexicalIndex(this.app);
		void this.lexical.ensureReady();

		this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));
		this.addRibbonIcon('message-square', '打开笔记助手', () => {
			void this.activateView();
		});
		registerCommands(this);
		this.registerVaultWatch();
		this.addSettingTab(new NoteAssistantSettingTab(this.app, this));
	}

	onunload(): void {
		this.index.destroy();
		this.lexical.destroy();
	}

	async loadSettings(): Promise<void> {
		this.settings = sanitizeSettings((await this.loadData()) as Partial<PluginSettings> | null);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHAT);
		const openLeaf = existing[0];
		if (openLeaf) {
			await this.app.workspace.revealLeaf(openLeaf);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) {
			new Notice('无法打开侧边栏。');
			return;
		}
		await leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	async rebuildIndex(onProgress?: (done: number, total: number) => void): Promise<void> {
		const notice = new Notice('正在建立语义索引…', 0);
		try {
			await this.index.rebuildAll((done, total) => {
				notice.setMessage(`正在建立语义索引… ${done}/${total}`);
				onProgress?.(done, total);
			});
			const status = this.index.getStatus();
			notice.setMessage(`语义索引已更新，共 ${status.chunkCount} 个片段`);
		} catch (error) {
			notice.setMessage(errorMessage(error));
			throw error;
		} finally {
			window.setTimeout(() => notice.hide(), 4000);
		}
	}

	private registerVaultWatch(): void {
		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.index.scheduleUpdate(file.path);
					this.lexical.scheduleUpdate(file.path);
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.index.scheduleUpdate(file.path);
					this.lexical.scheduleUpdate(file.path);
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.index.scheduleRemove(file.path);
					this.lexical.scheduleRemove(file.path);
				} else if (file instanceof TFolder) {
					this.index.scheduleRemovePrefix(file.path);
					this.lexical.scheduleRemovePrefix(file.path);
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.index.scheduleRename(oldPath, file.path, false);
					this.lexical.scheduleRename(oldPath, file.path, false);
				} else if (file instanceof TFolder) {
					this.index.scheduleRename(oldPath, file.path, true);
					this.lexical.scheduleRename(oldPath, file.path, true);
				}
			}),
		);
	}
}
