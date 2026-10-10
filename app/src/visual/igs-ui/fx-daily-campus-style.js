// 校园日常演出与常驻氛围层的样式（并入 DAILY_FX_STYLE_TEXT）。全部用实色渐变与 opacity / transform 动画，不用 filter:blur；
// 光柱、粉笔灰、花瓣用渐变平铺 + 背景位移，循环动画在减少动态效果（is-reduced）与低画质时关掉。
// 单次演出的进出场用百分比关键帧跟随 --igs-dfx-life 伸缩。
export const CAMPUS_FX_STYLE_TEXT = `
/* ── 教室：午后斜阳穿过窗格打在课桌上，粉笔灰在光里慢慢浮；社团活动室换成暖色灯晕 ── */
#igs-overlay .igs-dfx-amb-sunbeam{left:-4%;top:-14%;width:30%;height:132%;background:linear-gradient(90deg,transparent,rgba(255,226,160,.15) 28%,rgba(255,238,196,.24) 50%,rgba(255,226,160,.15) 72%,transparent);-webkit-mask-image:repeating-linear-gradient(180deg,#000 0 74px,transparent 74px 82px);mask-image:repeating-linear-gradient(180deg,#000 0 74px,transparent 74px 82px);transform:rotate(-24deg);transform-origin:50% 0;animation:igs-campus-beam 10s ease-in-out infinite;}
#igs-overlay .igs-dfx-amb-sunbeam.is-b{left:24%;width:20%;opacity:.8;animation-duration:13s;animation-delay:-5s;}
#igs-overlay .igs-dfx-amb-chalkdust{inset:0;background-image:radial-gradient(circle,rgba(255,255,248,.55) 0 1.2px,transparent 2.2px),radial-gradient(circle,rgba(255,255,248,.4) 0 1px,transparent 2px);background-size:140px 170px,92px 120px;background-position:20px 30px,60px 80px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 14%,#000 58%,transparent);mask-image:linear-gradient(90deg,transparent,#000 14%,#000 58%,transparent);opacity:.7;animation:igs-campus-motes 38s linear infinite;}
#igs-overlay .igs-dfx-amb-clubglow{display:none;inset:0;background:radial-gradient(ellipse 72% 60% at 50% 16%,rgba(255,198,124,.26),transparent 72%),linear-gradient(0deg,rgba(255,170,96,.08),transparent 40%);}
#igs-overlay .igs-dfx-amb.is-classroom.is-club .igs-dfx-amb-clubglow{display:block;}
#igs-overlay .igs-dfx-amb.is-classroom.is-club .igs-dfx-amb-sunbeam.is-b{display:none;}
#igs-overlay .igs-dfx-amb.is-classroom.is-night .igs-dfx-amb-sunbeam{display:none;}
#igs-overlay .igs-dfx-amb.is-classroom.is-night::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(36,52,110,.24),transparent 62%);}
#igs-overlay .igs-dfx-amb.is-classroom.is-night .igs-dfx-amb-chalkdust{opacity:.35;}
@keyframes igs-campus-beam{0%,100%{opacity:.72;transform:rotate(-24deg) translate3d(0,0,0)}50%{opacity:1;transform:rotate(-24deg) translate3d(18px,0,0)}}
@keyframes igs-campus-motes{from{background-position:20px 30px,60px 80px}to{background-position:20px -140px,60px -40px}}
/* ── 图书馆：书架投下的暗角，窗外一束静静的光，细小的尘埃在光里升起 ── */
#igs-overlay .igs-dfx-amb-libshade{inset:0;background:radial-gradient(ellipse 92% 86% at 50% 50%,transparent 44%,rgba(48,30,12,.4) 100%),linear-gradient(180deg,rgba(70,46,18,.14),rgba(70,46,18,.04));}
#igs-overlay .igs-dfx-amb-libwindow{right:6%;top:-8%;width:28%;height:92%;background:linear-gradient(180deg,rgba(255,238,200,.3),transparent 88%);clip-path:polygon(22% 0,100% 0,72% 100%,0 100%);animation:igs-campus-libpulse 11s ease-in-out infinite;}
#igs-overlay .igs-dfx-amb-libmote{right:4%;top:0;width:36%;height:100%;background-image:radial-gradient(circle,rgba(255,244,214,.6) 0 1.1px,transparent 2px),radial-gradient(circle,rgba(255,244,214,.4) 0 1px,transparent 2px);background-size:84px 110px,56px 74px;background-position:10px 20px,40px 50px;animation:igs-campus-libmote 52s linear infinite;}
#igs-overlay .igs-dfx-amb.is-library.is-night .igs-dfx-amb-libwindow{background:linear-gradient(180deg,rgba(150,176,255,.18),transparent 88%);}
@keyframes igs-campus-libpulse{0%,100%{opacity:.7}50%{opacity:1}}
@keyframes igs-campus-libmote{from{background-position:10px 20px,40px 50px}to{background-position:10px -90px,40px -24px}}
/* ── 操场：晴空的暖光，地面蒸腾的热气，云影缓缓掠过 ── */
#igs-overlay .igs-dfx-amb-fieldsun{inset:0;background:radial-gradient(ellipse 80% 52% at 82% 0%,rgba(255,246,196,.32),transparent 70%);animation:igs-campus-libpulse 14s ease-in-out infinite;}
#igs-overlay .igs-dfx-amb-fieldhaze{left:0;right:0;bottom:0;height:24%;background:linear-gradient(0deg,rgba(255,250,226,.18),transparent);animation:igs-campus-haze 5.5s ease-in-out infinite;}
#igs-overlay .igs-dfx-amb-fieldcloud{left:0;top:-10%;width:60%;height:120%;background:radial-gradient(ellipse 50% 38% at 50% 50%,rgba(24,44,40,.16),transparent 72%);animation:igs-campus-cloudshade 46s linear infinite;}
#igs-overlay .igs-dfx-amb.is-playground.is-night .igs-dfx-amb-fieldsun,#igs-overlay .igs-dfx-amb.is-playground.is-night .igs-dfx-amb-fieldcloud{display:none;}
#igs-overlay .igs-dfx-amb.is-playground.is-night::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,28,70,.3),rgba(10,16,40,.1));}
@keyframes igs-campus-haze{0%,100%{opacity:.6;transform:translate3d(0,0,0)}50%{opacity:1;transform:translate3d(0,-3px,0)}}
@keyframes igs-campus-cloudshade{from{transform:translate3d(-90%,0,0)}to{transform:translate3d(190%,0,0)}}
/* ── 学校天台：铁丝网的菱形光影、被风吹过的流线 ── */
#igs-overlay .igs-dfx-amb-fence{inset:0;background:repeating-linear-gradient(45deg,transparent 0 24px,rgba(18,24,34,.3) 24px 26px),repeating-linear-gradient(-45deg,transparent 0 24px,rgba(18,24,34,.3) 24px 26px);-webkit-mask-image:radial-gradient(ellipse 72% 82% at 50% 50%,transparent 36%,#000 100%);mask-image:radial-gradient(ellipse 72% 82% at 50% 50%,transparent 36%,#000 100%);}
#igs-overlay .igs-dfx-amb-fencelight{inset:0;background:repeating-linear-gradient(45deg,transparent 0 24px,rgba(255,246,214,.34) 24px 26px),repeating-linear-gradient(-45deg,transparent 0 24px,rgba(255,246,214,.34) 24px 26px);-webkit-mask-image:radial-gradient(ellipse 72% 82% at 50% 50%,transparent 36%,#000 100%);mask-image:radial-gradient(ellipse 72% 82% at 50% 50%,transparent 36%,#000 100%);transform:translate3d(5px,6px,0);animation:igs-campus-libpulse 8s ease-in-out infinite;}
#igs-overlay .igs-dfx-amb-roofwind{left:0;top:-10%;bottom:-10%;width:44%;background:repeating-linear-gradient(180deg,transparent 0 50px,rgba(244,250,255,.12) 50px 52px,transparent 52px 128px);-webkit-mask-image:linear-gradient(90deg,transparent,#000 40%,#000 60%,transparent);mask-image:linear-gradient(90deg,transparent,#000 40%,#000 60%,transparent);transform:translate3d(-60%,0,0);animation:igs-campus-roofgust 7s linear infinite;}
#igs-overlay .igs-dfx-amb.is-rooftop.is-night .igs-dfx-amb-fencelight{display:none;}
@keyframes igs-campus-roofgust{from{transform:translate3d(-60%,0,0)}to{transform:translate3d(260%,0,0)}}
/* ── 樱花校门：粉色的晨光薄雾，花瓣斜斜飘落 ── */
#igs-overlay .igs-dfx-amb-gatehaze{inset:0;background:linear-gradient(180deg,rgba(255,214,228,.22),transparent 46%),radial-gradient(ellipse 62% 40% at 50% 0%,rgba(255,238,242,.28),transparent 70%);}
#igs-overlay .igs-dfx-amb-gatepetals{inset:0;background-image:radial-gradient(ellipse 5px 3.5px at 30% 20%,rgba(255,196,214,.85) 0 70%,transparent 74%),radial-gradient(ellipse 4px 3px at 70% 60%,rgba(255,214,226,.8) 0 70%,transparent 74%);background-size:150px 180px,110px 140px;animation:igs-campus-petalfall 26s linear infinite;}
#igs-overlay .igs-dfx-amb-gatepetals.is-b{background-size:210px 250px,170px 200px;opacity:.7;animation-duration:38s;animation-direction:reverse;}
#igs-overlay .igs-dfx-amb.is-campusgate.is-night .igs-dfx-amb-gatehaze{background:linear-gradient(180deg,rgba(120,100,180,.2),transparent 50%);}
@keyframes igs-campus-petalfall{from{background-position:0 0,0 0}to{background-position:-150px 180px,-110px 140px}}
#igs-overlay .igs-dfx-amb.is-reduced.is-classroom i,#igs-overlay .igs-dfx-amb.is-reduced.is-library i,#igs-overlay .igs-dfx-amb.is-reduced.is-playground i,#igs-overlay .igs-dfx-amb.is-reduced.is-rooftop i,#igs-overlay .igs-dfx-amb.is-reduced.is-campusgate i,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-chalkdust,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-libmote,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-fieldcloud,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-roofwind,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-gatepetals{animation:none;}
#igs-overlay .igs-dfx-amb.is-reduced.is-rooftop .igs-dfx-amb-roofwind,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-roofwind{display:none;}
/* ── 黑板写字：墨绿黑板落下，粉笔沿一行字划过，字迹随笔尖逐字浮现 ── */
#igs-overlay .igs-dfx-chalk{display:flex;align-items:flex-start;justify-content:center;padding-top:9%;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-chalk-board{position:relative;width:min(84%,760px);min-height:clamp(96px,22vmin,170px);padding:clamp(22px,5vmin,40px) 4%;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#2f4a3d,#27403a 60%,#233a34);border:clamp(7px,1.4vmin,12px) solid #8a6a46;border-radius:4px;box-shadow:0 14px 30px rgba(0,0,0,.42),inset 0 0 40px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.06);transform-origin:50% 0;animation:igs-campus-board-in var(--igs-dfx-life) cubic-bezier(.3,1.3,.4,1) both;}
#igs-overlay .igs-dfx-chalk-smear{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 60% 40% at 30% 40%,rgba(255,255,255,.07),transparent 70%),radial-gradient(ellipse 50% 30% at 76% 70%,rgba(255,255,255,.05),transparent 70%);}
#igs-overlay .igs-dfx-chalk-line{position:relative;display:inline-block;white-space:nowrap;font-size:clamp(16px,min(5.2vmin,calc(70vw / var(--igs-n,8))),40px);line-height:1.3;}
#igs-overlay .igs-dfx-chalk-text{display:inline-block;color:#f4f6ee;font-family:"Yozai","LXGW WenKai","Comic Sans MS",cursive;letter-spacing:.06em;text-shadow:0 0 1px rgba(255,255,255,.7),1px 1px 0 rgba(255,255,255,.2);clip-path:inset(-20% 100% -20% 0);animation:igs-campus-write 2200ms steps(var(--igs-n,8),end) 420ms forwards;}
#igs-overlay .igs-dfx-chalk-tip{position:absolute;top:58%;left:0;width:.9em;height:.34em;margin-left:-.1em;border-radius:3px;background:linear-gradient(#fffdf2,#ddd8c4);box-shadow:0 1px 2px rgba(0,0,0,.4);transform:rotate(-24deg);animation:igs-campus-tip 2200ms steps(var(--igs-n,8),end) 420ms forwards,igs-campus-tip-out 300ms ease 2900ms forwards;}
#igs-overlay .igs-dfx-chalk-puff{position:absolute;top:40%;left:0;width:.7em;height:.7em;margin-left:-.2em;border-radius:50%;background:radial-gradient(closest-side,rgba(255,255,255,.5),transparent);opacity:0;animation:igs-campus-tip 2200ms steps(var(--igs-n,8),end) 420ms forwards,igs-campus-puff 280ms ease-out 420ms 8 both;}
#igs-overlay .igs-dfx-chalk-scribble{display:flex;flex-direction:column;gap:12px;width:60%;}
#igs-overlay .igs-dfx-chalk-scribble i{display:block;height:3px;border-radius:2px;background:rgba(244,246,238,.7);transform-origin:0 50%;transform:scaleX(0);animation:igs-campus-scribble 600ms ease-out forwards;}
#igs-overlay .igs-dfx-chalk-scribble i:nth-child(1){width:90%;animation-delay:420ms;}
#igs-overlay .igs-dfx-chalk-scribble i:nth-child(2){width:70%;animation-delay:1000ms;}
#igs-overlay .igs-dfx-chalk-scribble i:nth-child(3){width:80%;animation-delay:1600ms;}
#igs-overlay .igs-dfx-chalk-tray{position:absolute;left:6%;right:6%;bottom:-18px;height:10px;display:flex;gap:14px;padding-left:12%;box-sizing:border-box;background:#8a6a46;border-radius:0 0 4px 4px;}
#igs-overlay .igs-dfx-chalk-tray b{display:block;width:24px;height:8px;margin-top:-6px;border-radius:3px;background:#f4f2e6;box-shadow:0 1px 2px rgba(0,0,0,.4);}
#igs-overlay .igs-dfx-chalk-tray b:nth-child(2){background:#f5c6d4;width:20px;}
#igs-overlay .igs-dfx-chalk-tray b:nth-child(3){background:#bfe0f5;width:18px;}
@keyframes igs-campus-board-in{0%{opacity:0;transform:translateY(-18px)}8%{opacity:1;transform:translateY(3px)}12%,100%{opacity:1;transform:translateY(0)}}
@keyframes igs-campus-write{to{clip-path:inset(-20% 0 -20% 0)}}
@keyframes igs-campus-tip{from{left:0}to{left:100%}}
@keyframes igs-campus-tip-out{to{opacity:0}}
@keyframes igs-campus-puff{0%{opacity:0}40%{opacity:.8}100%{opacity:0}}
@keyframes igs-campus-scribble{to{transform:scaleX(1)}}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-chalk-text{animation:none;clip-path:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-chalk-tip,#igs-overlay .igs-dfx.is-reduced .igs-dfx-chalk-puff{display:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-chalk-scribble i{animation:none;transform:none;}
/* ── 传纸条：折成小块的纸条在课桌间起落，展开成带横线的纸 ── */
#igs-overlay .igs-dfx-passnote{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-passnote-fly{position:absolute;left:4%;top:62%;width:clamp(24px,5vmin,38px);height:clamp(24px,5vmin,38px);animation:igs-campus-hop var(--igs-dfx-life) linear both;}
#igs-overlay .igs-dfx-passnote-fold{position:relative;display:block;width:100%;height:100%;background:linear-gradient(135deg,#fff 0 47%,#e4dfd0 47% 53%,#fffdf6 53%);border:1px solid rgba(80,70,50,.35);border-radius:2px;box-shadow:0 4px 8px rgba(0,0,0,.3);}
#igs-overlay .igs-dfx-passnote-fold::before{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 48%,rgba(80,70,50,.25) 49% 51%,transparent 52%),linear-gradient(0deg,transparent 48%,rgba(80,70,50,.25) 49% 51%,transparent 52%);}
#igs-overlay .igs-dfx-passnote-sheet{position:absolute;left:50%;top:50%;width:min(54%,380px);min-height:clamp(120px,26vmin,200px);padding:20px 24px;box-sizing:border-box;background:repeating-linear-gradient(180deg,transparent 0 27px,rgba(110,140,190,.3) 27px 28px),linear-gradient(170deg,#fffdf4,#f5efdc);box-shadow:0 12px 26px rgba(0,0,0,.34);opacity:0;transform:translate(-50%,-50%) scale(.2,.04) rotate(-8deg);animation:igs-campus-unfold var(--igs-dfx-life) cubic-bezier(.3,1.2,.4,1) both;}
#igs-overlay .igs-dfx-passnote-crease{position:absolute;left:0;right:0;top:50%;height:2px;background:rgba(90,80,60,.16);}
#igs-overlay .igs-dfx-passnote-text{position:relative;color:#3a4a6a;font-family:"Yozai","LXGW WenKai",cursive;font-size:clamp(15px,2.8vmin,22px);line-height:28px;transform:rotate(-1.2deg);animation:igs-campus-ink var(--igs-dfx-life) ease both;}
@keyframes igs-campus-hop{0%{left:4%;top:62%;opacity:1;transform:rotate(0)}5%{top:54%}9%{left:18%;top:62%;transform:rotate(120deg)}14%{top:50%}19%{left:34%;top:62%;transform:rotate(240deg)}24%{top:55%}28%{left:48%;top:50%;opacity:1;transform:rotate(360deg) scale(1)}31%,100%{left:50%;top:50%;opacity:0;transform:rotate(380deg) scale(.5)}}
@keyframes igs-campus-unfold{0%,28%{opacity:0;transform:translate(-50%,-50%) scale(.2,.04) rotate(-8deg)}40%{opacity:1;transform:translate(-50%,-50%) scale(1.04,1) rotate(-3deg)}44%{transform:translate(-50%,-50%) scale(1) rotate(-3deg)}88%{opacity:1;transform:translate(-50%,-50%) scale(1) rotate(-2deg)}100%{opacity:0;transform:translate(-50%,-46%) scale(1) rotate(-2deg)}}
@keyframes igs-campus-ink{0%,44%{opacity:0}56%,100%{opacity:1}}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-passnote-fly{display:none;}
/* ── 抽屉里的发现：抽屉拉开一截，暖光里信封（或礼物盒）升起摇晃，光点散开 ── */
#igs-overlay .igs-dfx-drawer-stage{position:absolute;left:50%;bottom:6%;width:min(70%,440px);height:min(56%,330px);transform:translateX(-50%);animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-drawer-glow{position:absolute;left:50%;bottom:26%;width:70%;height:70%;margin-left:-35%;background:radial-gradient(closest-side,rgba(255,226,150,.55),transparent 72%);opacity:0;animation:igs-campus-glow var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-drawer-item{position:absolute;left:50%;bottom:28%;width:26%;aspect-ratio:1.4;margin-left:-13%;opacity:0;animation:igs-campus-item-rise var(--igs-dfx-life) cubic-bezier(.3,1.3,.4,1) both;}
#igs-overlay .igs-dfx-drawer-mail{position:relative;display:block;width:100%;height:100%;background:linear-gradient(160deg,#fffaf0,#f3e8d2);border:1px solid #c9b48a;border-radius:3px;box-shadow:0 6px 12px rgba(0,0,0,.35);}
#igs-overlay .igs-dfx-drawer-flap{position:absolute;left:0;right:0;top:0;height:64%;background:#efe0c4;clip-path:polygon(0 0,100% 0,50% 100%);}
#igs-overlay .igs-dfx-drawer-seal{position:absolute;left:50%;top:40%;width:20%;aspect-ratio:1;margin-left:-10%;border-radius:50%;background:#e0526e;box-shadow:0 1px 3px rgba(0,0,0,.4);}
#igs-overlay .igs-dfx-drawer-seal::before{content:"♥";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:.7em;line-height:1;}
#igs-overlay .igs-dfx-drawer-gift{position:relative;display:block;width:100%;height:100%;background:#ff8fa8;border-radius:3px;box-shadow:0 6px 12px rgba(0,0,0,.35);}
#igs-overlay .igs-dfx-drawer-lid{position:absolute;left:-4%;right:-4%;top:0;height:30%;background:#ff7f9b;border-radius:3px;box-shadow:0 2px 0 rgba(0,0,0,.15);}
#igs-overlay .igs-dfx-drawer-ribbon{position:absolute;left:44%;top:0;width:12%;height:100%;background:#ffd66b;}
#igs-overlay .igs-dfx-drawer-ribbon::before{content:"";position:absolute;left:50%;top:-22%;width:360%;height:26%;margin-left:-180%;border-radius:50%;border:4px solid #ffd66b;box-sizing:border-box;}
#igs-overlay .igs-dfx-drawer-label{position:absolute;left:50%;top:-6%;transform:translateX(-50%);padding:4px 16px;border-radius:999px;background:rgba(40,28,18,.76);color:#ffe9c8;font:600 clamp(14px,2.5vmin,20px)/1.3 "Yozai","LXGW WenKai",sans-serif;white-space:nowrap;opacity:0;animation:igs-campus-label var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-drawer-sparks{position:absolute;left:50%;bottom:46%;width:0;height:0;}
#igs-overlay .igs-dfx-drawer-sparks i{position:absolute;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff3b0;box-shadow:0 0 6px 1px rgba(255,230,140,.8);opacity:0;animation:igs-campus-spark 1500ms ease-out both;}
#igs-overlay .igs-dfx-drawer-sparks i:nth-child(1){--igs-sx:-90px;--igs-sy:-60px;animation-delay:1500ms;}
#igs-overlay .igs-dfx-drawer-sparks i:nth-child(2){--igs-sx:80px;--igs-sy:-80px;animation-delay:1600ms;}
#igs-overlay .igs-dfx-drawer-sparks i:nth-child(3){--igs-sx:-40px;--igs-sy:-110px;animation-delay:1700ms;}
#igs-overlay .igs-dfx-drawer-sparks i:nth-child(4){--igs-sx:50px;--igs-sy:-36px;animation-delay:1800ms;}
#igs-overlay .igs-dfx-drawer-sparks i:nth-child(5){--igs-sx:0px;--igs-sy:-130px;animation-delay:1900ms;}
#igs-overlay .igs-dfx-drawer-desk{position:absolute;left:0;right:0;bottom:0;height:34%;background:linear-gradient(180deg,#c9a674,#b58a58);border-radius:6px 6px 0 0;box-shadow:0 4px 0 #d8b886 inset,0 10px 24px rgba(0,0,0,.4);}
#igs-overlay .igs-dfx-drawer-front{position:absolute;left:18%;right:18%;top:26%;bottom:10%;display:block;background:linear-gradient(180deg,#a97e4c,#966b3c);border:2px solid #7d5630;border-radius:4px;box-shadow:inset 0 2px 0 rgba(255,255,255,.2),0 6px 10px rgba(0,0,0,.35);animation:igs-campus-drawer-out var(--igs-dfx-life) cubic-bezier(.3,1,.4,1) both;}
#igs-overlay .igs-dfx-drawer-front b{position:absolute;left:50%;top:38%;width:22%;height:8px;margin-left:-11%;border-radius:4px;background:#e6cf9f;box-shadow:0 2px 0 #6e4b28;}
@keyframes igs-campus-drawer-out{0%,10%{transform:translateY(0) scale(1)}24%,90%{transform:translateY(22%) scale(1.05)}100%{transform:translateY(22%) scale(1.05)}}
@keyframes igs-campus-glow{0%,20%{opacity:0}32%,88%{opacity:.9}100%{opacity:0}}
@keyframes igs-campus-item-rise{0%,22%{opacity:0;transform:translateY(40%) rotate(0)}30%{opacity:1}38%{transform:translateY(-90%) rotate(-5deg)}46%{transform:translateY(-80%) rotate(4deg)}54%{transform:translateY(-87%) rotate(-2deg)}64%,90%{opacity:1;transform:translateY(-84%) rotate(0)}100%{opacity:0;transform:translateY(-84%) rotate(0)}}
@keyframes igs-campus-label{0%,46%{opacity:0;transform:translateX(-50%) translateY(6px)}56%,88%{opacity:1;transform:translateX(-50%) translateY(0)}100%{opacity:0;transform:translateX(-50%) translateY(0)}}
@keyframes igs-campus-spark{0%{opacity:0;transform:translate(0,0) scale(.4)}20%{opacity:1}100%{opacity:0;transform:translate(var(--igs-sx,0),var(--igs-sy,-60px)) scale(1)}}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-drawer-sparks{display:none;}
/* ── 点名起立：四周压暗成一束聚光，出席簿滑入，荧光笔停在这个名字上，名字被大声喊出 ── */
#igs-overlay .igs-dfx-rollcall-dark{position:absolute;inset:0;background:radial-gradient(ellipse 62% 56% at 50% 52%,rgba(6,8,14,.12),rgba(6,8,14,.68) 100%);animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-rollcall-spot{position:absolute;left:50%;top:0;width:60%;height:100%;margin-left:-30%;background:linear-gradient(180deg,rgba(255,244,210,.2),transparent 80%);clip-path:polygon(40% 0,60% 0,100% 100%,0 100%);animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-rollcall-book{position:absolute;left:50%;top:7%;width:min(52%,360px);--igs-row:clamp(16px,3vmin,22px);padding:10px 18px 14px;box-sizing:border-box;background:#f6f0e0;border-radius:4px;box-shadow:0 10px 22px rgba(0,0,0,.4);color:#3a3326;transform:translateX(-50%);animation:igs-campus-book-in var(--igs-dfx-life) cubic-bezier(.3,1.2,.4,1) both;}
#igs-overlay .igs-dfx-rollcall-book b{display:block;height:22px;margin-bottom:6px;border-bottom:2px solid #b24a3a;font:700 clamp(12px,2vmin,15px)/22px "Source Han Sans CN","PingFang SC",sans-serif;letter-spacing:.3em;}
#igs-overlay .igs-dfx-rollcall-book ul{margin:0;padding:0;list-style:none;}
#igs-overlay .igs-dfx-rollcall-book li{display:flex;align-items:center;height:var(--igs-row);border-bottom:1px solid rgba(90,80,60,.25);}
#igs-overlay .igs-dfx-rollcall-book s{display:block;width:48%;height:6px;border-radius:3px;background:rgba(60,50,40,.45);text-decoration:none;}
#igs-overlay .igs-dfx-rollcall-book li:nth-child(2) s{width:38%;}
#igs-overlay .igs-dfx-rollcall-book li:nth-child(3) s{width:56%;}
#igs-overlay .igs-dfx-rollcall-book li.is-hit s{width:36%;background:#c8392b;}
#igs-overlay .igs-dfx-rollcall-mark{position:absolute;left:12px;right:12px;top:40px;height:var(--igs-row);background:rgba(255,226,60,.55);opacity:0;animation:igs-campus-mark var(--igs-dfx-life) cubic-bezier(.4,0,.2,1) both;}
#igs-overlay .igs-dfx-rollcall-name{position:absolute;left:0;right:0;top:46%;text-align:center;font:900 clamp(40px,11vmin,92px)/1.1 "Source Han Sans CN","PingFang SC",sans-serif;color:#fff;letter-spacing:.08em;text-shadow:4px 4px 0 #c8392b,0 8px 24px rgba(0,0,0,.6);opacity:0;animation:igs-campus-shout var(--igs-dfx-life) cubic-bezier(.2,1.4,.4,1) both;}
#igs-overlay .igs-dfx-rollcall-name::after{content:"！";}
#igs-overlay .igs-dfx-rollcall-name.is-blank{font-size:clamp(30px,8vmin,64px);}
#igs-overlay .igs-dfx-rollcall-reply{position:absolute;left:50%;top:70%;padding:6px 22px;border-radius:999px;background:rgba(255,255,255,.92);color:#2b2b2b;font:700 clamp(16px,3.4vmin,26px)/1.3 "Source Han Sans CN","PingFang SC",sans-serif;box-shadow:0 6px 16px rgba(0,0,0,.4);opacity:0;animation:igs-campus-reply var(--igs-dfx-life) ease both;}
@keyframes igs-campus-book-in{0%{opacity:0;transform:translateX(-50%) translateY(-40px)}12%,88%{opacity:1;transform:translateX(-50%) translateY(0)}100%{opacity:0;transform:translateX(-50%) translateY(0)}}
@keyframes igs-campus-mark{0%,14%{opacity:0;transform:translateY(0)}20%{opacity:.9;transform:translateY(0)}38%,88%{opacity:.9;transform:translateY(calc(var(--igs-row) * 3))}100%{opacity:0;transform:translateY(calc(var(--igs-row) * 3))}}
@keyframes igs-campus-shout{0%,38%{opacity:0;transform:scale(2.4)}44%{opacity:1;transform:scale(.96)}48%{transform:scale(1.06)}52%,88%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1)}}
@keyframes igs-campus-reply{0%,58%{opacity:0;transform:translateX(-50%) translateY(10px)}66%,88%{opacity:1;transform:translateX(-50%) translateY(0)}100%{opacity:0;transform:translateX(-50%) translateY(0)}}
/* ── 考试发卷：试卷滑落到桌面，挂钟分针快转，盖下红色「开始」章 ── */
#igs-overlay .igs-dfx-exam-dark{position:absolute;inset:0;background:rgba(10,12,18,.36);animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-exam-sheet{position:absolute;left:50%;top:50%;width:min(52%,380px);height:min(64%,420px);padding:clamp(14px,3vmin,24px);box-sizing:border-box;background:#fffefa;border-radius:3px;box-shadow:0 14px 30px rgba(0,0,0,.4);transform:translate(-50%,-50%);animation:igs-campus-sheet-in var(--igs-dfx-life) cubic-bezier(.25,1,.4,1) both;}
#igs-overlay .igs-dfx-exam-sheet.is-back{background:#f1ecdc;animation-name:igs-campus-sheet-back;}
#igs-overlay .igs-dfx-exam-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding-bottom:8px;border-bottom:2px solid #3a3a3a;color:#2a2a2a;}
#igs-overlay .igs-dfx-exam-head b{font:900 clamp(18px,3.6vmin,28px)/1.3 "Source Han Serif CN","Songti SC",serif;letter-spacing:.12em;}
#igs-overlay .igs-dfx-exam-head span{font-size:clamp(11px,1.8vmin,14px);color:#6a6a6a;white-space:nowrap;}
#igs-overlay .igs-dfx-exam-lines{display:flex;flex-direction:column;gap:clamp(10px,2.4vmin,18px);margin-top:clamp(14px,3vmin,22px);}
#igs-overlay .igs-dfx-exam-lines i{display:block;height:5px;border-radius:3px;background:rgba(40,40,40,.16);}
#igs-overlay .igs-dfx-exam-lines i:nth-child(2n){width:78%;}
#igs-overlay .igs-dfx-exam-lines i:nth-child(3n){width:64%;}
#igs-overlay .igs-dfx-exam-limit{margin-top:clamp(12px,2.6vmin,20px);font-size:clamp(12px,2vmin,15px);color:#7a6a50;letter-spacing:.1em;}
#igs-overlay .igs-dfx-exam-stamp{position:absolute;right:10%;bottom:12%;width:clamp(56px,11vmin,84px);height:clamp(56px,11vmin,84px);box-sizing:border-box;border:4px solid #c8392b;border-radius:50%;color:#c8392b;font:900 clamp(18px,3.6vmin,28px)/clamp(48px,10vmin,76px) "Source Han Serif CN","Songti SC",serif;text-align:center;letter-spacing:.1em;text-indent:.1em;opacity:0;animation:igs-campus-stamp var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-exam-clock{--igs-clock:clamp(64px,13vmin,100px);position:absolute;right:6%;top:8%;width:var(--igs-clock);height:var(--igs-clock);animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-exam-face{position:relative;display:block;width:100%;height:100%;box-sizing:border-box;border-radius:50%;background:#fffdf6;border:4px solid #4a4440;box-shadow:0 6px 14px rgba(0,0,0,.4);}
#igs-overlay .igs-dfx-exam-face u{position:absolute;left:calc(50% - 1px);top:2px;width:2px;height:5px;background:#4a4440;transform-origin:50% calc((var(--igs-clock) - 8px) / 2 - 2px);}
#igs-overlay .igs-dfx-exam-face em{position:absolute;left:calc(50% - 1px);bottom:50%;width:2px;height:38%;background:#222;transform-origin:50% 100%;}
#igs-overlay .igs-dfx-exam-min{animation:igs-campus-spin 1.4s linear infinite;}
#igs-overlay .igs-dfx-exam-hour{height:26%;width:3px;background:#222;animation:igs-campus-spin 16.8s linear infinite;}
#igs-overlay .igs-dfx-exam-face i{position:absolute;left:calc(50% - 3px);top:calc(50% - 3px);width:6px;height:6px;border-radius:50%;background:#c8392b;}
@keyframes igs-campus-sheet-in{0%{opacity:0;transform:translate(-50%,-50%) translate(60%,-40%) rotate(14deg)}10%{opacity:1;transform:translate(-50%,-50%) translate(-3%,2%) rotate(-3deg)}15%{transform:translate(-50%,-50%) rotate(-1deg)}88%{opacity:1;transform:translate(-50%,-50%) rotate(-1deg)}100%{opacity:0;transform:translate(-50%,-50%) rotate(-1deg)}}
@keyframes igs-campus-sheet-back{0%{opacity:0;transform:translate(-50%,-50%) translate(70%,-50%) rotate(18deg)}8%{opacity:1;transform:translate(-50%,-50%) translate(4%,4%) rotate(5deg)}12%{transform:translate(-50%,-50%) translate(2%,3%) rotate(3deg)}88%{opacity:1;transform:translate(-50%,-50%) translate(2%,3%) rotate(3deg)}100%{opacity:0;transform:translate(-50%,-50%) translate(2%,3%) rotate(3deg)}}
@keyframes igs-campus-stamp{0%,40%{opacity:0;transform:rotate(-14deg) scale(2.2)}46%{opacity:.92;transform:rotate(-14deg) scale(1)}88%{opacity:.92;transform:rotate(-14deg) scale(1)}100%{opacity:0;transform:rotate(-14deg) scale(1)}}
@keyframes igs-campus-spin{to{transform:rotate(360deg)}}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-exam-min,#igs-overlay .igs-dfx.is-reduced .igs-dfx-exam-hour,#igs-overlay[data-igs-quality="low"] .igs-dfx-exam-min{animation:none;}
/* ── 文化祭开场：彩旗垂下摇摆，标题剪纸般弹出，彩纸屑纷纷飘落，气球升起 ── */
#igs-overlay .igs-dfx-festival-bunting{position:absolute;left:0;right:0;top:0;height:clamp(60px,14vmin,110px);display:flex;justify-content:space-around;align-items:flex-start;padding:6px 2% 0;box-sizing:border-box;animation:igs-campus-bunting var(--igs-dfx-life) cubic-bezier(.3,1.2,.4,1) both;}
#igs-overlay .igs-dfx-festival-bunting s{position:absolute;left:-2%;right:-2%;top:0;height:3px;background:#6d5a44;text-decoration:none;}
#igs-overlay .igs-dfx-festival-bunting u{display:block;width:clamp(18px,5.6vmin,40px);height:clamp(24px,7vmin,50px);clip-path:polygon(0 0,100% 0,50% 100%);transform-origin:50% 0;text-decoration:none;animation:igs-campus-sway 2.4s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-festival-title{position:absolute;left:50%;top:40%;text-align:center;transform:translate(-50%,-50%);animation:igs-campus-title-pop var(--igs-dfx-life) cubic-bezier(.2,1.5,.4,1) both;}
#igs-overlay .igs-dfx-festival-title b{display:block;padding:6px 26px;font:900 clamp(34px,10vmin,84px)/1.15 "Source Han Sans CN","PingFang SC",sans-serif;color:#fff;letter-spacing:.1em;background:#ff6b8a;border:5px solid #fff;border-radius:14px;box-shadow:0 8px 0 #c94668,0 14px 26px rgba(0,0,0,.35);transform:rotate(-3deg);}
#igs-overlay .igs-dfx-festival-title span{display:inline-block;margin-top:14px;padding:3px 18px;background:#ffd66b;color:#5a3b10;font:800 clamp(16px,4vmin,30px)/1.3 "Source Han Sans CN","PingFang SC",sans-serif;border-radius:999px;box-shadow:0 4px 0 #d9a93a;transform:rotate(2deg);}
#igs-overlay .igs-dfx-festival-confetti{position:absolute;inset:0;overflow:hidden;}
#igs-overlay .igs-dfx-festival-conf{position:absolute;top:-6%;width:10px;height:14px;opacity:0;animation:igs-campus-conf 2600ms linear both;}
#igs-overlay .igs-dfx-festival-conf.is-round{width:10px;height:10px;border-radius:50%;}
#igs-overlay .igs-dfx-festival-conf.is-strip{width:5px;height:18px;}
#igs-overlay .igs-dfx-festival-balloon{position:absolute;bottom:-24%;width:clamp(34px,8vmin,60px);height:clamp(41px,9.6vmin,72px);border-radius:50% 50% 48% 48%;opacity:0;animation:igs-campus-balloon 4200ms ease-in both;}
#igs-overlay .igs-dfx-festival-balloon::before{content:"";position:absolute;left:22%;top:16%;width:22%;height:16%;border-radius:50%;background:rgba(255,255,255,.55);}
#igs-overlay .igs-dfx-festival-balloon::after{content:"";position:absolute;left:50%;top:100%;width:2px;height:34px;background:rgba(255,255,255,.7);}
#igs-overlay .igs-dfx-festival-balloon.is-b0{left:7%;}
#igs-overlay .igs-dfx-festival-balloon.is-b1{left:16%;animation-delay:240ms;}
#igs-overlay .igs-dfx-festival-balloon.is-b2{right:7%;animation-delay:120ms;}
#igs-overlay .igs-dfx-festival-balloon.is-b3{right:16%;animation-delay:360ms;}
@keyframes igs-campus-bunting{0%{opacity:0;transform:translateY(-100%)}10%{opacity:1;transform:translateY(4%)}14%,86%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-30%)}}
@keyframes igs-campus-sway{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}
@keyframes igs-campus-title-pop{0%,10%{opacity:0;transform:translate(-50%,-50%) scale(.2)}18%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}24%{transform:translate(-50%,-50%) scale(.97)}28%,86%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.08)}}
@keyframes igs-campus-conf{0%{opacity:0;top:-6%;transform:translateX(0) rotate(0)}8%{opacity:1}85%{opacity:1}100%{opacity:0;top:104%;transform:translateX(var(--igs-drift,0px)) rotate(var(--igs-spin,360deg))}}
@keyframes igs-campus-balloon{0%{opacity:0;bottom:-24%}8%{opacity:1}85%{opacity:1}100%{opacity:0;bottom:96%}}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-festival-bunting u,#igs-overlay[data-igs-quality="low"] .igs-dfx-festival-bunting u{animation:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-festival-conf,#igs-overlay .igs-dfx.is-reduced .igs-dfx-festival-balloon{display:none;}
#igs-overlay[data-igs-quality="low"] .igs-dfx-festival-conf:nth-child(n+14){display:none;}
/* ── 毕业 / 入学典礼：樱花雨一路飘落，毕业则三顶学士帽抛向空中，典礼字样浮现 ── */
#igs-overlay .igs-dfx-graduate-glow{position:absolute;inset:0;background:radial-gradient(ellipse 70% 55% at 50% 30%,rgba(255,236,200,.4),transparent 72%);animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-graduate-petals{position:absolute;inset:0;overflow:hidden;}
#igs-overlay .igs-dfx-graduate-petal{position:absolute;top:-4%;border-radius:80% 0 80% 0;opacity:0;animation:igs-campus-petal 4200ms ease-in-out both;}
#igs-overlay .igs-dfx-graduate-caps{position:absolute;inset:0;}
#igs-overlay .igs-dfx-graduate-cap{position:absolute;bottom:6%;width:clamp(48px,11vmin,84px);height:clamp(36px,8vmin,60px);margin-left:calc(clamp(48px,11vmin,84px) / -2);opacity:0;animation:igs-campus-toss 3600ms cubic-bezier(.25,.6,.4,1) 900ms both;}
#igs-overlay .igs-dfx-graduate-cap.is-c1{animation-delay:1100ms;}
#igs-overlay .igs-dfx-graduate-cap.is-c2{animation-delay:1300ms;}
#igs-overlay .igs-dfx-graduate-board{position:absolute;left:0;top:0;width:100%;height:56%;background:#1e2230;clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);}
#igs-overlay .igs-dfx-graduate-crown{position:absolute;left:24%;top:34%;width:52%;height:56%;z-index:-1;background:#2a2f44;border-radius:0 0 40% 40%;}
#igs-overlay .igs-dfx-graduate-tassel{position:absolute;left:50%;top:26%;width:2px;height:64%;background:#ffd66b;transform:rotate(-12deg);transform-origin:50% 0;}
#igs-overlay .igs-dfx-graduate-tassel::after{content:"";position:absolute;left:-3px;bottom:-4px;width:8px;height:8px;border-radius:50%;background:#ffd66b;}
#igs-overlay .igs-dfx-graduate-title{position:absolute;left:0;right:0;top:28%;text-align:center;animation:igs-campus-grad-title var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-graduate-title b{display:inline-block;padding:4px 30px;font:800 clamp(26px,7vmin,56px)/1.3 "Source Han Serif CN","Songti SC",serif;color:#fff;letter-spacing:.3em;text-indent:.3em;text-shadow:0 2px 14px rgba(140,60,90,.7),0 0 2px rgba(120,40,70,.8);}
#igs-overlay .igs-dfx-graduate-title i{display:block;margin:6px auto 0;width:40%;height:2px;background:linear-gradient(90deg,transparent,#fff,transparent);}
@keyframes igs-campus-petal{0%{opacity:0;top:-4%;transform:translateX(0) rotate(0)}10%{opacity:.95}90%{opacity:.9}100%{opacity:0;top:104%;transform:translateX(var(--igs-drift,40px)) rotate(380deg)}}
@keyframes igs-campus-toss{0%{opacity:0;bottom:6%;transform:rotate(0)}6%{opacity:1}42%{opacity:1;bottom:64%;transform:rotate(540deg)}88%{opacity:1;bottom:10%;transform:rotate(900deg)}100%{opacity:0;bottom:8%;transform:rotate(940deg)}}
@keyframes igs-campus-grad-title{0%,10%{opacity:0;transform:translateY(-14px)}22%,88%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(0)}}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-graduate-caps{display:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-graduate-petal{animation-duration:6s;}
#igs-overlay[data-igs-quality="low"] .igs-dfx-graduate-petal:nth-child(n+13){display:none;}
/* ── 第二颗纽扣：制服前襟的特写，金扣连线崩开，翻转着飞到画面中央，闪出一圈光 ── */
#igs-overlay .igs-dfx-button-dark{position:absolute;inset:0;background:rgba(8,10,20,.5);animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-button-cloth{position:absolute;left:50%;top:50%;width:min(62%,420px);height:min(60%,360px);transform:translate(-50%,-50%);background:linear-gradient(160deg,#27324f,#1d2640);border-radius:10px;box-shadow:0 14px 30px rgba(0,0,0,.5),inset 0 0 0 2px rgba(255,255,255,.05);animation:igs-campus-cloth var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-button-placket{position:absolute;left:30%;top:0;bottom:0;width:6px;background:rgba(0,0,0,.32);border-right:2px dashed rgba(255,255,255,.16);}
#igs-overlay .igs-dfx-button-spot{position:absolute;left:calc(30% - 14px);width:28px;height:28px;border-radius:50%;background:radial-gradient(circle at 34% 30%,#fff3b0,#e4b84a 55%,#a97c1e);box-shadow:0 0 0 2px #8c6414 inset,0 2px 6px rgba(0,0,0,.5);}
#igs-overlay .igs-dfx-button-spot.is-a{top:18%;}
#igs-overlay .igs-dfx-button-spot.is-b{top:56%;animation:igs-campus-spot-b var(--igs-dfx-life) linear both;}
#igs-overlay .igs-dfx-button-thread{position:absolute;left:calc(30% - 20px);top:calc(56% + 12px);width:40px;height:2px;background:#d8d2c0;transform-origin:0 50%;animation:igs-campus-thread var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-button-fly{position:absolute;left:calc(30% - 14px);top:56%;width:28px;height:28px;opacity:0;animation:igs-campus-button-fly var(--igs-dfx-life) cubic-bezier(.3,1,.4,1) both;}
#igs-overlay .igs-dfx-button-gold{position:relative;display:block;width:100%;height:100%;border-radius:50%;background:radial-gradient(circle at 34% 30%,#fff3b0,#e4b84a 55%,#a97c1e);box-shadow:0 0 0 2px #8c6414 inset,0 2px 8px rgba(0,0,0,.5);}
#igs-overlay .igs-dfx-button-gold i{position:absolute;width:13%;height:13%;border-radius:50%;background:#6e4c10;}
#igs-overlay .igs-dfx-button-gold i:nth-child(1){left:32%;top:32%;}
#igs-overlay .igs-dfx-button-gold i:nth-child(2){left:55%;top:32%;}
#igs-overlay .igs-dfx-button-gold i:nth-child(3){left:32%;top:55%;}
#igs-overlay .igs-dfx-button-gold i:nth-child(4){left:55%;top:55%;}
#igs-overlay .igs-dfx-button-ring{position:absolute;left:50%;top:50%;width:30px;height:30px;margin:-15px;box-sizing:border-box;border-radius:50%;border:3px solid rgba(255,236,160,.9);opacity:0;animation:igs-campus-ring var(--igs-dfx-life) ease-out both;}
#igs-overlay .igs-dfx-button-title{position:absolute;left:0;right:0;top:70%;text-align:center;color:#fff;font:800 clamp(22px,5.4vmin,40px)/1.3 "Source Han Serif CN","Songti SC",serif;letter-spacing:.3em;text-indent:.3em;text-shadow:0 2px 12px rgba(0,0,0,.7);opacity:0;animation:igs-campus-btn-title var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-button-who{position:absolute;left:0;right:0;top:80%;text-align:center;color:#ffe9b8;font:600 clamp(16px,3.4vmin,26px)/1.3 "Yozai","LXGW WenKai",sans-serif;letter-spacing:.2em;text-shadow:0 2px 10px rgba(0,0,0,.7);opacity:0;animation:igs-campus-btn-title var(--igs-dfx-life) ease both;}
@keyframes igs-campus-cloth{0%{opacity:0;transform:translate(-50%,-50%) scale(.94)}8%,40%{opacity:1;transform:translate(-50%,-50%) scale(1)}52%,88%{opacity:.14;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(1)}}
@keyframes igs-campus-spot-b{0%,33%{opacity:1}34%,100%{opacity:0}}
@keyframes igs-campus-thread{0%,33%{opacity:1;transform:rotate(0)}38%{opacity:1;transform:rotate(16deg)}44%,100%{opacity:0;transform:rotate(30deg)}}
@keyframes igs-campus-button-fly{0%,33%{opacity:0;left:calc(30% - 14px);top:56%;transform:perspective(500px) scale(1) rotateY(0)}34%{opacity:1}40%{left:calc(30% - 14px);top:40%;transform:perspective(500px) scale(1.6) rotateY(200deg)}47%{left:calc(50% - 14px);top:34%;transform:perspective(500px) scale(3.2) rotateY(560deg)}53%,88%{opacity:1;left:calc(50% - 14px);top:34%;transform:perspective(500px) scale(3.4) rotateY(720deg)}100%{opacity:0;left:calc(50% - 14px);top:34%;transform:perspective(500px) scale(3.4) rotateY(720deg)}}
@keyframes igs-campus-ring{0%,46%{opacity:0;transform:scale(.4)}50%{opacity:.9;transform:scale(1)}70%,100%{opacity:0;transform:scale(5)}}
@keyframes igs-campus-btn-title{0%,52%{opacity:0;transform:translateY(8px)}62%,88%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(0)}}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-button-ring{display:none;}
`;
