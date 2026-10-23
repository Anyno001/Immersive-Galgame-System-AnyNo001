import test from 'node:test';
import assert from 'node:assert/strict';
import { REWARD_TAG_HASH, computeEffectiveState, createCombatLedger, indexProfiles, nameKey, normalizeSnapshot } from '../src/combat/ledger.js';
import { createCombatTables } from '../src/data/shujuku/combat-tables.js';

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
    assert.equal((await tables.ensure({ confirmed: true })).ok, true);
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
