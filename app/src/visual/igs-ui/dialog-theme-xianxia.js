import { buildDialogFrameCss, scalePx, stroke } from './dialog-skin-frame.js';

export const DIALOG_SKIN_XIANXIA_INK = 'xianxia-ink';

// 仙侠水墨：焦墨夜读。对话框是画面底部沉下的一池墨——顶缘是撕开的泼墨边（不规则墨脊、一团焦墨、几笔飞白），
// 姓名落在墨池里一团洇开的墨晕上，左侧压一道朱砂落款竖条；正文区留白不铺纹样。
// 与青绿山水的区别不在设色而在结构：青绿是烟岚上升 + 一道横掠细线 + 右下远山；这里是墨池下沉 + 顶缘撕边 + 姓名朱砂竖条。
const INK_DAY = '26,29,32';
const IVORY_RGB = '243,236,221';
const IVORY = '#f3ecdd';
const QING_RGB = '150,182,190';
const ZHU_RGB = '178,58,42';
const ZHU = `rgb(${ZHU_RGB})`;
const SPEAKER_TOP = 34;
const TEXT_SPEAKER_TOP = 84;
const TEXT_TOP = 46;

// 墨色随场景时段变化（overlay 的 data-igs-scene-time）：晨是掺了宿墨的淡墨、昼是焦墨、昏泛褐、夜沉为冷墨、深夜近黑。
// 底色是暗的，正文一律走象牙白（见 dialog-theme-typography 的墨色配套），夜里只把墨再压沉、加一点冷调。
const INK_BY_TIME = Object.freeze({ dawn: '44,45,44', dusk: '40,35,31', night: '16,20,26', midnight: '9,12,17' });
const ink = (alpha) => `rgba(var(--xia-ink,${INK_DAY}),${alpha})`;
export const xianxiaInk = ink;
const overlayScope = `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_XIANXIA_INK}"]`;

