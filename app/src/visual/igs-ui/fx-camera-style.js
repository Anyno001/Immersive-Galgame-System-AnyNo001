const O = '#igs-overlay';
const S = '#igs-sprite:not(.igs-sprite-editing)';
const L = 'var(--igs-dfx-life)';
const C = '#10151a';
const LOW = `${O}[data-igs-quality="low"]`;

const SHOT_CSS = `
${O}[data-igs-sd-cam^="track-"][data-igs-sd-cam] #igs-bg{animation:igs-cm-track 5s cubic-bezier(.45,.05,.4,1) both;}
${O}[data-igs-sd-cam="track-left"][data-igs-sd-cam] #igs-bg{animation-direction:reverse;}
${O}[data-igs-sd-cam="track-right"][data-igs-sd-cam] ${S}{--igs-sd-tx:-16px;}
${O}[data-igs-sd-cam="track-left"][data-igs-sd-cam] ${S}{--igs-sd-tx:16px;}
${O}[data-igs-sd-cam="sink"][data-igs-sd-cam] #igs-bg{translate:0 4%;scale:1.1;transition:translate 1.2s ease,scale 1.2s ease,opacity .3s ease;}
${O}[data-igs-sd-cam="sink"][data-igs-sd-cam] ${S}{--igs-sd-ty:-3%;}
${O}[data-igs-sd-cam="rise"][data-igs-sd-cam] #igs-bg{translate:0 -3%;scale:1.06;transition:translate 1.2s ease,scale 1.2s ease,opacity .3s ease;}
${O}[data-igs-sd-cam="rise"][data-igs-sd-cam] ${S}{--igs-sd-ty:2%;}
${O}[data-igs-sd-cam="lookup"][data-igs-sd-cam] #igs-bg{translate:0 -6%;scale:1.1;transition:translate 1.2s ease,scale 1.2s ease,opacity .3s ease;}
${O}[data-igs-sd-cam="lookup"][data-igs-sd-cam] ${S}{--igs-sd-closeup-scale:1.12;--igs-sd-ty:3%;transform-origin:var(--igs-sd-origin-x,50%) 100%;}
${O}[data-igs-sd-cam="vertigo-far"][data-igs-sd-cam] #igs-bg{scale:1.28;animation:igs-cm-vertigo-far 1.6s cubic-bezier(.4,0,.2,1) both;}
${O}[data-igs-sd-cam="vertigo-near"][data-igs-sd-cam] #igs-bg{scale:1;animation:igs-cm-vertigo-near 1.6s cubic-bezier(.4,0,.2,1) both;}
${O}[data-igs-sd-cam^="vertigo-"][data-igs-sd-cam] ${S}{--igs-sd-closeup-scale:1;}
${O}[data-igs-sd-cam="pov"][data-igs-sd-cam] #igs-bg{scale:1.06;animation:igs-cm-pov 4s ease-in-out infinite;}
${O}[data-igs-sd-cam="pov"][data-igs-sd-cam] #igs-sprite,${O}[data-igs-sd-cam="pov"][data-igs-sd-cam] #igs-cast{visibility:hidden;}
${O}[data-igs-sd-cam="empty"][data-igs-sd-cam] #igs-bg{scale:1.04;}
${O}[data-igs-sd-cam="empty"][data-igs-sd-cam] #igs-sprite,${O}[data-igs-sd-cam="empty"][data-igs-sd-cam] #igs-cast{opacity:0;transition:opacity .6s ease;pointer-events:none;}
${O}[data-igs-sd-cam="empty"][data-igs-sd-cam] #igs-dialog-layer{opacity:0;pointer-events:none;transition:opacity .5s ease;}
${O}[data-igs-sd-cam="focus-front"][data-igs-sd-cam] ${S}{filter:var(--igs-sprite-dim,) blur(3px) var(--igs-grade-sprite,) var(--igs-sprite-enhance,);-webkit-filter:var(--igs-sprite-dim,) blur(3px) var(--igs-grade-sprite,) var(--igs-sprite-enhance,);transition:filter .8s ease;}
${O}[data-igs-sd-cam="slow"][data-igs-sd-cam] #igs-bg,${O}[data-igs-sd-cam-mod="slow"] #igs-bg{filter:brightness(var(--igs-bg-brightness,1)) saturate(.78) var(--igs-grade-bg,);-webkit-filter:brightness(var(--igs-bg-brightness,1)) saturate(.78) var(--igs-grade-bg,);transition:opacity .3s ease,scale 2.25s cubic-bezier(.3,.7,.2,1),translate 2.25s ease,filter 1.4s ease;}
${O}[data-igs-sd-cam="slow"][data-igs-sd-cam] ${S},${O}[data-igs-sd-cam-mod="slow"] ${S}{transition:translate 3s cubic-bezier(.3,.7,.2,1),filter 1.4s ease;}
${O}[data-igs-sd-cam="slow"][data-igs-sd-cam] #igs-stage-motion::before,${O}[data-igs-sd-cam="slow"][data-igs-sd-cam] #igs-stage-motion::after,${O}[data-igs-sd-cam-mod="slow"] #igs-stage-motion::before,${O}[data-igs-sd-cam-mod="slow"] #igs-stage-motion::after{content:"";position:absolute;left:0;right:0;height:9%;background:#000;z-index:1;pointer-events:none;animation:igs-cm-bar .7s ease both;}
${O}[data-igs-sd-cam="slow"][data-igs-sd-cam] #igs-stage-motion::before,${O}[data-igs-sd-cam-mod="slow"] #igs-stage-motion::before{top:0;transform-origin:50% 0;}
${O}[data-igs-sd-cam="slow"][data-igs-sd-cam] #igs-stage-motion::after,${O}[data-igs-sd-cam-mod="slow"] #igs-stage-motion::after{bottom:0;transform-origin:50% 100%;}
@keyframes igs-cm-track{0%{transform:scale(1.16) translateX(8%)}100%{transform:scale(1.16) translateX(-8%)}}
@keyframes igs-cm-vertigo-far{0%{scale:1}100%{scale:1.28}}
@keyframes igs-cm-vertigo-near{0%{scale:1.28}100%{scale:1}}
@keyframes igs-cm-pov{0%,100%{rotate:-.6deg;translate:-.3% 0}50%{rotate:.6deg;translate:.3% .2%}}
@keyframes igs-cm-bar{from{transform:scaleY(0)}to{transform:scaleY(1)}}
${LOW}[data-igs-sd-cam^="track-"] #igs-bg{animation:none;scale:1.14;}
${LOW}[data-igs-sd-cam^="vertigo-"] #igs-bg,${LOW}[data-igs-sd-cam="pov"] #igs-bg{animation:none;}
${LOW}[data-igs-sd-cam="slow"] #igs-bg,${LOW}[data-igs-sd-cam-mod="slow"] #igs-bg{filter:none;-webkit-filter:none;}
@media (prefers-reduced-motion: reduce){
${O}[data-igs-sd-cam^="vertigo-"] #igs-bg,${O}[data-igs-sd-cam="pov"] #igs-bg,${O}[data-igs-sd-cam^="track-"] #igs-bg{animation:none!important;}
${O}[data-igs-sd-cam-mod="slow"] #igs-stage-motion::before,${O}[data-igs-sd-cam-mod="slow"] #igs-stage-motion::after,${O}[data-igs-sd-cam="slow"] #igs-stage-motion::before,${O}[data-igs-sd-cam="slow"] #igs-stage-motion::after{animation:none;}
}
`;

