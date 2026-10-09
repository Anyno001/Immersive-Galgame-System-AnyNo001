import { buildDialogFrameCss, scalePx, stroke } from './dialog-skin-frame.js';

export const DIALOG_SKIN_MERMAID = 'mermaid-deep';

// 深海人鱼：与魔法星夜同一套骨架——不画实心框，通栏薄纱自上而下由全透明沉入深海（配色可选），没有硬边。
// 人鱼自己的记号：细线是一道起伏的水波（两端渐隐），正中一枚人鱼尾鳍伴两粒气泡，徽记四周泛贝母的粉紫光；
// 线上方右侧留白里是几道水纹（不铺鳞片之类的密集纹样，免得看着密恐），
// 四处散着小气泡，水面透下来的波光缓慢明灭（只动透明度，舞台暂停或减少动态时静止）。
// 场景在水下时阅读器会自动换成这套（worldview-skins.js 的 sceneDialogSkin），也可以在设置里常驻选用。
// 配色：底色（薄纱）、珠光（细线与徽记）、高光、贝母光晕四个变量，reader-dom-render 写在 #igs-overlay 上，
// 选项、状态栏、物品卡、战斗与标题卡共用。默认深海蓝；「自定义」珠光取用户选的颜色，底色由它压暗得来（readerSettings.mermaidAccent）。
export const MERMAID_TONES = Object.freeze([
    Object.freeze({ id: 'ocean', label: '深海蓝', veil: '#0a2148', line: '#c8dcf6', hi: '#f3f8ff', glow: '#e4c8f0' }),
    Object.freeze({ id: 'lagoon', label: '浅海青', veil: '#06323c', line: '#c4ecf1', hi: '#f2fdff', glow: '#d6eef0' }),
    Object.freeze({ id: 'moon', label: '月光紫', veil: '#2a1650', line: '#e0cdfa', hi: '#f9f3ff', glow: '#f6c6e8' }),
    Object.freeze({ id: 'coral', label: '珊瑚粉', veil: '#3a1822', line: '#ffc4b4', hi: '#fff1ec', glow: '#ffd0a8' }),
    Object.freeze({ id: 'custom', label: '自定义', veil: '#05070d', line: '#c8dcf6', hi: '#f3f8ff', glow: '#e4c8f0', custom: true }),
]);
export const MERMAID_TONE_DEFAULT = 'ocean';
export const MERMAID_ACCENT_DEFAULT = '#c8dcf6';
export function normalizeMermaidTone(value) {
    return MERMAID_TONES.some((tone) => tone.id === value) ? value : MERMAID_TONE_DEFAULT;
}
export function normalizeMermaidAccent(value) {
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : MERMAID_ACCENT_DEFAULT;
}
const lighten = (hex) => `#${[1, 3, 5].map((i) => Math.round((parseInt(hex.slice(i, i + 2), 16) + 255) / 2).toString(16).padStart(2, '0')).join('')}`;
export function mermaidToneVars(value, accent) {
    const tone = MERMAID_TONES.find((item) => item.id === normalizeMermaidTone(value));
    const line = tone.custom ? normalizeMermaidAccent(accent) : tone.line;
    // 自定义：底色取珠光色压到很暗（约 16% 混近黑），整套跟着用户的颜色走。
    const veil = tone.custom ? `#${[1, 3, 5].map((i) => Math.round(parseInt(line.slice(i, i + 2), 16) * 0.16 + 5).toString(16).padStart(2, '0')).join('')}` : tone.veil;
    return { '--igs-mm-veil': veil, '--igs-mm-line': line, '--igs-mm-hi': tone.custom ? lighten(line) : tone.hi, '--igs-mm-glow': tone.glow };
}
const VEIL = 'var(--igs-mm-veil,#0a2148)';
export const MERMAID_PEARL = 'var(--igs-mm-line,#c8dcf6)';
export const MERMAID_PEARL_HI = 'var(--igs-mm-hi,#f3f8ff)';
const GLOW = 'var(--igs-mm-glow,#e4c8f0)';
const tint = (color, alpha) => `color-mix(in srgb,${color} ${Math.round(alpha * 100)}%,transparent)`;
export const mermaidDeep = (alpha) => tint(VEIL, alpha);
// 薄纱下段：底色先压向近黑再做透明度，正文底更沉。
export const mermaidAbyss = (alpha) => tint(`color-mix(in srgb,${VEIL} 42%,#02050a)`, alpha);
export const mermaidPearl = (alpha) => tint(MERMAID_PEARL, alpha);
const pearlHi = (alpha) => tint(MERMAID_PEARL_HI, alpha);
const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

