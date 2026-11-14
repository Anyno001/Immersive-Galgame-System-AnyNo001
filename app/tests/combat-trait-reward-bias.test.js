import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planRewardSlots } from '../src/combat/rewards.js';
import { FIXED_CLASS_CARDS } from '../src/combat/fixed-cards/index.js';
import { BIAS_CATEGORIES, BIAS_MIN_POOL, cardCategories, allCleanOf, freeRerollOf, pickBias, pickTraitFlip, poolCategoryCount } from '../src/combat/trait-reward-bias.js';
import { rerollState } from '../src/combat/flip.js';
import { REROLL_COST } from '../src/combat/points.js';

const hero = (extra = {}) => ({ kind: 'deck-character', id: 'hero', name: '甲', classProfile: { archetype: 'warrior' }, owned: new Map(), traits: [], ...extra });
const plan = (combatId, statTraits, extra = {}) => planRewardSlots({ combatId, tier: 'elite', enemyTiers: ['elite'], character: hero(extra.character), candidates: true, inscribe: false, statTraits, ...extra.opts });

describe('B 奖励牌类偏向', () => {
    it('不传特质或无命中时与旧结果逐位一致，也不带来源字段', () => {
        for (let i = 0; i < 40; i += 1) {
            const base = plan(`c${i}`, null);
            for (const traits of [{ hero: [], allies: [] }, { hero: ['不存在'], allies: ['福星'] }]) {
                const got = plan(`c${i}`, traits);
                assert.deepEqual(got.slots, base.slots);
                assert.deepEqual(got.reserve, base.reserve);
                assert.equal(got.traitBias, undefined);
            }
        }
    });
    it('各职业整池各类别开放表', () => {
        const table = {};
        for (const [cls, pool] of Object.entries(FIXED_CLASS_CARDS)) {
            table[cls] = {};
            for (const rarity of ['common', 'uncommon', 'rare']) {
                table[cls][rarity] = 0;
            }
            table[cls].open = BIAS_CATEGORIES.filter((c) => poolCategoryCount(pool, c) >= BIAS_MIN_POOL);
        }
        console.log(JSON.stringify(Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.open]))));
        assert.ok(table.warrior.open.includes('attack'));
        assert.ok(!table.warrior.open.includes('summon') && table.summoner.open.includes('summon'));
    });
    it('命中偏向时攻击牌出现率上升并记录来源；数量不足的类别跳过', () => {
        let baseAtk = 0; let biasAtk = 0; let total = 0;
        const pool = FIXED_CLASS_CARDS.warrior;
        const byId = new Map(pool.map((c) => [c.id, c]));
        for (let i = 0; i < 300; i += 1) {
            const a = plan(`b${i}`, null);
            const b = plan(`b${i}`, { hero: ['战斗狂'], allies: [] });
            for (const [list, add] of [[a.slots, (n) => { baseAtk += n; }], [b.slots, (n) => { biasAtk += n; }]]) {
                for (const slot of list) {
                    if (slot.kind !== 'card' || !slot.fixedIds) continue;
                    add(slot.fixedIds.filter((id) => byId.get(id)?.type === 'attack').length);
                }
            }
            total += 1;
            if (b.traitBias) assert.deepEqual(b.traitBias, { trait: '战斗狂', category: 'attack' });
        }
        assert.ok(biasAtk > baseAtk, `${biasAtk} > ${baseAtk}`);
        assert.equal(pickBias(['抖M', '战斗狂'], []), null);
        assert.equal(pickBias(['动物缘', '战斗狂'], pool).trait, '战斗狂');
        const first = pickBias(['不存在', '战斗狂', '坚韧'], pool);
        assert.equal(first.trait, '战斗狂');
    });
    it('只看主角：同伴特质不影响 B', () => {
        const base = plan('x1', null);
        assert.deepEqual(plan('x1', { hero: [], allies: ['战斗狂'] }).slots, base.slots);
    });
    it('牌类判定：攻击/格挡按类型与主效果', () => {
        const blood = FIXED_CLASS_CARDS.warrior.find((c) => c.name === '血垒');
        assert.ok(cardCategories(blood).has('block'));
        assert.ok(cardCategories(blood).has('selfharm'));
    });
});

