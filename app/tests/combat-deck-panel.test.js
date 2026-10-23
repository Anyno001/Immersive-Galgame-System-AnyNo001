import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatLedger } from '../src/combat/ledger.js';
import { createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { profileIdFor } from '../src/combat/schema.js';
import { scanCombatTags } from '../src/scene/combat-directives.js';
import { createCombatServices } from '../src/core/combat-services.js';
import { createCombatDeckPanelController } from '../src/visual/igs-ui/combat-deck-panel.js';
import { FakeEl } from './helpers/fake-dom.js';

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
const ai = (mes) => ({ mes, swipe_id: 0, is_user: false });
const user = (mes) => ({ mes, is_user: true });

function memoryTables(profile) {
    const t = { profile: clone(profile), ledger: [] };
    t.read = () => ({ ok: true, missing: [], diagnostics: [], profile: clone(t.profile), ledger: clone(t.ledger) });
    t.append = async (kind, records) => {
        for (const r of records) if (!t[kind].some((x) => x.id === r.id && x.version === r.version)) t[kind].push(clone(r));
        return { ok: true, written: records.map((r) => r.id), present: [], rejected: [], pending: [] };
    };
    return t;
}

async function until(fn) {
    for (let i = 0; i < 50 && !fn(); i += 1) await new Promise((r) => setImmediate(r));
    assert.ok(fn());
}

const paused = (overlay) => String(overlay.getAttribute('data-igs-paused') || '').split(' ').filter(Boolean);

// 主角额外习得一张 k1：卡组 21 张，k1 只拥有 1 张，可构造「移出 k1」这样的合法草稿。
async function deckHarness(extra = {}) {
    const learnText = '他悟出新招。[igs-combat:learn|我|裂空斩|一刀]';
    const chat = [user('出发'), ai(learnText)];
    const tables = memoryTables([row(classDef, 1), row(heroDef, 2)]);
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7 });
    const tagHash = scanCombatTags(learnText)[0].tagHash;
    const anchor = { messageId: 1, swipeId: 0, tagHash, occurrence: 0 };
    await ledger.append([{ id: `learn|pc-hero|1|0|${tagHash}|0`, type: 'learn', character: 'pc-hero', anchor, payload: { card: attack('k1') }, createdAt: 7 }]);
    const sessionState = { status: 'idle' };
    const doc = { createElement: (tag) => new FakeEl(doc, tag), activeElement: null };
    const overlay = new FakeEl(doc, 'div');
    overlay.id = 'igs-overlay';
    const panel = createCombatDeckPanelController(doc, { getLedger: () => ledger, getSession: () => ({ state: () => sessionState, retrySend: async () => ({ ok: true }) }), ...extra });
    return { tables, ledger, sessionState, overlay, panel };
}

const skill = (id, effects, intent = 'attack') => ({ id, name: `技${id}`, intent, effects });
const aliceSkill = { kind: 'skill-character', id: 'sc-alice', name: '爱丽丝', base: { hp: 50 },
    skills: [skill('s1', [{ op: 'damage', amount: 5 }]), skill('s2', [{ op: 'block', amount: 5 }], 'defend'), skill('s3', [{ op: 'damage', amount: 4 }])],
    passives: [{ id: 'pa1', name: '坚守', trigger: 'turn-start', effects: [{ op: 'block', amount: 2 }] }] };
const body = (h) => h.overlay.querySelector('.igs-deck-body').innerHTML;

test('构筑面板：打开加 panel:combat-deck 暂停原因并列出角色；超出拥有数不能加入，移出后保存写一条 deck 并读回；关闭只撤销自己的原因', async () => {
    const h = await deckHarness();
    assert.equal(h.panel.open(h.overlay).ok, true);
    assert.deepEqual(paused(h.overlay), ['panel:combat-deck']);
    await until(() => h.panel.view().status === 'ready');
    const v = h.panel.view();
    assert.deepEqual([v.selectedId, v.roster.map((r) => r.name), v.detail.deck.length], ['pc-hero', ['主角'], 21]);
    assert.match(body(h), /data-deck-act="save" aria-disabled="true"/);
    assert.deepEqual(h.panel.invoke('add', 'k1'), { ok: false, reason: 'combat-deck-invalid' });
    assert.deepEqual(h.panel.invoke('remove', 'k1'), { ok: true, size: 20 });
    assert.equal(h.panel.view().detail.check.ok, true);
    const saved = await h.panel.invoke('save');
    assert.equal(saved.ok, true);
    const decks = h.tables.ledger.filter((e) => e.type === 'deck');
    assert.equal(decks.length, 1);
    assert.equal(decks[0].payload.cards.includes('k1'), false);
    await until(() => h.panel.view().detail.dirty === false);
    assert.equal((await h.ledger.effectiveState()).characters.get('pc-hero').deck.length, 20);
    assert.equal(h.panel.close().ok, true);
    assert.deepEqual(paused(h.overlay), []);
    assert.equal(h.overlay.querySelector('#igs-combat-deck-panel'), null);
});

