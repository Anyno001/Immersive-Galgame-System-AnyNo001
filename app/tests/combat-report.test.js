// 与 v0.39.0 原版的差分测试：report 的全部导出（随机战斗事件流，固定种子）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mine from '../src/combat/report.js';

const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const orig = globalThis.__igsRequire('src/combat/report.js');

function prng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = Math.imul(s ^ (s >>> 15), s | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const STATUS = ['vulnerable', 'weak', 'strength', 'dexterity', 'poison', 'regen', 'thorns', 'mystery'];
const ACTION = ['card', 'skill', 'hero-skill', 'item'];

function scenario(seed) {
    const rnd = prng(seed);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const ids = ['a1', 'a2', 'a3', 'e1', 'e2', 'e3'];
    const units = {};
    for (const id of ids) {
        const maxHp = 20 + Math.floor(rnd() * 80);
        const hp = pick([0, maxHp, Math.floor(maxHp * rnd()), Math.floor(maxHp * 0.5)]);
        units[id] = { name: id.startsWith('a') ? `友<军>${id}` : `敌|${id}`, side: id.startsWith('a') ? 'ally' : 'enemy', maxHp, hp, alive: hp > 0 && rnd() > 0.1 };
    }
    const events = [];
    const turns = Math.floor(rnd() * 14);
    for (let t = 0; t < turns; t += 1) {
        if (rnd() > 0.1) events.push({ type: 'turn-start', side: 'ally' });
        events.push({ type: 'turn-start', side: 'enemy' });
        const acts = Math.floor(rnd() * 6);
        for (let a = 0; a < acts; a += 1) {
            const actor = pick(ids);
            const type = pick(ACTION);
            events.push({ type, unitId: actor, name: pick(['挥砍', '火球', '护盾"术"', '']), skillRef: pick([undefined, '本源', '卡牌名']) });
            const effects = Math.floor(rnd() * 5);
            for (let k = 0; k < effects; k += 1) {
                const target = pick(ids);
                const source = rnd() > 0.15 ? { kind: pick([...ACTION, 'affix']), unitId: rnd() > 0.1 ? actor : pick(ids) } : undefined;
                const kind = pick(['damage', 'damage', 'heal', 'block', 'status', 'defeated', 'noise']);
                if (kind === 'damage') events.push({ type: 'damage', target, hpLoss: pick([0, 3, 15, 40, undefined]), blocked: pick([0, 4, undefined]), overkill: rnd() > 0.85, source });
                else if (kind === 'heal') events.push({ type: 'heal', target, amount: pick([0, 5, undefined]), source });
                else if (kind === 'block') events.push({ type: 'block', target, amount: pick([0, 6, undefined]), source });
                else if (kind === 'status') events.push({ type: 'status', target, status: pick(STATUS), source });
                else if (kind === 'defeated') events.push({ type: 'defeated', unitId: target });
                else events.push({ type: 'noise' });
            }
        }
        if (rnd() > 0.9) events.push({ type: 'escape', unitId: pick(ids) });
        if (rnd() > 0.9) events.push({ type: 'awaken', unitId: pick(ids), awakenType: pick(['rage', 'guard', 'zzz']), line: pick(['拼了', '', '为了[你]', undefined]) });
    }
    const outcome = pick(['victory', 'defeat', 'escape', undefined, 'bogus']);
    return { units, events, state: { outcome, units, wipe: pick([true, false, undefined]) } };
}

test('导出名集合与常量一致', () => {
    assert.deepStrictEqual(Object.keys(mine).sort(), Object.keys(orig).sort());
    for (const k of ['REPORT_RESULT', 'REPORT_DETAIL', 'AWAKEN_TYPE_NAMES', 'COMBAT_SKIP_TEXT', 'COMBAT_RULES_VERSION']) assert.deepStrictEqual(mine[k], orig[k], k);
    assert.ok(Object.isFrozen(mine.REPORT_RESULT) && Object.isFrozen(mine.AWAKEN_TYPE_NAMES));
});

test('小函数：reportIdFor / reportIdOf / hasLoot / injuryLevel', () => {
    for (const v of ['c1', '', undefined, null, 12, '战斗-x']) assert.strictEqual(mine.reportIdFor(v), orig.reportIdFor(v));
    for (const v of ['<igs-combat-report id="r1x" result="win">', '<igs-combat-report  ID = "abc">', 'nothing', '', null, undefined, '<igs-combat-report id="">']) {
        assert.strictEqual(mine.reportIdOf(v), orig.reportIdOf(v));
        assert.strictEqual(mine.hasLoot(v), orig.hasLoot(v));
    }
    assert.strictEqual(mine.hasLoot('x [igs-combat:loot|a|r1|0|main]'), orig.hasLoot('x [igs-combat:loot|a|r1|0|main]'));
    const units = [null, undefined, {}, { alive: true, hp: 0, maxHp: 10 }, { alive: true, hp: 10, maxHp: 10 }, { alive: true, hp: 7, maxHp: 10 }, { alive: true, hp: 6, maxHp: 10 }, { alive: true, hp: 3, maxHp: 10 }, { alive: true, hp: 2, maxHp: 10 }, { alive: false, hp: 5, maxHp: 10 }];
    for (const u of units) assert.strictEqual(mine.injuryLevel(u), orig.injuryLevel(u));
});

test('attachLoot', () => {
    const body = '（战斗结束）\n<igs-combat-report id="r1">\n第1回合：x。\n</igs-combat-report>';
    const slots = [{ kind: 'card', name: '烈焰斩' }, { kind: 'item', name: '药水', item: { count: 3 } }, { kind: 'item', name: '药水', item: { count: 1 } }, { kind: 'gear', name: '剑"<>' }, { kind: 'keepsake', name: '信' }, { kind: 'weird', name: 'x' }];
    for (const slot of slots) {
        for (const set of ['main', 'reserve', 'other', undefined]) {
            const loot = { character: '艾[拉]|', slot, reportId: 'r1', index: 2, set };
            assert.strictEqual(mine.attachLoot(body, loot), orig.attachLoot(body, loot));
        }
    }
    const withLoot = mine.attachLoot(body, { character: 'a', slot: slots[0], reportId: 'r1', index: 0 });
    for (const [text, loot] of [[withLoot, { character: 'a', slot: slots[0] }], ['无战报', { slot: slots[0] }], [body, null], [body, {}], [null, undefined], [undefined, { slot: slots[0] }]]) {
        assert.strictEqual(mine.attachLoot(text, loot), orig.attachLoot(text, loot));
    }
});

test('collectTurns / buildCombatReport 随机事件流', () => {
    let finished = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
        const { units, events, state } = scenario(seed);
        assert.deepStrictEqual(mine.collectTurns(events, units), orig.collectTurns(events, units), `collect ${seed}`);
        for (const detail of ['brief', 'normal', 'x', undefined]) {
            const args = { combatId: `c${seed}`, encounter: seed % 2 ? '林间"遭遇"<战>' : undefined, state, events, enemyTiers: ['normal', 'elite', 'boss', 'normal'].slice(0, seed % 5), expTargets: ['艾拉', '艾拉', '[贝]卡', '', '佐|伊'], detail };
            const a = mine.buildCombatReport(args);
            const b = orig.buildCombatReport(args);
            assert.deepStrictEqual(a, b, `report ${seed}/${detail}`);
            if (a.ok) finished += 1;
        }
    }
    assert.ok(finished > 200);
    for (const bad of [undefined, {}, { state: {} }, { state: { outcome: 'victory', units: {} }, events: null }]) {
        assert.deepStrictEqual(mine.buildCombatReport(bad), orig.buildCombatReport(bad));
    }
    assert.deepStrictEqual(mine.collectTurns(null), orig.collectTurns(null));
    assert.deepStrictEqual(mine.collectTurns([{ type: 'damage', target: 'x', hpLoss: 3 }, { type: 'defeated', unitId: 'x' }]), orig.collectTurns([{ type: 'damage', target: 'x', hpLoss: 3 }, { type: 'defeated', unitId: 'x' }]));
});

test('长战斗折叠（超过 8 回合）', () => {
    for (let seed = 1000; seed < 1200; seed += 1) {
        const { units, state } = scenario(seed);
        const events = [];
        const rnd = prng(seed);
        for (let t = 0; t < 12; t += 1) {
            events.push({ type: 'turn-start', side: 'ally' });
            events.push({ type: 'card', unitId: 'a1', name: `招${t}` });
            events.push({ type: 'damage', target: 'e1', hpLoss: Math.floor(rnd() * 30), source: { kind: 'card', unitId: 'a1' } });
            if (rnd() > 0.7) events.push({ type: 'defeated', unitId: 'e1' });
        }
        const args = { combatId: `L${seed}`, state: { ...state, outcome: 'victory' }, events, enemyTiers: ['boss'], expTargets: ['甲'] };
        assert.deepStrictEqual(mine.buildCombatReport(args), orig.buildCombatReport(args));
    }
});
