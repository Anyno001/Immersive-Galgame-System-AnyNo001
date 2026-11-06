import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChallengeStart } from '../src/scene/challenge-directives.js';
import {
    INTIMATE_ENDINGS, explicitAgeOf, floorHasNewRise, intimateEnding, markForEnding, normalizeIntimateSettings, resolveIntimatePosition, underageByProfile,
} from '../src/scene/intimate-duel.js';
import { resolveIntimatePhase } from '../src/visual/igs-ui/romance-intimate.js';
import { applyChallenge } from '../src/scene/stats/stat-challenge.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { buildIntimateDeck } from '../src/combat/intimate-cards.js';
import { buildIntimateSetup, foldIntimateTrace, initIntimateTrace } from '../src/combat/intimate-setup.js';
import { createBattle } from '../src/combat/engine.js';
import { challengeResultOf } from '../src/combat/challenge-setup.js';
import { buildChallengeReport, parseChallengeReport } from '../src/combat/challenge-report.js';
import { resolveChallengePromptSegment } from '../src/scene/combat-prompt.js';
import { normalizeCombatExpansionSettings } from '../src/visual/igs-ui/combat-settings.js';

const TAG = '她的呼吸近在耳边。\n[igs-challenge:夜里的靠近|亲密|合拍|普通]';
const open = { on: true, ageBlocked: false, newRise: true, fought: false, eventKey: 7, partner: '小林', favor: 40, grudge: 0 };
const parse = (text, intimate) => parseChallengeStart(text, { intimate });

test('标签所在楼没有新的升温段时不出入口并记诊断', () => {
    const result = parse(TAG, { ...open, newRise: false });
    assert.equal(result.start, null);
    assert.ok(result.diagnostics.some((d) => d.code === 'intimate-no-span'));
});

test('同一事件第二次写标签被丢弃', () => {
    const result = parse(TAG, { ...open, fought: true });
    assert.equal(result.start, null);
    assert.ok(result.diagnostics.some((d) => d.code === 'intimate-already-fought'));
});

test('两个条件满足时给出带事件键的亲密起点，且不受日常额度限制', () => {
    const result = parseChallengeStart(TAG, { intimate: open, quota: { ok: false, reason: 'quota' } });
    assert.equal(result.start.intimate, true);
    assert.equal(result.start.mechanic, '合拍');
    assert.equal(result.start.eventKey, 7);
    assert.equal(result.start.counterpart, '小林');
});

test('亲密对决关闭时标签不生效', () => {
    const result = parse(TAG, { ...open, on: false });
    assert.equal(result.start, null);
    assert.ok(result.diagnostics.some((d) => d.code === 'intimate-off'));
});

test('机制缺省或写错时按仇怨与好感兜底', () => {
    const bare = '[igs-challenge:夜里|亲密]';
    assert.equal(parse(bare, open).start.mechanic, '合拍');
    assert.equal(parse('[igs-challenge:夜里|亲密|乱写]', { ...open, favor: 0, grudge: 30 }).start.mechanic, '主导');
    assert.ok(parse('[igs-challenge:夜里|亲密|乱写]', open).diagnostics.some((d) => d.code === 'intimate-mechanic-fallback'));
});

test('跨楼延续的段不算新事件，新段的升温页才算', () => {
    const rise = { index: 0, length: 5, continued: false, endsInFloor: true };
    const carried = { index: 0, length: 5, continued: true, endsInFloor: true };
    assert.equal(resolveIntimatePhase(rise), 'rise');
    assert.equal(floorHasNewRise([{ nsfwSpan: carried }], resolveIntimatePhase), false);
    assert.equal(floorHasNewRise([{ nsfwSpan: null }, { nsfwSpan: rise }], resolveIntimatePhase), true);
    assert.equal(floorHasNewRise([{ nsfwSpan: { ...rise, index: 3 } }], resolveIntimatePhase), false);
});

