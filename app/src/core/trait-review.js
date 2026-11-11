// 特质的副模型评定与触发发送（纯逻辑 + 可注入 IO）。
// 本文件不读 stat-traits.js：登记表 defs 与 applyTraitChange 均由调用方注入，只依赖接口约定：
//   def = { id, name, nsfw, protagonist, judge, aliases?, bundle?, boundOnly? }；applyTraitChange(state, catalog, 名, id, on, src) → { catalog, notices }。
import { parseTables } from '../data/shujuku/table-parser.js';

export const REVIEW_DEFAULT_N = 30;
export const REVIEW_FLOOR_COUNT = 6; // 最近 3 楼 AI + 对应用户楼
export const REVIEW_DIARY_ROWS = 3;
export const REVIEW_MIN_ROWS = 3;
export const REVIEW_MAX_ROWS = 20;
export const INITIAL_MAX_ADD = 3;
export const SUMMARY_TABLE = '纪要表';
export const DIARY_TABLE = '恋爱日记表';

// 本地扫描认的大事件词（事件标签值或正文关键词）。
export const BIG_EVENT_WORDS = Object.freeze(['救命', '舍身', '挡刀', '背叛', '重伤', '害死', '复仇', '和解', '死亡', '失忆', '身份揭穿', '揭穿身份']);

const clean = (v) => String(v ?? '').trim();

// 1. 扫：只看本楼数值标签（已解析的 directives），不调模型。
// opts：{ recentChars: 距上次发送期间被标签点名过的角色（兜底用）, text: 本楼正文（关键词佐证）, protagonist: 主角名 }
export function scanFloorForReview(directives, floorNo, lastSentFloor, N, opts = {}) {
    const list = Array.isArray(directives) ? directives : [];
    const interval = Math.floor(Number(N));
    const protagonist = clean(opts.protagonist) || '主角';
    const hit = new Set();
    const reasons = [];
    const mark = (name, reason) => {
        hit.add(clean(name) || protagonist);
        if (!reasons.includes(reason)) reasons.push(reason);
    };
    for (const d of list) {
        if (!d || typeof d !== 'object') continue;
        if (d.kind === 'stress' && d.value === '上升' && d.strength === '极大') mark(d.target, 'stress-extreme');
        else if (d.kind === 'break') mark(d.target, 'break');
        else if (d.kind === 'romance' && d.value === '结束') mark(d.target, 'romance-end');
        else if (d.kind === 'hurt' && d.value === '重伤') mark(d.target, 'hurt-heavy');
        else if (d.kind === 'event' && BIG_EVENT_WORDS.some((w) => clean(d.value).includes(w))) mark(d.target, 'event');
    }
    // 正文关键词只作佐证，不单独触发，避免闲笔误触。
    if (hit.size > 0 && clean(opts.text) && BIG_EVENT_WORDS.some((w) => String(opts.text).includes(w))) reasons.push('keyword');
    if (hit.size > 0) return { send: true, reason: reasons.join(','), chars: [...hit] };
    if (interval > 0 && Number(floorNo) - Number(lastSentFloor || 0) >= interval) {
        const chars = [...new Set((Array.isArray(opts.recentChars) ? opts.recentChars : []).map(clean).filter(Boolean))];
        return { send: true, reason: 'interval', chars };
    }
    return { send: false, reason: '', chars: [] };
}

// 纪要表行数：N÷3 向上取整，夹在 3–20。
export function summaryRowCount(N) {
    const n = Math.max(0, Math.floor(Number(N) || 0));
    return Math.min(REVIEW_MAX_ROWS, Math.max(REVIEW_MIN_ROWS, Math.ceil(n / 3)));
}

// 把注入的表来源统一成 [{name, columns, rows}]：可为函数、readTables 的 { ok, data }、原始导出对象或已解析数组。
function normalizeTables(source) {
    let value = source;
    try { if (typeof value === 'function') value = value(); } catch (error) { return []; }
    if (!value) return [];
    if (Array.isArray(value)) return value.filter((t) => t && Array.isArray(t.columns) && Array.isArray(t.rows));
    if (typeof value === 'object' && 'ok' in value) return value.ok ? parseTables(value.data) : [];
    return parseTables(value);
}

