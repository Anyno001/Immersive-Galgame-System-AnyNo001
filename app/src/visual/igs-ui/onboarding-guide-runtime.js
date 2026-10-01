// 新手引导卡：挂在设置面板内，面板每次 innerHTML 重绘后由宿主以当前 guide 重新挂载。
// 只加高亮属性、滚动与聚焦，不读写任何设置值；按钮走设置面板既有的 data-action 分发。
import { ONBOARDING_STEPS, getOnboardingStep, isLastOnboardingStep, normalizeOnboardingStep } from './onboarding-guide.js';
import { esc } from './reader-value-utils.js';

export const ONBOARDING_CARD_ID = 'igs-onboarding-card';
export const ONBOARDING_ACTIVE_ATTR = 'data-igs-guide-active';

export function prefersReducedMotion(doc) {
    try { return Boolean(doc?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch (_) { return false; }
}

function button(action, label, tone) {
    return `<button type="button" class="igs-onboarding-btn${tone ? ` is-${tone}` : ''}" data-action="${action}">${label}</button>`;
}

export function renderOnboardingCardHtml(stepIndex) {
    const index = normalizeOnboardingStep(stepIndex);
    const step = getOnboardingStep(index);
    const last = isLastOnboardingStep(index);
    const actions = (last ? '' : button('onboarding-skip', '跳过引导', 'quiet'))
        + (index > 0 ? button('onboarding-prev', '上一步') : '')
        + (last ? button('onboarding-finish', '完成', 'primary') : button('onboarding-next', '下一步', 'primary'));
    return `<div class="igs-onboarding-head"><h3 class="igs-onboarding-title" tabindex="-1">${esc(step.title)}</h3>`
        + `<span class="igs-onboarding-count">${index + 1} / ${ONBOARDING_STEPS.length}${step.optional ? ' · 可选' : ''}</span></div>`
        + `<p class="igs-onboarding-body" aria-live="polite">${esc(step.body)}</p>`
        + `<div class="igs-onboarding-actions">${actions}</div>`;
}

function findStepTarget(container, step) {
    for (const selector of step.target || []) {
        let node = null;
        try { node = container.querySelector?.(selector) || null; } catch (_) { node = null; }
        if (node) return node;
    }
    return null;
}

export function removeOnboardingCard(container) {
    if (!container) return;
    for (const node of Array.from(container.querySelectorAll?.(`[${ONBOARDING_ACTIVE_ATTR}]`) || [])) node.removeAttribute?.(ONBOARDING_ACTIVE_ATTR);
    container.querySelector?.(`#${ONBOARDING_CARD_ID}`)?.remove?.();
}

// guide 为 null 时只清理。focus / scroll 只在换步时传入，避免普通重绘抢焦点。
export function mountOnboardingCard(container, guide, mountOptions = {}) {
    removeOnboardingCard(container);
    const doc = mountOptions.doc || container?.ownerDocument;
    if (!container || !guide || !doc || typeof doc.createElement !== 'function') return null;
    const host = container.querySelector?.('#igs-unified-settings') || container;
    const card = doc.createElement('section');
    card.id = ONBOARDING_CARD_ID;
    card.className = 'igs-onboarding-card';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', '新手引导');
    card.innerHTML = renderOnboardingCardHtml(guide.step);
    host.appendChild(card);
    const target = findStepTarget(container, getOnboardingStep(guide.step));
    if (target) {
        target.setAttribute(ONBOARDING_ACTIVE_ATTR, '1');
        if (mountOptions.scroll) target.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion(doc) ? 'auto' : 'smooth' });
    }
    if (mountOptions.focus) card.querySelector?.('.igs-onboarding-title')?.focus?.();
    return card;
}
