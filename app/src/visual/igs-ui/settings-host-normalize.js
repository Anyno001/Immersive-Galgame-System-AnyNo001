// 设置快照的规范化（bridge 配置与阅读器设置）：纯函数，阅读器和设置器共用。
import { normalizeEventCgs } from '../../scene/event-cg.js';
import { normalizeSourceFilter, normalizeVirtualRegex } from '../../scene/message-source.js';
import { normalizeSpriteEnhance } from './sprite-enhance.js';
import { normalizeAssetCards } from '../../scene/asset-scope.js';
import { FX_SETTINGS_NORMALIZERS, normalizeFxReaderSettings } from './fx-settings.js';
import { normalizeSpriteHeads } from './fx-anchor.js';
import { normalizeGeneratedLibrary } from '../../scene/asset-match.js';
import { normalizeCharacterDnaMap } from '../../scene/character-dna.js';
import { normalizeCharacterOutfits, normalizeWardrobe } from '../../scene/character-outfits.js';
import { normalizeMoodGroups } from '../../scene/mood-groups.js';
import { normalizeAutoIllustrationSettings } from '../../generated-images/illustration/auto-illustration-settings.js';
import { normalizeSettingsTheme } from './settings-theme.js';
import { DEFAULT_IMAGE_API, DIALOG_FONT_OPTIONS, DEFAULT_PINNED_TOOLBAR_BUTTONS, normalizeScenePromptRule, READER_SETTINGS_SCHEMA_VERSION, TOOLBAR_ACTIONS, VN_THEME_PRESETS } from './reader-host-constants.js';
import { cloneData, clampNumber, normalizeBoolean, normalizeFiniteNumber, normalizeNullableNumber, normalizeOpacity } from './reader-value-utils.js';
import { normalizeBtnOrder, normalizeDialogBarAlign, normalizeDialogBarButtons, normalizeToolbarSplit, normalizeHiddenButtons, normalizePerformanceSettings, normalizePinnedButtons, normalizeReaderMode, normalizeSpriteDefaultScale, normalizeSpriteDisplayScale, normalizeSpriteGenderScale, normalizeSpriteLayouts } from './settings-normalize.js';
import { normalizeCharacterSpriteScales } from './sprite-height.js';
import { normalizeStatusHudSettings } from '../../data/shujuku/status-hud-model.js';
import { CLASSIC_DIALOG_WIDTH_PERCENT_DEFAULT, CLASSIC_DIALOG_THEME_DEFAULTS, normalizeClassicDialogWidthPercent, normalizeDialogSkin } from './classic-dialog-skin.js';
import { MAGIC_ACCENT_DEFAULT, MAGIC_HOUSE_DEFAULT, normalizeMagicAccent, normalizeMagicHouse } from './dialog-theme-css-skins.js';
import { normalizeCharacterHouses } from './magic-house.js';
import { normalizeCharacterVoices, normalizeVoiceBarkSettings } from './voice-bark.js';
import { normalizeTtsSettings } from './tts.js';
import { HORROR_DREAD_CAP_DEFAULT, normalizeHorrorDreadCap } from './horror-dread.js';
import { normalizeGradientVeil } from './gradient-veil-dialog-skin.js';
import { SKIN_DIALOG_SCALE_DEFAULT, normalizeSkinDialogScale } from './dialog-skin-frame.js';
import { normalizeStageShakeSettings } from './stage-shake-runtime.js';
import { normalizeWeatherFxSettings } from './weather-fx-runtime.js';
import { TYPEWRITER_DEFAULTS, normalizeTypewriterSettings } from './typewriter-runtime.js';
import { normalizeChatShowSettings } from './chat-show-runtime.js';
import { normalizeSystemRoleSettings } from './system-role.js';
import { normalizePromptPlacement } from './tag-grammar.js';

