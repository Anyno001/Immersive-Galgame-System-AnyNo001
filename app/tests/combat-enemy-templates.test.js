// 敌人模板库：档案与单位新字段（template / script / maxRepeat / afterTurns）的校验、稀疏往返与建局。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfile } from '../src/combat/schema.js';
import { applyAction, createBattle, replayBattle } from '../src/combat/engine.js';
import { chooseSkillIntent } from '../src/combat/policy.js';
import { templateEnemy } from '../src/combat/generation.js';
import { BASIC_CARDS } from '../src/combat/rules.js';
import { conditionHolds, computeBlock, computeDamage, describeIntent } from '../src/combat/battle-state.js';
import { enemy, cycle } from '../src/combat/enemies/dsl.js';
import { ENEMIES, SOURCE_TIER_REF, prepareEnemyEntries, materializeEnemy } from '../src/combat/enemies/index.js';
import { STS1_ACT1 } from '../src/combat/enemies/sts1-act1.js';
import { STS1_ACT2 } from '../src/combat/enemies/sts1-act2.js';
import { STS1_ACT3 } from '../src/combat/enemies/sts1-act3.js';
import { STS1_ACT4, STS1_EVENTS } from '../src/combat/enemies/sts1-late.js';
import { STS2_OVERGROWTH } from '../src/combat/enemies/sts2-overgrowth.js';
import { STS2_UNDERDOCKS } from '../src/combat/enemies/sts2-underdocks.js';
import { STS2_HIVE } from '../src/combat/enemies/sts2-hive.js';
import { STS2_GLORY } from '../src/combat/enemies/sts2-glory.js';
import { STS2_ELITES } from '../src/combat/enemies/sts2-elites.js';
import { STS2_BOSSES, STS2_EVENTS } from '../src/combat/enemies/sts2-late.js';
import { drawEnemy, enemyCandidates, resolveEnemy } from '../src/combat/enemies/draw.js';
import { enemyReferences, scaleEnemyModel } from '../src/combat/enemies/scaling.js';
import { buildCombatReport } from '../src/combat/report.js';
import { parseBattleReport, battleDirectiveOf } from '../src/combat/battle-report.js';
import { createCurrencyContext } from '../src/scene/stats/stat-bars.js';
import { applyBattleReport } from '../src/scene/stats/stat-battle.js';
import { CARD_IMPLANT_TAG_HASH, CARD_LOST_TAG_HASH, createCombatLedger, normalizeSnapshot } from '../src/combat/ledger.js';
import { ledgerEntryId } from '../src/combat/schema.js';
import { ENEMY_ENCOUNTERS, encounterByName, materializeEncounter, prepareEncounters } from '../src/combat/enemies/encounters.js';
import { encounterSize, enemyUnits } from '../src/combat/session.js';
import { enemyPool, fallbackChoice, materializeChoice } from '../src/combat/enemies/pool.js';
import { DESCRIBE_TEXT_MAX, UNKNOWN_TEXT, describeEnemy } from '../src/combat/enemies/describe.js';
import { describeEnemySuitability } from '../src/combat/enemies/suitability.js';
import { enemyIdFor, enemyRosterEntities, generateEntities, generationWrites } from '../src/combat/generation.js';
import { SESSION_VERSION, createCombatSession, locateCombatStart, sessionKeyFor } from '../src/combat/session.js';
import { createGenerationFixture } from './helpers/combat-generation-fixture.js';
import { createCountingStorage } from './helpers/combat-mock-host-services.js';
import { createCombatTables } from '../src/data/shujuku/combat-tables.js';
import { kitKinRefs } from '../src/combat/kin.js';
import { scriptBoundSkills, stitchKits } from '../src/combat/enemies/stitch-kin.js';



const skill = (id, extra = {}) => ({ id, name: id, intent: 'attack', effects: [{ op: 'damage', amount: 5 }], ...extra });
const enemyProfile = (extra = {}) => ({ kind: 'enemy', id: 'foe-a', name: '甲', tier: 'normal', base: { hp: 40 }, skills: [skill('s1'), skill('s2')], ...extra });
const reasons = (result) => result.errors.map((issue) => `${issue.path}:${issue.reason}`);

const heroUnit = () => ({ id: 'hero', side: 'ally', kind: 'deck', maxHp: 60, deck: Array(5).fill('basic-strike'), catalog: { 'basic-strike': BASIC_CARDS['basic-strike'] } });
const foeUnit = (extra = {}) => ({ id: 'foe', side: 'enemy', kind: 'skill', maxHp: 40, skills: [skill('s1'), skill('s2')], ...extra });
const setupWith = (foe) => ({ controlledId: 'hero', units: [heroUnit(), foe] });

describe('档案新字段', () => {
    it('旧档案归一化往返不变，不出现新字段', () => {
        for (const tier of ['normal', 'elite', 'boss']) {
            const profile = templateEnemy('史莱姆', tier);
            const again = normalizeProfile(profile);
            assert.equal(again.ok, true);
            assert.deepEqual(again.value, profile);
            for (const key of ['template', 'script']) assert.equal(Object.hasOwn(profile, key), false);
            assert.equal(profile.skills.some((s) => Object.hasOwn(s, 'maxRepeat')), false);
        }
    });

    it('maxRepeat 保留显式 0–3，0 不限连用；非法值在档案和建局均拒收', () => {
        for (const maxRepeat of [0, 1, 2, 3]) {
            const skills = [skill('s1', { maxRepeat }), skill('s2')];
            const ok = normalizeProfile(enemyProfile({ skills }));
            assert.equal(ok.ok, true, JSON.stringify(ok.errors));
            assert.equal(ok.value.skills[0].maxRepeat, maxRepeat);
            assert.equal(Object.hasOwn(ok.value.skills[1], 'maxRepeat'), false);
            assert.deepEqual(normalizeProfile(ok.value).value, ok.value);
            assert.equal(createBattle(setupWith(foeUnit({ skills })), 7).ok, true);
            const kin = { imp: { maxHp: 7, skills } };
            assert.equal(normalizeProfile(enemyProfile({ kin })).ok, true);
            assert.equal(createBattle(setupWith(foeUnit({ kin })), 7).ok, true);
        }
        for (const maxRepeat of [-1, 4, 0.5, null, '0', false, Infinity, NaN]) {
            const skills = [skill('s1', { maxRepeat }), skill('s2')];
            const bad = normalizeProfile(enemyProfile({ skills }));
            assert.deepEqual(reasons(bad), ['skills[0].maxRepeat:out-of-range']);
            assert.equal(createBattle(setupWith(foeUnit({ skills })), 7).error?.reason, 'invalid-skill');
        }
    });

    it('script 引用必须存在，loopFrom 落在 cycle 内，空脚本拒收', () => {
        const ok = normalizeProfile(enemyProfile({ script: { opener: 's2', cycle: ['s1', 's2'], loopFrom: 1 } }));
        assert.equal(ok.ok, true);
        assert.deepEqual(ok.value.script, { opener: 's2', cycle: ['s1', 's2'], loopFrom: 1 });
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ script: { cycle: ['s1', 'zz'] } }))), ['script.cycle[1]:unknown-skill']);
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ script: { cycle: ['s1'], loopFrom: 1 } }))), ['script.loopFrom:out-of-range']);
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ script: {} }))), ['script:empty-script']);
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ script: { opener: 's1', loopFrom: 0 } }))), ['script.loopFrom:unknown-field']);
    });

    it('阶段可按回合进入并带脚本；与血量阈值二选一；脚本可引用阶段技能', () => {
        const phase = { afterTurns: 3, addSkills: [skill('p1')], script: { cycle: ['p1', 's1'] } };
        const ok = normalizeProfile(enemyProfile({ phases: [phase] }));
        assert.equal(ok.ok, true);
        assert.equal(ok.value.phases[0].afterTurns, 3);
        assert.equal(Object.hasOwn(ok.value.phases[0], 'hpBelowPct'), false);
        const conflict = normalizeProfile(enemyProfile({ phases: [{ ...phase, hpBelowPct: 50 }] }));
        assert.deepEqual(reasons(conflict), ['phases[0].afterTurns:phase-trigger-conflict']);
        const old = normalizeProfile(enemyProfile({ phases: [{ hpBelowPct: 50 }] }));
        assert.equal(Object.hasOwn(old.value.phases[0], 'script'), false);
        assert.equal(Object.hasOwn(old.value.phases[0], 'afterTurns'), false);
    });

    it('带 template 的档案技能最少 1 个、首领不强制阶段；未带 template 的首领仍要求阶段', () => {
        const template = { enemyId: 'sts1-cultist', model: 'original' };
        const ok = normalizeProfile(enemyProfile({ tier: 'boss', base: { hp: 200 }, skills: [skill('s1')], template }));
        assert.equal(ok.ok, true, JSON.stringify(ok.errors));
        assert.deepEqual(ok.value.template, template);
        const plain = normalizeProfile(enemyProfile({ tier: 'boss', base: { hp: 200 } }));
        assert.ok(reasons(plain).includes('phases:boss-needs-phase'));
        assert.ok(reasons(normalizeProfile(enemyProfile({ skills: [skill('s1')] }))).includes('skills:length-out-of-range'));
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ template: { enemyId: 'x', model: 'mixed' } }))), ['template.model:invalid-enum']);
    });
});

describe('单位新字段', () => {
    it('旧 setup 建局形状不变', () => {
        const battle = createBattle(setupWith(foeUnit({ phases: [{ hpBelowPct: 50, addSkills: [skill('p1')] }] })), 7);
        assert.equal(battle.ok, true);
        const unit = battle.state.units.foe;
        for (const key of ['template', 'script', 'turnPhases', 'turnPhasesApplied']) assert.equal(Object.hasOwn(unit, key), false);
        assert.equal(unit.phases.length, 1);
    });

    it('template 在档案、会话 setup 与运行时保留独立副本；非法值在两个入口均拒收', () => {
        const profile = materializeEnemy(ENEMIES.find((item) => item.sourceKey === 'The Guardian'), 'original');
        const [unit] = enemyUnits({ enemies: [{ name: profile.name, count: 1 }] }, new Map([[profile.name, profile]]), 1, 'normal').units;
        assert.deepEqual(unit.template, profile.template);
        const battle = battleWithTraits(unit);
        assert.deepEqual(battle.state.units[unit.id].template, profile.template);
        assert.notEqual(battle.state.units[unit.id].template, unit.template);
        assert.deepEqual(replayBattle(battle.setup, 7, []).state, battle.state);
        for (const template of [null, [], {}, { enemyId: 'en-x', model: 'mixed' },
            { enemyId: '../bad', model: 'original' }, { enemyId: 'en-x', model: 'original', extra: true }]) {
            assert.equal(normalizeProfile(enemyProfile({ template })).ok, false);
            assert.equal(createBattle(setupWith(foeUnit({ template })), 7).error?.reason, 'invalid-template');
        }
        const hero = { ...heroUnit(), template: profile.template };
        assert.equal(createBattle({ controlledId: 'hero', units: [hero, foeUnit()] }, 7).error?.reason, 'invalid-template');
    });

    it('script 与按回合阶段只在定义中带有时写入；血量阶段不混入回合阶段', () => {
        const foe = foeUnit({
            script: { opener: 's2', cycle: ['s1'] },
            phases: [{ afterTurns: 4, addSkills: [skill('p2')] }, { hpBelowPct: 40, addSkills: [] }, { afterTurns: 2, addSkills: [skill('p1')] }],
        });
        const battle = createBattle(setupWith(foe), 7);
        assert.equal(battle.ok, true, JSON.stringify(battle.error));
        const unit = battle.state.units.foe;
        assert.deepEqual(unit.script, { opener: 's2', cycle: ['s1'] });
        assert.deepEqual(unit.turnPhases.map((p) => p.afterTurns), [2, 4]);
        assert.equal(unit.turnPhasesApplied, 0);
        assert.deepEqual(unit.phases.map((p) => p.hpBelowPct), [40]);
    });

    it('非法 script、maxRepeat、afterTurns 拒绝建局', () => {
        const cases = [
            [foeUnit({ script: { cycle: ['nope'] } }), 'invalid-script'],
            [foeUnit({ script: { cycle: ['s1'], loopFrom: 2 } }), 'invalid-script'],
            [foeUnit({ skills: [skill('s1', { maxRepeat: -1 })] }), 'invalid-skill'],
            [foeUnit({ phases: [{ afterTurns: 0 }] }), 'invalid-phase'],
            [foeUnit({ phases: [{ afterTurns: 2, hpBelowPct: 50 }] }), 'invalid-phase'],
        ];
        for (const [foe, reason] of cases) assert.equal(createBattle(setupWith(foe), 7).error?.reason, reason);
        const hero = { ...heroUnit(), script: { opener: 'x' } };
        assert.equal(createBattle({ controlledId: 'hero', units: [hero, foeUnit()] }, 7).error?.reason, 'invalid-script');
    });
});

// 只加格挡的技能：双方都不掉血，便于观察长序列。
const guard = (id, extra = {}) => ({ id, name: id, intent: 'defend', effects: [{ op: 'block', amount: 1, target: 'self' }], ...extra });
const END_TURN = { type: 'end-turn' };
function runTurns(foe, turns = 8) {
    const setup = setupWith(foe);
    const created = createBattle(setup, 7);
    assert.equal(created.ok, true, JSON.stringify(created.error));
    let state = created.state;
    const events = [...created.events];
    const actions = [];
    for (let i = 0; i < turns && !state.outcome; i += 1) {
        const result = applyAction(state, END_TURN);
        assert.equal(result.ok, true, JSON.stringify(result.error));
        state = result.state;
        events.push(...result.events);
        actions.push(END_TURN);
    }
    return { setup, state, events, actions, skills: events.filter((e) => e.type === 'skill' && e.unitId === 'foe').map((e) => e.skillId) };
}

describe('行动脚本', () => {
    it('首招只出一次，之后按 cycle 走，末尾回到 loopFrom', () => {
        const { skills } = runTurns(foeUnit({ skills: ['s1', 's2', 's3', 's4'].map((id) => guard(id)), script: { opener: 's2', cycle: ['s1', 's3', 's4'], loopFrom: 1 } }));
        assert.deepEqual(skills.slice(0, 7), ['s2', 's1', 's3', 's4', 's3', 's4', 's3']);
    });

    it('只有首招没有 cycle 时，首招之后回到加权随机', () => {
        const { skills, state } = runTurns(foeUnit({ skills: [guard('s1'), guard('s2')], script: { opener: 's2' } }));
        assert.equal(skills[0], 's2');
        assert.equal(state.scripts.foe.opened, true);
        assert.ok(skills.length >= 6);
    });

    it('按回合进入的阶段替换技能并切换脚本，进度归零', () => {
        const foe = foeUnit({
            skills: [guard('s1'), guard('s2')],
            script: { cycle: ['s1'] },
            phases: [{ afterTurns: 3, removeSkills: ['s1'], addSkills: [guard('p1')], script: { cycle: ['p1', 's2'] } }],
        });
        const { skills, events, state } = runTurns(foe);
        assert.deepEqual(skills.slice(0, 6), ['s1', 's1', 'p1', 's2', 'p1', 's2']);
        const phases = events.filter((e) => e.type === 'phase' && e.unitId === 'foe');
        assert.equal(phases.length, 1);
        assert.equal(phases[0].trigger, 'turns');
        assert.equal(state.units.foe.turnPhasesApplied, 1);
    });

    it('不带脚本的单位不产生 state.scripts', () => {
        const { state } = runTurns(foeUnit({ skills: [guard('s1'), guard('s2')] }), 4);
        assert.equal(Object.hasOwn(state, 'scripts'), false);
    });

    it('脚本进度走写时复制：applyAction 不改输入局面；重放得到同一事件序列与进度', () => {
        const foe = foeUnit({ skills: ['s1', 's2', 's3'].map((id) => guard(id)), script: { opener: 's3', cycle: ['s1', 's2'] } });
        const run = runTurns(foe, 6);
        const snapshot = JSON.stringify(run.state.scripts);
        const next = applyAction(run.state, END_TURN);
        assert.equal(next.ok, true);
        assert.equal(JSON.stringify(run.state.scripts), snapshot);
        assert.notEqual(JSON.stringify(next.state.scripts), snapshot);
        const replayed = replayBattle(run.setup, 7, run.actions);
        assert.equal(replayed.ok, true);
        assert.deepEqual(replayed.events, run.events);
        assert.deepEqual(replayed.state.scripts, run.state.scripts);
    });
});

describe('连用上限', () => {
    const stateWith = (skills, history) => ({ units: { u: { id: 'u', side: 'enemy', alive: true, skills } }, history: { u: history }, cooldowns: {} });
    it('缺省连用 2 次后换招', () => {
        assert.equal(chooseSkillIntent(stateWith([guard('s1'), guard('s2')], ['s1']), 'u', 0).skillId, 's1');
        assert.equal(chooseSkillIntent(stateWith([guard('s1'), guard('s2')], ['s1', 's1']), 'u', 0).skillId, 's2');
    });
    it('maxRepeat 按技能放宽或收紧', () => {
        const loose = [guard('s1', { maxRepeat: 3 }), guard('s2')];
        assert.equal(chooseSkillIntent(stateWith(loose, ['s1', 's1']), 'u', 0).skillId, 's1');
        assert.equal(chooseSkillIntent(stateWith(loose, ['s2', 's1', 's1', 's1']), 'u', 0).skillId, 's2');
        const strict = [guard('s1', { maxRepeat: 1 }), guard('s2')];
        assert.equal(chooseSkillIntent(stateWith(strict, ['s1']), 'u', 0).skillId, 's2');
    });
    it('不限连用适用于普通、next 和循环随机节点，但不越过冷却与次数限制；重放一致', () => {
        const skills = [guard('s1', { maxRepeat: 0, maxUses: 6 }), guard('s2')];
        const picks = [{ skill: 's1', weight: 1 }, { skill: 's2', weight: 1 }];
        for (const script of [undefined, { next: { s1: picks } }, { cycle: [picks] }]) {
            const setup = setupWith(foeUnit({ skills, ...(script ? { script } : {}) }));
            const created = createBattle(setup, 7);
            assert.equal(created.ok, true, JSON.stringify(created.error));
            const state = created.state;
            state.history.foe = Array(10).fill('s1');
            assert.equal(chooseSkillIntent(state, 'foe', 0).skillId, 's1');
            state.cooldowns.foe.s1 = 1;
            assert.equal(chooseSkillIntent(state, 'foe', 0).skillId, 's2');
            delete state.cooldowns.foe.s1;
            state.units.foe.res = { skillUses: { s1: 6 } };
            assert.equal(chooseSkillIntent(state, 'foe', 0).skillId, 's2');
            assert.equal(chooseSkillIntent(state, 'foe', 0.999).skillId, 's2');
        }
        const unlimited = [guard('s1', { maxRepeat: 0 }), guard('s2', { cooldown: 1 })];
        const scripts = [undefined, { next: { s1: picks, s2: picks } }, { cycle: [picks] }];
        let observedRun = false;
        for (const script of scripts) {
            const run = runTurns(foeUnit({ skills: unlimited, ...(script ? { script } : {}) }), 24);
            observedRun ||= run.skills.join(',').includes('s1,s1,s1,s1');
            const replayed = replayBattle(run.setup, 7, run.actions);
            assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
            assert.deepEqual(replayed.state, run.state);
            assert.deepEqual(replayed.events, run.events);
        }
        assert.equal(observedRun, true, '实际执行须覆盖四连，不能只验证字段被保存');
    });
});

const statusEffect = (status, stacks = 1, target = 'self') => ({ op: 'apply-status', status, stacks, target });
const openingStatus = (status, stacks = 1) => ({ id: `open-${status}`, name: status, trigger: 'battle-start', effects: [statusEffect(status, stacks)] });
const traitSkill = (effects, intent = 'special') => ({ id: 'trait', name: '特性', intent, effects });
function battleWithTraits(foe, hero = heroUnit(), others = []) {
    const setup = { rulesVersion: 6, controlledId: 'hero', units: [hero, foe, ...others] };
    const battle = createBattle(setup, 7);
    assert.equal(battle.ok, true, JSON.stringify(battle.error));
    return { ...battle, setup };
}
function act(state, action = END_TURN) {
    const snapshot = JSON.stringify(state);
    const result = applyAction(state, action);
    assert.equal(result.ok, true, JSON.stringify(result.error));
    assert.equal(JSON.stringify(state), snapshot, '输入局面不得被修改');
    return result;
}
function playNamed(state, id, targetId = 'foe') {
    const inst = state.piles.hero.hand.find((key) => state.cards[key].cardId === id);
    assert.ok(inst, `手牌缺少 ${id}`);
    return act(state, { type: 'play', inst, targetId });
}
const traitHero = (cards, extra = {}) => ({
    ...heroUnit(), deck: cards.map((card) => card.id), catalog: Object.fromEntries(cards.map((card) => [card.id, card])),
    draw: cards.length, energy: 10, ...extra,
});
const testCard = (id, type, effects) => ({ id, name: id, type, cost: 0, effects });

describe('敌方特性算子', () => {
    it('不行动保留技能出手、没有伤害或格挡', () => {
        const battle = battleWithTraits(foeUnit({ skills: [traitSkill([{ op: 'idle' }])] }));
        const result = act(battle.state);
        assert.equal(result.state.units.hero.hp, 60);
        assert.equal(result.state.units.foe.block, 0);
        assert.equal(result.events.filter((e) => e.type === 'idle' && e.unitId === 'foe').length, 1);
    });
    it('自毁绕过免死和格挡，产生死亡而非离场，不冒充攻击击杀', () => {
        const foe = foeUnit({
            skills: [traitSkill([{ op: 'block', amount: 50 }, { op: 'damage', amount: 5 }, { op: 'self-destruct' }])],
            passives: [{ id: 'protection', name: '防护', trigger: 'battle-start', effects: [{ op: 'status', status: 'endure', stacks: 1 }, statusEffect('buffer')] }],
        });
        const hero = { ...heroUnit(), passives: [{ id: 'kill-growth', name: '击杀成长', trigger: 'kill', effects: [statusEffect('strength', 3)] }] };
        const battle = battleWithTraits(foe, hero, [foeUnit({ id: 'other', skills: [guard('wait')] })]);
        assert.equal(battle.state.units.foe.statuses.endure, 1);
        assert.equal(battle.state.units.foe.statuses.buffer, 1);
        const result = act(battle.state);
        assert.ok(result.events.some((e) => e.type === 'block' && e.target === 'foe' && e.amount === 50));
        assert.equal(result.state.units.foe.statuses.endure, 1);
        assert.equal(result.state.units.foe.statuses.buffer, 1);
        assert.equal(result.state.units.hero.hp, 55);
        assert.equal(result.state.units.foe.hp, 0);
        assert.equal(result.state.units.foe.alive, false);
        assert.equal(result.state.units.foe.left, undefined);
        assert.equal(result.state.units.hero.statuses.strength || 0, 0);
        assert.equal(result.events.filter((e) => e.type === 'defeated' && e.unitId === 'foe').length, 1);
        assert.equal(result.events.some((e) => e.type === 'unit-leave' && e.unitId === 'foe'), false);
    });
    it('爆炸先击倒最后一名对手时仍完成自毁，保留败北结局', () => {
        const foe = foeUnit({ skills: [traitSkill([{ op: 'damage', amount: 99 }, { op: 'self-destruct' }])] });
        const battle = battleWithTraits(foe);
        const result = act(battle.state);
        assert.equal(result.state.outcome, 'defeat');
        assert.equal(result.state.units.foe.alive, false);
        assert.equal(result.state.units.foe.hp, 0);
        assert.deepEqual(result.events.filter((e) => e.type === 'defeated').map((e) => e.unitId), ['hero', 'foe']);
        const replayed = replayBattle(battle.setup, 7, [END_TURN]);
        assert.deepEqual(replayed.state, result.state);
    });
});

describe('敌方回合与出牌特性', () => {
    it('仪式跳过获得后的首次回合末，之后每个自身回合末成长', () => {
        const foe = foeUnit({ skills: [guard('wait'), { ...traitSkill([statusEffect('ritual', 2)]), id: 'chant' }], script: { opener: 'chant', cycle: ['wait'] } });
        const battle = battleWithTraits(foe);
        const first = act(battle.state);
        assert.equal(first.state.units.foe.statuses.ritual, 2);
        assert.equal(first.state.units.foe.statuses.strength || 0, 0);
        const second = act(first.state);
        assert.equal(second.state.units.foe.statuses.strength, 2);
        const third = act(second.state);
        assert.equal(third.state.units.foe.statuses.strength, 4);
        assert.deepEqual(replayBattle(battle.setup, 7, [END_TURN, END_TURN, END_TURN]).state, third.state);
    });
    it('镀甲自身回合开始减层、结束加盾，不因对手回合结束减层', () => {
        const battle = battleWithTraits(foeUnit({ skills: [traitSkill([{ op: 'idle' }])], passives: [openingStatus('plating', 4)] }));
        assert.equal(battle.state.units.foe.statuses.plating, 4);
        const first = act(battle.state);
        assert.equal(first.state.units.foe.statuses.plating, 3);
        assert.equal(first.state.units.foe.block, 3);
        const second = act(first.state);
        assert.equal(second.state.units.foe.statuses.plating, 2);
        assert.equal(second.state.units.foe.block, 2);
    });
    it('金属化自身回合结束加层数格挡，层数不衰减，受未格挡攻击也不减层；重放一致', () => {
        const hit = testCard('hit', 'attack', [{ op: 'damage', amount: 6 }]);
        const battle = battleWithTraits(foeUnit({ skills: [traitSkill([{ op: 'idle' }])], passives: [openingStatus('metallicize', 4)] }), traitHero([hit]));
        assert.equal(battle.state.units.foe.statuses.metallicize, 4);
        const inst = battle.state.piles.hero.hand.find((key) => battle.state.cards[key].cardId === 'hit');
        const struck = playNamed(battle.state, 'hit');
        assert.equal(struck.state.units.foe.hp, 34);
        assert.equal(struck.state.units.foe.statuses.metallicize, 4);
        const first = act(struck.state);
        assert.equal(first.state.units.foe.statuses.metallicize, 4);
        assert.equal(first.state.units.foe.block, 4);
        const second = act(first.state);
        assert.equal(second.state.units.foe.statuses.metallicize, 4);
        assert.equal(second.state.units.foe.block, 4);
        assert.equal(second.events.filter((e) => e.type === 'block' && e.target === 'foe').length, 1);
        assert.deepEqual(replayBattle(battle.setup, 7, [{ type: 'play', inst, targetId: 'foe' }, END_TURN, END_TURN]).state, second.state);
    });
    it('恼怒只响应技能牌，每张一次，不响应攻击或能力牌', () => {
        const cards = [testCard('hit', 'attack', [{ op: 'damage', amount: 1, hits: 2 }]), testCard('guard', 'skill', [{ op: 'block', amount: 1 }]), testCard('power', 'power', [statusEffect('strength')])];
        const battle = battleWithTraits(foeUnit({ skills: [guard('wait')], passives: [openingStatus('rile', 2)] }), traitHero(cards));
        let result = playNamed(battle.state, 'hit');
        assert.equal(result.state.units.foe.statuses.strength || 0, 0);
        result = playNamed(result.state, 'guard', null);
        assert.equal(result.state.units.foe.statuses.strength, 2);
        result = playNamed(result.state, 'power', null);
        assert.equal(result.state.units.foe.statuses.strength, 2);
    });
    it('死咒在死亡钩子触发，易伤可被人工制品抵消，来源不是攻击者', () => {
        for (const artifact of [false, true]) {
            const cards = [testCard('finish', 'attack', [{ op: 'damage', amount: 50 }])];
            const hero = traitHero(cards, { passives: artifact ? [openingStatus('artifact')] : [] });
            const battle = battleWithTraits(foeUnit({ skills: [guard('wait')], passives: [openingStatus('death-curse', 2)] }), hero);
            const result = playNamed(battle.state, 'finish');
            assert.equal(result.state.outcome, 'victory');
            assert.equal(result.state.units.hero.statuses.vulnerable || 0, artifact ? 0 : 2);
            const event = result.events.find((e) => e.status === 'vulnerable' && e.source?.id === 'death-curse');
            assert.equal(event?.source.unitId, 'foe');
            assert.equal(event?.type, artifact ? 'artifact' : 'status');
        }
    });
    it('酥软在整张牌结算后累计临时减攻防，回合末还原且状态保留', () => {
        const cards = [testCard('first', 'attack', [{ op: 'damage', amount: 6, hits: 2 }]), testCard('second', 'attack', [{ op: 'damage', amount: 6 }]), testCard('shield', 'skill', [{ op: 'block', amount: 6 }])];
        const hero = traitHero(cards);
        const battle = battleWithTraits(foeUnit({ maxHp: 100, skills: [traitSkill([{ op: 'idle' }])], passives: [
            { id: 'soften', name: '酥软', trigger: 'battle-start', effects: [statusEffect('tender', 1, 'enemy')] },
        ] }), hero);
        const first = playNamed(battle.state, 'first');
        assert.deepEqual(first.events.filter((e) => e.type === 'damage').map((e) => e.amount), [6, 6]);
        assert.equal(first.state.units.hero.res.tender, 1);
        const second = playNamed(first.state, 'second');
        assert.equal(second.events.find((e) => e.type === 'damage').amount, 5);
        const shield = playNamed(second.state, 'shield', null);
        assert.equal(shield.state.units.hero.block, 4);
        assert.equal(shield.state.units.hero.res.tender, 3);
        const ended = act(shield.state);
        assert.equal(ended.state.units.hero.res?.tender, undefined);
        assert.equal(ended.state.units.hero.statuses.tender, 1);
    });
    it('失重要求攻击前有格挡且整招无失血；护命零失血但无格挡不触发', () => {
        for (const [block, buffer, stunned] of [[15, false, true], [1, false, false], [1, true, true], [0, true, false]]) {
            const cards = [testCard('shield', 'skill', [{ op: 'block', amount: block || 1 }])];
            const hero = traitHero(cards, { passives: buffer ? [openingStatus('buffer')] : [] });
            const battle = battleWithTraits(foeUnit({ skills: [skill('headbutt', { effects: [{ op: 'damage', amount: 15 }] })], passives: [openingStatus('imbalanced')] }), hero);
            const ready = block ? playNamed(battle.state, 'shield', null).state : battle.state;
            const result = act(ready);
            assert.equal(Boolean(result.state.units.foe.statuses.stun), stunned, `block=${block},buffer=${buffer}`);
            const next = act(result.state);
            assert.equal(next.events.some((e) => e.type === 'stunned' && e.unitId === 'foe'), stunned);
        }
    });
    it('失重识别减攻至零的攻击，但零伤害本身不冒充受伤事件', () => {
        for (const block of [0, 1]) {
            const effects = [statusEffect('atk-down', 5, 'enemy'), statusEffect('atk-down', 5, 'enemy'), statusEffect('atk-down', 5, 'enemy')];
            if (block) effects.unshift({ op: 'block', amount: block });
            const hero = traitHero([testCard('weaken', 'skill', effects)]);
            const battle = battleWithTraits(foeUnit({ skills: [skill('headbutt', { effects: [{ op: 'damage', amount: 15 }] })], passives: [openingStatus('imbalanced')] }), hero);
            const weakened = playNamed(battle.state, 'weaken');
            assert.equal(weakened.state.units.foe.statuses['atk-down'], 15);
            assert.equal(weakened.state.units.hero.block, block);
            const result = act(weakened.state);
            assert.equal(result.state.units.hero.hp, 60);
            assert.equal(result.events.some((event) => event.type === 'damage'), false);
            assert.equal(Boolean(result.state.units.foe.statuses.stun), block > 0);
            const replayed = replayBattle(battle.setup, 7, [{ type: 'play', inst: battle.state.piles.hero.hand[0], targetId: 'foe' }, END_TURN]);
            assert.deepEqual(replayed.state, result.state);
        }
    });

    it('回复至按目标生命比例补差，不是额外回复；卸层不出现负层数', () => {
        for (const hp of [10, 30]) {
            const battle = battleWithTraits(foeUnit({ hp, skills: [traitSkill([{ op: 'heal-to', pct: 50 }, { op: 'shed', status: 'thorns', stacks: 5 }])], passives: [{ id: 'spikes', name: '刺', trigger: 'battle-start', effects: [{ op: 'status', status: 'thorns', stacks: 3 }] }] }));
            const result = act(battle.state);
            assert.equal(result.state.units.foe.hp, Math.max(hp, 20));
            assert.equal(result.state.units.foe.statuses.thorns || 0, 0);
            assert.equal(result.events.find((e) => e.type === 'shed')?.amount, 3);
        }
    });
});

