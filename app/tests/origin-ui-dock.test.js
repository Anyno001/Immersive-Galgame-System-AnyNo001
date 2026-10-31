import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
    DOCK_GAP, ENTRY_DOCK_CSS, claimPanel, closeFold, ensureEntryDock, isFoldOpen, mountEntry, shouldFold, syncEntryFold, unmountEntry,
} from '../src/visual/igs-ui/entry-dock.js';
import { createStubOriginEngine } from '../src/visual/igs-ui/origin-panel-stub.js';
import { isOriginEntryShown, isOriginOpen, resolveOriginBinding, stopOrigin, syncOrigin } from '../src/visual/igs-ui/origin-panel.js';
import { clampRect, defaultRect, moveRect, readStoredRect, resizeRect, writeStoredRect, ORIGIN_MIN_H, ORIGIN_MIN_W } from '../src/visual/igs-ui/origin-panel-geometry.js';

function setup() {
    const dom = new JSDOM('<!doctype html><body><div id="front"></div></body>', { pretendToBeVisual: true });
    const { document } = dom.window;
    const front = document.getElementById('front');
    const entry = (cls, unread = '0') => {
        const node = document.createElement('button');
        node.className = cls;
        node.setAttribute('data-unread', unread);
        mountEntry(front, node);
        return node;
    };
    return { dom, document, front, entry };
}

test('收拢条件：手机、非全屏、可见入口至少 3 个', () => {
    assert.equal(shouldFold({ count: 3, mobile: true, full: false }), true);
    assert.equal(shouldFold({ count: 4, mobile: true, full: false }), true);
    assert.equal(shouldFold({ count: 2, mobile: true, full: false }), false);
    assert.equal(shouldFold({ count: 3, mobile: false, full: false }), false);
    assert.equal(shouldFold({ count: 3, mobile: true, full: true }), false);
});

