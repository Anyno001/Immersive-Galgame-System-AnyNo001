import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatDirectives } from '../src/scene/stats/stat-directives.js';
import { favorFromMoodGroup, resolveFavorWord } from '../src/scene/stats/stat-vocab.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { settleDay } from '../src/scene/stats/stat-day.js';
import { createEngine, keyEventSkill } from '../src/scene/stats/stat-engine.js';
import { DEFAULT_STAGE_TEXT_PLATONIC, DEFAULT_STAT_PROMPTS, buildStatsPrompt, intimacyAllowed } from '../src/scene/stats/stat-prompt.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { sanitizeCatalog } from '../src/scene/stats/stat-persist.js';
import { chatEntries, restoreChat } from '../src/scene/stats/stat-log.js';

const high = () => 0.99;
const resolveCharacter = (name) => (name === '小雪' ? '小雪' : null);
const floor = (state, text, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter, favorTier: 'normal', strengthRev: 2, ...opts });
const withDims = (dims, extra = {}) => ({ ...createStatsState(), characters: { 小雪: { ...createCharacter(1, { nsfw: true }), dims: { ...createCharacter(1, { nsfw: true }).dims, ...dims }, ...extra } } });
const dim = (state, key) => state.characters.小雪.dims[key];
const diag = (r, code) => r.meta.diagnostics.some((d) => d.code === code);
function lcg(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

test('2.1 亲密不再固定减压：rev 2 压力不变，rev 1 仍下降', () => {
    const state = { ...withDims({}), protagonist: { ...createStatsState().protagonist, bars: { stamina: 100, money: 0, stress: 50 } } };
    const opts = { nsfw: true, intimateCost: 'standard' };
    assert.equal(floor(state, '[igs-stat:intimate|小雪|轻]', { ...opts, strengthRev: 1 }).state.protagonist.bars.stress, 40);
    assert.equal(floor(state, '[igs-stat:intimate|小雪|轻]', opts).state.protagonist.bars.stress, 50);
});

test('2.2 吃醋与芥蒂上升同楼：rev 2 丢芥蒂并记诊断，rev 1 不变，芥蒂下降不受影响', () => {
    const text = '[igs-stat:favor|小雪|吃醋][igs-stat:grudge|小雪|上升|大]';
    assert.ok(diag(floor(withDims({}), text), 'stat-grudge-with-jealous'));
    assert.ok(!diag(floor(withDims({}), text, { strengthRev: 1 }), 'stat-grudge-with-jealous'));
    const down = floor(withDims({ 芥蒂: 40 }), '[igs-stat:favor|小雪|吃醋][igs-stat:grudge|小雪|下降|小]');
    assert.ok(!diag(down, 'stat-grudge-with-jealous'));
});

test('2.3 芥蒂每天 -1 止于 25：跳跃按天数一次算完，note 淡忘合成一条，旧楼不消退', () => {
    const r = floor(withDims({ 芥蒂: 40 }), '[igs-stat:skip|5天]');
    assert.equal(dim(r.state, '芥蒂'), 35);
    const rows = r.changes.filter((c) => c.key === '芥蒂');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].note, '淡忘');
    assert.equal(dim(floor(withDims({ 芥蒂: 40 }), '[igs-stat:skip|30天]').state, '芥蒂'), 25);
    assert.equal(dim(floor(withDims({ 芥蒂: 20 }), '[igs-stat:skip|30天]').state, '芥蒂'), 20);
    assert.equal(dim(floor(withDims({ 芥蒂: 40 }), '[igs-stat:skip|5天]', { strengthRev: 1 }).state, '芥蒂'), 40);
});

test('2.4 情绪组兜底：rev 2 哭泣组悲伤、大笑组平淡；rev 1 仍按旧表', () => {
    const groups = [{ label: '哭泣', words: ['呜呜'] }, { label: '大笑', words: ['哈哈哈'] }];
    assert.equal(favorFromMoodGroup('呜呜', groups, 2).value, '悲伤');
    assert.equal(favorFromMoodGroup('呜呜', groups, 1).value, '受伤');
    assert.equal(favorFromMoodGroup('哈哈哈', groups, 2).value, '平淡');
    assert.equal(favorFromMoodGroup('哈哈哈', groups, 1).value, '大笑');
    const hit = (rev) => parseStatDirectives('[igs-stat:favor|小雪|呜呜]', { rev, moodGroups: groups }).directives[0];
    assert.equal(hit(2).value, '悲伤');
    assert.equal(hit(1).value, '受伤');
});

