import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createBattle, replayBattle } from '../src/combat/engine.js';
import { normalizeCard } from '../src/combat/schema.js';
import { cardView } from '../src/combat/battle-state.js';
import { buildCombatReport, collectTurns } from '../src/combat/report.js';
import { templateCatalogText } from '../src/combat/card-templates.js';
import { TRAIT_LINK_CHANCE, planTraitLink, traitLinks } from '../src/combat/traits.js';
import { planTraitShape, traitPool } from '../src/combat/trait-pool.js';
import { rewardEntity, traitEntity } from '../src/combat/generation.js';
import { assembleReward, assembleTrait } from '../src/combat/generation-assembly.js';
import { FLAIR_PASSIVE_TEMPLATES, GEAR_PASSIVE_TEMPLATES } from '../src/combat/card-templates.js';
import { ARCHETYPE_FAMILIES, CARD_TEMPLATES, cardFromValues, heroSkillFromTemplate, solveCardTemplate, templateAllowedFor, templateFamily, TRAIT_SKILL_TEMPLATE_KEYS } from '../src/combat/card-templates.js';
import { buildIntimateDeck } from '../src/combat/intimate-cards.js';
import { parseChallengeStart } from '../src/scene/challenge-directives.js';
import { extractCombatStart } from '../src/scene/combat-directives.js';
import { INTIMATE_GRAMMAR_LINE, INTIMATE_LINES_LINE } from '../src/scene/intimate-duel.js';
import { resolveChallengePromptSegment } from '../src/scene/combat-prompt.js';
import { createCombatLines } from '../src/visual/igs-ui/combat-lines.js';
import {
    advanceIntimateDuel, createDuelLowGate, duelStageOf, explicitAgeOf, fallbackMechanic, getIntimateDuel, grudgeLevel, intimateCreakWindow, intimateHeartBpm,
    isLoveHate, isShakyLoveHate, setIntimateDuel, underageByProfile,
} from '../src/scene/intimate-duel.js';
import { computeBlock, computeDamage, estimateDamage } from '../src/combat/battle-state.js';
import { effectNumbers } from '../src/combat/card-scaling.js';
import { describeEffects } from '../src/visual/igs-ui/combat-card-art.js';
import { cardSlotView } from '../src/visual/igs-ui/combat-panel-model.js';


const hero = (cards, extra = {}) => ({
    id: 'hero', name: '我', side: 'ally', kind: 'deck', maxHp: 30, speed: 100,
    deck: Array(10).fill('c'), catalog: { c: { id: 'c', name: '牌', type: 'attack', cost: 1, rarity: 'common', ...cards } }, ...extra,
});
const foe = (skill, extra = {}) => ({
    id: 'foe', name: '她', side: 'enemy', kind: 'skill', maxHp: 30, speed: 100,
    skills: [{ id: 'k', name: '招', intent: 'defend', effects: [{ op: 'block', amount: 1, target: 'self' }], weight: 1, cooldown: 0, ...skill }], ...extra,
});
const setupOf = (card, skill, units = {}) => ({ controlledId: 'hero', canEscape: true, units: [hero(card, units.hero), foe(skill, units.foe)] });
const play = (state, targetId = 'foe') => applyAction(state, { type: 'play', inst: state.piles.hero.hand[0], targetId });

test('比较句里的岁数差不当作年龄', () => {
    for (const text of ['她比她小三岁', '比主角大两岁', '两人相差五岁']) assert.equal(underageByProfile([text]), false, text);
    assert.equal(explicitAgeOf('比她小三岁，年龄：二十岁'), 20);
    assert.equal(explicitAgeOf('正是二八年华'), 16);
    assert.equal(underageByProfile(['她十七岁']), true);
});

test('延迟反击：自损生命，下回合按所失生命的倍数反击', () => {
    const created = createBattle(setupOf({ effects: [{ op: 'delayed-counter', amount: 4, mult: 3, target: 'enemy' }] }, { effects: [{ op: 'damage', amount: 1, target: 'enemy' }], intent: 'attack' }), 7);
    const played = play(created.state);
    assert.equal(played.state.units.hero.hp, 26);
    const ended = applyAction(played.state, { type: 'end-turn' });
    const counter = ended.events.find((e) => e.type === 'counter');
    assert.equal(counter.amount, 12);
    assert.equal(counter.fizzled, false);
    assert.equal(ended.state.units.foe.hp, 18);
});

test('延迟反击：对方意图正是指定的观望技能时落空，自损照常', () => {
    const card = { effects: [{ op: 'delayed-counter', amount: 4, mult: 3, fizzle: 'k', target: 'enemy' }] };
    const created = createBattle(setupOf(card, {}), 7);
    const played = play(created.state);
    const ended = applyAction(played.state, { type: 'end-turn' });
    assert.equal(played.state.units.hero.hp, 26);
    assert.equal(ended.events.find((e) => e.type === 'counter').fizzled, true);
    assert.equal(ended.state.units.foe.hp, 30);
});

test('双方同掉：同一回合双方一起归零时战斗判负且两边都倒下', () => {
    const card = { effects: [{ op: 'mutual-damage', amount: 10, target: 'enemy' }] };
    const created = createBattle(setupOf(card, {}, { hero: { maxHp: 10 }, foe: { maxHp: 10 } }), 3);
    const played = play(created.state);
    assert.equal(played.state.units.hero.hp, 0);
    assert.equal(played.state.units.foe.hp, 0);
    assert.equal(played.state.outcome, 'defeat');
    assert.equal(played.events.filter((e) => e.type === 'defeated').length, 2);
});

test('双方同掉：只有对方归零时判胜', () => {
    const card = { effects: [{ op: 'mutual-damage', amount: 5, selfAmount: 2, target: 'enemy' }] };
    const created = createBattle(setupOf(card, {}, { foe: { maxHp: 5 } }), 3);
    const played = play(created.state);
    assert.equal(played.state.units.hero.hp, 28);
    assert.equal(played.state.outcome, 'victory');
});

test('二选一随机：按种子走分支，同种子同动作重放结果一致', () => {
    const card = { effects: [{ op: 'random-branch', a: [], b: [{ op: 'damage', amount: 9, hits: 1, target: 'enemy' }] }] };
    const setup = setupOf(card, {});
    const picks = new Set();
    for (let seed = 1; seed <= 24; seed += 1) {
        const first = replayBattle(setup, seed, [{ type: 'play', inst: 'hero#0', targetId: 'foe' }]);
        const second = replayBattle(setup, seed, [{ type: 'play', inst: 'hero#0', targetId: 'foe' }]);
        assert.deepEqual(first.state?.units?.foe?.hp, second.state?.units?.foe?.hp);
        picks.add(first.state?.units?.foe?.hp);
    }
    assert.ok(picks.has(30) || picks.has(21));
});

test('二选一随机：两个分支都出现过，事件记下所选分支', () => {
    const card = { effects: [{ op: 'random-branch', a: [], b: [{ op: 'damage', amount: 9, hits: 1, target: 'enemy' }] }] };
    const seen = new Set();
    for (let seed = 1; seed <= 40 && seen.size < 2; seed += 1) {
        const created = createBattle(setupOf(card, {}), seed);
        const inst = created.state.piles.hero.hand[0];
        const played = applyAction(created.state, { type: 'play', inst, targetId: 'foe' });
        seen.add(played.events.find((e) => e.type === 'random-branch').pick);
    }
    assert.deepEqual([...seen].sort(), ['a', 'b']);
});

test('新原语不影响已有牌：基础攻击牌的种子重放与此前一致', () => {
    const setup = setupOf({ effects: [{ op: 'damage', amount: 4, hits: 1, target: 'enemy' }] }, {});
    const a = replayBattle(setup, 11, [{ type: 'play', inst: 'hero#0', targetId: 'foe' }, { type: 'end-turn' }]);
    const b = replayBattle(setup, 11, [{ type: 'play', inst: 'hero#0', targetId: 'foe' }, { type: 'end-turn' }]);
    assert.deepEqual(a.state.units, b.state.units);
    assert.equal(a.state.rng, b.state.rng);
});

test('三个新模板都能按费用与稀有度解出通过校验的牌', () => {
    for (const key of ['lure', 'tear', 'fumble']) {
        for (const rarity of ['common', 'uncommon', 'rare']) {
            const solved = solveCardTemplate(key, 1, rarity);
            assert.ok(solved, `${key} ${rarity}`);
            const checked = normalizeCard({ id: 'x', name: '牌', cost: 1, rarity, ...solved });
            assert.equal(checked.ok, true, `${key} ${rarity} ${JSON.stringify(checked.errors)}`);
        }
    }
});