const FRONT_CSS = `
${O} .igs-cm{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
${O} .igs-cm-fg{position:absolute;top:0;bottom:0;left:0;width:46%;background:linear-gradient(90deg,transparent,rgba(8,12,16,.12) 28%,rgba(8,12,16,.25) 50%,rgba(8,12,16,.12) 72%,transparent);animation:igs-cm-fg-r ${L} linear both;}
${O} .igs-cm-fg.is-left{animation-name:igs-cm-fg-l;}
@keyframes igs-cm-fg-r{0%{transform:translateX(-48%)}100%{transform:translateX(235%)}}
@keyframes igs-cm-fg-l{0%{transform:translateX(235%)}100%{transform:translateX(-48%)}}
${O} .igs-cm-peek{position:absolute;animation:igs-cm-peek ${L} ease both;}
${O} .igs-cm-peek.is-window{width:56%;height:66%;border-radius:14px;box-sizing:border-box;background:transparent;box-shadow:0 0 9px 2px rgba(0,0,0,.94),0 0 0 150vmax rgba(0,0,0,.94);}
${O} .igs-cm-peek.is-window.is-tl,${O} .igs-cm-peek.is-window.is-bl{left:10%;}
${O} .igs-cm-peek.is-window.is-tr,${O} .igs-cm-peek.is-window.is-br{left:34%;}
${O} .igs-cm-peek.is-window.is-tl,${O} .igs-cm-peek.is-window.is-tr{top:8%;}
${O} .igs-cm-peek.is-window.is-bl,${O} .igs-cm-peek.is-window.is-br{top:26%;}
${O} .igs-cm-door-slab{position:absolute;top:0;bottom:0;animation:igs-cm-peek ${L} ease both;}
${O} .igs-cm-door-slab.is-l{left:0;width:var(--a);background:linear-gradient(90deg,#000 calc(100% - 9px),transparent);}
${O} .igs-cm-door-slab.is-r{right:0;width:var(--b);background:linear-gradient(270deg,#000 calc(100% - 9px),transparent);}
${O} .igs-cm-flare-sweep{position:absolute;top:-10%;bottom:-10%;left:0;width:46%;background:linear-gradient(90deg,transparent,rgba(255,244,214,.62) 50%,transparent);transform:skewX(-14deg);animation:igs-cm-flare-r ${L} cubic-bezier(.4,0,.3,1) both;}
${O} .igs-cm-flare.is-left .igs-cm-flare-sweep{animation-name:igs-cm-flare-l;}
${O} .igs-cm-flare-core{position:absolute;top:8%;width:26%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,rgba(255,250,232,.9),rgba(255,236,190,.35) 40%,transparent 70%);animation:igs-cm-flare-core ${L} ease both;}
${O} .igs-cm-flare.is-right .igs-cm-flare-core{right:-6%;}
${O} .igs-cm-flare.is-left .igs-cm-flare-core{left:-6%;}
${O} .igs-cm-bokeh{position:absolute;left:var(--x);top:var(--y);width:var(--d);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,rgba(255,244,214,.34),rgba(255,238,196,.16) 62%,transparent 72%);animation:igs-cm-bokeh ${L} ease-in-out both;}
@keyframes igs-cm-flare-r{0%{transform:translateX(-120%) skewX(-14deg);opacity:0}15%{opacity:1}85%{opacity:1}100%{transform:translateX(260%) skewX(-14deg);opacity:0}}
@keyframes igs-cm-flare-l{0%{transform:translateX(260%) skewX(-14deg);opacity:0}15%{opacity:1}85%{opacity:1}100%{transform:translateX(-120%) skewX(-14deg);opacity:0}}
@keyframes igs-cm-flare-core{0%{opacity:0;transform:scale(.6)}30%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.3)}}
@keyframes igs-cm-bokeh{0%{opacity:0;transform:translate(0,0)}25%{opacity:1}100%{opacity:0;transform:translate(6vmin,-4vmin)}}
@keyframes igs-cm-peek{0%{opacity:0}16%{opacity:.96}84%{opacity:.96}100%{opacity:0}}
${O} .igs-cm-streak-line{position:absolute;left:0;width:var(--w);height:var(--h);top:var(--y);background:linear-gradient(90deg,transparent,var(--c),transparent);opacity:0;animation:igs-cm-streak-l var(--t) linear var(--d) infinite;}
${O} .igs-cm-streaks.is-left .igs-cm-streak-line{animation-name:igs-cm-streak-r;}
${O} .igs-cm-streaks{position:absolute;inset:0;animation:igs-cm-streak-wrap ${L} ease both;}
@keyframes igs-cm-streak-l{0%{transform:translateX(120vw);opacity:0}12%{opacity:.9}100%{transform:translateX(-80vw);opacity:0}}
@keyframes igs-cm-streak-r{0%{transform:translateX(-80vw);opacity:0}12%{opacity:.9}100%{transform:translateX(120vw);opacity:0}}
@keyframes igs-cm-streak-wrap{0%{opacity:0}12%{opacity:1}80%{opacity:1}100%{opacity:0}}
${O} .igs-cm-backdrop{position:absolute;inset:0;animation:igs-cm-fadeio ${L} ease both;}
${O} .igs-cm-backdrop.is-solid{background:linear-gradient(180deg,var(--c1,#ffd9e8),var(--c2,#fff3d6));}
${O} .igs-cm-backdrop.is-gloom{background:linear-gradient(180deg,#1b1d2a,#2c2a3a);}
${O} .igs-cm-backdrop.is-gloom::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(0,0,0,.34) 0 3px,transparent 3px 26px);animation:igs-cm-gloom 3.2s ease-in-out infinite alternate;}
${O} .igs-cm-backdrop.is-flowers{background:linear-gradient(180deg,#ffe4ee,#fff6f0);}
${O} .igs-cm-backdrop.is-sparkle{background:linear-gradient(180deg,#12183a,#34205c);}
${O} .igs-cm-backdrop.is-thunder{background:#0c0f1e;}
${O} .igs-cm-petal{position:absolute;left:var(--x);top:-8%;width:var(--s);height:var(--s);border-radius:50%;opacity:.7;background:var(--pc,#ff9fc0);animation:igs-cm-petal var(--t) linear var(--d) infinite;}
${O} .igs-cm-star{position:absolute;left:var(--x);top:var(--y);width:var(--s);height:var(--s);border-radius:50%;background:radial-gradient(circle,#fff6d0,rgba(255,246,208,.3) 45%,transparent 70%);animation:igs-cm-twinkle var(--t) ease-in-out var(--d) infinite;}
${O} .igs-cm-bolt{position:absolute;inset:0;animation:igs-cm-bolt ${L} steps(1,end) both;}
${O} .igs-cm-bolt::after{content:"";position:absolute;inset:0;background:#f4f8ff;animation:igs-cm-flash ${L} steps(1,end) both;}
@keyframes igs-cm-fadeio{0%{opacity:0}12%{opacity:.94}84%{opacity:.94}100%{opacity:0}}
@keyframes igs-cm-gloom{from{opacity:.4}to{opacity:.9}}
@keyframes igs-cm-petal{0%{transform:translate(0,0) rotate(0);opacity:0}10%{opacity:1}100%{transform:translate(-12vmin,118vh) rotate(260deg);opacity:1}}
@keyframes igs-cm-twinkle{0%,100%{opacity:.1;transform:scale(.5)}50%{opacity:1;transform:scale(1)}}
@keyframes igs-cm-bolt{0%{opacity:0}8%{opacity:1}14%{opacity:0}22%{opacity:1}30%{opacity:.8}60%{opacity:.8}100%{opacity:0}}
@keyframes igs-cm-flash{0%{opacity:.85}9%{opacity:0}20%{opacity:.6}28%{opacity:0}100%{opacity:0}}
`;

