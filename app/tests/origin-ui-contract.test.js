import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { OP, runOriginAction } from '../src/visual/igs-ui/origin-panel-actions.js';
import { applyManual, createCx } from '../src/scene/origin/origin-apply.js';
import { createInitialState, fillSettings } from '../src/scene/origin/origin-state.js';
import { attachOriginEngine, attachedOriginBinding, getAttachedOrigin, originChatStatus, runAttachedOriginOp } from '../src/visual/igs-ui/origin-attach.js';
import { createStubOriginEngine } from '../src/visual/igs-ui/origin-panel-stub.js';
import { createOriginPageController, resolveOriginBinding } from '../src/visual/igs-ui/origin-panel.js';
import { originRequestRoute, normalizeOriginSettings } from '../src/visual/igs-ui/origin-settings.js';

// 界面 OP 的形状必须能被核心 applyManual 直接吃下（核心的 dispatch 只在 applyManual 之前把下标换成名字）。
test('界面操作形状与核心 applyManual 一致', () => {
    const st = createInitialState();
    const cx = () => createCx({ turn: 3, s: fillSettings({ enabled: true }), random: () => 0.5 });
    const ok = (op) => { const r = applyManual(st, op, cx()); assert.equal(r.ok, true, `${op.type}: ${r.text || r.reason}`); };
    ok(OP.addTask({ taskType: '主线', owner: '宿主', title: '拜入宗门', desc: '', cond: '', reward: '积分100', penalty: '', limit: 3 }));
    const task = st.tasks.at(-1);
    assert.equal(task.type, '主线');
    assert.equal(task.limit, 3);
    ok({ ...OP.editTask(task.id, { taskType: '日常', progress: 40 }), expectTitle: task.title });
    assert.equal(task.type, '日常');
    assert.equal(task.progress, 40);
    ok(OP.addItem({ name: '包子', count: 2, desc: '', effect: '' }));
    assert.equal(st.bag.find((b) => b.name === '包子').count, 2);
    ok(OP.addShop({ name: '聚灵符', price: 50, desc: '', effect: '' }));
    ok(OP.addGacha({ name: '灵石', tier: 'R', weight: 20, desc: '', effect: '' }));
    ok(OP.addStat({ name: '魅力', val: 5 }));
    ok(OP.addSkill({ name: '御剑', desc: '' }));
    ok(OP.addPerk({ name: '外门弟子', desc: '' }));
    assert.equal(st.stats.at(-1).val, 5);
    assert.ok(st.skills.some((k) => k.name === '御剑'));
    assert.ok(st.perks.some((k) => k.name === '外门弟子'));
    st.chat.push({ who: 'me', text: '你好', turn: 3 });
    ok(OP.chatClear());
    assert.equal(st.chat.length, 0);
    ok(OP.pause());
    ok(OP.resume());
    // 设世界 / 方向在核心 dispatch 里处理，字段名是 value。
    assert.deepEqual(OP.setWorld('青云宗'), { type: 'setWorld', value: '青云宗' });
    assert.deepEqual(OP.setDirection('复仇'), { type: 'setDirection', value: '复仇' });
});

