import { createStatsState } from '../src/scene/stats/stat-state.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { STATS_PROMPT_KEY, createStatsRuntime } from '../src/core/stats-runtime.js';
import { STATS_METADATA_KEY } from '../src/scene/stats/stat-persist.js';
import { serializeLedger } from '../src/scene/stats/stat-persist.js';
import { createStatsLedger } from '../src/scene/stats/stat-ledger.js';
import { ledgerKey } from '../src/scene/stats/stat-ledger.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { createStatsGenerationIntents } from '../src/storage/stats-generation-intents.js';
import { createModelRouteIdentity } from '../src/host/model-route-identity.js';

const T = { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', CHAT_CHANGED: 'chat' };

function fakeHost() {
    const handlers = new Map();
    const eventSource = {
        on(n, f) { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
        removeListener(n, f) { handlers.get(n)?.delete(f); },
        emit(n, ...a) { for (const f of [...(handlers.get(n) || [])]) f(...a); },
        count() { let k = 0; for (const s of handlers.values()) k += s.size; return k; },
    };
    let saves = 0;
    const ctx = {
        name2: '小雪', chat: [{ is_user: true, mes: '你好' }], chatMetadata: {}, extensionPrompts: {},
        eventSource, eventTypes: T, getCurrentChatId: () => 'chat-1',
        setExtensionPrompt(key, value, position) { this.extensionPrompts[key] = { value, position }; },
        saveMetadata() { saves += 1; },
    };
    return { ctx, eventSource, saves: () => saves };
}

// 内存版数值日志表：和宿主 statsTables 同形，read 返回 { ok, stats }，append 追加，version 随写入递增。
function fakeTables({ exists = true } = {}) {
    const t = { rows: exists ? [] : null, version: 0, reads: 0 };
    t.api = () => ({
        ok: true,
        get version() { return t.version; },
        read() { t.reads += 1; return { ok: true, stats: t.rows ? t.rows.slice() : undefined }; },
        append(records) { t.rows.push(...records); t.version += 1; return Promise.resolve({ ok: true }); },
        ensure() { t.rows = t.rows || []; return Promise.resolve({ ok: true }); },
    });
    return t;
}

function setup(enabled = true, extra = {}, tableOpts = {}) {
    const host = fakeHost();
    // 设置按引用缓存规范化结果，所以改设置要换新对象，不能原地改。
    const holder = { cur: { enabled, ...extra } };
    const set = (patch) => { holder.cur = { ...holder.cur, ...patch }; };
    const tables = fakeTables(tableOpts);
    const make = (over = {}) => createStatsRuntime({ getContext: () => host.ctx, readSettings: () => holder.cur, statsTables: tables.api, ...over });
    const rt = make();
    rt.sync();
    return { host, rt, set, tables, make };
}

function reply(host, text, swipeId = 0) {
    host.ctx.chat.push({ is_user: false, mes: text, swipe_id: swipeId });
    return host.ctx.chat.length - 1;
}

function generate(host, text, type = 'normal') {
    host.eventSource.emit('gs', type, {}, false);
    const injected = host.ctx.extensionPrompts[STATS_PROMPT_KEY]?.value || '';
    const id = type === 'continue' ? host.ctx.chat.length - 1 : reply(host, text);
    if (type === 'continue') host.ctx.chat[id].mes += text;
    host.eventSource.emit('ge', id);
    return { id, injected };
}

const favor = (rt) => rt.getState()?.characters.小雪?.dims.好感;

test('总开关关闭时不挂任何监听；打开后挂上，再关掉全部解绑（易错点 H1）', () => {
    const { host, rt, set } = setup(false);
    assert.equal(host.eventSource.count(), 0);
    set({ enabled: true });
    rt.sync();
    assert.ok(host.eventSource.count() > 0);
    set({ enabled: false });
    rt.sync();
    assert.equal(host.eventSource.count(), 0);
});

test('本聊天暂停时不注入、不结算（易错点 H2）；数值总开关打开后新聊天直接自动启用', () => {
    const { host, rt, tables } = setup();
    assert.equal(rt.isChatEnabled(), true);
    assert.equal(rt.disableForChat().ok, true);
    const beforeRows = tables.rows.length;
    const { injected } = generate(host, '[igs-stat:favor|小雪|开心]');
    assert.equal(injected, '');
    assert.equal(rt.isActive(), false);
    assert.equal(host.ctx.chatMetadata[STATS_METADATA_KEY], undefined);
    assert.equal(tables.rows.length, beforeRows);
});

test('正常发送：生成前注入、结束后清除并结算一次，差分写进数据库表（易错点 A3/A6/B2）', async () => {
    const { host, rt, tables } = setup(true, { favorMode: 'hard' });
    rt.enableForChat();
    const { injected } = generate(host, '她笑了。[igs-stat:favor|小雪|开心]');
    assert.match(injected, /主角状态/);
    assert.equal(host.ctx.extensionPrompts[STATS_PROMPT_KEY], undefined);
    assert.ok(favor(rt) >= 1);
    await rt.whenSaved();
    assert.ok(tables.rows.some((r) => r.type === 'init'));
    assert.ok(tables.rows.some((r) => r.type === 'floor'));
    assert.ok(tables.rows.some((r) => r.payload.key === 'chat:enabled' && r.payload.value === true));
    assert.equal(host.ctx.chatMetadata[STATS_METADATA_KEY], undefined);
    const before = favor(rt);
    host.eventSource.emit('ge', 1);
    assert.equal(favor(rt), before);
});

test('dryRun、quiet、代写生成不注入、不结算（易错点 A1）', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    for (const [type, dry] of [['normal', true], ['quiet', false], ['impersonate', false]]) {
        host.eventSource.emit('gs', type, {}, dry);
        assert.equal(host.ctx.extensionPrompts[STATS_PROMPT_KEY], undefined, type);
        reply(host, '[igs-stat:favor|小雪|感动]');
        host.eventSource.emit('ge');
    }
    assert.equal(rt.getState().characters.小雪, undefined);
});

test('继续生成按原种子对全文重算，标签不重复计入（易错点 A2）', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    generate(host, '[igs-stat:favor|小雪|感动]');
    const first = favor(rt);
    generate(host, '她又笑了。', 'continue');
    assert.equal(favor(rt), first);
});

test('新 swipe 从上一楼状态重掷；切回旧 swipe 读取已存结果；删楼回退（易错点 B1/B3）', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    const { id } = generate(host, '[igs-stat:favor|小雪|受伤]');
    assert.equal(favor(rt), -15);
    host.ctx.chat[id] = { is_user: false, mes: '[igs-stat:favor|小雪|失望]', swipe_id: 1 };
    host.eventSource.emit('sw', id);
    host.eventSource.emit('gs', 'swipe', {}, false);
    host.eventSource.emit('ge', id);
    assert.equal(favor(rt), -3);
    host.ctx.chat[id] = { is_user: false, mes: '[igs-stat:favor|小雪|受伤]', swipe_id: 0 };
    host.eventSource.emit('sw', id);
    assert.equal(favor(rt), -15);
    host.ctx.chat.pop();
    host.eventSource.emit('del', id);
    assert.equal(rt.getState().characters.小雪, undefined);
});

