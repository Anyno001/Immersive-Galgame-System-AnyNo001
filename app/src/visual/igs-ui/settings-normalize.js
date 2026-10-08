import { LEGACY_READER_MODES, resolveLegacyReaderMode } from '../../storage/legacy-igs.js';
import { buildNarrativeSegments } from '../../scene/image-slots.js';
import { SETTINGS_TAB_ALIASES, SETTINGS_TAB_DEFS } from './settings-tabs.js';
import { DEFAULT_DIALOG_BAR_BUTTONS, DIALOG_BAR_ALIGNS, TOOLBAR_ACTIONS, TOOLBAR_SPLIT_MODES, VN_THEME_PRESETS } from './reader-host-constants.js';
import { esc, normalizeFiniteNumber } from './reader-value-utils.js';
import { CLASSIC_DIALOG_THEME_DEFAULTS, isClassicDialogSkin, normalizeDialogSkin } from './classic-dialog-skin.js';
import { getReferenceDialogTypography } from './dialog-theme-typography.js';
import { normalizeStageShakeSettings } from './stage-shake-runtime.js';
import { normalizeRenderQualitySetting } from './render-quality.js';
import { spriteIdentity } from '../../scene/character-outfits.js';
import { normalizeImageCacheCount } from '../../media/tavern-image-cache.js';
import { normalizeStatusHudPercent } from '../../data/shujuku/status-hud-model.js';


export function normalizeReaderMode(mode, bridge) {
    if (mode === 'default') return 'default';
    const resolved = resolveLegacyReaderMode(mode, '', bridge || {});
    return LEGACY_READER_MODES.includes(resolved) ? resolved : 'pc';
}

export function normalizeSettingsTab(tab) {
    const raw = String(tab || 'basic').trim();
    const normalized = SETTINGS_TAB_ALIASES[raw] || raw;
    return SETTINGS_TAB_DEFS.some(([id]) => id === normalized) ? normalized : 'basic';
}

export function normalizePerformanceSettings(value) {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return { ...src, quality: normalizeRenderQualitySetting(src.quality) };
}

