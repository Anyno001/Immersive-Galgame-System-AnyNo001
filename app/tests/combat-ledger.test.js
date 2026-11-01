import test from 'node:test';
import assert from 'node:assert/strict';
import { REWARD_TAG_HASH, attributeViewFor, computeEffectiveState, createCombatLedger, indexProfiles, nameKey, normalizeSnapshot } from '../src/combat/ledger.js';
import { expProgress } from '../src/combat/rules.js';
import { asiCountAt, isAsiLevel } from '../src/combat/abilities.js';
import { createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { assembleReward } from '../src/combat/generation-assembly.js';
import { ledgerEntryId, normalizeLedgerEntry } from '../src/combat/schema.js';
import { attachLoot, reportIdFor } from '../src/combat/report.js';
import { KEEPSAKE_PRICES, SELL_PRICE_SPREAD, sellPrice } from '../src/combat/points.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const attack = (id, amount = 6) => ({ id, name: `斩${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount }] });
const guard = (id) => ({ id, name: `守${id}`, type: 'skill', cost: 1, rarity: 'common', effects: [{ op: 'block', amount: 5 }] });
const STARTER = [
    'basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend',
    'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'm1', 'm1', 'm2', 'm2',
];
const classDef = (id, prefix = 'c') => ({
    kind: 'class', id, className: '剑士', archetype: 'warrior',
    classPassive: { id: `p-${id}`, name: '锋锐', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }] },
    classPool: [1, 2, 5, 6].map((n) => attack(`${prefix}${n}`)).concat([3, 4, 7, 8].map((n) => guard(`${prefix}${n}`))),
});
const heroDef = (id = 'pc-hero', name = '主角', classRef = 'cls-blade') => ({
    kind: 'deck-character', id, name, classRef, base: { hp: 80 },
    personalPassive: { id: `pp-${id}`, name: '意志', trigger: 'on-low-hp', effects: [{ op: 'block', amount: 6 }] },
    personalPool: [attack('m1'), guard('m2'), attack('m3'), guard('m4')],
    starterDeck: [...STARTER],
});
const row = (def, createdAt) => ({ id: def.id, name: def.name || def.className, kind: def.kind, className: def.className || '', version: 1, createdAt, definition: def });
const ai = (mes, swipe_id = 0) => ({ mes, swipe_id, is_user: false });
const user = (mes) => ({ mes, is_user: true });
const report = (result, body) => `<igs-combat-report result="${result}">${body}</igs-combat-report>`;
const codes = (s) => s.diagnostics.map((d) => d.code);

// 内存版战斗表：read 形状与 combat-tables.read() 一致，append 按记录 ID 幂等。
function memoryTables(profile = []) {
    const t = { profile: [...profile], ledger: [], appends: 0, failRead: false, missing: [] };
    t.read = () => (t.failRead
        ? { ok: false, reason: 'combat-table-read-failed', detail: 'boom' }
        : { ok: true, missing: [...t.missing], diagnostics: [], profile: clone(t.profile), ledger: clone(t.ledger) });
    t.append = async (kind, records) => {
        t.appends += 1;
        const written = [];
        for (const r of records) if (!t[kind].some((x) => x.id === r.id)) { t[kind].push(clone(r)); written.push(r.id); }
        return { ok: true, written, present: [], rejected: [], pending: [] };
    };
    return t;
}

const baseProfiles = () => [row(classDef('cls-blade'), 1), row(heroDef(), 2)];

function setup(profiles = baseProfiles(), initial = []) {
    const tables = memoryTables(profiles);
    const ref = { chat: initial };
    const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '主角', now: () => 7 });
    return { tables, ref, ledger };
}

const EXP_TAG = '[igs-combat:exp|我|30|练剑]';
const hero = (s) => s.characters.get('pc-hero');

test('锚点有效时计入 EXP；换 swipe 失效、切回恢复；删标签或删楼失效', async () => {
    const { ref, ledger, tables } = setup(undefined, [user('出发'), ai(`你挥剑百次。${EXP_TAG}`)]);
    const scanned = await ledger.scan({ messageIds: [1] });
    assert.equal(scanned.ok, true);
    assert.equal(tables.ledger.length, 1);
    assert.equal(tables.ledger[0].character, 'pc-hero');
    assert.equal(hero(await ledger.effectiveState()).exp, 30);

    ref.chat = [user('出发'), ai('另一个版本。', 1)];
    const swiped = await ledger.effectiveState();
    assert.equal(hero(swiped).exp, 0);
    assert.deepEqual(swiped.inactive.map((x) => x.reason), ['swipe-changed']);

    ref.chat = [user('出发'), ai(`你挥剑百次。${EXP_TAG}`)];
    assert.equal(hero(await ledger.effectiveState()).exp, 30);

    ref.chat = [user('出发'), ai('你挥剑百次。')];
    assert.deepEqual((await ledger.effectiveState()).inactive.map((x) => x.reason), ['tag-missing']);
    ref.chat = [user('出发')];
    assert.deepEqual((await ledger.effectiveState()).inactive.map((x) => x.reason), ['message-missing']);
});

test('回溯分支换了 chatId 但楼层内容相同，锚点仍然有效', async () => {
    const chat = [user('出发'), ai(`你挥剑百次。${EXP_TAG}`)];
    const { ledger, tables } = setup(undefined, chat);
    await ledger.scan();
    const branchTables = memoryTables();
    branchTables.profile = clone(tables.profile);
    branchTables.ledger = clone(tables.ledger);
    const branch = createCombatLedger({ tables: branchTables, chat: clone(chat), userName: '主角' });
    assert.equal(hero(await branch.effectiveState()).exp, 30);
});

test('重复扫描不重复写入；无档案角色先以名字键记账，登记档案后归并且不再重写', async () => {
    const chat = [ai(`${EXP_TAG}爱丽丝也有所领悟。[igs-combat:exp|爱丽丝|20|旁观]`), user('普通输入 [igs-combat:exp|我|40|作弊]')];
    const { ledger, tables } = setup(undefined, chat);
    await ledger.scan();
    assert.equal(tables.appends, 1);
    assert.equal(tables.ledger.length, 2);
    const again = await ledger.scan();
    assert.deepEqual([again.ok, again.entries.length, again.write, tables.appends], [true, 0, null, 1]);
    const before = await ledger.effectiveState();
    assert.equal(before.unassignedExp.get(nameKey('爱丽丝')), 20);
    assert.equal(hero(before).exp, 30);

    const skill = (id, effects, intent = 'attack') => ({ id, name: `技${id}`, intent, effects });
    tables.profile.push(row({
        kind: 'skill-character', id: 'sc-alice', name: '爱丽丝', base: { hp: 50 },
        skills: [skill('s1', [{ op: 'damage', amount: 5 }]), skill('s2', [{ op: 'block', amount: 5 }], 'defend'), skill('s3', [{ op: 'damage', amount: 4 }])],
        passives: [{ id: 'pa1', name: '坚守', trigger: 'turn-start', effects: [{ op: 'block', amount: 2 }] }],
    }, 5));
    const rescan = await ledger.scan();
    assert.deepEqual([rescan.entries.length, tables.appends], [0, 1]);
    const after = await ledger.effectiveState();
    assert.equal(after.characters.get('sc-alice').exp, 20);
    assert.equal(after.unassignedExp.size, 0);
});

test('剧情 EXP 每楼封顶；胜利战报不封顶并产生待领奖励，失败战报不产生 EXP', async () => {
    const story = ai('[igs-combat:exp|我|30|甲][igs-combat:exp|我|30|乙]');
    const win = user(report('win', '[igs-combat:exp|我|45|击败狼群]'));
    const { ref, ledger, tables } = setup(undefined, [story, win]);
    await ledger.scan();
    let s = await ledger.effectiveState();
    assert.equal(hero(s).exp, 95);
    assert.deepEqual([hero(s).level, hero(s).pendingRewards], [2, [2]]);

    const anchor = { messageId: 1, swipeId: 0, tagHash: 'reward', occurrence: 0 };
    const reward = { id: `reward|pc-hero|1|0|reward|0`, type: 'reward', character: 'pc-hero', anchor, payload: { level: 2, choice: { kind: 'upgrade', targetId: 'basic-strike' } }, createdAt: 8 };
    assert.equal((await ledger.append([reward])).ok, true);
    s = await ledger.effectiveState();
    assert.deepEqual(hero(s).pendingRewards, []);
    assert.equal(hero(s).deckEntries.filter((e) => e.upgraded).length, 1);
    assert.equal(hero(s).hpMax, 84);

    const lose = user(report('lose', '[igs-combat:exp|我|45|苦战]'));
    ref.chat = [story, lose];
    const lost = await ledger.scan();
    assert.equal(lost.entries.length, 0);
    assert.ok(lost.diagnostics.some((d) => d.code === 'combat-defeat-no-exp'));
    s = await ledger.effectiveState();
    assert.equal(hero(s).exp, 50);
    assert.ok(s.inactive.some((x) => x.reason === 'tag-missing'));
    assert.ok(tables.ledger.every((e) => e.payload.reason !== '苦战'));
});

test('learn / upgrade / class 标签只进入待生成队列，不伪造条目', async () => {
    const { ledger, tables } = setup(undefined, [ai('他悟出新招。[igs-combat:learn|我|裂空斩|一刀两断]')]);
    const scanned = await ledger.scan();
    assert.deepEqual([scanned.entries.length, tables.appends], [0, 0]);
    assert.equal(scanned.pendingGeneration.length, 1);
    const [p] = scanned.pendingGeneration;
    assert.deepEqual([p.kind, p.characterId, p.skill, p.anchor.messageId], ['learn', 'pc-hero', '裂空斩', 0]);
});

test('同名职业以先登记者为准，后登记的职业档案被引用时改用先登记者', async () => {
    const profiles = [...baseProfiles(), row(classDef('cls-blade2', 'd'), 3), row(heroDef('pc-bob', '鲍勃', 'cls-blade2'), 4)];
    const { ledger } = setup(profiles, [ai('平静的一天。')]);
    const s = await ledger.effectiveState();
    assert.deepEqual([...s.classes.keys()], ['cls-blade']);
    assert.equal(s.characters.get('pc-bob').classRef, 'cls-blade');
    assert.ok(codes(s).includes('combat-class-duplicate'));
    const diagnostics = [];
    const index = indexProfiles(normalizeSnapshot({ ok: true, profile: profiles, ledger: [] }).profiles, diagnostics);
    assert.equal(index.classAlias.get('cls-blade2'), 'cls-blade');
});

test('卡组失效回退到上一份；卡组里已不拥有的卡被剔除并标记需调整', async () => {
    const learnText = '他悟出新招。[igs-combat:learn|我|裂空斩|一刀]';
    const chat = [user('出发'), ai(learnText), user('继续'), ai('平静的一天。')];
    const { ref, ledger } = setup(undefined, chat);
    const tagHash = (await import('../src/scene/combat-directives.js')).scanCombatTags(learnText)[0].tagHash;
    const anchor = { messageId: 1, swipeId: 0, tagHash, occurrence: 0 };
    assert.equal((await ledger.append([{ id: `learn|pc-hero|1|0|${tagHash}|0`, type: 'learn', character: 'pc-hero', anchor, payload: { card: attack('k1') }, createdAt: 7 }])).ok, true);

    const deckA = [...STARTER.slice(1), 'k1'];
    assert.equal((await ledger.saveDeck('pc-hero', deckA)).ok, true);
    let s = await ledger.effectiveState();
    assert.deepEqual([hero(s).deck, hero(s).deckNeedsAdjust], [deckA, false]);

    ref.chat = [...chat, user('再走'), ai('又一天。')];
    const deckB = [...STARTER.slice(0, 19), 'k1'];
    const savedB = await ledger.saveDeck('pc-hero', deckB);
    assert.deepEqual([savedB.ok, savedB.entry.anchor.messageId, savedB.entry.payload.revision], [true, 5, 2]);
    assert.deepEqual(hero(await ledger.effectiveState()).deck, deckB);

    ref.chat = [...chat, user('再走'), ai('另一天。', 1)];
    assert.deepEqual(hero(await ledger.effectiveState()).deck, deckA);

    ref.chat = [user('出发'), ai('另一种领悟。', 1), user('继续'), ai('平静的一天。')];
    s = await ledger.effectiveState();
    assert.equal(hero(s).deck.includes('k1'), false);
    assert.equal(hero(s).deck.length, 19);
    assert.equal(hero(s).deckNeedsAdjust, true);
    assert.ok(codes(s).includes('combat-deck-adjusted'));
});

