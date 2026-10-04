import { buildDialogFrameCss, scalePx } from './dialog-skin-frame.js';

export const DIALOG_SKIN_FAIRY_TALE = 'fairy-tale';

// 童话小镇：春日田园野餐。对话框是一张悬浮的圆角卡片，外圈一道鼠尾草绿格子布边，像铺开的野餐布；
// 奶油纸内衬沿边绕一圈莓粉圆点线，底部两层起伏的草坡，左下几颗草莓、右下一只野餐篮和几枝小花。
// 姓名是骑在顶边上的圆胶囊，前面一颗小草莓。装饰全用实色，正文区保持素面。
const SAGE = '122,138,82';
const MOSS = '#5e6b3c';
const INK = '#4a4034';
const LAMP = '#d9a441';
const BERRY = '#dc6a5c';
const BLUSH = '#e9a597';
const CELL = 11;
const RIM = 11;

// 纸色随场景时段（overlay 的 data-igs-scene-time）变化：晨微粉、昏转杏、夜里压暗成灯下的旧纸；墨字不翻色。
const PAPER_BY_TIME = Object.freeze({ dawn: '250,240,234', dusk: '249,234,212', night: '192,190,176', midnight: '160,160,150' });
const PAPER_DAY = '250,246,234';
const paper = (alpha) => `rgba(var(--ft-paper,${PAPER_DAY}),${alpha})`;
export const fairyPaper = paper;
const overlayScope = `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_FAIRY_TALE}"]`;
const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_FAIRY_TALE}"]`;

const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const STEM = '#7a8a52';
// 纸纹：一张小噪点图平铺，只栅格化一次。
const GRAIN = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .38 0 0 0 0 .3 0 0 0 0 .2 .2 0 0 0 -.05"/></filter><rect width="120" height="120" filter="url(#n)"/></svg>`);
const SPARKLE = 'M12 1.5C12.7 8.1 15.9 11.3 22.5 12C15.9 12.7 12.7 15.9 12 22.5C11.3 15.9 8.1 12.7 1.5 12C8.1 11.3 11.3 8.1 12 1.5Z';
export const FAIRY_SPARKLE_MASK = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${SPARKLE}"/></svg>`);

// 草坡：两层波浪山丘横向无缝平铺，首尾同高。
const HILLS = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 28"><path fill="#e2e8c8" d="M0 14Q40 4 80 14T160 14V28H0Z"/><path fill="#cbd6a8" d="M0 22Q40 14 80 22T160 22V28H0Z"/></svg>`);
const strawberry = ([x, y, a, k]) => `<g transform="translate(${x} ${y}) rotate(${a}) scale(${k})"><path fill="${BERRY}" d="M0-10C7-10 10-5 8 2C6 8 2 11 0 12C-2 11-6 8-8 2C-10-5-7-10 0-10Z"/><g fill="#fbe3a8">${[[-4, -4], [1, -5], [5, -2], [-3, 2], [2, 2], [0, 7]].map(([sx, sy]) => `<ellipse cx="${sx}" cy="${sy}" rx=".8" ry="1.2"/>`).join('')}</g><path fill="#6f8a4a" d="M-7-10L-2-9L0-14L2-9L7-10L3-6.5L-3-6.5Z"/></g>`;
const blossom = ([x, y, r, petal]) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map((a) => `<circle transform="rotate(${a})" cy="${-r}" r="${r}" fill="${petal}"/>`).join('')}<circle r="${r * 0.7}" fill="${LAMP}"/></g>`;
// 花杆笔直，靠高低错落、杆上不同高度的叶片与空中的蝴蝶、花瓣打散，不排成等距等高的平行线。
const stem = ([x, y, side, at]) => `<path d="M${x} 84V${y}" stroke="${STEM}" stroke-width="1.4" stroke-linecap="round"/><path transform="translate(${x} ${84 - (84 - y) * at}) scale(${side} 1) rotate(28) scale(.68)" fill="#8fa06a" d="M0 0C-8-4-11-13-9-18C-2-13 0-7 0 0Z"/>`;
const daisy = ([x, y, r, side, at]) => `${stem([x, y, side, at])}<g transform="translate(${x} ${y})">${[0, 45, 90, 135, 180, 225, 270, 315]
    .map((a) => `<ellipse transform="rotate(${a})" cy="${-r * 0.85}" rx="${r * 0.42}" ry="${r * 0.8}" fill="#fffaf0" stroke="#d6ccb2" stroke-width=".6"/>`).join('')}<circle r="${r * 0.42}" fill="${LAMP}"/></g>`;
const tulip = ([x, y, side, at]) => `${stem([x, y, side, at])}<path transform="translate(${x} ${y})" fill="${BLUSH}" d="M-5 0Q-6.5-9-3.5-11L0-6.5L3.5-11Q6.5-9 5 0Q0 4-5 0Z"/>`;
// 空中的小蝴蝶与两片飘落的花瓣。
const BUTTERFLY = `<g transform="translate(84 22) rotate(-18)"><ellipse cx="-4" cy="-2" rx="4" ry="3.2" fill="${BLUSH}"/><ellipse cx="4" cy="-2" rx="4" ry="3.2" fill="${BLUSH}"/><ellipse cx="-3" cy="3" rx="2.6" ry="2.2" fill="#fffaf0"/><ellipse cx="3" cy="3" rx="2.6" ry="2.2" fill="#fffaf0"/><path d="M0-4V5" stroke="#6b5a44" stroke-width="1.2" stroke-linecap="round"/></g>`;
const PETALS = `<ellipse transform="translate(30 24) rotate(30)" rx="2.4" ry="1.4" fill="${BLUSH}"/><ellipse transform="translate(192 30) rotate(-25)" rx="2.2" ry="1.3" fill="#fffaf0" stroke="#d6ccb2" stroke-width=".5"/>`;
const sprout = ([x, flip]) => `<path transform="translate(${x} 84) scale(${flip} 1)" fill="#8fa06a" d="M0 0C-8-4-11-13-9-18C-2-13 0-7 0 0Z"/>`;
// 左下：两颗草莓、一片叶与一朵草莓花。
const BERRIES = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 40"><path fill="#8fa06a" d="M30 38C24 30 26 20 34 16C38 24 36 32 30 38Z"/>${strawberry([16, 26, -14, 1])}${strawberry([44, 28, 12, 0.85])}${blossom([64, 30, 3.4, '#fffaf0'])}</svg>`);
// 右下：藤编篮探出一角格子餐布，两侧几枝雏菊与郁金香。
const PICNIC = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 84"><defs><pattern id="c" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#fbf6ea"/><rect width="3" height="6" fill="#b4c095"/><rect width="6" height="3" fill="#b4c095"/><rect width="3" height="3" fill="#8fa06a"/></pattern></defs>`
    + `${[[30, 0.9], [62, -1], [178, 1]].map(sprout).join('')}${tulip([18, 54, -1, .35])}${daisy([36, 36, 6, 1, .55])}${daisy([50, 62, 4.6, -1, .3])}${daisy([166, 46, 5.5, -1, .42])}${tulip([186, 62, 1, .3])}${BUTTERFLY}${PETALS}`
    + `<path d="M98 52Q125 12 152 52" fill="none" stroke="#9b7448" stroke-width="3.2" stroke-linecap="round"/>`
    + `<path fill="url(#c)" stroke="#8fa06a" stroke-width=".6" d="M100 52C104 40 118 37 128 45C135 38 147 41 150 52Z"/>`
    + `<rect x="88" y="50" width="74" height="7" rx="3.5" fill="#a97e4f"/><path fill="#c39a68" d="M92 57H158L151 82H99Z"/>`
    + `<path fill="none" stroke="#9b7448" stroke-width="1.1" d="M95 65H155M97 73H153M108 57L106 82M125 57V82M142 57L144 82"/></svg>`);
const BERRY_ICON = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -15 24 28">${strawberry([0, 0, 0, 1])}</svg>`);

