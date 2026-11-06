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


// ---------- 规则 v5 P2e：永久成长与击杀奖励（G24、G25） ----------
const growthOf = (state) => state.units.hero.res?.battleGrowth;

test('永久成长（G24）：打出后按卡牌 ID 记本场成长，重演只算一次，临时副本不成长；规则 v4 不记', () => {
    const w = def('w', 'attack', [{ op: 'damage', amount: 1, target: 'enemy' }, { op: 'evolve', stat: 'damage', amount: 2 }], { innate: true });
    const grown = (card, rv) => {
        const s = startDeck({ w: card, k: GUARD }, ['w', ...Array(9).fill('k')], rv);
        return playIn(s, instOf(s, 'w'), 'foe');
    };
    const once = grown(w);
    assert.deepEqual(growthOf(once.state), { cards: { w: { damage: 2, block: 0 } }, hpMax: 0 });
    assert.ok(once.events.some((e) => e.type === 'battle-growth' && e.cardId === 'w' && e.stat === 'damage' && e.amount === 2));
    assert.equal(growthOf(grown({ ...w, replay: 1 }).state).cards.w.damage, 2);
    assert.equal(grown(w, 4).state.units.hero.res, undefined);

    const copier = { ...w, effects: [...w.effects, { op: 'copy', amount: 1, from: 'self', to: 'hand' }] };
    const first = grown(copier).state;
    const copy = instOf(first, 'w');
    assert.ok(copy && first.cards[copy].temp);
    assert.equal(growthOf(playIn(first, copy, 'foe').state).cards.w.damage, 2);
});

test('击杀奖励（G25）：本牌击倒非爪牙敌人才发奖；其他牌击倒、爪牙、规则 v4 不发；本场升级只改本牌', () => {
    const t = def('t', 'attack', [{ op: 'damage', amount: 40, target: 'enemy' }, { op: 'bounty', reward: 'hp-max', amount: 3 }], { innate: true });
    const plain = def('a', 'attack', [{ op: 'damage', amount: 40, target: 'enemy' }], { innate: true });
    const fight = (catalog, deck, rv) => startDeck({ ...catalog, k: GUARD }, [...deck, ...Array(10 - deck.length).fill('k')], rv);

    const won = playIn(fight({ t }, ['t']), instOf(fight({ t }, ['t']), 't'), 'foe').state;
    assert.equal(won.outcome, 'victory');
    assert.equal(growthOf(won).hpMax, 3);

    const both = fight({ t, a: plain }, ['t', 'a']);
    assert.equal(growthOf(playIn(both, instOf(both, 'a'), 'foe').state), undefined);

    const minion = structuredClone(fight({ t }, ['t']));
    minion.units.foe.minion = true;
    assert.equal(growthOf(playIn(minion, instOf(minion, 't'), 'foe').state), undefined);

    const old = fight({ t }, ['t'], 4);
    assert.equal(playIn(old, instOf(old, 't'), 'foe').state.units.hero.res, undefined);

    const u = def('u', 'attack', [{ op: 'damage', amount: 40, target: 'enemy' }, { op: 'bounty', reward: 'upgrade' }], { innate: true, upgraded: { effects: [{ op: 'damage', amount: 45, target: 'enemy' }] } });
    const up = fight({ u }, ['u']);
    const inst = instOf(up, 'u');
    const after = playIn(up, inst, 'foe').state;
    assert.equal(after.cards[inst].upgraded, true);
    assert.equal(growthOf(after), undefined);
});

test('永久成长与击杀奖励模板：可反解、通用族、不作人物技能；牌面写明；嵌套在条件里拒收', () => {
    for (const key of ['whetstone', 'carapace', 'trophy']) {
        const found = solvedAny(key);
        assert.ok(found, key);
        const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
        assert.equal(checked.ok, true, `${key} ${JSON.stringify(checked.errors)}`);
        assert.equal(templateFamily(key), 'general');
        assert.equal(heroSkillFromTemplate(key, { id: 'h', name: '技' }), null);
    }
    assert.ok(describeEffects([{ op: 'evolve', stat: 'block', amount: 2 }]).includes('格挡永久 +2'));
    assert.ok(describeEffects([{ op: 'bounty', reward: 'hp-max', amount: 3 }]).includes('最大生命永久 +3'));
    const nested = { id: 'x', name: '牌', type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 3, target: 'enemy' }, { op: 'conditional', when: { kind: 'hand-gte', value: 2 }, then: [{ op: 'evolve', stat: 'damage', amount: 1 }] }] };
    assert.equal(normalizeCard(nested).ok, false);
});


// ---------- 规则 v5 P3 守护「壁垒」（D01–D09） ----------
const wallCard = (id, effects) => def(id, 'skill', effects, { innate: true });
const wallStatus = (status, stacks) => ({ op: 'apply-status', status, stacks, target: 'self' });
const wallBlock = (amount) => ({ op: 'block', amount, target: 'self' });
const mateOf = (extra = {}) => ({
    id: 'mate', name: '队友', side: 'ally', kind: 'skill', maxHp: 20,
    skills: [{ id: 'rest', name: '歇', intent: 'heal', effects: [{ op: 'heal', amount: 1, target: 'self' }], weight: 1, cooldown: 0 }], ...extra,
});
const wall = (card, { foeSkill = foeAttack(6), mate, rulesVersion } = {}) => {
    const units = [hero({}, { deck: [card.id, ...Array(9).fill('k')], catalog: { [card.id]: card, k: GUARD } }), ...(mate ? [mate] : []), foe(foeSkill)];
    const created = createBattle({ controlledId: 'hero', canEscape: true, units, ...(rulesVersion ? { rulesVersion } : {}) }, 7);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    return created.state;
};
const wallPlay = (card, options) => {
    const s = wall(card, options);
    return playIn(s, instOf(s, card.id));
};

test('固守（D01）：固守本场不清格挡；固守回合按层数保住格挡后照常清空；规则 v4 照常清空', () => {
    const hold = wallCard('h', [wallStatus('barricade', 1), wallBlock(10)]);
    let s = endTurn(wallPlay(hold, { foeSkill: {} }).state).state;
    assert.equal(s.units.hero.block, 10);
    s = endTurn(s).state;
    assert.equal(s.units.hero.block, 10);
    assert.equal(endTurn(wallPlay(hold, { foeSkill: {}, rulesVersion: 4 }).state).state.units.hero.block, 0);

    const brace = wallCard('r', [wallStatus('retain-block', 2), wallBlock(10)]);
    let t = endTurn(wallPlay(brace, { foeSkill: {} }).state).state;
    assert.deepEqual([t.units.hero.block, t.units.hero.statuses['retain-block']], [10, 1]);
    t = endTurn(t).state;
    assert.deepEqual([t.units.hero.block, t.units.hero.statuses['retain-block']], [10, undefined]);
    assert.equal(endTurn(t).state.units.hero.block, 0);
});

test('格挡倍增（D02）：本回合前两次获得格挡翻倍，第三次照常；回合结束清掉；已有格挡翻倍照旧；规则 v4 不翻', () => {
    const surge = wallCard('s', [wallStatus('block-surge', 2), wallBlock(5), wallBlock(5), wallBlock(5)]);
    const played = wallPlay(surge, { foeSkill: {} });
    assert.equal(played.state.units.hero.block, 25);
    assert.equal(played.events.filter((e) => e.type === 'block' && e.surge).length, 2);
    assert.equal(wallPlay(surge, { foeSkill: {}, rulesVersion: 4 }).state.units.hero.block, 15);
    const left = wallPlay(wallCard('o', [wallStatus('block-surge', 2), wallBlock(5)]), { foeSkill: {} }).state;
    assert.equal(left.units.hero.statuses['block-surge'], 1);
    assert.equal(endTurn(left).state.units.hero.statuses['block-surge'], undefined);
    const doubled = wallCard('d', [wallBlock(5), { op: 'double', stat: 'block', target: 'self' }]);
    assert.equal(wallPlay(doubled, { foeSkill: {} }).state.units.hero.block, 10);
});

test('甲层（D03）：回合结束获得等于层数的格挡；未挡住的攻击伤害减 1 层，完全挡住不减；规则 v4 无效', () => {
    const plate = wallCard('p', [wallStatus('plated', 4)]);
    const hard = endTurn(wallPlay(plate, { foeSkill: foeAttack(6) }).state).state;
    assert.deepEqual([hard.units.hero.hp, hard.units.hero.statuses.plated], [28, 3]);
    const soft = endTurn(wallPlay(plate, { foeSkill: foeAttack(3) }).state).state;
    assert.deepEqual([soft.units.hero.hp, soft.units.hero.statuses.plated], [30, 4]);
    assert.equal(endTurn(wallPlay(plate, { foeSkill: foeAttack(6), rulesVersion: 4 }).state).state.units.hero.hp, 24);
});

test('反震（D04）：被格挡掉的攻击伤害反射给攻击者，到自身下回合开始失效；规则 v4 不反射', () => {
    const rebuke = wallCard('r', [wallStatus('recoil', 1), wallBlock(10)]);
    const after = endTurn(wallPlay(rebuke).state).state;
    assert.deepEqual([after.units.hero.hp, after.units.foe.hp, after.units.hero.statuses.recoil], [30, 24, undefined]);
    assert.equal(endTurn(wallPlay(rebuke, { rulesVersion: 4 }).state).state.units.foe.hp, 30);
});

test('临时荆棘（D05）：到自身下回合开始前每次受击反伤等于层数，之后失效；规则 v4 不反伤', () => {
    const twin = { intent: 'attack', effects: [{ op: 'damage', amount: 2, hits: 2, target: 'enemy' }] };
    const card = wallCard('b', [wallStatus('bramble', 3)]);
    const after = endTurn(wallPlay(card, { foeSkill: twin }).state).state;
    assert.deepEqual([after.units.hero.hp, after.units.foe.hp, after.units.hero.statuses.bramble], [26, 24, undefined]);
    assert.equal(endTurn(wallPlay(card, { foeSkill: twin, rulesVersion: 4 }).state).state.units.foe.hp, 30);
});

test('坚壁反击（D06）：每次获得格挡对随机敌人造成等于层数的伤害；规则 v4 不触发', () => {
    const card = wallCard('j', [wallStatus('juggernaut', 3), wallBlock(5), wallBlock(5)]);
    assert.equal(wallPlay(card, { foeSkill: foeAttack(1) }).state.units.foe.hp, 24);
    assert.equal(wallPlay(card, { foeSkill: foeAttack(1), rulesVersion: 4 }).state.units.foe.hp, 30);
});

test('掩护（D07）：敌方指向队友的单体攻击改由掩护者承受；全体攻击不改；到自身下回合开始失效；规则 v4 不改', () => {
    const card = wallCard('c', [wallStatus('cover', 1)]);
    const covered = endTurn(wallPlay(card, { mate: mateOf() }).state);
    assert.deepEqual([covered.state.units.hero.hp, covered.state.units.mate.hp], [24, 20]);
    assert.ok(covered.events.some((e) => e.type === 'cover' && e.unitId === 'hero' && e.target === 'mate'));
    assert.equal(covered.state.units.hero.statuses.cover, undefined);
    const old = endTurn(wallPlay(card, { mate: mateOf(), rulesVersion: 4 }).state).state;
    assert.deepEqual([old.units.hero.hp, old.units.mate.hp], [30, 14]);
    const sweep = { intent: 'attack', effects: [{ op: 'damage', amount: 6, target: 'all-enemies' }] };
    const area = endTurn(wallPlay(card, { mate: mateOf(), foeSkill: sweep }).state).state;
    assert.deepEqual([area.units.hero.hp, area.units.mate.hp], [24, 14]);
});

test('共盾（D08）：获得格挡时其余队友获得一半（向下取整）；分出的格挡不再回分；规则 v4 不分', () => {
    const card = wallCard('f', [wallStatus('share-block', 1), wallBlock(11)]);
    const shared = wallPlay(card, { mate: mateOf() }).state;
    assert.deepEqual([shared.units.hero.block, shared.units.mate.block], [11, 5]);
    const mutual = mateOf({ passives: [{ id: 'p-share', trigger: 'battle-start', effects: [wallStatus('share-block', 1)] }] });
    const both = wallPlay(card, { mate: mutual }).state;
    assert.deepEqual([both.units.hero.block, both.units.mate.block], [11, 5]);
    assert.equal(wallPlay(card, { mate: mateOf(), rulesVersion: 4 }).state.units.mate.block, 0);
});

