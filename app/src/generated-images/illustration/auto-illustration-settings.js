import { NAI_DEFAULT_SETTINGS } from '../request-builders/nai-v4-builder.js';
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

// 模板留空视为恢复内置模板；背景/立绘正向模板必须含 {tags}，否则 LLM 的内容会被丢掉。
function normalizeTemplates(value) {
    const src = value && typeof value === 'object' ? value : {};
    const out = {};
    for (const [key, fallback] of Object.entries(DEFAULT_ASSET_TEMPLATES)) {
        const text = typeof src[key] === 'string' ? src[key].trim() : '';
        const needsTags = key === 'background' || key === 'sprite';
        out[key] = text && (!needsTags || text.includes('{tags}')) ? text : fallback;
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
        nsfwEnabled: bool(src.nsfwEnabled),
        nsfwCount: clampInt(src.nsfwCount, 1, 4, 1),
        interludeEnabled: bool(src.interludeEnabled),
        interludeProbability: clampInt(src.interludeProbability, 0, 100, 30),
        interludeMaxCount: clampInt(src.interludeMaxCount, 1, 4, 1),
        assets: {
            spriteEnabled: bool(assets.spriteEnabled),
            backgroundEnabled: bool(assets.backgroundEnabled),
            strictMatch: bool(assets.strictMatch),
            maxPerFloor: clampInt(assets.maxPerFloor, 1, 4, 2),
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
            negativePrompt: typeof nai.negativePrompt === 'string' ? nai.negativePrompt : NAI_DEFAULT_SETTINGS.negativePrompt,
            timeoutMs: clampInt(nai.timeoutMs, 10000, 300000, NAI_DEFAULT_SETTINGS.timeoutMs),
        },
    };
}

export function isAutoIllustrationEnabled(settings) {
    const s = normalizeAutoIllustrationSettings(settings);
    return s.nsfwEnabled || s.interludeEnabled;
}

export function isAssetGenerationEnabled(settings) {
    const s = normalizeAutoIllustrationSettings(settings);
    return s.assets.spriteEnabled || s.assets.backgroundEnabled;
}

// 精准生图优先只在开启背景生成时生效：没有生成兜底时收紧匹配只会让背景变空。
export function isStrictBackgroundMatch(settings) {
    const s = normalizeAutoIllustrationSettings(settings);
    return s.assets.backgroundEnabled && s.assets.strictMatch;
}
