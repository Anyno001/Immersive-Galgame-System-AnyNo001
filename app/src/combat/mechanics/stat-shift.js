// 规则 v5 G01 临时攻防、G02 攻防下降、G03 蓄势：伤害在攻击力之后按段合并加减，格挡在防御力之后合并加减。
// 单位没有这些状态时修正原样返回，旧内容在 v5 下结算不变。蓄势的消耗在 attack-window.js。
import { registerMechanic } from './registry.js';

const st = (unit, key) => unit?.statuses?.[key] || 0;

registerMechanic({
    key: 'stat-shift', family: 'general', archetypes: [], unitKinds: ['deck', 'skill'],
    statuses: [
        { key: 'flex', label: '临时攻击力' },
        { key: 'poise', label: '临时防御力' },
        { key: 'atk-down', label: '攻击力下降', debuff: true },
        { key: 'def-down', label: '防御力下降', debuff: true },
        { key: 'vigor', label: '蓄势' },
    ],
    modifiers: {
        'outgoing-add': (attacker, target, value) => value + st(attacker, 'flex') + st(attacker, 'vigor') - st(attacker, 'atk-down'),
        'block-add': (source, target, value) => value + st(source, 'poise') - st(source, 'def-down'),
    },
    hooks: {
        // 临时攻防在本单位回合结束时整体撤销。
        'turn-end-after'(ctx, { unit }, kit) {
            for (const key of ['flex', 'poise']) if (st(unit, key)) kit.setStatus(unit, key, 0);
        },
    },
});
