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

test('多敌折算（规则 v6 编制）：1 只为 1；2 只起封底 0.75；在场人数按普通敌人上限 3 截断', () => {
    assert.equal(crowdScaleFor(1), 1);
    assert.equal(COMBAT_RULES.crowd.floor, 0.75);
    assert.equal(COMBAT_RULES.maxFoesOnField, 3);
    for (const n of [2, 3, 5, 8, 50]) assert.equal(crowdScaleFor(n), 0.75, `n=${n}`);
});

test('敌方编制（规则 v6）：新建 setup 写 foeCap 3；场上普通敌人超过 foeCap 时 too-many-enemies；爪牙占剩余 2 位，普通敌人位与爪牙位互不挤占', () => {
    const skill = { id: 'hit', name: '打', intent: 'attack', effects: [{ op: 'damage', amount: 1, target: 'enemy' }] };
    const call = { id: 'call', name: '唤', intent: 'special', effects: [{ op: 'summon-minion', amount: 2, hp: 5, damage: 1 }] };
    const foe = (id, skills = [skill]) => ({ id, name: id, side: 'enemy', kind: 'skill', maxHp: 30, skills });
    const heroUnit = { id: 'hero', name: '我', side: 'ally', kind: 'deck', maxHp: 60, deck: Array(10).fill('k'), catalog: { k: { id: 'k', name: '守', type: 'skill', cost: 1, effects: [{ op: 'block', amount: 1 }] } } };
    const four = [heroUnit, foe('a'), foe('b'), foe('c'), foe('d')];
    assert.equal(createBattle({ controlledId: 'hero', foeCap: 3, units: four }, 1).error?.reason, 'too-many-enemies');
    assert.equal(createBattle({ controlledId: 'hero', foeCap: 3, reserve: ['d'], units: four }, 1).ok, true);
    assert.equal(createBattle({ controlledId: 'hero', units: four }, 1).ok, true, '不带 foeCap 的旧 setup 仍按总位置 5');
    assert.equal(createBattle({ controlledId: 'hero', foeCap: 0, units: four }, 1).error?.reason, 'invalid-setup');
    const created = createBattle({ controlledId: 'hero', rulesVersion: 6, foeCap: 3, reserve: ['d'], units: [heroUnit, foe('a', [call]), foe('b'), foe('c'), foe('d')] }, 1);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    let state = created.state;
    for (let i = 0; i < 3 && !state.outcome; i += 1) state = applyAction(state, { type: 'end-turn' }).state;
    const living = state.order.filter((id) => state.units[id].side === 'enemy' && state.units[id].alive);
    assert.deepEqual([living.filter((id) => !state.units[id].minion).length, living.filter((id) => state.units[id].minion).length], [3, 2]);
    assert.deepEqual(state.reserve, ['d'], '爪牙入场不消耗后备');
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

test('战斗胜利积分（v6 G5g）会话收尾：普通战斗胜利向战报楼写一条 battle-points，档位取最高敌人档位，金额按战斗 ID 定额且可被账本校验', async () => {
    const { createCombatSession, locateCombatStart, sessionKeyFor } = await import('../src/combat/session.js');
    const { createCountingStorage } = await import('./helpers/combat-mock-host-services.js');
    const { BATTLE_POINTS_TAG_HASH } = await import('../src/combat/ledger.js');
    const { battlePoints } = await import('../src/combat/points.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    for (const [tiers, tier] of [[['normal'], 'normal'], [['normal', 'boss'], 'boss']]) {
        const chat = [{ is_user: true, mes: '出发' }, { is_user: false, mes: '前方出现了敌人。\n[igs-combat:start|史莱姆|草原]', swipe_id: 0 }];
        const located = locateCombatStart(chat, 1);
        assert.equal(located.ok, true);
        const setup = { rulesVersion: COMBAT_RULES.version, controlledId: 'hero', canEscape: true, units: [hero(Array(5).fill('basic-strike'), { speed: 100 }), foe({ maxHp: 1 })] };
        const record = { v: 1, combatId: located.combatId, anchor: located.anchor, seed: seedFor(located.combatId), setup, actions: [], encounter: '草原', tiers, expTargets: ['我'] };
        const records = new Map();
        const chatRecord = {
            read: () => ({ ok: true, value: records.get(located.combatId) || null }),
            write: async (anchor, combatId, patch) => { records.set(combatId, { ...(records.get(combatId) || {}), ...patch }); return { ok: true }; },
        };
        const appended = [];
        const ledger = {
            effectiveState: async () => ({ ok: true, offers: new Map(), attributes: {}, characters: new Map(), classes: new Map() }),
            append: async (entries) => { appended.push(...entries); return { ok: true }; },
            scan: async () => ({ ok: true }),
        };
        const storage = createCountingStorage({ [sessionKeyFor('chat-1')]: JSON.stringify(record) });
        const send = async (text) => { chat.push({ is_user: true, mes: text, swipe_id: 0 }); return { ok: true, messageId: chat.length - 1 }; };
        const session = createCombatSession({ ledger, tables: {}, storage, chat, getChatId: () => 'chat-1', userName: '我', chatRecord, send, now: () => 1000 });
        assert.equal(session.resume().ok, true);
        const strike = session.state().legal.find((a) => a.type === 'play');
        assert.ok(strike);
        session.act(strike);
        if (session.state().status === 'battle') session.act({ type: 'end-turn' });
        assert.equal(session.state().battle.outcome, 'victory');
        const done = await session.finish();
        assert.equal(done.ok, true, JSON.stringify(done.reason));
        assert.equal(done.battlePoints?.ok, true);
        const paid = appended.filter((entry) => entry.type === 'battle-points');
        assert.equal(paid.length, 1);
        const [entry] = paid;
        assert.equal(entry.character, 'hero');
        assert.deepEqual(entry.anchor, { messageId: 2, swipeId: 0, tagHash: BATTLE_POINTS_TAG_HASH, occurrence: 0 });
        assert.deepEqual(entry.payload, { amount: battlePoints(tier, located.combatId), tier, combatId: located.combatId, reportId: entry.payload.reportId });
        assert.equal(typeof entry.payload.reportId, 'string');
        assert.equal(normalizeLedgerEntry(entry).ok, true, JSON.stringify(normalizeLedgerEntry(entry).errors));
    }
});

test('弱敌战（v6 G3d）会话收尾：setup 带 weakFoes 时战报写 weak="1"、经验 1/4，battle-points 带 weak 且按 1/4 定额、不带遗物加成，可被账本校验', async () => {
    const { createCombatSession, locateCombatStart, sessionKeyFor } = await import('../src/combat/session.js');
    const { createCountingStorage } = await import('./helpers/combat-mock-host-services.js');
    const { weakBattlePoints } = await import('../src/combat/points.js');
    const { reportWeakOf } = await import('../src/combat/report.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    const chat = [{ is_user: true, mes: '出发' }, { is_user: false, mes: '前方出现了敌人。\n[igs-combat:start|史莱姆|草原]', swipe_id: 0 }];
    const located = locateCombatStart(chat, 1);
    assert.equal(located.ok, true);
    const setup = { rulesVersion: COMBAT_RULES.version, controlledId: 'hero', canEscape: true, weakFoes: true, units: [hero(Array(5).fill('basic-strike'), { speed: 100 }), foe({ maxHp: 1 })] };
    assert.ok(COMBAT_RULES.version >= 6);
    assert.equal(createBattle({ ...setup, weakFoes: false }, 1).ok, false, 'weakFoes 只接受 true');
    const record = { v: 1, combatId: located.combatId, anchor: located.anchor, seed: seedFor(located.combatId), setup, actions: [], encounter: '草原', tiers: ['normal'], expTargets: ['我'] };
    const records = new Map();
    const chatRecord = {
        read: () => ({ ok: true, value: records.get(located.combatId) || null }),
        write: async (anchor, combatId, patch) => { records.set(combatId, { ...(records.get(combatId) || {}), ...patch }); return { ok: true }; },
    };
    const appended = [];
    const ledger = {
        effectiveState: async () => ({ ok: true, offers: new Map(), attributes: {}, characters: new Map(), classes: new Map() }),
        append: async (entries) => { appended.push(...entries); return { ok: true }; },
        scan: async () => ({ ok: true }),
    };
    const storage = createCountingStorage({ [sessionKeyFor('chat-1')]: JSON.stringify(record) });
    const send = async (text) => { chat.push({ is_user: true, mes: text, swipe_id: 0 }); return { ok: true, messageId: chat.length - 1 }; };
    const session = createCombatSession({ ledger, tables: {}, storage, chat, getChatId: () => 'chat-1', userName: '我', chatRecord, send, now: () => 1000 });
    assert.equal(session.resume().ok, true);
    session.act(session.state().legal.find((a) => a.type === 'play'));
    if (session.state().status === 'battle') session.act({ type: 'end-turn' });
    assert.equal(session.state().battle.outcome, 'victory');
    const done = await session.finish();
    assert.equal(done.ok, true, JSON.stringify(done.reason));
    const reportText = chat[chat.length - 1].mes;
    assert.equal(reportWeakOf(reportText), true, reportText);
    const expAmount = Math.floor(COMBAT_RULES.tiers.normal.exp / 4);
    assert.match(reportText, new RegExp(`\\[igs-combat:exp\\|我\\|${expAmount}\\|`), reportText);
    const paid = appended.filter((entry) => entry.type === 'battle-points');
    assert.equal(paid.length, 1);
    assert.deepEqual(paid[0].payload, { amount: weakBattlePoints('normal', located.combatId), tier: 'normal', combatId: located.combatId, reportId: paid[0].payload.reportId, weak: true });
    assert.equal(normalizeLedgerEntry(paid[0]).ok, true, JSON.stringify(normalizeLedgerEntry(paid[0]).errors));
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

test('场外排位（v0.39.3，规则 v6 场上普通敌人 3 名）：首领 → 精英 → 普通，精英先于普通怪上场与补位；同一 combatId 结果不变', async () => {
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { ledger } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [user('出发')]);
    const state = await ledger.effectiveState();
    const enemies = new Map([['狼', templateEnemy('狼', 'normal')], ['头狼', templateEnemy('头狼', 'elite')]]);
    const lobby = { heroId: 'pc-hero', controllable: ['pc-hero'], allies: [heroOf(state)], enemies };
    const start = { enemies: [{ name: '狼', count: 6 }, { name: '头狼', count: 2 }], tier: 'normal' };
    const built = buildSetup(lobby, start, { combatId: 'c-elite' });
    assert.equal(built.ok, true, JSON.stringify(built));
    const tierOf = (id) => (built.setup.units.find((u) => u.id === id)?.name.startsWith('头狼') ? 'elite' : 'normal');
    assert.equal(built.setup.foeCap, 3);
    assert.equal(built.setup.reserve.length, 5);
    assert.deepEqual(built.setup.reserve.map(tierOf), ['normal', 'normal', 'normal', 'normal', 'normal']);
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
    const strip = ({ fixedIds, randomAt, archetype, relic, ...rest }) => rest;
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
            // 规则 v6 遗物宝物（G5f）：relic 只出现在宝物槽上，旧调用不带。
            assert.ok([...old.slots, ...old.reserve].every((slot) => slot.relic === undefined));
            for (const slot of [...plan.slots, ...plan.reserve].filter((s) => s.relic)) assert.equal(slot.gearSlot, 'treasure');
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
test('规则 v6 按场次删卡：第 5 场胜利战报里的删牌标签入账，跳过不写，过期与重复扫描不扣费，费用 75 + 50 × 已删次数，删后不少于 10 张', async () => {
    const { reportIdFor } = await import('../src/combat/report.js');
    const { purgeOpportunity, purgeChance } = await import('../src/combat/ledger.js');
    const tables = memoryTables([row(classDef('cls-blade'), 1), row(heroDef(), 2)]);
    const ref = { chat: [ai('正文')] };
    const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '主角', now: () => 7, wallet: () => 1000 });
    const ridOf = (i) => reportIdFor(`cb|purge|${i}`);
    const winFloor = (i, copyId = '') => {
        const rid = ridOf(i);
        return user(`<igs-combat-report id="${rid}" result="win">终局：我方获胜。</igs-combat-report>\n[igs-combat:exp|主角|5|战斗:${rid}]${copyId ? `\n[igs-combat:purge|主角|${rid}|${copyId}]` : ''}`);
    };
    const settle = async () => {
        const scanned = await ledger.scan();
        assert.equal((await ledger.append(scanned.entries)).ok, true);
        return { scanned, me: heroOf(await ledger.effectiveState()) };
    };
    const addWins = async (from, to, copyAt = {}) => {
        for (let i = from; i < to; i += 1) ref.chat.push(winFloor(i, copyAt[i]), ai(`第${i}场后[igs-combat:exp|主角|3|历练]`));
        return settle();
    };
    let { me } = await addWins(0, 4);
    assert.deepEqual([me.purge.battle, me.purge.available, me.purge.reason, me.purge.next], [4, false, 'combat-purge-not-due', 5]);
    // 结算页口径：第 5 场战报尚未发出时按下一场算，正好满 5 场可删；第 4 场已计入、不在档上。
    assert.deepEqual([purgeChance(me, ridOf(4)).battle, purgeChance(me, ridOf(4)).available, purgeChance(me, ridOf(4)).cost], [5, true, 75]);
    assert.equal(purgeChance(me, ridOf(3)).reason, 'combat-purge-not-due');
    const size = me.deck.length;
    const target = me.deckEntries.at(-1).copyId;
    let scanned;
    ({ me, scanned } = await addWins(4, 5, { 4: target }));
    assert.deepEqual(scanned.entries.filter((e) => e.type === 'purge').map((e) => [e.payload.copyId, e.payload.cost, e.payload.battle, e.payload.reportId]), [[target, 75, 5, ridOf(4)]]);
    assert.deepEqual([me.deck.length, me.deckEntries.some((e) => e.copyId === target), me.purge.reason, me.purge.cost], [size - 1, false, 'combat-purge-used', 125]);
    assert.equal(me.points, 1000 - 75);
    // 重复扫描同一楼不再写删牌记录，不重复扣费。
    ({ me, scanned } = await settle());
    assert.deepEqual([scanned.entries.filter((e) => e.type === 'purge').length, me.points, me.deck.length], [0, 1000 - 75, size - 1]);
    // 第 6 场战报里手写的删牌标签：不在档上，不入账。
    ({ me, scanned } = await addWins(5, 6, { 5: me.deckEntries[0].copyId }));
    assert.equal(scanned.entries.filter((e) => e.type === 'purge').length, 0);
    assert.ok(scanned.diagnostics.some((d) => d.code === 'combat-purge-not-due'), JSON.stringify(scanned.diagnostics));
    assert.deepEqual([me.purge.battle, me.purge.available, me.purge.next], [6, false, 10]);
    // 第 10 场跳过（战报不带删牌标签）：机会过期作废，费用不变。
    ({ me } = await addWins(6, 10));
    assert.deepEqual([me.purge.battle, me.purge.available, me.purge.cost], [10, true, 125]);
    ({ me } = await addWins(10, 11));
    assert.equal(me.purge.reason, 'combat-purge-not-due');
    assert.deepEqual([me.points, me.deck.length], [1000 - 75, size - 1]);
    // 过期后再补写第 10 场的删牌标签不入账。
    assert.equal(purgeChance(me, ridOf(9)).reason, 'combat-purge-expired');
    const small = { kind: 'deck-character', battleWins: new Set([1, 2, 3, 4, 5]), purges: 0, purgedAt: new Set(), deck: Array(10).fill('c1') };
    assert.equal(purgeOpportunity(small).reason, 'combat-purge-deck-min');
    assert.equal(purgeOpportunity({ ...small, deck: Array(11).fill('c1') }).available, true);
});
test('规则 v6 积分抽卡：150 抽 3 张本职业候选（固定 2 + 随机 1，种子定、不含无色），翻开一张后加入卡组或放弃，每抽只翻一次，放弃不退款，候选不合规或金钱不足拒写', async () => {
    const { planCardDraw } = await import('../src/combat/rewards.js');
    const { FIXED_GENERAL_CARDS, fixedCard, fixedClassPool, isFixedCardId } = await import('../src/combat/fixed-cards/index.js');
    const { drawCardEntity } = await import('../src/combat/generation.js');
    const tables = memoryTables([row(classDef('cls-blade'), 1), row(heroDef(), 2)]);
    const ref = { chat: [ai('正文')] };
    const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '主角', now: () => 7, wallet: () => 1000 });
    let me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.cardDraws, me.pendingDraw], [0, null]);
    const own = new Set(fixedClassPool('warrior').map((card) => card.id));
    const plan = planCardDraw(me);
    assert.deepEqual(planCardDraw(me), plan);
    assert.equal(plan.fixedIds.length, 2);
    assert.ok(plan.fixedIds.every((id) => own.has(id)), JSON.stringify(plan.fixedIds));
    const randomCard = (id) => ({ id, name: '裂岩斩', type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 3 }, { op: 'block', amount: 3 }] });
    const choicesOf = (p, card) => { const list = p.fixedIds.map((id) => clone(fixedCard(id))); list.splice(p.randomAt, 0, card); return list; };
    // 候选不合规：混入无色固定卡或别的职业的固定卡都拒写，不扣钱。
    const general = choicesOf(plan, randomCard(plan.cardId));
    general[general.findIndex((c) => isFixedCardId(c.id))] = clone(FIXED_GENERAL_CARDS[0]);
    assert.equal((await ledger.drawCard('pc-hero', { drawId: plan.drawId, choices: general })).reason, 'combat-card-draw-choices-invalid');
    const foreign = choicesOf(plan, randomCard(plan.cardId));
    foreign[foreign.findIndex((c) => isFixedCardId(c.id))] = clone(fixedClassPool('mage')[0]);
    assert.equal((await ledger.drawCard('pc-hero', { drawId: plan.drawId, choices: foreign })).reason, 'combat-card-draw-choices-invalid');
    assert.equal(heroOf(await ledger.effectiveState()).points, 1000);
    // 抽：扣 150，成为待选；有待选时不能再抽。
    assert.equal((await ledger.drawCard('pc-hero', { drawId: plan.drawId, choices: choicesOf(plan, randomCard(plan.cardId)) })).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.points, me.cardDraws, me.pendingDraw.drawId, me.pendingDraw.choices.length, me.pendingDraw.choices[plan.randomAt].id], [850, 1, plan.drawId, 3, plan.cardId]);
    assert.equal((await ledger.drawCard('pc-hero', { drawId: 'cd-other', choices: choicesOf(plan, randomCard('dc-other')) })).reason, 'combat-card-draw-pending');
    // 翻前放弃：不退款，卡组不变。
    const size = me.deck.length;
    assert.equal((await ledger.pickCard('pc-hero', 'cd-wrong', 'skip')).reason, 'combat-card-pick-invalid');
    assert.equal((await ledger.pickCard('pc-hero', plan.drawId, 'skip')).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.points, me.pendingDraw, me.deck.length], [850, null, size]);
    // 第二抽种子随已抽次数变化；未翻不能加入，翻开随机卡后只能收下翻开的那张，且不能再翻。
    const second = planCardDraw(me);
    assert.notEqual(second.drawId, plan.drawId);
    assert.equal((await ledger.drawCard('pc-hero', { drawId: second.drawId, choices: choicesOf(second, randomCard(second.cardId)) })).ok, true);
    assert.equal((await ledger.pickCard('pc-hero', second.drawId, second.randomAt)).reason, 'combat-card-pick-unflipped');
    assert.equal((await ledger.flipCard('pc-hero', 'cd-wrong', second.randomAt)).reason, 'combat-card-flip-invalid');
    assert.equal((await ledger.flipCard('pc-hero', second.drawId, second.randomAt)).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.pendingDraw.drawId, me.pendingDraw.flipped, me.deck.length], [second.drawId, second.randomAt, size]);
    const otherAt = second.randomAt === 0 ? 1 : 0;
    assert.equal((await ledger.flipCard('pc-hero', second.drawId, otherAt)).reason, 'combat-card-flip-done');
    assert.equal((await ledger.pickCard('pc-hero', second.drawId, otherAt)).reason, 'combat-card-pick-unflipped');
    assert.equal((await ledger.pickCard('pc-hero', second.drawId, second.randomAt)).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.points, me.pendingDraw, me.deck.length, me.owned.get(second.cardId), me.catalog.get(second.cardId)?.name], [700, null, size + 1, 1, '裂岩斩']);
    // 第三抽翻开固定卡后放弃：不退款，卡组不变。
    const third = planCardDraw(me);
    assert.equal((await ledger.drawCard('pc-hero', { drawId: third.drawId, choices: choicesOf(third, randomCard(third.cardId)) })).ok, true);
    const thirdAt = third.randomAt === 0 ? 1 : 0;
    assert.equal((await ledger.flipCard('pc-hero', third.drawId, thirdAt)).ok, true);
    assert.equal((await ledger.pickCard('pc-hero', third.drawId, 'skip')).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.points, me.pendingDraw, me.deck.length], [550, null, size + 1]);
    // 第四抽翻开固定卡并加入：按 ID 进目录加一张副本。
    const fourth = planCardDraw(me);
    assert.equal((await ledger.drawCard('pc-hero', { drawId: fourth.drawId, choices: choicesOf(fourth, randomCard(fourth.cardId)) })).ok, true);
    const fixedAt = fourth.randomAt === 0 ? 1 : 0;
    const fixedId = fourth.fixedIds[0];
    const before = me.owned.get(fixedId) || 0;
    assert.equal((await ledger.flipCard('pc-hero', fourth.drawId, fixedAt)).ok, true);
    assert.equal((await ledger.pickCard('pc-hero', fourth.drawId, fixedAt)).ok, true);
    me = heroOf(await ledger.effectiveState());
    assert.deepEqual([me.points, me.deck.length, me.owned.get(fixedId), me.catalog.get(fixedId)?.id, me.cardDraws], [400, size + 2, before + 1, fixedId, 4]);
    // 随机候选请求只给本职业模板，稀有度、费用与 ID 由程序定。
    const entity = drawCardEntity({ character: me, plan: planCardDraw(me) });
    assert.deepEqual([entity.kind, entity.fixed.archetype, entity.input.allowedTemplates.includes('strike')], ['draw-card', 'warrior', true]);
    // 金钱不足拒写。
    const poor = createCombatLedger({ tables: memoryTables([row(classDef('cls-blade'), 1), row(heroDef(), 2)]), chat: () => [ai('正文')], userName: '主角', now: () => 7, wallet: () => 100 });
    const p0 = planCardDraw(heroOf(await poor.effectiveState()));
    assert.equal((await poor.drawCard('pc-hero', { drawId: p0.drawId, choices: choicesOf(p0, randomCard(p0.cardId)) })).reason, 'combat-points-insufficient');
});

