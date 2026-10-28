// 非人对手战斗演出的纯模型：给既有战斗时间轴的事件补上「非人」标注、插入二阶段事件；不操作 DOM、不带任何画面数值。
// 只有对手（或出手者 / 目标）是已确认的非人角色时才改动计划；人类与待定档（auto）对手原样返回同一个 plan 对象。
import { downCountFor, foeBaseName, isPlayerName, hasGroupSuffix, isFrenzyName, matchFoeName, splitFoeNames } from '../../scene/creature-battle.js';

// 二阶段登场占一个事件的时长；其后事件顺延。
export const CREATURE_BATTLE_TIMING = Object.freeze({ phase: 2300, phaseGap: 200 });
// 同屏复制的杂兵身影数（含原身）：小型 3 个，其余 2 个；低画质一律 2 个。
export const GROUP_BODY_COUNT = Object.freeze({ small: 3, medium: 3, large: 2, giant: 2 });
export const GROUP_BODY_MAX = 3;

const text = (value) => String(value == null ? '' : value).trim();

// 战斗页里涉及的非人角色摘要；profile 为 confirmedCreatureOf 的结果。
export function creatureSummary(name, profile, extra = {}) {
    return {
        name: text(name), size: profile.size, form: profile.form, anchor: profile.anchor, temp: profile.temp === true, ...extra,
        group: profile.group === true || extra.group === true,
    };
}

// 消散方式：悬浮与半人形化烟淡出，大型 / 巨型落地沉入地面，其余（小中型落地兽）碎散。
export function disperseKindOf(summary) {
    if (!summary) return 'smoke';
    if (summary.anchor === 'float' || summary.form === 'humanoid') return 'smoke';
    if (summary.size === 'large' || summary.size === 'giant') return 'sink';
    return 'shatter';
}

export function groupBodyCount(summary, low = false) {
    if (!summary || summary.group !== true) return 1;
    if (low) return 2;
    return GROUP_BODY_COUNT[summary.size] || 2;
}

// 本页之前已经倒下 / 被收服、不该再上台的对手：非群怪倒一次就走，群怪倒完全部身影才走。
export function foeIsDown(fx, raw, summary) {
    const down = downCountFor(fx, raw);
    return down > 0 && down >= groupBodyCount(summary);
}

// 音效名：kind 为 roar（咆哮）| hurt（受创）| fade（消散）；体型不认识时按中型。音效本体在 creature-battle-sfx.js（那边依赖音频总线，这里只放纯函数）。
const SFX_SIZES = ['small', 'medium', 'large', 'giant'];
export function creatureSfxKind(kind, size) {
    return `creature-${kind}-${SFX_SIZES.includes(size) ? size : 'medium'}`;
}

function scaled(ms, scale) { return Math.round(ms * scale); }