test('编辑 AI 楼正文后只重算该楼（易错点 A5）', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    const { id } = generate(host, '[igs-stat:favor|小雪|开心]');
    host.ctx.chat[id].mes = '[igs-stat:favor|小雪|受伤]';
    host.eventSource.emit('upd', id);
    assert.equal(favor(rt), -15);
});

test('换聊天后从表里读回；旧版存档来自更新版本时拒绝导入且不覆盖', async () => {
    const { host, rt, tables, make } = setup();
    rt.enableForChat();
    generate(host, '[igs-stat:favor|小雪|受伤]');
    await rt.whenSaved();
    host.eventSource.emit('chat');
    assert.equal(rt.isChatEnabled(), true);
    assert.equal(favor(rt), -15);
    const fresh = fakeTables();
    const other = make({ statsTables: fresh.api });
    host.ctx.chatMetadata[STATS_METADATA_KEY] = { version: 99 };
    other.sync();
    assert.equal(other.enableForChat().reason, 'stats-save-newer');
    assert.deepEqual(host.ctx.chatMetadata[STATS_METADATA_KEY], { version: 99 });
    assert.equal(fresh.rows.length, 0);
    assert.ok(other.getDiagnostics().some((d) => d.code === 'stats-save-newer'));
    assert.ok(tables.rows.length > 0);
});

test('旧存档没有 heroSlots：按已学的非剧情技能回填，值 ≥ 60 进擅长格，其余进比较擅长格', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    host.ctx.chat.push({ is_user: true, mes: '你好' });
    generate(host, '好。');
    rt.heroOp('pick', '', { skills: { 烹饪: 60, 学习: 60, 唱歌: 30, 舞蹈: 30 } });
    assert.equal(rt.getCatalog().heroSlots.strong1 !== undefined, true);
    const slots = rt.archive().heroSlots;
    assert.deepEqual(Object.values(slots).sort(), ['唱歌', '学习', '烹饪', '舞蹈']);
    assert.ok(['烹饪', '学习'].includes(slots.strong1) && ['烹饪', '学习'].includes(slots.strong2));
    assert.ok(['唱歌', '舞蹈'].includes(slots.good1) && ['唱歌', '舞蹈'].includes(slots.good2));
});

test('旧存档没有 heroSlots：删除、降档后其余技能不换格', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    host.ctx.chat.push({ is_user: true, mes: '你好' });
    generate(host, '好。');
    rt.heroOp('pick', '', { skills: { 烹饪: 60, 唱歌: 45, 舞蹈: 40, 学习: 30 } });
    rt.getCatalog().heroSlots = null;
    const before = { ...rt.archive().heroSlots };
    assert.equal(rt.skillOp('remove', '唱歌').ok, true);
    const after = rt.archive().heroSlots;
    for (const [slot, name] of Object.entries(before)) assert.equal(after[slot], name === '唱歌' ? undefined : name, slot);
    // 降档同理：烹饪降到入门后仍留在擅长格，不被回填挪到比较擅长格。
    rt.getCatalog().heroSlots = null;
    const kept = { ...rt.archive().heroSlots };
    assert.equal(rt.heroOp('edit', '烹饪', { tier: '入门' }).ok, true);
    assert.deepEqual(rt.archive().heroSlots, kept);
});

test('结算种子由聊天、楼序号、swipe 决定：两个独立运行得到同样的结算', () => {
    const run = () => {
        const { host, rt } = setup(true, { ruleset: 'dnd5e' });
        rt.enableForChat();
        host.ctx.chat.push({ is_user: true, mes: '我去晨跑' });
        const { id } = generate(host, '跑完了。[igs-stat:stamina|重]');
        return rt.getLedger().entries.get(ledgerKey(rt.getLedger(), id, 0)).seed;
    };
    assert.equal(run(), run());
});

test('建档策略未选择时等待；手动选择持久化，冷重建不退回自动', async t => {
    const { rt, make } = setup(true, { newChat: 'ask' });
    t.after(() => rt.destroy());
    assert.equal(rt.isChatEnabled(), true);
    assert.equal(rt.buildPolicy().ready, false);
    assert.equal(rt.buildPolicy().mode, null);
    assert.equal(rt.setBuildMode('manual').ok, true);
    assert.equal(rt.buildPolicy().mode, 'manual');
    assert.equal(rt.setBuildChoice('小雪', 'skip').ok, true);
    await rt.whenSaved();
    const cold = make();
    t.after(() => cold.destroy());
    cold.sync();
    assert.deepEqual(cold.buildPolicy(), { ready: true, chatId: 'chat-1', reason: '', mode: 'manual', choices: { 小雪: 'skip' } });
});

test('移除旧主角 onboarding/build-mode 门禁：历史 ask 与 declined 不阻断自动启用', async t => {
    const f = setup(false, { newChat: 'ask' });
    f.rt.destroy();
    // 模拟历史聊天曾被标记为 declined，新版本开启数值后不再永久卡死在旧弹窗。
    f.host.ctx.chatMetadata.igs_stats_declined = true;
    const rt = f.make({ readSettings: () => ({ enabled: true, newChat: 'ask', ruleset: 'coc7', autoSkill: false, sheetGen: 'off', backfill: 'off', push: { enabled: false } }) });
    t.after(() => rt.destroy());
    rt.sync();
    assert.equal(rt.isChatEnabled(), true);
    assert.equal(rt.notices().some(n => n.id === 'onboarding' || n.id === 'build-mode'), false);
    assert.equal(rt.noticeAction('onboarding', 'quick').reason, 'stats-notice-gone');
    assert.equal(rt.noticeAction('build-mode', 'pick:manual').reason, 'stats-notice-gone');
});

test('跨聊天 NPC 缓存退役：启动和生成不读写 igs-stats-sheets-v1，不删除存量缓存且保留本聊天 DB 档案', async t => {
    const f = setup(true, { sheetGen: 'auto', backfill: 'off', push: { enabled: false } });
    f.rt.destroy();
    const sheetCalls = [];
    const legacyCache = { 'card|小雪': { at: 1, sheet: { rank: '精英', attributes: { 力量: 15 }, skills: { 潜行: 80 }, signature: [] } } };
    const storage = createMemoryStorage({ 'igs-stats-sheets-v1': JSON.stringify(legacyCache) });
    const reqs = [];
    const rt = f.make({
        currencyEditStorage: storage,
        getBackgroundRequest: () => (prompt) => {
            reqs.push(prompt);
            return JSON.stringify({ 小雪: { 资历: '老手', 属性: { 敏捷: '出众' }, 擅长: ['潜行', '侦查', '格斗'], 比较擅长: ['说服', '闪避', '急救', '攀爬', '开锁'] } });
        },
        sheetStore: {
            get: (...args) => { sheetCalls.push(['get', ...args]); return legacyCache['card|小雪'].sheet; },
            put: (...args) => { sheetCalls.push(['put', ...args]); return { ok: true }; },
        },
    });
    t.after(() => rt.destroy());
    rt.sync();
    assert.equal((await rt.setNpcPolicy('auto')).ok, true);
    generate(f.host, '[igs-stat:favor|小雪|开心]');
    await settleGeneration();
    await rt.whenSaved();
    assert.deepEqual(sheetCalls, [], '不再读写跨聊天 NPC 缓存');
    assert.equal(storage.getItem('igs-stats-sheets-v1'), JSON.stringify(legacyCache), '存量跨聊天缓存未被物理删除');
    assert.ok(reqs.length >= 1, '新聊天按本聊天流程生成，不从跨聊天缓存复制 carried 卡');
    assert.equal(rt.getCatalog().sheets['小雪'].source, 'llm');
});

