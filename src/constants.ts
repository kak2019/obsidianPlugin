export const VIEW_TYPE_CHAT = 'note-assistant-chat';

export const CHAT_MODELS = [
	'mimo-v2.6-pro',
	'mimo-v2.6-flash',
	'mimo-v2.6-pro-ultraspeed',
] as const;

export const DEFAULT_CHAT_BASE_URL = 'https://api.xiaomimimo.com/v1';
export const DEFAULT_CHAT_MODEL = 'mimo-v2.6-pro-ultraspeed';

export const CHUNK_SIZE = 1500;
export const CHUNK_OVERLAP = 200;
export const MAX_CHUNKS_PER_FILE = 200;
export const MAX_INDEX_CHARS = 200_000;
export const MAX_NOTE_CHARS = 30_000;
export const EMBED_BATCH_SIZE = 16;
export const HISTORY_TURN_LIMIT = 10;
export const INDEX_VERSION = 1;
export const INDEX_FILE_NAME = 'embedding-index.json';
