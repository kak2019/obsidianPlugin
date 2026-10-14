import type NoteAssistantPlugin from '../main';

export function registerCommands(plugin: NoteAssistantPlugin): void {
	plugin.addCommand({
		id: 'open-chat',
		name: '打开对话',
		callback: () => {
			void plugin.activateView();
		},
	});

	plugin.addCommand({
		id: 'rebuild-index',
		name: '重建语义索引',
		callback: () => {
			void plugin.rebuildIndex().catch(() => undefined);
		},
	});
}
