import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_STAT_PROMPTS, STAT_PROMPTS_VERSION, STAT_STALE_PROMPT_KEYS, buildStatsPrompt, describeProtagonist, fillTemplate, intimacyAllowed, mandatesFromFlags, vitalsText } from '../src/scene/stats/stat-prompt.js';
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
    assert.match(r.content, /生命未知，体力100\/100/);
    assert.match(buildStatsPrompt(createStatsState(), { vitals: { hp: 42, maxHp: 60 } }).content, /生命42\/60，体力100\/100/);
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
        mandates: mandatesFromFlags({ forcedRest: true }, { hp: 0, maxHp: 60, down: true }),
        disabled: ['source', 'tags'],
        prompts: { protagonist: '体力{{体力}}{{不存在}}' },
    });
    assert.deepEqual(r.segments.map((s) => s.id), ['protagonist', 'check', 'mandates']);
    assert.match(r.content, /1d100=33，需≤25，结果【失败】/);
    assert.match(r.content, /昏睡或休息；主角已倒下/);
    assert.equal(r.segments[0].text, '体力100{{不存在}}');
    assert.equal(r.diagnostics[0].name, '不存在');
});

test('主角状态描述：疲惫、重伤、压力大、买不起', () => {
    const text = describeProtagonist({ stamina: 20, stress: 80, money: 0 }, { shortfall: true, vitals: { hp: 10, maxHp: 100 } });
    assert.match(text, /重伤/);
    assert.match(describeProtagonist({ stamina: 100, stress: 0 }, { vitals: { hp: 0, maxHp: 100 } }), /已倒下/);
    assert.match(text, /疲惫/);
    assert.match(text, /压力很大/);
    assert.match(text, /买不起/);
    assert.equal(describeProtagonist({ stamina: 100, stress: 0 }), '');
    assert.equal(describeProtagonist({ stamina: 100, stress: 0 }, { vitals: { hp: 100, maxHp: 100 } }), '');
});

test('生命显示：当前/最大，无数据显示未知，倒下记 0', () => {
    assert.equal(vitalsText(null), '未知');
    assert.equal(vitalsText({ hp: 7.6, maxHp: 30 }), '8/30');
    assert.equal(vitalsText({ hp: 5, maxHp: 30, down: true }), '0/30');
});

test('版本与失效键：失效的是 roll、rollManual、protagonist；sheets、sheetGen 保留有效', () => {
    assert.equal(STAT_PROMPTS_VERSION, 3);
    assert.deepEqual([...STAT_STALE_PROMPT_KEYS], ['roll', 'rollManual', 'protagonist']);
    assert.match(DEFAULT_STAT_PROMPTS.sheets, /六维加值：\{\{六维加值\}\}/);
    assert.match(DEFAULT_STAT_PROMPTS.sheetGen, /属性档：很弱、偏弱、普通、出众、顶尖/);
    assert.match(DEFAULT_STAT_PROMPTS.sheetGen, /力量、敏捷、体质、智力、感知、魅力 与 理智/);
});

test('sheets 段：六维加值变量由调用方给，缺省提示由前端估算', () => {
    const state = withChars({ 小雪: {} });
    const r = buildStatsPrompt(state, { present: ['小雪'], sheetLines: [{ name: '小雪', rank: '老手', strong: '格斗（精通）', bonus: '力量+2 敏捷+0' }] });
    assert.match(r.segments.find((x) => x.id === 'sheets').text, /【小雪的本事】老手；擅长：格斗（精通）；六维加值：力量\+2 敏捷\+0。/);
    const bare = buildStatsPrompt(state, { present: ['小雪'], sheetLines: [{ name: '小雪' }] });
    assert.match(bare.content, /六维加值：由前端按其强弱估算/);
});

test('dice 段：D&D 用 check-rolls 模板，CoC 用百分骰模板，用户覆盖优先；战斗段只在战斗开启时出现', () => {
    const d20 = Array.from({ length: 10 }, (_, i) => [i + 1, 20 - i]);
    const dnd = buildStatsPrompt(createStatsState(), { dice: { rolls: d20 } });
    assert.ok(dnd.segments.some((x) => x.id === 'dice'));
    assert.match(dnd.content, /1\/20/);
    const cocRolls = Array.from({ length: 10 }, () => ({ unit: 7, tens: [3, 1, 5] }));
    const coc = buildStatsPrompt(createStatsState(), { cocDice: { rolls: cocRolls } });
    assert.match(coc.segments.find((x) => x.id === 'dice').text, /d100/);
    assert.match(coc.content, /37（奖17\/17，罚37\/57）/);
    const custom = buildStatsPrompt(createStatsState(), { prompts: { dice: '自定义骰序：{{骰序}}' }, cocDice: { rolls: cocRolls } });
    assert.match(custom.segments.find((x) => x.id === 'dice').text, /^自定义骰序：37/);
    const manual = buildStatsPrompt(createStatsState(), { manualRoll: true });
    assert.match(manual.content, /写到行动发起处就停/);
    assert.ok(!buildStatsPrompt(createStatsState()).segments.some((x) => x.id === 'combat' || x.id === 'party'));
    const fight = buildStatsPrompt(createStatsState(), { combatOn: true, partyLines: ['小雪：轻伤'] });
    assert.ok(fight.segments.some((x) => x.id === 'combat'));
    assert.match(fight.segments.find((x) => x.id === 'party').text, /小雪：轻伤/);
});
