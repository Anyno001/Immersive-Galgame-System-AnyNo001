// 新手配置引导：状态读写与步骤导航（纯函数，不碰 DOM）。
// 状态单独存 localStorage，不进设置与导出；读不到、坏数据或版本未知时不邀请，未知版本也不覆盖。
import { ONBOARDING_STEPS } from './onboarding-guide-steps.js';

export { ONBOARDING_STEPS };
export const ONBOARDING_STORAGE_KEY = 'igs-onboarding';
export const ONBOARDING_STATE_VERSION = 1;
const STATUSES = ['unseen', 'done', 'dismissed'];
const LAST_STEP = ONBOARDING_STEPS.length - 1;

export function normalizeOnboardingStep(step) {
    const n = Number(step);
    return Number.isInteger(n) && n >= 0 && n <= LAST_STEP ? n : 0;
}

export function normalizeOnboardingState(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
        version: ONBOARDING_STATE_VERSION,
        status: STATUSES.includes(src.status) ? src.status : 'unseen',
        step: normalizeOnboardingStep(src.step),
        updatedAt: typeof src.updatedAt === 'string' ? src.updatedAt : '',
    };
}

// 只有键不存在才算“未见过”；其余异常一律带 reason 返回，由调用方 console.warn 后跳过邀请。
export function readOnboardingState(storage) {
    if (!storage || typeof storage.getItem !== 'function') return { ok: false, reason: 'storage-unavailable', state: null };
    let text;
    try { text = storage.getItem(ONBOARDING_STORAGE_KEY); } catch (error) { return { ok: false, reason: 'storage-read-failed', state: null, error }; }
    if (text == null) return { ok: true, state: normalizeOnboardingState({}) };
    let parsed;
    try { parsed = JSON.parse(text); } catch (error) { return { ok: false, reason: 'invalid-json', state: null, error }; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'invalid-shape', state: null };
    if (parsed.version !== ONBOARDING_STATE_VERSION) return { ok: false, reason: 'unknown-version', state: null };
    return { ok: true, state: normalizeOnboardingState(parsed) };
}

// 未知版本（更新的插件写的）不覆盖；坏数据允许被用户的明确操作覆盖修复。
export function writeOnboardingState(storage, patch = {}, now = new Date()) {
    if (!storage || typeof storage.setItem !== 'function') return { ok: false, reason: 'storage-unavailable' };
    const current = readOnboardingState(storage);
    if (current.reason === 'unknown-version') return { ok: false, reason: 'unknown-version' };
    const state = normalizeOnboardingState({ ...(current.state || {}), ...patch, updatedAt: now.toISOString() });
    try { storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state)); } catch (error) { return { ok: false, reason: 'storage-write-failed', saveError: error }; }
    return { ok: true, state };
}

// session 记在 reader-host 实例上：用户回应过一次（开始 / 以后再说 / 不再提示）后本次会话不再邀请；
// 换楼层重开阅读器时尚未回应的邀请原样补挂，不算新邀请。
export function shouldInviteOnboarding(readResult, session = {}) {
    return Boolean(readResult && readResult.ok && readResult.state
        && readResult.state.status === 'unseen' && !(session && session.answered));
}

export function getOnboardingStep(index) { return ONBOARDING_STEPS[normalizeOnboardingStep(index)]; }
export function nextOnboardingStep(index) { return Math.min(normalizeOnboardingStep(index) + 1, LAST_STEP); }
export function prevOnboardingStep(index) { return Math.max(normalizeOnboardingStep(index) - 1, 0); }
export function isLastOnboardingStep(index) { return normalizeOnboardingStep(index) === LAST_STEP; }