test('P5 NPC 策略、逐个首次询问、暂不建档相对值、旧 relative 归一与策略切换不覆盖已有卡', async t => {
    const { mergeStatLog, chatEntries, diffChatRecords, initRecord } = await import('../src/scene/stats/stat-log.js');
    const { createStatsState } = await import('../src/scene/stats/stat-state.js');
    // 1. 旧 relative 兼容读归一为 per-npc，绝不被误解为自动授权
    const legacyRecords = [
        initRecord(createStatsState()),
        ...diffChatRecords(chatEntries(), chatEntries({ chatEnabled: true, buildMode: 'relative', buildChoices: { 小雪: 'skip' } }), { tag: 'old' }),
    ];
    const restoredLegacy = mergeStatLog(legacyRecords, { chatId: 'legacy-1', chat: [] });
    assert.equal(restoredLegacy.npcPolicy, 'per-npc', '旧 relative 必须归一化为 per-npc，不得视作自动授权');
    assert.deepEqual(restoredLegacy.npcChoices, { 小雪: 'defer' });

    // 2. 主角基础确认后提供策略选择；选 per-npc 后新角色首次询问一次，选 defer 写入 DB 且冷重建不再询问
    const f = setup(true, { sheetGen: 'prompt', backfill: 'off', push: { enabled: false } });
    f.host.ctx.groupMembers = ['小雪', '林风'];
    f.rt.destroy();
    let sheetReqCount = 0;
    const req = (prompt) => {
        if (/资历|NPC/.test(String(prompt?.system || ''))) sheetReqCount += 1;
        return JSON.stringify({
            小雪: { 资历: '老手', 属性: { 敏捷: '出众' }, 擅长: ['潜行', '侦查', '格斗'], 比较擅长: ['说服', '闪避', '急救', '攀爬', '开锁'] },
            林风: { 资历: '精英', 属性: { 力量: '出众' }, 擅长: ['格斗', '侦查', '攀爬'], 比较擅长: ['说服', '闪避', '急救', '潜行', '开锁'] },
        });
    };
    const rt = f.make({ getBackgroundRequest: () => req });
    t.after(() => rt.destroy());
    rt.sync();
    assert.equal(rt.notices().some(n => n.id === 'npc-policy'), true, '主角基础确认后弹出 NPC 策略选择');
    assert.equal((await rt.noticeAction('npc-policy', 'per-npc')).ok, true);
    assert.equal(rt.getNpcPolicy(), 'per-npc');
    assert.equal(rt.notices().some(n => n.id === 'npc-policy'), false);

    // 发现新角色小雪：首次询问一次；暂不建档不发 NPC 角色卡请求
    generate(f.host, '[igs-stat:favor|小雪|开心]');
    assert.equal(sheetReqCount, 0, '逐个策略未选择前不自动发 NPC 角色卡请求');
    const ask = rt.notices().find(n => n.id === 'npc-ask');
    assert.equal(ask?.name, '小雪');
    assert.equal((await rt.noticeAction('npc-ask', 'defer')).ok, true);
    assert.equal(rt.getNpcChoices()['小雪'], 'defer');
    assert.equal(rt.notices().some(n => n.id === 'npc-ask'), false);
    assert.equal(sheetReqCount, 0);
    await rt.whenSaved();

    // 冷重建：复用 DB 中策略与 defer 选择，不再重复询问小雪
    const cold = f.make({ getBackgroundRequest: () => req });
    t.after(() => cold.destroy());
    cold.sync();
    assert.equal(cold.getNpcPolicy(), 'per-npc');
    assert.equal(cold.getNpcChoices()['小雪'], 'defer');
    assert.equal(cold.notices().some(n => n.id === 'npc-policy' || n.id === 'npc-ask'), false, '冷重建复用选择，不重复弹窗');

    // 对林风选择现在生成，随后切策略为 auto 再切回 per-npc：已有林风角色卡不得被覆盖
    generate(f.host, '[igs-stat:favor|林风|欣赏]');
    const ask2 = cold.notices().find(n => n.id === 'npc-ask');
    assert.equal(ask2?.name, '林风');
    const genRes = await cold.noticeAction('npc-ask', 'generate');
    assert.equal(genRes.ok, true);
    await cold.whenSaved();
    const linBefore = JSON.stringify(cold.getCatalog().sheets['林风']);
    assert.ok(cold.getCatalog().sheets['林风']);
    const callsBeforeSwitch = sheetReqCount;
    assert.equal((await cold.setNpcPolicy('auto')).ok, true);
    assert.equal((await cold.setNpcPolicy('per-npc')).ok, true);
    assert.equal(JSON.stringify(cold.getCatalog().sheets['林风']), linBefore, '策略切换不得覆盖已有角色卡');
    assert.equal(sheetReqCount, callsBeforeSwitch, '策略切换不为已 defer 或已有卡的角色重发模型');

    // 写入失败时策略回滚且返回失败，不先报成功
    let blockWrite = true;
    const coldFail = f.make({
        getBackgroundRequest: () => req,
        statsTables: () => {
            const base = f.tables.api();
            return { ...base, append: (records, opts) => blockWrite ? Promise.resolve({ ok: false, reason: 'stats-write-failed' }) : base.append(records, opts) };
        },
    });
    t.after(() => coldFail.destroy());
    coldFail.sync();
    const failed = await coldFail.setNpcPolicy('auto');
    assert.equal(failed.ok, false);
    assert.equal(coldFail.getNpcPolicy(), 'per-npc', '写入失败必须回滚内存策略');
    blockWrite = false;
});

