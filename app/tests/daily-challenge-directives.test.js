import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChallengeStart } from '../src/scene/challenge-directives.js';
import { extractCombatStart } from '../src/scene/combat-directives.js';

const codes = (result) => result.diagnostics.map((d) => d.code);

test('末行唯一标签被解析，字段默认普通难度与压力代价', () => {
    const full = parseChallengeStart('她推开了门。\n[igs-challenge:终面|话术|艰难|体力|林总]');
    assert.deepEqual({ ...full.start, tagHash: undefined, occurrence: undefined, index: undefined }, {
        event: '终面', domain: '话术', tier: '艰难', stake: '体力', requestedStake: '体力', counterpart: '林总', tagHash: undefined, occurrence: undefined, index: undefined,
    });
    const bare = parseChallengeStart('正文。\n[igs-challenge:终面]');
    assert.equal(bare.start.tier, '普通');
    assert.equal(bare.start.stake, '压力');
    assert.equal(bare.start.domain, '');
    assert.ok(bare.start.tagHash && bare.start.occurrence === 0);
});

test('标签后只剩纯标记行时仍视为末行，后面还有正文则不开局', () => {
    assert.ok(parseChallengeStart('正文\n[igs-challenge:终面]\n[igs-fx:rain]').start);
    const late = parseChallengeStart('[igs-challenge:终面]\n她深吸一口气，走了进去。');
    assert.equal(late.start, null);
    assert.deepEqual(codes(late), ['challenge-not-tail']);
});

test('多个标签只认末行最后一个，其余记不在末尾', () => {
    const result = parseChallengeStart('[igs-challenge:早面]\n过了一会儿。\n[igs-challenge:终面]');
    assert.equal(result.start.event, '终面');
    assert.deepEqual(codes(result), ['challenge-not-tail']);
});

test('未知难度、未知代价、字段过多、事件名缺失或超长一律拒收', () => {
    const cases = [
        ['[igs-challenge:终面|话术|地狱]', 'challenge-tier-unknown'],
        ['[igs-challenge:终面|话术|普通|积分]', 'challenge-stake-unknown'],
        ['[igs-challenge:终面|话术|普通|压力|林总|多余]', 'challenge-too-many-fields'],
        ['[igs-challenge:|话术]', 'challenge-event-invalid'],
        [`[igs-challenge:${'长'.repeat(21)}]`, 'challenge-event-invalid'],
    ];
    for (const [text, code] of cases) {
        const result = parseChallengeStart(`正文\n${text}`);
        assert.equal(result.start, null, text);
        assert.ok(codes(result).includes(code), `${text} ${codes(result)}`);
    }
});

test('领域不在技能清单时降级为空而不拒收整条标签', () => {
    const result = parseChallengeStart('正文\n[igs-challenge:终面|屠龙术|普通|压力]');
    assert.equal(result.start.event, '终面');
    assert.equal(result.start.domain, '');
    assert.deepEqual(codes(result), ['challenge-domain-unknown']);
    assert.equal(parseChallengeStart('正文\n[igs-challenge:终面|屠龙术]', { skills: ['屠龙术'] }).start.domain, '屠龙术');
});

test('金钱代价可用；关系代价需要对方，缺对方降级为压力并记诊断，保留原始请求', () => {
    const money = parseChallengeStart('正文\n[igs-challenge:比赛|烹饪|艰难|金钱]');
    assert.equal(money.start.stake, '金钱');
    assert.deepEqual(codes(money), []);
    const bare = parseChallengeStart('正文\n[igs-challenge:和解|魅力|艰难|关系]');
    assert.equal(bare.start.stake, '压力');
    assert.equal(bare.start.requestedStake, '关系');
    assert.deepEqual(codes(bare), ['challenge-stake-degraded']);
    assert.equal(parseChallengeStart('正文\n[igs-challenge:和解|魅力|艰难|关系|小雪]', { present: ['小雪'] }).start.stake, '关系');
    const away = parseChallengeStart('正文\n[igs-challenge:和解|魅力|艰难|关系|小雪]', { present: ['阿梅'] });
    assert.equal(away.start.stake, '压力');
    assert.deepEqual(codes(away), ['challenge-counterpart-ignored', 'challenge-stake-degraded']);
    assert.equal(parseChallengeStart('正文\n[igs-challenge:和解|魅力|艰难|金钱]', { enabledStakes: ['压力', '体力'] }).start.stake, '压力');
});

test('对方不在场或过长时忽略，只在给出在场名单时核对', () => {
    const text = '正文\n[igs-challenge:和解|魅力|普通|压力|小雪]';
    assert.equal(parseChallengeStart(text).start.counterpart, '小雪');
    assert.equal(parseChallengeStart(text, { present: ['小雪'] }).start.counterpart, '小雪');
    const absent = parseChallengeStart(text, { present: ['阿梅'] });
    assert.equal(absent.start.counterpart, '');
    assert.deepEqual(codes(absent), ['challenge-counterpart-ignored']);
});

test('额度不通过时标签被忽略并记额度诊断', () => {
    const result = parseChallengeStart('正文\n[igs-challenge:终面]', { quota: { ok: false, reason: 'cooldown' } });
    assert.equal(result.start, null);
    assert.deepEqual(codes(result), ['challenge-quota']);
    assert.ok(parseChallengeStart('正文\n[igs-challenge:终面]', { quota: { ok: true } }).start);
});

test('全角分隔符可用，且与开战标签互不干扰', () => {
    assert.equal(parseChallengeStart('正文\n[igs-challenge:终面｜话术｜轻松]').start.tier, '轻松');
    const combatLast = '[igs-challenge:早面|话术]\n拔出剑来。\n[igs-combat:start|路口|野狗*2||普通]';
    assert.equal(extractCombatStart(combatLast).start.encounter, '路口');
    const challengeLast = '[igs-combat:start|路口|野狗*2||普通]\n事后。\n[igs-challenge:终面]';
    assert.equal(parseChallengeStart(challengeLast).start.event, '终面');
    assert.equal(parseChallengeStart(combatLast).start, null);
});
