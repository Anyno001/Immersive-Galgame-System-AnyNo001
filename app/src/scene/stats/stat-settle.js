// 一楼的事后结算（§4.2、§7、v2 §5.2 / §7.2）：检定 → 标签 → 角色维度 → 生活条 → 熬夜 → 跨天。
// 纯函数，random 由账本按本楼种子提供；检定走 opts.engine（缺省为空注册表的默认规则体系）。
// 返回 { state, changes, meta }，可直接作为 stat-ledger-settle 的 settle 回调结果。
import { parseStatDirectives } from './stat-directives.js';
import { FAVOR_GATES, FAVOR_TIERS, JEALOUS_NOTE, TRUST_FLOOR_MAX, applyDim, applyFavorTier, applyGrudgeTier, applyJealousy, applyTrustTier, downgradeStrength, favorLimits, favorSign, favorStrength, favorTierLimits, favorWeight, gateKey, grudgeStrength, legacyTierOf, trustStrength } from './stat-favor.js';
import { TRAIT_EVENTS, TRAIT_WORD_EVENTS, FAVOR_STRENGTHS, INTIMATE_BASE, INTIMATE_LEVELS, INTIMATE_MULT, START_DIMS, START_FAVOR, START_FIX_VALUE, START_MARKS, startFixOffsets } from './stat-vocab.js';
import { INSIGHT_COOLDOWN_DAYS, applyGift, applyKeyEvent, liveHurts } from './stat-favor-events.js';
import { DEFAULT_MONEY_TABLE, STRESS_DELTA, applyBarDirective } from './stat-bars.js';
import { SOFT_DAY_FLOORS, aptitudeTier, detectDayAdvance, fallbackDirectives, growthGain, isLateHour, narrationOf, settleDay, settleRest, settleSkip, settleSoftDay } from './stat-day.js';
import { SKIP_DAYS_MAX, SKIP_DAYS_MAX_LEGACY } from './stat-duration.js';
import { DATE_REGEX_INVALID, TIME_REGEX_INVALID, captureFirst, compileCaptureRegex, judgeDateAdvance, parseHour } from './stat-date.js';
import { DIM_MAX, SKILL_MAX, barsOf, clamp, createCharacter, dimMin, withBars, withCharacter, withClock, withSkills } from './stat-state.js';
import { rollDie } from './stat-rng.js';
import { settleCombat } from './stat-battle.js';
import { PROTAGONIST, createEngine, keyEventSkill, markCheckOpponents, markGrowth, markNpcGrowth, profileOf, resolveCheck } from './stat-engine.js';
import { registerStorySkill } from './stat-registry.js';
import { driftFame, fameMandates, sanitizeFameBars, settleFameTags } from './stat-fame.js';
import { applyBreak, markFixations, shiftStress, trackStressPeak } from './stat-strain.js';
import { STRESS_STRENGTH_DELTA } from './stat-bars.js';
import { amplifyLimit, clampScale, extraGatesOf, getTraitDef, hasTrait, isComboKey, isFoodGift, listTraits, traitCatalogOf, traitFlag, traitScale } from './stat-traits.js';
import { calcRow, withCalc } from './stat-status-defs.js';
import { attachOpeningRels, clearBond, hasClearableBond, pairPartnersOf } from './stat-trait-rules-bond.js';
import { moonlightJealousy, settleTraitTags } from './stat-trait-hooks.js';
import { settleLandmines } from './stat-trait-landmines.js';
import { consumeFavor, luckyReroll } from './stat-trait-dice.js';
import { settleStatusDirectives } from './stat-status.js';
import { autoStatuses, statusScale } from './stat-status-auto.js';
import { settleNaturalHeal } from './stat-heal.js';

