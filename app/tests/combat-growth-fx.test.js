import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatLedger } from '../src/combat/ledger.js';
import { growthTagsByPage, planGrowthFx, GROWTH_FX_PAGE_MAX } from '../src/visual/igs-ui/combat-growth-fx-model.js';
import { applyGrowthFxToDom, cancelGrowthFx, renderGrowthFx } from '../src/visual/igs-ui/combat-growth-fx.js';
import { makeStage, makeTimers } from './helpers/fake-dom.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const attack = (id) => ({ id, name: `斩${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 6 }] });
const guard = (id) => ({ id, name: `守${id}`, type: 'skill', cost: 1, rarity: 'common', effects: [{ op: 'block', amount: 5 }] });
const passive = (id) => ({ id, name: '锋锐', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }] });
const STARTER = [
    'basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend',
    'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'm1', 'm1', 'm2', 'm2',
];
const classDef = { kind: 'class', id: 'cls-blade', className: '剑士', archetype: 'warrior', classPassive: passive('p-edge'),
    classPool: [1, 2, 5, 6].map((n) => attack(`c${n}`)).concat([3, 4, 7, 8].map((n) => guard(`c${n}`))) };
const heroDef = { kind: 'deck-character', id: 'pc-hero', name: '主角', classRef: 'cls-blade', base: { hp: 80 },
    personalPassive: passive('p-will'), personalPool: [attack('m1'), guard('m2'), attack('m3'), guard('m4')], starterDeck: [...STARTER] };
const row = (def, createdAt) => ({ id: def.id, name: def.name || def.className, kind: def.kind, className: def.className || '', version: 1, createdAt, definition: def });
const ai = (mes, swipe_id = 0) => ({ mes, swipe_id, is_user: false });
const user = (mes) => ({ mes, is_user: true });

function memoryTables(profile) {
    const t = { profile: clone(profile), ledger: [] };
    t.read = () => ({ ok: true, missing: [], diagnostics: [], profile: clone(t.profile), ledger: clone(t.ledger) });
    t.append = async (kind, records) => {
        for (const r of records) if (!t[kind].some((x) => x.id === r.id)) t[kind].push(clone(r));
        return { ok: true, written: records.map((r) => r.id), present: [], rejected: [], pending: [] };
    };
    return t;
}

const TEXT = '你挥剑百次。\n[igs-combat:exp|我|45|练剑]\n他悟出新招。[igs-combat:learn|我|裂空斩|一刀]';

async function growthHarness() {
    const ref = { chat: [user('出发'), ai(TEXT)] };
    const ledger = createCombatLedger({ tables: memoryTables([row(classDef, 1), row(heroDef, 2)]), chat: () => ref.chat, userName: '主角', now: () => 7 });
    const scan = await ledger.scan();
    const state = await ledger.effectiveState();
    return { ref, ledger, scan, state };
}

test('成长标签按页归位：落在 (上一页, 本页] 归本页，正文末尾的标签归最后一个有效页，无效页不收', () => {
    const learnAt = TEXT.indexOf('[igs-combat:learn');
    const second = TEXT.indexOf('他悟出');
    // exp 落在 (0, 第二页起点]，归第二页；learn 在最后一个有效页起点之后，归最后一个有效页；无效页不收。
    const tail = growthTagsByPage(TEXT, [0, second, -1]);
    assert.deepEqual(tail.map((s) => s.size), [0, 2, 0]);
    // 三页都有效：两条标签分别落在各自区间。
    const spread = growthTagsByPage(TEXT, [0, second, learnAt + 1]);
    assert.deepEqual(spread.map((s) => s.size), [0, 1, 1]);
    assert.equal(growthTagsByPage(TEXT, [-1, -1]).every((s) => s.size === 0), true);
});

