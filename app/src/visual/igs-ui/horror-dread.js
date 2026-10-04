// 恐怖档位：overlay 上挂 data-igs-dread="0..3"，恐怖皮肤只用 CSS 读它来切换强度。
// 档位来自剧情标签（无标签时默认 1 档），再被用户设置的强度上限截住。
export const HORROR_DREAD_LEVELS = Object.freeze([0, 1, 2, 3]);
export const HORROR_DREAD_DEFAULT_LEVEL = 1;
export const HORROR_DREAD_CAP_DEFAULT = 3;
export const HORROR_DREAD_CAP_LABELS = Object.freeze({ 0: '只要平静', 1: '最多不安', 2: '最多危险', 3: '不设上限' });

function toLevel(value) {
    const numeric = Number(value);
    if (value === null || value === undefined || value === '' || !Number.isFinite(numeric)) return null;
    return Math.min(3, Math.max(0, Math.round(numeric)));
}

export function normalizeHorrorDreadCap(value) {
    const level = toLevel(value);
    return level === null ? HORROR_DREAD_CAP_DEFAULT : level;
}

export function resolveHorrorDread(level, cap) {
    const resolved = toLevel(level);
    return Math.min(resolved === null ? HORROR_DREAD_DEFAULT_LEVEL : resolved, normalizeHorrorDreadCap(cap));
}

export function applyHorrorDread(root, { level, cap } = {}) {
    if (!root || typeof root.setAttribute !== 'function') return;
    const next = String(resolveHorrorDread(level, cap));
    const current = typeof root.getAttribute === 'function' ? root.getAttribute('data-igs-dread') : null;
    if (current !== next) root.setAttribute('data-igs-dread', next);
}