const CHARACTER_KINDS = new Set(['favor', 'dim', 'gift', 'event']);
// rev ≥ 2 新增：误会解除、顿悟、恋爱结束都带角色名，需要解析成已登记角色。
const REV2_TARGET_KINDS = new Set(['clear', 'insight', 'romance']);
// 当过恋爱对象的关键事件（吃醋不算）。
const ROMANCE_EVENTS = new Set(['约会', '告白']);
const BAR_KINDS = new Set(['stamina', 'hurt', 'stress', 'money']);
const TARGET_KINDS = new Set([...CHARACTER_KINDS, 'grow', 'start', 'startfix', 'intimate', 'traitEvent']);
const USER_NAME = /^(?:<user>|\{\{user\}\}|主角)$/i;
// 标签位置：数「roll 标签」之前出现了几个正文检定标签，用来对应骰序里的第几对骰（最多 ROLL_PAIR_MAX 对）。
const ROLL_PAIR_MAX = 10;
const ROLL_TAG = /[\[【]\s*igs-stat\s*[:：]\s*(?:roll|检定)\s*[|｜]/i;
const CHECK_TAG_OPEN = /\[igs-check:/g;
// 社交检定失败时，本楼对该角色的正向好感标签降一档（§7.2）。
const FAVOR_DOWNGRADE = Object.freeze({ 心动: '开心', 感动: '开心', 开心: '平淡' });

// 群体称呼（rev ≥ 2 拦截建档）：以「们、群、众」结尾，或在常见群体词表里。
const GROUP_WORDS = new Set(['村民', '信众', '信徒', '粉丝', '路人', '众人', '人群', '大家', '观众', '教众', '群众', '民众', '百姓', '围观者', '乘客', '同学们', '在场的人']);
export const isGroupName = (name) => {
    const text = String(name ?? '').trim();
    return GROUP_WORDS.has(text) || (text.length >= 2 && /[们群众]$/.test(text));
};
// 亲密对象写「群体」：只扣主角体力，不建档。
const CROWD_TARGET = '群体';

// 只结算能解析成已登记角色的标签；路人与解析不了的名字记诊断后丢弃（§5.1B、易错点 C3）。
// rev ≥ 2：未登记的群体称呼记 stat-group-name 后丢弃（已登记的照常）；亲密标签对象为「群体」时只保留主角那份。
function resolveTargets(directives, resolve, diagnostics, { rev = 0, known = {} } = {}) {
    const out = [];
    for (const d of directives) {
        if (rev >= 2 && d.kind === 'intimate' && d.target === CROWD_TARGET) { const { target, ...rest } = d; out.push({ ...rest, crowd: true }); continue; }
        const named = d.target || (d.kind === 'battle' ? d.ally : null);
        if (rev >= 2 && named && !Object.hasOwn(known, named) && isGroupName(named) && !USER_NAME.test(named)) {
            diagnostics.push({ code: 'stat-group-name', name: named, kind: d.kind });
            if (d.kind === 'battle') out.push({ ...d, ally: null });
            continue;
        }
        if (d.kind === 'battle' && d.ally) {
            const ally = USER_NAME.test(d.ally) ? null : resolve(d.ally);
            if (!ally) diagnostics.push({ code: 'stat-unknown-character', name: d.ally });
            out.push({ ...d, ally });
            continue;
        }
        // 生活条标签带角色名时按登记规则解析；写主角或用户名的当主角本人处理。break 标签同理。
        if ((BAR_KINDS.has(d.kind) || d.kind === 'break') && d.target) {
            if (USER_NAME.test(d.target)) { const { target, ...rest } = d; out.push(rest); continue; }
            const key = resolve(d.target);
            if (key) out.push({ ...d, target: key });
            else diagnostics.push({ code: 'stat-unknown-character', name: d.target });
            continue;
        }
        // 顿悟可指向主角：角色名写主角或用户名时作用于主角本人。
        if (d.kind === 'insight' && USER_NAME.test(d.target)) { out.push({ ...d, target: PROTAGONIST, hero: true }); continue; }
        if (!TARGET_KINDS.has(d.kind) && !REV2_TARGET_KINDS.has(d.kind)) { out.push(d); continue; }
        if (USER_NAME.test(d.target)) { diagnostics.push({ code: 'stat-user-target', name: d.target }); continue; }
        const key = resolve(d.target);
        if (key) out.push({ ...d, target: key });
        else diagnostics.push({ code: 'stat-unknown-character', name: d.target });
    }
    return out;
}

// 主角离体 / 复归（rev ≥ 2）：只改 protagonist.detached，已是目标值时不写。
function settleHero(state, directives) {
    let next = state;
    for (const d of directives) {
        if (d.kind !== 'hero') continue;
        const detached = d.value === '离体';
        if ((next.protagonist.detached === true) !== detached) next = { ...next, protagonist: { ...next.protagonist, detached } };
    }
    return next;
}

// 恋爱判定（rev ≥ 2）：约会、告白 event 置 romance；[romance|结束] 置 false（数值不动），之后再约会、告白重新为真。吃醋不再判恋爱。
function settleRomance(state, directives) {
    let next = state;
    for (const d of directives) {
        const cur = d.target && next.characters[d.target];
        if (!cur) continue;
        if (d.kind === 'event' && ROMANCE_EVENTS.has(d.value) && cur.romance !== true) next = withCharacter(next, d.target, { ...cur, romance: true });
        else if (d.kind === 'romance' && cur.romance !== false) next = withCharacter(next, d.target, { ...cur, romance: false });
    }
    return next;
}

// 误会解除（rev ≥ 2）：把近 7 天误会账里信任下降、芥蒂上升各自合计的一半（四舍五入，至少 1）退回，并清空账；账是空的记诊断。
function settleClear(state, directives, ctx) {
    let next = state;
    for (const d of directives) {
        if (d.kind !== 'clear') continue;
        const first = next.characters[d.target];
        if (!first) continue;
        const live = liveHurts(first, next.clock.day);
        // 猜忌 / 心结 / 近 7 天挂上的结怨：误会解除时一并摘掉（不依赖误会账），猜忌与心结按一半退回开局数额。
        const bond = hasClearableBond(next, d.target);
        if (bond) next = clearBond(next, d.target, ctx.changes);
        if (!live.length) { if (!bond) ctx.diagnostics.push({ code: 'stat-clear-empty', name: d.target }); continue; }
        const cur = next.characters[d.target];
        const dims = { ...cur.dims };
        for (const dim of ['信任', '芥蒂']) {
            const sum = live.filter((e) => e.dim === dim).reduce((a, e) => a + e.amount, 0);
            if (!sum) continue;
            const refund = Math.max(1, Math.round(sum / 2));
            const from = Number(dims[dim]) || 0;
            const to = clamp(dim === '信任' ? from + refund : from - refund, dimMin(dim), DIM_MAX);
            if (to === from) continue;
            dims[dim] = to;
            ctx.changes.push({ source: 'tag', target: d.target, key: dim, from, to, note: '误会解除' });
        }
        const { recentHurts, ...rest } = cur;
        next = withCharacter(next, d.target, { ...rest, dims });
    }
    return next;
}

// 顿悟（rev ≥ 2）：一次 +2d10，不超过 90；同一角色同一技能 30 天一次。目标写主角时作用于主角本人（冷却记在 protagonist.insights）。
function settleInsight(before, directives, ctx) {
    let state = before;
    for (const d of directives) {
        if (d.kind !== 'insight') continue;
        const skill = ctx.engine.registry.resolve(d.skill);
        const entry = skill && ctx.engine.registry.get(skill);
        if (!skill || !entry || entry.kind === 'attribute') { ctx.diagnostics.push({ code: 'stat-grow-unknown-skill', name: d.skill }); continue; }
        const day = state.clock.day;
        const amount = rollDie(10, ctx.random) + rollDie(10, ctx.random);
        if (d.hero) {
            const last = state.protagonist.insights && state.protagonist.insights[skill];
            if (Number.isFinite(last) && day - last < INSIGHT_COOLDOWN_DAYS) { ctx.diagnostics.push({ code: 'stat-insight-cooldown', name: PROTAGONIST, skill }); continue; }
            const p = profileOf(ctx.engine, state, PROTAGONIST, skill);
            const gain = Math.max(0, Math.min(Math.max(SKILL_MAX, p.value), p.value + amount) - p.value);
            const owned = state.protagonist.skills[skill];
            const own = owned ? Number(owned.value) || 0 : Number(p.seed ?? p.value) || 0;
            if (gain > 0) ctx.changes.push({ source: 'tag', target: PROTAGONIST, key: skill, from: p.value, to: p.value + gain, note: '顿悟' });
            state = withSkills(state, { ...state.protagonist.skills, [skill]: { ...(owned || {}), value: own + gain, marked: Boolean(owned && owned.marked) } });
            state = { ...state, protagonist: { ...state.protagonist, insights: { ...(state.protagonist.insights || {}), [skill]: day } } };
            continue;
        }
        const character = state.characters[d.target] || createCharacter(day, { nsfw: ctx.nsfw });
        const growth = character.skillGrowth || {};
        const own = growth[skill] || {};
        if (Number.isFinite(own.insightDay) && day - own.insightDay < INSIGHT_COOLDOWN_DAYS) { ctx.diagnostics.push({ code: 'stat-insight-cooldown', name: d.target, skill }); continue; }
        const from = profileOf(ctx.engine, state, d.target, skill).value;
        const to = Math.min(Math.max(SKILL_MAX, from), from + amount);
        if (to > from) ctx.changes.push({ source: 'tag', target: d.target, key: skill, from, to, note: '顿悟' });
        state = withCharacter(state, d.target, { ...character, skillGrowth: { ...growth, [skill]: { ...own, bonus: (Number(own.bonus) || 0) + Math.max(0, to - from), marked: Boolean(own.marked), insightDay: day } } });
    }
    return state;
}

// 剧情成长标签：NPC 的某项技能成长一次（幅度同主角的一次成长），同一角色同一技能每个游戏日最多一次。
// rev ≥ 2：天纵每天最多两次、每次 1d10+2（tagCount 记当日次数），出众与平庸仍每天一次、1d10；标签成长本身不掷检定。
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
        const tier = ctx.rev >= 2 ? aptitudeTier(ctx.aptitudeOf(d.target)) : null;
        const todayCount = own.tagDay === day ? (Number(own.tagCount) || 1) : 0;
        if (todayCount >= (tier === '天纵' ? 2 : 1)) { ctx.diagnostics.push({ code: 'stat-grow-daily-limit', name: d.target, skill }); continue; }
        const from = profileOf(ctx.engine, state, d.target, skill).value;
        const to = Math.min(Math.max(SKILL_MAX, from), from + (tier ? growthGain(tier, ctx.random) : rollDie(10, ctx.random)));
        const bonus = (Number(own.bonus) || 0) + Math.max(0, to - from);
        if (to > from) ctx.changes.push({ source: 'tag', target: d.target, key: skill, from, to, note: '成长' });
        state = withCharacter(state, d.target, { ...character, skillGrowth: { ...growth, [skill]: { ...own, bonus, marked: Boolean(own.marked), tagDay: day, ...(tier ? { tagCount: todayCount + 1 } : {}) } } });
    }
    return state;
}

// 同一角色同一维度一楼只留一条，取增量绝对值最大的方向（易错点 C5）。
export function dedupeDims(directives, tier = 'legacy', rev = 0) {
    const out = [];
    const slot = new Map();
    for (const d of directives) {
        if (d.kind !== 'favor' && d.kind !== 'dim') { out.push(d); continue; }
        const key = `${d.target}|${d.dim}`;
        if (!slot.has(key)) { slot.set(key, out.length); out.push(d); continue; }
        const i = slot.get(key);
        const loser = favorWeight(d, tier, rev) > favorWeight(out[i], tier, rev) ? out[i] : d;
        const winner = loser === d ? out[i] : d;
        // 同楼取较大者：被丢弃的那条原文记在留下那条上，变动记录里显示。
        out[i] = { ...winner, dropped: `${loser.dim === '好感' || loser.kind === 'favor' ? '好感' : loser.dim}·${loser.value}${loser.strength ? `·${loser.strength}` : ''}` };
    }
    return out;
}

// 同楼同角色同时有吃醋好感标签与芥蒂上升标签时，芥蒂上升标签丢弃（吃醋已含芥蒂）；芥蒂下降不受影响。只对 rev ≥ 2。
export function dropGrudgeWithJealousy(directives, diagnostics) {
    const jealous = new Set(directives.filter((d) => d.kind === 'favor' && d.value === '吃醋').map((d) => d.target));
    if (!jealous.size) return directives;
    return directives.filter((d) => {
        if (d.kind === 'dim' && d.dim === '芥蒂' && d.value === '上升' && jealous.has(d.target)) {
            diagnostics.push({ code: 'stat-grudge-with-jealous', name: d.target });
            return false;
        }
        return true;
    });
}