test('亲密牌库用新原语替换第一阶段的替代牌型', () => {
    const ops = (mechanic, name) => {
        const { catalog } = buildIntimateDeck({ mechanic, position: 'receive', favor: 40, grudge: 0 });
        return Object.values(catalog).find((card) => card.name === name).effects.map((e) => e.op);
    };
    assert.deepEqual(ops('主导', '示弱诱敌'), ['delayed-counter']);
    assert.deepEqual(ops('主导', '撕扯'), ['mutual-damage']);
    assert.deepEqual(ops('合拍', '害羞躲闪'), ['random-branch']);
    const lure = Object.values(buildIntimateDeck({ mechanic: '主导', position: 'receive' }).catalog).find((card) => card.name === '示弱诱敌');
    assert.equal(lure.effects[0].fizzle, 'im-watch');
});

test('相爱相杀：好感高且仇怨过门槛成立，机制兜底取主导', () => {
    assert.equal(isLoveHate({ favor: 60, grudge: 40 }), true);
    assert.equal(isLoveHate({ favor: 60, grudge: 25 }), false);
    assert.equal(isLoveHate({ favor: 40, grudge: 80 }), false);
    assert.equal(fallbackMechanic({ favor: 60, trust: 70, grudge: 40 }), '主导');
    assert.equal(fallbackMechanic({ favor: 60, trust: 70, grudge: 0 }), '合拍');
    assert.deepEqual([0, 25, 26, 50, 51, 75, 76, 100].map(grudgeLevel), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('相爱相杀：仇怨强度决定旧账稀有度，信任低时多出动摇牌', () => {
    const rarityOf = (grudge) => Object.values(buildIntimateDeck({ mechanic: '主导', position: 'receive', favor: 70, trust: 80, grudge }).catalog).find((card) => card.name === '旧账')?.rarity;
    const order = ['common', 'uncommon', 'rare', 'epic'];
    assert.ok(order.indexOf(rarityOf(90)) > order.indexOf(rarityOf(30)));
    const has = (trust) => Object.values(buildIntimateDeck({ mechanic: '主导', position: 'receive', favor: 70, trust, grudge: 60 }).catalog).some((card) => card.name === '眼神闪躲');
    assert.equal(has(10), true);
    assert.equal(has(80), false);
    assert.equal(isShakyLoveHate({ favor: 70, trust: 10, grudge: 60 }), true);
});

test('换装阶段只升不降：过半切动情强档，两成以下再进一档，回血不退', () => {
    setIntimateDuel({ partner: '小林' });
    assert.deepEqual([1, 0.5, 0.49, 0.2, 0.19, 0].map(duelStageOf), [0, 0, 1, 1, 2, 2]);
    assert.equal(advanceIntimateDuel(0.9), false);
    assert.equal(advanceIntimateDuel(0.4), true);
    assert.equal(getIntimateDuel().stage, 1);
    assert.equal(advanceIntimateDuel(0.45), false);
    assert.equal(advanceIntimateDuel(0.1), true);
    assert.equal(advanceIntimateDuel(0.9), false);
    assert.equal(getIntimateDuel().stage, 2);
    setIntimateDuel(null);
    assert.equal(advanceIntimateDuel(0.1), false);
});

test('心率随对方血条插值，最后两回合开吱呀', () => {
    assert.equal(intimateHeartBpm(1), 66);
    assert.equal(intimateHeartBpm(0), 100);
    assert.ok(intimateHeartBpm(0.5) > 66 && intimateHeartBpm(0.5) < 100);
    assert.deepEqual([[1, 4], [3, 4], [4, 4], [2, 0]].map(([turn, rounds]) => intimateCreakWindow(turn, rounds)), [false, true, true, false]);
});

const LINES_TAG = '[igs-combat:lines|小林|别、别看我/等一下|这样……|唔！/哈……|我、我快……]';
const DUEL_TAG = '[igs-challenge:夜深|亲密|主导|普通]';
const GATE = { on: true, newRise: true, partner: '小林', eventKey: 1, mechanic: '主导' };

test('亲密标签所在块里的 lines 行解析给对决会话，卡牌战斗的 lines 解析不变', () => {
    const body = `夜深了。
<igs-combat>
${LINES_TAG}
${DUEL_TAG}
</igs-combat>`;
    const { start } = parseChallengeStart(body, { intimate: GATE });
    assert.equal(start.intimate, true);
    assert.deepEqual(start.lines, [{ character: '小林', open: ['别、别看我', '等一下'], attack: ['这样……'], hit: ['唔！', '哈……'], down: ['我、我快……'] }]);
    const plain = parseChallengeStart(`夜深了。
${DUEL_TAG}`, { intimate: GATE }).start;
    assert.equal(plain.lines, undefined);
    const combat = extractCombatStart(`${LINES_TAG}
[igs-combat:start|林间遭遇|山贼*1|]`).start;
    assert.equal(combat.lines.length, 1);
    assert.equal(combat.lines[0].down[0], '我、我快……');
    const late = extractCombatStart(`[igs-combat:start|林间遭遇|山贼*1|]
${LINES_TAG}`);
    assert.equal(late.start.lines, undefined);
});

test('亲密对决开启时提示词补台词写法，关闭时不出现', () => {
    const settings = (on) => ({ combatExpansion: { enabled: true, kind: 'combat', intimate: { enabled: on } }, intimateOn: on });
    const open = resolveChallengePromptSegment(settings(true), null);
    assert.ok(open.content.includes(INTIMATE_GRAMMAR_LINE) && open.content.includes(INTIMATE_LINES_LINE));
    assert.ok(INTIMATE_LINES_LINE.includes('快失守'));
    assert.equal(resolveChallengePromptSegment(settings(false), null), null);
});

test('快失守只在对方掌控首次低于两成时触发一次，换局重新计', () => {
    const gate = createDuelLowGate();
    assert.deepEqual([[ 'a', 0.9 ], ['a', 0.2], ['a', 0.19], ['a', 0.1], ['a', 0.5], ['a', 0.05], ['b', 0.1], ['b', 0]].map(([id, r]) => gate(id, r)), [false, false, true, false, false, false, true, false]);
    assert.equal(createDuelLowGate()('', 0.1), false);
});

test('没有 lines 时对方不说话，有 lines 时按四段各说一次且遵守显示偏好', async () => {
    const { JSDOM } = await import('jsdom');
    const { document } = new JSDOM('<div id="p"><div class="cx-unit" data-unit="foe"></div></div>').window;
    const root = document.getElementById('p');
    const unit = root.firstChild;
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 });
    unit.getBoundingClientRect = () => ({ left: 100, top: 50, width: 80, height: 80 });
    const spoken = [];
    let show = true;
    const make = () => createCombatLines({ doc: document, getRoot: () => root, schedule: () => {}, getPrefs: () => ({ show, tts: true }), getTtsContext: () => ({ settings: { enabled: true }, sceneAssets: null }), tts: { speak: (line) => { spoken.push(line.text); return null; }, prefetch: async () => {} } });
    const silent = make();
    assert.equal(silent.setLines(undefined, 'c1'), false);
    for (const phase of ['open', 'attack', 'hit', 'down']) assert.equal(silent.say({ name: '小林' }, unit, phase), false);
    assert.equal(root.querySelector('.igs-combat-line'), null);
    const lines = make();
    lines.setLines([{ character: '小林', open: ['开场'], attack: ['出招'], hit: ['受击'], down: ['快失守'] }], 'c2');
    assert.deepEqual(['open', 'attack', 'hit', 'down'].map((phase) => lines.say({ name: '小林' }, unit, phase)), [true, true, true, true]);
    assert.ok(spoken.includes('快失守'));
    show = false;
    assert.equal(lines.say({ name: '小林' }, unit, 'open'), false);
});


// ---------- 规则 v5 P1：新卡牌模板（L01–L10） ----------
const P1_TEMPLATES = ['slam', 'entrench', 'bloodlet', 'bloodrush', 'bloodrage', 'overdrive', 'heavy-blade', 'catalyst', 'sap', 'foresight', 'reserve', 'steadfast', 'trance', 'conflux', 'cascade', 'tempo', 'absolution', 'sigil', 'phase', 'deathward'];
const built = (key, values) => CARD_TEMPLATES[key].build(values);
// 只作用于自身的牌不带目标出牌，并要求出牌成功。
const cast = (state, inst = state.piles.hero.hand[0]) => {
    const result = applyAction(state, { type: 'play', inst });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    return result;
};
const startOf = (card, skill = {}, units = {}) => {
    const created = createBattle(setupOf(card, skill, units), 7);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    return created.state;
};
function firstSolved(key) {
    for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'mythic']) {
        for (const cost of [0, 1, 2, 3]) {
            const solved = solveCardTemplate(key, cost, rarity);
            if (solved) return { solved, rarity, cost };
        }
    }
    return null;
}

