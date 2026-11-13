// 习惯机制与数值普查四条：倍率、强势/记仇、恋人不消退、重算、恋人降轻雷、重逢缓冲、芥蒂与好感下降上限。
import test from 'node:test';
import assert from 'node:assert/strict';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { getTraitByName } from '../src/scene/stats/stat-traits.js';
import { scanHabit, habitMult } from '../src/scene/stats/stat-habit.js';

const high = () => 0.99;
const floor = (state, text, traits = {}, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter: (n) => n, favorTier: 'normal', strengthRev: 2, nsfw: true, traits, ...opts });
const on = { on: true, src: 'manual' };
const traitsFor = (who, ...names) => ({ [who]: Object.fromEntries(names.map((n) => [getTraitByName(n).id, on])) });
const mk = (patch = {}) => { const c = createCharacter(1, { nsfw: true }); return { ...c, ...patch, dims: { ...c.dims, ...(patch.dims || {}) } }; };
const world = (chars, day = 1) => ({ ...createStatsState({ day }), characters: chars });
const ev = (v) => `[igs-stat:event|林夏|${v}]`;
const hab = (r, key = '批评') => r.state.characters.林夏.habit && r.state.characters.林夏.habit[key];
// 同一天内连续 n 楼，每楼好感下降（小）；返回每楼好感差值。
const rounds = (s, n, text, traits) => { const out = []; let st = s; for (let i = 0; i < n; i += 1) { const before = st.characters.林夏.dims.好感; const r = floor(st, text, traits); out.push(r.state.characters.林夏.dims.好感 - before); st = r.state; } return { out, st }; };

test('倍率表 ×1 / 0.6 / 0.3 / 0.1', () => {
    assert.deepEqual([1, 2, 3, 4, 9].map(habitMult), [1, 0.6, 0.3, 0.1, 0.1]);
});

test('普通角色：同一冒犯第 1–4 次好感下降 3、2、1、1（保底 1）', () => {
    const { out } = rounds(world({ 林夏: mk({ dims: { 好感: 40 } }) }), 4, `${ev('批评')}[igs-stat:favor|林夏|不满|小]`, {});
    assert.deepEqual(out, [-3, -2, -1, -1]);
});

test('明细带「习惯：第N次，×倍率」与备注后缀', () => {
    const s0 = world({ 林夏: mk({ dims: { 好感: 40 } }) });
    const r1 = floor(s0, `${ev('批评')}[igs-stat:favor|林夏|不满|小]`, {});
    const r2 = floor(r1.state, `${ev('批评')}[igs-stat:favor|林夏|不满|小]`, {});
    const c = r2.changes.find((x) => x.key === '好感' && x.target === '林夏');
    assert.ok(c.calc.some((row) => row.label === '习惯' && row.value === '第2次，×0.6'));
    assert.ok(c.note.includes('（习惯了）'));
});

// 每楼先清掉当日雷点扣分账，避免每日 15 上限遮住档位判断。
const fresh = (st) => ({ ...st, characters: { ...st.characters, 林夏: { ...st.characters.林夏, mineDay: undefined, dims: { ...st.characters.林夏.dims, 好感: 60 } } } });
const tierOf = (r) => { const c = r.changes.find((x) => String(x.note).startsWith('踩雷')); return { c, tier: c.calc.find((row) => row.label === '档位').value }; };

test('强势：前 5 次保留屡犯升档，第 6 次起打折', () => {
    const t = traitsFor('林夏', '强势');
    let st = world({ 林夏: mk({ dims: { 好感: 60 } }) });
    const tiers = [];
    for (let i = 0; i < 6; i += 1) {
        const r = floor(fresh(st), ev('顶撞'), t);
        const { c, tier } = tierOf(r);
        tiers.push(tier);
        if (i === 5) assert.ok(c.calc.some((row) => row.label === '习惯' && row.value === '第6次，×0.6'));
        st = r.state;
    }
    assert.deepEqual(tiers.slice(0, 5), ['雷', '重雷', '重雷', '重雷', '重雷']);
    assert.equal(tiers[5], '雷');
    assert.equal(st.characters.林夏.habit.顶撞.n, 6);
});

test('记仇：冒犯不打折，照旧屡犯升档', () => {
    const t = traitsFor('林夏', '记仇', '强势');
    let st = world({ 林夏: mk({ dims: { 好感: 60 } }) });
    for (let i = 0; i < 7; i += 1) {
        const r = floor(fresh(st), ev('顶撞'), t);
        const { c, tier } = tierOf(r);
        if (i >= 1) assert.equal(tier, '重雷');
        assert.ok(!c.calc.some((row) => row.label === '习惯' && /×/.test(row.value)));
        st = r.state;
    }
});

