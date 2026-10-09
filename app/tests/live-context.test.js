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

test('live-context: 本楼写了 live 标签就不再按词兜底', () => {
    const source = '[igs-fx:live|阿梓|唱歌|观看]阿梓开播了。';
    const directives = withLiveFallback(extractFxDirectives(source), source, null, fallback);
    assert.equal(directives.filter((d) => d.kind === 'live').length, 1);
    assert.equal(resolveFxAtPage(directives, source.length - 1).live.name, '阿梓');
});

test('live-context: 上一楼未下播的直播跨楼继承，本楼下播后收起', () => {
    const carried = resolveLiveContextFromHistory([
        { isUser: true, text: '继续和观众聊天' },
        { isUser: false, text: '小明开直播了，弹幕很热闹。' },
    ], fallback);
    assert.deepEqual(carried, { name: '小明', title: '小明的直播间', view: 'host' });
    const source = '观众在刷礼物。最后小明关了直播。';
    const directives = withLiveFallback(extractFxDirectives(source), source, carried, fallback);
    assert.equal(resolveFxAtPage(directives, 0).live.name, '小明');
    assert.equal(resolveFxAtPage(directives, source.length - 1).live, null);
});

test('live-context: 用户输入里的开直播也算，连续多楼不提直播视为已下播', () => {
    assert.ok(resolveLiveContextFromHistory([{ isUser: true, text: '我要开直播' }], fallback));
    const quiet = [1, 2, 3].map(() => ({ isUser: false, text: '他们去吃饭了。' }));
    assert.equal(resolveLiveContextFromHistory([...quiet, { isUser: false, text: '小明开播了。' }], fallback), null);
    assert.equal(readLiveCarry('[igs-fx:live-end]', fallback).live, null);
});