const colIndex = (table, names) => table.columns.findIndex((c) => names.includes(clean(c).replace(/\s+/g, '')));
const rowText = (table, row) => table.columns
    .map((c, i) => ({ c: clean(c), v: clean(Array.isArray(row) ? row[i] : '') }))
    .filter((x) => x.v && !/^(row_?id|序号)$/i.test(x.c))
    .map((x) => `${x.c}：${x.v}`).join('；');

function summaryRows(tables, N) {
    const table = tables.find((t) => clean(t.name) === SUMMARY_TABLE);
    if (!table) return [];
    const rows = table.rows.map((r) => rowText(table, r)).filter(Boolean);
    return rows.slice(-summaryRowCount(N));
}

function diaryRows(tables, chars) {
    const table = tables.find((t) => clean(t.name) === DIARY_TABLE);
    if (!table) return {};
    const col = colIndex(table, ['角色名', '角色', '姓名', '名字', '人物']);
    if (col < 0) return {};
    const out = {};
    for (const c of chars) {
        const names = [c.name, ...(Array.isArray(c.aliases) ? c.aliases : [])].map(clean).filter(Boolean);
        const hits = table.rows.filter((r) => names.includes(clean(Array.isArray(r) ? r[col] : '')));
        if (hits.length) out[c.name] = hits.slice(-REVIEW_DIARY_ROWS).map((r) => rowText(table, r));
    }
    return out;
}

// 当前已挂特质：优先 chars[i].traits（[{id, src}]），否则读 catalog.traits[名] = {键:{on,src}}。
function currentTraits(char, catalog) {
    if (Array.isArray(char.traits)) return char.traits.map((t) => ({ id: t.id, src: t.src || 'auto' }));
    const own = catalog && catalog.traits && catalog.traits[char.name];
    if (!own || typeof own !== 'object') return [];
    return Object.entries(own).filter(([, v]) => v && v.on).map(([id, v]) => ({ id, src: v.src || 'auto' }));
}

// 2. 发：组装发送内容。
// floors：[{ no, role: 'ai'|'user', text }]（取最后 6 楼）；
// chars：[{ name, aliases?, protagonist?, relation?, summary?, traits?, recent? }]
// 人设字数上限：每个角色自己的资料，与整批共用的世界观资料（只发一份）分开计。
export const REVIEW_PERSONA_MAX = 6000;
export const REVIEW_WORLD_MAX = 30000;
export function buildReviewPayload({ floors, tables, chars, catalog, defs, N, nsfw = false, world = '' } = {}) {
    const byId = new Map((Array.isArray(defs) ? defs : []).map((d) => [d.id, d]));
    const nameOf = (id) => (byId.has(id) ? byId.get(id).name : id);
    const people = (Array.isArray(chars) ? chars : []).filter((c) => c && clean(c.name));
    const tableList = normalizeTables(tables);
    const diary = diaryRows(tableList, people);
    return {
        nsfw: !!nsfw,
        world: clean(world).slice(0, REVIEW_WORLD_MAX),
        floors: (Array.isArray(floors) ? floors : []).filter((f) => f && clean(f.text)).slice(-REVIEW_FLOOR_COUNT)
            .map((f) => ({ no: f.no, role: f.role === 'user' ? 'user' : 'ai', text: clean(f.text) })),
        summary: summaryRows(tableList, N),
        chars: people.map((c) => ({
            name: clean(c.name),
            protagonist: !!c.protagonist,
            relation: clean(c.relation),
            summary: clean(c.summary),
            persona: clean(c.persona).slice(0, REVIEW_PERSONA_MAX),
            note: clean(c.note).slice(0, 200),
            attrs: c.attrs && typeof c.attrs === 'object' ? c.attrs : null,
            traits: currentTraits(c, catalog).map((t) => ({ ...t, name: nameOf(t.id) })),
            statuses: Object.entries((catalog && catalog.statuses && catalog.statuses[c.name]) || {}).map(([name, e]) => ({ name, src: (e && e.src) || 'story' })),
            recent: Array.isArray(c.recent) ? c.recent.map((r) => ({ id: r.id, on: !!r.on, name: nameOf(r.id) })) : [],
            diary: diary[c.name] || [],
        })),
    };
}

