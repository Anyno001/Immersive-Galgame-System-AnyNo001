// 规则 v6 遗物表（G5f）：每件遗物的原版 / 拆解模型逐条过账本被动校验；ID、名称唯一；战斗外模型只用登记的用途。
import test from 'node:test';
import assert from 'node:assert/strict';
import { OFF_COMBAT_KINDS, RELICS, isCombatModel, relicById, relicPassive } from '../src/combat/relics/index.js';
import { ledgerEntryId, normalizeLedgerEntry } from '../src/combat/schema.js';

const traitEntry = (passive, index) => {
    const anchor = { messageId: index, swipeId: 0, tagHash: 'relic-check', occurrence: 0 };
    return {
        id: ledgerEntryId('trait', 'pc-hero', anchor), type: 'trait', character: 'pc-hero', anchor, createdAt: 1,
        payload: { traitId: `tr-${index}`, name: passive.name, rarity: 'rare', kind: 'passive', passive, cost: 100 },
    };
};

test('遗物表：原版与拆解模型逐条过被动校验，ID 与名称唯一，战斗外模型用途已登记', () => {
    // D-10 / D-19：150 件去掉 12 件场景专用与 5 件凭空发奖励或道具的，剩 133 件；职业池五个职业各 7 件。
    assert.equal(RELICS.length, 133);
    const count = (key, value) => RELICS.filter((item) => item[key] === value).length;
    assert.deepEqual(
        ['common', 'uncommon', 'rare', 'shop'].map((tier) => count('tier', tier)),
        [25, 36, 46, 26],
    );
    assert.equal(count('pool', 'any'), 98);
    for (const pool of ['warrior', 'assassin', 'mage', 'summoner', 'priest']) assert.equal(count('pool', pool), 7, pool);
    assert.equal(new Set(RELICS.map((item) => item.id)).size, RELICS.length);
    assert.equal(new Set(RELICS.map((item) => item.name)).size, RELICS.length);
    let index = 0;
    for (const item of RELICS) {
        assert.equal(relicById(item.id), item);
        assert.ok(item.name.length <= 20, item.id);
        assert.ok(isCombatModel(item.split), `${item.id} 拆解模型须为战斗内被动`);
        for (const key of ['original', 'split']) {
            const model = item[key];
            if (!isCombatModel(model)) {
                assert.ok(OFF_COMBAT_KINDS.includes(model?.kind), `${item.id}.${key}`);
                assert.ok(typeof model.text === 'string' && model.text.length <= 80, `${item.id}.${key}.text`);
                continue;
            }
            const result = normalizeLedgerEntry(traitEntry(relicPassive(item, key), (index += 1)));
            assert.equal(result.ok, true, `${item.id}.${key} ${JSON.stringify(result.errors)}`);
        }
    }
});


test('遗物抽取：同一种子结果恒定，原版与拆解约各一半，只出本归属、本稀有度与本职业池的条目', async () => {
    const { drawRelic, relicModelFor, resolveRelic, RELIC_TIERS_BY_RARITY } = await import('../src/combat/relics/draw.js');
    let original = 0;
    for (let i = 0; i < 2000; i += 1) if (relicModelFor(`s${i}`) === 'original') original += 1;
    assert.ok(original > 900 && original < 1100, `原版占比 ${original}/2000`);
    assert.equal(relicModelFor('fixed-seed'), relicModelFor('fixed-seed'));
    for (const rarity of Object.keys(RELIC_TIERS_BY_RARITY)) {
        for (let i = 0; i < 60; i += 1) {
            const seed = `t|${rarity}|${i}`;
            const got = drawRelic({ seed, home: 'treasure', rarity, archetype: 'mage' });
            assert.ok(got, seed);
            assert.deepEqual(drawRelic({ seed, home: 'treasure', rarity, archetype: 'mage' }), got);
            const item = relicById(got.relicId);
            assert.equal(item.home, 'treasure');
            assert.ok(RELIC_TIERS_BY_RARITY[rarity].includes(item.tier), seed);
            assert.ok(item.pool === 'any' || item.pool === 'mage', seed);
            assert.equal(got.model, relicModelFor(seed));
            assert.ok(got.passive || got.offCombat, seed);
        }
    }
    const all = RELICS.filter((item) => item.home === 'treasure' && item.tier === 'common' && item.pool === 'any').map((item) => item.id);
    assert.equal(drawRelic({ seed: 'x', home: 'treasure', tiers: ['common'], archetype: 'none', owned: all }), null);
    assert.equal(resolveRelic('rl-c-02', 'bogus'), null);
    assert.equal(resolveRelic('rl-missing', 'original'), null);
    assert.equal(resolveRelic('rl-c-17', 'original').offCombat.kind, 'pickup');
    assert.equal(resolveRelic('rl-c-17', 'split').passive.trigger, 'battle-start');
});