const COMBO_CSS = `
${O} .igs-cm-montage{position:absolute;inset:0;background:#f4f1ea;animation:igs-cm-montage ${L} ease both;}
${O} .igs-cm-cell{position:absolute;inset:0;overflow:hidden;opacity:0;animation:igs-cm-cell-in .25s ease calc(var(--i) * 250ms) both;}
${O} .igs-cm-cell-bg{position:absolute;inset:-6%;background-repeat:no-repeat;animation:igs-cm-cell-drift ${L} ease-out both;}
${O} .igs-cm-montage.is-n2 .igs-cm-cell:nth-child(1){clip-path:polygon(0 0,57% 0,43% 100%,0 100%);}
${O} .igs-cm-montage.is-n2 .igs-cm-cell:nth-child(2){clip-path:polygon(59% 0,100% 0,100% 100%,45% 100%);}
${O} .igs-cm-montage.is-n3 .igs-cm-cell:nth-child(1){clip-path:polygon(0 0,35% 0,29% 100%,0 100%);}
${O} .igs-cm-montage.is-n3 .igs-cm-cell:nth-child(2){clip-path:polygon(36.5% 0,67.5% 0,61.5% 100%,30.5% 100%);}
${O} .igs-cm-montage.is-n3 .igs-cm-cell:nth-child(3){clip-path:polygon(69% 0,100% 0,100% 100%,63% 100%);}
${O} .igs-cm-montage.is-n4 .igs-cm-cell:nth-child(1){clip-path:polygon(0 0,52% 0,48% 49%,0 49%);}
${O} .igs-cm-montage.is-n4 .igs-cm-cell:nth-child(2){clip-path:polygon(53.5% 0,100% 0,100% 49%,49.5% 49%);}
${O} .igs-cm-montage.is-n4 .igs-cm-cell:nth-child(3){clip-path:polygon(0 51%,50.5% 51%,46.5% 100%,0 100%);}
${O} .igs-cm-montage.is-n4 .igs-cm-cell:nth-child(4){clip-path:polygon(52% 51%,100% 51%,100% 100%,48% 100%);}
@keyframes igs-cm-montage{0%{opacity:0}6%{opacity:1}86%{opacity:1}100%{opacity:0}}
@keyframes igs-cm-cell-in{from{opacity:0;transform:scale(1.12)}to{opacity:1;transform:scale(1)}}
@keyframes igs-cm-cell-drift{from{transform:translate(0,0)}to{transform:translate(var(--dx,-2%),var(--dy,-1.5%))}}
${O} .igs-cm-tl-tint{position:absolute;inset:0;background:var(--tint,#ff9a4a);opacity:0;animation:igs-cm-tl-tint ${L} ease-in-out both;}
${O} .igs-cm-tl.is-dusk{--tint:rgba(255,128,52,.46);}
${O} .igs-cm-tl.is-night{--tint:rgba(14,22,66,.62);}
${O} .igs-cm-tl.is-dawn{--tint:rgba(255,186,170,.4);}
${O} .igs-cm-tl-tint{background:var(--tint);}
${O} .igs-cm-tl-cloud{position:absolute;left:-60%;width:60%;height:34%;top:var(--y);border-radius:50%;background:radial-gradient(ellipse,rgba(10,14,28,.34),transparent 70%);animation:igs-cm-tl-cloud calc(${L} * .7) linear var(--d) both;}
${O} .igs-cm-tl-band{position:absolute;top:-10%;bottom:-10%;left:0;width:30%;background:linear-gradient(90deg,transparent,rgba(255,236,190,.34),transparent);transform:skewX(-16deg);animation:igs-cm-tl-band calc(${L} * .45) ease-in-out both;}
@keyframes igs-cm-tl-tint{0%{opacity:0}55%{opacity:1}85%{opacity:1}100%{opacity:0}}
@keyframes igs-cm-tl-cloud{from{transform:translateX(0)}to{transform:translateX(320%)}}
@keyframes igs-cm-tl-band{0%{transform:translateX(-120%) skewX(-16deg);opacity:0}20%{opacity:1}100%{transform:translateX(420%) skewX(-16deg);opacity:0}}
${O} .igs-cm-split{position:absolute;inset:0;}
${O} .igs-cm-split-panel{position:absolute;inset:0;clip-path:polygon(60% 0,100% 0,100% 100%,46% 100%);background:#0d1018;animation:igs-cm-split ${L} cubic-bezier(.3,.8,.3,1) both;}
${O} .igs-cm-split-bg{position:absolute;inset:-8%;background-repeat:no-repeat;filter:hue-rotate(28deg) saturate(.85) brightness(.8);}
${O} .igs-cm-split-line{position:absolute;inset:0;clip-path:polygon(59.4% 0,60.6% 0,46.6% 100%,45.4% 100%);background:#fff;animation:igs-cm-split-line ${L} ease both;}
${O} .igs-cm-split-tag{position:absolute;right:6%;top:6%;padding:3px 12px;background:#0d1018;color:#fff;border:1px solid #fff;font-size:.85em;letter-spacing:.12em;animation:igs-cm-split-tag ${L} ease both;}
@keyframes igs-cm-split{0%{transform:translateX(100%)}12%{transform:translateX(0)}88%{transform:translateX(0)}100%{transform:translateX(100%)}}
@keyframes igs-cm-split-line{0%,8%{opacity:0}16%{opacity:1}86%{opacity:1}100%{opacity:0}}
@keyframes igs-cm-split-tag{0%,16%{opacity:0}28%{opacity:1}84%{opacity:1}100%{opacity:0}}
${O} .igs-cm-vignette{position:absolute;inset:-34%;background:radial-gradient(ellipse at 50% 50%,transparent 24%,rgba(4,6,10,.9) 62%);animation:igs-cm-vignette ${L} ease-in-out both;}
${O} .igs-cm-pulse{position:absolute;inset:0;box-shadow:inset 0 0 14vmin 2vmin rgba(150,16,24,.55);opacity:0;animation:igs-cm-pulse .8s ease-in-out infinite;}
${O} .igs-cm-flash{position:absolute;inset:0;background:#fff;opacity:0;animation:igs-cm-flash-once .5s ease-out var(--d) both;}
${O} .igs-cm-doorlight{position:absolute;left:50%;top:0;bottom:0;width:60%;margin-left:-30%;background:linear-gradient(90deg,transparent,rgba(255,236,196,.55) 30%,rgba(255,244,222,.8) 50%,rgba(255,236,196,.55) 70%,transparent);transform-origin:50% 50%;animation:igs-cm-doorlight ${L} cubic-bezier(.3,.7,.2,1) both;}
${O} .igs-cm-drain{position:absolute;inset:0;background:linear-gradient(to var(--to,left),rgba(0,0,0,.5),transparent 52%);animation:igs-cm-fadeio ${L} ease both;}
${O} .igs-cm-dapple{position:absolute;left:var(--x);top:var(--y);width:var(--d);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,rgba(255,244,200,.5),transparent 70%);animation:igs-cm-dapple 3.6s ease-in-out var(--t) infinite alternate;}
@keyframes igs-cm-vignette{0%{transform:scale(1.5);opacity:0}30%{opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes igs-cm-pulse{0%,100%{opacity:0}18%{opacity:.9}36%{opacity:.1}52%{opacity:.7}70%{opacity:0}}
@keyframes igs-cm-flash-once{0%{opacity:0}12%{opacity:1}100%{opacity:0}}
@keyframes igs-cm-doorlight{0%{opacity:0;transform:scaleX(.04)}22%{opacity:1;transform:scaleX(.35)}60%{opacity:.9;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1.3)}}
@keyframes igs-cm-dapple{from{transform:translate(0,0);opacity:.35}to{transform:translate(3vmin,2vmin);opacity:.8}}
${O} .igs-cm-sprite-hush{position:absolute;inset:0;}
`;