test('档案显式写明未满 18 岁的数字年龄时拦截，外观词与未写年龄不拦截', () => {
    assert.equal(underageByProfile(['年龄：17岁，银发']), true);
    assert.equal(underageByProfile(['她今年15岁']), true);
    assert.equal(underageByProfile(['身材娇小，看起来很年轻']), false);
    assert.equal(underageByProfile(['成年女性，自称二十岁']), false);
    assert.equal(underageByProfile(['年龄：18岁']), false);
    assert.equal(underageByProfile([]), false);
    assert.equal(explicitAgeOf('没有数字'), null);
});

test('中文数字写法的未满 18 岁年龄被拦截', () => {
    for (const text of ['年龄：十六', '她十六岁', '十五周岁的少女', '二十五岁，年龄：九岁', '正是二八年华', '年龄：十七岁']) assert.equal(underageByProfile([text]), true, text);
    assert.equal(explicitAgeOf('年龄：二十五'), 25);
    assert.equal(explicitAgeOf('年龄：十'), 10);
    assert.equal(underageByProfile(['年龄：十八']), false);
    assert.equal(underageByProfile(['二十岁的大学生']), false);
    assert.equal(underageByProfile(['年龄：九十九岁']), false);
});

test('回忆里的年龄不拦截，带年龄标签的写法不受影响', () => {
    for (const text of ['十年前，她15岁时遇见了他', '15岁那年她离开了家', '从12岁起她开始学琴', '她14岁的时候就会做饭', '三年前她16岁', '当年15岁的她', '15岁以前她都住在山里', '15岁之前一直在乡下']) assert.equal(underageByProfile([text]), false, text);
    assert.equal(underageByProfile(['年龄：16岁，十年前她20岁时嫁人']), true);
    assert.equal(underageByProfile(['年龄：15岁那年']), true);
    assert.equal(underageByProfile(['目前15岁']), true);
});

test('文中有多个当前年龄时任一小于 18 即拦截', () => {
    assert.equal(underageByProfile(['姐姐25岁，妹妹16岁']), true);
    assert.equal(underageByProfile(['姐姐25岁，妹妹十九岁']), false);
    assert.equal(underageByProfile(['十年前她15岁时出走，现年二十五岁']), false);
    assert.equal(underageByProfile(['她15岁时出走', '妹妹十七岁']), true);
});

test('只写及笄或娇小、没有数字的档案照常放行', () => {
    assert.equal(underageByProfile(['已及笄，身材娇小']), false);
    assert.equal(underageByProfile(['娇小可爱，年龄：成年']), false);
    assert.equal(underageByProfile(['十分年轻，年纪：十分小']), false);
    const result = parse(TAG, { ...open, ageBlocked: underageByProfile(['已及笄，娇小']) });
    assert.equal(result.start.intimate, true);
});

test('年龄拦截时不出入口', () => {
    const result = parse(TAG, { ...open, ageBlocked: true });
    assert.equal(result.start, null);
    assert.ok(result.diagnostics.some((d) => d.code === 'intimate-age-blocked'));
});

test('合拍各结局判定边界', () => {
    const f = (result, heroRatio, trace = {}) => intimateEnding({ mechanic: '合拍', result, heroRatio, trace });
    assert.equal(f('win', 0.6), '水到渠成');
    assert.equal(f('win', 0.59), '小插曲');
    assert.equal(f('win', 0.2, { rapport: 3 }), '心意相通');
    assert.equal(f('win', 0.9, { rapport: 2 }), '水到渠成');
    assert.equal(f('lose', 0, { interruptHit: true }), '被打断');
    assert.equal(f('lose', 0, {}), '草草收场');
    assert.equal(f('escape', 0.5), '停下');
});

test('主导权各结局判定边界', () => {
    const f = (result, heroRatio, trace = {}) => intimateEnding({ mechanic: '主导', result, heroRatio, trace });
    assert.equal(f('win', 0.5), '我方主导');
    assert.equal(f('win', 0.49), '险胜');
    assert.equal(f('lose', 0), '对方主导');
    assert.equal(f('win', 0.9, { swaps: 3 }), '反复易手');
    assert.equal(f('win', 0.9, { swaps: 2 }), '我方主导');
    assert.equal(f('lose', 0, { bothZero: true }), '同归于尽');
    assert.equal(f('escape', 0.8, { surrendered: true }), '甘拜下风');
    assert.equal(f('escape', 0.8, {}), '停下');
    assert.deepEqual([...INTIMATE_ENDINGS.主导].sort(), ['同归于尽', '反复易手', '对方主导', '我方主导', '甘拜下风', '险胜'].sort());
});

