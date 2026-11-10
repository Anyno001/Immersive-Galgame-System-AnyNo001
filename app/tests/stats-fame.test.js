import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatDirectives } from '../src/scene/stats/stat-directives.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { buildStatsPrompt, mandatesFromFlags } from '../src/scene/stats/stat-prompt.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { sanitizeCatalog } from '../src/scene/stats/stat-persist.js';
import { chatEntries, restoreChat } from '../src/scene/stats/stat-log.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { FAME_CLASSES, FAME_LEGACY_CLASS, FAME_TEMPLATES, buildFameFillPrompt, fameDraftText, fameHudMetrics, fameLines, fameTagLines, fameTemplateBar, fameTier, migrateLegacyFameBar, parseFameDraft, parseFameFill, sanitizeFameBars } from '../src/scene/stats/stat-fame.js';

const high = () => 0.99;
const resolveCharacter = (name) => (['小雪', '阿远', '林夏', '苏晴'].includes(name) ? name : null);
const floor = (state, text, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter, favorTier: 'normal', strengthRev: 2, ...opts });
const withFame = (fame) => ({ ...createStatsState(), protagonist: { ...createStatsState().protagonist, fame } });
const mk = (name, tpl) => fameTemplateBar(tpl, name);
const STAR = [mk('名气', '名气')];

test('声望迁移：原 11 种性质映射到四类，套模板文案，归属默认主角，文案与旧版一致', () => {
    const legacy = Object.keys(FAME_LEGACY_CLASS);
    assert.equal(legacy.length, 11);
    for (const kind of legacy) {
        const bar = migrateLegacyFameBar({ name: `条${kind}`.slice(0, 8), kind });
        assert.ok(bar, kind);
        assert.equal(bar.cls, FAME_LEGACY_CLASS[kind]);
        assert.ok(FAME_CLASSES.includes(bar.cls));
        assert.equal(bar.owner, '主角');
        assert.ok(bar.zero && bar.full && bar.low && bar.high && bar.zeroMandate && bar.fullMandate && bar.watcher);
    }
    const star = migrateLegacyFameBar({ name: '唯粉', kind: '名气' });
    assert.equal(star.low, '知道主角的人不多，出门很少被认出。');
    assert.equal(star.zero, '过气');
    assert.equal(star.start, 30);
    const burn = migrateLegacyFameBar({ name: '香火', kind: '香火' });
    assert.deepEqual([burn.cls, burn.drain, burn.danger], ['消耗', '减少', '空']);
    const debt = migrateLegacyFameBar({ name: '契约', kind: '契约债务' });
    assert.deepEqual([debt.cls, debt.drain, debt.danger], ['消耗', '增加', '满']);
    assert.equal(migrateLegacyFameBar({ name: '怪', kind: '无此性质' }), null);
    assert.equal(migrateLegacyFameBar({ name: '', kind: '名气' }), null);
    const migrated = sanitizeCatalog({ fameBars: [{ name: '唯粉', kind: '名气' }, { name: 'CP粉', kind: '组合热度' }] }).fameBars;
    assert.deepEqual(migrated.map((b) => [b.name, b.cls, b.owner, Boolean(b.pair)]), [['唯粉', '热度', '主角', false], ['CP粉', '热度', '主角', true]]);
    assert.deepEqual(sanitizeFameBars(migrated), migrated);
});

test('声望模板：按世界观分组，原 11 种全部并入，每个模板都能建出合格的条', () => {
    const names = FAME_TEMPLATES.map((t) => t.name);
    for (const kind of Object.keys(FAME_LEGACY_CLASS)) assert.ok(names.includes(kind), kind);
    assert.equal(new Set(names).size, names.length);
    for (const t of FAME_TEMPLATES) {
        const bar = fameTemplateBar(t.name);
        assert.ok(bar, t.name);
        assert.ok(bar.low && bar.high && bar.zeroMandate && bar.fullMandate);
    }
    assert.match(fameTemplateBar('公会声望').high, /冒险者公会/);
    assert.equal(fameTemplateBar('名誉', '哪吒名誉', '哪吒').high, '哪吒名声很好，旁人敬重哪吒，说话有分量。');
});