// 云带：每条云线是一个实墨剪影——上边是云头轮廓，下边在框顶线处截断，直接落进框体墨池。
// 云体不伸进框内：实色云带的底边若停在框内，会和框体之间留一道横向分界线（2% 的 alpha 跳变肉眼可见）。
// 每条云线走两三个长弧云头（宽 100~160），云头之间明确凹口（宽 22~28、深 10~14）——
// 有凹口才是云，全是弧就成了山，弧太碎就成了梳齿。
// 坐标约定：viewBox 的 y = 页面 y + BAND_TOP。所以所有层的 mask-position 都是同一个 BAND_TOP
// （只负责把坐标系对齐），层高差一律烘焙进 SVG 自己的坐标里。
// 分层只靠五档浓度（1 → .8）与相位错开：云头互相叠进邻层，读起来是一片云而不是五条带。
// 云带压低：整片云只高出框顶 ~48px，贴着框顶的一线云，不再浮在对话框上方。
const BAND_TOP = 90;
const BAND_H = 200;
const FADE_IN = 40;                                   // 化没点在框顶以下 40px
const vy = (pageY) => Math.round(pageY + BAND_TOP);   // 页面 y → viewBox y
const cloudBand = ({ base, grade, heads, phase = 0, hold = false }) => {
    const b = vy(base);
    let x = -phase;                                    // 相位偏移：云头从屏幕外接着来，各层错开
    let d = `M${x} ${b}`;
    let top = b;
    for (const [bw, rise, nw, nd] of heads) {
        d += `q ${Math.round(bw / 2)} ${-rise * 2} ${bw} 0`;   // 长弧云头，起落同高
        d += `l ${nw} ${nd}`;                                    // 紧接一个凹口
        x += bw + nw;
        top = Math.min(top, b - rise);
    }
    const end = Math.max(x, 600);
    // 云体在框顶线（页面 y=0，即 viewBox y=BAND_TOP）处截断，不伸进框内——
    // 框顶 POOL 同为 alpha 1 实墨，云落进墨池零接缝；云带底边那条横线随之消失。
    d += `l ${end - x} 0L${end} ${BAND_TOP}L-200 ${BAND_TOP}Z`;
    const bottom = vy(FADE_IN);
    // hold：最下层不淡化——它要一路实心接到框体上，中间断一档就看得出接缝。
    const stops = hold
        ? `<stop offset='0' stop-color='#fff' stop-opacity='${grade}'/>`
        : `<stop offset='0' stop-color='#fff' stop-opacity='${grade}'/>`
            + `<stop offset='.2' stop-color='#fff' stop-opacity='${(grade * 0.94).toFixed(3)}'/>`
            + `<stop offset='.56' stop-color='#fff' stop-opacity='${(grade * 0.6).toFixed(3)}'/>`
            + `<stop offset='.82' stop-color='#fff' stop-opacity='${(grade * 0.22).toFixed(3)}'/>`
            + `<stop offset='1' stop-color='#fff' stop-opacity='0'/>`;
    return `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 480 ${BAND_H}' preserveAspectRatio='none'>`
        + `<defs><linearGradient id='g' gradientUnits='userSpaceOnUse' x1='0' y1='${Math.round(top)}' x2='0' y2='${bottom}'>`
        + stops
        + `</linearGradient></defs>`
        + `<path fill='url(#g)' d='${d}'/></svg>`,
    )}`;
};
// 墨分五色，由下到上：焦、浓、重、淡、清。越高的云越淡，叠在一起各占一档，中间调不跳。
// 云带是贴着框顶的一线云，不是浮在对话框上方的景色：整片云只高出框顶 ~48px，
// 弧度放宽（170~240）、升高压低（11~16）、凹口浅（3~5），读起来是平滑的云脊而不是一堆团子。
// 五层相位错开（24/110/190/64/150），这层的峰填进上层的谷。
const CLOUD_BANDS = [
    // 五层一律 hold（实墨剪影，不做纵向渐变化开）——云与云只靠透明度和轮廓叠加。
    // 焦墨·主云：贴框那一层，grade 1（全实），与全不透明的 POOL 是同一块墨，衔接处零接缝。
    { base: 3, grade: 1, hold: true, phase: 24, heads: [[238, 14, 34, 4], [196, 12, 30, 4], [224, 16, 36, 5], [180, 11, 30, 3]] },
    { base: -8, grade: .95, hold: true, phase: 110, heads: [[210, 13, 32, 4], [244, 15, 36, 5], [188, 11, 30, 4], [220, 14, 34, 4]] },
    { base: -16, grade: .9, hold: true, phase: 190, heads: [[228, 12, 34, 4], [184, 14, 30, 4], [240, 13, 36, 4], [196, 11, 32, 3]] },
    { base: -24, grade: .85, hold: true, phase: 64, heads: [[192, 12, 30, 4], [232, 13, 34, 4], [178, 11, 30, 3], [216, 12, 34, 4]] },
    { base: -32, grade: .8, hold: true, phase: 150, heads: [[218, 11, 32, 3], [186, 12, 30, 4], [236, 11, 34, 4], [190, 10, 30, 3]] },
];
// 云带层：顶到框顶之上 BAND_TOP px，层高与 viewBox 等高（不拉伸，1:1 对应）。
// 所有层共用同一个 mask-position —— 偏移已经把 viewBox 坐标系对齐了，层高差全在 SVG 坐标里。
const BAND_H_PX = BAND_H;
// 框：顶缘全实墨（alpha 1）与底层云无缝融合，向下缓缓化淡到底部 .84 透气——
// 顶部 1 是融合点不能松（否则 hold 云叠 .95 框体会在半截处出现横向分界）；
// 文字区保持 .9 以上压住象牙白正文，只有最底部放开到 .84 让画面透一口气。
const POOL = `linear-gradient(180deg,${ink('1')} 0,${ink('1')} 28%,${ink('.96')} 52%,${ink('.9')} 76%,${ink('.84')} 100%)`;

// 云带自己的色：足墨实色。纵向的浓淡衰减已经烘焙在每层 mask 的 alpha 里了，
// 底色再叠一层渐变等于把同一个浓度乘两遍，最后只剩半档灰——这是上一版云读不出来的第二个原因。
const CLOUD_TINT = `linear-gradient(${ink('1')},${ink('1')})`;
// 姓名落脚处那一小团墨：只在左上压一点，不抢整体渐变。
const BLOOM = `radial-gradient(ellipse 40% 30% at 18% 16%,${ink('.3')},${ink(0)} 76%)`;
const bgSize = '100% 100%,100% 100%';
// 层的几何：层高决定云线展开多少，上移量决定它越过框顶多少。
const HEAD_H = 150;
const HEAD_ABOVE = 58;
const VEIL_H = 170;
const VEIL_ABOVE = 108;

const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_XIANXIA_INK}"]`;

