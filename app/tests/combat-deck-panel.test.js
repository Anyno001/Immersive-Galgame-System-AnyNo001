import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatLedger } from '../src/combat/ledger.js';
import { createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { profileIdFor } from '../src/combat/schema.js';
import { enemyIdFor } from '../src/combat/generation.js';
import { scanCombatTags } from '../src/scene/combat-directives.js';
import { createCombatServices } from '../src/core/combat-services.js';
import { createCombatDeckPanelController } from '../src/visual/igs-ui/combat-deck-panel.js';
import { FakeEl } from './helpers/fake-dom.js';
import { secondaryLlmHttpError } from '../src/host/secondary-llm-result.js';


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
    assert.equal(v.page, 'status');
    assert.equal(h.panel.invoke('page', 'deck').ok, true);
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
    h.panel.invoke('page', 'deck');
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

test('奖励候选按稀有度上限筛选：神话已有一份不再候选，史诗第三份仍可选', async () => {
    const { rewardChoices } = await import('../src/visual/igs-ui/combat-panel-model.js');
    const cards = ['mythic', 'epic', 'signature', 'basic', 'unknown'].map((rarity) => ({ id: rarity, name: rarity, type: 'attack', cost: 1, rarity }));
    const view = { id: 'pc-rarity', kind: 'deck-character', pendingRewards: [2], catalog: new Map(cards.map((c) => [c.id, c])), owned: new Map([['mythic', 1], ['epic', 2]]), upgraded: new Map() };
    assert.deepEqual(rewardChoices(view, 2).cards.map((c) => c.cardId), ['epic']);
    view.owned.set('epic', 3);
    assert.deepEqual(rewardChoices(view, 2).cards, []);
    view.owned.delete('mythic');
    assert.deepEqual(rewardChoices(view, 2).cards.map((c) => c.cardId), ['mythic']);
});


test('构筑神话卡：有多份收藏仍限入组一张；移出后可再加入，保存并读回不改收藏', async () => {
    const h = await deckHarness();
    const cls = h.tables.profile.find((p) => p.kind === 'class').definition;
    Object.assign(cls.classPool.find((c) => c.id === 'c1'), { rarity: 'mythic', effects: [{ op: 'damage', amount: 8 }] });
    const starter = h.tables.profile.find((p) => p.kind === 'deck-character').definition.starterDeck;
    starter[starter.indexOf('c1')] = 'c5';
    h.panel.open(h.overlay);
    await until(() => h.panel.view().status === 'ready');
    assert.ok(h.panel.view().detail);
    const entry = () => h.panel.view().detail.owned.find((c) => c.cardId === 'c1');
    assert.deepEqual([entry().owned, entry().inDeck, entry().canAdd], [2, 2, false]);
    assert.equal(h.panel.view().detail.check.ok, false);
    assert.equal(h.panel.invoke('add', 'c1').reason, 'combat-deck-invalid');
    h.panel.invoke('remove', 'c1');
    assert.deepEqual([entry().inDeck, entry().canAdd], [1, false]);
    h.panel.invoke('remove', 'c1');
    assert.equal(entry().canAdd, true);
    assert.equal(h.panel.invoke('add', 'c1').ok, true);
    assert.equal(entry().canAdd, false);
    assert.equal(h.panel.invoke('add', 'c1').reason, 'combat-deck-invalid');
    assert.equal(h.panel.view().detail.check.ok, true);
    assert.equal((await h.panel.invoke('save')).ok, true);
    const saved = (await h.ledger.effectiveState()).characters.get('pc-hero');
    assert.equal(saved.deck.filter((id) => id === 'c1').length, 1);
    assert.equal(saved.owned.get('c1'), 2);
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
    h.panel.invoke('page', 'deck');
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
    const deckValue = { hp: 80, passive: ['意志', 'last-stand'], skill: ['闪光', 'quick'], cards: [['剑一', 'strike', 1], ['盾二', 'guard', 1], ['剑三', 'strike', 1], ['盾四', 'guard', 1]] };
    const h = servicesHarness({ replies: [JSON.stringify({ entities: [{ key: `deck:${aliceId}`, value: deckValue }] })] });
    assert.equal((await h.tables.ensure()).ok, true);
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
    const card = { template: 'strike', cost: 1 };
    const h = growthServices({ replies: (p) => JSON.stringify({ entities: p.entities.map((e) => ({ key: e.key, value: card })) }) });
    assert.equal((await h.tables.ensure()).ok, true);
    assert.equal((await h.tables.append('profile', [row(classDef, 1), row(heroDef, 2)])).ok, true);
    let notified = 0;
    const off = h.services.onGrowthUpdated(() => { notified += 1; });
    assert.equal(h.services.getGrowth(), null);
    // 主角团状态：缓存未刷新时不注入并记诊断；刷新后列出主角（还没有战斗，没有队友）。
    assert.equal(h.services.partyPromptInput(), null);
    assert.deepEqual(h.services.getDiagnostics().map((d) => [d.code, d.reason]), [['combat-party-status-unavailable', 'combat-growth-cache-missing']]);
    const r = await h.services.refreshGrowth();
    assert.equal(r.ok, true);
    assert.deepEqual(h.services.partyPromptInput().map((p) => [p.name, p.down, p.hp === p.maxHp, p.injury]), [['主角', false, true, '无伤']]);
    assert.equal(h.services.partyPromptInput('quiet'), null);
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

test('后台自动准备：最新 AI 楼带开战标签时直接准备到战前、不等面板；同一场不重跑；用户楼、无标签、扩展关闭时不准备', async () => {
    const h = growthServices();
    h.host.chat = [user('出发'), ai('前方有动静。\n[igs-combat:start|狭路|狼]')];
    // 三个技能：已达 1 级普通档的技能数目标，准备时不补技能。
    const wolf = { kind: 'enemy', id: enemyIdFor('狼', 'normal'), name: '狼', tier: 'normal', base: { hp: 40 },
        skills: [{ id: 'e1', name: '撕咬', intent: 'attack', effects: [{ op: 'damage', amount: 4 }] }, { id: 'e2', name: '扑击', intent: 'attack', effects: [{ op: 'damage', amount: 4 }] },
            { id: 'e3', name: '猛扑', intent: 'attack', effects: [{ op: 'damage', amount: 4 }] }] };
    assert.equal((await h.tables.ensure()).ok, true);
    assert.equal((await h.tables.append('profile', [row(classDef, 1), row(heroDef, 2), row(wolf, 3)])).ok, true);
    const r = await h.services.autoPrepare(1);
    // 档案齐全时不重建档案；属性表已建、参战者缺 init，只发一次初始化补齐请求（9d，主角与敌人各一项）。
    // 本场奖励（battle-reward）与初始化同批请求；夹具不作答，奖励失败不阻断，之后的修正轮只含奖励。
    const inits = h.seen.map((p) => p.entities.filter((e) => e.kind !== 'battle-reward').map((e) => [e.kind, e.input.name])).filter((x) => x.length);
    assert.deepEqual([r.ok, r.session?.status, inits, h.seen[0].entities.some((e) => e.kind === 'battle-reward'), r.session?.reward?.status], [true, 'lobby', [[['profile-init', '主角'], ['profile-init', '狼']]], true, 'failed']);
    const asked = h.seen.length;
    const again = await h.services.autoPrepare(1);
    assert.deepEqual([again.ok, again.unchanged, h.seen.length], [true, true, asked]);
    assert.equal((await h.services.autoPrepare(0)).reason, 'combat-floor-missing');
    h.host.chat.push(ai('风平浪静。'));
    assert.equal((await h.services.autoPrepare(2)).reason, 'combat-start-missing');
    const off = createCombatServices({ global: { SillyTavern: { getContext: () => ({ chat: h.host.chat }) } },
        getReaderSettings: () => ({ combatExpansion: { enabled: false } }), getChatId: () => 'chat-1', getUserName: () => '主角' });
    assert.equal((await off.autoPrepare(1)).reason, 'combat-disabled');
});


test('强度档：服务层追加新版本档案并读回确认，非法档位与非技能角色拒绝；面板只读时不显示档位按钮，点击转发到注入的 setAllyTier', async () => {
    const h = servicesHarness();
    assert.equal((await h.tables.ensure()).ok, true);
    assert.equal((await h.tables.append('profile', [row(classDef, 1), row(heroDef, 2), row(aliceSkill, 3)])).ok, true);
    assert.deepEqual(await h.services.setAllyTier('sc-alice', 'god'), { ok: false, reason: 'combat-tier-invalid' });
    assert.equal((await h.services.setAllyTier('pc-hero', 'ace')).reason, 'combat-character-missing');
    const set = await h.services.setAllyTier('sc-alice', 'ace');
    assert.deepEqual(set, { ok: true, id: 'sc-alice', tier: 'ace' });
    const rows = (await h.tables.read()).profile.filter((p) => p.id === 'sc-alice');
    assert.deepEqual(rows.map((p) => p.version).sort(), [1, 2]);
    assert.equal((await h.services.getLedger().effectiveState()).characters.get('sc-alice').profile.tier, 'ace');
    assert.equal((await h.services.setAllyTier('sc-alice', 'ace')).unchanged, true);

    const calls = [];
    const p = await deckHarness({ setAllyTier: async (id, tier) => { calls.push([id, tier]); return { ok: true, id, tier }; } });
    p.tables.profile.push(row(aliceSkill, 3));
    p.panel.open(p.overlay);
    await until(() => p.panel.view().status === 'ready');
    p.panel.invoke('select', 'sc-alice');
    p.panel.invoke('page', 'deck');
    assert.equal(p.panel.view().detail.tier, 'peer');
    assert.match(body(p), /data-deck-act="set-tier" data-deck-id="ace"/);
    assert.equal((await p.panel.invoke('set-tier', 'ace')).ok, true);
    assert.deepEqual(calls, [['sc-alice', 'ace']]);
    p.sessionState.status = 'battle';
    p.panel.invoke('select', 'sc-alice');
    assert.doesNotMatch(body(p), /data-deck-act="set-tier"/);
    assert.equal((await p.panel.invoke('set-tier', 'legend')).reason, 'combat-deck-readonly');
    p.panel.close();
});



test('装备栏：列出四个部位与背包、道具；装上背包装备顶替同部位，卸下后部位为空；面板换装排在同楼标签之后；战斗进行中只读', async () => {
    const { gearIdFor, itemIdFor, ledgerEntryId } = await import('../src/combat/schema.js');
    const floor1 = '得到宝剑与丹药。[igs-combat:equip|我|青锋剑|武器][igs-combat:item|我|回春丹|2]';
    const floor2 = '换上了更重的剑。[igs-combat:equip|我|玄铁剑|武器]';
    const chat = [user('出发'), ai(floor1), ai(floor2)];
    const tables = memoryTables([row(classDef, 1), row(heroDef, 2)]);
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7 });
    const entry = (type, messageId, tag, payload) => {
        const anchor = { messageId, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
        return { id: ledgerEntryId(type, 'pc-hero', anchor), type, character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const gp = (id) => ({ id, name: '剑意', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1, target: 'self' }], description: '开战获得 1 层力量' });
    const [t1, t2] = scanCombatTags(floor1);
    const [t3] = scanCombatTags(floor2);
    await ledger.append([
        entry('equip', 1, t1, { gearId: gearIdFor('青锋剑'), name: '青锋剑', slot: 'weapon', passive: gp('g1'), description: '' }),
        entry('item', 1, t2, { itemId: itemIdFor('回春丹'), name: '回春丹', count: 2, effects: [{ op: 'heal', amount: 12, target: 'self' }], description: '' }),
        entry('equip', 2, t3, { gearId: gearIdFor('玄铁剑'), name: '玄铁剑', slot: 'weapon', passive: gp('g2'), description: '' }),
    ]);
    const sessionState = { status: 'idle' };
    const doc = { createElement: (tag) => new FakeEl(doc, tag), activeElement: null };
    const overlay = new FakeEl(doc, 'div');
    overlay.id = 'igs-overlay';
    const panel = createCombatDeckPanelController(doc, { getLedger: () => ledger, getSession: () => ({ state: () => sessionState }) });
    panel.open(overlay);
    await until(() => panel.view().status === 'ready');
    panel.invoke('page', 'gear');
    const gear = () => panel.view().detail.gear;
    assert.deepEqual(gear().slots.map((s) => [s.slot, s.item?.name ?? null]), [['weapon', '玄铁剑'], ['armor', null], ['accessory', null], ['treasure', null]]);
    assert.deepEqual([gear().bag.map((b) => b.name), gear().items.map((i) => [i.name, i.count])], [['青锋剑'], [['回春丹', 2]]]);
    const html = () => overlay.querySelector('.igs-deck-body').innerHTML;
    assert.match(html(), /回春丹 ×2/);
    assert.doesNotMatch(html(), /data-deck-act="equip"/);
    panel.invoke('page', 'collection');
    assert.match(html(), /data-deck-act="equip" data-deck-id="gr-/);
    panel.invoke('page', 'gear');
    const r = await panel.invoke('equip', gearIdFor('青锋剑'));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.entry.anchor.messageId, 2);
    assert.deepEqual([gear().slots[0].item.name, gear().bag.map((b) => b.name)], ['青锋剑', ['玄铁剑']]);
    assert.equal((await panel.invoke('unequip', gearIdFor('青锋剑'))).ok, true);
    assert.deepEqual([gear().slots[0].item, gear().bag.map((b) => b.name).sort()], [null, ['玄铁剑', '青锋剑'].sort()]);
    assert.deepEqual(await panel.invoke('unequip', gearIdFor('青锋剑')), { ok: false, reason: 'combat-gear-missing' });
    const before = tables.ledger.length;
    sessionState.status = 'battle';
    assert.equal((await panel.invoke('equip', gearIdFor('玄铁剑'))).reason, 'combat-deck-readonly');
    assert.equal(tables.ledger.length, before);
    panel.close();
});

test('背包页：主角顶部显示积分；未装备的装备可装上、可卖出，点卖出后在该行确认售价或取消，确认后写一条 sell 并移出背包；穿戴中的装备不在背包；战斗进行中只读', async () => {
    const { gearIdFor, ledgerEntryId } = await import('../src/combat/schema.js');
    const { sellPrice } = await import('../src/combat/points.js');
    const floor1 = '得到宝剑。[igs-combat:equip|我|青锋剑|武器]';
    const floor2 = '换上了更重的剑。[igs-combat:equip|我|玄铁剑|武器]';
    const chat = [user('出发'), ai(floor1), ai(floor2)];
    const tables = memoryTables([row(classDef, 1), row(heroDef, 2)]);
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7 });
    const gp = (id) => ({ id, name: '剑意', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1, target: 'self' }], description: '开战获得 1 层力量' });
    const equipEntry = (messageId, text, name, pid) => {
        const [t] = scanCombatTags(text);
        const anchor = { messageId, swipeId: 0, tagHash: t.tagHash, occurrence: t.occurrence };
        return { id: ledgerEntryId('equip', 'pc-hero', anchor), type: 'equip', character: 'pc-hero', anchor, payload: { gearId: gearIdFor(name), name, slot: 'weapon', passive: gp(pid), description: '' }, createdAt: 7 };
    };
    await ledger.append([equipEntry(1, floor1, '青锋剑', 'g1'), equipEntry(2, floor2, '玄铁剑', 'g2')]);
    const sessionState = { status: 'idle' };
    const doc = { createElement: (tag) => new FakeEl(doc, tag), activeElement: null };
    const overlay = new FakeEl(doc, 'div');
    overlay.id = 'igs-overlay';
    const panel = createCombatDeckPanelController(doc, { getLedger: () => ledger, getSession: () => ({ state: () => sessionState }) });
    const html = () => overlay.querySelector('.igs-deck-body').innerHTML;
    panel.open(overlay);
    await until(() => panel.view().status === 'ready');
    panel.invoke('page', 'collection');
    const qing = gearIdFor('青锋剑');
    const price = sellPrice(undefined, qing);
    const d = () => panel.view().detail;
    assert.match(html(), /aria-selected="true">背包</);
    assert.deepEqual([d().points, d().canSell, d().gear.bag.map((b) => [b.name, b.price])], [0, true, [['青锋剑', price]]]);
    assert.match(html(), new RegExp(`data-deck-act="equip" data-deck-id="${qing}"`));
    assert.match(html(), new RegExp(`data-deck-act="sell-gear" data-deck-id="${qing}"`));
    assert.equal(panel.invoke('sell-gear', gearIdFor('玄铁剑')).reason, 'combat-gear-missing');
    assert.equal(panel.invoke('sell-gear', qing).ok, true);
    assert.match(html(), new RegExp(`确认卖出 · ${price} 积分`));
    assert.equal(panel.invoke('sell-cancel').ok, true);
    assert.doesNotMatch(html(), /sell-confirm/);
    sessionState.status = 'battle';
    panel.invoke('select', 'pc-hero');
    assert.doesNotMatch(html(), /data-deck-act="(sell-gear|equip)"/);
    assert.equal(panel.invoke('sell-gear', qing).reason, 'combat-deck-readonly');
    sessionState.status = 'idle';
    panel.invoke('select', 'pc-hero');
    assert.equal(panel.invoke('sell-gear', qing).ok, true);
    const r = await panel.invoke('sell-confirm');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual([r.price, tables.ledger.at(-1).type, tables.ledger.at(-1).payload], [price, 'sell', { gearId: qing }]);
    assert.deepEqual([d().points, d().gear.bag.length, panel.view().sell], [price, 0, null]);
    assert.match(html(), /背包是空的/);
    panel.close();
});

