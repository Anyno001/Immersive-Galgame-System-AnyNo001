import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatMarker, extractChatBlocks, formatChatBlockAsText, parseChatMarker } from '../src/scene/chat-blocks.js';
import {
    CHAT_SHOW_DEFAULTS,
    buildChatPageModel,
    chatRevealDelayMs,
    findChatContact,
    normalizeChatShowSettings,
    readableTextColor,
    resolveChatSender,
} from '../src/visual/igs-ui/chat-show-runtime.js';

test('gate: chat blocks collapse to one marker line and keep surrounding text', () => {
    const { text, chats } = extractChatBlocks('前文。\n[igs-chat:群聊]\n[igs-msg:爱丽丝|在吗？]\n[igs-msg:小明|在。]\n[igs-chat-end]\n后文。');
    assert.equal(text, `前文。\n${buildChatMarker(0)}\n后文。`);
    assert.equal(chats.length, 1);
    assert.equal(chats[0].title, '群聊');
    assert.deepEqual(chats[0].messages.map((m) => [m.sender, m.text]), [['爱丽丝', '在吗？'], ['小明', '在。']]);
    assert.equal(parseChatMarker(buildChatMarker(3)), 3);
    assert.equal(parseChatMarker('[igs-card#0]'), -1);
});

test('gate: chat block auto-closes on scene/char tags and at end of text', () => {
    const closedByChar = extractChatBlocks('[igs-chat:A]\n[igs-msg:A|hi]\n[igs-char:A|平和|当面说]');
    assert.equal(closedByChar.chats.length, 1);
    assert.match(closedByChar.text, /\[igs-char:A\|平和\|当面说\]$/);
    const streaming = extractChatBlocks('[igs-chat:A]\n[igs-msg:A|第一条]\n[igs-msg:A|半截');
    assert.equal(streaming.chats[0].messages.length, 2);
    assert.equal(streaming.text, buildChatMarker(0));
});

test('gate: narration inside explicit chat becomes a note; implicit chat closes on narration', () => {
    const explicit = extractChatBlocks('[igs-chat:A]\n[igs-msg:A|hi]\n她犹豫了一下。\n[igs-msg:B|yo]\n[igs-chat-end]');
    assert.deepEqual(explicit.chats[0].messages.map((m) => m.kind), ['msg', 'note', 'msg']);
    const implicit = extractChatBlocks('[igs-msg:A|hi]\n她放下了手机。');
    assert.equal(implicit.chats.length, 1);
    assert.equal(implicit.chats[0].title, '');
    assert.equal(implicit.text, `${buildChatMarker(0)}\n她放下了手机。`);
});

test('gate: inline chat tags are split from prose and malformed input does not hang', () => {
    const { text, chats } = extractChatBlocks('她看了手机。[igs-chat:A][igs-msg:A|hi]回复了。[igs-chat-end]然后。');
    assert.equal(chats.length, 1);
    assert.deepEqual(chats[0].messages.map((m) => m.kind), ['msg', 'note']);
    assert.equal(text, `她看了手机。\n${buildChatMarker(0)}\n然后。`);
    assert.equal(extractChatBlocks('[igs-msg:没有内容').chats.length, 0);
    assert.equal(extractChatBlocks('[igs-chat:空][igs-chat-end]').text.trim(), '');
    assert.equal(extractChatBlocks('普通正文').text, '普通正文');
});

test('gate: chat block formats as plain transcript when the show is disabled', () => {
    const { chats } = extractChatBlocks('[igs-chat:A]\n[igs-msg:A|hi]\n旁注\n[igs-msg:B|yo]');
    assert.equal(formatChatBlockAsText(chats[0]), 'A：hi\n旁注\nB：yo');
});

test('gate: chat show settings normalize defaults, clamps and contacts', () => {
    const empty = normalizeChatShowSettings(null);
    assert.equal(empty.enabled, false);
    assert.equal(empty.frame, 'phone');
    assert.equal(empty.revealMode, 'click');
    assert.equal(empty.dim, CHAT_SHOW_DEFAULTS.dim);
    assert.deepEqual(empty.contacts, {});
    const s = normalizeChatShowSettings({
        enabled: true, frame: 'x', revealMode: 'auto', dim: 5, sound: { enabled: false, volume: 3 },
        unknownSide: 'right', defaultColors: { left: 'red', right: '#AABBCC' },
        contacts: { ' 爱丽丝 ': { aliases: ['小爱', '小爱', '爱丽丝', ''], color: '#FF00AA', side: 'right' }, 'a.b': {}, '': {} },
    });
    assert.equal(s.frame, 'phone');
    assert.equal(s.dim, 0.8);
    assert.deepEqual(s.sound, { enabled: false, volume: 1 });
    assert.equal(s.unknownSide, 'right');
    assert.deepEqual(s.defaultColors, { left: '#ffffff', right: '#aabbcc' });
    assert.deepEqual(s.contacts, { 爱丽丝: { aliases: ['小爱'], color: '#ff00aa', side: 'right' } });
});

