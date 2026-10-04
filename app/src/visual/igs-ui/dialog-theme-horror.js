import { buildDialogFrameCss, scalePx } from './dialog-skin-frame.js';

// 两款恐怖皮肤都随 overlay 上的 data-igs-dread（0 平静 / 1 不安 / 2 危险 / 3 爆发，见 horror-dread.js）升级，
// 平静档要耐看、克制，最高档做到最极端；档位只靠 CSS 读取，升档的一次性动画用 transform/opacity。
export const DIALOG_SKIN_HORROR_GORE = 'horror-gore';
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

// ── 血色噩梦：波普血浆 ─────────────────────────────────────
// 平面设计的血：只有红、黑、骨白三色，网点代替质感，喷溅是几何色块，名牌是斜切的红块。贴边半透明通栏。
// 0 平静：黑通栏 + 顶边一道细红线；1 不安：几颗短血滴、底部淡红网点；2 危险：血滴拉长、名牌下炸开喷溅、网点变浓；
// 3 爆发：半透明的暗红灌满整条（画框不能抢画面，仍透出舞台），顶边换黑色血帘，入档时整条震一下。升档时血帘从顶边「倒」下来。
const RED = '#c4101c';
const RED_DEEP = '#6d0611';
const SHINE = '#ffd9d6';
const BLACK = '#0a0a0a';
const BONE = '#f3ece4';
const CURTAIN_W = 1600;

