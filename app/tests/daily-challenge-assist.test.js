import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createBattle } from '../src/combat/engine.js';
import { chooseAllyPlay } from '../src/combat/policy.js';
import { COMBAT_RULES, validateDeck } from '../src/combat/rules.js';
import { CARD_TEMPLATES } from '../src/combat/card-templates.js';
import { buildChallengeDeck, DOMAIN_CARDS, RELATED_MAX, RELATED_MIN, RELATED_SKILLS } from '../src/combat/challenge-cards.js';
import {
    ALLY_CARD_POOL, CHALLENGE_ALLY_MAX, CHALLENGE_ALLY_MIN_FAVOR, allyExclusiveCard, eligibleChallengeAllies, validateChallengeAllies,
} from '../src/combat/challenge-allies.js';
import { CHALLENGE_FOE_ID, CHALLENGE_HERO_ID, buildChallengeSetup, challengeResultOf } from '../src/combat/challenge-setup.js';
import { planChallengeReward } from '../src/combat/challenge-reward.js';
import { CHALLENGE_ACHIEVEMENTS, deriveChallengeHistory } from '../src/combat/challenge-history.js';
import { buildChallengeReport } from '../src/combat/challenge-report.js';
import { FAVOR_GATES, stageOf } from '../src/scene/stats/stat-favor.js';

const deckCounts = (deck) => deck.reduce((map, id) => map.set(id, (map.get(id) || 0) + 1), new Map());
const valid = ({ deck, catalog }) => validateDeck(deck, deckCounts(deck), new Map(Object.entries(catalog)));

test('相关技能高时顶替领域牌，卡组仍是合法的 20 张', () => {
    const plain = buildChallengeDeck({ domain: '烹饪', skillValue: 40 });
    const swapped = buildChallengeDeck({ domain: '烹饪', skillValue: 40, otherSkills: { 应变: { value: 70 }, 家务: 55, 照顾: 40, 烹饪: { value: 99 } } });
    assert.equal(swapped.deck.length, COMBAT_RULES.starterDeckSize);
    assert.ok(valid(swapped).ok, JSON.stringify(valid(swapped).errors));
    assert.deepEqual(swapped.related, ['应变', '家务']);
    assert.equal(swapped.catalog['ch-rel-push'].name, DOMAIN_CARDS.应变.tempo);
    assert.equal(swapped.catalog['ch-rel-hold'].name, DOMAIN_CARDS.家务.tempo);
    assert.equal(swapped.catalog['ch-rel-push'].rarity, 'rare');
    assert.equal(swapped.deck.filter((id) => id === 'ch-push').length, 2);
    assert.equal(swapped.deck.filter((id) => id === 'ch-hold').length, 2);
    assert.deepEqual(plain.related, []);
    assert.equal(plain.deck.length, swapped.deck.length);
});

test('相关技能不足门槛、领域自身或通用领域都不顶替；顶替最多两张', () => {
    const base = buildChallengeDeck({ domain: '话术', skillValue: 60 });
    for (const others of [undefined, {}, { 魅力: RELATED_MIN - 1 }, { 话术: 99 }, { 屠龙术: 99 }]) {
        const result = buildChallengeDeck({ domain: '话术', skillValue: 60, otherSkills: others });
        assert.deepEqual(result, { ...base, related: [] });
    }
    assert.deepEqual(buildChallengeDeck({ domain: '', skillValue: 60, otherSkills: { 应变: 90 } }).related, []);
    const crowded = buildChallengeDeck({ domain: '话术', skillValue: 60, otherSkills: { 魅力: 90, 应变: 80, 学习: 70 } });
    assert.equal(crowded.related.length, RELATED_MAX);
    assert.deepEqual(crowded.related, ['魅力', '应变']);
    for (const [domain, names] of Object.entries(RELATED_SKILLS)) for (const name of names) assert.ok(Object.hasOwn(DOMAIN_CARDS, name) && name !== domain, `${domain}:${name}`);
});

test('协助者好感门槛取「明确喜欢」阶段下限，即第一道关口之上', () => {
    assert.equal(CHALLENGE_ALLY_MIN_FAVOR, FAVOR_GATES[0] + 1);
    assert.equal(stageOf(CHALLENGE_ALLY_MIN_FAVOR).name, '明确喜欢');
    assert.equal(stageOf(CHALLENGE_ALLY_MIN_FAVOR - 1).name, '初步好感');
});

