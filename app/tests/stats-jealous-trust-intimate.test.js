import test from 'node:test';
import assert from 'node:assert/strict';
import { jealousySignals } from '../src/scene/stats/stat-fx.js';
import { JEALOUS_FAVOR_MIN, JEALOUS_GRUDGE_MIN } from '../src/scene/stats/stat-favor.js';
import { settleFloorText } from '../src/scene/stats/stat-settle.js';
import { parseStatDirectives } from '../src/scene/stats/stat-directives.js';
import { buildStatsPrompt } from '../src/scene/stats/stat-prompt.js';
import { chatEntries, restoreChat } from '../src/scene/stats/stat-log.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { createStatsRuntime } from '../src/core/stats-runtime.js';

const high = () => 0.99;
const low = () => 0.1;
const resolveCharacter = (name) => (['小雪', '阿澄'].includes(name) ? name : null);
const floor = (state, text, opts = {}) => settleFloorText(state, text, { random: high, resolveCharacter, ...opts });
const withDims = (dims, extra = {}) => ({ ...createStatsState(), characters: { 小雪: { ...createCharacter(1), dims: { ...createCharacter(1).dims, ...dims }, ...extra } } });
const dimOf = (state, dim, name = '小雪') => state.characters[name].dims[dim];
const JEALOUS = '[igs-stat:favor|小雪|吃醋]';

// ---------- 第八节：吃醋分两路 ----------
test('吃醋常量：好感门槛 50，芥蒂门槛 26 与记恨档一致', () => {
    assert.equal(JEALOUS_FAVOR_MIN, 50);
    assert.equal(JEALOUS_GRUDGE_MIN, 26);
});

test('吃醋低芥蒂且好感 ≥ 50：d100 不过时好感不变，芥蒂 +2', () => {
    for (const t of ['vivid', 'normal', 'hard']) {
        // random=0.99 → d100=100 > 好感，rollOver 通过；这里门槛是「点数 ≤ 好感」，所以 100 不过。
        const r = floor(withDims({ 好感: 60 }), JEALOUS, { favorTier: t });
        assert.equal(dimOf(r.state, '好感'), 60, t);
        assert.equal(dimOf(r.state, '芥蒂'), 2, t);
        assert.ok(r.changes.some((c) => c.key === '芥蒂' && c.note === '吃醋'), t);
    }
});

test('吃醋低芥蒂且好感 ≥ 50：d100 过时好感按正向小加，芥蒂 +2，同日第二次不再加好感', () => {
    for (const t of ['normal', 'hard']) {
        const first = floor(withDims({ 好感: 60 }), JEALOUS, { favorTier: t, random: low });
        assert.ok(dimOf(first.state, '好感') > 60, t);
        assert.equal(dimOf(first.state, '芥蒂'), 2, t);
        assert.equal(first.state.characters.小雪.daily.jealousUp, true, t);
        const second = floor(first.state, JEALOUS, { favorTier: t, random: low });
        assert.equal(dimOf(second.state, '好感'), dimOf(first.state, '好感'), t);
        assert.equal(dimOf(second.state, '芥蒂'), 4, t);
    }
});

test('吃醋鲜明档：过关的好感进心意槽', () => {
    const r = floor(withDims({ 好感: 60 }), JEALOUS, { favorTier: 'vivid', random: low });
    assert.equal(dimOf(r.state, '好感'), 60);
    assert.ok(r.state.characters.小雪.heart > 0);
    assert.equal(r.state.characters.小雪.daily.jealousUp, true);
});

test('吃醋低芥蒂且好感 < 50：只加芥蒂 2，好感不动', () => {
    for (const t of ['vivid', 'normal', 'hard']) {
        const r = floor(withDims({ 好感: 40 }), JEALOUS, { favorTier: t, random: low });
        assert.equal(dimOf(r.state, '好感'), 40, t);
        assert.equal(dimOf(r.state, '芥蒂'), 2, t);
    }
});

test('吃醋芥蒂 ≥ 26：好感按负向中扣 8，不掷骰；芥蒂再加的 d100 两个分支', () => {
    for (const t of ['vivid', 'normal', 'hard']) {
        const miss = floor(withDims({ 好感: 40, 芥蒂: 30 }), JEALOUS, { favorTier: t, random: high });
        assert.equal(dimOf(miss.state, '好感'), 32, t);
        assert.equal(dimOf(miss.state, '芥蒂'), 30, t);
        const hit = floor(withDims({ 好感: 40, 芥蒂: 30 }), JEALOUS, { favorTier: t, random: low });
        assert.equal(dimOf(hit.state, '好感'), 32, t);
        assert.equal(dimOf(hit.state, '芥蒂'), 35, t);
    }
});

