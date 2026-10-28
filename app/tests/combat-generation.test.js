import test from 'node:test';
import assert from 'node:assert/strict';
import {
    deckProfileEntities, enemyEntities, enemyIdFor, generateEntities, generationWrites, growthEntity, resolveCombatLlm, rewardEntity, skillProfileEntity, templateEnemy, withCombatInitialization,
} from '../src/combat/generation.js';
import { CARD_COST_SLOTS, assembleClass, assembleDeck, assembleReward, assembleSkillCharacter, buildStarterDeck, classRaritiesFor, costSlotsFor } from '../src/combat/generation-assembly.js';
import { REWARD_SLOT_COUNT, gearIdFor, itemIdFor, normalizeLedgerEntry, normalizeProfile, profileIdFor, validateStarterDeck } from '../src/combat/schema.js';
import { generateWithRetry, isRetryableGeneration } from '../src/combat/generation-retry.js';
import { enemyArtKeyFor } from '../src/combat/enemy-art.js';
import { secondaryLlmHttpError } from '../src/host/secondary-llm-result.js';
import { planRewardSlots, victoryExpFor } from '../src/combat/rewards.js';
import { evaluateCardBudget } from '../src/combat/rules.js';


// 只验证紧凑回复的组装与校验链路；回复是固定夹具，不证明模型生成质量。
const classValue = (first = ['斩一', 'strike', 1]) => ({
    className: '剑士', archetype: 'warrior', passive: ['锋锐', 'opening-strength'],
    cards: [first, ['斩二', 'strike', 1], ['守三', 'guard', 1], ['守四', 'guard', 1], ['破五', 'bash', 2], ['裂六', 'rend', 1], ['守七', 'brace', 1], ['势八', 'might', 2], ['斩九', 'strike'], ['斩十', 'strike'], ['斩终', 'strike']],
});
const deckValue = () => ({ hp: 80, passive: ['意志', 'last-stand'], skill: ['星爆连斩', 'flurry'], cards: [['剑一', 'strike', 1], ['盾二', 'guard', 1], ['剑三', 'twin', 2], ['愈四', 'mend', 1]] });
const enemyValue = () => ({ hp: 40, skills: [['撕咬', 'slash'], ['蜷缩', 'guard']] });
const reply = (pairs) => JSON.stringify({ entities: pairs.map(([key, value]) => ({ key, value })) });
const LLM = { source: 'tavern' };

// 顺序返回夹具回复，记下每轮请求里的实体。
function fakeRequest(replies) {
    const seen = [];
    const fn = async (req, llm) => {
        const payload = JSON.parse(req.user);
        seen.push({ payload, llm });
        const next = replies[seen.length - 1];
        return typeof next === 'function' ? next(payload) : next;
    };
    fn.seen = seen;
    return fn;
}

const heroId = profileIdFor('deck-character', '主角');
const opening = () => [
    ...deckProfileEntities({ name: '主角', role: 'protagonist', classes: [] }),
    ...enemyEntities({ enemies: [{ name: '狼', count: 2 }], tier: 'normal', existing: [] }).entities,
];

const classKey = `class:${heroId}`;
const deckKey = `deck:${heroId}`;
const enemyKey = `enemy:${enemyIdFor('狼', 'normal')}`;
const keysOf = (seen, i) => seen[i].payload.entities.map((e) => e.key);

test('初始化旁路：新档案同次补齐，旧档案只补资料，非法字段不拒收档案', async () => {
    const init = { className: '游侠', role: 'warrior', major: 'str', minor: 'con', weak: 'cha' };
    const entities = withCombatInitialization(opening(), ['主角', '狼', '旧友']);
    const old = entities.find(e => e.kind === 'profile-init');
    const request = fakeRequest([reply([
        [classKey, classValue()], [deckKey, { ...deckValue(), init }],
        [enemyKey, { ...enemyValue(), init: { ...init, weak: 'str' } }],
        [old.key, { init }],
    ])]);
    const result = await generateEntities(entities, { request, llm: LLM });
    assert.equal(result.ok, true);
    assert.equal(result.requests, 1);
    assert.deepEqual(result.accepted.find(e => e.key === deckKey).init, { name: '主角', value: init });
    assert.deepEqual(result.accepted.find(e => e.key === old.key).init, { name: '旧友', value: init });
    assert.equal(result.accepted.find(e => e.key === enemyKey).init, undefined);
    assert.ok(result.diagnostics.some(d => d.key === enemyKey && d.problem === 'prefs-duplicate'));
    const writes = generationWrites(result);
    assert.equal(writes.profiles.length, 3);
    assert.ok(writes.profiles.every(p => !('init' in p.definition)));
    const absent = await generateEntities([old], { request: async () => reply([]), llm: LLM });
    assert.equal(absent.ok, true);
    assert.equal(absent.requests, 1);
    assert.deepEqual(generationWrites(absent), { profiles: [], entries: [] });
});

test('合法回复一轮通过：职业、主角档案、敌人逐实体校验并产出待落账档案', async () => {
    const request = fakeRequest([reply([[classKey, classValue()], [deckKey, deckValue()], [enemyKey, enemyValue()]])]);
    const result = await generateEntities(opening(), { request, llm: LLM });
    assert.deepEqual([result.ok, result.requests, result.rejected], [true, 1, []]);
    assert.deepEqual(keysOf(request.seen, 0), [classKey, deckKey, enemyKey]);
    assert.equal(request.seen[0].llm.source, 'tavern');
    const deck = result.accepted.find((a) => a.key === deckKey).profile;
    const cls = result.accepted.find((a) => a.key === classKey).profile;
    assert.deepEqual([deck.id, deck.name, deck.classRef], [heroId, '主角', cls.id]);
    const writes = generationWrites(result, { createdAt: 5 });
    assert.equal(writes.profiles.length, 3);
    assert.deepEqual(writes.entries, []);
    for (const rec of writes.profiles) assert.equal(normalizeProfile(rec.definition).ok, true, rec.id);
});

test('部分实体模板键无效时只对它定向修正，已通过的实体不出现在修正请求里', async () => {
    const strong = enemyValue();
    strong.skills[0] = ['撕咬', 'teleport'];
    const request = fakeRequest([
        reply([[classKey, classValue()], [deckKey, deckValue()], [enemyKey, strong]]),
        reply([[enemyKey, enemyValue()]]),
    ]);
    const result = await generateEntities(opening(), { request, llm: LLM });
    assert.deepEqual([result.ok, result.requests], [true, 2]);
    assert.deepEqual(keysOf(request.seen, 1), [enemyKey]);
    const fix = request.seen[1].payload.entities[0];
    assert.ok(fix.previousErrors.some((e) => e.path === 'skills[0][1]' && e.reason === 'invalid-template'));
    assert.equal(fix.previous.skills[0][1], 'teleport');
});