test('P1 新模板：每个都有可解档位并通过牌校验；限定稀有度的模板低于下限无解，也不进人物技能与特性主动技能', () => {
    for (const key of P1_TEMPLATES) {
        const found = firstSolved(key);
        assert.ok(found, key);
        const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
        assert.equal(checked.ok, true, `${key} ${JSON.stringify(checked.errors)}`);
    }
    assert.equal(solveCardTemplate('conflux', 1, 'uncommon'), null);
    assert.ok(solveCardTemplate('conflux', 1, 'rare'));
    for (const key of ['conflux', 'phase', 'deathward']) {
        assert.equal(heroSkillFromTemplate(key), null, key);
        assert.equal(TRAIT_SKILL_TEMPLATE_KEYS.includes(key), false, key);
    }
    for (const key of ['phase', 'deathward']) {
        assert.equal(solveCardTemplate(key, 1, 'rare'), null, key);
        assert.ok(solveCardTemplate(key, 1, 'epic'), key);
        assert.equal(cardFromValues(key, 1, 'rare', [1]).error, 'template-unsolvable', key);
    }
});

test('P1 职业归属：净化与护身模板只给祈司，延迟反击、互伤、随机分支分属守护、战士、乐师', () => {
    for (const key of ['absolution', 'sigil', 'phase', 'deathward']) {
        assert.equal(templateFamily(key), 'sanctum', key);
        assert.deepEqual(Object.keys(ARCHETYPE_FAMILIES).filter((archetype) => templateAllowedFor(key, archetype)), ['priest'], key);
    }
    assert.equal(templateAllowedFor('lure', 'guardian'), true);
    assert.equal(templateAllowedFor('tear', 'warrior'), true);
    assert.equal(templateAllowedFor('fumble', 'bard'), true);
    assert.equal(templateAllowedFor('heavy-blade', 'warrior'), true);
    assert.equal(templateAllowedFor('heavy-blade', 'mage'), false);
    assert.equal(templateAllowedFor('sap', 'assassin'), true);
});

test('格挡转伤害与格挡翻倍：先获得格挡，再按当前格挡出伤或翻倍', () => {
    const slam = play(startOf({ effects: built('slam', [5]) }));
    assert.equal(slam.state.units.hero.block, 5);
    assert.equal(slam.state.units.foe.hp, 25);
    const entrench = cast(startOf({ type: 'skill', effects: built('entrench', [4]) }));
    assert.equal(entrench.state.units.hero.block, 8);
});


test('自伤三模板：抽牌、能量、攻击力各自兑现，失去的生命不被格挡', () => {
    const opened = startOf({ type: 'skill', effects: [{ op: 'block', amount: 9, target: 'self' }, ...built('bloodlet', [2, 3])] });
    const drawn = cast(opened);
    assert.equal(drawn.state.units.hero.hp, 27);
    assert.equal(drawn.state.piles.hero.hand.length, opened.piles.hero.hand.length + 1);
    const rushStart = startOf({ type: 'skill', effects: built('bloodrush', [1, 4]) });
    const rush = cast(rushStart);
    assert.deepEqual([rush.state.units.hero.energy, rush.state.units.hero.hp], [rushStart.units.hero.energy, 26]);
    const rage = cast(startOf({ type: 'power', effects: built('bloodrage', [2, 5]) }));
    assert.deepEqual([rage.state.units.hero.statuses.strength, rage.state.units.hero.hp], [2, 25]);
});

test('攻击力与中毒翻倍：翻倍当前层数，攻击力翻倍用后消耗', () => {
    const opened = startOf({ type: 'skill', effects: built('overdrive', [2]) });
    const inst = opened.piles.hero.hand[0];
    const doubled = cast(opened);
    assert.equal(doubled.state.units.hero.statuses.strength, 4);
    assert.ok(doubled.state.piles.hero.exhaust.includes(inst));
    const poisoned = play(startOf({ type: 'skill', effects: built('catalyst', [3]) }));
    assert.equal(poisoned.state.units.foe.statuses.poison, 6);
});

test('攻击力倍率重击：攻击力加成按 ×3 计入伤害', () => {
    const effects = [{ op: 'status', status: 'strength', stacks: 2, target: 'self' }, ...built('heavy-blade', [4])];
    assert.equal(play(startOf({ effects })).state.units.foe.hp, 20);
});

test('脆弱施加：目标获得的格挡 ×0.75 向下取整，回合结束减 1 层', () => {
    const plain = applyAction(play(startOf({ effects: [{ op: 'damage', amount: 4, target: 'enemy' }] })).state, { type: 'end-turn' });
    assert.equal(plain.state.units.foe.block, 1);
    const played = play(startOf({ effects: built('sap', [4, 2]) }));
    assert.deepEqual([played.state.units.foe.hp, played.state.units.foe.statuses.frail], [26, 2]);
    const ended = applyAction(played.state, { type: 'end-turn' });
    assert.equal(ended.state.units.foe.block, 0);
    assert.equal(ended.state.units.foe.statuses.frail, 1);
});


const playInst = (state, inst) => applyAction(state, { type: 'play', inst, targetId: 'foe' });
const hitFor = (amount) => ({ intent: 'attack', effects: [{ op: 'damage', amount, target: 'enemy' }] });

test('下回合收益：格挡后下回合多抽牌或多获得能量', () => {
    const turnTwo = (effects) => applyAction(cast(startOf({ type: 'skill', effects })).state, { type: 'end-turn' }).state;
    const plain = turnTwo([{ op: 'block', amount: 3, target: 'self' }]);
    const drawn = turnTwo(built('foresight', [3, 2]));
    const charged = turnTwo(built('reserve', [3, 1]));
    assert.equal(drawn.piles.hero.hand.length, plain.piles.hero.hand.length + 2);
    assert.equal(charged.units.hero.energy, plain.units.hero.energy + 1);
});

test('保留模板：求解结果带保留关键字，回合结束手牌不被弃掉', () => {
    const solved = solveCardTemplate('steadfast', 1, 'common');
    assert.equal(solved.retain, true);
    const opened = startOf(solved);
    const ended = applyAction(opened, { type: 'end-turn' });
    for (const inst of opened.piles.hero.hand) assert.ok(ended.state.piles.hero.hand.includes(inst), inst);
});

test('禁抽代价：抽牌后本回合不能再抽，回合结束解除', () => {
    const first = cast(startOf({ type: 'skill', effects: built('trance', [2]) }));
    assert.equal(first.state.units.hero.statuses['no-draw'], 1);
    const ended = applyAction(first.state, { type: 'end-turn' });
    assert.equal(ended.state.units.hero.statuses['no-draw'] || 0, 0);
    assert.ok(ended.state.piles.hero.hand.length > 0);
    // 同回合再打一张：抽牌被挡住，禁抽叠到 2 层，回合结束只减 1 层，下回合开始也抽不到牌。
    const second = cast(first.state);
    assert.equal(second.state.piles.hero.hand.length, first.state.piles.hero.hand.length - 1);
    assert.equal(second.state.units.hero.statuses['no-draw'], 2);
    const carried = applyAction(second.state, { type: 'end-turn' });
    assert.equal(carried.state.units.hero.statuses['no-draw'], 1);
    assert.equal(carried.state.piles.hero.hand.length, 0);
});

test('全体减费（限稀有以上）：本回合手牌费用 -1，回合结束恢复', () => {
    const played = cast(startOf({ type: 'skill', rarity: 'rare', effects: built('conflux', [1, 1]) }));
    assert.equal(cardView(played.state, played.state.piles.hero.hand[0]).cost, 0);
    const ended = applyAction(played.state, { type: 'end-turn' });
    assert.equal(cardView(ended.state, ended.state.piles.hero.hand[0]).cost, 1);
});

test('技能数条件：本回合已出 2 张技能牌时追加伤害', () => {
    const catalog = {
        c: { id: 'c', name: '连锋', type: 'attack', cost: 1, rarity: 'common', innate: true, effects: built('cascade', [3, 5]) },
        s: { id: 's', name: '技', type: 'skill', cost: 0, rarity: 'common', effects: [{ op: 'block', amount: 1, target: 'self' }] },
    };
    const units = { hero: { deck: ['c', ...Array(9).fill('s')], catalog } };
    assert.equal(playInst(startOf({}, {}, units), 'hero#0').state.units.foe.hp, 27);
    let state = startOf({}, {}, units);
    for (const inst of state.piles.hero.hand.filter((i) => i !== 'hero#0').slice(0, 2)) state = cast(state, inst).state;
    assert.equal(playInst(state, 'hero#0').state.units.foe.hp, 22);
});


test('自身状态条件：自身有防御力时追加抽 1 张', () => {
    const plainStart = startOf({ type: 'skill', effects: built('tempo', [2, 1]) });
    const plain = cast(plainStart);
    assert.equal(plain.state.piles.hero.hand.length, plainStart.piles.hero.hand.length - 1);
    const boostedStart = startOf({ type: 'skill', effects: [{ op: 'status', status: 'dexterity', stacks: 1, target: 'self' }, ...built('tempo', [2, 1])] });
    const boosted = cast(boostedStart);
    assert.equal(boosted.state.piles.hero.hand.length, boostedStart.piles.hero.hand.length);
    assert.equal(boosted.state.units.hero.block, 3);
});

