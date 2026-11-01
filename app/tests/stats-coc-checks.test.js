import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CHECK_ROLL_COUNT, cocCheckCorrections, cocCheckRollsFor, cocFaces, cocRollsVars, formatCocRoll, replayCocChecks,
    resolveCocCheckRollsSegment, scanCocCheckTags, upcomingCheckOrdinal,
} from '../src/scene/stats/stat-coc-checks.js';
import * as coc7 from '../src/scene/stats/rulesets/coc7.js';

// 固定一组骰：第 n 个判定的个位 / 十位。
const rollSet = (unit, tens) => Array.from({ length: CHECK_ROLL_COUNT }, () => ({ unit, tens: [...tens] }));
const profileOf = (value) => () => ({ kind: 'attribute', value, learned: true, attributeValue: value, rank: '普通人', entry: { attribute: '力量' } });

test('骰序：长度 10、每项个位 + 3 颗十位、取值 0–9，同楼同 swipe 完全一致', () => {
    const a = cocCheckRollsFor('chat-1', 5);
    assert.equal(a.length, CHECK_ROLL_COUNT);
    for (const roll of a) {
        assert.equal(roll.tens.length, 3);
        assert.ok([roll.unit, ...roll.tens].every((n) => Number.isInteger(n) && n >= 0 && n <= 9));
    }
    assert.deepEqual(cocCheckRollsFor('chat-1', 5), a);
    assert.notDeepEqual(cocCheckRollsFor('chat-1', 6), a);
    assert.notDeepEqual(cocCheckRollsFor('chat-2', 5), a);
    assert.notDeepEqual(cocCheckRollsFor('chat-1', 5, 1), a);
    assert.deepEqual(cocCheckRollsFor('chat-1', 5, 1), cocCheckRollsFor('chat-1', 5, 1));
    assert.equal(cocCheckRollsFor('chat-1', 0), null);
    assert.equal(cocCheckRollsFor('', 3), null);
});

test('楼序号复用 check-rolls：新楼 +1，swipe 与重写不加', () => {
    const messages = [{ is_user: true }, { is_user: false }, { is_user: true }];
    assert.equal(upcomingCheckOrdinal(messages, 'normal'), 2);
    assert.equal(upcomingCheckOrdinal([...messages, { is_user: false }], 'swipe'), 2);
    assert.equal(upcomingCheckOrdinal(messages, 'quiet'), null);
});

test('骰面：奖励骰十位取小、惩罚骰取大，00+0 记 100', () => {
    assert.deepEqual(cocFaces({ unit: 7, tens: [3, 1, 5] }), { base: 37, bonus: [17, 17], penalty: [37, 57] });
    assert.deepEqual(cocFaces({ unit: 2, tens: [6, 4, 1] }), { base: 62, bonus: [42, 12], penalty: [62, 62] });
    assert.deepEqual(cocFaces({ unit: 0, tens: [0, 5, 0] }), { base: 100, bonus: [50, 50], penalty: [100, 100] });
    assert.equal(formatCocRoll({ unit: 7, tens: [3, 1, 5] }), '37（奖17/17，罚37/57）');
});

test('标签扫描：难度（常规=普通）、奖惩词、属性与技能、无效项给诊断', () => {
    const body = '[igs-check:阿明|力量|普通][igs-check:阿明|烹饪|困难|奖励2][igs-check:小雪|理智|极难|惩罚][igs-check:甲|力量|常规|优势]'
        + '[igs-check:乙|力量|15][igs-check:丙|力量|普通|很多][igs-check:丁|123|普通][igs-check:|力量|普通][igs-check:戊|力量]';
    const { tags, diagnostics } = scanCocCheckTags(body);
    assert.equal(tags.length, 9);
    assert.deepEqual(tags.slice(0, 4).map((t) => [t.valid, t.difficulty, t.edge, t.ability, t.skill]), [
        [true, '普通', 0, 'str', null],
        [true, '困难', 2, null, '烹饪'],
        [true, '极难', -1, null, '理智'],
        [true, '普通', 1, 'str', null],
    ]);
    assert.equal(tags[2].san, true);
    assert.deepEqual(diagnostics.map((d) => d.problem), ['invalid-difficulty', 'invalid-edge', 'unknown-ability', 'actor-missing', 'field-count']);
    assert.equal(tags[4].valid, false);
});