test('无效原型与模板键按紧凑回复字段路径拒收；职业修好后挂起的卡组直接通过、不重新提交', async () => {
    const bad = { ...classValue(['斩一', 'nope', 1]), archetype: 'pirate' };
    const request = fakeRequest([
        reply([[classKey, bad], [deckKey, deckValue()], [enemyKey, enemyValue()]]),
        reply([[classKey, classValue()]]),
    ]);
    const result = await generateEntities(opening(), { request, llm: LLM });
    assert.deepEqual([result.ok, result.requests], [true, 2]);
    assert.deepEqual(keysOf(request.seen, 1), [classKey]);
    const errors = request.seen[1].payload.entities[0].previousErrors;
    assert.ok(errors.some((e) => e.path === 'archetype' && e.reason === 'invalid-enum'));
    assert.ok(errors.some((e) => e.path === 'cards[0][1]' && e.reason === 'invalid-template'));
    assert.equal(result.accepted.length, 3);
});

const bladeClass = () => normalizeProfile({ ...assembleClass(classValue(), { key: 'fixture' }).profile, id: 'cls-blade' }).value;

test('职业已登记时请求中不含职业部分；同名职业标签与同名同档敌人直接复用', async () => {
    const cls = bladeClass();
    for (const entities of [
        deckProfileEntities({ name: '主角', role: 'protagonist', classRef: 'cls-blade', classes: [cls] }),
        deckProfileEntities({ name: '主角', role: 'protagonist', className: '剑士', classes: [cls] }),
    ]) {
        assert.deepEqual(entities.map((e) => e.kind), ['profile-deck']);
        const request = fakeRequest([reply([[deckKey, deckValue()]])]);
        const result = await generateEntities(entities, { request, llm: LLM, classes: [cls] });
        assert.deepEqual([result.ok, keysOf(request.seen, 0)], [true, [deckKey]]);
        assert.deepEqual(request.seen[0].payload.existingClasses.map((c) => c.id), ['cls-blade']);
        assert.equal(result.accepted[0].profile.classRef, 'cls-blade');
    }
    const anchor = { messageId: 3, swipeId: 0, tagHash: 'abc', occurrence: 0 };
    const tag = growthEntity({ kind: 'class', character: '主角', className: '剑士', anchor }, { kind: 'deck-character', id: 'pc-hero', name: '主角' }, { classes: [cls] });
    assert.equal(tag.entity, undefined);
    assert.deepEqual([tag.entry.type, tag.entry.payload], ['class', { classRef: 'cls-blade' }]);
    assert.equal(normalizeLedgerEntry(tag.entry).ok, true);
    const existing = [templateEnemy('狼', 'normal')];
    const enemies = enemyEntities({ enemies: [{ name: '狼', count: 2 }, { name: '狼王', count: 1 }], tier: 'normal', existing });
    assert.deepEqual([enemies.reused, enemies.entities.map((e) => e.fixed.name)], [[enemyIdFor('狼', 'normal')], ['狼王']]);
    assert.notEqual(enemyIdFor('狼', 'normal'), enemyIdFor('狼', 'elite'));
});

test('修正耗尽：敌人改用模板敌人、主角 blocked、队友本次不参战；请求失败同样不伪造档案', async () => {
    const cls = bladeClass();
    const entities = [
        ...deckProfileEntities({ name: '主角', role: 'protagonist', classRef: 'cls-blade', classes: [cls] }),
        skillProfileEntity({ name: '爱丽丝' }),
        ...enemyEntities({ enemies: [{ name: '狼' }], tier: 'normal', existing: [] }).entities,
    ];
    const strong = enemyValue();
    strong.skills[0] = ['撕咬', 'teleport'];
    const skillKey = `skill:${profileIdFor('skill-character', '爱丽丝')}`;
    const bad = reply([[deckKey, { base: { hp: 80 } }], [skillKey, { base: { hp: 50 } }], [enemyKey, strong]]);
    const request = fakeRequest([bad, bad, bad, bad]);
    const result = await generateEntities(entities, { request, llm: LLM, classes: [cls] });
    assert.deepEqual([result.ok, result.requests, result.accepted, result.blocked], [false, 3, [], true]);
    const fallback = Object.fromEntries(result.rejected.map((r) => [r.key, r.fallback.kind]));
    assert.deepEqual(fallback, { [deckKey]: 'blocked', [skillKey]: 'skip', [enemyKey]: 'template-enemy' });
    const template = result.rejected.find((r) => r.key === enemyKey).fallback.profile;
    assert.deepEqual([template.generated, template.name, normalizeProfile(template).ok], [false, '狼', true]);
    assert.deepEqual(generationWrites(result), { profiles: [], entries: [] });

    const failing = async () => { throw new Error('HTTP 500'); };
    const failed = await generateEntities(entities, { request: failing, llm: LLM, classes: [cls] });
    assert.deepEqual([failed.ok, failed.requests, failed.accepted.length, failed.rejected.length], [false, 1, 0, 3]);
    assert.ok(failed.rejected.every((r) => r.errors[0].reason === 'combat-llm-request-failed'));
});

test('取消后迟到的结果不交付；独立 API 配置不完整时直接报错、不改走酒馆', async () => {
    const controller = new AbortController();
    const late = fakeRequest([() => { controller.abort(); return reply([[classKey, classValue()], [deckKey, deckValue()], [enemyKey, enemyValue()]]); }]);
    const stale = await generateEntities(opening(), { request: late, llm: LLM, signal: controller.signal });
    assert.deepEqual([stale.ok, stale.reason, stale.accepted], [false, 'request-stale', []]);
    assert.equal(late.seen[0].llm.signal, controller.signal);
    const never = fakeRequest([]);
    const pre = await generateEntities(opening(), { request: never, llm: LLM, signal: controller.signal });
    assert.deepEqual([pre.reason, never.seen.length], ['request-stale', 0]);

    const incomplete = { source: 'openai', endpoint: '', model: 'm' };
    assert.deepEqual(resolveCombatLlm(incomplete), { ok: false, reason: 'combat-llm-config-incomplete', missing: ['endpoint'] });
    const blocked = await generateEntities(opening(), { request: never, llm: incomplete });
    assert.deepEqual([blocked.ok, blocked.reason, never.seen.length], [false, 'combat-llm-config-incomplete', 0]);
    assert.equal(resolveCombatLlm({ source: 'openai', endpoint: 'https://x', model: 'm' }).llm.source, 'openai');
});