describe('技能使用次数', () => {
    it('maxUses 可省略；只接受 1–9，阶段技能与建局同步校验', () => {
        const ok = normalizeProfile(enemyProfile({ skills: [guard('once', { maxUses: 1 }), guard('unlimited'), guard('six', { maxUses: 6 })] }));
        assert.equal(ok.ok, true, JSON.stringify(ok.errors));
        assert.equal(ok.value.skills[0].maxUses, 1);
        assert.equal(Object.hasOwn(ok.value.skills[1], 'maxUses'), false);
        for (const maxUses of [0, 10, 1.5, '1']) {
            const result = normalizeProfile(enemyProfile({ skills: [guard('once', { maxUses }), guard('other')] }));
            assert.equal(result.ok, false);
            assert.equal(createBattle(setupWith(foeUnit({ skills: [guard('once', { maxUses })] })), 7).error?.reason, 'invalid-skill');
            const phased = foeUnit({ phases: [{ afterTurns: 2, addSkills: [guard('late', { maxUses })] }] });
            assert.equal(createBattle(setupWith(phased), 7).error?.reason, 'invalid-skill');
        }
    });
    it('耗尽优先于脚本、绝招、冷却与连用回退；全耗尽时没有意图', () => {
        const once = guard('once', { maxUses: 1, ultimate: true });
        const other = guard('other');
        const unit = { id: 'u', side: 'enemy', alive: true, skills: [once, other], res: { skillUses: { once: 1 } } };
        const state = { units: { u: unit }, cooldowns: { u: { other: 3 } }, history: { u: ['other', 'other'] } };
        assert.equal(chooseSkillIntent(state, 'u', 0).skillId, 'other');
        unit.script = { opener: 'once', cycle: ['once', 'other'] };
        assert.equal(chooseSkillIntent(state, 'u', 0).skillId, 'other');
        unit.skills = [once];
        assert.equal(chooseSkillIntent(state, 'u', 0), null);
    });
    it('实际出招才计次，脚本跳过耗尽步，计数写时复制且重放一致', () => {
        const foe = foeUnit({ skills: [guard('once', { maxUses: 2 }), guard('forever')], script: { opener: 'once', cycle: ['once', 'forever'] } });
        const initial = createBattle(setupWith(foe), 7);
        assert.equal(initial.state.units.foe.res?.skillUses, undefined);
        const run = runTurns(foe, 6);
        assert.deepEqual(run.skills, ['once', 'once', 'forever', 'forever', 'forever', 'forever']);
        assert.deepEqual(run.state.units.foe.res.skillUses, { once: 2 });
        act(run.state);
        const replayed = replayBattle(run.setup, 7, run.actions);
        assert.deepEqual(replayed.state, run.state);
        assert.deepEqual(replayed.events, run.events);
        const exhausted = runTurns(foeUnit({ skills: [guard('only', { maxUses: 1 })], script: { cycle: ['only'] } }), 4);
        assert.deepEqual(exhausted.skills, ['only']);
        assert.equal(exhausted.state.intents.foe, undefined);
        assert.equal(runTurns(foeUnit({ skills: [guard('plain')] }), 2).state.units.foe.res?.skillUses, undefined);
    });
});

describe('模板技能意图', () => {
    it('复合攻击通过档案校验，并保留攻击意图条件语义', () => {
        for (const intent of ['attack', 'attack-debuff', 'attack-defend', 'attack-buff']) {
            const profile = normalizeProfile(enemyProfile({ skills: [skill('s1', { intent }), guard('s2')] }));
            assert.equal(profile.ok, true, JSON.stringify(profile.errors));
            assert.equal(profile.value.skills[0].intent, intent);
            const battle = createBattle(setupWith(foeUnit({ skills: profile.value.skills, script: { opener: 's1' } })), 7);
            assert.equal(battle.ok, true, JSON.stringify(battle.error));
            assert.equal(conditionHolds(battle.state, battle.state.units.hero, { kind: 'target-intent-attack' }, 'foe'), true);
        }
    });
    it('待机意图可归一化和执行，不满足攻击条件，也不造成伤害', () => {
        const profile = normalizeProfile(enemyProfile({ skills: [traitSkill([{ op: 'idle' }], 'idle'), guard('s2')] }));
        assert.equal(profile.ok, true, JSON.stringify(profile.errors));
        const battle = battleWithTraits(foeUnit({ skills: profile.value.skills, script: { cycle: ['trait'] } }));
        assert.equal(conditionHolds(battle.state, battle.state.units.hero, { kind: 'target-intent-attack' }, 'foe'), false);
        const result = act(battle.state);
        assert.equal(result.events.some((event) => event.type === 'idle' && event.unitId === 'foe'), true);
        assert.equal(result.state.units.hero.hp, battle.state.units.hero.hp);
        assert.equal(result.events.some((event) => event.type === 'damage'), false);
        assert.deepEqual(replayBattle(battle.setup, 7, [END_TURN]).state, result.state);
    });
});

// 数据层夹具不进入正式目录；条目只登记原版模型。
const dataEnemy = (no, hp = 40, damage = 12, flags = {}, status = 'release') => enemy(
    'sts1', 'fixture', no, `验证敌人${no}`, 'normal', status,
    { skills: [skill('strike', { effects: [{ op: 'damage', amount: damage }] })], script: cycle(['strike']) },
    { hp, ...flags },
);

describe('段数上限与连击成长', () => {
    const templated = (skills) => enemyProfile({ skills, template: { enemyId: 'en-x', model: 'original' } });
    const hitSkill = (hits) => skill('multi', { effects: [{ op: 'damage', amount: 1, hits }] });
    const volley = (fields) => skill('v', { effects: [{ op: 'foe-volley', amount: 1, source: 'uses', ...fields }] });
    const HITS = 'skills[0].effects[0].hits:out-of-range';
    it('只有模板敌人档案放宽到12段，生成敌人仍限5段', () => {
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ skills: [hitSkill(6), skill('s2')] }))), [HITS]);
        assert.equal(normalizeProfile(templated([hitSkill(12)])).ok, true);
        assert.deepEqual(reasons(normalizeProfile(templated([hitSkill(13)]))), [HITS]);
        assert.equal(normalizeProfile(templated([volley({ hits: 12 })])).ok, true);
        assert.deepEqual(reasons(normalizeProfile(templated([volley({ hits: 13 })]))), [HITS]);
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ skills: [volley({ hits: 6 }), skill('s2')] }))), [HITS]);
        assert.deepEqual(reasons(normalizeProfile(templated([volley({ source: 'hp' })]))), ['skills[0].effects[0].source:invalid-enum']);
        assert.deepEqual(normalizeProfile(templated([volley({ hits: 3 })])).value.skills[0].effects[0],
            { op: 'foe-volley', amount: 1, hits: 3, per: 1, every: 1, source: 'uses', track: 'volley', target: 'enemy' });
    });
    const volleyFoe = (fields) => foeUnit({ skills: [{ id: 'v', name: 'v', intent: 'attack', effects: [{ op: 'foe-volley', amount: 1, hits: 2, per: 1, every: 1, source: 'uses', track: 'volley', target: 'enemy', ...fields }] }] });
    const foeHits = (events) => events.filter((e) => e.type === 'damage' && e.source?.unitId === 'foe' && e.target === 'hero').length;
    function runVolley(foe, turns) {
        const battle = battleWithTraits(foe);
        let state = battle.state;
        const seen = [];
        const shown = [];
        const actions = [];
        for (let i = 0; i < turns; i += 1) {
            const intent = describeIntent(state, 'foe');
            shown.push(intent.damage);
            assert.equal(intent.attacks.length, 1);
            assert.deepEqual(intent.attacks[0], { damage: 1, hits: intent.damage, target: 'enemy' });
            const result = act(state);
            seen.push(foeHits(result.events));
            state = result.state;
            actions.push(END_TURN);
        }
        assert.deepEqual(replayBattle(battle.setup, 7, actions).state, state);
        return { state, seen, shown };
    }
    it('按使用次数逐次加段，意图预估同步，计数重放一致', () => {
        const run = runVolley(volleyFoe({}), 3);
        assert.deepEqual(run.seen, [2, 3, 4]);
        assert.deepEqual(run.shown, [2, 3, 4]);
        assert.equal(run.state.units.hero.hp, 51);
        assert.deepEqual(run.state.units.foe.res.volleys, { volley: 3 });
    });
    it('按回合加段：每两回合多一段，不写使用计数', () => {
        const run = runVolley(volleyFoe({ hits: 1, every: 2, source: 'turn' }), 4);
        assert.deepEqual(run.seen, [1, 1, 2, 2]);
        assert.deepEqual(run.shown, [1, 1, 2, 2]);
        assert.equal(run.state.units.foe.res?.volleys, undefined);
    });
    it('多段逐段结算：虚弱把每段1点降为0，不合并整招再取整', () => {
        const eight = foeUnit({ skills: [{ id: 'hounds', name: 'h', intent: 'attack', effects: [{ op: 'damage', amount: 1, hits: 8 }] }] });
        assert.equal(act(battleWithTraits(eight).state).state.units.hero.hp, 52);
        const weak = { ...eight, passives: [{ id: 'w', name: 'w', trigger: 'battle-start', effects: [{ op: 'status', status: 'weak', stacks: 2, target: 'self' }] }] };
        assert.equal(act(battleWithTraits(weak).state).state.units.hero.hp, 60);
    });
    it('翱翔使受到的攻击伤害减半，卸下后恢复', () => {
        const hero = traitHero([testCard('hit', 'attack', [{ op: 'damage', amount: 10 }])]);
        assert.equal(playNamed(battleWithTraits(foeUnit({ skills: [guard('wait')] }), hero).state, 'hit').state.units.foe.hp, 30);
        const soared = battleWithTraits(foeUnit({ skills: [guard('wait')], passives: [openingStatus('soar')] }), hero);
        assert.equal(soared.state.units.foe.statuses.soar, 1);
        assert.equal(playNamed(soared.state, 'hit').state.units.foe.hp, 35);
        const landing = foeUnit({ skills: [{ ...traitSkill([{ op: 'shed', status: 'soar', stacks: 1 }]), id: 'land' }], passives: [openingStatus('soar')] });
        const landed = act(battleWithTraits(landing, hero).state);
        assert.equal(landed.state.units.foe.statuses.soar || 0, 0);
        assert.equal(playNamed(landed.state, 'hit').state.units.foe.hp, 30);
    });
});

describe('条件选招脚本', () => {
    const pick = (skill, weight) => ({ skill, weight });
    it('首招二选一、循环与转移表二选一，权重与引用逐项校验', () => {
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ script: { opener: 's1', openers: [pick('s2', 1)] } }))), ['script.openers:script-conflict']);
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ script: { cycle: ['s1'], next: { s1: [pick('s2', 1)] } } }))), ['script.next:script-conflict']);
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ script: { openers: [pick('s1', 0)] } }))), ['script.openers[0].weight:out-of-range']);
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ script: { next: { s1: [pick('zz', 1)] } } }))), ['script.next.s1[0].skill:unknown-skill']);
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ script: { next: { zz: [pick('s1', 1)] } } }))), ['script.next.zz:unknown-skill']);
        const ok = normalizeProfile(enemyProfile({ script: { openers: [pick('s1', 2), pick('s2', 1)], next: { s1: [pick('s2', 1)], s2: [pick('s1', 1)] } } }));
        assert.equal(ok.ok, true, JSON.stringify(ok.errors));
        assert.equal(createBattle(setupWith(foeUnit({ script: { opener: 's1', openers: [pick('s2', 1)] } })), 7).error?.reason, 'invalid-script');
        assert.equal(createBattle(setupWith(foeUnit({ script: { next: { s1: [pick('s9', 1)] } } })), 7).error?.reason, 'invalid-script');
    });
    const stateWith = (script, history, opened = true) => ({
        units: { u: { id: 'u', side: 'enemy', alive: true, skills: [guard('a'), guard('b'), guard('c')], script } },
        history: { u: history }, cooldowns: {}, scripts: { u: { opened, step: 0 } },
    });
    it('首招池按权重抽一次，转移表按上一招取行并滤掉连用达到上限的候选', () => {
        const openers = { openers: [pick('a', 1), pick('b', 3)] };
        assert.equal(chooseSkillIntent(stateWith(openers, [], false), 'u', 0.1).skillId, 'a');
        assert.equal(chooseSkillIntent(stateWith(openers, [], false), 'u', 0.9).skillId, 'b');
        const next = { next: { a: [pick('b', 1), pick('c', 3)], c: [pick('c', 1), pick('a', 1)] } };
        assert.equal(chooseSkillIntent(stateWith(next, ['a']), 'u', 0).skillId, 'b');
        assert.equal(chooseSkillIntent(stateWith(next, ['a']), 'u', 0.5).skillId, 'c');
        assert.equal(chooseSkillIntent(stateWith(next, ['c']), 'u', 0).skillId, 'c');
        assert.equal(chooseSkillIntent(stateWith(next, ['c', 'c']), 'u', 0).skillId, 'a');
    });
    it('裂颚虫首招撕咬，之后每一步都在上一招的转移行内，翻滚不连用三次，重放一致', () => {
        const item = ENEMIES.find((entry) => entry.sourceKey === 'Jaw Worm（第一幕）');
        const rows = item.original.script.next;
        const profile = materializeEnemy(item, 'original');
        const run = runTurns(foeUnit({ maxHp: profile.base.hp, skills: profile.skills, script: profile.script }), 8);
        assert.ok(run.skills.length >= 4);
        assert.equal(run.skills[0], 'chomp');
        for (let i = 1; i < run.skills.length; i += 1) assert.ok(rows[run.skills[i - 1]].some((row) => row.skill === run.skills[i]), run.skills.join());
        assert.ok(!run.skills.join().includes('thrash,thrash,thrash'));
        const replay = replayBattle(run.setup, 7, run.actions);
        assert.deepEqual(replay.state, run.state);
        assert.deepEqual(replay.events, run.events);
    });
    it('浮孢菌首招不出蚀弱孢，之后同招不连续两回合，重放一致', () => {
        const item = ENEMIES.find((entry) => entry.sourceKey === 'Flyconid');
        const profile = materializeEnemy(item, 'original');
        const run = runTurns(foeUnit({ maxHp: profile.base.hp, skills: profile.skills, script: profile.script }), 8);
        assert.ok(run.skills.length >= 4);
        assert.ok(['frail', 'smash'].includes(run.skills[0]));
        for (let i = 1; i < run.skills.length; i += 1) assert.notEqual(run.skills[i], run.skills[i - 1], run.skills.join());
        assert.deepEqual(replayBattle(run.setup, 7, run.actions).state, run.state);
    });
    it('循环中的随机节点每轮按权重抽一个，固定步照常推进，重放一致', () => {
        const bad = normalizeProfile(enemyProfile({ script: { cycle: ['s1', [pick('s2', 0)]] } }));
        assert.deepEqual(reasons(bad), ['script.cycle[1][0].weight:out-of-range']);
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ script: { cycle: ['s1', [pick('zz', 1)]] } }))), ['script.cycle[1][0].skill:unknown-skill']);
        assert.equal(createBattle(setupWith(foeUnit({ script: { cycle: ['s1', [pick('s9', 1)]] } })), 7).error?.reason, 'invalid-script');
        const foe = foeUnit({ skills: ['a', 'b', 'c'].map((id) => guard(id)), script: { cycle: ['a', [pick('b', 1), pick('c', 1)]] } });
        const run = runTurns(foe, 10);
        assert.ok(run.skills.length >= 8);
        run.skills.forEach((id, i) => assert.ok(i % 2 === 0 ? id === 'a' : ['b', 'c'].includes(id), run.skills.join()));
        assert.deepEqual(replayBattle(run.setup, 7, run.actions).state, run.state);
    });
    it('循环中的条件步只在规划到该步且条件成立时出手，否则跳到下一步；次数耗尽同样跳过', () => {
        const low = { kind: 'self-hp-below', value: 50 };
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ script: { cycle: ['s1', { skill: 's2', when: { kind: 'nope' } }] } }))),
            ['script.cycle[1].when.kind:invalid-enum']);
        assert.deepEqual(reasons(normalizeProfile(enemyProfile({ script: { cycle: ['s1', { skill: 'zz', when: low }] } }))), ['script.cycle[1].skill:unknown-skill']);
        assert.equal(createBattle(setupWith(foeUnit({ script: { cycle: ['s1', { skill: 's2' }] } })), 7).error?.reason, 'invalid-script');
        const make = (hp) => foeUnit({ hp, skills: [guard('a'), guard('b'), guard('c', { maxUses: 1 })], script: { cycle: ['a', { skill: 'c', when: low }, 'b'] } });
        assert.deepEqual(runTurns(make(40), 6).skills, ['a', 'b', 'a', 'b', 'a', 'b']);
        const hurt = runTurns(make(10), 6);
        assert.deepEqual(hurt.skills, ['a', 'c', 'b', 'a', 'b', 'a']);
        assert.deepEqual(replayBattle(hurt.setup, 7, hurt.actions).state, hurt.state);
    });
    it('蛙骑士只在检查点且生命低于一半时冲锋一次，满血时跳过检查点，重放一致', () => {
        const item = ENEMIES.find((entry) => entry.sourceKey === 'Frog Knight');
        const profile = materializeEnemy(item, 'original');
        const make = (extra = {}) => foeUnit({ maxHp: profile.base.hp, skills: profile.skills, script: profile.script, passives: profile.passives, ...extra });
        assert.deepEqual(runTurns(make(), 6).skills, ['lash', 'smite', 'queen', 'lash', 'smite', 'queen']);
        const hurt = runTurns(make({ hp: Math.floor(profile.base.hp / 3) }), 6);
        assert.deepEqual(hurt.skills, ['lash', 'smite', 'queen', 'charge', 'lash', 'smite']);
        assert.deepEqual(replayBattle(hurt.setup, 7, hurt.actions).state, hurt.state);
    });
});

describe('敌人模板数据层', () => {
    it('参考值取正式可用条目的HP中点及最大单招中位数，隔离非发布来源', () => {
        const entries = [dataEnemy(1, [10, 30], 6), dataEnemy(2, 40, 12), dataEnemy(3, 80, 24),
            dataEnemy(4, 999, 99, {}, 'pending'), dataEnemy(5, 999, 99, {}, 'beta'),
            dataEnemy(6, 999, 99, {}, 'deprecated'), dataEnemy(7, 999, 99, { excluded: '不可表达' })];
        assert.deepEqual(enemyReferences(entries), { 'sts1|normal': { hp: 40, damage: 12 } });
        const library = prepareEnemyEntries(entries);
        assert.equal(library.entries.length, 7);
        assert.deepEqual(enemyCandidates({ tier: 'normal' }, library.entries).map((e) => e.id), entries.slice(0, 3).map((e) => e.id));
        assert.equal(enemyCandidates({ tier: 'boss' }, library.entries).length, 0);
        assert.equal(drawEnemy({ seed: 'empty', tier: 'boss' }, library.entries), null);
        for (const item of library.entries.slice(3)) {
            assert.equal(resolveEnemy(item.id, 'original', library.entries), null);
            assert.equal(item.scale, undefined);
        }
    });
    it('原版模型按整敌伤害系数换算，保留段数、脚本、状态和阶段结构', () => {
        const original = { skills: [skill('strike', { effects: [{ op: 'damage', amount: 20, hits: 3 }, { op: 'block', amount: 10 }, { op: 'status', status: 'strength', stacks: 2 }] })], script: cycle(['strike']) };
        const item = enemy('sts1', 'fixture', 8, '连击验证', 'normal', 'release', original, { hp: 40 });
        const prepared = prepareEnemyEntries([item]).entries[0];
        assert.equal(prepared.scale.damage, 0.2);
        for (const key of ['original']) {
            const profile = materializeEnemy(prepared, key);
            assert.equal(profile.skills[0].effects[0].hits, 3);
            assert.equal(profile.skills[0].effects[0].amount, 4);
            assert.deepEqual(profile.script, cycle(['strike']));
            assert.deepEqual(normalizeProfile(profile).value, profile);
        }
        assert.equal(materializeEnemy(prepared, 'original').skills[0].effects[2].stacks, 2);
    });
    it('阶段技能参与换算及命名，物化结果独立且不改只读条目', () => {
        const original = {
            skills: [skill('first')], script: cycle(['first']),
            phases: [{ afterTurns: 2, removeSkills: ['first'], addSkills: [skill('later', { effects: [{ op: 'damage', amount: 20 }, { op: 'block', amount: 10 }] })], script: cycle(['later']) }],
        };
        const raw = enemy('sts1', 'fixture', 9, '阶段验证', 'normal', 'release', original, { hp: 80 });
        const snapshot = JSON.stringify(raw);
        const item = prepareEnemyEntries([raw]).entries[0];
        for (const model of ['original']) {
            const profile = materializeEnemy(item, model, { id: 'foe-stage', names: ['  起手改名  ', '后招改名'] });
            assert.equal(profile.id, 'foe-stage');
            assert.equal(profile.skills[0].name, '起手改名');
            assert.equal(profile.phases[0].addSkills[0].name, '后招改名');
            assert.equal(profile.phases[0].afterTurns, 2);
            assert.equal(profile.phases[0].addSkills[0].effects[0].amount, 12);
            assert.equal(profile.base.hp, 40);
            assert.equal(item.scale.block, 0.5);
            const fallback = materializeEnemy(item, model, { names: ['', '字'.repeat(21)] });
            assert.equal(fallback.skills[0].name, item[model].skills[0].name);
            assert.equal(fallback.phases[0].addSkills[0].name, item[model].phases[0].addSkills[0].name);
            profile.skills[0].effects[0].amount = 99;
            assert.notEqual(materializeEnemy(item, model).skills[0].effects[0].amount, 99);
        }
        assert.equal(JSON.stringify(raw), snapshot);
        assert.equal(Object.isFrozen(item.original.skills[0].effects), true);
    });
    it('重复身份、来源数值缺失、空模型及未知模型明确拒收', () => {
        const item = dataEnemy(10);
        assert.throws(() => prepareEnemyEntries([item, item]), /enemy-duplicate/);
        assert.throws(() => prepareEnemyEntries([dataEnemy(11, null)]), /enemy-source-hp/);
        assert.throws(() => prepareEnemyEntries([{ ...item, original: { skills: [] } }]), /enemy-model/);
        assert.equal(materializeEnemy(item, 'unknown'), null);
        assert.equal(materializeEnemy(prepareEnemyEntries([item]).entries[0], 'split'), null);
    });
    it('条目按种子确定，还原不重抽且排除列表有效', () => {
        const { entries } = prepareEnemyEntries([dataEnemy(12), dataEnemy(13), dataEnemy(14)]);
        const picked = new Set();
        for (let i = 0; i < 256; i += 1) {
            const seed = `data-fixture|${i}`;
            const profile = drawEnemy({ seed, tier: 'normal' }, entries);
            assert.deepEqual(drawEnemy({ seed, tier: 'normal' }, entries), profile);
            assert.equal(profile.template.model, 'original');
            assert.deepEqual(resolveEnemy(profile.template.enemyId, profile.template.model, entries), profile);
            assert.equal(normalizeProfile(profile).ok, true);
            picked.add(profile.template.enemyId);
        }
        assert.equal(picked.size, 3);
        const exclude = entries.slice(0, 2).map((entry) => entry.id);
        assert.equal(drawEnemy({ seed: 'only-one', tier: 'normal', exclude }, entries).template.enemyId, entries[2].id);
        assert.equal(drawEnemy({ seed: 'none', tier: 'normal', exclude: entries.map((e) => e.id) }, entries), null);
        assert.equal(resolveEnemy('missing', 'original', entries), null);
        assert.equal(resolveEnemy(entries[0].id, 'invalid', entries), null);
    });

    it('非发布条目即使保留换算字段，也不能直接物化或还原', () => {
        const ready = prepareEnemyEntries([dataEnemy(15)]).entries[0];
        for (const status of ['pending', 'beta', 'deprecated']) {
            const item = { ...ready, status };
            for (const model of ['original']) {
                assert.equal(materializeEnemy(item, model), null);
                assert.equal(resolveEnemy(item.id, model, [item]), null);
            }
            assert.deepEqual(enemyCandidates({}, [item]), []);
        }
        assert.equal(materializeEnemy({ ...ready, excluded: '不能保真' }, 'original'), null);
    });
    it('六个来源档位分别取参考值，生命上下限夹取不改变行动结构', () => {
        const entries = [];
        for (const source of ['sts1', 'sts2']) {
            for (const tier of ['normal', 'elite', 'boss']) {
                entries.push(...[1, 100, 10000].map((hp, index) => ({
                    ...dataEnemy(index + 20, hp), id: `en-${source}-${tier}-${index}`, source, tier,
                })));
            }
        }
        const library = prepareEnemyEntries(entries);
        assert.equal(Object.keys(library.references).length, 6);
        for (const source of ['sts1', 'sts2']) {
            for (const [tier, hp] of [['normal', 40], ['elite', 80], ['boss', 160]]) {
                assert.deepEqual(library.references[`${source}|${tier}`], { hp: 100, damage: 12 });
                const group = library.entries.filter((item) => item.source === source && item.tier === tier);
                assert.deepEqual(group.map((item) => item.scale.hp), [hp / 2, hp, hp * 1.5]);
                for (const item of group) {
                    for (const model of ['original']) {
                        const profile = materializeEnemy(item, model);
                        assert.deepEqual(profile.script, cycle(['strike']));
                        assert.equal(normalizeProfile(profile).ok, true);
                    }
                }
            }
        }
    });
    it('每段至少一点仍超过档位上限时拒收，不删除效果或攻击段', () => {
        const original = { skills: [skill('strike', { effects: Array.from({ length: 3 }, () => ({ op: 'damage', amount: 1, hits: 5 })) })] };
        const raw = { ...dataEnemy(30), original };
        const snapshot = JSON.stringify(raw);
        assert.throws(() => prepareEnemyEntries([raw]), /enemy-damage-floor/);
        assert.equal(JSON.stringify(raw), snapshot);
    });

});

