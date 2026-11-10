// 新手引导卡：挂在设置面板内，面板每次 innerHTML 重绘后由宿主以当前 guide 重新挂载。
// 只加高亮属性、滚动与聚焦，不读写任何设置值；按钮走设置面板既有的 data-action 分发。
import { ONBOARDING_STEPS, getOnboardingStep, isLastOnboardingStep, normalizeOnboardingStep } from './onboarding-guide.js';
import { esc } from './reader-value-utils.js';
import { PROFILE_QUESTIONS, PROFILE_SECTIONS, profileSummary } from './performance-profile.js';
import { placeRowMenu } from './settings-outfit-fields.js';

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
        return `<div class="igs-onboarding-q"><div class="igs-onboarding-q-title">${esc(q.title)}${q.multi ? '<span>可多选</span>' : ''}</div>${q.note ? `<div class="igs-onboarding-q-note">${esc(q.note)}</div>` : ''}<div class="igs-onboarding-q-opts">${opts}</div></div>`;
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

// view：offPage 为用户自己点去了别的页面；gateBlocked 为本步必填项还没填好。
export function renderOnboardingCardHtml(stepIndex, guide = null, note = '', view = {}) {
    const index = normalizeOnboardingStep(stepIndex);
    const step = getOnboardingStep(index);
    const last = isLastOnboardingStep(index);
    const quizPending = step.quiz && !(guide && guide.quizApplied);
    const nextButton = step.branch
        ? button('onboarding-next', '继续了解', 'primary') + button('onboarding-finish', '到此结束')
        : step.gate && view.gateBlocked
            ? `<button type="button" class="igs-onboarding-btn is-primary is-disabled" data-action="onboarding-next" aria-disabled="true">下一步</button>`
            : button('onboarding-next', '下一步', 'primary');
    const actions = (last || step.branch ? '' : button('onboarding-skip', '跳过引导', 'quiet'))
        + (index > 0 ? button('onboarding-prev', '上一步') : '')
        + (view.offPage ? button('onboarding-return', '回到这一步') : '')
        + (quizPending ? button('onboarding-quiz-apply', '应用', 'primary') + button('onboarding-next', '跳过这步') : '')
        + (last ? button('onboarding-finish', '完成', 'primary') : (quizPending ? '' : nextButton));
    const notes = [view.offPage ? '你现在在别的页面，点「回到这一步」就能接着看～' : note, step.gate && view.gateBlocked ? (guide && guide.gateNote) || '' : ''].filter(Boolean);
    return `<div class="igs-onboarding-head"><h3 class="igs-onboarding-title" tabindex="-1">${esc(step.title)}</h3>`
        + `<span class="igs-onboarding-count">${index + 1} / ${ONBOARDING_STEPS.length}${step.optional ? ' · 可选' : ''}</span></div>`
        + `<p class="igs-onboarding-body" aria-live="polite">${esc(step.body)}</p>`
        + notes.map((text) => `<p class="igs-onboarding-note">${esc(text)}</p>`).join('')
        + (step.quiz ? renderQuiz(guide && guide.answers, guide && guide.quizApplied) : '')
        + `<div class="igs-onboarding-actions">${actions}</div>`;
}

// 与设置外壳同一个断点：宽度 >= 900px 是电脑（侧边栏常驻），否则是窄屏（☰ 抽屉）。
export const ONBOARDING_WIDE_QUERY = '(min-width:900px)';
export const ONBOARDING_COMPACT_WIDTH = 420;

export function isWideLayout(doc) {
    const view = doc?.defaultView;
    try {
        const mq = view?.matchMedia?.(ONBOARDING_WIDE_QUERY);
        if (mq && typeof mq.matches === 'boolean') return mq.matches;
    } catch (_) { /* 无 matchMedia 时走宽度 */ }
    const width = Number(view?.innerWidth);
    return Number.isFinite(width) ? width >= 900 : true;
}

// 隐藏判定：自身或祖先带 hidden，或没有布局盒（offsetParent 为 null；固定定位元素也为 null，故再看 getClientRects）。
export function isNodeVisible(node) {
    if (!node) return false;
    if (node.closest?.('[hidden]')) return false;
    if (node.offsetParent === null) {
        const rects = node.getClientRects?.();
        if (!rects || rects.length === 0) return false;
    }
    return true;
}

