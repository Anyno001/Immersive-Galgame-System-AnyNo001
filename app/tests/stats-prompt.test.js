import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStatsPrompt, describeProtagonist, fillTemplate, intimacyAllowed, mandatesFromFlags } from '../src/scene/stats/stat-prompt.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';

function withChars(chars) {
    const s = createStatsState();
    const characters = {};
    for (const [name, patch] of Object.entries(chars)) {
        const base = createCharacter(1, { nsfw: true });
        characters[name] = { ...base, ...patch, dims: { ...base.dims, ...(patch.dims || {}) } };
    }
    return { ...s, characters };
}

test('模板变量缺失时原样保留并记诊断，不中断（§9）', () => {
    const diag = [];
    assert.equal(fillTemplate('{{a}}-{{ b }}', { a: 1 }, diag), '1-{{ b }}');
    assert.deepEqual(diag, [{ code: 'stat-prompt-var-missing', name: 'b' }]);
});

test('默认注入段：来源声明、主角状态、标签说明；没有在场角色与检定时不出对应段', () => {
    const r = buildStatsPrompt(createStatsState());
    assert.deepEqual(r.segments.map((s) => s.id), ['source', 'protagonist', 'tags']);
    assert.match(r.content, /生命100\/100，体力100\/100/);
    assert.match(r.content, /\[igs-stat:favor\|角色名\|开心\/感动/);
    assert.deepEqual(r.diagnostics, []);
});

test('只注入在场的已登记角色：阶段约束与维度组合描述（Q4、§5.1）', () => {
    const state = withChars({ 小雪: { dims: { 好感: 30, 信任: 0 } } });
    const r = buildStatsPrompt(state, { present: ['小雪', '路人甲'] });
    const present = r.segments.find((s) => s.id === 'present').text;
    assert.match(present, /【小雪】关系阶段：明确喜欢/);
    assert.match(present, /喜欢但仍有防备/);
    assert.doesNotMatch(r.content, /路人甲/);
});

test('停在关口时给突破提示；已解锁的关口不再提示（§5.2）', () => {
    const at = buildStatsPrompt(withChars({ 小雪: { dims: { 好感: 25 } } }), { present: ['小雪'] });
    assert.match(at.content, /更进一步/);
    const done = buildStatsPrompt(withChars({ 小雪: { dims: { 好感: 25 }, unlocked: ['gate-25'] } }), { present: ['小雪'] });
    assert.doesNotMatch(done.content, /更进一步/);
});

test('亲密门槛：NSFW 开启且未达标时要求拒绝或回避；关闭 NSFW 或关闭门槛时不出（§5.4）', () => {
    const state = withChars({ 小雪: { dims: { 好感: 30, 信任: 10, 欲望: 0 } } });
    assert.match(buildStatsPrompt(state, { present: ['小雪'], nsfw: true, intimacyGate: true }).content, /拒绝或回避/);
    assert.doesNotMatch(buildStatsPrompt(state, { present: ['小雪'], nsfw: false, intimacyGate: true }).content, /拒绝或回避/);
    assert.doesNotMatch(buildStatsPrompt(state, { present: ['小雪'], nsfw: true, intimacyGate: false }).content, /拒绝或回避/);
    assert.equal(intimacyAllowed({ 好感: 51, 信任: 26, 欲望: 26 }), true);
    assert.equal(intimacyAllowed({ 好感: 50, 信任: 26, 欲望: 26 }), false);
});

test('本轮检定段、强制事项段；可单独关闭；用户模板覆盖优先', () => {
    const r = buildStatsPrompt(createStatsState(), {
        check: { skill: '烹饪', roll: 33, threshold: 25, outcome: '失败' },
        mandates: mandatesFromFlags({ forcedRest: true }, { health: 0 }),
        disabled: ['source', 'tags'],
        prompts: { protagonist: '体力{{体力}}{{不存在}}' },
    });
    assert.deepEqual(r.segments.map((s) => s.id), ['protagonist', 'check', 'mandates']);
    assert.match(r.content, /1d100=33，需≤25，结果【失败】/);
    assert.match(r.content, /昏睡或休息；主角昏迷/);
    assert.equal(r.segments[0].text, '体力100{{不存在}}');
    assert.equal(r.diagnostics[0].name, '不存在');
});

test('主角状态描述：疲惫、重伤、压力大、买不起', () => {
    const text = describeProtagonist({ health: 10, stamina: 20, stress: 80, money: 0 }, { shortfall: true });
    assert.match(text, /重伤/);
    assert.match(text, /疲惫/);
    assert.match(text, /压力很大/);
    assert.match(text, /买不起/);
    assert.equal(describeProtagonist({ health: 100, stamina: 100, stress: 0 }), '');
});