// 固定种子的伪随机，保证每次生成的血帘一致；1600px 一段，常见屏宽内不重复。
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const r1 = (n) => +n.toFixed(1);
// 血面下沿是三组整数周期的正弦叠加（首尾相接、可平铺），起伏是大波浪；
// 血舌更容易从波谷里垂下来，宽窄长短差得很开，越宽的末端越鼓，根部用弧线和血面连成一片。
// 宽血舌左侧一道平涂高光（波普的画法，不是写实反光），部分血舌下方挂着一颗刚脱落的血珠。
// real：写实一点的画法——颈部收得更细、多几道细血丝、末端血珠带一点高光，平涂高光条换成很淡的反光。
const curtainShapes = ({ seed, band, wave, maxLen, height, count, width, real = false }) => {
    const rand = seeded(seed);
    const waves = [2, 5, 11].map((k, i) => ({ k, a: wave * [1, 0.5, 0.22][i], p: rand() * Math.PI * 2 }));
    const edge = (x) => band + waves.reduce((sum, { k, a, p }) => sum + a * Math.sin((x / CURTAIN_W) * Math.PI * 2 * k + p), 0);
    let face = `M0 0H${CURTAIN_W}`;
    for (let x = CURTAIN_W; x >= 0; x -= 8) face += `L${x} ${r1(edge(x))}`;
    let body = `<path d="${face}Z"/>`;
    let drops = '';
    let shines = '';
    let glints = '';
    const trickles = real ? Math.round(count * 0.7) : 0;
    for (let i = 0; i < count + trickles; i++) {
        const thin = i >= count;
        const x = 24 + rand() * (CURTAIN_W - 48);
        const base = edge(x);
        const trough = Math.min(1, Math.max(0, (base - band + wave * 1.4) / (wave * 2.8)));
        const w = thin ? 0.7 + rand() * 1.3 : width[0] + rand() ** 2.2 * (width[1] - width[0]);
        const l = thin
            ? base + 14 + rand() * (maxLen - base - 14)
            : base + w * 2 + (0.2 + 0.8 * trough) * rand() ** 1.4 * (maxLen - base - w * 2);
        const bulb = thin ? w * 1.5 : w * (0.8 + Math.min(0.5, w / 30));
        const neck = w * (real ? 0.42 + rand() * 0.2 : 0.62);
        body += `<path d="M${r1(x - w - 6)} ${r1(base - 3)}Q${r1(x - w)} ${r1(base - 1)} ${r1(x - w)} ${r1(base + 6)}`
            + `C${r1(x - w)} ${r1(base + (l - base) * 0.55)} ${r1(x - neck)} ${r1(l - bulb * 2)} ${r1(x - bulb)} ${r1(l - bulb)}`
            + `A${r1(bulb)} ${r1(bulb)} 0 1 0 ${r1(x + bulb)} ${r1(l - bulb)}`
            + `C${r1(x + neck)} ${r1(l - bulb * 2)} ${r1(x + w)} ${r1(base + (l - base) * 0.55)} ${r1(x + w)} ${r1(base + 6)}`
            + `Q${r1(x + w)} ${r1(base - 1)} ${r1(x + w + 6)} ${r1(base - 3)}Z"/>`;
        if (w >= 6 && l - base > 18) {
            shines += `<path d="M${r1(x - w * 0.5)} ${r1(base + 6)}V${r1(l - bulb * 1.3)}" stroke-width="${r1(Math.max(real ? 0.8 : 1.2, w * (real ? 0.1 : 0.2)))}"/>`;
        }
        if (real && !thin && bulb > 3) {
            glints += `<ellipse cx="${r1(x - bulb * 0.35)}" cy="${r1(l - bulb * 1.25)}" rx="${r1(bulb * 0.22)}" ry="${r1(bulb * 0.34)}" transform="rotate(-20 ${r1(x - bulb * 0.35)} ${r1(l - bulb * 1.25)})"/>`;
        }
        const drop = bulb * (0.45 + rand() * 0.25);
        const dropY = l + 3 + drop + rand() * 7;
        if (rand() < 0.3 && dropY + drop * 1.4 < height - 1) {
            drops += `<path d="M${r1(x)} ${r1(dropY - drop * 1.5)}C${r1(x + drop * 0.4)} ${r1(dropY - drop * 0.6)} ${r1(x + drop)} ${r1(dropY - drop * 0.2)} ${r1(x + drop)} ${r1(dropY + drop * 0.3)}A${r1(drop)} ${r1(drop)} 0 0 1 ${r1(x - drop)} ${r1(dropY + drop * 0.3)}C${r1(x - drop)} ${r1(dropY - drop * 0.2)} ${r1(x - drop * 0.4)} ${r1(dropY - drop * 0.6)} ${r1(x)} ${r1(dropY - drop * 1.5)}Z"/>`;
        }
    }
    return { body, drops, shines, glints };
};
// 前后两层：后层更暗、更长、错开种子，从前层的缝隙里露出来，血看起来有厚度。
// real 时：前层用自上而下由深转亮的渐变（厚处暗、淌薄处透亮），整层叠一道轻微的位移扰动让边缘不那么矢量。
const curtain = ({ color, deep, shine, real = false, ...opts }) => {
    const back = deep ? curtainShapes({ ...opts, real, seed: opts.seed + 101, band: opts.band + 3, maxLen: Math.min(opts.height - 2, opts.maxLen * 1.18), count: Math.round(opts.count * 0.7) }) : null;
    const front = curtainShapes({ ...opts, real });
    const h = opts.height;
    const defs = real
        ? `<defs><linearGradient id="b" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${h}"><stop offset="0" stop-color="#4e0410"/><stop offset="${r1(opts.band / h)}" stop-color="#7d0814"/><stop offset=".62" stop-color="${color}"/><stop offset="1" stop-color="#dc2430"/></linearGradient>`
            + '<filter id="r" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".03 .11" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="3"/></filter></defs>'
        : '';
    const frontFill = real ? 'url(#b)' : color;
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CURTAIN_W} ${h}">${defs}<g${real ? ' filter="url(#r)"' : ''}>`
        + (back ? `<g fill="${deep}">${back.body}${back.drops}</g>` : '')
        + `<g fill="${frontFill}">${front.body}${front.drops}</g>`
        + (shine ? `<g fill="none" stroke="${shine}" stroke-linecap="round" opacity="${real ? '.32' : '.7'}">${front.shines}</g>` : '')
        + (real ? `<g fill="#fff" opacity=".42">${front.glints}</g>` : '')
        + '</g></svg>');
};
const CURTAIN_SHORT = curtain({ seed: 11, band: 7, wave: 3.5, maxLen: 34, height: 42, color: RED, deep: RED_DEEP, count: 18, width: [2.5, 8] });
// 2 档的血帘偏写实一点（用户觉得平涂的太卡通），1、3 档仍是波普平涂。
const CURTAIN_LONG = curtain({ seed: 23, band: 22, wave: 13, maxLen: 104, height: 122, color: RED, deep: RED_DEEP, shine: SHINE, real: true, count: 34, width: [2.5, 18] });
const CURTAIN_BLACK = curtain({ seed: 37, band: 14, wave: 8, maxLen: 50, height: 60, color: BLACK, deep: '#4a0207', count: 24, width: [2.5, 12] });
// 喷溅：一团边缘起伏的血（平滑曲线，不是星形），向外甩出几道收尖的血丝和一圈顺着飞溅方向拉长的血点，越远越小。
const splat = (seed, color) => {
    const rand = seeded(seed);
    const cx = 100;
    const cy = 56;
    const n = 18;
    const pts = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.25;
        const r = 26 * (0.78 + rand() * 0.5);
        return [cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 0.8];
    });
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    let blob = `M${mid(pts[n - 1], pts[0]).map(r1).join(' ')}`;
    pts.forEach((p, i) => { blob += `Q${p.map(r1).join(' ')} ${mid(p, pts[(i + 1) % n]).map(r1).join(' ')}`; });
    const bits = [];
    for (let i = 0; i < 5; i++) {
        const a = rand() * Math.PI * 2;
        const len = 46 + rand() * 30;
        const w = 2.5 + rand() * 2.5;
        const nx = -Math.sin(a);
        const ny = Math.cos(a);
        const bx = cx + Math.cos(a) * 24;
        const by = cy + Math.sin(a) * 16;
        bits.push(`<path d="M${r1(bx + nx * w)} ${r1(by + ny * w)}L${r1(cx + Math.cos(a) * len * 1.2)} ${r1(cy + Math.sin(a) * len * 0.62)}L${r1(bx - nx * w)} ${r1(by - ny * w)}Z"/>`);
    }
    for (let i = 0; i < 22; i++) {
        const a = rand() * Math.PI * 2;
        const dist = 34 + rand() ** 1.2 * 62;
        const size = Math.max(1, 6.5 * (1 - (dist - 34) / 76) * (0.45 + rand() * 0.7));
        const x = cx + Math.cos(a) * dist * 1.1;
        const y = cy + Math.sin(a) * dist * 0.55;
        bits.push(`<ellipse cx="${r1(x)}" cy="${r1(y)}" rx="${r1(size * (1.3 + rand() * 0.9))}" ry="${r1(size)}" transform="rotate(${r1((Math.atan2(Math.sin(a) * 0.55, Math.cos(a) * 1.1) * 180) / Math.PI)} ${r1(x)} ${r1(y)})"/>`);
    }
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 112"><g fill="${color}"><path d="${blob}Z"/>${bits.join('')}</g></svg>`);
};
// 喷溅压半透明，只做画框边角的点缀。
const SPLAT_RED = splat(5, 'rgba(196,16,28,.55)');
const SPLAT_RED_B = splat(19, 'rgba(196,16,28,.5)');
const HALFTONE = (color, dot) => `radial-gradient(circle,${color} 0 ${dot}px,transparent ${dot + 0.5}px) 0 0/8px 8px`;
const DROP_PATH = 'M12 2.5C15.5 8 18.5 11.6 18.5 15.4A6.5 6.5 0 0 1 5.5 15.4C5.5 11.6 8.5 8 12 2.5Z';
export const HORROR_DROP_MASK = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${DROP_PATH}"/></svg>`);