test('接入点：attachOriginEngine 登记后阅读器与设置页都能读到，detach 后撤下', async () => {
    assert.equal(getAttachedOrigin(), null);
    assert.equal(originChatStatus(), null);
    assert.equal((await runAttachedOriginOp('recalc')).reason, 'origin-engine-missing');
    assert.throws(() => attachOriginEngine({}), TypeError);
    const engine = createStubOriginEngine();
    let settings = { enabled: false };
    const detach = attachOriginEngine(engine, { settings: () => settings });
    // 总开关关着：不出入口。
    assert.equal(attachedOriginBinding(), null);
    assert.equal(resolveOriginBinding({}), null);
    settings = { enabled: true };
    const binding = resolveOriginBinding({});
    assert.equal(binding.engine, engine);
    assert.deepEqual(originChatStatus(), { hasChat: true, paused: false, blocked: null, legacy: false, world: '修仙界·青云宗外门' });
    assert.equal((await runAttachedOriginOp('world', '  新世界 ')).ok, true);
    assert.equal(originChatStatus().world, '新世界');
    assert.equal((await runAttachedOriginOp('pause')).ok, true);
    assert.equal(originChatStatus().paused, true);
    // 整页：资料页外壳、页头返回键；二级页先退回主页，Esc 逐级退到关闭；关闭后退订、撤下暂停标记。
    const dom = new JSDOM('<!doctype html><body><div id="igs-overlay"></div></body>', { pretendToBeVisual: true });
    const doc = dom.window.document;
    const overlay = doc.getElementById('igs-overlay');
    let saved = '';
    const page = createOriginPageController(doc, { getTheme: () => 'cream', setTheme: (t) => { saved = t; } });
    assert.equal(page.open(overlay).ok, true);
    const root = overlay.querySelector('#igs-origin-page');
    assert.ok(root && root.querySelector('.igs-rp-page .igs-rp-head [data-oa="close"]'));
    assert.equal(root.getAttribute('data-rp-theme'), 'cream');
    assert.ok(overlay.classList.contains('igs-record-screen-open'));
    assert.ok(root.querySelector('.igs-or-stats') && root.querySelector('.igs-or-tabs'));
    root.querySelector('[data-oa="theme"]:not([data-id="cream"])').click();
    assert.ok(saved && saved !== 'cream');
    assert.equal(root.getAttribute('data-rp-theme'), saved);
    root.querySelector('[data-oa="menu"]').click();
    assert.ok(root.querySelector('.igs-or-menu'));
    assert.equal(page.escape(), true);
    assert.equal(root.querySelector('.igs-or-menu'), null);
    assert.equal(page.escape(), true);
    assert.equal(page.isOpen(), false);
    assert.equal(overlay.querySelector('#igs-origin-page'), null);
    assert.equal(overlay.classList.contains('igs-record-screen-open'), false);
    detach();
    assert.equal(getAttachedOrigin(), null);
    assert.equal(resolveOriginBinding({}), null);
});

test('「系统」模型分配：默认跟随酒馆；选备用模型且备用来源为独立API时才改走备用', () => {
    assert.equal(normalizeOriginSettings({}).route, 'tavern');
    assert.equal(normalizeOriginSettings({ route: 'x' }).route, 'tavern');
    const llm = { source: 'openai', endpoint: 'https://a/v1', model: 'm1' };
    assert.deepEqual(originRequestRoute({}, llm), { via: 'tavern' });
    assert.deepEqual(originRequestRoute({ route: 'llm' }, { source: 'tavern' }), { via: 'tavern' });
    assert.equal(originRequestRoute({ route: 'llm' }, llm).llm, llm);
    const over = originRequestRoute({ route: 'llm', model: ' m2 ' }, llm);
    assert.equal(over.llm.model, 'm2');
    assert.equal(llm.model, 'm1');
});