test('守护壁垒模板（D01–D09）：可反解、只给守护；固守限史诗以上；牌面写明状态名；延迟反击 lure 守护可用', () => {
    for (const key of ['barricade', 'hunker', 'redouble', 'armor-plate', 'rebuke', 'bramble', 'juggernaut', 'bodyguard', 'phalanx']) {
        const found = solvedAny(key);
        assert.ok(found, key);
        const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
        assert.equal(checked.ok, true, `${key} ${JSON.stringify(checked.errors)}`);
        assert.equal(templateFamily(key), 'rampart');
        assert.equal(templateAllowedFor(key, 'guardian'), true, key);
        for (const other of ['warrior', 'priest', 'summoner']) assert.equal(templateAllowedFor(key, other), false, `${key}:${other}`);
    }
    for (const rarity of ['common', 'uncommon', 'rare']) for (const cost of [0, 1, 2, 3]) assert.equal(solveCardTemplate('barricade', cost, rarity), null, `${rarity}:${cost}`);
    assert.ok(describeEffects([wallStatus('plated', 4)]).includes('甲层'));
    assert.equal(templateAllowedFor('lure', 'guardian'), true);
});


// ---------- 规则 v5 P3 战士「锻刃」（W01–W06） ----------
const bladeOf = (state) => state.piles.hero.hand.find((inst) => state.cards[inst].cardId === 'forge-blade');
const selfStr = (stacks) => ({ op: 'status', status: 'strength', stacks, target: 'self' });

test('攻击力翻倍与倍率重击（W01）：攻击力翻倍、攻击力加成 ×3；模板归战士', () => {
    const doubled = def('d', 'skill', [selfStr(2), { op: 'double', stat: 'strength', target: 'self' }], { innate: true });
    const s = startDeck({ d: doubled, k: GUARD }, ['d', ...Array(9).fill('k')]);
    assert.equal(playIn(s, instOf(s, 'd')).state.units.hero.statuses.strength, 4);
    const heavy = def('h', 'attack', [selfStr(2), { op: 'damage', amount: 5, target: 'enemy', strengthScale: 3 }], { innate: true });
    const t = startDeck({ h: heavy, k: GUARD }, ['h', ...Array(9).fill('k')]);
    assert.equal(playIn(t, instOf(t, 'h'), 'foe').state.units.foe.hp, 19);
    for (const key of ['overdrive', 'heavy-blade', 'tear']) assert.equal(templateAllowedFor(key, 'warrior'), true, key);
});

test('战意（W02）与血祭（W03）：每回合开始获得攻击力；本回合失去生命时获得攻击力', () => {
    const war = def('w', 'power', [{ op: 'each-turn', then: [selfStr(1)] }], { innate: true });
    const s = startDeck({ w: war, k: GUARD }, ['w', ...Array(9).fill('k')]);
    assert.equal(endTurn(playIn(s, instOf(s, 'w')).state).state.units.hero.statuses.strength, 1);
    const oath = def('o', 'skill', [{ op: 'buff', trigger: 'hp-loss', turns: 1, then: [selfStr(2)] }, { op: 'self-damage', amount: 3 }], { innate: true });
    const t = startDeck({ o: oath, k: GUARD }, ['o', ...Array(9).fill('k')]);
    const after = playIn(t, instOf(t, 'o')).state;
    assert.deepEqual([after.units.hero.hp, after.units.hero.statuses.strength], [27, 2]);
});

test('焚身与余烬（W04）：技能牌 0 费且打出后消耗；消耗非能力牌获得格挡；规则 v4 不生效', () => {
    const pyre = def('p', 'power', [{ op: 'apply-status', status: 'pyre', stacks: 1, target: 'self' }], { innate: true });
    const run = (rv) => {
        const s = startDeck({ p: pyre, k: GUARD }, ['p', ...Array(9).fill('k')], rv);
        const lit = playIn(s, instOf(s, 'p')).state;
        const k = instOf(lit, 'k');
        const done = playIn(lit, k).state;
        return { energy: done.units.hero.energy, exhausted: done.piles.hero.exhaust.includes(k) };
    };
    assert.deepEqual(run(), { energy: 2, exhausted: true });
    assert.deepEqual(run(4), { energy: 1, exhausted: false });

    const ember = def('e', 'power', [{ op: 'apply-status', status: 'ember', stacks: 3, target: 'self' }], { innate: true });
    const burn = def('x', 'skill', [{ op: 'block', amount: 1, target: 'self' }, { op: 'exhaust-self' }], { innate: true });
    const s = startDeck({ e: ember, x: burn, k: GUARD }, ['e', 'x', ...Array(8).fill('k')]);
    const lit = playIn(s, instOf(s, 'e')).state;
    assert.equal(lit.units.hero.block, 0);
    assert.equal(playIn(lit, instOf(lit, 'x')).state.units.hero.block, 4);
});

test('锻刃（W05）：首次锻造把锻刃加入手牌，再锻造只加数值；三种强化改写锻刃；锻刃保留；规则 v4 不锻造', () => {
    const smith = def('s', 'skill', [{ op: 'smith', amount: 3 }], { innate: true });
    const twice = startDeck({ s: smith, k: GUARD }, ['s', 's', ...Array(8).fill('k')]);
    const once = playIn(twice, instOf(twice, 's'));
    assert.ok(once.events.some((e) => e.type === 'forge' && e.damage === 13));
    const both = playIn(once.state, instOf(once.state, 's')).state;
    assert.equal(both.piles.hero.hand.filter((inst) => both.cards[inst].cardId === 'forge-blade').length, 1);
    const view = cardView(both, bladeOf(both));
    assert.deepEqual([view.cost, view.retain, view.effects[0].amount], [2, true, 16]);
    assert.ok(bladeOf(endTurn(both).state));

    const single = startDeck({ s: smith, k: GUARD }, ['s', ...Array(9).fill('k')]);
    const forged = playIn(single, instOf(single, 's')).state;
    assert.equal(playIn(forged, bladeOf(forged), 'foe').state.units.foe.hp, 17);

    const guard = def('g', 'skill', [{ op: 'hone-blade', mode: 'guard', amount: 5 }], { innate: true });
    const gs = startDeck({ g: guard, k: GUARD }, ['g', ...Array(9).fill('k')]);
    const honed = playIn(gs, instOf(gs, 'g')).state;
    const struck = playIn(honed, bladeOf(honed), 'foe').state;
    assert.deepEqual([struck.units.foe.hp, struck.units.hero.block], [20, 5]);
    for (const [mode, check] of [['aoe', (v) => v.effects[0].target === 'all-enemies'], ['replay', (v) => v.replay === 1]]) {
        const card = def('m', 'skill', [{ op: 'hone-blade', mode }], { innate: true });
        const ms = startDeck({ m: card, k: GUARD }, ['m', ...Array(9).fill('k')]);
        const done = playIn(ms, instOf(ms, 'm')).state;
        assert.ok(check(cardView(done, bladeOf(done))), mode);
    }
    const old = startDeck({ s: smith, k: GUARD }, ['s', ...Array(9).fill('k')], 4);
    assert.equal(bladeOf(playIn(old, instOf(old, 's')).state), undefined);
});

test('嗜血（W06）：本回合攻击牌按实际扣除的生命回复，非攻击牌不回复，回合结束清掉；规则 v4 不回复', () => {
    const thirst = def('b', 'skill', [{ op: 'apply-status', status: 'bloodthirst', stacks: 1, target: 'self' }, { op: 'self-damage', amount: 6 }], { innate: true });
    const zap = def('z', 'skill', [{ op: 'damage', amount: 2, target: 'enemy' }], { innate: true });
    const run = (rv) => {
        const s = startDeck({ b: thirst, a: { ...ATTACK, innate: true }, z: zap, k: GUARD }, ['b', 'a', 'z', ...Array(7).fill('k')], rv);
        let t = playIn(s, instOf(s, 'b')).state;
        t = playIn(t, instOf(t, 'a'), 'foe').state;
        const afterAttack = t.units.hero.hp;
        t = playIn(t, instOf(t, 'z'), 'foe').state;
        return { afterAttack, afterSkill: t.units.hero.hp, state: t };
    };
    const v5 = run();
    assert.deepEqual([v5.afterAttack, v5.afterSkill], [26, 26]);
    assert.equal(endTurn(v5.state).state.units.hero.statuses.bloodthirst, undefined);
    assert.equal(run(4).afterAttack, 24);
});

test('战士锻刃模板（W02–W06）：可反解、归属正确只给战士；焚身限史诗以上；牌面写明锻造', () => {
    const families = { warpath: 'fury', bloodoath: 'fury', pyre: 'blade', ember: 'blade', smith: 'blade', 'blade-sweep': 'blade', 'blade-echo': 'blade', 'blade-guard': 'blade', bloodthirst: 'blade' };
    for (const [key, family] of Object.entries(families)) {
        const found = solvedAny(key);
        assert.ok(found, key);
        const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
        assert.equal(checked.ok, true, `${key} ${JSON.stringify(checked.errors)}`);
        assert.equal(templateFamily(key), family, key);
        assert.equal(templateAllowedFor(key, 'warrior'), true, key);
        assert.equal(templateAllowedFor(key, 'guardian'), false, key);
    }
    for (const rarity of ['common', 'uncommon', 'rare']) for (const cost of [0, 1, 2, 3]) assert.equal(solveCardTemplate('pyre', cost, rarity), null, `${rarity}:${cost}`);
    assert.ok(describeEffects([{ op: 'smith', amount: 3 }]).includes('锻造 3'));
});


// ---------- 规则 v5 P3 刺客「毒与暗刃」（A01–A10） ----------
const foePoison = (stacks) => ({ op: 'status', status: 'poison', stacks, target: 'enemy' });
const shivsOf = (state) => state.piles.hero.hand.filter((inst) => state.cards[inst].cardId === 'shadow-shiv');
const twoFoes = (catalog, deck, rulesVersion) => {
    const units = [hero({}, { deck, catalog }), foe({}), foe({}, { id: 'foe2', name: '她二' })];
    const created = createBattle({ controlledId: 'hero', canEscape: true, units, ...(rulesVersion ? { rulesVersion } : {}) }, 7);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    return created.state;
};

test('毒额外结算（A01）：按当前中毒层数立即失去生命，层数不减；规则 v4 不结算', () => {
    const card = def('r', 'skill', [foePoison(4), { op: 'poison-tick', amount: 1, target: 'enemy' }], { innate: true });
    const run = (rv) => {
        const s = startDeck({ r: card, k: GUARD }, ['r', ...Array(9).fill('k')], rv);
        return playIn(s, instOf(s, 'r'), 'foe').state.units.foe;
    };
    assert.deepEqual([run().hp, run().statuses.poison], [26, 4]);
    assert.equal(run(4).hp, 30);
});

test('淬刃（A02）：每段未被格挡的攻击伤害施加中毒，完全格挡不施加；规则 v4 不施加', () => {
    const env = def('e', 'power', [{ op: 'apply-status', status: 'envenom', stacks: 2, target: 'self' }], { innate: true });
    const twin = def('t', 'attack', [{ op: 'damage', amount: 2, hits: 2, target: 'enemy' }], { innate: true });
    const lit = (rv) => {
        const s = startDeck({ e: env, t: twin, k: GUARD }, ['e', 't', ...Array(8).fill('k')], rv);
        return playIn(s, instOf(s, 'e')).state;
    };
    const hit = playIn(lit(), instOf(lit(), 't'), 'foe').state;
    assert.deepEqual([hit.units.foe.hp, hit.units.foe.statuses.poison], [26, 4]);
    const walled = structuredClone(lit());
    walled.units.foe.block = 10;
    assert.equal(playIn(walled, instOf(walled, 't'), 'foe').state.units.foe.statuses.poison, undefined);
    const old = lit(4);
    assert.equal(playIn(old, instOf(old, 't'), 'foe').state.units.foe.statuses.poison, undefined);
});

test('毒雾（A03）与毒爆（A04）：每回合开始全体敌人中毒；每施毒 3 次对全体敌人造成伤害；规则 v4 不爆', () => {
    const mist = def('m', 'power', [{ op: 'each-turn', then: [{ op: 'status', status: 'poison', stacks: 2, target: 'all-enemies' }] }], { innate: true });
    const s = startDeck({ m: mist, k: GUARD }, ['m', ...Array(9).fill('k')]);
    assert.equal(endTurn(playIn(s, instOf(s, 'm')).state).state.units.foe.statuses.poison, 2);

    const burst = def('b', 'power', [{ op: 'apply-status', status: 'venom-burst', stacks: 3, target: 'self' }], { innate: true });
    const thrice = def('p', 'skill', [foePoison(1), foePoison(1), foePoison(1)], { innate: true });
    const run = (rv) => {
        const t = startDeck({ b: burst, p: thrice, k: GUARD }, ['b', 'p', ...Array(8).fill('k')], rv);
        const lit = playIn(t, instOf(t, 'b')).state;
        return playIn(lit, instOf(lit, 'p'), 'foe');
    };
    const v5 = run();
    assert.deepEqual([v5.state.units.foe.hp, v5.state.units.foe.statuses.poison], [27, 3]);
    assert.equal(v5.events.filter((e) => e.type === 'venom-burst').length, 1);
    assert.equal(run(4).state.units.foe.hp, 30);
});

