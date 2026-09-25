// 四类资料页共用外壳：页头（返回 + 居中标题）、遮挡恢复、容器布局状态。
// 只服务地图/心事/背包/关系四页，不发展为通用弹窗框架。
import { RECORD_ICONS } from './record-icons.js';

// 容器断点：宽屏 ≥1100、中间 768–1100、窄屏 <768；短容器 H<600 叠加短屏处理。
export function recordPageLayoutClass(width, height) {
    const classes = [];
    if (width < 768) classes.push('igs-rp-narrow');
    else if (width < 1100) classes.push('igs-rp-mid');
    if (height < 600) classes.push('igs-rp-short');
    return classes.join(' ');
}

// 观察面板容器实际宽高并写布局 class；返回解除函数。优先 ResizeObserver，无轮询。
export function watchRecordPageLayout(panel, doc) {
    if (!panel) return () => { };
    const apply = () => {
        const rect = panel.getBoundingClientRect?.() || { width: 0, height: 0 };
        panel.classList.remove('igs-rp-narrow', 'igs-rp-mid', 'igs-rp-short');
        const cls = recordPageLayoutClass(rect.width, rect.height);
        if (cls) for (const name of cls.split(' ')) panel.classList.add(name);
    };
    apply();
    const view = doc?.defaultView;
    if (view?.ResizeObserver) {
        const observer = new view.ResizeObserver(apply);
        observer.observe(panel);
        return () => { try { observer.disconnect(); } catch (_) { /* already gone */ } };
    }
    return () => { };
}

// 页头 DOM：返回按钮（44px 命中区）+ 居中标题（两侧短线由 CSS 伪元素绘制）。
export function recordPageHeadHtml(title, options = {}) {
    const closeAttr = options.closeAttr || 'data-record-act';
    const backAriaLabel = options.backAriaLabel || '返回';
    return `<header class="igs-rp-head"><button type="button" class="igs-rp-back" ${closeAttr}="close" aria-label="${backAriaLabel}">${RECORD_ICONS.back}</button><h2 class="igs-rp-title">${title}</h2></header>`;
}
