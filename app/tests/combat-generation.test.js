import test from 'node:test';
import assert from 'node:assert/strict';
import {
    deckProfileEntities, encounterThemeEntity, enemyEntities, enemyIdFor, generateEntities, generationWrites, growthEntity, profileGearEntity, resolveCombatLlm, rewardEntity, skillProfileEntity, templateEnemy, withCombatInitialization,
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
    assert.deepEqual([it.itemId, it.name, it.count, it.effects], [itemIdFor('回春丹'), '回春丹', 2, [{ op: 'heal', amount: 12, target: 'ally' }]]);
});
test('正文获得道具带稀有度（D8）：程序筛 3–5 个候选模板，模型选候选外的键定向修正；数值按稀有度与普通档之比放大；不带稀有度时请求形状不变', async () => {
    const anchor = { messageId: 4, swipeId: 0, tagHash: 'r1', occurrence: 0 };
    const hero = { kind: 'deck-character', id: 'pc-hero', name: '主角', owned: new Map(), catalog: new Map() };
    const plain = growthEntity({ kind: 'item', character: '我', name: '回春丹', count: 1, description: '', anchor }, hero).entity;
    assert.equal(Object.hasOwn(plain.input, 'rarity'), false);
    assert.equal(Object.hasOwn(plain.input, 'templates'), false);
    const rare = growthEntity({ kind: 'item', character: '我', name: '回春丹', count: 2, description: '疗伤回复生命', rarity: 'rare', anchor: { ...anchor, tagHash: 'r2' } }, hero).entity;
    assert.equal(rare.input.rarity, 'rare');
    assert.ok(rare.input.templates.length >= 3 && rare.input.templates.length <= 5, String(rare.input.templates));
    assert.ok(rare.input.templates.includes('potion'));
    assert.equal(rare.input.templates.includes('tonic'), false);
    assert.deepEqual(growthEntity({ kind: 'item', character: '我', name: '回春丹', count: 2, description: '疗伤回复生命', rarity: 'rare', anchor: { ...anchor, tagHash: 'r2' } }, hero).entity.input.templates, rare.input.templates);
    const request = fakeRequest([reply([[rare.key, { template: 'tonic' }]]), reply([[rare.key, { template: 'potion' }]])]);
    const result = await generateEntities([rare], { request, llm: LLM, now: 9 });
    assert.equal(result.ok, true, JSON.stringify(result.rejected));
    const bad = request.seen[1].payload.entities[0].previousErrors.find((e) => e.path === 'template');
    assert.equal(bad.reason, 'invalid-template');
    assert.deepEqual(bad.detail.allowed, rare.input.templates);
    const [entry] = generationWrites(result).entries;
    assert.equal(normalizeLedgerEntry(entry).ok, true);
    assert.deepEqual([entry.payload.count, entry.payload.effects], [2, [{ op: 'heal', amount: 15, target: 'ally' }]]);
});
test('正文获得装备带稀有度（D7）：六维加成按稀有度 +1…+5；神话必有被动、只能从 3–5 个候选里选并按神话加强；普通没有被动、只回 ability；非法六维定向修正', async () => {
    const { passiveAtRarity } = await import('../src/combat/card-templates.js');
    const anchor = { messageId: 5, swipeId: 0, tagHash: 'q1', occurrence: 0 };
    const hero = { kind: 'deck-character', id: 'pc-hero', name: '主角', owned: new Map(), catalog: new Map() };
    const plain = growthEntity({ kind: 'equip', character: '我', name: '青锋剑', slot: 'weapon', description: '', anchor }, hero).entity;
    assert.equal(Object.hasOwn(plain.input, 'rarity'), false);
    assert.equal(Object.hasOwn(plain.input, 'templates'), false);
    const myth = growthEntity({ kind: 'equip', character: '我', name: '龙鳞甲', slot: 'treasure', description: '龙鳞所制', rarity: 'mythic', anchor: { ...anchor, tagHash: 'q2' } }, hero).entity;
    const ring = growthEntity({ kind: 'equip', character: '我', name: '铜戒', slot: 'accessory', description: '', rarity: 'common', anchor: { ...anchor, tagHash: 'q3' } }, hero).entity;
    assert.ok(myth.input.templates.length >= 3 && myth.input.templates.length <= 5, String(myth.input.templates));
    assert.equal(Object.hasOwn(ring.input, 'templates'), false);
    const tpl = myth.input.templates[0];
    const request = fakeRequest([
        reply([[myth.key, { ability: '体质', template: tpl }], [ring.key, { ability: '运气' }]]),
        reply([[ring.key, { ability: 'dex' }]]),
    ]);
    const result = await generateEntities([myth, ring], { request, llm: LLM, now: 9 });
    assert.equal(result.ok, true, JSON.stringify(result.rejected));
    const retry = request.seen[1].payload.entities;
    assert.deepEqual(retry.map((e) => e.key), [ring.key]);
    assert.ok(retry[0].previousErrors.some((e) => e.path === 'ability' && e.reason === 'invalid-ability'));
    const [m, r] = generationWrites(result).entries.map((e) => { assert.equal(normalizeLedgerEntry(e).ok, true, e.id); return e.payload; });
    assert.deepEqual([m.rarity, m.bonus, m.passive.effects], ['mythic', { ability: 'con', amount: 5 }, passiveAtRarity(tpl, 'mythic').effects]);
    assert.equal(/宝物加强/.test(m.passive.description), false);
    assert.deepEqual([r.rarity, r.bonus, Object.hasOwn(r, 'passive')], ['common', { ability: 'dex', amount: 1 }, false]);
});