test('演出规划：只取本楼本 swipe 本页已入库的成长；升级单列且排在前面；待生成项显示占位；换 swipe 后不播', async () => {
    const h = await growthHarness();
    assert.deepEqual(h.state.growth.map((g) => [g.type, g.amount, g.levelBefore, g.levelAfter]), [['exp', 45, 1, 2]]);
    assert.equal(h.scan.pendingGeneration.length, 1);
    const [keys] = growthTagsByPage(TEXT, [0]);
    const identity = { chatId: 'c1', messageId: 1, swipeId: 0, page: 0 };
    const plan = planGrowthFx({ growth: h.state.growth, pending: h.scan.pendingGeneration, messageId: 1, swipeId: 0, keys, identity });
    assert.deepEqual(plan.items.map((i) => i.kind), ['level', 'exp', 'pending']);
    assert.deepEqual([plan.items[0].level, plan.items[1].amount, plan.items[1].name], [2, 45, '主角']);
    assert.equal(plan.overflow, 0);
    assert.deepEqual(planGrowthFx({ growth: h.state.growth, messageId: 1, swipeId: 1, keys, identity }).items, []);
    assert.deepEqual(planGrowthFx({ growth: h.state.growth, messageId: 0, swipeId: 0, keys, identity }).items, []);
    h.ref.chat = [user('出发'), ai('另一个版本。', 1)];
    assert.deepEqual((await h.ledger.effectiveState()).growth, []);
    const many = Array.from({ length: 5 }, (_, n) => ({ id: `g${n}`, type: 'learn', character: `c${n}`, characterName: `角色${n}`, anchor: h.state.growth[0].anchor, name: '招', amount: 0, levelBefore: 1, levelAfter: 1 }));
    const capped = planGrowthFx({ growth: many, messageId: 1, swipeId: 0, keys, identity });
    assert.deepEqual([capped.items.length, capped.overflow], [GROWTH_FX_PAGE_MAX, 5 - GROWTH_FX_PAGE_MAX]);
});

test('演出 DOM：挂到 #igs-fx-front；同页重绘不重播，新入库条目只补播新的；换页重播；到时退场；取消清理', async () => {
    const h = await growthHarness();
    const [keys] = growthTagsByPage(TEXT, [0]);
    const root = makeStage();
    const timers = makeTimers();
    const opts = { schedule: timers.schedule, clear: timers.clear, reducedMotion: true };
    const identity = { chatId: 'c1', messageId: 1, swipeId: 0, page: 0 };
    const growthOnly = planGrowthFx({ growth: h.state.growth, messageId: 1, swipeId: 0, keys, identity });
    const first = applyGrowthFxToDom(root, growthOnly, opts);
    assert.deepEqual(first, { played: true, count: 2 });
    const front = root.querySelector('#igs-fx-front');
    assert.equal(front.querySelectorAll('.igs-growth-fx').length, 1);
    assert.match(front.querySelector('.igs-growth-fx').className, /is-reduced/);
    assert.deepEqual(applyGrowthFxToDom(root, growthOnly, opts), { played: false, reason: 'same-page' });
    const withPending = planGrowthFx({ growth: h.state.growth, pending: h.scan.pendingGeneration, messageId: 1, swipeId: 0, keys, identity });
    assert.deepEqual(applyGrowthFxToDom(root, withPending, opts), { played: true, count: 1 });
    assert.equal(front.querySelectorAll('.igs-growth-fx').length, 1);
    const nextPage = { ...growthOnly, identity: { ...identity, page: 1 } };
    assert.deepEqual(applyGrowthFxToDom(root, nextPage, opts), { played: true, count: 2 });
    timers.advance(10000);
    assert.equal(front.querySelectorAll('.igs-growth-fx').length, 0);
    applyGrowthFxToDom(root, { ...growthOnly, identity: { ...identity, page: 2 } }, opts);
    assert.equal(cancelGrowthFx(root), true);
    assert.equal(front.querySelectorAll('.igs-growth-fx').length, 0);
    assert.equal(timers.size(), 0);
});

test('渲染适配：扩展关闭时清理已挂演出；NSFW、聊天页、卡片页与无成长页不播', async () => {
    const h = await growthHarness();
    const [keys] = growthTagsByPage(TEXT, [0]);
    const plan = planGrowthFx({ growth: h.state.growth, messageId: 1, swipeId: 0, keys, identity: { chatId: 'c1', messageId: 1, swipeId: 0, page: 0 } });
    const root = makeStage();
    const on = { combatExpansion: { enabled: true } };
    const ctx = { reducedMotion: () => true, schedule: makeTimers().schedule, clear: () => {} };
    assert.equal(renderGrowthFx(root, { readerSettings: on, content: { fx: { growth: plan }, sceneNsfw: true } }, ctx).played, false);
    assert.equal(renderGrowthFx(root, { readerSettings: on, content: { fx: { growth: plan }, chatPage: true } }, ctx).played, false);
    assert.equal(renderGrowthFx(root, { readerSettings: on, content: { fx: {} } }, ctx).reason, 'no-growth');
    assert.equal(renderGrowthFx(root, { readerSettings: on, content: { fx: { growth: plan } } }, ctx).played, true);
    assert.equal(root.querySelector('#igs-fx-front').querySelectorAll('.igs-growth-fx').length, 1);
    assert.equal(renderGrowthFx(root, { readerSettings: {}, content: { fx: { growth: plan } } }, ctx).reason, 'disabled');
    assert.equal(root.querySelector('#igs-fx-front').querySelectorAll('.igs-growth-fx').length, 0);
});