test('learn / upgrade 标签：卡牌与技能 ID 由程序分配，找不到升级目标时转为 learn', async () => {
    const anchor = { messageId: 4, swipeId: 0, tagHash: 'h1', occurrence: 0 };
    const hero = { kind: 'deck-character', id: 'pc-hero', name: '主角', owned: new Map([['basic-strike', 3]]), catalog: new Map([['basic-strike', { name: '攻击' }]]) };
    const learn = growthEntity({ kind: 'learn', character: '我', skill: '裂空斩', anchor }, hero).entity;
    const upgrade = growthEntity({ kind: 'upgrade', character: '我', skill: '破军', anchor: { ...anchor, tagHash: 'h2' } }, hero).entity;
    assert.deepEqual(upgrade.input.candidates, [{ id: 'basic-strike', name: '攻击' }]);
    const alice = { kind: 'skill-character', id: 'sc-alice', name: '爱丽丝', skills: [{ id: 's1', name: '射击' }] };
    const skillUp = growthEntity({ kind: 'upgrade', character: '爱丽丝', skill: '连射', anchor: { ...anchor, tagHash: 'h3' } }, alice).entity;
    assert.equal(skillUp.input.output, 'skill');
    const request = fakeRequest([reply([
        [learn.key, { template: 'strike', cost: 1 }],
        [upgrade.key, { targetId: 'nope', name: '破军', template: 'strike', cost: 1 }],
        [skillUp.key, { targetId: 's1', name: '连射', template: 'combo' }],
    ])]);
    const result = await generateEntities([learn, upgrade, skillUp], { request, llm: LLM, now: 9 });
    assert.equal(result.ok, true);
    const { entries } = generationWrites(result);
    assert.deepEqual(entries.map((e) => e.type), ['learn', 'learn', 'upgrade']);
    assert.equal(entries[0].payload.card.id, learn.learnedId);
    assert.equal(entries[1].payload.card.id, upgrade.learnedId);
    assert.deepEqual([entries[2].payload.targetId, entries[2].payload.skill.id], ['s1', 's1']);
    for (const e of entries) assert.equal(normalizeLedgerEntry(e).ok, true, e.id);
    assert.ok(result.diagnostics.some((d) => d.code === 'combat-upgrade-as-learn' && d.targetId === 'nope'));
});


test('费用槽位：卡牌费用由列表位置决定，回复里写的费用不符只记诊断；专属卡与强度档为可选字段', () => {
    const cls = assembleClass(classValue(), { key: 'k' });
    assert.deepEqual(cls.profile.classPool.map((c) => c.cost), CARD_COST_SLOTS.class);
    assert.ok(cls.diagnostics.some((d) => d.code === 'combat-cost-slotted' && d.path === 'cards[0][2]'));
    assert.equal(normalizeProfile(cls.profile).ok, true, JSON.stringify(normalizeProfile(cls.profile).errors));

    const blade = bladeClass();
    const fixed = { id: 'pc-hero', name: '主角' };
    const plain = assembleDeck(deckValue(), { key: 'd', fixed, cls: blade });
    assert.deepEqual(plain.profile.personalPool.map((c) => c.cost), [1, 1, 2, 2]);
    assert.equal(Object.hasOwn(plain.profile, 'signatureCards'), false);

    const sig = assembleDeck({ ...deckValue(), signature: [['天翔一闪', 'strike'], ['终焉雷鸣', 'thunder']] }, { key: 'd', fixed, cls: blade });
    assert.deepEqual(sig.profile.signatureCards.map((c) => [c.cost, c.rarity]), [[2, 'signature'], [3, 'signature']]);
    const normalized = normalizeProfile(sig.profile);
    assert.equal(normalized.ok, true, JSON.stringify(normalized.errors));
    assert.equal(sig.profile.starterDeck.some((id) => sig.profile.signatureCards.some((c) => c.id === id)), false);
    assert.equal(validateStarterDeck(normalized.value, blade).ok, true);

    const ally = (extra = {}) => ({ skills: [['斩', 'slash'], ['守', 'guard'], ['破', 'gash']], passives: [['坚', 'turn-guard']], ...extra });
    const allyFixed = { key: 's', fixed: { id: 'sc-a', name: '甲' } };
    assert.equal(Object.hasOwn(assembleSkillCharacter(ally(), allyFixed).profile, 'tier'), false);
    const ace = assembleSkillCharacter(ally({ tier: 'ace' }), allyFixed).profile;
    assert.equal(ace.tier, 'ace');
    assert.equal(normalizeProfile(ace).ok, true, JSON.stringify(normalizeProfile(ace).errors));
    assert.ok(assembleSkillCharacter(ally({ tier: 'god' }), allyFixed).errors.some((e) => e.path === 'tier' && e.reason === 'invalid-enum'));
});

test('初始卡池范围内随机：费用曲线在上下限内按角色确定、角色间有差异；起始卡组加权抽取且守住形状与副本上限', () => {
    const tally = (slots) => [0, 1, 2, 3].map((c) => slots.filter((s) => s === c).length);
    const ids = Array.from({ length: 12 }, (_, i) => `pc-hero${i}`);
    const curves = new Set();
    for (const id of ids) {
        const slots = costSlotsFor('class', id);
        assert.deepEqual(costSlotsFor('class', id), slots);
        assert.equal(slots.length, 11);
        const [z, one, two, three] = tally(slots);
        assert.ok(z <= 1 && one >= 4 && one <= 6 && two >= 3 && two <= 4 && three >= 1 && three <= 3, JSON.stringify(slots));
        const personal = costSlotsFor('personal', id);
        assert.equal(personal.length, 4);
        assert.ok(personal.every((c) => c >= 1 && c <= 3));
        curves.add(slots.join(','));
    }
    assert.ok(curves.size > 1);
    assert.deepEqual(costSlotsFor('signature', 'x'), [...CARD_COST_SLOTS.signature]);

    const slots = [1, 1, 2, 3, 3, 0, 2, 1, 2, 3, 1];
    const cls = assembleClass(classValue(), { key: 'k', input: { costSlots: slots } });
    assert.deepEqual(cls.profile.classPool.map((c) => c.cost).sort(), [...slots].sort());
    const bad = assembleClass(classValue(), { key: 'k', input: { costSlots: [9, 'a'] } });
    assert.deepEqual(bad.profile.classPool.map((c) => c.cost), CARD_COST_SLOTS.class);

    const classPool = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, cost: i % 4, rarity: i % 2 ? 'uncommon' : 'common' }));
    const personalPool = [1, 1, 2, 2].map((cost, i) => ({ id: `m${i + 1}`, cost, rarity: 'personal' }));
    const decks = new Set();
    for (const id of ids) {
        const deck = buildStarterDeck(classPool, personalPool, id);
        assert.deepEqual(buildStarterDeck(classPool, personalPool, id), deck);
        assert.equal(deck.length, 20);
        const count = (pred) => deck.filter(pred).length;
        assert.equal(count((d) => d === 'basic-strike'), 3);
        assert.equal(count((d) => d === 'basic-defend'), 3);
        assert.equal(count((d) => d.startsWith('c')), 10);
        assert.equal(count((d) => d.startsWith('m')), 4);
        for (const c of classPool) assert.ok(count((d) => d === c.id) <= 3);
        for (const m of personalPool) assert.ok(count((d) => d === m.id) <= 2);
        decks.add(deck.join(','));
    }
    assert.ok(decks.size > 1);
});