describe('正式敌人条目', () => {
    const firstBatch = [
        ['Spike Slime (S)', [10, 14], [[5, null, 0, 1]], 'tackle'],
        ['Fat Gremlin', [13, 17], [[4, 'weak', 1, 1]], 'smash'],
        ['Sneaky Gremlin', [10, 14], [[9, null, 0, 1]], 'puncture'],
        ['Blue Slaver', [46, 50], [[12, null, 0, 3], [7, 'weak', 1, 2]], null],
    ];
    it('第一幕首批保留来源区间、基础效果、权重及可追溯来源', () => {
        const batch = [];
        for (const [key, hp, moves] of firstBatch) {
            const raw = STS1_ACT1.find((item) => item.sourceKey === key);
            assert.ok(raw, key);
            batch.push(raw);
            assert.deepEqual(raw.hp, hp);
            assert.ok(raw.evidence.length > 0);
            assert.ok(raw.notes.length > 0);
            assert.equal(raw.status, 'release');
            assert.deepEqual(raw.original.skills.map((s) => [
                s.effects[0].amount, s.effects[1]?.status ?? null,
                s.effects[1]?.stacks ?? 0, s.weight,
            ]), moves);
        }
        assert.deepEqual(enemyReferences(batch), { 'sts1|normal': { hp: 13.5, damage: 7 } });
        assert.deepEqual(SOURCE_TIER_REF, enemyReferences(ENEMIES));
    });
    it('正式可抽条目的原版模型均能物化并通过档案校验', () => {
        for (const item of ENEMIES.filter((e) => e.status === 'release' && !e.excluded)) {
            for (const model of ['original']) {
                const profile = materializeEnemy(item, model);
                assert.equal(normalizeProfile(profile).ok, true, `${item.id}:${model}`);
                assert.deepEqual(profile.template, { enemyId: item.id, model });
            }
        }
        assert.equal(materializeEnemy(ENEMIES.find((e) => e.sourceKey === 'Blue Slaver'), 'split'), null);
    });
    it('首批单招循环实际执行四回合且重放一致，不因模板默认冷却停招', () => {
        for (const [key, , , skillId] of firstBatch.filter((e) => e[3])) {
            const item = ENEMIES.find((e) => e.sourceKey === key);
            for (const model of ['original']) {
                const profile = materializeEnemy(item, model);
                const run = runTurns(foeUnit({ maxHp: profile.base.hp, skills: profile.skills, script: profile.script }), 4);
                assert.deepEqual(run.skills, Array(4).fill(skillId), `${key}:${model}`);
                const replay = replayBattle(run.setup, 7, run.actions);
                assert.equal(replay.ok, true);
                assert.deepEqual(replay.state, run.state);
                assert.deepEqual(replay.events, run.events);
            }
        }
    });
    it('蓝衣役使者按3:2选招并严格排除第三次连用', () => {
        const item = ENEMIES.find((e) => e.sourceKey === 'Blue Slaver');
        for (const model of ['original']) {
            const profile = materializeEnemy(item, model);
            const created = createBattle(setupWith(foeUnit({ skills: profile.skills })), 7);
            assert.equal(created.ok, true, JSON.stringify(created.error));
            const state = (history = []) => ({ ...created.state, history: { foe: history } });
            assert.deepEqual(chooseSkillIntent(state(), 'foe', 0.59), { skillId: 'stab', targetId: 'hero' });
            assert.deepEqual(chooseSkillIntent(state(), 'foe', 0.61), { skillId: 'rake', targetId: 'hero' });
            assert.equal(chooseSkillIntent(state(['stab', 'stab']), 'foe', 0).skillId, 'rake');
            assert.equal(chooseSkillIntent(state(['rake', 'rake']), 'foe', 0.99).skillId, 'stab');
        }
    });
    it('第一幕26个来源键逐一对账，待证与排除记录不能物化或入池', () => {
        const keys = ['Cultist', 'Jaw Worm（第一幕）', 'Red Louse', 'Green Louse', 'Fungi Beast',
            'Spike Slime (L)', 'Spike Slime (M)', 'Spike Slime (S)', 'Acid Slime (L)', 'Acid Slime (M)',
            'Acid Slime (S)', 'Fat Gremlin', 'Mad Gremlin', 'Shield Gremlin', 'Sneaky Gremlin',
            'Gremlin Wizard', 'Blue Slaver', 'Red Slaver', 'Looter', 'Mugger', 'Gremlin Nob',
            'Lagavulin', 'Sentry', 'Slime Boss', 'The Guardian', 'Hexaghost'];
        assert.deepEqual(STS1_ACT1.map((item) => item.sourceKey), keys);
        const pending = STS1_ACT1.filter((item) => item.status === 'pending');
        assert.deepEqual(pending.map((item) => item.sourceKey), ['Cultist', 'Red Louse', 'Green Louse', 'Acid Slime (S)', 'Mad Gremlin']);
        assert.equal(STS1_ACT1.filter((item) => item.excluded).length, 6);
        const ready = enemyCandidates({}, ENEMIES.filter((item) => item.group === 'act1' && item.source === 'sts1'));
        assert.deepEqual(ready.map((item) => item.sourceKey), ['Jaw Worm（第一幕）', 'Fungi Beast', 'Spike Slime (M)', 'Spike Slime (S)', 'Acid Slime (M)',
            'Fat Gremlin', 'Sneaky Gremlin', 'Gremlin Wizard', 'Blue Slaver', 'Looter', 'Mugger', 'Gremlin Nob', 'Lagavulin', 'Sentry', 'The Guardian']);
        for (const raw of STS1_ACT1.filter((item) => item.status !== 'release' || item.excluded)) {
            const item = ENEMIES.find((entry) => entry.id === raw.id);
            assert.ok(item.notes[0] && item.evidence.length >= 2, item.id);
            assert.equal(item.scale, undefined);
            assert.equal(item.original, null);
            for (const model of ['original']) {
                assert.equal(materializeEnemy(item, model), null);
                assert.equal(resolveEnemy(item.id, model), null);
            }
        }
        const act1 = ENEMIES.filter((item) => item.group === 'act1' && item.source === 'sts1');
        assert.deepEqual(enemyCandidates({ tier: 'elite' }, act1).map((item) => item.sourceKey), ['Gremlin Nob', 'Lagavulin', 'Sentry']);
        assert.deepEqual(enemyCandidates({ tier: 'boss' }, act1).map((item) => item.sourceKey), ['The Guardian']);
    });

    it('第二幕16个来源逐一对账，封垒浮卫、甲壳寄生兽与鞭策监工入池', () => {
        const keys = ['Byrd', 'Chosen', 'Spheric Guardian', 'Shelled Parasite', 'Centurion', 'Mystic',
            'Snake Plant', 'Snecko', 'Book of Stabbing', 'Gremlin Leader', 'Taskmaster',
            'The Champ', 'The Collector', 'Torch Head', 'Bronze Automaton', 'Bronze Orb'];
        assert.deepEqual(STS1_ACT2.map((item) => item.sourceKey), keys);
        assert.deepEqual(STS1_ACT2.filter((item) => item.status === 'pending').map((item) => item.sourceKey), ['Snake Plant', 'Snecko']);
        assert.equal(STS1_ACT2.filter((item) => item.excluded).length, 11);
        assert.deepEqual(enemyReferences(STS1_ACT2), { 'sts1|normal': { hp: 45, damage: 19 }, 'sts1|elite': { hp: 57, damage: 7 } });
        const entries = ENEMIES.filter((item) => item.source === 'sts1' && item.group === 'act2');
        assert.equal(entries.length, 16);
        assert.deepEqual(enemyCandidates({}, entries).map((item) => item.sourceKey), ['Spheric Guardian', 'Shelled Parasite', 'Taskmaster']);
        for (const item of entries.filter((entry) => entry.status !== 'release' || entry.excluded)) {
            assert.ok(item.notes[0] && item.evidence.length === 2, item.id);
            assert.equal(item.original, null);
            assert.equal(item.scale, undefined);
            for (const model of ['original']) assert.equal(resolveEnemy(item.id, model), null);
        }
        assert.equal(drawEnemy({ seed: 'act2-empty', tier: 'boss' }, entries), null);
    });

    it('Shelled Parasite 原始数值、首招池与常规权重保留；会话选招及重放一致', () => {
        const raw = STS1_ACT2.find((item) => item.sourceKey === 'Shelled Parasite');
        assert.deepEqual(raw.hp, [68, 72]);
        assert.deepEqual(raw.original.skills.map((s) => [s.id, s.weight, s.maxRepeat, s.maxUses]),
            [['double', 2, 2, undefined], ['suck', 2, 2, undefined], ['fell', 1, 1, undefined], ['down', 1, 2, 1]]);
        assert.deepEqual(raw.original.skills.map((s) => s.effects), [
            [{ op: 'damage', amount: 6, hits: 2, target: 'enemy' }],
            [{ op: 'drain', amount: 10, hits: 1, target: 'enemy' }],
            [{ op: 'damage', amount: 18, hits: 1, target: 'enemy' }, { op: 'status', status: 'frail', stacks: 2, target: 'enemy' }],
            [{ op: 'idle' }],
        ]);
        const entry = ENEMIES.find((item) => item.id === raw.id);
        const profile = materializeEnemy(entry, 'original', { id: 'foe' });
        const [unit] = enemyUnits({ enemies: [{ name: profile.name, count: 1 }] }, new Map([[profile.name, profile]]), 1, 'normal').units;
        for (let seed = 0; seed < 8; seed += 1) {
            const setup = { ...setupWith(unit), rulesVersion: 6 };
            setup.units[0].maxHp = 9999;
            const battle = createBattle(setup, seed);
            assert.equal(battle.ok, true, JSON.stringify(battle.error));
            assert.equal(battle.state.units.foe.statuses.plated, 14);
            assert.equal(chooseSkillIntent(battle.state, 'foe', 0).skillId, 'double');
            assert.equal(chooseSkillIntent(battle.state, 'foe', 0.5).skillId, 'suck');
            let state = battle.state;
            const events = [...battle.events];
            const actions = [];
            let moves = 0;
            for (let turn = 0; turn < 32 && moves < 16; turn += 1) {
                const result = act(state);
                state = result.state;
                events.push(...result.events);
                actions.push(END_TURN);
                const used = result.events.filter((e) => e.type === 'skill' && e.unitId === 'foe');
                if (moves === 0 && used.length) {
                    assert.equal(chooseSkillIntent(state, 'foe', 0).skillId, 'double');
                    assert.equal(chooseSkillIntent(state, 'foe', 0.5).skillId, 'suck');
                    assert.equal(chooseSkillIntent(state, 'foe', 0.9).skillId, 'fell');
                }
                moves += used.length;
            }
            const used = events.filter((e) => e.type === 'skill' && e.unitId === 'foe').map((e) => e.skillId);
            assert.equal(used.length, 16);
            assert.ok(['double', 'suck'].includes(used[0]));
            used.forEach((id, i) => {
                assert.ok(['double', 'suck', 'fell'].includes(id));
                if (id === 'fell') assert.notEqual(used[i - 1], id, used.join());
                else if (i >= 2) assert.ok(used[i - 1] !== id || used[i - 2] !== id, used.join());
            });
            const replayed = replayBattle(setup, seed, actions);
            assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
            assert.deepEqual(replayed.state, state);
            assert.deepEqual(replayed.events, events);
        }
    });

    it('Shelled Parasite 甲层14逐段耗尽后立即停顿一次，跳过首招池进入常规选招；重放一致', () => {
        const profile = materializeEnemy(ENEMIES.find((item) => item.sourceKey === 'Shelled Parasite'), 'original', { id: 'foe' });
        const [unit] = enemyUnits({ enemies: [{ name: profile.name, count: 1 }] }, new Map([[profile.name, profile]]), 1, 'normal').units;
        const five = testCard('five', 'attack', [{ op: 'damage', amount: 1, hits: 5 }]);
        const four = testCard('four', 'attack', [{ op: 'damage', amount: 1, hits: 4 }]);
        const battle = battleWithTraits(unit, traitHero([five, five, four, five, four], { maxHp: 999 }));
        let state = battle.state;
        const events = [...battle.events];
        const actions = [];
        const step = (action) => {
            const result = act(state, action);
            state = result.state;
            events.push(...result.events);
            actions.push(action);
            return result;
        };
        for (const [cardId, left] of [['five', 9], ['five', 4], ['four', 0]]) {
            step({ type: 'play', inst: state.piles.hero.hand.find((id) => state.cards[id].cardId === cardId), targetId: 'foe' });
            assert.equal(state.units.foe.statuses.plated || 0, left);
        }
        assert.equal(state.intents.foe.skillId, 'down');
        assert.deepEqual(describeIntent(state, 'foe').kinds, ['stun']);
        assert.deepEqual(describeIntent(state, 'foe').attacks, []);
        assert.deepEqual(state.units.foe.res.interruptFired, { 0: 1 });
        let paused = false;
        for (let turn = 0; turn < 4 && !paused; turn += 1) {
            const result = step(END_TURN);
            paused = result.events.some((e) => e.type === 'skill' && e.unitId === 'foe' && e.skillId === 'down');
        }
        assert.equal(paused, true);
        assert.equal(state.scripts.foe.opened, true);
        assert.equal(chooseSkillIntent(state, 'foe', 0.99).skillId, 'fell');
        assert.equal(state.units.foe.res?.interrupt, undefined);
        for (let turn = 0; turn < 8; turn += 1) step(END_TURN);
        const used = events.filter((e) => e.type === 'skill' && e.unitId === 'foe').map((e) => e.skillId);
        assert.equal(used.filter((id) => id === 'down').length, 1);
        assert.ok(used.length >= 5);
        assert.equal(state.units.foe.res.skillUses.down, 1);
        const replayed = replayBattle(battle.setup, 7, actions);
        assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
        assert.deepEqual(replayed.state, state);
        assert.deepEqual(replayed.events, events);
    });

    it('甲层完全格挡不减、未格挡攻击逐段减层，回合末格挡不吃敏捷与脆弱；重放一致', () => {
        const hit = testCard('chip', 'attack', [{ op: 'damage', amount: 5 }]);
        const foe = foeUnit({ maxHp: 99, skills: [guard('wait')], passives: [
            { id: 'wall', name: '壁', trigger: 'battle-start', effects: [{ op: 'block', amount: 5, target: 'self' }] },
            { id: 'dex', name: '敏捷', trigger: 'battle-start', effects: [{ op: 'status', status: 'dexterity', stacks: 5, target: 'self' }] },
            { id: 'frail', name: '脆弱', trigger: 'battle-start', effects: [{ op: 'status', status: 'frail', stacks: 2, target: 'self' }] },
            openingStatus('plated', 14),
        ] });
        const battle = battleWithTraits(foe, traitHero(Array(5).fill(hit)));
        const firstInst = battle.state.piles.hero.hand[0];
        const first = act(battle.state, { type: 'play', inst: firstInst, targetId: 'foe' });
        assert.equal(first.state.units.foe.statuses.plated, 14);
        assert.ok(first.events.some((e) => e.type === 'damage' && e.blocked === 5 && e.hpLoss === 0));
        const secondInst = first.state.piles.hero.hand[0];
        const second = act(first.state, { type: 'play', inst: secondInst, targetId: 'foe' });
        assert.equal(second.state.units.foe.statuses.plated, 13);
        const end = act(second.state);
        assert.ok(end.events.some((e) => e.type === 'block' && e.source?.id === 'plated' && e.amount === 13));
        assert.equal(end.state.units.foe.statuses.plated, 13);
        const replayed = replayBattle(battle.setup, 7, [{ type: 'play', inst: firstInst, targetId: 'foe' }, { type: 'play', inst: secondInst, targetId: 'foe' }, END_TURN]);
        assert.equal(replayed.ok, true);
        assert.deepEqual(replayed.state, end.state);
        assert.deepEqual(replayed.events, [...battle.events, ...first.events, ...second.events, ...end.events]);
    });

    it('Shelled Parasite 吸血按实际失血回复，格挡、护命与无实体均计入；重放一致', () => {
        const suck = STS1_ACT2.find((item) => item.sourceKey === 'Shelled Parasite').original.skills.find((s) => s.id === 'suck');
        for (const [passives, expected] of [[[], 10], [[{ id: 'wall', name: '壁', trigger: 'battle-start', effects: [{ op: 'block', amount: 7, target: 'self' }] }], 3],
            [[{ id: 'wall', name: '壁', trigger: 'battle-start', effects: [{ op: 'block', amount: 10, target: 'self' }] }], 0],
            [[openingStatus('buffer')], 0], [[{ id: 'mist', name: '无实体', trigger: 'battle-start', effects: [{ op: 'status', status: 'intangible', stacks: 1, target: 'self' }] }], 1]]) {
            const battle = battleWithTraits(foeUnit({ maxHp: 99, hp: 40, skills: [suck], script: cycle(['suck']) }), { ...heroUnit(), maxHp: 999, passives });
            const result = act(battle.state);
            assert.equal(result.state.units.hero.hp, 999 - expected);
            assert.equal(result.state.units.foe.hp, 40 + expected);
            const replayed = replayBattle(battle.setup, 7, [END_TURN]);
            assert.equal(replayed.ok, true);
            assert.deepEqual(replayed.state, result.state);
            assert.deepEqual(replayed.events, [...battle.events, ...result.events]);
        }
    });

    it('仅吸血的伤害来源可缝合，说明覆盖吸血和破甲，缝合单位可执行及重放', () => {
        const raw = STS1_ACT2.find((item) => item.sourceKey === 'Shelled Parasite');
        const profile = materializeEnemy(ENEMIES.find((item) => item.id === raw.id), 'original');
        const text = describeEnemy(profile);
        assert.ok(text.includes('吸血回复') && text.includes('破甲后停顿'), text);
        assert.equal(text.includes(UNKNOWN_TEXT), false);
        const entries = prepareEnemyEntries([
            enemy('sts1', 'drain-probe', 1, '吸取源', 'normal', 'release', { skills: [raw.original.skills.find((s) => s.id === 'suck')] }, { hp: 40 }),
            enemy('sts1', 'drain-probe', 2, '守势源', 'normal', 'release', { skills: [guard('wait')] }, { hp: 40 }),
        ]).entries;
        const pool = enemyPool({ tier: 'normal', seed: 'drain-only' }, entries);
        assert.equal(pool.length, 4);
        const stitched = pool.filter((item) => item.kind === 'stitched');
        assert.equal(stitched.length, 2);
        for (const item of stitched) {
            assert.equal(normalizeProfile(item.profile).ok, true);
            assert.ok(item.profile.skills.some((s) => s.effects.some((e) => e.op === 'drain')));
            assert.ok(item.text.includes('吸血回复'), item.text);
            const unit = foeUnit({ maxHp: item.profile.base.hp, skills: item.profile.skills });
            const run = runTurns(unit, 4);
            assert.ok(run.events.some((e) => e.type === 'damage' && e.source?.unitId === 'foe'));
            assert.deepEqual(replayBattle(run.setup, 7, run.actions).state, run.state);
        }
    });

    it('第三、四幕与事件24个来源逐一对账，S1合计66条且只有可保真条目入池', () => {
        const act3 = ['Exploder', 'Repulsor', 'Spiker', 'Darkling', 'Orb Walker', 'The Maw', 'Spire Growth', 'Transient',
            'Writhing Mass', 'Giant Head', 'Nemesis', 'Reptomancer', 'Dagger', 'Time Eater', 'Donu', 'Deca', 'Awakened One'];
        assert.deepEqual(STS1_ACT3.map((item) => item.sourceKey), act3);
        assert.deepEqual(STS1_ACT3.filter((item) => item.status === 'pending').map((item) => item.sourceKey), ['Nemesis', 'Donu', 'Deca']);
        assert.equal(STS1_ACT3.filter((item) => item.excluded).length, 10);
        assert.deepEqual(STS1_ACT4.map((item) => item.sourceKey), ['Spire Shield', 'Spire Spear', 'Corrupt Heart']);
        assert.equal(STS1_ACT4.filter((item) => item.excluded).length, 3);
        assert.deepEqual(STS1_EVENTS.map((item) => item.sourceKey),
            ['Pointy（事件）', 'Romeo（事件）', 'Bear（事件）', 'Lagavulin（Dead Adventurer 已醒型）']);
        assert.equal(STS1_EVENTS.filter((item) => item.excluded).length, 0);
        for (const raw of [...STS1_ACT3, ...STS1_ACT4, ...STS1_EVENTS].filter((item) => item.status !== 'release' || item.excluded)) {
            const item = ENEMIES.find((entry) => entry.id === raw.id);
            assert.ok(item.notes[0] && item.evidence.length === 2, item.id);
            assert.equal(item.original, null);
            assert.equal(item.scale, undefined);
            for (const model of ['original']) assert.equal(resolveEnemy(item.id, model), null);
        }
        const sts1 = ENEMIES.filter((item) => item.source === 'sts1');
        assert.equal(sts1.length, 66);
        assert.equal(new Set(sts1.map((item) => item.sourceKey)).size, 66);
        assert.equal(sts1.filter((item) => item.status === 'pending').length, 10);
        assert.equal(sts1.filter((item) => item.excluded).length, 30);
        assert.deepEqual(enemyCandidates({}, sts1).map((item) => item.sourceKey),
            ['Jaw Worm（第一幕）', 'Fungi Beast', 'Spike Slime (M)', 'Spike Slime (S)', 'Acid Slime (M)', 'Fat Gremlin', 'Sneaky Gremlin',
                'Gremlin Wizard', 'Blue Slaver', 'Looter', 'Mugger', 'Gremlin Nob', 'Lagavulin', 'Sentry', 'The Guardian', 'Spheric Guardian', 'Shelled Parasite', 'Taskmaster',
                'Exploder', 'Repulsor', 'Spiker', 'Orb Walker', 'Pointy（事件）', 'Romeo（事件）', 'Bear（事件）', 'Lagavulin（Dead Adventurer 已醒型）']);
        assert.equal(drawEnemy({ seed: 'sts1-boss', tier: 'boss' }, sts1)?.name, '折甲巨像');
        assert.deepEqual(enemyReferences(sts1), { 'sts1|normal': { hp: 31, damage: 11.5 }, 'sts1|elite': { hp: 84, damage: 14 }, 'sts1|boss': { hp: 240, damage: 32 } });
    });
    it('Spiker 开场荆棘3，增棘最多六次且不限连用，耗尽后只攻击；重放一致', () => {
        const raw = STS1_ACT3.find((item) => item.sourceKey === 'Spiker');
        assert.deepEqual(raw.hp, [42, 56]);
        assert.deepEqual(raw.original.skills.map((s) => [s.id, s.weight, s.maxRepeat, s.maxUses]),
            [['strike', 1, 1, undefined], ['spikes', 1, 0, 6]]);
        assert.equal(raw.original.skills[0].effects[0].amount, 7);
        const item = ENEMIES.find((entry) => entry.id === raw.id);
        const profile = materializeEnemy(item, 'original', { id: 'foe' });
        const [unit] = enemyUnits({ enemies: [{ name: profile.name, count: 1 }] }, new Map([[profile.name, profile]]), 1, 'normal').units;
        for (let seed = 0; seed < 16; seed += 1) {
            const setup = setupWith(unit);
            setup.units[0].maxHp = 9999;
            const created = createBattle(setup, seed);
            assert.equal(created.ok, true, JSON.stringify(created.error));
            assert.equal(created.state.units.foe.statuses.thorns, 3);
            if (seed === 0) {
                assert.equal(chooseSkillIntent(created.state, 'foe', 0).skillId, 'strike');
                assert.equal(chooseSkillIntent(created.state, 'foe', 0.5).skillId, 'spikes');
            }
            let state = created.state;
            const events = [...created.events];
            const actions = [];
            for (let turn = 0; turn < 24 && !state.outcome; turn += 1) {
                const result = act(state);
                state = result.state;
                events.push(...result.events);
                actions.push(END_TURN);
            }
            const used = events.filter((e) => e.type === 'skill' && e.unitId === 'foe').map((e) => e.skillId);
            assert.equal(used.filter((id) => id === 'spikes').length, 6, `seed ${seed}: ${used}`);
            let buffs = 0;
            used.forEach((id, i) => {
                if (id === 'spikes') buffs += 1;
                if (buffs < 6 && id === 'strike') assert.notEqual(used[i + 1], 'strike', used.join());
            });
            const tail = used.slice(used.lastIndexOf('spikes') + 1);
            assert.ok(tail.length >= 3 && tail.every((id) => id === 'strike'), used.join());
            assert.equal(state.units.foe.res.skillUses.spikes, 6);
            assert.equal(state.units.foe.statuses.thorns, 15);
            const replayed = replayBattle(setup, seed, actions);
            assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
            assert.deepEqual(replayed.state, state);
            assert.deepEqual(replayed.events, events);
        }
    });

    it('Spiker 荆棘逐段反伤且可被格挡，非攻击伤害不反伤；重放一致', () => {
        const item = ENEMIES.find((entry) => entry.source === 'sts1' && entry.sourceKey === 'Spiker');
        const profile = materializeEnemy(item, 'original', { id: 'foe' });
        const [unit] = enemyUnits({ enemies: [{ name: profile.name, count: 1 }] }, new Map([[profile.name, profile]]), 1, 'normal').units;
        const hero = traitHero([
            testCard('guard-hit', 'attack', [{ op: 'block', amount: 5, target: 'self' }, { op: 'damage', amount: 1, hits: 3 }]),
            testCard('poison', 'skill', [{ op: 'status', status: 'poison', stacks: 1, target: 'enemy' }]),
        ]);
        const setup = { controlledId: 'hero', units: [hero, unit] };
        const created = createBattle(setup, 7);
        assert.equal(created.ok, true, JSON.stringify(created.error));
        const played = playNamed(created.state, 'guard-hit');
        const thorns = played.events.filter((e) => e.type === 'damage' && e.kind === 'thorns');
        assert.deepEqual(thorns.map((e) => [e.amount, e.blocked, e.hpLoss]), [[3, 3, 0], [3, 2, 1], [3, 0, 3]]);
        assert.equal(played.state.units.hero.hp, 56);
        const poisoned = playNamed(played.state, 'poison');
        assert.equal(poisoned.events.some((e) => e.type === 'damage' && e.kind === 'thorns'), false);
        assert.equal(poisoned.state.units.foe.statuses.poison, 1);
        let state = poisoned.state;
        const turnEvents = [];
        const turnActions = [];
        const poisonSeen = () => turnEvents.some((e) => e.type === 'damage' && e.kind === 'poison' && e.target === 'foe');
        for (let turn = 0; turn < 4 && !state.outcome && !poisonSeen(); turn += 1) {
            const result = act(state);
            state = result.state;
            turnEvents.push(...result.events);
            turnActions.push(END_TURN);
        }
        assert.equal(poisonSeen(), true, JSON.stringify(turnEvents));
        assert.equal(turnEvents.some((e) => e.type === 'damage' && e.kind === 'thorns'), false);
        const inst = (state, id) => state.piles.hero.hand.find((key) => state.cards[key].cardId === id);
        const actions = [
            { type: 'play', inst: inst(created.state, 'guard-hit'), targetId: 'foe' },
            { type: 'play', inst: inst(played.state, 'poison'), targetId: 'foe' }, ...turnActions,
        ];
        const replayed = replayBattle(setup, 7, actions);
        assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
        assert.deepEqual(replayed.state, state);
        assert.deepEqual(replayed.events, [...created.events, ...played.events, ...poisoned.events, ...turnEvents]);
    });



    it('Repulsor 扰念不限连用，斥击禁连且基础权重1:4；实际四连与重放一致', () => {
        const raw = STS1_ACT3.find((item) => item.sourceKey === 'Repulsor');
        assert.deepEqual(raw.original.skills.map((s) => [s.id, s.weight, s.maxRepeat]), [['strike', 1, 1], ['daze', 4, 0]]);
        assert.deepEqual(raw.original.skills[1].effects, [{ op: 'create', card: 'status-daze', amount: 2, to: 'draw' }]);
        const item = ENEMIES.find((entry) => entry.id === raw.id);
        const profile = materializeEnemy(item, 'original', { id: 'foe' });
        const [unit] = enemyUnits({ enemies: [{ name: profile.name, count: 1 }] }, new Map([[profile.name, profile]]), 1, 'normal').units;
        let fourInRow = false;
        for (let seed = 0; seed < 8; seed += 1) {
            const setup = setupWith(unit);
            setup.units[0].maxHp = 9999;
            const created = createBattle(setup, seed);
            assert.equal(created.ok, true, JSON.stringify(created.error));
            assert.equal(chooseSkillIntent(created.state, 'foe', 0.19).skillId, 'strike');
            assert.equal(chooseSkillIntent(created.state, 'foe', 0.2).skillId, 'daze');
            let state = created.state;
            const events = [...created.events];
            const actions = [];
            for (let turn = 0; turn < 24 && !state.outcome; turn += 1) {
                const result = act(state);
                state = result.state;
                events.push(...result.events);
                actions.push(END_TURN);
            }
            const used = events.filter((e) => e.type === 'skill' && e.unitId === 'foe').map((e) => e.skillId);
            fourInRow ||= used.join(',').includes('daze,daze,daze,daze');
            for (let i = 1; i < used.length; i += 1) assert.ok(used[i] !== 'strike' || used[i - 1] !== 'strike', used.join());
            const replayed = replayBattle(setup, seed, actions);
            assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
            assert.deepEqual(replayed.state, state);
            assert.deepEqual(replayed.events, events);
        }
        assert.equal(fourInRow, true, '实际执行须覆盖扰念四连');
    });

    it('锐刺蒙面客保留两段攻击，实际出招四回合且重放一致', () => {
        const raw = STS1_EVENTS.find((item) => item.sourceKey === 'Pointy（事件）');
        assert.equal(raw.hp, 30);
        assert.deepEqual(raw.original.skills.map((s) => [s.effects.length, s.effects[0].amount, s.effects[0].hits]), [[1, 5, 2]]);
        const item = ENEMIES.find((entry) => entry.id === raw.id);
        {
            const profile = materializeEnemy(item, 'original');
            assert.equal(profile.skills[0].effects.length, 1);
            assert.equal(profile.skills[0].effects[0].hits, 2);
            const run = runTurns(foeUnit({ maxHp: profile.base.hp, skills: profile.skills, script: profile.script }), 4);
            assert.deepEqual(run.skills, Array(4).fill('special'));
            const replay = replayBattle(run.setup, 7, run.actions);
            assert.equal(replay.ok, true);
            assert.deepEqual(replay.state, run.state);
            assert.deepEqual(replay.events, run.events);
        }
    });

    it('S2 Overgrowth 22个来源逐一对账，13条原版可保真条目入池', () => {
        const keys = ['Assassin Raider', 'Axe Raider', 'Brute Raider', 'Crossbow Raider', 'Tracker Raider', 'Cubex Construct',
            'Eye With Teeth', 'Flyconid', 'Fogmog', 'Fuzzy Wurm Crawler', 'Inklet', 'Leaf Slime (M)', 'Leaf Slime (S)', 'Mawler',
            'Nibbit', 'Shrinker Beetle', 'Slithering Strangler', 'Snapping Jaxfruit', 'Twig Slime (M)', 'Twig Slime (S)',
            'Vine Shambler', 'Wriggler（事件版）'];
        assert.deepEqual(STS2_OVERGROWTH.map((item) => item.sourceKey), keys);
        assert.deepEqual(STS2_OVERGROWTH.filter((item) => item.status === 'pending').map((item) => item.sourceKey),
            ['Fogmog', 'Leaf Slime (M)', 'Leaf Slime (S)', 'Shrinker Beetle', 'Twig Slime (M)', 'Vine Shambler', 'Wriggler（事件版）']);
        assert.equal(STS2_OVERGROWTH.filter((item) => item.excluded).length, 2);
        const entries = ENEMIES.filter((item) => item.source === 'sts2' && item.group === 'overgrowth');
        assert.equal(entries.length, 22);
        assert.deepEqual(enemyCandidates({}, entries).map((item) => item.sourceKey),
            ['Assassin Raider', 'Axe Raider', 'Brute Raider', 'Crossbow Raider', 'Tracker Raider', 'Cubex Construct', 'Flyconid', 'Fuzzy Wurm Crawler',
                'Mawler', 'Nibbit', 'Slithering Strangler', 'Snapping Jaxfruit', 'Twig Slime (S)']);
        for (const item of entries.filter((entry) => entry.status !== 'release' || entry.excluded)) {
            assert.ok(item.notes[0] && item.evidence.length === 3, item.id);
            assert.equal(item.original, null);
            for (const model of ['original']) assert.equal(resolveEnemy(item.id, model), null);
        }
        assert.deepEqual(enemyReferences(STS2_OVERGROWTH), { 'sts2|normal': { hp: 32, damage: 10 } });
        for (const tier of ['elite', 'boss']) assert.equal(drawEnemy({ seed: 'og-empty', tier }, entries), null);
    });

    it('Strangler 绞缠与等权攻击节点交替，跨节点可重复攻击；物化建局与重放一致', () => {
        const raw = STS2_OVERGROWTH.find((item) => item.sourceKey === 'Slithering Strangler');
        assert.deepEqual(raw.hp, [53, 55]);
        assert.deepEqual(raw.original.skills.map((s) => s.effects), [
            [{ op: 'constrict', stacks: 3, target: 'enemy' }],
            [{ op: 'damage', amount: 7, hits: 1, target: 'enemy' }, { op: 'block', amount: 5, target: 'self' }],
            [{ op: 'damage', amount: 12, hits: 1, target: 'enemy' }],
        ]);
        assert.ok(raw.original.skills.every((s) => s.maxRepeat === 0));
        const entry = ENEMIES.find((item) => item.id === raw.id);
        const profile = materializeEnemy(entry, 'original', { id: 'foe' });
        const [unit] = enemyUnits({ enemies: [{ name: profile.name, count: 1 }] }, new Map([[profile.name, profile]]), 1, 'normal').units;
        let repeatedAttack = false;
        for (let seed = 0; seed < 8; seed += 1) {
            const setup = { ...setupWith(unit), rulesVersion: 6 };
            setup.units[0].maxHp = 9999;
            const created = createBattle(setup, seed);
            assert.equal(created.ok, true, JSON.stringify(created.error));
            assert.equal(created.state.intents.foe.skillId, 'constrict');
            let state = created.state;
            const events = [...created.events];
            const actions = [];
            let moves = 0;
            for (let turn = 0; turn < 24 && moves < 10; turn += 1) {
                const result = act(state);
                state = result.state;
                events.push(...result.events);
                actions.push(END_TURN);
                const acted = result.events.filter((e) => e.type === 'skill' && e.unitId === 'foe');
                if (moves === 0 && acted.length) {
                    assert.equal(chooseSkillIntent(state, 'foe', 0).skillId, 'thwack');
                    assert.equal(chooseSkillIntent(state, 'foe', 0.5).skillId, 'lash');
                }
                moves += acted.length;
            }
            const used = events.filter((e) => e.type === 'skill' && e.unitId === 'foe').map((e) => e.skillId);
            assert.equal(used.length, 10);
            used.forEach((id, i) => assert.ok(i % 2 === 0 ? id === 'constrict' : ['thwack', 'lash'].includes(id), used.join()));
            const attacks = used.filter((id) => id !== 'constrict');
            repeatedAttack ||= attacks.some((id, i) => i > 0 && id === attacks[i - 1]);
            const replayed = replayBattle(setup, seed, actions);
            assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
            assert.deepEqual(replayed.state, state);
            assert.deepEqual(replayed.events, events);
        }
        assert.equal(repeatedAttack, true);
    });

    it('Strangler 绞缠在镀甲与持续格挡之后结算，来源倒下即解除；重放一致', () => {
        const entry = ENEMIES.find((item) => item.sourceKey === 'Slithering Strangler');
        const profile = materializeEnemy(entry, 'original', { id: 'foe' });
        const [unit] = enemyUnits({ enemies: [{ name: profile.name, count: 1 }] }, new Map([[profile.name, profile]]), 1, 'normal').units;
        const kill = { id: 'kill', name: '终击', type: 'attack', cost: 0, target: 'enemy', effects: [{ op: 'damage', amount: 99 }] };
        const hero = traitHero(Array(5).fill(kill), { maxHp: 9999, passives: [
            { id: 'plate', name: '镀甲', trigger: 'battle-start', effects: [{ op: 'apply-status', status: 'plating', stacks: 9, target: 'self' }] },
            { id: 'wall', name: '壁', trigger: 'turn-end', effects: [{ op: 'block', amount: 9, target: 'self' }] },
        ] });
        const setup = { rulesVersion: 6, controlledId: 'hero', units: [hero, unit, foeUnit({ id: 'foe2', skills: [guard('wait')] })] };
        const created = createBattle(setup, 7);
        assert.equal(created.ok, true, JSON.stringify(created.error));
        let first = created;
        const events = [...created.events];
        const actions = [];
        for (let turn = 0; turn < 4 && !first.state.units.hero.statuses.constricted; turn += 1) {
            first = act(first.state);
            events.push(...first.events);
            actions.push(END_TURN);
        }
        const stacks = first.state.units.hero.statuses.constricted;
        assert.ok(stacks > 0);
        const second = act(first.state);
        const tick = second.events.find((e) => e.type === 'damage' && e.target === 'hero' && e.source?.id === 'constricted');
        assert.ok(tick);
        assert.equal(tick.hpLoss, 0);
        const beforeTick = second.events.slice(0, second.events.indexOf(tick));
        assert.ok(beforeTick.some((e) => e.type === 'block' && e.source?.id === 'plating'));
        assert.ok(beforeTick.some((e) => e.type === 'passive' && e.passiveId === 'wall'));
        const killed = playNamed(second.state, 'kill');
        assert.equal(killed.state.units.foe.alive, false);
        assert.equal(killed.state.units.hero.statuses.constricted, undefined);
        assert.equal(killed.state.units.hero.res?.constrictFrom, undefined);
        const after = act(killed.state);
        assert.equal(after.events.some((e) => e.type === 'damage' && e.source?.id === 'constricted'), false);
        const replayed = replayBattle(setup, 7, [...actions, END_TURN,
            { type: 'play', inst: second.state.piles.hero.hand.find((id) => second.state.cards[id].cardId === 'kill'), targetId: 'foe' }, END_TURN]);
        assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
        assert.deepEqual(replayed.state, after.state);
        assert.deepEqual(replayed.events, [...events, ...second.events, ...killed.events, ...after.events]);
    });

    it('Strangler 缠绕说明可见，缝合池保留缠绕技能且档案合法', () => {
        const entries = ENEMIES.filter((item) => ['Slithering Strangler', 'Assassin Raider'].includes(item.sourceKey));
        const pool = enemyPool({ tier: 'normal', seed: 'strangler-stitch' }, entries);
        assert.equal(pool.length, 4);
        const original = pool.find((item) => item.kind === 'original' && item.enemyId === 'en-sts2-overgrowth-17');
        assert.ok(original.text.includes('缠绕至施加者倒下'), original.text);
        assert.equal(original.text.includes(UNKNOWN_TEXT), false);
        const stitched = pool.filter((item) => item.kind === 'stitched');
        assert.ok(stitched.some((item) => item.profile.skills.some((s) => s.effects.some((e) => e.op === 'constrict'))));
        for (const item of stitched) assert.equal(normalizeProfile(item.profile).ok, true);
    });

    it('S2 Overgrowth 收录条目基础效果保真，实际出招与重放一致', () => {
        const raw = (key) => STS2_OVERGROWTH.find((item) => item.sourceKey === key);
        const moves = (item) => item.original.skills.map((s) => s.effects.map((e) => [e.op, e.amount ?? e.stacks, e.hits ?? null, e.target ?? null]));
        assert.deepEqual(moves(raw('Assassin Raider')), [[['damage', 10, 1, 'enemy']]]);
        assert.deepEqual(moves(raw('Crossbow Raider')), [[['block', 3, null, 'self']], [['damage', 14, 1, 'enemy']]]);
        assert.deepEqual(moves(raw('Nibbit')), [[['damage', 12, 1, 'enemy']], [['damage', 6, 1, 'enemy'], ['block', 5, null, 'self']], [['status', 2, null, 'self']]]);
        assert.deepEqual(moves(raw('Twig Slime (S)')), [[['damage', 4, 1, 'enemy']]]);
        assert.deepEqual(moves(raw('Tracker Raider')), [[['status', 2, null, 'enemy']], [['damage', 1, 8, 'enemy']]]);
        const expected = {
            'Assassin Raider': ['killshot', 'killshot', 'killshot', 'killshot'],
            'Axe Raider': ['swing', 'swing', 'big', 'swing', 'swing', 'big'],
            'Brute Raider': ['beat', 'clap', 'beat', 'clap'],
            'Crossbow Raider': ['reload', 'fire', 'reload', 'fire'],
            'Tracker Raider': ['track', 'hounds', 'hounds', 'hounds'],
            'Cubex Construct': ['charge', 'repeater', 'repeater', 'expel'],
            'Fuzzy Wurm Crawler': ['goop', 'inhale', 'goop', 'goop', 'inhale', 'goop'],
            Nibbit: ['butt', 'slice', 'hiss', 'butt', 'slice', 'hiss'],
            'Snapping Jaxfruit': ['orb', 'orb', 'orb', 'orb'],
            'Twig Slime (S)': ['tackle', 'tackle', 'tackle', 'tackle'],
        };
        for (const [key, sequence] of Object.entries(expected)) {
            const item = ENEMIES.find((entry) => entry.sourceKey === key);
            {
                const profile = materializeEnemy(item, 'original');
                const run = runTurns(foeUnit({ maxHp: profile.base.hp, skills: profile.skills, script: profile.script }), sequence.length);
                assert.deepEqual(run.skills, sequence, key);
                const replay = replayBattle(run.setup, 7, run.actions);
                assert.equal(replay.ok, true);
                assert.deepEqual(replay.state, run.state);
                assert.deepEqual(replay.events, run.events);
            }
        }
    });

    it('S2 Underdocks 16个来源逐一对账，7条原版可保真条目入池，其余不能物化', () => {
        const keys = ['Calcified Cultist', 'Corpse Slug', 'Damp Cultist', 'Fossil Stalker', 'Gremlin Merc', 'Fat Gremlin（S2）',
            'Sneaky Gremlin（S2）', 'Haunted Ship', 'Living Fog', 'Gas Bomb', 'Punch Construct', 'Seapunk', 'Sewer Clam',
            'Sludge Spinner', 'Toadpole', 'Two-Tailed Rat'];
        assert.deepEqual(STS2_UNDERDOCKS.map((item) => item.sourceKey), keys);
        assert.deepEqual(STS2_UNDERDOCKS.filter((item) => item.status === 'pending').map((item) => item.sourceKey), ['Fossil Stalker', 'Sludge Spinner']);
        assert.equal(STS2_UNDERDOCKS.filter((item) => item.excluded).length, 7);
        assert.deepEqual(enemyReferences(STS2_UNDERDOCKS), { 'sts2|normal': { hp: 52, damage: 10 } });
        const entries = ENEMIES.filter((item) => item.source === 'sts2' && item.group === 'underdocks');
        assert.equal(entries.length, 16);
        assert.deepEqual(enemyCandidates({}, entries).map((item) => item.sourceKey),
            ['Calcified Cultist', 'Damp Cultist', 'Haunted Ship', 'Punch Construct', 'Seapunk', 'Sewer Clam', 'Toadpole']);
        for (const item of entries.filter((entry) => entry.status !== 'release' || entry.excluded)) {
            assert.ok(item.notes[0] && item.evidence.length === 3, item.id);
            assert.equal(item.original, null);
            assert.equal(item.scale, undefined);
            for (const model of ['original']) assert.equal(resolveEnemy(item.id, model), null);
        }
        assert.equal(ENEMIES.filter((item) => item.source === 'sts2' && ['overgrowth', 'underdocks'].includes(item.group)).length, 38);
    });

    it('S2 Hive 18个来源逐一对账，Beta 与待证记录隔离，6条原版可保真条目入池', () => {
        const keys = ['Bowlbug (Rock)', 'Bowlbug (Egg)', 'Bowlbug (Silk)', 'Bowlbug (Nectar)', 'Chomper', 'Exoskeleton',
            'Hunter Killer', 'Louse Progenitor', 'Mysterious Knight（事件）', 'Myte', 'Ovicopter', 'Tough Egg',
            'Slumbering Beetle', 'Spiny Toad', 'The Obscura', 'Parafright', 'Thieving Hopper', 'Tunneler'];
        assert.deepEqual(STS2_HIVE.map((item) => item.sourceKey), keys);
        assert.deepEqual(STS2_HIVE.filter((item) => item.status === 'pending').map((item) => item.sourceKey), ['Bowlbug (Silk)', 'Hunter Killer', 'Myte']);
        assert.deepEqual(STS2_HIVE.filter((item) => item.status === 'beta').map((item) => item.sourceKey), ['Exoskeleton', 'Louse Progenitor']);
        assert.equal(STS2_HIVE.filter((item) => item.excluded).length, 7);
        assert.ok(STS2_HIVE.filter((item) => item.status !== 'release').every((item) => item.excluded === undefined));
        assert.deepEqual(enemyReferences(STS2_HIVE), { 'sts2|normal': { hp: 54.25, damage: 15.5 } });
        const entries = ENEMIES.filter((item) => item.source === 'sts2' && item.group === 'hive');
        assert.equal(entries.length, 18);
        assert.deepEqual(enemyCandidates({}, entries).map((item) => item.sourceKey),
            ['Bowlbug (Rock)', 'Bowlbug (Egg)', 'Bowlbug (Nectar)', 'Chomper', 'Mysterious Knight（事件）', 'Spiny Toad']);
        for (const item of entries.filter((entry) => entry.status !== 'release' || entry.excluded)) {
            assert.ok(item.notes[0] && item.evidence.length === 3, item.id);
            assert.equal(item.original, null);
            assert.equal(item.scale, undefined);
            for (const model of ['original']) assert.equal(resolveEnemy(item.id, model), null);
        }
        assert.equal(ENEMIES.filter((item) => item.source === 'sts2' && ['overgrowth', 'underdocks', 'hive'].includes(item.group)).length, 56);
    });

    it('S2 Glory 16个来源逐一对账，4条可抽、迷失者仅遭遇、遗忘者待证', () => {
        const keys = ['Devoted Sculptor', 'Scroll of Biting', 'Axebot', 'Fabricator', 'Zapbot', 'Stabbot', 'Guardbot', 'Noisebot',
            'Frog Knight', 'Globe Head', 'Owl Magistrate', 'Slimed Berserker', 'Living Shield', 'Turret Operator', 'The Lost', 'The Forgotten'];
        assert.deepEqual(STS2_GLORY.map((item) => item.sourceKey), keys);
        assert.deepEqual(STS2_GLORY.filter((item) => item.status === 'pending').map((item) => item.sourceKey), ['Scroll of Biting', 'Globe Head', 'Slimed Berserker', 'The Forgotten']);
        assert.deepEqual(STS2_GLORY.filter((item) => item.status === 'beta').map((item) => item.sourceKey), ['Axebot']);
        assert.equal(STS2_GLORY.filter((item) => item.excluded).length, 6);
        const entries = ENEMIES.filter((item) => item.source === 'sts2' && item.group === 'glory');
        assert.equal(entries.length, 16);
        assert.deepEqual(enemyCandidates({}, entries).map((item) => item.sourceKey), ['Devoted Sculptor', 'Frog Knight', 'Owl Magistrate', 'Turret Operator']);
        for (const item of entries.filter((entry) => entry.status !== 'release' || entry.excluded)) {
            assert.ok(item.notes[0] && item.evidence.length === 3, item.id);
            assert.equal(item.original, null);
            for (const model of ['original']) assert.equal(resolveEnemy(item.id, model), null);
        }
        assert.deepEqual(enemyReferences(STS2_GLORY), { 'sts2|normal': { hp: 162, damage: 15 } });
        assert.equal(ENEMIES.filter((item) => item.source === 'sts2' && ['overgrowth', 'underdocks', 'hive', 'glory'].includes(item.group)).length, 72);
    });

    it('迷失与遗忘固定同场，搭档待证时不能部分物化，迷失者不进单体或缝合池', () => {
        const lost = ENEMIES.find((item) => item.sourceKey === 'The Lost');
        assert.equal(lost.encounterOnly, true);
        assert.equal(resolveEnemy(lost.id, 'original'), null);
        const encounter = ENEMY_ENCOUNTERS.find((item) => item.id === 'enc-lost-forgotten');
        assert.deepEqual(encounter.members, [{ enemyId: lost.id, count: 1 }, { enemyId: 'en-sts2-glory-16', count: 1 }]);
        assert.deepEqual(encounter.unavailable, ['en-sts2-glory-16']);
        assert.equal(materializeEncounter(encounter), null);
        assert.equal(encounterByName('迷失与遗忘'), null);
        const pool = enemyPool({ tier: 'normal', seed: 'lost-pair' });
        assert.ok(pool.length > 0);
        assert.equal(pool.some((item) => item.enemyId === lost.id || item.sources?.includes(lost.id)), false);
    });

    it('迷失者为夺力2与4×2交替，实际出招与重放一致', () => {
        const raw = STS2_GLORY.find((item) => item.sourceKey === 'The Lost');
        assert.deepEqual(raw.original.skills.map((s) => s.effects), [
            [{ op: 'seize-might', stat: 'strength', amount: 2, target: 'enemy' }],
            [{ op: 'damage', amount: 4, hits: 2, target: 'enemy' }],
        ]);
        const item = ENEMIES.find((entry) => entry.id === raw.id);
        {
            const profile = materializeEnemy(item, 'original');
            assert.deepEqual(profile.skills.map((s) => s.cooldown), [0, 0]);
            const run = runTurns(foeUnit({ maxHp: profile.base.hp, skills: profile.skills, script: profile.script }), 4);
            assert.deepEqual(run.skills, ['smog', 'lasers', 'smog', 'lasers']);
            const replay = replayBattle(run.setup, 7, run.actions);
            assert.equal(replay.ok, true);
            assert.deepEqual(replay.state, run.state);
            assert.deepEqual(replay.events, run.events);
        }
    });

    it('S2 精英14个来源逐一对账，Beta 与待证隔离，巢鸟领主、潜伏虫群与魂枢入池', () => {
        const keys = ['Bygone Effigy', 'Byrdonis', 'Phrog Parasite', 'Phantasmal Gardener', 'Skulking Colony', 'Terror Eel',
            'Decimillipede', 'Entomancer', 'Infested Prism', 'Flail Knight', 'Spectral Knight', 'Magi Knight', 'Mecha Knight', 'Soul Nexus'];
        assert.deepEqual(STS2_ELITES.map((item) => item.sourceKey), keys);
        assert.ok(STS2_ELITES.every((item) => item.tier === 'elite'));
        assert.deepEqual(STS2_ELITES.filter((item) => item.status === 'pending').map((item) => item.sourceKey),
            ['Bygone Effigy', 'Terror Eel', 'Infested Prism', 'Flail Knight', 'Spectral Knight', 'Magi Knight']);
        assert.deepEqual(STS2_ELITES.filter((item) => item.status === 'beta').map((item) => item.sourceKey), ['Entomancer', 'Mecha Knight']);
        assert.equal(STS2_ELITES.filter((item) => item.excluded).length, 3);
        assert.deepEqual(enemyReferences(STS2_ELITES), { 'sts2|elite': { hp: 82.5, damage: 17 } });
        const entries = ENEMIES.filter((item) => item.source === 'sts2' && item.group === 'elite');
        assert.equal(entries.length, 14);
        assert.deepEqual(enemyCandidates({ tier: 'elite' }, entries).map((item) => item.sourceKey), ['Byrdonis', 'Skulking Colony', 'Soul Nexus']);
        assert.equal(drawEnemy({ seed: 'elite-empty', tier: 'boss' }, entries), null);
        for (const item of entries.filter((entry) => entry.status !== 'release' || entry.excluded)) {
            assert.ok(item.notes[0] && item.evidence.length === 3, item.id);
            assert.equal(item.original, null);
            assert.equal(item.scale, undefined);
            for (const model of ['original']) assert.equal(resolveEnemy(item.id, model), null);
        }
        assert.equal(ENEMIES.filter((item) => item.source === 'sts2' && item.group !== 'boss' && item.group !== 'event').length, 86);
    });

    it('S2 首领15条（帝蟹拆两爪成员）与事件4条逐一对账，S1+S2合计171条，首领酣眠石卫母、瀑流巨人与知识恶魔可抽，两爪不独立入池', () => {
        const bossKeys = ['Ceremonial Beast', 'Kin Priest / Kin Follower', 'Vantom', 'Lagavulin Matriarch', 'Soul Fysh', 'Waterfall Giant',
            'The Insatiable', 'Knowledge Demon', 'Kaiser Crab（Crusher）', 'Kaiser Crab（Rocket）', 'Aeonglass', 'Queen', 'Torch Head Amalgam',
            'Test Subject（Phase 1 / 2 / 3）', 'Doormaker'];
        assert.deepEqual(STS2_BOSSES.map((item) => item.sourceKey), bossKeys);
        assert.ok(STS2_BOSSES.every((item) => item.tier === 'boss'));
        assert.deepEqual(STS2_BOSSES.filter((item) => item.encounterOnly).map((item) => item.id), ['en-sts2-boss-09', 'en-sts2-boss-15']);
        for (const id of ['en-sts2-boss-09', 'en-sts2-boss-15']) assert.equal(resolveEnemy(id, 'original'), null, id);
        assert.deepEqual(STS2_BOSSES.filter((item) => item.status === 'pending').map((item) => item.sourceKey), ['Ceremonial Beast', 'Vantom']);
        assert.deepEqual(STS2_BOSSES.filter((item) => item.status === 'beta').map((item) => item.sourceKey), ['Soul Fysh', 'Aeonglass', 'Queen']);
        assert.deepEqual(STS2_BOSSES.filter((item) => item.status === 'deprecated').map((item) => item.sourceKey), ['Doormaker']);
        assert.equal(STS2_BOSSES.filter((item) => item.excluded).length, 4);
        assert.deepEqual(STS2_EVENTS.map((item) => item.sourceKey), ['The Merchant???', 'Battle Friend V1.0', 'Battle Friend V2.0', 'Battle Friend V3.0']);
        assert.equal(STS2_EVENTS.filter((item) => item.excluded).length, 4);
        assert.deepEqual(enemyReferences([...STS2_BOSSES, ...STS2_EVENTS]), { 'sts2|boss': { hp: 222, damage: 20 } });
        for (const raw of [...STS2_BOSSES, ...STS2_EVENTS].filter((item) => item.status !== 'release' || item.excluded)) {
            const item = ENEMIES.find((entry) => entry.id === raw.id);
            assert.ok(item.notes[0] && item.evidence.length === 3, item.id);
            assert.equal(item.original, null);
            assert.equal(item.scale, undefined);
            for (const model of ['original']) assert.equal(resolveEnemy(item.id, model), null);
        }
        const sts2 = ENEMIES.filter((item) => item.source === 'sts2');
        assert.equal(sts2.length, 105);
        assert.equal(new Set(sts2.map((item) => item.sourceKey)).size, 105);
        assert.equal(ENEMIES.length, 171);
        assert.equal(new Set(ENEMIES.map((item) => item.id)).size, 171);
        assert.deepEqual(enemyCandidates({}, sts2).map((item) => item.sourceKey),
            ['Assassin Raider', 'Axe Raider', 'Brute Raider', 'Crossbow Raider', 'Tracker Raider', 'Cubex Construct', 'Flyconid', 'Fuzzy Wurm Crawler',
                'Mawler', 'Nibbit', 'Slithering Strangler', 'Snapping Jaxfruit', 'Twig Slime (S)', 'Calcified Cultist', 'Damp Cultist', 'Haunted Ship',
                'Punch Construct', 'Seapunk', 'Sewer Clam', 'Toadpole', 'Bowlbug (Rock)', 'Bowlbug (Egg)', 'Bowlbug (Nectar)',
                'Chomper', 'Mysterious Knight（事件）', 'Spiny Toad', 'Devoted Sculptor', 'Frog Knight', 'Owl Magistrate', 'Turret Operator',
                'Byrdonis', 'Skulking Colony', 'Soul Nexus', 'Lagavulin Matriarch', 'Waterfall Giant', 'Knowledge Demon']);
        assert.deepEqual(enemyCandidates({ tier: 'elite' }, ENEMIES).map((item) => item.sourceKey),
            ['Gremlin Nob', 'Lagavulin', 'Sentry', 'Taskmaster', 'Lagavulin（Dead Adventurer 已醒型）', 'Byrdonis', 'Skulking Colony', 'Soul Nexus']);
        assert.deepEqual(enemyCandidates({ tier: 'boss' }, ENEMIES).map((item) => item.sourceKey), ['The Guardian', 'Lagavulin Matriarch', 'Waterfall Giant', 'Knowledge Demon']);
        assert.ok(['折甲巨像', '酣眠石卫母', '瀑流巨人', '知识恶魔'].includes(drawEnemy({ seed: 'all-boss', tier: 'boss' })?.name));
        assert.deepEqual(SOURCE_TIER_REF, { 'sts1|normal': { hp: 31, damage: 11.5 }, 'sts1|elite': { hp: 84, damage: 14 }, 'sts1|boss': { hp: 240, damage: 32 },
            'sts2|normal': { hp: 48, damage: 11 }, 'sts2|elite': { hp: 82.5, damage: 17 }, 'sts2|boss': { hp: 222, damage: 20 } });
    });

});


