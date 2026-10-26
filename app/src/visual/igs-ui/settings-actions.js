import { BUILD_CUSTOM_MAX, normalizeBuild, validCustomSkillName } from '../../scene/stats/stat-build.js';

import { editCharacterCreature } from './creature-settings.js';
import { storedCreatureOf } from '../../scene/creature-profile.js';
import { characterDnaNeedsViews } from '../../scene/character-dna.js';
import { needsSettingsExternalSpriteDna, prepareSettingsExternalSpriteDna } from './settings-external-sprite-dna.js';
import { spriteDnaPreparationState } from '../../scene/character-dna-preparation.js';
import { prepareImageImport } from '../../media/image-import-transaction.js';
import { exportAssetArchive, readAssetFile } from '../../scene/asset-archive.js';
import { snapshotAssetLibrary } from '../../scene/asset-scope.js';
import { collectImageReferences } from '../../media/image-references.js';
import { writeZip } from '../../media/archive-zip.js';
import { createArchiveDownload } from '../../media/archive-download.js';
import { createTavernImageFiles } from '../../media/tavern-image-files.js';
import { dataUrlBlob } from '../../media/image-identity.js';
import { writeCheckedStorage } from '../../storage/checked-storage-write.js';
import { recoverOperation } from '../../storage/automatic-recovery.js';
import { openSettingsPage } from './settings-pages.js';
import { DEFAULT_VIRTUAL_REGEX } from '../../scene/message-source.js';
import { pendingExpressionCaptions } from './settings-outfit-fields.js';
import { cloneData } from './reader-value-utils.js';
import { normalizeDialogBarButtons } from './settings-normalize.js';
import { CG_INTERLUDE_STYLES } from './stage-direction-settings.js';
import { DEFAULT_SCENE_PROMPT_RULE, normalizeScenePromptRule, TOOLBAR_ACTIONS } from './reader-host-constants.js';
import { buildTagGrammar } from './tag-grammar.js';
import { firstMoodWord, resolvePromptRuleContent, scenePromptRuleEnabled } from '../../scene/prompt-rule-content.js';
import { findDbgenApi } from '../../generated-images/image-backend.js';
import { formatEditablePrompt, formatStoredPrompt, normalizeStoredPrompt, parseEditablePrompt, promptProvenance } from '../../generated-images/generation-prompt.js';
import { characterPromptRecovery } from '../../generated-images/illustration/character-prompt-task.js';
import { getNextSettingsTheme, normalizeSettingsTheme } from './settings-theme.js';
import { DEFAULT_MOOD_GROUPS, MOOD_PRESET, moodPresetEntry, moodTierLabels, normalizeMoodGroups, resolvePresetGroup } from '../../scene/mood-groups.js';
import { collectAssetZipEntries } from '../../scene/asset-zip.js';
import { assetOwnerKey, draftAssetLibrary, draftEffectiveAssets, effectiveSceneAssets, ensureCardLibrary, libraryHasContent, moveLibraryEntry, rememberAssetScope } from '../../scene/asset-scope.js';
import { mergeLabelGroups, parseCharacterCardPack, parsePresetArchive, parseSettingsArchive, spriteEntriesForNames } from '../../scene/card-pack.js';
import { getSillyTavernContext } from '../../host/tavern-helper-adapter.js';
import { collectPromptContext } from '../../host/prompt-context.js';
import { localImageCacheFor } from '../../media/tavern-image-cache.js';
import { buildPageDiagnostic } from './page-diagnostic.js';
import { fxPromptsCopyText } from './fx-settings-fields.js';
import { isPromptEntryKey, normalizePromptEntry } from '../../scene/prompt-entries.js';
import { getLastPromptReport } from '../../scene/prompt-triggers.js';
import { clearMoodReview, loadMoodReview, removeMoodReview, saveMoodReview } from '../../scene/mood-review-store.js';
import { loadStoryOutfitCandidates } from '../../scene/outfit-review-store.js';
import { applyMoodAssignments, applyMoodReclassification, buildMoodClassificationRequest, buildMoodReclassifyRequest, parseMoodClassification, resolveSecondaryLlm } from '../../scene/mood-classify.js';
import { SETTINGS_NOTICE_MS, beginSettingsProgress, markSettingsButtonBusy, remountSettingsNotice } from './settings-notice.js';
import { STATUS_HUD_POSITION_DEVICES, normalizeStatusHudSettings, normalizeStatusAvatars } from '../../data/shujuku/status-hud-model.js';

import { normalizeStageShakeSettings } from './stage-shake-runtime.js';
import { CHAT_SHOW_PROMPT_RULE, isValidChatContactName, normalizeChatPromptRule, normalizeChatShowSettings } from './chat-show-runtime.js';
import { normalizeSystemRoleSettings, stripRoleBrackets } from './system-role.js';
import { playChatSfx } from './chat-sfx.js';
import { normalizeTypewriterSettings } from './typewriter-runtime.js';
import { resolveTypewriterVoice, scheduleTypewriterAudio } from './typewriter-audio.js';
import { normalizeWeatherFxSettings } from './weather-fx-runtime.js';
import { FX_SETTINGS_NORMALIZERS, FX_WORD_LIST_PATHS } from './fx-settings.js';
import { isFeedPlatformId, normalizeFeedFxSettings } from './feed-settings.js';
import { ROMANCE_ACTIONS_MAX, normalizeRomanceFxSettings } from './romance-settings.js';
import { META_GLOBAL_SCOPE, META_LINE_KINDS, META_LINES_MAX, normalizeMetaFxSettings } from './meta-settings.js';
import { applyPerformancePreset, capturePerformancePreset, detectPerformancePreset, performancePresetLabel, restorePerformancePreset } from './performance-presets.js';
import { applyPerformanceProfile, hasPerformanceProfile, profileDiff, profileFromReader } from './performance-profile.js';
import { WORLDVIEWS, applyWorldview, resolveWorldview } from '../../scene/worldview.js';
import { canCarryPhone } from '../../scene/fx-era.js';
import { normalizeHorrorGore, normalizeHorrorStyle } from '../../scene/horror.js';
import { BGM_ACTION_RE, handleBgmSettingsAction } from './bgm-settings-actions.js';
import { deleteTavernFont, loadCustomFonts, pickFontFile, saveCustomFonts, uploadFontFile } from '../../media/custom-fonts.js';
import { recoverMediaOperation } from '../../media/tavern-media-http.js';
import { normalizeSpriteHeads } from './fx-anchor.js';
import { formatImageJobLogText } from '../../generated-images/image-job-log.js';
import { addGeneratedAssetToLibrary, bindGeneratedBackground, bindGeneratedSprite, collectGeneratedImageIds, generatedAssetIdOf, isGeneratedAssetUrl, normalizeGeneratedLibrary, removeGeneratedLibraryEntry, renameGeneratedLibraryEntry, setGeneratedExpressionNote } from '../../scene/asset-match.js';
import { resolveCharacterDna, normalizeCharacterDna, normalizeCharacterDnaMap, readCharacterDnaView, removeCharacterDna, renameCharacterDna } from '../../scene/character-dna.js';
import { prepareSpriteIdentityAdoption } from '../../scene/character-identity.js';
import { adoptCharacterSeed } from '../../scene/generation-seeds.js';
import { isImageSeed } from '../../generated-images/image-seed.js';
import { readDefaultOutfit, outfitSpriteSlots, setOutfitSprite, pickOutfitSprite, prepareInitialDefaultOutfitSelection } from '../../scene/character-appearance.js';
import { inspectOutfitImages } from '../../media/outfit-image-availability.js';
import { prepareOutfitAdoption, prepareOutfitDnaSave } from '../../scene/outfit-identity.js';
import { resolveCharacterKey } from '../../scene/scene-directives.js';

import { normalizeCharacterHouses } from './magic-house.js';
import { normalizeCharacterVoice, normalizeCharacterVoices, normalizeVoiceBarkSettings, previewVoicePack, previewCreatureVoice, resolveCharacterVoice } from './voice-bark.js';
import { TTS_VOICE_MAX, editTtsVoices, fetchTtsVoices, getTtsLastDecision, getTtsSkipReason, listSystemVoices, matchBatchVoicesToCharacters, mergeTtsVoices, normalizeTtsSettings, trimTtsCache, parseTtsVoiceBatch, ttsVoiceEntries, previewTts, resolveTtsVoice, toggleVoicePool } from './tts.js';
import { normalizeCharacterSpriteScales } from './sprite-height.js';
import { handleOutfitAction, guardDefaultOutfitImages } from './settings-outfit-actions.js';
import { handleEventCgAction } from './settings-event-cg.js';

import { createSettingsDialogs } from './settings-dialog.js';
import { SHORTCUT_ACTIONS, DEFAULT_SHORTCUTS, normalizeShortcutCombo } from './reader-shortcuts.js';
import { SETTINGS_SECTIONS, buildSettingsExport, parseSettingsImport, resetSettingsSection, settingsExportFileName } from './settings-sections.js';
import { isBuiltinNudeOutfit, isValidOutfitName, normalizeCharacterOutfits, normalizeWardrobe, renameOutfitScene, resolveWardrobePrompt } from '../../scene/character-outfits.js';

import { migrateSpriteKeys } from './sprite-key-migration.js';
import { migrateExpressionNotes } from '../../scene/expression-note-keys.js';
import { NAI_OFFICIAL_MODELS } from '../../generated-images/request-builders/nai-v4-builder.js';
import { ASSET_FOLDERS_STORAGE_KEY, ASSET_FOLDER_KINDS, addAssetFolder, forgetAssetItem, loadAssetFoldersFor as loadAssetFolders, mergeAssetFolderScope, moveAssetToFolder, removeAssetFolder, renameAssetFolder, renameAssetItem, saveAssetFolders, setAssetView, toggleAssetFolder } from './asset-folders.js';
import { mergeDefaultBackgrounds } from '../../backgrounds/merge-default-backgrounds.js';

// 能按「本卡 / 全局」筛选和整批迁移的素材，值是确认框里的叫法。
const SCOPED_COLLECTION_KINDS = Object.freeze({ scenes: '场景', characters: '角色', wardrobe: '衣柜提示词' });
import { isLayeredPreset, isLegacyPresetData, isValidPresetName, layeredPresetFromRoot, legacyPackConflicts, legacyPackSummary, legacyPresetToPack, loadLegacyPresets, mergeLegacyLibrary, presetCardLayers, presetFromAssets, readPresetLibrary, removeNamedPreset, renameNamedPreset, replaceLibraryWithPack, replacePresetLibrary, storeLegacyPresets, writeNamedPreset } from '../../scene/legacy-preset.js';
import { avatarHoldersOfPreset, avatarHoldersOfRoot, moveInlineAvatars, storeAvatarImage } from './avatar-images.js';
import { describeLocalStorageUsage, describeMediaUsage } from '../../storage/storage-usage.js';

// 草稿深拷贝后顶层 imageApi 与 bridge.imageApi 不再是同一对象，面板只改后者；生图读取优先顶层，这里对齐为面板当前值。
function cloneImageDraft(draft) {
    const settings = cloneData(draft);
    if (settings && settings.bridge && settings.bridge.imageApi) settings.imageApi = settings.bridge.imageApi;
    return settings;
}

const STATUS_AVATAR_MAX_BYTES = 512 * 1024;
const STATUS_AVATAR_MIME = /^image\/(?:png|jpeg|jpg|webp|gif|bmp|svg\+xml)$/i;
const ASSET_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const ASSET_UPLOAD_MIME = /^image\/(?:png|jpeg|webp|gif)$/i;


function decodeSeg(value) {
    try { return decodeURIComponent(String(value == null ? '' : value)); }
    catch (error) { return String(value == null ? '' : value); }
}

function operationFailed(result) {
    return result === false || Boolean(result && typeof result === 'object' && result.ok === false);
}

function assetFolderScope(settingsState, options) {
    const globalObj = options.global || globalThis;
    const asyncState = settingsState.asyncState || {};
    return { globalObj, storage: globalObj.localStorage, scope: String(asyncState.assetScopeKey || '') };
}

const CHARACTER_FIELDS = ['characters', 'characterOutfits', 'characterDefaultOutfits', 'characterSeeds', 'characterDna', 'characterAliases', 'statusAvatars'];

// 采用目标只读解析：别名归一后判断归属，借用资料不能自动写回来源卡。
function spriteAdoptionTarget(settingsState, requested) {
    const root = settingsState.draft.bridge?.sceneAssets || {};
    const scope = String(settingsState.asyncState?.assetScopeKey || '');
    const effective = effectiveSceneAssets(root, scope);
    const known = { ...effective.characterDna, ...effective.characterOutfits, ...effective.characters };
    const name = resolveCharacterKey(known, effective.characterAliases || {}, requested) || requested;
    const owner = assetOwnerKey(root, scope, CHARACTER_FIELDS, name);
    return { name, scope, owner, borrowed: Boolean(owner && owner !== scope),
        library: owner ? root.cards?.[owner] : root };
}

// 说明从当前有效衣柜解析；采用补丁仍写入角色所属库。
function outfitAdoptionReadOptions(settingsState) {
    return { readWardrobe: draftEffectiveAssets(settingsState).wardrobe };
}

// 缺失字段也属于原状态；回滚不能把旧档升级成带 undefined 字段的新形状。
function captureAdoptionFields(assets, fields, { clone = false } = {}) {
    return Object.fromEntries(fields.map(key => [key, {
        present: Object.hasOwn(assets, key), value: clone ? cloneData(assets[key]) : assets[key],
    }]));
}

function restoreAdoptionFields(assets, snapshot) {
    for (const [key, saved] of Object.entries(snapshot)) {
        if (saved.present) assets[key] = saved.value;
        else delete assets[key];
    }
}

function hasSpriteAdoptionEvidence(record) {
    return Boolean(record?.promptRecipe || record?.dnaCandidates !== undefined
        || record?.promptTask?.mode === 'dna_template');
}

async function readSpriteAdoptionRecord(service, imageId, record) {
    if (!hasSpriteAdoptionEvidence(record)) return { ok: true, record };
    try {
        const stored = await service.readStoredImage?.(imageId);
        if (!stored?.dataUrl || stored.id !== imageId || stored.type !== 'sprite'
            || !stored.promptRecipe || !stored.sentPrompt
            || (record.promptRecipe?.outfitMode === 'template'
                && (stored.promptRecipe.outfitMode !== 'template' || !stored.outfitSnapshot))
            || (record.dnaCandidates !== undefined && stored.dnaCandidates === undefined)) {
            return { ok: false, reason: 'DNA_ADOPTION_INVALID', error: '候选图片或身份资料无法权威回读，原资料保持不变' };
        }
        // 内存结果不能补齐权威存储已丢失的旁路，否则删除候选后仍可能建档。
        return { ok: true, record: { ...stored, imageId,
            ...(record.ok !== undefined && { ok: record.ok }),
            ...(record.name !== undefined && { name: record.name }),
            ...(record.mood !== undefined && { mood: record.mood }),
            ...(record.status !== undefined && { status: record.status }) } };
    } catch {
        return { ok: false, reason: 'DNA_ADOPTION_INVALID', error: '候选图片资料回读失败，原资料保持不变' };
    }
}

const SCENE_ACTION = /^scene-(?:(?:add|remove|rename|set|toggle|pick)-(?:bg|bg-word|bg-url|time|time-url|weather|weather-url)|variant-(?:set|retry))$/;
const CHARACTER_ACTION = /^(?:scene-(?:add|remove|rename|set|toggle|pick)-(?:char|char-alias|mood|mood-url|dna-char|outfit-mood)|status-avatar-(?:pick|clear|set-url|generate)|scene-set-user-char|char-(?:generate|redraw)-sprite|outfit-generate-nude|char-expression-(?:prompt|set|retry|resume)|outfit-expression-(?:prompt|set|retry|resume))$/;

// 服装的适用场景可能指向另一边的场景：场景改名、删除时全局和本卡的服装都要跟上。
function linkedCharacterOutfits(settingsState) {
    const root = settingsState.draft.bridge.sceneAssets || {};
    const key = String((settingsState.asyncState && settingsState.asyncState.assetScopeKey) || '');
    const card = key && root.cards && root.cards[key];
    return [root.characterOutfits, card && card.characterOutfits].filter(Boolean);
}

// 设置页列表里本卡和全局混在一起。按 action 找出改的是哪一条，写回它所在的那一边；新建的条目进本卡。
export function assetEditTarget(action) {
    const match = /^([a-z-]+):(.*)$/.exec(String(action || ''));
    if (!match) return null;
    const [, verb, rest] = match;
    const segs = rest.split(':').map(decodeSeg);
    if (SCENE_ACTION.test(verb)) return { collections: ['scenes'], name: segs[0] };
    if (CHARACTER_ACTION.test(verb)) return { collections: CHARACTER_FIELDS, name: segs[0] };
    if (verb === 'gen-lib-rename' || verb === 'gen-lib-remove') {
        return { collections: [segs[0] === 'background' ? 'generated.scenes' : 'generated.characters'], name: segs[1] };
    }
    if (verb === 'gen-file-scene') return { collections: ['generated.scenes'], name: segs[0] };
    if (verb === 'gen-adopt-sprite') return { collections: ['generated.characters', 'characters'], name: segs[0] };
    return null;
}

// 素材文件夹只是本地界面归类：不改草稿、不触发设置持久化。
async function runAssetFolderAction(action, settingsState, options, dialogs) {
    const m = /^asset-(view|edit|folder-add|folder-rename|folder-remove|folder-toggle|folder-move):([a-z]+)(?::(.*))?$/.exec(action);
    if (!m || !ASSET_FOLDER_KINDS.includes(m[2])) return false;
    const [, op, kind, rest = ''] = m;
    const { globalObj, storage, scope } = assetFolderScope(settingsState, options);
    let state = loadAssetFolders(storage, scope);
    if (op === 'view') {
        state = setAssetView(state, kind, rest);
    } else if (op === 'edit') {
        // 缩略图卡片「修改」：切回列表并展开所在文件夹；背景场景同时展开该条目。素材数据不动。
        const name = decodeSeg(rest);
        state = setAssetView(state, kind, 'list');
        const folder = Object.prototype.hasOwnProperty.call(state[kind].assign, name) ? state[kind].assign[name] : '';
        if (state[kind].collapsed.includes(folder)) state = toggleAssetFolder(state, kind, folder);
        if (kind === 'scenes' && name) {
            if (!(settingsState.asyncState.expandedSceneSlots instanceof Set)) settingsState.asyncState.expandedSceneSlots = new Set();
            settingsState.asyncState.expandedSceneSlots.add('bg\x00' + name);
        }
    } else if (op === 'folder-add') {
        const name = ((await dialogs.prompt('新文件夹名称：', '')) || '').trim();
        if (!name) return true;
        state = addAssetFolder(state, kind, name);
    } else if (op === 'folder-rename') {
        const from = decodeSeg(rest);
        const to = ((await dialogs.prompt(`重命名文件夹「${from}」为：`, from)) || '').trim();
        if (!to || to === from) return true;
        if (state[kind].folders.includes(to)) {
            pageAlert(dialogs, globalObj, `文件夹「${to}」已存在`);
            return true;
        }
        state = renameAssetFolder(state, kind, from, to);
    } else if (op === 'folder-remove') {
        const name = decodeSeg(rest);
        if (!await dialogs.confirm(`删除文件夹「${name}」？里面的素材会移回未分类，不会被删除。`)) return true;
        state = removeAssetFolder(state, kind, name);
    } else if (op === 'folder-toggle') {
        state = toggleAssetFolder(state, kind, decodeSeg(rest));
    } else {
        const c = rest.indexOf(':');
        if (c < 0) return true;
        state = moveAssetToFolder(state, kind, decodeSeg(rest.slice(0, c)), decodeSeg(rest.slice(c + 1)));
    }
    saveAssetFolders(storage, scope, state);
    return true;
}

// 条目改名后同步它的文件夹归属，避免改名后掉回未分类。
function syncAssetFolderItem(settingsState, options, kind, from, to) {
    const { storage, scope } = assetFolderScope(settingsState, options);
    const state = loadAssetFolders(storage, scope);
    if (Object.prototype.hasOwnProperty.call(state[kind].assign, from)) saveAssetFolders(storage, scope, renameAssetItem(state, kind, from, to));
}

// 条目删除后清掉它的文件夹归属，避免之后同名新建时被自动归回旧文件夹。
function forgetAssetFolderItem(settingsState, options, kind, name) {
    const { storage, scope } = assetFolderScope(settingsState, options);
    const state = loadAssetFolders(storage, scope);
    if (Object.prototype.hasOwnProperty.call(state[kind].assign, name)) saveAssetFolders(storage, scope, forgetAssetItem(state, kind, name));
}

function characterExpressionDna(sceneAssets, name) {
    const hit = resolveCharacterDna(
        sceneAssets.characterDna,
        name,
        (raw) => resolveCharacterKey(sceneAssets.characters || {}, sceneAssets.characterAliases || {}, raw) || '',
    );
    return hit ? hit.dna : null;
}

function expressionNoteKey(name, outfit) {
    return outfit ? `${name}\u0001${outfit}` : name;
}

function firstGeneratedOutfitUrl(entry) {
    const base = String(entry && entry.base || '').trim();
    if (isGeneratedAssetUrl(base)) return base;
    const moods = entry && entry.moods && typeof entry.moods === 'object' ? entry.moods : {};
    for (const url of Object.values(moods)) {
        const text = String(url || '').trim();
        if (isGeneratedAssetUrl(text)) return text;
    }
    return '';
}

function clearExpressionNote(library, key, mood) {
    if (!library.expressionNotes[key]) return library;
    const notes = { ...library.expressionNotes[key] };
    delete notes[mood];
    if (Object.keys(notes).length) library.expressionNotes[key] = notes;
    else delete library.expressionNotes[key];
    return library;
}

function applyCharacterExpression(sceneAssets, name, item) {
    const characters = { ...(sceneAssets.characters || {}) };
    const current = { ...(characters[name] || {}) };
    let library = normalizeGeneratedLibrary(sceneAssets.generated);
    if (item && item.ok && item.imageId) {
        current[item.mood] = `igs-gen:${item.imageId}`;
        Object.assign(sceneAssets, adoptCharacterSeed(sceneAssets, name, item.seed));
        library = clearExpressionNote(library, name, item.mood);
    } else {
        // 停下没画的不建空槽，只把写好的词记在注记里，给「继续生图」用。
        if (!Object.prototype.hasOwnProperty.call(current, item.mood) && item.error !== '已停止') current[item.mood] = '';
        const noted = setGeneratedExpressionNote(library, name, item.mood, {
            positive: item && item.prompt ? item.prompt.positive : '',
            negative: item && item.prompt ? item.prompt.negative : '',
            error: (item && item.error) || '出图失败',
            caption: item && item.caption,
            ...promptProvenance(item.prompt || item), ...characterPromptRecovery(item),
        });
        if (noted.ok) library = noted.library;
    }
    characters[name] = current;
    sceneAssets.characters = characters;
    sceneAssets.generated = library;
}

function settingsProgressHost(globalObj) {
    const doc = globalObj && globalObj.document;
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById('igs-unified-settings') : null;
}

// 进度条写明在画谁：写词和出图分开说，一批多张带上第几张。
function expressionProgressText(who, event) {
    if (event && event.phase === 'dna') return `副 API 补齐 DNA：${who}${event.message ? ` · ${event.message}` : ''}`;
    if (event && event.phase === 'write') return `写提示词：${who}`;
    const total = Number(event && event.total) || 0;
    if (total > 1) return `生图中：${who}·${event.mood || ''} ${Number(event.done) || 0}/${total}`;
    return `生图中：${who}`;
}

// 点下去就挂一条进度，结束时只收自己这一条；同时在画的其他格子进度还在。
// 面板关着也要收：记住的进度不清掉，下次打开会补回一条过期的进度条。
function startExpressionProgress(globalObj, who) {
    const task = beginSettingsProgress(() => settingsProgressHost(globalObj), `生图中：${who}`);
    return {
        onProgress: (event) => { if (event) task.update(expressionProgressText(who, event)); },
        end: () => task.end(),
    };
}

function errorText(error, fallback) {
    const message = typeof error === 'string' ? error : String((error && (error.message || error.error)) || '');
    return message.trim() || fallback;
}

// 设置层开着时走面板内提示，不调用浏览器 alert（全屏会被浏览器弹窗退出）。
// 没有对话框实现时才退回 global.alert，给没有面板 DOM 的测试用。
function pageAlert(dialogs, globalObj, message) {
    if (dialogs && typeof dialogs.alert === 'function') {
        const pending = dialogs.alert(message);
        if (pending && typeof pending.catch === 'function') pending.catch(() => {});
        return;
    }
    if (globalObj && typeof globalObj.alert === 'function') globalObj.alert(message);
}

const RESERVED_ASSET_NAMES = Object.freeze(['__proto__', 'constructor', 'prototype']);

// 新建条目的默认名取最小的空闲编号：按数量加一取名，删过中间的条目后会撞上已有的同名条目。
function nextFreeName(prefix, taken) {
    let n = 1;
    while (Object.prototype.hasOwnProperty.call(taken, `${prefix}${n}`)) n += 1;
    return `${prefix}${n}`;
}

// 生图失败用面板里的弹窗说清原因。别的对话框正开着（比如正在选档位）就改用底部提示条，不顶掉用户正在答的那个。
function generationFailure(globalObj, dialogs, message, reason) {
    if (dialogs && typeof dialogs.view === 'function' && !(typeof dialogs.isOpen === 'function' && dialogs.isOpen())) {
        dialogs.view(message);
    } else if (settingsProgressHost(globalObj)) {
        showGeneratedNotice(globalObj, message);
    } else {
        pageAlert(dialogs, globalObj, message);
    }
    return { ok: false, reason };
}

// 已有提示词的先补画，不重写；剩下没有词的再写再画。补画中途停下就不再写。
async function paintThenWriteExpressions({ service, name, paintItems, writeLabels, basePrompt, dna, outfit, note, nsfw, onProgress, signal, shouldStart, onOutfitDna }) {
    const paint = paintItems.length && typeof service.paintExpressionCaptions === 'function'
        ? await service.paintExpressionCaptions({ name, items: paintItems, basePrompt, dna, outfit, nsfw, onProgress, signal,
            ...(shouldStart && { shouldStart }) })
        : null;
    if (paint && !paint.ok) return paint;
    if (paint && (paint.stopped || (signal && signal.aborted))) return paint;
    const written = await service.generateExpressionSet({ name, basePrompt, moods: writeLabels, dna, outfit, note, nsfw, onProgress, signal,
        ...(shouldStart && { shouldStart }), ...(onOutfitDna && { onOutfitDna }) });
    if (!paint) return written;
    const paintedItems = paint.items || [];
    const wroteItems = written && written.items;
    const failedWrite = !written || !written.ok
        ? writeLabels.map((mood) => ({ mood, ok: false, error: (written && written.error) || '写提示词失败' }))
        : [];
    return {
        ok: Boolean(written && written.ok) || paintedItems.some((item) => item.ok),
        stopped: Boolean(written && written.stopped),
        items: paintedItems.concat(wroteItems || failedWrite),
        error: written && written.ok ? '' : (written && written.error),
    };
}

function markExpressionActionBusy(globalObj, action, label = '生图中') {
    const host = settingsProgressHost(globalObj);
    const button = host && typeof host.querySelector === 'function'
        ? host.querySelector(`[data-action="${action}"]`)
        : null;
    return markSettingsButtonBusy(button, label);
}

function applyOutfitExpression(sceneAssets, name, outfitName, item) {
    const mood = item && item.mood;
    if (!mood) return;
    const all = { ...(sceneAssets.characterOutfits || {}) };
    const outfits = { ...(all[name] || {}) };
    const entry = { ...(outfits[outfitName] || { words: [], moods: {} }) };
    const moods = { ...(entry.moods && typeof entry.moods === 'object' ? entry.moods : {}) };
    const noteKey = expressionNoteKey(name, outfitName);
    let library = normalizeGeneratedLibrary(sceneAssets.generated);
    if (item.ok && item.imageId) {
        if (mood === '默认') entry.base = `igs-gen:${item.imageId}`;
        else moods[mood] = `igs-gen:${item.imageId}`;
        Object.assign(sceneAssets, adoptCharacterSeed(sceneAssets, name, item.seed));
        library = clearExpressionNote(library, noteKey, mood);
    } else {
        if (mood !== '默认' && !Object.prototype.hasOwnProperty.call(moods, mood) && item.error !== '已停止') moods[mood] = '';
        const noted = setGeneratedExpressionNote(library, noteKey, mood, {
            positive: item && item.prompt ? item.prompt.positive : '',
            negative: item && item.prompt ? item.prompt.negative : '',
            error: (item && item.error) || '出图失败',
            caption: item && item.caption,
            ...promptProvenance(item.prompt || item), ...characterPromptRecovery(item),
        });
        if (noted.ok) library = noted.library;
    }
    entry.moods = moods;
    outfits[outfitName] = entry;
    all[name] = outfits;
    sceneAssets.characterOutfits = all;
    sceneAssets.generated = library;
}

function persistGeneratedLibrary(persistSettingsDraft, options = {}) {
    try {
        return persistSettingsDraft(options);
    } catch (error) {
        return { ok: false, reason: 'generated-asset-persist-failed' };
    }
}

async function rollbackImportedDraft(settingsState, before, persistSettingsDraft, prepared, storage, folders) {
    settingsState.draft = before;
    const restored = persistGeneratedLibrary(persistSettingsDraft);
    const folderResult = folders !== undefined ? writeCheckedStorage(storage, ASSET_FOLDERS_STORAGE_KEY, folders) : { ok: true };
    const compensation = prepared ? await prepared.rollback() : { ok: true };
    return { ok: false, reason: 'save-failed', rollbackFailed: !restored || restored.ok === false || !folderResult.ok || !compensation.ok };
}

function generatedAdoptionRollbackFailure(dialogs, globalObj, message, cause) {
    return {
        ...generatedOperationFailure(dialogs, globalObj, message, 'generated-asset-accept-rollback-failed'),
        rollbackFailed: true,
        causeReason: typeof cause?.reason === 'string' ? cause.reason : 'generated-asset-persist-failed',
    };
}

function restoreGeneratedLibrary(sceneAssets, previousLibrary, persistSettingsDraft) {
    sceneAssets.generated = previousLibrary;
    try {
        const rollback = persistSettingsDraft();
        return !operationFailed(rollback);
    } catch (error) {
        return false;
    }
}

// 角色记一个档位；没记过按 8。用户取消返回 0。老存档记的 18 按 20 处理。
export const MOOD_TIERS = [8, 12, 16, 20];

function normalizeMoodTier(value) {
    const picked = Number(value);
    if (picked === 18) return 20;
    return MOOD_TIERS.includes(picked) ? picked : 0;
}

// firstDefault：新衣服还没有自己的图时，最上面多一项「1 张」，只画这套的「平和」。阅读器里这套缺的表情都回落到它，
// 睡衣这类只要一张的衣服就到此为止；想要整套再点一次选档位。返回 1。
async function chooseMoodTier(dialogs, saved, name, { firstDefault = false } = {}) {
    const remembered = normalizeMoodTier(saved);
    const current = firstDefault ? 1 : remembered || 8;
    const title = firstDefault ? `「${name}」新衣服，画几张？` : `「${name}」要画多少张表情差分？`;
    const choices = [
        ...(firstDefault ? [{ value: '1', label: '1', note: '平和一张，表情共用' }] : []),
        { value: '8', label: '8', note: '普通角色' },
        { value: '12', label: '12', note: '重要配角' },
        { value: '16', label: '16', note: '主要角色' },
        { value: '20', label: '20', note: '主角' },
        { value: 'pick', label: '自选', note: '勾选要画的表情' },
    ];
    let raw;
    if (dialogs && typeof dialogs.choose === 'function') {
        raw = await dialogs.choose(title, choices, String(current), { dropdown: true, okLabel: '开始' });
    } else if (dialogs && typeof dialogs.prompt === 'function') {
        raw = await dialogs.prompt(`${title}\n${choices.map((item) => `${item.label} ${item.note}`).join('\n')}`, String(current));
    } else return current;
    if (raw == null) return 0;
    if (firstDefault && Number(raw) === 1) return 1;
    if (raw === 'pick') return -1;
    const picked = normalizeMoodTier(raw);
    return picked || current;
}

// 生图前的额外要求：性格、某个情绪的特别表现。按角色记着，下次预填。
// 返回 null 表示用户取消（这次不生图），空串表示没写。
async function askExpressionNote(dialogs, name, saved) {
    const message = `「${name}」的表情差分有没有要注意的点？\n比如性格、某个情绪的特别表现（可留空）\n例：三无性格，表情幅度要极小；大笑也不要张嘴\n此说明仅用于本次编写提示词，不影响已生成的图片。`;
    const current = String(saved || '');
    if (dialogs && typeof dialogs.edit === 'function') {
        const raw = await dialogs.edit(message, current, { okLabel: '开始生成', cancelLabel: '取消' });
        return raw == null ? null : String(raw);
    }
    if (dialogs && typeof dialogs.prompt === 'function') {
        const raw = await dialogs.prompt(message, current);
        return raw == null ? null : String(raw);
    }
    return current;
}

// 默认立绘的额外要求：长相、服装、姿势。按角色记着，下次预填。取消返回 null。
async function askSpriteNote(dialogs, name, saved) {
    const message = `「${name}」的立绘有没有要注意的点？\n比如长相、服装、姿势（可留空）\n例：银发红瞳，穿白裙；站姿放松，不要拿道具\n此说明仅用于本次编写提示词，不影响已生成的图片。`;
    const current = String(saved || '');
    if (dialogs && typeof dialogs.edit === 'function') {
        const raw = await dialogs.edit(message, current, { okLabel: '开始生成', cancelLabel: '取消' });
        return raw == null ? null : String(raw);
    }
    if (dialogs && typeof dialogs.prompt === 'function') {
        const raw = await dialogs.prompt(message, current);
        return raw == null ? null : String(raw);
    }
    return current;
}

function nsfwEnabledForAssets(draft) {
    const bridge = draft && draft.bridge ? draft.bridge : {};
    const auto = bridge.autoIllustration && typeof bridge.autoIllustration === 'object' ? bridge.autoIllustration : {};
    return auto.nsfwEnabled === true;
}

// 跑的时候把生成按钮换成「停止生成」；按一下就置 abort，已画好的图保留。
function createStopControl(onRestore) {
    const controller = new AbortController();
    const globalObj = typeof globalThis !== 'undefined' ? globalThis : null;
    const doc = globalObj && globalObj.document;
    const host = doc && typeof doc.getElementById === 'function' ? doc.getElementById('igs-unified-settings') : null;
    const buttons = host ? Array.from(host.querySelectorAll('[data-action^="char-expression-set:"],[data-action^="outfit-expression-set:"]')) : [];
    const restoreAll = () => {
        for (const button of buttons) {
            if (button.isConnected === false) continue;
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = '停止生成';
        }
    };
    const state = { restore: restoreAll };
    const onClick = (event) => {
        const target = event.target && event.target.closest ? event.target.closest('[data-action^="char-expression-set:"],[data-action^="outfit-expression-set:"]') : null;
        if (!target) return;
        if (!controller.signal.aborted && state.restore) {
            controller.abort();
            target.textContent = '正在收尾…';
            target.disabled = true;
        }
    };
    if (host) {
        host.addEventListener('click', onClick, true);
        for (const button of buttons) {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            button.textContent = '停止生成';
        }
    }
    return {
        signal: controller.signal,
        stopButton: {
            set restore(fn) { state.restore = fn; },
        },
        done() {
            if (host) host.removeEventListener('click', onClick, true);
            restoreAll();
            if (typeof onRestore === 'function') onRestore();
        },
    };
}

// 出图结果用页面上的提示条说，不弹 alert，免得一张失败糊一屏。
// tone 为 info 时是「已换上」这类结果提示，不用红底。几秒后自己收起。
function showGeneratedNotice(globalObj, message, tone) {
    const host = settingsProgressHost(globalObj);
    if (!host || !message) return;
    const el = remountSettingsNotice(host, { message, tone, until: Date.now() + SETTINGS_NOTICE_MS }, Date.now());
    if (!el || typeof globalObj.setTimeout !== 'function') return;
    globalObj.setTimeout(() => {
        if (el.textContent === message && el.parentNode) el.parentNode.removeChild(el);
    }, SETTINGS_NOTICE_MS);
}

// 预设里没有的组、或者词已经被别的组占了，都跳过。
function fillPresetWordsFor(label, groups, fallback) {
    const preset = moodPresetEntry(label);
    if (!preset) return fallback;
    const taken = new Set();
    for (const group of groups) {
        if (!group || group.label === label) continue;
        for (const word of Array.isArray(group.words) ? group.words : []) taken.add(String(word || '').trim());
    }
    const words = preset.words.filter((word) => !taken.has(word));
    return words.length ? words : fallback;
}

