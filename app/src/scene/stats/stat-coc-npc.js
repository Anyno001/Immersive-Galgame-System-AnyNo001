// NPC 调查员档（CoC 第七版）：AI 按角色资料生成，或从模组文本里提取；两条路共用一种输出与同一个解析器。
// 只收白名单技能与夹在 1–99 的数字；缺的属性补 50 并记下，不写半份数据。
import { COC_ATTRS, COC_OCCUPATIONS, ATTR_ALIAS, cocSkillBase, normSkillName, sanitizeCocSheet } from './coc-investigator.js';
import { extractJson, SHEET_BATCH_MAX } from './stat-sheets.js';

export const NPC_COC_BATCH_MAX = SHEET_BATCH_MAX;
const DEFAULT_ATTR = 50;
const OCC_NAME_MAX = 12;
const bare = (name) => String(name || '').replace(/[(（][^)）]*[)）]/g, '').trim();
const OCC_BY_NAME = new Map();
const OCC_BY_BARE = new Map();
for (const occ of COC_OCCUPATIONS) {
    OCC_BY_NAME.set(occ.name, occ);
    if (!OCC_BY_BARE.has(bare(occ.name))) OCC_BY_BARE.set(bare(occ.name), occ);
}

export const matchCocOccupation = (text) => OCC_BY_NAME.get(String(text || '').trim()) || OCC_BY_BARE.get(bare(text)) || null;

const FORMAT_LINES = [
    '{"<角色名>":{"属性":{"力量":0,"体质":0,"体型":0,"敏捷":0,"外貌":0,"智力":0,"意志":0,"教育":0},"幸运":0,"理智":0,"职业":"<职业名>","技能":{"<技能名>":0}}}',
    '- 数值一律按 CoC 第七版百分制，范围 1–99；普通成年人各项属性约 50，不要把 3–18 的旧版数值直接填入',
    '- 理智默认等于意志；幸运普通约 50',
    '- 技能写 6–10 项最能体现这个人的，只写技能名与数字',
];

export function buildNpcCocRequest(people, { occupations = null, worldview = '', history = '', settings = '' } = {}) {
    const batch = (people || []).slice(0, NPC_COC_BATCH_MAX);
    const names = batch.map((p) => p.name);
    const occNames = (occupations || COC_OCCUPATIONS).map((o) => (typeof o === 'string' ? o : o.name));
    const list = batch.map((p) => `【${p.name}】${String((p && (p.own ?? p.summary)) || '').trim() || '（没有资料，按普通人处理）'}`);
    const settingText = [...new Set([String(settings).trim(), ...batch.map((p) => String(p?.world || '').trim())].filter(Boolean))].join('\n\n');
    return {
        system: '你是克苏鲁的呼唤（CoC 第七版）的守秘人，为角色编写调查员数值：属性、幸运、理智、职业与关键技能，数值要符合角色的设定与经历，不夸大。',
        user: [
            `世界观：${worldview || '现代'}`,
            settingText ? `世界观及角色设定：\n${settingText}` : '',
            `角色资料：\n${list.join('\n\n')}`,
            `职业优先从下列名单中选，名单里没有合适的可以自由填写（不超过 ${OCC_NAME_MAX} 个字）：\n${occNames.join('、')}`,
            String(history).trim() ? `历史上下文（仅供判断，不要续写）：\n${String(history).trim()}` : '',
            ['【输出要求】', `只输出一个 JSON 对象，不要代码块、解释或其他文字。顶层键是角色名，必须与下列名字一字不差，每人都要有：${names.join('、')}`, ...FORMAT_LINES].join('\n'),
        ].filter(Boolean).join('\n\n'),
    };
}

export function buildNpcCocModuleRequest(text) {
    return {
        system: '你是跑团模组的整理员。从给定的模组文本里提取每一个带数值的 NPC 与敌对角色，原样抄录文本里写明的数字，绝不编造或推算没有写的数值；没有任何数值的人物不要输出。',
        user: [
            `模组文本：\n${String(text || '').trim()}`,
            ['【输出要求】', '只输出一个 JSON 对象，不要代码块、解释或其他文字。顶层键是角色名（取文本里的写法）。', ...FORMAT_LINES.slice(0, 1),
                '- 文本里写了什么就填什么：没有写的属性、幸运、理智、职业、技能直接省略该键，不要补数',
                '- 技能名保持文本里的写法，只写技能名与数字'].join('\n'),
        ].join('\n\n'),
    };
}

const num = (v) => {
    const n = Math.round(Number(typeof v === 'string' ? v.trim() : v));
    return Number.isFinite(n) && n > 0 ? Math.min(99, n) : null;
};

function parseOne(raw, source, at) {
    const given = raw.属性 && typeof raw.属性 === 'object' ? raw.属性 : (raw.attrs && typeof raw.attrs === 'object' ? raw.attrs : {});
    const attrs = {};
    for (const [k, v] of Object.entries(given)) {
        const key = ATTR_ALIAS[String(k).trim().toLowerCase()];
        const n = num(v);
        if (key && n !== null) attrs[key] = n;
    }
    const skills = {};
    for (const [k, v] of Object.entries(raw.技能 && typeof raw.技能 === 'object' && !Array.isArray(raw.技能) ? raw.技能 : {})) {
        const name = normSkillName(k);
        const n = num(v);
        if (name && n !== null && cocSkillBase(name, {}) !== null) skills[name] = n;
    }
    const luck = num(raw.幸运 ?? raw.luck);
    const san = num(raw.理智 ?? raw.san);
    if (!Object.keys(attrs).length && !Object.keys(skills).length && luck === null && san === null) return null;
    const filled = COC_ATTRS.filter((k) => attrs[k] === undefined);
    for (const k of filled) attrs[k] = DEFAULT_ATTR;
    const occText = String(raw.职业 ?? raw.occupation ?? '').trim();
    const occ = matchCocOccupation(occText);
    const sheet = sanitizeCocSheet({
        v: 1, attrs, luck: luck ?? DEFAULT_ATTR, san: san ?? attrs.意志, occupation: occ ? occ.name : occText.slice(0, OCC_NAME_MAX),
        occId: occ ? occ.id : undefined, occFormula: occ ? occ.f : undefined, source, totals: skills, at,
    }, { npc: true });
    return sheet ? { sheet, filled } : null;
}

// 返回 { ok, sheets: { 名: 档 }, filled: { 名: [补了默认值的属性] }, skipped: [{ name, reason }] }。
// names 给定时只收名单内角色（AI 生成）；不给时收回复里的全部人物（模组提取）。
export function parseNpcCocReply(reply, { names = null, source = 'ai', at = 0 } = {}) {
    const obj = extractJson(reply);
    const skipped = [];
    if (!obj) return { ok: false, reason: 'coc-npc-invalid', sheets: {}, filled: {}, skipped };
    const sheets = {};
    const filled = {};
    const keys = names ? names : Object.keys(obj);
    for (const name of keys) {
        const raw = obj[name];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { skipped.push({ name, reason: 'missing' }); continue; }
        if (!name || name.length > 20) { skipped.push({ name, reason: 'name' }); continue; }
        const one = parseOne(raw, source, at);
        if (!one) { skipped.push({ name, reason: 'no-numbers' }); continue; }
        sheets[name] = one.sheet;
        filled[name] = one.filled;
    }
    if (!Object.keys(sheets).length) return { ok: false, reason: 'coc-npc-empty', sheets, filled, skipped };
    return { ok: true, sheets, filled, skipped };
}
