// 设置页「存档」区的数据（§10）：当前数值与变动记录。纯函数，只读账本。
// 变动记录取自当前生效的各楼快照（active swipe），切换 swipe、删楼后自动一致，不依赖单独维护的日志。
import { stageOf } from './stat-favor.js';
import { currentStatsState, ledgerKey } from './stat-ledger.js';
import { PROTAGONIST, heroBonusOf, profileOf } from './stat-engine.js';
import { backfillHeroSlots, slotValue } from './stat-build.js';
import { walletBalance } from './stat-bars.js';
import { BASE_ATTRIBUTES } from './stat-state.js';
import { BAR_LABEL } from './stat-metrics.js';

// 主角战斗生命（{hp, maxHp, down}）；引擎没有读取器或没有数据时为 null。
function vitalsOf(engine) {
    if (!engine || typeof engine.readVitals !== 'function') return null;
    let vitals = null;
    try { vitals = engine.readVitals(engine.userName || PROTAGONIST); } catch (error) { vitals = null; }
    return vitals && Number(vitals.maxHp) > 0 ? vitals : null;
}

export const ARCHIVE_LOG_MAX = 30;

export const CHECK_LOG_MAX = 50;

// 技能显示（v2 §9.3）：CoC 显示百分值；D&D 显示属性值 / 修正与熟练标记。
export function displaySkill(engine, profile) {
    if (!engine || engine.ruleset.ID !== 'dnd5e') return String(Math.round(Number(profile.value) || 0));
    const r = engine.ruleset;
    if (profile.kind === 'attribute') {
        const m = r.modOf(profile.value);
        return `${r.scoreOf(profile.value)}（${m >= 0 ? '+' : ''}${m}）`;
    }
    // 技能显示检定加值，后面附档位（与「编辑技能」同一套档位词）和所属属性，只看「+4」读不出来历。
    const bonus = r.bonusOf(profile);
    const tier = skillTierOf(profile);
    const attribute = profile.entry && profile.entry.attribute;
    const note = [tier, attribute].filter(Boolean).join('·');
    return `${bonus >= 0 ? '+' : ''}${bonus}${note ? `（${note}）` : ''}`;
}

// 技能百分值 → 档位词（SKILL_TIERS：入门 25、熟练 50、精通 75、大师 90）；未学返回空串。
export function skillTierOf(profile) {
    if (!profile.learned) return '';
    const v = Number(profile.value) || 0;
    return v >= 90 ? '大师' : v >= 75 ? '精通' : v >= 50 ? '熟练' : v >= 25 ? '入门' : '';
}

// 熟练度档位（与 skillTierOf 同一套阈值）：未学 < 入门 < 熟练 < 精通 < 大师。
export const SKILL_TIER_ORDER = Object.freeze(['未学', '入门', '熟练', '精通', '大师']);
export const tierWordOfValue = (v) => { const n = Number(v) || 0; return n >= 90 ? '大师' : n >= 75 ? '精通' : n >= 50 ? '熟练' : n >= 25 ? '入门' : '未学'; };

// 主角 3+5 八格各占的技能：catalog.heroSlots 有就用（名字过一遍注册表），没有（旧存档）按已学的非剧情技能回填。
// 回填：值从高到低，值 ≥ 擅长起步值的进擅长格，其余进比较擅长格，填不下的不占格（数值保留）。
export function resolveHeroSlots(engine, state, catalog) {
    if (!engine) return {};
    const cat = catalog || {};
    if (cat.heroSlots && typeof cat.heroSlots === 'object') {
        const out = {};
        for (const [slot, name] of Object.entries(cat.heroSlots)) { const got = engine.registry.resolve(name); if (got) out[slot] = got; }
        return out;
    }
    const story = new Set((cat.story || []).map((s) => s.name));
    const owned = (state.protagonist && state.protagonist.skills) || {};
    const names = [...new Set([...Object.keys(owned), ...Object.keys(engine.protagonistBase || {}), ...Object.keys(engine.protagonistEdit || {})])]
        .filter((name) => !BASE_ATTRIBUTES.includes(name) && name !== '理智' && !story.has(name));
    const entries = names.map((name) => {
        const p = profileOf(engine, state, PROTAGONIST, name);
        return p.entry && p.entry.kind === 'skill' && p.learned ? [name, Math.round(Number(p.value) || 0)] : null;
    }).filter((x) => x && x[1] >= 25);
    return backfillHeroSlots(entries);
}