function queryVisible(container, selectors) {
    for (const selector of selectors || []) {
        let node = null;
        try { node = container.querySelector?.(selector) || null; } catch (_) { node = null; }
        if (node && isNodeVisible(node)) return node;
    }
    return null;
}

// 返回 { target, note }：requires 的区域被隐藏时改高亮开关；其余找不到目标时给出「当前不可见」。
export function resolveStepTarget(container, step, wide) {
    const req = step.requires;
    if (req) {
        const content = container.querySelector?.(req.content);
        if (content && !isNodeVisible(content)) {
            const toggle = queryVisible(container, [`[data-switch="${req.switch}"]`]);
            return { target: toggle, note: req.hint, blocked: true };
        }
    }
    // 讲「⋯」菜单里的项时，先把第一个角色的菜单展开，菜单项才可见。
    if (step.menu) {
        const menu = queryVisible(container, ['.igs-char-card .igs-row-menu']);
        if (menu && !menu.open) {
            menu.open = true;
            try { placeRowMenu(menu, container.ownerDocument?.defaultView || globalThis); } catch (_) { /* 定位失败按默认方向展开 */ }
        }
    }
    const selectors = !wide && step.targetNarrow ? step.targetNarrow : step.target;
    const target = queryVisible(container, selectors);
    return { target, note: !target && (selectors || []).length ? step.missing || '这一项当前不可见' : '', blocked: false };
}

export function removeOnboardingCard(container) {
    if (!container) return;
    for (const node of Array.from(container.querySelectorAll?.(`[${ONBOARDING_ACTIVE_ATTR}]`) || [])) node.removeAttribute?.(ONBOARDING_ACTIVE_ATTR);
    container.querySelector?.(`#${ONBOARDING_CARD_ID}`)?.remove?.();
    const body = container.querySelector?.('.igs-settings-body');
    if (body?.style) body.style.paddingBottom = '';
}

// guide 为 null 时只清理。focus / scroll 只在换步时传入，避免普通重绘抢焦点。
export function mountOnboardingCard(container, guide, mountOptions = {}) {
    removeOnboardingCard(container);
    const doc = mountOptions.doc || container?.ownerDocument;
    if (!container || !guide || !doc || typeof doc.createElement !== 'function') return null;
    const host = container.querySelector?.('#igs-unified-settings') || container;
    const step = getOnboardingStep(guide.step);
    const { target, note } = resolveStepTarget(container, step, isWideLayout(doc));
    const card = doc.createElement('section');
    card.id = ONBOARDING_CARD_ID;
    card.className = 'igs-onboarding-card';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', '新手引导');
    card.innerHTML = renderOnboardingCardHtml(guide.step, guide, note, mountOptions.view || {});
    host.appendChild(card);
    // 给内容区预留和引导卡一样高的底部内边距，滚到底也不会被卡片盖住。
    const body = container.querySelector?.('.igs-settings-body');
    const cardHeight = Number(card.offsetHeight) || 0;
    if (body?.style && cardHeight > 0) body.style.paddingBottom = `${cardHeight + 16}px`;
    if (target) {
        target.setAttribute(ONBOARDING_ACTIVE_ATTR, '1');
        const compact = Number(doc.defaultView?.innerWidth) <= ONBOARDING_COMPACT_WIDTH;
        if (mountOptions.scroll) target.scrollIntoView?.({ block: 'start', behavior: compact || prefersReducedMotion(doc) ? 'auto' : 'smooth' });
        // 细窄手机：目标落在下半屏时，引导卡贴到顶部，不盖住目标。
        if (compact) {
            const rect = target.getBoundingClientRect?.();
            const viewHeight = Number(doc.defaultView?.innerHeight) || 0;
            if (rect && viewHeight > 0 && rect.top + rect.height / 2 > viewHeight / 2) card.classList.add('is-top');
        }
    }
    if (mountOptions.focus) card.querySelector?.('.igs-onboarding-title')?.focus?.();
    return card;
}
