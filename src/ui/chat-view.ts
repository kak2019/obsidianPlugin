import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_CHAT } from '../constants';
import type NoteAssistantPlugin from '../main';
import { applyNoteEdit, insertIntoActiveNote, type NoteInsertMode } from '../notes/apply-edit';
import type { ChatMode, UiMessage } from '../types';
import { handleUserMessage } from './conversation';

export class ChatView extends ItemView {
	private messagesEl: HTMLElement | null = null;
	private inputEl: HTMLTextAreaElement | null = null;
	private sendButton: HTMLButtonElement | null = null;
	private askButton: HTMLButtonElement | null = null;
	private editButton: HTMLButtonElement | null = null;
	private webToggle: HTMLInputElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: NoteAssistantPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_CHAT;
	}

	getDisplayText(): string {
		return '笔记助手';
	}

	getIcon(): string {
		return 'message-square';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('note-assistant-view');
		this.buildShell();
		this.renderMessages();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.removeClass('note-assistant-view');
	}

	private buildShell(): void {
		const toolbar = this.contentEl.createDiv({ cls: 'note-assistant-toolbar' });
		this.askButton = toolbar.createEl('button', { text: '问答', cls: 'note-assistant-mode' });
		this.editButton = toolbar.createEl('button', {
			text: '修改当前笔记',
			cls: 'note-assistant-mode',
		});
		const webLabel = toolbar.createEl('label', { cls: 'note-assistant-web' });
		this.webToggle = webLabel.createEl('input', { type: 'checkbox' });
		this.webToggle.checked = this.plugin.chatSession.webSearch;
		webLabel.createSpan({ text: '联网' });

		this.messagesEl = this.contentEl.createDiv({ cls: 'note-assistant-messages' });

		const composer = this.contentEl.createDiv({ cls: 'note-assistant-composer' });
		this.inputEl = composer.createEl('textarea');
		this.sendButton = composer.createEl('button', { text: '发送', cls: 'mod-cta note-assistant-send' });

		this.registerDomEvent(this.askButton, 'click', () => {
			this.setMode('ask');
		});
		this.registerDomEvent(this.editButton, 'click', () => {
			this.setMode('edit');
		});
		this.registerDomEvent(this.webToggle, 'change', () => {
			this.plugin.chatSession.webSearch = this.webToggle?.checked ?? false;
			this.syncChrome();
		});
		this.registerDomEvent(this.sendButton, 'click', () => {
			void this.submit();
		});
		this.registerDomEvent(this.inputEl, 'keydown', (event: KeyboardEvent) => {
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				void this.submit();
			}
		});
		this.syncChrome();
	}

	private setMode(mode: ChatMode): void {
		this.plugin.chatSession.mode = mode;
		this.syncChrome();
	}

	private syncChrome(): void {
		const session = this.plugin.chatSession;
		this.askButton?.classList.toggle('is-active', session.mode === 'ask');
		this.editButton?.classList.toggle('is-active', session.mode === 'edit');
		this.webToggle?.parentElement?.classList.toggle('is-on', session.webSearch);
		if (this.webToggle) {
			this.webToggle.disabled = session.mode === 'edit';
		}
		if (this.inputEl) {
			this.inputEl.placeholder =
				session.mode === 'ask'
					? '输入问题，我会检索相关笔记再回答'
					: '说明要怎么改当前笔记';
		}
		if (this.sendButton) {
			this.sendButton.disabled = session.busy;
		}
		if (this.inputEl) {
			this.inputEl.disabled = session.busy;
		}
	}

	private async submit(): Promise<void> {
		const text = this.inputEl?.value ?? '';
		if (!text.trim() || this.plugin.chatSession.busy) {
			return;
		}
		if (this.inputEl) {
			this.inputEl.value = '';
		}
		await handleUserMessage(this.plugin, text, () => {
			this.renderMessages();
		});
	}

	private renderMessages(): void {
		if (!this.messagesEl) {
			return;
		}
		this.messagesEl.empty();
		for (const message of this.plugin.chatSession.messages) {
			this.renderMessage(message);
		}
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
		this.syncChrome();
	}

	private renderMessage(message: UiMessage): void {
		const row = this.messagesEl?.createDiv({
			cls: `note-assistant-msg is-${message.role} is-${message.kind}`,
		});
		if (!row) {
			return;
		}

		if (message.kind === 'status' || message.kind === 'index-prompt') {
			row.createDiv({ text: message.content, cls: 'note-assistant-plain' });
			return;
		}

		if (message.role === 'user') {
			row.createDiv({ text: message.content, cls: 'note-assistant-plain' });
			return;
		}

		if (message.kind === 'edit-proposal') {
			row.createDiv({ text: '修改预览', cls: 'note-assistant-label' });
			if (message.basedOnPreview) {
				row.createDiv({
					text: '这次基于上一次还没应用的预览。',
					cls: 'note-assistant-hint',
				});
			}
			if (message.inputTruncated) {
				row.createDiv({
					text: '原文超过 3 万字，只发送了前 3 万字。',
					cls: 'note-assistant-hint',
				});
			}
		}

		const body = row.createDiv({ cls: 'note-assistant-body markdown-rendered' });
		void MarkdownRenderer.render(this.app, message.content, body, message.notePath ?? '', this);
		this.renderSources(row, message);
		if (message.kind === 'text') {
			this.renderInsertActions(row, message.content);
		}

		if (message.kind !== 'edit-proposal') {
			return;
		}
		if (message.outputCutOff) {
			row.createDiv({
				text: '回复被长度限制截断了，不能写入笔记。',
				cls: 'note-assistant-hint',
			});
			return;
		}
		if (message.applied) {
			row.createDiv({ text: '已写入当前笔记。', cls: 'note-assistant-hint' });
			return;
		}
		if (message.dismissed) {
			row.createDiv({ text: '已放弃这次修改。', cls: 'note-assistant-hint' });
			return;
		}

		const actions = row.createDiv({ cls: 'note-assistant-actions' });
		const applyButton = actions.createEl('button', {
			text: '覆盖整篇笔记',
			cls: 'note-assistant-chip',
		});
		const dismissButton = actions.createEl('button', {
			text: '放弃',
			cls: 'note-assistant-chip',
		});
		applyButton.addEventListener('click', () => {
			if (!message.notePath) {
				return;
			}
			if (applyNoteEdit(this.app, message.notePath, message.content)) {
				message.applied = true;
				this.renderMessages();
			}
		});
		dismissButton.addEventListener('click', () => {
			message.dismissed = true;
			this.renderMessages();
		});
	}

	private renderInsertActions(row: HTMLElement, content: string): void {
		const actions = row.createDiv({ cls: 'note-assistant-actions' });
		this.addInsertButton(actions, '插入光标处', content, 'cursor');
		this.addInsertButton(actions, '替换选区', content, 'selection');
		this.addInsertButton(actions, '追加到文末', content, 'append');
	}

	private addInsertButton(
		parent: HTMLElement,
		label: string,
		content: string,
		mode: NoteInsertMode,
	): void {
		const button = parent.createEl('button', { text: label, cls: 'note-assistant-chip' });
		button.addEventListener('click', () => {
			insertIntoActiveNote(this.app, content, mode);
		});
	}

	private renderSources(row: HTMLElement, message: UiMessage): void {
		const notes = message.notes ?? [];
		const citations = message.citations ?? [];
		if (notes.length === 0 && citations.length === 0) {
			return;
		}
		const sources = row.createEl('details', { cls: 'note-assistant-sources' });
		const count = notes.length + citations.length;
		sources.createEl('summary', { text: `来源 · ${count}` });
		if (notes.length > 0) {
			const noteList = sources.createDiv({ cls: 'note-assistant-source-list' });
			for (const note of notes) {
				const button = noteList.createEl('button', {
					text: note.title,
					cls: 'note-assistant-chip',
				});
				button.addEventListener('click', () => {
					void this.openNote(note.path);
				});
			}
		}
		if (citations.length > 0) {
			const webList = sources.createDiv({ cls: 'note-assistant-source-list' });
			for (const citation of citations) {
				const label = citation.siteName
					? `${citation.title} · ${citation.siteName}`
					: citation.title;
				const link = webList.createEl('a', { href: citation.url, text: label });
				link.setAttribute('target', '_blank');
				link.setAttribute('rel', 'noopener noreferrer');
			}
		}
	}

	private async openNote(path: string): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		if (!file) {
			new Notice('找不到这篇笔记。');
			return;
		}
		await this.app.workspace.getLeaf('tab').openFile(file);
	}
}
