import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNpcCocReply } from '../src/scene/stats/stat-coc-npc.js';
import { chatEntries, restoreChat } from '../src/scene/stats/stat-log.js';
import { sanitizeCatalog } from '../src/scene/stats/stat-persist.js';
import { PROTAGONIST, createEngine, profileOf } from '../src/scene/stats/stat-engine.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';

const hero = { v: 1, attrs: { 力量: 50, 体质: 50, 体型: 50, 敏捷: 50, 外貌: 50, 智力: 50, 意志: 50, 教育: 50 }, luck: 50, occupation: '', source: 'paste', totals: {}, san: 50, at: 1 };
const npcSheet = parseNpcCocReply(JSON.stringify({ 小雪: { 属性: { 力量: 40, 敏捷: 65, 意志: 70, 外貌: 60, 体质: 50, 体型: 50, 智力: 75, 教育: 70 }, 幸运: 45, 理智: 70, 职业: '记者', 技能: { 侦查: 60 } } }), { names: ['小雪'] }).sheets.小雪;
const daily = { 老周: { rank: '老手', attributes: { 力量: 9, 敏捷: 12, 体质: 10, 智力: 14, 感知: 13, 魅力: 11 }, scale: 'score', skills: { 说服: 55 }, provisional: {}, signature: [], source: 'llm' } };
const state = () => { const s = createStatsState(); s.characters = { 小雪: {}, 老周: {} }; return s; };
const engineOf = (mode, ruleset = 'coc7') => createEngine(sanitizeCatalog({ protagonistCoc: hero, cocMode: mode, npcCoc: { 小雪: npcSheet }, sheets: daily }), {}, ruleset);

test('NPC 调查员回复：数值夹在 1–99、未知技能丢弃、职业按名单匹配、模组缺项补 50', () => {
    const reply = JSON.stringify({
        甲: { 属性: { 力量: 150, 敏捷: 0, 意志: '70' }, 理智: 200, 职业: '医生(原作向)', 技能: { 侦查: 120, 剑术: 80, 外语: 30, '格斗': 55 } },
        乙: { 属性: {} },
        丙: { 职业: '邪教头目', 技能: { 潜行: 45 } },
    });
    const r = parseNpcCocReply(reply, { source: 'module' });
    assert.equal(r.ok, true);
    const a = r.sheets.甲;
    assert.equal(a.attrs.力量, 99);
    assert.equal(a.attrs.敏捷, 50);
    assert.equal(a.san, 99);
    assert.equal(a.occId, 'doctor');
    assert.deepEqual(a.totals, { 侦查: 99, 外语: 30, '格斗(斗殴)': 55 });
    assert.equal(a.source, 'module');
    assert.equal(r.filled.甲.includes('力量'), false);
    assert.equal(r.filled.甲.includes('敏捷'), true);
    assert.equal(r.sheets.丙.occupation, '邪教头目');
    assert.deepEqual(r.skipped, [{ name: '乙', reason: 'no-numbers' }]);
    const named = parseNpcCocReply(reply, { names: ['甲', '丁'] });
    assert.deepEqual(Object.keys(named.sheets), ['甲']);
    assert.deepEqual(named.skipped, [{ name: '丁', reason: 'missing' }]);
});

test('调查员模式下 NPC 有档读档、没档临时换算，日常模式不变', () => {
    const inv = engineOf('investigator');
    const withSheet = (skill) => profileOf(inv, state(), '小雪', skill);
    assert.equal(withSheet('侦查').value, 60);
    assert.equal(withSheet('意志').value, 70);
    assert.equal(withSheet('感知').value, 70);
    assert.equal(withSheet('理智').value, 70);
    assert.equal(withSheet('聆听').value, 20);
    const temp = (skill) => profileOf(inv, state(), '老周', skill);
    assert.equal(temp('力量').value, 45);
    assert.equal(temp('意志').value, 65);
    assert.equal(temp('教育').value, 50);
    assert.equal(temp('说服').value, 55);
    assert.equal(temp('说服').provisional, true);
    assert.equal(temp('聆听').value, 20);
    const day = engineOf('daily');
    assert.equal(day.npcCoc && Object.keys(day.npcCoc).length, 0);
    assert.equal(profileOf(day, state(), '老周', '说服').value, 55);
    assert.equal(profileOf(day, state(), '老周', '感知').value, 65);
    assert.ok(profileOf(createEngine({}, {}, 'coc7'), state(), PROTAGONIST, '侦查'));
});

test('NPC 调查员档以中文字段记录并可原样读回', () => {
    const catalog = sanitizeCatalog({ protagonistCoc: hero, cocMode: 'investigator', npcCoc: { 小雪: npcSheet } });
    const entries = chatEntries({ chatEnabled: true, catalog });
    const record = entries.get('npccoc:小雪');
    assert.equal(record.来源, 'AI生成');
    assert.equal(record.属性.敏捷, 65);
    assert.deepEqual(record.技能, { 侦查: 60 });
    const back = sanitizeCatalog(restoreChat(entries).catalog);
    assert.deepEqual(back.npcCoc.小雪, catalog.npcCoc.小雪);
});