test('P5 相对值来源标记与主角纯六维编辑（无战斗表、保存失败保留草稿、冲突拒覆盖）', async t => {
    const { createIgsChatStore } = await import('../src/data/shujuku/igs-chat-store.js');
    const { createLedgerMockHost, userInventorySheet } = await import('./helpers/combat-mock-host-ledger.js');
    const { readIgsChatEvidence } = await import('../src/storage/igs-chat-evidence.js');
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const storage = createMemoryStorage();
    const context = {
        name1: '主角', name2: '小雪', chatId: 'v2-p5-edit-1', chatMetadata: {},
        chat: [{ is_user: true, mes: '出发' }, { is_user: false, mes: '开场。', swipe_id: 0 }],
        getCurrentChatId: () => context.chatId, setExtensionPrompt() {}, saveMetadata() {},
        eventTypes: { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', CHAT_CHANGED: 'cc' },
        eventSource: { on() {}, removeListener() {} },
    };
    const store = createIgsChatStore({
        api: () => db.api, chatId: () => context.chatId, chat: () => context.chat,
        userName: () => context.name1, evidence: id => readIgsChatEvidence({ context, chatId: id, storage }), storage,
    });
    t.after(() => store.dispose());
    assert.equal((await store.get().attributes.ensure()).ok, true);
    const access = store.get().attributeAccess;
    // 未正式建档 NPC 返回相对值且明确标记 source='relative', initialized=false
    const relNpc = access.source().readAbilities('小雪');
    assert.equal(relNpc.initialized, false);
    assert.equal(relNpc.source, 'relative');

    // 主角纯六维初始化与手动修改（无战斗档案），冲突修订拒收
    const initRead = access.readHero('主角');
    assert.equal((await access.initHero('主角', { str: 10, dex: 12, con: 11, int: 13, wis: 10, cha: 12 })).ok, true);
    const afterInit = access.readHero('主角');
    assert.equal(afterInit.view.initialized, true);
    assert.equal(afterInit.view.source, 'formal');
    const editOk = await access.editHero('主角', { str: 16, dex: 12, con: 11, int: 13, wis: 10, cha: 12 }, { expectedRevision: afterInit.view.revision });
    assert.equal(editOk.ok, true);
    const staleEdit = await access.editHero('主角', { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }, { expectedRevision: afterInit.view.revision });
    assert.equal(staleEdit.ok, false);
    assert.equal(staleEdit.reason, 'stats-attribute-conflict');
    assert.deepEqual(access.readHero('主角').view.permanentScores, { str: 16, dex: 12, con: 11, int: 13, wis: 10, cha: 12 });
});

test('提示词独立版本化升级：一次性覆盖目标键旧自定义与 stale 副本，保留 heroSkills，保存后新编辑跨重启保留', async t => {
    const { bootstrapIGS } = await import('../src/core/bootstrap.js');
    const { DEFAULT_STAT_PROMPTS, STAT_PROMPTS_VERSION, STAT_PROMPT_MIGRATION_VERSION } = await import('../src/scene/stats/stat-prompt.js');
    const { normalizeStatsSettings } = await import('../src/scene/stats/stat-settings.js');
    const oldConfig = {
        stats: {
            enabled: false,
            promptsVersion: 5,
            prompts: {
                sheetGen: '旧自定义sheetGen',
                backfill: '旧自定义backfill',
                currency: '旧自定义currency',
                heroSkills: '用户自定义heroSkills保留',
                present: '用户自定义present保留',
            },
            stalePrompts: {
                sheetGen: '会复活的stale sheetGen',
                protagonist: '旧protagonist',
            },
        },
    };
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://igs.invalid/' });
    t.after(() => dom.window.close());
    const mockSt = { getContext: () => ({ chat: [], chatMetadata: {}, setExtensionPrompt() {}, saveMetadata() {} }) };
    const makeGlobal = (storage) => ({
        document: dom.window.document, localStorage: storage, SillyTavern: mockSt,
        Event: dom.window.Event, CustomEvent: dom.window.CustomEvent,
        dispatchEvent: dom.window.dispatchEvent.bind(dom.window),
        addEventListener: dom.window.addEventListener.bind(dom.window),
        removeEventListener: dom.window.removeEventListener.bind(dom.window),
    });
    // 1. 保存失败时不标记完成，原始存储维持旧状态
    const failingStorage = createMemoryStorage({ igs_bridge_config: JSON.stringify(oldConfig) });
    const rawSet = failingStorage.setItem.bind(failingStorage);
    let blockWrites = true;
    failingStorage.setItem = (k, v) => { if (blockWrites) throw new Error('disk-full'); return rawSet(k, v); };
    const failedApp = bootstrapIGS({
        global: makeGlobal(failingStorage),
        autoAttachMagicWand: false,
        tavernSettingsSync: false,
    });
    t.after(() => failedApp.shutdown());
    await failedApp.shutdown();
    const afterFailed = JSON.parse(failingStorage.getItem('igs_bridge_config'));
    assert.equal(afterFailed.stats.promptMigrationVersion, undefined, '保存失败时版本标记不得落盘');
    assert.equal(afterFailed.stats.prompts.sheetGen, '旧自定义sheetGen');

    // 2. 保存成功后一次性覆盖目标键，保留 heroSkills/present；并把版本标记落盘
    blockWrites = false;
    const migratedApp = bootstrapIGS({
        global: makeGlobal(failingStorage),
        autoAttachMagicWand: false,
        tavernSettingsSync: false,
    });
    t.after(() => migratedApp.shutdown());
    const afterOk = normalizeStatsSettings(migratedApp.getUnifiedSettings().bridge.stats);
    assert.equal(afterOk.promptsVersion, STAT_PROMPTS_VERSION);
    assert.equal(afterOk.promptMigrationVersion, STAT_PROMPT_MIGRATION_VERSION);
    assert.equal(afterOk.prompts.heroInit, undefined, '目标键改用新版默认');
    assert.equal(afterOk.prompts.sheetGen, undefined, '目标键旧自定义与 stale 副本均被清除');
    assert.equal(afterOk.prompts.backfill, undefined);
    assert.equal(Object.hasOwn(afterOk.prompts, 'currency'), false, '已退役 currency 键被移除');
    assert.equal(afterOk.stalePrompts.sheetGen, undefined, '可恢复的 stale sheetGen 副本已清除');
    assert.equal(afterOk.prompts.heroSkills, '用户自定义heroSkills保留', '无关提示词不被重置');
    assert.equal(afterOk.prompts.present, '用户自定义present保留');
    assert.ok(DEFAULT_STAT_PROMPTS.heroInit);

    // 3. 升级后用户通过公开设置入口重新编辑 heroInit/sheetGen，跨重启必须保留
    const opened = migratedApp.openSettings({ page: 'stats' });
    assert.equal(opened.ok, true);
    assert.equal(opened.controller.setValue('bridge.stats.prompts.heroInit', '升级后用户新编heroInit').ok, true);
    assert.equal(opened.controller.setValue('bridge.stats.prompts.sheetGen', '升级后用户新编sheetGen').ok, true);
    assert.equal(opened.controller.close().ok, true);
    await migratedApp.shutdown();

    const restarted = bootstrapIGS({
        global: makeGlobal(failingStorage),
        autoAttachMagicWand: false,
        tavernSettingsSync: false,
    });
    t.after(() => restarted.shutdown());
    const reloaded = normalizeStatsSettings(restarted.getUnifiedSettings().bridge.stats);
    assert.equal(reloaded.prompts.heroInit, '升级后用户新编heroInit', '升级后新编辑必须跨重启保留');
    assert.equal(reloaded.prompts.sheetGen, '升级后用户新编sheetGen');
    assert.equal(reloaded.prompts.heroSkills, '用户自定义heroSkills保留');
    await restarted.shutdown();
});

const settleGeneration = async () => { for (let i = 0; i < 5; i += 1) await new Promise(resolve => setImmediate(resolve)); };
const deferredGeneration = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const sheetReply = JSON.stringify({ 小雪: { 技能: { 潜行: '熟练' } } });

async function generationFixture(t, request, overrides = {}) {
    const f = setup(true, { newChat: 'ask', sheetGen: 'off', backfill: 'off', push: { enabled: false } });
    f.rt.destroy();
    const changes = [], cached = [], storage = createMemoryStorage();
    const identity = { current: {} };
    const rt = f.make({ getBackgroundRequest: () => request, currencyEditStorage: storage,
        generationIdentity: () => identity.current, onChange: state => changes.push(state),
        sheetStore: { get: () => null, put: (...args) => cached.push(args) }, ...overrides });
    t.after(() => rt.destroy());
    rt.sync();
    assert.equal(rt.enableForChat().ok, true);
    await rt.whenSaved();
    changes.length = 0;
    return { ...f, rt, changes, cached, storage, identity };
}

test('数值生成超过60秒仍复用原请求，失败后只允许明确重试', async t => {
    const replies = [deferredGeneration(), deferredGeneration()];
    let calls = 0;
    const f = await generationFixture(t, () => replies[calls++].promise);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const first = f.rt.generateSheets(['小雪']);
    await settleGeneration();
    t.mock.timers.tick(60001);
    assert.equal(f.rt.generateSheets(['小雪']), first);
    assert.equal(calls, 1);
    assert.equal(f.rt.notices().find(n => n.id === 'sheets').slow, true);
    replies[0].reject(Error('模拟请求失败'));
    assert.equal((await first).ok, false);
    await settleGeneration();
    assert.equal(calls, 1);
    const retry = f.rt.generateSheets(['小雪']);
    assert.equal(f.rt.generateSheets(['小雪']), retry);
    await settleGeneration();
    assert.equal(calls, 2);
    replies[1].resolve(sheetReply);
    assert.equal((await retry).ok, true);
    assert.ok(f.rt.getCatalog().sheets.小雪);
});

test('数值结果拒写时不发布，冷重建后补交原记录且不重新请求模型', async t => {
    let calls = 0;
    const f = await generationFixture(t, () => { calls += 1; return sheetReply; });
    const api = f.tables.api;
    let rejectWrite = true;
    f.tables.api = () => ({ ...api(), append: (rows, options) => rejectWrite
        ? Promise.resolve({ ok: false, reason: 'fixture-write-failed' }) : api().append(rows, options) });
    const rt = f.make({ statsTables: () => f.tables.api(), currencyEditStorage: f.storage,
        getBackgroundRequest: () => () => { calls += 1; return sheetReply; },
        onChange: state => f.changes.push(state), sheetStore: { get: () => null, put: (...args) => f.cached.push(args) } });
    f.rt.destroy();
    t.after(() => rt.destroy());
    rt.sync();
    const failed = await rt.generateSheets(['小雪']);
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, 'stats-generation-save-unverified');
    assert.equal(calls, 1);
    assert.equal(rt.getCatalog().sheets.小雪, undefined);
    assert.equal(f.changes.length, 0);
    assert.equal(f.cached.length, 0);
    assert.ok(rt.notices().some(n => n.id === 'generation-save'));
    rt.destroy();
    rejectWrite = false;
    const cold = f.make({ statsTables: () => f.tables.api(), currencyEditStorage: f.storage,
        getBackgroundRequest: () => () => assert.fail('恢复原结果不得重发模型') });
    t.after(() => cold.destroy());
    cold.sync();
    const saved = cold.noticeAction('generation-save', 'retry');
    assert.equal(cold.noticeAction('generation-save', 'retry'), saved);
    assert.equal((await saved).ok, true);
    assert.equal(calls, 1);
    assert.ok(cold.getCatalog().sheets.小雪);
    assert.equal(cold.notices().some(n => n.id === 'generation-save'), false);
});

