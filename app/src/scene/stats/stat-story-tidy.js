// 整理剧情技能：拼提示词、解析模型回复、过滤建议、把勾选的建议应用到 catalog。全部为纯函数，不接模型、不碰界面。
import { BUILTIN_SKILLS, createSkillRegistry, editStorySkill, mergeStorySkill, validSkillName } from './stat-registry.js';

export const TIDY_TYPES = Object.freeze(['merge-builtin', 'merge-story', 'rename']);

export function builtinSkillNames() {
    return Object.entries(BUILTIN_SKILLS).filter(([, entry]) => entry.kind === 'skill').map(([name]) => name);
}

// rows：[{ name, attribute, value }]，只含剧情技能。
export function buildTidyPrompt(rows, builtins = builtinSkillNames()) {
    const story = rows.map((r) => `${r.name}（${r.attribute || '未定'}，${r.value}）`).join('、');
    return [
        '你是跑团数值整理员。下面是玩家在剧情中积累的「剧情技能」（名称、所属属性、数值），以及内置技能清单。',
        `剧情技能：${story}`,
        `内置技能：${builtins.join('、')}`,
        '找出可以整理的项，只在确实是同一种能力时才建议，不确定就不提。三类：',
        'merge-builtin：剧情技能并入某个内置技能（to 须在内置技能清单内）。',
        'merge-story：几个剧情技能并入其中一个（to 须是上面的剧情技能）。',
        'rename：剧情技能改成更像技能的名字（to 为1到8个字，不与现有技能重名）。',
        '只输出 JSON 数组，每项形如：{"type":"merge-builtin","from":"剧情技能名","to":"目标","reason":"一句话理由"}。from 可以是名称数组。没有建议就输出 []。',
    ].join('\n');
}

function replyText(reply) {
    if (typeof reply === 'string') return reply;
    if (reply && typeof reply === 'object') {
        for (const key of ['text', 'content', 'reply', 'message']) if (typeof reply[key] === 'string') return reply[key];
    }
    return '';
}

// 容错提取：去代码围栏，取第一个能解析的 JSON 数组（也接受 { suggestions: [...] } 之类的包裹对象）。
export function extractTidyArray(reply) {
    const text = replyText(reply).replace(/```(?:json)?/gi, '');
    for (let start = text.indexOf('['); start >= 0; start = text.indexOf('[', start + 1)) {
        for (let end = text.lastIndexOf(']'); end > start; end = text.lastIndexOf(']', end - 1)) {
            try {
                const value = JSON.parse(text.slice(start, end + 1));
                if (Array.isArray(value)) return value;
            } catch (error) { /* 继续缩短 */ }
        }
    }
    const open = text.indexOf('{');
    const close = text.lastIndexOf('}');
    if (open >= 0 && close > open) {
        try {
            const obj = JSON.parse(text.slice(open, close + 1));
            const list = obj && Object.values(obj).find(Array.isArray);
            if (list) return list;
        } catch (error) { /* 无法解析 */ }
    }
    return [];
}

const clean = (v) => String(v ?? '').trim();

// 过滤并展开建议。返回 [{ type, from, to, reason }]，from 为单个剧情技能名。
export function parseTidyReply(reply, catalog) {
    const registry = createSkillRegistry(catalog);
    const storyNames = new Set(registry.story().map((s) => s.name));
    const builtins = new Set(builtinSkillNames());
    const used = new Set();
    const renameTargets = new Set();
    const out = [];
    for (const raw of extractTidyArray(reply)) {
        if (!raw || typeof raw !== 'object' || !TIDY_TYPES.includes(raw.type)) continue;
        const sources = (Array.isArray(raw.from) ? raw.from : [raw.from]).map(clean).filter(Boolean);
        const to = clean(raw.to);
        const reason = clean(raw.reason).slice(0, 60);
        if (!sources.length || !to) continue;
        for (const from of sources) {
            if (!storyNames.has(from) || used.has(from) || from === to) continue;
            if (raw.type === 'merge-builtin' && !builtins.has(to)) continue;
            if (raw.type === 'merge-story' && !storyNames.has(to)) continue;
            if (raw.type === 'rename') {
                const name = validSkillName(to);
                if (!name || name !== to || to.length > 8 || registry.resolve(to) || renameTargets.has(to)) continue;
                renameTargets.add(to);
            }
            used.add(from);
            out.push({ type: raw.type, from, to, reason });
        }
    }
    // 合并目标本身被合走时，链式合并不稳定，一并丢弃。
    return out.filter((item) => item.type !== 'merge-story' || !out.some((o) => o.from === item.to && o !== item));
}

export function tidyLabel(item) {
    return item.type === 'rename' ? `${item.from} 改名为 ${item.to}` : `${item.from} → ${item.to}`;
}

const higherEdit = (a, b) => (Number(a && a.value) >= Number(b && b.value) ? a : b);

// 主角在 catalog 里记的底数、手改值随技能名迁移，两边都有时取高。
function moveHeroValues(catalog, from, to) {
    const base = { ...(catalog.protagonistBase || {}) };
    const edit = { ...(catalog.protagonistEdit || {}) };
    if (Object.hasOwn(base, from)) {
        base[to] = Object.hasOwn(base, to) ? Math.max(Number(base[to]) || 0, Number(base[from]) || 0) : base[from];
        delete base[from];
    }
    if (Object.hasOwn(edit, from)) {
        edit[to] = Object.hasOwn(edit, to) ? higherEdit(edit[to], edit[from]) : edit[from];
        delete edit[from];
    }
    return { ...catalog, protagonistBase: base, protagonistEdit: edit };
}

// 逐条应用，返回 { catalog, applied }。与手动合并 / 改名走同一套 mergeStorySkill、editStorySkill，另迁移主角底数与手改值。
// 内置技能作为合并目标：剧情条目删除，旧名记入 merged（等同该内置技能的别名）。
export function applyTidy(catalog, items) {
    let cur = catalog;
    let applied = 0;
    for (const item of items) {
        const registry = createSkillRegistry(cur);
        if (!registry.story().some((s) => s.name === item.from)) continue;
        if (item.type === 'rename') {
            const next = editStorySkill(cur, item.from, { name: item.to });
            if (!next.story.some((s) => s.name === item.to)) continue;
            cur = moveHeroValues(next, item.from, item.to);
        } else {
            const entry = registry.get(item.to);
            if (!entry || entry.kind !== 'skill') continue;
            if (item.type === 'merge-story' && !registry.story().some((s) => s.name === item.to)) continue;
            const next = mergeStorySkill(cur, item.from, item.to);
            if (next === cur) continue;
            cur = moveHeroValues(next, item.from, item.to);
        }
        applied += 1;
    }
    return { catalog: cur, applied };
}