const AMBIENCE_CSS = `
/* 窗光打在墙上：四格窗格只做柔光斑，不能出现硬边方框（不用 filter:blur，手机上太贵）。 */
${O} .igs-dfx-amb.is-cmroom .igs-cm-win{left:6%;top:6%;width:34%;height:44%;display:grid;grid-template:1fr 1fr/1fr 1fr;gap:10px;transform:translateX(-4%);opacity:.8;animation:igs-cm-win 90s linear both;}
${O} .igs-dfx-amb.is-cmroom .igs-cm-win b{background:radial-gradient(ellipse at 50% 50%,rgba(255,240,204,.15),rgba(255,240,204,.06) 55%,transparent 78%);}
${O} .igs-dfx-amb.is-cmroom .igs-cm-shadow{left:0;right:0;bottom:0;height:30%;background:linear-gradient(0deg,rgba(24,18,30,.22),transparent);transform-origin:50% 100%;animation:igs-cm-shadow 90s linear both;}
${O} .igs-dfx-amb.is-cmroom .igs-cm-beam,${O} .igs-dfx-amb.is-cmroom .igs-cm-curtain{display:none;}
@keyframes igs-cm-win{from{transform:translateX(-4%)}to{transform:translateX(26%)}}
@keyframes igs-cm-shadow{from{transform:scaleY(.7)}to{transform:scaleY(1.3)}}
${O} .igs-cm-linger{position:absolute;inset:0;animation:igs-cm-fadeio ${L} ease both;}
${O} .igs-cm-linger-pane{position:absolute;left:12%;top:8%;width:30%;height:46%;display:grid;grid-template:1fr 1fr/1fr 1fr;gap:12px;animation:igs-cm-linger-pane ${L} linear both;}
${O} .igs-cm-linger-pane b{background:rgba(255,240,204,.26);}
${O} .igs-cm-linger-shadow{position:absolute;left:-10%;right:-10%;bottom:0;height:40%;background:linear-gradient(0deg,rgba(28,18,40,.38),transparent);transform-origin:0 100%;transform:skewX(-24deg);animation:igs-cm-linger-shadow ${L} linear both;}
${O} .igs-cm-linger-head{position:absolute;top:-10%;bottom:-10%;left:0;width:22%;background:linear-gradient(90deg,transparent,rgba(255,244,214,.5),transparent);transform:skewX(-30deg);animation:igs-cm-linger-head calc(${L} / 2) ease-in-out both;}
${O} .igs-cm-linger-curtain{position:absolute;top:0;left:0;width:22%;height:76%;background:linear-gradient(90deg,rgba(24,18,30,.34),rgba(24,18,30,.08));transform-origin:50% 0;animation:igs-cm-curtain 6s ease-in-out infinite alternate;}
@keyframes igs-cm-linger-pane{from{transform:translateX(0)}to{transform:translateX(38%)}}
@keyframes igs-cm-linger-shadow{from{transform:skewX(-24deg) scaleX(.6)}to{transform:skewX(-24deg) scaleX(1.4)}}
@keyframes igs-cm-linger-head{0%{transform:translateX(-150%) skewX(-30deg);opacity:0}30%{opacity:1}70%{opacity:1}100%{transform:translateX(560%) skewX(-30deg);opacity:0}}
@keyframes igs-cm-curtain{from{transform:skewX(-2.5deg)}to{transform:skewX(2.5deg)}}
`;