const stateAt = (turn, hero, foe) => ({ turn, units: { hero: { hp: hero, maxHp: 100 }, foe: { hp: foe, maxHp: 100 } } });

test('易手次数由逐回合比较双方掌控比例得出', () => {
    let trace = initIntimateTrace();
    const rounds = [[1, 80, 60], [2, 50, 70], [3, 40, 30], [4, 20, 30], [5, 20, 10], [6, 10, 10]];
    for (const [turn, hero, foe] of rounds) trace = foldIntimateTrace(trace, stateAt(turn, hero, foe), []);
    assert.equal(trace.swaps, 3);
});

test('同一回合双方掌控一起归零记为同归于尽', () => {
    const trace = foldIntimateTrace(initIntimateTrace(), stateAt(2, 0, 0), []);
    assert.equal(trace.bothZero, true);
});

test('对方压力回合里我方未受损而对方受损时累计默契', () => {
    let trace = initIntimateTrace();
    const hit = [{ type: 'damage', target: 'foe', hpLoss: 6 }];
    trace = foldIntimateTrace(trace, stateAt(2, 100, 90), hit);
    assert.equal(trace.rapport, 1);
    trace = foldIntimateTrace(trace, stateAt(3, 90, 80), [...hit, { type: 'damage', target: 'hero', hpLoss: 4 }]);
    assert.equal(trace.rapport, 1);
});

test('打断意图未被「别管它」化解时命中', () => {
    let trace = foldIntimateTrace(initIntimateTrace(), stateAt(1, 100, 100), [{ type: 'intent', skillId: 'im-interrupt' }]);
    trace = foldIntimateTrace(trace, stateAt(1, 100, 100), [{ type: 'skill', skillId: 'im-interrupt' }]);
    assert.equal(trace.interruptHit, true);
    let saved = foldIntimateTrace(initIntimateTrace(), stateAt(1, 100, 100), [{ type: 'intent', skillId: 'im-interrupt' }]);
    saved = foldIntimateTrace(saved, stateAt(1, 100, 100), [{ type: 'card', cardId: 'im-stay' }, { type: 'skill', skillId: 'im-interrupt' }]);
    assert.equal(saved.interruptHit, false);
});

const withPartner = (intimate) => {
    const state = createStatsState();
    return { ...state, characters: { 小林: { ...createCharacter(1), ...(intimate ? { intimate } : {}) } } };
};
const ctx = () => ({ changes: [], events: [], diagnostics: [], flags: {}, random: () => 0.5 });
const directive = (ending, mechanic, extra = {}) => ({ kind: 'challenge', reportId: `r${ending}${mechanic}`, outcome: '圆满', tier: '普通', stake: '压力', counterpart: '小林', ending, mechanic, ...extra });

test('主导印记只存一层，新结局覆盖旧的', () => {
    let state = applyChallenge(withPartner(), directive('我方主导', '主导'), ctx());
    assert.equal(state.characters.小林.intimate.mark, 'suppressed');
    state = applyChallenge(state, directive('对方主导', '主导', { outcome: '失败' }), ctx());
    assert.equal(state.characters.小林.intimate.mark, 'defeated');
    assert.equal(markForEnding('反复易手'), null);
});

test('合拍胜利让紧张层数减一且不低于零，草草收场不降压力', () => {
    let state = applyChallenge(withPartner(), directive('水到渠成', '合拍'), ctx());
    assert.equal(state.characters.小林.intimate.tension, 2);
    for (const id of ['a', 'b', 'c']) state = applyChallenge(state, directive('小插曲', '合拍', { reportId: `r${id}` }), ctx());
    assert.equal(state.characters.小林.intimate.tension, 0);
    const stressed = { ...withPartner(), protagonist: { ...withPartner().protagonist, bars: { stamina: 100, money: 0, stress: 40 } } };
    const lost = applyChallenge(stressed, directive('草草收场', '合拍', { outcome: '失败' }), ctx());
    assert.equal(lost.protagonist.bars.stress, 40);
    const won = applyChallenge(stressed, directive('水到渠成', '合拍'), ctx());
    assert.ok(won.protagonist.bars.stress < 40);
});

