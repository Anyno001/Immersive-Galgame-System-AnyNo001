import test from 'node:test';
import assert from 'node:assert/strict';
import { extractChatBlocks, formatChatBlockAsText } from '../src/scene/chat-blocks.js';
import { applyChatToDom, advanceChatReveal, cancelChatShow, getChatRevealState } from '../src/visual/igs-ui/chat-layer.js';
import { buildChatPageModel, normalizeChatMessageType, normalizeChatShowSettings } from '../src/visual/igs-ui/chat-show-runtime.js';

// 最小假 DOM：只覆盖聊天层用到的接口。
function makeEl(tag, doc) {
    const classes = new Set();
    const attrs = new Map();
    const node = {
        tagName: tag, ownerDocument: doc, parentNode: null, children: [], hidden: false, scrollTop: 0, scrollHeight: 0,
        id: '', textContent: '', src: '', alt: '',
        style: { setProperty(n, v) { this[n] = String(v); }, removeProperty(n) { this[n] = ''; } },
        classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
        setAttribute: (n, v) => attrs.set(n, String(v)),
        getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null),
        removeAttribute: (n) => attrs.delete(n),
        addEventListener() {},
        appendChild(c) { c.remove(); c.parentNode = node; node.children.push(c); return c; },
        insertBefore(c, ref) { c.remove(); c.parentNode = node; node.children.splice(node.children.indexOf(ref), 0, c); return c; },
        remove() { if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1); node.parentNode = null; },
        querySelector(sel) {
            const test = sel[0] === '#' ? (n) => n.id === sel.slice(1) : (n) => String(n.className).split(/\s+/).includes(sel.slice(1));
            const walk = (n) => { for (const c of n.children) { if (test(c)) return c; const r = walk(c); if (r) return r; } return null; };
            return walk(node);
        },
    };
    Object.defineProperty(node, 'className', { get: () => [...classes].join(' '), set: (v) => { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); } });
    return node;
}

function setup() {
    const doc = { createElement: (t) => makeEl(t, doc) };
    const root = makeEl('div', doc);
    const timers = [];
    const ctx = { setTimeout: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length - 1; }, clearTimeout: (id) => { if (timers[id]) timers[id].live = false; } };
    // fire 只推进「自动连发」计时器；停留计时器（1800 / 1200）由用例显式触发。
    const fire = () => { const t = timers.find((x) => x.live && x.ms !== 1800 && x.ms !== 1200); assert.ok(t, '没有待触发计时器'); t.live = false; t.fn(); return t.ms; };
    return { root, timers, ctx, fire };
}

function mount(env, messages, extra = {}, settingsIn = {}) {
    const settings = normalizeChatShowSettings({ enabled: true, revealMode: 'auto', sound: { enabled: false }, ...settingsIn });
    const chat = buildChatPageModel({ title: '爱丽丝', messages }, settings, { userName: '小明', pagesAfter: extra.pagesAfter });
    applyChatToDom(env.root, {
        messageId: extra.id || 1,
        content: { chatPage: true, chat, currentIndex: 0 },
        readerSettings: { chatShow: settings, ...(extra.reader || {}) },
    }, env.ctx);
    const layer = env.root.querySelector('#igs-chat-layer');
    return { layer, chat, list: layer.querySelector('.igs-chat-list'), head: layer.querySelector('.igs-chat-head') };
}

const visible = (list) => list.children.filter((r) => !r.hidden && !r.className.includes('is-typing'));
const typingRow = (list) => list.children.find((r) => r.className.split(' ').includes('is-typing'));
const noteText = (row) => row.children[0].textContent;

test('gate: chat variants parse - typing, recall with text and read all stay [igs-msg] with a type column', () => {
    const { chats } = extractChatBlocks('[igs-chat:爱丽丝]\n[igs-msg:{{user}}|在吗|已读]\n[igs-msg:爱丽丝||输入中]\n[igs-msg:爱丽丝|算了|撤回]\n[igs-chat-end]');
    assert.deepEqual(chats[0].messages.map((m) => [m.sender, m.text, m.type]), [['{{user}}', '在吗', '已读'], ['爱丽丝', '', '输入中'], ['爱丽丝', '算了', '撤回']]);
    assert.equal(normalizeChatMessageType('输入中'), 'typing');
    assert.equal(normalizeChatMessageType('正在输入'), 'typing');
    assert.equal(normalizeChatMessageType('已读'), 'read');
    assert.equal(normalizeChatMessageType('已读不回'), 'read');
    // 纯文字回放不出现空的「输入中」行
    assert.equal(formatChatBlockAsText(chats[0]), '{{user}}：在吗\n爱丽丝：算了');
});

