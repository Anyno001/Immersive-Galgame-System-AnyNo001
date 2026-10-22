// 仪表盘：档位条（带世界观、画质两行）、分类行列表、最近改过；新手引导入口在搜索框正下方。
// 全是竖排扁平文字：一行一个分类，左分类名、右灰色现状、最右 ›，行间细分隔线，不加卡片底。
import { esc } from './reader-value-utils.js';

function categoryRows(rows) {
    return rows.map(({ id, label, status }) => `<button type="button" class="igs-dash-row" data-cat="${esc(id)}"><span class="igs-dash-row-name">${esc(label)}</span><span class="igs-dash-row-status">${esc(status)}</span><i class="igs-dash-row-go" aria-hidden="true"></i></button>`).join('');
}

function recentRows(recent) {
    if (!recent.length) return '';
    return `<div class="igs-dash-recent-line"><span class="igs-dash-recent-label">最近改过</span>${recent.map((item) => `<button type="button" class="igs-dash-recent" data-recent-path="${esc(item.path)}" data-recent-page="${esc(item.page)}">${esc(item.label)}</button>`).join('<span class="igs-dash-recent-dot" aria-hidden="true">·</span>')}</div>`;
}

export function renderDashboard({ presetBar = '', rows = [], recent = [] } = {}) {
    return `<div class="igs-dash"><button type="button" class="igs-dash-hint" data-action="onboarding-start"><span>首次使用可查看新手引导</span><i class="igs-dash-row-go" aria-hidden="true"></i></button>${presetBar}<div class="igs-dash-list" role="list">${categoryRows(rows)}</div>${recentRows(recent)}</div>`;
}
