import { NAI_DEFAULT_SETTINGS } from '../request-builders/nai-v4-builder.js';
import { normalizeArtistByKind } from '../prompt-artists.js';
import { normalizeArtistLibrary } from '../artist-library.js';
import { DEFAULT_ASSET_TEMPLATES } from './prompt-kit.js';
import { PLANNER_SYSTEM_PROMPT, PLANNER_SOFT_SYSTEM_PROMPT } from './planner-prompt.js';
import { ASSET_PLANNER_SYSTEM_PROMPT, ASSET_PLANNER_SOFT_SYSTEM_PROMPT } from './asset-prompt.js';

// 副 LLM 系统提示词：留空即使用内置版本，保证内置提示词升级后未改动的用户能跟着更新。
export const DEFAULT_LLM_PROMPTS = Object.freeze({
    illustration: PLANNER_SYSTEM_PROMPT,
    illustrationSoft: PLANNER_SOFT_SYSTEM_PROMPT,
    asset: ASSET_PLANNER_SYSTEM_PROMPT,
    assetSoft: ASSET_PLANNER_SOFT_SYSTEM_PROMPT,
});

export const NSFW_COUNT_MAX = 16;

const clampInt = (v, min, max, d) => {
    const n = Math.round(Number(v));
    return v == null || v === '' || !Number.isFinite(n) ? d : Math.min(max, Math.max(min, n));
};
const clampNum = (v, min, max, d) => {
    const n = Number(v);
    return v == null || v === '' || !Number.isFinite(n) ? d : Math.min(max, Math.max(min, n));
};
const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const str = (v, d = '') => (typeof v === 'string' ? v : d);

// 旧低值和非法资料保留可读；是否可发送由任务预检决定，不悄悄抬高强度。
export const normalizeConsistencyStrength = (value) => {
    if (value == null || value === '') return 0.6;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
    return value;
};
export const isConsistencyStrengthValid = (value) => Number.isFinite(value) && value >= 0.1 && value <= 1;

export const CONSISTENCY_MODEL_OPTIONS = Object.freeze([
    ['nai-diffusion-4-5-full-inpainting', 'V4.5 Inpainting'],
    ['nai-diffusion-5-full-inpainting', 'V5 Inpainting'],
]);
// 缺省兼容旧设置；显式非法值保留，执行时拒发，不静默换模型。
export const normalizeConsistencyModel = (value) => value == null || value === ''
    ? 'nai-diffusion-5-full-inpainting' : value;
export const isConsistencyModelValid = (value) => CONSISTENCY_MODEL_OPTIONS.some(([model]) => model === value);

// 模板留空视为恢复内置模板；背景/立绘正向模板必须含 {tags}，否则 LLM 的内容会被丢掉。
// 只迁移可确认的旧内置原样副本；自定义模板保持原值。
const LEGACY_SPRITE_TEMPLATES = new Set([
    '{tags}, solo, upper body, framed from the top of the head to the hips, standing, facing viewer, looking at viewer, straight-on, centered, {matte}',
    '{tags}, solo, cowboy shot, standing, facing viewer, looking at viewer, straight-on, arms at sides, centered, {matte}',
    '{tags}, solo, cowboy shot, standing, facing viewer, looking at viewer, straight-on, centered, {matte}',
]);
const LEGACY_SPRITE_NEGATIVES = new Set([
    'multiple views, 2girls, 2boys, multiple girls, multiple boys, crowd, close-up, portrait, upper body, full body, feet, head out of frame, cropped arms, scenery, detailed background, white background, gradient background, patterned background, drop shadow, floor, furniture, holding weapon, text, speech bubble, watermark, signature, frame, border',
    'multiple views, 2girls, 2boys, multiple girls, multiple boys, crowd, close-up, portrait, full body, feet, head out of frame, cropped arms, scenery, detailed background, white background, gradient background, patterned background, drop shadow, floor, furniture, holding weapon, text, speech bubble, watermark, signature, frame, border',
    'multiple views, 2girls, 2boys, multiple girls, multiple boys, crowd, close-up, portrait, full body, feet, head out of frame, cropped arms, 1.5::scenery, detailed background::, white background, 1.5::gradient background, patterned background, drop shadow, floor, furniture::, holding weapon, text, speech bubble, watermark, signature, frame, border',
]);

function normalizeTemplates(value) {
    const src = value && typeof value === 'object' ? value : {};
    const out = {};
    for (const [key, fallback] of Object.entries(DEFAULT_ASSET_TEMPLATES)) {
        const text = typeof src[key] === 'string' ? src[key].trim() : '';
        const needsTags = key === 'background' || key === 'sprite';
        const legacy = key === 'sprite' ? LEGACY_SPRITE_TEMPLATES.has(text)
            : key === 'spriteNegative' && LEGACY_SPRITE_NEGATIVES.has(text);
        out[key] = text && !legacy && (!needsTags || text.includes('{tags}')) ? text : fallback;
    }
    return out;
}

