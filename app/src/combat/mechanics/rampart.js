// 规则 v5 P3 守护「壁垒」（rampart 族，只给守护）：D01 固守、D02 获得翻倍、D03 甲层、D04 反震、D05 临时荆棘、D06 坚壁反击、D07 掩护、D08 共盾。
// 状态经 apply-status 施加（层数上限与估值见 apply-status.js）；D02 的已有格挡翻倍沿用内置 double，D09 延迟反击沿用内置 delayed-counter。
import { registerMechanic } from './registry.js';

const st = (unit, key) => unit?.statuses?.[key] || 0;
const statusSource = (unit, id) => ({ unitId: unit.id, kind: 'status', id });
// 到自身下回合开始前有效的状态。
const UNTIL_NEXT_TURN = Object.freeze(['recoil', 'bramble', 'cover']);
const living = (state) => state.order.map((id) => state.units[id]).filter((unit) => unit?.alive);

registerMechanic({
    key: 'rampart', family: 'rampart', archetypes: ['guardian'], unitKinds: ['deck', 'skill'],
    statuses: [
        { key: 'barricade', label: '固守' },
        { key: 'retain-block', label: '固守回合' },
        { key: 'block-surge', label: '格挡倍增' },
        { key: 'plated', label: '甲层' },
        { key: 'recoil', label: '反震' },
        { key: 'bramble', label: '临时荆棘' },
        { key: 'juggernaut', label: '坚壁反击' },
        { key: 'cover', label: '掩护' },
        { key: 'share-block', label: '共盾' },
    ],
    hooks: {
        // D01：固守本场不清格挡；固守回合每保住一次减 1 层。D04、D05、D07 到自身下回合开始失效。
        'turn-start-before'(ctx, payload, kit) {
            const { unit } = payload;
            for (const key of UNTIL_NEXT_TURN) if (st(unit, key)) kit.setStatus(unit, key, 0);
            if (st(unit, 'barricade')) {
                payload.clearBlock = false;
            } else if (st(unit, 'retain-block')) {
                payload.clearBlock = false;
                kit.setStatus(unit, 'retain-block', st(unit, 'retain-block') - 1);
            }
        },
        // D03：回合结束获得等于层数的格挡（不吃防御力与脆弱）。
        'turn-end-before'(ctx, { unit }, kit) {
            const plated = st(unit, 'plated');
            if (plated && unit.alive) kit.gainBlock(ctx, unit, plated, statusSource(unit, 'plated'));
        },
        // D02：格挡倍增只在本回合有效。
        'turn-end-after'(ctx, { unit }, kit) {
            if (st(unit, 'block-surge')) kit.setStatus(unit, 'block-surge', 0);
        },
        // 顺序：D02 先把本次获得翻倍并改写 amount，D06 按次反击，D08 按翻倍后的合计分一半给其余队友（分出的格挡不再分）。
        'block-gained'(ctx, payload, kit) {
            const { target } = payload;
            if (!target.alive) return;
            const surge = st(target, 'block-surge');
            if (surge) {
                kit.setStatus(target, 'block-surge', surge - 1);
                target.block += payload.amount;
                kit.emit(ctx, { type: 'block', source: payload.source, target: target.id, amount: payload.amount, surge: true });
                payload.amount *= 2;
            }
            const jolt = st(target, 'juggernaut');
            if (jolt) {
                const foes = living(ctx.state).filter((unit) => unit.side !== target.side);
                if (foes.length) kit.dealDamage(ctx, foes[kit.rollInt(ctx.state, foes.length)], jolt, statusSource(target, 'juggernaut'), 'juggernaut', true);
            }
            if (!st(target, 'share-block') || payload.shared || !target.alive || ctx.state.outcome) return;
            const half = Math.floor(payload.amount / 2);
            if (half <= 0) return;
            for (const ally of living(ctx.state).filter((unit) => unit.side === target.side && unit.id !== target.id)) {
                kit.gainBlock(ctx, ally, half, payload.source, { shared: true });
            }
        },
        // D03 未被格挡的攻击伤害减 1 层甲层；D04 把被格挡的攻击伤害反射给攻击者；D05 每次受击反伤等于层数。
        'damage-after'(ctx, { target, source, kind, amount, blocked }, kit) {
            if (kind !== 'attack') return;
            if (st(target, 'plated') && amount > blocked) kit.setStatus(target, 'plated', st(target, 'plated') - 1);
            const attacker = source?.unitId != null ? ctx.state.units[source.unitId] : null;
            if (!attacker || attacker.side === target.side) return;
            if (st(target, 'recoil') && blocked > 0 && attacker.alive) kit.dealDamage(ctx, attacker, blocked, statusSource(target, 'recoil'), 'recoil', true);
            if (st(target, 'bramble') && attacker.alive) kit.dealDamage(ctx, attacker, st(target, 'bramble'), statusSource(target, 'bramble'), 'thorns', true);
        },
        // D07：敌方指向队友的单体攻击改由带掩护的同阵营单位承受（按出手顺序取第一名）。
        'attack-target'(ctx, aim, kit) {
            const { attacker, target } = aim;
            if (!attacker || attacker.side === target.side) return;
            const guard = living(ctx.state).find((unit) => unit.side === target.side && unit.id !== target.id && st(unit, 'cover'));
            if (!guard) return;
            aim.target = guard;
            kit.emit(ctx, { type: 'cover', unitId: guard.id, target: target.id, attacker: attacker.id });
        },
    },
    report(event, kit) {
        if (event.type === 'cover') kit.note(event.unitId, '{who}挺身挡在队友身前');
    },
});
