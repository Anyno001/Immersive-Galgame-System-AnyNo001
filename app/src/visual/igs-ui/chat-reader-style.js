import { FX_STYLE_TEXT } from './fx-style.js';
import { CHAT_AVATAR_BOX } from './chat-reader-model.js';
import { IGS_UI_FONT_SANS } from '../../styles/ui-material.js';

// 情绪胶囊的字色取漫画符号同一套色相，不另抄一份。
const CHIP_HUES = [...FX_STYLE_TEXT.matchAll(/\.igs-fx-symbol\[data-kind="([a-z-]+)"\]\{--igs-fx-hue:(#[0-9a-fA-F]{3,8})/g)]
    .map(([, kind, hue]) => `#igs-chat-reader .igs-cr-chip[data-kind="${kind}"]{--igs-cr-chip-hue:${hue};}`).join('');

const AV = CHAT_AVATAR_BOX.w;
const R = '#igs-chat-reader';
const ON = '#igs-overlay[data-igs-chat-reader="on"]';

// 线上聊天阅读模式：背景只整体压暗；气泡、旁白条都是实色或单层半透明深色。
// 立绘隐藏、对话框收起、输入框换皮复用纵向的 data-igs-log-reader 规则（见 log-reader-style.js）。
export const CHAT_READER_STYLE_TEXT = `
${CHIP_HUES}
${R}{display:none;}
${ON} #igs-log{display:none!important;}
${ON} ${R}{display:block;position:absolute;inset:0;z-index:1;pointer-events:none;background:rgba(0,0,0,var(--igs-cr-dim,.3));transition:opacity .35s;}
${R}[data-hidden]{opacity:0;}
${R}[data-hidden] .igs-cr-scroll{pointer-events:none;}
${ON}.igs-options-visible ${R}{opacity:0;}
${ON}.igs-options-visible ${R} .igs-cr-scroll{pointer-events:none;}
${R} .igs-cr-scroll{position:absolute;left:0;right:0;bottom:var(--igs-log-foot,64px);top:52px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;display:flex;flex-direction:column;padding:0 var(--igs-log-edge,18px);pointer-events:auto;cursor:pointer;-webkit-mask:linear-gradient(to bottom,transparent 0,#000 40px);mask:linear-gradient(to bottom,transparent 0,#000 40px);user-select:none;-webkit-user-select:none;}
${R} .igs-cr-scroll::-webkit-scrollbar{display:none;}
${R} .igs-cr-list{margin-top:auto;display:flex;flex-direction:column;padding:40px 0 6px;}
${R}{--igs-cr-left:#fff;--igs-cr-left-ink:#1f1f1f;--igs-cr-left-soft:#f1eef6;--igs-cr-right:#95ec69;--igs-cr-right-ink:#1f1f1f;--igs-cr-right-soft:#e3f5d7;--igs-cr-radius:16px;--igs-cr-fs:15px;--igs-cr-gap:20px;--igs-cr-mk:.75;--igs-cr-nm:22px;--igs-cr-ng:calc((var(--igs-cr-gap) + var(--igs-cr-nm)) * .7);}
${R}[data-mood-size="l"]{--igs-cr-mk:1;}
${R}[data-mood-size="s"]{--igs-cr-mk:.5;}
/* 间距表（气泡边到气泡边）：同组气泡 4px；换人组间 = 间隙 + 名字行（--igs-cr-nm，左右都留名字行位）；旁白 / 时间条 / 重播前后同取 --igs-cr-ng。 */
${R} .igs-cr-group{display:flex;align-items:flex-start;gap:8px;max-width:84%;margin-top:var(--igs-cr-gap);}
${R} .igs-cr-group.is-left{align-self:flex-start;}
${R} .igs-cr-group.is-right{align-self:flex-end;flex-direction:row-reverse;}
${R} .igs-cr-col{min-width:0;display:flex;flex-direction:column;gap:4px;}
${R} .igs-cr-group.is-left .igs-cr-col{align-items:flex-start;}
${R} .igs-cr-group.is-right .igs-cr-col{align-items:flex-end;}
${R} :is(.igs-cr-time,.igs-cr-narr,.igs-cr-solo)+.igs-cr-group{margin-top:calc(var(--igs-cr-ng) - var(--igs-cr-nm));}
${R} .igs-cr-list>:first-child{margin-top:0;}
${R} .igs-cr-av{position:relative;flex:none;width:${AV}px;height:${AV}px;border-radius:12px;background-color:#26242b;background-repeat:no-repeat;transition:box-shadow .2s;}
${R}[data-av="circle"] .igs-cr-av{border-radius:50%;}
${R} .igs-cr-av.is-letter{display:grid;place-items:center;font-size:16px;font-weight:600;color:#121212;background-color:var(--igs-cr-hue);}
${R} .igs-cr-name{display:flex;align-items:center;gap:5px;min-height:18px;margin:0 6px;font-family:var(--igs-cr-name-font,${IGS_UI_FONT_SANS})!important;font-size:12px;line-height:1.2;color:rgba(255,255,255,.88);text-shadow:0 1px 2px rgba(0,0,0,.55);}
${R} .igs-cr-name b{font-weight:600;}
/* 姓名取色小圆点：不加描边。 */
${R} .igs-cr-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--igs-cr-hue,#8fb4ff);}
${R} .igs-cr-chip{display:inline-flex;align-items:center;height:calc(20px * var(--igs-cr-mk));padding:0 calc(9px * var(--igs-cr-mk));border-radius:99px;background:#1c1c1e;color:color-mix(in oklab,var(--igs-cr-chip-hue,#a9a3b2) 70%,#fff);font-size:max(9px,calc(12.5px * var(--igs-cr-mk)));text-shadow:none;cursor:pointer;}
${R} .igs-cr-play{flex:none;width:22px;height:20px;padding:0;border:0;border-radius:6px;background:transparent;color:rgba(255,255,255,.7);display:grid;place-items:center;cursor:pointer;}
${R} .igs-cr-play svg{width:15px;height:15px;}
/* 气泡：左侧统一一种颜色，User 在右侧用自选颜色；尖角只给组头。 */
${R} .igs-cr-bubble{position:relative;box-sizing:border-box;max-width:100%;padding:9px 13px;border-radius:var(--igs-cr-radius);background:var(--igs-cr-left);color:var(--igs-cr-left-ink);font-family:var(--igs-cr-font,${IGS_UI_FONT_SANS})!important;font-size:var(--igs-cr-fs);line-height:1.55;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;box-shadow:0 2px 8px rgba(0,0,0,.18);text-shadow:var(--igs-cr-shadow,none);text-align:left;}
${R} .igs-cr-group.is-right .igs-cr-bubble{background:var(--igs-cr-right);color:var(--igs-cr-right-ink);}
${R} .igs-cr-group.is-left .igs-cr-bubble.is-first{border-top-left-radius:min(5px,var(--igs-cr-radius));}
${R} .igs-cr-group.is-right .igs-cr-bubble.is-first{border-top-right-radius:min(5px,var(--igs-cr-radius));}
${R} .igs-cr-bubble .igs-cr-play{position:absolute;right:-26px;top:50%;margin-top:-10px;color:rgba(255,255,255,.8);}
${R} .igs-cr-group.is-right .igs-cr-bubble .igs-cr-play{right:auto;left:-26px;}
${R} .igs-cr-label{font-weight:700;margin-right:.4em;}
/* 心里话：两个思考小圆落在尖角位置，气泡本身做成描边空心；关掉「心里话透明」就是浅色实底。 */
${R} .igs-cr-bubble.is-thought{border-radius:var(--igs-cr-radius);color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.45);background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1.5px var(--igs-cr-left);}
${R} .igs-cr-group.is-right .igs-cr-bubble.is-thought{box-shadow:inset 0 0 0 1.5px var(--igs-cr-right);}
${R} .igs-cr-bubble.is-thought.is-first::before,${R} .igs-cr-bubble.is-thought.is-first::after{content:"";position:absolute;border-radius:50%;background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1.5px var(--igs-cr-left);}
${R} .igs-cr-group.is-right .igs-cr-bubble.is-thought.is-first::before,${R} .igs-cr-group.is-right .igs-cr-bubble.is-thought.is-first::after{box-shadow:inset 0 0 0 1.5px var(--igs-cr-right);}
${R} .igs-cr-bubble.is-thought.is-first::before{width:8px;height:8px;top:-6px;left:-4px;}
${R} .igs-cr-bubble.is-thought.is-first::after{width:5px;height:5px;top:-11px;left:-9px;}
${R} .igs-cr-group.is-right .igs-cr-bubble.is-thought.is-first::before{left:auto;right:-4px;}
${R} .igs-cr-group.is-right .igs-cr-bubble.is-thought.is-first::after{left:auto;right:-9px;}
${R}[data-thought="solid"] .igs-cr-bubble.is-thought{background:var(--igs-cr-left-soft);color:#5d5868;text-shadow:none;box-shadow:none;}
${R}[data-thought="solid"] .igs-cr-group.is-right .igs-cr-bubble.is-thought{background:var(--igs-cr-right-soft);}
${R}[data-thought="solid"] .igs-cr-bubble.is-thought.is-first::before,${R}[data-thought="solid"] .igs-cr-bubble.is-thought.is-first::after{background:var(--igs-cr-left-soft);box-shadow:none;}
${R}[data-thought="solid"] .igs-cr-group.is-right .igs-cr-bubble.is-thought.is-first::before,${R}[data-thought="solid"] .igs-cr-group.is-right .igs-cr-bubble.is-thought.is-first::after{background:var(--igs-cr-right-soft);}
${R} .igs-cr-bubble .igs-thought{color:inherit!important;}
/* 旁白：不进气泡，通栏半透明深底条；可切成无底投影字。 */
${R} .igs-cr-narr{align-self:stretch;position:relative;margin:var(--igs-cr-ng) 0 0;padding:8px 12px;border-radius:10px;background:rgba(0,0,0,.42);color:rgba(255,255,255,.92);font-family:var(--igs-cr-narr-font,var(--igs-cr-font,${IGS_UI_FONT_SANS}))!important;font-size:calc(var(--igs-cr-fs) - 1px);line-height:1.7;text-align:justify;opacity:0;transition:opacity .35s;}
${R} :is(.igs-cr-bubble,.igs-cr-name,.igs-cr-narr) *:not(svg):not(svg *){font-family:inherit!important;}
${R} .igs-cr-narr.is-in{opacity:1;}
${R} .igs-cr-narr.is-thought{font-style:normal;color:rgba(255,255,255,.78);}
${R}[data-narr="shadow"] .igs-cr-narr{background:none;padding:2px 6px;text-shadow:0 1px 3px rgba(0,0,0,.8),0 0 8px rgba(0,0,0,.5);}
${R} .igs-cr-narr .igs-cr-play{display:inline-grid;vertical-align:-5px;margin-left:4px;}
${R} .igs-cr-narr:has(>.igs-cr-play)>.igs-cr-text{display:inline;}
/* 场景 / 时间分隔。 */
${R} .igs-cr-time{align-self:center;margin:var(--igs-cr-ng) 0 0;padding:2px 10px;border-radius:6px;background:rgba(0,0,0,.3);color:rgba(255,255,255,.82);font-size:11px;letter-spacing:.2em;opacity:0;transition:opacity .5s;}
${R} .igs-cr-time.is-in{opacity:1;}
/* 聊天页 / 卡片页：一个重播按钮。 */
${R} .igs-cr-solo{align-self:center;margin:var(--igs-cr-ng) 0 0;opacity:0;transition:opacity .35s;}
${R} .igs-cr-solo.is-in{opacity:1;}
${R} .igs-cr-replay{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 14px;border:0;border-radius:999px;background:#1c1c1e;color:#c9c9d0;font:inherit;font-size:12.5px;cursor:pointer;}
${R} .igs-cr-replay svg{width:12px;height:12px;fill:currentColor;}
${R} .igs-cr-card{align-self:center;display:flex;align-items:center;gap:8px;margin:6px 0 0;padding:7px 12px;border-radius:12px;background:#1c1c1e;color:#f2f2f4;font-size:12.5px;line-height:1.4;opacity:0;transition:opacity .35s;}
${R} .igs-cr-card.is-in{opacity:1;}
${R} .igs-cr-card b{color:#ece6da;font-weight:600;}
${R} .igs-cr-card span{color:#a9a3b2;}
/* 正在输入：三点气泡，之后原地换成正文并弹出。 */
${R} .igs-cr-bubble.is-typing{padding:13px 14px;}
${R} .igs-cr-dots{display:flex;align-items:center;gap:4px;}
${R} .igs-cr-dots i{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.35;animation:igs-cr-dot 1s ease-in-out infinite;}
${R} .igs-cr-dots i:nth-child(2){animation-delay:.16s;}
${R} .igs-cr-dots i:nth-child(3){animation-delay:.32s;}
@keyframes igs-cr-dot{0%,80%,100%{opacity:.3;transform:translateY(0);}40%{opacity:.85;transform:translateY(-3px);}}
${R} .igs-cr-group.is-left .igs-cr-bubble.is-pop{transform-origin:left bottom;animation:igs-cr-pop .24s cubic-bezier(.34,1.56,.64,1) both;}
${R} .igs-cr-group.is-right .igs-cr-bubble.is-pop{transform-origin:right bottom;animation:igs-cr-pop .24s cubic-bezier(.34,1.56,.64,1) both;}
@keyframes igs-cr-pop{from{opacity:0;transform:translateY(6px) scale(.6);}to{opacity:1;transform:none;}}
/* 头像右上角的情绪符号。 */
${R} .igs-cr-av>.igs-fx-symbol{--igs-fx-size:calc(28px * var(--igs-cr-mk));left:calc(var(--igs-cr-sym-x,calc(100% + 8px * var(--igs-cr-mk) - var(--igs-fx-size) * .6)) - var(--igs-fx-size) * .4);top:calc(var(--igs-cr-sym-y,calc(var(--igs-fx-size) * .62 - 8px * var(--igs-cr-mk))) - var(--igs-fx-size) * .62);right:auto;margin:0;z-index:2;cursor:pointer;animation:igs-log-pop .45s cubic-bezier(.3,1.6,.5,1) both;}
${R} .igs-cr-av>.igs-fx-symbol.is-loop{animation:igs-log-pop .45s cubic-bezier(.3,1.6,.5,1) both,var(--igs-log-loop,igs-log-bob) 2.6s ease-in-out .45s infinite;}
${R} .igs-cr-av>.igs-fx-symbol.is-once{animation:igs-log-pop .45s cubic-bezier(.3,1.6,.5,1) both,var(--igs-log-loop,igs-log-bob) 1.1s ease-in-out .3s 1;}
${R} .igs-cr-av>.igs-fx-symbol.is-done,${R} .igs-cr-av>.igs-fx-symbol.is-done *{animation:none!important;}
${R} .igs-fx-symbol[data-kind="heart"],${R} .igs-fx-symbol[data-kind="blush"],${R} .igs-fx-symbol[data-kind="bloom"]{--igs-log-loop:igs-log-beat;}
${R} .igs-fx-symbol[data-kind="sweat"],${R} .igs-fx-symbol[data-kind="drool"]{--igs-log-loop:igs-log-drip;}
${R} .igs-fx-symbol[data-kind="anger"],${R} .igs-fx-symbol[data-kind="fire"]{--igs-log-loop:igs-log-shake-sym;}
/* 直播手机键。 */
${R} .igs-cr-live{position:absolute;top:12px;right:12px;z-index:6;width:36px;height:36px;padding:0;border:0;border-radius:999px;background:#1c1c1e;color:#ece6da;display:grid;place-items:center;cursor:pointer;pointer-events:auto;}
${R} .igs-cr-live svg{width:20px;height:20px;}
/* 调整立绘：头像描一圈强调色。 */
${R}[data-editing] .igs-cr-av:not(.is-letter){box-shadow:0 0 0 2px #ece6da;cursor:grab;touch-action:none;}
${R}[data-editing] .igs-cr-av[data-picked]:not(.is-letter){box-shadow:0 0 0 2px #121212,0 0 0 4px #ece6da;}
${R}[data-editing] .igs-cr-av{pointer-events:auto;}
/* 编辑条沿用纵向的 #igs-log-edit-bar 样式变量，这里补默认值。 */
${R} #igs-log-edit-bar{--igs-log-veil:18 18 20;--igs-log-ink:#f4f1f6;--igs-log-sub:#a9a3b2;--igs-log-plate:#26242b;--igs-log-acc:#ece6da;position:absolute;left:50%;bottom:calc(var(--igs-log-foot,64px) + 12px);transform:translateX(-50%);z-index:10;display:flex;align-items:center;gap:4px;max-width:calc(100% - 24px);padding:4px 4px 4px 14px;border-radius:18px;background:rgb(var(--igs-log-veil));color:var(--igs-log-ink);font-size:12px;line-height:1;pointer-events:auto;}
${R} #igs-log-edit-bar span{min-width:0;margin-right:6px;overflow:hidden;text-overflow:ellipsis;color:var(--igs-log-sub);white-space:nowrap;}
${R} #igs-log-edit-bar button{flex:none;height:28px;min-width:52px;padding:0 12px;border:0;border-radius:999px;background:var(--igs-log-plate);color:inherit;font:inherit;cursor:pointer;white-space:nowrap;}
${R} #igs-log-edit-bar button[data-log-zoom]{min-width:36px;padding:0;font-size:16px;}
${R} #igs-log-edit-bar button[aria-pressed="true"]{box-shadow:inset 0 0 0 1.5px var(--igs-log-acc);color:var(--igs-log-acc);}
${R} #igs-log-edit-bar button:disabled{color:var(--igs-log-sub);cursor:default;}
${R} #igs-log-edit-bar button[data-log-edit="save"]{background:var(--igs-log-acc);color:rgb(var(--igs-log-veil));font-weight:600;}
/* 表情包：无底色无气泡尾，占位卡颜色随左右气泡的柔和色；窄屏缩小。 */
${R}{--igs-cr-sticker-size:112px;--igs-cr-sticker-radius:12px;}
${R} .igs-cr-group.is-left{--igs-sticker-ph-bg:var(--igs-cr-left-soft);--igs-sticker-ph-ink:var(--igs-cr-left-ink);}
${R} .igs-cr-group.is-right{--igs-sticker-ph-bg:var(--igs-cr-right-soft);--igs-sticker-ph-ink:var(--igs-cr-right-ink);}
${R} .igs-cr-group:is(.is-left,.is-right) .igs-cr-bubble.is-sticker{padding:0;background:none;box-shadow:none;border-radius:0;}
${R} .igs-cr-group:is(.is-left,.is-right) .igs-cr-bubble.is-sticker::before,${R} .igs-cr-group:is(.is-left,.is-right) .igs-cr-bubble.is-sticker::after{content:none;}
${R} .igs-cr-bubble.is-sticker .igs-cr-text{display:block;line-height:0;}
${R} .igs-cr-sticker{display:inline-block;width:var(--igs-cr-sticker-size);height:var(--igs-cr-sticker-size);line-height:0;}
${R} .igs-cr-sticker :is(img,svg){display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;}
${R} .igs-cr-sticker img{border-radius:var(--igs-cr-sticker-radius);}
@media (max-width:640px){${R}{--igs-cr-sticker-size:96px;--igs-cr-sticker-radius:10px;}}
@media (prefers-reduced-motion:reduce){${R} .igs-cr-dots i,${R} .igs-fx-symbol,${R} .igs-fx-symbol *{animation:none!important;}}
`;
