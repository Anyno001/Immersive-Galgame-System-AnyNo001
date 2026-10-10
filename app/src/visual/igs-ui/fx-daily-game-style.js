// 在家玩游戏机的样式（并入 DAILY_FX_STYLE_TEXT）。屏幕彩光用实色渐变与 opacity / transform 动画，不用 filter:blur；
// 震动只作用在边缘光框上；减少动态效果（is-reduced）与低画质时动画全部关掉。对战条取战斗 HUD 的强调色变量，跟随战斗皮肤。
export const GAME_FX_STYLE_TEXT = `
/* ── 电视 / 游戏机常驻氛围层：房间偏暗，屏幕彩光自下而上映在脸上 ── */
#igs-overlay .igs-dfx-amb-roomdark{inset:0;background:radial-gradient(ellipse 90% 80% at 50% 70%,rgba(10,10,22,.08),rgba(4,4,12,.58) 100%);}
#igs-overlay .igs-dfx-amb-tvlight{left:6%;right:6%;bottom:-8%;height:62%;background:radial-gradient(ellipse 62% 70% at 50% 100%,rgba(110,170,255,.34),transparent 74%);animation:igs-game-tv 3.6s steps(1,end) infinite;}
#igs-overlay .igs-dfx-amb-tvscan{left:0;right:0;top:0;height:18%;background:linear-gradient(180deg,transparent,rgba(190,210,255,.07) 50%,transparent);animation:igs-game-scan 6.5s linear infinite;}
@keyframes igs-game-tv{0%{background:radial-gradient(ellipse 62% 70% at 50% 100%,rgba(110,170,255,.34),transparent 74%)}18%{background:radial-gradient(ellipse 62% 70% at 50% 100%,rgba(255,120,170,.3),transparent 74%)}37%{background:radial-gradient(ellipse 62% 70% at 50% 100%,rgba(130,240,170,.28),transparent 74%)}55%{background:radial-gradient(ellipse 62% 70% at 50% 100%,rgba(255,214,110,.3),transparent 74%)}78%{background:radial-gradient(ellipse 62% 70% at 50% 100%,rgba(170,140,255,.32),transparent 74%)}}
@keyframes igs-game-scan{from{transform:translate3d(0,-120%,0)}to{transform:translate3d(0,620%,0)}}
#igs-overlay .igs-dfx-amb.is-reduced.is-console i,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-tvlight,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-tvscan{animation:none;}
/* ── 开机 ── */
#igs-overlay .igs-dfx-console-dark{position:absolute;inset:0;background:rgba(4,4,12,.5);animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-console-light{position:absolute;left:4%;right:4%;bottom:-6%;height:66%;background:radial-gradient(ellipse 64% 72% at 50% 100%,rgba(130,180,255,.5),transparent 76%);animation:igs-game-boot-light var(--igs-dfx-life) steps(1,end) both;}
#igs-overlay .igs-dfx-console-scan{position:absolute;left:0;right:0;top:0;height:14%;background:linear-gradient(180deg,transparent,rgba(200,220,255,.12) 50%,transparent);animation:igs-game-scan 1.6s linear 2;}
#igs-overlay .igs-dfx-console-boot{position:absolute;left:0;right:0;bottom:16%;display:flex;flex-direction:column;align-items:center;gap:6px;font-family:monospace;text-align:center;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-console-plat{font-size:clamp(20px,5vw,34px);font-weight:900;letter-spacing:.32em;text-indent:.32em;color:#e8f0ff;text-shadow:0 0 12px rgba(120,170,255,.8),2px 2px 0 #28306a;}
#igs-overlay .igs-dfx-console-game{font-size:clamp(14px,3.4vw,22px);letter-spacing:.18em;color:var(--igs-battle-accent,#ffd66b);text-shadow:2px 2px 0 #28306a;}
#igs-overlay .igs-dfx-console-press{font-size:12px;letter-spacing:.4em;text-indent:.4em;color:#fff;animation:igs-game-blink .7s steps(1,end) infinite;}
@keyframes igs-game-boot-light{0%{opacity:0}6%{opacity:1}12%{opacity:.3}20%{opacity:1}40%{opacity:.75}55%{opacity:1}70%{opacity:.8}88%{opacity:1}100%{opacity:0}}
@keyframes igs-game-blink{0%{opacity:1}50%{opacity:.15}}
/* ── 胜负字样补强（沿用 game 标签）：胜利撒一圈像素星，失败整体压暗 ── */
#igs-overlay .igs-dfx-game.is-win::before{content:"";position:absolute;left:50%;top:46%;width:8px;height:8px;margin:-4px;background:#ffd66b;box-shadow:-120px -50px 0 #ff6b8a,110px -60px 0 #6bd6ff,-150px 30px 0 #8cf0a0,140px 40px 0 #ffd66b,-60px -90px 0 #fff,70px 80px 0 #ff6b8a;animation:igs-game-stars var(--igs-dfx-life) steps(5,end) both;}
#igs-overlay .igs-dfx-game.is-lose{background:rgba(6,6,14,.35);}
@keyframes igs-game-stars{0%{opacity:0;transform:scale(.2)}20%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.6)}}
/* ── 双人对战：顶部 1P / 2P 血条，掉血时红色残影慢半拍追上，残血闪红，归零 K.O. ── */
#igs-overlay .igs-dfx-versus-hud{position:absolute;left:3%;right:3%;top:3%;display:flex;align-items:center;gap:10px;color:#f4f1ea;text-shadow:0 1px 4px rgba(0,0,0,.8);animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-versus-side{flex:1;display:flex;flex-direction:column;gap:3px;min-width:0;}
#igs-overlay .igs-dfx-versus-side.is-p2{align-items:flex-end;}
#igs-overlay .igs-dfx-versus-side b{font-size:13px;letter-spacing:.14em;color:var(--igs-battle-accent,#ffd66b);}
#igs-overlay .igs-dfx-versus-bar{position:relative;display:block;width:100%;height:14px;background:rgba(8,9,14,.72);border:2px solid var(--igs-battle-accent,#ffd66b);transform:skewX(-14deg);overflow:hidden;}
#igs-overlay .igs-dfx-versus-side.is-p2 .igs-dfx-versus-bar{transform:skewX(14deg);}
#igs-overlay .igs-dfx-versus-bar i{position:absolute;left:0;top:0;bottom:0;width:var(--igs-hp);transform-origin:0 50%;}
#igs-overlay .igs-dfx-versus-side.is-p2 .igs-dfx-versus-bar i{left:auto;right:0;transform-origin:100% 50%;}
#igs-overlay .igs-dfx-versus-fill{background:linear-gradient(180deg,#9dffb0,#2fbf5a);animation:igs-game-hp-fill 1100ms cubic-bezier(.3,.8,.3,1) 450ms both;}
#igs-overlay .igs-dfx-versus-ghost{background:#ff4d4d;animation:igs-game-hp-fill 1100ms cubic-bezier(.3,.8,.3,1) 950ms both;}
#igs-overlay .igs-dfx-versus-side.is-low .igs-dfx-versus-fill{background:linear-gradient(180deg,#ff9a9a,#e02a2a);animation:igs-game-hp-fill 1100ms cubic-bezier(.3,.8,.3,1) 450ms both,igs-game-low .32s steps(1,end) 1600ms infinite;}
#igs-overlay .igs-dfx-versus-vs{font-family:monospace;font-size:clamp(18px,4vw,28px);font-weight:900;font-style:italic;color:#fff;text-shadow:0 0 10px rgba(255,90,90,.8),2px 2px 0 #7a1c1c;animation:igs-game-vs .5s cubic-bezier(.2,1.6,.4,1) both;}
#igs-overlay .igs-dfx-versus-edge{position:absolute;inset:0;box-shadow:inset 0 0 0 3px rgba(255,214,107,.35),inset 0 0 46px rgba(255,80,80,.3);animation:igs-game-edge .22s steps(1,end) 9;}
#igs-overlay .igs-dfx-versus-ko{position:absolute;left:0;right:0;top:36%;text-align:center;font-family:monospace;font-size:clamp(54px,15vw,120px);font-weight:900;font-style:italic;letter-spacing:.06em;color:#ff4d4d;text-shadow:4px 4px 0 #2a0a0a,0 0 26px rgba(255,60,60,.7);animation:igs-game-ko var(--igs-dfx-life) steps(8,end) both;}
@keyframes igs-game-hp-fill{from{width:var(--igs-hp-from,100%)}to{width:var(--igs-hp)}}
@keyframes igs-game-low{0%{opacity:1}50%{opacity:.35}}
@keyframes igs-game-vs{from{opacity:0;transform:scale(2.4)}to{opacity:1;transform:scale(1)}}
@keyframes igs-game-edge{0%{transform:translate3d(0,0,0)}25%{transform:translate3d(2px,-1px,0)}50%{transform:translate3d(-2px,1px,0)}75%{transform:translate3d(1px,2px,0)}}
@keyframes igs-game-ko{0%,34%{opacity:0;transform:scale(2.6)}40%{opacity:1;transform:scale(1)}46%{transform:scale(1.12)}52%,88%{opacity:1;transform:scale(1)}100%{opacity:0}}
/* ── 连击：边缘红光抖动，COMBO 数字分档跳升，越跳越大越红 ── */
#igs-overlay .igs-dfx-combo-edge{position:absolute;inset:0;box-shadow:inset 0 0 0 3px rgba(255,100,60,.4),inset 0 0 60px rgba(255,60,40,.38);animation:igs-game-edge .16s steps(1,end) infinite,igs-game-edge-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-combo-board{position:absolute;right:6%;top:24%;display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-family:monospace;color:#fff;text-shadow:3px 3px 0 #2a0a0a;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-combo-count{position:relative;display:flex;flex-direction:column;align-items:flex-end;}
#igs-overlay .igs-dfx-combo-nums{position:relative;min-width:3.4em;height:1.1em;font-size:clamp(46px,12vw,92px);line-height:1.1;font-weight:900;font-style:italic;}
#igs-overlay .igs-dfx-combo-num{position:absolute;right:0;top:0;opacity:0;transform-origin:100% 60%;animation:igs-game-combo-step 380ms steps(4,end) both;}
#igs-overlay .igs-dfx-combo-num.is-last{animation:igs-game-combo-last 380ms steps(4,end) both,igs-game-combo-throb .3s ease-in-out 380ms infinite alternate;}
#igs-overlay .igs-dfx-combo-num.is-s0{color:#fff6c8;font-size:.6em;}
#igs-overlay .igs-dfx-combo-num.is-s1{color:#ffe36b;font-size:.72em;}
#igs-overlay .igs-dfx-combo-num.is-s2{color:#ffb347;font-size:.86em;}
#igs-overlay .igs-dfx-combo-num.is-s3{color:#ff7a3d;font-size:1em;}
#igs-overlay .igs-dfx-combo-num.is-s4{color:#ff3b30;font-size:1.18em;}
#igs-overlay .igs-dfx-combo-unit{font-size:clamp(14px,3vw,22px);font-weight:900;letter-spacing:.2em;color:#ffd66b;}
#igs-overlay .igs-dfx-combo-move{font-size:15px;letter-spacing:.2em;color:var(--igs-battle-accent,#ffd66b);}
#igs-overlay .igs-dfx-combo-pad{display:flex;gap:6px;}
#igs-overlay .igs-dfx-combo-pad i{display:block;width:26px;height:26px;line-height:26px;border-radius:50%;background:#2c3350;border:2px solid #aab4e8;font-size:12px;font-style:normal;text-align:center;animation:igs-game-key .26s steps(1,end) infinite;}
@keyframes igs-game-combo-step{0%{opacity:0;transform:scale(1.8)}30%,80%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1)}}
@keyframes igs-game-combo-last{0%{opacity:0;transform:scale(2)}100%{opacity:1;transform:scale(1)}}
@keyframes igs-game-combo-throb{from{transform:scale(1)}to{transform:scale(1.1) rotate(-2deg)}}
@keyframes igs-game-key{0%{transform:translateY(0);background:#2c3350}50%{transform:translateY(2px);background:#ffd66b;color:#2c3350}}
@keyframes igs-game-edge-fade{0%{opacity:0}12%{opacity:1}88%{opacity:1}100%{opacity:0}}
/* ── 抢手柄 / 耍赖 ── */
#igs-overlay .igs-dfx-snatch-stage{position:absolute;left:50%;top:44%;width:min(46vmin,260px);transform:translate(-50%,-50%);animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-snatch-pad{width:100%;animation:igs-game-tug .22s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-snatch-svg{display:block;width:100%;}
#igs-overlay .igs-dfx-snatch-lines i{position:absolute;top:30%;width:22%;height:3px;background:#fff;}
#igs-overlay .igs-dfx-snatch-lines i:nth-child(1){left:-26%;top:20%;transform:rotate(-14deg);}
#igs-overlay .igs-dfx-snatch-lines i:nth-child(2){left:-30%;top:46%;}
#igs-overlay .igs-dfx-snatch-lines i:nth-child(3){right:-26%;top:30%;transform:rotate(12deg);}
#igs-overlay .igs-dfx-snatch-act{position:absolute;left:50%;top:-30%;transform:translateX(-50%);padding:2px 12px;white-space:nowrap;font-size:clamp(20px,4.6vw,32px);font-weight:900;color:#2a0a0a;background:#ffd66b;border:3px solid #2a0a0a;border-radius:14px;animation:igs-game-pop .4s cubic-bezier(.2,1.6,.4,1) 350ms both;}
@keyframes igs-game-tug{from{transform:translateX(-12%) rotate(-7deg)}to{transform:translateX(12%) rotate(7deg)}}
@keyframes igs-game-pop{from{opacity:0;transform:translateX(-50%) scale(.2)}to{opacity:1;transform:translateX(-50%) scale(1)}}
/* ── 减少动态效果 / 低画质：停掉闪烁、抖动与循环 ── */
#igs-overlay .igs-dfx.is-reduced .igs-dfx-versus-edge,#igs-overlay .igs-dfx.is-reduced .igs-dfx-combo-edge,#igs-overlay .igs-dfx.is-reduced .igs-dfx-console-scan,#igs-overlay .igs-dfx.is-reduced .igs-dfx-snatch-pad,#igs-overlay .igs-dfx.is-reduced .igs-dfx-combo-pad i,#igs-overlay .igs-dfx.is-reduced .igs-dfx-console-light,#igs-overlay .igs-dfx.is-reduced .igs-dfx-console-press,#igs-overlay .igs-dfx.is-reduced .igs-dfx-combo-num.is-last,#igs-overlay .igs-dfx.is-reduced .igs-dfx-versus-side.is-low .igs-dfx-versus-fill{animation:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-combo-num{opacity:0;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-combo-num.is-last{opacity:1;}
#igs-overlay[data-igs-quality="low"] .igs-dfx-versus-edge,#igs-overlay[data-igs-quality="low"] .igs-dfx-combo-edge,#igs-overlay[data-igs-quality="low"] .igs-dfx-console-scan,#igs-overlay[data-igs-quality="low"] .igs-dfx-combo-pad i{animation:none;}
`;