test('构筑面板：主角可花 200 积分重新生成基础卡组，积分不足置灰；点后在原处确认或取消，确认转发注入的 regenerateDeck 并重读；战斗进行中不显示', async () => {
    const calls = [];
    const h = await deckHarness({ regenerateDeck: async (opts) => { calls.push(opts); return { ok: true, id: 'pc-hero', cost: 200 }; } });
    h.panel.open(h.overlay);
    await until(() => h.panel.view().status === 'ready');
    h.panel.invoke('page', 'deck');
    assert.match(body(h), /data-deck-act="rebuild-open" aria-disabled="true">重新生成基础卡组（消耗200积分）</);
    assert.equal(h.panel.invoke('rebuild-open').reason, 'combat-points-insufficient');
    const read = h.ledger.effectiveState;
    h.ledger.effectiveState = async () => { const s = await read(); if (s.ok) s.characters.get('pc-hero').points = 300; return s; };
    await h.panel.reload();
    assert.doesNotMatch(body(h), /rebuild-open" aria-disabled/);
    assert.equal(h.panel.invoke('rebuild-open').ok, true);
    assert.match(body(h), /确认重新生成 · 200 积分/);
    assert.equal(h.panel.invoke('rebuild-cancel').ok, true);
    assert.doesNotMatch(body(h), /rebuild-confirm/);
    assert.equal(h.panel.invoke('rebuild-open').ok, true);
    const r = await h.panel.invoke('rebuild-confirm');
    assert.deepEqual([r.ok, calls.length, Boolean(calls[0] && 'signal' in calls[0]), h.panel.view().rebuild], [true, 1, true, false]);
    h.sessionState.status = 'battle';
    h.panel.invoke('select', 'pc-hero');
    assert.doesNotMatch(body(h), /rebuild-open/);
    assert.equal(h.panel.invoke('rebuild-open').reason, 'combat-deck-readonly');
    h.panel.close();
});

test('重新生成基础卡组服务：扩展关闭、没有主角卡组档案时直接拒绝，不请求副 LLM', async () => {
    const off = servicesHarness({ enabled: false });
    assert.equal((await off.services.regenerateDeck()).reason, 'combat-disabled');
    const on = servicesHarness();
    const r = await on.services.regenerateDeck();
    assert.equal(r.ok, false);
    assert.deepEqual([off.seen.length, on.seen.length], [0, 0]);
});


test('构筑面板：卡面只在点「生成卡面」时请求且只生成被点的卡；有图用图、无图回退线条图标，失败原因按卡显示；战斗中只读，关闭时退订', async () => {
    const calls = [];
    const art = new Map();
    const listeners = new Set();
    const notify = () => { for (const fn of [...listeners]) fn(); };
    const h = await deckHarness({
        getCardArt: (id) => art.get(id) || { url: '', pending: false, error: '' },
        generateCardArt: async (card) => {
            calls.push(card);
            art.set(card.cardId, { url: '', pending: false, error: 'NAI 请求失败' });
            notify();
            return { ok: false, reason: 'card-image-failed', error: 'NAI 请求失败' };
        },
        subscribeCardImages: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    });
    h.panel.open(h.overlay);
    await until(() => h.panel.view().status === 'ready');
    h.panel.invoke('page', 'deck');
    assert.deepEqual([listeners.size, calls.length], [1, 0]);
    assert.match(body(h), /data-deck-act="card-art" data-deck-id="k1">生成卡面</);
    assert.match(body(h), /class="igs-deck-art" aria-hidden="true"><svg/);
    assert.doesNotMatch(body(h), /<img /);
    const r = await h.panel.invoke('card-art', 'k1');
    assert.deepEqual([r.ok, calls.map((c) => [c.cardId, c.name])], [false, [['k1', '斩k1']]]);
    assert.match(calls[0].description, /攻击牌/);
    assert.match(body(h), /卡面：NAI 请求失败/);
    assert.match(body(h), /data-deck-id="k1">重试卡面</);
    assert.equal(h.panel.view().notice, '');
    art.set('k1', { url: 'data:image/png;base64,QUFB', pending: false, error: '' });
    notify();
    assert.match(body(h), /<img src="data:image\/png;base64,QUFB"/);
    assert.match(body(h), /data-deck-id="k1">重画卡面</);
    h.sessionState.status = 'battle';
    assert.equal((await h.panel.invoke('card-art', 'k1')).reason, 'combat-deck-readonly');
    assert.doesNotMatch(body(h), /data-deck-act="card-art"/);
    assert.equal(calls.length, 1);
    h.panel.close();
    assert.equal(listeners.size, 0);
});

test('人物状态面板装备栏（P7d）：有本聊天物品图时部位标签前显示小图，没有时形状不变；物品图更新经订阅重绘，关闭退订', async () => {
    const { gearIdFor } = await import('../src/combat/schema.js');
    const text = '得到宝剑。[igs-combat:equip|我|青锋剑|武器|削铁如泥|稀有]';
    const chat = [user('出发'), ai(text)];
    const tables = memoryTables([row(classDef, 1), row(heroDef, 2)]);
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7 });
    const tagHash = scanCombatTags(text)[0].tagHash;
    const anchor = { messageId: 1, swipeId: 0, tagHash, occurrence: 0 };
    await ledger.append([{ id: `equip|pc-hero|1|0|${tagHash}|0`, type: 'equip', character: 'pc-hero', anchor,
        payload: { gearId: gearIdFor('青锋剑'), name: '青锋剑', slot: 'weapon', description: '削铁如泥', rarity: 'rare' }, createdAt: 7 }]);
    const images = new Map();
    const listeners = new Set();
    const doc = { createElement: (tag) => new FakeEl(doc, tag), activeElement: null };
    const overlay = new FakeEl(doc, 'div');
    overlay.id = 'igs-overlay';
    const panel = createCombatDeckPanelController(doc, {
        getLedger: () => ledger, getSession: () => ({ state: () => ({ status: 'idle' }) }),
        resolveItemImage: (name) => images.get(name) || '',
        subscribeItemImages: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    });
    panel.open(overlay);
    await until(() => panel.view().status === 'ready');
    panel.invoke('page', 'gear');
    const html = () => overlay.querySelector('.igs-deck-body').innerHTML;
    assert.equal(listeners.size, 1);
    assert.match(html(), /武器 · 青锋剑/);
    assert.doesNotMatch(html(), /igs-deck-chip-art/);
    images.set('青锋剑', 'data:image/png;base64,QUFB');
    for (const fn of [...listeners]) fn();
    assert.match(html(), /<button type="button" class="igs-deck-chip-art" data-deck-zoom="青锋剑"[^>]*><img src="data:image\/png;base64,QUFB"/);
    panel.close();
    assert.equal(listeners.size, 0);
});



