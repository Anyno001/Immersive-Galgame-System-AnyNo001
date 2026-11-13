// 共用意图内容：皮肤保留自己的容器、配色与排版。
import { esc } from './reader-value-utils.js';
import { intentIconSvg } from './combat-card-art.js';

export const intentKindsOf = (it) => it.kinds?.length ? it.kinds : [it.kind];
export function intentDamageText(it) {
    if (intentKindsOf(it).includes('unknown')) return '';
    if (it.attacks?.length) return it.attacks.map(({ damage, hits }) => hits > 1 ? `${damage}×${hits}` : String(damage)).join(' + ');
    return it.damage > 0 ? String(it.damage) : '';
}
export function intentTip(it) {
    const value = intentDamageText(it);
    const scope = [...new Set((it.attacks || []).map((a) => a.target))];
    const target = scope.includes('random-enemy') ? '，随机目标（数值以当前参考目标估算）'
        : scope.includes('all-enemies') ? '，对全体敌对目标分别结算' : it.targetName ? `，目标：${it.targetName}` : '';
    return `${it.label}·${it.name}${value ? `，${value} 点${it.unit || '伤害'}（合计 ${it.damage}）${target}` : ''}`;
}
export function intentIconsHtml(it, attackIcon) {
    return intentKindsOf(it).map((kind) => kind === 'attack' && attackIcon ? attackIcon : intentIconSvg(kind)).join('');
}
export function skinIntentHtml(it, { attackIcon, empty = '' } = {}) {
    if (!it) return empty;
    const value = intentDamageText(it);
    const attacking = intentKindsOf(it).some((kind) => kind === 'explode' || kind.startsWith('attack'));
    return `<div class="intent ${attacking ? 'atk' : 'cast'}" data-intent="${esc(it.kind)}" title="${esc(intentTip(it))}">`
        + intentIconsHtml(it, attackIcon)
        + (value ? `<b>${esc(value)}</b>` : '')
        + `<em>${esc(value ? it.name : `${it.label}·${it.name}`)}</em></div>`;
}