describe('M3 随从表、死亡生成、异种分裂与阈值改写意图', () => {
    const kin = { imp: { name: '小鬼', maxHp: 7, skills: [guard('ig')] }, imp2: { name: '大鬼', maxHp: 9, skills: [guard('ig2')] } };
    const summon = (extra = {}) => ({ id: 'call', name: '召唤', intent: 'special', effects: [{ op: 'summon-kin', kin: ['imp'], ...extra }] });
    const kinUnits = (state) => Object.values(state.units).filter((unit) => unit.kinOf);

    it('随从字段归一化可往返；非法表、嵌套字段、脚本、效果与引用在档案及直接建局均拒收', () => {
        const data = { kin, kinScale: 1.5, deathSpawns: ['imp'] };
        const good = normalizeProfile(enemyProfile(data));
        assert.equal(good.ok, true, JSON.stringify(good.errors));
        assert.deepEqual(normalizeProfile(good.value).value, good.value);
        assert.equal(good.value.kinScale, 1.5);
        assert.deepEqual(good.value.deathSpawns, ['imp']);
        assert.equal(good.value.kin.imp.maxHp, 7);
        for (const key of ['kin', 'kinScale', 'deathSpawns']) assert.equal(Object.hasOwn(normalizeProfile(enemyProfile()).value, key), false);
        const badDefs = [null, [], { maxHp: 0, skills: [guard('ig')] }, { maxHp: 7, skills: [] },
            { maxHp: 7, skills: [guard('ig')], kin: {} }, { maxHp: 7, skills: [guard('ig')], minion: 'true' },
            { maxHp: 7, skills: [guard('ig')], art: 'unknown-art' },
            { maxHp: 7, skills: [guard('ig')], script: { opener: 'missing' } },
            { maxHp: 7, skills: [guard('ig', { effects: [{ op: 'split-into', kin: ['ghost'], hp: 'current' }] })] },
            { maxHp: 7, skills: [guard('ig', { effects: [{ op: 'split-into', kin: ['imp'], hp: 'other' }] })] },
            { maxHp: 7, skills: [guard('ig')], phases: [{ hpAtMostPct: 50, intent: 'missing' }] },
            { maxHp: 7, skills: [guard('ig')], deathSpawns: ['ghost'] }];
        const badFields = [{ kin: {} }, { kin: [] }, { kin: null }, { kinScale: 1 }, { deathSpawns: ['imp'] },
            { kin, kinScale: 0 }, { kin, kinScale: Infinity }, { kin, kinScale: 5.1 }, { kin, kinScale: '1' },
            { kin, deathSpawns: [] }, { kin, deathSpawns: Array(5).fill('imp') }, { kin, deathSpawns: ['ghost'] },
            ...['other', null, 1].map((hp) => ({ kin, skills: [guard('divide', { effects: [{ op: 'split-into', kin: ['imp'], hp }] })] })),
            { kin, skills: [guard('call', { effects: [{ op: 'summon-kin', kin: ['imp'], cap: 0 }] })] },
            { kin, skills: [guard('call', { effects: [{ op: 'summon-kin', kin: ['imp'], pick: 'other' }] })] },
            { kin: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`k${i}`, kin.imp])) },
            { kin: JSON.parse('{"__proto__":{"maxHp":7,"skills":[]}}') },
            ...badDefs.map((def) => ({ kin: { imp: def } }))];
        for (const fields of badFields) {
            assert.equal(normalizeProfile(enemyProfile(fields)).ok, false, JSON.stringify(fields));
            assert.equal(createBattle(setupWith(foeUnit(fields)), 7).ok, false, JSON.stringify(fields));
        }
    });

    it('条目换算保留随从招式与共用表，经会话建局后二次分裂且重放一致', () => {
        const split = (id, keys) => guard(id, { intent: 'special', effects: [{ op: 'split-into', kin: keys, hp: 'current' }] });
        const original = { skills: [split('divide', ['large']), skill('hit')], script: { opener: 'divide' }, kin: {
            large: { name: '大型子体', maxHp: 20, art: 'orc', skills: [split('divide', ['small', 'small']), skill('hit', { effects: [{ op: 'damage', amount: 24 }] })], script: { opener: 'divide' } },
            small: { name: '小型子体', maxHp: 7, skills: [guard('wait')], script: { cycle: ['wait'] } },
        } };
        const raw = enemy('sts1', 'fixture', 80, '分裂验证', 'normal', 'release', original, { hp: 80 });
        const before = JSON.stringify(raw);
        const library = prepareEnemyEntries([raw]);
        const item = library.entries[0];
        assert.deepEqual(library.references['sts1|normal'], { hp: 80, damage: 24 });
        const profile = materializeEnemy(item, 'original', { id: 'foe' });
        assert.equal(profile.kin.large.maxHp, Math.max(1, Math.round(20 * item.scale.hpRatio)));
        assert.equal(profile.kin.large.skills[1].effects[0].amount, Math.max(1, Math.floor(24 * item.scale.damage + 1e-9)));
        assert.equal(profile.kin.large.art, 'orc');
        const [unit] = enemyUnits({ enemies: [{ name: profile.name, count: 1 }] }, new Map([[profile.name, profile]]), 1, 'normal').units;
        assert.deepEqual(unit.kin, profile.kin);
        const run = runTurns(unit, 3);
        const children = kinUnits(run.state);
        assert.equal(run.state.units.foe.left, 'split');
        assert.equal(children.find((u) => u.kinKey === 'large').left, 'split');
        const small = children.filter((u) => u.kinKey === 'small');
        assert.equal(small.length, 2);
        for (const child of small) {
            assert.equal(child.maxHp, unit.maxHp);
            assert.deepEqual(child.kin, unit.kin);
            assert.equal(child.damageScale, unit.damageScale);
            assert.equal(child.minion === true, false);
        }
        const replayed = replayBattle(run.setup, 7, run.actions);
        assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
        assert.deepEqual(replayed.state, run.state);
        assert.deepEqual(replayed.events, run.events);
        assert.equal(JSON.stringify(raw), before);
    });

    it('缝合递归携带随从与死亡生成，同名种类按来源隔离，生命系数只折算一次', () => {
        const source = (enemyId, tag, kinScale) => ({ enemyId, profile: {
            skills: [summon(), skill('hit')], kinScale, deathSpawns: ['imp'], kin: {
                imp: { name: `${tag}大鬼`, maxHp: 8, skills: [guard('split', { effects: [{ op: 'split-into', kin: ['small', 'small'], hp: 'kin' }] })], script: { opener: 'split' }, deathSpawns: ['small'] },
                small: { name: `${tag}幼鬼`, maxHp: 3, skills: [guard('wait')] },
                unused: { name: '未取材', maxHp: 5, skills: [guard('wait')] },
            },
        } });
        const a = source('source-a', '赤', 1.5);
        const b = source('source-b', '青', 2);
        const before = JSON.stringify([a, b]);
        const kit = stitchKits([a, b].map((source) => ({ source, skill: source.profile.skills[0] })), []);
        assert.ok(kit);
        assert.equal(Object.keys(kit.kin).length, 4);
        const keys = kit.skills.map((s) => s.effects[0].kin[0]);
        assert.notEqual(keys[0], keys[1]);
        assert.deepEqual(keys.map((key) => [kit.kin[key].name, kit.kin[key].maxHp]), [['赤大鬼', 12], ['青大鬼', 16]]);
        assert.deepEqual(kit.deathSpawns, keys);
        assert.equal(Object.hasOwn(kit, 'kinScale'), false);
        for (const [index, key] of keys.entries()) {
            const def = kit.kin[key];
            const small = def.skills[0].effects[0].kin;
            assert.equal(small[0], small[1]);
            assert.deepEqual(def.deathSpawns, [small[0]]);
            assert.equal(kit.kin[small[0]].name, index ? '青幼鬼' : '赤幼鬼');
            assert.equal(kit.kin[small[0]].maxHp, index ? 6 : 5);
            assert.deepEqual(def.script, { opener: 'split' });
        }
        for (const def of [kit, ...Object.values(kit.kin)]) {
            for (const key of kitKinRefs(def)) assert.ok(Object.hasOwn(kit.kin, key), key);
        }
        const profile = normalizeProfile(enemyProfile(kit));
        assert.equal(profile.ok, true, JSON.stringify(profile.errors));
        const [unit] = enemyUnits({ enemies: [{ name: profile.value.name, count: 1 }] }, new Map([[profile.value.name, profile.value]]), 1, 'normal').units;
        const battle = createBattle(setupWith(unit), 7);
        assert.equal(battle.ok, true, JSON.stringify(battle.error));
        const overflow = source('overflow', '溢出', 1);
        overflow.profile.kin = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`u${i}`, {
            maxHp: 3, skills: [guard('wait')], ...(i < 5 ? { deathSpawns: [`u${i + 1}`] } : {}),
        }]));
        overflow.profile.skills[0].effects[0].kin = ['u0'];
        overflow.profile.deathSpawns = ['u0'];
        assert.equal(stitchKits([a, overflow].map((source) => ({ source, skill: source.profile.skills[0] })), []), null);
        const tooManyDeaths = { ...a, profile: { ...a.profile, deathSpawns: Array(5).fill('imp') } };
        assert.equal(stitchKits([{ source: tooManyDeaths, skill: tooManyDeaths.profile.skills[0] }], []), null);
        const recursive = source('recursive', '环', 1);
        recursive.profile.kin.small.deathSpawns = ['imp'];
        const loop = stitchKits([{ source: recursive, skill: recursive.profile.skills[0] }], []);
        assert.ok(loop);
        assert.equal(Object.keys(loop.kin).length, 2);
        const parentKey = loop.skills[0].effects[0].kin[0];
        assert.deepEqual(loop.kin[loop.kin[parentKey].deathSpawns[0]].deathSpawns, [parentKey]);
        assert.equal(JSON.stringify([a, b]), before);
    });
    it('生成选择保留随从字段，经真实表写口读回后可召唤且重放一致', async (t) => {
        const f = await createGenerationFixture({ chatId: 'm3-persist' });
        t.after(f.dispose);
        const tables = createCombatTables({ api: f.db.api });
        t.after(() => tables.client.dispose());
        const name = '召唤验证';
        const normalized = normalizeProfile(enemyProfile({ id: enemyIdFor(name, 'normal'), name,
            skills: [summon({ amount: 2, cap: 1 }), guard('wait')], script: { cycle: ['call', 'wait'] },
            kin, kinScale: 1.5, deathSpawns: ['imp'],
            template: { enemyId: 'en-sts1-fixture-81', model: 'original' },
        }));
        assert.equal(normalized.ok, true, JSON.stringify(normalized.errors));
        const profile = normalized.value;
        const [base] = enemyRosterEntities({ enemies: [{ name }], tier: 'normal', seed: 'm3-persist' }).entities;
        const choice = { code: 'E01', kind: 'original', enemyId: profile.template.enemyId, profile, text: describeEnemy(profile) };
        const entity = { ...base, fixed: { ...base.fixed, pool: [choice] },
            input: { ...base.input, pool: [{ code: choice.code, text: choice.text }] } };
        const generated = await generateEntities([entity], { llm: { source: 'tavern' }, request: async () =>
            JSON.stringify({ entities: [{ key: entity.key, value: { enemies: [[name, 'E01']] } }] }) });
        assert.equal(generated.ok, true, JSON.stringify(generated.rejected));
        const writes = generationWrites(generated, { createdAt: 2 });
        assert.equal(writes.profiles.length, 1);
        assert.deepEqual(writes.profiles[0].definition, profile);
        const saved = await tables.append('profile', writes.profiles);
        assert.equal(saved.ok, true, JSON.stringify(saved));
        const snapshot = normalizeSnapshot(tables.read());
        assert.equal(snapshot.ok, true, JSON.stringify(snapshot));
        assert.equal(snapshot.diagnostics.some((d) => d.code === 'combat-profile-invalid'), false);
        const restored = snapshot.profiles.get(profile.id)?.profile;
        assert.deepEqual(restored, profile);
        const [unit] = enemyUnits({ enemies: [{ name, count: 1 }] }, new Map([[name, restored]]), 1, 'normal').units;
        for (const key of ['kin', 'kinScale', 'deathSpawns']) assert.deepEqual(unit[key], restored[key]);
        const run = runTurns(unit, 4);
        const children = kinUnits(run.state);
        assert.equal(children.length, 1);
        assert.deepEqual([children[0].maxHp, children[0].minion, children[0].minionOf], [11, true, unit.id]);
        assert.deepEqual(children[0].kin, unit.kin);
        const replayed = replayBattle(run.setup, 7, run.actions);
        assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
        assert.deepEqual(replayed.state, run.state);
        assert.deepEqual(replayed.events, run.events);
    });

    it('特性池携带随从闭包，条件步技能不缝合，原版与缝合保持等量', () => {
        const caller = enemy('sts1', 'fixture', 82, '唤使验证', 'normal', 'release', {
            skills: [summon(), skill('hit'), guard('conditional', { effects: [{ op: 'summon-kin', kin: ['imp2'] }] })],
            script: { cycle: ['call', { skill: 'conditional', when: { kind: 'kin-lt', value: 1 } }, 'hit'] }, kin,
        }, { hp: 40 });
        const striker = enemy('sts1', 'fixture', 83, '打手验证', 'normal', 'release', { skills: [skill('strike')] }, { hp: 40 });
        const entries = prepareEnemyEntries([caller, striker]).entries;
        let summoned = 0;
        for (let i = 0; i < 16; i += 1) {
            const pool = enemyPool({ tier: 'normal', seed: `m3-pool-${i}` }, entries);
            assert.equal(pool.length, 4);
            assert.equal(pool.filter((item) => item.kind === 'original').length, 2);
            assert.equal(pool.filter((item) => item.kind === 'stitched').length, 2);
            for (const item of pool.filter((item) => item.kind === 'stitched')) {
                assert.equal(normalizeProfile(item.profile).ok, true);
                assert.equal(item.profile.skills.some((s) => s.name === 'conditional'), false);
                const refs = kitKinRefs(item.profile);
                for (const key of refs) assert.ok(Object.hasOwn(item.profile.kin || {}, key), key);
                if (!refs.length) continue;
                summoned += 1;
                assert.deepEqual(Object.values(item.profile.kin).map((def) => def.name), ['小鬼']);
                assert.match(item.text, /召唤小鬼/);
                assert.equal(item.text.includes(UNKNOWN_TEXT), false);
                assert.ok(item.text.length <= DESCRIBE_TEXT_MAX, item.text);
                const [unit] = enemyUnits({ enemies: [{ name: item.profile.name, count: 1 }] }, new Map([[item.profile.name, item.profile]]), 1, 'normal').units;
                const setup = setupWith(unit);
                setup.units[0].maxHp = 9999;
                const created = createBattle(setup, 7);
                assert.equal(created.ok, true, JSON.stringify(created.error));
                const run = { setup, state: created.state, actions: [], events: [...created.events] };
                for (let turn = 0; turn < 24 && !run.state.outcome && !kinUnits(run.state).length; turn += 1) {
                    const result = act(run.state);
                    run.state = result.state;
                    run.events.push(...result.events);
                    run.actions.push(END_TURN);
                }
                assert.ok(kinUnits(run.state).length > 0, JSON.stringify({ seed: i, code: item.code,
                    skills: unit.skills.map((s) => [s.id, s.name]),
                    used: run.events.filter((e) => e.type === 'skill').map((e) => [e.unitId, e.skillId]),
                    outcome: run.state.outcome, heroHp: run.state.units.hero.hp,
                    intent: run.state.intents[unit.id],
                }));
                assert.deepEqual(replayBattle(run.setup, 7, run.actions).state, run.state);
            }
        }
        assert.ok(summoned > 0, '取材必须实际覆盖召唤，而非仅校验空闭包');
        assert.deepEqual([...scriptBoundSkills(caller.original)], ['conditional']);
    });







    it('引用未登记种类、无表的死亡生成、非法系数与未知改写意图拒绝建局', () => {
        const cases = [
            [foeUnit({ skills: [summon(), guard('g')] }), 'invalid-kin'],
            [foeUnit({ kin, skills: [summon({ kin: ['ghost'] }), guard('g')] }), 'invalid-kin'],
            [foeUnit({ deathSpawns: ['imp'] }), 'invalid-kin'],
            [foeUnit({ kin, kinScale: 0 }), 'invalid-kin'],
            [foeUnit({ kinScale: 1 }), 'invalid-kin'],
            [foeUnit({ kin: { imp: { name: '小鬼', maxHp: 7, skills: [] } } }), 'missing-skills'],
            [foeUnit({ phases: [{ hpAtMostPct: 50, intent: 'nope' }] }), 'invalid-phase'],
            [foeUnit({ phases: [{ hpAtMostPct: 50, hpBelowPct: 40 }] }), 'invalid-phase'],
        ];
        for (const [foe, reason] of cases) assert.equal(createBattle(setupWith(foe), 7).error?.reason, reason, JSON.stringify(foe));
        const result = normalizeProfile(enemyProfile({ phases: [{ hpAtMostPct: 50, intent: 'nope' }] }));
        assert.equal(result.ok, false);
        assert.ok(reasons(result).includes('phases[0].intent:unknown-skill'), reasons(result).join());
        const ok = normalizeProfile(enemyProfile({ phases: [{ hpAtMostPct: 50, intent: 's2' }] }));
        assert.equal(ok.ok, true, JSON.stringify(ok.errors));
        assert.deepEqual([ok.value.phases[0].hpAtMostPct, ok.value.phases[0].intent], [50, 's2']);
    });

    it('summon-kin 按随从表召唤，同种上限生效，随召唤者退场；重放一致', () => {
        const foe = foeUnit({ kin, skills: [summon({ amount: 2, cap: 1 }), guard('g')], script: { cycle: ['call', 'g'] } });
        const run = runTurns(foe, 4);
        const imps = kinUnits(run.state);
        assert.equal(imps.length, 1);
        assert.deepEqual([imps[0].name, imps[0].maxHp, imps[0].kinKey, imps[0].minion, imps[0].minionOf], ['小鬼', 7, 'imp', true, 'foe']);
        assert.equal(run.events.filter((e) => e.type === 'minion-enter').length, 1);
        const replayed = replayBattle(run.setup, 7, run.actions);
        assert.equal(replayed.ok, true);
        assert.deepEqual(replayed.events, run.events);
    });

    it('脚本条件步按自己的随从数选招', () => {
        const foe = foeUnit({ kin, skills: [summon(), guard('g')], script: { cycle: [{ skill: 'call', when: { kind: 'kin-lt', value: 1 } }, 'g'] } });
        const run = runTurns(foe, 5);
        assert.deepEqual(run.skills.slice(0, 5), ['call', 'g', 'g', 'g', 'g']);
        assert.equal(kinUnits(run.state).length, 1);
    });

    it('倒下生成在判胜之前入场，生成单位缺省不是爪牙', () => {
        const foe = foeUnit({ maxHp: 3, kin, deathSpawns: ['imp', 'imp2'] });
        const battle = createBattle(setupWith(foe), 7);
        assert.equal(battle.ok, true, JSON.stringify(battle.error));
        const result = playNamed(battle.state, 'basic-strike');
        assert.equal(result.state.outcome ?? null, null);
        assert.equal(result.state.units.foe.alive, false);
        const spawned = kinUnits(result.state);
        assert.deepEqual(spawned.map((unit) => [unit.kinKey, unit.maxHp, unit.minion === true]), [['imp', 7, false], ['imp2', 9, false]]);
        assert.deepEqual(result.events.filter((e) => e.type === 'kin-enter').map((e) => e.cause), ['death', 'death']);
        assert.ok(spawned.every((unit) => result.state.order.includes(unit.id) && result.state.intents[unit.id]));
    });

    it('split-into 本体离场并分出异种，子体生命取当前生命或随从表', () => {
        for (const [hp, expected] of [['current', [30, 30]], ['kin', [7, 9]]]) {
            const foe = foeUnit({ hp: 30, kin, skills: [{ id: 'split', name: '分裂', intent: 'special', effects: [{ op: 'split-into', kin: ['imp', 'imp2'], hp }] }, guard('g')], script: { opener: 'split' } });
            const run = runTurns(foe, 1);
            assert.equal(run.state.units.foe.left, 'split');
            assert.equal(run.state.units.foe.alive, false);
            assert.deepEqual(kinUnits(run.state).map((unit) => unit.maxHp), expected);
            assert.equal(run.state.outcome ?? null, null);
            assert.deepEqual(run.events.find((e) => e.type === 'split').into, kinUnits(run.state).map((unit) => unit.id));
        }
    });

    it('hpAtMostPct 阶段立即改写已公示意图，插入的一招不推进脚本', () => {
        const foe = foeUnit({ maxHp: 12, skills: [guard('s1'), guard('s2'), guard('big')], script: { cycle: ['s1', 's2'] }, phases: [{ hpAtMostPct: 50, intent: 'big' }] });
        const battle = createBattle(setupWith(foe), 7);
        assert.equal(battle.ok, true, JSON.stringify(battle.error));
        assert.equal(battle.state.intents.foe.skillId, 's1');
        const hit = playNamed(battle.state, 'basic-strike');
        assert.ok(hit.state.units.foe.hp * 2 <= hit.state.units.foe.maxHp, `生命 ${hit.state.units.foe.hp}`);
        assert.equal(hit.state.intents.foe.skillId, 'big');
        assert.ok(hit.events.some((e) => e.type === 'intent' && e.unitId === 'foe' && e.skillId === 'big'));
        let state = hit.state;
        const used = [];
        for (let i = 0; i < 3; i += 1) {
            const result = act(state);
            used.push(...result.events.filter((e) => e.type === 'skill' && e.unitId === 'foe').map((e) => e.skillId));
            state = result.state;
        }
        assert.deepEqual(used.slice(0, 3), ['big', 's1', 's2']);
        assert.equal(Object.hasOwn(state.units.foe, 'pendingIntent'), false);
    });

    it('cycle 随机节点避开冷却中与连用到上限的候选', () => {
        const foe = foeUnit({ skills: [guard('a', { cooldown: 1 }), guard('b')], script: { cycle: [[{ skill: 'a', weight: 1 }, { skill: 'b', weight: 1 }]] } });
        const { skills } = runTurns(foe, 12);
        assert.ok(skills.length >= 10);
        for (let i = 1; i < skills.length; i += 1) assert.ok(!(skills[i] === 'a' && skills[i - 1] === 'a'), skills.join());
        for (let i = 2; i < skills.length; i += 1) assert.ok(!(skills[i] === 'b' && skills[i - 1] === 'b' && skills[i - 2] === 'b'), skills.join());
    });
});


