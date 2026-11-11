import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createCombatTraitSeed, COMBAT_TRAIT_SEED_KEY } from '../src/host/combat-trait-seed.js';
import { planTrait, traitSeed } from '../src/combat/traits.js';
import { planTraitShape } from '../src/combat/trait-pool.js';
import { deckDetailView } from '../src/visual/igs-ui/combat-deck-panel-model.js';
import { createCombatDeckPanelController } from '../src/visual/igs-ui/combat-deck-panel.js';
import { createGenerationFixture } from './helpers/combat-generation-fixture.js';

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

