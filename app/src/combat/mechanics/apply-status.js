// 规则 v5 通用状态的施加算子 apply-status（G01–G06、G21 的统一入口）；状态本身由各机制文件登记。
import { registerMechanic } from './registry.js';

// 可施加的状态：debuff 决定默认目标与可选目标，max 为单次层数上限，value 为每层估值。
export const APPLY_STATUSES = Object.freeze({
    flex: Object.freeze({ max: 10, value: 3.5 }),
    poise: Object.freeze({ max: 10, value: 3 }),
    'atk-down': Object.freeze({ debuff: true, max: 5, value: 3 }),
    'def-down': Object.freeze({ debuff: true, max: 5, value: 2.5 }),
    vigor: Object.freeze({ max: 10, value: 3 }),
    empower: Object.freeze({ max: 3, value: 9 }),
    'empower-turns': Object.freeze({ max: 2, value: 10 }),
    overpower: Object.freeze({ max: 2, value: 16 }),
    'first-strike': Object.freeze({ max: 1, value: 6 }),
    buffer: Object.freeze({ max: 3, value: 9 }),
    malice: Object.freeze({ max: 5, value: 4 }),
    dynamo: Object.freeze({ max: 2, value: 12 }),
    conserve: Object.freeze({ max: 1, value: 5 }),
    freeplay: Object.freeze({ max: 2, value: 14 }),
    // 规则 v5 P3 守护（rampart.js）。
    barricade: Object.freeze({ max: 1, value: 14 }),
    'retain-block': Object.freeze({ max: 3, value: 4 }),
    'block-surge': Object.freeze({ max: 2, value: 6 }),
    plated: Object.freeze({ max: 10, value: 3 }),
    recoil: Object.freeze({ max: 1, value: 6 }),
    bramble: Object.freeze({ max: 10, value: 1 }),
    juggernaut: Object.freeze({ max: 5, value: 4 }),
    cover: Object.freeze({ max: 1, value: 4 }),
    'share-block': Object.freeze({ max: 1, value: 10 }),
    // 规则 v5 P3 战士（forge.js）。
    pyre: Object.freeze({ max: 1, value: 16 }),
    ember: Object.freeze({ max: 6, value: 3 }),
    bloodthirst: Object.freeze({ max: 1, value: 8 }),
    // 规则 v5 P3 刺客（shadow.js）。
    envenom: Object.freeze({ max: 5, value: 4 }),
    'venom-burst': Object.freeze({ max: 10, value: 2 }),
    garrote: Object.freeze({ debuff: true, max: 5, value: 4 }),
    carrion: Object.freeze({ debuff: true, max: 2, value: 6 }),
    bladestorm: Object.freeze({ max: 2, value: 8 }),
    // 规则 v5 P3 游侠（quarry.js）。
    'hunt-mark': Object.freeze({ debuff: true, max: 10, value: 2.5 }),
    snare: Object.freeze({ debuff: true, max: 2, value: 4 }),
    deadeye: Object.freeze({ max: 3, value: 5 }),
    'combo-rise': Object.freeze({ max: 3, value: 4 }),
    // 规则 v5 P3 祈司（sanctum.js）。
    'halo-strike': Object.freeze({ max: 6, value: 4 }),
    'halo-mend': Object.freeze({ max: 4, value: 4 }),
    'steady-mend': Object.freeze({ max: 5, value: 5 }),
    'after-mend': Object.freeze({ max: 10, value: 1.5 }),
    // 规则 v5 P3 乐师（cadence.js）。
    chant: Object.freeze({ max: 3, value: 6 }),
    seethe: Object.freeze({ max: 1, value: 5 }),
    'stance-ward': Object.freeze({ max: 6, value: 3 }),
    'wrath-draw': Object.freeze({ max: 2, value: 5 }),
    'calm-guard': Object.freeze({ max: 10, value: 1.5 }),
    'scry-ward': Object.freeze({ max: 6, value: 2.5 }),
    'keep-discount': Object.freeze({ max: 1, value: 9 }),
    'echo-play': Object.freeze({ max: 2, value: 18 }),
    // 规则 v5 P3 法师（orb.js）。
    flux: Object.freeze({ max: 4, value: 3 }),
    'arc-storm': Object.freeze({ max: 1, value: 12 }),
    'lock-on': Object.freeze({ debuff: true, max: 2, value: 5 }),
    'storm-heart': Object.freeze({ max: 1, value: 9 }),
    'static-shell': Object.freeze({ max: 1, value: 8 }),
    'arc-boost': Object.freeze({ max: 6, value: 2 }),
    // 规则 v5 P3 召唤（summon.js）。
    doom: Object.freeze({ debuff: true, max: 20, value: 1.2 }),
    'minion-might': Object.freeze({ max: 6, value: 3 }),
    'minion-bond': Object.freeze({ max: 1, value: 10 }),
    'doom-touch': Object.freeze({ max: 4, value: 3 }),
    'doom-reap': Object.freeze({ max: 1, value: 12 }),
    'soul-feast': Object.freeze({ max: 3, value: 3 }),
    'soul-blight': Object.freeze({ max: 6, value: 2 }),
    'void-draw': Object.freeze({ max: 1, value: 6 }),
    'void-guard': Object.freeze({ max: 6, value: 2 }),
    'craft-might': Object.freeze({ max: 1, value: 8 }),
    'craft-guard': Object.freeze({ max: 6, value: 2 }),
    // 规则 v5 P4a 敌方状态反应（foe.js）。
    stun: Object.freeze({ debuff: true, max: 2, value: 8 }),
    flying: Object.freeze({ max: 5, value: 5 }),
    unsteady: Object.freeze({ max: 1, value: 3 }),
    adapt: Object.freeze({ max: 1, value: 3 }),
    harden: Object.freeze({ max: 6, value: 2 }),
    enrage: Object.freeze({ max: 3, value: 3 }),
    barbed: Object.freeze({ max: 6, value: 2 }),
    'time-warp': Object.freeze({ max: 2, value: 4 }),
    skybreaker: Object.freeze({ max: 1, value: 6 }),
    // 规则 v5 P4b E09 背击（foe-units.js）。
    flank: Object.freeze({ max: 1, value: 4 }),
    // 规则 v5 P4b E10 分裂、E11 复生（foe-units.js）。
    split: Object.freeze({ max: 1, value: 6 }),
    revive: Object.freeze({ max: 1, value: 6 }),
    // 规则 v5 P4b E17 自爆与限时撤离（foe-units.js），层数为剩余回合数。
    fuse: Object.freeze({ max: 5, value: 3 }),
    flee: Object.freeze({ max: 5, value: 2 }),
    // 规则 v5 P4c E16 无敌上限、E22 最大生命损伤（foe-seize.js）；上限层数 × 10% 最大生命。
    invincible: Object.freeze({ max: 5, value: 8 }),
    'hit-cap': Object.freeze({ max: 5, value: 8 }),
    maim: Object.freeze({ max: 5, value: 5 }),
    // 规则 v5 P4d E18 行动限制、E20 降级（foe-restrict.js）。play-cap / skill-cap 的层数即上限张数。
    'no-attack': Object.freeze({ debuff: true, max: 2, value: 5 }),
    'attack-tax': Object.freeze({ debuff: true, max: 2, value: 4 }),
    'no-block': Object.freeze({ debuff: true, max: 2, value: 5 }),
    'draw-down': Object.freeze({ debuff: true, max: 2, value: 4 }),
    'play-cap': Object.freeze({ max: 8, value: 4 }),
    'skill-cap': Object.freeze({ max: 5, value: 4 }),
    downgrade: Object.freeze({ debuff: true, max: 1, value: 8 }),
});
const AREA = new Set(['all-enemies', 'all-allies']);
export const targetFactor = (target) => (AREA.has(target) ? 1.4 : target === 'random-enemy' ? 0.85 : 1);