// 顺带识别的事件（不新增正文标签）：恩仇类由调用方注入类型表（bond-rules 的 EVENT_TYPES），其余为评定事件。
export const REVIEW_EVENT_TYPES = Object.freeze(['夸奖', '批评', '拒绝', '背叛', '求助', '耳语', '信仰质疑']);
const JSON_SHAPE_BASE = '{"results":[{"name":"角色名","tags":["标签"],"add":["特质名"],"basis":{"特质名":["依据标签"]},"waive":["免掉的捆绑特质名"],"remove":["特质名"],"status":[{"name":"状态名","on":true,"src":"setting或story","toward":"对象名（关系状态才写）"}]}],"events":[{"name":"角色名","type":"事件","dir":"ta或me"}]}';
const shapeOf = (genres) => (genres && genres.length ? JSON_SHAPE_BASE.slice(0, -1) + ',"worlds":["题材"]}' : JSON_SHAPE_BASE);

// 3. 提示词：只列「特质名：评定依据」，不列倍率；NSFW 关时不列 nsfw 项。mode：'initial' | 'story'。
// statusDefs：状态定义表（stat-status-defs 的 STATUS_DEFS，由调用方注入）；给出时附状态名单与 status 字段说明。
export function buildReviewPrompt(payload, defs, mode = 'story', eventTypes = [], statusDefs = null, genres = null) {
    const p = payload || {};
    const JSON_SHAPE = shapeOf(genres);
    const worldLine = genres && genres.length ? `worlds 写世界书与人设体现的世界观题材，只能从这些里选：${genres.join('、')}；没有明确依据就留空。` : '';
    const defList = (Array.isArray(defs) ? defs : []).filter((d) => d && !d.boundOnly && (p.nsfw || !d.nsfw));
    const lines = [];
    lines.push(mode === 'initial'
        ? '任务：为下列角色评定初始特质。可以依据人设与正文概括得出，不要求字面一致；与人设不符的不给，不要凑数。每个角色最多给 3 项。'
        : '任务：复核下列角色的特质是否因近期剧情发生变化。每个角色最多变动 1 项（获得或失去均算），必须有明确的剧情依据才改；没有依据就不改。上次刚变动过的特质这次不能改回。');
    lines.push('', '评定分两步：', '1. 先为每个角色从人设与正文概括 3–8 个标签，涵盖性格、身份、能力、种族，如「强者为尊」「冷酷」「妖族」「龙族」「掌权者」；', '2. 再按这些标签到特质表里挑最贴近的特质，并写明依据的标签。');
    lines.push('', '「用户注明」由用户亲自填写，优先级高于人设与正文推断：与用户注明相反的特质不给。');
    lines.push('', '可选特质（只能从下表选择，表外一律不要输出）：');
    const reqText = (d) => (d.req ? `（需 ${Object.entries(d.req).map(([k, v]) => `${k} ≥${v}`).join('、')}）` : '');
    const bundleText = (d) => (d.bundle ? `；挂上时附带「${d.bundle.name}」${d.bundle.waivable ? '' : '（不可免除）'}` : '');
    // 按分组列出，近义项排在一起便于比较。
    const groups = new Map();
    for (const d of defList) { const g = clean(d.group) || '其他'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(d); }
    for (const [g, list] of groups) {
        lines.push(`〔${g}〕`);
        for (const d of list) lines.push(`- ${d.name}：${clean(d.judge)}${reqText(d)}${bundleText(d)}`);
    }
    lines.push('', '意思相近的特质只取最贴近的一项，不要同时给；拿不准就不给。只凭名字相似不算依据，必须符合冒号后的判定标准。');
    if (defList.some((d) => d.bundle && d.bundle.waivable)) lines.push('', '附带特质与人设或用户注明的性格相反时，可在 waive 里写上该附带特质名免掉；标为不可免除的不能免掉。');
    const statusList = Array.isArray(statusDefs) ? statusDefs.filter((d) => d && d.name) : [];
    if (statusList.length) {
        lines.push('', '可选状态（只能从下表选择）：');
        for (const d of statusList) lines.push(`- ${d.name}${d.relation ? '（关系状态，需写 toward）' : ''}：${clean(d.desc)}`);
        lines.push('状态写在 status 里：on 为 true 表示正在经历，false 表示已经结束；src 写 setting 表示人设或开场设定里本来就有，写 story 表示由近期剧情产生；没有明确依据不写。');
    }
    if (p.world) lines.push('', '世界观与背景资料（各角色共用；其中写到某个角色的内容也算该角色的人设）：', p.world);
    for (const c of p.chars || []) {
        lines.push('', `【角色：${c.name}${c.protagonist ? '（主角）' : ''}】`);
        if (c.note) lines.push(`用户注明：${c.note}`);
        if (c.persona) lines.push(`人设：${c.persona}`);
        if (c.attrs) lines.push(`六维（3–18，10 为普通）：${Object.entries(c.attrs).map(([k, v]) => `${k}${Math.round(v)}`).join('、')}`);
        if (c.relation) lines.push(`关系状态：${c.relation}`);
        if (c.summary) lines.push(`近期数值：${c.summary}`);
        lines.push(`当前特质：${c.traits.length ? c.traits.map((t) => t.name).join('、') : '无'}`);
        if ((c.statuses || []).length) lines.push(`当前状态：${c.statuses.map((s) => s.name).join('、')}`);
        if (c.recent.length) lines.push(`上次刚变动：${c.recent.map((r) => `${r.on ? '获得' : '失去'}「${r.name}」`).join('、')}`);
        if (c.diary.length) { lines.push('恋爱日记（最近）：'); c.diary.forEach((r) => lines.push(`  ${r}`)); }
    }
    if ((p.summary || []).length) { lines.push('', '剧情纪要（由旧到新）：'); p.summary.forEach((r, i) => lines.push(`${i + 1}. ${r}`)); }
    if ((p.floors || []).length) {
        lines.push('', '最近正文：');
        p.floors.forEach((f) => lines.push(`【${f.role === 'user' ? '用户' : 'AI'}${f.no != null ? ` 第${f.no}楼` : ''}】${f.text}`));
    }
    if (mode === 'initial') {
        lines.push('', `只输出一段 JSON，不要任何解释或代码块标记，格式：${JSON_SHAPE}`, '每个角色都写 tags；没有合适特质时 add 留空；不写 remove，events 留空；特质名必须与上表完全一致。', ...(worldLine ? [worldLine] : []));
        return lines.join('\n');
    }
    const kinds = [...(Array.isArray(eventTypes) ? eventTypes : []), ...REVIEW_EVENT_TYPES];
    lines.push('', `另外，最近正文里若有明确发生的下列事件，在 events 里记一条（name 为受事角色，dir 写 ta 表示主角对 TA、me 表示 TA 对主角，可省）：${kinds.join('、')}。没有就留空。`);
    lines.push('', `只输出一段 JSON，不要任何解释或代码块标记，格式：${JSON_SHAPE}`, '没有变化的角色可以省略；add 为获得、remove 为失去；特质名必须与上表完全一致。', ...(worldLine ? [worldLine] : []));
    return lines.join('\n');
}

