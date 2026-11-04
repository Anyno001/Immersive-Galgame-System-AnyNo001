// 设置器填写框兜底：部分酒馆主题用 `input,textarea{background:…!important}` 改输入框底色，会压过设置器自己的样式。
// 挂载后放一个探针输入框，和读取同一个填写框底色变量的参照块比较计算结果；两者不一致说明被主题抢走，
// 就给外层容器挂 data-igs-field-guard，由 settings-style.js 里分层的 !important 铺回底色和文字色。
// 没被改时不挂，各处填写框保留自己的聚焦高亮和透明底写法。
export const FIELD_GUARD_ATTR = 'data-igs-field-guard';

export function applyFieldGuard(root, host) {
    const doc = root && root.ownerDocument;
    const view = doc && doc.defaultView;
    if (!view || !host || typeof view.getComputedStyle !== 'function' || typeof root.setAttribute !== 'function') return false;
    if (root.hasAttribute(FIELD_GUARD_ATTR)) return true;
    const probe = doc.createElement('input');
    probe.type = 'text';
    probe.className = 'igs-field-guard-probe';
    probe.tabIndex = -1;
    probe.setAttribute('aria-hidden', 'true');
    const ref = doc.createElement('span');
    ref.className = 'igs-field-guard-ref';
    ref.setAttribute('aria-hidden', 'true');
    host.append(probe, ref);
    try {
        const got = view.getComputedStyle(probe).backgroundColor;
        const want = view.getComputedStyle(ref).backgroundColor;
        if (!got || !want || got === want) return false;
        root.setAttribute(FIELD_GUARD_ATTR, '1');
        return true;
    } finally {
        probe.remove();
        ref.remove();
    }
}
