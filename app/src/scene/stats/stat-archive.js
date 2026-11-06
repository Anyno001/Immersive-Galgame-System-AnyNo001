// 设置页「存档」区的数据（§10）：当前数值与变动记录。纯函数，只读账本。
// 变动记录取自当前生效的各楼快照（active swipe），切换 swipe、删楼后自动一致，不依赖单独维护的日志。
import { stageOf } from './stat-favor.js';
import { currentStatsState, ledgerKey } from './stat-ledger.js';
import { PROTAGONIST, profileOf } from './stat-engine.js';
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
    const bonus = r.bonusOf(profile);
    const prof = r.proficiencyOf(profile);
    return `${bonus >= 0 ? '+' : ''}${bonus}${prof === 2 ? ' 专精' : prof === 1 ? ' 熟练' : ''}`;
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

export function statsArchiveModel(ledger, { logMax = ARCHIVE_LOG_MAX, catalog = null, engine = null, hasBackup = false, walletExtra = 0, heroSkills = [], isHero = null } = {}) {
    if (!ledger) return null;
    const state = currentStatsState(ledger);
    const rows = [];
    const checks = [];
    const floors = [...ledger.active.entries()].sort((a, b) => a[0] - b[0]);
    for (const [messageId, swipeId] of floors) {
        const entry = ledger.entries.get(ledgerKey(ledger, messageId, swipeId));
        for (const c of (entry && entry.changes) || []) {
            // 生活条在账本里存英文键（stamina/stress/money），记录里显示中文名。
            const key = String(c.key ?? '');
            rows.push({ messageId, target: String(c.target ?? ''), key: BAR_LABEL[key] || key, from: c.from, to: c.to, note: String(c.note ?? '') });
        }
        const ck = entry && entry.meta && entry.meta.check;
        if (ck) checks.push({ messageId, skill: ck.skill, difficulty: ck.difficulty || '普通', detail: ck.detail || (ck.die === 20 ? `d20(${ck.roll})` : `1d100=${ck.roll}`), outcome: ck.outcome || ck.tier, ruleset: ck.ruleset || 'coc7', source: ck.source || '' });
    }
    // 旧存档里可能已把用户登记成人际角色：数据保留，列表不显示。
    const characters = Object.entries(state.characters || {}).filter(([name]) => !(typeof isHero === 'function' && isHero(name))).map(([name, c]) => ({
        name, stage: stageOf(Number(c.dims && c.dims.好感) || 0).name, dims: { ...(c.dims || {}) },
    }));
    const skills = Object.entries((state.protagonist && state.protagonist.skills) || {}).map(([name, s]) => ({
        name, value: Number(s && s.value) || 0, marked: Boolean(s && s.marked),
        display: engine ? displaySkill(engine, profileOf(engine, state, PROTAGONIST, name)) : String(Number(s && s.value) || 0),
    }));
    const cat = catalog || {};
    const sheets = Object.entries(cat.sheets || {}).map(([name, sheet]) => ({
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
        checks: checks.slice(-CHECK_LOG_MAX).reverse(),
        story: (cat.story || []).map((s) => ({ name: s.name, attribute: s.attribute, category: s.category, guessed: Boolean(s.guessed) })),
        sheets,
        pendingPeople: ((cat.queue && cat.queue.people) || []).slice(),
        pendingSkills: ((cat.queue && cat.queue.skills) || []).slice(),
        ruleset: engine ? engine.ruleset.ID : 'coc7',
        heroSkills: heroSkillRows(engine, state, heroSkills),
        hasBackup: Boolean(hasBackup),
    };
}
