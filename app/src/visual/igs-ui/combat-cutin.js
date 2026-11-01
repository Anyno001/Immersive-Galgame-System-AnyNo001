import { resolveCutinCrop } from './fx-runtime.js';
import { FALLBACK_HEAD } from './fx-anchor.js';
import { COMBAT_CUTIN_ART_FAMILIES, COMBAT_CUTIN_FRAME, COMBAT_EYE_FRAME } from './combat-cutin-style.js';

// 战斗 cut-in 的 DOM 构造（纯 DOM，无计时）：独立命名空间 .igs-combat-cutin-*，不复用阅读器 [igs-fx:cutin] 的节点与样式。
// 技能特写：暗幕 + 速度线 + 斜向色带 + 半身立绘（运镜由样式完成）+ 角色名与庞门正道纯字招式名 + 一次闪白。
// 名称与招式名只经 textContent 写入（招式名逐字一个 span）；立绘地址由调用方经 safePortraitUrl 过滤后传入。
// opening 为开战过场（「开战」大字）的停留时长；awaken 为觉醒特写全长（眼部切入 + 主段）。
export const COMBAT_CUTIN_MS = Object.freeze({ skill: 1800, awaken: 3000, opening: 800 });
// 觉醒特写：眼部斜切条切入的时长；收尾闪白与面板震动落在全长的这一比例处（主段开始退场时）。
export const COMBAT_AWAKEN_EYE_MS = 600;
export const COMBAT_AWAKEN_END = 0.85;
// 半身取景：头宽约占分格 38%，分格中心对在头顶往下约 1.3 个头高处（胸口），头落在分格上三分之一。
export const COMBAT_CUTIN_FOCUS = Object.freeze({ span: 2.6, line: 1.3 });
// 头位只是默认猜测时退回更宽的取景，不把猜错的位置放大。
export const COMBAT_CUTIN_FALLBACK_FOCUS = Object.freeze({ span: 3.2, line: 1.2 });
// 眼部取景：头宽约占斜切条宽度 69%，纵向对在头顶往下约一半头高处（眼线）。
export const COMBAT_EYE_FOCUS = Object.freeze({ span: 1.45, line: 0.5 });
// 按脸取景：脸宽约占斜切条宽度 56%（脸比含头发的头位窄，倍数相应放大）。
export const COMBAT_EYE_FACE_FOCUS = Object.freeze({ span: 1.8 });

const cssUrl = (url) => `url("${String(url).replace(/[\r\n]/g, '').replace(/["\\]/g, (ch) => `\\${ch}`)}")`;

// 招式名与「觉醒·类型」：逐字一个 span（.igs-combat-cutin-ch），间隔号与空白标 data-sep；
// --i 为字序（逐字盖章的延时），容器 --len 为字数（字号随字数收小）。只经 textContent 写入。
function appendArtText(doc, parent, text) {
    const chars = Array.from(String(text || ''));
    parent.style?.setProperty?.('--len', String(Math.max(2, chars.length)));
    chars.forEach((ch, i) => {
        const s = doc.createElement('span');
        s.className = 'igs-combat-cutin-ch';
        if (ch === '·' || /\s/.test(ch)) s.setAttribute?.('data-sep', '');
        s.style?.setProperty?.('--i', String(i));
        s.textContent = ch;
        parent.appendChild(s);
    });
}

// 招式名与「觉醒·类型」的切片字体按实际文字预载（浏览器只拉这几个字所在的切片）；没有 FontFaceSet 或加载失败时按回退字体显示。
export function preloadCutinFonts(doc, text) {
    const fonts = doc?.fonts;
    const sample = String(text || '');
    if (!sample || !fonts || typeof fonts.load !== 'function') return;
    for (const family of COMBAT_CUTIN_ART_FAMILIES) {
        try {
            const pending = fonts.load(`32px "${family}"`, sample);
            if (pending && typeof pending.catch === 'function') pending.catch(() => {});
        } catch { /* 字体读不到时按回退字体显示 */ }
    }
}

// 立绘裁切：放大倍数不超过让整幅图宽度铺满分格的上限，避免两侧露空。
export function combatCutinCrop(probed) {
    const head = probed?.head && Number(probed.head.w) > 0 ? probed.head : FALLBACK_HEAD;
    const guessed = !probed?.head || probed.head === FALLBACK_HEAD;
    const aspect = Number(probed?.naturalW) > 0 ? Number(probed.naturalH) / Number(probed.naturalW) : 0;
    const base = guessed ? COMBAT_CUTIN_FALLBACK_FOCUS : COMBAT_CUTIN_FOCUS;
    const focus = { ...base, span: Math.min(base.span, 1 / Math.max(0.02, Number(head.w))) };
    return { guessed, crop: resolveCutinCrop(head, aspect, COMBAT_CUTIN_FRAME, focus) };
}

