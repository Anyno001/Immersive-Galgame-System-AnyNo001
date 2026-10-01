// 楼层内嵌模式的纯函数边界：只决定宿主 DOM 定位、即时样式与载入态，
// 不触碰阅读器内部 DOM、不读取消息数据，便于单测与宿主环境隔离。

export const EMBEDDED_HOST_ATTR = 'data-igs-embedded-host';
export const EMBEDDED_HOST_SELECTOR = '[data-igs-embedded-host="1"]';
export const EMBEDDED_TEXT_HIDDEN_ATTR = 'data-igs-embedded-hidden';
const PREVIOUS_DISPLAY_ATTR = 'data-igs-embedded-prev-display';
const PREVIOUS_DISPLAY_PRIORITY_ATTR = 'data-igs-embedded-prev-display-priority';
const PREVIOUS_ARIA_ATTR = 'data-igs-embedded-prev-aria';
const MISSING_VALUE = '__igs_missing__';

export function resolveEmbeddedHostParent(messageElement) {
    if (!messageElement || typeof messageElement.querySelector !== 'function') return null;
    const mesText = messageElement.querySelector('.mes_text');
    if (!mesText || !mesText.parentNode) return null;
    return { parent: mesText.parentNode, mesText };
}

export function findEmbeddedHost(doc) {
    if (!doc || typeof doc.querySelector !== 'function') return null;
    return doc.querySelector(EMBEDDED_HOST_SELECTOR);
}

export function ensureEmbeddedHost(parent, doc, hostRef) {
    if (!parent || !doc || typeof doc.createElement !== 'function') return null;
    let host = hostRef;
    if (!host) {
        host = doc.createElement('div');
        host.setAttribute(EMBEDDED_HOST_ATTR, '1');
        host.setAttribute('data-igs-internal-reader', '1');
        host.className = 'igs-embedded-host';
    }
    const children = parent.children ? Array.from(parent.children) : [];
    const mesText = children.find((node) => node && node.classList && node.classList.contains('mes_text'));
    if (mesText && mesText !== host && typeof parent.insertBefore === 'function') parent.insertBefore(host, mesText);
    else if (host.parentNode !== parent && typeof parent.appendChild === 'function') parent.appendChild(host);
    return host;
}