test('暗刃（A05）：取出 0 费、打出后消耗的暗刃；增伤、首刃、群攻、保留改写暗刃；规则 v4 不取出', () => {
    const draw2 = def('s', 'skill', [{ op: 'shiv', amount: 2 }], { innate: true });
    const s = startDeck({ s: draw2, k: GUARD }, ['s', ...Array(9).fill('k')]);
    const got = playIn(s, instOf(s, 's')).state;
    const [first] = shivsOf(got);
    assert.equal(shivsOf(got).length, 2);
    const view = cardView(got, first);
    assert.deepEqual([view.cost, view.effects[0].amount], [0, 4]);
    const struck = playIn(got, first, 'foe').state;
    assert.deepEqual([struck.units.foe.hp, struck.piles.hero.exhaust.includes(first)], [26, true]);

    const honed = def('h', 'skill', [{ op: 'hone-shiv', mode: 'edge', amount: 3 }, { op: 'hone-shiv', mode: 'first', amount: 5 }], { innate: true });
    const t = startDeck({ h: honed, s: draw2, k: GUARD }, ['h', 's', ...Array(8).fill('k')]);
    let u = playIn(t, instOf(t, 'h')).state;
    u = playIn(u, instOf(u, 's')).state;
    u = playIn(u, shivsOf(u)[0], 'foe').state;
    assert.equal(u.units.foe.hp, 18);
    u = playIn(u, shivsOf(u)[0], 'foe').state;
    assert.equal(u.units.foe.hp, 11);

    for (const [mode, check] of [['fan', (v) => v.effects[0].target === 'all-enemies'], ['keep', (v) => v.retain === true]]) {
        const card = def('f', 'skill', [{ op: 'hone-shiv', mode }, { op: 'shiv', amount: 1 }], { innate: true });
        const fs = startDeck({ f: card, k: GUARD }, ['f', ...Array(9).fill('k')]);
        const done = playIn(fs, instOf(fs, 'f')).state;
        assert.ok(check(cardView(done, shivsOf(done)[0])), mode);
        if (mode === 'keep') assert.equal(shivsOf(endTurn(done).state).length, 1);
    }
    const old = startDeck({ s: draw2, k: GUARD }, ['s', ...Array(9).fill('k')], 4);
    assert.equal(shivsOf(playIn(old, instOf(old, 's')).state).length, 0);
});

test('弃牌收益（A06）：限时 buff 让每次弃牌对随机敌人造成伤害', () => {
    const card = def('d', 'skill', [{ op: 'buff', trigger: 'discard', turns: 1, then: [{ op: 'damage', amount: 3, hits: 1, target: 'random-enemy' }] }, { op: 'discard', amount: 1, mode: 'random' }], { innate: true });
    const s = startDeck({ d: card, k: GUARD }, ['d', ...Array(9).fill('k')]);
    assert.equal(playIn(s, instOf(s, 'd')).state.units.foe.hp, 27);
});

test('扼喉（A07）：本回合每打出一张牌目标失去生命（不经格挡），回合结束清掉；规则 v4 无效', () => {
    const card = def('g', 'skill', [{ op: 'apply-status', status: 'garrote', stacks: 2, target: 'enemy' }], { innate: true });
    const lit = (rv) => {
        const s = startDeck({ g: card, k: GUARD }, ['g', ...Array(9).fill('k')], rv);
        return playIn(s, instOf(s, 'g'), 'foe');
    };
    const first = lit();
    assert.equal(first.state.units.foe.hp, 28);
    assert.ok(first.events.some((e) => e.type === 'damage' && e.kind === 'garrote' && e.loss === true));
    const walled = structuredClone(first.state);
    walled.units.foe.block = 10;
    const next = playIn(walled, instOf(walled, 'k')).state;
    assert.deepEqual([next.units.foe.hp, next.units.foe.block], [26, 10]);
    assert.equal(endTurn(next).state.units.foe.statuses.garrote, undefined);
    assert.equal(lit(4).state.units.foe.hp, 30);
});

test('尸裂（A08）：带尸裂的敌人倒下时按其最大生命的比例伤害其他敌人；规则 v4 不波及', () => {
    const card = def('c', 'attack', [{ op: 'apply-status', status: 'carrion', stacks: 2, target: 'enemy' }, { op: 'damage', amount: 40, target: 'enemy' }], { innate: true });
    const run = (rv) => {
        const s = twoFoes({ c: card, k: GUARD }, ['c', ...Array(9).fill('k')], rv);
        return playIn(s, instOf(s, 'c'), 'foe').state;
    };
    const v5 = run();
    assert.deepEqual([v5.units.foe.alive, v5.units.foe2.hp], [false, 18]);
    assert.equal(run(4).units.foe2.hp, 30);
});

test('千刃（A09）：每打出一张牌对全体敌人造成层数伤害；规则 v4 不触发', () => {
    const card = def('b', 'power', [{ op: 'apply-status', status: 'bladestorm', stacks: 2, target: 'self' }], { innate: true });
    const run = (rv) => {
        const s = twoFoes({ b: card, k: GUARD }, ['b', ...Array(9).fill('k')], rv);
        const lit = playIn(s, instOf(s, 'b')).state;
        return playIn(lit, instOf(lit, 'k')).state;
    };
    const v5 = run();
    assert.deepEqual([v5.units.foe.hp, v5.units.foe2.hp], [26, 26]);
    assert.equal(run(4).units.foe.hp, 30);
});

test('刺客模板（A01–A10）：可反解、归 shadow 族只给刺客；牌面写明暗刃与毒结算；脆弱 sap 刺客可用', () => {
    for (const key of ['rupture', 'envenom', 'miasma', 'toxic-burst', 'shiv', 'shiv-edge', 'shiv-fan', 'shiv-keep', 'shiv-first', 'sleight', 'palm-off', 'garrote', 'carrion', 'bladestorm']) {
        const found = solvedAny(key);
        assert.ok(found, key);
        const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
        assert.equal(checked.ok, true, `${key} ${JSON.stringify(checked.errors)}`);
        assert.equal(templateFamily(key), 'shadow', key);
        assert.equal(templateAllowedFor(key, 'assassin'), true, key);
        for (const other of ['mage', 'guardian', 'warrior']) assert.equal(templateAllowedFor(key, other), false, `${key}:${other}`);
    }
    assert.ok(describeEffects([{ op: 'shiv', amount: 2 }]).includes('暗刃'));
    assert.ok(describeEffects([{ op: 'poison-tick', amount: 1, target: 'enemy' }]).includes('层数不减'));
    assert.equal(templateAllowedFor('sap', 'assassin'), true);
});


// ---------- 规则 v5 P3 游侠「猎印与连射」（R01–R05；R06 随 P4 E02） ----------
const hitFoe = (amount, hits = 1) => ({ op: 'damage', amount, hits, target: 'enemy' });
const onFoe = (status, stacks) => ({ op: 'apply-status', status, stacks, target: 'enemy' });

test('猎印与引弦（R01）：引弦令所有带猎印的敌人失去等于层数的生命，猎印不清除，未带猎印者不受影响；规则 v4 无效', () => {
    const mark = def('m', 'attack', [hitFoe(1), onFoe('hunt-mark', 3)], { innate: true });
    const nock = def('n', 'attack', [hitFoe(1), { op: 'loose' }], { innate: true });
    const run = (rv) => {
        const s = twoFoes({ m: mark, n: nock, k: GUARD }, ['m', 'n', ...Array(8).fill('k')], rv);
        const marked = playIn(s, instOf(s, 'm'), 'foe').state;
        return playIn(marked, instOf(marked, 'n'), 'foe');
    };
    const v5 = run();
    assert.deepEqual([v5.state.units.foe.hp, v5.state.units.foe.statuses['hunt-mark'], v5.state.units.foe2.hp], [25, 3, 30]);
    assert.ok(v5.events.some((e) => e.type === 'damage' && e.kind === 'hunt-mark' && e.loss === true));
    assert.equal(run(4).state.units.foe.hp, 28);
});

test('迟滞（R02）：攻击者本回合每已打出一张牌，目标受到的攻击伤害 +10%；目标回合结束衰减；规则 v4 无效', () => {
    const snare = def('s', 'skill', [onFoe('snare', 1)], { innate: true });
    const big = def('b', 'attack', [hitFoe(10)], { innate: true });
    const run = (rv) => {
        const t = startDeck({ s: snare, b: big, k: GUARD }, ['s', 'b', ...Array(8).fill('k')], rv);
        let u = playIn(t, instOf(t, 's'), 'foe').state;
        u = playIn(u, instOf(u, 'k')).state;
        return playIn(u, instOf(u, 'b'), 'foe').state;
    };
    const v5 = run();
    assert.equal(v5.units.foe.hp, 18);
    assert.equal(endTurn(v5).state.units.foe.statuses.snare, undefined);
    assert.equal(run(4).units.foe.hp, 20);
});

test('专精先手（R03）：每回合前 N 张攻击牌伤害 +50%，之后照常；出手后清掉标记；规则 v4 无效', () => {
    const eye = def('d', 'power', [{ op: 'apply-status', status: 'deadeye', stacks: 1, target: 'self' }], { innate: true });
    const shot = def('x', 'attack', [hitFoe(6)], { innate: true });
    const run = (rv) => {
        const t = startDeck({ d: eye, x: shot, k: GUARD }, ['d', 'x', 'x', ...Array(7).fill('k')], rv);
        let u = playIn(t, instOf(t, 'd')).state;
        u = playIn(u, instOf(u, 'x'), 'foe').state;
        return playIn(u, instOf(u, 'x'), 'foe').state;
    };
    const v5 = run();
    assert.deepEqual([v5.units.foe.hp, v5.units.hero.res?.aimed], [15, undefined]);
    assert.equal(run(4).units.foe.hp, 18);
});

test('连段成长（R04）：本回合每次攻击命中后之后的攻击伤害 +层数，回合结束清掉；规则 v4 无效', () => {
    const rise = def('c', 'skill', [{ op: 'apply-status', status: 'combo-rise', stacks: 2, target: 'self' }], { innate: true });
    const twin = def('t', 'attack', [hitFoe(3, 2)], { innate: true });
    const run = (rv) => {
        const s = startDeck({ c: rise, t: twin, k: GUARD }, ['c', 't', ...Array(8).fill('k')], rv);
        const lit = playIn(s, instOf(s, 'c')).state;
        return playIn(lit, instOf(lit, 't'), 'foe').state;
    };
    const v5 = run();
    assert.equal(v5.units.foe.hp, 22);
    const next = endTurn(v5).state;
    assert.deepEqual([next.units.hero.statuses['combo-rise'], next.units.hero.res?.comboHits], [undefined, undefined]);
    assert.equal(run(4).units.foe.hp, 24);
});

test('游侠模板（R01–R05）：可反解、归 quarry 族只给游侠；牌面写明引弦与猎印；牌库顶操控模板游侠可用', () => {
    for (const key of ['quarry-mark', 'nock', 'snare', 'deadeye', 'rising-shot']) {
        const found = solvedAny(key);
        assert.ok(found, key);
        const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
        assert.equal(checked.ok, true, `${key} ${JSON.stringify(checked.errors)}`);
        assert.equal(templateFamily(key), 'quarry', key);
        assert.equal(templateAllowedFor(key, 'ranger'), true, key);
        for (const other of ['assassin', 'bard', 'warrior']) assert.equal(templateAllowedFor(key, other), false, `${key}:${other}`);
    }
    assert.ok(describeEffects([{ op: 'loose' }]).includes('引弦'));
    assert.ok(describeEffects([onFoe('hunt-mark', 2)]).includes('猎印'));
    for (const key of ['scout', 'hunt', 'stack', 'boomerang']) assert.equal(templateAllowedFor(key, 'ranger'), true, key);
});


// ---------- 规则 v5 P3 祈司「圣辉与守护」（P01–P05；P03、P06 沿用 sanctum 族已有模板） ----------
const gainHalo = (n) => def('g', 'skill', [{ op: 'radiance', amount: n }], { innate: true });
const tryPlay = (state, inst, targetId) => applyAction(state, { type: 'play', inst, ...(targetId ? { targetId } : {}) });