test('战斗胜利积分（v6 G5g）：按档位与战斗 ID 定额；锚定胜利战报楼写进主角积分，战报换楼或败北失效；金额越界拒收', async () => {
    const { BATTLE_POINTS_TAG_HASH } = await import('../src/combat/ledger.js');
    const { BATTLE_POINTS_RANGE, battlePoints, battleTierOf } = await import('../src/combat/points.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    assert.deepEqual([battleTierOf(['normal', 'elite']), battleTierOf(['elite', 'boss']), battleTierOf([]), battleTierOf(undefined)], ['elite', 'boss', 'normal', 'normal']);
    for (const tier of ['normal', 'elite', 'boss']) {
        const [min, max] = BATTLE_POINTS_RANGE[tier];
        const seen = new Set();
        for (let n = 0; n < 60; n += 1) {
            const amount = battlePoints(tier, `cb-${n}`);
            assert.ok(amount >= min && amount <= max, `${tier} ${amount}`);
            seen.add(amount);
        }
        assert.ok(seen.size > 1, tier);
        assert.equal(battlePoints(tier, 'cb-x'), battlePoints(tier, 'cb-x'));
    }

    const floor = (id, result = 'win') => user(`<igs-combat-report id="${id}" result="${result}">战报</igs-combat-report>`);
    const { ledger, ref, tables } = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [floor('r1')]);
    const hero = 'pc-hero';
    const entryAt = (messageId, payload, character = hero) => {
        const anchor = { messageId, swipeId: 0, tagHash: BATTLE_POINTS_TAG_HASH, occurrence: 0 };
        return { id: ledgerEntryId('battle-points', character, anchor), type: 'battle-points', character, anchor, payload, createdAt: 7 };
    };
    const before = heroOf(await ledger.effectiveState()).points;
    const amount = battlePoints('elite', 'cb-1');
    const paid = { amount, tier: 'elite', combatId: 'cb-1', reportId: 'r1' };
    assert.equal((await ledger.append([entryAt(0, paid)])).ok, true);
    assert.equal((await ledger.append([entryAt(0, paid)])).ok, true);
    assert.equal(tables.ledger.filter((e) => e.type === 'battle-points').length, 1);
    assert.equal(heroOf(await ledger.effectiveState()).points - before, amount);

    ref.chat = [floor('r9')];
    const moved = await ledger.effectiveState();
    assert.ok(moved.inactive.some((item) => item.reason === 'battle-points-report-invalid'));
    assert.equal(heroOf(moved).points, before);
    ref.chat = [floor('r1', 'lose')];
    assert.equal(heroOf(await ledger.effectiveState()).points, before);

    assert.equal(normalizeLedgerEntry(entryAt(0, { amount: 16, tier: 'normal', combatId: 'cb-1', reportId: 'r1' })).ok, false);
    assert.equal(normalizeLedgerEntry(entryAt(0, { amount: 31, tier: 'boss', combatId: 'cb-1', reportId: 'r1' })).ok, false);
    const forged = amount === 16 ? 17 : 16;
    assert.equal(normalizeLedgerEntry(entryAt(0, { ...paid, amount: forged })).ok, false);
    assert.equal(normalizeLedgerEntry(entryAt(0, { amount, tier: 'elite', reportId: 'r1' })).ok, false);
});

