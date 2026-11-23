import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyAction, createBattle, replayBattle } from '../src/combat/engine.js';
import { COMBAT_RULES, combatSpeedFor, crowdScaleFor, enemySpeedFor, estimateBattleEffectsValue, estimateCardValue, estimateEffectsValue, evaluateCardBudget, rarityWindow, scaleEnemyStats } from '../src/combat/rules.js';
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
import { COMBAT_IMPACT_FX_STYLE_TEXT, COMBAT_IMPACT_VIGNETTE_ATTR, impactTierFor, pulseVignette, showImpactBurst, showShieldBreak, showStatusFx } from '../src/visual/igs-ui/combat-impact-fx.js';
import { COMBAT_VFX_THEMES, resolveVfxTheme, vfxTextureUrl } from '../src/visual/igs-ui/combat-vfx-themes.js';
import { CARD_INCOMING_ATTR, COMBAT_CARD_MOTION, COMBAT_CARD_MOTION_STYLE_TEXT, PILE_BUMP_ATTR, bumpPile, cardNaturalRotate, findPileEl, measureCardBox, pileAnchorRect, planCardMotions, playDiscardCards, playDrawCards, syncPileDocks } from '../src/visual/igs-ui/combat-card-motion.js';
import { BATTLE_SFX_PARTIALS } from '../src/visual/igs-ui/fx-battle-sfx.js';
import { attributeMultiplier, createAttributePolicy } from '../src/combat/attribute-policy.js';
import { fitCard } from '../src/combat/fixed-cards/dsl.js';
import { chooseAllyPlay, pickCards } from '../src/combat/policy.js';
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