// 主角卡组预生成：服务层宿主聊天与主角名可切换；请求按顺序取回复（函数可抛出错误模拟上游拒绝），自动重试不等待。
function protagonistServices({ replies = [], enabled = true } = {}) {
    const api = fakeShujuku();
    const host = { chatId: 'chat-1', user: '主角', enabled };
    const seen = [];
    const request = async (req) => {
        const payload = JSON.parse(req.user);
        seen.push(payload);
        const next = replies[seen.length - 1];
        return typeof next === 'function' ? next(payload) : next;
    };
    const services = createCombatServices({
        global: { AutoCardUpdaterAPI: api, SillyTavern: { getContext: () => ({ chat: [] }) } },
        request, retryDelays: [0, 0], getReaderSettings: () => ({ combatExpansion: { enabled: host.enabled } }),
        getChatId: () => host.chatId, getUserName: () => host.user, getAutoIllustration: () => ({}),
    });
    return { api, host, seen, services, tables: createCombatTables({ api }) };
}

const heroDeckReply = (p) => JSON.stringify({ entities: p.entities.filter((e) => e.kind === 'profile-deck').map((e) => ({ key: e.key, value: {
    classRef: 'cls-blade', hp: 80, passive: ['意志', 'last-stand'], skill: ['闪光', 'quick'], cards: [['剑一', 'strike', 1], ['盾二', 'guard', 1], ['剑三', 'strike', 1], ['盾四', 'guard', 1]],
} })) });
const rejectWith = (status) => () => { throw secondaryLlmHttpError(status, 'openai'); };