// 珍珠（24×24）：选项、状态栏、标题卡等处复用；用渐变画出珠光，不作遮罩。
export const MERMAID_PEARL_DOT = `radial-gradient(circle at 36% 32%,#fff 0,${MERMAID_PEARL_HI} 22%,${MERMAID_PEARL} 52%,color-mix(in srgb,${MERMAID_PEARL} 60%,#2a3a50) 80%,transparent 82%)`;

const LINE_Y = 46;
const EMBLEM = { width: 88, height: 36 };
// 徽记作遮罩、填珠光色：正中一枚向下舒展的人鱼尾鳍（尾柄细、两叶外翻），右上两粒小气泡。
const FLUKE = 'M30.7 1.5C30.1 6 30.4 10 31 13.2C27.2 12.6 21.8 14.8 17 21.6C20.6 19.6 24.6 19 27.4 19.4C29.4 19.7 30.9 19.2 32 17.9C33.1 19.2 34.6 19.7 36.6 19.4C39.4 19 43.4 19.6 47 21.6C42.2 14.8 36.8 12.6 33 13.2C33.6 10 33.9 6 33.3 1.5Z';
const EMBLEM_MASK = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="88" height="36" viewBox="0 0 64 26"><path d="${FLUKE}" fill="#fff"/><circle cx="41.5" cy="6.6" r="1.5" fill="#fff"/><circle cx="45.4" cy="2.6" r=".9" fill="#fff" fill-opacity=".85"/></svg>`);
// 水波细线：像素单位的波形图案，随框宽重复不拉伸；用渐变遮罩让外端淡出。side='left' 外端在左。
const waveLine = (side) => {
    const [from, to] = side === 'left' ? ['0', '1'] : ['1', '0'];
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="8"><defs><linearGradient id="g" x1="${from}" x2="${to}" y1="0" y2="0"><stop offset=".03" stop-color="#fff" stop-opacity="0"/><stop offset=".34" stop-color="#fff"/></linearGradient><mask id="m"><rect width="100%" height="8" fill="url(#g)"/></mask><pattern id="p" width="72" height="8" patternUnits="userSpaceOnUse"><path d="M0 4Q18 1.8 36 4T72 4" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1"/></pattern></defs><rect width="100%" height="8" fill="url(#p)" mask="url(#m)"/></svg>`);
};
// 水纹：三道起伏的细线，放在细线上方右侧的留白里。
const RIPPLES = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="132" height="36" viewBox="0 0 132 36"><g fill="none" stroke="#fff" stroke-linecap="round" stroke-width=".8"><path d="M4 12Q20 6 36 12T68 12T100 12T128 12" stroke-opacity=".22"/><path d="M18 22Q32 17 46 22T74 22T102 22" stroke-opacity=".16"/><path d="M40 31Q52 27 64 31T88 31" stroke-opacity=".1"/></g></svg>`);
// 波光层：水面透下来的几抹亮斑，散在留白与两侧边缘，避开正文。
const glint = (x, y, rx, opacity) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${(rx / 5).toFixed(2)}" fill="#fff" fill-opacity="${opacity}"/>`;
const GLINTS = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="184" viewBox="0 0 1000 184" preserveAspectRatio="none">${glint(140, 18, 22, 0.8)}${glint(176, 26, 10, 0.55)}${glint(370, 30, 16, 0.6)}${glint(600, 14, 20, 0.7)}${glint(632, 22, 9, 0.5)}${glint(30, 120, 12, 0.45)}${glint(968, 96, 14, 0.5)}</svg>`);
// 气泡：空心小圈加几粒实心微光，百分比坐标随框宽铺开。
const BUBBLES = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">${[[5, 14, 2.4], [16, 36, 1.4], [26, 8, 1.8], [44, 12, 1.2], [57, 34, 1.6], [70, 9, 2.2], [79, 38, 1.3], [94, 20, 1.8], [3, 70, 1.6], [97, 62, 2], [11, 90, 1.3], [89, 86, 1.6]]
    .map(([x, y, r], i) => (i % 3
        ? `<circle cx="${x}%" cy="${y}%" r="${r}" fill="none" stroke="#e8fbff" stroke-opacity=".5" stroke-width=".7"/>`
        : `<circle cx="${x}%" cy="${y}%" r="${r * 0.5}" fill="#e8fbff" fill-opacity=".8"/>`)).join('')}</svg>`);