test('职业稀有度按角色种子独立分配 7 普通与 4 罕见，费用槽不漂移；无解进入纠错', () => {
    const patterns = new Set();
    let lowUncommon = false;
    let highCommon = false;
    for (let i = 0; i < 12; i += 1) {
        const owner = `pc-rarity${i}`;
        const rarities = classRaritiesFor(owner);
        assert.deepEqual(classRaritiesFor(owner), rarities);
        assert.equal(rarities.filter((r) => r === 'common').length, 7);
        assert.equal(rarities.filter((r) => r === 'uncommon').length, 4);
        const slots = costSlotsFor('class', owner);
        const value = { ...classValue(), cards: slots.map((_, n) => [`卡${n}`, 'strike']) };
        const a = assembleClass(value, { key: 'first', owner, input: { costSlots: slots } });
        assert.equal(a.errors, undefined, JSON.stringify(a.errors));
        assert.deepEqual(a.profile.classPool.map((c) => c.rarity), rarities);
        assert.deepEqual(a.profile.classPool.map((c) => c.cost), slots);
        assert.deepEqual(assembleClass(value, { key: 'retry', owner, input: { costSlots: slots } }).profile, a.profile);
        const reverse = [...slots].reverse();
        const b = assembleClass(value, { owner, input: { costSlots: reverse } });
        assert.deepEqual(b.profile.classPool.map((c) => c.rarity), rarities);
        assert.deepEqual(b.profile.classPool.map((c) => c.cost), reverse);
        lowUncommon ||= a.profile.classPool.some((c) => c.cost === 1 && c.rarity === 'uncommon');
        highCommon ||= a.profile.classPool.some((c) => c.cost === 3 && c.rarity === 'common');
        patterns.add(rarities.join(','));
    }
    assert.ok(patterns.size > 1 && lowUncommon && highCommon);
    const bad = assembleClass(classValue(['强势', 'might']), { owner: 'pc-fail', input: { costSlots: Array(11).fill(0) } });
    assert.ok(bad.errors.some((e) => e.path === 'cards[0][1]' && e.reason === 'template-unsolvable' && e.detail.cost === 0));
});

test('新起始卡组过滤 rare / epic / mythic，个人卡仍抽四张且不修改输入池', () => {
    const classPool = ['common', 'uncommon', 'common', 'uncommon', 'rare', 'epic', 'mythic'].map((rarity, i) => ({ id: `c${i}`, cost: 1, rarity }));
    const personal = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, cost: 1, rarity: 'personal' }));
    const before = JSON.stringify([classPool, personal]);
    const deck = buildStarterDeck(classPool, personal, 'pc-filter');
    assert.equal(deck.length, 20);
    assert.equal(deck.filter((id) => id.startsWith('p')).length, 4);
    assert.equal(deck.filter((id) => id.startsWith('c')).length, 10);
    assert.ok(deck.every((id) => !['c4', 'c5', 'c6'].includes(id)));
    assert.equal(JSON.stringify([classPool, personal]), before);
});




test('装备与道具生成：模型只选被动 / 道具模板键，名称、部位、数量与 ID 由程序给定；宝物按 rare 加强；非法模板定向修正', async () => {
    const { gearIdFor, itemIdFor } = await import('../src/combat/schema.js');
    const anchor = { messageId: 2, swipeId: 0, tagHash: 'g1', occurrence: 0 };
    const hero = { kind: 'deck-character', id: 'pc-hero', name: '主角', owned: new Map(), catalog: new Map() };
    const sword = growthEntity({ kind: 'equip', character: '我', name: '青锋剑', slot: 'weapon', description: '削铁如泥', anchor }, hero).entity;
    const relic = growthEntity({ kind: 'equip', character: '我', name: '龙鳞', slot: 'treasure', description: '', anchor: { ...anchor, tagHash: 'g2' } }, hero).entity;
    const potion = growthEntity({ kind: 'item', character: '我', name: '回春丹', count: 2, description: '', anchor: { ...anchor, tagHash: 'g3' } }, hero).entity;
    assert.deepEqual([sword.kind, relic.kind, potion.kind], ['equip-to-passive', 'equip-to-passive', 'item-to-consumable']);
    assert.deepEqual([sword.input.slot, potion.input.count], ['weapon', 2]);
    const request = fakeRequest([
        reply([[sword.key, { template: 'opening-strength' }], [relic.key, { template: 'opening-guard' }], [potion.key, { template: 'nope' }]]),
        reply([[potion.key, { template: 'potion' }]]),
    ]);
    const result = await generateEntities([sword, relic, potion], { request, llm: LLM, now: 9 });
    assert.equal(result.ok, true, JSON.stringify(result.rejected));
    assert.equal(request.seen.length, 2);
    const retry = request.seen[1].payload.entities;
    assert.deepEqual(retry.map((e) => e.key), [potion.key]);
    assert.ok(retry[0].previousErrors.some((e) => e.path === 'template' && e.reason === 'invalid-template'));
    const { entries } = generationWrites(result);
    assert.deepEqual(entries.map((e) => e.type), ['equip', 'equip', 'item']);
    for (const e of entries) assert.equal(normalizeLedgerEntry(e).ok, true, e.id);
    const [w, t, it] = entries.map((e) => e.payload);
    assert.deepEqual([w.gearId, w.name, w.slot, w.description, w.passive.effects[0].stacks], [gearIdFor('青锋剑'), '青锋剑', 'weapon', '削铁如泥', 1]);
    assert.deepEqual([t.slot, t.passive.effects[0].amount], ['treasure', 10]);
    assert.match(t.description, /宝物加强/);
    assert.deepEqual([it.itemId, it.name, it.count, it.effects], [itemIdFor('回春丹'), '回春丹', 2, [{ op: 'heal', amount: 12, target: 'self' }]]);
});