// 取第一段配平的 JSON 对象或数组。
function extractJson(text) {
    const s = String(text ?? '').replace(/```(?:json)?/gi, '');
    for (let start = 0; start < s.length; start += 1) {
        const open = s[start];
        if (open !== '{' && open !== '[') continue;
        const close = open === '{' ? '}' : ']';
        let depth = 0;
        let inStr = false;
        for (let i = start; i < s.length; i += 1) {
            const ch = s[i];
            if (inStr) { if (ch === '\\') i += 1; else if (ch === '"') inStr = false; continue; }
            if (ch === '"') inStr = true;
            else if (ch === open) depth += 1;
            else if (ch === close) {
                depth -= 1;
                if (depth === 0) { try { return JSON.parse(s.slice(start, i + 1)); } catch (error) { break; } }
            }
        }
    }
    return null;
}

// 特质名归一化：去掉括号内容、冒号后的说明、首尾标点与引号。
export const normalizeTraitWord = (v) => clean(v)
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .replace(/[:：].*$/, '')
    .replace(/^[\s「」『』“”"'‘’《》·、，,。.;；!！?？*#-]+|[\s「」『』“”"'‘’《》·、，,。.;；!！?？*#-]+$/g, '')
    .trim();

// 4. 解析：返回 [{ charName, id, on, waive? }]；丢弃表外项并去重。特质写显示名、id 或旧名均认，先归一化再匹配。
// opts.chars：给出时只收这些角色；opts.dropped：给出数组时收下对不上的原词；opts.tags：给出对象时收下各角色的标签与依据（只进诊断）。
export function parseReviewReply(text, defs, opts = {}) {
    const lookup = new Map();
    for (const d of Array.isArray(defs) ? defs : []) {
        for (const w of [d.name, d.id, ...(Array.isArray(d.aliases) ? d.aliases : [])]) if (clean(w)) lookup.set(clean(w), d.id);
    }
    const find = (item) => lookup.get(clean(item)) || lookup.get(normalizeTraitWord(item));
    const dropped = Array.isArray(opts.dropped) ? opts.dropped : null;
    const allowed = Array.isArray(opts.chars) && opts.chars.length ? new Set(opts.chars.map(clean)) : null;
    const root = extractJson(text);
    const entries = Array.isArray(root) ? root : root && Array.isArray(root.results) ? root.results : root && typeof root === 'object' ? [root] : [];
    const out = [];
    const seen = new Set();
    for (const e of entries) {
        if (!e || typeof e !== 'object') continue;
        const charName = clean(e.name ?? e.charName ?? e.character);
        if (!charName || (allowed && !allowed.has(charName))) continue;
        if (opts.tags && typeof opts.tags === 'object') opts.tags[charName] = { tags: Array.isArray(e.tags) ? e.tags.map(clean).filter(Boolean).slice(0, 8) : [], basis: e.basis && typeof e.basis === 'object' ? e.basis : null };
        const waive = (Array.isArray(e.waive) ? e.waive : e.waive ? [e.waive] : []).map(find).filter(Boolean);
        for (const [field, on] of [['add', true], ['remove', false]]) {
            const raw = e[field];
            const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
            for (const item of items) {
                const id = find(item);
                if (!id) { if (dropped && clean(item)) dropped.push({ charName, word: clean(item) }); continue; }
                const key = `${charName}|${id}`;
                if (seen.has(key)) continue;
                seen.add(key);
                out.push(on && waive.length ? { charName, id, on, waive } : { charName, id, on });
            }
        }
    }
    return out;
}

// 状态评定结果（与特质分开）：返回 [{ charName, status, on, src: 'setting'|'story', toward? }]；
// 状态名须在 statusDefs 里，关系状态缺 toward 丢弃；src 认不出按 story。
// 世界观题材（E5）：取回复里的 worlds，只留 allowed 里的值，去重；没有返回 null（不覆盖已有判定）。
export function parseReviewWorlds(text, allowed) {
    const root = extractJson(text);
    const raw = root && !Array.isArray(root) && typeof root === 'object' ? root.worlds : null;
    if (!Array.isArray(raw)) return null;
    const ok = new Set(Array.isArray(allowed) ? allowed : []);
    return [...new Set(raw.map(clean).filter((w) => ok.has(w)))];
}

export function parseReviewStatuses(text, statusDefs, opts = {}) {
    const defs = new Map((Array.isArray(statusDefs) ? statusDefs : []).map((d) => [d.name, d]));
    const allowed = Array.isArray(opts.chars) && opts.chars.length ? new Set(opts.chars.map(clean)) : null;
    const root = extractJson(text);
    const entries = Array.isArray(root) ? root : root && Array.isArray(root.results) ? root.results : root && typeof root === 'object' ? [root] : [];
    const out = [];
    const seen = new Set();
    for (const e of entries) {
        if (!e || typeof e !== 'object') continue;
        const charName = clean(e.name ?? e.charName ?? e.character);
        if (!charName || (allowed && !allowed.has(charName))) continue;
        const list = Array.isArray(e.status) ? e.status : e.status ? [e.status] : [];
        for (const item of list) {
            if (!item || typeof item !== 'object') continue;
            const def = defs.get(normalizeTraitWord(item.name));
            if (!def) continue;
            const toward = clean(item.toward);
            if (def.relation && !toward) continue;
            const key = `${charName}|${def.name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ charName, status: def.name, on: item.on !== false, src: item.src === 'setting' ? 'setting' : 'story', ...(def.relation ? { toward } : {}) });
        }
    }
    return out;
}

