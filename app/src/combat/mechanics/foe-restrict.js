// 规则 v5 P4d 我方限制：E18 行动限制、E20 降级（E21 塞垃圾牌沿用 create 与 G23 状态牌，见 card-templates.js 与 enemy-loadout.js）。
// 出牌限制只经 card-play 阶段登记，由 battle-state.js 的 playBlock / canPlay 统一判定（validatePlay、legalActions、托管、面板共用）。
// 挂在我方的限制（禁攻击、攻击加费、禁格挡、少抽）每回合结束减 1 层；出牌上限、技能张数上限是敌方存活时对对方生效的光环；
// 每次出牌受伤沿用既有词缀「心律」（foe-card-played），不另登记。
import { registerMechanic } from './registry.js';

const st = (unit, key) => unit?.statuses?.[key] || 0;
const foesOf = (state, unit) => state.order.map((id) => state.units[id]).filter((other) => other?.alive && other.side !== unit.side);
// 对方存活单位里某光环的最小层数（多个敌人带同一光环时取最严）；没有时为 0。
function auraOf(state, unit, key) {
    let best = 0;
    for (const foe of foesOf(state, unit)) {
        const n = st(foe, key);
        if (n > 0 && (!best || n < best)) best = n;
    }
    return best;
}

registerMechanic({
    key: 'foe-restrict', family: 'general', archetypes: [], unitKinds: ['deck', 'skill'],
    statuses: [
        { key: 'no-attack', label: '禁攻', debuff: true, decay: true },
        { key: 'attack-tax', label: '攻击加费', debuff: true, decay: true },
        { key: 'no-block', label: '禁守', debuff: true, decay: true },
        { key: 'draw-down', label: '少抽', debuff: true, decay: true },
        { key: 'play-cap', label: '束缚' },
        { key: 'skill-cap', label: '封技' },
        { key: 'downgrade', label: '降级', debuff: true },
    ],
    modifiers: {
        'card-play': (state, unit, card) => {
            if (card.type === 'attack' && st(unit, 'no-attack')) return 'no-attack';
            const cap = auraOf(state, unit, 'play-cap');
            if (cap && (unit.cardsPlayed || 0) >= cap) return 'play-cap';
            const skills = auraOf(state, unit, 'skill-cap');
            if (skills && card.type === 'skill' && (unit.turnStats?.skill || 0) >= skills) return 'skill-cap';
            return null;
        },
        'card-cost': (state, owner, view) => (view.type === 'attack' && st(owner, 'attack-tax') ? view.cost + st(owner, 'attack-tax') : view.cost),
        // 禁守：经 computeBlock 获得的格挡（卡牌与技能）归 0。
        'block-add': (source, target, value) => (st(source, 'no-block') ? 0 : value),
        'draw-count': (state, unit, count) => count - st(unit, 'draw-down'),
        'card-upgrade': (state, owner) => !st(owner, 'downgrade'),
    },
});