test('声望草稿：文本往返、描写留空时重新生成、字段不合格给出字段名', () => {
    const bar = mk('香火', '香火');
    const back = parseFameDraft(fameDraftText(bar));
    assert.ok(back.ok);
    assert.deepEqual(back.bar, bar);
    const text = fameDraftText(bar).split('\n').filter((l) => !/^(低档描写|高档描写|归零事项|满格事项)/.test(l)).join('\n');
    const regen = parseFameDraft(text);
    assert.ok(regen.ok);
    assert.match(regen.bar.low, /信众/);
    assert.deepEqual(parseFameDraft(fameDraftText(bar).replace('类：消耗', '类：乱写')), { ok: false, field: '类' });
    assert.equal(parseFameDraft('条名：路人甲乙丙丁戊己庚辛\n').ok, false);
});

test('声望副模型补全：提示词含一句话，JSON 严格解析，失败不给草稿', () => {
    const prompt = buildFameFillPrompt('哪吒在陈塘关百姓中的声望', { worldview: '封神', people: [{ name: '哪吒', summary: '陈塘关总兵之子' }] });
    assert.match(prompt.user, /哪吒在陈塘关百姓中的声望/);
    assert.match(prompt.user, /陈塘关总兵之子/);
    const good = JSON.stringify({ 归属: '哪吒', 条名: '陈塘关口碑', 谁在看: '陈塘关百姓', 类: '口碑', 低端叫法: '人人喊打', 高端叫法: '万民敬仰', 低档描写: '百姓对哪吒心存畏惧。' });
    const ok = parseFameFill('```json\n' + good + '\n```');
    assert.ok(ok.ok);
    assert.equal(ok.bar.owner, '哪吒');
    assert.equal(ok.bar.low, '百姓对哪吒心存畏惧。');
    assert.match(ok.bar.high, /陈塘关百姓/);
    assert.equal(parseFameFill('不是 JSON').ok, false);
    assert.equal(parseFameFill('[1,2]').ok, false);
    assert.equal(parseFameFill(JSON.stringify({ 条名: '甲', 谁在看: '众人', 类: '乱写', 低端叫法: '低', 高端叫法: '高' })).ok, false);
    assert.equal(parseFameFill(JSON.stringify({ 条名: '甲', 谁在看: '众人', 类: '热度', 低端叫法: '低' })).ok, false);
});

test('声望标签三档：小 2、中 5、大 10，强度省略按小；只开一条时条名可省', () => {
    const base = withFame({ 名气: 50 });
    assert.equal(floor(base, '[igs-stat:fame|名气|上升|小]', { fameBars: STAR }).state.protagonist.fame.名气, 52);
    assert.equal(floor(base, '[igs-stat:fame|名气|上升|中]', { fameBars: STAR }).state.protagonist.fame.名气, 55);
    assert.equal(floor(base, '[igs-stat:fame|名气|下降|大]', { fameBars: STAR }).state.protagonist.fame.名气, 40);
    assert.equal(floor(base, '[igs-stat:fame|上升]', { fameBars: STAR }).state.protagonist.fame.名气, 52);
    const two = [...STAR, mk('黑粉', '恶名')];
    const r = floor(base, '[igs-stat:fame|上升|大]', { fameBars: two });
    assert.equal(r.state.protagonist.fame.名气, 50);
    assert.ok(r.meta.diagnostics.some((d) => d.code === 'stat-fame-unknown'));
    assert.equal(parseStatDirectives('[igs-stat:fame|名气|上升|5]', { rev: 2 }).directives.length, 0);
});

test('声望归属段：NPC 的条写「归属|条名|方向」，主角的条可省归属，旧格式照常', () => {
    const npc = fameTemplateBar('名誉', '陈塘关口碑', '哪吒');
    const bars = [mk('名气', '名气'), npc];
    const base = withFame({ 名气: 50, 陈塘关口碑: 50 });
    const r = floor(base, '[igs-stat:fame|哪吒|陈塘关口碑|上升|大][igs-stat:fame|名气|下降|小]', { fameBars: bars });
    assert.equal(r.state.protagonist.fame.陈塘关口碑, 60);
    assert.equal(r.state.protagonist.fame.名气, 48);
    assert.equal(floor(base, '[igs-stat:fame|陈塘关口碑|上升|中]', { fameBars: bars }).state.protagonist.fame.陈塘关口碑, 55);
    assert.equal(floor(base, '[igs-stat:fame|主角|名气|上升|中]', { fameBars: bars }).state.protagonist.fame.名气, 55);
    assert.equal(floor(base, '[igs-stat:fame|李靖|陈塘关口碑|上升|中]', { fameBars: bars }).state.protagonist.fame.陈塘关口碑, 50);
    const lines = fameLines(base, bars).join('\n');
    assert.match(lines, /陈塘关口碑（哪吒，社会）/);
    assert.match(lines, /名气（大众）/);
});

