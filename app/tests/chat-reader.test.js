import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { normalizeFxReaderSettings } from '../src/visual/igs-ui/fx-settings.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';
import { logRowsOf } from '../src/visual/igs-ui/log-reader-model.js';
import { chatSettingsOf, isChatCont } from '../src/visual/igs-ui/chat-reader-model.js';
import { normalizeChatReaderSettings } from '../src/visual/igs-ui/chat-reader-settings.js';
import { buildChatPageModel } from '../src/visual/igs-ui/chat-show-runtime.js';
import { finishChatReveal, syncChatReader } from '../src/visual/igs-ui/chat-reader-layer.js';
import { CHAT_READER_STYLE_TEXT } from '../src/visual/igs-ui/chat-reader-style.js';

const page = (textType, segmentBody, extra = {}) => ({ textType, segmentBody, bubbleSpeaker: '', bubbleMood: '', sceneStateForBg: null, ...extra });

test('设置默认值与取值整理', () => {
    const d = normalizeChatReaderSettings(undefined);
    assert.deepEqual([d.on, d.radius, d.fontSize, d.leftColor, d.rightColor, d.followTheme, d.thoughtClear, d.narr, d.typing, d.dim, d.avatar, d.userAvatar, d.groupGap, d.perTap],
        [false, 16, 15, '#ffffff', '#95ec69', false, true, 'bar', true, 0.3, 'card', false, 'normal', 4]);
    const s = normalizeChatReaderSettings({ on: true, radius: 7, fontSize: 40, leftColor: 'red', dim: 0.5, narr: 'x', groupGap: 'wide', perTap: 9 });
    assert.deepEqual([s.on, s.radius, s.fontSize, s.leftColor, s.dim, s.narr, s.groupGap, s.perTap], [true, 16, 19, '#ffffff', 0.3, 'bar', 'wide', 5]);
    assert.equal(normalizeFxReaderSettings({}).chatReader.on, false);
    assert.equal(normalizeSettingsValue('readerSettings.chatReader.on', 'true'), true);
    assert.equal(normalizeSettingsValue('readerSettings.chatReader.leftColor', 'nope'), '#ffffff');
    assert.equal(chatSettingsOf({ chatReader: { chain: false, perTap: 5 } }).perTap, 1);
});

test('分组：换人、旁白、场景、聊天页、换情绪都另起一组', () => {
    const rows = logRowsOf([
        page('dialogue', '一', { bubbleSpeaker: '小雪', bubbleMood: '开心' }),
        page('dialogue', '二', { bubbleSpeaker: '小雪', bubbleMood: '难过' }),
        page('narration', '风。'),
        page('dialogue', '三', { bubbleSpeaker: '小雪' }),
        page('dialogue', '四', { bubbleSpeaker: '我' }),
        page('dialogue', '五', { bubbleSpeaker: '我', sceneStateForBg: { scene: '街角', time: '夜' } }),
    ], { keyOf: (n) => n, userKey: '我' });
    assert.equal(isChatCont(rows, 1), false);
    assert.equal(isChatCont(rows, 3), false);
    assert.equal(isChatCont(rows, 4), false);
    assert.equal(isChatCont(rows, 5), false);
});

function mountDom() {
    const dom = new JSDOM('<!doctype html><html><body><div id="igs-overlay"><div id="igs-stage-motion"><div id="igs-dialog-layer"><div class="igs-dialog" id="igs-dialog"></div></div></div></div></body></html>', { pretendToBeVisual: true });
    return { dom, overlay: dom.window.document.getElementById('igs-overlay') };
}

function viewOf(rows, extra = {}) {
    return {
        floorKey: 'm1:1', rows, upto: rows.length - 1, batchStart: 0, live: -1,
        settings: { ...normalizeChatReaderSettings(extra.settings), adjust: {} }, skin: 'default', tone: 'dark', fonts: {}, hidden: false,
        avatarOf: () => null, symbolOf: (row) => (row.mood ? 'heart' : ''), chipKindOf: () => 'heart', htmlOf: (row) => row.text,
        canSpeak: () => false, cardsOf: () => [], onTap: () => {}, onPlay: () => {}, onSaveAdjust: () => {},
        ...extra.view,
    };
}

test('DOM：组头才有头像和尖角，心里话带 is-thought，旁白不进气泡，名字前有取色小圆点', () => {
    const { overlay } = mountDom();
    const rows = logRowsOf([
        page('dialogue', '一', { bubbleSpeaker: '小雪', bubbleMood: '心动' }),
        page('thought', '*他会来吗*', { bubbleSpeaker: '小雪' }),
        page('narration', '风吹过。'),
        page('dialogue', '好。', { bubbleSpeaker: '我' }),
    ], { keyOf: (n) => n, userKey: '我' });
    syncChatReader(overlay, viewOf(rows));
    assert.equal(overlay.getAttribute('data-igs-chat-reader'), 'on');
    assert.equal(overlay.getAttribute('data-igs-log-reader'), 'on');
    const groups = overlay.querySelectorAll('#igs-chat-reader .igs-cr-group');
    assert.equal(groups.length, 2);
    assert.equal(groups[0].querySelectorAll('.igs-cr-av').length, 1);
    assert.equal(groups[0].querySelectorAll('.igs-cr-bubble').length, 2);
    assert.equal(groups[0].querySelectorAll('.igs-cr-bubble.is-first').length, 1);
    assert.ok(groups[0].querySelectorAll('.igs-cr-bubble')[1].classList.contains('is-thought'));
    assert.ok(groups[0].querySelector('.igs-cr-name .igs-cr-dot'));
    assert.equal(groups[0].querySelector('.igs-cr-chip').textContent, '心动');
    assert.ok(groups[1].classList.contains('is-right'));
    assert.equal(groups[1].querySelectorAll('.igs-cr-av').length, 0, 'User 头像默认关闭');
    assert.equal(overlay.querySelectorAll('.igs-cr-narr').length, 1);
    assert.equal(overlay.querySelector('.igs-cr-narr .igs-cr-bubble'), null);
    syncChatReader(overlay, null);
    assert.equal(overlay.getAttribute('data-igs-chat-reader'), null);
    assert.equal(overlay.getAttribute('data-igs-log-reader'), null);
});