test('正文学会卡牌带稀有度（D9）：卡牌稀有度取标签、只能选 3–5 个候选模板；模型可给数值并按费用 × 稀有度窗口校验；修正用完改用程序求解；不带稀有度仍按个人稀有度', async () => {
    const { CARD_TEMPLATES, solveCardTemplate } = await import('../src/combat/card-templates.js');
    const { assembleGrowth } = await import('../src/combat/generation-assembly.js');
    const anchor = { messageId: 6, swipeId: 0, tagHash: 'l1', occurrence: 0 };
    const hero = { kind: 'deck-character', id: 'pc-hero', name: '主角', owned: new Map(), catalog: new Map() };
    const plain = growthEntity({ kind: 'learn', character: '我', skill: '火球术', description: '', anchor }, hero).entity;
    for (const k of ['rarity', 'templates', 'templateVars']) assert.equal(Object.hasOwn(plain.input, k), false, k);
    const learn = growthEntity({ kind: 'learn', character: '我', skill: '裂空斩', description: '斩击并护身', rarity: 'rare', anchor: { ...anchor, tagHash: 'l2' } }, hero).entity;
    const { templates, templateVars } = learn.input;
    assert.equal(learn.input.rarity, 'rare');
    assert.ok(templates.length >= 3 && templates.length <= 5, String(templates));
    assert.deepEqual(Object.keys(templateVars), templates);
    const outside = Object.keys(CARD_TEMPLATES).find((k) => !templates.includes(k));
    const tpl = templates[0];
    const request = fakeRequest([
        reply([[learn.key, { template: outside, cost: 1 }]]),
        reply([[learn.key, { template: tpl, cost: 1, values: [] }]]),
        reply([[learn.key, { template: tpl, cost: 1, values: [] }]]),
    ]);
    const result = await generateEntities([learn], { request, llm: LLM, now: 9 });
    assert.equal(result.ok, true, JSON.stringify(result.rejected));
    assert.equal(request.seen.length, 3);
    assert.ok(request.seen[1].payload.entities[0].previousErrors.some((e) => e.path === 'template' && e.reason === 'invalid-template'));
    assert.ok(request.seen[2].payload.entities[0].previousErrors.some((e) => e.path === 'values' && e.reason === 'values-length'));
    assert.ok(result.diagnostics.some((d) => d.code === 'combat-values-solved' && d.key === learn.key));
    const [entry] = generationWrites(result).entries;
    assert.equal(normalizeLedgerEntry(entry).ok, true);
    const card = entry.payload.card;
    assert.equal(card.rarity, 'rare');
    assert.deepEqual(card.effects, solveCardTemplate(tpl, card.cost, 'rare').effects);
    // 模型给的合法数值照用；超出窗口的数值按 values 路径拒收。
    const strikeAt = solveCardTemplate('strike', 1, 'rare').effects[0].amount;
    const input = { skill: '重斩', output: 'card', rarity: 'rare', templates: ['strike'] };
    const ok = assembleGrowth({ template: 'strike', cost: 1, values: [strikeAt] }, { key: 'k', input });
    assert.deepEqual([ok.value.card.rarity, ok.value.card.effects[0].amount], ['rare', strikeAt]);
    const over = assembleGrowth({ template: 'strike', cost: 1, values: [40] }, { key: 'k', input });
    assert.ok(over.errors.some((e) => e.path === 'values' && e.reason === 'values-out-of-window'));
    const old = assembleGrowth({ template: 'strike', cost: 1 }, { key: 'k', input: { skill: '重斩', output: 'card' } });
    assert.equal(old.value.card.rarity, 'personal');
});