export function normalizeSettingsValue(path, value) {
    if (path === 'readerMode' || path === 'bridge.openMode' || path === 'bridge.imageApi.mode' || path === 'bridge.imageApi.externalAdapter' || path === 'readerSettings.imgMode') {
        return String(value || '');
    }
    if (path.startsWith('readerSettings.')) {
        if (path === 'readerSettings.performance.quality') return normalizeRenderQualitySetting(value);
        if (value === null || value === 'null') return null;
        if (path === 'readerSettings.typewriter.mode') return value === 'classic' ? 'classic' : 'soft';
        if (/^readerSettings\.typewriter\.sound\.(volume|dialogueVolume|narrationVolume)$/.test(path)) {
            const volume = Number(value);
            return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.5;
        }
        if (/^readerSettings\.chatShow\.(enabled|hideSprites|followTheme|typingIndicator|showAvatars|sound\.enabled)$/.test(path) || path === 'readerSettings.systemRole.showName') {
            return value === true || value === 'true' || value === 1 || value === '1';
        }
        if (/^readerSettings\.chatShow\.(dim|sound\.volume)$/.test(path)) return Number(value);
        if (/^readerSettings\.(titleCard|mangaFx|heartbeatFx|flashFx|favorToast|fxTags|fxSound)\.(enabled|onLocation|onTime|call|notify|flashback|dream|letterbox|sfx|eye)$/.test(path)) {
            return value === true || value === 'true' || value === 1 || value === '1';
        }
        if (/^readerSettings\.(sceneTransition|timeTint|spriteMotion|spriteActions|camera|stageCast|textFx|bilingual|clickWaitMark|bgm|ambientSound|uiSound)\.(enabled|moodTag|night|alignHeads|romanceDuo|castReact|castStage|breathing|castBreathing|castLean|speakBounce|enterExit|emotionFade|kenBurns|parallax|closeUp|aiShots|birds|rain|wind|insects|waves|crowd|thunder|stream|fire|snow|cicadas|frogs|chimes|bell|clock|drip|train|tavern|ship|traffic|car|carriage|bath|underwater|space)$/.test(path)
            || /^readerSettings\.dailyFx\.[a-zA-Z]+$/.test(path)
            || /^readerSettings\.(liveFx|audienceFx|innerFx)\.(enabled|muteOnNsfw|ambient|useThought)$/.test(path)
            || path === 'readerSettings.typewriter.punctuationPause'
            || path === 'readerSettings.typewriter.prosody') {
            return value === true || value === 'true' || value === 1 || value === '1';
        }
        if (path === 'readerSettings.fxSound.volume' || path === 'readerSettings.bgm.volume' || path === 'readerSettings.ambientSound.volume' || path === 'readerSettings.uiSound.volume' || path === 'readerSettings.audioMaster.volume') {
            const volume = Number(value);
            return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.5;
        }
        if (/^readerSettings\.metaFx\.(enabled|poke|hover|reading|clock|festivals|digest)$/.test(path)) return value === true || value === 'true' || value === 1 || value === '1';
        if (/^readerSettings\.comicMode\.(enabled|frame|keepPrev|tail)$/.test(path)) return value === true || value === 'true' || value === 1 || value === '1';
        if (/^readerSettings\.(mangaBack\.enabled|crowdFx\.(enabled|react))$/.test(path)) return value === true || value === 'true' || value === 1 || value === '1';
        if (path === 'readerSettings.comicMode.palette') return value === 'color' ? 'color' : 'mono';
        if (path === 'readerSettings.comicMode.line') return ['thin', 'medium', 'bold'].includes(value) ? value : 'medium';
        if (path === 'readerSettings.comicMode.inputStyle') return value === 'plain' ? 'plain' : 'comic';
        if (path === 'readerSettings.comicMode.gap') return ['near', 'medium', 'far'].includes(value) ? value : 'medium';
        if (path === 'readerSettings.comicMode.inkMode') return value === 'custom' ? 'custom' : 'auto';
        if (path === 'readerSettings.comicMode.inkColor') return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#141414';
        if (path === 'readerSettings.metaFx.cooldownSec') return Number(value);
        if (path === 'readerSettings.metaFx.birthday') return String(value || '').trim();
        if (path === 'readerSettings.statusHud.nsfwCgPortraitShift' || path === 'readerSettings.statusHud.nsfwCgPortraitZoom') return Number(value);
        if (/^readerSettings\.statusHud\.position\.(pc|mobile)\.[xy]$/.test(path)) return normalizeStatusHudPercent(value);
        if (path === 'readerSettings.dialogFontWeight') return [300, 400, 500, 700].includes(Number(value)) ? Number(value) : null;
        if (path === 'readerSettings.dialogTextEffect') return ['off', 'outline', 'shadow'].includes(value) ? value : 'off';
        if (path === 'readerSettings.dialogTextEffectColor') return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
        if (path === 'readerSettings.spriteDefaultScale') return normalizeSpriteHeight(value, 100);
        if (path === 'readerSettings.spriteGenderScale.enabled') return value === true || value === 'true' || value === 1 || value === '1';
        const genderHeight = path.match(/^readerSettings\.spriteGenderScale\.(female|male|other)$/);
        if (genderHeight) return normalizeSpriteHeight(value, SPRITE_GENDER_SCALE_DEFAULTS[genderHeight[1]]);
        if (path === 'readerSettings.spriteDisplayScale') return normalizeSpriteDisplayScale(value);
        if (path === 'readerSettings.dialogTextEffectStrength') return Math.max(5, Math.min(50, Number(value) || 20));
        if (path === 'readerSettings.dialogTextEffectSize') return [0.4, 0.6, 0.8, 1, 1.2, 1.6, 2].includes(Number(value)) ? Number(value) : 0.8;
        if (/fontSize|optionFontSize|dialogWidth|dialogHeight|classicDialogWidthPercent|skinDialogScale|toolbarScale|inputScale|imageCountOverride|imgBrightness|cgHoldPages|gradientVeil\.(heightPercent|opacity)/.test(path)) {
            return Number(value);
        }
        if (/glassOpacity/.test(path)) {
            return Number(value);
        }
        if (/^readerSettings\.typewriter\.(enabled|sound\.enabled|sound\.speakerPitch)$/.test(path) || /^readerSettings\.stageShake\.enabled$/.test(path) || /^readerSettings\.weatherFx\.enabled$/.test(path) || /^readerSettings\.statusHud\.enabled$/.test(path) || /^readerSettings\.statusHud\.showEmotion$/.test(path) || /^readerSettings\.statusHud\.showLocation$/.test(path) || /^readerSettings\.statusHud\.showLocationDetails$/.test(path) || /^readerSettings\.statusHud\.showSpriteOnNsfw$/.test(path) || /^readerSettings\.statusHud\.dimSpriteOnNarration$/.test(path) || path === 'readerSettings.statusHud.nsfwCgPortrait') {
            return value === true || value === 'true' || value === 1 || value === '1';
        }
    }
    if (path === 'bridge.sceneAssets.moodAutoClassify') return value === true || value === 'true' || value === 1 || value === '1';
    if (path === 'bridge.sceneAssets.spriteEnhance.enabled') return value === true || value === 'true' || value === 1 || value === '1';
    if (path === 'bridge.sceneAssets.spriteEnhance.mode') return value === 'shadow' ? 'shadow' : 'outline';
    if (path === 'bridge.sceneAssets.spriteEnhance.color') return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
    if (path === 'bridge.sceneAssets.spriteEnhance.strength') return [5, 10, 15, 20, 30, 40, 50].includes(Number(value)) ? Number(value) : 20;
    if (path === 'bridge.sceneAssets.spriteEnhance.size') return [0.4, 0.6, 0.8, 1, 1.2, 1.6, 2].includes(Number(value)) ? Number(value) : 0.8;
    if (path === 'bridge.sceneAssets.promptPlacement') return value === 'depth0' ? 'depth0' : 'system';
    if (path === 'bridge.sceneAssets.promptAdaptive') return !(value === false || value === 'false' || value === 0 || value === '0');
    if (path === 'bridge.sceneAssets.promptRuleEnabled') return !(value === false || value === 'false' || value === 0 || value === '0');
    if (/^bridge\.autoIllustration\.(nsfwEnabled|interludeEnabled|assets\.(spriteEnabled|backgroundEnabled|strictMatch))$/.test(path)) {
        return value === true || value === 'true' || value === 1 || value === '1';
    }
    if (/^bridge\.autoIllustration\.assets\.(spriteSize|backgroundSize|templates\.(background|backgroundNegative|sprite|spriteNegative|nsfwExtra))$/.test(path)) {
        return String(value || '');
    }
    if (/^bridge\.autoIllustration\.(nsfwCount|interludeProbability|interludeMaxCount|assets\.maxPerFloor|llm\.contextFloors|llm\.timeoutMs|nai\.steps|nai\.scale|nai\.timeoutMs)$/.test(path)) {
        return Number(value);
    }
    if (path === 'bridge.autoIllustration.llm.source' || path === 'bridge.autoIllustration.nai.transport') {
        return String(value || '');
    }
    if (/^bridge\.imageApi\.(steps|requestTimeoutMs|pollIntervalMs|pollAttempts)$/.test(path)) {
        return Number(value);
    }
    if (/^bridge\.imageApi\.(sprite|background|item)Model$/.test(path)) return String(value || '').trim();
    if (path === 'bridge.imageApi.dbgenSpriteTransparent') {
        return !(value === false || value === 'false' || value === 0 || value === '0');
    }
    if (path === 'bridge.imageCache.maxCount') return normalizeImageCacheCount(value);
    return value;
}