test('回放：困难需 ≤1/2、极难需 ≤1/5，大成功 ≤5、大失败 ≥96', () => {
    // 目标值 60：骰 27 → 普通成功也算困难成功（≤30），极难（≤12）不成功。
    const rolls = rollSet(7, [2, 9, 9]);
    const body = '[igs-check:阿明|力量|普通]成功。[igs-check:阿明|力量|困难]成功。[igs-check:阿明|力量|极难]失败。';
    const { results } = replayCocChecks({ body, rolls, profileOf: profileOf(60) });
    assert.deepEqual(results.map((r) => [r.die, r.threshold, r.success, r.tier]), [
        [27, 60, true, '困难成功'], [27, 30, true, '困难成功'], [27, 12, false, '困难成功'],
    ]);
    const crit = replayCocChecks({ body: '[igs-check:阿明|力量|极难]', rolls: rollSet(3, [0, 9, 9]), profileOf: profileOf(10) }).results[0];
    assert.deepEqual([crit.die, crit.ladder, crit.success], [3, 'crit', true]);
    const fumble = replayCocChecks({ body: '[igs-check:阿明|力量|普通]', rolls: rollSet(6, [9, 9, 9]), profileOf: profileOf(99) }).results[0];
    assert.deepEqual([fumble.die, fumble.ladder, fumble.success], [96, 'fumble', false]);
    assert.equal(fumble.outcome, '大失败');
});

test('回放：奖惩骰取值，标签与持续奖惩叠加后最多 2 颗，相反时抵消', () => {
    const rolls = rollSet(7, [6, 2, 0]);
    const run = (tag, edgeOf) => replayCocChecks({ body: `[igs-check:阿明|力量|普通${tag}]`, rolls, profileOf: profileOf(50), edgeOf }).results[0];
    assert.equal(run('').die, 67);
    assert.equal(run('|奖励').die, 27);
    assert.equal(run('|奖励2').die, 7);
    assert.equal(run('|惩罚').die, 67);
    assert.equal(run('|奖励', () => 1).die, 7);
    assert.equal(run('|奖励2', () => 2).edge, 2);
    assert.equal(run('|奖励', () => -1).die, 67);
    assert.equal(run('', () => -2).edge, -2);
    assert.equal(replayCocChecks({ body: '[igs-check:阿明|力量|普通]', rolls, profileOf: profileOf(50), shiftOf: () => 20 }).results[0].target, 70);
});

test('回放：每楼最多 10 个判定、骰序缺失或形状不对、角色未知都给诊断', () => {
    const body = Array.from({ length: 11 }, () => '[igs-check:阿明|力量|普通]').join('');
    const over = replayCocChecks({ body, rolls: rollSet(1, [1, 1, 1]), profileOf: profileOf(50) });
    assert.equal(over.results.length, 10);
    assert.ok(over.diagnostics.some((d) => d.code === 'check-over-limit' && d.order === 11));
    assert.ok(replayCocChecks({ body, rolls: null, profileOf: profileOf(50) }).diagnostics.some((d) => d.code === 'check-rolls-missing'));
    assert.ok(replayCocChecks({ body, rolls: [[1, 2]], profileOf: profileOf(50) }).diagnostics.some((d) => d.code === 'check-rolls-missing'));
    const unknown = replayCocChecks({ body: '[igs-check:路人|力量|普通]', rolls: rollSet(1, [1, 1, 1]), profileOf: () => null });
    assert.ok(unknown.diagnostics.some((d) => d.code === 'check-actor-unknown'));
    assert.deepEqual(replayCocChecks({ body: '没有标签', rolls: rollSet(1, [1, 1, 1]) }).results, []);
});

