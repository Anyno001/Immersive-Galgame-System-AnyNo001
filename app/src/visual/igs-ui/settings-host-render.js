// 设置器的快照与各页 HTML：只读草稿和异步状态生成标记，不碰 DOM；挂载、事件和保存在 settings-host.js。
import { buildIgsTextPayload, normalizeSourceFilter, normalizeVirtualRegex } from '../../scene/message-source.js';
import { dropConfirmedOutfitReview } from '../../scene/outfit-review-store.js';
import { assetOwnerKey, assetShadowsGlobal, draftEffectiveAssets, effectiveSceneAssets, rememberAssetScope } from '../../scene/asset-scope.js';
import { getSillyTavernContext } from '../../host/tavern-helper-adapter.js';
import { menuItem, renderOutfitReviewList, renderRowMenu, renderWardrobe } from './settings-outfit-fields.js';
import { normalizeItemImageSettings } from '../../generated-images/illustration/item-image-settings.js';
import { createCgLibraryView } from './cg-library-view.js';
import { renderPerformancePresetBar, renderPerformanceSettings } from './performance-settings-layout.js';
import { renderWorldviewRow } from './worldview-fields.js';
import { renderQualityRow } from './render-quality-fields.js';
import { isGeneratedAssetUrl, normalizeGeneratedLibrary } from '../../scene/asset-match.js';
import { createOutfitResolver } from '../../scene/character-outfits.js';
import { renderEventCgList } from './settings-event-cg.js';
import { CHARACTER_ADD_MENU, renderDnaCandidateBar, renderDnaOnlyCharacterList, kindModelPicker } from './settings-fields.js';
import { NSFW_COUNT_MAX, normalizeAutoIllustrationSettings } from '../../generated-images/illustration/auto-illustration-settings.js';
import { describeLlmReady } from '../../generated-images/illustration/caption-writer.js';
import { normalizeImageSourceMode, mergeLegacyNaiSettings } from '../../generated-images/image-backend.js';
import { getSettingsShellTemplate } from './settings-shell.js';
import { getImageSubTabTemplate, getReaderSubTabTemplate, getSettingsTabTemplate, normalizeImageSubTab, normalizeSceneSubTab, normalizeReaderSubTab, IMAGE_SUBTAB_DEFS, SCENE_RULES_TEMPLATE, SCENE_SUBTAB_DEFS, READER_SUBTAB_DEFS, SETTINGS_TAB_DEFS } from './settings-tabs.js';
import { getReaderModeIcon } from './icons.js';
import { renderPromptKindsPanel } from './settings-prompt-kinds.js';
import { normalizeSettingsTheme, renderSettingsThemeSwitch } from './settings-theme.js';
import { fontOptionsWith, loadCustomFonts, registerCustomFonts } from '../../media/custom-fonts.js';
import { DIALOG_FONT_OPTIONS, PROMPT_RULE_OFF_HINT, PROMPT_RULE_OUTFIT_HINT, PROMPT_RULE_PRESET_HINT, scenePromptRuleOutfitHint, SETTINGS_PANEL_REQUIRED_SELECTORS, SETTINGS_PANEL_TAB_CONTRACT } from './reader-host-constants.js';
import { PUBLIC_READER_MODES, getReaderModeLabel } from '../../schemas/reader-mode.js';
import { esc, toHex } from './reader-value-utils.js';
import { checkbox, colorInput, field, renderCharacterAssetList, renderMoodGroupList, renderMoodReviewList, renderPinnedButtons, renderSceneAssetList, renderGeneratedAssetPane, countGeneratedWaiting, renderStageShakeSettings, renderChatShowSettings, renderSystemRoleSettings, renderWeatherFxSettings, renderCustomFontManager, renderTemplate, rangeInput, secretInput, segmentedInput, selectInput, textInput, textareaInput, numberInput, hiddenAttr, modelPicker, tableMultiSelect } from './settings-fields.js';
import { normalizeSettingsTab, normalizeSpriteDefaultScale, normalizeSpriteDisplayScale, normalizeSpriteGenderScale } from './settings-normalize.js';
import { createShujukuClient } from '../../data/shujuku/client.js';
import { listStatusHudTables, normalizeStatusHudSettings } from '../../data/shujuku/status-hud-model.js';
import { isStatusHudPhone, renderStatusHudPositionField, statusHudPositionDevice } from './status-hud-position-fields.js';
import { renderSectionResetButton, sectionResetPlaceholders } from './settings-sections.js';
import { normalizeImageJobLogSettings, formatImageJobLogTime, imageJobLogLevelLabel } from '../../generated-images/image-job-log.js';
import { normalizeImageCacheCount } from '../../media/tavern-image-cache.js';
import { resolveWorldview } from '../../scene/worldview.js';
import { loadAssetFoldersFor } from './asset-folders.js';
import { isLayeredPreset, loadLegacyPresets, legacyPresetHasContent, presetCardLayers } from '../../scene/legacy-preset.js';
import { renderAssetFolderView, renderAssetFolderSelect } from './asset-folder-view.js';
import { loadMoodReview } from '../../scene/mood-review-store.js';
import { CLASSIC_DIALOG_THEME_DEFAULTS, DIALOG_SKIN_GRADIENT_VEIL, DIALOG_SKIN_WESTERN_CLASSIC, isIllustratedDialogSkin, supportsDialogAutoHeight } from './classic-dialog-skin.js';
import { DIALOG_SKIN_CHOICES, dialogSkinLabel } from './dialog-skin-catalog.js';
import { DIALOG_SKIN_MAGIC_ACADEMY, MAGIC_HOUSES, normalizeMagicAccent, normalizeMagicHouse } from './dialog-theme-css-skins.js';
import { VOICE_BARK_FREQUENCIES, normalizeVoiceBarkSettings } from './voice-bark.js';
import { TTS_BILINGUAL_MODES, TTS_PROVIDERS, TTS_RATES, TTS_TRANSPORTS, normalizeTtsSettings, systemVoiceOptions, ttsApiVoiceList } from './tts.js';
import { normalizeBilingualSettings } from './bilingual-text.js';
import { HORROR_DREAD_CAP_LABELS, HORROR_DREAD_LEVELS, normalizeHorrorDreadCap } from './horror-dread.js';
import { DIALOG_SKIN_HORROR_GORE, DIALOG_SKIN_HORROR_PSYCH } from './dialog-theme-horror.js';
import { SKIN_DIALOG_SCALE_OPTIONS } from './dialog-skin-frame.js';
import { normalizeStageShakeSettings } from './stage-shake-runtime.js';
import { normalizeWeatherFxSettings } from './weather-fx-runtime.js';
import { normalizeTypewriterSettings } from './typewriter-runtime.js';
import { TYPEWRITER_VOICE_LABELS } from './typewriter-audio.js';
import { normalizeChatShowSettings } from './chat-show-runtime.js';
import { normalizeSystemRoleSettings } from './system-role.js';
import { normalizePromptPlacement } from './tag-grammar.js';
import { resolveRenderQuality } from './render-quality.js';

const ASSET_MOVE_ALL_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>';

