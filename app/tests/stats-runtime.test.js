import test from 'node:test';
import assert from 'node:assert/strict';
import { STATS_PROMPT_KEY, createStatsRuntime } from '../src/core/stats-runtime.js';
import { STATS_METADATA_KEY, serializeLedger } from '../src/scene/stats/stat-persist.js';
import { createStatsLedger, ledgerKey } from '../src/scene/stats/stat-ledger.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';
import { fakeStatsTables } from './helpers/fake-stats-db.js';

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

function setup(enabled = true) {
    const host = fakeHost();
    const settings = { enabled };
    const db = fakeStatsTables();
    const rt = createStatsRuntime({ getContext: () => host.ctx, readSettings: () => settings, statsTables: db.statsTables });
    rt.sync();
    return { host, rt, settings, db };
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
    const { host, rt, settings } = setup(false);
    assert.equal(host.eventSource.count(), 0);
    settings.enabled = true;
    rt.sync();
    assert.ok(host.eventSource.count() > 0);
    settings.enabled = false;
    rt.sync();
    assert.equal(host.eventSource.count(), 0);
});

test('本聊天未启用时不注入、不结算（易错点 H2）', () => {
    const { host, rt } = setup();
    const { injected } = generate(host, '[igs-stat:favor|小雪|开心]');
    assert.equal(injected, '');
    assert.equal(rt.getState(), null);
    assert.equal(host.ctx.chatMetadata[STATS_METADATA_KEY], undefined);
});

test('正常发送：生成前注入、结束后清除并结算一次，写进数值日志表、不再写聊天元数据（易错点 A3/A6/B2）', async () => {
    const { host, rt, db } = setup();
    rt.enableForChat();
    const { injected } = generate(host, '她笑了。[igs-stat:favor|小雪|开心]');
    assert.match(injected, /主角状态/);
    assert.equal(host.ctx.extensionPrompts[STATS_PROMPT_KEY], undefined);
    assert.ok(favor(rt) >= 1);
    await rt.whenSaved();
    const types = db.raw.read().stats.map((r) => r.type);
    assert.ok(types.includes('init') && types.includes('floor') && types.includes('chat'));
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
    assert.equal(favor(rt), -6);
    host.ctx.chat[id] = { is_user: false, mes: '[igs-stat:favor|小雪|失望]', swipe_id: 1 };
    host.eventSource.emit('sw', id);
    host.eventSource.emit('gs', 'swipe', {}, false);
    host.eventSource.emit('ge', id);
    assert.equal(favor(rt), -2);
    host.ctx.chat[id] = { is_user: false, mes: '[igs-stat:favor|小雪|受伤]', swipe_id: 0 };
    host.eventSource.emit('sw', id);
    assert.equal(favor(rt), -6);
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
    assert.equal(favor(rt), -6);
});

test('换聊天后从数值日志表读回；旧存档版本更新时拒绝导入、不覆盖', async () => {
    const { host, rt } = setup();
    rt.enableForChat();
    generate(host, '[igs-stat:favor|小雪|受伤]');
    await rt.whenSaved();
    host.eventSource.emit('chat');
    assert.equal(rt.isChatEnabled(), true);
    assert.equal(favor(rt), -6);
    const fresh = setup();
    fresh.host.ctx.chatMetadata[STATS_METADATA_KEY] = { version: 99 };
    fresh.host.eventSource.emit('chat');
    assert.equal(fresh.rt.enableForChat().reason, 'stats-save-newer');
    assert.deepEqual(fresh.host.ctx.chatMetadata[STATS_METADATA_KEY], { version: 99 });
    assert.ok(fresh.rt.getDiagnostics().some((d) => d.code === 'stats-save-newer'));
    assert.deepEqual(fresh.db.raw.read().stats, []);
});

test('本聊天关闭后数值冻结，生成不结算', () => {
    const { host, rt } = setup();
    rt.enableForChat();
    generate(host, '[igs-stat:favor|小雪|受伤]');
    rt.disableForChat();
    generate(host, '[igs-stat:favor|小雪|受伤]');
    assert.equal(favor(rt), -6);
});

test('人物数值数据源：本聊天启用时接管已登记角色，未启用或关闭时返回 null（易错点 H3）', () => {
    const { host, rt } = setup();
    assert.equal(rt.metricsLookup(), null);
    rt.enableForChat();
    generate(host, '[igs-stat:favor|小雪|受伤]');
    const lookup = rt.metricsLookup();
    assert.equal(lookup('小雪').stages[0].value, '淡淡不喜');
    assert.deepEqual(lookup('路人'), { metrics: [], stages: [] });
    rt.disableForChat();
    assert.equal(rt.metricsLookup(), null);
});