test('声望档位：归零、满格用条自己的叫法，中间三档不写数字', () => {
    const star = STAR[0];
    assert.equal(fameTier(star, 0), '过气');
    assert.equal(fameTier(star, 100), '顶流');
    assert.equal(fameTier(star, 20), '较低');
    assert.equal(fameTier(star, 50), '一般');
    assert.equal(fameTier(star, 80), '较高');
});

test('未开声望的聊天不注入、不结算；旧楼（rev < 2）同样不结算；提示词保留「仅在剧情确实发生时才写」', () => {
    const base = withFame({ 名气: 50 });
    assert.equal(floor(base, '[igs-stat:fame|名气|上升|大]').state.protagonist.fame.名气, 50);
    assert.equal(floor(base, '[igs-stat:fame|名气|上升|大]', { fameBars: STAR, strengthRev: 1 }).state.protagonist.fame.名气, 50);
    const p = buildStatsPrompt(base, {});
    assert.ok(!p.segments.some((s) => s.id === 'fame'));
    assert.doesNotMatch(p.content, /igs-stat:fame/);
    const on = buildStatsPrompt(base, { fameBars: STAR });
    assert.match(on.segments.find((s) => s.id === 'fame').text, /^【声望】/);
    assert.match(on.segments.find((s) => s.id === 'fame').text, /名气（大众）：一般。/);
    assert.match(on.content, /\[igs-stat:fame\|名气\|上升\/下降\|小\/中\/大\]（仅在剧情确实发生时才写/);
    assert.doesNotMatch(on.content, /归属角色名/);
    assert.match(fameTagLines([...STAR, fameTemplateBar('名誉', '陈塘关口碑', '哪吒')]).join('\n'), /归属非主角的条，条名前加一段归属角色名/);
});

test('声望最多 10 条：多余的丢弃，条名不重复，无效项丢弃', () => {
    const extra = '甲乙丙丁戊己庚辛壬'.split('').map((c) => ({ name: c + '团', kind: '名气' }));
    const bars = sanitizeFameBars([{ name: '唯粉', kind: '名气' }, { name: '唯粉', kind: '名誉' }, { name: '路人缘', kind: '名誉' }, { name: '怪', kind: '无此性质' }, { name: 'CP粉', kind: '组合热度' }, ...extra]);
    assert.deepEqual(bars.map((b) => b.name), ['唯粉', '路人缘', 'CP粉', '甲团', '乙团', '丙团', '丁团', '戊团', '己团', '庚团']);
    assert.deepEqual(sanitizeCatalog({ fameBars: bars }).fameBars, bars);
    const restored = restoreChat(chatEntries({ catalog: { fameBars: bars } }));
    assert.deepEqual(restored.catalog.fameBars, bars);
});

test('CP 粉多对：按搭档分别记热度，只注入热度最高的两对与本楼在场搭档', () => {
    const cp = [mk('CP粉', '组合热度')];
    const r = floor(createStatsState(), '[igs-stat:fame|CP粉|阿远|上升|大][igs-stat:fame|CP粉|林夏|下降|小]', { fameBars: cp });
    assert.deepEqual(r.state.protagonist.fame.CP粉, { 阿远: 30, 林夏: 18 });
    assert.ok(floor(createStatsState(), '[igs-stat:fame|CP粉|上升]', { fameBars: cp }).meta.diagnostics.some((d) => d.code === 'stat-fame-no-partner'));
    const state = withFame({ CP粉: { 阿远: 80, 林夏: 60, 苏晴: 40, 小雪: 10 } });
    const hidden = fameLines(state, cp).join('');
    assert.match(hidden, /阿远/);
    assert.match(hidden, /林夏/);
    assert.doesNotMatch(hidden, /苏晴|小雪/);
    const shown = fameLines(state, cp, { present: ['小雪'] }).join('');
    assert.match(shown, /与小雪的组合较低/);
    assert.doesNotMatch(shown, /苏晴/);
    assert.match(buildStatsPrompt(state, { fameBars: cp }).content, /\[igs-stat:fame\|CP粉\|搭档名\|上升\/下降\|小\/中\/大\]/);
});

