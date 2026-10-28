const UMBRELLA_BODY = "<path d='M0 40 Q50 -40 100 40 Q90 47 80 40 Q70 47 60 40 Q50 47 40 40 Q30 47 20 40 Q10 47 0 40Z' fill='%232c4268'/><path d='M50 0 L80 40 L60 40Z M50 0 L40 40 L20 40Z M50 0 L100 40 L80 40Z M50 0 L20 40 L0 40Z' fill='%23365580'/><g stroke='%231a2742' stroke-width='1' vector-effect='non-scaling-stroke' fill='none'><path d='M50 0 L100 40 M50 0 L80 40 M50 0 L60 40 M50 0 L40 40 M50 0 L20 40 M50 0 L0 40' vector-effect='non-scaling-stroke'/></g>";
const UMBRELLA_DRIPS = [80, 60, 40, 20].map((x, i) => `<circle cx='${x}' cy='48' r='1.1' fill='%238fbcff'><animate attributeName='cy' values='47;60;60' keyTimes='0;0.8;1' dur='${(1.6 + i * 0.35).toFixed(2)}s' begin='${(i * 0.4).toFixed(1)}s' repeatCount='indefinite'/><animate attributeName='opacity' values='0;1;0' keyTimes='0;0.15;0.8' dur='${(1.6 + i * 0.35).toFixed(2)}s' begin='${(i * 0.4).toFixed(1)}s' repeatCount='indefinite'/></circle>`).join('');
const UMBRELLA_STATIC = "<circle cx='80' cy='50' r='1.1' fill='%238fbcff'/><circle cx='40' cy='52' r='1.1' fill='%238fbcff'/>";
const umbrellaImage = (extra) => `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 62' preserveAspectRatio='none'>${UMBRELLA_BODY}${extra}</svg>")`;