test('总开关关闭时在设置页启用本聊天：先读存档，不用空账本覆盖', async () => {
    const { host, rt, settings, db } = setup();
    rt.enableForChat();
    generate(host, '[igs-stat:favor|小雪|受伤]');
    await rt.whenSaved();
    settings.enabled = false;
    rt.sync();
    const cold = createStatsRuntime({ getContext: () => host.ctx, readSettings: () => ({ enabled: false }), statsTables: db.statsTables });
    cold.sync();
    assert.equal(host.eventSource.count(), 0);
    assert.deepEqual(cold.chatStatus(), { enabled: true, blocked: '', hasChat: true });
    assert.equal(cold.enableForChat().ok, true);
    assert.equal(cold.getState().characters.小雪.dims.好感, -6);
    assert.equal(cold.disableForChat().ok, true);
    assert.equal(cold.chatStatus().enabled, false);
    assert.equal(cold.getState().characters.小雪.dims.好感, -6);
});

test('先掷后写：命中技能时生成前掷骰并注入检定段，结算记录检定；继续生成沿用；关闭自动判断不掷（§4.1）', () => {
    const { host, rt, settings } = setup();
    rt.enableForChat();
    host.ctx.chat.push({ is_user: true, mes: '我给她做一顿寿司' });
    const { id, injected } = generate(host, '她尝了一口。');
    assert.match(injected, /【本轮检定】烹饪：(?:d20\(\d+\)|优势 \d+\/\d+→\d+|劣势 \d+\/\d+→\d+)[+-]\d+=-?\d+，DC\d+，结果【[^】]+】/);
    const checkOf = () => rt.getLedger().entries.get(ledgerKey(rt.getLedger(), id, 0)).meta.check;
    const check = checkOf();
    assert.equal(check.skill, '烹饪');
    assert.equal(Boolean(rt.getState().protagonist.skills.烹饪.marked), check.success);
    const cont = generate(host, '她又笑了。', 'continue');
    assert.ok(cont.injected.includes(`${check.detail}，结果【${check.outcome}】`));
    assert.deepEqual(checkOf(), check);
    host.ctx.chat[id].mes += '（改）';
    host.eventSource.emit('upd', id);
    assert.deepEqual(checkOf(), check);
    settings.autoSkill = false;
    host.ctx.chat.push({ is_user: true, mes: '我去晨跑' });
    assert.doesNotMatch(generate(host, '跑完了。').injected, /本轮检定/);
    host.ctx.chat.push({ is_user: true, mes: '我们聊天' });
    settings.autoSkill = true;
    assert.doesNotMatch(generate(host, '聊了很久。').injected, /本轮检定/);
});

test('学习表随聊天走：旧存档的学习表导入日志表，本地匹配使用学习词；坏条目丢弃并记诊断（§4.1A）', async () => {
    const { host, rt, db } = setup();
    host.ctx.chatMetadata[STATS_METADATA_KEY] = { ...serializeLedger(createStatsLedger('chat-1', createStatsState()), { chatEnabled: true }), learned: { 熬魔药: '烹饪', 熬3锅: '烹饪', 乱写: 42 } };
    host.eventSource.emit('chat');
    await rt.whenSaved();
    assert.equal(rt.isChatEnabled(), true);
    assert.ok(rt.getDiagnostics().some((d) => d.code === 'stats-learned-dropped' && d.count === 2));
    assert.ok(db.raw.read().stats.some((r) => r.type === 'learned' && r.payload.key === 'learned:熬魔药'));
    host.ctx.chat.push({ is_user: true, mes: '我熬魔药' });
    assert.match(generate(host, '锅里冒泡。').injected, /【本轮检定】烹饪：/);
});


test('卡牌战斗开启时（合并计划 P6）：数值视为开启、新聊天直接启用不询问、本聊天不能单独关闭、速算不结算并记诊断', async () => {
    const host = fakeHost();
    const settings = { enabled: false, newChat: 'ask' };
    const db = fakeStatsTables();
    let combat = true;
    const rt = createStatsRuntime({ getContext: () => host.ctx, readSettings: () => settings, statsTables: db.statsTables, combatEnabled: () => combat });
    rt.sync();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await rt.whenSaved();
    assert.equal(rt.isChatEnabled(), true);
    assert.ok(!rt.notices().some((n) => n.id === 'onboarding'));
    assert.equal(rt.disableForChat().reason, 'stats-combat-locked');
    assert.equal(rt.isChatEnabled(), true);
    const { id } = generate(host, '打了一架。[igs-stat:battle|杂兵]');
    const entry = rt.getLedger().entries.get(ledgerKey(rt.getLedger(), id, 0));
    assert.equal(entry.meta.flags.battle, undefined);
    assert.ok(entry.meta.diagnostics.some((d) => d.code === 'stats-battle-skipped-combat'));
    // 关闭战斗不关闭数值系统；此后本聊天可以单独暂停。
    combat = false;
    settings.enabled = true;
    assert.equal(rt.disableForChat().ok, true);
});
