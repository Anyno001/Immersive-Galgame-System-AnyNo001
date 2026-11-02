import test from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGE_FOE_SYSTEM, challengeFoeEntity, chooseChallengeFoe } from '../src/combat/challenge-foe-pick.js';
import { GENERATION_SYSTEM, generateEntities } from '../src/combat/generation.js';
import { assembleChallengeFoe } from '../src/combat/challenge-foes.js';
import { CHALLENGE_FOE_KEYS, pickFoe } from '../src/combat/challenge-foes.js';
import { buildChallengeSetup } from '../src/combat/challenge-setup.js';

const EVENT = '厨艺比赛';
const keyOf = (req) => JSON.parse(req.user).entities[0].key;
const reply = (req, value) => JSON.stringify({ entities: [{ key: keyOf(req), value }] });
const scripted = (values) => {
    const calls = [];
    const request = async (req) => {
        calls.push({ ...JSON.parse(req.user), system: req.system });
        if (calls.length > values.length) throw new Error('no more replies');
        return reply(req, values[calls.length - 1]);
    };
    return { request, calls };
};

test('副模型回复合法的难关键与名称时采用，请求里带事件名、领域与难关目录', async () => {
    const { request, calls } = scripted([{ foe: 'judge', name: '美食评审团' }]);
    const picked = await chooseChallengeFoe({ event: EVENT, domain: '烹饪', request, retryDelays: [] });
    assert.deepEqual(picked, { foe: 'judge', name: '美食评审团', source: 'llm' });
    assert.equal(calls[0].system, `${GENERATION_SYSTEM}
${CHALLENGE_FOE_SYSTEM}`);
    assert.equal(calls[0].entities[0].kind, 'challenge-foe');
    assert.equal(calls[0].entities[0].input.event, EVENT);
    assert.deepEqual(calls[0].entities[0].input.foes.map((foe) => foe.key), [...CHALLENGE_FOE_KEYS]);
});

test('非法难关键被拒收并带错误重问，第二次合法即采用', async () => {
    const { request, calls } = scripted([{ foe: 'dragon', name: '恶龙' }, { foe: 'examiner', name: '主考官' }]);
    const picked = await chooseChallengeFoe({ event: '期末考试', domain: '学习', request, retryDelays: [] });
    assert.equal(picked.source, 'llm');
    assert.equal(picked.foe, 'examiner');
    assert.equal(calls.length, 2);
    assert.equal(calls[1].entities[0].previousErrors[0].path, 'foe');
    assert.equal(calls[1].entities[0].previousErrors[0].reason, 'invalid-template');
});

test('一直非法时退回本地挑选，名称留空沿用登记名', async () => {
    const { request } = scripted([{ foe: 'x', name: 'a' }, { foe: 'y', name: 'b' }, { foe: '', name: '' }]);
    const picked = await chooseChallengeFoe({ event: EVENT, domain: '烹饪', request, retryDelays: [] });
    assert.deepEqual([picked.foe, picked.name, picked.source], [pickFoe(EVENT, '烹饪'), '', 'local']);
});

test('副模型不可用或请求失败时退回本地挑选，不抛出', async () => {
    assert.equal((await chooseChallengeFoe({ event: '公司终面', domain: '话术' })).foe, 'interviewer');
    const failing = async () => { throw new Error('boom'); };
    const result = await chooseChallengeFoe({ event: '公司终面', domain: '话术', request: failing, retryDelays: [] });
    assert.equal(result.source, 'local');
    assert.equal(result.foe, 'interviewer');
});

test('装配只拒收不修正：缺名称、名称过长、键不在登记表都不放行', () => {
    assert.deepEqual(assembleChallengeFoe({ foe: 'judge', name: '评委' }).value, { foe: 'judge', name: '评委' });
    assert.equal(assembleChallengeFoe({ foe: ' judge ', name: ' 评委 ' }).value.foe, 'judge');
    for (const raw of [{ foe: 'judge' }, { foe: 'judge', name: '' }, { foe: 'judge', name: '长'.repeat(21) }, { foe: 'Judge', name: '评委' }, { name: '评委' }, 'judge', null]) {
        assert.ok(assembleChallengeFoe(raw).errors?.length, JSON.stringify(raw));
    }
});

test('难关实体可与其他实体同批处理，被拒收时记录本地兜底难关', async () => {
    const entity = challengeFoeEntity({ event: '公司终面', domain: '话术' });
    const result = await generateEntities([entity], { request: async (req) => reply(req, { foe: 'nope', name: 'x' }), maxRounds: 0 });
    assert.equal(result.ok, false);
    assert.deepEqual(result.rejected[0].fallback, { kind: 'local-foe', foe: 'interviewer' });
});

test('选出的难关键与名称交给建局后生效，非法键忽略', () => {
    const state = { bars: { stamina: 100, stress: 0 }, skills: { 话术: { value: 60 } } };
    const built = buildChallengeSetup({ start: { event: '公司终面', domain: '话术', tier: '普通', stake: '压力', foe: 'judge', foeName: '评审团' }, state, user: { name: '我' } });
    assert.equal(built.setup.challenge.foe, 'judge');
    assert.equal(built.setup.units.at(-1).name, '评审团');
    const bad = buildChallengeSetup({ start: { event: '公司终面', domain: '话术', foe: 'dragon' }, state, user: { name: '我' } });
    assert.equal(bad.setup.challenge.foe, 'interviewer');
});