const SIDE = `calc(50% - ${EMBLEM.width / 2 + 6}px) 8px`;

const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_MERMAID}"]`;
const overlayScope = `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_MERMAID}"]`;

export const MERMAID_DIALOG_STYLE = [
    buildDialogFrameCss(DIALOG_SKIN_MERMAID, {
        height: 184,
        text: { top: 58, speakerTop: 60, right: 72, bottom: 20, left: 72 },
        rise: 0,
        flush: true,
        frameCss: `background-color:transparent;background-image:${waveLine('left')},${waveLine('right')},${RIPPLES},${BUBBLES},radial-gradient(ellipse 18% 54px at 50% ${LINE_Y}px,${tint(GLOW, 0.42)},${tint(GLOW, 0.14)} 50%,transparent),linear-gradient(180deg,transparent 0,${mermaidDeep(0.3)} ${LINE_Y}px,${mermaidAbyss(0.74)} 43%,${mermaidAbyss(0.86)});background-position:left ${LINE_Y - 4}px,right ${LINE_Y - 4}px,right 56px top 4px,0 0,0 0,0 0;background-size:${SIDE},${SIDE},132px 36px,100% 100%,100% 100%,100% 100%;background-repeat:no-repeat;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;`,
        speakerCss: `left:56px;top:${LINE_Y - 38}px;width:max-content;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 112px);height:34px;line-height:34px;padding:0 0 0 24px;background:none;border:0;font-size:21px;font-weight:400;letter-spacing:.1em;text-shadow:${stroke('rgba(2,20,30,.45)')},0 0 12px ${pearlHi(0.5)};`,
        textCss: `letter-spacing:.06em;text-shadow:${stroke('rgba(2,20,30,.4)')},0 1px 2px rgba(2,12,20,.85);`,
    }),
    scalePx(`${scope} .igs-speaker::before{content:"";position:absolute;left:2px;top:50%;width:12px;height:12px;margin-top:-6px;border-radius:50%;background:${MERMAID_PEARL_DOT};box-shadow:0 0 6px ${pearlHi(0.7)};}`),
    scalePx(`${scope}::after{content:"";position:absolute;left:50%;top:${LINE_Y - EMBLEM.height / 2}px;width:${EMBLEM.width}px;height:${EMBLEM.height}px;transform:translateX(-50%);background:${MERMAID_PEARL_HI};-webkit-mask:${EMBLEM_MASK} center/100% 100% no-repeat;mask:${EMBLEM_MASK} center/100% 100% no-repeat;filter:drop-shadow(0 0 4px ${pearlHi(0.7)}) drop-shadow(0 0 9px ${tint(GLOW, 0.85)});pointer-events:none;}`),
    `${scope}::before{content:"";position:absolute;inset:0;background:${GLINTS} 0 0/100% 100% no-repeat;pointer-events:none;opacity:.45;animation:igs-mm-glint 6.4s ease-in-out infinite alternate;will-change:opacity;}`,
    '@keyframes igs-mm-glint{0%{opacity:.2}50%{opacity:.85}100%{opacity:.4}}',
    `#igs-overlay[data-igs-paused] .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_MERMAID}"]::before{animation-play-state:paused;}`,
    `@media (prefers-reduced-motion: reduce){${scope}::before{animation:none;opacity:.55;}}`,
    // 窄屏左右留白减半，正文多出一两个字宽；姓名随之左移。
    `@media (max-width:640px){${scalePx(`${scope},${scope}[data-igs-has-speaker="1"]{padding-left:36px;padding-right:36px;}${scope} .igs-speaker{left:24px;max-width:calc(100% - 48px);}`)}}`,
].join('\n');