test('2.5 近义词：崇拜、敬畏、仰慕归欣赏，狂热归爱恋，只对 rev 2', () => {
    for (const [word, value] of [['崇拜', '欣赏'], ['敬畏', '欣赏'], ['仰慕', '欣赏'], ['狂热', '爱恋']]) {
        assert.equal(resolveFavorWord(word, [], 2).value, value);
        assert.equal(resolveFavorWord(word, [], 1), null);
    }
});

test('3.1 交心：rev 2 才认，停在关口时掷检定突破', () => {
    assert.equal(parseStatDirectives('[igs-stat:event|小雪|交心]', { rev: 2 }).directives[0].value, '交心');
    assert.equal(parseStatDirectives('[igs-stat:event|小雪|交心]', { rev: 1 }).directives.length, 0);
    const r = floor(withDims({ 好感: 25 }), '[igs-stat:event|小雪|交心]', { random: () => 0.0 });
    assert.equal(r.meta.events[0].event, '交心');
    assert.equal(r.meta.events[0].gate, 25);
});

test('3.1.5 关键事件按类型选检定：共患难取格斗系与体质最高者，交心取察言观色与魅力较高者，旧楼魅力', () => {
    const readers = { readAbilities: () => ({ scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }) };
    const engine = createEngine({}, {}, 'coc7', readers);
    const base = createStatsState();
    const state = { ...base, protagonist: { ...base.protagonist, skills: { 格斗: { value: 90, marked: false }, 察言观色: { value: 90, marked: false } } } };
    assert.equal(keyEventSkill(engine, state, '共患难', 2), '格斗');
    assert.equal(keyEventSkill(engine, state, '共患难', 1), '魅力');
    assert.equal(keyEventSkill(engine, state, '交心', 2), '察言观色');
    assert.equal(keyEventSkill(engine, state, '告白', 2), '魅力');
    assert.equal(keyEventSkill(engine, state, '约会', 2), '魅力');
});

test('3.2 误会解除：退回账里合计的一半并清账，只能用一次，超过 7 天作废', () => {
    let state = withDims({ 信任: 50 });
    state = floor(state, '[igs-stat:trust|小雪|下降|中]').state;
    assert.equal(dim(state, '信任'), 42);
    assert.equal(state.characters.小雪.recentHurts.length, 1);
    const cleared = floor(state, '[igs-stat:clear|小雪]');
    assert.equal(dim(cleared.state, '信任'), 46);
    assert.equal(cleared.state.characters.小雪.recentHurts, undefined);
    assert.ok(diag(floor(cleared.state, '[igs-stat:clear|小雪]'), 'stat-clear-empty'));
    const late = floor(floor(state, '[igs-stat:skip|8天]').state, '[igs-stat:clear|小雪]');
    assert.ok(diag(late, 'stat-clear-empty'));
    assert.equal(dim(late.state, '信任'), 42);
    let g = floor(withDims({}), '[igs-stat:grudge|小雪|上升|中]').state;
    assert.equal(dim(g, '芥蒂'), 5);
    g = floor(g, '[igs-stat:clear|小雪]').state;
    assert.equal(dim(g, '芥蒂'), 2);
    assert.equal(parseStatDirectives('[igs-stat:clear|小雪]', { rev: 1 }).directives.length, 0);
});

test('4.2 恋爱判定：约会、告白置真，吃醋不算，结束置假且再告白重新为真，旧楼不认结束标签', () => {
    const jealous = floor(withDims({ 好感: 60, 芥蒂: 30 }), '[igs-stat:favor|小雪|吃醋]');
    assert.notEqual(jealous.state.characters.小雪.romance, true);
    let s = floor(withDims({}), '[igs-stat:event|小雪|告白]').state;
    assert.equal(s.characters.小雪.romance, true);
    const before = { ...s.characters.小雪.dims };
    s = floor(s, '[igs-stat:romance|小雪|结束]').state;
    assert.equal(s.characters.小雪.romance, false);
    assert.deepEqual(s.characters.小雪.dims, before);
    assert.equal(floor(s, '[igs-stat:event|小雪|约会]').state.characters.小雪.romance, true);
    assert.equal(floor(withDims({}), '[igs-stat:event|小雪|告白]', { strengthRev: 1 }).state.characters.小雪.romance, undefined);
    assert.equal(parseStatDirectives('[igs-stat:romance|小雪|结束]', { rev: 1 }).directives.length, 0);
    assert.equal(floor(createStatsState(), '[igs-stat:start|小雪|恋人]').state.characters.小雪.romance, true);
});

