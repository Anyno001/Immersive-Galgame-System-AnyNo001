import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCocSheet } from '../src/scene/stats/coc-investigator.js';
import { chatEntries, restoreChat } from '../src/scene/stats/stat-log.js';
import { sanitizeCatalog } from '../src/scene/stats/stat-persist.js';
import { PROTAGONIST, createEngine, profileOf } from '../src/scene/stats/stat-engine.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';

const sheet = sanitizeCocSheet({ v: 1, attrs: { 力量: 63, 体质: 50, 体型: 60, 敏捷: 70, 外貌: 55, 智力: 80, 意志: 45, 教育: 75 }, luck: 40, occupation: '记者', occFormula: 'edu4', alloc: {}, totals: { 侦查: 60 }, san: 45, source: 'paste', at: 1 });
const profile = (ruleset, coc, skill) => profileOf(createEngine({ protagonistCoc: coc }, {}, ruleset), createStatsState(), PROTAGONIST, skill).value;

test('hero:coc 经 chatEntries → restoreChat 读回', () => {
    assert.ok(sheet);
    const entries = chatEntries({ catalog: { protagonistCoc: sheet } });
    assert.ok(entries.has('hero:coc'));
    assert.deepEqual(sanitizeCatalog(restoreChat(entries).catalog).protagonistCoc, sheet);
    assert.equal(chatEntries({ catalog: {} }).has('hero:coc'), false);
});

test('coc7 有档：属性取档值，魅力与外貌同值，教育有值；无档或 dnd5e 不变', () => {
    assert.equal(profile('coc7', sheet, '力量'), 63);
    assert.equal(profile('coc7', sheet, '魅力'), profile('coc7', sheet, '外貌'));
    assert.equal(profile('coc7', sheet, '外貌'), 55);
    assert.equal(profile('coc7', sheet, '教育'), 75);
    assert.equal(profile('coc7', sheet, '理智'), 45);
    assert.equal(profile('coc7', null, '力量'), profile('coc7', undefined, '力量'));
    assert.notEqual(profile('coc7', null, '力量'), 63);
    assert.equal(profile('dnd5e', sheet, '力量'), profile('dnd5e', null, '力量'));
});

test('调查员模式的成长落在调查员账本，日常技能冻结；日常模式忽略调查员档', () => {
    const state = createStatsState({ skills: ['侦查'], special: 30 });
    const check = { success: true, actor: PROTAGONIST, skill: '侦查', kind: 'skill', value: 60 };
    const engineOf = (cocMode) => createEngine({ protagonistCoc: sheet, cocMode }, {}, 'coc7');
    const run = (engine) => settleFloorText(state, '', { random: () => 0.5, engine, check }).state;
    const inv = run(engineOf('investigator'));
    assert.equal(inv.protagonist.skills, state.protagonist.skills);
    assert.equal(inv.investigator.skills.侦查.marked, true);
    const daily = run(engineOf('daily'));
    assert.equal(daily.protagonist.skills.侦查.marked, true);
    assert.equal(daily.investigator, undefined);
    assert.equal(profileOf(engineOf('daily'), state, PROTAGONIST, '侦查').value, profileOf(createEngine({}, {}, 'coc7'), state, PROTAGONIST, '侦查').value);
});

test('cocMode 缺省按有无档决定，显式值经 hero:mode 读回', () => {
    assert.equal(createEngine({ protagonistCoc: sheet }, {}, 'coc7').protagonistCoc, sheet);
    assert.equal(createEngine({ protagonistCoc: sheet, cocMode: 'daily' }, {}, 'coc7').protagonistCoc, null);
    const entries = chatEntries({ catalog: { protagonistCoc: sheet, cocMode: 'daily' } });
    assert.equal(entries.get('hero:mode'), 'daily');
    assert.equal(sanitizeCatalog(restoreChat(entries).catalog).cocMode, 'daily');
    assert.equal(chatEntries({ catalog: { protagonistCoc: sheet } }).has('hero:mode'), false);
});