test('圣辉（P01）：获得的圣辉跨回合保留；圣辉牌不足时拒绝，付得起时另扣圣辉；X 圣辉花光并按点数结算；规则 v4 不判定', () => {
    const smite = def('s', 'attack', [hitFoe(5)], { innate: true, radiance: 2 });
    const t = startDeck({ g: gainHalo(3), s: smite, k: GUARD }, ['g', 's', ...Array(8).fill('k')]);
    const denied = tryPlay(t, instOf(t, 's'), 'foe');
    assert.equal(denied.ok, false);
    assert.ok(JSON.stringify(denied.error).includes('insufficient-radiance'));
    let u = playIn(t, instOf(t, 'g')).state;
    assert.equal(u.units.hero.res.radiance, 3);
    u = playIn(u, instOf(u, 's'), 'foe').state;
    assert.deepEqual([u.units.foe.hp, u.units.hero.res.radiance], [25, 1]);
    assert.equal(endTurn(u).state.units.hero.res.radiance, 1);
    const judge = def('j', 'attack', [hitFoe(2)], { innate: true, radiance: 'X' });
    const x = startDeck({ g: gainHalo(3), j: judge, k: GUARD }, ['g', 'j', ...Array(8).fill('k')]);
    const xs = playIn(playIn(x, instOf(x, 'g')).state, instOf(playIn(x, instOf(x, 'g')).state, 'j'), 'foe').state;
    assert.deepEqual([xs.units.foe.hp, xs.units.hero.res.radiance], [24, 0]);
    const v4 = startDeck({ s: smite, k: GUARD }, ['s', ...Array(9).fill('k')], 4);
    assert.equal(playIn(v4, instOf(v4, 's'), 'foe').state.units.foe.hp, 25);
});

test('圣辉联动（P02）：每次获得或消耗圣辉，辉击伤害生命最低的敌人、辉愈回复；规则 v4 无效', () => {
    const halo = def('h', 'power', [{ op: 'apply-status', status: 'halo-strike', stacks: 2, target: 'self' }, { op: 'apply-status', status: 'halo-mend', stacks: 1, target: 'self' }], { innate: true });
    const run = (rv) => {
        const t = startDeck({ h: halo, g: gainHalo(1), k: GUARD }, ['h', 'g', ...Array(8).fill('k')], rv);
        const lit = playIn(t, instOf(t, 'h')).state;
        return playIn(lit, instOf(lit, 'g'));
    };
    const v5 = run();
    assert.equal(v5.state.units.foe.hp, 28);
    assert.ok(v5.events.some((e) => e.type === 'heal' && e.source?.id === 'halo-mend'));
    assert.equal(run(4).state.units.foe.hp, 30);
});

test('不衰减回复（P04）：恒愈每回合开始按层数回复，层数不减；规则 v4 无效', () => {
    const steady = def('m', 'power', [{ op: 'apply-status', status: 'steady-mend', stacks: 3, target: 'self' }], { innate: true });
    const run = (rv) => {
        const t = startDeck({ m: steady, k: GUARD }, ['m', ...Array(9).fill('k')], rv);
        return endTurn(playIn(t, instOf(t, 'm')).state);
    };
    const v5 = run();
    assert.ok(v5.events.some((e) => e.type === 'heal' && e.source?.id === 'steady-mend'));
    assert.equal(v5.state.units.hero.statuses['steady-mend'], 3);
    assert.ok(!run(4).events.some((e) => e.type === 'heal' && e.source?.id === 'steady-mend'));
});

test('战后回复（P05）：存活单位按层数计回复量，倒下者为 0', async () => {
    const { afterBattleMend } = await import('../src/combat/mechanics/sanctum.js');
    assert.equal(afterBattleMend({ alive: true, statuses: { 'after-mend': 5 } }), 5);
    assert.equal(afterBattleMend({ alive: false, statuses: { 'after-mend': 5 } }), 0);
    assert.equal(afterBattleMend({ alive: true, statuses: {} }), 0);
});

test('祈司模板（P01–P05）：可反解、归 sanctum 族只给祈司；圣辉第二费用计价并写进牌面关键字', async () => {
    const { estimateCardValue } = await import('../src/combat/rules.js');
    const { describeKeywordParts } = await import('../src/visual/igs-ui/combat-card-art.js');
    for (const key of ['consecrate', 'smite', 'judgment', 'halo-strike', 'halo-mend', 'verdant', 'steady-mend', 'aftercare']) {
        const found = solvedAny(key);
        assert.ok(found, key);
        const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
        assert.equal(checked.ok, true, `${key} ${JSON.stringify(checked.errors)}`);
        assert.equal(templateFamily(key), 'sanctum', key);
        assert.equal(templateAllowedFor(key, 'priest'), true, key);
        for (const other of ['guardian', 'mage', 'warrior']) assert.equal(templateAllowedFor(key, other), false, `${key}:${other}`);
    }
    const base = { effects: [{ op: 'damage', amount: 10, hits: 1, target: 'enemy' }] };
    assert.equal(estimateCardValue({ ...base, radiance: 2 }), estimateCardValue(base) - 6);
    assert.ok(describeKeywordParts({ ...base, radiance: 2 }).some((p) => p.text === '圣辉 2'));
    assert.ok(describeEffects([{ op: 'radiance', amount: 2 }]).includes('圣辉'));
});


// ---------- 规则 v5 P3 乐师「心境、乐势与预知」（B01–B09） ----------
const free = (id, type, effects, extra = {}) => def(id, type, effects, { cost: 0, innate: true, ...extra });
const stanceTo = (stance) => ({ op: 'enter-stance', stance });
const selfOn = (status, stacks) => ({ op: 'apply-status', status, stacks, target: 'self' });
const deckOf = (catalog, ids, rv) => startDeck({ ...catalog, k: GUARD }, [...ids, ...Array(Math.max(0, 10 - ids.length)).fill('k')], rv);

test('心境（B01）：怒意令造成与受到的攻击伤害 ×2，神临 ×3；离开静心 +2 能量；规则 v4 无效', () => {
    const fury = def('w', 'attack', [hitFoe(5), stanceTo('wrath')], { innate: true });
    const shot = def('x', 'attack', [hitFoe(5)], { innate: true });
    const run = (rv) => {
        const t = deckOf({ w: fury, x: shot }, ['w', 'x'], rv);
        const u = playIn(t, instOf(t, 'w'), 'foe').state;
        return playIn(u, instOf(u, 'x'), 'foe').state;
    };
    const v5 = run();
    assert.deepEqual([v5.units.foe.hp, v5.units.hero.res?.stance], [15, 'wrath']);
    const v4 = run(4);
    assert.deepEqual([v4.units.foe.hp, v4.units.hero.res], [20, undefined]);
    const plain = { statuses: {} };
    assert.equal(computeDamage(plain, { statuses: {}, res: { stance: 'wrath' } }, 5, 1, 5), 10);
    assert.equal(computeDamage({ statuses: {}, res: { stance: 'divinity' } }, plain, 5, 1, 5), 15);
    assert.equal(computeDamage(plain, { statuses: {}, res: { stance: 'wrath' } }, 5, 1, 4), 5);
    const calm = def('c', 'skill', [stanceTo('calm')], { innate: true });
    const back = def('n', 'skill', [stanceTo('neutral')], { innate: true });
    const t = deckOf({ c: calm, n: back }, ['c', 'n']);
    const e0 = t.units.hero.energy;
    const u = playIn(t, instOf(t, 'c')).state;
    assert.deepEqual([u.units.hero.res.stance, u.units.hero.energy], ['calm', e0 - 1]);
    const left = playIn(u, instOf(u, 'n')).state;
    assert.deepEqual([left.units.hero.res.stance, left.units.hero.energy], ['neutral', e0]);
});

test('乐势（B02）：累计到 10 进入神临（+3 能量），超出部分保留；神临在下回合开始退出', () => {
    const p = free('p', 'skill', [{ op: 'momentum', amount: 4 }]);
    const m = free('m', 'skill', [{ op: 'momentum', amount: 5 }]);
    const t = deckOf({ p, m }, ['p', 'm', 'm']);
    const e0 = t.units.hero.energy;
    let u = playIn(t, instOf(t, 'p')).state;
    u = playIn(u, instOf(u, 'm')).state;
    assert.deepEqual([u.units.hero.res.momentum, u.units.hero.res.stance], [9, undefined]);
    const up = playIn(u, instOf(u, 'm'));
    const h = up.state.units.hero;
    assert.deepEqual([h.res.momentum, h.res.stance, h.energy], [4, 'divinity', e0 + 3]);
    assert.ok(up.events.some((e) => e.type === 'momentum' && e.ascend === true));
    assert.equal(endTurn(up.state).state.units.hero.res.stance, 'neutral');
});

test('乐势来源与心境联动（B03、B04）：吟诵每回合开始给乐势、酝怒下回合进入怒意；切换心境得格挡、进入怒意抽牌、回合结束仍在静心得格挡；规则 v4 无效', () => {
    const src = free('s', 'power', [selfOn('chant', 3), selfOn('seethe', 1)]);
    const run = (rv) => {
        const t = deckOf({ s: src }, ['s'], rv);
        return endTurn(playIn(t, instOf(t, 's')).state).state.units.hero;
    };
    const v5 = run();
    assert.deepEqual([v5.res.momentum, v5.res.stance, Boolean(v5.statuses.seethe)], [3, 'wrath', false]);
    assert.equal(run(4).res, undefined);
    const link = free('l', 'power', [selfOn('stance-ward', 4), selfOn('wrath-draw', 2), selfOn('calm-guard', 5)]);
    const calm = free('c', 'skill', [stanceTo('calm')]);
    const rage = free('r', 'skill', [stanceTo('wrath')]);
    const t = deckOf({ l: link, c: calm, r: rage }, ['l', 'c', 'r']);
    let u = playIn(t, instOf(t, 'l')).state;
    const handBefore = u.piles.hero.hand.length;
    u = playIn(u, instOf(u, 'r')).state;
    assert.deepEqual([u.units.hero.block, u.piles.hero.hand.length], [4, handBefore + 1]);
    u = playIn(u, instOf(u, 'c')).state;
    assert.equal(u.units.hero.block, 8);
    assert.ok(endTurn(u).events.some((e) => e.type === 'block' && e.source?.id === 'calm-guard'));
});

test('预知（B05）：查看抽牌堆顶 N 张，弃掉不能打出与估值不到最高者一半的牌，直接进弃牌堆、不触发弃牌收益；观兆在预知时给格挡；规则 v4 无效', () => {
    const look = def('f', 'skill', [{ op: 'foresee', amount: 3 }], { innate: true });
    const eye = free('t', 'power', [selfOn('scry-ward', 3)]);
    const dud = def('z', 'skill', [], { cost: 0, unplayable: true, onDiscard: [{ op: 'block', amount: 5, target: 'self' }] });
    const big = def('b', 'attack', [hitFoe(20)]);
    const run = (rv) => {
        const t = startDeck({ f: look, t: eye, z: dud, b: big, k: GUARD }, ['f', 't', 'z', 'z', 'z', 'b', 'b', 'b', ...Array(7).fill('k')], rv);
        const draw = t.piles.hero.draw;
        const pick = (id) => draw.find((inst) => t.cards[inst].cardId === id);
        const [ki, zi, bi] = [pick('k'), pick('z'), pick('b')];
        assert.ok(ki && zi && bi, 'draw pile lacks a needed card');
        t.piles.hero.draw = [...draw.filter((inst) => ![ki, zi, bi].includes(inst)), ki, zi, bi];
        const lit = playIn(t, instOf(t, 't')).state;
        return { before: lit, ...playIn(lit, instOf(lit, 'f')), ki, zi, bi };
    };
    const v5 = run();
    const ev = v5.events.find((e) => e.type === 'foresee');
    assert.deepEqual([ev.seen, [...ev.discarded].sort()], [3, [v5.ki, v5.zi].sort()]);
    const pile = v5.state.piles.hero;
    assert.equal(pile.draw.at(-1), v5.bi);
    assert.deepEqual(pile.draw.slice(0, -1), v5.before.piles.hero.draw.slice(0, -3));
    assert.ok([v5.ki, v5.zi].every((inst) => pile.discard.includes(inst)));
    assert.ok(!v5.events.some((e) => e.type === 'discard' || e.source?.kind === 'on-discard'));
    assert.ok(!(v5.state.units.hero.turnStats?.discards > 0));
    assert.ok(v5.events.some((e) => e.type === 'block' && e.source?.id === 'scry-ward'));
    const v4 = run(4);
    assert.deepEqual(v4.state.piles.hero.draw, v4.before.piles.hero.draw);
});