test('4.2.5 亲人标记：家人类起始关系归亲密并打 kin，旧楼不认', () => {
    const r = floor(createStatsState(), '[igs-stat:start|小雪|哥哥]');
    assert.equal(r.state.characters.小雪.kin, true);
    assert.equal(dim(r.state, '好感'), 55);
    assert.equal(parseStatDirectives('[igs-stat:start|小雪|哥哥]', { rev: 1 }).directives.length, 0);
    assert.equal(parseStatDirectives('[igs-stat:start|小雪|朋友]', { rev: 2 }).directives[0].kin, undefined);
});

test('5.1 悟性三档：通过率随档位提高，天纵每天两次 grow，平庸一次', () => {
    const rate = (tier) => {
        let pass = 0;
        const random = lcg(7);
        for (let i = 0; i < 3000; i += 1) {
            const base = createStatsState();
            const state = { ...base, protagonist: { ...base.protagonist, skills: { 格斗: { value: 50, marked: true } } } };
            const next = settleDay(state, { random, changes: [], rev: 2, aptitudeOf: () => tier });
            if (next.protagonist.skills.格斗.value > 50) pass += 1;
        }
        return pass / 3000;
    };
    const [a, b, c] = ['平庸', '出众', '天纵'].map(rate);
    assert.ok(a < b && b < c, `${a} ${b} ${c}`);
    const text = '[igs-stat:grow|小雪|格斗][igs-stat:grow|小雪|格斗][igs-stat:grow|小雪|格斗]';
    const grown = (tier) => floor(createStatsState(), text, { aptitudeOf: () => tier });
    assert.equal(grown('天纵').changes.filter((c2) => c2.note === '成长').length, 2);
    assert.equal(grown('平庸').changes.filter((c2) => c2.note === '成长').length, 1);
    assert.equal(floor(createStatsState(), text, { strengthRev: 1, aptitudeOf: () => '天纵' }).changes.filter((c2) => c2.note === '成长').length, 1);
});

test('5.2 顿悟：一次 +2d10，30 天一次，可指向主角', () => {
    const r = floor(createStatsState(), '[igs-stat:insight|小雪|格斗]');
    const gain = r.changes.find((c) => c.note === '顿悟');
    assert.ok(gain && gain.to - gain.from >= 2 && gain.to - gain.from <= 20);
    assert.ok(diag(floor(r.state, '[igs-stat:insight|小雪|格斗]'), 'stat-insight-cooldown'));
    const later = floor(floor(r.state, '[igs-stat:skip|30天]').state, '[igs-stat:insight|小雪|格斗]');
    assert.ok(later.changes.some((c) => c.note === '顿悟'));
    const hero = floor(createStatsState(), '[igs-stat:insight|主角|格斗]');
    assert.ok(hero.changes.some((c) => c.target === '主角' && c.note === '顿悟'));
    assert.ok(diag(floor(hero.state, '[igs-stat:insight|<user>|格斗]'), 'stat-insight-cooldown'));
    assert.equal(parseStatDirectives('[igs-stat:insight|小雪|格斗]', { rev: 1 }).directives.length, 0);
});

test('6 跳一年：新楼不截断、冷却与芥蒂消退一次算完；旧楼仍截 30 天', () => {
    const state = withDims({ 好感: 40, 芥蒂: 60 }, { lastSeenDay: 1 });
    const r = floor(state, '[igs-stat:skip|1年]');
    assert.equal(r.state.clock.day, 366);
    assert.equal(r.meta.flags.skipCapped, undefined);
    assert.equal(dim(r.state, '好感'), 26);
    assert.equal(dim(r.state, '芥蒂'), 25);
    const old = floor(state, '[igs-stat:skip|1年]', { strengthRev: 1 });
    assert.equal(old.state.clock.day, 31);
    assert.equal(old.meta.flags.skipCapped, true);
});

test('6 跳跃楼在场角色不冷却，不在场照旧；旧楼不适用', () => {
    const state = withDims({ 好感: 40 }, { lastSeenDay: 1 });
    assert.equal(dim(floor(state, '[igs-stat:skip|20天]', { present: ['小雪'] }).state, '好感'), 40);
    assert.ok(dim(floor(state, '[igs-stat:skip|20天]', { present: [] }).state, '好感') < 40);
    assert.ok(dim(floor(state, '[igs-stat:skip|20天]', { present: ['小雪'], strengthRev: 1 }).state, '好感') < 40);
});