const QUIET_CSS = `
${LOW} .igs-cm-fg,${LOW} .igs-cm-bokeh,${LOW} .igs-cm-doorlight{filter:none;}
${LOW} .igs-cm-streak-line,${LOW} .igs-cm-petal,${LOW} .igs-cm-star,${LOW} .igs-cm-dapple,${LOW} .igs-cm-pulse,${LOW} .igs-cm-linger-curtain,${LOW} .igs-cm-backdrop.is-gloom::before,${LOW} .igs-cm-cell-bg,${LOW} .igs-dfx-amb.is-cmroom .igs-cm-win,${LOW} .igs-dfx-amb.is-cmroom .igs-cm-shadow,${LOW} .igs-cm-linger-pane,${LOW} .igs-cm-linger-shadow{animation:none!important;}
${LOW} .igs-cm-streak-line{opacity:.6;transform:translateX(var(--sx,10vw));}
${LOW} .igs-cm-star{opacity:.8;}
${LOW} .igs-cm-petal{opacity:.9;top:var(--sy,30%);}
${LOW} .igs-cm-dapple{opacity:.55;}
${LOW} .igs-cm-pulse{opacity:.3;}
${LOW} .igs-cm-linger-head{animation:none;opacity:.55;transform:translateX(120%) skewX(-30deg);}
${LOW} .igs-cm-flare-sweep{animation:igs-cm-fadeio ${L} ease both;transform:translateX(90%) skewX(-14deg);}
${LOW} .igs-cm-bokeh{animation:none;opacity:.5;}
${LOW} .igs-cm-tl-cloud,${LOW} .igs-cm-tl-band{display:none;}
${O} .igs-cm.is-reduced .igs-cm-streak-line,${O} .igs-cm.is-reduced .igs-cm-petal,${O} .igs-cm.is-reduced .igs-cm-star,${O} .igs-cm.is-reduced .igs-cm-dapple,${O} .igs-cm.is-reduced .igs-cm-pulse,${O} .igs-cm.is-reduced .igs-cm-linger-curtain,${O} .igs-cm.is-reduced .igs-cm-cell-bg,${O} .igs-cm.is-reduced .igs-cm-backdrop::before,${O} .igs-cm.is-reduced .igs-cm-linger-pane,${O} .igs-cm.is-reduced .igs-cm-linger-shadow{animation:none!important;}
${O} .igs-cm.is-reduced .igs-cm-streak-line{opacity:.55;transform:translateX(10vw);}
${O} .igs-cm.is-reduced .igs-cm-petal{opacity:.9;top:var(--sy,30%);}
${O} .igs-cm.is-reduced .igs-cm-star{opacity:.8;}
${O} .igs-cm.is-reduced .igs-cm-dapple{opacity:.55;}
${O} .igs-cm.is-reduced .igs-cm-pulse{opacity:.3;}
${O} .igs-cm.is-reduced .igs-cm-cell{animation:none;opacity:1;}
${O} .igs-cm.is-reduced .igs-cm-tl-cloud,${O} .igs-cm.is-reduced .igs-cm-tl-band,${O} .igs-cm.is-reduced .igs-cm-flare-sweep,${O} .igs-cm.is-reduced .igs-cm-bokeh,${O} .igs-cm.is-reduced .igs-cm-doorlight,${O} .igs-cm.is-reduced .igs-cm-bolt{display:none;}
${O} .igs-cm.is-reduced .igs-cm-fg{display:none;}
${O} .igs-cm.is-reduced .igs-cm-vignette{animation:none;transform:none;}
${O} .igs-cm.is-reduced .igs-cm-peek,${O} .igs-cm.is-reduced .igs-cm-door-slab{animation:none;opacity:.96;}
${O} .igs-cm.is-reduced .igs-cm-backdrop{animation:none;opacity:.9;}
${O} .igs-cm.is-reduced .igs-cm-streaks{animation:none;opacity:1;}
${O} .igs-cm.is-reduced .igs-cm-linger{animation:none;opacity:.9;}
${O} .igs-cm.is-reduced .igs-cm-montage,${O} .igs-cm.is-reduced.igs-cm-montage{animation:none;opacity:1;}
${O} .igs-cm.is-reduced .igs-cm-linger-head{animation:none;opacity:.55;transform:translateX(120%) skewX(-30deg);}
`;

export const CAMERA_STYLE_TEXT = `${SHOT_CSS}${FRONT_CSS}${COMBO_CSS}${AMBIENCE_CSS}${QUIET_CSS}`;