const goreOverlay = overlayOf(DIALOG_SKIN_HORROR_GORE);
const goreScope = scopeOf(DIALOG_SKIN_HORROR_GORE);
const gore = (level) => atLevel(DIALOG_SKIN_HORROR_GORE, level);
const SLANT = 'clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%);';
// 血帘（::before）与网点（::after）都放在负 z-index 里（isolation 托住），永远压在正文下面。
const pour = (name, duration) => `animation:${name} ${duration}s cubic-bezier(.3,.7,.4,1) backwards;`;

export const GORE_DIALOG_STYLE = [
    buildDialogFrameCss(DIALOG_SKIN_HORROR_GORE, {
        height: 210,
        text: { top: 58, speakerTop: 62, right: 120, bottom: 30, left: 110 },
        rise: 20,
        flush: true,
        frameCss: 'isolation:isolate;background:rgba(10,10,10,.86);border:0;border-radius:0;box-shadow:0 -18px 36px -12px rgba(0,0,0,.55);-webkit-backdrop-filter:none;backdrop-filter:none;',
        speakerCss: `left:84px;top:-21px;width:max-content;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 140px);height:42px;line-height:42px;padding:0 30px 0 26px;background:${RED};border:0;border-radius:0;${SLANT}font-size:24px;font-weight:700;letter-spacing:.12em;text-shadow:none;transition:background-color .4s;`,
        textCss: 'letter-spacing:.06em;text-shadow:0 1px 2px rgba(0,0,0,.9);',
    }),
    scalePx(`${goreScope}::before{content:"";position:absolute;left:0;right:0;top:0;height:3px;z-index:-1;pointer-events:none;transform-origin:50% 0;background:${RED};}`),
    `${goreScope}::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:0;transition:opacity .6s;}`,
    // 1 不安
    scalePx(`${gore(1)}::before{height:42px;background:${CURTAIN_SHORT} 0 0/${CURTAIN_W}px 42px repeat-x;opacity:.72;${pour('igs-hg-pour1', 0.8)}}`),
    `${gore(1)}::after{background:${HALFTONE('rgba(209,18,27,.4)', 1.1)};-webkit-mask:linear-gradient(transparent 60%,#000);mask:linear-gradient(transparent 60%,#000);opacity:1;}`,
    // 2 危险
    scalePx(`${gore(2)}{background:${SPLAT_RED} left -18px top -8px/160px 88px no-repeat,${SPLAT_RED_B} right 30px bottom -24px/170px 95px no-repeat,rgba(10,10,10,.88);box-shadow:inset 0 -2px 0 rgba(196,16,28,.6),0 -18px 36px -12px rgba(90,0,0,.45);}`),
    scalePx(`${gore(2)}::before{height:122px;background:${CURTAIN_LONG} 0 0/${CURTAIN_W}px 122px repeat-x;opacity:.66;${pour('igs-hg-pour2', 0.9)}}`),
    `${gore(2)}::after{background:${HALFTONE(RED, 1.6)};-webkit-mask:linear-gradient(transparent 40%,#000);mask:linear-gradient(transparent 40%,#000);opacity:.42;}`,
    // 3 爆发：整条灌红（::before 从顶边铺满），顶边换成黑色血帘，字与名牌反成黑色。
    `${gore(3)}{background:rgba(10,10,10,.88);box-shadow:0 -18px 40px -10px rgba(140,10,18,.45);animation:igs-hg-shake .55s cubic-bezier(.36,.07,.19,.97) .5s backwards;}`,
    scalePx(`${gore(3)}::before{height:100%;background:${CURTAIN_BLACK} 0 0/${CURTAIN_W}px 60px repeat-x,linear-gradient(rgba(130,10,18,.6),rgba(80,6,12,.62) 55%,rgba(30,3,6,.8));${pour('igs-hg-pour3', 0.6)}}`),
    `${gore(3)}::after{background:${HALFTONE('rgba(10,10,10,.45)', 1.3)};-webkit-mask:linear-gradient(transparent 55%,#000);mask:linear-gradient(transparent 55%,#000);opacity:1;}`,
    `${gore(3)} .igs-text{text-shadow:0 1px 3px rgba(0,0,0,.85);}`,
    // 名牌：2 档字带黑色套印错位、随心跳轻轻一缩；3 档翻成黑块，骨白字压一层错开的红色套印，心跳变成急促的双跳。
    `${gore(2)} .igs-speaker{text-shadow:3px 3px 0 ${BLACK};animation:igs-hg-beat 2.4s ease-out infinite;}`,
    `${gore(3)} .igs-speaker{background:${BLACK};color:${BONE} !important;text-shadow:4px 3px 0 ${RED};animation:igs-hg-beat-hard 1.1s ease-out infinite;}`,
    '@keyframes igs-hg-beat{0%,100%{transform:none;}8%{transform:scale(1.06);}18%{transform:none;}}',
    '@keyframes igs-hg-beat-hard{0%,100%{transform:rotate(-2deg);}7%{transform:rotate(-2deg) scale(1.14);}16%{transform:rotate(-2deg) scale(.98);}24%{transform:rotate(-2deg) scale(1.1);}36%{transform:rotate(-2deg);}}',
    '@keyframes igs-hg-pour1{from{transform:scaleY(.2);}}',
    '@keyframes igs-hg-pour2{from{transform:scaleY(.12);}}',
    '@keyframes igs-hg-pour3{from{transform:scaleY(0);}}',
    '@keyframes igs-hg-shake{0%{transform:translate(0,0);}15%{transform:translate(-6px,3px);}30%{transform:translate(5px,-2px);}45%{transform:translate(-4px,1px);}60%{transform:translate(3px,0);}80%{transform:translate(-1px,0);}100%{transform:none;}}',
    ...motionGuards(goreScope, ['', '::before', ' .igs-speaker']),
    `@media (max-width:640px){${scalePx(`${goreScope},${goreScope}[data-igs-has-speaker="1"]{padding-left:28px;padding-right:24px;}${goreScope} .igs-speaker{left:16px;max-width:calc(100% - 32px);}${gore(2)}{background:${SPLAT_RED_B} right 10px bottom -20px/120px 67px no-repeat,rgba(10,10,10,.88);}`)}}`,
].join('\n');

