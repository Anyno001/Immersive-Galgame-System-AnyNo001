// 一楼的事后结算（§4.2、§7、v2 §5.2 / §7.2）：检定 → 标签 → 角色维度 → 生活条 → 熬夜 → 跨天。
// 纯函数，random 由账本按本楼种子提供；检定走 opts.engine（缺省为空注册表的默认规则体系）。
// 返回 { state, changes, meta }，可直接作为 stat-ledger-settle 的 settle 回调结果。
import { parseStatDirectives } from './stat-directives.js';
import { FAVOR_GATES, applyDim, baseDelta, favorLimits, gateKey } from './stat-favor.js';
import { START_DIMS, START_FAVOR } from './stat-vocab.js';
import { applyGift, applyKeyEvent } from './stat-favor-events.js';
import { DEFAULT_MONEY_TABLE, applyBarDirective } from './stat-bars.js';
import { SOFT_DAY_FLOORS, detectDayAdvance, fallbackDirectives, isLateHour, narrationOf, settleDay, settleSkip, settleSoftDay } from './stat-day.js';
import { DIM_MAX, DIM_MIN, SKILL_MAX, barsOf, clamp, createCharacter, withBars, withCharacter, withClock } from './stat-state.js';
import { rollDie } from './stat-rng.js';
import { settleCombat } from './stat-battle.js';
import { PROTAGONIST, createEngine, markCheckOpponents, markGrowth, markNpcGrowth, profileOf, resolveCheck } from './stat-engine.js';
import { registerStorySkill } from './stat-registry.js';