test('属性策略 v3：最大倍率封顶 2.0 且不随等级变化，v1/v2 对局按旧公式重放，版本错配拒收', () => {
    const scores = { str: 20, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
    const make = (version, proficiency, str = 20) => ({ version, role: 'warrior', scores: { ...scores, str }, proficiency });
    // v3（方案 C）：每 +2 属性 +16%，常规上限 2.00，辅助上限 1.50，熟练加值（等级）不影响倍率。
    assert.equal(attributeMultiplier(make(3, 2, 20), 'str'), 1.8);
    assert.equal(attributeMultiplier(make(3, 2, 20), 'str'), attributeMultiplier(make(3, 6, 20), 'str'));
    assert.equal(attributeMultiplier(make(3, 2, 24), 'str'), 2);
    assert.equal(attributeMultiplier(make(3, 2, 30), 'str'), 2);
    assert.equal(attributeMultiplier(make(3, 2, 1), 'str'), 0.8);
    assert.equal(attributeMultiplier(make(3, 2, 20), 'str', 'support'), 1.4);
    assert.equal(attributeMultiplier(make(3, 2, 30), 'str', 'support'), 1.5);
    assert.equal(attributeMultiplier(make(3, 2, 1), 'str', 'support'), 0.9);
    // v2 / v1 旧曲线保持不变，确保历史存档确定性重放。
    assert.ok(attributeMultiplier(make(2, 2), 'str') >= 2.5);
    assert.equal(attributeMultiplier(make(2, 2), 'str'), attributeMultiplier(make(2, 6), 'str'));
    assert.equal(attributeMultiplier(make(2, 2, 30), 'str'), 3);
    assert.equal(attributeMultiplier(make(2, 2, 1), 'str'), 0.7);
    assert.ok(attributeMultiplier(make(2, 2), 'str', 'support') < attributeMultiplier(make(2, 2), 'str'));
    assert.equal(attributeMultiplier(make(1, 2, 15), 'str'), 1.16);
    assert.equal(attributeMultiplier(make(1, 6, 15), 'str'), 1.3);
    assert.equal(createAttributePolicy({ attributes: { scores, proficiency: 2 }, classProfile: { archetype: 'warrior' } }).version, 3);

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
    // v3：6 × 1.8 = 10.8 → 11，熟练加值（等级）不再改变结果；主属性 30 封顶 2.0：6 × 2.0 = 12。
    for (const proficiency of [2, 6]) assert.equal(run(7, 3, make(3, proficiency, 20)).state.units.foe.hp, 489);
    assert.equal(run(7, 3, make(3, 2, 30)).state.units.foe.hp, 488);
    // v2 旧局继续按 6 × 2.5 = 15 重放。
    for (const proficiency of [2, 6]) assert.equal(run(7, 2, make(2, proficiency)).state.units.foe.hp, 485);
    // 旧 v1 策略（含已开局的 v7 对局）沿用 1 + 0.08 × (修正 + 熟练 − 2)：6 × 1.3 = 8。
    assert.equal(run(6, 1, make(1, 2)).state.units.foe.hp, 492);
    assert.equal(run(7, 1, make(1, 2)).state.units.foe.hp, 492);
    assert.equal(run(6, 2, make(2, 2)).error.reason, 'invalid-attribute-rules');
    assert.equal(run(6, 3, make(3, 2)).error.reason, 'invalid-attribute-rules');
    assert.equal(run(7, 4, make(3, 2)).error.reason, 'invalid-attribute-rules');
    assert.equal(run(7, 3, make(2, 2)).error.reason, 'invalid-attribute-policy');
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
        assert.equal(built.setup.attributeRules, 3);
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
    assert.equal(enemySpeedFor(120), 115);
    assert.equal(enemySpeedFor(90), 90);
    const template = templateEnemy('史莱姆', 'normal');
    const start = { enemies: [{ name: '史莱姆', count: 1 }] };
    for (const [speed, expected] of [[120, 115], [90, 90]]) {
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
    for (const [tier, hp, damage, speed] of [
        ['stronger', 1.15, 1.1, 1.03],
        ['formidable', 1.35, 1.25, 1.06],
        ['overwhelming', 1.65, 1.45, 1.1],
    ]) {
        const reference = enemyUnits(start, new Map([['史莱姆', enemy]]), 1, 'normal', new Map([['史莱姆', { ...untagged, tier: 'even' }]])).units[0];
        const actual = enemyUnits(start, new Map([['史莱姆', enemy]]), 1, 'normal', new Map([['史莱姆', { ...untagged, tier }]])).units[0];
        assert.ok(Math.abs(actual.maxHp - reference.maxHp * hp) <= 1, `${tier}: maxHp`);
        assert.ok(Math.abs(actual.damageScale - reference.damageScale * damage) <= 0.02, `${tier}: damageScale`);
        assert.equal(actual.speed, Math.round(reference.speed * speed), `${tier}: speed`);
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
            assert.deepEqual(replay.events, events);
        },
    };
}

function confusedBattle(cards, { version = 7, active = true, ...options } = {}) {
    const battle = signatureBattle(cards, { energy: 10, ...options,
        configure(input) {
            input.rulesVersion = version;
            if (version < 7) {
                delete input.cardUpgradeRules;
                delete input.exhaustRules;
            }
            input.units[0].deck = cards.map(card => card.id);
            if (active) input.units[1].passives = [{ id: 'confused-start', name: '混乱', trigger: 'battle-start', effects: [
                { op: 'apply-status', status: 'confused', stacks: 1, target: 'enemy' },
                { op: 'apply-status', status: 'confused', stacks: 1, target: 'enemy' },
            ] }];
            options.configure?.(input);
        },
    });
    if (active) battle.step({ type: 'end-turn' });
    return battle;
}
const confusedCard = (id, effects, extra = {}) => ({ id, name: id, type: 'skill', cost: 1, effects, ...extra });

test('Confused 真实抽牌随机0–3且不叠加，跳过X费和不可打出牌，v3–v7重放一致', () => {
    const cards = [0, 1, 2, 3].map(cost => confusedCard(`confused-${cost}`, [{ op: 'block', amount: 1 }], { cost }));
    cards.push(confusedCard('confused-x', [{ op: 'block', amount: 1 }], { cost: 'X' }),
        confusedCard('confused-locked', [{ op: 'block', amount: 1 }], { unplayable: true }));
    const seen = new Set();
    for (const version of [3, 4, 5, 6, 7]) for (const seed of [0, 7, 19, 42]) {
        const battle = confusedBattle(cards, { version, seed });
        const rolled = battle.events.filter(event => event.type === 'cost-randomized');
        assert.equal(rolled.length, version >= 5 ? 4 : 0);
        assert.equal(battle.state.units.hero.statuses.confused, version >= 5 ? 1 : undefined);
        for (const event of rolled) {
            assert.ok(Number.isInteger(event.cost) && event.cost >= 0 && event.cost <= 3);
            assert.equal(cardView(battle.state, event.inst).cost, event.cost);
            seen.add(event.cost);
        }
        for (const id of ['confused-x', 'confused-locked']) {
            const inst = battle.find(id);
            assert.equal(battle.state.cards[inst].confusedCost, undefined);
            assert.equal(cardView(battle.state, inst).cost, id === 'confused-x' ? 'X' : 1);
        }
        battle.replay();
    }
    assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
    const normal = confusedBattle(cards, { active: false });
    assert.equal(normal.events.some(event => event.type === 'cost-randomized'), false);
    assert.ok(Object.values(normal.state.cards).every(entry => !Object.hasOwn(entry, 'confusedCost')));
    normal.replay();
});

test('Confused 回手和直接生成不重掷，保留跨回合及净化后仍保留实例费用', () => {
    const loop = confusedCard('confused-loop', [{ op: 'recur', to: 'hand' }]);
    const keep = confusedCard('confused-keep', [{ op: 'grant-flag', flag: 'retain' }]);
    const make = confusedCard('confused-make', [{ op: 'create', card: 'status-slime', amount: 1, to: 'hand' }]);
    const clean = confusedCard('confused-clean', [{ op: 'cleanse', target: 'self' }]);
    const battle = confusedBattle([loop, keep, make, clean]);
    const inst = battle.find(loop.id);
    const cost = battle.state.cards[inst].confusedCost;
    const returned = battle.play(loop.id);
    assert.ok(battle.state.piles.hero.hand.includes(inst));
    assert.equal(battle.state.cards[inst].confusedCost, cost);
    assert.equal(returned.events.some(event => event.type === 'cost-randomized'), false);
    const created = battle.play(make.id);
    const token = created.events.find(event => event.type === 'card-created').inst;
    assert.equal(battle.state.cards[token].confusedCost, undefined);
    assert.equal(cardView(battle.state, token).cost, 1);
    assert.equal(created.events.some(event => event.type === 'cost-randomized'), false);
    battle.play(keep.id);
    battle.step({ type: 'end-turn' });
    assert.ok(battle.state.piles.hero.hand.includes(inst));
    assert.equal(battle.state.cards[inst].confusedCost, cost);
    const beforeClean = battle.state.cards[inst].confusedCost;
    battle.play(clean.id);
    assert.equal(battle.state.units.hero.statuses.confused, undefined);
    assert.equal(cardView(battle.state, inst).cost, beforeClean);
    battle.step({ type: 'end-turn' });
    assert.equal(battle.state.cards[inst].confusedCost, beforeClean);
    battle.replay();
});

test('Confused 普通复制、延迟复制和消耗堆复制保留随机费用，不视为抽牌', () => {
    for (const mode of ['copy', 'copy-next', 'copy-exhausted']) {
        const effects = mode === 'copy'
            ? [{ op: 'copy', from: 'self', amount: 1, to: 'hand' }]
            : mode === 'copy-next' ? [{ op: 'copy-next', from: 'self', amount: 1 }]
                : [{ op: 'exhaust-self' }];
        const source = confusedCard('confused-source', effects);
        const copier = confusedCard('confused-copier', [{ op: 'copy-exhausted', amount: 1 }]);
        const battle = confusedBattle([source, copier]);
        const inst = battle.find(source.id);
        const cost = battle.state.cards[inst].confusedCost;
        let result = battle.play(source.id);
        if (mode === 'copy-next') result = battle.step({ type: 'end-turn' });
        if (mode === 'copy-exhausted') {
            assert.ok(battle.state.piles.hero.exhaust.includes(inst));
            result = battle.play(copier.id);
        }
        const copy = result.events.find(event => event.type === 'card-created' && event.cardId === source.id);
        assert.ok(copy, mode);
        assert.notEqual(copy.inst, inst);
        assert.equal(battle.state.cards[copy.inst].confusedCost, cost, mode);
        assert.equal(cardView(battle.state, copy.inst).cost, cost, mode);
        assert.equal(result.events.some(event => event.type === 'cost-randomized' && event.inst === copy.inst), false);
        battle.replay();
    }
});

test('Confused 改费升级恢复升级费用，不改费升级及重复升级不重置，三条变形清除旧费用', () => {
    for (const changed of [false, true]) {
        const card = confusedCard('confused-upgrade', [{ op: 'upgrade-card', amount: 1, mode: 'self' }, { op: 'recur', to: 'hand' }],
            { upgraded: { ...(changed ? { cost: 0 } : {}), effects: [{ op: 'upgrade-card', amount: 1, mode: 'self' }, { op: 'recur', to: 'hand' }] } });
        const battle = confusedBattle([card]);
        const inst = battle.find(card.id);
        const cost = battle.state.cards[inst].confusedCost;
        battle.play(card.id);
        assert.equal(battle.state.cards[inst].upgraded, true);
        assert.equal(battle.state.cards[inst].confusedCost, changed ? undefined : cost);
        assert.equal(cardView(battle.state, inst).cost, changed ? 0 : cost);
        battle.step({ type: 'end-turn' });
        const rerolled = battle.state.cards[inst].confusedCost;
        battle.play(card.id);
        assert.equal(battle.state.cards[inst].confusedCost, rerolled);
        battle.replay();
    }
    for (const op of ['transmute', 'morph-hand', 'transform-minion']) {
        const target = confusedCard('confused-transform-target', [{ op: 'block', amount: 1 }], { type: 'attack' });
        const effect = op === 'transmute' ? { op, amount: 1, mode: 'choose' } : op === 'morph-hand' ? { op, cardType: 'attack' } : { op };
        const change = confusedCard('confused-transform', [effect]);
        const battle = confusedBattle([target, change]);
        const inst = battle.find(target.id);
        assert.ok(Number.isInteger(battle.state.cards[inst].confusedCost));
        battle.play(change.id);
        if (battle.state.pending) battle.step({ type: 'choose', insts: [inst] });
        assert.notEqual(battle.state.cards[inst].cardId, target.id);
        assert.equal(battle.state.cards[inst].confusedCost, undefined, op);
        battle.replay();
    }
});

test('Confused 检索、取回不重掷，可打出状态牌入库抽牌触发随机，重抽覆盖旧减费且新修正生效', () => {
    const pickCard = confusedCard('confused-search', [{ op: 'search', amount: 1, cardType: 'attack' }], { cost: 0 });
    const fetchCard = confusedCard('confused-retrieve', [{ op: 'retrieve', amount: 1, from: 'discard', cardType: 'attack' }], { cost: 0 });
    const target = confusedCard('confused-target', [{ op: 'damage', amount: 4, target: 'enemy' }], { type: 'attack', cost: 2 });
    const dropCard = confusedCard('confused-drop', [{ op: 'discard', amount: 1, mode: 'choose' }], { cost: 0 });
    const drawCard = confusedCard('confused-draw', [{ op: 'draw', amount: 2 }], { cost: 0 });
    const slimeMaker = confusedCard('confused-slime-draw', [
        { op: 'create', card: 'status-slime', amount: 1, to: 'draw' },
        { op: 'create', card: 'status-slime-sts2', amount: 1, to: 'draw' },
    ], { cost: 0 });
    const cheapCard = confusedCard('confused-cheap', [
        { op: 'cost-mod', amount: -1, mode: 'choose', scope: 'combat' },
        { op: 'cost-mod', amount: -1, mode: 'choose', scope: 'turn' },
        { op: 'discount-card', amount: 1, count: 1, cardType: 'attack' },
    ], { cost: 0 });
    // 1) search 检索：目标在抽牌堆中，检索入手不触发 cost-randomized 且保持无 confusedCost。
    const filler = confusedCard('confused-filler', [{ op: 'block', amount: 1 }], { cost: 0 });
    let sb = null;
    for (let seed = 1; seed <= 30; seed += 1) {
        const candidate = confusedBattle([pickCard, target, filler], { draw: 1, seed });
        if (candidate.find(pickCard.id)
            && candidate.state.piles.hero.draw.some(inst => candidate.state.cards[inst].cardId === target.id)) {
            sb = candidate;
            break;
        }
    }
    assert.ok(sb, '需要找到 pickCard 在手牌且 target 在抽牌堆的确定性种子');
    const drawTargetInst = sb.state.piles.hero.draw.find(inst => sb.state.cards[inst].cardId === target.id);
    assert.ok(drawTargetInst);
    const beforeSearch = sb.state.cards[drawTargetInst].confusedCost;
    const searched = sb.play(pickCard.id);
    assert.ok(sb.state.piles.hero.hand.includes(drawTargetInst));
    assert.equal(sb.state.cards[drawTargetInst].confusedCost, beforeSearch);
    assert.equal(searched.events.some(event => event.type === 'cost-randomized'), false);
    sb.replay();

    // 2) 抽到后施加 costMod / turnCostMod / discount 生效 -> 丢弃 -> retrieve 回手不重掷 -> 再丢弃重抽覆盖旧减费。
    let mb = null;
    for (let seed = 1; seed <= 40; seed += 1) {
        const candidate = confusedBattle([target, cheapCard, dropCard, fetchCard, drawCard, slimeMaker], { draw: 6, seed });
        const inst = candidate.find(target.id);
        if (inst && candidate.state.cards[inst].confusedCost === 3) { mb = candidate; break; }
    }
    assert.ok(mb, '需要找到目标牌混乱费用为 3 的确定性种子');
    const tInst = mb.find(target.id);
    assert.equal(cardView(mb.state, tInst).cost, 3);
    mb.play(cheapCard.id);
    if (mb.state.pending) mb.step({ type: 'choose', insts: [tInst] });
    if (mb.state.pending) mb.step({ type: 'choose', insts: [tInst] });
    assert.equal(mb.state.cards[tInst].costMod, -1);
    assert.equal(mb.state.units.hero.turnCostMod?.[tInst], -1);
    assert.equal(mb.state.cards[tInst].discount, 1);
    assert.equal(cardView(mb.state, tInst).cost, 0);

    // 丢弃后 retrieve 取回不重掷，保留原 confusedCost。
    mb.play(dropCard.id);
    mb.step({ type: 'choose', insts: [tInst] });
    assert.ok(mb.state.piles.hero.discard.includes(tInst));
    const retrieved = mb.play(fetchCard.id);
    assert.ok(mb.state.piles.hero.hand.includes(tInst));
    assert.equal(mb.state.cards[tInst].confusedCost, 3);
    assert.equal(retrieved.events.some(event => event.type === 'cost-randomized'), false);

    // 塞入两种可打出状态牌到抽牌堆，然后真实抽牌：两种状态牌都触发随机费用。
    mb.play(slimeMaker.id);
    const drawnSlimes = mb.play(drawCard.id);
    const slimeRolls = drawnSlimes.events.filter(event => event.type === 'cost-randomized');
    assert.equal(slimeRolls.length, 2);
    const rolledIds = slimeRolls.map(event => mb.state.cards[event.inst].cardId).sort();
    assert.deepEqual(rolledIds, ['status-slime', 'status-slime-sts2']);
    for (const event of slimeRolls) {
        assert.ok(Number.isInteger(event.cost) && event.cost >= 0 && event.cost <= 3);
        assert.equal(cardView(mb.state, event.inst).cost, event.cost);
    }

    // 结束回合让带旧 costMod/discount/turnCostMod 的 target 进入弃牌堆并洗回真实重抽：旧减费清除并重新随机。
    const redrawn = mb.step({ type: 'end-turn' });
    const targetRoll = redrawn.events.find(event => event.type === 'cost-randomized' && event.inst === tInst);
    assert.ok(targetRoll, '重抽应重新触发 cost-randomized');
    assert.equal(mb.state.cards[tInst].confusedCost, targetRoll.cost);
    assert.equal(mb.state.cards[tInst].costMod, undefined);
    assert.equal(mb.state.cards[tInst].discount, undefined);
    assert.equal(mb.state.units.hero.turnCostMod?.[tInst], undefined);
    assert.equal(cardView(mb.state, tInst).cost, targetRoll.cost);
    mb.replay();
});

test('Confused handCost、免费出牌覆盖顺序与浮动／渐省刻印优先级符合契约', () => {
    const skillA = confusedCard('confused-skill-a', [{ op: 'block', amount: 2 }], { cost: 2 });
    const skillB = confusedCard('confused-skill-b', [{ op: 'block', amount: 2 }], { cost: 2 });
    const attackA = confusedCard('confused-atk-a', [{ op: 'damage', amount: 4, target: 'enemy' }], { type: 'attack', cost: 2 });
    const handCheap = confusedCard('confused-hand-cheap', [{ op: 'hand-cost', amount: -1 }], { cost: 0 });
    const freeTurn = confusedCard('confused-free-turn', [{ op: 'apply-status', status: 'freeplay', stacks: 2, target: 'self' }], { cost: 0 });
    const freeOne = confusedCard('confused-free-one', [{ op: 'free-next', amount: 1 }], { cost: 0 });
    const pyreCard = confusedCard('confused-pyre', [{ op: 'apply-status', status: 'pyre', stacks: 1, target: 'self' }], { type: 'power', cost: 0 });
    const drawOne = confusedCard('confused-draw-one', [{ op: 'draw', amount: 1 }], { cost: 0 });

    // 1) handCost 作用于 confusedCost 之上；free-next / pyre 在 handCost 之后覆盖为 0；免费期间抽牌仍触发随机。
    let fb = null;
    for (let seed = 1; seed <= 40; seed += 1) {
        const candidate = confusedBattle([skillA, skillB, attackA, handCheap, freeOne, pyreCard, drawOne], { draw: 6, seed });
        const a = candidate.find(skillA.id);
        const atk = candidate.find(attackA.id);
        if (a && atk && !candidate.find(skillB.id) && candidate.state.cards[a].confusedCost >= 2 && candidate.state.cards[atk].confusedCost >= 2) {
            fb = candidate;
            break;
        }
    }
    assert.ok(fb, '需要找到 skillA 与 attackA 混乱费用 >= 2 且 skillB 仍在抽牌堆的种子');
    const aInst = fb.find(skillA.id);
    const atkInst = fb.find(attackA.id);
    const aRoll = fb.state.cards[aInst].confusedCost;
    const atkRoll = fb.state.cards[atkInst].confusedCost;
    fb.play(handCheap.id);
    assert.equal(cardView(fb.state, aInst).cost, aRoll - 1);
    assert.equal(cardView(fb.state, atkInst).cost, atkRoll - 1);
    // free-next 覆盖为 0，消耗后恢复 handCost + confusedCost。
    fb.play(freeOne.id);
    assert.equal(cardView(fb.state, atkInst).cost, 0);
    assert.equal(cardView(fb.state, aInst).cost, 0);
    const beforeEnergy = fb.state.units.hero.energy;
    fb.play(attackA.id, 'foe');
    assert.equal(fb.state.units.hero.energy, beforeEnergy);
    assert.equal(cardView(fb.state, aInst).cost, aRoll - 1);
    // pyre 覆盖技能牌为 0，但在 pyre 下抽牌仍触发 cost-randomized 并写入 confusedCost。
    fb.play(pyreCard.id);
    assert.equal(cardView(fb.state, aInst).cost, 0);
    const drawnUnderPyre = fb.play(drawOne.id);
    const bRollEvent = drawnUnderPyre.events.find(event => event.type === 'cost-randomized');
    assert.ok(bRollEvent);
    assert.equal(fb.state.cards[bRollEvent.inst].cardId, skillB.id);
    assert.equal(fb.state.cards[bRollEvent.inst].confusedCost, bRollEvent.cost);
    assert.equal(cardView(fb.state, bRollEvent.inst).cost, 0);
    fb.replay();

    // 2) freeplay 状态同样覆盖 confusedCost 与 handCost。
    let fp = null;
    for (let seed = 1; seed <= 30; seed += 1) {
        const candidate = confusedBattle([attackA, freeTurn], { draw: 5, seed });
        const inst = candidate.find(attackA.id);
        if (inst && candidate.state.cards[inst].confusedCost >= 2) { fp = candidate; break; }
    }
    assert.ok(fp);
    fp.play(freeTurn.id);
    assert.equal(cardView(fp.state, fp.find(attackA.id)).cost, 0);
    fp.replay();

    // 3) 浮动（float）与渐省（thrift）刻印位于 cardFaceView 牌面层，cardView 中 confusedCost 覆盖牌面数字费用；改费升级清除 confusedCost 后恢复升级费用。
    const floatCard = confusedCard('confused-float', [{ op: 'block', amount: 2 }], {
        cost: 2, upgraded: { cost: 0, effects: [{ op: 'block', amount: 3 }] },
    });
    const thriftCard = confusedCard('confused-thrift', [{ op: 'block', amount: 2 }], {
        cost: 3, upgraded: { cost: 1, effects: [{ op: 'block', amount: 3 }] },
    });
    const keepAll = confusedCard('confused-keep-all', [{ op: 'grant-flag', flag: 'retain' }], { cost: 0 });
    const upgrader = confusedCard('confused-up', [{ op: 'upgrade-card', amount: 2, mode: 'random' }], { cost: 0 });
    const ib = confusedBattle([floatCard, thriftCard, keepAll, upgrader], { draw: 5, seed: 11,
        configure(input) {
            input.units[0].deck = [
                { cardId: floatCard.id, inscription: 'float' },
                { cardId: thriftCard.id, inscription: 'thrift' },
                keepAll.id,
                upgrader.id,
            ];
        },
    });
    const flInst = ib.find(floatCard.id);
    const thInst = ib.find(thriftCard.id);
    assert.ok(Number.isInteger(ib.state.cards[flInst].floatCost));
    assert.ok(Number.isInteger(ib.state.cards[flInst].confusedCost));
    assert.equal(cardView(ib.state, flInst).cost, ib.state.cards[flInst].confusedCost);
    // 赋予保留并跨回合后，渐省刻印累计（首回合末 + 本回合末共 2 层），但 confusedCost 仍在 cardView 层覆盖牌面费用。
    ib.play(keepAll.id);
    ib.step({ type: 'end-turn' });
    assert.equal(ib.state.cards[thInst].thrift, 2);
    assert.equal(cardView(ib.state, thInst).cost, ib.state.cards[thInst].confusedCost);
    // 改费升级清除 confusedCost 后，浮动仍由 floatCost、渐省由升级费扣减 thrift 决定。
    ib.play(upgrader.id);
    assert.equal(ib.state.cards[flInst].confusedCost, undefined);
    assert.equal(ib.state.cards[thInst].confusedCost, undefined);
    assert.equal(cardView(ib.state, flInst).cost, ib.state.cards[flInst].floatCost);
    assert.equal(cardView(ib.state, thInst).cost, Math.max(0, 1 - ib.state.cards[thInst].thrift));
    ib.replay();
});

test('Confused 升级入口（upgrade-pile、reality、battle-growth）按是否改费正确处理随机费用', () => {
    const costUp = confusedCard('confused-cost-up', [{ op: 'block', amount: 2 }], {
        cost: 2, upgraded: { cost: 0, effects: [{ op: 'block', amount: 2 }] },
    });
    const sameUp = confusedCard('confused-same-up', [{ op: 'block', amount: 2 }], {
        cost: 2, upgraded: { effects: [{ op: 'block', amount: 4 }] },
    });
    // 1) upgrade-pile (drawn)：先 draw-card 随机，再 draw 升级 -> 改费清 confusedCost，不改费保留。
    const upDrawn = confusedCard('confused-up-drawn', [{ op: 'upgrade-pile', from: 'drawn', amount: 2 }, { op: 'draw', amount: 2 }], { cost: 0 });
    let db = null;
    for (let seed = 1; seed <= 30; seed += 1) {
        const candidate = confusedBattle([upDrawn, costUp, sameUp], { draw: 1, seed });
        if (candidate.find(upDrawn.id) && !candidate.find(costUp.id) && !candidate.find(sameUp.id)) { db = candidate; break; }
    }
    assert.ok(db);
    const drawnRes = db.play(upDrawn.id);
    const cInst = db.find(costUp.id);
    const sInst = db.find(sameUp.id);
    const sRoll = drawnRes.events.find(event => event.type === 'cost-randomized' && event.inst === sInst);
    assert.ok(sRoll);
    assert.equal(db.state.cards[cInst].upgraded, true);
    assert.equal(db.state.cards[cInst].confusedCost, undefined);
    assert.equal(cardView(db.state, cInst).cost, 0);
    assert.equal(db.state.cards[sInst].upgraded, true);
    assert.equal(db.state.cards[sInst].confusedCost, sRoll.cost);
    assert.equal(cardView(db.state, sInst).cost, sRoll.cost);
    db.replay();

    // 2) upgrade-pile (draw)：抽牌堆中已带 confusedCost 的牌升级，改费清 confusedCost，不改费保留。
    const upDraw = confusedCard('confused-up-draw', [{ op: 'upgrade-pile', from: 'draw', amount: 2 }], { cost: 0 });
    const topDeck = confusedCard('confused-top', [{ op: 'topdeck', amount: 2, mode: 'choose' }], { cost: 0 });
    const pb = confusedBattle([upDraw, topDeck, costUp, sameUp], { draw: 4, seed: 7 });
    const pCostInst = pb.find(costUp.id);
    const pSameInst = pb.find(sameUp.id);
    const pSameRoll = pb.state.cards[pSameInst].confusedCost;
    pb.play(topDeck.id);
    pb.step({ type: 'choose', insts: [pCostInst, pSameInst] });
    pb.play(upDraw.id);
    assert.equal(pb.state.cards[pCostInst].upgraded, true);
    assert.equal(pb.state.cards[pCostInst].confusedCost, undefined);
    assert.equal(pb.state.cards[pSameInst].upgraded, true);
    assert.equal(pb.state.cards[pSameInst].confusedCost, pSameRoll);
    pb.replay();

    // 3) reality（card-signatures create 钩子）：复制带 confusedCost 的牌时自动升级，改费清 confusedCost，不改费保留。
    const reality = confusedCard('confused-reality', [{ op: 'apply-status', status: 'reality', stacks: 1, target: 'self' }], { type: 'power', cost: 0 });
    const copyCost = confusedCard('confused-copy-cost', [{ op: 'copy', from: 'self', amount: 1, to: 'hand' }], {
        cost: 2, upgraded: { cost: 0, effects: [{ op: 'copy', from: 'self', amount: 1, to: 'hand' }] },
    });
    const copySame = confusedCard('confused-copy-same', [{ op: 'copy', from: 'self', amount: 1, to: 'hand' }], {
        cost: 2, upgraded: { effects: [{ op: 'copy', from: 'self', amount: 1, to: 'hand' }, { op: 'block', amount: 1 }] },
    });
    const rb = confusedBattle([reality, copyCost, copySame], { draw: 5, seed: 13 });
    rb.play(reality.id);
    const sameSrcInst = rb.find(copySame.id);
    const sameSrcRoll = rb.state.cards[sameSrcInst].confusedCost;
    const costCreated = rb.play(copyCost.id).events.find(event => event.type === 'card-created' && event.cardId === copyCost.id);
    const sameCreated = rb.play(copySame.id).events.find(event => event.type === 'card-created' && event.cardId === copySame.id);
    assert.ok(costCreated && sameCreated);
    assert.equal(rb.state.cards[costCreated.inst].upgraded, true);
    assert.equal(rb.state.cards[costCreated.inst].confusedCost, undefined);
    assert.equal(cardView(rb.state, costCreated.inst).cost, 0);
    assert.equal(rb.state.cards[sameCreated.inst].upgraded, true);
    assert.equal(rb.state.cards[sameCreated.inst].confusedCost, sameSrcRoll);
    assert.equal(cardView(rb.state, sameCreated.inst).cost, sameSrcRoll);
    rb.replay();

    // 4) battle-growth（bounty upgrade 击杀升级）：改费清除 confusedCost，不改费保留。
    for (const changed of [false, true]) {
        const hunter = confusedCard('confused-bounty', [
            { op: 'damage', amount: 20, target: 'enemy' },
            { op: 'bounty', reward: 'upgrade', amount: 1 },
        ], {
            type: 'attack', cost: 2,
            upgraded: { ...(changed ? { cost: 0 } : {}), effects: [{ op: 'damage', amount: 25, target: 'enemy' }, { op: 'bounty', reward: 'upgrade', amount: 1 }] },
        });
        const bb = confusedBattle([hunter], { draw: 2, seed: 9, secondFoe: true,
            configure(input) {
                input.units[1].maxHp = 10;
                input.units[1].skills = [{ id: 'idle', name: '蓄力', intent: 'buff', effects: [{ op: 'block', amount: 1, target: 'self' }] }];
                input.units[2].skills = [{ id: 'idle', name: '蓄力', intent: 'buff', effects: [{ op: 'block', amount: 1, target: 'self' }] }];
            },
        });
        const inst = bb.find(hunter.id);
        const roll = bb.state.cards[inst].confusedCost;
        bb.play(hunter.id, 'foe');
        assert.equal(bb.state.cards[inst].upgraded, true);
        assert.equal(bb.state.cards[inst].confusedCost, changed ? undefined : roll);
        assert.equal(cardView(bb.state, inst).cost, changed ? 0 : roll);
        bb.replay();
    }
});

test('Confused cost-randomized 战报按回合归档，无出手、普通与折叠回合均不漏记也不错归', () => {
    const cards = [0, 1, 2].map(n => confusedCard(`confused-rep-${n}`, [{ op: 'block', amount: 2 }], { cost: 1 }));
    const battle = confusedBattle(cards, { draw: 3, seed: 17,
        configure(input) {
            input.units[1].skills = [{ id: 'tap', name: '轻击', intent: 'buff', effects: [{ op: 'block', amount: 1, target: 'self' }] }];
        },
    });
    // 第一回合（混乱刚生效后的首次真实抽牌）主角先打一张牌，然后连续多个空回合，覆盖无 action 与折叠回合。
    battle.play(cards[0].id);
    for (let i = 0; i < 9; i += 1) battle.step({ type: 'end-turn' });
    const turns = collectTurns(battle.events, battle.state.units, battle.state.catalog);
    const rolledTurns = turns.filter(turn => (turn.randomizedCosts || []).length > 0);
    assert.ok(rolledTurns.length >= 9);
    // 确认 cost-randomized 不误挂到上一张牌的 action.notes，且全部按真实 unitId 归档。
    for (const turn of turns) {
        for (const action of turn.actions) {
            for (const eff of action.targets.values()) {
                assert.equal(eff.notes.some(text => text.includes('混乱随机')), false);
            }
        }
        for (const item of turn.randomizedCosts || []) assert.equal(item.unitId, 'hero');
    }
    // 普通战报与简要战报：第 4–8 回合折叠后仍汇总混乱随机张数。
    const finished = { ...battle.state, outcome: 'victory' };
    for (const detail of ['normal', 'brief']) {
        const report = buildCombatReport({ combatId: `confused-${detail}`, state: finished, events: battle.events, detail });
        assert.equal(report.ok, true);
        assert.match(report.text, /主角因混乱随机了\d+张抽牌的费用/);
        assert.match(report.text, /第4–8回合：.*主角因混乱随机了\d+张抽牌的费用/);
    }
    // 只有 turn-start + cost-randomized（没有任何 action）的独立回合不能被过滤丢弃，且区分不同单位不串名。
    const units = { ...battle.state.units, ally2: { id: 'ally2', name: '同伴', side: 'ally', kind: 'deck', hp: 50, maxHp: 50, alive: true } };
    const loneEvents = [
        { type: 'turn-start', turn: 1, unitId: 'hero', side: 'ally' },
        { type: 'cost-randomized', unitId: 'hero', inst: 'c1', cost: 2 },
        { type: 'cost-randomized', unitId: 'hero', inst: 'c2', cost: 0 },
        { type: 'cost-randomized', unitId: 'ally2', inst: 'c3', cost: 3 },
    ];
    const loneReport = buildCombatReport({ combatId: 'confused-lone', state: { ...finished, units }, events: loneEvents });
    assert.equal(loneReport.ok, true);
    assert.match(loneReport.text, /主角因混乱随机了2张抽牌的费用/);
    assert.match(loneReport.text, /同伴因混乱随机了1张抽牌的费用/);
    battle.replay();
});

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

test('抽卡与弃卡动画：全10套皮肤牌堆锚点可定位，planCardMotions与WAAPI弧线关键帧符合边界', async (t) => {
    const { JSDOM } = await import('jsdom');
    assert.ok(Array.isArray(BATTLE_SFX_PARTIALS['battle-card-draw']));
    assert.ok(Array.isArray(BATTLE_SFX_PARTIALS['battle-card-discard']));
    assert.ok(COMBAT_CARD_MOTION_STYLE_TEXT.includes(CARD_INCOMING_ATTR));
    assert.ok(COMBAT_CARD_MOTION_STYLE_TEXT.includes(PILE_BUMP_ATTR));

    // 1) planCardMotions 纯规则边界：开局首抽、回合内主牌排除与弃牌堆取回、回合末保留/虚无/洗牌重抽。
    const mkState = (hand, discard = [], exhaust = []) => ({ controlledId: 'hero', piles: { hero: { draw: [], hand, discard, exhaust } } });
    const startPlan = planCardMotions(null, mkState(['c1', 'c2', 'c3']), null, [{ type: 'draw', unitId: 'hero', count: 3 }], { start: true });
    assert.deepEqual(startPlan.discarded, []);
    assert.deepEqual(startPlan.drawn, ['c1', 'c2', 'c3']);
    assert.equal(startPlan.drawSource.get('c1'), 'draw');

    const playPlan = planCardMotions(
        mkState(['c1', 'c2', 'c3']),
        mkState(['c2', 'c4', 'c5'], ['c1', 'c3']),
        { type: 'play', inst: 'c1' },
        [
            { type: 'discard', unitId: 'hero', inst: 'c3' },
            { type: 'draw', unitId: 'hero', count: 1 },
            { type: 'fetch', unitId: 'hero', inst: 'c5', from: 'discard', to: 'hand' },
        ],
    );
    assert.deepEqual(playPlan.discarded, ['c3']);
    assert.deepEqual(playPlan.drawn, ['c4', 'c5']);
    assert.equal(playPlan.drawSource.get('c4'), 'draw');
    assert.equal(playPlan.drawSource.get('c5'), 'discard');

    const endTurnReshuffle = planCardMotions(
        mkState(['keep', 'eth', 'a', 'b']),
        mkState(['keep', 'a', 'b', 'c']),
        { type: 'end-turn' },
        [
            { type: 'exhaust', unitId: 'hero', inst: 'eth' },
            { type: 'turn-end', unitId: 'hero' },
            { type: 'turn-start', unitId: 'hero', side: 'ally' },
            { type: 'reshuffle', unitId: 'hero', count: 3 },
            { type: 'draw', unitId: 'hero', count: 3 },
        ],
    );
    assert.equal(endTurnReshuffle.endTurn, true);
    assert.deepEqual(endTurnReshuffle.discarded, ['b', 'a']);
    assert.deepEqual(endTurnReshuffle.drawn, ['a', 'b', 'c']);

    // 2) 全 10 套皮肤（initial + 9 套画布皮肤）× 横竖屏：均可定位到有效的抽/弃牌堆锚点。
    const battle = createBattle(setup(), 7).state;
    const view = battleView(battle, []);
    for (const skin of ['initial', ...Object.keys(CANVAS_BATTLE)]) {
        for (const orient of ['port', 'land']) {
            const dom = new JSDOM(`<div id="igs-combat-panel"><div class="igs-combat-body">${renderCombatPanelHtml({ status: 'battle', skin, orient, battle: view })}</div><div class="igs-combat-fx"></div></div>`);
            try {
                const doc = dom.window.document;
                const root = doc.querySelector('#igs-combat-panel');
                const stage = doc.querySelector('.igs-combat-fx');
                for (const el of root.querySelectorAll('*')) {
                    el.getBoundingClientRect = () => ({ left: 10, top: 20, right: 90, bottom: 80, width: 80, height: 60 });
                }
                const drawEl = findPileEl(root, 'draw');
                const discEl = findPileEl(root, 'discard');
                assert.ok(drawEl, `${skin}/${orient} 缺少抽牌堆节点`);
                assert.ok(discEl, `${skin}/${orient} 缺少弃牌堆节点`);
                assert.ok(pileAnchorRect(root, stage, 'draw')?.width > 0, `${skin}/${orient}`);
                assert.ok(pileAnchorRect(root, stage, 'discard')?.width > 0, `${skin}/${orient}`);
            } finally { dom.window.close(); }
        }
    }

    // 3) 复用皮肤原位「抽牌 / 弃牌」文字节点绑定点击查看与动画锚点（不另建底部条），及精确旋转测量。
    const dockDom = new JSDOM('<div id="igs-combat-panel"><div class="igs-combat-body"><div class="piles pile-d"><span>抽牌 <b>5</b></span></div><div class="piles pile-r"><span>弃牌 <b>0</b></span></div></div><div class="igs-combat-fx"></div></div>');
    t.after(() => dockDom.window.close());
    const dockDoc = dockDom.window.document;
    const dockRoot = dockDoc.querySelector('#igs-combat-panel');
    const docks = syncPileDocks(dockDoc, dockRoot, { draw: 5, discard: 0 });
    assert.equal(dockRoot.querySelector('.igs-combat-pile-docks'), null, '不另建底部牌堆占位条');
    assert.ok(docks && docks.draw?.classList.contains('pile-d') && docks.discard?.classList.contains('pile-r'));
    assert.equal(docks.draw.getAttribute('data-combat-act'), 'pile-view');
    assert.equal(docks.draw.getAttribute('data-combat-id'), 'draw');
    assert.equal(docks.draw.getAttribute('aria-label'), '查看抽牌堆（5 张）');
    assert.equal(docks.discard.getAttribute('data-combat-act'), 'pile-view');
    assert.equal(docks.discard.getAttribute('data-combat-id'), 'discard');
    assert.equal(docks.discard.getAttribute('aria-label'), '查看弃牌堆（0 张）');
    const sameDocks = syncPileDocks(dockDoc, dockRoot, { draw: 1, discard: 2 });
    assert.equal(sameDocks.draw, docks.draw);
    assert.equal(sameDocks.discard, docks.discard);
    assert.equal(sameDocks.draw.getAttribute('aria-label'), '查看抽牌堆（1 张）');
    assert.equal(sameDocks.discard.getAttribute('aria-label'), '查看弃牌堆（2 张）');
    const rotCard = dockDoc.createElement('button');
    rotCard.style.setProperty('--rot', '-6.5deg');
    rotCard.getBoundingClientRect = () => ({ left: 200, top: 400, width: 110, height: 150 });
    Object.defineProperty(rotCard, 'offsetWidth', { value: 90 });
    Object.defineProperty(rotCard, 'offsetHeight', { value: 130 });
    assert.equal(cardNaturalRotate(rotCard), -6.5);
    const box = measureCardBox(rotCard, dockRoot);
    assert.equal(box.width, 90);
    assert.equal(box.height, 130);
    assert.equal(box.cx, 255);
    assert.equal(box.cy, 475);
    assert.equal(box.rot, -6.5);
    syncPileDocks(dockDoc, dockRoot, null);
    assert.equal(dockRoot.querySelector('[data-combat-pile]'), null);

    // 3b) 画布皮肤的 #igs-cx-canvas .card 规则镜像到 .igs-cx-ghost（排除 .igs-cx-rw），避免飞行中卡面回退旧概念样式。
    const { CANVAS_STYLE_TEXT } = await import('../src/visual/igs-ui/combat-skin-registry.js');
    assert.ok(CANVAS_STYLE_TEXT.includes(':is(#igs-cx-canvas,.igs-cx-ghost:not(.igs-cx-rw)):where([data-cx="veil"]) .card .val.no-num svg'));
    assert.ok(CANVAS_STYLE_TEXT.includes(':is(#igs-cx-canvas,.igs-cx-ghost:not(.igs-cx-rw)):where([data-cx="veil"]) .card .xtra'));
    assert.ok(CANVAS_STYLE_TEXT.includes(':is(#igs-cx-canvas,.igs-cx-ghost:not(.igs-cx-rw)):where([data-cx="dark-a"]) .hand .card .xtra'));
    assert.ok(!CANVAS_STYLE_TEXT.includes(':is(#igs-cx-canvas,.igs-cx-ghost:not(.igs-cx-rw)):where([data-cx="veil"]).land .hand{'), '画布 .hand 布局规则不得被镜像到影子容器');

    // 4) WAAPI 弧线抽牌与弃牌关键帧、onfinish 同步交接、牌堆脉冲与 reduced 降级。
    const dom = new JSDOM('<div id="igs-combat-panel"><div class="igs-combat-fx"></div><span class="pile-d"></span><span class="pile-r"></span></div>');
    t.after(() => dom.window.close());
    const doc = dom.window.document;
    const stage = doc.querySelector('.igs-combat-fx');
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 });
    const timers = [];
    const schedule = (fn, ms) => timers.push({ fn, ms });
    const animated = [];
    const mkGhost = () => {
        const g = doc.createElement('div');
        g.animate = (frames, opts) => {
            const anim = { frames, opts, onfinish: null, cancel() {} };
            animated.push(anim);
            return anim;
        };
        return g;
    };
    const landed = [];
    const drawRes = playDrawCards(stage, [
        { inst: 'c1', rect: { left: 260, top: 440, width: 90, height: 130, cx: 305, cy: 505, rot: -5 }, ghost: mkGhost(), cardEl: doc.createElement('button') },
        { inst: 'c2', rect: { left: 360, top: 440, width: 90, height: 130, cx: 405, cy: 505, rot: 4 }, ghost: mkGhost(), cardEl: doc.createElement('button') },
    ], { left: 24, top: 520, width: 40, height: 40 }, { schedule, onLand: (inst) => landed.push(inst) });
    assert.equal(drawRes.nodes.length, 2);
    assert.ok(drawRes.totalMs >= COMBAT_CARD_MOTION.drawMs);
    assert.equal(stage.querySelectorAll('.is-draw-ghost').length, 2);
    // 第一张立即起步，末帧严格对齐自然旋转角 -5deg，第二张按 stagger 错峰。
    assert.equal(animated.length, 1);
    assert.equal(animated[0].frames.length, 4);
    assert.ok(animated[0].frames[0].transform.includes('scale(.18)'));
    assert.ok(animated[0].frames[2].transform.includes('scale(1.04)'));
    assert.ok(animated[0].frames[3].transform.includes('rotate(-5.00deg)'));
    // onfinish 立即无痕交接（先 onLand 后 remove ghost），重复兜底不双触发。
    animated[0].onfinish?.();
    assert.deepEqual(landed, ['c1']);
    assert.equal(stage.querySelectorAll('.is-draw-ghost').length, 1);
    while (timers.length) timers.shift().fn();
    assert.equal(animated.length, 2);
    assert.deepEqual(landed, ['c1', 'c2']);
    assert.equal(stage.querySelectorAll('.is-draw-ghost').length, 0);

    let arrived = 0;
    const discRes = playDiscardCards(stage, [
        { inst: 'c2', rect: { left: 360, top: 440, width: 90, height: 130 }, ghost: mkGhost() },
    ], { left: 730, top: 520, width: 40, height: 40 }, { endTurn: true, schedule, onArrive: () => { arrived += 1; } });
    assert.equal(discRes.nodes.length, 1);
    assert.equal(animated.at(-1).frames.length, 4);
    assert.ok(animated.at(-1).frames[3].transform.includes('scale(.16)'));
    while (timers.length) timers.shift().fn();
    assert.equal(arrived, 1);
    assert.equal(stage.querySelectorAll('.is-discard-ghost').length, 0);

    // 牌堆弹跳与 reduced 模式。
    const pileEl = doc.querySelector('.pile-d');
    bumpPile(pileEl, 'draw', { schedule });
    assert.equal(pileEl.getAttribute(PILE_BUMP_ATTR), 'draw');
    while (timers.length) timers.shift().fn();
    assert.equal(pileEl.getAttribute(PILE_BUMP_ATTR), null);

    const reducedLand = [];
    const reducedDraw = playDrawCards(stage, [
        { inst: 'c9', rect: { left: 260, top: 440, width: 90, height: 130 }, ghost: mkGhost(), cardEl: doc.createElement('button') },
    ], { left: 24, top: 520, width: 40, height: 40 }, { reduced: true, schedule, onLand: (inst) => reducedLand.push(inst) });
    assert.equal(reducedDraw.nodes.length, 0);
    assert.deepEqual(reducedLand, ['c9']);
});