test('4.2.5 欲望淡去：非恋爱对象每天 -1，恋爱对象不消退，旧楼不消退', () => {
    const r = floor(withDims({ 欲望: 10 }), '[igs-stat:skip|5天]');
    assert.equal(dim(r.state, '欲望'), 5);
    assert.equal(r.changes.filter((c) => c.key === '欲望' && c.note === '淡忘').length, 1);
    assert.equal(dim(floor(withDims({ 欲望: 10 }, { romance: true }), '[igs-stat:skip|5天]').state, '欲望'), 10);
    assert.equal(dim(floor(withDims({ 欲望: 10 }), '[igs-stat:skip|5天]', { strengthRev: 1 }).state, '欲望'), 10);
});

test('6.5 主角离体：冻结体力与兜底、压力保留、冷却暂停，复归后恢复', () => {
    const base = withDims({ 好感: 40 }, { lastSeenDay: 1 });
    const state = { ...base, protagonist: { ...base.protagonist, bars: { stamina: 80, money: 0, stress: 30 } } };
    const opts = { nsfw: true, intimateCost: 'standard' };
    const r = floor(state, '[igs-stat:hero|离体][igs-stat:intimate|小雪|重][igs-stat:stress|上升]', opts);
    assert.equal(r.state.protagonist.detached, true);
    assert.equal(r.state.protagonist.bars.stamina, 80);
    assert.equal(r.state.protagonist.bars.stress, 40);
    assert.ok(r.state.characters.小雪.bars.stamina < 100);
    assert.equal(r.meta.flags.detached, true);
    const eat = floor(r.state, '他吃了晚饭。');
    assert.equal(eat.state.protagonist.bars.stamina, 80);
    assert.equal(dim(floor(r.state, '[igs-stat:skip|20天]').state, '好感'), 40);
    const back = floor(r.state, '[igs-stat:hero|复归][igs-stat:skip|20天]');
    assert.equal(back.state.protagonist.detached, false);
    assert.ok(dim(back.state, '好感') < 40);
    const normal = floor(state, '[igs-stat:intimate|小雪|重]', opts);
    assert.ok(normal.state.protagonist.bars.stamina < 80);
});

test('6.5 随身不冷却、无身体丢体力与亲密标签、灵宠仅随身体力照扣', () => {
    const skip = (text, extra) => floor(createStatsState(), text, extra);
    const companion = skip('[igs-stat:start|小雪|朋友+随身]').state;
    assert.equal(companion.characters.小雪.companion, true);
    assert.equal(dim(floor({ ...companion, characters: { 小雪: { ...companion.characters.小雪, lastSeenDay: 1 } } }, '[igs-stat:skip|20天]').state, '好感'), 30);
    const ghost = floor(createStatsState(), '[igs-stat:start|小雪|亲密+随身+无身体][igs-stat:stamina|小雪|重][igs-stat:intimate|小雪|轻]', { nsfw: true, intimateCost: 'standard' });
    assert.equal(ghost.state.characters.小雪.bodiless, true);
    assert.equal(ghost.state.characters.小雪.bars.stamina, 100);
    assert.ok(diag(ghost, 'stat-bodiless'));
    const pet = floor(createStatsState(), '[igs-stat:start|小雪|朋友+随身][igs-stat:stamina|小雪|重]');
    assert.equal(pet.state.characters.小雪.bars.stamina, 70);
    const viaTraits = floor(withDims({}), '[igs-stat:stamina|小雪|重]', { traits: { 小雪: { bodiless: true } } });
    assert.ok(diag(viaTraits, 'stat-bodiless'));
    assert.equal(viaTraits.state.characters.小雪.bars.stamina, 100);
    const kept = floor(withDims({ 好感: 40 }, { lastSeenDay: 1 }), '[igs-stat:skip|20天]', { traits: { 小雪: { companion: true } } });
    assert.equal(dim(kept.state, '好感'), 40);
});

