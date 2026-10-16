import test from 'node:test';
import assert from 'node:assert/strict';
import {
    STATUS_HUD_DEFAULTS, STATUS_HUD_PHONE_MEDIA, normalizeStatusHudPosition, normalizeStatusHudSettings,
} from '../src/data/shujuku/status-hud-model.js';
import { applyStatusHudPosition } from '../src/visual/igs-ui/reader-dom-render.js';
import { getOriginalReaderStyleText } from '../src/visual/igs-ui/original-reader-source.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { settingsSectionPaths } from '../src/visual/igs-ui/settings-sections.js';
import { searchSettings } from '../src/visual/igs-ui/settings-search.js';
import {
    describeStatusHudAxis, previewStatusHudPosition, renderStatusHudPositionField, statusHudPositionDevice,
} from '../src/visual/igs-ui/status-hud-position-fields.js';

test('gate:status-hud-position:normalize-defaults-clamp-and-round', () => {
    const origin = { pc: { x: 0, y: 0 }, mobile: { x: 0, y: 0 } };
    assert.deepEqual(normalizeStatusHudSettings(null).position, origin);
    assert.deepEqual(STATUS_HUD_DEFAULTS.position, origin);
    assert.deepEqual(normalizeStatusHudPosition({ pc: { x: '37.6', y: 120 }, mobile: { x: -5, y: 'abc' } }), { pc: { x: 38, y: 100 }, mobile: { x: 0, y: 0 } });
    assert.deepEqual(normalizeStatusHudPosition([1, 2]), origin);
    assert.deepEqual(normalizeStatusHudPosition({ tablet: { x: 50 }, pc: 'top' }), origin);
    assert.equal(normalizeSettingsValue('readerSettings.statusHud.position.mobile.y', '64.4'), 64);
    assert.equal(normalizeSettingsValue('readerSettings.statusHud.position.pc.x', '300'), 100);
    assert.ok(settingsSectionPaths('reader-interface-status-hud').includes('readerSettings.statusHud.position'), '「重置本组」连位置一起恢复');
});

function fakeHost() {
    const attrs = new Map();
    const props = new Map();
    return {
        attrs,
        props,
        setAttribute: (name, value) => attrs.set(name, String(value)),
        removeAttribute: (name) => attrs.delete(name),
        hasAttribute: (name) => attrs.has(name),
        style: {
            setProperty: (name, value) => props.set(name, String(value)),
            getPropertyValue: (name) => props.get(name) || '',
            removeProperty: (name) => props.delete(name),
        },
    };
}

test('gate:status-hud-position:reader-writes-css-variables-only-when-moved', () => {
    const host = fakeHost();
    applyStatusHudPosition(host, { pc: { x: 0, y: 0 } });
    assert.equal(host.attrs.has('data-igs-hud-pos'), false, '两份都在左上角时不挂属性，样式和改版前一致');
    assert.equal(host.props.size, 0);
    applyStatusHudPosition(host, { pc: { x: 100, y: 25 }, mobile: { y: 80 } });
    assert.equal(host.attrs.get('data-igs-hud-pos'), '');
    assert.deepEqual(Object.fromEntries(host.props), { '--igs-hud-x': '100', '--igs-hud-y': '25', '--igs-hud-mx': '0', '--igs-hud-my': '80' });
    applyStatusHudPosition(host, null);
    assert.equal(host.attrs.has('data-igs-hud-pos'), false);
    assert.equal(host.props.size, 0);
});