export function normalizeBridgeConfig(bridge) {
    const normalized = cloneData(bridge || {});
    normalized.openMode = normalizeReaderMode(normalized.openMode, normalized);
    normalized.showToasts = normalizeBoolean(normalized.showToasts, true);
    normalized.settingsTheme = normalizeSettingsTheme(normalized.settingsTheme);
    normalized.debug = normalizeBoolean(normalized.debug, false);
    normalized.sourceFilter = normalizeSourceFilter(normalized.sourceFilter);
    normalized.virtualRegex = normalizeVirtualRegex(normalized.virtualRegex);
    normalized.sentencePaging = normalizeBoolean(normalized.sentencePaging, false);
    normalized.imageApi = normalizeImageApi(normalized.imageApi);
    normalized.sceneAssets = normalizeSceneAssets(normalized.sceneAssets);
    normalized.vnTheme = normalizeVnTheme(normalized.vnTheme);
    normalized.entry = normalizeEntryConfig(normalized.entry);
    normalized.optionBubble = normalizeOptionBubble(normalized.optionBubble);
    normalized.autoIllustration = normalizeAutoIllustrationSettings(normalized.autoIllustration);
    return normalized;
}

export function normalizeOptionBubble(value) {
    const src = value && typeof value === 'object' ? value : {};
    const position = (src.position === 'top-center' || src.position === 'top-right')
        ? src.position
        : 'top-left';
    return {
        enabled: normalizeBoolean(src.enabled, false),
        position,
        clickAction: src.clickAction === 'fill' ? 'fill' : 'send',
        widthFollowsText: normalizeBoolean(src.widthFollowsText, false),
    };
}

export function normalizeEntryConfig(value) {
    const src = value && typeof value === 'object' ? value : {};
    return {
        magic: normalizeBoolean(src.magic, true),
    };
}

export function normalizeImageApi(value) {
    const normalized = {
        ...cloneData(DEFAULT_IMAGE_API),
        ...cloneData(value || {}),
    };
    normalized.availableModels = Array.isArray(normalized.availableModels)
        ? normalized.availableModels.filter(Boolean)
        : [];
    normalized.dbgenSpriteTransparent = normalized.dbgenSpriteTransparent !== false;
    return normalized;
}

