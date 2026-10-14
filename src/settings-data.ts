import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from './constants';
import type { ChatModelId, PluginSettings } from './types';
import { clampTopK } from './utils';

export const DEFAULT_SETTINGS: PluginSettings = {
	chatApiKey: '',
	chatBaseUrl: 'https://api.xiaomimimo.com/v1',
	chatModel: DEFAULT_CHAT_MODEL,
	embeddingApiKey: '',
	embeddingBaseUrl: '',
	embeddingModel: '',
	topK: 12,
};

export function isChatModel(value: string): value is ChatModelId {
	return (CHAT_MODELS as readonly string[]).includes(value);
}

export function chatConfigError(settings: PluginSettings): string | null {
	if (!settings.chatApiKey.trim()) {
		return '请先在设置里填写 MiMo 的 API Key。';
	}
	if (!settings.chatBaseUrl.trim()) {
		return '请先在设置里填写 MiMo 的 Base URL。';
	}
	if (!settings.chatModel.trim()) {
		return '请先在设置里选择对话模型。';
	}
	return null;
}

export function embeddingConfigError(settings: PluginSettings): string | null {
	if (!settings.embeddingApiKey.trim()) {
		return '请先在设置里填写 Embedding 的 API Key。';
	}
	if (!settings.embeddingBaseUrl.trim()) {
		return '请先在设置里填写 Embedding 的 Base URL。';
	}
	if (!settings.embeddingModel.trim()) {
		return '请先在设置里填写 Embedding 的模型名。';
	}
	return null;
}

export function sanitizeSettings(value: Partial<PluginSettings> | null): PluginSettings {
	const settings = Object.assign({}, DEFAULT_SETTINGS, value);
	if (!isChatModel(settings.chatModel)) {
		settings.chatModel = DEFAULT_CHAT_MODEL;
	}
	settings.topK = clampTopK(settings.topK);
	return settings;
}