test('祈司净化与人工制品：净化清除减益，人工制品抵消下一次减益', () => {
    const weak = { op: 'status', status: 'weak', stacks: 2, target: 'self' };
    const cleansed = cast(startOf({ type: 'skill', effects: [weak, ...built('absolution', [3])] }));
    assert.equal(cleansed.state.units.hero.statuses.weak || 0, 0);
    assert.equal(cleansed.state.units.hero.block, 3);
    const warded = cast(startOf({ type: 'skill', effects: [...built('sigil', [1, 3]), weak] }));
    assert.equal(warded.state.units.hero.statuses.weak || 0, 0);
    assert.equal(warded.state.units.hero.statuses.artifact || 0, 0);
});

test('无实体与保命（限史诗以上）：受伤降为 1、致死保留 1 生命，均用后消耗', () => {
    const phaseStart = startOf({ type: 'skill', rarity: 'epic', effects: built('phase', [1]) }, hitFor(10));
    const phaseInst = phaseStart.piles.hero.hand[0];
    const phased = cast(phaseStart);
    assert.ok(phased.state.piles.hero.exhaust.includes(phaseInst));
    assert.ok(applyAction(phased.state, { type: 'end-turn' }).state.units.hero.hp >= 29);
    const standStart = startOf({ type: 'skill', rarity: 'epic', effects: built('deathward', [1]) }, hitFor(50));
    const stood = applyAction(cast(standStart).state, { type: 'end-turn' });
    assert.equal(stood.state.units.hero.hp, 1);
    assert.notEqual(stood.state.outcome, 'defeat');
    assert.equal(stood.state.units.hero.statuses.endure || 0, 0);
});


// ---------- 规则 v5 P1：特性与装备翻牌联动、华而不实加权（L11–L13） ----------
test('新抽特性联动（D9）：普通与罕见不附，稀有以上按比例附且三种都会出现，同种子结果固定，组装写入特性', () => {
    for (const rarity of ['common', 'uncommon']) {
        for (let i = 0; i < 200; i += 1) assert.equal(planTraitLink(`h|${i}`, rarity), null, rarity);
    }
    for (const rarity of ['rare', 'epic', 'mythic']) {
        const kinds = new Set();
        let hit = 0;
        for (let i = 0; i < 4000; i += 1) {
            const link = planTraitLink(`h|${i}`, rarity);
            if (link) { hit += 1; kinds.add(link); }
        }
        assert.ok(Math.abs(hit / 4000 - TRAIT_LINK_CHANCE[rarity]) < 0.03, `${rarity} ${hit / 4000}`);
        assert.deepEqual([...kinds].sort(), ['fortune', 'reflip', 'reveal'], rarity);
    }
    assert.equal(planTraitLink('h|7', 'mythic'), planTraitLink('h|7', 'mythic'));
    const entity = traitEntity({ character: { id: 'h', name: '我' }, rarity: 'rare', traitId: 'tr-1', link: 'reveal' });
    assert.equal(entity.fixed.link, 'reveal');
    assert.equal(entity.input.link, undefined);
    const assembled = assembleTrait({ name: '慧眼', template: 'flair-glint', origin: '' }, { key: entity.key, fixed: entity.fixed });
    assert.equal(assembled.value.link, 'reveal');
    assert.equal(traitEntity({ character: { id: 'h', name: '我' }, rarity: 'rare', traitId: 'tr-2' }).fixed.link, undefined);
});

test('装备联动：已装备饰品与宝物的 link 并入特性联动，武器防具不计，神话饰品透视亮 2 张', () => {
    assert.deepEqual(traitLinks([{ link: 'reveal' }]), { reveal: 1, reflip: false, fortune: false });
    assert.deepEqual(traitLinks([], { weapon: { link: 'reflip' }, armor: { link: 'fortune' } }), { reveal: 0, reflip: false, fortune: false });
    assert.deepEqual(traitLinks([], { accessory: { link: 'reveal', rarity: 'mythic' }, treasure: { link: 'fortune' } }), { reveal: 2, reflip: false, fortune: true });
});

test('华而不实加权（D10）：特性池抽中比例约为平权时的 2 倍；奖励装备槽带候选且只收候选内模板，旧槽照用全表', () => {
    const pool = traitPool('common');
    const base = pool.filter((shape) => shape.kind === 'flair').length / pool.length;
    let flair = 0;
    for (let i = 0; i < 3000; i += 1) if (Object.hasOwn(FLAIR_PASSIVE_TEMPLATES, planTraitShape(`s${i}`, 'common').template || '')) flair += 1;
    assert.ok(flair / 3000 > base * 1.5, `${flair / 3000} vs ${base}`);
    const { entity } = rewardEntity({ combatId: 'c1', anchor: { messageId: 1 }, tier: 'boss', character: { id: 'h', kind: 'deck-character', name: '我' } });
    for (const slot of [...entity.fixed.slots, ...entity.fixed.reserve].filter((s) => s.kind === 'gear')) {
        assert.equal(slot.templates.length, 5);
        for (const key of slot.templates) assert.ok(Object.hasOwn(GEAR_PASSIVE_TEMPLATES, key), key);
    }
    const allowed = ['flair-glint', 'opening-strength'];
    const outside = Object.keys(GEAR_PASSIVE_TEMPLATES).find((key) => !allowed.includes(key));
    const slot = { index: 0, kind: 'gear', rarity: 'rare', gearSlot: 'accessory' };
    const reply = (template) => ({ slots: [['护身符', template, '旧物']] });
    assert.ok(assembleReward(reply('flair-glint'), { key: 'r', input: { seed: 's', slots: [{ ...slot, templates: allowed }] } }).value.slots[0].gear.passive);
    assert.ok(assembleReward(reply(outside), { key: 'r', input: { seed: 's', slots: [{ ...slot, templates: allowed }] } }).errors?.length);
    assert.ok(assembleReward(reply(outside), { key: 'r', input: { seed: 's', slots: [slot] } }).value.slots[0].gear.passive);
});


// ---------- 规则 v5 P1：v4 事件进战报、选牌限制写入目录（L14–L15） ----------
const artifactFoe = { passives: [{ id: 'ward', trigger: 'battle-start', effects: [{ op: 'status', status: 'artifact', stacks: 1, target: 'self' }] }] };

test('战报：人工制品抵消减益写进出手描述', () => {
    const card = { effects: [{ op: 'status', status: 'weak', stacks: 1, target: 'enemy' }, { op: 'damage', amount: 30, target: 'enemy' }] };
    const played = play(startOf(card, {}, { foe: artifactFoe }));
    assert.equal(played.state.outcome, 'victory');
    const action = collectTurns(played.events, played.state.units).flatMap((turn) => turn.actions).find((a) => a.actorId === 'hero');
    assert.deepEqual(action.targets.get('foe').warded, ['weak']);
    const report = buildCombatReport({ combatId: 'c-art', state: played.state, events: played.events });
    assert.ok(report.text.includes('她的人工制品抵消了虚弱'), report.text);
});

test('战报：对方出牌触发的被动记为随即应变', () => {
    const units = { foe: { passives: [{ id: 'parry', trigger: 'foe-card-played', effects: [{ op: 'block', amount: 1, target: 'self' }] }] } };
    const played = play(startOf({ effects: [{ op: 'damage', amount: 2, target: 'enemy' }] }, {}, units));
    const action = collectTurns(played.events, played.state.units).flatMap((turn) => turn.actions).find((a) => a.actorId === 'hero');
    assert.deepEqual(action.reactions, ['foe']);
    const quiet = play(startOf({ effects: [{ op: 'damage', amount: 2, target: 'enemy' }] }));
    assert.deepEqual(collectTurns(quiet.events, quiet.state.units).flatMap((turn) => turn.actions).find((a) => a.actorId === 'hero').reactions, []);
});

test('战报：敌方往我方牌堆塞状态牌记在敌方出手上', () => {
    const skill = { intent: 'debuff', effects: [{ op: 'create', card: 'status-wound', amount: 1, to: 'discard' }] };
    const ended = applyAction(startOf({ effects: [{ op: 'damage', amount: 1, target: 'enemy' }] }, skill), { type: 'end-turn' });
    assert.equal(ended.ok, true, JSON.stringify(ended.error));
    const action = collectTurns(ended.events, ended.state.units).flatMap((turn) => turn.actions).find((a) => a.actorId === 'foe');
    assert.deepEqual(action.targets.get('hero').junk, ['伤口']);
});

test('目录文本：写 choose 的模板单列为只能作卡牌，原有各行不变', () => {
    const lines = templateCatalogText().split('\n');
    const line = lines.find((text) => text.startsWith('从手牌选牌的卡牌模板'));
    assert.ok(line);
    // P2b 起，从手牌选牌的牌堆操作模板（置顶、消耗他牌、变形、临时升级）同样只能作卡牌。
    assert.deepEqual(line.split('：').at(-1).split(',').sort(), ['cull', 'morph', 'purify', 'refine', 'replicate', 'stack', 'temper', 'toss']);
    assert.ok(lines.some((text) => text.startsWith('不能用作人物技能（skill）的卡牌模板：')));
});