test('吃醋芥蒂按强度加，每日最多 +8', () => {
    let state = withDims({ 好感: 40, 芥蒂: 30 });
    state = floor(state, '[igs-stat:favor|小雪|吃醋|大]', { favorTier: 'normal', random: low }).state;
    assert.equal(dimOf(state, '芥蒂'), 38);
    state = floor(state, '[igs-stat:favor|小雪|吃醋|大]', { favorTier: 'normal', random: low }).state;
    assert.equal(dimOf(state, '芥蒂'), 38);
    assert.equal(state.characters.小雪.daily.gained.吃醋芥蒂, 8);
});

test('吃醋芥蒂单独记账：不占也不受普通芥蒂每日额度限制', () => {
    const full = withDims({ 好感: 40, 芥蒂: 30 }, { daily: { day: 1, gained: { 芥蒂: 8 } } });
    const r = floor(full, '[igs-stat:favor|小雪|吃醋|大]', { favorTier: 'normal', random: low });
    assert.equal(dimOf(r.state, '芥蒂'), 38);
    assert.equal(r.state.characters.小雪.daily.gained.芥蒂, 8);
    assert.equal(r.state.characters.小雪.daily.gained.吃醋芥蒂, 8);
    const after = floor(r.state, '[igs-stat:grudge|小雪|上升]', { favorTier: 'normal' });
    assert.equal(dimOf(after.state, '芥蒂'), 38);
    const fresh = floor(withDims({ 好感: 40, 芥蒂: 30 }), '[igs-stat:favor|小雪|吃醋|大][igs-stat:grudge|小雪|上升]', { favorTier: 'normal', random: low });
    assert.equal(fresh.state.characters.小雪.daily.gained.吃醋芥蒂, 8);
    assert.ok((fresh.state.characters.小雪.daily.gained.芥蒂 || 0) <= 2);
});

test('修罗场信号：好感未降（只加芥蒂）也触发；旧楼吃醋仍扣 3 并触发', () => {
    const fresh = floor(withDims({ 好感: 40 }), JEALOUS, { favorTier: 'normal', random: low });
    assert.equal(dimOf(fresh.state, '好感'), 40);
    assert.deepEqual(jealousySignals(fresh.changes), ['小雪']);
    const up = floor(withDims({ 好感: 60 }), JEALOUS, { favorTier: 'normal', random: low });
    assert.deepEqual(jealousySignals(up.changes), ['小雪']);
    const legacy = floor(withDims({ 好感: 40 }), JEALOUS);
    assert.equal(dimOf(legacy.state, '好感'), 37);
    assert.equal(dimOf(legacy.state, '芥蒂'), 0);
    assert.deepEqual(jealousySignals(legacy.changes), ['小雪']);
    const hard = floor(withDims({ 好感: 40 }), JEALOUS, { favorMode: 'hard' });
    assert.equal(dimOf(hard.state, '好感'), 37);
});

// ---------- 第九节：信任强度 ----------
test('信任强度解析：第四段可省，数字整条丢弃', () => {
    const ok = parseStatDirectives('[igs-stat:trust|小雪|上升|大][igs-stat:trust|小雪|下降][igs-stat:trust|小雪|上升|强烈]');
    assert.deepEqual(ok.directives.map((d) => d.strength), ['大', undefined, '大']);
    const bad = parseStatDirectives('[igs-stat:trust|小雪|上升|+5]');
    assert.equal(bad.directives.length, 0);
});

test('信任四档强度：上升 1/3/6/10（受单楼 6 限制），下降 3/8/15/30', () => {
    const up = (strength, state = withDims({ 信任: 0 })) => dimOf(floor(state, `[igs-stat:trust|小雪|上升|${strength}][igs-stat:event|小雪|约会]`, { favorTier: 'normal' }).state, '信任');
    assert.equal(up('小'), 1);
    assert.equal(up('中'), 3);
    assert.equal(up('大'), 6);
    assert.equal(up('重大'), 6);
    const down = (strength) => dimOf(floor(withDims({ 信任: 0 }), `[igs-stat:trust|小雪|下降|${strength}]`, { favorTier: 'vivid' }).state, '信任');
    assert.equal(down('小'), -3);
    assert.equal(down('中'), -8);
    assert.equal(down('大'), -15);
    assert.equal(down('重大'), -30);
    assert.equal(dimOf(floor(withDims({ 信任: 0 }), '[igs-stat:trust|小雪|上升]', { favorTier: 'hard' }).state, '信任'), 1);
});

