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

test('多敌折算：1 只为 1；2 只约 0.70；3 只起不低于下限 0.65', () => {
    assert.equal(crowdScaleFor(1), 1);
    assert.ok(Math.abs(crowdScaleFor(2) - 1 / 1.43) < 1e-9, String(crowdScaleFor(2)));
    for (const n of [3, 4, 5, 8, 50]) assert.equal(crowdScaleFor(n), COMBAT_RULES.crowd.floor, `n=${n}`);
    assert.equal(COMBAT_RULES.crowd.floor, 0.65);
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
