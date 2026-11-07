import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatDirectives } from '../src/scene/stats/stat-directives.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { buildStatsPrompt, mandatesFromFlags } from '../src/scene/stats/stat-prompt.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { sanitizeCatalog } from '../src/scene/stats/stat-persist.js';
import { chatEntries, restoreChat } from '../src/scene/stats/stat-log.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { FAME_KINDS, FAME_KIND_NAMES, fameHudMetrics, fameLines, fameTier, sanitizeFameBars } from '../src/scene/stats/stat-fame.js';

const high = () => 0.99;
const resolveCharacter = (name) => (['小雪', '阿远', '林夏', '苏晴'].includes(name) ? name : null);
const floor = (state, text, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter, favorTier: 'normal', strengthRev: 2, ...opts });
const withFame = (fame) => ({ ...createStatsState(), protagonist: { ...createStatsState().protagonist, fame } });
const STAR = [{ name: '名气', kind: '名气' }];

test('声望：性质预设表十项加组合热度，每项都有两端叫法与文案', () => {
    assert.deepEqual(FAME_KIND_NAMES, ['名气', '名誉', '恶名', '信仰', '香火', '宠爱', '通缉', '契约债务', '民心', '粉丝狂热', '组合热度']);
    for (const preset of Object.values(FAME_KINDS)) assert.ok(preset.zero && preset.full && preset.low && preset.high && preset.zeroMandate && preset.fullMandate);
});

test('声望标签三档：小 2、中 5、大 10，强度省略按小；只开一条时条名可省', () => {
    const base = withFame({ 名气: 50 });
    assert.equal(floor(base, '[igs-stat:fame|名气|上升|小]', { fameBars: STAR }).state.protagonist.fame.名气, 52);
    assert.equal(floor(base, '[igs-stat:fame|名气|上升|中]', { fameBars: STAR }).state.protagonist.fame.名气, 55);
    assert.equal(floor(base, '[igs-stat:fame|名气|下降|大]', { fameBars: STAR }).state.protagonist.fame.名气, 40);
    assert.equal(floor(base, '[igs-stat:fame|上升]', { fameBars: STAR }).state.protagonist.fame.名气, 52);
    // 开了两条时省略条名丢弃
    const two = [...STAR, { name: '黑粉', kind: '恶名' }];
    const r = floor(base, '[igs-stat:fame|上升|大]', { fameBars: two });
    assert.equal(r.state.protagonist.fame.名气, 50);
    assert.ok(r.meta.diagnostics.some((d) => d.code === 'stat-fame-unknown'));
    // 写数字的强度整条拒收
    assert.equal(parseStatDirectives('[igs-stat:fame|名气|上升|5]', { rev: 2 }).directives.length, 0);
});

test('声望档位：归零、满格用性质叫法，中间三档不写数字', () => {
    assert.equal(fameTier('名气', 0), '过气');
    assert.equal(fameTier('名气', 100), '顶流');
    assert.equal(fameTier('名气', 20), '较低');
    assert.equal(fameTier('名气', 50), '一般');
    assert.equal(fameTier('名气', 80), '较高');
});

test('未开声望的聊天不注入、不结算；旧楼（rev < 2）同样不结算', () => {
    const base = withFame({ 名气: 50 });
    assert.equal(floor(base, '[igs-stat:fame|名气|上升|大]').state.protagonist.fame.名气, 50);
    assert.equal(floor(base, '[igs-stat:fame|名气|上升|大]', { fameBars: STAR, strengthRev: 1 }).state.protagonist.fame.名气, 50);
    const p = buildStatsPrompt(base, {});
    assert.ok(!p.segments.some((s) => s.id === 'fame'));
    assert.doesNotMatch(p.content, /igs-stat:fame/);
    const on = buildStatsPrompt(base, { fameBars: STAR });
    assert.match(on.segments.find((s) => s.id === 'fame').text, /名气（大众）：一般。/);
    assert.match(on.content, /\[igs-stat:fame\|名气\|上升\/下降\|小\/中\/大\]/);
});