// ---------- 规则 v5 P2a：状态与伤害（G01–G07、G21）与公共接线 ----------
const selfStatus = (status, stacks) => ({ passives: [{ id: `p-${status}`, trigger: 'battle-start', effects: [{ op: 'apply-status', status, stacks, target: 'self' }] }] });
const foeAttack = (amount) => ({ intent: 'attack', effects: [{ op: 'damage', amount, target: 'enemy' }] });
const endTurn = (state) => {
    const result = applyAction(state, { type: 'end-turn' });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    return result;
};

test('临时攻防（G01）：本回合攻击与格挡各加层数，回合结束撤销', () => {
    const card = { effects: [{ op: 'apply-status', status: 'flex', stacks: 3, target: 'self' }, { op: 'apply-status', status: 'poise', stacks: 2, target: 'self' }, { op: 'damage', amount: 5, target: 'enemy' }, { op: 'block', amount: 4, target: 'self' }] };
    const played = play(startOf(card));
    assert.equal(played.ok, true, JSON.stringify(played.error));
    assert.equal(played.state.units.foe.hp, 22);
    assert.equal(played.state.units.hero.block, 6);
    const ended = endTurn(played.state);
    assert.equal(ended.state.units.hero.statuses.flex, undefined);
    assert.equal(ended.state.units.hero.statuses.poise, undefined);
});

test('规则 v4 战斗不结算 v5 登记算子：临时攻击力不生效', () => {
    const card = { effects: [{ op: 'apply-status', status: 'flex', stacks: 3, target: 'self' }, { op: 'damage', amount: 5, target: 'enemy' }] };
    const created = createBattle({ ...setupOf(card, {}), rulesVersion: 4 }, 7);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    const played = play(created.state);
    assert.equal(played.state.units.foe.hp, 25);
    assert.equal(played.state.units.hero.statuses.flex, undefined);
});

test('攻防下降（G02）：降低攻击伤害与获得的格挡，属减益可被人工制品挡下', () => {
    const card = { type: 'skill', effects: [{ op: 'apply-status', status: 'atk-down', stacks: 2, target: 'enemy' }] };
    assert.equal(endTurn(play(startOf(card, foeAttack(6))).state).state.units.hero.hp, 26);
    assert.equal(endTurn(play(startOf(card, foeAttack(6), { foe: artifactFoe })).state).state.units.hero.hp, 24);
    assert.equal(computeBlock({ statuses: { 'def-down': 2 } }, 5, undefined, 5), 3);
    assert.equal(computeBlock({ statuses: { 'def-down': 2 } }, 5), 5);
    assert.equal(computeDamage({ statuses: { 'atk-down': 2 } }, null, 6, 1, 5), 4);
    assert.equal(computeDamage({ statuses: { 'atk-down': 2 } }, null, 6, 1, 4), 6);
});

test('蓄势（G03）：下一次攻击每段额外加层数，攻击出手后清除；不攻击的出手不消耗', () => {
    const played = play(startOf({ effects: [{ op: 'apply-status', status: 'vigor', stacks: 4, target: 'self' }, { op: 'damage', amount: 3, hits: 2, target: 'enemy' }] }));
    assert.equal(played.state.units.foe.hp, 16);
    assert.equal(played.state.units.hero.statuses.vigor, undefined);
    const held = cast(startOf({ type: 'skill', effects: [{ op: 'apply-status', status: 'vigor', stacks: 4, target: 'self' }] }));
    assert.equal(held.state.units.hero.statuses.vigor, 4);
});

test('倍伤窗口（G04）：按次数的倍伤每次攻击出手扣一层，三倍伤优先；按回合的倍伤在回合结束衰减', () => {
    const twice = play(startOf({ effects: [{ op: 'apply-status', status: 'empower', stacks: 2, target: 'self' }, { op: 'damage', amount: 5, hits: 2, target: 'enemy' }] }));
    assert.equal(twice.state.units.foe.hp, 10);
    assert.equal(twice.state.units.hero.statuses.empower, 1);
    const triple = play(startOf({ effects: [{ op: 'apply-status', status: 'overpower', stacks: 1, target: 'self' }, { op: 'apply-status', status: 'empower', stacks: 1, target: 'self' }, { op: 'damage', amount: 5, target: 'enemy' }] }));
    assert.equal(triple.state.units.foe.hp, 15);
    assert.equal(triple.state.units.hero.statuses.overpower, undefined);
    assert.equal(triple.state.units.hero.statuses.empower, 1);
    const turns = play(startOf({ effects: [{ op: 'apply-status', status: 'empower-turns', stacks: 2, target: 'self' }, { op: 'damage', amount: 5, target: 'enemy' }] }));
    assert.equal(turns.state.units.foe.hp, 20);
    assert.equal(endTurn(turns.state).state.units.hero.statuses['empower-turns'], 1);
});

test('先手（G05）：每回合第一张攻击牌伤害 +50%，之后的攻击牌不加', () => {
    const first = play(startOf({ effects: [{ op: 'damage', amount: 10, target: 'enemy' }] }, {}, { hero: selfStatus('first-strike', 1) }));
    assert.equal(first.state.units.foe.hp, 15);
    const second = play(first.state);
    assert.equal(second.state.units.foe.hp, 5);
    assert.equal(second.state.units.hero.res, undefined);
});

test('护命（G06）：抵消下一次失去生命并按次消耗，战报写明', () => {
    const ended = endTurn(startOf({ effects: [{ op: 'damage', amount: 1, target: 'enemy' }] }, foeAttack(6), { hero: selfStatus('buffer', 1) }));
    assert.equal(ended.state.units.hero.hp, 30);
    assert.equal(ended.state.units.hero.statuses.buffer, undefined);
    assert.ok(ended.events.some((e) => e.type === 'buffer' && e.target === 'hero'));
    const action = collectTurns(ended.events, ended.state.units).flatMap((t) => t.actions).find((a) => a.actorId === 'foe');
    assert.ok(action.targets.get('hero').notes.some((note) => note.includes('护命')));
});

test('吸取（G07）：按实际扣除的生命回复，托管估算、牌面说明与缩放都认得', () => {
    const card = { effects: [{ op: 'drain', amount: 6, target: 'enemy' }] };
    const state = startOf(card, {}, { hero: { hp: 10 } });
    assert.equal(estimateDamage(state, state.units.hero, state.units.foe, card.effects, 'foe'), 6);
    const played = play(state);
    assert.equal(played.state.units.foe.hp, 24);
    assert.equal(played.state.units.hero.hp, 16);
    assert.ok(describeEffects(card.effects).includes('按实际扣除的生命回复'));
    assert.deepEqual(effectNumbers(card.effects), [6]);
});

test('恶意（G21）：成功施加减益即对目标造成层数伤害，被人工制品挡下不算', () => {
    const card = { type: 'skill', effects: [{ op: 'status', status: 'weak', stacks: 1, target: 'enemy' }] };
    assert.equal(play(startOf(card, {}, { hero: selfStatus('malice', 2) })).state.units.foe.hp, 28);
    assert.equal(play(startOf(card, {}, { hero: selfStatus('malice', 2), foe: artifactFoe })).state.units.foe.hp, 30);
});

test('规则 v5 公共接线：净化清除登记的减益，面板伤害预览带上登记的修正', () => {
    const foeSkill = { intent: 'debuff', effects: [{ op: 'apply-status', status: 'atk-down', stacks: 2, target: 'enemy' }] };
    const ended = endTurn(startOf({ type: 'skill', effects: [{ op: 'cleanse', target: 'self' }] }, foeSkill));
    assert.equal(ended.state.units.hero.statuses['atk-down'], 2);
    const cleansed = cast(ended.state);
    assert.equal(cleansed.state.units.hero.statuses['atk-down'], undefined);
    assert.deepEqual(cleansed.events.find((e) => e.type === 'cleanse').statuses, ['atk-down']);
    const slot = cardSlotView({ effects: [{ op: 'damage', amount: 5, target: 'enemy' }] }, { statuses: { flex: 3 } }, 5);
    assert.equal(slot.value, 8);
    assert.ok(slot.bonusNote.includes('其他修正 +3'), slot.bonusNote);
    assert.equal(cardSlotView({ effects: [{ op: 'damage', amount: 5, target: 'enemy' }] }, { statuses: { flex: 3 } }).value, 5);
});