test('入口坞样式：电脑 28、手机 24，小大档同比例，竖列间距 6px', () => {
    assert.equal(DOCK_GAP, 6);
    assert.match(ENTRY_DOCK_CSS, /gap:6px/);
    assert.match(ENTRY_DOCK_CSS, /--igs-entry-px:28px/);
    assert.match(ENTRY_DOCK_CSS, /\[data-size="small"\]\{--igs-entry-px:24px/);
    assert.match(ENTRY_DOCK_CSS, /\[data-size="large"\]\{--igs-entry-px:34px/);
    const mobile = ENTRY_DOCK_CSS.slice(ENTRY_DOCK_CSS.indexOf('@media (max-width:640px)'));
    assert.match(mobile, /--igs-entry-px:24px/);
    assert.match(mobile, /--igs-entry-px:20px/);
    assert.match(mobile, /--igs-entry-px:29px/);
    // 图标铺满规则只作用在各入口里的 svg 上，不能落到入口按钮本身（否则按钮被撑成坞宽）。
    const svgRule = ENTRY_DOCK_CSS.split('\n').find((line) => line.includes('svg{display:block'));
    for (const sel of svgRule.slice(0, svgRule.indexOf('{')).split(',')) assert.match(sel, / svg$/, sel);
});

test('手机上 3 个入口收成一个按钮，红点合并；2 个不收；电脑不收', () => {
    const { front, entry } = setup();
    entry('igs-aud-entry');
    entry('igs-feed-entry');
    assert.equal(syncEntryFold(front, { mobile: true }).folded, false);
    const dock = ensureEntryDock(front);
    assert.equal(dock.hasAttribute('data-fold'), false);
    const bell = entry('igs-nc-entry', '1');
    const mobile = syncEntryFold(front, { mobile: true });
    assert.deepEqual([mobile.folded, mobile.count, mobile.unread], [true, 3, true]);
    assert.equal(dock.getAttribute('data-fold'), 'closed');
    const fold = dock.querySelector('.igs-dock-fold');
    assert.ok(fold);
    assert.equal(fold.querySelector('.igs-dock-fold-dot').hidden, false);
    // 已读后红点熄灭。
    bell.setAttribute('data-unread', '0');
    syncEntryFold(front, { mobile: true });
    assert.equal(fold.querySelector('.igs-dock-fold-dot').hidden, true);
    // 电脑宽度：不收，按钮拆掉。
    assert.equal(syncEntryFold(front, { mobile: false }).folded, false);
    assert.equal(dock.querySelector('.igs-dock-fold'), null);
    assert.equal(dock.hasAttribute('data-fold'), false);
});

test('收拢后点按钮展开，点外面或点其中一个入口收起；隐藏与全屏直播不计入', () => {
    const { front, document, entry } = setup();
    entry('igs-aud-entry');
    entry('igs-feed-entry');
    const bell = entry('igs-nc-entry');
    syncEntryFold(front, { mobile: true });
    const dock = ensureEntryDock(front);
    const fold = dock.querySelector('.igs-dock-fold');
    fold.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    assert.equal(dock.getAttribute('data-fold'), 'open');
    assert.equal(isFoldOpen(front), true);
    document.body.dispatchEvent(new document.defaultView.MouseEvent('pointerdown', { bubbles: true }));
    assert.equal(dock.getAttribute('data-fold'), 'closed');
    fold.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    assert.equal(isFoldOpen(front), true);
    // 点坞内入口：入口自己的处理照常执行，随后收起。
    let clicked = 0;
    bell.addEventListener('click', () => { clicked += 1; });
    bell.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    assert.equal(clicked, 1);
    assert.equal(dock.getAttribute('data-fold'), 'closed');
    // 被隐藏的入口不计数；全屏直播不收拢。
    bell.hidden = true;
    assert.equal(syncEntryFold(front, { mobile: true }).folded, false);
    bell.hidden = false;
    front.setAttribute('data-entry-full', '1');
    assert.equal(syncEntryFold(front, { mobile: true }).folded, false);
    front.removeAttribute('data-entry-full');
    // 社区手机在场时通知入口让位，不计数。
    front.setAttribute('data-igs-phone-on', '1');
    assert.equal(syncEntryFold(front, { mobile: true }).count, 2);
});

test('摘掉最后一个入口时坞一并拆掉，收拢按钮不算入口', () => {
    const { front, entry } = setup();
    const a = entry('igs-aud-entry');
    const b = entry('igs-feed-entry');
    const c = entry('igs-nc-entry');
    syncEntryFold(front, { mobile: true });
    unmountEntry(front, a);
    unmountEntry(front, b);
    assert.ok(front.querySelector('.igs-entry-dock'));
    unmountEntry(front, c);
    assert.equal(front.querySelector('.igs-entry-dock'), null);
});

test('悬浮窗几何：夹进舞台、最小尺寸、四角拖尺寸对角固定', () => {
    const stage = { w: 800, h: 600 };
    const r = clampRect({ left: -50, top: 900, width: 9999, height: 10 }, stage);
    assert.ok(r.left >= 8 && r.top >= 8);
    assert.ok(r.left + r.width <= 800 - 8 && r.top + r.height <= 600 - 8);
    assert.equal(r.height, ORIGIN_MIN_H);
    const start = { left: 100, top: 100, width: 300, height: 300 };
    const se = resizeRect(start, 'se', 40, 30, stage);
    assert.deepEqual([se.left, se.top, se.width, se.height], [100, 100, 340, 330]);
    const nw = resizeRect(start, 'nw', 40, 30, stage);
    assert.deepEqual([nw.left + nw.width, nw.top + nw.height], [400, 400]);
    const tiny = resizeRect(start, 'se', -500, -500, stage);
    assert.deepEqual([tiny.width, tiny.height], [ORIGIN_MIN_W, ORIGIN_MIN_H]);
    const moved = moveRect(start, 5000, 5000, stage);
    assert.ok(moved.left + moved.width <= 792 && moved.top + moved.height <= 592);
    const phone = defaultRect({ w: 390, h: 844 }, { right: 52, top: 14 });
    assert.ok(phone.left >= 8 && phone.left + phone.width <= 382);
});

test('位置尺寸记在本机：存取一致，坏数据当没有，读回夹进当前舞台', () => {
    const mem = new Map();
    const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
    writeStoredRect(storage, 'pc', { left: 120, top: 60, width: 320, height: 400 });
    assert.deepEqual(readStoredRect(storage, 'pc', { w: 1000, h: 700 }), { left: 120, top: 60, width: 320, height: 400 });
    assert.equal(readStoredRect(storage, 'phone', { w: 1000, h: 700 }), null);
    mem.set('igs:origin-panel:pc', '{坏');
    assert.equal(readStoredRect(storage, 'pc', { w: 1000, h: 700 }), null);
    writeStoredRect(storage, 'pc', { left: 900, top: 600, width: 320, height: 400 });
    const back = readStoredRect(storage, 'pc', { w: 500, h: 400 });
    assert.ok(back.left + back.width <= 492);
    assert.doesNotThrow(() => writeStoredRect({ setItem() { throw new Error('满'); } }, 'pc', { left: 1, top: 1, width: 1, height: 1 }));
});

function mountPanel(overrides = {}) {
    const ctx = setup();
    const engine = createStubOriginEngine();
    const notices = [];
    const binding = resolveOriginBinding({
        origin: () => ({ engine, settings: { enabled: true, ...overrides }, notice: (level, text) => notices.push([level, text]), modal: { prompt: async () => null, confirm: async () => true } }),
    });
    const view = syncOrigin(ctx.front, binding, { doc: ctx.document, size: 'medium', getStage: () => ({ stageW: 800, stageH: 600 }) });
    return { ...ctx, engine, binding, view, notices };
}

test('接入点：没有引擎、总开关关闭都不出入口', () => {
    assert.equal(resolveOriginBinding({}), null);
    assert.equal(resolveOriginBinding({ origin: () => null }), null);
    assert.equal(resolveOriginBinding({ origin: () => ({ engine: {}, settings: { enabled: true } }) }), null);
    assert.equal(resolveOriginBinding({ origin: () => ({ engine: createStubOriginEngine(), settings: { enabled: false } }) }), null);
    const { front, document } = setup();
    assert.equal(syncOrigin(front, null, { doc: document }), null);
    assert.equal(front.querySelector('.igs-or-entry'), null);
});

test('随身系统入口：挂进坞里、排在铃铛后；引擎有新事件红点亮，打开即已读', () => {
    const { front, document, engine } = mountPanel();
    const entry = front.querySelector('.igs-entry-dock > .igs-or-entry');
    assert.ok(entry);
    assert.equal(isOriginEntryShown(front), true);
    assert.equal(entry.getAttribute('data-unread'), '0');
    engine.simulateEvent();
    assert.equal(entry.getAttribute('data-unread'), '1');
    entry.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    assert.equal(isOriginOpen(front), true);
    assert.equal(entry.getAttribute('data-unread'), '0');
    // 窗口开着时引擎变化直接重绘，不记未读。
    engine.simulateEvent('task-new', '窗口开着时的新记录');
    assert.equal(entry.getAttribute('data-unread'), '0');
    entry.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    assert.equal(isOriginOpen(front), false);
    stopOrigin(front);
    assert.equal(front.querySelector('.igs-or-entry'), null);
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
// 行默认收起，同时只开一行：逐行点开，收集窗口里出现过的全部动作名（含底栏与常显按钮）。
async function collectActions(win, document) {
    const seen = new Set(Array.from(win.querySelectorAll('[data-oa]')).map((n) => n.getAttribute('data-oa')));
    const count = win.querySelectorAll('[data-oa="row"]').length;
    for (let i = 0; i < count; i += 1) {
        win.querySelectorAll('[data-oa="row"]')[i].dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
        await flush();
        for (const n of win.querySelectorAll('[data-oa]')) seen.add(n.getAttribute('data-oa'));
    }
    return seen;
}
async function openRow(win, document, index) {
    win.querySelectorAll('[data-oa="row"]')[index].dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    await flush();
}

test('悬浮窗：页签对照原插件，模块关掉的不显示；点按不冒泡到阅读器', async () => {
    const { front, document, view } = mountPanel({ mods: { shop: false } });
    view.els.entry.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    const win = front.querySelector('.igs-or-win');
    const tabs = Array.from(win.querySelectorAll('.igs-or-tab')).map((t) => t.textContent);
    assert.deepEqual(tabs, ['任务', '背包', '抽奖', '对话']);
    // 页头两层：第一层关闭 · 标题 · ⋯，第二层积分等级；默认标题是「随身系统」。
    assert.equal(win.querySelector('.igs-or-head .igs-or-name').textContent, '随身系统');
    assert.deepEqual(Array.from(win.querySelector('.igs-or-top').children).map((n) => n.className), ['igs-or-head', 'igs-or-stats']);
    let leaked = 0;
    front.addEventListener('click', () => { leaked += 1; });
    front.addEventListener('pointerdown', () => { leaked += 1; });
    win.querySelector('.igs-or-tab').dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    win.dispatchEvent(new document.defaultView.MouseEvent('pointerdown', { bubbles: true }));
    assert.equal(leaked, 0);
    // 任务页：主线置顶成大卡，其余两条是行；操作收在里面，点开前不出现；同时只开一行。
    await flush();
    assert.equal(win.querySelectorAll('.igs-or-hero').length, 1);
    assert.equal(win.querySelectorAll('.igs-or-row').length, 2);
    // 页签下面不再有分类那一排；分类在大卡下组头右边的下拉。
    assert.equal(win.querySelector('.igs-or-filter'), null);
    assert.match(win.querySelector('.igs-or-ghd').textContent, /^其他任务 · 2全部/);
    assert.equal(win.querySelector('[data-oa="task-done"]'), null);
    await openRow(win, document, 0);
    await openRow(win, document, 1);
    assert.equal(win.querySelectorAll('.is-open').length, 1);
    const seen = await collectActions(win, document);
    for (const name of ['task-gen', 'task-add', 'task-direction', 'task-done', 'task-edit', 'task-del', 'dd-toggle']) assert.ok(seen.has(name), name);
    // 展开区按钮右对齐：删除最左、主操作（完成）最右。
    await openRow(win, document, 0);
    assert.deepEqual(Array.from(win.querySelectorAll('.is-open .igs-or-ops .igs-or-op')).map((n) => n.textContent), ['删除', '编辑', '完成']);
    // 下拉：点开右对齐小菜单；样例里有交给角色的任务，所以有「给角色」。
    const click = (node) => node.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    click(win.querySelector('[data-oa="dd-toggle"]'));
    await flush();
    assert.deepEqual(Array.from(win.querySelectorAll('.igs-or-ghd .igs-or-mitem')).map((n) => n.textContent), ['全部', '主线', '支线', '日常', '给角色']);
    // 点外面收起。
    click(win.querySelector('.igs-or-hero-title'));
    await flush();
    assert.equal(win.querySelector('.igs-or-ghd .igs-or-menu'), null);
    click(win.querySelector('[data-oa="dd-toggle"]'));
    await flush();
    click(win.querySelector('[data-oa="dd-pick"][data-id="支线"]'));
    await flush();
    // 筛选「支线」：不显示主线大卡，组头改为「支线任务 · 1」，右边显示「支线」。
    assert.equal(win.querySelector('.igs-or-hero'), null);
    assert.equal(win.querySelectorAll('.igs-or-row').length, 1);
    assert.match(win.querySelector('.igs-or-ghd').textContent, /^支线任务 · 1支线/);
    // 关窗再开保持；引擎重新加载（切聊天）回到「全部」。
    view.els.entry.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    view.els.entry.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    const again = front.querySelector('.igs-or-win');
    assert.match(again.querySelector('.igs-or-ghd').textContent, /^支线任务/);
    view.engine.simulateEvent('load', '');
    assert.ok(again.querySelector('.igs-or-hero'));
});

test('悬浮窗各页签按钮一项不少，位置尺寸通过变量下发而不是内联样式文本', async () => {
    const { front, document, view } = mountPanel();
    view.els.entry.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    const win = front.querySelector('.igs-or-win');
    const need = {
        bag: ['bag-use', 'bag-del', 'bag-add'],
        shop: ['shop-gen', 'shop-buy', 'shop-del', 'shop-add'],
        gacha: ['gacha-draw', 'gacha-gen', 'gacha-del', 'gacha-add'],
        chat: ['chat-send'],
    };
    const click = (node) => node.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    // 对话页底部只留输入框与发送。
    click(win.querySelector('.igs-or-tab[data-id="chat"]'));
    await flush();
    assert.equal(win.querySelector('.igs-or-body [data-oa="chat-clear"]'), null);
    assert.equal(win.querySelector('[data-oa="chat-story"]'), null);
    // ⋯ 菜单：属性 / 成就 / 记录 + 暂停 + 清空对话；进二级页后页头只剩返回与页名，没有页签。
    click(win.querySelector('[data-oa="menu"]'));
    await flush();
    assert.deepEqual(Array.from(win.querySelectorAll('.igs-or-mitem')).map((n) => n.textContent), ['属性', '成就', '记录', '暂停系统', '清空对话']);
    click(win.querySelector('.igs-or-mitem[data-id="stat"]'));
    await flush();
    assert.equal(win.querySelector('.igs-or-menu'), null);
    assert.equal(win.querySelector('.igs-or-name').textContent, '属性');
    assert.ok(win.querySelector('.igs-or-head [data-oa="back"]'));
    assert.equal(win.querySelector('.igs-or-tab'), null);
    const statSeen = await collectActions(win, document);
    for (const name of ['stat-add', 'stat-del', 'skill-add', 'skill-del', 'perk-add', 'perk-del']) assert.ok(statSeen.has(name), `stat:${name}`);
    // 二级页没有底栏。
    assert.equal(win.querySelector('.igs-or-foot').hidden, true);
    click(win.querySelector('[data-oa="back"]'));
    await flush();
    for (const [tab, actions] of Object.entries(need)) {
        click(win.querySelector(`.igs-or-tab[data-id="${tab}"]`));
        await flush();
        const tabSeen = await collectActions(win, document);
        for (const name of actions) assert.ok(tabSeen.has(name), `${tab}:${name}`);
    }
    assert.match(win.getAttribute('style') || '', /--igs-or-x/);
    assert.doesNotMatch(win.getAttribute('style') || '', /(?:^|;)\s*(?:left|top|width|height)\s*:/);
    // 头部：收起、⋯；没提供设置入口时不出现「设置」。
    assert.ok(win.querySelector('[data-oa="menu"]'));
    assert.ok(win.querySelector('[data-oa="close"]'));
    assert.equal(win.querySelector('[data-oa="settings"]'), null);
});

test('操作：购买走 dispatch，积分不够给提示；使用道具、暂停恢复生效；全程不用原生弹窗', async () => {
    const { front, document, view, engine, notices } = mountPanel();
    let nativeCalls = 0;
    document.defaultView.prompt = () => { nativeCalls += 1; return null; };
    document.defaultView.confirm = () => { nativeCalls += 1; return true; };
    view.els.entry.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    const win = front.querySelector('.igs-or-win');
    win.querySelector('.igs-or-tab[data-id="shop"]').dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    await flush();
    await openRow(win, document, 0);
    const before = engine.getState().points;
    win.querySelector('[data-oa="shop-buy"]').dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    await flush();
    assert.equal(engine.getState().points, before - 300);
    // 观星镜 1500 > 剩余积分：报积分不够，不扣分。
    await openRow(win, document, 2);
    win.querySelector('[data-oa="shop-buy"]').dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    await flush();
    assert.equal(engine.getState().points, before - 300);
    // 核心失败时自带的 text 优先于原因码兜底文案。
    assert.equal(notices.at(-1)[0], 'warn');
    assert.match(notices.at(-1)[1], /^积分不够购买「观星镜」/);
    const pause = async () => {
        win.querySelector('[data-oa="menu"]').dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
        await flush();
        win.querySelector('.igs-or-mitem[data-oa="pause"]').dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
        await flush();
    };
    await pause();
    assert.equal(engine.getState().paused, true);
    assert.ok(win.querySelector('.igs-or-banner'));
    await pause();
    assert.equal(engine.getState().paused, false);
    assert.equal(nativeCalls, 0);
});

test('与通知栏、回看弹窗互斥：claimPanel 先关掉前一个，Esc 关闭窗口', () => {
    const { front, document, view } = mountPanel();
    let closed = 0;
    view.els.entry.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    assert.equal(isOriginOpen(front), true);
    claimPanel(front, () => { closed += 1; });
    assert.equal(isOriginOpen(front), false);
    assert.equal(closed, 0);
    view.els.entry.dispatchEvent(new document.defaultView.MouseEvent('click', { bubbles: true }));
    const win = front.querySelector('.igs-or-win');
    win.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert.equal(isOriginOpen(front), false);
});
