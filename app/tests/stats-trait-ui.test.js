// 特质界面：角色卡胶囊行、「+」添加面板、图鉴页的渲染。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTraitView, renderTraitEdit, renderPersonChips } from '../src/visual/igs-ui/trait-chips.js';
const renderTraitBlock = (name, model) => renderTraitView(name, model) + renderTraitEdit(name, model);
import { renderStatsCodex, renderStatsPeople, renderStatsHeroCard, renderStatsHeroTail } from '../src/visual/igs-ui/stats-settings-fields.js';
import { getPageTemplate } from '../src/visual/igs-ui/settings-tabs.js';
import { renderTemplate } from '../src/visual/igs-ui/settings-fields.js';
import { buildStatsPageValues } from '../src/visual/igs-ui/stats-settings-fields.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { lightTrait } from '../src/scene/stats/stat-trait-codex.js';
import { emptyCodex } from '../src/scene/stats/stat-trait-codex.js';

const item = (id, src = 'manual', extra = {}) => ({ id, src, ...extra });
const model = (items, over = {}) => ({ traitList: { 小雪: { items, slots: items.length, auto: items.filter((t) => t.src === 'auto').length, achieve: 0 } }, traitNsfw: false, traits: {}, ...over });

test('特质区只读态：0 项显示「未设置」，没有可点胶囊与「+」方块', () => {
    const html = renderTraitBlock('小雪', model([]));
    assert.match(html, /<em>0\/5<\/em>/);
    assert.match(html, /igs-edit-empty">未设置</);
    assert.doesNotMatch(html, /igs-trait-toggle|is-add"/);
    assert.doesNotMatch(renderTraitView('小雪', model([])), /<button|<label/);
});

test('特质区：只读小标签列名称；编辑行含加粗名、说明与摘下，成就没有摘下', () => {
    const html = renderTraitBlock('小雪', model([item('companion'), item('fragile', 'auto'), item('熟练工', 'achieve')]));
    assert.match(html, /igs-trait-chip is-tag"><b>随身<\/b>/);
    assert.match(html, /<div class="igs-edit-main"><b>随身<\/b><span>[^<]+<\/span>/);
    assert.match(html, /data-action="stats-op:trait-id:%E5%B0%8F%E9%9B%AA\|companion\|0"/);
    const row = html.slice(html.indexOf('<b>熟练工</b><span>'));
    assert.doesNotMatch(row.slice(0, row.indexOf('igs-edit-row') > 0 ? row.indexOf('igs-edit-row') : row.length), /is-small/);
});

test('合成整体一行，组成项不再单独成行，可分别摘下组成项', () => {
    const parts = ['犬系', '黏人', '爱撒娇'];
    const items = [item('犬系'), item('黏人'), item('爱撒娇'), item('combo:大型犬', 'manual', { parts })];
    const html = renderTraitBlock('小雪', model(items, { traitList: { 小雪: { items, slots: 1, auto: 0, achieve: 0 } } }));
    assert.equal((html.match(/igs-trait-chip is-tag/g) || []).length, 1);
    assert.match(html, /<b>大型犬<\/b>/);
    assert.doesNotMatch(html, /<b>犬系<\/b>/);
    assert.match(html, /摘下犬系/);
    assert.match(html, /<em>1\/5<\/em>/);
});

test('满格时「＋ 添加特质」置灰且没有面板', () => {
    const items = ['companion', 'bodiless', 'kin', 'fragile', '长生'].map((id) => item(id));
    const html = renderTraitBlock('小雪', { traitList: { 小雪: { items, slots: 5, auto: 0, achieve: 0 } }, traitNsfw: false });
    assert.match(html, /igs-edit-add is-off/);
    assert.doesNotMatch(html, /igs-trait-panel/);
});

test('添加面板：NSFW 关时不列 nsfw 项，主角只列主角可用项，已挂项不再列出', () => {
    const off = renderTraitBlock('小雪', model([item('companion')]));
    assert.doesNotMatch(off, /stats-op:trait-id:[^"]*\|companion\|1/);
    assert.match(off, /\|bodiless\|1/);
    const on = renderTraitBlock('小雪', model([], { traitNsfw: true }));
    assert.ok(on.length > off.length - 1);
    const hero = renderTraitBlock('主角', { traitList: {}, traitNsfw: false });
    assert.match(hero, /\|fragile\|1/);
    assert.doesNotMatch(hero, /\|companion\|1/);
    const swap = renderTraitBlock('小雪', model([item('fragile')]));
    assert.match(swap, /<small>替换脆弱<\/small>/);
});

test('旧四个勾选与豁免按钮不再出现，其他角色卡与我的角色都带特质区', () => {
    const archive = {
        day: 1, bars: {}, wallet: 0, vitals: null, attributes: [], skills: [], log: [], total: 0, checks: [], story: [], sheets: [], skillEdit: [],
        characters: [{ name: '小雪', stage: '朋友', dims: { 好感: 30, 信任: 10, 了解: 5 }, intimacyForced: true }],
        traitList: { 小雪: { items: [item('forced')], slots: 1, auto: 0, achieve: 0 } }, traitNsfw: true, traits: {}, aptitude: {}, heroNotes: {},
    };
    const npc = renderStatsPeople(archive, (key) => (key.startsWith('stats-edit-') ? ' open' : ''));
    assert.match(npc, /igs-person-chips[\s\S]*igs-edit-fold[\s\S]*添加特质/);
    assert.doesNotMatch(npc, /igs-switch|relation-forced|stats-op:trait:/);
    assert.match(renderStatsHeroTail(archive), /data-traits-of="主角"/);
});

test('图鉴页：进度、未点亮「？？？」、已点亮说明与快合成提示，NSFW 关时过滤', () => {
    const store = lightTrait(emptyCodex(), 'companion', { charName: '小雪', cardName: '测试卡', date: '2026-11-07' }).store;
    const html = renderStatsCodex({ traitCodex: store, traitList: { 小雪: { items: [item('犬系'), item('黏人')] } }, traitNsfw: false });
    assert.match(html, /已点亮 1 \/ \d+/);
    assert.match(html, /<b>随身<\/b>/);
    assert.match(html, /<b>？？？<\/b>/);
    assert.match(html, /首次：小雪 · 测试卡 · 2026-11-07/);
    assert.match(html, /小雪：犬系 \+ 黏人 \+ ？/);
    const on = renderStatsCodex({ traitCodex: store, traitNsfw: true });
    assert.ok(Number(on.match(/已点亮 1 \/ (\d+)/)[1]) > Number(html.match(/已点亮 1 \/ (\d+)/)[1]));
});

test('图鉴子页：模板挂在数值分类下，总开关关闭时整块隐藏', () => {
    const values = buildStatsPageValues({ stats: normalizeStatsSettings({ enabled: false }), chat: null, combatOn: false });
    assert.match(renderTemplate(getPageTemplate('stats-codex'), values), /data-settings-pane="stats-codex"[\s\S]*igs-settings-full" hidden>/);
});

test('悟性并入特质：出众是一行可摘下回平庸，不再有悟性分段按钮，天资组含天纵', () => {
    const html = renderTraitBlock('小雪', model([], { aptitude: { 小雪: '出众' } }));
    assert.match(html, /<div class="igs-edit-main"><b>出众<\/b>/);
    assert.match(html, /data-action="stats-op:aptitude:%E5%B0%8F%E9%9B%AA:%E5%B9%B3%E5%BA%B8"/);
    assert.match(html, /data-action="stats-op:aptitude:%E5%B0%8F%E9%9B%AA:%E5%A4%A9%E7%BA%B5"/);
    assert.doesNotMatch(html, /data-action="stats-op:aptitude:%E5%B0%8F%E9%9B%AA:%E5%87%BA%E4%BC%97"/);
    const archive = { day: 1, bars: {}, wallet: 0, vitals: null, attributes: [], skills: [{ name: '话术', value: 50, display: '50', marked: true }], log: [], total: 0, checks: [], story: [], sheets: [], skillEdit: [],
        characters: [{ name: '小雪', stage: '朋友', dims: { 好感: 30, 信任: 10, 了解: 5 }, intimacyForced: false }], traitList: {}, traits: {}, aptitude: {}, heroNotes: {}, fame: [] };
    assert.doesNotMatch(renderStatsPeople(archive), /data-segment-value="出众"|>悟性</);
    const mine = renderStatsHeroCard(archive);
    assert.doesNotMatch(mine, />悟性</);
    assert.match(mine, /igs-stats-sec-head" title="[^"]*成长机会"><b>技能<\/b>/);
});

test('声望：只读小标签写「名 · 档位」，编辑态有关闭与新增，无声望时显示「未设置」', () => {
    const base = { day: 1, bars: {}, wallet: 0, vitals: null, attributes: [], skills: [], log: [], total: 0, checks: [], story: [], sheets: [], skillEdit: [], characters: [], traits: {}, aptitude: {}, heroNotes: {} };
    const html = renderStatsHeroTail({ ...base, fame: [{ name: '唯粉', kind: '粉丝', tier: '小有名气' }] }, (key) => (key === 'stats-hero-edit' ? ' open' : ''));
    assert.match(html, /<b>唯粉 · 小有名气<\/b>/);
    assert.match(html, /<em>1\/3<\/em>/);
    assert.match(html, /data-action="stats-op:fame-remove:/);
    assert.match(html, /data-action="stats-op:fame-add"[^>]*>＋ 新增声望/);
    assert.match(renderStatsHeroTail({ ...base, fame: [] }).slice(renderStatsHeroTail({ ...base, fame: [] }).indexOf('data-stats-fame')), /未设置/);
});

test('名字旁胶囊：最多 2 个，其余收成「+N」；没有特质时不显示；窄屏按字数少显示', () => {
    const many = model(['companion', 'bodiless', 'kin', 'fragile'].map((id) => item(id)));
    const html = renderPersonChips('小雪', '朋友', many);
    assert.equal((html.match(/igs-trait-chip is-tag/g) || []).length, 2);
    assert.match(html, /<span class="igs-person-more">\+2<\/span>/);
    assert.equal(renderPersonChips('小雪', '朋友', model([])), '');
    const tight = renderPersonChips('一个很长很长的角色名', '朋友', model([item('companion'), item('fragile')]));
    assert.ok((tight.match(/igs-trait-chip is-tag/g) || []).length < 2);
});

test('角色卡：观赏区不放按钮，所有编辑收进默认折叠的「编辑」，折叠头带只读胶囊', () => {
    const archive = {
        day: 1, bars: {}, wallet: 0, vitals: null, attributes: [], skills: [], log: [], total: 0, checks: [], story: [], sheets: [], skillEdit: [],
        characters: [{ name: '小雪', stage: '朋友', dims: { 好感: 30, 信任: 10, 了解: 5 }, intimacyForced: false }],
        traitList: { 小雪: { items: [item('fragile')], slots: 1, auto: 0, achieve: 0 } }, traitNsfw: false, traits: {}, aptitude: {}, heroNotes: {},
    };
    const npc = renderStatsPeople(archive);
    assert.doesNotMatch(npc, /添加特质/, '收起的「编辑」不渲染内容');
    const opened = renderStatsPeople(archive, (key) => (key.startsWith('stats-edit-') ? ' open' : ''));
    const summary = npc.slice(npc.indexOf('<summary class="igs-stats-person-head">'), npc.indexOf('</summary>'));
    assert.match(summary, /igs-person-chips[\s\S]*脆弱/);
    const fold = npc.indexOf('igs-edit-fold');
    assert.ok(fold > 0 && !/open/.test(npc.slice(fold, npc.indexOf('<summary>编辑', fold))));
    assert.doesNotMatch(npc.slice(npc.indexOf('</summary>'), fold), /<button/);
    assert.match(opened.slice(opened.indexOf('igs-edit-fold')), /修改数值[\s\S]*摘下[\s\S]*添加特质[\s\S]*按剧情拟写[\s\S]*保存/);
});
