import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCocSheet } from '../src/scene/stats/coc-investigator.js';
import { chatEntries, restoreChat } from '../src/scene/stats/stat-log.js';
import { sanitizeCatalog } from '../src/scene/stats/stat-persist.js';
import { PROTAGONIST, createEngine, profileOf } from '../src/scene/stats/stat-engine.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';

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
