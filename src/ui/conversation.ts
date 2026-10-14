import { HISTORY_TURN_LIMIT, MAX_NOTE_CHARS } from '../constants';
import { completeChat } from '../ai/chat-client';
import type NoteAssistantPlugin from '../main';
import { readActiveNote } from '../notes/active-note';
import { buildAskMessages, buildEditMessages } from '../notes/prompts';
import { chatConfigError } from '../settings-data';
import type { ChatTurn, RetrievedChunk, UiMessage } from '../types';
import {
	createId,
	errorMessage,
	uniqueNoteLinks,
	unwrapMarkdownFence,
} from '../utils';

function priorTurns(messages: UiMessage[]): ChatTurn[] {
	const turns: ChatTurn[] = [];
	for (const message of messages) {
		if (message.role === 'user' && message.kind === 'text') {
			turns.push({ role: 'user', content: message.content });
		} else if (message.kind === 'edit-proposal') {
			turns.push({ role: 'assistant', content: '已生成修改预览。' });
		} else if (message.role === 'assistant' && message.kind === 'text') {
			turns.push({ role: 'assistant', content: message.content });
		}
	}
	return turns.slice(-HISTORY_TURN_LIMIT);
}

function pendingDraft(messages: UiMessage[], path: string): string | null {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (!message || message.kind !== 'edit-proposal' || message.notePath !== path) {
			continue;
		}
		if (message.applied || message.dismissed) {
			return null;
		}
		return message.content;
	}
	return null;
}

function pushMessage(plugin: NoteAssistantPlugin, message: UiMessage): UiMessage {
	plugin.chatSession.messages.push(message);
	return message;
}

export async function handleUserMessage(
	plugin: NoteAssistantPlugin,
	text: string,
	refresh: () => void,
): Promise<void> {
	const session = plugin.chatSession;
	const question = text.trim();
	if (!question || session.busy) {
		return;
	}

	session.busy = true;
	pushMessage(plugin, {
		id: createId(),
		role: 'user',
		kind: 'text',
		content: question,
	});
	const status = pushMessage(plugin, {
		id: createId(),
		role: 'assistant',
		kind: 'status',
		content: '正在回复…',
	});
	refresh();

	try {
		const configError = chatConfigError(plugin.settings);
		if (configError) {
			throw new Error(configError);
		}

		const note = session.mode === 'edit' ? readActiveNote(plugin.app) : null;
		if (session.mode === 'edit' && !note) {
			throw new Error('请先打开一篇 Markdown 笔记。');
		}

		status.content = '正在检索笔记…';
		refresh();
		const chunks = await retrieveContext(plugin, question, note?.path ?? null);
		status.content = '正在回复…';
		refresh();
		const history = priorTurns(session.messages.slice(0, -2));
		const webSearch = session.mode === 'ask' && session.webSearch;

		if (session.mode === 'ask') {
			const result = await completeChat(
				plugin.settings,
				buildAskMessages(history, question, chunks),
				{ webSearch, temperature: 0.7 },
			);
			pushMessage(plugin, {
				id: createId(),
				role: 'assistant',
				kind: 'text',
				content: result.content,
				notes: uniqueNoteLinks(chunks),
				citations: result.citations,
			});
			return;
		}

		if (!note) {
			throw new Error('请先打开一篇 Markdown 笔记。');
		}
		const pending = pendingDraft(session.messages.slice(0, -2), note.path);
		const draft = pending ?? note.content;
		const fromPreview = pending !== null;
		const result = await completeChat(
			plugin.settings,
			buildEditMessages(history, question, note, draft, fromPreview, chunks),
			{ webSearch: false, temperature: 0.3 },
		);
		pushMessage(plugin, {
			id: createId(),
			role: 'assistant',
			kind: 'edit-proposal',
			content: unwrapMarkdownFence(result.content),
			notePath: note.path,
			notes: uniqueNoteLinks(chunks),
			basedOnPreview: fromPreview,
			inputTruncated: draft.length > MAX_NOTE_CHARS,
			outputCutOff: result.outputCutOff,
		});
	} catch (error) {
		pushMessage(plugin, {
			id: createId(),
			role: 'assistant',
			kind: 'text',
			content: errorMessage(error),
		});
	} finally {
		session.messages = session.messages.filter((message) => message.id !== status.id);
		session.busy = false;
		refresh();
	}
}

async function retrieveContext(
	plugin: NoteAssistantPlugin,
	query: string,
	excludePath: string | null,
): Promise<RetrievedChunk[]> {
	await plugin.lexical.ensureReady();
	const lexical = plugin.lexical.search(query, excludePath, plugin.settings.topK);
	if (!plugin.index.hasIndex()) {
		return lexical;
	}
	try {
		const semantic = await plugin.index.search(query, excludePath);
		return mergeChunks(lexical, semantic, plugin.settings.topK);
	} catch {
		return lexical;
	}
}

function mergeChunks(
	primary: RetrievedChunk[],
	extra: RetrievedChunk[],
	limit: number,
): RetrievedChunk[] {
	const merged: RetrievedChunk[] = [];
	const seen = new Set<string>();
	const add = (chunk: RetrievedChunk | undefined) => {
		if (!chunk || merged.length >= limit) {
			return;
		}
		const key = `${chunk.path}\n${chunk.text.slice(0, 80)}`;
		if (seen.has(key)) {
			return;
		}
		seen.add(key);
		merged.push(chunk);
	};
	const length = Math.max(primary.length, extra.length);
	for (let index = 0; index < length; index++) {
		add(primary[index]);
		add(extra[index]);
	}
	return merged;
}