describe('C 翻牌时多一次选择', () => {
    it('幸运儿：每 3 胜一次，多一个可选项（预定牌 1→固定卡与随机卡二选一）并记来源', () => {
        const due = plan('f1', { hero: ['幸运儿'], allies: [] }, { character: { flipWins: { 'trait:幸运儿': 2 } } });
        assert.deepEqual(due.traitFlip, { trait: '幸运儿', effect: 'choices' });
        assert.deepEqual(due.traitHeld, ['幸运儿']);
        const cards = due.slots.filter((s) => s.kind === 'card' && s.fixedIds);
        assert.ok(cards.length > 0);
        assert.ok(cards.every((s) => s.fixedIds.length === 1 && Number.isInteger(s.randomAt)), JSON.stringify(cards));
        const off = plan('f1', { hero: ['幸运儿'], allies: [] }, { character: { flipWins: { 'trait:幸运儿': 1 } } });
        assert.equal(off.traitFlip, undefined);
        assert.deepEqual(off.traitHeld, ['幸运儿']);
        assert.equal(plan('f1', { hero: ['幸运儿'], allies: [] }, { character: { flipWins: { 'trait:幸运儿': 2 } }, opts: { weak: true } }).traitFlip, undefined);
    });
    it('福星：同伴挂也算；遗物已给多一个选项时不叠加', () => {
        const wins = { 'trait:福星': 2 };
        assert.equal(plan('f2', { hero: [], allies: ['福星'] }, { character: { flipWins: wins } }).traitFlip.trait, '福星');
        assert.equal(pickTraitFlip({ hero: ['幸运儿'] }, { tier: 'normal', wins: { 'trait:幸运儿': 2 }, relicChoices: 1 }), null);
    });
    it('透视 +1 封顶 2，已满不消耗次数、不生效', () => {
        const wins = { 'trait:灵觉': 2 };
        assert.equal(plan('f3', { hero: ['灵觉'], allies: [] }, { character: { flipWins: wins } }).links.reveal, 1);
        assert.equal(plan('f3', { hero: ['灵觉'], allies: [] }, { character: { flipWins: wins, traits: [] }, opts: { links: { reveal: 2 } } }).traitFlip, undefined);
        assert.equal(plan('f3', { hero: ['灵觉'], allies: [] }, { character: { flipWins: wins }, opts: { links: { reveal: 1 } } }).links.reveal, 2);
    });
    it('每人只生效 1 个 C 类；赌徒免费重抽；完美主义者仅精英首领', () => {
        const wins = { 'trait:幸运儿': 2, 'trait:赌徒': 2 };
        assert.equal(plan('f4', { hero: ['赌徒', '幸运儿'], allies: [] }, { character: { flipWins: wins } }).traitFlip.trait, '幸运儿');
        assert.equal(pickTraitFlip({ hero: ['完美主义者'] }, { tier: 'normal' }), null);
        assert.deepEqual(pickTraitFlip({ hero: ['完美主义者'] }, { tier: 'boss' }), { trait: '完美主义者', effect: 'reroll', noDamage: true });
        assert.equal(freeRerollOf({ traitFlip: { effect: 'reroll' } }, false), true);
        assert.equal(freeRerollOf({ traitFlip: { effect: 'reroll', noDamage: true } }, false), false);
        assert.equal(freeRerollOf({ traitFlip: { effect: 'reroll', noDamage: true } }, true), true);
        assert.equal(freeRerollOf({}, true), false);
        assert.equal(allCleanOf(['<igs-combat-report id="rabc" result="win" encounter="x">', '我方：甲 无伤，乙 无伤。敌方：丙 倒下。', '</igs-combat-report>'].join('\n')), true);
        assert.equal(allCleanOf(['<igs-combat-report id="rabc" result="win" encounter="x">', '我方：甲 无伤，乙 轻伤。敌方：丙 倒下。', '</igs-combat-report>'].join('\n')), false);
        assert.equal(allCleanOf('无战报'), false);
    });
    it('rerollState 免费时费用为 0，不需要积分', () => {
        const reward = { slots: [{}, {}, {}], reserve: [{}, {}, {}], combatId: 'z' };
        const pick = { set: 'main', flipped: [], choice: null };
        assert.equal(rerollState(reward, pick, { points: 0, payer: true }).available, false);
        const free = rerollState(reward, pick, { points: 0, payer: true, free: true });
        assert.equal(free.available, true);
        assert.equal(free.cost, 0);
        assert.equal(rerollState(reward, pick, { points: 99, payer: true }).cost, REROLL_COST);
    });
});