// 检定结果约束好感（§7.2）：社交检定失败时对象的正向好感降一档；对象不明时按本楼全部正向好感处理。
// rev ≥ 1（新楼）：所有正向好感方向不变、强度降一档（小降为平淡）；旧楼仍只降 FAVOR_DOWNGRADE 里的三个词。
export function constrainFavor(directives, check, tier = 'legacy', rev = 0) {
    if (!check || !check.social || check.success) return directives;
    const target = check.against || check.toward;
    return directives.map((d) => {
        // 信任（新三档）：社交检定失败时正向信任强度降一档，小降为无。
        if (d.kind === 'dim' && d.dim === '信任' && d.value === '上升' && FAVOR_TIERS.includes(tier) && (!target || d.target === target)) {
            const lower = FAVOR_STRENGTHS[FAVOR_STRENGTHS.indexOf(trustStrength(d)) - 1];
            return lower ? { ...d, strength: lower, constrained: true } : { ...d, kind: 'skipped', constrained: true };
        }
        if (rev >= 1 && FAVOR_TIERS.includes(tier) && d.kind === 'favor' && favorSign(d) > 0) {
            if (target && d.target !== target) return d;
            const { strength } = downgradeStrength(d);
            return strength ? { ...d, strength, constrained: true } : { ...d, value: '平淡', strength: undefined, constrained: true };
        }
        if (d.kind !== 'favor' || !FAVOR_DOWNGRADE[d.value]) return d;
        if (target && d.target !== target) return d;
        // 新三档：强度同时降一档（小降为无）；旧楼只降方向。
        const value = FAVOR_DOWNGRADE[d.value];
        if (!FAVOR_TIERS.includes(tier)) return { ...d, value, constrained: true };
        const { strength } = downgradeStrength(d);
        return strength ? { ...d, value, strength, constrained: true } : { ...d, value: '平淡', strength: undefined, constrained: true };
    });
}

// 正向「重大」只在同楼对同一角色有 event 标签时成立，否则降为「大」。只对新三档生效。
// 新楼（rev ≥ 1）的芥蒂下降「重大」同样需要同楼 event，否则降为「大」。
export function capMajorStrength(directives, tier, rev = 0) {
    if (!FAVOR_TIERS.includes(tier)) return directives;
    const evented = new Set(directives.filter((d) => d.kind === 'event').map((d) => d.target));
    return directives.map((d) => {
        if (d.kind === 'dim' && d.dim === '信任') return d.strength === '重大' && d.value === '上升' && !evented.has(d.target) ? { ...d, strength: '大' } : d;
        if (rev >= 1 && d.kind === 'dim' && d.dim === '芥蒂') return d.value === '下降' && grudgeStrength(d) === '重大' && !evented.has(d.target) ? { ...d, strength: '大' } : d;
        if (d.kind !== 'favor' || favorStrength(d) !== '重大' || evented.has(d.target)) return d;
        return favorSign(d) > 0 ? { ...d, strength: '大' } : d;
    });
}

// 角色在某维度的特质倍率：up / down / 吃醋芥蒂倍率与「吃醋不加芥蒂」开关。全部为 1 且没有开关时返回 null（与旧楼结果一致）。
// 贪吃鬼：送吃的（礼物类别命中食物词表）或一起吃饭（本楼其有进食、同楼有其好感上升）该次上升加倍。
function characterScale(state, ctx, name, dim, d) {
    const t = (dir) => traitScale(state, ctx.traitCat, name, dim, dir);
    let up = t('up');
    if (dim === '好感' && hasTrait(state, ctx.traitCat, name, '贪吃鬼')) {
        const dined = (ctx.directives || []).some((x) => x.kind === 'stamina' && x.value === '进食' && x.target === name);
        if ((d.kind === 'gift' && isFoodGift(d.value)) || (dined && d.kind === 'favor' && favorSign(d) > 0)) up = clampScale(up * 2);
    }
    const scale = { up, down: t('down'), jealous: dim === '好感' ? traitScale(state, ctx.traitCat, name, '芥蒂', 'jealous') : 1, noGrudge: dim === '好感' && traitFlag(state, ctx.traitCat, name, 'noJealousGrudge') };
    return scale.up === 1 && scale.down === 1 && scale.jealous === 1 && !scale.noGrudge ? null : scale;
}

// 关键事件四档的结算明细（rev ≥ 2）：成功 / 大成功记突破，失败记一条零增量记录，大失败好感与芥蒂各一条并置 flags.keyFumble（下一楼强制事项读它）。
function keyEventOutcome(d, result, character, current, ctx) {
    const gate = result.gate;
    if (gate == null || ctx.rev < 2) return { character, change: result.success ? { dim: '好感', value: `${d.value}突破`, from: gate, to: gate + 1 } : null };
    const check = calcRow(`${d.value} 检定`, `${result.roll} / ${result.target}（${result.tier}）`);
    if (result.success) {
        const bonus = result.bonus || 0;
        const calc = [check, calcRow(`解锁关口 ${gate}`, `→ ${gate + 1}`)];
        if (bonus) calc.push(calcRow('大成功 额外好感', bonus), calcRow('心意槽', '充满'));
        calc.push(calcRow('结果', 1 + bonus));
        return { character, change: { dim: '好感', value: `${d.value}突破${bonus ? '·大成功' : ''}`, from: gate, to: gate + 1 + bonus, calc, ...(bonus ? { heartFrom: Number(current.heart) || 0, heartTo: Number(character.heart) || 0 } : {}) } };
    }
    if (result.fumble) {
        ctx.flags.keyFumble = { target: d.target, event: d.value };
        const [f0, f1] = result.fumble.favor;
        const [g0, g1] = result.fumble.grudge;
        return { character, changes: [
            { dim: '好感', value: `${d.value}大失败`, from: f0, to: f1, calc: [check, calcRow('大失败 好感', f1 - f0), calcRow('结果', f1 - f0)] },
            { dim: '芥蒂', value: `${d.value}大失败`, from: g0, to: g1, calc: [calcRow('大失败 芥蒂', g1 - g0), calcRow('结果', g1 - g0)] },
        ] };
    }
    const label = result.reason === 'extra-step' ? `${d.value}（需再成功一次）` : `${d.value}失败${result.retry ? '（再试）' : ''}`;
    return { character, change: { dim: '好感', value: label, from: gate, to: gate, keep: true, calc: [check, calcRow('结果', 0)] } };
}

// 参与本次结算的特质名：逐个只挂一项特质试算倍率，倍率不为 1 的即算参与。
function scaleTagsOf(state, ctx, d) {
    const dimKey = d.kind === 'favor' || d.kind === 'gift' ? '好感' : d.dim || null;
    if (!dimKey) return [];
    const dir = d.kind === 'gift' || d.value === '上升' || (d.kind === 'favor' && favorSign(d) > 0) ? 'up' : 'down';
    const own = ctx.traitCat && ctx.traitCat.traits && ctx.traitCat.traits[d.target];
    const names = [];
    for (const t of listTraits(ctx.traitCat, d.target)) {
        if (isComboKey(t.id) || !own) continue;
        const one = { ...ctx.traitCat, traits: { [d.target]: { [t.id]: own[t.id] } } };
        if (traitScale(state, one, d.target, dimKey, dir) !== 1 || (d.value === '吃醋' && traitScale(state, one, d.target, '芥蒂', 'jealous') !== 1)) names.push((getTraitDef(t.id) || {}).name || t.id);
    }
    return names;
}