test('协助者必须在场且好感达标，最多两名，重复与难关对象不收', () => {
    const present = ['小雪', '阿梅', '老周', '路人', '林总'];
    const favors = { 小雪: 40, 阿梅: 26, 老周: 25, 路人: 90, 林总: 60, 不在场的人: 99 };
    assert.deepEqual(eligibleChallengeAllies({ present, favors }).map((a) => a.name), ['路人', '林总', '小雪', '阿梅']);
    const result = validateChallengeAllies(['小雪', '小雪', '老周', '不在场的人', '林总', '阿梅', '', null], { present, favors, exclude: ['林总'] });
    assert.deepEqual(result.accepted.map((a) => a.name), ['小雪', '阿梅']);
    assert.deepEqual(result.rejected.map((r) => r.reason), ['duplicate', 'favor-low', 'not-present', 'counterpart', 'invalid', 'invalid']);
    assert.equal(validateChallengeAllies(['小雪', '阿梅', '路人'], { present, favors }).rejected[0].reason, 'over-limit');
    assert.equal(CHALLENGE_ALLY_MAX, 2);
    assert.deepEqual(validateChallengeAllies(['小雪'], { favors }).rejected, [{ name: '小雪', reason: 'not-present' }]);
});

test('专属牌来自既有模板，同一人固定同一张，池里每项都能求解', () => {
    for (const [key, cost] of ALLY_CARD_POOL) {
        assert.ok(Object.hasOwn(CARD_TEMPLATES, key));
        assert.ok(allyExclusiveCard(`测试${key}${cost}`, 0));
    }
    const a = allyExclusiveCard('小雪', 0);
    assert.deepEqual(a, allyExclusiveCard('小雪', 0));
    assert.equal(a.name, '小雪相助');
    assert.equal(allyExclusiveCard('小雪', 1).id, 'ch-ally-2');
});

test('协助者以友军加入，每人给主角卡组一张专属牌，卡组合法且托管友军会出牌', () => {
    const state = { bars: { stamina: 100, stress: 0 }, skills: { 话术: { value: 60 } }, present: ['小雪', '阿梅', '路人'], favors: { 小雪: 40, 阿梅: 30, 路人: 5 } };
    const built = buildChallengeSetup({ start: { event: '公司终面', domain: '话术', tier: '普通', stake: '压力' }, state, user: { name: '我' }, allies: ['小雪', '阿梅', '路人'] });
    assert.deepEqual(built.setup.challenge.allies, ['小雪', '阿梅']);
    assert.deepEqual(built.allies.rejected, [{ name: '路人', reason: 'favor-low' }]);
    const hero = built.setup.units.find((u) => u.id === CHALLENGE_HERO_ID);
    assert.equal(hero.deck.length, COMBAT_RULES.starterDeckSize + 2);
    assert.equal(hero.deck.filter((id) => id.startsWith('ch-ally-')).length, 2);
    assert.ok(valid(hero).ok, JSON.stringify(valid(hero).errors));
    assert.deepEqual(built.setup.units.filter((u) => u.side === 'ally').map((u) => u.id), [CHALLENGE_HERO_ID, 'ally1', 'ally2']);
    const created = createBattle(built.setup, 5);
    assert.ok(created.ok, JSON.stringify(created.error));
    let battle = created.state;
    const actors = new Set();
    for (let guard = 0; guard < 400 && !challengeResultOf(battle, built.setup.challenge.rounds); guard += 1) {
        const pick = chooseAllyPlay(battle, CHALLENGE_HERO_ID);
        const next = applyAction(battle, pick ? { type: 'play', ...pick } : { type: 'end-turn' });
        for (const event of next.events || []) if (event.type === 'card' || event.type === 'act') actors.add(event.unitId || event.source?.unitId);
        battle = next.ok ? next.state : applyAction(battle, { type: 'end-turn' }).state;
    }
    assert.ok(challengeResultOf(battle, built.setup.challenge.rounds));
    assert.ok(actors.has('ally1') && actors.has('ally2'));
    assert.ok(battle.units[CHALLENGE_FOE_ID]);
});

test('协助请求不满足条件时建局不带友军，卡组仍是 20 张', () => {
    const state = { bars: { stamina: 100, stress: 0 }, skills: {} };
    const built = buildChallengeSetup({ start: { event: '终面', tier: '普通', allies: ['小雪'] }, state, user: { name: '我' } });
    assert.equal(built.setup.units.length, 2);
    assert.equal(built.allies.rejected[0].reason, 'not-present');
    assert.equal(built.setup.units[0].deck.length, COMBAT_RULES.starterDeckSize);
    assert.ok(createBattle(built.setup, 1).ok);
});

