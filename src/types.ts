import { CHAT_MODELS } from './constants';

export type ChatModelId = (typeof CHAT_MODELS)[number];

export interface PluginSettings {
	chatApiKey: string;
	chatBaseUrl: string;
	chatModel: ChatModelId;
	embeddingApiKey: string;
	embeddingBaseUrl: string;
	embeddingModel: string;
	topK: number;
}

export interface RetrievedChunk {
	path: string;
	title: string;
	heading: string;
	text: string;
	score: number;
}

export interface NoteLink {
	path: string;
	title: string;
}

export interface WebCitation {
	title: string;
	url: string;
	siteName: string;
}

export interface ChatTurn {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export type ChatMode = 'ask' | 'edit';

export type UiMessageKind = 'text' | 'edit-proposal' | 'status' | 'index-prompt';

export interface UiMessage {
	id: string;
	role: 'user' | 'assistant';
	kind: UiMessageKind;
	content: string;
	notePath?: string;
	notes?: NoteLink[];
	citations?: WebCitation[];
	applied?: boolean;
	dismissed?: boolean;
	basedOnPreview?: boolean;
	inputTruncated?: boolean;
	outputCutOff?: boolean;
}

export interface ChatSession {
	mode: ChatMode;
	webSearch: boolean;
	busy: boolean;
	messages: UiMessage[];
}

export interface ActiveNote {
	path: string;
	title: string;
	content: string;
	truncated: boolean;
}

export interface IndexStatus {
	ready: boolean;
	chunkCount: number;
	fileCount: number;
	updatedAt: number;
	model: string;
}