test('保留减费（B06）：回合结束仍在手中的牌下回合费用 -1，新抽到的牌不减；没有余韵时不减；规则 v4 无效', () => {
    const keep = free('s', 'power', [selfOn('keep-discount', 1)]);
    const held = def('r', 'skill', [{ op: 'block', amount: 1, target: 'self' }], { cost: 2, innate: true, retain: true });
    const run = (rv, withKeep = true) => {
        const t = deckOf({ s: keep, r: held }, ['s', 'r'], rv);
        const next = endTurn(withKeep ? playIn(t, instOf(t, 's')).state : t).state;
        return { next, view: cardView(next, instOf(next, 'r')) };
    };
    const v5 = run();
    assert.deepEqual([v5.view.cost, v5.view.baseCost], [1, 2]);
    for (const inst of v5.next.piles.hero.hand) if (v5.next.cards[inst].cardId === 'k') assert.equal(cardView(v5.next, inst).cost, 1);
    assert.equal(run(undefined, false).view.cost, 2);
    assert.equal(run(4).view.cost, 2);
});

test('回响（B07）：每回合前 N 张牌整张多执行一次，之后照常；规则 v4 无效', () => {
    const echo = free('e', 'power', [selfOn('echo-play', 1)]);
    const shot = free('x', 'attack', [hitFoe(3)], { retain: true });
    const run = (rv) => {
        const t = deckOf({ e: echo, x: shot }, ['e', 'x', 'x'], rv);
        const next = endTurn(playIn(t, instOf(t, 'e')).state).state;
        const first = playIn(next, instOf(next, 'x'), 'foe');
        const second = playIn(first.state, instOf(first.state, 'x'), 'foe');
        return [first, second].map((r) => r.events.filter((e) => e.type === 'damage' && e.kind === 'attack').length);
    };
    assert.deepEqual(run(), [2, 1]);
    assert.deepEqual(run(4), [1, 1]);
});

test('加演（B08，D8）：回合结束后主角立即再行动一次，敌人这段时间不动；每场一次；规则 v4 无效', () => {
    const call = free('a', 'skill', [{ op: 'curtain-call' }]);
    const run = (rv) => {
        const t = deckOf({ a: call }, ['a', 'a'], rv);
        const one = playIn(t, instOf(t, 'a'));
        const two = playIn(one.state, instOf(one.state, 'a'));
        return { turn: t.turn, one, two, after: endTurn(two.state) };
    };
    const foeActed = (events) => events.some((e) => e.type === 'act' && e.unitId === 'foe');
    const v5 = run();
    assert.ok(v5.one.events.some((e) => e.type === 'encore-ready'));
    assert.ok(!v5.two.events.some((e) => e.type === 'encore-ready'));
    const s = v5.after.state;
    assert.ok(v5.after.events.some((e) => e.type === 'encore'));
    assert.equal(foeActed(v5.after.events), false);
    assert.deepEqual([s.turn, s.phase, s.units.hero.res.encore], [v5.turn + 1, 'player', 'used']);
    assert.equal(foeActed(endTurn(s).events), true);
    const v4 = run(4);
    assert.equal(foeActed(v4.after.events), true);
    assert.ok(!v4.after.events.some((e) => e.type === 'encore'));
});

test('乐师模板（B01–B09）：可反解、归 cadence 族只给乐师；随机分支 fumble 归乐师；牌面写明心境、乐势、预知与加演', () => {
    const keys = ['serene', 'fury', 'compose', 'crescendo', 'chant', 'simmer', 'stance-ward', 'rage-flow', 'still-water', 'foretell', 'third-eye', 'sustain', 'resonance', 'curtain-call'];
    for (const key of keys) {
        const found = solvedAny(key);
        assert.ok(found, key);
        const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
        assert.equal(checked.ok, true, `${key} ${JSON.stringify(checked.errors)}`);
        assert.equal(templateFamily(key), 'cadence', key);
        assert.equal(templateAllowedFor(key, 'bard'), true, key);
        for (const other of ['priest', 'mage', 'warrior']) assert.equal(templateAllowedFor(key, other), false, `${key}:${other}`);
    }
    assert.deepEqual([templateFamily('fumble'), templateAllowedFor('fumble', 'bard')], ['cadence', true]);
    for (const [effect, word] of [[stanceTo('wrath'), '怒意'], [{ op: 'momentum', amount: 2 }, '乐势'], [{ op: 'foresee', amount: 2 }, '预知'], [{ op: 'curtain-call' }, '加演']]) {
        assert.ok(describeEffects([effect]).includes(word), word);
    }
});


// ---------- 规则 v5 P3 法师「法珠与专注」（M01–M08） ----------
const chan = (orb, amount = 1) => ({ op: 'channel', orb, amount });
const orbHits = (events, id) => events.filter((e) => e.type === 'damage' && e.kind === 'orb' && e.source?.id === id);
const orbList = (state) => (state.units.hero.res?.orbs?.list || []).map((o) => o.kind);

test('法珠槽（M01）：首次凝结按默认 3 槽建立，先进先出，满槽再凝结先引发最早的一颗；槽数上限 10；规则 v4 无效', () => {
    const three = free('a', 'skill', [chan('lightning', 3)]);
    const frost = free('f', 'skill', [chan('frost')]);
    const run = (rv) => {
        const t = deckOf({ a: three, f: frost }, ['a', 'f'], rv);
        const u = playIn(t, instOf(t, 'a')).state;
        return playIn(u, instOf(u, 'f'));
    };
    const v5 = run();
    assert.equal(v5.state.units.hero.res.orbs.slots, 3);
    assert.deepEqual(orbList(v5.state), ['lightning', 'lightning', 'frost']);
    assert.deepEqual(orbHits(v5.events, 'lightning').map((e) => e.amount), [8]);
    assert.equal(v5.state.units.foe.hp, 22);
    const v4 = run(4);
    assert.deepEqual([v4.state.units.hero.res, v4.state.units.foe.hp], [undefined, 30]);
    const slot = free('s', 'power', [{ op: 'orb-slot', amount: 2 }]);
    let w = deckOf({ s: slot }, ['s', 's', 's', 's']);
    for (let i = 0; i < 4; i += 1) w = playIn(w, instOf(w, 's')).state;
    assert.equal(w.units.hero.res.orbs.slots, 10);
});

test('五种法珠（M02）：回合结束雷珠打随机敌人 3、霜珠 2 格挡、蚀珠蓄积 6、晶珠打全体 4 并递减；回合开始源珠 +1 能量', () => {
    const mix = free('m', 'skill', [chan('lightning'), chan('frost'), chan('dark')]);
    const t = deckOf({ m: mix }, ['m']);
    const ended = endTurn(playIn(t, instOf(t, 'm')).state);
    assert.deepEqual(orbHits(ended.events, 'lightning').map((e) => e.amount), [3]);
    assert.ok(ended.events.some((e) => e.type === 'block' && e.source?.id === 'frost' && e.amount === 2));
    assert.equal(ended.state.units.hero.res.orbs.list[2].charge, 12);
    const ion = free('p', 'skill', [chan('plasma')]);
    const p = deckOf({ p: ion }, ['p']);
    const next = endTurn(playIn(p, instOf(p, 'p')).state).state;
    assert.equal(next.units.hero.energy, next.units.hero.energyPerTurn + 1);
    const glass = free('g', 'skill', [chan('glass')]);
    const g = twoFoes({ g: glass, k: GUARD }, ['g', ...Array(9).fill('k')]);
    const gEnd = endTurn(playIn(g, instOf(g, 'g')).state);
    assert.deepEqual(orbHits(gEnd.events, 'glass').map((e) => e.target).sort(), ['foe', 'foe2']);
    assert.ok(orbHits(gEnd.events, 'glass').every((e) => e.amount === 4));
    assert.equal(gEnd.state.units.hero.res.orbs.list[0].charge, 3);
});

test('引发与多重引发（M02、M04）：雷珠引发 8、霜珠 5 格挡、蚀珠以蓄积值打敌人、源珠 2 能量；多重引发同一颗多次后移除，额外触发不消耗', () => {
    const run = (orb, op) => {
        const c = free('c', 'skill', [chan(orb), op]);
        const t = deckOf({ c }, ['c']);
        return { t, r: playIn(t, instOf(t, 'c')) };
    };
    const zap = run('lightning', { op: 'evoke', amount: 2 }).r;
    assert.deepEqual(orbHits(zap.events, 'lightning').map((e) => e.amount), [8, 8]);
    assert.deepEqual(orbList(zap.state), []);
    const ice = run('frost', { op: 'evoke', amount: 1 }).r;
    assert.ok(ice.events.some((e) => e.type === 'block' && e.source?.id === 'frost' && e.amount === 5));
    const dark = run('dark', { op: 'evoke', amount: 1 }).r;
    assert.deepEqual(orbHits(dark.events, 'dark').map((e) => e.amount), [6]);
    const { t, r: ion } = run('plasma', { op: 'evoke', amount: 1 });
    assert.equal(ion.state.units.hero.energy, t.units.hero.energy + 2);
    const pulse = run('lightning', { op: 'orb-pulse', amount: 2 }).r;
    assert.deepEqual([orbHits(pulse.events, 'lightning').map((e) => e.amount), orbList(pulse.state)], [[3, 3], ['lightning']]);
});

test('专注（M03）：加到除源珠外的法珠数值上，可为负；临时专注回合结束清掉', () => {
    const tune = free('f', 'power', [{ op: 'focus', amount: 2 }, chan('lightning'), chan('plasma')]);
    const t = deckOf({ f: tune }, ['f']);
    const ended = endTurn(playIn(t, instOf(t, 'f')).state);
    assert.deepEqual(orbHits(ended.events, 'lightning').map((e) => e.amount), [5]);
    assert.equal(ended.state.units.hero.energy, ended.state.units.hero.energyPerTurn + 1);
    const drain = free('d', 'skill', [{ op: 'focus', amount: -3 }, chan('lightning')]);
    const d = deckOf({ d: drain }, ['d']);
    assert.equal(orbHits(endTurn(playIn(d, instOf(d, 'd')).state).events, 'lightning').length, 0);
    const flare = free('x', 'skill', [selfOn('flux', 2), chan('frost')]);
    const x = deckOf({ x: flare }, ['x']);
    const xEnd = endTurn(playIn(x, instOf(x, 'x')).state);
    assert.ok(xEnd.events.some((e) => e.type === 'block' && e.source?.id === 'frost' && e.amount === 4));
    assert.equal(xEnd.state.units.hero.statuses.flux, undefined);
});

test('雷暴与锁定（M05、M06）：雷暴使雷珠打全体敌人；锁定使目标受雷珠伤害 +50%，普通攻击不变；规则 v4 无效', () => {
    const storm = free('s', 'power', [selfOn('arc-storm', 1), chan('lightning')]);
    const s = twoFoes({ s: storm, k: GUARD }, ['s', ...Array(9).fill('k')]);
    const sEnd = endTurn(playIn(s, instOf(s, 's')).state);
    assert.deepEqual(orbHits(sEnd.events, 'lightning').map((e) => e.target).sort(), ['foe', 'foe2']);
    const lock = def('l', 'attack', [hitFoe(5), onFoe('lock-on', 1)], { innate: true });
    const zap = free('z', 'skill', [chan('lightning'), { op: 'evoke', amount: 1 }]);
    const run = (rv) => {
        const t = deckOf({ l: lock, z: zap }, ['l', 'z'], rv);
        const u = playIn(t, instOf(t, 'l'), 'foe').state;
        return playIn(u, instOf(u, 'z'));
    };
    const v5 = run();
    assert.deepEqual([orbHits(v5.events, 'lightning').map((e) => e.amount), v5.state.units.foe.hp], [[12], 13]);
    assert.equal(run(4).state.units.foe.hp, 25);
});

test('法珠触发（M07）：雷心使之后每打出一张能力牌凝结雷珠（带雷心的牌本身不算）；静电在受到未被格挡的攻击伤害时凝结雷珠；雷涌使引发雷珠追加伤害', () => {
    const heart = free('h', 'power', [selfOn('storm-heart', 1)]);
    const pw = free('p', 'power', [selfOn('flux', 1)]);
    const t = deckOf({ h: heart, p: pw }, ['h', 'p']);
    const lit = playIn(t, instOf(t, 'h')).state;
    assert.deepEqual(orbList(lit), []);
    const after = playIn(lit, instOf(lit, 'p')).state;
    assert.deepEqual([orbList(after), after.units.hero.res.stormArmed], [['lightning'], undefined]);
    const shell = free('s', 'power', [selfOn('static-shell', 1)]);
    const setup = { controlledId: 'hero', canEscape: true, units: [hero({}, { deck: ['s', ...Array(9).fill('k')], catalog: { s: shell, k: GUARD } }), foe(foeAttack(5))] };
    const created = createBattle(setup, 7);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    const hit = endTurn(playIn(created.state, instOf(created.state, 's')).state).state;
    assert.ok(hit.units.hero.hp < 30);
    assert.deepEqual(orbList(hit), ['lightning']);
    const boost = free('b', 'skill', [selfOn('arc-boost', 3), chan('lightning'), { op: 'evoke', amount: 1 }]);
    const b = deckOf({ b: boost }, ['b']);
    assert.deepEqual(orbHits(playIn(b, instOf(b, 'b')).events, 'lightning').map((e) => e.amount), [11]);
});

