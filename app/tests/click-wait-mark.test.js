import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CLICK_WAIT_MARK_GLYPHS,
    CLICK_WAIT_MARK_LABELS,
    CLICK_WAIT_MARK_SKINS,
    CLICK_WAIT_MARK_STYLES,
    CLICK_WAIT_MARK_STYLE_TEXT,
    applyClickWaitMark,
    normalizeClickWaitMarkSettings,
} from '../src/visual/igs-ui/click-wait-mark.js';

const SKINS = [
    'western-classic', 'elegant-european', 'retro-japanese', 'adventure-journey', 'plant-coffee',
    'warm-picturebook', 'day-minimal', 'black-white-manga', 'cute-pink', 'gradient-veil',
];

function fakeRoot() {
    const attrs = new Map();
    const writes = [];
    return {
        attrs,
        writes,
        getAttribute: name => (attrs.has(name) ? attrs.get(name) : null),
        setAttribute: (name, value) => { writes.push(['set', name]); attrs.set(name, String(value)); },
        removeAttribute: (name) => { writes.push(['remove', name]); attrs.delete(name); },
    };
}

test('gate: click wait settings normalize to disabled auto', () => {
    assert.deepEqual(normalizeClickWaitMarkSettings(), { enabled: false, glyph: 'auto' });
    assert.deepEqual(normalizeClickWaitMarkSettings({ enabled: 1, glyph: 'bogus' }), { enabled: false, glyph: 'auto' });
    assert.deepEqual(normalizeClickWaitMarkSettings({ enabled: true, glyph: 'heart' }), { enabled: true, glyph: 'heart' });
});

test('gate: click wait glyph list has labels for every choice', () => {
    assert.deepEqual([...CLICK_WAIT_MARK_GLYPHS], ['auto', 'diamond', 'fleuron', 'pendant', 'crescent', 'sparkle', 'strawberry', 'seal', 'triangle-brush', 'compass', 'chevron', 'leaf', 'star', 'caret', 'triangle', 'heart', 'triangle-hollow', 'blood-drop', 'ribbon', 'eye', 'reticle', 'hazard', 'bubbles', 'sword']);
    // 每个皮肤的专属符号都能在选择器里单独选到，且皮肤之间不重复。
    const skinShapes = Object.values(CLICK_WAIT_MARK_SKINS).map(mark => mark.shape);
    for (const shape of skinShapes) assert.ok(CLICK_WAIT_MARK_GLYPHS.includes(shape), shape);
    assert.equal(new Set(skinShapes).size, skinShapes.length);
    for (const id of CLICK_WAIT_MARK_GLYPHS) assert.ok(CLICK_WAIT_MARK_LABELS[id], id);
    assert.deepEqual(CLICK_WAIT_MARK_STYLES.map(item => item.id), [...CLICK_WAIT_MARK_GLYPHS]);
});

test('gate: applyClickWaitMark sets and clears root attributes idempotently', () => {
    const root = fakeRoot();
    applyClickWaitMark(root, { enabled: true });
    assert.equal(root.getAttribute('data-igs-click-wait'), 'on');
    assert.equal(root.getAttribute('data-igs-click-wait-glyph'), null);

    applyClickWaitMark(root, { enabled: true, glyph: 'leaf' });
    assert.equal(root.getAttribute('data-igs-click-wait-glyph'), 'leaf');
    const before = root.writes.length;
    applyClickWaitMark(root, { enabled: true, glyph: 'leaf' });
    assert.equal(root.writes.length, before);

    applyClickWaitMark(root, { enabled: true, glyph: 'auto' });
    assert.equal(root.getAttribute('data-igs-click-wait-glyph'), null);

    applyClickWaitMark(root, { enabled: false, glyph: 'heart' });
    assert.equal(root.attrs.size, 0);
    const cleared = root.writes.length;
    applyClickWaitMark(root, undefined);
    assert.equal(root.writes.length, cleared);
});

test('gate: applyClickWaitMark tolerates missing roots and partial fake DOM', () => {
    assert.doesNotThrow(() => applyClickWaitMark(null, { enabled: true }));
    const attrs = {};
    const partial = { setAttribute: (name, value) => { attrs[name] = value; } };
    assert.doesNotThrow(() => applyClickWaitMark(partial, { enabled: true, glyph: 'star' }));
    assert.deepEqual(attrs, { 'data-igs-click-wait': 'on', 'data-igs-click-wait-glyph': 'star' });
    assert.doesNotThrow(() => applyClickWaitMark(partial, { enabled: false }));
});

test('gate: click wait css covers every skin and glyph override', () => {
    for (const skin of SKINS) assert.ok(CLICK_WAIT_MARK_STYLE_TEXT.includes(`[data-igs-dialog-skin="${skin}"]`), skin);
    for (const glyph of CLICK_WAIT_MARK_GLYPHS.filter(id => id !== 'auto')) {
        assert.ok(CLICK_WAIT_MARK_STYLE_TEXT.includes(`[data-igs-click-wait-glyph="${glyph}"]`), glyph);
    }
    assert.match(CLICK_WAIT_MARK_STYLE_TEXT, /^#igs-overlay\{--igs-cw-mask:url\("data:image\/svg\+xml,/m);
    assert.match(CLICK_WAIT_MARK_STYLE_TEXT, /#igs-overlay\[data-igs-click-wait="on"\] #igs-text::after\{content:"";display:inline-block;/);
    assert.match(CLICK_WAIT_MARK_STYLE_TEXT, /-webkit-mask:var\(--igs-cw-mask\)/);
    // 只上下轻点：关键帧里不得出现左右位移或旋转。
    assert.doesNotMatch(CLICK_WAIT_MARK_STYLE_TEXT, /@keyframes igs-cw-[^{]*\{[^@]*(translateX|rotate)/);
    assert.match(CLICK_WAIT_MARK_STYLE_TEXT, /#igs-text\[data-igs-typewriter="running"\]::after\{opacity:0;animation:none;\}/);
    assert.match(CLICK_WAIT_MARK_STYLE_TEXT, /prefers-reduced-motion: reduce\)\{\s*#igs-overlay\[data-igs-click-wait="on"\] #igs-text::after\{animation:none!important;\}/);
    assert.match(CLICK_WAIT_MARK_STYLE_TEXT, /steps\(1,end\)/);
});

test('gate: click wait svg data uris are safely encoded', () => {
    const urls = CLICK_WAIT_MARK_STYLE_TEXT.match(/url\("[^"]*"\)/g);
    assert.ok(urls.length >= 20);
    for (const url of urls) {
        const uri = url.slice(5, -2);
        assert.doesNotMatch(uri, /[<>#"]/);
        assert.match(decodeURIComponent(uri), /^data:image\/svg\+xml,<svg xmlns='http:\/\/www\.w3\.org\/2000\/svg' viewBox='0 0 24 24'>.+<\/svg>$/);
    }
    const keyframes = [...CLICK_WAIT_MARK_STYLE_TEXT.matchAll(/@keyframes (igs-cw-[\w-]+)/g)].map(match => match[1]);
    for (const [, name] of CLICK_WAIT_MARK_STYLE_TEXT.matchAll(/--igs-cw-anim:(igs-cw-[\w-]+) /g)) assert.ok(keyframes.includes(name), name);
});
