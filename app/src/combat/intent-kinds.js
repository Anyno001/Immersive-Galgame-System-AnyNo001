// 意图类别只读当前技能与状态，不参与选招、结算或随机数。
import { statusDef } from './mechanics/registry.js';

const DEBUFFS = new Set(['vulnerable', 'weak', 'poison', 'no-draw', 'frail']);
export const intentSource = (unit) => unit?.template?.model === 'original'
    ? /^en-(sts[12])-/.exec(unit.template.enemyId)?.[1] || null : null;
const flatten = (effects) => (effects || []).flatMap((e) => [e,
    ...['then', 'a', 'b'].flatMap((key) => flatten(e?.[key]))]);

export function intentKinds(state, unit, skill, attacks) {
    const source = intentSource(unit);
    const effects = flatten(skill.effects);
    const has = (...ops) => effects.some((e) => ops.includes(e.op));
    const status = (...keys) => effects.some((e) => ['status', 'apply-status'].includes(e.op) && keys.includes(e.status));
    if (state.rulesVersion >= 5) {
        if (unit.statuses?.stun > 0) return ['stun'];
        if (unit.statuses?.asleep > 0 && unit.script?.sleep?.skill === skill.id) return ['sleep'];
    }
    if (skill.intent === 'idle') {
        const rule = unit.script?.interrupts?.[unit.res?.interrupt?.rule];
        if (rule && ['status-lost', 'block-broken'].includes(rule.on)) return ['stun'];
        return [source ? 'unknown' : 'idle'];
    }
    if (status('flee')) return ['escape'];
    if (source === 'sts1' && has('split-into', 'summon-kin', 'self-destruct')) return ['unknown'];
    // 存量非模板单位保留声明类别；缝合项则由最终效果确定。
    if (!source && !unit.template) return [skill.intent];
    const kinds = [];
    const add = (kind) => { if (!kinds.includes(kind)) kinds.push(kind); };
    if (attacks.length) add(has('self-destruct') ? 'explode' : 'attack');
    if (has('block')) add('defend');
    for (const e of effects) {
        if (['status', 'apply-status'].includes(e.op)) {
            if (e.status === 'steam') continue;
            const debuff = DEBUFFS.has(e.status) || statusDef(e.status)?.debuff;
            if (debuff && e.target !== 'self') add('debuff');
            else if (!debuff && (!e.target || e.target === 'self' || e.target.includes('ally'))) add('buff');
        }
        if (['seize-might', 'constrict', 'offer-curse'].includes(e.op)) add('debuff');
        if (e.op === 'create') add(source === 'sts1' ? 'debuff' : 'status');
        if (e.op === 'mark-card') add('affliction');
        if (e.op === 'heal' || e.op === 'drain') add(source === 'sts1' ? 'buff' : 'heal');
        if (e.op === 'summon-kin') add('summon');
    }
    if (source === 'sts1') {
        if (kinds.includes('attack')) {
            const other = ['debuff', 'defend', 'buff'].find((kind) => kinds.includes(kind));
            return [other ? `attack-${other}` : 'attack'];
        }
        if (kinds.includes('defend') && kinds.includes('debuff')) return ['defend-debuff'];
        if (kinds.includes('defend') && kinds.includes('buff')) return ['defend-buff'];
        return [kinds[0] || 'unknown'];
    }
    return kinds.length ? kinds : [skill.intent === 'special' ? 'unknown' : skill.intent];
}