test('revoke 让目标条目失效，不做物理删除', async () => {
    const { ledger, tables } = setup(undefined, [ai(EXP_TAG)]);
    await ledger.scan();
    const target = tables.ledger[0].id;
    await ledger.append([{ id: 'revoke|pc-hero|1', type: 'revoke', character: 'pc-hero', anchor: null, payload: { targetEntryId: target, reason: '手动作废' }, createdAt: 9 }]);
    const s = await ledger.effectiveState();
    assert.equal(hero(s).exp, 0);
    assert.deepEqual(s.inactive, [{ id: target, reason: 'revoked' }]);
    assert.equal(tables.ledger.length, 2);
});

test('读取失败、缺表或读取抛错时返回错误而不是空状态，也不写入', async () => {
    const { ledger, tables } = setup(undefined, [ai(EXP_TAG)]);
    tables.failRead = true;
    const failed = await ledger.effectiveState();
    assert.deepEqual([failed.ok, failed.reason, failed.characters], [false, 'combat-table-read-failed', undefined]);
    assert.equal((await ledger.scan()).ok, false);
    assert.equal((await ledger.saveDeck('pc-hero', STARTER)).ok, false);
    tables.failRead = false;
    tables.missing = ['ledger'];
    assert.equal((await ledger.effectiveState()).reason, 'combat-table-missing');
    tables.read = () => { throw new Error('boom'); };
    assert.equal((await ledger.effectiveState()).reason, 'combat-ledger-read-failed');
    assert.equal(tables.appends, 0);
    assert.deepEqual(computeEffectiveState(undefined, []), { ok: false, reason: 'combat-ledger-read-failed' });
});

test('非法条目不写入；与真实 combat-tables 适配器联通时读写形状一致', async () => {
    const api = fakeShujuku();
    const tables = createCombatTables({ api });
    assert.equal((await tables.ensure()).ok, true);
    assert.equal((await tables.append('profile', baseProfiles())).ok, true);
    const ledger = createCombatLedger({ tables, chat: [ai(EXP_TAG)], userName: '主角', now: () => 3 });
    const bad = await ledger.append([{ id: 'x', type: 'exp', character: 'pc-hero', anchor: null, payload: { amount: 0 }, createdAt: 1 }]);
    assert.deepEqual([bad.ok, bad.rejected[0].reason], [false, 'combat-entry-invalid']);
    assert.equal((await ledger.scan()).ok, true);
    assert.equal((await ledger.scan()).entries.length, 0);
    const s = await ledger.effectiveState();
    assert.deepEqual([s.ok, hero(s).exp, s.diagnostics], [true, 30, []]);
});
test('领取升级奖励：未达等级拒绝；达到后写一条 reward 并读回；重复领取、非法选项、读写失败都不伪造成功', async () => {
    const story = ai('[igs-combat:exp|我|30|甲]');
    const win = user(report('win', '[igs-combat:exp|我|45|击败狼群]'));

    const early = setup(undefined, [story]);
    await early.ledger.scan();
    const before = early.tables.appends;
    assert.deepEqual(await early.ledger.claimReward('pc-hero', 2, { kind: 'skip' }), { ok: false, reason: 'combat-reward-unavailable' });
    assert.equal(early.tables.appends, before);

    const { ledger, tables } = setup(undefined, [story, win]);
    await ledger.scan();
    const bad = await ledger.claimReward('pc-hero', 2, { kind: 'bogus' });
    assert.deepEqual([bad.ok, bad.reason], [false, 'combat-entry-invalid']);
    const appendsBefore = tables.appends;
    const claimed = await ledger.claimReward('pc-hero', 2, { kind: 'card', cardId: 'm3' });
    assert.equal(claimed.ok, true);
    assert.equal(tables.appends, appendsBefore + 1);
    assert.deepEqual([claimed.entry.type, claimed.entry.anchor.tagHash, claimed.entry.anchor.messageId, claimed.entry.payload], ['reward', REWARD_TAG_HASH, 1, { level: 2, choice: { kind: 'card', cardId: 'm3' } }]);
    const s = await ledger.effectiveState();
    assert.deepEqual(hero(s).pendingRewards, []);
    assert.deepEqual(hero(s).claimedLevels, [2]);
    assert.equal(tables.ledger.filter((e) => e.type === 'reward').length, 1);

    assert.deepEqual(await ledger.claimReward('pc-hero', 2, { kind: 'skip' }), { ok: false, reason: 'combat-reward-unavailable' });
    assert.equal(tables.ledger.filter((e) => e.type === 'reward').length, 1);

    const failing = setup(undefined, [story, win]);
    await failing.ledger.scan();
    failing.tables.append = async () => ({ ok: false, reason: 'combat-ledger-insert-failed', written: [], present: [], rejected: [], pending: [{}] });
    const writeFail = await failing.ledger.claimReward('pc-hero', 2, { kind: 'skip' });
    assert.deepEqual([writeFail.ok, writeFail.reason], [false, 'combat-ledger-insert-failed']);
    failing.tables.failRead = true;
    assert.deepEqual((await failing.ledger.claimReward('pc-hero', 2, { kind: 'skip' })).reason, 'combat-table-read-failed');
});

test('稀有度回放：神话卡收藏可重复、入组限一张；旧 rare 起始卡保留，读取不写回', async () => {
    const cls = classDef('cls-blade');
    cls.classPool.find((c) => c.id === 'c1').rarity = 'rare';
    Object.assign(cls.classPool.find((c) => c.id === 'c5'), { rarity: 'mythic', effects: [{ op: 'damage', amount: 8 }] });
    const { ledger, tables } = setup([row(cls, 1), row(heroDef(), 2)], [user(report('win', '[igs-combat:exp|我|500|战斗]'))]);
    const original = clone(tables.profile);
    const before = await ledger.effectiveState();
    assert.deepEqual(hero(before).deck, STARTER);
    assert.equal(hero(before).catalog.get('c1').rarity, 'rare');
    assert.equal(hero(before).deckNeedsAdjust, false);
    assert.equal(tables.appends, 0);
    await ledger.scan();
    for (const level of [2, 3]) assert.equal((await ledger.claimReward('pc-hero', level, { kind: 'card', cardId: 'c5' })).ok, true);
    const gained = hero(await ledger.effectiveState());
    assert.equal(gained.owned.get('c5'), 2);
    assert.equal(gained.deck.filter((id) => id === 'c5').length, 1);
    assert.equal(gained.deckNeedsAdjust, false);
    const saved = await ledger.saveDeck('pc-hero', [...gained.deck, 'c5']);
    assert.equal(saved.ok, true);
    const stored = clone(tables.ledger);
    const writes = tables.appends;
    const replay = await ledger.effectiveState();
    assert.equal(hero(replay).deck.filter((id) => id === 'c5').length, 1);
    assert.equal(hero(replay).deckNeedsAdjust, true);
    assert.ok(codes(replay).includes('combat-deck-adjusted'));
    assert.deepEqual(tables.profile, original);
    assert.deepEqual(tables.ledger, stored);
    assert.equal(tables.appends, writes);
});

test('超限存档起始卡组只标记需调整，不重算稀有度或改写原卡组', async () => {
    const cls = classDef('cls-blade');
    Object.assign(cls.classPool.find((c) => c.id === 'c1'), { rarity: 'mythic', effects: [{ op: 'damage', amount: 8 }] });
    const { ledger, tables } = setup([row(cls, 1), row(heroDef(), 2)], [ai('继续')]);
    const original = clone(tables.profile);
    const view = hero(await ledger.effectiveState());
    assert.deepEqual(view.deck, STARTER);
    assert.equal(view.catalog.get('c1').rarity, 'mythic');
    assert.ok(view.deckErrors.some((e) => e.cardId === 'c1' && e.reason === 'copy-limit' && e.detail.limit === 1));
    assert.equal(view.deckNeedsAdjust, true);
    assert.deepEqual(tables.profile, original);
    assert.equal(tables.appends, 0);
});


