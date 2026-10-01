// 新手引导控制器：持有会话标记与当前步骤，把邀请、换步、Esc 统一收口，宿主只做装配。
// 换步只调用设置控制器的切页方法，不写任何设置值。
import {
    getOnboardingStep, isLastOnboardingStep, nextOnboardingStep, prevOnboardingStep,
    readOnboardingState, shouldInviteOnboarding, writeOnboardingState,
} from './onboarding-guide.js';
import { mountOnboardingCard } from './onboarding-guide-runtime.js';
import { handleOnboardingKeydown, mountOnboardingInvite, removeOnboardingInvite } from './onboarding-guide-invite.js';
import { ONBOARDING_STYLE_ID, getOnboardingStyleText } from './onboarding-guide-style.js';

const SUBTAB_SWITCHERS = Object.freeze({
    reader: 'switchReaderSubTab',
    sceneSettings: 'switchSceneSettingsSubTab',
    scene: 'switchSceneSubTab',
    image: 'switchImageSubTab',
});
export const ONBOARDING_ACTIONS = Object.freeze(['onboarding-start', 'onboarding-next', 'onboarding-prev', 'onboarding-skip', 'onboarding-finish']);

export function ensureOnboardingStyle(doc) {
    if (!doc || typeof doc.createElement !== 'function' || doc.getElementById?.(ONBOARDING_STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = ONBOARDING_STYLE_ID;
    style.textContent = getOnboardingStyleText();
    (doc.head || doc.documentElement || doc.body)?.appendChild?.(style);
}

export function createOnboardingController(deps) {
    const session = { answered: false };
    let guide = null;
    const warn = deps.warn || ((reason) => {
        try { console.warn('[IGS] 新手引导状态不可用，跳过邀请：', reason); } catch (_) { /* 无控制台时忽略 */ }
    });

    function readState() {
        const result = readOnboardingState(deps.getStorage());
        if (!result.ok) warn(result.reason);
        return result;
    }

    function persist(patch) {
        return writeOnboardingState(deps.getStorage(), patch);
    }

    // 每次 openReader 后调用：未回应的邀请在换楼层重开时原样补挂，回应过就不再出现。
    function syncInvite(overlay) {
        if (!overlay) return false;
        if (!shouldInviteOnboarding(readState(), session)) {
            removeOnboardingInvite(overlay);
            return false;
        }
        ensureOnboardingStyle(overlay.ownerDocument);
        return Boolean(mountOnboardingInvite(overlay, (choice) => chooseInvite(choice, overlay)));
    }

    function chooseInvite(choice, overlay) {
        session.answered = true;
        removeOnboardingInvite(overlay);
        if (choice === 'never') return persist({ status: 'dismissed' });
        if (choice === 'start') return goTo(0);
        return { ok: true };
    }

    function goTo(index) {
        session.answered = true;
        const step = getOnboardingStep(index);
        guide = { step: index, pendingFocus: false };
        if (!deps.getSettingsController()) {
            const opened = deps.openSettings(step.tab);
            if (!opened || opened.ok === false) {
                guide = null;
                return opened || { ok: false, reason: 'settings-not-open' };
            }
        }
        const controller = deps.getSettingsController();
        if (!controller) {
            guide = null;
            return { ok: false, reason: 'settings-not-open' };
        }
        controller.switchTab(step.tab);
        for (const [kind, id] of step.subTabs) {
            const method = SUBTAB_SWITCHERS[kind];
            if (method && typeof controller[method] === 'function') controller[method](id);
        }
        // 切页过程中的多次重绘不抢焦点，最后一次重绘才聚焦标题并滚到目标。
        guide.pendingFocus = true;
        return deps.rerenderSettings();
    }

    function finish(status) {
        guide = null;
        const written = persist({ status, step: 0 });
        deps.rerenderSettings();
        return written.ok === false ? written : { ok: true, status };
    }

    // 非引导动作返回 null，由宿主继续交给既有设置动作分发。
    function handleAction(action) {
        const name = String(action || '').trim();
        if (!ONBOARDING_ACTIONS.includes(name)) return null;
        if (name === 'onboarding-start') return goTo(0);
        if (!guide) return deps.rerenderSettings();
        if (name === 'onboarding-next') {
            return isLastOnboardingStep(guide.step) ? finish('done') : goTo(nextOnboardingStep(guide.step));
        }
        if (name === 'onboarding-prev') return goTo(prevOnboardingStep(guide.step));
        return finish(name === 'onboarding-finish' ? 'done' : 'dismissed');
    }

    function closeGuide() {
        guide = null;
        deps.rerenderSettings();
    }

    function mountInSettings(container) {
        const doc = container?.ownerDocument || deps.getDocument?.();
        if (guide) ensureOnboardingStyle(doc);
        const focus = Boolean(guide && guide.pendingFocus);
        mountOnboardingCard(container, guide, { doc, focus, scroll: focus });
        if (guide) guide.pendingFocus = false;
    }

    function keydown(event, doc) {
        return guide ? handleOnboardingKeydown(event, doc || deps.getDocument?.(), closeGuide) : false;
    }

    return {
        syncInvite,
        chooseInvite,
        handleAction,
        mountInSettings,
        keydown,
        onSettingsClosed() { guide = null; },
        getState() { return { answered: session.answered, step: guide ? guide.step : null }; },
    };
}
