// 查询结果只属于本次设置面板，不进入配置、预设、持久化或日志。
import { createNaiQuotaClient } from '../../generated-images/nai-quota-client.js';
import { esc } from './reader-value-utils.js';

function identity(settings) {
    return JSON.stringify([settings?.apiKey || '', settings?.endpoint || '', settings?.transport || '']);
}

export function clearNaiQuota(panel) {
    panel?.asyncState?.naiQuota?.controller?.abort();
    if (panel?.asyncState) delete panel.asyncState.naiQuota;
}

export function syncNaiQuota(panel) {
    const view = panel?.asyncState?.naiQuota;
    if (view && view.identity !== identity(panel.draft.bridge.autoIllustration.nai)) clearNaiQuota(panel);
}

function refillText(quota) {
    if (quota.isNegative) return '额度透支';
    if (quota.timeUntilNext > 0) {
        const minutes = Math.ceil(quota.timeUntilNext / 60);
        const hours = Math.floor(minutes / 60);
        return `约 ${hours ? `${hours} 小时 ` : ''}${minutes % 60} 分钟后恢复 1%`;
    }
    if (quota.percent === null) return '';
    return quota.percent >= 100 ? '额度充足' : '恢复已暂停';
}

export function renderNaiQuota(view) {
    const button = `<button type="button" class="igs-settings-action" data-action="query-nai-quota"${view?.busy ? ' disabled' : ''}>${view?.busy ? '查询中…' : '查询余额与额度'}</button>`;
    let content = '';
    if (view?.result?.ok) {
        const q = view.result.quota;
        const number = v => v === null ? '未提供' : v.toLocaleString('zh-CN');
        const tier = ['免费用户', 'Tablet 会员', 'Scroll 会员', 'Opus 会员'][q.tier] || '会员类型未提供';
        const status = q.active === null ? '有效状态未提供' : q.active ? '有效' : '未激活或已过期';
        content = `<div>${esc(tier)} · ${status}</div>`
            + `<div>Anlas 余额：${number(q.total)}（套餐：${number(q.fixed)}；充值：${number(q.purchased)}）</div>`
            + `<div>V5 额度：${q.percent === null ? '未提供' : `${number(q.percent)}%`} ${esc(refillText(q))}</div>`
            + `<div>查询时间：${esc(new Date(view.result.queriedAt).toLocaleTimeString('zh-CN'))}</div>`;
    } else if (view?.result) content = esc(view.result.error);
    return '<div class="igs-settings-sub" data-nai-quota>' + button
        + '<div class="igs-settings-hint">手动查询当前 Key；第三方站点需支持账户接口，显示单位以该站点为准。</div>'
        + `<div class="igs-settings-result" role="status" aria-live="polite">${content}</div></div>`;
}

export async function querySettingsNaiQuota({ state, options, rerenderSettings }) {
    const panel = state.activeSettings;
    if (!panel) return { ok: false, reason: 'settings-not-open' };
    syncNaiQuota(panel);
    if (panel.asyncState.naiQuota?.busy) return { ok: false, reason: 'quota-query-busy' };
    const settings = { ...panel.draft.bridge.autoIllustration.nai };
    const view = { identity: identity(settings), controller: new AbortController(), busy: true };
    panel.asyncState.naiQuota = view;
    rerenderSettings();
    const global = options.global || globalThis;
    const result = await createNaiQuotaClient({ fetch: global.fetch?.bind(global) }).query({ ...settings, signal: view.controller.signal });
    if (state.activeSettings !== panel || panel.asyncState.naiQuota !== view
        || view.identity !== identity(panel.draft.bridge.autoIllustration.nai)) return { ok: false, reason: 'quota-query-stale' };
    view.busy = false; view.result = result;
    rerenderSettings();
    return result;
}