// 套用预设：预设的组按预设词全量覆盖；用户自建的组不动。
// 冲突的词（同一个词出现在两组）按预设归属挪走。返回是否真的改了。
function applyMoodPreset(groups) {
    const presetLabels = new Set(MOOD_PRESET.map((entry) => entry.label));
    const custom = groups.filter((group) => group && !presetLabels.has(String(group.label || '').trim()));
    const customWords = new Set();
    for (const group of custom) {
        for (const word of Array.isArray(group.words) ? group.words : []) customWords.add(String(word || '').trim());
    }
    const built = MOOD_PRESET.map((entry) => ({
        label: entry.label,
        words: entry.words.filter((word) => !customWords.has(word)),
    }));
    const next = [...built, ...custom.map((group) => ({ label: String(group.label).trim(), words: (group.words || []).slice() }))];
    const before = JSON.stringify(groups.map((group) => ({ label: group.label, words: group.words })));
    const after = JSON.stringify(next.map((group) => ({ label: group.label, words: group.words })));
    groups.splice(0, groups.length, ...next);
    return before !== after;
}

function generatedOperationFailure(dialogs, globalObj, message, reason) {
    pageAlert(dialogs, globalObj, message);
    return { ok: false, reason };
}

function generatedAdoptionFailure(dialogs, globalObj, adoption) {
    return { ...generatedOperationFailure(dialogs, globalObj, adoption.error, adoption.reason),
        error: adoption.error, writeAttempted: false,
        ...(adoption.diagnostic && { diagnostic: adoption.diagnostic }) };
}

// 已保存配置、旧预设和待确认衣装共同持有图片；读取候选失败时保守保留。
export function unreferencedGeneratedImageIds(imageIds, sceneAssets, storage) {
    const inUse = new Set(collectGeneratedImageIds(sceneAssets));
    if (storage) {
        const candidates = loadStoryOutfitCandidates(storage);
        if (!candidates.ok) return [];
        for (const row of candidates.items) if (row.imageId) inUse.add(row.imageId);
    }
    // 本机还留着的旧版预设也算在用：找回之前，它们引用的图不能删。
    for (const preset of Object.values(loadLegacyPresets(storage))) {
        for (const id of collectGeneratedImageIds(preset)) inUse.add(id);
    }
    return (Array.isArray(imageIds) ? imageIds : []).filter((id) => id && !inUse.has(id));
}

// 一份配置改完之后，原先引用、现在全局和角色卡都不再引用的图片。
export function releasedGeneratedImageIds(previousIds, sceneAssets, storage) {
    const still = new Set(collectGeneratedImageIds(sceneAssets));
    const dropped = (Array.isArray(previousIds) ? previousIds : [...(previousIds || [])]).filter((id) => id && !still.has(id));
    return unreferencedGeneratedImageIds(dropped, sceneAssets, storage);
}

// 刚加的时间 / 天气要看得见：把那个场景的时间行展开。
function expandSceneTimes(settingsState, sceneName) {
    const asyncState = settingsState.asyncState || (settingsState.asyncState = {});
    if (!(asyncState.expandedSceneSlots instanceof Set)) asyncState.expandedSceneSlots = new Set();
    asyncState.expandedSceneSlots.add('times\x00' + sceneName);
}

function cgSelection(asyncState) {
    if (!(asyncState.imageCgSelected instanceof Set)) asyncState.imageCgSelected = new Set();
    return asyncState.imageCgSelected;
}

// CG 库目录交给 cg-library-view；丢掉它，下次渲染会重新打开（先读目录，再对账）。
function resetCgView(asyncState) {
    if (asyncState.imageCg) asyncState.imageCg.dispose();
    asyncState.imageCg = null;
    if (asyncState.imageCgSelected instanceof Set) asyncState.imageCgSelected.clear();
}

async function deleteCgEntries(action, settingsState, options, dialogs, rerenderSettings) {
    const asyncState = settingsState.asyncState;
    const view = asyncState.imageCg || null;
    const entries = view ? view.state.entries : [];
    const selected = cgSelection(asyncState);
    if (action === 'image-cg-select-all') {
        const keys = entries.map((entry) => entry.key);
        const allOn = keys.length > 0 && keys.every((key) => selected.has(key));
        if (allOn) selected.clear();
        else for (const key of keys) selected.add(key);
        return rerenderSettings();
    }
    if (action.startsWith('image-cg-toggle:')) {
        const entry = entries[Number(action.slice('image-cg-toggle:'.length))];
        if (entry) {
            if (selected.has(entry.key)) selected.delete(entry.key);
            else selected.add(entry.key);
        }
        return rerenderSettings();
    }
    const service = options.cgGallery;
    if (!service || typeof service.remove !== 'function') {
        asyncState.imageCgStatus = 'CG库不可用';
        return rerenderSettings();
    }
    let targets = [];
    let ask = '';
    if (action.startsWith('image-cg-delete:')) {
        const entry = entries[Number(action.slice('image-cg-delete:'.length))];
        if (!entry) return rerenderSettings();
        targets = [entry];
        ask = entry.kind === 'photo' ? '删除这张照片？无法恢复。' : `删除第${entry.messageId}楼的这张CG？聊天里的这张图也会一起消失，无法恢复。`;
    } else if (action === 'image-cg-delete-selected') {
        targets = entries.filter((entry) => selected.has(entry.key));
        if (!targets.length) {
            asyncState.imageCgStatus = '先勾选要删除的CG。';
            return rerenderSettings();
        }
        ask = `删除选中的${targets.length}张CG？聊天里的这些图也会一起消失，无法恢复。`;
    } else {
        ask = '删除全部CG？聊天里的这些图也会一起消失，无法恢复。';
    }
    if (!await dialogs.confirm(ask)) return rerenderSettings();
    if (action === 'image-cg-delete-all' && typeof service.removeAll === 'function') {
        const result = await service.removeAll();
        const removed = result && result.removed || 0;
        const failed = result && result.failed || 0;
        resetCgView(asyncState);
        asyncState.imageCgStatus = !result || (result.ok === false && !removed) ? '删除失败，CG仍保留' : (failed ? `已删除${removed}张，${failed}张未能删除。` : `已删除${removed}张。`);
        return rerenderSettings();
    }
    const batch = typeof service.removeMany === 'function'
        ? await service.removeMany(targets)
        : await removeCgOneByOne(service, targets);
    const removedKeys = new Set(batch && batch.keys || []);
    for (const key of removedKeys) selected.delete(key);
    if (view) view.removeKeys([...removedKeys]);
    const removed = removedKeys.size;
    const failed = batch && batch.failed || 0;
    asyncState.imageCgStatus = failed ? `已删除${removed}张，${failed}张未能删除。` : `已删除${removed}张。`;
    return rerenderSettings();
}

async function removeCgOneByOne(service, targets) {
    const keys = [];
    let failed = 0;
    for (const entry of targets) {
        const result = await service.remove(entry);
        if (result && result.ok) keys.push(entry.key);
        else failed += 1;
    }
    return { removed: keys.length, failed, keys };
}

// 下载文件名：去掉 Windows / 各浏览器不允许的字符，保证以 .png 结尾。
export function sanitizeDownloadName(name) {
    const cleaned = String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
    const base = cleaned || '素材.png';
    return /\.png$/i.test(base) ? base : `${base}.png`;
}

// 把 data:image/...;base64 转成 Blob 下载；环境缺 Blob/URL 时退回直接用 dataUrl 作为链接。
function triggerDataUrlDownload(globalObj, dataUrl, fileName) {
    const doc = globalObj.document;
    if (!doc || typeof doc.createElement !== 'function') return { ok: false, reason: 'no-document' };
    const BlobCtor = globalObj.Blob || globalThis.Blob;
    const urlApi = globalObj.URL || globalThis.URL;
    const decode = typeof globalObj.atob === 'function' ? globalObj.atob.bind(globalObj) : (typeof globalThis.atob === 'function' ? globalThis.atob : null);
    const m = /^data:([^;,]+);base64,/i.exec(String(dataUrl));
    let href = dataUrl;
    let objectUrl = '';
    if (m && BlobCtor && urlApi && typeof urlApi.createObjectURL === 'function' && decode) {
        const bin = decode(String(dataUrl).slice(m[0].length));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        objectUrl = urlApi.createObjectURL(new BlobCtor([bytes], { type: m[1] }));
        href = objectUrl;
    }
    const a = doc.createElement('a');
    a.href = href;
    a.download = fileName;
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    if (objectUrl && typeof urlApi.revokeObjectURL === 'function') urlApi.revokeObjectURL(objectUrl);
    return { ok: true, fileName };
}

// 防手滑：删东西、清空、恢复默认、切演出档位和世界观之前先问一句。
// 自带确认的动作（CG、预设、文件夹、角色设定、生成图库、情绪预设…）不在表里，免得问两遍；
// 词条胶囊上的 × 删一个词，随手能加回来，也不问。
const segs = (action, prefix) => action.slice(prefix.length).split(':').map(decodeSeg);
const RISKY_ACTIONS = [
    ['scene-remove-bg:', (a) => `删除场景「${segs(a, 'scene-remove-bg:')[0]}」？其下的时间、天气背景将一并删除。`],
    ['scene-remove-time:', (a) => { const [scene, time] = segs(a, 'scene-remove-time:'); return `删除「${scene}」的时间「${time}」？其下的天气背景将一并删除。`; }],
    ['scene-remove-weather:', (a) => { const [scene, time, weather] = segs(a, 'scene-remove-weather:'); return `删除「${scene}·${time}」的天气「${weather}」？`; }],
    ['scene-remove-char:', (a) => `删除角色「${segs(a, 'scene-remove-char:')[0]}」？立绘、别名将一并删除。`],
    ['scene-remove-mood:', (a) => { const [name, mood] = segs(a, 'scene-remove-mood:'); return `删除「${name}」的「${mood}」立绘格？`; }],
    ['scene-remove-outfit-mood:', (a) => { const [name, outfit, mood] = segs(a, 'scene-remove-outfit-mood:'); return `删除「${name}」「${outfit}」的「${mood}」立绘格？`; }],
    ['scene-remove-outfit:', (a) => { const [name, outfit] = segs(a, 'scene-remove-outfit:'); return `删除「${name}」的服装「${outfit}」？这套服装的立绘、头像将一并删除。`; }],
    ['scene-clear-outfit-avatar:', () => '清除这套服装的头像？'],
    ['status-avatar-clear:', (a) => `清除「${segs(a, 'status-avatar-clear:')[0]}」的状态栏头像？`],
    ['wardrobe-remove:', (a) => `删除衣柜里的「${segs(a, 'wardrobe-remove:')[0]}」？`],
    ['mood-remove-group:', (a) => `删除情绪组「${segs(a, 'mood-remove-group:')[0]}」？组内的情绪词将一并删除。`],
    ['chat-show-remove-contact:', () => '删除这个联系人？'],
    ['bgm-track-remove:', () => '删除这首背景音乐？'],
    ['romance-action-remove:', () => '删除这条亲密动作？'],
    ['meta-line-remove:', () => '删除这条台词？'],
    ['meta-scope-remove:', () => '删除这条生效范围？'],
    ['feed-prompt-reset:', () => '这个平台的写法恢复默认？当前修改过的内容将被覆盖。'],
    ['prompt-entry-reset:', () => '这条写法恢复默认？关键词、位置、深度和正文都会恢复默认。'],
    ['feed-storm-prompt-reset', () => '舆论风暴的写法恢复默认？当前修改过的内容将被覆盖。'],
    ['remove-virtual-regex:', () => '删除这条正文格式化规则？'],
    ['image-log-clear', () => '清空生图日志？'],
    ['purge-asset-cache', () => '清素材缓存？浏览器里缓存的图片与设置页缩略图都会清空；酒馆上的原图还在，下次查看会重新读取。'],
    ['image-cache-clear', () => '清空浏览器里缓存的图片？酒馆上的原图还在，下次查看会重新下载。'],
    ['mood-review-clear', () => '清空待确认的情绪词？'],
    ['reset-virtual-regex', () => '正文格式化恢复默认？当前的查找与替换内容将被覆盖。'],
    ['reset-prompt-rule', () => '提示词规则恢复默认？当前修改过的内容将被覆盖。'],
    ['reset-mood-groups', () => '情绪分组恢复默认？自行添加的组和词将被覆盖。'],
    ['chat-show-reset-prompt', () => '线上交流提示词恢复默认？当前修改过的内容将被覆盖。'],
];

// 当前演出开关是不是手调出来的自定义组合：有快速配置时看是否偏离配置，没有时看能否对上某一档。
function isCustomPerformanceCombo(reader) {
    if (hasPerformanceProfile(reader)) {
        const diff = profileDiff(reader);
        return Boolean(diff && (diff.added.length || diff.removed.length));
    }
    return detectPerformancePreset(reader) === '';
}

function riskyActionMessage(action, settingsState, editTarget) {
    const worldview = /^worldview:([a-z-]+)$/.exec(action);
    if (worldview) {
        const found = WORLDVIEWS.find((item) => item.id === worldview[1]);
        if (!found || resolveWorldview(draftAssetLibrary(settingsState, editTarget)) === found.id) return '';
        return `切换到「${found.label}」世界观？演出用词、音效和界面将随之切换。`;
    }
    const hit = RISKY_ACTIONS.find(([prefix]) => (prefix.endsWith(':') ? action.startsWith(prefix) : action === prefix || action.startsWith(`${prefix}:`)));
    return hit ? hit[1](action) : '';
}

// 删掉上传字体后，把还引用它的字体设置（对话框四个位置 + 系统角色）还原成默认。
function resetThemeFontsUsing(draft, family) {
    const needle = String(family || '');
    if (!needle) return;
    const reader = (draft && draft.readerSettings) || {};
    for (const target of [reader.vnTheme, reader.classicVnTheme, reader.systemRole]) {
        if (!target || typeof target !== 'object') continue;
        for (const [key, value] of Object.entries(target)) {
            if (/font/i.test(key) && String(value || '').includes(needle)) target[key] = 'inherit';
        }
    }
}

