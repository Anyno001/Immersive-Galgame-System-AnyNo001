import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { renderStatsPromptFields } from '../src/visual/igs-ui/stats-settings-fields.js';
import { DEFAULT_STAT_PROMPTS } from '../src/scene/stats/stat-prompt.js';
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

test('旧版提示词覆盖（合并计划 P5）：已删除或改义段的覆盖移入 stalePrompts、不再生效；其余覆盖照常；规范化可重复', () => {
    const legacy = { prompts: { source: '自定义来源', roll: '旧骰运', rollManual: '旧手动', protagonist: '生命{{生命}}/100', sheets: '旧本事', sheetGen: '旧建卡', skills: '自定义技能' } };
    const s = normalizeStatsSettings(legacy);
    assert.equal(s.promptsVersion, 2);
    assert.deepEqual(s.prompts, { source: '自定义来源', skills: '自定义技能' });
    assert.deepEqual(Object.keys(s.stalePrompts).sort(), ['protagonist', 'roll', 'rollManual', 'sheetGen', 'sheets']);
    assert.equal(s.staleNoticeSeen, false);
    // 保存后再读（已是当前版本）：失效覆盖原样保留，新写的 protagonist 覆盖生效。
    const again = normalizeStatsSettings({ ...s, prompts: { ...s.prompts, protagonist: '新状态{{体力}}' } });
    assert.deepEqual(again.stalePrompts, s.stalePrompts);
    assert.equal(again.prompts.protagonist, '新状态{{体力}}');
    assert.deepEqual(normalizeStatsSettings(again), again);
    // 旧段名的开关不再登记。
    assert.ok(!('roll' in normalizeStatsSettings({ segments: { roll: false } }).segments));
});

test('设置页：有失效覆盖时提示一次并给出「知道了」；看过后不再显示', () => {
    const s = normalizeStatsSettings({ prompts: { roll: '旧骰运', sheetGen: '旧建卡' } });
    const html = renderStatsPromptFields(s);
    assert.match(html, /data-stats-prompt-stale/);
    assert.match(html, /掷骰规则、角色卡生成/);
    assert.match(html, /data-action="stats-prompt-stale-ack"/);
    assert.doesNotMatch(renderStatsPromptFields({ ...s, staleNoticeSeen: true }), /data-stats-prompt-stale/);
    assert.doesNotMatch(renderStatsPromptFields(normalizeStatsSettings({})), /data-stats-prompt-stale/);
    assert.match(html, /data-switch="bridge\.stats\.segments\.dice"/);
});