test('gate: chat model - typing is a transient item, recall keeps original, read adds a lapse line by pages', () => {
    const settings = normalizeChatShowSettings({ enabled: true });
    const model = buildChatPageModel({ title: 'A', messages: [
        { kind: 'msg', sender: '{{user}}', text: '在吗', type: '已读' },
        { kind: 'msg', sender: 'A', text: '', type: '输入中' },
        { kind: 'msg', sender: 'A', text: '算了', type: '撤回' },
    ] }, settings, { userName: '小明', pagesAfter: 2 });
    assert.deepEqual(model.messages.map((m) => m.kind), ['msg', 'typing', 'recall', 'lapse']);
    assert.equal(model.messages[0].read, true);
    assert.equal(model.messages[0].type, 'text');
    assert.equal(model.messages[2].original, '算了');
    assert.equal(model.messages[2].text, 'A撤回了一条消息');
    assert.ok(model.messages[1].color && model.messages[2].color);
    assert.equal(model.messages[3].text, '30分钟后');
    // 已读后对方又回复了：不补时间流逝
    const replied = buildChatPageModel({ messages: [
        { kind: 'msg', sender: '{{user}}', text: '在吗', type: '已读' },
        { kind: 'msg', sender: 'A', text: '在' },
    ] }, settings, { userName: '小明' });
    assert.equal(replied.messages.some((m) => m.kind === 'lapse'), false);
    // 对方发的「已读」不是我方已读，当普通消息
    const other = buildChatPageModel({ messages: [{ kind: 'msg', sender: 'A', text: 'hi', type: '已读' }] }, settings, {});
    assert.equal(other.messages[0].read, undefined);
    assert.equal(other.messages.some((m) => m.kind === 'lapse'), false);
    // 小时进位
    const long = buildChatPageModel({ messages: [{ kind: 'msg', sender: '{{user}}', text: 'x', type: '已读' }] }, settings, { pagesAfter: 9 });
    assert.equal(long.messages.at(-1).text, '1小时后');
});

test('gate: typing-then-give-up shows indicator + header, then vanishes without leaving a message', () => {
    const env = setup();
    const { list, head } = mount(env, [
        { kind: 'msg', sender: 'A', text: '在吗' },
        { kind: 'msg', sender: 'A', text: '', type: '输入中' },
        { kind: 'msg', sender: 'A', text: '', type: '输入中' },
        { kind: 'msg', sender: 'A', text: '没事了' },
    ], {}, { typingIndicator: false });
    env.fire(); // 第一条
    assert.equal(visible(list).length, 1);
    env.fire(); // 第一次输入中
    assert.ok(typingRow(list));
    assert.equal(head.textContent, '对方正在输入…');
    assert.equal(visible(list).length, 1);
    const hold = env.timers.filter((t) => t.live).map((t) => t.ms);
    assert.ok(hold.includes(1800), '放弃提示应停留约 1.8 秒');
    // 保持计时器先到：提示消失，标题恢复，不留消息
    const holdTimer = env.timers.find((t) => t.live && t.ms === 1800);
    holdTimer.live = false;
    holdTimer.fn();
    assert.equal(typingRow(list), undefined);
    assert.equal(head.textContent, '爱丽丝');
    assert.equal(visible(list).length, 1);
    // 第二次犹豫
    env.fire();
    assert.ok(typingRow(list));
    assert.equal(head.textContent, '对方正在输入…');
    // 下一条真消息到来时提示一并收掉
    env.fire();
    assert.equal(typingRow(list), undefined);
    assert.equal(head.textContent, '爱丽丝');
    assert.equal(visible(list).length, 2);
    assert.equal(getChatRevealState(env.root).revealed, 4);
    cancelChatShow(env.root);
});

