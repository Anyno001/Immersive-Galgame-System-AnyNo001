import { buildPhoneStatus } from './danmaku-icons.js';

export const SHOT_PER_IMAGE = 8;
const TYPE_LABEL = Object.freeze({ image: '[图片]', sticker: '[表情]', voice: '[语音]' });

function el(doc, tag, cls, text) {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
}

// 把聊天页模型按每张约 8 条消息拆组；输入中只是瞬时提示，不进截图。
export function shotGroupsOf(messages, per = SHOT_PER_IMAGE) {
    const shown = messages.filter((m) => m.kind !== 'typing');
    const groups = [];
    let count = 0;
    for (const m of shown) {
        if (!groups.length || count >= per) { groups.push([]); count = 0; }
        groups[groups.length - 1].push(m);
        if (m.kind === 'msg') count += 1;
    }
    return groups;
}

function rowNode(doc, m) {
    if (m.kind === 'time' || m.kind === 'lapse' || m.kind === 'note' || m.kind === 'system' || m.kind === 'recall') {
        const row = el(doc, 'div', 'igs-fm-shot-row is-note');
        row.append(el(doc, 'span', 'igs-fm-shot-note', m.text));
        return row;
    }
    const row = el(doc, 'div', `igs-fm-shot-row is-${m.side === 'right' ? 'right' : 'left'}`);
    const body = el(doc, 'div', 'igs-fm-shot-body');
    if (m.showName && m.name) body.append(el(doc, 'div', 'igs-fm-shot-name', m.name));
    const label = TYPE_LABEL[m.type] || '';
    const bubble = el(doc, 'div', 'igs-fm-shot-bubble', `${label}${label && m.text ? ' ' : ''}${m.text || ''}`);
    if (m.color) bubble.style.background = m.color;
    if (m.textColor) bubble.style.color = m.textColor;
    body.append(bubble);
    row.append(body);
    return row;
}

// shot：{ title, time, night, theme, caseColor, groups }；返回每组一个 .igs-fm-shot 节点，尺寸全用 em，随外层宽度等比缩放。
export function buildChatShots(doc, shot) {
    return shot.groups.map((messages) => {
        const node = el(doc, 'div', 'igs-fm-shot');
        const theme = shot.theme || {};
        const set = (name, value) => { if (value) node.style.setProperty(name, value); };
        set('--igs-shot-shell', theme.shell);
        set('--igs-shot-head', theme.head);
        set('--igs-shot-ink', theme.headInk);
        set('--igs-shot-sub', theme.sub);
        set('--igs-shot-border', theme.border);
        set('--igs-shot-case', shot.caseColor || theme.frame);
        set('font-family', theme.font);
        const top = el(doc, 'div', 'igs-fm-shot-top');
        top.append(buildPhoneStatus(doc, Date.now, { time: shot.time || '', night: shot.night === true, battery: { low: false }, signal: 'ok' }));
        if (shot.title) top.append(el(doc, 'div', 'igs-fm-shot-title', shot.title));
        const list = el(doc, 'div', 'igs-fm-shot-list');
        for (const m of messages) list.append(rowNode(doc, m));
        node.append(top, list);
        return node;
    });
}