test('同名时卡组档案优先：技能档案让位但保留，其 EXP 读取时并入卡组档案、不改表；重扫不重复写；换 swipe 仍按锚点回退', async () => {
    const skill = (id, effects, intent = 'attack') => ({ id, name: `技${id}`, intent, effects });
    const aliceSkill = row({
        kind: 'skill-character', id: 'sc-alice', name: '爱丽丝', base: { hp: 50 },
        skills: [skill('s1', [{ op: 'damage', amount: 5 }]), skill('s2', [{ op: 'block', amount: 5 }], 'defend'), skill('s3', [{ op: 'damage', amount: 4 }])],
        passives: [{ id: 'pa1', name: '坚守', trigger: 'turn-start', effects: [{ op: 'block', amount: 2 }] }],
    }, 3);
    const { ledger, tables, ref } = setup([...baseProfiles(), aliceSkill], [ai('[igs-combat:exp|爱丽丝|20|旁观]')]);
    await ledger.scan();
    assert.deepEqual(tables.ledger.map((e) => e.character), ['sc-alice']);

    tables.profile.push(row(heroDef('pc-alice', '爱丽丝'), 10));
    const s = await ledger.effectiveState();
    assert.equal(s.characters.has('sc-alice'), false);
    assert.equal(s.characters.get('pc-alice').exp, 20);
    assert.ok(s.diagnostics.some((d) => d.code === 'combat-profile-superseded' && d.id === 'sc-alice' && d.kept === 'pc-alice'));

    const appends = tables.appends;
    assert.equal((await ledger.scan()).entries.length, 0);
    assert.equal(tables.appends, appends);
    assert.equal(tables.profile.filter((p) => p.id === 'sc-alice').length, 1);

    ref.chat = [ai('另一个版本。', 1)];
    assert.equal((await ledger.effectiveState()).characters.get('pc-alice').exp, 0);
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


test('专属卡：同名 learn 直接解锁、再次出现转为精进，伪造专属卡与奖励选取被拒；强度档放大技能角色并追加优先使用的绝招', async () => {
    const { growthEntity, templateEnemy } = await import('../src/combat/generation.js');
    const { rewardChoices } = await import('../src/visual/igs-ui/combat-panel-model.js');
    const { buildSetup } = await import('../src/combat/session.js');
    const { createBattle } = await import('../src/combat/engine.js');
    const { chooseSkillIntent } = await import('../src/combat/policy.js');
    const { ledgerEntryId } = await import('../src/combat/schema.js');
    const sig = { id: 'g1', name: '天翔一闪', type: 'attack', cost: 2, rarity: 'signature', effects: [{ op: 'damage', amount: 14 }], upgraded: { effects: [{ op: 'damage', amount: 17 }] } };
    const skill = (id, amount) => ({ id, name: `技${id}`, intent: 'attack', effects: [{ op: 'damage', amount }] });
    const ace = { kind: 'skill-character', id: 'sc-ace', name: '白露', tier: 'ace', base: { hp: 50 },
        skills: [skill('s1', 10), skill('s2', 6), { id: 's3', name: '守', intent: 'defend', effects: [{ op: 'block', amount: 6 }] }],
        passives: [{ id: 'pa1', name: '守夜', trigger: 'turn-start', effects: [{ op: 'block', amount: 2 }] }] };
    const { ref, ledger } = setup([row(classDef('cls-blade'), 1), row({ ...heroDef(), signatureCards: [sig] }, 2), row(ace, 3)],
        [user('出发'), ai('剑光乍起。\n[igs-combat:learn|我|天翔一闪|拔刀即斩]')]);
    const pendingOf = async () => (await ledger.scan()).pendingGeneration;
    const viewOf = async () => hero(await ledger.effectiveState());

    const before = await viewOf();
    assert.equal(before.catalog.has('g1'), false);
    const learn = growthEntity((await pendingOf()).find((p) => p.kind === 'learn'), before, { now: 2 });
    assert.equal(learn.entity, undefined);
    assert.deepEqual([learn.entry.type, learn.entry.payload.card.id], ['learn', 'g1']);
    assert.equal((await ledger.append([learn.entry])).ok, true);

    const unlocked = await viewOf();
    assert.equal(unlocked.owned.get('g1'), 1);
    assert.ok(unlocked.deck.includes('g1'));
    const offer = rewardChoices({ ...unlocked, pendingRewards: [2] }, 2, 'seed');
    assert.equal(offer.cards.some((c) => c.cardId === 'g1'), false);
    assert.equal(offer.upgrades.some((u) => u.targetId === 'g1'), false);
    const other = growthEntity({ kind: 'upgrade', character: '我', skill: '别的招式', anchor: learn.entry.anchor }, unlocked);
    assert.equal(other.entity.input.candidates.some((c) => c.id === 'g1'), false);

    ref.chat = [...ref.chat, user('再来'), ai('刀势更快。\n[igs-combat:upgrade|我|天翔 一闪|更快的拔刀]')];
    const pending1 = await pendingOf();
    assert.equal(pending1.some((p) => p.kind === 'learn'), false);
    const upgrade = growthEntity(pending1.find((p) => p.kind === 'upgrade'), unlocked, { now: 3 });
    assert.deepEqual([upgrade.entry.type, upgrade.entry.payload.targetId], ['upgrade', 'g1']);
    assert.equal((await ledger.append([upgrade.entry])).ok, true);
    const upgraded = await viewOf();
    assert.equal(upgraded.upgraded.get('g1'), 1);
    assert.equal(upgraded.catalog.get('g1').rarity, 'signature');

    ref.chat = [...ref.chat, user('又来'), ai('胡乱一招。\n[igs-combat:learn|我|伪招|x]')];
    const fake = (await pendingOf()).find((p) => p.kind === 'learn');
    const forged = { id: ledgerEntryId('learn', 'pc-hero', fake.anchor), type: 'learn', character: 'pc-hero', anchor: fake.anchor, payload: { card: { ...sig, id: 'g9', name: '伪招' } }, createdAt: 4 };
    assert.equal((await ledger.append([forged])).ok, true);
    const after = await ledger.effectiveState();
    assert.equal(hero(after).owned.has('g9'), false);
    assert.ok(codes(after).includes('combat-signature-unknown'), JSON.stringify(codes(after)));

    const state = await ledger.effectiveState();
    const lobby = { heroId: 'pc-hero', controllable: ['pc-hero'], allies: [hero(state), state.characters.get('sc-ace')], enemies: new Map([['狼', templateEnemy('狼', 'normal')]]) };
    const start = { enemies: [{ name: '狼', count: 1 }], tier: 'normal' };
    const built = buildSetup(lobby, start);
    assert.equal(built.ok, true, JSON.stringify(built));
    const unit = built.setup.units.find((u) => u.id === 'sc-ace');
    // ace 档生命 ×1.4（50 → 70），再按六维换算：+ 体质调整值 × 等级，不低于换算前一半。
    const aceAttr = state.characters.get('sc-ace').attributes;
    assert.equal(unit.maxHp, Math.max(35, 70 + aceAttr.mods.con * aceAttr.level));
    assert.deepEqual([unit.level, unit.abilities], [aceAttr.level, aceAttr.scores]);
    // 技能先按六维换算（要求值 12），再乘 ace 档技能倍率 1.3。
    const { scaleSkills } = await import('../src/combat/card-scaling.js');
    const expectedSkills = scaleSkills(ace.skills, aceAttr).map((s) => Math.min(99, Math.max(1, Math.round(s.effects[0].amount * 1.3))));
    assert.deepEqual(unit.skills.slice(0, 3).map((s) => s.effects[0].amount), expectedSkills);
    const ult = unit.skills.find((s) => s.ultimate);
    assert.deepEqual([ult.id, ult.cooldown], ['sc-ace-u1', 3]);
    // 绝招取角色自己伤害最高的设定技能强化（同名、数值 ×1.5），不再是名为「绝招」的通用技能。
    assert.equal(ult.name, '技s1');
    assert.equal(ult.effects[0].amount, Math.min(99, Math.round(expectedSkills[0] * 1.5)));
    const battle = createBattle(built.setup, 1);
    assert.equal(battle.ok, true, JSON.stringify(battle.error));
    assert.equal(chooseSkillIntent(battle.state, 'sc-ace', 0.9).skillId, 'sc-ace-u1');
    battle.state.cooldowns['sc-ace']['sc-ace-u1'] = 2;
    assert.notEqual(chooseSkillIntent(battle.state, 'sc-ace', 0.9).skillId, 'sc-ace-u1');
    const peer = buildSetup({ ...lobby, allies: [hero(state)] }, start);
    assert.equal(peer.ok, true);
});


test('装备与道具：equip / item 进待生成队列，unequip 直接落账；同部位顶替进背包；消耗不超余量；换 swipe 按锚点回退', async () => {
    const { scanCombatTags } = await import('../src/scene/combat-directives.js');
    const { gearIdFor, itemIdFor, ledgerEntryId } = await import('../src/combat/schema.js');
    const { CONSUME_TAG_HASH } = await import('../src/combat/ledger.js');
    const floor0 = '得到宝剑与丹药。[igs-combat:equip|我|青锋剑|武器|削铁如泥]\n[igs-combat:item|我|回春丹|2|疗伤]';
    const floor1 = '换上了更重的剑。[igs-combat:equip|我|玄铁剑|武器]';
    const { ledger, tables, ref } = setup(undefined, [ai(floor0), ai(floor1)]);
    const scanned = await ledger.scan();
    assert.deepEqual([scanned.entries.length, tables.appends], [0, 0]);
    assert.deepEqual(scanned.pendingGeneration.map((p) => [p.kind, p.name, p.slot ?? p.count, p.characterId]),
        [['equip', '青锋剑', 'weapon', 'pc-hero'], ['item', '回春丹', 2, 'pc-hero'], ['equip', '玄铁剑', 'weapon', 'pc-hero']]);
    const [t0, t1] = scanCombatTags(floor0);
    const [t2] = scanCombatTags(floor1);
    const entry = (type, messageId, tag, payload) => {
        const anchor = { messageId, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
        return { id: ledgerEntryId(type, 'pc-hero', anchor), type, character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const passive = (id) => ({ id, name: '剑意', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }] });
    const w = await ledger.append([
        entry('equip', 0, t0, { gearId: gearIdFor('青锋剑'), name: '青锋剑', slot: 'weapon', passive: passive('g1'), description: '削铁如泥' }),
        entry('item', 0, t1, { itemId: itemIdFor('回春丹'), name: '回春丹', count: 2, effects: [{ op: 'heal', amount: 8 }], description: '疗伤' }),
        entry('equip', 1, t2, { gearId: gearIdFor('玄铁剑'), name: '玄铁剑', slot: 'weapon', passive: passive('g2'), description: '' }),
    ]);
    assert.equal(w.ok, true, JSON.stringify(w.rejected));
    assert.equal((await ledger.scan()).pendingGeneration.length, 0);
    let s = await ledger.effectiveState();
    assert.deepEqual([hero(s).gear.slots.weapon.name, hero(s).gear.bag.map((g) => g.name), hero(s).items.map((i) => [i.name, i.count])], ['玄铁剑', ['青锋剑'], [['回春丹', 2]]]);
    ref.chat.push(ai('他收起玄铁剑。[igs-combat:unequip|我|玄铁剑]'));
    const un = await ledger.scan();
    assert.deepEqual(un.entries.map((e) => [e.type, e.payload.gearId]), [['unequip', gearIdFor('玄铁剑')]]);
    s = await ledger.effectiveState();
    assert.deepEqual([hero(s).gear.slots.weapon, hero(s).gear.bag.map((g) => g.name).sort()], [undefined, ['玄铁剑', '青锋剑'].sort()]);
    ref.chat.push(user(report('win', '第1回合：主角 以「回春丹」出手。')));
    const consume = (occurrence, count) => {
        const anchor = { messageId: 3, swipeId: 0, tagHash: CONSUME_TAG_HASH, occurrence };
        return { id: ledgerEntryId('consume', 'pc-hero', anchor), type: 'consume', character: 'pc-hero', anchor, payload: { itemId: itemIdFor('回春丹'), count, reportId: 'r1' }, createdAt: 8 };
    };
    assert.equal((await ledger.append([consume(0, 1), consume(1, 5)])).ok, true);
    s = await ledger.effectiveState();
    assert.deepEqual(hero(s).items.map((i) => i.count), [1]);
    assert.ok(codes(s).includes('combat-item-insufficient'));
    ref.chat[1] = ai(floor1, 1);
    ref.chat[3] = { ...ref.chat[3], swipe_id: 1 };
    s = await ledger.effectiveState();
    assert.deepEqual([hero(s).gear.slots.weapon.name, hero(s).gear.bag.length, hero(s).items.map((i) => i.count)], ['青锋剑', 0, [2]]);
    assert.ok(codes(s).includes('combat-gear-missing'));
});
test('带稀有度装备（D7）：没有被动也能入账；装着时六维加成计入属性视图（受上限约束），面板卸下即撤回、装回恢复且载荷带 rarity 与 bonus', async () => {
    const { scanCombatTags } = await import('../src/scene/combat-directives.js');
    const { gearIdFor, ledgerEntryId } = await import('../src/combat/schema.js');
    const floor0 = '得到铜戒。[igs-combat:equip|我|铜戒|饰品|温润|罕见]';
    const { ledger } = setup(undefined, [ai(floor0), ai('之后的楼层。')]);
    const before = hero(await ledger.effectiveState()).attributes;
    const [t0] = scanCombatTags(floor0);
    const anchor = { messageId: 0, swipeId: 0, tagHash: t0.tagHash, occurrence: t0.occurrence };
    const gearId = gearIdFor('铜戒');
    const payload = { gearId, name: '铜戒', slot: 'accessory', description: '温润', rarity: 'uncommon', bonus: { ability: 'con', amount: 2 } };
    const w = await ledger.append([{ id: ledgerEntryId('equip', 'pc-hero', anchor), type: 'equip', character: 'pc-hero', anchor, payload, createdAt: 7 }]);
    assert.equal(w.ok, true, JSON.stringify(w.rejected));
    const want = Math.min(before.cap, before.scores.con + 2);
    let s = await ledger.effectiveState();
    assert.deepEqual([hero(s).gear.slots.accessory?.name, hero(s).gear.slots.accessory?.passive, hero(s).attributes.scores.con], ['铜戒', undefined, want]);
    assert.equal(hero(s).attributes.scores.str, before.scores.str);
    const off = await ledger.setGear('pc-hero', gearId, false);
    assert.equal(off.ok, true, JSON.stringify(off));
    s = await ledger.effectiveState();
    assert.equal(hero(s).attributes.scores.con, before.scores.con);
    const on = await ledger.setGear('pc-hero', gearId, true);
    assert.equal(on.ok, true, JSON.stringify(on));
    assert.deepEqual([on.entry.payload.rarity, on.entry.payload.bonus, Object.hasOwn(on.entry.payload, 'passive')], ['uncommon', { ability: 'con', amount: 2 }, false]);
    s = await ledger.effectiveState();
    assert.equal(hero(s).attributes.scores.con, want);
});


test('构筑面板换装不重建装备：来源标签楼换 swipe 后，后续面板 equip 不复活装备并记 combat-gear-missing；切回恢复', async () => {
    const { scanCombatTags } = await import('../src/scene/combat-directives.js');
    const { gearIdFor, ledgerEntryId } = await import('../src/combat/schema.js');
    const { GEAR_TAG_HASH } = await import('../src/combat/ledger.js');
    const floor0 = '得到宝剑。[igs-combat:equip|我|青锋剑|武器|削铁如泥]';
    const { ledger, ref } = setup(undefined, [ai(floor0), ai('之后的楼层。')]);
    const [t0] = scanCombatTags(floor0);
    const anchor = { messageId: 0, swipeId: 0, tagHash: t0.tagHash, occurrence: t0.occurrence };
    const gearId = gearIdFor('青锋剑');
    const passive = { id: 'g1', name: '剑意', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }] };
    const tagged = { id: ledgerEntryId('equip', 'pc-hero', anchor), type: 'equip', character: 'pc-hero', anchor, payload: { gearId, name: '青锋剑', slot: 'weapon', passive, description: '削铁如泥' }, createdAt: 7 };
    assert.equal((await ledger.append([tagged])).ok, true);
    // 面板先卸下再装上：两条都锚定最新楼（楼 1），equip 载荷带完整装备字段。
    const off = await ledger.setGear('pc-hero', gearId, false);
    const on = await ledger.setGear('pc-hero', gearId, true);
    assert.deepEqual([off.ok, on.ok], [true, true]);
    assert.deepEqual([off.entry, on.entry].map((e) => [e.type, e.anchor.messageId, e.anchor.tagHash, e.anchor.occurrence]),
        [['unequip', 1, GEAR_TAG_HASH, 0], ['equip', 1, GEAR_TAG_HASH, 1]]);
    assert.equal(on.entry.payload.name, '青锋剑');
    let s = await ledger.effectiveState();
    assert.deepEqual([hero(s).gear.slots.weapon?.name, hero(s).gear.bag.length], ['青锋剑', 0]);
    // 来源楼换到没有标签的 swipe：拥有记录失效，楼 1 的面板 equip 不得凭载荷重建。
    ref.chat[0] = ai('另一种走向。', 1);
    s = await ledger.effectiveState();
    assert.deepEqual([hero(s).gear.slots.weapon, hero(s).gear.bag.length], [undefined, 0]);
    assert.ok(codes(s).includes('combat-gear-missing'));
    ref.chat[0] = ai(floor0, 0);
    s = await ledger.effectiveState();
    assert.deepEqual([hero(s).gear.slots.weapon?.name, hero(s).gear.bag.length], ['青锋剑', 0]);
});


// 带属性表的内存表；table:false 时 read 不含 attribute（可选表缺失）。
function attrSetup(initial = [], { table = true } = {}) {
    const ctx = setup(undefined, initial);
    const baseRead = ctx.tables.read;
    ctx.tables.attribute = [];
    ctx.tables.read = () => {
        const r = baseRead();
        return table && r.ok ? { ...r, attribute: clone(ctx.tables.attribute) } : r;
    };
    return ctx;
}

test('属性：rel 档位变化才写、同档不随主角升级重算；stat 只给主角；换 swipe 回退', async () => {
    const chat = [ai('狼王现身。[igs-combat:rel|狼王|强敌][igs-combat:stat|我|力量|1|苦练][igs-combat:stat|爱丽丝|力量|1|旁观]')];
    const { ref, ledger, tables } = attrSetup(chat);
    const first = await ledger.scan();
    assert.equal(first.ok, true);
    assert.deepEqual(tables.attribute.map((r) => r.type).sort(), ['rel', 'story']);
    assert.ok(codes(first).includes('combat-stat-not-protagonist'));
    let s = await ledger.effectiveState();
    const wolf = attributeViewFor(s, '狼王');
    assert.equal(wolf.tier, 'formidable');
    assert.ok(wolf.level >= 5 && wolf.level <= 7);
    const str1 = hero(s).attributes.scores.str;

    ref.chat = [...chat, ai('[igs-combat:exp|我|50|历练][igs-combat:rel|狼王|强敌]')];
    const again = await ledger.scan();
    assert.equal(again.attributes.length, 0);
    s = await ledger.effectiveState();
    assert.equal(attributeViewFor(s, '狼王').level, wolf.level);

    ref.chat = [...ref.chat, ai('[igs-combat:rel|狼王|稍弱]')];
    await ledger.scan();
    s = await ledger.effectiveState();
    assert.equal(attributeViewFor(s, '狼王').tier, 'weaker');
    assert.equal(tables.attribute.filter((r) => r.type === 'rel').length, 2);

    ref.chat = [ai('另一个版本。', 1), ...ref.chat.slice(1)];
    s = await ledger.effectiveState();
    assert.equal(hero(s).attributes.scores.str, str1 - 1);
    assert.equal(attributeViewFor(s, '狼王').tier, 'weaker');
    ref.chat = [...chat, ...ref.chat.slice(1)];
    assert.equal(hero(await ledger.effectiveState()).attributes.scores.str, str1);
});

test('属性提升：缺属性表不能分配；余额与上限校验；属性提升等级不产生三选一', async () => {
    let n = 0;
    while (n <= 1000 && expProgress(n).level < 4) n += 1;
    assert.ok(n <= 1000);
    const chat = [user(report('win', `[igs-combat:exp|我|${n}|大胜]`)), ai('[igs-combat:stat|我|自由|2|顿悟]')];

    const missing = attrSetup(chat, { table: false });
    assert.equal((await missing.ledger.scan()).ok, true);
    const m = await missing.ledger.effectiveState();
    assert.equal(hero(m).attributes.table, 'missing');
    assert.equal((await missing.ledger.allocate('pc-hero', [{ ability: 'dex', amount: 1 }])).reason, 'combat-attribute-table-missing');

    const { ledger, tables } = attrSetup(chat);
    await ledger.scan();
    const h = hero(await ledger.effectiveState());
    assert.ok(h.level >= 4);
    const expected = Array.from({ length: h.level - 1 }, (_, i) => i + 2).filter((lv) => !isAsiLevel(lv, true));
    assert.deepEqual(h.pendingRewards, expected);
    assert.equal(h.attributes.balance, asiCountAt(h.level, true) * 2 + 2);

    assert.equal((await ledger.allocate('pc-hero', [{ ability: 'dex', amount: 3 }])).reason, 'combat-alloc-invalid');
    const done = await ledger.allocate('pc-hero', [{ ability: 'dex', amount: 2 }]);
    assert.equal(done.ok, true);
    const after = hero(await ledger.effectiveState());
    assert.equal(after.attributes.scores.dex, h.attributes.scores.dex + 2);
    assert.equal(after.attributes.balance, h.attributes.balance - 2);
    const over = Array.from({ length: Math.ceil((after.attributes.balance + 1) / 2) }, () => ({ ability: 'cha', amount: 2 }));
    assert.equal((await ledger.allocate('pc-hero', over)).reason, 'combat-alloc-over-balance');
    assert.equal(tables.attribute.filter((r) => r.type === 'alloc').length, 1);
});

test('初始化首写：并发、别名及缺档案转有档案复用首条；缺表和读取失败拒写', async () => {
    const init = { className: '游侠', role: 'warrior', major: 'str', minor: 'con', weak: 'cha' };
    const { ledger, tables } = attrSetup();
    const [first, second] = await Promise.all([
        ledger.writeInit('主角', init), ledger.writeInit('我', { ...init, className: '武师' }),
    ]);
    assert.equal(first.ok, true);
    assert.deepEqual(second, { ok: true, unchanged: true });
    assert.equal(tables.attribute.length, 1);
    assert.equal(hero(await ledger.effectiveState()).attributes.className, '游侠');
    assert.equal((await ledger.writeInit('Alice', init)).ok, true);
    tables.profile.push(row(heroDef('pc-alice', 'Alice'), 3));
    assert.deepEqual(await ledger.writeInit('Alice', { ...init, className: '武师' }), { ok: true, unchanged: true });
    assert.equal(tables.attribute.length, 2);
    assert.equal((await ledger.writeInit('Bob', { ...init, weak: 'str' })).reason, 'combat-init-invalid');
    const missing = attrSetup([], { table: false });
    assert.equal((await missing.ledger.writeInit('主角', init)).reason, 'combat-attribute-table-missing');
    assert.equal(missing.tables.appends, 0);
    tables.failRead = true;
    assert.equal((await ledger.writeInit('Bob', init)).reason, 'combat-table-read-failed');
    assert.equal(tables.attribute.length, 2);
});

test('初始化读取中取消：不进入写队列，之后有效任务仍可写', async () => {
    const { ledger, tables } = attrSetup();
    const init = { role: 'warrior', major: 'str', minor: 'con', weak: 'cha' };
    const read = tables.read;
    const controller = new AbortController();
    tables.read = async () => { controller.abort(); return read(); };
    assert.equal((await ledger.writeInit('主角', init, { signal: controller.signal })).reason, 'request-stale');
    assert.equal(tables.appends, 0);
    tables.read = read;
    assert.equal((await ledger.writeInit('主角', init)).ok, true);
});


test('offer：组装结果经 schema 落账并按 combatId 读出；开战楼换 swipe 作废、切回恢复；重复写入幂等；同场第二条不覆盖；非法槽位拒收', async () => {
    const anchor = { messageId: 1, swipeId: 0, tagHash: 'st1', occurrence: 0 };
    const combatId = 'cb|1|0|st1|0';
    // 与生成链路（validateReward → growthEntry）同形：ID 由类型、角色与开战楼锚点确定。
    const buildOfferEntry = (character, a, payload, createdAt) => ({ id: ledgerEntryId('offer', character, a), type: 'offer', character, anchor: { ...a }, payload, createdAt });
    const plan = { seed: `reward|${combatId}|pc-hero`, slots: [
        { index: 0, kind: 'card', rarity: 'uncommon', cost: 1 },
        { index: 1, kind: 'item', rarity: 'common', count: 1 },
        { index: 2, kind: 'keepsake', rarity: 'common' },
    ] };
    const built = assembleReward({ slots: [['裂风', 'strike', '狼王的爪痕'], ['回春丹', 'potion', ''], ['褪色的发绳', null, '']] }, { key: 'k', input: plan });
    assert.ok(built.value, JSON.stringify(built.errors));
    const offer = { combatId, tier: 'normal', exp: 40, reveal: 0, slots: built.value.slots };
    const entry = buildOfferEntry('pc-hero', anchor, offer, 7);
    assert.equal(normalizeLedgerEntry(entry).ok, true, JSON.stringify(normalizeLedgerEntry(entry).errors));
    const { ref, ledger, tables } = setup(undefined, [user('出发'), ai('狼群围了上来。')]);
    assert.equal((await ledger.append(entry)).ok, true);
    assert.deepEqual((await ledger.append(entry)).written, []);
    assert.equal(tables.ledger.length, 1);
    const state = await ledger.effectiveState();
    const got = state.offers.get(combatId);
    assert.deepEqual([got.entryId, got.character, got.exp, got.slots.map((s) => [s.kind, s.rarity])], [entry.id, 'pc-hero', 40, [['card', 'uncommon'], ['item', 'common'], ['keepsake', 'common']]]);
    assert.equal(hero(state).exp, 0);

    ref.chat = [user('出发'), ai('另一种结局。', 1)];
    const swiped = await ledger.effectiveState();
    assert.deepEqual([swiped.offers.size, swiped.inactive.map((x) => x.reason)], [0, ['swipe-changed']]);
    ref.chat = [user('出发'), ai('狼群围了上来。')];
    assert.equal((await ledger.effectiveState()).offers.has(combatId), true);

    await ledger.append(buildOfferEntry('pc-hero', { ...anchor, occurrence: 1 }, { ...offer, exp: 99 }, 8));
    const twice = await ledger.effectiveState();
    assert.deepEqual([twice.offers.get(combatId).exp, codes(twice).includes('combat-offer-duplicate')], [40, true]);

    const pathsOf = (payload) => (normalizeLedgerEntry({ ...entry, payload }).errors || []).map((e) => [e.path, e.reason]);
    // 杂物没有战斗字段，但必须带稀有度（翻牌爆光用）。
    assert.deepEqual(pathsOf({ ...offer, slots: [offer.slots[0], offer.slots[1], { ...offer.slots[2], card: offer.slots[0].card }] }), [['payload.slots[2].card', 'unknown-field']]);
    const { rarity, ...bare } = offer.slots[2];
    assert.deepEqual(pathsOf({ ...offer, slots: [offer.slots[0], offer.slots[1], bare] }).map(([p]) => p), ['payload.slots[2].rarity']);
    assert.deepEqual(pathsOf({ ...offer, slots: [offer.slots[0], offer.slots[1], { ...offer.slots[2], kind: 'ability' }] }).map(([p, r]) => [p, r]), [['payload.slots[2].kind', 'invalid-enum']]);
    assert.deepEqual(pathsOf({ ...offer, slots: [offer.slots[1], offer.slots[0], offer.slots[2]] }), [['payload.slots[0].index', 'slot-index-mismatch'], ['payload.slots[1].index', 'slot-index-mismatch']]);
    assert.deepEqual(pathsOf({ ...offer, slots: [{ ...offer.slots[0], card: { ...offer.slots[0].card, rarity: 'rare' } }, offer.slots[1], offer.slots[2]] }), [['payload.slots[0].card.rarity', 'rarity-mismatch']]);
    assert.equal((await ledger.append({ ...entry, id: 'offer-bad', payload: { ...offer, slots: offer.slots.slice(0, 2) } })).rejected[0].reason, 'combat-entry-invalid');
    // 备用套 reserve：与 slots 等长、同样逐槽校验；旧条目没有 reserve 仍合法。
    assert.equal(normalizeLedgerEntry({ ...entry, payload: { ...offer, reserve: offer.slots } }).ok, true);
    assert.deepEqual(pathsOf({ ...offer, reserve: [...offer.slots, { ...offer.slots[2], index: 3 }] }), [['payload.reserve', 'reserve-length-mismatch']]);
    assert.deepEqual(pathsOf({ ...offer, reserve: [offer.slots[1], offer.slots[0], offer.slots[2]] }).map(([p]) => p), ['payload.reserve[0].index', 'payload.reserve[1].index']);
});

// 翻牌兑现夹具：A 场主套首槽为史诗杂物；B 场备用套首槽为卡牌。战报块经 attachLoot 附上战利品行与 loot 标签。
const CB_A = 'cb|1|0|st1|0';
const CB_B = 'cb|4|0|st2|0';
const keepSlot = (index, rarity = 'common') => ({ index, kind: 'keepsake', rarity });
const offerOf = (a, payload) => ({ id: ledgerEntryId('offer', 'pc-hero', a), type: 'offer', character: 'pc-hero', anchor: { ...a }, payload, createdAt: 7 });
function lootFixture() {
    const a = assembleReward({ slots: [['褪色的发绳', null, '狼王颈上的'], ['回春丹', 'potion', ''], ['裂风', 'strike', '狼王的爪痕']] },
        { key: 'a', input: { seed: `reward|${CB_A}`, slots: [keepSlot(0, 'epic'), { index: 1, kind: 'item', rarity: 'common', count: 1 }, { index: 2, kind: 'card', rarity: 'uncommon', cost: 1 }] } });
    const b = assembleReward({ slots: [['旧铜钱', null, ''], ['碎瓷片', null, ''], ['断弦', null, '']], reserve: [['破军', 'strike', '一刀两断'], ['草绳', null, ''], ['空酒壶', null, '']] },
        { key: 'b', input: { seed: `reward|${CB_B}`, slots: [keepSlot(0), keepSlot(1), keepSlot(2)], reserve: [{ index: 0, kind: 'card', rarity: 'uncommon', cost: 1 }, keepSlot(1), keepSlot(2)] } });
    assert.ok(a.value && b.value, JSON.stringify([a.errors, b.errors]));
    const offerA = offerOf({ messageId: 1, swipeId: 0, tagHash: 'st1', occurrence: 0 }, { combatId: CB_A, tier: 'normal', exp: 40, reveal: 0, slots: a.value.slots });
    const offerB = offerOf({ messageId: 4, swipeId: 0, tagHash: 'st2', occurrence: 0 }, { combatId: CB_B, tier: 'normal', exp: 40, reveal: 0, ...b.value });
    return { a: a.value, b: b.value, offerA, offerB };
}
const lootReport = (combatId, result, loot) => attachLoot(`<igs-combat-report id="${reportIdFor(combatId)}" result="${result}">\n第1回合：……\n</igs-combat-report>`,
    { character: '主角', reportId: reportIdFor(combatId), ...loot });


test('loot：offer 未落账时只记诊断、补扫入账；杂物入收藏；重扫幂等；失败战报的 loot 不入账', async () => {
    const { a, offerA } = lootFixture();
    const chat = [user('出发'), ai('狼群围了上来。'), user(lootReport(CB_A, 'win', { index: 0, set: 'main', slot: a.slots[0] }))];
    assert.ok(chat[2].mes.includes('战利品：主角顺手捡到「褪色的发绳」。\n</igs-combat-report>'));
    assert.equal(attachLoot(chat[2].mes, { character: '主角', reportId: reportIdFor(CB_A), index: 0, set: 'main', slot: a.slots[0] }), chat[2].mes);
    const { ledger, tables } = setup(undefined, chat);
    const early = await ledger.scan();
    assert.deepEqual([early.entries.length, early.diagnostics.map((d) => d.code)], [0, ['combat-loot-offer-missing']]);
    await ledger.append(offerA);
    assert.equal((await ledger.scan()).ok, true);
    assert.deepEqual(tables.ledger.map((e) => e.type), ['offer', 'loot']);
    assert.deepEqual((await ledger.scan()).entries, []);
    const state = await ledger.effectiveState();
    const lootId = tables.ledger[1].id;
    assert.deepEqual(hero(state).collection, [{ lootId, name: '褪色的发绳', origin: '狼王颈上的', rarity: 'epic' }]);
    assert.deepEqual([hero(state).points, state.loots.get(CB_A).set], [0, 'main']);

    const lost = setup(undefined, [user('出发'), ai('狼群围了上来。'), user(lootReport(CB_A, 'lose', { index: 0, set: 'main', slot: a.slots[0] }))]);
    await lost.ledger.append(offerA);
    const scan = await lost.ledger.scan();
    assert.deepEqual([scan.entries.length, scan.diagnostics.map((d) => d.code)], [0, ['combat-loot-not-victory']]);
});


test('sell：杂物按稀有度基准浮动入账、同一件只能卖一次；备用套 loot 扣 30 积分；卖出楼换 swipe 时卖出与积分回退、余额不足的重抽整条拒收；战报改为失败时战利品失效', async () => {
    const { a, b, offerA, offerB } = lootFixture();
    const base = [user('出发'), ai('狼群围了上来。'), user(lootReport(CB_A, 'win', { index: 0, set: 'main', slot: a.slots[0] })), ai('收拾战场。')];
    const { ref, ledger, tables } = setup(undefined, base);
    await ledger.append(offerA);
    await ledger.scan();
    const lootId = tables.ledger.find((e) => e.type === 'loot').id;
    const price = sellPrice('epic', lootId);
    const sold = await ledger.sellKeepsake(lootId);
    assert.deepEqual([sold.ok, sold.price, sold.entry.anchor.messageId, sold.entry.anchor.tagHash], [true, price, 3, 'sell']);
    assert.equal((await ledger.sellKeepsake(lootId)).reason, 'combat-keepsake-missing');
    let state = await ledger.effectiveState();
    assert.deepEqual([hero(state).points, hero(state).collection], [price, []]);

    ref.chat = [...base, ai('又一群狼。'), user(lootReport(CB_B, 'win', { index: 0, set: 'reserve', slot: b.reserve[0] }))];
    await ledger.append(offerB);
    await ledger.scan();
    const lootB = tables.ledger.filter((e) => e.type === 'loot').at(-1);
    assert.deepEqual([lootB.payload.set, lootB.payload.cost, lootB.payload.slot.name], ['reserve', 30, '破军']);
    state = await ledger.effectiveState();
    assert.deepEqual([hero(state).points, hero(state).catalog.has(b.reserve[0].card.id)], [price - 30, true]);

    const restored = ref.chat;
    ref.chat = [...restored.slice(0, 3), ai('另一种收拾法。', 1), ...restored.slice(4)];
    state = await ledger.effectiveState();
    assert.deepEqual([hero(state).points, hero(state).collection.length, hero(state).catalog.has(b.reserve[0].card.id)], [0, 1, false]);
    assert.ok(codes(state).includes('combat-points-insufficient'));
    ref.chat = restored;
    assert.equal(hero(await ledger.effectiveState()).points, price - 30);

    ref.chat = [...restored.slice(0, 2), user(lootReport(CB_A, 'lose', { index: 0, set: 'main', slot: a.slots[0] })), ...restored.slice(3)];
    state = await ledger.effectiveState();
    assert.ok(state.inactive.some((x) => x.reason === 'loot-report-invalid'));
    assert.deepEqual([hero(state).points, hero(state).collection.length], [0, 0]);
});

test('sell 装备：背包里未装备的装备按稀有度浮动卖出、穿戴中拒收（写口与归并两层）；同楼先卸下再卖出成立；卖出楼换 swipe 时装备回到背包、积分回退', async () => {
    const g = assembleReward({ slots: [['青锋剑', 'opening-strength', '铁匠铺的'], ['旧铜钱', null, ''], ['碎瓷片', null, '']] },
        { key: 'g', input: { seed: `reward|${CB_A}`, slots: [{ index: 0, kind: 'gear', rarity: 'rare', gearSlot: 'weapon' }, keepSlot(1), keepSlot(2)] } });
    assert.ok(g.value, JSON.stringify(g.errors));
    const offer = offerOf({ messageId: 1, swipeId: 0, tagHash: 'st1', occurrence: 0 }, { combatId: CB_A, tier: 'normal', exp: 40, reveal: 0, slots: g.value.slots });
    const base = [user('出发'), ai('狼群围了上来。'), user(lootReport(CB_A, 'win', { index: 0, set: 'main', slot: g.value.slots[0] })), ai('收拾战场。')];
    const { ref, ledger } = setup(undefined, base);
    await ledger.append(offer);
    await ledger.scan();
    const gearId = g.value.slots[0].gear.gearId;
    let state = await ledger.effectiveState();
    assert.deepEqual(hero(state).gear.bag.map((x) => [x.name, x.rarity]), [['青锋剑', 'rare']]);

    assert.equal((await ledger.setGear('pc-hero', gearId, true)).ok, true);
    assert.equal((await ledger.sellGear(gearId)).reason, 'combat-gear-equipped');
    // 绕过写口直接写一条穿戴中的卖出：归并层同样拒收，装备仍在身上、积分不变。
    const forged = { messageId: 3, swipeId: 0, tagHash: 'sell', occurrence: 1 };
    await ledger.append({ id: ledgerEntryId('sell', 'pc-hero', forged), type: 'sell', character: 'pc-hero', anchor: forged, payload: { gearId }, createdAt: 9 });
    state = await ledger.effectiveState();
    assert.ok(codes(state).includes('combat-gear-equipped'));
    assert.deepEqual([hero(state).gear.slots.weapon?.name, hero(state).points], ['青锋剑', 0]);

    assert.equal((await ledger.setGear('pc-hero', gearId, false)).ok, true);
    const price = sellPrice('rare', gearId);
    const sold = await ledger.sellGear(gearId);
    assert.deepEqual([sold.ok, sold.price, sold.entry.anchor.messageId, sold.entry.anchor.occurrence], [true, price, 3, 3]);
    assert.equal((await ledger.sellGear(gearId)).reason, 'combat-gear-missing');
    state = await ledger.effectiveState();
    assert.deepEqual([hero(state).points, hero(state).gear.bag.length, hero(state).gear.slots.weapon], [price, 0, undefined]);

    ref.chat = [...base.slice(0, 3), ai('另一种收拾法。', 1)];
    state = await ledger.effectiveState();
    assert.deepEqual([hero(state).points, hero(state).gear.bag.map((x) => x.name), hero(state).gear.slots.weapon], [0, ['青锋剑'], undefined]);
});

test('sell 载荷与售价：lootId / gearId 恰有其一；售价在稀有度基准 ±SELL_PRICE_SPREAD 内、同一物品恒定，未登记稀有度按普通', () => {
    const anchor = { messageId: 3, swipeId: 0, tagHash: 'sell', occurrence: 0 };
    const entry = (payload) => normalizeLedgerEntry({ id: ledgerEntryId('sell', 'pc-hero', anchor), type: 'sell', character: 'pc-hero', anchor, payload, createdAt: 1 });
    assert.deepEqual([entry({ lootId: 'lg|x' }).ok, entry({ gearId: 'gear-a' }).ok, entry({ lootId: 'lg|x', gearId: 'gear-a' }).ok, entry({}).ok], [true, true, false, false]);
    for (const [rarity, base] of Object.entries(KEEPSAKE_PRICES)) {
        for (const key of ['a', 'b', 'gear-x', 'lg|1']) {
            const p = sellPrice(rarity, key);
            assert.ok(p >= Math.round(base * (1 - SELL_PRICE_SPREAD)) && p <= Math.round(base * (1 + SELL_PRICE_SPREAD)), `${rarity} ${key} ${p}`);
            assert.equal(sellPrice(rarity, key), p);
        }
    }
    assert.equal(sellPrice(undefined, 'k'), sellPrice('common', 'k'));
});

test('rebuild：花 200 积分重生个人卡池与起始卡组；职业池保留、旧个人卡移出、卡组重置；不合规、非主角与积分不足不写表；同楼之后保存的卡组排在其后；重生楼换 swipe 时回退', async () => {
    const mythic = (combatId, key) => assembleReward({ slots: [['月下狼魂', null, ''], ['旧铜钱', null, ''], ['碎瓷片', null, '']] },
        { key, input: { seed: `reward|${combatId}`, slots: [keepSlot(0, 'mythic'), keepSlot(1), keepSlot(2)] } }).value;
    const a = mythic(CB_A, 'a');
    const b = mythic(CB_B, 'b');
    const offerA = offerOf({ messageId: 1, swipeId: 0, tagHash: 'st1', occurrence: 0 }, { combatId: CB_A, tier: 'normal', exp: 40, reveal: 0, slots: a.slots });
    const offerB = offerOf({ messageId: 4, swipeId: 0, tagHash: 'st2', occurrence: 0 }, { combatId: CB_B, tier: 'normal', exp: 40, reveal: 0, slots: b.slots });
    const chat = [user('出发'), ai('狼群围了上来。'), user(lootReport(CB_A, 'win', { index: 0, set: 'main', slot: a.slots[0] })), ai('收拾战场。'),
        ai('又一群狼。'), user(lootReport(CB_B, 'win', { index: 0, set: 'main', slot: b.slots[0] })), ai('继续上路。')];
    const { ref, ledger, tables } = setup(undefined, chat);
    await ledger.append(offerA);
    await ledger.append(offerB);
    await ledger.scan();
    for (const e of tables.ledger.filter((x) => x.type === 'loot')) assert.equal((await ledger.sellKeepsake(e.id)).ok, true);
    ref.chat = [...chat, ai('第二天。')];
    const before = hero(await ledger.effectiveState()).points;
    assert.ok(before >= 200, String(before));
    const pool = [attack('n1'), guard('n2'), attack('n3'), guard('n4')];
    const starter = STARTER.map((id) => (id === 'm1' ? 'n1' : id === 'm2' ? 'n2' : id));
    const count = tables.ledger.length;
    assert.equal((await ledger.rebuildDeck('pc-hero', { personalPool: pool, starterDeck: STARTER })).reason, 'combat-rebuild-invalid');
    assert.equal((await ledger.rebuildDeck('nobody', { personalPool: pool, starterDeck: starter })).reason, 'combat-points-not-protagonist');
    assert.equal(tables.ledger.length, count);
    const r = await ledger.rebuildDeck('pc-hero', { personalPool: pool, starterDeck: starter });
    assert.deepEqual([r.ok, r.cost, r.entry.anchor.messageId, r.entry.anchor.tagHash, r.entry.payload.cost], [true, 200, 7, 'rebuild', 200]);
    let s = await ledger.effectiveState();
    assert.deepEqual([hero(s).catalog.has('n1'), hero(s).catalog.has('m1'), hero(s).catalog.has('c5'), hero(s).owned.has('m1'), hero(s).owned.get('n1')], [true, false, true, false, 2]);
    assert.deepEqual([hero(s).deck, hero(s).points, hero(s).profile.personalPool.map((c) => c.id)], [starter, before - 200, ['n1', 'n2', 'n3', 'n4']]);
    assert.equal((await ledger.rebuildDeck('pc-hero', { personalPool: pool, starterDeck: starter })).reason, 'combat-points-insufficient');
    const reordered = [...starter].reverse();
    const saved = await ledger.saveDeck('pc-hero', reordered);
    assert.deepEqual([saved.ok, saved.entry.anchor.tagHash, saved.entry.anchor.occurrence], [true, 'panel', 1]);
    assert.deepEqual(hero(await ledger.effectiveState()).deck, reordered);
    ref.chat = [...chat, ai('另一个早晨。', 1)];
    s = await ledger.effectiveState();
    assert.deepEqual([hero(s).catalog.has('m1'), hero(s).catalog.has('n1'), hero(s).deck, hero(s).points], [true, false, STARTER, before]);
});


// 转职 / 升阶夹具：十场胜利各翻到一件神话杂物，卖出攒够积分；术士为第二个已登记职业。
function classGrowthFixture() {
    const combats = Array.from({ length: 10 }, (_, i) => {
        const messageId = 1 + i * 2;
        const combatId = `cb|${messageId}|0|st${i}|0`;
        const value = assembleReward({ slots: [['月下狼魂', null, ''], ['旧铜钱', null, ''], ['碎瓷片', null, '']] },
            { key: `k${i}`, input: { seed: `reward|${combatId}`, slots: [keepSlot(0, 'mythic'), keepSlot(1), keepSlot(2)] } }).value;
        const offer = offerOf({ messageId, swipeId: 0, tagHash: `st${i}`, occurrence: 0 }, { combatId, tier: 'normal', exp: 40, reveal: 0, slots: value.slots });
        return { combatId, value, offer };
    });
    const chat = [user('出发'), ...combats.flatMap((c) => [ai('狼群围了上来。'), user(lootReport(c.combatId, 'win', { index: 0, set: 'main', slot: c.value.slots[0] }))]), ai('第二天。')];
    const profiles = [row(classDef('cls-blade'), 1), row({ ...classDef('cls-mage', 'g'), className: '术士' }, 2), row(heroDef(), 3)];
    return { combats, chat, profiles };
}
const tierCards = (tier, rarity) => [1, 2, 3].map((i) => ({ ...attack(`cls-blade-t${tier}-${i}`), rarity }));

test('respec / ascend：转职花 150 积分换到另一个已登记职业、阶数回到一阶、已有卡保留；升阶逐阶花 300 / 600、要求 Lv5 / Lv10、追加稀有 / 史诗职业卡并加强职业被动；不合规不写表；同楼之后领取的奖励排在升阶之后；转职楼换 swipe 时回退', async () => {
    const { combats, chat, profiles } = classGrowthFixture();
    const { ref, ledger, tables } = setup(profiles, chat);
    for (const c of combats) await ledger.append(c.offer);
    await ledger.scan();
    for (const e of tables.ledger.filter((x) => x.type === 'loot')) assert.equal((await ledger.sellKeepsake(e.id)).ok, true);
    let s = await ledger.effectiveState();
    const points0 = hero(s).points;
    assert.deepEqual([tables.ledger.filter((x) => x.type === 'sell').length, hero(s).level, hero(s).classTier, hero(s).tierName], [10, 1, 1, '']);
    assert.ok(points0 >= 1200, String(points0));
    const raiseTo = async (level) => {
        for (let n = 0; n < 40 && hero(await ledger.effectiveState()).level < level; n += 1) {
            ref.chat = [...ref.chat, ai('又练了一天剑。[igs-combat:exp|我|50|练剑]')];
            await ledger.scan();
        }
        assert.equal(hero(await ledger.effectiveState()).level, level);
    };
    const ascend = (tier, cards, classRef = 'cls-blade') => ledger.ascendClass('pc-hero', { classRef, tier, tierName: tier === 2 ? '剑豪' : '剑圣', cards });
    const count = tables.ledger.length;
    assert.equal((await ascend(2, tierCards(2, 'rare'))).reason, 'combat-ascend-level-unreached');
    assert.equal((await ascend(4, tierCards(4, 'epic'))).reason, 'combat-ascend-tier-invalid');
    assert.equal((await ledger.respecClass('pc-hero', 'cls-blade')).reason, 'combat-respec-same-class');
    assert.equal((await ledger.respecClass('pc-hero', 'cls-none')).reason, 'combat-class-missing');
    assert.equal((await ledger.respecClass('nobody', 'cls-mage')).reason, 'combat-points-not-protagonist');
    assert.equal(tables.ledger.length, count);

    await raiseTo(5);
    assert.equal((await ascend(3, tierCards(3, 'epic'))).reason, 'combat-ascend-tier-invalid');
    assert.equal((await ascend(2, tierCards(2, 'epic'))).reason, 'combat-ascend-rarity-invalid');
    assert.equal((await ascend(2, [{ ...attack('c1'), rarity: 'rare' }, ...tierCards(2, 'rare').slice(1)])).reason, 'combat-card-id-collision');
    assert.equal((await ascend(2, tierCards(2, 'rare'), 'cls-mage')).reason, 'combat-ascend-class-mismatch');
    assert.equal(tables.ledger.filter((x) => x.type === 'ascend').length, 0);
    const up = await ascend(2, tierCards(2, 'rare'));
    assert.deepEqual([up.ok, up.cost, up.entry.anchor.tagHash, up.entry.payload.tier], [true, 300, 'ascend', 2]);
    s = await ledger.effectiveState();
    assert.deepEqual([hero(s).classTier, hero(s).tierName, hero(s).points, hero(s).classProfile.classPool.length, hero(s).catalog.has('cls-blade-t2-1'), hero(s).owned.has('cls-blade-t2-1')],
        [2, '剑豪', points0 - 300, 11, true, false]);
    assert.deepEqual([hero(s).classProfile.classPassive.effects[0].stacks, s.classes.get('cls-blade').classPassive.effects[0].stacks], [2, 1]);
    const lv = hero(s).pendingRewards[0];
    const claimed = await ledger.claimReward('pc-hero', lv, { kind: 'card', cardId: 'cls-blade-t2-1' });
    assert.deepEqual([claimed.ok, claimed.entry.anchor.tagHash, claimed.entry.anchor.occurrence], [true, 'panel', 1]);
    assert.equal(hero(await ledger.effectiveState()).owned.get('cls-blade-t2-1'), 1);
    assert.equal((await ascend(3, tierCards(3, 'epic'))).reason, 'combat-ascend-level-unreached');
    await raiseTo(10);
    const top = await ascend(3, tierCards(3, 'epic'));
    assert.deepEqual([top.ok, top.cost], [true, 600]);
    s = await ledger.effectiveState();
    assert.deepEqual([hero(s).classTier, hero(s).tierName, hero(s).points, hero(s).classProfile.classPool.length, hero(s).classProfile.classPassive.effects[0].stacks],
        [3, '剑圣', points0 - 900, 14, 3]);
    assert.equal((await ascend(4, tierCards(4, 'epic'))).reason, 'combat-ascend-tier-invalid');
    ref.chat = [...ref.chat, ai('换了一身行头。')];
    const moved = await ledger.respecClass('pc-hero', 'cls-mage');
    assert.deepEqual([moved.ok, moved.cost, moved.entry.anchor.tagHash], [true, 150, 'respec']);
    s = await ledger.effectiveState();
    assert.deepEqual([hero(s).classRef, hero(s).classTier, hero(s).tierName, hero(s).points, hero(s).classProfile.classPool.length], ['cls-mage', 1, '', points0 - 1050, 8]);
    assert.deepEqual([hero(s).catalog.has('cls-blade-t3-1'), hero(s).catalog.has('g1'), hero(s).owned.get('cls-blade-t2-1')], [true, true, 1]);
    ref.chat = [...ref.chat.slice(0, -1), ai('换了一身行头。', 1)];
    s = await ledger.effectiveState();
    assert.deepEqual([hero(s).classRef, hero(s).classTier, hero(s).tierName, hero(s).points], ['cls-blade', 3, '剑圣', points0 - 900]);
});

// 人物特性夹具：被动为一条格挡（低于队友技能伤害上限）；extra 覆盖任意字段。
const traitOf = (traitId, extra = {}) => ({ traitId, name: `特性${traitId}`, origin: '自幼习武', rarity: 'rare',
    passive: { id: `${traitId}-p`, name: `特性${traitId}`, trigger: 'battle-start', effects: [{ op: 'block', amount: 6, target: 'self' }], description: '开战获得格挡' }, ...extra });

test('trait / trait-pick：只主角花 100 积分抽，未满直接装上、已满成为待定；待定时不能再抽；替换或放弃写 trait-pick（不扣分），被 drop 的消失；非主角、伤害超限、重复与积分不足不写表；抽取楼换 swipe 时全部回退', async () => {
    const { TRAIT_DRAW_COST } = await import('../src/combat/points.js');
    const poor = setup(undefined, [user('出发'), ai('林间小路。')]);
    assert.equal((await poor.ledger.drawTrait('pc-hero', traitOf('t0'))).reason, 'combat-points-insufficient');
    assert.equal(poor.tables.ledger.length, 0);

    const { combats, chat, profiles } = classGrowthFixture();
    const { ref, ledger, tables } = setup(profiles, chat);
    for (const c of combats) await ledger.append(c.offer);
    await ledger.scan();
    for (const e of tables.ledger.filter((x) => x.type === 'loot')) assert.equal((await ledger.sellKeepsake(e.id)).ok, true);
    ref.chat = [...ref.chat, ai('又过了一天。')];
    const points0 = hero(await ledger.effectiveState()).points;
    assert.ok(points0 >= 5 * TRAIT_DRAW_COST, String(points0));
    const count = tables.ledger.length;
    assert.equal((await ledger.drawTrait('nobody', traitOf('t0'))).reason, 'combat-points-not-protagonist');
    const heavy = traitOf('tx', { passive: { ...traitOf('tx').passive, effects: [{ op: 'damage', amount: 30, target: 'enemy' }] } });
    assert.equal((await ledger.drawTrait('pc-hero', heavy)).reason, 'combat-trait-damage-cap');
    assert.equal(tables.ledger.length, count);

    const a = await ledger.drawTrait('pc-hero', traitOf('t1', { link: 'reveal' }));
    assert.deepEqual([a.ok, a.cost, a.entry.type, a.entry.anchor.tagHash, a.entry.payload.cost, a.entry.payload.link], [true, TRAIT_DRAW_COST, 'trait', 'trait', TRAIT_DRAW_COST, 'reveal']);
    assert.equal('link' in (await ledger.drawTrait('pc-hero', traitOf('t2'))).entry.payload, false);
    let s = await ledger.effectiveState();
    assert.deepEqual([hero(s).traits.map((t) => t.traitId), hero(s).pendingTrait, hero(s).traitDraws, hero(s).points, 'cost' in hero(s).traits[0]],
        [['t1', 't2'], null, 2, points0 - 2 * TRAIT_DRAW_COST, false]);
    assert.equal((await ledger.drawTrait('pc-hero', traitOf('t3'))).ok, true);
    s = await ledger.effectiveState();
    assert.deepEqual([hero(s).traits.map((t) => t.traitId), hero(s).pendingTrait?.traitId, hero(s).points], [['t1', 't2'], 't3', points0 - 3 * TRAIT_DRAW_COST]);
    assert.equal((await ledger.drawTrait('pc-hero', traitOf('t4'))).reason, 'combat-trait-pending');
    assert.equal((await ledger.pickTrait('pc-hero', 't3', 't9')).reason, 'combat-trait-pick-invalid');
    assert.equal((await ledger.pickTrait('pc-hero', 't4', 't1')).reason, 'combat-trait-pick-invalid');
    const swap = await ledger.pickTrait('pc-hero', 't3', 't1');
    assert.deepEqual([swap.ok, 'cost' in swap, swap.entry.type, swap.entry.anchor.tagHash], [true, false, 'trait-pick', 'trait']);
    s = await ledger.effectiveState();
    assert.deepEqual([hero(s).traits.map((t) => t.traitId), hero(s).pendingTrait, hero(s).points], [['t3', 't2'], null, points0 - 3 * TRAIT_DRAW_COST]);
    assert.equal((await ledger.drawTrait('pc-hero', traitOf('t4'))).ok, true);
    assert.equal((await ledger.pickTrait('pc-hero', 't4', 't4')).ok, true);
    s = await ledger.effectiveState();
    assert.deepEqual([hero(s).traits.map((t) => t.traitId), hero(s).pendingTrait, hero(s).traitDraws, hero(s).points], [['t3', 't2'], null, 4, points0 - 4 * TRAIT_DRAW_COST]);
    assert.equal((await ledger.drawTrait('pc-hero', traitOf('t2'))).reason, 'combat-trait-duplicate');

    ref.chat = [...ref.chat.slice(0, -1), ai('又过了一天。', 1)];
    s = await ledger.effectiveState();
    assert.deepEqual([hero(s).traits, hero(s).pendingTrait, hero(s).traitDraws, hero(s).points], [[], null, 0, points0]);
});

test('traits：稀有度按主角 ID 与已生效抽取次数确定、分布贴合权重；联动汇总取透视最大值（神话亮 2 张）、再翻与天运任一即生效；被动只取装着的特性', async () => {
    const { TRAIT_RARITY_WEIGHTS, planTrait, traitLinks, traitPassives, traitSeed } = await import('../src/combat/traits.js');
    assert.deepEqual(planTrait(traitSeed('pc-hero', 3)), planTrait(traitSeed('pc-hero', 3)));
    const counts = {};
    const n = 4000;
    for (let i = 0; i < n; i += 1) {
        const { rarity } = planTrait(traitSeed('pc-hero', i));
        counts[rarity] = (counts[rarity] || 0) + 1;
    }
    const total = Object.values(TRAIT_RARITY_WEIGHTS).reduce((x, y) => x + y, 0);
    for (const [k, w] of Object.entries(TRAIT_RARITY_WEIGHTS)) assert.ok(Math.abs((counts[k] || 0) / n - w / total) < 0.03, `${k} ${counts[k]}`);
    assert.deepEqual(traitLinks([]), { reveal: 0, reflip: false, fortune: false });
    assert.deepEqual(traitLinks([{ link: 'reveal', rarity: 'rare' }, { link: 'reveal', rarity: 'mythic' }, { link: 'fortune' }]), { reveal: 2, reflip: false, fortune: true });
    assert.deepEqual(traitLinks([{ link: 'reflip' }, { rarity: 'epic' }]), { reveal: 0, reflip: true, fortune: false });
    const p = { id: 'x-p' };
    assert.deepEqual(traitPassives({ traits: [{ passive: p }, {}], pendingTrait: { passive: { id: 'y-p' } } }), [p]);
    assert.deepEqual(traitPassives({}), []);
});

// v4 特性夹具：主动为 1 费伤害技能，被动沿用 traitOf 并带 kind。
const activeOf = (traitId) => ({ traitId, name: `技${traitId}`, origin: '自幼习武', rarity: 'rare', kind: 'active',
    skill: { id: `${traitId}-s`, name: `技${traitId}`, cost: 1, effects: [{ op: 'damage', amount: 6 }], description: '造成伤害' } });
const passiveOf = (traitId) => traitOf(traitId, { kind: 'passive' });

test('trait-slot：固有人物技能与个人被动占满基础 2 槽，新主动待定且只能替换主动；第 3 槽按顺序花 500 解锁、待定特性随之装上；待定被动可替换主动或固有被动；抽取楼换 swipe 时槽位与特性全部回退', async () => {
    const { combats, chat, profiles } = classGrowthFixture();
    const { ref, ledger, tables } = setup(profiles, chat);
    for (const c of combats) await ledger.append(c.offer);
    await ledger.scan();
    for (const e of tables.ledger.filter((x) => x.type === 'loot')) assert.equal((await ledger.sellKeepsake(e.id)).ok, true);
    ref.chat = [...ref.chat, ai('又过了一天。')];
    const points0 = hero(await ledger.effectiveState()).points;
    assert.ok(points0 >= 1000, String(points0));
    const ids = (s) => hero(s).traits.map((t) => t.traitId);

    assert.equal((await ledger.drawTrait('pc-hero', activeOf('a1'))).ok, true);
    let s = await ledger.effectiveState();
    assert.deepEqual([ids(s), hero(s).pendingTrait?.traitId, hero(s).slotUnlocks], [[], 'a1', 0]);
    const count = tables.ledger.length;
    assert.equal((await ledger.pickTrait('pc-hero', 'a1', 'pp-pc-hero')).reason, 'combat-trait-pick-blocked');
    assert.equal(tables.ledger.length, count);
    assert.equal((await ledger.pickTrait('pc-hero', 'a1', 'pc-hero-h0')).ok, true);
    s = await ledger.effectiveState();
    assert.deepEqual([ids(s), hero(s).pendingTrait, hero(s).innateDropped], [['a1'], null, ['active']]);

    assert.equal((await ledger.drawTrait('pc-hero', passiveOf('p1'))).ok, true);
    assert.equal(hero(await ledger.effectiveState()).pendingTrait?.traitId, 'p1');
    for (const n of [2, 4, 6]) assert.equal((await ledger.unlockTraitSlot('pc-hero', n)).reason, 'combat-trait-slot-invalid');
    assert.equal((await ledger.unlockTraitSlot('nobody', 3)).reason, 'combat-points-not-protagonist');
    assert.equal(tables.ledger.length, count + 2);
    const slot = await ledger.unlockTraitSlot('pc-hero', 3);
    assert.deepEqual([slot.ok, slot.cost, slot.entry.type, slot.entry.anchor.tagHash, slot.entry.payload], [true, 500, 'trait-slot', 'trait', { slot: 3, cost: 500 }]);
    s = await ledger.effectiveState();
    assert.deepEqual([ids(s), hero(s).pendingTrait, hero(s).slotUnlocks, hero(s).points], [['a1', 'p1'], null, 1, points0 - 700]);
    assert.equal((await ledger.unlockTraitSlot('pc-hero', 3)).reason, 'combat-trait-slot-invalid');

    assert.equal((await ledger.drawTrait('pc-hero', activeOf('a2'))).ok, true);
    assert.equal((await ledger.pickTrait('pc-hero', 'a2', 'p1')).reason, 'combat-trait-pick-blocked');
    assert.equal((await ledger.pickTrait('pc-hero', 'a2', 'pp-pc-hero')).reason, 'combat-trait-pick-blocked');
    assert.equal((await ledger.pickTrait('pc-hero', 'a2', 'pc-hero-h0')).reason, 'combat-trait-pick-invalid');
    assert.equal((await ledger.pickTrait('pc-hero', 'a2', 'a1')).ok, true);
    assert.equal((await ledger.drawTrait('pc-hero', passiveOf('p2'))).ok, true);
    assert.equal((await ledger.pickTrait('pc-hero', 'p2', 'a2')).ok, true);
    assert.equal((await ledger.drawTrait('pc-hero', passiveOf('p3'))).ok, true);
    assert.equal((await ledger.pickTrait('pc-hero', 'p3', 'pp-pc-hero')).ok, true);
    s = await ledger.effectiveState();
    assert.deepEqual([ids(s), hero(s).pendingTrait, hero(s).innateDropped, hero(s).traitDraws, hero(s).points],
        [['p2', 'p1', 'p3'], null, ['active', 'passive'], 5, points0 - 1000]);

    ref.chat = [...ref.chat.slice(0, -1), ai('又过了一天。', 1)];
    s = await ledger.effectiveState();
    assert.deepEqual([ids(s), hero(s).pendingTrait, hero(s).slotUnlocks, hero(s).innateDropped, hero(s).points], [[], null, 0, [], points0]);
});


test('持续伤势：wound 记最近一场战后生命（战报 ID 不符不生效，满血清空，倒下记 0）；heal 按点数或上限百分比恢复，乘写入时的难度倍率，没有伤势时不起作用；战报续写段的 heal 只记诊断', async () => {
    const { WOUND_TAG_HASH } = await import('../src/combat/ledger.js');
    const report = (id, extra = '') => `<igs-combat-report id="${id}" result="lose">战报${extra}</igs-combat-report>`;
    const build = (difficulty, reportText) => {
        const tables = memoryTables(baseProfiles());
        const ref = { chat: [user('出发'), ai('遇敌。'), user(reportText)] };
        const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '主角', now: () => 7, difficulty });
        const wound = (payload, occurrence = 0) => {
            const anchor = { messageId: 2, swipeId: 0, tagHash: WOUND_TAG_HASH, occurrence };
            return { id: ledgerEntryId('wound', 'pc-hero', anchor), type: 'wound', character: 'pc-hero', anchor, payload, createdAt: 7 };
        };
        const woundOf = async () => (await ledger.effectiveState()).characters.get('pc-hero').wound;
        return { tables, ref, ledger, wound, woundOf };
    };

    const a = build('normal', report('r1'));
    assert.equal((await a.ledger.append([a.wound({ hp: 30, maxHp: 80, down: false, reportId: 'r1' }), a.wound({ hp: 5, maxHp: 80, down: false, reportId: 'r9' }, 1)])).ok, true);
    const s = await a.ledger.effectiveState();
    assert.deepEqual(s.characters.get('pc-hero').wound, { hp: 30, maxHp: 80, down: false });
    assert.ok(s.inactive.some((x) => x.reason === 'wound-report-invalid'));
    a.ref.chat.push(ai('他们在营地休整。[igs-combat:heal|我|20|包扎]'));
    await a.ledger.scan();
    assert.deepEqual(a.tables.ledger.filter((e) => e.type === 'heal').map((e) => [e.payload.amount, e.payload.mode, e.payload.scale]), [[20, 'flat', 100]]);
    assert.deepEqual(await a.woundOf(), { hp: 50, maxHp: 80, down: false });
    a.ref.chat.push(ai('服下灵药。[igs-combat:heal|我|50%|灵药]'));
    await a.ledger.scan();
    assert.equal(await a.woundOf(), null);
    a.ref.chat.push(ai('又歇了一夜。[igs-combat:heal|我|10]'));
    await a.ledger.scan();
    assert.equal(await a.woundOf(), null);
    // 50% 那一楼换 swipe：该次回血回退，其余两次照常（30 + 20 + 10）。
    a.ref.chat[4] = ai('另一个版本。', 1);
    assert.deepEqual(await a.woundOf(), { hp: 60, maxHp: 80, down: false });

    const b = build('nightmare', report('r2', '[igs-combat:heal|我|20]'));
    await b.ledger.append([b.wound({ hp: 0, maxHp: 80, down: true, reportId: 'r2' })]);
    assert.deepEqual(await b.woundOf(), { hp: 0, maxHp: 80, down: true });
    const inReport = await b.ledger.scan();
    assert.ok(inReport.diagnostics.some((d) => d.code === 'combat-heal-tag-in-report'));
    b.ref.chat.push(ai('包扎伤口。[igs-combat:heal|我|20]'));
    await b.ledger.scan();
    assert.deepEqual(b.tables.ledger.filter((e) => e.type === 'heal').map((e) => e.payload.scale), [50]);
    assert.deepEqual(await b.woundOf(), { hp: 10, maxHp: 80, down: false });

    const c = build('normal', report('r3'));
    await c.ledger.append([c.wound({ hp: 80, maxHp: 80, down: false, reportId: 'r3' })]);
    assert.equal(await c.woundOf(), null);
});


