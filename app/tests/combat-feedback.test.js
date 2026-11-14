import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createBattle, replayBattle } from '../src/combat/engine.js';
import { COMBAT_RULES, combatSpeedFor, enemySpeedFor, estimateBattleEffectsValue, estimateCardValue, estimateEffectsValue, evaluateCardBudget, rarityWindow } from '../src/combat/rules.js';
import { cardView, describeIntent } from '../src/combat/battle-state.js';
import { buildSetup, createCombatSession, enemyUnits, locateCombatStart, SESSION_VERSION, sessionKeyFor } from '../src/combat/session.js';
import { createCountingStorage } from './helpers/combat-mock-host-services.js';
import { compatibleFixedClassPool, fixedCard, fixedClassPool, fixedCardGroup } from '../src/combat/fixed-cards/index.js';
import { normalizeCard, normalizeEffect, RARITIES } from '../src/combat/schema.js';
import { relicById, relicPassive } from '../src/combat/relics/index.js';
import { createGenerationFixture } from './helpers/combat-generation-fixture.js';
import { generateEntities, growthEntity, templateEnemy } from '../src/combat/generation.js';
import { CARD_TEMPLATES, cardFromValues, solveCardTemplate, templateCosts, templateAllowedFor, templateFamily } from '../src/combat/card-templates.js';
import { buildChallengeSetup } from '../src/combat/challenge-setup.js';
import { buildIntimateSetup } from '../src/combat/intimate-setup.js';
import { attributeViewFor, cardModelKey, computeEffectiveState } from '../src/combat/ledger.js';
import { attachLoot, buildCombatReport, collectTurns, reportIdFor } from '../src/combat/report.js';
import { emptyPick, flipCard, flipOrder, flipView, lootOf, normalizePick, pickCardChoice } from '../src/combat/flip.js';
import { updatePowerStatuses } from '../src/combat/power-state.js';
import { activePowers, battleView, combatFxSource, combatHitMarks, unitDetailView } from '../src/visual/igs-ui/combat-panel-model.js';
import { renderCombatPanelHtml } from '../src/visual/igs-ui/combat-panel-render.js';
import { createCombatPanelController } from '../src/visual/igs-ui/combat-panel.js';
import { CANVAS_BATTLE } from '../src/visual/igs-ui/combat-skin-registry.js';
import { applyHitMarks, COMBAT_HIT_REACT_ATTR, reactUnit, showHitFloats } from '../src/visual/igs-ui/combat-hit-fx.js';
import { attributeMultiplier, createAttributePolicy } from '../src/combat/attribute-policy.js';
import { fitCard } from '../src/combat/fixed-cards/dsl.js';
import { pickCards } from '../src/combat/policy.js';
import { SOURCE_CARD_MODELS, TEMPLATE_UPGRADE_MODELS, sameSourceValue, templateSourceUpgrade } from '../src/combat/card-source-models.js';
import { checkTemplateUpgradeCoverage, TEMPLATE_UPGRADE_POLICIES, templateUpgradeDecision } from '../src/combat/card-template-upgrades.js';
import { templateCardFace } from '../src/combat/card-template-definitions.js';
import { CARD_UPGRADE_RULES, upgradedCardFace } from '../src/combat/card-upgrade.js';
import { rewardCardView } from '../src/combat/reward-cards.js';
import { scanCombatTags } from '../src/scene/combat-directives.js';