test('遗物宝物槽：规则 v6 卡组角色的宝物槽由程序抽定遗物，名称与效果由程序还原，载荷带 relic 并过账本校验', async () => {
    const { planRewardSlots } = await import('../src/combat/rewards.js');
    const { assembleReward } = await import('../src/combat/generation-assembly.js');
    const { resolveRelic } = await import('../src/combat/relics/draw.js');
    const me = { kind: 'deck-character', id: 'pc-hero', classProfile: { archetype: 'mage' }, owned: new Map() };
    const found = [];
    for (let i = 0; i < 400 && found.length < 12; i += 1) {
        const plan = planRewardSlots({ combatId: `cb|relic|${i}`, tier: 'boss', character: me, candidates: true });
        for (const slot of [...plan.slots, ...plan.reserve]) if (slot.relic) found.push(slot);
        const ids = [...plan.slots, ...plan.reserve].filter((slot) => slot.relic).map((slot) => slot.relic.relicId);
        assert.equal(new Set(ids).size, ids.length, '同一次奖励不重复出同一件遗物');
    }
    assert.ok(found.length >= 6, `宝物遗物槽 ${found.length}`);
    const models = new Set();
    for (const slot of found) {
        assert.equal(slot.gearSlot, 'treasure');
        const item = relicById(slot.relic.relicId);
        assert.equal(item.home, 'treasure');
        assert.ok(item.pool === 'any' || item.pool === 'mage');
        models.add(slot.relic.model);
        const built = assembleReward({ slots: [['随便起的名字', null, '首领身上掉落']] }, { key: 'k', input: { seed: 's', slots: [slot] } });
        assert.equal(built.errors, undefined, JSON.stringify(built.errors));
        const entry = built.value.slots[0];
        const relic = resolveRelic(slot.relic.relicId, slot.relic.model);
        assert.equal(entry.name, relic.name);
        assert.deepEqual(entry.gear.relic, slot.relic);
        assert.equal(Boolean(entry.gear.passive), Boolean(relic.passive));
        const anchor = { messageId: 3, swipeId: 0, tagHash: 'relic-loot', occurrence: 0 };
        const loot = normalizeLedgerEntry({
            id: ledgerEntryId('loot', 'pc-hero', anchor), type: 'loot', character: 'pc-hero', anchor, createdAt: 1,
            payload: { combatId: 'cb', reportId: 'r1', set: 'main', slot: entry, cost: 0 },
        });
        assert.equal(loot.ok, true, JSON.stringify(loot.errors));
        assert.deepEqual(loot.value.payload.slot.gear.relic, slot.relic);
    }
    assert.equal(models.size, 2, '原版与拆解模型都会出');
    const old = planRewardSlots({ combatId: 'cb|relic|0', tier: 'boss', character: me });
    assert.ok([...old.slots, ...old.reserve].every((slot) => slot.relic === undefined), '旧规则不出遗物');
    const anchor = { messageId: 1, swipeId: 0, tagHash: 'x', occurrence: 0 };
    const bad = normalizeLedgerEntry({
        id: ledgerEntryId('equip', 'pc-hero', anchor), type: 'equip', character: 'pc-hero', anchor, createdAt: 1,
        payload: { gearId: 'g-x', name: '假遗物', slot: 'treasure', description: '', relic: { relicId: 'rl-zz-99', model: 'original' } },
    });
    assert.equal(bad.ok, false);
});