test('信任每日上限 10；正向重大无 event 降为大', () => {
    let state = withDims({ 信任: 0 });
    const gains = [];
    for (let i = 0; i < 3; i += 1) {
        state = floor(state, '[igs-stat:trust|小雪|上升|大]', { favorTier: 'normal' }).state;
        gains.push(dimOf(state, '信任'));
    }
    assert.deepEqual(gains, [6, 10, 10]);
    const noEvent = floor(withDims({ 信任: 0 }), '[igs-stat:trust|小雪|上升|重大]', { favorTier: 'normal' });
    assert.equal(dimOf(noEvent.state, '信任'), 6);
    const withEvent = floor(withDims({ 信任: 0 }), '[igs-stat:trust|小雪|上升|重大][igs-stat:event|小雪|告白]', { favorTier: 'normal' });
    assert.equal(dimOf(withEvent.state, '信任'), 6);
    const noEventDown = floor(withDims({ 信任: 0 }), '[igs-stat:trust|小雪|下降|重大]', { favorTier: 'normal' });
    assert.equal(dimOf(noEventDown.state, '信任'), -30);
});

test('信任重大下降后 3 天内上升减半，第 4 天恢复；字段随快照', () => {
    const hurt = floor(withDims({ 信任: 50 }), '[igs-stat:trust|小雪|下降|重大]', { favorTier: 'normal' });
    assert.equal(hurt.state.characters.小雪.trustWound, 3);
    const same = floor(hurt.state, '[igs-stat:trust|小雪|上升|大]', { favorTier: 'normal' });
    assert.equal(dimOf(same.state, '信任') - 20, 3);
    let state = hurt.state;
    const gains = [];
    for (let day = 0; day < 4; day += 1) {
        state = floor(state, '过了一夜。[igs-stat:sleep]', { favorTier: 'normal' }).state;
        const before = dimOf(state, '信任');
        const next = floor(state, '[igs-stat:trust|小雪|上升|大]', { favorTier: 'normal' }).state;
        gains.push(dimOf(next, '信任') - before);
    }
    assert.deepEqual(gains, [3, 3, 6, 6]);
    assert.equal(state.characters.小雪.trustWound, 0);
    assert.equal(hurt.state.characters.小雪.trustWound, 3);
});

test('信任受伤标记不进旧角色：没有该字段的角色日结算后仍没有', () => {
    const next = floor(withDims({ 信任: 10 }), '睡去。[igs-stat:sleep]', { favorTier: 'normal' }).state;
    assert.equal(Object.hasOwn(next.characters.小雪, 'trustWound'), false);
});

test('信任旧楼重算仍是 +1 / −4，且不写 trustWound', () => {
    const up = floor(withDims({ 信任: 0 }), '[igs-stat:trust|小雪|上升|大]');
    assert.equal(dimOf(up.state, '信任'), 1);
    const down = floor(withDims({ 信任: 0 }), '[igs-stat:trust|小雪|下降|重大]');
    assert.equal(dimOf(down.state, '信任'), -4);
    assert.equal(Object.hasOwn(down.state.characters.小雪, 'trustWound'), false);
    const hard = floor(withDims({ 信任: 0 }), '[igs-stat:trust|小雪|下降]', { favorMode: 'hard' });
    assert.equal(dimOf(hard.state, '信任'), -4);
});

// ---------- 第十二节：亲密消耗体力 ----------
const intimate = (level, cost, state = createStatsState(), extra = {}) => floor(state, `[igs-stat:intimate|小雪|${level}]`, { favorTier: 'normal', nsfw: true, intimateCost: cost, ...extra });
const staminaOf = (state, name) => (name ? state.characters[name].bars.stamina : state.protagonist.bars.stamina);

test('intimate 标签解析：档位归一，含数字整条丢弃', () => {
    assert.deepEqual(parseStatDirectives('[igs-stat:intimate|小雪|重度]').directives[0], { kind: 'intimate', target: '小雪', value: '重' });
    assert.equal(parseStatDirectives('[igs-stat:intimate|小雪|10]').directives.length, 0);
});

