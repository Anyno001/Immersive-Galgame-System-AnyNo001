import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_SHORTCUTS,
    eventToShortcut,
    findShortcutConflicts,
    findShortcutAction,
    normalizeShortcutOverrides,
    resolveShortcuts,
    shortcutLabel,
} from '../src/visual/igs-ui/reader-shortcuts.js';

test('默认快捷键不占浏览器常见组合，实验功能不占默认键但可自行绑定', async () => {
    const shortcuts = resolveShortcuts({});
    for (const values of Object.values(shortcuts)) {
        assert.equal(values.some((value) => /^(Ctrl|Alt|Meta)\+/.test(value)), false);
        assert.equal(values.some((value) => /^F(?:[1-9]|1[0-2])$/.test(value)), false);
    }
    assert.deepEqual(shortcuts['live2d-settings'], []);
    assert.deepEqual(resolveShortcuts({ 'live2d-settings': ['Shift+KeyD'] })['live2d-settings'], ['Shift+KeyD']);
});

test('快捷键覆盖、清空和非法动作过滤', async () => {
    const normalized = normalizeShortcutOverrides({ next: ['Shift+KeyN', 'Shift+KeyN', 'bad'], nope: ['KeyX'], prev: [] });
    assert.deepEqual(normalized, { next: ['Shift+KeyN'], prev: [] });
    const resolved = resolveShortcuts(normalized);
    assert.deepEqual(resolved.next, ['Shift+KeyN']);
    assert.deepEqual(resolved.prev, []);
});

test('事件转组合键和动作查找', async () => {
    assert.equal(eventToShortcut({ code: 'KeyG', shiftKey: true }), 'Shift+KeyG');
    assert.equal(eventToShortcut({ code: 'ArrowRight', shiftKey: false }), 'ArrowRight');
    assert.equal(eventToShortcut({ code: 'Shift', shiftKey: true }), '');
    assert.equal(eventToShortcut({ code: 'KeyG', isComposing: true }), '');
    assert.equal(findShortcutAction(resolveShortcuts({}), 'ArrowRight'), 'next');
    assert.equal(shortcutLabel('Shift+ArrowLeft'), 'Shift+←');
});

test('快捷键冲突检查只标记栏目内撞键的动作', async () => {
    assert.deepEqual(findShortcutConflicts(resolveShortcuts({})), {});
    const conflicts = findShortcutConflicts(resolveShortcuts({ save: ['KeyS'] }));
    assert.deepEqual(conflicts, { 'quick-save': ['save'], save: ['quick-save'] });
    const triple = findShortcutConflicts(resolveShortcuts({ save: ['KeyH'], 'sprite-edit': ['KeyH'] }));
    assert.deepEqual(triple.hide.sort(), ['save', 'sprite-edit']);
    assert.equal(findShortcutConflicts(resolveShortcuts({ prev: [] })).prev, undefined);
});

test('设置页冲突提示与说明文字', async () => {
    const { renderShortcutSettings } = await import('../src/visual/igs-ui/settings-fields.js');
    const pc = { matchMedia: () => ({ matches: true }) };
    const clean = renderShortcutSettings({}, pc);
    assert.ok(clean.includes('仅电脑端生效。'));
    assert.equal(clean.includes('不做快捷键冲突检查'), false);
    assert.equal(clean.includes('is-conflict'), false);
    const clashed = renderShortcutSettings({ save: ['KeyS'] }, pc);
    assert.ok(clashed.includes('is-conflict'));
    assert.ok(clashed.includes('与「快速存档」冲突'));
    assert.ok(clashed.includes('有2个动作的快捷键冲突'));
    assert.equal(renderShortcutSettings({}, { matchMedia: () => ({ matches: false }) }), '');
});
