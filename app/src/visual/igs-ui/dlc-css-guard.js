// DLC 外部 CSS 安检：按顶层规则逐条检查选择器前缀，不合格的整条丢掉并记一条警告，其余照常生效。
// 只放行作者自己的作用域，防止外部样式改到酒馆页面（body / html / .mes）或别的皮肤；@import 一律拒绝，
// url() 只认 https: / data: / blob:，相对路径在酒馆里解析不到作者的仓库。

const BANNED_SELECTOR_RE = /(^|[\s>+~,(])(html|body|:root)\b|\.mes\b|#chat\b|#sheld\b/i;
const URL_RE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;
const SAFE_URL_RE = /^(https:|data:image\/|blob:)/i;

function splitTopLevel(css) {
    const blocks = [];
    let depth = 0;
    let start = 0;
    let head = -1;
    for (let i = 0; i < css.length; i += 1) {
        const ch = css[i];
        if (ch === '{') {
            if (depth === 0) head = i;
            depth += 1;
        } else if (ch === '}') {
            depth -= 1;
            if (depth < 0) return null;
            if (depth === 0) {
                blocks.push({ prelude: css.slice(start, head).trim(), body: css.slice(head + 1, i) });
                start = i + 1;
            }
        }
    }
    if (depth !== 0) return null;
    if (css.slice(start).trim()) blocks.push({ prelude: css.slice(start).trim(), body: null });
    return blocks;
}

function stripComments(css) {
    return String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function badUrl(text) {
    for (const [, , url] of String(text).matchAll(URL_RE)) {
        if (!SAFE_URL_RE.test(url.trim())) return url.trim() || '(空)';
    }
    return '';
}

// allow(selector) → 是否放行这一条选择器；keyframePrefix：@keyframes 名字必须带的前缀。
export function guardDlcCss(css, { allow, keyframePrefix = 'dlc-', label = 'DLC' } = {}) {
    const warnings = [];
    const out = [];
    const walk = (text, depth) => {
        const blocks = splitTopLevel(text);
        if (!blocks) { warnings.push(`${label}：CSS 括号不配对，整段已丢弃`); return; }
        for (const { prelude, body } of blocks) {
            if (body == null) {
                if (/^@import\b/i.test(prelude)) warnings.push(`${label}：不支持 @import，已丢弃`);
                else if (prelude) warnings.push(`${label}：多余的 CSS 片段已丢弃「${prelude.slice(0, 40)}」`);
                continue;
            }
            if (/^@media\b|^@supports\b|^@container\b/i.test(prelude)) {
                if (depth > 0) { warnings.push(`${label}：只支持一层 ${prelude.split(/\s/)[0]}，已丢弃`); continue; }
                const inner = [];
                const before = out.length;
                walk(body, depth + 1);
                inner.push(...out.splice(before));
                if (inner.length) out.push(`${prelude}{${inner.join('')}}`);
                continue;
            }
            if (/^@(-webkit-)?keyframes\b/i.test(prelude)) {
                const name = prelude.replace(/^@(-webkit-)?keyframes\s+/i, '').trim();
                if (!name.startsWith(keyframePrefix)) { warnings.push(`${label}：动画名「${name}」必须以 ${keyframePrefix} 开头，已丢弃`); continue; }
                const url = badUrl(body);
                if (url) { warnings.push(`${label}：图片地址「${url}」不是 https / data / blob，已丢弃该动画`); continue; }
                out.push(`${prelude}{${body}}`);
                continue;
            }
            if (prelude.startsWith('@')) { warnings.push(`${label}：不支持 ${prelude.split(/\s/)[0]}，已丢弃`); continue; }
            const selectors = prelude.split(',').map((item) => item.trim()).filter(Boolean);
            const bad = selectors.find((selector) => BANNED_SELECTOR_RE.test(selector) || !allow(selector));
            if (bad) { warnings.push(`${label}：选择器「${bad.slice(0, 80)}」超出允许范围，整条已丢弃`); continue; }
            const url = badUrl(body);
            if (url) { warnings.push(`${label}：图片地址「${url}」不是 https / data / blob，整条已丢弃`); continue; }
            out.push(`${selectors.join(',')}{${body}}`);
        }
    };
    const source = stripComments(css);
    if (/@import\b/i.test(source)) warnings.push(`${label}：不支持 @import，已丢弃`);
    walk(source.replace(/@import[^;]*;/gi, ''), 0);
    return { css: out.join('\n'), warnings };
}

export function isSafeAssetUrl(url) {
    return typeof url === 'string' && SAFE_URL_RE.test(url.trim()) && !/["\\\n\r]/.test(url);
}

// 从一段内置样式里挑出写给某个皮肤的规则（选择器带 [data-igs-dialog-skin="from"]），换成 to 的作用域。
// 同一条里不带这个皮肤的选择器丢掉，免得把内置皮肤的规则再抄一遍；@media 等包裹块里的规则同样处理。
export function rescopeSkinRules(css, from, to) {
    const attr = `[data-igs-dialog-skin="${from}"]`;
    const next = `[data-igs-dialog-skin="${to}"]`;
    const pick = (text, depth) => {
        const blocks = splitTopLevel(stripComments(text)) || [];
        const out = [];
        for (const { prelude, body } of blocks) {
            if (body == null || !prelude.includes(attr) && !prelude.startsWith('@')) continue;
            if (prelude.startsWith('@')) {
                if (depth > 0 || /^@(-webkit-)?keyframes\b/i.test(prelude)) continue;
                const inner = pick(body, depth + 1);
                if (inner) out.push(`${prelude}{${inner}}`);
                continue;
            }
            const selectors = prelude.split(',').map((item) => item.trim()).filter((item) => item.includes(attr));
            if (selectors.length) out.push(`${selectors.map((item) => item.split(attr).join(next)).join(',')}{${body}}`);
        }
        return out.join('\n');
    };
    return pick(String(css || ''), 0);
}
