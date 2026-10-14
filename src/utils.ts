export function normalizeBaseUrl(url: string): string {
	return url.trim().replace(/\/+$/, '');
}

export function hashText(text: string): string {
	let hash = 2166136261;
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16);
}

export function titleFromPath(path: string): string {
	const name = path.split('/').pop() ?? path;
	return name.replace(/\.md$/i, '');
}

export function errorMessage(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return '发生了未知错误';
}

export function unwrapMarkdownFence(text: string): string {
	const trimmed = text.trim();
	const match = /^```(?:markdown|md)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
	return match?.[1] ?? trimmed;
}

export function createId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clampTopK(value: number): number {
	if (!Number.isFinite(value)) {
		return 5;
	}
	return Math.min(30, Math.max(1, Math.round(value)));
}

export function uniqueNoteLinks(
	chunks: Array<{ path: string; title: string }>,
): Array<{ path: string; title: string }> {
	const seen = new Set<string>();
	const links: Array<{ path: string; title: string }> = [];
	for (const chunk of chunks) {
		if (seen.has(chunk.path)) {
			continue;
		}
		seen.add(chunk.path);
		links.push({ path: chunk.path, title: chunk.title });
	}
	return links;
}

export function isHiddenPath(path: string): boolean {
	return path.split('/').some((part) => part.startsWith('.'));
}
