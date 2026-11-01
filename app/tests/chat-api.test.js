import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicApi } from '../src/api/public-api.js';
import { CHAT_API_VERSION, createChatsApi } from '../src/api/chat-api.js';

const chats = createChatsApi();

test('createPublicApi：api 带有 chats 及 version', () => {
    const api = createPublicApi({ version: 'test' }).api;
    assert.equal(api.chats.version, CHAT_API_VERSION);
    assert.equal(CHAT_API_VERSION, 1);
    assert.equal(typeof api.chats.collect, 'function');
});

test('显式聊天块：带标题，消息按发送者、正文、类型拆开', () => {
    const result = chats.collect([
        '[igs-chat:班级群]',
        '[igs-msg:小明|晚上好]',
        '[igs-msg:小红|看这个|image]',
        '[igs-chat-end]',
    ].join('\n'));
    assert.deepEqual(result, [{
        index: 0,
        title: '班级群',
        messages: [
            { kind: 'msg', sender: '小明', text: '晚上好', type: '', system: false },
            { kind: 'msg', sender: '小红', text: '看这个', type: 'image', system: false },
        ],
    }]);
});

test('隐式聊天块：没有 igs-chat 开头也能收成一块，标题为空', () => {
    const result = chats.collect('[igs-msg:甲|你好]\n[igs-msg:乙|在吗]');
    assert.equal(result.length, 1);
    assert.equal(result[0].title, '');
    assert.deepEqual(result[0].messages.map((m) => m.sender), ['甲', '乙']);
});

test('缺 igs-chat-end：遇到下一个场景标签自动收口', () => {
    const result = chats.collect([
        '[igs-chat:群聊]',
        '[igs-msg:甲|第一句]',
        '[igs-char:甲|开心|他笑了]',
        '后面的正文',
    ].join('\n'));
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].messages.map((m) => m.text), ['第一句']);
});

test('显式块内的旁白为 note，只有 kind 和 text', () => {
    const result = chats.collect([
        '[igs-chat:群聊]',
        '[igs-msg:甲|在吗]',
        '屏幕那头沉默了一会儿。',
        '[igs-msg:乙|在]',
        '[igs-chat-end]',
    ].join('\n'));
    assert.deepEqual(result[0].messages[1], { kind: 'note', text: '屏幕那头沉默了一会儿。' });
    assert.equal(result[0].messages.length, 3);
});

test('igs-fx 行不进 messages', () => {
    const result = chats.collect([
        '[igs-chat:群聊]',
        '[igs-msg:甲|你好]',
        '[igs-fx:shake]',
        '[igs-msg:乙|嗨]',
        '[igs-chat-end]',
    ].join('\n'));
    assert.deepEqual(result[0].messages.map((m) => m.kind), ['msg', 'msg']);
    assert.ok(result[0].messages.every((m) => !String(m.text).includes('igs-fx')));
});

test('HTML 卡片默认标签里的聊天标签不算，卡片外的照常解析', () => {
    const text = [
        '<htm1fenge>',
        '[igs-chat:卡片里]',
        '[igs-msg:甲|不该被读到]',
        '[igs-chat-end]',
        '</htm1fenge>',
        '[igs-chat:卡片外]',
        '[igs-msg:乙|应该被读到]',
        '[igs-chat-end]',
    ].join('\n');
    const result = chats.collect(text);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, '卡片外');
    assert.equal(result[0].index, 0);
});

test('options.htmlCardTags 为字符串时替换卡片标签', () => {
    const text = '<mycard>\n[igs-chat:卡]\n[igs-msg:甲|藏起来]\n[igs-chat-end]\n</mycard>\n[igs-chat:外]\n[igs-msg:乙|可见]\n[igs-chat-end]';
    assert.deepEqual(chats.collect(text, { htmlCardTags: 'mycard' }).map((c) => c.title), ['外']);
    assert.deepEqual(chats.collect(text).map((c) => c.title), ['卡', '外']);
});

test('igs-chat-time 为 time，只有 kind 和 text', () => {
    const result = chats.collect('[igs-chat:群聊]\n[igs-chat-time:昨天 22:10]\n[igs-msg:甲|睡了吗]\n[igs-chat-end]');
    assert.deepEqual(result[0].messages[0], { kind: 'time', text: '昨天 22:10' });
    assert.equal(result[0].messages[1].kind, 'msg');
});

test('多个聊天块：index 按出现顺序递增', () => {
    const result = chats.collect([
        '[igs-chat:一]', '[igs-msg:甲|1]', '[igs-chat-end]',
        '中间的旁白',
        '[igs-chat:二]', '[igs-msg:乙|2]', '[igs-chat-end]',
        '[igs-chat:三]', '[igs-msg:丙|3]', '[igs-chat-end]',
    ].join('\n'));
    assert.deepEqual(result.map((c) => [c.index, c.title]), [[0, '一'], [1, '二'], [2, '三']]);
});

test('system：默认词池识别系统角色，其余角色为 false', () => {
    const result = chats.collect('[igs-chat:群]\n[igs-msg:系统|甲加入了群聊]\n[igs-msg:【System】|欢迎]\n[igs-msg:甲|大家好]\n[igs-chat-end]');
    assert.deepEqual(result[0].messages.map((m) => m.system), [true, true, false]);
});

test('system：传入 systemWords 数组时替换默认词池，显式空数组即全部不算系统', () => {
    const text = '[igs-chat:群]\n[igs-msg:系统|甲加入]\n[igs-msg:管理员|禁言]\n[igs-chat-end]';
    assert.deepEqual(chats.collect(text, { systemWords: ['管理员'] })[0].messages.map((m) => m.system), [false, true]);
    assert.deepEqual(chats.collect(text, { systemWords: [] })[0].messages.map((m) => m.system), [false, false]);
    assert.deepEqual(chats.collect(text, { systemWords: '管理员' })[0].messages.map((m) => m.system), [true, false]);
});

test('空输入、非字符串输入和没有聊天标签的正文返回空数组，options 非对象不抛错', () => {
    for (const input of [undefined, null, '', 0, 12, {}, [], true]) {
        assert.deepEqual(chats.collect(input), []);
    }
    assert.deepEqual(chats.collect('只是普通正文，没有聊天。'), []);
    for (const options of [null, 'x', 5, [], true]) {
        assert.equal(chats.collect('[igs-msg:甲|好]', options).length, 1);
    }
});

test('返回对象是新对象：修改结果不影响下一次调用', () => {
    const text = '[igs-chat:群]\n[igs-chat-time:今天]\n[igs-msg:甲|你好]\n[igs-chat-end]';
    const first = chats.collect(text);
    first[0].title = '被改了';
    first[0].messages[1].text = '被改了';
    first[0].messages.push({ kind: 'note', text: '多出来的' });
    const second = chats.collect(text);
    assert.equal(second[0].title, '群');
    assert.equal(second[0].messages.length, 2);
    assert.equal(second[0].messages[1].text, '你好');
});
