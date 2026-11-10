import test from 'node:test';
import assert from 'node:assert/strict';
import { applyReview, buildReviewPayload, buildReviewPrompt, parseReviewReply, scanFloorForReview, summaryRowCount } from '../src/core/trait-review.js';

// 最小假登记表（不依赖 stat-traits.js）
const DEFS = [
    { id: 'fragile', name: '脆弱', nsfw: false, judge: '人设写明心理脆弱、有创伤、易崩溃', desc: '压力上升加倍' },
    { id: 'tough', name: '坚韧', nsfw: false, judge: '人设写明意志坚定、不易崩溃' },
    { id: 'lewd', name: '欲望旺盛', nsfw: true, judge: '人设写明欲望强烈' },
];

// 假 applyTraitChange：只处理开关与 src
const fakeApply = (state, catalog, name, id, on, src) => {
    const traits = { ...(catalog.traits || {}) };
    traits[name] = { ...(traits[name] || {}), [id]: { on, src } };
    return { catalog: { ...catalog, traits }, notices: [{ type: on ? 'gain' : 'lose', charName: name, id }] };
};

// 构造 exportTableAsJson 风格的原始表
const sheet = (uid, name, header, rows, orderNo = 1) => ({ uid, name, orderNo, content: [header, ...rows] });
const rawTables = (summaryCount = 25) => ({
    s1: sheet('sheet_a', '纪要表', ['row_id', '时间', '纪要'], Array.from({ length: summaryCount }, (_, i) => [String(i), `d${i}`, `纪要${i}`])),
    s2: sheet('sheet_b', '恋爱日记表', ['row_id', '角色名', '日记'], [
        ['0', '林夏', '林夏日记1'], ['1', '小夏', '别名日记2'], ['2', '苏雨', '苏雨日记'], ['3', '林夏', '林夏日记3'], ['4', '林夏', '林夏日记4'],
    ], 2),
});

test('触发判定：大事件、极大压力、break、romance 结束、重伤命中', () => {
    const cases = [
        [{ kind: 'stress', value: '上升', strength: '极大', target: '林夏' }, 'stress-extreme'],
        [{ kind: 'break', value: '崩溃', target: '林夏' }, 'break'],
        [{ kind: 'romance', value: '结束', target: '林夏' }, 'romance-end'],
        [{ kind: 'hurt', value: '重伤' }, 'hurt-heavy'],
        [{ kind: 'event', target: '林夏', value: '救命' }, 'event'],
    ];
    for (const [d, reason] of cases) {
        const r = scanFloorForReview([d], 5, 0, 30);
        assert.equal(r.send, true);
        assert.match(r.reason, new RegExp(reason));
    }
    assert.deepEqual(scanFloorForReview([{ kind: 'hurt', value: '重伤' }], 5, 0, 30, { protagonist: '阿明' }).chars, ['阿明']);
    // 普通压力不触发
    assert.equal(scanFloorForReview([{ kind: 'stress', value: '上升', strength: '大', target: '林夏' }], 5, 0, 30).send, false);
});

test('满 N 楼兜底；N=0 关闭', () => {
    const r = scanFloorForReview([], 30, 0, 30, { recentChars: ['林夏', '林夏', '苏雨'] });
    assert.equal(r.send, true);
    assert.equal(r.reason, 'interval');
    assert.deepEqual(r.chars, ['林夏', '苏雨']);
    assert.equal(scanFloorForReview([], 29, 0, 30).send, false);
    assert.equal(scanFloorForReview([], 500, 0, 0).send, false);
});

test('纪要行数随 N：N÷3 向上取整，夹在 3 到 20', () => {
    assert.equal(summaryRowCount(30), 10);
    assert.equal(summaryRowCount(1), 3);
    assert.equal(summaryRowCount(100), 20);
    assert.equal(summaryRowCount(31), 11);
    const chars = [{ name: '林夏' }];
    const p10 = buildReviewPayload({ floors: [], tables: rawTables(), chars, defs: DEFS, N: 30 });
    assert.equal(p10.summary.length, 10);
    assert.match(p10.summary[9], /纪要24/);
    assert.equal(buildReviewPayload({ floors: [], tables: rawTables(), chars, defs: DEFS, N: 6 }).summary.length, 3);
});

test('恋爱日记按角色名列匹配，含别名，每人最近 3 行', () => {
    const chars = [{ name: '林夏', aliases: ['小夏'] }, { name: '苏雨' }, { name: '路人' }];
    const p = buildReviewPayload({ floors: [], tables: rawTables(), chars, defs: DEFS, N: 30 });
    const by = Object.fromEntries(p.chars.map((c) => [c.name, c.diary]));
    assert.equal(by['林夏'].length, 3);
    assert.match(by['林夏'].join(''), /别名日记2/);
    assert.doesNotMatch(by['林夏'].join(''), /林夏日记1/);
    assert.equal(by['苏雨'].length, 1);
    assert.deepEqual(by['路人'], []);
});

test('表缺失降级：读不到、无角色名列都不报错', () => {
    const chars = [{ name: '林夏' }];
    for (const tables of [null, undefined, () => ({ ok: false, reason: 'missing-api' }), () => { throw new Error('x'); }, {}]) {
        const p = buildReviewPayload({ floors: [{ no: 1, role: 'ai', text: '正文' }], tables, chars, defs: DEFS, N: 30 });
        assert.deepEqual(p.summary, []);
        assert.deepEqual(p.chars[0].diary, []);
        assert.equal(p.floors.length, 1);
    }
    const noCol = { s: sheet('sheet_x', '恋爱日记表', ['row_id', '内容'], [['0', 'a']]) };
    assert.deepEqual(buildReviewPayload({ tables: noCol, chars, defs: DEFS, N: 30 }).chars[0].diary, []);
    // readTables 返回结构 { ok, data } 也认
    assert.equal(buildReviewPayload({ tables: () => ({ ok: true, data: rawTables() }), chars, defs: DEFS, N: 30 }).summary.length, 10);
});

