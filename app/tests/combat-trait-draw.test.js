import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createCombatTraitSeed, COMBAT_TRAIT_SEED_KEY } from '../src/host/combat-trait-seed.js';
import { planTrait, traitSeed } from '../src/combat/traits.js';
import { planTraitShape } from '../src/combat/trait-pool.js';
import { deckDetailView } from '../src/visual/igs-ui/combat-deck-panel-model.js';
import { createCombatDeckPanelController } from '../src/visual/igs-ui/combat-deck-panel.js';
import { createGenerationFixture } from './helpers/combat-generation-fixture.js';
import { passiveAtRarity, gearPassiveFromTemplate } from '../src/combat/card-templates.js';

const settle = async () => { for (let i = 0; i < 8; i += 1) await new Promise((r) => setImmediate(r)); };
const shapeOf = (trait) => trait.kind === 'active' ? trait.skill.effects : trait.passive.effects;

test('同名主角在不同聊天独立抽取，保存的种子重载后继续复用', async (t) => {
    const fixtures = await Promise.all(['chat-a', 'chat-b'].map((chatId) => createGenerationFixture({ chatId })));
    t.after(() => fixtures.forEach((f) => f.dispose()));
    const results = [];
    const seeds = [];
    for (const f of fixtures) {
        let saved;
        f.setSaveMetadata(async () => { saved = structuredClone(f.metadata()); });
        const before = await f.hero();
        const result = await f.services.drawTrait();
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal((await f.hero()).points, before.points - 100);
        assert.equal((await f.hero()).traitDraws, 1);
        const seed = saved[COMBAT_TRAIT_SEED_KEY];
        assert.equal(typeof seed, 'string');
        assert.equal(f.metadata()[COMBAT_TRAIT_SEED_KEY], seed);
        seeds.push(seed);
        results.push(result);
        // 用保存到宿主的元数据重新建服务，首抽应恢复同一结果，而不是重新洗种子。
        const reload = await createGenerationFixture({ metadata: saved });
        t.after(reload.dispose);
        reload.setSaveMetadata(() => { throw Error('已有种子不应再写'); });
        const restored = await reload.services.drawTrait();
        assert.equal(restored.ok, true, JSON.stringify(restored));
        assert.equal(restored.trait.rarity, result.trait.rarity);
        assert.deepEqual(shapeOf(restored.trait), shapeOf(result.trait));
    }
    assert.equal(results[0].id, results[1].id, '两个聊天使用同名主角');
    assert.notEqual(seeds[0], seeds[1]);
    const sequence = (seed) => Array.from({ length: 20 }, (_, i) => {
        const key = traitSeed(results[0].id, i, seed);
        const { rarity } = planTrait(key);
        return { rarity, ...planTraitShape(key, rarity) };
    });
    assert.notDeepEqual(sequence(seeds[0]), sequence(seeds[1]));
});

test('并行读取种子必须等待同一次保存，不提前使用尚未持久化的值', async () => {
    const metadata = {};
    let saved = 0;
    let finish;
    const host = { SillyTavern: { getContext: () => ({ chatMetadata: metadata,
        saveMetadata: () => { saved += 1; return new Promise((resolve) => { finish = resolve; }); } }) } };
    const seeds = createCombatTraitSeed(host, () => 'chat');
    const first = seeds.ensure();
    let complete = false;
    const second = seeds.ensure().then((value) => { complete = true; return value; });
    await settle();
    assert.equal(saved, 1);
    assert.equal(complete, false);
    finish();
    assert.deepEqual(await first, await second);
});

test('切聊天或取消时，种子保存与模型请求的迟到结果都不能落账扣费', async (t) => {
    for (const stage of ['save', 'request']) {
        for (const mode of ['chat', 'abort', 'reset']) {
            await t.test(`${stage}-${mode}`, async (t) => {
                const f = await createGenerationFixture();
                t.after(f.dispose);
                const before = await f.hero();
                const control = new AbortController();
                const interrupt = async () => {
                    if (mode === 'chat') f.setChat('other');
                    else if (mode === 'reset') f.services.resetChat();
                    else control.abort();
                };
                if (stage === 'save') f.setSaveMetadata(interrupt);
                else f.setCallback(interrupt);
                const result = await f.services.drawTrait({ signal: control.signal });
                assert.equal(result.reason, 'request-stale');
                assert.equal(f.requests.length, stage === 'save' ? 0 : 1);
                f.setChat('fixture-chat');
                assert.equal((await f.hero()).traitDraws, before.traitDraws);
                assert.equal((await f.hero()).points, before.points);
            });
        }
    }
});