test('DOM：同一人换情绪另起一组，新组头带头像、名字和胶囊，没有单独的情绪小字行', () => {
    const { overlay } = mountDom();
    const rows = logRowsOf([
        page('dialogue', '一', { bubbleSpeaker: '小雪', bubbleMood: '开心' }),
        page('dialogue', '二', { bubbleSpeaker: '小雪', bubbleMood: '难过' }),
        page('dialogue', '三', { bubbleSpeaker: '小雪' }),
    ], { keyOf: (n) => n, groupOf: (m) => m });
    syncChatReader(overlay, viewOf(rows));
    const groups = overlay.querySelectorAll('.igs-cr-group');
    assert.equal(groups.length, 2);
    assert.equal(overlay.querySelectorAll('.igs-cr-av').length, 2);
    assert.equal(groups[1].querySelector('.igs-cr-name b').textContent, '小雪');
    assert.equal(groups[1].querySelector('.igs-cr-chip').textContent, '难过');
    assert.equal(groups[1].querySelectorAll('.igs-cr-bubble').length, 2);
    assert.equal(overlay.querySelector('.igs-cr-sub'), null);
});

test('DOM：开着「正在输入」时先出三点再换正文；关闭则直接出；补完后整条显示', async () => {
    for (const typing of [true, false]) {
        const { overlay, dom } = mountDom();
        const rows = logRowsOf([page('dialogue', '你好', { bubbleSpeaker: '小雪' })], { keyOf: (n) => n });
        const { revealing } = syncChatReader(overlay, viewOf(rows, { settings: { typing }, view: { live: 0 } }));
        const hasDots = Boolean(overlay.querySelector('.igs-cr-dots'));
        assert.equal(hasDots, typing);
        assert.ok(finishChatReveal(overlay));
        await revealing;
        assert.equal(overlay.querySelector('.igs-cr-dots'), null);
        assert.equal(overlay.querySelector('.igs-cr-bubble .igs-cr-text').textContent, '你好');
        dom.window.close();
    }
});

test('样式：旁白深底条与投影字两档、心里话两档、小圆点不描边', () => {
    assert.match(CHAT_READER_STYLE_TEXT, /\[data-narr="shadow"\] \.igs-cr-narr\{background:none/);
    assert.match(CHAT_READER_STYLE_TEXT, /\[data-thought="solid"\] \.igs-cr-bubble\.is-thought/);
    assert.doesNotMatch(CHAT_READER_STYLE_TEXT.match(/\.igs-cr-dot\{[^}]*\}/)[0], /box-shadow|border:|border-width|outline/);
});

test('旧线上聊天演出：左侧统一用默认色并带姓名取色圆点，联系人自设色仍优先', () => {
    const chat = { messages: [
        { kind: 'msg', sender: '甲', text: 'a' }, { kind: 'msg', sender: '乙', text: 'b' }, { kind: 'msg', sender: '丙', text: 'c' },
    ] };
    const model = buildChatPageModel(chat, { enabled: true, unknownSide: 'left', contacts: { 乙: { color: '#ffe1ec' } } }, { nameColorOf: (key) => (key === '甲' ? '#112233' : '') });
    const [a, b, c] = model.messages;
    assert.equal(a.color, '#ffffff');
    assert.equal(b.color, '#ffe1ec');
    assert.equal(c.color, '#ffffff');
    assert.equal(a.nameDot, '#112233');
    assert.match(c.nameDot, /^#[0-9a-f]{6}$/);
});

test('DOM：对方头像、User 头像各自可开关', () => {
    const rows = logRowsOf([
        page('dialogue', '你好', { bubbleSpeaker: '小雪' }),
        page('dialogue', '嗯', { bubbleSpeaker: '我' }),
    ], { keyOf: (n) => n, userKey: '我' });
    const count = (settings) => { const { overlay } = mountDom(); syncChatReader(overlay, viewOf(rows, { settings })); return overlay.querySelectorAll('.igs-cr-av').length; };
    assert.equal(count({}), 1);
    assert.equal(count({ charAvatar: false }), 0);
    assert.equal(count({ userAvatar: true }), 2);
    assert.equal(count({ charAvatar: false, userAvatar: true }), 1);
});

test('气泡模式按组计批：一组不被切开；字体带兜底且不被酒馆覆盖', async () => {
    const { nextBatchEnd } = await import('../src/visual/igs-ui/log-reader-model.js');
    const rows = [
        { key: 'a', speaker: 'A', kind: 'dialogue' }, { key: 'a', speaker: 'A', kind: 'dialogue' }, { key: 'a', speaker: 'A', kind: 'dialogue' },
        { key: 'b', speaker: 'B', kind: 'dialogue' }, { key: 'b', speaker: 'B', kind: 'dialogue' },
    ].map((r, index) => ({ ...r, index }));
    assert.equal(nextBatchEnd(rows, 0, 1, isChatCont), 3);
    assert.equal(nextBatchEnd(rows, 0, 2, isChatCont), 5);
    assert.equal(nextBatchEnd(rows, 0, 1), 1);
    assert.match(CHAT_READER_STYLE_TEXT, /font-family:var\(--igs-cr-font,[^;]*sans-serif\)!important/);
});