export const RANGE_FX_STYLE_TEXT = `
@property --igs-lo{syntax:'<number>';inherits:false;initial-value:1;}
@property --igs-lg{syntax:'<number>';inherits:false;initial-value:0;}
.igs-fx-letterbox-bar{height:11%;}
#igs-stage-motion[data-igs-fx-letterbox] #igs-bg{scale:1.03;transition:scale .8s ease;}
.igs-fx-flashback-tag{position:absolute;left:14px;top:13%;padding:2px 10px 2px 12px;font-size:12px;letter-spacing:.3em;color:#f2e2bd;background:#3a2a14;border:1px solid #c9a96a;opacity:0;transition:opacity .5s ease;pointer-events:none;}
#igs-stage-motion[data-igs-fx-flashback] .igs-fx-flashback-tag{opacity:1;transition-delay:.5s;}
@keyframes igs-fx-film-flick{0%,100%{opacity:1;}46%{opacity:1;}48%{opacity:.7;}50%{opacity:1;}83%{opacity:.86;}}
#igs-stage-motion[data-igs-fx-flashback] .igs-fx-flashback-grain{animation:igs-fx-grain .5s steps(2) infinite,igs-fx-film-flick 5s linear infinite;background:radial-gradient(ellipse at 50% 50%,transparent 50%,rgba(40,24,8,.55) 100%),repeating-linear-gradient(90deg,transparent 0 31%,rgba(255,240,210,.16) 31% 31.12%,transparent 31.12% 68%,rgba(255,240,210,.12) 68% 68.1%,transparent 68.1% 100%),repeating-radial-gradient(circle at 30% 40%,rgba(255,240,210,.08) 0 1px,transparent 1px 3px);}
.igs-fx-dream-mist::after{content:'';position:absolute;left:0;right:0;top:0;bottom:-120px;opacity:.6;background:radial-gradient(circle,#fff 0 1.5px,transparent 2.5px) 0 0/90px 120px,radial-gradient(circle,#e6ddff 0 1px,transparent 2px) 40px 60px/70px 60px;}
#igs-stage-motion[data-igs-fx-dream] .igs-fx-dream-mist::after{animation:igs-fx-dream-rise 16s linear infinite;}
@keyframes igs-fx-dream-rise{to{transform:translate3d(0,-120px,0);}}
#igs-stage-motion[data-igs-fx-dream] #igs-sprite{filter:saturate(.78) brightness(1.02) contrast(.96) drop-shadow(0 0 12px #c9bdff)!important;-webkit-filter:saturate(.78) brightness(1.02) contrast(.96) drop-shadow(0 0 12px #c9bdff)!important;}
.igs-fx-range-flash{position:absolute;inset:0;pointer-events:none;}
.igs-fx-range-flash[data-kind="flashback"]{background:radial-gradient(ellipse at 50% 50%,#fffaf0 0,#fff0d0 55%,#d9b97a 100%);animation:igs-fx-range-in var(--igs-fx-life,500ms) ease-out both;}
.igs-fx-range-flash[data-kind="flashback"][data-dir="out"]{animation-name:igs-fx-range-out;}
.igs-fx-range-flash[data-kind="dream"]{background:#f1edff;animation:igs-fx-range-dream var(--igs-fx-life,900ms) ease-in-out both;}
@keyframes igs-fx-range-in{0%{opacity:0;scale:1.5;}22%{opacity:1;scale:1.15;}100%{opacity:0;scale:1;}}
@keyframes igs-fx-range-out{0%{opacity:0;scale:1;}30%{opacity:.9;scale:1.1;}100%{opacity:0;scale:1.4;}}
@keyframes igs-fx-range-dream{0%{opacity:0;}35%{opacity:.8;}100%{opacity:0;}}
#igs-stage-motion[data-igs-fx-whisper="1"] .igs-dialog{scale:.97;box-shadow:0 0 22px 6px rgba(0,0,0,.28);transition:scale .5s ease;}
#igs-stage-motion[data-igs-fx-whisper="1"] #igs-fx-stage{background:rgba(0,0,0,.2);}
#igs-fx-stage{transition:background-color .6s ease;}
#igs-stage-motion[data-igs-fx-lightsoff] #igs-fx-stage{background:radial-gradient(ellipse 60% 40% at 50% 14%,rgba(255,214,150,calc(.34 * var(--igs-lg))),transparent 70%),linear-gradient(180deg,rgba(6,12,34,calc(.62 * var(--igs-lo))),rgba(4,8,22,calc(.78 * var(--igs-lo))));animation:igs-fx-lights-out 1.6s linear both;}
@keyframes igs-fx-lights-out{0%,10%{--igs-lo:0;--igs-lg:1;}14%{--igs-lo:.5;--igs-lg:.7;}20%{--igs-lo:.1;--igs-lg:.9;}30%{--igs-lo:.9;--igs-lg:.5;}100%{--igs-lo:1;--igs-lg:0;}}
#igs-stage-motion[data-igs-fx-umbrella] #igs-fx-stage::after{left:6%;right:6%;top:-30%;height:58%;border-radius:0;background:${umbrellaImage(UMBRELLA_DRIPS)} center/100% 100% no-repeat;box-shadow:none;filter:drop-shadow(0 10px 8px rgba(0,0,0,.35));}
#igs-overlay[data-igs-quality="low"] #igs-stage-motion[data-igs-fx-umbrella] #igs-fx-stage::after{background-image:${umbrellaImage(UMBRELLA_STATIC)};filter:none;}
#igs-overlay[data-igs-quality="low"] .igs-fx-flashback-grain,#igs-overlay[data-igs-quality="low"] #igs-stage-motion .igs-fx-dream-mist::after{animation:none!important;}
@keyframes igs-fx-flash{0%{opacity:.95;}12%{opacity:.05;}24%{opacity:.9;}42%{opacity:.32;}100%{opacity:0;}}
.igs-fx-flash{animation-duration:1.4s;}
.igs-fx-cut-flash{position:absolute;inset:0;background:#fff;animation:igs-fx-cut-flash .2s steps(2,end) both;}
@keyframes igs-fx-cut-flash{0%{opacity:1;}50%{opacity:0;}75%{opacity:.8;}100%{opacity:0;}}
.igs-fx-cutin{background:var(--igs-fx-cutin-bg,var(--igs-fx-accent,#e8445f));border-top-color:#fff;}
.igs-fx-cutin::before{content:'';position:absolute;left:-20%;right:-20%;top:-20%;bottom:-20%;background:repeating-linear-gradient(90deg,transparent 0 22px,rgba(255,255,255,.28) 22px 24px,transparent 24px 41px,rgba(255,255,255,.18) 41px 42px);animation:igs-fx-cutin-lines .45s linear infinite;}
.igs-fx-cutin-face{position:relative;transform-origin:50% 40%;animation:igs-fx-cutin-pop .42s cubic-bezier(.2,1.4,.4,1) both;}
@keyframes igs-fx-cutin-lines{to{transform:translateX(-41px);}}
@keyframes igs-fx-cutin-pop{from{transform:scale(1.22);opacity:.4;}}
.igs-fx-cutin.is-reduced::before{animation:none;}
#igs-overlay[data-igs-quality="low"] .igs-fx-cutin::before{animation:none;}
.igs-fx-nick-card{position:absolute;right:4%;top:15%;max-width:min(300px,76%);box-sizing:border-box;display:flex;gap:10px;align-items:center;padding:12px 18px 12px 12px;background:#fff3c9;color:#4a3524;border:1px solid #d8b98c;border-radius:4px;box-shadow:0 6px 14px rgba(0,0,0,.28);transform:rotate(1.6deg);animation:igs-fx-nick-card var(--igs-fx-life,3400ms) ease-out both;}
.igs-fx-nick-card::before{content:'';position:absolute;left:50%;top:-8px;width:44px;height:14px;margin-left:-22px;background:#e9b8c4;transform:rotate(-3deg);}
.igs-fx-nick-card .igs-fx-call-avatar{width:38px;height:38px;flex:none;border-radius:50%;object-fit:cover;}
.igs-fx-nick-body{display:flex;flex-direction:column;gap:2px;min-width:0;}
.igs-fx-nick-lead{font-size:12px;opacity:.75;}
.igs-fx-nick-name{display:inline-block;overflow:hidden;white-space:nowrap;font-size:20px;font-weight:600;width:calc(var(--igs-nick-n,2) * 1.15em);animation:igs-fx-nick-write 1s steps(var(--igs-nick-n,2),end) .45s both;}
@keyframes igs-fx-nick-card{0%{opacity:0;transform:translateY(-10px) rotate(1.6deg);}10%{opacity:1;transform:rotate(1.6deg);}88%{opacity:1;}100%{opacity:0;}}
@keyframes igs-fx-nick-write{from{width:0;}}
@media (prefers-reduced-motion: reduce){
.igs-fx-dream-mist::after,.igs-fx-flashback-grain,.igs-fx-cutin-face{animation:none!important;}
.igs-fx-cutin::before{animation:none;}
#igs-stage-motion[data-igs-fx-umbrella] #igs-fx-stage::after{background-image:${umbrellaImage(UMBRELLA_STATIC)};}
#igs-stage-motion[data-igs-fx-lightsoff] #igs-fx-stage{animation:none!important;--igs-lo:1;--igs-lg:0;}
}
`.trim();
