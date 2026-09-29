// 演出层单测共用的假 DOM：够 fx-layer / fx-item / fx-battle 挂节点、查选择器、派发点击与记录立绘动画，不引入 jsdom。
export class FakeEl {
    constructor(doc, tag) {
        this.ownerDocument = doc; this.tagName = String(tag).toLowerCase(); this.children = []; this.parentNode = null;
        this.attrs = new Map(); this.className = ''; this.id = ''; this._text = ''; this._html = ''; this.listeners = {};
        this.style = { vars: {}, setProperty(k, v) { this.vars[k] = v; }, removeProperty(k) { delete this.vars[k]; } };
        // 只有开启 waapi 的假文档才有 animate，模拟不支持 Web Animations 的环境时关掉即可。
        if (doc.waapi) this.animate = (frames, options) => fakeAnimation(this, frames, options);
    }
    get firstChild() { return this.children[0] || null; }
    get clientWidth() { return this.ownerDocument.size && this.id === 'igs-stage-motion' ? this.ownerDocument.size.width : 0; }
    get clientHeight() { return this.ownerDocument.size && this.id === 'igs-stage-motion' ? this.ownerDocument.size.height : 0; }
    addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
    fire(type, event = {}) { for (const fn of this.listeners[type] || []) fn({ stopPropagation() {}, preventDefault() {}, ...event }); }
    // 只有开启 layout 的假文档才有尺寸，用于模拟飞向背包的坐标换算。
    getBoundingClientRect() { return this.ownerDocument.layout ? (this.rect || { left: 300, top: 80, width: 52, height: 52 }) : undefined; }
    get nextSibling() {
        if (!this.parentNode) return null;
        const list = this.parentNode.children;
        return list[list.indexOf(this) + 1] || null;
    }
    appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.children.push(child); return child; }
    insertBefore(child, ref) {
        if (!ref) return this.appendChild(child);
        if (child.parentNode) child.parentNode.removeChild(child);
        child.parentNode = this;
        this.children.splice(this.children.indexOf(ref), 0, child);
        return child;
    }
    removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); child.parentNode = null; return child; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    removeAttribute(k) { this.attrs.delete(k); }
    set textContent(v) { this.children = []; this._text = String(v); }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    set innerHTML(v) { this.children = []; this._html = String(v); }
    get innerHTML() { return this._html; }
    matches(sel) {
        if (sel.startsWith('#')) return this.id === sel.slice(1);
        if (sel.startsWith('.')) return String(this.className).split(/\s+/).includes(sel.slice(1));
        const attr = sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
        if (attr) return attr[2] == null ? this.attrs.has(attr[1]) : this.getAttribute(attr[1]) === attr[2];
        return this.tagName === sel.toLowerCase();
    }
    descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
    // 支持「祖先 后代」两段式选择器（HUD 背包入口用）。
    matchesPath(sel) {
        const parts = sel.split(/\s+/);
        if (!this.matches(parts[parts.length - 1])) return false;
        if (parts.length === 1) return true;
        for (let p = this.parentNode; p; p = p.parentNode) if (p.matches(parts[0])) return true;
        return false;
    }
    querySelectorAll(sel) { const parts = sel.split(',').map((s) => s.trim()); return this.descendants().filter((n) => parts.some((p) => n.matchesPath(p))); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function fakeAnimation(target, frames, options) {
    const anim = {
        frames, options, state: 'running', onfinish: null,
        effect: { getTiming: () => ({ fill: options && options.fill || 'none' }) },
        cancel() { anim.state = 'cancelled'; },
        finish() { anim.state = 'finished'; },
    };
    (target.animations ||= []).push(anim);
    return anim;
}

// layout：元素带矩形；hud：挂状态 HUD 与背包入口；size：舞台尺寸 { width, height }；waapi：元素带 animate。
export function makeStage({ layout = false, hud = false, size = null, waapi = false } = {}) {
    const doc = { layout, size, waapi, createElement: (tag) => new FakeEl(doc, tag) };
    const root = new FakeEl(doc, 'div');
    const motion = new FakeEl(doc, 'div'); motion.id = 'igs-stage-motion';
    const sprite = new FakeEl(doc, 'div'); sprite.id = 'igs-sprite';
    const dialog = new FakeEl(doc, 'div'); dialog.id = 'igs-dialog-layer';
    motion.appendChild(sprite); motion.appendChild(dialog); root.appendChild(motion);
    if (hud) {
        const host = new FakeEl(doc, 'div'); host.id = 'igs-status-hud';
        const bag = new FakeEl(doc, 'button'); bag.setAttribute('data-act', 'inventory'); bag.rect = { left: 20, top: 20, width: 24, height: 24 };
        host.appendChild(bag); motion.appendChild(host);
        root.bag = bag;
    }
    return root;
}

export function makeTimers() {
    let seq = 0;
    const pending = new Map();
    let clock = 0;
    return {
        schedule: (fn, ms) => { const id = ++seq; pending.set(id, { fn, at: clock + ms }); return id; },
        clear: (id) => { pending.delete(id); },
        size: () => pending.size,
        advance(ms) {
            clock += ms;
            for (;;) {
                const due = [...pending.entries()].filter(([, t]) => t.at <= clock).sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                pending.delete(due[0]);
                due[1].fn();
            }
        },
    };
}