test('胜利积分加成（v6 G5f-4c）：按持有的加金币遗物特性快照加成，可复核；赤鳞果另记遗物生命上限；快照遗物当时未持有或数值伪造即拒收', async () => {
    const { BATTLE_POINTS_TAG_HASH } = await import('../src/combat/ledger.js');
    const { battlePoints } = await import('../src/combat/points.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    const { heldOffCombat, winPointsBonus } = await import('../src/combat/relics/off-combat.js');
    const coin = { relicId: 'rl-r-18', model: 'original' };
    const hat = { relicId: 'rl-u-02', model: 'original' };
    const scale = { relicId: 'rl-s-08', model: 'original' };
    assert.equal(winPointsBonus([], 13), null);
    assert.equal(winPointsBonus([{ relicId: 'rl-r-18', model: 'split' }], 13), null, '拆解模型是战斗内被动，不加成');
    assert.deepEqual(winPointsBonus([coin, hat], 13), { points: 8 + 3, hpMax: 0, relics: [coin, hat] });
    assert.deepEqual(winPointsBonus([scale], 13), { points: 0, hpMax: 1, relics: [scale] });
    assert.deepEqual(heldOffCombat([{ relic: coin }, { relic: coin }, { relic: { relicId: 'rl-c-02', model: 'original' } }, {}], 'win-points'), [coin]);

    const floor = (id) => user(`<igs-combat-report id="${id}" result="win">战报</igs-combat-report>`);
    const traitAt = (messageId, relic) => {
        const anchor = { messageId, swipeId: 0, tagHash: 'trait', occurrence: 0 };
        return { id: ledgerEntryId('trait', 'pc-hero', anchor), type: 'trait', character: 'pc-hero', anchor, createdAt: 7, payload: { traitId: `tr-${messageId}`, name: '遗物特性', rarity: 'rare', kind: 'passive', relic, cost: 100 } };
    };
    // 基础 2 槽已被天生特性占满，新特性先进待选；换掉天生被动后才算持有（D-19：待选中的特性不生效）。
    const pickAt = (messageId) => {
        const anchor = { messageId, swipeId: 0, tagHash: 'trait', occurrence: 1 };
        return { id: ledgerEntryId('trait-pick', 'pc-hero', anchor), type: 'trait-pick', character: 'pc-hero', anchor, createdAt: 7, payload: { traitId: `tr-${messageId}`, drop: 'pp-pc-hero' } };
    };
    const gain = (messageId, relic) => [traitAt(messageId, relic), pickAt(messageId)];
    const pointsAt = (messageId, payload) => {
        const anchor = { messageId, swipeId: 0, tagHash: BATTLE_POINTS_TAG_HASH, occurrence: 0 };
        return { id: ledgerEntryId('battle-points', 'pc-hero', anchor), type: 'battle-points', character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const amount = battlePoints('normal', 'cb-1');
    const base = { amount, tier: 'normal', combatId: 'cb-1', reportId: 'r1' };
    const withBonus = (relics) => ({ ...base, bonus: winPointsBonus(relics, amount) });

    assert.equal(normalizeLedgerEntry(pointsAt(1, withBonus([coin, hat]))).ok, true);
    assert.equal(normalizeLedgerEntry(pointsAt(1, { ...base, bonus: { ...winPointsBonus([coin], amount), points: 9 } })).ok, false, '加成数值伪造');
    assert.equal(normalizeLedgerEntry(pointsAt(1, { ...base, bonus: { points: 8, hpMax: 0, relics: [coin, coin] } })).ok, false, '同一件不能重复计');
    assert.equal(normalizeLedgerEntry(pointsAt(1, { ...base, bonus: { points: 0, hpMax: 0, relics: [{ relicId: 'rl-c-02', model: 'original' }] } })).ok, false, '非加金币遗物');

    // 特性在胜利战报之前已持有：定额 + 加成写进积分。
    const held = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai('正文'), floor('r1')]);
    const before = heroOf(await held.ledger.effectiveState()).points;
    await held.tables.append('ledger', [traitAt(0, coin), pointsAt(1, withBonus([coin]))]);
    const pendingState = await held.ledger.effectiveState();
    assert.ok(pendingState.diagnostics.some((item) => item.code === 'combat-points-bonus-not-held'), '待选中的特性不算持有');
    assert.equal(heroOf(pendingState).points - before, -100);
    await held.tables.append('ledger', [pickAt(0)]);
    const heldState = await held.ledger.effectiveState();
    assert.equal(heldState.diagnostics.some((item) => item.code === 'combat-points-bonus-not-held'), false);
    assert.equal(heroOf(heldState).points - before, amount + 8 - 100);

    // 特性在胜利之后才拿到：重放时快照遗物不在持有里，整条拒收。
    const late = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai('正文'), floor('r1'), ai('之后')]);
    const lateBefore = heroOf(await late.ledger.effectiveState()).points;
    await late.tables.append('ledger', [...gain(2, coin), pointsAt(1, withBonus([coin]))]);
    const lateState = await late.ledger.effectiveState();
    assert.ok(lateState.diagnostics.some((item) => item.code === 'combat-points-bonus-not-held'));
    assert.equal(heroOf(lateState).points - lateBefore, -100);

    // 赤鳞果：每胜最大生命 +1 记在遗物来源，不进战斗成长。
    const hp = ledgerSetup([row(classDef('cls-blade'), 1), row(heroDef(), 2)], [ai('正文'), floor('r1')]);
    const hpBefore = heroOf(await hp.ledger.effectiveState()).hpMax;
    await hp.tables.append('ledger', [...gain(0, scale), pointsAt(1, withBonus([scale]))]);
    const hpHero = heroOf(await hp.ledger.effectiveState());
    assert.equal(hpHero.hpMax - hpBefore, 1);
    assert.equal(hpHero.relicHpMax, 1);
    assert.equal(hpHero.battleGrowth, undefined);
});