test('主角卡组预生成：读表发现缺表时直接补建、不请求生成；建表后后台生成一次，HTTP 503 自动重试后写入并读回；已有档案不再请求', async () => {
    const heroId = profileIdFor('deck-character', '主角');
    const h = protagonistServices({ replies: [rejectWith(503), heroDeckReply] });
    h.host.user = '';
    const statuses = [];
    h.services.onProtagonistUpdated((p) => statuses.push(p?.status));
    assert.equal((await h.tables.read()).missing.length, 2);
    assert.equal((await h.services.getLedger().effectiveState()).ok, true);
    const read = await h.tables.read();
    assert.deepEqual([read.missing, read.optionalMissing, h.seen.length], [[], [], 0]);
    assert.deepEqual(await h.services.ensureTables(), { ok: true, created: [] });
    assert.equal((await h.tables.append('profile', [row(classDef, 1)])).ok, true);
    h.host.user = '主角';
    const first = await h.services.prepareProtagonist();
    assert.deepEqual([first.ok, first.status, h.seen.length], [true, 'ready', 2]);
    assert.deepEqual(statuses, ['generating', 'retrying', 'ready']);
    const state = await h.services.getLedger().effectiveState();
    assert.deepEqual([state.characters.get(heroId)?.kind, state.characters.get(heroId)?.classRef], ['deck-character', 'cls-blade']);
    assert.deepEqual(await h.services.prepareProtagonist(), { ok: true, status: 'ready' });
    assert.equal(h.seen.length, 2);
});