test('自动重试：只重发上游明确拒绝的请求（HTTP 503 等）；400、发送状态未知、504 与普通错误不重发；重试耗尽带回状态；等待中取消返回 request-stale', async () => {
    const ok = reply([[classKey, classValue()], [deckKey, deckValue()], [enemyKey, enemyValue()]]);
    const flaky = (errors, final) => {
        let n = 0;
        const fn = async () => { n += 1; if (n <= errors.length) throw errors[n - 1]; return final; };
        fn.calls = () => n;
        return fn;
    };
    const retries = [];
    const recovering = flaky([secondaryLlmHttpError(503, 'openai')], ok);
    const r = await generateWithRetry(opening(), { request: recovering, llm: LLM, retryDelays: [0, 0], onRetry: (x) => retries.push([x.attempt, x.status]) });
    assert.deepEqual([r.ok, r.retries, recovering.calls(), retries], [true, 1, 2, [[1, 503]]]);
    for (const error of [secondaryLlmHttpError(400, 'openai'), secondaryLlmHttpError(null, 'direct'), secondaryLlmHttpError(504, 'openai'), new Error('HTTP 500')]) {
        const once = flaky([error, error, error], ok);
        const failed = await generateWithRetry(opening(), { request: once, llm: LLM, retryDelays: [0, 0] });
        assert.deepEqual([failed.ok, once.calls(), Object.hasOwn(failed, 'retries'), isRetryableGeneration(failed), Boolean(failed.requestFailure)], [false, 1, false, false, true]);
    }
    const down = flaky(Array(5).fill(secondaryLlmHttpError(502, 'openai')), ok);
    const exhausted = await generateWithRetry(opening(), { request: down, llm: LLM, retryDelays: [0, 0] });
    assert.deepEqual([exhausted.ok, exhausted.retries, down.calls(), exhausted.requestFailure], [false, 2, 3, { reason: 'secondary-llm-http-failed', status: 502 }]);
    const controller = new AbortController();
    const cancelled = flaky([secondaryLlmHttpError(429, 'openai')], ok);
    const stale = await generateWithRetry(opening(), { request: cancelled, llm: LLM, signal: controller.signal, retryDelays: [60000], onRetry: () => controller.abort() });
    assert.deepEqual([stale.ok, stale.reason, cancelled.calls()], [false, 'request-stale', 1]);
});


test('敌人外观格位：合法 art 进档案；非法值丢弃并记诊断、不触发修正；缺省不写字段；schema 拒收目录外的格位', async () => {
    const entities = () => enemyEntities({ enemies: [{ name: '狼', count: 1 }], tier: 'normal', existing: [] }).entities;
    const run = (value) => generateEntities(entities(), { request: fakeRequest([reply([[enemyKey, value]])]), llm: LLM });
    const picked = await run({ ...enemyValue(), art: 'werewolf' });
    assert.deepEqual([picked.ok, picked.accepted[0].profile.art], [true, 'werewolf']);
    const bad = await run({ ...enemyValue(), art: 'robot' });
    assert.deepEqual([bad.ok, bad.requests, Object.hasOwn(bad.accepted[0].profile, 'art')], [true, 1, false]);
    assert.ok(bad.diagnostics.some((d) => d.code === 'combat-art-dropped' && d.path === 'art' && d.from === 'robot'));
    const plain = (await run(enemyValue())).accepted[0].profile;
    assert.equal(Object.hasOwn(plain, 'art'), false);
    assert.equal(normalizeProfile(plain).ok, true);
    assert.equal(normalizeProfile({ ...plain, art: 'dragon' }).value.art, 'dragon');
    const rejected = normalizeProfile({ ...plain, art: 'robot' });
    assert.equal(rejected.ok, false);
    assert.match(JSON.stringify(rejected.errors), /invalid-enum/);
});

test('敌人外观格位推断：合法 art 优先；名称按物种、种族、性别与类型推断；首领档人形用首领格；同名同格', () => {
    assert.equal(enemyArtKeyFor({ art: 'slime', name: '山贼' }), 'slime');
    assert.equal(enemyArtKeyFor({ art: 'robot', name: '狼人' }), 'werewolf');
    assert.deepEqual(['灰狼', '丧尸', '机械傀儡', '暗精灵女祭司', '女山贼', '黑衣刺客'].map((name) => enemyArtKeyFor({ name, tier: 'normal' })),
        ['beast', 'undead', 'golem', 'elf-f', 'grunt-f', 'assassin-m']);
    assert.deepEqual([enemyArtKeyFor({ name: '魔教教主', tier: 'boss' }), enemyArtKeyFor({ name: '红衣女子', tier: 'boss' })], ['boss-m', 'boss-f']);
    const once = enemyArtKeyFor({ name: '无名客', tier: 'elite' });
    assert.match(once, /^(elite|chief)-m$/);
    assert.equal(enemyArtKeyFor({ name: '无名客', tier: 'elite' }), once);
});