function normalizePrompts(value) {
    const src = value && typeof value === 'object' ? value : {};
    const out = {};
    for (const [key, fallback] of Object.entries(DEFAULT_LLM_PROMPTS)) {
        const text = typeof src[key] === 'string' ? src[key].trim() : '';
        out[key] = text || fallback;
    }
    return out;
}

export function normalizeAutoIllustrationSettings(value) {
    const src = value && typeof value === 'object' ? value : {};
    const llm = src.llm && typeof src.llm === 'object' ? src.llm : {};
    const nai = src.nai && typeof src.nai === 'object' ? src.nai : {};
    const assets = src.assets && typeof src.assets === 'object' ? src.assets : {};
    return {
        consistencyStrength: normalizeConsistencyStrength(src.consistencyStrength),
        consistencyModel: normalizeConsistencyModel(src.consistencyModel),
        nsfwEnabled: bool(src.nsfwEnabled),
        nsfwCount: clampInt(src.nsfwCount, 1, NSFW_COUNT_MAX, 1),
        interludeEnabled: bool(src.interludeEnabled),
        interludeProbability: clampInt(src.interludeProbability, 0, 100, 30),
        interludeMaxCount: clampInt(src.interludeMaxCount, 1, 16, 1),
        backfillOldFloors: bool(src.backfillOldFloors),
        retry: { enabled: !(src.retry && src.retry.enabled === false), times: clampInt(src.retry && src.retry.times, 0, 5, 2) },
        assets: {
            spriteEnabled: bool(assets.spriteEnabled),
            outfitAutoGenerate: bool(assets.outfitAutoGenerate),
            backgroundEnabled: bool(assets.backgroundEnabled),
            strictMatch: bool(assets.strictMatch),
            // 默认开：非白天先画白天底图，再复用底图种子换时间词出差分。
            dayFirst: !(assets.dayFirst === false || assets.dayFirst === 'false' || assets.dayFirst === 0 || assets.dayFirst === '0'),
            maxPerFloor: clampInt(assets.maxPerFloor, 1, 16, 2),
            spriteSize: str(assets.spriteSize, '832x1216') || '832x1216',
            backgroundSize: str(assets.backgroundSize, '1216x832') || '1216x832',
            templates: normalizeTemplates(assets.templates),
        },
        llm: {
            source: llm.source === 'openai' ? 'openai' : 'tavern',
            endpoint: str(llm.endpoint), apiKey: str(llm.apiKey), model: str(llm.model),
            contextFloors: clampInt(llm.contextFloors, 0, 3, 1),
            timeoutMs: clampInt(llm.timeoutMs, 10000, 300000, 90000),
            prompts: normalizePrompts(llm.prompts),
            jailbreakHead: str(llm.jailbreakHead),
            jailbreakTail: str(llm.jailbreakTail),
        },
        nai: {
            transport: nai.transport === 'st-proxy' ? 'st-proxy' : 'direct',
            endpoint: str(nai.endpoint),
            apiKey: str(nai.apiKey),
            model: str(nai.model, NAI_DEFAULT_SETTINGS.model) || NAI_DEFAULT_SETTINGS.model,
            size: str(nai.size, NAI_DEFAULT_SETTINGS.size) || NAI_DEFAULT_SETTINGS.size,
            steps: clampInt(nai.steps, 1, 50, NAI_DEFAULT_SETTINGS.steps),
            scale: clampNum(nai.scale, 0, 10, NAI_DEFAULT_SETTINGS.scale),
            sampler: str(nai.sampler, NAI_DEFAULT_SETTINGS.sampler) || NAI_DEFAULT_SETTINGS.sampler,
            noiseSchedule: str(nai.noiseSchedule, NAI_DEFAULT_SETTINGS.noiseSchedule) || NAI_DEFAULT_SETTINGS.noiseSchedule,
            artistPrefix: str(nai.artistPrefix),
            ...(typeof nai.artistNegativePrefix === 'string' && { artistNegativePrefix: nai.artistNegativePrefix }),
            // 旧通用负面仅保留已有文本供归档；新配置不再注入默认值。
            negativePrompt: str(nai.negativePrompt),
            artistByKind: normalizeArtistByKind(nai.artistByKind),
            artistLibrary: normalizeArtistLibrary(nai.artistLibrary),
            timeoutMs: clampInt(nai.timeoutMs, 10000, 300000, NAI_DEFAULT_SETTINGS.timeoutMs),
            // 草稿首次归档会追加此标记；归一化保持相同顺序，避免无修改关闭重写存储。
            ...(nai.artistLibraryArchived === true && { artistLibraryArchived: true }),
        },
    };
}

// 精准生图优先只在开启背景生成时生效：没有生成兜底时收紧匹配只会让背景变空。
export function isStrictBackgroundMatch(settings) {
    const s = normalizeAutoIllustrationSettings(settings);
    return s.assets.backgroundEnabled && s.assets.strictMatch;
}
