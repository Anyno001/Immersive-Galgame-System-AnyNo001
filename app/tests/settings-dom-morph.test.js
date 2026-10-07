import test from 'node:test';
import assert from 'node:assert/strict';
import { canMorph, morphFragment } from '../src/visual/igs-ui/settings-dom-morph.js';

// 够用的最小 DOM：元素有属性和有序子节点，文本节点有 nodeValue；select / input / textarea 带表单值。
function el(tag, attrs = {}, children = []) {
    const node = {
        nodeType: 1, nodeName: tag.toUpperCase(), attrs: { ...attrs }, kids: [], parentNode: null,
        get id() { return this.attrs.id || ''; },
        get attributes() { return Object.entries(this.attrs).map(([name, value]) => ({ name, value })); },
        getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; },
        setAttribute(name, value) { this.attrs[name] = String(value); node.writes += 1; },
        removeAttribute(name) { delete this.attrs[name]; node.writes += 1; },
        hasAttribute(name) { return Object.hasOwn(this.attrs, name); },
        get firstChild() { return this.kids[0] || null; },
        get nextSibling() { const s = this.parentNode && this.parentNode.kids; return s ? s[s.indexOf(this) + 1] || null : null; },
        insertBefore(child, ref) {
            if (child.parentNode) child.parentNode.kids.splice(child.parentNode.kids.indexOf(child), 1);
            const at = ref ? this.kids.indexOf(ref) : this.kids.length;
            this.kids.splice(at < 0 ? this.kids.length : at, 0, child);
            child.parentNode = this;
            return child;
        },
        removeChild(child) { this.kids.splice(this.kids.indexOf(child), 1); child.parentNode = null; return child; },
        querySelectorAll(sel) { const out = []; const walk = (n) => { for (const k of n.kids || []) { if (k.nodeType === 1 && k.nodeName === sel.toUpperCase()) out.push(k); walk(k); } }; walk(this); return out; },
        get textContent() { return this.kids.map((k) => (k.nodeType === 3 ? k.nodeValue : k.textContent)).join(''); },
        writes: 0,
    };
    for (const child of children) node.insertBefore(child, null);
    return node;
}
const text = (value) => ({ nodeType: 3, nodeName: '#text', nodeValue: value, parentNode: null, get nextSibling() { const s = this.parentNode && this.parentNode.kids; return s ? s[s.indexOf(this) + 1] || null : null; } });

test('settings-dom-morph: 只改变了的属性和文字，没变的节点原样保留', () => {
    const keep = el('img', { src: 'blob:thumb-1', class: 'igs-outfit-thumb' });
    const sw = el('button', { class: 'igs-switch', 'aria-pressed': 'false' }, [text('打字机')]);
    const root = el('div', {}, [keep, sw, el('p', { id: 'old' }, [text('旧说明')])]);
    const next = el('div', {}, [
        el('img', { src: 'blob:thumb-1', class: 'igs-outfit-thumb' }),
        el('button', { class: 'igs-switch is-on', 'aria-pressed': 'true' }, [text('打字机')]),
        el('p', { id: 'new' }, [text('新说明')]),
    ]);
    morphFragment(root, next);
    assert.equal(root.kids[0], keep, '缩略图节点没换，不会重新解码');
    assert.equal(keep.writes, 0);
    assert.equal(root.kids[1], sw, '开关还是原来那个节点');
    assert.equal(sw.getAttribute('aria-pressed'), 'true');
    assert.equal(sw.getAttribute('class'), 'igs-switch is-on');
    assert.equal(root.kids[2].getAttribute('id'), 'new', 'id 不同的按新节点换');
    assert.equal(root.kids[2].textContent, '新说明');
    assert.equal(root.kids.length, 3);
});

test('settings-dom-morph: 表单值以新 HTML 为准，正在输入的那个不动；多出来的节点删掉', () => {
    const typing = el('input', { value: 'a' });
    typing.type = 'text'; typing.value = '用户正在打的字';
    const other = el('input', { value: 'old' });
    other.type = 'text'; other.value = 'old';
    const select = el('select', {}, [el('option', { value: '1' }), el('option', { value: '2' })]);
    select.selectedIndex = 0;
    const area = el('textarea', {}, [text('旧')]);
    area.value = '旧';
    const root = el('div', {}, [typing, other, select, area, el('span', {}, [text('多余')])]);
    const nextTyping = el('input', { value: 'b' }); nextTyping.type = 'text';
    const nextOther = el('input', { value: '重置后的值' }); nextOther.type = 'text';
    const next = el('div', {}, [nextTyping, nextOther, el('select', {}, [el('option', { value: '1' }), el('option', { value: '2', selected: '' })]), el('textarea', {}, [text('新提示词')])]);
    morphFragment(root, next, typing);
    assert.equal(typing.value, '用户正在打的字');
    assert.equal(other.value, '重置后的值');
    assert.equal(select.selectedIndex, 1);
    assert.equal(area.value, '新提示词');
    assert.equal(root.kids.length, 4);
    assert.equal(canMorph(root), false, '没有 <template> 的假 DOM 退回整块 innerHTML');
});