test('恋人的习惯不消退，非恋人隔天消退', () => {
    const entry = { n: 4, day: 1 };
    const state = (romance) => world({ 林夏: mk({ romance, habit: { 批评: entry } }) }, 10);
    const scan = (romance) => scanHabit({ before: state(romance), directives: [{ kind: 'traitEvent', target: '林夏', value: '批评' }], reviewEvents: [], has: () => false, day: 10, here: new Set(['林夏']), lastSeen: { 林夏: 10 }, romanceSeen: [] }).get('林夏');
    assert.equal(scan(true).by.批评.n, 5);
    assert.equal(scan(false).by.批评.n, 1);
});

test('重算同一楼不重复累计', () => {
    const s0 = world({ 林夏: mk({ dims: { 好感: 40 } }) });
    const t = `${ev('批评')}[igs-stat:favor|林夏|不满|小]`;
    const a = floor(s0, t, {});
    const b = floor(s0, t, {});
    assert.equal(hab(a).n, 1);
    assert.equal(hab(b).n, 1);
    assert.equal(JSON.stringify(s0).includes('habit'), false);
});

test('恋人被冒犯降为轻雷：不扣分、不加芥蒂、不升档，明细写「恋人，不计较」', () => {
    const t = traitsFor('林夏', '强势');
    let st = world({ 林夏: mk({ romance: true, dims: { 好感: 60 }, mineLast: { '强势:event:顶撞': 1 } }) });
    for (let i = 0; i < 2; i += 1) {
        const r = floor(st, ev('顶撞'), t);
        const c = r.changes.find((x) => String(x.note).startsWith('踩雷'));
        assert.ok(c.note.includes('（恋人，不计较）'));
        assert.equal(r.state.characters.林夏.dims.好感, 60);
        assert.equal(r.state.characters.林夏.dims.芥蒂, 0);
        st = r.state;
    }
});

test('久别重逢：好感达 26 的角色本楼冒犯不计较，只缓冲一楼，习惯不 +1', () => {
    const t = traitsFor('林夏', '强势');
    const s0 = world({ 林夏: mk({ dims: { 好感: 40 }, lastSeenDay: 1 }) }, 10);
    const a = floor(s0, ev('顶撞'), t);
    const c = a.changes.find((x) => String(x.note).startsWith('踩雷'));
    assert.ok(c.note.includes('久别重逢，不计较'));
    assert.equal(a.state.characters.林夏.dims.好感, 40);
    assert.equal(a.state.characters.林夏.habit, undefined);
    assert.equal(a.state.characters.林夏.reunionDay, 10);
    const b = floor(a.state, ev('顶撞'), t);
    assert.equal(b.state.characters.林夏.dims.好感, 37);
});

test('芥蒂上升：「大」档不受单楼限；「中」档单楼 +5、每日 +10', () => {
    let st = world({ 林夏: mk() });
    const one = floor(st, '[igs-stat:grudge|林夏|上升|大]', {}, { strengthRev: 2 });
    assert.equal(one.state.characters.林夏.dims.芥蒂, 10);
    st = world({ 林夏: mk() });
    const gs = [];
    for (let i = 0; i < 3; i += 1) { st = floor(st, '[igs-stat:grudge|林夏|上升|中]', {}).state; gs.push(st.characters.林夏.dims.芥蒂); }
    assert.deepEqual(gs, [5, 10, 10]);
});

test('好感下降每日上限 20：连续「大」档第三次只剩 0', () => {
    let st = world({ 林夏: mk({ dims: { 好感: 50 } }) });
    const got = [];
    for (let i = 0; i < 3; i += 1) { const b = st.characters.林夏.dims.好感; st = floor(st, '[igs-stat:favor|林夏|受伤|大]', {}).state; got.push(st.characters.林夏.dims.好感 - b); }
    assert.deepEqual(got, [-15, -5, 0]);
});

test('冒犯习惯到 ×0.3 写一次「已经习惯」，之后不再写，送礼不注入', () => {
    let st = world({ 林夏: mk({ dims: { 好感: 60 } }) });
    const t = traitsFor('林夏', '白莲');
    const lines = [];
    for (let i = 0; i < 4; i += 1) {
        const r = floor(fresh(st), ev('批评'), t);
        lines.push(r.meta.flags.landmine ? (r.meta.flags.landmine.text || r.meta.flags.landmine.noun) : null);
        st = r.state;
    }
    assert.equal(lines[2], '林夏对主角的批评已经习惯，不再当回事');
    assert.equal(lines[3], null);
    assert.ok(lines[0] && !String(lines[0]).includes('习惯'));
});

test('恋爱结束后习惯从结束那天起按天消退，不一次清空', () => {
    const s0 = world({ 林夏: mk({ romance: true, habit: { 顶撞: { n: 4, day: 3 } }, dims: { 好感: 60 } }) }, 30);
    const r = floor(s0, '[igs-stat:romance|林夏|结束]', {});
    assert.equal(r.state.characters.林夏.romance, false);
    assert.deepEqual(r.state.characters.林夏.habit.顶撞, { n: 4, day: 30 });
});
