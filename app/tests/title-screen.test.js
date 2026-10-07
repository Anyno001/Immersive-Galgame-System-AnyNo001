import test from 'node:test';
import assert from 'node:assert/strict';
import { DIALOG_SKIN_CHOICES } from '../src/visual/igs-ui/dialog-skin-catalog.js';
import {
    TITLE_SCREEN_ID,
    TITLE_SCREEN_STYLE_TEXT,
    TITLE_SKIN_ATTR,
    buildTitleScreenModel,
    createTitleGate,
    playOpeningCard,
    reduceTitleAction,
    removeTitleScreen,
    renderTitleScreen,
    shouldGateTitleScreen,
    titleCardOf,
} from '../src/visual/igs-ui/title-screen.js';
import { createIgsReaderHost } from '../src/visual/igs-ui/reader-host.js';

function fakeElement(doc) {
    const attrs = new Map();
    const listeners = new Map();
    return {
        ownerDocument: doc,
        id: '',
        className: '',
        innerHTML: '',
        children: [],
        parent: null,
        setAttribute(key, value) { attrs.set(key, String(value)); },
        getAttribute(key) { return attrs.has(key) ? attrs.get(key) : null; },
        addEventListener(type, fn) { listeners.set(type, fn); },
        fire(type, event) { const fn = listeners.get(type); if (fn) fn(event); },
        querySelector(selector) {
            return selector.startsWith('#') ? this.children.find((child) => `#${child.id}` === selector) || null : null;
        },
        appendChild(child) { this.children.push(child); child.parent = this; return child; },
        remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); },
    };
}

function fakeOverlay() {
    const doc = { createElement: () => fakeElement(doc) };
    return fakeElement(doc);
}

function clickOn(act) {
    return { stopPropagation() {}, target: { closest: () => ({ disabled: false, getAttribute: () => act }) } };
}

function snapshotOf({ worldview = 'modern', skin = 'default', sceneAssets = {}, content = {} } = {}) {
    return {
        readerSettings: { dialogSkin: skin, _worldview: worldview, _sceneAssets: sceneAssets },
        content: { currentIndex: 0, ...content },
    };
}

test('title-screen:gates-only-the-first-page-of-floor-zero', () => {
    const readerSettings = { titleScreen: true };
    assert.equal(shouldGateTitleScreen({ readerSettings, messageId: 0, index: 0 }), true);
    assert.equal(shouldGateTitleScreen({ readerSettings, messageId: '0', index: 0 }), true);
    assert.equal(shouldGateTitleScreen({ readerSettings, messageId: 3, index: 0 }), false, '别的楼层不拦');
    assert.equal(shouldGateTitleScreen({ readerSettings, messageId: 0, index: 2 }), false, '重新加载停在后面的页不拦');
    assert.equal(shouldGateTitleScreen({ readerSettings, messageId: 0, index: 0, startAtEnd: true }), false, '从末尾打开不拦');
    assert.equal(shouldGateTitleScreen({ readerSettings: { titleScreen: false }, messageId: 0, index: 0 }), false, '设置里关掉不拦');
    assert.equal(shouldGateTitleScreen({ readerSettings, messageId: null, index: 0 }), false);
    assert.deepEqual(createTitleGate(), { view: 'menu', hasLater: null, pick: null, busy: false });
});