test('数值生成的迟到成功与失败在聊天往返、API替换、关闭及销毁后不写入或发布', async t => {
    for (const mode of ['chat', 'api', 'off', 'destroy']) {
        for (const outcome of ['success', 'failure']) await t.test(`${mode}-${outcome}`, async t => {
            const reply = deferredGeneration();
            const f = await generationFixture(t, () => reply.promise);
            const first = f.rt.generateSheets(['小雪']);
            await settleGeneration();
            const rows = f.tables.rows.length;
            if (mode === 'chat') {
                f.host.ctx.getCurrentChatId = () => 'chat-2';
                f.host.eventSource.emit('chat');
                f.host.ctx.getCurrentChatId = () => 'chat-1';
                f.host.eventSource.emit('chat');
            } else if (mode === 'api') f.identity.current = {};
            else if (mode === 'off') { f.set({ enabled: false }); f.rt.sync(); }
            else f.rt.destroy();
            f.changes.length = 0;
            const notices = JSON.stringify(f.rt.notices());
            if (outcome === 'success') reply.resolve(sheetReply);
            else reply.reject(Error('迟到失败'));
            assert.equal((await first).reason, 'request-stale');
            assert.equal(f.tables.rows.length, rows);
            assert.equal(f.rt.getCatalog().sheets.小雪, undefined);
            assert.equal(f.changes.length, 0);
            assert.equal(f.cached.length, 0);
            assert.equal(JSON.stringify(f.rt.notices()), notices);
        });
    }
});

test('数值旧任务finally不解除新任务单飞，手动编辑使旧回包冲突', async t => {
    const replies = [deferredGeneration(), deferredGeneration()];
    let calls = 0;
    const f = await generationFixture(t, () => replies[calls++].promise);
    const old = f.rt.generateSheets(['小雪']);
    await settleGeneration();
    f.identity.current = {};
    const current = f.rt.generateSheets(['小雪']);
    await settleGeneration();
    replies[0].resolve(sheetReply);
    assert.equal((await old).reason, 'request-stale');
    assert.equal(f.rt.generateSheets(['小雪']), current);
    assert.equal(calls, 2);
    assert.equal(f.rt.sheetOp('edit', '小雪', { skill: '潜行', tier: '熟练' }).ok, true);
    await f.rt.whenSaved();
    const edited = structuredClone(f.rt.getCatalog().sheets.小雪);
    const rows = f.tables.rows.length;
    replies[1].resolve(sheetReply);
    assert.equal((await current).reason, 'stats-generation-conflict');
    assert.deepEqual(f.rt.getCatalog().sheets.小雪, edited);
    assert.equal(f.tables.rows.length, rows);
});

test('数值原记录已落库后出现同槽编辑：只确认原提交，不补写或重放旧副作用', async t => {
    let calls = 0;
    const f = await generationFixture(t, () => { calls += 1; return sheetReply; });
    const api = f.tables.api;
    let attempted = [];
    const rt = f.make({ statsTables: () => ({ ...api(), append: records => {
        attempted = structuredClone(records);
        return Promise.resolve({ ok: false, reason: 'fixture-write-unknown' });
    } }), currencyEditStorage: f.storage,
    getBackgroundRequest: () => () => { calls += 1; return sheetReply; } });
    f.rt.destroy();
    t.after(() => rt.destroy());
    rt.sync();
    assert.equal((await rt.generateSheets(['小雪'])).reason, 'stats-generation-save-unverified');
    assert.ok(attempted.length);
    rt.destroy();
    await api().append(attempted);
    const sheet = attempted.find(row => row.payload.key === 'sheet:小雪');
    assert.ok(sheet);
    const edited = structuredClone(sheet);
    edited.id += '-manual';
    await api().append([edited]);
    const rows = structuredClone(f.tables.rows);
    const intents = createStatsGenerationIntents(f.storage);
    assert.ok(intents.read('chat-1').intent);
    const cold = f.make({ statsTables: () => ({ ...api(), append: () => assert.fail('已完整落库不得补写') }),
        currencyEditStorage: f.storage, getBackgroundRequest: () => () => assert.fail('恢复不得重发模型'),
        sheetStore: { get: () => null, put: () => assert.fail('不得重放旧缓存副作用') } });
    t.after(() => cold.destroy());
    cold.sync();
    const recovered = await cold.noticeAction('generation-save', 'retry');
    assert.equal(recovered.ok, true);
    assert.deepEqual(recovered.effects, {});
    assert.equal(intents.read('chat-1').intent, null);
    assert.deepEqual(f.tables.rows, rows);
    assert.ok(cold.getCatalog().sheets.小雪);
    assert.equal(calls, 1);
    assert.equal(cold.notices().some(n => n.id === 'generation-save'), false);
});