test('队友按等级补技能（D10）：Lv1–5 请求与旧路径一致；Lv6 起只给复合技能候选、伤害折算上限 21，Lv11 起 25；敌人不受等级影响；放大后的技能档案仍合法', async () => {
    const { skillFillEntity } = await import('../src/combat/generation.js');
    const { assembleSkillFill } = await import('../src/combat/generation-assembly.js');
    const { COMPOSITE_SKILL_KEYS, skillFromTemplate } = await import('../src/combat/card-templates.js');
    const skills = [1, 2, 3].map((n) => ({ id: `sc-a-s${n}`, name: `招${n}`, intent: 'attack', effects: [{ op: 'damage', amount: 4 }] }));
    const profile = { kind: 'skill-character', v: 1, id: 'sc-a', name: '甲', aliases: [], className: '', base: { hp: 60 }, skills,
        passives: [{ id: 'sc-a-p1', name: '剑意', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }] }] };
    const low = skillFillEntity({ profile, count: 1, version: 2, level: 3 });
    const old = skillFillEntity({ profile, count: 1, version: 2 });
    assert.deepEqual([low.input, low.fixed], [old.input, old.fixed]);
    assert.equal(Object.hasOwn(low.input, 'templates'), false);
    assert.equal(Object.hasOwn(low.fixed, 'cap'), false);
    const mid = skillFillEntity({ profile, count: 1, version: 2, level: 8 });
    const high = skillFillEntity({ profile, count: 1, version: 2, level: 12 });
    assert.deepEqual([mid.input.templates, mid.fixed.cap, high.fixed.cap], [[...COMPOSITE_SKILL_KEYS], 21, 25]);
    const wolf = { ...profile, kind: 'enemy', id: 'en-wolf', tier: 'normal' };
    const enemy = skillFillEntity({ profile: wolf, count: 1, version: 2, level: 12 });
    assert.deepEqual([Object.hasOwn(enemy.input, 'templates'), Object.hasOwn(enemy.fixed, 'cap')], [false, false]);
    const plain = assembleSkillFill({ skills: [['补一', 'slash']] }, high);
    assert.ok(plain.errors.some((e) => e.path === 'skills[0][1]' && e.reason === 'invalid-template'), JSON.stringify(plain.errors));
    const built = assembleSkillFill({ skills: [['补一', 'punish']] }, high);
    assert.equal(built.errors, undefined, JSON.stringify(built.errors));
    assert.deepEqual(built.profile.skills[3].effects, skillFromTemplate('punish', 25).effects);
    assert.notDeepEqual(skillFromTemplate('punish', 25).effects, skillFromTemplate('punish', 18).effects);
    assert.equal(normalizeProfile(built.profile).ok, true, JSON.stringify(normalizeProfile(built.profile).errors));
    const lowBuilt = assembleSkillFill({ skills: [['补一', 'slash']] }, low);
    assert.deepEqual(lowBuilt.profile.skills[3].effects, skillFromTemplate('slash', 18).effects);
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
    assert.deepEqual([item.item.itemId, item.item.count, item.item.effects], [itemIdFor('回春丹'), 2, [{ op: 'heal', amount: 12, target: 'ally' }]]);
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


