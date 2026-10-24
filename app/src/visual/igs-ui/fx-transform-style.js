// 立绘变形层样式。装饰一律实色；动画只用 transform / opacity；低画质与减少动态效果时去掉扫描、波纹与模糊。

const O = '#igs-overlay';
const Q = `${O}[data-igs-quality="low"]`;

export const TRANSFORM_STYLE_TEXT = `${O} .igs-xf{position:absolute;inset:0;pointer-events:none;animation:igs-xf-life var(--igs-dfx-life,3000ms) ease both;}
@keyframes igs-xf-life{0%{opacity:0}9%{opacity:1}86%{opacity:1}100%{opacity:0}}
@keyframes igs-xf-pop{0%{opacity:0;transform:translateY(14px) scale(.92)}100%{opacity:1;transform:none}}
@keyframes igs-xf-fadein{0%{opacity:0}100%{opacity:1}}
@keyframes igs-xf-sheen{0%,20%{transform:translateX(-120%) skewX(-16deg)}65%,100%{transform:translateX(330%) skewX(-16deg)}}
${O} .igs-xf-card{position:absolute;left:var(--xf-x);top:var(--xf-y);width:var(--xf-w);aspect-ratio:var(--xf-ar);box-sizing:border-box;animation:igs-xf-pop .55s cubic-bezier(.2,.9,.3,1.12) both;}
${O} .igs-xf-view{position:absolute;overflow:hidden;}
${O} .igs-xf .igs-clone-sprite{background-repeat:no-repeat;}
${O} .igs-xf-sheen{position:absolute;top:-30%;left:0;width:45%;height:160%;background:linear-gradient(100deg,transparent,#ffffffc0 50%,transparent);animation:igs-xf-sheen var(--igs-dfx-life,3000ms) ease-out both;}
${O} .igs-xf-bg{position:absolute;inset:0;background-repeat:no-repeat;background-size:cover;}

${O} .igs-xf-mirror .igs-xf-card{--xf-fa:#d9c07a;--xf-fb:#a07f3c;--xf-fc:#5f4620;background:#15130f;border:1.5px solid var(--xf-fb);border-radius:999px 999px 8px 8px;box-shadow:0 6px 18px #00000040;}
${O} .igs-xf-mirror .igs-xf-card.is-round{border-radius:50%;--xf-fb:#a8854e;}
${O} .igs-xf-mirror .igs-xf-view{border-radius:999px 999px 5px 5px;box-shadow:inset 0 0 22px 6px rgba(0,0,0,0.28);}
${O} .igs-xf-mirror .is-round .igs-xf-view{border-radius:50%;box-shadow:inset 0 0 18px 5px rgba(0,0,0,0.24);}
${O} .igs-xf-mirror.is-horror .igs-xf-card{--xf-fa:#4a4a4e;--xf-fb:#26262a;--xf-fc:#0e0e10;}
${O} .igs-xf-mirror.is-horror .igs-xf-view{box-shadow:inset 0 0 22px 6px rgba(0,0,0,0.38);}
${O} .igs-xf-mirror.is-scifi .igs-xf-card{--xf-fa:#cfd8e3;--xf-fb:#8996a8;--xf-fc:#505b6b;}
${O} .igs-xf-mirror.is-magic .igs-xf-card,${O} .igs-xf-mirror.is-fantasy .igs-xf-card{--xf-fa:#e0c47a;--xf-fb:#9a6fd6;--xf-fc:#4a2d82;}

${O} .igs-xf-reflect.is-window .igs-xf-card{background:#1b2230;border-radius:8px;border:1px solid #ffffff22;box-shadow:0 6px 18px #00000040;}
${O} .igs-xf-reflect.is-window .igs-xf-view{border-radius:6px;box-shadow:inset 0 0 18px 5px rgba(0,0,0,0.35);}
${O} .igs-xf-streak{position:absolute;left:-30%;width:60%;height:2px;background:linear-gradient(90deg,transparent,#ffffffa0,transparent);animation:igs-xf-streak 1.6s linear infinite;}
@keyframes igs-xf-streak{from{transform:translateX(0)}to{transform:translateX(260%)}}
${O} .igs-xf-reflect.is-water .igs-xf-card{border-radius:50%;background:#10283a;border:1.5px solid #5b8aa3;box-shadow:0 6px 18px #00000040;}
${O} .igs-xf-reflect.is-water .igs-xf-view{border-radius:50%;box-shadow:inset 0 0 24px 8px rgba(0,0,0,0.32);}
${O} .igs-xf-flipwrap{position:absolute;inset:0;transform:scaleY(-1);animation:igs-xf-wobble 2.6s ease-in-out infinite;}
@keyframes igs-xf-wobble{0%,100%{transform:scaleY(-1) skewX(0deg)}50%{transform:scaleY(-1) skewX(1.4deg)}}
${O} .igs-xf-deep{position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,#1b4560 100%);}
${O} .igs-xf-ripple{position:absolute;left:50%;top:50%;width:46%;aspect-ratio:2/1;border:1px solid #cfe9f5;border-radius:50%;transform:translate(-50%,-50%) scale(.3);opacity:0;animation:igs-xf-ripple 2.4s ease-out infinite;}
${O} .igs-xf-ripple.is-b{animation-delay:1.2s;}
@keyframes igs-xf-ripple{0%{opacity:.8;transform:translate(-50%,-50%) scale(.3)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.5)}}

${O} .igs-xf-silhouette.is-glass .igs-xf-card{background:#9aa7b5;border-radius:8px;border:1px solid #ffffff33;box-shadow:0 6px 18px #00000040;}
${O} .igs-xf-silhouette.is-glass .igs-xf-view{border-radius:5px;box-shadow:inset 0 0 18px 5px rgba(255,255,255,0.18);}
${O} .igs-xf-drops{position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 11%,#ffffff55 11% 12%,transparent 12% 23%);}
${O} .igs-xf-fog{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 40%,#ffffff66,transparent 72%);}
${O} .igs-xf-silhouette.is-back .igs-xf-glow{position:absolute;inset:0;background:radial-gradient(ellipse 36% 72% at var(--xf-gx,50%) 62%,#ffe7b0e6,#ffc77a55 55%,transparent 82%);animation:igs-xf-fadein 1s ease both;}
${O} .igs-xf-silhouette.is-back .igs-clone-sprite{animation:igs-xf-fadein .6s ease both;}

${O} .igs-xf-frame.is-monitor .igs-xf-card{background:#14161b;border:1px solid #3a3f49;border-radius:4px;box-shadow:0 6px 18px #00000055;}
${O} .igs-xf-frame.is-monitor .igs-xf-view{background:#07090c;animation:igs-xf-flicker .5s steps(2) 1;}
@keyframes igs-xf-flicker{0%{opacity:.2}50%{opacity:1}100%{opacity:.7}}
${O} .igs-xf-scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,#00000030 0 1px,transparent 1px 3px);}
${O} .igs-xf-rec{position:absolute;left:5%;top:6%;font:700 clamp(10px,1.5vmin,13px)/1 "Courier New",monospace;color:#ff5a5a;letter-spacing:.1em;}
${O} .igs-xf-rec i{display:inline-block;width:.7em;height:.7em;border-radius:50%;background:#ff3030;margin-right:.4em;animation:igs-xf-blink 1.2s steps(1) infinite;}
@keyframes igs-xf-blink{0%{opacity:1}50%{opacity:0}}
${O} .igs-xf-cam{position:absolute;right:5%;top:6%;font:700 clamp(10px,1.5vmin,13px)/1 "Courier New",monospace;color:#d8e0e8;letter-spacing:.1em;}
${O} .igs-xf-frame.is-holo .igs-xf-card{border:1px solid #4fe3ff;background:#061a26;box-shadow:0 0 14px #4fe3ff66;}
${O} .igs-xf-frame.is-holo .igs-xf-view{background:#061a26;}
${O} .igs-xf-corner{position:absolute;width:12%;aspect-ratio:1/1;border:2px solid #4fe3ff;}
${O} .igs-xf-corner.is-tl{left:-1px;top:-1px;border-right:0;border-bottom:0;}
${O} .igs-xf-corner.is-tr{right:-1px;top:-1px;border-left:0;border-bottom:0;}
${O} .igs-xf-corner.is-bl{left:-1px;bottom:-1px;border-right:0;border-top:0;}
${O} .igs-xf-corner.is-br{right:-1px;bottom:-1px;border-left:0;border-top:0;}
${O} .igs-xf-base{position:absolute;left:8%;right:8%;bottom:-5%;height:7%;border-radius:50%;border:2px solid #4fe3ff;box-shadow:0 0 12px #4fe3ff;}
${O} .igs-xf-sweep{position:absolute;left:0;right:0;height:14%;background:linear-gradient(180deg,transparent,#4fe3ff66,transparent);top:-14%;animation:igs-xf-sweep 2.2s linear infinite;will-change:transform;}
@keyframes igs-xf-sweep{from{transform:translate3d(0,0,0)}to{transform:translate3d(0,814.3%,0)}}
${O} .igs-xf-frame.is-memory .igs-xf-card{background:#e9dfca;border:1px solid #ffffff55;border-radius:10px;box-shadow:0 6px 18px #00000040;}
${O} .igs-xf-frame.is-memory .igs-xf-view{border-radius:6px;background:#d8c9a8;box-shadow:inset 0 0 22px 4px #3b2a1888;}

${O} .igs-xf-zoom .igs-xf-card{border:1px solid #ffffffcc;border-radius:6px;background:#000000;box-shadow:0 6px 18px #00000055;}
${O} .igs-xf-zoom .igs-xf-view{border-radius:5px;}
${O} .igs-xf-zoomwrap{position:absolute;inset:0;animation:igs-xf-zoomin var(--igs-dfx-life,3000ms) ease-out both;}
@keyframes igs-xf-zoomin{from{transform:scale(1)}to{transform:scale(1.1)}}
${O} .igs-xf-ring{position:absolute;inset:-7px;border:1px solid #ffffff99;border-radius:9px;animation:igs-xf-ring 1.1s ease-out 1 both;}
@keyframes igs-xf-ring{0%{opacity:.9;transform:scale(.9)}100%{opacity:0;transform:scale(1.08)}}
${O} .igs-xf-chip{position:absolute;left:8%;bottom:7%;padding:2px 9px;border-radius:999px;background:#14141bcc;color:#ffffff;font:700 clamp(10px,1.7vmin,14px)/1.4 "Source Han Sans CN","PingFang SC",sans-serif;letter-spacing:.2em;text-indent:.2em;}

${O} .igs-xf-ghostwrap{position:absolute;inset:0;opacity:.5;mix-blend-mode:screen;animation:igs-xf-ghost .9s steps(6,end) both;}
${O} .igs-xf-ghostwrap.is-b{animation-name:igs-xf-ghost-b;}
@keyframes igs-xf-ghost{0%{opacity:0;transform:translateX(0)}20%{opacity:.6;transform:translateX(1.4%)}55%{opacity:.5;transform:translateX(-.9%)}100%{opacity:0;transform:translateX(0)}}
@keyframes igs-xf-ghost-b{0%{opacity:0;transform:translateX(0)}20%{opacity:.6;transform:translateX(-1.4%)}55%{opacity:.5;transform:translateX(.9%)}100%{opacity:0;transform:translateX(0)}}
${O} .igs-xf-warp.is-horror .igs-xf-ghostwrap{opacity:.75;}
${O} .igs-xf-pressure{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%,transparent 45%,#000000aa 100%);}
${O} .igs-xf-eyepatch{position:absolute;aspect-ratio:2/1;border-radius:50%;background:#050508;box-shadow:0 0 .8vmin 2px #050508;transform:translate(-50%,-50%);animation:igs-xf-fadein .5s ease both;}

${O} .igs-xf-patch{position:absolute;transform:translate(-50%,-50%);animation:igs-xf-fadein .6s ease both;}
${O} .igs-xf-patch svg{display:block;width:100%;height:100%;overflow:visible;}
${O} .igs-xf-patch.is-blush{aspect-ratio:5/3;background:radial-gradient(ellipse,#ff6f8fcc,#ff6f8f00 70%);}
${O} .igs-xf-patch.is-kiss,${O} .igs-xf-patch.is-bite{aspect-ratio:1/1;--igs-fx-c:#e0456f;--igs-fx-ink:#3a1020;--igs-fx-rim-c:#fff;}
${O} .igs-xf-patch.is-kiss{transform:translate(-50%,-50%) rotate(-16deg);}
${O} .igs-xf-patch.is-bite .igs-fx-fill{fill:#f0a4b0;}
${O} .igs-xf-patch.is-kiss .igs-fx-lips .igs-fx-fill{fill:#e0456f;}
${O} .igs-xf-patch.is-sigil{aspect-ratio:1/1;}
${O} .igs-xf-patch.is-sigil svg{filter:drop-shadow(0 0 4px #ffd36a);animation:igs-xf-pulse 1.4s ease-in-out 2;}
${O} .igs-xf-patch.is-bruise{aspect-ratio:3/2;background:radial-gradient(ellipse,#5d4a8acc,#8a6a3a66 55%,transparent 75%);}
@keyframes igs-xf-pulse{0%,100%{opacity:.55}50%{opacity:1}}

${O} .igs-xf-ghostrise{position:absolute;inset:0;opacity:.55;transform:translateY(-6%);animation:igs-xf-rise calc(var(--igs-dfx-life,3000ms) * .8) ease-in-out both;}
${O} .igs-xf-ghostrise.is-b{opacity:.3;transform:translateY(-3%);animation-delay:.35s;}
@keyframes igs-xf-rise{0%{opacity:0;transform:translateY(0) scale(1)}25%{opacity:.7}100%{opacity:0;transform:translateY(-12%) scale(1.04)}}
${O} .igs-xf-spirit-ring{position:absolute;width:20%;aspect-ratio:3/1;transform:translate(-50%,-50%);border-radius:50%;border:2px solid #bfe6ff;box-shadow:0 0 14px #bfe6ff;animation:igs-xf-fadein .8s ease both;}


${O} .igs-xf.is-reduced,${O} .igs-xf.is-reduced *{animation:none!important;}
${Q} .igs-xf-ripple,${Q} .igs-xf-streak,${Q} .igs-xf-sweep,${Q} .igs-xf-scan,${Q} .igs-xf-sheen{display:none;}
${Q} .igs-xf-flipwrap,${Q} .igs-xf-zoomwrap,${Q} .igs-xf-rec i{animation:none;}
${Q} .igs-xf-ghostwrap{mix-blend-mode:normal;}
`;
