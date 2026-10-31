import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { OP } from '../src/visual/igs-ui/origin-panel-actions.js';
import { applyManual, createCx } from '../src/scene/origin/origin-apply.js';
import { createInitialState, fillSettings } from '../src/scene/origin/origin-state.js';
import { attachOriginEngine, attachedOriginBinding, getAttachedOrigin, originChatStatus, runAttachedOriginOp } from '../src/visual/igs-ui/origin-attach.js';
import { createStubOriginEngine } from '../src/visual/igs-ui/origin-panel-stub.js';
import { resolveOriginBinding, stopOrigin, syncOrigin } from '../src/visual/igs-ui/origin-panel.js';
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
    const dom = new JSDOM('<!doctype html><body><div id="front"></div></body>', { pretendToBeVisual: true });
    const front = dom.window.document.getElementById('front');
    syncOrigin(front, binding, { doc: dom.window.document, size: 'medium', getStage: () => ({ stageW: 800, stageH: 600 }) });
    assert.ok(front.querySelector('.igs-entry-dock > .igs-or-entry'));
    stopOrigin(front);
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
