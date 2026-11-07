// v0.39.2 平衡补丁的行为用例（共创者 9f12ee5e 新增测试按本地接口改写）：首轮先手不双动、敌人随机选目标、
// 群体折算下限、助战绝招取自身技能、初始装备由程序定加成、主角至少 1 件、专属卡 Lv5 / Lv10 解锁、开战标签后的纯标记行、重新开始。
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createBattle, seedFor, upcomingActors } from '../src/combat/engine.js';
import { chooseSkillIntent } from '../src/combat/policy.js';
import { BASIC_CARDS, COMBAT_RULES, crowdScaleFor, expProgress, signatureCardAt, signatureSlotOf, signatureUnlockLevel } from '../src/combat/rules.js';
import { createCombatLedger, signaturePending } from '../src/combat/ledger.js';
import { generateEntities, generationWrites, growthEntity, profileGearEntity } from '../src/combat/generation.js';
import { buildSetup } from '../src/combat/session.js';
import { extractCombatStart } from '../src/scene/combat-directives.js';
import { extractLossDirectives, scanLossTags, scanGainTags } from '../src/scene/combat-directives.js';
import { gearIdFor, itemIdFor, ledgerEntryId, REWARD_SLOT_COUNT } from '../src/combat/schema.js';
import { planRewardSlots, victoryExpFor } from '../src/combat/rewards.js';
import { flipOrder } from '../src/combat/flip.js';
import { createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { createInventoryTables } from '../src/data/shujuku/inventory-tables.js';
import { createLedgerMockHost, userInventorySheet } from './helpers/combat-mock-host-ledger.js';
import { equippedGear, placeGear, removeGear, slotGearList } from '../src/combat/gear-slots.js';
import { traitLinks } from '../src/combat/traits.js';

const clone = (value) => JSON.parse(JSON.stringify(value));
const codes = (result) => result.diagnostics.map((item) => item.code);

// ---------- 引擎 ----------
const dmg = (amount) => ({ op: 'damage', amount, target: 'enemy' });
const idle = { id: 'idle', name: '蓄势', intent: 'buff', effects: [{ op: 'heal', amount: 1, target: 'self' }] };
const claw = (amount) => ({ id: 'claw', name: '爪击', intent: 'attack', effects: [dmg(amount)] });
const hero = (deck, extra = {}) => ({ id: 'hero', name: '主角', side: 'ally', kind: 'deck', maxHp: 50, deck, catalog: BASIC_CARDS, ...extra });
const foe = (extra = {}) => ({ id: 'foe', name: '敌人', side: 'enemy', kind: 'skill', maxHp: 60, skills: [idle], ...extra });
const filler = Array(5).fill('basic-defend');
const SEED = seedFor('chat-1|7');
function start(units, extra = {}) {
    const result = createBattle({ controlledId: 'hero', units, ...extra }, SEED);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    return result.state;
}

test('开局先手计入行动条：速度快的主角首轮不再连动两回合，旧 setup 行为不变，顺序槽与实际一致', () => {
    const units = () => [hero(filler, { speed: 150 }), foe({ speed: 100 })];
    const legacy = start(units());
    assert.deepEqual(upcomingActors(legacy, 3), ['hero', 'hero', 'foe']);
    const old = applyAction(legacy, { type: 'end-turn' });
    assert.deepEqual(old.events.filter((e) => e.type === 'act').map((e) => e.unitId), []);
    const charged = start(units(), { openingCharged: true });
    assert.deepEqual(upcomingActors(charged, 3), ['hero', 'foe', 'hero']);
    const next = applyAction(charged, { type: 'end-turn' });
    assert.equal(next.ok, true);
    assert.deepEqual(next.events.filter((e) => e.type === 'act').map((e) => e.unitId), ['foe']);
    assert.deepEqual([next.state.phase, next.state.turn, next.state.openingDebt], ['player', 2, undefined]);
    assert.equal(createBattle({ controlledId: 'hero', openingCharged: 'yes', units: units() }, SEED).error?.reason, 'invalid-setup');
});

test('敌人随机选攻击对象（setup.randomTargets）：开启时按种子在存活的我方单位中随机挑，同一种子重放一致；旧 setup 仍打生命 + 格挡最低者；非布尔值拒绝建局', () => {
    const units = () => [hero(['basic-strike'], { maxHp: 50 }), { id: 'mate', name: '队友', side: 'ally', kind: 'skill', maxHp: 90, skills: [idle] }, foe({ skills: [claw(5)] })];
    const seeds = Array.from({ length: 40 }, (_, i) => seedFor(`rt|${i}`));
    const targetOf = (extra, seed) => {
        const result = createBattle({ controlledId: 'hero', units: units(), ...extra }, seed);
        assert.equal(result.ok, true, JSON.stringify(result.error));
        return result.state.intents.foe?.targetId;
    };
    assert.ok(seeds.every((seed) => targetOf({}, seed) === 'hero'));
    assert.deepEqual([...new Set(seeds.map((seed) => targetOf({ randomTargets: true }, seed)))].sort(), ['hero', 'mate']);
    assert.equal(targetOf({ randomTargets: true }, seeds[3]), targetOf({ randomTargets: true }, seeds[3]));
    assert.equal(createBattle({ controlledId: 'hero', randomTargets: 'yes', units: units() }, SEED).error?.reason, 'invalid-setup');
});

test('多敌折算：1 只为 1；2 只约 0.70；3、4 只继续递减，5 只起封底 0.4', () => {
    assert.equal(crowdScaleFor(1), 1);
    assert.ok(Math.abs(crowdScaleFor(2) - 1 / 1.43) < 1e-9, String(crowdScaleFor(2)));
    assert.ok(crowdScaleFor(3) < crowdScaleFor(2) && crowdScaleFor(3) > 0.5);
    assert.ok(Math.abs(crowdScaleFor(4) - 1 / 2.29) < 1e-9, String(crowdScaleFor(4)));
    for (const n of [5, 8, 50]) assert.equal(crowdScaleFor(n), COMBAT_RULES.crowd.floor, `n=${n}`);
    assert.equal(COMBAT_RULES.crowd.floor, 0.4);
});

test('专属卡槽位：ID 带 -g<n> 按槽位，否则按档案位置；Lv5 / Lv10 解锁', () => {
    assert.deepEqual(COMBAT_RULES.signatureUnlockLevels, [5, 10]);
    assert.deepEqual([signatureUnlockLevel(1), signatureUnlockLevel(2), signatureUnlockLevel(3)], [5, 10, Infinity]);
    assert.equal(signatureSlotOf({ id: 'pc-g2' }, 0), 2);
    assert.equal(signatureSlotOf({ id: 'legacy' }, 1), 2);
    assert.equal(signatureSlotOf({ id: 'pc-g9' }, 0), 1);
    const profile = { signatureCards: [{ id: 'pc-g2', name: 'b' }, { id: 'old', name: 'a' }] };
    assert.equal(signatureCardAt(profile, 2)?.name, 'b');
    assert.equal(signatureCardAt({}, 1), null);
});

// ---------- 开战标签 ----------
test('开战标签后只剩数值 / 成长等纯标记行时仍生效（觉醒照常并入）；后面还有正文时仍不触发', () => {
    const body = [
        '铁面人抬起黑刀横在身前。',
        '[igs-char:? ? ? |冷漠|玄色夜行衣|挡路的小辈。那就一起。]',
        '[igs-combat:awaken|陈默|怒火|你伤了她，我就是拼了这条命也要把你留下！]',
        '[igs-combat:start|暗夜偷袭・铁面刺客|铁面刺客|麟青砚|首领]',
        '',
        '[igs-stat:favor|麟青砚|受伤]',
        '[igs-stat:hurt|重伤]',
        '[igs-combat:rel|麟青砚|碾压]',
        '[igs-combat:rel|铁面刺客|碾压]',
    ].join('\n');
    const { start: parsed, diagnostics } = extractCombatStart(body);
    assert.equal(parsed?.encounter, '暗夜偷袭・铁面刺客', JSON.stringify(diagnostics));
    assert.deepEqual([parsed.tier, parsed.allies, parsed.awaken?.type], ['boss', ['麟青砚'], 'rage']);
    assert.equal(codes({ diagnostics }).includes('combat-start-not-tail'), false);
    const prose = extractCombatStart(`${body}\n他还想说什么。`);
    assert.equal(prose.start, null);
    assert.ok(codes(prose).includes('combat-start-not-tail'));
});

// ---------- 初始装备 ----------
const LLM = { source: 'tavern' };
const reply = (pairs) => JSON.stringify({ entities: pairs.map(([key, value]) => ({ key, value })) });

test('初始装备（profile-gear）：模型只给名称、部位与稀有度，加成属性由程序抽定；空列表合法、不落账；主角空列表与同部位两件拒收并定向修正', async () => {
    const entity = profileGearEntity('陈默');
    assert.deepEqual([entity.kind, entity.optional, entity.input], ['profile-gear', true, { name: '陈默' }]);
    const good = await generateEntities([entity], { request: async () => reply([[entity.key, { gear: [['青锋剑', 'weapon', 'rare', '师门所赐']] }]]), llm: LLM });
    assert.equal(good.ok, true, JSON.stringify(good.rejected));
    const items = good.accepted[0].gear.items;
    assert.deepEqual([good.accepted[0].gear.name, items.length, items[0].slot, items[0].rarity, items[0].bonus.amount, items[0].description], ['陈默', 1, 'weapon', 'rare', 3, '师门所赐']);
    assert.ok(['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(items[0].bonus.ability));
    // 同名同稀有度结果恒定（加成六维与被动都按装备 ID 种子定）
    const again = await generateEntities([entity], { request: async () => reply([[entity.key, { gear: [['青锋剑', 'weapon', 'rare', '师门所赐']] }]]), llm: LLM });
    assert.deepEqual(again.accepted[0].gear.items, items);
    const none = await generateEntities([entity], { request: async () => reply([[entity.key, { gear: [] }]]), llm: LLM });
    assert.deepEqual([none.ok, none.accepted[0].gear.items], [true, []]);
    assert.deepEqual(generationWrites(none), { profiles: [], entries: [] });
    const required = profileGearEntity('陈默', { required: true });
    assert.deepEqual(required.input, { name: '陈默', required: true });
    const empty = await generateEntities([required], { request: async () => reply([[required.key, { gear: [] }]]), llm: LLM });
    assert.equal(empty.ok, false);
    assert.ok(empty.rejected[0].errors.some((e) => e.reason === 'invalid-length'));
    const dup = await generateEntities([entity], { request: async () => reply([[entity.key, { gear: [['甲', 'weapon', 'common'], ['乙', 'weapon', 'common']] }]]), llm: LLM });
    assert.deepEqual([dup.ok, dup.requests], [false, 3]);
    assert.ok(dup.rejected[0].errors.some((e) => e.reason === 'slot-duplicate'));
});

// ---------- 会话：重新开始 ----------
test('重新开始：对局中与撤退后用同一 setup 换新种子从头打，撤掉聊天记录里的旧结果，续战读到新对局；胜利后不给', async () => {
    const { createCombatSession, locateCombatStart, sessionKeyFor } = await import('../src/combat/session.js');
    const { createCountingStorage } = await import('./helpers/combat-mock-host-services.js');
    const chat = [{ is_user: true, mes: '出发' }, { is_user: false, mes: '前方出现了敌人。\n[igs-combat:start|史莱姆|草原]', swipe_id: 0 }];
    const located = locateCombatStart(chat, 1);
    assert.equal(located.ok, true);
    const makeRecord = (units) => {
        const setup = { rulesVersion: COMBAT_RULES.version, controlledId: 'hero', canEscape: true, units };
        return { v: 1, combatId: located.combatId, anchor: located.anchor, seed: seedFor(located.combatId), setup, actions: [], encounter: '草原', tiers: ['normal'], expTargets: ['我'] };
    };
    const records = new Map();
    const chatRecord = {
        read: () => ({ ok: true, value: records.get(located.combatId) || null }),
        write: async (anchor, combatId, patch) => { records.set(combatId, { ...(records.get(combatId) || {}), ...patch }); return { ok: true }; },
    };
    const stubLedger = { effectiveState: async () => ({ ok: true, offers: new Map(), attributes: {}, characters: new Map(), classes: new Map() }), append: async () => ({ ok: true }), scan: async () => ({ ok: true }) };
    const open = (record) => {
        const storage = createCountingStorage({ [sessionKeyFor('chat-1')]: JSON.stringify(record) });
        const make = () => createCombatSession({ ledger: stubLedger, tables: {}, storage, chat, getChatId: () => 'chat-1', userName: '我', chatRecord, send: async () => ({ ok: true, messageId: 2 }), now: () => 1000 });
        const session = make();
        assert.equal(session.resume().ok, true);
        return { session, make };
    };

    const { session, make } = open(makeRecord([hero(filler, { speed: 100 }), foe({ skills: [claw(3)], maxHp: 200 })]));
    const { setup, seed } = session.state().record;
    assert.equal(session.state().status, 'battle');
    assert.equal(session.act({ type: 'end-turn' }).ok, true);
    const mid = await session.restart();
    assert.equal(mid.ok, true, JSON.stringify(mid.reason));
    const record = session.state().record;
    assert.deepEqual([session.state().status, record.actions.length, record.restarts], ['battle', 0, 1]);
    assert.notEqual(record.seed, seed);
    assert.deepEqual(record.setup, setup);
    // 撤退后结果写进聊天记录；重新开始先把它撤成 null
    assert.equal(session.act({ type: 'escape' }).ok, true);
    assert.equal(session.state().status, 'ended');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(typeof records.get(located.combatId)?.result?.reportId, 'string');
    const again = await session.restart();
    assert.equal(again.ok, true, JSON.stringify(again.reason));
    assert.equal(records.get(located.combatId).result, null);
    assert.deepEqual([session.state().status, session.state().record.restarts], ['battle', 2]);
    session.flushPersist();
    const reopened = make();
    assert.equal(reopened.resume().session.status, 'battle');
    assert.equal(reopened.state().record.restarts, 2);

    // 胜利后不给：敌人 1 血，一张打击即胜
    records.clear();
    const won = open(makeRecord([hero(Array(5).fill('basic-strike'), { speed: 100 }), foe({ maxHp: 1 })])).session;
    const strike = won.state().legal.find((a) => a.type === 'play');
    assert.ok(strike);
    won.act(strike);
    if (won.state().status === 'battle') won.act({ type: 'end-turn' });
    assert.equal(won.state().battle.outcome, 'victory');
    assert.equal((await won.restart()).reason, 'combat-restart-unavailable');
});

// ---------- 账本：专属卡按等级解锁 / 助战绝招 ----------
const attack = (id, amount = 6) => ({ id, name: `斩${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount }] });
const guard = (id) => ({ id, name: `守${id}`, type: 'skill', cost: 1, rarity: 'common', effects: [{ op: 'block', amount: 5 }] });
const STARTER = [
    'basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend',
    'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'm1', 'm1', 'm2', 'm2',
];
const classDef = (id) => ({
    kind: 'class', id, className: '剑士', archetype: 'warrior',
    classPassive: { id: `p-${id}`, name: '锋锐', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }] },
    classPool: [1, 2, 5, 6].map((n) => attack(`c${n}`)).concat([3, 4, 7, 8].map((n) => guard(`c${n}`))),
});
const heroDef = () => ({
    kind: 'deck-character', id: 'pc-hero', name: '主角', classRef: 'cls-blade', base: { hp: 80 },
    personalPassive: { id: 'pp-pc-hero', name: '意志', trigger: 'on-low-hp', effects: [{ op: 'block', amount: 6 }] },
    personalPool: [attack('m1'), guard('m2'), attack('m3'), guard('m4')],
    starterDeck: [...STARTER],
});
const row = (def, createdAt, version = 1) => ({ id: def.id, name: def.name || def.className, kind: def.kind, className: def.className || '', version, createdAt, definition: def });
const ai = (mes) => ({ mes, swipe_id: 0, is_user: false });
const user = (mes) => ({ mes, is_user: true });
const report = (result, body) => `<igs-combat-report result="${result}">${body}</igs-combat-report>`;
const win = (amount) => user(report('win', `[igs-combat:exp|我|${amount}|大胜]`));
const expFor = (level) => { let n = 0; while (n <= 100000 && expProgress(n).level < level) n += 1; return n; };

function memoryTables(profile = []) {
    const tables = { profile: [...profile], ledger: [] };
    tables.read = () => ({ ok: true, missing: [], diagnostics: [], profile: clone(tables.profile), ledger: clone(tables.ledger) });
    tables.append = async (kind, records) => {
        const written = [];
        for (const record of records) if (!tables[kind].some((x) => x.id === record.id)) { tables[kind].push(clone(record)); written.push(record.id); }
        return { ok: true, written, present: [], rejected: [], pending: [] };
    };
    return tables;
}
function ledgerSetup(profiles, initial) {
    const tables = memoryTables(profiles);
    const ref = { chat: initial };
    const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '主角', now: () => 7 });
    return { tables, ref, ledger };
}
const heroOf = (state) => state.characters.get('pc-hero');

test('专属卡按等级解锁：Lv5 / Lv10 解锁对应槽位、等级退回重新锁上；剧情提前解锁不重复计；档案没有该槽位时记待生成，写新版本档案后解锁', async () => {
    // 旧档案预生成的专属卡（ID 不带槽位后缀）占第 1 槽，沿用旧规则：升级不自动解锁、不记待生成，只由剧情 learn 解锁。
    const legacy = { id: 'g1', name: '天翔一闪', type: 'attack', cost: 2, rarity: 'signature', effects: [{ op: 'damage', amount: 14 }] };
    const legacyProfiles = () => [row(classDef('cls-blade'), 1), row({ ...heroDef(), signatureCards: [legacy] }, 2)];

    const old = ledgerSetup(legacyProfiles(), [win(expFor(5) - 1), win(1)]);
    await old.ledger.scan();
    let state = await old.ledger.effectiveState();
    assert.equal(heroOf(state).level, 5);
    assert.equal(heroOf(state).owned.get('g1') || 0, 0);
    assert.equal(heroOf(state).deck.includes('g1'), false);
    assert.equal(Object.hasOwn(heroOf(state), 'signatureDue'), false);
    assert.deepEqual(signaturePending(state), []);

    const early = ledgerSetup(legacyProfiles(), [ai('剑光乍起。\n[igs-combat:learn|我|天翔一闪|拔刀即斩]'), win(expFor(5))]);
    const learn = growthEntity((await early.ledger.scan()).pendingGeneration.find((p) => p.kind === 'learn'), heroOf(await early.ledger.effectiveState()), { now: 2 });
    assert.equal((await early.ledger.append([learn.entry])).ok, true);
    assert.equal(heroOf(await early.ledger.effectiveState()).owned.get('g1'), 1);

    // 单条 EXP 上限 1000，升到 Lv10 分两场战报：第 1 槽在第 0 楼跨级，第 2 槽在第 1 楼跨级。
    const fresh = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [win(1000), win(expFor(10) - 1000)]);
    await fresh.ledger.scan();
    state = await fresh.ledger.effectiveState();
    assert.equal(heroOf(state).level, 10);
    assert.deepEqual(heroOf(state).signatureDue.map((d) => [d.slot, d.level, d.anchor.messageId]), [[1, 5, 0], [2, 10, 1]]);
    const pending = signaturePending(state);
    assert.deepEqual(pending.map((p) => [p.kind, p.characterId, p.slots, p.anchor.messageId]), [['signature', 'pc-hero', [1, 2], 0]]);
    const { entity } = growthEntity(pending[0], heroOf(state), { profileMeta: state.profileMeta });
    assert.deepEqual([entity.kind, entity.input.slots, entity.input.costSlots, entity.fixed.version], ['signature-card', [1, 2], [2, 3], 2]);
    const request = async () => JSON.stringify({ entities: [{ key: entity.key, value: { cards: [['天翔一闪', 'strike'], ['终焉雷鸣', 'strike']] } }] });
    const result = await generateEntities([entity], { request, llm: LLM, now: 9 });
    assert.equal(result.ok, true, JSON.stringify(result.rejected));
    const writes = generationWrites(result, { createdAt: 9 });
    assert.deepEqual([writes.profiles.length, writes.entries.length, writes.profiles[0].version], [1, 0, 2]);
    fresh.tables.profile.push(clone(writes.profiles[0]));
    state = await fresh.ledger.effectiveState();
    assert.deepEqual(['pc-hero-g1', 'pc-hero-g2'].map((id) => heroOf(state).owned.get(id)), [1, 1]);
    assert.deepEqual(heroOf(state).profile.signatureCards.map((c) => [c.id, c.name, c.cost]), [['pc-hero-g1', '天翔一闪', 2], ['pc-hero-g2', '终焉雷鸣', 3]]);
    assert.equal(Object.hasOwn(heroOf(state), 'signatureDue'), false);
    assert.deepEqual(signaturePending(state), []);
    // 与档案已有专属卡重名时拒收
    const onlyFirst = { ...heroOf(state), profile: { ...heroOf(state).profile, signatureCards: [heroOf(state).profile.signatureCards[0]] } };
    const dupEntity = growthEntity({ ...pending[0], slots: [2] }, onlyFirst, { profileMeta: state.profileMeta }).entity;
    const dup = await generateEntities([dupEntity], { request: async () => JSON.stringify({ entities: [{ key: dupEntity.key, value: { cards: [['天翔一闪', 'strike']] } }] }), llm: LLM });
    assert.equal(dup.ok, false);
    assert.ok(dup.rejected[0].errors.some((e) => e.reason === 'name-duplicate'));
});

test('助战绝招（ace / legend）取角色自己伤害最高的技能强化：同名、数值 ×1.5、带冷却；新 setup 带 openingCharged / randomTargets', async () => {
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { scaleSkills } = await import('../src/combat/card-scaling.js');
    const skill = (id, amount) => ({ id, name: `技${id}`, intent: 'attack', effects: [{ op: 'damage', amount }] });
    const ace = { kind: 'skill-character', id: 'sc-ace', name: '白露', tier: 'ace', base: { hp: 50 },
        skills: [skill('s1', 10), skill('s2', 6), { id: 's3', name: '守', intent: 'defend', effects: [{ op: 'block', amount: 6 }] }],
        passives: [{ id: 'pa1', name: '守夜', trigger: 'turn-start', effects: [{ op: 'block', amount: 2 }] }] };
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2), row(ace, 3)], [user('出发')]);
    const state = await ledger.effectiveState();
    const lobby = { heroId: 'pc-hero', controllable: ['pc-hero'], allies: [heroOf(state), state.characters.get('sc-ace')], enemies: new Map([['狼', templateEnemy('狼', 'normal')]]) };
    const built = buildSetup(lobby, { enemies: [{ name: '狼', count: 1 }], tier: 'normal' });
    assert.equal(built.ok, true, JSON.stringify(built));
    assert.deepEqual([built.setup.openingCharged, built.setup.randomTargets], [true, true]);
    const unit = built.setup.units.find((u) => u.id === 'sc-ace');
    const expectedSkills = scaleSkills(ace.skills, state.characters.get('sc-ace').attributes).map((s) => Math.min(99, Math.max(1, Math.round(s.effects[0].amount * 1.3))));
    assert.deepEqual(unit.skills.slice(0, 3).map((s) => s.effects[0].amount), expectedSkills);
    const ult = unit.skills.find((s) => s.ultimate);
    assert.deepEqual([ult.id, ult.cooldown, ult.name], ['sc-ace-u1', 3, '技s1']);
    assert.equal(ult.effects[0].amount, Math.min(99, Math.round(expectedSkills[0] * 1.5)));
    const battle = createBattle(built.setup, 1);
    assert.equal(battle.ok, true, JSON.stringify(battle.error));
    assert.equal(chooseSkillIntent(battle.state, 'sc-ace', 0.9).skillId, 'sc-ace-u1');
});

test('场外排位（v0.39.3）：首领 → 精英 → 普通，精英先于普通怪上场与补位；同一 combatId 结果不变', async () => {
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [user('出发')]);
    const state = await ledger.effectiveState();
    const enemies = new Map([['狼', templateEnemy('狼', 'normal')], ['头狼', templateEnemy('头狼', 'elite')]]);
    const lobby = { heroId: 'pc-hero', controllable: ['pc-hero'], allies: [heroOf(state)], enemies };
    const start = { enemies: [{ name: '狼', count: 6 }, { name: '头狼', count: 2 }], tier: 'normal' };
    const built = buildSetup(lobby, start, { combatId: 'c-elite' });
    assert.equal(built.ok, true, JSON.stringify(built));
    const tierOf = (id) => (built.setup.units.find((u) => u.id === id)?.name.startsWith('头狼') ? 'elite' : 'normal');
    assert.equal(built.setup.reserve.length, 3);
    assert.deepEqual(built.setup.reserve.map(tierOf), ['normal', 'normal', 'normal']);
    assert.deepEqual(buildSetup(lobby, start, { combatId: 'c-elite' }).setup.reserve, built.setup.reserve);
});

test('统一失去物：数量省略为1、全角数量、全部与角色默认值；非法标签只记诊断，获得与失去锚点不相撞', () => {
    const text = [
        '[igs-fx:item|失去|青锋剑|被缴械]',
        '[igs-fx:item|失去|回春丹||２|爱丽丝]',
        '[igs-fx:item|失去|火把||全部]',
        '[igs-fx:item|失去|铜钱||很多]',
        '[igs-fx:item|失去|||1]',
        '[igs-fx:item|获得|青锋剑|被缴械|武器]',
    ].join('\n');
    const { directives, diagnostics } = extractLossDirectives(text);
    assert.deepEqual(directives.map((d) => [d.character, d.name, d.count ?? 'all', d.reason]), [['我', '青锋剑', 1, '被缴械'], ['爱丽丝', '回春丹', 2, ''], ['我', '火把', 'all', '']]);
    assert.deepEqual(diagnostics.map((d) => [d.code, d.field, d.problem]), [['combat-loss-invalid', 'count', 'not-integer'], ['combat-loss-invalid', 'name', 'required']]);
    const losses = scanLossTags(text);
    assert.equal(losses.length, 5);
    assert.equal(new Set([...losses, ...scanGainTags(text)].map((tag) => tag.tagHash)).size, 6);
});

test('统一失去物（未注入背包）：装备卸下并移出持有，再获得保留原加成；失去楼换swipe后重放恢复', async () => {
    const gain = '[igs-fx:item|获得|铁弓|猎户的弓|武器|稀有]';
    const regain = '[igs-fx:item|获得|铁弓|夺回的弓|武器]';
    const { ref, ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai(gain), ai('[igs-fx:item|失去|铁弓|被搜走]'), ai(regain)]);
    const anchorOf = (messageId, text) => {
        const [tag] = scanGainTags(text);
        return { messageId, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
    };
    const equip = (anchor, description, rarity, bonus) => ({ id: ledgerEntryId('equip', 'pc-hero', anchor), type: 'equip', character: 'pc-hero', anchor, createdAt: 1,
        payload: { gearId: gearIdFor('铁弓'), name: '铁弓', slot: 'weapon', description, rarity, bonus } });
    const bonus = { ability: 'dex', amount: 3 };
    assert.equal((await ledger.append([equip(anchorOf(0, gain), '猎户的弓', 'rare', bonus)])).ok, true);
    assert.equal((await ledger.scan()).ok, true);
    let me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.gear.slots.weapon ?? null, me.gear.bag.length], [null, 0]);
    assert.equal((await ledger.append([equip(anchorOf(2, regain), '夺回的弓', 'common', { ability: 'dex', amount: 1 })])).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.gear.slots.weapon?.description, me.gear.slots.weapon?.rarity, me.gear.slots.weapon?.bonus], ['猎户的弓', 'rare', bonus]);
    ref.chat[1].swipe_id = 1;
    assert.equal(heroOf(await ledger.effectiveState()).gear.slots.weapon?.description, '夺回的弓');
});

test('统一失去物：物品表扣减、已丢失不删行、装备卸下保留定义；补扫幂等，再获得恢复原加成', async () => {
    const host = createLedgerMockHost();
    host.sheets.sheet_userbag = userInventorySheet();
    const tables = createCombatTables({ api: host.api });
    const inventory = createInventoryTables({ api: host.api, client: tables.client, serial: tables.serial });
    assert.equal((await tables.ensure()).ok, true);
    assert.equal((await inventory.ensure()).ok, true);
    assert.equal((await tables.append('profile', [row(classDef('cls-blade'), 1), row(heroDef(), 2)])).ok, true);
    const gain = '[igs-fx:item|获得|回春丹|回复|道具]';
    const chat = [ai(gain)];
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', inventory, now: () => 7 });
    const ring = { gearId: gearIdFor('铜戒'), name: '铜戒', slot: 'accessory', description: '刻着家纹', rarity: 'epic', bonus: { ability: 'con', amount: 4 } };
    assert.equal((await ledger.grantInitialGear('pc-hero', [ring], { anchor: { messageId: 0, swipeId: 0 } })).ok, true);
    const [tag] = scanGainTags(gain);
    const anchor = { messageId: 0, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
    assert.equal((await ledger.append([{ id: ledgerEntryId('item', 'pc-hero', anchor), type: 'item', character: 'pc-hero', anchor, createdAt: 1,
        payload: { itemId: itemIdFor('回春丹'), name: '回春丹', count: 2, effects: [{ op: 'heal', amount: 10 }], description: '回复' } }])).ok, true);
    assert.equal((await inventory.changeQuantities({ name: '火把', delta: 2, category: '杂物' })).ok, true);
    chat.push(ai('[igs-fx:item|失去|铜戒|被搜走]\n[igs-fx:item|失去|回春丹|被抢走]\n[igs-fx:item|失去|火把||全部]'));
    const scan = await ledger.scan();
    assert.equal(scan.ok, true, JSON.stringify(scan));
    const lost = inventory.read().inventory.items.filter((item) => item.lost);
    assert.deepEqual(lost.map((item) => [item.name, item.quantity]), [['铜戒', 1], ['火把', 2]]);
    assert.equal(host.calls.deleteRow, 0);
    let me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.gear.slots.accessory ?? null, me.gear.bag.length, me.others.length, me.items.map((item) => [item.name, item.count])], [null, 0, 0, [['回春丹', 1]]]);
    await ledger.scan();
    assert.equal(tables.read().ledger.filter((entry) => entry.type === 'lose').length, 3);

    const regained = '[igs-fx:item|获得|铜戒|夺回的戒指|饰品]';
    chat.push(ai(regained));
    const [again] = scanGainTags(regained);
    const back = { messageId: 2, swipeId: 0, tagHash: again.tagHash, occurrence: again.occurrence };
    const result = await ledger.append([{ id: ledgerEntryId('equip', 'pc-hero', back), type: 'equip', character: 'pc-hero', anchor: back, createdAt: 8,
        payload: { ...ring, description: '普通的戒指', rarity: 'common', bonus: { ability: 'con', amount: 1 } } }]);
    assert.equal(result.ok, true, JSON.stringify(result));
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.gear.slots.accessory?.description, me.gear.slots.accessory?.rarity, me.gear.slots.accessory?.bonus], ['刻着家纹', 'epic', ring.bonus]);
    const restored = inventory.read().inventory.items.find((item) => item.name === '铜戒');
    assert.deepEqual([restored.quantity, restored.category, restored.lost], [1, '装备', undefined]);
});

test('奖励槽位：普通盲翻卡牌率为杂兵30%、精英40%、首领50%；保留保底槽、备用套和翻牌联动', () => {
    const character = { kind: 'deck-character', id: 'pc-hero' };
    const targets = { normal: 0.3, elite: 0.4, boss: 0.5 };
    const hits = Object.fromEntries(Object.keys(targets).map((tier) => [tier, { main: 0, reserve: 0 }]));
    const samples = 3000;
    const rank = (rarity) => ['common', 'uncommon', 'rare', 'epic', 'mythic'].indexOf(rarity);
    for (let i = 0; i < samples; i += 1) {
        for (const tier of Object.keys(targets)) {
            const combatId = `cb|${i}`;
            const plan = planRewardSlots({ combatId, tier, enemyTiers: [tier], character });
            assert.deepEqual([plan.exp, plan.slots.length, plan.reserve.length], [victoryExpFor([tier]), REWARD_SLOT_COUNT, REWARD_SLOT_COUNT]);
            for (const [set, slots] of [['main', plan.slots], ['reserve', plan.reserve]]) {
                const index = flipOrder({ combatId, slots: plan.slots, reserve: plan.reserve }, set)[0];
                hits[tier][set] += slots[index].kind === 'card' ? 1 : 0;
                for (const slot of slots) {
                    assert.ok(rank(slot.rarity) >= 0);
                    if (slot.kind === 'card') {
                        assert.ok([0, 1, 2, 3].includes(slot.cost));
                        if (tier === 'normal') assert.ok(rank(slot.rarity) <= 1);
                    }
                    if (slot.kind === 'item') assert.equal(slot.count, rank(slot.rarity) >= 3 ? 2 : 1);
                }
                if (tier !== 'normal') assert.notEqual(slots[0].kind, 'keepsake');
                if (tier === 'boss') assert.ok(rank(slots[0].rarity) >= 3);
            }
        }
    }
    for (const tier of Object.keys(targets)) for (const set of ['main', 'reserve']) {
        const rate = hits[tier][set] / samples;
        assert.ok(Math.abs(rate - targets[tier]) < 0.035, `${tier} ${set} card ${rate}`);
    }
    const base = planRewardSlots({ combatId: 'cb|x', tier: 'elite', character });
    assert.deepEqual(base, planRewardSlots({ combatId: 'cb|x', tier: 'elite', character }));
    const reflip = planRewardSlots({ combatId: 'cb|x', tier: 'elite', character, links: { reflip: true } });
    assert.deepEqual([reflip.slots.length, reflip.reserve.length], [REWARD_SLOT_COUNT + 1, REWARD_SLOT_COUNT + 1]);
    const lucky = planRewardSlots({ combatId: 'cb|x', tier: 'elite', character, links: { fortune: true } });
    for (const set of ['slots', 'reserve']) {
        const steps = lucky[set].map((slot, i) => rank(slot.rarity) - rank(base[set][i].rarity));
        assert.deepEqual([steps.filter((step) => step === 1).length, steps.every((step) => step === 0 || step === 1)], [1, true]);
    }
    for (let i = 0; i < 50; i += 1) {
        const plan = planRewardSlots({ combatId: `cb|s${i}`, tier: 'boss', character: { kind: 'skill-character', id: 'sc-a' } });
        assert.ok([...plan.slots, ...plan.reserve].every((slot) => slot.kind !== 'card'));
    }
});

test('正文完成：普通正文和重复就绪通知都检查主角档案，仍转发开战准备与成长楼层', async t => {
    const { bootstrapIGS } = await import('../src/index.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { createCombatServices } = await import('../src/core/combat-services.js');
    const callbacks = new Set(), calls = [];
    const global = { localStorage: createMemoryStorage() };
    const services = { ...createCombatServices({ global }),
        syncRegex() {}, refreshGrowth() {}, takeoverInventory() {},
        prepareProtagonist() { calls.push(['protagonist']); },
        autoPrepare(id) { calls.push(['prepare', id]); },
        autoGrowth(id) { calls.push(['growth', id]); },
    };
    const vn = bootstrapIGS({ global, autoAttachMagicWand: false, combatServices: services,
        illustrationMessageHost: {
            getChatId: () => 'ordinary-story', readFloor: id => ({ messageId: id, text: '只是普通正文，没有开战或立绘标签。' }),
            on: () => () => {}, readPreviousAiTexts: () => [], readCharacterLore: async () => [],
            onImageFloorReady(fn) { callbacks.add(fn); return () => callbacks.delete(fn); },
            attachPromptStrip() {}, ensureMarkerRegexes: async () => ({ ok: true }), destroy() {},
        },
        hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) },
    });
    t.after(() => vn.shutdown());
    const notify = () => { for (const callback of callbacks) callback(7); };
    assert.ok(callbacks.size > 0, '已订阅正文完成通知');
    calls.length = 0;
    notify(); notify();
    assert.deepEqual(calls, [
        ['protagonist'], ['prepare', 7], ['growth', 7],
        ['protagonist'], ['prepare', 7], ['growth', 7],
    ]);
});

test('背包装备详情：显示原六维加成与被动，物品描述保持文本转义', async t => {
    const { JSDOM } = await import('jsdom');
    const { createRecordPanelController } = await import('../src/visual/igs-ui/record-panel.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const dom = new JSDOM('<div id="igs-overlay"></div>');
    const host = createLedgerMockHost({ supportCallbacks: true });
    host.sheets.sheet_userbag = { ...userInventorySheet(), content: [
        ['row_id', '物品名称', '数量', '类别', '描述/效果'],
        ['1', '铜戒', '1', '装备', '<img src=x onerror=alert(1)>'],
    ] };
    const gear = { gearId: gearIdFor('铜戒'), name: '铜戒', slot: 'accessory', rarity: 'rare',
        bonus: { ability: 'str', amount: 3 }, passive: { name: '护心', description: '每回合获得2点格挡' }, count: 1 };
    const inventory = { ok: true, points: 0, gear: { slots: {}, bag: [gear] }, items: [], collection: [], others: [] };
    const panel = createRecordPanelController(dom.window.document,
        { AutoCardUpdaterAPI: host.api, localStorage: createMemoryStorage() }, null,
        { getHeroInventory: () => inventory });
    t.after(() => { panel.close(); dom.window.close(); });
    assert.equal(panel.open(dom.window.document.querySelector('#igs-overlay'), {}, 'inventory').ok, true);
    assert.equal(panel.getState().model.status, 'ready');
    const item = dom.window.document.querySelector('.igs-record-slots [data-record-act="select"]');
    assert.ok(item, '物品表中的装备可选');
    item.click();
    const detail = dom.window.document.querySelector('.igs-record-item-detail');
    assert.ok(detail);
    assert.match(detail.textContent, /加成.*力量 \+3/);
    assert.match(detail.textContent, /被动.*每回合获得2点格挡/);
    assert.ok(detail.textContent.includes('<img src=x onerror=alert(1)>'));
    assert.equal(detail.querySelector('img'), null);
});


test('永久成长账本（G24 / G25）：经真实写口写入并回读；同 ID 幂等；累计封顶 20；战报 ID 不符失效；下一场目录与最大生命带上成长', async () => {
    const { BATTLE_GROWTH_TAG_HASH } = await import('../src/combat/ledger.js');
    const { templateEnemy } = await import('../src/combat/generation.js');
    const host = createLedgerMockHost();
    host.sheets.sheet_userbag = userInventorySheet();
    const tables = createCombatTables({ api: host.api });
    assert.equal((await tables.ensure()).ok, true);
    assert.equal((await tables.append('profile', [row(classDef('cls-blade'), 1), row(heroDef(), 2)])).ok, true);
    const floor = (id) => user(`<igs-combat-report id="${id}" result="win">战报</igs-combat-report>`);
    const chat = [floor('r1')];
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7 });
    const before = heroOf(await ledger.effectiveState());
    assert.equal(Object.hasOwn(before, 'battleGrowth'), false);

    const entryAt = (messageId, payload) => {
        const anchor = { messageId, swipeId: 0, tagHash: BATTLE_GROWTH_TAG_HASH, occurrence: 0 };
        return { id: ledgerEntryId('battle-growth', 'pc-hero', anchor), type: 'battle-growth', character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const first = entryAt(0, { cards: [{ cardId: 'c1', damage: 2, block: 0 }, { cardId: 'c3', damage: 0, block: 1 }], hpMax: 3, reportId: 'r1' });
    const written = await ledger.append([first]);
    assert.equal(written.ok, true, JSON.stringify(written));
    assert.deepEqual(tables.read().ledger.filter((e) => e.type === 'battle-growth').map((e) => e.id), [first.id]);
    assert.equal((await ledger.append([clone(first)])).ok, true);
    assert.equal(tables.read().ledger.filter((e) => e.type === 'battle-growth').length, 1);

    let me = heroOf(await ledger.effectiveState());
    assert.deepEqual(me.battleGrowth, { cards: { c1: { damage: 2, block: 0 }, c3: { damage: 0, block: 1 } }, hpMax: 3 });
    assert.equal(me.hpMax - before.hpMax, 3);

    chat.push(floor('r2'));
    assert.equal((await ledger.append([entryAt(1, { cards: [{ cardId: 'c1', damage: 20, block: 0 }], hpMax: 20, reportId: 'r2' })])).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.battleGrowth.cards.c1.damage, me.battleGrowth.hpMax], [20, 20]);

    chat[1] = floor('r9');
    const stale = await ledger.effectiveState();
    assert.ok(stale.inactive.some((item) => item.reason === 'battle-growth-report-invalid'));
    me = heroOf(stale);
    assert.deepEqual([me.battleGrowth.cards.c1.damage, me.battleGrowth.hpMax], [2, 3]);

    const lobbyOf = (character) => ({ heroId: 'pc-hero', controllable: ['pc-hero'], allies: [character], enemies: new Map([['狼', templateEnemy('狼', 'normal')]]) });
    const unitOf = (character) => {
        const built = buildSetup(lobbyOf(character), { enemies: [{ name: '狼', count: 1 }], tier: 'normal' });
        assert.equal(built.ok, true, JSON.stringify(built));
        return built.setup.units.find((u) => u.id === 'pc-hero');
    };
    const grown = unitOf(me);
    const plain = unitOf({ ...me, battleGrowth: undefined, hpMax: me.hpMax - 3 });
    assert.equal(grown.catalog.c1.effects[0].amount - plain.catalog.c1.effects[0].amount, 2);
    assert.equal(grown.catalog.c3.effects[0].amount - plain.catalog.c3.effects[0].amount, 1);
    assert.equal(grown.maxHp - plain.maxHp, 3);
    assert.equal(createBattle(buildSetup(lobbyOf(me), { enemies: [{ name: '狼', count: 1 }], tier: 'normal' }).setup, 1).ok, true);
});


test('单张副本（P5a）：起始卡组每张一个副本；带 copyId 的永久成长只记那一张，旧的按牌 ID 成长由同名每张继承；战报失效即回退；开战牌面只给那一张加成', async () => {
    const { BATTLE_GROWTH_TAG_HASH } = await import('../src/combat/ledger.js');
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { cardView } = await import('../src/combat/battle-state.js');
    const floor = (id) => user(`<igs-combat-report id="${id}" result="win">战报</igs-combat-report>`);
    const { ledger, ref } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [floor('r1'), floor('r2')]);
    let me = heroOf(await ledger.effectiveState());
    assert.equal(me.copies.length, STARTER.length);
    assert.equal(new Set(me.deckEntries.map((e) => e.copyId)).size, STARTER.length);
    const c1 = me.deckEntries.filter((e) => e.cardId === 'c1').map((e) => e.copyId);
    assert.equal(c1.length, 3);
    const entryAt = (messageId, payload) => {
        const anchor = { messageId, swipeId: 0, tagHash: BATTLE_GROWTH_TAG_HASH, occurrence: 0 };
        return { id: ledgerEntryId('battle-growth', 'pc-hero', anchor), type: 'battle-growth', character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const bonusOf = (view) => view.deckEntries.filter((e) => e.cardId === 'c1').map((e) => e.bonus?.damage || 0);
    assert.equal((await ledger.append([entryAt(0, { cards: [{ cardId: 'c1', copyId: c1[1], damage: 3, block: 0 }], hpMax: 0, reportId: 'r1' })])).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual(bonusOf(me), [0, 3, 0]);
    assert.equal(Object.hasOwn(me, 'battleGrowth'), false);

    assert.equal((await ledger.append([entryAt(1, { cards: [{ cardId: 'c1', damage: 2, block: 0 }], hpMax: 0, reportId: 'r2' })])).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual(me.battleGrowth.cards.c1, { damage: 2, block: 0 });
    assert.deepEqual(bonusOf(me), [0, 3, 0]);

    const lobbyOf = (character) => ({ heroId: 'pc-hero', controllable: ['pc-hero'], allies: [character], enemies: new Map([['狼', templateEnemy('狼', 'normal')]]) });
    const built = buildSetup(lobbyOf(me), { enemies: [{ name: '狼', count: 1 }], tier: 'normal' });
    assert.equal(built.ok, true, JSON.stringify(built));
    const created = createBattle(built.setup, 1);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    const amountOf = (copyId) => {
        const inst = Object.keys(created.state.cards).find((key) => created.state.cards[key].copyId === copyId);
        return cardView(created.state, inst).effects[0].amount;
    };
    assert.equal(amountOf(c1[1]) - amountOf(c1[0]), 3);
    assert.equal(amountOf(c1[2]), amountOf(c1[0]));

    ref.chat = [floor('r9'), floor('r2')];
    const stale = await ledger.effectiveState();
    assert.ok(stale.inactive.some((item) => item.reason === 'battle-growth-report-invalid'));
    assert.deepEqual(bonusOf(heroOf(stale)), [0, 0, 0]);
});

test('同模型并卡（P5a）：带 merge 的学牌记录与已持有牌模型一致时并为那张牌的一张副本，不新建目录条目；不带标记的旧记录与模型不同的牌照旧新建', async () => {
    const tag = (skill) => ai(`剑光乍起。\n[igs-combat:learn|我|${skill}|习得]`);
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [tag('新斩'), tag('旧斩'), tag('重斩')]);
    const pending = (await ledger.scan()).pendingGeneration.filter((p) => p.kind === 'learn');
    assert.equal(pending.length, 3);
    const learnAt = (p, card, merge) => ({ id: ledgerEntryId('learn', 'pc-hero', p.anchor), type: 'learn', character: 'pc-hero', anchor: p.anchor, payload: { card, ...(merge ? { merge: true } : {}) }, createdAt: 7 });
    const same = (id, name) => ({ ...attack(id), name });
    const written = await ledger.append([
        learnAt(pending[0], same('lc-a', '新斩'), true),
        learnAt(pending[1], same('lc-b', '旧斩'), false),
        learnAt(pending[2], { ...attack('lc-c'), type: 'skill', name: '重斩' }, true),
    ]);
    assert.equal(written.ok, true, JSON.stringify(written));
    const state = await ledger.effectiveState();
    const me = heroOf(state);
    assert.equal(me.owned.get('c1'), 4);
    assert.equal(me.catalog.has('lc-a'), false);
    assert.equal(me.copies.filter((r) => r.cardId === 'c1').length, 4);
    assert.deepEqual(['lc-b', 'lc-c'].map((id) => [me.catalog.has(id), me.owned.get(id)]), [[true, 1], [true, 1]]);
    assert.equal(state.diagnostics.some((d) => d.code === 'combat-card-id-collision'), false);
});


test('卡牌刻印（P5b）：inscribe 记录按副本刻印，不带 copyId 取卡组里第一张未刻的同名副本；已刻、牌面不符记诊断；标签失效即回退；开战牌面只给那一张', async () => {
    const { scanCombatTags } = await import('../src/scene/combat-directives.js');
    const { cardView } = await import('../src/combat/battle-state.js');
    const { templateEnemy } = await import('../src/combat/generation.js');
    const lines = ['[igs-combat:inscribe|主角|斩c1|锋利|开悟]', '[igs-combat:inscribe|主角|斩c1|锋利|再悟]', '[igs-combat:inscribe|主角|斩c1|灵动|误刻]'];
    const { ledger, ref } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], lines.map(ai));
    const entryAt = (messageId, payload) => {
        const [tag] = scanCombatTags(lines[messageId]);
        const anchor = { messageId, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
        return { id: ledgerEntryId('inscribe', 'pc-hero', anchor), type: 'inscribe', character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    let me = heroOf(await ledger.effectiveState());
    const c1 = me.deckEntries.filter((e) => e.cardId === 'c1').map((e) => e.copyId);
    const marks = (view) => view.deckEntries.filter((e) => e.cardId === 'c1').map((e) => e.inscription ?? null);
    assert.deepEqual(marks(me), [null, null, null]);
    assert.equal((await ledger.append([
        entryAt(0, { cardId: 'c1', inscription: 'sharp', reason: '开悟' }),
        entryAt(1, { cardId: 'c1', copyId: c1[0], inscription: 'sharp', reason: '再悟' }),
        entryAt(2, { cardId: 'c1', inscription: 'nimble', reason: '误刻' }),
    ])).ok, true);
    const effective = await ledger.effectiveState();
    me = heroOf(effective);
    assert.deepEqual(marks(me), ['sharp', null, null]);
    const codes = effective.diagnostics.map((d) => d.code);
    assert.ok(codes.includes('combat-inscribe-copy-invalid'), JSON.stringify(codes));
    assert.ok(codes.includes('combat-inscribe-invalid'), JSON.stringify(codes));

    const built = buildSetup({ heroId: 'pc-hero', controllable: ['pc-hero'], allies: [me], enemies: new Map([['狼', templateEnemy('狼', 'normal')]]) }, { enemies: [{ name: '狼', count: 1 }], tier: 'normal' });
    assert.equal(built.ok, true, JSON.stringify(built));
    const created = createBattle(built.setup, 1);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    const instOfCopy = (copyId) => Object.keys(created.state.cards).find((key) => created.state.cards[key].copyId === copyId);
    assert.equal(created.state.cards[instOfCopy(c1[0])].inscription, 'sharp');
    assert.equal(created.state.cards[instOfCopy(c1[1])].inscription, undefined);
    assert.equal(cardView(created.state, instOfCopy(c1[0])).effects[0].amount - cardView(created.state, instOfCopy(c1[1])).effects[0].amount, 3);

    ref.chat = lines.map(() => ai('正文'));
    const stale = await ledger.effectiveState();
    assert.ok(stale.inactive.some((item) => item.reason === 'tag-missing'));
    assert.deepEqual(marks(heroOf(stale)), [null, null, null]);
});

test('卡牌刻印（P5b）：重建保留带刻印的副本（旧个人池牌与减张的职业牌），螺旋只限基础攻击与基础防御，不带 copyId 的刻印只取卡组里的副本', async () => {
    const { scanCombatTags } = await import('../src/scene/combat-directives.js');
    const { inscribable } = await import('../src/combat/mechanics/inscription.js');
    const { TOKEN_CARDS } = await import('../src/combat/rules.js');
    assert.equal(inscribable(BASIC_CARDS['basic-strike'], 'spiral'), true);
    assert.equal(inscribable(BASIC_CARDS['basic-defend'], 'spiral'), true);
    for (const id of ['token-shard', 'token-ward', 'token-spark']) assert.equal(inscribable(TOKEN_CARDS[id], 'spiral'), false, id);

    const lines = [
        '[igs-combat:inscribe|主角|斩m1|锋利|a]', '[igs-combat:inscribe|主角|攻击|螺旋|b]', '[igs-combat:inscribe|主角|斩c2|螺旋|c]',
        '[igs-combat:inscribe|主角|斩c1|锋利|d]', '正文', '正文', '[igs-combat:inscribe|主角|斩c5|锋利|e]',
    ];
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], lines.map(ai));
    const tagEntry = (messageId, payload) => {
        const [tag] = scanCombatTags(lines[messageId]);
        const anchor = { messageId, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
        return { id: ledgerEntryId('inscribe', 'pc-hero', anchor), type: 'inscribe', character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const floorEntry = (type, messageId, payload) => {
        const anchor = { messageId, swipeId: 0, tagHash: type, occurrence: 0 };
        return { id: ledgerEntryId(type, 'pc-hero', anchor), type, character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const classCards = ['c2', 'c2', 'c2', 'c3', 'c3', 'c3', 'c4', 'c4', 'c4', 'c5'];
    const newDeck = ['basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend', ...classCards, 'n1', 'n1', 'n2', 'n2'];
    const marks = [
        tagEntry(0, { cardId: 'm1', inscription: 'sharp', reason: 'a' }),
        tagEntry(1, { cardId: 'basic-strike', inscription: 'spiral', reason: 'b' }),
        tagEntry(2, { cardId: 'c2', inscription: 'spiral', reason: 'c' }),
        tagEntry(3, { cardId: 'c1', inscription: 'sharp', reason: 'd' }),
    ];
    const rebuild = floorEntry('rebuild', 4, { personalPool: [attack('n1'), guard('n2'), attack('n3'), guard('n4')], starterDeck: newDeck, cost: 200 });
    assert.equal((await ledger.append([...marks, rebuild])).ok, true);
    let effective = await ledger.effectiveState();
    const diag = (entry) => effective.diagnostics.find((d) => d.id === entry.id)?.code ?? null;
    assert.deepEqual(marks.map(diag), [null, null, 'combat-inscribe-invalid', null]);
    assert.equal(diag(rebuild), null, JSON.stringify(effective.diagnostics));
    let me = heroOf(effective);
    const copiesOf = (view, cardId) => view.copies.filter((c) => c.cardId === cardId);
    assert.deepEqual(copiesOf(me, 'm1').map((c) => c.inscription), ['sharp']);
    assert.equal(me.catalog.has('m1'), true);
    assert.equal(me.catalog.has('m2'), false);
    assert.deepEqual(copiesOf(me, 'c1').map((c) => c.inscription), ['sharp']);
    assert.deepEqual(me.deck, newDeck);
    assert.equal(me.deckEntries.filter((e) => e.cardId === 'basic-strike' && e.inscription === 'spiral').length, 1);
    const m1Copy = copiesOf(me, 'm1')[0].copyId;
    assert.equal(me.deckEntries.some((e) => e.copyId === m1Copy), false);

    // 把刻印的 m1 放回卡组、换下唯一一张 c5：之后不带 copyId 刻 c5 只看卡组，记诊断。
    const swapped = [...newDeck.slice(0, 15), 'm1', ...newDeck.slice(16)];
    const deck = floorEntry('deck', 5, { cards: swapped, revision: 1 });
    const late = tagEntry(6, { cardId: 'c5', inscription: 'sharp', reason: 'e' });
    assert.equal((await ledger.append([deck, late])).ok, true);
    effective = await ledger.effectiveState();
    me = heroOf(effective);
    assert.equal(me.deckEntries.find((e) => e.cardId === 'm1')?.inscription, 'sharp');
    assert.equal(me.deckEntries.some((e) => e.cardId === 'c5'), false);
    assert.deepEqual(copiesOf(me, 'c5').map((c) => c.inscription ?? null), [null]);
    assert.equal(diag(late), 'combat-inscribe-no-copy');
});


test('刻印奖励（P5b）：开启刻印的卡组角色按种子出刻印槽并定下刻印与卡组副本，未开启、技能角色、无可刻副本时不出；翻牌入账经 loot 刻在那张副本上', async () => {
    const { assembleReward } = await import('../src/combat/generation-assembly.js');
    const { reportIdFor, attachLoot } = await import('../src/combat/report.js');
    const { inscribable } = await import('../src/combat/mechanics/inscription.js');
    const rid = reportIdFor('cb|ins');
    const lines = [ai('正文'), ai('续写')];
    const { ledger, ref } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], lines);
    const me = heroOf(await ledger.effectiveState());
    const deckCopy = new Set(me.deckEntries.map((e) => e.copyId));
    const all = (plan) => [...plan.slots, ...plan.reserve];
    let found = null;
    let seen = 0;
    for (let i = 0; i < 200; i += 1) {
        const plan = planRewardSlots({ combatId: `cb|${i}`, tier: 'boss', character: me, inscribe: true });
        for (const slot of all(plan).filter((s) => s.kind === 'inscribe')) {
            seen += 1;
            assert.ok(deckCopy.has(slot.copyId), slot.copyId);
            assert.equal(inscribable(me.catalog.get(slot.cardId), slot.inscription), true);
            if (!found && plan.slots.includes(slot)) found = { combatId: `cb|${i}`, slot };
        }
        assert.equal(all(planRewardSlots({ combatId: `cb|${i}`, tier: 'boss', character: me })).some((s) => s.kind === 'inscribe'), false);
        assert.equal(all(planRewardSlots({ combatId: `cb|${i}`, tier: 'boss', character: { kind: 'skill-character', id: 'sc' }, inscribe: true })).some((s) => s.kind === 'inscribe'), false);
        assert.equal(all(planRewardSlots({ combatId: `cb|${i}`, tier: 'boss', character: { ...me, deckEntries: [] }, inscribe: true })).some((s) => s.kind === 'inscribe'), false);
    }
    assert.ok(seen > 20 && found, `inscribe slots ${seen}`);
    assert.deepEqual(planRewardSlots({ combatId: found.combatId, tier: 'boss', character: me, inscribe: true }).slots[found.slot.index], found.slot);

    const assembled = assembleReward({ slots: [[null, null, '血战之后']] }, { key: 'k', input: { seed: 's', slots: [found.slot] } });
    assert.equal(assembled.errors, undefined, JSON.stringify(assembled.errors));
    const insSlot = assembled.value.slots[0];
    assert.deepEqual([insSlot.kind, insSlot.copyId, insSlot.inscription, insSlot.origin], ['inscribe', found.slot.copyId, found.slot.inscription, '血战之后']);

    const filler = (index) => ({ index, kind: 'keepsake', rarity: 'rare', name: `杂物${index}`, origin: '' });
    const slots = [0, 1, 2].map((index) => (index === found.slot.index ? { ...insSlot, index } : filler(index)));
    const offerAnchor = { messageId: 0, swipeId: 0, tagHash: 'offer', occurrence: 0 };
    const offer = { id: ledgerEntryId('offer', 'pc-hero', offerAnchor), type: 'offer', character: 'pc-hero', anchor: offerAnchor, payload: { combatId: 'cb|ins', tier: 'boss', exp: 10, reveal: 0, slots }, createdAt: 7 };
    assert.equal((await ledger.append([offer])).ok, true);
    const reportText = attachLoot(`<igs-combat-report result="win" id="${rid}">终局：我方获胜。</igs-combat-report>`, { character: '主角', reportId: rid, index: found.slot.index, set: 'main', slot: insSlot });
    assert.ok(reportText.includes(`在「${insSlot.cardName}」上刻下了`), reportText);
    ref.chat = [ai('正文'), user(reportText)];
    const scanned = await ledger.scan();
    const loot = scanned.entries.filter((e) => e.type === 'loot');
    assert.equal(loot.length, 1, JSON.stringify(scanned.diagnostics));
    assert.equal((await ledger.append(loot)).ok, true);
    const after = await ledger.effectiveState();
    assert.equal(after.diagnostics.some((d) => d.id === loot[0].id), false, JSON.stringify(after.diagnostics));
    const hero = heroOf(after);
    assert.equal(hero.deckEntries.find((e) => e.copyId === insSlot.copyId)?.inscription, insSlot.inscription);
    assert.equal(hero.deckEntries.filter((e) => e.inscription).length, 1);
});

test('刻印标签（P5b）：扫描正文 inscribe 标签按牌名取卡组里第一张可刻副本写明 copyId；同楼多个标签分到不同副本；刻印名未知、牌不在卡组、牌面不符记诊断；入账后再扫不重复', async () => {
    const lines = [
        '[igs-combat:inscribe|主角|斩c1|锋利|开悟]', '[igs-combat:inscribe|我|斩c1|灵动|误刻]', '[igs-combat:inscribe|主角|斩c9|锋利|无此牌]',
        '[igs-combat:inscribe|主角|斩c1|闪耀|无此印]', '[igs-combat:inscribe|主角|斩m3|锋利|不在卡组]',
        '剑意再起。\n[igs-combat:inscribe|主角|斩c1|锋利|再悟]\n[igs-combat:inscribe|主角|斩c1|墨染|三悟]',
    ];
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], lines.map(ai));
    const scanned = await ledger.scan();
    const entries = scanned.entries.filter((e) => e.type === 'inscribe');
    assert.deepEqual(entries.map((e) => [e.anchor.messageId, e.payload.cardId, e.payload.inscription]), [[0, 'c1', 'sharp'], [5, 'c1', 'sharp'], [5, 'c1', 'ink']]);
    assert.equal(new Set(entries.map((e) => e.payload.copyId)).size, 3);
    const diag = (messageId) => scanned.diagnostics.find((d) => d.messageId === messageId && String(d.code).startsWith('combat-inscribe'))?.code;
    assert.deepEqual([1, 2, 3, 4].map(diag), ['combat-inscribe-invalid', 'combat-inscribe-card-unknown', 'combat-inscribe-unknown', 'combat-inscribe-card-unknown']);
    assert.equal(scanned.diagnostics.some((d) => d.code === 'combat-tag-unknown'), false);
    assert.equal((await ledger.append(entries)).ok, true);
    const effective = await ledger.effectiveState();
    assert.equal(effective.diagnostics.some((d) => entries.some((e) => e.id === d.id)), false, JSON.stringify(effective.diagnostics));
    const me = heroOf(effective);
    assert.deepEqual(me.deckEntries.filter((e) => e.cardId === 'c1').map((e) => e.inscription ?? null), ['sharp', 'sharp', 'ink']);
    assert.equal((await ledger.scan()).entries.filter((e) => e.type === 'inscribe').length, 0);
});

test('宝物多槽（规则 v6）：最多 4 件，第 5 件顶替最早一件；面板按 slotIndex 换指定格、卸下一件不动其余；旧单值按一件读；联动聚合全部宝物', async () => {
    const names = ['玉佩', '铜镜', '香囊', '骨笛', '金铃'];
    const tags = names.map((name) => `[igs-fx:item|获得|${name}|传家之物|宝物]`);
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], tags.map(ai));
    const equip = (i) => {
        const [tag] = scanGainTags(tags[i]);
        const anchor = { messageId: i, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
        return { id: ledgerEntryId('equip', 'pc-hero', anchor), type: 'equip', character: 'pc-hero', anchor, createdAt: 1,
            payload: { gearId: gearIdFor(names[i]), name: names[i], slot: 'treasure', description: '传家之物', rarity: 'rare', bonus: { ability: 'wis', amount: 1 } } };
    };
    const worn = async () => {
        const me = heroOf(await ledger.effectiveState());
        return [me.gear.slots.treasure.map((g) => g.name), me.gear.bag.map((g) => g.name)];
    };
    const first = await ledger.append([0, 1, 2, 3].map(equip));
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.deepEqual(await worn(), [names.slice(0, 4), []]);
    assert.equal((await ledger.append([equip(4)])).ok, true);
    assert.deepEqual(await worn(), [['铜镜', '香囊', '骨笛', '金铃'], ['玉佩']]);
    const swapped = await ledger.setGear('pc-hero', gearIdFor('玉佩'), true, 1);
    assert.equal(swapped.ok, true, JSON.stringify(swapped));
    assert.deepEqual(await worn(), [['铜镜', '玉佩', '骨笛', '金铃'], ['香囊']]);
    assert.equal((await ledger.setGear('pc-hero', gearIdFor('骨笛'), false)).ok, true);
    assert.deepEqual(await worn(), [['铜镜', '玉佩', '金铃'], ['香囊', '骨笛']]);
    assert.equal((await ledger.setGear('pc-hero', gearIdFor('骨笛'), true)).ok, true);
    assert.deepEqual(await worn(), [['铜镜', '玉佩', '金铃', '骨笛'], ['香囊']]);

    const legacy = { treasure: 'a' };
    assert.deepEqual([slotGearList(legacy.treasure), equippedGear({ weapon: 'w', treasure: ['a', 'b'] })], [['a'], ['w', 'a', 'b']]);
    placeGear(legacy, 'treasure', 'b');
    assert.deepEqual(legacy.treasure, ['a', 'b']);
    removeGear(legacy, 'a');
    removeGear(legacy, 'b');
    assert.equal('treasure' in legacy, false);
    assert.deepEqual(traitLinks([], { treasure: [{ link: 'fortune' }, { link: 'reveal', rarity: 'mythic' }] }), { reveal: 2, reflip: false, fortune: true });
});

test('宝物重穿：只有稀有度、没有加成与被动的宝物卸下后可再装回，稀有度不丢', async () => {
    const name = '石印';
    const text = `[igs-fx:item|获得|${name}|旧物|宝物]`;
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai(text)]);
    const [tag] = scanGainTags(text);
    const anchor = { messageId: 0, swipeId: 0, tagHash: tag.tagHash, occurrence: tag.occurrence };
    const first = await ledger.append([{ id: ledgerEntryId('equip', 'pc-hero', anchor), type: 'equip', character: 'pc-hero', anchor, createdAt: 1,
        payload: { gearId: gearIdFor(name), name, slot: 'treasure', description: '旧物', rarity: 'rare' } }]);
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal((await ledger.setGear('pc-hero', gearIdFor(name), false)).ok, true);
    const again = await ledger.setGear('pc-hero', gearIdFor(name), true);
    assert.equal(again.ok, true, JSON.stringify(again));
    const me = heroOf(await ledger.effectiveState());
    assert.deepEqual(me.gear.slots.treasure.map((g) => [g.name, g.rarity]), [[name, 'rare']]);
});

test('规则 v6 卡牌三选一：本职业固定 2 + 随机 1 按种子定，按比例混入无色固定卡；旧调用形状不变；翻牌取候选 / 跳过，战报第 5 字段经账本兑现', async () => {
    const { assembleReward } = await import('../src/combat/generation-assembly.js');
    const { reportIdFor, attachLoot } = await import('../src/combat/report.js');
    const { CARD_TEMPLATES, templatesFor } = await import('../src/combat/card-templates.js');
    const { fixedCard, fixedCardGroup } = await import('../src/combat/fixed-cards/index.js');
    const { emptyPick, flipCard, flipView, lootOf, normalizePick, pickCardChoice } = await import('../src/combat/flip.js');
    const rank = (rarity) => ['common', 'uncommon', 'rare', 'epic', 'mythic'].indexOf(rarity);
    const strip = ({ fixedIds, randomAt, archetype, ...rest }) => rest;
    const me = { kind: 'deck-character', id: 'pc-hero', classProfile: { archetype: 'warrior' }, owned: new Map() };
    let cards = 0;
    let general = 0;
    let found = null;
    for (let i = 0; i < 600; i += 1) {
        for (const tier of ['normal', 'elite', 'boss']) {
            const combatId = `cb|v6|${i}`;
            const plan = planRewardSlots({ combatId, tier, character: me, candidates: true });
            const old = planRewardSlots({ combatId, tier, character: me });
            assert.deepEqual([...plan.slots, ...plan.reserve].map(strip), [...old.slots, ...old.reserve]);
            assert.ok([...old.slots, ...old.reserve].every((slot) => slot.fixedIds === undefined));
            for (const slot of [...plan.slots, ...plan.reserve].filter((s) => s.kind === 'card')) {
                cards += 1;
                assert.equal(slot.archetype, 'warrior');
                assert.equal(slot.fixedIds.length, 2);
                assert.equal(new Set(slot.fixedIds).size, 2);
                assert.ok([0, 1, 2].includes(slot.randomAt));
                assert.equal(fixedCardGroup(slot.fixedIds[0]), 'warrior');
                const last = fixedCardGroup(slot.fixedIds[1]);
                assert.ok(['warrior', 'general'].includes(last), last);
                if (last === 'general') general += 1;
                for (const id of slot.fixedIds) assert.ok(rank(fixedCard(id).rarity) <= Math.max(rank('uncommon'), Math.min(rank(slot.rarity), rank('rare'))), `${id} ${slot.rarity}`);
                if (!found && tier === 'boss' && plan.slots.includes(slot)) found = { combatId, slot, slots: plan.slots };
            }
        }
    }
    assert.ok(cards > 500 && found, `card slots ${cards}`);
    assert.ok(Math.abs(general / cards - 0.25) < 0.04, `general share ${general / cards}`);
    assert.ok([...planRewardSlots({ combatId: 'cb|v6|s', tier: 'boss', character: { kind: 'skill-character', id: 'sc' }, candidates: true }).slots].every((s) => s.kind !== 'card'));

    const table = templatesFor('warrior');
    let assembled = null;
    for (const key of Object.keys(table)) {
        const tried = assembleReward({ slots: [['裂空斩', key, '血战之后']] }, { key: 'k', input: { seed: 's', slots: [found.slot] } });
        if (!tried.errors) { assembled = tried; break; }
    }
    assert.ok(assembled, 'no warrior template solvable for the slot');
    const foreign = Object.keys(CARD_TEMPLATES).find((key) => !Object.hasOwn(table, key));
    if (foreign) assert.ok(assembleReward({ slots: [['裂空斩', foreign, '']] }, { key: 'k', input: { seed: 's', slots: [found.slot] } }).errors);
    const cardSlot = assembled.value.slots[0];
    assert.equal(cardSlot.choices.length, 3);
    assert.equal(cardSlot.choices[found.slot.randomAt].id, cardSlot.card.id);
    assert.deepEqual(cardSlot.choices.filter((_, i) => i !== found.slot.randomAt).map((c) => [c.id, c.model]), found.slot.fixedIds.map((id) => [id, 'fixed']));

    const filler = (index) => ({ index, kind: 'keepsake', rarity: 'rare', name: `杂物${index}`, origin: '' });
    const slots = found.slots.map((slot) => (slot.index === found.slot.index ? { ...cardSlot, index: slot.index } : filler(slot.index)));
    const reward = { combatId: found.combatId, slots };
    const order = flipOrder(reward, 'main');
    const at = order.indexOf(found.slot.index);
    const flipped = flipCard(reward, emptyPick(), at).pick;
    assert.equal(flipView(reward, flipped).needCard, true);
    assert.equal(lootOf(reward, flipped).pick, undefined);
    assert.equal(pickCardChoice(reward, flipped, 3).ok, false);
    assert.equal(pickCardChoice(reward, emptyPick(), 0).reason, 'combat-flip-not-ready');
    const other = flipCard(reward, emptyPick(), order.findIndex((index) => index !== found.slot.index)).pick;
    assert.equal(pickCardChoice(reward, other, 0).reason, 'combat-flip-card-unavailable');
    assert.equal(flipView(reward, other).needCard, undefined);
    const chosen = pickCardChoice(reward, flipped, 'skip').pick;
    assert.deepEqual([flipView(reward, chosen).needCard, flipView(reward, chosen).card, lootOf(reward, chosen).pick], [false, 'skip', 'skip']);
    assert.deepEqual(normalizePick(chosen, reward), chosen);
    assert.equal(normalizePick({ ...other, card: 0 }, reward), null);

    const rid = reportIdFor(found.combatId);
    const body = `<igs-combat-report result="win" id="${rid}">终局：我方获胜。</igs-combat-report>`;
    assert.equal(attachLoot(body, { character: '主角', reportId: rid, index: found.slot.index, set: 'main', slot: slots[found.slot.index] }), body);
    const fixedAt = [0, 1, 2].find((i) => i !== found.slot.randomAt);
    const settle = async (pick) => {
        const { ledger, ref } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai('正文'), ai('续写')]);
        const before = heroOf(await ledger.effectiveState());
        const offerAnchor = { messageId: 0, swipeId: 0, tagHash: 'offer', occurrence: 0 };
        const offer = { id: ledgerEntryId('offer', 'pc-hero', offerAnchor), type: 'offer', character: 'pc-hero', anchor: offerAnchor, payload: { combatId: found.combatId, tier: 'boss', exp: 10, reveal: 0, slots }, createdAt: 7 };
        const appended = await ledger.append([offer]);
        assert.equal(appended.ok, true, JSON.stringify(appended));
        const text = attachLoot(body, { character: '主角', reportId: rid, index: found.slot.index, set: 'main', slot: slots[found.slot.index], pick });
        assert.ok(text.endsWith(`|${found.slot.index}|main|${pick}]`), text);
        ref.chat = [ai('正文'), user(text)];
        const scanned = await ledger.scan();
        const loot = scanned.entries.filter((e) => e.type === 'loot');
        assert.equal(loot.length, 1, JSON.stringify(scanned.diagnostics));
        assert.equal(loot[0].payload.pick, pick);
        assert.equal((await ledger.append(loot)).ok, true);
        const after = await ledger.effectiveState();
        assert.equal(after.diagnostics.some((d) => d.id === loot[0].id), false, JSON.stringify(after.diagnostics));
        return { text, before, hero: heroOf(after) };
    };
    const fixedId = cardSlot.choices[fixedAt].id;
    const tookFixed = await settle(fixedAt);
    assert.ok(tookFixed.text.includes(`领悟了「${cardSlot.choices[fixedAt].name}」`), tookFixed.text);
    assert.deepEqual([tookFixed.hero.owned.get(fixedId), tookFixed.hero.catalog.get(fixedId)?.model, tookFixed.hero.deckEntries.length], [1, 'fixed', tookFixed.before.deckEntries.length + 1]);
    const tookRandom = await settle(found.slot.randomAt);
    assert.equal(tookRandom.hero.deckEntries.length, tookRandom.before.deckEntries.length + 1);
    assert.equal(tookRandom.hero.owned.get(fixedId), undefined);
    const skipped = await settle('skip');
    assert.ok(skipped.text.includes('放下了这次领悟的机会'), skipped.text);
    assert.equal(skipped.hero.deckEntries.length, skipped.before.deckEntries.length);
});


test('规则 v6 取消自由组卡：卡组合规时 saveDeck 拒写 deck 记录，面板不出加入 / 移出 / 保存；已有 deck 记录照旧重放', async () => {
    const { deckDetailView } = await import('../src/visual/igs-ui/combat-deck-panel-model.js');
    const { ledger, tables } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai('正文')]);
    const me = heroOf(await ledger.effectiveState());
    assert.equal(me.deckNeedsAdjust, false);
    const before = tables.ledger.length;
    const locked = await ledger.saveDeck('pc-hero', me.deck.slice(0, 18));
    assert.equal(locked.reason, 'combat-deck-locked');
    assert.equal(tables.ledger.length, before);
    assert.equal(deckDetailView(me, null).deckEditable, false);

    const anchor = { messageId: 0, swipeId: 0, tagHash: 'deck', occurrence: 0 };
    const trimmed = me.deck.slice(0, 18);
    const old = { id: ledgerEntryId('deck', 'pc-hero', anchor), type: 'deck', character: 'pc-hero', anchor, payload: { cards: trimmed, revision: 1 }, createdAt: 7 };
    assert.equal((await ledger.append([old])).ok, true);
    const replayed = heroOf(await ledger.effectiveState());
    assert.deepEqual(replayed.deck, trimmed);
    assert.equal(replayed.deckNeedsAdjust, false);
});
test('规则 v6 按场次删卡：只计战报楼本场经验的普通胜利，每满 5 场一次机会、过期作废，费用 75 + 50 × 已删次数，删后不少于 10 张', async () => {
    const { reportIdFor } = await import('../src/combat/report.js');
    const { purgeOpportunity } = await import('../src/combat/ledger.js');
    const tables = memoryTables([row(classDef('cls-blade'), 1), row(heroDef(), 2)]);
    const ref = { chat: [ai('正文')] };
    const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '主角', now: () => 7, wallet: () => 1000 });
    const winFloor = (i) => {
        const rid = reportIdFor(`cb|purge|${i}`);
        return user(`<igs-combat-report id="${rid}" result="win">终局：我方获胜。</igs-combat-report>\n[igs-combat:exp|主角|5|战斗:${rid}]`);
    };
    const addWins = async (from, to) => {
        for (let i = from; i < to; i += 1) ref.chat.push(winFloor(i), ai(`第${i}场后[igs-combat:exp|主角|3|历练]`));
        const scanned = await ledger.scan();
        assert.equal((await ledger.append(scanned.entries.filter((e) => e.type === 'exp'))).ok, true);
        return heroOf(await ledger.effectiveState());
    };
    let me = await addWins(0, 4);
    assert.deepEqual([me.purge.battle, me.purge.available, me.purge.reason, me.purge.next], [4, false, 'combat-purge-not-due', 5]);
    assert.equal((await ledger.purgeCard('pc-hero', me.deckEntries[0].copyId)).reason, 'combat-purge-not-due');
    me = await addWins(4, 5);
    assert.deepEqual([me.purge.battle, me.purge.available, me.purge.cost], [5, true, 75]);
    const size = me.deck.length;
    const target = me.deckEntries.at(-1).copyId;
    assert.equal((await ledger.purgeCard('pc-hero', 'nope:0')).reason, 'combat-purge-copy-missing');
    const done = await ledger.purgeCard('pc-hero', target);
    assert.equal(done.ok, true, JSON.stringify(done));
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.deck.length, me.deckEntries.some((e) => e.copyId === target), me.purge.reason, me.purge.cost], [size - 1, false, 'combat-purge-used', 125]);
    assert.equal(me.points, 1000 - 75);
    assert.equal((await ledger.purgeCard('pc-hero', me.deckEntries[0].copyId)).reason, 'combat-purge-used');
    me = await addWins(5, 6);
    assert.deepEqual([me.purge.battle, me.purge.available, me.purge.next], [6, false, 10]);
    me = await addWins(6, 10);
    assert.deepEqual([me.purge.battle, me.purge.available, me.purge.cost], [10, true, 125]);
    me = await addWins(10, 11);
    assert.equal(me.purge.reason, 'combat-purge-not-due');
    assert.equal(me.points, 1000 - 75);
    const small = { kind: 'deck-character', battleWins: new Set([1, 2, 3, 4, 5]), purges: 0, purgedAt: new Set(), deck: Array(10).fill('c1') };
    assert.equal(purgeOpportunity(small).reason, 'combat-purge-deck-min');
    assert.equal(purgeOpportunity({ ...small, deck: Array(11).fill('c1') }).available, true);
});