const goreChoice = `${goreOverlay} .igs-option-bubble`;
const goreChoiceAt = (level) => `${overlayAtLevel(DIALOG_SKIN_HORROR_GORE, level)} .igs-option-bubble`;
export const GORE_CHOICE_STYLE = [
    `${goreChoice}{box-sizing:border-box;min-height:44px;padding:10px 46px;border:0;border-radius:0;background:linear-gradient(${RED},${RED}) 0 0/6px 100% no-repeat,rgba(10,10,10,.86);box-shadow:none;color:${BONE};font-weight:700;letter-spacing:.12em;text-shadow:none;transition:background-size .18s,color .18s;}`,
    `${goreChoice}:hover{background:linear-gradient(${RED},${RED}) 0 0/100% 100% no-repeat,rgba(10,10,10,.86);color:#fff;}`,
    `${goreChoice}:active{transform:translateY(1px);}`,
    `${goreChoiceAt(3)}{background:linear-gradient(${BLACK},${BLACK}) 0 0/6px 100% no-repeat,rgba(110,8,16,.8);box-shadow:inset 0 0 0 1.5px ${BLACK};color:${BONE};}`,
    `${goreChoiceAt(3)}:hover{background:linear-gradient(${BLACK},${BLACK}) 0 0/100% 100% no-repeat,rgba(110,8,16,.8);color:#fff;}`,
].join('\n');