// 熟练度封顶（内置与自定义技能；剧情技能且不占格的不限）：封顶档 = 不含手改的自然值（账本值或 3+5 起步值）所在档位。
// 占格的技能至少按该格起步值算；既没有账本值、底数、手改，也不占格的技能封顶为未学（不能凭空升到已学）。
// 返回 { capped, rank, tier }；比较时含随身系统加成，与下拉里显示的生效值同一口径。
export function heroSkillCap(engine, state, catalog, skill, slots = null) {
    const cat = catalog || {};
    const slotMap = slots || resolveHeroSlots(engine, state, cat);
    const slotName = Object.keys(slotMap).find((key) => slotMap[key] === skill);
    if (!slotName && (cat.story || []).some((s) => s.name === skill)) return { capped: false, rank: 4, tier: '' };
    const owned = state.protagonist && state.protagonist.skills && state.protagonist.skills[skill];
    const known = Boolean(owned) || Object.hasOwn(engine.protagonistBase || {}, skill) || Object.hasOwn(engine.protagonistEdit || {}, skill);
    let natural = 0;
    if (known || slotName) {
        const p = profileOf(engine, state, PROTAGONIST, skill);
        natural = Math.max(Number(p.seed) || 0, slotName ? slotValue(slotName) : 0);
        natural += heroBonusOf(engine, skill);
    }
    const tier = tierWordOfValue(natural);
    return { capped: true, rank: SKILL_TIER_ORDER.indexOf(tier), tier };
}

// CoC 主角技能全表（设置页「我的角色」）：可分配技能与账本里已有的技能；value 为生效值，learned 为已有账本值、分配底数或手改。
function heroSkillRows(engine, state, names) {
    if (!engine || engine.ruleset.ID !== 'coc7') return [];
    const owned = (state.protagonist && state.protagonist.skills) || {};
    const edits = engine.protagonistEdit || {};
    return [...new Set([...names, ...Object.keys(owned)])].filter((name) => !BASE_ATTRIBUTES.includes(name) && name !== '理智').map((name) => {
        const p = profileOf(engine, state, PROTAGONIST, name);
        return { name, attribute: (p.entry && p.entry.attribute) || '', value: Math.round(Number(p.value) || 0), learned: Boolean(p.learned), edited: Object.hasOwn(edits, name) };
    });
}

// 「编辑技能」折叠的全部技能（两种骰子通用）：可分配技能、账本里已有的、底数与手改、剧情技能。
// tier 为档位词（未学 / 入门 / 熟练 / 精通 / 大师），value 为生效百分值，story 标出剧情中出现的技能（可改名、合并）。
function skillEditRows(engine, state, names, catalog, slots = null) {
    if (!engine) return [];
    const owned = (state.protagonist && state.protagonist.skills) || {};
    const story = new Set(((catalog && catalog.story) || []).map((s) => s.name));
    const all = [...new Set([...names, ...Object.keys(owned), ...Object.keys(engine.protagonistBase || {}), ...Object.keys(engine.protagonistEdit || {}), ...story])];
    return all.filter((name) => !BASE_ATTRIBUTES.includes(name) && name !== '理智').map((name) => {
        const p = profileOf(engine, state, PROTAGONIST, name);
        if (!p.entry || p.entry.kind !== 'skill') return null;
        const value = Math.round(Number(p.value) || 0);
        const cap = heroSkillCap(engine, state, catalog, name, slots);
        return { name, attribute: p.entry.attribute || '', tier: skillTierOf(p) || '未学', value, display: displaySkill(engine, p), story: story.has(name), capTier: cap.capped ? cap.tier : '' };
    }).filter(Boolean);
}

// 变动记录按角色分组：主角一组排最前，其余按最近一次变动先后。
function groupLogRows(rows, logMax) {
    const groups = new Map();
    for (const r of rows) {
        const g = groups.get(r.target) || { name: r.target, hero: r.hero, rows: [] };
        g.rows.push(r);
        groups.set(r.target, g);
    }
    const lastIndex = (g) => rows.lastIndexOf(g.rows[g.rows.length - 1]);
    return [...groups.values()]
        .sort((a, b) => (Number(b.hero) - Number(a.hero)) || (lastIndex(b) - lastIndex(a)))
        .map((g) => ({ name: g.name, hero: g.hero, total: g.rows.length, log: g.rows.slice(-logMax).reverse() }));
}