test('能力牌重复与全体减费（M08）：下一张能力牌多执行一次（沿用 replay-next）；全体减费 conflux 法师可用', () => {
    const amp = free('a', 'skill', [{ op: 'replay-next', amount: 1, cardType: 'power' }]);
    const tune = free('f', 'power', [{ op: 'focus', amount: 1 }]);
    const t = deckOf({ a: amp, f: tune }, ['a', 'f']);
    const u = playIn(t, instOf(t, 'a')).state;
    assert.equal(playIn(u, instOf(u, 'f')).state.units.hero.res.focus, 2);
    assert.equal(templateAllowedFor('conflux', 'mage'), true);
});

test('法师模板（M01–M08）：可反解、归 orb 族只给法师；牌面写明法珠、引发、专注与锁定', () => {
    const keys = ['zap', 'chill', 'shade', 'ion-core', 'prism', 'dualcast', 'orb-loop', 'capacitor', 'attune', 'overload', 'flare', 'arc-storm', 'lock-on', 'power-spark', 'static-shell', 'orb-burst', 'amplify'];
    for (const key of keys) {
        const found = solvedAny(key);
        assert.ok(found, key);
        const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
        assert.equal(checked.ok, true, `${key} ${JSON.stringify(checked.errors)}`);
        assert.equal(templateFamily(key), 'orb', key);
        assert.equal(templateAllowedFor(key, 'mage'), true, key);
        for (const other of ['bard', 'priest', 'warrior']) assert.equal(templateAllowedFor(key, other), false, `${key}:${other}`);
    }
    for (const [effect, word] of [[chan('frost'), '霜珠'], [{ op: 'evoke', amount: 2 }, '引发'], [{ op: 'focus', amount: 1 }, '专注'], [{ op: 'orb-slot', amount: 1 }, '法珠槽'], [onFoe('lock-on', 1), '锁定']]) {
        assert.ok(describeEffects([effect]).includes(word), word);
    }
});

// ---------- 规则 v5 P3 召唤「随从与灾厄」（S01–S08；随从按 D5 依附主人） ----------
const sumOp = (amount) => ({ op: 'summon', amount });
const minionHit = (amount, extra = {}) => ({ op: 'minion-strike', amount, target: 'enemy', ...extra });
const vsAttacker = (catalog, ids, amount, rv, foeExtra = {}) => {
    const deck = [...ids, ...Array(Math.max(0, 10 - ids.length)).fill('k')];
    const setup = { controlledId: 'hero', canEscape: true, units: [hero({}, { deck, catalog: { ...catalog, k: GUARD } }), foe(amount ? foeAttack(amount) : {}, foeExtra)], ...(rv ? { rulesVersion: rv } : {}) };
    const created = createBattle(setup, 7);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    return created.state;
};

test('随从（S01）：召唤时不在则以 N 生命召出、在则最大与当前生命各 +N；主人受到的未格挡攻击伤害先由随从承受，非攻击伤害不挡；规则 v4 无效', () => {
    const call = free('s', 'skill', [sumOp(5)]);
    const t = deckOf({ s: call }, ['s', 's']);
    let u = playIn(t, instOf(t, 's')).state;
    assert.deepEqual(u.units.hero.res.minion, { hp: 5, maxHp: 5 });
    u = playIn(u, instOf(u, 's')).state;
    assert.deepEqual(u.units.hero.res.minion, { hp: 10, maxHp: 10 });
    const run = (rv) => {
        const s = vsAttacker({ s: call }, ['s'], 8, rv);
        return endTurn(playIn(s, instOf(s, 's')).state);
    };
    const v5 = run();
    assert.deepEqual([v5.state.units.hero.hp, v5.state.units.hero.res?.minion], [27, undefined]);
    assert.ok(v5.events.some((e) => e.type === 'minion-loss' && e.amount === 5));
    assert.ok(v5.events.some((e) => e.type === 'minion-down'));
    const v4 = run(4);
    assert.deepEqual([v4.state.units.hero.hp, v4.state.units.hero.res], [22, undefined]);
    const hurt = free('h', 'skill', [sumOp(5), { op: 'self-damage', amount: 3 }]);
    const h = deckOf({ h: hurt }, ['h']);
    const after = playIn(h, instOf(h, 'h')).state;
    assert.deepEqual([after.units.hero.hp, after.units.hero.res.minion.hp], [27, 5]);
});

test('随从攻击与转化（S02、S03）：随从不在时无效；不吃主人攻击力，只加骨甲；可追加随从生命；牺牲换格挡或群伤；魂契使随从失去生命时敌人同步失去', () => {
    const poke = free('p', 'attack', [minionHit(4)]);
    const lone = deckOf({ p: poke }, ['p']);
    assert.equal(playIn(lone, instOf(lone, 'p'), 'foe').state.units.foe.hp, 30);
    const prep = free('s', 'skill', [sumOp(5), { op: 'status', status: 'strength', stacks: 3, target: 'self' }, selfOn('minion-might', 2)]);
    const t = deckOf({ s: prep, p: poke }, ['s', 'p']);
    const u = playIn(t, instOf(t, 's')).state;
    const hit = playIn(u, instOf(u, 'p'), 'foe');
    assert.equal(hit.state.units.foe.hp, 24);
    assert.ok(hit.events.some((e) => e.type === 'damage' && e.kind === 'minion' && e.source?.kind === 'minion'));
    const rush = free('r', 'attack', [minionHit(2, { bonus: 'hp' })]);
    const call = free('c', 'skill', [sumOp(5)]);
    const rr = deckOf({ c: call, r: rush }, ['c', 'r']);
    const ru = playIn(rr, instOf(rr, 'c')).state;
    assert.equal(playIn(ru, instOf(ru, 'r'), 'foe').state.units.foe.hp, 23);
    const wall = free('w', 'skill', [{ op: 'sacrifice', mode: 'block' }]);
    const ww = deckOf({ c: call, w: wall }, ['c', 'w']);
    const wu = playIn(playIn(ww, instOf(ww, 'c')).state, instOf(playIn(ww, instOf(ww, 'c')).state, 'w')).state;
    assert.deepEqual([wu.units.hero.block, wu.units.hero.res?.minion], [10, undefined]);
    const nova = free('n', 'skill', [{ op: 'sacrifice', mode: 'nova' }]);
    const nn = twoFoes({ c: call, n: nova, k: GUARD }, ['c', 'n', ...Array(8).fill('k')]);
    const nc = playIn(nn, instOf(nn, 'c')).state;
    const nu = playIn(nc, instOf(nc, 'n')).state;
    assert.deepEqual([nu.units.foe.hp, nu.units.foe2.hp], [25, 25]);
    const bond = free('b', 'power', [sumOp(5), selfOn('minion-bond', 1)]);
    const bb = vsAttacker({ b: bond }, ['b'], 3);
    const bu = endTurn(playIn(bb, instOf(bb, 'b')).state).state;
    assert.deepEqual([bu.units.hero.hp, bu.units.hero.res.minion.hp, bu.units.foe.hp], [30, 2, 27]);
});

test('灾厄（S04、D7）：敌人回合结束时生命不高于灾厄即倒下；首领与精英按最大生命 50% 封顶；规则 v4 无效', () => {
    const curse = def('d', 'attack', [hitFoe(12), onFoe('doom', 20)], { innate: true });
    const run = (rv, tier) => {
        const s = vsAttacker({ d: curse }, ['d'], 0, rv, tier ? { tier } : {});
        return endTurn(playIn(s, instOf(s, 'd'), 'foe').state);
    };
    const v5 = run();
    assert.deepEqual([v5.state.units.foe.alive, v5.state.outcome], [false, 'victory']);
    assert.ok(v5.events.some((e) => e.type === 'doom' && e.threshold === 20));
    const boss = run(undefined, 'boss');
    assert.deepEqual([boss.state.units.foe.alive, boss.state.units.foe.statuses.doom], [true, 20]);
    assert.equal(run(4).state.units.foe.alive, true);
});

test('灾厄来源（S05）：缠厄使每张指定敌人的牌给目标灾厄；噬厄使攻击按造成的伤害给灾厄', () => {
    const touch = free('t', 'power', [selfOn('doom-touch', 3)]);
    const reap = free('r', 'power', [selfOn('doom-reap', 1)]);
    const jab = def('j', 'attack', [hitFoe(5)], { innate: true });
    const tt = deckOf({ t: touch, j: jab }, ['t', 'j']);
    const tu = playIn(tt, instOf(tt, 't')).state;
    assert.equal(playIn(tu, instOf(tu, 'j'), 'foe').state.units.foe.statuses.doom, 3);
    const rr = deckOf({ r: reap, j: jab }, ['r', 'j']);
    const ru = playIn(rr, instOf(rr, 'r')).state;
    assert.equal(playIn(ru, instOf(ru, 'j'), 'foe').state.units.foe.statuses.doom, 5);
});

test('魂牌（S06）：魂牌 0 费、抽 1 张、打出后消耗；噬魂在打出魂牌时召唤，魂蚀令随机敌人失去生命', () => {
    const harvest = free('h', 'skill', [{ op: 'soul', amount: 2 }]);
    const feast = free('f', 'power', [selfOn('soul-feast', 2), selfOn('soul-blight', 3)]);
    const t = deckOf({ h: harvest, f: feast }, ['h', 'f']);
    let u = playIn(t, instOf(t, 'f')).state;
    u = playIn(u, instOf(u, 'h')).state;
    const souls = u.piles.hero.hand.filter((inst) => u.cards[inst].cardId === 'summon-soul');
    assert.equal(souls.length, 2);
    assert.deepEqual([cardView(u, souls[0]).cost, cardView(u, souls[0]).name], [0, '魂']);
    const handBefore = u.piles.hero.hand.length;
    const played = playIn(u, souls[0]);
    const s = played.state;
    assert.equal(s.piles.hero.hand.length, handBefore);
    assert.ok(s.piles.hero.exhaust.includes(souls[0]));
    assert.deepEqual([s.units.hero.res.minion, s.units.foe.hp], [{ hp: 2, maxHp: 2 }, 27]);
    assert.ok(played.events.some((e) => e.type === 'damage' && e.kind === 'soul-blight' && e.loss === true));
});

test('虚无联动与造牌联动（S07、S08）：抽到虚无牌再抽 1 张、打出虚无牌获得格挡；每生成一张临时牌获得攻击力与格挡', () => {
    const pull = free('v', 'power', [selfOn('void-draw', 1)]);
    const dig = free('d', 'skill', [{ op: 'draw', amount: 1 }]);
    const wisp = def('e', 'skill', [{ op: 'block', amount: 1, target: 'self' }], { ethereal: true });
    const run = (withPull) => {
        const t = startDeck({ v: pull, d: dig, e: wisp, k: GUARD }, ['v', 'd', 'e', 'e', 'e', 'e', ...Array(8).fill('k')]);
        const draw = t.piles.hero.draw;
        const ei = draw.find((inst) => t.cards[inst].cardId === 'e');
        const ki = draw.find((inst) => t.cards[inst].cardId === 'k');
        assert.ok(ei && ki, 'draw pile lacks a needed card');
        t.piles.hero.draw = [...draw.filter((inst) => inst !== ei && inst !== ki), ki, ei];
        const u = withPull ? playIn(t, instOf(t, 'v')).state : t;
        const before = u.piles.hero.hand.length;
        return playIn(u, instOf(u, 'd')).state.piles.hero.hand.length - before;
    };
    assert.deepEqual([run(true), run(false)], [1, 0]);
    const ward = free('g', 'power', [selfOn('void-guard', 4)]);
    const ghost = def('e', 'skill', [{ op: 'block', amount: 1, target: 'self' }], { ethereal: true, innate: true });
    const g = deckOf({ g: ward, e: ghost }, ['g', 'e']);
    const gu = playIn(g, instOf(g, 'g')).state;
    assert.equal(playIn(gu, instOf(gu, 'e')).state.units.hero.block, 5);
    const craft = free('c', 'power', [selfOn('craft-guard', 3), selfOn('craft-might', 1)]);
    const make = free('m', 'skill', [{ op: 'create', card: 'token-shard', amount: 1, to: 'hand' }]);
    const c = deckOf({ c: craft, m: make }, ['c', 'm']);
    const cu = playIn(c, instOf(c, 'c')).state;
    const made = playIn(cu, instOf(cu, 'm')).state.units.hero;
    assert.deepEqual([made.statuses.strength, made.block], [1, 3]);
});