// 应用状态评定：逐项调注入的 applyStatusChange(cat, 名, 键, opts) → { catalog, changes, reason? }。
// setting 只升不降：已是 setting（或手动）来源的状态，story 来源的评定不能摘下它；挂上时来源由 applyStatusChange 只升不降。
// opts：{ day, floor, rank（来源等级表，缺省 story 0 / setting 2 / manual 3） }
export function applyReviewStatuses(results, cat, applyStatusChange, opts = {}) {
    const rank = opts.rank || { story: 0, system: 1, cycle: 1, setting: 2, manual: 3 };
    let next = cat;
    const changes = [];
    const applied = [];
    const skipped = [];
    for (const r of Array.isArray(results) ? results : []) {
        const own = next && next.statuses && next.statuses[r.charName] && next.statuses[r.charName][r.status];
        if (!r.on && own && (rank[own.src] ?? 0) > (rank[r.src] ?? 0)) { skipped.push({ ...r, why: 'src-higher' }); continue; }
        const res = applyStatusChange(next, r.charName, r.status, { on: r.on, src: r.src, toward: r.toward, day: opts.day, floor: opts.floor });
        if (!res || !res.catalog || res.reason) { skipped.push({ ...r, why: (res && res.reason) || 'apply-failed' }); continue; }
        next = res.catalog;
        changes.push(...res.changes);
        applied.push(r);
    }
    return { catalog: next, changes, applied, skipped };
}