// 选项：深海薄纱横带 + 上下两道渐隐珠光线，上线正中一颗珍珠，悬停时珠光亮起。
const choiceScope = `${overlayScope} .igs-option-bubble`;
export const MERMAID_CHOICE_STYLE = [
    `${choiceScope}{box-sizing:border-box;min-height:44px;padding:10px 44px;border:0;border-radius:0;background:linear-gradient(90deg,transparent,${mermaidPearl(0.6)},transparent) left top/100% 1px no-repeat,linear-gradient(90deg,transparent,${mermaidPearl(0.35)},transparent) left bottom/100% 1px no-repeat,linear-gradient(90deg,transparent,${mermaidDeep(0.78)} 20%,${mermaidDeep(0.78)} 80%,transparent);box-shadow:none;color:#e9f8fb;letter-spacing:.12em;text-shadow:0 1px 3px rgba(2,12,20,.85);}`,
    `${choiceScope}::before{content:"";position:absolute;left:50%;top:-4px;width:9px;height:9px;margin-left:-4.5px;border-radius:50%;background:${MERMAID_PEARL_DOT};opacity:.6;transition:opacity .2s,box-shadow .2s;}`,
    `${choiceScope}:hover{background:linear-gradient(90deg,transparent,${pearlHi(0.9)},transparent) left top/100% 1px no-repeat,linear-gradient(90deg,transparent,${pearlHi(0.55)},transparent) left bottom/100% 1px no-repeat,radial-gradient(ellipse 45% 120% at 50% 50%,${mermaidPearl(0.2)},transparent),linear-gradient(90deg,transparent,${mermaidDeep(0.88)} 16%,${mermaidDeep(0.88)} 84%,transparent);color:#fff;text-shadow:0 0 10px ${pearlHi(0.6)},0 1px 3px rgba(2,12,20,.85);}`,
    `${choiceScope}:hover::before{opacity:1;box-shadow:0 0 6px ${pearlHi(0.9)};}`,
    `${choiceScope}:active{transform:translateY(1px);}`,
].join('\n');

const s = (value) => `calc(${value}px * var(--igs-hud-scale,1))`;
const ring = (color, width) => `drop-shadow(${width}px 0 0 ${color}) drop-shadow(-${width}px 0 0 ${color}) drop-shadow(0 ${width}px 0 ${color}) drop-shadow(0 -${width}px 0 ${color})`;
const fill = (percent) => `color-mix(in srgb,var(--igs-hud-fill-color) ${percent}%,${MERMAID_PEARL_HI})`;

// 状态栏零件：深海薄纱面板、珠光细线、细进度条，情绪标签前一颗珍珠。
export const MERMAID_HUD_THEME = Object.freeze({
    neutral: '#bcd6dc',
    toast: `background:linear-gradient(180deg,${mermaidDeep(0.84)},${mermaidDeep(0.92)});border:0;border-bottom:1px solid ${mermaidPearl(0.65)};border-radius:0;box-shadow:0 0 14px ${pearlHi(0.2)};color:#e9f8fb;`,
    panel: `background:linear-gradient(90deg,${mermaidPearl(0.6)},transparent) left top/100% 1px no-repeat,linear-gradient(90deg,${mermaidPearl(0.4)},transparent) left bottom/100% 1px no-repeat,linear-gradient(90deg,${mermaidDeep(0.82)},${mermaidDeep(0.58)} 70%,transparent);border:0;border-radius:0;box-shadow:none;`,
    ink: '#e2f4f7',
    emotion: `padding:${s(1)} ${s(4)} ${s(1)} ${s(16)};border:0;border-bottom:1px solid ${mermaidPearl(0.65)};border-radius:0;background:transparent;color:#effbfd;letter-spacing:.14em;text-shadow:0 0 8px ${pearlHi(0.6)},0 1px 3px rgba(0,0,0,.9);position:relative;`,
    emotionBefore: `content:"";position:absolute;left:0;top:50%;width:${s(9)};height:${s(9)};margin-top:${s(-4.5)};border-radius:50%;background:${MERMAID_PEARL_DOT};`,
    avatar: `filter:${ring(mermaidPearl(0.85), 1)} drop-shadow(0 0 5px ${pearlHi(0.55)});`,
    placeholder: `background:radial-gradient(circle at 50% 30%,${mermaidPearl(0.3)},${mermaidDeep(0.92)});color:${MERMAID_PEARL_HI};`,
    placeholderSvg: `stroke:${MERMAID_PEARL_HI};stroke-width:1.1;`,
    track: `height:${s(2)};border:0;border-radius:0;background:${mermaidPearl(0.22)};overflow:visible;`,
    fill: `background:${fill(60)} !important;border-radius:0;box-shadow:0 0 6px ${fill(70)};`,
    value: 'font-weight:400;',
});
