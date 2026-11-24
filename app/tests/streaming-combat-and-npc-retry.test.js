import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createIllustrationMessageHost } from '../src/host/illustration-message-host.js';
import { createCombatGenerationMaterials } from '../src/host/combat-generation-materials.js';
import { createCombatServices } from '../src/core/combat-services.js';
import { createCombatPanelController } from '../src/visual/igs-ui/combat-panel.js';
import { createStatsRuntime } from '../src/core/stats-runtime.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { createLedgerMockHost, userInventorySheet } from './helpers/combat-mock-host-ledger.js';
import { PASSIVE_TEMPLATES, templatesFor, heroSkillFromTemplate } from '../src/combat/card-templates.js';

function createEventBus() {
    const listeners = new Map();
    return {
        eventSource: {
            on(name, fn) {
                if (!listeners.has(name)) listeners.set(name, new Set());
                listeners.get(name).add(fn);
            },
            removeListener(name, fn) {
                listeners.get(name)?.delete(fn);
            },
            off(name, fn) {
                listeners.get(name)?.delete(fn);
            },
        },
        emit(name, ...args) {
            for (const fn of [...(listeners.get(name) || [])]) fn(...args);
        },
    };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

async function flushAsync(rounds = 8) {
    for (let i = 0; i < rounds; i += 1) {
        await new Promise((r) => setImmediate(r));
    }
}

function buildValidSheet(name) {
    return {
        [name]: {
            资历: '老手',
            属性: { 敏捷: '出众' },
            擅长: ['潜行', '侦查', '格斗'],
            比较擅长: ['说服', '闪避', '急救', '攀爬', '开锁'],
        },
    };
}

function createFakeStatsTables() {
    const rows = [];
    let version = 1;
    return {
        rows,
        get version() { return version; },
        set version(v) { version = v; },
        api() {
            return {
                ok: true,
                get version() { return version; },
                invalidate() {},
                read() { return { ok: true, stats: rows.slice(), layout: 'v2', layoutPending: false }; },
                ensure: async () => ({ ok: true }),
                append: async (records) => {
                    for (const r of Array.isArray(records) ? records : [records]) {
                        const idx = rows.findIndex((item) => item.id === r.id);
                        if (idx >= 0) rows[idx] = r;
                        else rows.push(r);
                    }
                    version += 1;
                    return { ok: true };
                },
                matchesIncomplete: () => false,
            };
        },
    };
}

test('流式结束：GENERATION_ENDED 传 chat.length（越界 1 位）与延迟落楼仍正确定位最新 AI 楼号', async () => {
    const bus = createEventBus();
    const chat = [
        { is_user: true, mes: '出发' },
        { is_user: false, mes: '[igs-scene:暗林|夜|雾]\n[igs-combat:start|林间伏击|暗影狼*1|无|普通]', swipe_id: 0 },
    ];
    const ctx = {
        chat,
        getCurrentChatId: () => 'stream-id-chat',
        eventTypes: {
            GENERATION_STARTED: 'gs',
            GENERATION_ENDED: 'ge',
            GENERATION_STOPPED: 'gx',
            MESSAGE_RECEIVED: 'mr',
            CHARACTER_MESSAGE_RENDERED: 'cmr',
            MESSAGE_UPDATED: 'mu',
            MESSAGE_EDITED: 'me',
            MESSAGE_SWIPED: 'ms',
            CHAT_CHANGED: 'cc',
        },
        eventSource: bus.eventSource,
    };
    const host = createIllustrationMessageHost({ SillyTavern: { getContext: () => ctx } });
    const fired = [];
    const off = host.onImageFloorReady((id, meta) => fired.push({ id, eventKey: meta?.eventKey, text: meta?.text }));

    // 1) SillyTavern 真实流式结束：GENERATION_ENDED 传入 chat.length (=2) 而非 1
    bus.emit('gs', 'normal', {}, false);
    bus.emit('ge', chat.length);
    await Promise.resolve();
    assert.equal(fired.length, 1, 'GENERATION_ENDED 传入 chat.length 时应回落定位到最新 AI 楼 1');
    assert.equal(fired[0].id, 1);

    // 2) GENERATION_ENDED 到达时新 AI 楼尚未 push 进 chat，随后 MESSAGE_RECEIVED 补齐时仍可派发
    chat.push({ is_user: true, mes: '继续前进' });
    bus.emit('gs', 'normal', {}, false);
    bus.emit('ge', chat.length);
    await Promise.resolve();
    assert.equal(fired.length, 1, '新 AI 楼尚未入栈前不应误派发旧楼');
    chat.push({ is_user: false, mes: '[igs-scene:山洞|夜|阴]\n第二段流式正文落地。', swipe_id: 0 });
    bus.emit('mr', 3);
    assert.equal(fired.length, 2, '延迟落楼的 MESSAGE_RECEIVED 应正确派发第 3 楼');
    assert.equal(fired[1].id, 3);

    off();
    host.destroy();
});

test('战斗准备流式优化：流式期间暂缓并在结束后自动补跑，越界楼号与插图标记写入不中断备战', async (t) => {
    const bus = createEventBus();
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const storage = createMemoryStorage();
    const chat = [
        { is_user: true, mes: '开始冒险' },
        { is_user: false, mes: '[igs-scene:古城|夜|阴]\n[igs-combat:start|城门截击|暗影狼*1|无|普通]', swipe_id: 0 },
    ];
    const ctx = {
        chat,
        name1: '主角',
        chatMetadata: {},
        getCurrentChatId: () => 'stream-combat-chat',
        eventTypes: {
            GENERATION_STARTED: 'gs',
            GENERATION_ENDED: 'ge',
            GENERATION_STOPPED: 'gx',
            CHAT_CHANGED: 'cc',
        },
        eventSource: bus.eventSource,
    };
    const passiveKey = Object.keys(PASSIVE_TEMPLATES)[0];
    const mageKeys = Object.keys(templatesFor('mage'));
    const heroSkillKey = mageKeys.find((k) => heroSkillFromTemplate(k, { id: 'x', name: 'x' }));
    const worldNames = Array.from({ length: 8 }, (_, i) => `星术${i + 1}`);
    let enemyPrepStarted = null;
    let enemyPrepRelease = null;
    let llmCalls = 0;

    const services = createCombatServices({
        global: {
            AutoCardUpdaterAPI: db.api,
            SillyTavern: { getContext: () => ctx },
        },
        getChatId: () => 'stream-combat-chat',
        getUserName: () => '主角',
        getReaderSettings: () => ({ combatExpansion: { enabled: true, kind: 'combat' } }),
        getAutoIllustration: () => ({ llm: { source: 'tavern' } }),
        storage,
        request: async (prompt) => {
            llmCalls += 1;
            const parsed = JSON.parse(prompt.user);
            const entities = [];
            let waitEnemy = false;
            for (const e of parsed.entities) {
                if (e.kind === 'class') entities.push({ key: e.key, value: { className: '星辉术士', archetype: 'mage' } });
                else if (e.kind === 'profile-deck') entities.push({ key: e.key, value: { hp: 58, passive: ['星感', passiveKey], skill: ['星火', heroSkillKey], cards: [['星箭', mageKeys[0]], ['星盾', mageKeys[1]], ['星流', mageKeys[2]], ['星震', mageKeys[3]]] } });
                else if (e.kind === 'profile-gear') entities.push({ key: e.key, value: { gear: [['观星短杖', 'weapon', 'common', '观星塔见习杖']] } });
                else if (e.kind === 'starter-deck-naming') entities.push({ key: e.key, value: { names: worldNames } });
                else if (e.kind === 'enemy-roster') {
                    waitEnemy = true;
                    const code = e.input?.pool?.[0]?.code || 'E01';
                    const enemies = (e.input?.enemies || []).map((name) => [name, code]);
                    entities.push({ key: e.key, value: { enemies } });
                } else if (e.kind === 'encounter-theme') {
                    entities.push({ key: e.key, value: { theme: 'western' } });
                } else if (e.kind === 'battle-reward') {
                    entities.push({ key: e.key, value: { slots: [], reserve: [] } });
                }
            }
            if (waitEnemy && enemyPrepRelease) {
                enemyPrepStarted?.resolve();
                await enemyPrepRelease.promise;
            }
            return JSON.stringify({ entities });
        },
        retryDelays: [0],
        generationMaxRounds: 0,
    });
    t.after(() => { enemyPrepRelease?.resolve(); services.dispose(); });

    // 先写入主角六维属性，让主角准备可直接通过属性门槛
    assert.equal((await services.ensureTables()).ok, true);
    const { createCombatTables } = await import('../src/data/shujuku/combat-tables.js');
    const tables = createCombatTables({ api: db.api });
    t.after(() => tables.client.dispose());
    const heroKey = (await services.getLedger().effectiveState()).protagonistKey || 'nm-' + (await import('../src/combat/random.js')).hashString('主角');
    assert.equal((await tables.append('attribute', [{
        id: `hero-base|${heroKey}`, type: 'hero-base', character: heroKey, createdAt: Date.now(), anchor: null, change: '初始化',
        payload: { scores: { str: 10, dex: 12, con: 11, int: 16, wis: 13, cha: 10 } },
    }])).ok, true);

    // 1) 酒馆流式生成期间：prepareProtagonist 与 autoPrepare 均平滑延后，不抢跑也不误锁死为永久失败
    bus.emit('gs', 'normal', {}, false);
    const deferredHero = await services.prepareProtagonist();
    const deferredCombat = await services.autoPrepare(chat.length);
    assert.equal(deferredHero.deferred, true);
    assert.equal(deferredHero.reason, 'combat-stream-waiting');
    assert.equal(deferredCombat.deferred, true);
    assert.equal(deferredCombat.reason, 'combat-stream-waiting');
    assert.equal(llmCalls, 0, '流式输出期间不应提前发出战斗准备 LLM 请求');

    // 2) 流式结束（且此前 autoPrepare 拿到的是越界的 chat.length=2）：自动补跑并定位到第 1 楼；
    //    期间自动插图向第 1 楼写入 [igs-img:1] 标记，不得使备战租约失效（request-stale）
    enemyPrepStarted = deferred();
    enemyPrepRelease = deferred();
    bus.emit('ge', chat.length);
    await enemyPrepStarted.promise;
    chat[1].mes = `${chat[1].mes}\n[igs-img:1]`;
    enemyPrepRelease.resolve();
    await flushAsync(20);

    assert.equal(services.getProtagonist()?.status, 'ready', '流式结束后主角准备应自动完成');
    assert.equal(services.getSession().state().status, 'lobby', `越界楼号与插图标记写入下备战应直接进入 lobby，无需手动重试: ${JSON.stringify(services.getSession().state())}`);
    assert.equal(services.getSession().state().anchor?.messageId, 1);
});

test('战斗素材 MVU 读取：最新流式楼抛找不到消息 ID 时跳过并回读前序有效楼层', async () => {
    const chat = [
        { is_user: false, mes: '开场白', swipe_id: 0 },
        { is_user: true, mes: '继续' },
        { is_user: false, mes: '流式进行中...', swipe_id: 0 },
    ];
    const host = {
        SillyTavern: { getContext: () => ({ chat }) },
        TavernHelper: {
            getVariables: async ({ type, message_id }) => {
                if (type === 'message' && message_id === 2) throw new Error('找不到消息 ID: 2');
                if (type === 'message' && message_id === 0) return { stat_data: { 主角: { 技能: { 星斩: { 状态: '已掌握' } } } } };
                return {};
            },
        },
    };
    const read = createCombatGenerationMaterials(host);
    const result = await read({ name: '主角', protagonist: '主角' });
    assert.equal(result.ok, true);
    assert.equal(result.mvuStatus, 'ready', '流式最新楼找不到消息 ID 时应回读前序楼层成功');
    assert.equal(result.mvuFloor, 0);
});

test('战斗面板：打开时遇到流式楼层找不到 ID 或瞬态取消会自动重新定位并重试，无需手点重试', async (t) => {
    const dom = new JSDOM('<!doctype html><html><body><div id="igs-overlay"></div></body></html>');
    t.after(() => dom.window.close());
    const overlay = dom.window.document.querySelector('#igs-overlay');
    const seenIds = [];
    let state = { status: 'blocked', reason: 'request-stale', anchor: { messageId: 1 } };
    let currentFloor = 2;
    const mockSession = {
        state: () => state,
        subscribe: () => () => {},
        prepare: async (id) => {
            seenIds.push(id);
            if (seenIds.length === 1) {
                currentFloor = 1;
                state = { status: 'blocked', reason: 'combat-floor-missing', anchor: { messageId: id } };
                return { ok: false, reason: 'combat-floor-missing', session: state };
            }
            state = {
                status: 'lobby',
                anchor: { messageId: id },
                combatId: `cb|${id}|0|h|0`,
                start: { encounter: '遭遇战', tier: '普通', allies: [], enemies: [{ name: '狼', count: 1 }] },
                lobby: {
                    heroId: 'hero',
                    controllable: ['hero'],
                    allies: [{ id: 'hero', name: '主角', kind: 'deck-character', level: 1, classProfile: { className: '战士' } }],
                    absent: [],
                    downed: [],
                    enemies: new Map([['狼', { id: 'e1', name: '狼', tier: '普通', maxHp: 30, skills: [] }]]),
                    templated: [],
                    vitals: { hero: { hp: 60, maxHp: 60 } },
                },
                skipped: [],
                reward: { status: 'ready', exp: 10, slots: 1 },
            };
            return { ok: true, session: state };
        },
    };
    const panel = createCombatPanelController(dom.window.document, {
        getSession: () => mockSession,
        skin: () => 'initial',
        reducedMotion: () => true,
        prepareRetryDelays: [0, 0],
        resolveMessageId: () => currentFloor,
    });
    t.after(() => panel.dispose());

    // 即使初始状态是同一楼的瞬态 blocked（request-stale），打开面板也会自动重试；首次 combat-floor-missing 后自动刷新楼号为 1 并进入 lobby
    assert.equal(panel.open(overlay, { messageId: 2 }).ok, true);
    await flushAsync(10);
    assert.deepEqual(seenIds, [2, 1], '首次遇到 combat-floor-missing 后应自动重查楼号 1 并重试');
    assert.equal(state.status, 'lobby', '自动重试后应直接进入战前大厅');
});

test('NPC 自动生成：生成中选择自动生成、setBuildMode、并发新角色与超批次自动续跑均可靠触发', async (t) => {
    const bus = createEventBus();
    const tables = createFakeStatsTables();
    const chat = [
        { is_user: false, mes: '[igs-scene:学院|清晨|晴]\n欢迎来到学院。', swipe_id: 0 },
    ];
    let peopleInTable = ['小雪'];
    const ctx = {
        chat,
        name1: '主角',
        name2: '',
        chatMetadata: {},
        getCurrentChatId: () => 'npc-auto-trigger-chat',
        eventTypes: {
            GENERATION_STARTED: 'gs',
            GENERATION_ENDED: 'ge',
            GENERATION_STOPPED: 'gx',
            MESSAGE_SWIPED: 'sw',
            MESSAGE_DELETED: 'del',
            MESSAGE_UPDATED: 'upd',
            CHAT_CHANGED: 'chat',
        },
        eventSource: bus.eventSource,
        setExtensionPrompt() {},
    };
    const requestedBatches = [];
    const rt = createStatsRuntime({
        getContext: () => ctx,
        readSettings: () => ({ enabled: true, sheetGen: 'auto', backfill: 'off', push: { enabled: false }, ruleset: 'coc7' }),
        statsTables: () => tables.api(),
        tablePeople: () => peopleInTable,
        generationIdentity: () => 'owner-1',
        generationRoute: () => 'route-1',
        getBackgroundRequest: () => async (prompt) => {
            const match = String(prompt?.user || '').match(/每人都要有：([^\n]+)/);
            if (!match) return '{}';
            const names = match[1].split('、').map((s) => s.trim()).filter(Boolean);
            requestedBatches.push(names);
            const out = {};
            for (const name of names) Object.assign(out, buildValidSheet(name));
            return JSON.stringify(out);
        },
    });
    t.after(() => rt.destroy());
    rt.sync();
    await rt.whenSaved();

    // 在 AI 正在生成期间用户点击「自动生成」：应成功保存策略并在生成结束后自动同步表格人物并触发数值生成
    bus.emit('gs', 'normal', {}, false);
    const chosen = await rt.noticeAction('npc-policy', 'auto');
    assert.equal(chosen.ok, true);
    assert.equal(requestedBatches.length, 0, '主生成进行中不应抢跑 NPC 请求');

    // 结束后新楼没有 [igs-stat:] 标签，只输出普通正文，也必须自动触发小雪数值生成并落库
    chat.push({ is_user: true, mes: '你好' });
    chat.push({ is_user: false, mes: '[igs-scene:走廊|上午|晴]\n小雪微笑着点点头。', swipe_id: 0 });
    bus.emit('ge');
    await flushAsync(15);
    await rt.whenSaved();
    assert.deepEqual(requestedBatches, [['小雪']], '生成结束后应立即自动为小雪发起数值生成');
    assert.ok(rt.getCatalog().sheets['小雪'], '小雪数值卡应已自动生成落库');
});

test('NPC 自动生成：在途并发新角色与超过 8 人分批自动续跑 + setBuildMode(auto) 立即触发', async (t) => {
    const bus = createEventBus();
    const tables = createFakeStatsTables();
    const chat = [
        { is_user: false, mes: '[igs-scene:广场|白昼|晴]\n人群熙攘。', swipe_id: 0 },
    ];
    let peopleInTable = ['甲'];
    const ctx = {
        chat,
        name1: '主角',
        name2: '',
        chatMetadata: {},
        getCurrentChatId: () => 'npc-drain-chat',
        eventTypes: {
            GENERATION_STARTED: 'gs',
            GENERATION_ENDED: 'ge',
            GENERATION_STOPPED: 'gx',
            MESSAGE_SWIPED: 'sw',
            MESSAGE_DELETED: 'del',
            MESSAGE_UPDATED: 'upd',
            CHAT_CHANGED: 'chat',
        },
        eventSource: bus.eventSource,
        setExtensionPrompt() {},
    };
    const requestedBatches = [];
    const batch1Gate = deferred();
    const batch1Started = deferred();
    const rt = createStatsRuntime({
        getContext: () => ctx,
        readSettings: () => ({ enabled: true, sheetGen: 'auto', backfill: 'off', push: { enabled: false }, ruleset: 'coc7' }),
        statsTables: () => tables.api(),
        tablePeople: () => peopleInTable,
        generationIdentity: () => 'owner-drain',
        generationRoute: () => 'route-drain',
        getBackgroundRequest: () => async (prompt) => {
            const match = String(prompt?.user || '').match(/每人都要有：([^\n]+)/);
            if (!match) return '{}';
            const names = match[1].split('、').map((s) => s.trim()).filter(Boolean);
            requestedBatches.push(names);
            if (requestedBatches.length === 1) {
                batch1Started.resolve();
                await batch1Gate.promise;
            }
            const out = {};
            for (const name of names) Object.assign(out, buildValidSheet(name));
            return JSON.stringify(out);
        },
    });
    t.after(() => { batch1Gate.resolve(); rt.destroy(); });
    rt.sync();
    await rt.whenSaved();

    // 通过 setBuildMode('auto') 启用自动策略：应立刻同步并触发「甲」生成
    assert.equal(rt.setBuildMode('auto').ok, true);
    await batch1Started.promise;
    assert.deepEqual(requestedBatches, [['甲']]);

    // 「甲」仍在生成期间，新增 9 位角色（超过 SHEET_BATCH_MAX=8）
    peopleInTable = ['甲', '角色1', '角色2', '角色3', '角色4', '角色5', '角色6', '角色7', '角色8', '角色9'];
    rt.sync();
    batch1Gate.resolve();
    await flushAsync(25);
    await rt.whenSaved();

    assert.equal(requestedBatches.length, 3, `应依次完成甲 + 8人批 + 剩余1人批：${JSON.stringify(requestedBatches)}`);
    assert.equal(requestedBatches[1].length, 8);
    assert.deepEqual(requestedBatches[2], ['角色9']);
    for (const name of peopleInTable) {
        assert.ok(rt.getCatalog().sheets[name], `${name} 的数值卡应全部自动生成完毕`);
    }
});

test('NPC 上一楼生成失败后，下一楼再次出场自动重试；未出场或同楼更新不重复刷请求，已暂不建档不重试', async (t) => {
    const bus = createEventBus();
    const tables = createFakeStatsTables();
    const chat = [
        { is_user: false, mes: '[igs-scene:旅店|黄昏|晴]\n开场。', swipe_id: 0 },
    ];
    let peopleInTable = [];
    const ctx = {
        chat,
        name1: '主角',
        name2: '',
        chatMetadata: {},
        getCurrentChatId: () => 'npc-retry-chat',
        eventTypes: {
            GENERATION_STARTED: 'gs',
            GENERATION_ENDED: 'ge',
            GENERATION_STOPPED: 'gx',
            MESSAGE_SWIPED: 'sw',
            MESSAGE_DELETED: 'del',
            MESSAGE_UPDATED: 'upd',
            CHAT_CHANGED: 'chat',
        },
        eventSource: bus.eventSource,
        setExtensionPrompt() {},
    };
    const requestedBatches = [];
    let shouldFail = true;
    const rt = createStatsRuntime({
        getContext: () => ctx,
        readSettings: () => ({ enabled: true, sheetGen: 'auto', backfill: 'off', push: { enabled: false }, ruleset: 'coc7' }),
        statsTables: () => tables.api(),
        tablePeople: () => peopleInTable,
        generationIdentity: () => 'owner-retry',
        generationRoute: () => 'route-retry',
        getBackgroundRequest: () => async (prompt) => {
            const match = String(prompt?.user || '').match(/每人都要有：([^\n]+)/);
            if (!match) return '{}';
            const names = match[1].split('、').map((s) => s.trim()).filter(Boolean);
            requestedBatches.push(names);
            if (shouldFail) return 'invalid-json-not-object';
            const out = {};
            for (const name of names) Object.assign(out, buildValidSheet(name));
            return JSON.stringify(out);
        },
    });
    t.after(() => rt.destroy());
    rt.sync();
    await rt.whenSaved();
    assert.equal((await rt.setNpcPolicy('auto')).ok, true);
    assert.equal((await rt.setNpcChoice('阿强', 'defer')).ok, true);
    peopleInTable = ['小雪', '林风', '阿强'];

    const runTurn = (aiText) => {
        bus.emit('gs', 'normal', {}, false);
        chat.push({ is_user: true, mes: '继续' });
        chat.push({ is_user: false, mes: aiText, swipe_id: 0 });
        bus.emit('ge');
        return chat.length - 1;
    };

    // 第 1 轮：小雪、林风、阿强都出场，但本次模型失败；阿强已被 defer 不应请求
    runTurn('[igs-stat:favor|小雪|开心][igs-stat:favor|林风|欣赏][igs-stat:favor|阿强|开心]\n小雪、林风和阿强都在大厅里。');
    await flushAsync(12);
    assert.equal(requestedBatches.length, 1);
    assert.deepEqual([...requestedBatches[0]].sort(), ['小雪', '林风'].sort());
    assert.equal(rt.getCatalog().sheets['小雪'], undefined);
    assert.equal(rt.getCatalog().sheets['林风'], undefined);

    // 同一楼触发 MESSAGE_UPDATED（同楼重算）：不应在同一楼反复重试死循环
    const floor1Id = chat.length - 1;
    bus.emit('upd', floor1Id);
    await flushAsync(10);
    assert.equal(requestedBatches.length, 1, '同一楼重算不得重复触发失败 NPC 自动重试');

    // 第 2 轮：模型恢复正常，且本楼只有林风再次出场（无 stat 标签，仅正文提及），小雪未出场
    shouldFail = false;
    runTurn('林风端着茶走了进来，笑着与你交谈。阿强也路过了门口。');
    await flushAsync(15);
    await rt.whenSaved();
    assert.equal(requestedBatches.length, 2, '林风在下一楼再次出场应自动重试');
    assert.deepEqual(requestedBatches[1], ['林风'], '仅再次出场的林风重试，未出场的小雪与已 defer 的阿强不得请求');
    assert.ok(rt.getCatalog().sheets['林风'], '林风应自动重试生成成功');
    assert.equal(rt.getCatalog().sheets['小雪'], undefined);
    assert.equal(rt.getCatalog().sheets['阿强'], undefined);

    // 第 3 轮：小雪在更下一楼再次出场 -> 自动重试并生成成功
    runTurn('推开门后，小雪正坐在窗边看雪。');
    await flushAsync(15);
    await rt.whenSaved();
    assert.equal(requestedBatches.length, 3, '小雪再次出场应自动重试');
    assert.deepEqual(requestedBatches[2], ['小雪']);
    assert.ok(rt.getCatalog().sheets['小雪'], '小雪应自动重试生成成功');
});