test('坏数值日志在请求前拒绝：零模型请求、零写入，明确显示读取失败', async t => {
    let calls = 0;
    const f = await generationFixture(t, () => { calls += 1; return sheetReply; });
    const api = f.tables.api;
    let damaged = false;
    const rt = f.make({ statsTables: () => ({ ...api(), read: () => ({ ...api().read(),
        diagnostics: damaged ? [{ kind: 'stats', code: 'combat-row-json-invalid' }] : [] }) }),
        currencyEditStorage: f.storage, getBackgroundRequest: () => () => { calls += 1; return sheetReply; } });
    f.rt.destroy();
    t.after(() => rt.destroy());
    rt.sync();
    damaged = true;
    const rows = structuredClone(f.tables.rows);
    assert.deepEqual(await rt.generateSheets(['小雪']), { ok: false, reason: 'stats-log-damaged', stage: 'read' });
    assert.equal(calls, 0);
    assert.deepEqual(f.tables.rows, rows);
    const notice = rt.notices().find(n => n.id === 'generation-save');
    assert.match(notice.text, /日志读取失败/);
    assert.doesNotMatch(notice.text, /保留原结果|模型失败/);
    assert.deepEqual(notice.actions, [['dismiss', '知道了']]);
    assert.equal(createStatsGenerationIntents(f.storage).read('chat-1').intent, null);
    damaged = false;
    assert.equal((await rt.generateSheets(['小雪'])).ok, true);
    assert.equal(calls, 1);
    assert.equal(rt.notices().some(n => n.id === 'generation-save'), false);
});

test('数值模型路由变化拒收迟到回包，恢复原配置也不复活旧任务', async t => {
    for (const mode of ['config', 'model', 'secret', 'preset', 'transport']) {
        for (const outcome of ['success', 'failure']) await t.test(`${mode}-${outcome}`, async t => {
            const handlers = new Map();
            const eventSource = {
                on(name, fn) { handlers.set(name, fn); },
                removeListener(name, fn) { if (handlers.get(name) === fn) handlers.delete(name); },
            };
            const config = { llm: { source: 'tavern', model: 'fixture', apiKey: 'fixture-secret' } };
            const ctx = { eventSource, eventTypes: { SECRET_ROTATED: 'secret', OAI_PRESET_CHANGED_AFTER: 'preset' },
                mainApi: 'openai', chatCompletionSettings: { custom_model: 'first' },
                getChatCompletionModel() { return this.chatCompletionSettings.custom_model; },
                ChatCompletionService: { sendRequest() {} } };
            const route = createModelRouteIdentity({ getContext: () => ctx, readConfig: () => config });
            t.after(() => route.dispose());
            assert.equal(route.get(), route.get());
            const reply = deferredGeneration();
            let calls = 0;
            const f = await generationFixture(t, () => { calls += 1; return reply.promise; }, { generationRoute: route.get });
            const first = f.rt.generateSheets(['小雪']);
            await settleGeneration();
            assert.equal(calls, 1);
            const rows = structuredClone(f.tables.rows);
            const before = route.get();
            if (mode === 'config') config.llm.apiKey = 'fixture-secret-2';
            else if (mode === 'model') ctx.chatCompletionSettings.custom_model = 'second';
            else if (mode === 'transport') ctx.ChatCompletionService.sendRequest = () => {};
            else handlers.get(mode)();
            assert.notEqual(route.get(), before);
            const notices = JSON.stringify(f.rt.notices());
            if (outcome === 'success') reply.resolve(sheetReply);
            else reply.reject(Error('fixture-late-failure'));
            assert.equal((await first).reason, 'request-stale');
            config.llm.apiKey = 'fixture-secret';
            ctx.chatCompletionSettings.custom_model = 'first';
            assert.deepEqual(f.tables.rows, rows);
            assert.equal(f.cached.length, 0);
            assert.equal(f.changes.length, 0);
            assert.equal(JSON.stringify(f.rt.notices()), notices);
            assert.equal(calls, 1);
            route.dispose();
            assert.equal(handlers.size, 0);
            assert.equal(route.get(), null);
        });
    }
});

test('回归：主角擅长项优先于 NPC 策略提示，确认后接力弹出 NPC 策略且点自动生成能正常发出模型请求', async t => {
    const { pickStatsNotice } = await import('../src/visual/igs-ui/stats-chip.js');
    let calls = 0;
    const reply = deferredGeneration();
    // 模拟真实酒馆：使用独立 openai 备用模型时，每次 getContext() 返回新绑定的 generateRaw 引用
    const route = createModelRouteIdentity({
        getContext: () => ({ generateRaw: () => {}, generateQuietPrompt: () => {} }),
        readConfig: () => ({ llm: { source: 'openai', url: 'https://api.example.com/v1', model: 'm1', apiKey: 'k1' } }),
    });
    t.after(() => route.dispose());
    assert.equal(route.get(), route.get(), '独立 API 路由不应受酒馆 generateRaw 动态绑定引用影响');

    const f = await generationFixture(t, (prompt) => {
        if (String(prompt?.user || '').includes('小雪') && String(prompt?.system || '').includes('角色')) {
            calls += 1;
            return reply.promise;
        }
        return Promise.resolve('{}');
    }, {
        generationRoute: route.get,
    });
    f.set({ enabled: true, sheetGen: 'auto', backfill: 'off', push: { enabled: false }, ruleset: 'dnd5e' });
    f.rt.sync();
    // 注册一个未建档 NPC，并模拟读上下文期间 chatMetadata 引用被刷新
    generate(f.host, '小雪走了过来。[igs-stat:favor|小雪|开心]');
    await f.rt.whenSaved();
    assert.ok(f.rt.getState().characters.小雪, '小雪应已登记为未建档 NPC');

    // 主角擅长项提示应排在 NPC 策略提示前面
    const firstShown = pickStatsNotice(f.rt.notices());
    assert.equal(firstShown?.id, 'hero-pick');

    // 在设置中确认主角擅长项后，应立刻切换展示 NPC 建档策略提示
    const picked = f.rt.heroOp('pick', '', {
        skills: { 察言观色: 65, 交涉: 65, 潜行: 65, 侦查: 50, 急救: 50, 博物: 50, 攀爬: 50, 驾驶: 50 },
    });
    assert.equal(picked.ok, true);
    const secondShown = pickStatsNotice(f.rt.notices());
    assert.equal(secondShown?.id, 'npc-policy');

    // 点击「自动生成」后，哪怕 chatMetadata 引用变化，仍必须真正发出 API 请求并落库，不卡在 busy
    calls = 0;
    f.host.ctx.chatMetadata = { ...f.host.ctx.chatMetadata };
    const chosen = await f.rt.noticeAction('npc-policy', 'auto');
    assert.equal(chosen.ok, true);
    await settleGeneration();
    assert.equal(calls, 1, '点击 NPC 自动生成后必须实际发出模型请求');
    reply.resolve(sheetReply);
    await settleGeneration();
    await f.rt.whenSaved();
    assert.ok(f.rt.getCatalog().sheets.小雪, 'NPC 角色卡应已保存');
    assert.notEqual(f.rt.notices().find(n => n.id === 'sheets')?.kind, 'busy');
});

