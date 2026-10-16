// 新手引导卡：挂在设置面板内，面板每次 innerHTML 重绘后由宿主以当前 guide 重新挂载。
// 只加高亮属性、滚动与聚焦，不读写任何设置值；按钮走设置面板既有的 data-action 分发。
import { ONBOARDING_STEPS, getOnboardingStep, isLastOnboardingStep, normalizeOnboardingStep } from './onboarding-guide.js';
import { esc } from './reader-value-utils.js';
import { PROFILE_QUESTIONS, PROFILE_SECTIONS, profileSummary } from './performance-profile.js';

export const ONBOARDING_CARD_ID = 'igs-onboarding-card';
export const ONBOARDING_ACTIVE_ATTR = 'data-igs-guide-active';

export function prefersReducedMotion(doc) {
    try { return Boolean(doc?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches); } catch (_) { return false; }
}

function button(action, label, tone) {
    return `<button type="button" class="igs-onboarding-btn${tone ? ` is-${tone}` : ''}" data-action="${action}">${label}</button>`;
}

// 问卷：每题一排选项，选中的高亮；类型可多选。底下一行写这样会开几项。
function renderQuiz(answers, applied) {
    const picked = answers && typeof answers === 'object' ? answers : {};
    const row = (q) => {
        const chosen = q.multi ? (Array.isArray(picked[q.id]) ? picked[q.id] : []) : [picked[q.id]];
        const opts = q.options.map(([value, label]) => {
            const on = chosen.includes(value);
            return `<button type="button" class="igs-onboarding-chip${on ? ' is-active' : ''}" data-action="onboarding-quiz:${q.id}:${value}" aria-pressed="${on ? 'true' : 'false'}">${esc(label)}</button>`;
        }).join('');
        return `<div class="igs-onboarding-q"><div class="igs-onboarding-q-title">${esc(q.title)}${q.multi ? '<span>可多选</span>' : ''}</div>${q.note && q.section ? `<div class="igs-onboarding-q-note">${esc(q.note)}</div>` : ''}<div class="igs-onboarding-q-opts">${opts}</div></div>`;
    };
    // 基础题必答；细调章节点开才问，不点开就不改那部分设置。
    const open = Array.isArray(picked.sections) ? picked.sections : [];
    const rows = PROFILE_QUESTIONS.filter((q) => !q.section).map(row).join('')
        + PROFILE_SECTIONS.map((s) => {
            const on = open.includes(s.id);
            const head = `<button type="button" class="igs-onboarding-section${on ? ' is-open' : ''}" data-action="onboarding-quiz:section:${s.id}" aria-expanded="${on ? 'true' : 'false'}">${esc(s.title)}<span>${on ? '收起' : '可跳过'}</span></button>`;
            return head + (on ? PROFILE_QUESTIONS.filter((q) => q.section === s.id).map(row).join('') : '');
        }).join('');
    const on = profileSummary(picked);
    const result = applied
        ? `已应用：开启 ${on.length} 项演出。`
        : `这样会开启 ${on.length} 项：${on.join('、') || '无'}`;
    return `<div class="igs-onboarding-quiz">${rows}</div><p class="igs-onboarding-quiz-result">${esc(result)}</p>`;
}

export function renderOnboardingCardHtml(stepIndex, guide = null) {
    const index = normalizeOnboardingStep(stepIndex);
    const step = getOnboardingStep(index);
    const last = isLastOnboardingStep(index);
    const actions = (last ? '' : button('onboarding-skip', '跳过引导', 'quiet'))
        + (index > 0 ? button('onboarding-prev', '上一步') : '')
        + (step.quiz && !(guide && guide.quizApplied) ? button('onboarding-quiz-apply', '应用', 'primary') + button('onboarding-next', '跳过这步') : '')
        + (last ? button('onboarding-finish', '完成', 'primary') : (step.quiz && !(guide && guide.quizApplied) ? '' : button('onboarding-next', '下一步', 'primary')));
    return `<div class="igs-onboarding-head"><h3 class="igs-onboarding-title" tabindex="-1">${esc(step.title)}</h3>`
        + `<span class="igs-onboarding-count">${index + 1} / ${ONBOARDING_STEPS.length}${step.optional ? ' · 可选' : ''}</span></div>`
        + `<p class="igs-onboarding-body" aria-live="polite">${esc(step.body)}</p>`
        + (step.quiz ? renderQuiz(guide && guide.answers, guide && guide.quizApplied) : '')
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
    card.innerHTML = renderOnboardingCardHtml(guide.step, guide);
    host.appendChild(card);
    const target = findStepTarget(container, getOnboardingStep(guide.step));
    if (target) {
        target.setAttribute(ONBOARDING_ACTIVE_ATTR, '1');
        if (mountOptions.scroll) target.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion(doc) ? 'auto' : 'smooth' });
    }
    if (mountOptions.focus) card.querySelector?.('.igs-onboarding-title')?.focus?.();
    return card;
}