// 格子布边：横竖两组半透明条纹叠出交叉处的深格，铺满边框盒；内衬奶油纸只铺内边距盒，露出一圈布边。
const stripes = (deg) => `repeating-linear-gradient(${deg}deg,rgba(${SAGE},.3) 0 ${CELL / 2}px,transparent ${CELL / 2}px ${CELL}px)`;
const layers = (picnic, berries, hills) => `background-image:${PICNIC},${BERRIES},${HILLS},${GRAIN},linear-gradient(${paper(1)},${paper(1)}),${stripes(90)},${stripes(180)};`
    + 'background-origin:padding-box,padding-box,padding-box,padding-box,padding-box,border-box,border-box;'
    + 'background-clip:padding-box,padding-box,padding-box,padding-box,padding-box,border-box,border-box;'
    + 'background-repeat:no-repeat,no-repeat,repeat-x,repeat,no-repeat,repeat,repeat;'
    + `background-position:right 14px bottom 4px,left 16px bottom 4px,0 100%,0 0,0 0,0 0,0 0;background-size:${picnic},${berries},${hills},120px 120px,100% 100%,${CELL}px ${CELL}px,${CELL}px ${CELL}px;`;

export const FAIRY_DIALOG_STYLE = [
    ...Object.entries(PAPER_BY_TIME).map(([time, rgb]) => `${overlayScope}[data-igs-scene-time="${time}"]{--ft-paper:${rgb};}`),
    buildDialogFrameCss(DIALOG_SKIN_FAIRY_TALE, {
        height: 200,
        text: { top: 26, speakerTop: 46, right: 44, bottom: 36, left: 44 },
        rise: 14,
        frameCss: `background-color:${paper(1)};${layers('260px 109px', '124px 62px', '220px 40px')}border:${RIM}px solid transparent;border-radius:28px;box-shadow:0 0 0 1px rgba(${SAGE},.35),0 6px 18px rgba(60,50,30,.24);-webkit-backdrop-filter:none;backdrop-filter:none;`,
        // 圆胶囊压在顶边上，整个盖过内衬的圆点线（不与它相切）；草莓画在左内边距里，长名仍可省略号截断。
        speakerCss: `left:52px;top:-${RIM + 10}px;width:max-content;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 76px);height:44px;line-height:44px;padding:0 28px 0 50px;background:${paper(1)};border:0;border-radius:999px;box-shadow:inset 0 0 0 2.5px ${BLUSH},0 0 0 3px ${paper(1)},0 3px 8px rgba(60,50,30,.22);font-size:24px;font-weight:400;letter-spacing:.1em;text-shadow:none;`,
        textCss: `letter-spacing:.05em;`,
    }),
    // 内衬一圈莓粉圆点线（dotted 在 Chromium 画成圆点），沿圆角走。
    scalePx(`${scope}::before{content:"";position:absolute;inset:6px;border:3px dotted ${BLUSH};border-radius:17px;pointer-events:none;}`),
    scalePx(`${scope} .igs-speaker::before{content:"";position:absolute;left:17px;top:50%;width:22px;height:26px;margin-top:-14px;background:${BERRY_ICON} center/contain no-repeat;}`),
    // 窄屏：布边与留白收窄，两角小景同比缩小。
    `@media (max-width:640px){${scalePx(`${scope},${scope}[data-igs-has-speaker="1"]{padding-left:26px;padding-right:22px;${layers('160px 67px', '80px 40px', '150px 27px')}}${scope} .igs-speaker{left:12px;max-width:calc(100% - 24px);}`)}}`,
].join('\n');