// 初始评定记为已评的角色：人设非空，或本批有结果；人设为空且零结果的下次自动重评。persona 为 Map(名 → 人设)。
export const judgedNames = (batch, persona, results) => batch.filter((n) => (persona.get(n) || '') || results.some((r) => r.charName === n));

// 5. 应用：逐项调注入的 applyTraitChange。
// opts：{ state, mode: 'initial'|'story', day（当天标识）, changeLog（{ "名|id": day }，不原地改，返回新的）,
//         recent（{ 名: [{id,on}] } 上次刚变的）, maxPerChar }
// initial：src='auto'，每人最多挂 3 项，不覆盖 manual 的项；story：src='story'，每人最多变 1 项，可覆盖 manual。
export function applyReview(results, catalog, applyTraitChange, opts = {}) {
    const mode = opts.mode === 'initial' ? 'initial' : 'story';
    const src = mode === 'initial' ? 'auto' : 'story';
    const cap = Number.isFinite(opts.maxPerChar) ? opts.maxPerChar : mode === 'initial' ? INITIAL_MAX_ADD : 1;
    const changeLog = { ...(opts.changeLog || {}) };
    const recent = opts.recent || {};
    const counts = {};
    const notices = [];
    const applied = [];
    const skipped = [];
    let cat = catalog;
    for (const r of Array.isArray(results) ? results : []) {
        const own = cat && cat.traits && cat.traits[r.charName] && cat.traits[r.charName][r.id];
        const skip = (why) => skipped.push({ ...r, why });
        if (mode === 'initial' && !r.on) { skip('initial-no-remove'); continue; }
        if (mode === 'initial' && own && own.src === 'manual') { skip('manual'); continue; }
        if (!!(own && own.on) === !!r.on) { skip('no-change'); continue; }
        if ((recent[r.charName] || []).some((x) => x.id === r.id && !!x.on !== !!r.on)) { skip('just-changed'); continue; }
        const key = `${r.charName}|${r.id}`;
        if (opts.day != null && changeLog[key] === opts.day) { skip('daily-limit'); continue; }
        if ((counts[r.charName] || 0) >= cap) { skip('cap'); continue; }
        const res = applyTraitChange(opts.state, cat, r.charName, r.id, !!r.on, src, undefined, r.waive ? { waive: r.waive } : {});
        if (!res || !res.catalog) { skip('apply-failed'); continue; }
        if (res.reason) { skip(res.reason); continue; }
        if (res.waiveDropped) skipped.push({ ...r, why: 'waive-dropped', waive: res.waiveDropped });
        cat = res.catalog;
        counts[r.charName] = (counts[r.charName] || 0) + 1;
        if (opts.day != null) changeLog[key] = opts.day;
        applied.push(r);
        if (Array.isArray(res.notices)) notices.push(...res.notices);
    }
    return { catalog: cat, notices, applied, skipped, changeLog };
}

