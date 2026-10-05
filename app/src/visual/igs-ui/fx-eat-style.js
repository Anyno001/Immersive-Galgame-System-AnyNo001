// 进食演出样式：进食漫画符号的固有色与分拍动画、拟声贴纸字、立绘小动作、物品卡「吃掉 / 喝掉」。
// 立绘动作只叠加 translate 位移，并沿用舞台调度写好的 --igs-sd-* 变量，不打断特写与镜头的缩放、位移。
const SPRITE = '#igs-overlay #igs-stage-motion[data-igs-fx-eat="%"] #igs-sprite:not(.igs-sprite-editing)';
const at = (motion) => SPRITE.replace('%', motion);
const BASE_X = 'calc(var(--igs-sd-tx,0px) + var(--igs-rm-dx,0%))';
const shift = (dx, dy) => `translate:calc(${BASE_X} + ${dx}px) calc(var(--igs-sd-ty,0px) + ${dy}px);`;

export const EAT_FX_STYLE_TEXT = `
.igs-fx-symbol[data-kind="drool"]{--igs-fx-hue:#6fc8ff;}
.igs-fx-symbol[data-kind="chomp"]{--igs-fx-hue:#ff8a3d;}
.igs-fx-symbol[data-kind="munch"]{--igs-fx-hue:#ffad3b;}
.igs-fx-symbol[data-kind="gulp"]{--igs-fx-hue:#5fb8ff;}
.igs-fx-symbol[data-kind="bloom"]{--igs-fx-hue:#ff8fb8;}
.igs-fx-symbol[data-kind="blush"]{--igs-fx-hue:#ff6f91;}
.igs-fx-symbol[data-kind="spicy"]{--igs-fx-hue:#ff4a2b;}
.igs-fx-symbol[data-kind="steam"]{--igs-fx-hue:#e9eff6;--igs-fx-ink:color-mix(in oklab,var(--igs-fx-c) 30%,#2a3340);}
.igs-fx-symbol[data-kind="sour"]{--igs-fx-hue:#9ccf3a;}
.igs-fx-symbol[data-kind="aah"]{--igs-fx-hue:#ff6fa5;}
.igs-fx-symbol[data-kind="full"]{--igs-fx-hue:#ffc46b;}
.igs-fx-symbol[data-kind="bubbles"]{--igs-fx-hue:#7fd3ff;}
.igs-fx-symbol[data-kind="blush"],.igs-fx-symbol[data-kind="sour"]{z-index:0;}
.igs-fx-svg .igs-fx-drool{transform-origin:50% 0;animation:igs-fx-eat-drip .6s ease-out both;}
.igs-fx-svg .igs-fx-drool-line{animation:igs-fx-part-blink .4s ease-out both;}
.igs-fx-svg .igs-fx-jaw-top{animation:igs-fx-eat-jaw-top .32s cubic-bezier(.3,1.6,.5,1) both;}
.igs-fx-svg .igs-fx-jaw-bottom{animation:igs-fx-eat-jaw-bottom .32s cubic-bezier(.3,1.6,.5,1) both;}
.igs-fx-svg .igs-fx-munch-a,.igs-fx-svg .igs-fx-munch-b{transform-origin:0 50%;animation:igs-fx-eat-munch .36s ease-in-out 3;}
.igs-fx-svg .igs-fx-munch-b{animation-delay:.08s;}
.igs-fx-svg .igs-fx-crumb-a{animation:igs-fx-eat-crumb .7s ease-in .2s both;}
.igs-fx-svg .igs-fx-crumb-b{animation:igs-fx-eat-crumb .7s ease-in .5s both;}
.igs-fx-svg .igs-fx-gulp{animation:igs-fx-part-slide .45s ease-in both;}
.igs-fx-svg .igs-fx-bloom-main{animation:igs-fx-eat-bloom .7s cubic-bezier(.3,1.5,.5,1) both;}
.igs-fx-svg .igs-fx-bloom-b{animation:igs-fx-eat-bloom .6s cubic-bezier(.3,1.5,.5,1) .2s both;}
.igs-fx-svg .igs-fx-bloom-c{animation:igs-fx-eat-bloom .6s cubic-bezier(.3,1.5,.5,1) .35s both;}
.igs-fx-svg .igs-fx-bloom-core{fill:#ffe066;stroke:var(--igs-fx-ink);}
.igs-fx-svg .igs-fx-blush{animation:igs-fx-eat-fade .35s ease-out both;}
.igs-fx-svg .igs-fx-spicy-flame{transform-origin:50% 100%;animation:igs-fx-part-flicker .18s ease-in-out 6 alternate;}
.igs-fx-svg .igs-fx-steam-a{animation:igs-fx-eat-rise .9s ease-out both;}
.igs-fx-svg .igs-fx-steam-b{animation:igs-fx-eat-rise .9s ease-out .15s both;}
.igs-fx-svg .igs-fx-steam-c{animation:igs-fx-eat-rise .9s ease-out .3s both;}
.igs-fx-svg .igs-fx-sour-a,.igs-fx-svg .igs-fx-sour-b,.igs-fx-svg .igs-fx-sour-c{animation:igs-fx-eat-jitter .16s linear 5;}
.igs-fx-svg .igs-fx-sour-b{animation-delay:.05s;}
.igs-fx-svg .igs-fx-aah{transform-origin:30% 100%;animation:igs-fx-part-pop .3s ease-out both,igs-fx-part-sway .6s ease-in-out .3s 2;}
.igs-fx-svg .igs-fx-aah-text{fill:var(--igs-fx-c);stroke:var(--igs-fx-paper);stroke-width:3;paint-order:stroke;font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;}
.igs-fx-svg .igs-fx-bub-a{animation:igs-fx-part-float .8s ease-out both;}
.igs-fx-svg .igs-fx-bub-b{animation:igs-fx-part-float .8s ease-out .25s both;}
.igs-fx-svg .igs-fx-bub-c{animation:igs-fx-part-float .8s ease-out .5s both;}
/* 拟声字：跟符号同款的白描边贴纸字，斜贴在符号外侧；符号翻到左边时字也换到左边 */
.igs-fx-onoma{position:absolute;left:72%;top:-22%;white-space:nowrap;font:900 max(13px,calc(var(--igs-fx-size) * .38))/1 "PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;letter-spacing:.02em;color:var(--igs-fx-c);-webkit-text-stroke:max(3px,calc(var(--igs-fx-size) * .08)) var(--igs-fx-rim-c);paint-order:stroke fill;filter:drop-shadow(0 1px 0 var(--igs-fx-ink));transform:rotate(-10deg);animation:igs-fx-eat-onoma .32s cubic-bezier(.3,1.6,.5,1) .06s both;pointer-events:none;}
.igs-fx-symbol[data-flip] .igs-fx-onoma{left:auto;right:72%;transform:rotate(10deg);}
.igs-fx-symbol[data-kind="blush"] .igs-fx-onoma,.igs-fx-symbol[data-kind="sour"] .igs-fx-onoma{left:86%;top:-10%;}
.igs-fx-symbol[data-kind="steam"] .igs-fx-onoma,.igs-fx-symbol[data-kind="full"] .igs-fx-onoma{color:var(--igs-fx-ink);}
#igs-overlay[data-igs-dialog-skin="black-white-manga"] .igs-fx-onoma{color:#161616;}
${at('bite')}{animation:igs-fx-eat-bite .4s ease-out both;}
${at('chew')}{animation:igs-fx-eat-chew .36s ease-in-out 3;}
${at('hop')}{animation:igs-fx-eat-hop .52s ease-out both;}
${at('shake')}{animation:igs-fx-eat-shake .48s linear both;}
${at('dip')}{animation:igs-fx-eat-dip .76s ease-in-out both;}
${at('sway')}{animation:igs-fx-eat-sway .65s ease-in-out 2;}
@keyframes igs-fx-eat-bite{0%,100%{${shift(0, 0)}}35%{${shift(0, 9)}}}
@keyframes igs-fx-eat-chew{0%,100%{${shift(0, 0)}}50%{${shift(0, 5)}}}
@keyframes igs-fx-eat-hop{0%,100%{${shift(0, 0)}}40%{${shift(0, -12)}}70%{${shift(0, 2)}}}
@keyframes igs-fx-eat-shake{0%,100%{${shift(0, 0)}}20%{${shift(-6, 0)}}40%{${shift(6, 0)}}60%{${shift(-4, 0)}}80%{${shift(4, 0)}}}
@keyframes igs-fx-eat-dip{0%,100%{${shift(0, 0)}}45%{${shift(0, 10)}}}
@keyframes igs-fx-eat-sway{0%,100%{${shift(0, 0)}}30%{${shift(-5, 0)}}70%{${shift(5, 0)}}}
@keyframes igs-fx-eat-drip{0%{transform:scaleY(.2);opacity:0;}60%{transform:scaleY(1.15);opacity:1;}100%{transform:scaleY(1);}}
@keyframes igs-fx-eat-jaw-top{0%{transform:translateY(-12px);}100%{transform:none;}}
@keyframes igs-fx-eat-jaw-bottom{0%{transform:translateY(12px);}100%{transform:none;}}
@keyframes igs-fx-eat-munch{0%,100%{transform:scaleX(1);}50%{transform:scaleX(1.35);}}
@keyframes igs-fx-eat-crumb{0%{transform:none;opacity:1;}100%{transform:translate(4px,22px);opacity:0;}}
@keyframes igs-fx-eat-bloom{0%{transform:scale(0) rotate(-40deg);opacity:0;}100%{transform:none;opacity:1;}}
@keyframes igs-fx-eat-fade{from{opacity:0;}to{opacity:1;}}
@keyframes igs-fx-eat-rise{0%{transform:translateY(10px);opacity:0;}40%{opacity:1;}100%{transform:translateY(-10px);opacity:.2;}}
@keyframes igs-fx-eat-jitter{0%,100%{transform:none;}25%{transform:translate(-1.5px,1px);}75%{transform:translate(1.5px,-1px);}}
@keyframes igs-fx-eat-onoma{0%{opacity:0;scale:1.6;}100%{opacity:1;scale:1;}}
/* 物品卡：吃掉——图标被咬两口、掉碎屑；喝掉——杯子倾斜、冒两颗气泡 */
@property --igs-item-bite-a{syntax:"<percentage>";inherits:false;initial-value:0%;}
@property --igs-item-bite-b{syntax:"<percentage>";inherits:false;initial-value:0%;}
.igs-fx-item-card[data-igs-item-action="eat"] .igs-fx-item-icon{-webkit-mask:radial-gradient(circle at 96% 6%,transparent var(--igs-item-bite-a),#000 calc(var(--igs-item-bite-a) + 1%)),radial-gradient(circle at 74% -4%,transparent var(--igs-item-bite-b),#000 calc(var(--igs-item-bite-b) + 1%));-webkit-mask-composite:source-in;mask:radial-gradient(circle at 96% 6%,transparent var(--igs-item-bite-a),#000 calc(var(--igs-item-bite-a) + 1%)),radial-gradient(circle at 74% -4%,transparent var(--igs-item-bite-b),#000 calc(var(--igs-item-bite-b) + 1%));mask-composite:intersect;animation:igs-fx-item-bite 1.1s steps(1,end) .25s both;}
.igs-fx-item-card[data-igs-item-action="eat"] .igs-fx-item-action::after{content:"";position:absolute;left:52px;top:40px;width:4px;height:4px;border-radius:50%;background:var(--igs-item-accent-c);box-shadow:6px 4px 0 -1px var(--igs-item-accent-c),-5px 7px 0 -1px var(--igs-item-accent-c);opacity:0;pointer-events:none;animation:igs-fx-item-crumbs .8s ease-in .5s both;}
.igs-fx-item-card[data-igs-item-action="drink"] .igs-fx-item-icon{transform-origin:70% 80%;animation:igs-fx-item-tilt 1.1s ease-in-out .2s both;}
.igs-fx-item-card[data-igs-item-action="drink"] .igs-fx-item-icon::after{content:"";position:absolute;left:30%;top:30%;width:7px;height:7px;border-radius:50%;border:1.5px solid currentColor;box-shadow:9px -8px 0 -2px currentColor;opacity:0;animation:igs-fx-item-sip 1s ease-out .5s both;pointer-events:none;}
.igs-fx-item-card[data-igs-item-action="eat"][data-igs-leaving],.igs-fx-item-card[data-igs-item-action="drink"][data-igs-leaving]{animation-name:igs-fx-item-out-shrink;}
@keyframes igs-fx-item-bite{0%{--igs-item-bite-a:0%;--igs-item-bite-b:0%;}35%{--igs-item-bite-a:24%;--igs-item-bite-b:0%;}70%,100%{--igs-item-bite-a:24%;--igs-item-bite-b:20%;}}
@keyframes igs-fx-item-crumbs{0%{opacity:1;transform:none;}100%{opacity:0;transform:translateY(14px);}}
@keyframes igs-fx-item-tilt{0%,100%{transform:none;}30%,70%{transform:rotate(-28deg);}}
@keyframes igs-fx-item-sip{0%{opacity:0;transform:none;}30%{opacity:1;}100%{opacity:0;transform:translateY(-14px);}}
@media (prefers-reduced-motion: reduce){.igs-fx-onoma,[data-igs-fx-eat] #igs-sprite{animation:none!important;}}
`;
