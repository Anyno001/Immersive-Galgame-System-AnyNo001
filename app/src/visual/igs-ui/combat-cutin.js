import { resolveCutinCrop } from './fx-runtime.js';
import { FALLBACK_HEAD } from './fx-anchor.js';
import { COMBAT_CUTIN_FRAME } from './combat-cutin-style.js';

// 战斗 cut-in 的 DOM 构造（纯 DOM，无计时）：独立命名空间 .igs-combat-cutin-*，不复用阅读器 [igs-fx:cutin] 的节点与样式。
// 技能特写：暗幕 + 速度线 + 斜向色带 + 半身立绘（运镜由样式完成）+ 角色名与招式名 + 一次闪白。
// 名称与招式名只经 textContent 写入；立绘地址由调用方经 safePortraitUrl 过滤后传入。
// opening 为开战过场（「开战」大字）的停留时长。
export const COMBAT_CUTIN_MS = Object.freeze({ skill: 1800, awaken: 2600, opening: 800 });
// 半身取景：头宽约占分格 38%，分格中心对在头顶往下约 1.3 个头高处（胸口），头落在分格上三分之一。
export const COMBAT_CUTIN_FOCUS = Object.freeze({ span: 2.6, line: 1.3 });
// 头位只是默认猜测时退回更宽的取景，不把猜错的位置放大。
export const COMBAT_CUTIN_FALLBACK_FOCUS = Object.freeze({ span: 3.2, line: 1.2 });

const cssUrl = (url) => `url("${String(url).replace(/[\r\n]/g, '').replace(/["\\]/g, (ch) => `\\${ch}`)}")`;

// 立绘裁切：放大倍数不超过让整幅图宽度铺满分格的上限，避免两侧露空。
export function combatCutinCrop(probed) {
    const head = probed?.head && Number(probed.head.w) > 0 ? probed.head : FALLBACK_HEAD;
    const guessed = !probed?.head || probed.head === FALLBACK_HEAD;
    const aspect = Number(probed?.naturalW) > 0 ? Number(probed.naturalH) / Number(probed.naturalW) : 0;
    const base = guessed ? COMBAT_CUTIN_FALLBACK_FOCUS : COMBAT_CUTIN_FOCUS;
    const focus = { ...base, span: Math.min(base.span, 1 / Math.max(0.02, Number(head.w))) };
    return { guessed, crop: resolveCutinCrop(head, aspect, COMBAT_CUTIN_FRAME, focus) };
}

// 半身立绘分格：技能特写在右侧，觉醒特写（awaken）居中叠在情绪色幕上。
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
    move.textContent = String(skill || name || '');
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