test('抽卡与弃卡动画：面板集成回合末弃牌后接敌方行动再发新牌、音效与关闭清理及reduced退化', async (t) => {
    const { JSDOM } = await import('jsdom');
    const drawSkill = { id: 'quick-draw', name: '疾抽', type: 'skill', rarity: 'common', cost: 0, effects: [{ op: 'draw', amount: 1 }] };
    const dropSkill = { id: 'quick-drop', name: '轻弃', type: 'skill', rarity: 'common', cost: 0, effects: [{ op: 'discard', amount: 1, mode: 'random' }, { op: 'draw', amount: 1 }] };
    const runScenario = ({ reduced }) => {
        const dom = new JSDOM('<div id="igs-overlay"></div>', { url: 'http://127.0.0.1/', pretendToBeVisual: true });
        t.after(() => dom.window.close());
        const doc = dom.window.document;
        const win = dom.window;
        const origRect = win.Element.prototype.getBoundingClientRect;
        win.Element.prototype.getBoundingClientRect = function rect() {
            const cls = String(this.className || '');
            if (cls.includes('igs-combat-fx')) return { left: 0, top: 0, right: 900, bottom: 600, width: 900, height: 600 };
            if (cls.includes('igs-combat-card')) return { left: 300, top: 430, right: 390, bottom: 560, width: 90, height: 130 };
            return { left: 40, top: 520, right: 120, bottom: 560, width: 80, height: 40 };
        };
        let animCalls = 0;
        win.Element.prototype.animate = () => { animCalls += 1; return { cancel() {}, effect: { getTiming: () => ({ iterations: 1 }) } }; };
        t.after(() => { win.Element.prototype.getBoundingClientRect = origRect; });

        const input = setup(7, { cards: [drawSkill, dropSkill, strike] });
        input.units[0].draw = 3;
        let built = createBattle(input, 11);
        assert.equal(built.ok, true);
        let battleState = built.state;
        const mockSession = {
            state: () => ({ status: 'battle', combatId: 'card-motion-test', battle: battleState, legal: [{ type: 'end-turn' }, ...battleState.piles.hero.hand.map((inst) => ({ type: 'play', inst, targetId: 'foe' }))] }),
            act: (action) => {
                const res = applyAction(battleState, action);
                if (res.ok) battleState = res.state;
                return res;
            },
            subscribe: () => () => {},
        };
        const sfxLog = [];
        const timers = [];
        let tid = 1;
        const activeTimers = new Map();
        const schedule = (fn, ms) => {
            const id = tid++;
            const item = { id, fn, ms };
            timers.push(item);
            activeTimers.set(id, item);
            return id;
        };
        const clear = (id) => { activeTimers.delete(id); };
        const flush = () => {
            let guard = 0;
            while (timers.length && guard < 200) {
                guard += 1;
                const item = timers.shift();
                if (!activeTimers.delete(item.id)) continue;
                item.fn();
            }
        };
        const panel = createCombatPanelController(doc, {
            getSession: () => mockSession,
            skin: () => 'initial',
            reducedMotion: () => reduced,
            playSfx: (kind) => sfxLog.push(kind),
            schedule,
            clear,
        });
        t.after(() => panel.dispose());
        assert.equal(panel.open(doc.querySelector('#igs-overlay'), { messageId: 0 }).ok, true);

        // 触发结束回合：立即播旧手牌弃牌，自动行动期间新抽手牌隐藏等待，自动行动完后再逐张发牌。
        doc.querySelector('[data-combat-act="end-turn"]').click();
        const fx = doc.querySelector('.igs-combat-fx');
        const discardGhostsDuringAuto = fx.querySelectorAll('.is-discard-ghost').length;
        const incomingDuringAuto = doc.querySelectorAll(`[${CARD_INCOMING_ATTR}]`).length;
        flush();
        const ghostsAfterFlush = fx.querySelectorAll('.igs-card-motion-ghost').length;
        const incomingAfterFlush = doc.querySelectorAll(`[${CARD_INCOMING_ATTR}]`).length;
        panel.close();
        return { animCalls, sfxLog, discardGhostsDuringAuto, incomingDuringAuto, ghostsAfterFlush, incomingAfterFlush, activeAfterClose: activeTimers.size };
    };

    const full = runScenario({ reduced: false });
    assert.ok(full.discardGhostsDuringAuto >= 1, '结束回合应立即生成弃牌飞行影子卡');
    assert.ok(full.incomingDuringAuto >= 1, '敌方行动期间新回合手牌应等待自动行动结束后再发牌');
    assert.ok(full.animCalls >= 4, '应执行弃牌与抽牌 WAAPI 动画');
    assert.ok(full.sfxLog.includes('battle-card-discard'), '弃牌应播放弃牌音效');
    assert.ok(full.sfxLog.includes('battle-card-draw'), '抽牌应播放抽牌音效');
    assert.equal(full.ghostsAfterFlush, 0, '动画结束后应清理全部影子卡');
    assert.equal(full.incomingAfterFlush, 0, '发牌结束后应揭露全部手牌');
    assert.equal(full.activeAfterClose, 0, '关闭面板后不应残留计时器');

    const still = runScenario({ reduced: true });
    assert.equal(still.discardGhostsDuringAuto, 0);
    assert.equal(still.incomingDuringAuto, 0);
    assert.equal(still.sfxLog.includes('battle-card-discard'), false);
    assert.equal(still.sfxLog.includes('battle-card-draw'), false);
});