test('gate: recall with text shows the bubble ~1.2s then turns into grey centred note', () => {
    const env = setup();
    const { list } = mount(env, [{ kind: 'msg', sender: 'A', text: '我喜欢你', type: '撤回' }, { kind: 'msg', sender: 'A', text: '没什么' }]);
    env.fire();
    const rows = visible(list);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].className.includes('is-left'), true);
    assert.equal(rows[0].children[0].children[0].textContent, '我喜欢你');
    const t = env.timers.find((x) => x.live && x.ms === 1200);
    assert.ok(t, '撤回前原话停留 1.2 秒');
    t.live = false;
    t.fn();
    const after = visible(list);
    assert.equal(after.length, 1);
    assert.equal(after[0].className.includes('is-note'), true);
    assert.equal(noteText(after[0]), 'A撤回了一条消息');
    cancelChatShow(env.root);
});

test('gate: recall preview is settled immediately when the reader advances', () => {
    const env = setup();
    const { list } = mount(env, [{ kind: 'msg', sender: 'A', text: '原话', type: '撤回' }, { kind: 'msg', sender: 'A', text: '后一条' }], {}, { revealMode: 'click' });
    assert.equal(visible(list)[0].children[0].children[0].textContent, '原话');
    advanceChatReveal(env.root);
    const rows = visible(list);
    assert.equal(rows.length, 2);
    assert.equal(noteText(rows[0]), 'A撤回了一条消息');
    cancelChatShow(env.root);
});

test('gate: read mark sits under my bubble, lapse line follows when nobody replies', () => {
    const env = setup();
    const { list } = mount(env, [{ kind: 'msg', sender: '{{user}}', text: '在吗', type: '已读' }], { pagesAfter: 0 }, { revealMode: 'click' });
    const body = visible(list)[0].children[0];
    assert.equal(body.children[0].textContent, '在吗');
    assert.equal(body.children[1].className, 'igs-chat-read');
    assert.equal(body.children[1].textContent, '已读');
    assert.equal(visible(list).length, 1);
    advanceChatReveal(env.root);
    const rows = visible(list);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].className.includes('is-time'), true);
    assert.equal(noteText(rows[1]), '10分钟后');
    cancelChatShow(env.root);
});

test('gate: ancient era swaps wording - 提笔又放下 / 信被抽回 / 已阅, carried phone stays modern', () => {
    const env = setup();
    const msgs = [
        { kind: 'msg', sender: '{{user}}', text: '安否', type: '已读' },
        { kind: 'msg', sender: 'A', text: '', type: '输入中' },
        { kind: 'msg', sender: 'A', text: '勿念', type: '撤回' },
    ];
    const { list, head } = mount(env, msgs, { reader: { _ancientEra: true } });
    env.fire();
    const letterRow = visible(list)[0];
    assert.equal(letterRow.className.includes('is-letter'), true);
    assert.equal(letterRow.children[1].textContent, '已阅');
    env.fire();
    assert.equal(head.textContent, '对方提笔又放下');
    assert.equal(typingRow(list).children[0].textContent, '对方提笔又放下');
    env.fire();
    env.timers.filter((t) => t.live && t.ms === 1200).forEach((t) => { t.live = false; t.fn(); });
    const notes = visible(list).filter((r) => r.className.includes('is-note'));
    assert.equal(noteText(notes[0]), '信被抽回');
    env.fire();
    const last = visible(list).at(-1);
    assert.equal(noteText(last), '三日后');
    cancelChatShow(env.root);

    const env2 = setup();
    const m = mount(env2, msgs, { reader: { _ancientEra: true, _carryPhone: true } });
    env2.fire();
    assert.equal(visible(m.list)[0].children[0].children[1].textContent, '已读');
    cancelChatShow(env2.root);
});

test('gate: variant text goes through textContent only and never becomes markup', () => {
    const env = setup();
    const evil = '<img src=x onerror=alert(1)>';
    const { list } = mount(env, [
        { kind: 'msg', sender: '{{user}}', text: evil, type: '已读' },
        { kind: 'msg', sender: '<b>A</b>', text: evil, type: '撤回' },
    ], {}, { revealMode: 'click' });
    const bubble = visible(list)[0].children[0].children[0];
    assert.equal(bubble.textContent, evil);
    assert.equal(bubble.children.length, 0);
    advanceChatReveal(env.root);
    const preview = visible(list)[1];
    assert.equal(preview.children[0].children[0].textContent, evil);
    assert.equal(preview.children[0].children[0].children.length, 0);
    cancelChatShow(env.root);
});