test('亲密体力：三档基础值 × 四档设置，主角与角色都扣', () => {
    const table = { off: [0, 0, 0], light: [3, 5, 10], standard: [5, 10, 20], heavy: [8, 15, 30] };
    for (const [cost, expected] of Object.entries(table)) {
        ['轻', '中', '重'].forEach((level, i) => {
            const r = intimate(level, cost);
            assert.equal(100 - staminaOf(r.state), expected[i], `${cost}/${level}主角`);
            assert.equal(100 - (r.state.characters.小雪 ? staminaOf(r.state, '小雪') : 100), expected[i], `${cost}/${level}角色`);
        });
    }
});

test('亲密体力：同楼多条按最高一档只扣一次；NSFW 关闭时不结算；meta 记档位', () => {
    const r = floor(createStatsState(), '[igs-stat:intimate|小雪|轻][igs-stat:intimate|小雪|重][igs-stat:intimate|小雪|中]', { favorTier: 'normal', nsfw: true, intimateCost: 'standard' });
    assert.equal(staminaOf(r.state), 80);
    assert.equal(staminaOf(r.state, '小雪'), 80);
    assert.equal(r.meta.intimateCost, 'standard');
    const sfw = intimate('重', 'standard', createStatsState(), { nsfw: false });
    assert.equal(staminaOf(sfw.state), 100);
});

test('亲密体力：不消耗时不扣体力、不减压力；旧楼没有 intimateCost 不结算且不写 meta', () => {
    const off = intimate('重', 'off');
    assert.equal(staminaOf(off.state), 100);
    assert.equal(off.meta.intimateCost, 'off');
    const old = floor(createStatsState(), '[igs-stat:intimate|小雪|重]', { favorTier: 'normal', nsfw: true });
    assert.equal(staminaOf(old.state), 100);
    assert.equal(Object.hasOwn(old.meta, 'intimateCost'), false);
    const legacy = floor(createStatsState(), '[igs-stat:intimate|小雪|重]', { nsfw: true });
    assert.equal(staminaOf(legacy.state), 100);
});

test('亲密体力：NSFW 关闭时不记档位，日后开启 NSFW 重算该楼不补扣', () => {
    const closed = floor(createStatsState(), '[igs-stat:intimate|小雪|重]', { favorTier: 'normal', nsfw: false, intimateCost: 'standard' });
    assert.equal(staminaOf(closed.state), 100);
    assert.equal(Object.hasOwn(closed.meta, 'intimateCost'), false);
    const redo = floor(createStatsState(), '[igs-stat:intimate|小雪|重]', { favorTier: 'normal', nsfw: true, intimateCost: closed.meta.intimateCost });
    assert.equal(staminaOf(redo.state), 100);
    assert.equal(Object.hasOwn(redo.meta, 'intimateCost'), false);
});

test('亲密体力：当天第一次压力 −10，同日第二次不再减，第二天再减', () => {
    const base = { ...createStatsState(), protagonist: { ...createStatsState().protagonist, bars: { stamina: 100, money: 0, stress: 40 } } };
    const first = intimate('轻', 'standard', base);
    assert.equal(first.state.protagonist.bars.stress, 30);
    const second = intimate('轻', 'standard', first.state);
    assert.equal(second.state.protagonist.bars.stress, 30);
    const night = floor(second.state, '睡去。[igs-stat:sleep]', { favorTier: 'normal' }).state;
    const third = intimate('轻', 'standard', night);
    assert.ok(third.changes.some((c) => c.key === 'stress' && c.note === '亲密'));
});

test('亲密体力归零：主角触发 forcedRest', () => {
    const base = { ...createStatsState(), protagonist: { ...createStatsState().protagonist, bars: { stamina: 15, money: 0, stress: 0 } } };
    const r = intimate('重', 'standard', base);
    assert.ok(r.changes.some((c) => c.key === 'stamina' && c.target === '主角' && c.to === 0 && c.note === '亲密'));
    assert.equal(r.meta.flags.forcedRest, true);
});