registerMechanic({
    key: 'apply-status', family: 'general', archetypes: [], unitKinds: ['deck', 'skill'],
    ops: {
        'apply-status': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'status', 'stacks', 'target'], path, state);
                const at = (key) => kit.joinPath(path, key);
                const status = kit.enumField(effect.status, at('status'), state, Object.keys(APPLY_STATUSES));
                if (!status) return undefined;
                const spec = APPLY_STATUSES[status];
                return {
                    op: 'apply-status',
                    status,
                    stacks: kit.intField(effect.stacks, at('stacks'), state, 1, spec.max),
                    target: kit.enumField(effect.target, at('target'), state, spec.debuff ? kit.OFFENSE_TARGETS : kit.SUPPORT_TARGETS, spec.debuff ? 'enemy' : 'self'),
                };
            },
            apply(ctx, unit, effect, aimId, source, kit) {
                for (const target of kit.targets()) kit.addStatus(ctx, target, effect.status, effect.stacks, source);
            },
            value: (effect) => effect.stacks * (APPLY_STATUSES[effect.status]?.value || 0) * targetFactor(effect.target),
            describe: (e, kit) => `${kit.on(e.target)}施加 ${e.stacks} 层${kit.statusName(e.status)}`,
            brief: (e, kit) => `${kit.statusName(e.status)}${e.stacks}`,
        },
    },
});