// 节流记录落盘：存在 catalog.counters（只收数字、键长 ≤ 24、最多 40 项）。
// 「每日一次」：rl:哈希(名|id) = 当天；「上次刚变动」：rr:哈希(名) = (id 在 ids 里的序号 + 1) × 2 + (获得 1 / 失去 0)，每人一条。
const MEMORY_RECENT_MAX = 10;
const hashOf = (text) => { let h = 5381; for (const ch of String(text)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return h.toString(36); };

// 读出本次要用的节流记录：results 用于还原每日一次的 changeLog，names 用于还原 recent。
export function reviewMemoryOf(counters, results, names, ids, day) {
    const c = counters || {};
    const changeLog = {};
    for (const r of Array.isArray(results) ? results : []) if (c[`rl:${hashOf(`${r.charName}|${r.id}`)}`] === day) changeLog[`${r.charName}|${r.id}`] = day;
    const recent = {};
    for (const name of names) {
        const v = Number(c[`rr:${hashOf(name)}`]);
        const id = v >= 2 ? ids[(v >> 1) - 1] : null;
        if (id) recent[name] = [{ id, on: (v & 1) === 1 }];
    }
    return { changeLog, recent };
}

// 写回：每日记录只留当天的；recent 每人只留最近一次，总数超过上限时丢最旧的。返回新 counters。
export function reviewMemoryWrite(counters, applied, ids, day) {
    const next = {};
    for (const [k, v] of Object.entries(counters || {})) if (!(k.startsWith('rl:') && v !== day)) next[k] = v;
    for (const r of applied) {
        next[`rl:${hashOf(`${r.charName}|${r.id}`)}`] = day;
        const at = ids.indexOf(r.id);
        if (at < 0) continue;
        const key = `rr:${hashOf(r.charName)}`;
        delete next[key];
        next[key] = (at + 1) * 2 + (r.on ? 1 : 0);
    }
    const recentKeys = Object.keys(next).filter((k) => k.startsWith('rr:'));
    for (const k of recentKeys.slice(0, Math.max(0, recentKeys.length - MEMORY_RECENT_MAX))) delete next[k];
    return next;
}

// 6. 事件：解析 events。bondTypes 为恩仇规则的 EVENT_TYPES；返回 { bond: [{ type, target, who, dir }], review: [{ type, name, dir }] }。
// 丢弃表外类型与不在 opts.chars 里的角色，同角色同类型去重。
export function parseReviewEvents(text, opts = {}) {
    const bondTypes = new Set(Array.isArray(opts.bondTypes) ? opts.bondTypes : []);
    const allowed = Array.isArray(opts.chars) && opts.chars.length ? new Set(opts.chars.map(clean)) : null;
    const root = extractJson(text);
    const list = root && typeof root === 'object' && Array.isArray(root.events) ? root.events : [];
    const bond = [];
    const review = [];
    const seen = new Set();
    for (const e of list) {
        if (!e || typeof e !== 'object') continue;
        const name = clean(e.name ?? e.target ?? e.who);
        const type = clean(e.type);
        if (!name || (allowed && !allowed.has(name))) continue;
        const dir = clean(e.dir) === 'me' ? 'me' : 'ta';
        const key = `${name}|${type}`;
        if (seen.has(key)) continue;
        if (bondTypes.has(type)) { seen.add(key); bond.push({ type, target: name, who: name, dir }); }
        else if (REVIEW_EVENT_TYPES.includes(type)) { seen.add(key); review.push({ type, name, dir }); }
    }
    return { bond, review };
}