test('抽卡与弃卡动画：点击抽牌/弃牌查看牌堆浮层，v7从弃牌堆亲选进手牌与放抽牌堆顶并重放一致', async (t) => {
    const { JSDOM } = await import('jsdom');
    const fetchHand = { id: 'fetch-hand', name: '回溯取牌', type: 'skill', rarity: 'common', cost: 0, effects: [{ op: 'retrieve', amount: 1, from: 'discard' }] };
    const fetchTop = { id: 'fetch-top', name: '头槌回顶', type: 'attack', rarity: 'common', cost: 0, effects: [{ op: 'damage', amount: 6, target: 'enemy' }, { op: 'retrieve', amount: 1, from: 'discard', to: 'top' }] };
    const cardA = { id: 'opt-a', name: '斩击甲', type: 'attack', rarity: 'common', cost: 0, effects: [{ op: 'damage', amount: 5, target: 'enemy' }] };
    const cardB = { id: 'opt-b', name: '护盾乙', type: 'skill', rarity: 'common', cost: 0, effects: [{ op: 'block', amount: 7, target: 'self' }] };

    // 1) v7 引擎：弃牌堆有 2 张候选时 retrieve(hand) 与 retrieve(top) 均挂起 pending，按玩家所选进入手牌或抽牌堆顶且重放一致；v6 保持自动选。
    for (const [version, mode] of [[7, 'hand'], [7, 'top'], [6, 'hand']]) {
        const picker = mode === 'top' ? fetchTop : fetchHand;
        const input = setup(version, { cards: [picker, cardA, cardB, strike] });
        input.units[0].draw = 4;
        input.units[0].deck = [picker.id, cardA.id, cardB.id, strike.id];
        const built = createBattle(input, 7);
        assert.equal(built.ok, true);
        let state = built.state;
        const actions = [];
        const find = (id) => state.piles.hero.hand.find((inst) => state.cards[inst].cardId === id);
        const aInst = find(cardA.id);
        const bInst = find(cardB.id);
        const pInst = find(picker.id);
        assert.ok(aInst && bInst && pInst);
        for (const a of [{ type: 'play', inst: aInst, targetId: 'foe' }, { type: 'play', inst: bInst }]) {
            state = act(state, a).state;
            actions.push(a);
        }
        assert.equal(state.piles.hero.discard.length, 2);
        const playPick = mode === 'top' ? { type: 'play', inst: pInst, targetId: 'foe' } : { type: 'play', inst: pInst };
        state = act(state, playPick).state;
        actions.push(playPick);
        if (version === 7) {
            assert.equal(state.pending?.kind, 'retrieve');
            assert.equal(state.pending?.from, 'discard');
            assert.equal(state.pending?.to, mode);
            assert.equal(state.pending?.options.length, 2);
            // 显式选择 cardB，验证进手牌或放抽牌堆顶。
            const chooseAct = { type: 'choose', insts: [bInst] };
            state = act(state, chooseAct).state;
            actions.push(chooseAct);
            assert.equal(state.pending, undefined);
            if (mode === 'hand') assert.ok(state.piles.hero.hand.includes(bInst));
            else assert.equal(state.piles.hero.draw.at(-1), bInst);
        } else {
            assert.equal(state.pending, undefined);
        }
        const replayed = replayBattle(input, 7, actions);
        assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
        assert.deepEqual(replayed.state, state);
    }

    // 2) 面板集成：点击「抽牌」「弃牌」查看当前牌堆浮层，以及通过选牌浮层完成从弃牌堆选卡进手牌。
    const dom = new JSDOM('<div id="igs-overlay"></div>', { url: 'http://127.0.0.1/', pretendToBeVisual: true });
    t.after(() => dom.window.close());
    const doc = dom.window.document;
    const input = setup(7, { cards: [fetchHand, cardA, cardB, strike] });
    input.units[0].draw = 5;
    input.units[0].deck = [fetchHand.id, cardA.id, cardB.id, strike.id, strike.id, strike.id];
    let battleState = null;
    for (let s = 1; s <= 20; s += 1) {
        const candidate = createBattle(input, s).state;
        const h = candidate.piles.hero.hand.map((inst) => candidate.cards[inst].cardId);
        if (h.includes(fetchHand.id) && h.includes(cardA.id) && h.includes(cardB.id)) { battleState = candidate; break; }
    }
    assert.ok(battleState);
    const find = (id) => battleState.piles.hero.hand.find((inst) => battleState.cards[inst].cardId === id);
    battleState = act(battleState, { type: 'play', inst: find(cardA.id), targetId: 'foe' }).state;
    battleState = act(battleState, { type: 'play', inst: find(cardB.id) }).state;
    const mockSession = {
        state: () => ({
            status: 'battle', combatId: 'pile-view-test', battle: battleState,
            legal: battleState.pending
                ? battleState.pending.options.map((inst) => ({ type: 'choose', insts: [inst] }))
                : [{ type: 'end-turn' }, ...battleState.piles.hero.hand.map((inst) => ({ type: 'play', inst }))],
        }),
        act: (action) => {
            const res = applyAction(battleState, action);
            if (res.ok) battleState = res.state;
            return res;
        },
        subscribe: () => () => {},
    };
    const panel = createCombatPanelController(doc, {
        getSession: () => mockSession,
        skin: () => 'veil',
        reducedMotion: () => true,
    });
    t.after(() => panel.dispose());
    assert.equal(panel.open(doc.querySelector('#igs-overlay'), { messageId: 0 }).ok, true);

    // 点击右下「弃牌」打开弃牌堆查看浮层，确认列出两张弃牌。
    doc.querySelector('[data-combat-pile="discard"]').click();
    const discardSheet = doc.querySelector('.igs-pile-sheet');
    assert.ok(discardSheet);
    assert.ok(discardSheet.textContent.includes('斩击甲') && discardSheet.textContent.includes('护盾乙'));
    doc.querySelector('[data-combat-act="pile-close"]').click();
    assert.equal(doc.querySelector('.igs-pile-sheet'), null);

    // 点击左下「抽牌」打开抽牌堆查看浮层，确认可查看并关闭。
    doc.querySelector('[data-combat-pile="draw"]').click();
    assert.ok(doc.querySelector('.igs-pile-sheet')?.textContent.includes('抽牌堆'));
    doc.querySelector('[data-combat-act="pile-close"]').click();

    // 打出「回溯取牌」挂起弃牌堆选牌弹窗，点选「护盾乙」并确认，验证成功加入手牌。
    const fetchInst = find(fetchHand.id);
    const cardBtn = [...doc.querySelectorAll('[data-combat-act="card"]')].find((el) => el.getAttribute('data-combat-id') === fetchInst);
    assert.ok(cardBtn);
    cardBtn.click();
    const heroBtn = doc.querySelector('[data-combat-act="target"]');
    assert.ok(heroBtn);
    heroBtn.click();
    assert.equal(battleState.pending?.kind, 'retrieve');
    const pickBtn = [...doc.querySelectorAll('[data-combat-act="choose-pick"]')].find((el) => el.textContent.includes('护盾乙'));
    assert.ok(pickBtn, '应弹出弃牌堆选牌浮层并包含护盾乙');
    pickBtn.click();
    doc.querySelector('[data-combat-act="choose-confirm"]').click();
    assert.equal(battleState.pending, undefined);
    assert.ok(battleState.piles.hero.hand.some((inst) => battleState.cards[inst].cardId === cardB.id));
});