test('召唤模板（S01–S08）：可反解、归 summon 族只给召唤；造牌联动归 conjure 族召唤可用；牌面写明召唤、随从、牺牲、魂牌与灾厄', () => {
    const keys = ['bone-call', 'bone-poke', 'bone-sweep', 'bone-rush', 'bone-wall', 'bone-nova', 'bone-armor', 'soul-bind', 'doom-mark', 'doom-touch', 'doom-reap', 'soul-harvest', 'soul-feast', 'soul-blight', 'void-draw', 'void-guard'];
    for (const key of [...keys, 'craft-might', 'craft-guard']) {
        const found = solvedAny(key);
        assert.ok(found, key);
        const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
        assert.equal(checked.ok, true, `${key} ${JSON.stringify(checked.errors)}`);
        assert.equal(templateAllowedFor(key, 'summoner'), true, key);
    }
    for (const key of keys) {
        assert.equal(templateFamily(key), 'summon', key);
        for (const other of ['bard', 'mage', 'priest']) assert.equal(templateAllowedFor(key, other), false, `${key}:${other}`);
    }
    assert.deepEqual([templateFamily('craft-might'), templateFamily('craft-guard')], ['conjure', 'conjure']);
    for (const [effect, word] of [[sumOp(3), '召唤'], [minionHit(4), '随从'], [{ op: 'sacrifice', mode: 'block' }, '牺牲'], [{ op: 'soul', amount: 1 }, '魂牌'], [onFoe('doom', 3), '灾厄']]) {
        assert.ok(describeEffects([effect]).includes(word), word);
    }
});


// ---------- 规则 v5 P4a 敌方状态反应（E01–E08；含游侠 R06 破空） ----------
const foeWith = (skill, statuses, extra = []) => foe(skill, { passives: [{ id: 'p-foe', trigger: 'battle-start', effects: [...Object.entries(statuses).map(([status, stacks]) => ({ op: 'apply-status', status, stacks, target: 'self' })), ...extra] }] });
const battleOf = (catalog, deck, foeUnit, rv) => {
    const setup = { controlledId: 'hero', canEscape: true, units: [hero({}, { deck, catalog: { ...catalog, k: GUARD } }), foeUnit], ...(rv ? { rulesVersion: rv } : {}) };
    const created = createBattle(setup, 7);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    return created.state;
};
const padded = (ids) => [...ids, ...Array(Math.max(0, 10 - ids.length)).fill('k')];

test('晕厥（E01）：主角晕厥时跳过整个玩家回合，回合开始与结束照常结算；跳过后到下一次正常行动前再施加的晕厥被抵消；规则 v4 无效', () => {
    const daze = { intent: 'attack', effects: [{ op: 'damage', amount: 2, target: 'enemy' }, { op: 'apply-status', status: 'stun', stacks: 1, target: 'enemy' }] };
    const run = (rv) => {
        const t = battleOf({}, padded([]), foe(daze), rv);
        return { t, r: endTurn(t) };
    };
    const v5 = run();
    const s = v5.r.state;
    assert.equal(v5.r.events.filter((e) => e.type === 'stunned' && e.unitId === 'hero').length, 1);
    assert.deepEqual([s.units.hero.hp, s.turn, s.phase, s.units.hero.statuses.stun], [26, v5.t.turn + 2, 'player', undefined]);
    const v4 = run(4);
    assert.deepEqual([v4.r.state.units.hero.hp, v4.r.state.turn], [28, v4.t.turn + 1]);
});

test('飞行（E02）与破空（R06）：飞行单位受攻击伤害减半，每被命中一次减 1 层，减到 0 坠落并晕厥、跳过下一次行动；破空使多段攻击每段额外计 1 次；规则 v4 无效', () => {
    const shot = free('x', 'attack', [hitFoe(6)]);
    const run = (rv) => {
        let u = battleOf({ x: shot }, padded(['x', 'x', 'x']), foeWith(foeAttack(5), { flying: 3 }), rv);
        for (let i = 0; i < 3; i += 1) u = playIn(u, instOf(u, 'x'), 'foe').state;
        return u;
    };
    const v5 = run();
    assert.deepEqual([v5.units.foe.hp, v5.units.foe.statuses.flying, v5.units.foe.statuses.stun], [21, undefined, 1]);
    const after = endTurn(v5);
    assert.ok(after.events.some((e) => e.type === 'stunned' && e.unitId === 'foe'));
    assert.equal(after.state.units.hero.hp, 30);
    assert.equal(endTurn(after.state).state.units.hero.hp, 25);
    assert.equal(run(4).units.foe.hp, 12);
    const twin = free('t', 'attack', [hitFoe(4, 2)]);
    const sky = free('s', 'power', [selfOn('skybreaker', 1)]);
    const multi = (withSky) => {
        const t = battleOf({ t: twin, s: sky }, padded(withSky ? ['s', 't'] : ['t']), foeWith({}, { flying: 3 }));
        const u = withSky ? playIn(t, instOf(t, 's')).state : t;
        return playIn(u, instOf(u, 't'), 'foe').state.units.foe.statuses;
    };
    const withSky = multi(true);
    const plain = multi(false);
    assert.deepEqual([withSky.flying, withSky.stun], [undefined, 1]);
    assert.deepEqual([plain.flying, plain.stun], [1, undefined]);
});

test('失衡（E03）：格挡被攻击完全打空时晕厥；规则 v4 无效', () => {
    const shot = free('x', 'attack', [hitFoe(6)]);
    const run = (rv) => {
        const t = battleOf({ x: shot }, padded(['x']), foeWith({}, { unsteady: 1 }, [{ op: 'block', amount: 5, target: 'self' }]), rv);
        return playIn(t, instOf(t, 'x'), 'foe');
    };
    const v5 = run();
    assert.ok(v5.events.some((e) => e.type === 'off-balance' && e.unitId === 'foe'));
    assert.equal(v5.state.units.foe.statuses.stun, 1);
    assert.equal(run(4).state.units.foe.statuses.stun, undefined);
});

test('应变（E04）：技能单位被攻击后，这次出手结束时重选意图；规则 v4 无效', () => {
    const shot = free('x', 'attack', [hitFoe(2)]);
    const run = (rv) => {
        const t = battleOf({ x: shot }, padded(['x']), foeWith(foeAttack(3), { adapt: 1 }), rv);
        return playIn(t, instOf(t, 'x'), 'foe').events.filter((e) => e.type === 'intent' && e.unitId === 'foe').length;
    };
    assert.deepEqual([run(), run(4)], [1, 0]);
});

test('硬化（E05）：每次受攻击获得格挡且逐次 +1，回合开始重置；规则 v4 无效', () => {
    const twin = free('t', 'attack', [hitFoe(5, 2)]);
    const run = (rv) => {
        const t = battleOf({ t: twin }, padded(['t']), foeWith({}, { harden: 3 }), rv);
        return playIn(t, instOf(t, 't'), 'foe').state;
    };
    const v5 = run();
    assert.deepEqual([v5.units.foe.hp, v5.units.foe.block, v5.units.foe.res?.hardenCount], [23, 4, 2]);
    assert.equal(endTurn(v5).state.units.foe.res?.hardenCount, undefined);
    const v4 = run(4);
    assert.deepEqual([v4.units.foe.hp, v4.units.foe.block], [20, 0]);
});

test('激怒（E06）：对方打出技能或能力牌时获得攻击力，攻击牌不触发；规则 v4 无效', () => {
    const shot = free('x', 'attack', [hitFoe(1)]);
    const ward = free('w', 'skill', [{ op: 'block', amount: 1, target: 'self' }]);
    const run = (rv) => {
        const t = battleOf({ x: shot, w: ward }, padded(['x', 'w']), foeWith({}, { enrage: 2 }), rv);
        const u = playIn(t, instOf(t, 'x'), 'foe').state;
        return [u.units.foe.statuses.strength, playIn(u, instOf(u, 'w')).state.units.foe.statuses.strength];
    };
    assert.deepEqual(run(), [undefined, 2]);
    assert.deepEqual(run(4), [undefined, undefined]);
});

test('刺甲（E07）：攻击牌命中带刺甲的敌人，出牌者按层数受到一次伤害，不按段数；规则 v4 无效', () => {
    const tri = free('t', 'attack', [hitFoe(1, 3)]);
    const run = (rv) => {
        const t = battleOf({ t: tri }, padded(['t']), foeWith({}, { barbed: 3 }), rv);
        return playIn(t, instOf(t, 't'), 'foe');
    };
    const v5 = run();
    assert.equal(v5.state.units.hero.hp, 27);
    assert.equal(v5.events.filter((e) => e.type === 'damage' && e.source?.id === 'barbed').length, 1);
    assert.equal(run(4).state.units.hero.hp, 30);
});

test('时滞（E08）：主角本回合每出满 12 张牌即强制结束回合，带时滞者获得攻击力；规则 v4 无效', () => {
    const dig = def('d', 'skill', [{ op: 'draw', amount: 1 }], { cost: 0 });
    const run = (rv) => {
        let s = battleOf({ d: dig }, Array(20).fill('d'), foeWith({}, { 'time-warp': 1 }), rv);
        const turn = s.turn;
        const ends = [];
        for (let i = 0; i < 12; i += 1) {
            const r = playIn(s, instOf(s, 'd'));
            ends.push(r.events.some((e) => e.type === 'turn-end'));
            s = r.state;
        }
        return { ends, s, turn };
    };
    const v5 = run();
    assert.deepEqual([v5.ends.indexOf(true), v5.ends.filter(Boolean).length], [11, 1]);
    assert.deepEqual([v5.s.units.foe.statuses.strength, v5.s.turn, v5.s.phase], [1, v5.turn + 1, 'player']);
    const v4 = run(4);
    assert.deepEqual([v4.ends.includes(true), v4.s.units.foe.statuses.strength], [false, undefined]);
});

test('敌方状态反应模板与词缀（E01、E02、R06）：晕厥与飞行技能可用；破空归 quarry 族只给游侠；新词缀只在限定阶级出现', async () => {
    const { skillFromTemplate } = await import('../src/combat/card-templates.js');
    const { enemyAffixes } = await import('../src/combat/enemy-loadout.js');
    assert.ok(skillFromTemplate('concuss', 12).effects.some((e) => e.op === 'apply-status' && e.status === 'stun'));
    assert.ok(skillFromTemplate('soar', 12).effects.some((e) => e.op === 'apply-status' && e.status === 'flying'));
    const found = solvedAny('skybreak');
    assert.ok(found);
    const checked = normalizeCard({ id: 'x', name: '牌', cost: found.cost, rarity: found.rarity, ...found.solved });
    assert.equal(checked.ok, true, JSON.stringify(checked.errors));
    assert.equal(templateFamily('skybreak'), 'quarry');
    assert.equal(templateAllowedFor('skybreak', 'ranger'), true);
    for (const other of ['bard', 'mage', 'summoner']) assert.equal(templateAllowedFor('skybreak', other), false, other);
    const limits = { 'af-flight': ['normal', 'elite'], 'af-unsteady': ['elite'], 'af-adapt': ['elite'], 'af-harden': ['normal'], 'af-enrage': ['elite', 'boss'], 'af-barbed': ['elite'], 'af-time-warp': ['boss'] };
    const seen = new Set();
    for (const tier of ['normal', 'elite', 'boss']) {
        for (let i = 0; i < 60; i += 1) {
            for (const a of enemyAffixes({ id: `e${i}`, tier }, 'nightmare')) {
                seen.add(a.id);
                if (limits[a.id]) assert.ok(limits[a.id].includes(tier), `${a.id}:${tier}`);
            }
        }
    }
    assert.ok(seen.has('af-time-warp'));
    assert.ok(describeEffects([onFoe('stun', 1)]).includes('晕厥'));
});

// ---------- 规则 v5 P4b 子批 1：E09 背击、E12 爪牙绑定、E13 召唤爪牙 ----------
const callMinion = (amount, hp, damage) => ({ intent: 'special', effects: [{ op: 'summon-minion', amount, hp, damage }] });
const livingFoes = (s) => s.order.filter((id) => s.units[id].side === 'enemy' && s.units[id].alive);

test('背击（E09）：主角打出指定敌人的牌时转向它，带背击的另一名敌人从背后攻击伤害 ×1.5；面向背击者时照常；规则 v4 无效', () => {
    const poke = free('x', 'attack', [hitFoe(1)]);
    const run = (aim, rv) => {
        const flanker = foe(foeAttack(4), { id: 'foe2', name: '他', ...selfStatus('flank', 1) });
        const setup = { controlledId: 'hero', canEscape: true, units: [hero({}, { deck: padded(['x']), catalog: { x: poke, k: GUARD } }), foe(foeAttack(4)), flanker], ...(rv ? { rulesVersion: rv } : {}) };
        const created = createBattle(setup, 7);
        assert.equal(created.ok, true, JSON.stringify(created.error));
        const played = playIn(created.state, instOf(created.state, 'x'), aim);
        return { played, ended: endTurn(played.state) };
    };
    const back = run('foe');
    assert.equal(back.played.state.units.hero.res?.facing, 'foe');
    assert.ok(back.played.events.some((e) => e.type === 'face' && e.targetId === 'foe'));
    assert.equal(back.ended.state.units.hero.hp, 20);
    assert.equal(run('foe2').ended.state.units.hero.hp, 22);
    const v4 = run('foe', 4);
    assert.deepEqual([v4.ended.state.units.hero.hp, v4.played.state.units.hero.res], [22, undefined]);
});