function applyCharacterDirective(current, d, state, ctx) {
    const bonus = ctx.critTarget && (ctx.critTarget === '*' || ctx.critTarget === d.target) ? 1 : 0;
    // 困难档只管好感的普通加分；送礼自有递减规则，信任等其他维度不受影响。
    const baseLimits = d.kind === 'gift' || (d.dim && d.dim !== '好感') ? favorLimits('normal') : ctx.limits;
    // 特质（rev ≥ 2）：倍率大于 1 时单楼与每日上限同乘倍率。没有特质时 scale 为 null。
    const dimKey = d.kind === 'favor' || d.kind === 'gift' ? '好感' : d.dim || null;
    const scale = ctx.rev >= 2 && dimKey ? characterScale(state, ctx, d.target, dimKey, d) : null;
    const up = scale ? scale.up : 1;
    const limits = scale && up > 1 ? { ...baseLimits, floor: amplifyLimit(baseLimits.floor, up), daily: amplifyLimit(baseLimits.daily, up) } : baseLimits;
    const room = (dim) => limits.floor + bonus - (ctx.floorGained.get(`${d.target}|${dim}`) || 0);
    const coef = Number(current.coef) || 1;
    if (d.kind === 'gift') return applyGift(current, d.value, { random: ctx.random, coef, floorRoom: room('好感'), scale, ...(scale && up > 1 ? { dailyMax: limits.daily } : {}) });
    if (d.kind === 'event') {
        const roll = () => resolveCheck(ctx.engine, state, { actor: PROTAGONIST, skill: keyEventSkill(ctx.engine, state, d.value, ctx.rev), toward: d.target }, ctx.random);
        const grades = ctx.rev >= 2;
        const { character, result } = applyKeyEvent(current, d.value, { roll, random: ctx.random, extraGates: ctx.rev >= 2 ? extraGatesOf(state, ctx.traitCat, d.target) : [], grades, day: state.clock.day });
        ctx.events.push({ target: d.target, ...result });
        return keyEventOutcome(d, result, character, current, ctx);
    }
    if (d.kind === 'favor' && FAVOR_TIERS.includes(ctx.tier) && d.value === '吃醋') {
        return applyJealousy(current, d, { tier: ctx.tier, random: ctx.random, coef, floorRoom: room('好感'), dailyMax: limits.daily, rev: ctx.rev, scale });
    }
    if (d.kind === 'dim' && d.dim === '信任' && FAVOR_TIERS.includes(ctx.tier)) {
        const r = applyTrustTier(current, d, { coef, scale, floorRoom: amplifyLimit(TRUST_FLOOR_MAX, up) + bonus - (ctx.floorGained.get(`${d.target}|信任`) || 0) });
        return r;
    }
    // 芥蒂分强度只对带 strengthRev 的新楼生效；旧楼走 applyDim。
    if (d.kind === 'dim' && d.dim === '芥蒂' && ctx.rev >= 1 && FAVOR_TIERS.includes(ctx.tier)) return applyGrudgeTier(current, d, { scale });
    if (d.kind === 'favor' && FAVOR_TIERS.includes(ctx.tier)) {
        return applyFavorTier(current, d, { tier: ctx.tier, random: ctx.random, coef, floorRoom: room('好感'), dailyMax: limits.daily, rev: ctx.rev, scale });
    }
    return applyDim(current, d.dim, d.value, { random: ctx.random, coef, floorRoom: room(d.dim), dailyMax: limits.daily, scale });
}

// 起始关系：只对还没建档、或建档后各维度仍是初始 0 的角色生效，好感直接定到该档初值；低于初值的关口视为已过。
function settleStartRelations(before, directives, ctx) {
    let state = before;
    for (const d of directives) {
        if (d.kind !== 'start') continue;
        const existing = state.characters[d.target];
        // rev ≥ 2：标记（随身、无实体、亲人）不改数值，不受「已建档」限制；起始关系「恋人」同时判为恋爱对象。
        if (ctx.rev >= 2 && (d.marks || d.kin)) {
            const cur = existing || createCharacter(state.clock.day, { nsfw: ctx.nsfw });
            const patch = {};
            for (const mark of d.marks || []) patch[START_MARKS[mark]] = true;
            if (d.kin) patch.kin = true;
            state = withCharacter(state, d.target, { ...cur, ...patch });
        }
        const pristine = !existing || (Object.values(existing.dims || {}).every((v) => !Number(v)) && !(existing.unlocked || []).length);
        if (!pristine) { ctx.diagnostics.push({ code: 'stat-start-ignored', name: d.target }); continue; }
        const base = state.characters[d.target] || createCharacter(state.clock.day, { nsfw: ctx.nsfw });
        const rel = ctx.rev >= 2 && d.value === '陌生' && hasTrait(state, ctx.traitCat, d.target, '社牛') ? '熟人' : d.value;
        const preset = Object.fromEntries(Object.entries(START_DIMS[rel] || {}).filter(([key]) => key !== '欲望' || ctx.nsfw));
        const mods = d.mods || [];
        const offsets = startFixOffsets(mods);
        for (const [key, delta] of Object.entries(offsets)) preset[key] = clamp((preset[key] || 0) + delta, dimMin(key), DIM_MAX);
        const label = `起始关系·${[rel, ...mods].join('+')}`;
        for (const [key, to] of Object.entries(preset)) {
            if (to) ctx.changes.push({ source: 'tag', target: d.target, key, from: 0, to, note: label });
        }
        const to = preset.好感 ?? START_FAVOR[rel] ?? 0;
        state = withCharacter(state, d.target, {
            ...base,
            dims: { ...base.dims, ...preset },
            unlocked: FAVOR_GATES.filter((gate) => gate < to).map(gateKey),
            lastSeenDay: state.clock.day,
            ...(ctx.rev >= 2 && d.value === '恋人' ? { romance: true } : {}),
            ...(Object.keys(offsets).length ? { startFix: { ...(base.startFix || {}), ...Object.fromEntries(Object.keys(offsets).map((k) => [k, true])) } } : {}),
        });
        if (ctx.rev >= 2) state = attachOpeningRels(state, d.target, mods, { offsets });
    }
    return state;
}

// 开局修正标签：同一角色的信任、芥蒂各只修正一次（startFix 记已用），之后要变化走普通 trust/grudge 标签。
function settleStartFix(before, directives, ctx) {
    let state = before;
    for (const d of directives) {
        if (d.kind !== 'startfix') continue;
        const cur = state.characters[d.target] || createCharacter(state.clock.day, { nsfw: ctx.nsfw });
        if (cur.startFix && cur.startFix[d.dim]) { ctx.diagnostics.push({ code: 'stat-startfix-used', name: d.target, dim: d.dim }); continue; }
        const from = Number(cur.dims[d.dim]) || 0;
        const to = clamp(from + START_FIX_VALUE[d.dim][d.value], dimMin(d.dim), DIM_MAX);
        if (to !== from) ctx.changes.push({ source: 'tag', target: d.target, key: d.dim, from, to, note: `开局修正·${d.dim}（${d.value}）` });
        state = withCharacter(state, d.target, { ...cur, dims: { ...cur.dims, [d.dim]: to }, startFix: { ...(cur.startFix || {}), [d.dim]: true } });
    }
    return state;
}

export const MANUAL_DIMS = Object.freeze(['好感', '信任', '了解', '芥蒂', '欲望']);
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
            if (!Number.isFinite(v) || (key === '欲望' && !nsfw)) continue;
            const to = clamp(Math.round(v), dimMin(key), DIM_MAX);
            const from = Number(cur.dims[key]) || 0;
            if (to === from) continue;
            patch[key] = to;
            changes.push({ source: 'manual', target: name, key, from, to, note: '手动修改' });
        }
        if (dims.bars) next = applyManualBars(next, name, dims.bars, changes);
        // 起始关系补填出「恋人」：同时记为恋爱对象（已明确设过的不改）。
        if (dims.romance === true && next.characters[name].romance === undefined) next = withCharacter(next, name, { ...next.characters[name], romance: true });
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
        // 相安 / 同心：本楼在场的其他人全是其伙伴时，不再因对方吃醋（吃醋标签跳过）。
        if (ctx.rev >= 2 && d.kind === 'favor' && d.value === '吃醋' && state.characters[d.target]) {
            const partners = pairPartnersOf(state, d.target);
            const others = (Array.isArray(ctx.present) ? ctx.present : directives.filter((x) => x.target).map((x) => x.target)).filter((n) => n && n !== d.target && n !== PROTAGONIST);
            if (partners.length && others.length && others.every((n) => partners.includes(n))) { ctx.diagnostics.push({ code: 'stat-jealous-harmony', name: d.target }); continue; }
        }
        const current = state.characters[d.target] || createCharacter(state.clock.day, { nsfw: ctx.nsfw });
        const result = applyCharacterDirective(current, d, state, ctx);
        let { character } = result;
        const tags = ctx.rev >= 2 ? scaleTagsOf(state, ctx, d) : [];
        for (const change of result.changes || [result.change]) {
            // 零增量只在带明细时记（心意槽加了、被关口或日上限截住、关键事件失败），其余照旧不记。
            const heartGain = (Number(change && change.heartTo) || 0) > (Number(change && change.heartFrom) || 0) && !String((change && change.value) || '').startsWith('心意满溢');
            if (!change || (change.to === change.from && !change.keep && !heartGain && !(change.capped && change.calc))) continue;
            // rev ≥ 2：信任下降、芥蒂上升记入近 7 天误会账（含吃醋带来的芥蒂），供 clear 退回。
            if (ctx.rev >= 2 && ((change.dim === '信任' && change.to < change.from) || (change.dim === '芥蒂' && change.to > change.from))) {
                character = { ...character, recentHurts: [...liveHurts(character, state.clock.day), { day: state.clock.day, dim: change.dim, amount: Math.abs(change.to - change.from) }] };
            }
            ctx.changes.push({
                ...withCalc({ source: 'tag', target: d.target, key: change.dim, from: change.from, to: change.to, note: d.constrained ? `${change.value}（检定失败）` : change.value }, { calc: change.calc, capped: change.capped || (d.dropped ? 'merged' : null), dropped: d.dropped, traitTags: change.dim === '好感' || change.dim === d.dim ? tags : null }),
                ...(change.heartTo !== undefined ? { heartFrom: change.heartFrom, heartTo: change.heartTo } : {}),
            });
            const gain = Math.max(0, change.to - change.from);
            // 吃醋带来的芥蒂不占单楼上限；其余增量照旧累计。
            if (gain && d.kind !== 'event' && !(change.dim === '芥蒂' && change.value === JEALOUS_NOTE)) {
                const key = `${d.target}|${change.dim}`;
                ctx.floorGained.set(key, (ctx.floorGained.get(key) || 0) + gain);
            }
        }
        state = withCharacter(state, d.target, { ...character, lastSeenDay: state.clock.day });
    }
    return state;
}