test('打击感与状态特效升级：多形态命中爆点、卡肉分档、Buff/Debuff/免疫/净化光效、血条残影与面板集成', async (t) => {
    const { JSDOM } = await import('jsdom');
    // 1) combatHitMarks 完整解析增益、减益、负层数降属性、中毒掉血、人工制品免疫与净化事件。
    const events = [
        { type: 'damage', target: 'foe', amount: 14, hpLoss: 14, blocked: 0, strike: 1 },
        { type: 'damage', target: 'foe', amount: 5, hpLoss: 5, blocked: 0, kind: 'poison', loss: true },
        { type: 'status', target: 'hero', status: 'strength', stacks: 3 },
        { type: 'status', target: 'foe', status: 'vulnerable', stacks: 2 },
        { type: 'status', target: 'foe', status: 'confused', stacks: 1 },
        { type: 'status', target: 'foe', status: 'strength', stacks: -2 },
        { type: 'artifact', target: 'hero', status: 'confused' },
        { type: 'cleanse', target: 'hero', statuses: ['weak'] },
    ];
    const grouped = new Map(combatHitMarks(events).map((g) => [g.unitId, g.marks]));
    const foeMarks = grouped.get('foe');
    const heroMarks = grouped.get('hero');
    assert.ok(foeMarks.some((m) => m.kind === 'damage' && m.amount === 14 && m.strike === 1));
    assert.ok(foeMarks.some((m) => m.kind === 'damage' && m.amount === 5 && m.damageKind === 'poison' && m.loss === true));
    assert.ok(foeMarks.some((m) => m.kind === 'debuff' && m.status === 'vulnerable' && m.stacks === 2));
    assert.ok(foeMarks.some((m) => m.kind === 'debuff' && m.status === 'confused' && m.stacks === 1));
    assert.ok(foeMarks.some((m) => m.kind === 'debuff' && m.status === 'strength' && m.stacks === -2));
    assert.ok(heroMarks.some((m) => m.kind === 'buff' && m.status === 'strength' && m.stacks === 3));
    assert.ok(heroMarks.some((m) => m.kind === 'artifact' && m.status === 'confused'));
    assert.ok(heroMarks.some((m) => m.kind === 'cleanse' && m.count === 1));

    // 2) 卡肉分档：普通轻击也有轻顿帧，重击/巨创/击倒逐级增强，格挡有独立短促盾震。
    assert.equal(impactTierFor([{ kind: 'damage', amount: 6 }], { maxHp: 80 }).level, 1);
    assert.ok(impactTierFor([{ kind: 'damage', amount: 6 }], { maxHp: 80 }).hold > 0);
    assert.equal(impactTierFor([{ kind: 'damage', amount: 15 }], { maxHp: 80 }).level, 2);
    assert.equal(impactTierFor([{ kind: 'damage', amount: 30 }], { maxHp: 80 }).level, 3);
    assert.equal(impactTierFor([{ kind: 'damage', amount: 10 }, { kind: 'ko' }], { maxHp: 80 }).level, 4);
    assert.equal(impactTierFor([{ kind: 'guard', amount: 8 }]).level, 1);
    assert.equal(impactTierFor([{ kind: 'buff', status: 'strength', stacks: 2 }]).level, 0);

    // 3) 按皮肤主题模型驱动的零 SVG 光栅特效、Buff/Debuff 专属光效、暗角闪震、飘字与受击反应。
    const dom = new JSDOM('<div id="igs-combat-panel"><div class="cx-unit foe"></div></div>');
    t.after(() => dom.window.close());
    const doc = dom.window.document;
    const root = doc.querySelector('#igs-combat-panel');
    const unit = doc.querySelector('.foe');
    const timers = [];
    const schedule = (fn, ms) => { timers.push({ fn, ms }); };

    // 校验 10 套皮肤主题模型齐全，且 38 张光栅 WebP 素材真实存在于仓库且为有效 RIFF/WEBP（含 7 套独立整块结晶格挡盾 shield.webp）。
    const allSkins = ['veil', 'initial', 'ink', 'comic', 'tech', 'mystic', 'soft-a', 'soft-c', 'dark-a', 'dark-b'];
    const checkedFiles = new Set();
    for (const skin of allSkins) {
        const theme = resolveVfxTheme(skin);
        assert.equal(theme.id, skin);
        for (const slot of ['slash', 'burst', 'shield', 'shatter', 'aura', 'poison', 'confused', 'lightning']) {
            const url = vfxTextureUrl(skin, slot);
            assert.ok(url.endsWith('.webp'), `${skin}/${slot} 应为 WebP 资源`);
            const filePath = fileURLToPath(url);
            if (!checkedFiles.has(filePath)) {
                checkedFiles.add(filePath);
                const head = fs.readFileSync(filePath).subarray(0, 12);
                assert.equal(head.subarray(0, 4).toString('ascii'), 'RIFF', filePath);
                assert.equal(head.subarray(8, 12).toString('ascii'), 'WEBP', filePath);
            }
        }
    }
    assert.equal(checkedFiles.size, 38, '7 套主题包×5（含整块结晶 shield 与碎盾 shatter 分离）+ 3 张公共元素纹理共 38 张 WebP');
    assert.ok(impactTierFor([{ kind: 'damage', amount: 16 }], { maxHp: 80, skin: 'comic' }).hold > impactTierFor([{ kind: 'damage', amount: 16 }], { maxHp: 80, skin: 'soft-a' }).hold, '不同皮肤应按主题模型调节卡肉顿帧倍率');

    const sampleSkins = ['veil', 'ink', 'comic', 'tech', 'mystic', 'soft-a', 'dark-a'];
    for (const [idx, kind] of ['slash', 'blunt', 'gun', 'blast', 'arcane', 'curse', 'guard', 'poison', 'ko'].entries()) {
        const skin = sampleSkins[idx % sampleSkins.length];
        const nodes = showImpactBurst(doc, unit, { skin, kind, element: kind === 'slash' ? 'thunder' : '', level: 2, hitIndex: 1 }, { schedule });
        assert.equal(nodes.length, 1, `应挂载 ${kind} 爆点`);
        assert.ok(nodes[0].classList.contains(`is-${kind}`));
        assert.equal(nodes[0].getAttribute('data-vfx-theme'), skin);
        assert.equal(nodes[0].querySelector('svg'), null, `${kind} 命中特效不得含任何 SVG`);
        const imgs = [...nodes[0].querySelectorAll('img.vfx-tex')];
        assert.ok(imgs.length >= 1 && imgs.every((img) => img.src.endsWith('.webp')), `${kind} 应使用光栅 WebP 纹理`);
    }
    assert.notEqual(vfxTextureUrl('ink', 'slash'), vfxTextureUrl('tech', 'slash'), '水墨与科技皮肤应加载独立主题美术纹理');
    assert.equal(showImpactBurst(doc, unit, { skin: 'veil', kind: 'slash', level: 2 }, { reduced: true, schedule }).length, 0);

    const statusNodes = showStatusFx(doc, unit, [
        { kind: 'buff', status: 'strength', stacks: 2, label: '攻击力' },
        { kind: 'buff', status: 'dexterity', stacks: 2, label: '防御力' }, // 同类别去重
        { kind: 'block', amount: 8 },
        { kind: 'debuff', status: 'confused', stacks: 1, label: '混乱' },
        { kind: 'debuff', status: 'poison', stacks: 4, label: '中毒' },
        { kind: 'debuff', status: 'vulnerable', stacks: 2, label: '易伤' },
        { kind: 'artifact', status: 'weak', label: '虚弱' },
        { kind: 'cleanse', count: 1 },
    ], { skin: 'mystic', schedule });
    assert.equal(statusNodes.length, 7, 'Buff去重+整块结晶格挡+三类特色Debuff+免疫+净化共7个光效');
    assert.ok(statusNodes.every((n) => n.querySelector('svg') === null && n.querySelector('img.st-tex')?.src.endsWith('.webp')), '所有状态特效均为零 SVG 光栅纹理');
    assert.ok(statusNodes.some((n) => n.classList.contains('is-buff') && n.getAttribute('data-vfx-theme') === 'mystic'));
    assert.ok(statusNodes.some((n) => n.classList.contains('is-block') && n.querySelector('img.st-tex')?.src.includes('/mystic/shield.webp')), '上格挡应使用整块规整结晶 shield.webp 而非碎盾 shatter.webp');
    assert.ok(statusNodes.some((n) => n.classList.contains('is-debuff-confused') && n.querySelector('img.st-tex')?.src.includes('/common/confused.webp')));
    assert.ok(statusNodes.some((n) => n.classList.contains('is-debuff-poison') && n.querySelector('img.st-tex')?.src.includes('/common/poison.webp')));
    assert.ok(statusNodes.some((n) => n.classList.contains('is-debuff-vulnerable') && n.querySelector('img.st-tex')?.src.includes('/mystic/shatter.webp')));

    assert.equal(pulseVignette(root, 'massive', { schedule }), true);
    assert.equal(root.getAttribute(COMBAT_IMPACT_VIGNETTE_ATTR), 'massive');
    assert.equal(reactUnit(unit, [{ kind: 'buff', status: 'strength', stacks: 2 }], { schedule }), 'buff');
    assert.equal(reactUnit(unit, [{ kind: 'debuff', status: 'confused', stacks: 1 }], { schedule }), 'debuff');
    assert.equal(reactUnit(unit, [{ kind: 'damage', amount: 4, damageKind: 'poison' }], { schedule }), 'poison');

    const floats = showHitFloats(doc, unit, [
        { kind: 'damage', amount: 5, damageKind: 'poison' },
        { kind: 'buff', status: 'strength', stacks: 3, label: '攻击力' },
        { kind: 'debuff', status: 'confused', stacks: 1, label: '混乱' },
        { kind: 'artifact', status: 'weak', label: '虚弱' },
        { kind: 'cleanse', count: 1 },
    ], { schedule, hitIndex: 1 });
    assert.equal(floats.length, 5);
    assert.ok(floats[0].classList.contains('is-poison'));
    assert.equal(floats[1].textContent, '▲ 攻击力 +3');
    assert.ok(floats[2].classList.contains('is-status-confused') && floats[2].textContent.includes('混乱'));
    assert.equal(floats[3].textContent, '免疫');
    assert.equal(floats[4].textContent, '净化');

    for (const item of timers) item.fn();
    assert.equal(unit.querySelector('.igs-impact-burst'), null);
    assert.equal(unit.querySelector('.igs-status-fx'), null);
    assert.equal(root.hasAttribute(COMBAT_IMPACT_VIGNETTE_ATTR), false);

    // 4) 样式与配套合成音效检查：包含全皮肤卡肉顿帧、血条延迟残影、旧版尖刺 SVG 压制及 5 项状态/破盾音效。
    assert.ok(COMBAT_IMPACT_FX_STYLE_TEXT.includes('[data-igs-combat-hold]'));
    assert.ok(COMBAT_IMPACT_FX_STYLE_TEXT.includes('.cx-hp::before'));
    assert.ok(COMBAT_IMPACT_FX_STYLE_TEXT.includes('.igs-shield-break'));
    assert.ok(COMBAT_IMPACT_FX_STYLE_TEXT.includes('.hx-fxlight{display:none !important;}'));
    for (const sfxKey of ['battle-buff', 'battle-debuff', 'battle-poison', 'battle-artifact', 'battle-shield-break']) {
        assert.ok(Array.isArray(BATTLE_SFX_PARTIALS[sfxKey]) && BATTLE_SFX_PARTIALS[sfxKey].length >= 2, sfxKey);
    }

    // 5) 破盾（格挡被打碎）：穿透破盾、刚好打空破盾与未打碎部分格挡严格区分，破盾触发主题光栅碎盾纹理（零 SVG）、破盾飘字与至少 2 档卡肉。
    const overflowMarks = combatHitMarks([{ type: 'damage', target: 'foe', amount: 15, blocked: 10, hpLoss: 5, strike: 1 }])[0].marks;
    assert.ok(overflowMarks.some((m) => m.kind === 'shield-break' && m.amount === 10 && m.strike === 1));
    assert.ok(overflowMarks.some((m) => m.kind === 'damage' && m.amount === 5 && m.strike === 1));
    const exactBreakMarks = combatHitMarks(
        [{ type: 'damage', target: 'foe', amount: 10, blocked: 10, hpLoss: 0, strike: 1 }],
        { units: { foe: { block: 10 } } },
    )[0].marks;
    assert.ok(exactBreakMarks.some((m) => m.kind === 'shield-break' && m.amount === 10));
    assert.ok(!exactBreakMarks.some((m) => m.kind === 'guard'), '刚好打空格挡时走破盾而非普通格挡');
    const partialBlockMarks = combatHitMarks(
        [{ type: 'damage', target: 'foe', amount: 6, blocked: 6, hpLoss: 0, strike: 1 }],
        { units: { foe: { block: 12 } } },
    )[0].marks;
    assert.ok(!partialBlockMarks.some((m) => m.kind === 'shield-break'), '格挡未被打空时不得误触发破盾');
    assert.ok(partialBlockMarks.some((m) => m.kind === 'guard' && m.amount === 6));
    assert.equal(impactTierFor([{ kind: 'shield-break', amount: 10 }], { skin: 'veil' }).level, 2);
    const sbTimers = [];
    const sbNodes = showShieldBreak(doc, unit, { skin: 'ink', schedule: (fn) => sbTimers.push(fn) });
    assert.equal(sbNodes.length, 1);
    assert.equal(sbNodes[0].querySelector('svg'), null, '破盾特效不得含 SVG');
    assert.equal(sbNodes[0].querySelectorAll('img.sb-tex').length, 2, '高画质应挂主碎盾纹理与景深回响纹理');
    assert.ok(sbNodes[0].querySelector('img.sb-tex')?.src.includes('/ink/shatter.webp'));
    assert.equal(sbNodes[0].querySelectorAll('.sb-glint').length, 8);
    assert.equal(showShieldBreak(doc, unit, { skin: 'ink', reduced: true }).length, 0);
    const sbFloats = showHitFloats(doc, unit, [{ kind: 'shield-break', amount: 10 }], { schedule: (fn) => sbTimers.push(fn) });
    assert.equal(sbFloats[0].textContent, '破盾');
    assert.ok(sbFloats[0].classList.contains('is-shield-break'));
    for (const fn of sbTimers) fn();
    assert.equal(unit.querySelector('.igs-shield-break'), null);
});

