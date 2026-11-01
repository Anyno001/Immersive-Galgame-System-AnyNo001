import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWaitStageModel, createWaitStageRuntime } from '../src/visual/igs-ui/wait-stage-runtime.js';
import { FakeEl } from './helpers/fake-dom.js';

test('gate:wait-stage:fullscreen-wait-has-a-close-button-embedded-does-not', () => {
    const doc = { createElement(tag) { return new FakeEl(doc, tag); } };
    let closed = 0;
    const runtime = createWaitStageRuntime({ doc, random: () => 0, onClose: () => { closed += 1; } });
    const root = runtime.open(doc.createElement('div'), { model: buildWaitStageModel({ random: () => 0 }) });
    const button = root.querySelector('[data-igs-waitstage-close]');
    assert.ok(button, '全屏等待层右上角有关闭键');
    assert.equal(button.getAttribute('aria-label'), '关闭');
    button.fire('click');
    assert.equal(closed, 1, '点了就交给宿主关阅读器');
    const embedded = runtime.open(doc.createElement('div'), { embedded: true, model: buildWaitStageModel({ random: () => 0 }) });
    assert.equal(embedded.querySelector('[data-igs-waitstage-close]'), null, '内嵌模式酒馆本来就看得见，不加');
    runtime.close();
});

test('gate:wait-stage:play-mode-close-folds-the-layer-not-the-reader', () => {
    const doc = { createElement(tag) { return new FakeEl(doc, tag); } };
    let closed = 0;
    const runtime = createWaitStageRuntime({ doc, random: () => 0, onClose: () => { closed += 1; } });
    const root = runtime.open(doc.createElement('div'), { play: true, model: buildWaitStageModel({ random: () => 0 }) });
    assert.equal(runtime.isPlaying(), true);
    root.querySelector('[data-igs-waitstage-close]').fire('click');
    assert.equal(closed, 0, '主动来玩时点关闭不关阅读器');
    assert.equal(runtime.isPlaying(), false, '只收起小游戏层');
    assert.equal(runtime.isOpen(), false);
});

test('等待页菜单：纯三点和内嵌也保留入口，已关闭层的按钮不再触发', () => {
    const doc = { createElement(tag) { return new FakeEl(doc, tag); } };
    const calls = [];
    const runtime = createWaitStageRuntime({ doc,
        onSettings: (root) => calls.push(['settings', root]),
        onDirectory: (root) => calls.push(['directory', root]),
    });
    const root = runtime.open(doc.createElement('div'), { embedded: true, settings: { enabled: false } });
    const settings = root.querySelector('[data-igs-waitstage-settings]');
    assert.equal(settings.getAttribute('aria-label'), '设置');
    assert.equal(root.querySelector('[data-igs-waitstage-directory]').getAttribute('aria-label'), '目录');
    settings.fire('click');
    root.querySelector('[data-igs-waitstage-directory]').fire('click');
    assert.deepEqual(calls, [['settings', root], ['directory', root]]);
    runtime.close();
    settings.fire('click');
    assert.equal(calls.length, 2);
});