test('剧情受伤（合并计划 N3 / N2）：没有档案的主角按战士生命基数换算上限；hurt 按上限扣 15/30/50%、可扣到 0 记倒下；换 swipe 回退；回血恢复；补扫幂等', async () => {
    const { vitalsForName } = await import('../src/combat/ledger.js');
    const { heroBaseStats, HERO_BASE_HP } = await import('../src/combat/vitals.js');
    assert.equal(HERO_BASE_HP, 80);
    const tables = memoryTables([]);
    const ref = { chat: [user('出发'), ai('被划了一刀。[igs-stat:hurt|中伤]'), ai('又挨了一拳。[igs-stat:hurt|轻伤]')] };
    const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '阿遥', now: () => 7 });
    const vit = async () => vitalsForName(await ledger.effectiveState(), '阿遥', '阿遥');
    const full = await vit();
    assert.deepEqual(full, { hp: full.maxHp, maxHp: full.maxHp, down: false });
    const s0 = await ledger.effectiveState();
    assert.equal(full.maxHp, heroBaseStats(s0.characters.size ? null : (await import('../src/combat/ledger.js')).abilitiesForName(s0, '阿遥', '阿遥')).hp);
    const M = full.maxHp;
    assert.equal((await ledger.scanLife()).ok, true);
    assert.equal(tables.ledger.filter((e) => e.type === 'hurt').length, 2);
    const afterMid = M - Math.round(M * 0.3);
    assert.deepEqual(await vit(), { hp: afterMid - Math.round(M * 0.15), maxHp: M, down: false });
    // 再扫一次不重复入账。
    await ledger.scanLife();
    assert.equal(tables.ledger.filter((e) => e.type === 'hurt').length, 2);
    // 中伤那一楼换 swipe：该次伤势回退，只剩轻伤。
    ref.chat[1] = ai('躲开了。', 1);
    assert.deepEqual(await vit(), { hp: M - Math.round(M * 0.15), maxHp: M, down: false });
    // 两次重伤扣到 0，记为倒下；回血后不再倒下。
    ref.chat.push(ai('[igs-stat:hurt|重伤]'), ai('[igs-stat:hurt|重伤][igs-stat:hurt|重伤]'));
    await ledger.scanLife();
    assert.deepEqual(await vit(), { hp: 0, maxHp: M, down: true });
    ref.chat.push(ai('被人救起。[igs-combat:heal|我|50%|包扎]'));
    await ledger.scanLife();
    const healed = await vit();
    assert.equal(healed.down, false);
    assert.ok(healed.hp > 0 && healed.hp < M);
    // 用户楼里的标签不计。
    ref.chat.push(user('[igs-stat:hurt|重伤]'));
    await ledger.scanLife();
    assert.deepEqual(await vit(), healed);
});