test('召唤爪牙（E13）与爪牙绑定（E12）：受控入场写 minion / minionOf；召唤者倒下时爪牙退场，不算倒下，战报写「退场」；规则 v4 无效', () => {
    const smash = free('x', 'attack', [hitFoe(40)]);
    const run = (rv) => {
        const t = battleOf({ x: smash }, Array(10).fill('x'), foe(callMinion(1, 10, 3)), rv);
        const summoned = endTurn(t);
        const killed = playIn(summoned.state, instOf(summoned.state, 'x'), 'foe');
        return { summoned, killed };
    };
    const v5 = run();
    const s = v5.summoned.state;
    assert.deepEqual(s.order, ['hero', 'foe', 'foe-m1']);
    assert.deepEqual([s.units['foe-m1'].minion, s.units['foe-m1'].minionOf, s.units['foe-m1'].maxHp, s.units['foe-m1'].alive], [true, 'foe', 10, true]);
    assert.ok(v5.summoned.events.some((e) => e.type === 'minion-enter' && e.unitId === 'foe-m1' && e.ownerId === 'foe'));
    assert.ok(s.intents['foe-m1'], '爪牙入场即规划意图');
    const k = v5.killed;
    assert.equal(k.state.outcome, 'victory');
    assert.deepEqual([k.state.units['foe-m1'].alive, k.state.units['foe-m1'].left], [false, true]);
    assert.ok(k.events.some((e) => e.type === 'minion-leave' && e.unitId === 'foe-m1'));
    assert.equal(k.events.some((e) => e.type === 'defeated' && e.unitId === 'foe-m1'), false);
    const report = buildCombatReport({ combatId: 'c-minion', state: k.state, events: [...v5.summoned.events, ...k.events] });
    assert.equal(report.ok, true);
    assert.ok(report.text.includes('爪牙 退场'), report.text);
    const v4 = run(4);
    assert.deepEqual([v4.summoned.state.order, v4.summoned.events.some((e) => e.type === 'minion-enter')], [['hero', 'foe'], false]);
});

test('召唤爪牙（E13）：场上存活敌人最多 5 名，满员时不再入场；新单位 id 顺延且不重复', () => {
    let s = battleOf({}, padded([]), foe(callMinion(2, 8, 1)));
    const counts = [];
    for (let i = 0; i < 3; i += 1) {
        s = endTurn(s).state;
        counts.push(livingFoes(s).length);
    }
    assert.deepEqual(counts, [3, 5, 5]);
    assert.deepEqual(s.order, ['hero', 'foe', 'foe-m1', 'foe-m2', 'foe-m3', 'foe-m4']);
    assert.equal(new Set(s.order).size, s.order.length);
});

test('爪牙模板（E12、E13）：call-minion 生成 summon-minion 技能；背击状态有显示名', async () => {
    const { skillFromTemplate } = await import('../src/combat/card-templates.js');
    const called = skillFromTemplate('call-minion', 12);
    assert.equal(called.intent, 'special');
    assert.deepEqual(called.effects, [{ op: 'summon-minion', amount: 1, hp: 18, damage: 3 }]);
    assert.ok(describeEffects([onFoe('flank', 1)]).includes('背击'));
});

// ---------- 规则 v5 P4b 子批 2：E10 分裂、E11 复生 ----------
test('分裂（E10）：生命降到一半及以下时原单位退场（不算倒下），分出两只子体，生命取原单位当前值，子体不再分裂；规则 v4 无效', () => {
    const cut = free('x', 'attack', [hitFoe(16)]);
    const run = (rv) => {
        const t = battleOf({ x: cut }, Array(10).fill('x'), foeWith(foeAttack(5), { split: 1 }), rv);
        return playIn(t, instOf(t, 'x'), 'foe');
    };
    const v5 = run();
    const s = v5.state;
    assert.deepEqual(s.order, ['hero', 'foe', 'foe-s1', 'foe-s2']);
    assert.deepEqual([s.units.foe.alive, s.units.foe.left, s.outcome], [false, 'split', null]);
    for (const id of ['foe-s1', 'foe-s2']) {
        assert.deepEqual([s.units[id].maxHp, s.units[id].hp, s.units[id].splitFrom, s.units[id].alive], [14, 14, 'foe', true], id);
        assert.ok(s.intents[id], `${id} 入场即规划意图`);
    }
    assert.ok(v5.events.some((e) => e.type === 'split' && e.unitId === 'foe' && e.into.length === 2));
    assert.equal(v5.events.some((e) => e.type === 'defeated' && e.unitId === 'foe'), false);
    const ended = endTurn(s);
    assert.equal(ended.events.filter((e) => e.type === 'skill' && String(e.unitId).startsWith('foe-s')).length, 2);
    assert.equal(ended.state.units.hero.hp, 20);
    const again = playIn(ended.state, instOf(ended.state, 'x'), 'foe-s1');
    assert.equal(again.events.some((e) => e.type === 'split'), false);
    const report = buildCombatReport({ combatId: 'c-split', state: { ...again.state, outcome: 'victory' }, events: [...v5.events, ...ended.events, ...again.events] });
    assert.ok(report.text.includes('分裂'), report.text);
    const v4 = run(4);
    assert.deepEqual([v4.state.order, v4.state.units.foe.hp, v4.state.units.foe.alive], [['hero', 'foe'], 14, true]);
});

const reviveSetup = (deck, rv, reserve) => {
    const units = [
        hero({}, { deck, catalog: { x: free('x', 'attack', [hitFoe(40)]), k: GUARD } }),
        foeWith(foeAttack(1), { revive: 1 }),
        foe(foeAttack(1), { id: 'foe2', name: '他' }),
        ...(reserve ? [foe(foeAttack(1), { id: 'foe3', name: '它' })] : []),
    ];
    const created = createBattle({ controlledId: 'hero', canEscape: true, units, ...(reserve ? { reserve: ['foe3'] } : {}), ...(rv ? { rulesVersion: rv } : {}) }, 7);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    return created.state;
};

test('复生（E11）：带不灭的敌人倒下 2 回合后以一半生命复活，期间不被后备顶位；规则 v4 无效', () => {
    const run = (rv) => {
        const t = reviveSetup(padded(['x']), rv, true);
        const killed = playIn(t, instOf(t, 'x'), 'foe');
        const t2 = endTurn(killed.state);
        const t3 = endTurn(t2.state);
        return { killed, t2, t3 };
    };
    const v5 = run();
    assert.ok(v5.killed.events.some((e) => e.type === 'revive-pending' && e.unitId === 'foe' && e.at === 3));
    assert.equal(v5.killed.events.some((e) => e.type === 'reinforce'), false);
    assert.deepEqual(v5.killed.state.order, ['hero', 'foe', 'foe2']);
    assert.equal(v5.t2.state.units.foe.alive, false);
    const s = v5.t3.state;
    assert.deepEqual([s.turn, s.units.foe.alive, s.units.foe.hp, s.units.foe.statuses, s.units.foe.res?.reviveAt], [3, true, 15, { revive: 1 }, undefined]);
    assert.ok(v5.t3.events.some((e) => e.type === 'revive' && e.unitId === 'foe' && e.hp === 15));
    assert.ok(s.intents.foe, '复活后重新规划意图');
    const v4 = run(4);
    assert.equal(v4.killed.events.some((e) => e.type === 'revive-pending'), false);
    assert.ok(v4.killed.events.some((e) => e.type === 'reinforce' && e.unitId === 'foe3'));
    assert.equal(v4.t3.state.units.foe.alive, false);
});

test('复生（E11）：同组其余敌人全部倒下时直接判胜，待复生单位不再复活', () => {
    const t = reviveSetup(padded(['x', 'x']));
    const first = playIn(t, instOf(t, 'x'), 'foe');
    assert.equal(first.state.outcome, null);
    const second = playIn(first.state, instOf(first.state, 'x'), 'foe2');
    assert.equal(second.state.outcome, 'victory');
    assert.equal(second.state.units.foe.alive, false);
});

test('分裂与复生词缀（E10、E11）：只在限定阶级出现；状态有显示名', async () => {
    const { enemyAffixes } = await import('../src/combat/enemy-loadout.js');
    const limits = { 'af-split': ['normal', 'boss'], 'af-revive': ['normal'] };
    const seen = new Set();
    for (const tier of ['normal', 'elite', 'boss']) {
        for (let i = 0; i < 80; i += 1) {
            for (const a of enemyAffixes({ id: `e${i}`, tier }, 'nightmare')) {
                seen.add(a.id);
                if (limits[a.id]) assert.ok(limits[a.id].includes(tier), `${a.id}:${tier}`);
            }
        }
    }
    assert.ok(seen.has('af-split') && seen.has('af-revive'), [...seen].join(','));
    assert.ok(describeEffects([onFoe('split', 1)]).includes('分裂'));
    assert.ok(describeEffects([onFoe('revive', 1)]).includes('不灭'));
});

// ---------- 规则 v5 P4b 子批 3：E17 自爆倒计时与限时撤离（D11） ----------
const exitSetup = (status, rv) => battleOf({}, padded([]), foe(foeAttack(1), { maxHp: 10, ...selfStatus(status, 1) }), rv);

test('自爆（E17）：倒计时在自己回合结束时归 0，对方全体受到等于自身当前生命的伤害后离场，不算倒下；无其余敌人即判胜；规则 v4 无效', () => {
    const v5 = endTurn(exitSetup('fuse'));
    const s = v5.state;
    assert.deepEqual([s.outcome, s.units.hero.hp, s.units.foe.alive, s.units.foe.left, s.noLoot], ['victory', 19, false, 'explode', undefined]);
    assert.ok(v5.events.some((e) => e.type === 'blast' && e.unitId === 'foe' && e.amount === 10));
    assert.ok(v5.events.some((e) => e.type === 'unit-leave' && e.unitId === 'foe' && e.reason === 'explode'));
    assert.equal(v5.events.some((e) => e.type === 'defeated' && e.unitId === 'foe'), false);
    const report = buildCombatReport({ combatId: 'c-fuse', state: s, events: v5.events });
    assert.deepEqual([report.ok, report.result, report.noLoot], [true, 'win', undefined]);
    assert.ok(report.text.includes('她 自爆'), report.text);
    const v4 = endTurn(exitSetup('fuse', 4));
    assert.deepEqual([v4.state.outcome, v4.state.units.hero.hp, v4.state.units.foe.alive], [null, 29, true]);
});

test('限时撤离（E17 / D11）：遁逃归 0 时敌人撤离，记为胜利但战报带 noLoot、终局写有敌人撤离；规则 v4 无效', () => {
    const v5 = endTurn(exitSetup('flee'));
    const s = v5.state;
    assert.deepEqual([s.outcome, s.units.hero.hp, s.units.foe.left, s.noLoot], ['victory', 29, 'fled', true]);
    assert.ok(v5.events.some((e) => e.type === 'unit-leave' && e.reason === 'fled'));
    const report = buildCombatReport({ combatId: 'c-flee', state: s, events: v5.events });
    assert.deepEqual([report.ok, report.result, report.noLoot], [true, 'win', true]);
    assert.ok(report.text.includes('有敌人趁乱撤离'), report.text);
    assert.ok(report.text.includes('她 撤离'), report.text);
    const v4 = endTurn(exitSetup('flee', 4));
    assert.deepEqual([v4.state.outcome, v4.state.units.foe.alive, v4.state.noLoot], [null, true, undefined]);
});

test('自爆与遁逃词缀（E17）：只在普通阶级出现；状态有显示名', async () => {
    const { enemyAffixes } = await import('../src/combat/enemy-loadout.js');
    const seen = new Set();
    for (const tier of ['normal', 'elite', 'boss']) {
        for (let i = 0; i < 80; i += 1) {
            for (const a of enemyAffixes({ id: `e${i}`, tier }, 'nightmare')) {
                seen.add(`${a.id}:${tier}`);
                if (a.id === 'af-fuse' || a.id === 'af-flee') assert.equal(tier, 'normal', `${a.id}:${tier}`);
            }
        }
    }
    assert.ok(seen.has('af-fuse:normal') && seen.has('af-flee:normal'));
    assert.ok(describeEffects([onFoe('fuse', 2)]).includes('自爆'));
    assert.ok(describeEffects([onFoe('flee', 2)]).includes('遁逃'));
});