test('经验牌奖励只在圆满且难关登记经验时出现，同输入同结果', () => {
    const ok = planChallengeReward({ combatId: 'ch|5|0|abc|0', outcome: '圆满', tier: '普通', foe: 'interviewer', domain: '话术' });
    assert.ok(ok.ok);
    assert.deepEqual(ok, planChallengeReward({ combatId: 'ch|5|0|abc|0', outcome: '圆满', tier: '普通', foe: 'interviewer', domain: '话术' }));
    assert.ok(Array.isArray(ok.card.effects) && ok.card.effects.length);
    assert.equal(ok.card.name, '话术心得');
    for (const request of [{ outcome: '勉强' }, { outcome: '失败' }, { outcome: '圆满', foe: 'counterpart' }, { outcome: '圆满', foe: '' }]) {
        assert.equal(planChallengeReward({ combatId: 'ch|5|0|abc|0', tier: '普通', foe: 'interviewer', ...request }).ok, false, JSON.stringify(request));
    }
    assert.equal(planChallengeReward({ outcome: '圆满', foe: 'judge' }).ok, false);
});

test('经验牌在各种战斗标识、难度与领域下都能求解，稀有度不超过稀有', () => {
    for (let i = 0; i < 40; i += 1) {
        for (const tier of ['轻松', '普通', '艰难']) {
            for (const domain of ['烹饪', '话术', '学习', '']) {
                const plan = planChallengeReward({ combatId: `ch|${i}|0|t${i}|0`, outcome: '圆满', tier, foe: 'examiner', domain });
                assert.ok(plan.ok, `${i} ${tier} ${domain}`);
                assert.ok(['common', 'uncommon', 'rare'].includes(plan.card.rarity));
                assert.ok(plan.card.cost >= 1 && plan.card.cost <= 2);
            }
        }
    }
});

test('挑战历史只读推导：按战报楼列出、同一战报只记一次、统计与成就', () => {
    const report = (n, outcome, extra = {}) => buildChallengeReport({ combatId: `ch|${n}|0|h|0`, event: `事件${'甲乙丙丁戊己庚辛'[n]}`, outcome, tier: '普通', domain: '话术', ...extra }).text;
    const messages = [
        { floor: 2, text: '普通楼' },
        { floor: 4, text: report(0, '勉强') },
        { floor: 6, text: report(1, '失败') },
        { floor: 8, text: report(2, '圆满', { allies: ['小雪'] }) },
        { floor: 9, text: report(2, '圆满', { allies: ['小雪'] }) },
        { floor: 10, text: report(3, '圆满', { tier: '艰难' }) },
        { floor: 12, text: report(4, '勉强') },
        { floor: 14, text: report(5, '放弃') },
    ];
    const history = deriveChallengeHistory(messages);
    assert.deepEqual(history.entries.map((e) => [e.floor, e.event, e.outcome]), [[4, '事件甲', '勉强'], [6, '事件乙', '失败'], [8, '事件丙', '圆满'], [10, '事件丁', '圆满'], [12, '事件戊', '勉强'], [14, '事件己', '放弃']]);
    assert.deepEqual(history.entries[2].allies, ['小雪']);
    const { stats } = history;
    assert.deepEqual([stats.total, stats.wins, stats.losses, stats.escapes, stats.bestStreak, stats.currentStreak], [6, 4, 1, 1, 3, 0]);
    assert.deepEqual(stats.byOutcome, { 圆满: 2, 勉强: 2, 失败: 1, 放弃: 1 });
    assert.deepEqual(stats.byDomain, { 话术: { total: 6, wins: 4 } });
    const found = Object.fromEntries(history.achievements.map((a) => [a.id, a.floor]));
    assert.deepEqual(found, { 'first-win': 4, perfect: 8, 'allied-win': 8, 'hard-win': 10, 'streak-3': 12 });
    assert.ok(history.achievements.every((a) => a.name === CHALLENGE_ACHIEVEMENTS[a.id]));
    assert.deepEqual(deriveChallengeHistory(['无战报', null, 12]).entries, []);
    assert.deepEqual(deriveChallengeHistory(undefined).achievements, []);
});