test('奖励槽位：同一 combatId 重算一致；杂兵每槽约 85% 杂物、卡牌不超罕见；精英 / 首领首槽保底非杂物、其余约 80% 杂物；首领保底槽史诗以上、杂物品质更高；宝物只在稀有以上；只出杂物 / 卡牌 / 装备 / 道具；备用套同规则、种子不同；再翻加槽、天运上调一档（两套都生效）；技能角色不出卡牌', () => {
    const hero = { kind: 'deck-character', id: 'pc-hero' };
    assert.deepEqual(planRewardSlots({ combatId: 'cb|1', tier: 'elite', character: hero }), planRewardSlots({ combatId: 'cb|1', tier: 'elite', character: hero }));
    const rank = (r) => ['common', 'uncommon', 'rare', 'epic', 'mythic'].indexOf(r);
    const share = { normal: [0, 0], elite: [0, 0], boss: [0, 0] };
    const keepRank = { elite: [], boss: [] };
    const bossKinds = new Set();
    let differ = 0;
    for (let i = 0; i < 300; i += 1) {
        for (const tier of ['normal', 'elite', 'boss']) {
            const plan = planRewardSlots({ combatId: `cb|${i}`, tier, enemyTiers: [tier], character: hero });
            assert.deepEqual([plan.tier, plan.exp, plan.slots.map((s) => s.index), plan.reserve.map((s) => s.index)], [tier, victoryExpFor([tier]), [0, 1, 2], [0, 1, 2]]);
            if (JSON.stringify(plan.slots) !== JSON.stringify(plan.reserve)) differ += 1;
            [...plan.slots, ...plan.reserve].forEach((s) => { const at = s.index;
                assert.ok(['keepsake', 'card', 'gear', 'item'].includes(s.kind), s.kind);
                assert.ok(rank(s.rarity) >= 0, `${tier} ${s.kind} ${s.rarity}`);
                if (s.kind === 'card') assert.ok([0, 1, 2, 3].includes(s.cost));
                if (s.kind === 'card' && tier === 'normal') assert.ok(rank(s.rarity) <= 1);
                if (s.kind === 'gear') assert.ok(s.gearSlot === 'treasure' ? rank(s.rarity) >= 2 : ['weapon', 'armor', 'accessory'].includes(s.gearSlot));
                if (s.kind === 'item') assert.equal(s.count, rank(s.rarity) >= 3 ? 2 : 1);
                const guaranteed = tier !== 'normal' && at === 0;
                if (guaranteed) assert.notEqual(s.kind, 'keepsake');
                if (guaranteed && tier === 'boss') assert.ok(rank(s.rarity) >= 3);
                if (!guaranteed) { share[tier][0] += s.kind === 'keepsake' ? 1 : 0; share[tier][1] += 1; }
                if (s.kind === 'keepsake' && tier !== 'normal') keepRank[tier].push(rank(s.rarity));
                if (tier === 'boss') bossKinds.add(s.kind === 'gear' && s.gearSlot === 'treasure' ? 'treasure' : s.kind);
            });
        }
    }
    const rate = (t) => share[t][0] / share[t][1];
    assert.ok(differ > 600, String(differ));
    assert.ok(rate('normal') > 0.8 && rate('normal') < 0.9, String(rate('normal')));
    for (const t of ['elite', 'boss']) assert.ok(rate(t) > 0.74 && rate(t) < 0.86, `${t} ${rate(t)}`);
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    assert.ok(avg(keepRank.boss) - avg(keepRank.elite) > 0.8, `${avg(keepRank.boss)} ${avg(keepRank.elite)}`);
    assert.ok(Math.min(...keepRank.boss) >= 2);
    assert.deepEqual([...bossKinds].sort(), ['card', 'gear', 'item', 'keepsake', 'treasure']);
    const base = planRewardSlots({ combatId: 'cb|x', tier: 'elite', character: hero });
    const flipped = planRewardSlots({ combatId: 'cb|x', tier: 'elite', character: hero, links: { reflip: true } });
    assert.deepEqual([flipped.slots.length, flipped.reserve.length], [REWARD_SLOT_COUNT + 1, REWARD_SLOT_COUNT + 1]);
    const lucky = planRewardSlots({ combatId: 'cb|x', tier: 'elite', character: hero, links: { fortune: true } });
    for (const set of ['slots', 'reserve']) {
        const steps = lucky[set].map((s, i) => rank(s.rarity) - rank(base[set][i].rarity));
        assert.deepEqual([steps.filter((d) => d === 1).length, steps.every((d) => d === 0 || d === 1)], [1, true], set);
        assert.notEqual(lucky[set][steps.indexOf(1)].kind, 'keepsake');
    }
    for (let i = 0; i < 50; i += 1) { const p = planRewardSlots({ combatId: `cb|s${i}`, tier: 'boss', character: { kind: 'skill-character', id: 'sc-a' } }); assert.ok([...p.slots, ...p.reserve].every((s) => s.kind !== 'card')); }
    assert.equal(planRewardSlots({ combatId: 'cb|y', tier: 'nope' }).tier, 'normal');
});

test('奖励组装：卡牌按槽位费用 × 稀有度求解，装备 / 宝物被动按稀有度加强，一次性道具数量取计划；杂物带稀有度、只有名称与来历；每槽都要起名；来历超 30 字截断；非法模板按字段路径拒收', () => {
    const plan = { seed: 'reward|cb|1|pc-hero', slots: [
        { index: 0, kind: 'card', rarity: 'rare', cost: 1 },
        { index: 1, kind: 'gear', rarity: 'epic', gearSlot: 'weapon' },
        { index: 2, kind: 'gear', rarity: 'rare', gearSlot: 'treasure' },
        { index: 3, kind: 'item', rarity: 'epic', count: 2 },
        { index: 4, kind: 'keepsake', rarity: 'mythic' },
    ] };
    const value = { slots: [['裂风', 'strike', '狼王的爪痕'], ['狼牙刃', 'opening-strength', '狼王遗落'], ['龙鳞', 'opening-strength', ''], ['回春丹', 'potion', ''], ['褪色的发绳', null, '这'.repeat(40)]] };
    const built = assembleReward(value, { key: 'reward:cb|1', input: plan });
    assert.ok(built.value, JSON.stringify(built.errors));
    const [card, gear, relic, item, keepsake] = built.value.slots;
    assert.deepEqual([card.kind, card.name, card.rarity, card.card.rarity, card.card.cost, card.origin], ['card', '裂风', 'rare', 'rare', 1, '狼王的爪痕']);
    assert.match(card.card.id, /^rc-/);
    assert.equal(evaluateCardBudget(card.card).ok, true);
    assert.deepEqual([gear.gear.gearId, gear.gear.slot, gear.gear.passive.effects[0].stacks], [gearIdFor('狼牙刃'), 'weapon', 2]);
    assert.match(gear.gear.description, /加强/);
    assert.deepEqual([relic.gear.slot, relic.gear.passive.effects[0].stacks], ['treasure', 2]);
    assert.deepEqual([item.item.itemId, item.item.count, item.item.effects], [itemIdFor('回春丹'), 2, [{ op: 'heal', amount: 12, target: 'self' }]]);
    assert.deepEqual(Object.keys(keepsake).sort(), ['index', 'kind', 'name', 'origin', 'rarity']);
    assert.deepEqual([keepsake.name, keepsake.rarity, keepsake.origin.length], ['褪色的发绳', 'mythic', 30]);
    assert.ok(built.diagnostics.some((d) => d.code === 'combat-value-clamped' && d.path === 'slots[4][2]'));
    const bad = assembleReward({ slots: [['裂风', 'nope', ''], ['狼牙刃', 'strike', ''], ['龙鳞', 'opening-strength', ''], ['回春丹', 'potion', ''], [null, null, '']] }, { key: 'k', input: plan });
    assert.deepEqual(bad.errors.map((e) => [e.path, e.reason]), [['slots[0][1]', 'invalid-template'], ['slots[1][1]', 'invalid-template'], ['slots[4][0]', 'required-text']]);
    assert.deepEqual(assembleReward({ slots: [] }, { key: 'k', input: plan }).errors, [{ path: 'slots', reason: 'too-few', detail: { min: 5, size: 0 } }]);
    // 备用套：计划带 reserve 时同样逐槽组装，卡牌 ID 用派生种子、与主套同位不重复；缺 reserve 按字段路径拒收；计划没有 reserve 时输出也没有。
    assert.equal('reserve' in built.value, false);
    const both = assembleReward({ ...value, reserve: value.slots }, { key: 'k', input: { ...plan, reserve: plan.slots } });
    assert.ok(both.value?.reserve, JSON.stringify(both.errors));
    assert.deepEqual([both.value.reserve.length, both.value.reserve[0].card.id !== both.value.slots[0].card.id, both.value.reserve[4].name], [5, true, '褪色的发绳']);
    assert.deepEqual(assembleReward(value, { key: 'k', input: { ...plan, reserve: plan.slots } }).errors.map((e) => [e.path, e.reason]), [['reserve', 'expected-array']]);
});


