// 图像来源不是数据库生图插件时，由副 LLM 代替插件「写提示词」：
// 输入与插件同一份中文画面描述（含 slotid 份数要求），输出 NAI v4 caption，
// 供表情差分、Q 版头像、默认立绘与衣柜服装提示词共用；出图仍按当前图像来源。
import { FICTION_FRAME, SOFT_MODE_NOTE, TAG_WRITING_RULES, requestWithSoftRetry } from './prompt-kit.js';

export const LLM_SETUP_HINT = '请到「生图 → 副 LLM」页接好副 LLM';

const CAPTION_WRITER_RULES = [
    '用户给出一段中文画面要求，你按要求写 NovelAI 生图标签。要求里写了几份（slotid），就按顺序写几份，不要多也不要少。',
    ...TAG_WRITING_RULES,
    '每份分三行：scene 写人数、景别、机位、背景与光线；char 写这一个角色的外貌、服装、表情、动作；uc 写这一份要避开的负面标签，可留空。',
    '画面里没有角色时（例如只画一套衣服），char 留空。',
    '只输出下面的格式，不要解释、不要代码块：',
    '#1',
    'scene: ...',
    'char: ...',
    'uc: ...',
];

export const CAPTION_WRITER_SYSTEM = [...FICTION_FRAME, ...CAPTION_WRITER_RULES].join('\n');
const CAPTION_WRITER_SOFT_SYSTEM = [...FICTION_FRAME, ...CAPTION_WRITER_RULES, ...SOFT_MODE_NOTE].join('\n');

// 沿用酒馆 API 视为已接好；独立 API 要填地址和模型。
export function describeLlmReady(llmSettings = {}) {
    if (llmSettings.source !== 'openai') return { ok: true, error: '' };
    if (!String(llmSettings.endpoint || '').trim() || !String(llmSettings.model || '').trim()) {
        return { ok: false, error: `还没接副 LLM：${LLM_SETUP_HINT}，填好地址和模型，或改成沿用酒馆 API` };
    }
    return { ok: true, error: '' };
}

function side(base, char) {
    return { caption: { base_caption: base, char_captions: char == null ? [] : [{ char_caption: char, centers: [{ x: 0.5, y: 0.5 }] }] } };
}

export function parseCaptionSlots(text) {
    const body = String(text || '').replace(/```[a-z]*\n?|```/gi, '').trim();
    if (!body) return { ok: false };
    const blocks = body.split(/^\s*#\s*(\d+)\s*$/m);
    const pairs = blocks.length > 1
        ? blocks.slice(1).reduce((list, item, index, all) => (index % 2 ? list : [...list, [Number(item), all[index + 1] || '']]), [])
        : [[1, body]];
    const captions = pairs.map(([slotId, block]) => {
        const read = (key) => {
            const m = String(block).match(new RegExp(`^\\s*${key}\\s*[:：]\\s*(.*)$`, 'im'));
            return m ? m[1].trim() : '';
        };
        const scene = read('scene');
        const char = read('char');
        if (!scene && !char) return null;
        const hasChar = Boolean(char);
        return { slotId, caption: { v4_prompt: side(scene, hasChar ? char : null), v4_negative_prompt: side(read('uc'), hasChar ? '' : null) } };
    }).filter(Boolean);
    return captions.length ? { ok: true, captions } : { ok: false };
}

// 返回形状与数据库生图插件的 writeDbgenPrompt 一致：{ ok, caption, captions: [{ slotId, caption }] }。
export async function writeCaptionsWithLlm(llm, llmSettings, description) {
    const ready = describeLlmReady(llmSettings);
    if (!ready.ok) return { ok: false, error: ready.error };
    if (!llm || typeof llm.request !== 'function') return { ok: false, error: `副 LLM 不可用：${LLM_SETUP_HINT}` };
    const user = String(description || '').trim();
    if (!user) return { ok: false, error: '没有可交给副 LLM 的画面描述' };
    const result = await requestWithSoftRetry(llm, {
        system: CAPTION_WRITER_SYSTEM,
        softSystem: CAPTION_WRITER_SOFT_SYSTEM,
        user,
        parse: parseCaptionSlots,
    }, llmSettings);
    if (!result.ok) return { ok: false, error: `副 LLM 写提示词失败：${result.error}` };
    return { ok: true, caption: result.captions[0].caption, captions: result.captions };
}