export function createSettingsRenderer({ normalizeUnifiedSettings, options, rerenderSettings, settingsShellHtml, state }) {
    function buildSettingsSnapshot(settingsState) {
        // 阅读器页的「适配世界」与本卡对话框皮肤提示都按当前角色卡显示，渲染前先记下是哪张卡（素材页在自己的分支里记）。
        if (normalizeSettingsTab(settingsState.tab) === 'reader') rememberAssetScope(settingsState, getSillyTavernContext(options.global || globalThis));
        const draft = normalizeUnifiedSettings(settingsState.draft);
        const tab = normalizeSettingsTab(settingsState.tab);
        const imageSubTab = tab === 'image' ? normalizeImageSubTab(settingsState.asyncState.imageSubTab) : null;
        const readerSubTab = tab === 'reader' ? normalizeReaderSubTab(settingsState.asyncState.readerSubTab) : null;
        const sceneSubTab = tab === 'scene' ? normalizeSceneSubTab(settingsState.asyncState.sceneSubTab) : null;
        const settingsTheme = normalizeSettingsTheme(draft.bridge.settingsTheme);
        const body = renderSettingsBody(tab, draft, settingsState.asyncState);
        const tabsHtml = SETTINGS_TAB_DEFS.map(([id, label]) => {
            return `<button type="button" class="igs-settings-tab${tab === id ? ' is-active' : ''}" data-tab="${id}">${label}</button>`;
        }).join('');
        const shellHtml = renderTemplate(getSettingsShellTemplate(), {
            version: esc(options.version || '0.5.4'),
            tabs: tabsHtml,
            body,
            settingsThemeSwitch: renderSettingsThemeSwitch(settingsTheme),
        });

        const snapshot = {
            tab,
            imageSubTab,
            readerSubTab,
            sceneSubTab,
            settingsTheme,
            settingsThemeSwitch: renderSettingsThemeSwitch(settingsTheme),
            selectors: Array.from(SETTINGS_PANEL_REQUIRED_SELECTORS),
            tabs: SETTINGS_TAB_DEFS.map(([id, label]) => ({
                id,
                label,
                active: id === tab,
                requiredPaths: Array.from((SETTINGS_PANEL_TAB_CONTRACT[id] || {}).requiredPaths || []),
                requiredActions: Array.from((SETTINGS_PANEL_TAB_CONTRACT[id] || {}).requiredActions || []),
            })),
            activeContract: SETTINGS_PANEL_TAB_CONTRACT[tab],
            html: `<div id="igs-unified-settings" data-igs-igs-ui="true" data-igs-settings-theme="${settingsTheme}"${settingsLowQuality(settingsState.draft) ? ' data-igs-quality="low"' : ''}>${shellHtml}</div>`,
            resultText: {
                image: settingsState.asyncState.imageResult || '',
                imageModels: settingsState.asyncState.imageModelsMessage || '',
                llmModels: settingsState.asyncState.llmModelsMessage || '',
                naiModels: settingsState.asyncState.naiModelsMessage || '',
                virtualRegex: settingsState.asyncState.virtualRegexPreview || '',
                promptRule: settingsState.asyncState.promptRuleStatus || '',
                promptRuleDraft: settingsState.asyncState.promptRuleDraft,
            },
            draft,
        };
        settingsShellHtml.set(snapshot, { theme: settingsTheme, html: shellHtml });
        return snapshot;
    }

    function renderSettingsBody(tab, draft, asyncState) {
        function buildStatusHudSettingsHtml(reader, options) {
            const statusHud = normalizeStatusHudSettings(reader && reader.statusHud);
            const sectionClass = 'igs-settings-section igs-status-hud-section';
            const toggle = checkbox('readerSettings.statusHud.enabled', statusHud.enabled, '显示状态栏');
            if (!statusHud.enabled) {
                return `<div class="${sectionClass}" data-status-hud>${toggle}</div>`;
            }
            const win = options.global || globalThis;
            const api = win.AutoCardUpdaterAPI || null;
            const listed = api ? listStatusHudTables(createShujukuClient(api).readTables()) : { ok: false, reason: 'missing-api', tables: [] };
            const body = [
                toggle,
                '<div class="igs-settings-sub">',
                checkbox('readerSettings.statusHud.showEmotion', statusHud.showEmotion, '显示情绪标签'),
                checkbox('readerSettings.statusHud.showLocation', statusHud.showLocation, '显示地点栏（仅旁白）'),
                statusHud.showLocation ? `<div class="igs-settings-sub">${checkbox('readerSettings.statusHud.showLocationDetails', statusHud.showLocationDetails, '显示更多的场景信息')}</div>` : '',
                '<div class="igs-source-filter-grid">',
                field('readerSettings.statusHud.size', '状态栏大小', segmentedInput('readerSettings.statusHud.size', statusHud.size, [['small', '小'], ['medium', '中'], ['large', '大']], '状态栏大小')),
                // 头像圆角、背景、配色直接摊开，不再收进「高级」。
                field('readerSettings.statusHud.avatarRadius', '头像圆角', selectInput('readerSettings.statusHud.avatarRadius', statusHud.avatarRadius, [['square', '方角'], ['soft', '微圆角'], ['small', '小圆角'], ['medium', '中圆角'], ['large', '大圆角'], ['circle', '圆形']])),
                '</div>',
                renderStatusHudPositionField(statusHud, statusHudPositionDevice(asyncState, win), isStatusHudPhone(win) ? 'mobile' : 'pc'),
                `<div class="igs-settings-field"><span>显示的表格</span>${tableMultiSelect('readerSettings.statusHud.tables', statusHud.tables, listed.tables, { note: listed.ok ? '' : '数据库插件未就绪' })}</div>`,
                '<div class="igs-source-filter-grid">',
                field('readerSettings.statusHud.background', '状态栏背景', segmentedInput('readerSettings.statusHud.background', statusHud.background, [['none', '无背景'], ['dialog', '跟随对话框']], '状态栏背景')),
                field('readerSettings.statusHud.barColor', 'HUD条配色', segmentedInput('readerSettings.statusHud.barColor', statusHud.barColor, [['color', '彩色'], ['grayscale', '灰白']], 'HUD条配色')),
                '</div>',
                '</div>',
            ].join('');
            return `<div class="${sectionClass}" data-status-hud>${body}</div>`;
        }

        const bridge = draft.bridge;
        const worldviewAssets = asyncState.assetScopeKey
            ? effectiveSceneAssets(bridge.sceneAssets, asyncState.assetScopeKey)
            : bridge.sceneAssets;
        const imageApi = bridge.imageApi;
        // 分类型模型的下拉：除内置列表外，再并入「拉取模型」拿到的结果。
        const pulledImageModels = [].concat(asyncState.naiModels || [], imageApi.availableModels || []);
        const sourceFilter = bridge.sourceFilter;
        const reader = draft.readerSettings;

        const advancedOpen = (key) => (asyncState.advancedOpen && asyncState.advancedOpen[key] ? ' open' : '');

        if (tab === 'basic') {
            return renderTemplate(getSettingsTabTemplate('basic'), {
                performancePresetBar: renderPerformancePresetBar(reader, { home: true, canUndo: Boolean(asyncState.perfPresetUndo), extraRows: renderWorldviewRow(worldviewAssets) + renderQualityRow(reader) }),
                advancedFilterOpen: advancedOpen('source-filter'),
                // 解析出错时的应急项：强行指定这一楼的图片数量，多截少补。
            imageCountField: field('readerSettings.imageCountOverride', '检测图像数量', selectInput('readerSettings.imageCountOverride', reader.imageCountOverride === null ? 'null' : reader.imageCountOverride, [['null', '自动']].concat(Array.from({ length: 20 }, (_, index) => [index + 1, `${index + 1}张`])))),
                advancedRegexOpen: advancedOpen('virtual-regex'),
                advancedBodyFormatOpen: advancedOpen('body-format'),
                openModeField: `<div class="igs-segmented-field">${field(
                    'bridge.openMode',
                    '打开方式',
                    segmentedInput(
                        'bridge.openMode',
                        bridge.openMode,
                        PUBLIC_READER_MODES.map((id) => [id, getReaderModeLabel(id), getReaderModeIcon(id)]),
                        '打开方式',
                    ),
                )}</div>`,
                settingsToggles: checkbox('bridge.showToasts', bridge.showToasts, '显示提示弹窗'),
                resetBasicSourceFilter: renderSectionResetButton('basic-source-filter'),
                filterToggle: checkbox('bridge.sourceFilter.enabled', sourceFilter.enabled, '启用标签筛选'),
                filterHidden: hiddenAttr(!sourceFilter.enabled),
                // 低频设置：平时整块收成一行，摘要只说开没开。
                filterBrief: sourceFilter.enabled ? '已启用' : '未启用',
                regexBrief: bridge.virtualRegex.enabled ? '已启用' : '未启用',
                filterOptionToggles: checkbox('bridge.sourceFilter.stripHtmlComments', sourceFilter.stripHtmlComments, '排除HTML注释')
                    + checkbox(
                        'bridge.sourceFilter.allowUntaggedFallback',
                        sourceFilter.allowUntaggedFallback,
                        '正文保留标签为空时读取清洗全文',
                    ),
                textIncludeField: field('bridge.sourceFilter.textIncludeTags', '正文保留标签', textareaInput('bridge.sourceFilter.textIncludeTags', sourceFilter.textIncludeTags, 'content')),
                textExcludeField: field('bridge.sourceFilter.textExcludeTags', '正文排除标签', textareaInput('bridge.sourceFilter.textExcludeTags', sourceFilter.textExcludeTags)),
                htmlCardField: field('bridge.sourceFilter.htmlCardTags', 'HTML卡片标签（整块单独成页渲染）', textareaInput('bridge.sourceFilter.htmlCardTags', sourceFilter.htmlCardTags, 'htm1fenge')),
                imageIncludeField: field('bridge.sourceFilter.imageIncludeTags', '图片保留标签', textareaInput('bridge.sourceFilter.imageIncludeTags', sourceFilter.imageIncludeTags, 'image&#10;text_to_image')),
                regexToggle: checkbox('bridge.virtualRegex.enabled', bridge.virtualRegex.enabled, '启用正文格式化'),
                regexHidden: hiddenAttr(!bridge.virtualRegex.enabled),
                regexPatternField: field('bridge.virtualRegex.pattern', '查找表达式', textareaInput('bridge.virtualRegex.pattern', bridge.virtualRegex.pattern, '^@bubble:([^|\\n]+)\\|[^|\\n]*\\|\\[?([^\\n]*?)\\]?$')),
                regexFlagsField: field('bridge.virtualRegex.flags', 'flags', textInput('bridge.virtualRegex.flags', bridge.virtualRegex.flags, 'i')),
                regexReplacementField: field('bridge.virtualRegex.replacement', '替换文本', textareaInput('bridge.virtualRegex.replacement', bridge.virtualRegex.replacement, '[$1]：$2')),
                regexExtraRules: (() => {
                    const rules = Array.isArray(bridge.virtualRegex.rules) ? bridge.virtualRegex.rules : [];
                    return `<div class="igs-settings-full igs-settings-sub igs-regex-extra-rules">
                        <div class="igs-settings-section-head"><div class="igs-settings-subhead">自定义规则（依上下顺序生效）</div><button class="igs-settings-action" data-action="add-virtual-regex" type="button">新增一条</button></div>
                        ${rules.map((rule, index) => `<div class="igs-settings-sub igs-regex-extra-rule">
                            <div class="igs-settings-row"><strong>追加规则 ${index + 1}</strong><button class="igs-settings-action" data-action="remove-virtual-regex:${index}" type="button">删除</button></div>
                            <div class="igs-source-filter-grid">
                                ${field(`bridge.virtualRegex.rules.${index}.pattern`, '查找表达式', textareaInput(`bridge.virtualRegex.rules.${index}.pattern`, rule.pattern, '输入正则表达式'))}
                                ${field(`bridge.virtualRegex.rules.${index}.flags`, 'flags', textInput(`bridge.virtualRegex.rules.${index}.flags`, rule.flags, 'i'))}
                                <div class="igs-settings-full">${field(`bridge.virtualRegex.rules.${index}.replacement`, '替换文本', textareaInput(`bridge.virtualRegex.rules.${index}.replacement`, rule.replacement, '输入替换文本'))}</div>
                            </div>
                        </div>`).join('')}
                    </div>`;
                })(),
                regexPreview: esc(asyncState.virtualRegexPreview || ''),
            });
        }

        if (tab === 'image') {
            const sourceMode = normalizeImageSourceMode(imageApi.mode);
            const auto = normalizeAutoIllustrationSettings(mergeLegacyNaiSettings(bridge.autoIllustration, imageApi));
            const sourceNotes = {
                nai: '使用你的NAI Key直接生成剧情CG、素材和重画。',
                dbgen: '提示词、画师串和NAI Key在数据库生图插件里设置。',
                extension: '画风沿用智绘姬；填写 NAI Key 后，生成失败时将改用 NAI。',
                baibai: '后端与画风沿用柏宝绘；填写 NAI Key 后，生成失败时将改用 NAI。',
            };
            const contentNotes = {
                nai: '当前图像来源：IGS内置NAI。',
                dbgen: '当前图像来源：数据库生图插件。',
                extension: '当前图像来源：智绘姬。',
                baibai: '当前图像来源：柏宝绘。',
            };
            const openaiDisabled = auto.llm.source !== 'openai';
            const llmReady = describeLlmReady(auto.llm);
            const autoTextarea = (path, value, placeholder) => `<textarea data-path="${esc(path)}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
            const imageSubTab = normalizeImageSubTab(asyncState.imageSubTab);
            const logSettings = normalizeImageJobLogSettings(bridge.imageJobLog);
            const imageFields = {
                imageLogRetainDaysField: field('bridge.imageJobLog.retainDays', '自动清理：保留天数（0为不按时间清理）', numberInput('bridge.imageJobLog.retainDays', logSettings.retainDays, 0, 30)),
                imageLogMaxEntriesField: field('bridge.imageJobLog.maxEntries', '自动清理：最多保留条数', numberInput('bridge.imageJobLog.maxEntries', logSettings.maxEntries, 50, 1000)),
                imageLogStatus: esc(asyncState.imageLogStatus || ''),
                imageLogList: imageSubTab === 'logs' ? renderImageJobLogList() : '',
                imageCacheCountField: field('bridge.imageCache.maxCount', '本地缓存张数', numberInput('bridge.imageCache.maxCount', normalizeImageCacheCount(bridge.imageCache && bridge.imageCache.maxCount), 1, 2000)),
                imageCgStatus: esc(asyncState.imageCgStatus || ''),
                imageCgList: imageSubTab === 'cg' ? renderImageCgList() : '',
                imageCgOldestFirst: String(Boolean(asyncState.imageCg && asyncState.imageCg.state.filters.oldestFirst)),
                imageCgOrderLabel: asyncState.imageCg && asyncState.imageCg.state.filters.oldestFirst ? '最早在前' : '最新在前',
                imageSourceField: field('bridge.imageApi.mode', '图像来源', segmentedInput('bridge.imageApi.mode', sourceMode, [['nai', 'IGS内置NAI'], ['dbgen', '数据库生图插件'], ['extension', '智绘姬'], ['baibai', '柏宝绘']], '图像来源')),
                imageSourceNote: esc(sourceNotes[sourceMode]),
                imageContentNote: esc(contentNotes[sourceMode]),
                sourceNaiHidden: hiddenAttr(sourceMode === 'dbgen'),
                sourceExtensionHidden: hiddenAttr(sourceMode !== 'extension'),
                sourceDbgenHidden: hiddenAttr(sourceMode !== 'dbgen'),
                dbgenSpriteTransparentField: checkbox('bridge.imageApi.dbgenSpriteTransparent', imageApi.dbgenSpriteTransparent !== false, '立绘透明底（V4.5 请关闭，关闭后改为白色背景）'),
                advancedNaiOpen: advancedOpen('nai'),
                advancedExtensionOpen: advancedOpen('extension'),
                advancedNsfwOpen: advancedOpen('nsfw'),
                advancedAssetTemplatesOpen: advancedOpen('asset-templates'),
                autoAssetOptionsHidden: hiddenAttr(!auto.assets.spriteEnabled && !auto.assets.backgroundEnabled),
                assetSceneWarnHidden: hiddenAttr(!(auto.assets.spriteEnabled || auto.assets.backgroundEnabled) || Boolean(bridge.sceneAssets && bridge.sceneAssets.enabled)),
                autoLlmNote: esc(sourceMode === 'dbgen'
                    ? '负责规划剧情CG画面与素材补全的标签；表情差分、头像、立绘与服装提示词由数据库生图插件自行编写。'
                    : '负责编写剧情 CG、素材、立绘和表情的提示词；可沿用酒馆 API。'),
                adapterField: field('bridge.imageApi.externalAdapter', '识别范围', selectInput('bridge.imageApi.externalAdapter', imageApi.externalAdapter, [['auto', '自动检测'], ['chatu8', '仅智绘姬（st-chatu8）']])),
                pollIntervalField: field('bridge.imageApi.pollIntervalMs', '等待新图：查询间隔（毫秒）', numberInput('bridge.imageApi.pollIntervalMs', imageApi.pollIntervalMs, 500, 30000)),
                pollAttemptsField: field('bridge.imageApi.pollAttempts', '等待新图：查询次数', numberInput('bridge.imageApi.pollAttempts', imageApi.pollAttempts, 1, 240)),
                imageTestActionLabel: sourceMode === 'extension' ? '检测智绘姬' : (sourceMode === 'dbgen' ? '检测并测试生成' : '测试生成'),
                imageTestHelp: esc(asyncState.imageResult || ''),
                autoNsfwField: checkbox('bridge.autoIllustration.nsfwEnabled', auto.nsfwEnabled, 'NSFW自动生图'),
                autoNsfwHidden: hiddenAttr(!auto.nsfwEnabled),
                autoNsfwCountField: field('bridge.autoIllustration.nsfwCount', '每层张数', numberInput('bridge.autoIllustration.nsfwCount', auto.nsfwCount, 1, NSFW_COUNT_MAX)),
                autoInterludeField: checkbox('bridge.autoIllustration.interludeEnabled', auto.interludeEnabled, '过场插图'),
                autoInterludeHidden: hiddenAttr(!auto.interludeEnabled),
                autoInterludeProbabilityField: field('bridge.autoIllustration.interludeProbability', '触发概率 %', numberInput('bridge.autoIllustration.interludeProbability', auto.interludeProbability, 0, 100)),
                autoInterludeMaxField: field('bridge.autoIllustration.interludeMaxCount', '每层最多张数', numberInput('bridge.autoIllustration.interludeMaxCount', auto.interludeMaxCount, 1, 16)),
                autoAssetSpriteField: checkbox('bridge.autoIllustration.assets.spriteEnabled', auto.assets.spriteEnabled, '自动生成角色立绘'),
                autoAssetBackgroundField: checkbox('bridge.autoIllustration.assets.backgroundEnabled', auto.assets.backgroundEnabled, '自动生成场景背景'),
                autoAssetMaxField: field('bridge.autoIllustration.assets.maxPerFloor', '每层最多素材数', numberInput('bridge.autoIllustration.assets.maxPerFloor', auto.assets.maxPerFloor, 1, 16)),
                autoAssetSpriteSizeField: field('bridge.autoIllustration.assets.spriteSize', '立绘尺寸', textInput('bridge.autoIllustration.assets.spriteSize', auto.assets.spriteSize, '832x1216')),
                autoAssetBackgroundSizeField: field('bridge.autoIllustration.assets.backgroundSize', '背景尺寸', textInput('bridge.autoIllustration.assets.backgroundSize', auto.assets.backgroundSize, '1216x832')),
                autoAssetBackgroundTemplateField: field('bridge.autoIllustration.assets.templates.background', '场景正向提示词模板', autoTextarea('bridge.autoIllustration.assets.templates.background', auto.assets.templates.background, '必须包含 {tags}')),
                autoAssetBackgroundNegativeTemplateField: field('bridge.autoIllustration.assets.templates.backgroundNegative', '场景负面提示词模板', autoTextarea('bridge.autoIllustration.assets.templates.backgroundNegative', auto.assets.templates.backgroundNegative, '不希望场景出现的tag')),
                autoAssetSpriteTemplateField: field('bridge.autoIllustration.assets.templates.sprite', '人物正向提示词模板', autoTextarea('bridge.autoIllustration.assets.templates.sprite', auto.assets.templates.sprite, '必须包含 {tags}')),
                autoAssetSpriteNegativeTemplateField: field('bridge.autoIllustration.assets.templates.spriteNegative', '人物负面提示词模板', autoTextarea('bridge.autoIllustration.assets.templates.spriteNegative', auto.assets.templates.spriteNegative, '不希望人物立绘出现的tag')),
                autoAssetNsfwExtraField: field('bridge.autoIllustration.assets.templates.nsfwExtra', 'NSFW附加提示词', autoTextarea('bridge.autoIllustration.assets.templates.nsfwExtra', auto.assets.templates.nsfwExtra, 'NSFW被拒后重试时追加的提示词')),
                autoLlmWarn: esc(llmReady.error),
                autoLlmWarnHidden: hiddenAttr(llmReady.ok),
                // 物品图：独立开关（默认关闭，关闭时不读表、不联网）；背包格子图标是用户显示偏好。
                itemImageFields: checkbox('bridge.itemImages.enabled', normalizeItemImageSettings(bridge.itemImages).enabled, '自动生成物品图')
                    + field('bridge.itemImages.inventoryIcon', '背包格子图标', selectInput('bridge.itemImages.inventoryIcon', normalizeItemImageSettings(bridge.itemImages).inventoryIcon, [['image', '生图'], ['svg', 'SVG']])),
                autoLlmApiHidden: hiddenAttr(openaiDisabled),
                autoLlmSourceField: field('bridge.autoIllustration.llm.source', '来源', selectInput('bridge.autoIllustration.llm.source', auto.llm.source, [['tavern', '酒馆当前API（消耗主模型额度）'], ['openai', '独立OpenAI兼容API']])),
                autoLlmEndpointField: field('bridge.autoIllustration.llm.endpoint', '地址', textInput('bridge.autoIllustration.llm.endpoint', auto.llm.endpoint, 'https://.../v1', 'text', openaiDisabled)),
                autoLlmKeyField: field('bridge.autoIllustration.llm.apiKey', 'API Key', secretInput('bridge.autoIllustration.llm.apiKey', auto.llm.apiKey, '无需Key可留空', openaiDisabled)),
                autoLlmModelField: field('bridge.autoIllustration.llm.model', '模型', modelPicker('bridge.autoIllustration.llm.model', auto.llm.model, asyncState.llmModels, 'fetch-llm-models', 'gpt-4o-mini', openaiDisabled)),
                autoLlmModelsMessage: esc(asyncState.llmModelsMessage || ''),
                autoLlmPromptsOpen: advancedOpen('llm-prompts'),
                advancedJailbreakOpen: advancedOpen('llm-jailbreak'),
                autoLlmJailbreakHeadField: field('bridge.autoIllustration.llm.jailbreakHead', '头部附加词', autoTextarea('bridge.autoIllustration.llm.jailbreakHead', auto.llm.jailbreakHead, '')),
                autoLlmJailbreakTailField: field('bridge.autoIllustration.llm.jailbreakTail', '尾部附加词', autoTextarea('bridge.autoIllustration.llm.jailbreakTail', auto.llm.jailbreakTail, '')),
                autoLlmPromptIllustrationField: field('bridge.autoIllustration.llm.prompts.illustration', 'CG插图规划', autoTextarea('bridge.autoIllustration.llm.prompts.illustration', auto.llm.prompts.illustration, '清空即恢复内置提示词')),
                autoLlmPromptIllustrationSoftField: field('bridge.autoIllustration.llm.prompts.illustrationSoft', 'CG插图规划 · 温和重试（NSFW被拒后使用）', autoTextarea('bridge.autoIllustration.llm.prompts.illustrationSoft', auto.llm.prompts.illustrationSoft, '清空即恢复内置提示词')),
                autoLlmPromptAssetField: field('bridge.autoIllustration.llm.prompts.asset', '素材补全规划', autoTextarea('bridge.autoIllustration.llm.prompts.asset', auto.llm.prompts.asset, '清空即恢复内置提示词')),
                autoLlmPromptAssetSoftField: field('bridge.autoIllustration.llm.prompts.assetSoft', '素材补全规划 · 温和重试', autoTextarea('bridge.autoIllustration.llm.prompts.assetSoft', auto.llm.prompts.assetSoft, '清空即恢复内置提示词')),
                autoLlmContextField: field('bridge.autoIllustration.llm.contextFloors', '参考前文楼层数', numberInput('bridge.autoIllustration.llm.contextFloors', auto.llm.contextFloors, 0, 3)),
                autoNaiTransportField: field('bridge.autoIllustration.nai.transport', '传输方式', selectInput('bridge.autoIllustration.nai.transport', auto.nai.transport, [['direct', '浏览器直连'], ['st-proxy', '酒馆CORS代理（需开启enableCorsProxy）']])),
                autoNaiEndpointField: field('bridge.autoIllustration.nai.endpoint', '接口地址', textInput('bridge.autoIllustration.nai.endpoint', auto.nai.endpoint, '留空使用官方image.novelai.net')),
                autoNaiKeyField: field('bridge.autoIllustration.nai.apiKey', 'NAI Key', secretInput('bridge.autoIllustration.nai.apiKey', auto.nai.apiKey, 'pst-...')),
                autoNaiModelField: field('bridge.autoIllustration.nai.model', '模型', modelPicker('bridge.autoIllustration.nai.model', auto.nai.model, asyncState.naiModels, 'fetch-nai-models', 'nai-diffusion-4-5-full')),
                autoNaiModelsMessage: esc(asyncState.naiModelsMessage || ''),
                autoNaiSizeField: field('bridge.autoIllustration.nai.size', '尺寸', textInput('bridge.autoIllustration.nai.size', auto.nai.size, '832x1216')),
                autoNaiStepsField: field('bridge.autoIllustration.nai.steps', '步数', numberInput('bridge.autoIllustration.nai.steps', auto.nai.steps, 1, 50)),
                autoNaiScaleField: field('bridge.autoIllustration.nai.scale', 'CFG', numberInput('bridge.autoIllustration.nai.scale', auto.nai.scale, 0, 10, false, 'any')),
                autoNaiSamplerField: field('bridge.autoIllustration.nai.sampler', '采样器', textInput('bridge.autoIllustration.nai.sampler', auto.nai.sampler, 'k_euler_ancestral')),
                autoNaiArtistField: field('bridge.autoIllustration.nai.artistPrefix', '画师串 / 固定前缀', autoTextarea('bridge.autoIllustration.nai.artistPrefix', auto.nai.artistPrefix, '可选，拼在每张图的正向提示词最前面')),
                autoNaiNegativeField: field('bridge.autoIllustration.nai.negativePrompt', '负面提示词', autoTextarea('bridge.autoIllustration.nai.negativePrompt', auto.nai.negativePrompt, '')),
            };
            const grid = (...items) => {
                const body = items.filter(Boolean).join('');
                return body ? `<div class="igs-source-filter-grid">${body}</div>` : '';
            };
            // 分类型模型只对内置 NAI 和数据库生图插件生效；智绘姬、柏宝绘用插件自己的模型，不显示。留空跟随「图像来源」的模型。
            const kindModel = (kind, label) => (sourceMode === 'nai' || sourceMode === 'dbgen'
                ? field(`bridge.imageApi.${kind}Model`, label, kindModelPicker(`bridge.imageApi.${kind}Model`, imageApi[`${kind}Model`], pulledImageModels)) : '');
            imageFields.promptKindsPanel = renderPromptKindsPanel({
                nai: auto.nai, field, textarea: autoTextarea, checkbox, advancedOpen,
                templateFields: {
                    sprite: [imageFields.autoAssetSpriteTemplateField, imageFields.autoAssetSpriteNegativeTemplateField],
                    background: [imageFields.autoAssetBackgroundTemplateField, imageFields.autoAssetBackgroundNegativeTemplateField],
                    nsfwCg: [imageFields.autoAssetNsfwExtraField],
                },
                slots: {
                    common: `<div class="igs-source-filter-note"${imageFields.assetSceneWarnHidden}>需先在「素材」页开启场景素材模式。</div>`
                        + `<div class="igs-settings-sub" data-image-feature="asset-options"${imageFields.autoAssetOptionsHidden}>${grid(imageFields.autoAssetMaxField)}</div>`,
                    character: grid(imageFields.autoAssetSpriteField, '<button type="button" class="igs-settings-action" data-action="open-character-dna" title="在素材 → 角色立绘中编辑角色 DNA">角色 DNA</button>')
                        + `<div class="igs-settings-sub" data-image-feature="sprite-options"${hiddenAttr(!auto.assets.spriteEnabled)}>${grid(imageFields.autoAssetSpriteSizeField, kindModel('sprite', '立绘模型'))}</div>`,
                    scene: grid(imageFields.autoAssetBackgroundField)
                        + `<div class="igs-settings-sub" data-image-feature="background-options"${hiddenAttr(!auto.assets.backgroundEnabled)}>${grid(imageFields.autoAssetBackgroundSizeField, kindModel('background', '背景模型'))}</div>`
                        + grid(imageFields.itemImageFields)
                        + grid(kindModel('item', '物品模型')),
                    cg: imageFields.autoInterludeField
                        + `<div class="igs-settings-sub" data-image-feature="interlude"${imageFields.autoInterludeHidden}>${grid(imageFields.autoInterludeProbabilityField, imageFields.autoInterludeMaxField)}</div>`
                        + grid(kindModel('cg', '剧情 CG 模型')),
                    nsfw: imageFields.autoNsfwField
                        + `<div class="igs-settings-sub" data-image-feature="nsfw"${imageFields.autoNsfwHidden}>${grid(imageFields.autoNsfwCountField)}</div>`,
                },
            });
            return renderTemplate(getSettingsTabTemplate('image'), {
                imageSubTabs: IMAGE_SUBTAB_DEFS.map(([id, label]) => `<button type="button" class="igs-image-subtab${imageSubTab === id ? ' is-active' : ''}" data-image-subtab="${id}" role="tab" aria-selected="${imageSubTab === id}">${label}</button>`).join(''),
                imageSubPane: renderTemplate(getImageSubTabTemplate(imageSubTab), imageFields),
            });
        }

        if (tab === 'scene') {
            const scopeState = rememberAssetScope(state.activeSettings, getSillyTavernContext(options.global || globalThis));
            // 列表显示这张卡实际会用的一份（本卡盖在全局上）。每条带「本卡 / 全局」标签，改哪条就写回它所在的那一边。
            const sceneAssets = draftEffectiveAssets(state.activeSettings);
            const assetRoot = bridge.sceneAssets || {};
            const cardKey = String(scopeState.assetScopeKey || '');
            const storage = (options.global || globalThis).localStorage;
            const scopeTag = (collection, name) => {
                if (!cardKey) return '';
                const inCard = Boolean(assetOwnerKey(assetRoot, cardKey, [collection], name));
                // 两格切换：亮的那格是现在放的地方，点另一格就迁过去。
                const move = `asset-move:${collection}:${encodeURIComponent(String(name))}`;
                const seg = (here, label, title) => (here
                    ? `<span class="igs-scope-seg is-on" aria-current="true">${label}</span>`
                    : `<button type="button" class="igs-scope-seg" data-action="${move}" title="${title}">${label}</button>`);
                return `<span class="igs-asset-scope-switch" role="group" aria-label="放在本卡还是全局">${seg(inCard, '本卡', '收进本卡：只有这张角色卡用')}${seg(!inCard, '全局', '放到全局：所有角色卡共用')}</span>`
                    + (inCard && assetShadowsGlobal(assetRoot, cardKey, collection, name) ? '<span class="igs-asset-scope-note" title="全局另有一份同名的，这张卡用本卡这份">覆盖全局</span>' : '');
            };
            const presetMap = loadLegacyPresets(storage);
            const presetNames = Object.entries(presetMap).filter(([, preset]) => legacyPresetHasContent(preset) || presetCardLayers(preset).length).map(([name]) => name);
            // 预设是存档 / 模板：存这张卡实际在用的一套，套用时整层换成预设。旧版存的预设也在这里。
            const presetRow = (name) => {
                const n = encodeURIComponent(name);
                // 分层预设各回各层，一个「套用」就够；旧版不分层的预设才问套到本卡还是全局。
                const layered = isLayeredPreset(presetMap[name]);
                const cards = presetCardLayers(presetMap[name]).map((layer) => layer.label);
                const where = layered ? `<span class="igs-asset-preset-where">全局${cards.length ? ` + ${esc(cards.join('、'))}` : ''}</span>` : '';
                const apply = layered
                    ? `<button type="button" class="igs-review-link is-primary" data-action="preset-apply:${n}">套用</button>`
                    : cardKey
                    ? `<details class="igs-add-menu igs-asset-preset-apply"><summary class="igs-review-link is-primary">套用</summary><div class="igs-add-menu-list" role="menu">`
                        + menuItem(`preset-apply:${n}:card`, `套到本卡「${scopeState.assetScopeLabel}」`) + menuItem(`preset-apply:${n}:global`, '套到全局') + '</div></details>'
                    : `<button type="button" class="igs-review-link is-primary" data-action="preset-apply:${n}:global">套用</button>`;
                return `<div class="igs-asset-preset-row"><span class="igs-asset-preset-name" title="${esc(name)}">${esc(name)}</span>${where}${apply}<button type="button" class="igs-review-link" data-action="preset-overwrite:${n}" aria-label="用当前配置覆盖预设「${esc(name)}」">覆盖</button>`
                    + renderRowMenu([menuItem(`preset-export:${n}`, '导出文件'), menuItem(`preset-rename:${n}`, '重命名'), menuItem(`preset-delete:${n}`, '删除', ' is-danger')], `预设「${name}」的操作`)
                    + '</div>';
            };
            const presetOpen = asyncState.advancedOpen && asyncState.advancedOpen['asset-presets'] ? ' open' : '';
            const presetSection = `<details class="igs-asset-presets" data-advanced="asset-presets"${presetOpen}><summary class="igs-asset-presets-summary">预设</summary>`
                + `<div class="igs-asset-presets-body">${presetNames.map(presetRow).join('') || '<div class="igs-asset-presets-empty">暂无预设。可将当前这一套保存为预设，之后套用到其他角色卡。</div>'}`
                + '<div class="igs-asset-presets-tools"><button type="button" class="igs-settings-action" data-action="preset-save">存为预设</button><button type="button" class="igs-settings-action" data-action="preset-import">导入预设</button></div></div></details>';
            const assetScopeBar = `<div class="igs-asset-scope-bar"><span class="igs-asset-scope-name">${cardKey ? `当前角色卡：${esc(scopeState.assetScopeLabel)}` : '未打开角色卡，素材均存放在全局'}</span>`
                + (scopeState.assetScopeKind === 'card' && cardKey ? '<button type="button" class="igs-settings-action" data-action="asset-card-export">导出本卡素材</button>' : '')
                + '<button type="button" class="igs-settings-action" data-action="asset-card-import">导入素材包</button></div>'
                + presetSection;
            const disabled = !sceneAssets.enabled;
            const subTab = normalizeSceneSubTab(asyncState.sceneSubTab);
            // 文件夹只是本地界面归类：按当前角色卡存，卡里还没建过就沿用全局的。
            const assetFolders = loadAssetFoldersFor(storage, cardKey);
            const firstUrl = (values) => (values.map((v) => String(v || '').trim()).find(Boolean) || '');
            const generatedService = options.generatedAssets || null;
            // 设置页缩略图优先用 blob: 短地址，HTML 不再夹带整段 dataUrl。
            const resolveGenerated = (url) => {
                if (!isGeneratedAssetUrl(url)) return url || '';
                if (!generatedService) return '';
                if (typeof generatedService.resolveThumbUrl === 'function') return generatedService.resolveThumbUrl(url);
                return typeof generatedService.resolveUrl === 'function' ? generatedService.resolveUrl(url) : '';
            };
            const sceneListOptions = {
                expandedSlots: asyncState.expandedSceneSlots instanceof Set ? asyncState.expandedSceneSlots : new Set(),
                timeGroups: sceneAssets.timeGroups || [],
                weatherGroups: sceneAssets.weatherGroups || [],
                resolveUrl: resolveGenerated,
                folderSelect: (name) => renderAssetFolderSelect('scenes', name, assetFolders.scenes),
                scopeTag,
            };
            const scopeFilters = asyncState.assetScopeFilter && typeof asyncState.assetScopeFilter === 'object' ? asyncState.assetScopeFilter : {};
            const ownedBy = (collection, name) => (assetOwnerKey(assetRoot, cardKey, [collection], name) ? 'card' : 'global');
            const filterOf = (collection) => (cardKey && (scopeFilters[collection] === 'card' || scopeFilters[collection] === 'global') ? scopeFilters[collection] : 'all');
            const scopedEntries = (collection) => {
                const all = sceneAssets[collection] || {};
                const filter = filterOf(collection);
                if (filter === 'all') return all;
                return Object.fromEntries(Object.entries(all).filter(([name]) => ownedBy(collection, name) === filter));
            };
            // 只在打开了角色卡时出现。切到「本卡」可以一键全放到全局，切到「全局」可以一键全收进本卡。
            const scopeFilterBar = (collection) => {
                if (!cardKey) return '';
                const names = Object.keys(sceneAssets[collection] || {});
                const cardCount = names.filter((name) => ownedBy(collection, name) === 'card').length;
                const counts = { all: names.length, card: cardCount, global: names.length - cardCount };
                const filter = filterOf(collection);
                const chip = (id, label) => `<button type="button" class="igs-asset-filter${filter === id ? ' is-active' : ''}" data-action="asset-filter:${collection}:${id}" aria-pressed="${filter === id}">${label}<span class="igs-asset-filter-count">${counts[id]}</span></button>`;
                // 一键迁移常驻在筛选旁：点开选方向，数量为 0 的那项不能点，选了还会再确认一次。
                const bulkItem = (dest, label, count) => `<button type="button" class="igs-add-menu-item" data-action="asset-move-all:${collection}:${dest}" role="menuitem"${count ? '' : ' disabled'}>${label}</button>`;
                const bulk = `<details class="igs-add-menu igs-asset-bulk-menu" data-asset-bulk="${collection}"><summary class="igs-btn-mgr-icon igs-asset-bulk" title="一键迁移" aria-label="一键迁移">${ASSET_MOVE_ALL_SVG}</summary>`
                    + `<div class="igs-add-menu-list" role="menu">${bulkItem('global', `本卡的 ${counts.card} 个全部放到全局`, counts.card)}${bulkItem('card', `全局的 ${counts.global} 个全部收进本卡`, counts.global)}</div></details>`;
                return `<span class="igs-asset-filter-group" role="group" aria-label="按归属筛选" data-asset-filter="${collection}">${chip('all', '全部')}${chip('card', '本卡')}${chip('global', '全局')}</span>${bulk}`;
            };
            const assetSelect = (kind) => (asyncState.assetSelect && asyncState.assetSelect.kind === kind ? asyncState.assetSelect.names : null);
            const scenesHtml = renderAssetFolderView('scenes', scopedEntries('scenes'), {
                state: assetFolders,
                select: assetSelect('scenes'),
                lead: scopeFilterBar('scenes'),
                renderList: (subset) => renderSceneAssetList(subset, sceneListOptions),
                rawOf: (name, value) => (typeof value === 'string' ? value : (value && value.url) || ''),
                thumbOf: (name, value) => resolveGenerated(typeof value === 'string' ? value : firstUrl([value && value.url].concat(Object.values((value && value.times) || {}).map((t) => (typeof t === 'string' ? t : t && t.url))))),
            });
            const charListOptions = {
                aliases: sceneAssets.characterAliases || {},
                characterDna: sceneAssets.characterDna || {},
                characterOutfits: sceneAssets.characterOutfits || {},
                outfitTabs: asyncState.outfitTabs || {},
                sceneAssets,
                moodGroups: sceneAssets.moodGroups || [],
                expandedSlots: asyncState.expandedSpriteSlots instanceof Set ? asyncState.expandedSpriteSlots : new Set(),
                statusAvatars: sceneAssets.statusAvatars || {},
                // 角色学院只在魔法世界观下有意义；其他世界观的魔法星夜只当星空框用，不显示这一行。
                magicHouse: reader.dialogSkin === DIALOG_SKIN_MAGIC_ACADEMY && resolveWorldview(worldviewAssets) === 'magic' ? { sceneAssets, fallback: reader.magicHouse } : null,
                // 角色声线只在开了「角色语气音」时显示；开了「台词朗读」时改显示朗读声音（两者二选一，朗读优先）。
                voice: renderVoiceRowConfig(reader, sceneAssets),
                spriteHeight: { sceneAssets, reader },
                resolveUrl: resolveGenerated,
                expressionNotes: normalizeGeneratedLibrary(sceneAssets.generated).expressionNotes,
                folderSelect: (name, opts) => renderAssetFolderSelect('characters', name, assetFolders.characters, opts),
                scopeTag,
                isOpen: (key) => Boolean(asyncState.advancedOpen && asyncState.advancedOpen[key]),
            };
            const charsHtml = renderAssetFolderView('characters', scopedEntries('characters'), {
                state: assetFolders,
                select: assetSelect('characters'),
                lead: scopeFilterBar('characters'),
                renderList: (subset) => renderCharacterAssetList(subset, charListOptions),
                thumbOf: (name, moods) => resolveGenerated(firstUrl(Object.values(moods || {}).concat([(sceneAssets.statusAvatars || {})[name]]))),
            });
            const generatedArgs = {
                library: normalizeGeneratedLibrary(sceneAssets.generated),
                characters: sceneAssets.characters || {},
                scenes: sceneAssets.scenes || {},
                temp: generatedService && typeof generatedService.listTemp === 'function' ? generatedService.listTemp() : [],
                resolveUrl: resolveGenerated,
                moodGroups: sceneAssets.moodGroups || [],
            };
            // 待确认：AI 写出但没登记的服装词、词库外的情绪词、生成了还没入库的图。
            const resolveOutfit = createOutfitResolver(sceneAssets);
            const outfitReview = dropConfirmedOutfitReview(storage, (character, word) => Boolean(resolveOutfit(character, word)));
            const moodReview = loadMoodReview(storage);
            const waitingCount = outfitReview.length + moodReview.length + countGeneratedWaiting(generatedArgs);
            const reviewPane = `<div class="igs-settings-section igs-review-pane">`
                + renderOutfitReviewList(outfitReview, sceneAssets.characterOutfits || {}, sceneAssets.characters || {})
                + renderMoodReviewList(moodReview, sceneAssets.moodGroups, { busy: Boolean(asyncState.moodReviewClassifying) })
                + renderGeneratedAssetPane(generatedArgs)
                + `</div>`;
            const scenesPane = `<div class="igs-settings-section">
        <div class="igs-settings-section-head">
          <div class="igs-settings-subhead">背景场景</div>
          <button type="button" class="igs-settings-action igs-asset-zip" data-action="asset-zip:scenes">打包下载</button>
          <details class="igs-add-menu" data-add-menu="scenes">
            <summary class="igs-btn-mgr-icon" title="新增背景" aria-label="新增背景">+</summary>
            <div class="igs-add-menu-list" role="menu">
              <button class="igs-add-menu-item" data-action="scene-add-bg" type="button" role="menuitem">新增空白场景</button>
              <button class="igs-add-menu-item" data-action="scene-add-default-bg" type="button" role="menuitem">下载默认素材</button>
            </div>
          </details>
        </div>
        ${checkbox('bridge.autoIllustration.assets.strictMatch', normalizeAutoIllustrationSettings(bridge.autoIllustration).assets.strictMatch, '严格匹配场景素材')}
        <div class="igs-source-filter-note">开启后仅使用名称或别名精确匹配的背景，不以相近场景的图片代替；无法匹配时按缺失处理并补画。</div>
        ${scenesHtml}
      </div>`;
            const spriteEnhance = sceneAssets.spriteEnhance || {};
            const spriteGenderScale = normalizeSpriteGenderScale(reader.spriteGenderScale);
            // 立绘显示与情绪匹配是整区设置：单独一张折叠卡放在角色列表上面，不再压在「角色立绘」标题下。
            const charactersSettingsCard = `<div class="igs-source-filter igs-perf-group"><details data-advanced="sprite-display"${asyncState.advancedOpen && asyncState.advancedOpen['sprite-display'] ? ' open' : ''}><summary><b>立绘设置</b><span class="igs-perf-brief">缩放 · 高度 · 增强 · 情绪匹配</span></summary><div class="igs-perf-group-body">
        ${checkbox('bridge.sceneAssets.moodFuzzyMatch', sceneAssets.moodFuzzyMatch, '情绪词模糊匹配')}
        <div class="igs-source-filter-note">相近的情绪词也会归入组中（可能归错，可在「待确认」中核对）。</div>
        ${checkbox('bridge.sceneAssets.unifiedSpriteLayout', sceneAssets.unifiedSpriteLayout, '统一角色立绘位置')}
        ${checkbox('bridge.sceneAssets.spriteEnhance.enabled', spriteEnhance.enabled === true, '立绘增强（手机较耗电）')}
        ${checkbox('readerSettings.spriteGenderScale.enabled', spriteGenderScale.enabled, '按性别区分默认高度')}
        <div class="igs-source-filter-note">根据 DNA 判断性别；已调整过的立绘和单独设置了高度的角色不受影响。</div>
        <div class="igs-source-filter-grid">
          ${field('readerSettings.spriteDisplayScale', '立绘全局缩放 %', numberInput('readerSettings.spriteDisplayScale', normalizeSpriteDisplayScale(reader.spriteDisplayScale)))}
          ${field('readerSettings.spriteDefaultScale', '立绘基准高度 %', numberInput('readerSettings.spriteDefaultScale', normalizeSpriteDefaultScale(reader.spriteDefaultScale)))}
          ${spriteGenderScale.enabled ? `
          ${field('readerSettings.spriteGenderScale.female', '女性默认高度 %', numberInput('readerSettings.spriteGenderScale.female', spriteGenderScale.female))}
          ${field('readerSettings.spriteGenderScale.male', '男性默认高度 %', numberInput('readerSettings.spriteGenderScale.male', spriteGenderScale.male))}
          ${field('readerSettings.spriteGenderScale.other', '其他默认高度 %', numberInput('readerSettings.spriteGenderScale.other', spriteGenderScale.other))}` : ''}
          ${spriteEnhance.enabled === true ? `
          ${field('bridge.sceneAssets.spriteEnhance.mode', '效果', selectInput('bridge.sceneAssets.spriteEnhance.mode', spriteEnhance.mode || 'outline', [['outline', '硬描边'], ['shadow', '投影式']]))}
          ${field('bridge.sceneAssets.spriteEnhance.color', '增强颜色', colorInput('bridge.sceneAssets.spriteEnhance.color', spriteEnhance.color || '#000000'))}
          ${field('bridge.sceneAssets.spriteEnhance.strength', '增强浓淡', selectInput('bridge.sceneAssets.spriteEnhance.strength', spriteEnhance.strength ?? 20, [5, 10, 15, 20, 30, 40, 50].map((n) => [n, `${n}%`])))}
          ${field('bridge.sceneAssets.spriteEnhance.size', '增强大小', selectInput('bridge.sceneAssets.spriteEnhance.size', spriteEnhance.size ?? 0.8, [0.4, 0.6, 0.8, 1, 1.2, 1.6, 2].map((n) => [n, `${n}px`])))}` : ''}
        </div>
        </div></details></div>`;
            const charactersPane = `<div class="igs-settings-section">
        <div class="igs-settings-section-head">
          <div class="igs-settings-subhead">角色立绘</div>
          <button type="button" class="igs-settings-action igs-asset-zip" data-action="asset-zip:characters">打包下载</button>
          ${CHARACTER_ADD_MENU}
        </div>
        ${renderDnaCandidateBar(asyncState.dnaCandidate)}
        ${charsHtml}
        ${renderDnaOnlyCharacterList(sceneAssets.characterDna || {}, sceneAssets.characters || {})}
      </div>`;
            const promptRuleDraft = typeof asyncState.promptRuleDraft === 'string'
                ? asyncState.promptRuleDraft
                : String(sceneAssets.promptRule || '');
            const promptRuleOn = sceneAssets.promptRuleEnabled !== false;
            const sceneValues = {
                promptRuleTag: promptRuleOn ? '发给聊天模型' : '已关闭',
                promptRuleToggle: checkbox('bridge.sceneAssets.promptRuleEnabled', promptRuleOn, '自动注入格式规则')
                    + `<div class="igs-source-filter-note" data-result="prompt-rule-preset">${esc(promptRuleOn ? PROMPT_RULE_PRESET_HINT : PROMPT_RULE_OFF_HINT)}</div>`,
                promptRuleField: `<div class="igs-settings-field"><textarea data-prompt-rule-draft="1" aria-label="AI格式规则" placeholder="格式规则..."${disabled ? ' disabled' : ''}>${esc(promptRuleDraft)}</textarea></div>`,
                promptRuleStatus: esc(asyncState.promptRuleStatus || ''),
                promptRuleOutfitHint: scenePromptRuleOutfitHint(sceneAssets.promptRule)
                    ? `<div class="igs-source-filter-note" data-result="prompt-rule-outfit">${esc(PROMPT_RULE_OUTFIT_HINT)}</div>` : '',
                promptAdvanced: `<details class="igs-settings-sub igs-settings-advanced" data-advanced="prompt-injection"${asyncState.advancedOpen && asyncState.advancedOpen['prompt-injection'] ? ' open' : ''}><summary>高级：注入位置与按需注入</summary>`
                    + field('bridge.sceneAssets.promptPlacement', '注入位置', selectInput('bridge.sceneAssets.promptPlacement', normalizePromptPlacement(sceneAssets.promptPlacement), [['system', '系统说明区'], ['depth0', '聊天末尾']]),
                        '如 AI 未按标签输出，可改回聊天末尾。')
                    + checkbox('bridge.sceneAssets.promptAdaptive', sceneAssets.promptAdaptive !== false, '按需注入')
                    + '<div class="igs-source-filter-note">仅在需要时附上完整说明。</div></details>',
                wardrobeSection: checkbox('bridge.sceneAssets.wardrobeAutoFlow', sceneAssets.wardrobeAutoFlow !== false, '自动流程（新建后自动写提示词、生成参考图）')
                    + renderWardrobe(scopedEntries('wardrobe'), { resolveUrl: resolveGenerated, scopeTag, focus: asyncState.wardrobeFocus || '', lead: scopeFilterBar('wardrobe') }),
                eventCgSection: renderEventCgList(scopedEntries('eventCgs'), { resolveUrl: resolveGenerated, scopeTag }),
                moodSection: checkbox('bridge.sceneAssets.moodAutoClassify', sceneAssets.moodAutoClassify === true, '自动归类（用副API）')
                    + (asyncState.moodAutoStatus ? `<div class="igs-source-filter-note" data-mood-auto-status>${esc(asyncState.moodAutoStatus)}</div>` : '')
                    + renderMoodGroupList(sceneAssets.moodGroups, { isOpen: (key) => Boolean(asyncState.advancedOpen && asyncState.advancedOpen[key]) })
                    + '<div class="igs-settings-row"><button class="igs-settings-action" data-action="mood-apply-preset" type="button">套用预设</button><button class="igs-settings-action" data-action="reset-mood-groups" type="button">恢复默认</button>'
                    + `<button class="igs-settings-action" data-action="mood-ai-reclassify" type="button" title="用副API把已有的词重新归组，并剔除动作、神态等不是情绪的词"${asyncState.moodReclassifying ? ' disabled' : ''}>${asyncState.moodReclassifying ? '整理中…' : 'AI整理词库'}</button></div>`,
            };
            const sceneSubTabs = SCENE_SUBTAB_DEFS.map(([id, label]) => {
                const count = id === 'review' && waitingCount ? `<span class="igs-scene-subtab-count">${waitingCount}</span>` : '';
                return `<button type="button" class="igs-scene-settings-subtab${subTab === id ? ' is-active' : ''}" data-scene-subtab="${id}" role="tab" aria-selected="${subTab === id ? 'true' : 'false'}">${label}${count}</button>`;
            }).join('');
            const assetPane = (html) => `<div class="igs-settings-grid" data-scene-settings-pane="assets"><div class="igs-source-filter">${html}</div></div>`;
            const sceneSubPane = subTab === 'rules'
                ? renderTemplate(SCENE_RULES_TEMPLATE, sceneValues)
                : subTab === 'characters' || !['review', 'scenes'].includes(subTab)
                    ? `<div class="igs-settings-grid" data-scene-settings-pane="assets">${charactersSettingsCard}<div class="igs-source-filter">${charactersPane}</div></div>`
                    : assetPane(subTab === 'review' ? reviewPane : scenesPane);
            return renderTemplate(getSettingsTabTemplate('scene'), {
                sceneToggle: checkbox('bridge.sceneAssets.enabled', sceneAssets.enabled, '启用场景素材模式'),
                sceneHidden: hiddenAttr(disabled),
                assetScopeBar,
                sceneSubTabs,
                sceneSubPane,
            });
        }

        const readerSubTab = normalizeReaderSubTab(asyncState.readerSubTab);
        const sceneEnabled = !!(bridge.sceneAssets && bridge.sceneAssets.enabled);
        const classicDialog = reader.dialogSkin === DIALOG_SKIN_WESTERN_CLASSIC;
        const illustratedDialog = isIllustratedDialogSkin(reader.dialogSkin);
        const gradientVeilDialog = reader.dialogSkin === DIALOG_SKIN_GRADIENT_VEIL;
        const themeDisabled = !sceneEnabled && !classicDialog && !illustratedDialog;
        const themePath = classicDialog ? 'readerSettings.classicVnTheme' : 'readerSettings.vnTheme';
        const vnTheme = reader.vnTheme || {};
        const classicVnTheme = reader.classicVnTheme || CLASSIC_DIALOG_THEME_DEFAULTS;
        // 对话主题已取消预设选择，恒为自定义：自定义项始终可编辑（仅受场景素材开关 themeDisabled 控制）。
        const themeCustom = true;
        const displayTheme = classicDialog ? classicVnTheme : vnTheme;
        // 背景色 / 不透明度只有默认皮肤的对话框会读；渐变纱、西式古典和插画皮肤都自带底色，显示了也改不动。
        const dialogBgEditable = !themeDisabled && !classicDialog && !illustratedDialog && !gradientVeilDialog;
        const dialogHeightItems = [['null', '自适应'], [.05, '5%'], [.08, '8%'], [.12, '12%'], [.15, '15%'], [.18, '18%'], [.2, '20%'], [.25, '25%'], [.3, '30%'], [.35, '35%'], [.4, '40%']];
        const typewriter = normalizeTypewriterSettings(reader.typewriter);
        const stageShake = normalizeStageShakeSettings(reader.stageShake);
        const voiceBark = normalizeVoiceBarkSettings(reader.voiceBark);
        const tts = normalizeTtsSettings(reader.tts);
        const chatShow = normalizeChatShowSettings(reader.chatShow);
        const systemRole = normalizeSystemRoleSettings(reader.systemRole);
        const weatherFx = normalizeWeatherFxSettings(reader.weatherFx);
        const statusHud = normalizeStatusHudSettings(reader.statusHud);
        if (reader.dialogHeight != null && !dialogHeightItems.some(([value]) => String(value) === String(reader.dialogHeight))) {
            dialogHeightItems.splice(1, 0, [reader.dialogHeight, `${reader.dialogHeight}px`]);
        }
        const readerSubTabs = READER_SUBTAB_DEFS.map(([id, label]) => (
            `<button type="button" class="igs-reader-subtab${readerSubTab === id ? ' is-active' : ''}" data-reader-subtab="${id}" role="tab" aria-selected="${readerSubTab === id ? 'true' : 'false'}">${label}</button>`
        )).join('');
        // 字体下拉 = 内置字体 + 用户上传的字体；上传的字体先注册进页面，下拉里选中即可预览。
        const hostGlobal = options.global || globalThis;
        const customFonts = loadCustomFonts(hostGlobal);
        if (customFonts.length) registerCustomFonts(hostGlobal.document, customFonts);
        const fontOptions = fontOptionsWith(DIALOG_FONT_OPTIONS, customFonts);
        const readerValues = {
            customFontManager: renderCustomFontManager(customFonts, asyncState.customFontMessage || ''),
            ...sectionResetPlaceholders(),
            fontSizeField: field('readerSettings.fontSize', '字体大小', selectInput('readerSettings.fontSize', reader.fontSize, [12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30].map((n) => [n, `${n}px`]))),
            dialogFontWeightField: field('readerSettings.dialogFontWeight', '对话框字重', selectInput('readerSettings.dialogFontWeight', reader.dialogFontWeight == null ? 'null' : reader.dialogFontWeight, [['null', '跟随当前样式'], [300, '细体'], [400, '常规'], [500, '中等'], [700, '粗体']])),
            // 文字增强是开关（借分段点击写值：开=硬描边，关=off），开了才出现种类和三个参数。
            dialogTextEffectToggle: `<button type="button" class="igs-switch${reader.dialogTextEffect !== 'off' ? ' is-on' : ''}" data-segment-path="readerSettings.dialogTextEffect" data-segment-value="${reader.dialogTextEffect !== 'off' ? 'off' : 'outline'}" aria-pressed="${reader.dialogTextEffect !== 'off' ? 'true' : 'false'}"><i></i><span>文字增强</span></button>`,
            dialogTextEffectOptions: reader.dialogTextEffect === 'off' ? '' : `<div class="igs-source-filter-grid">${field('readerSettings.dialogTextEffect', '增强种类', segmentedInput('readerSettings.dialogTextEffect', reader.dialogTextEffect, [['outline', '硬描边'], ['shadow', '投影式']], '增强种类'))}<div class="igs-reader-text-effect-options">${field('readerSettings.dialogTextEffectColor', '增强颜色', colorInput('readerSettings.dialogTextEffectColor', reader.dialogTextEffectColor))}${field('readerSettings.dialogTextEffectStrength', '增强浓淡', selectInput('readerSettings.dialogTextEffectStrength', reader.dialogTextEffectStrength, [5, 10, 15, 20, 30, 40, 50].map((n) => [n, `${n}%`])))}${field('readerSettings.dialogTextEffectSize', '增强大小', selectInput('readerSettings.dialogTextEffectSize', reader.dialogTextEffectSize, [0.4, 0.6, 0.8, 1, 1.2, 1.6, 2].map((n) => [n, `${n}px`])))}</div></div>`,
            dialogSkinField: field('readerSettings.dialogSkin', '对话框风格', selectInput('readerSettings.dialogSkin', reader.dialogSkin, DIALOG_SKIN_CHOICES))
                + (asyncState.assetScopeKey && worldviewAssets && typeof worldviewAssets.dialogSkin === 'string' && worldviewAssets.dialogSkin
                    ? `<div class="igs-source-filter-note igs-card-skin-note">当前角色卡在主界面选定了「${esc(dialogSkinLabel(worldviewAssets.dialogSkin))}」，阅读这张卡时以此为准，上方选项仅对其他角色卡生效。<button type="button" class="igs-settings-action" data-action="card-dialog-skin-clear">改为跟随上方设置</button></div>`
                    : ''),
            gradientVeilFields: gradientVeilDialog ? '<div class="igs-gradient-veil-settings">' + field('readerSettings.gradientVeil.color', '黑幕颜色', colorInput('readerSettings.gradientVeil.color', reader.gradientVeil.color)) + field('readerSettings.gradientVeil.heightPercent', '渐变高度', selectInput('readerSettings.gradientVeil.heightPercent', reader.gradientVeil.heightPercent, [30, 40, 50, 60, 70].map((n) => [n, `${n}%`]))) + field('readerSettings.gradientVeil.opacity', '最大不透明度', selectInput('readerSettings.gradientVeil.opacity', reader.gradientVeil.opacity, [.4, .55, .7, .85, 1].map((n) => [n, `${Math.round(n * 100)}%`]))) + field('readerSettings.gradientVeil.speakerStyle', '姓名样式', selectInput('readerSettings.gradientVeil.speakerStyle', reader.gradientVeil.speakerStyle, [['default', '默认主题'], ['plain-text', '纯文字']])) + '</div>' : '',
            magicHouseField: reader.dialogSkin === DIALOG_SKIN_MAGIC_ACADEMY ? field('readerSettings.magicHouse', resolveWorldview(bridge.sceneAssets) === 'magic' ? '学院配色' : '配色', selectInput('readerSettings.magicHouse', normalizeMagicHouse(reader.magicHouse), MAGIC_HOUSES.map((house) => [house.id, house.label]))) + (MAGIC_HOUSES.find((house) => house.id === normalizeMagicHouse(reader.magicHouse)).custom ? field('readerSettings.magicAccent', '装饰颜色', colorInput('readerSettings.magicAccent', normalizeMagicAccent(reader.magicAccent))) : '') : reader.dialogSkin === DIALOG_SKIN_HORROR_GORE || reader.dialogSkin === DIALOG_SKIN_HORROR_PSYCH ? field('readerSettings.horrorDreadCap', '恐怖强度上限', selectInput('readerSettings.horrorDreadCap', normalizeHorrorDreadCap(reader.horrorDreadCap), HORROR_DREAD_LEVELS.map((n) => [n, HORROR_DREAD_CAP_LABELS[n]]))) : '',
            classicDialogWidthPercentField: classicDialog ? field('readerSettings.classicDialogWidthPercent', '电脑端宽度', selectInput('readerSettings.classicDialogWidthPercent', reader.classicDialogWidthPercent, [60, 70, 80, 90, 100].map((n) => [n, `${n}%`]))) : '',
            skinDialogScaleField: classicDialog || illustratedDialog ? field('readerSettings.skinDialogScale', '对话框高度', selectInput('readerSettings.skinDialogScale', reader.skinDialogScale, SKIN_DIALOG_SCALE_OPTIONS.map((n) => [n, n === 1 ? '原尺寸' : `${Math.round(n * 100)}%`]))) : '',
            optionFontSizeField: field('readerSettings.optionFontSize', '选项字体大小', selectInput('readerSettings.optionFontSize', reader.optionFontSize, [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map((n) => [n, `${n}px`]))),
            dialogWidthField: field('readerSettings.dialogWidth', '对话框宽度', selectInput('readerSettings.dialogWidth', reader.dialogWidth === null ? 'null' : reader.dialogWidth, [['null', '自动'], [200, '200px'], [280, '280px'], [360, '360px'], [440, '440px'], [520, '520px'], [600, '600px'], [680, '680px'], [760, '760px'], [840, '840px'], [920, '920px'], [1000, '1000px'], [1080, '1080px'], [1160, '1160px'], [1280, '1280px']], classicDialog || illustratedDialog)),
            // 经典/异型对话框的高度只由 skinDialogScale 控制，不再并列一个禁用的像素高度选项。
            dialogHeightField: classicDialog || illustratedDialog ? '' : field('readerSettings.dialogHeight', '对话框高度', selectInput('readerSettings.dialogHeight', reader.dialogHeight === null ? 'null' : reader.dialogHeight, dialogHeightItems)),
            glassOpacityField: field('readerSettings.glassOpacity', '玻璃浓度', selectInput('readerSettings.glassOpacity', reader.glassOpacity, [0, .1, .2, .35, .5, .62, .74, .88, 1].map((n) => [n, `${Math.round(n * 100)}%`]))),
            inputScaleField: field('readerSettings.inputScale', '输入框高度', selectInput('readerSettings.inputScale', reader.inputScale, [20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map((n) => [n, `${n}%`]))),
            toolbarScaleField: field('readerSettings.toolbarScale', '工具栏大小', selectInput('readerSettings.toolbarScale', reader.toolbarScale, [20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map((n) => [n, `${n}%`]))),
            inputPlacementField: field('readerSettings.inputPlacement', '输入框位置', selectInput('readerSettings.inputPlacement', reader.inputPlacement === 'float' ? 'float' : 'dialog', [['dialog', '放在对话框里'], ['float', '悬浮在对话框上方（有选项时点「自由输入」才出现）']])),
            toolbarDockField: field('readerSettings.toolbarDock', '工具栏位置', selectInput('readerSettings.toolbarDock', reader.toolbarDock || 'top', [['float', '紧贴对话框'], ['top', '顶部固定']])),
            toolbarSplitField: field('readerSettings.toolbarSplit', '按钮分布', selectInput('readerSettings.toolbarSplit', reader.toolbarSplit || 'split', [['split', '分两截（翻页读档在对话框下）'], ['top', '只用顶栏'], ['dialog', '全放对话框下']])),
            dialogBarAlignField: reader.toolbarSplit === 'top' ? '' : field('readerSettings.dialogBarAlign', '对话框下按钮位置', selectInput('readerSettings.dialogBarAlign', reader.dialogBarAlign || 'auto', [['auto', '自动（手机居中、电脑靠左）'], ['left', '靠左'], ['center', '居中'], ['right', '靠右']])),
            imgModeField: field('readerSettings.imgMode', '图像显示模式', selectInput('readerSettings.imgMode', reader.imgMode, [['adaptive', '自适应'], ['contain', '完整']])),
            imgBrightnessField: field('readerSettings.imgBrightness', '图片亮度', selectInput('readerSettings.imgBrightness', reader.imgBrightness, [50, 60, 70, 80, 88, 90, 100].map((n) => [n, `${n}%`]))),
            statusLineToggle: checkbox('readerSettings.showStatusLine', reader.showStatusLine, '显示对话框内状态行') + checkbox('readerSettings.dblclickCgOnly', reader.dblclickCgOnly, '隐藏对话框（右键 / 三击画面）') + checkbox('readerSettings.titleScreen', reader.titleScreen, '开场先显示主界面')
                + (supportsDialogAutoHeight(reader.dialogSkin) ? checkbox('readerSettings.dialogAutoHeight', reader.dialogAutoHeight, '对话框高度自适应（字少变矮）') : ''),
            cinemaBarsToggle: checkbox('readerSettings.cinemaBars', reader.cinemaBars, '电影黑边'),
            backdropFilterToggle: checkbox('readerSettings.glassBackdropFilter', reader.glassBackdropFilter, '毛玻璃模糊'),
            // 玻璃作用于工具栏、选项、数据库、地图和记录面板；对话框只有默认皮肤跟随，其余皮肤自带底色。
            glassScopeNote: dialogBgEditable ? '对话框跟着变' : '当前对话框不受影响',
            advancedDialogGlassOpen: advancedOpen('dialog-glass'),
            typewriterToggle: checkbox('readerSettings.typewriter.enabled', typewriter.enabled, '打字机'),
            playbackSpeed: field('readerSettings.typewriter.speed', '播放速度', segmentedInput('readerSettings.typewriter.speed', typewriter.speed, [['fast', '快'], ['medium', '中'], ['slow', '慢']], '播放速度'), '自动播放与打字机共用'),
            typewriterControls: typewriter.enabled ? [
                `<div class="igs-source-filter-grid">`,
                field('readerSettings.typewriter.mode', '演出方式', segmentedInput('readerSettings.typewriter.mode', typewriter.mode, [['soft', '柔和演出'], ['classic', '经典打字机']], '演出方式')),
                `</div>`,
                typewriter.mode === 'classic' ? checkbox('readerSettings.typewriter.punctuationPause', typewriter.punctuationPause, '标点处停顿') : '',
                typewriter.mode === 'classic' ? checkbox('readerSettings.typewriter.prosody', typewriter.prosody === true, '说话韵律') : '',
                typewriter.mode === 'classic' ? checkbox('readerSettings.typewriter.sound.enabled', typewriter.sound.enabled, '启用打字音效') : '',
                typewriter.mode === 'classic' && typewriter.sound.enabled
                    ? `<div class="igs-settings-sub igs-source-filter-grid">`
                        + field('readerSettings.typewriter.sound.dialoguePreset', '台词音色', selectInput('readerSettings.typewriter.sound.dialoguePreset', typewriter.sound.dialoguePreset, TYPEWRITER_VOICE_LABELS))
                        + field('readerSettings.typewriter.sound.dialogueVolume', '台词音量', rangeInput('readerSettings.typewriter.sound.dialogueVolume', typewriter.sound.dialogueVolume ?? typewriter.sound.volume ?? 0.5, '台词音量'))
                        + field('readerSettings.typewriter.sound.narrationPreset', '旁白音色', selectInput('readerSettings.typewriter.sound.narrationPreset', typewriter.sound.narrationPreset, TYPEWRITER_VOICE_LABELS))
                        + field('readerSettings.typewriter.sound.narrationVolume', '旁白音量', rangeInput('readerSettings.typewriter.sound.narrationVolume', typewriter.sound.narrationVolume ?? typewriter.sound.volume ?? 0.5, '旁白音量'))
                        + field('readerSettings.typewriter.sound.thoughtPreset', '心里话音色', selectInput('readerSettings.typewriter.sound.thoughtPreset', typewriter.sound.thoughtPreset, [['follow', '跟随台词']].concat(TYPEWRITER_VOICE_LABELS)))
                        + `</div>`
                        + checkbox('readerSettings.typewriter.sound.speakerPitch', typewriter.sound.speakerPitch, '按角色区分音高')
                        + `<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="typewriter-preview-sound">试听</button>`
                    : '',
            ].join('') : '',
            voiceBarkToggle: checkbox('readerSettings.voiceBark.enabled', voiceBark.enabled && !tts.enabled, '角色语气音'),
            // 台词开头按情绪播一声「啊、嗯、哼」；每个角色的声线在 素材 › 角色 › 角色设定 里选，默认按 DNA 性别自动分配。
            voiceBarkControls: voiceBark.enabled && !tts.enabled ? [
                field('readerSettings.voiceBark.frequency', '播放时机', segmentedInput('readerSettings.voiceBark.frequency', voiceBark.frequency, VOICE_BARK_FREQUENCIES, '播放时机')),
                field('readerSettings.voiceBark.volume', '音量', rangeInput('readerSettings.voiceBark.volume', voiceBark.volume, '语气音音量')),
                `<div class="igs-source-filter-note">声线可在「素材 › 角色 › 角色设定」中选择；未选择时按 DNA 中的性别分配。</div>`,
            ].join('') : '',
            ttsToggle: checkbox('readerSettings.tts.enabled', tts.enabled, '台词朗读（TTS）'),
            ttsControls: tts.enabled ? renderTtsControls(tts, { bilingual: normalizeBilingualSettings(reader.bilingual).enabled }) : '',
            stageShakeToggle: checkbox('readerSettings.stageShake.enabled', stageShake.enabled, '画面震动'),
            stageShakeSettings: stageShake.enabled ? renderStageShakeSettings(stageShake) : '',
            systemRoleFields: renderSystemRoleSettings(systemRole, {
                fontOptions,
                narrationColor: toHex(displayTheme.narrationColor || '#f4f4f6'),
                disabled: themeDisabled,
            }),
            chatShowToggle: checkbox('readerSettings.chatShow.enabled', chatShow.enabled, '线上交流'),
            chatShowSettings: chatShow.enabled ? renderChatShowSettings(chatShow, {
                promptDraft: asyncState.chatPromptDraft,
                promptStatus: asyncState.chatPromptStatus,
            }) : '',
            weatherFxToggle: checkbox('readerSettings.weatherFx.enabled', weatherFx.enabled, '天气'),
            weatherFxSettings: weatherFx.enabled ? renderWeatherFxSettings(weatherFx) : '',
            narrationFilterToggle: checkbox('readerSettings.statusHud.dimSpriteOnNarration', reader.statusHud && reader.statusHud.dimSpriteOnNarration !== false, '旁白时压暗立绘'),
            cgHoldField: field('readerSettings.cgHoldPages', '日常CG停留', selectInput('readerSettings.cgHoldPages', reader.cgHoldPages || 4, [[2, '2页'], [3, '3页'], [4, '4页'], [6, '6页'], [8, '8页']]), 'NSFW插图保持到下一张'),
            sentencePagingToggle: checkbox('bridge.sentencePaging', Boolean(bridge.sentencePaging), '旁白按句号分页'),
            nsfwSpriteModeField: `<div class="igs-settings-field">${segmentedInput('readerSettings.statusHud.nsfwSpriteMode', statusHud.nsfwSpriteMode, [['show', '显示立绘'], ['hide', '隐藏立绘'], ['shade', '仅露脸剪影']], 'NSFW 场景立绘')}<em>使用剪影前，请先在立绘编辑中标定头部</em></div>`,
            nsfwVeilLevelField: field('readerSettings.statusHud.nsfwVeilLevel', '黑幕强度', segmentedInput('readerSettings.statusHud.nsfwVeilLevel', (reader.statusHud && reader.statusHud.nsfwVeilLevel) || 'medium', [['light', '弱'], ['medium', '中'], ['strong', '强']], '黑幕强度')),
            nsfwCgPortraitToggle: checkbox('readerSettings.statusHud.nsfwCgPortrait', statusHud.nsfwCgPortrait, 'CG时对话框旁显示裸体头像（需衣柜里有引用「裸体」的服装）'),
            nsfwCgPortraitControls: statusHud.nsfwCgPortrait
                ? '<div class="igs-settings-field"><em>位置和大小在阅读器里调：挂着头像时点工具栏「调整立绘」，拖动、双指捏合或滚轮缩放后保存</em></div>'
                : '',
            statusHudSection: buildStatusHudSettingsHtml(reader, options),
            optionBubbleToggle: checkbox('bridge.optionBubble.enabled', Boolean(bridge.optionBubble && bridge.optionBubble.enabled), '启用选项气泡'),
            optionBubbleHidden: hiddenAttr(!(bridge.optionBubble && bridge.optionBubble.enabled)),
            optionBubblePositionField: field('bridge.optionBubble.position', '气泡位置', segmentedInput('bridge.optionBubble.position', (bridge.optionBubble && bridge.optionBubble.position) || 'top-left', [['top-left', '左上角'], ['top-center', '正上方居中'], ['top-right', '右上角']], '气泡位置')),
            optionBubbleActionField: field('bridge.optionBubble.clickAction', '点击选项', segmentedInput('bridge.optionBubble.clickAction', (bridge.optionBubble && bridge.optionBubble.clickAction) || 'send', [['send', '自动发送'], ['fill', '填入输入框']], '点击行为')),
            optionBubbleWidthToggle: checkbox('bridge.optionBubble.widthFollowsText', Boolean(bridge.optionBubble && bridge.optionBubble.widthFollowsText), '气泡宽度随文本变化'),
            pinnedButtonsField: renderPinnedButtons(reader.pinnedBtns, reader.hiddenBtns, reader.btnOrder, reader.dialogBarBtns, reader.toolbarSplit),
            themeNoteHidden: hiddenAttr(!themeDisabled),
            themeHidden: hiddenAttr(themeDisabled),
            dividerHidden: hiddenAttr(themeDisabled || classicDialog),
            dividerField: field(`${themePath}.dividerSymbol`, '样式', selectInput(`${themePath}.dividerSymbol`, displayTheme.dividerSymbol || 'none', [['gradient', '渐变线'], ['none', '无']], themeDisabled || classicDialog || !themeCustom)),
            nameFontField: field(`${themePath}.nameFont`, '字体', selectInput(`${themePath}.nameFont`, displayTheme.nameFont || 'inherit', fontOptions, themeDisabled || !themeCustom)),
            textFontField: field(`${themePath}.textFont`, '字体', selectInput(`${themePath}.textFont`, displayTheme.textFont || 'inherit', fontOptions, themeDisabled || !themeCustom)),
            thoughtFontField: field(`${themePath}.thoughtFont`, '字体', selectInput(`${themePath}.thoughtFont`, displayTheme.thoughtFont || 'inherit', fontOptions, themeDisabled || !themeCustom)),
            nameColorField: field(`${themePath}.nameColor`, '颜色', colorInput(`${themePath}.nameColor`, toHex(displayTheme.nameColor || '#ffeeb8'), themeDisabled || !themeCustom)),
            textColorField: field(`${themePath}.textColor`, '颜色', colorInput(`${themePath}.textColor`, toHex(displayTheme.textColor || '#f4f4f6'), themeDisabled || !themeCustom)),
            thoughtColorField: field(`${themePath}.thoughtColor`, '颜色', colorInput(`${themePath}.thoughtColor`, toHex(displayTheme.thoughtColor || '#c8c8dc'), themeDisabled || !themeCustom)),
            narrationFontField: field(`${themePath}.narrationFont`, '字体', selectInput(`${themePath}.narrationFont`, displayTheme.narrationFont || 'inherit', fontOptions, themeDisabled || !themeCustom)),
            narrationColorField: field(`${themePath}.narrationColor`, '颜色', colorInput(`${themePath}.narrationColor`, toHex(displayTheme.narrationColor || '#f4f4f6'), themeDisabled || !themeCustom)),
            dividerColorField: field(`${themePath}.dividerColor`, '颜色', colorInput(`${themePath}.dividerColor`, toHex(displayTheme.dividerColor || '#ffeeb8'), themeDisabled || classicDialog || !themeCustom)),
            dialogBgField: dialogBgEditable ? field(`${themePath}.dialogBg`, '背景色', colorInput(`${themePath}.dialogBg`, toHex(displayTheme.dialogBg || '#1f2225'), !themeCustom)) : '',
            dialogBgOpacityField: !dialogBgEditable ? '' : field(`${themePath}.bgOpacity`, '背景不透明度', selectInput(`${themePath}.bgOpacity`, displayTheme.bgOpacity == null ? 'null' : displayTheme.bgOpacity, [['null', '跟随玻璃'], [0, '0%'], [.1, '10%'], [.2, '20%'], [.35, '35%'], [.5, '50%'], [.62, '62%'], [.74, '74%'], [.88, '88%'], [1, '100%']], !themeCustom)),
        };
        if (readerSubTab === 'performance') {
            readerValues.performanceSections = renderPerformanceSettings(reader, { worldview: renderWorldviewRow(worldviewAssets), worldviewId: resolveWorldview(worldviewAssets),
                canUndo: Boolean(asyncState.perfPresetUndo),
                playbackSpeed: readerValues.playbackSpeed,
                typewriter: [readerValues.typewriterToggle, readerValues.typewriterControls],
                // 语气音的开关、时机、音量对所有角色生效，放「声音」；每个角色的声线在 素材 › 角色 › 角色设定。
                voiceBark: [readerValues.voiceBarkToggle, readerValues.voiceBarkControls],
                voiceBarkOn: normalizeVoiceBarkSettings(reader.voiceBark).enabled && !normalizeTtsSettings(reader.tts).enabled,
                tts: [readerValues.ttsToggle, readerValues.ttsControls],
                ttsOn: normalizeTtsSettings(reader.tts).enabled,
                stageShake: [readerValues.stageShakeToggle, readerValues.stageShakeSettings],
                weatherFx: [readerValues.weatherFxToggle, readerValues.weatherFxSettings],
                chatShow: [readerValues.chatShowToggle, readerValues.chatShowSettings],
                narrationFilter: readerValues.narrationFilterToggle,
                cgHold: readerValues.cgHoldField,
                cinemaBars: readerValues.cinemaBarsToggle,
                sentencePaging: readerValues.sentencePagingToggle,
                sentencePagingOn: Boolean(bridge.sentencePaging),
                nsfwSprite: readerValues.nsfwSpriteModeField,
                nsfwVeil: readerValues.nsfwVeilLevelField,
                nsfwCgPortrait: [readerValues.nsfwCgPortraitToggle, readerValues.nsfwCgPortraitControls],
            }, (key) => Boolean(asyncState.advancedOpen && asyncState.advancedOpen[key]));
        }
        return renderTemplate(getSettingsTabTemplate('reader'), {
            readerSubTabs,
            readerSubPane: renderTemplate(getReaderSubTabTemplate(readerSubTab), readerValues),
        });
    }

    function renderImageJobLogList() {
        const log = options.imageJobLog;
        const list = log && typeof log.list === 'function' ? log.list() : [];
        if (!list.length) return '<div class="igs-image-log-empty">暂无日志。开启自动插图或素材补全后，新回复的处理过程会记录在这里。</div>';
        return list.map((e) => `<div class="igs-image-log-item is-${esc(e.level)}"><span class="igs-image-log-time">${esc(formatImageJobLogTime(e.at))}</span><span class="igs-image-log-level">${esc(imageJobLogLevelLabel(e.level))}</span><span class="igs-image-log-msg">${esc(e.message)}</span></div>`).join('');
    }

    // 生图 › CG 库：与工具栏面板共用 cg-library-view。目录一次拿全；缩略图到了只换那一格、状态行只改文字，不整页重画。
    function cgAttr(value) {
        return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '');
    }

    function imageCgThumbHtml(view, entry) {
        const tile = view.tileOf(entry.key);
        if (tile.url) return `<img src="${esc(tile.url)}" decoding="async" alt="">`;
        if (tile.state === 'failed') return `<span class="igs-image-cg-failed" title="${esc(tile.reason)}">读取失败，点击重试</span>`;
        return '<span class="igs-image-cg-pending"></span>';
    }

    function imageCgView(settings) {
        const asyncState = settings.asyncState;
        if (asyncState.imageCg) return asyncState.imageCg;
        const service = options.cgGallery;
        if (!service || typeof service.syncIndex !== 'function') return null;
        let painting = false;
        const live = () => state.activeSettings === settings && asyncState.imageCg === view;
        const paint = () => {
            if (painting) return;
            painting = true;
            Promise.resolve().then(() => { painting = false; if (live()) rerenderSettings(); });
        };
        const find = (selector) => {
            const root = settings.dom && settings.dom.root;
            return root && typeof root.querySelector === 'function' ? root.querySelector(selector) : null;
        };
        const patchLine = () => {
            const el = find('[data-image-cg-line]');
            if (!el) return false;
            const text = view.statusText();
            el.textContent = text;
            el.style.display = text ? '' : 'none';
            return true;
        };
        const view = createCgLibraryView(service, {
            storage: (options.global || globalThis).localStorage,
            onChange: (type, key) => {
                if (!live()) return;
                if (type === 'thumb') {
                    const el = find(`[data-image-cg-thumb="${cgAttr(key)}"]`);
                    const entry = view.find(key);
                    if (el && entry) { el.innerHTML = imageCgThumbHtml(view, entry); patchLine(); return; }
                    if (!entry && patchLine()) return;
                }
                if (type === 'status' && patchLine()) return;
                paint();
            },
        });
        asyncState.imageCg = view;
        view.open({ showHidden: true });
        return view;
    }

    function renderImageCgList() {
        const settings = state.activeSettings;
        if (!settings || !settings.asyncState) return '';
        const view = imageCgView(settings);
        if (!view) return '<div class="igs-scene-empty">CG 库不可用</div>';
        const s = view.state;
        const text = view.statusText();
        const line = `<div class="igs-scene-empty" data-image-cg-line${text ? '' : ' style="display:none"'}>${esc(text)}</div>`;
        const pager = s.list.length > s.entries.length || s.page > 0
            ? `<div class="igs-settings-row"><button class="igs-settings-action" data-action="image-cg-page:prev" type="button" ${s.page <= 0 ? 'disabled' : ''}>上一页</button><span class="igs-image-cg-page">第 ${s.page + 1} / ${s.pages} 页 · 共 ${s.list.length} 张</span><button class="igs-settings-action" data-action="image-cg-page:next" type="button" ${s.page >= s.pages - 1 ? 'disabled' : ''}>下一页</button></div>`
            : (s.list.length ? `<div class="igs-image-cg-page">共 ${s.list.length} 张</div>` : '');
        const selected = settings.asyncState.imageCgSelected instanceof Set ? settings.asyncState.imageCgSelected : new Set();
        const tiles = s.entries.map((entry, index) => {
            const label = entry.kind === 'photo' ? '照片' : `第 ${entry.messageId} 楼`;
            const on = selected.has(entry.key);
            return `<article class="igs-image-cg-tile"><label class="igs-image-cg-check"><input type="checkbox" data-action="image-cg-toggle:${index}" ${on ? 'checked' : ''} aria-label="选择${esc(label)}"></label><button type="button" class="igs-image-cg-view" data-action="image-cg-view:${index}" aria-label="查看${esc(label)}大图"><span class="igs-image-cg-pic" data-image-cg-thumb="${esc(entry.key)}">${imageCgThumbHtml(view, entry)}</span><span>${esc(label)}</span></button><button type="button" class="igs-image-cg-delete" data-action="image-cg-delete:${index}">删除</button></article>`;
        }).join('');
        const empty = s.phase === 'ready' && !s.entries.length ? '<div class="igs-scene-empty">还没有生成过 CG</div>' : '';
        return pager + line + (tiles || empty);
    }

    function buildRegexPreview(bridge) {
        const filter = normalizeSourceFilter(bridge.sourceFilter);
        const virtualRegex = normalizeVirtualRegex(bridge.virtualRegex);
        const previewMessage = resolvePreviewMessage();
        const payload = buildIgsTextPayload(previewMessage, {
            sourceFilter: filter,
            virtualRegex,
        });
        if (!payload.formattedText) {
            return '当前没有可测试的正文内容。';
        }
        if (!virtualRegex.enabled || !virtualRegex.pattern) {
            return `formattedTextLength=${payload.formattedText.length}\n\n最终正文：\n${payload.formattedText}`;
        }
        return [
            `source=${payload.sourceKind}`,
            `tagTextLength=${String(payload.tagText || '').trim().length}`,
            `formattedTextLength=${payload.formattedText.length}`,
            `changed=${payload.virtualRegexChanged === true}`,
            payload.usedFallback ? 'fallback=true' : 'fallback=false',
            '',
            '最终正文：',
            payload.formattedText,
        ].join('\n');
    }

    function resolvePreviewMessage() {
        if (state.activeReader && state.activeReader.payload && state.activeReader.payload.message) {
            return state.activeReader.payload.message;
        }
        if (typeof options.getCurrentMessage === 'function') {
            const message = options.getCurrentMessage();
            if (message && typeof message === 'object' && typeof message.then !== 'function') {
                return message;
            }
        }
        return '';
    }

    // 阅读器是省电画质（手动选的，或自动判定为低端机）时，设置器遮罩也不做模糊、不铺水波纹。
    function settingsLowQuality(draft) {
        const reader = draft && draft.readerSettings;
        return resolveRenderQuality(reader && reader.performance && reader.performance.quality) === 'low';
    }

    return { buildSettingsSnapshot, renderSettingsBody, renderImageJobLogList, buildRegexPreview, settingsLowQuality };
}

function renderVoiceRowConfig(reader, sceneAssets) {
    const tts = normalizeTtsSettings(reader.tts);
    if (tts.enabled) return { sceneAssets, tts };
    return normalizeVoiceBarkSettings(reader.voiceBark).enabled ? { sceneAssets } : null;
}

// 台词朗读的设置：来源、旁白、音量语速，系统语音选女声 / 男声 / 旁白，接口填地址与声音名。
function renderTtsControls(tts, { bilingual = false } = {}) {
    const base = 'readerSettings.tts';
    const rates = TTS_RATES.map((v) => [v, v === 1 ? '正常' : `${v}×`]);
    const parts = [
        field(`${base}.provider`, '来源', segmentedInput(`${base}.provider`, tts.provider, TTS_PROVIDERS, '朗读来源')),
        checkbox(`${base}.narration`, tts.narration, '朗读旁白'),
        checkbox(`${base}.nsfw`, tts.nsfw, 'NSFW 场景也朗读'),
        checkbox(`${base}.sustain`, tts.sustain, '翻页不打断（上一句念完再念下一句）'),
        // 双语台词：读译文用中文声音；读原文时系统语音按原文语言换日文 / 英文声音。
        bilingual ? field(`${base}.bilingual`, '双语台词', segmentedInput(`${base}.bilingual`, tts.bilingual, TTS_BILINGUAL_MODES, '双语台词朗读')) : '',
        field(`${base}.volume`, '音量', rangeInput(`${base}.volume`, tts.volume, '朗读音量')),
        field(`${base}.rate`, '语速', selectInput(`${base}.rate`, tts.rate, rates)),
    ];
    const roles = [['female', '女声'], ['male', '男声'], ['narrator', '旁白']];
    if (tts.provider === 'system') {
        const options = systemVoiceOptions();
        for (const [key, label] of roles) {
            const value = tts.system[key];
            const items = [['', '自动']].concat(options);
            if (value && !options.some(([id]) => id === value)) items.push([value, `${value}（本机没有）`]);
            parts.push(field(`${base}.system.${key}`, label, selectInput(`${base}.system.${key}`, value, items)));
        }
        parts.push(`<div class="igs-source-filter-note">${options.length ? '' : '没读到本机的中文声音。'}Windows 推荐用 Edge 浏览器打开酒馆：有晓晓、云希等自然声；Chrome 只有慧慧、康康等本地声音。系统语音不支持声像和听筒音色。</div>`);
    } else {
        const api = tts.api;
        parts.push(
            field(`${base}.api.transport`, '传输方式', selectInput(`${base}.api.transport`, api.transport, TTS_TRANSPORTS)),
            field(`${base}.api.endpoint`, '接口地址', textInput(`${base}.api.endpoint`, api.endpoint, 'https://api.openai.com/v1 或 http://127.0.0.1:9880/v1')),
            field(`${base}.api.apiKey`, 'API Key', secretInput(`${base}.api.apiKey`, api.apiKey, '本地服务可留空')),
            field(`${base}.api.model`, '模型', textInput(`${base}.api.model`, api.model, '如 tts-1、FunAudioLLM/CosyVoice2-0.5B')),
        );
        for (const [key, label] of roles) parts.push(field(`${base}.api.${key}`, `${label}声音`, textInput(`${base}.api.${key}`, api[key], key === 'narrator' ? '留空用女声' : '接口里的声音名')));
        parts.push(
            field(`${base}.api.voices`, '可选声音', textInput(`${base}.api.voices`, api.voices, '逗号分隔，给角色单独指定时用')),
            checkbox(`${base}.api.prefetch`, api.prefetch, '提前生成下一页（在一页停留 1.5 秒后才生成，快速点过的页不生成）'),
            '<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="tts-clear-cache">清除朗读缓存</button>',
            '<div class="igs-source-filter-note">兼容 OpenAI 的 /audio/speech 接口。浏览器直连被跨域拦住时，改用「酒馆 CORS 代理」（需在酒馆 config.yaml 打开 enableCorsProxy）。</div>',
        );
    }
    parts.push(field(`${base}.lexicon`, '读音替换', textareaInput(`${base}.lexicon`, tts.lexicon, '每行一条：原词=读法\n例：雫=shizuku\n例：Λ=兰姆达')));
    parts.push('<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="tts-preview">试听</button>');
    parts.push('<div class="igs-source-filter-note">开启后不再播放角色语气音。每个角色的朗读声音可在「素材 › 角色 › 角色设定」单独指定。</div>');
    return parts.join('');
}