// 亲密消耗体力（第十二节）：每楼按最高一档只扣一次，主角与标签里的每个角色各扣一次；NSFW 关闭或设置为「不消耗」时只解析不结算。
// 当天第一次结算时主角压力下降一次（clock.intimateDay 记日）。必须在 settleBars 之前，体力归零才会触发 forcedRest。
function settleIntimate(state, directives, ctx) {
    const mult = ctx.nsfw ? INTIMATE_MULT[ctx.intimateCost] || 0 : 0;
    // 对象为「群体」（crowd）的只计入主角那份，不建档、不扣他人体力。
    const list = directives.filter((d) => d.kind === 'intimate' && (d.target || d.crowd));
    if (!mult || !list.length) return state;
    const cost = (level) => Math.max(1, Math.round(INTIMATE_BASE[level] * mult));
    const top = INTIMATE_LEVELS[Math.max(...list.map((d) => INTIMATE_LEVELS.indexOf(d.value)))];
    let next = state;
    const hero = next.protagonist.bars;
    const heroStamina = clamp((Number(hero.stamina) || 0) - cost(top), 0, 100);
    // 主角离体时不扣主角体力；rev ≥ 2 起不再固定减压力，压力交给 stress 标签。
    let bars = ctx.detached || heroStamina === hero.stamina ? hero : { ...hero, stamina: heroStamina };
    if (bars !== hero) ctx.changes.push({ source: 'tag', target: '主角', key: 'stamina', from: hero.stamina, to: heroStamina, note: '亲密' });
    if (ctx.rev < 2 && next.clock.intimateDay !== next.clock.day) {
        const stress = clamp((Number(bars.stress) || 0) + STRESS_DELTA.下降, 0, 100);
        if (stress !== bars.stress) {
            ctx.changes.push({ source: 'tag', target: '主角', key: 'stress', from: bars.stress, to: stress, note: '亲密' });
            bars = { ...bars, stress };
        }
        next = withClock(next, { intimateDay: next.clock.day });
    }
    next = withBars(next, bars);
    const seen = new Set();
    for (const d of list) {
        if (!d.target || seen.has(d.target)) continue;
        seen.add(d.target);
        const level = INTIMATE_LEVELS[Math.max(...list.filter((x) => x.target === d.target).map((x) => INTIMATE_LEVELS.indexOf(x.value)))];
        const cur = next.characters[d.target] || createCharacter(next.clock.day, { nsfw: ctx.nsfw });
        const own = barsOf(cur);
        const to = clamp((Number(own.stamina) || 0) - cost(level), 0, 100);
        if (to === own.stamina) continue;
        ctx.changes.push({ source: 'tag', target: d.target, key: 'stamina', from: own.stamina, to, note: '亲密' });
        next = withCharacter(next, d.target, { ...cur, bars: { ...own, stamina: to } });
    }
    return next;
}

// 23 点以后的行动每天额外记一次熬夜；体力归零时标记强制休息，并按入睡处理。
function settleBars(state, directives, hour, ctx) {
    // 主角离体：体力、金钱、伤势冻结，只保留压力。
    const list = directives.filter((d) => BAR_KINDS.has(d.kind) && !d.target && !(ctx.detached && d.kind !== 'stress'));
    let stayedUp = state.clock.stayedUp || list.some((d) => d.kind === 'stamina' && d.value === '熬夜');
    if (isLateHour(hour) && !stayedUp && !ctx.detached) { list.push({ kind: 'stamina', value: '熬夜', late: true }); stayedUp = true; }
    let bars = state.protagonist.bars;
    for (const d of list) {
        const r = ctx.rev >= 2 && d.kind === 'stress' ? stressRev2(bars, d, heroStressScaleOf(state, directives, ctx), traitFlag(state, ctx.traitCat, '主角', 'stressCapMid')) : applyBarDirective(bars, d, ctx.moneyTable, ctx.walletExtra);
        if (r.shortfall) ctx.flags.shortfall = true;
        if (r.change) ctx.changes.push({ source: 'tag', target: '主角', key: r.change.key, from: r.change.from, to: r.change.to, note: d.late ? '23点后熬夜' : d.value });
        bars = r.bars;
    }
    // 已捕捉日期的聊天不强制入睡：只标记体力透支，由提示词交给剧情安排休息。
    // 合成「卷王」（原拼命三郎）：体力为零不进入力竭，记下透支日，次日体力只恢复到上限减一档。
    const overdraw = bars.stamina <= 0 && !ctx.detached && ctx.rev >= 2 && hasTrait(state, ctx.traitCat, '主角', 'combo:卷王');
    if (bars.stamina <= 0 && !ctx.detached && !overdraw) ctx.flags[ctx.dateMode ? 'exhausted' : 'forcedRest'] = true;
    const next = withBars(state, bars);
    const clockPatch = { ...(stayedUp !== state.clock.stayedUp ? { stayedUp } : {}), ...(overdraw ? { overdrawDay: state.clock.day } : {}) };
    return Object.keys(clockPatch).length ? withClock(next, clockPatch) : next;
}

// 角色的生活条：规则同主角，金钱不并入战斗积分（钱包只属于主角）；花费超过余额时不扣并记 shortfall。「受伤」类只影响生命，角色不处理。
function settleNpcBars(state, directives, ctx) {
    let next = state;
    for (const d of directives) {
        if (!BAR_KINDS.has(d.kind) || !d.target || d.kind === 'hurt') continue;
        const cur = next.characters[d.target];
        if (!cur || (d.kind === 'stamina' && d.value === '受伤')) continue;
        const bars = barsOf(cur);
        const r = ctx.rev >= 2 && d.kind === 'stress' ? stressRev2(bars, d, traitScale(next, ctx.traitCat, d.target, '压力', 'up') * (ctx.statusBox ? statusScale(ctx.statusBox.cat, d.target, 'stressUp') : 1), traitFlag(next, ctx.traitCat, d.target, 'stressCapMid')) : applyBarDirective(bars, d, ctx.moneyTable, 0);
        if (r.shortfall) { ctx.diagnostics.push({ code: 'stat-npc-shortfall', name: d.target }); }
        if (r.change) ctx.changes.push({ source: 'tag', target: d.target, key: r.change.key, from: r.change.from, to: r.change.to, note: d.value });
        if (r.bars !== bars) next = withCharacter(next, d.target, { ...cur, bars: r.bars });
    }
    return next;
}