test('同楼剧情受伤与回血：先记伤势再记回血，与标签先后无关', async () => {
    const { vitalsForName } = await import('../src/combat/ledger.js');
    const tables = memoryTables([]);
    const ref = { chat: [user('出发'), ai('先包扎，又被划了一刀。[igs-combat:heal|我|10|包扎][igs-stat:hurt|中伤]')] };
    const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '阿遥', now: () => 7 });
    assert.equal((await ledger.scanLife()).ok, true);
    const v = vitalsForName(await ledger.effectiveState(), '阿遥', '阿遥');
    assert.equal(v.hp, v.maxHp - Math.round(v.maxHp * 0.3) + 10);
});

test('速算伤势只在给出 battleHurts 时入账，一楼只记第一场', async () => {
    const { vitalsForName } = await import('../src/combat/ledger.js');
    const tables = memoryTables([]);
    const ref = { chat: [user('出发'), ai('打了一架。[igs-stat:battle|杂兵][igs-stat:battle|精英]')] };
    const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '阿遥', now: () => 7 });
    await ledger.scanLife();
    assert.equal(tables.ledger.length, 0);
    await ledger.scanLife({ messageIds: [1], battleHurts: new Map([[1, '轻伤']]) });
    assert.deepEqual(tables.ledger.map((e) => e.payload.tier), ['轻伤']);
    const v = vitalsForName(await ledger.effectiveState(), '阿遥', '阿遥');
    assert.equal(v.hp, v.maxHp - Math.round(v.maxHp * 0.15));
    // 删掉 battle 标签（编辑正文）后伤势失效。
    ref.chat[1] = ai('打了一架。');
    const after = vitalsForName(await ledger.effectiveState(), '阿遥', '阿遥');
    assert.equal(after.hp, after.maxHp);
});