test('方案C敌人平衡：模板首领不再误乘generatedScale、同级伤害随等级成长、多人crowd合理且托管优先逃离沙坑', () => {
    // 1. 模板首领（带 template 且 generated: true）不应用 generatedScale.boss=0.9；纯生成首领仍保留 0.9。
    const baseBoss = templateEnemy('巨像首领', 'boss');
    const templateBoss = { ...baseBoss, generated: true, template: { enemyId: 'en-sts1-act1-24', model: 'original' } };
    const pureGenBoss = { ...baseBoss, generated: true, template: undefined };
    const startBoss = { tier: 'boss', enemies: [{ name: '巨像首领', count: 1 }] };
    const fromTemplate = enemyUnits(startBoss, new Map([['巨像首领', templateBoss]]), 1, 'normal').units[0];
    const fromGen = enemyUnits(startBoss, new Map([['巨像首领', pureGenBoss]]), 1, 'normal').units[0];
    assert.ok(fromTemplate.maxHp > fromGen.maxHp, '模板首领生命应高于纯生成首领（不被 generatedScale.boss=0.9 误砍）');
    assert.ok(Math.abs(fromGen.maxHp - Math.round(fromTemplate.maxHp * 0.9)) <= 1);
    assert.ok(fromTemplate.damageScale > fromGen.damageScale);

    // 2. 同级伤害随敌人等级按 tierDamageScalePerLevel=0.025 成长。
    const lv1 = scaleEnemyStats(baseBoss, 1, 'normal');
    const lv10 = scaleEnemyStats(baseBoss, 10, 'normal');
    assert.equal(lv1.damageScale, COMBAT_RULES.tiers.boss.damageScale);
    assert.equal(lv10.damageScale, Math.round(COMBAT_RULES.tiers.boss.damageScale * (1 + 0.025 * 9) * 100) / 100);

    // 3. 多人 crowd 阶梯（0胜起单敌 1.00 / 双敌 0.72 / 三敌 0.58 / 四敌 0.50，20胜满额 1.00）。
    assert.equal(crowdScaleFor(1, 0), 1);
    assert.equal(crowdScaleFor(2, 0), 0.72);
    assert.equal(crowdScaleFor(3, 0), 0.58);
    assert.equal(crowdScaleFor(4, 0), 0.5);
    assert.equal(crowdScaleFor(4, 20), 1);

    // 4. 托管 AI 在敌方沙坑 countdown <= 2 时优先打出 status-escape。
    const escapeCard = { id: 'status-escape', name: '狂乱逃离', type: 'status', cost: 1, rarity: 'common', effects: [] };
    const sandpitInput = setup(7, { cards: [strike, escapeCard] });
    sandpitInput.units[0].deck = ['strike', 'strike', 'strike', 'strike', 'status-escape', 'strike', 'strike', 'strike', 'strike', 'strike'];
    sandpitInput.units[0].draw = 5;
    const built = createBattle(sandpitInput, 7);
    assert.equal(built.ok, true, JSON.stringify(built.error));
    const hand = built.state.piles.hero.hand;
    const escapeInst = hand.find(inst => built.state.cards[inst].cardId === 'status-escape');
    assert.ok(escapeInst, '手牌应抽到狂乱逃离');
    const urgentState = structuredClone(built.state);
    urgentState.units.foe.statuses.sandpit = 2;
    const chosen = chooseAllyPlay(urgentState, 'hero');
    assert.deepEqual(chosen, { inst: escapeInst }, '沙坑倒计时 <= 2 时托管必须优先打出狂乱逃离');
});