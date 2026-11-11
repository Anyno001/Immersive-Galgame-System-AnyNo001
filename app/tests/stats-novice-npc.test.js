import test from 'node:test';
import assert from 'node:assert/strict';
import {
    NPC_SKILL_OFFSETS, applyBackfillToSheet, npcSkillTier, npcSkillValue, parseBackfillReply, parseSheetReply, sheetFromTiers, strongSkills,
} from '../src/scene/stats/stat-sheets.js';
import { createEngine, markCheckOpponents, markNpcGrowth, npcGrowthBonus, profileOf } from '../src/scene/stats/stat-engine.js';
import { settleDay, settleSkip } from '../src/scene/stats/stat-day.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { createSkillRegistry } from '../src/scene/stats/stat-registry.js';
import { composeStatsHud } from '../src/scene/stats/stat-metrics.js';
import { parseStatDirectives } from '../src/scene/stats/stat-directives.js';
import { growthResults } from '../src/scene/stats/stat-fx.js';
import { buildStatsPageValues } from '../src/visual/igs-ui/stats-settings-fields.js';
import { getPageTemplate } from '../src/visual/igs-ui/settings-tabs.js';
import { renderTemplate } from '../src/visual/igs-ui/settings-fields.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';

const seq = (...values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };
const withHeroSkill = (state, name, value) => ({ ...state, protagonist: { ...state.protagonist, skills: { ...state.protagonist.skills, [name]: { value, marked: false } } } });
const withNpc = (state, name, character = {}) => ({ ...state, characters: { ...state.characters, [name]: { ...createCharacter(1), ...character } } });
const engineWith = (sheets) => createEngine({ sheets }, { ruleset: 'coc7' }, 'coc7');
const BASE_SHEET = { rank: '普通人', attributes: { 力量: 10, 敏捷: 10, 体质: 10, 智力: 10, 感知: 10, 魅力: 10 }, scale: 'score', provisional: {}, signature: [] };

test('旧档名兼容：入门、熟练按旧绝对区间；精通、大师新旧同名，按相对档处理', () => {
    assert.equal(npcSkillTier('入门'), '入门');
    const low = npcSkillValue('入门', 90, 'c|甲|x');
    assert.ok(low >= 25 && low <= 45);
    const mid = npcSkillValue('熟练', 10, 'c|甲|x');
    assert.ok(mid >= 50 && mid <= 70);
    assert.equal(npcSkillTier('精通'), '精通');
    const expert = npcSkillValue('精通', 40, 'c|甲|x');
    assert.ok(expert >= 65 && expert <= 75);
    assert.equal(npcSkillTier('80'), null);
    assert.equal(npcSkillTier('擅长'), '擅长');
});

test('没有勾的 NPC 不消耗随机数，主角成长结果不受影响', () => {
    let draws = 0;
    const random = () => { draws += 1; return 0.5; };
    settleDay(withNpc(createStatsState(), '小雪'), { random, changes: [] });
    const heroOnly = draws;
    draws = 0;
    settleDay(createStatsState(), { random, changes: [] });
    assert.equal(heroOnly, draws);
    const skipped = settleSkip(markNpcGrowth(withNpc(createStatsState(), '小雪'), '小雪', '话术'), 3, { random: seq(0.11), changes: [] });
    assert.equal(skipped.characters.小雪.skillGrowth.话术.marked, false);
});

// ---------- 状态栏常驻主角区 ----------
const heroBlock = { name: '阿明', metrics: [{ label: '体力', percent: 60, display: '60', colorKey: 'slot-2' }] };
const charModel = (over = {}) => ({ enabled: true, character: '小雪', metrics: [{ label: '好感', percent: 10, display: '平淡' }], hiddenCount: 0, relation: '', ...over });
const heroLookup = (name) => (name === '阿明' || name === '主角' ? { metrics: heroBlock.metrics, stages: [] } : null);
const lookup = (name) => heroLookup(name) || (name === '小雪' ? { metrics: [{ label: '好感', percent: 30, display: '熟人' }], stages: [] } : null);

test('状态栏关着：什么都不加，也不替换', () => {
    const off = charModel({ enabled: false, metrics: [] });
    assert.equal(composeStatsHud(off, { lookup, speaker: '小雪' }), off);
    assert.equal(composeStatsHud(off, { lookup, speaker: '' }).hero, undefined);
    const on = charModel();
    assert.equal(composeStatsHud(on, { lookup, speaker: '' }), on);
});

// ---------- 设置页版面 ----------
function page(over = {}, id = 'stats') {
    const stats = normalizeStatsSettings({ enabled: true, ...(over.stats || {}) });
    const values = buildStatsPageValues({ stats, chat: over.chat === undefined ? { hasChat: true, enabled: false } : over.chat, archive: over.archive || null, combatOn: false, advancedOpen: over.open || (() => '') });
    return renderTemplate(getPageTemplate(id), values);
}