test('title-screen:new-chat-picks-a-worldview-first-replay-starts-directly', () => {
    const fresh = buildTitleScreenModel({ snapshot: snapshotOf(), gate: { ...createTitleGate(), hasLater: false } });
    assert.equal(fresh.newChat, true);
    let step = reduceTitleAction({ ...createTitleGate(), hasLater: false }, fresh, 'start');
    assert.equal(step.gate.view, 'worldview', '新聊天点开始先进世界观页');
    assert.equal(step.effect, undefined);

    const replay = buildTitleScreenModel({ snapshot: snapshotOf(), gate: { ...createTitleGate(), hasLater: true } });
    assert.equal(replay.newChat, false);
    assert.equal(replay.hasLater, true);
    assert.equal(reduceTitleAction({ ...createTitleGate(), hasLater: true }, replay, 'start').effect, 'start', '已有后续楼层时开始 = 直接重播');
    assert.equal(reduceTitleAction(createTitleGate(), replay, 'continue').effect, 'continue');
    assert.equal(reduceTitleAction(createTitleGate(), replay, 'settings').effect, 'settings');
    assert.equal(reduceTitleAction(createTitleGate(), replay, 'close').effect, 'close');

    step = reduceTitleAction(step.gate, fresh, 'world', 'ancient');
    assert.deepEqual(step.gate.pick, { worldview: 'ancient', skin: 'qinglv-shanshui' }, '点世界观卡按对照表预选皮肤');
    const picked = buildTitleScreenModel({ snapshot: snapshotOf(), gate: step.gate });
    step = reduceTitleAction(step.gate, picked, 'skin', 'retro-japanese');
    assert.deepEqual(step.gate.pick, { worldview: 'ancient', skin: 'retro-japanese' }, '推荐之外的皮肤也能选');
    const chosen = buildTitleScreenModel({ snapshot: snapshotOf(), gate: { ...step.gate, hasLater: false } });
    const confirm = reduceTitleAction(step.gate, chosen, 'confirm');
    assert.equal(confirm.effect, 'save-start');
    assert.deepEqual(confirm.pick, { worldview: 'ancient', skin: 'retro-japanese' });
    const saveOnly = buildTitleScreenModel({ snapshot: snapshotOf(), gate: { ...step.gate, hasLater: true } });
    assert.equal(reduceTitleAction(step.gate, saveOnly, 'confirm').effect, 'save', '已有后续楼层时只保存、回菜单');
    assert.equal(reduceTitleAction(step.gate, fresh, 'back').gate.view, 'menu');
});

test('title-screen:model-uses-card-name-first-scene-and-card-skin', () => {
    const ctx = { characterId: 0, characters: [{ name: '星野', avatar: 'hoshino.png' }] };
    const card = titleCardOf(ctx);
    assert.deepEqual(card, { name: '星野', avatarUrl: '/characters/hoshino.png' });
    assert.deepEqual(titleCardOf({}), { name: '', avatarUrl: '' }, '没有角色卡时不出标题和头像');

    const withScene = buildTitleScreenModel({
        snapshot: snapshotOf({ worldview: 'scifi', skin: 'gradient-veil', sceneAssets: { dialogSkin: 'gradient-veil' }, content: { backgroundImage: 'bg/deck.png', spriteImage: 'sp/hoshino.png' } }),
        card,
        resolveUrl: (url) => `resolved:${url}`,
    });
    assert.equal(withScene.title, '星野');
    assert.equal(withScene.background, 'resolved:bg/deck.png', '背景取开场白第一页的场景图');
    assert.equal(withScene.sprite, 'resolved:sp/hoshino.png');
    assert.deepEqual(withScene.pick, { worldview: 'scifi', skin: 'gradient-veil' }, '卡上记过皮肤时预选它');

    const bare = buildTitleScreenModel({ snapshot: snapshotOf({ worldview: 'fantasy', skin: 'default' }), globalSkin: 'default' });
    assert.equal(bare.title, '序章');
    assert.equal(bare.background, '');
    assert.equal(bare.pick.skin, 'elegant-european', '卡上没记皮肤时按世界观对照表预选');
    assert.equal(bare.newChat, false, '后续楼层还没查到时不当新聊天');
});

