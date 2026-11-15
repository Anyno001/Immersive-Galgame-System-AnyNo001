// 敌人难度词缀的纯数据定义，供生产装配与固定编组校验共用。
const statusEffect = (status, stacks, target = 'self') => ({ op: 'status', status, stacks, target });
const selfApply = (status, stacks) => ({ op: 'apply-status', status, stacks, target: 'self' });
const affix = (name, trigger, effects, extra = {}) => Object.freeze({ name, trigger, effects: Object.freeze(effects), ...extra });

export const ENEMY_AFFIXES = Object.freeze({
    rite: affix('祭仪', 'turn-start', [statusEffect('strength', 1)]),
    plate: affix('铁甲', 'turn-end', [{ op: 'block', amount: 6, target: 'self' }]),
    spikes: affix('棘刺', 'battle-start', [statusEffect('thorns', 3)]),
    renew: affix('复生', 'turn-end', [{ op: 'heal', amount: 4, target: 'self' }]),
    fury: affix('怒意', 'on-hit', [statusEffect('strength', 1)]),
    curl: affix('蜷身', 'on-hit', [{ op: 'block', amount: 3, target: 'self' }]),
    relic: affix('秘器', 'battle-start', [statusEffect('artifact', 2)]),
    rile: affix('躁怒', 'foe-card-played', [statusEffect('strength', 1)], { cardType: 'skill' }),
    sap: affix('萎靡之气', 'battle-start', [statusEffect('weak', 2, 'all-enemies')], { debuff: true }),
    breach: affix('破绽', 'battle-start', [statusEffect('vulnerable', 2, 'all-enemies')], { debuff: true }),
    brittle: affix('蚀骨', 'battle-start', [statusEffect('frail', 2, 'all-enemies')], { debuff: true }),
    pulse: affix('心律', 'foe-card-played', [{ op: 'damage', amount: 1, hits: 1, target: 'enemy' }], { debuff: true }),
    daze: affix('晕眩', 'turn-end', [{ op: 'create', card: 'status-daze', amount: 1, to: 'draw' }], { debuff: true }),
    wound: affix('撕伤', 'battle-start', [{ op: 'create', card: 'status-wound', amount: 2, to: 'draw' }], { debuff: true }),
    flight: affix('翱翔', 'battle-start', [selfApply('flying', 3)], { tiers: ['normal', 'elite'] }),
    unsteady: affix('失衡', 'battle-start', [selfApply('unsteady', 1)], { tiers: ['elite'] }),
    adapt: affix('应变', 'battle-start', [selfApply('adapt', 1)], { tiers: ['elite'] }),
    harden: affix('硬化', 'battle-start', [selfApply('harden', 3)], { tiers: ['normal'] }),
    enrage: affix('激怒', 'battle-start', [selfApply('enrage', 1)], { tiers: ['elite', 'boss'] }),
    barbed: affix('刺甲', 'battle-start', [selfApply('barbed', 3)], { tiers: ['elite'] }),
    'time-warp': affix('时滞', 'battle-start', [selfApply('time-warp', 1)], { tiers: ['boss'] }),
    split: affix('分裂', 'battle-start', [selfApply('split', 1)], { tiers: ['normal', 'boss'] }),
    revive: affix('不灭', 'battle-start', [selfApply('revive', 1)], { tiers: ['normal'] }),
    fuse: affix('自爆', 'battle-start', [selfApply('fuse', 3)], { tiers: ['normal'] }),
    flee: affix('遁逃', 'battle-start', [selfApply('flee', 4)], { tiers: ['normal'] }),
    invincible: affix('无敌', 'battle-start', [selfApply('invincible', 3)], { tiers: ['boss'] }),
    'hit-cap': affix('坚韧', 'battle-start', [selfApply('hit-cap', 2)], { tiers: ['boss'] }),
    maim: affix('摧魄', 'battle-start', [selfApply('maim', 2)], { tiers: ['boss'] }),
    'play-cap': affix('束缚', 'battle-start', [selfApply('play-cap', 6)], { tiers: ['elite', 'boss'] }),
    'skill-cap': affix('封技', 'battle-start', [selfApply('skill-cap', 3)], { tiers: ['elite'] }),
    downgrade: affix('降级', 'battle-start', [{ op: 'apply-status', status: 'downgrade', stacks: 1, target: 'all-enemies' }], { tiers: ['boss'], debuff: true }),
});