// rev ≥ 2 的压力标签：按转换后的走向增减，带来源时记入来源；特质倍率（脆弱、坚韧、兔系等）只作用于上升，capMid（情绪稳定）把单次上升压到「中」档。
function stressRev2(bars, d, scale = 1, capMid = false) {
    const table = STRESS_STRENGTH_DELTA[d.value];
    const base = (table && table[d.strength]) || STRESS_DELTA[d.value] || 0;
    const scaled = scale !== 1 && base > 0 ? Math.max(1, Math.round(base * scale)) : base;
    const delta = capMid && scaled > STRESS_STRENGTH_DELTA.上升.中 ? STRESS_STRENGTH_DELTA.上升.中 : scaled;
    const next = shiftStress(bars, delta, d.source || null);
    const from = Number(bars.stress) || 0;
    const to = Number(next.stress) || 0;
    return { bars: next, change: to === from ? null : { key: 'stress', from, to } };
}

// 压力满后转换（rev ≥ 2）：break 标签只在极限时生效，否则记诊断丢弃。主角离体时仍可转换（压力不冻结）。
function settleBreaks(state, directives, ctx) {
    let next = state;
    for (const d of directives) {
        if (d.kind !== 'break') continue;
        const hero = !d.target;
        const cur = hero ? null : next.characters[d.target];
        if (!hero && !cur) continue;
        const bars = hero ? next.protagonist.bars : barsOf(cur);
        const r = applyBreak(bars, d.value);
        if (r.reason) { ctx.diagnostics.push({ code: r.reason, name: hero ? PROTAGONIST : d.target, value: d.value }); continue; }
        ctx.changes.push({ source: 'tag', target: hero ? '主角' : d.target, ...r.change });
        next = hero ? withBars(next, r.bars) : withCharacter(next, d.target, { ...cur, bars: r.bars });
    }
    return next;
}

// 主角压力上升的倍率：自身特质连乘（脆弱、坚韧等）；本楼有「温柔疏离」的人做出失望类事件时再加倍；整体夹在 ×0.5–×2。
function heroStressScaleOf(state, directives, ctx) {
    let scale = traitScale(state, ctx.traitCat, '主角', '压力', 'up') * (ctx.statusBox ? statusScale(ctx.statusBox.cat, '主角', 'stressUp') : 1);
    for (const d of directives) {
        if (d.kind !== 'favor' || favorSign(d) >= 0 || !state.characters[d.target]) continue;
        if (hasTrait(state, ctx.traitCat, d.target, '温柔疏离')) { scale *= 2; break; }
    }
    return clampScale(scale);
}

// 每楼末尾：更新主角与角色的压力满格楼数，芥蒂、欲望到 100 的角色定型（宿仇、痴迷）。只对 rev ≥ 2。
function trackStrain(state, before) {
    let next = withBars(state, trackStressPeak(state.protagonist.bars, before.protagonist.bars.stress));
    for (const [name, cur] of Object.entries(next.characters)) {
        const fixed = markFixations(cur);
        const own = fixed.bars && typeof fixed.bars === 'object' ? fixed.bars : null;
        const prev = before.characters[name] && before.characters[name].bars;
        const tracked = own ? trackStressPeak(own, prev && prev.stress !== undefined ? prev.stress : null) : own;
        const out = tracked !== own ? { ...fixed, bars: tracked } : fixed;
        if (out !== cur) next = withCharacter(next, name, out);
    }
    return next;
}

// 以日期为准的过天：只看日期变化。睡觉标签只回体力；本楼没有日期时沿用上一个日期，不重复过天。
// 日结算与时间跳跃的公共参数：rev ≥ 2 才带悟性、随身标记、在场名单与恋爱名单，其余沿用旧结算。
function dayOpts(ctx) {
    const base = { random: ctx.random, changes: ctx.changes, skillValueOf: ctx.skillValueOf, statusBox: ctx.statusBox };
    return ctx.rev >= 2 ? { ...base, rev: ctx.rev, aptitudeOf: ctx.aptitudeOf, traits: ctx.traits, nsfw: ctx.nsfw, present: ctx.present, romanceSeen: ctx.romanceSeen, env: { weather: ctx.weather, place: ctx.place, fx: ctx.fx, words: ctx.words } } : base;
}

function settleDateClock(state, directives, hour, ctx) {
    const last = state.clock.lastDate;
    const judge = judgeDateAdvance(last, ctx.dateKey, ctx.rev >= 2 ? SKIP_DAYS_MAX : SKIP_DAYS_MAX_LEGACY);
    let next;
    if (judge.advance) {
        next = judge.days === 1
            ? settleDay(state, dayOpts(ctx))
            : settleSkip(state, judge.days, dayOpts(ctx));
        if (judge.capped) ctx.flags.skipCapped = true;
        ctx.flags.dayAdvance = 'date';
    } else {
        next = directives.some((d) => d.kind === 'sleep') ? settleRest(state, { changes: ctx.changes, frozen: ctx.detached }) : state;
        const floors = next.clock.floorsSinceDay + 1;
        if (floors >= SOFT_DAY_FLOORS) { next = settleSoftDay(next); ctx.flags.softDay = true; }
        else next = withClock(next, { floorsSinceDay: floors });
    }
    next = withClock(next, { lastDate: ctx.dateKey || last });
    return Number.isInteger(hour) ? withClock(next, { lastHour: hour }) : next;
}