test('写反检测与更正文案：只核对标签后 40 字内的成败字样', () => {
    const rolls = rollSet(7, [2, 9, 9]);
    const body = '[igs-check:阿明|力量|极难]他轻松完成了，成功。[igs-check:阿明|力量|普通]他失败了。[igs-check:阿明|力量|困难]顺利。';
    const { results, diagnostics } = replayCocChecks({ body, rolls, profileOf: profileOf(60) });
    assert.deepEqual(results.map((r) => [r.written, r.mismatch]), [['成功', true], ['失败', true], [null, false]]);
    assert.deepEqual(diagnostics.filter((d) => d.code === 'check-mismatch').map((d) => d.order), [1, 2]);
    const corrections = cocCheckCorrections(results);
    assert.equal(corrections.length, 2);
    assert.match(corrections[0], /阿明的力量检定（极难）实际掷出 27【失败】，正文写成了「成功」/);
    assert.match(corrections[1], /（普通）实际掷出 27【困难成功】/);
    assert.deepEqual(cocCheckCorrections(null), []);
});

test('回放结果字段与 check-rolls 版对齐，并带规则体系标记', () => {
    const { results } = replayCocChecks({ body: '[igs-check:阿明|烹饪|普通]', rolls: rollSet(7, [2, 9, 9]), profileOf: profileOf(60) });
    const r = results[0];
    for (const key of ['order', 'actor', 'ability', 'skill', 'label', 'difficulty', 'edge', 'dice', 'die', 'target', 'threshold', 'total', 'tier', 'ladder', 'success', 'written', 'mismatch', 'index']) {
        assert.ok(Object.hasOwn(r, key), key);
    }
    assert.equal(r.ruleset, 'coc7');
    assert.equal(r.label, '烹饪');
    assert.deepEqual(r.dice, { unit: 7, tens: [2, 9, 9] });
    assert.equal(r.total, r.die);
    assert.equal(coc7.ID, r.ruleset);
});

test('提示词段：形状同 check-rolls 段，骰序、在场属性、持续奖惩与更正都在里面，骰值不泄漏到更正以外的算式', () => {
    const rolls = cocCheckRollsFor('chat-1', 3);
    const seg = resolveCocCheckRollsSegment({
        rolls,
        actors: [{ name: '阿明', attrs: { 力量: 60, 敏捷: 45, 理智: 55 }, skills: [['格斗', 70], ['烹饪', 30], ['潜行', 62]] }],
        edges: [{ name: '阿明', edge: -1, shift: -10, reasons: ['状态不佳'] }],
        corrections: ['阿明的力量检定（极难）实际掷出 27【失败】，正文写成了「成功」'],
    });
    assert.equal(seg.id, 'igs-check-rolls');
    assert.deepEqual([seg.position, seg.depth, seg.keys], ['depth0', 0, ['check-rolls']]);
    assert.equal(seg.rolls.length, CHECK_ROLL_COUNT);
    assert.deepEqual(seg.rolls[0], { unit: rolls[0].unit, tens: rolls[0].tens });
    assert.match(seg.content, /d100/);
    assert.match(seg.content, /≤ 5 为大成功，≥ 96 为大失败/);
    assert.match(seg.content, new RegExp(formatCocRoll(rolls[0]).replace(/[()/]/g, '\\$&')));
    assert.match(seg.content, /阿明：力量60 敏捷45 理智55；高技能 格斗70 潜行62/);
    assert.doesNotMatch(seg.content, /烹饪30/);
    assert.match(seg.content, /阿明惩罚、目标值-10（状态不佳）/);
    assert.match(seg.content, /更正：上一层阿明的力量检定/);
    assert.equal(resolveCocCheckRollsSegment({ rolls: [] }), null);
    assert.equal(resolveCocCheckRollsSegment({ rolls: rollSet(1, [1, 1, 1]) }).content.includes('{{'), false);
    assert.equal(cocRollsVars({ rolls: rollSet(1, [1, 1, 1]) }).更正, '');
});

test('提示词段的渲染样例（便于人工核对格式）', () => {
    const rolls = rollSet(7, [3, 1, 5]).map((roll, i) => ({ unit: (roll.unit + i) % 10, tens: roll.tens }));
    const seg = resolveCocCheckRollsSegment({ rolls, actors: [{ name: '阿明', attrs: { 力量: 60, 理智: 55 }, skills: [] }] });
    assert.match(seg.content, /37（奖17\/17，罚37\/57）、38（奖18\/18，罚38\/58）/);
});
