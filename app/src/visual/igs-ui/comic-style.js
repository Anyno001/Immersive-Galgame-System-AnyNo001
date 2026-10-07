// 漫画演出模式与对话框变形的样式。皮肤样式表注入在主样式之后，对话框本体的覆盖要带 !important。
const SANS = '"Noto Sans SC","Source Han Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
const SERIF = '"Noto Serif SC","Source Han Serif SC","Songti SC","STSong","SimSun",serif';
const C = '#igs-overlay[data-igs-comic]';
const MONO = '#igs-overlay[data-igs-comic="mono"]';

export const COMIC_STYLE_TEXT = `
${C}{--igs-comic-paper:#fff;--igs-comic-ink:#141414;--igs-comic-text:#141414;--igs-comic-accent:#141414;--igs-comic-gutter:#fff;--igs-dialog-h:72px!important;--igs-dialog-w:min(560px,calc(100% - 32px))!important;}
${C} #igs-dialog{position:absolute!important;inset:0!important;width:auto!important;height:auto!important;min-height:0!important;max-height:none!important;margin:0!important;padding:0!important;background:none!important;border:0!important;border-radius:0!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;transform:none!important;overflow:visible!important;display:block!important;pointer-events:none!important;}
${C} #igs-dialog::before,${C} #igs-dialog::after{content:none!important;display:none!important;}
${C} #igs-dialog>:not(.igs-comic-group):not(.igs-comic-ghost):not(.igs-controls){display:none!important;}
${C} #igs-dialog .igs-controls{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);width:min(560px,calc(100% - 40px));box-sizing:border-box;pointer-events:auto;margin:0;padding:8px 10px;background:var(--igs-comic-paper);border:2.5px solid var(--igs-comic-ink);border-radius:14px;box-shadow:none;}
${C} #igs-dialog .igs-input{background:transparent;color:var(--igs-comic-text);border:1.5px solid color-mix(in srgb,var(--igs-comic-ink) 35%,transparent);}
${C} #igs-dialog .igs-input::placeholder{color:color-mix(in srgb,var(--igs-comic-text) 50%,transparent);}
${C} #igs-dialog .igs-send-btn{background:var(--igs-comic-ink);color:var(--igs-comic-paper);border:0;}
${C} #igs-dialog.igs-hidden .igs-comic-group,${C} #igs-dialog.igs-hidden .igs-comic-ghost{opacity:0;pointer-events:none;}

#igs-overlay .igs-comic-group{position:absolute;inset:0;pointer-events:none;}
#igs-overlay .igs-comic-group.is-measuring{visibility:hidden;}
#igs-overlay .igs-comic-svg{position:absolute;left:0;top:0;overflow:visible;pointer-events:none;}
#igs-overlay .igs-comic-ink{fill:var(--igs-comic-ink);stroke:var(--igs-comic-ink);stroke-width:calc(var(--igs-comic-line,2px) * 2);stroke-linejoin:round;}
#igs-overlay .igs-comic-paper{fill:var(--igs-comic-paper);}
#igs-overlay .igs-comic-shade{fill:rgba(0,0,0,.22);transform:translate(0,4px);}
#igs-overlay .igs-comic-group[data-shape="shout"] .igs-comic-ink{stroke-width:calc(var(--igs-comic-line,2px) * 3.2);stroke-linejoin:miter;stroke-miterlimit:10;}
#igs-overlay .igs-comic-group[data-tone="whisper"] .igs-comic-ink{fill:none;stroke-dasharray:calc(var(--igs-comic-line,2px) * 4) calc(var(--igs-comic-line,2px) * 3.4);stroke-width:calc(var(--igs-comic-line,2px) * 1.6);}
#igs-overlay .igs-comic-group[data-tone="dark"] .igs-comic-paper{fill:var(--igs-comic-ink);}
#igs-overlay .igs-comic-group[data-tone="dark"] .igs-comic-text{color:var(--igs-comic-paper);}

#igs-overlay .igs-comic-bubble{position:absolute;pointer-events:auto;cursor:pointer;}
#igs-overlay .igs-comic-text{font-size:var(--igs-comic-font,17px);line-height:1.5;letter-spacing:0;color:var(--igs-comic-text);font-family:var(--igs-comic-family,${SANS});font-weight:500;writing-mode:vertical-rl;text-orientation:mixed;white-space:nowrap;line-break:strict;text-align:start;text-shadow:none;-webkit-text-stroke:0;font-style:normal;}
#igs-overlay .igs-comic-text.is-h{writing-mode:horizontal-tb;white-space:normal;max-width:14em;line-height:1.45;text-align:center;text-wrap:balance;}
#igs-overlay .igs-comic-tcy{text-combine-upright:all;-webkit-text-combine:horizontal;}
#igs-overlay .igs-comic-text .igs-thought{font-style:normal;opacity:1;font-size:1em;color:inherit!important;}
#igs-overlay .igs-comic-group[data-shape="narration"] .igs-comic-text,#igs-overlay .igs-comic-group[data-tone="system"] .igs-comic-text{font-family:${SERIF};}
#igs-overlay .igs-comic-group[data-tone="shout"] .igs-comic-text{font-weight:900;}
#igs-overlay .igs-comic-group[data-tone="thought"] .igs-comic-text,#igs-overlay .igs-comic-group[data-tone="whisper"] .igs-comic-text{font-weight:400;}
#igs-overlay .igs-comic-name{position:absolute;transform:translate(-50%,-100%);padding:1px 8px;font-size:12px;line-height:18px;font-family:${SANS};letter-spacing:.08em;white-space:nowrap;color:var(--igs-comic-paper);background:var(--igs-comic-ink);border-radius:3px;pointer-events:none;}

@keyframes igs-comic-pop{0%{opacity:0;transform:scale(.55);}60%{opacity:1;transform:scale(1.05);}100%{opacity:1;transform:scale(1);}}
@keyframes igs-comic-burst{0%{opacity:0;transform:scale(1.55);}40%{opacity:1;transform:scale(.93);}68%{transform:scale(1.04);}100%{opacity:1;transform:scale(1);}}
@keyframes igs-comic-ink-in{0%{opacity:0;}100%{opacity:1;}}
@keyframes igs-comic-tremble{0%,100%{translate:0 0;}25%{translate:-1.2px .6px;}50%{translate:1.2px -.6px;}75%{translate:-.6px -1px;}}
#igs-overlay .igs-comic-b{transform-box:view-box;animation:igs-comic-pop .26s cubic-bezier(.2,.9,.3,1.2) var(--igs-comic-delay,0ms) both;}
#igs-overlay .igs-comic-group[data-tone="shout"] .igs-comic-b{animation-name:igs-comic-burst;animation-duration:.36s;}
#igs-overlay .igs-comic-bubble{animation:igs-comic-ink-in .18s ease-out calc(var(--igs-comic-delay,0ms) + 90ms) both;}
#igs-overlay .igs-comic-group[data-tone="fear"] .igs-comic-svg,#igs-overlay .igs-comic-group[data-tone="fear"] .igs-comic-bubble{animation:igs-comic-tremble .16s steps(2,end) 0s 9;}
#igs-overlay .igs-comic-group.is-revealed .igs-comic-b,#igs-overlay .igs-comic-group.is-revealed .igs-comic-bubble{animation:none!important;opacity:1;}
#igs-overlay .igs-comic-ghost{opacity:.4;transform:scale(.88);transition:opacity .25s ease,transform .25s ease;}
#igs-overlay .igs-comic-ghost .igs-comic-name{display:none;}
@media (prefers-reduced-motion: reduce){#igs-overlay .igs-comic-b,#igs-overlay .igs-comic-bubble,#igs-overlay .igs-comic-svg{animation:none!important;}}

${MONO} #igs-bg{filter:brightness(var(--igs-bg-brightness,1)) var(--igs-grade-bg,) grayscale(1) contrast(1.18);-webkit-filter:brightness(var(--igs-bg-brightness,1)) var(--igs-grade-bg,) grayscale(1) contrast(1.18);}
${MONO} #igs-bg-blur{filter:blur(40px) brightness(.55) grayscale(1);-webkit-filter:blur(40px) brightness(.55) grayscale(1);}
${MONO} #igs-sprite:not(.igs-sprite-editing),${MONO} .igs-sd-sprite-ghost{filter:var(--igs-sprite-dim,) var(--igs-grade-sprite,) var(--igs-sprite-enhance,) grayscale(1) contrast(1.12);-webkit-filter:var(--igs-sprite-dim,) var(--igs-grade-sprite,) var(--igs-sprite-enhance,) grayscale(1) contrast(1.12);}
${MONO} #igs-cast{filter:var(--igs-grade-sprite,) grayscale(1) contrast(1.12);-webkit-filter:var(--igs-grade-sprite,) grayscale(1) contrast(1.12);}
${MONO} .igs-grade-layer{filter:grayscale(1);}
${MONO} .igs-fx-cutin-face{filter:grayscale(1) contrast(1.15);}
${MONO} .igs-fx-symbol{--igs-fx-c:#161616;--igs-fx-pop:#161616;--igs-fx-ink:#161616;--igs-fx-paper:#fff;}
${MONO}{--igs-tfx-accent:#000;--igs-tfx-glow:#fff;}
#igs-comic-screen{position:absolute;inset:0;z-index:2;pointer-events:none;background-image:radial-gradient(circle,rgba(0,0,0,.5) .85px,transparent 1.2px);background-size:4px 4px;opacity:.3;}
#igs-overlay[data-igs-quality="low"] #igs-comic-screen{display:none;}
#igs-comic-frame{position:absolute;inset:0;z-index:4;pointer-events:none;--igs-comic-gut:7px;box-shadow:inset 0 0 0 var(--igs-comic-gut) var(--igs-comic-gutter,#fff),inset 0 0 0 calc(var(--igs-comic-gut) + 3px) var(--igs-comic-ink,#141414);}
@media (max-width:640px){#igs-comic-frame{--igs-comic-gut:4px;}}
${C} .igs-fx-cutin{border-color:var(--igs-comic-ink);border-width:4px;box-shadow:none;}

`;
