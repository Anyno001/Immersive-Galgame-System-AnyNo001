// 规则 v6 职业被动固定表；版本标记只写入新生成的职业档案。
export const CLASS_PASSIVE_VERSION = 1;
const op = (op, fields) => ({ op, ...fields });
const draw = (amount) => op('draw', { amount });
const summon = (amount) => op('summon', { amount });
const when = (value, then) => op('conditional', { when: { kind: 'turn-eq', value }, then });
const opening = (effects, description) => ({ trigger: 'battle-start', effects, description });
const turns = (effects, description) => ({ trigger: 'turn-start', effects, description });
const miracle = (amount) => op('create', { card: 'token-miracle', amount, to: 'hand' });
const freeze = (value) => {
    if (value && typeof value === 'object') {
        Object.freeze(value);
        for (const child of Object.values(value)) freeze(child);
    }
    return value;
};
export const CLASS_PASSIVES = freeze({
    warrior: { name: '战意', tiers: [1, 2, 3].map((stacks) => opening([
        op('status', { status: 'strength', stacks, target: 'self' }),
    ], `开战获得 ${stacks} 层攻击力`)) },
    guardian: { name: '坚守', tiers: [8, 12, 15].map((amount) => opening([
        op('block', { amount, target: 'self' }),
    ], `开战获得 ${amount} 点格挡`)) },
    ranger: { name: '追猎', tiers: [2, 3, 4].map((amount) => ({
        trigger: 'discard', effects: [op('damage', { amount, hits: 1, target: 'random-enemy' })],
        description: `每主动弃 1 张牌，对随机敌人造成 ${amount} 点伤害`,
    })) },
    assassin: { name: '先觉', tiers: [opening([draw(2)], '开战多抽 2 张牌'),
        ...[2, 3].map((n) => turns([1, 2, 3].map((t) => when(t, [draw(n)])), `前 3 回合开始时各多抽 ${n} 张牌`)),
    ] },
    mage: { name: '雷蕴', tiers: [0, 1, 2].map((stacks) => opening([
        ...(stacks ? [op('apply-status', { status: 'arc-core', stacks, target: 'self' })] : []),
        op('channel', { orb: 'lightning', amount: stacks ? 3 : 1 }),
    ], `开战凝结 ${stacks ? 3 : 1} 颗雷珠${stacks ? `，本场雷珠伤害 +${stacks}` : ''}`)) },
    summoner: { name: '契灵', tiers: [turns([summon(1)], '每回合开始时召唤 1'),
        ...[[5, 2], [6, 3]].map(([first, per]) => turns([
            op('counter', { mode: 'battle-first', then: [summon(first)] }), summon(per),
        ], `首次回合开始额外召唤 ${first}，每回合开始时召唤 ${per}`)),
    ] },
    priest: { name: '辉源', tiers: [3, 7, 9].map((n) => opening([
        op('radiance', { amount: Math.min(5, n) }), ...(n > 5 ? [op('radiance', { amount: n - 5 })] : []),
    ], `开战获得 ${n} 点圣辉`)) },
    bard: { name: '灵感', tiers: [1, 3, 4].map((n) => opening([
        miracle(Math.min(3, n)), ...(n > 3 ? [miracle(n - 3)] : []),
    ], `开战将 ${n} 张「奇迹」加入手牌`)) },
});

export function fixedClassPassive(archetype, tier = 1, id = `cp-${archetype}`) {
    if (!Object.hasOwn(CLASS_PASSIVES, archetype) || !Number.isInteger(tier) || tier < 1 || tier > 3) return null;
    const { name, tiers } = CLASS_PASSIVES[archetype];
    return { id, name, ...JSON.parse(JSON.stringify(tiers[tier - 1])) };
}