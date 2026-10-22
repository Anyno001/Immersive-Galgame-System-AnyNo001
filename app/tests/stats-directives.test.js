import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatDirectives, stripStatDirectives } from '../src/scene/stats/stat-directives.js';
import { parseSkipDays } from '../src/scene/stats/stat-duration.js';
import { isMarkerDirectiveLine, stripMarkerDirectives } from '../src/scene/directive-tags.js';

const FAVOR = { kind: 'favor', target: '小雪', dim: '好感', value: '开心' };

test('数值标签容错：全角括号、全角冒号竖线、空格、换行、大小写（易错点 C1）', () => {
    for (const raw of ['[igs-stat:favor|小雪|开心]', '【igs-stat：favor｜小雪｜开心】', '[ igs-stat : favor | 小雪 | 开心 ]', '[igs-stat:favor|\n小雪\n|开心]', '[IGS-STAT:FAVOR|小雪|开心]']) {
        assert.deepEqual(parseStatDirectives(`正文${raw}正文`).directives, [FAVOR], raw);
    }
});

test('档位含数字或不在白名单时整条丢弃并记诊断（易错点 C2）', () => {
    const { directives, diagnostics } = parseStatDirectives('[igs-stat:favor|小雪|+5][igs-stat:favor|小雪|开心+2][igs-stat:stamina|-30][igs-stat:favor|小雪|狂喜][igs-stat:unknown|x]');
    assert.equal(directives.length, 0);
    assert.equal(diagnostics.length, 5);
    assert.ok(diagnostics.every((d) => d.code === 'stat-tag-rejected'));
});

test('近义词与程度副词归一', () => {
    const { directives } = parseStatDirectives('[igs-stat:favor|小雪|超级开心][igs-stat:favor|小雪|嫉妒][igs-stat:trust|小雪|提升][igs-stat:money|支出|大额][igs-stat:stamina|通宵]');
    assert.deepEqual(directives.map((d) => d.value), ['开心', '吃醋', '上升', '昂贵', '熬夜']);
    assert.equal(directives[2].dim, '信任');
    assert.equal(directives[3].flow, '花费');
});

test('战斗数量与时间跳跃是结构参数，单独限幅', () => {
    const { directives, diagnostics } = parseStatDirectives('[igs-stat:battle|精英|2][igs-stat:battle|boss|99][igs-stat:battle|杂兵|很多][igs-stat:skip|一周后]');
    assert.deepEqual(directives[0], { kind: 'battle', tier: '精英', count: 2 });
    assert.deepEqual(directives[1], { kind: 'battle', tier: '头目', count: 9 });
    assert.deepEqual(directives[2], { kind: 'skip', days: 7, capped: false });
    assert.equal(diagnostics.length, 1);
});

test('时间跳跃天数解析，上限 30 天（易错点 D4）', () => {
    assert.deepEqual(parseSkipDays('7天'), { days: 7, capped: false });
    assert.deepEqual(parseSkipDays('三日'), { days: 3, capped: false });
    assert.deepEqual(parseSkipDays('两周'), { days: 14, capped: false });
    assert.deepEqual(parseSkipDays('半个月后'), { days: 15, capped: false });
    assert.deepEqual(parseSkipDays('十年后'), { days: 30, capped: true });
    assert.deepEqual(parseSkipDays('３０天'), { days: 30, capped: false });
    assert.equal(parseSkipDays('很久以后'), null);
    assert.equal(parseSkipDays('0天'), null);
});

test('剔除标签；没有标签的正文原样返回', () => {
    assert.equal(stripStatDirectives('她笑了。[igs-stat:favor|小雪|开心]\n下一句'), '她笑了。\n下一句');
    const plain = '第一行  \n\n\n\n第二行';
    assert.equal(stripStatDirectives(plain), plain);
});

test('阅读器统一剔除入口同样去掉数值标签（含全角、跨行写法），整行标签按标记行处理（易错点 C4）', () => {
    assert.equal(stripMarkerDirectives('她笑了。[igs-stat:favor|小雪|开心]【igs-stat：sleep】'), '她笑了。');
    assert.equal(stripMarkerDirectives('甲[igs-stat:favor|\n小雪|开心]乙'), '甲乙');
    assert.equal(isMarkerDirectiveLine('[igs-stat:sleep]'), true);
    assert.equal(isMarkerDirectiveLine('【igs-stat：sleep】'), true);
    assert.equal(isMarkerDirectiveLine('她说[igs-stat]不算'), false);
    assert.equal(stripMarkerDirectives('没有标签【台词】'), '没有标签【台词】');
});