test('规则 v5 P2a 模板：卡牌模板可反解且通过校验、归入通用族；被动与敌方技能模板能被引擎结算', async () => {
    const { PASSIVE_TEMPLATES, SKILL_TEMPLATES, passiveFromTemplate, skillFromTemplate } = await import('../src/combat/card-templates.js');
    const { normalizeSkill } = await import('../src/combat/schema.js');
    for (const key of ['battlecry', 'stance', 'disarm', 'breach', 'wind-up', 'fervor', 'zenith', 'apex', 'ambush', 'lifeguard', 'siphon', 'spite']) {
        const found = firstSolved(key);
        assert.ok(found, key);
        const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
        assert.equal(checked.ok, true, `${key} ${JSON.stringify(checked.errors)}`);
        assert.equal(templateFamily(key), 'general');
    }
    assert.equal(solveCardTemplate('zenith', 1, 'common'), null);
    for (const key of ['opening-vigor', 'opening-ambush', 'opening-buffer', 'opening-enfeeble']) assert.ok(PASSIVE_TEMPLATES[key] && passiveFromTemplate(key).effects.length, key);
    for (const key of ['battle-flex', 'enfeeble', 'gather', 'bloodsip']) {
        const skill = { id: `s-${key}`, name: key, ...skillFromTemplate(key, 12) };
        assert.ok(SKILL_TEMPLATES[key], key);
        if (typeof normalizeSkill === 'function') assert.equal(normalizeSkill(skill).ok, true, `${key} ${JSON.stringify(normalizeSkill(skill).errors)}`);
    }
    const ended = endTurn(startOf({ type: 'skill', effects: [{ op: 'block', amount: 1, target: 'self' }] }, { intent: 'debuff', ...skillFromTemplate('enfeeble', 12) }));
    assert.equal(ended.state.units.hero.statuses['atk-down'], 2);
});

// ---------- 规则 v5 P2b：牌堆操作（G08–G15） ----------
const def = (id, type, effects, extra = {}) => ({ id, name: id, type, cost: 1, rarity: 'common', effects, ...extra });
const ATTACK = def('a', 'attack', [{ op: 'damage', amount: 2, target: 'enemy' }], { upgraded: { effects: [{ op: 'damage', amount: 6, target: 'enemy' }] } });
const GUARD = def('k', 'skill', [{ op: 'block', amount: 1, target: 'self' }]);
const startDeck = (catalog, deck, rulesVersion) => {
    const setup = { controlledId: 'hero', canEscape: true, units: [hero({}, { deck, catalog }), foe({})], ...(rulesVersion ? { rulesVersion } : {}) };
    const created = createBattle(setup, 7);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    return created.state;
};
const instOf = (state, cardId) => state.piles.hero.hand.find((inst) => state.cards[inst].cardId === cardId);
const playIn = (state, inst, targetId) => {
    const result = applyAction(state, { type: 'play', inst, ...(targetId ? { targetId } : {}) });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    return result;
};
const choose = (state, insts) => {
    const result = applyAction(state, { type: 'choose', insts });
    assert.equal(result.ok, true, JSON.stringify(result.error));
    return result;
};

test('检索（G08）：从抽牌堆按类型取一张入手，战报写明', () => {
    const s = def('s', 'skill', [{ op: 'search', amount: 1, cardType: 'attack' }], { innate: true });
    const state = startDeck({ s, a: ATTACK, k: GUARD }, ['s', ...Array(5).fill('a'), ...Array(5).fill('k')]);
    const played = playIn(state, instOf(state, 's'));
    const fetched = played.events.find((e) => e.type === 'fetch');
    assert.equal(fetched.from, 'draw');
    assert.equal(played.state.cards[fetched.inst].cardId, 'a');
    assert.ok(played.state.piles.hero.hand.includes(fetched.inst));
    assert.ok(!played.state.piles.hero.draw.includes(fetched.inst));
    const action = collectTurns(played.events, played.state.units).flatMap((t) => t.actions).find((a) => a.actorId === 'hero');
    assert.ok(action.targets.get('hero').notes.includes('检索出一张牌'));
});

test('回收（G09）：从弃牌堆取回刚打出的牌', () => {
    const r = def('r', 'skill', [{ op: 'retrieve', amount: 1, from: 'discard' }], { innate: true });
    const state = startDeck({ r, a: ATTACK }, ['r', ...Array(9).fill('a')]);
    const attack = instOf(state, 'a');
    const first = playIn(state, attack, 'foe');
    assert.ok(first.state.piles.hero.discard.includes(attack));
    const second = playIn(first.state, instOf(first.state, 'r'));
    assert.ok(second.state.piles.hero.hand.includes(attack));
    assert.equal(second.events.find((e) => e.type === 'fetch').from, 'discard');
});

test('置顶与回顶（G10）：选手牌放到抽牌堆顶；打出后回顶的牌不进弃牌堆', () => {
    const t = def('t', 'skill', [{ op: 'topdeck', amount: 1, mode: 'choose' }], { innate: true });
    const state = startDeck({ t, k: GUARD }, ['t', ...Array(9).fill('k')]);
    const pending = playIn(state, instOf(state, 't'));
    assert.equal(pending.state.pending.kind, 'topdeck');
    const pick = pending.state.pending.options[1];
    const chosen = choose(pending.state, [pick]);
    assert.equal(chosen.state.piles.hero.draw.at(-1), pick);
    assert.ok(!chosen.state.piles.hero.hand.includes(pick));
    const b = def('b', 'attack', [{ op: 'damage', amount: 2, target: 'enemy' }, { op: 'recur', to: 'top' }], { innate: true });
    const deck = startDeck({ b, k: GUARD }, ['b', ...Array(9).fill('k')]);
    const inst = instOf(deck, 'b');
    const played = playIn(deck, inst, 'foe');
    assert.equal(played.state.piles.hero.draw.at(-1), inst);
    assert.ok(!played.state.piles.hero.discard.includes(inst));
    assert.equal(played.events.find((e) => e.type === 'recur').to, 'top');
});

test('回手（G11）：打出后回到手牌；规则 v4 战斗照常进弃牌堆', () => {
    const h = def('h', 'attack', [{ op: 'damage', amount: 2, target: 'enemy' }, { op: 'recur', to: 'hand' }], { innate: true });
    const state = startDeck({ h, k: GUARD }, ['h', ...Array(9).fill('k')]);
    const inst = instOf(state, 'h');
    const played = playIn(state, inst, 'foe');
    assert.ok(played.state.piles.hero.hand.includes(inst));
    assert.equal(played.state.units.foe.hp, 28);
    const old = startDeck({ h, k: GUARD }, ['h', ...Array(9).fill('k')], 4);
    const oldPlayed = playIn(old, instOf(old, 'h'), 'foe');
    assert.ok(oldPlayed.state.piles.hero.discard.includes(instOf(old, 'h')));
});

test('消耗他牌（G12）：随机消耗抽牌堆的牌；从手牌选牌消耗', () => {
    const x = def('x', 'skill', [{ op: 'exhaust-other', amount: 1, from: 'draw', mode: 'random' }], { innate: true });
    const state = startDeck({ x, k: GUARD }, ['x', ...Array(9).fill('k')]);
    const self = instOf(state, 'x');
    const before = state.piles.hero.draw.length;
    const played = playIn(state, self);
    assert.equal(played.state.piles.hero.draw.length, before - 1);
    assert.equal(played.state.piles.hero.exhaust.length, 1);
    assert.notEqual(played.state.piles.hero.exhaust[0], self);
    const y = def('y', 'skill', [{ op: 'exhaust-other', amount: 1, from: 'hand', mode: 'choose' }], { innate: true });
    const deck = startDeck({ y, k: GUARD }, ['y', ...Array(9).fill('k')]);
    const pending = playIn(deck, instOf(deck, 'y'));
    assert.equal(pending.state.pending.kind, 'exhaust-other');
    const pick = pending.state.pending.options[0];
    assert.ok(choose(pending.state, [pick]).state.piles.hero.exhaust.includes(pick));
});

test('延迟复制（G13）：下回合开始把本牌的临时副本加入手牌', () => {
    const n = def('n', 'skill', [{ op: 'copy-next', amount: 1, from: 'self' }, { op: 'block', amount: 1, target: 'self' }], { innate: true });
    const state = startDeck({ n, k: GUARD }, ['n', ...Array(9).fill('k')]);
    const played = playIn(state, instOf(state, 'n'));
    assert.equal(played.state.units.hero.res.copyNext.length, 1);
    const next = endTurn(played.state).state;
    const copies = next.piles.hero.hand.filter((inst) => next.cards[inst].cardId === 'n' && next.cards[inst].temp);
    assert.equal(copies.length, 1);
    assert.equal(next.units.hero.res, undefined);
});

test('三选一造牌（G14）：从卡组三张不同的牌中挑一张作为临时牌入手', () => {
    const d = def('d', 'skill', [{ op: 'discover' }], { innate: true });
    const e = def('e', 'skill', [{ op: 'draw', amount: 1 }]);
    const state = startDeck({ d, a: ATTACK, k: GUARD, e }, ['d', ...Array(3).fill('a'), ...Array(3).fill('k'), ...Array(3).fill('e')]);
    const played = playIn(state, instOf(state, 'd'));
    const event = played.events.find((ev) => ev.type === 'discover');
    assert.equal(event.options.length, 3);
    assert.equal(new Set(event.options).size, 3);
    assert.ok(event.options.includes(event.cardId));
    const made = played.events.find((ev) => ev.type === 'card-created');
    assert.equal(made.cardId, event.cardId);
    assert.ok(played.state.piles.hero.hand.includes(made.inst));
    assert.equal(played.state.cards[made.inst].temp, true);
});