test('回归：generateSheets 遇冲突退出时必须清理 busy 状态为可重试提示', async t => {
    const reply = deferredGeneration();
    const f = await generationFixture(t, () => reply.promise);
    const run = f.rt.generateSheets(['小雪']);
    await settleGeneration();
    assert.equal(f.rt.notices().find(n => n.id === 'sheets')?.kind, 'busy');
    assert.equal(f.rt.sheetOp('edit', '小雪', { skill: '潜行', tier: '熟练' }).ok, true);
    await f.rt.whenSaved();
    reply.resolve(sheetReply);
    const res = await run;
    assert.equal(res.reason, 'stats-generation-conflict');
    const notice = f.rt.notices().find(n => n.id === 'sheets');
    assert.equal(notice?.kind, 'sheets', '冲突退出后不得永久卡在 busy');
    assert.match(notice?.text || '', /stats-generation-conflict/, '未完成提示应带具体原因码');
    assert.ok(notice?.actions?.some(([act]) => act === 'generate'));
});

test('回归：NPC 建档期间无关 catalog 改动（如 romanceSeen/主角技能）不误报冲突，静默后台任务慢请求不顶掉主角擅长项', async t => {
    const { pickStatsNotice } = await import('../src/visual/igs-ui/stats-chip.js');
    const sheetDeferred = deferredGeneration();
    const traitDeferred = deferredGeneration();
    let sheetCalls = 0;
    const f = await generationFixture(t, (prompt) => {
        if (String(prompt?.system || '').includes('角色设定评定助手')) return traitDeferred.promise;
        sheetCalls += 1;
        return sheetDeferred.promise;
    });
    f.set({ enabled: true, sheetGen: 'auto', backfill: 'off', push: { enabled: false }, ruleset: 'dnd5e' });
    f.rt.sync();
    t.mock.timers.enable({ apis: ['setTimeout'] });

    // 1. 后台 initial-traits 超过 60 秒触发 onSlow，不得用 busy 顶掉主角擅长项 hero-pick
    f.rt.relationOp('fill-traits');
    await settleGeneration();
    t.mock.timers.tick(60001);
    assert.equal(pickStatsNotice(f.rt.notices())?.id, 'hero-pick', '后台特质评定慢请求不得顶掉主角擅长项选择');

    // 2. NPC 建档期间发生无关的 romanceSeen 改动，不误报 stats-generation-conflict，能正常发出请求并保存
    const run = f.rt.generateSheets(['小雪']);
    await settleGeneration();
    assert.equal(sheetCalls, 1);
    f.rt.noteRomanceSeen(['小雪']);
    await f.rt.whenSaved();
    sheetDeferred.resolve(sheetReply);
    const result = await run;
    assert.equal(result.ok, true, `无关字段改动不应阻断 NPC 建档：${JSON.stringify(result)}`);
    assert.ok(f.rt.getCatalog().sheets.小雪);
    traitDeferred.resolve('{}');
    await settleGeneration();
});

test('回归：D&D5e 下未学技能/六维记录不误判为已选擅长，且支持按人设生成主角擅长并在人际关系 lookup 返回擅长与六维', async t => {
    const f = await generationFixture(t, (prompt) => {
        if (String(prompt?.user || '').includes('可分配技能')) {
            return Promise.resolve(JSON.stringify({ 察言观色: '精通', 话术: '熟练', 学习: '熟练', 电脑: '入门' }));
        }
        return Promise.resolve(sheetReply);
    });
    f.set({ enabled: true, sheetGen: 'auto', backfill: 'off', push: { enabled: false }, ruleset: 'dnd5e' });
    f.rt.sync();

    // 模拟开局出现未学内置技能（<25）与六维键写入 protagonist.skills：不应导致 needsPick 误判为 false
    const ledger = f.rt.getLedger();
    const cur = ledger.initial;
    cur.protagonist.skills.察言观色 = { value: 15, marked: true };
    cur.protagonist.skills.力量 = { value: 60, marked: false };
    f.rt.sync();
    assert.equal(f.rt.archive().needsPick, true, '未学技能(<25)与六维不得阻断主角擅长项选择');
    const heroPick = f.rt.notices().find((n) => n.id === 'hero-pick');
    assert.ok(heroPick, '应显示 hero-pick 提示');
    assert.ok(heroPick.actions.some(([act]) => act === 'assign'), '有辅助模型时 hero-pick 应提供按人设生成按钮');

    // 在 D&D5e 下直接点击按人设生成主角擅长技能
    const assignRes = await f.rt.noticeAction('hero-pick', 'assign');
    assert.equal(assignRes.ok, true, `D&D5e 应支持按人设生成主角擅长：${JSON.stringify(assignRes)}`);
    assert.equal(f.rt.archive().needsPick, false);
    assert.ok(f.rt.archive().skills.some((s) => s.name === '察言观色'));

    // protagonistLookup 应向人际关系页提供主角擅长与六维，metricsLookup 应向人际关系页提供 NPC 六维
    const heroLookup = f.rt.protagonistLookup();
    const heroCard = heroLookup('陈默') || heroLookup('主角');
    assert.ok(heroCard?.sheet?.hero, '主角 lookup 应包含 hero sheet');
    assert.ok(heroCard.sheet.strong.some((s) => s.startsWith('察言观色')), '主角 lookup 应包含已生成的擅长技能');
    assert.equal(heroCard.attributes?.length, 6, '主角 lookup 应包含六维属性');

    const genNpc = await f.rt.generateSheets(['小雪']);
    assert.equal(genNpc.ok, true);
    const npcCard = f.rt.metricsLookup()('小雪');
    assert.equal(npcCard.attributes?.length, 6, 'NPC lookup 应包含六维属性');
});