// 正文行和 gal 读原文一样：保留标签里的每一行。
export function storyLines(raw, includeTags = 'content') {
    const tags = String(includeTags || 'content')
        .split(/[\n,，]+/)
        .map((tag) => tag.trim().replace(/^<+/, '').replace(/^\/+/, '').replace(/>+$/, '').replace(/\/+$/, '').trim())
        .filter(Boolean);
    const parts = [];
    const source = String(raw || '');
    for (const tag of tags) {
        const regex = new RegExp(`<${escapeRegExp(tag)}(?=[\\s/>])[^>]*>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, 'gi');
        let match = null;
        while ((match = regex.exec(source)) !== null) parts.push(match[1] || '');
    }
    return parts.join('\n').split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

export function storyEdgeLines(raw, includeTags = 'content') {
    const lines = storyLines(raw, includeTags);
    if (!lines.length) return null;
    return { first: lines[0], last: lines[lines.length - 1] };
}

// 按正文行的顺序在渲染文本里往前对。页面上没有的行（例如 [igs-img:3]）跳过。
// 从第一句对上的位置藏到最后一句对上的位置。一句都对不上就不藏。
export function findStorySpan(text, firstOrLines, lastSentence) {
    const lines = Array.isArray(firstOrLines)
        ? firstOrLines
        : [firstOrLines, lastSentence].filter((line) => String(line || '').trim());
    const folded = compactWithMap(String(text || ''));
    if (!folded.text) return null;
    let cursor = 0;
    let start = -1;
    let end = -1;
    for (const line of lines) {
        const needle = collapseSpace(line);
        if (!needle) continue;
        const at = folded.text.indexOf(needle, cursor);
        if (at < 0) continue;
        if (start < 0) start = at;
        end = at + needle.length;
        cursor = end;
    }
    if (start < 0 || end <= 0 || end > folded.map.length) return null;
    return { start: folded.map[start], end: folded.map[end - 1] + 1 };
}

const STORY_HIDDEN_ATTR = 'data-igs-story-hidden';

export function isStoryHidden(mesText) {
    return Boolean(mesText && typeof mesText.querySelector === 'function' && mesText.querySelector(`[${STORY_HIDDEN_ATTR}="1"]`));
}
const BLANK_SHELL_ATTR = 'data-igs-blank-shell';
const UI_SHELL = 'img,svg,canvas,video,button,input,select,textarea,iframe,.TH-render';

export function hideStorySpan(mesText, firstSentence, lastSentence) {
    if (!mesText) return false;
    restoreStorySpan(mesText);
    const span = findStorySpan(mesText.textContent || '', firstSentence, lastSentence);
    if (!span) return false;
    const doc = mesText.ownerDocument;
    if (!doc || typeof doc.createRange !== 'function' || typeof doc.createElement !== 'function') return false;
    const startPoint = pointAt(mesText, span.start);
    const endPoint = pointAt(mesText, span.end);
    if (!startPoint || !endPoint) return false;
    const range = doc.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    const hidden = doc.createElement('span');
    hidden.setAttribute(STORY_HIDDEN_ATTR, '1');
    if (hidden.style) hidden.style.display = 'none';
    hidden.appendChild(range.extractContents());
    range.insertNode(hidden);
    collapseBlankShells(mesText);
    return true;
}

// 正文抽走后，原来的段落壳还在，里面没有字也会占高度。界面块留下。
export function collapseBlankShells(mesText) {
    if (!mesText || !mesText.children) return;
    for (const node of Array.from(mesText.children)) {
        if (!isBlankShell(node)) continue;
        node.setAttribute(BLANK_SHELL_ATTR, '1');
        setDisplayStyle(node.style, 'none', 'important');
    }
}

export function restoreBlankShells(mesText) {
    if (!mesText || typeof mesText.querySelectorAll !== 'function') return;
    for (const node of Array.from(mesText.querySelectorAll(`[${BLANK_SHELL_ATTR}="1"]`))) {
        restoreDisplayStyle(node.style, '', '');
        node.removeAttribute(BLANK_SHELL_ATTR);
    }
}

function isBlankShell(node) {
    if (!node || node.nodeType === 3) return false;
    if (typeof node.getAttribute === 'function' && (node.getAttribute(STORY_HIDDEN_ATTR) === '1' || node.getAttribute(BLANK_SHELL_ATTR) === '1')) return false;
    const cls = String(node.className || '');
    if (cls.split(/\s+/).includes('TH-render')) return false;
    if (node.shadowRoot) return false;
    if (typeof node.querySelector === 'function' && node.querySelector(UI_SHELL)) return false;
    return !String(node.textContent || '').replace(/\s+/g, '');
}

export function restoreStorySpan(mesText) {
    if (!mesText || typeof mesText.querySelectorAll !== 'function') return;
    restoreBlankShells(mesText);
    const nodes = Array.from(mesText.querySelectorAll(`[${STORY_HIDDEN_ATTR}="1"]`));
    for (const node of nodes) {
        const parent = node.parentNode;
        if (!parent) continue;
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        if (typeof node.remove === 'function') node.remove();
        else if (typeof parent.removeChild === 'function') parent.removeChild(node);
    }
}

const PARALLEL_CONTROL = 'button,input,select,textarea';

// 正文之外、正则已经换成界面的块：里面有按钮或输入框。剧情原文没有这些控件。
export function isParallelBlock(node) {
    if (!node || node.nodeType === 3) return false;
    const tag = String(node.tagName || node.nodeName || '').toLowerCase();
    if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') return true;
    return typeof node.querySelector === 'function' && Boolean(node.querySelector(PARALLEL_CONTROL));
}

// 把这些界面从被隐藏的原文里挪到 gal 窗口后面，原节点原样移动，点击仍由酒馆正则处理。
export function liftParallelBlocks(mesText, host, previous) {
    if (!mesText || !host || !host.parentNode) return previous || null;
    const doc = mesText.ownerDocument;
    if (!doc || typeof doc.createElement !== 'function') return previous || null;
    const nodes = Array.from(mesText.children || []).filter(isParallelBlock);
    if (!nodes.length) return previous || null;
    let holder = previous && previous.holder;
    if (!holder || holder.parentNode !== host.parentNode) {
        holder = doc.createElement('div');
        holder.className = 'igs-parallel-blocks';
        holder.setAttribute('data-igs-parallel-blocks', '1');
        const after = host.nextSibling;
        if (after && typeof host.parentNode.insertBefore === 'function') host.parentNode.insertBefore(holder, after);
        else host.parentNode.appendChild(holder);
    }
    const placements = previous && Array.isArray(previous.placements) ? previous.placements.slice() : [];
    for (const node of nodes) {
        placements.push({ node, next: node.nextSibling || null });
        holder.appendChild(node);
    }
    return { holder, placements, mesText };
}

export function restoreParallelBlocks(record) {
    if (!record || !record.mesText) return;
    const mesText = record.mesText;
    for (const item of record.placements || []) {
        if (!item || !item.node || item.node.parentNode !== record.holder) continue;
        if (item.next && item.next.parentNode === mesText && typeof mesText.insertBefore === 'function') mesText.insertBefore(item.node, item.next);
        else if (typeof mesText.appendChild === 'function') mesText.appendChild(item.node);
    }
    const holder = record.holder;
    if (!holder) return;
    if (typeof holder.remove === 'function') holder.remove();
    else if (holder.parentNode && Array.isArray(holder.parentNode.children)) {
        holder.parentNode.children = holder.parentNode.children.filter((child) => child !== holder);
        holder.parentNode = null;
    }
}

export function hideEmbeddedSourceText(mesText) {
    if (!mesText || typeof mesText.setAttribute !== 'function') return;
    if (typeof mesText.getAttribute === 'function' && mesText.getAttribute(EMBEDDED_TEXT_HIDDEN_ATTR) === '1') {
        setDisplayStyle(mesText.style, 'none', 'important');
        mesText.setAttribute('aria-hidden', 'true');
        return;
    }
    const display = readDisplayValue(mesText.style);
    const priority = readDisplayPriority(mesText.style);
    const aria = typeof mesText.getAttribute === 'function' ? mesText.getAttribute('aria-hidden') : null;
    mesText.setAttribute(EMBEDDED_TEXT_HIDDEN_ATTR, '1');
    mesText.setAttribute(PREVIOUS_DISPLAY_ATTR, display);
    mesText.setAttribute(PREVIOUS_DISPLAY_PRIORITY_ATTR, priority);
    mesText.setAttribute(PREVIOUS_ARIA_ATTR, aria == null ? MISSING_VALUE : String(aria));
    setDisplayStyle(mesText.style, 'none', 'important');
    mesText.setAttribute('aria-hidden', 'true');
}

export function restoreEmbeddedSourceText(mesText) {
    if (!mesText || typeof mesText.removeAttribute !== 'function') return;
    const display = typeof mesText.getAttribute === 'function' ? mesText.getAttribute(PREVIOUS_DISPLAY_ATTR) : '';
    const priority = typeof mesText.getAttribute === 'function' ? mesText.getAttribute(PREVIOUS_DISPLAY_PRIORITY_ATTR) : '';
    const aria = typeof mesText.getAttribute === 'function' ? mesText.getAttribute(PREVIOUS_ARIA_ATTR) : MISSING_VALUE;
    restoreDisplayStyle(mesText.style, display, priority);
    if (aria === MISSING_VALUE || aria == null) mesText.removeAttribute('aria-hidden');
    else mesText.setAttribute('aria-hidden', aria);
    mesText.removeAttribute(EMBEDDED_TEXT_HIDDEN_ATTR);
    mesText.removeAttribute(PREVIOUS_DISPLAY_ATTR);
    mesText.removeAttribute(PREVIOUS_DISPLAY_PRIORITY_ATTR);
    mesText.removeAttribute(PREVIOUS_ARIA_ATTR);
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collapseSpace(value) {
    return String(value || '').replace(/\s+/g, '');
}

function compactWithMap(text) {
    const compact = [];
    const map = [];
    for (let index = 0; index < text.length; index += 1) {
        if (/\s/.test(text[index])) continue;
        compact.push(text[index]);
        map.push(index);
    }
    return { text: compact.join(''), map };
}

function collectTextNodes(root) {
    const nodes = [];
    const visit = (node) => {
        if (!node) return;
        if (node.nodeType === 3) {
            nodes.push(node);
            return;
        }
        const list = node.childNodes ? Array.from(node.childNodes) : [];
        for (const child of list) visit(child);
    };
    visit(root);
    return nodes;
}

function pointAt(root, offset) {
    const nodes = collectTextNodes(root);
    let cursor = 0;
    for (const node of nodes) {
        const value = String(node.nodeValue != null ? node.nodeValue : node.textContent || '');
        const next = cursor + value.length;
        if (offset <= next) return { node, offset: Math.max(0, offset - cursor) };
        cursor = next;
    }
    return null;
}

function readDisplayValue(style) {
    if (!style) return '';
    if (typeof style.getPropertyValue === 'function') return String(style.getPropertyValue('display') || '');
    return String(style.display || '');
}

function readDisplayPriority(style) {
    return style && typeof style.getPropertyPriority === 'function' ? String(style.getPropertyPriority('display') || '') : '';
}

function setDisplayStyle(style, value, priority) {
    if (!style) return;
    if (typeof style.setProperty === 'function') style.setProperty('display', value, priority);
    else style.display = value;
}

function restoreDisplayStyle(style, value, priority) {
    if (!style) return;
    if (!value && typeof style.removeProperty === 'function') style.removeProperty('display');
    else setDisplayStyle(style, value || '', priority || '');
}


// 宿主「编辑」按钮（小铅笔 .mes_edit）点在挂载楼层上时返回 true。
// 酒馆把编辑框渲染进 .mes_text，内嵌阅读器必须先卸载并恢复原文，否则编辑框随原文一起被隐藏。
export const HOST_EDIT_TRIGGER_SELECTOR = '.mes_edit';

export function isEmbeddedEditTrigger(target, mesText) {
    if (!target || !mesText || typeof target.closest !== 'function') return false;
    const button = target.closest(HOST_EDIT_TRIGGER_SELECTOR);
    if (!button || typeof button.closest !== 'function') return false;
    const message = button.closest('.mes');
    return Boolean(message && typeof message.contains === 'function' && message.contains(mesText));
}


// 宿主编辑框的「完成 / 取消」按钮点在指定楼层上时返回 'done' / 'cancel'，否则 null。
// 点小铅笔关闭内嵌阅读器后，用它判断编辑何时结束，以便重新打开阅读器。
export function resolveHostEditFinish(target, messageId) {
    if (!target || messageId == null || typeof target.closest !== 'function') return null;
    const done = target.closest('.mes_edit_done');
    const cancel = done ? null : target.closest('.mes_edit_cancel');
    const button = done || cancel;
    if (!button || typeof button.closest !== 'function') return null;
    const message = button.closest('.mes');
    if (!message || typeof message.getAttribute !== 'function') return null;
    const id = message.getAttribute('mesid') ?? message.getAttribute('data-mesid');
    if (id == null || String(id) !== String(messageId)) return null;
    return done ? 'done' : 'cancel';
}
