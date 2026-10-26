import { readLive2dConfig } from './live2d-config.js';
import { renderLive2dLibrary } from './live2d-panel.js';
// 设置器的快照与各页 HTML：只读草稿和异步状态生成标记，不碰 DOM；挂载、事件和保存在 settings-host.js。
import { DIALOG_SKIN_MERMAID, MERMAID_TONES, normalizeMermaidAccent, normalizeMermaidTone } from './dialog-theme-mermaid.js';
import { buildIgsTextPayload, normalizeSourceFilter, normalizeVirtualRegex } from '../../scene/message-source.js';
import { dropConfirmedOutfitReview, loadOutfitReview } from '../../scene/outfit-review-store.js';
import { assetOwnerKey, assetShadowsGlobal, draftEffectiveAssets, effectiveSceneAssets, rememberAssetScope } from '../../scene/asset-scope.js';
import { getSillyTavernContext } from '../../host/tavern-helper-adapter.js';
import { menuItem, renderMigrateEntry, renderOutfitReviewList, renderRowMenu, renderWardrobe } from './settings-outfit-fields.js';
import { normalizeItemImageSettings } from '../../generated-images/illustration/item-image-settings.js';
import { createCgLibraryView } from './cg-library-view.js';
import { countEnabledPerformance, performanceGroupCounts, renderPerformancePage, renderPerformancePresetBar } from './performance-settings-layout.js';
import { renderWorldviewRow } from './worldview-fields.js';
import { renderQualityRow } from './render-quality-fields.js';
import { isGeneratedAssetUrl, normalizeGeneratedLibrary } from '../../scene/asset-match.js';
import { createOutfitResolver, isBuiltinNudeOutfit } from '../../scene/character-outfits.js';
import { readDefaultOutfit, pickOutfitSprite } from '../../scene/character-appearance.js';
import { renderEventCgList } from './settings-event-cg.js';
import { CHARACTER_ADD_MENU, renderDnaCandidateBar, renderDnaOnlyCharacterList, kindModelPicker, checkbox, colorInput, field, renderCharacterAssetList, renderMoodGroupList, renderMoodReviewList, renderPinnedButtons, renderShortcutSettings, renderSceneAssetList, renderGeneratedAssetPane, countGeneratedWaiting, renderStageShakeSettings, renderChatShowSettings, renderSystemRoleSettings, renderSystemRoleAdvanced, renderWeatherFxSettings, renderCustomFontManager, renderTemplate, rangeInput, secretInput, segmentedInput, selectInput, textInput, textareaInput, numberInput, hiddenAttr, modelPicker, tableMultiSelect } from './settings-fields.js';
import { NSFW_COUNT_MAX, CONSISTENCY_MODEL_OPTIONS, normalizeAutoIllustrationSettings } from '../../generated-images/illustration/auto-illustration-settings.js';
import { describeLlmReady } from '../../generated-images/illustration/caption-writer.js';
import { normalizeImageSourceMode, mergeLegacyNaiSettings } from '../../generated-images/image-backend.js';
import { getSettingsShellTemplate, renderSettingsNav } from './settings-shell.js';
import { EVENTCG_TEMPLATE, SCENE_HEAD_TEMPLATE, WARDROBE_TEMPLATE, getPageTemplate } from './settings-tabs.js';
import { PAGE_PERFORMANCE_GROUPS, SETTINGS_CATEGORIES, categoryLabel, categoryOfPage, currentSettingsPage, defaultPageOfCategory, pageLabel, pagesOfCategory } from './settings-pages.js';
import { renderDashboard } from './settings-dashboard.js';
import { loadSettingsRecent } from './settings-recent.js';
import { getReaderModeIcon } from './icons.js';
import { renderPromptKindsPanel } from './settings-prompt-kinds.js';
import { renderImagePromptPanel } from './settings-image-prompt-view.js';
import { renderArtistLibrary, renderArtistSelector } from './settings-artist-library.js';
import { renderModelProfileRow } from './settings-model-profiles.js';
import { normalizeSettingsTheme, renderSettingsThemeSwitch } from './settings-theme.js';
import { fontOptionsWith, loadCustomFonts, registerCustomFonts } from '../../media/custom-fonts.js';
import { DIALOG_FONT_OPTIONS, PROMPT_RULE_OFF_HINT, PROMPT_RULE_PRESET_HINT, scenePromptRuleOutfitHint, SETTINGS_PANEL_REQUIRED_SELECTORS, SETTINGS_PANEL_TAB_CONTRACT } from './reader-host-constants.js';
import { PUBLIC_READER_MODES, getReaderModeLabel } from '../../schemas/reader-mode.js';
import { esc, toHex } from './reader-value-utils.js';

import { normalizeSpriteDefaultScale, normalizeSpriteDisplayScale, normalizeSpriteGenderScale } from './settings-normalize.js';
import { createShujukuClient } from '../../data/shujuku/client.js';
import { listStatusHudTables, normalizeStatusHudSettings } from '../../data/shujuku/status-hud-model.js';
import { isStatusHudPhone, renderStatusHudPositionField, statusHudPositionDevice } from './status-hud-position-fields.js';
import { renderSectionResetButton, sectionResetPlaceholders } from './settings-sections.js';
import { normalizeImageJobLogSettings, formatImageJobLogTime, imageJobLogLevelLabel } from '../../generated-images/image-job-log.js';
import { normalizeImageCacheCount } from '../../media/tavern-image-cache.js';
import { CREATURE_DISPLAY_RANGE, normalizeCreatureDisplaySettings } from '../../scene/creature-profile.js';
import { normalizeStatsSettings } from '../../scene/stats/stat-settings.js';
import { renderStatsArchive, renderStatsBuildFields, renderStatsMappingFields, renderStatsPromptFields } from './stats-settings-fields.js';
import { resolveWorldview } from '../../scene/worldview.js';
import { applyFxWorldview } from '../../scene/fx-era.js';
import { loadAssetFoldersFor } from './asset-folders.js';
import { isLayeredPreset, readLegacyPresetsView, legacyPresetHasContent } from '../../scene/legacy-preset.js';
import { renderAssetFolderView, renderAssetFolderSelect } from './asset-folder-view.js';
import { loadMoodReview } from '../../scene/mood-review-store.js';
import { CLASSIC_DIALOG_THEME_DEFAULTS, DIALOG_SKIN_GRADIENT_VEIL, DIALOG_SKIN_WESTERN_CLASSIC, isIllustratedDialogSkin, supportsDialogAutoHeight } from './classic-dialog-skin.js';
import { dialogSkinLabel, getDialogSkinChoices } from './dialog-skin-catalog.js';
import { DIALOG_SKIN_XIANXIA_INK } from './dialog-theme-xianxia.js';
import { DIALOG_SKIN_MAGIC_ACADEMY, MAGIC_HOUSES, normalizeMagicAccent, normalizeMagicHouse } from './dialog-theme-css-skins.js';
import { VOICE_BARK_FREQUENCIES, normalizeVoiceBarkSettings } from './voice-bark.js';
import { TTS_API_FORMATS, TTS_BILINGUAL_MODES, TTS_CACHE_LIMIT, TTS_THOUGHT_BILINGUAL_MODES, TTS_CUSTOM_METHODS, TTS_CUSTOM_RESPONSES, TTS_PROVIDERS, TTS_RATES, TTS_RESPONSE_FORMATS, TTS_TRANSPORTS, TTS_VOICE_MAX, findSystemVoice, hasNaturalSystemVoice, listSystemVoices, normalizeTtsSettings, parseVoicePool, systemVoiceOptions, ttsApiVoiceOptions, ttsMixedContentRisk, ttsNarratorVoiceOptions, ttsVoiceEntries } from './tts.js';
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
import { renderPromptEntryFields } from './prompt-entries-fields.js';
import { getLastPromptReport } from '../../scene/prompt-triggers.js';
import { resolveRenderQuality } from './render-quality.js';

// 这几个分类的页面按当前角色卡显示（适配世界、本卡对话框风格提示、仪表盘现状）。
const READER_SCOPE_CATEGORIES = new Set(['dash', 'style', 'text', 'ui', 'perf', 'sound']);

const ASSET_MOVE_ALL_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>';

