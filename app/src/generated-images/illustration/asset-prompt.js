// 素材补全（缺失背景 / 无名角色立绘）的 LLM 提示词与 NAI slot 组装。
// 副 LLM 只写「内容」tag（地点陈设、外貌服装）；构图、底色、禁止项走可编辑模板，
// 保证背景图里没有人、立绘始终是单人 3/4 身 + 可抠除的浅灰纯色底。
import {
    FICTION_FRAME, TAG_WRITING_RULES, SOFT_MODE_NOTE, DEFAULT_ASSET_TEMPLATES,
    MATTE_BACKGROUND_TAGS, TRANSPARENT_BACKGROUND_TAGS, NSFW_NEGATIVE_GUARD, applyTemplate,
    buildDictionaryBackgroundTags,
} from './prompt-kit.js';
import { buildCharacterDnaPromptParts, mergePromptTags } from '../../scene/character-dna.js';

const ASSET_TASK = [
    '任务：阅读视觉小说正文，为「需要生成的素材」清单里的每一项写英文 tag。素材分两类：',
    '- 背景：给阅读器当场景背景的空镜头，画面里不能出现任何人物。',
    '- 立绘：单个角色的 3/4 身站立立绘，之后会抠成透明底叠在背景上。',
    '',
    '【输出格式】不要输出 JSON、不要代码块、不要解释。每项按以下字段一行一个输出，多项依次排列：',
    'id: 清单里给出的编号（如 bg1、ch1），必须原样照抄',
    'tags: 英文正向 tag',
    'uc: 这一项额外不能出现的英文 tag，可留空',
    '',
    '【背景 tags 写法】',
    '1. 先写地点类型（如 classroom, abandoned factory, bedroom, shrine, city street），再写建筑风格、年代与文化背景（如 japanese, western, fantasy, modern, cyberpunk）。',
    '2. 写 3～6 个能让人一眼认出地点的陈设或地标（如 desk, chalkboard, window, bookshelf, neon sign, torii）。',
    '3. 按清单给出的时间与天气写光线和氛围：白天 daytime, sunlight；黄昏 sunset, orange sky；夜晚 night, moonlight, dim lighting 或 artificial light；雨 rain, wet ground；雪 snow。',
    '4. 可以写视角（indoors / outdoors, perspective），不要写人、剪影、动物、文字、招牌上的具体字、构图词。',
    '',
    '【立绘 tags 写法】',
    '1. 第一个 tag 写性别与人数：1girl 或 1boy（性别不明时按正文称呼推断）。',
    '2. 再写外观年龄（如 mature female, young man）、体型、发色、发长、发型、瞳色、特征（如 animal ears, glasses, scar）。',
    '3. 写完整服装：上装、下装、外套、配饰，颜色写清楚；正文未交代时，按身份与场景推断合理服装（如女仆 maid outfit，学生 school uniform，骑士 armor）。服装一律写穿着完整的日常状态。',
    '4. 表情写平静或符合其性格的常态表情（如 light smile, expressionless, serious），再写一个轻量的日常小动作（如 hand in pocket, hands behind back, hand on own hip, adjusting hair），不要双手僵直下垂；不要写大幅动作、道具、镜头、背景、底色、其他角色。',
    '',
    '【通用规则】',
    ...TAG_WRITING_RULES.map((rule, i) => `${i + 1}. ${rule}`),
    `${TAG_WRITING_RULES.length + 1}. 清单里的每一项都必须输出，不要增减项目。`,
];

export const ASSET_PLANNER_SYSTEM_PROMPT = [...FICTION_FRAME, ...ASSET_TASK].join('\n');
export const ASSET_PLANNER_SOFT_SYSTEM_PROMPT = [...FICTION_FRAME, ...ASSET_TASK, '', ...SOFT_MODE_NOTE].join('\n');

export function describeAssetNeed(need, index) {
    if (need.type === 'background') {
        const parts = [`场景：${need.name}`];
        if (need.time) parts.push(`时间：${need.time}`);
        if (need.weather) parts.push(`天气：${need.weather}`);
        return { id: `bg${index + 1}`, line: `背景｜${parts.join('｜')}` };
    }
    // DNA 固定的身份与默认外观会由程序在出图前合并，这里只让副 LLM 知道、避免写出冲突 tag。
    const flat = (text) => String(text || '').replace(/\s*\n\s*/g, ' ').trim();
    const dnaNotes = [];
    if (need.dna && flat(need.dna.identity)) dnaNotes.push(`固定身份：${flat(need.dna.identity)}`);
    if (need.dna && flat(need.dna.defaultAppearance)) dnaNotes.push(`默认外观：${flat(need.dna.defaultAppearance)}`);
    return { id: `ch${index + 1}`, line: [`立绘｜角色：${need.name}`, ...dnaNotes].join('｜') };
}

