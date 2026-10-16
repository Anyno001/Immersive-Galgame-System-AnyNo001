// 结果展示组件的纯数据层：「过程动画 → 结果定格」。
// 输入为各玩法的判定明细，输出统一的展示方案；DOM 与动画在 fx-result.js。
// 首个消费者是选项检定（dice-check.js 返回的 detail）；猜拳、扭蛋、对弈等后续复用同一方案结构。

export const RESULT_FX_ROLL_MS = 900;
export const RESULT_FX_HOLD_MS = 1600;
export const RESULT_FX_TONES = Object.freeze(['crit', 'success', 'fail', 'fumble', 'tie', 'neutral']);

export const RESULT_FX_DEFAULTS = Object.freeze({ enabled: false });

export function normalizeResultFxSettings(value) {
    const src = value && typeof value === 'object' ? value : {};
    return { enabled: src.enabled === true };
}

function toneOfTier(tierName, success) {
    if (tierName === '大成功') return 'crit';
    if (tierName === '大失败') return 'fumble';
    return success ? 'success' : 'fail';
}

// 成功档位只在成功或大失败时给出，供定格演出区分轻重；失败不分档。
const TIER_KEYS = Object.freeze({ 大成功: 'crit', 极难成功: 'extreme', 困难成功: 'hard', 普通成功: 'regular' });

function tierKeyOf(tierName, success) {
    if (tierName === '大失败') return 'fumble';
    return success ? (TIER_KEYS[tierName] || '') : '';
}

function contestOutcome(winner, own) {
    if (winner === 'tie') return 'tie';
    if (winner === 'left' || winner === 'right') return winner === own ? 'win' : 'lose';
    return '';
}

function reel(label, value, sub, outcome = '') {
    const number = Number(value);
    return {
        label: String(label || ''),
        value: Number.isFinite(number) ? number : null,
        sub: String(sub || ''),
        ...(outcome ? { outcome } : {}),
    };
}

function side(part, outcome) {
    const source = part && typeof part === 'object' ? part : {};
    return reel(`${source.name || ''}·${source.attribute || ''}`, source.roll, `目标${source.target ?? ''} · ${source.tier || ''}`, outcome);
}

// 返回 null 表示明细不完整，调用方不播放（不编造数字）。
export function buildResultFxPlan(detail) {
    if (!detail || typeof detail !== 'object') return null;
    if (detail.kind === 'fixed') {
        const success = detail.success === true;
        return {
            type: 'dice',
            title: '无需投骰',
            reels: [],
            verdict: success ? '必定成功' : '必定失败',
            tone: success ? 'success' : 'fail',
            rollMs: 0,
            holdMs: RESULT_FX_HOLD_MS,
        };
    }
    if (detail.kind === 'check') {
        const face = reel('1d100', detail.roll, `需≤${detail.threshold}`);
        if (face.value === null) return null;
        return {
            type: 'dice',
            title: `${detail.actor || ''}·${detail.attribute || ''}`,
            reels: [face],
            verdict: String(detail.outcome || ''),
            tone: toneOfTier(detail.tier, detail.success === true),
            tier: tierKeyOf(detail.tier, detail.success === true),
            rollMs: RESULT_FX_ROLL_MS,
            holdMs: RESULT_FX_HOLD_MS,
        };
    }
    if (detail.kind === 'contest') {
        const left = side(detail.left, contestOutcome(detail.winner, 'left'));
        const right = side(detail.right, contestOutcome(detail.winner, 'right'));
        if (left.value === null || right.value === null) return null;
        const tone = detail.winner === 'left' ? 'success' : detail.winner === 'tie' ? 'tie' : 'fail';
        return {
            type: 'dice',
            title: '对抗',
            reels: [left, right],
            verdict: String(detail.verdict || ''),
            tone,
            rollMs: RESULT_FX_ROLL_MS,
            holdMs: RESULT_FX_HOLD_MS,
        };
    }
    return null;
}

// 从 resolveDiceCommand 的返回值取展示明细：掷骰类带 detail；必成/必败只有 success + line（契约不变），
// 此处推成 fixed；无需检定（line 为空）与失败降级返回 null，不播放。
export function resultDetailOf(result) {
    if (!result || result.ok !== true) return null;
    if (result.detail && typeof result.detail === 'object') return result.detail;
    if (result.line && typeof result.success === 'boolean') return { kind: 'fixed', success: result.success };
    return null;
}

// 过程动画中显示的滚动数字：确定性序列，便于测试；最后一帧必为真实结果。
export function rollingFrames(finalValue, count = 8, random = Math.random) {
    const frames = [];
    for (let i = 0; i < Math.max(0, count - 1); i += 1) frames.push(1 + Math.floor(random() * 100));
    frames.push(finalValue);
    return frames;
}
