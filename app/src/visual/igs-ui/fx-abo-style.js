// ABO 包的样式。寿命由 --igs-dfx-life 驱动；装饰用实色，淡入淡出靠 opacity；低画质与 .is-reduced 静态。
// 压制只改 CSS 变量与 translate，不碰打字机：字重取 --igs-abo-press-weight，其他立绘下沉取 --igs-abo-sink；横向保留撑伞靠拢的 --igs-fx-huddle-dx，两种位移叠加。
const O = '#igs-overlay';

export const ABO_STYLE_TEXT = `
${O} .igs-abo{display:flex;align-items:center;justify-content:center;overflow:hidden;}
${O} .igs-abo-scent,${O} .igs-abo-link,${O} .igs-abo-soothe,${O} .igs-abo-suppress,${O} .igs-abo-bond{display:block;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
${O} .igs-abo-tint{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 62%,var(--igs-abo-c,#e58fb0) 0%,transparent 78%);mix-blend-mode:soft-light;opacity:.08;}
${O} .igs-abo-sym{width:var(--igs-abo-sw,8%);height:auto;aspect-ratio:1/1;margin:0;translate:-50% -50%;}
${O} .igs-abo-sym.is-scent{animation:igs-abo-scent var(--igs-fx-life,2600ms) ease-out both;}
${O} .igs-abo-sym.is-scent.is-calm{animation-timing-function:ease-in-out;}
@keyframes igs-abo-scent{0%{opacity:0;transform:translateX(0);}22%{opacity:.95;}75%{opacity:.8;}100%{opacity:0;transform:translateX(var(--igs-abo-dx,40%));}}
${O} .igs-abo-scent-name,${O} .igs-abo-tag{position:absolute;transform:translate(-50%,-50%);display:flex;padding:.22em .8em;border-top:1px solid var(--igs-abo-c,#e58fb0);border-bottom:1px solid var(--igs-abo-c,#e58fb0);color:var(--igs-abo-c,#e58fb0);font-size:.78em;font-weight:700;letter-spacing:.3em;text-indent:.3em;text-shadow:0 1px 3px #000,0 0 8px #000;white-space:nowrap;}
${O} .igs-abo-scent-name span{opacity:0;animation:igs-abo-char .6s ease-out both;}
${O} .igs-abo-tag{opacity:0;animation:igs-abo-char .6s .5s ease-out both;}
@keyframes igs-abo-char{from{opacity:0;transform:translateY(5px);}to{opacity:1;transform:translateY(0);}}

${O} .igs-abo-dim{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 55%,#0b0610 0%,#05030a 100%);opacity:.5;animation:igs-abo-dim var(--igs-dfx-life) ease both;}
${O} .igs-abo-suppress.is-all .igs-abo-dim{opacity:.64;}
@keyframes igs-abo-dim{0%{opacity:0;}16%{opacity:var(--igs-abo-dim-peak,.5);}84%{opacity:var(--igs-abo-dim-peak,.5);}100%{opacity:0;}}
${O} .igs-abo-suppress{--igs-abo-dim-peak:.5;--igs-abo-sink:2.4%;--igs-abo-press-weight:700;}
${O} .igs-abo-suppress.is-all{--igs-abo-dim-peak:.64;--igs-abo-sink:3.6%;}
${O}:has(.igs-abo-suppress) #igs-text{font-weight:var(--igs-abo-press-weight,700);letter-spacing:.03em;}
${O}:has(.igs-abo-suppress) .igs-cast-sprite{transition:translate .5s ease-out;}
${O}:has(.igs-abo-suppress.is-main) #igs-sprite{translate:var(--igs-fx-huddle-dx,0%) 0;}
${O}:has(.igs-abo-suppress:not(.is-main)) #igs-sprite{translate:var(--igs-fx-huddle-dx,0%) var(--igs-abo-sink,2.4%);transition:translate .5s ease-out;}

${O} .igs-abo-glow{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 60%,#ffd9a8 0%,#ffbf80 70%);opacity:.22;animation:igs-abo-glow var(--igs-dfx-life) ease both;}
@keyframes igs-abo-glow{0%{opacity:0;}30%{opacity:.26;}70%{opacity:.2;}100%{opacity:0;}}

${O} .igs-abo-inhibitor{align-items:flex-start;justify-content:flex-end;padding:10% 3% 0 0;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
${O} .igs-abo-item{display:flex;align-items:center;gap:8px;padding:6px 12px 6px 8px;background:rgba(28,37,48,.92);color:#e9f1f8;border:1px solid #5ab8b0;border-radius:5px;animation:igs-abo-slide .5s cubic-bezier(.2,.9,.3,1) both;}
${O} .igs-abo-item-icon{display:block;width:28px;height:28px;opacity:.85;}
${O} .igs-abo-item-icon svg{width:100%;height:100%;}
${O} .igs-abo-item-text{display:flex;flex-direction:column;line-height:1.3;}
${O} .igs-abo-item-text b{letter-spacing:.1em;font-size:.9em;}
${O} .igs-abo-item-text em{font-style:normal;font-size:.78em;opacity:.8;}
${O} .igs-abo-inhibitor.is-fail .igs-abo-item{background:rgba(42,14,16,.92);border-color:#c03030;color:#ffe3e0;animation:igs-abo-slide .5s cubic-bezier(.2,.9,.3,1) both,igs-abo-shake .5s .5s linear 2;}
${O} .igs-abo-inhibitor.is-patch .igs-abo-item{border-color:#c09870;}
@keyframes igs-abo-slide{from{opacity:0;transform:translateX(24px);}to{opacity:1;transform:translateX(0);}}
@keyframes igs-abo-shake{0%,100%{transform:translateX(0);}25%{transform:translateX(-3px);}75%{transform:translateX(3px);}}

${O} .igs-abo-mark{position:absolute;aspect-ratio:1/1;transform:translate(-50%,-50%);}
${O} .igs-abo-mark svg{width:100%;height:100%;overflow:visible;}
${O} .igs-abo-bond{--igs-abo-c:#d98aa0;}
${O} .igs-abo-bond.is-life{--igs-abo-c:#e8c06a;}
${O} .igs-abo-bond .igs-abo-mark{--igs-fx-c:#c75b73;--igs-fx-ink:#3a1020;--igs-fx-rim-c:#fff;}
${O} .igs-abo-bond.is-temp .igs-abo-mark .igs-fx-fill{fill:#e48a9c;}
${O} .igs-abo-bond.is-life .igs-abo-mark{--igs-fx-c:#e8c06a;--igs-fx-ink:#4a3410;}
${O} .igs-abo-bond.is-life.is-ancient .igs-abo-mark{--igs-fx-c:#b3262e;--igs-fx-ink:#2b0a0c;}
${O} .igs-abo-bond.is-life.is-magic .igs-abo-mark{--igs-fx-c:#a98bff;--igs-fx-ink:#241a4a;}
${O} .igs-abo-bond .igs-abo-mark .igs-fx-g{animation:igs-abo-mark-in .5s .2s ease-out both;}
@keyframes igs-abo-mark-in{from{opacity:0;transform:scale(.4);}60%{transform:scale(1.12);}to{opacity:1;transform:scale(1);}}
${O} .igs-abo-pulse{position:absolute;aspect-ratio:1/1;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(closest-side,#ffe9a8 0%,#e8c06a 60%,transparent 100%);opacity:0;pointer-events:none;animation:igs-abo-flash 1.3s 1.7s ease-out both;}
@keyframes igs-abo-flash{0%{opacity:0;transform:translate(-50%,-50%) scale(.5);}30%{opacity:.7;}100%{opacity:0;transform:translate(-50%,-50%) scale(1.5);}}

${O} .igs-abo-report,${O} .igs-abo-match,${O} .igs-abo-detector,${O} .igs-abo-phase,${O} .igs-abo-nest{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
${O} .igs-abo-report .igs-panel{animation:igs-abo-rise .6s cubic-bezier(.2,.9,.3,1) both;}
${O} .igs-abo-reveal span{opacity:0;animation:igs-abo-char .3s ease-out both;font-weight:700;}
${O} .igs-abo-result .igs-panel-v{font-size:1.15em;letter-spacing:.14em;}
@keyframes igs-abo-rise{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}

${O} .igs-abo-match-card{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 20px 10px;background:rgba(42,16,32,.92);color:#ffe6ef;border:1px solid #c06090;border-radius:8px;animation:igs-abo-rise .6s cubic-bezier(.2,.9,.3,1) both;}
${O} .igs-abo-match-names{display:flex;align-items:center;gap:8px;font-size:.88em;font-weight:600;letter-spacing:.1em;}
${O} .igs-abo-match-names i{display:block;width:18px;height:1px;background:#c06090;}
${O} .igs-abo-ring-wrap{position:relative;width:80px;height:80px;}
${O} .igs-abo-ring-wrap svg{width:100%;height:100%;transform:rotate(-90deg);}
${O} .igs-abo-track{fill:none;stroke:#4a2438;stroke-width:5;}
${O} .igs-abo-arc{fill:none;stroke:#e080b0;stroke-width:5;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:calc(100 - var(--igs-abo-pct,0));animation:igs-abo-arc 1.6s ease-out both;}
@keyframes igs-abo-arc{from{stroke-dashoffset:100;}}
${O} .igs-abo-pct-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:1.4em;font-variant-numeric:tabular-nums;}
${O} .igs-abo-match-cap{font-size:.76em;letter-spacing:.18em;opacity:.8;}
${O} .igs-abo-match.is-ancient .igs-abo-match-card{background:#f1ead8;color:#2b2218;border-color:#b3262e;}
${O} .igs-abo-match.is-ancient .igs-abo-arc{stroke:#b3262e;}
${O} .igs-abo-match.is-ancient .igs-abo-track{stroke:#d9cdb2;}
${O} .igs-abo-match.is-ancient .igs-abo-match-names i{background:#b3262e;}

${O} .igs-abo-nest{align-items:flex-end;justify-content:flex-start;padding:0 0 calc(var(--igs-fx-safe) + 12px) 4%;}
${O} .igs-abo-nest-badge{display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 12px 5px;background:rgba(59,42,34,.9);color:#f6e6d6;border:1px solid rgba(217,167,122,.6);border-radius:6px;animation:igs-abo-rise .5s ease-out both;}
${O} .igs-abo-nest-badge svg{width:56px;height:56px;overflow:visible;}
${O} .igs-abo-nest-badge em{font-style:normal;font-size:.76em;letter-spacing:.18em;}
${O} .igs-abo-nest-who{font-size:.72em;opacity:.8;}
${O} .igs-abo-nest-ring{fill:none;stroke:rgba(217,167,122,.6);stroke-width:1;stroke-dasharray:3 4;}
${O} .igs-abo-nest-heart{fill:#d07090;animation:igs-abo-beat 1.4s 1s ease-in-out 2;transform-origin:center;}
@keyframes igs-abo-beat{0%,100%{transform:scale(.8);}50%{transform:scale(.95);}}
${O} .igs-abo-nest.is-ancient .igs-abo-nest-badge{background:#f1ead8;color:#2b2218;border-color:rgba(122,91,54,.5);}

${O} .igs-abo-detector{position:relative;align-items:flex-start;justify-content:center;padding-top:10%;}
${O} .igs-abo-det-card{position:absolute;top:10%;left:0;right:0;margin:0 auto;width:min(280px,70%);padding:8px 14px 7px;background:#0d2025;color:#d4f3ee;border:2px solid #3bd0b4;border-radius:4px;}
${O} .igs-abo-det-head{display:flex;justify-content:space-between;gap:10px;padding-bottom:5px;margin-bottom:6px;border-bottom:1px solid rgba(59,208,180,.5);font-size:.86em;letter-spacing:.1em;}
${O} .igs-abo-det-head span{opacity:.8;}
${O} .igs-abo-det-state{margin-top:5px;text-align:center;font-size:.78em;letter-spacing:.28em;opacity:.9;}
${O} .igs-abo-detector .igs-gauge-fill{animation:igs-abo-fill 1.2s ease-out both;}
@keyframes igs-abo-fill{from{width:0;}}
${O} .igs-abo-detector.is-warn .igs-abo-det-card{background:#1a1506;border-color:#c8901a;color:#f0e0a8;}
${O} .igs-abo-detector.is-bad .igs-abo-det-card{background:#180808;color:#ffe3e0;border-color:#c03030;animation:igs-abo-rise .5s ease-out both,igs-abo-shake .4s .8s linear 3;}
${O} .igs-abo-det-flash{position:absolute;inset:0;background:#901515;opacity:0;animation:igs-abo-blink .9s .6s ease-in-out 3;}
@keyframes igs-abo-blink{0%,100%{opacity:0;}50%{opacity:.16;}}

${O} .igs-abo-phase{align-items:flex-start;justify-content:flex-start;padding:12% 0 0 4%;}
${O} .igs-abo-phase-card{min-width:150px;padding:6px 12px;background:rgba(58,18,32,.92);color:#ffe3ec;border:1px solid #d06080;border-radius:6px;animation:igs-abo-slide-l .5s cubic-bezier(.2,.9,.3,1) both;}
${O} .igs-abo-phase.is-rut .igs-abo-phase-card{background:rgba(36,12,14,.92);color:#ffe0dc;border-color:#a02428;}
${O} .igs-abo-phase-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:6px;letter-spacing:.12em;}
${O} .igs-abo-phase-who{font-size:.82em;opacity:.85;}
${O} .igs-abo-phase-text{font-size:.9em;letter-spacing:.1em;}
${O} .igs-abo-phase .igs-gauge-fill{animation:igs-abo-fill 1s ease-out both;}
@keyframes igs-abo-slide-l{from{opacity:0;transform:translateX(-24px);}to{opacity:1;transform:translateX(0);}}

${O} .igs-abo-scent.is-ancient .igs-abo-scent-name{font-family:serif;letter-spacing:.35em;}
${O} .igs-abo-scent.is-magic .igs-abo-scent-name{font-family:"IM Fell English",Georgia,serif;text-shadow:0 0 10px var(--igs-abo-c),0 1px 3px #000;}

#igs-overlay #igs-stage-motion[data-igs-fx-state="heat"] #igs-bg::after{animation-duration:2.6s;}
#igs-overlay #igs-stage-motion[data-igs-fx-state="rut"] #igs-bg::after{animation-duration:4.6s;}
#igs-overlay #igs-stage-motion[data-igs-fx-state="rut"][data-igs-fx-state-level="heavy"] #igs-bg::after{animation-duration:3.4s;}

${O}[data-igs-quality="low"] .igs-abo-sym.is-scent,${O}[data-igs-quality="low"] .igs-abo-det-flash,${O}[data-igs-quality="low"] .igs-abo-pulse{display:none;}
${O} .igs-abo.is-reduced .igs-abo-sym.is-scent,${O} .igs-abo.is-reduced .igs-abo-det-flash,${O} .igs-abo.is-reduced .igs-abo-pulse{display:none;}
${O} .igs-abo.is-reduced .igs-abo-reveal span,${O} .igs-abo.is-reduced .igs-abo-scent-name span,${O} .igs-abo.is-reduced .igs-abo-tag{opacity:1;}
@media (prefers-reduced-motion: reduce){${O} .igs-abo *,${O} .igs-abo{animation:none!important;}${O} .igs-abo-reveal span,${O} .igs-abo-tag{opacity:1;}${O} .igs-abo-sym.is-scent{display:none;}}
`;