test('v4 卡牌模板：职业卡带出关键字与被弃时效果，X 费模板放在 1–3 费位置改为 X 费，费用不符的限定模板拒收', () => {
    const slots = [0, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3];
    const cards = [['反手', 'reflex'], ['掠击', 'glance'], ['流光', 'fleeting'], ['先机', 'opener'], ['斩五', 'strike'], ['斩六', 'strike'], ['回旋', 'whirl'], ['斩八', 'strike'], ['斩九', 'strike'], ['坚壁', 'xguard'], ['斩终', 'strike']];
    const build = (list) => assembleClass({ ...classValue(), cards: list }, { key: 'v4', owner: 'pc-v4', input: { costSlots: slots } });
    const cls = build(cards);
    assert.equal(cls.errors, undefined, JSON.stringify(cls.errors));
    const pool = cls.profile.classPool;
    assert.deepEqual([pool[0].unplayable, pool[0].cost, pool[0].effects, pool[0].onDiscard[0].op], [true, 0, [], 'draw']);
    assert.deepEqual(pool[1].onDiscard, [{ op: 'draw', amount: 1 }]);
    assert.deepEqual([pool[2].ethereal, pool[3].innate], [true, true]);
    assert.deepEqual([pool[6].cost, pool[9].cost], ['X', 'X']);
    assert.ok(cls.diagnostics.some((d) => d.path === 'cards[6][2]'), JSON.stringify(cls.diagnostics));
    for (const key of ['innate', 'ethereal', 'unplayable', 'retain', 'onDiscard']) assert.equal(Object.hasOwn(pool[4], key), false, key);
    assert.equal(normalizeProfile(cls.profile).ok, true, JSON.stringify(normalizeProfile(cls.profile).errors));
    const swap = (i, card) => cards.map((c, n) => (n === i ? card : c));
    const x0 = build(swap(0, ['回旋二', 'whirl']));
    assert.ok(x0.errors.some((e) => e.path === 'cards[0][1]' && e.reason === 'template-unsolvable' && e.detail.cost === 0), JSON.stringify(x0.errors));
    const r1 = build(swap(1, ['反手二', 'reflex']));
    assert.ok(r1.errors.some((e) => e.path === 'cards[1][1]' && e.reason === 'template-unsolvable' && e.detail.cost === 1), JSON.stringify(r1.errors));
});

test('v4 卡牌模板目录：限定费用模板在每个声明费用都有可解稀有度、求解结果过 schema；本牌专属与关键字模板不能用作人物技能', async () => {
    const { CARD_TEMPLATES, heroSkillFromTemplate, nearestTemplateCost, solveCardTemplate, templateCosts } = await import('../src/combat/card-templates.js');
    const { COMBAT_RULES } = await import('../src/combat/rules.js');
    const { normalizeCard } = await import('../src/combat/schema.js');
    const rarities = Object.keys(COMBAT_RULES.rarityWindows);
    for (const [key, t] of Object.entries(CARD_TEMPLATES)) {
        const costs = templateCosts(key);
        const solvable = costs.filter((cost) => rarities.some((rarity) => solveCardTemplate(key, cost, rarity)));
        if (t.costs) assert.deepEqual(solvable, costs, key);
        else assert.ok(solvable.length, key);
        for (const cost of solvable) for (const rarity of rarities) {
            const solved = solveCardTemplate(key, cost, rarity);
            if (!solved) continue;
            const res = normalizeCard({ id: `c-${key}`, name: key, cost, rarity, ...solved });
            assert.equal(res.ok, true, `${key}|${cost}|${rarity} ${JSON.stringify(res.errors)}`);
        }
    }
    for (const key of ['mimic', 'rampage', 'hone', 'chain', 'whirl', 'xguard', 'reflex', 'glance', 'fleeting', 'opener', 'scrap', 'forge', 'cull', 'toss', 'replicate', 'temper']) {
        assert.equal(heroSkillFromTemplate(key, { id: 'h', name: '技' }), null, key);
    }
    const ward = heroSkillFromTemplate('talisman', { id: 'h', name: '护符' });
    assert.equal(evaluateCardBudget({ cost: COMBAT_RULES.heroSkillCost, rarity: 'personal', effects: ward.effects }).ok, true);
    assert.deepEqual([nearestTemplateCost('whirl', 2, 'personal'), nearestTemplateCost('reflex', 2, 'personal'), nearestTemplateCost('mimic', 0, 'personal')], ['X', 0, 1]);
});