// 选项：奶油纸胶囊、一圈极细的鼠尾草绿描边；悬停时纸面泛绿，左侧亮起一颗小星。
const choiceScope = `${overlayScope} .igs-option-bubble`;

export const FAIRY_CHOICE_STYLE = [
    `${choiceScope}{box-sizing:border-box;min-height:44px;padding:10px 44px;border:0;border-radius:999px;background:${paper(1)};box-shadow:inset 0 0 0 1px rgba(${SAGE},.38),0 2px 8px rgba(60,50,30,.12);color:${INK};letter-spacing:.1em;text-shadow:none;}`,
    `${choiceScope}::before{content:"";position:absolute;left:20px;top:50%;width:11px;height:11px;margin-top:-5.5px;background:${LAMP};-webkit-mask:${FAIRY_SPARKLE_MASK} center/contain no-repeat;mask:${FAIRY_SPARKLE_MASK} center/contain no-repeat;opacity:0;transform:scale(.6);transition:opacity .2s,transform .2s;}`,
    `${choiceScope}:hover{background:linear-gradient(rgba(${SAGE},.16),rgba(${SAGE},.16)),${paper('.95')};box-shadow:inset 0 0 0 1px rgba(${SAGE},.7),0 3px 10px rgba(60,50,30,.16);color:${MOSS};}`,
    `${choiceScope}:hover::before{opacity:1;transform:scale(1);}`,
    `${choiceScope}:active{transform:translateY(1px);}`,
].join('\n');

const s = (value) => `calc(${value}px * var(--igs-hud-scale,1))`;
const ring = (color, width) => `drop-shadow(${width}px 0 0 ${color}) drop-shadow(-${width}px 0 0 ${color}) drop-shadow(0 ${width}px 0 ${color}) drop-shadow(0 -${width}px 0 ${color})`;
const panel = (alpha) => `background:${paper(alpha)};border:0;border-radius:${s(12)};box-shadow:inset 0 0 0 1px rgba(${SAGE},.3),0 2px 10px rgba(60,50,30,.12);`;

// 状态栏零件：圆角纸卡、鼠尾草绿胶囊情绪签、头像右下一颗灯火色小圆点。
export const FAIRY_HUD_THEME = Object.freeze({
    neutral: '#a8a48f',
    panel: panel('.97'),
    toast: `${panel('.96')}color:${INK};text-shadow:none;`,
    ink: INK,
    emotion: `padding:0 ${s(12)};border:0;border-radius:999px;background:rgb(${SAGE});box-shadow:0 0 0 1.5px ${paper(1)};color:#fffaf0;letter-spacing:.12em;text-shadow:none;`,
    avatar: `filter:${ring(paper(1), 2)} ${ring(`rgba(${SAGE},.55)`, 1)};`,
    badge: `content:"";position:absolute;right:${s(-2)};bottom:${s(-2)};width:${s(9)};height:${s(9)};border-radius:50%;background:${LAMP};box-shadow:0 0 0 1.5px ${paper(1)};`,
    placeholder: 'background:linear-gradient(180deg,#f3eedd,#dfe5cc);color:#5e6b3c;',
    placeholderSvg: 'fill:none;stroke:#5e6b3c;stroke-width:1.3;',
    track: `height:${s(6)};border:0;border-radius:999px;background:rgba(${SAGE},.18);`,
    fill: `background:color-mix(in srgb,var(--igs-hud-fill-color) 60%,rgb(${SAGE})) !important;border-radius:999px;`,
    value: 'font-weight:400;',
});