test('本场变形与临时升级（G15）：手牌变成卡组里的另一张牌；手牌与本牌本场升级', () => {
    const m = def('m', 'skill', [{ op: 'transmute', amount: 1, mode: 'random' }], { innate: true });
    const state = startDeck({ m, a: ATTACK, k: GUARD }, ['m', ...Array(9).fill('a')]);
    const shaped = playIn(state, instOf(state, 'm'));
    const change = shaped.events.find((e) => e.type === 'transform');
    assert.equal(change.from, 'a');
    assert.notEqual(change.cardId, 'a');
    assert.equal(shaped.state.cards[change.inst].cardId, change.cardId);
    const u = def('u', 'skill', [{ op: 'upgrade-card', amount: 1, mode: 'random' }], { innate: true });
    const deck = startDeck({ u, a: ATTACK }, ['u', ...Array(9).fill('a')]);
    const upgraded = playIn(deck, instOf(deck, 'u'));
    const target = upgraded.events.find((e) => e.type === 'upgrade-card').inst;
    assert.equal(upgraded.state.cards[target].upgraded, true);
    assert.equal(cardView(upgraded.state, target).effects[0].amount, 6);
    const g = def('g', 'attack', [{ op: 'damage', amount: 2, target: 'enemy' }, { op: 'upgrade-card', amount: 1, mode: 'self' }], { innate: true, upgraded: { effects: [{ op: 'damage', amount: 5, target: 'enemy' }] } });
    const selfDeck = startDeck({ g, k: GUARD }, ['g', ...Array(9).fill('k')]);
    const inst = instOf(selfDeck, 'g');
    assert.equal(playIn(selfDeck, inst, 'foe').state.cards[inst].upgraded, true);
});

test('规则 v5 P2b 模板：可反解且通过校验、归入牌堆族、牌面有说明，所有职业可用', () => {
    for (const key of ['scout', 'hunt', 'salvage', 'exhume', 'stack', 'boomerang', 'rebound', 'purify', 'cinder', 'reprise', 'glimpse', 'morph', 'refine', 'polish']) {
        const found = firstSolved(key);
        assert.ok(found, key);
        const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
        assert.equal(checked.ok, true, `${key} ${JSON.stringify(checked.errors)}`);
        assert.equal(templateFamily(key), 'pile');
        assert.ok(describeEffects(found.solved.effects).length > 0, key);
        for (const archetype of Object.keys(ARCHETYPE_FAMILIES)) assert.ok(templateAllowedFor(key, archetype), `${key} ${archetype}`);
    }
    assert.equal(solveCardTemplate('exhume', 1, 'rare'), null);
});

// ---------- 规则 v5 P2c：关键字与能量（G16–G19） ----------
const heroWith = (extra, catalog = { k: GUARD }, deck = Array(10).fill('k')) => {
    const created = createBattle({ controlledId: 'hero', canEscape: true, units: [hero({}, { deck, catalog, ...extra }), foe({})] }, 7);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    return created.state;
};
function solvedAny(key) {
    for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'mythic']) {
        for (const cost of [0, 1, 2, 3, 'X']) {
            const solved = solveCardTemplate(key, cost, rarity);
            if (solved) return { solved, rarity, cost };
        }
    }
    return null;
}

test('重演计价（G16）：重演按效果价值加价；打出时整张多执行一次，只付一次费、只计一次出牌，牌面写明', async () => {
    const { estimateCardValue } = await import('../src/combat/rules.js');
    const { describeKeywords } = await import('../src/visual/igs-ui/combat-card-art.js');
    const base = { type: 'attack', cost: 1, rarity: 'rare', effects: [{ op: 'damage', amount: 5, hits: 1, target: 'enemy' }] };
    assert.ok(estimateCardValue({ ...base, replay: 1 }) > estimateCardValue(base) * 1.5);
    const r = def('r', 'attack', [{ op: 'damage', amount: 5, target: 'enemy' }], { innate: true, replay: 1 });
    const state = startDeck({ r, k: GUARD }, ['r', ...Array(9).fill('k')]);
    const played = playIn(state, instOf(state, 'r'), 'foe');
    assert.equal(played.state.units.foe.hp, 20);
    assert.equal(played.state.units.hero.energy, 2);
    assert.equal(played.events.filter((e) => e.type === 'card').length, 1);
    assert.ok(describeKeywords(r).includes('重演 1'));
});

test('狡黠（G17）：被效果弃掉时免费打出并写进战报；回合末自然弃牌不触发；规则 v4 不触发', () => {
    const g = def('g', 'attack', [{ op: 'damage', amount: 4, target: 'enemy' }], { sly: true });
    const d = def('d', 'skill', [{ op: 'discard', amount: 1, mode: 'random' }], { innate: true });
    const state = startDeck({ d, g }, ['d', ...Array(9).fill('g')]);
    const played = playIn(state, instOf(state, 'd'));
    assert.equal(played.state.units.foe.hp, 26);
    assert.equal(played.state.units.hero.energy, 2);
    assert.equal(played.events.filter((e) => e.type === 'sly').length, 1);
    const action = collectTurns(played.events, played.state.units).flatMap((t) => t.actions).find((a) => a.actorId === 'hero');
    assert.ok(action.targets.get('hero').notes.includes('被弃掉的狡黠牌随即打出'));
    assert.equal(endTurn(played.state).events.filter((e) => e.type === 'sly').length, 0);
    const old = startDeck({ d, g }, ['d', ...Array(9).fill('g')], 4);
    assert.equal(playIn(old, instOf(old, 'd')).state.units.foe.hp, 30);
});

test('免费出牌（G18）：下一张攻击牌 0 费且只用一次；每回合前 N 张牌免费', () => {
    const f = def('f', 'skill', [{ op: 'free-next', amount: 1, cardType: 'attack' }], { innate: true });
    const state = startDeck({ f, a: ATTACK }, ['f', ...Array(9).fill('a')]);
    const armed = playIn(state, instOf(state, 'f'));
    const attack = instOf(armed.state, 'a');
    assert.equal(cardView(armed.state, attack).cost, 0);
    assert.equal(cardView(armed.state, attack).baseCost, 1);
    const freed = playIn(armed.state, attack, 'foe');
    assert.equal(freed.state.units.hero.energy, 2);
    assert.equal(cardView(freed.state, instOf(freed.state, 'a')).cost, 1);
    assert.equal(freed.state.units.hero.res, undefined);
    const turn = heroWith(selfStatus('freeplay', 1), { a: ATTACK }, Array(10).fill('a'));
    const first = playIn(turn, turn.piles.hero.hand[0], 'foe');
    assert.equal(first.state.units.hero.energy, 3);
    assert.equal(playIn(first.state, first.state.piles.hero.hand[0], 'foe').state.units.hero.energy, 2);
});

test('能量扩展（G19）：每回合额外能量、未用完的能量留到下回合、能量翻倍、X 费抽牌', () => {
    assert.equal(endTurn(heroWith({})).state.units.hero.energy, 3);
    assert.equal(endTurn(heroWith(selfStatus('dynamo', 1))).state.units.hero.energy, 4);
    assert.equal(endTurn(heroWith(selfStatus('conserve', 1))).state.units.hero.energy, 6);
    const x = def('x', 'skill', [{ op: 'energy-double' }], { innate: true });
    const dbl = heroWith({}, { x, k: GUARD }, ['x', ...Array(9).fill('k')]);
    assert.equal(playIn(dbl, instOf(dbl, 'x')).state.units.hero.energy, 4);
    const xd = def('xd', 'skill', [{ op: 'draw', amount: 1 }], { innate: true, cost: 'X' });
    const many = heroWith({}, { xd, k: GUARD }, ['xd', ...Array(14).fill('k')]);
    const drawn = playIn(many, instOf(many, 'xd'));
    assert.equal(drawn.state.piles.hero.hand.length, 7);
    assert.equal(drawn.state.units.hero.energy, 0);
});

test('规则 v5 P2c 模板：可反解且通过校验、归入通用族；重演与狡黠写进牌面关键字', async () => {
    const { describeKeywords } = await import('../src/visual/igs-ui/combat-card-art.js');
    for (const key of ['reverb', 'resound', 'gambit', 'feint', 'quickdraw', 'flow', 'generator', 'hoard', 'overcharge', 'xdraw', 'xforge']) {
        const found = solvedAny(key);
        assert.ok(found, key);
        const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
        assert.equal(checked.ok, true, `${key} ${JSON.stringify(checked.errors)}`);
        assert.equal(templateFamily(key), 'general');
    }
    assert.ok(describeKeywords(solvedAny('reverb').solved).includes('重演'));
    assert.ok(describeKeywords(solvedAny('gambit').solved).includes('狡黠'));
    assert.equal(solveCardTemplate('flow', 1, 'epic'), null);
    assert.equal(solvedAny('xdraw').cost, 'X');
});



