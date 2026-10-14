import { MAX_NOTE_CHARS } from '../constants';
import type { ActiveNote, ChatTurn, RetrievedChunk } from '../types';

function formatChunk(chunk: RetrievedChunk): string {
	const heading = chunk.heading ? ` / ${chunk.heading}` : '';
	return `笔记：[[${chunk.title}]]（${chunk.path}${heading}）\n${chunk.text}`;
}

function formatContext(chunks: RetrievedChunk[]): string {
	if (chunks.length === 0) {
		return '没有检索到相关笔记。';
	}
	return chunks.map(formatChunk).join('\n\n');
}

export function buildAskMessages(
	history: ChatTurn[],
	question: string,
	chunks: RetrievedChunk[],
): ChatTurn[] {
	return [
		{
			role: 'system',
			content:
				'你是 Obsidian 笔记助手。请用中文回答。优先依据给出的笔记片段，不要编造笔记里没有的内容。用到某篇笔记时写出 [[笔记名]]。如果片段不够，就直接说明。',
		},
		{
			role: 'system',
			content: `相关笔记片段：\n\n${formatContext(chunks)}`,
		},
		...history,
		{ role: 'user', content: question },
	];
}

export function buildEditMessages(
	history: ChatTurn[],
	instruction: string,
	note: ActiveNote,
	draft: string,
	fromPreview: boolean,
	chunks: RetrievedChunk[],
): ChatTurn[] {
	const source = fromPreview
		? '下面是上一轮还没写入文件的预览，请在这个版本上继续修改。'
		: '下面是当前打开的笔记正文。';
	const truncated = draft.length > MAX_NOTE_CHARS;
	const body = truncated ? draft.slice(0, MAX_NOTE_CHARS) : draft;
	const truncation = truncated ? '\n\n（正文过长，以上只包含前 30000 字。）' : '';
	const content = [
		`笔记路径：${note.path}`,
		source,
		body,
		truncation,
		'',
		'参考笔记：',
		formatContext(chunks),
		'',
		'修改要求：',
		instruction,
		'',
		'只输出修改后的完整 Markdown 正文，不要代码围栏，不要解释。',
	].join('\n');

	return [
		{
			role: 'system',
			content: '你是 Obsidian 笔记编辑助手。按用户要求改写当前笔记，只返回修改后的完整 Markdown。',
		},
		...history,
		{ role: 'user', content },
	];
}