export function getPath(target, path) {
    return String(path || '').split('.').reduce((value, key) => (value == null ? value : value[key]), target);
}

export function setPath(target, path, value) {
    const parts = String(path || '').split('.');
    let cursor = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
        const key = parts[index];
        const nextKey = parts[index + 1];
        if (!cursor[key] || typeof cursor[key] !== 'object' || (Array.isArray(cursor[key]) && !/^\d+$/.test(nextKey))) {
            cursor[key] = {};
        }
        cursor = cursor[key];
    }
    cursor[parts[parts.length - 1]] = value;
}

export function buildTextSegments(text) {
    return buildNarrativeSegments(text);
}

export function normalizePinnedButtons(value) {
    const allowed = new Set(TOOLBAR_ACTIONS.map(([id]) => id));
    const output = [];
    for (const id of Array.isArray(value) ? value : []) {
        const normalized = String(id || '').trim();
        if (!normalized || !allowed.has(normalized) || output.includes(normalized)) continue;
        output.push(normalized);
    }
    return output;
}

export function normalizeHiddenButtons(value) {
    const allowed = new Set(TOOLBAR_ACTIONS.map(([id]) => id));
    const protected_ = new Set(['settings']);
    const output = [];
    for (const id of Array.isArray(value) ? value : []) {
        const normalized = String(id || '').trim();
        if (!normalized || !allowed.has(normalized) || protected_.has(normalized) || output.includes(normalized)) continue;
        output.push(normalized);
    }
    return output;
}

export function normalizeToolbarSplit(value) {
    return TOOLBAR_SPLIT_MODES.includes(value) ? value : 'split';
}