test('自动建表：并发读表只导入一次；建表失败按聊天记住原因、不反复导入，ensureTables 清掉记忆再试；换聊天另行补建；数据库未载入时不导入、载入后照常补建', async () => {
    const h = protagonistServices();
    h.host.user = '';
    const importOnce = h.api.importTemplateFromData;
    let failImport = true;
    let imports = 0;
    h.api.importTemplateFromData = async (template, options) => { imports += 1; return failImport ? { success: false, error: '当前聊天元数据尚未就绪' } : importOnce(template, options); };
    const ledger = h.services.getLedger();
    const [a, b] = await Promise.all([ledger.effectiveState(), ledger.effectiveState()]);
    assert.deepEqual([a.reason, b.reason, imports], ['combat-table-create-failed', 'combat-table-create-failed', 1]);
    assert.equal((await ledger.effectiveState()).reason, 'combat-table-create-failed');
    assert.equal(imports, 1);
    assert.equal((await h.services.ensureTables()).reason, 'combat-table-create-failed');
    assert.equal(imports, 2);
    failImport = false;
    h.host.chatId = 'chat-2';
    assert.equal((await ledger.effectiveState()).ok, true);
    assert.equal(imports, 3);
    assert.deepEqual(await h.services.ensureTables(), { ok: true, created: [] });

    const idle = protagonistServices();
    idle.host.user = '';
    const exportAll = idle.api.exportTableAsJson;
    const idleImport = idle.api.importTemplateFromData;
    let idleImports = 0;
    idle.api.importTemplateFromData = async (template, options) => { idleImports += 1; return idleImport(template, options); };
    // 没有聊天 ID 时面板「重试」同样不导入模板。
    const idleChat = idle.host.chatId;
    idle.host.chatId = '';
    assert.equal((await idle.services.ensureTables()).reason, 'combat-session-unavailable');
    assert.equal(idleImports, 0);
    idle.host.chatId = idleChat;
    idle.api.exportTableAsJson = () => ({});
    assert.equal((await idle.services.getLedger().effectiveState()).reason, 'combat-table-not-ready');
    assert.equal((await idle.services.ensureTables()).reason, 'combat-table-not-ready');
    assert.equal(idleImports, 0);
    idle.api.exportTableAsJson = exportAll;
    assert.equal((await idle.services.getLedger().effectiveState()).ok, true);
    assert.equal(idleImports, 1);
});

test('主角卡组预生成：请求失败且重试耗尽后不自动重发，手动重试才再请求；关闭扩展时不请求、不显示状态', async () => {
    const d = protagonistServices({ replies: [rejectWith(502), rejectWith(502), rejectWith(502), heroDeckReply] });
    assert.equal((await d.tables.ensure()).ok, true);
    assert.equal((await d.tables.append('profile', [row(classDef, 1)])).ok, true);
    const failed = await d.services.prepareProtagonist();
    assert.deepEqual([failed.ok, failed.reason, d.seen.length, d.services.getProtagonist()], [false, 'combat-llm-request-failed', 3, { status: 'failed', reason: 'combat-llm-request-failed', attempt: 0 }]);
    const held = await d.services.prepareProtagonist();
    assert.deepEqual([held.ok, held.status, d.seen.length], [false, 'failed', 3]);
    const manual = await d.services.prepareProtagonist({ manual: true });
    assert.deepEqual([manual.ok, manual.status, d.seen.length, d.services.getProtagonist().status], [true, 'ready', 4, 'ready']);

    const off = protagonistServices({ enabled: false });
    assert.deepEqual([await off.services.prepareProtagonist(), off.services.getProtagonist(), off.seen.length], [{ ok: false, reason: 'combat-disabled' }, null, 0]);
});

test('构筑面板：主角卡组失败显示原因与「重试」，自动重试中只显示状态；关闭时退订', async () => {
    let hero = { status: 'failed', reason: 'combat-llm-request-failed', attempt: 0 };
    const listeners = new Set();
    const calls = [];
    const h = await deckHarness({
        getProtagonist: () => hero,
        retryProtagonist: async () => { calls.push('retry'); hero = null; return { ok: true, status: 'ready' }; },
        onProtagonistUpdated: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    });
    h.panel.open(h.overlay);
    await until(() => h.panel.view().status === 'ready');
    assert.equal(listeners.size, 1);
    assert.match(body(h), /主角卡组/);
    assert.match(body(h), /副 LLM 请求失败/);
    assert.match(body(h), /data-deck-act="retry-protagonist"/);
    const r = await h.panel.invoke('retry-protagonist');
    assert.deepEqual([r.ok, calls], [true, ['retry']]);
    assert.doesNotMatch(body(h), /retry-protagonist/);
    hero = { status: 'retrying', reason: '', attempt: 1 };
    for (const fn of listeners) fn(hero);
    assert.match(body(h), /自动重试第 1 次/);
    assert.doesNotMatch(body(h), /retry-protagonist/);
    h.panel.close();
    assert.equal(listeners.size, 0);
});