describe('M4 睡眠与唤醒', () => {
    const zz = () => ({ id: 'zz', name: '沉睡', intent: 'idle', effects: [{ op: 'idle' }] });
    const sleeper = (sleep = {}) => foeUnit({
        skills: [zz(), guard('atk')],
        passives: [openingStatus('plating', 5)],
        script: { cycle: ['atk'], sleep: { skill: 'zz', turns: 2, shed: ['plating'], groggy: true, ...sleep } },
    });

    it('档案与建局校验：睡眠技能须存在，阶段脚本不收睡眠，非法字段拒收', () => {
        const ok = normalizeProfile(enemyProfile({ skills: [zz(), skill('s1')], script: { cycle: ['s1'], sleep: { skill: 'zz', turns: 3, shed: ['plating'], groggy: true } } }));
        assert.equal(ok.ok, true, JSON.stringify(ok.errors));
        assert.deepEqual(ok.value.script.sleep, { skill: 'zz', turns: 3, shed: ['plating'], groggy: true });
        const bad = normalizeProfile(enemyProfile({ script: { cycle: ['s1'], sleep: { skill: 'nope', turns: 9, groggy: false } } }));
        assert.equal(bad.ok, false);
        const issues = reasons(bad);
        for (const issue of ['script.sleep.skill:unknown-skill', 'script.sleep.turns:out-of-range', 'script.sleep.groggy:invalid-enum']) assert.ok(issues.includes(issue), issues.join());
        const phased = normalizeProfile(enemyProfile({ phases: [{ hpBelowPct: 50, script: { cycle: ['s1'], sleep: { skill: 's1', turns: 1 } } }] }));
        assert.ok(reasons(phased).includes('phases[0].script.sleep:unknown-field'), reasons(phased).join());
        assert.equal(createBattle(setupWith(sleeper({ turns: 0 })), 7).error?.reason, 'invalid-script');
        assert.equal(createBattle(setupWith(foeUnit({ phases: [{ afterTurns: 2, script: { cycle: ['s1'], sleep: { skill: 's1', turns: 1 } } }] })), 7).error?.reason, 'invalid-script');
    });

    it('无人打扰时睡满层数自然醒来，醒来卸下镀甲，随即按脚本行动；重放一致', () => {
        const run = runTurns(sleeper(), 5);
        assert.deepEqual(run.skills.slice(0, 4), ['zz', 'zz', 'atk', 'atk']);
        const wakes = run.events.filter((e) => e.type === 'wake');
        assert.deepEqual(wakes.map((e) => e.cause), ['natural']);
        assert.equal(run.state.units.foe.statuses.asleep ?? 0, 0);
        assert.equal(run.state.units.foe.statuses.plating ?? 0, 0);
        assert.equal(run.state.scripts?.foe?.step ?? 0, 0);
        const replayed = replayBattle(run.setup, 7, run.actions);
        assert.deepEqual(replayed.events, run.events);
    });

    it('失去生命即惊醒并立刻改写意图；groggy 时晕厥一次再行动', () => {
        const battle = createBattle(setupWith(sleeper()), 7);
        assert.equal(battle.ok, true, JSON.stringify(battle.error));
        assert.equal(battle.state.intents.foe.skillId, 'zz');
        const hit = playNamed(battle.state, 'basic-strike');
        assert.deepEqual(hit.events.filter((e) => e.type === 'wake').map((e) => e.cause), ['hurt']);
        assert.equal(hit.state.intents.foe.skillId, 'atk');
        assert.equal(hit.state.units.foe.statuses.stun, 1);
        let state = hit.state;
        const used = [];
        const stunned = [];
        for (let i = 0; i < 3; i += 1) {
            const result = act(state);
            used.push(...result.events.filter((e) => e.type === 'skill' && e.unitId === 'foe').map((e) => e.skillId));
            stunned.push(...result.events.filter((e) => e.type === 'stunned' && e.unitId === 'foe'));
            state = result.state;
        }
        assert.equal(stunned.length, 1);
        assert.deepEqual(used.slice(0, 2), ['atk', 'atk']);
        assert.ok(!used.includes('zz'));
    });

    it('格挡完全吸收的攻击不惊醒', () => {
        const foe = sleeper({ groggy: undefined });
        foe.passives = [{ id: 'wall', name: '壁', trigger: 'battle-start', effects: [{ op: 'block', amount: 30, target: 'self' }] }];
        const battle = createBattle(setupWith(foe), 7);
        assert.equal(battle.ok, true, JSON.stringify(battle.error));
        const hit = playNamed(battle.state, 'basic-strike');
        assert.equal(hit.events.some((e) => e.type === 'wake'), false);
        assert.equal(hit.state.units.foe.statuses.asleep, 2);
        assert.equal(hit.state.intents.foe.skillId, 'zz');
    });

    it('hurt: tick 时每次失血减 1 层，减完才醒；回合结束仍自然减层', () => {
        const foe = sleeper({ turns: 2, hurt: 'tick', groggy: undefined });
        const battle = battleWithTraits(foe);
        assert.equal(battle.state.units.foe.statuses.asleep, 2);
        const first = playNamed(battle.state, 'basic-strike');
        assert.equal(first.events.some((e) => e.type === 'wake'), false);
        assert.equal(first.state.units.foe.statuses.asleep, 1);
        assert.equal(first.state.intents.foe.skillId, 'zz');
        const second = playNamed(first.state, 'basic-strike');
        assert.deepEqual(second.events.filter((e) => e.type === 'wake').map((e) => e.cause), ['hurt']);
        assert.equal(second.state.units.foe.statuses.asleep ?? 0, 0);
        assert.equal(second.state.units.foe.statuses.stun ?? 0, 0);
        assert.equal(second.state.intents.foe.skillId, 'atk');
        const ticked = act(battleWithTraits(sleeper({ turns: 3, hurt: 'tick' })).state);
        assert.equal(ticked.state.units.foe.statuses.asleep, 2);
    });

    it('档案与建局对 hurt、shed 与多余字段同样拒收', () => {
        const bad = normalizeProfile(enemyProfile({ skills: [zz(), skill('s1')], script: { cycle: ['s1'], sleep: { skill: 'zz', turns: 2, hurt: 'nap', shed: ['nope'], extra: 1 } } }));
        const issues = reasons(bad);
        for (const issue of ['script.sleep.hurt:invalid-enum', 'script.sleep.shed[0]:invalid-enum', 'script.sleep.extra:unknown-field']) assert.ok(issues.includes(issue), issues.join());
        const ok = normalizeProfile(enemyProfile({ skills: [zz(), skill('s1')], script: { cycle: ['s1'], sleep: { skill: 'zz', turns: 2, hurt: 'tick' } } }));
        assert.equal(ok.ok, true, JSON.stringify(ok.errors));
        assert.equal(ok.value.script.sleep.hurt, 'tick');
        for (const sleep of [{ hurt: 'nap' }, { shed: ['nope'] }, { extra: 1 }, { shed: [] }]) {
            assert.equal(createBattle(setupWith(sleeper(sleep)), 7).error?.reason, 'invalid-script', JSON.stringify(sleep));
        }
        assert.equal(createBattle(setupWith(sleeper({ hurt: 'tick' })), 7).ok, true);
    });
    it('酣眠石卫条目：睡满 3 回合自然醒后重击、重击、汲魂循环，醒来卸下金属化；重放一致', () => {
        const profile = materializeEnemy(ENEMIES.find((e) => e.sourceKey === 'Lagavulin'), 'original');
        const foe = foeUnit({ skills: profile.skills, script: profile.script, passives: profile.passives });
        const created = createBattle(setupWith(foe), 7);
        assert.equal(created.ok, true, JSON.stringify(created.error));
        assert.equal(created.state.units.foe.statuses.metallicize, 8);
        assert.equal(created.state.units.foe.statuses.plated ?? 0, 0);
        assert.equal(created.state.units.foe.statuses.asleep, 3);
        const dozing = runTurns(foe, 2);
        assert.equal(dozing.state.units.foe.statuses.metallicize, 8);
        assert.equal(dozing.state.units.foe.block, 8);
        const run = runTurns(foe, 6);
        assert.deepEqual(run.skills, ['sleep', 'sleep', 'sleep', 'attack', 'attack', 'siphon']);
        assert.deepEqual(run.events.filter((e) => e.type === 'wake').map((e) => e.cause), ['natural']);
        assert.equal(run.state.units.foe.statuses.metallicize ?? 0, 0);
        assert.deepEqual(replayBattle(run.setup, 7, run.actions).events, run.events);
    });
    it('酣眠石卫母条目：开场镀甲12、睡满3回合自然醒（不晕厥）后斩击、剖腹，醒来卸下镀甲；重放一致', () => {
        const profile = materializeEnemy(ENEMIES.find((e) => e.sourceKey === 'Lagavulin Matriarch'), 'original');
        const foe = foeUnit({ skills: profile.skills, script: profile.script, passives: profile.passives });
        const created = createBattle(setupWith(foe), 7);
        assert.equal(created.ok, true, JSON.stringify(created.error));
        assert.equal(created.state.units.foe.statuses.plating, 12);
        assert.equal(created.state.units.foe.statuses.asleep, 3);
        const run = runTurns(foe, 5);
        assert.deepEqual(run.skills, ['sleep', 'sleep', 'sleep', 'slash', 'disembowel']);
        assert.deepEqual(run.events.filter((e) => e.type === 'wake').map((e) => e.cause), ['natural']);
        assert.equal(run.state.units.foe.statuses.plating ?? 0, 0);
        assert.equal(run.state.units.foe.statuses.stun ?? 0, 0);
        assert.deepEqual(replayBattle(run.setup, 7, run.actions).events, run.events);
    });


});


describe('M4 事件打断意图', () => {
    const hit = testCard('hit', 'attack', [{ op: 'damage', amount: 6 }]);
    const hitter = () => traitHero(Array(5).fill(hit));
    const idle = (id) => ({ id, name: id, intent: 'idle', effects: [{ op: 'idle' }] });
    const interruptFoe = (interrupts, extra = {}) => foeUnit({
        skills: [guard('atk'), idle('down'), guard('butt'), { id: 'fly', name: 'fly', intent: 'buff', effects: [statusEffect('flying', 1)] }],
        script: { cycle: ['atk'], interrupts },
        ...extra,
    });
    const foeSkills = (events) => events.filter((e) => e.type === 'skill' && e.unitId === 'foe').map((e) => e.skillId);

    it('档案与建局校验：字段约束一致，阶段脚本不收，序列技能须存在', () => {
        const base = { skills: [skill('s1'), skill('s2')] };
        const ok = normalizeProfile(enemyProfile({ ...base, script: { cycle: ['s1'], interrupts: [{ on: 'hp-lost', amount: 30, step: 10, seq: ['s2'], block: 20 }] } }));
        assert.equal(ok.ok, true, JSON.stringify(ok.errors));
        assert.deepEqual(ok.value.script.interrupts, [{ on: 'hp-lost', amount: 30, step: 10, seq: ['s2'], block: 20 }]);
        const bad = normalizeProfile(enemyProfile({ ...base, script: { cycle: ['s1'], interrupts: [{ on: 'status-lost', seq: ['zz'], amount: 3, once: false, x: 1 }] } }));
        const issues = reasons(bad);
        for (const issue of ['script.interrupts[0].status:invalid-enum', 'script.interrupts[0].amount:unknown-field', 'script.interrupts[0].once:invalid-enum', 'script.interrupts[0].x:unknown-field', 'script.interrupts[0].seq[0]:unknown-skill']) {
            assert.ok(issues.includes(issue), issues.join());
        }
        const phased = normalizeProfile(enemyProfile({ ...base, phases: [{ hpBelowPct: 50, script: { cycle: ['s1'], interrupts: [{ on: 'block-broken', seq: ['s2'] }] } }] }));
        assert.ok(reasons(phased).includes('phases[0].script.interrupts:unknown-field'), reasons(phased).join());
        const reject = (interrupts) => createBattle(setupWith(interruptFoe(interrupts)), 7).error?.reason;
        assert.equal(reject([{ on: 'status-lost', status: 'flying', seq: ['nope'] }]), 'invalid-script');
        assert.equal(reject([{ on: 'hp-lost', seq: ['down'] }]), 'invalid-script');
        assert.equal(reject([{ on: 'block-broken', amount: 3, seq: ['down'] }]), 'invalid-script');
        assert.equal(reject([{ on: 'block-broken', seq: ['down'], extra: 1 }]), 'invalid-script');
        assert.equal(reject([]), 'invalid-script');
        assert.equal(createBattle(setupWith(interruptFoe([{ on: 'block-broken', seq: ['down'] }])), 7).ok, true);
    });

    it('打断 main 与甲层14在档案、直接建局均接受，非法值拒收；旧字段不自动补写', () => {
        const skills = [guard('atk'), idle('down')];
        for (const then of [undefined, 'restart', 'main']) {
            const rule = { on: 'status-lost', status: 'plated', seq: ['down'], ...(then ? { then } : {}) };
            const fields = { skills, passives: [openingStatus('plated', 14)], script: { cycle: ['atk'], interrupts: [rule] } };
            const profile = normalizeProfile(enemyProfile(fields));
            assert.equal(profile.ok, true, JSON.stringify(profile.errors));
            assert.deepEqual(profile.value.script.interrupts[0], rule);
            assert.deepEqual(normalizeProfile(profile.value).value, profile.value);
            const battle = createBattle(setupWith(foeUnit(fields)), 7);
            assert.equal(battle.ok, true, JSON.stringify(battle.error));
            assert.equal(battle.state.units.foe.statuses.plated, 14);
        }
        for (const then of ['other', '', false, null]) {
            const fields = { skills, script: { cycle: ['atk'], interrupts: [{ on: 'block-broken', seq: ['down'], then }] } };
            const profile = normalizeProfile(enemyProfile(fields));
            assert.equal(profile.ok, false);
            assert.ok(reasons(profile).includes('script.interrupts[0].then:invalid-enum'));
            assert.equal(createBattle(setupWith(foeUnit(fields)), 7).error?.reason, 'invalid-script');
        }
        for (const stacks of [0, 15, 1.5]) {
            const fields = { skills, passives: [openingStatus('plated', stacks)] };
            assert.equal(normalizeProfile(enemyProfile(fields)).ok, false);
            assert.equal(createBattle(setupWith(foeUnit(fields)), 7).ok, false);
        }
    });

    it('状态被打光（击落）：立即改写意图为序列首招，依次出完后脚本从首招重来；重放一致', () => {
        const foe = interruptFoe([{ on: 'status-lost', status: 'flying', seq: ['down', 'butt', 'fly'], then: 'restart', unstun: true }], { passives: [openingStatus('flying', 1)] });
        const battle = battleWithTraits(foe, hitter());
        assert.equal(battle.state.intents.foe.skillId, 'atk');
        const shot = playNamed(battle.state, 'hit');
        assert.equal(shot.state.units.foe.statuses.flying ?? 0, 0);
        assert.deepEqual(shot.events.filter((e) => e.type === 'interrupt').map((e) => e.on), ['status-lost']);
        assert.equal(shot.state.units.foe.statuses.stun ?? 0, 0);
        assert.equal(shot.state.intents.foe.skillId, 'down');
        let state = shot.state;
        const events = [...shot.events];
        for (let i = 0; i < 4; i += 1) {
            const result = act(state);
            events.push(...result.events);
            state = result.state;
        }
        assert.deepEqual(foeSkills(events).slice(0, 4), ['down', 'butt', 'fly', 'atk']);
        assert.equal(state.units.foe.statuses.flying, 1);
        assert.equal(state.units.foe.res?.interrupt, undefined);
        const inst = battle.state.piles.hero.hand.find((key) => battle.state.cards[key].cardId === 'hit');
        const replayed = replayBattle(battle.setup, 7, [{ type: 'play', inst, targetId: 'foe' }, END_TURN, END_TURN, END_TURN, END_TURN]);
        assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
        assert.deepEqual(replayed.state, state);
    });

    it('格挡被打空（破甲）：once 每场一次，移除指定状态；要求的状态不在时不触发', () => {
        const wall = { id: 'wall', name: '壁', trigger: 'battle-start', effects: [{ op: 'block', amount: 3, target: 'self' }] };
        const foe = interruptFoe([{ on: 'block-broken', seq: ['down'], once: true, shed: ['plating'] }], { passives: [wall, openingStatus('plating', 2)] });
        const battle = battleWithTraits(foe, hitter());
        const first = playNamed(battle.state, 'hit');
        assert.equal(first.events.filter((e) => e.type === 'interrupt').length, 1);
        assert.equal(first.state.units.foe.statuses.plating ?? 0, 0);
        assert.equal(first.state.intents.foe.skillId, 'down');
        assert.deepEqual(first.state.units.foe.res.interruptFired, { 0: 1 });
        let state = act(first.state).state;
        assert.equal(state.intents.foe.skillId, 'atk');
        state = act(state).state;
        assert.ok(state.units.foe.block > 0);
        const again = playNamed(state, 'hit');
        assert.equal(again.events.some((e) => e.type === 'interrupt'), false);
        const gated = interruptFoe([{ on: 'block-broken', status: 'plating', seq: ['down'] }], { passives: [wall] });
        const quiet = playNamed(battleWithTraits(gated, hitter()).state, 'hit');
        assert.equal(quiet.events.some((e) => e.type === 'interrupt'), false);
    });

    it('累计失血达阈值（切形态）：阈值按已触发次数递增，序列进行中不累计，触发时获得格挡', () => {
        const foe = interruptFoe([{ on: 'hp-lost', amount: 5, step: 10, seq: ['down'], block: 4 }], { maxHp: 99 });
        const battle = battleWithTraits(foe, hitter());
        const first = playNamed(battle.state, 'hit');
        assert.equal(first.events.filter((e) => e.type === 'interrupt').length, 1);
        assert.equal(first.state.units.foe.block, 4);
        assert.equal(first.state.intents.foe.skillId, 'down');
        const during = playNamed(first.state, 'hit');
        assert.equal(during.events.some((e) => e.type === 'interrupt'), false);
        assert.equal(during.state.units.foe.res.hpTally, undefined);
        let state = act(during.state).state;
        assert.equal(state.units.foe.res?.interrupt, undefined);
        const fired = [];
        for (let i = 0; i < 3; i += 1) {
            const result = playNamed(state, 'hit');
            fired.push(result.events.filter((e) => e.type === 'interrupt').length);
            state = result.state;
        }
        assert.deepEqual(fired, [0, 0, 1]);
        assert.deepEqual(state.units.foe.res.interruptFired, { 0: 2 });
    });

    it('rearm：档案与建局都只收 1 至序列长度-1', () => {
        const base = { skills: [skill('s1'), skill('s2'), skill('s3')] };
        const ok = normalizeProfile(enemyProfile({ ...base, script: { cycle: ['s1'], interrupts: [{ on: 'hp-lost', amount: 9, seq: ['s2', 's3'], rearm: 1 }] } }));
        assert.equal(ok.ok, true, JSON.stringify(ok.errors));
        assert.equal(ok.value.script.interrupts[0].rearm, 1);
        for (const [seq, rearm] of [[['s2'], 1], [['s2', 's3'], 2], [['s2', 's3'], 0]]) {
            const bad = normalizeProfile(enemyProfile({ ...base, script: { cycle: ['s1'], interrupts: [{ on: 'hp-lost', amount: 9, seq, rearm }] } }));
            assert.ok(reasons(bad).includes('script.interrupts[0].rearm:out-of-range'), `${seq} ${rearm} ${reasons(bad).join()}`);
        }
        const reject = (interrupts) => createBattle(setupWith(interruptFoe(interrupts)), 7).error?.reason;
        assert.equal(reject([{ on: 'hp-lost', amount: 9, seq: ['down', 'butt'], rearm: 2 }]), 'invalid-script');
        assert.equal(reject([{ on: 'hp-lost', amount: 9, seq: ['down'], rearm: 1 }]), 'invalid-script');
        assert.equal(createBattle(setupWith(interruptFoe([{ on: 'hp-lost', amount: 9, seq: ['down', 'butt'], rearm: 1 }])), 7).ok, true);
    });

    it('折甲巨像条目：累计失血达 Mode Shift 转防御形态（格挡、尖壳），双重猛击卸壳后恢复计数且阈值递增，序列出完从蓄能重启；重放一致', () => {
        const profile = materializeEnemy(ENEMIES.find((e) => e.sourceKey === 'The Guardian'), 'original');
        const [rule] = profile.script.interrupts;
        assert.deepEqual([rule.seq, rule.rearm, rule.then], [['defensive', 'roll', 'twin', 'whirl'], 3, 'restart']);
        const guardian = () => foeUnit({ maxHp: 300, skills: profile.skills, script: profile.script, passives: profile.passives });
        const battle = battleWithTraits(guardian(), hitter());
        const actions = [];
        let state = battle.state;
        const events = [];
        const play = () => {
            const inst = state.piles.hero.hand.find((key) => state.cards[key].cardId === 'hit');
            const result = act(state, { type: 'play', inst, targetId: 'foe' });
            actions.push({ type: 'play', inst, targetId: 'foe' });
            events.push(...result.events);
            state = result.state;
            return result;
        };
        const endTurn = () => {
            const result = act(state);
            actions.push(END_TURN);
            events.push(...result.events);
            state = result.state;
            return result;
        };
        const hitsTo = (amount) => Math.ceil(amount / 6);
        for (let i = 0; i < hitsTo(rule.amount) - 1; i += 1) assert.equal(play().events.some((e) => e.type === 'interrupt'), false);
        const shift = play();
        assert.equal(shift.events.filter((e) => e.type === 'interrupt').length, 1);
        assert.equal(state.units.foe.block, rule.block);
        assert.equal(state.intents.foe.skillId, 'defensive');
        endTurn();
        assert.equal(state.units.foe.statuses.barbed, 3);
        const before = state.units.hero.hp;
        const pricked = play();
        assert.equal(pricked.events.some((e) => e.type === 'interrupt'), false, '防御序列中不累计');
        assert.equal(before - state.units.hero.hp, 3, '尖壳每张攻击牌反伤一次');
        endTurn();
        endTurn();
        assert.equal(state.units.foe.statuses.barbed ?? 0, 0, '双重猛击卸下尖壳');
        assert.equal(state.units.foe.res.interrupt.pos, 3);
        assert.equal(state.intents.foe.skillId, 'whirl');
        endTurn();
        endTurn();
        assert.deepEqual(foeSkills(events), ['defensive', 'roll', 'twin', 'whirl', 'charge']);
        assert.equal(state.units.foe.res?.interrupt, undefined);
        assert.equal(state.intents.foe.skillId, 'bash');
        assert.deepEqual(replayBattle(battle.setup, 7, actions).state, state);

        const again = battleWithTraits(guardian(), hitter());
        state = again.state;
        actions.length = 0;
        for (let i = 0; i < hitsTo(rule.amount); i += 1) play();
        endTurn();
        endTurn();
        endTurn();
        assert.equal(state.intents.foe.skillId, 'whirl');
        const second = rule.amount + rule.step;
        const blocked = state.units.foe.block;
        let fired = 0;
        for (let i = 0; i < hitsTo(second + blocked) && !fired; i += 1) fired = play().events.filter((e) => e.type === 'interrupt').length;
        assert.equal(fired, 1, '双重猛击后恢复计数，第二次阈值递增');
        assert.deepEqual(state.units.foe.res.interruptFired, { 0: 2 });
        assert.equal(state.intents.foe.skillId, 'defensive');
        assert.deepEqual(replayBattle(again.setup, 7, actions).state, state);
    });
});


describe('M4 归零重生', () => {
    const big = testCard('big', 'attack', [{ op: 'damage', amount: 50 }]);
    const heavy = () => traitHero(Array(5).fill(big));
    const rebornFoe = (phases, extra = {}) => foeUnit({ maxHp: 30, skills: [guard('atk'), guard('p2')], script: { cycle: ['atk'] }, phases, ...extra });

    it('档案与建局校验：onDefeat 与其他触发互斥，maxHpPct/clear/shed 只属归零重生阶段', () => {
        const ok = normalizeProfile(enemyProfile({ phases: [{ onDefeat: true, maxHpPct: 200, clear: 'debuffs', shed: ['strength'], addSkills: [skill('p1')], script: { cycle: ['p1'] } }] }));
        assert.equal(ok.ok, true, JSON.stringify(ok.errors));
        assert.equal(ok.value.phases[0].onDefeat, true);
        assert.equal(Object.hasOwn(ok.value.phases[0], 'hpBelowPct'), false);
        const bad = normalizeProfile(enemyProfile({ phases: [{ onDefeat: true, hpBelowPct: 50, maxHpPct: 900, clear: 'none' }, { hpBelowPct: 40, maxHpPct: 100 }] }));
        const issues = reasons(bad);
        for (const issue of ['phases[0].onDefeat:phase-trigger-conflict', 'phases[0].maxHpPct:out-of-range', 'phases[0].clear:invalid-enum', 'phases[1].maxHpPct:unknown-field']) assert.ok(issues.includes(issue), issues.join());
        for (const phase of [{ onDefeat: false }, { onDefeat: true, afterTurns: 2 }, { onDefeat: true, maxHpPct: 5 }, { onDefeat: true, clear: 'x' }, { onDefeat: true, shed: ['nope'] }, { hpBelowPct: 50, clear: 'all' }]) {
            assert.equal(createBattle(setupWith(rebornFoe([phase])), 7).error?.reason, 'invalid-phase', JSON.stringify(phase));
        }
        const plain = createBattle(setupWith(rebornFoe([{ onDefeat: true }])), 7);
        assert.equal(plain.ok, true, JSON.stringify(plain.error));
        assert.equal(plain.state.units.foe.phases.length, 0);
        assert.equal(plain.state.units.foe.rebirthsApplied, 0);
        const old = createBattle(setupWith(foeUnit({ phases: [{ hpBelowPct: 50 }] })), 7);
        for (const key of ['rebirths', 'rebirthsApplied']) assert.equal(Object.hasOwn(old.state.units.foe, key), false);
    });

    it('致命伤害转下一形态：不倒下、不算击杀，按比例改最大生命并回满，清全部状态，换脚本与意图；用完后正常倒下', () => {
        const foe = rebornFoe([{ onDefeat: true, maxHpPct: 200, script: { cycle: ['p2'] } }], { passives: [openingStatus('strength', 3)] });
        const hero = { ...heavy(), passives: [{ id: 'kill-growth', name: '击杀成长', trigger: 'kill', effects: [statusEffect('strength', 1)] }] };
        const battle = battleWithTraits(foe, hero);
        assert.equal(battle.state.units.foe.statuses.strength, 3);
        const first = playNamed(battle.state, 'big');
        const unit = first.state.units.foe;
        assert.equal(unit.alive, true);
        assert.equal(unit.maxHp, 60);
        assert.equal(unit.hp, 60);
        assert.equal(unit.statuses.strength ?? 0, 0);
        assert.equal(first.state.outcome ?? null, null);
        assert.equal(first.events.some((e) => e.type === 'defeated'), false);
        assert.deepEqual(first.events.filter((e) => e.type === 'rebirth').map((e) => e.hp), [60]);
        assert.equal(first.events.filter((e) => e.type === 'phase' && e.trigger === 'defeat').length, 1);
        assert.equal(first.state.units.hero.statuses.strength ?? 0, 0);
        assert.equal(first.state.intents.foe.skillId, 'p2');
        const second = playNamed(first.state, 'big');
        assert.equal(second.state.units.foe.alive, true);
        const third = playNamed(second.state, 'big');
        assert.equal(third.state.units.foe.alive, false);
        assert.equal(third.state.outcome, 'victory');
        assert.equal(third.events.filter((e) => e.type === 'defeated' && e.unitId === 'foe').length, 1);
    });

   it('clear: debuffs 保留增益只清减益，shed 另行移除；重放一致', () => {
        const poke = testCard('poke', 'skill', [statusEffect('weak', 2, 'enemy')]);
        const hero = traitHero([poke, ...Array(4).fill(big)]);
        const foe = rebornFoe([{ onDefeat: true, clear: 'debuffs', shed: ['thorns'] }], { passives: [openingStatus('strength', 2), openingStatus('ritual', 1), { id: 'spikes', name: '刺', trigger: 'battle-start', effects: [{ op: 'status', status: 'thorns', stacks: 1 }] }] });
        const battle = battleWithTraits(foe, hero);
        const weakened = playNamed(battle.state, 'poke');
        assert.ok((weakened.state.units.foe.statuses.weak || 0) > 0);
        const reborn = playNamed(weakened.state, 'big');
        const statuses = reborn.state.units.foe.statuses;
        assert.equal(statuses.weak ?? 0, 0);
        assert.equal(statuses.thorns ?? 0, 0);
        assert.equal(statuses.strength, 2);
        assert.equal(statuses.ritual, 1);
        const insts = (state, id) => state.piles.hero.hand.find((key) => state.cards[key].cardId === id);
        const actions = [{ type: 'play', inst: insts(battle.state, 'poke'), targetId: 'foe' }, { type: 'play', inst: insts(weakened.state, 'big'), targetId: 'foe' }];
        const replayed = replayBattle(battle.setup, 7, actions);
        assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
        assert.deepEqual(replayed.state, reborn.state);
    });
});