test('声望最多 3 条：多余的丢弃，条名不重复，性质不在表里的丢弃', () => {
    const bars = sanitizeFameBars([{ name: '唯粉', kind: '名气' }, { name: '唯粉', kind: '名誉' }, { name: '路人缘', kind: '名誉' }, { name: '怪', kind: '无此性质' }, { name: 'CP粉', kind: '组合热度' }, { name: '黑粉', kind: '恶名' }]);
    assert.deepEqual(bars.map((b) => b.name), ['唯粉', '路人缘', 'CP粉']);
    assert.deepEqual(sanitizeCatalog({ fameBars: bars }).fameBars, bars);
    const restored = restoreChat(chatEntries({ catalog: { fameBars: bars } }));
    assert.deepEqual(restored.catalog.fameBars, bars);
});

test('CP 粉多对：按搭档分别记热度，只注入热度最高的两对与本楼在场搭档', () => {
    const cp = [{ name: 'CP粉', kind: '组合热度' }];
    const r = floor(createStatsState(), '[igs-stat:fame|CP粉|阿远|上升|大][igs-stat:fame|CP粉|林夏|下降|小]', { fameBars: cp });
    assert.deepEqual(r.state.protagonist.fame.CP粉, { 阿远: 30, 林夏: 18 });
    // 缺搭档名的丢弃
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

test('声望日变化：缓降、每天减少、每天增加、无；跳过多天一次算完', () => {
    const bars = [{ name: '名气', kind: '名气' }, { name: '香火', kind: '香火' }, { name: '契约', kind: '契约债务' }];
    const base = withFame({ 名气: 50, 香火: 50, 契约: 50 });
    const day = floor(base, '[igs-stat:sleep]', { fameBars: bars }).state.protagonist.fame;
    assert.deepEqual(day, { 名气: 48, 香火: 45, 契约: 55 });
    const skip = floor(base, '[igs-stat:skip|3天]', { fameBars: bars }).state.protagonist.fame;
    assert.deepEqual(skip, { 名气: 44, 香火: 35, 契约: 65 });
    const still = floor(withFame({ 名誉: 50 }), '[igs-stat:sleep]', { fameBars: [{ name: '名誉', kind: '名誉' }] }).state.protagonist.fame;
    assert.deepEqual(still, { 名誉: 50 });
    // 组合热度每一对各自缓降
    const cp = floor(withFame({ CP粉: { 阿远: 30, 林夏: 1 } }), '[igs-stat:sleep]', { fameBars: [{ name: 'CP粉', kind: '组合热度' }] }).state.protagonist.fame.CP粉;
    assert.deepEqual(cp, { 阿远: 28, 林夏: 0 });
});

test('满格、归零给出强制事项；关掉声望后不再带', () => {
    const r = floor(withFame({ 名气: 95, 香火: 3 }), '[igs-stat:fame|名气|上升|大][igs-stat:fame|香火|下降|中]', { fameBars: [{ name: '名气', kind: '名气' }, { name: '香火', kind: '香火' }] });
    assert.deepEqual(r.meta.flags.fame, [FAME_KINDS.名气.fullMandate, FAME_KINDS.香火.zeroMandate]);
    assert.deepEqual(mandatesFromFlags(r.meta.flags, null, { fame: true }), r.meta.flags.fame);
    assert.deepEqual(mandatesFromFlags(r.meta.flags, null), []);
});

test('状态栏：只开声望时一行汇总，开细项后逐条、CP 各对各自成条；设置两级开关默认关', () => {
    const s = normalizeStatsSettings({});
    assert.equal(s.hudFame, false);
    assert.equal(s.hudFameDetail, false);
    const bars = [{ name: '唯粉', kind: '名气' }, { name: 'CP粉', kind: '组合热度' }];
    const state = withFame({ 唯粉: 80, CP粉: { 阿远: 60, 林夏: 20 } });
    const sum = fameHudMetrics(state, bars);
    assert.equal(sum.length, 1);
    assert.equal(sum[0].display, '唯粉较高 · CP粉一般');
    assert.doesNotMatch(sum[0].display, /[0-9]/);
    const detail = fameHudMetrics(state, bars, { detail: true });
    assert.deepEqual(detail.map((m) => m.label), ['唯粉', 'CP粉·阿远', 'CP粉·林夏']);
    assert.deepEqual(fameHudMetrics(state, []), []);
});

test('声望不建群体档案：CP 搭档只记在主角声望里', () => {
    const r = floor({ ...createStatsState(), characters: { 阿远: createCharacter(1) } }, '[igs-stat:fame|CP粉|阿远|上升]', { fameBars: [{ name: 'CP粉', kind: '组合热度' }] });
    assert.deepEqual(Object.keys(r.state.characters), ['阿远']);
    assert.equal(r.state.characters.阿远.dims.好感, 0);
});