test('并发建档：主角与 NPC 询问框并发堆叠显示，并发触发生成且落库写入互相不锁不冲突', async t => {
    const { JSDOM } = await import('jsdom');
    const { createStatsChip, pickStatsNotices } = await import('../src/visual/igs-ui/stats-chip.js');
    const heroSkillDeferred = deferredGeneration();
    const npcSheetDeferred = deferredGeneration();
    let heroSkillCalls = 0;
    let npcSheetCalls = 0;
    const f = await generationFixture(t, (prompt) => {
        if (String(prompt?.user || '').includes('可分配技能')) {
            heroSkillCalls += 1;
            return heroSkillDeferred.promise;
        }
        if (String(prompt?.system || '').includes('NPC 角色评定初始数值')) {
            npcSheetCalls += 1;
            return npcSheetDeferred.promise;
        }
        return Promise.resolve('{}');
    });
    f.set({ enabled: true, sheetGen: 'auto', backfill: 'off', push: { enabled: false }, ruleset: 'dnd5e' });
    f.rt.sync();
    generate(f.host, '小雪迎面走来。[igs-stat:favor|小雪|开心]');
    await f.rt.whenSaved();

    // 1. 主角擅长项与 NPC 策略提示框同时存在并并发渲染成多条堆叠 pill
    const visible = pickStatsNotices(f.rt.notices());
    assert.ok(visible.some(n => n.id === 'hero-pick'), '主角擅长提示应同时显示');
    assert.ok(visible.some(n => n.id === 'npc-policy'), 'NPC 策略提示应同时显示');

    const dom = new JSDOM('<div id="dialog"></div>');
    const actions = [];
    const chip = createStatsChip({
        getDialog: () => dom.window.document.querySelector('#dialog'),
        getNotices: () => f.rt.notices(),
        onAction: (id, act) => { actions.push([id, act]); },
    });
    chip.sync();
    const rows = [...dom.window.document.querySelectorAll('#igs-stats-chip .igs-stats-chip-item')];
    assert.ok(rows.length >= 2, 'DOM 应同时渲染主角与 NPC 两条提示');
    const npcAutoBtn = dom.window.document.querySelector('.igs-stats-chip-item[data-id="npc-policy"] [data-stats-act="auto"]');
    const heroAssignBtn = dom.window.document.querySelector('.igs-stats-chip-item[data-id="hero-pick"] [data-stats-act="assign"]');
    assert.ok(npcAutoBtn && heroAssignBtn);
    heroAssignBtn.click();
    npcAutoBtn.click();
    assert.deepEqual(actions, [['hero-pick', 'assign'], ['npc-policy', 'auto']]);
    dom.window.close();

    // 2. 同时触发主角擅长生成与 NPC 自动建档：两路模型请求并发发出，不互锁
    const heroRun = f.rt.noticeAction('hero-pick', 'assign');
    const npcPolicyRun = await f.rt.noticeAction('npc-policy', 'auto');
    assert.equal(npcPolicyRun.ok, true);
    await settleGeneration();
    assert.equal(heroSkillCalls, 1, '主角擅长生成应已发出请求');
    assert.equal(npcSheetCalls, 1, 'NPC 建档应已并发发出请求');

    // 3. 同一时间返回两路结果：落库写入顺序无冲突完成，两者数据都完整保留
    heroSkillDeferred.resolve(JSON.stringify({ 察言观色: '精通', 话术: '熟练', 学习: '熟练' }));
    npcSheetDeferred.resolve(sheetReply);
    const heroRes = await heroRun;
    await settleGeneration();
    await f.rt.whenSaved();
    assert.equal(heroRes.ok, true, `主角擅长并发提交应成功：${JSON.stringify(heroRes)}`);
    assert.ok(f.rt.archive().skills.some(s => s.name === '察言观色'), '主角擅长技能应已落库');
    assert.ok(f.rt.getCatalog().sheets.小雪, 'NPC 角色卡应已并发落库且不被覆盖');
});

test('新聊天第0层并发：重要角色表人物在选自动生成时立即触发建档，不与主角擅长生成/版本递增冲突', async t => {
    const heroSkillDeferred = deferredGeneration();
    const npcSheetDeferred = deferredGeneration();
    let heroSkillCalls = 0;
    let npcSheetCalls = 0;
    const f = await generationFixture(t, (prompt) => {
        if (String(prompt?.user || '').includes('可分配技能：')) {
            heroSkillCalls += 1;
            return heroSkillDeferred.promise;
        }
        if (String(prompt?.system || '').includes('NPC 角色评定初始数值')) {
            npcSheetCalls += 1;
            return npcSheetDeferred.promise;
        }
        return Promise.resolve('{}');
    });
    // 重建运行时并注入重要角色表名单，且不先触发 AI 楼层结算（模拟新聊天第0层）
    f.rt.destroy();
    const rt = f.make({
        tablePeople: () => ['苏曼珠', '秦若仪'],
        getBackgroundRequest: () => (prompt) => {
            if (String(prompt?.user || '').includes('可分配技能：')) {
                heroSkillCalls += 1;
                return heroSkillDeferred.promise;
            }
            if (String(prompt?.system || '').includes('NPC 角色评定初始数值')) {
                npcSheetCalls += 1;
                return npcSheetDeferred.promise;
            }
            return Promise.resolve('{}');
        },
        describePeople: async (names) => names.map((name) => ({ name, summary: `${name}人设` })),
    });
    t.after(() => rt.destroy());
    f.set({ enabled: true, sheetGen: 'auto', backfill: 'off', push: { enabled: false }, ruleset: 'coc7' });
    rt.sync();
    await rt.whenSaved();

    // 模拟外部表版本变化（例如 heroInit 写属性表/物品表），再并发点击主角按人设生成 + NPC 自动生成
    const heroRun = rt.noticeAction('hero-pick', 'assign');
    f.tables.version += 1;
    const npcRun = await rt.noticeAction('npc-policy', 'auto');
    assert.equal(npcRun.ok, true);
    await settleGeneration();

    assert.equal(heroSkillCalls, 1, '主角擅长技能应立即发起 API 请求');
    assert.equal(npcSheetCalls, 1, '第0层重要角色表 NPC 在选自动生成后应立即发起 API 请求');
    assert.ok(rt.notices().some(n => n.id === 'hero-skills' && n.kind === 'busy'), 'setNpcPolicy 的 ensureLoaded 不得清掉进行中的 hero-skills 忙提示');
    assert.ok(rt.notices().some(n => n.id === 'sheets' && n.kind === 'busy'), 'sheets 忙提示应并发存在');

    heroSkillDeferred.resolve(JSON.stringify({ 察言观色: '精通', 话术: '熟练', 学习: '熟练' }));
    npcSheetDeferred.resolve(JSON.stringify({
        苏曼珠: { 资历: '老手', 属性: { 魅力: '出众' }, 擅长: ['察言观色', '交涉', '魅惑'], 比较擅长: ['侦查', '隐匿', '急救', '说服', '威吓'] },
        秦若仪: { 资历: '普通人', 属性: { 感知: '出众' }, 擅长: ['侦查', '急救', '说服'], 比较擅长: ['察言观色', '隐匿', '驾驶', '攀爬', '交涉'] },
    }));
    const heroRes = await heroRun;
    await settleGeneration();
    await rt.whenSaved();
    assert.equal(heroRes.ok, true);
    assert.equal(rt.getNpcPolicy(), 'auto', '并发提交后 npcPolicy 不得被 adopt(merged) 回滚');
    assert.ok(rt.getCatalog().sheets.苏曼珠 && rt.getCatalog().sheets.秦若仪, '第0层重要角色表人物均应建档成功');
    assert.ok(rt.archive().skills.some(s => s.name === '察言观色'), '主角擅长技能应保存成功');
});