test('battle-reward：与敌人同批请求，模型只见类别、稀有度与命名线索；非法模板只对奖励定向修正；通过后为锚定开战楼的 offer 条目；修正耗尽时奖励被拒、不阻断敌人', async () => {
    const anchor = { messageId: 3, swipeId: 0, tagHash: 'st1', occurrence: 0 };
    const hero = { kind: 'deck-character', id: 'pc-hero', name: '主角', owned: new Map(), catalog: new Map(), upgraded: new Map() };
    const { entity, plan } = rewardEntity({ combatId: 'cb|3|0|st1|0', anchor, tier: 'boss', enemyTiers: ['boss'], enemies: [{ name: '狼王' }, { name: '狼王' }], encounter: '月下狼王', character: hero });
    assert.deepEqual([entity.kind, entity.owner, entity.input.enemies, entity.fixed.exp, plan.slots[0].kind === 'keepsake'], ['battle-reward', 'pc-hero', ['狼王'], victoryExpFor(['boss']), false]);
    assert.deepEqual([entity.input.reserve.length, entity.fixed.reserve.length], [plan.reserve.length, REWARD_SLOT_COUNT]);
    assert.ok([...entity.input.slots, ...entity.input.reserve].every((s) => !('index' in s) && !('count' in s) && typeof s.rarity === 'string'));
    assert.equal(rewardEntity({ combatId: 'cb|3', anchor }).error, 'combat-reward-input-missing');
    const tuple = { gear: ['狼牙刃', 'opening-strength', '狼王遗落'], item: ['回春丹', 'potion', ''], keepsake: ['狼王的断牙', null, '战后从草丛里拾得'] };
    const tupleOf = (s) => (s.kind === 'card' ? ['裂风', s.cost === 0 ? 'jab' : 'strike', '狼王的爪痕'] : tuple[s.kind]);
    const fill = (bad) => ({ slots: plan.slots.map((s, i) => (bad && i === 0 ? ['裂风', 'nope', ''] : tupleOf(s))), reserve: plan.reserve.map(tupleOf) });
    const [foe] = enemyEntities({ enemies: [{ name: '狼王' }], tier: 'boss', existing: [] }).entities;
    const request = fakeRequest([reply([[foe.key, enemyValue()], [entity.key, fill(true)]]), reply([[entity.key, fill(false)]])]);
    const result = await generateEntities([entity, foe], { request, llm: LLM, now: 9 });
    assert.equal(result.ok, true, JSON.stringify(result.rejected));
    assert.deepEqual(keysOf(request.seen, 0), [foe.key, entity.key]);
    assert.equal('fixed' in request.seen[0].payload.entities[1], false);
    const retry = request.seen[1].payload.entities;
    assert.deepEqual(retry.map((e) => e.key), [entity.key]);
    assert.ok(retry[0].previousErrors.some((e) => e.path === 'slots[0][1]' && e.reason === 'invalid-template'));
    const { profiles, entries } = generationWrites(result);
    assert.deepEqual([profiles.length, entries.map((e) => e.type)], [1, ['offer']]);
    const [offer] = entries;
    assert.equal(normalizeLedgerEntry(offer).ok, true);
    assert.deepEqual([offer.character, offer.anchor, offer.payload.combatId, offer.payload.slots.length, offer.payload.reserve.length, offer.createdAt], ['pc-hero', anchor, 'cb|3|0|st1|0', REWARD_SLOT_COUNT, REWARD_SLOT_COUNT, 9]);

    const exhausted = await generateEntities([entity, foe], { request: fakeRequest([reply([[foe.key, enemyValue()], [entity.key, fill(true)]])]), llm: LLM, maxRounds: 0 });
    assert.deepEqual([exhausted.ok, exhausted.blocked, exhausted.accepted.length], [false, false, 1]);
    assert.deepEqual([exhausted.rejected[0].kind, 'fallback' in exhausted.rejected[0]], ['battle-reward', false]);
});


test('class-tier：升阶实体请求阶名与 3 张追加卡，ID、稀有度与费用槽由程序给定并过卡牌 schema；无效模板按 cards[i] 路径拒收后定向修正；转职新职业不得与已登记职业同名且不附成长条目；职业被动按阶逐档加强', async () => {
    const { classTierEntity, respecClassEntity } = await import('../src/combat/generation.js');
    const { passiveAtTier } = await import('../src/combat/card-templates.js');
    const cls = { id: 'cls-blade', className: '剑士', archetype: 'warrior', classPool: [] };
    const entity = classTierEntity({ character: { id: heroId, name: '主角' }, cls, tier: 2, rarity: 'rare', mark: 'm1' });
    assert.deepEqual([entity.kind, entity.input.costSlots, entity.fixed.cardIds], ['class-tier', [1, 2, 3], ['cls-blade-t2-m1-1', 'cls-blade-t2-m1-2', 'cls-blade-t2-m1-3']]);
    const bad = { tierName: '剑豪', cards: [['破阵', 'strike'], ['乱斩', 'no-such-template'], ['归一', 'guard']] };
    const good = { tierName: '剑豪', cards: [['破阵', 'strike'], ['乱斩', 'strike'], ['归一', 'guard']] };
    const request = fakeRequest([reply([[entity.key, bad]]), reply([[entity.key, good]])]);
    const result = await generateEntities([entity], { request, llm: LLM, now: 9 });
    assert.equal(result.ok, true, JSON.stringify(result.rejected));
    assert.deepEqual(request.seen[1].payload.entities[0].previousErrors.map((e) => e.path), ['cards[1][1]']);
    const tier = result.accepted[0].tier;
    assert.deepEqual([result.accepted[0].kind, tier.classRef, tier.tier, tier.tierName, tier.cards.map((c) => c.id), tier.cards.map((c) => c.rarity)],
        ['class-tier', 'cls-blade', 2, '剑豪', entity.fixed.cardIds, ['rare', 'rare', 'rare']]);
    const anchor = { messageId: 1, swipeId: 0, tagHash: 'ascend', occurrence: 0 };
    assert.equal(normalizeLedgerEntry({ id: 'ascend|pc|1|0|ascend|0', type: 'ascend', character: heroId, anchor, payload: { ...tier, cost: 300 }, createdAt: 9 }).ok, true);

    const respec = respecClassEntity({ id: heroId, name: '主角' });
    const again = fakeRequest([reply([[respec.key, classValue()]]), reply([[respec.key, { ...classValue(), className: '术士' }]])]);
    const made = await generateEntities([respec], { request: again, llm: LLM, classes: [cls], now: 9 });
    assert.equal(made.ok, true, JSON.stringify(made.rejected));
    assert.deepEqual(again.seen[1].payload.entities[0].previousErrors.map((e) => [e.path, e.reason]), [['className', 'class-name-exists']]);
    assert.deepEqual([made.accepted[0].profile.className, made.accepted[0].entry], ['术士', undefined]);

    const base = { id: 'p1', name: '锋锐', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }, { op: 'block', amount: 4 }] };
    assert.equal(passiveAtTier(base, 1), base);
    assert.deepEqual(passiveAtTier(base, 2).effects, [{ op: 'status', status: 'strength', stacks: 2 }, { op: 'block', amount: 5 }]);
    assert.deepEqual(passiveAtTier(base, 3).effects, [{ op: 'status', status: 'strength', stacks: 3 }, { op: 'block', amount: 6 }]);
    assert.equal(base.effects[0].stacks, 1);
});


