import { buildDialogFrameCss, scalePx } from './dialog-skin-frame.js';

export const DIALOG_SKIN_SCIFI_HOLO = 'scifi-holo';

// 全息终端：舰桥上一块半透明的深蓝面板。四角青色折角托住画面，顶边一道全息光带从左亮起、往右淡出，
// 底下极淡的扫描线只作质感；姓名是贴着顶边的一枚光标签，左侧一道实色竖条；右上角一行小读数。正文区保持干净。
const HOLO = '95,227,255';
const DEEP = '6,14,28';
const INK = '#e2f6ff';
export const SCIFI_HOLO = `rgb(${HOLO})`;
export const scifiHolo = (alpha) => `rgba(${HOLO},${alpha})`;
export const scifiDeep = (alpha) => `rgba(${DEEP},${alpha})`;
const holo = scifiHolo;
const deep = scifiDeep;
const overlayScope = `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_SCIFI_HOLO}"]`;
const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_SCIFI_HOLO}"]`;

const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
// 折角准星：四角各一道 L 形细角，中间一颗小菱形；只作遮罩，颜色由背景决定。
export const SCIFI_RETICLE_MASK = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="#000" stroke-width="2" d="M3.5 8V3.5H8M16 3.5H20.5V8M20.5 16V20.5H16M8 20.5H3.5V16"/><path d="M12 7.5L16.5 12L12 16.5L7.5 12Z"/></svg>');

const bar = (at, size) => `linear-gradient(${holo('.95')},${holo('.95')}) ${at}/${size} no-repeat`;
export const SCIFI_CORNERS = (len, width) => ['left top', 'right top', 'left bottom', 'right bottom']
    .map((at) => `${bar(at, `${len}px ${width}px`)},${bar(at, `${width}px ${len}px`)}`).join(',');
export const SCIFI_GLASS = `linear-gradient(180deg,${deep('.8')},${deep('.62')})`;
const SCAN = `repeating-linear-gradient(180deg,${holo('.045')} 0 1px,transparent 1px 4px)`;
const TOP_BEAM = `linear-gradient(90deg,${holo('.9')},${holo('.5')} 36%,${holo(0)} 78%) left top/100% 1px no-repeat`;
const BOTTOM_BEAM = `linear-gradient(90deg,${holo(0)},${holo('.32')} 30%,${holo('.32')} 70%,${holo(0)}) left bottom/100% 1px no-repeat`;
const GLOW = `radial-gradient(ellipse 60% 120% at 0% 0%,${holo('.12')},transparent 70%)`;
// 透明面板：上下边与两侧收成深色，中段只剩一层薄纱，舞台从框里透出来。
const PANE = `linear-gradient(90deg,${deep('.55')},${deep(0)} 14%,${deep(0)} 86%,${deep('.55')}),linear-gradient(180deg,${deep('.9')},${deep('.42')} 24%,${deep('.3')} 55%,${deep('.5')} 85%,${deep('.88')})`;
const READOUT_FONT = '"Source Han Sans CN","Microsoft YaHei",sans-serif';

export const SCIFI_DIALOG_STYLE = [
    buildDialogFrameCss(DIALOG_SKIN_SCIFI_HOLO, {
        height: 184,
        text: { top: 28, speakerTop: 40, right: 48, bottom: 22, left: 48 },
        rise: 15,
        frameCss: `background:${TOP_BEAM},${BOTTOM_BEAM},${SCAN},${GLOW},${PANE};border:1px solid ${holo('.28')};border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 0 22px ${holo('.14')},inset 0 0 28px ${holo('.07')};-webkit-backdrop-filter:none;backdrop-filter:none;`,
        speakerCss: `left:40px;top:-15px;width:max-content;min-width:120px;max-width:calc(100% - 80px);height:30px;line-height:30px;margin:0;padding:0 22px 0 18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:linear-gradient(90deg,${holo('.22')},${holo('.06')} 70%,transparent);border:0;border-left:3px solid ${holo(1)};-webkit-backdrop-filter:none;backdrop-filter:none;border-radius:0;box-shadow:inset 0 -1px 0 ${holo('.7')},0 0 12px ${holo('.18')};font-size:17px;font-weight:600;letter-spacing:.16em;text-shadow:0 0 8px ${holo('.65')};`,
        textCss: `letter-spacing:.05em;text-shadow:0 0 6px ${holo('.25')},0 1px 2px rgba(0,0,0,.95),0 0 10px rgba(0,0,0,.55);`,
    }),
    scalePx(`${scope}::before{content:"";position:absolute;inset:-1px;background:${SCIFI_CORNERS(18, 2)};pointer-events:none;}`),
    scalePx(`${scope}::after{content:"COMM \\25B8  01";position:absolute;right:24px;top:9px;font-family:${READOUT_FONT};font-size:10px;font-weight:600;line-height:1;letter-spacing:.32em;color:${holo('.5')};pointer-events:none;}`),
    // 窄屏收窄两侧留白，读数让位给正文。
    `@media (max-width:640px){${scalePx(`${scope},${scope}[data-igs-has-speaker="1"]{padding-left:24px;padding-right:22px;}${scope} .igs-speaker{left:18px;max-width:calc(100% - 36px);}${scope}::after{display:none;}`)}}`,
].join('\n');

