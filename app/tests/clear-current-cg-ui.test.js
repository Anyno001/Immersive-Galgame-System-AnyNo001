import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORIGINAL_READER_ICONS,
  ORIGINAL_READER_TOOLBAR_BUTTONS,
} from '../src/visual/igs-ui/original-reader-source.js';
import { applyToolbarState, createReaderButton } from '../src/visual/igs-ui/reader-dom-render.js';

test('真实阅读器工具栏定义暴露清扫当前 CG 动作', () => {
  const button = ORIGINAL_READER_TOOLBAR_BUTTONS.find(({ id }) => id === 'clear-cg');

  assert.ok(button);
  assert.equal(button.title, '清扫当前 CG');
  assert.equal(button.html, ORIGINAL_READER_ICONS.clearCg);
  assert.match(button.html, /^<svg\b/);
});

test('动态阅读器按钮生成清扫动作和可访问名称', () => {
  const attributes = new Map();
  const element = {
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
  };
  const doc = {
    createElement(tagName) {
      assert.equal(tagName, 'button');
      return element;
    },
  };

  const button = createReaderButton(doc, 'clear-cg', '清扫当前 CG', ORIGINAL_READER_ICONS.clearCg);

  assert.equal(button.id, 'igs-btn-clear-cg');
  assert.equal(button.type, 'button');
  assert.equal(attributes.get('data-act'), 'clear-cg');
  assert.equal(attributes.get('title'), '清扫当前 CG');
  assert.equal(attributes.get('aria-label'), '清扫当前 CG');
  assert.equal(button.innerHTML, ORIGINAL_READER_ICONS.clearCg);
});

test('清扫当前 CG 按钮仅在当前 CG 可用时启用', () => {
  const attributes = new Map();
  const clearButton = {
    disabled: false,
    style: {},
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
  };
  const root = {
    classList: {
      contains: () => false,
      toggle: () => {},
    },
    querySelector(selector) {
      return selector === '#igs-btn-clear-cg' ? clearButton : null;
    },
  };

  applyToolbarState(root, {
    toolbarCollapsed: true,
    snapshot: { content: {}, readerSettings: {} },
  });
  assert.equal(clearButton.disabled, true);
  assert.equal(attributes.get('aria-disabled'), 'true');

  applyToolbarState(root, {
    toolbarCollapsed: true,
    snapshot: {
      content: { illustrationActive: true, illustrationUrl: 'blob:current-cg' },
      readerSettings: {},
    },
  });
  assert.equal(clearButton.disabled, false);
  assert.equal(attributes.get('aria-disabled'), 'false');
});
