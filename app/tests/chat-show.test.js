import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatMarker, extractChatBlocks, formatChatBlockAsText, parseChatMarker } from '../src/scene/chat-blocks.js';
import {
    CHAT_SHOW_DEFAULTS,
    CHAT_SHOW_PROMPT_RULE,
    buildChatPageModel,
    chatRevealDelayMs,
    chatVoiceSeconds,
    normalizeChatMessageType,
    findChatContact,
    normalizeChatShowSettings,
    readableTextColor,
    resolveChatSender,
    resolveChatShowPromptRule,
} from '../src/visual/igs-ui/chat-show-runtime.js';
import { CHAT_THEME_PALETTES, resolveChatTheme } from '../src/visual/igs-ui/chat-themes.js';
import { isSystemRole, normalizeSystemRoleSettings, stripRoleBrackets } from '../src/visual/igs-ui/system-role.js';

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
    assert.deepEqual(s.sound, { enabled: false, volume: 1, preset: 'cute' });
    assert.equal(s.unknownSide, 'right');
    assert.deepEqual(s.defaultColors, { left: '#ffffff', right: '#aabbcc' });
    assert.deepEqual(s.contacts, { 爱丽丝: { aliases: ['小爱'], color: '#ff00aa', side: 'right' } });
});

test('gate: chat show bubble radius normalizes, clamps and renders a settings field', async () => {
    assert.equal(normalizeChatShowSettings(null).bubbleRadius, 16);
    assert.equal(normalizeChatShowSettings({ bubbleRadius: '8' }).bubbleRadius, 8);
    assert.equal(normalizeChatShowSettings({ bubbleRadius: 99 }).bubbleRadius, 24);
    assert.equal(normalizeChatShowSettings({ bubbleRadius: -3 }).bubbleRadius, 0);
    assert.equal(normalizeChatShowSettings({ bubbleRadius: 'x' }).bubbleRadius, 16);
    const { renderChatShowSettings } = await import('../src/visual/igs-ui/settings-fields.js');
    const html = renderChatShowSettings(normalizeChatShowSettings({ enabled: true, bubbleRadius: 10 }));
    assert.match(html, /data-path="readerSettings\.chatShow\.bubbleRadius"/);
    assert.match(html, /<option value="10" selected>10px<\/option>/);
    assert.match(html, /<option value="0">直角<\/option>/);
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

test('gate: chat time tag and message types parse inside blocks', () => {
    const { chats } = extractChatBlocks('[igs-chat:A]\n[igs-chat-time:昨天 22:14]\n[igs-msg:A|海边的照片|图片]\n[igs-msg:A||撤回]\n[igs-msg:B|晚安]');
    assert.deepEqual(chats[0].messages.map((m) => [m.kind, m.type || '']), [['time', ''], ['msg', '图片'], ['msg', '撤回'], ['msg', '']]);
    const timeOnly = extractChatBlocks('[igs-chat-time:10:00]\n正文');
    assert.equal(timeOnly.chats.length, 0);
    assert.equal(timeOnly.text, '10:00\n正文');
});

test('gate: chat message types accept chinese and english aliases', () => {
    assert.equal(normalizeChatMessageType('图片'), 'image');
    assert.equal(normalizeChatMessageType('IMG'), 'image');
    assert.equal(normalizeChatMessageType('语音'), 'voice');
    assert.equal(normalizeChatMessageType('表情包'), 'sticker');
    assert.equal(normalizeChatMessageType('撤回'), 'recall');
    assert.equal(normalizeChatMessageType('红包'), 'text');
    assert.equal(normalizeChatMessageType(''), 'text');
    assert.equal(chatVoiceSeconds(''), 1);
    assert.equal(chatVoiceSeconds('一'.repeat(20)), 5);
    assert.equal(chatVoiceSeconds('一'.repeat(999)), 60);
});

test('gate: chat model turns recalls into notes and fills voice, avatar and theme fields', () => {
    const settings = normalizeChatShowSettings({ showAvatars: true, followTheme: true });
    const theme = resolveChatTheme('cute-pink');
    const model = buildChatPageModel({ title: '', messages: [
        { kind: 'time', text: '10:00' },
        { kind: 'msg', sender: '爱丽丝', text: '好想你呀', type: '语音' },
        { kind: 'msg', sender: '爱丽丝', text: '', type: '撤回' },
        { kind: 'msg', sender: '{{user}}', text: '？', type: '撤回' },
        { kind: 'msg', sender: '{{user}}', text: '嗯' },
    ] }, settings, { userName: '小明', theme, avatarFor: (key) => (key === '爱丽丝' ? 'https://example.com/a.png' : '') });
    assert.deepEqual(model.messages.map((m) => m.kind), ['time', 'msg', 'recall', 'recall', 'msg']);
    assert.equal(model.messages[1].type, 'voice');
    assert.equal(model.messages[1].seconds, 1);
    assert.equal(model.messages[1].avatar, 'https://example.com/a.png');
    assert.equal(model.messages[2].text, '爱丽丝撤回了一条消息');
    assert.equal(model.messages[3].text, '你撤回了一条消息');
    assert.equal(model.messages[4].avatar, '');
    assert.equal(model.messages[4].initial, '小');
    assert.equal(model.messages[1].color, theme.left);
    assert.equal(model.messages[4].color, theme.right);
    assert.equal(model.theme, theme);
    const plain = buildChatPageModel({ messages: [{ kind: 'msg', sender: 'A', text: 'x' }] }, normalizeChatShowSettings({}), { theme });
    assert.equal(plain.theme, null);
    assert.equal(plain.messages[0].initial, undefined);
    assert.equal(plain.messages[0].color, CHAT_SHOW_DEFAULTS.defaultColors.left);
});

test('gate: chat themes cover every dialog skin and fall back to default', () => {
    for (const key of Object.keys(CHAT_THEME_PALETTES)) {
        const theme = resolveChatTheme(key);
        assert.equal(theme.key, key);
        assert.ok(theme.font);
        for (const color of [theme.shell, theme.head, theme.left, theme.right]) assert.match(color, /^#[0-9a-f]{6}$/);
    }
    assert.equal(resolveChatTheme('nope').key, 'default');
    assert.equal(Object.keys(CHAT_THEME_PALETTES).length, 18);
});

test('gate: chat prompt rule stores empty for default and resolves custom text', () => {
    assert.equal(normalizeChatShowSettings({}).promptRule, '');
    assert.equal(normalizeChatShowSettings({ promptRule: `  ${CHAT_SHOW_PROMPT_RULE}\n` }).promptRule, '');
    assert.equal(normalizeChatShowSettings({ promptRule: '  自定义  ' }).promptRule, '自定义');
    assert.equal(normalizeChatShowSettings({ promptRule: 42 }).promptRule, '');
    assert.equal(resolveChatShowPromptRule({}), CHAT_SHOW_PROMPT_RULE);
    assert.equal(resolveChatShowPromptRule({ promptRule: '自定义' }), '自定义');
});

test('gate: system roles share one word pool, ignore brackets and render as chat notes', () => {
    assert.equal(stripRoleBrackets('【系统】'), '系统');
    assert.equal(stripRoleBrackets(' (System) '), 'System');
    assert.equal(isSystemRole('【系统】', {}), true);
    assert.equal(isSystemRole('system', {}), true);
    assert.equal(isSystemRole('系统之子', {}), false);
    assert.equal(isSystemRole('公告', { words: ['【公告】'] }), true);
    assert.equal(isSystemRole('系统', { words: [] }), false);
    const s = normalizeSystemRoleSettings({ words: ['系统', '【系统】', ''], font: 'inherit', color: 'red', align: 'x', showName: 'yes' });
    assert.deepEqual(s, { words: ['系统'], showName: false, font: '', color: '', align: 'center' });
    const model = buildChatPageModel({ title: '群', messages: [
        { kind: 'msg', sender: '【系统】', text: '爱丽丝 加入了群聊' },
        { kind: 'msg', sender: 'A', text: 'hi' },
        { kind: 'msg', sender: 'B', text: 'yo' },
    ] }, normalizeChatShowSettings({}), { systemRole: {} });
    assert.deepEqual(model.messages.map((m) => m.kind), ['system', 'msg', 'msg']);
    assert.equal(model.messages[0].text, '爱丽丝 加入了群聊');
    assert.equal(model.group, false);
    assert.equal(normalizeChatShowSettings({}).returnMode, 'full');
    assert.equal(normalizeChatShowSettings({ returnMode: 'replay' }).returnMode, 'replay');
    assert.equal(normalizeChatShowSettings({ returnMode: 'x' }).returnMode, 'full');
});

test('gate: a contact color stays fixed regardless of theme and group palette', () => {
    const settings = normalizeChatShowSettings({ followTheme: true, contacts: { 爱丽丝: { color: '#123456' } } });
    const model = buildChatPageModel({ messages: ['爱丽丝', 'B', 'C'].map((s) => ({ kind: 'msg', sender: s, text: s })) }, settings, { theme: resolveChatTheme('cute-pink') });
    assert.equal(model.messages[0].color, '#123456');
    assert.notEqual(model.messages[1].color, '#123456');
});

test('gate: system roles written as igs-msg senders become notes end to end', () => {
    const { chats } = extractChatBlocks('[igs-chat:群]\n[igs-msg:【系统】|A 加入了群聊]\n[igs-msg:System|欢迎]\n[igs-msg:A|大家好]');
    const model = buildChatPageModel(chats[0], normalizeChatShowSettings({}), { systemRole: {} });
    assert.deepEqual(model.messages.map((m) => [m.kind, m.text]), [['system', 'A 加入了群聊'], ['system', '欢迎'], ['msg', '大家好']]);
});
