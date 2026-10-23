import test from 'node:test';
import assert from 'node:assert/strict';
import {
    deckProfileEntities, enemyEntities, enemyIdFor, generateEntities, generationWrites, growthEntity, resolveCombatLlm, skillProfileEntity,
} from '../src/combat/generation.js';
import { normalizeLedgerEntry, normalizeProfile, profileIdFor } from '../src/combat/schema.js';

// 只验证解析与校验链路；回复是固定夹具，不证明模型生成质量。
const attack = (id, amount = 6) => ({ id, name: `斩${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount }] });
const guard = (id) => ({ id, name: `守${id}`, type: 'skill', cost: 1, rarity: 'common', effects: [{ op: 'block', amount: 5 }] });
const passive = (id) => ({ id, name: '锋锐', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }] });
const STARTER = [
    'basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend',
    'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'm1', 'm1', 'm2', 'm2',
];
const classValue = (first = attack('c1')) => ({
    className: '剑士', archetype: 'warrior', classPassive: passive('p-edge'),
    classPool: [first, attack('c2'), guard('c3'), guard('c4'), attack('c5'), attack('c6'), guard('c7'), guard('c8')],
});
const deckValue = () => ({ base: { hp: 80 }, personalPassive: passive('p-will'), personalPool: [attack('m1'), guard('m2'), attack('m3'), guard('m4')], starterDeck: [...STARTER] });
const enemyValue = () => ({ base: { hp: 40 }, skills: [{ id: 'e1', name: '撕咬', intent: 'attack', effects: [{ op: 'damage', amount: 6 }] }, { id: 'e2', name: '蜷缩', intent: 'defend', effects: [{ op: 'block', amount: 5 }] }] });
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

test('部分实体超封顶时只对它定向修正，已通过的实体不出现在修正请求里', async () => {
    const strong = enemyValue();
    strong.skills[0].effects[0].amount = 20;
    const request = fakeRequest([
        reply([[classKey, classValue()], [deckKey, deckValue()], [enemyKey, strong]]),
        reply([[enemyKey, enemyValue()]]),
    ]);
    const result = await generateEntities(opening(), { request, llm: LLM });
    assert.deepEqual([result.ok, result.requests], [true, 2]);
    assert.deepEqual(keysOf(request.seen, 1), [enemyKey]);
    const fix = request.seen[1].payload.entities[0];
    assert.ok(fix.previousErrors.some((e) => e.path === 'skills[0].effects' && e.reason === 'damage-cap'));
    assert.equal(fix.previous.skills[0].effects[0].amount, 20);
});


test('错误字段与超预算按字段路径拒收；职业修好后挂起的卡组直接通过、不重新提交', async () => {
    const bad = { ...classValue(attack('c1', 15)), secret: 1 };
    const request = fakeRequest([
        reply([[classKey, bad], [deckKey, deckValue()], [enemyKey, enemyValue()]]),
        reply([[classKey, classValue()]]),
    ]);
    const result = await generateEntities(opening(), { request, llm: LLM });
    assert.deepEqual([result.ok, result.requests], [true, 2]);
    assert.deepEqual(keysOf(request.seen, 1), [classKey]);
    const errors = request.seen[1].payload.entities[0].previousErrors;
    assert.ok(errors.some((e) => e.path === 'secret' && e.reason === 'unknown-field'));
    assert.ok(errors.some((e) => e.path === 'classPool[0].effects' && e.reason === 'over-budget'));
    assert.equal(result.accepted.length, 3);
});

const bladeClass = () => normalizeProfile({ ...classValue(), kind: 'class', id: 'cls-blade' }).value;

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
    const existing = [normalizeProfile({ ...enemyValue(), kind: 'enemy', id: enemyIdFor('狼', 'normal'), name: '狼', tier: 'normal' }).value];
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
    strong.skills[0].effects[0].amount = 20;
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
    const skill = { name: '连射', intent: 'attack', effects: [{ op: 'damage', amount: 4, hits: 2 }] };
    const request = fakeRequest([reply([
        [learn.key, { card: { ...attack('ignored'), name: '裂空斩' } }],
        [upgrade.key, { targetId: 'nope', card: { ...attack('x2'), name: '破军' } }],
        [skillUp.key, { targetId: 's1', skill }],
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
