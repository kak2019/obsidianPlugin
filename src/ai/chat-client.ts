import type { ChatTurn, PluginSettings, WebCitation } from '../types';
import { normalizeBaseUrl } from '../utils';
import { postJson } from './http';

export interface ChatResult {
	content: string;
	citations: WebCitation[];
	outputCutOff: boolean;
}

interface ChatResponse {
	choices?: Array<{
		finish_reason?: string;
		message?: {
			content?: string | null;
			annotations?: unknown;
			error_message?: string | null;
		};
	}>;
}

function readCitations(annotations: unknown): WebCitation[] {
	if (!Array.isArray(annotations)) {
		return [];
	}
	const citations: WebCitation[] = [];
	for (const item of annotations) {
		if (!item || typeof item !== 'object') {
			continue;
		}
		const record = item as Record<string, unknown>;
		const url = typeof record.url === 'string' ? record.url : '';
		if (!url) {
			continue;
		}
		const title = typeof record.title === 'string' && record.title ? record.title : url;
		const siteName = typeof record.site_name === 'string' ? record.site_name : '';
		citations.push({ title, url, siteName });
	}
	return citations;
}

export async function completeChat(
	settings: PluginSettings,
	messages: ChatTurn[],
	options: { webSearch: boolean; temperature: number },
): Promise<ChatResult> {
	const url = `${normalizeBaseUrl(settings.chatBaseUrl)}/chat/completions`;
	const body: Record<string, unknown> = {
		model: settings.chatModel,
		messages,
		stream: false,
		temperature: options.temperature,
		max_completion_tokens: 32768,
		thinking: { type: 'disabled' },
	};

	if (options.webSearch) {
		body.tools = [
			{
				type: 'web_search',
				max_keyword: 3,
				force_search: true,
				limit: 5,
			},
		];
		body.tool_choice = 'auto';
	}

	const json = (await postJson(url, { 'api-key': settings.chatApiKey.trim() }, body)) as ChatResponse;
	const choice = json.choices?.[0];
	const message = choice?.message;
	const content = typeof message?.content === 'string' ? message.content.trim() : '';
	const errorMessage = message?.error_message?.trim();

	if (!content) {
		throw new Error(errorMessage || '模型没有返回内容。');
	}

	return {
		content,
		citations: readCitations(message?.annotations),
		outputCutOff: choice?.finish_reason === 'length',
	};
}
