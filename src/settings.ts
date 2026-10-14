import { App, PluginSettingTab, Setting } from 'obsidian';
import type NoteAssistantPlugin from './main';
import { isChatModel } from './settings-data';
import { clampTopK } from './utils';

export class NoteAssistantSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: NoteAssistantPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('对话模型')
			.setDesc(
				'问题和笔记内容会发送到这个地址。API Key 只保存在本机。打开联网后会使用 MiMo 搜索，按次计费，需先在 MiMo 控制台开通联网服务。',
			)
			.setHeading();

		new Setting(containerEl)
			.setName('MiMo API Key')
			.addText((text) => {
				text.inputEl.type = 'password';
				text
					.setPlaceholder('输入 MiMo API Key')
					.setValue(this.plugin.settings.chatApiKey)
					.onChange(async (value) => {
						this.plugin.settings.chatApiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('MiMo Base URL')
			.setDesc('不要带 /chat/completions。')
			.addText((text) => {
				text
					.setPlaceholder('https://api.xiaomimimo.com/v1')
					.setValue(this.plugin.settings.chatBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.chatBaseUrl = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('对话模型')
			.addDropdown((dropdown) => {
				dropdown.addOption('mimo-v2.6-pro', 'MiMo V2.6 Pro');
				dropdown.addOption('mimo-v2.6-flash', 'MiMo V2.6 Flash');
				dropdown.addOption('mimo-v2.6-pro-ultraspeed', 'MiMo V2.6 Pro UltraSpeed');
				dropdown.setValue(this.plugin.settings.chatModel);
				dropdown.onChange(async (value) => {
					if (!isChatModel(value)) {
						return;
					}
					this.plugin.settings.chatModel = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Embedding')
			.setDesc(
				'可选。本地全文检索已经覆盖库里的 Markdown。填好后重建语义索引，提问时会额外用向量补充相关笔记。',
			)
			.setHeading();

		new Setting(containerEl)
			.setName('Embedding API Key')
			.addText((text) => {
				text.inputEl.type = 'password';
				text
					.setPlaceholder('输入 Embedding API Key')
					.setValue(this.plugin.settings.embeddingApiKey)
					.onChange(async (value) => {
						this.plugin.settings.embeddingApiKey = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Embedding Base URL')
			.setDesc('OpenAI 兼容地址，不要带 /embeddings。例如 https://api.openai.com/v1')
			.addText((text) => {
				text
					.setPlaceholder('https://api.openai.com/v1')
					.setValue(this.plugin.settings.embeddingBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.embeddingBaseUrl = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Embedding 模型名')
			.addText((text) => {
				text
					.setPlaceholder('text-embedding-3-small')
					.setValue(this.plugin.settings.embeddingModel)
					.onChange(async (value) => {
						this.plugin.settings.embeddingModel = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('检索条数')
			.setDesc('每次提问最多带上的相关片段数，最多 30。')
			.addText((text) => {
				text.inputEl.type = 'number';
				text
					.setValue(String(this.plugin.settings.topK))
					.onChange(async (value) => {
						this.plugin.settings.topK = clampTopK(Number(value));
						await this.plugin.saveSettings();
					});
			});

		const local = this.plugin.lexical.getStatus();
		new Setting(containerEl)
			.setName('本地全文检索')
			.setDesc(
				local.ready
					? `已覆盖 ${local.fileCount} 篇 Markdown，${local.chunkCount} 个片段。索引留在本机，不会为此把笔记发出去。`
					: '正在读取库里的 Markdown…',
			);

		const status = this.plugin.index.getStatus();
		const updated = status.updatedAt
			? new Date(status.updatedAt).toLocaleString()
			: '尚未建立';
		const model = status.model || '无';
		new Setting(containerEl)
			.setName('语义索引')
			.setDesc(
				status.ready
					? `${status.fileCount} 篇笔记，${status.chunkCount} 个片段。模型：${model}。更新时间：${updated}。`
					: '尚未建立。这是可选的语义补充，建立时会把笔记片段发送到 Embedding 接口。',
			)
			.addButton((button) => {
				button.setButtonText('重建索引');
				button.onClick(() => {
					void this.plugin.rebuildIndex().then(
						() => {
							this.display();
						},
						() => {
							this.display();
						},
					);
				});
			});
	}
}