test('人物状态面板：缺表自动补建未成时错误区给「重试」，经服务补建并重读；未注入 ensureTables 时只给重新读取', async () => {
    const calls = [];
    let h = null;
    let read = null;
    h = await deckHarness({ ensureTables: async () => { calls.push('tables'); h.tables.read = read; return { ok: true, created: ['profile', 'ledger'] }; } });
    read = h.tables.read;
    h.tables.read = () => ({ ...read(), missing: ['profile', 'ledger'] });
    h.panel.open(h.overlay);
    await until(() => h.panel.view().status === 'error');
    assert.equal(h.panel.view().reason, 'combat-table-missing');
    assert.match(body(h), /数据库中没有战斗表/);
    assert.match(body(h), /data-deck-act="retry-tables"/);
    assert.doesNotMatch(body(h), /data-deck-act="reload"/);
    const r = await h.panel.invoke('retry-tables');
    assert.deepEqual([r.ok, calls], [true, ['tables']]);
    await until(() => h.panel.view().status === 'ready');
    h.panel.close();

    const bare = await deckHarness();
    const bareRead = bare.tables.read;
    bare.tables.read = () => ({ ...bareRead(), missing: ['ledger'] });
    bare.panel.open(bare.overlay);
    await until(() => bare.panel.view().status === 'error');
    assert.doesNotMatch(body(bare), /retry-tables/);
    assert.match(body(bare), /data-deck-act="reload"/);
    bare.panel.close();
});

test('人物状态五页：默认状态页、页签切换；主角加点逐点分配，确认后写一条 alloc 并读回；缺属性表与战斗进行中不可编辑', async () => {
    const chat = [user('出发'), ai('他若有所悟。[igs-combat:stat|我|自由|2|顿悟]')];
    const tables = memoryTables([row(classDef, 1), row(heroDef, 2)]);
    tables.attribute = [];
    const read = tables.read;
    tables.read = () => ({ ...read(), attribute: clone(tables.attribute) });
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7 });
    assert.equal((await ledger.scan()).ok, true);
    const sessionState = { status: 'idle' };
    const doc = { createElement: (tag) => new FakeEl(doc, tag), activeElement: null };
    const overlay = new FakeEl(doc, 'div');
    overlay.id = 'igs-overlay';
    const panel = createCombatDeckPanelController(doc, { getLedger: () => ledger, getSession: () => ({ state: () => sessionState }) });
    const html = () => overlay.querySelector('.igs-deck-body').innerHTML;
    panel.open(overlay);
    await until(() => panel.view().status === 'ready');
    assert.equal(panel.view().page, 'status');
    assert.match(html(), /data-page="status"/);
    assert.equal(panel.invoke('page', 'nope').reason, 'combat-page-invalid');
    for (const p of ['gear', 'deck', 'collection', 'alloc']) assert.equal(panel.invoke('page', p).ok, true);
    assert.match(html(), /data-page="alloc"/);
    const a = () => panel.view().alloc;
    assert.deepEqual([a().protagonist, a().table, a().balance, a().left, a().editable], [true, 'ok', 2, 2, true]);
    const dex = a().rows.find((r) => r.key === 'dex').score;
    assert.match(html(), /data-deck-act="alloc-confirm" aria-disabled="true"/);
    assert.equal(panel.invoke('alloc-add', 'dex').ok, true);
    assert.equal(panel.invoke('alloc-add', 'dex').ok, true);
    assert.equal(panel.invoke('alloc-add', 'con').reason, 'combat-alloc-invalid');
    assert.equal(panel.invoke('alloc-remove', 'dex').ok, true);
    assert.equal(panel.invoke('alloc-add', 'con').ok, true);
    assert.deepEqual([a().left, a().dirty], [0, true]);
    assert.doesNotMatch(html(), /data-deck-act="alloc-confirm" aria-disabled/);
    const r = await panel.invoke('alloc-confirm');
    assert.equal(r.ok, true, JSON.stringify(r));
    const allocs = tables.attribute.filter((x) => x.type === 'alloc');
    assert.equal(allocs.length, 1);
    assert.deepEqual(allocs[0].payload.picks, [{ ability: 'dex', amount: 1 }, { ability: 'con', amount: 1 }]);
    await until(() => panel.view().alloc?.balance === 0);
    assert.deepEqual([a().rows.find((x) => x.key === 'dex').score, a().dirty, panel.view().page], [dex + 1, false, 'alloc']);
    sessionState.status = 'battle';
    panel.invoke('select', 'pc-hero');
    assert.match(html(), /战斗进行中 · 只读/);
    assert.equal(panel.invoke('alloc-add', 'str').reason, 'combat-deck-readonly');
    panel.close();

    const bare = await deckHarness();
    bare.panel.open(bare.overlay);
    await until(() => bare.panel.view().status === 'ready');
    bare.panel.invoke('page', 'alloc');
    assert.equal(bare.panel.view().alloc.table, 'missing');
    assert.match(body(bare), /属性表未创建/);
    assert.equal(bare.panel.invoke('alloc-add', 'dex').reason, 'combat-attribute-table-missing');
    bare.panel.close();
});


