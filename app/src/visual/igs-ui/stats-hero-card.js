import { BASE_ATTRIBUTES } from '../../scene/stats/stat-state.js';
import { esc } from './reader-value-utils.js';

const number = (value) => Math.round(Number(value) || 0);
const percent = (value, max) => Math.max(0, Math.min(100, number(value) / max * 100));
const point = (i, radius) => {
    const angle = i * Math.PI / 3 - Math.PI / 2;
    return [140 + Math.cos(angle) * radius, 120 + Math.sin(angle) * radius].map((n) => n.toFixed(2));
};
const polygon = (radii) => radii.map((r, i) => point(i, r).join(',')).join(' ');

function radar(attributes = []) {
    const axes = BASE_ATTRIBUTES.map((name) => attributes.find((a) => a.name === name));
    if (axes.some((axis) => !axis || !Number.isFinite(axis.value))) {
        return `<div class="igs-stats-empty">${attributes.length ? attributes.map((a) => `${esc(a.name)} ${esc(a.display)}`).join(' · ') : '暂无属性'}</div>`;
    }
    const label = axes.map((a) => `${a.name} ${a.display}`).join('，');
    const rings = [0.25, 0.5, 0.75, 1].map((r) => `<polygon class="igs-stats-radar-ring" points="${polygon(axes.map(() => 72 * r))}"/>`).join('');
    const spokes = axes.map((_, i) => {
        const [x, y] = point(i, 72);
        return `<path class="igs-stats-radar-axis" d="M140 120L${x} ${y}"/>`;
    }).join('');
    const values = axes.map((a) => percent(a.value, 100) * 0.72);
    const labels = axes.map((a, i) => {
        const [x, y] = point(i, 103);
        const [dx, dy] = point(i, values[i]);
        return `<circle class="igs-stats-radar-dot" cx="${dx}" cy="${dy}" r="3"/><text x="${x}" y="${y}" text-anchor="middle"><tspan class="igs-stats-radar-name">${esc(a.name)}</tspan><tspan class="igs-stats-radar-value" x="${x}" dy="16">${esc(a.display)}</tspan></text>`;
    }).join('');
    return `<svg class="igs-stats-radar" viewBox="0 0 280 252" role="img" aria-label="六维属性：${esc(label)}">${rings}${spokes}<polygon class="igs-stats-radar-fill" points="${polygon(values)}"/>${labels}</svg>`;
}

function meter(label, value, max, kind) {
    const current = number(value);
    const width = percent(current, max).toFixed(2);
    return `<div class="igs-stats-meter is-${kind}"><div class="igs-stats-meter-head"><span>${label}</span><b>${current}<small> / ${max}</small></b></div><div class="igs-stats-meter-track" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.max(0, Math.min(max, current))}"><i style="width:${width}%"></i></div></div>`;
}

export function renderStatsHeroDashboard(model) {
    if (!model) return '<div class="igs-stats-empty">暂无数值存档</div>';
    const bars = model.bars || {};
    const currency = model.currency;
    const life = model.vitals && Number(model.vitals.maxHp) > 0
        ? meter('生命', model.vitals.down ? 0 : model.vitals.hp, number(model.vitals.maxHp), 'life') : '';
    const retry = currency && !currency.ready
        ? `<button class="igs-settings-action" data-action="stats-op:currency-retry" type="button"${currency.pending ? ' disabled' : ''}>${currency.pending ? '处理中' : '重试货币判定'}</button>` : '';
    const pointsIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 9-8 9-8-9Z"/><path d="m8 12 4-5 4 5-4 5Z"/></svg>';
    const moneyIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 8h6v8H9zM12 3v3m0 12v3"/></svg>';
    const wallet = `<div class="igs-stats-wallets"><div class="igs-stats-wallet">${pointsIcon}<div><span>积分</span><strong>${number(model.wallet ?? bars.money)}</strong></div></div>`
        + `<div class="igs-stats-wallet">${moneyIcon}<div><span>${esc(currency?.name || '剧情货币')}</span><strong>${currency?.ready ? number(currency.balance) : currency?.name ? '未知' : '未定'}</strong></div>${retry}</div></div>`;
    return `<div class="igs-stats-dash"><div class="igs-stats-day">${model.day != null ? `第 ${number(model.day)} 天` : ''}</div>`
        + `<div class="igs-stats-overview"><div class="igs-stats-radar-panel"><h4>六维属性</h4>${radar(model.attributes)}</div>`
        + `<div class="igs-stats-condition"><div class="igs-stats-resources"><h4>当前状态</h4>${life}${meter('体力', bars.stamina, 100, 'stamina')}${meter('压力', bars.stress, 100, 'stress')}</div>${wallet}</div></div></div>`;
}