export const XIANXIA_DIALOG_STYLE = [
    ...Object.entries(INK_BY_TIME).map(([time, rgb]) => `${overlayScope}[data-igs-scene-time="${time}"]{--xia-ink:${rgb};}`),
    buildDialogFrameCss(DIALOG_SKIN_XIANXIA_INK, {
        height: 196,
        text: { top: TEXT_TOP, speakerTop: TEXT_SPEAKER_TOP, right: 72, bottom: 24, left: 72 },
        rise: 0,
        flush: true,
        frameCss: `background-color:transparent;background-image:${BLOOM},${POOL};background-position:0 0,0 0;background-size:${bgSize};background-repeat:no-repeat;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;`,
        // 姓名不托底牌：象牙白字压在墨晕上，名字下方掠一道朱砂剑气下划线——
        // 水平方向两端渐隐（0 → 实 → 0 的 90deg 线性渐变，两端各留 12% 化开）才是一笔扫出的剑光；
        // 径向渐变的「尖」只在垂直方向，水平两端是直边，看起来是一截红条。
        // padding-bottom 把线从文字下缘推开 8px，不贴着字。
        speakerCss: `left:72px;top:${SPEAKER_TOP}px;width:max-content;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 144px);height:32px;line-height:32px;padding:0 6px 10px;background:linear-gradient(90deg,rgba(${ZHU_RGB},0),${ZHU} 14%,${ZHU} 86%,rgba(${ZHU_RGB},0)) bottom/100% 3px no-repeat;border:0;font-size:20px;font-weight:400;letter-spacing:.2em;color:${IVORY};text-shadow:${stroke(ink('.6'))};`,
        textCss: `position:relative;z-index:1;letter-spacing:.06em;text-shadow:0 1px 0 rgba(6,8,11,.5);`,
    }),
    // 姓名排布 = center（设置项「姓名排布」，参考渐变黑幕的姓名样式开关）：
    // 名字+剑气下划线整体移到框内水平居中，下划线相应收窄——居中款是端在名字正下方的一笔，
    // 不再拖左侧落款的长飞白。左右对称留白，所以 padding 两侧一致。
    scalePx(`${scope}[data-igs-speaker-align="center"] .igs-speaker{left:50%;transform:translateX(-50%);text-align:center;padding:0 14px 10px;}`),
    `@media (max-width:640px){${scalePx(`${scope}[data-igs-speaker-align="center"] .igs-speaker{left:50%;max-width:calc(100% - 72px);}`)}}`,
    // 五条云带分挂两片伪元素：::after 带上面两条淡云（blur 10 化远），::before 带近处三条。
    // 五层全是 hold 实墨剪影，云体在框顶线处截断落进墨池；分层只靠浓度差（1 → .8）与相位错开。
    scalePx(`${scope}::after{content:"";position:absolute;z-index:0;pointer-events:none;left:-2%;right:-2%;top:-${BAND_TOP}px;height:${BAND_H_PX}px;background:${CLOUD_TINT};-webkit-mask-image:${CLOUD_BANDS.slice(3).map((b) => `url("${cloudBand(b)}")`).join(',')};mask-image:${CLOUD_BANDS.slice(3).map((b) => `url("${cloudBand(b)}")`).join(',')};-webkit-mask-size:100% 100%,100% 100%;mask-size:100% 100%,100% 100%;-webkit-mask-position:${CLOUD_BANDS.slice(3).map(() => '0 0').join(',')};mask-position:${CLOUD_BANDS.slice(3).map(() => '0 0').join(',')};-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;filter:blur(10px);}`),
    scalePx(`${scope}::before{content:"";position:absolute;z-index:0;pointer-events:none;left:-2%;right:-2%;top:-${BAND_TOP}px;height:${BAND_H_PX}px;background:${CLOUD_TINT};-webkit-mask-image:${CLOUD_BANDS.slice(0, 3).map((b) => `url("${cloudBand(b)}")`).join(',')};mask-image:${CLOUD_BANDS.slice(0, 3).map((b) => `url("${cloudBand(b)}")`).join(',')};-webkit-mask-size:100% 100%,100% 100%,100% 100%;mask-size:100% 100%,100% 100%,100% 100%;-webkit-mask-position:${CLOUD_BANDS.slice(0, 3).map(() => '0 0').join(',')};mask-position:${CLOUD_BANDS.slice(0, 3).map(() => '0 0').join(',')};-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;filter:blur(4px);}`),
    // 窄屏收窄两侧留白。
    `@media (max-width:640px){${scalePx(`${scope},${scope}[data-igs-has-speaker="1"]{padding-left:36px;padding-right:36px;}${scope} .igs-speaker{left:36px;max-width:calc(100% - 72px);}`)}}`,
].join('\n');