test('多敌折算进 setup：同档敌人按人数乘 crowdScaleFor（预备队不计）；生成首领再乘 0.9，模板首领不变；单只与旧版一致', async () => {
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { buildSetup } = await import('../src/combat/session.js');
    const { crowdScaleFor } = await import('../src/combat/rules.js');
    const { ledger } = setup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [user('出发'), ai('启程。')]);
    const state = await ledger.effectiveState();
    const foesOf = (profile, count, tier = 'normal') => {
        const lobby = { heroId: 'pc-hero', controllable: ['pc-hero'], allies: [hero(state)], enemies: new Map([['狼', profile]]) };
        const built = buildSetup(lobby, { enemies: [{ name: '狼', count }], tier });
        assert.equal(built.ok, true, JSON.stringify(built));
        return built.setup.units.filter((u) => u.side === 'enemy');
    };
    const wolf = templateEnemy('狼', 'normal');
    const [one] = foesOf(wolf, 1);
    for (const n of [2, 3, 8]) {
        const k = crowdScaleFor(n);
        const foes = foesOf(wolf, n);
        assert.equal(foes.length, n);
        for (const u of foes) {
            assert.equal(u.maxHp, Math.max(1, Math.round(one.maxHp * k)), `n=${n}`);
            assert.equal(u.damageScale, Math.min(5, Math.round(one.damageScale * k * 100) / 100), `n=${n}`);
        }
    }
    const tBoss = templateEnemy('狼', 'boss');
    const { generated: _g, ...gBoss } = tBoss;
    const [t] = foesOf(tBoss, 1, 'boss');
    const [g] = foesOf(gBoss, 1, 'boss');
    assert.equal(g.maxHp, Math.max(1, Math.round(t.maxHp * 0.9)));
    assert.equal(g.damageScale, Math.round(t.damageScale * 0.9 * 100) / 100);
});