const CHARACTER_KINDS = new Set(['favor', 'dim', 'gift', 'event']);
const BAR_KINDS = new Set(['stamina', 'hurt', 'stress', 'money']);
const TARGET_KINDS = new Set([...CHARACTER_KINDS, 'grow', 'start']);
const USER_NAME = /^(?:<user>|\{\{user\}\}|主角)$/i;
// 标签位置：数「roll 标签」之前出现了几个正文检定标签，用来对应骰序里的第几对骰（最多 ROLL_PAIR_MAX 对）。
const ROLL_PAIR_MAX = 10;
const ROLL_TAG = /[\[【]\s*igs-stat\s*[:：]\s*(?:roll|检定)\s*[|｜]/i;
const CHECK_TAG_OPEN = /\[igs-check:/g;
// 社交检定失败时，本楼对该角色的正向好感标签降一档（§7.2）。
const FAVOR_DOWNGRADE = Object.freeze({ 心动: '开心', 感动: '开心', 开心: '平淡' });

// 只结算能解析成已登记角色的标签；路人与解析不了的名字记诊断后丢弃（§5.1B、易错点 C3）。
function resolveTargets(directives, resolve, diagnostics) {
    const out = [];
    for (const d of directives) {
        if (d.kind === 'battle' && d.ally) {
            const ally = USER_NAME.test(d.ally) ? null : resolve(d.ally);
            if (!ally) diagnostics.push({ code: 'stat-unknown-character', name: d.ally });
            out.push({ ...d, ally });
            continue;
        }
        // 生活条标签带角色名时按登记规则解析；写主角或用户名的当主角本人处理。
        if (BAR_KINDS.has(d.kind) && d.target) {
            if (USER_NAME.test(d.target)) { const { target, ...rest } = d; out.push(rest); continue; }
            const key = resolve(d.target);
            if (key) out.push({ ...d, target: key });
            else diagnostics.push({ code: 'stat-unknown-character', name: d.target });
            continue;
        }
        if (!TARGET_KINDS.has(d.kind)) { out.push(d); continue; }
        if (USER_NAME.test(d.target)) { diagnostics.push({ code: 'stat-user-target', name: d.target }); continue; }
        const key = resolve(d.target);
        if (key) out.push({ ...d, target: key });
        else diagnostics.push({ code: 'stat-unknown-character', name: d.target });
    }
    return out;
}

// 剧情成长标签：NPC 的某项技能成长一次（幅度同主角的一次成长），同一角色同一技能每个游戏日最多一次。
function settleGrowTags(before, directives, ctx) {
    let state = before;
    for (const d of directives) {
        if (d.kind !== 'grow') continue;
        const skill = ctx.engine.registry.resolve(d.skill);
        const entry = skill && ctx.engine.registry.get(skill);
        if (!skill || !entry || entry.kind === 'attribute') { ctx.diagnostics.push({ code: 'stat-grow-unknown-skill', name: d.skill }); continue; }
        const day = state.clock.day;
        const character = state.characters[d.target] || createCharacter(day, { nsfw: ctx.nsfw });
        const growth = character.skillGrowth || {};
        const own = growth[skill] || {};
        if (own.tagDay === day) { ctx.diagnostics.push({ code: 'stat-grow-daily-limit', name: d.target, skill }); continue; }
        const from = profileOf(ctx.engine, state, d.target, skill).value;
        const to = Math.min(Math.max(SKILL_MAX, from), from + rollDie(10, ctx.random));
        const bonus = (Number(own.bonus) || 0) + Math.max(0, to - from);
        if (to > from) ctx.changes.push({ source: 'tag', target: d.target, key: skill, from, to, note: '成长' });
        state = withCharacter(state, d.target, { ...character, skillGrowth: { ...growth, [skill]: { ...own, bonus, marked: Boolean(own.marked), tagDay: day } } });
    }
    return state;
}

// 同一角色同一维度一楼只留一条，取增量绝对值最大的方向（易错点 C5）。
export function dedupeDims(directives) {
    const out = [];
    const slot = new Map();
    for (const d of directives) {
        if (d.kind !== 'favor' && d.kind !== 'dim') { out.push(d); continue; }
        const key = `${d.target}|${d.dim}`;
        if (!slot.has(key)) { slot.set(key, out.length); out.push(d); continue; }
        const i = slot.get(key);
        if (Math.abs(baseDelta(d.dim, d.value)) > Math.abs(baseDelta(out[i].dim, out[i].value))) out[i] = d;
    }
    return out;
}

// 检定结果约束好感（§7.2）：社交检定失败时对象的正向好感降一档；对象不明时按本楼全部正向好感处理。
export function constrainFavor(directives, check) {
    if (!check || !check.social || check.success) return directives;
    const target = check.against || check.toward;
    return directives.map((d) => {
        if (d.kind !== 'favor' || !FAVOR_DOWNGRADE[d.value]) return d;
        if (target && d.target !== target) return d;
        return { ...d, value: FAVOR_DOWNGRADE[d.value], constrained: true };
    });
}

function applyCharacterDirective(current, d, state, ctx) {
    const bonus = ctx.critTarget && (ctx.critTarget === '*' || ctx.critTarget === d.target) ? 1 : 0;
    // 困难档只管好感的普通加分；送礼自有递减规则，信任等其他维度不受影响。
    const limits = d.kind === 'gift' || (d.dim && d.dim !== '好感') ? favorLimits('normal') : ctx.limits;
    const room = (dim) => limits.floor + bonus - (ctx.floorGained.get(`${d.target}|${dim}`) || 0);
    const coef = Number(current.coef) || 1;
    if (d.kind === 'gift') return applyGift(current, d.value, { random: ctx.random, coef, floorRoom: room('好感') });
    if (d.kind === 'event') {
        const roll = () => resolveCheck(ctx.engine, state, { actor: PROTAGONIST, skill: '魅力', toward: d.target }, ctx.random);
        const { character, result } = applyKeyEvent(current, d.value, { roll, random: ctx.random });
        ctx.events.push({ target: d.target, ...result });
        return { character, change: result.success ? { dim: '好感', value: `${d.value}突破`, from: result.gate, to: result.gate + 1 } : null };
    }
    return applyDim(current, d.dim, d.value, { random: ctx.random, coef, floorRoom: room(d.dim), dailyMax: limits.daily });
}

// 起始关系：只对还没建档、或建档后各维度仍是初始 0 的角色生效，好感直接定到该档初值；低于初值的关口视为已过。
function settleStartRelations(before, directives, ctx) {
    let state = before;
    for (const d of directives) {
        if (d.kind !== 'start') continue;
        const existing = state.characters[d.target];
        const pristine = !existing || (Object.values(existing.dims || {}).every((v) => !Number(v)) && !(existing.unlocked || []).length);
        if (!pristine) { ctx.diagnostics.push({ code: 'stat-start-ignored', name: d.target }); continue; }
        const base = existing || createCharacter(state.clock.day, { nsfw: ctx.nsfw });
        const preset = START_DIMS[d.value] || {};
        for (const [key, to] of Object.entries(preset)) {
            if (to) ctx.changes.push({ source: 'tag', target: d.target, key, from: 0, to, note: `起始关系·${d.value}` });
        }
        const to = preset.好感 ?? START_FAVOR[d.value] ?? 0;
        state = withCharacter(state, d.target, {
            ...base,
            dims: { ...base.dims, ...preset },
            unlocked: FAVOR_GATES.filter((gate) => gate < to).map(gateKey),
            lastSeenDay: state.clock.day,
        });
    }
    return state;
}

export const MANUAL_DIMS = Object.freeze(['好感', '信任', '了解', '芥蒂']);
export const MANUAL_BARS = Object.freeze(['stamina', 'money', 'stress']);
const MANUAL_BAR_RANGE = Object.freeze({ stamina: [0, 100], stress: [0, 100], money: [-Infinity, Infinity] });

// 手改生活条：bars = { stamina, money, stress }，对主角或角色，只改与当前值不同的项。
function applyManualBars(state, name, bars, changes) {
    const hero = name === PROTAGONIST;
    const cur = hero ? state.protagonist.bars : barsOf(state.characters[name]);
    const patch = {};
    for (const key of MANUAL_BARS) {
        const v = Number(bars && bars[key]);
        if (!Number.isFinite(v)) continue;
        const [lo, hi] = MANUAL_BAR_RANGE[key];
        const to = clamp(Math.round(v), lo, hi);
        const from = Number(cur[key]) || 0;
        if (to === from) continue;
        patch[key] = to;
        changes.push({ source: 'manual', target: name, key, from, to, note: '手动修改' });
    }
    if (!Object.keys(patch).length) return state;
    const next = { ...cur, ...patch };
    return hero ? withBars(state, next) : withCharacter(state, name, { ...state.characters[name], bars: next });
}

// 玩家在设置页或数据库表格手改的数值：manual = { 角色: { 好感, 信任, 了解, 芥蒂, bars: { stamina, money, stress } } }（主角只有 bars，键为「主角」），盖在本楼结算结果上，不受单楼与每日上限约束。
// 好感关口按新值重算：低于新值的关口算已过，其余重新锁上。
// 从表格导入的角色（manual 里有名字、正文没提到）在这里建档，重算本楼时不会丢。
export function applyManualRelations(state, manual, changes = [], { nsfw = false } = {}) {
    let next = state;
    for (const [name, dims] of Object.entries(manual && typeof manual === 'object' ? manual : {})) {
        if (!dims || typeof dims !== 'object') continue;
        if (name === PROTAGONIST) { next = applyManualBars(next, name, dims.bars, changes); continue; }
        if (!next.characters[name]) next = withCharacter(next, name, createCharacter(next.clock.day, { nsfw }));
        const cur = next.characters[name];
        const patch = {};
        for (const key of MANUAL_DIMS) {
            const v = Number(dims[key]);
            if (!Number.isFinite(v)) continue;
            const to = clamp(Math.round(v), DIM_MIN, DIM_MAX);
            const from = Number(cur.dims[key]) || 0;
            if (to === from) continue;
            patch[key] = to;
            changes.push({ source: 'manual', target: name, key, from, to, note: '手动修改' });
        }
        if (dims.bars) next = applyManualBars(next, name, dims.bars, changes);
        if (!Object.keys(patch).length) continue;
        const favor = Object.hasOwn(patch, '好感') ? patch.好感 : Number(cur.dims.好感) || 0;
        const gates = FAVOR_GATES.map(gateKey);
        const unlocked = Object.hasOwn(patch, '好感')
            ? [...(cur.unlocked || []).filter((k) => !gates.includes(k)), ...FAVOR_GATES.filter((gate) => gate < favor).map(gateKey)]
            : cur.unlocked;
        next = withCharacter(next, name, { ...next.characters[name], dims: { ...cur.dims, ...patch }, unlocked });
    }
    return next;
}

function settleCharacters(before, directives, ctx) {
    let state = before;
    for (const d of directives) {
        if (!CHARACTER_KINDS.has(d.kind)) continue;
        if (d.dim === '欲望' && !ctx.nsfw) { ctx.diagnostics.push({ code: 'stat-dim-disabled', name: d.target, dim: d.dim }); continue; }
        const current = state.characters[d.target] || createCharacter(state.clock.day, { nsfw: ctx.nsfw });
        const { character, change } = applyCharacterDirective(current, d, state, ctx);
        if (change && change.to !== change.from) {
            ctx.changes.push({ source: 'tag', target: d.target, key: change.dim, from: change.from, to: change.to, note: d.constrained ? `${change.value}（检定失败）` : change.value });
            const gain = Math.max(0, change.to - change.from);
            if (gain && d.kind !== 'event') {
                const key = `${d.target}|${change.dim}`;
                ctx.floorGained.set(key, (ctx.floorGained.get(key) || 0) + gain);
            }
        }
        state = withCharacter(state, d.target, { ...character, lastSeenDay: state.clock.day });
    }
    return state;
}

// 23 点以后的行动每天额外记一次熬夜；体力归零时标记强制休息，并按入睡处理。
function settleBars(state, directives, hour, ctx) {
    const list = directives.filter((d) => BAR_KINDS.has(d.kind) && !d.target);
    let stayedUp = state.clock.stayedUp || list.some((d) => d.kind === 'stamina' && d.value === '熬夜');
    if (isLateHour(hour) && !stayedUp) { list.push({ kind: 'stamina', value: '熬夜', late: true }); stayedUp = true; }
    let bars = state.protagonist.bars;
    for (const d of list) {
        const r = applyBarDirective(bars, d, ctx.moneyTable, ctx.walletExtra);
        if (r.shortfall) ctx.flags.shortfall = true;
        if (r.change) ctx.changes.push({ source: 'tag', target: '主角', key: r.change.key, from: r.change.from, to: r.change.to, note: d.late ? '23点后熬夜' : d.value });
        bars = r.bars;
    }
    if (bars.stamina <= 0) ctx.flags.forcedRest = true;
    const next = withBars(state, bars);
    return stayedUp !== state.clock.stayedUp ? withClock(next, { stayedUp }) : next;
}

// 角色的生活条：规则同主角，金钱不并入战斗积分（钱包只属于主角）；花费超过余额时不扣并记 shortfall。「受伤」类只影响生命，角色不处理。
function settleNpcBars(state, directives, ctx) {
    let next = state;
    for (const d of directives) {
        if (!BAR_KINDS.has(d.kind) || !d.target || d.kind === 'hurt') continue;
        const cur = next.characters[d.target];
        if (!cur || (d.kind === 'stamina' && d.value === '受伤')) continue;
        const bars = barsOf(cur);
        const r = applyBarDirective(bars, d, ctx.moneyTable, 0);
        if (r.shortfall) { ctx.diagnostics.push({ code: 'stat-npc-shortfall', name: d.target }); }
        if (r.change) ctx.changes.push({ source: 'tag', target: d.target, key: r.change.key, from: r.change.from, to: r.change.to, note: d.value });
        if (r.bars !== bars) next = withCharacter(next, d.target, { ...cur, bars: r.bars });
    }
    return next;
}

function settleClock(state, narration, directives, hour, ctx) {
    const all = ctx.flags.forcedRest ? [...directives, { kind: 'sleep', forced: true }] : directives;
    const advance = detectDayAdvance({ narration, directives: all, lastHour: state.clock.lastHour, hour });
    let next;
    if (advance && advance.kind === 'skip') {
        next = settleSkip(state, advance.days, { random: ctx.random, changes: ctx.changes, skillValueOf: ctx.skillValueOf });
        if (advance.capped) ctx.flags.skipCapped = true;
    } else if (advance) {
        next = settleDay(state, { random: ctx.random, changes: ctx.changes, skillValueOf: ctx.skillValueOf });
    } else {
        const floors = state.clock.floorsSinceDay + 1;
        if (floors >= SOFT_DAY_FLOORS) { next = settleSoftDay(state); ctx.flags.softDay = true; }
        else next = withClock(state, { floorsSinceDay: floors });
    }
    if (advance) ctx.flags.dayAdvance = advance.reason;
    return Number.isInteger(hour) ? withClock(next, { lastHour: hour }) : next;
}

// roll 标签取骰：标签前已有几个正文检定标签，就取骰序里对应的下一对。
function rollTagIndex(text) {
    const body = String(text ?? '');
    const at = body.search(ROLL_TAG);
    return at < 0 ? 0 : Math.min(ROLL_PAIR_MAX - 1, (body.slice(0, at).match(CHECK_TAG_OPEN) || []).length);
}

// 取 roll 标签对应的原始骰面，形状随规则体系：CoC 是 { unit, tens }，D&D 是 { d20: [a, b] }。
// 旧预掷（opts.preroll.raw）形状与当前规则体系匹配时仍可用；否则按楼内骰序 rollPairs 取。
function rawForRollTag(text, opts, rulesetId) {
    const old = opts.preroll && opts.preroll.raw;
    if (rulesetId === 'coc7') {
        if (old && Number.isInteger(old.unit) && Array.isArray(old.tens) && old.tens.length) return { unit: old.unit, tens: [...old.tens] };
        const pair = Array.isArray(opts.rollPairs) ? opts.rollPairs[rollTagIndex(text)] : null;
        return pair && Number.isInteger(pair.unit) && Array.isArray(pair.tens) && pair.tens.length ? { unit: pair.unit, tens: [...pair.tens] } : null;
    }
    if (old && Array.isArray(old.d20) && old.d20.length === 2) return { d20: [...old.d20] };
    const pair = Array.isArray(opts.rollPairs) ? opts.rollPairs[rollTagIndex(text)] : null;
    return Array.isArray(pair) && pair.length === 2 ? { d20: [...pair] } : null;
}

// roll 标签 + 骰面 → 本楼检定（§5.2）。新技能先登记进本楼的临时目录，结果随 meta.newSkills 交给运行时合并。
function checkFromRollTag(before, tag, raw, opts, ctx) {
    let engine = ctx.engine;
    let skill = engine.registry.resolve(tag.skill);
    if (!skill) {
        const r = registerStorySkill(opts.catalog || {}, tag.skill, { attribute: tag.attribute, floor: opts.floor });
        if (r.created) {
            ctx.newSkills.push(r.entry);
            engine = createEngine({ ...(opts.catalog || {}), story: r.catalog.story }, opts.settings || {}, engine.ruleset.ID, { readAbilities: engine.readAbilities, readVitals: engine.readVitals, userName: engine.userName });
            skill = r.name;
        } else if (r.reason === 'capped' || r.reason === 'floor-capped') {
            ctx.diagnostics.push({ code: 'stats-skill-cap', name: tag.skill });
            skill = engine.registry.resolve(tag.attribute) || null;
        }
    }
    if (!skill) { ctx.diagnostics.push({ code: 'stats-roll-unknown-skill', name: tag.skill }); return null; }
    let against = null;
    if (tag.against) {
        against = USER_NAME.test(tag.against) ? null : opts.resolveTarget(tag.against);
        if (!against) ctx.diagnostics.push({ code: 'stat-unknown-character', name: tag.against });
    }
    const opposedSkill = tag.opposedSkill ? engine.registry.resolve(tag.opposedSkill) : null;
    return resolveCheck(engine, before, { actor: PROTAGONIST, skill, difficulty: tag.difficulty, against, opposedSkill, raw, source: 'roll' }, null);
}

// opts：{ random, hour, nsfw, resolveCharacter, moneyTable, walletExtra（战斗侧积分，并入金钱判断）, engine, check, rollPairs, preroll, storyChecks, noBattle, catalog, settings, floor }
// check：本楼已定的检定（选项、输入匹配、手动掷骰）；没有时按 roll 标签与楼内骰序 rollPairs 重算。
// storyChecks：正文 igs-check 的回放结果（主角的才会打成长勾；社交检定大成功可触发突破加成）。
// favorMode：本楼按哪一档好感上限结算（'normal' 缺省 / 'hard'），困难档会写进 meta.favorMode，重算同一楼时沿用。
// npcChecks：正文检定里 NPC 作为一方的 [{ actor, skill }]，用到的技能给 NPC 打成长勾。
// noBattle：战斗扩展接管战斗时为真，丢弃 battle 标签。
// extraDirectives：由战报楼合成的 challenge 指令，不经 AI 标签解析，不受 noBattle 影响。
export function settleFloorText(before, text, opts = {}) {
    const { random, hour = null, nsfw = false, resolveCharacter, moneyTable = DEFAULT_MONEY_TABLE } = opts;
    const parsed = parseStatDirectives(text);
    const diagnostics = [...parsed.diagnostics];
    const narration = narrationOf(text);
    const resolve = resolveCharacter || ((name) => (Object.hasOwn(before.characters, name) ? name : null));
    const engine = opts.engine || createEngine();
    const ctx = { random, nsfw, moneyTable, limits: favorLimits(opts.favorMode), walletExtra: Number(opts.walletExtra) || 0, present: Array.isArray(opts.present) ? opts.present : undefined, engine, changes: [], diagnostics, events: [], flags: {}, floorGained: new Map(), newSkills: [], critTarget: null, skillValueOf: (st, name, skill) => profileOf(engine, st, name, skill).value };
    const rollTag = parsed.directives.find((d) => d.kind === 'roll') || null;
    let check = opts.check || null;
    let pendingRoll = null;
    if (!check && rollTag) {
        const raw = rawForRollTag(text, opts, engine.ruleset.ID);
        if (raw) check = checkFromRollTag(before, rollTag, raw, { ...opts, resolveTarget: resolve }, ctx);
        else pendingRoll = { skill: rollTag.skill, difficulty: rollTag.difficulty, against: rollTag.against || null, opposedSkill: rollTag.opposedSkill || null, attribute: rollTag.attribute || null };
    }
    const storyChecks = (Array.isArray(opts.storyChecks) ? opts.storyChecks : []).filter((item) => item && item.skill);
    const lead = check || storyChecks.find((item) => item.social) || null;
    if (lead && lead.social && lead.success && lead.ladder === 'crit') ctx.critTarget = lead.against || lead.toward || '*';
    const merged = [...parsed.directives.filter((d) => d.kind !== 'roll'), ...fallbackDirectives(narration, parsed.directives)];
    const allowed = opts.noBattle ? merged.filter((d) => d.kind !== 'battle') : merged;
    if (allowed.length !== merged.length) diagnostics.push({ code: 'stats-battle-skipped-combat' });
    const extra = (Array.isArray(opts.extraDirectives) ? opts.extraDirectives : []).filter((d) => d && d.kind === 'challenge');
    const directives = [...constrainFavor(dedupeDims(resolveTargets(allowed, resolve, diagnostics)), lead), ...extra];
    // 数据库表格里的人物在本楼首次建档：沿用表格当时的好感、信任、了解，之后只按正文标签变化。
    let state = before;
    if (opts.seedCharacters) {
        const fresh = Object.fromEntries(Object.entries(opts.seedCharacters).filter(([name]) => !state.characters[name]));
        const seeded = [];
        state = applyManualRelations(state, fresh, seeded, { nsfw });
        for (const row of seeded) ctx.changes.push({ ...row, source: 'register', note: '数据库表格登记' });
    }
    state = markGrowth(state, check);
    for (const item of storyChecks) state = markGrowth(state, item);
    state = markCheckOpponents(state, check);
    for (const item of Array.isArray(opts.npcChecks) ? opts.npcChecks : []) state = markNpcGrowth(state, resolve(item.actor), item.skill);
    state = settleStartRelations(state, directives, ctx);
    state = settleCharacters(state, directives, ctx);
    state = settleGrowTags(state, directives, ctx);
    state = settleCombat(state, directives, ctx);
    state = settleBars(state, directives, hour, ctx);
    state = settleNpcBars(state, directives, ctx);
    state = settleClock(state, narration, directives, hour, ctx);
    if (opts.manual) state = applyManualRelations(state, opts.manual, ctx.changes, { nsfw });
    const meta = { diagnostics, events: ctx.events, flags: ctx.flags };
    if (opts.manual && Object.keys(opts.manual).length) meta.manual = opts.manual;
    if (check) meta.check = check;
    if (storyChecks.length) meta.checks = storyChecks.map((item) => ({ ruleset: item.ruleset, actor: item.actor, skill: item.skill, dc: item.dc, difficulty: item.difficulty, roll: item.roll ?? item.die, total: item.total, tier: item.tier, success: item.success }));
    if (pendingRoll) meta.pendingRoll = pendingRoll;
    if (ctx.newSkills.length) meta.newSkills = ctx.newSkills;
    if (rollTag) meta.rollTag = { skill: rollTag.skill, difficulty: rollTag.difficulty };
    if (ctx.limits.mode === 'hard') meta.favorMode = 'hard';
    return { state, changes: ctx.changes, meta };
}