// 选项：两端化开的暗墨横带。悬停时名字牌那笔朱砂剑气在这里重现——一道两端收尖的朱砂下划线
// 从选项下缘掠过，墨同时加深一档；常态只在下缘留一线极淡的象牙墨痕作呼应。
// 朱砂全套皮肤只出现在这两笔剑气下划线和头像小印上。
const choiceUnder = (rgb, alpha, thick) => `radial-gradient(130% ${thick} at 50% 100%,rgba(${rgb},${alpha}) 34%,rgba(${rgb},${alpha * .5}) 58%,rgba(${rgb},0) 78%) bottom/100% ${thick} no-repeat`;
const choiceBand = (alpha) => `linear-gradient(90deg,${ink(0)},${ink(alpha)} 16%,${ink(alpha)} 84%,${ink(0)})`;
const choiceScope = `${overlayScope} .igs-option-bubble`;

export const XIANXIA_CHOICE_STYLE = [
    `${choiceScope}{box-sizing:border-box;min-height:44px;padding:10px 44px 14px;border:0;border-radius:0;background:${choiceUnder(IVORY_RGB, .22, '4px')},${choiceBand('.86')};box-shadow:none;color:${IVORY};letter-spacing:.14em;text-shadow:0 1px 0 rgba(6,8,11,.5);transition:background .2s,color .2s;}`,
    `${choiceScope}:hover{background:${choiceUnder(ZHU_RGB, .95, '8px')},${choiceBand('.94')};color:#fffaf0;}`,
    `${choiceScope}:active{transform:translateY(1px);}`,
].join('\n');

const s = (value) => `calc(${value}px * var(--igs-hud-scale,1))`;
const ring = (color, width) => `drop-shadow(${width}px 0 0 ${color}) drop-shadow(-${width}px 0 0 ${color}) drop-shadow(0 ${width}px 0 ${color}) drop-shadow(0 -${width}px 0 ${color})`;
const panel = (alpha) => `background:${ink(alpha)};border:0;border-radius:${s(2)};box-shadow:inset 0 1px 0 rgba(243,236,221,.14),inset 0 -1px 0 rgba(6,8,11,.5);`;

// 状态栏零件：墨面板（上缘一线浅墨、下缘更暗）、象牙细进度条、头像 ivory 细环加右下一方朱砂小印。
export const XIANXIA_HUD_THEME = Object.freeze({
    neutral: 'rgba(243,236,221,.5)',
    panel: panel('.9'),
    toast: `${panel('.96')}color:${IVORY};text-shadow:0 1px 0 rgba(6,8,11,.6);`,
    ink: IVORY,
    emotion: `padding:0 ${s(12)};border:0;border-radius:0;background:${ink('.84')};box-shadow:inset 0 -1px 0 rgba(${ZHU_RGB},.62);color:#e6dcc6;letter-spacing:.2em;text-shadow:none;`,
    avatar: `filter:${ring('rgba(243,236,221,.62)', 1.5)} drop-shadow(0 2px 6px rgba(6,8,11,.6));`,
    badge: `content:"";position:absolute;right:${s(-3)};bottom:${s(-3)};width:${s(9)};height:${s(9)};border-radius:${s(1.5)};background:${ZHU};box-shadow:0 0 0 1.5px rgba(14,17,21,.92);`,
    placeholder: 'background:linear-gradient(180deg,#2b2f32,#13171b);color:rgba(243,236,221,.72);',
    placeholderSvg: `fill:none;stroke:rgba(${QING_RGB},.65);stroke-width:1.3;`,
    track: `height:${s(4)};border:0;border-radius:0;background:rgba(243,236,221,.16);`,
    fill: `background:color-mix(in srgb,var(--igs-hud-fill-color) 88%,#f3ecdd) !important;border-radius:0;`,
    value: 'font-weight:400;',
});
