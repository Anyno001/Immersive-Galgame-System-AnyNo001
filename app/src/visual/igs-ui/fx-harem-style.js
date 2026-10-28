// 后宫妃子包的样式：克制的东方美学。墨底轻薄卡 / 细金线 #c9a961 / 宣纸字 #ece2c8 / 朱砂 #b5382c 每场只点一处。
// 道具一律细线描边或剪影暗示；不用粗描边、饱和色块、旋转贴纸；卡片靠右、轻薄、无投影，不压脸和躯干。
// 自然状态即终态（动画只写 from），减少动态效果与低画质时直接停在终态。@@ 在加载时换成 #igs-overlay 前缀。
const RAW = `
@@.igs-dfx-hm{box-sizing:border-box;padding:0 max(16px,4%) var(--igs-fx-safe);display:flex;flex-direction:column;align-items:flex-end;justify-content:center;font-family:"Songti SC","STSong","SimSun","Noto Serif CJK SC","Source Han Serif SC",serif;font-size:14px;color:#ece2c8;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
@@.igs-dfx-hm.is-reduced *{animation:none!important;}
@@.igs-dfx-hm.is-reduced .hm-petals,@@.igs-dfx-hm.is-reduced .hm-drop,@@.igs-dfx-hm.is-reduced .hm-ripple{display:none;}
@@[data-igs-quality="low"] .igs-dfx-hm *{animation-duration:.01ms!important;animation-delay:0s!important;}
@@[data-igs-quality="low"] .hm-petals,@@[data-igs-quality="low"] .hm-drop,@@[data-igs-quality="low"] .hm-ripple{display:none;}
@@[data-igs-quality="low"] .hm-cart,@@.igs-dfx-hm.is-reduced .hm-cart{animation:none!important;transform:none;}
@keyframes hm-rise{from{opacity:0;transform:translateY(8px);}}
@keyframes hm-seal-in{from{opacity:0;transform:scale(1.25);}}
@keyframes hm-char{from{opacity:0;transform:translateY(-6px);}}
@keyframes hm-veil{from{opacity:0;}}
@keyframes hm-line-in{from{opacity:0;transform:translateX(-6px);}}

@@.hm-sheet,@@.hm-plaque,@@.hm-hang,@@.hm-select-card,@@.hm-ledger,@@.hm-probe-card,@@.hm-pulse,@@.hm-ladder,@@.hm-steps,@@.hm-edict{box-sizing:border-box;background:rgba(20,15,12,.8);border:1px solid rgba(201,169,97,.5);}
@@.hm-title,@@.hm-hang-title,@@.hm-select-head,@@.hm-ledger-title,@@.hm-probe-title,@@.hm-roll-title,@@.hm-pulse-title,@@.hm-tray-title,@@.hm-greet-head{font-weight:400;letter-spacing:.5em;color:#c9a961;text-align:center;}

@@.hm-rank-row{display:flex;align-items:flex-start;justify-content:flex-end;gap:14px;max-width:100%;}
@@.hm-ladder{padding:8px 4px;animation:hm-rise .5s ease-out both;}
@@.hm-ladder-rows{position:relative;}
@@.hm-rung{position:relative;height:var(--hm-row);line-height:var(--hm-row);padding:0 1.2em;text-align:center;letter-spacing:.3em;color:#8f866f;}
@@.hm-marker{position:absolute;left:.5em;right:.5em;top:0;height:var(--hm-row);border-block:1px solid #c9a961;transform:translateY(calc(var(--hm-to) * var(--hm-row)));animation:hm-climb 1.1s cubic-bezier(.4,0,.2,1) .5s both;}
@keyframes hm-climb{from{transform:translateY(calc(var(--hm-from) * var(--hm-row)));}}
@@.hm-rung.is-to{color:#ece2c8;}
@@.hm-ladder.is-down .hm-marker{border-color:#8f866f;}
@@.hm-edict{position:relative;padding:14px 12px;max-height:calc(var(--igs-fx-vis) * .78);overflow:hidden;writing-mode:vertical-rl;line-height:2;letter-spacing:.14em;animation:hm-rise .5s ease-out .1s both;}
@@.hm-seal{position:absolute;left:8px;bottom:8px;width:1.9em;height:1.9em;display:flex;align-items:center;justify-content:center;background:#a8322a;color:#ece2c8;writing-mode:horizontal-tb;letter-spacing:0;border-radius:1px;animation:hm-seal-in .3s ease-out 1.6s both;}
@@.hm-rank.is-down .hm-seal{background:#4a4540;}

@@.hm-plaque{position:relative;min-width:min(260px,70%);padding:12px 20px 14px;animation:hm-rise .5s ease-out both;}
@@.hm-plaque-name{margin-bottom:8px;text-align:center;letter-spacing:.4em;}
@@.hm-gauge .igs-gauge-track{height:2px;background:rgba(201,169,97,.25);border:0;border-radius:0;}
@@.hm-gauge .igs-gauge-fill{background:#c9a961;border-radius:0;animation:hm-fill .9s ease-out both;}
@@.hm-gauge .igs-gauge-value{color:#ece2c8;font-weight:400;}
@keyframes hm-fill{from{width:var(--hm-from-pct);}}
@@.hm-delta{position:absolute;right:14px;top:8px;font-variant-numeric:tabular-nums;color:#c9a961;}
@@.hm-delta.is-down{color:#8f866f;}

@@.hm-hang{min-width:min(220px,62%);padding:14px 20px 10px;animation:hm-rise .55s ease-out both;}
@@.hm-hang-title{margin-bottom:6px;}
@@.hm-board-row{display:flex;align-items:baseline;gap:14px;padding:5px 0;border-top:1px solid rgba(201,169,97,.22);animation:hm-line-in .4s ease-out both;}
@@.hm-chip{flex:none;min-width:3.6em;color:#c9a961;letter-spacing:.2em;font-size:.9em;}
@@.hm-board-name{letter-spacing:.2em;}

@@.hm-tray-wrap{display:flex;flex-direction:column;align-items:center;gap:8px;}
@@.hm-tray-title{padding:1px 1.4em;border:1px solid rgba(201,169,97,.5);}
@@.hm-tray-plate{padding:0 6px 8px;animation:hm-rise .5s ease-out both;}
@@.hm-tabs{display:flex;align-items:flex-end;gap:10px;}
@@.hm-tab{display:flex;flex-direction:column;width:2.5em;height:7em;overflow:hidden;background:rgba(20,15,12,.8);border:1px solid rgba(201,169,97,.35);}
@@.hm-tab-head{display:block;height:1px;background:rgba(201,169,97,.45);}
@@.hm-tab b{margin:auto;font-weight:400;writing-mode:vertical-rl;letter-spacing:.14em;}
@@.hm-tab.is-dim{opacity:.45;}
@@.hm-tab.is-pick{transform:translateY(-10px);border-color:#c9a961;animation:hm-tab-pick .8s ease-out .4s both;}
@@.hm-tab.is-pick .hm-tab-head{height:2px;background:#c9a961;}
@keyframes hm-tab-pick{from{opacity:0;transform:translateY(0);}}
@@.hm-tab.is-turn{transform:translateY(6px);opacity:.35;animation:hm-tab-drop .7s ease-in .9s both;}
@keyframes hm-tab-drop{from{opacity:1;transform:translateY(-10px);}}

@@.hm-select-card{position:relative;min-width:min(260px,72%);padding:12px 22px 36px;animation:hm-rise .5s ease-out both;}
@@.hm-select-body{display:flex;align-items:center;justify-content:center;gap:22px;padding:12px 0 4px;}
@@.hm-stamp{position:absolute;right:12px;bottom:10px;padding:0 .4em;border:1px solid #b5382c;color:#cf5a4c;font-size:1.1em;letter-spacing:.12em;animation:hm-seal-in .3s ease-out 1.2s both;}
@@.hm-select.is-drop .hm-stamp,@@.hm-record.is-no .hm-stamp{color:#8f866f;border-color:#8f866f;}
@@.hm-flower{display:flex;flex-direction:column;align-items:center;gap:8px;animation:hm-rise .5s ease-out .7s both;}
@@.hm-flower i{display:block;width:1.2em;height:1.2em;border:1px solid #c9a961;border-radius:50%;}
@@.hm-flower span{white-space:nowrap;color:#c9a961;letter-spacing:.2em;}

@@.hm-ledger{position:relative;width:min(300px,76%);padding:14px 22px 36px;animation:hm-rise .5s ease-out both;}
@@.hm-ledger-title{margin-bottom:.5em;}
@@.hm-ledger-line{min-height:3.2em;line-height:1.8em;letter-spacing:.08em;}
@@.hm-cart{position:absolute;left:62%;bottom:calc(var(--igs-fx-safe) + 8px);display:flex;flex-direction:column;align-items:center;gap:4px;white-space:nowrap;color:#c9a961;letter-spacing:.3em;font-size:.9em;animation:hm-cart-pass 3.2s ease-in-out .9s both;}
@keyframes hm-cart-pass{from{transform:translateX(-80vw);}to{transform:translateX(70vw);}}
@@.hm-cart-line{display:block;width:100%;height:1px;background:linear-gradient(90deg,transparent,#c9a961,transparent);}

@@.hm-herald{position:relative;display:flex;align-items:center;justify-content:center;gap:1.2em;width:100%;padding:.9em 0;background:linear-gradient(90deg,transparent,rgba(20,15,12,.7) 20%,rgba(20,15,12,.7) 80%,transparent);border-block:1px solid rgba(201,169,97,.5);animation:hm-veil .5s ease-out both;}
@@.hm-herald-text{font-size:2em;letter-spacing:.5em;padding-left:.5em;color:#ece2c8;text-shadow:0 1px 8px rgba(0,0,0,.6);}
@@.hm-herald-text span{display:inline-block;animation:hm-char .4s ease-out both;}
@@.hm-herald-tassel{display:block;width:5px;height:5px;border:1px solid #c9a961;transform:rotate(45deg);}

@@.hm-greet-head{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:8px;animation:hm-rise .5s ease-out both;}
@@.hm-orb{display:block;width:.8em;height:.8em;border:1px solid #c9a961;border-radius:50%;}
@@.hm-orb.is-moon{border-color:#ece2c8;box-shadow:inset -.3em 0 0 #ece2c8;}
@@.hm-steps{display:flex;align-items:flex-start;gap:8px;padding:10px 12px 22px;}
@@.hm-step{display:flex;flex-direction:column;align-items:center;gap:6px;width:2.4em;padding:6px 0 8px;border:1px solid rgba(201,169,97,.4);transform:translateY(calc(var(--hm-i) * 10px));animation:hm-step-in .45s ease-out both;}
@keyframes hm-step-in{from{opacity:0;transform:translateY(calc(var(--hm-i) * 10px + 10px));}}
@@.hm-step span{font-size:.75em;color:#c9a961;letter-spacing:.1em;}
@@.hm-step b{font-weight:400;writing-mode:vertical-rl;letter-spacing:.14em;}

@@.hm-roll{display:flex;flex-direction:column;align-items:center;animation:hm-rise .5s ease-out both;}
@@.hm-roll-rod{display:block;width:min(260px,74vw);height:0;border-top:1px solid #c9a961;}
@@.hm-roll-paper{width:min(260px,70vw);padding:12px 20px 14px;background:rgba(20,15,12,.8);clip-path:inset(0 0 0 0);animation:hm-unroll .9s ease-out .2s both;}
@keyframes hm-unroll{from{clip-path:inset(0 0 100% 0);}}
@@.hm-reward-to{margin-top:2px;text-align:center;font-size:.9em;color:#a99d82;}
@@.hm-roll-paper ul{margin:8px 0 0;padding:0;list-style:none;}
@@.hm-roll-paper li{display:flex;align-items:center;gap:10px;padding:4px 0;border-top:1px solid rgba(201,169,97,.22);animation:hm-line-in .4s ease-out both;}
@@.hm-roll-paper li i{flex:none;width:.7em;height:0;border-top:1px solid #c9a961;}

@@.hm-probe-card{min-width:min(260px,72%);padding:12px 22px 14px;text-align:center;animation:hm-rise .5s ease-out both;}
@@.hm-probe-scene{height:7.6em;margin:6px 0;}
@@.hm-probe-scene{--igs-fx-c:#d9d3c2;--igs-fx-ink:#2a1f1a;--igs-fx-rim-c:#fff;--igs-fx-paper:#f3ead2;--igs-fx-pop:#cf5a4c;}
@@.hm-probe-scene svg{display:block;width:100%;height:100%;overflow:visible;}
@@.hm-probe-scene .hm-bowl .igs-fx-fill{fill:#e4e0d4;}
@@.hm-probe-scene .hm-needle-body .igs-fx-line{stroke:#eef1f5;}
@@.hm-probe-scene .hm-needle-tip .igs-fx-line{stroke:#eef1f5;}
@@.hm-probe-scene .igs-fx-star-main .igs-fx-fill,@@.hm-probe-scene .igs-fx-star-b .igs-fx-fill{fill:#f3d36b;}
@@.hm-needle{animation:hm-needle-in .8s ease-out .3s both;}
@keyframes hm-needle-in{from{transform:translateY(-14px);opacity:0;}}
@@.hm-needle.is-black .hm-needle-tip .igs-fx-line{stroke:#17141a;animation:hm-tip-black 1.1s ease-in 1.1s both;}
@keyframes hm-tip-black{from{stroke:#eef1f5;}}
@@.hm-probe-scene .hm-drop .igs-fx-fill{fill:#c9473f;}
@@.hm-drop{animation:hm-drip 1s ease-in .4s both;}
@@.hm-drop.is-b{animation-delay:.9s;}
@keyframes hm-drip{from{transform:translateY(-8px);opacity:0;}15%{opacity:1;}to{transform:translateY(30px);opacity:0;}}
@@.hm-probe-scene .hm-blend .igs-fx-fill{fill:#c9473f;}
@@.hm-blend{animation:hm-veil .6s ease-out 1.5s both;}
@@.hm-probe-scene .hm-doll .igs-fx-fill{fill:#e7d6b3;}
@@.hm-probe-scene .hm-doll-arm .igs-fx-line{stroke:#e7d6b3;}
@@.hm-probe-scene .hm-doll-tag-bg .igs-fx-fill{fill:#f6ecd0;}
@@.hm-doll-tag{fill:#cf5a4c;stroke:none;font-family:inherit;}
@@.hm-probe-scene .hm-doll-pin .igs-fx-line{stroke:#cf5a4c;}
@@.hm-doll-pin{animation:hm-pin-in .35s ease-in 1s both;}
@@.hm-doll-pin.is-b{animation-delay:1.3s;}
@keyframes hm-pin-in{from{opacity:0;transform:translateY(-8px);}}

@@.hm-impact{position:absolute;width:3.4em;height:3.4em;border:1px solid #cf5a4c;border-radius:50%;transform:translate(-50%,-50%);animation:hm-ripple .7s ease-out both;}
@@.hm-impact.is-b{animation-delay:.15s;}
@keyframes hm-ripple{from{opacity:0;transform:translate(-50%,-50%) scale(.4);}40%{opacity:1;}}
@@.hm-brush{position:absolute;left:50%;top:max(16px,5%);transform:translateX(-50%);font-size:1.8em;letter-spacing:.5em;padding:.2em .8em .2em calc(.8em + .5em);white-space:nowrap;color:#ece2c8;background:rgba(20,15,12,.55);border-bottom:1px solid rgba(201,169,97,.4);animation:hm-veil .5s ease-out .15s both;}
@@.hm-brush.is-low{top:max(16px,5%);bottom:auto;}
@@.hm-gate{position:relative;width:min(150px,44%);height:min(210px,52%);overflow:hidden;background:rgba(20,15,12,.55);border:1px solid rgba(201,169,97,.5);}
@@.hm-door{position:absolute;top:0;bottom:0;left:0;width:50%;background:repeating-linear-gradient(90deg,rgba(20,15,12,.85) 0 11px,rgba(201,169,97,.3) 11px 12px);border-right:1px solid #c9a961;animation:hm-door-l .7s cubic-bezier(.5,0,.8,.4) both;}
@@.hm-door.is-b{left:auto;right:0;border-right:0;border-left:1px solid #c9a961;animation-name:hm-door-r;}
@keyframes hm-door-l{from{transform:translateX(-100%);}}
@keyframes hm-door-r{from{transform:translateX(100%);}}
@@.hm-strip{position:absolute;left:50%;top:50%;width:140%;height:0;border-top:1px solid #cf5a4c;transform:translate(-50%,-50%) rotate(32deg);animation:hm-strip-in .25s ease-out 1.1s both;}
@@.hm-strip.is-b{transform:translate(-50%,-50%) rotate(-32deg);animation-name:hm-strip-in-b;animation-delay:1.3s;}
@keyframes hm-strip-in{from{transform:translate(-50%,-50%) rotate(32deg) scaleX(0);}}
@keyframes hm-strip-in-b{from{transform:translate(-50%,-50%) rotate(-32deg) scaleX(0);}}
@@.hm-greyveil{position:absolute;inset:0;background:linear-gradient(180deg,#1f1d1c,transparent 75%);opacity:.5;animation:hm-veil 1s ease both;}
@@.hm-board-hang{position:absolute;right:max(24px,8%);top:0;display:flex;flex-direction:column;align-items:center;transform-origin:50% 0;animation:hm-swing 2.2s ease-out both;}
@keyframes hm-swing{from{transform:rotate(-8deg);opacity:0;}30%{opacity:1;}}
@@.hm-chain{display:block;width:0;height:3.4em;border-left:1px solid #8f866f;}
@@.hm-chain.is-b{display:none;}
@@.hm-plank{padding:.8em .6em;background:rgba(20,15,12,.8);border:1px solid rgba(201,169,97,.4);color:#a99d82;font-size:1.3em;letter-spacing:.3em;writing-mode:vertical-rl;}

@@.hm-dim{position:absolute;inset:0;background:#120c0a;opacity:.42;animation:hm-veil 1s ease both;}
@@.hm-trayfull{position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;}
@@.hm-trayfull-plate{position:relative;width:min(240px,64vw);aspect-ratio:120/84;animation:hm-rise .9s ease-out both;}
@@.hm-trayfull-plate svg{display:block;width:100%;height:auto;overflow:visible;}
/* The silk SVG extends below its 120:84 plate; keep labels in the original slots. */
@@.hm-tray.is-silk .hm-trayfull-plate svg{position:absolute;left:0;top:0;}
@@.hm-trayfull-label{font-size:1.5em;letter-spacing:.4em;padding-left:.4em;color:#ece2c8;text-shadow:0 1px 8px rgba(0,0,0,.6);animation:hm-rise .6s ease-out .7s both;}
@@.hm-trayfull-who{color:#a99d82;letter-spacing:.3em;animation:hm-rise .6s ease-out 1s both;}

@@.hm-thread{display:block;}
@@.hm-pulse{position:absolute;right:max(16px,4%);top:calc(var(--igs-fx-vis) * .44);width:9.5em;padding:8px 12px;text-align:center;animation:hm-rise .5s ease-out .3s both;}
@@.hm-pulse-title{letter-spacing:.3em;}
@@.hm-pulse svg{display:block;width:100%;height:2.4em;}
@@.hm-pulse polyline{fill:none;stroke:#c9a961;stroke-width:1.2;stroke-linejoin:round;}
@@.hm-pulse-note{margin-top:2px;letter-spacing:.3em;}

@@.hm-petals{position:absolute;inset:0;overflow:hidden;}
@@.hm-petal{position:absolute;top:-6%;width:3px;height:3px;border-radius:50%;background:#c9a961;animation:hm-fall 3s ease-in both;}
@@.hm-petal.is-gold{background:#ece2c8;}
@keyframes hm-fall{from{transform:translateY(0);}to{transform:translateY(110vh);}}
@@.hm-bless{position:absolute;left:0;right:0;top:max(16px,5%);padding:.8em 0;text-align:center;background:linear-gradient(90deg,transparent,rgba(20,15,12,.7) 20%,rgba(20,15,12,.7) 80%,transparent);border-block:1px solid rgba(201,169,97,.5);animation:hm-veil .5s ease-out both;}
@@.hm-bless-main{font-size:2em;letter-spacing:.4em;padding-left:.4em;color:#ece2c8;text-shadow:0 1px 8px rgba(0,0,0,.6);}
@@.hm-bless-main span{display:inline-block;animation:hm-char .4s ease-out both;}
@@.hm-bless-sub{margin-top:2px;color:#c9a961;letter-spacing:.3em;}

@@.hm-glare-vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,transparent 60%,#2a0a0a 130%);opacity:.3;animation:hm-veil .8s ease both;}

@@.igs-dfx-amb.is-hmbed .hm-amb-shade{inset:0;background:radial-gradient(ellipse 90% 80% at 50% 45%,transparent 45%,rgba(60,14,10,.4) 100%);}
@@.hm-amb-lamp{left:6%;top:6%;width:18%;aspect-ratio:1;border-radius:50%;background:radial-gradient(closest-side,rgba(255,176,86,.4),transparent);animation:hm-amb-flicker 7s ease-in-out infinite;}
@@.hm-amb-lamp.is-b{left:auto;right:6%;animation-delay:-3s;}
@keyframes hm-amb-flicker{0%,100%{opacity:.75;}40%{opacity:1;}65%{opacity:.6;}}
@@.hm-amb-garden{inset:0;background:linear-gradient(180deg,rgba(214,236,200,.1),transparent 40%,rgba(34,60,30,.2));}
@@.hm-amb-petal{left:20%;top:-4%;width:.7em;height:.7em;border-radius:50% 0 50% 50%;background:#f2b8c6;animation:hm-amb-petal 16s linear infinite;}
@@.hm-amb-petal.is-b{left:68%;animation-delay:-8s;}
@keyframes hm-amb-petal{from{transform:translate3d(0,0,0) rotate(0);}to{transform:translate3d(8vw,110vh,0) rotate(300deg);}}
@@.hm-amb-grey{inset:0;background:rgba(150,150,145,.22);}
@@.hm-amb-crack{left:0;top:0;width:30%;height:100%;background:linear-gradient(115deg,transparent 48%,rgba(20,18,16,.35) 49%,rgba(20,18,16,.35) 50%,transparent 51%);}
@@.hm-amb-draft{left:-30%;top:0;bottom:0;width:30%;background:linear-gradient(90deg,transparent,rgba(220,220,214,.1),transparent);animation:hm-amb-draft 14s linear infinite;}
@keyframes hm-amb-draft{from{transform:translate3d(0,0,0);}to{transform:translate3d(450%,0,0);}}
@@.hm-amb-wall{left:0;right:0;bottom:0;height:22%;background:linear-gradient(0deg,rgba(60,14,10,.35),transparent);}
@@.hm-amb-lantern{left:14%;top:4%;width:7%;aspect-ratio:1;border-radius:50%;background:radial-gradient(closest-side,rgba(255,150,80,.7),rgba(200,40,30,.35) 55%,transparent);animation:hm-amb-flicker 6s ease-in-out infinite;}
@@.hm-amb-lantern.is-b{left:auto;right:16%;top:7%;animation-delay:-2.5s;}
@@.igs-dfx-amb.is-night .hm-amb-lantern,@@.igs-dfx-amb.is-night .hm-amb-lamp{filter:brightness(1.25);}
@@.igs-dfx-amb.is-reduced i,@@[data-igs-quality="low"] .igs-dfx-amb[class*="is-hm"] i{animation:none;}
@@[data-igs-quality="low"] .hm-amb-petal{display:none;}
`;

export const HAREM_STYLE_TEXT = RAW.replaceAll('@@', '#igs-overlay ');