export async function handleSettingsAction(action, ctx) {
    const {
        state,
        options,
        closeSettings,
        persistSettingsDraft,
        rerenderSettings,
        buildRegexPreview,
    } = ctx;

    if (!state.activeSettings) return { ok: false, reason: 'settings-not-open' };
    const normalizedAction = String(action || '').trim();
    const settingsState = state.activeSettings;
    rememberAssetScope(settingsState, getSillyTavernContext(options.global || globalThis));
    const editTarget = assetEditTarget(normalizedAction);
    const dialogs = ctx.dialogs || createSettingsDialogs({ global: options.global || globalThis });
    if (needsSettingsExternalSpriteDna(normalizedAction, settingsState)
        && !/^char-(?:generate|redraw)-sprite:/.test(normalizedAction)) {
        const dnaPrepared = await prepareSettingsExternalSpriteDna(normalizedAction, { settingsState, options, dialogs,
            resolveTarget: name => spriteAdoptionTarget(settingsState, name),
            isOpen: () => state.activeSettings === settingsState,
            persist: () => persistGeneratedLibrary(persistSettingsDraft),
            startProgress: name => startExpressionProgress(options.global || globalThis, `${name}·补齐 DNA`),
        });
        if (!dnaPrepared.ok) return dnaPrepared.reason === 'dna-cancelled' ? rerenderSettings()
            : generatedOperationFailure(dialogs, options.global || globalThis, dnaPrepared.error, dnaPrepared.reason);
    }
    const risky = riskyActionMessage(normalizedAction, settingsState, editTarget);
    if (risky && typeof dialogs.confirm === 'function' && !(await dialogs.confirm(risky))) return rerenderSettings();
    // 素材批量删除：多选只记在界面状态里；删除时逐个走单条删除动作，别名、DNA、服装、文件夹归属的清理与单删完全一致。
    // 衣柜同一套：单删会把引用它的服装一并解绑。
    const selectMatch = /^asset-(select|pick|pick-all|delete-picked):(scenes|characters|wardrobe)(?::(.*))?$/.exec(normalizedAction);
    if (selectMatch) {
        const [, op, kind, rest = ''] = selectMatch;
        const asyncState = settingsState.asyncState;
        const cur = asyncState.assetSelect && asyncState.assetSelect.kind === kind ? asyncState.assetSelect : null;
        // 列表里本卡与全局混在一起：按合并后的素材算；单条删除动作各自找到条目所在的那一边。
        const merged = (draftEffectiveAssets(settingsState) || {})[kind] || {};
        const library = kind === 'wardrobe'
            ? Object.fromEntries(Object.entries(merged).filter(([name]) => !isBuiltinNudeOutfit(name)))
            : merged;
        if (op === 'select') {
            asyncState.assetSelect = cur ? null : { kind, names: new Set() };
            return rerenderSettings();
        }
        if (!cur) return rerenderSettings();
        if (op === 'pick') {
            const name = decodeSeg(rest);
            if (cur.names.has(name)) cur.names.delete(name); else cur.names.add(name);
            return rerenderSettings();
        }
        if (op === 'pick-all') {
            const all = Object.keys(library);
            cur.names = cur.names.size === all.length ? new Set() : new Set(all);
            return rerenderSettings();
        }
        const names = [...cur.names].filter((name) => Object.prototype.hasOwnProperty.call(library, name));
        if (!names.length) return rerenderSettings();
        const label = { characters: '角色', scenes: '场景', wardrobe: '衣柜提示词' }[kind];
        const note = { characters: '立绘、别名、服装将一并删除。', scenes: '时间、天气背景将一并删除。', wardrobe: '引用这些条目的服装改用同名提示词。' }[kind];
        const preview = names.slice(0, 5).map((name) => `「${name}」`).join('') + (names.length > 5 ? ` 等${names.length}个` : '');
        if (typeof dialogs.confirm === 'function' && !(await dialogs.confirm(`删除${preview}${label}？${note}`))) return rerenderSettings();
        const prefix = { characters: 'scene-remove-char:', scenes: 'scene-remove-bg:', wardrobe: 'wardrobe-remove:' }[kind];
        const quiet = { ...ctx, dialogs: { ...dialogs, confirm: async () => true } };
        for (const name of names) {
            const result = await handleSettingsAction(`${prefix}${encodeURIComponent(name)}`, quiet);
            if (result && result.ok === false) return result;
        }
        asyncState.assetSelect = null;
        return rerenderSettings();
    }
    if (normalizedAction.startsWith('asset-filter:')) {
        const [collection, filter] = normalizedAction.slice('asset-filter:'.length).split(':');
        if (!SCOPED_COLLECTION_KINDS[collection]) return rerenderSettings();
        const filters = settingsState.asyncState.assetScopeFilter = { ...(settingsState.asyncState.assetScopeFilter || {}) };
        filters[collection] = filter === 'card' || filter === 'global' ? filter : 'all';
        return rerenderSettings();
    }
    // 一键下载本区素材：按当前「全部 · 本卡 · 全局」筛选，把列表里的图按目录打成一个 zip。
    if (normalizedAction.startsWith('asset-zip:')) {
        const collection = normalizedAction.slice('asset-zip:'.length);
        if (collection !== 'characters' && collection !== 'scenes') return rerenderSettings();
        return downloadAssetZip(settingsState, collection, options);
    }
    // 一键把本卡的场景 / 角色 / 衣柜提示词全放到全局，或把全局的全收进本卡。角色连同别名、DNA、服装、头像、生成图一起走。
    if (normalizedAction.startsWith('asset-move-all:')) {
        const [collection, dest] = normalizedAction.slice('asset-move-all:'.length).split(':');
        const cardKey = String(settingsState.asyncState.assetScopeKey || '');
        if (!cardKey || !SCOPED_COLLECTION_KINDS[collection] || (dest !== 'card' && dest !== 'global')) return rerenderSettings();
        const root = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        const card = (root.cards && root.cards[cardKey]) || {};
        const inCard = (name) => Object.prototype.hasOwnProperty.call(card[collection] || {}, name);
        const names = dest === 'global'
            ? Object.keys(card[collection] || {})
            : Object.keys(root[collection] || {}).filter((name) => !inCard(name));
        if (!names.length) return rerenderSettings();
        const kind = SCOPED_COLLECTION_KINDS[collection];
        const cardLabel = settingsState.asyncState.assetScopeLabel || '当前角色卡';
        const taken = dest === 'global' ? names.filter((name) => Object.prototype.hasOwnProperty.call(root[collection] || {}, name)) : [];
        const shown = taken.slice(0, 6).join('、') + (taken.length > 6 ? ' 等' : '');
        const message = dest === 'global'
            ? `把角色卡「${cardLabel}」的${names.length}个${kind}全部移至全局？移动后所有角色卡均可使用。`
                + (taken.length ? `\n全局中已有的${taken.length}个同名条目将替换为本卡的版本：${shown}。` : '')
            : `把全局的${names.length}个${kind}全部收进角色卡「${cardLabel}」？移动后其他角色卡将无法使用这些条目。`;
        if (!await dialogs.confirm(message, { okLabel: dest === 'global' ? '全放全局' : '全收本卡' })) return rerenderSettings();
        for (const name of names) moveLibraryEntry(root, dest === 'global' ? cardKey : '', dest === 'global' ? '' : cardKey, collection, name);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }
    // 点条目上的「本卡 / 全局」标签：本卡的挪回全局，全局的收进本卡。挪回全局时全局已有同名的先问。
    if (normalizedAction.startsWith('asset-move:')) {
        const rest = normalizedAction.slice('asset-move:'.length);
        const colon = rest.indexOf(':');
        if (colon < 0) return rerenderSettings();
        const collection = rest.slice(0, colon);
        const name = decodeSeg(rest.slice(colon + 1));
        const cardKey = String(settingsState.asyncState.assetScopeKey || '');
        if (!cardKey) return rerenderSettings();
        const root = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        const owner = assetOwnerKey(root, cardKey, [collection], name);
        if (owner) {
            const taken = Object.prototype.hasOwnProperty.call(root[collection] || {}, name);
            const message = taken
                ? `全局中已有「${name}」。移至全局后将以本卡的版本替换，所有角色卡都会使用该版本。是否继续？`
                : `将「${name}」移至全局？移动后所有角色卡均可使用。`;
            if (!await dialogs.confirm(message, { okLabel: '放到全局' })) return rerenderSettings();
        }
        const moved = moveLibraryEntry(root, owner ? cardKey : '', owner ? '' : cardKey, collection, name);
        if (!moved.ok) return rerenderSettings();
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    // 主界面写在角色卡上的对话框皮肤：清掉后这张卡回到全局「对话框风格」。
    if (normalizedAction === 'card-dialog-skin-clear') {
        if (settingsState.asyncState && settingsState.asyncState.assetScopeKey) delete draftAssetLibrary(settingsState).dialogSkin;
        return rerenderSettings();
    }

    if (normalizedAction === 'asset-card-export') {
        return exportCharacterCardPack(settingsState, options);
    }
    if (normalizedAction === 'asset-card-import') {
        return importCharacterCardPack(settingsState, options, dialogs, persistSettingsDraft, rerenderSettings);
    }
    if (normalizedAction === 'preset-save' || normalizedAction === 'preset-import' || /^preset-(?:apply|overwrite|rename|delete|export):/.test(normalizedAction)) {
        return handlePresetAction(normalizedAction, settingsState, options, dialogs, persistSettingsDraft, rerenderSettings);
    }

    if (normalizedAction.startsWith('legacy-preset-restore:')) {
        const name = decodeSeg(normalizedAction.slice('legacy-preset-restore:'.length));
        const preset = loadLegacyPresets((options.global || globalThis).localStorage)[name];
        if (!preset) return rerenderSettings();
        return importLegacyPreset(settingsState, options, dialogs, persistSettingsDraft, rerenderSettings, preset, name);
    }

    if (normalizedAction.startsWith('settings-reset-section:')) {
        const sectionId = normalizedAction.slice('settings-reset-section:'.length);
        const section = SETTINGS_SECTIONS[sectionId];
        if (!section || typeof ctx.getDefaultSettings !== 'function') return { ok: false, reason: 'unknown-section' };
        if (!await dialogs.confirm(`把「${section.label}」这一区的设置恢复为默认值？`, { okLabel: '重置本区' })) return rerenderSettings();
        const reset = resetSettingsSection(settingsState.draft, sectionId, ctx.getDefaultSettings());
        if (reset.ok === false) return reset;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'copy-page-diagnostic') {
        const mediaStats = await Promise.resolve(options.media?.stats?.()).catch(() => null);
        const text = buildPageDiagnostic(state.activeReader && state.activeReader.snapshot, { version: options.version, worldview: resolveWorldview(draftEffectiveAssets(settingsState)), promptReport: getLastPromptReport(), mediaStats, ttsSkip: getTtsSkipReason(), ttsDecision: getTtsLastDecision() });
        if (!text) {
            if (typeof dialogs.view === 'function') await dialogs.view('请先打开阅读器并翻到出现问题的页面，再从工具栏的「设置」进入并复制。');
            return rerenderSettings();
        }
        const nav = (options.global || globalThis).navigator;
        const copied = nav && nav.clipboard && typeof nav.clipboard.writeText === 'function'
            ? await Promise.resolve(nav.clipboard.writeText(text)).then(() => true, () => false)
            : false;
        if (typeof dialogs.edit === 'function') await dialogs.edit(copied ? '已复制到剪贴板，不含台词正文。' : '复制失败，请手动全选下方内容后复制。', text, { okLabel: '关闭' });
        return rerenderSettings();
    }

    if (normalizedAction === 'fx-prompts-copy-all') {
        const text = fxPromptsCopyText((settingsState.draft && settingsState.draft.readerSettings) || {});
        if (!text) {
            if (typeof dialogs.view === 'function') await dialogs.view('当前没有要发给AI的演出提示词（可能演出功能都关着，或演出提示词开关已关闭）。');
            return rerenderSettings();
        }
        const nav = (options.global || globalThis).navigator;
        const copied = nav && nav.clipboard && typeof nav.clipboard.writeText === 'function'
            ? await Promise.resolve(nav.clipboard.writeText(text)).then(() => true, () => false)
            : false;
        if (typeof dialogs.edit === 'function') await dialogs.edit(copied ? '已复制全部演出提示词到剪贴板，可粘贴到酒馆预设。' : '复制失败，请手动全选下方内容后复制。', text, { okLabel: '关闭' });
        return rerenderSettings();
    }

    if (normalizedAction === 'settings-export-all') {
        return exportAllSettings(settingsState, options);
    }

    if (normalizedAction === 'settings-import-all') {
        return importAllSettings(settingsState, options, dialogs, ctx, persistSettingsDraft, rerenderSettings);
    }

    if (normalizedAction === 'toggle-settings-theme' || normalizedAction.startsWith('set-settings-theme:')) {
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const nextTheme = normalizedAction === 'toggle-settings-theme'
            ? getNextSettingsTheme(bridge.settingsTheme)
            : normalizeSettingsTheme(normalizedAction.slice('set-settings-theme:'.length));
        if (nextTheme === bridge.settingsTheme) return rerenderSettings();
        bridge.settingsTheme = nextTheme;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'close') {
        return closeSettings();
    }

    // 生图页的「打开 CG 库」：先按正常流程关闭设置（保存草稿），再在阅读器里打开 CG 库。
    if (normalizedAction === 'open-cg-gallery') {
        if (typeof options.openCgGallery !== 'function') return { ok: false, reason: 'cg-gallery-unavailable' };
        const closed = closeSettings();
        if (closed && closed.ok === false) return closed;
        const opened = options.openCgGallery();
        const globalObj = options.global || globalThis;
        if (opened && opened.ok === false) pageAlert(dialogs, globalObj, '请先打开阅读器，再查看CG库。');
        return opened;
    }

    if (normalizedAction.startsWith('gen-lib-rename:')) {
        const rest = normalizedAction.slice('gen-lib-rename:'.length);
        const colon = rest.indexOf(':');
        if (colon < 0) return rerenderSettings();
        const type = decodeSeg(rest.slice(0, colon));
        const oldName = decodeSeg(rest.slice(colon + 1));
        if (type !== 'background' && type !== 'sprite') return rerenderSettings();
        const globalObj = options.global || globalThis;
        const newName = ((await dialogs.prompt(`生成素材「${oldName}」的新名称：`, oldName)) || '').trim();
        if (!newName || newName === oldName) return rerenderSettings();
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        const previousLibrary = normalizeGeneratedLibrary(sceneAssets.generated);
        const result = renameGeneratedLibraryEntry(sceneAssets.generated, type, oldName, newName);
        if (!result.ok) {
            pageAlert(dialogs, globalObj, result.reason === 'name-exists' ? `生成素材「${newName}」已存在。` : '生成素材改名失败。');
            return rerenderSettings();
        }
        sceneAssets.generated = result.library;
        const persisted = persistGeneratedLibrary(persistSettingsDraft);
        if (operationFailed(persisted)) {
            if (!restoreGeneratedLibrary(sceneAssets, previousLibrary, persistSettingsDraft)) {
                return generatedOperationFailure(dialogs, globalObj, '生成素材改名失败，且无法恢复原设置。', 'generated-asset-rename-rollback-failed');
            }
            return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('gen-lib-remove:')) {
        const rest = normalizedAction.slice('gen-lib-remove:'.length);
        const colon = rest.indexOf(':');
        if (colon < 0) return rerenderSettings();
        const type = decodeSeg(rest.slice(0, colon));
        const name = decodeSeg(rest.slice(colon + 1));
        if (type !== 'background' && type !== 'sprite') return rerenderSettings();
        const globalObj = options.global || globalThis;
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        const library = normalizeGeneratedLibrary(sceneAssets.generated);
        const previousLibrary = library;
        const bucket = type === 'background' ? library.scenes : library.characters;
        if (!Object.prototype.hasOwnProperty.call(bucket, name)) return rerenderSettings();
        const confirmed = await dialogs.confirm(`删除生成素材「${name}」及其图片？`);
        if (!confirmed) return rerenderSettings();
        const result = removeGeneratedLibraryEntry(library, type, name);
        sceneAssets.generated = result.library;
        const persisted = persistGeneratedLibrary(persistSettingsDraft);
        if (operationFailed(persisted)) {
            if (!restoreGeneratedLibrary(sceneAssets, previousLibrary, persistSettingsDraft)) {
                return generatedOperationFailure(dialogs, globalObj, '删除生成素材失败，且无法恢复原设置。', 'generated-asset-remove-rollback-failed');
            }
            return persisted;
        }
        const service = options.generatedAssets;
        if (service && typeof service.deleteImages === 'function') {
            try {
                const deleted = await service.deleteImages(unreferencedGeneratedImageIds(result.imageIds, settingsState.draft.bridge.sceneAssets, globalObj.localStorage));
                if (operationFailed(deleted)) {
                    if (!restoreGeneratedLibrary(sceneAssets, previousLibrary, persistSettingsDraft)) {
                        return generatedOperationFailure(dialogs, globalObj, '删除生成素材失败，且无法恢复原设置。', 'generated-asset-remove-rollback-failed');
                    }
                    return generatedOperationFailure(dialogs, globalObj, '生成素材图片删除失败，已恢复素材库记录。', 'generated-asset-remove-images-failed');
                }
            } catch (error) {
                if (!restoreGeneratedLibrary(sceneAssets, previousLibrary, persistSettingsDraft)) {
                    return generatedOperationFailure(dialogs, globalObj, '删除生成素材失败，且无法恢复原设置。', 'generated-asset-remove-rollback-failed');
                }
                return generatedOperationFailure(dialogs, globalObj, '生成素材图片删除失败，已恢复素材库记录。', 'generated-asset-remove-images-failed');
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction === 'gen-records-retry' || normalizedAction.startsWith('gen-temp-page:')) {
        const service = options.generatedAssets;
        try {
            settingsState.asyncState.genRecordsError = '';
            if (normalizedAction === 'gen-records-retry') {
                const results = await Promise.allSettled([service?.retryMetadata?.(), options.itemImages?.retryMetadata?.()]);
                if (results.some(result => result.status === 'rejected' || result.value?.ok === false)) throw new Error('asset-record-read-failed');
            } else if (service?.changeTempPage) {
                await service.changeTempPage(normalizedAction.slice('gen-temp-page:'.length));
            }
        } catch (error) { settingsState.asyncState.genRecordsError = error.message || '素材记录读取失败'; }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('gen-temp-accept:')) {
        const key = decodeSeg(normalizedAction.slice('gen-temp-accept:'.length));
        const service = options.generatedAssets;
        if (!service || typeof service.readRecord !== 'function' || typeof service.setStatus !== 'function') {
            return { ok: false, reason: 'generated-assets-unavailable' };
        }
        let record;
        try { record = await service.readRecord(key); }
        catch (error) {
            settingsState.asyncState.genRecordsError = error.message || '素材记录读取失败';
            return rerenderSettings();
        }
        if (!record || !record.imageId) return rerenderSettings();
        record = cloneData(record);
        const sourceScope = String(settingsState.asyncState?.assetScopeKey || '');
        const globalObj = options.global || globalThis;
        const suggestedName = String(record.name || '').trim();
        const requestedName = ctx.dialogs || typeof globalObj.prompt === 'function'
            ? await dialogs.prompt(`生成素材「${suggestedName}」的入库名称：`, suggestedName)
            : suggestedName;
        const name = String(requestedName == null ? '' : requestedName).trim();
        if (!name) return rerenderSettings();
        const target = record.type === 'sprite' ? spriteAdoptionTarget(settingsState, name) : null;
        if (target?.borrowed) return generatedOperationFailure(dialogs, globalObj,
            '角色资料来自其他角色卡，请先复制到当前卡后再采用。', 'DNA_ADOPTION_SCOPE');
        let sourceLibrary = target?.library;
        const receipt = { imageId: record.imageId, status: record.status,
            ...(record.updatedAt !== undefined && { updatedAt: record.updatedAt }) };
        const recordUnchanged = () => {
            const live = service.getRecord(key);
            return live?.imageId === receipt.imageId && live?.status === receipt.status
                && live?.updatedAt === record.updatedAt;
        };
        const targetUnchanged = () => {
            if (String(settingsState.asyncState?.assetScopeKey || '') !== sourceScope) return false;
            if (!target) return true;
            const live = spriteAdoptionTarget(settingsState, name);
            if (live.scope !== target.scope || live.borrowed) return false;
            sourceLibrary = live.library;
            return true;
        };
        if (!recordUnchanged() || !targetUnchanged()) return generatedOperationFailure(dialogs, globalObj,
            '正在重新读取图片及目标资料。', 'DNA_ADOPTION_CONFLICT');
        if (record.type === 'sprite') {
            const authoritative = await readSpriteAdoptionRecord(service, record.imageId, record);
            if (!authoritative.ok) return generatedOperationFailure(dialogs, globalObj, authoritative.error, authoritative.reason);
            if (!recordUnchanged() || !targetUnchanged()) return generatedOperationFailure(dialogs, globalObj,
                '正在重新读取图片及目标资料。', 'DNA_ADOPTION_CONFLICT');
            record = authoritative.record;
        }
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        let sceneAssets = target ? sourceLibrary || {} : draftAssetLibrary(settingsState, editTarget);
        let previousLibrary = null;
        let previousScenes = null;
        let previousCharacters = null;
        let previousAliases = null;
        let previousIdentity = null;
        if (record.type === 'background') {
            previousScenes = cloneData(sceneAssets.scenes || {});
            const bound = bindGeneratedBackground(sceneAssets, record, name);
            if (!bound.ok) return rerenderSettings();
            sceneAssets.scenes = bound.scenes;
            const persisted = persistGeneratedLibrary(persistSettingsDraft, { spriteAssetChanged: record.type === 'sprite' });
            if (operationFailed(persisted)) {
                sceneAssets.scenes = previousScenes;
                // 仅保存适配器明确保证未尝试写入时跳过持久化补偿；未知失败仍须恢复保存。
                if (persisted?.writeAttempted === false) return persisted;
                const rolled = persistGeneratedLibrary(persistSettingsDraft, { spriteAssetChanged: record.type === 'sprite' });
                if (operationFailed(rolled)) {
                    return generatedAdoptionRollbackFailure(dialogs, globalObj, '场景素材入库失败，且无法恢复原设置。', persisted);
                }
                return persisted;
            }
        } else {
            previousCharacters = cloneData(sceneAssets.characters || {});
            previousAliases = cloneData(sceneAssets.characterAliases || {});
            previousIdentity = captureAdoptionFields(sceneAssets,
                ['characters', 'characterAliases', 'characterDna', 'characterOutfits', 'wardrobe', 'characterDefaultOutfits', 'characterSeeds'],
                { clone: true });
            const bound = bindGeneratedSprite(sceneAssets, target?.name || name, `igs-gen:${record.imageId}`, { replace: true });
            if (!bound.ok) return rerenderSettings();
            const sourceName = record.identityContext?.[0]?.characterKey || record.name;
            if (hasSpriteAdoptionEvidence(record)) {
                const sourceTarget = spriteAdoptionTarget(settingsState, sourceName);
                if (sourceTarget.name !== bound.name || sourceTarget.owner !== target.owner)
                    return generatedOperationFailure(dialogs, globalObj, '候选身份与目标角色不匹配，原资料保持不变。', 'DNA_TEMPLATE_BINDING');
            }
            const adoption = prepareSpriteIdentityAdoption(sceneAssets, bound.name, record.imageId, record,
                { sourceName, hadDefault: Boolean(previousCharacters[bound.name]?.['默认']),
                    ...outfitAdoptionReadOptions(settingsState, target) });
            if (!adoption.ok) return generatedAdoptionFailure(dialogs, globalObj, adoption);
            if (target && !sourceLibrary) sceneAssets = ensureCardLibrary(bridge.sceneAssets, target.owner);
            const recoveredOutfit = !adoption.outfitName && record.outfitName
                && sceneAssets.characterOutfits?.[bound.name]?.[record.outfitName];
            sceneAssets.characters = adoption.outfitName || recoveredOutfit
                ? { ...sceneAssets.characters, [bound.name]: { ...sceneAssets.characters?.[bound.name] } }
                : bound.characters;
            sceneAssets.characterAliases = bound.characterAliases;
            Object.assign(sceneAssets, adoption.patch);
            if (recoveredOutfit) {
                const all = sceneAssets.characterOutfits;
                sceneAssets.characterOutfits = { ...all, [bound.name]: { ...all[bound.name],
                    [record.outfitName]: setOutfitSprite(recoveredOutfit, '平和', `igs-gen:${record.imageId}`) } };
            }
            Object.assign(sceneAssets, adoptCharacterSeed(sceneAssets, bound.name, record.seed));
            const persisted = persistGeneratedLibrary(persistSettingsDraft, { spriteAssetChanged: record.type === 'sprite' });
            if (operationFailed(persisted)) {
                sceneAssets.characters = previousCharacters;
                sceneAssets.characterAliases = previousAliases;
                restoreAdoptionFields(sceneAssets, previousIdentity);
                if (persisted?.writeAttempted === false) return persisted;
                const rolled = persistGeneratedLibrary(persistSettingsDraft, { spriteAssetChanged: record.type === 'sprite' });
                if (operationFailed(rolled)) {
                    return generatedAdoptionRollbackFailure(dialogs, globalObj, '角色立绘入库失败，且无法恢复原设置。', persisted);
                }
                return persisted;
            }
        }
        let status;
        try {
            status = await service.setStatus(key, 'library', receipt);
        } catch (error) {
            status = { ok: false, reason: 'generated-asset-status-failed' };
        }
        if (operationFailed(status)) {
            if (previousScenes) {
                sceneAssets.scenes = previousScenes;
                const rolled = persistGeneratedLibrary(persistSettingsDraft, { spriteAssetChanged: record.type === 'sprite' });
                if (operationFailed(rolled)) {
                    return generatedAdoptionRollbackFailure(dialogs, options.global || globalThis, '场景素材入库失败，且无法恢复原设置。', status);
                }
            } else if (previousCharacters) {
                sceneAssets.characters = previousCharacters;
                sceneAssets.characterAliases = previousAliases;
                restoreAdoptionFields(sceneAssets, previousIdentity);
                const rolled = persistGeneratedLibrary(persistSettingsDraft, { spriteAssetChanged: record.type === 'sprite' });
                if (operationFailed(rolled)) {
                    return generatedAdoptionRollbackFailure(dialogs, options.global || globalThis, '角色立绘入库失败，且无法恢复原设置。', status);
                }
            } else if (!restoreGeneratedLibrary(sceneAssets, previousLibrary, persistSettingsDraft)) {
                return generatedAdoptionRollbackFailure(dialogs, options.global || globalThis, '生成素材入库失败，且无法恢复原设置。', status);
            }
            return status;
        }
        return rerenderSettings();
    }

    // 打开遮罩修复编辑器：由宿主注入 openMatteEditor，未注入时明确失败，不静默无响应。
    if (normalizedAction.startsWith('gen-matte-edit:')) {
        const imageId = decodeSeg(normalizedAction.slice('gen-matte-edit:'.length));
        const globalObj = options.global || globalThis;
        if (!imageId || typeof options.openMatteEditor !== 'function') {
            return generatedOperationFailure(dialogs, globalObj, '抠图修复编辑器当前不可用。', 'matte-editor-unavailable');
        }
        try { return await options.openMatteEditor(imageId); }
        catch (error) { return generatedOperationFailure(dialogs, globalObj, '打开抠图修复编辑器失败。', 'matte-editor-open-failed'); }
    }

    if (normalizedAction.startsWith('gen-asset-prompt:')) {
        const imageId = decodeSeg(normalizedAction.slice('gen-asset-prompt:'.length));
        const globalObj = options.global || globalThis;
        const service = options.generatedAssets;
        if (!imageId || !service || typeof service.getImagePrompt !== 'function') {
            return generatedOperationFailure(dialogs, globalObj, '找不到这份素材的生图提示词。', 'generated-asset-prompt-unavailable');
        }
        let prompt = null;
        try {
            prompt = await service.getImagePrompt(imageId);
        } catch (error) {
            prompt = null;
        }
        const text = formatStoredPrompt(prompt) || '这条素材没有保存生图提示词。';
        if (typeof dialogs.view === 'function') await dialogs.view(text);
        else pageAlert(dialogs, globalObj, text);
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('gen-file-scene:')) {
        const name = decodeSeg(normalizedAction.slice('gen-file-scene:'.length));
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        const library = normalizeGeneratedLibrary(sceneAssets.generated);
        const entry = library.scenes[name];
        if (!entry) return rerenderSettings();
        const imageId = generatedAssetIdOf(entry.url);
        if (!imageId) return rerenderSettings();
        const bound = bindGeneratedBackground(sceneAssets, { ...entry, imageId, name }, name);
        if (!bound.ok) return rerenderSettings();
        const scenes = bound.scenes;
        const scene = scenes[name] && typeof scenes[name] === 'object' ? scenes[name] : { url: '', times: {} };
        scene.url = `igs-gen:${imageId}`;
        scenes[name] = scene;
        sceneAssets.scenes = scenes;
        delete library.scenes[name];
        sceneAssets.generated = library;
        const persisted = persistGeneratedLibrary(persistSettingsDraft);
        if (operationFailed(persisted)) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('gen-adopt-sprite:')) {
        const name = decodeSeg(normalizedAction.slice('gen-adopt-sprite:'.length));
        const globalObj = options.global || globalThis;
        const draft = settingsState.draft;
        const root = draft.bridge.sceneAssets;
        const scope = String(settingsState.asyncState?.assetScopeKey || '');
        const sourceOwner = assetOwnerKey(root, scope, ['generated.characters'], name);
        let source = sourceOwner ? root?.cards?.[sourceOwner] : root;
        const sourceEntry = source?.generated?.characters?.[name];
        const url = sourceEntry?.['默认'];
        const target = spriteAdoptionTarget(settingsState, name);
        const invalid = reason => generatedOperationFailure(dialogs, globalObj,
            '正在自动恢复图片及角色资料。', reason);
        if (!name || ['__proto__', 'constructor', 'prototype'].includes(target.name)
            || !isGeneratedAssetUrl(url) || target.borrowed) return invalid('generated-sprite-adopt-failed');
        if (sourceOwner && sourceOwner !== target.scope) return invalid('OUTFIT_ADOPTION_CONFLICT');
        let destinationLibrary = target.library;
        const current = () => {
            if (state.activeSettings !== settingsState || settingsState.draft !== draft
                || String(settingsState.asyncState?.assetScopeKey || '') !== target.scope) return false;
            const live = spriteAdoptionTarget(settingsState, name);
            const liveRoot = draft.bridge.sceneAssets;
            const liveSource = sourceOwner ? liveRoot.cards?.[sourceOwner] : liveRoot;
            if (live.name !== target.name || live.owner !== target.owner || live.borrowed
                || assetOwnerKey(liveRoot, scope, ['generated.characters'], name) !== sourceOwner
                || liveSource?.generated?.characters?.[name]?.默认 !== url) return false;
            source = liveSource;
            destinationLibrary = live.library;
            return true;
        };
        const answer = await dialogs.prompt(`把「${target.name}」的立绘放入新命名衣装（不会自动设为默认）：`, '');
        if (answer == null || !String(answer).trim()) return { ok: false, reason: 'cancelled' };
        if (!current()) return invalid('OUTFIT_ADOPTION_CONFLICT');
        const outfitName = String(answer).trim();
        if (!isValidOutfitName(outfitName)
            || Object.hasOwn(target.library?.characterOutfits?.[target.name] || {}, outfitName))
            return invalid('outfit-name-invalid');
        let image;
        const readImage = options.generatedAssets?.readStoredImage?.bind(options.generatedAssets);
        const candidate = { words: [], moods: { 平和: url } };
        const availability = await inspectOutfitImages(candidate, { global: globalObj,
            readStoredImage: readImage && (async id => (image = structuredClone(await readImage(id)))) });
        if (!current()) return invalid('OUTFIT_ADOPTION_CONFLICT');
        const picked = pickOutfitSprite(candidate, '平和', {}, availability, true);
        if (!picked.ok || !picked.verified) return invalid(picked.reason || 'outfit-image-read-error');
        // 解码等待期间图片也可能被替换；提交前回读同一权威版本，不使用内存旧图补证。
        const imageBaseline = JSON.stringify(image);
        let latest;
        try { latest = await readImage(generatedAssetIdOf(url)); }
        catch { return invalid('outfit-image-read-error'); }
        if (!current() || JSON.stringify(latest) !== imageBaseline) return invalid('OUTFIT_ADOPTION_CONFLICT');
        if (Object.hasOwn(destinationLibrary?.characterOutfits?.[target.name] || {}, outfitName))
            return invalid('outfit-name-exists');
        const destination = destinationLibrary || {};
        const beforeCards = captureAdoptionFields(root, ['cards']);
        const fields = ['characters', 'characterAliases', 'characterOutfits', 'generated'];
        const before = captureAdoptionFields(destination, fields, { clone: true });
        const sourceBefore = source === destination ? null : captureAdoptionFields(source, ['generated'], { clone: true });
        destination.characters = { ...destination.characters, [target.name]: { ...destination.characters?.[target.name] } };
        destination.characterAliases = { ...destination.characterAliases,
            [target.name]: [...new Set([...(destination.characterAliases?.[target.name] || []),
                ...(source.generated?.characterAliases?.[name] || []), ...(name === target.name ? [] : [name])])]
                .filter(alias => alias !== target.name) };
        destination.characterOutfits = { ...destination.characterOutfits,
            [target.name]: { ...destination.characterOutfits?.[target.name], [outfitName]: candidate } };
        if (!destinationLibrary) root.cards = { ...root.cards, [target.owner]: destination };
        // 入库不删除旧图槽；新衣装持有图片，旧图库及其余表情仍保持可回读。
        const persisted = persistGeneratedLibrary(persistSettingsDraft, { spriteAssetChanged: true });
        if (!persisted || operationFailed(persisted)) {
            restoreAdoptionFields(destination, before);
            if (sourceBefore) restoreAdoptionFields(source, sourceBefore);
            if (!destinationLibrary) restoreAdoptionFields(root, beforeCards);
            if (persisted?.writeAttempted !== false && !persisted?.rollbackFailed) {
                const rolled = persistGeneratedLibrary(persistSettingsDraft, { spriteAssetChanged: true });
                if (!rolled || operationFailed(rolled)) return generatedAdoptionRollbackFailure(dialogs, globalObj,
                    '衣装入库失败，且无法恢复原设置。', persisted);
            }
            return persisted || { ok: false, reason: 'save-failed' };
        }
        const boundMessage = `已放入「${target.name}」的「${outfitName}」衣装；默认选择保持不变。`;
        if (globalObj.toastr && typeof globalObj.toastr.success === 'function') globalObj.toastr.success(boundMessage, 'IGS');
        return rerenderSettings();
    }

    if (/^(?:char|outfit)-expression-prompt:/.test(normalizedAction)) {
        const outfitMode = normalizedAction.startsWith('outfit-expression-prompt:');
        const prefix = outfitMode ? 'outfit-expression-prompt:' : 'char-expression-prompt:';
        const parts = normalizedAction.slice(prefix.length).split(':').map(decodeSeg);
        const name = parts[0] || '';
        const outfitName = outfitMode ? (parts[1] || '') : '';
        const mood = parts[outfitMode ? 2 : 1] || '';
        const globalObj = options.global || globalThis;
        const service = options.generatedAssets;
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        const character = (sceneAssets.characters || {})[name];
        const outfitEntry = outfitMode ? (((sceneAssets.characterOutfits || {})[name] || {})[outfitName]) : null;
        if (!name || !mood || !character || (outfitMode && !outfitEntry)) return rerenderSettings();
        if (typeof dialogs.edit !== 'function') {
            return generatedOperationFailure(dialogs, globalObj, '提示词编辑当前不可用。', 'expression-prompt-unavailable');
        }
        const slotUrl = outfitMode ? String(outfitSpriteSlots(outfitEntry)[mood] || '') : String(character[mood] || '');
        const imageId = generatedAssetIdOf(slotUrl);
        const library = normalizeGeneratedLibrary(sceneAssets.generated);
        const note = (library.expressionNotes[expressionNoteKey(name, outfitName)] || {})[mood];
        let prompt = null;
        if (imageId && service && typeof service.getImagePrompt === 'function') {
            try { prompt = await service.getImagePrompt(imageId); } catch (error) { prompt = null; }
        }
        if (!prompt && note) prompt = normalizeStoredPrompt(note);
        const text = formatEditablePrompt(prompt);
        if (!text) return generatedOperationFailure(dialogs, globalObj, '这张立绘没有保存提示词。', 'expression-prompt-missing');
        const edited = await dialogs.edit('这张立绘的提示词', text);
        if (edited == null) return rerenderSettings();
        const next = parseEditablePrompt(edited);
        if (!next) return generatedOperationFailure(dialogs, globalObj, '提示词是空的。', 'expression-prompt-empty');
        if (imageId && service && typeof service.saveImagePrompt === 'function') {
            let saved;
            try { saved = await service.saveImagePrompt(imageId, next, prompt.revision); }
            catch (error) { saved = { ok: false, error: '提示词没存上。' }; }
            if (!saved || !saved.ok) {
                return generatedOperationFailure(dialogs, globalObj, (saved && saved.error) || '提示词没存上。', 'expression-prompt-save-failed');
            }
        } else {
            const noted = setGeneratedExpressionNote(library, expressionNoteKey(name, outfitName), mood, {
                ...prompt, captionMode: 'final', edited: true,
                positive: next.positive,
                negative: next.negative,
                error: (note && note.error) || '',
                caption: next.caption,
            });
            if (!noted.ok) return generatedOperationFailure(dialogs, globalObj, '提示词没存上。', 'expression-prompt-save-failed');
            sceneAssets.generated = noted.library;
            const persisted = persistGeneratedLibrary(persistSettingsDraft);
            if (operationFailed(persisted)) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('gen-expression-prompt:')) {
        const rest = normalizedAction.slice('gen-expression-prompt:'.length);
        const colon = rest.indexOf(':');
        const name = decodeSeg(colon < 0 ? rest : rest.slice(0, colon));
        const mood = decodeSeg(colon < 0 ? '' : rest.slice(colon + 1));
        const globalObj = options.global || globalThis;
        const bridge = settingsState.draft.bridge || {};
        const note = (((bridge.sceneAssets || {}).generated || {}).expressionNotes || {})[name];
        const item = note && note[mood];
        const text = formatStoredPrompt(item) || '这条表情没有保存生图提示词。';
        if (typeof dialogs.view === 'function') await dialogs.view(text);
        else pageAlert(dialogs, globalObj, text);
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-variant-set:') || normalizedAction.startsWith('scene-variant-retry:')) {
        const single = normalizedAction.startsWith('scene-variant-retry:');
        const parts = normalizedAction.slice(single ? 'scene-variant-retry:'.length : 'scene-variant-set:'.length).split(':').map(decodeSeg);
        const sceneName = parts[0] || '';
        const globalObj = options.global || globalThis;
        const service = options.generatedAssets;
        const sceneObj = (draftAssetLibrary(settingsState, editTarget).scenes || {})[sceneName];
        const baseImageId = sceneObj && typeof sceneObj === 'object' ? generatedAssetIdOf(sceneObj.url) : '';
        if (!baseImageId) return rerenderSettings();
        if (!service || typeof service.generateSceneVariants !== 'function') {
            return generationFailure(globalObj, dialogs, '场景差分当前不可用。', 'scene-variant-unavailable');
        }
        let variants;
        if (single) {
            variants = [{ time: parts[1] || '', weather: parts[2] || '' }];
        } else {
            const times = sceneObj.times && typeof sceneObj.times === 'object' ? sceneObj.times : {};
            const groups = ensureTimeGroups(settingsState).map((g) => g && g.label).filter(Boolean);
            const labels = groups.length ? groups : ['清晨', '白天', '黄昏', '夜晚'];
            const missing = labels.filter((label) => !String((times[label] && times[label].url) || '').trim());
            const message = `按「${sceneName}」的提示词生成时间/天气差分，每行一张，不重新编写提示词，直接出图。\n仅时间：「夜晚」；含天气：「夜晚·雨」。如有不需要的行，请删除。`;
            const raw = typeof dialogs.edit === 'function'
                ? await dialogs.edit(message, missing.join('\n'), { okLabel: '开始生成', cancelLabel: '取消' })
                : await dialogs.prompt(message, missing.join('\n'));
            if (raw == null) return rerenderSettings();
            const seen = new Set();
            variants = String(raw).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
                const [time = '', weather = ''] = line.split(/\s*[·・/|]\s*/).map((item) => item.trim());
                return { time, weather };
            }).filter((item) => {
                const key = `${item.time}|${item.weather}`;
                if (!item.time || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            if (!variants.length) return rerenderSettings();
        }
        const progress = startExpressionProgress(globalObj, `${sceneName}·时间天气`);
        let result;
        try {
            result = await service.generateSceneVariants({ baseImageId, scene: sceneName, variants, onProgress: progress.onProgress });
        } catch (error) {
            result = { ok: false, error: errorText(error, '出图失败') };
        }
        const done = result && Array.isArray(result.items) ? result.items.filter((item) => item.ok && item.imageId) : [];
        if (done.length) {
            const live = (draftAssetLibrary(settingsState, editTarget).scenes || {})[sceneName];
            if (live && typeof live === 'object') {
                const previousScene = cloneData(live);
                if (!isImageSeed(live.seed) && isImageSeed(done[0].seed)) live.seed = done[0].seed;
                live.times = live.times && typeof live.times === 'object' ? live.times : {};
                const timeGroups = ensureTimeGroups(settingsState);
                const weatherGroups = ensureWeatherGroups(settingsState);
                for (const item of done) {
                    const url = `igs-gen:${item.imageId}`;
                    const slot = live.times[item.time];
                    const timeEntry = slot && typeof slot === 'object' ? slot : { url: typeof slot === 'string' ? slot : '', weathers: {} };
                    timeEntry.weathers = timeEntry.weathers && typeof timeEntry.weathers === 'object' ? timeEntry.weathers : {};
                    if (item.weather) timeEntry.weathers[item.weather] = { ...(typeof timeEntry.weathers[item.weather] === 'object' ? timeEntry.weathers[item.weather] : {}), url };
                    else timeEntry.url = url;
                    live.times[item.time] = timeEntry;
                    if (!timeGroups.some((g) => g.label === item.time)) timeGroups.push({ label: item.time, words: [item.time] });
                    if (item.weather && !weatherGroups.some((g) => g.label === item.weather)) weatherGroups.push({ label: item.weather, words: [item.weather] });
                }
                const persisted = persistGeneratedLibrary(persistSettingsDraft);
                if (operationFailed(persisted)) {
                    draftAssetLibrary(settingsState, editTarget).scenes[sceneName] = previousScene;
                    progress.end();
                    return persisted;
                }
            }
        }
        const rendered = await rerenderSettings();
        progress.end();
        const failed = result && Array.isArray(result.items) ? result.items.filter((item) => !item.ok) : [];
        if (!done.length) {
            return generationFailure(globalObj, dialogs, `「${sceneName}」的时间/天气差分未能生成：${errorText(result && (result.error || (failed[0] && failed[0].error)), '未返回原因')}`, 'scene-variant-failed');
        }
        showGeneratedNotice(globalObj, failed.length
            ? `「${sceneName}」画好${done.length}张，${failed.length}张失败：${failed[0].error}`
            : `「${sceneName}」的时间/天气差分已更新（${done.length}张）。`, failed.length ? '' : 'info');
        return rendered;
    }

    if (/^char-(?:generate|redraw)-sprite:/.test(normalizedAction)) {
        const legacyRedraw = normalizedAction.startsWith('char-redraw-sprite:');
        const prefix = legacyRedraw ? 'char-redraw-sprite:' : 'char-generate-sprite:';
        const target = spriteAdoptionTarget(settingsState, decodeSeg(normalizedAction.slice(prefix.length)));
        const name = target.name;
        const globalObj = options.global || globalThis;
        const service = options.generatedAssets;
        if (target.borrowed) return generatedOperationFailure(dialogs, globalObj,
            '角色资料来自其他角色卡，请先复制到当前卡后再生成采用。', 'DNA_ADOPTION_SCOPE');
        let sceneAssets = target.library || {};
        const character = (sceneAssets.characters || {})[name];
        let dna = characterExpressionDna(sceneAssets, name);
        let sourceDna = normalizeCharacterDna(dna);
        const sourceScope = String(settingsState.asyncState?.assetScopeKey || '');
        if (!name || (!character && !dna)) return rerenderSettings();
        if (!service || typeof service.generateCharacterSprite !== 'function') {
            return generationFailure(globalObj, dialogs, '立绘生成当前不可用。', 'sprite-generate-unavailable');
        }
        const savedSpriteNotes = sceneAssets.characterSpriteNotes && typeof sceneAssets.characterSpriteNotes === 'object' ? sceneAssets.characterSpriteNotes : {};
        const selected = readDefaultOutfit(sceneAssets, name);
        const picked = selected.ok ? pickOutfitSprite(selected.entry, '平和', sceneAssets, undefined, true) : null;
        const current = picked?.ok && !legacyRedraw ? picked.url
            : (legacyRedraw || selected.reason === 'default-outfit-unset') ? String(character?.['默认'] || '').trim() : '';
        let paintingOutfit = !legacyRedraw && selected.ok ? selected.outfitName : '';
        const targetUnchanged = () => {
            if (String(settingsState.asyncState?.assetScopeKey || '') !== sourceScope) return false;
            sceneAssets = spriteAdoptionTarget(settingsState, name).library || sceneAssets;
            return true;
        };
        // 重画读取原图定稿；读取失败不退化为一次新的写词或付费绘图。
        let redrawCaption = null;
        let redrawExact = false;
        let redrawMeta;
        let redrawHistory;
        const currentId = generatedAssetIdOf(current);
        if (currentId && typeof service.getImagePrompt === 'function') {
            try {
                const saved = await service.getImagePrompt(currentId);
                if (saved && saved.caption) redrawCaption = saved.caption;
                else if (saved && (saved.positive || saved.negative)) {
                    const parsed = parseEditablePrompt([
                        saved.positive ? `scene: ${saved.positive}` : '',
                        saved.negative ? `scene_uc: ${saved.negative}` : '',
                    ].filter(Boolean).join('\n'));
                    redrawCaption = (parsed && parsed.caption) || null;
                }
                redrawExact = Boolean(redrawCaption && saved && saved.edited === true);
                redrawMeta = saved?.characterMeta;
                redrawHistory = saved;
            } catch (error) { redrawCaption = null; }
        }
        const needsViews = characterDnaNeedsViews(sourceDna) && service.usesCharacterTemplates?.(sourceDna) !== false;
        if (needsViews) { redrawCaption = null; redrawExact = false; redrawHistory = undefined; redrawMeta = undefined; }
        let spriteNote = savedSpriteNotes[name] || '';
        if (!redrawCaption) {
            spriteNote = await askSpriteNote(dialogs, name, savedSpriteNotes[name]);
            if (spriteNote === null) return rerenderSettings();
            const prepareDna = needsSettingsExternalSpriteDna(normalizedAction, settingsState)
                && spriteDnaPreparationState(sourceDna).needed;
            const confirmed = prepareDna || await dialogs.confirm(needsViews
                ? `为「${name}」补齐三景别 DNA 并生成立绘，成功采用前保留原图。` : current
                ? `重新生成「${name}」的默认立绘，当前这张将被替换。`
                : `生成「${name}」的默认立绘：将先编写提示词，再生成一张图。`);
            if (!confirmed) return rerenderSettings();
        }
        if (!targetUnchanged()) return generatedOperationFailure(dialogs, globalObj,
            '角色、衣装或资料作用域已变化，未启动生成。', 'DNA_ADOPTION_CONFLICT');
        if (needsSettingsExternalSpriteDna(normalizedAction, settingsState)) {
            const prepared = await prepareSettingsExternalSpriteDna(normalizedAction, { settingsState, options, dialogs,
                resolveTarget: requested => spriteAdoptionTarget(settingsState, requested),
                isOpen: () => state.activeSettings === settingsState, note: spriteNote,
                persist: () => persistGeneratedLibrary(persistSettingsDraft),
                startProgress: who => startExpressionProgress(globalObj, `${who}·补齐 DNA`),
            });
            if (!prepared.ok) return prepared.reason === 'dna-cancelled' ? rerenderSettings()
                : generatedOperationFailure(dialogs, globalObj, prepared.error, prepared.reason);
            dna = characterExpressionDna(sceneAssets, name);
            sourceDna = normalizeCharacterDna(dna);
        }
        const progress = startExpressionProgress(globalObj, `${name}·默认立绘`);
        let result;
        const failed = (error) => {
            progress.end();
            return generationFailure(globalObj, dialogs, `「${name}」的默认立绘未能生成：${errorText(error, '未返回原因')}${current ? '\n原有图片保持不变。' : ''}`, 'sprite-generate-failed');
        };
        const onOutfitDna = async clothing => {
            if (!targetUnchanged()) return { ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT', error: '目标已变化，未保存服装 DNA' };
            const prepared = prepareOutfitDnaSave(sceneAssets, name, clothing.name, clothing.description,
                { readWardrobe: outfitAdoptionReadOptions(settingsState, target).readWardrobe,
                    descriptionHalfBody: clothing.descriptionHalfBody });
            if (!prepared.ok) return prepared;
            const previous = captureAdoptionFields(sceneAssets, ['characterOutfits', 'wardrobe']);
            Object.assign(sceneAssets, prepared.patch);
            const previousOutfit = paintingOutfit;
            paintingOutfit = clothing.name;
            const persisted = persistGeneratedLibrary(persistSettingsDraft);
            if (operationFailed(persisted)) {
                restoreAdoptionFields(sceneAssets, previous);
                paintingOutfit = previousOutfit;
                return { ok: false, reason: 'outfit-dna-save-failed', error: '服装 DNA 保存失败，未发起绘图' };
            }
            targetUnchanged();
            return { ok: true };
        };
        try {
            result = await service.generateCharacterSprite({ name, dna, note: spriteNote, caption: redrawCaption,
                characterMeta: redrawMeta, exact: redrawExact, onProgress: progress.onProgress, shouldStart: targetUnchanged,
                onOutfitDna,
                ...(redrawHistory && { history: redrawHistory, ...(redrawHistory.promptRecipe && { promptRecipe: redrawHistory.promptRecipe }) }) });
        } catch (error) {
            return failed(error);
        }
        if (!result || !result.ok || !result.imageId) return failed(result && result.error);
        if (!targetUnchanged()) {
            return failed('正在自动续接原生成任务');
        }
        const authoritative = await readSpriteAdoptionRecord(service, result.imageId, result);
        if (!authoritative.ok) return failed(authoritative.error);
        if (!targetUnchanged()) return failed('正在自动续接图片读取及保存');
        result = authoritative.record;
        const namedRedraw = !legacyRedraw && selected.ok && picked?.ok;
        if (namedRedraw) {
            const stored = await service.readStoredImage?.(result.imageId);
            if (!stored?.dataUrl || stored.id !== result.imageId || stored.type !== 'sprite')
                return failed('重画图片尚未读取完成');
            targetUnchanged();
        }
        const liveAssets = sceneAssets;
        const previousAdoption = captureAdoptionFields(liveAssets, ['characters', 'characterAliases',
            'characterDna', 'characterOutfits', 'wardrobe', 'characterDefaultOutfits', 'characterSpriteNotes', 'characterSeeds']);
        const adoption = legacyRedraw ? { ok: true, patch: {} }
            : prepareSpriteIdentityAdoption(liveAssets, name, result.imageId,
                { ...result, ...(paintingOutfit && !result.outfitName && { outfitName: paintingOutfit }) },
                { hadDefault: Boolean(current),
                    ...outfitAdoptionReadOptions(settingsState, target) });
        if (!adoption.ok) {
            progress.end();
            return generatedAdoptionFailure(dialogs, globalObj, adoption);
        }
        const characters = { ...(liveAssets.characters || {}) };
        characters[name] = { ...(characters[name] || {}),
            ...(!namedRedraw && !adoption.outfitName && { [legacyRedraw ? '默认' : '平和']: `igs-gen:${result.imageId}` }) };
        liveAssets.characters = characters;
        Object.assign(liveAssets, adoption.patch);
        Object.assign(liveAssets, adoptCharacterSeed(liveAssets, name, result.seed));
        if (namedRedraw && !adoption.outfitName) {
            const all = liveAssets.characterOutfits;
            const entry = all[name][selected.outfitName];
            liveAssets.characterOutfits = { ...all, [name]: { ...all[name],
                [selected.outfitName]: setOutfitSprite(entry, '平和', `igs-gen:${result.imageId}`) } };
        }
        const spriteNotes = liveAssets.characterSpriteNotes = { ...liveAssets.characterSpriteNotes };
        if (String(spriteNote || '').trim()) spriteNotes[name] = String(spriteNote).trim();
        else delete spriteNotes[name];
        liveAssets.characterAliases = { ...(liveAssets.characterAliases || {}), [name]: [...(liveAssets.characterAliases?.[name] || [])] };
        const persisted = persistGeneratedLibrary(persistSettingsDraft, { spriteAssetChanged: true });
        if (operationFailed(persisted)) {
            restoreAdoptionFields(liveAssets, previousAdoption);
            const rolled = persistGeneratedLibrary(persistSettingsDraft, { spriteAssetChanged: true });
            progress.end();
            if (operationFailed(rolled)) return generatedOperationFailure(dialogs, globalObj,
                '默认立绘采用失败，且原设置无法重新保存。', 'generated-asset-accept-rollback-failed');
            return persisted;
        }
        const rendered = await rerenderSettings();
        progress.end();
        showGeneratedNotice(globalObj, `「${name}」的默认立绘已更新。`, 'info');
        return rendered;
    }

    if (normalizedAction.startsWith('outfit-generate-nude:')) {
        const parts = normalizedAction.slice('outfit-generate-nude:'.length).split(':').map(decodeSeg);
        const name = parts[0] || '';
        const outfitName = parts[1] || '';
        const globalObj = options.global || globalThis;
        const service = options.generatedAssets;
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        const character = (sceneAssets.characters || {})[name];
        const dna = characterExpressionDna(sceneAssets, name);
        const outfitsNow = (sceneAssets.characterOutfits || {})[name] || {};
        const outfitNow = outfitsNow[outfitName];
        if (!name || !outfitName || !outfitNow || !isBuiltinNudeOutfit(outfitNow.wardrobe) || (!character && !dna)) return rerenderSettings();
        if (!service || typeof service.generateCharacterSprite !== 'function') {
            return generationFailure(globalObj, dialogs, '立绘生成当前不可用。', 'sprite-generate-unavailable');
        }
        const current = String(outfitNow.base || '').trim();
        const progress = startExpressionProgress(globalObj, `${name}（${outfitName}）`);
        progress.onProgress({ phase: 'write' });
        const confirmed = await dialogs.confirm(current
            ? `重新生成「${name}」的「${outfitName}」裸体立绘，当前这张将被替换，原装保持不变。`
            : `生成「${name}」的「${outfitName}」裸体立绘：将先按该角色编写提示词，再生成一张图。该图记录在这套服装上，不替换原装。`);
        if (!confirmed) {
            progress.end();
            return rerenderSettings();
        }
        let result;
        const restoreBusy = markExpressionActionBusy(globalObj, normalizedAction);
        const failed = (error) => {
            progress.end();
            restoreBusy();
            return generationFailure(globalObj, dialogs, `「${name}」的「${outfitName}」裸体立绘未能生成：${errorText(error, '未返回原因')}${current ? '\n原有图片保持不变。' : ''}`, 'sprite-generate-failed');
        };
        try {
            result = await service.generateCharacterSprite({ name, dna, nude: true, onProgress: progress.onProgress });
        } catch (error) {
            return failed(error);
        }
        if (!result || !result.ok || !result.imageId) return failed(result && result.error);
        const liveAssets = draftAssetLibrary(settingsState, editTarget);
        const all = { ...(liveAssets.characterOutfits || {}) };
        const mine = { ...(all[name] || {}) };
        const entry = { ...(mine[outfitName] || { words: [], moods: {} }) };
        entry.base = `igs-gen:${result.imageId}`;
        mine[outfitName] = entry;
        all[name] = mine;
        liveAssets.characterOutfits = all;
        ensureCharacterAliases(settingsState, editTarget);
        const persisted = persistGeneratedLibrary(persistSettingsDraft, { spriteAssetChanged: true });
        if (operationFailed(persisted)) {
            progress.end();
            restoreBusy();
            return persisted;
        }
        const rendered = await rerenderSettings();
        progress.end();
        restoreBusy();
        showGeneratedNotice(globalObj, `「${name}」的「${outfitName}」裸体立绘已更新。`, 'info');
        return rendered;
    }

    if (/^(?:char|outfit)-expression-(?:set|retry|resume):/.test(normalizedAction)) {
        const outfitMode = normalizedAction.startsWith('outfit-expression-');
        const retry = normalizedAction.includes('-expression-retry:');
        const resume = normalizedAction.includes('-expression-resume:');
        const prefix = `${outfitMode ? 'outfit' : 'char'}-expression-${retry ? 'retry' : resume ? 'resume' : 'set'}:`;
        const parts = normalizedAction.slice(prefix.length).split(':').map(decodeSeg);
        const name = parts[0] || '';
        const outfitName = outfitMode ? (parts[1] || '') : '';
        const mood = retry ? (parts[outfitMode ? 2 : 1] || '') : '';
        const globalObj = options.global || globalThis;
        const service = options.generatedAssets;
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        let sceneAssets = draftAssetLibrary(settingsState, editTarget);
        const character = (sceneAssets.characters || {})[name];
        if (!outfitMode && (bridge.imageApi?.mode === 'nai' || readDefaultOutfit(sceneAssets, name).ok)) {
            const legacySlot = retry && String(character?.[mood] || '').trim();
            const legacyNotes = resume && pendingExpressionCaptions(
                normalizeGeneratedLibrary(sceneAssets.generated).expressionNotes[name], character || {}).length;
            // 已有历史图/续画记录仍绑定旧槽；新任务不得借旧入口新建原装图槽。
            if (!legacySlot && !legacyNotes) {
                const selected = readDefaultOutfit(sceneAssets, name);
                if (!selected.ok) return generatedOperationFailure(dialogs, globalObj,
                    '尚无有效默认衣装，请先指定有立绘的衣装或生成默认立绘。', selected.reason);
                const action = retry ? 'retry' : resume ? 'resume' : 'set';
                return handleSettingsAction(`outfit-expression-${action}:${encodeURIComponent(name)}:${encodeURIComponent(selected.outfitName)}`
                    + (retry ? `:${encodeURIComponent(mood)}` : ''), ctx);
            }
        }
        const outfitEntry = outfitMode ? (((sceneAssets.characterOutfits || {})[name] || {})[outfitName]) : null;
        if (!name || !character || (outfitMode && !outfitEntry)) return rerenderSettings();
        const sourceScope = String(settingsState.asyncState?.assetScopeKey || '');
        const targetUnchanged = () => {
            if (String(settingsState.asyncState?.assetScopeKey || '') !== sourceScope) return false;
            sceneAssets = draftAssetLibrary(settingsState, editTarget);
            return true;
        };
        if (!service || typeof service.generateExpressionSet !== 'function' || typeof service.getImagePrompt !== 'function') {
            return generationFailure(globalObj, dialogs, '表情差分当前不可用。', 'expression-unavailable');
        }
        // 单张重画、继续生图的菜单一点就收起，先把「生图中」亮出来，后面读提示词、出图都看得见。
        // 整套差分要先选档位、填注意事项，确认后才挂进度。之后每个提前返回都要收掉自己这一条。
        const subject = outfitMode ? `${name}（${outfitName}）` : name;
        let progress = retry || resume ? startExpressionProgress(globalObj, retry ? `${subject}·${mood}` : subject) : null;
        const endProgress = () => { if (progress) progress.end(); };
        const allGroups = normalizeMoodGroups(settingsState.draft.bridge.sceneAssets.moodGroups);
        const savedTiers = sceneAssets.characterMoodTiers && typeof sceneAssets.characterMoodTiers === 'object' ? sceneAssets.characterMoodTiers : {};
        // 新衣服还没有自己的图：可以先只画一张「平和」，所有表情共用；之后整套差分照它的衣服画。
        const firstDefault = outfitMode && !retry && !resume && !firstGeneratedOutfitUrl(outfitEntry);
        const tier = retry || resume ? 8 : await chooseMoodTier(dialogs, savedTiers[name], name, { firstDefault });
        const singleDefault = tier === 1;
        if (!retry && !resume && tier === 0) return rerenderSettings();
        const nsfw = nsfwEnabledForAssets(settingsState.draft);
        // 自选：全部预设+自建组列出来随便勾，几张都行；不改记住的档位。
        const customPick = tier === -1;
        let pickedLabels = null;
        if (customPick) {
            const pickSlots = outfitMode ? outfitSpriteSlots(outfitEntry) : (character || {});
            const options = moodTierLabels(20, { nsfw, extra: allGroups.map((group) => group.label) })
                .map((label) => ({ value: label, label: String(pickSlots[label] || '').trim() ? `${label}·有图` : label, note: String(pickSlots[label] || '').trim() ? '已有图，勾选也不会重画' : '' }));
            pickedLabels = typeof dialogs.pick === 'function' ? await dialogs.pick(`「${name}」要画哪些表情？`, options, []) : null;
            if (!pickedLabels || !pickedLabels.length) return rerenderSettings();
        }
        // 性格、某个情绪的特别表现：这次写词要遵守的额外要求。按角色记住，下次预填。
        const savedNotes = sceneAssets.characterMoodNotes && typeof sceneAssets.characterMoodNotes === 'object' ? sceneAssets.characterMoodNotes : {};
        let moodNote = '';
        if (!retry && !resume) {
            moodNote = await askExpressionNote(dialogs, name, savedNotes[name]);
            if (moodNote === null) return rerenderSettings();
        }
        const labels = singleDefault ? ['平和']
            : customPick ? pickedLabels
            : tier
            ? moodTierLabels(tier, { nsfw })
            : allGroups.map((group) => group.label);
        if (!targetUnchanged()) { endProgress(); return generatedOperationFailure(dialogs, globalObj,
            '本次角色身份或衣装已修改，未启动表情生成。', 'OUTFIT_ADOPTION_CONFLICT'); }
        const ownUrl = outfitMode ? firstGeneratedOutfitUrl(outfitEntry) : '';
        const dna = characterExpressionDna(sceneAssets, name);
        const hasIdentity = readCharacterDnaView(dna, 'half_body').ok;
        const externalGeneration = ['dbgen', 'extension', 'baibai'].includes(settingsState.draft.bridge.imageApi?.mode);
        const baseUrl = ownUrl || String(character['默认'] || '');
        const defaultId = generatedAssetIdOf(baseUrl);
        let basePrompt = null;
        // 新差分只读保存 DNA；旧图正文仅供无身份资料的历史兼容和逐图重画。
        try { basePrompt = !hasIdentity && defaultId ? await service.getImagePrompt(defaultId) : null; }
        catch (error) { basePrompt = null; }
        if (!basePrompt && !hasIdentity) {
            const originId = generatedAssetIdOf(String(character['默认'] || ''));
            if (originId && originId !== defaultId) {
                try { basePrompt = await service.getImagePrompt(originId); }
                catch (error) { basePrompt = null; }
            }
        }
        const library = normalizeGeneratedLibrary(sceneAssets.generated);
        const noteKey = expressionNoteKey(name, outfitName);
        const note = retry ? (library.expressionNotes[noteKey] || {})[mood] : null;
        // 重画读词：这一格已有图时以图上存的提示词为准（「提示词」里保存的就是它），
        // 没图时才用待出图的草稿；之前那次失败留下的草稿不能盖掉用户后来改的词。
        let savedCaption = null;
        let savedExact = false;
        let savedHistory;
        if (retry) {
            const slotUrl = outfitMode ? String(outfitSpriteSlots(outfitEntry)[mood] || '') : String((character || {})[mood] || '');
            const slotId = generatedAssetIdOf(slotUrl);
            if (slotId) {
                try {
                    const saved = await service.getImagePrompt(slotId);
                    if (saved && saved.caption) savedCaption = saved.caption;
                    else if (saved && (saved.positive || saved.negative)) {
                        const parsed = parseEditablePrompt([
                            saved.positive ? `scene: ${saved.positive}` : '',
                            saved.negative ? `scene_uc: ${saved.negative}` : '',
                        ].filter(Boolean).join('\n'));
                        savedCaption = parsed && parsed.caption;
                    }
                    savedExact = Boolean(savedCaption && saved && (saved.edited === true
                        || (outfitEntry?.legacyOriginal === 1 && !saved.promptRecipe)));
                    savedHistory = saved;
                } catch (error) { savedCaption = null; }
            }
            if (!savedCaption && note && note.caption) {
                savedCaption = note.caption; savedHistory = note;
                savedExact = note.edited === true;
            }
        }
        const nude = outfitMode && isBuiltinNudeOutfit(outfitEntry.wardrobe);
        const clothes = outfitMode && !nude ? resolveWardrobePrompt(draftEffectiveAssets(settingsState).wardrobe || {}, outfitEntry, outfitName) : null;
        const outfit = outfitMode ? { name: outfitName, words: nude ? [] : outfitEntry.words, ownImage: Boolean(ownUrl), prompt: nude ? '' : (clothes ? clothes.prompt : ''), nude, nsfwBoost: Boolean(!nude && clothes && clothes.nsfwBoost), form: outfitEntry.form || null } : null;
        if (retry && !mood) {
            endProgress();
            return rerenderSettings();
        }
        if (!targetUnchanged()) { endProgress(); return generatedOperationFailure(dialogs, globalObj,
            '本次角色身份或衣装已修改，未启动表情生成。', 'OUTFIT_ADOPTION_CONFLICT'); }
        const slots = { ...(outfitMode ? outfitSpriteSlots(sceneAssets.characterOutfits?.[name]?.[outfitName])
            : sceneAssets.characters?.[name] || {}) };
        // 自建组不进档位：还没图的问一句要不要一起画。
        const customMissing = retry || resume || singleDefault || customPick ? [] : allGroups.map((group) => group.label)
            .filter((label) => !moodPresetEntry(label) && !labels.includes(label) && !String(slots[label] || '').trim());
        if (customMissing.length) {
            const shown = `${customMissing.slice(0, 8).join('、')}${customMissing.length > 8 ? ' 等' : ''}`;
            if (await dialogs.confirm(`另有${customMissing.length}个自建情绪组尚无图片：${shown}。是否一并生成？`)) labels.push(...customMissing);
        }
        const filledLabels = labels.filter((label) => String(slots[label] || '').trim());
        const missingLabels = labels.filter((label) => !String(slots[label] || '').trim());
        const captionByMood = new Map(pendingExpressionCaptions(library.expressionNotes[noteKey], slots).map((item) => [item.mood, item]));
        const paintItems = missingLabels.filter((label) => captionByMood.has(label)).map((label) => captionByMood.get(label));
        const writeLabels = missingLabels.filter((label) => !captionByMood.has(label));
        const resumeItems = resume ? pendingExpressionCaptions(library.expressionNotes[noteKey], slots) : paintItems;
        if (resume && !resumeItems.length) {
            endProgress();
            showGeneratedNotice(globalObj, '没有已写好提示词但尚未出图的表情。');
            return rerenderSettings();
        }
        if (!retry && !resume) {
            const who = outfitName ? `「${name}」的服装「${outfitName}」` : `「${name}」`;
            if (!missingLabels.length) {
                const message = `${who}${customPick ? '所选' : '这一档'}的表情组均已有图片。`;
                if (typeof dialogs.view === 'function') await dialogs.view(message);
                else pageAlert(dialogs, globalObj, message);
                return rerenderSettings();
            }
            const paintNames = paintItems.map((item) => item.mood).join('、');
            const writeNames = writeLabels.join('、');
            const confirmed = await dialogs.confirm(singleDefault
                ? `给${who}画1张「平和」，表情先共用。`
                : !writeLabels.length
                ? `${customPick ? '所选' : '这一档'}还有${paintItems.length}张已写好提示词、尚未出图：${paintNames}。将只补画这${paintItems.length}张，不重写提示词。`
                : !paintItems.length
                    ? (missingLabels.length === labels.length
                        ? `生成${who}的${missingLabels.length}张表情差分：${writeNames}。`
                        : `${customPick ? '所选' : '这一档'}还有${missingLabels.length}张尚未生成：${writeNames}。将只生成这${missingLabels.length}张，已有的${filledLabels.length}张保持不变。`)
                    : `${customPick ? '所选' : '这一档'}还有${missingLabels.length}张尚未生成。其中${paintItems.length}张已有提示词，将直接补画：${paintNames}；另外${writeLabels.length}张需先编写提示词：${writeNames}。已有的${filledLabels.length}张保持不变。`);
            if (!confirmed) return rerenderSettings();
        }
        let result;
        if (!targetUnchanged()) {
            endProgress();
            return generatedOperationFailure(dialogs, globalObj,
                '角色、衣装或作用域已变化，未启动表情生成。', 'OUTFIT_ADOPTION_CONFLICT');
        }
        const onOutfitDna = outfitMode && !nude ? async (clothing) => {
            if (!targetUnchanged() || clothing.name !== outfitName)
                return { ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT', error: '角色、衣装或作用域已变化，未保存服装 DNA' };
            const prepared = prepareOutfitDnaSave(sceneAssets, name, outfitName, clothing.description,
                { readWardrobe: draftEffectiveAssets(settingsState).wardrobe, descriptionHalfBody: clothing.descriptionHalfBody });
            if (!prepared.ok) return prepared;
            const previous = captureAdoptionFields(sceneAssets, ['characterOutfits', 'wardrobe']);
            Object.assign(sceneAssets, prepared.patch);
            const persisted = persistGeneratedLibrary(persistSettingsDraft);
            if (operationFailed(persisted)) {
                restoreAdoptionFields(sceneAssets, previous);
                return { ok: false, reason: 'outfit-dna-save-failed', error: '服装 DNA 保存失败，未发起绘图' };
            }
            const saved = resolveWardrobePrompt(draftEffectiveAssets(settingsState).wardrobe,
                sceneAssets.characterOutfits?.[name]?.[outfitName], outfitName);
            if (!saved?.prompt || saved.prompt !== clothing.description
                || (clothing.descriptionHalfBody !== undefined && saved.promptHalfBody !== clothing.descriptionHalfBody))
                return { ok: false, reason: 'outfit-dna-save-failed', error: '服装 DNA 保存回读不一致，未发起绘图' };
            outfit.prompt = saved.prompt;
            if (saved.promptHalfBody !== undefined) outfit.promptHalfBody = saved.promptHalfBody;
            return { ok: true };
        } : undefined;
        if (!progress) progress = startExpressionProgress(globalObj, subject);
        const onProgress = progress.onProgress;
        // 单张重画的按钮由宿主按 settingsBusyLabel 锁住，这里只锁整套差分的按钮。
        const restoreBusy = retry ? () => {} : markExpressionActionBusy(globalObj, normalizedAction, '生图中');
        // 单张重画不接停止键：只有一张，按了也停不下来，别把「表情差分」按钮变成摆设。
        const stopControl = retry ? { signal: new AbortController().signal, done() {} } : createStopControl(() => restoreBusy());
        const hadImage = retry && Boolean(String(slots[mood] || '').trim());
        const failed = (error) => {
            progress.end();
            restoreBusy();
            const message = retry
                ? `「${subject}」的「${mood}」未能生成：${errorText(error, '未返回原因')}${hadImage ? '\n原有图片保持不变。' : ''}`
                : `「${subject}」的表情差分未能生成：${errorText(error, '未返回原因')}`;
            return generationFailure(globalObj, dialogs, message, 'expression-generate-failed');
        };
        try {
            const paintOnly = !retry && !writeLabels.length;
            result = resume || paintOnly
                ? await service.paintExpressionCaptions({ name, items: resumeItems, basePrompt, dna, outfit, nsfw, onProgress,
                    signal: stopControl.signal, shouldStart: targetUnchanged,
                    ...(onOutfitDna && { onOutfitDna }) })
                : retry && savedCaption && typeof service.generateExpressionImage === 'function'
                ? await service.generateExpressionImage({ name, mood, caption: savedCaption, exact: savedExact,
                    ...characterPromptRecovery(savedHistory), ...(savedHistory && { history: savedHistory }),
                    basePrompt, dna, outfit, nsfw, onProgress, signal: stopControl.signal, shouldStart: targetUnchanged,
                    ...(onOutfitDna && { onOutfitDna }) })
                : retry
                    ? await service.generateExpressionImage({ name, mood, basePrompt, dna, outfit, nsfw, onProgress, signal: stopControl.signal,
                        shouldStart: targetUnchanged, ...(onOutfitDna && { onOutfitDna }) })
                    : await paintThenWriteExpressions({
                        service, name, paintItems, writeLabels, basePrompt, dna, outfit, note: moodNote, nsfw, onProgress, signal: stopControl.signal,
                        shouldStart: targetUnchanged, ...(onOutfitDna && { onOutfitDna }),
                    });
        } catch (error) {
            stopControl.done();
            return failed(error);
        }
        stopControl.done();
        if (!result || !result.ok) return failed(result && result.error);
        if (!targetUnchanged()) return failed('角色、衣装或资料作用域已变化，原资料保持不变');
        const adoptedRecords = [];
        const verifiedSprites = new Set();
        let candidateDescription;
        for (const item of result.items || []) {
            if (!item.ok || !item.imageId || item.promptRecipe?.outfitMode !== 'template') continue;
            const authoritative = await readSpriteAdoptionRecord(service, item.imageId, item);
            if (!authoritative.ok) return failed(authoritative.error);
            if (!targetUnchanged()) return failed('候选回读期间角色、衣装或作用域已变化，原资料保持不变');
            const record = authoritative.record;
            const selected = record.outfitSnapshot?.characters?.filter(c => c.characterKey === name);
            if (selected?.length !== 1 || (outfitMode && selected[0].name !== outfitName))
                return failed('衣装候选与当前角色或服装不匹配，原资料保持不变');
            verifiedSprites.add(`igs-gen:${item.imageId}`);
            adoptedRecords.push({ item, record, selected });
        }
        if (!targetUnchanged()) return failed('本次角色身份、衣装或目标图槽已变化，生成图片保留');
        const liveAssets = sceneAssets;
        let mergedAssets = liveAssets, outfitPatch = {};
        // 所有异步回读结束后才从最新库构造补丁，避免前一张的整库补丁覆盖并行保存。
        for (const { item, record, selected } of adoptedRecords) {
            const adoption = prepareOutfitAdoption(mergedAssets, name, item.imageId, record,
                outfitAdoptionReadOptions(settingsState));
            if (!adoption.ok) {
                progress.end(); restoreBusy();
                return generatedAdoptionFailure(dialogs, globalObj, adoption);
            }
            if (Object.keys(adoption.patch).length) {
                const candidate = selected[0];
                const signature = JSON.stringify([candidate.name, candidate.description]);
                if (candidateDescription !== undefined && candidateDescription !== signature)
                    return failed('同批衣装候选说明不一致，原资料保持不变');
                candidateDescription = signature;
                mergedAssets = { ...mergedAssets, ...adoption.patch };
                Object.assign(outfitPatch, adoption.patch);
            }
        }
        const painted = (result.items || []).filter(item => item.ok && item.imageId).length;
        const previous = captureAdoptionFields(liveAssets, ['characters', 'characterOutfits', 'wardrobe', 'generated',
            'characterMoodTiers', 'characterMoodNotes', 'characterSeeds', 'characterDefaultOutfits'], { clone: true });
        Object.assign(liveAssets, outfitPatch);
        if (!retry && !resume) {
            const tiers = liveAssets.characterMoodTiers && typeof liveAssets.characterMoodTiers === 'object'
                ? liveAssets.characterMoodTiers : (liveAssets.characterMoodTiers = {});
            // 「只画一张平和」不改这个角色记住的档位。
            if (!singleDefault && !customPick) tiers[name] = tier;
            const notes = liveAssets.characterMoodNotes && typeof liveAssets.characterMoodNotes === 'object'
                ? liveAssets.characterMoodNotes : (liveAssets.characterMoodNotes = {});
            if (String(moodNote || '').trim()) notes[name] = String(moodNote).trim();
            else delete notes[name];
        }
        for (const item of result.items || []) {
            // 停止后没画的格子连空槽都不建；词写好了的只记注记，留给「继续生图」。
            if (item.error === '已跳过' || (item.error === '已停止' && !item.caption)) continue;
            if (outfitMode) applyOutfitExpression(liveAssets, name, outfitName, item);
            else applyCharacterExpression(liveAssets, name, item);
        }
        if (outfitMode && verifiedSprites.size) {
            const selection = prepareInitialDefaultOutfitSelection(liveAssets, name, outfitName,
                url => verifiedSprites.has(url) ? 'available' : 'unverified');
            if (!selection.ok) {
                restoreAdoptionFields(liveAssets, previous);
                return failed('默认衣装选择无效，原资料保持不变');
            }
            Object.assign(liveAssets, selection.patch);
        }
        const persisted = persistGeneratedLibrary(persistSettingsDraft, { spriteAssetChanged: painted > 0 });
        if (operationFailed(persisted)) {
            restoreAdoptionFields(liveAssets, previous);
            const rolled = persistGeneratedLibrary(persistSettingsDraft, { spriteAssetChanged: painted > 0 });
            progress.end();
            restoreBusy();
            if (operationFailed(rolled)) return generatedOperationFailure(dialogs, globalObj,
                '衣装差分保存失败，且原设置无法重新保存。', 'generated-asset-accept-rollback-failed');
            return persisted;
        }
        const failedItems = (result.items || []).filter((item) => !item.ok && item.error !== '已停止' && item.error !== '已跳过');
        const firstError = errorText(failedItems[0] && failedItems[0].error, '未返回原因');
        const rendered = await rerenderSettings();
        progress.end();
        restoreBusy();
        const kept = (result.items || []).filter((item) => item.error === '已停止' && item.caption).length;
        // 失败原因（超时、插件报错）也记在格子的注记里，但界面上看不到，这里直接说出来。
        if (result.stopped) showGeneratedNotice(globalObj, `已停止，画好了${painted}张。${kept ? `剩下${kept}张的词已写好，点「继续生图」接着画。` : ''}`, 'info');
        else if (retry && painted) showGeneratedNotice(globalObj, `「${subject}」的「${mood}」已换上。`, 'info');
        else if (retry) generationFailure(globalObj, dialogs, `「${subject}」的「${mood}」未能生成：${firstError}${hadImage ? '\n原有图片保持不变。' : ''}`, 'expression-generate-failed');
        else if (!painted) generationFailure(globalObj, dialogs, `「${subject}」未能生成可用的图片：${firstError}`, 'expression-generate-failed');
        else if (failedItems.length) showGeneratedNotice(globalObj, `已生成${painted}张，${failedItems.length}张未能生成：${firstError}。失败的格子可单独「重新生成」。`);
        else showGeneratedNotice(globalObj, `「${subject}」画好${painted}张表情差分。`, 'info');
        return rendered;
    }

    // 下载 IGS 实际存储的素材图片：立绘为裁边后带原图 PNG 文本块的版本，背景为原图。
    if (normalizedAction.startsWith('gen-asset-download:')) {
        const rest = normalizedAction.slice('gen-asset-download:'.length);
        const colon = rest.indexOf(':');
        const imageId = decodeSeg(colon < 0 ? rest : rest.slice(0, colon));
        const fileName = sanitizeDownloadName(colon < 0 ? '' : decodeSeg(rest.slice(colon + 1)));
        const globalObj = options.global || globalThis;
        const service = options.generatedAssets;
        if (!imageId || !service || typeof service.getImageDataUrl !== 'function') {
            return { ok: false, reason: 'generated-assets-unavailable' };
        }
        let dataUrl = '';
        try {
            dataUrl = await service.getImageDataUrl(imageId);
        } catch (error) {
            dataUrl = '';
        }
        if (!dataUrl) return generatedOperationFailure(dialogs, globalObj, '找不到这份素材的图片，可能已被删除。', 'generated-asset-image-missing');
        try {
            return triggerDataUrlDownload(globalObj, dataUrl, fileName);
        } catch (error) {
            return generatedOperationFailure(dialogs, globalObj, '素材图片下载失败。', 'generated-asset-download-failed');
        }
    }

    if (normalizedAction.startsWith('gen-temp-discard:')) {
        const key = decodeSeg(normalizedAction.slice('gen-temp-discard:'.length));
        const globalObj = options.global || globalThis;
        const confirmed = await dialogs.confirm('丢弃这份临时生成素材及其图片？');
        if (!confirmed) return rerenderSettings();
        const service = options.generatedAssets;
        if (!service || typeof service.setStatus !== 'function') {
            return { ok: false, reason: 'generated-assets-unavailable' };
        }
        let status;
        try {
            status = await service.setStatus(key, 'discarded');
        } catch (error) {
            status = { ok: false, reason: 'generated-asset-status-failed' };
        }
        if (operationFailed(status)) return status;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('status-hud-toggle-table:')) {
        const rest = normalizedAction.slice('status-hud-toggle-table:'.length);
        const colon = rest.indexOf(':');
        if (colon < 0) return rerenderSettings();
        const uid = decodeSeg(rest.slice(0, colon));
        const name = decodeSeg(rest.slice(colon + 1));
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeStatusHudSettings(readerDraft.statusHud);
        const key = uid || `name:${name}`;
        const exists = current.tables.some((item) => (uid && item.uid === uid) || (!uid && item.name === name));
        current.tables = exists
            ? current.tables.filter((item) => !((uid && item.uid === uid) || (!uid && item.name === name)))
            : current.tables.concat([{ uid, name }]);
        readerDraft.statusHud = current;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    // 状态栏位置：切换正在编辑的那一份（电脑 / 手机）只改界面状态；「回到左上角」只清这一份。
    if (normalizedAction.startsWith('status-hud-pos-device:') || normalizedAction.startsWith('status-hud-pos-reset:')) {
        const device = normalizedAction.slice(normalizedAction.indexOf(':') + 1);
        if (!STATUS_HUD_POSITION_DEVICES.includes(device)) return { ok: false, reason: 'invalid-status-hud-device' };
        settingsState.asyncState.statusHudPosDevice = device;
        if (normalizedAction.startsWith('status-hud-pos-reset:')) {
            const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
            const current = normalizeStatusHudSettings(readerDraft.statusHud);
            current.position[device] = { x: 0, y: 0 };
            readerDraft.statusHud = current;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('status-avatar-set-url:')) {
        const rest = normalizedAction.slice('status-avatar-set-url:'.length);
        const colon = rest.indexOf(':');
        if (colon > 0) {
            const charName = decodeSeg(rest.slice(0, colon));
            const url = decodeSeg(rest.slice(colon + 1)).trim();
            const sceneAssets = draftAssetLibrary(settingsState, editTarget);
            const avatars = normalizeStatusAvatars(sceneAssets.statusAvatars);
            const previous = avatars[charName];
            if (url) {
                const normalized = normalizeStatusAvatars({ [charName]: url });
                if (!normalized[charName]) return rerenderSettings();
                avatars[charName] = normalized[charName];
            } else {
                delete avatars[charName];
            }
            sceneAssets.statusAvatars = avatars;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
            await releaseAvatarImage(previous, settingsState, options);
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('chat-show-')) {
        const globalObj = options.global || globalThis;
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeChatShowSettings(readerDraft.chatShow);
        const ask = async (message) => String((await dialogs.prompt(message, '')) || '').trim();
        const [verb, ...args] = normalizedAction.slice('chat-show-'.length).split(':');
        const [name, alias] = args.map(decodeSeg);
        let changed = false;
        if (verb === 'preview-sound') {
            const sound = { volume: current.sound.volume, preset: current.sound.preset, audioScheduler: options.chatSfxScheduler };
            playChatSfx('receive', sound);
            playChatSfx('send', { ...sound, delay: 0.45 });
            return { ok: true, previewed: current.sound.preset };
        }
        if (verb === 'save-prompt' || verb === 'reset-prompt') {
            const draft = typeof settingsState.asyncState.chatPromptDraft === 'string' ? settingsState.asyncState.chatPromptDraft : '';
            current.promptRule = verb === 'reset-prompt' ? '' : normalizeChatPromptRule(draft);
            readerDraft.chatShow = current;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) {
                settingsState.asyncState.chatPromptStatus = '正在自动恢复保存。';
                return rerenderSettings();
            }
            settingsState.asyncState.chatPromptDraft = current.promptRule || CHAT_SHOW_PROMPT_RULE;
            settingsState.asyncState.chatPromptStatus = verb === 'reset-prompt'
                ? '已恢复默认提示词并保存。'
                : current.promptRule ? '自定义提示词已保存并更新注入规则。' : '内容为空或与默认一致，已使用默认提示词。';
            return rerenderSettings();
        }
        if (verb === 'add-contact') {
            const next = await ask('新增联系人（角色主名，不能含 . | [ ]）：');
            if (isValidChatContactName(next) && !current.contacts[next]) {
                current.contacts[next] = { aliases: [], color: '', side: 'auto' };
                changed = true;
            }
        } else if (verb === 'remove-contact' && current.contacts[name]) {
            delete current.contacts[name];
            changed = true;
        } else if (verb === 'add-alias' && current.contacts[name]) {
            const next = await ask(`为「${name}」新增别名（网名、昵称等）：`);
            if (next && next !== name && !current.contacts[name].aliases.includes(next)) {
                current.contacts[name].aliases.push(next);
                changed = true;
            }
        } else if (verb === 'remove-alias' && current.contacts[name]) {
            current.contacts[name].aliases = current.contacts[name].aliases.filter((item) => item !== alias);
            changed = true;
        }
        if (changed) {
            readerDraft.chatShow = current;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction === 'typewriter-preview-sound') {
        const { sound } = normalizeTypewriterSettings((settingsState.draft.readerSettings || {}).typewriter);
        // Six dialogue notes, then six narration notes after a short gap.
        const notes = (offset) => Array.from({ length: 6 }, (_, i) => ({ text: '字', timeMs: 80 + offset + i * 110 }));
        const play = (textType, volume, offset) => {
            const voice = resolveTypewriterVoice(sound, textType, '试听');
            scheduleTypewriterAudio(notes(offset), { textType, volume, audioScheduler: options.typewriterAudioScheduler, preset: voice.preset, pitch: voice.pitch });
            return voice.preset;
        };
        return { ok: true, previewed: [play('dialogue', sound.dialogueVolume, 0), play('narration', sound.narrationVolume, 900)] };
    }

    if (normalizedAction === 'system-role-follow-color') {
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        readerDraft.systemRole = { ...normalizeSystemRoleSettings(readerDraft.systemRole), color: '' };
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'system-role-add-word' || normalizedAction.startsWith('system-role-remove-word:')) {
        const globalObj = options.global || globalThis;
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeSystemRoleSettings(readerDraft.systemRole);
        if (normalizedAction === 'system-role-add-word') {
            const word = stripRoleBrackets(await dialogs.prompt('新增系统类角色名（如 系统、公告、旁白君）：', ''));
            if (!word || current.words.some((w) => w.toLowerCase() === word.toLowerCase())) return rerenderSettings();
            current.words.push(word);
        } else {
            const word = decodeSeg(normalizedAction.slice('system-role-remove-word:'.length));
            current.words = current.words.filter((w) => w !== word);
        }
        readerDraft.systemRole = current;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    // 数值建卡：玩家新增 / 删除自定义特有技能。新增的默认不选，不挤占已选的 3 项。
    if (normalizedAction === 'stats-build-add-skill') {
        const bridgeDraft = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const statsDraft = bridgeDraft.stats = bridgeDraft.stats || {};
        const build = normalizeBuild(statsDraft.build);
        if (build.custom.length >= BUILD_CUSTOM_MAX) return { ok: false, reason: 'stats-build-skill-full' };
        const raw = await dialogs.prompt(`新增技能名（1–8 字，不含数字和符号，最多 ${BUILD_CUSTOM_MAX} 个）：`, '');
        if (raw == null || !String(raw).trim()) return rerenderSettings();
        const name = validCustomSkillName(raw);
        if (!name) return { ok: false, reason: 'stats-build-skill-invalid' };
        if (!build.custom.includes(name)) {
            build.custom.push(name);
            if (!Object.hasOwn(build.special, name)) build.special[name] = false;
            statsDraft.build = build;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    // 「−」按钮：弹框填要删除的自定义技能名；只有一个时预填。
    if (normalizedAction === 'stats-build-remove-skill') {
        const bridgeDraft = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const statsDraft = bridgeDraft.stats = bridgeDraft.stats || {};
        const build = normalizeBuild(statsDraft.build);
        if (!build.custom.length) return rerenderSettings();
        const raw = await dialogs.prompt(`要删除的自定义技能（现有：${build.custom.join('、')}）：`, build.custom.length === 1 ? build.custom[0] : '');
        const name = String(raw == null ? '' : raw).trim();
        if (!name) return rerenderSettings();
        if (!build.custom.includes(name)) return { ok: false, reason: 'stats-build-skill-unknown' };
        build.custom = build.custom.filter((item) => item !== name);
        delete build.special[name];
        statsDraft.build = build;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'stage-shake-add-emotion') {
        const globalObj = options.global || globalThis;
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeStageShakeSettings(readerDraft.stageShake);
        const raw = await dialogs.prompt('新增震动触发情绪（中文）：', '');
        const emotion = String(raw == null ? '' : raw).trim();
        if (emotion && !current.emotions.includes(emotion) && !/[A-Za-z]/u.test(emotion) && /[\u3400-\u9fff]/u.test(emotion)) {
            current.emotions.push(emotion);
            readerDraft.stageShake = current;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('stage-shake-remove-emotion:')) {
        const emotion = decodeSeg(normalizedAction.slice('stage-shake-remove-emotion:'.length));
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeStageShakeSettings(readerDraft.stageShake);
        current.emotions = current.emotions.filter((item) => item !== emotion);
        readerDraft.stageShake = current;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    const perfPresetAction = normalizedAction.match(/^perf-preset:([a-z]+)$/);
    if (perfPresetAction) {
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const presetId = perfPresetAction[1];
        const label = performancePresetLabel(presetId);
        if (!label) return rerenderSettings();
        // 只有会覆盖自定义组合时才确认（同档重按、档位之间切换直接生效）；确认后记下快照，可「撤销档位切换」。
        if (isCustomPerformanceCombo(readerDraft)) {
            const snapshot = {
                switches: capturePerformancePreset(readerDraft),
                profile: hasPerformanceProfile(readerDraft) ? JSON.parse(JSON.stringify(readerDraft.performanceProfile)) : null,
            };
            if (!await dialogs.confirm(`当前是自定义的演出组合，切到「${label}」档会按档位重设各演出的开关，细项设置保留。`, { okLabel: '覆盖' })) {
                return rerenderSettings();
            }
            settingsState.asyncState.perfPresetUndo = snapshot;
        }
        // 有快速配置时，档位只换热闹程度；声音、亲密保留，「题材专属」开关不动。
        if (hasPerformanceProfile(readerDraft)) {
            applyPerformanceProfile(readerDraft, { ...profileFromReader(readerDraft), level: presetId }, { keepSpecial: true });
        } else {
            applyPerformancePreset(readerDraft, presetId);
        }
        return rerenderSettings();
    }

    if (normalizedAction === 'perf-preset-undo') {
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const snapshot = settingsState.asyncState.perfPresetUndo;
        if (!snapshot || !restorePerformancePreset(readerDraft, snapshot.switches)) return rerenderSettings();
        if (snapshot.profile) readerDraft.performanceProfile = snapshot.profile;
        else delete readerDraft.performanceProfile;
        settingsState.asyncState.perfPresetUndo = null;
        return rerenderSettings();
    }

    const worldviewAction = normalizedAction.match(/^worldview:([a-z-]+)$/);
    if (worldviewAction) {
        const bridgeDraft = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        applyWorldview(sceneAssets, worldviewAction[1]);
        return rerenderSettings();
    }

    // 随身带着现代手机：跟着角色卡存；卡上还没有自己的世界观时先把当前世界观钉到卡上，否则字段不会随卡保存。
    const carryPhoneAction = normalizedAction.match(/^carry-phone(-prompt)?:([\s\S]*)$/);
    if (carryPhoneAction) {
        settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        if (!canCarryPhone(resolveWorldview(draftEffectiveAssets(settingsState, editTarget)))) return rerenderSettings();
        if (!Object.prototype.hasOwnProperty.call(sceneAssets, 'worldview')) applyWorldview(sceneAssets, resolveWorldview(draftEffectiveAssets(settingsState, editTarget)));
        if (carryPhoneAction[1]) {
            let text = '';
            try { text = decodeURIComponent(carryPhoneAction[2]); } catch { text = carryPhoneAction[2]; }
            sceneAssets.carryPhonePrompt = text.slice(0, 600);
        } else sceneAssets.carryPhone = carryPhoneAction[2] === 'on';
        return rerenderSettings();
    }

    const horrorAction = normalizedAction.match(/^horror-(style|gore):([a-z0-9]+)$/);
    if (horrorAction) {
        settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        if (horrorAction[1] === 'style') sceneAssets.horrorStyle = normalizeHorrorStyle(horrorAction[2]);
        else sceneAssets.horrorGore = normalizeHorrorGore(horrorAction[2]);
        return rerenderSettings();
    }

    // 演出写法条目：启用 / 常驻两个开关写在 mode 里（关闭 off、常驻 always、其余 auto）。
    const entryFlag = normalizedAction.match(/^prompt-entry-flag:([a-z]+):(enabled|always)$/);
    if (entryFlag) {
        if (!isPromptEntryKey(entryFlag[1])) return rerenderSettings();
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = bridge.sceneAssets = { ...(bridge.sceneAssets || {}) };
        const entries = { ...(sceneAssets.promptEntries || {}) };
        const current = normalizePromptEntry(entries[entryFlag[1]]);
        const mode = entryFlag[2] === 'enabled'
            ? (current.mode === 'off' ? 'auto' : 'off')
            : (current.mode === 'always' ? 'auto' : 'always');
        entries[entryFlag[1]] = { ...current, mode };
        sceneAssets.promptEntries = entries;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    // 演出写法条目恢复默认：删掉这条的设置（含 fxPrompts 里同名的正文覆盖）即回到默认行为。
    const entryReset = normalizedAction.match(/^prompt-entry-reset:([a-z]+)$/);
    if (entryReset) {
        if (!isPromptEntryKey(entryReset[1])) return rerenderSettings();
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const sceneAssets = bridge.sceneAssets = { ...(bridge.sceneAssets || {}) };
        const entries = { ...(sceneAssets.promptEntries || {}) };
        delete entries[entryReset[1]];
        sceneAssets.promptEntries = entries;
        const readerDraft = settingsState.draft.readerSettings;
        if (readerDraft && readerDraft.fxPrompts && readerDraft.fxPrompts[entryReset[1]]) {
            readerDraft.fxPrompts = { ...readerDraft.fxPrompts, [entryReset[1]]: '' };
        }
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    // 手机社区：某个平台的写法恢复默认（自定义留空即用默认）。
    const feedReset = normalizedAction.match(/^feed-prompt-reset:([a-z]+)$/);
    if (feedReset) {
        if (!isFeedPlatformId(feedReset[1])) return rerenderSettings();
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeFeedFxSettings(readerDraft.feedFx);
        current.platforms[feedReset[1]].prompt = '';
        readerDraft.feedFx = current;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'feed-storm-prompt-reset') {
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeFeedFxSettings(readerDraft.feedFx);
        current.storm.prompt = '';
        readerDraft.feedFx = current;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    const fxWordAction = normalizedAction.match(/^fx-word-(add|remove):([^:]+)(?::(.*))?$/);
    if (fxWordAction) {
        const path = decodeSeg(fxWordAction[2]);
        if (!FX_WORD_LIST_PATHS.includes(path)) return rerenderSettings();
        const [top, ...rest] = path.split('.');
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = FX_SETTINGS_NORMALIZERS[top](readerDraft[top]);
        const parent = rest.slice(0, -1).reduce((obj, key) => obj[key], current);
        const leaf = rest[rest.length - 1];
        let changed = false;
        if (fxWordAction[1] === 'add') {
            const globalObj = options.global || globalThis;
            const raw = await dialogs.prompt('新增触发情绪（中文）：', '');
            const emotion = String(raw == null ? '' : raw).trim();
            if (emotion && !parent[leaf].includes(emotion) && !/[A-Za-z]/u.test(emotion) && /[\u3400-\u9fff]/u.test(emotion)) {
                parent[leaf].push(emotion);
                changed = true;
            }
        } else {
            const emotion = decodeSeg(fxWordAction[3] || '');
            parent[leaf] = parent[leaf].filter((item) => item !== emotion);
            changed = true;
        }
        if (changed) {
            readerDraft[top] = current;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    // Meta 互动台词：按「通用 / 角色」分组增删，弹窗输入。
    const metaLine = normalizedAction.match(/^meta-(line-add|line-remove|scope-add|scope-remove)(?::([^:]*))?(?::([a-zA-Z0-9]+))?(?::(\d+))?$/);
    if (metaLine) {
        const globalObj = options.global || globalThis;
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeMetaFxSettings(readerDraft.metaFx);
        const scope = metaLine[2] == null ? '' : decodeSeg(metaLine[2]);
        const kind = META_LINE_KINDS.includes(metaLine[3]) ? metaLine[3] : '';
        const ask = async (message) => {
            const raw = await dialogs.prompt(message, '');
            return raw == null ? '' : String(raw).trim();
        };
        let changed = false;
        if (metaLine[1] === 'line-add' && scope && kind) {
            const pools = current.lines[scope] = current.lines[scope] || {};
            const list = pools[kind] = pools[kind] || [];
            const line = list.length < META_LINES_MAX ? await ask('新增台词（不超过40个字）：') : '';
            if (line && !list.includes(line)) { list.push(line); changed = true; }
        } else if (metaLine[1] === 'line-remove' && scope && kind && current.lines[scope] && current.lines[scope][kind]) {
            current.lines[scope][kind].splice(Number(metaLine[4]), 1);
            changed = true;
        } else if (metaLine[1] === 'scope-add') {
            const name = await ask('角色名（与立绘角色名一致）：');
            if (name && name !== META_GLOBAL_SCOPE && !current.lines[name]) { current.lines[name] = {}; changed = true; }
        } else if (metaLine[1] === 'scope-remove' && scope && scope !== META_GLOBAL_SCOPE && current.lines[scope]) {
            delete current.lines[scope];
            changed = true;
        }
        if (changed) {
            readerDraft.metaFx = normalizeMetaFxSettings(current);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    // 亲密演出快捷动作：增 / 改 / 删，名称与模板用弹窗输入（模板里写 {角色} 代表当前立绘角色）。
    const romanceAction = normalizedAction.match(/^romance-action-(add|edit|remove)(?::(\d+))?$/);
    if (romanceAction) {
        const globalObj = options.global || globalThis;
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeRomanceFxSettings(readerDraft.romanceFx);
        const index = Number(romanceAction[2]);
        const ask = async (message, fallback) => {
            const raw = await dialogs.prompt(message, fallback);
            return raw == null ? null : String(raw).trim();
        };
        let changed = false;
        if (romanceAction[1] === 'remove' && current.actions[index]) {
            current.actions.splice(index, 1);
            changed = true;
        } else if (romanceAction[1] === 'add' && current.actions.length < ROMANCE_ACTIONS_MAX) {
            const name = await ask('动作名称（不超过8个字）：', '');
            const text = name ? await ask('写入输入框的文字，{角色}会换成当前角色名：', `（{角色}）`) : null;
            if (name && text) { current.actions.push({ name, text }); changed = true; }
        } else if (romanceAction[1] === 'edit' && current.actions[index]) {
            const item = current.actions[index];
            const name = await ask('动作名称（不超过8个字）：', item.name);
            const text = name ? await ask('写入输入框的文字，{角色}会换成当前角色名：', item.text) : null;
            if (name && text) { current.actions[index] = { name, text }; changed = true; }
        }
        if (changed) {
            readerDraft.romanceFx = normalizeRomanceFxSettings(current);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    // 文字样式 › 上传字体：上传后记进 localStorage 并重绘，立即出现在字体下拉末尾；删除时把还在用它的字体设置还原成默认。
    if (normalizedAction === 'custom-font-upload' || normalizedAction.startsWith('custom-font-remove:')) {
        const hostGlobal = options.global || globalThis;
        const fonts = loadCustomFonts(hostGlobal);
        if (normalizedAction === 'custom-font-upload') {
            const doc = hostGlobal.document;
            if (!doc) return rerenderSettings();
            const file = await (options.recoveryCheckpoint?.step('file:font', () => pickFontFile(doc)) || pickFontFile(doc));
            if (!file) return rerenderSettings();
            const upload = () => uploadFontFile(hostGlobal, file);
            const uploaded = await (options.recoveryCheckpoint?.step('upload:font', upload) || upload());
            if (!uploaded.ok) return uploaded;
            const saved = await recoverMediaOperation(hostGlobal, () => {
                const current = loadCustomFonts(hostGlobal).filter(font => font.id !== uploaded.font.id);
                return saveCustomFonts(hostGlobal, current.concat([uploaded.font]));
            });
            if (saved?.cancelled) return saved;
            settingsState.asyncState.customFontMessage = `已上传「${uploaded.font.label}」，在字体下拉末尾选择。`;
            return rerenderSettings();
        }
        const id = decodeSeg(normalizedAction.slice('custom-font-remove:'.length));
        const target = fonts.find((font) => font.id === id);
        if (!target) return rerenderSettings();
        if (!(await dialogs.confirm(`删除上传的字体「${target.label}」？用它排版的文字会退回默认字体。`, { okLabel: '删除' }))) return rerenderSettings();
        resetThemeFontsUsing(settingsState.draft, target.family);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        const saved = await recoverMediaOperation(hostGlobal, () => saveCustomFonts(hostGlobal,
            loadCustomFonts(hostGlobal).filter(font => font.id !== target.id)));
        if (saved?.cancelled) return saved;
        const deleted = await deleteTavernFont(hostGlobal, target.path);
        if (deleted?.cancelled) return deleted;
        settingsState.asyncState.customFontMessage = `已删除「${target.label}」。`;
        return rerenderSettings();
    }

    if (BGM_ACTION_RE.test(normalizedAction)) {
        const result = await handleBgmSettingsAction(normalizedAction, {
            readerDraft: settingsState.draft.readerSettings = settingsState.draft.readerSettings || {},
            dialogs,
            persist: persistSettingsDraft,
            global: options.global || globalThis,
            worldview: resolveWorldview(settingsState.draft.bridge && settingsState.draft.bridge.sceneAssets),
        });
        if (result && result.ok === false) return result;
        return rerenderSettings();
    }

    const weatherWordAdd = normalizedAction.match(/^weather-fx-add-(indoor|outdoor)$/);
    if (weatherWordAdd) {
        const scene = weatherWordAdd[1];
        const globalObj = options.global || globalThis;
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeWeatherFxSettings(readerDraft.weatherFx);
        const listKey = `${scene}Words`;
        const raw = await dialogs.prompt(scene === 'indoor' ? '新增室内地点词：' : '新增室外地点词：', '');
        const word = String(raw == null ? '' : raw).trim();
        if (word && !current[listKey].includes(word)) {
            current[listKey].push(word);
            readerDraft.weatherFx = current;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    const weatherWordRemove = normalizedAction.match(/^weather-fx-remove-(indoor|outdoor):/);
    if (weatherWordRemove) {
        const listKey = `${weatherWordRemove[1]}Words`;
        const word = decodeSeg(normalizedAction.slice(weatherWordRemove[0].length));
        const readerDraft = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
        const current = normalizeWeatherFxSettings(readerDraft.weatherFx);
        current[listKey] = current[listKey].filter((item) => item !== word);
        readerDraft.weatherFx = current;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    const assetPick = /^scene-pick-(bg|time|weather|mood|outfit-mood):(.+)$/.exec(normalizedAction);
    if (assetPick) {
        const kind = assetPick[1];
        const parts = assetPick[2].split(':').map(decodeSeg);
        if (parts.length !== (kind === 'bg' ? 1 : kind === 'weather' || kind === 'outfit-mood' ? 3 : 2)
            || parts.some((part, index) => !part || (RESERVED_ASSET_NAMES.includes(part)
                && !(kind === 'outfit-mood' && index === 2 && part === '默认')))) {
            return { ok: false, reason: 'invalid-asset-slot' };
        }
        const globalObj = options.global || globalThis;
        const service = options.generatedAssets;
        if (!globalObj.document || !service || typeof service.importAssetImage !== 'function') {
            return generationFailure(globalObj, dialogs, '图片上传当前不可用。', 'asset-upload-unavailable');
        }
        const initialDraft = settingsState.draft;
        let library = draftAssetLibrary(settingsState, editTarget);
        let scene = library.scenes && Object.hasOwn(library.scenes, parts[0]) ? library.scenes[parts[0]] : null;
        let character = library.characters && Object.hasOwn(library.characters, parts[0]) ? library.characters[parts[0]] : null;
        let time = scene && typeof scene === 'object' && scene.times && Object.hasOwn(scene.times, parts[1]) ? scene.times[parts[1]] : null;
        let weather = time && typeof time === 'object' && time.weathers && Object.hasOwn(time.weathers, parts[2]) ? time.weathers[parts[2]] : null;
        let outfits = kind === 'outfit-mood' && library.characterOutfits && Object.hasOwn(library.characterOutfits, parts[0]) ? library.characterOutfits[parts[0]] : null;
        let outfit = outfits && typeof outfits === 'object' && Object.hasOwn(outfits, parts[1]) ? outfits[parts[1]] : null;
        const baseSlot = kind === 'outfit-mood' && parts[2] === '默认';
        let owner = kind === 'outfit-mood' ? outfit && (baseSlot ? outfit : outfit.moods) : kind === 'mood' ? character : kind === 'bg' ? library.scenes : kind === 'time' ? scene && scene.times : time && time.weathers;
        const key = baseSlot ? 'base' : kind === 'bg' ? parts[0] : kind === 'mood' ? parts[1] : kind === 'time' ? parts[1] : parts[2];
        if (!owner || typeof owner !== 'object' || !Object.hasOwn(owner, key) || (kind === 'mood' && (!character || typeof character !== 'object'))) {
            return { ok: false, reason: 'invalid-asset-slot' };
        }
        const before = owner[key];
        const scope = settingsState.asyncState?.assetScopeKey;
        const imageUrl = value => typeof value === 'string' ? value : String(value?.url || '');
        const slotUnchanged = () => {
            if (settingsState.asyncState?.assetScopeKey !== scope) return false;
            library = draftAssetLibrary(settingsState, editTarget);
            scene = library.scenes?.[parts[0]];
            character = library.characters?.[parts[0]];
            time = scene?.times?.[parts[1]];
            outfit = library.characterOutfits?.[parts[0]]?.[parts[1]];
            owner = kind === 'outfit-mood' ? (baseSlot ? outfit : outfit?.moods)
                : kind === 'mood' ? character : kind === 'bg' ? library.scenes
                : kind === 'time' ? scene?.times : time?.weathers;
            return Boolean(owner && Object.hasOwn(owner, key) && imageUrl(owner[key]) === imageUrl(before));
        };
        const picked = await (options.recoveryCheckpoint?.step('file:asset-image', () => pickAssetImageFile(globalObj.document, globalObj)) || pickAssetImageFile(globalObj.document, globalObj));
        if (state.activeSettings !== settingsState || settingsState.draft !== initialDraft) return { ok: false, reason: 'settings-closed' };
        if (!picked) return rerenderSettings();
        if (!picked.ok) return generationFailure(globalObj, dialogs,
            picked.reason === 'too-large' ? '图片不能超过8MB。' : picked.reason === 'read-failed' ? '图片读取失败。' : '仅支持PNG、JPEG、WebP和GIF图片。',
            'asset-upload-invalid');
        if (!slotUnchanged()) return { ok: false, reason: 'asset-slot-changed' };
        let imported;
        try {
            imported = await service.importAssetImage(picked.dataUrl, kind === 'mood' || kind === 'outfit-mood' ? 'sprite' : 'background');
        } catch (error) {
            imported = { ok: false, error: errorText(error, '图片保存失败') };
        }
        if (!imported || !imported.ok || !imported.imageId) {
            return generationFailure(globalObj, dialogs, `图片上传失败：${errorText(imported && imported.error, '图片保存失败')}`, 'asset-upload-failed');
        }
        const discard = async () => {
            if (typeof service.deleteImages !== 'function') return false;
            try { return !operationFailed(await service.deleteImages([imported.imageId])); }
            catch (error) { return false; }
        };
        if (state.activeSettings !== settingsState || settingsState.draft !== initialDraft) {
            const cleaned = await discard();
            return { ok: false, reason: 'settings-closed', rollbackFailed: !cleaned };
        }
        if (!slotUnchanged()) {
            const cleaned = await discard();
            return { ok: false, reason: 'asset-slot-changed', rollbackFailed: !cleaned };
        }
        const url = `igs-gen:${imported.imageId}`;
        if (kind === 'outfit-mood') {
            const isCurrent = () => state.activeSettings === settingsState
                && settingsState.draft === initialDraft && slotUnchanged();
            const guarded = await guardDefaultOutfitImages({ settingsState, options, dialogs, isCurrent },
                library, parts[0], parts[1], setOutfitSprite(outfit, baseSlot ? '默认' : key, url));
            if (!guarded.ok || !isCurrent() || (guarded.isCurrent && !guarded.isCurrent())) {
                const cleaned = await discard();
                return { ...(guarded.ok ? { ok: false, reason: 'asset-slot-changed' } : guarded),
                    rollbackFailed: !cleaned };
            }
        }
        const previousSlot = owner[key];
        owner[key] = kind === 'mood' || kind === 'outfit-mood' ? url : typeof previousSlot === 'string' ? url : { ...previousSlot, url };
        let persisted;
        try { persisted = persistSettingsDraft(); }
        catch (error) { persisted = { ok: false, reason: 'save-failed', saveError: error }; }
        if (operationFailed(persisted)) {
            owner[key] = previousSlot;
            const cleaned = persisted && persisted.rollbackFailed ? false : await discard();
            return { ...persisted, ok: false, reason: 'save-failed', rollbackFailed: Boolean((persisted && persisted.rollbackFailed) || !cleaned) };
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('status-avatar-pick:')) {
        const charName = decodeSeg(normalizedAction.slice('status-avatar-pick:'.length));
        const globalObj = options.global || globalThis;
        const doc = globalObj.document;
        if (!doc || !charName) return rerenderSettings();
        const picked = await (options.recoveryCheckpoint?.step('file:avatar-image', () => pickStatusAvatarFile(doc)) || pickStatusAvatarFile(doc));
        if (!picked) return rerenderSettings();
        if (picked.ok === false) {
            pageAlert(dialogs, globalObj, picked.reason === 'too-large' ? '图片过大，请选择更小的图片。' : '仅支持图片文件。');
            return rerenderSettings();
        }
        const stored = await storeAvatarImage(globalObj, options.generatedAssets, picked.dataUrl);
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        const avatars = normalizeStatusAvatars(sceneAssets.statusAvatars);
        const previous = avatars[charName];
        avatars[charName] = stored;
        sceneAssets.statusAvatars = avatars;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        await releaseAvatarImage(previous, settingsState, options);
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('status-avatar-generate:')) {
        const target = spriteAdoptionTarget(settingsState, decodeSeg(normalizedAction.slice('status-avatar-generate:'.length)));
        const charName = target.name;
        const globalObj = options.global || globalThis;
        const service = options.generatedAssets;
        if (!charName) return rerenderSettings();
        if (target.borrowed) return generatedOperationFailure(dialogs, globalObj,
            '角色资料来自其他角色卡，请先复制到当前卡后再生成头像。', 'DNA_ADOPTION_SCOPE');
        if (!service || typeof service.generateCharacterAvatar !== 'function') {
            return generationFailure(globalObj, dialogs, '头像生成当前不可用。', 'avatar-generate-unavailable');
        }
        let sceneAssets = target.library || {};
        const targetUnchanged = () => {
            const live = spriteAdoptionTarget(settingsState, charName);
            if (live.scope !== target.scope) return false;
            sceneAssets = live.library || sceneAssets;
            return true;
        };
        const had = Boolean(normalizeStatusAvatars(sceneAssets.statusAvatars)[charName]);
        const confirmed = await dialogs.confirm(had
            ? `重新生成「${charName}」的Q版头像，当前头像将被替换。`
            : `生成「${charName}」的Q版头像。`);
        if (!confirmed) return rerenderSettings();
        if (!targetUnchanged()) return generatedOperationFailure(dialogs, globalObj,
            '角色、默认衣装或作用域已变化，未启动头像生成。', 'stale-target');
        let result;
        const progress = startExpressionProgress(globalObj, `${charName}·Q版头像`);
        try {
            result = await service.generateCharacterAvatar({ name: charName, dna: characterExpressionDna(sceneAssets, charName),
                onProgress: progress.onProgress, shouldStart: targetUnchanged });
        } catch (error) {
            result = { ok: false, error: errorText(error, '') };
        }
        if (!result || !result.ok || !result.dataUrl || !targetUnchanged()) {
            progress.end();
            return generationFailure(globalObj, dialogs, `「${charName}」的Q版头像未能生成：${errorText(result && result.error, '未返回原因')}${had ? '\n原有头像保持不变。' : ''}`, 'avatar-generate-failed');
        }
        const stored = await storeAvatarImage(globalObj, service, result.dataUrl, { shrink: true });
        if (!targetUnchanged()) {
            progress.end();
            return generatedOperationFailure(dialogs, globalObj, '头像保存期间目标已变化，原头像保持不变。', 'stale-target');
        }
        const liveAssets = sceneAssets;
        const previousFields = captureAdoptionFields(liveAssets, ['statusAvatars']);
        const avatars = normalizeStatusAvatars(liveAssets.statusAvatars);
        const previous = avatars[charName];
        avatars[charName] = stored;
        liveAssets.statusAvatars = avatars;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) {
            restoreAdoptionFields(liveAssets, previousFields);
            const rolled = persisted.writeAttempted === false ? { ok: true } : persistSettingsDraft();
            progress.end();
            if (operationFailed(rolled)) return generatedAdoptionRollbackFailure(dialogs, globalObj,
                '头像采用失败，且无法恢复原设置。', persisted);
            return persisted;
        }
        await releaseAvatarImage(previous, settingsState, options);
        const rendered = await rerenderSettings();
        progress.end();
        showGeneratedNotice(globalObj, `「${charName}」的Q版头像已换上。`, 'info');
        return rendered;
    }

    // 角色学院、声线存在根素材库（和角色卡素材库分开），按主名记。
    if (normalizedAction.startsWith('char-house:') || normalizedAction.startsWith('char-voice:')) {
        const voice = normalizedAction.startsWith('char-voice:');
        const parts = normalizedAction.slice(voice ? 'char-voice:'.length : 'char-house:'.length).split(':');
        const field = voice ? parts.shift() : 'house';
        const charName = decodeSeg(parts[0]);
        const value = decodeSeg(parts[1]);
        if (!charName || RESERVED_ASSET_NAMES.includes(charName)) return { ok: false, error: '角色名无效' };
        const assets = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        if (voice) {
            if (!['pack', 'pitch', 'speed', 'tts', 'ttsThought', 'ttsVolume', 'ttsSpeed', 'ttsThoughtSpeed', 'ttsThoughtVolume', 'ttsStyle'].includes(field)) return { ok: false, error: '未知的声线设置' };
            const voices = assets.characterVoices = normalizeCharacterVoices(assets.characterVoices);
            const entry = normalizeCharacterVoice(voices[charName]);
            entry[field] = field === 'pack' || field === 'tts' || field === 'ttsThought' || field === 'ttsStyle' ? value : Number(value);
            const next = normalizeCharacterVoices({ [charName]: entry })[charName];
            if (next) voices[charName] = next;
            else delete voices[charName];
        } else {
            const houses = assets.characterHouses = normalizeCharacterHouses(assets.characterHouses);
            if (value) houses[charName] = value;
            else delete houses[charName];
            assets.characterHouses = normalizeCharacterHouses(houses);
        }
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    // 角色立绘高度和声线一样存在根素材库，按主名记；留空就删掉，回到自动。
    if (normalizedAction.startsWith('char-height:')) {
        const [rawName, rawValue] = normalizedAction.slice('char-height:'.length).split(':');
        const charName = decodeSeg(rawName);
        if (!charName || RESERVED_ASSET_NAMES.includes(charName)) return { ok: false, error: '角色名无效' };
        const assets = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        assets.characterSpriteScales = normalizeCharacterSpriteScales({ ...assets.characterSpriteScales, [charName]: decodeSeg(rawValue) });
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    // 数据页：朗读缓存只保留最近 N 条（0 即全清）。
    if (normalizedAction === 'tts-trim-cache') {
        const limit = normalizeTtsSettings(settingsState.draft.readerSettings && settingsState.draft.readerSettings.tts).cacheMax;
        const removed = await trimTtsCache(limit);
        settingsState.asyncState.ttsCacheStatus = `已清理 ${removed} 条朗读缓存，保留最近 ${limit} 条。`;
        return rerenderSettings();
    }
    if (normalizedAction.startsWith('tts-pool-toggle:')) {
        // 默认声音候选池：点选加入或移除一个声音，写回 api / system 的 female / male。
        const [, source, role, rawId] = normalizedAction.split(':');
        if ((source !== 'api' && source !== 'system') || (role !== 'female' && role !== 'male')) return { ok: false, error: '未知的默认声音' };
        const reader = settingsState.draft.readerSettings || (settingsState.draft.readerSettings = {});
        const tts = normalizeTtsSettings(reader.tts);
        reader.tts = { ...tts, [source]: { ...tts[source], [role]: toggleVoicePool(tts[source][role], decodeSeg(rawId)) } };
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }
    if (normalizedAction.startsWith('tts-voice-add:') || normalizedAction.startsWith('tts-voice-remove:') || normalizedAction.startsWith('tts-voice-edit:')) {
        // 声音库按条目增删改，写回 api / narratorApi 的 voices 文本。
        const [command, apiKey, rawIndex, part, rawValue] = normalizedAction.split(':');
        if (apiKey !== 'api' && apiKey !== 'narratorApi') return { ok: false, error: '未知的声音库' };
        const globalObj = options.global || globalThis;
        const reader = settingsState.draft.readerSettings || (settingsState.draft.readerSettings = {});
        const tts = normalizeTtsSettings(reader.tts);
        let change;
        if (command === 'tts-voice-add') {
            const id = ((await dialogs.prompt('声音 ID（接口里的声音名、音色 ID 或参考音频）：', '')) || '').trim();
            if (!id) return rerenderSettings();
            const title = ((await dialogs.prompt('显示名称（可留空）：', '')) || '').trim();
            change = { id, title };
        } else if (command === 'tts-voice-remove') {
            change = { index: Number(rawIndex), remove: true };
        } else {
            change = { index: Number(rawIndex), [part === 'id' ? 'id' : 'title']: decodeSeg(rawValue) };
        }
        const result = editTtsVoices(tts[apiKey].voices, change);
        if (!result.ok) {
            pageAlert(dialogs, globalObj, result.error);
            return rerenderSettings();
        }
        reader.tts = { ...tts, [apiKey]: { ...tts[apiKey], voices: result.text } };
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }
    if (normalizedAction.startsWith('tts-voice-batch')) {
        // 批量识别的展开状态与草稿文字只存在界面临时状态里，不进设置。
        const [command, apiKey] = normalizedAction.split(':');
        if (apiKey !== 'api' && apiKey !== 'narratorApi') return { ok: false, error: '未知的声音库' };
        const asyncState = settingsState.asyncState || (settingsState.asyncState = {});
        const batches = asyncState.ttsBatch || (asyncState.ttsBatch = {});
        const messageKey = apiKey === 'narratorApi' ? 'ttsNarratorVoicesMessage' : 'ttsVoicesMessage';
        if (command === 'tts-voice-batch') {
            batches[apiKey] = { open: true, text: (batches[apiKey] && batches[apiKey].text) || '' };
        } else if (command === 'tts-voice-batch-cancel') {
            delete batches[apiKey];
        } else if (command === 'tts-voice-batch-run') {
            const parsed = parseTtsVoiceBatch((batches[apiKey] && batches[apiKey].text) || '');
            if (!parsed.voices.length) {
                asyncState[messageKey] = parsed.unrecognized ? `没有识别到声音；${parsed.unrecognized} 行未识别。` : '没有可识别的内容。';
                return rerenderSettings();
            }
            const reader = settingsState.draft.readerSettings || (settingsState.draft.readerSettings = {});
            const tts = normalizeTtsSettings(reader.tts);
            const merged = mergeTtsVoices(tts[apiKey].voices, parsed.voices);
            reader.tts = { ...tts, [apiKey]: { ...tts[apiKey], voices: merged.text } };
            // 主接口的声音按名称自动分配给角色（只设台词声音，已指定的不覆盖）；旁白库不分配。
            let assigned = [];
            if (apiKey === 'api') {
                const assets = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
                const inLibrary = new Set(ttsVoiceEntries(merged.text).map(([id]) => id));
                assigned = matchBatchVoicesToCharacters(parsed.voices.filter(([id]) => inLibrary.has(id)), draftEffectiveAssets(settingsState) || {}, { skip: RESERVED_ASSET_NAMES });
                if (assigned.length) {
                    const voices = normalizeCharacterVoices(assets.characterVoices);
                    for (const [name, id] of assigned) voices[name] = normalizeCharacterVoices({ [name]: { ...normalizeCharacterVoice(voices[name]), tts: id } })[name];
                    assets.characterVoices = voices;
                }
            }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
            delete batches[apiKey];
            asyncState[messageKey] = `识别 ${parsed.voices.length} 个，新增 ${merged.added} 个（声音库共 ${merged.total} 个）`
                + (parsed.unrecognized ? `；${parsed.unrecognized} 行未识别` : '')
                + (merged.dropped ? `；已达 ${TTS_VOICE_MAX} 上限，其余 ${merged.dropped} 个未加入` : '') + '。'
                + (assigned.length ? `已自动分配给：${assigned.map(([name]) => name).join('、')}。` : '');
        }
        return rerenderSettings();
    }
    if (normalizedAction === 'tts-fetch-voices' || normalizedAction === 'tts-fetch-voices-narrator') {
        // 拉到的声音并进声音库（去重）；草稿是设置器自己的副本，这里换一份新的 tts 对象写回。
        // 旁白独立接口有自己的声音列表与提示信息。
        const narrator = normalizedAction === 'tts-fetch-voices-narrator';
        const messageKey = narrator ? 'ttsNarratorVoicesMessage' : 'ttsVoicesMessage';
        const apiKey = narrator ? 'narratorApi' : 'api';
        const reader = settingsState.draft.readerSettings || (settingsState.draft.readerSettings = {});
        const tts = normalizeTtsSettings(reader.tts);
        const result = await fetchTtsVoices(tts, { narrator });
        if (!result.ok) {
            settingsState.asyncState[messageKey] = `获取音色列表失败：${result.error}`;
            return rerenderSettings();
        }
        const merged = mergeTtsVoices(tts[apiKey].voices, result.voices);
        reader.tts = { ...tts, [apiKey]: { ...tts[apiKey], voices: merged.text } };
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        settingsState.asyncState[messageKey] = (result.builtin
            ? `接口没有返回自定义音色，已加入 ${merged.added} 个常用声音（声音库共 ${merged.total} 个）。`
            : `获取到 ${result.voices.length} 个音色，新增 ${merged.added} 个（声音库共 ${merged.total} 个）。`)
            + (merged.dropped ? `已达 ${TTS_VOICE_MAX} 个上限，其余 ${merged.dropped} 个未加入。` : '');
        return rerenderSettings();
    }
    // 试听失败的原因留在试听按钮旁，下次试听成功时清掉。
    const finishTtsPreview = (stateKey, result) => {
        const error = result && result.ok === false && result.error ? String(result.error) : '';
        if (error === (settingsState.asyncState[stateKey] || '')) return result;
        settingsState.asyncState[stateKey] = error;
        rerenderSettings();
        return result;
    };
    if (normalizedAction === 'tts-preview-narrator') {
        const result = await previewTts((settingsState.draft.readerSettings || {}).tts, { role: 'narrator' });
        return finishTtsPreview('ttsNarratorPreviewError', result);
    }
    if (normalizedAction === 'tts-preview' || normalizedAction.startsWith('tts-preview:') || normalizedAction.startsWith('tts-preview-thought:')) {
        // 试听台词朗读：可带角色名，按这个角色会用到的声音念；thought 试听心里话的声音。
        const reader = settingsState.draft.readerSettings || {};
        const thought = normalizedAction.startsWith('tts-preview-thought:');
        const charName = decodeSeg(normalizedAction.slice(thought ? 'tts-preview-thought:'.length : 'tts-preview:'.length));
        const assets = settingsState.draft.bridge.sceneAssets || {};
        const voice = charName ? resolveTtsVoice({ textType: thought ? 'thought' : 'dialogue', speaker: charName }, reader.tts, assets, listSystemVoices()) : null;
        const result = await previewTts(reader.tts, voice ? { role: voice.role, voice: voice.voice, speaker: charName, sceneAssets: assets, thought } : {});
        if (charName) {
            if (result && result.ok === false && result.error) showGeneratedNotice(options.global || globalThis, `试听失败：${result.error}`);
            return result;
        }
        return finishTtsPreview('ttsPreviewError', result);
    }
    if (normalizedAction.startsWith('voice-bark-preview:')) {
        const charName = decodeSeg(normalizedAction.slice('voice-bark-preview:'.length));
        const voice = resolveCharacterVoice(draftEffectiveAssets(settingsState), charName);
        if (voice.creature) {
            previewCreatureVoice(voice.creature, { pitch: voice.pitch, speed: voice.speed, volume: normalizeVoiceBarkSettings((settingsState.draft.readerSettings || {}).voiceBark).volume });
            return { ok: true, previewed: `creature:${voice.creature.kind}` };
        }
        if (!voice.pack) return { ok: false, error: '该角色当前未设置声线，请先选择一个声线' };
        previewVoicePack(voice.pack.id, { pitch: voice.pitch, speed: voice.speed, volume: normalizeVoiceBarkSettings((settingsState.draft.readerSettings || {}).voiceBark).volume });
        return { ok: true, previewed: voice.pack.id };
    }

    if (normalizedAction.startsWith('status-avatar-clear:')) {
        const charName = decodeSeg(normalizedAction.slice('status-avatar-clear:'.length));
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        const avatars = normalizeStatusAvatars(sceneAssets.statusAvatars);
        const previous = avatars[charName];
        delete avatars[charName];
        sceneAssets.statusAvatars = avatars;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        await releaseAvatarImage(previous, settingsState, options);
        return rerenderSettings();
    }

    if (normalizedAction === 'reset-virtual-regex') {
        settingsState.draft.bridge.virtualRegex = cloneData(DEFAULT_VIRTUAL_REGEX);
        settingsState.asyncState.virtualRegexPreview = '已恢复默认正文替换，已自动保存。';
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'test-virtual-regex') {
        settingsState.asyncState.virtualRegexPreview = buildRegexPreview(settingsState.draft.bridge);
        return rerenderSettings();
    }

    if (normalizedAction === 'add-virtual-regex') {
        const bridge = settingsState.draft.bridge = settingsState.draft.bridge || {};
        const virtualRegex = bridge.virtualRegex = bridge.virtualRegex || {};
        const rules = Array.isArray(virtualRegex.rules) ? virtualRegex.rules.slice() : [];
        rules.push({ pattern: '', flags: '', replacement: '' });
        virtualRegex.rules = rules;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('remove-virtual-regex:')) {
        const index = Number(normalizedAction.slice('remove-virtual-regex:'.length));
        const virtualRegex = settingsState.draft.bridge && settingsState.draft.bridge.virtualRegex;
        const rules = virtualRegex && Array.isArray(virtualRegex.rules) ? virtualRegex.rules.slice() : [];
        if (!Number.isInteger(index) || index < 0 || index >= rules.length) return rerenderSettings();
        rules.splice(index, 1);
        virtualRegex.rules = rules;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'fetch-nai-models') {
        settingsState.asyncState.naiModels = NAI_OFFICIAL_MODELS.slice();
        settingsState.asyncState.naiModelsMessage = `NAI官方没有模型列表接口，已载入内置${NAI_OFFICIAL_MODELS.length}个模型（V5 / V4.5 / V4）。`;
        return rerenderSettings();
    }

    if (normalizedAction === 'fetch-llm-models') {
        if (typeof options.fetchLlmModels !== 'function') {
            settingsState.asyncState.llmModelsMessage = '当前未接入备用模型拉取能力。';
            return rerenderSettings();
        }
        try {
            const result = await options.fetchLlmModels({ settings: cloneData(settingsState.draft) });
            if (!result || result.ok === false || !Array.isArray(result.models) || !result.models.length) {
                settingsState.asyncState.llmModelsMessage = String(result && (result.reason || result.error) || '备用模型拉取失败。');
                return rerenderSettings();
            }
            settingsState.asyncState.llmModels = result.models;
            settingsState.asyncState.llmModelsMessage = String(result.message || `已拉取${result.models.length}个备用模型。`);
        } catch (error) {
            settingsState.asyncState.llmModelsMessage = String(error && error.message || '备用模型拉取失败。');
        }
        return rerenderSettings();
    }

    if (normalizedAction === 'fetch-image-models') {
        if (typeof options.fetchImageModels !== 'function') {
            settingsState.asyncState.imageModelsMessage = '当前未接入内置图像模型拉取能力。';
            return rerenderSettings();
        }
        let result;
        try {
            result = await options.fetchImageModels({
                settings: cloneImageDraft(settingsState.draft),
                message: state.activeReader && state.activeReader.payload && state.activeReader.payload.message || null,
                mode: settingsState.readerMode,
            });
        } catch (error) {
            result = { ok: false, reason: `图像模型拉取失败：${error && error.message || error}` };
        }
        if (!result || result.ok === false) {
            settingsState.asyncState.imageModelsMessage = String(result && result.reason || '图像模型拉取失败');
            return rerenderSettings();
        }
        settingsState.draft.bridge.imageApi.availableModels = Array.isArray(result.models)
            ? result.models.filter(Boolean)
            : [];
        settingsState.draft.bridge.imageApi.modelsFetchedAt = String(result.modelsFetchedAt || new Date().toISOString());
        settingsState.asyncState.imageModelsMessage = String(result.message || `已拉取${settingsState.draft.bridge.imageApi.availableModels.length}个模型。`);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'image-log-refresh' || normalizedAction === 'image-log-clear' || normalizedAction === 'image-log-copy') {
        const log = options.imageJobLog;
        if (!log || typeof log.list !== 'function') {
            settingsState.asyncState.imageLogStatus = '当前未接入生图日志。';
            return rerenderSettings();
        }
        if (normalizedAction === 'image-log-clear') {
            const result = log.clear();
            settingsState.asyncState.imageLogStatus = `已清空${result.removed}条日志。`;
        } else if (normalizedAction === 'image-log-copy') {
            const text = formatImageJobLogText(log.list());
            const root = options.global || globalThis;
            const clipboard = root && root.navigator && root.navigator.clipboard;
            if (!text) {
                settingsState.asyncState.imageLogStatus = '暂无日志可复制。';
            } else if (clipboard && typeof clipboard.writeText === 'function') {
                try {
                    await clipboard.writeText(text);
                    settingsState.asyncState.imageLogStatus = '已复制全部日志到剪贴板。';
                } catch (error) {
                    settingsState.asyncState.imageLogStatus = '复制失败：浏览器拒绝访问剪贴板，可手动选中日志复制。';
                }
            } else {
                settingsState.asyncState.imageLogStatus = '当前环境不支持剪贴板，可手动选中日志复制。';
            }
        } else {
            const pruned = typeof log.prune === 'function' ? log.prune().removed : 0;
            settingsState.asyncState.imageLogStatus = pruned ? `已按自动清理规则移除${pruned}条旧日志。` : '';
        }
        return rerenderSettings();
    }

    if (normalizedAction === 'image-cg-page:prev' || normalizedAction === 'image-cg-page:next') {
        const asyncState = settingsState.asyncState;
        const view = asyncState.imageCg;
        if (!view) return rerenderSettings();
        const next = view.state.page + (normalizedAction === 'image-cg-page:next' ? 1 : -1);
        if (next < 0 || next >= view.state.pages) return rerenderSettings();
        if (asyncState.imageCgSelected instanceof Set) asyncState.imageCgSelected.clear();
        view.goto(next);
        return rerenderSettings();
    }

    // 生图 › CG 库「倒序」：最新在前 / 最早在前，回到第一页；和翻页一样清掉勾选，免得删掉看不见的格子。
    if (normalizedAction === 'image-cg-order') {
        const asyncState = settingsState.asyncState;
        const view = asyncState.imageCg;
        if (!view) return rerenderSettings();
        if (asyncState.imageCgSelected instanceof Set) asyncState.imageCgSelected.clear();
        view.setFilters({ oldestFirst: !view.state.filters.oldestFirst });
        return rerenderSettings();
    }

    if (normalizedAction === 'image-cache-status' || normalizedAction === 'image-files-retry-delete' || normalizedAction === 'image-records-retry-backup') {
        if (!options.media) return { ok: false, reason: 'media-unavailable' };
        try {
            if (normalizedAction === 'image-files-retry-delete') await options.media.retryDeletes();
            if (normalizedAction === 'image-records-retry-backup') await options.media.flush();
            const local = describeLocalStorageUsage((options.global || globalThis).localStorage, { topKeys: 5 });
            settingsState.asyncState.imageCacheStatus = `${describeMediaUsage(await options.media.stats())}${local ? `；${local}` : ''}`;
        } catch (error) { settingsState.asyncState.imageCacheStatus = `读取、备份或回收失败：${error.message}`; }
        return rerenderSettings();
    }

    // 一个清理入口覆盖原图、派生缩略图、对象 URL 与在途加载。
    if (normalizedAction === 'image-cache-clear' || normalizedAction === 'purge-asset-cache') {
        const hostGlobal = options.global || globalThis;
        await (options.media ? options.media.clearCache() : localImageCacheFor(hostGlobal).clear());
        options.generatedAssets?.clearCache?.(); options.illustrations?.clearCache?.(); options.itemImages?.clearCache?.();
        resetCgView(settingsState.asyncState);
        settingsState.asyncState.imageCacheStatus = options.media ? describeMediaUsage(await options.media.stats()) : '';
        settingsState.asyncState.imageCgStatus = normalizedAction === 'purge-asset-cache'
            ? '已清除素材缓存，图片与缩略图会在查看时重新读取。'
            : '已清空本地图片缓存。';
        return rerenderSettings();
    }

    // 生图 › CG 库「刷新」：丢掉当前列表，重绘时重新读目录并对账。
    if (normalizedAction === 'image-cg-refresh') {
        resetCgView(settingsState.asyncState);
        settingsState.asyncState.imageCgStatus = '';
        return rerenderSettings();
    }

    if (normalizedAction === 'image-cg-select-all' || normalizedAction.startsWith('image-cg-toggle:') || normalizedAction.startsWith('image-cg-delete:') || normalizedAction === 'image-cg-delete-selected' || normalizedAction === 'image-cg-delete-all') {
        return deleteCgEntries(normalizedAction, settingsState, options, dialogs, rerenderSettings);
    }

    if (normalizedAction === 'open-dbgen-settings') {
        const api = findDbgenApi(options.global || globalThis);
        if (!api || typeof api.openManagement !== 'function') {
            settingsState.asyncState.imageResult = '未检测到数据库生图插件，请确认已安装并启用。';
            return rerenderSettings();
        }
        await api.openManagement();
        return { ok: true };
    }

    if (normalizedAction === 'test-image') {
        if (typeof options.testImageApi !== 'function') {
            settingsState.asyncState.imageResult = '当前未接入图像测试能力。';
            return rerenderSettings();
        }
        let result;
        try {
            result = await options.testImageApi({
                settings: cloneImageDraft(settingsState.draft),
                message: state.activeReader && state.activeReader.payload && state.activeReader.payload.message || null,
                mode: settingsState.readerMode,
            });
        } catch (error) {
            result = { ok: false, message: `测试失败：${error && error.message || error}` };
        }
        settingsState.asyncState.imageResult = String(
            result && (result.message || result.error || result.reason)
            || (settingsState.draft.bridge.imageApi.mode === 'nai'
                ? '图像API生成测试失败。'
                : '插图扩展检测失败。'),
        );
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('toggle-toolbar-pin:')) {
        const id = normalizedAction.slice('toggle-toolbar-pin:'.length);
        const allowed = TOOLBAR_ACTIONS.some(([actionId]) => actionId === id);
        if (!allowed) return { ok: false, reason: 'unknown-toolbar-pin', id };
        const currentPins = Array.isArray(settingsState.draft.readerSettings.pinnedBtns)
            ? settingsState.draft.readerSettings.pinnedBtns.slice()
            : [];
        const currentHidden = Array.isArray(settingsState.draft.readerSettings.hiddenBtns)
            ? settingsState.draft.readerSettings.hiddenBtns.slice()
            : [];
        const index = currentPins.indexOf(id);
        if (index >= 0) {
            currentPins.splice(index, 1);
        } else {
            if (!currentHidden.includes(id)) {
                currentPins.push(id);
                // 固定到顶栏就从对话框快捷栏拿出来。
                settingsState.draft.readerSettings.dialogBarBtns = normalizeDialogBarButtons(settingsState.draft.readerSettings.dialogBarBtns).filter((dialogId) => dialogId !== id);
            }
        }
        settingsState.draft.readerSettings.pinnedBtns = currentPins;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('toolbar-toggle-dialog:')) {
        const id = normalizedAction.slice('toolbar-toggle-dialog:'.length);
        const allowed = id !== 'settings' && TOOLBAR_ACTIONS.some(([actionId]) => actionId === id);
        if (!allowed) return { ok: false, reason: 'unknown-toolbar-btn', id };
        const currentDialog = normalizeDialogBarButtons(settingsState.draft.readerSettings.dialogBarBtns);
        const index = currentDialog.indexOf(id);
        if (index >= 0) currentDialog.splice(index, 1);
        else {
            currentDialog.push(id);
            // 放进对话框下就不再固定在顶栏，两者互斥。
            const pins = Array.isArray(settingsState.draft.readerSettings.pinnedBtns) ? settingsState.draft.readerSettings.pinnedBtns : [];
            settingsState.draft.readerSettings.pinnedBtns = pins.filter((pinId) => pinId !== id);
        }
        settingsState.draft.readerSettings.dialogBarBtns = currentDialog;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('toolbar-toggle-visible:')) {
        const id = normalizedAction.slice('toolbar-toggle-visible:'.length);
        const allowed = TOOLBAR_ACTIONS.some(([actionId]) => actionId === id);
        if (!allowed) return { ok: false, reason: 'unknown-toolbar-btn', id };
        const currentHidden = Array.isArray(settingsState.draft.readerSettings.hiddenBtns)
            ? settingsState.draft.readerSettings.hiddenBtns.slice()
            : [];
        const idx = currentHidden.indexOf(id);
        if (idx >= 0) {
            currentHidden.splice(idx, 1);
        } else {
            currentHidden.push(id);
            const currentPins = Array.isArray(settingsState.draft.readerSettings.pinnedBtns)
                ? settingsState.draft.readerSettings.pinnedBtns.slice()
                : [];
            const pinIdx = currentPins.indexOf(id);
            if (pinIdx >= 0) {
                currentPins.splice(pinIdx, 1);
                settingsState.draft.readerSettings.pinnedBtns = currentPins;
            }
        }
        settingsState.draft.readerSettings.hiddenBtns = currentHidden;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('toolbar-reorder:')) {
        const canonical = TOOLBAR_ACTIONS.map(([actionId]) => actionId);
        const picked = normalizedAction.slice('toolbar-reorder:'.length).split(',').filter((id, i, all) => canonical.includes(id) && all.indexOf(id) === i);
        settingsState.draft.readerSettings.btnOrder = picked.concat(canonical.filter((id) => !picked.includes(id)));
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('shortcut-record:')) {
        const id = normalizedAction.slice('shortcut-record:'.length);
        if (!SHORTCUT_ACTIONS.some(([actionId]) => actionId === id)) return { ok: false, reason: 'unknown-shortcut', id };
        settingsState.asyncState.shortcutRecording = id;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('shortcut-set:')) {
        const rest = normalizedAction.slice('shortcut-set:'.length);
        const split = rest.indexOf(':');
        const id = split >= 0 ? rest.slice(0, split) : '';
        const combo = normalizeShortcutCombo(split >= 0 ? rest.slice(split + 1) : '');
        if (!SHORTCUT_ACTIONS.some(([actionId]) => actionId === id) || !combo) return { ok: false, reason: 'invalid-shortcut' };
        settingsState.draft.readerSettings.shortcuts = { ...(settingsState.draft.readerSettings.shortcuts || {}), [id]: [combo] };
        settingsState.asyncState.shortcutRecording = '';
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('shortcut-clear:') || normalizedAction.startsWith('shortcut-reset:')) {
        const isReset = normalizedAction.startsWith('shortcut-reset:');
        const prefix = isReset ? 'shortcut-reset:' : 'shortcut-clear:';
        const id = normalizedAction.slice(prefix.length);
        if (!SHORTCUT_ACTIONS.some(([actionId]) => actionId === id)) return { ok: false, reason: 'unknown-shortcut', id };
        const shortcuts = { ...(settingsState.draft.readerSettings.shortcuts || {}) };
        if (isReset) delete shortcuts[id];
        else shortcuts[id] = [];
        settingsState.draft.readerSettings.shortcuts = shortcuts;
        settingsState.asyncState.shortcutRecording = '';
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }


    if (normalizedAction.startsWith('toolbar-move-up:')) {
        const id = normalizedAction.slice('toolbar-move-up:'.length);
        const order = Array.isArray(settingsState.draft.readerSettings.btnOrder)
            ? settingsState.draft.readerSettings.btnOrder.slice()
            : TOOLBAR_ACTIONS.map(([actionId]) => actionId);
        const currentIndex = order.indexOf(id);
        if (currentIndex <= 0) return { ok: true, reason: 'already-first' };
        [order[currentIndex - 1], order[currentIndex]] = [order[currentIndex], order[currentIndex - 1]];
        settingsState.draft.readerSettings.btnOrder = order;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'reset-prompt-rule') {
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.promptRule = DEFAULT_SCENE_PROMPT_RULE;
        settingsState.asyncState.promptRuleDraft = DEFAULT_SCENE_PROMPT_RULE;
        settingsState.asyncState.promptRuleStatus = '已恢复默认提示词并保存。';
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'save-prompt-rule') {
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        const nextRule = typeof settingsState.asyncState.promptRuleDraft === 'string'
            ? settingsState.asyncState.promptRuleDraft
            : String(settingsState.draft.bridge.sceneAssets.promptRule || '');
        settingsState.draft.bridge.sceneAssets.promptRule = nextRule;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) {
            settingsState.asyncState.promptRuleStatus = '正在自动恢复保存。';
            return rerenderSettings();
        }
        settingsState.asyncState.promptRuleDraft = nextRule;
        settingsState.asyncState.promptRuleStatus = scenePromptRuleEnabled(settingsState.draft.bridge.sceneAssets)
            ? '提示词已保存并更新注入规则。'
            : '提示词已保存；自动注入已关闭，不会发送给聊天模型。';
        return rerenderSettings();
    }

    // 酒馆不认识 {{mood_groups}} 等占位符：复制的是通用标签规则 + 词表展开后的场景规则 + 示例，贴进预设即可单独使用。
    if (normalizedAction === 'copy-prompt-rule') {
        const assets = draftEffectiveAssets(settingsState) || {};
        const rule = normalizeScenePromptRule(typeof settingsState.asyncState.promptRuleDraft === 'string'
            ? settingsState.asyncState.promptRuleDraft
            : assets.promptRule);
        // 空词表留下的空行按按需注入的写法收掉。
        const { previousAiTexts } = collectPromptContext(getSillyTavernContext(options.global || globalThis));
        const sceneRule = resolvePromptRuleContent({ ...assets, promptRule: rule }, { previousAiTexts,
            sourceFilter: settingsState.draft.bridge.sourceFilter, virtualRegex: settingsState.draft.bridge.virtualRegex })
            .replace(/\n{2,}/g, '\n').trim();
        const text = buildTagGrammar({ readerSettings: {}, sceneRule, moodWord: firstMoodWord(assets) }).system;
        const nav = (options.global || globalThis).navigator;
        const copied = nav && nav.clipboard && typeof nav.clipboard.writeText === 'function'
            ? await Promise.resolve(nav.clipboard.writeText(text)).then(() => true, () => false)
            : false;
        settingsState.asyncState.promptRuleStatus = copied ? '已复制词表展开后的完整规则。' : '复制失败，请在弹窗中手动复制。';
        const turnOff = (scenePromptRuleEnabled(assets) ? '粘贴后请关闭「自动注入格式规则」，以免重复发送。' : '') + '衣装资料为复制时的静态快照，不会随下一轮自动更新。';
        if (typeof dialogs.edit === 'function') {
            await dialogs.edit(copied ? `已复制到剪贴板，可粘贴到酒馆预设中新建的提示词条目。${turnOff}` : '复制失败，请手动全选下方内容后复制。', text, { okLabel: '关闭' });
        }
        return rerenderSettings();
    }

    if (normalizedAction === 'scene-add-bg') {
        const globalObj = options.global || globalThis;
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        const library = draftAssetLibrary(settingsState, editTarget);
        library.scenes = library.scenes || {};
        const newName = ((await dialogs.prompt('新增场景，场景名：', nextFreeName('场景', library.scenes))) || '').trim();
        if (!newName) return rerenderSettings();
        if (RESERVED_ASSET_NAMES.includes(newName)) {
            pageAlert(dialogs, globalObj, `「${newName}」不能用作场景名`);
            return rerenderSettings();
        }
        if (Object.prototype.hasOwnProperty.call(library.scenes, newName)) {
            pageAlert(dialogs, globalObj, `场景「${newName}」已存在（同名）`);
            return rerenderSettings();
        }
        library.scenes[newName] = { url: '', times: {} };
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    // 素材库「新增 → 下载默认素材」：把内置默认背景包合并进当前场景素材，同名跳过、不覆盖，并归入默认文件夹。
    if (normalizedAction === 'scene-add-default-bg') {
        const globalObj = options.global || globalThis;
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        const merged = mergeDefaultBackgrounds(sceneAssets.scenes);
        if (!merged.added.length) {
            pageAlert(dialogs, globalObj, `默认素材已全部在素材库里（${merged.skipped.length}个同名场景已跳过）。`);
            return rerenderSettings();
        }
        const skippedNote = merged.skipped.length ? `已有的${merged.skipped.length}个同名场景会跳过，不覆盖。` : '';
        if (!await dialogs.confirm(`下载${merged.added.length}个默认背景到素材库？${skippedNote}`, { okLabel: '下载' })) return rerenderSettings();
        const previousScenes = sceneAssets.scenes;
        sceneAssets.scenes = merged.scenes;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) {
            sceneAssets.scenes = previousScenes;
            return persisted;
        }
        const { storage, scope } = assetFolderScope(settingsState, options);
        let folders = loadAssetFolders(storage, scope);
        for (const { name, folder } of merged.added) {
            if (!folder) continue;
            if (!folders.scenes.folders.includes(folder)) folders = addAssetFolder(folders, 'scenes', folder);
            folders = moveAssetToFolder(folders, 'scenes', name, folder);
        }
        saveAssetFolders(storage, scope, folders);
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-bg:')) {
        const name = decodeSeg(normalizedAction.slice('scene-remove-bg:'.length));
        forgetAssetFolderItem(settingsState, options, 'scenes', name);
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        draftAssetLibrary(settingsState, editTarget).scenes = draftAssetLibrary(settingsState, editTarget).scenes || {};
        delete draftAssetLibrary(settingsState, editTarget).scenes[name];
        for (const outfits of linkedCharacterOutfits(settingsState)) renameOutfitScene(outfits, name, '');
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-rename-bg:')) {
        const oldName = decodeSeg(normalizedAction.slice('scene-rename-bg:'.length));
        const globalObj = options.global || globalThis;
        const newName = ((await dialogs.prompt(`重命名场景「${oldName}」为：`, oldName)) || '').trim();
        if (newName && newName !== oldName) {
            settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
            const scenes = draftAssetLibrary(settingsState, editTarget).scenes || {};
            if (Object.prototype.hasOwnProperty.call(scenes, newName)) {
                pageAlert(dialogs, globalObj, `场景「${newName}」已存在同名条目，未作更改`);
                return rerenderSettings();
            }
            draftAssetLibrary(settingsState, editTarget).scenes = reorderKey(scenes, oldName, newName);
            for (const outfits of linkedCharacterOutfits(settingsState)) renameOutfitScene(outfits, oldName, newName);
            const sl = settingsState.asyncState.expandedSceneSlots;
            renameSetPrefix(sl, `bg\x00${oldName}`, `bg\x00${newName}`);
            renameSetPrefix(sl, `time\x00${oldName}\x00`, `time\x00${newName}\x00`);
            renameSetPrefix(sl, `weather\x00${oldName}\x00`, `weather\x00${newName}\x00`);
            syncAssetFolderItem(settingsState, options, 'scenes', oldName, newName);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-set-bg-url:')) {
        const rest = normalizedAction.slice('scene-set-bg-url:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const name = decodeSeg(rest.slice(0, colonIdx));
            const url = rest.slice(colonIdx + 1);
            settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
            draftAssetLibrary(settingsState, editTarget).scenes = draftAssetLibrary(settingsState, editTarget).scenes || {};
            const scene = draftAssetLibrary(settingsState, editTarget).scenes[name];
            if (scene && typeof scene === 'object') {
                scene.url = url;
            } else {
                draftAssetLibrary(settingsState, editTarget).scenes[name] = { url, times: {} };
            }
        }
        return { ok: true };
    }

    if (normalizedAction.startsWith('scene-add-time:')) {
        const sceneName = decodeSeg(normalizedAction.slice('scene-add-time:'.length));
        const globalObj = options.global || globalThis;
        const scenes = (settingsState.draft.bridge.sceneAssets || {}).scenes || {};
        const scene = scenes[sceneName];
        if (scene && typeof scene === 'object') {
            const newTime = ((await dialogs.prompt('时间名称（建议与时间组名一致）：', '')) || '').trim();
            if (!newTime) return rerenderSettings();
            scene.times = scene.times || {};
            if (Object.prototype.hasOwnProperty.call(scene.times, newTime)) {
                pageAlert(dialogs, globalObj, `「${sceneName}」已有时间「${newTime}」（同名）`);
                return rerenderSettings();
            }
            scene.times[newTime] = { url: '', weathers: {} };
            const timeGroups = ensureTimeGroups(settingsState);
            if (!timeGroups.some((g) => g.label === newTime)) timeGroups.unshift({ label: newTime, words: [newTime] });
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
            expandSceneTimes(settingsState, sceneName);
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-time:')) {
        const rest = normalizedAction.slice('scene-remove-time:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const sceneName = decodeSeg(rest.slice(0, colonIdx));
            const timeName = decodeSeg(rest.slice(colonIdx + 1));
            const scenes = settingsState.draft.bridge.sceneAssets && draftAssetLibrary(settingsState, editTarget).scenes || {};
            const scene = scenes[sceneName];
            if (scene && scene.times) delete scene.times[timeName];
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-rename-time:')) {
        const rest = normalizedAction.slice('scene-rename-time:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const sceneName = decodeSeg(rest.slice(0, colonIdx));
            const oldTime = decodeSeg(rest.slice(colonIdx + 1));
            const globalObj = options.global || globalThis;
            const newTime = ((await dialogs.prompt(`重命名时间「${oldTime}」为：`, oldTime)) || '').trim();
            if (newTime && newTime !== oldTime) {
                const scenes = settingsState.draft.bridge.sceneAssets && draftAssetLibrary(settingsState, editTarget).scenes || {};
                const scene = scenes[sceneName];
                if (scene && scene.times) {
                    if (Object.prototype.hasOwnProperty.call(scene.times, newTime)) {
                        pageAlert(dialogs, globalObj, `时间「${newTime}」已存在同名条目，未作更改`);
                        return rerenderSettings();
                    }
                    scene.times = reorderKey(scene.times, oldTime, newTime);
                    // global sync: rename same time slot in all other scenes
                    for (const [otherSn, otherSv] of Object.entries(scenes)) {
                        if (otherSn === sceneName || !otherSv || typeof otherSv !== 'object') continue;
                        if (Object.prototype.hasOwnProperty.call(otherSv.times || {}, oldTime)
                            && !Object.prototype.hasOwnProperty.call(otherSv.times, newTime)) {
                            otherSv.times = reorderKey(otherSv.times, oldTime, newTime);
                        }
                    }
                    // sync timeGroups label
                    const timeGroups = ensureTimeGroups(settingsState);
                    const tg = timeGroups.find((g) => g.label === oldTime);
                    if (tg) {
                        tg.label = newTime;
                        const wi = Array.isArray(tg.words) ? tg.words.indexOf(oldTime) : -1;
                        if (wi >= 0) tg.words[wi] = newTime;
                    }
                    // update Set keys for all scenes
                    const sl = settingsState.asyncState.expandedSceneSlots;
                    for (const sn of Object.keys(scenes)) {
                        renameSetPrefix(sl, `time\x00${sn}\x00${oldTime}`, `time\x00${sn}\x00${newTime}`);
                        renameSetPrefix(sl, `weather\x00${sn}\x00${oldTime}\x00`, `weather\x00${sn}\x00${newTime}\x00`);
                    }
                    const persisted = persistSettingsDraft();
                    if (persisted.ok === false) return persisted;
                }
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-set-time-url:')) {
        const rest = normalizedAction.slice('scene-set-time-url:'.length);
        const first = rest.indexOf(':');
        if (first > 0) {
            const sceneName = decodeSeg(rest.slice(0, first));
            const after = rest.slice(first + 1);
            const second = after.indexOf(':');
            if (second > 0) {
                const timeName = decodeSeg(after.slice(0, second));
                const url = after.slice(second + 1);
                const scenes = settingsState.draft.bridge.sceneAssets && draftAssetLibrary(settingsState, editTarget).scenes || {};
                const scene = scenes[sceneName];
                if (scene && scene.times && scene.times[timeName] != null) {
                    const t = scene.times[timeName];
                    if (typeof t === 'object') t.url = url;
                    else scene.times[timeName] = { url, weathers: {} };
                    const persisted = persistSettingsDraft();
                    if (persisted.ok === false) return persisted;
                }
            }
        }
        return { ok: true };
    }

    if (normalizedAction.startsWith('scene-add-weather:')) {
        const rest = normalizedAction.slice('scene-add-weather:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const sceneName = decodeSeg(rest.slice(0, colonIdx));
            const timeName = decodeSeg(rest.slice(colonIdx + 1));
            const globalObj = options.global || globalThis;
            const scenes = (settingsState.draft.bridge.sceneAssets || {}).scenes || {};
            const scene = scenes[sceneName];
            if (scene && scene.times && typeof scene.times[timeName] === 'object') {
                const timeEntry = scene.times[timeName];
                const newWeather = ((await dialogs.prompt('天气名称（建议与天气组名一致）：', '')) || '').trim();
                if (!newWeather) return rerenderSettings();
                timeEntry.weathers = timeEntry.weathers || {};
                if (Object.prototype.hasOwnProperty.call(timeEntry.weathers, newWeather)) {
                    pageAlert(dialogs, globalObj, `「${timeName}」已有天气「${newWeather}」（同名）`);
                    return rerenderSettings();
                }
                timeEntry.weathers[newWeather] = { url: '' };
                const weatherGroups = ensureWeatherGroups(settingsState);
                if (!weatherGroups.some((g) => g.label === newWeather)) weatherGroups.unshift({ label: newWeather, words: [newWeather] });
                expandSceneTimes(settingsState, sceneName);
                const persisted = persistSettingsDraft();
                if (persisted.ok === false) return persisted;
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-weather:')) {
        const rest = normalizedAction.slice('scene-remove-weather:'.length);
        const first = rest.indexOf(':');
        if (first > 0) {
            const sceneName = decodeSeg(rest.slice(0, first));
            const after = rest.slice(first + 1);
            const second = after.indexOf(':');
            if (second > 0) {
                const timeName = decodeSeg(after.slice(0, second));
                const weatherName = decodeSeg(after.slice(second + 1));
                const scenes = settingsState.draft.bridge.sceneAssets && draftAssetLibrary(settingsState, editTarget).scenes || {};
                const scene = scenes[sceneName];
                if (scene && scene.times && scene.times[timeName]) {
                    const t = scene.times[timeName];
                    if (t && t.weathers) delete t.weathers[weatherName];
                }
                const persisted = persistSettingsDraft();
                if (persisted.ok === false) return persisted;
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-rename-weather:')) {
        const rest = normalizedAction.slice('scene-rename-weather:'.length);
        const first = rest.indexOf(':');
        if (first > 0) {
            const sceneName = decodeSeg(rest.slice(0, first));
            const after = rest.slice(first + 1);
            const second = after.indexOf(':');
            if (second > 0) {
                const timeName = decodeSeg(after.slice(0, second));
                const oldWeather = decodeSeg(after.slice(second + 1));
                const globalObj = options.global || globalThis;
                const newWeather = ((await dialogs.prompt(`重命名天气「${oldWeather}」为：`, oldWeather)) || '').trim();
                if (newWeather && newWeather !== oldWeather) {
                    const scenes = settingsState.draft.bridge.sceneAssets && draftAssetLibrary(settingsState, editTarget).scenes || {};
                    const scene = scenes[sceneName];
                    if (scene && scene.times && scene.times[timeName]) {
                        const t = scene.times[timeName];
                        if (t && t.weathers) {
                            if (Object.prototype.hasOwnProperty.call(t.weathers, newWeather)) {
                                pageAlert(dialogs, globalObj, `天气「${newWeather}」已存在同名条目，未作更改`);
                                return rerenderSettings();
                            }
                            // global sync: rename same weather slot across all scenes/times
                            for (const [gsn, gsv] of Object.entries(scenes)) {
                                if (!gsv || typeof gsv !== 'object') continue;
                                for (const [gtn, gtv] of Object.entries(gsv.times || {})) {
                                    if (!gtv || typeof gtv !== 'object') continue;
                                    const gw = gtv.weathers || {};
                                    if (Object.prototype.hasOwnProperty.call(gw, oldWeather)
                                        && !Object.prototype.hasOwnProperty.call(gw, newWeather)) {
                                        const ow = gw[oldWeather];
                                        gw[oldWeather] = typeof ow === 'string' ? { url: ow } : (ow || { url: '' });
                                        gtv.weathers = reorderKey(gw, oldWeather, newWeather);
                                    }
                                }
                            }
                            // sync weatherGroups label
                            const weatherGroups = ensureWeatherGroups(settingsState);
                            const wg = weatherGroups.find((g) => g.label === oldWeather);
                            if (wg) {
                                wg.label = newWeather;
                                const wi = Array.isArray(wg.words) ? wg.words.indexOf(oldWeather) : -1;
                                if (wi >= 0) wg.words[wi] = newWeather;
                            }
                            // update Set keys for all scenes/times
                            const sl = settingsState.asyncState.expandedSceneSlots;
                            for (const [gsn2, gsv2] of Object.entries(scenes)) {
                                if (!gsv2 || typeof gsv2 !== 'object') continue;
                                for (const gtn2 of Object.keys(gsv2.times || {})) {
                                    renameSetPrefix(sl, `weather\x00${gsn2}\x00${gtn2}\x00${oldWeather}`, `weather\x00${gsn2}\x00${gtn2}\x00${newWeather}`);
                                }
                            }
                            const persisted = persistSettingsDraft();
                            if (persisted.ok === false) return persisted;
                        }
                    }
                }
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-set-weather-url:')) {
        const rest = normalizedAction.slice('scene-set-weather-url:'.length);
        const first = rest.indexOf(':');
        if (first > 0) {
            const sceneName = decodeSeg(rest.slice(0, first));
            const after = rest.slice(first + 1);
            const second = after.indexOf(':');
            if (second > 0) {
                const timeName = decodeSeg(after.slice(0, second));
                const after2 = after.slice(second + 1);
                const third = after2.indexOf(':');
                if (third > 0) {
                    const weatherName = decodeSeg(after2.slice(0, third));
                    const url = after2.slice(third + 1);
                    const scenes = settingsState.draft.bridge.sceneAssets && draftAssetLibrary(settingsState, editTarget).scenes || {};
                    const scene = scenes[sceneName];
                    if (scene && scene.times && scene.times[timeName]) {
                        const t = scene.times[timeName];
                        if (t && t.weathers) {
                        const existing = t.weathers[weatherName];
                        if (existing && typeof existing === 'object') {
                            existing.url = url;
                        } else {
                            t.weathers[weatherName] = { url, words: [] };
                        }
                    }
                    }
                }
            }
        }
        return { ok: true };
    }

    const outfitResult = handleOutfitAction(normalizedAction, { settingsState, options, persistSettingsDraft, rerenderSettings, dialogs, isCurrent: () => state.activeSettings === settingsState, rerun: (next) => handleSettingsAction(next, ctx) });
    if (outfitResult) return outfitResult;
    const eventCgResult = handleEventCgAction(normalizedAction, { settingsState, options, persistSettingsDraft, rerenderSettings, dialogs,
        pickImage: () => { const g = options.global || globalThis; return g.document ? pickAssetImageFile(g.document, g) : null; } });
    if (eventCgResult) return eventCgResult;

    if (normalizedAction === 'scene-add-char') {
        const globalObj = options.global || globalThis;
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        const library = draftAssetLibrary(settingsState, editTarget);
        library.characters = library.characters || {};
        const newName = ((await dialogs.prompt('新增角色，角色名：', nextFreeName('角色', library.characters))) || '').trim();
        if (!newName) return rerenderSettings();
        const aliases = ensureCharacterAliases(settingsState, editTarget);
        const aliasOwner = Object.keys(aliases).find((name) => Array.isArray(aliases[name]) && aliases[name].includes(newName));
        const blocked = RESERVED_ASSET_NAMES.includes(newName) ? `「${newName}」不能用作角色名`
            : Object.prototype.hasOwnProperty.call(library.characters, newName) ? `角色「${newName}」已存在（同名）`
                : aliasOwner ? `「${newName}」已是角色「${aliasOwner}」的别名` : '';
        if (blocked) {
            pageAlert(dialogs, globalObj, blocked);
            return rerenderSettings();
        }
        library.characters[newName] = { '默认': '' };
        aliases[newName] = [];
        settingsState.asyncState.advancedOpen = { ...(settingsState.asyncState.advancedOpen || {}), [`char-open:${newName}`]: true };
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('char-upgrade-dna:')) {
        const target = spriteAdoptionTarget(settingsState, decodeSeg(normalizedAction.slice('char-upgrade-dna:'.length)));
        if (!target.name || !target.library || target.borrowed) return { ok: false, reason: 'DNA_ADOPTION_SCOPE' };
        const source = normalizeCharacterDna(target.library.characterDna?.[target.name]);
        if (source.version === 2) return rerenderSettings();
        if (!await dialogs.confirm(`为「${target.name}」启用内置生图的三景别 DNA？旧字段保留；使用内置 NAI 生成立绘时补齐景别资料。外部来源仅接收文字参考，继续使用自己的生成逻辑。现有立绘继续使用。`)) return rerenderSettings();
        const live = spriteAdoptionTarget(settingsState, target.name);
        if (live.scope !== target.scope)
            return { ok: false, reason: 'DNA_ADOPTION_CONFLICT' };
        const previous = captureAdoptionFields(target.library, ['characterDna']);
        target.library.characterDna = { ...target.library.characterDna, [target.name]: { ...source, version: 2 } };
        const saved = persistGeneratedLibrary(persistSettingsDraft);
        if (operationFailed(saved)) { restoreAdoptionFields(target.library, previous); return saved; }
        return rerenderSettings();
    }

    // 非人角色档案：写在角色所属库的 characterDna[名].creature，写时浅拷，不改共享对象。
    if (normalizedAction.startsWith('char-creature:')) {
        const [field, rawName, rawValue] = normalizedAction.slice('char-creature:'.length).split(':');
        const target = spriteAdoptionTarget(settingsState, decodeSeg(rawName));
        if (!target.name || !target.library || target.borrowed || RESERVED_ASSET_NAMES.includes(target.name)) return { ok: false, error: '角色名无效' };
        const map = target.library.characterDna && typeof target.library.characterDna === 'object' ? target.library.characterDna : {};
        const next = editCharacterCreature(Object.hasOwn(map, target.name) ? map[target.name] : null, field, decodeSeg(rawValue));
        if (!next) return rerenderSettings();
        target.library.characterDna = { ...map, [target.name]: next };
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        // 从 ⋯ 菜单启用后直接展开「角色设定」，档案各项在那里调整。
        if (field === 'enabled' && storedCreatureOf(next)) {
            const open = settingsState.asyncState.advancedOpen || {};
            settingsState.asyncState.advancedOpen = { ...open, [`char-dna:${target.name}`]: true };
        }
        return rerenderSettings();
    }

    // DNA-only 角色：先登记资料、后补立绘；主名与别名沿用既有冲突规则。
    if (normalizedAction === 'scene-add-dna-char' || normalizedAction.startsWith('scene-rename-dna-char:')) {
        const globalObj = options.global || globalThis;
        const renaming = normalizedAction !== 'scene-add-dna-char';
        const oldName = renaming ? decodeSeg(normalizedAction.slice('scene-rename-dna-char:'.length)) : '';
        const name = ((await dialogs.prompt(renaming ? `重命名外貌（DNA）「${oldName}」为：` : '新增只登记外貌的角色，角色名：', oldName)) || '').trim();
        if (!name || name === oldName) return rerenderSettings();
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        const characters = sceneAssets.characters || {};
        const aliases = ensureCharacterAliases(settingsState, editTarget);
        const alertFn = (msg) => { pageAlert(dialogs, globalObj, msg); };
        if (RESERVED_ASSET_NAMES.includes(name)) { alertFn(`「${name}」不能用作角色名`); return rerenderSettings(); }
        const aliasOwner = Object.keys(aliases).find((n) => Array.isArray(aliases[n]) && aliases[n].includes(name));
        if (aliasOwner) { alertFn(`「${name}」已是角色「${aliasOwner}」的别名，请编辑主角色的DNA。`); return rerenderSettings(); }
        const dnaMap = normalizeCharacterDnaMap(sceneAssets.characterDna);
        if (renaming) {
            if (Object.prototype.hasOwnProperty.call(characters, oldName)) return rerenderSettings();
            if (Object.prototype.hasOwnProperty.call(characters, name)) { alertFn(`角色「${name}」已存在（同名）`); return rerenderSettings(); }
            const result = renameCharacterDna(dnaMap, oldName, name);
            if (!result.ok) { alertFn(`外貌（DNA）中已有「${name}」，未作更改`); return rerenderSettings(); }
            sceneAssets.characterDna = result.map;
        } else {
            if (Object.prototype.hasOwnProperty.call(dnaMap, name)) { alertFn(`角色「${name}」已有DNA`); return rerenderSettings(); }
            dnaMap[name] = normalizeCharacterDna(null);
            sceneAssets.characterDna = dnaMap;
        }
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    // 一键主角：读酒馆当前用户名与人设，登记为 DNA 角色、归进「主角」文件夹，再走默认立绘生成；人设预填成这次的立绘说明。
    if (normalizedAction === 'scene-add-user-char') {
        const globalObj = options.global || globalThis;
        const st = getSillyTavernContext(globalObj) || {};
        const name = String(st.name1 || '').trim();
        const alertFn = (msg) => { if (globalObj.alert) globalObj.alert(msg); };
        if (!name || ['__proto__', 'constructor', 'prototype'].includes(name)) { alertFn('没读到酒馆的用户名，请先在酒馆里选好用户设定'); return rerenderSettings(); }
        const persona = String((st.powerUserSettings && st.powerUserSettings.persona_description) || '')
            .replace(/\{\{user\}\}/gi, name).replace(/\s+/g, ' ').trim().slice(0, 600);
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        const aliases = ensureCharacterAliases(settingsState, editTarget);
        const aliasOwner = Object.keys(aliases).find((n) => Array.isArray(aliases[n]) && aliases[n].includes(name));
        if (aliasOwner) { alertFn(`「${name}」已是角色「${aliasOwner}」的别名`); return rerenderSettings(); }
        const dnaMap = normalizeCharacterDnaMap(sceneAssets.characterDna);
        const known = Object.prototype.hasOwnProperty.call(sceneAssets.characters || {}, name) || Object.prototype.hasOwnProperty.call(dnaMap, name);
        if (!known) {
            dnaMap[name] = normalizeCharacterDna(null);
            sceneAssets.characterDna = dnaMap;
        }
        const notes = sceneAssets.characterSpriteNotes && typeof sceneAssets.characterSpriteNotes === 'object' ? sceneAssets.characterSpriteNotes : (sceneAssets.characterSpriteNotes = {});
        if (persona && !String(notes[name] || '').trim()) notes[name] = persona;
        if (!String(sceneAssets.userCharacter || '').trim()) sceneAssets.userCharacter = name;
        const { storage, scope } = assetFolderScope(settingsState, options);
        let folders = loadAssetFolders(storage, scope);
        if (!folders.characters.folders.includes('主角')) folders = addAssetFolder(folders, 'characters', '主角');
        saveAssetFolders(storage, scope, moveAssetToFolder(folders, 'characters', name, '主角'));
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return handleSettingsAction(`char-generate-sprite:${encodeURIComponent(name)}`, ctx);
    }

    // 指定 / 取消某角色为User立绘：同卡只能一个，再点同一人则清空。
    if (normalizedAction.startsWith('scene-set-user-char:')) {
        const name = decodeSeg(normalizedAction.slice('scene-set-user-char:'.length));
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        sceneAssets.userCharacter = String(sceneAssets.userCharacter || '').trim() === name ? '' : name;
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-dna-char:')) {
        const name = decodeSeg(normalizedAction.slice('scene-remove-dna-char:'.length));
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        const globalObj = options.global || globalThis;
        if (!await dialogs.confirm(`删除角色「${name}」的外貌（DNA）？`)) return rerenderSettings();
        sceneAssets.characterDna = removeCharacterDna(sceneAssets.characterDna, name);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    // 历史混合 tag 只供查看；旧按钮或迟到动作也不能重新写人物 DNA 的服装字段。
    if (normalizedAction === 'scene-accept-dna-candidate') {
        pageAlert(dialogs, options.global || globalThis, '此记录不能直接作为默认外观。请在命名衣装中保存服装 DNA，再选择有可用立绘的衣装为默认。');
        return { ok: false, reason: 'legacy-dna-candidate-read-only' };
    }

    if (normalizedAction === 'scene-dismiss-dna-candidate') {
        settingsState.asyncState.dnaCandidate = null;
        return rerenderSettings();
    }

    // 生图设置页的「管理角色 DNA」只跳转到「角色」页，DNA 仍只有一份权威数据。
    if (normalizedAction === 'open-character-dna') {
        openSettingsPage(settingsState, 'chars');
        return rerenderSettings();
    }

    // 角色立绘区「＋」菜单里的「Live2D模型（高级）」：展开角色页上的 Live2D 面板，不写任何存储。
    if (normalizedAction === 'live2d-open') {
        openSettingsPage(settingsState, 'chars');
        settingsState.asyncState.advancedOpen = { ...(settingsState.asyncState.advancedOpen || {}), 'live2d-library': true };
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-char:')) {
        const name = decodeSeg(normalizedAction.slice('scene-remove-char:'.length));
        // 整次编辑固定所属库，不能在删掉角色字段后重新解析到全局同名角色。
        const library = draftAssetLibrary(settingsState, editTarget);
        const previous = { ...library };
        const reader = settingsState.draft.readerSettings;
        const previousReader = { ...reader };
        if (library.userCharacter === name) library.userCharacter = '';
        if (library.generated) {
            library.generated = { ...library.generated };
            for (const field of ['characters', 'characterAliases']) {
                const remaining = { ...library.generated[field] };
                delete remaining[name];
                library.generated[field] = remaining;
            }
        }
        for (const field of [...CHARACTER_FIELDS, 'characterHouses', 'characterVoices',
            'characterSpriteScales', 'characterSpriteNotes', 'characterMoodTiers', 'characterMoodNotes']) {
            if (!library[field] || !Object.hasOwn(library[field], name)) continue;
            library[field] = { ...library[field] };
            delete library[field][name];
        }
        migrateExpressionNotes(library, { character: name }, null);
        migrateSpriteKeys(reader, { character: name }, null);
        let persisted;
        try { persisted = persistSettingsDraft(); }
        catch (error) { persisted = { ok: false, reason: 'save-failed', saveError: error }; }
        if (operationFailed(persisted)) {
            for (const key of Object.keys(library)) if (!Object.hasOwn(previous, key)) delete library[key];
            Object.assign(library, previous);
            if (reader) Object.assign(reader, previousReader);
            rerenderSettings();
            return persisted || { ok: false, reason: 'save-failed' };
        }
        delete settingsState.asyncState.outfitTabs?.[name];
        forgetAssetFolderItem(settingsState, options, 'characters', name);
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-add-char-alias:')) {
        const charName = decodeSeg(normalizedAction.slice('scene-add-char-alias:'.length));
        const globalObj = options.global || globalThis;
        const alias = ((await dialogs.prompt(`为角色「${charName}」添加别名：`, '')) || '').trim();
        if (!alias) return rerenderSettings();
        const sceneAssets = draftAssetLibrary(settingsState, editTarget);
        const characters = sceneAssets.characters || {};
        const aliases = ensureCharacterAliases(settingsState, editTarget);
        if (Object.prototype.hasOwnProperty.call(characters, alias)) {
            pageAlert(dialogs, globalObj, `「${alias}」已是角色主名称`);
            return rerenderSettings();
        }
        const duplicateOwner = Object.keys(aliases).find((name) => Array.isArray(aliases[name]) && aliases[name].includes(alias));
        if (duplicateOwner) {
            pageAlert(dialogs, globalObj, `别名「${alias}」已属于角色「${duplicateOwner}」`);
            return rerenderSettings();
        }
        if (!Object.prototype.hasOwnProperty.call(characters, charName)) return rerenderSettings();
        aliases[charName].push(alias);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-char-alias:')) {
        const rest = normalizedAction.slice('scene-remove-char-alias:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const charName = decodeSeg(rest.slice(0, colonIdx));
            const alias = decodeSeg(rest.slice(colonIdx + 1));
            const aliases = ensureCharacterAliases(settingsState, editTarget);
            aliases[charName] = (aliases[charName] || []).filter((value) => value !== alias);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-add-mood:')) {
        const charName = decodeSeg(normalizedAction.slice('scene-add-mood:'.length));
        const globalObj = options.global || globalThis;
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        draftAssetLibrary(settingsState, editTarget).characters = draftAssetLibrary(settingsState, editTarget).characters || {};
        const char = draftAssetLibrary(settingsState, editTarget).characters[charName];
        if (char && typeof char === 'object') {
            const newMood = ((await dialogs.prompt('情绪名称（建议与情绪组名一致）：', '')) || '').trim();
            if (!newMood) return rerenderSettings();
            if (Object.prototype.hasOwnProperty.call(char, newMood)) {
                pageAlert(dialogs, globalObj, `「${charName}」已有「${newMood}」情绪（同名）`);
                return rerenderSettings();
            }
            char[newMood] = '';
            // 槽名若在词库中无对应组，自动建组并把组名作为第一个词
            const groups = ensureMoodGroups(settingsState);
            if (!groups.some((g) => g.label === newMood)) {
                groups.unshift({ label: newMood, words: [newMood] });
            }
        }
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-mood:')) {
        const rest = normalizedAction.slice('scene-remove-mood:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const charName = decodeSeg(rest.slice(0, colonIdx));
            const mood = decodeSeg(rest.slice(colonIdx + 1));
            settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
            draftAssetLibrary(settingsState, editTarget).characters = draftAssetLibrary(settingsState, editTarget).characters || {};
            const char = draftAssetLibrary(settingsState, editTarget).characters[charName];
            if (char && typeof char === 'object') delete char[mood];
            migrateSpriteKeys(settingsState.draft.readerSettings, { character: charName, outfit: '', mood }, null);
        }
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-set-mood-url:')) {
        const rest = normalizedAction.slice('scene-set-mood-url:'.length);
        const firstColon = rest.indexOf(':');
        if (firstColon > 0) {
            const charName = decodeSeg(rest.slice(0, firstColon));
            const afterChar = rest.slice(firstColon + 1);
            const secondColon = afterChar.indexOf(':');
            if (secondColon > 0) {
                const mood = decodeSeg(afterChar.slice(0, secondColon));
                const url = afterChar.slice(secondColon + 1);
                settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
                draftAssetLibrary(settingsState, editTarget).characters = draftAssetLibrary(settingsState, editTarget).characters || {};
                if (!draftAssetLibrary(settingsState, editTarget).characters[charName]) {
                    draftAssetLibrary(settingsState, editTarget).characters[charName] = {};
                }
                draftAssetLibrary(settingsState, editTarget).characters[charName][mood] = url;
            }
        }
        return { ok: true };
    }

    if (normalizedAction.startsWith('scene-rename-char:')) {
        const oldName = decodeSeg(normalizedAction.slice('scene-rename-char:'.length));
        const globalObj = options.global || globalThis;
        const initialDraft = settingsState.draft;
        const initialScope = settingsState.asyncState.assetScopeKey;
        let sceneAssets = draftAssetLibrary(settingsState, editTarget);
        const newName = ((await dialogs.prompt(`重命名角色「${oldName}」为：`, oldName)) || '').trim();
        if (newName && newName !== oldName) {
            if (state.activeSettings !== settingsState || settingsState.draft !== initialDraft
                || settingsState.asyncState.assetScopeKey !== initialScope
                || !Object.hasOwn(draftAssetLibrary(settingsState, editTarget).characters || {}, oldName))
                return { ok: false, reason: 'OUTFIT_ADOPTION_CONFLICT', error: '角色或作用域已变化，请重新改名' };
            sceneAssets = draftAssetLibrary(settingsState, editTarget);
            const chars = sceneAssets.characters || {};
            const aliases = sceneAssets.characterAliases || {};
            if (Object.prototype.hasOwnProperty.call(chars, newName)) {
                pageAlert(dialogs, globalObj, `角色「${newName}」已存在（同名）`);
                return rerenderSettings();
            }
            const aliasOwner = Object.keys(aliases).find((name) => Array.isArray(aliases[name]) && aliases[name].includes(newName));
            if (aliasOwner) {
                pageAlert(dialogs, globalObj, `「${newName}」已是角色「${aliasOwner}」的别名`);
                return rerenderSettings();
            }
            const dnaRename = renameCharacterDna(sceneAssets.characterDna, oldName, newName);
            if (!dnaRename.ok) {
                pageAlert(dialogs, globalObj, dnaRename.reason === 'name-exists' ? `外貌（DNA）中已有「${newName}」，改名会覆盖其资料，因此未作更改` : `「${newName}」不能用作角色名`);
                return rerenderSettings();
            }
            const rootAssets = settingsState.draft.bridge.sceneAssets;
            const previous = { ...sceneAssets };
            const previousRoot = { ...rootAssets };
            const reader = settingsState.draft.readerSettings;
            const previousReader = { ...reader };
            const hasGlobalNamesake = rootAssets !== sceneAssets && CHARACTER_FIELDS.some(field =>
                Object.hasOwn(rootAssets[field] || {}, oldName));
            sceneAssets.characters = reorderKey(chars, oldName, newName);
            if (sceneAssets.userCharacter === oldName) sceneAssets.userCharacter = newName;
            sceneAssets.characterAliases = reorderKey(aliases, oldName, newName);
            if (sceneAssets.statusAvatars && typeof sceneAssets.statusAvatars === 'object') {
                sceneAssets.statusAvatars = reorderKey(sceneAssets.statusAvatars, oldName, newName);
            }
            if (sceneAssets.characterHouses && typeof sceneAssets.characterHouses === 'object') {
                sceneAssets.characterHouses = reorderKey(sceneAssets.characterHouses, oldName, newName);
            }
            if (!hasGlobalNamesake && rootAssets !== sceneAssets && rootAssets.characterHouses && typeof rootAssets.characterHouses === 'object') {
                rootAssets.characterHouses = reorderKey(rootAssets.characterHouses, oldName, newName);
            }
            // 角色声线、立绘高度和学院一样存在根素材库，按主名记。
            for (const assets of new Set(hasGlobalNamesake ? [sceneAssets] : [sceneAssets, rootAssets])) {
                for (const field of ['characterVoices', 'characterSpriteScales']) {
                    if (assets && assets[field] && typeof assets[field] === 'object') {
                        assets[field] = reorderKey(assets[field], oldName, newName);
                    }
                }
            }
            if (sceneAssets.characterDna && typeof sceneAssets.characterDna === 'object') {
                sceneAssets.characterDna = dnaRename.map;
            }
            if (sceneAssets.characterOutfits && typeof sceneAssets.characterOutfits === 'object' && !Array.isArray(sceneAssets.characterOutfits)) {
                sceneAssets.characterOutfits = reorderKey(sceneAssets.characterOutfits, oldName, newName);
            }
            if (sceneAssets.characterDefaultOutfits && typeof sceneAssets.characterDefaultOutfits === 'object' && !Array.isArray(sceneAssets.characterDefaultOutfits)) {
                sceneAssets.characterDefaultOutfits = reorderKey(sceneAssets.characterDefaultOutfits, oldName, newName);
            }
            if (sceneAssets.characterSeeds) sceneAssets.characterSeeds = reorderKey(sceneAssets.characterSeeds, oldName, newName);
            migrateSpriteKeys(settingsState.draft.readerSettings, { character: oldName }, { character: newName });
            migrateExpressionNotes(sceneAssets, { character: oldName }, { character: newName });
            for (const field of ['characterSpriteNotes', 'characterMoodTiers', 'characterMoodNotes']) {
                if (sceneAssets[field]) sceneAssets[field] = reorderKey(sceneAssets[field], oldName, newName);
            }
            if (sceneAssets.generated) {
                sceneAssets.generated = { ...sceneAssets.generated };
                for (const field of ['characters', 'characterAliases']) {
                    if (sceneAssets.generated[field]) sceneAssets.generated[field] = reorderKey(sceneAssets.generated[field], oldName, newName);
                }
            }
            let persisted;
            try { persisted = persistSettingsDraft(); }
            catch (error) { persisted = { ok: false, reason: 'save-failed', saveError: error }; }
            if (operationFailed(persisted)) {
                for (const [assets, snapshot] of [[sceneAssets, previous], [rootAssets, previousRoot]]) {
                    for (const key of Object.keys(assets)) if (!Object.hasOwn(snapshot, key)) delete assets[key];
                    Object.assign(assets, snapshot);
                }
                if (reader) Object.assign(reader, previousReader);
                rerenderSettings();
                return persisted || { ok: false, reason: 'save-failed' };
            }
            if (settingsState.asyncState.outfitTabs) settingsState.asyncState.outfitTabs = reorderKey(settingsState.asyncState.outfitTabs, oldName, newName);
            renameSetPrefix(settingsState.asyncState.expandedSpriteSlots, `${oldName}\x00`, `${newName}\x00`);
            syncAssetFolderItem(settingsState, options, 'characters', oldName, newName);
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-rename-mood:')) {
        const rest = normalizedAction.slice('scene-rename-mood:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const charName = decodeSeg(rest.slice(0, colonIdx));
            const oldMood = decodeSeg(rest.slice(colonIdx + 1));
            const globalObj = options.global || globalThis;
            const newMood = ((await dialogs.prompt(`重命名情绪「${oldMood}」为：`, oldMood)) || '').trim();
            if (newMood && newMood !== oldMood) {
                settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
                const chars = draftAssetLibrary(settingsState, editTarget).characters || {};
                // 同名检查：该角色已有同名槽，或词库已有同名情绪组 → 阻止，避免覆盖丢失
                if (chars[charName] && Object.prototype.hasOwnProperty.call(chars[charName], newMood)) {
                    pageAlert(dialogs, globalObj, `「${charName}」已有「${newMood}」情绪（同名），改名会覆盖原有内容，因此未作更改`);
                    return rerenderSettings();
                }
                const groups = ensureMoodGroups(settingsState);
                if (groups.some((g) => g.label === newMood && g.label !== oldMood)) {
                    pageAlert(dialogs, globalObj, `词库已有情绪组「${newMood}」（同名），改名会覆盖原有内容，因此未作更改`);
                    return rerenderSettings();
                }
                // 改角色槽名
                if (chars[charName]) {
                    chars[charName] = reorderKey(chars[charName], oldMood, newMood);
                    renameSetPrefix(settingsState.asyncState.expandedSpriteSlots, `${charName}\x00${oldMood}`, `${charName}\x00${newMood}`);
                    migrateSpriteKeys(settingsState.draft.readerSettings, { character: charName, outfit: '', mood: oldMood }, { mood: newMood });
                }
                // 同步词库里同名情绪组的组名（全局：所有角色用到该组名的槽一起改）
                const group = groups.find((g) => g.label === oldMood);
                if (group) {
                    group.label = newMood;
                    const wordIdx = Array.isArray(group.words) ? group.words.indexOf(oldMood) : -1;
                    if (wordIdx >= 0) group.words[wordIdx] = newMood;
                    for (const otherName of Object.keys(chars)) {
                        if (otherName === charName) continue;
                        const other = chars[otherName];
                        if (other && typeof other === 'object' && Object.prototype.hasOwnProperty.call(other, oldMood)
                            && !Object.prototype.hasOwnProperty.call(other, newMood)) {
                            chars[otherName] = reorderKey(other, oldMood, newMood);
                            renameSetPrefix(settingsState.asyncState.expandedSpriteSlots, `${otherName}\x00${oldMood}`, `${otherName}\x00${newMood}`);
                            migrateSpriteKeys(settingsState.draft.readerSettings, { character: otherName, outfit: '', mood: oldMood }, { mood: newMood });
                        }
                    }
                }
                const persisted = persistSettingsDraft();
                if (persisted.ok === false) return persisted;
            }
        }
        return rerenderSettings();
    }

    if (normalizedAction === 'reset-mood-groups') {
        settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
        settingsState.draft.bridge.sceneAssets.moodGroups = cloneData(DEFAULT_MOOD_GROUPS);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction === 'mood-apply-preset') {
        const groups = ensureMoodGroups(settingsState);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        const looked = await dialogs.confirm(applyMoodPreset(groups)
            ? '已按预设整理词库：补齐缺少的组，并将词归回所属的组；自行添加的组和词均已保留。'
            : '词库已与预设一致。');
        return rerenderSettings();
    }

    if (normalizedAction === 'mood-add-group') {
        const globalObj = options.global || globalThis;
        const groups = ensureMoodGroups(settingsState);
        const raw = ((await dialogs.prompt('新情绪组名称：', '')) || '').trim();
        if (!raw) return rerenderSettings();
        if (groups.some((g) => g.label === raw)) {
            pageAlert(dialogs, globalObj, `情绪组「${raw}」已存在（同名）`);
            return rerenderSettings();
        }
        groups.unshift({ label: raw, words: fillPresetWordsFor(raw, groups, [raw]) });
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-remove-group:')) {
        const label = decodeSeg(normalizedAction.slice('mood-remove-group:'.length));
        const groups = ensureMoodGroups(settingsState);
        const idx = groups.findIndex((g) => g.label === label);
        if (idx >= 0) groups.splice(idx, 1);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-rename-group:')) {
        const oldLabel = decodeSeg(normalizedAction.slice('mood-rename-group:'.length));
        const globalObj = options.global || globalThis;
        const newLabel = ((await dialogs.prompt(`重命名情绪组「${oldLabel}」为：`, oldLabel)) || '').trim();
        if (newLabel && newLabel !== oldLabel) {
            const groups = ensureMoodGroups(settingsState);
            if (groups.some((g) => g.label === newLabel)) {
                pageAlert(dialogs, globalObj, `情绪组「${newLabel}」已存在`);
                return rerenderSettings();
            }
            const group = groups.find((g) => g.label === oldLabel);
            if (group) group.label = newLabel;
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-add-word:')) {
        const label = decodeSeg(normalizedAction.slice('mood-add-word:'.length));
        const globalObj = options.global || globalThis;
        const word = ((await dialogs.prompt(`向「${label}」组添加情绪词：`, '')) || '').trim();
        if (word) {
            const groups = ensureMoodGroups(settingsState);
            const dupGroup = groups.find((g) => Array.isArray(g.words) && g.words.includes(word));
            if (dupGroup) {
                // 词撞名：弹窗询问是否删掉重复词再加到当前组
                const proceed = await dialogs.confirm(`「${word}」已存在于「${dupGroup.label}」组。是否删除重复词并加入「${label}」组？`);
                if (!proceed) return rerenderSettings();
                dupGroup.words = dupGroup.words.filter((w) => w !== word);
            }
            const group = groups.find((g) => g.label === label);
            if (group) group.words.push(word);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    // 整理整个情绪库：一次请求，已有词重新归组并剔除不是情绪的词；先确认，结束后列出剔除了哪些。
    if (normalizedAction === 'mood-ai-reclassify') {
        const globalObj = options.global || globalThis;
        const groups = ensureMoodGroups(settingsState);
        const total = groups.reduce((sum, group) => sum + (Array.isArray(group.words) ? group.words.length : 0), 0);
        if (settingsState.asyncState.moodReclassifying) return { ok: false, reason: 'mood-reclassify-busy' };
        if (!total) return rerenderSettings();
        if (typeof options.requestMoodClassification !== 'function') return generationFailure(globalObj, dialogs, '当前无法调用AI分类。', 'mood-classification-unavailable');
        if (!await dialogs.confirm(`用备用模型整理全部${groups.length}组、${total}个情绪词：重新归组，并剔除动作、神态等不是情绪的词。继续？`)) return rerenderSettings();
        const originalAssets = settingsState.draft.bridge.sceneAssets;
        const originalGroups = cloneData(groups);
        settingsState.asyncState.moodReclassifying = true;
        settingsState.asyncState.moodAutoStatus = '正在整理情绪词库…';
        rerenderSettings();
        let failure = '';
        let outcome = null;
        try {
            const llm = resolveSecondaryLlm(settingsState.draft.bridge.autoIllustration);
            const raw = await options.requestMoodClassification(buildMoodReclassifyRequest(groups), llm);
            if (state.activeSettings !== settingsState) return { ok: false, reason: 'settings-closed' };
            outcome = applyMoodReclassification(ensureMoodGroups(settingsState), raw);
            settingsState.draft.bridge.sceneAssets.moodGroups = outcome.groups;
            const saved = persistSettingsDraft();
            if (saved.ok === false) {
                originalAssets.moodGroups = originalGroups;
                settingsState.draft.bridge.sceneAssets.moodGroups = originalGroups;
                return saved;
            }
        } catch (error) {
            originalAssets.moodGroups = originalGroups;
            settingsState.draft.bridge.sceneAssets.moodGroups = originalGroups;
            failure = 'AI整理失败：请检查模型连接或返回格式，情绪词未改动。';
        } finally {
            settingsState.asyncState.moodReclassifying = false;
            settingsState.asyncState.moodAutoStatus = failure ? '' : outcome
                ? `已整理：${outcome.moved}个词换了组，剔除${outcome.removed.length}个不是情绪的词。` : '';
            if (state.activeSettings === settingsState) rerenderSettings();
        }
        if (failure) return generationFailure(globalObj, dialogs, failure, 'mood-reclassify-failed');
        if (outcome.removed.length && typeof dialogs.view === 'function') {
            await dialogs.view(`剔除了${outcome.removed.length}个不是情绪的词：${outcome.removed.join('、')}`);
        }
        return { ok: true, moved: outcome.moved, removed: outcome.removed };
    }

    if (normalizedAction === 'mood-review-ai-classify') {
        const globalObj = options.global || globalThis;
        const storage = globalObj.localStorage;
        const pending = loadMoodReview(storage);
        const groups = ensureMoodGroups(settingsState);
        const labels = groups.map((group) => String(group.label || '').trim()).filter(Boolean);
        if (settingsState.asyncState.moodReviewClassifying) return { ok: false, reason: 'mood-classification-busy' };
        if (!pending.length || !labels.length) return rerenderSettings();
        if (typeof options.requestMoodClassification !== 'function') return generationFailure(globalObj, dialogs, '当前无法调用AI分类。', 'mood-classification-unavailable');
        const originalAssets = settingsState.draft.bridge.sceneAssets;
        const originalGroups = cloneData(groups);
        settingsState.asyncState.moodReviewClassifying = true;
        rerenderSettings();
        let failure = '';
        let count = 0;
        let draftChanged = false;
        try {
            const words = pending.map((item) => item.word);
            const llm = resolveSecondaryLlm(settingsState.draft.bridge.autoIllustration);
            const raw = await options.requestMoodClassification(buildMoodClassificationRequest(groups, words), llm);
            if (state.activeSettings !== settingsState) return { ok: false, reason: 'settings-closed' };
            const results = parseMoodClassification(raw, words, labels);
            const live = loadMoodReview(storage);
            const nextGroups = applyMoodAssignments(ensureMoodGroups(settingsState), results);
            settingsState.draft.bridge.sceneAssets.moodGroups = nextGroups;
            draftChanged = true;
            const saved = persistSettingsDraft();
            if (saved.ok === false) {
                originalAssets.moodGroups = originalGroups;
                settingsState.draft.bridge.sceneAssets.moodGroups = originalGroups;
                return saved;
            }
            const cleared = saveMoodReview(storage, live.filter(word => !words.includes(word)));
            if (cleared.ok === false) {
                // 保存成功后宿主会用持久化快照替换 draft；旧引用与当前草稿都必须回滚。
                originalAssets.moodGroups = originalGroups;
                settingsState.draft.bridge.sceneAssets.moodGroups = originalGroups;
                const rollback = persistSettingsDraft();
                return rollback.ok === false ? rollback : cleared;
            }
            count = pending.length;
        } catch (error) {
            if (draftChanged) {
                originalAssets.moodGroups = originalGroups;
                settingsState.draft.bridge.sceneAssets.moodGroups = originalGroups;
            }
            failure = 'AI分类失败：请检查模型连接或返回格式，情绪词未改动。';
        } finally {
            settingsState.asyncState.moodReviewClassifying = false;
            if (state.activeSettings === settingsState) rerenderSettings();
        }
        if (failure) return generationFailure(globalObj, dialogs, failure, 'mood-classification-failed');
        return { ok: true, count };
    }

    // 待确认情绪词从已有情绪组里选一个加入，加入后从列表移除。
    if (normalizedAction.startsWith('mood-review-assign:')) {
        const rest = normalizedAction.slice('mood-review-assign:'.length);
        const colonIdx = rest.indexOf(':');
        const word = decodeSeg(colonIdx >= 0 ? rest.slice(0, colonIdx) : rest);
        const picked = colonIdx >= 0 ? decodeSeg(rest.slice(colonIdx + 1)).trim() : '';
        const globalObj = options.global || globalThis;
        const storage = globalObj.localStorage;
        const groups = ensureMoodGroups(settingsState);
        const label = picked && groups.some((group) => group.label === picked) ? picked : '';
        if (!label) return rerenderSettings();
        const group = groups.find((entry) => entry.label === label);
        for (const other of groups) {
            if (other !== group && Array.isArray(other.words)) other.words = other.words.filter((w) => w !== word);
        }
        if (!group.words.includes(word)) group.words.push(word);
        removeMoodReview(storage, word);
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-review-dismiss:')) {
        const written = removeMoodReview((options.global || globalThis).localStorage, decodeSeg(normalizedAction.slice('mood-review-dismiss:'.length)));
        if (written.ok === false) return written;
        return rerenderSettings();
    }

    if (normalizedAction === 'mood-review-clear') {
        const written = clearMoodReview((options.global || globalThis).localStorage);
        if (written.ok === false) return written;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-remove-word:')) {
        const rest = normalizedAction.slice('mood-remove-word:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const label = decodeSeg(rest.slice(0, colonIdx));
            const word = decodeSeg(rest.slice(colonIdx + 1));
            const groups = ensureMoodGroups(settingsState);
            const group = groups.find((g) => g.label === label);
            if (group) {
                if (group.words.length <= 1) {
                    const globalObj = options.global || globalThis;
                    pageAlert(dialogs, globalObj, '每个情绪组至少需保留1个词。');
                    return rerenderSettings();
                }
                const wi = group.words.indexOf(word);
                if (wi >= 0) group.words.splice(wi, 1);
            }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    // 角色名那行的 DNA 画笔：只开合下方的 DNA 编辑区，状态和其他折叠区记在一起。
    if (normalizedAction.startsWith('scene-toggle-dna:')) {
        const key = `char-dna:${decodeSeg(normalizedAction.slice('scene-toggle-dna:'.length))}`;
        const open = settingsState.asyncState.advancedOpen || {};
        settingsState.asyncState.advancedOpen = { ...open, [key]: !open[key] };
        return rerenderSettings();
    }

    // 过场CG出场总开关：把全部出场效果一起勾上或取消（配置仍是各效果的勾选，全不勾即关闭）。
    if (normalizedAction.startsWith('cg-entrance-all:')) {
        const on = normalizedAction.slice('cg-entrance-all:'.length) === 'on';
        const entrance = settingsState.draft.readerSettings.cgEntrance || {};
        settingsState.draft.readerSettings.cgEntrance = { ...entrance, styles: Object.fromEntries(CG_INTERLUDE_STYLES.map((id) => [id, on])) };
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    // 界面上的开合（如服装设置）：只记在界面状态里，和「高级」折叠区放在一起。
    if (normalizedAction.startsWith('ui-toggle-open:')) {
        const key = decodeSeg(normalizedAction.slice('ui-toggle-open:'.length));
        const open = settingsState.asyncState.advancedOpen || {};
        if (key) {
            const next = { ...open, [key]: !open[key] };
            // 演出写法列表同一时间只展开一条。
            if (key.startsWith('prompt-entry-') && next[key]) for (const other of Object.keys(next)) if (other !== key && other.startsWith('prompt-entry-')) next[other] = false;
            settingsState.asyncState.advancedOpen = next;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-toggle-mood:')) {
        const rest = normalizedAction.slice('scene-toggle-mood:'.length);
        const colonIdx = rest.indexOf(':');
        if (colonIdx > 0) {
            const charName = decodeSeg(rest.slice(0, colonIdx));
            const mood = decodeSeg(rest.slice(colonIdx + 1));
            const key = charName + "\x00" + mood;
            if (!(settingsState.asyncState.expandedSpriteSlots instanceof Set)) {
                settingsState.asyncState.expandedSpriteSlots = new Set();
            }
            const set = settingsState.asyncState.expandedSpriteSlots;
            if (set.has(key)) set.delete(key); else set.add(key);
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('mood-create-group:')) {
        const label = decodeSeg(normalizedAction.slice('mood-create-group:'.length));
        const globalObj = options.global || globalThis;
        const groups = ensureMoodGroups(settingsState);
        if (groups.some((g) => g.label === label)) {
            pageAlert(dialogs, globalObj, `情绪组「${label}」已存在（同名）`);
            return rerenderSettings();
        }
        groups.unshift({ label, words: fillPresetWordsFor(label, groups, [label]) });
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('asset-') && await runAssetFolderAction(normalizedAction, settingsState, options, dialogs)) {
        return rerenderSettings();
    }

    // 场景下的时间 / 天气行默认收起，只显示「N 个时间」，点开才渲染（20 个场景能少画上千个节点）。
    if (normalizedAction.startsWith('scene-toggle-times:')) {
        const key = 'times\x00' + decodeSeg(normalizedAction.slice('scene-toggle-times:'.length));
        if (!(settingsState.asyncState.expandedSceneSlots instanceof Set)) settingsState.asyncState.expandedSceneSlots = new Set();
        const set = settingsState.asyncState.expandedSceneSlots;
        if (set.has(key)) set.delete(key); else set.add(key);
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-toggle-bg:')) {
        const key = 'bg\x00' + decodeSeg(normalizedAction.slice('scene-toggle-bg:'.length));
        if (!(settingsState.asyncState.expandedSceneSlots instanceof Set)) settingsState.asyncState.expandedSceneSlots = new Set();
        const set = settingsState.asyncState.expandedSceneSlots;
        if (set.has(key)) set.delete(key); else set.add(key);
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-toggle-time:')) {
        const rest = normalizedAction.slice('scene-toggle-time:'.length);
        const c = rest.indexOf(':');
        if (c > 0) {
            const key = 'time\x00' + decodeSeg(rest.slice(0, c)) + '\x00' + decodeSeg(rest.slice(c + 1));
            if (!(settingsState.asyncState.expandedSceneSlots instanceof Set)) settingsState.asyncState.expandedSceneSlots = new Set();
            const set = settingsState.asyncState.expandedSceneSlots;
            if (set.has(key)) set.delete(key); else set.add(key);
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-toggle-weather:')) {
        const rest = normalizedAction.slice('scene-toggle-weather:'.length);
        const c1 = rest.indexOf(':'); const c2 = c1 >= 0 ? rest.indexOf(':', c1 + 1) : -1;
        if (c1 > 0 && c2 > c1) {
            const key = 'weather\x00' + decodeSeg(rest.slice(0, c1)) + '\x00' + decodeSeg(rest.slice(c1 + 1, c2)) + '\x00' + decodeSeg(rest.slice(c2 + 1));
            if (!(settingsState.asyncState.expandedSceneSlots instanceof Set)) settingsState.asyncState.expandedSceneSlots = new Set();
            const set = settingsState.asyncState.expandedSceneSlots;
            if (set.has(key)) set.delete(key); else set.add(key);
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-add-bg-word:')) {
        const sceneName = decodeSeg(normalizedAction.slice('scene-add-bg-word:'.length));
        const globalObj = options.global || globalThis;
        const alias = ((await dialogs.prompt(`为场景「${sceneName}」添加别名：`, '')) || '').trim();
        if (alias) {
            const scenes = (settingsState.draft.bridge.sceneAssets || {}).scenes || {};
            if (Object.prototype.hasOwnProperty.call(scenes, alias)) {
                pageAlert(dialogs, globalObj, `「${alias}」已是场景主名称`);
                return rerenderSettings();
            }
            const dup = findSceneWord(scenes, alias);
            if (dup) {
                const proceed = await dialogs.confirm(`别名「${alias}」已属于${dup.label}。是否移动到场景「${sceneName}」？`);
                if (!proceed) return rerenderSettings();
                removeSceneWordEntry(scenes, dup);
            }
            const s = scenes[sceneName];
            if (s && typeof s === 'object') { if (!Array.isArray(s.words)) s.words = []; s.words.push(alias); }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('scene-remove-bg-word:')) {
        const rest = normalizedAction.slice('scene-remove-bg-word:'.length);
        const c = rest.indexOf(':');
        if (c > 0) {
            const sceneName = decodeSeg(rest.slice(0, c)); const word = decodeSeg(rest.slice(c + 1));
            const scenes = (settingsState.draft.bridge.sceneAssets || {}).scenes || {};
            const s = scenes[sceneName];
            if (s && Array.isArray(s.words)) {
                s.words = s.words.filter((w) => w !== word);
            }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('time-add-word:')) {
        const label = decodeSeg(normalizedAction.slice('time-add-word:'.length));
        const globalObj = options.global || globalThis;
        const word = ((await dialogs.prompt(`向时间组「${label}」添加词：`, '')) || '').trim();
        if (word) {
            const groups = ensureTimeGroups(settingsState);
            const dup = groups.find((g) => Array.isArray(g.words) && g.words.includes(word));
            if (dup) {
                const proceed = await dialogs.confirm(`「${word}」已存在于时间组「${dup.label}」。是否删除重复词并加入「${label}」？`);
                if (!proceed) return rerenderSettings();
                dup.words = dup.words.filter((w) => w !== word);
            }
            const g = groups.find((g) => g.label === label);
            if (g) g.words.push(word);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('time-remove-word:')) {
        const rest = normalizedAction.slice('time-remove-word:'.length);
        const c = rest.indexOf(':');
        if (c > 0) {
            const label = decodeSeg(rest.slice(0, c)); const word = decodeSeg(rest.slice(c + 1));
            const groups = ensureTimeGroups(settingsState);
            const g = groups.find((g) => g.label === label);
            if (g && Array.isArray(g.words)) {
                const globalObj = options.global || globalThis;
                if (g.words.length <= 1) { pageAlert(dialogs, globalObj, '至少保留1个词'); return rerenderSettings(); }
                g.words = g.words.filter((w) => w !== word);
            }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('time-create-group:')) {
        const label = decodeSeg(normalizedAction.slice('time-create-group:'.length));
        const globalObj = options.global || globalThis;
        const groups = ensureTimeGroups(settingsState);
        if (groups.some((g) => g.label === label)) { pageAlert(dialogs, globalObj, `时间组「${label}」已存在`); return rerenderSettings(); }
        groups.unshift({ label, words: [label] });
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('weather-add-word:')) {
        const label = decodeSeg(normalizedAction.slice('weather-add-word:'.length));
        const globalObj = options.global || globalThis;
        const word = ((await dialogs.prompt(`向天气组「${label}」添加词：`, '')) || '').trim();
        if (word) {
            const groups = ensureWeatherGroups(settingsState);
            const dup = groups.find((g) => Array.isArray(g.words) && g.words.includes(word));
            if (dup) {
                const proceed = await dialogs.confirm(`「${word}」已存在于天气组「${dup.label}」。是否删除重复词并加入「${label}」？`);
                if (!proceed) return rerenderSettings();
                dup.words = dup.words.filter((w) => w !== word);
            }
            const g = groups.find((g) => g.label === label);
            if (g) g.words.push(word);
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('weather-remove-word:')) {
        const rest = normalizedAction.slice('weather-remove-word:'.length);
        const c = rest.indexOf(':');
        if (c > 0) {
            const label = decodeSeg(rest.slice(0, c)); const word = decodeSeg(rest.slice(c + 1));
            const groups = ensureWeatherGroups(settingsState);
            const g = groups.find((g) => g.label === label);
            if (g && Array.isArray(g.words)) {
                const globalObj = options.global || globalThis;
                if (g.words.length <= 1) { pageAlert(dialogs, globalObj, '至少保留1个词'); return rerenderSettings(); }
                g.words = g.words.filter((w) => w !== word);
            }
            const persisted = persistSettingsDraft();
            if (persisted.ok === false) return persisted;
        }
        return rerenderSettings();
    }

    if (normalizedAction.startsWith('weather-create-group:')) {
        const label = decodeSeg(normalizedAction.slice('weather-create-group:'.length));
        const globalObj = options.global || globalThis;
        const groups = ensureWeatherGroups(settingsState);
        if (groups.some((g) => g.label === label)) { pageAlert(dialogs, globalObj, `天气组「${label}」已存在`); return rerenderSettings(); }
        groups.unshift({ label, words: [label] });
        const persisted = persistSettingsDraft();
        if (persisted.ok === false) return persisted;
        return rerenderSettings();
    }

    return { ok: false, reason: 'unknown-settings-action', action: normalizedAction };
}

function reorderKey(obj, oldKey, newKey) {
    const result = {};
    for (const [k, v] of Object.entries(obj)) result[k === oldKey ? newKey : k] = v;
    return result;
}

function renameSetPrefix(set, oldPrefix, newPrefix) {
    if (!(set instanceof Set)) return;
    const toUpdate = [];
    for (const key of set) if (key.startsWith(oldPrefix)) toUpdate.push(key);
    for (const k of toUpdate) { set.delete(k); set.add(newPrefix + k.slice(oldPrefix.length)); }
}

function findSceneWord(scenes, word) {
    for (const [sn, sv] of Object.entries(scenes || {})) {
        const s = typeof sv === 'string' ? {} : (sv || {});
        if (Array.isArray(s.words) && s.words.includes(word)) return { type: 'bg', keys: [sn], word, label: `场景「${sn}」` };
    }
    return null;
}

function removeSceneWordEntry(scenes, entry) {
    const [sn, tn, wn] = entry.keys;
    let arr = null;
    if (entry.type === 'bg') arr = scenes[sn] && scenes[sn].words;
    else if (entry.type === 'time') arr = scenes[sn] && scenes[sn].times && scenes[sn].times[tn] && scenes[sn].times[tn].words;
    else arr = scenes[sn] && scenes[sn].times && scenes[sn].times[tn] && scenes[sn].times[tn].weathers && scenes[sn].times[tn].weathers[wn] && scenes[sn].times[tn].weathers[wn].words;
    if (Array.isArray(arr)) { const i = arr.indexOf(entry.word); if (i >= 0) arr.splice(i, 1); }
}

// 换掉 / 清掉的头像是图库里的图、而全局、各角色卡和素材预设都不再引用时，从图库删掉。
async function releaseAvatarImage(previous, settingsState, options) {
    const id = generatedAssetIdOf(String(previous || '').trim());
    const service = options.generatedAssets;
    if (!id || !service || typeof service.deleteImages !== 'function') return;
    const globalObj = options.global || globalThis;
    const unused = unreferencedGeneratedImageIds([id], settingsState.draft.bridge && settingsState.draft.bridge.sceneAssets, globalObj.localStorage);
    if (!unused.length) return;
    try { await service.deleteImages(unused); } catch (error) { /* 删不掉只是图库里多留一张 */ }
}

function pickAssetImageFile(doc, globalObj) {
    return new Promise((resolve) => {
        const input = doc.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/webp,image/gif';
        let done = false;
        let timeoutId = null;
        const finish = (result) => {
            if (done) return;
            done = true;
            if (timeoutId !== null) clearTimeout(timeoutId);
            resolve(result);
        };
        input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) return finish(null);
            if (!ASSET_UPLOAD_MIME.test(String(file.type || ''))) return finish({ ok: false, reason: 'not-image' });
            if (!Number.isFinite(file.size) || file.size > ASSET_UPLOAD_MAX_BYTES || file.size <= 0) return finish({ ok: false, reason: 'too-large' });
            const Reader = globalObj.FileReader || globalThis.FileReader;
            if (typeof Reader !== 'function') return finish({ ok: false, reason: 'read-failed' });
            const reader = new Reader();
            reader.onload = (event) => {
                const dataUrl = String((event && event.target && event.target.result) || '');
                if (!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(dataUrl)
                    || dataUrl.length > Math.ceil(ASSET_UPLOAD_MAX_BYTES / 3) * 4 + 64) return finish({ ok: false, reason: 'not-image' });
                finish({ ok: true, dataUrl });
            };
            reader.onerror = () => finish({ ok: false, reason: 'read-failed' });
            try { reader.readAsDataURL(file); } catch (error) { finish({ ok: false, reason: 'read-failed' }); }
        };
        input.oncancel = () => finish(null);
        timeoutId = setTimeout(() => finish(null), 300000);
        try { input.click(); } catch (error) { finish({ ok: false, reason: 'read-failed' }); }
    });
}

function pickStatusAvatarFile(doc) {
    return new Promise((resolve) => {
        const input = doc.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        let done = false;
        let timeoutId = null;
        const finish = (val) => {
            if (done) return;
            done = true;
            if (timeoutId !== null) clearTimeout(timeoutId);
            resolve(val);
        };
        input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) { finish(null); return; }
            const type = String(file.type || '');
            if (type && !STATUS_AVATAR_MIME.test(type)) { finish({ ok: false, reason: 'not-image' }); return; }
            if (Number(file.size) > STATUS_AVATAR_MAX_BYTES) { finish({ ok: false, reason: 'too-large' }); return; }
            const fr = new FileReader();
            fr.onload = (e) => {
                const dataUrl = String((e && e.target && e.target.result) || '');
                if (!/^data:image\//i.test(dataUrl)) { finish({ ok: false, reason: 'not-image' }); return; }
                finish({ ok: true, dataUrl });
            };
            fr.onerror = () => finish({ ok: false, reason: 'read-failed' });
            fr.readAsDataURL(file);
        };
        input.click();
        timeoutId = setTimeout(() => finish(null), 300000);
    });
}

function cardLibrarySnapshot(effective) {
    return snapshotAssetLibrary(effective);
}

function cardCharacterNames(library) {
    return [...new Set(['characters', 'characterAliases', 'characterDna', 'characterOutfits', 'characterDefaultOutfits', 'statusAvatars']
        .flatMap(field => Object.keys(library?.[field] || {})))];
}

async function exportAllSettings(settingsState, options) {
    const globalObj = options.global || globalThis;
    const json = JSON.stringify(buildSettingsExport(settingsState.draft, { version: options.version }), null, 2);
    return triggerBytesDownload(globalObj, new TextEncoder().encode(json), settingsExportFileName(options.version), 'application/json');
}

async function importAllSettings(settingsState, options, dialogs, ctx, persistSettingsDraft, rerenderSettings) {
    const globalObj = options.global || globalThis;
    const doc = globalObj.document;
    if (!doc || typeof doc.createElement !== 'function') return { ok: false, reason: 'no-document' };
    if (typeof ctx.normalizeImportedSettings !== 'function') return { ok: false, reason: 'import-unavailable' };
    const file = await (options.recoveryCheckpoint?.step('file:settings', () => pickSettingsFile(doc, options)) || pickSettingsFile(doc, options));
    if (!file) return rerenderSettings();
    if (file.error) { pageAlert(dialogs, globalObj, `导入失败：${file.error}`); return { ok: false, reason: file.error }; }
    const archive = file.archive;
    // 选的其实是旧版素材预设：按预设导入，不当全局配置处理。
    if (!archive && isLegacyPresetData(file.data)) {
        return importLegacyPreset(settingsState, options, dialogs, persistSettingsDraft, rerenderSettings, file.data, file.fileName);
    }
    const parsed = parseSettingsImport(archive ? archive.settings : file.data, settingsState.draft);
    if (!parsed.ok) {
        pageAlert(dialogs, globalObj, `导入失败：${parsed.message}`);
        return rerenderSettings();
    }
    if (!await dialogs.confirm(`用「${file.fileName}」覆盖当前的全局配置？场景、角色、衣柜和各角色卡的资料保持不动。API Key保留本机现有的。`, { okLabel: '导入' })) return rerenderSettings();
    const before = cloneData(settingsState.draft);
    const normalized = ctx.normalizeImportedSettings({ bridge: parsed.bridge, readerSettings: parsed.readerSettings });
    settingsState.draft.bridge = normalized.bridge;
    settingsState.draft.readerSettings = normalized.readerSettings;
    const persisted = persistGeneratedLibrary(persistSettingsDraft);
    if (!persisted || persisted.ok === false) return rollbackImportedDraft(settingsState, before, persistSettingsDraft);
    const rescued = await rescueLegacyAssets(file, options);
    if (rescued.ok === false) {
        settingsState.draft = before;
        const restored = persistGeneratedLibrary(persistSettingsDraft);
        return { ...rescued, rollbackFailed: rescued.rollbackFailed || restored?.ok === false };
    }
    if (rescued.count) {
        pageAlert(dialogs, globalObj, `该配置包含旧版素材（${rescued.count}套），已另行保存。可在「角色」「场景」页顶部的素材预设中套用到本卡或全局。`);
    }
    return rerenderSettings();
}

// 旧版全局配置把场景、角色等素材一起导出，zip 里还可能带着预设和图片。新版导入只收设置，
// 这些素材不能丢：存成旧版预设，让用户在素材页自己决定放进哪张卡或全局。
async function rescueLegacyAssets(file, options) {
    const globalObj = options.global || globalThis;
    const archive = file.archive;
    const raw = archive ? archive.settings : file.data;
    const presets = { ...((archive && archive.scenePresets && archive.scenePresets.presets) || {}) };
    const oldAssets = raw && raw.bridge && raw.bridge.sceneAssets;
    if (isLegacyPresetData(oldAssets)) {
        const summary = legacyPackSummary(legacyPresetToPack(oldAssets));
        if (summary.scenes || summary.characters) {
            const reader = (raw && raw.readerSettings) || {};
            presets[`${file.fileName || '导入的配置'}里的素材`] = { ...oldAssets, spriteLayouts: reader.spriteLayouts || {}, spriteHeads: reader.spriteHeads || {} };
        }
    }
    const prepared = await prepareImageImport(archive?.images || [], presets, options.generatedAssets, { remapMissing: Boolean(archive) });
    if (!prepared.ok) return prepared;
    const previous = loadLegacyPresets(globalObj.localStorage);
    const stored = storeLegacyPresets(globalObj.localStorage, prepared.value);
    if (stored.ok === false) {
        const compensation = await prepared.rollback();
        return { ...stored, rollbackFailed: stored.rollbackFailed || !compensation.ok };
    }
    const released = unreferencedGeneratedImageIds(collectGeneratedImageIds(previous), {}, globalObj.localStorage);
    if (released.length) await options.generatedAssets?.deleteImages?.(released);
    return { ok: true, count: stored.count };
}

// 旧版素材预设（浏览器里留着的，或导出的 json）→ 按名字合并进当前角色卡或全局。已有的其他条目不动。
// 预设当存档 / 模板：全局和存的时候所在那张卡的本卡素材分开记；套用时各回各层（本卡部分回原来那张卡），
// 换之前把要被换掉的层存成「套用前备份」。旧版不分层的预设，套用时选本卡或全局。
async function handlePresetAction(action, settingsState, options, dialogs, persistSettingsDraft, rerenderSettings) {
    const globalObj = options.global || globalThis;
    const storage = globalObj.localStorage;
    const alertFn = (msg) => { pageAlert(dialogs, globalObj, msg); };
    const failed = (written) => {
        const usage = describeLocalStorageUsage(storage);
        alertFn(`预设未能保存：浏览器本地存储已满（酒馆与各插件共用约数MB）。${usage ? `${usage}。` : ''}可先删除不再使用的预设后重试，素材本身不受影响。`);
        return written;
    };
    const root = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    // 存预设前把整段 base64 的头像挪进图库：设置本身变小，存出来的预设只记图片地址；以前存的预设也顺带瘦身，腾出空间。
    const slimAvatars = async () => {
        const service = options.generatedAssets;
        const seen = new Map();
        const live = await moveInlineAvatars(avatarHoldersOfRoot(root), service, seen);
        if (live.moved) {
            const persisted = persistSettingsDraft();
            if (operationFailed(persisted)) return persisted;
        }
        const library = readPresetLibrary(storage);
        let moved = 0;
        for (const preset of Object.values(library)) {
            if (isLegacyPresetData(preset)) moved += (await moveInlineAvatars(avatarHoldersOfPreset(preset), service, seen)).moved;
        }
        if (moved) replacePresetLibrary(storage, library);
        return null;
    };
    const asyncState = settingsState.asyncState || {};
    const cardKey = asyncState.assetScopeKind === 'card' ? String(asyncState.assetScopeKey || '') : '';
    const cardLabel = String(asyncState.assetScopeLabel || '');
    const presets = loadLegacyPresets(storage);
    const askName = async (message, initial) => {
        const name = String((await dialogs.prompt(message, initial)) || '').trim();
        if (!name) return '';
        if (!isValidPresetName(name)) { alertFn(`「${name}」不能用作预设名`); return ''; }
        return name;
    };
    const readerSettings = settingsState.draft.readerSettings || {};
    const folderScope = (presetName, key) => (key ? `${presetName}\u0001${key}` : presetName);

    if (action === 'preset-save') {
        const name = await askName('存为预设，名字：', cardLabel || '全局');
        if (!name) return rerenderSettings();
        if (presets[name] && !await dialogs.confirm(`已存在预设「${name}」，是否用当前这一套覆盖？`, { okLabel: '覆盖' })) return rerenderSettings();
        const slimFailed = await slimAvatars();
        if (slimFailed) return slimFailed;
        const written = writeNamedPreset(storage, name, layeredPresetFromRoot(root, { cardKey, cardLabel, readerSettings }));
        if (written.ok === false) return failed(written);
        saveAssetFolders(storage, folderScope(name, ''), loadAssetFolders(storage, ''));
        if (cardKey) saveAssetFolders(storage, folderScope(name, cardKey), loadAssetFolders(storage, cardKey));
        alertFn(`已存为预设「${name}」。`);
        return rerenderSettings();
    }

    if (action === 'preset-import') {
        const doc = globalObj.document;
        if (!doc) return { ok: false, reason: 'no-document' };
        const file = await (options.recoveryCheckpoint?.step('file:asset-pack', () => pickCardPackFile(doc)) || pickCardPackFile(doc));
        if (!file) return rerenderSettings();
        if (file.error) { alertFn(`导入失败：${file.error}`); return { ok: false, reason: file.error }; }
        const archive = file.archive?.format === 'igs-scene-preset' ? file.archive : !file.archive && isZipBytes(file.bytes) ? parsePresetArchive(file.bytes) : null;
        let data = archive ? archive.preset : null;
        if (!archive && !isZipBytes(file.bytes)) {
            try { data = JSON.parse(new TextDecoder().decode(file.bytes)); } catch (error) { data = null; }
        }
        if (!isLegacyPresetData(data)) {
            alertFn(isZipBytes(file.bytes) ? '该压缩包不是素材预设（角色卡素材包请使用「导入角色卡素材包」）。' : '该文件不是素材预设。');
            return rerenderSettings();
        }
        const name = await askName('导入预设，名字：', (archive && archive.name) || String(file.fileName || '').replace(/\.(?:json|zip)$/i, '') || '导入的预设');
        if (!name) return rerenderSettings();
        if (presets[name] && !await dialogs.confirm(`已存在预设「${name}」，是否用文件中的内容覆盖？`, { okLabel: '覆盖' })) return rerenderSettings();
        const prepared = await prepareImageImport(archive?.images || [], data, options.generatedAssets, { remapMissing: Boolean(archive) });
        if (!prepared.ok) { alertFn('图片保存失败，未导入预设。'); return prepared; }
        let written;
        try { written = writeNamedPreset(storage, name, prepared.value); }
        catch (error) { written = { ok: false, reason: 'preset-save-failed', error: error.message }; }
        if (written.ok === false) {
            const compensation = await prepared.rollback();
            return failed({ ...written, rollbackFailed: written.rollbackFailed || !compensation.ok });
        }
        const released = releasedGeneratedImageIds(collectGeneratedImageIds(presets[name]), root, storage);
        if (released.length) await options.generatedAssets?.deleteImages?.(released);
        return rerenderSettings();
    }

    const rest = action.slice(action.indexOf(':') + 1);
    const command = action.slice(0, action.indexOf(':'));
    const colon = rest.indexOf(':');
    const name = decodeSeg(colon < 0 ? rest : rest.slice(0, colon));
    const preset = presets[name];
    if (!preset) return rerenderSettings();

    if (command === 'preset-overwrite') {
        if (!await dialogs.confirm(`用现在的配置覆盖预设「${name}」？原预设内容将被替换。`, { okLabel: '覆盖' })) return rerenderSettings();
        const slimFailed = await slimAvatars();
        if (slimFailed) return slimFailed;
        const written = writeNamedPreset(storage, name, layeredPresetFromRoot(root, { cardKey, cardLabel, readerSettings }));
        if (written.ok === false) return failed(written);
        saveAssetFolders(storage, folderScope(name, ''), loadAssetFolders(storage, ''));
        if (cardKey) saveAssetFolders(storage, folderScope(name, cardKey), loadAssetFolders(storage, cardKey));
        return rerenderSettings();
    }

    if (command === 'preset-export') {
        const fileBase = String(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || '素材预设';
        const ids = collectGeneratedImageIds(preset);
        if (!ids.length && !collectImageReferences(preset).paths.size) {
            const bytes = new TextEncoder().encode(JSON.stringify(preset, null, 2));
            return triggerBytesDownload(globalObj, bytes, `${fileBase}.json`, 'application/json');
        }
        return exportAssetArchive({ format: 'igs-scene-preset', name, preset }, options.generatedAssets, globalObj, `${fileBase}.zip`);
    }

    if (command === 'preset-rename') {
        const next = await askName(`重命名预设「${name}」为：`, name);
        if (!next || next === name) return rerenderSettings();
        if (presets[next]) { alertFn(`已经有预设「${next}」了`); return rerenderSettings(); }
        const written = renameNamedPreset(storage, name, next);
        if (written.ok === false) return failed(written);
        mergeAssetFolderScope(storage, name, next);
        return rerenderSettings();
    }

    if (command === 'preset-delete') {
        if (!await dialogs.confirm(`删除预设「${name}」？素材本身不受影响，但之后将无法再套用该预设。`, { okLabel: '删除' })) return rerenderSettings();
        const previousIds = collectGeneratedImageIds(preset);
        const written = removeNamedPreset(storage, name);
        if (written.ok === false) return failed(written);
        const released = unreferencedGeneratedImageIds(previousIds, root, storage);
        if (released.length) await options.generatedAssets?.deleteImages?.(released);
        return rerenderSettings();
    }

    // preset-apply:<名字>（分层预设）或 preset-apply:<名字>:card|global（旧版不分层的预设）
    const pack = legacyPresetToPack(preset);
    const counts = (library) => {
        const sum = legacyPackSummary({ library });
        return `${sum.scenes}个场景、${sum.characters}个角色`;
    };
    const layers = isLayeredPreset(preset)
        ? [{ key: '', label: '全局', pack }].concat(presetCardLayers(preset).map((layer) => ({ ...layer, label: `角色卡「${layer.label}」` })))
        : [{ key: decodeSeg(colon < 0 ? '' : rest.slice(colon + 1)) === 'card' && cardKey ? cardKey : '', pack }];
    if (!isLayeredPreset(preset)) layers[0].label = layers[0].key ? `本卡「${cardLabel}」` : '全局';
    const targetOf = (key) => (key ? ensureCardLibrary(root, key) : root);
    const backupName = `套用前备份 · ${name.replace(/^套用前备份 · /, '')}`;
    const keepBackup = name !== backupName && layers.some((layer) => libraryHasContent(targetOf(layer.key)));
    const lines = layers.map((layer) => `${layer.label}：当前的${counts(targetOf(layer.key))}将整体替换为预设中的${counts(layer.pack.library)}。`);
    const message = `套用预设「${name}」？\n${lines.join('\n')}`
        + (layers.some((layer) => !layer.key) ? '\n全局素材所有角色卡都在用，换掉会影响每一张卡。' : '')
        + (keepBackup ? `\n原有内容会先保存为预设「${backupName}」，如需恢复，套用该预设即可。` : '');
    if (!await dialogs.confirm(message, { okLabel: '套用' })) return rerenderSettings();
    if (keepBackup) {
        const slimFailed = await slimAvatars();
        if (slimFailed) return slimFailed;
        const cardLayer = layers.find((layer) => layer.key);
        const backup = cardLayer
            ? layeredPresetFromRoot(root, { cardKey: cardLayer.key, cardLabel: cardLayer.label.replace(/^(?:角色卡|本卡)「|」$/g, ''), readerSettings })
            : presetFromAssets(root, { root, readerSettings });
        if (!layers.some((layer) => !layer.key)) {
            // 只换本卡时备份的是那张卡，顶层放它的本卡素材，旧版读出来也是那一套。
            Object.assign(backup, presetFromAssets(targetOf(cardLayer.key), { root, readerSettings }));
            delete backup.scopeCards;
        }
        const written = writeNamedPreset(storage, backupName, backup);
        if (written.ok === false) return failed(written);
    }
    for (const layer of layers) {
        const target = targetOf(layer.key);
        replaceLibraryWithPack(target, layer.pack);
        const worldview = layer.key && isLayeredPreset(preset) ? layer.worldview : layer.pack.worldview;
        if (worldview) applyWorldview(target, worldview);
        mergeAssetFolderScope(storage, isLayeredPreset(preset) ? folderScope(name, layer.key) : name, layer.key);
    }
    root.characterHouses = { ...(root.characterHouses || {}), ...cloneData(pack.characterHouses) };
    root.characterVoices = { ...(root.characterVoices || {}), ...normalizeCharacterVoices(pack.characterVoices) };
    root.characterSpriteScales = { ...(root.characterSpriteScales || {}), ...normalizeCharacterSpriteScales(pack.characterSpriteScales) };
    root.moodGroups = mergeLabelGroups(root.moodGroups, pack.moodGroups);
    root.timeGroups = mergeLabelGroups(root.timeGroups, pack.timeGroups);
    root.weatherGroups = mergeLabelGroups(root.weatherGroups, pack.weatherGroups);
    const reader = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
    reader.spriteLayouts = { ...(reader.spriteLayouts || {}), ...cloneData(pack.spriteLayouts) };
    reader.spriteHeads = { ...(reader.spriteHeads || {}), ...normalizeSpriteHeads(pack.spriteHeads) };
    const persisted = persistSettingsDraft();
    if (persisted.ok === false) return persisted;
    return rerenderSettings();
}

async function importLegacyPreset(settingsState, options, dialogs, persistSettingsDraft, rerenderSettings, data, label, images = []) {
    const globalObj = options.global || globalThis;
    let pack = legacyPresetToPack(data);
    const summary = legacyPackSummary(pack);
    const root = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    const asyncState = settingsState.asyncState || {};
    const cardKey = asyncState.assetScopeKind === 'card' ? String(asyncState.assetScopeKey || '') : '';
    const cardLabel = String(asyncState.assetScopeLabel || '');
    let dest = '';
    if (cardKey) {
        // 关掉弹窗就是不导入，不能当成选了全局。
        const choices = [
            { value: 'card', label: `放进本卡「${cardLabel}」`, note: '只有这张角色卡用' },
            { value: 'global', label: '放进全局', note: '所有角色卡都能用' },
        ];
        const picked = typeof dialogs.choose === 'function'
            ? await dialogs.choose(`「${label}」要放在哪里？`, choices, 'card', { okLabel: '下一步' })
            : (await dialogs.confirm(`「${label}」放进本卡「${cardLabel}」？`, { okLabel: '放进本卡' }) ? 'card' : null);
        if (picked !== 'card' && picked !== 'global') return rerenderSettings();
        dest = picked === 'card' ? cardKey : '';
    }
    const target = dest ? ensureCardLibrary(root, dest) : root;
    const where = dest ? `角色卡「${cardLabel}」` : '全局';
    const conflicts = legacyPackConflicts(target, pack);
    const shown = conflicts.slice(0, 6).join('、') + (conflicts.length > 6 ? ' 等' : '');
    const message = `把「${label}」导入${where}：${summary.scenes}个场景、${summary.characters}个角色、${summary.outfits}套服装，包括立绘位置和词库。`
        + (conflicts.length ? `\n${where}中已有的${conflicts.length}个同名条目将替换为预设中的版本：${shown}。` : '')
        + '\n其他已有素材保持不变。';
    if (!await dialogs.confirm(message, { okLabel: '导入' })) return rerenderSettings();
    const before = cloneData(settingsState.draft);
    const prepared = await prepareImageImport(images, data, options.generatedAssets, { remapMissing: images.length > 0 });
    if (!prepared.ok) { pageAlert(dialogs, globalObj, '图片保存失败，未导入预设。'); return prepared; }
    pack = legacyPresetToPack(prepared.value);
    mergeLegacyLibrary(target, pack);
    if (pack.worldview) applyWorldview(target, pack.worldview);
    root.characterHouses = { ...(root.characterHouses || {}), ...cloneData(pack.characterHouses) };
    root.characterVoices = { ...(root.characterVoices || {}), ...normalizeCharacterVoices(pack.characterVoices) };
    root.characterSpriteScales = { ...(root.characterSpriteScales || {}), ...normalizeCharacterSpriteScales(pack.characterSpriteScales) };
    root.moodGroups = mergeLabelGroups(root.moodGroups, pack.moodGroups);
    root.timeGroups = mergeLabelGroups(root.timeGroups, pack.timeGroups);
    root.weatherGroups = mergeLabelGroups(root.weatherGroups, pack.weatherGroups);
    const reader = settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
    reader.spriteLayouts = { ...(reader.spriteLayouts || {}), ...cloneData(pack.spriteLayouts) };
    reader.spriteHeads = { ...(reader.spriteHeads || {}), ...normalizeSpriteHeads(pack.spriteHeads) };
    const persisted = persistGeneratedLibrary(persistSettingsDraft);
    if (!persisted || persisted.ok === false) {
        const rolledBack = await rollbackImportedDraft(settingsState, before, persistSettingsDraft, prepared);
        return { ...persisted, ...rolledBack };
    }
    const folders = globalObj.localStorage.getItem(ASSET_FOLDERS_STORAGE_KEY);
    if (!mergeAssetFolderScope(globalObj.localStorage, label, dest, { strict: true })) return rollbackImportedDraft(settingsState, before, persistSettingsDraft, prepared, globalObj.localStorage, folders);
    const released = releasedGeneratedImageIds(collectGeneratedImageIds(before.bridge?.sceneAssets), root, globalObj.localStorage);
    if (released.length) await options.generatedAssets?.deleteImages?.(released);
    pageAlert(dialogs, globalObj, `已把「${label}」导入${where}。`);
    return rerenderSettings();
}

async function exportCharacterCardPack(settingsState, options) {
    const globalObj = options.global || globalThis;
    const scopeKey = settingsState.asyncState && settingsState.asyncState.assetScopeKey;
    const kind = settingsState.asyncState && settingsState.asyncState.assetScopeKind;
    const characterName = settingsState.asyncState && settingsState.asyncState.assetScopeLabel;
    if (kind !== 'card' || !scopeKey || !characterName) {
        pageAlert(dialogs, globalObj, '请先打开一张角色卡，再导出该卡的素材。');
        return { ok: false, reason: 'no-card' };
    }
    const root = (settingsState.draft.bridge && settingsState.draft.bridge.sceneAssets) || {};
    const ownCards = root.cards && root.cards[scopeKey] ? { [scopeKey]: root.cards[scopeKey] } : {};
    const effective = effectiveSceneAssets({ ...root, cards: ownCards }, scopeKey);
    const library = cardLibrarySnapshot(effective);
    const readerSettings = settingsState.draft.readerSettings || {};
    const names = cardCharacterNames(library);
    const pack = {
        format: 'igs-character-card',
        characterName,
        library,
        spriteLayouts: spriteEntriesForNames(readerSettings.spriteLayouts, names, true),
        spriteHeads: spriteEntriesForNames(readerSettings.spriteHeads, names, false),
        moodGroups: root.moodGroups || [],
        timeGroups: root.timeGroups || [],
        weatherGroups: root.weatherGroups || [],
        worldview: resolveWorldview(effective),
    };
    const fileName = `${String(characterName).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || '角色卡'}.zip`;
    return exportAssetArchive(pack, options.generatedAssets, globalObj, fileName);
}

async function importCharacterCardPack(settingsState, options, dialogs, persistSettingsDraft, rerenderSettings) {
    const globalObj = options.global || globalThis;
    const doc = globalObj.document;
    if (!doc) return { ok: false, reason: 'no-document' };
    const file = await (options.recoveryCheckpoint?.step('file:asset-pack', () => pickCardPackFile(doc)) || pickCardPackFile(doc));
    if (!file) return rerenderSettings();
    if (file.error) { pageAlert(dialogs, globalObj, `导入失败：${file.error}`); return { ok: false, reason: file.error }; }
    if (!isZipBytes(file.bytes)) {
        let data = null;
        try { data = JSON.parse(new TextDecoder().decode(file.bytes)); } catch (error) { data = null; }
        if (isLegacyPresetData(data)) {
            const label = String(file.fileName || '').replace(/\.json$/i, '') || '旧版预设';
            return importLegacyPreset(settingsState, options, dialogs, persistSettingsDraft, rerenderSettings, data, label);
        }
        pageAlert(dialogs, globalObj, '该文件既不是角色卡素材包，也不是旧版素材预设。');
        return rerenderSettings();
    }
    let pack = file.archive?.format === 'igs-character-card' ? file.archive : !file.archive ? parseCharacterCardPack(file.bytes) : null;
    const presetArchive = pack ? null : file.archive?.format === 'igs-scene-preset' ? file.archive : !file.archive ? parsePresetArchive(file.bytes) : null;
    if (presetArchive && isLegacyPresetData(presetArchive.preset)) {
        const label = presetArchive.name || String(file.fileName || '').replace(/\.zip$/i, '') || '导入的预设';
        return importLegacyPreset(settingsState, options, dialogs, persistSettingsDraft, rerenderSettings, presetArchive.preset, label, presetArchive.images);
    }
    if (!pack) {
        pageAlert(dialogs, globalObj, '该压缩包不是角色卡素材包。');
        return rerenderSettings();
    }
    const root = settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    const key = `card:${pack.characterName}`;
    const worldviewItem = WORLDVIEWS.find((item) => item.id === pack.worldview);
    const worldviewChanges = Boolean(worldviewItem) && resolveWorldview(effectiveSceneAssets(root, key)) !== pack.worldview;
    if (libraryHasContent(root.cards && root.cards[key]) || worldviewChanges) {
        const extra = worldviewChanges ? `，并把这张卡的世界观设为「${worldviewItem.label}」` : '';
        const confirmed = await dialogs.confirm(`导入将覆盖角色卡「${pack.characterName}」中现有的场景、角色和衣柜${extra}。是否继续？`);
        if (!confirmed) return rerenderSettings();
    }
    const before = cloneData(settingsState.draft);
    const prepared = await prepareImageImport(pack.images, pack, options.generatedAssets, { remapMissing: true });
    if (!prepared.ok) { pageAlert(dialogs, globalObj, '图片保存失败，未导入素材包。'); return prepared; }
    pack = prepared.value;
    ensureCardLibrary(root, key);
    root.cards[key] = cardLibrarySnapshot(pack.library);
    if (pack.worldview) applyWorldview(root.cards[key], pack.worldview);
    root.moodGroups = mergeLabelGroups(root.moodGroups, pack.moodGroups);
    root.timeGroups = mergeLabelGroups(root.timeGroups, pack.timeGroups);
    root.weatherGroups = mergeLabelGroups(root.weatherGroups, pack.weatherGroups);
    settingsState.draft.readerSettings = settingsState.draft.readerSettings || {};
    settingsState.draft.readerSettings.spriteLayouts = {
        ...(settingsState.draft.readerSettings.spriteLayouts || {}),
        ...(pack.spriteLayouts || {}),
    };
    settingsState.draft.readerSettings.spriteHeads = {
        ...(settingsState.draft.readerSettings.spriteHeads || {}),
        ...(pack.spriteHeads || {}),
    };
    const persisted = persistGeneratedLibrary(persistSettingsDraft);
    if (!persisted || persisted.ok === false) {
        const rolledBack = await rollbackImportedDraft(settingsState, before, persistSettingsDraft, prepared);
        return { ...persisted, ...rolledBack };
    }
    const released = releasedGeneratedImageIds(collectGeneratedImageIds(before.bridge?.sceneAssets), root, globalObj.localStorage);
    if (released.length) await options.generatedAssets?.deleteImages?.(released);
    pageAlert(dialogs, globalObj, `已导入角色卡「${pack.characterName}」的素材，打开同名角色卡即可使用。`);
    return rerenderSettings();
}

function isZipBytes(bytes) {
    return Boolean(bytes) && bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

async function readAssetBlob(url, globalObj, service) {
    if (isGeneratedAssetUrl(url)) {
        const record = await service?.readStoredImageRecord?.(generatedAssetIdOf(url));
        if (!record?.dataUrl) throw new Error('archive-image-missing');
        url = record.dataUrl;
    }
    if (/^data:image\//i.test(url)) return dataUrlBlob(url, { Blob: globalObj.Blob || Blob, atob: globalObj.atob || atob });
    if (/^\/?user\/images\/igs-/.test(url)) return createTavernImageFiles(globalObj, 'igs-media').readBlob(url);
    const response = await (globalObj.fetch || fetch)(url);
    if (!response?.ok) throw new Error('archive-image-unreadable');
    return response.blob();
}

async function downloadAssetZip(settingsState, collection, options) {
    const globalObj = options.global || globalThis;
    const asyncState = settingsState.asyncState || {};
    const root = (settingsState.draft.bridge && settingsState.draft.bridge.sceneAssets) || {};
    const assets = draftEffectiveAssets(settingsState);
    const cardKey = String(asyncState.assetScopeKey || '');
    const filter = cardKey && asyncState.assetScopeFilter ? asyncState.assetScopeFilter[collection] : '';
    const names = Object.keys(assets[collection] || {}).filter((name) => (filter !== 'card' && filter !== 'global')
        || (assetOwnerKey(root, cardKey, [collection], name) ? 'card' : 'global') === filter);
    const listed = collectAssetZipEntries(assets, collection, names);
    const kind = collection === 'characters' ? '角色' : '场景';
    if (!listed.length) {
        return { ok: true, reason: 'empty', images: 0 };
    }
    const scope = filter === 'global' ? '全局' : (asyncState.assetScopeLabel || '全局');
    const fileName = `${String(`${scope}-${kind}素材`).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')}.zip`;
    const sink = await createArchiveDownload(globalObj, fileName);
    async function* entries() {
        const names = new Set();
        for (const item of listed) {
            const blob = await recoverOperation(() => readAssetBlob(item.url, globalObj, options.generatedAssets),
                { signal: options.signal, global: globalObj,
                    observe: async () => ({ completed: true, value: await readAssetBlob(item.url, globalObj, options.generatedAssets) }) });
            const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' })[blob.type] || 'bin';
            let name = `${item.path}.${ext}`;
            for (let index = 2; names.has(name); index++) name = `${item.path}-${index}.${ext}`;
            names.add(name); yield { name, blob };
        }
    }
    return { ...await writeZip(entries(), sink), fileName, images: listed.length, missing: 0, storage: sink.mode };
}

function triggerBytesDownload(globalObj, bytes, fileName, type) {
    const doc = globalObj.document;
    const BlobCtor = globalObj.Blob || globalThis.Blob;
    const urlApi = globalObj.URL || globalThis.URL;
    if (!doc || typeof doc.createElement !== 'function' || !BlobCtor || !urlApi || typeof urlApi.createObjectURL !== 'function') {
        return { ok: false, reason: 'no-document' };
    }
    const url = urlApi.createObjectURL(new BlobCtor([bytes], { type: type || 'application/octet-stream' }));
    const a = doc.createElement('a');
    a.href = url;
    a.download = fileName;
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    if (typeof urlApi.revokeObjectURL === 'function') urlApi.revokeObjectURL(url);
    return { ok: true, fileName };
}

function pickCardPackFile(doc) {
    return new Promise((resolve) => {
        const input = doc.createElement('input');
        input.type = 'file';
        input.accept = '.zip,.json,application/zip,application/json';
        let done = false;
        let timeoutId = null;
        const finish = (val) => {
            if (done) return;
            done = true;
            if (timeoutId !== null) clearTimeout(timeoutId);
            resolve(val);
        };
        input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) { finish(null); return; }
            if (typeof file.slice === 'function' && typeof file.arrayBuffer === 'function') {
                void readAssetFile(file, doc.defaultView || globalThis).then(finish).catch(error => finish({ fileName: file.name, bytes: new Uint8Array(), error: error.message }));
                return;
            }
            const fr = new FileReader();
            fr.onload = (e) => {
                const result = e && e.target && e.target.result;
                finish(result ? { fileName: file.name, bytes: new Uint8Array(result) } : null);
            };
            fr.onerror = () => finish(null);
            fr.readAsArrayBuffer(file);
        };
        input.click();
        timeoutId = setTimeout(() => finish(null), 300000);
    });
}

// options 由调用方传入；此前直接引用未定义的外层变量，导入配置会抛 ReferenceError。
async function pickSettingsFile(doc, options = {}) {
    const file = await (options.recoveryCheckpoint?.step('file:asset-pack', () => pickCardPackFile(doc)) || pickCardPackFile(doc));
    if (!file || file.error) return file;
    if (file.archive) return file.archive.format === 'igs-settings-pack' ? file : { ...file, error: '该压缩包不是全局配置包，请从素材页导入' };
    if (isZipBytes(file.bytes)) {
        const archive = parseSettingsArchive(file.bytes);
        return archive ? { fileName: file.fileName, archive } : { ...file, error: '该压缩包不是全局配置包' };
    }
    try { return { fileName: file.fileName.replace(/\.json$/i, ''), data: JSON.parse(new TextDecoder().decode(file.bytes)) }; }
    catch { return { ...file, error: '文件不是有效的 JSON' }; }
}

function ensureTimeGroups(settingsState) {
    settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    const sa = settingsState.draft.bridge.sceneAssets;
    if (!Array.isArray(sa.timeGroups)) sa.timeGroups = [];
    return sa.timeGroups;
}

function ensureWeatherGroups(settingsState) {
    settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    const sa = settingsState.draft.bridge.sceneAssets;
    if (!Array.isArray(sa.weatherGroups)) sa.weatherGroups = [];
    return sa.weatherGroups;
}

function ensureMoodGroups(settingsState) {    settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    const sa = settingsState.draft.bridge.sceneAssets;
    if (!Array.isArray(sa.moodGroups)) {
        sa.moodGroups = normalizeMoodGroups(sa.moodGroups);
    }
    return sa.moodGroups;
}

function ensureCharacterAliases(settingsState, editTarget) {
    settingsState.draft.bridge.sceneAssets = settingsState.draft.bridge.sceneAssets || {};
    const sceneAssets = draftAssetLibrary(settingsState, editTarget);
    if (!sceneAssets.characterAliases || typeof sceneAssets.characterAliases !== 'object' || Array.isArray(sceneAssets.characterAliases)) {
        sceneAssets.characterAliases = {};
    }
    for (const name of Object.keys(sceneAssets.characters || {})) {
        if (!Array.isArray(sceneAssets.characterAliases[name])) sceneAssets.characterAliases[name] = [];
    }
    return sceneAssets.characterAliases;
}