export function createSettingsRenderer({ normalizeUnifiedSettings, options, rerenderSettings, settingsShellHtml, state }) {
    // 草稿可被原地修改，整理结果按「草稿引用 + 修订号」缓存；只有调用方声明草稿没动（reuseNormalized）时才复用，
    // 任何写草稿的入口都会递增 draftRevision，缓存因此不会让改过的设置显示旧值。
    function normalizeSettingsDraft(settingsState) {
        const cache = settingsState.normalizedDraftCache;
        const revision = settingsState.draftRevision || 0;
        const reuse = settingsState.reuseNormalized === true;
        settingsState.reuseNormalized = false;
        if (reuse && cache && cache.source === settingsState.draft && cache.revision === revision) return cache.value;
        const value = normalizeUnifiedSettings(settingsState.draft, undefined, { mutableSource: true });
        settingsState.normalizedDraftCache = { source: settingsState.draft, revision, value };
        return value;
    }

    function buildSettingsSnapshot(settingsState) {
        const page = currentSettingsPage(settingsState);
        const tab = categoryOfPage(page);
        settingsState.tab = tab;
        settingsState.asyncState = settingsState.asyncState || {};
        settingsState.asyncState.page = page;
        // 「适配世界」与本卡对话框风格提示都按当前角色卡显示，渲染前先记下是哪张卡（角色、场景分类在自己的分支里记）。
        if (READER_SCOPE_CATEGORIES.has(tab)) rememberAssetScope(settingsState, getSillyTavernContext(options.global || globalThis));
        const draft = normalizeSettingsDraft(settingsState);
        const settingsTheme = normalizeSettingsTheme(draft.bridge.settingsTheme);
        const body = renderSettingsBody(page, draft, settingsState.asyncState);
        const shellHtml = renderTemplate(getSettingsShellTemplate(), {
            version: esc(options.version || '0.5.4'),
            title: esc(tab === 'dash' ? '仪表盘' : categoryLabel(tab)),
            nav: renderSettingsNav(SETTINGS_CATEGORIES, tab, esc),
            body,
            settingsThemeSwitch: renderSettingsThemeSwitch(settingsTheme),
        });

        const snapshot = {
            tab,
            category: tab,
            page,
            settingsTheme,
            settingsThemeSwitch: renderSettingsThemeSwitch(settingsTheme),
            selectors: Array.from(SETTINGS_PANEL_REQUIRED_SELECTORS),
            tabs: SETTINGS_CATEGORIES.map(([id, label]) => ({
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
            imagePrompt: settingsState.asyncState.imagePromptEditor ? (() => {
                const edit = settingsState.asyncState.imagePromptEditor.state;
                return { presetId: edit.preset?.id || null, baseRevision: edit.baseRevision,
                    draftRevision: edit.draftRevision, dirty: edit.dirty, status: edit.status,
                    errors: { ...edit.errors }, hasPreview: Boolean(edit.preview) };
            })() : null,
        };
        settingsShellHtml.set(snapshot, { theme: settingsTheme, html: shellHtml });
        return snapshot;
    }

    // 搜索索引用：把一个页面按「索引模式」渲染成 HTML（折叠全部视为展开，跳过重列表和带副作用的读取）。
    // 建索引时各页共用调用方传入的同一份归一化草稿（渲染只读草稿），不再每页各归一化一次。
    function renderPageForIndex(settingsState, page, draft = normalizeUnifiedSettings(settingsState.draft, undefined, { mutableSource: true })) {
        return renderSettingsBody(page, draft, settingsState.asyncState || {}, { index: true });
    }

    function renderSettingsBody(page, draft, asyncState, mode = {}) {
        const idx = Boolean(mode && mode.index);
        const memo = (fn) => { let done = false; let value; return () => { if (!done) { value = fn(); done = true; } return value; }; };
        const isOpenKey = (key) => idx || Boolean(asyncState.advancedOpen && asyncState.advancedOpen[key]);
        function buildStatusHudSettingsHtml(reader, options) {
            const statusHud = normalizeStatusHudSettings(reader && reader.statusHud);
            const sectionClass = 'igs-settings-section igs-status-hud-section';
            const toggle = checkbox('readerSettings.statusHud.enabled', statusHud.enabled, '显示状态栏');
            if (!statusHud.enabled) {
                return `<div class="${sectionClass}" data-status-hud>${toggle}</div>`;
            }
            const win = options.global || globalThis;
            const api = win.AutoCardUpdaterAPI || null;
            const listed = api && !idx ? listStatusHudTables(createShujukuClient(api).readTables()) : { ok: false, reason: 'missing-api', tables: [] };
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

        const advancedOpen = (key) => (isOpenKey(key) ? ' open' : '');

        // 数值系统页：总开关关闭时下方整块隐藏，只留一行说明（§10）。
        const statsValues = memo(() => {
            const stats = normalizeStatsSettings(bridge.stats);
            let chat = null;
            try { chat = typeof options.statsChat === 'function' && !idx ? options.statsChat() : null; } catch (error) { chat = null; }
            const chatReady = Boolean(stats.enabled && chat && chat.hasChat && !chat.blocked);
            const chatNote = !chat || !chat.hasChat ? '打开一个聊天后可以在这里启用。'
                : chat.blocked ? `本聊天的数值存档无法读取（${chat.blocked}），已停止写入，原存档保留。`
                    : chat.enabled ? '本聊天已启用。暂停后数值冻结、不结算，存档保留。' : '本聊天尚未启用数值系统。';
            return {
                statsToggle: checkbox('bridge.stats.enabled', stats.enabled, '启用数值系统'),
                statsOffNoteHidden: hiddenAttr(stats.enabled),
                statsHidden: hiddenAttr(!stats.enabled),
                autoSkillField: checkbox('bridge.stats.autoSkill', stats.autoSkill, '自动判断检定技能（关闭后不做先掷后写）'),
                intimacyField: checkbox('bridge.stats.intimacyGate', stats.intimacyGate, '亲密门槛（好感与信任不够时角色会拒绝）'),
                registerField: field('bridge.stats.register', '重要角色登记', selectInput('bridge.stats.register', stats.register, [['auto', '自动'], ['manual', '仅手动']])),
                hudLabelField: field('bridge.stats.hudLabel', '好感条右侧', selectInput('bridge.stats.hudLabel', stats.hudLabel, [['stage', '阶段名'], ['number', '数字'], ['both', '两者']])),
                barsFields: checkbox('bridge.stats.bars.stamina', stats.bars.stamina, '体力')
                    + checkbox('bridge.stats.bars.money', stats.bars.money, '金钱')
                    + checkbox('bridge.stats.bars.stress', stats.bars.stress, '压力'),
                pushField: checkbox('bridge.stats.push.enabled', stats.push.enabled, '同步到数据库表格（需要数据库插件）'),
                statsPromptFields: renderStatsPromptFields(stats, advancedOpen),
                statsMappingFields: renderStatsMappingFields((() => {
                    if (!stats.push.enabled || idx || typeof options.statsMappings !== 'function') return null;
                    try { return options.statsMappings(stats.push.mappings); } catch (error) { return { ok: false, reason: 'stats-push-read-failed', detail: String(error && error.message || error) }; }
                })(), advancedOpen, { pushEnabled: stats.push.enabled }),
                statsArchiveFields: renderStatsArchive((() => {
                    try { return typeof options.statsArchive === 'function' && !idx ? options.statsArchive() : null; } catch (error) { return null; }
                })(), advancedOpen),
                statsChatNote: esc(chatNote),
                statsChatEnableHidden: hiddenAttr(!chatReady || chat.enabled),
                statsChatDisableHidden: hiddenAttr(!chatReady || !chat.enabled),
                statsBuildFields: renderStatsBuildFields(stats.build, advancedOpen, { worldview: resolveWorldview(worldviewAssets) }),
                statsBuildHidden: hiddenAttr(!chatReady || chat.enabled),
            };
        });

        const parseValues = memo(() => ({
                advancedFilterOpen: advancedOpen('source-filter'),
                // 解析出错时的应急项：强行指定这一楼的图片数量，多截少补。
            imageCountField: field('readerSettings.imageCountOverride', '检测图像数量', selectInput('readerSettings.imageCountOverride', reader.imageCountOverride === null ? 'null' : reader.imageCountOverride, [['null', '自动']].concat(Array.from({ length: 20 }, (_, index) => [index + 1, `${index + 1}张`])))),
                advancedRegexOpen: advancedOpen('virtual-regex'),
                advancedBodyFormatOpen: advancedOpen('body-format'),
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
        }));
        const imageValues = memo(() => {
            const sourceMode = normalizeImageSourceMode(imageApi.mode);
            const auto = normalizeAutoIllustrationSettings(mergeLegacyNaiSettings(bridge.autoIllustration, imageApi));
            const sourceNotes = {
                nai: '用 NAI 生成剧情 CG、立绘与背景。',
                dbgen: '提示词与 Key 由数据库生图插件管理。',
                extension: '画风沿用智绘姬。',
                baibai: '画风沿用柏宝绘。',
            };
            const contentNotes = {
                nai: '当前图像来源：IGS内置NAI。',
                dbgen: '当前图像来源：数据库生图插件。',
                extension: '当前图像来源：智绘姬，不使用画师串与分类模型。',
                baibai: '当前图像来源：柏宝绘，不使用画师串与分类模型。',
            };
            const openaiDisabled = auto.llm.source !== 'openai';
            const llmReady = describeLlmReady(auto.llm);
            const autoTextarea = (path, value, placeholder) => `<textarea data-path="${esc(path)}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
            const logSettings = normalizeImageJobLogSettings(bridge.imageJobLog);
            const imageFields = {
                imageLogRetainDaysField: field('bridge.imageJobLog.retainDays', '保留天数（0不限）', numberInput('bridge.imageJobLog.retainDays', logSettings.retainDays, 0, 30)),
                imageLogMaxEntriesField: field('bridge.imageJobLog.maxEntries', '最多保留条数', numberInput('bridge.imageJobLog.maxEntries', logSettings.maxEntries, 50, 1000)),
                advancedImageLogOpen: advancedOpen('image-log-retain'),
                imageLogStatus: esc(asyncState.imageLogStatus || ''),
                imageLogList: page === 'logs' && !idx ? renderImageJobLogList() : '',
                imageCacheCountField: field('bridge.imageCache.maxCount', '本地缓存张数', numberInput('bridge.imageCache.maxCount', normalizeImageCacheCount(bridge.imageCache && bridge.imageCache.maxCount), 1, 2000)),
                imageCompressionField: checkbox('bridge.imageCache.compressDisplay', bridge.imageCache?.compressDisplay !== false, '压缩显示图片（WebP）'),
                ttsCacheField: field('readerSettings.tts.cacheMax', '朗读缓存保留条数', numberInput('readerSettings.tts.cacheMax', normalizeTtsSettings(reader && reader.tts).cacheMax, 0, TTS_CACHE_LIMIT)),
                ttsCacheStatus: esc(asyncState.ttsCacheStatus || ''),
                imageCacheStatus: esc(asyncState.imageCacheStatus || ''),
                imageCgStatus: esc(asyncState.imageCgStatus || ''),
                imageCgList: page === 'cglib' && !idx ? renderImageCgList() : '',
                imageCgOldestFirst: String(Boolean(asyncState.imageCg && asyncState.imageCg.state.filters.oldestFirst)),
                imageCgOrderLabel: asyncState.imageCg && asyncState.imageCg.state.filters.oldestFirst ? '最早在前' : '最新在前',
                imageSourceField: field('bridge.imageApi.mode', '图像来源', segmentedInput('bridge.imageApi.mode', sourceMode, [['nai', 'IGS内置NAI'], ['dbgen', '数据库生图插件'], ['extension', '智绘姬'], ['baibai', '柏宝绘']], '图像来源')),
                imageSourceNote: esc(sourceNotes[sourceMode]),
                imageContentNote: esc(contentNotes[sourceMode]),
                sourceNaiHidden: hiddenAttr(sourceMode !== 'nai'),
                sourceBuiltinHidden: hiddenAttr(sourceMode !== 'nai'),
                sourceConsistencyHidden: hiddenAttr(sourceMode !== 'nai' && sourceMode !== 'dbgen'),
                sourceExtensionHidden: hiddenAttr(sourceMode !== 'extension'),
                sourceDbgenHidden: hiddenAttr(sourceMode !== 'dbgen'),
                sourceExternalHidden: hiddenAttr(sourceMode === 'nai'),
                externalSpriteDnaField: checkbox('bridge.imageApi.externalSpriteDna', imageApi.externalSpriteDna === true, '外部生图前补齐角色 DNA'),
                naiSpriteTransparentField: checkbox('bridge.imageApi.naiSpriteTransparent', imageApi.naiSpriteTransparent !== false, '立绘透明底'),
                dbgenSpriteTransparentField: checkbox('bridge.imageApi.dbgenSpriteTransparent', imageApi.dbgenSpriteTransparent !== false, '立绘透明底（V4.5 请关闭）'),
                advancedNaiOpen: advancedOpen('nai'),
                advancedExtensionOpen: advancedOpen('extension'),
                advancedNsfwOpen: advancedOpen('nsfw'),
                advancedAssetTemplatesOpen: advancedOpen('asset-templates'),
                autoAssetOptionsHidden: hiddenAttr(!auto.assets.spriteEnabled && !auto.assets.backgroundEnabled),
                assetSceneWarnHidden: hiddenAttr(!(auto.assets.spriteEnabled || auto.assets.backgroundEnabled) || Boolean(bridge.sceneAssets && bridge.sceneAssets.enabled)),
                imagePromptPanel: sourceMode === 'nai' ? renderImagePromptPanel(asyncState.imagePromptEditor, asyncState.advancedOpen) : '',
                artistLibraryPanel: renderArtistLibrary(auto.nai, asyncState.artistLibrary),
                globalArtistField: sourceMode === 'nai' || sourceMode === 'dbgen'
                    ? renderArtistSelector(auto.nai, 'global', sourceMode) : '',
                autoLlmNote: esc(sourceMode === 'dbgen'
                    ? '规划剧情 CG 与素材标签。'
                    : '编写生图提示词；可沿用酒馆 API。'),
                adapterField: field('bridge.imageApi.externalAdapter', '识别范围', selectInput('bridge.imageApi.externalAdapter', imageApi.externalAdapter, [['auto', '自动检测'], ['chatu8', '仅智绘姬（st-chatu8）']])),
                pollIntervalField: field('bridge.imageApi.pollIntervalMs', '等待新图：查询间隔（毫秒）', numberInput('bridge.imageApi.pollIntervalMs', imageApi.pollIntervalMs, 500, 30000)),
                pollAttemptsField: field('bridge.imageApi.pollAttempts', '等待新图：查询次数', numberInput('bridge.imageApi.pollAttempts', imageApi.pollAttempts, 1, 240)),
                imageTestActionLabel: sourceMode === 'extension' ? '检测智绘姬' : (sourceMode === 'dbgen' ? '测试生成' : '测试生成'),
                imageTestHelp: esc(asyncState.imageResult || ''),
                autoNsfwField: checkbox('bridge.autoIllustration.nsfwEnabled', auto.nsfwEnabled, 'NSFW自动生图'),
                autoNsfwHidden: hiddenAttr(!auto.nsfwEnabled),
                autoNsfwCountField: field('bridge.autoIllustration.nsfwCount', '每层张数', numberInput('bridge.autoIllustration.nsfwCount', auto.nsfwCount, 1, NSFW_COUNT_MAX)),
                autoInterludeField: checkbox('bridge.autoIllustration.interludeEnabled', auto.interludeEnabled, '过场CG'),
                autoInterludeHidden: hiddenAttr(!auto.interludeEnabled),
                autoBackfillField: checkbox('bridge.autoIllustration.backfillOldFloors', auto.backfillOldFloors, '阅读旧楼层时补全插图'),
                autoInterludeProbabilityField: field('bridge.autoIllustration.interludeProbability', '触发概率 %', numberInput('bridge.autoIllustration.interludeProbability', auto.interludeProbability, 0, 100)),
                autoInterludeMaxField: field('bridge.autoIllustration.interludeMaxCount', '每层最多张数', numberInput('bridge.autoIllustration.interludeMaxCount', auto.interludeMaxCount, 1, 16)),
                autoAssetSpriteField: checkbox('bridge.autoIllustration.assets.spriteEnabled', auto.assets.spriteEnabled, '自动生成角色立绘'),
                autoOutfitField: checkbox('bridge.autoIllustration.assets.outfitAutoGenerate', auto.assets.outfitAutoGenerate, '新衣装自动入库并生成立绘'),
                autoAssetBackgroundField: checkbox('bridge.autoIllustration.assets.backgroundEnabled', auto.assets.backgroundEnabled, '自动生成场景背景'),
                autoAssetDayFirstField: checkbox('bridge.autoIllustration.assets.dayFirst', auto.assets.dayFirst, '非白天先画白天再差分'),
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
                    + field('bridge.itemImages.inventoryIcon', '背包格子图标', selectInput('bridge.itemImages.inventoryIcon', normalizeItemImageSettings(bridge.itemImages).inventoryIcon, [['image', '图片'], ['svg', '矢量图标']])),
                autoLlmApiHidden: hiddenAttr(openaiDisabled),
                autoLlmSourceField: field('bridge.autoIllustration.llm.source', '来源', selectInput('bridge.autoIllustration.llm.source', auto.llm.source, [['tavern', '酒馆当前API（消耗主模型额度）'], ['openai', '独立API']])),
                autoLlmEndpointField: field('bridge.autoIllustration.llm.endpoint', '地址', textInput('bridge.autoIllustration.llm.endpoint', auto.llm.endpoint, 'https://.../v1', 'text', openaiDisabled)),
                autoLlmKeyField: field('bridge.autoIllustration.llm.apiKey', 'API Key', secretInput('bridge.autoIllustration.llm.apiKey', auto.llm.apiKey, '无需Key可留空', openaiDisabled)),
                autoLlmModelField: field('bridge.autoIllustration.llm.model', '模型', modelPicker('bridge.autoIllustration.llm.model', auto.llm.model, asyncState.llmModels, 'fetch-llm-models', 'gpt-4o-mini', openaiDisabled)),
                autoLlmModelsMessage: esc(asyncState.llmModelsMessage || ''),
                autoLlmRequestOpen: advancedOpen('llm-request'),
                autoLlmIncludeHeadersField: field('bridge.autoIllustration.llm.includeHeaders', '附加请求头', autoTextarea('bridge.autoIllustration.llm.includeHeaders', auto.llm.includeHeaders, 'X-Title: IGS')),
                autoLlmIncludeBodyField: field('bridge.autoIllustration.llm.includeBody', '附加请求体参数', autoTextarea('bridge.autoIllustration.llm.includeBody', auto.llm.includeBody, 'temperature: 0.8')),
                autoLlmExcludeBodyField: field('bridge.autoIllustration.llm.excludeBody', '排除请求体参数', autoTextarea('bridge.autoIllustration.llm.excludeBody', auto.llm.excludeBody, '- frequency_penalty')),
                autoLlmPromptsOpen: advancedOpen('llm-prompts'),
                autoLlmJailbreakHeadField: field('bridge.autoIllustration.llm.jailbreakHead', '头部附加词', autoTextarea('bridge.autoIllustration.llm.jailbreakHead', auto.llm.jailbreakHead, '每次写词请求最前插入')),
                autoLlmJailbreakTailField: field('bridge.autoIllustration.llm.jailbreakTail', '尾部附加词', autoTextarea('bridge.autoIllustration.llm.jailbreakTail', auto.llm.jailbreakTail, '每次写词请求最后插入')),
                autoLlmContextField: field('bridge.autoIllustration.llm.contextFloors', '参考前文楼层数', numberInput('bridge.autoIllustration.llm.contextFloors', auto.llm.contextFloors, 0, 3)),
                autoNaiTransportField: field('bridge.autoIllustration.nai.transport', '传输方式', selectInput('bridge.autoIllustration.nai.transport', auto.nai.transport, [['direct', '浏览器直连'], ['st-proxy', '酒馆CORS代理（需开启enableCorsProxy）'], ['auto', '自动（酒馆代理已开启时经酒馆转发）']])),
                autoNaiEndpointField: field('bridge.autoIllustration.nai.endpoint', 'NAI API 地址', textInput('bridge.autoIllustration.nai.endpoint', auto.nai.endpoint, '留空使用官方，或填写中转生图接口')),
                autoNaiKeyField: field('bridge.autoIllustration.nai.apiKey', 'API Key', secretInput('bridge.autoIllustration.nai.apiKey', auto.nai.apiKey, '填写官方或中转服务的 Key')),
                autoNaiModelField: field('bridge.autoIllustration.nai.model', '模型', modelPicker('bridge.autoIllustration.nai.model', auto.nai.model, asyncState.naiModels, 'fetch-nai-models', 'nai-diffusion-4-5-full')),
                modelProfileImageRow: renderModelProfileRow('image', asyncState.modelProfiles),
                modelProfileLlmRow: renderModelProfileRow('llm', asyncState.modelProfiles),
                autoNaiModelsMessage: esc(asyncState.naiModelsMessage || ''),
                autoNaiSizeField: field('bridge.autoIllustration.nai.size', '尺寸', textInput('bridge.autoIllustration.nai.size', auto.nai.size, '832x1216')),
                autoNaiStepsField: field('bridge.autoIllustration.nai.steps', '步数', numberInput('bridge.autoIllustration.nai.steps', auto.nai.steps, 1, 50)),
                autoNaiScaleField: field('bridge.autoIllustration.nai.scale', 'CFG', numberInput('bridge.autoIllustration.nai.scale', auto.nai.scale, 0, 10, false, 'any')),
                consistencyStrengthField: field('bridge.autoIllustration.consistencyStrength', '一致性重绘强度', numberInput('bridge.autoIllustration.consistencyStrength', auto.consistencyStrength, 0.1, 1, false, '0.05'), '0.1–1，越低越保留原图'),
                consistencyModelField: field('bridge.autoIllustration.consistencyModel', '一致性重绘模型', selectInput('bridge.autoIllustration.consistencyModel', auto.consistencyModel, CONSISTENCY_MODEL_OPTIONS)),
                autoNaiSamplerField: field('bridge.autoIllustration.nai.sampler', '采样器', textInput('bridge.autoIllustration.nai.sampler', auto.nai.sampler, 'k_euler_ancestral')),
            };
            const grid = (...items) => {
                const body = items.filter(Boolean).join('');
                return body ? `<div class="igs-source-filter-grid">${body}</div>` : '';
            };
            // 分类型模型只对内置 NAI 和数据库生图插件生效；智绘姬、柏宝绘用插件自己的模型，不显示。留空跟随「图像来源」的模型。
            const kindModel = (kind, label) => (sourceMode === 'nai' || sourceMode === 'dbgen'
                ? field(`bridge.imageApi.${kind}Model`, label, kindModelPicker(`bridge.imageApi.${kind}Model`, imageApi[`${kind}Model`], pulledImageModels)) : '');
            imageFields.promptKindsPanel = renderPromptKindsPanel({
                nai: auto.nai, sourceMode, checkbox, advancedOpen,
                templateFields: {
                    sprite: [imageFields.autoAssetSpriteTemplateField, imageFields.autoAssetSpriteNegativeTemplateField],
                    background: [imageFields.autoAssetBackgroundTemplateField, imageFields.autoAssetBackgroundNegativeTemplateField],
                    nsfwCg: [imageFields.autoAssetNsfwExtraField],
                },
                slots: {
                    common: `<div class="igs-source-filter-note"${imageFields.assetSceneWarnHidden}>需先在「角色」页开启场景素材模式。</div>`
                        + `<div class="igs-settings-sub" data-image-feature="asset-options"${imageFields.autoAssetOptionsHidden}>${grid(imageFields.autoAssetMaxField)}</div>`,
                    character: grid(imageFields.autoAssetSpriteField, '<button type="button" class="igs-settings-action" data-action="open-character-dna" title="在「角色」页编辑外貌（DNA）">角色 DNA</button>')
                        + grid(imageFields.autoOutfitField)
                        + '<div class="igs-source-filter-note">会调用备用模型和当前生图来源。</div>'
                        + `<div class="igs-settings-sub" data-image-feature="sprite-options"${hiddenAttr(!auto.assets.spriteEnabled)}>${grid(imageFields.autoAssetSpriteSizeField, kindModel('sprite', '立绘模型'))}</div>`,
                    scene: grid(imageFields.autoAssetBackgroundField)
                        + `<div class="igs-settings-sub" data-image-feature="background-options"${hiddenAttr(!auto.assets.backgroundEnabled)}>${grid(imageFields.autoAssetBackgroundSizeField, kindModel('background', '背景模型'), imageFields.autoAssetDayFirstField)}</div>`
                        + grid(imageFields.itemImageFields)
                        + grid(kindModel('item', '物品模型')),
                    cg: imageFields.autoInterludeField
                        + `<div class="igs-settings-sub" data-image-feature="interlude"${imageFields.autoInterludeHidden}>${grid(imageFields.autoInterludeProbabilityField, imageFields.autoInterludeMaxField)}</div>`
                        + grid(kindModel('cg', '剧情CG模型'))
                        + `<div class="igs-settings-sub" data-image-feature="backfill"${hiddenAttr(!auto.interludeEnabled && !auto.nsfwEnabled)}>${imageFields.autoBackfillField}<div class="igs-source-filter-note">翻到未出图或出图失败的旧楼层时补画，会消耗生图额度。</div></div>`,
                    nsfw: imageFields.autoNsfwField
                        + `<div class="igs-settings-sub" data-image-feature="nsfw"${imageFields.autoNsfwHidden}>${grid(imageFields.autoNsfwCountField)}</div>`,
                },
            });
            return imageFields;
        });
        const sceneValues = memo(() => {
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
            const { presets: presetMap, layersOf: presetCardLayers } = readLegacyPresetsView(storage);
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
            const presetOpen = advancedOpen('asset-presets');
            const presetSection = `<details class="igs-asset-presets" data-advanced="asset-presets"${presetOpen}><summary class="igs-asset-presets-summary">预设</summary>`
                + `<div class="igs-asset-presets-body">${presetNames.map(presetRow).join('') || '<div class="igs-asset-presets-empty">暂无预设</div>'}`
                + '<div class="igs-asset-presets-tools"><button type="button" class="igs-settings-action" data-action="preset-save">存为预设</button><button type="button" class="igs-settings-action" data-action="preset-import">导入预设</button></div></div></details>';
            const assetScopeBar = `<div class="igs-asset-scope-bar"><span class="igs-asset-scope-name">${cardKey ? `当前角色卡：${esc(scopeState.assetScopeLabel)}` : '未打开角色卡，素材均存放在全局'}</span>`
                + (scopeState.assetScopeKind === 'card' && cardKey ? '<button type="button" class="igs-settings-action" data-action="asset-card-export">导出素材</button>' : '')
                + '<button type="button" class="igs-settings-action" data-action="asset-card-import">导入素材</button></div>'
                + presetSection;
            const disabled = !sceneAssets.enabled;
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
                    + `<div class="igs-add-menu-list" role="menu">${bulkItem('global', `本卡的${counts.card}个全放全局`, counts.card)}${bulkItem('card', `全局的${counts.global}个全收本卡`, counts.global)}</div></details>`;
                return `<span class="igs-asset-filter-group" role="group" aria-label="按归属筛选" data-asset-filter="${collection}">${chip('all', '全部')}${chip('card', '本卡')}${chip('global', '全局')}</span>${bulk}`;
            };
            const assetSelect = (kind) => (asyncState.assetSelect && asyncState.assetSelect.kind === kind ? asyncState.assetSelect.names : null);
            const scenesHtml = () => renderAssetFolderView('scenes', scopedEntries('scenes'), {
                state: assetFolders,
                select: assetSelect('scenes'),
                lead: scopeFilterBar('scenes'),
                renderList: (subset) => renderSceneAssetList(subset, sceneListOptions),
                rawOf: (name, value) => (typeof value === 'string' ? value : (value && value.url) || ''),
                thumbOf: (name, value) => resolveGenerated(typeof value === 'string' ? value : firstUrl([value && value.url].concat(Object.values((value && value.times) || {}).map((t) => (typeof t === 'string' ? t : t && t.url))))),
            });
            const charListOptions = {
                imageSourceMode: bridge.imageApi?.mode || 'extension',
                live2dConfig: readLive2dConfig(storage, cardKey),
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
                isOpen: isOpenKey,
            };
            const charsHtml = () => renderAssetFolderView('characters', scopedEntries('characters'), {
                state: assetFolders,
                select: assetSelect('characters'),
                lead: scopeFilterBar('characters'),
                renderList: (subset) => renderCharacterAssetList(subset, charListOptions),
                thumbOf: (name, moods) => {
                    const selected = readDefaultOutfit(sceneAssets, name);
                    const sprite = selected.ok && pickOutfitSprite(selected.entry, '平和', sceneAssets);
                    return resolveGenerated(sprite?.url || firstUrl(Object.values(moods || {}).concat([(sceneAssets.statusAvatars || {})[name]])));
                },
            });
            const generatedArgs = {
                library: normalizeGeneratedLibrary(sceneAssets.generated),
                characters: sceneAssets.characters || {},
                scenes: sceneAssets.scenes || {},
                temp: !idx && generatedService && typeof generatedService.listTemp === 'function' ? generatedService.listTemp() : [],
                resolveUrl: resolveGenerated,
                moodGroups: sceneAssets.moodGroups || [],
                tempPage: !idx && generatedService?.tempPage ? generatedService.tempPage() : null,
                readError: asyncState.genRecordsError || options.itemImages?.metadataStatus?.().error || '',
            };
            // 待确认：角色页放 AI 写出但没登记的服装词、词库外的情绪词；场景页放生成了还没入库的图。索引模式不读。
            const reviewData = memo(() => {
                // 没有待确认词时不必建解析器，也不会有写回。
                let outfitReview = [];
                if (loadOutfitReview(storage).length) {
                    const resolveOutfit = createOutfitResolver(sceneAssets);
                    outfitReview = dropConfirmedOutfitReview(storage, (character, word) => Boolean(resolveOutfit(character, word)));
                }
                const moodReview = loadMoodReview(storage);
                return { outfitReview, moodReview, waitingCount: outfitReview.length + moodReview.length };
            });
            const waitingCount = () => (idx ? 0 : reviewData().waitingCount);
            const generatedCount = memo(() => (idx ? 0 : countGeneratedWaiting(generatedArgs)));
            const reviewPane = () => {
                const { outfitReview, moodReview } = reviewData();
                return `<div class="igs-settings-section igs-review-pane">`
                    + renderOutfitReviewList(outfitReview, sceneAssets.characterOutfits || {}, sceneAssets.characters || {})
                    + renderMoodReviewList(moodReview, sceneAssets.moodGroups, { busy: Boolean(asyncState.moodReviewClassifying) })
                    + `</div>`;
            };
            const generatedPane = () => `<div class="igs-settings-section igs-review-pane">${renderGeneratedAssetPane(generatedArgs)}</div>`;
            // 多选与打包下载、＋并排放在区块标题右侧；进入多选后同一个按钮变成「完成」，取消、全选在列表上方的选择条里。
            const selectLink = (kind, count) => (count ? `<button type="button" class="igs-settings-action igs-asset-select-toggle${assetSelect(kind) ? ' is-on' : ''}" data-action="asset-select:${kind}" aria-pressed="${Boolean(assetSelect(kind))}">${assetSelect(kind) ? '完成' : '多选'}</button>` : '');
            const scenesPane = () => `<div class="igs-settings-section">
        <div class="igs-settings-section-head">
          <div class="igs-settings-subhead">背景场景</div>
          ${idx ? '' : selectLink('scenes', Object.keys(scopedEntries('scenes')).length)}
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
        <div class="igs-source-filter-note">只用名称或别名精确匹配的背景，缺失则补画。</div>
        ${idx ? '' : scenesHtml()}
      </div>`;
            const spriteEnhance = sceneAssets.spriteEnhance || {};
            const spriteGenderScale = normalizeSpriteGenderScale(reader.spriteGenderScale);
            // 立绘显示与情绪匹配是整区设置：单独一张折叠卡放在角色列表上面，不再压在「角色立绘」标题下。
            const charactersSettingsCard = `<div class="igs-source-filter igs-perf-group"><details data-advanced="sprite-display"${advancedOpen('sprite-display')}><summary><b>立绘设置</b><span class="igs-perf-brief">缩放 · 高度 · 增强 · 名字/情绪匹配</span></summary><div class="igs-perf-group-body">
        ${checkbox('bridge.sceneAssets.moodFuzzyMatch', sceneAssets.moodFuzzyMatch, '情绪词模糊匹配')}
        ${checkbox('bridge.sceneAssets.nameFallback', sceneAssets.nameFallback !== false, '名字兜底匹配')}
        <div class="igs-source-filter-note">如「小雨」可匹配「林小雨」。</div>
        ${checkbox('bridge.sceneAssets.narrationNameSwitch', sceneAssets.narrationNameSwitch !== false, '旁白点名切换立绘')}
        ${field('bridge.sceneAssets.sceneCarryMode', '换场景立绘', selectInput('bridge.sceneAssets.sceneCarryMode', sceneAssets.sceneCarryMode || 'smart', [['strict', '严格'], ['smart', '智能'], ['loose', '宽松']]))}
        <div class="igs-source-filter-note">严格：须写明同行；智能：依正文判断；宽松：除非写明分开，否则保留。</div>
        ${checkbox('bridge.sceneAssets.unifiedSpriteLayout', sceneAssets.unifiedSpriteLayout, '统一角色立绘位置')}
        ${checkbox('bridge.sceneAssets.spriteEnhance.enabled', spriteEnhance.enabled === true, '立绘增强（手机较耗电）')}
        ${checkbox('readerSettings.spriteGenderScale.enabled', spriteGenderScale.enabled, '按性别区分默认高度')}
        <div class="igs-source-filter-grid">
          ${field('readerSettings.spriteDisplayScale', '立绘全局缩放 %', numberInput('readerSettings.spriteDisplayScale', normalizeSpriteDisplayScale(reader.spriteDisplayScale)))}
          ${field('readerSettings.spriteDefaultScale', '立绘基准高度 %', numberInput('readerSettings.spriteDefaultScale', normalizeSpriteDefaultScale(reader.spriteDefaultScale)))}
          ${spriteGenderScale.enabled ? `
          ${field('readerSettings.spriteGenderScale.female', '女性默认高度 %', numberInput('readerSettings.spriteGenderScale.female', spriteGenderScale.female))}
          ${field('readerSettings.spriteGenderScale.male', '男性默认高度 %', numberInput('readerSettings.spriteGenderScale.male', spriteGenderScale.male))}
          ${field('readerSettings.spriteGenderScale.other', '其他默认高度 %', numberInput('readerSettings.spriteGenderScale.other', spriteGenderScale.other))}
          ${field('readerSettings.spriteGenderScale.elderShorter', '老人比同性别矮', numberInput('readerSettings.spriteGenderScale.elderShorter', spriteGenderScale.elderShorter))}
          ${field('readerSettings.spriteGenderScale.childShorter', '儿童比同性别矮', numberInput('readerSettings.spriteGenderScale.childShorter', spriteGenderScale.childShorter))}` : ''}
          ${spriteEnhance.enabled === true ? `
          ${field('bridge.sceneAssets.spriteEnhance.mode', '效果', selectInput('bridge.sceneAssets.spriteEnhance.mode', spriteEnhance.mode || 'outline', [['outline', '硬描边'], ['shadow', '投影式']]))}
          ${field('bridge.sceneAssets.spriteEnhance.color', '增强颜色', colorInput('bridge.sceneAssets.spriteEnhance.color', spriteEnhance.color || '#000000'))}
          ${field('bridge.sceneAssets.spriteEnhance.strength', '增强浓淡', selectInput('bridge.sceneAssets.spriteEnhance.strength', spriteEnhance.strength ?? 20, [5, 10, 15, 20, 30, 40, 50].map((n) => [n, `${n}%`])))}
          ${field('bridge.sceneAssets.spriteEnhance.size', '增强大小', selectInput('bridge.sceneAssets.spriteEnhance.size', spriteEnhance.size ?? 0.8, [0.4, 0.6, 0.8, 1, 1.2, 1.6, 2].map((n) => [n, `${n}px`])))}` : ''}
        </div>
        </div></details></div>`;
            // 非人角色整组设置：总开关关闭时其余项置灰，档案保留。
            const creatureDisplay = normalizeCreatureDisplaySettings(reader.creatureDisplay);
            const creatureAutoOn = normalizeAutoIllustrationSettings(bridge.autoIllustration).assets.creatureAutoProfile;
            const creatureOff = !creatureDisplay.enabled;
            const creatureScaleField = (key, label) => field(`readerSettings.creatureDisplay.${key}`, label, numberInput(`readerSettings.creatureDisplay.${key}`, creatureDisplay[key], CREATURE_DISPLAY_RANGE.min, CREATURE_DISPLAY_RANGE.max, creatureOff));
            const creatureSettingsCard = `<div class="igs-source-filter igs-perf-group"><details data-advanced="creature-system"${advancedOpen('creature-system')}><summary><b>非人角色</b><span class="igs-perf-brief">体型缩放 · 巨型 · 自动建档</span></summary><div class="igs-perf-group-body">
        ${checkbox('readerSettings.creatureDisplay.enabled', creatureDisplay.enabled, '启用非人角色')}
        ${checkbox('bridge.autoIllustration.assets.creatureAutoProfile', creatureAutoOn, '战斗对手自动建档', creatureOff)}
        ${checkbox('readerSettings.creatureDisplay.giantFill', creatureDisplay.giantFill, '巨型铺满舞台', creatureOff)}
        <div class="igs-source-filter-grid">
          ${creatureScaleField('small', '小型缩放 %')}
          ${creatureScaleField('medium', '中型缩放 %')}
          ${creatureScaleField('large', '大型缩放 %')}
        </div>
        <div class="igs-settings-row"><button type="button" class="igs-settings-action" data-page="kinds">非人画师串（画师与模型页）</button></div>
        </div></details></div>`;
            const charactersPane = () => `<div class="igs-settings-section">
        <div class="igs-settings-section-head">
          <div class="igs-settings-subhead">角色立绘</div>
          ${idx ? '' : selectLink('characters', Object.keys(scopedEntries('characters')).length)}
          <button type="button" class="igs-settings-action igs-asset-zip" data-action="asset-zip:characters">打包下载</button>
          ${CHARACTER_ADD_MENU}
        </div>
        ${isOpenKey('live2d-library') ? `<details class="igs-settings-sub igs-settings-advanced" data-advanced="live2d-library" open><summary>Live2D模型（高级）</summary>${renderLive2dLibrary(readLive2dConfig(storage, cardKey), scopeState.assetScopeLabel || '未选卡范围')}</details>` : ''}
        ${renderDnaCandidateBar(asyncState.dnaCandidate)}
        ${idx ? '' : renderMigrateEntry(asyncState.migrateRows)}
        ${idx ? '' : charsHtml()}
        ${idx ? '' : renderDnaOnlyCharacterList(sceneAssets.characterDna || {}, sceneAssets.characters || {})}
      </div>`;
            const promptRuleDraft = typeof asyncState.promptRuleDraft === 'string'
                ? asyncState.promptRuleDraft
                : String(sceneAssets.promptRule || '');
            const promptRuleOn = sceneAssets.promptRuleEnabled !== false;
            const sceneValues0 = {
                promptRuleTag: promptRuleOn ? '发给聊天模型' : '已关闭',
                promptRuleToggle: checkbox('bridge.sceneAssets.promptRuleEnabled', promptRuleOn, '自动注入格式规则'),
                promptRuleHint: `<div class="igs-source-filter-note" data-result="prompt-rule-preset">${esc(promptRuleOn ? PROMPT_RULE_PRESET_HINT : PROMPT_RULE_OFF_HINT)}</div>`,
                promptRuleField: `<div class="igs-settings-field"><textarea data-prompt-rule-draft="1" aria-label="AI格式规则" placeholder="格式规则..."${disabled ? ' disabled' : ''}>${esc(promptRuleDraft)}</textarea></div>`,
                advancedPromptRuleOpen: isOpenKey('prompt-rule-edit') ? ' open' : '',
                promptRuleStatus: esc(asyncState.promptRuleStatus || ''),
                promptRuleOutfitHint: scenePromptRuleOutfitHint(promptRuleDraft)
                    ? `<div class="igs-source-filter-note" data-result="prompt-rule-outfit">${esc(scenePromptRuleOutfitHint(promptRuleDraft))}</div>` : '',
                promptPlacementField: field('bridge.sceneAssets.promptPlacement', '注入位置', selectInput('bridge.sceneAssets.promptPlacement', normalizePromptPlacement(sceneAssets.promptPlacement), [['system', '系统说明区'], ['depth0', '聊天末尾']]),
                    '如AI未按标签输出，可改回聊天末尾。每条演出写法可单独指定位置。'),
                // 按需注入（promptAdaptive）不再公开：配置键与已存值保留，默认仍为开。
                promptAdvanced: renderPromptEntryFields(sceneAssets, { reader: draft.readerSettings, report: getLastPromptReport(), isOpen: isOpenKey }),
                get wardrobeSelectToggle() { return idx ? '' : selectLink('wardrobe', Object.keys(scopedEntries('wardrobe')).filter((name) => !isBuiltinNudeOutfit(name)).length); },
                get wardrobeSection() { return checkbox('bridge.sceneAssets.wardrobeAutoFlow', sceneAssets.wardrobeAutoFlow !== false, '自动流程（新建后自动写提示词、生成参考图）')
                    + (idx ? '' : renderWardrobe(scopedEntries('wardrobe'), { sceneAssets, resolveUrl: resolveGenerated, scopeTag, focus: asyncState.wardrobeFocus || '', lead: scopeFilterBar('wardrobe'), select: assetSelect('wardrobe') })); },
                get eventCgSection() { return idx ? '' : renderEventCgList(scopedEntries('eventCgs'), { resolveUrl: resolveGenerated, scopeTag }); },
                get moodSection() { return checkbox('bridge.sceneAssets.moodAutoClassify', sceneAssets.moodAutoClassify === true, '自动归类（用备用模型）')
                    + (asyncState.moodAutoStatus ? `<div class="igs-source-filter-note" data-mood-auto-status>${esc(asyncState.moodAutoStatus)}</div>` : '')
                    + (idx ? '' : renderMoodGroupList(sceneAssets.moodGroups, { isOpen: isOpenKey }))
                    + '<div class="igs-settings-row"><button class="igs-settings-action" data-action="mood-apply-preset" type="button">套用预设</button><button class="igs-settings-action" data-action="reset-mood-groups" type="button">恢复默认</button>'
                    + `<button class="igs-settings-action" data-action="mood-ai-reclassify" type="button" title="用备用模型把已有的词重新归组，并剔除动作、神态等不是情绪的词"${asyncState.moodReclassifying ? ' disabled' : ''}>${asyncState.moodReclassifying ? '整理中…' : '整理词库'}</button></div>`; },
            };
            const assetPane = (html) => `<div class="igs-settings-grid" data-scene-settings-pane="assets"><div class="igs-source-filter">${html}</div></div>`;
            return {
                values: sceneValues0,
                waitingCount,
                generatedCount,
                head: {
                    sceneToggle: checkbox('bridge.sceneAssets.enabled', sceneAssets.enabled, '启用场景素材模式'),
                    sceneHidden: hiddenAttr(disabled),
                    assetScopeBar,
                },
                panes: {
                    chars: () => `<div class="igs-settings-grid" data-scene-settings-pane="assets">${charactersSettingsCard}${creatureSettingsCard}<div class="igs-source-filter">${charactersPane()}</div></div>`,
                    scenes: () => assetPane(scenesPane()),
                    // 索引模式不读待确认（会清掉已确认的记录、读生成素材），页面只留外框。
                    review: () => assetPane(idx ? '' : reviewPane()),
                    sceneReview: () => assetPane(idx ? '' : generatedPane()),
                },
            };
        });
        // 阅读器打开方式：「界面 › 阅读器」和仪表盘共用这一段，同一个存储路径 bridge.openMode。
        const openModeHtml = () => `<div class="igs-segmented-field igs-key-block">${field(
            'bridge.openMode',
            '打开方式',
            segmentedInput(
                'bridge.openMode',
                bridge.openMode,
                PUBLIC_READER_MODES.map((id) => [id, getReaderModeLabel(id), getReaderModeIcon(id)]),
                '打开方式',
            ),
        )}</div>${bridge.openMode === 'embedded' ? field('readerSettings.embeddedHeight', '内嵌高度', selectInput('readerSettings.embeddedHeight', reader.embeddedHeight ?? 1, [[0.8, '矮'], [1, '标准'], [1.25, '高'], [1.5, '更高']])) : ''}`;
        const getReaderValues = memo(() => {
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
        // 字体下拉 = 内置字体 + 用户上传的字体；上传的字体先注册进页面，下拉里选中即可预览。
        const hostGlobal = options.global || globalThis;
        const customFonts = loadCustomFonts(hostGlobal);
        if (customFonts.length) registerCustomFonts(hostGlobal.document, customFonts);
        const fontOptions = fontOptionsWith(DIALOG_FONT_OPTIONS, customFonts);
        const values = {
            fontOptions,
            get customFontManager() { return renderCustomFontManager(customFonts, asyncState.customFontMessage || ''); },
            get shortcutsField() { return renderShortcutSettings(reader.shortcuts, hostGlobal, asyncState); },
            ...sectionResetPlaceholders(),
            get openModeField() { return openModeHtml(); },
            get settingsToggles() { return checkbox('bridge.showToasts', bridge.showToasts, '显示提示弹窗'); },
            get fontSizeField() { return field('readerSettings.fontSize', '字体大小', selectInput('readerSettings.fontSize', reader.fontSize, [12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30].map((n) => [n, `${n}px`]))); },
            get dialogFontWeightField() { return field('readerSettings.dialogFontWeight', '对话框字重', selectInput('readerSettings.dialogFontWeight', reader.dialogFontWeight == null ? 'null' : reader.dialogFontWeight, [['null', '跟随当前样式'], [300, '细体'], [400, '常规'], [500, '中等'], [700, '粗体']])); },
            // 文字增强是开关（借分段点击写值：开=硬描边，关=off），开了才出现种类和三个参数。
            get dialogTextEffectToggle() { return `<button type="button" class="igs-switch${reader.dialogTextEffect !== 'off' ? ' is-on' : ''}" data-segment-path="readerSettings.dialogTextEffect" data-segment-value="${reader.dialogTextEffect !== 'off' ? 'off' : 'outline'}" aria-pressed="${reader.dialogTextEffect !== 'off' ? 'true' : 'false'}"><i></i><span>文字增强</span></button>`; },
            get dialogTextEffectOptions() { return reader.dialogTextEffect === 'off' ? '' : `<div class="igs-source-filter-grid">${field('readerSettings.dialogTextEffect', '增强种类', segmentedInput('readerSettings.dialogTextEffect', reader.dialogTextEffect, [['outline', '硬描边'], ['shadow', '投影式']], '增强种类'))}<div class="igs-reader-text-effect-options">${field('readerSettings.dialogTextEffectColor', '增强颜色', colorInput('readerSettings.dialogTextEffectColor', reader.dialogTextEffectColor))}${field('readerSettings.dialogTextEffectStrength', '增强浓淡', selectInput('readerSettings.dialogTextEffectStrength', reader.dialogTextEffectStrength, [5, 10, 15, 20, 30, 40, 50].map((n) => [n, `${n}%`])))}${field('readerSettings.dialogTextEffectSize', '增强大小', selectInput('readerSettings.dialogTextEffectSize', reader.dialogTextEffectSize, [0.4, 0.6, 0.8, 1, 1.2, 1.6, 2].map((n) => [n, `${n}px`])))}</div></div>`; },
            get dialogSkinField() { return field('readerSettings.dialogSkin', '对话框风格', selectInput('readerSettings.dialogSkin', reader.dialogSkin, getDialogSkinChoices(reader.dialogSkin)))
                + (asyncState.assetScopeKey && worldviewAssets && typeof worldviewAssets.dialogSkin === 'string' && worldviewAssets.dialogSkin
                    ? `<div class="igs-source-filter-note igs-card-skin-note">当前角色卡在主界面选定了「${esc(dialogSkinLabel(worldviewAssets.dialogSkin))}」，阅读这张卡时以此为准，上方选项仅对其他角色卡生效。<button type="button" class="igs-settings-action" data-action="card-dialog-skin-clear">跟随上方</button></div>`
                    : ''); },
            get gradientVeilFields() { return gradientVeilDialog ? '<div class="igs-gradient-veil-settings">' + field('readerSettings.gradientVeil.color', '黑幕颜色', colorInput('readerSettings.gradientVeil.color', reader.gradientVeil.color)) + field('readerSettings.gradientVeil.heightPercent', '渐变高度', selectInput('readerSettings.gradientVeil.heightPercent', reader.gradientVeil.heightPercent, [30, 40, 50, 60, 70].map((n) => [n, `${n}%`]))) + field('readerSettings.gradientVeil.opacity', '最大不透明度', selectInput('readerSettings.gradientVeil.opacity', reader.gradientVeil.opacity, [.4, .55, .7, .85, 1].map((n) => [n, `${Math.round(n * 100)}%`]))) + field('readerSettings.gradientVeil.speakerStyle', '姓名样式', selectInput('readerSettings.gradientVeil.speakerStyle', reader.gradientVeil.speakerStyle, [['default', '默认风格'], ['plain-text', '纯文字']])) + '</div>' : ''; },
            get magicHouseField() { return reader.dialogSkin === DIALOG_SKIN_XIANXIA_INK ? field('readerSettings.xianxiaSpeaker', '姓名排布', selectInput('readerSettings.xianxiaSpeaker', reader.xianxiaSpeaker === 'center' ? 'center' : 'left', [['left', '左侧落款'], ['center', '居中（名字+剑气下划线）']])) : reader.dialogSkin === DIALOG_SKIN_MAGIC_ACADEMY ? field('readerSettings.magicHouse', resolveWorldview(bridge.sceneAssets) === 'magic' ? '学院配色' : '配色', selectInput('readerSettings.magicHouse', normalizeMagicHouse(reader.magicHouse), MAGIC_HOUSES.map((house) => [house.id, house.label]))) + (MAGIC_HOUSES.find((house) => house.id === normalizeMagicHouse(reader.magicHouse)).custom ? field('readerSettings.magicAccent', '装饰颜色', colorInput('readerSettings.magicAccent', normalizeMagicAccent(reader.magicAccent))) : '') : reader.dialogSkin === DIALOG_SKIN_HORROR_GORE || reader.dialogSkin === DIALOG_SKIN_HORROR_PSYCH ? field('readerSettings.horrorDreadCap', '恐怖强度上限', selectInput('readerSettings.horrorDreadCap', normalizeHorrorDreadCap(reader.horrorDreadCap), HORROR_DREAD_LEVELS.map((n) => [n, HORROR_DREAD_CAP_LABELS[n]]))) : ''; },
            get classicDialogWidthPercentField() { return classicDialog ? field('readerSettings.classicDialogWidthPercent', '电脑端宽度', selectInput('readerSettings.classicDialogWidthPercent', reader.classicDialogWidthPercent, [60, 70, 80, 90, 100].map((n) => [n, `${n}%`]))) : ''; },
            // 「自适应」是 dialogAutoHeight 的入口（字少变矮），选它时高度比例保持不变；选具体比例即关掉自适应。
            get skinDialogScaleField() { return classicDialog || illustratedDialog ? field('readerSettings.skinDialogScale', '对话框高度', selectInput('readerSettings.skinDialogScale', reader.dialogAutoHeight === true && supportsDialogAutoHeight(reader.dialogSkin) ? 'auto' : reader.skinDialogScale, SKIN_DIALOG_SCALE_OPTIONS.map((n) => [n, n === 1 ? '原尺寸' : `${Math.round(n * 100)}%`]).concat(supportsDialogAutoHeight(reader.dialogSkin) ? [['auto', '自适应']] : []))) : ''; },
            get dialogAutoHeightField() { return !classicDialog && !illustratedDialog && supportsDialogAutoHeight(reader.dialogSkin) ? field('readerSettings.skinDialogScale', '高度方式', selectInput('readerSettings.skinDialogScale', reader.dialogAutoHeight === true ? 'auto' : 'fixed', [['fixed', '固定'], ['auto', '自适应']])) : ''; },
            get optionFontSizeField() { return field('readerSettings.optionFontSize', '选项字体大小', selectInput('readerSettings.optionFontSize', reader.optionFontSize, [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24].map((n) => [n, `${n}px`]))); },
            get dialogWidthField() { return field('readerSettings.dialogWidth', '对话框宽度', selectInput('readerSettings.dialogWidth', reader.dialogWidth === null ? 'null' : reader.dialogWidth, [['null', '自动'], [200, '200px'], [280, '280px'], [360, '360px'], [440, '440px'], [520, '520px'], [600, '600px'], [680, '680px'], [760, '760px'], [840, '840px'], [920, '920px'], [1000, '1000px'], [1080, '1080px'], [1160, '1160px'], [1280, '1280px']], classicDialog || illustratedDialog)); },
            // 经典/异型对话框的高度只由 skinDialogScale 控制，不再并列一个禁用的像素高度选项。
            get dialogHeightField() { return classicDialog || illustratedDialog ? '' : field('readerSettings.dialogHeight', '对话框高度', selectInput('readerSettings.dialogHeight', reader.dialogHeight === null ? 'null' : reader.dialogHeight, dialogHeightItems)); },
            get glassOpacityField() { return field('readerSettings.glassOpacity', '面板透明度', selectInput('readerSettings.glassOpacity', reader.glassOpacity, [0, .1, .2, .35, .5, .62, .74, .88, 1].map((n) => [n, `${Math.round(n * 100)}%`]))); },
            get inputScaleField() { return field('readerSettings.inputScale', '输入框高度', selectInput('readerSettings.inputScale', reader.inputScale, [20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map((n) => [n, `${n}%`]))); },
            get toolbarScaleField() { return field('readerSettings.toolbarScale', '工具栏大小', selectInput('readerSettings.toolbarScale', reader.toolbarScale, [20, 40, 60, 80, 100, 120, 140, 160, 180, 200].map((n) => [n, `${n}%`]))); },
            get inputPlacementField() { return field('readerSettings.inputPlacement', '输入框位置', selectInput('readerSettings.inputPlacement', reader.inputPlacement === 'float' ? 'float' : 'dialog', [['dialog', '在对话框里'], ['float', '悬浮上方']])); },
            get toolbarDockField() { return field('readerSettings.toolbarDock', '工具栏位置', selectInput('readerSettings.toolbarDock', reader.toolbarDock || 'top', [['float', '紧贴对话框'], ['top', '顶部固定']])); },
            get resumePromptField() { return field('readerSettings.resumePrompt', '续读提示', selectInput('readerSettings.resumePrompt', reader.resumePrompt === 'simple' ? 'simple' : 'title', [['title', '主界面样式'], ['simple', '简易弹窗']])); },
            get toolbarSplitField() { return field('readerSettings.toolbarSplit', '按钮分布', selectInput('readerSettings.toolbarSplit', reader.toolbarSplit || 'split', [['split', '顶栏+对话框下'], ['top', '全在顶栏'], ['dialog', '全在对话框下']])); },
            get toolbarPlateField() { return field('readerSettings.toolbarPlate', '工具栏底板', selectInput('readerSettings.toolbarPlate', reader.toolbarPlate || 'off', [['blur', '模糊（毛玻璃）'], ['solid', '清晰（实色）'], ['off', '关闭（无底板）']])); },
            get dialogBarAlignField() { return reader.toolbarSplit === 'top' ? '' : field('readerSettings.dialogBarAlign', '对话框下按钮位置', selectInput('readerSettings.dialogBarAlign', reader.dialogBarAlign || 'auto', [['auto', '自动'], ['left', '靠左'], ['center', '居中'], ['right', '靠右']])); },
            get imgModeField() { return field('readerSettings.imgMode', '图像显示模式', selectInput('readerSettings.imgMode', reader.imgMode, [['adaptive', '自适应'], ['contain', '完整']])); },
            get imgBrightnessField() { return field('readerSettings.imgBrightness', '图片亮度', selectInput('readerSettings.imgBrightness', reader.imgBrightness, [50, 60, 70, 80, 88, 90, 100].map((n) => [n, `${n}%`]))); },
            get statusLineToggle() { return checkbox('readerSettings.showStatusLine', reader.showStatusLine, '显示页码（对话框内显示本楼页码，如1/33）') + checkbox('readerSettings.dblclickCgOnly', reader.dblclickCgOnly, '隐藏对话框（右键 / 三击画面）') + checkbox('readerSettings.titleScreen', reader.titleScreen, '开场先显示主界面') + checkbox('readerSettings.underwaterSkin', reader.underwaterSkin !== false, '水下场景自动用人鱼风格')
                + (reader.underwaterSkin !== false || reader.dialogSkin === DIALOG_SKIN_MERMAID ? field('readerSettings.mermaidTone', '人鱼风格配色', selectInput('readerSettings.mermaidTone', normalizeMermaidTone(reader.mermaidTone), MERMAID_TONES.map((tone) => [tone.id, tone.label])))
                    + (normalizeMermaidTone(reader.mermaidTone) === 'custom' ? field('readerSettings.mermaidAccent', '珠光颜色', colorInput('readerSettings.mermaidAccent', normalizeMermaidAccent(reader.mermaidAccent))) : '') : '')
               ; },
            get cinemaBarsToggle() { return checkbox('readerSettings.cinemaBars', reader.cinemaBars, '电影黑边'); },
            get backdropFilterToggle() { return checkbox('readerSettings.glassBackdropFilter', reader.glassBackdropFilter, '毛玻璃模糊'); },
            // 透明度作用于工具栏、选项、地图等弹出面板；对话框只有默认皮肤跟随，其余皮肤自带底色。
            get glassScopeNote() { return dialogBgEditable ? '工具栏、选项、地图等弹出面板，对话框也跟着变' : '工具栏、选项、地图等弹出面板'; },
            get advancedDialogGlassOpen() { return advancedOpen('dialog-glass'); },
            get typewriterToggle() { return checkbox('readerSettings.typewriter.enabled', typewriter.enabled, '打字机'); },
            get playbackSpeed() { return field('readerSettings.typewriter.speed', '播放速度', segmentedInput('readerSettings.typewriter.speed', typewriter.speed, [['fast', '快'], ['medium', '中'], ['slow', '慢']], '播放速度'), '自动播放与打字机共用'); },
            get typewriterControls() { return typewriter.enabled ? [
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
            ].join('') : ''; },
            get voiceBarkToggle() { return checkbox('readerSettings.voiceBark.enabled', voiceBark.enabled && !tts.enabled, '角色语气音'); },
            // 台词开头按情绪播一声「啊、嗯、哼」；每个角色的声线在 角色 › 角色设定 里选，默认按 DNA 性别自动分配。
            get voiceBarkControls() { return voiceBark.enabled && !tts.enabled ? [
                field('readerSettings.voiceBark.frequency', '播放时机', segmentedInput('readerSettings.voiceBark.frequency', voiceBark.frequency, VOICE_BARK_FREQUENCIES, '播放时机')),
                field('readerSettings.voiceBark.volume', '音量', rangeInput('readerSettings.voiceBark.volume', voiceBark.volume, '语气音音量')),
                `<div class="igs-source-filter-note">声线可在「角色 › 角色设定」中选择；未选择时按DNA中的性别分配。</div>`,
            ].join('') : ''; },
            get ttsToggle() { return checkbox('readerSettings.tts.enabled', tts.enabled, '台词朗读（TTS）'); },
            get ttsControls() { return tts.enabled ? renderTtsControls(tts, { bilingual: normalizeBilingualSettings(reader.bilingual).enabled, voicesMessage: asyncState.ttsVoicesMessage || '', narratorVoicesMessage: asyncState.ttsNarratorVoicesMessage || '', batches: asyncState.ttsBatch || {}, assets: draftEffectiveAssets(state.activeSettings), previewError: asyncState.ttsPreviewError || '', narratorPreviewError: asyncState.ttsNarratorPreviewError || '', advancedOpen: isOpenKey('tts-advanced') }) : ''; },
            get stageShakeToggle() { return checkbox('readerSettings.stageShake.enabled', stageShake.enabled, '画面震动'); },
            get stageShakeSettings() { return stageShake.enabled ? renderStageShakeSettings(stageShake) : ''; },
            get systemRoleFields() { return renderSystemRoleSettings(systemRole, {
                fontOptions,
                narrationColor: toHex(displayTheme.narrationColor || '#f4f4f6'),
                disabled: themeDisabled,
            }); },
            get systemRoleAdvanced() { return renderSystemRoleAdvanced(systemRole, { open: isOpenKey('system-role'), hidden: hiddenAttr(themeDisabled) }); },
            get chatShowToggle() { return checkbox('readerSettings.chatShow.enabled', chatShow.enabled, '线上交流'); },
            get chatShowSettings() { return chatShow.enabled ? renderChatShowSettings(chatShow, {
                promptDraft: asyncState.chatPromptDraft,
                promptStatus: asyncState.chatPromptStatus,
            }) : ''; },
            get weatherFxToggle() { return checkbox('readerSettings.weatherFx.enabled', weatherFx.enabled, '天气'); },
            get weatherFxSettings() { return weatherFx.enabled ? renderWeatherFxSettings(weatherFx) : ''; },
            get narrationFilterToggle() { return checkbox('readerSettings.statusHud.dimSpriteOnNarration', reader.statusHud && reader.statusHud.dimSpriteOnNarration !== false, '旁白时压暗立绘'); },
            get cgHoldField() { return field('readerSettings.cgHoldPages', '日常CG停留', selectInput('readerSettings.cgHoldPages', reader.cgHoldPages || 4, [[2, '2页'], [3, '3页'], [4, '4页'], [6, '6页'], [8, '8页']]), 'NSFW插图保持到下一张'); },
            get sentencePagingToggle() { return checkbox('bridge.sentencePaging', Boolean(bridge.sentencePaging), '旁白按句号分页'); },
            get dialogueSentencePagingToggle() { return checkbox('bridge.dialogueSentencePaging', Boolean(bridge.dialogueSentencePaging), '对白／心理话也按句分页'); },
            get nsfwSpriteModeField() { return `<div class="igs-settings-field">${segmentedInput('readerSettings.statusHud.nsfwSpriteMode', statusHud.nsfwSpriteMode, [['show', '显示立绘'], ['hide', '隐藏立绘'], ['shade', '仅露脸剪影']], 'NSFW场景立绘')}<em>使用剪影前，请先在立绘编辑中标定头部</em></div>`; },
            get nsfwVeilLevelField() { return field('readerSettings.statusHud.nsfwVeilLevel', '黑幕强度', segmentedInput('readerSettings.statusHud.nsfwVeilLevel', (reader.statusHud && reader.statusHud.nsfwVeilLevel) || 'medium', [['light', '弱'], ['medium', '中'], ['strong', '强']], '黑幕强度')); },
            get nsfwCgPortraitToggle() { return checkbox('readerSettings.statusHud.nsfwCgPortrait', statusHud.nsfwCgPortrait, 'CG时对话框旁显示裸体头像（需衣柜里有引用「裸体」的服装）'); },
            get nsfwCgPortraitControls() { return statusHud.nsfwCgPortrait
                ? '<div class="igs-settings-field"><em>位置和大小在阅读器里调：挂着头像时点工具栏「调整立绘」，拖动、双指捏合或滚轮缩放后保存</em></div>'
                : ''; },
            get statusHudSection() { return buildStatusHudSettingsHtml(reader, options); },
            get optionBubbleToggle() { return checkbox('bridge.optionBubble.enabled', Boolean(bridge.optionBubble && bridge.optionBubble.enabled), '启用选项气泡'); },
            get optionBubbleHidden() { return hiddenAttr(!(bridge.optionBubble && bridge.optionBubble.enabled)); },
            get optionBubblePositionField() { return field('bridge.optionBubble.position', '气泡位置', segmentedInput('bridge.optionBubble.position', (bridge.optionBubble && bridge.optionBubble.position) || 'top-left', [['top-left', '左上角'], ['top-center', '正上方居中'], ['top-right', '右上角']], '气泡位置')); },
            get optionBubbleActionField() { return field('bridge.optionBubble.clickAction', '点击选项', segmentedInput('bridge.optionBubble.clickAction', (bridge.optionBubble && bridge.optionBubble.clickAction) || 'send', [['send', '自动发送'], ['fill', '填入输入框']], '点击行为')); },
            get optionSourcesField() { return `<div class="igs-settings-group igs-switch-stack">${checkbox('bridge.optionBubble.itemButton', !(bridge.optionBubble && bridge.optionBubble.itemButton === false), '显示使用物品按钮')}${checkbox('bridge.optionBubble.bodyFallback', !(bridge.optionBubble && bridge.optionBubble.bodyFallback === false), '没有选项表时读取正文末尾选项')}</div><div class="igs-settings-group igs-option-fixed">${field('bridge.optionBubble.quickActions', '固定选项', textareaInput('bridge.optionBubble.quickActions', (bridge.optionBubble && bridge.optionBubble.quickActions) || '', '观察四周\n离开这里'), '每行一条，最多 8 条，每回合附在选项气泡末尾；点击后作为行动发送')}</div>`; },
            get optionBubbleWidthToggle() { return checkbox('bridge.optionBubble.widthFollowsText', Boolean(bridge.optionBubble && bridge.optionBubble.widthFollowsText), '气泡宽度随文本变化'); },
            get pinnedButtonsField() { return renderPinnedButtons(reader.pinnedBtns, reader.hiddenBtns, reader.btnOrder, reader.dialogBarBtns, reader.toolbarSplit, advancedOpen('toolbar-buttons')); },
            get themeNoteHidden() { return hiddenAttr(!themeDisabled); },
            get themeHidden() { return hiddenAttr(themeDisabled); },
            get dividerHidden() { return hiddenAttr(themeDisabled || classicDialog); },
            get dividerField() { return field(`${themePath}.dividerSymbol`, '样式', selectInput(`${themePath}.dividerSymbol`, displayTheme.dividerSymbol || 'none', [['gradient', '渐变线'], ['none', '无']], themeDisabled || classicDialog || !themeCustom)); },
            get nameFontField() { return field(`${themePath}.nameFont`, '字体', selectInput(`${themePath}.nameFont`, displayTheme.nameFont || 'inherit', fontOptions, themeDisabled || !themeCustom)); },
            get textFontField() { return field(`${themePath}.textFont`, '字体', selectInput(`${themePath}.textFont`, displayTheme.textFont || 'inherit', fontOptions, themeDisabled || !themeCustom)); },
            get thoughtFontField() { return field(`${themePath}.thoughtFont`, '字体', selectInput(`${themePath}.thoughtFont`, displayTheme.thoughtFont || 'inherit', fontOptions, themeDisabled || !themeCustom)); },
            get nameColorField() { return field(`${themePath}.nameColor`, '颜色', colorInput(`${themePath}.nameColor`, toHex(displayTheme.nameColor || '#ffeeb8'), themeDisabled || !themeCustom)); },
            get textColorField() { return field(`${themePath}.textColor`, '颜色', colorInput(`${themePath}.textColor`, toHex(displayTheme.textColor || '#f4f4f6'), themeDisabled || !themeCustom)); },
            get thoughtColorField() { return field(`${themePath}.thoughtColor`, '颜色', colorInput(`${themePath}.thoughtColor`, toHex(displayTheme.thoughtColor || '#c8c8dc'), themeDisabled || !themeCustom)); },
            get narrationFontField() { return field(`${themePath}.narrationFont`, '字体', selectInput(`${themePath}.narrationFont`, displayTheme.narrationFont || 'inherit', fontOptions, themeDisabled || !themeCustom)); },
            get narrationColorField() { return field(`${themePath}.narrationColor`, '颜色', colorInput(`${themePath}.narrationColor`, toHex(displayTheme.narrationColor || '#f4f4f6'), themeDisabled || !themeCustom)); },
            get dividerColorField() { return field(`${themePath}.dividerColor`, '颜色', colorInput(`${themePath}.dividerColor`, toHex(displayTheme.dividerColor || '#ffeeb8'), themeDisabled || classicDialog || !themeCustom)); },
            get dialogBgField() { return dialogBgEditable ? field(`${themePath}.dialogBg`, '背景色', colorInput(`${themePath}.dialogBg`, toHex(displayTheme.dialogBg || '#1f2225'), !themeCustom)) : ''; },
            get dialogBgOpacityField() { return !dialogBgEditable ? '' : field(`${themePath}.bgOpacity`, '背景不透明度', selectInput(`${themePath}.bgOpacity`, displayTheme.bgOpacity == null ? 'null' : displayTheme.bgOpacity, [['null', '跟随面板透明度'], [0, '0%'], [.1, '10%'], [.2, '20%'], [.35, '35%'], [.5, '50%'], [.62, '62%'], [.74, '74%'], [.88, '88%'], [1, '100%']], !themeCustom)); },
        };
        return values;
        });
        const performanceSections = (groupId) => renderPerformancePage(groupId, reader, perfExtras(), isOpenKey);
        // 开关与细项成对给出；细项（含 TTS 声音列表等）只在分组真正渲染到时才生成。
        const lazyPair = (head, detail) => {
            const pair = [];
            Object.defineProperty(pair, 0, { get: head, enumerable: true });
            Object.defineProperty(pair, 1, { get: detail, enumerable: true });
            return pair;
        };
        const perfExtras = () => {
            const readerValues = getReaderValues();
            return ({ worldviewId: resolveWorldview(worldviewAssets), fontOptions: readerValues.fontOptions,
                // 直播间是现代专属：非现代世界观没开随身手机时整块被拨掉，行内提示一句。
                liveBlocked: applyFxWorldview({ liveFx: { enabled: true } }, resolveWorldview(worldviewAssets), { carryPhone: Boolean(worldviewAssets && worldviewAssets.carryPhone === true) }).liveFx.enabled !== true,
                canUndo: Boolean(asyncState.perfPresetUndo),
                playbackSpeed: readerValues.playbackSpeed,
                typewriter: lazyPair(() => readerValues.typewriterToggle, () => readerValues.typewriterControls),
                // 语气音的开关、时机、音量对所有角色生效，放「声音」；每个角色的声线在 角色 › 角色设定。
                voiceBark: lazyPair(() => readerValues.voiceBarkToggle, () => readerValues.voiceBarkControls),
                voiceBarkOn: normalizeVoiceBarkSettings(reader.voiceBark).enabled && !normalizeTtsSettings(reader.tts).enabled,
                tts: lazyPair(() => readerValues.ttsToggle, () => readerValues.ttsControls),
                ttsOn: normalizeTtsSettings(reader.tts).enabled,
                stageShake: lazyPair(() => readerValues.stageShakeToggle, () => readerValues.stageShakeSettings),
                weatherFx: lazyPair(() => readerValues.weatherFxToggle, () => readerValues.weatherFxSettings),
                chatShow: lazyPair(() => readerValues.chatShowToggle, () => readerValues.chatShowSettings),
                narrationFilter: readerValues.narrationFilterToggle,
                cgHold: readerValues.cgHoldField,
                cinemaBars: readerValues.cinemaBarsToggle,
                sentencePaging: readerValues.sentencePagingToggle,
                sentencePagingOn: Boolean(bridge.sentencePaging),
                dialogueSentencePaging: readerValues.dialogueSentencePagingToggle,
                dialogueSentencePagingOn: Boolean(bridge.dialogueSentencePaging),
                nsfwSprite: readerValues.nsfwSpriteModeField,
                nsfwVeil: readerValues.nsfwVeilLevelField,
                nsfwCgPortrait: lazyPair(() => readerValues.nsfwCgPortraitToggle, () => readerValues.nsfwCgPortraitControls),
            });
        };

        // ---- 页面分派：子页条 + 页面内容；各页只调用自己要用的值构建函数 ----
        const category = categoryOfPage(page);
        const pageTabs = (badges = {}, perfCounts = null) => {
            const pages = pagesOfCategory(category);
            if (pages.length < 2) return '';
            return `<div class="igs-page-tabs" role="tablist" aria-label="${esc(categoryLabel(category))}">${pages.map(([id, label]) => {
                const badge = badges[id] ? `<span class="igs-scene-subtab-count">${esc(badges[id])}</span>` : '';
                const count = perfCounts && PAGE_PERFORMANCE_GROUPS[id] && perfCounts[PAGE_PERFORMANCE_GROUPS[id]];
                const pill = count ? `<span class="igs-page-tab-count${count.on ? ' is-on' : ''}">${count.on}/${count.total}</span>` : '';
                return `<button type="button" class="igs-page-tab${page === id ? ' is-active' : ''}" data-page="${esc(id)}" role="tab" aria-selected="${page === id ? 'true' : 'false'}">${esc(label)}${badge}${pill}</button>`;
            }).join('')}</div>`;
        };
        // 素材模式开关、当前角色卡与预设只在分类的第一个子页（角色、背景）显示；其余子页只留内容，开关关闭时同样整块隐藏。
        const sceneHead = (scene, paneHtml, first = false) => (first
            ? renderTemplate(SCENE_HEAD_TEMPLATE, { ...scene.head, scenePane: paneHtml })
            : `<div class="igs-scene-settings"><div class="igs-scene-settings-content"${scene.head.sceneHidden}><div class="igs-scene-settings-subpane">${paneHtml}</div></div>`
                + (scene.head.sceneHidden ? `<div class="igs-source-filter-note">未启用场景素材模式，可在「${esc(pageLabel(defaultPageOfCategory(categoryOfPage(page))))}」页开启。</div>` : '') + '</div>');

        if (page === 'dash') return renderDashboardPage();
        if (PAGE_PERFORMANCE_GROUPS[page]) {
            return renderPerformancePresetBar(reader, { compact: true, canUndo: Boolean(asyncState.perfPresetUndo) }) + pageTabs({}, performanceGroupCounts(reader, perfExtras())) + renderTemplate(getPageTemplate(page), { performanceSections: performanceSections(PAGE_PERFORMANCE_GROUPS[page]) });
        }
        switch (page) {
        case 'style':
        case 'text':
        case 'ui-reader':
        case 'ui-bg':
        case 'ui-option':
        case 'ui-bar':
            return pageTabs() + renderTemplate(getPageTemplate(page), getReaderValues());
        case 'chars': {
            const scene = sceneValues();
            return pageTabs({ review: scene.waitingCount() || '' }) + sceneHead(scene, scene.panes.chars(), true);
        }
        case 'review': {
            const scene = sceneValues();
            return pageTabs({ review: scene.waitingCount() || '' }) + sceneHead(scene, scene.panes.review());
        }
        case 'wardrobe': {
            const scene = sceneValues();
            return pageTabs({ review: scene.waitingCount() || '' }) + sceneHead(scene, renderTemplate(WARDROBE_TEMPLATE, scene.values));
        }
        case 'scenes': {
            const scene = sceneValues();
            return pageTabs({ 'scene-review': scene.generatedCount() || '' }) + sceneHead(scene, scene.panes.scenes(), true);
        }
        case 'cglib': {
            const scene = sceneValues();
            const eventCgFold = `<details class="igs-settings-sub igs-settings-advanced" data-advanced="event-cg"${advancedOpen('event-cg')}><summary>高级：正文触发的预置CG</summary>${renderTemplate(EVENTCG_TEMPLATE, scene.values)}</details>`;
            return pageTabs({ 'scene-review': scene.generatedCount() || '' }) + sceneHead(scene, renderTemplate(getPageTemplate(page), imageValues()) + eventCgFold);
        }
        case 'scene-review': {
            const scene = sceneValues();
            return pageTabs({ 'scene-review': scene.generatedCount() || '' }) + sceneHead(scene, scene.panes.sceneReview());
        }
        case 'rules':
            return pageTabs() + renderTemplate(getPageTemplate(page), sceneValues().values);
        case 'parse':
            return pageTabs() + renderTemplate(getPageTemplate(page), parseValues());
        case 'stats':
            return pageTabs() + renderTemplate(getPageTemplate(page), statsValues());
        case 'source':
        case 'kinds':
        case 'llm':
        case 'data':
        case 'logs':
            return pageTabs() + renderTemplate(getPageTemplate(page), imageValues());
        default:
            return renderDashboardPage();
        }

        // 仪表盘：档位条 + 分类行（右侧写现状）+ 最近改过 + 新手引导入口。
        function renderDashboardPage() {
            const assets = worldviewAssets || {};
            const sceneOn = Boolean(bridge.sceneAssets && bridge.sceneAssets.enabled);
            const counts = countEnabledPerformance(reader);
            const sources = { nai: 'IGS内置NAI', dbgen: '数据库生图插件', extension: '智绘姬', baibai: '柏宝绘' };
            const sizeOf = (value) => Object.keys(value && typeof value === 'object' ? value : {}).length;
            const status = {
                style: dialogSkinLabel(reader.dialogSkin),
                text: `${reader.fontSize}px`,
                ui: reader.toolbarDock === 'float' ? '紧贴对话框' : '顶部固定',
                perf: `开${counts.performance}项`,
                sound: `开${counts.sound}项`,
                chars: sceneOn ? `${sizeOf(assets.characters)}个角色` : '素材模式未开',
                scenes: `${sizeOf(assets.scenes)}个背景`,
                ai: sources[normalizeImageSourceMode(imageApi.mode)] || '',
                stats: normalizeStatsSettings(bridge.stats).enabled ? '已开启' : '未开启',
                data: '备份 · 日志',
            };
            const storage = (options.global || globalThis).localStorage;
            return renderDashboard({
                presetBar: renderPerformancePresetBar(reader, { home: true, canUndo: Boolean(asyncState.perfPresetUndo), extraRows: openModeHtml() + renderWorldviewRow(worldviewAssets) + renderQualityRow(reader) }),
                rows: SETTINGS_CATEGORIES.filter(([id]) => id !== 'dash').map(([id, label]) => ({ id, label, status: status[id] || '' })),
                recent: idx ? [] : loadSettingsRecent(storage),
            });
        }
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
        if (!view) return '<div class="igs-scene-empty">CG库不可用</div>';
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
        const empty = s.phase === 'ready' && !s.entries.length ? '<div class="igs-scene-empty">还没有生成过CG</div>' : '';
        return pager + line + (tiles || empty);
    }

    function buildRegexPreview(bridge) {
        const filter = normalizeSourceFilter(bridge.sourceFilter);
        const virtualRegex = normalizeVirtualRegex(bridge.virtualRegex);
        const previewMessage = resolvePreviewMessage();
        const payload = buildIgsTextPayload(previewMessage, {
            sourceFilter: filter,
            virtualRegex,
            sceneAssets: bridge.sceneAssets,
        });
        if (!payload.formattedText && !String(payload.tagText || '').trim()
            && !payload.virtualRegexChanged && !payload.virtualRegexError) {
            return '当前没有可测试的正文内容。';
        }
        return [
            `source=${payload.sourceKind}`,
            `tagTextLength=${String(payload.tagText || '').trim().length}`,
            `formattedTextLength=${payload.formattedText.length}`,
            `changed=${payload.virtualRegexChanged === true}`,
            payload.usedFallback ? 'fallback=true' : 'fallback=false',
            ...(payload.virtualRegexError ? [`error=${payload.virtualRegexError}`] : []),
            '',
            '最终正文：',
            payload.formattedText || (payload.virtualRegexError
                ? '（正文为空）' : '（正文已被当前过滤／替换规则清空）'),
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

    return { buildSettingsSnapshot, renderSettingsBody, renderPageForIndex, renderImageJobLogList, buildRegexPreview, settingsLowQuality };
}

function renderVoiceRowConfig(reader, sceneAssets) {
    const tts = normalizeTtsSettings(reader.tts);
    if (tts.enabled) return { sceneAssets, tts };
    return normalizeVoiceBarkSettings(reader.voiceBark).enabled ? { sceneAssets } : null;
}

// 台词朗读的设置：来源、旁白、音量语速，系统语音选女声 / 男声 / 旁白，接口填地址与声音名。
const TTS_FORMAT_HINTS = Object.freeze({
    openai: {
        endpoint: 'https://api.openai.com/v1 或 http://127.0.0.1:9880/v1',
        model: '如 tts-1、FunAudioLLM/CosyVoice2-0.5B',
        voice: '接口里的声音名，如 alloy',
        note: '兼容 OpenAI 的 /audio/speech 接口。SiliconFlow 的声音填 FunAudioLLM/CosyVoice2-0.5B:alex，或自己上传音色后得到的 speech:xxx。',
    },
    'gpt-sovits': {
        endpoint: 'http://127.0.0.1:9880',
        model: '',
        voice: '参考音频路径|参考文本|参考语言',
        note: '本地 GPT-SoVITS 的 api_v2 接口（地址填根地址，会请求 /tts）。声音按「参考音频路径|参考文本|参考语言」填写，后两段可省略，例：D:/GPT-SoVITS/ref/alice.wav|今天天气真好|zh。路径是 GPT-SoVITS 所在电脑上的路径。',
    },
    fish: {
        endpoint: '留空用 https://api.fish.audio',
        model: '留空用 s2.1-pro',
        voice: 'Fish Audio 的音色 ID（reference_id）',
        note: 'Fish Audio 官方接口，声音填音色库里的音色 ID，API Key 必填。模型名通过请求头 model 发送。',
    },
    minimax: {
        endpoint: '留空用 https://api.minimaxi.com',
        model: '留空用 speech-2.8-hd',
        voice: 'MiniMax 的 voice_id',
        note: 'MiniMax 同步语音合成（t2a_v2），API Key 必填。声音填 voice_id，可用下方按钮获取账号下的音色。',
    },
    custom: {
        endpoint: '',
        model: '会替换请求里的 {{model}}',
        voice: '会替换请求里的 {{voice}}',
        note: '自定义请求：请求地址、请求头、请求体里可以写 {{text}} {{voice}} {{speed}} {{lang}} {{model}} {{style}}（也可用 {{key}} 代入 API Key）。占位符写在引号里，文字会自动转义；{{speed}} 是数字。',
    },
});

// 一套接口的连接项（台词接口与旁白独立接口共用）：格式、传输、地址、Key、模型及各格式的附加项。
function renderTtsApiFields(api, apiPath) {
    const format = api.format;
    const hint = TTS_FORMAT_HINTS[format] || TTS_FORMAT_HINTS.openai;
    const parts = [
        field(apiPath('format'), '接口格式', selectInput(apiPath('format'), format, TTS_API_FORMATS)),
        field(apiPath('transport'), '传输方式', selectInput(apiPath('transport'), api.transport, TTS_TRANSPORTS)),
    ];
    if (format !== 'custom') parts.push(field(apiPath('endpoint'), '接口地址', textInput(apiPath('endpoint'), api.endpoint, hint.endpoint)));
    if (format !== 'gpt-sovits') parts.push(field(apiPath('apiKey'), 'API Key', secretInput(apiPath('apiKey'), api.apiKey, format === 'openai' ? '本地服务可留空' : '')));
    if (format !== 'gpt-sovits') parts.push(field(apiPath('model'), '模型', textInput(apiPath('model'), api.model, hint.model)));
    if (format === 'openai') {
        parts.push(
            field(apiPath('responseFormat'), '音频格式', selectInput(apiPath('responseFormat'), api.responseFormat, TTS_RESPONSE_FORMATS)),
            checkbox(apiPath('sendSpeed'), api.sendSpeed, '发送语速'),
        );
    }
    if (format === 'fish' || format === 'minimax') parts.push(checkbox(apiPath('sendSpeed'), api.sendSpeed, '发送语速'));
    if (format === 'fish' || format === 'minimax') parts.push(checkbox(apiPath('quality'), api.quality, '音质优先（更高码率，生成稍慢）'));
    if (format === 'minimax') parts.push(checkbox(apiPath('sendEmotion'), api.sendEmotion, '发送情绪（仅 MiniMax，按情绪选发音情感）'));
    if (format === 'fish' || format === 'minimax') parts.push(checkbox(apiPath('audioTags'), api.audioTags, '音频标签（句首情绪、耳语与括号动作转标签）'));
    if (format === 'custom') {
        parts.push(
            field(apiPath('customMethod'), '请求方法', selectInput(apiPath('customMethod'), api.customMethod, TTS_CUSTOM_METHODS)),
            field(apiPath('customUrl'), '请求地址', textInput(apiPath('customUrl'), api.customUrl, 'https://example.com/tts?text={{text}}')),
            field(apiPath('customHeaders'), '请求头（JSON）', textareaInput(apiPath('customHeaders'), api.customHeaders, '{"Authorization": "Bearer {{key}}"}')),
            field(apiPath('customBody'), '请求体（JSON）', textareaInput(apiPath('customBody'), api.customBody, '{"text": "{{text}}", "voice": "{{voice}}", "speed": {{speed}}}')),
            field(apiPath('customResponse'), '响应类型', selectInput(apiPath('customResponse'), api.customResponse, TTS_CUSTOM_RESPONSES)),
        );
        if (api.customResponse !== 'audio') parts.push(field(apiPath('customPath'), '音频字段路径', textInput(apiPath('customPath'), api.customPath, '如 data.audio')));
    }
    // 页面是 https、接口是 http 的非本机地址：浏览器会直接拦掉请求。
    if (ttsMixedContentRisk(api)) parts.push('<div class="igs-source-filter-note igs-tts-warning">当前页面是 https，浏览器会拦截 http 开头的接口地址。请改用「酒馆 CORS 代理」传输方式，或把接口换成 https。</div>');
    return parts;
}

// 声音库：名称 + 声音 ID 一条一行，角色与默认声音从这里选。source 为 api / narratorApi。
function renderTtsVoiceLibrary(source, voices, { fetchable = false, message = '', batch = null } = {}) {
    const entries = ttsVoiceEntries(voices);
    const rows = entries.map(([id, title], index) => `<div class="igs-tts-voice-item">`
        + `<input class="igs-asset-move" type="text" data-tts-voice="${source}" data-voice-index="${index}" data-voice-part="title" value="${esc(title)}" placeholder="名称" aria-label="声音名称">`
        + `<input class="igs-asset-move" type="text" data-tts-voice="${source}" data-voice-index="${index}" data-voice-part="id" value="${esc(id)}" placeholder="声音 ID" aria-label="声音 ID">`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="tts-voice-remove:${source}:${index}" title="删除" aria-label="删除这个声音">×</button></div>`).join('');
    const actions = `<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="tts-voice-add:${source}"${entries.length >= TTS_VOICE_MAX ? ' disabled' : ''}>添加声音</button>`
        + `<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="tts-voice-batch:${source}"${entries.length >= TTS_VOICE_MAX ? ' disabled' : ''}>批量识别</button>`
        + (fetchable ? `<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="${source === 'api' ? 'tts-fetch-voices' : 'tts-fetch-voices-narrator'}">获取音色列表</button>` : '');
    const batchBox = batch && batch.open
        ? `<textarea data-tts-batch="${source}" aria-label="批量识别声音" placeholder="每行一个声音：名称 ID、名称：ID、Fish 网址，或 JSON 列表">${esc(batch.text || '')}</textarea>`
            + `<div class="igs-tts-voice-actions"><button type="button" class="igs-settings-action igs-settings-inline-action" data-action="tts-voice-batch-run:${source}">识别并加入</button><button type="button" class="igs-settings-action igs-settings-inline-action" data-action="tts-voice-batch-cancel:${source}">取消</button></div>`
        : '';
    return `<div class="igs-settings-field igs-tts-voice-lib"><span>声音库<small class="igs-switch-note">${entries.length} / ${TTS_VOICE_MAX}</small></span>`
        + (rows || '<div class="igs-scene-empty">暂无声音</div>')
        + `<div class="igs-tts-voice-actions">${actions}</div>`
        + batchBox
        + (message ? `<div class="igs-source-filter-note">${esc(message)}</div>` : '')
        + '</div>';
}

const ttsGroup = (title, parts, headAction = '') => `<div class="igs-settings-group">${headAction
    ? `<div class="igs-settings-section-head"><div class="igs-settings-subhead">${title}</div>${headAction}</div>`
    : `<div class="igs-settings-subhead">${title}</div>`}${parts.filter(Boolean).join('')}</div>`;

const ttsInlineField = (label, controlHtml) => `<label class="igs-settings-field igs-tts-inline"><span>${esc(label)}</span><span class="igs-tts-inline-control">${controlHtml}</span></label>`;

// 默认声音候选池：点选多个，没单独设声音的角色按名字稳定地取其中一个。source 为 api / system，items 是 [id, 显示名]。
function ttsVoicePoolField(label, source, role, value, items, { missingNote = '不在声音库' } = {}) {
    const picked = parseVoicePool(value);
    const chip = (id, text, missing) => `<button type="button" class="igs-table-pick${picked.includes(id) ? ' is-on' : ''}${missing ? ' is-missing' : ''}" data-action="tts-pool-toggle:${source}:${role}:${encodeURIComponent(id)}" aria-pressed="${picked.includes(id) ? 'true' : 'false'}"><i></i><span>${esc(text)}</span></button>`;
    const known = new Set(items.map(([id]) => id));
    const chips = items.filter(([id]) => id).map(([id, text]) => chip(id, text, false))
        .concat(picked.filter((id) => !known.has(id)).map((id) => chip(id, `${id}（${missingNote}）`, true)));
    return `<div class="igs-settings-field igs-tts-pool-field"><span>${esc(label)}<small class="igs-switch-note">多选时按名字随机</small></span>`
        + `<div class="igs-tts-pool">${chips.join('') || '<div class="igs-scene-empty">暂无声音</div>'}</div></div>`;
}

const ttsPreviewButton = (action, label) => `<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="${action}">${label}</button>`;

const ttsPreviewError = (text) => (text ? `<div class="igs-source-filter-note igs-tts-warning" role="status">试听失败：${esc(text)}</div>` : '');

// 风格描述只有 OpenAI 兼容接口（instructions）与自定义请求（{{style}}）会用到。
const ttsStyleFormat = (api) => api.format === 'openai' || api.format === 'custom';

// 旁白：声音、语速、风格与独立接口（开启后旁白用自己的一套接口与声音，不受主来源影响）。
function renderTtsNarratorGroup(tts, { voicesMessage = '', batch = null, options = [], installed = [], previewError = '' } = {}) {
    const base = 'readerSettings.tts';
    const narrator = tts.narratorApi;
    const apiPath = (key) => `${base}.narratorApi.${key}`;
    const parts = [ttsPreviewError(previewError)];
    if (narrator.enabled) {
        const items = ttsNarratorVoiceOptions(tts);
        if (narrator.voice && !items.some(([id]) => id === narrator.voice)) items.push([narrator.voice, `${narrator.voice}（不在声音库）`]);
        parts.push(ttsInlineField('旁白声音', selectInput(apiPath('voice'), narrator.voice, [['', '未选择']].concat(items))));
    } else if (tts.provider === 'system') {
        const value = tts.system.narrator;
        const items = [['', '自动']].concat(options);
        if (value && !options.some(([id]) => id === value)) items.push([value, findSystemVoice(installed, value) ? value : `${value}（本机没有）`]);
        parts.push(ttsInlineField('旁白声音', selectInput(`${base}.system.narrator`, value, items)));
    } else {
        const value = tts.api.narrator;
        const library = ttsApiVoiceOptions(tts);
        const items = [['', '同女声'], ...library];
        if (value && !library.some(([id]) => id === value)) items.push([value, `${value}（不在声音库）`]);
        parts.push(ttsInlineField('旁白声音', selectInput(`${base}.api.narrator`, value, items)));
    }
    parts.push(ttsInlineField('旁白语速', selectInput(`${base}.narratorRate`, tts.narratorRate, TTS_RATES.map((v) => [v, v === 1 ? '正常' : `${v}×`]))));
    const styled = narrator.enabled ? ttsStyleFormat(narrator) : tts.provider === 'api' && ttsStyleFormat(tts.api);
    if (styled) parts.push(field(`${base}.narratorStyle`, '旁白风格', textareaInput(`${base}.narratorStyle`, tts.narratorStyle, '例：沉稳的说书人，语速平缓')));
    parts.push(checkbox(apiPath('enabled'), narrator.enabled, '旁白使用独立接口'));
    if (narrator.enabled) {
        parts.push(...renderTtsApiFields(narrator, apiPath));
        parts.push(renderTtsVoiceLibrary('narratorApi', narrator.voices, { fetchable: ['openai', 'fish', 'minimax'].includes(narrator.format), message: voicesMessage, batch }));
    }
    return ttsGroup('旁白', parts, ttsPreviewButton('tts-preview-narrator', '试听旁白'));
}

function renderTtsControls(tts, { bilingual = false, voicesMessage = '', narratorVoicesMessage = '', batches = {}, assets = null, previewError = '', narratorPreviewError = '', advancedOpen = false } = {}) {
    const base = 'readerSettings.tts';
    const rates = TTS_RATES.map((v) => [v, v === 1 ? '正常' : `${v}×`]);
    const apiMode = tts.provider === 'api';
    const api = tts.api;
    const apiPath = (key) => `${base}.api.${key}`;
    const styled = apiMode && ttsStyleFormat(api);
    const installed = apiMode ? [] : listSystemVoices();
    const options = apiMode ? [] : systemVoiceOptions(installed, { all: tts.allVoices });

    const basic = ttsGroup('基本', [
        field(`${base}.provider`, '来源', segmentedInput(`${base}.provider`, tts.provider, TTS_PROVIDERS, '朗读来源')),
        field(`${base}.volume`, '总音量', rangeInput(`${base}.volume`, tts.volume, '朗读总音量')),
        ttsInlineField('默认语速', selectInput(`${base}.rate`, tts.rate, rates)),
        `<div class="igs-tts-switches">${[
            checkbox(`${base}.narration`, tts.narration, '朗读旁白'),
            checkbox(`${base}.nsfw`, tts.nsfw, 'NSFW场景也朗读'),
            checkbox(`${base}.sustain`, tts.sustain, '翻页不打断'),
            apiMode ? checkbox(apiPath('prefetch'), api.prefetch, '提前生成下一页') : '',
            apiMode ? checkbox(apiPath('prefetchFloor'), api.prefetchFloor, '新楼层预载全楼') : '',
        ].join('')}</div>`,
        // 读译文用中文声音；读原文时系统语音按原文语言换日文 / 英文声音。
        bilingual ? field(`${base}.bilingual`, '台词朗读', segmentedInput(`${base}.bilingual`, tts.bilingual, TTS_BILINGUAL_MODES, '台词朗读')) : '',
    ]);

    const connection = apiMode ? ttsGroup('接口连接', [
        ...renderTtsApiFields(api, apiPath),
        `<div class="igs-source-filter-note">${esc((TTS_FORMAT_HINTS[api.format] || TTS_FORMAT_HINTS.openai).note)}跨域被拦时改用「酒馆 CORS 代理」。</div>`,
    ]) : '';

    const voiceParts = [ttsPreviewError(previewError)];
    if (apiMode) {
        voiceParts.push(renderTtsVoiceLibrary('api', api.voices, { fetchable: ['openai', 'fish', 'minimax'].includes(api.format), message: voicesMessage, batch: batches.api }));
        // 默认声音从声音库里多选；旧版手填、不在库里的值保留并标出。
        const library = ttsApiVoiceOptions(tts);
        for (const [key, label] of [['female', '女角色默认'], ['male', '男角色默认']]) {
            voiceParts.push(ttsVoicePoolField(label, 'api', key, api[key], library));
        }
    } else {
        const allVoicesButton = `<button type="button" class="igs-table-pick${tts.allVoices ? ' is-on' : ''}" data-switch="${base}.allVoices" aria-pressed="${tts.allVoices ? 'true' : 'false'}" title="列出全部语言的系统声音"><i></i><span>全部语言</span></button>`;
        [['female', '女角色默认'], ['male', '男角色默认']].forEach(([key, label], index) => {
            const value = tts.system[key];
            voiceParts.push(ttsVoicePoolField(label, 'system', key, value, options, { missingNote: '不在列表' }));
            if (index === 0) voiceParts.push(`<div class="igs-settings-row">${allVoicesButton}</div>`);
        });
        if (!options.length) voiceParts.push('<div class="igs-source-filter-note">没读到本机的声音（浏览器可能还在加载，稍等会自动刷新）。Windows 推荐使用 Edge 浏览器，自然声更多。</div>');
        else if (!hasNaturalSystemVoice(installed)) voiceParts.push('<div class="igs-source-filter-note">Windows 推荐使用 Edge 浏览器，自然声更多。</div>');
    }
    voiceParts.push('<div class="igs-settings-row"><button type="button" class="igs-settings-action" data-page="chars">前往角色设定</button></div>');
    const voice = ttsGroup('声音', voiceParts, ttsPreviewButton('tts-preview', '试听'));

    const thought = ttsGroup('心里话', [
        field(`${base}.thoughtVolume`, '心里话音量', rangeInput(`${base}.thoughtVolume`, tts.thoughtVolume, '心里话音量'), '相对台词音量的比例'),
        styled ? field(`${base}.thoughtStyle`, '心里话风格', textareaInput(`${base}.thoughtStyle`, tts.thoughtStyle, '例：压低声音，像自言自语')) : '',
        bilingual ? field(`${base}.thoughtBilingual`, '心里话朗读', segmentedInput(`${base}.thoughtBilingual`, tts.thoughtBilingual, TTS_THOUGHT_BILINGUAL_MODES, '心里话朗读')) : '',
    ]);

    const narrator = tts.narration ? renderTtsNarratorGroup(tts, { voicesMessage: narratorVoicesMessage, batch: batches.narratorApi, options, installed, previewError: narratorPreviewError }) : '';

    const advanced = `<details class="igs-settings-advanced" data-advanced="tts-advanced"${advancedOpen ? ' open' : ''}><summary>高级</summary>${[
        apiMode ? checkbox(apiPath('chunk'), api.chunk, '长句分段先播') : '',
        apiMode || tts.narratorApi.enabled ? checkbox(`${base}.cleanup`, tts.cleanup, '人声净化（减弱底噪与混响拖尾）') : '',
        tts.narration && tts.narratorApi.enabled ? checkbox(`${base}.narratorApi.chunk`, tts.narratorApi.chunk, '旁白接口长句分段先播') : '',
        styled ? checkbox(`${base}.moodStyle`, tts.moodStyle, '情绪写入风格描述（仅 OpenAI 兼容与自定义接口）') : '',
        field(`${base}.lexicon`, '读音替换', textareaInput(`${base}.lexicon`, tts.lexicon, '每行一条：原词=读法\n例：雫=shizuku\n例：Λ=兰姆达')),
    ].join('')}</details>`;

    return [basic, connection, voice, thought, narrator, advanced].join('');
}