export function normalizeSceneAssets(value) {
    // normalizeBridgeConfig already cloned the entire bridge before calling here.
    // Re-cloning a large sceneAssets library on every settings redraw is redundant.
    const normalized = value || {};
    normalized.enabled = normalizeBoolean(normalized.enabled, false);
    normalized.generated = normalizeGeneratedLibrary(normalized.generated);
    normalized.promptRule = normalizeScenePromptRule(normalized.promptRule);
    normalized.promptPlacement = normalizePromptPlacement(normalized.promptPlacement);
    normalized.spriteEnhance = normalizeSpriteEnhance(normalized.spriteEnhance);
    normalized.promptAdaptive = normalized.promptAdaptive !== false;
    normalized.promptRuleEnabled = normalized.promptRuleEnabled !== false;
    if (!normalized.scenes || typeof normalized.scenes !== 'object' || Array.isArray(normalized.scenes)) {
        normalized.scenes = {};
    }
    // migrate old string-value scenes to object format
    for (const key of Object.keys(normalized.scenes)) {
        const v = normalized.scenes[key];
        if (typeof v === 'string') normalized.scenes[key] = { url: v, times: {} };
        else if (v && typeof v === 'object' && !v.times) normalized.scenes[key].times = {};
        const sceneObj = normalized.scenes[key];
        for (const tKey of Object.keys(sceneObj.times || {})) {
            const tv = sceneObj.times[tKey];
            if (typeof tv === 'string') sceneObj.times[tKey] = { url: tv, weathers: {} };
            else if (tv && typeof tv === 'object' && !tv.weathers) sceneObj.times[tKey].weathers = {};
            const timeObj = sceneObj.times[tKey];
            for (const wKey of Object.keys(timeObj.weathers || {})) {
                const wv = timeObj.weathers[wKey];
                if (typeof wv === 'string') timeObj.weathers[wKey] = { url: wv, words: [] };
            }
        }
    }
    if (!normalized.characters || typeof normalized.characters !== 'object' || Array.isArray(normalized.characters)) {
        normalized.characters = {};
    }
    const rawCharacterAliases = normalized.characterAliases && typeof normalized.characterAliases === 'object' && !Array.isArray(normalized.characterAliases)
        ? normalized.characterAliases
        : {};
    normalized.characterAliases = {};
    const claimedCharacterNames = new Set(Object.keys(normalized.characters));
    for (const characterName of Object.keys(normalized.characters)) {
        const aliases = Array.isArray(rawCharacterAliases[characterName]) ? rawCharacterAliases[characterName] : [];
        const nextAliases = [];
        for (const aliasValue of aliases) {
            const alias = String(aliasValue || '').trim();
            if (!alias || claimedCharacterNames.has(alias)) continue;
            claimedCharacterNames.add(alias);
            nextAliases.push(alias);
        }
        normalized.characterAliases[characterName] = nextAliases;
    }
    normalized.characterDna = normalizeCharacterDnaMap(normalized.characterDna);
    normalized.characterOutfits = normalizeCharacterOutfits(normalized.characterOutfits);
    normalized.characterHouses = normalizeCharacterHouses(normalized.characterHouses);
    normalized.characterVoices = normalizeCharacterVoices(normalized.characterVoices);
    normalized.characterSpriteScales = normalizeCharacterSpriteScales(normalized.characterSpriteScales);
    normalized.wardrobe = normalizeWardrobe(normalized.wardrobe);
    normalized.eventCgs = normalizeEventCgs(normalized.eventCgs);
    normalized.moodGroups = normalizeMoodGroups(normalized.moodGroups);
    // init group arrays
    if (!Array.isArray(normalized.timeGroups)) normalized.timeGroups = [];
    if (!Array.isArray(normalized.weatherGroups)) normalized.weatherGroups = [];
    // migrate any embedded time/weather words into global groups
    for (const sceneObj of Object.values(normalized.scenes)) {
        for (const [tKey, timeObj] of Object.entries(sceneObj.times || {})) {
            if (!timeObj || typeof timeObj !== 'object') continue;
            if (Array.isArray(timeObj.words) && timeObj.words.length) {
                let tg = normalized.timeGroups.find((g) => g.label === tKey);
                if (!tg) { tg = { label: tKey, words: [] }; normalized.timeGroups.push(tg); }
                for (const w of timeObj.words) if (!tg.words.includes(w)) tg.words.push(w);
                delete timeObj.words;
            }
            for (const [wKey, wObj] of Object.entries(timeObj.weathers || {})) {
                if (!wObj || typeof wObj !== 'object') continue;
                if (Array.isArray(wObj.words) && wObj.words.length) {
                    let wg = normalized.weatherGroups.find((g) => g.label === wKey);
                    if (!wg) { wg = { label: wKey, words: [] }; normalized.weatherGroups.push(wg); }
                    for (const w of wObj.words) if (!wg.words.includes(w)) wg.words.push(w);
                    delete wObj.words;
                }
            }
        }
    }
    normalized.unifiedSpriteLayout = normalizeBoolean(normalized.unifiedSpriteLayout, false);
    normalized.moodFuzzyMatch = normalizeBoolean(normalized.moodFuzzyMatch, false);
    normalized.moodAutoClassify = normalizeBoolean(normalized.moodAutoClassify, false);
    normalizeAssetCards(normalized);
    return normalized;
}

