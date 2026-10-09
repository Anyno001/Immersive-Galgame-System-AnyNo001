// DLC 演出标签登记表：外部脚本经 IGS.api.stageFx.register 写进来。解析器（fx-directives）只读这里的
// kind / mode 判断标签认不认、是不是区间；播放函数与样式由阅读器的演出层读取。本模块不碰 DOM。
// 没登记的 dlc-* 标签与其它写错的标签一样静默剥掉，不会露在正文里。

export const DLC_FX_KIND_RE = /^dlc-[a-z0-9][a-z0-9-]{0,39}$/;
export const DLC_FX_MODES = Object.freeze(['instant', 'range']);
export const DLC_FX_LAYERS = Object.freeze(['front', 'stage']);
// 每页最多播几个不同的 DLC 瞬时演出，防止一页堆满标签把画面挤爆。
export const DLC_FX_PAGE_MAX = 3;
export const DLC_FX_ARG_MAX = 6;

const effects = new Map();
const listeners = new Set();
let version = 0;

export function isDlcFxKind(kind) {
    return typeof kind === 'string' && DLC_FX_KIND_RE.test(kind) && !kind.endsWith('-end');
}

export function getDlcFx(kind) {
    return isDlcFxKind(kind) ? effects.get(kind) || null : null;
}

export function listDlcFx() {
    return Array.from(effects.values());
}

export function dlcFxVersion() {
    return version;
}

export function onDlcFxChange(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function changed(kind) {
    version += 1;
    for (const listener of Array.from(listeners)) {
        try { listener(kind); } catch (error) { /* 监听者出错不影响登记 */ }
    }
}

// def 已经过公开接口层的校验（CSS 安检等）；这里只做形状检查。返回 { ok, kind, warnings }。
export function registerDlcFx(input) {
    const warnings = [];
    if (!input || typeof input !== 'object') return { ok: false, reason: 'invalid-fx', warnings: ['特效定义必须是对象'] };
    const kind = String(input.kind || '');
    if (!isDlcFxKind(kind)) return { ok: false, reason: 'invalid-kind', warnings: [`kind「${kind}」不合法：必须以 dlc- 开头，只用小写字母、数字和连字符，不能以 -end 结尾，最长 44 个字符`] };
    if (typeof input.play !== 'function') return { ok: false, reason: 'missing-play', warnings: ['play(ctx) 必须是函数'] };
    const label = typeof input.label === 'string' ? input.label.trim().slice(0, 20) : '';
    if (!label) return { ok: false, reason: 'missing-label', warnings: ['label（设置页开关的名字）不能为空'] };
    const mode = DLC_FX_MODES.includes(input.mode) ? input.mode : 'instant';
    if (input.mode != null && !DLC_FX_MODES.includes(input.mode)) warnings.push(`mode「${input.mode}」不认识，已按 instant 处理`);
    const layer = DLC_FX_LAYERS.includes(input.layer) ? input.layer : 'front';
    const life = Number(input.lifeMs);
    const lifeMs = Number.isFinite(life) ? Math.max(200, Math.min(15000, life)) : 2400;
    const prompt = typeof input.prompt === 'string' ? input.prompt.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    const def = Object.freeze({
        kind,
        label,
        mode,
        layer,
        lifeMs,
        prompt,
        play: input.play,
        cssText: typeof input.cssText === 'string' ? input.cssText : '',
    });
    if (effects.has(kind)) warnings.push(`特效 ${kind} 已存在，已用新定义覆盖`);
    effects.set(kind, def);
    changed(kind);
    return { ok: true, kind, warnings };
}

export function unregisterDlcFx(kind) {
    if (!effects.delete(kind)) return { ok: false, reason: 'not-found' };
    changed(kind);
    return { ok: true, kind };
}

// 设置里关掉的 DLC 演出：readerSettings.dlcFx = { 'dlc-xxx': false }；没写的一律算开。
export function normalizeDlcFxSettings(value) {
    const out = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    for (const [kind, on] of Object.entries(value)) {
        if (DLC_FX_KIND_RE.test(kind) && on === false) out[kind] = false;
    }
    return out;
}

export function isDlcFxEnabled(kind, settings) {
    return Boolean(getDlcFx(kind)) && !(settings && settings[kind] === false);
}

// 仅供测试：清空登记表。
export function resetDlcFxForTest() {
    effects.clear();
    changed('');
}