test('兑换面板操作：取消不扣分，确认沿同一报价，失败不宣布成功且可重试', async () => {
    const engine = createStubOriginEngine(), notes = [], confirmed = [], prompts = [];
    const quote = { ok: true, exchangeId: 'exchange-ui', points: 40, amount: 10, currency: { name: '铜钱' } };
    let input = null, consent = true, quotes = 0, retries = 0;
    let info = { ok: true, name: '铜钱', rate: 0.25 };
    let result = { ok: false, reason: 'inventory-write-failed' };
    const ctx = { engine, closeMenu() {}, notice: (level, text) => notes.push({ level, text }),
        modal: { prompt: async text => { prompts.push(text); return input; }, confirm: async text => { assert.match(text, /40 积分.*10 铜钱/); return consent; } },
        exchange: { info: () => info,
            quote: async points => { quotes += 1; assert.equal(points, 40); return quote; },
            confirm: async value => { assert.equal(value, quote); confirmed.push(value); return result; },
            retry: async () => { retries += 1; return { ok: true }; } } };
    assert.equal((await runOriginAction('exchange', null, ctx)).cancelled, true);
    assert.match(prompts.at(-1), /当前比例：1 积分 = 0\.25 铜钱\n消耗多少共享积分/);
    assert.equal(quotes, 0);
    input = '1.5';
    assert.equal((await runOriginAction('exchange', null, ctx)).reason, 'points-exchange-invalid');
    assert.equal(quotes, 0);
    input = '40'; consent = false;
    assert.equal((await runOriginAction('exchange', null, ctx)).cancelled, true);
    assert.equal(confirmed.length, 0);
    consent = true;
    assert.equal((await runOriginAction('exchange', null, ctx)).ok, false);
    assert.equal(notes.some(n => n.level === 'info'), false);
    assert.equal((await runOriginAction('exchange-retry', null, ctx)).ok, true);
    assert.equal(retries, 1);
    result = { ok: true, done: true, amount: 10, name: '铜钱' };
    await runOriginAction('exchange', null, ctx);
    result = { ...result, present: true };
    await runOriginAction('exchange', null, ctx);
    assert.equal(notes.filter(n => n.level === 'info').length, 1);
    input = null;
    info = { ok: true, name: '金币', rate: 2 };
    assert.equal((await runOriginAction('exchange', null, ctx)).cancelled, true);
    assert.match(prompts.at(-1), /当前比例：1 积分 = 2 金币/);
    const promptCount = prompts.length, quoteCount = quotes;
    info = { ok: false, reason: 'stats-currency-unset' };
    assert.equal((await runOriginAction('exchange', null, ctx)).reason, 'stats-currency-unset');
    assert.equal(prompts.length, promptCount);
    assert.equal(quotes, quoteCount);
    assert.equal(notes.filter(n => n.level === 'info').length, 1);
});


test('兑换面板交互：重复点击及收起重开只提交一次，菜单可重试', async t => {
    const dom = new JSDOM('<!doctype html><body><div id="igs-overlay"></div></body>', { pretendToBeVisual: true });
    const doc = dom.window.document, overlay = doc.getElementById('igs-overlay');
    const engine = createStubOriginEngine(), notices = [];
    let release, prompts = 0, quotes = 0, confirms = 0, retries = 0;
    const input = new Promise(resolve => { release = resolve; });
    const binding = { engine, settings: normalizeOriginSettings({ enabled: true }),
        modal: { prompt: () => { prompts += 1; return input; }, confirm: async () => true },
        notice: (level, text) => notices.push({ level, text }),
        exchange: {
            info: () => ({ ok: true, name: '铜钱', rate: 0.25 }),
            quote: async points => { quotes += 1; return { ok: true, points, amount: 10, currency: { name: '铜钱' } }; },
            confirm: async () => { confirms += 1; return { ok: true, done: true, amount: 10, name: '铜钱' }; },
            retry: async () => { retries += 1; return { ok: true }; },
        } };
    const page = createOriginPageController(doc, { origin: () => binding });
    const q = (selector) => overlay.querySelector(selector);
    t.after(() => { page.close(); dom.window.close(); });
    assert.equal(page.open(overlay).ok, true);
    assert.equal(q('[data-oa="exchange"]').textContent, '兑换金钱');
    q('[data-oa="exchange"]').click();
    q('[data-oa="exchange"]').click();
    assert.equal(prompts, 1);
    page.close();
    assert.equal(page.open(overlay).ok, true);
    q('[data-oa="exchange"]').click();
    assert.equal(prompts, 1);
    release('40');
    for (let i = 0; i < 8; i += 1) await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual([quotes, confirms], [1, 1]);
    assert.equal(notices.filter(n => n.level === 'info').length, 1);
    q('[data-oa="menu"]').click();
    q('[data-oa="exchange-retry"]').click();
    for (let i = 0; i < 8; i += 1) await new Promise(resolve => setImmediate(resolve));
    assert.equal(retries, 1);
});