test('gate:status-hud-position:reader-css-moves-custom-positions-below-toolbar', () => {
    const css = getOriginalReaderStyleText();
    assert.match(css, /#igs-status-hud\{position:absolute;z-index:8;top:14px;left:14px;/, '默认规则不动');
    const rule = css.match(/#igs-overlay #igs-status-hud\[data-igs-hud-pos\]\{([^}]*)\}/);
    assert.ok(rule, '挪过位置才套用的规则');
    // 工具栏层是 7：挪到右上角时工具栏按钮仍在状态栏上面，点得到设置和关闭。
    assert.match(rule[1], /z-index:6;/);
    assert.match(rule[1], /top:calc\(14px \+ \(100% - 28px\) \* var\(--igs-hud-py\) \/ 100\)/);
    assert.match(rule[1], /left:calc\(var\(--igs-hud-edge-x,14px\) \+ \(100% - var\(--igs-hud-edge-x,14px\) \* 2\) \* var\(--igs-hud-px\) \/ 100\)/);
    assert.match(rule[1], /transform:translate\(calc\(var\(--igs-hud-px\) \* -1%\),calc\(var\(--igs-hud-py\) \* -1%\)\)/);
    assert.ok(css.includes(`@media ${STATUS_HUD_PHONE_MEDIA}{#igs-overlay #igs-status-hud[data-igs-hud-pos]{--igs-hud-px:var(--igs-hud-mx,0);--igs-hud-py:var(--igs-hud-my,0);}}`));
    assert.match(css, /#igs-overlay\.igs-mode-embedded #igs-status-hud\{[^}]*--igs-hud-edge-x:12px;/);
    const shrink = css.indexOf('#igs-overlay #igs-status-hud[data-igs-hud-pos].igs-hud-no-metrics{width:max-content;}');
    const collapsed = css.indexOf('#igs-overlay #igs-status-hud[data-igs-hud-pos].igs-hud-collapsed{width:calc(36px * var(--igs-hud-scale,1));height:calc(36px * var(--igs-hud-scale,1));padding:0;}');
    assert.ok(shrink > 0 && collapsed > shrink, '没有 HUD 条时按内容收窄；折叠时收成按钮大小，贴在所选的角上');
});

test('gate:status-hud-position:field-renders-chosen-device-stage-and-sliders', () => {
    const hud = normalizeStatusHudSettings({ enabled: true, size: 'large', position: { mobile: { x: 100, y: 30 } } });
    const html = renderStatusHudPositionField(hud, 'mobile', 'pc');
    assert.match(html, /^<div class="igs-settings-field igs-hud-pos" data-hud-pos="mobile">/);
    assert.match(html, /<button type="button" class="igs-segmented-btn" data-action="status-hud-pos-device:pc"/);
    assert.match(html, /<button type="button" class="igs-segmented-btn is-active" data-action="status-hud-pos-device:mobile"/);
    assert.doesNotMatch(html, /data-segment-path/, '切换设备只改界面状态，不写设置');
    assert.match(html, /data-path="readerSettings\.statusHud\.position\.mobile\.x" data-hud-pos-axis="x" min="0" max="100" step="1" value="100"/);
    assert.match(html, /data-path="readerSettings\.statusHud\.position\.mobile\.y" data-hud-pos-axis="y" min="0" max="100" step="1" value="30"/);
    assert.match(html, /<output data-hud-pos-value="x">最右<\/output>/);
    assert.match(html, /<output data-hud-pos-value="y">30%<\/output>/);
    assert.match(html, /data-hud-pos-stage data-device="mobile" style="--igs-hp-x:100;--igs-hp-y:30;--igs-hp-w:[\d.]+%;--igs-hp-h:[\d.]+%;--igs-hp-ex:3\.59%;--igs-hp-ey:1\.66%"/);
    assert.match(html, /data-action="status-hud-pos-reset:mobile" data-hud-pos-reset>回到左上角/);
    assert.match(html, /当前设备按「电脑」这份显示/);
    assert.match(renderStatusHudPositionField(normalizeStatusHudSettings({ enabled: true }), 'pc', 'pc'), /data-hud-pos-reset disabled>/);
    // 小舞台上的状态栏按「大小」档和有没有 HUD 条换算宽度。
    const width = (settings) => Number(renderStatusHudPositionField(normalizeStatusHudSettings(settings), 'pc', 'pc').match(/--igs-hp-w:([\d.]+)%/)[1]);
    assert.ok(width({ size: 'large' }) > width({ size: 'small' }));
    assert.ok(width({ tables: [{ uid: 'a', name: '表' }] }) > width({}));
    assert.deepEqual(['x', 'y'].flatMap((axis) => [0, 50, 100, 7].map((v) => describeStatusHudAxis(axis, v))), ['最左', '居中', '最右', '7%', '最上', '居中', '最下', '7%']);
});

test('gate:status-hud-position:default-device-follows-window-unless-chosen', () => {
    const phoneWindow = { matchMedia: (query) => ({ matches: query === STATUS_HUD_PHONE_MEDIA }) };
    const desktopWindow = { matchMedia: () => ({ matches: false }) };
    assert.equal(statusHudPositionDevice({}, phoneWindow), 'mobile');
    assert.equal(statusHudPositionDevice({}, desktopWindow), 'pc');
    assert.equal(statusHudPositionDevice({ statusHudPosDevice: 'mobile' }, desktopWindow), 'mobile');
    assert.equal(statusHudPositionDevice({ statusHudPosDevice: 'tablet' }, desktopWindow), 'pc');
    assert.equal(statusHudPositionDevice(null, { matchMedia() { throw new Error('no media'); } }), 'pc');
});

test('gate:status-hud-position:drag-previews-stage-and-reset-state-only', () => {
    const stageVars = new Map();
    const stage = { style: { setProperty: (name, value) => stageVars.set(name, value) } };
    const outputs = { x: { textContent: '' }, y: { textContent: '' } };
    const reset = { disabled: true };
    const inputs = {};
    const block = {
        querySelector(selector) {
            if (selector === '[data-hud-pos-stage]') return stage;
            if (selector === '[data-hud-pos-reset]') return reset;
            const output = selector.match(/data-hud-pos-value="([xy])"/);
            if (output) return outputs[output[1]];
            const axis = selector.match(/data-hud-pos-axis="([xy])"/);
            return axis ? inputs[axis[1]] : null;
        },
    };
    const slider = (axis, value) => ({ value, getAttribute: (name) => (name === 'data-hud-pos-axis' ? axis : null), closest: () => block });
    inputs.x = slider('x', '0');
    inputs.y = slider('y', '0');
    inputs.x.value = '73';
    assert.equal(previewStatusHudPosition(inputs.x), true);
    assert.equal(stageVars.get('--igs-hp-x'), '73');
    assert.equal(outputs.x.textContent, '73%');
    assert.equal(reset.disabled, false);
    inputs.x.value = '0';
    previewStatusHudPosition(inputs.x);
    assert.equal(outputs.x.textContent, '最左');
    assert.equal(reset.disabled, true);
    inputs.y.value = '100';
    previewStatusHudPosition(inputs.y);
    assert.equal(stageVars.get('--igs-hp-y'), '100');
    assert.equal(reset.disabled, false);
    assert.equal(previewStatusHudPosition({ getAttribute: () => null }), false);
});

test('gate:status-hud-position:settings-search-finds-it', () => {
    const [first] = searchSettings('状态栏位置');
    assert.equal(first.id, 'status-hud-position');
    assert.deepEqual({ ...first.target, open: [...first.target.open] }, { tab: 'reader', readerSubTab: 'interface', open: [] });
    assert.ok(searchSettings('挡住').some((entry) => entry.id === 'status-hud-position'));
});
