import type { RetrievedChunk } from '../types';

interface RankedSource {
	path: string;
	title: string;
	heading: string;
	text: string;
	embedding: number[];
}

export function cosineSimilarity(left: number[], right: number[]): number {
	if (left.length === 0 || left.length !== right.length) {
		return 0;
	}
	let dot = 0;
	let leftNorm = 0;
	let rightNorm = 0;
	for (let index = 0; index < left.length; index++) {
		const leftValue = left[index] ?? 0;
		const rightValue = right[index] ?? 0;
		dot += leftValue * rightValue;
		leftNorm += leftValue * leftValue;
		rightNorm += rightValue * rightValue;
	}
	if (leftNorm === 0 || rightNorm === 0) {
		return 0;
	}
	return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function rankChunks(
	chunks: RankedSource[],
	query: number[],
	topK: number,
	excludePath: string | null,
): RetrievedChunk[] {
	const scored: RetrievedChunk[] = [];
	for (const chunk of chunks) {
		if (excludePath && chunk.path === excludePath) {
			continue;
		}
		scored.push({
			path: chunk.path,
			title: chunk.title,
			heading: chunk.heading,
			text: chunk.text,
			score: cosineSimilarity(chunk.embedding, query),
		});
	}
	scored.sort((left, right) => right.score - left.score);
	return scored.slice(0, Math.max(0, topK));
}