test('gate: chat sender resolves through contact aliases and scene character aliases', () => {
    const settings = normalizeChatShowSettings({ contacts: { 爱丽丝: { aliases: ['alice_cat'] } } });
    assert.equal(findChatContact('爱丽丝', settings), '爱丽丝');
    assert.equal(findChatContact('alice_cat', settings), '爱丽丝');
    assert.equal(findChatContact('爱丽', settings, { 爱丽丝: ['爱丽'] }), '爱丽丝');
    assert.equal(findChatContact('路人', settings), null);
});

test('gate: chat side is fixed by settings, never by the AI text', () => {
    const settings = normalizeChatShowSettings({
        selfName: '阿明',
        contacts: { 爱丽丝: { aliases: ['小爱'], side: 'right' }, 阿明: { aliases: ['明明'], side: 'auto' } },
    });
    assert.equal(resolveChatSender('小爱', settings).side, 'right');
    assert.equal(resolveChatSender('明明', settings).side, 'right');
    assert.equal(resolveChatSender('{{user}}', settings, { userName: '小明' }).side, 'right');
    assert.equal(resolveChatSender('小明', settings, { userName: '小明' }).side, 'right');
    assert.equal(resolveChatSender('路人A', settings).side, 'left');
    assert.equal(resolveChatSender('路人A', { ...settings, unknownSide: 'right' }).side, 'right');
    const fixedLeft = normalizeChatShowSettings({ contacts: { 小明: { side: 'left' } } });
    assert.equal(resolveChatSender('小明', fixedLeft, { userName: '小明' }).side, 'left');
});

test('gate: chat page model colors bubbles, names groups and derives the title', () => {
    const settings = normalizeChatShowSettings({ contacts: { 爱丽丝: { color: '#222222' } } });
    const oneOnOne = buildChatPageModel({ title: '', messages: [
        { kind: 'msg', sender: '爱丽丝', text: 'hi' },
        { kind: 'msg', sender: '{{user}}', text: 'yo' },
    ] }, settings, { userName: '小明' });
    assert.equal(oneOnOne.title, '爱丽丝');
    assert.equal(oneOnOne.group, false);
    assert.equal(oneOnOne.messages[0].color, '#222222');
    assert.equal(oneOnOne.messages[0].textColor, '#ffffff');
    assert.equal(oneOnOne.messages[1].color, settings.defaultColors.right);
    assert.equal(oneOnOne.messages[1].displayName, '小明');
    assert.equal(oneOnOne.messages.some((m) => m.showName), false);
    const group = buildChatPageModel({ title: '班群', messages: [
        { kind: 'msg', sender: 'B', text: '1' },
        { kind: 'msg', sender: 'C', text: '2' },
        { kind: 'note', text: '有人撤回了一条消息' },
        { kind: 'msg', sender: 'B', text: '3' },
    ] }, normalizeChatShowSettings({}), {});
    assert.equal(group.title, '班群');
    assert.equal(group.messages[0].color, group.messages[3].color);
    assert.equal(group.messages[0].showName, false);
    const three = buildChatPageModel({ messages: ['B', 'C', 'D'].map((s) => ({ kind: 'msg', sender: s, text: s })) }, normalizeChatShowSettings({}), {});
    assert.equal(three.group, true);
    assert.equal(three.messages.every((m) => m.showName), true);
});

test('gate: chat reveal delay scales with text length and speed, within bounds', () => {
    assert.equal(chatRevealDelayMs('', 'medium'), 500);
    assert.ok(chatRevealDelayMs('一'.repeat(20), 'medium') > 500);
    assert.equal(chatRevealDelayMs('一'.repeat(500), 'medium'), 2200);
    assert.ok(chatRevealDelayMs('一二三', 'fast') < chatRevealDelayMs('一二三', 'slow'));
    assert.equal(readableTextColor('#ffffff'), '#1f1f1f');
    assert.equal(readableTextColor('#000000'), '#ffffff');
});
