import test from 'node:test';
import assert from 'node:assert/strict';
import { ankeCocPlay, ankeCocValueOf, ankeFillLine, ankeOutcomeOf } from '../src/visual/igs-ui/forum-anke-play.js';

test('安科检定：lock.value 冻结后渲染和结算都读它，改档不影响', () => {
    const anke = { kind: 'coc', actor: '主角', skill: '侦查', value: 40, level: '普通' };
    assert.equal(ankeCocValueOf(anke, null), 40);
    const lock = { kind: 'coc', die: 55, value: 60, tier: '成功' };
    const later = { ...anke, value: 30 };
    assert.equal(ankeCocValueOf(later, lock), 60);
    assert.match(ankeFillLine(later, lock), /技能60/);
    assert.equal(ankeOutcomeOf(later, lock).tier, '成功');
    assert.equal(ankeOutcomeOf(later, { ...lock, value: undefined }).tier, '失败');
});

test('安科检定：点数 5 以内大成功', () => {
    assert.equal(ankeCocPlay({ die: 5, value: 10 }).tier, '大成功');
    assert.equal(ankeCocPlay({ die: 6, value: 10 }).tier, '成功');
});