test('构筑面板：不合规草稿不能保存；战斗进行中只读，不写表', async () => {
    const h = await deckHarness();
    h.panel.open(h.overlay);
    await until(() => h.panel.view().status === 'ready');
    h.panel.invoke('remove', 'k1');
    h.panel.invoke('remove', 'm1');
    const v = h.panel.view();
    assert.equal(v.detail.check.ok, false);
    assert.ok(v.detail.check.errors.some((e) => e.reason === 'deck-too-small'));
    assert.match(body(h), /data-deck-act="save" aria-disabled="true"/);
    const refused = await h.panel.invoke('save');
    assert.deepEqual([refused.ok, refused.reason], [false, 'combat-deck-invalid']);
    assert.match(h.panel.view().notice, /不合规/);
    h.sessionState.status = 'battle';
    assert.equal(h.panel.invoke('remove', 'm2').reason, 'combat-deck-readonly');
    assert.equal(h.panel.view().readonly, true);
    assert.match(body(h), /只读/);
    assert.equal(h.tables.ledger.filter((e) => e.type === 'deck').length, 0);
    h.panel.close();
});

test('构筑面板：技能角色可手动生成卡组档案；选定已有职业时沿用职业特性；未注入生成能力时拒绝', async () => {
    const calls = [];
    const h = await deckHarness({ generateDeckProfile: async (input, opts) => { calls.push({ input, hasSignal: Boolean(opts && opts.signal) }); return { ok: true, id: 'sc-alice', reusedClass: true }; } });
    h.tables.profile.push(row(aliceSkill, 3));
    h.panel.open(h.overlay);
    await until(() => h.panel.view().status === 'ready');
    assert.deepEqual(h.panel.view().roster.map((r) => [r.id, r.kindLabel]), [['pc-hero', '卡组'], ['sc-alice', '技能']]);
    h.panel.invoke('select', 'sc-alice');
    assert.match(body(h), /data-deck-act="generate-open"/);
    assert.equal(h.panel.invoke('generate-open', 'sc-alice').ok, true);
    assert.equal(h.panel.invoke('generate-class', 'cls-blade').ok, true);
    assert.match(body(h), /沿用已有职业特性/);
    const r = await h.panel.invoke('generate');
    assert.equal(r.ok, true);
    assert.deepEqual(calls, [{ input: { name: '爱丽丝', classRef: 'cls-blade' }, hasSignal: true }]);
    h.panel.close();

    const bare = await deckHarness();
    bare.tables.profile.push(row(aliceSkill, 3));
    bare.panel.open(bare.overlay);
    await until(() => bare.panel.view().status === 'ready');
    assert.equal(bare.panel.invoke('generate-open', 'sc-alice').reason, 'combat-generate-unavailable');
    bare.panel.close();
});

function fakeShujuku() {
    const tables = { mate: { type: 'chatSheets', version: 1 } };
    return {
        exportTableAsJson: () => clone(tables),
        insertRow(opts) {
            const sheet = Object.values(tables).find((s) => s && s.name === opts.tableName);
            if (!sheet) return -1;
            sheet.content.push(sheet.content[0].map((h) => (h === 'row_id' ? String(sheet.content.length) : String(opts.data[h] ?? ''))));
            return sheet.content.length - 1;
        },
        getTableTemplate: () => clone(tables),
        async importTemplateFromData(template) {
            for (const [key, sheet] of Object.entries(template)) if (!tables[key] || key === 'mate') tables[key] = clone(sheet);
            return { success: true };
        },
        async refreshDataAndWorldbook() {},
    };
}

function servicesHarness({ enabled = true, replies = [] } = {}) {
    const api = fakeShujuku();
    const seen = [];
    const request = async (req) => { seen.push(JSON.parse(req.user)); return replies[seen.length - 1]; };
    const services = createCombatServices({ global: { AutoCardUpdaterAPI: api }, request, getReaderSettings: () => ({ combatExpansion: { enabled } }),
        getUserName: () => '主角', getAutoIllustration: () => ({}) });
    return { api, seen, services, tables: createCombatTables({ api }) };
}