// 眼部斜切条裁切：只在头位是真实探测结果时给出；头位只是默认猜测（不透明立绘或读不到像素）时放大到眼部会对不上脸，返回 null 跳过切入。
// 探测到脸部（probed.face：脸中心 x、眼线 eye、脸宽 w，均相对原图）时按脸取景，眼线对在斜条中线；发髻、马尾与发饰不再把取景顶高。
// 脸部结果先与头位互相印证：脸宽不到头宽的 FACE_MIN_OF_HEAD、脸中心落在头宽之外或眼线高过头顶时，多半是把发带、发髻高光认成了脸，
// 按脸取景会放大到一小块头发上，这时退回按头位取景。
const FACE_MIN_OF_HEAD = 0.4;
function faceFits(face, head) {
    const w = Number(face?.w), x = Number(face?.x), eye = Number(face?.eye);
    if (!(w > 0) || !(eye > 0) || !Number.isFinite(x)) return false;
    const hw = Number(head.w), hx = Number(head.x), top = Number(head.top);
    if (w < hw * FACE_MIN_OF_HEAD) return false;
    if (Math.abs(x - hx) > hw / 2) return false;
    return !(Number.isFinite(top) && eye <= top);
}
export function combatEyeCrop(probed) {
    const head = probed?.head;
    if (!head || head === FALLBACK_HEAD || !(Number(head.w) > 0)) return null;
    const aspect = Number(probed?.naturalW) > 0 ? Number(probed.naturalH) / Number(probed.naturalW) : 0;
    const face = probed?.face;
    if (face && faceFits(face, head)) {
        const span = Math.min(COMBAT_EYE_FACE_FOCUS.span, 1 / Math.max(0.02, Number(face.w)));
        return resolveCutinCrop({ x: Number(face.x), top: Number(face.eye), w: Number(face.w) }, aspect, COMBAT_EYE_FRAME, { span, line: 0 });
    }
    const focus = { ...COMBAT_EYE_FOCUS, span: Math.min(COMBAT_EYE_FOCUS.span, 1 / Math.max(0.02, Number(head.w))) };
    return resolveCutinCrop(head, aspect, COMBAT_EYE_FRAME, focus);
}

// 半身立绘分格：技能特写在右侧，觉醒特写（awaken）侧置、黑白描边叠在情绪色底板上（窄面板居中）。
export function buildCutinFigure(doc, url, probed, { awaken = false } = {}) {
    const { guessed, crop } = combatCutinCrop(probed);
    const figure = doc.createElement('div');
    figure.className = awaken ? 'igs-combat-cutin-figure is-awaken' : 'igs-combat-cutin-figure';
    figure.setAttribute?.('data-igs-cutin-focus', guessed ? 'fallback' : 'bust');
    const portrait = doc.createElement('div');
    portrait.className = 'igs-combat-cutin-portrait';
    if (portrait.style) {
        portrait.style.backgroundImage = cssUrl(url);
        portrait.style.backgroundSize = `${crop.size}% auto`;
        portrait.style.backgroundPosition = `${crop.x}% ${crop.y}%`;
    }
    figure.appendChild(portrait);
    return figure;
}

// 技能特写节点；停留时长为 COMBAT_CUTIN_MS.skill（写入 --igs-fx-life）。底色取立绘配色（探测得到的 tint），取不到时用样式默认色。
export function buildSkillCutin(doc, { name = '', skill = '', url = '', probed = null, reduced = false, low = false } = {}) {
    const el = doc.createElement('div');
    el.className = `igs-combat-cutin${reduced ? ' is-reduced' : ''}${low ? ' is-low' : ''}`;
    el.setAttribute?.('aria-hidden', 'true');
    el.style?.setProperty?.('--igs-fx-life', `${COMBAT_CUTIN_MS.skill}ms`);
    if (probed?.tint) el.style?.setProperty?.('--igs-combat-cutin-tint', probed.tint);
    for (const cls of ['igs-combat-cutin-lines', 'igs-combat-cutin-band']) {
        const n = doc.createElement('div');
        n.className = cls;
        el.appendChild(n);
    }
    if (url) el.appendChild(buildCutinFigure(doc, url, probed));
    const cap = doc.createElement('div');
    cap.className = 'igs-combat-cutin-cap';
    const who = doc.createElement('span');
    who.className = 'igs-combat-cutin-name';
    who.textContent = String(name || '');
    const move = doc.createElement('span');
    move.className = 'igs-combat-cutin-skill';
    appendArtText(doc, move, skill || name);
    cap.appendChild(who);
    cap.appendChild(move);
    el.appendChild(cap);
    if (!reduced) {
        const flash = doc.createElement('div');
        flash.className = 'igs-combat-cutin-flash';
        el.appendChild(flash);
    }
    return el;
}