test('初始装备写失败不阻断：grantGeneratedGear 遇写失败、抛错或缺角色只记诊断；空列表与非 profile-gear 不写', async () => {
    const { grantGeneratedGear } = await import('../src/combat/ledger.js');
    const items = [{ gearId: 'g', name: '剑', slot: 'weapon' }];
    const generation = { accepted: [{ kind: 'profile-gear', gear: { name: '甲', items } }, { kind: 'profile-gear', gear: { name: '乙', items: [] } }, { kind: 'profile-deck' }] };
    const calls = [];
    const failing = { grantInitialGear: async (id, list, opts) => { calls.push([id, list.length, opts.anchor]); return { ok: false, reason: 'combat-ledger-insert-failed' }; } };
    const anchor = { messageId: 1, swipeId: 0 };
    const d1 = [];
    assert.equal(await grantGeneratedGear(failing, generation, (n) => (n === '甲' ? 'id-a' : null), { anchor, diagnostics: d1 }), true);
    assert.deepEqual(calls, [['id-a', 1, anchor]]);
    assert.deepEqual(d1, [{ code: 'combat-ledger-insert-failed', name: '甲' }]);
    const d2 = [];
    await grantGeneratedGear({ grantInitialGear: async () => { throw new Error('x'); } }, generation, () => 'id-a', { diagnostics: d2 });
    assert.deepEqual(d2, [{ code: 'combat-gear-write-failed', name: '甲' }]);
    const d3 = [];
    assert.equal(await grantGeneratedGear(failing, generation, () => null, { diagnostics: d3 }), false);
    assert.deepEqual(d3, [{ code: 'combat-character-missing', name: '甲' }]);
});