test('补技能 skill-fill：恰好 count 个、ID 接着现有技能数、名称不与已有技能（含 input.existing）重复；通过后按新版本写档案并沿用登记时间；拒收没有回落', async () => {
    const { skillFillEntity } = await import('../src/combat/generation.js');
    const wolf = { kind: 'enemy', id: enemyIdFor('狼', 'normal'), name: '狼', tier: 'normal', base: { hp: 40 }, generated: true,
        skills: [{ id: 'w-s1', name: '撕咬', intent: 'attack', effects: [{ op: 'damage', amount: 5 }] }, { id: 'w-s2', name: '扑击', intent: 'attack', effects: [{ op: 'damage', amount: 5 }] }] };
    const entity = skillFillEntity({ profile: wolf, count: 2, version: 3, existing: ['撕咬', '扑击', '嚎叫'], createdAt: 7 });
    assert.deepEqual([entity.key, entity.kind, entity.role, entity.input.count, entity.input.tier, entity.input.existing],
        [`fill:${wolf.id}`, 'skill-fill', 'fill', 2, 'normal', ['撕咬', '扑击', '嚎叫']]);
    const request = fakeRequest([
        reply([[entity.key, { skills: [['嚎叫', 'guard'], ['裂爪', 'slash']] }]]),
        reply([[entity.key, { skills: [['低吼', 'guard'], ['裂爪', 'slash']] }]]),
    ]);
    const result = await generateEntities([entity], { request, llm: LLM });
    assert.deepEqual([result.ok, result.requests], [true, 2]);
    assert.ok(request.seen[1].payload.entities[0].previousErrors.some((e) => e.reason === 'skill-name-exists'));
    assert.deepEqual(result.accepted[0].profile.skills.map((s) => [s.id, s.name]),
        [['w-s1', '撕咬'], ['w-s2', '扑击'], [`${wolf.id}-k3`, '低吼'], [`${wolf.id}-k4`, '裂爪']]);
    const writes = generationWrites(result, { createdAt: 99 });
    assert.deepEqual(writes.profiles.map((p) => [p.id, p.version, p.createdAt, p.definition.skills.length]), [[wolf.id, 3, 7, 4]]);
    // 数量不对拒收；修正耗尽时没有回落（带现有技能参战由会话处理）。
    const short = await generateEntities([entity], { request: fakeRequest([reply([[entity.key, { skills: [['低吼', 'guard']] }]]), reply([[entity.key, { skills: [] }]]), reply([[entity.key, {}]])]), llm: LLM });
    assert.deepEqual([short.ok, short.accepted.length, short.rejected[0].kind, Object.hasOwn(short.rejected[0], 'fallback')], [false, 0, 'skill-fill', false]);
    assert.deepEqual(generationWrites(short), { profiles: [], entries: [] });
});


test('内部禁止组合（计划 3.4）：7 条规则逐条命中，正常形状不命中；常驻弃牌得能量另计卡组里的弃全手再抽；模板目录各费用 × 稀有度的解都不命中', async () => {
    const { FORBIDDEN_COMBOS, forbiddenCombos } = await import('../src/combat/combos.js');
    const { CARD_TEMPLATES, solveCardTemplate, templateCosts } = await import('../src/combat/card-templates.js');
    const copySelf = { op: 'copy', amount: 1, from: 'self', to: 'hand' };
    const repeat = { op: 'repeat-last', amount: 1 };
    const draw = { op: 'draw', amount: 1 };
    const energy = { op: 'energy', amount: 1 };
    const create = { op: 'create', card: 'shard', amount: 1, to: 'hand' };
    const cases = [
        ['copy-self-repeat', { cost: 1, effects: [copySelf, repeat] }],
        ['zero-cost-copy-self', { cost: 0, effects: [copySelf] }],
        ['discard-draw-loop', { cost: 1, effects: [{ op: 'buff', trigger: 'discard', turns: 2, then: [draw] }], onDiscard: [draw] }],
        ['play-create', { trigger: 'card-played', effects: [create] }],
        ['grow-repeat', { cost: 1, effects: [{ op: 'grow', amount: 2 }, repeat] }],
        ['redraw-discard-energy', { cost: 1, effects: [{ op: 'discard-hand', redraw: true }], onDiscard: [energy] }],
        ['play-buff-copy', { cost: 1, effects: [{ op: 'buff', trigger: 'card-played', turns: 2, then: [{ op: 'copy', amount: 1, from: 'choose', to: 'hand' }] }] }],
    ];
    assert.deepEqual(FORBIDDEN_COMBOS.map((r) => r.id).sort(), cases.map(([id]) => id).sort());
    for (const [id, shape] of cases) assert.ok(forbiddenCombos(shape).includes(id), id);
    assert.deepEqual(forbiddenCombos({ cost: 1, effects: [copySelf] }), []);
    assert.deepEqual(forbiddenCombos({ cost: 1, effects: [{ op: 'damage', amount: 6, hits: 1, target: 'enemy' }, draw] }), []);
    assert.deepEqual(forbiddenCombos({ trigger: 'discard', effects: [energy] }), []);
    assert.ok(forbiddenCombos({ trigger: 'discard', effects: [energy] }, { withDeck: true }).includes('redraw-discard-energy'));
    const hits = [];
    for (const key of Object.keys(CARD_TEMPLATES)) for (const cost of templateCosts(key)) for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'mythic', 'personal']) {
        const s = solveCardTemplate(key, cost, rarity);
        if (s && forbiddenCombos({ cost, effects: s.effects, onDiscard: s.onDiscard }).length) hits.push(`${key}@${cost}/${rarity}`);
    }
    assert.deepEqual(hits, []);
});


