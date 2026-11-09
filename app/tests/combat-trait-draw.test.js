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

test('种子保存尚未完成时不能发模型请求；保存失败不抽取、不扣费，可重试', async (t) => {
    const f = await createGenerationFixture();
    t.after(f.dispose);
    const before = await f.hero();
    let finish;
    f.setSaveMetadata(() => new Promise((resolve) => { finish = resolve; }));
    const drawing = f.services.drawTrait();
    await settle();
    assert.equal(typeof finish, 'function');
    assert.equal(f.requests.length, 0);
    finish(false);
    assert.equal((await drawing).reason, 'combat-trait-seed-save-failed');
    assert.equal(f.metadata()[COMBAT_TRAIT_SEED_KEY], undefined);
    assert.equal((await f.hero()).points, before.points);
    assert.equal((await f.hero()).traitDraws, 0);
    f.setSaveMetadata(async () => {});
    assert.equal((await f.services.drawTrait()).ok, true);
    assert.equal(f.requests.length, 1);
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

test('生成失败重试仍抽同一效果；回退楼层不会重新洗种子或改写角色档案', async (t) => {
    const f = await createGenerationFixture();
    t.after(f.dispose);
    f.setFailure(true);
    assert.equal((await f.services.drawTrait()).ok, false);
    const failed = f.requests[0].entities[0].input;
    f.setFailure(false);
    const first = await f.services.drawTrait();
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.deepEqual(f.requests.at(-1).entities[0].input, failed);
    const before = await f.hero();
    const seed = f.metadata()[COMBAT_TRAIT_SEED_KEY];
    // 抽取锚定最新楼；回退掉该楼后抽取次数退回，种子仍跟随聊天保留。
    f.host.SillyTavern.getContext().chat.pop();
    f.services.resetChat();
    assert.equal((await f.hero()).traitDraws, 0);
    const again = await f.services.drawTrait();
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(f.metadata()[COMBAT_TRAIT_SEED_KEY], seed);
    assert.deepEqual(shapeOf(again.trait), shapeOf(first.trait));
    assert.equal(again.trait.rarity, first.trait.rarity);
    assert.deepEqual((await f.hero()).profile, before.profile);
});

test('旧格式特性不重抽、不改写；新增抽取从已有次数继续', async (t) => {
    const f = await createGenerationFixture();
    t.after(f.dispose);
    const hero = await f.hero();
    const oldTrait = { traitId: 'old', name: '旧被动', origin: '旧存档', rarity: 'common',
        passive: { id: 'old-p', name: '旧被动', trigger: 'turn-start', effects: [{ op: 'block', amount: 2, target: 'self' }] } };
    assert.equal((await f.services.getLedger().drawTrait(hero.id, oldTrait)).ok, true);
    const oldState = await f.hero();
    assert.equal(oldState.traitDraws, 1);
    const result = await f.services.drawTrait();
    assert.equal(result.ok, true, JSON.stringify(result));
    const current = await f.hero();
    assert.deepEqual(current.traits, oldState.traits);
    assert.equal(current.traitDraws, 2);
    assert.equal(current.points, oldState.points - 100);
    const expectedSeed = traitSeed(hero.id, 1, f.metadata()[COMBAT_TRAIT_SEED_KEY]);
    const { rarity } = planTrait(expectedSeed);
    const expected = planTraitShape(expectedSeed, rarity);
    assert.equal(result.trait.rarity, rarity);
    assert.deepEqual(shapeOf(result.trait), expected.kind === 'active' ? expected.skill.effects : expected.passive.effects);
});

test('特性列表、待替换特性与固有被动都显示触发时机和牌型限制', async (t) => {
    const f = await createGenerationFixture();
    t.after(f.dispose);
    const hero = await f.hero();
    const kill = { traitId: 'kill', name: '余烬', rarity: 'rare', kind: 'passive', passive: { trigger: 'kill', effects: [
        { op: 'damage', amount: 3, hits: 1, target: 'all-enemies' }, { op: 'energy', amount: 1 },
    ] } };
    const attack = { ...kill, traitId: 'attack', passive: { trigger: 'card-played', cardType: 'attack', effects: [{ op: 'block', amount: 4 }] } };
    const view = deckDetailView({ ...hero, slotUnlocks: 3, traits: [kill], pendingTrait: attack });
    assert.equal(view.traits[0].text, '每次击杀敌人时：对全体敌人造成 3 点伤害。获得 1 点能量');
    assert.equal(view.pendingTrait.text, '每次打出攻击牌时：获得 4 点格挡');
    assert.match(view.traitSlots.innate.find((x) => x.kind === 'passive').text, /^开战时：/);
    const active = { traitId: 'active', kind: 'active', skill: { cost: 1, effects: [{ op: 'block', amount: 4 }] } };
    assert.equal(deckDetailView({ ...hero, traits: [active] }).traits[0].text, '获得 4 点格挡');
});

test('揭晓蓄力与最终特性使用服务层同一稀有度，界面不再自己推算', async (t) => {
    const f = await createGenerationFixture();
    t.after(f.dispose);
    const hero = await f.hero();
    let seed;
    for (let i = 0; i < 100; i += 1) {
        const candidate = `ui-seed-${i}`;
        if (planTrait(traitSeed(hero.id, 0, candidate)).rarity !== planTrait(traitSeed(hero.id, 0)).rarity) { seed = candidate; break; }
    }
    assert.ok(seed);
    f.metadata()[COMBAT_TRAIT_SEED_KEY] = seed;
    const expected = planTrait(traitSeed(hero.id, 0, seed)).rarity;
    let finish;
    f.setCallback(() => new Promise((resolve) => { finish = resolve; }));
    const dom = new JSDOM('<div id="overlay"></div>', { url: 'http://localhost/' });
    const controller = createCombatDeckPanelController(dom.window.document, {
        getLedger: () => f.services.getLedger(), drawTrait: f.services.drawTrait, pickTrait: f.services.pickTrait,
    });
    t.after(() => { controller.close(); dom.window.close(); });
    controller.open(dom.window.document.querySelector('#overlay'));
    await settle();
    controller.invoke('trait-open');
    const drawing = controller.invoke('trait-confirm');
    await settle();
    assert.equal(dom.window.document.querySelector('[data-phase="charge"]').dataset.rarity, expected);
    finish();
    assert.equal((await drawing).ok, true);
    const result = (await f.hero()).pendingTrait;
    assert.equal(result.rarity, expected);
    assert.ok(dom.window.document.querySelector('[data-phase="open"]'));
    if (result.passive) assert.match(dom.window.document.querySelector('.igs-deck-reveal-text').textContent, /时|后/);
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
