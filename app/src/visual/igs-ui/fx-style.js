// 演出样式：#igs-fx-stage 在立绘之上、对话层之下；#igs-fx-front 在对话层与选项之上、工具栏之下。
// 区间演出由 #igs-stage-motion 上的 data-igs-fx-* 属性驱动，皮肤可覆写。
// 瞬时演出时长读 --igs-fx-life（运行时按停留档位写入）；data-igs-fx-motion="snappy" 为灵动演出：
// 逐关键帧定格（steps）模拟漫画分镜的一拍一拍卡顿感，渐变演出为默认缓动。
export const FX_STYLE_TEXT = `
.igs-fx-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;contain:layout paint style;}
#igs-fx-stage{z-index:2;}
#igs-fx-front{z-index:6;}
.igs-fx-layer [hidden]{display:none!important;}
/* 报幕期间暂隐左上状态栏、人物立绘和对话框；状态撤销后沿用原样式恢复。 */
#igs-stage-motion[data-igs-fx-presentation="1"] #igs-status-hud,
#igs-stage-motion[data-igs-fx-presentation="1"] #igs-sprite,
#igs-stage-motion[data-igs-fx-presentation="1"] #igs-dialog-layer{display:none!important;pointer-events:none!important;}
@keyframes igs-fx-pop{0%{opacity:0;transform:scale(.3);}18%{opacity:1;transform:translateY(-8%) scale(1.16);}30%{transform:translateY(-6%) scale(1);}80%{opacity:1;}100%{opacity:0;transform:translateY(-16%) scale(1);}}
@keyframes igs-fx-pop-snap{0%{opacity:1;transform:scale(.2);}6%{transform:scale(1.35);}12%{transform:scale(.86);}18%{transform:scale(1.1) rotate(-6deg);}26%{transform:scale(1) rotate(5deg);}34%{transform:scale(1) rotate(-4deg);}44%{transform:scale(1.06) rotate(0deg);}58%{transform:scale(1) rotate(3deg);}74%{transform:scale(1.04) rotate(-2deg);}90%{opacity:1;transform:scale(1.12);}100%{opacity:0;transform:scale(.4);}}
@keyframes igs-fx-throb-snap{0%{opacity:1;transform:scale(.2);}8%{transform:scale(1.3);}16%{transform:scale(.94);}28%{transform:scale(1.2);}40%{transform:scale(.94);}52%{transform:scale(1.2);}64%{transform:scale(.94);}76%{transform:scale(1.2);}90%{opacity:1;transform:scale(1);}100%{opacity:0;transform:scale(1);}}
@keyframes igs-fx-drip-snap{0%{opacity:1;transform:translateY(-20%) scale(.6);}10%{transform:translateY(0) scale(1.1);}20%{transform:translateY(0) scale(1);}36%{transform:translateY(10%);}52%{transform:translateY(20%);}68%{transform:translateY(30%);}86%{opacity:1;transform:translateY(40%);}100%{opacity:0;transform:translateY(50%);}}
@keyframes igs-fx-fade{0%{opacity:0;}15%{opacity:1;}80%{opacity:1;}100%{opacity:0;}}
@keyframes igs-fx-flash{0%{opacity:.95;}100%{opacity:0;}}
@keyframes igs-fx-flash-snap{0%{opacity:1;}18%{opacity:0;}32%{opacity:.9;}52%{opacity:0;}100%{opacity:0;}}
@keyframes igs-fx-speed{0%{opacity:0;transform:scale(1.08);}16%{opacity:1;transform:scale(1);}72%{opacity:1;}100%{opacity:0;transform:scale(1);}}
@keyframes igs-fx-speed-snap{0%{opacity:1;transform:translate(0,0);}12%{transform:translate(-.6%,.4%);}24%{transform:translate(.5%,-.3%);}36%{transform:translate(-.4%,-.4%);}48%{transform:translate(.4%,.5%);}60%{transform:translate(0,0);}76%{opacity:1;}88%{opacity:.5;}100%{opacity:0;}}
@keyframes igs-fx-beat{0%,100%{opacity:0;}12%{opacity:.9;}24%{opacity:.35;}36%{opacity:.8;}60%{opacity:0;}}
@keyframes igs-fx-slam{0%{opacity:0;transform:translate(-50%,-50%) scale(1.7) rotate(-8deg);}14%{opacity:1;transform:translate(-50%,-50%) scale(.94) rotate(-8deg);}20%{transform:translate(calc(-50% + 4px),calc(-50% - 3px)) scale(1) rotate(-8deg);}26%{transform:translate(calc(-50% - 4px),calc(-50% + 2px)) scale(1) rotate(-8deg);}32%{transform:translate(-50%,-50%) scale(1) rotate(-8deg);}78%{opacity:1;}100%{opacity:0;transform:translate(-50%,-50%) scale(1.08) rotate(-8deg);}}
@keyframes igs-fx-drop{0%{opacity:0;transform:translate(-50%,-120%);}12%{opacity:1;transform:translate(-50%,0);}86%{opacity:1;transform:translate(-50%,0);}100%{opacity:0;transform:translate(-50%,-120%);}}
@keyframes igs-fx-rise{0%{opacity:0;transform:translateY(10px);}14%{opacity:1;transform:translateY(0);}82%{opacity:1;}100%{opacity:0;transform:translateY(-6px);}}
@keyframes igs-fx-lid-top{0%,8%{transform:translateY(0);}30%{transform:translateY(-24%);}42%{transform:translateY(-10%);}64%{transform:translateY(-48%);}100%{transform:translateY(-118%);}}
@keyframes igs-fx-lid-bottom{0%,8%{transform:translateY(0);}30%{transform:translateY(24%);}42%{transform:translateY(10%);}64%{transform:translateY(48%);}100%{transform:translateY(118%);}}
@keyframes igs-fx-lid-shut-top{0%{transform:translateY(-118%);}48%{transform:translateY(-34%);}62%{transform:translateY(-42%);}100%{transform:translateY(0);}}
@keyframes igs-fx-lid-shut-bottom{0%{transform:translateY(118%);}48%{transform:translateY(34%);}62%{transform:translateY(42%);}100%{transform:translateY(0);}}
@keyframes igs-fx-part-throb{0%,100%{transform:scale(1);}50%{transform:scale(1.16);}}
@keyframes igs-fx-part-burst{0%{opacity:0;transform:scale(.55);}25%{opacity:1;}100%{opacity:0;transform:scale(1.28);}}
@keyframes igs-fx-part-slide{0%{opacity:0;transform:translateY(-22%) scale(.7);}24%{opacity:1;transform:translateY(0) scale(1.08);}36%{transform:translateY(0) scale(1);}100%{opacity:1;transform:translateY(30%) scale(1);}}
@keyframes igs-fx-part-float{0%{opacity:0;transform:translateY(40%) scale(.3);}35%{opacity:1;transform:translateY(0) scale(1.15);}50%{transform:translateY(-6%) scale(1);}100%{opacity:1;transform:translateY(-30%) scale(1);}}
@keyframes igs-fx-part-wobble{0%{transform:rotate(0);}25%{transform:rotate(-10deg);}50%{transform:rotate(8deg);}75%{transform:rotate(-4deg);}100%{transform:rotate(0);}}
@keyframes igs-fx-part-pop{0%{opacity:0;transform:scale(.4);}60%{opacity:1;transform:scale(1.12);}100%{opacity:1;transform:scale(1);}}
@keyframes igs-fx-part-dot{0%{opacity:0;transform:translateY(40%) scale(.3);}60%{opacity:1;transform:translateY(-12%) scale(1.15);}100%{opacity:1;transform:translateY(0) scale(1);}}
@keyframes igs-fx-part-draw{0%{stroke-dashoffset:1;}100%{stroke-dashoffset:0;}}
@keyframes igs-fx-part-twinkle{0%,100%{transform:scale(1) rotate(0);}40%{transform:scale(.78) rotate(18deg);}70%{transform:scale(1.12) rotate(0);}}
@keyframes igs-fx-part-blink{0%{opacity:0;transform:scale(.2);}30%{opacity:1;transform:scale(1.2);}55%{opacity:.35;transform:scale(.85);}80%,100%{opacity:1;transform:scale(1);}}
@keyframes igs-fx-buzz{0%,100%{transform:translate(0,0);}20%{transform:translate(-2px,1px);}40%{transform:translate(2px,-1px);}60%{transform:translate(-2px,-1px);}80%{transform:translate(2px,1px);}}
@keyframes igs-fx-ring{0%{opacity:.8;transform:scale(1);}100%{opacity:0;transform:scale(1.55);}}
@keyframes igs-fx-wave{0%,100%{transform:scaleY(.35);}50%{transform:scaleY(1);}}
@keyframes igs-fx-grain{0%{transform:translate(0,0);}25%{transform:translate(-1%,1%);}50%{transform:translate(1%,-1%);}75%{transform:translate(-1%,-1%);}100%{transform:translate(0,0);}}
.igs-fx-symbol{--igs-fx-size:52px;--igs-fx-hue:#ff3b55;--igs-fx-c:color-mix(in oklab,var(--igs-fx-hue) 74%,var(--igs-fx-accent,var(--igs-fx-hue)));--igs-fx-pop:var(--igs-fx-accent,var(--igs-fx-c));--igs-fx-ink:color-mix(in oklab,var(--igs-fx-c) 30%,#2b1024);--igs-fx-rim-c:#fff;--igs-fx-paper:color-mix(in oklab,var(--igs-fx-pop) 18%,#fff);position:absolute;left:66%;top:16%;width:var(--igs-fx-size);height:var(--igs-fx-size);margin:calc(var(--igs-fx-size) / -2) 0 0 calc(var(--igs-fx-size) / -2);display:flex;align-items:center;justify-content:center;animation:igs-fx-pop var(--igs-fx-life,1s) ease-out both;}
.igs-fx-symbol[data-pending]{visibility:hidden;}
.igs-fx-symbol[data-kind="anger"]{--igs-fx-hue:#ff3b55;}
.igs-fx-symbol[data-kind="sweat"]{--igs-fx-hue:#43b4ff;}
.igs-fx-symbol[data-kind="heart"]{--igs-fx-hue:#ff5c9e;}
.igs-fx-symbol[data-kind="surprise"]{--igs-fx-hue:#ffbf1f;}
.igs-fx-symbol[data-kind="silence"]{--igs-fx-hue:#8a7dff;}
.igs-fx-symbol[data-kind="gloom"]{--igs-fx-hue:#5b3fa8;--igs-fx-ink:color-mix(in oklab,var(--igs-fx-c) 45%,#140a26);}
.igs-fx-symbol[data-kind="sparkle"]{--igs-fx-hue:#ffd43b;}
.igs-fx-svg{flex:none;width:122%;height:122%;overflow:visible;display:block;}
.igs-fx-symbol[data-flip]:not([data-kind="surprise"]) .igs-fx-svg{transform:scaleX(-1);}
.igs-fx-svg .igs-fx-g,.igs-fx-svg .igs-fx-dot{transform-box:fill-box;transform-origin:50% 50%;}
.igs-fx-svg .igs-fx-rim{stroke:var(--igs-fx-rim-c);}
.igs-fx-svg .igs-fx-solid>.igs-fx-rim{fill:var(--igs-fx-rim-c);}
.igs-fx-svg .igs-fx-ink{stroke:var(--igs-fx-ink);}
.igs-fx-svg .igs-fx-line{stroke:var(--igs-fx-c);}
.igs-fx-svg .igs-fx-fill{fill:var(--igs-fx-c);stroke:var(--igs-fx-ink);}
.igs-fx-svg .igs-fx-paper{fill:var(--igs-fx-paper);stroke:var(--igs-fx-ink);}
.igs-fx-svg .igs-fx-hi{fill:#fff;opacity:.85;}
.igs-fx-svg .igs-fx-star-b .igs-fx-fill,.igs-fx-svg .igs-fx-star-c .igs-fx-fill,.igs-fx-svg .igs-fx-heart-b .igs-fx-fill,.igs-fx-svg .igs-fx-heart-c .igs-fx-fill,.igs-fx-svg .igs-fx-drop-b .igs-fx-fill{fill:color-mix(in oklab,var(--igs-fx-pop) 55%,var(--igs-fx-c));}
.igs-fx-svg .igs-fx-hi-line{stroke:#fff;opacity:.8;}
.igs-fx-svg .igs-fx-burst{stroke:var(--igs-fx-pop);transform-box:view-box;transform-origin:50px 50px;animation:igs-fx-part-burst .45s ease-out both;}
.igs-fx-svg .igs-fx-vein{animation:igs-fx-part-throb .42s ease-in-out .12s 3;}
.igs-fx-svg .igs-fx-drop-a{animation:igs-fx-part-slide .95s ease-in .05s both;}
.igs-fx-svg .igs-fx-drop-b{animation:igs-fx-part-slide .85s ease-in .3s both;}
.igs-fx-svg .igs-fx-heart-main{animation:igs-fx-part-throb .46s ease-in-out .1s 2;}
.igs-fx-svg .igs-fx-heart-b{animation:igs-fx-part-float .8s ease-out .18s both;}
.igs-fx-svg .igs-fx-heart-c{animation:igs-fx-part-float .8s ease-out .34s both;}
.igs-fx-svg .igs-fx-bang,.igs-fx-svg .igs-fx-ques{transform-origin:50% 100%;animation:igs-fx-part-wobble .6s ease-in-out .12s both;}
.igs-fx-svg .igs-fx-ques{animation-delay:.2s;}
.igs-fx-svg .igs-fx-bubble{animation:igs-fx-part-pop .3s ease-out both;}
.igs-fx-svg .igs-fx-dot{animation:igs-fx-part-dot .3s ease-out both;}
.igs-fx-svg .igs-fx-dot-1{animation-delay:.18s;}
.igs-fx-svg .igs-fx-dot-2{animation-delay:.36s;}
.igs-fx-svg .igs-fx-dot-3{animation-delay:.54s;}
.igs-fx-svg .igs-fx-wave path{stroke-dasharray:1 1;stroke-dashoffset:0;animation:igs-fx-part-draw .5s ease-out both;}
.igs-fx-svg .igs-fx-wave .igs-fx-rim{stroke:rgba(255,255,255,.65);}
.igs-fx-svg .igs-fx-wave-2 path{animation-delay:.1s;}
.igs-fx-svg .igs-fx-wave-3 path{animation-delay:.2s;}
.igs-fx-svg .igs-fx-wave-4 path{animation-delay:.3s;}
.igs-fx-svg .igs-fx-star-main{animation:igs-fx-part-twinkle .7s ease-in-out .1s 2;}
.igs-fx-svg .igs-fx-star-b{animation:igs-fx-part-blink .6s ease-out .22s both;}
.igs-fx-svg .igs-fx-star-c{animation:igs-fx-part-blink .6s ease-out .4s both;}
#igs-overlay[data-igs-dialog-skin="black-white-manga"] .igs-fx-symbol{--igs-fx-c:#161616;--igs-fx-pop:#161616;--igs-fx-ink:#161616;--igs-fx-paper:#fff;}
.igs-fx-speedlines{position:absolute;inset:0;background:repeating-conic-gradient(from 0deg at 50% 45%,rgba(255,255,255,0) 0deg 3deg,rgba(255,255,255,.55) 3deg 3.5deg,rgba(255,255,255,0) 3.5deg 7deg);animation:igs-fx-speed var(--igs-fx-life,.7s) ease-out both;}
.igs-fx-speedlines[data-baked]{background-color:transparent;background-position:50% 45%;background-size:cover;background-repeat:no-repeat;}
.igs-fx-heartbeat{position:absolute;inset:0;--igs-fx-beat:255,110,160;background:radial-gradient(ellipse at 50% 50%,transparent 45%,rgba(var(--igs-fx-beat),.55) 100%);animation:igs-fx-beat 1.2s ease-in-out 2 both;}
.igs-fx-heartbeat[data-tone="tense"]{--igs-fx-beat:120,10,20;}
.igs-fx-flash{position:absolute;inset:0;background:#fff;animation:igs-fx-flash .8s ease-out both;}
.igs-fx-title-card{position:absolute;left:0;right:0;top:20%;display:flex;flex-direction:column;align-items:center;gap:6px;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.65);animation:igs-fx-fade var(--igs-fx-life,2.7s) ease both;}
.igs-fx-title-card::before,.igs-fx-title-card::after{content:"";width:min(46%,320px);height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);}
.igs-fx-title-main{font-size:clamp(20px,3.4vw,34px);font-weight:700;letter-spacing:.28em;padding-left:.28em;}
.igs-fx-title-sub{font-size:clamp(13px,1.8vw,17px);letter-spacing:.2em;opacity:.9;}
.igs-fx-favor-stack{position:absolute;top:56px;right:14px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;}
.igs-fx-favor{padding:4px 12px;border-radius:999px;font-size:13px;color:#fff;background:rgba(20,20,28,.62);border:1px solid rgba(255,255,255,.18);animation:igs-fx-rise var(--igs-fx-life,2.4s) ease both;}
.igs-fx-favor[data-dir="up"]{border-color:rgba(255,140,180,.7);}
.igs-fx-favor[data-dir="down"]{border-color:rgba(140,170,255,.7);}
.igs-fx-notify{position:absolute;top:12px;left:50%;width:min(86%,360px);padding:10px 14px;border-radius:14px;color:#1d1d24;background:rgba(250,250,252,.94);box-shadow:0 6px 22px rgba(0,0,0,.28);animation:igs-fx-drop var(--igs-fx-life,3.3s) ease both;}
.igs-fx-notify-sender{font-size:12px;font-weight:700;opacity:.7;margin-bottom:2px;}
.igs-fx-notify-text{font-size:14px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-fx-sfx{position:absolute;left:50%;top:40%;font:italic 900 clamp(48px,10vw,110px)/1 system-ui,sans-serif;color:#fff;-webkit-text-stroke:3px #111;paint-order:stroke fill;text-shadow:5px 5px 0 rgba(0,0,0,.55);white-space:nowrap;animation:igs-fx-slam var(--igs-fx-life,1s) ease-out both;}
.igs-fx-eye,.igs-fx-eye-hold{position:absolute;inset:0;overflow:hidden;}
.igs-fx-eye::before,.igs-fx-eye::after,.igs-fx-eye-hold::before,.igs-fx-eye-hold::after{content:"";position:absolute;left:-25%;right:-25%;height:56%;background:#000;box-shadow:0 0 32px 18px #000;}
.igs-fx-eye::before,.igs-fx-eye-hold::before{top:0;border-radius:0 0 50% 50%/0 0 30% 30%;}
.igs-fx-eye::after,.igs-fx-eye-hold::after{bottom:0;border-radius:50% 50% 0 0/30% 30% 0 0;}
.igs-fx-eye::before{animation:igs-fx-lid-top 1.6s cubic-bezier(.45,0,.35,1) both;}
.igs-fx-eye::after{animation:igs-fx-lid-bottom 1.6s cubic-bezier(.45,0,.35,1) both;}
.igs-fx-eye-hold::before{animation:igs-fx-lid-shut-top 1.2s cubic-bezier(.5,0,.4,1) both;}
.igs-fx-eye-hold::after{animation:igs-fx-lid-shut-bottom 1.2s cubic-bezier(.5,0,.4,1) both;}
.igs-fx-call-screen{position:absolute;inset:0;pointer-events:auto;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#fff;background:linear-gradient(180deg,rgba(18,24,40,.9),rgba(8,10,18,.94));animation:igs-fx-fade 2.4s ease both;}
.igs-fx-call-ring{position:relative;width:84px;height:84px;animation:igs-fx-buzz .35s linear 3;}
.igs-fx-call-ring::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid rgba(255,255,255,.55);animation:igs-fx-ring 1s ease-out infinite;}
.igs-fx-call-avatar{width:84px;height:84px;border-radius:50%;object-fit:cover;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;background:#5b6b8f;}
.igs-fx-call-name{font-size:22px;font-weight:700;letter-spacing:.08em;}
.igs-fx-call-state{font-size:14px;opacity:.8;}
.igs-fx-call-hint{margin-top:18px;padding:6px 18px;border-radius:999px;background:#34c759;font-size:13px;}
.igs-fx-call-badge{position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:4px 14px 4px 10px;border-radius:999px;font-size:12px;color:#eafff0;background:rgba(20,110,60,.72);}
.igs-fx-call-badge::before{content:"";width:14px;height:12px;background:linear-gradient(90deg,currentColor 0 2px,transparent 2px 4px,currentColor 4px 6px,transparent 6px 8px,currentColor 8px 10px,transparent 10px 12px,currentColor 12px 14px);transform-origin:50% 50%;animation:igs-fx-wave .9s ease-in-out infinite;}
.igs-fx-call-end{position:absolute;top:14px;left:50%;transform:translateX(-50%);padding:4px 14px;border-radius:999px;font-size:12px;color:#fff;background:rgba(200,50,50,.75);animation:igs-fx-fade var(--igs-fx-life,1.8s) ease both;}
.igs-fx-letterbox-bar{position:absolute;left:0;right:0;height:9%;background:#000;transform:scaleY(0);transition:transform .6s ease;}
.igs-fx-letterbox-bar.is-top{top:0;transform-origin:50% 0;}
.igs-fx-letterbox-bar.is-bottom{bottom:0;transform-origin:50% 100%;}
#igs-stage-motion[data-igs-fx-letterbox] .igs-fx-letterbox-bar{transform:scaleY(1);}
.igs-fx-flashback-grain{position:absolute;inset:-4%;opacity:0;transition:opacity .6s ease;background:radial-gradient(ellipse at 50% 50%,transparent 50%,rgba(40,24,8,.55) 100%),repeating-radial-gradient(circle at 30% 40%,rgba(255,240,210,.08) 0 1px,transparent 1px 3px);}
@keyframes igs-fx-dream-drift{from{transform:translate3d(-3%,-1%,0) scale(1.02);}to{transform:translate3d(3%,2%,0) scale(1.06);}}
#igs-stage-motion[data-igs-fx-flashback] .igs-fx-flashback-grain{opacity:1;will-change:transform;animation:igs-fx-grain .5s steps(2) infinite;}
.igs-fx-dream-mist{position:absolute;inset:-8%;opacity:0;pointer-events:none;transition:opacity .8s ease;background:radial-gradient(ellipse 58% 48% at 28% 34%,rgba(206,196,255,.22),transparent 70%),radial-gradient(ellipse 54% 44% at 72% 68%,rgba(170,184,255,.18),transparent 70%),repeating-radial-gradient(circle at 30% 40%,rgba(235,238,255,.08) 0 1px,transparent 1px 4px);mix-blend-mode:screen;filter:blur(2px);}
#igs-stage-motion[data-igs-fx-dream] .igs-fx-dream-mist{opacity:1;will-change:transform;animation:igs-fx-dream-drift 8s ease-in-out infinite alternate;}
#igs-stage-motion[data-igs-fx-flashback] #igs-bg{filter:brightness(var(--igs-bg-brightness,1)) sepia(.55) saturate(.55) brightness(.92) contrast(.95)!important;-webkit-filter:brightness(var(--igs-bg-brightness,1)) sepia(.55) saturate(.55) brightness(.92) contrast(.95)!important;}
#igs-stage-motion[data-igs-fx-flashback] #igs-sprite{filter:sepia(.55) saturate(.55) brightness(.92) contrast(.95)!important;-webkit-filter:sepia(.55) saturate(.55) brightness(.92) contrast(.95)!important;}
#igs-stage-motion[data-igs-fx-dream] #igs-bg{filter:brightness(var(--igs-bg-brightness,1)) saturate(.72) brightness(1.03) contrast(.94)!important;-webkit-filter:brightness(var(--igs-bg-brightness,1)) saturate(.72) brightness(1.03) contrast(.94)!important;}
#igs-stage-motion[data-igs-fx-dream] #igs-sprite{filter:saturate(.78) brightness(1.02) contrast(.96)!important;-webkit-filter:saturate(.78) brightness(1.02) contrast(.96)!important;}
#igs-stage-motion[data-igs-fx-busy] .igs-dialog,#igs-stage-motion[data-igs-fx-busy] .igs-option-bubble,#igs-stage-motion[data-igs-fx-busy] .igs-ctrl-bar{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;}
#igs-stage-motion[data-igs-fx-flashback] .igs-dialog{opacity:.9;}
#igs-stage-motion[data-igs-fx-dream] .igs-dialog{opacity:.94;}
#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-symbol{animation-name:igs-fx-pop-snap;animation-timing-function:steps(1,end);}
#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-symbol[data-kind="anger"]{animation-name:igs-fx-throb-snap;}
#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-svg *{animation-timing-function:steps(2,end);}
#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-symbol[data-kind="sweat"]{animation-name:igs-fx-drip-snap;}
#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-speedlines{animation-name:igs-fx-speed-snap;animation-timing-function:steps(1,end);}
#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-flash{animation-name:igs-fx-flash-snap;animation-timing-function:steps(1,end);}
#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-heartbeat,#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-sfx{animation-timing-function:steps(1,end);}
#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-title-card,#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-favor,#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-notify,#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-call-end{animation-timing-function:steps(3,end);}
@media (prefers-reduced-motion: reduce){
.igs-fx-layer *,.igs-fx-layer *::before,.igs-fx-layer *::after{animation:none!important;transition:none!important;}
.igs-fx-eye,.igs-fx-flash,.igs-fx-speedlines{display:none!important;}
.igs-fx-notify{transform:translateX(-50%);}
.igs-fx-sfx{transform:translate(-50%,-50%) rotate(-8deg);}
.igs-fx-symbol{transform:none;}
}
`.trim();