// 选项：深蓝玻璃条，左侧一道青色实条；悬停时边线亮起、右侧点亮一枚准星。
const choiceScope = `${overlayScope} .igs-option-bubble`;
const CHOICE_EDGE = `linear-gradient(90deg,${holo(1)} 0 3px,transparent 3px)`;

export const SCIFI_CHOICE_STYLE = [
    `${choiceScope}{box-sizing:border-box;min-height:44px;padding:10px 44px;border:1px solid ${holo('.3')};border-radius:2px;background:${CHOICE_EDGE},${SCIFI_GLASS};box-shadow:0 0 14px ${holo('.1')};color:${INK};letter-spacing:.12em;text-shadow:0 0 6px ${holo('.3')};transition:background .18s,box-shadow .18s,border-color .18s;}`,
    `${choiceScope}::before{content:"";position:absolute;right:14px;top:50%;width:12px;height:12px;margin-top:-6px;background:${holo(1)};-webkit-mask:${SCIFI_RETICLE_MASK} center/contain no-repeat;mask:${SCIFI_RETICLE_MASK} center/contain no-repeat;opacity:.3;transition:opacity .18s;}`,
    `${choiceScope}:hover{border-color:${holo('.75')};background:${CHOICE_EDGE},linear-gradient(90deg,${holo('.22')},${holo('.06')}),${SCIFI_GLASS};box-shadow:0 0 18px ${holo('.25')};}`,
    `${choiceScope}:hover::before{opacity:1;}`,
    `${choiceScope}:active{transform:translateY(1px);}`,
].join('\n');

const s = (value) => `calc(${value}px * var(--igs-hud-scale,1))`;
const panel = (alpha) => `background:linear-gradient(90deg,${holo('.85')} 0 2px,transparent 2px),linear-gradient(180deg,${deep(alpha)},${deep(Number((alpha + 0.05).toFixed(2)))});border:1px solid ${holo('.26')};border-radius:${s(2)};box-shadow:0 0 12px ${holo('.12')};`;

// 状态栏零件：玻璃面板左侧一道青条、描边情绪签、头像外一圈青色光边、右下一颗菱形指示灯。
export const SCIFI_HUD_THEME = Object.freeze({
    neutral: '#7d93aa',
    panel: panel(0.82),
    toast: `${panel(0.9)}color:${INK};text-shadow:0 0 6px ${holo('.3')};`,
    ink: INK,
    emotion: `padding:0 ${s(10)};border:1px solid ${holo('.55')};border-radius:${s(2)};background:${holo('.12')};color:#bff4ff;letter-spacing:.16em;text-shadow:0 0 6px ${holo('.5')};`,
    avatar: `filter:drop-shadow(0 0 1.5px ${holo(1)}) drop-shadow(0 0 4px ${holo('.45')});`,
    badge: `content:"";position:absolute;right:${s(-3)};bottom:${s(-3)};width:${s(8)};height:${s(8)};background:${holo(1)};transform:rotate(45deg);box-shadow:0 0 6px ${holo('.8')};`,
    placeholder: 'background:linear-gradient(180deg,#13233b,#0a1426);color:#8fe6f7;',
    placeholderSvg: 'fill:none;stroke:#8fe6f7;stroke-width:1.3;',
    track: `height:${s(4)};border:0;border-radius:0;background:${holo('.14')};`,
    fill: `background:color-mix(in srgb,var(--igs-hud-fill-color) 55%,rgb(${HOLO})) !important;border-radius:0;box-shadow:0 0 6px ${holo('.5')};`,
    value: 'font-weight:600;letter-spacing:.06em;',
});
