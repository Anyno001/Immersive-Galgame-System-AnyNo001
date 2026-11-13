// 敌人模板 M6 新敌方特性（状态经 apply-status 施加，缠绕经 constrict 算子；只供敌人模板使用）：
// 减速 slow、跨回合时滞 chrono、硬壳 shell、刺痛 stabs、蜂巢 hive、变形 shifting、消逝 fading、妖术 hex、贪食 ravenous、
// 滑溜 slippery、胆怯 skittish、流沙 sandpit、来源绑定缠绕 constricted；蒸汽 steam 只作 M4 致死转爆炸（needs）的存量。
// 来源未闭合的边界（重置归属、零伤害与完全格挡、触发时点）按下面注释的实现选择处理，见 CONTRACT.md 与研究台账。
import { registerMechanic } from './registry.js';

export const SLOW_STEP = 10;
export const CHRONO_CARDS = 12;
const st = (unit, key) => unit?.statuses?.[key] || 0;
const src = (unit, id) => ({ unitId: unit.id, kind: 'status', id });
const living = (state) => state.order.map((id) => state.units[id]).filter((unit) => unit?.alive);
const foesOf = (state, unit) => living(state).filter((other) => other.side !== unit.side);
function tidyRes(unit, key) {
    if (!unit.res) return;
    delete unit.res[key];
    if (!Object.keys(unit.res).length) delete unit.res;
}
// 往卡组单位的牌堆塞状态牌（由对方塞入，不算它自己生成临时牌）。
function junk(ctx, victim, cardId, where, count, kit) {
    if (victim?.kind !== 'deck' || !victim.alive) return;
    for (let i = 0; i < count && !ctx.state.outcome; i += 1) kit.createToken(ctx, victim, cardId, where, true);
}
// 缠绕份额：受害者 res.constrictFrom = { 施加者 id: 层数 }，状态层数 = 仍存活施加者的份额之和；被净化清零时份额一并清掉。
function settleConstrict(ctx, victim, kit) {
    const shares = victim.res?.constrictFrom;
    if (!shares) return;
    let total = 0;
    for (const id of Object.keys(shares)) {
        if (ctx.state.units[id]?.alive) total += shares[id];
        else delete shares[id];
    }
    if (total > 0 && st(victim, 'constricted')) {
        kit.setStatus(victim, 'constricted', total);
        return;
    }
    tidyRes(victim, 'constrictFrom');
    kit.setStatus(victim, 'constricted', 0);
}

const constrict = {
    validate(effect, path, state, kit) {
        kit.checkKnownFields(effect, ['op', 'stacks', 'target'], path, state);
        const at = (key) => kit.joinPath(path, key);
        return { op: 'constrict', stacks: kit.intField(effect.stacks, at('stacks'), state, 1, 20), target: kit.enumField(effect.target, at('target'), state, kit.OFFENSE_TARGETS, 'enemy') };
    },
    apply(ctx, unit, effect, aimId, source, kit) {
        for (const target of kit.targets()) {
            const before = st(target, 'constricted');
            kit.addStatus(ctx, target, 'constricted', effect.stacks, source);
            const gained = st(target, 'constricted') - before;
            const res = gained > 0 ? kit.resOf(ctx, target) : null;
            if (res) res.constrictFrom = { ...res.constrictFrom, [unit.id]: (res.constrictFrom?.[unit.id] || 0) + gained };
        }
    },
    value: (e) => e.stacks * 4,
    describe: (e, kit) => `${kit.on(e.target)}施加 ${kit.fmt(e.stacks, 'stacks', false)} 层缠绕（施加者存活时，对方每个回合结束受到等量伤害）`,
    brief: (e) => `缠绕${e.stacks}`,
};

