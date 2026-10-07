import { buildDialogFrameCss, scalePx } from './dialog-skin-frame.js';

export const DIALOG_SKIN_SCIFI_HOLO = 'scifi-holo';

// 全息投影：没有框。台词浮在半空，底边一道发光的投影基座，光束从基座往上散开、越往上越淡；
// 极淡的扫描线只落在光束里，偶尔有一条亮带缓慢上扫。姓名是悬浮的细线标签，正文带一点色散。
// 舞台画面始终透出来；省电画质与「减少动态效果」下不扫、不闪。
const HOLO = '120,232,255';
const DEEP = '4,12,24';
const INK = '#e8fbff';
export const SCIFI_HOLO = `rgb(${HOLO})`;
export const scifiHolo = (alpha) => `rgba(${HOLO},${alpha})`;
export const scifiDeep = (alpha) => `rgba(${DEEP},${alpha})`;
const holo = scifiHolo;
const deep = scifiDeep;
const overlayScope = `#igs-overlay[data-igs-dialog-skin="${DIALOG_SKIN_SCIFI_HOLO}"]`;
const scope = `#igs-overlay .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_SCIFI_HOLO}"]`;
const calm = `#igs-overlay[data-igs-quality="low"] .igs-dialog[data-igs-dialog-skin="${DIALOG_SKIN_SCIFI_HOLO}"]`;

const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
// 投影准星：四角细折线围住一颗菱形；只作遮罩，颜色由背景决定。
export const SCIFI_RETICLE_MASK = svgUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="#000" stroke-width="2" d="M3.5 8V3.5H8M16 3.5H20.5V8M20.5 16V20.5H16M8 20.5H3.5V16"/><path d="M12 7.5L16.5 12L12 16.5L7.5 12Z"/></svg>');

// 物品卡等小件的四角折线与薄玻璃底：很薄，只压住字。
const bar = (at, size) => `linear-gradient(${holo('.95')},${holo('.95')}) ${at}/${size} no-repeat`;
export const SCIFI_CORNERS = (len, width) => ['left top', 'right top', 'left bottom', 'right bottom']
    .map((at) => `${bar(at, `${len}px ${width}px`)},${bar(at, `${width}px ${len}px`)}`).join(',');
export const SCIFI_GLASS = `linear-gradient(180deg,${deep('.42')},${deep('.62')})`;
// 投影基座：中间最亮、两端化开的一道光。
export const SCIFI_EMITTER = (alpha = 1) => `linear-gradient(90deg,${holo(0)},${holo(0.85 * alpha)} 22%,${holo(alpha)} 50%,${holo(0.85 * alpha)} 78%,${holo(0)})`;
const BEAM = `radial-gradient(ellipse 58% 115% at 50% 100%,${holo('.2')},${holo('.07')} 48%,${holo(0)} 74%)`;
const SCAN = `repeating-linear-gradient(0deg,${holo('.06')} 0 1px,transparent 1px 5px)`;
// 正文背后一团极淡的暗影，亮场景里字也立得住；不成形，看不出边。
const SHADE = `radial-gradient(ellipse 72% 78% at 50% 56%,${deep('.42')},${deep('.18')} 55%,${deep(0)} 78%)`;
const GLITCH = `-.6px 0 0 rgba(255,96,170,.32),.6px 0 0 ${holo('.5')}`;
const TEXT_GLOW = `${GLITCH},0 0 8px ${holo('.45')},0 1px 2px rgba(0,0,0,.9)`;

export const SCIFI_DIALOG_STYLE = [
    buildDialogFrameCss(DIALOG_SKIN_SCIFI_HOLO, {
        height: 180,
        text: { top: 30, speakerTop: 54, right: 56, bottom: 28, left: 56 },
        rise: 0,
        frameCss: `background:${SHADE},${BEAM};border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;isolation:isolate;`,
        speakerCss: `left:56px;top:14px;width:max-content;max-width:calc(100% - 112px);height:28px;line-height:26px;margin:0;padding:0 18px 0 14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:linear-gradient(${holo('.95')},${holo('.95')}) left bottom/100% 1px no-repeat,linear-gradient(${holo(1)},${holo(1)}) left bottom/1px 9px no-repeat,linear-gradient(90deg,${holo('.16')},${holo(0)}) left bottom/100% 100% no-repeat;border:0;border-radius:0;box-shadow:none;font-size:17px;font-weight:600;letter-spacing:.24em;text-shadow:0 0 8px ${holo('.75')},0 1px 2px rgba(0,0,0,.8);`,
        textCss: `letter-spacing:.06em;text-shadow:${TEXT_GLOW};`,
    }),
    // ::before 是投影基座：一道亮线，外面一圈光晕；::after 是光束里的扫描线与一条缓慢上扫的亮带。
    scalePx(`${scope}::before{content:"";position:absolute;left:6%;right:6%;bottom:0;height:3px;border-radius:2px;background:${SCIFI_EMITTER()};box-shadow:0 0 10px ${holo('.7')},0 0 26px ${holo('.35')};pointer-events:none;}`),
    scalePx(`${scope}::after{content:"";position:absolute;left:10%;right:10%;top:0;bottom:3px;z-index:-1;background:linear-gradient(0deg,${holo(0)},${holo('.16')} 48%,${holo(0)} 52%) 0 120%/100% 260% no-repeat,${SCAN};-webkit-mask:radial-gradient(ellipse 60% 120% at 50% 100%,#000 30%,transparent 75%);mask:radial-gradient(ellipse 60% 120% at 50% 100%,#000 30%,transparent 75%);pointer-events:none;animation:igs-holo-sweep 6.5s linear infinite;}`),
    `${scope} .igs-text{animation:igs-holo-flicker 9s steps(1,end) infinite;}`,
    `${scope} .igs-speaker::after{content:"";position:absolute;right:4px;bottom:5px;width:5px;height:5px;background:${holo(1)};transform:rotate(45deg);box-shadow:0 0 6px ${holo('.9')};}`,
    '@keyframes igs-holo-sweep{0%{background-position:0 120%,0 0;}100%{background-position:0 -160%,0 0;}}',
    // 很少出现的一下失真：正文微微横移、色散拉开，随即复原。
    `@keyframes igs-holo-flicker{0%,93%,100%{opacity:1;transform:none;}94%{opacity:.72;transform:translateX(1.5px);text-shadow:-1.6px 0 0 rgba(255,96,170,.45),1.6px 0 0 ${holo('.6')},0 0 8px ${holo('.45')};}95%{opacity:1;transform:translateX(-1px);}}`,
    `@media (prefers-reduced-motion: reduce){${scope}::after,${scope} .igs-text{animation:none !important;}}`,
    `${calm}::after,${calm} .igs-text{animation:none !important;}`,
    `@media (max-width:640px){${scalePx(`${scope},${scope}[data-igs-has-speaker="1"]{padding-left:26px;padding-right:24px;}${scope} .igs-speaker{left:26px;max-width:calc(100% - 52px);}${scope}::before{left:3%;right:3%;}`)}}`,
].join('\n');