export function statsArchiveModel(ledger, { logMax = ARCHIVE_LOG_MAX, catalog = null, engine = null, hasBackup = false, walletExtra = 0, heroSkills = [], isHero = null, heroName = '' } = {}) {
    if (!ledger) return null;
    const state = currentStatsState(ledger);
    const rows = [];
    const checks = [];
    // 主角的变动统一显示为「名字（主角）」；拿不到名字时只写「主角」。
    const heroLabel = heroName && heroName !== PROTAGONIST ? `${heroName}（${PROTAGONIST}）` : PROTAGONIST;
    const heroOf = (name) => name === PROTAGONIST || (typeof isHero === 'function' && isHero(name));
    const floors = [...ledger.active.entries()].sort((a, b) => a[0] - b[0]);
    for (const [messageId, swipeId] of floors) {
        const entry = ledger.entries.get(ledgerKey(ledger, messageId, swipeId));
        for (const c of (entry && entry.changes) || []) {
            // 生活条在账本里存英文键（stamina/stress/money），记录里显示中文名。
            const key = String(c.key ?? '');
            const target = String(c.target ?? '');
            const hero = heroOf(target);
            rows.push({ messageId, target: hero ? heroLabel : target, hero, key: BAR_LABEL[key] || key, from: c.from, to: c.to, note: String(c.note ?? '') });
        }
        const ck = entry && entry.meta && entry.meta.check;
        if (ck) checks.push({ messageId, skill: ck.skill, difficulty: ck.difficulty || '普通', detail: ck.detail || (ck.die === 20 ? `d20(${ck.roll})` : `1d100=${ck.roll}`), outcome: ck.outcome || ck.tier, ruleset: ck.ruleset || 'coc7', source: ck.source || '' });
    }
    // 旧存档里可能已把用户登记成人际角色：数据保留，列表不显示。
    const characters = Object.entries(state.characters || {}).filter(([name]) => !(typeof isHero === 'function' && isHero(name))).map(([name, c]) => ({
        name, stage: stageOf(Number(c.dims && c.dims.好感) || 0).name, dims: { ...(c.dims || {}) }, intimacyForced: ((catalog && catalog.intimacyForced) || []).includes(name),
    }));
    // 主角技能：账本里的加上补全、分配的底数与手改；生效值不到入门（25）的不列（含「编辑技能」里填了未学的）。
    const owned = (state.protagonist && state.protagonist.skills) || {};
    const heroNames = [...new Set([...Object.keys(owned), ...(engine ? [...Object.keys(engine.protagonistBase || {}), ...Object.keys(engine.protagonistEdit || {})] : [])])]
        .filter((name) => !BASE_ATTRIBUTES.includes(name));
    const skills = heroNames.map((name) => {
        const s = owned[name];
        const profile = engine ? profileOf(engine, state, PROTAGONIST, name) : null;
        const value = profile ? Math.round(Number(profile.value) || 0) : Number(s && s.value) || 0;
        return { name, value, marked: Boolean(s && s.marked), display: profile ? displaySkill(engine, profile) : String(value) };
    }).filter((s) => s.value >= 25);
    const cat = catalog || {};
    // 主角本人的角色卡（旧存档里生成过的）不在「其他角色」里显示，数据保留。
    const sheets = Object.entries(cat.sheets || {}).filter(([name]) => !heroOf(name)).map(([name, sheet]) => ({
        name, rank: sheet.rank || '普通人', source: sheet.source || 'default',
        attributes: Object.entries(sheet.attributes || {}).map(([k]) => ({ name: k, display: engine ? displaySkill(engine, profileOf(engine, state, name, k)) : String(sheet.attributes[k]) })),
        skills: Object.entries(sheet.skills || {}).map(([k]) => ({ name: k, display: engine ? displaySkill(engine, profileOf(engine, state, name, k)) : String(sheet.skills[k]), provisional: Boolean(sheet.provisional && sheet.provisional[k]) })),
    }));
    return {
        day: state.clock ? state.clock.day : null,
        bars: { ...((state.protagonist && state.protagonist.bars) || {}) },
        // 金钱显示合并余额（数值侧金钱 + 战斗侧积分），bars.money 仍是数值侧原值。
        wallet: walletBalance(state.protagonist && state.protagonist.bars, walletExtra),
        vitals: vitalsOf(engine),
        attributes: engine ? BASE_ATTRIBUTES.map((name) => ({ name, display: displaySkill(engine, profileOf(engine, state, PROTAGONIST, name)) })) : [],
        skills,
        characters,
        log: rows.slice(-logMax).reverse(),
        total: rows.length,
        logGroups: groupLogRows(rows, logMax),
        checks: checks.slice(-CHECK_LOG_MAX).reverse(),
        story: (cat.story || []).map((s) => ({ name: s.name, attribute: s.attribute, category: s.category, guessed: Boolean(s.guessed) })),
        sheets,
        pendingPeople: ((cat.queue && cat.queue.people) || []).slice(),
        pendingSkills: ((cat.queue && cat.queue.skills) || []).slice(),
        ruleset: engine ? engine.ruleset.ID : 'coc7',
        heroSkills: heroSkillRows(engine, state, heroSkills),
        heroSlots: engine ? resolveHeroSlots(engine, state, cat) : {},
        skillEdit: skillEditRows(engine, state, heroSkills, cat, engine ? resolveHeroSlots(engine, state, cat) : {}),
        hasBackup: Boolean(hasBackup),
    };
}

