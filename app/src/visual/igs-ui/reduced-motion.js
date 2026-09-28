// 系统「减少动态效果」偏好：MediaQueryList 只建一次、之后读 .matches（随系统设置实时变化）；
// matchMedia 被替换（测试桩、iframe 切换）时重建。
let cachedMatchMedia = null;
let cachedQuery = null;

export function prefersReducedMotion() {
    const matchMedia = globalThis.matchMedia;
    if (typeof matchMedia !== 'function') return false;
    if (matchMedia !== cachedMatchMedia || !cachedQuery) {
        cachedMatchMedia = matchMedia;
        try {
            cachedQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
        } catch {
            cachedQuery = null;
        }
    }
    return Boolean(cachedQuery && cachedQuery.matches);
}
