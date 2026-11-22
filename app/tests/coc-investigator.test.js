import test from 'node:test';
import assert from 'node:assert/strict';
import {
    cocDerived, cocSkillBase, occPointsOf, hobbyPointsOf, cocSkillTotals, parseCocSheet, sanitizeCocSheet,
} from '../src/scene/stats/coc-investigator.js';

const attrs = { 力量: 60, 体质: 50, 体型: 65, 敏捷: 70, 外貌: 50, 智力: 80, 意志: 55, 教育: 70 };

test('派生值与伤害加值边界', () => {
    const d = cocDerived(attrs);
    assert.equal(d.hp, 11);
    assert.equal(d.mp, 11);
    assert.equal(d.san, 55);
    assert.equal(d.db, '+1D4');
    assert.equal(d.mov, 8);
    assert.equal(cocDerived({ ...attrs, 力量: 40, 体型: 24 }).db, '-2');
    assert.equal(cocDerived({ ...attrs, 力量: 40, 体型: 25 }).db, '-1');
    assert.equal(cocDerived({ ...attrs, 力量: 60, 体型: 64 }).db, '0');
    assert.equal(cocDerived({ ...attrs, 力量: 80, 体型: 85 }).db, '+1D6');
    assert.equal(cocDerived({ ...attrs, 力量: 60, 体型: 80, 敏捷: 50 }).mov, 7);
    assert.equal(cocDerived(attrs, { 克苏鲁神话: 10 }).sanMax, 89);
});

test('技能基础值与点数', () => {
    assert.equal(cocSkillBase('闪避', attrs), 35);
    assert.equal(cocSkillBase('母语', attrs), 70);
    assert.equal(cocSkillBase('科学(化学)', attrs), 1);
    assert.equal(cocSkillBase('科学：化学', attrs), 1);
    assert.equal(cocSkillBase('不存在的技能', attrs), null);
    assert.equal(occPointsOf({ attrs, occFormula: 'edu4' }), 280);
    assert.equal(occPointsOf({ attrs, occFormula: 'edu2dex2' }), 280);
    assert.equal(occPointsOf({ attrs, occFormula: 'custom', occPoints: 123 }), 123);
    assert.equal(hobbyPointsOf({ attrs }), 160);
    const t = cocSkillTotals({ source: 'roll', attrs, alloc: { 侦查: { occ: 30, hobby: 10 } } });
    assert.equal(t.侦查, 65);
    assert.equal(t.闪避, undefined);
    assert.deepEqual(cocSkillTotals({ source: 'paste', totals: { 侦查: 60 } }), { 侦查: 60 });
});

test('粘贴解析：骰娘连写、缩写、别名与未知片段', () => {
    const r = parseCocSheet('.st 力量60体质50体型65敏捷70外貌50智力80意志55教育70 幸运40 san50 斗殴60 科学：化学30 侦查 60，乱七八糟99');
    assert.equal(r.attrs.力量, 60);
    assert.equal(r.luck, 40);
    assert.equal(r.san, 50);
    assert.equal(r.skills['格斗(斗殴)'], 60);
    assert.equal(r.skills['科学(化学)'], 30);
    assert.equal(r.skills.侦查, 60);
    assert.deepEqual(r.missing, []);
    assert.equal(r.legacy6, false);
    assert.ok(r.unknown.includes('乱七八糟99'));

    const e = parseCocSheet('STR 60 con:50 SIZ65 dex70 APP50 INT80 pow55 EDU70 Luck 40');
    assert.equal(e.attrs.体型, 65);
    assert.equal(e.attrs.教育, 70);
    assert.equal(e.luck, 40);
});

test('粘贴解析：6 版卡与缺项', () => {
    const r = parseCocSheet('STR 12 CON 11 SIZ 13 DEX 14 APP 10 INT 15 POW 9 EDU 16');
    assert.equal(r.legacy6, true);
    const m = parseCocSheet('力量60 体质50');
    assert.equal(m.legacy6, false);
    assert.ok(m.missing.includes('教育'));
});

test('清洗：缺属性为 null，source 决定保留字段', () => {
    assert.equal(sanitizeCocSheet({ attrs: { 力量: 50 } }), null);
    const s = sanitizeCocSheet({
        attrs: { ...attrs, 力量: 500 }, occupation: '一二三四五六七八九十一二三四', source: 'paste',
        totals: { 侦查: 120 }, alloc: { 侦查: { occ: 1, hobby: 1 } },
    });
    assert.equal(s.attrs.力量, 99);
    assert.equal(s.occupation.length, 12);
    assert.deepEqual(s.totals, { 侦查: 99 });
    assert.equal(s.alloc, undefined);
});
