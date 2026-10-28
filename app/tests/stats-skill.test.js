import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDifficulty, forgetSkillWord, learnSkillWord, matchSkill } from '../src/scene/stats/stat-skill-match.js';
import { chooseSkillWithModel, parseModelSkillChoice } from '../src/scene/stats/stat-skill-model.js';
import { POSITIVE, NEGATIVE } from './fixtures/stats-skill-corpus.js';

test('语料验收：不少于 200 句、反例不少于一半；正例全中、反例零误触发（易错点 G4）', () => {
    const total = POSITIVE.length + NEGATIVE.length;
    assert.ok(total >= 200, `语料 ${total} 句`);
    assert.ok(NEGATIVE.length * 2 >= total, `反例 ${NEGATIVE.length} 句`);
    const misses = POSITIVE.filter(([text, skill]) => matchSkill(text).skill !== skill).map(([text, skill]) => `${text} → 期望 ${skill}，实际 ${matchSkill(text).skill}`);
    assert.deepEqual(misses, []);
    const falsePositives = NEGATIVE.filter((text) => matchSkill(text).skill !== null).map((text) => `${text} → ${matchSkill(text).skill}`);
    assert.deepEqual(falsePositives, []);
});

test('组合词要求动作词与对象词同时命中：做作业不是烹饪', () => {
    assert.equal(matchSkill('我去做作业').skill, '学习');
    assert.equal(matchSkill('我给她做一顿寿司').skill, '烹饪');
    assert.equal(matchSkill('我做了个梦').skill, null);
});

test('排除：否定、假设、引号台词、回忆、旁观（§4.1A）', () => {
    assert.equal(matchSkill('我不想做饭').reason, 'excluded');
    assert.equal(matchSkill('如果我下厨的话').reason, 'excluded');
    assert.equal(matchSkill('我说：“我会做饭哦。”').skill, null);
    assert.equal(matchSkill('我回忆起当年下厨的样子').skill, null);
    assert.equal(matchSkill('我看她做饭').skill, null);
    assert.equal(matchSkill('她在厨房做饭').skill, null);
});

test('冲突裁决：取命中最长者；完全并列时交给辅助模型', () => {
    assert.equal(matchSkill('我先打扫房间再下厨').skill, '家务');
    const extra = { 照顾: { solo: ['喂饭'] }, 烹饪: { solo: ['喂饭'] } };
    const r = matchSkill('我喂饭', { extra });
    assert.ok(r.skill === '照顾' || r.skill === '烹饪' || r.reason === 'conflict');
});

test('难度词', () => {
    assert.equal(detectDifficulty('第一次做精致的蛋糕'), '困难');
    assert.equal(detectDifficulty('做一道传说级料理'), '极难');
    assert.equal(detectDifficulty('随便煮个面'), '普通');
    assert.equal(matchSkill('第一次做蛋糕').difficulty, '困难');
});

test('用户词条优先于学习表；学习表可删；技能清单外的技能不收（易错点 G3）', () => {
    let learned = learnSkillWord({}, '熬魔药', '烹饪');
    assert.equal(matchSkill('我熬魔药', { learned }).skill, '烹饪');
    assert.equal(matchSkill('我熬魔药', { learned, extra: { 学习: { solo: ['熬魔药'] } } }).skill, '学习');
    learned = forgetSkillWord(learned, '熬魔药');
    assert.equal(matchSkill('我熬魔药', { learned }).skill, null);
    assert.deepEqual(learnSkillWord({}, '熬魔药', '炼金'), {});
    assert.deepEqual(learnSkillWord({}, '熬3锅', '烹饪'), {});
    assert.equal(matchSkill('我下厨', { skills: ['学习'] }).skill, null);
});

test('辅助模型只能从清单里选；清单外、带数字、坏 JSON 作废为无需检定（易错点 G2）', () => {
    const pool = ['烹饪', '学习'];
    assert.deepEqual(parseModelSkillChoice('{"skill":"烹饪","difficulty":"困难"}', pool), { skill: '烹饪', difficulty: '困难', ok: true });
    assert.equal(parseModelSkillChoice('{"skill":"炼金","difficulty":"普通"}', pool).skill, null);
    assert.equal(parseModelSkillChoice('{"skill":"烹饪","difficulty":"75"}', pool).skill, null);
    assert.equal(parseModelSkillChoice('不是 JSON', pool).reason, 'model-choice-invalid');
    assert.equal(parseModelSkillChoice('{"skill":"","difficulty":"无需检定"}', pool).ok, true);
});

test('辅助模型超时、失败、未配置时按无需检定继续，不阻塞（易错点 G1）', async () => {
    const hang = () => new Promise(() => {});
    const timed = await chooseSkillWithModel('x', { skills: ['烹饪'], request: hang, timeoutMs: 20 });
    assert.deepEqual([timed.skill, timed.reason], [null, 'model-timeout']);
    const failed = await chooseSkillWithModel('x', { skills: ['烹饪'], request: () => { throw new Error('boom'); } });
    assert.equal(failed.reason, 'model-failed');
    assert.equal((await chooseSkillWithModel('x', { skills: ['烹饪'] })).reason, 'model-unavailable');
    const ok = await chooseSkillWithModel('x', { skills: ['烹饪', '学习'], candidates: ['学习'], request: async (p) => { assert.match(p.user, /学习/); return { text: '{"skill":"学习","difficulty":"普通"}' }; } });
    assert.equal(ok.skill, '学习');
});
