import { CHUNK_OVERLAP, CHUNK_SIZE, MAX_CHUNKS_PER_FILE, MAX_INDEX_CHARS } from '../constants';

export interface RawChunk {
	heading: string;
	text: string;
}

interface Section {
	heading: string;
	body: string;
}

function splitWindow(text: string, size: number, overlap: number): string[] {
	if (text.length <= size) {
		return [text];
	}
	const step = Math.max(1, size - overlap);
	const parts: string[] = [];
	for (let start = 0; start < text.length; start += step) {
		parts.push(text.slice(start, start + size));
		if (start + size >= text.length) {
			break;
		}
	}
	return parts;
}

function splitSections(content: string): Section[] {
	const lines = content.split(/\r?\n/);
	const sections: Section[] = [];
	let heading = '';
	let body: string[] = [];

	const push = () => {
		sections.push({ heading, body: body.join('\n') });
	};

	for (const line of lines) {
		const match = /^(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
		if (match) {
			if (heading || body.some((item) => item.trim())) {
				push();
			}
			heading = match[2] ?? '';
			body = [];
		} else {
			body.push(line);
		}
	}

	if (heading || body.some((item) => item.trim())) {
		push();
	}
	return sections;
}

export function chunkMarkdown(content: string, title: string): RawChunk[] {
	const limited = content.slice(0, MAX_INDEX_CHARS);
	const chunks: RawChunk[] = [];

	for (const section of splitSections(limited)) {
		for (const piece of splitWindow(section.body, CHUNK_SIZE, CHUNK_OVERLAP)) {
			const text = piece.trim();
			if (!text) {
				continue;
			}
			chunks.push({
				heading: section.heading || title,
				text: section.heading ? `${section.heading}\n${text}` : text,
			});
			if (chunks.length >= MAX_CHUNKS_PER_FILE) {
				return chunks;
			}
		}
	}

	if (chunks.length === 0 && limited.trim()) {
		chunks.push({
			heading: title,
			text: limited.trim().slice(0, CHUNK_SIZE),
		});
	}
	return chunks;
}