test('弱敌战（v6 G3d）：敌人全为「远逊」不计场次、不给删卡；槽位数不变、多出普通劣等杂物；经验与胜利积分 1/4、不带遗物加成；劣等杂物卖价 1/4', async () => {
    const { weakFoesOf } = await import('../src/combat/session.js');
    const { buildCombatReport, reportIdFor, reportWeakOf } = await import('../src/combat/report.js');
    const { BATTLE_POINTS_TAG_HASH } = await import('../src/combat/ledger.js');
    const { battlePoints, sellPrice, weakBattlePoints } = await import('../src/combat/points.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    // 判定：全部远逊才算弱敌战；没有关系档按「相当」（D-23）。
    const start = { enemies: [{ name: '小猫' }, { name: '小狗' }] };
    const tiers = (a, b) => new Map([['小猫', a && { tier: a }], ['小狗', b && { tier: b }]]);
    assert.equal(weakFoesOf(start, tiers('outclassed', 'outclassed')), true);
    assert.equal(weakFoesOf(start, tiers('outclassed', 'weaker')), false);
    assert.equal(weakFoesOf(start, tiers('outclassed', null)), false);
    assert.equal(weakFoesOf({ enemies: [] }, new Map()), false);

    // 奖励：槽位数不变，绝大多数为普通劣等杂物，其余槽稀有度封顶普通；经验 1/4；只在 v6（candidates）生效。
    const me = { kind: 'deck-character', id: 'pc-hero', classProfile: { archetype: 'warrior' }, owned: new Map() };
    let junk = 0;
    let total = 0;
    for (let i = 0; i < 60; i += 1) {
        const args = { combatId: `cb|weak|${i}`, tier: 'boss', enemyTiers: ['boss'], character: me, candidates: true, links: { reflip: true } };
        const full = planRewardSlots(args);
        const weak = planRewardSlots({ ...args, weak: true });
        assert.equal(weak.weak, true);
        assert.equal(weak.slots.length, full.slots.length, '槽位数不变（再翻照常加槽）');
        assert.equal(weak.reserve.length, full.reserve.length);
        assert.equal(weak.exp, Math.floor(full.exp / 4));
        for (const slot of [...weak.slots, ...weak.reserve]) {
            total += 1;
            assert.equal(slot.rarity, 'common', JSON.stringify(slot));
            assert.notEqual(slot.gearSlot, 'treasure');
            if (slot.kind === 'keepsake') { assert.equal(slot.junk, true); junk += 1; }
        }
        assert.deepEqual(planRewardSlots(args), full, '普通战斗不受影响');
        assert.equal(planRewardSlots({ ...args, candidates: false, weak: true }).weak, undefined, '旧规则不走弱敌战');
    }
    assert.ok(junk / total > 0.88, `劣等杂物 ${junk}/${total}`);

    // 战报：经验 1/4，战报块带 weak="1"。
    const built = buildCombatReport({ combatId: 'cb-w', state: { outcome: 'victory', units: {} }, events: [], enemyTiers: ['normal'], expTargets: ['主角'], weak: true });
    assert.equal(built.ok, true, JSON.stringify(built));
    assert.equal(built.exp[0].amount, Math.floor(COMBAT_RULES.tiers.normal.exp / 4));
    assert.equal(reportWeakOf(built.text), true);
    assert.equal(reportWeakOf(buildCombatReport({ combatId: 'cb-w', state: { outcome: 'victory', units: {} }, events: [], enemyTiers: ['normal'], expTargets: ['主角'] }).text), false);

    // 劣等杂物卖价 1/4（至少 1）。
    for (const key of ['a', 'b', 'c']) assert.equal(sellPrice('common', key, { junk: true }), Math.max(1, Math.floor(sellPrice('common', key) / 4)));

    // 账本：弱敌战胜利不计场次、战报里的删牌标签不入账；积分记录的 weak 须与战报一致。
    const tables = memoryTables([row(classDef('cls-blade'), 1), row(heroDef(), 2)]);
    const ref = { chat: [ai('正文')] };
    const ledger = createCombatLedger({ tables, chat: () => ref.chat, userName: '主角', now: () => 7, wallet: () => 1000 });
    const copyId = heroOf(await ledger.effectiveState()).deckEntries[0].copyId;
    const weakRid = reportIdFor('cb|weak-floor');
    const fullRid = reportIdFor('cb|full-floor');
    ref.chat.push(user(`<igs-combat-report id="${weakRid}" result="win" weak="1">终局：我方获胜。</igs-combat-report>\n[igs-combat:exp|主角|5|战斗:${weakRid}]\n[igs-combat:purge|主角|${weakRid}|${copyId}]`));
    const scanned = await ledger.scan();
    assert.equal(scanned.entries.some((e) => e.type === 'purge'), false);
    assert.ok(scanned.diagnostics.some((d) => d.code === 'combat-purge-weak-report'), JSON.stringify(scanned.diagnostics));
    assert.equal((await ledger.append(scanned.entries)).ok, true);
    let hero = heroOf(await ledger.effectiveState());
    assert.equal(hero.purge, undefined, '弱敌战不计胜场');
    ref.chat.push(user(`<igs-combat-report id="${fullRid}" result="win">终局：我方获胜。</igs-combat-report>\n[igs-combat:exp|主角|5|战斗:${fullRid}]`));
    assert.equal((await ledger.append((await ledger.scan()).entries)).ok, true);
    hero = heroOf(await ledger.effectiveState());
    assert.equal(hero.purge.battle, 1);

    const pointsAt = (messageId, occurrence, payload) => {
        const anchor = { messageId, swipeId: 0, tagHash: BATTLE_POINTS_TAG_HASH, occurrence };
        return { id: ledgerEntryId('battle-points', 'pc-hero', anchor), type: 'battle-points', character: 'pc-hero', anchor, payload, createdAt: 7 };
    };
    const weakPaid = { amount: weakBattlePoints('normal', 'cb|weak-floor'), tier: 'normal', combatId: 'cb|weak-floor', reportId: weakRid, weak: true };
    const fullPaid = { amount: battlePoints('normal', 'cb|full-floor'), tier: 'normal', combatId: 'cb|full-floor', reportId: fullRid };
    assert.equal(normalizeLedgerEntry(pointsAt(1, 0, weakPaid)).ok, true);
    assert.equal(normalizeLedgerEntry(pointsAt(1, 0, { ...weakPaid, amount: battlePoints('normal', 'cb|weak-floor') })).ok, false, '弱敌战不能按全额');
    assert.equal(normalizeLedgerEntry(pointsAt(1, 0, { ...weakPaid, bonus: { points: 5, hpMax: 0, relics: [{ relicId: 'rl-c-01', model: 'original' }] } })).ok, false, '弱敌战不带遗物加成');
    assert.equal(normalizeLedgerEntry(pointsAt(1, 0, { ...weakPaid, weak: false })).ok, false);
    const before = hero.points;
    await tables.append('ledger', [
        pointsAt(1, 0, weakPaid), pointsAt(2, 0, fullPaid),
        pointsAt(1, 1, { amount: battlePoints('normal', 'cb|weak-floor'), tier: 'normal', combatId: 'cb|weak-floor', reportId: weakRid }),
        pointsAt(2, 1, { ...fullPaid, amount: weakBattlePoints('normal', 'cb|full-floor'), weak: true }),
    ]);
    const state = await ledger.effectiveState();
    assert.equal(state.inactive.filter((item) => item.reason === 'battle-points-weak-mismatch').length, 2);
    assert.equal(heroOf(state).points - before, weakPaid.amount + fullPaid.amount);
});

test('弱敌战（v6 G3d）新建链：开战楼关系冻结，奖励失败重试与重新准备不漂移，setup、战报与真实账本同口径', async t => {
    const { createCombatSession, sessionKeyFor } = await import('../src/combat/session.js');
    const { templateEnemy } = await import('../src/combat/generation.js');
    const { attributeViewFor } = await import('../src/combat/ledger.js');
    const { createCombatChatRecord } = await import('../src/host/combat-chat-record.js');
    const { createCountingStorage } = await import('./helpers/combat-mock-host-services.js');
    const { weakBattlePoints } = await import('../src/combat/points.js');
    const { reportWeakOf } = await import('../src/combat/report.js');
    const db = createLedgerMockHost({ supportCallbacks: true });
    db.sheets.sheet_userbag = userInventorySheet();
    const tables = createCombatTables({ api: db.api });
    assert.equal((await tables.ensure()).ok, true);
    const enemy = { ...templateEnemy('小猫', 'normal'), skills: [{ ...idle, id: 'wait-a' }, { ...idle, id: 'wait-b' }] };
    assert.equal((await tables.append('profile', [row(classDef('cls-blade'), 1), row(heroDef(), 2), row(enemy, 3)])).ok, true);
    const chat = [ai('[igs-combat:rel|小猫|远逊]'), ai('[igs-combat:start|桥头弱敌|小猫]'), ai('[igs-combat:rel|小猫|相当]')];
    const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7 });
    assert.equal((await ledger.scan()).ok, true);
    assert.equal(attributeViewFor(await ledger.effectiveState(), '小猫').tier, 'even');
    assert.equal(attributeViewFor(await ledger.effectiveState({ throughMessageId: 1 }), '小猫').tier, 'outclassed');
    assert.equal((await ledger.effectiveState({ throughMessageId: -1 })).reason, 'combat-floor-invalid');
    const chatRecord = createCombatChatRecord({ SillyTavern: { getContext: () => ({ chat, saveChat: async () => {} }) } });
    const storage = createCountingStorage();
    let rejectReward = true;
    const rewardRequests = [];
    const request = async prompt => {
        const entities = JSON.parse(prompt.user).entities;
        rewardRequests.push(...entities);
        return JSON.stringify({ entities: entities.map(entity => ({
        key: entity.key,
        value: entity.kind === 'encounter-theme' ? { theme: 'western' }
            : rejectReward ? {} : Object.fromEntries(['slots', 'reserve'].map(set => [set,
                (entity.input[set] || []).map((slot, i) => [`旧物${set}${i}`,
                    slot.kind === 'item' ? 'potion' : slot.kind === 'card' ? (slot.cost === 0 ? 'jab' : 'strike')
                        : slot.kind === 'gear' ? (slot.templates?.[0] || 'opening-guard') : null,
                    '桥头战利品'])])),
        })) });
    };
    const options = { ledger, tables, storage, chat: () => chat, getChatId: () => 'g3d-new', userName: '主角', chatRecord,
        request, retryDelays: [], llm: { source: 'tavern' }, now: () => 7,
        send: async text => { chat.push(user(text)); return { ok: true, messageId: chat.length - 1 }; } };
    const session = createCombatSession(options);
    t.after(() => { session.dispose(); tables.client.dispose(); });
    const prepared = await session.prepare(1);
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    assert.equal(session.state().lobby.weakFoes, true);
    assert.equal(session.state().reward.status, 'failed');
    assert.equal(chatRecord.read(session.state().anchor, session.state().combatId).value.prepared.weakFoes, true);
    rejectReward = false;
    const retried = await session.retryReward();
    assert.equal(retried.ok, true, JSON.stringify(retried));
    assert.equal(session.state().reward.status, 'ready', JSON.stringify({ reward: session.state().reward, requests: rewardRequests }));
    const combatId = session.state().combatId;
    const offer = (await ledger.effectiveState()).offers.get(combatId);
    assert.equal(offer.exp, Math.floor(COMBAT_RULES.tiers.normal.exp / 4));
    assert.equal(offer.slots.length, REWARD_SLOT_COUNT);
    assert.ok([...offer.slots, ...offer.reserve].every(slot => slot.rarity === 'common'));
    assert.ok(offer.slots.some(slot => slot.junk === true));
    session.reset();
    assert.equal((await session.prepare(1)).ok, true);
    assert.equal(session.state().lobby.weakFoes, true, '重新准备读取已存判定，不取之后的关系');
    assert.equal(session.start().ok, true);
    session.flushPersist();
    assert.equal(JSON.parse(storage.data.get(sessionKeyFor('g3d-new'))).setup.weakFoes, true);
    for (let i = 0; i < 400 && session.state().status === 'battle'; i += 1) {
        const state = session.state();
        const action = state.legal.find(a => a.type === 'play') || state.legal.find(a => a.type === 'end-turn');
        assert.ok(action, '存在合法出牌或结束回合动作');
        assert.equal(session.act(action).ok, true);
    }
    assert.equal(session.state().battle.outcome, 'victory');
    assert.equal((await session.loadFlip()).ok, true);
    assert.equal(session.state().flip.purge, undefined);
    assert.equal((await session.flip(0)).ok, true);
    if (session.state().flip.needCard) assert.equal((await session.pickCard('skip')).ok, true);
    const before = heroOf(await ledger.effectiveState({ raw: true }));
    const done = await session.finish();
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(reportWeakOf(chat.at(-1).mes), true);
    const paid = tables.read().ledger.filter(entry => entry.type === 'battle-points');
    assert.equal(paid.length, 1);
    assert.equal(paid[0].payload.weak, true);
    assert.equal(paid[0].payload.amount, weakBattlePoints('normal', combatId));
    assert.equal(paid[0].payload.bonus, undefined);
    const after = heroOf(await ledger.effectiveState({ raw: true }));
    assert.equal(after.exp - before.exp, offer.exp);
    assert.equal(after.points - before.points, paid[0].payload.amount);
    assert.equal(after.purge, undefined, '弱敌胜利不计普通胜场');
});

