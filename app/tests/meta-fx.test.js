import test from 'node:test';
import assert from 'node:assert/strict';
import {
    META_DEFAULT_LINES,
    buildMetaDigestRule,
    isBackReading,
    isFurther,
    normalizeMetaBirthday,
    normalizeMetaFxSettings,
    pickMetaLine,
    pokeLevel,
    resolveGreeting,
    summarizeMetaEvents,
    trackPageTurns,
} from '../src/visual/igs-ui/meta-settings.js';
import {
    beginMetaDigestSend,
    clearMetaDigest,
    finishMetaDigestSend,
    pendingMetaDigest,
    recordMetaEvent,
    resolveMetaDigestRule,
} from '../src/visual/igs-ui/meta-digest.js';
import { FX_SETTINGS_NORMALIZERS } from '../src/visual/igs-ui/fx-settings.js';
import { renderPerformanceSettings } from '../src/visual/igs-ui/performance-settings-layout.js';
import { PERFORMANCE_FEATURES } from '../src/visual/igs-ui/performance-presets.js';

test('meta 设置默认总开关关闭，子开关默认开、摘要默认关', () => {
    const s = normalizeMetaFxSettings(undefined);
    assert.equal(s.enabled, false);
    assert.equal(s.poke && s.hover && s.reading && s.clock && s.festivals, true);
    assert.equal(s.digest, false);
    assert.equal(s.cooldownSec, 4);
    assert.equal(normalizeMetaFxSettings({ cooldownSec: 5 }).cooldownSec, 4);
    assert.equal(FX_SETTINGS_NORMALIZERS.metaFx, normalizeMetaFxSettings);
    assert.equal(PERFORMANCE_FEATURES.some((f) => f.key === 'metaFx'), false);
});

test('生日多种写法统一成 MM-DD，非法返回空', () => {
    assert.equal(normalizeMetaBirthday('3-5'), '03-05');
    assert.equal(normalizeMetaBirthday('03/05'), '03-05');
    assert.equal(normalizeMetaBirthday('3月5日'), '03-05');
    assert.equal(normalizeMetaBirthday('13-01'), '');
    assert.equal(normalizeMetaBirthday('abc'), '');
});

test('台词池：角色 → 通用 → 内置，占位符替换', () => {
    const settings = normalizeMetaFxSettings({ lines: { '*': { skip: ['通用'] }, 爱丽丝: { skip: ['角色'] }, 空角色: {} } });
    assert.deepEqual(Object.keys(settings.lines), ['*', '爱丽丝', '空角色']);
    assert.equal(pickMetaLine(settings, '爱丽丝', 'skip', () => 0), '角色');
    assert.equal(pickMetaLine(settings, '鲍勃', 'skip', () => 0), '通用');
    assert.equal(pickMetaLine(settings, '鲍勃', 'idle', () => 0), META_DEFAULT_LINES.idle[0]);
    assert.equal(pickMetaLine(settings, '', 'greetFestival', () => 0, { 节日: '七夕' }), '七夕快乐！');
});

test('连戳升级与连翻判定', () => {
    assert.deepEqual([1, 2, 3, 4, 9].map(pokeLevel), [1, 2, 2, 3, 3]);
    let stamps = [];
    let skipping = false;
    for (let i = 0; i < 8; i += 1) ({ stamps, skipping } = trackPageTurns(stamps, 1000 + i * 500));
    assert.equal(skipping, true);
    assert.equal(trackPageTurns([0, 100], 6000).skipping, false);
    assert.equal(trackPageTurns([0, 100], 6000).stamps.length, 1);
});

test('回翻：同楼层少 10 页以上或翻回更早楼层', () => {
    const far = { messageId: 5, index: 20 };
    assert.equal(isBackReading(far, { messageId: 5, index: 10 }), true);
    assert.equal(isBackReading(far, { messageId: 5, index: 11 }), false);
    assert.equal(isBackReading(far, { messageId: 3, index: 30 }), true);
    assert.equal(isFurther(far, { messageId: 6, index: 0 }), true);
    assert.equal(isFurther(far, { messageId: 5, index: 19 }), false);
});

test('问候优先级：生日 > 节日 > 久别 > 深夜 > 早上', () => {
    const at = (m, d, h) => new Date(2026, m - 1, d, h, 0, 0);
    const base = { enabled: true, birthday: '09-30' };
    assert.equal(resolveGreeting(base, { now: at(9, 30, 2) }).kind, 'greetBirthday');
    const xmas = resolveGreeting({ enabled: true }, { now: at(12, 25, 2) });
    assert.deepEqual(xmas, { kind: 'greetFestival', vars: { 节日: '圣诞节' } });
    assert.notEqual((resolveGreeting({ enabled: true }, { now: at(12, 25, 2), ancient: true }) || {}).kind, 'greetFestival');
    assert.equal(resolveGreeting({ festivals: false }, { now: at(12, 25, 2) }).kind, 'greetNight');
    const now = at(9, 20, 14);
    assert.equal(resolveGreeting({}, { now, lastSeen: now.getTime() - 4 * 86400000 }).kind, 'greetAway');
    assert.equal(resolveGreeting({}, { now: at(9, 20, 8) }).kind, 'greetMorning');
    assert.equal(resolveGreeting({}, { now }), null);
});

test('交互摘要：按类合并、深夜时刻、长度上限', () => {
    const text = summarizeMetaEvents([
        { type: 'poke', character: '爱丽丝', hour: 2 },
        { type: 'poke', character: '爱丽丝', hour: 2 },
        { type: 'back', character: '爱丽丝', hour: 14 },
    ]);
    assert.equal(text, '玩家戳了爱丽丝的头 2 次；玩家回头翻看了之前的剧情；现实中已是深夜 2 点');
    assert.ok(summarizeMetaEvents(Array.from({ length: 30 }, (_, i) => ({ type: 'poke', character: `角色${i}` }))).length <= 80);
    assert.equal(summarizeMetaEvents([]), '');
    assert.equal(buildMetaDigestRule(''), '');
});

test('交互摘要暂存：只清掉生成开始前已送出的事件', () => {
    clearMetaDigest();
    const on = { enabled: true, digest: true };
    assert.equal(resolveMetaDigestRule(on), '');
    recordMetaEvent({ type: 'skip' });
    assert.match(resolveMetaDigestRule(on), /飞快地跳过/);
    assert.equal(resolveMetaDigestRule({ enabled: true }), '');
    beginMetaDigestSend();
    recordMetaEvent({ type: 'idle' });
    finishMetaDigestSend();
    assert.equal(pendingMetaDigest(), '玩家有好一阵没有动静');
    clearMetaDigest();
    assert.equal(pendingMetaDigest(), '');
});

test('演出页有独立的 Meta 互动卡片，关闭时只显示总开关', () => {
    const off = renderPerformanceSettings({});
    assert.match(off, /data-advanced="perf-group-rhythm"/);
    assert.match(off, /data-switch="readerSettings\.metaFx\.enabled"/);
    assert.doesNotMatch(off, /metaFx\.poke/);
    const on = renderPerformanceSettings({ metaFx: { enabled: true, digest: true } });
    assert.match(on, /metaFx\.poke/);
    assert.match(on, /data-action="meta-scope-add"/);
    assert.match(on, /当前待送出/);
});