test('重叠抽取只发起一次生成、只扣一次费用，完成后下一抽继续', async (t) => {
    const f = await createGenerationFixture();
    t.after(f.dispose);
    await f.services.unlockTraitSlot();
    await f.services.unlockTraitSlot();
    const before = await f.hero();
    let finish;
    f.setCallback(() => new Promise((resolve) => { finish = resolve; }));
    const first = f.services.drawTrait();
    await settle();
    assert.equal((await f.services.drawTrait()).reason, 'combat-trait-busy');
    assert.equal(f.requests.length, 1);
    finish();
    assert.equal((await first).ok, true);
    assert.equal((await f.hero()).traitDraws, before.traitDraws + 1);
    assert.equal((await f.hero()).points, before.points - 100);
    f.setCallback(null);
    assert.equal((await f.services.drawTrait()).ok, true);
    assert.equal((await f.hero()).traitDraws, before.traitDraws + 2);
});

test('其他调用方生成的过期抽取在账本入口被拒收，不扣费', async (t) => {
    const f = await createGenerationFixture();
    t.after(f.dispose);
    await f.services.unlockTraitSlot();
    const result = await f.services.drawTrait();
    assert.equal(result.ok, true);
    const before = await f.hero();
    const stale = await f.services.getLedger().drawTrait(result.id, { ...result.trait, traitId: 'other-request' }, { expectedDraws: 0 });
    assert.equal(stale.reason, 'combat-trait-stale');
    assert.equal((await f.hero()).points, before.points);
    assert.equal((await f.hero()).traitDraws, before.traitDraws);
});

test('写入序号只作当时预检，早期楼层换分支不抹掉后来已抽的特性', async (t) => {
    const f = await createGenerationFixture();
    t.after(f.dispose);
    await f.services.unlockTraitSlot();
    await f.services.unlockTraitSlot();
    const first = await f.services.drawTrait();
    assert.equal(first.ok, true);
    const chat = f.host.SillyTavern.getContext().chat;
    const previousFloor = chat.at(-1);
    chat.push({ is_user: false, mes: '继续前行。', swipe_id: 0 });
    const second = await f.services.drawTrait();
    assert.equal(second.ok, true);
    previousFloor.swipe_id = 1;
    f.services.resetChat();
    const hero = await f.hero();
    const kept = [...hero.traits, hero.pendingTrait].filter(Boolean);
    assert.equal(hero.traitDraws, 1);
    assert.equal(kept.some((x) => x.traitId === first.trait.traitId), false);
    assert.deepEqual(shapeOf(kept.find((x) => x.traitId === second.trait.traitId)), shapeOf(second.trait));
});

test('职业与非主角个人被动显示触发条件，装备读取加强后的实际效果', async (t) => {
    const f = await createGenerationFixture();
    t.after(f.dispose);
    const hero = await f.hero();
    const classPassive = { name: '守势', trigger: 'turn-start', effects: [{ op: 'block', amount: 3, target: 'self' }] };
    for (const passive of [passiveAtRarity('opening-guard', 'rare'), gearPassiveFromTemplate('opening-guard', 'treasure')]) {
        const view = deckDetailView({ ...hero, attributes: { ...hero.attributes, protagonist: false },
            classProfile: { ...hero.classProfile, classPassive }, gear: { slots: { armor: { gearId: 'g', name: '护甲', passive } }, bag: [{ gearId: 'g2', name: '旧护甲', passive }] } });
        assert.equal(view.classPassive.text, '回合开始时：获得 3 点格挡');
        assert.match(view.personalPassive.text, /^开战时：/);
        assert.equal(view.gear.slots[1].item.text, '开战时：获得 10 点格挡');
        assert.equal(view.gear.bag[0].text, view.gear.slots[1].item.text);
    }
});