function settleClock(state, narration, directives, hour, ctx) {
    if (ctx.dateMode) return settleDateClock(state, directives, hour, ctx);
    const all = ctx.flags.forcedRest ? [...directives, { kind: 'sleep', forced: true }] : directives;
    const advance = detectDayAdvance({ narration, directives: all, lastHour: state.clock.lastHour, hour });
    let next;
    if (advance && advance.kind === 'skip') {
        next = settleSkip(state, advance.days, dayOpts(ctx));
        if (advance.capped) ctx.flags.skipCapped = true;
    } else if (advance) {
        next = settleDay(state, dayOpts(ctx));
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
    // 特质与恩仇的奖惩骰（rev ≥ 2 由运行时传入 traitEdge）；用掉的「欠你人情」记在 ctx.favorUsed，稍后清除。
    const te = typeof opts.traitEdge === 'function' ? opts.traitEdge(before, { skill, toward: against }) : null;
    if (te && te.favorFrom) ctx.favorUsed = te.favorFrom;
    const request = { actor: PROTAGONIST, skill, difficulty: tag.difficulty, against, opposedSkill, edge: te ? te.edge : 0, floor: te ? te.floor : 0, source: 'roll' };
    const first = resolveCheck(engine, before, { ...request, raw }, null);
    return te ? luckyReroll(before, ctx.traitCat, first, () => resolveCheck(engine, before, request, ctx.random)) : first;
}

// opts：{ random, hour, nsfw, resolveCharacter, moneyTable, walletExtra（战斗侧积分，并入金钱判断）, engine, check, rollPairs, preroll, storyChecks, noBattle, catalog, settings, floor }
// fameBars：本聊天开的声望条 [{ name, kind }]（聊天级目录），没开或旧楼（rev < 2）不结算声望。
// check：本楼已定的检定（选项、输入匹配、手动掷骰）；没有时按 roll 标签与楼内骰序 rollPairs 重算。
// storyChecks：正文 igs-check 的回放结果（主角的才会打成长勾；社交检定大成功可触发突破加成）。
// favorTier：本楼按哪一档好感成长结算（vivid / normal / hard），写进 meta.favorTier，重算同一楼时沿用。
// strengthRev：新楼写 1（芥蒂四档、压力三档、普通困难读强度、好感新方向词）；缺省即旧规则，旧楼重算结果不变。moodGroups：当前情绪分组，好感方向词的兜底识别用。
// intimateCost：亲密消耗体力档位（off / light / standard / heavy），写进 meta；旧楼没有该字段即不结算亲密体力。
// favorMode：旧楼没有 favorTier 时的旧档位（缺省按旧普通，'hard' 按旧困难＝单楼 1、每日 4）。
// npcChecks：正文检定里 NPC 作为一方的 [{ actor, skill }]，用到的技能给 NPC 打成长勾。
// noBattle：战斗扩展接管战斗时为真，丢弃 battle 标签。
// extraDirectives：由战报楼合成的 challenge 指令与卡牌战斗战报指令（kind: battle, fromReport），不经 AI 标签解析，不受 noBattle 影响。
export function settleFloorText(before, text, opts = {}) {
    const { random, nsfw = false, resolveCharacter, moneyTable = DEFAULT_MONEY_TABLE } = opts;
    // favorTier（vivid / normal / hard）优先；没有时按旧 favorMode 还原为 legacy（旧普通）或 legacyHard（旧困难），保证旧楼重算不变。
    const tier = FAVOR_TIERS.includes(opts.favorTier) ? opts.favorTier : legacyTierOf(opts.favorMode);
    // strengthRev 只在新三档下生效；没有 favorTier 的旧楼一律按旧规则。
    // rev 2 起：悟性、顿悟、交心、误会解除、主角离体、随身与无实体、恋爱判定与十年跳跃上限等；旧楼（0、1）结果不变。
    const rev = !FAVOR_TIERS.includes(tier) ? 0 : Number(opts.strengthRev) >= 2 ? 2 : Number(opts.strengthRev) >= 1 ? 1 : 0;
    const parsed = parseStatDirectives(text, { rev, moodGroups: opts.moodGroups });
    const diagnostics = [...parsed.diagnostics];
    // 日期、时间捕捉：正则直接对楼层原文执行；非法正则记诊断并当作未填写。显式传入的 opts.hour 优先。
    const dateRegex = compileCaptureRegex(opts.dateRegex);
    const timeRegex = compileCaptureRegex(opts.timeRegex);
    if (dateRegex.invalid) diagnostics.push({ code: DATE_REGEX_INVALID });
    if (timeRegex.invalid) diagnostics.push({ code: TIME_REGEX_INVALID });
    const dateKey = captureFirst(text, dateRegex.regex);
    const hour = Number.isInteger(opts.hour) ? opts.hour : parseHour(captureFirst(text, timeRegex.regex));
    const narration = narrationOf(text);
    const resolve = resolveCharacter || ((name) => (Object.hasOwn(before.characters, name) ? name : null));
    const engine = opts.engine || createEngine();
    const intimateCost = Object.hasOwn(INTIMATE_MULT, opts.intimateCost) ? opts.intimateCost : null;
    const traits = opts.traits && typeof opts.traits === 'object' ? opts.traits : {};
    const traitCat = traitCatalogOf(traits, nsfw);
    // 主角离体（rev ≥ 2）：本楼最后一个 hero 标签定状态，没有标签沿用存档。离体时冻结体力、金钱、伤势与主角检定。
    const heroTag = rev >= 2 ? [...parsed.directives].reverse().find((d) => d.kind === 'hero') : null;
    const detached = rev >= 2 && (heroTag ? heroTag.value === '离体' : before.protagonist.detached === true);
    const ctx = { rev2: rev >= 2, detached, traits, traitCat, romanceSeen: Array.isArray(opts.romanceSeen) ? opts.romanceSeen : [], aptitudeOf: typeof opts.aptitudeOf === 'function' ? opts.aptitudeOf : () => '平庸', random, nsfw, dateKey, dateMode: Boolean(dateRegex.regex && (dateKey || (before.clock && before.clock.lastDate))), moneyTable, tier, rev, intimateCost, limits: favorTierLimits(tier, rev), walletExtra: Number(opts.walletExtra) || 0, present: Array.isArray(opts.present) ? opts.present.filter((n) => !hasTrait(before, traitCat, n, '已故')) : undefined, weather: String((opts.env && opts.env.weather) || ''), time: String((opts.env && opts.env.time) || ''), place: String((opts.env && opts.env.place) || ''), fx: Array.isArray(opts.env && opts.env.fx) ? opts.env.fx : [], bondEvents: Array.isArray(opts.bondEvents) ? opts.bondEvents : [], reviewEvents: Array.isArray(opts.reviewEvents) ? opts.reviewEvents : [], engine, changes: [], diagnostics, events: [], flags: {}, floorGained: new Map(), newSkills: [], critTarget: null, skillValueOf: (st, name, skill) => profileOf(engine, st, name, skill).value };
    const rollTag = detached ? null : parsed.directives.find((d) => d.kind === 'roll') || null;
    let check = detached ? null : opts.check || null;
    let pendingRoll = null;
    if (!check && rollTag) {
        const raw = rawForRollTag(text, opts, engine.ruleset.ID);
        if (raw) check = checkFromRollTag(before, rollTag, raw, { ...opts, resolveTarget: resolve }, ctx);
        else pendingRoll = { skill: rollTag.skill, difficulty: rollTag.difficulty, against: rollTag.against || null, opposedSkill: rollTag.opposedSkill || null, attribute: rollTag.attribute || null };
    }
    const storyChecks = detached ? [] : (Array.isArray(opts.storyChecks) ? opts.storyChecks : []).filter((item) => item && item.skill);
    const lead = check || storyChecks.find((item) => item.social) || null;
    ctx.checkSuccess = check ? Boolean(check.success) : storyChecks.length ? Boolean(storyChecks[0].success) : undefined;
    if (lead && lead.social && lead.success && lead.ladder === 'crit') ctx.critTarget = lead.against || lead.toward || '*';
    const merged = [...parsed.directives.filter((d) => d.kind !== 'roll'), ...fallbackDirectives(narration, parsed.directives, { frozen: detached })];
    // 离体时主角不在身体里：战斗与打工不结算。
    const allowed = (opts.noBattle ? merged.filter((d) => d.kind !== 'battle') : merged).filter((d) => !(detached && (d.kind === 'battle' || d.kind === 'work')));
    if (allowed.length !== merged.length) diagnostics.push({ code: 'stats-battle-skipped-combat' });
    const extra = (Array.isArray(opts.extraDirectives) ? opts.extraDirectives : []).filter((d) => d && (d.kind === 'challenge' || (d.kind === 'battle' && d.fromReport === true)));
    // 已登记、表格导入与手动登记的名字不拦（用户确定要建的就建）。
    const known = { ...(opts.seedCharacters || {}), ...(opts.manual && typeof opts.manual === 'object' ? opts.manual : {}), ...before.characters };
    const resolved = resolveTargets(allowed, resolve, diagnostics, { rev, known });
    // 无实体的角色（起始关系标记、角色标记或聊天级勾选）：带其名的体力、亲密标签丢弃。
    const bodiless = new Set();
    if (rev >= 2) {
        for (const name of new Set([...Object.keys(before.characters), ...Object.keys(traits)])) if (hasTrait(before, traitCat, name, 'bodiless')) bodiless.add(name);
        for (const d of resolved) if (d.kind === 'start' && (d.marks || []).includes('无实体')) bodiless.add(d.target);
    }
    const kept = bodiless.size ? resolved.filter((d) => {
        if ((d.kind === 'stamina' || d.kind === 'intimate') && d.target && bodiless.has(d.target)) { diagnostics.push({ code: 'stat-bodiless', name: d.target, kind: d.kind }); return false; }
        return true;
    }) : resolved;
    // 已故（rev ≥ 2）：不再接收关系标签（好感、维度、礼物、事件、亲密、体力），丢弃并记诊断；点名不算在场（上面已从 present 剔除）。
    const RELATION_KINDS = new Set(['favor', 'dim', 'gift', 'event', 'intimate', 'stamina', 'clear', 'insight', 'romance']);
    const alive = rev >= 2 ? kept.filter((d) => {
        if (!(d.target && RELATION_KINDS.has(d.kind)) || !hasTrait(before, traitCat, d.target, '已故')) return true;
        diagnostics.push({ code: 'stat-deceased', name: d.target, kind: d.kind });
        return false;
    }) : kept;
    // 附身（rev ≥ 2）：体力记在宿主身上（宿主取自角色档案 host 字段，宿主为主角时记主角）。
    const hosted = rev >= 2 ? alive.map((d) => {
        if (d.kind !== 'stamina' || !d.target || !hasTrait(before, traitCat, d.target, '附身')) return d;
        const host = before.characters[d.target] && before.characters[d.target].host;
        if (!host || host === d.target || (host !== PROTAGONIST && !before.characters[host])) return d;
        const { target, ...rest } = d;
        return host === PROTAGONIST ? rest : { ...rest, target: host };
    }) : alive;
    const deduped = dedupeDims(capMajorStrength(hosted, tier, rev), tier, rev);
    const directives = [...constrainFavor(rev >= 2 ? dropGrudgeWithJealousy(deduped, diagnostics) : deduped, lead, tier, rev), ...extra];
    // 数据库表格里的人物在本楼首次建档：沿用表格当时的好感、信任、了解，之后只按正文标签变化。
    let state = before;
    if (opts.seedCharacters) {
        const fresh = Object.fromEntries(Object.entries(opts.seedCharacters).filter(([name]) => !state.characters[name]));
        const seeded = [];
        state = applyManualRelations(state, fresh, seeded, { nsfw });
        for (const row of seeded) ctx.changes.push({ ...row, source: 'register', note: '数据库表格登记' });
    }
    ctx.directives = directives;
    // 状态（B 批）：存在 catalog.statuses，本楼的改动经 meta.statuses 交给运行时写回；box 整体替换、不原地改传入的 catalog。
    ctx.statusBox = { cat: { ...(opts.catalog || {}), traits, nsfw }, cycles: ctx.dateMode };
    // 本楼 event 标签里的特质事件并进 reviewEvents（与副模型评定的去重）；meta 只记副模型那份，重算时才不会带上旧正文的事件。
    const modelReview = ctx.reviewEvents;
    if (rev >= 2) {
        const seen = new Set(modelReview.map((e) => `${e.name}|${e.type}`));
        const tagged = directives.filter((d) => d.kind === 'traitEvent' && !TRAIT_WORD_EVENTS.includes(d.value) && !seen.has(`${d.target}|${d.value}`) && seen.add(`${d.target}|${d.value}`)).map((d) => ({ type: d.value, name: d.target, dir: 'ta' }));
        if (tagged.length) ctx.reviewEvents = [...modelReview, ...tagged];
    }
    ctx.lastSeen = Object.fromEntries(Object.entries(before.characters).map(([name, c]) => [name, Number(c.lastSeenDay) || 0]));
    // 已用掉的「欠你人情」奖励骰：本楼检定带它就清除该状态（运行时给的检定在 check.favorFrom 上）。
    const favorUsed = rev >= 2 ? (ctx.favorUsed || (check && check.favorFrom) || null) : null;
    if (favorUsed) state = consumeFavor(state, favorUsed);
    if (rev >= 2 && check && check.reroll) state = withClock(state, { luckyUsed: true });
    if (rev >= 2) state = settleHero(state, directives);
    state = markGrowth(state, check);
    for (const item of storyChecks) state = markGrowth(state, item);
    state = markCheckOpponents(state, check);
    for (const item of Array.isArray(opts.npcChecks) ? opts.npcChecks : []) state = markNpcGrowth(state, resolve(item.actor), item.skill);
    state = settleStartRelations(state, directives, ctx);
    state = settleStartFix(state, directives, ctx);
    if (rev >= 2) { const moon = moonlightJealousy(state, directives, ctx); state = moon.state; directives.push(...moon.directives); }
    state = settleCharacters(state, directives, ctx);
    if (rev >= 2) { state = settleRomance(state, directives); state = settleClear(state, directives, ctx); }
    state = settleGrowTags(state, directives, ctx);
    if (rev >= 2) state = settleInsight(state, directives, ctx);
    state = settleCombat(state, directives, ctx);
    state = settleIntimate(state, directives, ctx);
    state = settleBars(state, directives, hour, ctx);
    state = settleNpcBars(state, directives, ctx);
    if (rev >= 2) state = settleBreaks(state, directives, ctx);
    // 特质的事件类联动（抖M、抖S、护短、熊系、包容、猫系）在生活条结算之后，主角压力以本楼结算后的值为准。
    if (rev >= 2) state = settleTraitTags(state, directives, ctx);
    // 特质雷点：特质钩子之后、声望与过天之前；已踩的雷点经 meta.landmines 交运行时写进 catalog.landmineKnown，强制事项走 flags.landmine。
    let mines = null;
    if (rev >= 2) {
        mines = settleLandmines(state, before, directives, ctx, (name, id) => hasTrait(state, traitCat, name, id));
        state = mines.state;
        if (mines.mandate) ctx.flags.landmine = mines.mandate;
    }
    // 声望（rev ≥ 2，且本聊天开了声望条）：标签结算在过天之前，过了几天就按性质自然变化几天；刚归零或满格记强制事项。
    const fameBars = rev >= 2 ? sanitizeFameBars(opts.fameBars) : [];
    const fameBefore = state;
    if (fameBars.length) state = settleFameTags(state, directives, fameBars, { changes: ctx.changes, diagnostics, resolve });
    const dayBefore = state.clock.day;
    // 不眠：特质钩子只记标记，这里取剔除兜底入睡后的副本再过天，不改 directives 本身。
    state = settleClock(state, narration, ctx.dropFallbackSleep ? directives.filter((d) => !(d.kind === 'sleep' && d.fallback === true)) : directives, hour, ctx);
    // 自然回血（D 批，rev ≥ 2）：按楼每个 AI 楼一次，按天与时间跳跃按过去的天数一次算；写回交给运行时（meta.heal）。
    const healed = rev >= 2 ? settleNaturalHeal(state, { settings: opts.settings, engine, traitCat, present: ctx.present, days: state.clock.day - dayBefore, detached, statusBox: ctx.statusBox, changes: ctx.changes }) : [];
    // 本楼的状态标签在过天之后结算：同楼新挂的状态不会被本楼的过天或跳跃立刻摘掉。
    if (rev >= 2) settleStatusDirectives(ctx.statusBox, directives, { day: state.clock.day, floor: opts.floor, resolve, changes: ctx.changes, diagnostics });
    // E1：系统自动挂摘（心情很好、醉酒/宿醉、手头紧、犯瘾、信物）；成瘾接触日经 meta.touch 交运行时写 counters。
    if (rev >= 2) {
        const auto = autoStatuses(state, ctx.statusBox, { day: state.clock.day, floor: opts.floor, narration, directives, walletExtra: opts.walletExtra, changes: ctx.changes });
        if (Object.keys(auto.touch).length) ctx.touch = auto.touch;
    }
    if (fameBars.length) {
        const passed = state.clock.day - dayBefore;
        if (passed > 0) state = driftFame(state, fameBars, passed, ctx.changes, passed > 1 ? `跳过${passed}天` : '日结算');
        const fameNotes = fameMandates(fameBefore, state, fameBars);
        if (fameNotes.length) ctx.flags.fame = fameNotes;
    }
    if (opts.manual) state = applyManualRelations(state, opts.manual, ctx.changes, { nsfw });
    if (rev >= 2) state = trackStrain(state, before);
    const meta = { diagnostics, events: ctx.events, flags: ctx.flags };
    if (opts.manual && Object.keys(opts.manual).length) meta.manual = opts.manual;
    if (dateKey) meta.dateKey = dateKey;
    if (Number.isInteger(hour)) meta.hour = hour;
    if (check) meta.check = check;
    if (storyChecks.length) meta.checks = storyChecks.map((item) => ({ ruleset: item.ruleset, actor: item.actor, skill: item.skill, dc: item.dc, difficulty: item.difficulty, roll: item.roll ?? item.die, total: item.total, tier: item.tier, success: item.success }));
    if (pendingRoll) meta.pendingRoll = pendingRoll;
    if (ctx.newSkills.length) meta.newSkills = ctx.newSkills;
    if (ctx.bondEvents.length) meta.bondEvents = ctx.bondEvents;
    if (modelReview.length) meta.reviewEvents = modelReview;
    if (rollTag) meta.rollTag = { skill: rollTag.skill, difficulty: rollTag.difficulty };
    if (FAVOR_TIERS.includes(tier)) meta.favorTier = tier;
    if (rev) meta.strengthRev = rev;
    if (ctx.statusBox.cat.statuses !== (opts.catalog || {}).statuses) meta.statuses = ctx.statusBox.cat.statuses || {};
    if (ctx.statusBox.cat.cycles !== (opts.catalog || {}).cycles) meta.cycles = ctx.statusBox.cat.cycles || {};
    if (ctx.touch) meta.touch = ctx.touch;
    if (mines && mines.known.length) meta.landmines = mines.known;
    if (healed.length) meta.heal = healed;
    // 离体楼标记：运行时据此跳过生命类标签（战斗账本伤势）扫描。
    if (detached) meta.flags = { ...meta.flags, detached: true };
    else if (tier === 'legacyHard') meta.favorMode = 'hard';
    // NSFW 关闭时不记档位：日后开启 NSFW 重算该楼，没有字段即不扣体力。
    if (intimateCost && nsfw) meta.intimateCost = intimateCost;
    return { state, changes: ctx.changes, meta };
}