const gorePanel = (alpha) => `background:rgba(10,10,10,${alpha});border:0;border-radius:0;box-shadow:inset ${s(3)} 0 0 ${RED};`;
export const GORE_HUD_THEME = Object.freeze({
    neutral: '#8a8280',
    panel: gorePanel('.86'),
    toast: `${gorePanel('.9')}color:${BONE};text-shadow:none;`,
    ink: BONE,
    emotion: `padding:0 ${s(12)};border:0;border-radius:0;background:${RED};color:${BONE};font-weight:700;letter-spacing:.12em;text-shadow:none;${SLANT}`,
    avatar: `filter:${ring(BLACK, 2)} ${ring(RED, 1.5)};`,
    badge: `content:"";position:absolute;right:${s(-2)};bottom:${s(-3)};width:${s(8)};height:${s(10)};background:${RED};-webkit-mask:${HORROR_DROP_MASK} center/contain no-repeat;mask:${HORROR_DROP_MASK} center/contain no-repeat;`,
    placeholder: `background:${BLACK};color:${RED};`,
    placeholderSvg: `fill:none;stroke:${RED};stroke-width:1.4;`,
    track: `height:${s(4)};border:0;border-radius:0;background:rgba(209,18,27,.22);`,
    fill: `background:${RED} !important;border-radius:0;`,
    value: 'font-weight:700;',
});

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
const decoLayer = (variant) => `${decoImages(variant)}background-repeat:no-repeat;${variant === 3 ? `background-repeat:repeat-y;inset:0 0 0 auto;width:${PACK[0]}px;background-position:0 0;background-size:${PACK[0]}px ${PACK[1]}px;-webkit-mask:radial-gradient(ellipse 100% 120% at 100% 100%,#000 40%,transparent 95%);mask:radial-gradient(ellipse 100% 120% at 100% 100%,#000 40%,transparent 95%);animation:igs-hp-rise 30s linear infinite;` : 'background-position:right 14px bottom 8px,right 26px top 10px;background-size:150px 92px,80px 32px;'}`;
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