export function normalizeVnTheme(value, fallback = VN_THEME_PRESETS.genshin) {
    const normalized = cloneData(value || {});
    // 对话主题已取消预设选择，恒为自定义；用 genshin 作为各字段的初值来源（fallback）。
    normalized.preset = 'custom';
    const normalizeAlign = (value, def) => (value === 'left' || value === 'center' || value === 'indent') ? value : def;
    normalized.nameAlign = normalizeAlign(normalized.nameAlign, fallback.nameAlign);
    normalized.textAlign = normalizeAlign(normalized.textAlign, fallback.textAlign || 'left');
    normalized.narrationAlign = normalizeAlign(normalized.narrationAlign, fallback.narrationAlign || 'left');
    normalized.thoughtAlign = normalizeAlign(normalized.thoughtAlign, fallback.thoughtAlign || 'left');
    // 分割线只保留「渐变线(gradient)」与「无(none)」；旧符号样式一律归到渐变线。
    const dividerSymbol = normalized.dividerSymbol == null ? fallback.dividerSymbol : normalized.dividerSymbol;
    normalized.dividerSymbol = dividerSymbol === 'none' ? 'none' : 'gradient';
    normalized.nameFont = normalized.nameFont || fallback.nameFont;
    normalized.textFont = normalized.textFont || fallback.textFont;
    normalized.thoughtFont = normalized.thoughtFont || fallback.thoughtFont;
    normalized.narrationFont = normalized.narrationFont || fallback.narrationFont;
    normalized.nameColor = normalized.nameColor || fallback.nameColor;
    normalized.textColor = normalized.textColor || fallback.textColor;
    normalized.thoughtColor = normalized.thoughtColor || fallback.thoughtColor;
    normalized.narrationColor = normalized.narrationColor || fallback.narrationColor;
    normalized.dividerColor = normalized.dividerColor || fallback.dividerColor;
    normalized.dialogBg = normalized.dialogBg || fallback.dialogBg;
    normalized.bgOpacity = normalized.bgOpacity == null
        ? null
        : clampNumber(normalizeFiniteNumber(normalized.bgOpacity, 0.62), 0, 1);
    return normalized;
}

