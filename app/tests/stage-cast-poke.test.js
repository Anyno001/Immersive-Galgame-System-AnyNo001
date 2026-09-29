import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMetaFx, closeMetaFx } from '../src/visual/igs-ui/meta-runtime.js';
import { META_POKE_PAGE_MAX } from '../src/visual/igs-ui/meta-settings.js';
import { clearMetaDigest, pendingMetaDigest } from '../src/visual/igs-ui/meta-digest.js';

class FakeNode {
    constructor(doc, tag) {
        this.ownerDocument = doc;
        this.tagName = tag;
        this.children = [];
        this.parentNode = null;
        this.attrs = new Map();
        this.listeners = {};
        this.animations = [];
        this.id = '';
        this.className = '';
        this.textContent = '';
        this.innerHTML = '';
        const props = new Map();
        this.style = {
            setProperty(k, v) { props.set(k, String(v)); },
            removeProperty(k) { props.delete(k); },
            getPropertyValue(k) { return props.get(k) || ''; },
        };
        const node = this;
        this.classList = {
            add(name) { if (!node.classes().includes(name)) node.className = `${node.className} ${name}`.trim(); },
            remove(name) { node.className = node.classes().filter((c) => c !== name).join(' '); },
            contains(name) { return node.classes().includes(name); },
            toggle(name, force) {
                const on = force === undefined ? !node.classes().includes(name) : Boolean(force);
                if (on) this.add(name); else this.remove(name);
                return on;
            },
        };
    }
    classes() { return this.className.split(/\s+/).filter(Boolean); }
    get firstChild() { return this.children[0] || null; }
    get nextSibling() {
        const list = this.parentNode ? this.parentNode.children : [];
        return list[list.indexOf(this) + 1] || null;
    }
    appendChild(child) { return this.insertBefore(child, null); }
    insertBefore(child, ref) {
        child.remove();
        const index = ref ? this.children.indexOf(ref) : -1;
        if (index < 0) this.children.push(child); else this.children.splice(index, 0, child);
        child.parentNode = this;
        return child;
    }
    removeChild(child) { child.remove(); return child; }
    remove() {
        if (!this.parentNode) return;
        this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
        this.parentNode = null;
    }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); }
    removeAttribute(k) { this.attrs.delete(k); }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    animate(frames, opts) { const a = { frames, opts, cancel() {} }; this.animations.push(a); return a; }
    // 只支持 #id；后代选择器（如 '#igs-dialog-layer .igs-dialog'）返回 null。
    querySelector(selector) {
        if (!selector.startsWith('#') || selector.includes(' ')) return null;
        const want = selector.slice(1);
        const walk = (n) => {
            for (const c of n.children) {
                if (c.id === want) return c;
                const hit = walk(c);
                if (hit) return hit;
            }
            return null;
        };
        return walk(this);
    }
}

const HEAD = { x: 0.5, top: 0.05, w: 0.3, aspect: 2 };

function makeStage() {
    const doc = { createElement: (tag) => new FakeNode(doc, tag) };
    const root = new FakeNode(doc, 'div');
    const motion = root.appendChild(new FakeNode(doc, 'div'));
    motion.id = 'igs-stage-motion';
    motion.clientWidth = 1280;
    motion.clientHeight = 720;
    for (const id of ['igs-bg', 'igs-cast', 'igs-sprite', 'igs-click-layer', 'igs-dialog-layer']) {
        const el = motion.appendChild(new FakeNode(doc, 'div'));
        el.id = id;
    }
    const castLayer = motion.querySelector('#igs-cast');
    const bobEl = castLayer.appendChild(new FakeNode(doc, 'div'));
    bobEl.setAttribute('data-igs-cast-char', 'Bob');
    return { root, motion, bobEl };
}

function snap(readerSettings, index = 0) {
    return { messageId: 9, content: { currentIndex: index, textType: 'dialogue', speaker: 'Alice', spriteCharacter: 'Alice' }, readerSettings };
}

const META = { enabled: true, poke: true, hover: false, reading: false, clock: false, digest: true };
const ON = { metaFx: META, stageCast: { enabled: true, castReact: true } };
const CTX = {
    reducedMotion: false,
    sprite: { url: '/alice.png', posX: 82, posY: 100, scale: 40, head: HEAD },
    cast: [{ character: 'Bob', url: '/bob.png', posX: 18, posY: 100, scale: 40, head: HEAD }],
};
const click = (el) => el.listeners.click({ stopPropagation() {}, preventDefault() {} });

function hotsOf(motion) {
    const front = motion.querySelector('#igs-fx-front');
    const list = front ? front.children.filter((c) => c.classList.contains('igs-meta-hot')) : [];
    return { speaker: list.find((c) => !c.hasAttribute('data-igs-meta-cast')) || null, bob: list.find((c) => c.getAttribute('data-igs-meta-cast') === 'Bob') || null };
}

test('gate: meta poke counts per character', () => {
    clearMetaDigest();
    const s = makeStage();
    const result = applyMetaFx(s.root, snap(ON), CTX);
    assert.equal(result.castHots, 1);
    const hots = hotsOf(s.motion);
    assert.ok(hots.speaker && hots.bob);
    // 陪衬热区落在陪衬头部（左侧），与说话人热区（右侧）分开。
    assert.ok(parseFloat(hots.bob.style.left) < parseFloat(hots.speaker.style.left));
    for (let i = 0; i < META_POKE_PAGE_MAX + 2; i += 1) click(hots.bob);
    // 压扁只作用于陪衬元素（叠加合成），不动整个舞台。
    assert.equal(s.bobEl.animations.length, META_POKE_PAGE_MAX);
    assert.equal(s.bobEl.animations[0].opts.composite, 'add');
    assert.equal(s.motion.getAttribute('data-igs-meta-poke'), null);
    // 陪衬戳满只让它自己的热区失效；说话人仍可戳。
    assert.equal(hots.bob.classList.contains('is-spent'), true);
    assert.equal(hots.speaker.classList.contains('is-spent'), false);
    click(hots.speaker);
    assert.equal(s.motion.getAttribute('data-igs-meta-poke'), 'in');
    // 交互摘要带被戳的角色。
    assert.match(pendingMetaDigest(), /Bob/);
    // 翻页后计数清零。
    applyMetaFx(s.root, snap(ON, 1), CTX);
    assert.equal(hotsOf(s.motion).bob.classList.contains('is-spent'), false);
    closeMetaFx(s.root);
    clearMetaDigest();
});

test('gate: meta cast hotspots only with stageCast castReact on', () => {
    const s = makeStage();
    const off = applyMetaFx(s.root, snap({ metaFx: META, stageCast: { enabled: true } }), CTX);
    assert.equal(off.castHots, 0);
    assert.equal(hotsOf(s.motion).bob, null);
    assert.ok(hotsOf(s.motion).speaker);
    // 开关从开到关：已有的陪衬热区被移除。
    applyMetaFx(s.root, snap(ON), CTX);
    assert.ok(hotsOf(s.motion).bob);
    applyMetaFx(s.root, snap({ metaFx: META, stageCast: { enabled: true, castReact: false } }), CTX);
    assert.equal(hotsOf(s.motion).bob, null);
    closeMetaFx(s.root);
});
