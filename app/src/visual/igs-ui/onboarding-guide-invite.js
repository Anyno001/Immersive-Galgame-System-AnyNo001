// 新手引导的阅读器侧输入：首次邀请条与按键拦截。
import { ONBOARDING_CARD_ID } from './onboarding-guide-runtime.js';

export const ONBOARDING_INVITE_ID = 'igs-onboarding-invite';
export const ONBOARDING_INVITE_CHOICES = Object.freeze(['start', 'later', 'never']);
// 邀请条上的指针与点击一律不冒泡，避免被阅读器当成翻页。
const STOP_EVENTS = ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'];

export function removeOnboardingInvite(overlay) {
    overlay?.querySelector?.(`#${ONBOARDING_INVITE_ID}`)?.remove?.();
}

export function mountOnboardingInvite(overlay, onChoose, doc = overlay?.ownerDocument) {
    removeOnboardingInvite(overlay);
    if (!overlay || !doc || typeof doc.createElement !== 'function') return null;
    const bar = doc.createElement('div');
    bar.id = ONBOARDING_INVITE_ID;
    bar.className = 'igs-onboarding-invite';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', '新手引导邀请');
    bar.innerHTML = '<span class="igs-onboarding-invite-text">首次使用？用 1 分钟完成常用设置</span>'
        + '<button type="button" class="igs-onboarding-btn is-primary" data-onboarding-invite="start">开始</button>'
        + '<button type="button" class="igs-onboarding-btn" data-onboarding-invite="later">以后再说</button>'
        + '<button type="button" class="igs-onboarding-btn is-quiet" data-onboarding-invite="never">不再提示</button>';
    for (const type of STOP_EVENTS) {
        bar.addEventListener?.(type, (event) => {
            event.stopPropagation?.();
            if (type !== 'click') return;
            const choice = event.target?.closest?.('[data-onboarding-invite]')?.getAttribute?.('data-onboarding-invite');
            if (ONBOARDING_INVITE_CHOICES.includes(choice)) onChoose(choice);
        });
    }
    overlay.appendChild(bar);
    return bar;
}

// 阅读器 document 捕获阶段与设置面板根各调用一次：引导卡在时 Esc 只关引导卡，
// 卡内其他按键不外泄到翻页。返回 true 表示已处理，调用方应直接 return。
export function handleOnboardingKeydown(event, doc, onClose) {
    const card = doc?.getElementById?.(ONBOARDING_CARD_ID);
    if (!card || !event) return false;
    if (event.key === 'Escape') {
        event.preventDefault?.();
        event.stopPropagation?.();
        onClose();
        return true;
    }
    if (event.target && typeof card.contains === 'function' && card.contains(event.target)) {
        event.stopPropagation?.();
        return true;
    }
    return false;
}