registerMechanic({
    key: 'foe-afflict', family: 'general', archetypes: [], unitKinds: ['skill'],
    statuses: [
        { key: 'slow', label: '减速' },
        { key: 'chrono', label: '时间扭曲' },
        { key: 'shell', label: '硬壳' },
        { key: 'stabs', label: '刺痛' },
        { key: 'hive', label: '蜂巢' },
        { key: 'shifting', label: '变形' },
        { key: 'fading', label: '消逝' },
        { key: 'ravenous', label: '贪食' },
        { key: 'slippery', label: '滑溜' },
        { key: 'skittish', label: '胆怯' },
        { key: 'sandpit', label: '流沙' },
        { key: 'steam', label: '蒸汽' },
        { key: 'hex', label: '妖术', debuff: true },
        { key: 'smoggy', label: '烟雾', debuff: true },
        { key: 'constricted', label: '缠绕', debuff: true },
    ],
    ops: { constrict },
    modifiers: {
        // 减速：攻击者本回合每已打出一张牌（不含正在结算的这张），持有者受到的攻击伤害 +10%。
        'incoming-mult': (attacker, target, value) => (st(target, 'slow') && attacker?.cardsPlayed > 0 ? value * (1 + (SLOW_STEP * attacker.cardsPlayed) / 100) : value),
        // 烟雾：持有者每回合至多打出 1 张技能牌。
        'card-play': (state, unit, card) => (card.type === 'skill' && st(unit, 'smoggy') && (unit.turnStats?.skill || 0) >= 1 ? 'smoggy' : null),
    },
    hooks: {
        'play-after'(ctx, { unit, card }, kit) {
            if (!card) return;
            // 妖术：持有者每打出一张非攻击牌，向自己的抽牌堆洗入层数张眩晕。
            if (card.type !== 'attack' && st(unit, 'hex')) junk(ctx, unit, 'status-daze', 'draw', st(unit, 'hex'), kit);
            if (unit.id !== ctx.state.controlledId) return;
            // 跨回合时滞：主角累计每打出 12 张牌（未满时跨回合保留），强制结束回合，持有者获得层数攻击力，计数归零。
            let warped = false;
            for (const foe of foesOf(ctx.state, unit)) {
                const n = st(foe, 'chrono');
                if (!n || ctx.state.outcome) continue;
                const res = kit.resOf(ctx, foe);
                res.chrono = (res.chrono || 0) + 1;
                if (res.chrono < CHRONO_CARDS) continue;
                tidyRes(foe, 'chrono');
                kit.addStatus(ctx, foe, 'strength', n, src(foe, 'chrono'));
                kit.emit(ctx, { type: 'time-warp', unitId: foe.id, target: unit.id });
                warped = true;
            }
            if (warped) kit.requestEndTurn(ctx);
        },
        'damage-after'(ctx, { target, source, kind, amount, hpLoss }, kit) {
            if (kind !== 'attack' || ctx.state.outcome) return;
            const attacker = source?.unitId != null ? ctx.state.units[source.unitId] : null;
            if (!attacker || attacker.side === target.side) return;
            // 刺痛：持有者的攻击每段造成未格挡伤害，往受害者弃牌堆塞层数张伤口。
            if (hpLoss > 0 && st(attacker, 'stabs')) junk(ctx, target, 'status-wound', 'discard', st(attacker, 'stabs'), kit);
            if (!target.alive || !(amount > 0)) return;
            // 蜂巢：持有者每受一段攻击伤害（含被格挡的），往攻击者抽牌堆塞层数张眩晕。
            if (st(target, 'hive')) junk(ctx, attacker, 'status-daze', 'draw', st(target, 'hive'), kit);
            // 胆怯：每回合首次被攻击命中，在攻击者这次出手结算完后获得层数格挡。
            if (st(target, 'skittish') && target.res?.skittishTurn !== ctx.state.turn) {
                kit.resOf(ctx, target).skittishTurn = ctx.state.turn;
                if (!ctx.skittishHits) ctx.skittishHits = new Map();
                if (!ctx.skittishHits.has(attacker.id)) ctx.skittishHits.set(attacker.id, new Set());
                ctx.skittishHits.get(attacker.id).add(target.id);
            }
        },
        'action-after'(ctx, { unit }, kit) {
            const startled = ctx.skittishHits?.get(unit.id);
            if (!startled) return;
            ctx.skittishHits.delete(unit.id);
            for (const id of startled) {
                const foe = ctx.state.units[id];
                if (foe?.alive && !ctx.state.outcome && st(foe, 'skittish')) kit.gainBlock(ctx, foe, st(foe, 'skittish'), src(foe, 'skittish'));
            }
        },
        // 滑溜：每次失去生命至多 1 点；硬壳：两次重置之间累计失去生命不超过层数。
        'hp-loss-before'(ctx, pre) {
            const { target } = pre;
            if (st(target, 'slippery') && pre.hpLoss > 1) pre.hpLoss = 1;
            const shell = st(target, 'shell');
            if (shell) pre.hpLoss = Math.min(pre.hpLoss, Math.max(0, shell - (target.res?.shellLost || 0)));
        },
        'hp-loss-after'(ctx, { target, hpLoss }, kit) {
            if (!(hpLoss > 0)) return;
            // 滑溜按失血实例减层（完全格挡不减）。
            if (st(target, 'slippery')) kit.setStatus(target, 'slippery', st(target, 'slippery') - 1);
            if (st(target, 'shell')) {
                const res = kit.resOf(ctx, target);
                res.shellLost = (res.shellLost || 0) + hpLoss;
            }
            // 变形：失去多少生命就失去多少攻击力，直到持有者自己的回合结束（复用「本回合减攻」shackle 的清零时点），
            // 因此玩家回合打掉的生命会削弱它紧接着的出手。
            if (target.alive && st(target, 'shifting')) {
                kit.setStatus(target, 'shackle', st(target, 'shackle') + hpLoss);
                kit.emit(ctx, { type: 'status', source: src(target, 'shifting'), target: target.id, status: 'shackle', stacks: hpLoss });
            }
        },
        // 硬壳额度在主角回合开始与持有者自己的回合开始各重置一次。
        'turn-start-before'(ctx, { unit }) {
            if (unit.res?.shellLost != null) tidyRes(unit, 'shellLost');
            if (unit.id !== ctx.state.controlledId) return;
            for (const foe of foesOf(ctx.state, unit)) if (foe.res?.shellLost != null) tidyRes(foe, 'shellLost');
        },
        'turn-end-after'(ctx, { unit }, kit) {
            // 缠绕：受害者自己的回合结束，受到等于层数的伤害（可被格挡，来源记为仍存活的第一个施加者）。
            if (unit.res?.constrictFrom) settleConstrict(ctx, unit, kit);
            const tight = st(unit, 'constricted');
            if (tight && unit.alive) {
                const from = Object.keys(unit.res?.constrictFrom || {})[0];
                kit.dealDamage(ctx, unit, tight, from != null ? src(ctx.state.units[from], 'constricted') : { unitId: null, kind: 'status', id: 'constricted' }, 'thorns', true);
            }
            if (!unit.alive || ctx.state.outcome) return;
            // 消逝：持有者自己的回合结束减 1 层，归零时自身倒下（算倒下，不算撞离）。
            const fading = st(unit, 'fading');
            if (fading) {
                kit.setStatus(unit, 'fading', fading - 1);
                if (fading === 1) {
                    kit.emit(ctx, { type: 'faded', unitId: unit.id });
                    kit.defeatUnit(ctx, unit, src(unit, 'fading'), 'self');
                    return;
                }
            }
            // 流沙：持有者自己的回合结束减 1 层，归零时吞没对方操控角色（无视忍而不倒等保命效果）。
            const pit = st(unit, 'sandpit');
            if (pit) {
                kit.setStatus(unit, 'sandpit', pit - 1);
                const hero = ctx.state.units[ctx.state.controlledId];
                if (pit === 1 && hero?.alive && hero.side !== unit.side) {
                    kit.emit(ctx, { type: 'engulf', unitId: unit.id, target: hero.id });
                    kit.defeatUnit(ctx, hero, src(unit, 'sandpit'), 'other');
                }
            }
        },
        defeated(ctx, { unit: fallen }, kit) {
            // 缠绕绑定来源：施加者倒下时去掉它的份额。
            for (const unit of living(ctx.state)) if (unit.res?.constrictFrom?.[fallen.id] != null) settleConstrict(ctx, unit, kit);
            // 贪食：同阵营其他单位倒下时，持有者先晕厥再获得层数攻击力（多名持有者都响应）。
            for (const unit of living(ctx.state)) {
                const n = st(unit, 'ravenous');
                if (!n || unit.side !== fallen.side || unit.id === fallen.id || ctx.state.outcome) continue;
                kit.emit(ctx, { type: 'devour', unitId: unit.id, target: fallen.id });
                kit.addStatus(ctx, unit, 'stun', 1, src(unit, 'ravenous'));
                kit.addStatus(ctx, unit, 'strength', n, src(unit, 'ravenous'));
            }
        },
    },
    report(event, kit) {
        if (event.type === 'faded') kit.note(event.unitId, '消逝了');
        else if (event.type === 'engulf') kit.note(event.unitId, '流沙吞没了对手');
        else if (event.type === 'devour') kit.note(event.unitId, '吞食了倒下的同伴');
    },
});