test('人物特性池（计划 3.5）：各稀有度池里主动与被动都有；同种子同结果；主动 1 / 2 费，被动字段数不超过稀有度上限、神话等多字段档能抽到多字段；不命中禁止组合、不超队友伤害上限；组装后过账本 schema', async () => {
    const { traitPool, planTraitShape, TRAIT_FIELD_COUNTS } = await import('../src/combat/trait-pool.js');
    const { forbiddenCombos } = await import('../src/combat/combos.js');
    const { effectsDamage } = await import('../src/combat/schema.js');
    const { COMBAT_RULES } = await import('../src/combat/rules.js');
    const { assembleTrait } = await import('../src/combat/generation-assembly.js');
    const anchor = { messageId: 1, swipeId: 0, tagHash: 'trait', occurrence: 0 };
    for (const rarity of Object.keys(TRAIT_FIELD_COUNTS)) {
        const pool = traitPool(rarity);
        assert.ok(pool.some((e) => e.kind === 'active') && pool.some((e) => e.kind === 'passive'), rarity);
        let multi = 0;
        for (let i = 0; i < 60; i += 1) {
            const seed = `s${i}`;
            const shape = planTraitShape(seed, rarity);
            assert.deepEqual(planTraitShape(seed, rarity), shape);
            const body = shape.kind === 'active' ? shape.skill : shape.passive;
            assert.ok(body, `${rarity} ${seed}`);
            if (shape.kind === 'active') assert.ok([1, 2].includes(body.cost), `${rarity} ${seed}`);
            else if (!shape.template) {
                assert.ok(body.effects.length <= TRAIT_FIELD_COUNTS[rarity], `${rarity} ${seed}`);
                if (body.effects.length > 1) multi += 1;
            }
            const probe = shape.kind === 'active' ? { cost: body.cost, effects: body.effects } : { trigger: body.trigger, effects: body.effects };
            assert.deepEqual(forbiddenCombos(probe, { withDeck: shape.kind === 'passive' }), [], `${rarity} ${seed}`);
            assert.ok(effectsDamage(body.effects) <= COMBAT_RULES.allySkillDamageCap, `${rarity} ${seed}`);
            const built = assembleTrait({ name: '特性', origin: '' }, { key: 'k', fixed: { traitId: `tr-${i}`, rarity, shape } });
            assert.ok(built.value, JSON.stringify(built.errors));
            const n = normalizeLedgerEntry({ id: 'trait|pc|1|0|trait|0', type: 'trait', character: 'pc-hero', anchor, payload: { ...built.value, cost: 100 }, createdAt: 9 });
            assert.equal(n.ok, true, `${rarity} ${seed} ${JSON.stringify(n.errors)}`);
        }
        if (TRAIT_FIELD_COUNTS[rarity] > 1) assert.ok(multi > 0, rarity);
    }
});