test('构筑面板：主角转职 / 职业升阶——积分或等级不足置灰；转职选定后确认，转发注入的 respecClass（新职业不带 classRef）；升阶确认转发 ascendClass；战斗进行中不显示', async () => {
    const calls = [];
    const h = await deckHarness({
        respecClass: async (opts) => { calls.push(['respec', opts]); return { ok: true }; },
        ascendClass: async (opts) => { calls.push(['ascend', opts]); return { ok: true }; },
    });
    h.panel.open(h.overlay);
    await until(() => h.panel.view().status === 'ready');
    h.panel.invoke('page', 'deck');
    assert.match(body(h), /data-deck-act="respec-open" aria-disabled="true">转职（消耗150积分）</);
    assert.match(body(h), /data-deck-act="ascend-open" aria-disabled="true">职业升阶（需 Lv5 · 消耗300积分）</);
    assert.equal(h.panel.invoke('respec-open').reason, 'combat-points-insufficient');
    assert.equal(h.panel.invoke('ascend-open').reason, 'combat-ascend-level-unreached');
    const read = h.ledger.effectiveState;
    let level = 1;
    h.ledger.effectiveState = async () => { const s = await read(); if (s.ok) Object.assign(s.characters.get('pc-hero'), { points: 400, level }); return s; };
    await h.panel.reload();
    assert.doesNotMatch(body(h), /respec-open" aria-disabled/);
    assert.match(body(h), /ascend-open" aria-disabled/);
    assert.equal(h.panel.invoke('respec-open').ok, true);
    assert.doesNotMatch(body(h), /respec-confirm/);
    assert.equal(h.panel.invoke('respec-pick', 'cls-blade').reason, 'combat-respec-same-class');
    assert.equal(h.panel.invoke('respec-pick', '').ok, true);
    assert.match(body(h), /确认转职 · 150 积分/);
    let r = await h.panel.invoke('respec-confirm');
    assert.deepEqual([r.ok, calls[0][0], 'classRef' in calls[0][1], 'signal' in calls[0][1], h.panel.view().respec], [true, 'respec', false, true, null]);
    level = 5;
    await h.panel.reload();
    assert.doesNotMatch(body(h), /ascend-open" aria-disabled/);
    assert.equal(h.panel.invoke('ascend-open').ok, true);
    assert.match(body(h), /确认升阶 · 300 积分/);
    assert.equal(h.panel.invoke('ascend-cancel').ok, true);
    assert.equal(h.panel.invoke('ascend-open').ok, true);
    r = await h.panel.invoke('ascend-confirm');
    assert.deepEqual([r.ok, calls[1][0], 'signal' in calls[1][1], h.panel.view().ascend], [true, 'ascend', true, false]);
    h.sessionState.status = 'battle';
    h.panel.invoke('select', 'pc-hero');
    assert.doesNotMatch(body(h), /respec-open|ascend-open/);
    assert.equal(h.panel.invoke('respec-open').reason, 'combat-deck-readonly');
    h.panel.close();
});

test('转职 / 升阶服务：扩展关闭、没有主角卡组档案时直接拒绝，不请求副 LLM', async () => {
    const off = servicesHarness({ enabled: false });
    assert.deepEqual([(await off.services.respecClass()).reason, (await off.services.ascendClass()).reason], ['combat-disabled', 'combat-disabled']);
    const on = servicesHarness();
    assert.deepEqual([(await on.services.respecClass()).ok, (await on.services.ascendClass()).ok], [false, false]);
    assert.deepEqual([off.seen.length, on.seen.length], [0, 0]);
});


test('构筑面板：主角抽人物特性——积分不足置灰；点后在原处确认或取消，确认转发注入的 drawTrait；已满时列出新特性，已装的可「替换」、新特性可「放弃」，转发 pickTrait 的 drop；有待定特性不能再抽；战斗进行中不显示', async () => {
    const calls = [];
    const h = await deckHarness({
        drawTrait: async (opts) => { calls.push(['draw', opts]); return { ok: true }; },
        pickTrait: async (opts) => { calls.push(['pick', opts]); return { ok: true }; },
    });
    const passive = (id) => ({ id: `${id}-p`, name: id, trigger: 'battle-start', effects: [{ op: 'block', amount: 6 }], description: '' });
    const trait = (traitId, rarity) => ({ traitId, name: `特性${traitId}`, origin: '自幼习武', rarity, passive: passive(traitId) });
    let extra = {};
    const read = h.ledger.effectiveState;
    h.ledger.effectiveState = async () => { const s = await read(); if (s.ok) Object.assign(s.characters.get('pc-hero'), extra); return s; };
    h.panel.open(h.overlay);
    await until(() => h.panel.view().status === 'ready');
    assert.match(body(h), /data-deck-act="trait-open" aria-disabled="true">抽人物特性（消耗100积分）</);
    assert.equal(h.panel.invoke('trait-open').reason, 'combat-points-insufficient');
    extra = { points: 100 };
    await h.panel.reload();
    assert.doesNotMatch(body(h), /trait-open" aria-disabled/);
    assert.equal(h.panel.invoke('trait-open').ok, true);
    assert.match(body(h), /确认抽取 · 100 积分/);
    assert.equal(h.panel.invoke('trait-cancel').ok, true);
    assert.doesNotMatch(body(h), /trait-confirm/);
    assert.equal(h.panel.invoke('trait-open').ok, true);
    let r = await h.panel.invoke('trait-confirm');
    assert.deepEqual([r.ok, calls[0][0], 'signal' in calls[0][1], h.panel.view().trait], [true, 'draw', true, false]);

    extra = { points: 100, traits: [trait('t1', 'rare'), trait('t2', 'common')], pendingTrait: trait('t3', 'epic') };
    await h.panel.reload();
    const html = body(h);
    assert.match(html, /新特性/);
    assert.match(html, /data-rarity="epic"/);
    assert.equal((html.match(/data-deck-act="trait-drop"/g) || []).length, 3);
    assert.doesNotMatch(html, /trait-open/);
    assert.equal(h.panel.invoke('trait-open').reason, 'combat-trait-pending');
    assert.equal((await h.panel.invoke('trait-drop', 'tz')).reason, 'combat-trait-pick-invalid');
    r = await h.panel.invoke('trait-drop', 't1');
    assert.deepEqual([r.ok, calls[1]], [true, ['pick', { drop: 't1' }]]);
    r = await h.panel.invoke('trait-drop', 't3');
    assert.deepEqual([r.ok, calls[2]], [true, ['pick', { drop: 't3' }]]);
    h.sessionState.status = 'battle';
    h.panel.invoke('select', 'pc-hero');
    assert.doesNotMatch(body(h), /trait-open|trait-drop/);
    assert.equal(h.panel.invoke('trait-open').reason, 'combat-deck-readonly');
    h.panel.close();
});

// 抽特性揭晓（P-f）夹具：drawTrait 挂起到 answer 才返回；extra 覆盖主角视图（积分、已装与待定特性）。
async function revealHarness() {
    const t = { still: false, answer: null, calls: [], extra: { points: 100 } };
    t.h = await deckHarness({
        drawTrait: (opts) => new Promise((res) => { t.calls.push(['draw', opts]); t.answer = res; }),
        pickTrait: async (opts) => { t.calls.push(['pick', opts]); return { ok: true }; },
        reducedMotion: () => t.still,
    });
    const read = t.h.ledger.effectiveState;
    t.h.ledger.effectiveState = async () => { const s = await read(); if (s.ok) Object.assign(s.characters.get('pc-hero'), t.extra); return s; };
    t.h.panel.open(t.h.overlay);
    await until(() => t.h.panel.view().status === 'ready');
    // 点抽取并确认，记下蓄力时的画面；生成返回前换上写入后的视图，返回 [蓄力, 结果, 翻开后]。
    t.draw = async (made, after) => {
        t.h.panel.invoke('trait-open');
        const p = t.h.panel.invoke('trait-confirm');
        const charging = body(t.h);
        t.extra = after;
        t.answer(made);
        return [charging, await p, body(t.h)];
    };
    return t;
}
const revealTrait = (traitId, rarity) => ({ traitId, name: `特性${traitId}`, origin: '自幼习武', rarity,
    passive: { id: `${traitId}-p`, name: traitId, trigger: 'battle-start', effects: [{ op: 'block', amount: 6 }], description: '' } });

test('抽特性揭晓（P-f）：蓄力按预定稀有度上色；翻开写名称与来历，神话第一次画出带闪白、重绘不重播；「确定」关闭；减少动态效果直出结果', async () => {
    const { planTrait, traitSeed } = await import('../src/combat/traits.js');
    const t = await revealHarness();
    const rarity = planTrait(traitSeed('pc-hero', 0)).rarity;
    let [charging, r, html] = await t.draw({ ok: true, trait: revealTrait('t9', 'mythic') }, { points: 0, traits: [revealTrait('t9', 'mythic')] });
    assert.match(charging, new RegExp(`data-phase="charge" data-rarity="${rarity}" aria-busy="true"[\\s\\S]*生成中`));
    assert.deepEqual([r.ok, t.calls[0][0], 'signal' in t.calls[0][1]], [true, 'draw', true]);
    assert.match(html, /data-phase="open" data-rarity="mythic" data-fresh[\s\S]*特性t9[\s\S]*自幼习武[\s\S]*data-deck-act="trait-done"[\s\S]*igs-deck-reveal-flash/);
    await t.h.panel.reload();
    assert.match(body(t.h), /data-phase="open"/);
    assert.doesNotMatch(body(t.h), /data-fresh|igs-deck-reveal-flash/);
    assert.equal(t.h.panel.invoke('trait-done').ok, true);
    assert.doesNotMatch(body(t.h), /igs-deck-reveal/);
    t.still = true;
    t.extra = { points: 100, traits: [revealTrait('t9', 'mythic')] };
    await t.h.panel.reload();
    [charging, r, html] = await t.draw({ ok: true, trait: revealTrait('t8', 'mythic') }, { points: 0, traits: [revealTrait('t9', 'mythic'), revealTrait('t8', 'mythic')] });
    assert.match(charging, /data-phase="charge"[^>]*data-still/);
    assert.match(html, /data-phase="open" data-rarity="mythic" data-still/);
    assert.doesNotMatch(html, /data-fresh|igs-deck-reveal-flash/);
    t.h.panel.close();
});


test('抽特性揭晓（P-f）：已满时下方并排已装的两个特性，点一个替换或放弃新特性，成功后关闭揭晓；生成失败不翻开、提示原因', async () => {
    const t = await revealHarness();
    const full = [revealTrait('t1', 'rare'), revealTrait('t2', 'common')];
    t.extra = { points: 100, traits: full };
    await t.h.panel.reload();
    let [, r, html] = await t.draw({ ok: true, trait: revealTrait('t3', 'epic'), pending: true }, { points: 0, traits: full, pendingTrait: revealTrait('t3', 'epic') });
    assert.equal(r.ok, true);
    assert.match(html, /data-phase="open" data-rarity="epic" data-fresh/);
    assert.equal((html.match(/class="igs-deck-reveal-slot"/g) || []).length, 2);
    assert.equal((html.match(/data-deck-act="trait-drop"/g) || []).length, 3);
    assert.doesNotMatch(html, /trait-done/);
    t.extra = { points: 0, traits: [revealTrait('t3', 'epic'), revealTrait('t2', 'common')] };
    r = await t.h.panel.invoke('trait-drop', 't1');
    assert.deepEqual([r.ok, t.calls.at(-1)], [true, ['pick', { drop: 't1' }]]);
    assert.doesNotMatch(body(t.h), /igs-deck-reveal/);
    t.extra = { points: 100, traits: [revealTrait('t3', 'epic'), revealTrait('t2', 'common')] };
    await t.h.panel.reload();
    [, r, html] = await t.draw({ ok: false, reason: 'combat-trait-generation-failed' }, t.extra);
    assert.equal(r.ok, false);
    assert.match(html, /人物特性生成失败/);
    assert.doesNotMatch(html, /igs-deck-reveal/);
    t.h.panel.close();
});


test('人物特性服务：扩展关闭直接拒绝；积分不足与没有待定特性时不请求副 LLM、不写表', async () => {
    const off = servicesHarness({ enabled: false });
    assert.deepEqual([(await off.services.drawTrait()).reason, (await off.services.pickTrait({ drop: 'x' })).reason], ['combat-disabled', 'combat-disabled']);
    const on = servicesHarness();
    assert.equal((await on.tables.ensure()).ok, true);
    assert.equal((await on.tables.append('profile', [row(classDef, 1), row(heroDef, 2)])).ok, true);
    assert.equal((await on.services.drawTrait()).reason, 'combat-points-insufficient');
    assert.equal((await on.services.pickTrait({ drop: 'x' })).reason, 'combat-trait-pick-invalid');
    assert.deepEqual([off.seen.length, on.seen.length], [0, 0]);
});


test('人物状态面板 · 只开数值系统（P8c）：手动建档时可打开、只列待建档角色并定位；确认建档写 init 后重读；不是手动建档时拒绝打开', async () => {
    const doc = { createElement: (tag) => new FakeEl(doc, tag), activeElement: null };
    const overlay = new FakeEl(doc, 'div');
    overlay.id = 'igs-overlay';
    let mode = 'manual';
    const written = [];
    const attr = { initialized: false, table: 'ok', role: 'warrior', className: '' };
    const panel = createCombatDeckPanelController(doc, {
        getLedger: () => null,
        buildMode: () => mode,
        buildEntry: () => mode === 'manual',
        writeManualInit: async (name, raw) => { written.push([name, raw]); return { ok: true }; },
        getBuildCandidates: async () => ({ ok: true, list: [{ name: '阿明', protagonist: true, attributes: attr }, { name: '小雪', protagonist: false, attributes: attr }]
            .filter((c) => !written.some(([n]) => n === c.name)) }),
    });
    const html = () => overlay.querySelector('.igs-deck-body').innerHTML;
    assert.equal(panel.open(overlay, { build: '小雪' }).ok, true);
    await until(() => panel.view()?.status === 'ready');
    assert.equal(panel.view().selectedBuild, '小雪');
    assert.deepEqual(panel.view().builds.map((b) => b.name), ['阿明', '小雪']);
    assert.match(html(), /data-deck-act="select-build"/);
    assert.match(html(), /剩余 24 点 · 总分 48\/72/);
    assert.doesNotMatch(html(), /data-deck-act="page"/);
    assert.equal(panel.invoke('manual-add', 'str').ok, true);
    assert.equal(panel.invoke('manual-role', 'mage').ok, true);
    const r = await panel.invoke('manual-confirm');
    assert.equal(r.ok, true);
    assert.equal(written[0][0], '小雪');
    assert.deepEqual([written[0][1].role, written[0][1].scores.str], ['mage', 9]);
    assert.deepEqual(panel.view().builds.map((b) => b.name), ['阿明']);
    assert.equal(panel.view().selectedBuild, '阿明');
    panel.close();
    mode = 'auto';
    assert.equal(panel.open(overlay).reason, 'combat-disabled');
});