const strike = { id: 'strike', name: '攻击', type: 'attack', rarity: 'common', cost: 0, effects: [{ op: 'damage', amount: 6, target: 'enemy' }] };
const policy = { version: 1, role: 'warrior', scores: { str: 15, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, proficiency: 2 };
function setup(version = 7, { cards = [strike], passives = [], foePassives = [], items } = {}) {
    return {
        rulesVersion: version, controlledId: 'hero',
        units: [
            { id: 'hero', name: '主角', side: 'ally', kind: 'deck', maxHp: 200, speed: 100,
                deck: Array.from({ length: 10 }, (_, n) => cards[n % cards.length].id),
                catalog: Object.fromEntries(cards.map(card => [card.id, card])), passives },
            { id: 'foe', name: '对手', side: 'enemy', kind: 'skill', maxHp: 500, speed: 100,
                skills: [{ id: 'hit', name: '攻击', intent: 'attack', effects: [{ op: 'damage', amount: 8, target: 'enemy' }] }], passives: foePassives },
        ], ...(items ? { items } : {}),
    };
}
function act(state, action) {
    const result = applyAction(state, action);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    return result;
}

test('v7 新局接受现有快照字段，v6 及更早存档仍按自身版本重放', () => {
    assert.equal(COMBAT_RULES.version, 7);
    for (const version of [3, 4, 5, 6, 7]) {
        const input = setup(version);
        if (version >= 6) {
            input.attributeRules = 1;
            input.hpLossRules = 1;
            input.units[0].attributePolicy = policy;
        }
        const initial = createBattle(input, 7);
        assert.equal(initial.ok, true, JSON.stringify(initial.error));
        const before = JSON.stringify(initial.state);
        const actions = [{ type: 'play', inst: initial.state.piles.hero.hand[0], targetId: 'foe' }, { type: 'end-turn' }];
        let state = initial.state;
        for (const action of actions) state = act(state, action).state;
        assert.equal(state.rulesVersion, version);
        assert.equal(state.units.foe.hp, version >= 6 ? 493 : 494);
        assert.equal(JSON.stringify(initial.state), before);
        const replay = replayBattle(input, 7, actions);
        assert.equal(replay.ok, true);
        assert.deepEqual(replay.state, state);
    }
});

test('属性策略 v2：主属性 20 伤害不低于 2.5 倍且不随等级变化，v1 对局按旧公式重放，版本错配拒收', () => {
    const scores = { str: 20, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    const make = (version, proficiency, str = 20) => ({ version, role: 'warrior', scores: { ...scores, str }, proficiency });
    assert.ok(attributeMultiplier(make(2, 2), 'str') >= 2.5);
    assert.equal(attributeMultiplier(make(2, 2), 'str'), attributeMultiplier(make(2, 6), 'str'));
    assert.equal(attributeMultiplier(make(2, 2, 30), 'str'), 3);
    assert.equal(attributeMultiplier(make(2, 2, 1), 'str'), 0.7);
    assert.ok(attributeMultiplier(make(2, 2), 'str', 'support') < attributeMultiplier(make(2, 2), 'str'));
    assert.equal(attributeMultiplier(make(1, 2, 15), 'str'), 1.16);
    assert.equal(attributeMultiplier(make(1, 6, 15), 'str'), 1.3);
    assert.equal(createAttributePolicy({ attributes: { scores, proficiency: 2 }, classProfile: { archetype: 'warrior' } }).version, 2);

    const run = (version, rules, policyValue) => {
        const input = setup(version);
        input.attributeRules = rules;
        input.hpLossRules = 1;
        input.units[0].attributePolicy = policyValue;
        const initial = createBattle(input, 7);
        if (!initial.ok) return initial;
        const play = { type: 'play', inst: initial.state.piles.hero.hand[0], targetId: 'foe' };
        const result = act(initial.state, play);
        assert.deepEqual(replayBattle(input, 7, [play]).state, result.state);
        return result;
    };
    // v2：6 × 2.5 = 15，熟练加值（等级）不再改变结果。
    for (const proficiency of [2, 6]) assert.equal(run(7, 2, make(2, proficiency)).state.units.foe.hp, 485);
    // 旧 v1 策略（含已开局的 v7 对局）沿用 1 + 0.08 × (修正 + 熟练 − 2)：6 × 1.3 = 8。
    assert.equal(run(6, 1, make(1, 2)).state.units.foe.hp, 492);
    assert.equal(run(7, 1, make(1, 2)).state.units.foe.hp, 492);
    assert.equal(run(6, 2, make(2, 2)).error.reason, 'invalid-attribute-rules');
    assert.equal(run(7, 3, make(2, 2)).error.reason, 'invalid-attribute-rules');
    assert.equal(run(7, 2, make(1, 2)).error.reason, 'invalid-attribute-policy');
    assert.equal(run(7, 1, make(2, 2)).error.reason, 'invalid-attribute-policy');
});

test('自身回合受反击施加的虚弱保留至下一次自身回合结束，旧规则不变', () => {
    const reaction = { id: 'retort', name: '反制', trigger: 'on-hit', effects: [{ op: 'status', status: 'weak', stacks: 1, target: 'enemy' }] };
    for (const version of [6, 7]) {
        const input = setup(version, { foePassives: [reaction] });
        const initial = createBattle(input, 7);
        assert.equal(initial.ok, true);
        const play = { type: 'play', inst: initial.state.piles.hero.hand[0], targetId: 'foe' };
        const hit = act(initial.state, play);
        assert.equal(hit.state.units.hero.statuses.weak, 1);
        const before = JSON.stringify(hit.state);
        const ended = act(hit.state, { type: 'end-turn' });
        assert.equal(ended.state.units.hero.statuses.weak || 0, version === 7 ? 1 : 0);
        assert.equal(JSON.stringify(hit.state), before);
        const next = act(ended.state, { type: 'end-turn' });
        assert.equal(next.state.units.hero.statuses.weak || 0, 0);
        assert.deepEqual(replayBattle(input, 7, [play, { type: 'end-turn' }, { type: 'end-turn' }]).state, next.state);
    }
});

test('异方回合施加的虚弱覆盖目标下一次攻击，意图与实际伤害一致', () => {
    const weaken = { ...strike, id: 'weaken', effects: [{ op: 'status', status: 'weak', stacks: 1, target: 'enemy' }] };
    const initial = createBattle(setup(7, { cards: [weaken] }), 7);
    assert.equal(initial.ok, true);
    const hit = act(initial.state, { type: 'play', inst: initial.state.piles.hero.hand[0], targetId: 'foe' });
    assert.equal(describeIntent(hit.state, 'foe').damage, 6);
    const ended = act(hit.state, { type: 'end-turn' });
    const damage = ended.events.filter(e => e.type === 'damage' && e.source?.unitId === 'foe');
    assert.ok(damage.length > 0);
    assert.equal(damage[0].amount, 6);
    assert.equal(ended.state.units.foe.statuses.weak || 0, 0);
});

test('高速敌人的一层虚弱只覆盖一次自身行动，不按玩家回合延长', () => {
    const weaken = { ...strike, effects: [{ op: 'status', status: 'weak', stacks: 1, target: 'enemy' }] };
    const input = setup(7, { cards: [weaken] });
    input.units[1].speed = 220;
    const initial = createBattle(input, 7);
    assert.equal(initial.ok, true);
    const hit = act(initial.state, { type: 'play', inst: initial.state.piles.hero.hand[0], targetId: 'foe' });
    const ended = act(hit.state, { type: 'end-turn' });
    const amounts = ended.events.filter(e => e.type === 'damage' && e.source?.unitId === 'foe').map(e => e.amount);
    assert.ok(amounts.length >= 2);
    assert.deepEqual(amounts.slice(0, 2), [6, 8]);
});

test('v7 同回合连续用药只扣库存，每次照常触发装备；v6 保留限次', () => {
    const items = [
        { itemId: 'potion', name: '药水', count: 2, effects: [{ op: 'heal', amount: 5, target: 'self' }] },
        { itemId: 'ward', name: '屏障', count: 1, effects: [{ op: 'block', amount: 3, target: 'self' }] },
    ];
    const passive = { id: 'item-guard', name: '药效', trigger: 'item-used', effects: [{ op: 'block', amount: 2, target: 'self' }] };
    for (const version of [6, 7]) {
        const input = setup(version, { items, passives: [passive] });
        input.units[0].hp = 100;
        const initial = createBattle(input, 7);
        assert.equal(initial.ok, true);
        const action = { type: 'item', itemId: 'potion' };
        const first = act(initial.state, action);
        assert.equal(first.state.units.hero.hp, 105);
        const second = applyAction(first.state, action);
        if (version === 6) {
            assert.equal(second.ok, false);
            assert.equal(second.error.reason, 'item-used');
            continue;
        }
        assert.equal(second.ok, true);
        assert.equal(second.state.units.hero.hp, 110);
        assert.equal(second.state.units.hero.block, 4);
        assert.equal(second.state.items.list[0].count, 0);
        const empty = applyAction(second.state, action);
        assert.equal(empty.ok, false);
        assert.equal(empty.error.reason, 'item-empty');
        const third = act(second.state, { type: 'item', itemId: 'ward' });
        assert.equal(third.state.units.hero.block, 9);
        assert.equal(third.state.units.hero.energy, initial.state.units.hero.energy);
        assert.deepEqual(replayBattle(input, 7, [action, action, { type: 'item', itemId: 'ward' }]).state, third.state);
        assert.equal(initial.state.items.list[0].count, 2);
    }
});

test('普通战斗药品已扣、伤势入账失败后刷新只补结算，不重发或重复扣药', async (t) => {
    const chat = [{ is_user: false, mes: '[igs-combat:start|林间遭遇|史莱姆|我|normal]', swipe_id: 0 }];
    const located = locateCombatStart(chat, 0);
    assert.equal(located.ok, true);
    const input = setup(7, { items: [{ itemId: 'potion', name: '药水', count: 2, effects: [{ op: 'heal', amount: 5, target: 'self' }] }] });
    input.units[0].hp = 100;
    input.canEscape = true;
    const actions = [{ type: 'item', itemId: 'potion' }, { type: 'escape' }];
    assert.equal(replayBattle(input, 7, actions).ok, true);
    const storage = createCountingStorage();
    storage.setItem(sessionKeyFor('partial-settlement'), JSON.stringify({ v: SESSION_VERSION,
        combatId: located.combatId, anchor: located.anchor, seed: 7, setup: input, actions,
        encounter: located.start.encounter, tiers: ['normal'], expTargets: [],
    }));
    const committed = new Map();
    let stock = 2;
    let failWound = true;
    let sends = 0;
    let clock = 1;
    const ledger = {
        read: async () => ({ ok: true, entries: [...committed.values()] }),
        append: async entries => {
            for (const entry of entries) {
                const previous = committed.get(entry.id);
                if (previous) { assert.deepEqual(entry, previous); continue; }
                if (entry.type === 'wound' && failWound) { failWound = false; return { ok: false, reason: 'wound-offline' }; }
                committed.set(entry.id, structuredClone(entry));
                if (entry.type === 'consume') stock -= entry.payload.count;
            }
            return { ok: true };
        },
        scan: async () => ({ ok: true }),
    };
    const make = () => createCombatSession({ chat, storage, ledger, userName: '主角', getChatId: () => 'partial-settlement', now: () => clock++,
        send: async text => { sends += 1; chat.push({ is_user: true, mes: text }); return { ok: true, messageId: chat.length - 1 }; } });
    const first = make();
    t.after(() => first.dispose());
    assert.equal(first.resume().ok, true);
    assert.equal((await first.finish()).reason, 'combat-settlement-failed');
    assert.equal(first.state().settlementError, 'wound-offline');
    assert.equal(first.state().reportDelivered, true);
    assert.equal(stock, 1);
    first.flushPersist();
    const restored = make();
    t.after(() => restored.dispose());
    assert.equal(restored.resume().ok, true);
    assert.equal((await restored.reconcileDelivered()).ok, true);
    assert.equal(restored.state().status, 'done');
    assert.equal(stock, 1);
    assert.equal(sends, 1);
    assert.deepEqual([...committed.values()].map(entry => entry.type).sort(), ['consume', 'wound']);
});

test('铁额将弃牌放到抽牌堆顶，下一回合先抽到；旧式回收仍加入手牌', () => {
    const iron = fixedCard('fx-warrior-35');
    for (const [version, top] of [[7, true], [6, false]]) {
        const input = setup(version, { cards: [strike, iron] });
        input.units[0].draw = 10;
        const initial = createBattle(input, 7);
        assert.equal(initial.ok, true, JSON.stringify(initial.error));
        const fodder = initial.state.piles.hero.hand.find(inst => initial.state.cards[inst].cardId === strike.id);
        const headbutt = initial.state.piles.hero.hand.find(inst => initial.state.cards[inst].cardId === iron.id);
        assert.ok(fodder && headbutt);
        const actions = [{ type: 'play', inst: fodder, targetId: 'foe' }, { type: 'play', inst: headbutt, targetId: 'foe' }];
        const discarded = act(initial.state, actions[0]);
        const retrieved = act(discarded.state, actions[1]);
        assert.equal(retrieved.state.piles.hero.discard.includes(fodder), false);
        assert.equal(retrieved.state.piles.hero.hand.includes(fodder), !top);
        assert.ok(retrieved.events.some(e => e.type === 'fetch' && e.inst === fodder && e.to === (top ? 'draw' : 'hand')));
        if (top) {
            assert.equal(retrieved.state.piles.hero.draw.at(-1), fodder);
            actions.push({ type: 'end-turn' });
            const next = act(retrieved.state, actions.at(-1));
            assert.equal(next.state.piles.hero.hand[0], fodder);
            assert.deepEqual(replayBattle(input, 7, actions).state, next.state);
        } else assert.deepEqual(replayBattle(input, 7, actions).state, retrieved.state);
    }
    const up = { ...iron, ...iron.upgraded };
    const window = rarityWindow(iron.cost, iron.rarity);
    assert.ok(estimateCardValue(iron) >= window.min && estimateCardValue(iron) <= window.max);
    assert.ok(estimateCardValue(up) > estimateCardValue(iron));
    console.log(JSON.stringify({ card: iron.id, damage: iron.effects[0].amount, upgradedDamage: up.effects[0].amount, value: estimateCardValue(iron), upgradedValue: estimateCardValue(up), window }));
});

test('头槌模板可求解、指定数值及升级，正式生成建局后按版本回顶或回手', async (t) => {
    const retrieve = { op: 'retrieve', amount: 1, from: 'discard', to: 'top' };
    assert.equal(templateFamily('headbutt'), 'pile');
    for (const archetype of ['warrior', 'guardian', 'ranger', 'assassin', 'mage', 'priest', 'summoner', 'bard']) {
        assert.equal(templateAllowedFor('headbutt', archetype), true, archetype);
    }
    assert.equal(solveCardTemplate('headbutt', 0, 'common'), null);
    for (const cost of [1, 2, 3]) {
        const solved = solveCardTemplate('headbutt', cost, 'common');
        assert.ok(solved?.upgraded, `cost:${cost}`);
        assert.deepEqual(solved.effects[1], retrieve);
        assert.deepEqual(solved.upgraded.effects[1], retrieve);
        const base = { ...solved, cost, rarity: 'common' };
        const window = rarityWindow(cost, 'common');
        assert.ok(estimateCardValue(base) >= window.min && estimateCardValue(base) <= window.max);
        assert.ok(estimateCardValue({ ...base, ...solved.upgraded }) > estimateCardValue(base));
        assert.ok(estimateCardValue({ ...base, ...solved.upgraded }) <= window.max * COMBAT_RULES.upgradeAllowance);
    }
    const explicit = cardFromValues('headbutt', 1, 'common', [5]);
    assert.ok(explicit.card, JSON.stringify(explicit));
    assert.equal(explicit.card.effects[0].amount, 5);
    assert.deepEqual(explicit.card.effects[1], retrieve);
    assert.deepEqual(explicit.card.upgraded.effects[1], retrieve);

    const fixture = await createGenerationFixture();
    t.after(fixture.dispose);
    const hero = await fixture.hero();
    const { entity } = growthEntity({ kind: 'learn', skill: '头槌', rarity: 'common',
        description: '伤害；将弃牌堆的 1 张牌放到抽牌堆顶',
        anchor: { messageId: 1, swipeId: 0, tagHash: 'headbutt', occurrence: 0 } }, hero);
    assert.ok(entity.input.templates.includes('headbutt'));
    assert.deepEqual(entity.input.templateVars.headbutt, [[1, 30]]);
    for (const values of [undefined, [5]]) {
        const generated = await generateEntities([entity], { llm: { source: 'tavern' }, retryDelays: [],
            request: async () => JSON.stringify({ entities: [{ key: entity.key,
                value: { name: '头槌', template: 'headbutt', cost: 1, ...(values ? { values } : {}) } }] }) });
        assert.equal(generated.ok, true, JSON.stringify(generated.rejected));
        const card = generated.accepted[0].entry.payload.card;
        assert.deepEqual(card.effects[1], retrieve);
        assert.deepEqual(card.upgraded.effects[1], retrieve);
        if (values) assert.equal(card.effects[0].amount, values[0]);
        else assert.deepEqual(card.effects, solveCardTemplate('headbutt', 1, 'common').effects);
        const character = { ...hero, profile: { ...hero.profile, base: { ...hero.profile.base, draw: 10 } },
            catalog: new Map([[strike.id, strike], [card.id, card]]),
            deckEntries: Array.from({ length: 10 }, (_, n) => ({ cardId: n % 2 ? card.id : strike.id, upgraded: false })) };
        const built = buildSetup({ heroId: hero.id, allies: [character], controllable: [hero.id],
            enemies: new Map([['史莱姆', templateEnemy('史莱姆', 'normal')]]) },
        { tier: 'normal', enemies: [{ name: '史莱姆', count: 1 }] }, { userName: hero.name });
        assert.equal(built.ok, true);
        assert.equal(built.setup.attributeRules, 2);
        for (const version of [6, 7]) {
            // v6 快照保留属性策略 v1，且不启用新增的升级卡面契约。
            const input = version === 7 ? built.setup : { ...built.setup, rulesVersion: 6, attributeRules: 1, cardUpgradeRules: undefined, exhaustRules: undefined,
                units: built.setup.units.map(unit => unit.attributePolicy ? { ...unit, attributePolicy: { ...unit.attributePolicy, version: 1 } } : unit) };
            assert.equal(input.rulesVersion, version);
            const initial = createBattle(input, 7);
            assert.equal(initial.ok, true, JSON.stringify(initial.error));
            const hand = initial.state.piles[hero.id].hand;
            const fodder = hand.find(inst => initial.state.cards[inst].cardId === strike.id);
            const headbutt = hand.find(inst => initial.state.cards[inst].cardId === card.id);
            const targetId = initial.state.order.find(id => initial.state.units[id].side === 'enemy');
            assert.ok(fodder && headbutt && targetId);
            const actions = [{ type: 'play', inst: fodder, targetId }, { type: 'play', inst: headbutt, targetId }];
            const result = act(act(initial.state, actions[0]).state, actions[1]);
            assert.ok(result.events.some(e => e.type === 'fetch' && e.inst === fodder && e.to === (version === 7 ? 'draw' : 'hand')));
            assert.equal(result.state.piles[hero.id].discard.includes(fodder), false);
            assert.equal(result.state.piles[hero.id].hand.includes(fodder), version === 6);
            if (version === 7) assert.equal(result.state.piles[hero.id].draw.at(-1), fodder);
            assert.deepEqual(replayBattle(input, 7, actions).state, result.state);
        }
    }
});

test('retrieve.to 校验往返保留置顶，缺省保持旧形状和回手行为', () => {
    const effect = { op: 'retrieve', amount: 1, from: 'discard' };
    assert.deepEqual(normalizeEffect(effect).value, effect);
    for (const to of ['hand', 'top']) {
        assert.deepEqual(normalizeEffect({ ...effect, to }).value, { ...effect, to });
    }
    assert.equal(normalizeEffect({ ...effect, to: 'bottom' }).ok, false);
    assert.equal(normalizeEffect({ ...effect, destination: 'top' }).ok, false);
    const recover = { ...strike, id: 'recover', type: 'skill', effects: [effect] };
    const input = setup(7, { cards: [strike, recover] });
    input.units[0].draw = 10;
    const initial = createBattle(input, 7);
    assert.equal(initial.ok, true);
    const fodder = initial.state.piles.hero.hand.find(inst => initial.state.cards[inst].cardId === strike.id);
    const fetch = initial.state.piles.hero.hand.find(inst => initial.state.cards[inst].cardId === recover.id);
    const actions = [{ type: 'play', inst: fodder, targetId: 'foe' }, { type: 'play', inst: fetch }];
    const result = act(act(initial.state, actions[0]).state, actions[1]);
    assert.equal(result.state.piles.hero.hand.includes(fodder), true);
    assert.deepEqual(replayBattle(input, 7, actions).state, result.state);
});

const VIGOR_RELICS = [
    ['rl-u-01', 'original', 8, 0], ['rl-c-19', 'split', 4, 0], ['rl-warrior-07', 'split', 3, 0],
    ['rl-s-16', 'split', 5, 1], ['rl-r-23', 'split', 3, 3], ['rl-u-19', 'split', 4, 5],
    ['rl-priest-07', 'original', 3, 'create'],
];
for (const [id, model, stacks, trigger] of VIGOR_RELICS) test(`蓄势来源 ${id}/${model}：授予后用于下一次多段攻击且只消耗一次`, () => {
    const relic = relicById(id);
    const passive = relicPassive(relic, model);
    assert.ok(passive, id);
    const multi = { ...strike, id: 'multi', effects: [{ ...strike.effects[0], hits: 2 }] };
    const creator = { ...strike, id: 'creator', type: 'skill', effects: [{ op: 'copy', amount: 2, from: 'self', to: 'discard' }] };
    const input = setup(7, { cards: [multi, creator], passives: [passive] });
    input.units[0].draw = 10;
    input.units[1].maxHp = 9999;
    const initial = createBattle(input, 7);
    assert.equal(initial.ok, true, JSON.stringify(initial.error));
    let state = initial.state;
    const actions = [];
    const play = cardId => {
        const inst = state.piles.hero.hand.find(key => state.cards[key].cardId === cardId);
        assert.ok(inst, `${id}: ${cardId}`);
        const action = { type: 'play', inst, ...(cardId === multi.id ? { targetId: 'foe' } : {}) };
        actions.push(action);
        const result = act(state, action);
        state = result.state;
        return result;
    };
    if (trigger === 'create') play(creator.id);
    else for (let count = 0; count < trigger; count += 1) {
        if (!state.piles.hero.hand.some(inst => state.cards[inst].cardId === multi.id)) {
            actions.push({ type: 'end-turn' });
            state = act(state, actions.at(-1)).state;
        }
        play(multi.id);
    }
    assert.equal(state.units.hero.statuses.vigor, stacks, `${relic.name} 授予后不得同次清空`);
    if (!state.piles.hero.hand.some(inst => state.cards[inst].cardId === multi.id)) {
        actions.push({ type: 'end-turn' });
        state = act(state, actions.at(-1)).state;
    }
    const attacked = play(multi.id);
    const damage = attacked.events.filter(event => event.type === 'damage' && event.source?.id === multi.id);
    assert.deepEqual(damage.map(event => event.amount), [6 + stacks, 6 + stacks], relic.name);
    assert.equal(state.units.hero.statuses.vigor || 0, 0, `${relic.name} 攻击完成后消耗`);
    assert.deepEqual(replayBattle(input, 7, actions).state, state);
});

test('v7 蓄势消耗跨选牌挂起保留，攻击后新获层数留给下一次；v6 重放保持旧行为', () => {
    const opening = relicPassive(relicById('rl-u-01'), 'original');
    const knuckle = relicPassive(relicById('rl-s-16'), 'split');
    const held = { ...strike, id: 'held', effects: [...strike.effects, { op: 'topdeck', amount: 1, mode: 'choose' }] };
    for (const version of [6, 7]) {
        const input = setup(version, { cards: [held, strike], passives: [opening, knuckle] });
        input.units[0].draw = 10;
        const initial = createBattle(input, 7);
        assert.equal(initial.ok, true, JSON.stringify(initial.error));
        const inst = initial.state.piles.hero.hand.find(key => initial.state.cards[key].cardId === held.id);
        const play = { type: 'play', inst, targetId: 'foe' };
        const paused = act(initial.state, play);
        assert.ok(paused.state.pending);
        assert.equal(paused.events.find(event => event.type === 'damage' && event.source?.id === held.id).amount, 14);
        assert.equal(paused.state.units.hero.statuses.vigor, 8);
        const before = JSON.stringify(paused.state);
        const choose = { type: 'choose', insts: [paused.state.pending.options[0]] };
        const resumed = act(paused.state, choose);
        assert.equal(JSON.stringify(paused.state), before);
        // v6 的出伤记录仅在单次调用内，保留其既有挂起恢复语义。
        assert.equal(resumed.state.units.hero.statuses.vigor || 0, version === 7 ? 5 : 13);
        assert.equal(resumed.state.units.hero.res?.attackWindow, undefined);
        assert.deepEqual(replayBattle(input, 7, [play, choose]).state, resumed.state);
    }
    for (const version of [6, 7]) {
        const input = setup(version, { passives: [knuckle] });
        const initial = createBattle(input, 7);
        assert.equal(initial.ok, true);
        const play = { type: 'play', inst: initial.state.piles.hero.hand[0], targetId: 'foe' };
        const result = act(initial.state, play);
        assert.equal(result.state.units.hero.statuses.vigor || 0, version === 7 ? 5 : 0);
        assert.deepEqual(replayBattle(input, 7, [play]).state, result.state);
    }
});

test('七类蓄势经真实装备建局授予、加伤并消耗，卸下后不再生效', async (t) => {
    const fixture = await createGenerationFixture();
    t.after(fixture.dispose);
    const hero = await fixture.hero();
    const multi = { ...strike, id: 'equipped-multi', effects: [{ ...strike.effects[0], hits: 2 }] };
    const creator = { ...strike, id: 'equipped-creator', type: 'skill', effects: [{ op: 'copy', amount: 2, from: 'self', to: 'discard' }] };
    const character = { ...hero, profile: { ...hero.profile, base: { ...hero.profile.base, draw: 10 } },
        catalog: new Map([[multi.id, multi], [creator.id, creator]]),
        deckEntries: Array.from({ length: 10 }, (_, n) => ({ cardId: n < 8 ? multi.id : creator.id, upgraded: false })) };
    const template = templateEnemy('史莱姆', 'normal');
    const enemy = { ...template, base: { ...template.base, hp: 9999 } };
    for (const [id, model, stacks, trigger] of VIGOR_RELICS) {
        const relic = relicById(id);
        const passive = relicPassive(relic, model);
        const equipped = relic.home === 'trait'
            ? { traits: [{ traitId: id, kind: 'passive', passive }], gear: { slots: {} } }
            : { traits: [], gear: { slots: { treasure: [{ gearId: id, name: relic.name, passive }] } } };
        const build = (extra) => buildSetup({ heroId: hero.id, allies: [{ ...character, ...extra }], controllable: [hero.id],
            enemies: new Map([['史莱姆', enemy]]) }, { tier: 'normal', enemies: [{ name: '史莱姆', count: 1 }] }, { userName: hero.name });
        const built = build(equipped);
        assert.equal(built.ok, true, id);
        const unit = built.setup.units.find(entry => entry.id === hero.id);
        const carried = unit.passives.find(entry => entry.id === passive.id);
        assert.deepEqual(carried, { ...passive, source: relic.home === 'trait' ? 'trait' : 'gear' });
        const removed = build({ traits: [], gear: { slots: {} } });
        assert.equal(removed.ok, true);
        assert.equal(removed.setup.units.find(entry => entry.id === hero.id).passives.some(entry => entry.id === passive.id), false);
        const exercise = (input, active) => {
            const initial = createBattle(input, 7);
            assert.equal(initial.ok, true, JSON.stringify(initial.error));
            let state = initial.state;
            assert.deepEqual(state.units[hero.id].passives.find(entry => entry.id === passive.id), active ? carried : undefined);
            assert.equal(state.units[hero.id].statuses.vigor || 0, active && trigger === 0 ? stacks : 0, `${id}: 开局`);
            const actions = [];
            const play = cardId => {
                const inst = state.piles[hero.id].hand.find(key => state.cards[key].cardId === cardId);
                assert.ok(inst, `${id}: ${cardId}`);
                const targetId = state.order.find(key => state.units[key].side === 'enemy');
                const action = { type: 'play', inst, ...(cardId === multi.id ? { targetId } : {}) };
                actions.push(action);
                const result = act(state, action);
                state = result.state;
                return result;
            };
            if (trigger === 'create') play(creator.id);
            else for (let count = 0; count < trigger; count += 1) play(multi.id);
            assert.equal(state.units[hero.id].statuses.vigor || 0, active ? stacks : 0, `${id}: 授予`);
            const attacked = play(multi.id);
            assert.equal(state.units[hero.id].statuses.vigor || 0, 0, `${id}: 消耗`);
            assert.deepEqual(replayBattle(input, 7, actions).state, state);
            return attacked.events.filter(e => e.type === 'damage' && e.source?.id === multi.id).map(e => e.amount);
        };
        const boosted = exercise(built.setup, true);
        const baseline = exercise(removed.setup, false);
        assert.equal(baseline.length, 2, id);
        assert.deepEqual(boosted, baseline.map(amount => amount + stacks), `${id}: 每段加伤`);
    }
});


test('敌人新建局仅压缩高于100的速度，三种入口一致且旧setup不重算', () => {
    assert.equal(enemySpeedFor(120), 110);
    assert.equal(enemySpeedFor(90), 90);
    const template = templateEnemy('史莱姆', 'normal');
    const start = { enemies: [{ name: '史莱姆', count: 1 }] };
    for (const [speed, expected] of [[120, 110], [90, 90]]) {
        const enemy = { ...template, base: { ...template.base, speed } };
        const built = enemyUnits(start, new Map([['史莱姆', enemy]]), 1, 'normal');
        assert.equal(built.units[0].speed, expected);
    }
    const state = { bars: { stamina: 100, stress: 0 }, skills: { 话术: { value: 60 } } };
    const daily = buildChallengeSetup({ start: { event: '终面', domain: '话术', tier: '普通' }, state, user: { name: '我' } });
    const intimate = buildIntimateSetup({ start: { event: '合拍', intimate: true, mechanic: '合拍', tier: '普通' }, state, user: { name: '我' } });
    for (const [built, id] of [[daily, daily.setup?.challenge.foe], [intimate, 'intimate']]) {
        assert.equal(built.ok, true, JSON.stringify(built));
        const foe = built.setup.units.find(unit => unit.side === 'enemy');
        assert.equal(foe.speed, enemySpeedFor(combatSpeedFor({ tier: 'elite', id })));
        assert.equal(createBattle(built.setup, 7).ok, true);
    }
    const legacy = setup(6);
    legacy.units[1].speed = 120;
    const initial = createBattle(legacy, 7);
    assert.equal(initial.ok, true);
    assert.equal(initial.state.units.foe.speed, 120);
    const action = { type: 'end-turn' };
    const next = act(initial.state, action);
    assert.equal(next.state.units.foe.speed, 120);
    assert.deepEqual(replayBattle(legacy, 7, [action]).state, next.state);
});


test('关系标签经账本与真实建局器生效，1级下限不抵消远逊和稍弱倍率', async (t) => {
    const fixture = await createGenerationFixture();
    t.after(fixture.dispose);
    const chat = fixture.host.SillyTavern.getContext().chat;
    chat.splice(1);
    const ledger = fixture.services.getLedger();
    const template = templateEnemy('史莱姆', 'normal');
    const enemy = { ...template, base: { ...template.base, hp: 200, speed: 120 } };
    const start = { tier: 'normal', enemies: [{ name: '史莱姆', count: 1 }] };
    const build = (hero, attributes) => buildSetup({ heroId: hero.id, allies: [hero], controllable: [hero.id],
        enemies: new Map([['史莱姆', enemy]]), enemyAttributes: new Map([['史莱姆', attributes]]) }, start, { userName: hero.name });
    let state = await ledger.effectiveState();
    assert.equal(state.ok, true);
    let hero = state.characters.get(state.attributes.heroId);
    assert.equal(hero.level, 1);
    const untagged = attributeViewFor(state, '史莱姆');
    assert.equal(untagged.tier, 'even');
    assert.equal(untagged.relTagged, false);
    const plain = build(hero, untagged);
    assert.equal(plain.ok, true);
    const saved = structuredClone(plain.setup);
    const original = createBattle(saved, 7);
    assert.equal(original.ok, true, JSON.stringify(original.error));
    for (const [label, tier, hp, damage, speed] of [['远逊', 'outclassed', 0.5, 0.5, 0.85], ['稍弱', 'weaker', 0.75, 0.75, 0.93]]) {
        chat.push({ is_user: false, mes: `[igs-combat:rel|史莱姆|${label}]`, swipe_id: 0 });
        assert.equal((await ledger.scan()).ok, true);
        state = await ledger.effectiveState();
        hero = state.characters.get(state.attributes.heroId);
        const attributes = attributeViewFor(state, '史莱姆');
        assert.equal(attributes.tier, tier);
        assert.equal(attributes.relTagged, true);
        assert.equal(attributes.level, 1);
        const built = build(hero, attributes);
        const baseline = build(hero, { ...attributes, tier: 'even' });
        assert.equal(built.ok, true);
        assert.equal(baseline.ok, true);
        const foe = built.setup.units.find(unit => unit.side === 'enemy');
        const base = baseline.setup.units.find(unit => unit.side === 'enemy');
        assert.ok(Math.abs(foe.maxHp - base.maxHp * hp) <= 1);
        assert.ok(Math.abs(foe.damageScale - base.damageScale * damage) <= 0.01);
        assert.equal(foe.speed, Math.round(base.speed * speed));
        assert.equal(createBattle(built.setup, 7).ok, true);
    }
    for (const tier of ['stronger', 'formidable', 'overwhelming']) {
        const reference = enemyUnits(start, new Map([['史莱姆', enemy]]), 1, 'normal', new Map([['史莱姆', { ...untagged, tier: 'even' }]])).units[0];
        const actual = enemyUnits(start, new Map([['史莱姆', enemy]]), 1, 'normal', new Map([['史莱姆', { ...untagged, tier }]])).units[0];
        assert.deepEqual(actual, reference);
    }
    assert.deepEqual(createBattle(saved, 7).state, original.state);
    const action = { type: 'end-turn' };
    assert.deepEqual(replayBattle(saved, 7, [action]).state, act(original.state, action).state);
});

test('持续状态来源随叠加、倍增、消耗和清零同步，不写入无能力来源的旧状态', () => {
    const unit = { statuses: {}, res: { forge: { value: 3 } } };
    const source = { ownerId: 'hero', cardId: 'power-a' };
    const update = (previous, stacks, from) => {
        updatePowerStatuses(unit, 'vigor', previous, stacks, from);
        const groups = unit.res?.powerStatuses?.vigor;
        if (groups) assert.equal(groups.reduce((sum, group) => sum + group.stacks, 0), stacks);
        return groups;
    };
    assert.equal(update(0, 2, null), undefined);
    assert.deepEqual(update(2, 5, source), [{ stacks: 2 }, { stacks: 3, ...source }]);
    assert.deepEqual(update(5, 7, null).at(-1), { stacks: 2 });
    const doubled = update(7, 14, undefined);
    assert.equal(doubled.filter(group => group.cardId).reduce((sum, group) => sum + group.stacks, 0), 6);
    assert.equal(update(14, 13, undefined).reduce((sum, group) => sum + group.stacks, 0), 13);
    update(13, 0, undefined);
    assert.deepEqual(unit.res, { forge: { value: 3 } });
    const legacy = { statuses: {} };
    updatePowerStatuses(legacy, 'strength', 0, 2, null);
    updatePowerStatuses(legacy, 'strength', 2, 4, undefined);
    assert.deepEqual(legacy, { statuses: {} });
});

test('四类固定能力牌经真实建局器生效，持续视图和触发战报不依赖上一张出牌', async (t) => {
    const fixture = await createGenerationFixture();
    t.after(fixture.dispose);
    const base = await fixture.hero();
    const ids = ['fx-warrior-22', 'fx-general-31', 'fx-guardian-06', 'fx-assassin-63', 'fx-general-29'];
    for (const id of ids) {
        const card = fixedCard(id);
        assert.ok(card, id);
        const hero = { ...base, profile: { ...base.profile, base: { ...base.profile.base, energy: 10 } },
            catalog: new Map([[id, card]]), deckEntries: Array.from({ length: 20 }, (_, i) => ({ cardId: id, copyId: `power:${i}`, upgraded: false })) };
        const enemy = templateEnemy('史莱姆', 'normal');
        const built = buildSetup({ heroId: hero.id, allies: [hero], controllable: [hero.id],
            enemies: new Map([['史莱姆', { ...enemy, base: { ...enemy.base, hp: 500 } }]]) },
        { tier: 'normal', enemies: [{ name: '史莱姆', count: 1 }] }, { userName: hero.name });
        assert.equal(built.ok, true, id);
        const initial = createBattle(built.setup, 7);
        assert.equal(initial.ok, true, JSON.stringify(initial.error));
        assert.deepEqual(activePowers(initial.state, hero.id), []);
        const play = { type: 'play', inst: initial.state.piles[hero.id].hand[0] };
        const played = act(initial.state, play);
        const powers = activePowers(played.state, hero.id);
        assert.equal(powers.find(power => power.id === id)?.name, card.name, id);
        assert.ok(unitDetailView(played.state, hero.id).groups.some(group => group.label === '持续能力' && group.items.some(item => item.name === card.name)));
        const ended = act(played.state, { type: 'end-turn' });
        const events = [...initial.events, ...played.events, ...ended.events];
        if (id === 'fx-guardian-06') {
            assert.equal(played.state.units[hero.id].statuses.barricade, 1);
            assert.equal(played.state.units[hero.id].res.powerStatuses.barricade[0].cardId, id);
        } else {
            const trigger = events.find(event => ['power-trigger', 'buff-trigger'].includes(event.type) && (event.cardId || event.buffId) === id);
            assert.equal(trigger?.name, card.name, id);
            if (id === 'fx-general-29') assert.equal(trigger.trigger, 'turn-end');
            const turns = collectTurns(events, ended.state.units, ended.state.catalog);
            const entries = turns.flatMap(turn => turn.powers || []).filter(power => power.skill === card.name);
            assert.ok(entries.length > 0, id);
            assert.ok(entries.some(power => power.targets.size > 0), id);
            const report = buildCombatReport({ combatId: id, state: { ...ended.state, outcome: 'victory' }, events });
            assert.equal(report.ok, true);
            assert.ok(report.text.includes(`「${card.name}」触发`), report.text);
        }
        assert.deepEqual(replayBattle(built.setup, 7, [play, { type: 'end-turn' }]).state, ended.state);
    }
});

test('持续能力徽章覆盖默认与九套画布皮肤，触发反馈重复播放时不残留旧计时', async () => {
    const { JSDOM } = await import('jsdom');
    const card = fixedCard('fx-warrior-22');
    const built = createBattle(setup(7, { cards: [{ ...card, cost: 0 }] }), 7);
    assert.equal(built.ok, true, JSON.stringify(built.error));
    const played = act(built.state, { type: 'play', inst: built.state.piles.hero.hand[0] });
    const view = battleView(played.state);
    assert.equal(view.allies[0].powers[0].name, card.name);
    for (const skin of ['initial', ...Object.keys(CANVAS_BATTLE)]) {
        for (const orient of ['port', 'land']) {
            const dom = new JSDOM(renderCombatPanelHtml({ status: 'battle', battle: view, skin, orient }));
            const badge = dom.window.document.querySelector('.igs-combat-power');
            assert.ok(badge, `${skin}/${orient}`);
            assert.match(badge.getAttribute('data-scale-tip'), new RegExp(card.name));
            dom.window.close();
        }
    }
    const ended = act(played.state, { type: 'end-turn' });
    const marks = combatHitMarks(ended.events).find(entry => entry.unitId === 'hero').marks;
    assert.ok(marks.some(mark => mark.kind === 'power' && mark.text === card.name));
    assert.deepEqual(applyHitMarks({ hp: 10, maxHp: 20, alive: true }, marks.filter(mark => mark.kind === 'power')), { hp: 10, maxHp: 20, alive: true });
    assert.equal(combatFxSource(ended.events, ended.state).hits.every(hit => hit.skill !== card.name || hit.attacker === '主角'), true);
    const dom = new JSDOM('<div class="igs-combat-unit"></div>');
    const el = dom.window.document.querySelector('div');
    const timers = [];
    const schedule = (fn) => timers.push(fn);
    assert.equal(reactUnit(el, [{ kind: 'power', text: card.name }], { schedule }), 'power');
    assert.equal(reactUnit(el, [{ kind: 'power', text: card.name }], { schedule }), 'power');
    timers[0]();
    assert.equal(el.getAttribute(COMBAT_HIT_REACT_ATTR), 'power');
    timers[1]();
    assert.equal(el.hasAttribute(COMBAT_HIT_REACT_ATTR), false);
    const floats = showHitFloats(dom.window.document, el, [{ kind: 'power', text: card.name }], { schedule });
    assert.equal(floats[0].textContent, card.name);
    timers.at(-1)();
    assert.equal(el.querySelector('.igs-combat-float'), null);
    dom.window.close();
});
test('状态、心境与职业资源注释：全部状态有说明，卡面心境词、状态片与资源条在默认及九套皮肤都带悬停注释', async () => {
    const { JSDOM } = await import('jsdom');
    const { STATUSES } = await import('../src/combat/schema.js');
    const { registeredStatuses } = await import('../src/combat/mechanics/registry.js');
    const { STATUS_TIPS, RESOURCE_TIPS } = await import('../src/visual/igs-ui/combat-status-tips.js');
    const { describeEffectParts, describeEffects } = await import('../src/visual/igs-ui/combat-card-art.js');
    assert.deepEqual([...new Set([...STATUSES, ...registeredStatuses()])].filter(key => !STATUS_TIPS[key]), []);
    const parts = describeEffectParts([{ op: 'enter-stance', stance: 'calm' }, { op: 'momentum', amount: 2 }]);
    assert.equal(parts.find(part => part.text === '静心')?.tip, RESOURCE_TIPS['stance:calm']);
    assert.equal(parts.find(part => part.text === '乐势')?.tip, RESOURCE_TIPS.momentum);
    assert.equal(describeEffects([{ op: 'enter-stance', stance: 'calm' }, { op: 'enter-stance', stance: 'neutral' }]), '进入静心。回到中立心境');
    const built = createBattle(setup(7), 7);
    assert.equal(built.ok, true, JSON.stringify(built.error));
    const state = structuredClone(built.state);
    state.units.hero.statuses = { ...state.units.hero.statuses, weak: 1, 'calm-guard': 2 };
    state.units.hero.res = { stance: 'calm', momentum: 3 };
    state.units.foe.statuses = { ...state.units.foe.statuses, vulnerable: 2 };
    const view = battleView(state);
    for (const skin of ['initial', ...Object.keys(CANVAS_BATTLE)]) {
        for (const orient of ['port', 'land']) {
            const dom = new JSDOM(renderCombatPanelHtml({ status: 'battle', battle: view, skin, orient }));
            const doc = dom.window.document;
            const tip = (selector) => doc.querySelector(selector)?.getAttribute('data-scale-tip') || '';
            assert.match(tip('[data-unit="hero"] [data-status="weak"]'), /虚弱 1 层：造成的攻击伤害 -25%/, `${skin}/${orient}`);
            assert.match(tip('[data-unit="hero"] [data-status="calm-guard"]'), /止水 2 层：回合结束时仍在静心/, `${skin}/${orient}`);
            assert.match(tip('[data-unit="foe"] [data-status="vulnerable"]'), /易伤 2 层/, `${skin}/${orient}`);
            assert.ok(tip('[data-res="stance"]').includes(RESOURCE_TIPS['stance:calm']), `${skin}/${orient}`);
            assert.ok(tip('[data-res="stance"]').includes('乐势 3/10'), `${skin}/${orient}`);
            dom.window.close();
        }
    }
});
test('忽略诊断仅在v7发出，保留来源且不改变旧规则结算或重放', () => {
    for (const version of [3, 4, 5, 6, 7]) {
        const input = setup(version, { passives: [{ id: 'audit-passive', name: '诊断被动', trigger: 'battle-start', effects: [
            { op: 'audit-unknown' }, { op: 'offer-curse' },
        ] }] });
        const built = createBattle(input, 7);
        assert.equal(built.ok, true, JSON.stringify(built.error));
        const ignored = built.events.filter(event => event.type === 'effect-ignored');
        assert.deepEqual(ignored.map(event => [event.op, event.reason]), version === 7
            ? [['audit-unknown', 'unknown-op'], ['offer-curse', 'unit-kind']] : []);
        for (const event of ignored) assert.deepEqual(event.source, { unitId: 'hero', kind: 'passive', id: 'audit-passive' });
        assert.equal(built.state.units.hero.hp, 200);
        assert.equal(built.state.units.foe.hp, 500);
        assert.equal(built.state.pending, undefined);
        const action = { type: 'end-turn' };
        const ended = act(built.state, action);
        const replayed = replayBattle(input, 7, [action]);
        assert.deepEqual(replayed.state, ended.state);
        assert.deepEqual(replayed.events, [...built.events, ...ended.events]);
        const report = buildCombatReport({ combatId: 'ignored-legacy', state: { ...ended.state, outcome: 'escape' }, events: [...built.events, ...ended.events] });
        assert.equal(report.ok, true);
        assert.equal(report.text.includes('效果未结算'), version === 7);
        if (version === 7) {
            assert.match(report.text, /诊断被动.*audit-unknown：未知算子/);
            assert.match(report.text, /诊断被动.*offer-curse：不适用于该单位类型/);
        }
    }
});
test('能力触发与无出牌回合的忽略诊断保留来源，折叠战报不丢失', () => {
    const card = { id: 'audit-power', name: '诊断能力', type: 'power', cost: 0, effects: [
        { op: 'each-turn', then: [{ op: 'audit-unknown' }] },
    ] };
    const input = { ...setup(7, { cards: [card] }), canEscape: true };
    const built = createBattle(input, 7);
    assert.equal(built.ok, true, JSON.stringify(built.error));
    let state = built.state;
    const events = [...built.events];
    const actions = [{ type: 'play', inst: state.piles.hero.hand[0] }, ...Array.from({ length: 10 }, () => ({ type: 'end-turn' })), { type: 'escape' }];
    for (const action of actions) {
        const result = act(state, action);
        state = result.state;
        events.push(...result.events);
    }
    const ignored = events.filter(event => event.type === 'effect-ignored');
    assert.equal(ignored.length, 10);
    assert.ok(ignored.every(event => event.source.unitId === 'hero' && event.source.kind === 'power' && event.source.id === card.id));
    const turns = collectTurns(events, state.units, state.catalog);
    assert.equal(turns.flatMap(turn => turn.ignoredEffects || []).length, 10);
    for (const detail of ['normal', 'brief']) {
        const report = buildCombatReport({ combatId: 'ignored-power', state, events, detail });
        assert.equal(report.ok, true);
        assert.match(report.text, /第4–8回合：.*诊断能力.*audit-unknown：未知算子/);
    }
    const loneEvents = [events.find(event => event.type === 'turn-start' && event.side === 'ally'), ignored[0]];
    const lone = buildCombatReport({ combatId: 'ignored-alone', state, events: loneEvents });
    assert.match(lone.text, /主角的「诊断能力」效果未结算/);
    const replayed = replayBattle(input, 7, actions);
    assert.deepEqual(replayed.state, state);
    assert.deepEqual(replayed.events, events);
});

test('D2 固定卡保留手写值与升级结构，模板及指定数值同步提升', () => {
    const headbutt = fixedCard('fx-warrior-35');
    const pommel = fixedCard('fx-warrior-54');
    assert.deepEqual([headbutt.effects[0].amount, headbutt.upgraded.effects[0].amount], [9, 12]);
    assert.deepEqual([pommel.effects[0].amount, pommel.effects[1].amount,
        pommel.upgraded.effects[0].amount, pommel.upgraded.effects[1].amount], [9, 1, 10, 2]);
    assert.equal(fitCard(headbutt), headbutt);
    const raw = { id: 'fit-shape', name: '重击抽牌', type: 'attack', cost: 1, rarity: 'common',
        effects: [{ op: 'damage', amount: 30, target: 'enemy' }], upgraded: { effects: [
            { op: 'damage', amount: 35, target: 'enemy' }, { op: 'draw', amount: 1 },
        ] } };
    const fitted = fitCard(raw);
    assert.equal(evaluateCardBudget(fitted).ok, true);
    assert.deepEqual(fitted.upgraded.effects.map(effect => effect.op), ['damage', 'draw']);
    assert.equal(fitted.upgraded.effects[1].amount, 1);
    assert.equal(raw.effects[0].amount, 30);
    const solved = { cost: 1, rarity: 'common', ...solveCardTemplate('strike', 1, 'common') };
    assert.equal(evaluateCardBudget(solved).ok, true);
    assert.ok(solved.effects[0].amount >= 10);
    assert.ok(solved.upgraded.effects[0].amount - solved.effects[0].amount >= 3);
    const explicit = cardFromValues('headbutt', 1, 'common', [9]);
    assert.ok(explicit.card);
    assert.equal(explicit.card.effects[0].amount, 9);
});

test('D2 预算估值与战斗选牌估值分离，旧局自动选择不随预期格挡调参漂移', () => {
    const shield = { id: 'shield-choice', name: '盾击', type: 'attack', cost: 1, effects: [{ op: 'damage-from-block' }] };
    const draw = { id: 'draw-choice', name: '抽牌', type: 'skill', cost: 1, effects: [{ op: 'draw', amount: 2 }] };
    assert.equal(estimateEffectsValue(shield.effects), 10.67);
    assert.equal(estimateBattleEffectsValue(shield.effects), 8);
    const built = createBattle(setup(6, { cards: [shield, draw] }), 7);
    assert.equal(built.ok, true);
    const insts = [...built.state.piles.hero.hand, ...built.state.piles.hero.draw];
    const ordered = [draw, shield].map(card => insts.find(inst => cardView(built.state, inst).id === card.id));
    assert.ok(ordered.every(Boolean));
    assert.deepEqual(pickCards(built.state, ordered, 1, 'retrieve'), [ordered[0]]);
});

test('来源修订固定卡保留完整卡面与升级，旧 ID 仍可解析且新池只选修订版', () => {
    for (const [sourceModel, source] of Object.entries(SOURCE_CARD_MODELS)) {
        for (const slot of source.fixed) {
            const legacyId = `fx-${slot}`;
            const current = fixedCard(`${legacyId}-s1`);
            assert.ok(fixedCard(legacyId), legacyId);
            assert.equal(current.sourceModel, sourceModel);
            const normalized = normalizeCard(current);
            assert.equal(normalized.ok, true, JSON.stringify(normalized.errors));
            assert.ok(sameSourceValue(normalized.value.effects, source.face.effects));
            assert.ok(sameSourceValue(normalized.value.upgraded, source.face.upgraded));
            assert.equal(fitCard(current), current);
            const group = fixedCardGroup(current.id);
            assert.ok(fixedClassPool(group).some(card => card.id === current.id));
            assert.ok(!fixedClassPool(group).some(card => card.id === legacyId));
            assert.ok(compatibleFixedClassPool(group).some(card => card.id === legacyId));
            const tampered = { ...current, cost: current.cost === 0 ? 1 : 0 };
            assert.equal(normalizeCard(tampered).ok, false);
            assert.equal(evaluateCardBudget(tampered).reason, 'source-model-mismatch');
        }
    }
    const rush = fixedCard('fx-bard-49-s1');
    assert.equal(rush.cost, 1);
    assert.deepEqual(rush.upgraded, { cost: 0 });
    assert.equal(rush.effects[0].stacks, 2);
    const hologram = fixedCard('fx-mage-39-s1');
    assert.ok(hologram.effects.some(effect => effect.op === 'exhaust-self'));
    assert.ok(!hologram.upgraded.effects.some(effect => effect.op === 'exhaust-self'));
});

test('来源组件升级只改对应轴：降费不加格挡，抽牌和暗刃升级不增强附加组件', () => {
    for (const [key, cost, rarity, expected] of [
        ['rage-flow', 1, 'uncommon', 0], ['entrench', 2, 'uncommon', 1],
        ['slam', 1, 'common', 0], ['barricade', 3, 'epic', 2], ['overcharge', 1, 'rare', 0],
    ]) {
        const card = { cost, rarity, ...solveCardTemplate(key, cost, rarity) };
        assert.deepEqual(card.upgraded, { cost: expected }, key);
        assert.equal(evaluateCardBudget(card).ok, true, key);
        assert.equal(normalizeCard({ id: key, name: key, ...card }).ok, true, key);
    }
    for (const [key, delta] of [['cull', 1], ['brace', 3], ['adrenal', 1], ['bloodrush', 1], ['shiv-edge', 2]]) {
        const card = { cost: 1, rarity: 'uncommon', ...solveCardTemplate(key, 1, 'uncommon') };
        assert.ok(card.upgraded, key);
        assert.equal(card.upgraded.effects[0].amount, card.effects[0].amount + delta, key);
        assert.deepEqual(card.upgraded.effects.slice(1), card.effects.slice(1), key);
        const altered = { ...card, upgraded: { effects: [...card.upgraded.effects, { op: 'draw', amount: 1 }] } };
        assert.equal(evaluateCardBudget(altered).reason, 'upgrade-model-mismatch');
    }
    const resonance = solveCardTemplate('resonance', 3, 'mythic');
    assert.ok(resonance);
    assert.deepEqual(resonance.upgraded, { innate: true });
    assert.equal(resonance.ethereal, undefined);
    const surge = solveCardTemplate('surge', 1, 'common');
    assert.deepEqual(surge.upgraded.effects[0], surge.effects[0]);
    assert.equal(surge.upgraded.effects[1].amount, surge.effects[1].amount + 3);
    const floor = cardFromValues('dualcast', 0, 'common', [1, 0]);
    assert.ok(floor.card, JSON.stringify(floor));
    assert.equal(floor.card.upgradeReason, 'cost-floor');
    assert.equal(floor.card.upgraded, undefined);
});


test('升级关键字按快照门控：移除虚无、新增保留、弃牌触发与旧局重放', () => {
    const echo = fixedCard('fx-mage-25-s1');
    const gamble = fixedCard('fx-assassin-18-s1');
    const discard = { id: 'discard-up', name: '弃牌强化', type: 'skill', cost: 0, rarity: 'common', effects: [{ op: 'block', amount: 2 }],
        onDiscard: [{ op: 'block', amount: 1 }], upgraded: { onDiscard: [{ op: 'block', amount: 4 }] } };
    const thrower = { ...strike, id: 'thrower', effects: [{ op: 'discard', amount: 1, mode: 'choose' }] };
    for (const enabled of [false, true]) {
        const input = setup(7, { cards: [echo, gamble, discard, thrower] });
        if (enabled) input.cardUpgradeRules = CARD_UPGRADE_RULES;
        input.units[0].draw = 10;
        input.units[0].deck = [echo, gamble, discard, thrower, ...Array(6).fill(strike)].map(card => ({ cardId: card.id, upgraded: true }));
        input.units[0].catalog[strike.id] = strike;
        const built = createBattle(input, 7);
        assert.equal(built.ok, true, JSON.stringify(built.error));
        const find = id => Object.keys(built.state.cards).find(inst => built.state.cards[inst].cardId === id);
        const echoInst = find(echo.id), gambleInst = find(gamble.id), discardInst = find(discard.id);
        assert.equal(Boolean(cardView(built.state, echoInst).ethereal), !enabled);
        assert.equal(Boolean(cardView(built.state, gambleInst).retain), enabled);
        const actions = [{ type: 'play', inst: find(thrower.id) }, { type: 'choose', insts: [discardInst] }, { type: 'end-turn' }];
        const paused = act(built.state, actions[0]);
        assert.ok(paused.state.pending);
        const discarded = act(paused.state, actions[1]);
        assert.equal(discarded.state.units.hero.block, enabled ? 4 : 1);
        const ended = act(discarded.state, actions[2]);
        assert.equal(ended.state.piles.hero.exhaust.includes(echoInst), !enabled);
        if (enabled) assert.equal(ended.state.piles.hero.hand[0], gambleInst);
        const replay = replayBattle(JSON.parse(JSON.stringify(input)), 7, actions);
        assert.equal(replay.ok, true);
        assert.deepEqual(replay.state, ended.state);

        const retainInput = setup(7, { cards: [gamble] });
        if (enabled) retainInput.cardUpgradeRules = CARD_UPGRADE_RULES;
        retainInput.units[0].deck = retainInput.units[0].deck.map(cardId => ({ cardId, upgraded: true }));
        const opened = createBattle(retainInput, 7);
        assert.equal(opened.ok, true);
        const originalHand = opened.state.piles.hero.hand.slice();
        const next = act(opened.state, { type: 'end-turn' });
        const destination = enabled ? next.state.piles.hero.hand : next.state.piles.hero.discard;
        assert.ok(originalHand.every(inst => destination.includes(inst)));
        assert.equal(next.state.piles.hero.hand.length, enabled ? 10 : 5);
        assert.deepEqual(replayBattle(retainInput, 7, [{ type: 'end-turn' }]).state, next.state);
    }
    for (const card of [echo, gamble]) {
        const view = rewardCardView({ card, marks: [{ upgraded: true }] }, 0);
        const after = upgradedCardFace(card);
        assert.equal(view.ethereal, after.ethereal);
        assert.equal(view.retain, after.retain);
        assert.deepEqual(view.effects, after.effects);
    }
});

test('升级固有影响开局抽牌，纯降费保持效果，真坚毅升级由随机改为选牌', () => {
    const machine = fixedCard('fx-mage-47-s1');
    const rush = fixedCard('fx-bard-49-s1');
    for (const enabled of [false, true]) {
        const input = setup(7, { cards: [strike, machine] });
        if (enabled) input.cardUpgradeRules = CARD_UPGRADE_RULES;
        input.units[0].draw = 1;
        input.units[0].deck = [{ cardId: machine.id, upgraded: true }, ...Array(9).fill(strike.id)];
        let absent = 0;
        for (const seed of [1, 7, 13, 29]) {
            const initial = createBattle(input, seed);
            assert.equal(initial.ok, true);
            const first = cardView(initial.state, initial.state.piles.hero.hand[0]);
            if (enabled) assert.equal(first.id, machine.id);
            else if (first.id !== machine.id) absent++;
            assert.deepEqual(replayBattle(input, seed, []).state, initial.state);
        }
        if (!enabled) assert.ok(absent > 0);
    }
    const cheap = setup(7, { cards: [rush] });
    cheap.cardUpgradeRules = CARD_UPGRADE_RULES;
    cheap.units[0].deck = cheap.units[0].deck.map(cardId => ({ cardId, upgraded: true }));
    const initial = createBattle(cheap, 7);
    assert.equal(initial.ok, true);
    const inst = initial.state.piles.hero.hand[0];
    assert.equal(cardView(initial.state, inst).cost, 0);
    assert.deepEqual(cardView(initial.state, inst).effects, upgradedCardFace(rush).effects);
    const played = act(initial.state, { type: 'play', inst });
    assert.equal(played.state.units.hero.energy, initial.state.units.hero.energy);
    assert.equal(played.state.units.hero.statuses['wrath-draw'], 2);
    const grit = fixedCard('fx-warrior-74-s1');
    for (const upgraded of [false, true]) {
        const input = setup(7, { cards: [grit, strike] });
        input.cardUpgradeRules = CARD_UPGRADE_RULES;
        input.units[0].draw = 10;
        input.units[0].deck = [{ cardId: grit.id, upgraded }, ...Array(9).fill(strike.id)];
        const created = createBattle(input, 7);
        assert.equal(created.ok, true);
        const key = created.state.piles.hero.hand.find(i => created.state.cards[i].cardId === grit.id);
        const actions = [{ type: 'play', inst: key }];
        let result = act(created.state, actions[0]);
        assert.equal(Boolean(result.state.pending), upgraded);
        assert.equal(result.state.units.hero.block, upgraded ? 9 : 7);
        if (upgraded) {
            actions.push({ type: 'choose', insts: [result.state.pending.options[0]] });
            result = act(result.state, actions[1]);
        }
        assert.equal(result.state.piles.hero.exhaust.length, 1);
        assert.deepEqual(replayBattle(input, 7, actions).state, result.state);
    }
});

test('全息升级移除消耗并保留回收，升级预览分别显示前后关键字', async () => {
    const hologram = fixedCard('fx-mage-39-s1');
    for (const upgraded of [false, true]) {
        const input = setup(7, { cards: [hologram, strike] });
        input.cardUpgradeRules = CARD_UPGRADE_RULES;
        input.units[0].draw = 10;
        input.units[0].deck = [{ cardId: hologram.id, upgraded }, ...Array(9).fill(strike.id)];
        const created = createBattle(input, 7);
        assert.equal(created.ok, true);
        const hand = created.state.piles.hero.hand;
        const fodder = hand.find(inst => created.state.cards[inst].cardId === strike.id);
        const inst = hand.find(key => created.state.cards[key].cardId === hologram.id);
        const actions = [{ type: 'play', inst: fodder, targetId: 'foe' }, { type: 'play', inst }];
        const result = act(act(created.state, actions[0]).state, actions[1]);
        assert.ok(result.state.piles.hero.hand.includes(fodder));
        assert.equal(result.state.units.hero.block, upgraded ? 5 : 3);
        assert.equal(result.state.piles.hero.exhaust.includes(inst), !upgraded);
        assert.equal(result.state.piles.hero.discard.includes(inst), upgraded);
        assert.deepEqual(replayBattle(input, 7, actions).state, result.state);
    }
    const { JSDOM } = await import('jsdom');
    for (const [id, beforeFlags, afterFlags, beforeWord, afterWord] of [
        ['fx-mage-25-s1', { ethereal: true }, {}, '虚无', ''],
        ['fx-mage-47-s1', {}, { innate: true }, '', '固有'],
    ]) {
        const card = fixedCard(id), after = upgradedCardFace(card);
        const html = renderCombatPanelHtml({ status: 'done', upgradeOpen: true, upgradeFocus: 'copy',
            flip: { status: 'ready', upgrade: { available: true, cards: [{ copyId: 'copy', cardId: id,
                name: card.name, type: card.type, rarity: card.rarity, cost: card.cost, effects: card.effects,
                upCost: after.cost, upEffects: after.effects, keywords: beforeFlags, upKeywords: afterFlags }] } } });
        const dom = new JSDOM(html);
        const sides = [...dom.window.document.querySelectorAll('.igs-combat-upgrade-side')].map(el => el.textContent);
        assert.equal(sides.length, 2);
        if (beforeWord) assert.ok(sides[0].includes(beforeWord));
        else assert.ok(!sides[0].includes(afterWord));
        if (afterWord) assert.ok(sides[1].includes(afterWord));
        else assert.ok(!sides[1].includes(beforeWord));
        dom.window.close();
    }
});


test('升级卡面快照只接受显式新契约，非法标记拒收且旧快照不补字段', () => {
    for (const marker of [0, 2, true, '1', null, {}]) {
        const result = createBattle({ ...setup(7), cardUpgradeRules: marker }, 7);
        assert.equal(result.ok, false);
        assert.equal(result.error.reason, 'invalid-card-upgrade-rules');
    }
    for (const version of [undefined, 3, 4, 5, 6]) {
        const result = createBattle({ ...setup(version), rulesVersion: version, cardUpgradeRules: CARD_UPGRADE_RULES }, 7);
        assert.equal(result.ok, false);
        assert.equal(result.error.reason, 'invalid-card-upgrade-rules');
    }
    for (const version of [3, 4, 5, 6, 7]) {
        const result = createBattle(setup(version), 7);
        assert.equal(result.ok, true);
        assert.equal(Object.hasOwn(result.state, 'cardUpgradeRules'), false);
    }
    const face = { ...strike, cost: 1, effects: [{ op: 'damage', amount: 9, target: 'enemy' }], ethereal: true,
        upgraded: { ethereal: false, innate: true, onDiscard: [{ op: 'block', amount: 1, target: 'self' }] } };
    const normalized = normalizeCard(face);
    assert.equal(normalized.ok, true, JSON.stringify(normalized.errors));
    assert.equal(normalized.value.upgraded.ethereal, false);
    assert.equal(normalized.value.upgraded.innate, true);
    for (const upgraded of [{ innate: 1 }, { ethereal: 'false' }, { unknown: true }])
        assert.equal(normalizeCard({ ...face, upgraded }).ok, false);
});

test('来源规则经账本持久化与并卡保留，未标记旧卡仍按原模型合并', async (t) => {
    const fixture = await createGenerationFixture();
    t.after(fixture.dispose);
    const ledger = fixture.services.getLedger();
    const hero = await fixture.hero();
    const chat = fixture.host.SillyTavern.getContext().chat;
    const groups = [
        ['upgradeModel', { cost: 1, rarity: 'common', ...solveCardTemplate('strike', 1, 'common') }],
        ['sourceModel', fixedCard('fx-warrior-35-s1')],
    ];
    const expected = [];
    for (const [field, face] of groups) {
        const { [field]: marker, ...plain } = face;
        assert.ok(marker, field);
        assert.notEqual(cardModelKey(face), cardModelKey(plain));
        assert.equal(cardModelKey(plain), cardModelKey({ ...plain, [field]: undefined }));
        for (const [index, marked, merge] of [[0, false, true], [1, false, true], [2, true, true], [3, true, true], [4, false, false]]) {
            const id = `merge-${field}-${index}`;
            const name = `并卡${field}${index}`;
            const card = normalizeCard({ ...plain, id, name, ...(marked ? { [field]: marker } : {}) });
            assert.equal(card.ok, true, JSON.stringify(card.errors));
            const messageId = chat.push({ is_user: false, mes: `[igs-combat:learn|艾拉|${name}|练习]`, swipe_id: 0 }) - 1;
            const [tag] = scanCombatTags(chat[messageId].mes);
            const entry = { id: `learn-${id}`, type: 'learn', character: hero.id, createdAt: messageId,
                anchor: { messageId, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence },
                payload: { card: card.value, ...(merge ? { merge: true } : {}) } };
            const result = await ledger.append(entry);
            assert.equal(result.ok, true, JSON.stringify(result));
            expected.push({ id, field, marker, marked, index, entryId: entry.id });
        }
    }
    const snapshot = await ledger.read();
    assert.equal(snapshot.ok, true);
    const state = await ledger.effectiveState();
    assert.equal(state.ok, true);
    assert.deepEqual(state.diagnostics.filter(row => expected.some(item => item.entryId === row.id)), []);
    const replay = computeEffectiveState(snapshot, chat, { userName: '艾拉' });
    assert.equal(replay.ok, true);
    for (const item of expected) {
        const stored = snapshot.entries.find(entry => entry.id === item.entryId);
        assert.equal(stored.payload.card[item.field], item.marked ? item.marker : undefined);
        const current = state.characters.get(hero.id);
        const owned = item.index === 0 || item.index === 2 ? 2 : item.index === 4 ? 1 : 0;
        assert.equal(current.owned.get(item.id) || 0, owned, item.id);
        assert.equal(current.catalog.has(item.id), owned > 0, item.id);
        if (owned) assert.equal(current.catalog.get(item.id)[item.field], item.marked ? item.marker : undefined);
        assert.equal(replay.characters.get(hero.id).owned.get(item.id) || 0, owned, item.id);
    }
});

test('全模板策略覆盖：求解与显式数值重建一致，升级和原因篡改拒收', (t) => {
    assert.equal(checkTemplateUpgradeCoverage(), true);
    assert.deepEqual(Object.keys(TEMPLATE_UPGRADE_POLICIES).sort(), Object.keys(CARD_TEMPLATES).sort());
    const covered = new Set();
    let variants = 0, upgrades = 0;
    for (const [key, tpl] of Object.entries(CARD_TEMPLATES)) {
        const policy = TEMPLATE_UPGRADE_POLICIES[key];
        assert.ok(['source-component', 'project', 'unverified'].includes(policy.origin), key);
        assert.ok(policy.difference, key);
        if (policy.origin === 'source-component') {
            assert.ok(policy.reference.name && policy.reference.evidence, key);
            assert.ok([1, 2].includes(policy.reference.game), key);
        }
        const values = tpl.vars.reduce((rows, [min, max]) => rows.flatMap(row =>
            Array.from({ length: max - min + 1 }, (_, i) => [...row, min + i])), [[]]);
        const byFace = new Map(values.map(row => [JSON.stringify(templateCardFace(tpl, row)), row]));
        for (const cost of templateCosts(key)) for (const rarity of RARITIES) {
            const solved = solveCardTemplate(key, cost, rarity);
            if (!solved) continue;
            const label = `${key}/${cost}/${rarity}`;
            const { upgradeModel, upgraded, upgradeReason, ...base } = solved;
            const card = { id: `coverage-${key}`, name: key, cost, rarity, ...solved };
            assert.equal(upgradeModel, `template-v1:${key}`, label);
            assert.equal(Boolean(upgraded), upgradeReason === undefined, label);
            const expected = templateUpgradeDecision(key, card);
            assert.equal(expected.error, undefined, label);
            assert.deepEqual(upgraded, expected.upgraded, label);
            assert.equal(upgradeReason, expected.reason, label);
            assert.equal(evaluateCardBudget(card).ok, true, label);
            const normalized = normalizeCard(card);
            assert.equal(normalized.ok, true, `${label}: ${JSON.stringify(normalized.errors)}`);
            assert.equal(normalized.value.upgradeModel, upgradeModel, label);
            assert.equal(normalized.value.upgradeReason, upgradeReason, label);
            assert.ok(sameSourceValue(normalized.value.upgraded, upgraded), label);
            const explicitValues = byFace.get(JSON.stringify(base));
            assert.ok(explicitValues, label);
            assert.deepEqual(cardFromValues(key, cost, rarity, explicitValues), { card: solved }, label);
            if (!covered.has(key)) {
                const altered = { ...card, upgraded: { cost: 0 }, upgradeReason: 'missing-mapping' };
                assert.equal(evaluateCardBudget(altered).reason, 'upgrade-model-mismatch', label);
                assert.equal(normalizeCard(altered).ok, false, label);
                assert.equal(normalizeCard({ ...card, effects: [...card.effects, { op: 'draw', amount: 5 }] }).ok, false, label);
            }
            covered.add(key);
            variants += 1;
            if (upgraded) upgrades += 1;
        }
    }
    assert.deepEqual([...covered].sort(), Object.keys(CARD_TEMPLATES).sort());
    t.diagnostic(`模板 ${covered.size}；可解变体 ${variants}；带升级 ${upgrades}；显式无升级原因 ${variants - upgrades}`);
});

test('模板升级经正式生成保留策略与原因，升级副本物化并按快照重放', async (t) => {
    const fixture = await createGenerationFixture();
    t.after(fixture.dispose);
    const hero = await fixture.hero();
    for (const [key, cost, values] of [
        ['surge', 1, [1, 5]], ['shatter', 1, [7, 1, 2]],
        ['reflex', 0, [1, 2]], ['dualcast', 0, [1, 0]],
    ]) {
        const { entity } = growthEntity({ kind: 'learn', skill: key, rarity: 'common',
            description: CARD_TEMPLATES[key].label,
            anchor: { messageId: 1, swipeId: 0, tagHash: key, occurrence: 0 } }, hero);
        assert.ok(entity.input.templates.includes(key), key);
        for (const explicit of [false, true]) {
            const generated = await generateEntities([entity], { llm: { source: 'tavern' }, maxRounds: 0,
                request: async () => JSON.stringify({ entities: [{ key: entity.key,
                    value: { name: key, template: key, cost, ...(explicit ? { values } : {}) } }] }) });
            assert.equal(generated.ok, true, `${key}: ${JSON.stringify(generated.rejected)}`);
            const card = generated.accepted[0].entry.payload.card;
            const expected = templateUpgradeDecision(key, card);
            assert.equal(card.upgradeModel, `template-v1:${key}`, key);
            assert.ok(sameSourceValue(card.upgraded, expected.upgraded), key);
            assert.equal(card.upgradeReason, expected.reason, key);
            if (explicit) assert.ok(sameSourceValue(card.effects, cardFromValues(key, cost, 'common', values).card.effects), key);
            for (const enabled of [false, true]) {
                const input = setup(7, { cards: [card] });
                if (enabled) input.cardUpgradeRules = CARD_UPGRADE_RULES;
                input.units[0].draw = 10;
                input.units[0].deck = input.units[0].deck.map(cardId => ({ cardId, upgraded: true }));
                const snapshot = JSON.stringify(input);
                const built = createBattle(input, 7);
                assert.equal(built.ok, true, `${key}: ${JSON.stringify(built.error)}`);
                const face = cardView(built.state, built.state.piles.hero.hand[0]);
                const upgraded = upgradedCardFace(card, enabled ? CARD_UPGRADE_RULES : 0);
                assert.deepEqual(face.effects, upgraded.effects, key);
                assert.equal(face.cost, upgraded.cost, key);
                assert.equal(face.upgradeReason, card.upgradeReason, key);
                assert.equal(face.upgraded, Boolean(card.upgraded), key);
                const action = { type: 'end-turn' };
                const ended = act(built.state, action);
                const replay = replayBattle(JSON.parse(snapshot), 7, [action]);
                assert.equal(replay.ok, true, key);
                assert.deepEqual(replay.state, ended.state, key);
                assert.equal(JSON.stringify(input), snapshot, key);
                assert.equal(Object.hasOwn(built.state, 'cardUpgradeRules'), enabled, key);
            }
        }
    }
});

test('旧模板升级标识保留原规则，不迁移为新版策略', () => {
    for (const [key, rule] of Object.entries(TEMPLATE_UPGRADE_MODELS)) {
        const cost = rule.kind === 'cost' ? rule.from : 1;
        const rarity = RARITIES.find(value => solveCardTemplate(key, cost, value));
        assert.ok(rarity, key);
        const solved = solveCardTemplate(key, cost, rarity);
        const { upgradeModel, upgradeReason, upgraded, ...base } = solved;
        const card = { id: `legacy-${key}`, name: key, cost, rarity, ...base, upgradeModel: key };
        card.upgraded = templateSourceUpgrade(key, card);
        assert.ok(card.upgraded, key);
        const normalized = normalizeCard(card);
        assert.equal(normalized.ok, true, `${key}: ${JSON.stringify(normalized.errors)}`);
        assert.equal(normalized.value.upgradeModel, key, key);
        assert.ok(sameSourceValue(normalized.value.upgraded, card.upgraded), key);
    }
});

test('显式无升级原因经账本写入读回与并卡重放保留，旧卡身份不补标记', async (t) => {
    const fixture = await createGenerationFixture();
    t.after(fixture.dispose);
    const ledger = fixture.services.getLedger();
    const hero = await fixture.hero();
    const chat = fixture.host.SillyTavern.getContext().chat;
    const face = { cost: 0, rarity: 'common', ...cardFromValues('dualcast', 0, 'common', [1, 0]).card };
    const { upgradeModel, upgradeReason, ...plain } = face;
    assert.equal(upgradeReason, 'cost-floor');
    assert.notEqual(cardModelKey(face), cardModelKey(plain));
    assert.notEqual(cardModelKey(face), cardModelKey({ ...face, upgradeReason: 'source-component-unchanged' }));
    assert.equal(cardModelKey(plain), cardModelKey({ ...plain, upgradeModel: undefined, upgradeReason: undefined }));
    assert.equal(normalizeCard({ id: 'orphan', name: '孤立原因', ...plain, upgradeReason }).ok, false);
    const expected = [];
    for (const [index, marked] of [[0, false], [1, false], [2, true], [3, true]]) {
        const id = `reason-${index}`, name = `原因并卡${index}`;
        const card = normalizeCard({ ...plain, id, name, ...(marked ? { upgradeModel, upgradeReason } : {}) });
        assert.equal(card.ok, true, JSON.stringify(card.errors));
        const messageId = chat.push({ is_user: false, mes: `[igs-combat:learn|艾拉|${name}|练习]`, swipe_id: 0 }) - 1;
        const [tag] = scanCombatTags(chat[messageId].mes);
        const entry = { id: `learn-${id}`, type: 'learn', character: hero.id, createdAt: messageId,
            anchor: { messageId, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence },
            payload: { card: card.value, merge: true } };
        const result = await ledger.append(entry);
        assert.equal(result.ok, true, JSON.stringify(result));
        expected.push({ id, marked, entryId: entry.id, owned: index % 2 ? 0 : 2 });
    }
    const snapshot = await ledger.read();
    assert.equal(snapshot.ok, true);
    const state = await ledger.effectiveState();
    assert.equal(state.ok, true);
    assert.deepEqual(state.diagnostics.filter(row => expected.some(item => item.entryId === row.id)), []);
    const replay = computeEffectiveState(snapshot, chat, { userName: '艾拉' });
    assert.equal(replay.ok, true);
    for (const item of expected) {
        const stored = snapshot.entries.find(entry => entry.id === item.entryId).payload.card;
        assert.equal(stored.upgradeModel, item.marked ? upgradeModel : undefined);
        assert.equal(stored.upgradeReason, item.marked ? upgradeReason : undefined);
        assert.equal(stored.upgraded, undefined);
        for (const current of [state.characters.get(hero.id), replay.characters.get(hero.id)]) {
            assert.equal(current.owned.get(item.id) || 0, item.owned, item.id);
            assert.equal(current.catalog.has(item.id), item.owned > 0, item.id);
            if (item.owned) {
                assert.equal(current.catalog.get(item.id).upgradeReason, item.marked ? upgradeReason : undefined);
                assert.equal(current.catalog.get(item.id).upgradeModel, item.marked ? upgradeModel : undefined);
            }
        }
    }
});

test('首刃新版模板容纳来源升级值，未标记旧卡的属性封顶与回放不变', () => {
    const current = { id: 'first-new', name: '首刃新版', cost: 1, rarity: 'personal', ...solveCardTemplate('shiv-first', 1, 'personal') };
    const { upgradeModel, ...legacy } = { ...current, id: 'first-old', name: '首刃旧版', upgraded: { effects: [{ op: 'hone-shiv', mode: 'first', amount: 10 }] } };
    assert.equal(normalizeCard(current).ok, true);
    assert.equal(normalizeCard(legacy).ok, true);
    for (const card of [legacy, current]) {
        const input = setup(7, { cards: [card] });
        input.cardUpgradeRules = CARD_UPGRADE_RULES;
        input.attributeRules = 2;
        input.units[0].attributePolicy = { ...policy, version: 2, scores: { ...policy.scores, str: 20 } };
        input.units[0].deck = input.units[0].deck.map(cardId => ({ cardId, upgraded: true }));
        const built = createBattle(input, 7);
        assert.equal(built.ok, true, JSON.stringify(built.error));
        const inst = built.state.piles.hero.hand[0];
        const cap = card === current ? 13 : 10;
        assert.equal(cardView(built.state, inst).effects[0].amount, cap);
        const action = { type: 'play', inst };
        const played = act(built.state, action);
        assert.equal(played.state.units.hero.res.shiv.first, cap);
        assert.deepEqual(replayBattle(input, 7, [action]).state, played.state);
    }
});

test('余烬区分能力牌正常离场与真实消耗，并保留旧快照重放', () => {
    const power = { id: 'ember-power', name: '能力样本', type: 'power', cost: 0, rarity: 'common',
        effects: [{ op: 'status', status: 'strength', stacks: 1, target: 'self' }] };
    const burn = { id: 'ember-burn', name: '消耗样本', type: 'skill', cost: 0, rarity: 'common',
        effects: [{ op: 'exhaust-other', amount: 1, from: 'hand', mode: 'choose' }] };
    const passive = { id: 'ember-start', name: '余烬', trigger: 'battle-start',
        effects: [{ op: 'apply-status', status: 'ember', stacks: 3, target: 'self' }] };
    for (const modern of [false, true]) for (const route of ['power-play', 'power-effect', 'skill-effect', 'power-self']) {
        const sample = route === 'power-self' ? { ...power, effects: [{ op: 'exhaust-self' }] } : power;
        const input = setup(7, { cards: [sample, burn], passives: [passive] });
        input.units[0].draw = 10;
        if (modern) input.exhaustRules = 1;
        const built = createBattle(input, 19);
        assert.equal(built.ok, true, JSON.stringify(built.error));
        const direct = route === 'power-play' || route === 'power-self';
        const find = id => built.state.piles.hero.hand.find(inst => built.state.cards[inst].cardId === id);
        const actions = [{ type: 'play', inst: find(direct ? power.id : burn.id) }];
        let result = act(built.state, actions[0]);
        if (!direct) {
            assert.ok(result.state.pending);
            const id = route === 'power-effect' ? power.id : burn.id;
            const inst = result.state.pending.options.find(key => result.state.cards[key].cardId === id);
            assert.ok(inst);
            actions.push({ type: 'choose', insts: [inst] });
            result = act(result.state, actions[1]);
        }
        const triggers = route === 'skill-effect' || (modern && route !== 'power-play');
        assert.equal(result.state.units.hero.block, triggers ? 3 : 0, `${modern}/${route}`);
        const event = result.events.find(row => row.type === 'exhaust');
        assert.ok(event, route);
        assert.equal(event.realExhaust, modern ? route !== 'power-play' : undefined);
        assert.equal(Object.hasOwn(result.state, 'exhaustRules'), modern);
        assert.deepEqual(replayBattle(input, 19, actions).state, result.state);
    }
    for (const value of [0, 2, true, '1', null, {}])
        assert.equal(createBattle({ ...setup(), exhaustRules: value }, 19).error.reason, 'invalid-exhaust-rules');
    assert.equal(createBattle({ ...setup(6), exhaustRules: 1 }, 19).error.reason, 'invalid-exhaust-rules');
});

const SIGNATURE_GROUPS = {
    warrior: ['hellraiser', 'dark-embrace', 'fiend-fire', 'feed', 'refine-blade', 'furnace', 'conqueror'],
    assassin: ['shadow-step', 'nightmare', 'grand-finale', 'storm-of-steel', 'phantom-blades', 'calculated-gamble', 'wraith-form', 'strangle'],
    mage: ['echo-form', 'barrage', 'multi-cast', 'biased-cognition', 'reboot', 'creative-ai', 'hologram'],
    bard: ['foresight-power', 'establishment', 'deva-form', 'master-reality', 'vault', 'omniscience'],
    summoner: ['necro-mastery', 'oblivion', 'capture-spirit', 'dirge', 'rattle', 'end-of-days'],
    priest: ['black-hole', 'arsenal', 'pillar-of-creation', 'genesis', 'sealed-throne', 'begone'],
};
function signatureCard(key, wanted = 1, rarity = 'rare') {
    const costs = templateCosts(key);
    const cost = [wanted, ...costs].find(cost => costs.includes(cost) && solveCardTemplate(key, cost, rarity));
    assert.notEqual(cost, undefined, key);
    return { id: `sig-${key}`, name: key, cost, rarity, ...solveCardTemplate(key, cost, rarity) };
}
function signatureBattle(cards, { draw = 10, energy = 3, upgraded = [], passives = [], seed = 19, secondFoe = false, pools, configure } = {}) {
    const input = setup(7, { cards, passives });
    input.cardUpgradeRules = 1;
    input.exhaustRules = 1;
    input.units[0].draw = draw;
    input.units[0].energy = energy;
    if (pools) input.units[0].pools = pools;
    input.units[0].deck = Array.from({ length: 10 }, (_, n) => {
        const cardId = cards[n % cards.length].id;
        return { cardId, upgraded: upgraded.includes(cardId) };
    });
    if (secondFoe) input.units.push({ ...structuredClone(input.units[1]), id: 'foe2', name: '另一对手' });
    configure?.(input);
    const built = createBattle(input, seed);
    assert.equal(built.ok, true, JSON.stringify(built.error));
    let state = built.state;
    const actions = [], events = [...built.events];
    const step = action => {
        const before = JSON.stringify(state);
        const result = act(state, action);
        assert.equal(JSON.stringify(state), before, '动作不得改写输入状态');
        actions.push(action);
        events.push(...result.events);
        state = result.state;
        return result;
    };
    return { input, get state() { return state; }, actions, events, step,
        find: id => state.piles.hero.hand.find(inst => state.cards[inst].cardId === id),
        play(id, targetId) {
            const inst = this.find(id);
            assert.ok(inst, `手牌缺少 ${id}`);
            return step({ type: 'play', inst, ...(targetId ? { targetId } : {}) });
        },
        replay() {
            const replay = replayBattle(input, seed, actions);
            assert.equal(replay.ok, true, JSON.stringify(replay.error));
            assert.deepEqual(replay.state, state);
        },
    };
}

test('特色模型：40 项经正式生成、职业白名单、升级物化与回放', async (t) => {
    const fixture = await createGenerationFixture();
    t.after(fixture.dispose);
    const original = await fixture.hero();
    for (const [archetype, keys] of Object.entries(SIGNATURE_GROUPS)) for (const key of keys) {
        const hero = { ...original, profile: { ...original.profile, archetype } };
        const { entity } = growthEntity({ kind: 'learn', skill: key, rarity: 'rare', description: CARD_TEMPLATES[key].label,
            anchor: { messageId: 1, swipeId: 0, tagHash: key, occurrence: 0 } }, hero);
        assert.equal(templateAllowedFor(key, archetype), true, key);
        assert.ok(entity.input.templates.includes(key), key);
        const generated = await generateEntities([entity], { llm: { source: 'tavern' }, maxRounds: 0,
            request: async () => JSON.stringify({ entities: [{ key: entity.key, value: { name: key, template: key, cost: 1 } }] }) });
        assert.equal(generated.ok, true, `${key}: ${JSON.stringify(generated.rejected)}`);
        const card = generated.accepted[0].entry.payload.card;
        assert.equal(card.upgradeModel, `template-v1:${key}`);
        assert.equal(normalizeCard(card).ok, true, key);
        const battle = signatureBattle([card], { upgraded: [card.id] });
        const view = cardView(battle.state, battle.state.piles.hero.hand[0]);
        assert.deepEqual(view.effects, upgradedCardFace(card).effects, key);
        battle.step({ type: 'end-turn' });
        battle.replay();
    }
});

test('特色模型：暗影步仅下回合整回合倍伤，夜魇延迟三副本', () => {
    const shadow = signatureCard('shadow-step', 1);
    const battle = signatureBattle([shadow, strike]);
    battle.play(shadow.id);
    assert.equal(battle.state.units.hero.statuses['empower-turns'], undefined);
    assert.equal(battle.state.piles.hero.hand.length, 0);
    battle.step({ type: 'end-turn' });
    assert.equal(battle.state.units.hero.statuses['empower-turns'], 1);
    for (let n = 0; n < 2; n += 1) {
        const played = battle.play(strike.id, 'foe');
        assert.deepEqual(played.events.filter(e => e.type === 'damage' && e.source?.id === strike.id).map(e => e.amount), [12]);
    }
    battle.step({ type: 'end-turn' });
    assert.equal(battle.state.units.hero.statuses['empower-turns'], undefined);
    battle.replay();
    const nightmare = signatureCard('nightmare', 1);
    const next = signatureBattle([nightmare, strike]);
    const played = next.play(nightmare.id);
    assert.equal(played.state.pending.kind, 'copy-next');
    next.step({ type: 'choose', insts: [next.find(strike.id)] });
    assert.equal(next.state.units.hero.res.copyNext[0].amount, 3);
    const ended = next.step({ type: 'end-turn' });
    assert.equal(ended.events.filter(e => e.type === 'card-created' && e.cardId === strike.id).length, 3);
    next.replay();
});

test('特色模型：抽牌堆选牌可见、自动连出保留外层并只消耗一次', async () => {
    const { JSDOM } = await import('jsdom');
    const omni = signatureCard('omniscience', 1);
    const target = { ...strike, id: 'auto-target', name: '连出样本', cost: 2,
        effects: [...strike.effects, { op: 'exhaust-self' }] };
    const battle = signatureBattle([omni, target], { draw: 5 });
    const paused = battle.play(omni.id);
    assert.equal(paused.state.pending.kind, 'draw-play');
    const options = paused.state.pending.options;
    assert.ok(options.every(inst => paused.state.piles.hero.draw.includes(inst)));
    const selected = options.find(inst => paused.state.cards[inst].cardId === target.id);
    assert.ok(selected);
    const view = battleView(paused.state);
    for (const skin of ['initial', ...Object.keys(CANVAS_BATTLE)]) for (const orient of ['port', 'land']) {
        const dom = new JSDOM(renderCombatPanelHtml({ status: 'battle', battle: view, skin, orient, chosen: [selected] }));
        const sheet = dom.window.document.querySelector('[aria-label="选择抽牌堆中的牌"]');
        assert.ok(sheet, `${skin}/${orient}`);
        assert.equal(sheet.querySelectorAll('[data-combat-act="choose-pick"]').length, options.length);
        assert.equal(sheet.querySelector('[data-combat-act="choose-confirm"]').disabled, false);
        dom.window.close();
    }
    const energy = paused.state.units.hero.energy;
    const result = battle.step({ type: 'choose', insts: [selected] });
    assert.equal(result.state.pending, undefined);
    assert.equal(result.state.play, undefined);
    assert.equal(result.state.units.hero.energy, energy);
    assert.equal(result.state.units.hero.cardsPlayed, 3);
    assert.equal(result.events.filter(e => e.type === 'card' && e.cardId === target.id).length, 2);
    assert.deepEqual(result.events.filter(e => e.type === 'damage' && e.source?.id === target.id).map(e => e.amount), [6, 6]);
    assert.equal(result.events.filter(e => e.type === 'exhaust' && e.inst === selected && e.realExhaust).length, 1);
    assert.ok(result.state.piles.hero.exhaust.includes(battle.actions[0].inst));
    battle.replay();
});


test('特色模型：黑暗之拥响应真实消耗，恶魔之焰按原手牌张数攻击指定敌人', () => {
    const embrace = signatureCard('dark-embrace');
    const fire = signatureCard('fiend-fire');
    const battle = signatureBattle([embrace, fire, strike], { draw: 8, secondFoe: true });
    battle.play(embrace.id);
    assert.equal(battle.state.units.hero.buffs[0].permanent, true);
    const inst = battle.find(fire.id);
    assert.ok(inst, '起手必须包含恶魔之焰');
    const hand = battle.state.piles.hero.hand.filter(key => key !== inst);
    const amount = cardView(battle.state, inst).effects[0].amount;
    const result = battle.play(fire.id, 'foe2');
    const hits = result.events.filter(e => e.type === 'damage' && e.source?.id === fire.id);
    assert.equal(hits.length, hand.length);
    assert.ok(hits.every(e => e.target === 'foe2' && e.amount === amount));
    assert.equal(result.state.units.foe.hp, 500);
    assert.ok(hand.every(key => result.state.piles.hero.exhaust.includes(key)));
    assert.equal(result.events.filter(e => e.type === 'buff-trigger' && e.buffId === embrace.id).length, hand.length + 1);
    assert.ok(result.state.piles.hero.exhaust.includes(inst));
    assert.ok(result.state.piles.hero.hand.length > 0, '消耗触发抽到的新牌不纳入本次整手消耗');
    battle.replay();
});

test('特色模型：狂徒只自动打出抽到的 Strike，保留正式计数、费用与外层结算', () => {
    const hell = signatureCard('hellraiser');
    const draw = { id: 'signature-draw', name: '抽牌', type: 'skill', rarity: 'common', cost: 0,
        effects: [{ op: 'draw', amount: 5 }, { op: 'block', amount: 3, target: 'self' }] };
    const hit = { ...strike, id: 'signature-strike', name: 'Rapid Strike', cost: 2 };
    const opening = { id: 'signature-hell', name: '狂徒开场', trigger: 'battle-start', effects: hell.effects };
    const battle = signatureBattle([draw, hit, strike], { draw: 5, passives: [opening], secondFoe: true });
    const energy = battle.state.units.hero.energy;
    const result = battle.play(draw.id);
    const cards = result.events.filter(e => e.type === 'card');
    const auto = cards.filter(e => e.automatic);
    assert.ok(auto.length > 0);
    assert.ok(auto.every(e => e.cardId === hit.id && e.cost === 0 && ['foe', 'foe2'].includes(e.targetId)));
    assert.equal(result.state.units.hero.energy, energy);
    assert.equal(result.state.units.hero.cardsPlayed, cards.length);
    assert.equal(result.state.units.hero.block, 3);
    assert.equal(result.state.play, undefined);
    assert.ok(result.state.piles.hero.hand.some(inst => result.state.cards[inst].cardId === strike.id));
    battle.replay();
});

test('特色模型：华丽收场拒绝非空抽牌堆，空堆时攻击全体', () => {
    const finale = signatureCard('grand-finale');
    const blocked = signatureBattle([finale, strike], { draw: 5 });
    const refusal = applyAction(blocked.state, { type: 'play', inst: blocked.find(finale.id) });
    assert.equal(refusal.ok, false);
    assert.deepEqual(refusal.error, { reason: 'card-restricted', detail: { why: 'draw-not-empty' } });
    const battle = signatureBattle([finale, strike], { secondFoe: true });
    const amount = cardView(battle.state, battle.find(finale.id)).effects[0].amount;
    const result = battle.play(finale.id);
    assert.deepEqual(result.events.filter(e => e.type === 'damage').map(e => [e.target, e.amount]), [['foe', amount], ['foe2', amount]]);
    battle.replay();
});


test('特色模型：法珠数量决定弹幕段数，X 费引发同一颗最右珠并保留其余法珠', () => {
    const barrage = signatureCard('barrage');
    const multi = signatureCard('multi-cast', 'X');
    const channel = { id: 'signature-orbs', name: '三珠', type: 'skill', cost: 0, rarity: 'common', effects: [
        { op: 'channel', orb: 'lightning', amount: 1 }, { op: 'channel', orb: 'frost', amount: 1 }, { op: 'channel', orb: 'dark', amount: 1 },
    ] };
    const battle = signatureBattle([channel, barrage]);
    const empty = battle.play(barrage.id, 'foe');
    assert.equal(empty.events.filter(e => e.type === 'damage').length, 0);
    battle.play(channel.id);
    const played = battle.play(barrage.id, 'foe');
    assert.equal(played.events.filter(e => e.type === 'damage' && e.source?.id === barrage.id).length, 3);
    battle.replay();
    for (const upgraded of [false, true]) {
        const cast = signatureBattle([channel, multi], { upgraded: upgraded ? [multi.id] : [] });
        cast.play(channel.id);
        const energy = cast.state.units.hero.energy;
        const result = cast.play(multi.id);
        const evokes = result.events.filter(e => e.type === 'evoke');
        assert.equal(evokes.length, energy + Number(upgraded));
        assert.ok(evokes.every(e => e.orb === 'dark'));
        assert.equal(result.state.units.hero.energy, 0);
        assert.deepEqual(result.state.units.hero.res.orbs.list.map(o => o.kind), ['lightning', 'frost']);
        cast.replay();
    }
});


test('特色模型：挽歌共用 X 次数生成魂与召唤，猛晃按此前实际随从攻击加段', () => {
    const dirge = signatureCard('dirge', 'X');
    for (const upgraded of [false, true]) {
        const battle = signatureBattle([dirge, strike], { upgraded: upgraded ? [dirge.id] : [] });
        const inst = battle.find(dirge.id);
        const amount = cardView(battle.state, inst).effects[0].amount;
        const energy = battle.state.units.hero.energy;
        const result = battle.play(dirge.id);
        assert.equal(result.state.units.hero.energy, 0);
        assert.equal(result.events.filter(e => e.type === 'summon').length, energy);
        assert.equal(result.state.units.hero.res.minion.hp, amount * energy);
        const souls = result.events.filter(e => e.type === 'card-created' && e.cardId === 'signature-soul');
        assert.equal(souls.length, energy);
        assert.ok(souls.every(e => e.to === 'draw' && result.state.cards[e.inst].upgraded === upgraded));
        assert.equal(cardView(result.state, souls[0].inst).effects[0].amount, upgraded ? 3 : 2);
        assert.ok(result.state.piles.hero.exhaust.includes(inst));
        battle.replay();
    }
    const rattle = signatureCard('rattle');
    const call = { id: 'signature-call', name: '召唤并出手', type: 'skill', rarity: 'common', cost: 0,
        effects: [{ op: 'summon', amount: 20 }, { op: 'minion-strike', amount: 2, target: 'all-enemies' }] };
    const battle = signatureBattle([rattle, call], { energy: 10, secondFoe: true });
    battle.play(call.id);
    assert.equal(battle.state.units.hero.res.rattleAttacks, 1, '群攻算一次随从攻击，不按目标数累计');
    for (const hits of [2, 4]) {
        const before = battle.state.units.hero.res.rattleAttacks;
        const result = battle.play(rattle.id, 'foe2');
        const strikes = result.events.filter(e => e.type === 'minion-strike');
        assert.equal(strikes.length, hits);
        assert.equal(result.events.filter(e => e.type === 'damage' && e.kind === 'minion').length, hits);
        assert.ok(result.events.filter(e => e.type === 'damage').every(e => e.target === 'foe2'));
        assert.equal(result.state.units.hero.res.rattleAttacks, before + hits);
    }
    battle.step({ type: 'end-turn' });
    assert.equal(battle.state.units.hero.res.rattleAttacks, 0);
    battle.replay();
});


test('特色模型：敏捷与专注逐回合实际衰减，天神能量逐回合递增', () => {
    const wraith = signatureCard('wraith-form');
    const biased = signatureCard('biased-cognition');
    const deva = signatureCard('deva-form');
    const guard = { id: 'signature-guard', name: '格挡', type: 'skill', cost: 0, rarity: 'common',
        effects: [{ op: 'block', amount: 5, target: 'self' }] };
    const dex = { id: 'signature-dex', name: '敏捷', trigger: 'battle-start',
        effects: [{ op: 'status', status: 'dexterity', stacks: 1, target: 'self' }] };
    const battle = signatureBattle([wraith, biased, deva, guard], { energy: 10, passives: [dex] });
    battle.play(wraith.id);
    battle.play(biased.id);
    battle.play(deva.id);
    const focus = battle.state.units.hero.res.focus;
    for (let turn = 1; turn <= 3; turn += 1) {
        const result = battle.step({ type: 'end-turn' });
        assert.equal(battle.state.units.hero.statuses.dexterity || 0, 1 - turn);
        assert.equal(battle.state.units.hero.statuses['def-down'], undefined);
        assert.equal(battle.state.units.hero.res.focus, focus - turn);
        assert.equal(battle.state.units.hero.energy, 10 + turn);
        assert.ok(result.events.some(e => e.type === 'energy' && e.amount === turn));
        const played = battle.play(guard.id);
        assert.equal(played.state.units.hero.block, Math.max(0, 6 - turn));
    }
    battle.replay();
});

test('特色模型：保留降费改写副本且永久累积，额外回合可连续触发', () => {
    const establish = signatureCard('establishment');
    const kept = { ...strike, id: 'signature-retain', name: '保留样本', cost: 3, retain: true };
    const battle = signatureBattle([establish, kept]);
    battle.play(establish.id);
    const inst = battle.find(kept.id);
    for (const cost of [2, 1]) {
        battle.step({ type: 'end-turn' });
        assert.equal(cardView(battle.state, inst).cost, cost);
        assert.equal(battle.state.cards[inst].costMod, cost - 3);
    }
    battle.replay();
    const vault = signatureCard('vault');
    const extra = signatureBattle([vault, strike]);
    for (let n = 0; n < 2; n += 1) {
        const turn = extra.state.turn;
        const result = extra.play(vault.id);
        assert.equal(extra.state.turn, turn + 1);
        assert.equal(result.events.filter(e => e.type === 'encore' && e.repeatable).length, 1);
        assert.equal(result.events.filter(e => e.type === 'act' && e.unitId === 'foe').length, 0);
        assert.equal(result.events.filter(e => e.type === 'exhaust' && e.realExhaust).length, 1);
    }
    extra.replay();
});


test('特色模型：创造性 AI 按快照生成能力，实境在生成时升级，预知先于抽牌', () => {
    const creative = signatureCard('creative-ai');
    const reality = signatureCard('master-reality');
    const foresight = signatureCard('foresight-power');
    const power = { id: 'signature-pool-power', name: '能力池样本', type: 'power', cost: 1, rarity: 'common',
        effects: [{ op: 'status', status: 'strength', stacks: 1, target: 'self' }],
        upgraded: { effects: [{ op: 'status', status: 'strength', stacks: 2, target: 'self' }] } };
    const battle = signatureBattle([creative, reality, foresight, strike], { energy: 10, pools: { class: { [power.id]: power } } });
    battle.play(creative.id);
    battle.play(reality.id);
    battle.play(foresight.id);
    const result = battle.step({ type: 'end-turn' });
    const made = result.events.filter(e => e.type === 'card-created' && e.cardId === power.id);
    assert.equal(made.length, 1);
    assert.equal(result.state.cards[made[0].inst].upgraded, true);
    assert.equal(cardView(result.state, made[0].inst).effects[0].stacks, 2);
    const foresee = result.events.findIndex(e => e.type === 'foresee' && e.unitId === 'hero');
    const draw = result.events.findIndex(e => e.type === 'draw' && e.unitId === 'hero');
    assert.ok(foresee >= 0 && foresee < draw);
    assert.ok(result.events.some(e => e.type === 'upgrade-card' && e.inst === made[0].inst));
    battle.replay();
});

test('特色模型：湮灭绑定最初敌人且回合末清理，捕捉灵魂失血与造魂均结算', () => {
    const oblivion = signatureCard('oblivion');
    const capture = signatureCard('capture-spirit');
    const battle = signatureBattle([oblivion, capture, strike], { energy: 10, secondFoe: true });
    const amount = cardView(battle.state, battle.find(oblivion.id)).effects[0].amount;
    battle.play(oblivion.id, 'foe2');
    assert.equal(battle.state.units.foe2.statuses.doom, amount);
    battle.play(strike.id, 'foe');
    assert.equal(battle.state.units.foe2.statuses.doom, amount * 2);
    assert.equal(battle.state.units.foe.statuses.doom, undefined);
    const face = cardView(battle.state, battle.find(capture.id));
    const result = battle.play(capture.id, 'foe');
    assert.equal(result.events.find(e => e.type === 'damage' && e.kind === 'spirit').hpLoss, face.effects[0].amount);
    assert.equal(result.events.filter(e => e.type === 'card-created' && e.cardId === 'signature-soul' && e.to === 'draw').length, face.effects[1].amount);
    battle.step({ type: 'end-turn' });
    const before = battle.state.units.foe2.statuses.doom;
    battle.play(strike.id, 'foe');
    assert.equal(battle.state.units.foe2.statuses.doom, before);
    battle.replay();
});


test('特色模型：钢铁风暴按实际弃牌造强化暗刃，幻影之刃只增强本回合首刃', () => {
    const storm = signatureCard('storm-of-steel');
    const phantom = signatureCard('phantom-blades');
    const battle = signatureBattle([phantom, storm, strike], { energy: 10, upgraded: [storm.id] });
    battle.play(phantom.id);
    const bonus = battle.state.units.hero.res.shiv.first;
    const count = battle.state.piles.hero.hand.length - 1;
    const result = battle.play(storm.id);
    assert.equal(result.events.filter(e => e.type === 'discard').length, count);
    const made = result.events.filter(e => e.type === 'card-created' && e.cardId === 'shadow-shiv');
    assert.equal(made.length, count);
    assert.ok(made.every(e => result.state.cards[e.inst].upgraded));
    const first = cardView(battle.state, made[0].inst);
    assert.equal(first.retain, true);
    for (let n = 0; n < 2; n += 1) {
        const played = battle.step({ type: 'play', inst: made[n].inst, targetId: 'foe' });
        assert.equal(played.events.find(e => e.type === 'damage').amount, first.effects[0].amount + (n ? 0 : bonus));
    }
    battle.replay();
});

test('特色模型：重启归集四堆且本牌仍消耗，全息升级后不消耗', () => {
    const reboot = signatureCard('reboot');
    const burn = { ...strike, id: 'signature-burn', effects: [{ op: 'exhaust-self' }] };
    const battle = signatureBattle([reboot, burn, strike], { draw: 8, energy: 10 });
    battle.play(burn.id);
    battle.play(strike.id, 'foe');
    const input = battle.state;
    assert.ok(input.piles.hero.exhaust.length && input.piles.hero.discard.length && input.piles.hero.draw.length);
    const inst = battle.find(reboot.id);
    const amount = cardView(input, inst).effects[0].amount;
    const result = battle.play(reboot.id);
    assert.deepEqual(result.state.piles.hero.exhaust, [inst]);
    assert.equal(result.state.piles.hero.discard.length, 0);
    assert.equal(result.state.piles.hero.hand.length, amount);
    assert.equal(new Set(Object.values(result.state.piles.hero).flat()).size, 10);
    battle.replay();
    const hologram = signatureCard('hologram');
    for (const upgraded of [false, true]) {
        const next = signatureBattle([hologram, strike], { energy: 10, upgraded: upgraded ? [hologram.id] : [] });
        next.play(strike.id, 'foe');
        const inst = next.find(hologram.id);
        const result = next.play(hologram.id);
        assert.equal(result.state.piles.hero.exhaust.includes(inst), !upgraded);
        assert.equal(result.state.piles.hero.discard.includes(inst), upgraded);
        assert.ok(result.events.some(e => e.type === 'fetch'));
        next.replay();
    }
});

test('特色模型：征服者仅让锻刃对指定敌人倍伤且回合末清除', () => {
    const conqueror = signatureCard('conqueror');
    const sweep = { id: 'signature-blade-sweep', name: '群攻锻刃', type: 'skill', rarity: 'common', cost: 0,
        effects: [{ op: 'hone-blade', mode: 'aoe' }] };
    const battle = signatureBattle([conqueror, sweep, strike], { energy: 10, secondFoe: true });
    battle.play(conqueror.id, 'foe2');
    battle.play(sweep.id);
    const blade = battle.find('forge-blade');
    const amount = cardView(battle.state, blade).effects[0].amount;
    const result = battle.step({ type: 'play', inst: blade });
    const damage = result.events.filter(e => e.type === 'damage' && e.source?.id === 'forge-blade');
    assert.deepEqual(damage.map(e => [e.target, e.amount]), [['foe', amount], ['foe2', amount * 2]]);
    assert.deepEqual(battle.state.units.hero.res.bladeDouble, ['foe2']);
    battle.step({ type: 'end-turn' });
    assert.equal(battle.state.units.hero.res.bladeDouble, undefined);
    battle.replay();
});

test('特色模型：驱离按选择变形为基础或升级仆从，清除原副本强化并可正常打出', () => {
    const begone = signatureCard('begone');
    for (const upgraded of [false, true]) {
        const battle = signatureBattle([begone, strike], { energy: 10, upgraded: upgraded ? [begone.id] : [],
            configure(input) {
                for (const entry of input.units[0].deck) if (entry.cardId === strike.id) {
                    entry.upgraded = true;
                    entry.bonus = { damage: 7, block: 0 };
                    entry.inscription = 'sovereign';
                }
            } });
        const selected = battle.find(strike.id);
        assert.equal(cardView(battle.state, selected).effects[0].amount, 13);
        const paused = battle.play(begone.id);
        assert.equal(paused.state.pending.kind, 'transform-minion');
        assert.ok(paused.state.pending.options.includes(selected));
        const transformed = battle.step({ type: 'choose', insts: [selected] });
        const entry = transformed.state.cards[selected];
        assert.equal(entry.cardId, 'signature-minion-strike');
        assert.equal(entry.upgraded, upgraded);
        for (const key of ['bonus', 'inscription', 'grow', 'costMod', 'grants', 'realExhaust']) assert.equal(entry[key], undefined);
        const face = cardView(battle.state, selected);
        assert.equal(face.cost, 0);
        assert.equal(face.effects[0].amount, upgraded ? 9 : 6);
        const result = battle.step({ type: 'play', inst: selected, targetId: 'foe' });
        assert.equal(result.events.find(e => e.type === 'damage').amount, upgraded ? 9 : 6);
        assert.ok(result.state.piles.hero.exhaust.includes(selected));
        battle.replay();
    }
});

test('特色模型：末日先给全体灾厄再即时处决，精英首领与神器边界可回放', () => {
    const end = signatureCard('end-of-days', 3);
    for (const tier of [undefined, 'elite', 'boss']) for (const upgraded of [false, true]) {
        const amount = upgraded ? upgradedCardFace(end).effects[0].amount : end.effects[0].amount;
        assert.equal(upgradedCardFace(end).effects[0].amount, end.effects[0].amount + 8);
        const battle = signatureBattle([end, strike], { energy: 10, secondFoe: true, upgraded: upgraded ? [end.id] : [],
            configure(input) {
                Object.assign(input.units[1], { maxHp: amount, ...(tier ? { tier } : {}) });
                input.units[2].passives = [{ id: 'signature-artifact', name: '神器', trigger: 'battle-start',
                    effects: [{ op: 'status', status: 'artifact', stacks: 1, target: 'self' }] }];
            } });
        const result = battle.play(end.id);
        assert.equal(result.state.units.foe.statuses.doom, amount);
        assert.equal(result.state.units.foe.alive, false);
        assert.equal(result.state.units.foe2.statuses.doom, undefined);
        assert.equal(result.state.units.foe2.alive, true);
        assert.ok(result.events.some(e => e.type === 'defeated' && e.unitId === 'foe'));
        battle.replay();
    }
});


test('特色模型：黑洞按圣辉实际变动触发一次，王座支付第二费用且每出牌回复圣辉', () => {
    const hole = signatureCard('black-hole');
    const throne = signatureCard('sealed-throne');
    const gain = { id: 'signature-stars', name: '星辉', type: 'skill', rarity: 'common', cost: 0,
        effects: [{ op: 'radiance', amount: 5 }] };
    for (const upgraded of [false, true]) {
        const battle = signatureBattle([hole, throne, gain, strike], { energy: 10, secondFoe: true,
            upgraded: upgraded ? [hole.id, throne.id] : [],
            configure(input) {
                input.units[0].deck = [hole, throne, gain, gain, gain, strike, strike, strike, strike, strike]
                    .map(card => ({ cardId: card.id, upgraded: upgraded && [hole.id, throne.id].includes(card.id) }));
            } });
        battle.play(hole.id);
        const inst = battle.find(throne.id);
        const blocked = applyAction(battle.state, { type: 'play', inst });
        assert.equal(blocked.ok, false);
        const amount = (upgraded ? upgradedCardFace(hole) : hole).effects[0].then[0].amount;
        for (let n = 0; n < 3; n += 1) {
            const result = battle.play(gain.id);
            const damage = result.events.filter(e => e.type === 'damage' && e.source?.id === hole.id);
            assert.deepEqual(damage.map(e => [e.target, e.amount]), n < 2 ? [['foe', amount], ['foe2', amount]] : []);
        }
        assert.equal(battle.state.units.hero.res.radiance, 10);
        const energy = battle.state.units.hero.energy;
        const cost = cardView(battle.state, inst).cost;
        const result = battle.play(throne.id);
        assert.equal(battle.state.units.hero.energy, energy - cost);
        assert.equal(battle.state.units.hero.res.radiance, 8);
        assert.deepEqual(result.events.filter(e => e.type === 'radiance').map(e => e.delta), [-3, 1]);
        assert.equal(result.events.filter(e => e.type === 'damage' && e.source?.id === hole.id).length, 4);
        const next = battle.play(strike.id, 'foe');
        assert.equal(battle.state.units.hero.res.radiance, 9);
        assert.equal(next.events.filter(e => e.type === 'damage' && e.source?.id === hole.id).length, 2);
        battle.replay();
    }
});


test('特色模型：精炼的延迟能量只发一次，熔炉每回合抽牌前锻造且升级增量生效', () => {
    const refine = signatureCard('refine-blade');
    const furnace = signatureCard('furnace');
    for (const upgraded of [false, true]) {
        const battle = signatureBattle([refine, furnace, strike], { energy: 10,
            upgraded: upgraded ? [refine.id, furnace.id] : [] });
        const refined = cardView(battle.state, battle.find(refine.id)).effects[0].amount;
        const perTurn = cardView(battle.state, battle.find(furnace.id)).effects[0].then[0].amount;
        battle.play(furnace.id);
        assert.equal(battle.state.units.hero.res?.forge, undefined);
        battle.play(refine.id);
        assert.equal(battle.state.units.hero.res.forge.value, refined);
        assert.ok(battle.find('forge-blade'));
        for (let turn = 1; turn <= 2; turn += 1) {
            const result = battle.step({ type: 'end-turn' });
            assert.equal(battle.state.units.hero.res.forge.value, Math.min(30, refined + perTurn * turn));
            assert.equal(battle.state.units.hero.energy, turn === 1 ? 11 : 10);
            const forged = result.events.findIndex(e => e.type === 'forge' && e.unitId === 'hero');
            const drawn = result.events.findIndex(e => e.type === 'draw' && e.unitId === 'hero');
            assert.ok(forged >= 0 && forged < drawn);
        }
        battle.replay();
    }
});

test('特色模型：回响每回合只重演首牌，后续牌不重演且下回合重置', () => {
    const echo = signatureCard('echo-form');
    for (const upgraded of [false, true]) {
        const battle = signatureBattle([echo, strike], { energy: 10, upgraded: upgraded ? [echo.id] : [] });
        assert.equal(Boolean(cardView(battle.state, battle.find(echo.id)).ethereal), !upgraded);
        battle.play(echo.id);
        battle.step({ type: 'end-turn' });
        for (const hits of [2, 1]) {
            const result = battle.play(strike.id, 'foe');
            assert.equal(result.events.filter(e => e.type === 'damage' && e.source?.id === strike.id).length, hits);
        }
        assert.equal(battle.state.units.hero.cardsPlayed, 2);
        battle.step({ type: 'end-turn' });
        const result = battle.play(strike.id, 'foe');
        assert.equal(result.events.filter(e => e.type === 'damage' && e.source?.id === strike.id).length, 2);
        battle.replay();
    }
});


test('特色模型：兵工厂与创世之柱按实际造牌计数，状态牌也触发，敌方塞牌不触发', () => {
    const arsenal = signatureCard('arsenal');
    const pillar = signatureCard('pillar-of-creation');
    const maker = { id: 'signature-maker', name: '造牌', type: 'skill', rarity: 'common', cost: 0,
        effects: [{ op: 'create', card: 'token-shard', amount: 2, to: 'discard' }, { op: 'create', card: 'status-daze', amount: 1, to: 'discard' }] };
    for (const upgraded of [false, true]) {
        const battle = signatureBattle([arsenal, pillar, maker, strike], { energy: 10,
            upgraded: upgraded ? [arsenal.id, pillar.id] : [], configure(input) {
                input.units[1].skills = [{ id: 'junk', name: '塞牌', intent: 'debuff',
                    effects: [{ op: 'create', card: 'status-daze', amount: 1, to: 'discard' }] }];
            } });
        const amount = cardView(battle.state, battle.find(pillar.id)).effects[0].then[0].amount;
        assert.equal(Boolean(cardView(battle.state, battle.find(arsenal.id)).innate), upgraded);
        battle.play(arsenal.id);
        battle.play(pillar.id);
        const result = battle.play(maker.id);
        assert.equal(result.events.filter(e => e.type === 'card-created').length, 3);
        assert.equal(battle.state.units.hero.statuses.strength, 3);
        assert.equal(battle.state.units.hero.block, amount * 3);
        const next = battle.step({ type: 'end-turn' });
        assert.ok(next.events.some(e => e.type === 'card-created' && e.cardId === 'status-daze'));
        assert.equal(battle.state.units.hero.statuses.strength, 3);
        assert.equal(next.events.filter(e => e.type === 'buff-trigger' && [arsenal.id, pillar.id].includes(e.buffId)).length, 0);
        battle.replay();
    }
});

test('特色模型：创世在下回合抽牌前获得圣辉，升级收益增加且遵守资源上限', () => {
    const genesis = signatureCard('genesis');
    for (const upgraded of [false, true]) {
        const battle = signatureBattle([genesis, strike], { energy: 10, upgraded: upgraded ? [genesis.id] : [] });
        const amount = cardView(battle.state, battle.find(genesis.id)).effects[0].then[0].amount;
        battle.play(genesis.id);
        assert.equal(battle.state.units.hero.res?.radiance || 0, 0);
        for (let turn = 1; turn <= 4; turn += 1) {
            const result = battle.step({ type: 'end-turn' });
            assert.equal(battle.state.units.hero.res.radiance, Math.min(10, amount * turn));
            const power = result.events.findIndex(e => e.type === 'power-trigger' && e.cardId === genesis.id);
            const draw = result.events.findIndex(e => e.type === 'draw' && e.unitId === 'hero');
            assert.ok(power >= 0 && power < draw);
        }
        battle.replay();
    }
});


test('特色模型：亡灵精通按随从实际失血使全体敌人失血，格挡不减随从生命', () => {
    const mastery = signatureCard('necro-mastery');
    const guard = { id: 'signature-minion-guard', name: '护卫', type: 'skill', rarity: 'common', cost: 0,
        effects: [{ op: 'block', amount: 20, target: 'self' }] };
    for (const upgraded of [false, true]) {
        const battle = signatureBattle([mastery, guard, strike], { energy: 10, secondFoe: true,
            upgraded: upgraded ? [mastery.id] : [], configure(input) {
                input.units[2].skills = [{ id: 'wait', name: '等待', intent: 'defend', effects: [{ op: 'block', amount: 1, target: 'self' }] }];
            } });
        const amount = cardView(battle.state, battle.find(mastery.id)).effects[0].amount;
        battle.play(mastery.id);
        assert.deepEqual(battle.state.units.hero.res.minion, { hp: amount, maxHp: amount });
        const result = battle.step({ type: 'end-turn' });
        const lost = Math.min(amount, 8);
        assert.equal(result.events.filter(e => e.type === 'minion-loss').reduce((sum, e) => sum + e.amount, 0), lost);
        assert.deepEqual(result.events.filter(e => e.type === 'damage' && e.kind === 'minion-bond').map(e => [e.target, e.hpLoss]), [['foe', lost], ['foe2', lost]]);
        assert.equal(battle.state.units.hero.hp, 200 - (8 - lost));
        battle.play(mastery.id);
        const hp = battle.state.units.hero.res.minion.hp;
        battle.play(guard.id);
        const blocked = battle.step({ type: 'end-turn' });
        assert.equal(blocked.events.filter(e => e.type === 'minion-loss').length, 0);
        assert.equal(battle.state.units.hero.res.minion.hp, hp);
        battle.replay();
    }
});


test('特色模型：吞噬只为非爪牙击倒登记最大生命成长，升级奖励与消耗保留', () => {
    const feed = signatureCard('feed');
    for (const upgraded of [false, true]) for (const minion of [false, true]) {
        const face = upgraded ? upgradedCardFace(feed) : feed;
        const reward = face.effects[1].amount;
        const battle = signatureBattle([feed, strike], { energy: 10, secondFoe: true,
            upgraded: upgraded ? [feed.id] : [], configure(input) {
                if (minion) {
                    input.units[1].passives = [{ id: 'signature-feed-minion', name: '召唤爪牙', trigger: 'battle-start',
                        effects: [{ op: 'summon-minion', amount: 1, hp: 1, damage: 1 }] }];
                } else input.units[1].maxHp = face.effects[0].amount;
            } });
        const target = minion ? Object.values(battle.state.units).find(unit => unit.minion === true) : battle.state.units.foe;
        assert.ok(target, '正式召唤路径必须生成目标');
        assert.equal(target.minion === true, minion);
        if (minion) assert.ok(battle.events.some(event => event.type === 'minion-enter' && event.unitId === target.id));
        const inst = battle.find(feed.id);
        const result = battle.play(feed.id, target.id);
        assert.equal(result.state.units[target.id].alive, false);
        assert.equal(result.state.units.hero.res?.battleGrowth?.hpMax || 0, minion ? 0 : reward);
        assert.equal(result.events.filter(e => e.type === 'battle-growth' && e.stat === 'hp-max').length, minion ? 0 : 1);
        assert.ok(result.state.piles.hero.exhaust.includes(inst));
        assert.equal(result.state.cards[inst].realExhaust, true);
        battle.replay();
    }
});

test('特色模型：计算赌博弃掉其余手牌并抽等量，升级保留且本牌真实消耗', () => {
    const gamble = signatureCard('calculated-gamble');
    for (const upgraded of [false, true]) {
        const battle = signatureBattle([gamble, strike], { draw: 5, energy: 10, upgraded: upgraded ? [gamble.id] : [] });
        const inst = battle.find(gamble.id);
        assert.equal(Boolean(cardView(battle.state, inst).retain), upgraded);
        const count = battle.state.piles.hero.hand.length - 1;
        assert.equal(count, 4);
        const result = battle.play(gamble.id);
        assert.equal(result.events.filter(e => e.type === 'discard' && e.unitId === 'hero').length, count);
        assert.equal(result.state.piles.hero.hand.length, count);
        assert.equal(result.state.piles.hero.discard.length, count);
        assert.ok(result.state.piles.hero.exhaust.includes(inst));
        assert.equal(result.state.cards[inst].realExhaust, true);
        battle.replay();
    }
});

test('特色模型：扼喉仅令指定敌人按本回合出牌失血，回合末清除', () => {
    const strangle = signatureCard('strangle');
    for (const upgraded of [false, true]) {
        const battle = signatureBattle([strangle, strike], { energy: 10, secondFoe: true, upgraded: upgraded ? [strangle.id] : [] });
        const amount = cardView(battle.state, battle.find(strangle.id)).effects[1].stacks;
        const result = battle.play(strangle.id, 'foe2');
        assert.deepEqual(result.events.filter(e => e.type === 'damage' && e.kind === 'garrote').map(e => [e.target, e.hpLoss]), [['foe2', amount]]);
        const next = battle.play(strike.id, 'foe');
        assert.deepEqual(next.events.filter(e => e.type === 'damage' && e.kind === 'garrote').map(e => [e.target, e.hpLoss]), [['foe2', amount]]);
        battle.step({ type: 'end-turn' });
        assert.equal(battle.state.units.foe2.statuses.garrote || 0, 0);
        const after = battle.play(strike.id, 'foe');
        assert.equal(after.events.filter(e => e.type === 'damage' && e.kind === 'garrote').length, 0);
        battle.replay();
    }
});

test('战利品单张卡接受或放弃经战报扫描持久化，旧无选择标记照常领取', async (t) => {
    for (const [listed, pick] of [[false, 0], [false, 'skip'], [true, 0], [true, 'skip'], [false, undefined]]) {
        const fixture = await createGenerationFixture();
        t.after(fixture.dispose);
        const ledger = fixture.services.getLedger();
        const hero = await fixture.hero();
        const chat = fixture.host.SillyTavern.getContext().chat;
        const messageId = chat.push({ is_user: false, mes: '[igs-combat:start|战后领悟|野狼|艾拉|normal]', swipe_id: 0 }) - 1;
        const located = locateCombatStart(chat, messageId);
        assert.equal(located.ok, true);
        const card = normalizeCard({ id: 'loot-solo', name: '战后领悟', cost: 1, rarity: 'common', ...solveCardTemplate('strike', 1, 'common') });
        assert.equal(card.ok, true, JSON.stringify(card.errors));
        const slot = { index: 0, kind: 'card', rarity: 'common', name: card.value.name, origin: '从对手的招式里领悟', card: card.value,
            ...(listed ? { choices: [card.value] } : {}) };
        const offer = { combatId: located.combatId, tier: 'normal', exp: 0, reveal: 0, slots: [slot,
            ...[1, 2].map(index => ({ index, kind: 'keepsake', rarity: 'common', name: `碎片${index}`, origin: '' }))] };
        const saved = await ledger.append({ id: 'offer-solo', type: 'offer', character: hero.id, anchor: located.anchor, payload: offer, createdAt: messageId });
        assert.equal(saved.ok, true, JSON.stringify(saved));
        const position = flipOrder(offer, 'main').indexOf(0);
        const flipped = flipCard(offer, emptyPick(), position);
        assert.equal(flipped.ok, true);
        assert.equal(flipView(offer, flipped.pick).needCard, true);
        assert.equal(pickCardChoice(offer, flipped.pick, 1).ok, false);
        const selected = pick === undefined ? flipped.pick : pickCardChoice(offer, flipped.pick, pick).pick;
        assert.deepEqual(normalizePick(selected, offer), selected);
        if (pick !== undefined) assert.equal(flipView(offer, selected).needCard, false);
        const reportId = reportIdFor(located.combatId);
        const text = attachLoot(`<igs-combat-report id="${reportId}" result="win" encounter="战后领悟">\n胜利。\n</igs-combat-report>`,
            { character: '艾拉', reportId, ...lootOf(offer, selected) });
        const reportFloor = chat.push({ is_user: true, mes: text, swipe_id: 0 }) - 1;
        assert.equal((await ledger.scan({ messageIds: [reportFloor] })).ok, true);
        const snapshot = await ledger.read();
        const stored = snapshot.entries.find(entry => entry.type === 'loot' && entry.payload.combatId === located.combatId);
        assert.ok(stored, JSON.stringify(snapshot));
        assert.equal(stored.payload.pick, pick);
        const state = await ledger.effectiveState();
        const replay = computeEffectiveState(snapshot, chat, { userName: '艾拉' });
        for (const result of [state, replay]) {
            assert.equal(result.ok, true);
            assert.ok(result.loots.has(located.combatId));
            assert.deepEqual(result.diagnostics.filter(row => row.id === stored.id), []);
            const total = character => [...character.owned.values()].reduce((sum, count) => sum + count, 0);
            assert.equal(total(result.characters.get(hero.id)) - total(hero), pick === 'skip' ? 0 : 1);
        }
    }
});

test('战利品单张卡显示费用效果来历，接受或放弃后移除详情且保留发送入口', async () => {
    const { JSDOM } = await import('jsdom');
    const card = { ...strike, name: '狼嚎震心', cost: 1 };
    const slot = { index: 0, kind: 'card', rarity: 'common', name: card.name, origin: '学头狼短嚎的走音断句，竟也震人耳膜。', card };
    const offer = { combatId: 'loot-display', slots: [slot, ...[1, 2].map(index => ({ index, kind: 'keepsake', rarity: 'common', name: `碎片${index}`, origin: '' }))] };
    const original = structuredClone(offer);
    const pick = flipCard(offer, emptyPick(), flipOrder(offer, 'main').indexOf(0)).pick;
    for (const skin of ['initial', ...Object.keys(CANVAS_BATTLE)]) {
        const dom = new JSDOM(renderCombatPanelHtml({ status: 'send-failed', skin, orient: 'land', flip: flipView(offer, pick) }));
        try {
            const doc = dom.window.document;
            const detail = doc.querySelector('[role="region"][aria-label="狼嚎震心 奖励详情"]');
            assert.ok(detail, skin);
            assert.equal(detail.querySelector('.igs-combat-loot-detail-name').textContent, card.name, skin);
            assert.equal(detail.querySelector('.igs-combat-loot-detail-effect').textContent, '造成 6 点伤害', skin);
            assert.equal(detail.querySelector('.igs-combat-loot-detail-origin').textContent, slot.origin, skin);
            assert.ok(detail.querySelector('.igs-combat-loot-detail-meta').textContent.includes('1费'), skin);
            assert.equal(detail.querySelector('[data-combat-id="0"]').textContent, '接受', skin);
            assert.equal(detail.querySelector('[data-combat-id="skip"]').textContent, '放弃', skin);
            assert.equal(doc.querySelector('[data-combat-act="retry-send"]'), null);
            assert.equal(detail.querySelectorAll('[data-combat-act="pick-card"]').length, 2, skin);
            assert.equal(detail.querySelector('.igs-combat-loot-card'), null, skin);
            for (const value of [0, 'skip']) {
                const selected = pickCardChoice(offer, pick, value);
                assert.equal(selected.ok, true);
                const chosen = new JSDOM(renderCombatPanelHtml({ status: 'send-failed', skin, flip: flipView(offer, selected.pick) }));
                try {
                    const selectedDoc = chosen.window.document;
                    assert.equal(selectedDoc.querySelector('.igs-combat-loot-detail'), null, skin);
                    assert.equal(selectedDoc.querySelector('[data-combat-act="pick-card"]'), null, skin);
                    assert.equal(selectedDoc.querySelectorAll('.igs-combat-loot > .igs-combat-loot-row > .igs-combat-loot-card').length, offer.slots.length, skin);
                    assert.ok(chosen.window.document.querySelector('[data-combat-act="retry-send"]'), skin);
                } finally { chosen.window.close(); }
            }
        } finally { dom.window.close(); }
    }
    assert.deepEqual(offer, original);
});

test('发送战报点击后立即关闭面板，未返回的真实会话继续发送并结算', async (t) => {
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<div id="igs-overlay"></div>', { url: 'http://127.0.0.1/', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const chat = [{ is_user: false, mes: '[igs-combat:start|发送验证|史莱姆|我|normal]', swipe_id: 0 }];
    const located = locateCombatStart(chat, 0);
    const input = setup();
    input.canEscape = true;
    const storage = createCountingStorage();
    storage.setItem(sessionKeyFor('send-close'), JSON.stringify({ v: SESSION_VERSION, combatId: located.combatId,
        anchor: located.anchor, seed: 7, setup: input, actions: [{ type: 'escape' }], encounter: located.start.encounter, tiers: ['normal'], expTargets: [] }));
    let release;
    let entered;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    let sends = 0;
    const actual = createCombatSession({ chat, storage, userName: '主角', getChatId: () => 'send-close',
        ledger: { read: async () => ({ ok: true, entries: [] }), append: async () => ({ ok: true }), scan: async () => ({ ok: true }) },
        send: async text => { sends += 1; entered(); await gate; chat.push({ is_user: true, mes: text }); return { ok: true, messageId: chat.length - 1 }; } });
    t.after(() => { release(); actual.dispose(); });
    assert.equal(actual.resume().ok, true);
    let task;
    const session = { ...actual, finish: () => { task = actual.finish(); return task; } };
    const closed = [];
    const panel = createCombatPanelController(dom.window.document, { getSession: () => session, skin: () => 'initial', reducedMotion: () => true,
        onClose: result => closed.push(result) });
    t.after(() => panel.dispose());
    assert.equal(panel.open(dom.window.document.querySelector('#igs-overlay'), { messageId: 0 }).ok, true);
    const button = dom.window.document.querySelector('[data-combat-act="finish"]');
    assert.ok(button);
    button.click();
    assert.equal(panel.isOpen(), false);
    assert.equal(closed[0].dismissed, false);
    assert.equal(dom.window.document.querySelector('#igs-combat-panel'), null);
    await started;
    assert.equal(sends, 1);
    assert.equal(actual.state().status, 'ended');
    release();
    assert.equal((await task).ok, true);
    assert.equal(actual.state().status, 'done');
    assert.equal(sends, 1);
    assert.equal(panel.isOpen(), false);
});