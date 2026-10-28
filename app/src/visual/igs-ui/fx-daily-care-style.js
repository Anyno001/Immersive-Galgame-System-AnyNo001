// 体贴动作与吐气泡演出的样式（并入 DAILY_FX_STYLE_TEXT）：开门礼让、护在身前、贴心照料、公主抱、吐气泡。全部实色；动作字样做成小牌；减少动态效果下直接可见。
export const CARE_FX_STYLE_TEXT = `
#igs-overlay .igs-dfx-opendoor,#igs-overlay .igs-dfx-shield,#igs-overlay .igs-dfx-tend,#igs-overlay .igs-dfx-carry,#igs-overlay .igs-dfx-bubble{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-care-card{position:absolute;transform:translateX(-50%);padding:4px 14px;border-radius:999px;background:rgba(36,26,16,.8);color:#eddfc0;font:400 clamp(12px,2vmin,15px)/1.3 "Source Han Serif CN","Songti SC",serif;white-space:nowrap;animation:igs-dfx-cr-card calc(var(--igs-dfx-life) * .5) ease-out calc(var(--igs-dfx-life) * .1) both;}
@keyframes igs-dfx-cr-card{0%{opacity:0;transform:translate(-50%,8px)}100%{opacity:1;transform:translateX(-50%)}}
#igs-overlay .igs-dfx-opendoor-light{position:absolute;top:0;width:46%;height:var(--igs-fx-vis);mix-blend-mode:screen;opacity:0;transform:scaleX(.25);animation:igs-dfx-cr-doorlight calc(var(--igs-dfx-life) * .9) cubic-bezier(.3,.7,.3,1) both;}
#igs-overlay .igs-dfx-opendoor-light.is-left{left:0;transform-origin:0 50%;background:linear-gradient(90deg,rgba(255,226,170,.34),rgba(255,226,170,.18) 38%,rgba(255,226,170,.06) 72%,transparent);}
#igs-overlay .igs-dfx-opendoor-light.is-right{right:0;transform-origin:100% 50%;background:linear-gradient(270deg,rgba(255,226,170,.34),rgba(255,226,170,.18) 38%,rgba(255,226,170,.06) 72%,transparent);}
@keyframes igs-dfx-cr-doorlight{0%{opacity:0;transform:scaleX(.25)}30%{opacity:1;transform:scaleX(1)}100%{opacity:0;transform:scaleX(1.08)}}
#igs-overlay .igs-dfx-shield-wall{position:absolute;width:12%;height:46%;opacity:0;animation:igs-dfx-cr-wall calc(var(--igs-dfx-life) * .3) ease-out both;}
#igs-overlay .igs-dfx-shield-wall.is-flip{transform:scaleX(-1);}
#igs-overlay .igs-dfx-shield-arc{position:absolute;inset:0;border-radius:0 100% 100% 0 / 50%;border:1px solid rgba(238,214,148,.6);border-left:0;}
#igs-overlay .igs-dfx-shield-edge{position:absolute;right:0;top:0;bottom:0;width:1px;background:rgba(248,240,204,.72);}
#igs-overlay .igs-dfx-shield b{position:absolute;width:38px;height:1px;background:rgba(248,240,204,.62);opacity:0;animation:igs-dfx-cr-streak 520ms ease-in both;}
#igs-overlay .igs-dfx-shield-halo,#igs-overlay .igs-dfx-tend-halo{position:absolute;width:18%;aspect-ratio:1;margin:-9% 0 0 -9%;border-radius:50%;background:radial-gradient(closest-side,rgba(248,224,158,.38),rgba(248,224,158,0));opacity:0;animation:igs-dfx-cr-halo var(--igs-dfx-life) ease-in-out both;}
@keyframes igs-dfx-cr-wall{0%{opacity:0;transform:scaleY(.4)}100%{opacity:1;transform:none}}
@keyframes igs-dfx-cr-streak{0%{opacity:0;transform:translateX(0)}25%{opacity:1}100%{opacity:0;transform:translate(var(--bx),var(--by)) rotate(var(--br))}}
@keyframes igs-dfx-cr-halo{0%{opacity:0}35%,70%{opacity:.8}100%{opacity:0}}
#igs-overlay .igs-dfx-tend-tile{position:absolute;display:flex;flex-direction:column;align-items:center;gap:4px;padding:7px 11px;border-radius:4px;background:rgba(248,238,210,.88);border:1px solid rgba(180,150,100,.45);transform:translate(-50%,-50%);animation:igs-dfx-cr-tile calc(var(--igs-dfx-life) * .3) ease-out both;}
#igs-overlay .igs-dfx-tend-tile svg{width:44px;height:44px;fill:none;stroke:#5e4428;stroke-width:1;stroke-linecap:round;stroke-linejoin:round;}
#igs-overlay .igs-dfx-tend-tile path{fill:none;stroke-dasharray:1;stroke-dashoffset:1;animation:igs-dfx-cr-draw calc(var(--igs-dfx-life) * .35) ease-out calc(var(--igs-dfx-life) * .1) both;}
#igs-overlay .igs-dfx-tend-tile span{color:#4a3622;font:400 clamp(11px,1.9vmin,14px)/1.3 "Source Han Serif CN","Songti SC",serif;}
#igs-overlay .igs-dfx-tend-hand{position:absolute;width:6%;min-width:30px;transform:translateX(-50%);fill:#f2d3b3;stroke:#a87b58;stroke-width:.8;opacity:0;animation:igs-dfx-cr-hand calc(var(--igs-dfx-life) * .5) ease-out both;}
@keyframes igs-dfx-cr-tile{0%{opacity:0;transform:translate(-50%,-40%)}100%{opacity:1;transform:translate(-50%,-50%)}}
@keyframes igs-dfx-cr-draw{0%{stroke-dashoffset:1}100%{stroke-dashoffset:0}}
@keyframes igs-dfx-cr-hand{0%{opacity:0;transform:translate(-50%,24px)}40%,100%{opacity:1;transform:translateX(-50%)}}
#igs-overlay .igs-dfx-carry-stage{position:absolute;bottom:calc(var(--igs-fx-safe) + var(--igs-fx-vis) * .06);width:34%;height:calc(var(--igs-fx-vis) * .7);margin-left:-17%;}
#igs-overlay .igs-dfx-carry-lift{position:absolute;left:10%;right:10%;bottom:0;height:100%;background:linear-gradient(180deg,rgba(240,212,158,.14) 0,transparent 100%);opacity:0;animation:igs-dfx-cr-lift calc(var(--igs-dfx-life) * .8) ease-out both;}
#igs-overlay .igs-dfx-carry-glow{position:absolute;left:14%;right:14%;bottom:-3%;height:20%;border-radius:50%;background:radial-gradient(closest-side,rgba(242,216,148,.22),transparent);opacity:0;animation:igs-dfx-cr-halo var(--igs-dfx-life) ease-in-out both;}
#igs-overlay .igs-dfx-carry-petals i{position:absolute;top:-4%;width:11px;height:8px;border-radius:70% 0 70% 0;opacity:0;animation:igs-dfx-cr-petal 2s ease-in both;}
@keyframes igs-dfx-cr-lift{0%{opacity:0;transform:scaleY(.2)}40%{opacity:.18}100%{opacity:0;transform:scaleY(1.1)}}
@keyframes igs-dfx-cr-petal{0%{opacity:0;transform:translate3d(0,0,0) rotate(0)}15%{opacity:.95}100%{opacity:0;transform:translate3d(var(--sw),95vh,0) rotate(var(--rot))}}
#igs-overlay .igs-dfx-bubble-mouth{position:absolute;width:0;height:0;}
#igs-overlay .igs-dfx-bubble-mouth i{position:absolute;bottom:0;width:var(--igs-bb-s);height:var(--igs-bb-s);border-radius:50%;border:1px solid rgba(215,240,248,.62);background:rgba(196,232,242,.52);opacity:0;animation:igs-dfx-cr-bubble 1.6s ease-out both;}
@keyframes igs-dfx-cr-bubble{0%{opacity:0;transform:translate3d(0,0,0) scale(.6)}15%{opacity:.95}60%{opacity:.95;transform:translate3d(var(--sw),calc(var(--rise) * -.7),0) scale(1)}85%{opacity:.9;transform:translate3d(calc(var(--sw) * -1),calc(var(--rise) * -1),0) scale(1.15)}100%{opacity:0;transform:translate3d(0,calc(var(--rise) * -1.05),0) scale(1.5)}}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-care-card,#igs-overlay .igs-dfx.is-reduced .igs-dfx-shield-wall,#igs-overlay .igs-dfx.is-reduced .igs-dfx-shield-halo,#igs-overlay .igs-dfx.is-reduced .igs-dfx-tend-halo{animation:none;opacity:1;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-care-card,#igs-overlay .igs-dfx.is-reduced .igs-dfx-tend-hand{animation:none;opacity:1;transform:translateX(-50%);}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-tend-tile{animation:none;opacity:1;transform:translate(-50%,-50%);}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-tend-tile path{animation:none;stroke-dashoffset:0;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-shield b,#igs-overlay .igs-dfx.is-reduced .igs-dfx-carry-petals,#igs-overlay .igs-dfx.is-reduced .igs-dfx-carry-lift{display:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-carry-glow{animation:none;opacity:.7;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-bubble-mouth i{animation:none;opacity:.9;transform:translateY(calc(var(--rise) * -.6));}
#igs-overlay[data-igs-quality="low"] .igs-dfx-carry-petals{display:none;}
`;
