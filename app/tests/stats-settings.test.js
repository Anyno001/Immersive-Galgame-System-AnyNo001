import test from 'node:test';
import assert from 'node:assert/strict';
import { readStatsSettings, normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { renderStatsPromptFields } from '../src/visual/igs-ui/stats-settings-fields.js';
import { DEFAULT_STAT_PROMPTS, STAT_PROMPTS_VERSION } from '../src/scene/stats/stat-prompt.js';
import { buildStatsPrompt } from '../src/scene/stats/stat-prompt.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';

test('提示词设置规范化：只收已登记段名与阶段名、空串视为默认、段开关默认开、不改入参（§9）', () => {
    const raw = { prompts: { source: '自定义来源', tags: '   ', evil: 'x' }, segments: { tags: false, check: 'no' }, stageText: { 深爱: '改过', 未知阶段: 'x' } };
    const frozen = JSON.stringify(raw);
    const s = normalizeStatsSettings(raw);
    assert.equal(JSON.stringify(raw), frozen);
    assert.deepEqual(s.prompts, { source: '自定义来源' });
    assert.equal(s.segments.tags, false);
    assert.equal(s.segments.check, true);
    assert.deepEqual(s.stageText, { 深爱: '改过' });
    const empty = normalizeStatsSettings(null);
    assert.deepEqual([empty.prompts, empty.stageText], [{}, {}]);
    assert.ok(Object.values(empty.segments).every((v) => v === true));
    assert.equal(normalizeStatsSettings({ prompts: { source: 'a'.repeat(5000) } }).prompts.source.length, 4000);
});

test('设置页：每段有开关、可编辑文本框（直接显示当前生效的明文）、恢复默认按钮（无覆盖时禁用）；整块默认折叠', () => {
    const html = renderStatsPromptFields(normalizeStatsSettings({ prompts: { source: '自定义来源' }, segments: { tags: false } }));
    assert.match(html, /<details[^>]*data-advanced="stats-prompts"(?! open)/);
    assert.match(html, /data-switch="bridge\.stats\.segments\.tags" aria-pressed="false"/);
    assert.match(html, /data-path="bridge\.stats\.prompts\.source"[^>]*>自定义来源</);
    // 没有覆盖的段：框里就是默认原文，不是占位提示。
    assert.ok(html.includes(`data-path="bridge.stats.prompts.check" placeholder="">${DEFAULT_STAT_PROMPTS.check}</textarea>`));
    assert.match(html, /data-action="stats-prompt-reset:source" type="button">/);
    assert.match(html, /data-action="stats-prompt-reset:tags" type="button" disabled>/);
    assert.match(html, /data-path="bridge\.stats\.stageText\.深爱"/);
    assert.match(renderStatsPromptFields(normalizeStatsSettings({}), () => ' open'), /data-advanced="stats-prompts" open/);
});

test('框里显示的默认原文未改动时不算覆盖：保存后仍跟随内置默认，恢复默认按钮保持禁用', () => {
    const s = normalizeStatsSettings({ prompts: { check: DEFAULT_STAT_PROMPTS.check, source: `${DEFAULT_STAT_PROMPTS.source}\n` } });
    assert.deepEqual(s.prompts, {});
    assert.match(renderStatsPromptFields(s), /data-action="stats-prompt-reset:check" type="button" disabled>/);
});

test('规范化后的设置直接驱动注入：关闭的段不出、覆盖文本生效', () => {
    const s = normalizeStatsSettings({ prompts: { source: '自定义来源' }, segments: { tags: false } });
    const disabled = Object.entries(s.segments).filter(([, on]) => on === false).map(([id]) => id);
    const r = buildStatsPrompt(createStatsState(), { prompts: s.prompts, disabled, stageText: s.stageText });
    assert.deepEqual(r.segments.map((x) => x.id), ['source', 'protagonist']);
    assert.equal(r.segments[0].text, '自定义来源');
});

test('规则体系：空设置默认 D&D；显式存了 CoC 保留；无 promptsVersion 的旧设置缺 ruleset 时按 CoC；未知值回落', () => {
    assert.equal(normalizeStatsSettings(null).ruleset, 'dnd5e');
    assert.equal(normalizeStatsSettings({}).ruleset, 'dnd5e');
    assert.equal(normalizeStatsSettings({ ruleset: 'coc7' }).ruleset, 'coc7');
    assert.equal(normalizeStatsSettings({ ruleset: 'coc7', promptsVersion: STAT_PROMPTS_VERSION }).ruleset, 'coc7');
    assert.equal(normalizeStatsSettings({ enabled: true }).ruleset, 'coc7');
    assert.equal(normalizeStatsSettings({ enabled: true, promptsVersion: STAT_PROMPTS_VERSION }).ruleset, 'dnd5e');
    assert.equal(normalizeStatsSettings({ ruleset: 'nope', enabled: true }).ruleset, 'coc7');
    assert.equal(normalizeStatsSettings({ ruleset: 'nope', promptsVersion: STAT_PROMPTS_VERSION }).ruleset, 'dnd5e');
    assert.equal(Object.hasOwn(normalizeStatsSettings({ dndNatural: true }), 'dndNatural'), false);
});

test('好感条显示：旧配置里固化的 stage 默认值改为数字；带 hudLabelVersion 的 stage 是用户选的，保留', () => {
    assert.equal(normalizeStatsSettings({ hudLabel: 'stage' }).hudLabel, 'number');
    assert.equal(normalizeStatsSettings({ hudLabel: 'both' }).hudLabel, 'both');
    const saved = normalizeStatsSettings({ hudLabel: 'number' });
    assert.equal(normalizeStatsSettings({ ...saved, hudLabel: 'stage' }).hudLabel, 'stage');
});

test('在场角色约束：阶段约束只出一次；突破与亲密两句可在设置里改写', () => {
    const state = createStatsState();
    state.characters.甲 = { dims: { 好感: 0, 信任: 0, 了解: 0, 欲望: 0 }, unlocked: [] };
    state.characters.乙 = { dims: { 好感: 0, 信任: 0, 了解: 0, 欲望: 0 }, unlocked: [] };
    const r = buildStatsPrompt(state, { present: ['甲', '乙'], nsfw: true, intimacyGate: true, prompts: { intimacy: '自定义亲密' } });
    const text = r.segments.find((x) => x.id === 'present').text;
    assert.equal(text.split(DEFAULT_STAT_PROMPTS.presentRule).length, 2);
    assert.equal(text.split('自定义亲密').length, 3);
    assert.match(renderStatsPromptFields(normalizeStatsSettings({})), /data-path="bridge\.stats\.prompts\.intimacy"/);
});

test('readStatsSettings 按入参引用缓存；normalizeStatsSettings 不缓存（设置页草稿会原地改）', () => {
    const raw = { enabled: true, prompts: { source: '甲' } };
    const a = readStatsSettings(raw);
    assert.equal(readStatsSettings(raw), a);
    assert.notEqual(readStatsSettings({ ...raw }), a);
    assert.notEqual(readStatsSettings(null), readStatsSettings(null));
    assert.equal(a.promptsVersion, STAT_PROMPTS_VERSION);
    const draft = { build: { custom: [] } };
    normalizeStatsSettings(draft);
    draft.build.custom.push('钓鱼');
    assert.deepEqual(normalizeStatsSettings(draft).build.custom, ['钓鱼']);
});

test('提示词迁移：旧设置里 roll、rollManual、protagonist 的覆盖移进 stalePrompts，sheets、sheetGen 保留', () => {
    const old = normalizeStatsSettings({ prompts: { roll: '旧骰运', rollManual: '旧手动', protagonist: '旧主角', sheets: '旧本事', sheetGen: '旧生成', source: '来源' } });
    assert.deepEqual(old.prompts, { sheets: '旧本事', sheetGen: '旧生成', source: '来源' });
    assert.deepEqual(old.stalePrompts, { roll: '旧骰运', rollManual: '旧手动', protagonist: '旧主角' });
    assert.equal(old.promptsVersion, 3);
    const now = normalizeStatsSettings({ promptsVersion: 3, prompts: { diceManual: '新手动' }, stalePrompts: old.stalePrompts });
    assert.deepEqual(now.prompts, { diceManual: '新手动' });
    assert.deepEqual(now.stalePrompts, old.stalePrompts);
});

test('v0.39 把 sheets、sheetGen 放进 stalePrompts 的设置：prompts 里没有时搬回，已有则以 prompts 为准', () => {
    const v39 = normalizeStatsSettings({ promptsVersion: 3, stalePrompts: { sheets: '被误移的本事', sheetGen: '被误移的生成', roll: '旧骰运' } });
    assert.equal(v39.prompts.sheets, '被误移的本事');
    assert.equal(v39.prompts.sheetGen, '被误移的生成');
    assert.deepEqual(v39.stalePrompts, { roll: '旧骰运' });
    const both = normalizeStatsSettings({ promptsVersion: 3, prompts: { sheets: '现行' }, stalePrompts: { sheets: '旧的' } });
    assert.equal(both.prompts.sheets, '现行');
    assert.equal(Object.hasOwn(both.stalePrompts, 'sheets'), false);
    // 与默认值相同的旧覆盖不算覆盖，不进失效清单。
    const same = normalizeStatsSettings({ prompts: { protagonist: DEFAULT_STAT_PROMPTS.protagonist } });
    assert.deepEqual([same.prompts, same.stalePrompts], [{}, {}]);
});