// ---------- 提示词：第十一、十二节 ----------
const stateOf = (stamina, favor = 0) => {
    const s = withDims({ 好感: favor, 信任: 0, 欲望: 0 });
    return { ...s, characters: { 小雪: { ...s.characters.小雪, bars: { stamina, money: 0, stress: 0 } } } };
};
const promptOf = (state, opts) => buildStatsPrompt(state, { present: ['小雪'], nsfw: true, intimacyGate: true, ...opts }).content;

test('亲密门槛豁免：开时不出拒绝约束，出现 intimacyForced；关时恢复', () => {
    const state = stateOf(100);
    const refuse = '亲吻、抚摸、性行为等一律拒绝或回避';
    const forcedText = '与主角的亲密是剧情所迫，并非出于好感；态度、言语与神情仍按当前关系阶段和芥蒂表现，不因亲密而变得温顺或亲近。';
    const off = promptOf(state, {});
    assert.ok(off.includes(refuse));
    assert.ok(!off.includes('剧情所迫'));
    const on = promptOf(state, { forcedNames: ['小雪'] });
    assert.ok(!on.includes(refuse));
    assert.ok(on.includes(forcedText));
    const other = promptOf(state, { forcedNames: ['阿澄'] });
    assert.ok(other.includes(refuse));
    const custom = promptOf(state, { forcedNames: ['小雪'], prompts: { intimacyForced: '自定义豁免。' } });
    assert.ok(custom.includes('自定义豁免。'));
});

test('亲密非好感事件的说明与 trust 强度说明出现在 tags 段', () => {
    const text = promptOf(stateOf(100), {});
    assert.ok(text.includes('亲密行为本身不算好感事件，好感只按主角在过程中的态度判断（体贴照顾可为感动，敷衍利用可为失望）。'));
    assert.ok(text.includes('[igs-stat:trust|角色名|上升/下降|小/中/大/重大]'));
    assert.ok(text.includes('小＝守约、小事可靠或敷衍、小谎；中＝帮忙兜底、保守秘密或爽约、被发现隐瞒；大＝危难时挺身而出或当众出卖、重大欺骗；重大＝托付生死或背叛'));
});

test('intimate 行：NSFW 且非不消耗时出现', () => {
    assert.ok(promptOf(stateOf(100), { intimateCost: 'standard' }).includes('[igs-stat:intimate|角色名|轻/中/重]'));
    assert.ok(!promptOf(stateOf(100), { intimateCost: 'off' }).includes('igs-stat:intimate'));
    assert.ok(!promptOf(stateOf(100), {}).includes('igs-stat:intimate'));
    assert.ok(!promptOf(stateOf(100), { intimateCost: 'standard', nsfw: false }).includes('igs-stat:intimate'));
});

test('NPC 体力提示：低于 30 很疲惫，归零体力耗尽；主角沿用现有疲惫提示', () => {
    assert.ok(promptOf(stateOf(20), { intimateCost: 'standard' }).includes('小雪很疲惫，想停下来。'));
    assert.ok(promptOf(stateOf(0), { intimateCost: 'standard' }).includes('小雪体力耗尽，亲密必须在本轮结束。'));
    assert.ok(!promptOf(stateOf(80), { intimateCost: 'standard' }).includes('想停下来'));
    assert.ok(!promptOf(stateOf(20), { intimateCost: 'off' }).includes('想停下来'));
    const hero = withDims({});
    const tired = { ...hero, protagonist: { ...hero.protagonist, bars: { stamina: 10, money: 0, stress: 0 } } };
    assert.ok(promptOf(tired, { intimateCost: 'standard' }).includes('主角很疲惫，动作迟缓'));
});

// ---------- 设置与存档 ----------
test('亲密消耗设置默认标准，非法值回默认', () => {
    assert.equal(normalizeStatsSettings({}).intimateCost, 'standard');
    assert.equal(normalizeStatsSettings({ intimateCost: 'off' }).intimateCost, 'off');
    assert.equal(normalizeStatsSettings({ intimateCost: 'x' }).intimateCost, 'standard');
});

test('豁免名单进聊天级存档并能还原', () => {
    const map = chatEntries({ catalog: { intimacyForced: ['小雪'] } });
    assert.equal(map.get('force:小雪'), true);
    assert.deepEqual(restoreChat(map).catalog.intimacyForced, ['小雪']);
    assert.deepEqual(restoreChat(chatEntries({})).catalog.intimacyForced, []);
});