export function normalizeDialogBarAlign(value) {
    return DIALOG_BAR_ALIGNS.includes(value) ? value : 'auto';
}

// 没设过（不是数组）用默认那组；设成空数组表示快捷栏一个都不放。设置键不能挪。
export function normalizeDialogBarButtons(value) {
    if (!Array.isArray(value)) return Array.from(DEFAULT_DIALOG_BAR_BUTTONS);
    const allowed = new Set(TOOLBAR_ACTIONS.map(([id]) => id));
    const output = [];
    for (const id of value) {
        const normalized = String(id || '').trim();
        if (!normalized || normalized === 'settings' || !allowed.has(normalized) || output.includes(normalized)) continue;
        output.push(normalized);
    }
    return output;
}

export function normalizeBtnOrder(value) {
    const canonical = TOOLBAR_ACTIONS.map(([id]) => id);
    const allowed = new Set(canonical);
    const output = [];
    for (const id of Array.isArray(value) ? value : []) {
        const normalized = String(id || '').trim();
        if (!normalized || !allowed.has(normalized) || output.includes(normalized)) continue;
        output.push(normalized);
    }
    for (const id of canonical) {
        if (!output.includes(id)) output.push(id);
    }
    return output;
}

export function normalizeSpriteLayouts(value) {
    const def = { posX: 50, posY: 100, scale: 100 };
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out = {};
    for (const key of Object.keys(value)) {
        const src = (typeof value[key] === 'object' && value[key]) ? value[key] : {};
        out[key] = {
            posX: normalizeFiniteNumber(src.posX, def.posX),
            posY: normalizeFiniteNumber(src.posY, def.posY),
            scale: normalizeFiniteNumber(src.scale, def.scale),
        };
    }
    return out;
}

export function normalizeSpriteDefaultScale(value) {
    return normalizeSpriteHeight(value, 100);
}

// 立绘高度（基准高度、性别默认、角色自定义），单位是舞台高度百分比。不设上下限。
const SPRITE_GENDER_SCALE_DEFAULTS = Object.freeze({ enabled: false, female: 90, male: 100, other: 95 });

// 留空、不是数字或为 0 时用 fallback；其余取整，正负都可以。
export function normalizeSpriteHeight(value, fallback = null) {
    if (value == null || String(value).trim() === '') return fallback;
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return fallback;
    return Math.round(n);
}

export function normalizeSpriteGenderScale(value) {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const defaults = SPRITE_GENDER_SCALE_DEFAULTS;
    return {
        enabled: src.enabled === true,
        female: normalizeSpriteHeight(src.female, defaults.female),
        male: normalizeSpriteHeight(src.male, defaults.male),
        other: normalizeSpriteHeight(src.other, defaults.other),
    };
}

// 全局显示比例：100 是当前占满舞台的高度，所有立绘一起乘上它。不设上下限，非法或非正数回到 100。
export function normalizeSpriteDisplayScale(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 100;
}

export function applySpriteDisplayScale(layout, displayScale) {
    const base = layout && typeof layout === 'object' ? layout : { posX: 50, posY: 100, scale: 100 };
    const factor = normalizeSpriteDisplayScale(displayScale) / 100;
    const scale = Number(base.scale);
    const next = (Number.isFinite(scale) ? scale : 100) * factor;
    if (next === base.scale) return base;
    return { ...base, scale: next };
}

// 编辑时画面上的是显示高度。存回位置时除掉全局比例，避免下次再乘一次。
export function spriteStoredScale(displayScale, globalPercent) {
    const factor = normalizeSpriteDisplayScale(globalPercent) / 100;
    const n = Number(displayScale);
    return (Number.isFinite(n) ? n : 100) / factor;
}