test('特性池生成：shape 存在时请求带 input.kind 与 input.effect，模型只回 name 与 origin（不写 template）一轮通过，效果取程序抽定的形状', async () => {
    const { traitEntity } = await import('../src/combat/generation.js');
    const { planTraitShape } = await import('../src/combat/trait-pool.js');
    for (const kind of ['active', 'passive']) {
        let shape = null;
        for (let i = 0; !shape && i < 300; i += 1) {
            const s = planTraitShape(`k${i}`, 'rare');
            if (s.kind === kind && (kind === 'active' || !s.template)) shape = s;
        }
        assert.ok(shape, kind);
        const entity = traitEntity({ character: { id: 'pc-hero', name: '主角' }, rarity: 'rare', traitId: `tr-${kind}`, shape });
        assert.deepEqual([entity.input.kind, typeof entity.input.effect], [kind, 'string']);
        const request = fakeRequest([reply([[entity.key, { name: '不灭战意', origin: '边关守城三年' }]])]);
        const result = await generateEntities([entity], { request, llm: LLM, now: 9 });
        assert.equal(result.ok, true, JSON.stringify(result.rejected));
        assert.equal(request.seen.length, 1);
        const trait = result.accepted[0].trait;
        assert.equal(trait.kind, kind);
        assert.deepEqual((trait.skill || trait.passive).effects, (shape.skill || shape.passive).effects);
    }
});


test('敌人图集题材（encounter-theme）：合法题材进结果；非法值记诊断、照常通过且不触发修正；模型未回该键时不拒收；不落账', async () => {
    const entity = encounterThemeEntity({ encounter: '水巷伏击', enemies: [{ name: '神秘水贼', count: 4 }, { name: '神秘水贼头目', count: 1 }] });
    assert.deepEqual([entity.key, entity.kind, entity.optional, entity.input], ['theme:encounter', 'encounter-theme', true, { encounter: '水巷伏击', enemies: ['神秘水贼', '神秘水贼头目'] }]);
    const good = await generateEntities([entity], { request: async () => reply([[entity.key, { theme: 'wuxia' }]]), llm: LLM });
    assert.deepEqual([good.ok, good.requests, good.accepted.map((a) => a.theme)], [true, 1, ['wuxia']]);
    assert.deepEqual(generationWrites(good), { profiles: [], entries: [] });
    const bad = await generateEntities([entity], { request: async () => reply([[entity.key, { theme: 'cyberpunk' }]]), llm: LLM });
    assert.deepEqual([bad.ok, bad.requests, Object.hasOwn(bad.accepted[0], 'theme')], [true, 1, false]);
    assert.ok(bad.diagnostics.some((d) => d.code === 'combat-theme-invalid' && d.key === entity.key));
    const absent = await generateEntities([entity], { request: async () => reply([]), llm: LLM });
    assert.deepEqual([absent.ok, absent.accepted, absent.rejected], [true, [], []]);
});

test('初始装备（profile-gear）：模型只给名称、部位与稀有度，加成属性由程序抽定；空列表合法、不落账；主角空列表与同部位两件拒收并定向修正', async () => {
    const entity = profileGearEntity('陈默');
    assert.deepEqual([entity.kind, entity.optional, entity.input], ['profile-gear', true, { name: '陈默' }]);
    const good = await generateEntities([entity], { request: async () => reply([[entity.key, { gear: [['青锋剑', 'weapon', 'rare', '师门所赐']] }]]), llm: LLM });
    assert.equal(good.ok, true);
    const items = good.accepted[0].gear.items;
    assert.deepEqual([good.accepted[0].gear.name, items.length, items[0].slot, items[0].rarity, items[0].bonus.amount, items[0].description], ['陈默', 1, 'weapon', 'rare', 3, '师门所赐']);
    assert.ok(['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(items[0].bonus.ability));
    const none = await generateEntities([entity], { request: async () => reply([[entity.key, { gear: [] }]]), llm: LLM });
    assert.deepEqual([none.ok, none.accepted[0].gear.items], [true, []]);
    assert.deepEqual(generationWrites(none), { profiles: [], entries: [] });
    const hero = profileGearEntity('陈默', { required: true });
    const empty = await generateEntities([hero], { request: async () => reply([[hero.key, { gear: [] }]]), llm: LLM });
    assert.equal(empty.ok, false);
    assert.ok(empty.rejected[0].errors.some((e) => e.reason === 'invalid-length'));
    const dup = await generateEntities([entity], { request: async () => reply([[entity.key, { gear: [['甲', 'weapon', 'common'], ['乙', 'weapon', 'common']] }]]), llm: LLM });
    assert.deepEqual([dup.ok, dup.requests], [false, 3]);
    assert.ok(dup.rejected[0].errors.some((e) => e.reason === 'slot-duplicate'));
});
