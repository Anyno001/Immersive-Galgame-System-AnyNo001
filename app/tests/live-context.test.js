import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { liveCueDirectives, liveFallbackOf, readLiveCarry, resolveLiveContextFromHistory, withLiveFallback } from '../src/scene/live-context.js';

const fallback = liveFallbackOf('小明');

test('live-context: 没写 live 标签时按开播 / 下播词兜底，主播默认是玩家本人', () => {
    const source = '小明深吸一口气，打开了直播间。弹幕刷了起来。过了一会，他下播了。';
    const directives = withLiveFallback(extractFxDirectives(source), source, null, fallback);
    const before = resolveFxAtPage(directives, source.indexOf('深吸'));
    const during = resolveFxAtPage(directives, source.indexOf('弹幕'));
    const after = resolveFxAtPage(directives, source.length - 2);
    assert.equal(before.live, null);
    assert.deepEqual(during.live, { name: '小明', title: '小明的直播间', view: 'host' });
    assert.equal(after.live, null);
});

test('live-context: 否定词与单纯提到直播不触发', () => {
    assert.deepEqual(liveCueDirectives('他今天没开播，只是在看别人的直播。', fallback), []);
});