test('手动生成卡组档案：沿用已登记职业时请求不含职业部分；写入后读回，同名技能档案让位；已有卡组档案不再请求；取消与关闭不落表', async () => {
    const aliceId = profileIdFor('deck-character', '爱丽丝');
    const deckValue = { base: { hp: 80 }, personalPassive: passive('p-alice'), personalPool: [attack('m1'), guard('m2'), attack('m3'), guard('m4')], starterDeck: [...STARTER] };
    const h = servicesHarness({ replies: [JSON.stringify({ entities: [{ key: `deck:${aliceId}`, value: deckValue }] })] });
    assert.equal((await h.tables.ensure({ confirmed: true })).ok, true);
    assert.equal((await h.tables.append('profile', [row(classDef, 1), row(heroDef, 2), row(aliceSkill, 3)])).ok, true);
    const r = await h.services.generateDeckProfile({ name: '爱丽丝', classRef: 'cls-blade' });
    assert.deepEqual(r, { ok: true, id: aliceId, reusedClass: true });
    assert.deepEqual(h.seen[0].entities.map((e) => e.key), [`deck:${aliceId}`]);
    const state = await h.services.getLedger().effectiveState();
    assert.equal(state.characters.get(aliceId).kind, 'deck-character');
    assert.equal(state.characters.get(aliceId).classRef, 'cls-blade');
    assert.equal(state.characters.has('sc-alice'), false);

    const again = await h.services.generateDeckProfile({ name: '爱丽丝' });
    assert.deepEqual([again.ok, again.reason, h.seen.length], [false, 'combat-profile-exists', 1]);

    const controller = new AbortController();
    controller.abort();
    const stale = await h.services.generateDeckProfile({ name: '鲍勃' }, { signal: controller.signal });
    assert.deepEqual([stale.ok, stale.reason, h.seen.length], [false, 'request-stale', 1]);
    assert.equal((await h.tables.read()).profile.some((p) => p.id === profileIdFor('deck-character', '鲍勃')), false);

    const off = servicesHarness({ enabled: false });
    assert.deepEqual(await off.services.generateDeckProfile({ name: '爱丽丝' }), { ok: false, reason: 'combat-disabled' });
});


// 服务层成长缓存：宿主聊天经 SillyTavern.getContext 读取，chatId 可切换。
function growthServices({ replies } = {}) {
    const api = fakeShujuku();
    const host = { chatId: 'chat-1', chat: [user('出发'), ai('你挥剑百次。[igs-combat:exp|我|30|练剑]他悟出新招。[igs-combat:learn|我|裂空斩|一刀]')] };
    const seen = [];
    const request = async (req) => {
        const payload = JSON.parse(req.user);
        seen.push(payload);
        return typeof replies === 'function' ? replies(payload) : JSON.stringify({ entities: [] });
    };
    const services = createCombatServices({
        global: { AutoCardUpdaterAPI: api, SillyTavern: { getContext: () => ({ chat: host.chat }) } },
        request, getReaderSettings: () => ({ combatExpansion: { enabled: true } }),
        getChatId: () => host.chatId, getUserName: () => '主角', getAutoIllustration: () => ({}),
    });
    return { api, host, seen, services, tables: createCombatTables({ api }) };
}

test('成长缓存：refreshGrowth 补扫入库并缓存已生效成长与待生成项、通知订阅者；换聊天后缓存不再返回；retryGrowth 生成 learn 并落账', async () => {
    const card = { name: '裂空斩', type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 6 }] };
    const h = growthServices({ replies: (p) => JSON.stringify({ entities: p.entities.map((e) => ({ key: e.key, value: { card } })) }) });
    assert.equal((await h.tables.ensure({ confirmed: true })).ok, true);
    assert.equal((await h.tables.append('profile', [row(classDef, 1), row(heroDef, 2)])).ok, true);
    let notified = 0;
    const off = h.services.onGrowthUpdated(() => { notified += 1; });
    assert.equal(h.services.getGrowth(), null);
    const r = await h.services.refreshGrowth();
    assert.equal(r.ok, true);
    const g = h.services.getGrowth();
    assert.deepEqual([g.chatId, g.growth.map((x) => [x.type, x.amount]), g.pending.map((p) => [p.kind, p.skill])], ['chat-1', [['exp', 30]], [['learn', '裂空斩']]]);
    assert.equal(notified, 1);
    assert.equal((await h.tables.read()).ledger.filter((e) => e.type === 'exp').length, 1);

    const retried = await h.services.retryGrowth();
    assert.deepEqual([retried.ok, retried.written, retried.skipped], [true, 1, 0]);
    assert.equal(h.seen.length, 1);
    const after = h.services.getGrowth();
    assert.deepEqual(after.growth.map((x) => x.type).sort(), ['exp', 'learn']);
    assert.deepEqual(after.pending, []);
    assert.equal(notified, 2);

    h.host.chatId = 'chat-2';
    assert.equal(h.services.getGrowth(), null);
    off();
    await h.services.refreshGrowth();
    assert.equal(notified, 2);
});