test('声望日变化按类：口碑无、热度与威胁缓降、消耗每天减少或增加；跳过多天一次算完；变动带结算明细', () => {
    const bars = [mk('名气', '名气'), mk('香火', '香火'), mk('契约', '契约债务'), mk('名誉', '名誉'), mk('通缉', '通缉')];
    const base = withFame({ 名气: 50, 香火: 50, 契约: 50, 名誉: 50, 通缉: 50 });
    const day = floor(base, '[igs-stat:sleep]', { fameBars: bars });
    assert.deepEqual(day.state.protagonist.fame, { 名气: 48, 香火: 45, 契约: 55, 名誉: 50, 通缉: 48 });
    const skip = floor(base, '[igs-stat:skip|3天]', { fameBars: bars }).state.protagonist.fame;
    assert.deepEqual(skip, { 名气: 44, 香火: 35, 契约: 65, 名誉: 50, 通缉: 44 });
    const cp = floor(withFame({ CP粉: { 阿远: 30, 林夏: 1 } }), '[igs-stat:sleep]', { fameBars: [mk('CP粉', '组合热度')] }).state.protagonist.fame.CP粉;
    assert.deepEqual(cp, { 阿远: 28, 林夏: 0 });
    const drift = (day.meta.changes || []).find((c) => c.key === '香火');
    if (drift) assert.ok(Array.isArray(drift.calc) && drift.calc.length);
});

test('满格、归零给出强制事项；关掉声望后不再带', () => {
    const bars = [mk('名气', '名气'), mk('香火', '香火')];
    const r = floor(withFame({ 名气: 95, 香火: 3 }), '[igs-stat:fame|名气|上升|大][igs-stat:fame|香火|下降|中]', { fameBars: bars });
    assert.deepEqual(r.meta.flags.fame, [bars[0].fullMandate, bars[1].zeroMandate]);
    assert.deepEqual(mandatesFromFlags(r.meta.flags, null, { fame: true }), r.meta.flags.fame);
    assert.deepEqual(mandatesFromFlags(r.meta.flags, null), []);
});

test('状态栏：只开声望时一行汇总，开细项后逐条、CP 各对各自成条；非主角的条标注归属', () => {
    const s = normalizeStatsSettings({});
    assert.equal(s.hudFame, false);
    assert.equal(s.hudFameDetail, false);
    const bars = [mk('唯粉', '名气'), mk('CP粉', '组合热度')];
    const state = withFame({ 唯粉: 80, CP粉: { 阿远: 60, 林夏: 20 } });
    const sum = fameHudMetrics(state, bars);
    assert.equal(sum.length, 1);
    assert.equal(sum[0].display, '唯粉较高 · CP粉一般');
    assert.doesNotMatch(sum[0].display, /[0-9]/);
    const detail = fameHudMetrics(state, bars, { detail: true });
    assert.deepEqual(detail.map((m) => m.label), ['唯粉', 'CP粉·阿远', 'CP粉·林夏']);
    assert.deepEqual(fameHudMetrics(state, []), []);
    assert.equal(fameHudMetrics(withFame({ 口碑: 50 }), [fameTemplateBar('名誉', '口碑', '哪吒')])[0].display, '哪吒·口碑一般');
});

test('声望不建群体档案：CP 搭档只记在声望数据里', () => {
    const r = floor({ ...createStatsState(), characters: { 阿远: createCharacter(1) } }, '[igs-stat:fame|CP粉|阿远|上升]', { fameBars: [mk('CP粉', '组合热度')] });
    assert.deepEqual(Object.keys(r.state.characters), ['阿远']);
    assert.equal(r.state.characters.阿远.dims.好感, 0);
});