// 觉醒特写节点（助手 10-29 方案 A）：全长 COMBAT_CUTIN_MS.awaken。有立绘、头位可信且未减少动态效果时，先放 COMBAT_AWAKEN_EYE_MS 的眼部斜切条切入
// （.igs-combat-awaken-eye：黑幕劈出斜线后张开为横贯整屏的眼部斜条），主段各层按 --aw-lead 延后进场；否则主段占满全程。
// 主段沿技能特写的布局加强：暗幕叠情绪色光 + 情绪母题纹样与粒子 + 情绪色速度线 + 宽斜带与反向细斜带 + 右侧放大推近的半身立绘（情绪色光晕）
// + 左侧字幕组（角色名、庞门正道纯字「觉醒·类型」、逐字出现的台词，--n 为台词字数）+ 开场与收尾两次闪白（收尾在 --aw-end）。名称、类型与台词只经 textContent 写入；立绘地址由调用方经 safePortraitUrl 过滤后传入；没有立绘时不画立绘与眼部。
export function buildAwakenCutin(doc, { name = '', skill = '', line = '', awakenType = '', url = '', probed = null, reduced = false, low = false } = {}) {
    const life = COMBAT_CUTIN_MS.awaken;
    const eye = url && !reduced ? combatEyeCrop(probed) : null;
    const el = doc.createElement('div');
    el.className = `igs-combat-awaken-cutin${reduced ? ' is-reduced' : ''}${low ? ' is-low' : ''}`;
    el.setAttribute?.('data-awaken', String(awakenType || ''));
    el.setAttribute?.('aria-hidden', 'true');
    el.style?.setProperty?.('--igs-fx-life', `${life}ms`);
    el.style?.setProperty?.('--aw-lead', `${eye ? COMBAT_AWAKEN_EYE_MS : 0}ms`);
    // 宽斜带与技能特写一样取立绘配色（探测得到的 tint），与情绪色混合；取不到时只用情绪色。
    if (probed?.tint) el.style?.setProperty?.('--igs-combat-cutin-tint', probed.tint);
    el.style?.setProperty?.('--aw-end', `${Math.round(life * COMBAT_AWAKEN_END)}ms`);
    const add = (cls, parent = el) => {
        const n = doc.createElement('div');
        n.className = cls;
        parent.appendChild(n);
        return n;
    };
    for (const cls of ['igs-combat-awaken-fx', 'igs-combat-cutin-lines', 'igs-combat-awaken-band', 'igs-combat-awaken-band is-cross']) add(cls);
    if (url) el.appendChild(buildCutinFigure(doc, url, probed, { awaken: true }));
    const cap = add('igs-combat-awaken-cap');
    const label = doc.createElement('span');
    label.className = 'igs-combat-awaken-label';
    const who = doc.createElement('span');
    who.className = 'igs-combat-awaken-name';
    who.textContent = String(name || '');
    label.appendChild(who);
    const kind = doc.createElement('span');
    kind.className = 'igs-combat-awaken-kind';
    appendArtText(doc, kind, `觉醒·${skill || ''}`);
    label.appendChild(kind);
    cap.appendChild(label);
    if (line) {
        const text = `「${line}」`;
        const ln = doc.createElement('span');
        ln.className = 'igs-combat-awaken-line';
        ln.textContent = text;
        ln.style?.setProperty?.('--n', String(Math.min(40, Array.from(text).length)));
        cap.appendChild(ln);
    }
    if (eye) {
        const strip = add('igs-combat-awaken-eye-strip', add('igs-combat-awaken-eye'));
        if (strip.style) {
            strip.style.backgroundImage = cssUrl(url);
            strip.style.backgroundSize = `${eye.size}% auto`;
            strip.style.backgroundPosition = `${eye.x}% ${eye.y}%`;
        }
    }
    if (!reduced) {
        add('igs-combat-cutin-flash is-awaken-open');
        add('igs-combat-cutin-flash is-awaken-end');
    }
    return el;
}

// 开战过场：点「开始战斗」后整屏闪入「开战」大字（暗幕 + 斜向色带 + 一次闪白），停留 COMBAT_CUTIN_MS.opening。
// 低画质不闪白；减少动态效果时由调用方不播。文字是程序常量。
export function buildOpeningCutin(doc, { low = false } = {}) {
    const el = doc.createElement('div');
    el.className = `igs-combat-opening${low ? ' is-low' : ''}`;
    el.setAttribute?.('aria-hidden', 'true');
    el.style?.setProperty?.('--igs-fx-life', `${COMBAT_CUTIN_MS.opening}ms`);
    for (const cls of ['igs-combat-cutin-band']) {
        const n = doc.createElement('div');
        n.className = cls;
        el.appendChild(n);
    }
    const word = doc.createElement('span');
    word.className = 'igs-combat-opening-word';
    word.textContent = '开战';
    el.appendChild(word);
    if (!low) {
        const flash = doc.createElement('div');
        flash.className = 'igs-combat-cutin-flash';
        el.appendChild(flash);
    }
    return el;
}