test('停下不改压力与印记且不占日常额度', () => {
    const base = withPartner({ mark: 'suppressed', tension: 3 });
    const state = applyChallenge(base, directive('停下', '主导', { outcome: '放弃' }), ctx());
    assert.equal(state.characters.小林.intimate.mark, 'suppressed');
    assert.equal(state.clock.challenges, 0);
});

test('四套牌库都是 20 张且全部可解', () => {
    for (const mechanic of ['合拍', '主导']) {
        for (const position of ['receive', 'lead']) {
            const { deck, catalog } = buildIntimateDeck({ mechanic, position, skills: { 魅力: { value: 70 } }, favor: 70, grudge: 30 });
            assert.equal(deck.length, 20, `${mechanic}${position}`);
            for (const id of deck) assert.ok(catalog[id], id);
        }
    }
    const withDefy = buildIntimateDeck({ mechanic: '主导', position: 'receive', mark: 'defeated' });
    assert.ok(withDefy.deck.includes('im-defy'));
});

test('亲密局可以建局并被引擎接受', () => {
    const start = { event: '夜', intimate: true, mechanic: '主导', counterpart: '小林', tier: '普通', eventKey: 3 };
    const built = buildIntimateSetup({ start, state: { bars: { stamina: 100, stress: 0 }, skills: {}, favors: { 小林: -40 }, intimate: { 小林: { mark: 'suppressed' } } }, user: { name: '我' }, position: 'lead', persona: '傲娇' });
    assert.equal(built.ok, true);
    const created = createBattle({ rulesVersion: undefined, ...built.setup }, 5);
    assert.equal(created.ok, true);
    assert.equal(Object.hasOwn(built.setup.challenge, 'rounds'), false);
    assert.equal(challengeResultOf({ ...created.state, turn: 99 }, built.setup.challenge.rounds), null);
    assert.equal(challengeResultOf({ ...created.state, turn: 99 }, 5).byLimit, true);
    const revenge = built.setup.units[1].skills.find((skill) => skill.id === 'im-revenge');
    assert.ok(revenge.weight > 10);
});

test('亲密战报往返解析并映射到既有结局词', () => {
    const report = buildChallengeReport({ combatId: 'ch|5|0|launch|0', event: '夜', outcome: '圆满', ending: '水到渠成', mechanic: '合拍', counterpart: '小林', tier: '普通' });
    assert.equal(report.ok, true);
    assert.ok(!/\d/.test(report.text.split('\n')[1]));
    const parsed = parseChallengeReport(report.text);
    assert.equal(parsed.ending, '水到渠成');
    assert.equal(parsed.outcome, '圆满');
});

test('设置默认关闭，关闭时提示词不出现亲密语法', () => {
    assert.deepEqual(normalizeIntimateSettings(undefined), { enabled: false, position: 'receive', launch: true });
    assert.equal(normalizeCombatExpansionSettings({}).intimate.enabled, false);
    const off = { combatExpansion: { enabled: true, kind: 'daily', intimate: { enabled: false } }, intimateOn: true };
    assert.ok(!String(resolveChallengePromptSegment(off, { ok: true })?.content).includes('亲密对决'));
    const on = { combatExpansion: { enabled: true, kind: 'combat', intimate: { enabled: true } }, intimateOn: true };
    assert.ok(resolveChallengePromptSegment(on, { ok: true }).content.includes('亲密对决'));
    assert.equal(resolveChallengePromptSegment({ ...on, intimateOn: false }, { ok: true }), null);
});

test('位置按设置或剧情动词决定', () => {
    assert.equal(resolveIntimatePosition('lead', '', '我'), 'lead');
    assert.equal(resolveIntimatePosition('story', '小林压住了她的手腕', '阿明'), 'receive');
    assert.equal(resolveIntimatePosition('story', '阿明压住了她的手腕', '阿明'), 'lead');
});