describe('M4 致死转爆炸、受击重掷、概率插招', () => {
    const big = testCard('big', 'attack', [{ op: 'damage', amount: 50 }]);
    const tap = testCard('tap', 'attack', [{ op: 'damage', amount: 3 }]);
    const foeSkills = (events) => events.filter((e) => e.type === 'skill' && e.unitId === 'foe').map((e) => e.skillId);

    it('致死转爆炸：持有 needs 状态时转「将爆」不再失血，下回合按记下的层数爆炸后自毁；不持有时正常倒下', () => {
        const boom = { id: 'boom', name: 'boom', intent: 'attack', effects: [{ op: 'release' }, { op: 'self-destruct' }] };
        const steam = { id: 'steam', name: '蒸汽', trigger: 'battle-start', effects: [{ op: 'status', status: 'thorns', stacks: 7 }] };
        const phase = { onDefeat: true, needs: 'thorns', brace: true, addSkills: [boom], intent: 'boom' };
        const profile = normalizeProfile(enemyProfile({ phases: [{ ...phase, addSkills: [boom] }] }));
        assert.equal(profile.ok, true, JSON.stringify(profile.errors));
        assert.ok(reasons(normalizeProfile(enemyProfile({ phases: [{ hpBelowPct: 50, needs: 'thorns', brace: true }] }))).includes('phases[0].needs:unknown-field'));
        assert.equal(createBattle(setupWith(foeUnit({ phases: [{ onDefeat: true, brace: false }] })), 7).error?.reason, 'invalid-phase');
        const foe = foeUnit({ maxHp: 30, skills: [guard('atk')], script: { cycle: ['atk'] }, passives: [steam], phases: [phase] });
        const battle = battleWithTraits(foe, traitHero([big, tap, tap, tap, tap]));
        const blown = playNamed(battle.state, 'big');
        const unit = blown.state.units.foe;
        assert.equal(unit.alive, true);
        assert.equal(unit.statuses['about-to-blow'], 1);
        assert.equal(unit.statuses.thorns ?? 0, 0);
        assert.equal(unit.res.stored, 7);
        assert.equal(blown.state.intents.foe.skillId, 'boom');
        const poked = playNamed(blown.state, 'tap');
        assert.equal(poked.state.units.foe.hp, unit.hp);
        const ended = act(poked.state);
        assert.ok(ended.events.some((e) => e.type === 'damage' && e.target === 'hero' && e.amount === 7));
        assert.equal(ended.state.units.foe.alive, false);
        assert.equal(ended.state.outcome, 'victory');
        const dry = foeUnit({ maxHp: 30, skills: [guard('atk')], script: { cycle: ['atk'] }, phases: [phase] });
        const plain = playNamed(battleWithTraits(dry, traitHero([big])).state, 'big');
        assert.equal(plain.state.units.foe.alive, false);
        assert.equal(plain.events.some((e) => e.type === 'rebirth'), false);
    });
    it('瀑流巨人条目：增压后被击杀转「将爆」，下次出手按蒸汽存量爆炸后自毁；未蓄汽时正常倒下；重放一致', () => {
        const profile = materializeEnemy(ENEMIES.find((e) => e.sourceKey === 'Waterfall Giant'), 'original');
        const giant = () => foeUnit({ maxHp: 30, template: profile.template, skills: profile.skills, script: profile.script, phases: profile.phases });
        const battle = battleWithTraits(giant(), traitHero([big, tap, tap, tap, tap]));
        assert.equal(battle.state.intents.foe.skillId, 'pressurize');
        const t1 = act(battle.state);
        assert.deepEqual(foeSkills(t1.events), ['pressurize']);
        const steam = t1.state.units.foe.statuses.steam;
        assert.ok(steam > 0);
        const blown = playNamed(t1.state, 'big');
        assert.equal(blown.state.units.foe.alive, true);
        assert.equal(blown.state.units.foe.statuses['about-to-blow'], 1);
        assert.equal(blown.state.units.foe.statuses.steam ?? 0, 0);
        assert.equal(blown.state.units.foe.res.stored, steam);
        assert.equal(blown.state.intents.foe.skillId, 'explode');
        assert.deepEqual(describeIntent(blown.state, 'foe').kinds, ['explode']);
        assert.equal(describeIntent(blown.state, 'foe').damage, steam);
        assert.deepEqual(describeIntent(blown.state, 'foe').attacks, [{ damage: steam, hits: 1, target: 'enemy' }]);
        const ended = act(blown.state);
        assert.ok(ended.events.some((e) => e.type === 'damage' && e.target === 'hero' && e.amount === steam));
        assert.equal(ended.state.units.foe.alive, false);
        assert.equal(ended.state.outcome, 'victory');
        const inst = t1.state.piles.hero.hand.find((key) => t1.state.cards[key].cardId === 'big');
        assert.deepEqual(replayBattle(battle.setup, 7, [END_TURN, { type: 'play', inst, targetId: 'foe' }, END_TURN]).state, ended.state);
        const dry = playNamed(battleWithTraits(giant(), traitHero([big])).state, 'big');
        assert.equal(dry.state.units.foe.alive, false);
        assert.equal(dry.events.some((e) => e.type === 'rebirth'), false);
    });

    it('受击重掷：受到对方攻击伤害后在其出手结束时避开当前意图重选；未受伤不重掷', () => {
        const node = [{ skill: 'g1', weight: 1 }, { skill: 'g2', weight: 1 }];
        const foe = foeUnit({ maxHp: 99, skills: [guard('g1'), guard('g2')], script: { cycle: [node], reroll: true } });
        assert.equal(normalizeProfile(enemyProfile({ script: { cycle: ['s1'], reroll: false } })).ok, false);
        assert.equal(createBattle(setupWith(foeUnit({ script: { cycle: ['s1'], reroll: 1 } })), 7).error?.reason, 'invalid-script');
        const battle = battleWithTraits(foe, traitHero([tap, tap, tap]));
        const before = battle.state.intents.foe.skillId;
        const hit = playNamed(battle.state, 'tap');
        assert.equal(hit.events.filter((e) => e.type === 'reroll' && e.unitId === 'foe').length, 1);
        assert.notEqual(hit.state.intents.foe.skillId, before);
        const walled = foeUnit({ ...foe, passives: [{ id: 'wall', name: '壁', trigger: 'battle-start', effects: [{ op: 'block', amount: 30, target: 'self' }] }] });
        const quiet = playNamed(battleWithTraits(walled, traitHero([tap])).state, 'tap');
        assert.equal(quiet.events.some((e) => e.type === 'reroll'), false);
        const inst = battle.state.piles.hero.hand.find((key) => battle.state.cards[key].cardId === 'tap');
        assert.deepEqual(replayBattle(battle.setup, 7, [{ type: 'play', inst, targetId: 'foe' }]).state, hit.state);
    });

    it('概率插招：开场后按概率插入、插入的招不推进脚本，一次性靠 maxUses；不带插招的单位随机数消耗不变', () => {
        assert.ok(reasons(normalizeProfile(enemyProfile({ script: { cycle: ['s1'], inserts: [{ skill: 'zz', pct: 100 }] } }))).includes('script.inserts[0].pct:out-of-range'));
        assert.ok(reasons(normalizeProfile(enemyProfile({ script: { cycle: ['s1'], inserts: [{ skill: 'zz', pct: 25 }] } }))).includes('script.inserts[0].skill:unknown-skill'));
        assert.equal(createBattle(setupWith(foeUnit({ script: { cycle: ['s1'], inserts: [{ skill: 's2', pct: 0 }] } })), 7).error?.reason, 'invalid-script');
        const foe = foeUnit({ skills: [guard('a'), guard('b'), guard('x', { maxUses: 1 })], script: { cycle: ['a', 'b'], inserts: [{ skill: 'x', pct: 99 }] } });
        const run = runTurns(foe, 6);
        assert.deepEqual(run.skills.slice(0, 5), ['x', 'a', 'b', 'a', 'b']);
        assert.deepEqual(replayBattle(run.setup, 7, run.actions).events, run.events);
        const opened = foeUnit({ skills: [guard('o'), guard('a'), guard('x', { maxUses: 1 })], script: { opener: 'o', cycle: ['a'], inserts: [{ skill: 'x', pct: 99 }] } });
        assert.deepEqual(runTurns(opened, 4).skills.slice(0, 3), ['o', 'x', 'a']);
        const plain = runTurns(foeUnit({ skills: [guard('a'), guard('b')] }), 6);
        const same = runTurns(foeUnit({ skills: [guard('a'), guard('b')] }), 6);
        assert.deepEqual(plain.skills, same.skills);
        assert.ok(foeSkills(plain.events).length >= 6);
    });
});

describe('M5 数值成长 foe-surge', () => {
    const bigHero = (hp = 999) => ({ ...heroUnit(), maxHp: hp });
    const surge = (extra) => ({ id: 'sg', name: 'sg', intent: 'attack', effects: [{ op: 'foe-surge', ...extra }] });
    const hitsOf = (events) => events.filter((e) => e.type === 'damage' && e.source?.unitId === 'foe' && e.target === 'hero').map((e) => e.amount);
    const run = (foe, hero, turns = 4) => {
        const setup = { rulesVersion: 6, controlledId: 'hero', units: [hero, foe] };
        const created = createBattle(setup, 7);
        assert.equal(created.ok, true, JSON.stringify(created.error));
        let state = created.state;
        const events = [...created.events];
        for (let i = 0; i < turns && !state.outcome; i += 1) {
            const result = act(state);
            events.push(...result.events);
            state = result.state;
        }
        return { setup, state, events };
    };

    it('档案校验：uses/turn/dexterity 须带 per，target-hp 须带 div 且不收 per，track 只属 uses', () => {
        const ok = normalizeProfile(enemyProfile({ skills: [surge({ amount: 10, per: 5, cap: 12, source: 'uses' }), skill('s2')] }));
        assert.equal(ok.ok, true, JSON.stringify(ok.errors));
        assert.deepEqual(ok.value.skills[0].effects[0], { op: 'foe-surge', amount: 10, hits: 1, source: 'uses', target: 'enemy', per: 5, track: 'surge', cap: 12 });
        const hp = normalizeProfile(enemyProfile({ skills: [surge({ amount: 1, hits: 5, div: 12, source: 'target-hp' }), skill('s2')] }));
        assert.equal(hp.ok, true, JSON.stringify(hp.errors));
        const bad = normalizeProfile(enemyProfile({ skills: [surge({ amount: 1, per: 2, source: 'target-hp', track: 'x' }), surge({ amount: 1, div: 3, source: 'turn' })] }));
        const issues = reasons(bad);
        for (const issue of ['skills[0].effects[0].per:unknown-field', 'skills[0].effects[0].div:missing', 'skills[0].effects[0].track:unknown-field', 'skills[1].effects[0].div:unknown-field', 'skills[1].effects[0].per:missing']) {
            assert.ok(issues.some((item) => item.startsWith(issue.split(':')[0]) && (issue.endsWith('missing') || item === issue)), `${issue} / ${issues.join()}`);
        }
    });

    it('按使用次数成长并封顶；重放一致', () => {
        const foe = foeUnit({ skills: [surge({ op: 'foe-surge', amount: 30, per: 5, cap: 40, source: 'uses', target: 'enemy' })] });
        const out = run(foe, bigHero());
        assert.deepEqual(hitsOf(out.events).slice(0, 4), [30, 35, 40, 40]);
        assert.deepEqual(replayBattle(out.setup, 7, Array(4).fill(END_TURN)).state, out.state);
    });

    it('按回合成长、加自身防御力', () => {
        const turned = hitsOf(run(foeUnit({ skills: [surge({ amount: 5, per: 2, source: 'turn' })] }), bigHero()).events);
        assert.ok(turned.length >= 3);
        for (let i = 1; i < 3; i += 1) assert.equal(turned[i] - turned[i - 1], 2, turned.join());
        const dex = foeUnit({ skills: [surge({ amount: 3, per: 1, source: 'dexterity' })], passives: [{ id: 'dx', name: 'dx', trigger: 'battle-start', effects: [{ op: 'status', status: 'dexterity', stacks: 4 }] }] });
        assert.equal(hitsOf(run(dex, bigHero(), 1).events)[0], 7);
    });

    it('窃取账本逐来源返还实际抵扣，不重复加属性，也不归还外来强化；重放一致', () => {
        for (const [stat, key] of [['strength', 'seized-atk'], ['dexterity', 'seized-def']]) {
            const kill = { id: 'kill', name: '终击', type: 'attack', cost: 0, target: 'enemy', effects: [{ op: 'damage', amount: 99 }] };
            const grow = { id: 'grow', name: '强化', type: 'skill', cost: 0, target: 'self', effects: [{ op: 'status', status: stat, stacks: 2, target: 'self' }] };
            const hero = traitHero([kill, kill, kill, grow, grow], { maxHp: 999, passives: [
                { id: 'base-stat', name: '原属性', trigger: 'battle-start', effects: [{ op: 'status', status: stat, stacks: 5, target: 'self' }] },
            ] });
            const thief = (id) => foeUnit({ id, maxHp: 20, skills: [{ id: 'take', name: '窃取', intent: 'debuff', effects: [{ op: 'seize-might', stat, amount: 2, target: 'enemy' }] }],
                passives: [{ id: 'external', name: '外来强化', trigger: 'battle-start', effects: [{ op: 'status', status: stat, stacks: 3, target: 'self' }] }] });
            const battle = battleWithTraits(thief('foe'), hero, [thief('foe2')]);
            let state = battle.state;
            const actions = [];
            const events = [...battle.events];
            const step = (action) => {
                const result = act(state, action);
                state = result.state;
                actions.push(action);
                events.push(...result.events);
                return result;
            };
            const play = (cardId, targetId) => step({ type: 'play', inst: state.piles.hero.hand.find((id) => state.cards[id].cardId === cardId), targetId });
            const amount = () => stat === 'dexterity' ? computeBlock(state.units.hero, 10, state.units.hero, 6) : computeDamage(state.units.hero, undefined, 10, 1, 6);
            step(END_TURN);
            assert.equal(state.units.hero.statuses[stat], 5);
            assert.equal(state.units.hero.statuses[key], 4);
            assert.equal(amount(), 11);
            for (const id of ['foe', 'foe2']) {
                assert.equal(state.units[id].statuses[stat], 5);
                assert.deepEqual(state.units[id].res.seizedStats, [{ victim: 'hero', status: key, stat, amount: 2 }]);
            }
            play('grow');
            assert.equal(state.units.hero.statuses[stat], 7);
            assert.equal(amount(), 13);
            const first = play('kill', 'foe');
            assert.equal(state.units.hero.statuses[key], 2);
            assert.equal(amount(), 15);
            assert.equal(state.units.foe.res?.seizedStats, undefined);
            assert.deepEqual(first.events.filter((e) => e.type === 'might-returned').map((e) => [e.stat, e.amount]), [[stat, 2]]);
            const last = play('kill', 'foe2');
            assert.equal(state.units.hero.statuses[key], undefined);
            assert.equal(state.units.hero.statuses[stat], 7);
            assert.equal(amount(), 17);
            assert.equal(state.units.foe2.res?.seizedStats, undefined);
            assert.equal(last.events.filter((e) => e.type === 'might-returned').length, 1);
            const replayed = replayBattle(battle.setup, 7, actions);
            assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
            assert.deepEqual(replayed.state, state);
            assert.deepEqual(replayed.events, events);
        }
    });

    it('敏捷成长读取窃取后的有效敏捷，允许负值；意图估算与倍率结算、重放一致', () => {
        for (const dexterity of [5, 1]) {
            const foe = foeUnit({ damageScale: 2, skills: [surge({ amount: 13, per: 1, source: 'dexterity' })],
                passives: [{ id: 'dex', name: '敏捷', trigger: 'battle-start', effects: [{ op: 'status', status: 'dexterity', stacks: dexterity, target: 'self' }] }] });
            const ally = { ...foeUnit({ id: 'thief', maxHp: 999, skills: [guard('wait')], passives: [
                { id: 'steal', name: '夺守', trigger: 'battle-start', effects: [{ op: 'seize-might', stat: 'dexterity', amount: 2, target: 'enemy' }] },
            ] }), side: 'ally' };
            const battle = battleWithTraits(foe, bigHero(), [ally]);
            assert.equal(battle.state.units.foe.statuses['seized-def'], 2);
            const expected = (13 + dexterity - 2) * 2;
            assert.equal(describeIntent(battle.state, 'foe').damage, expected);
            const result = act(battle.state);
            const damage = result.events.filter((e) => e.type === 'damage' && e.source?.unitId === 'foe');
            assert.ok(damage.length > 0);
            assert.ok(damage.every((e) => e.amount === expected), JSON.stringify(damage));
            assert.equal(describeIntent(result.state, 'foe').damage, expected);
            const replayed = replayBattle(battle.setup, 7, [END_TURN]);
            assert.equal(replayed.ok, true, JSON.stringify(replayed.error));
            assert.deepEqual(replayed.state, result.state);
            assert.deepEqual(replayed.events, [...battle.events, ...result.events]);
        }
    });

    it('依目标回合开始生命：每段 = floor(生命 / div) + amount，按新一回合开始时的生命重算', () => {
        const foe = foeUnit({ skills: [surge({ amount: 1, hits: 2, div: 12, source: 'target-hp' })] });
        const out = run(foe, bigHero(120), 2);
        assert.deepEqual(hitsOf(out.events).slice(0, 4), [11, 11, 9, 9]);
        const plain = run(foeUnit({ skills: [guard('g')] }), bigHero(120), 1);
        assert.equal(plain.state.units.hero.res?.turnStartHp, undefined);
    });

    it('档位换算同步缩放 amount、per、cap，不动 div', () => {
        const model = { skills: [surge({ amount: 30, per: 5, cap: 60, source: 'uses' }), surge({ amount: 1, div: 12, source: 'target-hp' })] };
        const scaled = scaleEnemyModel(model, { damage: 0.5, block: 1 });
        assert.deepEqual(scaled.skills[0].effects[0], { op: 'foe-surge', amount: 15, per: 2, cap: 30, source: 'uses' });
        assert.equal(scaled.skills[1].effects[0].div, 12);
    });
});
describe('M6 新敌方特性 foe-afflict 与 maxUses 放宽', () => {
    const ps = (status, stacks) => ({ id: status, name: status, trigger: 'battle-start', effects: [{ op: 'apply-status', status, stacks, target: 'self' }] });
    const strike = (amount) => ({ id: 'st', name: 'st', intent: 'attack', effects: [{ op: 'damage', amount }] });
    const afflict = (status, stacks = 1) => ({ id: 'af', name: 'af', intent: 'debuff', effects: [{ op: 'apply-status', status, stacks, target: 'enemy' }] });
    const hitN = (n, hits = 1) => testCard(`hit${n}x${hits}`, 'attack', [{ op: 'damage', amount: n, hits }]);
    const ward = testCard('w', 'skill', [{ op: 'block', amount: 1, target: 'self' }]);
    const playSelf = (state, id) => act(state, { type: 'play', inst: state.piles.hero.hand.find((key) => state.cards[key].cardId === id) });
    const created = (events, cardId) => events.filter((e) => e.type === 'card-created' && e.unitId === 'hero' && e.cardId === cardId).length;
    const onFoe = (events) => events.filter((e) => e.type === 'damage' && e.target === 'foe').map((e) => e.amount);

    it('maxUses 6：用满 6 次后不再入选；档案与建局校验一致', () => {
        const run = runTurns(foeUnit({ skills: [guard('t', { maxUses: 6 }), guard('a')], script: { cycle: ['t', 'a'] } }), 16);
        assert.equal(run.skills.filter((id) => id === 't').length, 6);
        assert.equal(run.state.units.foe.res.skillUses.t, 6);
        assert.deepEqual(replayBattle(run.setup, 7, run.actions).events, run.events);
        assert.equal(createBattle(setupWith(foeUnit({ skills: [guard('t', { maxUses: 9 })] })), 7).ok, true);
    });

    it('缠绕算子：档案校验、来源存活时受害者回合结束受伤、施加者倒下即解除', () => {
        const cons = { id: 'cs', name: 'cs', intent: 'debuff', effects: [{ op: 'constrict', stacks: 3 }] };
        assert.equal(normalizeProfile(enemyProfile({ skills: [cons, skill('s2')] })).ok, true);
        assert.ok(reasons(normalizeProfile(enemyProfile({ skills: [{ ...cons, effects: [{ op: 'constrict', stacks: 21 }] }, skill('s2')] }))).includes('skills[0].effects[0].stacks:out-of-range'));
        const big = hitN(80);
        const other = foeUnit({ id: 'foe2', skills: [guard('g')] });
        const battle = battleWithTraits(foeUnit({ maxHp: 50, skills: [cons] }), traitHero([big]), [other]);
        const t1 = act(battle.state);
        assert.equal(t1.state.units.hero.statuses.constricted, 3);
        assert.deepEqual(t1.state.units.hero.res.constrictFrom, { foe: 3 });
        const t2 = act(t1.state);
        assert.ok(t2.events.some((e) => e.type === 'damage' && e.target === 'hero' && e.amount === 3 && e.kind === 'thorns'));
        assert.equal(t2.state.units.hero.statuses.constricted, 6);
        const killed = playNamed(t2.state, big.id);
        assert.equal(killed.state.units.foe.alive, false);
        assert.equal(killed.state.units.hero.statuses.constricted, undefined);
        assert.equal(killed.state.units.hero.res?.constrictFrom, undefined);
    });

    it('减速：攻击者本回合每已打出一张牌，持有者受到的攻击伤害 +10%', () => {
        const card = hitN(10);
        let state = battleWithTraits(foeUnit({ maxHp: 99, skills: [guard('g')], passives: [ps('slow', 1)] }), traitHero([card, card, card])).state;
        const hits = [];
        for (let i = 0; i < 3; i += 1) {
            const out = playNamed(state, card.id);
            hits.push(...onFoe(out.events));
            state = out.state;
        }
        assert.deepEqual(hits, [10, 11, 12]);
    });

    it('跨回合时间扭曲：累计 12 张跨回合保留，满 12 张强制结束回合并获得攻击力，重放一致', () => {
        const battle = battleWithTraits(foeUnit({ skills: [guard('g')], passives: [ps('chrono', 2)] }), traitHero(Array(7).fill(ward)));
        let state = battle.state;
        const actions = [];
        const step = (action) => {
            const out = act(state, action);
            actions.push(action);
            state = out.state;
            return out;
        };
        const playAction = () => ({ type: 'play', inst: state.piles.hero.hand.find((key) => state.cards[key].cardId === 'w') });
        for (let i = 0; i < 7; i += 1) step(playAction());
        assert.equal(state.units.foe.res.chrono, 7);
        step(END_TURN);
        const turn = state.turn;
        let warp = null;
        for (let i = 0; i < 5; i += 1) warp = step(playAction());
        assert.ok(warp.events.some((e) => e.type === 'time-warp' && e.unitId === 'foe'));
        assert.equal(state.units.foe.statuses.strength, 2);
        assert.equal(state.units.foe.res?.chrono, undefined);
        assert.ok(state.turn > turn);
        assert.deepEqual(replayBattle(battle.setup, 7, actions).state, state);
    });

    it('硬壳：两次重置之间累计失血不超过层数，回合开始重置', () => {
        const big = hitN(50);
        const battle = battleWithTraits(foeUnit({ maxHp: 99, skills: [guard('g')], passives: [ps('shell', 20)] }), traitHero([big, big]));
        const once = playNamed(playNamed(battle.state, big.id).state, big.id);
        assert.equal(once.state.units.foe.hp, 79);
        const again = playNamed(act(once.state).state, big.id);
        assert.equal(again.state.units.foe.hp, 59);
    });

    it('刺痛与蜂巢：按段塞伤口 / 眩晕；滑溜每次失血至多 1 点并逐次减层', () => {
        const stabs = act(battleWithTraits(foeUnit({ skills: [strike(5)], passives: [ps('stabs', 1)] })).state);
        assert.equal(created(stabs.events, 'status-wound'), 1);
        const twin = hitN(3, 2);
        const hive = playNamed(battleWithTraits(foeUnit({ maxHp: 99, skills: [guard('g')], passives: [ps('hive', 1)] }), traitHero([twin])).state, twin.id);
        assert.equal(created(hive.events, 'status-daze'), 2);
        const big = hitN(50);
        const slick = battleWithTraits(foeUnit({ maxHp: 30, skills: [guard('g')], passives: [ps('slippery', 2)] }), traitHero([big, big, big]));
        const one = playNamed(slick.state, big.id);
        assert.equal(one.state.units.foe.hp, 29);
        assert.equal(one.state.units.foe.statuses.slippery, 1);
        const two = playNamed(one.state, big.id);
        assert.equal(two.state.units.foe.statuses.slippery, undefined);
        assert.equal(playNamed(two.state, big.id).state.units.foe.alive, false);
    });

    it('胆怯：每回合首次被命中，在攻击者这次出牌结算后获得一次格挡', () => {
        const twin = hitN(3, 2);
        const battle = battleWithTraits(foeUnit({ maxHp: 99, skills: [guard('g')], passives: [ps('skittish', 5)] }), traitHero([twin, twin]));
        const first = playNamed(battle.state, twin.id);
        const gains = (events) => events.filter((e) => e.type === 'block' && e.target === 'foe' && e.source?.id === 'skittish').length;
        assert.equal(gains(first.events), 1);
        assert.equal(first.state.units.foe.block, 5);
        assert.equal(gains(playNamed(first.state, twin.id).events), 0);
    });

    it('变形：失血等量扣攻击力，削弱紧接着的出手，持有者自己的回合结束归还', () => {
        const card = hitN(6);
        const battle = battleWithTraits(foeUnit({ maxHp: 99, skills: [strike(10)], passives: [ps('shifting', 1)] }), traitHero([card]));
        const hit = playNamed(battle.state, card.id);
        assert.equal(hit.state.units.foe.statuses.shackle, 6);
        const ended = act(hit.state);
        assert.ok(ended.events.some((e) => e.type === 'damage' && e.target === 'hero' && e.amount === 4));
        assert.equal(ended.state.units.foe.statuses.shackle, undefined);
    });

    it('消逝与流沙：持有者回合结束倒计时，归零时自身倒下 / 吞没对方操控角色', () => {
        const fade = battleWithTraits(foeUnit({ skills: [guard('g')], passives: [ps('fading', 2)] }));
        const f1 = act(fade.state);
        assert.equal(f1.state.units.foe.alive, true);
        const f2 = act(f1.state);
        assert.ok(f2.events.some((e) => e.type === 'faded'));
        assert.equal(f2.state.outcome, 'victory');
        const pit = battleWithTraits(foeUnit({ skills: [guard('g')], passives: [ps('sandpit', 2)] }));
        const p2 = act(act(pit.state).state);
        assert.ok(p2.events.some((e) => e.type === 'engulf'));
        assert.equal(p2.state.outcome, 'defeat');
    });

    it('妖术与烟雾：打出非攻击牌洗入眩晕；每回合至多 1 张技能牌', () => {
        const tap = hitN(1);
        const hexed = act(battleWithTraits(foeUnit({ maxHp: 99, skills: [afflict('hex')] }), traitHero([ward, tap])).state);
        assert.equal(hexed.state.units.hero.statuses.hex, 1);
        assert.equal(created(playSelf(hexed.state, 'w').events, 'status-daze'), 1);
        assert.equal(created(playNamed(hexed.state, tap.id).events, 'status-daze'), 0);
        const smog = act(battleWithTraits(foeUnit({ maxHp: 99, skills: [afflict('smoggy')] }), traitHero([ward, ward, ward])).state);
        const once = playSelf(smog.state, 'w');
        const inst = once.state.piles.hero.hand.find((key) => once.state.cards[key].cardId === 'w');
        assert.equal(applyAction(once.state, { type: 'play', inst }).ok, false);
    });

    it('贪食：同阵营单位倒下时持有者晕厥并获得层数攻击力', () => {
        const big = hitN(50);
        const other = foeUnit({ id: 'foe2', maxHp: 5, skills: [guard('g')] });
        const battle = battleWithTraits(foeUnit({ skills: [guard('g')], passives: [ps('ravenous', 4)] }), traitHero([big]), [other]);
        const out = playNamed(battle.state, big.id, 'foe2');
        assert.equal(out.state.units.foe.statuses.strength, 4);
        assert.equal(out.state.units.foe.statuses.stun, 1);
        assert.ok(out.events.some((e) => e.type === 'devour'));
    });

    it('档位换算：硬壳与胆怯随格挡、蒸汽与缠绕随伤害', () => {
        const model = { skills: [{ id: 'x', name: 'x', intent: 'buff', effects: [
            { op: 'apply-status', status: 'shell', stacks: 20, target: 'self' }, { op: 'apply-status', status: 'steam', stacks: 10, target: 'self' },
            { op: 'apply-status', status: 'slow', stacks: 1, target: 'self' }, { op: 'constrict', stacks: 3 },
        ] }] };
        const [shell, steam, slow, cons] = scaleEnemyModel(model, { damage: 0.5, block: 2 }).skills[0].effects;
        assert.equal(shell.stacks, 40);
        assert.equal(steam.stacks, 5);
        assert.equal(slow.stacks, 1);
        assert.equal(cons.stacks, 2);
    });
});