test('title-screen:menu-and-worldview-page-render-and-dispatch-clicks', () => {
    const overlay = fakeOverlay();
    const acts = [];
    const handlers = { onAction: (act, value) => acts.push([act, value]) };
    const menu = buildTitleScreenModel({ snapshot: snapshotOf(), gate: { ...createTitleGate(), hasLater: true }, card: { name: '星野' } });
    const layer = renderTitleScreen(overlay, menu, handlers);
    assert.equal(layer.id, TITLE_SCREEN_ID);
    assert.equal(layer.getAttribute('data-igs-title-view'), 'menu');
    assert.equal(layer.getAttribute(TITLE_SKIN_ATTR), 'default');
    for (const act of ['start', 'continue', 'worldview', 'settings', 'close']) assert.match(layer.innerHTML, new RegExp(`data-ts-act="${act}"`), act);
    assert.match(layer.innerHTML, /从头重播/);
    assert.match(layer.innerHTML, /星野/);

    const fresh = buildTitleScreenModel({ snapshot: snapshotOf(), gate: { ...createTitleGate(), hasLater: false } });
    renderTitleScreen(overlay, fresh, handlers);
    assert.doesNotMatch(layer.innerHTML, /data-ts-act="continue"/, '新聊天没有「继续」');
    assert.equal(overlay.children.length, 1, '重画复用同一层');

    const page = buildTitleScreenModel({ snapshot: snapshotOf(), gate: { ...createTitleGate(), hasLater: false, view: 'worldview', pick: { worldview: 'horror', skin: 'horror-psych' } } });
    renderTitleScreen(overlay, page, handlers);
    assert.equal(layer.getAttribute('data-igs-title-view'), 'worldview');
    assert.equal(layer.getAttribute(TITLE_SKIN_ATTR), 'horror-psych', '世界观页按正在选的皮肤着色');
    assert.equal((layer.innerHTML.match(/data-ts-act="world:/g) || []).length, 8, '8 个世界观各一张卡');
    assert.match(layer.innerHTML, /data-ts-act="skin:horror-gore"/);
    assert.match(layer.innerHTML, /就这样，开始/);

    layer.fire('click', clickOn('world:scifi'));
    layer.fire('click', clickOn('confirm'));
    layer.fire('change', { target: { hasAttribute: (name) => name === 'data-ts-skin-select', value: 'cute-pink' } });
    assert.deepEqual(acts, [['world', 'scifi'], ['confirm', ''], ['skin', 'cute-pink']]);

    assert.equal(removeTitleScreen(overlay), true);
    assert.equal(overlay.children.length, 0);
    assert.equal(removeTitleScreen(overlay), false);
});

test('title-screen:opening-card-reuses-the-scene-title-card-and-can-be-skipped', async () => {
    const overlay = fakeOverlay();
    const layer = renderTitleScreen(overlay, buildTitleScreenModel({ snapshot: snapshotOf() }), {});
    const pending = [];
    const schedule = (fn, ms) => pending.push([fn, ms]);
    const opening = playOpeningCard(overlay, { main: '序章', sub: '星野', worldview: 'scifi', schedule });
    assert.equal(layer.getAttribute('data-igs-title-view'), 'opening');
    assert.match(layer.innerHTML, /class="igs-fx-title-card is-scifi"/, '换皮世界观带同一套标题卡类名');
    assert.match(layer.innerHTML, /序章[\s\S]*星野/);
    assert.equal(pending.length, 1);
    layer.fire('click', { stopPropagation() {}, target: { closest: () => null } });
    assert.equal(await opening, true, '点一下就收起');

    const ancient = playOpeningCard(overlay, { main: '序章', sub: '—— 星野', worldview: 'ancient', schedule });
    assert.match(layer.innerHTML, /igs-fx-title-card is-ancient/);
    assert.doesNotMatch(layer.innerHTML, /——/, '古代竖幅不带破折号');
    pending.at(-1)[0]();
    assert.equal(await ancient, true, '到时自动收起');
    assert.equal(await playOpeningCard(fakeOverlay(), { schedule }), false, '主界面不在时不放');
});

test('title-screen:reader-host-holds-floor-zero-behind-the-title-gate', async () => {
    const makeHost = (readerSettings = {}) => createIgsReaderHost({
        global: {},
        getUnifiedSettings: () => ({
            bridge: { openMode: 'pc', sceneAssets: { enabled: true, scenes: {}, characters: {} } },
            readerMode: 'pc',
            readerSettings,
        }),
        getAdjacentMessage: async () => null,
    });
    const payload = (messageId) => ({ messageId, message: { text: '第一句。\n\n第二句。' } });
    const reasonOf = async (opened) => (await opened.controller.invokeAction('next') || {}).reason;

    let host = makeHost();
    assert.equal(await reasonOf(host.openReader(payload(0), { mode: 'pc' })), 'title-screen', '第 0 层开头先停在主界面，翻页被拦');
    assert.notEqual(await reasonOf(host.openReader(payload(0), { mode: 'pc', skipTitle: true })), 'title-screen', '上一轮切回第 0 层不出主界面');
    assert.notEqual(await reasonOf(host.openReader(payload(3), { mode: 'pc' })), 'title-screen', '别的楼层照常翻页');
    host.destroy();

    host = makeHost({ titleScreen: false });
    assert.notEqual(await reasonOf(host.openReader(payload(0), { mode: 'pc' })), 'title-screen', '设置里关掉就直接演');
    host.destroy();
});

test('title-screen:every-dialog-skin-has-a-title-theme', () => {
    for (const [skin] of DIALOG_SKIN_CHOICES) {
        assert.ok(TITLE_SCREEN_STYLE_TEXT.includes(`[${TITLE_SKIN_ATTR}="${skin}"]{`), skin);
    }
    assert.match(TITLE_SCREEN_STYLE_TEXT, /@container \(max-width:560px\)/, '窄屏另有排法');
});
