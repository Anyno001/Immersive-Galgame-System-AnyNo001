import { NAI_DEFAULT_SETTINGS } from '../request-builders/nai-v4-builder.js';

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
        },
        llm: {
            source: llm.source === 'openai' ? 'openai' : 'tavern',
            endpoint: str(llm.endpoint), apiKey: str(llm.apiKey), model: str(llm.model),
            contextFloors: clampInt(llm.contextFloors, 0, 3, 1),
            timeoutMs: clampInt(llm.timeoutMs, 10000, 300000, 90000),
        },
        nai: {
            transport: nai.transport === 'st-proxy' ? 'st-proxy' : 'direct',
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