test('提示词：新标签与占位符，旧自定义模板的好感强度占位符不报错', () => {
    const r = buildStatsPrompt(createStatsState(), {});
    for (const word of ['交心', 'igs-stat:insight', 'igs-stat:hero', '释怀、接纳', '主角自己的心意']) assert.ok(r.content.includes(word), word);
    assert.deepEqual(r.diagnostics, []);
    const old = buildStatsPrompt(createStatsState(), { prompts: { tags: '[igs-stat:favor|角色名|{{好感档位}}|{{好感强度}}]' } });
    assert.deepEqual(old.diagnostics, []);
    assert.match(old.content, /小\/中\/大\/重大/);
    assert.ok(DEFAULT_STAT_PROMPTS.tags.includes('{{强度}}'));
    const nsfw = buildStatsPrompt(createStatsState(), { nsfw: true });
    assert.ok(nsfw.content.includes('不因穿着、外貌或意外接触而写'));
});

test('提示词：非恋爱对象的阶段文案与亲密门槛', () => {
    const state = withDims({ 好感: 60, 欲望: 30 });
    const text = (extra, character = {}) => buildStatsPrompt({ ...state, characters: { 小雪: { ...state.characters.小雪, ...character } } }, { present: ['小雪'], nsfw: true, intimacyGate: true, ...extra }).content;
    assert.ok(text({}).includes(DEFAULT_STAGE_TEXT_PLATONIC.强烈在意));
    assert.ok(!text({}, { romance: true }).includes(DEFAULT_STAGE_TEXT_PLATONIC.强烈在意));
    assert.ok(text({ stageTextPlatonic: { 强烈在意: '自定义友情文案' } }).includes('自定义友情文案'));
    assert.equal(intimacyAllowed({ 欲望: 30, 好感: 60, 信任: 40 }, { romance: false }), true);
    assert.equal(intimacyAllowed({ 欲望: 10, 好感: 60, 信任: 40 }, { romance: false }), false);
    assert.equal(intimacyAllowed({ 欲望: 10, 好感: 60, 信任: 40 }, { romance: true }), true);
    assert.equal(intimacyAllowed({ 欲望: 30, 好感: 60, 信任: 40 }, { romance: false, kin: true }), false);
    assert.equal(intimacyAllowed({ 欲望: 51, 好感: 0, 信任: 0 }, { romance: false, kin: true }), true);
});

test('持久化：aptitude、traits、heroNotes、romanceSeen 经 sanitize 与键值往返保持', () => {
    const catalog = sanitizeCatalog({
        aptitude: { 主角: '天纵', 小雪: '平庸', 阿福: '出众' },
        traits: { 老爷爷: { companion: true, bodiless: true }, 小雪: { kin: true, x: true }, 空: {} },
        heroNotes: { 小雪: 'x'.repeat(60), 空: '  ' },
        romanceSeen: ['小雪', '小雪', 3],
    });
    assert.deepEqual(catalog.aptitude, { 主角: { v: '天纵', src: 'manual' }, 阿福: { v: '出众', src: 'manual' } });
    const on = { on: true, src: 'manual' };
    assert.deepEqual(catalog.traits, { 老爷爷: { companion: on, bodiless: on }, 小雪: { kin: on } });
    assert.equal(catalog.heroNotes.小雪.length, 40);
    assert.deepEqual(catalog.romanceSeen, ['小雪']);
    const back = restoreChat(chatEntries({ catalog })).catalog;
    assert.deepEqual(back.aptitude, catalog.aptitude);
    assert.deepEqual(back.traits, catalog.traits);
    assert.deepEqual(back.heroNotes, catalog.heroNotes);
    assert.deepEqual(back.romanceSeen, catalog.romanceSeen);
});

test('提示词：恋爱结束、误会解除两行按需出现', () => {
    const plain = buildStatsPrompt(createStatsState(), {}).content;
    assert.ok(!plain.includes('igs-stat:romance'));
    assert.ok(!plain.includes('igs-stat:clear'));
    const state = createStatsState();
    state.characters.林夏 = { ...createCharacter(1), romance: true };
    state.characters.阿澄 = { ...createCharacter(1), recentHurts: [{ day: 1, dim: '信任', amount: 3 }] };
    const both = buildStatsPrompt(state, {}).content;
    assert.ok(both.includes('igs-stat:romance|角色名|结束'));
    assert.ok(both.includes('igs-stat:clear|角色名'));
    const seen = createStatsState();
    seen.characters.林夏 = createCharacter(1);
    assert.ok(buildStatsPrompt(seen, { romanceSeen: ['林夏'] }).content.includes('igs-stat:romance'));
});