// ---------- 豁免开关在 swipe / 删楼后保留 ----------
const T = { GENERATION_STARTED: 'gs', GENERATION_ENDED: 'ge', GENERATION_STOPPED: 'gx', MESSAGE_SWIPED: 'sw', MESSAGE_DELETED: 'del', MESSAGE_UPDATED: 'upd', CHAT_CHANGED: 'chat' };

function runtimeSetup({ nsfw = false } = {}) {
    const handlers = new Map();
    const eventSource = {
        on(n, f) { if (!handlers.has(n)) handlers.set(n, new Set()); handlers.get(n).add(f); },
        removeListener(n, f) { handlers.get(n)?.delete(f); },
        emit(n, ...a) { for (const f of [...(handlers.get(n) || [])]) f(...a); },
    };
    const ctx = { name2: '小雪', chat: [{ is_user: true, mes: '你好' }], chatMetadata: {}, extensionPrompts: {}, eventSource, eventTypes: T, getCurrentChatId: () => 'chat-j', setExtensionPrompt() {}, saveMetadata() {} };
    const holder = { cur: { enabled: true, favorMode: 'normal' } };
    const rows = [];
    const tables = { ok: true, version: 0, read: () => ({ ok: true, stats: rows.slice() }), append(r) { rows.push(...r); this.version += 1; return Promise.resolve({ ok: true }); }, ensure: () => Promise.resolve({ ok: true }) };
    const rt = createStatsRuntime({ getContext: () => ctx, readSettings: () => holder.cur, isNsfw: () => nsfw, statsTables: () => tables });
    rt.sync();
    rt.enableForChat();
    const say = (text) => {
        eventSource.emit('gs', 'normal', {}, false);
        ctx.chat.push({ is_user: false, mes: text, swipe_id: 0 });
        eventSource.emit('ge', ctx.chat.length - 1);
        return ctx.chat.length - 1;
    };
    return { rt, ctx, say, eventSource, rows };
}

test('豁免开关存聊天级目录：重算、删楼后保留，可关闭，未登记角色不可开', () => {
    const { rt, ctx, say, eventSource } = runtimeSetup();
    const id = say('她笑了。[igs-stat:favor|小雪|开心]');
    assert.equal(rt.relationOp('forced', '路人', { forced: true }).ok, false);
    assert.equal(rt.relationOp('forced', '小雪', { forced: true }).ok, true);
    assert.deepEqual(rt.getCatalog().intimacyForced, ['小雪']);
    assert.equal(rt.archive().characters.find((c) => c.name === '小雪').intimacyForced, true);
    ctx.chat[id].mes += ' 补一句。';
    eventSource.emit('upd', id);
    assert.deepEqual(rt.getCatalog().intimacyForced, ['小雪']);
    ctx.chat.pop();
    eventSource.emit('del', ctx.chat.length);
    assert.deepEqual(rt.getCatalog().intimacyForced, ['小雪']);
    say('她又笑了。[igs-stat:favor|小雪|开心]');
    assert.equal(rt.relationOp('forced', '小雪', { forced: false }).ok, true);
    assert.deepEqual(rt.getCatalog().intimacyForced, []);
});

test('新楼记录亲密档位（NSFW 开启时）；改设置后旧楼按当时档位重算，缺字段的旧楼不结算', () => {
    const { rt, ctx, say, eventSource } = runtimeSetup({ nsfw: true });
    const id = say('她靠近。[igs-stat:favor|小雪|开心]');
    const entry = rt.getLedger().entries.get(`chat-j|${id}|0`);
    assert.equal(entry.meta.intimateCost, 'standard');
    delete entry.meta.intimateCost;
    ctx.chat[id].mes += ' [igs-stat:intimate|小雪|重]';
    eventSource.emit('upd', id);
    const redone = rt.getLedger().entries.get(`chat-j|${id}|0`);
    assert.equal(Object.hasOwn(redone.meta, 'intimateCost'), false);
    assert.equal(rt.getState().protagonist.bars.stamina, 100);
});

test('NSFW 关闭的楼不记亲密档位，日后开启 NSFW 重算该楼也不补扣体力', () => {
    const { rt, say } = runtimeSetup({ nsfw: false });
    const id = say('她靠近。[igs-stat:intimate|小雪|重]');
    const entry = rt.getLedger().entries.get(`chat-j|${id}|0`);
    assert.equal(Object.hasOwn(entry.meta, 'intimateCost'), false);
    assert.equal(rt.getState().protagonist.bars.stamina, 100);
});