export function normalizeReaderSettings(settings, legacyTheme) {
    const currentVersion = READER_SETTINGS_SCHEMA_VERSION;
    const src = (settings && typeof settings === 'object' && !Array.isArray(settings))
        ? cloneData(settings)
        : {};
    const base = {
        _v: currentVersion,
        // 新装默认用渐变黑幕；已存过的皮肤（含原来的「磨砂玻璃」= default）照旧。
        dialogSkin: 'gradient-veil',
        gradientVeil: normalizeGradientVeil(null),
        classicDialogWidthPercent: CLASSIC_DIALOG_WIDTH_PERCENT_DEFAULT,
        skinDialogScale: SKIN_DIALOG_SCALE_DEFAULT,
        magicHouse: MAGIC_HOUSE_DEFAULT,
        horrorDreadCap: HORROR_DREAD_CAP_DEFAULT,
        magicAccent: MAGIC_ACCENT_DEFAULT,
        fontSize: 18,
        dialogFontWeight: null,
        dialogTextEffect: 'off',
        dialogTextEffectColor: '#000000',
        dialogTextEffectStrength: 20,
        dialogTextEffectSize: 0.8,
        optionFontSize: 14,
        dialogWidth: null,
        dialogHeight: null,
        glassOpacity: 0.62,
        glassBackdropFilter: false,
        toolbarScale: 100,
        toolbarDock: 'top',
        inputPlacement: 'dialog',
        inputScale: 100,
        imgMode: 'adaptive',
        imgBrightness: 100,
        cgHoldPages: 4,
        spriteDefaultScale: 100,
        spriteGenderScale: normalizeSpriteGenderScale(null),
        spriteDisplayScale: 100,
        showStatusLine: false,
        dblclickCgOnly: false,
        titleScreen: true,
        dialogAutoHeight: false,
        cinemaBars: false,
        typewriter: { ...TYPEWRITER_DEFAULTS },
        stageShake: normalizeStageShakeSettings(null),
        voiceBark: normalizeVoiceBarkSettings(null),
        tts: normalizeTtsSettings(null),
        chatShow: normalizeChatShowSettings(null),
        systemRole: normalizeSystemRoleSettings(null),
        weatherFx: normalizeWeatherFxSettings(null),
        ...normalizeFxReaderSettings(null),
        imageCountOverride: null,
        pinnedBtns: Array.from(DEFAULT_PINNED_TOOLBAR_BUTTONS),
        hiddenBtns: [],
        btnOrder: TOOLBAR_ACTIONS.map(([id]) => id),
        toolbarSplit: 'split',
        dialogBarAlign: 'auto',
        dialogBarBtns: normalizeDialogBarButtons(null),
        spriteLayouts: {},
        spriteHeads: {},
        castSlotLayouts: {},
    };
    const normalized = { ...base, ...src, _v: currentVersion };
    delete normalized.emptyBackgroundColor;
    normalized.dialogSkin = normalizeDialogSkin(normalized.dialogSkin);
    normalized.gradientVeil = normalizeGradientVeil(normalized.gradientVeil);
    normalized.classicDialogWidthPercent = normalizeClassicDialogWidthPercent(normalized.classicDialogWidthPercent);
    normalized.skinDialogScale = normalizeSkinDialogScale(normalized.skinDialogScale);
    normalized.magicHouse = normalizeMagicHouse(normalized.magicHouse);
    normalized.horrorDreadCap = normalizeHorrorDreadCap(normalized.horrorDreadCap);
    normalized.magicAccent = normalizeMagicAccent(normalized.magicAccent);
    normalized.fontSize = normalizeFiniteNumber(normalized.fontSize, base.fontSize);
    normalized.dialogFontWeight = normalized.dialogFontWeight != null
        && [300, 400, 500, 700].includes(Number(normalized.dialogFontWeight))
        ? Number(normalized.dialogFontWeight) : null;
    normalized.dialogTextEffect = ['off', 'outline', 'shadow'].includes(normalized.dialogTextEffect)
        ? normalized.dialogTextEffect : base.dialogTextEffect;
    normalized.dialogTextEffectColor = /^#[0-9a-fA-F]{6}$/.test(normalized.dialogTextEffectColor)
        ? normalized.dialogTextEffectColor : base.dialogTextEffectColor;
    normalized.dialogTextEffectStrength = clampNumber(
        normalizeFiniteNumber(normalized.dialogTextEffectStrength, base.dialogTextEffectStrength), 5, 50);
    normalized.dialogTextEffectSize = [0.4, 0.6, 0.8, 1, 1.2, 1.6, 2].includes(Number(normalized.dialogTextEffectSize))
        ? Number(normalized.dialogTextEffectSize) : base.dialogTextEffectSize;
    normalized.optionFontSize = clampNumber(normalizeFiniteNumber(normalized.optionFontSize, base.optionFontSize), 10, 30);
    normalized.dialogWidth = normalizeNullableNumber(normalized.dialogWidth);
    const normalizedDialogHeight = normalizeNullableNumber(normalized.dialogHeight);
    if (normalizedDialogHeight == null) {
        normalized.dialogHeight = null;
    } else if (normalizedDialogHeight >= 0 && normalizedDialogHeight <= 1) {
        normalized.dialogHeight = clampNumber(normalizedDialogHeight, 0.05, 0.4);
    } else {
        // 兼容历史 px 设置；用户改选新档位后即保存为 iframe 高度比例。
        normalized.dialogHeight = clampNumber(normalizedDialogHeight, 60, 600);
    }
    normalized.glassOpacity = normalizeOpacity(normalized.glassOpacity, base.glassOpacity);
    normalized.glassBackdropFilter = normalizeBoolean(normalized.glassBackdropFilter, base.glassBackdropFilter);
    normalized.toolbarScale = normalizeFiniteNumber(normalized.toolbarScale, base.toolbarScale);
    normalized.toolbarDock = normalized.toolbarDock === 'float' ? 'float' : 'top';
    normalized.inputPlacement = normalized.inputPlacement === 'float' ? 'float' : 'dialog';
    normalized.inputScale = normalizeFiniteNumber(normalized.inputScale, base.inputScale);
    normalized.imgMode = normalized.imgMode === 'contain' ? 'contain' : 'adaptive';
    normalized.imgBrightness = clampNumber(normalizeFiniteNumber(normalized.imgBrightness, base.imgBrightness), 10, 100);
    normalized.showStatusLine = normalizeBoolean(normalized.showStatusLine, false);
    normalized.dblclickCgOnly = normalizeBoolean(normalized.dblclickCgOnly, false);
    normalized.titleScreen = normalizeBoolean(normalized.titleScreen, true);
    normalized.dialogAutoHeight = normalizeBoolean(normalized.dialogAutoHeight, false);
    normalized.cinemaBars = normalizeBoolean(normalized.cinemaBars, false);
    normalized.typewriter = normalizeTypewriterSettings(normalized.typewriter);
    normalized.stageShake = normalizeStageShakeSettings(normalized.stageShake);
    normalized.voiceBark = normalizeVoiceBarkSettings(normalized.voiceBark);
    normalized.tts = normalizeTtsSettings(normalized.tts);
    normalized.chatShow = normalizeChatShowSettings(normalized.chatShow);
    normalized.systemRole = normalizeSystemRoleSettings(normalized.systemRole);
    normalized.weatherFx = normalizeWeatherFxSettings(normalized.weatherFx);
    normalized.performance = normalizePerformanceSettings(normalized.performance);
    for (const [key, normalize] of Object.entries(FX_SETTINGS_NORMALIZERS)) normalized[key] = normalize(normalized[key]);
    normalized.statusHud = normalizeStatusHudSettings(normalized.statusHud);
    normalized.imageCountOverride = normalizeNullableNumber(normalized.imageCountOverride);
    normalized.pinnedBtns = normalizePinnedButtons(normalized.pinnedBtns);
    normalized.hiddenBtns = normalizeHiddenButtons(normalized.hiddenBtns);
    normalized.btnOrder = normalizeBtnOrder(normalized.btnOrder);
    normalized.toolbarSplit = normalizeToolbarSplit(normalized.toolbarSplit);
    normalized.dialogBarAlign = normalizeDialogBarAlign(normalized.dialogBarAlign);
    normalized.dialogBarBtns = normalizeDialogBarButtons(normalized.dialogBarBtns);
    normalized.spriteLayouts = normalizeSpriteLayouts(normalized.spriteLayouts);
    normalized.spriteDefaultScale = normalizeSpriteDefaultScale(normalized.spriteDefaultScale);
    normalized.spriteGenderScale = normalizeSpriteGenderScale(normalized.spriteGenderScale);
    normalized.spriteDisplayScale = normalizeSpriteDisplayScale(normalized.spriteDisplayScale);
    normalized.spriteHeads = normalizeSpriteHeads(normalized.spriteHeads);
    normalized.castSlotLayouts = normalizeSpriteLayouts(normalized.castSlotLayouts);
    // 对话主题（vnTheme）按模式存进 readerSettings。独立于 _v 门控处理，避免 schema 版本
    // 不符时被清空。settings.vnTheme 缺失时回退到旧的全局 bridge.vnTheme（legacyTheme），
    // 实现从全局存储到按模式存储的平滑迁移。旧的全局 dialogFont 只在读取时迁移为
    // 分类台词字体，避免继续以全局覆盖项压过 textFont。
    const legacyDialogFont = DIALOG_FONT_OPTIONS.some(([font]) => font === src.dialogFont) && src.dialogFont !== 'inherit'
        ? src.dialogFont : '';
    const rawTheme = (src.vnTheme && typeof src.vnTheme === 'object')
        ? src.vnTheme
        : (legacyTheme && typeof legacyTheme === 'object' ? legacyTheme : null);
    const rawClassicTheme = src.classicVnTheme && typeof src.classicVnTheme === 'object'
        ? src.classicVnTheme : null;
    const migratedTheme = legacyDialogFont ? { ...(rawTheme || {}), textFont: legacyDialogFont } : rawTheme;
    const migratedClassicTheme = legacyDialogFont ? { ...(rawClassicTheme || {}), textFont: legacyDialogFont } : rawClassicTheme;
    normalized.vnTheme = normalizeVnTheme(migratedTheme || {});
    normalized.classicVnTheme = normalizeVnTheme(migratedClassicTheme || {}, CLASSIC_DIALOG_THEME_DEFAULTS);
    delete normalized.dialogFont;
    return normalized;
}