// plan：planBattleFx 的结果；fx：本页战斗数据（battle / battleOver / phases / hits）。
// opts：creatureOf(名字) → 已确认非人的档案或 null；keyOf 别名归一；foes：[{ name, image, tiers }]（多对手）；
// foeImage / foeTiers：单对手的立绘与三档图；holdScale：停留倍率；userName：主角名。
export function annotateCreatureBattle(plan, fx, { creatureOf, keyOf = null, foes = [], foeImage = '', foeTiers = null, holdScale = 1, userName = '' } = {}) {
    if (!plan || typeof creatureOf !== 'function' || !fx) return plan;
    const canon = (name) => {
        const value = text(name);
        let key = '';
        if (value && typeof keyOf === 'function') { try { key = text(keyOf(value)); } catch (error) { key = ''; } }
        return key || value;
    };
    // 档案与主名：名字带「们 / 群 / 众」时先按原名查，再按去掉后缀的本名查。
    const resolveOf = (name) => {
        const value = text(name);
        if (!value) return null;
        try {
            let key = canon(value);
            let profile = creatureOf(key) || null;
            if (!profile && hasGroupSuffix(value)) { key = canon(foeBaseName(value)); profile = creatureOf(key) || null; }
            return profile ? { name: key, profile } : null;
        } catch (error) { return null; }
    };
    const profileOf = (name) => { const hit = resolveOf(name); return hit ? hit.profile : null; };
    const nameOf = (name) => { const hit = resolveOf(name); return hit ? hit.name : canon(name); };
    const source = fx.battle || fx.battleOver || null;
    const foeNames = splitFoeNames(source && source.foe);
    const scale = Number.isFinite(Number(holdScale)) && Number(holdScale) > 0 ? Number(holdScale) : 1;
    // 本页二阶段的名字（空串展开为全部对手）：这些对手在本页开头仍是原档位，由演出事件切到狂暴。
    const phases = Array.isArray(fx.phases) ? fx.phases : [];
    const phaseNames = phases.flatMap((p) => (text(p && p.name) ? [text(p.name)] : foeNames));
    const frenzyList = source && Array.isArray(source.frenzy) ? source.frenzy : [];
    const resolveName = (name) => matchFoeName(name, foeNames) || text(name);
    const baseFrenzy = frenzyList.filter((name) => !phaseNames.some((phased) => resolveName(phased) === resolveName(name)));
    const images = new Map();
    for (const item of Array.isArray(foes) ? foes : []) if (item && text(item.name)) images.set(text(item.name), item);
    const foeInfos = [];
    foeNames.forEach((raw, index) => {
        const profile = profileOf(raw);
        if (!profile) return;
        const given = images.get(raw) || images.get(nameOf(raw)) || null;
        const image = given ? text(given.image) : (foeNames.length === 1 ? text(foeImage) : '');
        const tiers = given && given.tiers ? given.tiers : (foeNames.length === 1 && foeTiers ? foeTiers : null);
        foeInfos.push({ raw, summary: creatureSummary(nameOf(raw), profile, { group: hasGroupSuffix(raw), image, tiers: tiers ? { ...tiers } : null, frenzy: isFrenzyName(baseFrenzy, raw, foeNames), index, down: downCountFor(fx, raw) }) });
    });
    const foeOf = (name) => {
        const hit = matchFoeName(name, foeNames);
        return hit ? foeInfos.find((info) => info.raw === hit) || null : null;
    };
    // 成群杂兵：档案标了 group，或本页出招的目标名带「们 / 群 / 众」，这个对手就在台上复制多个身影。
    for (const event of plan.events) {
        if (event.type !== 'hit' || !hasGroupSuffix(event.target)) continue;
        const info = foeOf(event.target);
        if (info) info.summary.group = true;
    }
    let changed = false;
    let events = plan.events.map((event) => {
        if (event.type === 'encounter' && foeInfos.length) {
            changed = true;
            return { ...event, creatures: foeInfos.map((info) => info.summary) };
        }
        if (event.type === 'result' && foeInfos.length) {
            changed = true;
            return { ...event, creatures: foeInfos.map((info) => info.summary) };
        }
        if (event.type !== 'hit') return event;
        const entries = [];
        const attackerFoe = foeOf(event.attacker);
        const targetFoe = foeOf(event.target);
        const attackerProfile = isPlayerName(event.attacker, userName) ? null : (attackerFoe ? profileOf(attackerFoe.raw) : profileOf(event.attacker));
        const targetProfile = event.targetKind === 'player' ? null : (targetFoe ? profileOf(targetFoe.raw) : profileOf(event.target));
        const entryOf = (role, name, profile, info) => ({
            role, ...(info ? { ...info.summary, group: info.summary.group || hasGroupSuffix(name) } : creatureSummary(nameOf(name), profile, { group: hasGroupSuffix(name) })),
        });
        if (event.result === 'heal') {
            if (targetProfile) entries.push(entryOf('heal', event.target, targetProfile, targetFoe));
            else if (attackerProfile) entries.push(entryOf('heal', event.attacker, attackerProfile, attackerFoe));
        } else {
            if (targetProfile) entries.push(entryOf('target', event.target, targetProfile, targetFoe));
            if (attackerProfile) entries.push(entryOf('attacker', event.attacker, attackerProfile, attackerFoe));
        }
        if (!entries.length) return event;
        changed = true;
        const next = { ...event, creatures: entries };
        // 多对手：对手不在台上而有图时，按对手各自的立绘临时登场（单对手沿用既有判断，不改）。
        if (next.targetKind === 'stage' && targetFoe && targetFoe.summary.image) {
            next.targetKind = 'foe';
            next.portrait = targetFoe.summary.image;
        }
        return next;
    });
    // 二阶段：按已出招数插入事件，其后的事件整体顺延。
    const phaseEvents = [];
    for (const phase of phases) {
        const name = text(phase && phase.name);
        const targets = name ? [foeOf(name)].filter(Boolean) : foeInfos;
        const profile = targets.length ? null : profileOf(name);
        if (!targets.length && !profile) continue;
        const summaries = targets.length ? targets.map((info) => info.summary) : [creatureSummary(nameOf(name), profile)];
        phaseEvents.push({ at: Math.max(0, Number(phase.at) || 0), summaries, name });
    }
    if (phaseEvents.length) {
        changed = true;
        const queue = [...phaseEvents].sort((a, b) => a.at - b.at);
        const out = [];
        let shift = 0;
        let hitsSeen = 0;
        const flush = (limit, baseAt) => {
            while (queue.length && queue[0].at <= limit) {
                const item = queue.shift();
                const life = scaled(CREATURE_BATTLE_TIMING.phase, scale);
                out.push({ type: 'phase', at: baseAt + shift, life, name: item.name, creatures: item.summaries });
                shift += life + scaled(CREATURE_BATTLE_TIMING.phaseGap, scale);
            }
        };
        for (const event of events) {
            if (event.type === 'hit') { flush(hitsSeen, event.at); hitsSeen += 1; }
            else if (event.type === 'result') flush(Infinity, event.at);
            out.push(shift ? { ...event, at: event.at + shift } : event);
        }
        const tail = events.length ? events[events.length - 1] : null;
        flush(Infinity, tail ? tail.at + tail.life : 0);
        events = out;
    }
    if (!changed && !foeInfos.length) return plan;
    const last = events[events.length - 1];
    const next = { ...plan, events, totalMs: last ? last.at + last.life : plan.totalMs };
    if (foeInfos.length) next.creature = { foes: foeInfos.map((info) => info.summary), frenzy: baseFrenzy.slice() };
    return next;
}

// 名牌之外的补充：对手名单（多对手时名牌列出全部）。
export const foeListLabel = (raw) => splitFoeNames(raw).map(foeBaseName).join('、');