// 好感总览（数值系统开启时的数据源）：已登记的人际角色，按好感从高到低；每人附原始维度与人际维度的变动记录（新的在前）。
// 排除主角与旧存档里误登记的用户本人。数值条由调用方用 characterStatMetrics 生成，与状态栏同一路径。
export const OVERVIEW_DIMS = Object.freeze(['好感', '信任', '了解', '芥蒂', '欲望']);

export function statsFavorOverview(ledger, { isHero = null } = {}) {
    if (!ledger) return [];
    const state = currentStatsState(ledger);
    const logs = new Map();
    const floors = [...ledger.active.entries()].sort((a, b) => a[0] - b[0]);
    for (const [messageId, swipeId] of floors) {
        const entry = ledger.entries.get(ledgerKey(ledger, messageId, swipeId));
        const day = entry && entry.after && entry.after.clock ? entry.after.clock.day : null;
        for (const c of (entry && entry.changes) || []) {
            if (!OVERVIEW_DIMS.includes(String(c.key ?? ''))) continue;
            const target = String(c.target ?? '');
            if (!logs.has(target)) logs.set(target, []);
            logs.get(target).push({ day, messageId, key: String(c.key), from: c.from, to: c.to, note: String(c.note ?? '') });
        }
    }
    return Object.entries(state.characters || {})
        .filter(([name]) => name !== PROTAGONIST && !(typeof isHero === 'function' && isHero(name)))
        .map(([name, c]) => ({ name, dims: { ...(c.dims || {}) }, log: (logs.get(name) || []).reverse() }))
        .sort((a, b) => (Number(b.dims.好感) || 0) - (Number(a.dims.好感) || 0));
}

export const CLOCK_TRAIL_MAX = 20;

// 诊断用：最近若干楼结算后的时钟（捕捉到的日期与整点），没有日期也没有整点的楼不列。
export function statsClockTrail(ledger, max = CLOCK_TRAIL_MAX) {
    if (!ledger) return [];
    const rows = [];
    for (const [messageId, swipeId] of [...ledger.active.entries()].sort((a, b) => a[0] - b[0])) {
        const entry = ledger.entries.get(ledgerKey(ledger, messageId, swipeId));
        const clock = entry && entry.after && entry.after.clock;
        if (!clock) continue;
        const date = clock.lastDate == null ? '' : String(clock.lastDate);
        const hour = Number.isInteger(clock.lastHour) ? clock.lastHour : null;
        if (!date && hour === null) continue;
        rows.push({ messageId, date, hour });
    }
    return rows.slice(-max);
}

export function describeClockTrail(rows) {
    if (!rows || !rows.length) return '';
    return `日期捕捉（最近 ${rows.length} 楼） ${rows.map((r) => `#${r.messageId} ${r.date || '-'} ${r.hour === null ? '-' : `${r.hour}时`}`).join(' · ')}`;
}
