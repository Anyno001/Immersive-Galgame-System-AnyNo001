// 设置器重绘：新 HTML 先解析成节点，再和页面上现有的 DOM 逐个比对，只改变了的属性、文字和子树。
// 没变的节点原样留着：点一个开关不再重建整页几百个节点，缩略图不重新解码，滚动位置、焦点自然保住。
// 结果和整块换 innerHTML 一致（属性、文字、表单值都以新 HTML 为准），只是改动范围小。

// 不支持 <template> 的环境（单元测试里的假 DOM）返回 false，调用方退回整块 innerHTML。
export function canMorph(target) {
    const doc = target && target.ownerDocument;
    if (!doc || typeof doc.createElement !== 'function' || typeof target.insertBefore !== 'function') return false;
    const tpl = doc.createElement('template');
    return Boolean(tpl && tpl.content && 'firstChild' in tpl.content);
}

export function morphChildren(target, html) {
    const tpl = target.ownerDocument.createElement('template');
    tpl.innerHTML = html;
    morphFragment(target, tpl.content, target.ownerDocument.activeElement || null);
}

// 把 next 的子节点合进 target：能对上的原地改，对不上的从 next 搬过来，多出来的删掉。active 是正在输入的控件。
export function morphFragment(target, next, active = null) {
    patchChildren(target, next, active);
}

// 带 id 的元素按 id 对应，其余按标签名对应：列表中间删掉一项时，id 不同就换节点，不会把后面整排的属性挨个改一遍。
function sameNode(a, b) {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType !== 1) return true;
    return a.nodeName === b.nodeName && (a.id || '') === (b.id || '');
}

function patchChildren(parent, next, active) {
    let cur = parent.firstChild;
    let incoming = next.firstChild;
    while (incoming) {
        const following = incoming.nextSibling;
        if (cur && sameNode(cur, incoming)) {
            patchNode(cur, incoming, active);
            cur = cur.nextSibling;
        } else {
            parent.insertBefore(incoming, cur);
        }
        incoming = following;
    }
    while (cur) {
        const following = cur.nextSibling;
        parent.removeChild(cur);
        cur = following;
    }
}

function patchAttributes(cur, next) {
    for (const { name, value } of Array.from(next.attributes)) {
        if (cur.getAttribute(name) !== value) cur.setAttribute(name, value);
    }
    for (const { name } of Array.from(cur.attributes)) {
        if (!next.hasAttribute(name)) cur.removeAttribute(name);
    }
}

function patchNode(cur, next, active) {
    if (cur.nodeType !== 1) {
        if (cur.nodeValue !== next.nodeValue) cur.nodeValue = next.nodeValue;
        return;
    }
    patchAttributes(cur, next);
    const tag = cur.nodeName;
    // 表单控件的当前值不跟属性走：用户改过之后再改 value 属性，界面上不会变。正在输入的那个不动。
    if (tag === 'INPUT') {
        const type = String(cur.type || '').toLowerCase();
        if (type === 'checkbox' || type === 'radio') cur.checked = next.hasAttribute('checked');
        else if (cur !== active) {
            const value = next.getAttribute('value') || '';
            if (cur.value !== value) cur.value = value;
        }
        return;
    }
    if (tag === 'TEXTAREA') {
        if (cur !== active && cur.value !== next.textContent) cur.value = next.textContent;
        return;
    }
    patchChildren(cur, next, active);
    if (tag === 'SELECT') {
        const options = Array.from(next.querySelectorAll('option'));
        const picked = options.findIndex((option) => option.hasAttribute('selected'));
        const index = picked >= 0 ? picked : 0;
        if (cur.selectedIndex !== index) cur.selectedIndex = index;
    }
}
