// 敌人模板 M7 二选一诅咒（offer-curse，Knowledge Demon 类）：只限技能单位。
// 敌方出手只把选项排进 state.offers；轮到对方操控角色的玩家回合（开局结算完、未晕厥）时由引擎挂起 state.pending（kind 'foe-curse'），
// 候选为 'curse:0' / 'curse:1'，只能由玩家经 choose 动作选择（托管不代选），选中项按层数叠加为本场状态，不进手牌或牌组。
// 同一角色有多份待选时按排队顺序逐份挂起。四种诅咒的时点与叠加均为项目选择，原版定义未闭合：
// 瓦解每个自己回合结束受到层数点伤害（可被格挡）、心智腐朽每回合少抽层数张、怠惰每回合最多打出层数张、衰竭回合开始少层数点能量。
import { registerMechanic } from './registry.js';

const st = (unit, key) => unit?.statuses?.[key] || 0;
export const CURSE_CHOICE_KIND = 'foe-curse';
export const CURSE_STATUSES = Object.freeze(['disintegration', 'mind-rot', 'sloth', 'waste-away']);
export const CURSE_LABELS = Object.freeze({ disintegration: '瓦解', 'mind-rot': '心智腐朽', sloth: '怠惰', 'waste-away': '衰竭' });
const CURSE_TEXT = Object.freeze({
    disintegration: (n) => `每回合结束受到 ${n} 点伤害`,
    'mind-rot': (n) => `每回合少抽 ${n} 张牌`,
    sloth: (n) => `每回合最多打出 ${n} 张牌`,
    'waste-away': (n) => `每回合少 ${n} 点能量`,
});
// curseDetail 只有效果说明（面板与名称分开显示）；curseText 带名称（算子描述用）。
export const curseDetail = (option) => CURSE_TEXT[option.status](option.stacks);
export const curseText = (option) => `${CURSE_LABELS[option.status]}：${curseDetail(option)}`;
const optionId = (index) => `curse:${index}`;

// 对方操控角色处于玩家阶段且有排队的诅咒时，挂起第一份选择并返回 pending；否则返回 null。调用方须传可写的局面。
export function openCurseOffer(state) {
    if (state.pending || state.outcome || state.phase !== 'player' || !(state.rulesVersion >= 5)) return null;
    const hero = state.units[state.controlledId];
    if (!hero?.alive) return null;
    const offer = (state.offers || []).find((item) => item.owner === hero.id);
    if (!offer) return null;
    state.pending = {
        kind: CURSE_CHOICE_KIND, unitId: hero.id, count: 1,
        options: offer.options.map((_, index) => optionId(index)), offer: offer.options.map((option) => ({ ...option })),
    };
    return state.pending;
}

// 消费挂起的诅咒选择（pick 已由引擎按 pending.options 校验）：出队并返回 { unit, option, from }。
export function takeCurse(state, pick) {
    const pending = state.pending;
    const index = pending.options.indexOf(pick);
    const offers = state.offers || [];
    const at = offers.findIndex((item) => item.owner === pending.unitId);
    const offer = offers[at];
    const rest = offers.filter((_, i) => i !== at);
    if (rest.length) state.offers = rest;
    else delete state.offers;
    delete state.pending;
    return { unit: state.units[pending.unitId], option: offer.options[index], from: offer.from };
}

function validateOption(item, path, state, kit) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { kit.addIssue(state, path, 'expected-object'); return undefined; }
    kit.checkKnownFields(item, ['status', 'stacks'], path, state);
    return { status: kit.enumField(item.status, kit.joinPath(path, 'status'), state, CURSE_STATUSES), stacks: kit.intField(item.stacks, kit.joinPath(path, 'stacks'), state, 1, 20) };
}

registerMechanic({
    key: 'foe-curse', family: 'general', archetypes: [], unitKinds: ['skill'],
    statuses: CURSE_STATUSES.map((key) => ({ key, label: CURSE_LABELS[key], debuff: true })),
    ops: {
        'offer-curse': {
            validate(effect, path, state, kit) {
                kit.checkKnownFields(effect, ['op', 'options', 'target'], path, state);
                const options = kit.arrayField(effect.options, kit.joinPath(path, 'options'), state, 2, 2, (item, itemPath, st2) => validateOption(item, itemPath, st2, kit));
                return { op: 'offer-curse', options, target: 'enemy' };
            },
            // 只对对方操控角色排队；对方不是存活的卡组单位时不生效。
            apply(ctx, unit, effect, aimId, source, kit) {
                const state = ctx.state;
                const hero = state.units[state.controlledId];
                if (!unit.alive || !hero?.alive || hero.side === unit.side || hero.kind !== 'deck') return;
                const options = effect.options.map((option) => ({ status: option.status, stacks: option.stacks }));
                state.offers = [...(state.offers || []), { owner: hero.id, from: unit.id, options }];
                kit.emit(ctx, { type: 'curse-offered', unitId: unit.id, owner: hero.id, options: options.map((option) => ({ ...option })) });
            },
            value: () => 10,
            describe: (e) => `令对方二选一（只限本场）：${(e.options || []).map(curseText).join('，或')}`,
            brief: () => '二选一',
        },
    },
    modifiers: {
        'draw-count': (state, unit, count) => count - st(unit, 'mind-rot'),
        'card-play': (state, unit) => {
            const cap = st(unit, 'sloth');
            return cap && (unit.cardsPlayed || 0) >= cap ? 'sloth' : null;
        },
    },
    hooks: {
        'turn-start-after'(ctx, { unit }, kit) {
            const n = st(unit, 'waste-away');
            if (!n || unit.kind !== 'deck' || !unit.alive) return;
            const before = unit.energy || 0;
            unit.energy = Math.max(0, before - n);
            if (unit.energy !== before) kit.emit(ctx, { type: 'energy', unitId: unit.id, amount: unit.energy - before });
        },
        'turn-end-after'(ctx, { unit }, kit) {
            const n = st(unit, 'disintegration');
            if (!n || !unit.alive || ctx.state.outcome) return;
            kit.dealDamage(ctx, unit, n, { unitId: null, kind: 'status', id: 'disintegration' }, 'thorns', true);
        },
    },
    report(event, kit) {
        if (event.type === 'curse-offered') kit.note(event.unitId, '抛出两道诅咒逼对方抉择');
        else if (event.type === 'curse-chosen') kit.note(event.unitId, `承受了「${CURSE_LABELS[event.status] || event.status}」`);
    },
});
