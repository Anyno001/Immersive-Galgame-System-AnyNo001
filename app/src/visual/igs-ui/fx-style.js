// 演出样式：#igs-fx-stage 在立绘之上、对话层之下；#igs-fx-front 在对话层与选项之上、工具栏之下。
// 区间演出由 #igs-stage-motion 上的 data-igs-fx-* 属性驱动，皮肤可覆写。
export const FX_STYLE_TEXT = `
.igs-fx-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
#igs-fx-stage{z-index:2;}
#igs-fx-front{z-index:6;}
.igs-fx-layer [hidden]{display:none!important;}
@keyframes igs-fx-pop{0%{opacity:0;transform:translate(-50%,0) scale(.3);}18%{opacity:1;transform:translate(-50%,-6px) scale(1.18);}30%{transform:translate(-50%,-4px) scale(1);}80%{opacity:1;}100%{opacity:0;transform:translate(-50%,-10px) scale(1);}}
@keyframes igs-fx-fade{0%{opacity:0;}15%{opacity:1;}80%{opacity:1;}100%{opacity:0;}}
@keyframes igs-fx-flash{0%{opacity:.95;}100%{opacity:0;}}
@keyframes igs-fx-speed{0%{opacity:0;transform:scale(1.25);}20%{opacity:1;transform:scale(1);}100%{opacity:0;transform:scale(1.04);}}
@keyframes igs-fx-beat{0%,100%{opacity:0;}12%{opacity:.9;}24%{opacity:.35;}36%{opacity:.8;}60%{opacity:0;}}
@keyframes igs-fx-slam{0%{opacity:0;transform:translate(-50%,-50%) scale(1.7) rotate(-8deg);}14%{opacity:1;transform:translate(-50%,-50%) scale(.94) rotate(-8deg);}20%{transform:translate(calc(-50% + 4px),calc(-50% - 3px)) scale(1) rotate(-8deg);}26%{transform:translate(calc(-50% - 4px),calc(-50% + 2px)) scale(1) rotate(-8deg);}32%{transform:translate(-50%,-50%) scale(1) rotate(-8deg);}78%{opacity:1;}100%{opacity:0;transform:translate(-50%,-50%) scale(1.08) rotate(-8deg);}}
@keyframes igs-fx-drop{0%{opacity:0;transform:translate(-50%,-120%);}12%{opacity:1;transform:translate(-50%,0);}86%{opacity:1;transform:translate(-50%,0);}100%{opacity:0;transform:translate(-50%,-120%);}}
@keyframes igs-fx-rise{0%{opacity:0;transform:translateY(10px);}14%{opacity:1;transform:translateY(0);}82%{opacity:1;}100%{opacity:0;transform:translateY(-6px);}}
@keyframes igs-fx-lid-top{0%{transform:translateY(0);}100%{transform:translateY(-100%);}}
@keyframes igs-fx-lid-bottom{0%{transform:translateY(0);}100%{transform:translateY(100%);}}
@keyframes igs-fx-lid-close{0%{opacity:0;}100%{opacity:.96;}}
@keyframes igs-fx-buzz{0%,100%{transform:translate(0,0);}20%{transform:translate(-2px,1px);}40%{transform:translate(2px,-1px);}60%{transform:translate(-2px,-1px);}80%{transform:translate(2px,1px);}}
@keyframes igs-fx-ring{0%{box-shadow:0 0 0 0 rgba(255,255,255,.45);}100%{box-shadow:0 0 0 22px rgba(255,255,255,0);}}
@keyframes igs-fx-wave{0%,100%{transform:scaleY(.35);}50%{transform:scaleY(1);}}
@keyframes igs-fx-grain{0%{transform:translate(0,0);}25%{transform:translate(-1%,1%);}50%{transform:translate(1%,-1%);}75%{transform:translate(-1%,-1%);}100%{transform:translate(0,0);}}
.igs-fx-symbol{position:absolute;left:66%;top:14%;width:56px;height:56px;display:flex;align-items:center;justify-content:center;font:900 44px/1 system-ui,sans-serif;animation:igs-fx-pop 1s ease-out both;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));}
.igs-fx-symbol::before{content:"";}
.igs-fx-symbol[data-kind="anger"]::before{content:"╬";color:#e5383b;transform:rotate(12deg);}
.igs-fx-symbol[data-kind="heart"]::before{content:"♥";color:#ff5d8f;}
.igs-fx-symbol[data-kind="surprise"]::before{content:"!?";color:#ffd23f;-webkit-text-stroke:2px #3a2b00;}
.igs-fx-symbol[data-kind="silence"]::before{content:"…";color:#ffffff;-webkit-text-stroke:1px #333;}
.igs-fx-symbol[data-kind="sparkle"]::before{content:"✦";color:#fff4b0;text-shadow:0 0 12px #ffe066;}
.igs-fx-symbol[data-kind="sweat"]::before{width:18px;height:26px;background:linear-gradient(160deg,#dff3ff,#6bbcff);border:2px solid #2a6fb0;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;transform:rotate(-20deg);}
.igs-fx-symbol[data-kind="gloom"]::before{width:44px;height:48px;background:repeating-linear-gradient(90deg,rgba(40,30,70,.85) 0 3px,transparent 3px 9px);-webkit-mask:linear-gradient(180deg,#000,transparent);mask:linear-gradient(180deg,#000,transparent);}
.igs-fx-speedlines{position:absolute;inset:-10%;background:repeating-conic-gradient(from 0deg at 50% 45%,rgba(255,255,255,0) 0deg 3deg,rgba(255,255,255,.7) 3deg 3.6deg,rgba(255,255,255,0) 3.6deg 7deg);-webkit-mask:radial-gradient(ellipse at 50% 45%,transparent 32%,#000 68%);mask:radial-gradient(ellipse at 50% 45%,transparent 32%,#000 68%);animation:igs-fx-speed .7s ease-out both;}
.igs-fx-heartbeat{position:absolute;inset:0;--igs-fx-beat:255,110,160;background:radial-gradient(ellipse at 50% 50%,transparent 45%,rgba(var(--igs-fx-beat),.55) 100%);animation:igs-fx-beat 1.2s ease-in-out 2 both;}
.igs-fx-heartbeat[data-tone="tense"]{--igs-fx-beat:120,10,20;}
.igs-fx-flash{position:absolute;inset:0;background:#fff;animation:igs-fx-flash .8s ease-out both;}
.igs-fx-title-card{position:absolute;left:0;right:0;top:20%;display:flex;flex-direction:column;align-items:center;gap:6px;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.65);animation:igs-fx-fade 2.7s ease both;}
.igs-fx-title-card::before,.igs-fx-title-card::after{content:"";width:min(46%,320px);height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);}
.igs-fx-title-main{font-size:clamp(20px,3.4vw,34px);font-weight:700;letter-spacing:.28em;padding-left:.28em;}
.igs-fx-title-sub{font-size:clamp(13px,1.8vw,17px);letter-spacing:.2em;opacity:.9;}
.igs-fx-favor-stack{position:absolute;top:56px;right:14px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;}
.igs-fx-favor{padding:4px 12px;border-radius:999px;font-size:13px;color:#fff;background:rgba(20,20,28,.62);border:1px solid rgba(255,255,255,.18);animation:igs-fx-rise 2.4s ease both;}
.igs-fx-favor[data-dir="up"]{border-color:rgba(255,140,180,.7);}
.igs-fx-favor[data-dir="down"]{border-color:rgba(140,170,255,.7);}
.igs-fx-notify{position:absolute;top:12px;left:50%;width:min(86%,360px);padding:10px 14px;border-radius:14px;color:#1d1d24;background:rgba(250,250,252,.94);box-shadow:0 6px 22px rgba(0,0,0,.28);animation:igs-fx-drop 3.3s ease both;}
.igs-fx-notify-sender{font-size:12px;font-weight:700;opacity:.7;margin-bottom:2px;}
.igs-fx-notify-text{font-size:14px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-fx-sfx{position:absolute;left:50%;top:40%;font:italic 900 clamp(48px,10vw,110px)/1 system-ui,sans-serif;color:#fff;-webkit-text-stroke:3px #111;paint-order:stroke fill;text-shadow:5px 5px 0 rgba(0,0,0,.55);white-space:nowrap;animation:igs-fx-slam 1s ease-out both;}
.igs-fx-eye{position:absolute;inset:0;}
.igs-fx-eye::before,.igs-fx-eye::after{content:"";position:absolute;left:0;right:0;height:51%;background:#000;}
.igs-fx-eye::before{top:0;border-radius:0 0 50% 50%/0 0 22% 22%;animation:igs-fx-lid-top 1.3s cubic-bezier(.5,0,.3,1) both;}
.igs-fx-eye::after{bottom:0;border-radius:50% 50% 0 0/22% 22% 0 0;animation:igs-fx-lid-bottom 1.3s cubic-bezier(.5,0,.3,1) both;}
.igs-fx-eye-hold{position:absolute;inset:0;background:#000;opacity:.96;animation:igs-fx-lid-close 1.2s ease-in both;}
.igs-fx-call-screen{position:absolute;inset:0;pointer-events:auto;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#fff;background:linear-gradient(180deg,rgba(18,24,40,.9),rgba(8,10,18,.94));animation:igs-fx-fade 2.4s ease both;}
.igs-fx-call-avatar{width:84px;height:84px;border-radius:50%;object-fit:cover;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;background:#5b6b8f;animation:igs-fx-ring 1s ease-out infinite,igs-fx-buzz .35s linear 3;}
.igs-fx-call-name{font-size:22px;font-weight:700;letter-spacing:.08em;}
.igs-fx-call-state{font-size:14px;opacity:.8;}
.igs-fx-call-hint{margin-top:18px;padding:6px 18px;border-radius:999px;background:#34c759;font-size:13px;}
.igs-fx-call-badge{position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:4px 14px 4px 10px;border-radius:999px;font-size:12px;color:#eafff0;background:rgba(20,110,60,.72);}
.igs-fx-call-badge::before{content:"";width:14px;height:12px;background:linear-gradient(90deg,currentColor 0 2px,transparent 2px 4px,currentColor 4px 6px,transparent 6px 8px,currentColor 8px 10px,transparent 10px 12px,currentColor 12px 14px);transform-origin:50% 50%;animation:igs-fx-wave .9s ease-in-out infinite;}
.igs-fx-call-end{position:absolute;top:14px;left:50%;transform:translateX(-50%);padding:4px 14px;border-radius:999px;font-size:12px;color:#fff;background:rgba(200,50,50,.75);animation:igs-fx-fade 1.8s ease both;}
.igs-fx-letterbox-bar{position:absolute;left:0;right:0;height:0;background:#000;transition:height .6s ease;}
.igs-fx-letterbox-bar.is-top{top:0;}
.igs-fx-letterbox-bar.is-bottom{bottom:0;}
#igs-stage-motion[data-igs-fx-letterbox] .igs-fx-letterbox-bar{height:9%;}
.igs-fx-flashback-grain{position:absolute;inset:-4%;opacity:0;transition:opacity .6s ease;background:radial-gradient(ellipse at 50% 50%,transparent 50%,rgba(40,24,8,.55) 100%),repeating-radial-gradient(circle at 30% 40%,rgba(255,240,210,.08) 0 1px,transparent 1px 3px);}
#igs-stage-motion[data-igs-fx-flashback] .igs-fx-flashback-grain{opacity:1;animation:igs-fx-grain .5s steps(2) infinite;}
#igs-stage-motion #igs-bg,#igs-stage-motion #igs-sprite{transition:filter .6s ease;}
#igs-stage-motion[data-igs-fx-flashback] #igs-bg,#igs-stage-motion[data-igs-fx-flashback] #igs-sprite{filter:sepia(.55) saturate(.55) brightness(.92) contrast(.95)!important;-webkit-filter:sepia(.55) saturate(.55) brightness(.92) contrast(.95)!important;}
#igs-stage-motion[data-igs-fx-flashback] .igs-dialog{opacity:.9;}
@media (prefers-reduced-motion: reduce){
.igs-fx-layer *,.igs-fx-layer *::before,.igs-fx-layer *::after{animation:none!important;transition:none!important;}
.igs-fx-eye,.igs-fx-flash,.igs-fx-speedlines{display:none!important;}
.igs-fx-notify{transform:translateX(-50%);}
.igs-fx-sfx{transform:translate(-50%,-50%) rotate(-8deg);}
.igs-fx-symbol{transform:translate(-50%,0);}
}
`.trim();