// 选项：没有底板，悬浮的一行字，下面一道基座细光；悬停时光线变亮、左侧亮起投影准星。
const choiceScope = `${overlayScope} .igs-option-bubble`;
const CHOICE_BASE = `${SCIFI_EMITTER(0.5)} center bottom/80% 1px no-repeat`;

export const SCIFI_CHOICE_STYLE = [
    `${choiceScope}{box-sizing:border-box;min-height:44px;padding:10px 44px;border:0;border-radius:0;background:${CHOICE_BASE},radial-gradient(ellipse 50% 90% at 50% 100%,${holo('.12')},${holo(0)} 75%);box-shadow:none;color:${INK};letter-spacing:.14em;text-shadow:${GLITCH},0 0 8px ${holo('.4')},0 1px 2px rgba(0,0,0,.9);transition:background .2s,text-shadow .2s;}`,
    `${choiceScope}::before{content:"";position:absolute;left:14px;top:50%;width:12px;height:12px;margin-top:-6px;background:${holo(1)};-webkit-mask:${SCIFI_RETICLE_MASK} center/contain no-repeat;mask:${SCIFI_RETICLE_MASK} center/contain no-repeat;opacity:0;transform:scale(.6);transition:opacity .2s,transform .2s;filter:drop-shadow(0 0 3px ${holo('.9')});}`,
    `${choiceScope}:hover{background:${SCIFI_EMITTER(1)} center bottom/92% 1.5px no-repeat,radial-gradient(ellipse 55% 100% at 50% 100%,${holo('.24')},${holo(0)} 78%);text-shadow:${GLITCH},0 0 12px ${holo('.7')},0 1px 2px rgba(0,0,0,.9);}`,
    `${choiceScope}:hover::before{opacity:1;transform:none;}`,
    `${choiceScope}:active{transform:translateY(1px);}`,
].join('\n');

const s = (value) => `calc(${value}px * var(--igs-hud-scale,1))`;
const panel = (alpha) => `background:${SCIFI_EMITTER(0.8)} left bottom/100% 1px no-repeat,linear-gradient(180deg,${deep(alpha)},${deep(Number((alpha * 0.6).toFixed(2)))});border:0;border-radius:${s(2)};box-shadow:0 ${s(6)} ${s(14)} ${holo('.1')};`;

// 状态栏零件：薄玻璃小牌、底边一道基座光、细线情绪签、头像外一圈光边、右下一颗菱形指示灯。
export const SCIFI_HUD_THEME = Object.freeze({
    neutral: '#7d93aa',
    panel: panel(0.5),
    toast: `${panel(0.7)}color:${INK};text-shadow:0 0 6px ${holo('.4')};`,
    ink: INK,
    emotion: `padding:0 ${s(8)};border:0;border-bottom:1px solid ${holo('.8')};border-radius:0;background:linear-gradient(0deg,${holo('.16')},${holo(0)});color:#c9f6ff;letter-spacing:.18em;text-shadow:0 0 6px ${holo('.6')};`,
    avatar: `filter:drop-shadow(0 0 1.5px ${holo(1)}) drop-shadow(0 0 5px ${holo('.5')});`,
    badge: `content:"";position:absolute;right:${s(-3)};bottom:${s(-3)};width:${s(7)};height:${s(7)};background:${holo(1)};transform:rotate(45deg);box-shadow:0 0 6px ${holo('.9')};`,
    placeholder: `background:linear-gradient(180deg,${deep('.5')},${deep('.75')});color:#9eeeff;`,
    placeholderSvg: 'fill:none;stroke:#9eeeff;stroke-width:1.3;',
    track: `height:${s(3)};border:0;border-radius:0;background:${holo('.14')};`,
    fill: `background:color-mix(in srgb,var(--igs-hud-fill-color) 50%,rgb(${HOLO})) !important;border-radius:0;box-shadow:0 0 6px ${holo('.6')};`,
    value: 'font-weight:600;letter-spacing:.06em;',
});