describe('M7 盗金 steal-gold', () => {
    const thief = (amount = 15) => foeUnit({ skills: [{ id: 'th', name: 'th', intent: 'attack', effects: [{ op: 'damage', amount: 3 }, { op: 'steal-gold', amount }] }] });
    const purseSetup = (foe, purse, hero = heroUnit(), extra = {}) => ({ rulesVersion: 6, controlledId: 'hero', canEscape: true, purse, units: [hero, foe], ...extra });
    const start = (setup) => {
        const battle = createBattle(setup, 7);
        assert.equal(battle.ok, true, JSON.stringify(battle.error));
        return battle;
    };

    it('setup.purse 校验：非负整数且须规则 v5 起；档案校验接受 steal-gold', () => {
        assert.equal(createBattle(purseSetup(thief(), -1), 7).error?.reason, 'invalid-setup');
        assert.equal(createBattle(purseSetup(thief(), 1.5), 7).error?.reason, 'invalid-setup');
        assert.equal(createBattle({ controlledId: 'hero', purse: 10, units: [heroUnit(), thief()] }, 7).error?.reason, 'invalid-setup');
        assert.equal(Object.hasOwn(start(setupWith(thief())).state, 'purse'), false);
        assert.equal(normalizeProfile(enemyProfile({ skills: [{ id: 'th', name: 'th', intent: 'attack', effects: [{ op: 'steal-gold', amount: 15 }] }, skill('s2')] })).ok, true);
    });

    it('按实际余额盗取，余额为 0 时不偷；重放一致', () => {
        const setup = purseSetup(thief(15), 20);
        const t1 = act(start(setup).state);
        assert.equal(t1.state.purse, 5);
        assert.equal(t1.state.units.foe.res.stolenGold, 15);
        const t2 = act(t1.state);
        assert.equal(t2.state.purse, 0);
        assert.equal(t2.state.units.foe.res.stolenGold, 20);
        const t3 = act(t2.state);
        assert.equal(t3.events.filter((e) => e.type === 'gold-stolen').length, 0);
        assert.deepEqual(replayBattle(setup, 7, [END_TURN, END_TURN, END_TURN]).state, t3.state);
        const empty = act(start(purseSetup(thief(15), 0)).state);
        assert.equal(empty.events.some((e) => e.type === 'gold-stolen'), false);
    });

    it('击倒盗贼如数归还，战报不记损失', () => {
        const big = testCard('kill', 'attack', [{ op: 'damage', amount: 99 }]);
        const t1 = act(start(purseSetup(thief(15), 40, traitHero([big]))).state);
        assert.equal(t1.state.purse, 25);
        const out = playNamed(t1.state, 'kill');
        assert.equal(out.state.purse, 40);
        assert.equal(out.state.units.foe.res?.stolenGold, undefined);
        assert.ok(out.events.some((e) => e.type === 'gold-returned' && e.amount === 15));
        const report = buildCombatReport({ combatId: 'c1', state: out.state, events: [...t1.events, ...out.events] });
        assert.equal(report.ok, true);
        assert.equal(report.goldLost, undefined);
        assert.equal(/gold-lost/.test(report.text), false);
    });

    it('我方撤退时盗贼带走金币：战报 gold-lost → 指令 goldLost → 剧情货币按增减扣一次', () => {
        const t1 = act(start(purseSetup(thief(15), 40)).state);
        const fled = act(t1.state, { type: 'escape' });
        assert.equal(fled.state.outcome, 'escape');
        const report = buildCombatReport({ combatId: 'c2', state: fled.state, events: [...t1.events, ...fled.events] });
        assert.equal(report.goldLost, 15);
        assert.match(report.text, / gold-lost="15">/);
        const parsed = parseBattleReport(report.text);
        assert.equal(parsed.goldLost, 15);
        assert.equal(parseBattleReport(report.text.replace(' gold-lost=', ' hp-lost="7" gold-lost=')).goldLost, 15);
        const directive = battleDirectiveOf(parsed);
        assert.equal(directive.goldLost, 15);
        assert.equal(battleDirectiveOf(parseBattleReport(report.text.replace(/ gold-lost="15"/, ''))).goldLost, undefined);
        const base = { clock: {}, protagonist: { bars: { stress: 0 } }, characters: {} };
        const ctx = { currency: createCurrencyContext({ ready: true, balance: 100 }), changes: [], events: [], flags: {}, diagnostics: [] };
        const once = applyBattleReport(base, directive, ctx);
        assert.equal(ctx.currency.delta, -15);
        assert.equal(ctx.currency.balance, 85);
        applyBattleReport(once, directive, ctx);
        assert.equal(ctx.currency.delta, -15, '同一战报只结算一次');
        const noCurrency = { changes: [], events: [], flags: {}, diagnostics: [] };
        applyBattleReport(base, directive, noCurrency);
        assert.equal(noCurrency.changes.length, 0);
    });
    it('逐金窃客条目：Mug×2 后 Lunge/Smoke Bomb 各半分叉，Smoke Bomb 后遁走带走盗金；重放一致', () => {
        const item = ENEMIES.find((e) => e.sourceKey === 'Looter');
        const profile = materializeEnemy(item, 'original');
        const branches = new Set();
        for (let seed = 1; seed <= 24; seed += 1) {
            const setup = purseSetup(foeUnit({ skills: profile.skills, script: profile.script }), 200);
            const created = createBattle(setup, seed);
            assert.equal(created.ok, true, JSON.stringify(created.error));
            let state = created.state;
            const used = [];
            const actions = [];
            for (let i = 0; i < 8 && state.units.foe.alive; i += 1) {
                const out = act(state);
                used.push(...out.events.filter((e) => e.type === 'skill' && e.unitId === 'foe').map((e) => e.skillId));
                actions.push(END_TURN);
                state = out.state;
            }
            assert.deepEqual(used.slice(0, 2), ['mug', 'mug2'], `seed ${seed}`);
            const tail = used.slice(2);
            assert.ok(['lunge,smoke,escape', 'smoke,escape'].includes(tail.join(',')), `seed ${seed}: ${used}`);
            branches.add(tail[0]);
            assert.equal(state.units.foe.left, 'fled');
            const stolen = 15 * (tail[0] === 'lunge' ? 3 : 2);
            assert.equal(state.purse, 200 - stolen);
            assert.equal(state.units.foe.res.stolenGold, stolen);
            assert.deepEqual(replayBattle(setup, seed, actions).state, state);
        }
        assert.deepEqual([...branches].sort(), ['lunge', 'smoke']);
    });

});
describe('M7 偷牌 steal-card 与账本 card-lost', () => {
    const zap = testCard('zap', 'attack', [{ op: 'damage', amount: 99 }]);
    const copyHero = (n) => ({ ...heroUnit(), deck: Array.from({ length: n }, (_, i) => ({ cardId: 'zap', copyId: `start:${i}` })), catalog: { zap } });
    const robber = () => foeUnit({ skills: [{ id: 'rb', name: 'rb', intent: 'debuff', effects: [{ op: 'steal-card' }] }] });
    const start = (hero) => {
        const setup = { rulesVersion: 6, controlledId: 'hero', canEscape: true, units: [hero, robber()] };
        const battle = createBattle(setup, 7);
        assert.equal(battle.ok, true, JSON.stringify(battle.error));
        return { ...battle, setup };
    };
    const held = (state) => ['hand', 'draw', 'discard', 'exhaust'].flatMap((k) => state.piles.hero[k]).length;

    it('只偷长期副本、按种子取一张；剩 deckMin 张时不再偷；重放一致', () => {
        const run = start(copyHero(12));
        const t1 = act(run.state);
        assert.equal(t1.state.units.foe.res.stolenCards.length, 1);
        assert.match(t1.state.units.foe.res.stolenCards[0].copyId, /^start:\d+$/);
        assert.equal(held(t1.state), 11);
        const t2 = act(t1.state);
        assert.equal(t2.state.units.foe.res.stolenCards.length, 2);
        const t3 = act(t2.state);
        assert.equal(t3.state.units.foe.res.stolenCards.length, 2, '剩 10 张时不再偷');
        assert.deepEqual(replayBattle(run.setup, 7, [END_TURN, END_TURN, END_TURN]).state, t3.state);
        const plain = act(start(heroUnit()).state);
        assert.equal(plain.events.some((e) => e.type === 'card-stolen'), false, '没有副本 ID 的牌不偷');
    });

    it('击倒窃贼归还牌、战报不记损失；我方撤退时战报带 cardsLost', () => {
        const t1 = act(start(copyHero(11)).state);
        const stolen = t1.state.units.foe.res.stolenCards[0];
        const out = playNamed(t1.state, 'zap');
        assert.ok(out.events.some((e) => e.type === 'card-recovered' && e.inst === stolen.inst));
        assert.equal(held(out.state), 11);
        assert.equal(buildCombatReport({ combatId: 'c3', state: out.state, events: out.events }).cardsLost, undefined);
        const fled = act(t1.state, { type: 'escape' });
        const report = buildCombatReport({ combatId: 'c4', state: fled.state, events: [...t1.events, ...fled.events] });
        assert.deepEqual(report.cardsLost, [{ owner: 'hero', copyId: stolen.copyId, cardId: 'zap' }]);
        assert.match(report.text, /损失：卡组里的「zap」被偷走。/);
    });

    it('账本 card-lost：按副本 ID 移除、重复记录与战报不符拒收、不少于 deckMin、战报楼回退撤销', async () => {
        const atk = (id) => ({ id, name: `斩${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 6 }] });
        const grd = (id) => ({ id, name: `守${id}`, type: 'skill', cost: 1, rarity: 'common', effects: [{ op: 'block', amount: 5 }] });
        const cls = { kind: 'class', id: 'cls-blade', className: '剑士', archetype: 'warrior',
            classPassive: { id: 'p-cls', name: '锋锐', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }] },
            classPool: [1, 2, 5, 6].map((n) => atk(`c${n}`)).concat([3, 4, 7, 8].map((n) => grd(`c${n}`))) };
        const hero = { kind: 'deck-character', id: 'pc-hero', name: '主角', classRef: 'cls-blade', base: { hp: 80 },
            personalPassive: { id: 'pp-pc-hero', name: '意志', trigger: 'on-low-hp', effects: [{ op: 'block', amount: 6 }] },
            personalPool: [atk('m1'), grd('m2'), atk('m3'), grd('m4')],
            starterDeck: ['basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend', 'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'm1', 'm1', 'm2', 'm2'] };
        const row = (def, createdAt) => ({ id: def.id, name: def.name || def.className, kind: def.kind, className: def.className || '', version: 1, createdAt, definition: def });
        const clone = (v) => JSON.parse(JSON.stringify(v));
        const tables = { profile: [row(cls, 1), row(hero, 2)], ledger: [] };
        tables.read = () => ({ ok: true, missing: [], diagnostics: [], profile: clone(tables.profile), ledger: clone(tables.ledger) });
        tables.append = async (kind, records) => {
            const written = [];
            for (const record of records) if (!tables[kind].some((x) => x.id === record.id)) { tables[kind].push(clone(record)); written.push(record.id); }
            return { ok: true, written, present: [], rejected: [], pending: [] };
        };
        const chat = [{ mes: '出发', is_user: true }, { mes: '<igs-combat-report id="rlost1" result="escape" encounter="">\n终局。\n</igs-combat-report>', is_user: true }];
        const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7 });
        const heroOf = async () => (await ledger.effectiveState({ raw: true })).characters.get('pc-hero');
        const before = await heroOf();
        assert.equal(before.deck.length, 20);
        const copies = before.deckEntries.map((e) => e.copyId);
        const cardOf = (copyId) => before.deckEntries.find((e) => e.copyId === copyId).cardId;
        const entry = (copyId, occurrence, reportId = 'rlost1') => {
            const anchor = { messageId: 1, swipeId: 0, tagHash: CARD_LOST_TAG_HASH, occurrence };
            return { id: ledgerEntryId('card-lost', 'pc-hero', anchor), type: 'card-lost', character: 'pc-hero', anchor, payload: { copyId, cardId: cardOf(copyId), reportId }, createdAt: 7 };
        };
        const wrote = await ledger.append([entry(copies[0], 0), entry(copies[0], 1), entry(copies[1], 2, 'rother')]);
        assert.equal(wrote.ok, true, JSON.stringify(wrote));
        const after = await ledger.effectiveState({ raw: true });
        const hero1 = after.characters.get('pc-hero');
        assert.equal(hero1.deck.length, 19);
        assert.equal(hero1.deckEntries.some((e) => e.copyId === copies[0]), false);
        assert.ok(hero1.deckEntries.some((e) => e.copyId === copies[1]));
        assert.ok(after.diagnostics.some((d) => d.code === 'combat-card-lost-copy-missing'));
        assert.ok(after.inactive.some((item) => item.reason === 'card-lost-report-invalid'));
        await ledger.append(copies.slice(2, 12).map((copyId, i) => entry(copyId, 10 + i)));
        const floor = await ledger.effectiveState({ raw: true });
        assert.equal(floor.characters.get('pc-hero').deck.length, 10);
        assert.ok(floor.diagnostics.some((d) => d.code === 'combat-card-lost-deck-min'));
        chat.length = 1;
        assert.equal((await heroOf()).deck.length, 20, '战报楼回退后撤销');
    });
});
describe('M7 永久寄生 implant-card 与账本 card-implant', () => {
    const zap = testCard('zap', 'attack', [{ op: 'damage', amount: 1 }]);
    const copyHero = (n) => ({ ...heroUnit(), deck: Array.from({ length: n }, (_, i) => ({ cardId: 'zap', copyId: `start:${i}` })), catalog: { zap } });
    const host = () => foeUnit({ skills: [{ id: 'pa', name: 'pa', intent: 'debuff', effects: [{ op: 'implant-card', cardId: 'curse-parasite' }] }] });
    const start = (hero) => {
        const setup = { rulesVersion: 6, controlledId: 'hero', canEscape: true, units: [hero, host()] };
        const battle = createBattle(setup, 7);
        assert.equal(battle.ok, true, JSON.stringify(battle.error));
        return { ...battle, setup };
    };
    const piles = (state) => ['hand', 'draw', 'discard', 'exhaust'].flatMap((k) => state.piles.hero[k]).length;

    it('档案校验只接受固定可植入牌；植入不进本场牌堆、不改输入局面；重放一致', () => {
        const ok = normalizeProfile(enemyProfile({ skills: [{ id: 'pa', name: 'pa', intent: 'debuff', effects: [{ op: 'implant-card', cardId: 'curse-parasite' }] }, skill('s2')] }));
        assert.equal(ok.ok, true, JSON.stringify(ok.errors));
        const bad = normalizeProfile(enemyProfile({ skills: [{ id: 'pa', name: 'pa', intent: 'debuff', effects: [{ op: 'implant-card', cardId: 'basic-strike' }] }, skill('s2')] }));
        assert.equal(bad.ok, false);
        const run = start(copyHero(12));
        const t1 = act(run.state);
        const t2 = act(t1.state);
        assert.deepEqual(t2.state.implanted, [{ owner: 'hero', cardId: 'curse-parasite' }, { owner: 'hero', cardId: 'curse-parasite' }]);
        assert.equal(t1.state.implanted.length, 1);
        assert.equal(piles(t2.state), 12);
        assert.deepEqual(replayBattle(run.setup, 7, [END_TURN, END_TURN]).state, t2.state);
        const plain = act(start(heroUnit()).state);
        assert.equal(plain.state.implanted, undefined, '没有长期卡组的单位不植入');
    });

    it('我方撤退与击败寄主都保留植入：战报带 cardsAdded', () => {
        const t1 = act(start(copyHero(12)).state);
        const fled = act(t1.state, { type: 'escape' });
        const report = buildCombatReport({ combatId: 'c5', state: fled.state, events: [...t1.events, ...fled.events] });
        assert.deepEqual(report.cardsAdded, [{ owner: 'hero', cardId: 'curse-parasite' }]);
        assert.match(report.text, /寄生：卡组里被植入了「寄生」。/);
        const kill = { ...heroUnit(), deck: [{ cardId: 'zap', copyId: 'start:0' }, { cardId: 'kill', copyId: 'k:0' }],
            catalog: { zap, kill: testCard('kill', 'attack', [{ op: 'damage', amount: 99 }]) }, draw: 2, energy: 10 };
        const k1 = act(start(kill).state);
        const won = playNamed(k1.state, 'kill');
        assert.equal(won.state.outcome, 'victory');
        assert.deepEqual(buildCombatReport({ combatId: 'c6', state: won.state, events: won.events }).cardsAdded, [{ owner: 'hero', cardId: 'curse-parasite' }]);
    });

    it('账本 card-implant：补目录并新增副本、未知牌拒收、战报不符失效、战报楼回退撤销', async () => {
        const atk = (id) => ({ id, name: `斩${id}`, type: 'attack', cost: 1, rarity: 'common', effects: [{ op: 'damage', amount: 6 }] });
        const grd = (id) => ({ id, name: `守${id}`, type: 'skill', cost: 1, rarity: 'common', effects: [{ op: 'block', amount: 5 }] });
        const cls = { kind: 'class', id: 'cls-blade', className: '剑士', archetype: 'warrior',
            classPassive: { id: 'p-cls', name: '锋锐', trigger: 'battle-start', effects: [{ op: 'status', status: 'strength', stacks: 1 }] },
            classPool: [1, 2, 5, 6].map((n) => atk(`c${n}`)).concat([3, 4, 7, 8].map((n) => grd(`c${n}`))) };
        const hero = { kind: 'deck-character', id: 'pc-hero', name: '主角', classRef: 'cls-blade', base: { hp: 80 },
            personalPassive: { id: 'pp-pc-hero', name: '意志', trigger: 'on-low-hp', effects: [{ op: 'block', amount: 6 }] },
            personalPool: [atk('m1'), grd('m2'), atk('m3'), grd('m4')],
            starterDeck: ['basic-strike', 'basic-strike', 'basic-strike', 'basic-defend', 'basic-defend', 'basic-defend', 'c1', 'c1', 'c1', 'c2', 'c2', 'c2', 'c3', 'c3', 'c4', 'c4', 'm1', 'm1', 'm2', 'm2'] };
        const row = (def, createdAt) => ({ id: def.id, name: def.name || def.className, kind: def.kind, className: def.className || '', version: 1, createdAt, definition: def });
        const clone = (v) => JSON.parse(JSON.stringify(v));
        const tables = { profile: [row(cls, 1), row(hero, 2)], ledger: [] };
        tables.read = () => ({ ok: true, missing: [], diagnostics: [], profile: clone(tables.profile), ledger: clone(tables.ledger) });
        tables.append = async (kind, records) => {
            const written = [];
            for (const record of records) if (!tables[kind].some((x) => x.id === record.id)) { tables[kind].push(clone(record)); written.push(record.id); }
            return { ok: true, written, present: [], rejected: [], pending: [] };
        };
        const chat = [{ mes: '出发', is_user: true }, { mes: '<igs-combat-report id="rimp1" result="lose" encounter="">\n终局。\n</igs-combat-report>', is_user: true }];
        const ledger = createCombatLedger({ tables, chat: () => chat, userName: '主角', now: () => 7 });
        const entry = (cardId, occurrence, reportId = 'rimp1') => {
            const anchor = { messageId: 1, swipeId: 0, tagHash: CARD_IMPLANT_TAG_HASH, occurrence };
            return { id: ledgerEntryId('card-implant', 'pc-hero', anchor), type: 'card-implant', character: 'pc-hero', anchor, payload: { cardId, reportId }, createdAt: 7 };
        };
        const wrote = await ledger.append([entry('curse-parasite', 0), entry('curse-parasite', 1), entry('basic-strike', 2), entry('curse-parasite', 3, 'rother')]);
        assert.equal(wrote.ok, true, JSON.stringify(wrote));
        const after = await ledger.effectiveState({ raw: true });
        const view = after.characters.get('pc-hero');
        assert.equal(view.deck.length, 22);
        assert.equal(view.deck.filter((id) => id === 'curse-parasite').length, 2);
        assert.equal(view.catalog.get('curse-parasite').name, '寄生');
        assert.ok(after.diagnostics.some((d) => d.code === 'combat-card-implant-unknown'));
        assert.ok(after.inactive.some((item) => item.reason === 'card-implant-report-invalid'));
        chat.length = 1;
        assert.equal((await ledger.effectiveState({ raw: true })).characters.get('pc-hero').deck.length, 20, '战报楼回退后撤销');
    });
});
describe('M7 二选一诅咒 offer-curse', () => {
    const curse = (a, b, extra = {}) => ({ op: 'offer-curse', options: [a, b], ...extra });
    const opt = (status, stacks = 1) => ({ status, stacks });
    const demon = (options, extra = {}) => foeUnit({ skills: [{ id: 'kd', name: 'kd', intent: 'debuff', effects: [curse(...options)] }], ...extra });
    const start = (foe, hero = heroUnit()) => {
        const setup = { rulesVersion: 6, controlledId: 'hero', canEscape: true, units: [hero, foe] };
        const battle = createBattle(setup, 7);
        assert.equal(battle.ok, true, JSON.stringify(battle.error));
        return { ...battle, setup };
    };
    const pick = (index) => ({ type: 'choose', insts: [`curse:${index}`] });

    it('档案只接受两项已知诅咒；敌方出手后挂起选择，只能 choose，托管所走的出牌与结束回合被拒', () => {
        const ok = normalizeProfile(enemyProfile({ skills: [{ id: 'kd', name: 'kd', intent: 'debuff', effects: [curse(opt('sloth'), opt('mind-rot'))] }, skill('s2')] }));
        assert.equal(ok.ok, true, JSON.stringify(ok.errors));
        assert.equal(ok.value.skills[0].effects[0].target, 'enemy');
        assert.equal(normalizeProfile(enemyProfile({ skills: [{ id: 'kd', name: 'kd', intent: 'debuff', effects: [{ op: 'offer-curse', options: [opt('sloth')] }] }, skill('s2')] })).ok, false);
        assert.equal(normalizeProfile(enemyProfile({ skills: [{ id: 'kd', name: 'kd', intent: 'debuff', effects: [curse(opt('sloth'), opt('poison'))] }, skill('s2')] })).ok, false);
        const run = start(demon([opt('sloth'), opt('mind-rot')]));
        assert.equal(run.state.pending, undefined);
        const t1 = act(run.state);
        assert.equal(t1.state.pending.kind, 'foe-curse');
        assert.deepEqual(t1.state.pending.options, ['curse:0', 'curse:1']);
        assert.deepEqual(t1.state.pending.offer, [opt('sloth'), opt('mind-rot')]);
        assert.ok(t1.events.some((e) => e.type === 'choose-start' && e.kind === 'foe-curse'));
        const inst = t1.state.piles.hero.hand[0];
        assert.equal(applyAction(t1.state, { type: 'play', inst, targetId: 'foe' }).error.reason, 'choice-pending');
        assert.equal(applyAction(t1.state, END_TURN).error.reason, 'choice-pending');
        assert.equal(applyAction(t1.state, { type: 'choose', insts: ['curse:2'] }).error.reason, 'invalid-choice');
        const chosen = act(t1.state, pick(1));
        assert.equal(chosen.state.pending, undefined);
        assert.equal(chosen.state.offers, undefined);
        assert.equal(chosen.state.units.hero.statuses['mind-rot'], 1);
        assert.equal(chosen.state.units.hero.statuses.sloth, undefined);
        assert.ok(chosen.events.some((e) => e.type === 'curse-chosen' && e.status === 'mind-rot' && e.from === 'foe'));
        assert.deepEqual(replayBattle(run.setup, 7, [END_TURN, pick(1)]).state, chosen.state);
    });

    it('同一敌方回合两份诅咒按排队顺序逐份挂起，同名叠加层数', () => {
        const run = start(demon([opt('sloth', 2), opt('waste-away')], { actions: 2 }));
        const t1 = act(run.state);
        assert.equal(t1.state.offers.length, 2);
        const first = act(t1.state, pick(0));
        assert.equal(first.state.pending.kind, 'foe-curse');
        assert.equal(first.state.offers.length, 1);
        const second = act(first.state, pick(0));
        assert.equal(second.state.pending, undefined);
        assert.equal(second.state.units.hero.statuses.sloth, 4);
    });
    it('知识恶魔条目：三轮诅咒依次给出不同两项，三套给完后只循环掌掴、知识压顶、沉思；重放一致', () => {
        const profile = materializeEnemy(ENEMIES.find((e) => e.sourceKey === 'Knowledge Demon'), 'original');
        const run = start(foeUnit({ skills: profile.skills, script: profile.script }), { ...heroUnit(), maxHp: 999 });
        let state = run.state;
        const used = [];
        const offers = [];
        const actions = [];
        for (let i = 0; i < 13 && !state.outcome; i += 1) {
            if (state.pending) {
                offers.push(state.pending.offer.map((o) => `${o.status}:${o.stacks}`).join('/'));
                actions.push(pick(1));
                state = act(state, pick(1)).state;
            }
            const out = act(state);
            used.push(...out.events.filter((e) => e.type === 'skill' && e.unitId === 'foe').map((e) => e.skillId));
            actions.push(END_TURN);
            state = out.state;
        }
        assert.deepEqual(used, ['curse1', 'slap', 'overwhelm', 'ponder', 'curse2', 'slap', 'overwhelm', 'ponder', 'curse3', 'slap', 'overwhelm', 'ponder', 'slap']);
        assert.deepEqual(offers, ['disintegration:6/mind-rot:1', 'disintegration:7/sloth:3', 'disintegration:8/waste-away:1']);
        assert.deepEqual(['mind-rot', 'sloth', 'waste-away'].map((k) => state.units.hero.statuses[k]), [1, 3, 1]);
        assert.deepEqual(replayBattle(run.setup, 7, actions).state, state);
    });

    it('四种状态：少抽、出牌上限、少能量、回合结束受伤', () => {
        const hero = { ...heroUnit(), deck: Array(10).fill('basic-strike') };
        const t1 = act(start(demon([opt('mind-rot'), opt('waste-away')]), hero).state);
        const drawn = t1.state.piles.hero.hand.length;
        const energy = t1.state.units.hero.energy;
        const rot = act(act(t1.state, pick(0)).state);
        assert.equal(rot.state.piles.hero.hand.length, drawn - 1);
        const waste = act(act(t1.state, pick(1)).state);
        assert.equal(waste.state.units.hero.energy, energy - 1);

        const s1 = act(start(demon([opt('sloth'), opt('disintegration', 3)]), hero).state);
        const slowed = act(s1.state, pick(0));
        const once = playNamed(slowed.state, 'basic-strike');
        assert.equal(applyAction(once.state, { type: 'play', inst: once.state.piles.hero.hand[0], targetId: 'foe' }).ok, false);
        const broken = act(s1.state, pick(1));
        const hp = broken.state.units.hero.hp;
        const after = act(broken.state);
        assert.equal(after.state.units.hero.hp, hp - 3);
    });

    it('面板：待选带两道诅咒名称与说明，浮层只出选项与确认；战报记下抉择', async () => {
        const { battleView, pendingChoice } = await import('../src/visual/igs-ui/combat-panel-model.js');
        const { renderCombatPanelHtml } = await import('../src/visual/igs-ui/combat-panel-render.js');
        const { legalActions } = await import('../src/combat/engine.js');
        const run = start(demon([opt('sloth', 2), opt('waste-away')]));
        const t1 = act(run.state);
        const choice = pendingChoice(t1.state);
        assert.deepEqual(choice.curses, [{ id: 'curse:0', name: '怠惰', text: '每回合最多打出 2 张牌' }, { id: 'curse:1', name: '衰竭', text: '每回合少 1 点能量' }]);
        const view = battleView(t1.state, legalActions(t1.state));
        assert.equal(view.hand.some((c) => c.choosable), false, '诅咒选项不对应手牌');
        const sheet = renderCombatPanelHtml({ status: 'battle', battle: view, chosen: ['curse:1'] }).match(/<div class="igs-combat-purge-sheet" role="dialog" aria-label="二选一诅咒"[\s\S]*$/)[0];
        assert.equal((sheet.match(/data-combat-act="choose-pick"/g) || []).length, 2);
        assert.match(sheet, /data-combat-id="curse:1" aria-pressed="true"/);
        assert.doesNotMatch(sheet, /data-combat-act="choose-confirm"[^>]*aria-disabled/);
        assert.doesNotMatch(sheet, /purge-close|skip/);
        const chosen = act(t1.state, pick(1));
        const fled = act(chosen.state, { type: 'escape' });
        const report = buildCombatReport({ combatId: 'c7', state: fled.state, events: [...t1.events, ...chosen.events, ...fled.events] });
        assert.match(report.text, /承受了「衰竭」/);
    });
});
describe('M8 遭遇分组 encounter', () => {
    const nuke = (id, amount = 99) => testCard(id, 'attack', [{ op: 'damage', amount, target: 'enemy' }]);
    const watcher = (trigger) => ({ id: `w-${trigger}`, name: trigger, trigger, effects: [{ op: 'block', amount: 1, target: 'self' }] });
    const member = (id, encounter, name = '暗生', extra = {}) => foeUnit({ id, name, ...(encounter ? { encounter } : {}), skills: [guard('g1'), guard('g2')], ...extra });
    const fired = (events, trigger, unitId = 'hero') => events.filter((e) => e.type === 'passive' && e.trigger === trigger && e.unitId === unitId).length;
    const build = (units, extra = {}) => {
        const setup = { rulesVersion: 6, controlledId: 'hero', units, ...extra };
        const battle = createBattle(setup, 7);
        assert.equal(battle.ok, true, JSON.stringify(battle.error));
        return { ...battle, setup };
    };

    it('只收规则 v5 起敌方技能单位的合法分组；同组同名按甲乙丙编号，旧 setup 形状不变', () => {
        const bad = (units, rulesVersion = 6) => createBattle({ rulesVersion, controlledId: 'hero', units }, 7);
        assert.equal(bad([{ ...heroUnit(), encounter: 'g' }, member('a')]).error.reason, 'invalid-encounter');
        assert.equal(bad([heroUnit(), member('a', 'g')], 4).error.reason, 'invalid-encounter');
        assert.equal(createBattle({ controlledId: 'hero', units: [heroUnit(), member('a', 'g')] }, 7).error.reason, 'invalid-encounter');
        assert.equal(bad([heroUnit(), member('a', 'bad id')]).error.reason, 'invalid-encounter');
        const run = build([heroUnit(), member('a', 'dk'), member('b', 'dk'), member('c', 'other')]);
        const { a, b, c } = run.state.units;
        assert.deepEqual([a.name, a.baseName, b.name, b.baseName], ['暗生甲', '暗生', '暗生乙', '暗生']);
        assert.deepEqual([c.name, c.encounter, Object.hasOwn(c, 'baseName')], ['暗生', 'other', false]);
        const legacy = createBattle(setupWith(foeUnit()), 7);
        assert.equal(Object.hasOwn(legacy.state.units.foe, 'encounter') || Object.hasOwn(legacy.state.units.foe, 'baseName'), false);
    });

    it('击杀与倒下总线、同伴倒下 mate-down 按遭遇计：组内先倒的不计，末员倒下计一次；未分组照旧逐只计', () => {
        const hero = traitHero([nuke('n1'), nuke('n2'), nuke('n3')], { passives: [watcher('kill'), watcher('defeated')] });
        const rage = { id: 'rage', name: 'rage', trigger: 'mate-down', effects: [{ op: 'block', amount: 5, target: 'self' }] };
        const run = build([hero, member('a', 'crab', '碎爪'), member('b', 'crab', '火箭爪', { passives: [rage] }), member('c', null, '路人', { passives: [rage] })]);
        const first = playNamed(run.state, 'n1', 'a');
        assert.equal(fired(first.events, 'kill'), 0);
        assert.equal(fired(first.events, 'defeated'), 0);
        assert.equal(fired(first.events, 'mate-down', 'b'), 1);
        assert.equal(first.state.units.b.block - run.state.units.b.block, 5);
        assert.equal(fired(first.events, 'mate-down', 'c'), 0);
        const second = playNamed(first.state, 'n2', 'b');
        assert.equal(fired(second.events, 'kill'), 1);
        assert.equal(fired(second.events, 'defeated'), 1);
        const third = playNamed(second.state, 'n3', 'c');
        assert.equal(third.state.outcome, 'victory');
        const actions = [first, second, third].map((step, i) => ({ type: 'play', inst: [run.state, first.state, second.state][i].piles.hero.hand.find((key) => [run.state, first.state, second.state][i].cards[key].cardId === `n${i + 1}`), targetId: ['a', 'b', 'c'][i] }));
        assert.deepEqual(replayBattle(run.setup, 7, actions).state, third.state);
    });

    it('同组不灭只看同组存活者：先倒者两回合后半血复活；全组倒下时取消待复活并判胜', () => {
        const darkling = (id) => member(id, 'dk', '暗生', { passives: [openingStatus('revive')] });
        const hero = traitHero([nuke('n1'), nuke('n2'), nuke('n3')]);
        const run = build([hero, darkling('d1'), darkling('d2'), darkling('d3')]);
        assert.deepEqual(['d1', 'd2', 'd3'].map((id) => run.state.units[id].name), ['暗生甲', '暗生乙', '暗生丙']);
        const hit = playNamed(run.state, 'n1', 'd1');
        assert.equal(hit.state.units.d1.res.reviveAt, hit.state.turn + 2);
        const later = act(act(hit.state).state);
        assert.equal(later.state.units.d1.alive, true);
        assert.equal(later.state.units.d1.hp, 20);
        const wipe = playNamed(playNamed(playNamed(run.state, 'n1', 'd1').state, 'n2', 'd2').state, 'n3', 'd3');
        assert.equal(wipe.state.outcome, 'victory');
        assert.equal(['d1', 'd2', 'd3'].some((id) => wipe.state.units[id].res?.reviveAt != null), false);
    });

    it('分裂子体沿用分组并接着编号，不算击杀；召来的爪牙不算遭遇成员', () => {
        const hero = traitHero([nuke('cut', 25)], { passives: [watcher('kill')] });
        const run = build([hero, member('s', 'sl', '史莱姆', { passives: [openingStatus('split')] }), member('o', null, '路人')]);
        const split = playNamed(run.state, 'cut', 's');
        const kids = split.state.order.filter((id) => split.state.units[id].splitFrom === 's').map((id) => split.state.units[id]);
        assert.deepEqual(kids.map((u) => [u.name, u.baseName, u.encounter]), [['史莱姆乙', '史莱姆', 'sl'], ['史莱姆丙', '史莱姆', 'sl']]);
        assert.equal(fired(split.events, 'kill'), 0);
        const caller = member('m', 'pack', '首领', { skills: [{ id: 'call', name: 'call', intent: 'special', effects: [{ op: 'summon-minion', amount: 1, hp: 30, damage: 1 }] }] });
        const pack = build([traitHero([nuke('n1')], { passives: [watcher('kill')] }), caller, member('o', null, '路人')]);
        const summoned = act(pack.state);
        const minion = summoned.state.order.map((id) => summoned.state.units[id]).find((u) => u.minion === true);
        assert.equal(minion?.encounter, 'pack');
        const killed = playNamed(summoned.state, 'n1', 'm');
        assert.equal(fired(killed.events, 'kill'), 1, '爪牙存活不阻止首领计击杀');
    });

    it('单目标道具转向背击单位，背向的那只攻击 ×1.5；重放一致', () => {
        const claw = (id, name, damage) => member(id, 'crab', name, { passives: [openingStatus('flank')], skills: [{ id: 'hit', name: 'hit', intent: 'attack', effects: [{ op: 'damage', amount: damage }] }] });
        const items = [{ itemId: 'pot', name: '药', count: 1, effects: [{ op: 'damage', amount: 1, target: 'enemy' }] }];
        const run = build([heroUnit(), claw('fa', '碎爪', 10), claw('fb', '火箭爪', 4)], { items });
        const used = act(run.state, { type: 'item', itemId: 'pot', targetId: 'fb' });
        assert.equal(used.state.units.hero.res.facing, 'fb');
        assert.ok(used.events.some((e) => e.type === 'face' && e.targetId === 'fb'));
        const turn = act(used.state);
        const hits = turn.events.filter((e) => e.type === 'damage' && e.target === 'hero');
        assert.equal(hits.find((e) => e.source?.unitId === 'fa').amount, 15);
        assert.equal(hits.find((e) => e.source?.unitId === 'fb').amount, 4);
        assert.deepEqual(replayBattle(run.setup, 7, [{ type: 'item', itemId: 'pot', targetId: 'fb' }, END_TURN]).state, turn.state);
        const legacy = build([heroUnit(), { ...claw('fa', '碎爪', 10), encounter: undefined }, { ...claw('fb', '火箭爪', 4), encounter: undefined }], { items });
        const old = act(legacy.state, { type: 'item', itemId: 'pot', targetId: 'fb' });
        assert.notEqual(old.state.units.hero.res?.facing, 'fb', '未分组的旧战斗道具不改朝向');
        assert.equal(old.events.some((e) => e.type === 'face'), false);
    });
});
describe('M8 遭遇条目展开（方案 A）', () => {
    const library = () => prepareEnemyEntries([dataEnemy(30), dataEnemy(31, 60, 8), dataEnemy(32, 40, 12, {}, 'pending')]).entries;
    const enc = (members, extra = {}) => ({ id: 'enc-test', name: '测试遭遇', tier: 'normal', members, ...extra });

    it('遭遇条目校验：id、成员引用、数量与总数越界即抛错；成员未收录记 unavailable 且不能物化', () => {
        const entries = library();
        const [a, b, pending] = entries;
        assert.throws(() => prepareEncounters([enc([{ enemyId: a.id, count: 2 }], { id: 'bad id' })], entries), /enemy-encounter:bad id:id/);
        assert.throws(() => prepareEncounters([enc([{ enemyId: a.id, count: 2 }]), enc([{ enemyId: b.id, count: 2 }])], entries), /:id$/);
        assert.throws(() => prepareEncounters([enc([{ enemyId: 'en-none', count: 2 }])], entries), /:member$/);
        assert.throws(() => prepareEncounters([enc([{ enemyId: a.id, count: 1 }, { enemyId: a.id, count: 1 }])], entries), /:member$/);
        assert.throws(() => prepareEncounters([enc([{ enemyId: a.id, count: 0 }, { enemyId: b.id, count: 2 }])], entries), /:count$/);
        assert.throws(() => prepareEncounters([enc([{ enemyId: a.id, count: 1 }])], entries), /:size$/);
        assert.throws(() => prepareEncounters([enc([{ enemyId: a.id, count: 6 }])], entries), /:size$/);
        const [blocked] = prepareEncounters([enc([{ enemyId: a.id, count: 1 }, { enemyId: pending.id, count: 1 }])], entries);
        assert.deepEqual(blocked.unavailable, [pending.id]);
        assert.equal(materializeEncounter(blocked, entries), null);
        assert.equal(encounterByName('测试遭遇', [blocked], entries), null);
    });

    it('名单名字解析到遭遇条目时由程序展开成员、写同一 encounter，同名成员建局编甲乙；普通同名多只不写分组', () => {
        const entries = library();
        const [a, b] = entries;
        const list = prepareEncounters([enc([{ enemyId: a.id, count: 2 }, { enemyId: b.id, count: 1 }])], entries);
        const encounter = encounterByName(' 测试遭遇 ', list, entries);
        assert.equal(encounter.kind, 'encounter');
        assert.equal(encounterSize(encounter), 3);
        assert.equal(encounterByName('别的名字', list, entries), null);
        const solo = materializeEnemy(a, 'original');
        const templates = new Map([['测试遭遇', encounter], ['杂兵', solo]]);
        const grouped = enemyUnits({ tier: 'normal', enemies: [{ name: '测试遭遇', count: 1 }] }, templates, 1, 'normal');
        assert.deepEqual(grouped.units.map((u) => [u.id, u.name, u.encounter]), [
            ['enc-test-1-m1-1', a.name, 'enc-test-1'], ['enc-test-1-m1-2', a.name, 'enc-test-1'], ['enc-test-1-m2-1', b.name, 'enc-test-1'],
        ]);
        assert.deepEqual(grouped.tiers, ['normal', 'normal', 'normal']);
        const setup = { rulesVersion: 6, controlledId: 'hero', units: [heroUnit(), ...grouped.units] };
        const battle = createBattle(setup, 7);
        assert.equal(battle.ok, true, JSON.stringify(battle.error));
        assert.deepEqual(['enc-test-1-m1-1', 'enc-test-1-m1-2', 'enc-test-1-m2-1'].map((id) => battle.state.units[id].name), [`${a.name}甲`, `${a.name}乙`, b.name]);
        assert.deepEqual(replayBattle(setup, 7, [END_TURN]).state, applyAction(battle.state, END_TURN).state);
        const plain = enemyUnits({ tier: 'normal', enemies: [{ name: '杂兵', count: 2 }] }, templates, 1, 'normal');
        assert.deepEqual(plain.units.map((u) => [u.name, Object.hasOwn(u, 'encounter')]), [['杂兵甲', false], ['杂兵乙', false]]);
    });

    it('未登记的名字按单体敌人处理', () => {
        assert.equal(encounterByName('暗生团'), null);
        assert.equal(encounterByName(''), null);
    });

    it('帝蟹遭遇：两爪同场各走五步循环，背向的那只攻击 ×1.5，一爪倒下另一爪蟹怒；重放一致', () => {
        const build = (units) => {
            const setup = { rulesVersion: 6, controlledId: 'hero', units };
            const battle = createBattle(setup, 7);
            assert.equal(battle.ok, true, JSON.stringify(battle.error));
            return { ...battle, setup };
        };
        const crab = encounterByName('帝蟹');
        assert.equal(crab.tier, 'boss');
        assert.equal(encounterSize(crab), 2);
        assert.deepEqual(crab.members.map((m) => m.profile.name), ['帝蟹碎爪', '帝蟹火箭爪']);
        const [crusher, rocket] = crab.members.map((m) => m.profile);
        const claw = (id, profile) => foeUnit({ id, name: profile.name, encounter: 'crab', maxHp: 30, skills: profile.skills, script: profile.script, passives: profile.passives });
        const amountOf = (profile, skillId) => profile.skills.find((s) => s.id === skillId).effects.find((e) => e.op === 'damage').amount;
        const rageBlock = crusher.passives.find((p) => p.id === 'crab-rage').effects.find((e) => e.op === 'block').amount;

        const loop = build([traitHero([testCard('wait', 'skill', [{ op: 'block', amount: 1 }])], { maxHp: 500 }), claw('cr', crusher), claw('ro', rocket)]);
        let state = loop.state;
        const used = { cr: [], ro: [] };
        for (let i = 0; i < 10; i += 1) {
            const step = act(state);
            for (const e of step.events) if (e.type === 'skill' && used[e.unitId]) used[e.unitId].push(e.skillId);
            state = step.state;
        }
        assert.deepEqual(used.cr, ['thrash', 'enlarge', 'sting', 'adapt', 'guarded', 'thrash', 'enlarge', 'sting', 'adapt', 'guarded']);
        assert.deepEqual(used.ro, ['reticle', 'beam', 'charge', 'laser', 'recharge', 'reticle', 'beam', 'charge', 'laser', 'recharge']);

        const hero = traitHero([testCard('poke', 'attack', [{ op: 'damage', amount: 1 }]), testCard('nuke', 'attack', [{ op: 'damage', amount: 99 }])], { maxHp: 500 });
        const run = build([hero, claw('cr', crusher), claw('ro', rocket)]);
        assert.equal(run.state.units.cr.statuses.flank, 1);
        assert.equal(run.state.units.ro.statuses.flank, 1);
        const inst = (s, id) => s.piles.hero.hand.find((key) => s.cards[key].cardId === id);
        const actions = [{ type: 'play', inst: inst(run.state, 'poke'), targetId: 'cr' }];
        const faced = act(run.state, actions[0]);
        assert.equal(faced.state.units.hero.res.facing, 'cr');
        actions.push({ type: 'play', inst: inst(faced.state, 'nuke'), targetId: 'ro' });
        const killed = act(faced.state, actions[1]);
        assert.equal(killed.state.units.ro.alive, false);
        assert.equal(killed.state.outcome ?? null, null);
        assert.equal(killed.events.filter((e) => e.type === 'passive' && e.trigger === 'mate-down' && e.unitId === 'cr').length, 1);
        assert.equal(killed.state.units.cr.statuses.strength, 6);
        assert.equal(killed.state.units.cr.block, rageBlock);
        const turn = act(killed.state);
        actions.push(END_TURN);
        const hits = turn.events.filter((e) => e.type === 'damage' && e.target === 'hero');
        assert.deepEqual(hits.map((e) => [e.source?.unitId, e.amount]), [['cr', amountOf(crusher, 'thrash') + 6]]);
        assert.deepEqual(replayBattle(run.setup, 7, actions).state, turn.state);

        const fresh = build([hero, claw('cr', crusher), claw('ro', rocket)]);
        const flanked = act(act(fresh.state, { type: 'play', inst: inst(fresh.state, 'poke'), targetId: 'cr' }).state);
        const rocketHit = flanked.events.find((e) => e.type === 'damage' && e.target === 'hero' && e.source?.unitId === 'ro');
        assert.equal(rocketHit.amount, Math.floor(amountOf(rocket, 'reticle') * 1.5));
    });
});
describe('敌人特性池与 enemy-roster（#enemy-draw）', () => {
    const roster = (names, tier = 'normal', seed = 'roster-seed', existing) => enemyRosterEntities({ enemies: names.map((name) => ({ name })), tier, seed, existing });
    const replyWith = (key, rows) => JSON.stringify({ entities: [{ key, value: { enemies: rows } }] });

    it('64 个种子下普通/精英/首领池原版:缝合恰为 1:1，编号唯一，缝合项可物化，说明为单句短句', () => {
        for (const tier of ['normal', 'elite', 'boss']) {
            const originals = enemyCandidates({ tier }).length;
            assert.ok(originals > 0, tier);
            for (let i = 0; i < 64; i += 1) {
                const seed = `pool|${i}`;
                const pool = enemyPool({ tier, seed });
                const kinds = pool.map((item) => item.kind);
                assert.equal(kinds.filter((k) => k === 'original').length, originals, `${tier} ${seed}`);
                assert.equal(kinds.filter((k) => k === 'stitched').length, originals, `${tier} ${seed}`);
                assert.deepEqual(pool.map((item) => item.code), pool.map((_, n) => `E${String(n + 1).padStart(2, '0')}`));
                for (const item of pool) {
                    assert.equal(normalizeProfile(item.profile).ok, true, `${seed} ${item.code}`);
                    assert.equal(item.profile.template.model, item.kind);
                    assert.equal(item.text.length <= DESCRIBE_TEXT_MAX, true, item.text);
                    assert.equal(item.text.indexOf('。'), item.text.length - 1, item.text);
                    assert.equal(item.text.includes(UNKNOWN_TEXT), false, item.text);
                    assert.ok(item.fit.length > 0, `${tier} ${seed} ${item.code}`);
                    assert.equal(item.fit, describeEnemySuitability(item.profile));
                    if (item.kind !== 'stitched') continue;
                    assert.equal(item.profile.script, undefined);
                    assert.ok(item.profile.skills.length >= 2 && item.profile.skills.length <= 4);
                    assert.ok(item.profile.passives.length <= 1);
                    assert.ok(item.profile.skills.some((s) => s.effects.some((e) => e.op === 'damage' || e.op === 'drain')));
                }
                if (i < 4) assert.deepEqual(enemyPool({ tier, seed }), pool, '同种子池相同');
            }
        }
        assert.notDeepEqual(enemyPool({ tier: 'normal', seed: 'a' }).map((i) => i.code + i.text), enemyPool({ tier: 'normal', seed: 'b' }).map((i) => i.code + i.text));
    });

    it('说明只概括特征：不列招式数值', () => {
        const text = describeEnemy(materializeEnemy(enemyCandidates({ tier: 'normal' })[0], 'original'));
        assert.match(text, /^[^。]+，[^。]+。$/);
        assert.equal(/\d/.test(text), false, text);
    });

    it('适配指引取自最终能力，缝合不继承已舍弃的盗金、休眠或爆炸能力', () => {
        const profile = enemyProfile({ skills: [skill('suck', { effects: [{ op: 'drain', amount: 5, target: 'enemy' }] })] });
        const fit = describeEnemySuitability(profile);
        assert.match(fit, /吸血、寄生/);
        assert.doesNotMatch(fit, /窃贼|休眠|爆炸/);
        const thief = describeEnemySuitability({ ...profile, skills: [skill('steal', { effects: [{ op: 'steal-gold', amount: 15 }] })] });
        assert.match(thief, /窃贼/);
        assert.doesNotMatch(thief, /吸血/);
        const nested = describeEnemySuitability({ ...profile, skills: [skill('curse', {
            effects: [{ op: 'conditional', then: [{ op: 'constrict', stacks: 2 }] }],
        })] });
        assert.match(nested, /缠绕/);
    });

    it('按剧情名物化所选项、兜底按种子确定', () => {
        const pool = enemyPool({ tier: 'normal', seed: 'm' });
        const stitched = pool.find((item) => item.kind === 'stitched');
        const profile = materializeChoice(stitched, { id: 'en-x', name: '山贼', art: 'orc' });
        assert.deepEqual([profile.id, profile.name, profile.art, profile.template.model], ['en-x', '山贼', 'orc', 'stitched']);
        assert.equal(materializeChoice(stitched, { id: 'en-x', name: '山贼', art: 'no-such' }).art, undefined);
        assert.equal(fallbackChoice(pool, 'k'), fallbackChoice(pool, 'k'));
        assert.ok(pool.includes(fallbackChoice(pool, 'k')));
        assert.equal(fallbackChoice([], 'k'), null);
    });

    it('同档位新敌人请求带编码、说明与适配指引；已落账复用；首领也走特性池', () => {
        const known = new Map([[enemyIdFor('老狼', 'normal'), templateEnemy('老狼')]]);
        const { entities, reused } = roster(['狼', '狼', '老狼', '匪首'], 'normal', 's', known);
        assert.equal(entities.length, 1);
        assert.deepEqual(reused, [enemyIdFor('老狼', 'normal')]);
        assert.equal(entities[0].kind, 'enemy-roster');
        assert.deepEqual(entities[0].input.enemies, ['狼', '匪首']);
        assert.deepEqual(Object.keys(entities[0].input.pool[0]).sort(), ['code', 'fit', 'text']);
        assert.deepEqual(entities[0].input.pool, entities[0].fixed.pool.map(({ code, text, fit }) => ({ code, text, fit })));
        assert.ok(entities[0].input.pool.every((item) => item.fit.length > 0));
        assert.equal(roster(['老狼'], 'normal', 's', known).entities.length, 0);
        assert.deepEqual(roster(['魔王'], 'boss').entities.map((e) => e.kind), ['enemy-roster']);
    });

    it('正常回复按编码物化并多档案写入；坏编码修正；末轮缺名/重名保留有效选择并兜底；请求失败只在内存兜底', async () => {
        const { entities } = roster(['狼', '匪首']);
        const [entity] = entities;
        const code = entity.input.pool[5].code;
        const item = entity.fixed.pool[5];
        let prompts = [];
        const run = (fn) => { prompts = []; return generateEntities(entities, { llm: { source: 'tavern' }, request: async (p) => { prompts.push(JSON.parse(p.user)); return fn(prompts.length); } }); };

        const good = await run(() => replyWith(entity.key, [['狼', code, 'beast'], ['匪首', code]]));
        assert.equal(good.ok, true);
        assert.equal(prompts.length, 1);
        const writes = generationWrites(good, { createdAt: 5 });
        assert.deepEqual(writes.profiles.map((r) => [r.id, r.name, r.kind, r.createdAt]), [[enemyIdFor('狼', 'normal'), '狼', 'enemy', 5], [enemyIdFor('匪首', 'normal'), '匪首', 'enemy', 5]]);
        assert.equal(writes.profiles[0].definition.art, 'beast');
        assert.deepEqual(writes.profiles[1].definition.skills, item.profile.skills);
        assert.equal(writes.profiles[1].definition.template.model, item.kind);

        const fixed = await run((n) => replyWith(entity.key, n === 1 ? [['狼', 'E999'], ['匪首', code]] : [['狼', code], ['匪首', code]]));
        assert.equal(fixed.ok, true);
        assert.equal(prompts.length, 2);
        assert.deepEqual(prompts[1].entities[0].previousErrors.map((e) => `${e.path}:${e.reason}`), ['enemies[0][1]:code-unknown']);

        const salvaged = await run(() => replyWith(entity.key, [['狼', code], ['狼', code]]));
        assert.equal(salvaged.ok, true);
        assert.equal(prompts.length, 3);
        const [wolf, boss] = salvaged.accepted[0].profiles;
        assert.deepEqual(wolf.skills, item.profile.skills);
        assert.deepEqual(boss.skills, fallbackChoice(entity.fixed.pool, enemyIdFor('匪首', 'normal')).profile.skills);
        assert.deepEqual(salvaged.diagnostics.find((d) => d.code === 'combat-roster-fallback').names, ['匪首']);

        const failA = await generateEntities(entities, { llm: { source: 'tavern' }, request: async () => { throw new Error('down'); } });
        const failB = await generateEntities(entities, { llm: { source: 'tavern' }, request: async () => { throw new Error('down'); } });
        assert.equal(failA.ok, false);
        assert.equal(failA.rejected[0].fallback.kind, 'template-enemies');
        assert.deepEqual(failA.rejected[0].fallback.profiles.map((p) => p.id), [enemyIdFor('狼', 'normal'), enemyIdFor('匪首', 'normal')]);
        assert.deepEqual(failA.rejected[0].fallback.profiles, failB.rejected[0].fallback.profiles);
        assert.equal(generationWrites(failA).profiles.length, 0, '请求失败的兜底不落账');
    });

    it('待证遭遇备战在请求与写表前阻断，重复准备仍拒收且不能开战', async (t) => {
        const chat = [{ is_user: false, mes: '[igs-combat:start|待证遭遇|迷失与遗忘|我|normal]', swipe_id: 0 }];
        const calls = [];
        const unexpected = (name) => async () => { calls.push(name); throw Error(name); };
        const session = createCombatSession({ chat, userName: '艾拉', getChatId: () => 'pending-encounter',
            storage: createCountingStorage(), ledger: { effectiveState: unexpected('ledger') },
            tables: { append: unexpected('table-write') }, request: unexpected('request'),
            awaitProtagonist: unexpected('protagonist'), readStoryContext: unexpected('story'),
            chatRecord: { read: () => ({ ok: true, value: null }), write: unexpected('record-write') },
        });
        t.after(() => session.dispose());
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const prepared = await session.prepare(0);
            assert.equal(prepared.ok, false);
            assert.equal(prepared.reason, 'combat-encounter-unavailable');
            assert.deepEqual(prepared.detail, { encounterId: 'enc-lost-forgotten', unavailable: ['en-sts2-glory-16'] });
            assert.equal(prepared.session.status, 'blocked');
            assert.equal(session.start().reason, 'combat-session-not-ready');
        }
        assert.deepEqual(calls, []);
        const { combatReasonText, renderCombatPanelHtml } = await import('../src/visual/igs-ui/combat-panel-render.js');
        const text = combatReasonText('combat-encounter-unavailable');
        assert.match(text, /遭遇.*尚未就绪/);
        const html = renderCombatPanelHtml({ status: 'blocked', reason: 'combat-encounter-unavailable' });
        assert.ok(html.includes(text));
        assert.ok(html.includes('data-combat-act="retry-prepare"'));
        assert.equal(html.includes('data-combat-act="start"'), false);
    });

    it('待证遭遇的新备战门禁不重建存量 setup，恢复仍按保存的种子与动作重放', (t) => {
        const chat = [{ is_user: false, mes: '[igs-combat:start|存量战斗|迷失与遗忘|我|normal]', swipe_id: 0 }];
        const located = locateCombatStart(chat, 0);
        assert.equal(located.ok, true);
        const setup = { ...setupWith(foeUnit({ skills: [guard('wait')] })), rulesVersion: 6 };
        const actions = [END_TURN];
        const expected = replayBattle(setup, 7, actions);
        assert.equal(expected.ok, true);
        const storage = createCountingStorage();
        storage.setItem(sessionKeyFor('saved-encounter'), JSON.stringify({ v: SESSION_VERSION,
            combatId: located.combatId, anchor: located.anchor, seed: 7, setup, actions,
            encounter: located.start.encounter, tiers: ['normal'], expTargets: [],
        }));
        const session = createCombatSession({ chat, userName: '艾拉', getChatId: () => 'saved-encounter', storage,
            chatRecord: { read: () => ({ ok: true, value: null }) },
        });
        t.after(() => session.dispose());
        const resumed = session.resume();
        assert.equal(resumed.ok, true, JSON.stringify(resumed));
        assert.equal(resumed.session.status, 'battle');
        assert.deepEqual(resumed.session.battle, expected.state);
        assert.deepEqual(resumed.session.events, expected.events);
    });

    it('备战：读取 full 世界书、按特性池选择并落账带 template 的敌人档案，开战成功', async (t) => {
        const f = await createGenerationFixture({ chatId: 'roster-chat' });
        t.after(f.dispose);
        const chat = f.host.SillyTavern.getContext().chat;
        chat.push({ is_user: false, mes: '[igs-combat:start|山道伏击|山贼|我|normal]', swipe_id: 0 });
        const floor = chat.length - 1;
        assert.equal(locateCombatStart(chat, floor).ok, true);
        const raw = f.services.getLedger();
        const written = [];
        const ledger = { ...raw, effectiveState: async () => {
            const state = await raw.effectiveState();
            return { ...state, attributes: { ...state.attributes, table: 'missing' }, enemies: new Map(written.map((r) => [r.id, r.definition])) };
        } };
        const tables = { append: async (table, records) => { assert.equal(table, 'profile'); written.push(...records); return { ok: true }; } };
        const reads = [];
        const requests = [];
        const records = new Map();
        const chatRecord = {
            read: (_, id) => ({ ok: true, value: records.get(id) || null }),
            write: async (_, id, patch) => { records.set(id, { ...(records.get(id) || {}), ...structuredClone(patch) }); return { ok: true }; },
        };
        const reply = (p) => JSON.stringify({ entities: JSON.parse(p.user).entities.map((e) => {
            if (e.kind === 'enemy-roster') return { key: e.key, value: { enemies: e.input.enemies.map((name) => [name, e.input.pool[2].code]) } };
            if (e.kind === 'encounter-theme') return { key: e.key, value: { theme: 'wuxia' } };
            const values = (slots) => slots.map((s, i) => [`奖励${i}`, s.kind === 'card' ? (s.cost === 0 ? 'flex' : 'strike') : s.kind === 'gear' ? (s.relic ? null : s.templates[0]) : s.kind === 'item' ? 'potion' : null, '山道所得']);
            return { key: e.key, value: { slots: values(e.input.slots), reserve: values(e.input.reserve) } };
        }) });
        const session = createCombatSession({ ledger, tables, chat, getChatId: () => 'roster-chat', userName: '艾拉', storage: createCountingStorage(), chatRecord,
            readStoryContext: async (args) => { reads.push(args); return { story: '山道上传来哨声。', worldInfo: '山贼盘踞黑风岭。' }; },
            request: async (p) => { requests.push(JSON.parse(p.user)); return reply(p); }, llm: { source: 'tavern' }, retryDelays: [], now: () => 1 });
        t.after(() => session.dispose());
        const prepared = await session.prepare(floor);
        assert.equal(prepared.ok, true, JSON.stringify(prepared));
        assert.equal(reads[0].full, true);
        assert.ok(reads[0].names.includes('山贼'));
        const sent = requests[0];
        assert.equal(sent.context.worldInfo, '山贼盘踞黑风岭。');
        const rosterReq = sent.entities.find((e) => e.kind === 'enemy-roster');
        assert.deepEqual(rosterReq.input.enemies, ['山贼']);
        assert.equal(sent.entities.some((e) => e.kind === 'enemy'), false);
        assert.equal(written.length, 1);
        assert.equal(written[0].id, enemyIdFor('山贼', 'normal'));
        assert.ok(written[0].definition.template);
        assert.equal(session.start().ok, true);
    });
});

describe('敌人意图显示与实伤对账', () => {
    const fromSource = (effects, source = 'sts2', extra = {}, hero = heroUnit()) => battleWithTraits(foeUnit({
        template: { enemyId: `en-${source}-intent-01`, model: 'original' },
        skills: [skill('intent', { effects })], ...extra,
    }), { ...hero, maxHp: 999 });

    it('不同攻击组保留每段与段数，力量/虚弱/易伤/倍率按段取整，显示只读且重放一致', () => {
        const battle = fromSource([
            { op: 'damage', amount: 7, hits: 3, target: 'enemy' },
            { op: 'damage', amount: 2, hits: 2, target: 'enemy' },
        ], 'sts2', { damageScale: 1.5, passives: [{ id: 'mods', name: '修正', trigger: 'battle-start', effects: [
            { op: 'status', status: 'strength', stacks: 2, target: 'self' },
            { op: 'status', status: 'weak', stacks: 3, target: 'self' },
        ] }] }, { ...heroUnit(), passives: [{ id: 'vuln', name: '易伤', trigger: 'battle-start', effects: [
            { op: 'status', status: 'vulnerable', stacks: 3, target: 'self' },
        ] }] });
        const before = JSON.stringify(battle.state);
        const intent = describeIntent(battle.state, 'foe');
        assert.deepEqual(intent.attacks, [{ damage: 13, hits: 3, target: 'enemy' }, { damage: 4, hits: 2, target: 'enemy' }]);
        assert.equal(intent.damage, 47);
        assert.equal(JSON.stringify(battle.state), before);
        const out = act(battle.state);
        const hits = out.events.filter((e) => e.type === 'damage' && e.source?.unitId === 'foe');
        assert.deepEqual(hits.map((e) => e.amount), [13, 13, 13, 4, 4]);
        assert.equal(hits.reduce((n, e) => n + e.hpLoss, 0), intent.damage);
        const replayed = replayBattle(battle.setup, 7, [END_TURN]);
        assert.deepEqual(replayed.state, out.state);
        assert.deepEqual(replayed.events, [...battle.events, ...out.events]);
    });

    it('零伤多段仍显示攻击与零乘段数，不伪装成没有攻击', async () => {
        const battle = fromSource([{ op: 'damage', amount: 1, hits: 4, target: 'enemy' }], 'sts2', {
            passives: [{ id: 'weak', name: '虚弱', trigger: 'battle-start', effects: [{ op: 'status', status: 'weak', stacks: 2, target: 'self' }] }],
        });
        const intent = describeIntent(battle.state, 'foe');
        assert.deepEqual(intent.kinds, ['attack']);
        assert.deepEqual(intent.attacks, [{ damage: 0, hits: 4, target: 'enemy' }]);
        const { intentDamageText } = await import('../src/visual/igs-ui/combat-intent.js');
        assert.equal(intentDamageText({ ...intent, kind: intent.intent }), '0×4');
        assert.equal(act(battle.state).state.units.hero.hp, 999);
    });

    it('S1 合并意图、S2 并列意图；吸血带回复，蒸汽不额外显示强化', () => {
        const attack = { op: 'damage', amount: 5, target: 'enemy' };
        const block = { op: 'block', amount: 5, target: 'self' };
        const weak = { op: 'status', status: 'weak', stacks: 1, target: 'enemy' };
        const strength = { op: 'status', status: 'strength', stacks: 1, target: 'self' };
        const kinds = (effects, source = 'sts2', extra) => describeIntent(fromSource(effects, source, extra).state, 'foe').kinds;
        assert.deepEqual(kinds([attack, block], 'sts1'), ['attack-defend']);
        assert.deepEqual(kinds([attack, block]), ['attack', 'defend']);
        assert.deepEqual(kinds([attack, weak], 'sts1'), ['attack-debuff']);
        assert.deepEqual(kinds([attack, weak]), ['attack', 'debuff']);
        assert.deepEqual(kinds([block, strength], 'sts1'), ['defend-buff']);
        assert.deepEqual(kinds([block, weak], 'sts1'), ['defend-debuff']);
        assert.deepEqual(kinds([{ op: 'drain', amount: 5, hits: 1, target: 'enemy' }], 'sts1'), ['attack-buff']);
        assert.deepEqual(kinds([{ op: 'drain', amount: 5, hits: 1, target: 'enemy' }]), ['attack', 'heal']);
        assert.deepEqual(kinds([attack, { op: 'apply-status', status: 'steam', stacks: 3, target: 'self' }]), ['attack']);
        assert.deepEqual(kinds([{ op: 'create', card: 'status-daze', amount: 1, to: 'discard' }], 'sts1'), ['debuff']);
        assert.deepEqual(kinds([{ op: 'create', card: 'status-daze', amount: 1, to: 'discard' }]), ['status']);
        assert.deepEqual(kinds([{ op: 'apply-status', status: 'flee', stacks: 1, target: 'self' }], 'sts1'), ['escape']);
        assert.deepEqual(kinds([attack, { op: 'self-destruct' }], 'sts1'), ['unknown']);
        assert.deepEqual(kinds([attack, { op: 'self-destruct' }]), ['explode']);
        const asleep = fromSource([{ op: 'idle' }], 'sts1', {
            skills: [skill('sleep', { intent: 'idle', effects: [{ op: 'idle' }] }), skill('intent')],
            script: { cycle: ['intent'], sleep: { skill: 'sleep', turns: 3 } },
        });
        assert.deepEqual(describeIntent(asleep.state, 'foe').kinds, ['sleep']);
        const stunned = fromSource([attack], 'sts2', {}, { ...heroUnit(), passives: [{
            id: 'stun', name: '眩晕', trigger: 'battle-start',
            effects: [{ op: 'apply-status', status: 'stun', stacks: 1, target: 'enemy' }],
        }] });
        assert.deepEqual(describeIntent(stunned.state, 'foe').kinds, ['stun']);
        assert.equal(describeIntent(stunned.state, 'foe').damage, 0);
    });

    it('当前修正立即反映在意图；随机/全体攻击保留目标范围且不消耗随机数', () => {
        for (const target of ['random-enemy', 'all-enemies']) {
            const battle = fromSource([{ op: 'damage', amount: 6, hits: 2, target }]);
            const before = JSON.stringify(battle.state);
            assert.deepEqual(describeIntent(battle.state, 'foe').attacks, [{ damage: 6, hits: 2, target }]);
            assert.equal(JSON.stringify(battle.state), before);
            const out = act(battle.state);
            assert.deepEqual(out.events.filter((e) => e.type === 'damage' && e.source?.unitId === 'foe').map((e) => e.amount), [6, 6]);
        }
        const battle = fromSource([{ op: 'damage', amount: 6, hits: 2, target: 'enemy' }]);
        const changed = { ...battle.state, units: { ...battle.state.units,
            foe: { ...battle.state.units.foe, statuses: { strength: 2 } },
        } };
        assert.equal(describeIntent(battle.state, 'foe').damage, 12);
        assert.deepEqual(describeIntent(changed, 'foe').attacks, [{ damage: 8, hits: 2, target: 'enemy' }]);
    });

    it('默认与九套画布皮肤均显示每段×段数和并列图标；未知意图不泄漏攻击数字', async () => {
        const { JSDOM } = await import('jsdom');
        const { battleView } = await import('../src/visual/igs-ui/combat-panel-model.js');
        const { renderCombatPanelHtml } = await import('../src/visual/igs-ui/combat-panel-render.js');
        const { CANVAS_BATTLE } = await import('../src/visual/igs-ui/combat-skin-registry.js');
        const battle = fromSource([{ op: 'damage', amount: 6, hits: 3, target: 'enemy' }, { op: 'block', amount: 5, target: 'self' }]);
        const view = battleView(battle.state);
        for (const skin of ['initial', ...Object.keys(CANVAS_BATTLE)]) {
            const dom = new JSDOM(renderCombatPanelHtml({ status: 'battle', battle: view, skin, orient: 'port' }));
            const intent = dom.window.document.querySelector('[data-intent="attack"]');
            assert.ok(intent, skin);
            assert.equal(intent.querySelector('b').textContent, '6×3', skin);
            assert.equal(intent.querySelectorAll('svg').length, 2, skin);
            assert.match(intent.title, /合计 18/);
            dom.window.close();
        }
        const unknown = fromSource([{ op: 'damage', amount: 30, target: 'enemy' }, { op: 'self-destruct' }], 'sts1');
        const dom = new JSDOM(renderCombatPanelHtml({ status: 'battle', battle: battleView(unknown.state), skin: 'initial' }));
        const intent = dom.window.document.querySelector('[data-intent="unknown"]');
        assert.ok(intent);
        assert.equal(intent.querySelector('b'), null);
        assert.doesNotMatch(intent.title, /30|合计/);
        dom.window.close();
    });
});