test('遗物特性：程序按种子决定是否出遗物，只出特性归属的条目，原版与拆解都会出（战斗外模型只记引用），名称与效果由遗物表还原，载荷过账本校验', async () => {
    const { planTraitRelic, isRelicPassive, resolveRelic, relicText, TRAIT_RELIC_TIERS } = await import('../src/combat/relics/draw.js');
    const { traitEntity } = await import('../src/combat/generation.js');
    const { assembleTrait } = await import('../src/combat/generation-assembly.js');
    const hero = { id: 'pc-hero', name: '勇者' };
    let hits = 0;
    let offCombat = 0;
    const models = new Set();
    for (let i = 0; i < 400; i += 1) {
        const seed = `trait-seed|${i}`;
        const rarity = ['common', 'uncommon', 'rare', 'epic', 'mythic'][i % 5];
        const plan = planTraitRelic({ seed, rarity, archetype: 'warrior' });
        assert.deepEqual(planTraitRelic({ seed, rarity, archetype: 'warrior' }), plan, seed);
        if (!plan) continue;
        hits += 1;
        models.add(plan.model);
        const item = relicById(plan.relicId);
        assert.equal(item.home, 'trait', seed);
        assert.ok(TRAIT_RELIC_TIERS[rarity].includes(item.tier), seed);
        assert.ok(item.pool === 'any' || item.pool === 'warrior', seed);
        assert.equal(planTraitRelic({ seed, rarity, archetype: 'warrior', owned: [plan.relicId] })?.relicId === plan.relicId, false, '已持有的遗物不再抽到');
        const entity = traitEntity({ character: hero, rarity, traitId: `tr-${i}`, relic: { relicId: plan.relicId, model: plan.model } });
        assert.deepEqual(entity.fixed.relic, { relicId: plan.relicId, model: plan.model });
        assert.equal(entity.fixed.shape, undefined);
        assert.equal(entity.input.fixedName, plan.name);
        assert.equal(JSON.stringify(entity.input).includes(plan.relicId), false, '遗物 ID 不暴露给副 LLM');
        const built = assembleTrait({ name: '模型乱起的名字', template: 'x', origin: '旧战场拾得' }, { key: entity.key, fixed: entity.fixed });
        assert.equal(built.errors, undefined, JSON.stringify(built.errors));
        const trait = built.value;
        assert.equal(trait.name, plan.name);
        assert.equal(trait.origin, '旧战场拾得');
        const anchor = { messageId: i + 10, swipeId: 0, tagHash: 'relic-trait', occurrence: 0 };
        const ledgerOf = (payload) => normalizeLedgerEntry({ id: ledgerEntryId('trait', 'pc-hero', anchor), type: 'trait', character: 'pc-hero', anchor, createdAt: 1, payload });
        if (!plan.passive) {
            offCombat += 1;
            assert.equal(trait.passive, undefined, `${seed} 战斗外遗物特性不带战斗被动`);
            assert.equal(relicText(trait.relic), plan.description);
            const entry = ledgerOf({ ...trait, cost: 100 });
            assert.equal(entry.ok, true, `${seed} ${JSON.stringify(entry.errors)}`);
            assert.deepEqual(entry.value.payload.relic, trait.relic);
            assert.equal(ledgerOf({ ...trait, passive: { id: 'x-p', name: 'x', trigger: 'battle-start', effects: [{ op: 'block', amount: 99 }] }, cost: 100 }).ok, false, '战斗外遗物特性不能夹带被动');
            continue;
        }
        assert.equal(trait.passive.id, `tr-${i}-p`);
        assert.deepEqual(trait.passive.effects, resolveRelic(plan.relicId, plan.model).passive.effects);
        assert.equal(isRelicPassive(trait), true, seed);
        const entry = ledgerOf({ ...trait, cost: 100 });
        assert.equal(entry.ok, true, `${seed} ${JSON.stringify(entry.errors)}`);
        assert.deepEqual(entry.value.payload.relic, trait.relic);
        assert.equal(isRelicPassive(entry.value.payload), true, `${seed} 账本规范化后仍认得出遗物被动`);
        const tampered = { ...trait, passive: { ...trait.passive, effects: [...trait.passive.effects, trait.passive.effects[0]] } };
        assert.equal(isRelicPassive(tampered), false, '效果被改动后不再豁免伤害上限');
    }
    assert.ok(hits > 100 && hits < 300, `遗物特性 ${hits}/400`);
    assert.ok(offCombat > 0, '战斗外原版模型的遗物特性也会出');
    assert.equal(models.size, 2, '原版与拆解模型都会出');
    assert.equal(planTraitRelic({ seed: 's', rarity: 'bogus' }), null);
    const bad = assembleTrait({ origin: '' }, { key: 'k', fixed: { traitId: 'tr-x', rarity: 'rare', relic: { relicId: 'rl-zz-99', model: 'original' } } });
    assert.equal(bad.errors[0].reason, 'relic-trait-invalid');
    const plain = traitEntity({ character: hero, rarity: 'rare', traitId: 'tr-p' });
    assert.equal(plain.fixed.relic, undefined);
});