test('正文只取最近 6 楼', () => {
    const floors = Array.from({ length: 9 }, (_, i) => ({ no: i + 1, role: i % 2 ? 'user' : 'ai', text: `楼${i + 1}` }));
    const p = buildReviewPayload({ floors, chars: [], defs: DEFS, N: 30 });
    assert.equal(p.floors.length, 6);
    assert.equal(p.floors[0].no, 4);
});

test('提示词：不含倍率与说明，NSFW 关时不列 nsfw 项，含上次变动提示', () => {
    const chars = [{ name: '林夏', traits: [{ id: 'fragile', src: 'auto' }], recent: [{ id: 'tough', on: false }] }];
    const payload = buildReviewPayload({ floors: [{ no: 3, role: 'ai', text: '她崩溃了' }], tables: rawTables(), chars, defs: DEFS, N: 30 });
    const off = buildReviewPrompt(payload, DEFS, 'story');
    assert.match(off, /脆弱：人设写明心理脆弱/);
    assert.doesNotMatch(off, /欲望旺盛/);
    assert.doesNotMatch(off, /加倍|减半|倍率|×|x\d/);
    assert.match(off, /上次刚变动：失去「坚韧」/);
    assert.match(off, /最多变动 1 项/);
    const on = buildReviewPrompt({ ...payload, nsfw: true }, DEFS, 'initial');
    assert.match(on, /欲望旺盛：人设写明欲望强烈/);
    assert.match(on, /最多给 3 项/);
    assert.match(on, /JSON/);
});

test('解析容错：代码块、前后废话、表外项、去重、id 与名皆认、单对象', () => {
    const reply = '好的，结果如下：\n```json\n{"results":[{"name":"林夏","add":["脆弱","脆弱","不存在的","tough"],"remove":"坚韧"},{"name":"","add":["脆弱"]},null]}\n```\n以上。';
    assert.deepEqual(parseReviewReply(reply, DEFS), [
        { charName: '林夏', id: 'fragile', on: true },
        { charName: '林夏', id: 'tough', on: true },
    ]);
    assert.deepEqual(parseReviewReply('[{"name":"苏雨","remove":["脆弱"]}]', DEFS), [{ charName: '苏雨', id: 'fragile', on: false }]);
    assert.deepEqual(parseReviewReply('{"name":"苏雨","add":["脆弱"]}', DEFS), [{ charName: '苏雨', id: 'fragile', on: true }]);
    assert.deepEqual(parseReviewReply('完全不是 JSON', DEFS), []);
    assert.deepEqual(parseReviewReply('{"results":[{"name":"别人","add":["脆弱"]}]}', DEFS, { chars: ['林夏'] }), []);
});

test('应用：manual 在 initial 不覆盖，story 可覆盖并记 src=story', () => {
    const catalog = { traits: { 林夏: { tough: { on: true, src: 'manual' } } } };
    const r1 = applyReview([{ charName: '林夏', id: 'tough', on: true }, { charName: '林夏', id: 'fragile', on: true }], catalog, fakeApply, { mode: 'initial' });
    assert.equal(r1.catalog.traits['林夏'].tough.src, 'manual');
    assert.equal(r1.catalog.traits['林夏'].fragile.src, 'auto');
    assert.equal(r1.notices.length, 1);
    // initial 不删手动项
    const r2 = applyReview([{ charName: '林夏', id: 'tough', on: false }], catalog, fakeApply, { mode: 'initial' });
    assert.equal(r2.catalog.traits['林夏'].tough.on, true);
    // story 可覆盖
    const r3 = applyReview([{ charName: '林夏', id: 'tough', on: false }], catalog, fakeApply, { mode: 'story' });
    assert.deepEqual(r3.catalog.traits['林夏'].tough, { on: false, src: 'story' });
});

test('应用：initial 每人最多 3 项，story 每人最多 1 项，刚变的不改回', () => {
    const ids = ['a', 'b', 'c', 'd'].map((id) => ({ charName: '林夏', id, on: true }));
    assert.equal(applyReview(ids, { traits: {} }, fakeApply, { mode: 'initial' }).applied.length, 3);
    assert.equal(applyReview(ids, { traits: {} }, fakeApply, { mode: 'story' }).applied.length, 1);
    const back = applyReview([{ charName: '林夏', id: 'tough', on: true }], { traits: { 林夏: { tough: { on: false, src: 'story' } } } }, fakeApply, { mode: 'story', recent: { 林夏: [{ id: 'tough', on: false }] } });
    assert.equal(back.applied.length, 0);
    assert.equal(back.skipped[0].why, 'just-changed');
});

test('应用：同一角色同一特质每天最多变一次', () => {
    const first = applyReview([{ charName: '林夏', id: 'fragile', on: true }], { traits: {} }, fakeApply, { mode: 'story', day: '2026-01-01' });
    assert.equal(first.applied.length, 1);
    const same = applyReview([{ charName: '林夏', id: 'fragile', on: false }], first.catalog, fakeApply, { mode: 'story', day: '2026-01-01', changeLog: first.changeLog });
    assert.equal(same.applied.length, 0);
    assert.equal(same.skipped[0].why, 'daily-limit');
    const next = applyReview([{ charName: '林夏', id: 'fragile', on: false }], first.catalog, fakeApply, { mode: 'story', day: '2026-01-02', changeLog: first.changeLog });
    assert.equal(next.applied.length, 1);
});
