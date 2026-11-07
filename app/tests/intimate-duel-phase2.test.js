import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createBattle, replayBattle } from '../src/combat/engine.js';
import { normalizeCard } from '../src/combat/schema.js';
import { solveCardTemplate } from '../src/combat/card-templates.js';
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
    assert.deepEqual(ops('主导', '故作示弱'), ['delayed-counter']);
    assert.deepEqual(ops('主导', '拉扯'), ['mutual-damage']);
    assert.deepEqual(ops('合拍', '害羞躲闪'), ['random-branch']);
    const lure = Object.values(buildIntimateDeck({ mechanic: '主导', position: 'receive' }).catalog).find((card) => card.name === '故作示弱');
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