test('劣等杂物（v6 G3d）库存往返：同名不同品质分开、同品质叠加，品质旁的回收价值与真实到账一致', async t => {
    const { JSDOM } = await import('jsdom');
    const { createRecordPanelController } = await import('../src/visual/igs-ui/record-panel.js');
    const { createMemoryStorage } = await import('../src/storage/preset-store.js');
    const { createCombatServices } = await import('../src/core/combat-services.js');
    const { reportIdFor, attachLoot } = await import('../src/combat/report.js');
    const { sellPrice } = await import('../src/combat/points.js');
    const { normalizeLedgerEntry } = await import('../src/combat/schema.js');
    const { scanGrowthTags, computeEffectiveState } = await import('../src/combat/ledger.js');
    const { heroInventoryView } = await import('../src/combat/inventory-view.js');
    for (const firstJunk of [false, true]) {
        const db = createLedgerMockHost({ supportCallbacks: true });
        db.sheets.sheet_userbag = userInventorySheet();
        const tables = createCombatTables({ api: db.api });
        const inventory = createInventoryTables({ api: db.api, client: tables.client, serial: tables.serial });
        assert.equal((await tables.ensure()).ok, true);
        assert.equal((await inventory.ensure()).ok, true);
        assert.equal((await tables.append('profile', [row(classDef('cls-blade'), 1), row(heroDef(), 2)])).ok, true);
        const chat = [ai('桥头')];
        const ledger = createCombatLedger({ tables, inventory, chat: () => chat, userName: '主角', now: () => 7 });
        t.after(() => tables.client.dispose());
        let sequence = 0;
        const award = async junk => {
            const combatId = `cb|stock|${sequence++}`;
            const reportId = reportIdFor(combatId);
            const anchor = { messageId: chat.length - 1, swipeId: 0, tagHash: 'offer', occurrence: sequence };
            const slot = { index: 0, kind: 'keepsake', rarity: 'common', name: '旧铜铃', origin: '桥头战利品', ...(junk ? { junk: true } : {}) };
            const slots = [slot, ...[1, 2].map(index => ({ ...slot, index, name: `未选杂物${index}` }))];
            const offer = { id: ledgerEntryId('offer', 'pc-hero', anchor), type: 'offer', character: 'pc-hero', anchor,
                payload: { combatId, tier: 'normal', exp: 5, reveal: 0, slots }, createdAt: 7 };
            assert.equal((await ledger.append([offer])).ok, true);
            chat.push(user(attachLoot(`<igs-combat-report result="win" id="${reportId}">战报</igs-combat-report>`,
                { character: '主角', reportId, index: 0, set: 'main', slot })));
            const pending = scanGrowthTags(await ledger.read(), chat, { userName: '主角', messageIds: [chat.length - 1], now: 7 });
            const forged = clone(pending.entries.find(entry => entry.type === 'loot'));
            assert.ok(forged);
            if (junk) delete forged.payload.slot.junk;
            else forged.payload.slot.junk = true;
            const beforeStock = clone(inventory.read().inventory.items);
            const rejected = await ledger.append([forged]);
            assert.ok(rejected.stock.some(item => item.skipped && item.reason === 'combat-loot-slot-mismatch'), JSON.stringify(rejected));
            assert.equal(tables.read().ledger.some(entry => entry.id === forged.id), false, '品质不符不写领取记录');
            assert.deepEqual(inventory.read().inventory.items, beforeStock, '品质不符不改库存');
            // 同一领取身份仍可按 offer 的真实品质入库。
            const scanned = await ledger.scan({ messageIds: [chat.length - 1] });
            assert.equal(scanned.ok, true, JSON.stringify(scanned));
            assert.equal(scanned.entries.filter(entry => entry.type === 'loot').length, 1);
            chat.push(ai('下一场'));
        };

        await award(firstJunk);
        await award(!firstJunk);
        await award(true);
        await award(true);
        await award(true);
        let heroView = heroOf(await ledger.effectiveState({ raw: true }));
        assert.equal(heroView.collection.length, 2);
        const junk = heroView.collection.find(item => item.junk === true);
        const normal = heroView.collection.find(item => item.junk !== true);
        assert.ok(junk && normal);
        assert.notEqual(junk.itemId, normal.itemId);
        assert.equal(junk.count, 4);
        assert.equal(normal.count, 1);
        const definition = inventory.read().gear.rows.find(row => row.name === junk.name)?.definition;
        assert.equal(definition?.junk, true, '装配定义读回保留劣等标记');
        assert.equal((await ledger.scan()).ok, true);
        assert.deepEqual(heroOf(await ledger.effectiveState({ raw: true })).collection, heroView.collection, '重复扫描不重复领取');
        const dom = new JSDOM('<div id="igs-overlay"></div>');
        const services = createCombatServices({
            global: { AutoCardUpdaterAPI: db.api, SillyTavern: { getContext: () => ({ chat }) } },
            storage: createMemoryStorage(), getChatId: () => `recycle-${firstJunk}`, getUserName: () => '主角',
            getReaderSettings: () => ({ combatExpansion: { enabled: true } }),
        });
        t.after(() => services.resetChat());
        const beforeInvalid = clone(inventory.read().inventory.items);
        const ledgerSize = tables.read().ledger.length;
        for (const count of [0, -1, 1.5, '2', null, NaN, Number.MAX_SAFE_INTEGER + 1]) {
            const rejected = await services.sellHeroItem('keepsake', junk.itemId, count);
            assert.equal(rejected.reason, 'combat-sell-count-invalid', String(count));
        }
        assert.equal((await services.sellHeroItem('keepsake', junk.itemId, 5)).reason, 'combat-sell-count-insufficient');
        assert.equal(tables.read().ledger.length, ledgerSize, '非法数量不写账本');
        assert.deepEqual(inventory.read().inventory.items, beforeInvalid, '非法数量不改库存');
        let saleFinished;
        let sale = new Promise(resolve => { saleFinished = resolve; });
        const soldCounts = [];
        const panel = createRecordPanelController(dom.window.document,
            { AutoCardUpdaterAPI: db.api, localStorage: createMemoryStorage() }, null, {
                getHeroInventory: () => ({ ...heroView, ok: heroView.inventory?.ok === true }),
                sellHeroItem: async (kind, key, count) => {
                    assert.equal(kind, 'keepsake');
                    assert.equal(key, junk.itemId);
                    soldCounts.push(count);
                    const result = await services.sellHeroItem(kind, key, count);
                    heroView = heroOf(await ledger.effectiveState({ raw: true }));
                    saleFinished(result);
                    return result;
                },
            });
        t.after(() => { panel.close(); dom.window.close(); });
        assert.equal(panel.open(dom.window.document.querySelector('#igs-overlay'), {}, 'inventory').ok, true);
        const button = [...dom.window.document.querySelectorAll('[data-record-act="select"]')].find(node => node.textContent.includes(junk.name));
        assert.ok(button, '库存中的劣等杂物可选');
        button.click();
        const price = sellPrice(junk.rarity, junk.itemId, { junk: true });
        const qualityRow = () => [...dom.window.document.querySelectorAll('.igs-record-item-detail .igs-record-fields div')].find(node => node.querySelector('dt')?.textContent === '品质');
        assert.equal(qualityRow()?.querySelector('dd')?.textContent, `劣等 · ${price} 积分`);
        const recycle = dom.window.document.querySelector('[data-record-act="sell"]');
        assert.equal(recycle.textContent, '回收');
        recycle.click();
        const modalOf = () => dom.window.document.querySelector('.igs-page-modal[role="dialog"]');
        let modal = modalOf();
        assert.ok(modal, '点击回收打开独立确认弹窗');
        assert.equal(dom.window.document.querySelector('[data-record-act="sell"]'), recycle, '原回收按钮保持不变');
        assert.equal(dom.window.document.querySelector('.igs-record-item-actions [data-igs-modal="ok"]'), null);
        assert.ok(modal.textContent.includes(`是否回收「${junk.name}」`));
        assert.ok(modal.textContent.includes(`${price} 积分`));
        const quantity = modal.querySelector('input[type="number"]');
        assert.equal(quantity.value, '1');
        assert.equal(quantity.max, '4');
        const setQuantity = (dialog, value) => {
            const input = dialog.querySelector('input[type="number"]');
            input.value = String(value);
            input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        };
        for (const value of ['', 0, 1.5, 5]) {
            setQuantity(modal, value);
            assert.equal(modal.querySelector('[data-igs-modal="ok"]').disabled, true);
            modal.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            assert.equal(modalOf(), modal, '非法数量不能由 Enter 确认');
        }
        setQuantity(modal, 2);
        assert.equal(modal.querySelector('[data-igs-modal="ok"]').disabled, false);
        assert.equal(modal.querySelector('.igs-page-modal-summary').textContent, `总计 ${price * 2} 积分`);
        assert.equal(qualityRow()?.querySelector('dd')?.textContent, `劣等 · ${price} 积分`);
        assert.equal(tables.read().ledger.filter(entry => entry.type === 'sell').length, 0, '确认前不回收、不入账');
        const stockBeforeConfirm = clone(inventory.read().inventory.items);
        recycle.click();
        assert.equal(modalOf(), modal, '连续点击回收不重复打开或提交');
        modal.querySelector('[data-igs-modal="cancel"]').click();
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(modalOf(), null);
        assert.equal(dom.window.document.activeElement, recycle, '取消后焦点返回回收按钮');
        recycle.click();
        modal = modalOf();
        modal.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(modalOf(), null, 'Esc 取消确认');
        recycle.click();
        const staleConfirm = modalOf().querySelector('[data-igs-modal="ok"]');
        panel.close();
        assert.equal(modalOf(), null, '关闭面板清理确认弹窗');
        staleConfirm.click();
        await new Promise(resolve => setImmediate(resolve));
        assert.deepEqual(inventory.read().inventory.items, stockBeforeConfirm);
        assert.equal(tables.read().ledger.filter(entry => entry.type === 'sell').length, 0, '取消、Esc、关闭面板均不回收');
        assert.equal(panel.open(dom.window.document.querySelector('#igs-overlay'), {}, 'inventory').ok, true);
        [...dom.window.document.querySelectorAll('[data-record-act="select"]')].find(node => node.textContent.includes(junk.name)).click();
        dom.window.document.querySelector('[data-record-act="sell"]').click();
        setQuantity(modalOf(), 2);
        const confirm = modalOf().querySelector('[data-igs-modal="ok"]');
        assert.equal(confirm.textContent, '确认');
        const beforePoints = heroView.points;
        confirm.click();
        confirm.click();
        const result = await sale;
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(modalOf(), null);
        assert.equal(tables.read().ledger.filter(entry => entry.type === 'sell').length, 1, '重复确认只提交一条批量记录');
        assert.equal(result.ok, true, JSON.stringify(result));
        assert.equal(result.price, price * 2);
        assert.equal(heroView.points - beforePoints, price * 2);
        assert.deepEqual(soldCounts, [2]);
        assert.equal(dom.window.document.querySelector('.igs-record-feedback').textContent, `已回收${junk.name} × 2，获得 ${price * 2} 积分`);
        assert.equal(heroView.collection.find(item => item.itemId === junk.itemId).count, 2);
        assert.equal(inventory.read().inventory.items.find(item => item.name === junk.name)?.quantity, 2);
        assert.ok(inventory.read().gear.rows.some(item => item.name === junk.name), '部分回收保留装配定义');
        assert.equal(heroView.collection.find(item => item.itemId === normal.itemId).count, 1);
        const sold = tables.read().ledger.find(entry => entry.type === 'sell');
        assert.equal(sold.payload.count, 2);
        assert.equal(sold.payload.junk, true);
        assert.equal(normalizeLedgerEntry(sold).ok, true);
        for (const count of [0, -1, 1.5, '2', null]) {
            assert.equal(normalizeLedgerEntry({ ...sold, payload: { ...sold.payload, count } }).ok, false);
        }
        for (const payload of [{ gearId: 'gear-probe', junk: true }, { lootId: 'loot-probe', junk: true }]) {
            assert.equal(normalizeLedgerEntry({ ...sold, payload }).ok, false, '不支持的卖出目标不能静默丢弃 junk');
        }
        const snapshot = await ledger.read();
        const legacy = { ...snapshot, entries: snapshot.entries.map(entry => clone(entry)) };
        delete legacy.entries.find(entry => entry.id === sold.id).payload.count;
        const legacyState = computeEffectiveState(legacy, chat, { userName: '主角', heroInventory: heroInventoryView(inventory.read()) });
        assert.equal(legacyState.ok, true);
        assert.equal(heroOf(legacyState).points, heroView.points - price, '旧 sell 缺 count 按单件重放');
        sale = new Promise(resolve => { saleFinished = resolve; });
        dom.window.document.querySelector('[data-record-act="sell"]').click();
        assert.equal(modalOf().querySelector('input').max, '2', '回读后上限变为剩余数量');
        setQuantity(modalOf(), 2);
        modalOf().querySelector('[data-igs-modal="ok"]').click();
        const full = await sale;
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(full.ok, true, JSON.stringify(full));
        assert.equal(full.price, price * 2);
        assert.deepEqual(soldCounts, [2, 2]);
        assert.equal(heroView.collection.some(item => item.itemId === junk.itemId), false);
        assert.equal(inventory.read().inventory.items.some(item => item.name === junk.name), false, '全量回收删除物品表行');
        assert.equal(inventory.read().gear.rows.some(item => item.name === junk.name), false, '全量回收删除装配定义');
        assert.equal([...dom.window.document.querySelectorAll('.igs-record-slot-name')].some(node => node.textContent === junk.name), false, 'UI 回读移除耗尽物品');
        assert.equal(heroView.points - beforePoints, price * 4);
        assert.equal(heroOf(await ledger.effectiveState({ raw: true })).points, heroView.points, '重新重放积分不重复增加');
        const ring = { gearId: gearIdFor('回收铜戒'), name: '回收铜戒', slot: 'accessory', rarity: 'rare', bonus: { ability: 'con', amount: 3 } };
        assert.equal((await ledger.grantInitialGear('pc-hero', [ring], { anchor: { messageId: chat.length - 1, swipeId: 0 } })).ok, true);
        assert.equal((await inventory.changeQuantities({ name: ring.name, delta: 3, category: '装备' })).ok, true);
        const gearPrice = sellPrice(ring.rarity, ring.gearId);
        const beforeGear = tables.read().ledger.length;
        assert.equal((await services.sellHeroItem('gear', ring.gearId, 4)).reason, 'combat-sell-count-insufficient', '穿戴件不计入上限');
        assert.equal(tables.read().ledger.length, beforeGear);
        const spares = await services.sellHeroItem('gear', ring.gearId, 3);
        assert.equal(spares.ok, true, JSON.stringify(spares));
        assert.equal(spares.price, gearPrice * 3);
        assert.equal(inventory.read().inventory.items.find(item => item.name === ring.name)?.quantity, 1);
        assert.ok(inventory.read().gear.rows.some(item => item.name === ring.name), '保留穿戴件的定义');
        heroView = heroOf(await ledger.effectiveState({ raw: true }));
        assert.ok(equippedGear(heroView.gear.slots).some(item => item.gearId === ring.gearId));
        assert.equal((await services.sellHeroItem('gear', ring.gearId)).reason, 'combat-gear-equipped');
        assert.equal((await ledger.setGear('pc-hero', ring.gearId, false)).ok, true);
        const lastGear = await services.sellHeroItem('gear', ring.gearId);
        assert.equal(lastGear.ok, true, JSON.stringify(lastGear));
        assert.equal(lastGear.price, gearPrice, '省略数量仍回收一件');
        assert.equal(inventory.read().inventory.items.some(item => item.name === ring.name), false);
        assert.equal(inventory.read().gear.rows.some(item => item.name === ring.name), false);
        assert.equal(heroOf(await ledger.effectiveState({ raw: true })).points - beforePoints, price * 4 + gearPrice * 4);
        const originalDelete = db.api.deleteRow;
        const gearTableName = inventory.read().gear.name;
        const normalBefore = inventory.read();
        const pointsBeforeFailure = heroOf(await ledger.effectiveState({ raw: true })).points;
        let cleanupAttempts = 0;
        db.api.deleteRow = function (first, second) {
            const tableName = first && typeof first === 'object' ? first.tableName : first;
            if (tableName === gearTableName) { cleanupAttempts += 1; return false; }
            return originalDelete.call(this, first, second);
        };
        t.after(() => { db.api.deleteRow = originalDelete; });
        const cleanupFailed = await services.sellHeroItem('keepsake', normal.itemId);
        assert.equal(cleanupFailed.ok, false, JSON.stringify(cleanupFailed));
        assert.ok(cleanupAttempts > 0, '通过真实装配表删除写口注入失败');
        assert.equal(cleanupFailed.stock[0].restored, true);
        assert.equal(cleanupFailed.stock[0].revoked, true);
        assert.equal(heroOf(await ledger.effectiveState({ raw: true })).points, pointsBeforeFailure, '失败回收撤销积分');
        const normalAfter = inventory.read();
        const stockOf = snapshot => snapshot.inventory.items.find(item => item.name === normal.name);
        assert.deepEqual(
            [stockOf(normalAfter)?.quantity, stockOf(normalAfter)?.description, stockOf(normalAfter)?.category],
            [stockOf(normalBefore)?.quantity, stockOf(normalBefore)?.description, stockOf(normalBefore)?.category],
            '定义删除失败后恢复物品数量与文本字段',
        );
        assert.deepEqual(normalAfter.gear.rows.find(item => item.name === normal.name)?.definition,
            normalBefore.gear.rows.find(item => item.name === normal.name)?.definition);
        db.api.deleteRow = originalDelete;
        const unverifiedLedger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7,
            inventory: { ...inventory, async setGearRow(name, record) {
                const result = await inventory.setGearRow(name, record);
                return record === null && result.ok ? { ok: false, reason: 'gear-write-unverified' } : result;
            } },
        });
        const unverified = await unverifiedLedger.sellKeepsake(normal.itemId);
        assert.equal(unverified.ok, false, JSON.stringify(unverified));
        assert.equal(unverified.stock[0].restored, true, '删除已执行但回执未确认时恢复原定义');
        assert.equal(unverified.stock[0].revoked, true);
        assert.equal(stockOf(inventory.read())?.quantity, stockOf(normalBefore)?.quantity);
        assert.deepEqual(inventory.read().gear.rows.find(item => item.name === normal.name)?.definition,
            normalBefore.gear.rows.find(item => item.name === normal.name)?.definition);
        assert.equal(heroOf(await ledger.effectiveState({ raw: true })).points, pointsBeforeFailure);
        const rollbackLedger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7,
            inventory: {
                ...inventory,
                setGearRow: (name, record) => record === null
                    ? Promise.resolve({ ok: false, reason: 'gear-write-failed' }) : inventory.setGearRow(name, record),
                changeQuantities: changes => (Array.isArray(changes) ? changes : [changes]).some(change => change.delta > 0)
                    ? Promise.resolve({ ok: false, reason: 'inventory-write-failed', applied: [] }) : inventory.changeQuantities(changes),
            },
        });
        const rollbackFailed = await rollbackLedger.sellKeepsake(normal.itemId);
        assert.equal(rollbackFailed.ok, false, JSON.stringify(rollbackFailed));
        assert.equal(rollbackFailed.reason, 'combat-sell-rollback-failed', '补偿失败不得报回收成功');
        assert.equal(rollbackFailed.stock[0].restored, false);
        assert.equal(rollbackFailed.stock[0].revoked, true);
        assert.equal(stockOf(inventory.read()), undefined);
        assert.equal(heroOf(await ledger.effectiveState({ raw: true })).points, pointsBeforeFailure);
        const originalStock = stockOf(normalBefore);
        assert.equal((await inventory.changeQuantities({
            name: originalStock.name, delta: originalStock.quantity,
            description: originalStock.description, category: originalStock.category,
        })).ok, true, '故障解除后显式恢复受影响的测试库存');
        assert.equal(stockOf(inventory.read())?.quantity, originalStock.quantity);
        const retried = await services.sellHeroItem('keepsake', normal.itemId);
        assert.equal(retried.ok, true, JSON.stringify(retried));
        const normalPrice = sellPrice(normal.rarity, normal.itemId);
        assert.equal(retried.price, normalPrice);
        assert.equal(heroOf(await ledger.effectiveState({ raw: true })).points, pointsBeforeFailure + normalPrice, '重试只结算一次');
        assert.equal(inventory.read().inventory.items.some(item => item.name === normal.name), false);
        assert.equal(inventory.read().gear.rows.some(item => item.name === normal.name), false);
    }
});