test('trait：人物特性实体只请求名称、被动模板与来历，traitId 与稀有度由程序给定，被动按稀有度加强；无效模板按 template 路径拒收后定向修正；不落档案与成长条目；人设附到 input.lore', async () => {
    const { traitEntity, withCharacterLore } = await import('../src/combat/generation.js');
    const { passiveAtRarity } = await import('../src/combat/card-templates.js');
    const entity = traitEntity({ character: { id: heroId, name: '主角' }, rarity: 'epic', traitId: 'tr-x1', existing: [{ name: '旧伤' }] });
    assert.deepEqual([entity.kind, entity.input, entity.fixed], ['trait', { name: '主角', rarity: 'epic', existing: ['旧伤'] }, { traitId: 'tr-x1', rarity: 'epic' }]);
    const value = (template) => ({ name: '不灭战意', template, origin: '少年时在边关守城三年' });
    const request = fakeRequest([reply([[entity.key, value('no-such-template')]]), reply([[entity.key, value('opening-strength')]])]);
    const result = await generateEntities([entity], { request, llm: LLM, now: 9 });
    assert.equal(result.ok, true, JSON.stringify(result.rejected));
    assert.deepEqual(request.seen[1].payload.entities[0].previousErrors.map((e) => e.path), ['template']);
    const trait = result.accepted[0].trait;
    assert.deepEqual([result.accepted[0].kind, trait.traitId, trait.rarity, trait.name, trait.origin, trait.passive.id, trait.passive.effects],
        ['trait', 'tr-x1', 'epic', '不灭战意', '少年时在边关守城三年', 'tr-x1-p', passiveAtRarity('opening-strength', 'epic').effects]);
    assert.deepEqual(generationWrites(result), { profiles: [], entries: [] });
    const anchor = { messageId: 1, swipeId: 0, tagHash: 'trait', occurrence: 0 };
    assert.equal(normalizeLedgerEntry({ id: 'trait|pc|1|0|trait|0', type: 'trait', character: heroId, anchor, payload: { ...trait, cost: 100 }, createdAt: 9 }).ok, true);
    const withLore = await withCharacterLore([entity], async (names) => names.map((name) => ({ name, text: '边关出身的剑客' })));
    assert.equal(withLore[0].input.lore, '边关出身的剑客');
});


test('华而不实被动（P-e）：人物特性、装备与奖励装备槽可选，基础效果量级为 1；职业、个人、技能角色与敌人被动及道具槽不可选', async () => {
    const { FLAIR_PASSIVE_TEMPLATES, PASSIVE_TEMPLATES, passiveAtRarity, passiveFromTemplate } = await import('../src/combat/card-templates.js');
    const { assembleEnemy, assembleGear, assembleTrait } = await import('../src/combat/generation-assembly.js');
    const flair = Object.keys(FLAIR_PASSIVE_TEMPLATES);
    assert.ok(flair.length >= 8 && flair.every((k) => !Object.hasOwn(PASSIVE_TEMPLATES, k)));
    for (const k of flair) assert.deepEqual(passiveFromTemplate(k).effects.map((e) => e.stacks ?? e.amount), [1], k);
    const rejects = (built, path) => assert.ok(built.errors?.some((e) => e.path === path && e.reason === 'invalid-template'), JSON.stringify(built.errors));
    rejects(assembleClass({ ...classValue(), passive: 'flair-glint' }, { key: 'k' }), 'passive');
    rejects(assembleDeck({ ...deckValue(), passive: 'flair-glint' }, { key: 'd', fixed: { id: 'pc-hero', name: '主角' }, cls: bladeClass() }), 'passive');
    const ally = (passive) => assembleSkillCharacter({ skills: [['撕咬', 'slash'], ['蜷缩', 'guard'], ['再咬', 'slash']], passives: [passive] }, { key: 's', fixed: { id: 'sc-a', name: '甲' } });
    assert.equal(ally('opening-guard').errors, undefined);
    rejects(ally('flair-glint'), 'passives[0]');
    const foe = (passive) => assembleEnemy({ ...enemyValue(), passives: [passive] }, { key: 'e', fixed: { id: 'en-wolf', name: '狼', tier: 'normal' } });
    assert.equal(foe('opening-guard').errors, undefined);
    rejects(foe('flair-glint'), 'passives[0]');
    const gear = (slot) => assembleGear({ template: 'flair-halo' }, { key: 'g', input: { name: '星环', slot, description: '' } }).value.passive.effects;
    assert.deepEqual([gear('weapon'), gear('treasure')], [passiveFromTemplate('flair-halo').effects, passiveAtRarity('flair-halo', 'rare').effects]);
    const trait = assembleTrait({ name: '万象归一', template: 'flair-sigh', origin: '据说曾照亮整座城' }, { key: 't', fixed: { traitId: 'tr-f1', rarity: 'mythic' } }).value;
    assert.deepEqual(trait.passive.effects, passiveAtRarity('flair-sigh', 'mythic').effects);
    const anchor = { messageId: 1, swipeId: 0, tagHash: 'trait', occurrence: 0 };
    assert.equal(normalizeLedgerEntry({ id: 'trait|pc|1|0|trait|0', type: 'trait', character: heroId, anchor, payload: { ...trait, cost: 100 }, createdAt: 9 }).ok, true);
    const plan = { seed: 'reward|cb|9|pc-hero', slots: [{ index: 0, kind: 'gear', rarity: 'epic', gearSlot: 'weapon' }, { index: 1, kind: 'item', rarity: 'common', count: 1 }] };
    const loot = assembleReward({ slots: [['流光', 'flair-glint', ''], ['回春丹', 'potion', '']] }, { key: 'r', input: plan });
    assert.ok(loot.value, JSON.stringify(loot.errors));
    assert.deepEqual(loot.value.slots[0].gear.passive.effects, passiveAtRarity('flair-glint', 'epic').effects);
    rejects(assembleReward({ slots: [['流光', 'flair-glint', ''], ['回春丹', 'flair-glint', '']] }, { key: 'r', input: plan }), 'slots[1][1]');
});