export function buildAssetPlannerUserPrompt({ needs = [], readableText = '', previousText = '' } = {}) {
    const listed = needs.map((need, index) => {
        const { id, line } = describeAssetNeed(need, index);
        return `${id}｜${line}`;
    });
    return [
        `【需要生成的素材】\n${listed.join('\n')}`,
        needs.some((need) => need.type === 'sprite' && need.dna)
            ? '【角色 DNA】标注了固定身份或默认外观的立绘，tags 不得改变这些特征，只补充正文中额外交代的内容。' : '',
        previousText ? `【前文摘要】\n${previousText}` : '',
        `【本楼正文】\n${readableText}`,
        '请直接按输出格式给出字段。',
    ].filter(Boolean).join('\n\n');
}

const FIELD_RE = /^\s*[-*]?\s*(id|tags|uc)\s*[:：]\s*(.*)$/i;

export function parseAssetPlan(text, needs = []) {
    const ids = needs.map((need, index) => describeAssetNeed(need, index).id);
    const byId = new Map();
    const ordered = [];
    let current = null;
    for (const line of String(text || '').replace(/```[a-zA-Z]*\s*/g, '').split(/\r?\n/)) {
        const m = line.match(FIELD_RE);
        if (!m) continue;
        const key = m[1].toLowerCase();
        const value = m[2].trim();
        if (key === 'id') {
            current = { id: value.toLowerCase().replace(/[^a-z0-9]/g, ''), tags: '', uc: '' };
            ordered.push(current);
            if (current.id) byId.set(current.id, current);
            continue;
        }
        if (!current) { current = { id: '', tags: '', uc: '' }; ordered.push(current); }
        if (key === 'tags') current.tags = value;
        else current.uc = value;
    }
    const items = ids.map((id, index) => {
        const hit = byId.get(id) || (ordered[index] && !ids.includes(ordered[index].id) ? ordered[index] : null);
        return hit && hit.tags ? { need: needs[index], tags: hit.tags, uc: hit.uc } : null;
    });
    const usable = items.filter(Boolean);
    return usable.length
        ? { ok: true, items: usable }
        : { ok: false, items: [], error: '副 LLM 输出中没有可用的素材字段' };
}

// LLM 整体失败时的兜底：背景按内置词典拼 tag；立绘不兜底（外貌猜错比没有立绘更糟）。
export function buildDictionaryAssetItems(needs = []) {
    return needs
        .filter((need) => need.type === 'background')
        .map((need) => ({ need, tags: buildDictionaryBackgroundTags(need), uc: '', fromDictionary: true }))
        .filter((item) => item.tags);
}

function joinTags(...parts) {
    return parts.map((p) => String(p || '').trim().replace(/^,+|,+$/g, '').trim()).filter(Boolean).join(', ');
}

// 生成可直接交给 buildNaiV4Request 的 slot；transparent 为 true 时走 V5 原生透明底。
export function buildAssetSlot(item, { transparent = false, templates = {} } = {}) {
    const t = { ...DEFAULT_ASSET_TEMPLATES, ...templates };
    if (item.need.type === 'background') {
        return {
            scene: applyTemplate(t.background, { tags: item.tags }),
            sceneUc: joinTags(t.backgroundNegative, item.uc),
            chars: [],
        };
    }
    // 立绘 DNA 固定顺序：triggerWords → identity → defaultAppearance → 副 LLM tag；无 DNA 时输出与旧版一致。
    const dnaParts = item.need.dna ? buildCharacterDnaPromptParts(item.need.dna, { includeDefaultAppearance: true }) : null;
    const tags = dnaParts && dnaParts.positive ? mergePromptTags(dnaParts.positive, item.tags) : item.tags;
    return {
        scene: applyTemplate(t.sprite, { tags, matte: transparent ? TRANSPARENT_BACKGROUND_TAGS : MATTE_BACKGROUND_TAGS }),
        sceneUc: joinTags(t.spriteNegative, dnaParts ? dnaParts.negative : '', NSFW_NEGATIVE_GUARD, item.uc),
        chars: [],
        transparent,
    };
}
