import { buildDialogFrameCss, scalePx } from './dialog-skin-frame.js';

// 心理恐怖皮肤随 overlay 上的 data-igs-dread（0 平静 / 1 不安 / 2 危险 / 3 爆发，见 horror-dread.js）升级，
// 平静档要耐看、克制，最高档做到最极端；档位只靠 CSS 读取，升档的一次性动画用 transform/opacity。
export const DIALOG_SKIN_HORROR_PSYCH = 'horror-psych';
const LEVELS = [0, 1, 2, 3];

const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const s = (value) => `calc(${value}px * var(--igs-hud-scale,1))`;
const ring = (color, width) => `drop-shadow(${width}px 0 0 ${color}) drop-shadow(-${width}px 0 0 ${color}) drop-shadow(0 ${width}px 0 ${color}) drop-shadow(0 -${width}px 0 ${color})`;
const overlayOf = (skin) => `#igs-overlay[data-igs-dialog-skin="${skin}"]`;
const scopeOf = (skin) => `#igs-overlay .igs-dialog[data-igs-dialog-skin="${skin}"]`;
const atLevel = (skin, level) => `#igs-overlay[data-igs-dread="${level}"] .igs-dialog[data-igs-dialog-skin="${skin}"]`;
const overlayAtLevel = (skin, level) => `#igs-overlay[data-igs-dialog-skin="${skin}"][data-igs-dread="${level}"]`;
const grain = (alpha) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="140" height="140"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".95" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 ${alpha} 0 0 0 -.1"/></filter><rect width="140" height="140" filter="url(#n)"/></svg>`);
const motionGuards = (scope, parts) => [
    `${parts.map((p) => `${scope.replace('#igs-overlay', '#igs-overlay[data-igs-paused]')}${p}`).join(',')}{animation-play-state:paused;}`,
    `@media (prefers-reduced-motion: reduce){${parts.map((p) => `${scope}${p}`).join(',')}{animation:none !important;}}`,
];

// 固定种子的伪随机，保证每次生成的图案一致。
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const r1 = (n) => +n.toFixed(1);
const DROP_PATH = 'M12 2.5C15.5 8 18.5 11.6 18.5 15.4A6.5 6.5 0 0 1 5.5 15.4C5.5 11.6 8.5 8 12 2.5Z';
export const PSYCH_DROP_MASK = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${DROP_PATH}"/></svg>`);

// ── 心理恐怖：正常界面崩坏 ─────────────────────────────────
// 先装成一张可爱的校园风卡片（粉紫薄荷、圆角、小爱心），玩家放下戒心后它自己慢慢坏掉：
// 0 正常；1 有点怪：名牌歪了一两像素、颜色悄悄褪一点、角落一颗爱心变成了眼睛；
// 2 在坏：发灰、圆角塌成直角、爱心倒挂、正文偶尔错位带色散、纸面闪一下；
// 3 崩溃：黑底红白字、名牌错位、装饰全变成眼睛、噪点一直在闪。名牌换人名、正文混字等要 JS 的留到世界观阶段。
const PINK = '#f4a3c0';
const PINK_DEEP = '#e0779d';
const LILAC = '#c7b4f0';
const MINT = '#9fdcc8';
const CREAM = '#fffafc';
const PLUM = '#6b4a5c';
const BLOOD = '#b3161b';

const HEART = 'M0 7C-7 2-10-2-10-5.5A5 5 0 0 1 0-8A5 5 0 0 1 10-5.5C10-2 7 2 0 7Z';
const STAR = 'M0-9C.6-3.2 3.2-.6 9 0C3.2.6.6 3.2 0 9C-.6 3.2-3.2.6-9 0C-3.2-.6-.6-3.2 0-9Z';
// 眼睛三种画法：实心、半透明（实心压低不透明度）、线描（只有轮廓、虹膜圈和几根睫毛）。眼眶纵向张得开。
const EYE_LID = 'M-11 0Q0-14 11 0Q0 14-11 0Z';
const eyeBody = ({ style, sclera, iris, width = 1.3 }) => (style === 'line'
    ? `<g fill="none" stroke-width="${width}" stroke-linecap="round" vector-effect="non-scaling-stroke"><path d="${EYE_LID}" stroke="${sclera}" vector-effect="non-scaling-stroke"/><circle r="5" stroke="${iris}" vector-effect="non-scaling-stroke"/>`
        + `<path d="M-6-6.4L-8.2-10.2M0-7.4V-11.8M6-6.4L8.2-10.2" stroke="${sclera}" vector-effect="non-scaling-stroke"/></g><circle r="1.9" fill="${iris}"/>`
    : `<path d="${EYE_LID}" fill="${sclera}"/><circle r="5" fill="${iris}"/><circle r="2" fill="#000"/>`);
// 眨眼：SVG 内置动画，各只眼周期与起点都不同，绝大部分时间睁着，偶尔闭一下。暂停与减少动态时换成静态图。
// 只让动画在眨眼那一小段（周期末 4.5%）处于激活态，靠 id.end 自己接下一轮：睁眼期间没有激活的动画，
// 浏览器不必每帧重绘这张背景图（整周期 repeatCount 会让图片 60fps 重栅格化，手机发热）。时间点与原写法一致。
let blinkSeq = 0;
const blink = (period, delay) => {
    const id = `k${blinkSeq++}`;
    const t = (v) => +v.toFixed(3);
    return `<animateTransform id="${id}" attributeName="transform" type="scale" values="1 1;1 .06;1 1;1 1" keyTimes="0;.378;.733;1" dur="${t(period * 0.045)}s" begin="${t(delay + period * 0.955)}s;${id}.end+${t(period * 0.955)}s"/>`;
};
const eyeAt = (e, rand, animated) => `<g transform="translate(${r1(e.x)} ${r1(e.y)}) scale(${r1(e.k)})" opacity="${r1(e.opacity)}"><g>${animated ? blink(r1(5 + rand() * 8), r1(rand() * 7)) : ''}${eyeBody(e)}</g></g>`;
// 崩溃档：右下角挤着一整团眼睛，持续往上浮。把眼睛当成圆来排：先落几只真正大的，再用中、小眼填满缝隙，
// 圆与圆相切或互相压进一部分（眼睛半透明，重叠处叠出层次），不留零散空白。平涂：眼白、虹膜、瞳孔三个圆，
// 视线各朝一个方向。图块上下无缝（纵向按环绕距离排），背景位置循环上移；以右下角为圆心的遮罩让整团往左上散掉。
const PACK = [320, 420];
const packEyes = (seed, [w, h]) => {
    const rand = seeded(seed);
    const eyes = [];
    const wrapDy = (dy) => Math.min(Math.abs(dy), h - Math.abs(dy));
    // 允许压进邻圆的比例：大眼之间压得少，小眼可以多压一点。
    for (const [rMax, rMin, tries, press] of [[88, 66, 80, 0.18], [46, 30, 160, 0.3], [24, 16, 70, 0.34]]) {
        for (let t = 0; t < tries; t++) {
            const x = rand() * w;
            const y = rand() * h;
            let room = Math.min(rMax, x - 4, w - 24 - x);
            for (const e of eyes) {
                const d = Math.hypot(e.x - x, wrapDy(e.y - y));
                room = Math.min(room, d - e.r * (1 - press));
                if (room < rMin) break;
            }
            if (room >= rMin) eyes.push({ x, y, r: room });
        }
    }
    return eyes;
};
const IRIS = ['#7e2a2e', '#5a1d21', '#9a3438', '#4a2a2c'];
const roundEye = ({ x, y, r }, rand, animated) => {
    const a = rand() * Math.PI * 2;
    const g = r * (0.08 + rand() * 0.2);
    const ix = r1(Math.cos(a) * g);
    const iy = r1(Math.sin(a) * g);
    const opacity = r1(0.18 + rand() * 0.3);
    const iris = IRIS[Math.floor(rand() * IRIS.length)];
    return `<g transform="translate(${r1(x)} ${r1(y)})" opacity="${opacity}"><g>${animated ? blink(r1(9 + rand() * 9), r1(rand() * 16)) : ''}`
        + `<circle r="${r1(r)}" fill="#efe9e8"/><circle cx="${ix}" cy="${iy}" r="${r1(r * 0.5)}" fill="${iris}"/><circle cx="${ix}" cy="${iy}" r="${r1(r * 0.22)}" fill="#0b0b0d"/></g></g>`;
};
const EYE_RISE = (animated) => {
    const rand = seeded(77);
    const [w, h] = PACK;
    const body = packEyes(61, PACK).map((e) => {
        // 跨上下边的眼睛在另一侧再画一份，图块纵向首尾相接。
        const copies = [e, ...(e.y - e.r < 0 ? [{ ...e, y: e.y + h }] : []), ...(e.y + e.r > h ? [{ ...e, y: e.y - h }] : [])];
        const state = rand();
        return copies.map((c) => roundEye(c, seeded(Math.floor(state * 1e9)), animated)).join('');
    }).join('');
    return [svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`)];
};
// 装饰点位：[形状, x, y, 缩放, 颜色]；variant 即档位，决定崩坏程度。
const DECO_ITEMS = Object.freeze({
    corner: [['heart', 104, 50, 1.4, PINK], ['heart', 128, 26, 0.85, LILAC], ['star', 78, 72, 0.9, MINT], ['star', 126, 70, 0.6, PINK], ['heart', 58, 80, 0.6, MINT], ['star', 132, 6, 0.5, LILAC]],
    top: [['star', 14, 16, 0.7, LILAC], ['heart', 40, 12, 0.7, PINK], ['star', 64, 20, 0.5, MINT]],
});
const GREY = { [PINK]: '#c9bcc1', [LILAC]: '#b7b2bf', [MINT]: '#b4bfbb' };
const decoSvg = (part, viewBox, variant, animated) => {
    const rand = seeded(31 + variant * 7 + part.length);
    const body = (DECO_ITEMS[part] || []).map(([shape, x, y, k, color], i) => {
            const tone = variant >= 2 ? GREY[color] : color;
            if ((variant === 1 && part === 'corner' && i === 1) || (variant === 2 && i % 3 === 1)) {
                return eyeAt({ x, y, k: k * 1.05, opacity: 1, style: 'solid', sclera: tone, iris: PLUM }, rand, animated);
            }
            const flip = variant === 2 && shape === 'heart' ? ' rotate(180)' : '';
            return `<g transform="translate(${x} ${y}) scale(${k})${flip}"><path d="${shape === 'heart' ? HEART : STAR}" fill="${tone}"/></g>`;
        }).join('');
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`);
};
const DECO = LEVELS.map((variant) => [true, false].map((animated) => (variant === 3 ? EYE_RISE(animated) : [
    decoSvg('corner', '0 0 150 92', variant, animated),
    decoSvg('top', '0 0 80 32', variant, animated),
])));
const decoImages = (variant, animated = true) => `background-image:${DECO[variant][animated ? 0 : 1].join(',')};`;
const decoLayer = (variant) => `${decoImages(variant)}background-repeat:no-repeat;${variant === 3 ? `background-repeat:repeat-y;inset:0 0 0 auto;width:${PACK[0]}px;background-position:0 0;background-size:${PACK[0]}px ${PACK[1]}px;-webkit-mask:radial-gradient(ellipse 100% 120% at 100% 100%,#000 40%,transparent 95%);mask:radial-gradient(ellipse 100% 120% at 100% 100%,#000 40%,transparent 95%);animation:igs-hp-rise 30s steps(${PACK[1]},end) infinite;` : 'background-position:right 14px bottom 8px,right 26px top 10px;background-size:150px 92px,80px 32px;'}`;
const POLKA = (color) => `radial-gradient(circle,${color} 0 1.6px,transparent 2.1px) 0 0/18px 18px`;
const HEART_ICON = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-11 -10 22 19"><path d="${HEART}" fill="#fff"/></svg>`);
const EYE_ICON = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -8 24 16"><path d="M-11 0Q0-11 11 0Q0 11-11 0Z" fill="#fff"/><circle r="4" fill="#3a2e30"/></svg>`);
const tagIcon = (icon, w = 17, h = 15) => `background:${icon} left 18px center/${w}px ${h}px no-repeat,${PINK_DEEP};`;
const EYE_PATH = "<path fill-rule='evenodd' d='M1.8 12C5 6.8 8.4 5 12 5S19 6.8 22.2 12C19 17.2 15.6 19 12 19S5 17.2 1.8 12ZM12 8.4A3.6 3.6 0 1 0 12 15.6A3.6 3.6 0 1 0 12 8.4Z'/><circle cx='12' cy='12' r='1.8'/>";
export const HORROR_EYE_MASK = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${EYE_PATH.replace(/'/g, '"')}</svg>`);
export const HORROR_HEART_MASK = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-11 -10 22 19"><path d="${HEART}"/></svg>`);

const psychOverlay = overlayOf(DIALOG_SKIN_HORROR_PSYCH);
const psychScope = scopeOf(DIALOG_SKIN_HORROR_PSYCH);
const psych = (level) => atLevel(DIALOG_SKIN_HORROR_PSYCH, level);

export const PSYCH_DIALOG_STYLE = [
    buildDialogFrameCss(DIALOG_SKIN_HORROR_PSYCH, {
        height: 200,
        text: { top: 30, speakerTop: 44, right: 150, bottom: 28, left: 40 },
        rise: 18,
        frameCss: `isolation:isolate;background:${POLKA('rgba(244,163,192,.22)')},linear-gradient(${CREAM},#fbf1fa);border:3px solid ${PINK};border-radius:24px;box-shadow:0 6px 0 rgba(224,119,157,.28),0 12px 26px rgba(80,40,60,.2);-webkit-backdrop-filter:none;backdrop-filter:none;transition:border-radius .6s,border-color .6s,filter .8s;`,
        speakerCss: `left:30px;top:-20px;width:max-content;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 60px);height:38px;line-height:38px;padding:0 20px 0 44px;${tagIcon(HEART_ICON)}border:0;border-radius:999px;box-shadow:0 0 0 3px ${CREAM},0 3px 0 3px rgba(224,119,157,.3);font-size:21px;font-weight:400;letter-spacing:.1em;text-shadow:none;transition:transform .6s;`,
        textCss: 'letter-spacing:.04em;',
    }),
    scalePx(`${psychScope}::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;will-change:transform;${decoLayer(0)}}`),
    `${psychScope}::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;opacity:0;}`,
    // 1 有点怪：几乎察觉不到的偏差。
    `${psych(1)}{filter:saturate(.82);border-radius:24px 24px 24px 19px;}`,
    scalePx(`${psych(1)}::before{${decoLayer(1)}}`),
    `${psych(1)} .igs-speaker{transform:translate(2px,1px) rotate(-.6deg);}`,
    // 2 在坏：发灰、圆角塌陷、爱心倒挂；正文偶尔错位带色散，纸面像灯管闪了一下。
    `${psych(2)}{filter:saturate(.28) contrast(1.04);border-radius:24px 3px 24px 6px;border-color:#c9bcc1;}`,
    scalePx(`${psych(2)}::before{${decoLayer(2)}}`),
    `${psych(2)} .igs-speaker{transform:translate(5px,3px) rotate(-2.5deg);}`,
    `${psych(2)} .igs-text{animation:igs-hp-slip 11s steps(1,end) infinite;}`,
    `${psych(2)}::after{background:#111;animation:igs-hp-flicker 9s steps(1,end) infinite;}`,
    // 3 崩溃：黑底红白字，名牌错位，可爱装饰没了，整张卡里不断有眼睛往上浮。
    `${psych(3)}{filter:none;background:${grain(0.2)},rgba(11,11,13,.84);border-color:transparent;border-radius:4px 24px 0 18px;box-shadow:0 12px 30px rgba(0,0,0,.45);}`,
    scalePx(`${psych(3)}::before{${decoLayer(3)}}`),
    // 3 档名牌：爱心换成白眼，背后错开两层套印残影，名字红青色散；每隔几秒被横向撕成上下两半各自错位一下。
    scalePx(`${psych(3)} .igs-speaker{padding:0 22px 0 46px;background:${EYE_ICON} left 18px center/20px 14px no-repeat,${BLOOD};box-shadow:-7px 5px 0 rgba(179,22,27,.38),9px -4px 0 rgba(236,232,232,.12);text-shadow:2px 0 rgba(0,220,255,.45),-2px 0 rgba(255,30,60,.7);}`),
    `${psych(3)} .igs-speaker{color:#f2f2f2 !important;transform:translate(-8px,6px) skewX(-10deg);animation:igs-hp-tag-tear 3.8s steps(1,end) infinite;}`,
    '@keyframes igs-hp-tag-tear{0%,84%{transform:translate(-8px,6px) skewX(-10deg);clip-path:none;}85%{transform:translate(-1px,6px) skewX(-10deg);clip-path:inset(0 0 52% 0);}87%{transform:translate(-16px,6px) skewX(-14deg);clip-path:inset(48% 0 0 0);}89%{transform:translate(-5px,4px) skewX(-6deg);clip-path:inset(20% 0 30% 0);}91%,100%{transform:translate(-8px,6px) skewX(-10deg);clip-path:none;}}',
    `${psych(3)} .igs-text{animation:igs-hp-slip-hard 4.5s steps(1,end) infinite;}`,
    `${psych(3)} .igs-text,${psych(3)} .igs-text *{color:#ece8e8 !important;text-shadow:0 0 6px #0b0b0d,0 1px 2px #000;}`,
    // 描边只留顶边，两侧自上而下渐隐，底边不描。
    scalePx(`${psych(3)}::after{inset:-3px;opacity:1;border:2px solid ${BLOOD};border-bottom:0;-webkit-mask:linear-gradient(#000 20%,transparent 85%);mask:linear-gradient(#000 20%,transparent 85%);}`),
    scalePx(`${psych(3)}{padding-right:240px;}`),
    // 侧边纹样上浮按 1px 一步走（约每秒 14 次重绘），不再满帧重绘。
    `@keyframes igs-hp-rise{to{background-position:0 -${PACK[1]}px;}}`,
    '@keyframes igs-hp-slip{0%,93%{transform:none;text-shadow:none;}93.4%{transform:translateX(3px);text-shadow:-2px 0 rgba(200,30,40,.55),2px 0 rgba(30,140,170,.45);}94.4%{transform:translateX(-2px) skewX(-4deg);}95.2%,100%{transform:none;text-shadow:none;}}',
    '@keyframes igs-hp-slip-hard{0%{transform:translateX(-6px);text-shadow:none;}70%{transform:translate(4px,1px) skewX(-6deg);text-shadow:-3px 0 rgba(220,20,30,.8),3px 0 rgba(20,160,190,.6);}76%{transform:translateX(-10px);}82%,100%{transform:translateX(-6px);text-shadow:none;}}',
    '@keyframes igs-hp-flicker{0%,88%{opacity:0;}88.6%{opacity:.18;}89.2%{opacity:0;}90%{opacity:.1;}90.6%,100%{opacity:0;}}',
    ...motionGuards(psychScope, [' .igs-text', ' .igs-speaker', '::before', '::after']),
    ...[1, 2, 3].map((n) => `${psych(n).replace('#igs-overlay', '#igs-overlay[data-igs-paused]')}::before{${decoImages(n, false)}}`),
    `@media (prefers-reduced-motion: reduce){${[1, 2, 3].map((n) => `${psych(n)}::before{${decoImages(n, false)}}`).join('')}}`,
    `@media (max-width:640px){${scalePx(`${psychScope},${psychScope}[data-igs-has-speaker="1"]{padding-left:24px;padding-right:22px;}${psychScope} .igs-speaker{left:16px;max-width:calc(100% - 32px);}${LEVELS.map((n) => `${psych(n)}::before{background-size:${n === 3 ? `${PACK[0]}px ${PACK[1]}px` : '96px 59px,52px 21px'};}`).join('')}${psych(3)}{padding-right:22px;}${psych(3)}::before{width:240px;background-size:240px 265px;}`)}}`,
].join('\n');

const psychChoice = `${psychOverlay} .igs-option-bubble`;
const psychChoiceAt = (level) => `${overlayAtLevel(DIALOG_SKIN_HORROR_PSYCH, level)} .igs-option-bubble`;
export const PSYCH_CHOICE_STYLE = [
    `${psychChoice}{box-sizing:border-box;min-height:44px;padding:10px 46px;border:0;border-radius:999px;background:${CREAM};box-shadow:inset 0 0 0 2.5px ${PINK},0 4px 0 rgba(224,119,157,.25);color:${PLUM};letter-spacing:.08em;text-shadow:none;transition:background .15s,color .15s;}`,
    `${psychChoice}::before{content:"";position:absolute;left:20px;top:50%;width:14px;height:12px;margin-top:-6px;background:#fff;-webkit-mask:${HORROR_HEART_MASK} center/contain no-repeat;mask:${HORROR_HEART_MASK} center/contain no-repeat;opacity:0;transform:scale(.5);transition:opacity .15s,transform .2s;}`,
    `${psychChoice}:hover{background:${PINK};color:#fff;}`,
    `${psychChoice}:hover::before{opacity:1;transform:scale(1);}`,
    `${psychChoice}:active{transform:translateY(1px);}`,
    `${psychChoiceAt(2)}{filter:saturate(.3);border-radius:999px 4px 999px 999px;}`,
    `${psychChoiceAt(3)}{background:rgba(11,11,13,.86);box-shadow:inset 0 0 0 1.5px #000,0 0 0 1px rgba(0,0,0,.6);border-radius:2px;color:#ece8e8;}`,
    `${psychChoiceAt(3)}::before{-webkit-mask-image:${HORROR_EYE_MASK};mask-image:${HORROR_EYE_MASK};width:16px;height:16px;margin-top:-8px;background:${BLOOD};}`,
    `${psychChoiceAt(3)}:hover{background:${BLOOD};color:#fff;}`,
    `${psychChoiceAt(3)}:hover::before{background:#fff;}`,
].join('\n');

const psychPanel = (alpha) => `background:rgba(255,250,252,${alpha});border:0;border-radius:${s(14)};box-shadow:inset 0 0 0 ${s(2)} ${PINK},0 ${s(3)} 0 rgba(224,119,157,.22);`;
export const PSYCH_HUD_THEME = Object.freeze({
    neutral: '#c9b3bf',
    panel: psychPanel('.95'),
    toast: `${psychPanel('.96')}color:${PLUM};text-shadow:none;`,
    ink: PLUM,
    emotion: `padding:0 ${s(12)};border:0;border-radius:999px;background:${PINK_DEEP};box-shadow:0 0 0 ${s(2)} ${CREAM};color:#fff;letter-spacing:.1em;text-shadow:none;`,
    avatar: `filter:${ring(CREAM, 2)} ${ring(PINK, 1.5)};`,
    badge: `content:"";position:absolute;right:${s(-3)};bottom:${s(-3)};width:${s(11)};height:${s(10)};background:${PINK_DEEP};-webkit-mask:${HORROR_HEART_MASK} center/contain no-repeat;mask:${HORROR_HEART_MASK} center/contain no-repeat;`,
    placeholder: `background:linear-gradient(180deg,${CREAM},#f3e3f6);color:${PINK_DEEP};`,
    placeholderSvg: `fill:none;stroke:${PINK_DEEP};stroke-width:1.3;`,
    track: `height:${s(6)};border:0;border-radius:999px;background:rgba(199,180,240,.3);`,
    fill: `background:color-mix(in srgb,var(--igs-hud-fill-color) 50%,${PINK}) !important;border-radius:999px;`,
    value: 'font-weight:400;',
});
