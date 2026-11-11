import test from 'node:test';
import assert from 'node:assert/strict';
import { STATS_PROMPT_KEY, createStatsRuntime } from '../src/core/stats-runtime.js';
import { STATS_BACKUP_KEY, STATS_METADATA_KEY, deserializeLedger, serializeLedger, emptyCatalog } from '../src/scene/stats/stat-persist.js';
import { ledgerKey, createStatsLedger } from '../src/scene/stats/stat-ledger.js';
import { settleFloorText, constrainFavor } from '../src/scene/stats/stat-settle.js';
import { parseStatDirectives, stripStatDirectives } from '../src/scene/stats/stat-directives.js';
import { createEngine } from '../src/scene/stats/stat-engine.js';
import { parseSheetReply, sheetFromTiers, parseBackfillReply, applyBackfillToSheet } from '../src/scene/stats/stat-sheets.js';
import { createSkillRegistry, registerStorySkill, STORY_SKILL_MAX } from '../src/scene/stats/stat-registry.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { stripMarkerDirectives } from '../src/scene/directive-tags.js';

const T = { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', CHAT_CHANGED: 'chat' };

function host() {
    const handlers = new Map();
    const eventSource = {
        on(n, f) { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
        removeListener(n, f) { handlers.get(n)?.delete(f); },
        emit(n, ...a) { let out; for (const f of [...(handlers.get(n) || [])]) out = f(...a); return out; },
    };
    const ctx = {
        name1: '阿明', name2: '小雪', chat: [{ is_user: true, mes: '你好' }], chatMetadata: {}, extensionPrompts: {},
        eventSource, eventTypes: T, getCurrentChatId: () => 'chat-1',
        setExtensionPrompt(key, value) { this.extensionPrompts[key] = { value }; }, saveMetadata() {},
    };
    return { ctx, eventSource };
}

// 内存版数值日志表（和宿主 statsTables 同形）。
function fakeTables() {
    const t = { rows: [], version: 0 };
    t.api = () => ({
        ok: true,
        get version() { return t.version; },
        read() { return { ok: true, stats: t.rows.slice() }; },
        append(records) { t.rows.push(...records); t.version += 1; return Promise.resolve({ ok: true }); },
        ensure() { return Promise.resolve({ ok: true }); },
    });
    return t;
}

function setup(extra = {}, opts = {}) {
    const h = host();
    // 设置按引用缓存规范化结果：改设置要换新对象，不能原地改。
    const holder = { cur: { enabled: true, ruleset: 'coc7', ...extra } };
    const set = (patch) => { holder.cur = { ...holder.cur, ...patch }; };
    const tables = fakeTables();
    const checks = [];
    const notices = [];
    const rt = createStatsRuntime({ getContext: () => h.ctx, readSettings: () => holder.cur, statsTables: tables.api, onCheck: (c) => checks.push(c), onNotices: (n) => notices.push(n), ...opts });
    rt.sync();
    return { h, rt, set, tables, checks, notices };
}

function generate(h, text, type = 'normal') {
    h.eventSource.emit('gs', type, {}, false);
    const injected = h.ctx.extensionPrompts[STATS_PROMPT_KEY]?.value || '';
    if (type === 'continue') h.ctx.chat[h.ctx.chat.length - 1].mes += text;
    else h.ctx.chat.push({ is_user: false, mes: text, swipe_id: 0 });
    const id = h.ctx.chat.length - 1;
    h.eventSource.emit('ge', id);
    return { id, injected };
}

test('后台请求触发的生成事件不注入、不结算（N2）', () => {
    let bg = false;
    const { h, rt } = setup({}, { isBackground: () => bg });
    rt.enableForChat();
    bg = true;
    h.eventSource.emit('gs', 'normal', {}, false);
    assert.equal(h.ctx.extensionPrompts[STATS_PROMPT_KEY], undefined);
    h.ctx.chat.push({ is_user: false, mes: '{"小雪":{}}', swipe_id: 0 });
    h.eventSource.emit('ge', h.ctx.chat.length - 1);
    assert.equal(rt.getLedger().entries.size, 0);
});

test('数值系统未启用时选项骰子返回 null，交回 AcuDice', () => {
    const { rt } = setup();
    assert.equal(rt.resolveDice('检定 <user> 侦查'), null);
});

test('旧存档（igs_stats）首次加载时导入数据库表：校验通过后读回，旧快照不改、不再写备份（§5）', async () => {
    const { h, rt, tables } = setup();
    const ledger = createStatsLedger('chat-1', createStatsState());
    const v1 = { ...serializeLedger(ledger, { chatEnabled: true }), version: 1 };
    delete v1.catalog;
    h.ctx.chatMetadata[STATS_METADATA_KEY] = v1;
    h.eventSource.emit('chat');
    await rt.whenSaved();
    assert.equal(rt.isChatEnabled(), true);
    assert.ok(tables.rows.some((r) => r.type === 'init'));
    h.ctx.chat.push({ is_user: true, mes: '你好' });
    generate(h, '[igs-stat:favor|小雪|开心]');
    await rt.whenSaved();
    assert.equal(h.ctx.chatMetadata[STATS_BACKUP_KEY], undefined);
    assert.equal(h.ctx.chatMetadata[STATS_METADATA_KEY].version, 1);
    assert.ok(tables.rows.some((r) => r.type === 'floor'));
    assert.deepEqual(rt.getCatalog().sheets, {});
});

test('角色卡解析：整份坏 JSON 不写；数字档位整格丢弃；同名同聊天取值稳定（N3、N4）', () => {
    const registry = createSkillRegistry({});
    assert.equal(parseSheetReply('不是 JSON', { names: ['甲'], registry }).ok, false);
    const r = parseSheetReply('{"甲":{"属性":{"敏捷":"80"},"技能":{"潜行":"熟练"}}}', { names: ['甲'], registry });
    assert.equal(r.ok, true);
    assert.deepEqual(r.sheets.甲.attributes, {});
    const a = sheetFromTiers('甲', r.sheets.甲, { chatSeed: 'c' });
    const b = sheetFromTiers('甲', r.sheets.甲, { chatSeed: 'c' });
    assert.deepEqual(a, b);
});

