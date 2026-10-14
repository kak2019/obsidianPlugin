import { EMBED_BATCH_SIZE } from '../constants';
import type { PluginSettings } from '../types';
import { normalizeBaseUrl } from '../utils';
import { postJson } from './http';

interface EmbeddingResponse {
	data?: Array<{
		index?: number;
		embedding?: number[];
	}>;
}

export async function embedTexts(
	settings: PluginSettings,
	inputs: string[],
): Promise<number[][]> {
	if (inputs.length === 0) {
		return [];
	}

	const url = `${normalizeBaseUrl(settings.embeddingBaseUrl)}/embeddings`;
	const json = (await postJson(
		url,
		{ Authorization: `Bearer ${settings.embeddingApiKey.trim()}` },
		{
			model: settings.embeddingModel.trim(),
			input: inputs,
		},
	)) as EmbeddingResponse;

	const rows = json.data ?? [];
	const ordered = [...rows].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
	if (ordered.length !== inputs.length) {
		throw new Error('Embedding 接口返回的向量数量和文本数量不一致。');
	}

	return ordered.map((row, index) => {
		const embedding = row.embedding;
		if (!embedding || embedding.length === 0) {
			throw new Error(`Embedding 接口没有返回第 ${index + 1} 段文本的向量。`);
		}
		return embedding;
	});
}

export async function embedInBatches(
	settings: PluginSettings,
	inputs: string[],
	onBatch?: (done: number, total: number) => void,
): Promise<number[][]> {
	const vectors: number[][] = [];
	for (let start = 0; start < inputs.length; start += EMBED_BATCH_SIZE) {
		const batch = inputs.slice(start, start + EMBED_BATCH_SIZE);
		const part = await embedTexts(settings, batch);
		vectors.push(...part);
		onBatch?.(Math.min(start + batch.length, inputs.length), inputs.length);
	}
	return vectors;
}