test('专属卡按等级解锁（v0.39.2）：Lv5 / Lv10 解锁对应槽位、等级退回重新锁上；剧情提前解锁不重复计；档案没有该槽位时记待生成，写新版本档案后解锁', async () => {
    const { signaturePending } = await import('../src/combat/ledger.js');
    const { generateEntities, generationWrites, growthEntity } = await import('../src/combat/generation.js');
    const expFor = (level) => { let n = 0; while (n <= 100000 && expProgress(n).level < level) n += 1; return n; };
    const win = (amount) => user(report('win', `[igs-combat:exp|我|${amount}|大胜]`));
    // 旧档案预生成的专属卡（ID 不带槽位后缀）按位置归到第 1 槽，名称与效果保留。
    const legacy = { id: 'g1', name: '天翔一闪', type: 'attack', cost: 2, rarity: 'signature', effects: [{ op: 'damage', amount: 14 }] };
    const legacyProfiles = () => [row(classDef('cls-blade'), 1), row({ ...heroDef(), signatureCards: [legacy] }, 2)];

    const old = setup(legacyProfiles(), [win(expFor(5) - 1)]);
    await old.ledger.scan();
    assert.equal(hero(await old.ledger.effectiveState()).owned.get('g1') || 0, 0);
    old.ref.chat = [win(expFor(5) - 1), win(1)];
    await old.ledger.scan();
    let s = await old.ledger.effectiveState();
    assert.equal(hero(s).level, 5);
    assert.equal(hero(s).owned.get('g1'), 1);
    assert.ok(hero(s).deck.includes('g1'));
    assert.equal(Object.hasOwn(hero(s), 'signatureDue'), false);
    assert.deepEqual(signaturePending(s), []);
    old.ref.chat = [win(expFor(5) - 1)];
    s = await old.ledger.effectiveState();
    assert.equal(hero(s).owned.get('g1') || 0, 0);

    const early = setup(legacyProfiles(), [ai('剑光乍起。\n[igs-combat:learn|我|天翔一闪|拔刀即斩]'), win(expFor(5))]);
    const learn = growthEntity((await early.ledger.scan()).pendingGeneration.find((p) => p.kind === 'learn'), hero(await early.ledger.effectiveState()), { now: 2 });
    assert.equal((await early.ledger.append([learn.entry])).ok, true);
    assert.equal(hero(await early.ledger.effectiveState()).owned.get('g1'), 1);

    // 单条 EXP 上限 1000（schema），升到 Lv10 分两场战报：第 1 槽在第 0 楼跨级，第 2 槽在第 1 楼跨级。
    const fresh = setup(undefined, [win(1000), win(expFor(10) - 1000)]);
    await fresh.ledger.scan();
    s = await fresh.ledger.effectiveState();
    assert.equal(hero(s).level, 10);
    assert.deepEqual(hero(s).signatureDue.map((d) => [d.slot, d.level, d.anchor.messageId]), [[1, 5, 0], [2, 10, 1]]);
    const pending = signaturePending(s);
    assert.deepEqual(pending.map((p) => [p.kind, p.characterId, p.slots, p.anchor.messageId]), [['signature', 'pc-hero', [1, 2], 0]]);
    const { entity } = growthEntity(pending[0], hero(s), { profileMeta: s.profileMeta });
    assert.deepEqual([entity.kind, entity.input.slots, entity.fixed.version], ['signature-card', [1, 2], 2]);
    const request = async () => JSON.stringify({ entities: [{ key: entity.key, value: { cards: [['天翔一闪', 'strike'], ['终焉雷鸣', 'thunder']] } }] });
    const result = await generateEntities([entity], { request, llm: { source: 'tavern' }, now: 9 });
    assert.equal(result.ok, true, JSON.stringify(result.rejected));
    const writes = generationWrites(result, { createdAt: 9 });
    assert.deepEqual([writes.profiles.length, writes.entries.length, writes.profiles[0].version], [1, 0, 2]);
    fresh.tables.profile.push(clone(writes.profiles[0]));
    s = await fresh.ledger.effectiveState();
    assert.deepEqual(['pc-hero-g1', 'pc-hero-g2'].map((id) => hero(s).owned.get(id)), [1, 1]);
    assert.deepEqual(hero(s).profile.signatureCards.map((c) => [c.id, c.name, c.cost]), [['pc-hero-g1', '天翔一闪', 2], ['pc-hero-g2', '终焉雷鸣', 3]]);
    assert.equal(Object.hasOwn(hero(s), 'signatureDue'), false);
    assert.deepEqual(signaturePending(s), []);
});
