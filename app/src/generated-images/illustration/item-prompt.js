// 物品图提示词：副 LLM 只写物品外观 tag，构图、底色与禁止项由本地模板固定。
// 输出格式与解析复用素材补全的 id/tags/uc 协议（parseAssetPlan），编号用 ch1、ch2…。
import { FICTION_FRAME, TAG_WRITING_RULES, SOFT_MODE_NOTE, MATTE_BACKGROUND_TAGS, TRANSPARENT_BACKGROUND_TAGS, NSFW_NEGATIVE_GUARD } from './prompt-kit.js';
import { parseAssetPlan } from './asset-prompt.js';

const ITEM_TASK = [
    '任务：为「需要生成的物品」清单里的每一项写英文 tag，用于生成单个物品的静物图标。',
    '【输出格式】不要输出 JSON、不要代码块、不要解释。每项按以下字段一行一个输出：',
    'id: 清单里给出的编号（如 ch1），必须原样照抄',
    'tags: 英文正向 tag',
    'uc: 这一项额外不能出现的英文 tag，可留空',
    '【tags 写法】先写物品类型（如 key, sword, potion bottle, letter），再写材质、颜色、形状与显著细节；不要写人、手、背景、文字、构图词。',
    '【通用规则】',
    ...TAG_WRITING_RULES.map((rule, i) => `${i + 1}. ${rule}`),
    `${TAG_WRITING_RULES.length + 1}. 清单里的每一项都必须输出，不要增减项目。`,
];

export const ITEM_PLANNER_SYSTEM_PROMPT = [...FICTION_FRAME, ...ITEM_TASK].join('\n');
export const ITEM_PLANNER_SOFT_SYSTEM_PROMPT = [...FICTION_FRAME, ...ITEM_TASK, '', ...SOFT_MODE_NOTE].join('\n');
const ITEM_BASE_TAGS = 'no humans, still life, item focus, single object, centered';
const ITEM_NEGATIVE_TAGS = 'human, hands, text, watermark, multiple objects, cropped';

export function buildItemPlannerUserPrompt(needs = [], readableText = '') {
    const listed = needs.map((need, i) => `ch${i + 1}｜物品：${need.name}${need.description ? `｜描述：${need.description}` : ''}`);
    return [`【需要生成的物品】\n${listed.join('\n')}`, readableText ? `【本楼正文】\n${readableText}` : '', '请直接按输出格式给出字段。']
        .filter(Boolean).join('\n\n');
}

export function parseItemPlan(text, needs = []) {
    const plan = parseAssetPlan(text, needs);
    return plan.ok ? plan : { ...plan, error: '副 LLM 输出中没有可用的物品字段' };
}

// 副 LLM 失败时只有纯英文物品名可直接当 tag；中文名交给 NAI 效果不可控，记为失败待重试。
export function buildFallbackItemPlan(need) {
    const name = String((need && need.name) || '').trim();
    return /^[ -~]+$/.test(name) ? { need, tags: name.toLowerCase(), uc: '' } : { need, error: '副 LLM 未给出物品 tag' };
}

const joinTags = (...parts) => parts.map((p) => String(p || '').trim().replace(/^,+|,+$/g, '').trim()).filter(Boolean).join(', ');

export function buildItemSlot(tags, { transparent = false, uc = '' } = {}) {
    return {
        scene: joinTags(ITEM_BASE_TAGS, tags, transparent ? TRANSPARENT_BACKGROUND_TAGS : MATTE_BACKGROUND_TAGS),
        sceneUc: joinTags(ITEM_NEGATIVE_TAGS, NSFW_NEGATIVE_GUARD, uc),
        chars: [],
        transparent,
    };
}
