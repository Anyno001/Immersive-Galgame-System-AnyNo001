// 演出样式：#igs-fx-stage 在立绘之上、对话层之下；#igs-fx-front 在对话层与选项之上、工具栏之下。
// 区间演出由 #igs-stage-motion 上的 data-igs-fx-* 属性驱动，皮肤可覆写。
// 瞬时演出时长读 --igs-fx-life（运行时按停留档位写入）；data-igs-fx-motion="snappy" 为灵动演出：
// 逐关键帧定格（steps）模拟漫画分镜的一拍一拍卡顿感，渐变演出为默认缓动。
const HANDSET_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
const HANDSET = `url("data:image/svg+xml,${encodeURIComponent(HANDSET_SVG)}")`;
// 通话计时：注册成整数的自定义属性由动画逐秒步进，再经 counter 显示成 mm:ss，全程不需要脚本每秒改 DOM。
const CALL_TIMER_ANIMATION = 'igs-fx-mm 3600s steps(60,end) infinite,igs-fx-ss 60s steps(60,end) infinite';
export const FX_STYLE_TEXT = `
@property --igs-fx-mm{syntax:"<integer>";inherits:false;initial-value:0;}
@property --igs-fx-ss{syntax:"<integer>";inherits:false;initial-value:0;}
.igs-fx-layer{position:absolute;inset:0;pointer-events:none;overflow:hidden;contain:layout paint style;}
#igs-fx-stage{z-index:2;}
#igs-fx-front{z-index:6;}
.igs-fx-layer [hidden]{display:none!important;}
/* 报幕期间暂隐左上状态栏、人物立绘和对话框；状态撤销后沿用原样式恢复。 */
#igs-stage-motion[data-igs-fx-presentation="1"] #igs-status-hud,
#igs-stage-motion[data-igs-fx-presentation="1"] #igs-sprite,
#igs-stage-motion[data-igs-fx-presentation="1"] #igs-dialog-layer{display:none!important;pointer-events:none!important;}
/* 区间氛围：只改展示层。关灯压暗挂在 #igs-fx-stage 自身背景上（立绘之上、对话层之下），压过时段调色；看电影用 ::before 屏幕光；撑伞用 ::after 伞面剪影。 */
#igs-stage-motion[data-igs-fx-lightsoff] #igs-fx-stage{background:linear-gradient(180deg,rgba(6,12,34,.62),rgba(4,8,22,.78));}
#igs-stage-motion[data-igs-fx-movie] #igs-fx-stage::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(150,190,255,.28),rgba(0,0,0,.62) 70%);animation:igs-fx-movie-flicker 2.6s ease-in-out infinite;}
#igs-stage-motion[data-igs-fx-umbrella] #igs-fx-stage::after{content:'';position:absolute;left:8%;right:8%;top:-34%;height:62%;border-radius:50%;background:radial-gradient(ellipse at 50% 100%,rgba(38,54,86,.78) 60%,rgba(24,34,56,.92));box-shadow:0 10px 24px rgba(0,0,0,.35);transform-origin:50% 0;animation:igs-fx-umbrella-open .5s ease-out both;}
@keyframes igs-fx-movie-flicker{0%,100%{opacity:1;}35%{opacity:.82;}55%{opacity:.95;}72%{opacity:.76;}}
@keyframes igs-fx-umbrella-open{from{transform:scaleX(.2);opacity:0;}}
@media (prefers-reduced-motion: reduce){#igs-stage-motion[data-igs-fx-movie] #igs-fx-stage::before,#igs-stage-motion[data-igs-fx-umbrella] #igs-fx-stage::after{animation:none!important;}}
/* 古代背景关灯为「吹灯」：烛火一晃熄灭，随后升起一缕青烟；区间压暗仍由 data-igs-fx-lightsoff 驱动。 */
.igs-fx-candle{position:absolute;left:50%;top:26%;width:34px;height:130px;margin-left:-17px;pointer-events:none;animation:igs-fx-candle-fade var(--igs-fx-life,1600ms) ease-out both;}
.igs-fx-candle-body{position:absolute;left:7px;right:7px;bottom:0;height:78px;border-radius:3px 3px 2px 2px;background:linear-gradient(90deg,#d9c9a3,#f4ead2 45%,#cdb98f);box-shadow:0 6px 16px rgba(0,0,0,.4);}
.igs-fx-candle-body::before{content:'';position:absolute;left:50%;top:-8px;width:2px;height:9px;margin-left:-1px;background:#2b1d12;}
.igs-fx-candle-flame{position:absolute;left:50%;bottom:86px;width:14px;height:26px;margin-left:-7px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(ellipse at 50% 72%,#fff6d8 0 22%,#ffc861 45%,rgba(255,120,30,.85) 70%,rgba(255,90,20,0) 100%);box-shadow:0 0 22px 8px rgba(255,170,70,.45);transform-origin:50% 100%;animation:igs-fx-candle-blow var(--igs-fx-life,1600ms) ease-in both;}
.igs-fx-candle-smoke{position:absolute;left:50%;bottom:88px;width:6px;height:34px;margin-left:-3px;border-radius:50%;background:linear-gradient(0deg,rgba(210,210,210,.55),rgba(210,210,210,0));filter:blur(2px);opacity:0;transform-origin:50% 100%;animation:igs-fx-candle-smoke var(--igs-fx-life,1600ms) ease-out both;}
@keyframes igs-fx-candle-fade{0%{opacity:0;}10%{opacity:1;}80%{opacity:1;}100%{opacity:0;}}
@keyframes igs-fx-candle-blow{0%{transform:scale(1) skewX(0);opacity:1;}20%{transform:scale(1.05,1) skewX(-4deg);}32%{transform:scale(.9,1.15) skewX(18deg);}42%{transform:scale(.75,.9) skewX(-10deg);opacity:1;}52%{transform:scale(.2,.3) skewX(6deg);opacity:0;}100%{transform:scale(0);opacity:0;}}
@keyframes igs-fx-candle-smoke{0%,48%{opacity:0;transform:translateY(0) scale(.6);}62%{opacity:.8;}100%{opacity:0;transform:translate(8px,-46px) scale(1.4,2);}}
@media (prefers-reduced-motion: reduce){.igs-fx-candle{display:none!important;}}

/* 约定便笺：红色「约」印为 CSS 圆框文字；古代背景为宣纸竖排「立契」。 */
.igs-fx-promise{position:absolute;left:50%;top:18%;transform:translateX(-50%) rotate(-2deg);min-width:min(220px,64%);max-width:84%;box-sizing:border-box;padding:12px 44px 12px 16px;border-radius:6px;background:#fdf6e3;color:#4a3b2a;box-shadow:0 6px 20px rgba(0,0,0,.3);animation:igs-fx-promise-in .3s ease-out both;}
.igs-fx-promise-title{font-size:.8em;opacity:.7;letter-spacing:.2em;}
.igs-fx-promise-text{margin-top:4px;font-size:1.05em;font-weight:700;}
.igs-fx-promise-seal{position:absolute;right:10px;top:50%;width:28px;height:28px;margin-top:-14px;border:2px solid #c0392b;border-radius:50%;color:#c0392b;font-weight:700;line-height:24px;text-align:center;box-sizing:border-box;animation:igs-fx-promise-stamp .36s .4s ease-out both;}
.igs-fx-promise.is-ancient{writing-mode:vertical-rl;padding:16px 14px 44px;min-width:0;background:#f3ead3;border:1px solid #b89b6a;}
.igs-fx-promise.is-ancient .igs-fx-promise-seal{right:auto;top:auto;left:50%;bottom:10px;margin:0 0 0 -14px;border-radius:3px;writing-mode:horizontal-tb;}
@keyframes igs-fx-promise-in{from{opacity:0;transform:translateX(-50%) translateY(-10px) rotate(-2deg);}}
@keyframes igs-fx-promise-stamp{from{opacity:0;transform:scale(1.8);}to{opacity:1;transform:scale(1);}}
@media (prefers-reduced-motion: reduce){.igs-fx-promise,.igs-fx-promise-seal{animation:none!important;}}

/* 脸部特写切入：斜向横贯分格，底图为说话人立绘按头部裁切；只用 background 换算，不读像素。 */
.igs-fx-cutin{position:absolute;left:-4%;right:-4%;top:22%;transform:rotate(-4deg);border-top:3px solid #fff;border-bottom:3px solid #fff;box-shadow:0 6px 24px rgba(0,0,0,.45);overflow:hidden;animation:igs-fx-cutin var(--igs-fx-life,1400ms) ease-out both;}
.igs-fx-cutin-face{width:100%;aspect-ratio:1/0.34;background-repeat:no-repeat;}
.igs-fx-cutin.is-reduced{animation:igs-fx-cutin-fade var(--igs-fx-life,1400ms) linear both;}
@keyframes igs-fx-cutin{0%{opacity:0;transform:translateX(-30%) rotate(-4deg);}14%{opacity:1;transform:translateX(0) rotate(-4deg);}82%{opacity:1;transform:translateX(0) rotate(-4deg);}100%{opacity:0;transform:translateX(30%) rotate(-4deg);}}
@keyframes igs-fx-cutin-fade{0%,100%{opacity:0;}15%,85%{opacity:1;}}
.igs-fx-contact{display:flex;align-items:center;gap:8px;}
.igs-fx-contact .igs-fx-call-avatar{width:32px;height:32px;border-radius:50%;flex:none;object-fit:cover;}
@media (prefers-reduced-motion: reduce){.igs-fx-cutin{animation:igs-fx-cutin-fade var(--igs-fx-life,1400ms) linear both!important;}}

/* 悄悄话区间：只改展示（字号、透明度、对话框内侧暗角），不改写正文。 */
#igs-stage-motion[data-igs-fx-whisper="1"] #igs-text{font-size:.9em;opacity:.78;}
#igs-stage-motion[data-igs-fx-whisper="1"] #igs-dialog-layer{box-shadow:inset 0 0 42px rgba(0,0,0,.38);}
.igs-fx-voicemail{position:absolute;right:4%;top:14%;max-width:min(320px,72%);box-sizing:border-box;padding:10px 14px;border-radius:12px;background:rgba(20,22,28,.86);color:#fff;font-size:.85em;box-shadow:0 6px 20px rgba(0,0,0,.3);animation:igs-fx-vm-in .3s ease-out both;}
.igs-fx-voicemail-head{display:flex;gap:8px;align-items:center;opacity:.8;margin-bottom:4px;}
.igs-fx-voicemail-wave{flex:none;width:48px;height:14px;background:repeating-linear-gradient(90deg,currentColor 0 2px,transparent 2px 5px);opacity:.7;}
.igs-fx-voicemail-text{-webkit-mask-image:linear-gradient(90deg,#000 50%,transparent 50%);mask-image:linear-gradient(90deg,#000 50%,transparent 50%);-webkit-mask-size:200% 100%;mask-size:200% 100%;-webkit-mask-position:100% 0;mask-position:100% 0;animation:igs-fx-vm-reveal calc(var(--igs-fx-life,3000ms) * .6) linear forwards;}
@keyframes igs-fx-vm-in{from{opacity:0;transform:translateX(12px);}}
@keyframes igs-fx-vm-reveal{to{-webkit-mask-position:0 0;mask-position:0 0;}}
@media (prefers-reduced-motion: reduce){.igs-fx-voicemail,.igs-fx-voicemail-text{animation:none!important;-webkit-mask-image:none;mask-image:none;}}

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
@keyframes igs-fx-part-sway{0%,100%{transform:rotate(0) translateY(0);}25%{transform:rotate(-8deg) translateY(-4%);}75%{transform:rotate(8deg) translateY(-4%);}}
@keyframes igs-fx-part-split-l{0%,35%{transform:translate(0,0) rotate(0);}55%{transform:translate(-4%,1%) rotate(-6deg);}100%{transform:translate(-8%,6%) rotate(-12deg);}}
@keyframes igs-fx-part-split-r{0%,35%{transform:translate(0,0) rotate(0);}55%{transform:translate(4%,1%) rotate(6deg);}100%{transform:translate(8%,8%) rotate(12deg);}}
@keyframes igs-fx-part-drift{0%{opacity:0;transform:translate(-18%,10%) scale(.4);}35%{opacity:1;transform:translate(0,0) scale(1.06);}50%{transform:translate(0,0) scale(1);}100%{opacity:.9;transform:translate(8%,-10%) scale(1.08);}}
@keyframes igs-fx-part-spin{from{transform:rotate(0);}to{transform:rotate(360deg);}}
@keyframes igs-fx-part-flicker{0%{transform:scale(1,1) skewX(0);}50%{transform:scale(.95,1.08) skewX(-3deg);}100%{transform:scale(1.04,.96) skewX(3deg);}}
@keyframes igs-fx-part-freeze{0%{opacity:0;transform:rotate(-90deg) scale(.3);}60%{opacity:1;transform:rotate(8deg) scale(1.08);}100%{opacity:1;transform:rotate(0) scale(1);}}
@keyframes igs-fx-part-blink{0%{opacity:0;transform:scale(.2);}30%{opacity:1;transform:scale(1.2);}55%{opacity:.35;transform:scale(.85);}80%,100%{opacity:1;transform:scale(1);}}
@keyframes igs-fx-buzz{0%,100%{transform:translate(0,0);}20%{transform:translate(-2px,1px);}40%{transform:translate(2px,-1px);}60%{transform:translate(-2px,-1px);}80%{transform:translate(2px,1px);}}
@keyframes igs-fx-ring{0%{opacity:.8;transform:scale(1);}100%{opacity:0;transform:scale(1.55);}}
@keyframes igs-fx-wave{0%,100%{transform:scaleY(.35);}50%{transform:scaleY(1);}}
@keyframes igs-fx-mm{from{--igs-fx-mm:0;}to{--igs-fx-mm:60;}}
@keyframes igs-fx-ss{from{--igs-fx-ss:0;}to{--igs-fx-ss:60;}}
@keyframes igs-fx-video-in{0%{opacity:0;transform:translateX(-50%) scale(.6);}100%{opacity:1;transform:translateX(-50%) scale(1);}}
@keyframes igs-fx-video-out{0%{opacity:1;transform:translateX(-50%) scale(1);}100%{opacity:0;transform:translateX(-50%) scale(.2,.02);}}
@keyframes igs-fx-call-end-in{0%{opacity:0;transform:translateX(-50%) scale(.6);}10%{opacity:1;transform:translateX(-50%) scale(1.08);}18%{transform:translateX(-50%) scale(1);}80%{opacity:1;transform:translateX(-50%) scale(1);}100%{opacity:.8;transform:translateX(-50%) scale(.9);}}
@keyframes igs-fx-call-end-morph{0%{background:rgba(20,110,60,.72);transform:translateX(-50%) scale(1);}14%{background:var(--igs-fx-end-bg);transform:translateX(-50%) scale(1.08);}22%{transform:translateX(-50%) scale(1);}80%{opacity:1;transform:translateX(-50%) scale(1);}100%{opacity:.8;transform:translateX(-50%) scale(.9);}}
@keyframes igs-fx-call-outcome{0%,62%{opacity:0;transform:translateY(6px);}72%,100%{opacity:1;transform:translateY(0);}}
@keyframes igs-fx-call-press{0%,66%{transform:scale(1);filter:none;}74%{transform:scale(.8);filter:brightness(.7);}84%,100%{transform:scale(1);filter:none;}}
@keyframes igs-fx-call-giveup{0%,62%{filter:none;opacity:1;}74%,100%{filter:grayscale(1);opacity:.55;}}
@keyframes igs-fx-pip-out{0%{opacity:1;transform:scale(1);}100%{opacity:0;transform:translateY(-20%) scale(.4);}}
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
.igs-fx-symbol[data-kind="bulb"]{--igs-fx-hue:#ffc93c;}
.igs-fx-symbol[data-kind="note"]{--igs-fx-hue:#2ec4a6;}
.igs-fx-symbol[data-kind="zzz"]{--igs-fx-hue:#6f8dff;}
.igs-fx-symbol[data-kind="heartbreak"]{--igs-fx-hue:#e0456f;}
.igs-fx-symbol[data-kind="sigh"]{--igs-fx-hue:#c3cfdc;--igs-fx-ink:color-mix(in oklab,var(--igs-fx-c) 35%,#27303d);}
.igs-fx-symbol[data-kind="dizzy"]{--igs-fx-hue:#22b8d1;}
.igs-fx-symbol[data-kind="fire"]{--igs-fx-hue:#ff6a2b;}
.igs-fx-symbol[data-kind="frost"]{--igs-fx-hue:#6fd3ff;}
.igs-fx-svg{flex:none;width:122%;height:122%;overflow:visible;display:block;}
.igs-fx-symbol[data-flip]:not([data-kind="surprise"]):not([data-kind="zzz"]) .igs-fx-svg{transform:scaleX(-1);}
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
.igs-fx-svg .igs-fx-filament{stroke:var(--igs-fx-ink);}
.igs-fx-svg .igs-fx-bulb-base .igs-fx-fill{fill:color-mix(in oklab,var(--igs-fx-ink) 30%,#d9dde4);}
.igs-fx-svg .igs-fx-bulb{animation:igs-fx-part-blink .6s ease-out .08s both;}
.igs-fx-svg .igs-fx-note-main{transform-origin:50% 100%;animation:igs-fx-part-sway .5s ease-in-out .1s 2;}
.igs-fx-svg .igs-fx-note-b{animation:igs-fx-part-float .8s ease-out .25s both;}
.igs-fx-svg .igs-fx-z-1{animation:igs-fx-part-float .7s ease-out both;}
.igs-fx-svg .igs-fx-z-2{animation:igs-fx-part-float .7s ease-out .22s both;}
.igs-fx-svg .igs-fx-z-3{animation:igs-fx-part-float .7s ease-out .44s both;}
.igs-fx-svg .igs-fx-break-l{animation:igs-fx-part-split-l .8s ease-out .1s both;}
.igs-fx-svg .igs-fx-break-r{animation:igs-fx-part-split-r .8s ease-out .1s both;}
.igs-fx-svg .igs-fx-puff{animation:igs-fx-part-drift .9s ease-out .15s both;}
.igs-fx-svg .igs-fx-puff-b{animation:igs-fx-part-pop .25s ease-out .05s both;}
.igs-fx-svg .igs-fx-puff-c{animation:igs-fx-part-pop .25s ease-out both;}
.igs-fx-svg .igs-fx-spiral{animation:igs-fx-part-spin .9s linear both;}
.igs-fx-svg .igs-fx-orbit{transform-box:view-box;transform-origin:50px 50px;animation:igs-fx-part-spin 1s linear reverse both;}
.igs-fx-svg .igs-fx-flame{transform-origin:50% 100%;animation:igs-fx-part-flicker .24s ease-in-out 4 alternate;}
.igs-fx-svg .igs-fx-flame-in{fill:color-mix(in oklab,var(--igs-fx-c) 30%,#ffe45c);}
.igs-fx-svg .igs-fx-crystal{animation:igs-fx-part-freeze .6s ease-out both;}
/* 古代背景的三个符号：油灯（青铜灯盏 + 跳动火苗）、墨点（笔触波纹 + 三颗墨点）、鼻涕泡（鼓起后一胀一缩）。 */
.igs-fx-symbol[data-era="ancient"][data-kind="bulb"]{--igs-fx-hue:#ff9a3c;}
.igs-fx-symbol[data-era="ancient"][data-kind="note"]{--igs-fx-hue:#34485a;--igs-fx-ink:#141a22;}
.igs-fx-symbol[data-era="ancient"][data-kind="zzz"]{--igs-fx-hue:#9fdcff;}
.igs-fx-svg .igs-fx-lamp{animation:igs-fx-part-pop .35s ease-out both;}
.igs-fx-svg .igs-fx-lamp-flame{transform-origin:50% 100%;animation:igs-fx-part-flicker .24s ease-in-out .15s 4 alternate;}
.igs-fx-svg .igs-fx-lamp-bowl .igs-fx-fill{fill:color-mix(in oklab,#b8863b 72%,var(--igs-fx-ink));}
.igs-fx-svg .igs-fx-inkwave path{stroke-dasharray:none;}
.igs-fx-svg .igs-fx-inkwave{animation:igs-fx-part-pop .3s ease-out both;}
.igs-fx-svg .igs-fx-inkdot-1{animation:igs-fx-part-dot .35s ease-out .12s both;}
.igs-fx-svg .igs-fx-inkdot-2{animation:igs-fx-part-dot .35s ease-out .28s both;}
.igs-fx-svg .igs-fx-inkdot-3{animation:igs-fx-part-dot .35s ease-out .44s both;}
.igs-fx-svg .igs-fx-snot .igs-fx-fill,.igs-fx-svg .igs-fx-snot-b .igs-fx-fill{fill:color-mix(in oklab,var(--igs-fx-c) 45%,#fff);fill-opacity:.82;}
.igs-fx-svg .igs-fx-snot{transform-origin:0% 100%;animation:igs-fx-part-inflate .6s ease-out both,igs-fx-part-throb .9s ease-in-out .6s 2;}
.igs-fx-svg .igs-fx-snot-b{animation:igs-fx-part-pop .25s ease-out both;}
@keyframes igs-fx-part-inflate{0%{opacity:0;transform:scale(.15);}45%{opacity:1;transform:scale(1.08);}70%{transform:scale(.95);}100%{opacity:1;transform:scale(1);}}
#igs-overlay[data-igs-dialog-skin="black-white-manga"] .igs-fx-symbol{--igs-fx-c:#161616;--igs-fx-pop:#161616;--igs-fx-ink:#161616;--igs-fx-paper:#fff;}
#igs-overlay[data-igs-dialog-skin="black-white-manga"] .igs-fx-svg .igs-fx-flame-in{fill:#fff;}
.igs-fx-speedlines{position:absolute;inset:0;background:repeating-conic-gradient(from 0deg at 50% 45%,rgba(255,255,255,0) 0deg 3deg,rgba(255,255,255,.55) 3deg 3.5deg,rgba(255,255,255,0) 3.5deg 7deg);animation:igs-fx-speed var(--igs-fx-life,.7s) ease-out both;}
.igs-fx-speedlines[data-baked]{background-color:transparent;background-position:50% 45%;background-size:cover;background-repeat:no-repeat;}
.igs-fx-heartbeat{position:absolute;inset:0;--igs-fx-beat:255,110,160;background:radial-gradient(ellipse at 50% 50%,transparent 45%,rgba(var(--igs-fx-beat),.55) 100%);animation:igs-fx-beat 1.2s ease-in-out 2 both;}
.igs-fx-heartbeat[data-tone="tense"]{--igs-fx-beat:120,10,20;}
.igs-fx-flash{position:absolute;inset:0;background:#fff;animation:igs-fx-flash .8s ease-out both;}
.igs-fx-title-card{position:absolute;left:0;right:0;top:20%;display:flex;flex-direction:column;align-items:center;gap:6px;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.65);animation:igs-fx-fade var(--igs-fx-life,2.7s) ease both;}
.igs-fx-title-card::before,.igs-fx-title-card::after{content:"";width:min(46%,320px);height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.85),transparent);}
.igs-fx-title-main{font-size:clamp(20px,3.4vw,34px);font-weight:700;letter-spacing:.28em;padding-left:.28em;}
.igs-fx-title-sub{font-size:clamp(13px,1.8vw,17px);letter-spacing:.2em;opacity:.9;}
/* 古代背景标题卡：宣纸竖幅，楷体竖排，地点在右、时间在左，末尾盖朱印。 */
.igs-fx-title-card.is-ancient{left:50%;right:auto;top:9%;transform:translateX(-50%);writing-mode:vertical-rl;align-items:flex-start;gap:12px;padding:22px 16px 18px;border:1px solid rgba(120,70,30,.4);border-radius:2px;background:#f6ecd4;box-shadow:0 10px 30px rgba(0,0,0,.4),inset 0 0 0 4px #f6ecd4,inset 0 0 0 5px rgba(184,69,47,.45);color:#2b1d12;text-shadow:none;font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;}
.igs-fx-title-card.is-ancient::before{display:none;}
.igs-fx-title-card.is-ancient::after{width:22px;height:22px;align-self:flex-end;border-radius:3px;background:#b8452f;box-shadow:inset 0 0 0 2px #f6ecd4,inset 0 0 0 3px #b8452f;}
.igs-fx-title-card.is-ancient .igs-fx-title-main{font-size:clamp(28px,6vmin,48px);font-weight:400;letter-spacing:.3em;padding:0;}
.igs-fx-title-card.is-ancient .igs-fx-title-sub{font-size:clamp(14px,2.2vmin,18px);color:#7a2a1a;opacity:1;letter-spacing:.3em;padding-top:1.2em;}
.igs-fx-favor-stack{position:absolute;top:56px;right:14px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;}
.igs-fx-favor{padding:4px 12px;border-radius:999px;font-size:13px;color:#fff;background:rgba(20,20,28,.62);border:1px solid rgba(255,255,255,.18);animation:igs-fx-rise var(--igs-fx-life,2.4s) ease both;}
.igs-fx-favor[data-dir="up"]{border-color:rgba(255,140,180,.7);}
.igs-fx-favor[data-dir="down"]{border-color:rgba(140,170,255,.7);}
.igs-fx-notify{position:absolute;top:12px;left:50%;width:min(86%,360px);padding:10px 14px;border-radius:14px;color:#1d1d24;background:rgba(250,250,252,.94);box-shadow:0 6px 22px rgba(0,0,0,.28);animation:igs-fx-drop var(--igs-fx-life,3.3s) ease both;}
.igs-fx-notify-sender{font-size:12px;font-weight:700;opacity:.7;margin-bottom:2px;}
.igs-fx-notify-text{font-size:14px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
@keyframes igs-fx-slip{0%{opacity:0;transform:translateX(120%);}12%{opacity:1;transform:translateX(0);}86%{opacity:1;transform:translateX(0);}100%{opacity:0;transform:translateX(120%);}}
.igs-fx-notify.is-ancient{left:auto;right:16px;top:14px;width:auto;max-height:min(62%,320px);padding:14px 10px;border-radius:2px;writing-mode:vertical-rl;color:#2b1d12;background:#f6ecd4;border:1px solid rgba(120,70,30,.45);box-shadow:0 6px 22px rgba(0,0,0,.35);font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;animation:igs-fx-slip var(--igs-fx-life,3.3s) ease both;}
.igs-fx-notify.is-ancient .igs-fx-notify-seal{width:26px;height:26px;margin-left:8px;border-radius:3px;background:#b8452f;color:#fff6e6;font-size:16px;line-height:26px;text-align:center;}
/* 世界观换皮：西幻为羊皮纸与蜡封，科幻为全息面板青色辉光，末日为旧纸与锈色虚线。只改配色字体，不改位置与动画。 */
.igs-fx-notify.is-fantasy{color:#3a2614;background:#efe2c2;border:1px solid rgba(110,70,30,.5);border-radius:4px;box-shadow:0 6px 22px rgba(0,0,0,.32),inset 0 0 18px rgba(120,80,30,.18);font-family:Georgia,"Times New Roman",serif;}
.igs-fx-notify.is-scifi{color:#d8fbff;background:rgba(8,24,36,.88);border:1px solid rgba(80,220,255,.7);border-radius:4px;box-shadow:0 0 14px rgba(60,200,255,.45),inset 0 0 12px rgba(60,200,255,.18);letter-spacing:.04em;}
.igs-fx-notify.is-apocalypse{color:#e8dfcf;background:rgba(48,40,32,.93);border:1px dashed rgba(200,150,80,.6);border-radius:2px;box-shadow:0 6px 18px rgba(0,0,0,.5);font-family:"Courier New",monospace;}
.igs-fx-title-card.is-fantasy{color:#f6e7c1;font-family:Georgia,"Times New Roman",serif;letter-spacing:.12em;text-shadow:0 2px 12px rgba(60,30,0,.85);}
.igs-fx-title-card.is-fantasy::before,.igs-fx-title-card.is-fantasy::after{background:linear-gradient(90deg,transparent,rgba(230,190,110,.9),transparent);}
.igs-fx-title-card.is-scifi{color:#bff6ff;letter-spacing:.2em;text-shadow:0 0 10px rgba(60,200,255,.85);}
.igs-fx-title-card.is-scifi::before,.igs-fx-title-card.is-scifi::after{background:linear-gradient(90deg,transparent,rgba(80,220,255,.95),transparent);}
.igs-fx-title-card.is-apocalypse{color:#efe4cc;font-family:"Courier New",monospace;letter-spacing:.08em;text-shadow:0 2px 6px rgba(0,0,0,.9);}
.igs-fx-title-card.is-apocalypse::before,.igs-fx-title-card.is-apocalypse::after{background:linear-gradient(90deg,transparent,rgba(200,150,80,.75),transparent);}
.igs-fx-promise.is-fantasy{color:#3a2614;background:#efe2c2;border:1px solid #9c7a46;font-family:Georgia,"Times New Roman",serif;}
.igs-fx-promise.is-fantasy .igs-fx-promise-seal{border-color:#8e1f1f;background:#8e1f1f;color:#f6e7c1;}
.igs-fx-promise.is-scifi{color:#d8fbff;background:rgba(8,24,36,.9);border:1px solid rgba(80,220,255,.7);box-shadow:0 0 14px rgba(60,200,255,.4);}
.igs-fx-promise.is-scifi .igs-fx-promise-seal{border-color:#4fdcff;color:#4fdcff;border-radius:3px;}
.igs-fx-promise.is-apocalypse{color:#2a2219;background:#d9cdb3;border:1px solid #7a6a52;font-family:"Courier New",monospace;}
.igs-fx-promise.is-apocalypse .igs-fx-promise-seal{border-color:#9a3b1b;color:#9a3b1b;border-radius:2px;}

/* 大正换皮：和洋折衷，奶油色洋纸 + 海老茶双线框 + 明朝体，强调色取海老茶与金。只改配色字体，不改位置与动画。 */
.igs-fx-notify.is-taisho{color:#2a1c18;background:#f4ead6;border:1px solid #7b2e2a;border-radius:3px;box-shadow:0 6px 22px rgba(0,0,0,.32),inset 0 0 0 3px #f4ead6,inset 0 0 0 4px rgba(123,46,42,.45);font-family:"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS PMincho",serif;}
.igs-fx-title-card.is-taisho{color:#f4ead6;font-family:"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS PMincho",serif;letter-spacing:.16em;text-shadow:0 2px 10px rgba(60,16,12,.85);}
.igs-fx-title-card.is-taisho::before,.igs-fx-title-card.is-taisho::after{background:linear-gradient(90deg,transparent,rgba(201,162,92,.95),transparent);}
.igs-fx-promise.is-taisho{color:#2a1c18;background:#f4ead6;border:1px solid #7b2e2a;box-shadow:0 8px 20px rgba(0,0,0,.3),inset 0 0 0 3px #f4ead6,inset 0 0 0 4px rgba(123,46,42,.4);font-family:"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS PMincho",serif;}
.igs-fx-promise.is-taisho .igs-fx-promise-seal{border-color:#7b2e2a;color:#7b2e2a;}

.igs-fx-notify.is-ancient .igs-fx-notify-sender{margin:0 0 0 8px;font-size:13px;color:#7a2a1a;opacity:1;}
.igs-fx-notify.is-ancient .igs-fx-notify-text{font-size:16px;line-height:1.7;letter-spacing:.08em;white-space:normal;}
.igs-fx-eye,.igs-fx-eye-hold{position:absolute;inset:0;overflow:hidden;}
.igs-fx-eye::before,.igs-fx-eye::after,.igs-fx-eye-hold::before,.igs-fx-eye-hold::after{content:"";position:absolute;left:-25%;right:-25%;height:56%;background:#000;box-shadow:0 0 32px 18px #000;}
.igs-fx-eye::before,.igs-fx-eye-hold::before{top:0;border-radius:0 0 50% 50%/0 0 30% 30%;}
.igs-fx-eye::after,.igs-fx-eye-hold::after{bottom:0;border-radius:50% 50% 0 0/30% 30% 0 0;}
.igs-fx-eye::before{animation:igs-fx-lid-top 1.6s cubic-bezier(.45,0,.35,1) both;}
.igs-fx-eye::after{animation:igs-fx-lid-bottom 1.6s cubic-bezier(.45,0,.35,1) both;}
.igs-fx-eye-hold::before{animation:igs-fx-lid-shut-top 1.2s cubic-bezier(.5,0,.4,1) both;}
.igs-fx-eye-hold::after{animation:igs-fx-lid-shut-bottom 1.2s cubic-bezier(.5,0,.4,1) both;}
.igs-fx-call-screen{position:absolute;inset:0;pointer-events:auto;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#fff;background:linear-gradient(180deg,rgba(18,24,40,.9),rgba(8,10,18,.94));background:linear-gradient(180deg,color-mix(in oklab,var(--igs-fx-accent,#121828) 32%,rgba(18,24,40,.9)),rgba(8,10,18,.94));animation:igs-fx-fade var(--igs-fx-life,2.4s) ease both;}
.igs-fx-call-ring{position:relative;width:84px;height:84px;animation:igs-fx-buzz .35s linear 3;}
.igs-fx-call-ring::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid rgba(255,255,255,.55);border-color:color-mix(in oklab,var(--igs-fx-accent,#fff) 45%,rgba(255,255,255,.6));animation:igs-fx-ring 1s ease-out infinite;}
.igs-fx-call-avatar{width:84px;height:84px;border-radius:50%;object-fit:cover;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;color:#fff;background:#5b6b8f;background:color-mix(in oklab,var(--igs-fx-accent,#5b6b8f) 62%,#2f3650);}
.igs-fx-call-screen[data-dir="out"] .igs-fx-call-ring{animation:none;}
.igs-fx-call-screen[data-dir="out"] .igs-fx-call-ring::after{animation-duration:1.6s;}
.igs-fx-call-name{font-size:22px;font-weight:700;letter-spacing:.08em;}
.igs-fx-call-state{font-size:14px;opacity:.8;}
.igs-fx-call-hint{margin-top:18px;padding:6px 18px;border-radius:999px;background:#34c759;font-size:13px;}
.igs-fx-call-screen[data-dir="out"] .igs-fx-call-hint{background:rgba(255,255,255,.18);}
/* 同页就已未接 / 拒接：铃声圈只跳一两下，末尾头像变灰、亮出结局；主角按掉的挂断键会被按下。 */
.igs-fx-call-outcome{font-size:15px;font-weight:700;color:#ff6b61;animation:igs-fx-call-outcome var(--igs-fx-life,2.4s) ease both;}
.igs-fx-call-decline{margin-top:14px;width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;background:#ff3b30;box-shadow:0 6px 18px rgba(255,59,48,.35);}
.igs-fx-call-decline svg{width:28px;height:28px;fill:currentColor;}
.igs-fx-call-screen[data-press] .igs-fx-call-decline{animation:igs-fx-call-press var(--igs-fx-life,2.4s) ease both;}
.igs-fx-call-screen[data-outcome] .igs-fx-call-ring{animation:igs-fx-call-giveup var(--igs-fx-life,2.4s) ease both;}
.igs-fx-call-screen[data-outcome][data-dir="in"] .igs-fx-call-ring{animation:igs-fx-buzz .35s linear 3,igs-fx-call-giveup var(--igs-fx-life,2.4s) ease both;}
.igs-fx-call-screen[data-outcome] .igs-fx-call-ring::after{animation-iteration-count:2;}
.igs-fx-call-screen[data-outcome="reject"] .igs-fx-call-ring::after{animation-iteration-count:1;}
.igs-fx-call-badge{position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:4px 14px 4px 10px;border-radius:999px;font-size:12px;color:#eafff0;white-space:nowrap;background:rgba(20,110,60,.72);}
.igs-fx-call-timer{font-variant-numeric:tabular-nums;opacity:.85;}
.igs-fx-call-timer::after{counter-reset:igs-fx-mm var(--igs-fx-mm) igs-fx-ss var(--igs-fx-ss);content:counter(igs-fx-mm,decimal-leading-zero) ":" counter(igs-fx-ss,decimal-leading-zero);animation:${CALL_TIMER_ANIMATION};animation-delay:var(--igs-fx-call-delay,0s);}
.igs-fx-call-badge::before{content:"";width:14px;height:12px;background:linear-gradient(90deg,currentColor 0 2px,transparent 2px 4px,currentColor 4px 6px,transparent 6px 8px,currentColor 8px 10px,transparent 10px 12px,currentColor 12px 14px);transform-origin:50% 50%;animation:igs-fx-wave .9s ease-in-out infinite;}
/* 挂断记录常驻挂断所在页：平时半透明缩小；首次播放时弹出，接着通话徽章挂断的由徽章的绿色变过来。 */
.igs-fx-call-end{--igs-fx-end-bg:rgba(200,50,50,.75);position:absolute;top:14px;left:50%;display:flex;align-items:center;gap:6px;padding:4px 14px 4px 10px;border-radius:999px;font-size:12px;color:#fff;white-space:nowrap;background:var(--igs-fx-end-bg);opacity:.8;transform:translateX(-50%) scale(.9);}
.igs-fx-call-end::before{content:"";width:12px;height:12px;flex:none;background:currentColor;-webkit-mask:${HANDSET} center/contain no-repeat;mask:${HANDSET} center/contain no-repeat;transform:rotate(135deg);}
.igs-fx-call-end[data-reason="missed"]{--igs-fx-end-bg:rgba(214,48,48,.92);}
.igs-fx-call-end[data-reason="reject"]{--igs-fx-end-bg:rgba(96,98,110,.88);}
.igs-fx-call-end[data-wait]{visibility:hidden;}
.igs-fx-call-end[data-fresh]{animation:igs-fx-call-end-in var(--igs-fx-life,1.8s) ease both;}
.igs-fx-call-end[data-fresh="badge"]{animation-name:igs-fx-call-end-morph;}
.igs-fx-call-badge:not([hidden]) ~ .igs-fx-call-end{top:44px;}
.igs-fx-call-pip,.igs-fx-call-pip-out{position:absolute;top:56px;right:16px;display:flex;flex-direction:column;align-items:center;gap:5px;animation:igs-fx-part-pop .35s ease-out both;}
.igs-fx-call-pip-out{animation:igs-fx-pip-out .32s ease-in both;}
.igs-fx-call-pip .igs-fx-call-avatar,.igs-fx-call-pip-out .igs-fx-call-avatar{width:64px;height:64px;font-size:26px;box-shadow:0 0 0 3px rgba(255,255,255,.85),0 6px 18px rgba(0,0,0,.35);}
.igs-fx-call-pip::before{content:"";position:absolute;top:0;left:50%;width:64px;height:64px;margin-left:-32px;border-radius:50%;border:2px solid #fff;border-color:color-mix(in oklab,var(--igs-fx-accent,#fff) 50%,#fff);opacity:0;}
.igs-fx-call-pip[data-speaking]::before{animation:igs-fx-ring 1s ease-out infinite;}
.igs-fx-call-pip-name{max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:1px 8px;border-radius:999px;font-size:12px;color:#fff;background:rgba(0,0,0,.45);}
.igs-fx-video,.igs-fx-video-close{position:absolute;left:50%;top:4%;height:66%;aspect-ratio:9/19.5;max-width:92%;border-radius:clamp(22px,14%,40px)/clamp(22px,6.5%,40px);transform:translateX(-50%);}
.igs-fx-video{overflow:hidden;border:6px solid #111;box-sizing:border-box;background:radial-gradient(ellipse at 50% 30%,#3a4262,#12141d 80%);background:radial-gradient(ellipse at 50% 30%,color-mix(in oklab,var(--igs-fx-accent,#6d7fb8) 45%,#2a3048),#12141d 80%);box-shadow:0 0 0 2px #45454b,0 18px 50px rgba(0,0,0,.5);animation:igs-fx-video-in .45s cubic-bezier(.2,.9,.3,1.2) both;}
.igs-fx-video-close{background:#111;animation:igs-fx-video-out .52s ease-in both;}
.igs-fx-video-feed{position:absolute;inset:0;background-repeat:no-repeat;background-size:170% auto;background-position:50% 6%;}
.igs-fx-video-face{position:absolute;left:50%;top:36%;transform:translate(-50%,-50%);}
.igs-fx-video-face .igs-fx-call-avatar{width:96px;height:96px;font-size:38px;}
.igs-fx-video[data-feed] .igs-fx-video-face{display:none;}
.igs-fx-video::after{content:"";position:absolute;top:6px;left:50%;width:30%;height:18px;border-radius:999px;background:#0b0b0d;transform:translateX(-50%);}
.igs-fx-video-name{position:absolute;left:12px;top:32px;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 10px;border-radius:999px;font-size:12px;color:#fff;background:rgba(0,0,0,.4);}
.igs-fx-video-self{position:absolute;right:10px;top:32px;width:26%;aspect-ratio:3/4;border-radius:10px;border:2px solid rgba(255,255,255,.8);display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;background:linear-gradient(160deg,#4a5068,#23263a);}
.igs-fx-video-bar{position:absolute;left:0;right:0;bottom:14px;display:flex;justify-content:center;gap:14px;}
.igs-fx-video-btn{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;background:rgba(255,255,255,.2);}
.igs-fx-video-btn svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}
.igs-fx-video-btn.is-end{background:#ff3b30;}
.igs-fx-video-btn.is-end svg{fill:currentColor;stroke:none;}
/* 视频通话期间舞台立绘让位给视频框；语音通话时对方说话，立绘按设置隐藏（头像小窗 / 隐藏）或照常显示。 */
#igs-stage-motion[data-igs-fx-call="video"] #igs-sprite,
#igs-stage-motion[data-igs-fx-call-remote]:not([data-igs-fx-call-sprite="show"]) #igs-sprite{visibility:hidden!important;}
/* 对方台词的名字后加听筒标记；暖色绘本皮肤的名字牌已占用两个伪元素，不叠加。 */
#igs-stage-motion[data-igs-fx-call-remote] .igs-dialog:not([data-igs-dialog-skin="warm-picturebook"]) .igs-speaker::after{content:"";display:inline-block;width:.95em;height:.95em;margin-left:.35em;vertical-align:-.12em;background:currentColor;-webkit-mask:${HANDSET} center/contain no-repeat;mask:${HANDSET} center/contain no-repeat;animation:igs-fx-buzz .6s linear 2;}
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
#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-heartbeat{animation-timing-function:steps(1,end);}
#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-title-card,#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-favor,#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-notify,#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-fx-call-end{animation-timing-function:steps(3,end);}
@media (prefers-reduced-motion: reduce){
.igs-fx-layer *,.igs-fx-layer *::before,.igs-fx-layer *::after{animation:none!important;transition:none!important;}
.igs-fx-layer .igs-fx-call-timer::after{animation:${CALL_TIMER_ANIMATION}!important;animation-delay:var(--igs-fx-call-delay,0s)!important;}
#igs-stage-motion[data-igs-fx-call-remote] .igs-speaker::after{animation:none!important;}
.igs-fx-video-close{display:none!important;}
.igs-fx-eye,.igs-fx-flash,.igs-fx-speedlines{display:none!important;}
.igs-fx-notify{transform:translateX(-50%);}
.igs-fx-notify.is-ancient{transform:none;}
.igs-fx-symbol{transform:none;}
}
`.trim();