// ---------- 规则 v5 P2d：触发、条件、状态牌（G20、G22、G23、L06） ----------
const passiveOn = (trigger, effects) => ({ id: `p-${trigger}`, trigger, effects });
const duel = ({ heroExtra = {}, catalog = { k: GUARD }, deck = Array(10).fill('k'), foeSkill = {}, foeExtra = {}, rulesVersion } = {}) => {
    const setup = { controlledId: 'hero', canEscape: true, units: [hero({}, { deck, catalog, ...heroExtra }), foe(foeSkill, foeExtra)], ...(rulesVersion ? { rulesVersion } : {}) };
    const created = createBattle(setup, 7);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    return created.state;
};
const STRENGTH_UP = [{ op: 'status', status: 'strength', stacks: 1, target: 'self' }];
const BLOCK_UP = [{ op: 'block', amount: 3, target: 'self' }];

test('新触发时机（G20）：抽牌后、生成临时牌后、使敌人陷入减益后、格挡被打破时；对方塞入的牌不算生成；规则 v4 不触发', () => {
    assert.equal(duel({ heroExtra: { passives: [passiveOn('draw', BLOCK_UP)] } }).units.hero.block, 3);
    assert.equal(duel({ heroExtra: { passives: [passiveOn('draw', BLOCK_UP)] }, rulesVersion: 4 }).units.hero.block, 0);

    const forge = def('f', 'skill', [{ op: 'create', card: 'token-shard', amount: 1, to: 'hand' }], { innate: true });
    const made = duel({ heroExtra: { passives: [passiveOn('create', STRENGTH_UP)] }, catalog: { f: forge, k: GUARD }, deck: ['f', ...Array(9).fill('k')] });
    assert.equal(playIn(made, instOf(made, 'f')).state.units.hero.statuses.strength, 1);
    const stuffed = endTurn(duel({ heroExtra: { passives: [passiveOn('create', STRENGTH_UP)] }, foeSkill: { intent: 'debuff', effects: [{ op: 'create', card: 'status-slime', amount: 1, to: 'discard' }] } })).state;
    assert.ok(!stuffed.units.hero.statuses.strength);
    assert.ok(Object.values(stuffed.cards).some((entry) => entry.owner === 'hero' && entry.cardId === 'status-slime'));

    const weak = def('w', 'skill', [{ op: 'status', status: 'weak', stacks: 1, target: 'enemy' }], { innate: true });
    const hex = { heroExtra: { passives: [passiveOn('debuff-applied', BLOCK_UP)] }, catalog: { w: weak, k: GUARD }, deck: ['w', ...Array(9).fill('k')] };
    const cursed = duel(hex);
    assert.equal(playIn(cursed, instOf(cursed, 'w'), 'foe').state.units.hero.block, 3);
    const warded = duel({ ...hex, foeExtra: { passives: [{ id: 'pa', trigger: 'battle-start', effects: [{ op: 'status', status: 'artifact', stacks: 1, target: 'self' }] }] } });
    assert.equal(playIn(warded, instOf(warded, 'w'), 'foe').state.units.hero.block, 0);

    const guarded = { heroExtra: { passives: [passiveOn('block-broken', STRENGTH_UP)] }, foeSkill: foeAttack(5) };
    const shielded = duel(guarded);
    assert.equal(endTurn(playIn(shielded, shielded.piles.hero.hand[0]).state).state.units.hero.statuses.strength, 1);
    assert.ok(!endTurn(duel(guarded)).state.units.hero.statuses.strength);
});

test('条件扩充（G22）：目标意图为攻击、目标生命低于百分比、手牌数、本场已消耗数；牌面写明；意图条件不收数值', async () => {
    const { conditionHolds } = await import('../src/combat/battle-state.js');
    const holds = (state, when) => conditionHolds(state, state.units.hero, when, 'foe');
    assert.equal(holds(duel({ foeSkill: foeAttack(3) }), { kind: 'target-intent-attack' }), true);
    const calm = structuredClone(duel());
    assert.equal(holds(calm, { kind: 'target-intent-attack' }), false);
    assert.equal(holds(calm, { kind: 'target-hp-below', value: 50 }), false);
    calm.units.foe.hp = 14;
    assert.equal(holds(calm, { kind: 'target-hp-below', value: 50 }), true);
    const size = calm.piles.hero.hand.length;
    assert.equal(holds(calm, { kind: 'hand-gte', value: size }), true);
    assert.equal(holds(calm, { kind: 'hand-gte', value: size + 1 }), false);
    calm.piles.hero.exhaust.push(...calm.piles.hero.hand.slice(0, 2));
    assert.equal(holds(calm, { kind: 'exhausted-gte', value: 2 }), true);
    assert.equal(holds(calm, { kind: 'exhausted-gte', value: 3 }), false);

    assert.ok(describeEffects([{ op: 'conditional', when: { kind: 'target-intent-attack' }, then: [{ op: 'damage', amount: 3, target: 'enemy' }] }]).includes('目标意图为攻击时'));
    assert.ok(describeEffects([{ op: 'conditional', when: { kind: 'exhausted-gte', value: 3 }, then: [{ op: 'block', amount: 3, target: 'self' }] }]).includes('本场已消耗 3 张牌时'));
    for (const key of ['interrupt', 'coup', 'brim', 'ashen', 'linger']) {
        const found = solvedAny(key);
        assert.ok(found, key);
        const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
        assert.equal(checked.ok, true, `${key} ${JSON.stringify(checked.errors)}`);
        assert.equal(templateFamily(key), 'general');
    }
    const bad = structuredClone(solvedAny('interrupt'));
    bad.solved.effects[1].when.value = 1;
    assert.equal(normalizeCard({ id: 'x', name: '牌', cost: bad.cost, rarity: bad.rarity, ...bad.solved }).ok, false);
});

test('状态牌（G23）：灼痕回合末在手受伤、空洞抽到失去能量、痛楚在手每出一张失去生命、黏浊付 1 费打出后消耗；牌面写明；规则 v4 不结算', async () => {
    const { TOKEN_CARDS } = await import('../src/combat/rules.js');
    const { describeKeywords } = await import('../src/visual/igs-ui/combat-card-art.js');
    const maker = (card, to = 'hand', more = []) => def('m', 'skill', [{ op: 'create', card, amount: 1, to }, ...more], { innate: true });

    const burnt = (rv) => {
        const s = startDeck({ m: maker('status-burn'), k: GUARD }, ['m', ...Array(9).fill('k')], rv);
        return endTurn(playIn(s, instOf(s, 'm')).state).state.units.hero.hp;
    };
    assert.equal(burnt(), 28);
    assert.equal(burnt(4), 30);

    const drained = (rv) => {
        const s = startDeck({ m: maker('status-void', 'draw', [{ op: 'draw', amount: 2 }]), k: GUARD }, ['m', 'k', 'k', 'k', 'k', 'k'], rv);
        return playIn(s, instOf(s, 'm')).state.units.hero.energy;
    };
    assert.equal(drained(), 1);
    assert.equal(drained(4), 2);

    const pained = startDeck({ m: maker('status-pain'), k: GUARD }, ['m', ...Array(9).fill('k')]);
    const hurt = playIn(pained, instOf(pained, 'm'));
    assert.equal(hurt.state.units.hero.hp, 29);
    assert.equal(playIn(hurt.state, instOf(hurt.state, 'k')).state.units.hero.hp, 28);

    const slimy = startDeck({ m: maker('status-slime'), k: GUARD }, ['m', ...Array(9).fill('k')]);
    const slimed = playIn(slimy, instOf(slimy, 'm')).state;
    const slime = instOf(slimed, 'status-slime');
    assert.ok(slime);
    const cleared = playIn(slimed, slime).state;
    assert.equal(cleared.units.hero.energy, 1);
    assert.ok(cleared.piles.hero.exhaust.includes(slime));

    assert.ok(describeKeywords(TOKEN_CARDS['status-burn']).includes('回合结束时在手牌中'));
    assert.ok(describeKeywords(TOKEN_CARDS['status-pain']).includes('每打出一张牌失去 1 点生命'));
});

test('回合结束多保留手牌（L06）：多留 N 张、用后清掉；规则 v4 不保留；人物特性池有保留字段与新触发时机', () => {
    const r = def('r', 'skill', [{ op: 'retain-hand', amount: 1 }], { innate: true });
    const nextHand = (rv) => {
        const s = startDeck({ r, a: ATTACK, k: GUARD }, ['r', 'a', 'k', 'k', 'k', 'k', 'k', 'k', 'k', 'k'], rv);
        return endTurn(playIn(s, instOf(s, 'r')).state).state;
    };
    const v5 = nextHand();
    const v4 = nextHand(4);
    assert.equal(v5.piles.hero.hand.length, v4.piles.hero.hand.length + 1);
    assert.equal(v5.units.hero.res, undefined);

    const pool = traitPool('rare');
    assert.ok(pool.some((shape) => shape.kind === 'passive' && shape.field === 'retain'));
    for (const trigger of ['draw', 'create', 'debuff-applied', 'block-broken']) assert.ok(pool.some((shape) => shape.trigger === trigger), trigger);
});