// defaultScale：没单独调过位置的立绘用的默认高度（舞台高度百分比），来自基准高度或性别默认高度，让位给模式整体缩放。
// characterScale：角色在素材里单独填的高度，压过模式整体缩放；「调整立绘」存下的位置仍按自己的大小。
export function resolveSpriteLayout(layouts, mode, character, mood, outfit = '', defaultScale = 100, characterScale = null) {
    const ownScale = Number(characterScale);
    const own = character && Number.isFinite(ownScale) && ownScale !== 0 ? ownScale : null;
    const def = { posX: 50, posY: 100, scale: own ?? normalizeSpriteDefaultScale(defaultScale) };
    const modeLayout = layouts && layouts[mode];
    const placed = (layout) => ({
        posX: layout.posX,
        posY: layout.posY,
        scale: Number.isFinite(Number(layout.scale)) ? Number(layout.scale) : def.scale,
    });
    if (!layouts) return def;
    if (character) {
        const identity = spriteIdentity(character, outfit);
        // 服装先查自身位置；未调过时回落到角色整体位置，不借用原有立绘的单表情位置。命中的那条记录自己的大小就是画出来的大小。
        if (identity !== character) {
            if (mood && layouts[`${mode}::${identity}::${mood}`]) return placed(layouts[`${mode}::${identity}::${mood}`]);
            if (layouts[`${mode}::${identity}`]) return placed(layouts[`${mode}::${identity}`]);
        } else if (mood) {
            const moodKey = `${mode}::${character}::${mood}`;
            if (layouts[moodKey]) return placed(layouts[moodKey]);
        }
        const charKey = `${mode}::${character}`;
        if (layouts[charKey]) return placed(layouts[charKey]);
    }
    if (modeLayout) return own == null ? placed(modeLayout) : { ...placed(modeLayout), scale: own };
    return def;
}

export function resolveActiveTheme(snapshot) {
    const readerSettings = snapshot.readerSettings || {};
    const dialogSkin = normalizeDialogSkin(readerSettings.dialogSkin);
    const classic = isClassicDialogSkin(readerSettings);
    const referenceTypography = getReferenceDialogTypography(dialogSkin);
    const vnTheme = classic ? (readerSettings.classicVnTheme || {}) : (readerSettings._vnTheme || readerSettings.vnTheme || {});
    const presetName = classic ? 'custom' : (vnTheme.preset || 'genshin');
    const preset = classic ? CLASSIC_DIALOG_THEME_DEFAULTS : (VN_THEME_PRESETS[presetName] || VN_THEME_PRESETS.genshin);
    const activeTheme = !classic && presetName !== 'custom' ? { ...preset } : {
        nameAlign: vnTheme.nameAlign || preset.nameAlign,
        textAlign: vnTheme.textAlign || preset.textAlign || 'left',
        narrationAlign: vnTheme.narrationAlign || preset.narrationAlign || 'left',
        thoughtAlign: vnTheme.thoughtAlign || preset.thoughtAlign || 'left',
        dividerSymbol: vnTheme.dividerSymbol != null ? vnTheme.dividerSymbol : preset.dividerSymbol,
        nameFont: vnTheme.nameFont || preset.nameFont,
        textFont: vnTheme.textFont || preset.textFont,
        thoughtFont: vnTheme.thoughtFont || preset.thoughtFont,
        narrationFont: vnTheme.narrationFont || preset.narrationFont,
        nameColor: vnTheme.nameColor || preset.nameColor,
        textColor: vnTheme.textColor || preset.textColor,
        thoughtColor: vnTheme.thoughtColor || preset.thoughtColor,
        narrationColor: vnTheme.narrationColor || preset.narrationColor,
        dividerColor: vnTheme.dividerColor || preset.dividerColor,
        dialogBg: vnTheme.dialogBg || preset.dialogBg,
        bgOpacity: vnTheme.bgOpacity != null ? vnTheme.bgOpacity : null,
    };
    return referenceTypography ? applyReferenceTypographyDefaults(activeTheme, referenceTypography, preset) : activeTheme;
}

function applyReferenceTypographyDefaults(theme, referenceTypography, baseline) {
    const result = { ...theme };
    for (const [key, value] of Object.entries(referenceTypography)) {
        if (result[key] == null || result[key] === baseline[key]) result[key] = value;
    }
    return result;
}

export function renderDialogueHtml(text, theme, sceneAssetsEnabled) {
    const escaped = esc(text);
    if (!sceneAssetsEnabled) return escaped;
    const html = escaped.replace(/\*([^*]+)\*/g, (_, inner) => {
        const styles = [];
        if (theme.thoughtFont && theme.thoughtFont !== 'inherit') styles.push(`font-family:${cssFontValue(theme.thoughtFont)}`);
        if (theme.thoughtColor) styles.push(`color:${theme.thoughtColor}`);
        const styleAttr = styles.length ? ` style="${styles.join(';')}"` : '';
        return `<span class="igs-thought"${styleAttr}>${inner}</span>`;
    });
    // 心理活动标记可能不成对（模型漏写右星号），残留的星号一律不渲染。
    return html.replace(/\*/g, '');
}

function cssFontValue(font) {
    return String(font || '').replace(/"/g, "'");
}
