// 偶像包样式：舞台黑底配应援粉与金，装饰一律实色（光束与暗角除外，它们本身就是光）；动画终态即基础样式，.is-reduced 关掉动画后仍是完整静态画面。
// 常驻层只有静态与极慢的呼吸；低画质与减少动态效果下循环动画全部静止。
// 荧光棒：整排只用一个元素，每根棒是两层渐变背景（亮芯加柔光），同排共用一段 skewX 摆动，排与排错开相位。
// 背景位置的百分比按（容器宽 - 图宽）折算，这里补一段像素修正，让每根的中心落在容器宽度的 x% 处。
const stickLayers = (xs, { core, halo, heights, pal }) => {
    const at = (x, w) => `calc(${x}% + ${Math.round(w * (x / 100 - 0.5) * 10) / 10}px) 100%`;
    const cores = xs.map((x, i) => `linear-gradient(0deg,transparent,rgba(255,250,242,.94) 16%,rgba(255,250,242,.94) 84%,transparent) ${at(x, core)} / ${core}px ${Math.round(heights[i % heights.length] * 0.8)}% no-repeat`);
    const halos = xs.map((x, i) => `radial-gradient(closest-side,${pal[i % pal.length]},transparent) ${at(x, halo)} / ${halo}px ${heights[i % heights.length]}% no-repeat`);
    return [...cores, ...halos].join(',');
};
// 灯海三排：前排少而大，中排居中，后排多而小；位置有意不等距。
const LS_FRONT = stickLayers([13, 37, 68, 89], { core: 3, halo: 26, heights: [100, 88, 96, 84], pal: ['var(--l1)', 'var(--l2)', 'var(--l3)'] });
const LS_MID = stickLayers([6, 24, 41, 57, 77, 94], { core: 2, halo: 17, heights: [92, 100, 86, 96, 90, 98], pal: ['var(--l2)', 'var(--l1)', 'var(--l3)'] });
const LS_BACK = stickLayers([4, 15, 27, 44, 53, 66, 82, 91], { core: 2, halo: 11, heights: [84, 100, 90, 78, 96, 88, 100, 82], pal: ['var(--l1)', 'var(--l3)', 'var(--l2)'] });
const OS_STICKS = stickLayers([6, 17, 29, 41, 52, 63, 75, 86, 94], { core: 2, halo: 16, heights: [90, 100, 86, 96, 92, 100, 84, 94, 88], pal: ['var(--l1)', 'var(--l2)', 'var(--l3)'] });

const RAW = `
@@.igs-id{overflow:hidden;font-weight:700;animation:igs-id-fade var(--igs-dfx-life) ease both;}
@@.igs-id i,@@.igs-id b,@@.igs-id em{display:block;font-style:normal;}
@@.igs-id svg{display:block;}
/* 对话框避让：沿用公共变量 --igs-fx-safe / --igs-fx-vis（定义在 fx-style.js 的 #igs-overlay 上，含直播全屏覆盖）。 */
@@.igs-id.is-reduced,@@.igs-id.is-reduced *{animation:none!important;}
@@.igs-id.is-reduced .igs-id-fs-name span{clip-path:none;}
@@.igs-id.is-reduced .igs-id-os-chant,@@.igs-id.is-reduced .igs-id-os-sticks,@@.igs-id.is-reduced .igs-id-os-flash,@@.igs-id.is-reduced .igs-id-aw-env,@@.igs-id.is-reduced .igs-id-pp-flashes,@@.igs-id.is-reduced .igs-id-aw-motes{display:none;}
@@.igs-id.is-reduced .igs-id-os-lift{transform:none;}
@@.igs-id-mini-bg,@@.igs-id-fc-zoom,@@.igs-id-pr-zoom,@@.igs-id-bs-zoom{position:absolute;inset:0;}

/* 打歌舞台登场 */
@@.igs-id-os-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(26,10,30,.66) 0,rgba(26,10,30,.66) calc(var(--igs-fx-vis) * .55),transparent var(--igs-fx-vis));opacity:.82;animation:igs-id-scrim-in .5s ease both;}
@@.igs-id-os-scrim::after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 38%,rgba(255,111,174,.2),rgba(95,200,255,.14) 42%,transparent 66%);animation:igs-id-breathe 3s ease-in-out 1s infinite;}
@@.igs-id-os-beam{position:absolute;top:-10%;width:34%;height:122%;background:linear-gradient(180deg,rgba(255,240,205,.4),rgba(255,140,180,.22) 42%,rgba(255,240,205,0));clip-path:polygon(42% 0,58% 0,100% 100%,0 100%);filter:blur(2px);transform-origin:50% 0;animation:igs-id-beam-a 3.4s ease-in-out var(--igs-id-lead,0ms) both;}
@@.igs-id-os-beam::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,255,255,.5),transparent 38%);clip-path:inherit;}
@@.igs-id-os-beam.is-a{left:6%;}
@@.igs-id-os-beam.is-b{right:6%;animation-name:igs-id-beam-b;}
@@.igs-id-os-lit{position:absolute;inset:0;animation:igs-id-lit 2.2s ease-out calc(var(--igs-id-lead,0ms) + .6s) both;}
@@.igs-id-os-lift{position:absolute;left:50%;bottom:var(--igs-fx-safe);width:52%;height:calc(var(--igs-fx-vis) * .18);margin-left:-26%;animation:igs-id-lift 1.5s cubic-bezier(.3,.7,.3,1) var(--igs-id-lead,0ms) both;}
@@.igs-id-os-lift i:first-child{height:3px;background:linear-gradient(90deg,transparent,#f3dca0,#ff6fae,#f3dca0,transparent);box-shadow:0 0 16px rgba(243,220,160,.7),0 0 30px rgba(255,111,174,.4);}
@@.igs-id-os-lift i:last-child{height:100%;background:linear-gradient(180deg,rgba(40,20,52,.5),transparent);}
@@.igs-id-os-flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,#ffffff,rgba(255,240,205,.6) 30%,transparent 62%);opacity:0;animation:igs-id-flash .6s ease-out calc(var(--igs-id-lead,0ms) + 1.4s) both;}
@@.igs-id-os-song{position:absolute;left:5%;bottom:calc(var(--igs-fx-safe) + 8px);padding:4px 16px 5px 14px;border-left:3px solid #ff6fae;background:linear-gradient(90deg,rgba(40,16,48,.62),rgba(40,16,48,.32));color:#ffffff;box-shadow:0 0 20px rgba(255,111,174,.3);animation:igs-id-slide-l .5s ease-out calc(var(--igs-id-lead,0ms) + 2s) both;}
@@.igs-id-os-song small{color:#ffd83a;font-size:.7em;font-weight:400;letter-spacing:.3em;}
@@.igs-id-os-song b{font-size:1.1em;font-weight:500;letter-spacing:.1em;}
@@.igs-id-os-chant{position:absolute;left:0;right:0;top:20%;display:flex;justify-content:center;gap:4px;color:#ffffff;font-size:1.9em;font-weight:500;letter-spacing:.2em;text-shadow:0 0 16px rgba(255,111,174,.9),0 2px 6px rgba(0,0,0,.4);animation:igs-id-chant 1.7s ease both;}
@@.igs-id-os-chant span{display:inline-block;animation:igs-id-pop .3s ease-out both;}

/* 直拍框 */
@@.igs-id-fc-dim{position:absolute;inset:0;background:linear-gradient(180deg,#000000 0,#000000 calc(var(--igs-fx-vis) * .7),transparent var(--igs-fx-vis));opacity:.62;animation:igs-id-scrim-in .4s ease both;}
@@.igs-id-fc-frame{position:absolute;left:50%;top:4%;bottom:var(--igs-fx-safe);aspect-ratio:9/16;max-width:92%;transform:translateX(-50%);border:1px solid rgba(255,255,255,.7);border-radius:6px;background:#1b1830;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.45);animation:igs-id-frame-in .45s ease-out both;}
@@.igs-id-fc-shake{position:absolute;inset:0;animation:igs-id-handheld 2.4s ease-in-out infinite;}
@@.igs-id-fc-zoom{transform:scale(1.85);}
@@.igs-id-fc-grid{position:absolute;inset:0;}
@@.igs-id-fc-grid i{position:absolute;background:#ffffff;opacity:.35;}
@@.igs-id-fc-grid i:nth-child(1){left:33.3%;top:0;bottom:0;width:1px;}
@@.igs-id-fc-grid i:nth-child(2){left:66.6%;top:0;bottom:0;width:1px;}
@@.igs-id-fc-grid i:nth-child(3){top:33.3%;left:0;right:0;height:1px;}
@@.igs-id-fc-grid i:nth-child(4){top:66.6%;left:0;right:0;height:1px;}
@@.igs-id-fc-hud{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:10px;padding:8px 12px;color:#ffffff;font-family:Consolas,monospace;font-size:.78em;text-shadow:0 1px 3px #000000;}
@@.igs-id-fc-rec{display:flex;align-items:center;gap:6px;font-weight:900;letter-spacing:.1em;}
@@.igs-id-fc-rec i{width:9px;height:9px;border-radius:50%;background:#ff2f3d;animation:igs-id-blink 1.1s steps(1) infinite;}
@@.igs-id-fc-tc{margin-left:auto;}
@@.igs-id-fc-batt{display:flex;gap:2px;padding:2px;border:1px solid #ffffff;border-radius:2px;}
@@.igs-id-fc-batt i{width:4px;height:8px;background:#ffffff;}
@@.igs-id-fc-title{position:absolute;left:0;right:0;bottom:0;padding:30px 14px 12px;background:linear-gradient(0deg,rgba(10,8,22,.82),transparent);color:#ffffff;animation:igs-id-line-in .5s ease-out .5s both;}
@@.igs-id-fc-title b{font-size:1.1em;font-weight:500;letter-spacing:.1em;}
@@.igs-id-fc-title small{display:block;color:#f3dca0;font-size:.7em;font-weight:400;letter-spacing:.34em;}
@@.igs-id-fc-focus{position:absolute;left:50%;top:34%;width:28%;aspect-ratio:1;margin-left:-14%;border:1px solid rgba(243,220,160,.85);border-radius:2px;animation:igs-id-focus .8s ease-out .3s both;}

/* 应援色灯海 */
@@.igs-id-lightsea{--c:#ff6fae;--c2:#5fc8ff;--c3:#fff0f8;--l1:var(--c);--l2:var(--c2);--l3:var(--c3);}
@supports (color:color-mix(in srgb,red,blue)){@@.igs-id-lightsea{--l1:color-mix(in srgb,var(--c) 66%,#d8d2d6);--l2:color-mix(in srgb,var(--c2) 66%,#d8d2d6);}}
@@.igs-id-lightsea::after{content:"";position:absolute;left:5%;right:5%;bottom:var(--igs-fx-safe);height:22%;background:radial-gradient(ellipse at 50% 100%,rgba(255,111,174,.5) 0%,rgba(95,200,255,.28) 44%,transparent 72%);pointer-events:none;animation:igs-id-breathe 2.6s ease-in-out 1.4s infinite;}
@@.igs-id-ls-wash{position:absolute;left:0;right:0;bottom:0;height:calc(var(--igs-fx-safe) + 26%);background:linear-gradient(0deg,var(--c) 0%,var(--c2) 50%,transparent);opacity:.44;animation:igs-id-wash-in 1.2s ease both,igs-id-breathe 2.4s ease-in-out 1.2s infinite;}
@@.igs-id-ls-crowd{position:absolute;inset:0;}
@@.igs-id-os-sticks{--l1:#d9a5bd;--l2:#9fc3d6;--l3:#dcc98f;position:absolute;left:0;right:0;bottom:var(--igs-fx-safe);height:calc(var(--igs-fx-vis) * .22);background:${OS_STICKS};transform-origin:50% 100%;opacity:.88;animation:igs-id-chant 1.7s ease both,igs-id-ls-sway 1s ease-in-out 2 alternate;}
@@.igs-id-ls-row{position:absolute;left:0;right:0;transform-origin:50% 100%;animation:igs-id-ls-in .7s ease-out var(--rd) both,igs-id-ls-sway 1.2s ease-in-out var(--rp) 5 alternate;}
@@.igs-id-ls-row.is-r0{bottom:calc(var(--igs-fx-safe) + 1%);height:15%;--rd:.2s;--rp:-.8s;opacity:.4;background:${LS_BACK};}
@@.igs-id-ls-row.is-r1{bottom:calc(var(--igs-fx-safe) - 2%);height:20%;--rd:.1s;--rp:-.4s;opacity:.55;background:${LS_MID};}
@@.igs-id-ls-row.is-r2{bottom:calc(var(--igs-fx-safe) - 6%);height:26%;--rd:0s;--rp:0s;opacity:.66;background:${LS_FRONT};}
@@.igs-id-ls-name{position:absolute;left:0;right:0;top:12%;display:flex;align-items:center;justify-content:center;gap:14px;color:#ffffff;font-size:1.2em;font-weight:500;letter-spacing:.3em;text-shadow:0 0 14px rgba(255,111,174,.9),0 1px 4px rgba(0,0,0,.5);animation:igs-id-line-in .6s ease-out .8s both;}
@@.igs-id-ls-name i{width:42px;height:2px;background:linear-gradient(90deg,transparent,var(--c));box-shadow:0 0 7px var(--c);}
@@.igs-id-ls-name i:last-child{background:linear-gradient(90deg,var(--c),transparent);}

/* 选秀出道位 */
@@.igs-id-debut{display:flex;align-items:center;justify-content:flex-start;box-sizing:border-box;padding:0 0 var(--igs-fx-safe) max(16px,6%);}
@@.igs-id-db-dim{position:absolute;inset:0;background:linear-gradient(180deg,#070511 0,#070511 calc(var(--igs-fx-vis) * .7),transparent var(--igs-fx-vis));opacity:.45;animation:igs-id-scrim-in .4s ease both;}
@@.igs-id-db-board{position:relative;min-width:min(300px,80%);box-sizing:border-box;padding:12px 18px 16px;animation:igs-id-board-in .5s ease-out both;}
@@.igs-id-db-board.igs-panel{border:1px solid rgba(255,255,255,.28);border-radius:4px;background:rgba(14,10,26,.42);box-shadow:none;color:#f1edf9;}
@@.igs-id-db-board .igs-panel-title{font-weight:500;letter-spacing:.3em;border-bottom:1px solid rgba(243,220,160,.5);color:#f3dca0;}
@@.igs-id-db-tiers{display:flex;flex-direction:column;align-items:center;gap:8px;margin-top:6px;}
@@.igs-id-db-tier{display:flex;justify-content:center;gap:8px;}
@@.igs-id-db-seat{width:84px;box-sizing:border-box;padding:6px 4px 7px;border:1px solid rgba(255,255,255,.28);border-radius:3px;background:rgba(255,255,255,.06);color:#eae6f5;text-align:center;animation:igs-id-seat 1.4s ease-out var(--igs-id-d,0ms) both;}
@@.igs-id-db-seat em{font-size:1.4em;font-weight:500;line-height:1.1;}
@@.igs-id-db-seat b{font-size:.92em;font-weight:500;}
@@.igs-id-db-seat.is-first{border-color:#f3dca0;background:rgba(243,220,160,.14);color:#f8e8b8;}

/* 一位颁奖 */
@@.igs-id-aw-dim{position:absolute;inset:0;background:linear-gradient(180deg,#070511 0,#070511 calc(var(--igs-fx-vis) * .7),transparent var(--igs-fx-vis));opacity:.5;animation:igs-id-scrim-in .4s ease both;}
@@.igs-id-aw-halo{position:absolute;left:0;top:0;width:60%;height:calc(var(--igs-fx-vis) * .8);background:radial-gradient(ellipse at 30% 40%,rgba(243,220,160,.24),transparent 62%);animation:igs-id-scrim-in 1.2s ease both;}
@@.igs-id-aw-env{position:absolute;left:max(16px,6%);top:calc(var(--igs-fx-vis) * .3);width:min(34%,360px);animation:igs-id-env-out .45s ease-in calc(var(--igs-id-lead,0ms) - .45s) forwards;}
@@.igs-id-aw-env i{height:1px;background:linear-gradient(90deg,#f3dca0,transparent);transform-origin:0 50%;animation:igs-id-line-grow 1.2s ease-out both;}
@@.igs-id-aw-motes{position:absolute;inset:0;}
@@.igs-id-aw-motes i{position:absolute;bottom:var(--igs-fx-safe);left:calc(var(--x) * .6);width:var(--w);height:var(--w);border-radius:50%;background:#f6e4b0;opacity:0;animation:igs-id-mote 3.4s ease-out var(--d) both;}
@@.igs-id-aw-plate{position:absolute;left:max(16px,6%);top:calc(var(--igs-fx-vis) * .16);width:min(34%,360px);display:flex;flex-direction:column;align-items:flex-start;}
@@.igs-id-aw-word{display:flex;font-family:"Noto Serif SC","Source Han Serif SC","Songti SC",serif;font-size:clamp(2.6em,6.4vw,4.2em);font-weight:500;letter-spacing:.14em;color:#fbf3dc;text-shadow:0 2px 18px rgba(243,220,160,.45);}
@@.igs-id-aw-word span{display:inline-block;animation:igs-id-line-in .7s ease-out both;}
@@.igs-id-aw-rule{width:100%;height:1px;margin:10px 0 8px;background:linear-gradient(90deg,#f3dca0,transparent);transform-origin:0 50%;animation:igs-id-line-grow .9s ease-out calc(var(--igs-id-lead,0ms) + 1s) both;}
@@.igs-id-aw-who{color:#ffffff;animation:igs-id-line-in .5s ease-out calc(var(--igs-id-lead,0ms) + 1.5s) both;}
@@.igs-id-aw-who small{display:block;color:#f3dca0;font-size:.72em;font-weight:400;letter-spacing:.4em;}
@@.igs-id-aw-who b{font-size:1.2em;font-weight:500;letter-spacing:.16em;}

/* 签售会 */
@@.igs-id-fs-board{position:absolute;left:max(16px,6%);top:12%;width:min(32%,320px);box-sizing:border-box;padding:14px 22px 16px;border:1px solid rgba(255,111,174,.55);border-radius:6px;background:linear-gradient(135deg,rgba(40,18,56,.7),rgba(20,10,40,.6));color:#ffffff;box-shadow:0 0 22px rgba(255,111,174,.25),inset 0 1px 0 rgba(255,111,174,.3);animation:igs-id-board-in .6s ease-out both;}
@@.igs-id-fs-board small{color:#ffd83a;font-size:.72em;font-weight:400;letter-spacing:.36em;text-shadow:0 0 8px rgba(255,216,58,.6);}
@@.igs-id-fs-name{display:flex;justify-content:flex-start;gap:4px;margin-top:6px;font-family:"Noto Serif SC","Source Han Serif SC","Songti SC",serif;font-size:2.2em;font-weight:500;letter-spacing:.1em;color:#ffffff;text-shadow:0 0 18px rgba(255,111,174,.65),0 1px 4px rgba(0,0,0,.4);}
@@.igs-id-fs-name span{display:inline-block;clip-path:inset(0 100% 0 0);animation:igs-id-write .42s ease-out var(--igs-id-d) both;}
@@.igs-id-fs-note{position:absolute;right:max(16px,6%);width:min(30%,280px);box-sizing:border-box;padding:9px 14px 9px 14px;border-radius:5px;border:1px solid rgba(255,111,174,.38);background:linear-gradient(135deg,rgba(50,22,66,.72),rgba(28,14,48,.65));color:#f9e8ff;font-size:.9em;font-weight:400;line-height:1.5;box-shadow:0 4px 16px rgba(0,0,0,.3),0 0 12px rgba(255,111,174,.15);animation:igs-id-line-in .9s ease-out var(--igs-id-d) both;}
@@.igs-id-fs-note::before{content:"\\2665";position:absolute;top:7px;right:10px;color:#ff6fae;font-size:.75em;opacity:.7;}
@@.igs-id-fs-note.is-n0{top:14%;}
@@.igs-id-fs-note.is-n1{top:calc(14% + 66px);}
@@.igs-id-fs-note.is-n2{top:calc(14% + 132px);}

/* 狗仔偷拍 */
@@.igs-id-pp-view{position:absolute;inset:0;overflow:hidden;background:#05080a;}
@@.igs-id-pp-zoom{position:absolute;inset:0;transform:scale(1.32);animation:igs-id-push 3.4s ease-out both;}
@@.igs-id-pp-view::after{content:"";position:absolute;inset:0;background:#0a1410;opacity:.22;}
@@.igs-id-pp-vignette{position:absolute;inset:0;background:radial-gradient(circle at 50% 46%,transparent 34%,#000000 82%);opacity:.86;animation:igs-id-scrim-in .5s ease both;}
@@.igs-id-pp-fg{position:absolute;top:-6%;bottom:-6%;width:16%;filter:blur(7px);}
@@.igs-id-pp-fg.is-l{left:-3%;}
@@.igs-id-pp-fg.is-r{right:-3%;}
@@.igs-id-pp-fg i{position:absolute;left:0;right:0;height:30%;background:#0b1a12;border-radius:46% 54% 50% 50%;}
@@.igs-id-pp-fg i:nth-child(1){top:4%;}
@@.igs-id-pp-fg i:nth-child(2){top:34%;left:20%;background:#12281b;}
@@.igs-id-pp-fg i:nth-child(3){top:64%;}
#igs-overlay[data-igs-quality="low"] .igs-id-pp-fg{filter:none;}
@@.igs-id-pp-focus{position:absolute;width:22%;aspect-ratio:1;margin:-11%;animation:igs-id-lock 1s cubic-bezier(.3,1.2,.4,1) .3s both;}
@@.igs-id-pp-focus i{position:absolute;width:20%;height:20%;border:0 solid #e4f4ea;}
@@.igs-id-pp-focus i.is-tl{left:0;top:0;border-left-width:3px;border-top-width:3px;}
@@.igs-id-pp-focus i.is-tr{right:0;top:0;border-right-width:3px;border-top-width:3px;}
@@.igs-id-pp-focus i.is-bl{left:0;bottom:0;border-left-width:3px;border-bottom-width:3px;}
@@.igs-id-pp-focus i.is-br{right:0;bottom:0;border-right-width:3px;border-bottom-width:3px;}
@@.igs-id-pp-focus b{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);color:#7bff9b;font-family:Consolas,monospace;font-size:.8em;}
@@.igs-id-pp-hud{position:absolute;left:0;right:0;top:5%;display:flex;justify-content:center;gap:22px;color:#7bff9b;font-family:Consolas,monospace;font-size:.9em;text-shadow:0 1px 3px #000000;}
@@.igs-id-pp-flashes{position:absolute;inset:0;}
@@.igs-id-pp-flashes i{position:absolute;inset:0;background:#ffffff;opacity:0;animation:igs-id-shot .2s ease-out both;}

/* 练习室镜墙 */
@@.igs-id-pr-wall{position:absolute;left:5%;right:5%;top:max(60px,14%);bottom:var(--igs-fx-safe);display:flex;gap:6px;padding:6px;border:1px solid rgba(255,255,255,.22);border-radius:4px;background:rgba(14,12,28,.5);animation:igs-id-rise .45s ease-out both;}
@@.igs-id-pr-pane{position:relative;flex:1;overflow:hidden;border-radius:2px;background:linear-gradient(180deg,rgba(66,72,104,.6),rgba(26,26,48,.78));}
@@.igs-id-pr-inner{position:absolute;inset:0;animation:igs-id-bounce var(--igs-id-beat,600ms) ease-in-out calc(var(--igs-id-phase,0) * var(--igs-id-beat,600ms)) infinite;}
@@.igs-id-pr-zoom{transform:scale(1.5);transform-origin:50% 30%;}
@@.igs-id-pr-zoom.is-flip{transform:scale(1.5) scaleX(-1);}
@@.igs-id-pr-glint{position:absolute;top:0;bottom:0;left:18%;width:14%;background:#ffffff;opacity:.07;transform:skewX(-16deg);}
@@.igs-id-pr-rail{position:absolute;left:5%;right:5%;top:calc(var(--igs-fx-vis) - 10px);height:1px;background:rgba(255,255,255,.35);}
@@.igs-id-pr-bpm{position:absolute;left:5%;top:max(16px,4%);display:flex;align-items:center;gap:10px;padding:5px 14px;border:1px solid rgba(255,255,255,.22);border-radius:3px;background:rgba(14,10,26,.5);color:#f3dca0;font-family:Consolas,monospace;}
@@.igs-id-pr-tick{width:2px;height:22px;border-radius:1px;background:#f3dca0;transform-origin:50% 100%;animation:igs-id-metro calc(var(--igs-id-beat,600ms) * 2) ease-in-out infinite;}

/* 后台候场 */
@@.igs-id-bs-dim{position:absolute;inset:0;background:linear-gradient(180deg,#0d0a18 0,#0d0a18 calc(var(--igs-fx-vis) * .7),transparent var(--igs-fx-vis));opacity:.7;animation:igs-id-scrim-in .4s ease both;}
@@.igs-id-bs-mirror{position:absolute;left:6%;top:9%;bottom:var(--igs-fx-safe);width:52%;box-sizing:border-box;padding:10px;border:1px solid rgba(243,220,160,.55);border-radius:4px;background:rgba(14,10,24,.45);animation:igs-id-rise .5s ease-out both;}
@@.igs-id-bs-glass{position:absolute;inset:10px;overflow:hidden;border-radius:2px;background:linear-gradient(180deg,#2b2542,#161226);}
@@.igs-id-bs-zoom{transform:scale(2);}
@@.igs-id-bs-ear{position:absolute;right:6%;top:9%;width:28%;box-sizing:border-box;padding:10px 12px 14px;border:1px solid rgba(243,220,160,.6);border-radius:4px;background:rgba(14,10,26,.5);color:#ffffff;text-align:center;animation:igs-id-line-in .5s ease-out .5s both;}
@@.igs-id-bs-ear small{color:#f3dca0;font-size:.8em;font-weight:400;letter-spacing:.2em;}
@@.igs-id-bs-digits{position:relative;height:3.2em;}
@@.igs-id-bs-digits b,@@.igs-id-bs-digits strong{position:absolute;left:0;right:0;top:0;font-size:2.8em;font-weight:500;line-height:1.1;color:#fbf3dc;opacity:0;animation:igs-id-count 1s steps(1,end) both;}
@@.igs-id-bs-digits strong{font-size:1.9em;color:#f3dca0;animation:igs-id-go .6s ease-out both;animation-fill-mode:both;}
@@.igs-id-backstage.is-reduced .igs-id-bs-digits b{opacity:0;}
@@.igs-id-backstage.is-reduced .igs-id-bs-digits strong{opacity:1;transform:none;}

/* 应援手幅 */
@@.igs-id-bn-sign{position:absolute;bottom:calc(var(--igs-fx-safe) + 4px);left:var(--x);width:28%;max-width:200px;translate:-50% 0;transform-origin:50% 100%;animation:igs-id-bn-up 1.1s cubic-bezier(.2,1.1,.3,1) var(--igs-id-d) both,igs-id-bn-sway 2.2s ease-in-out calc(var(--igs-id-d) + 1.1s) infinite alternate;}
@@.igs-id-bn-board{position:relative;box-sizing:border-box;padding:12px 10px;border:1px solid var(--c,#ff6fae);border-radius:4px;background:rgba(14,10,26,.46);color:#ffffff;font-size:1.3em;font-weight:500;letter-spacing:.14em;text-align:center;text-shadow:0 1px 8px rgba(0,0,0,.6);}
@@.igs-id-bn-stick{width:1px;height:54px;margin:0 auto;background:linear-gradient(180deg,var(--c,#ff6fae),transparent);}

/* 常驻层：后台走廊与练习室 */
@@.igs-dfx-amb .igs-id-amb-shade{inset:0;background:linear-gradient(180deg,rgba(20,14,40,.34),transparent 24%,transparent 70%,rgba(20,14,40,.4));}
@@.igs-dfx-amb .igs-id-amb-strip{left:0;right:0;top:0;height:6px;background:linear-gradient(90deg,transparent,#f4f1ff 12%,#f4f1ff 88%,transparent);opacity:.7;animation:igs-id-flicker 7s steps(1) infinite;}
@@.igs-dfx-amb .igs-id-amb-door{top:22%;width:9%;height:54%;border:1px solid #6a5f8a;background:rgba(43,36,66,.55);opacity:.6;}
@@.igs-dfx-amb .igs-id-amb-door.is-a{left:6%;}
@@.igs-dfx-amb .igs-id-amb-door.is-b{right:6%;}
@@.igs-dfx-amb .igs-id-amb-rack{left:30%;width:40%;top:48%;height:28%;border-top:1px solid #c9ccd6;opacity:.4;}
@@.igs-dfx-amb .igs-id-amb-mirror{left:4%;right:4%;top:10%;height:56%;border:1px solid #3a3550;background:#cdd9e6;opacity:.18;}
@@.igs-dfx-amb .igs-id-amb-mirror.is-b{left:auto;right:auto;opacity:0;}
@@.igs-dfx-amb .igs-id-amb-rail{left:4%;right:4%;top:60%;height:1px;background:#c9ccd6;opacity:.5;}
@@.igs-dfx-amb .igs-id-amb-floor{left:0;right:0;bottom:0;height:20%;background:linear-gradient(0deg,rgba(214,170,110,.26),transparent);}
@@.igs-dfx-amb .igs-id-amb-lamp{top:-6%;left:30%;width:40%;height:50%;background:radial-gradient(ellipse at 50% 0%,rgba(255,250,230,.38),rgba(255,250,230,0) 70%);animation:igs-id-breathe 9s ease-in-out infinite;}
#igs-overlay[data-igs-quality="low"] .igs-dfx-amb:is(.is-idbackstage,.is-idpractice) *{animation:none!important;}
#igs-overlay .igs-dfx-amb:is(.is-idbackstage,.is-idpractice).is-reduced *{animation:none!important;}

/* 低画质：循环动画停住，终态保留 */
#igs-overlay[data-igs-quality="low"] .igs-id :is(.igs-id-fc-shake,.igs-id-fc-rec i,.igs-id-os-sticks,.igs-id-ls-row,.igs-id-ls-wash,.igs-id-pr-inner,.igs-id-pr-tick,.igs-id-bn-sign){animation:none;}
#igs-overlay[data-igs-quality="low"] .igs-id-bn-sign{animation:igs-id-bn-up 1.1s cubic-bezier(.2,1.1,.3,1) var(--igs-id-d) both;}

@media (max-aspect-ratio:4/5){
#igs-overlay .igs-id-aw-plate{left:0;right:0;width:auto;top:calc(var(--igs-fx-vis) * .05);align-items:center;}
#igs-overlay .igs-id-aw-rule{background:linear-gradient(90deg,transparent,#f3dca0,transparent);}
#igs-overlay .igs-id-aw-env{left:20%;width:60%;}
#igs-overlay .igs-id-fs-board{left:max(16px,4%);width:min(54%,300px);top:4%;padding:10px 16px 12px;}
#igs-overlay .igs-id-fs-note{right:max(16px,4%);width:min(40%,200px);}
#igs-overlay .igs-id-fs-note.is-n0{top:calc(var(--igs-fx-vis) * .52);}
#igs-overlay .igs-id-fs-note.is-n1{top:calc(var(--igs-fx-vis) * .52 + 62px);}
#igs-overlay .igs-id-fs-note.is-n2{top:calc(var(--igs-fx-vis) * .52 + 124px);}
#igs-overlay .igs-id-debut{justify-content:center;align-items:flex-start;padding-left:0;padding-top:max(12px,4%);}
}
@keyframes igs-id-rise{from{opacity:0;transform:translateY(24px)}}
@keyframes igs-id-push{from{transform:scale(1.12)}}
@keyframes igs-id-fade{0%{opacity:0}7%{opacity:1}90%{opacity:1}100%{opacity:0}}
@keyframes igs-id-scrim-in{from{opacity:0}}
@keyframes igs-id-blink{0%{opacity:1}50%{opacity:.15}100%{opacity:1}}
@keyframes igs-id-beam-a{0%{opacity:0;transform:rotate(-34deg)}15%{opacity:1}55%{transform:rotate(30deg)}80%{opacity:1;transform:rotate(-6deg)}100%{opacity:.35;transform:rotate(0deg)}}
@keyframes igs-id-beam-b{0%{opacity:0;transform:rotate(34deg)}15%{opacity:1}55%{transform:rotate(-30deg)}80%{opacity:1;transform:rotate(6deg)}100%{opacity:.35;transform:rotate(0deg)}}
@keyframes igs-id-lit{0%{filter:brightness(0) opacity(1);opacity:.0}25%{opacity:1}100%{filter:none;opacity:1}}
@keyframes igs-id-lift{from{transform:translateY(120%)}}
@keyframes igs-id-flash{0%{opacity:.4}100%{opacity:0}}
@keyframes igs-id-slide-l{from{opacity:0;transform:translateX(-30px)}}
@keyframes igs-id-chant{0%{opacity:0}12%{opacity:1}85%{opacity:1}100%{opacity:0}}
@keyframes igs-id-pop{from{opacity:0;transform:scale(1.7)}}
@keyframes igs-id-frame-in{from{opacity:0;transform:translateX(-50%) scale(.88)}}
@keyframes igs-id-handheld{0%{transform:translate(0,0) rotate(0deg)}25%{transform:translate(-1.2%,.8%) rotate(-.5deg)}50%{transform:translate(.8%,-.6%) rotate(.4deg)}75%{transform:translate(-.6%,-.9%) rotate(-.3deg)}100%{transform:translate(0,0) rotate(0deg)}}
@keyframes igs-id-line-in{from{opacity:0;transform:translateY(10px)}}
@keyframes igs-id-focus{from{opacity:0;transform:scale(2.2)}}
@keyframes igs-id-wash-in{from{opacity:0}}
@keyframes igs-id-breathe{0%{opacity:.34}50%{opacity:.6}100%{opacity:.34}}
@keyframes igs-id-ls-in{from{opacity:0}}
@keyframes igs-id-ls-sway{from{transform:skewX(-4deg)}to{transform:skewX(4deg)}}
@keyframes igs-id-board-in{from{opacity:0;transform:translateY(22px)}}
@keyframes igs-id-seat{0%{opacity:.25;filter:grayscale(1);transform:scale(.86)}35%{opacity:.25;filter:grayscale(1);transform:scale(.86)}55%{opacity:1;filter:none;transform:scale(1.14)}100%{opacity:1;filter:none;transform:scale(1)}}
@keyframes igs-id-env-out{to{opacity:0;transform:scale(.7) translateY(-30px)}}
@keyframes igs-id-line-grow{from{transform:scaleX(0)}}
@keyframes igs-id-mote{0%{opacity:0;transform:translateY(0)}20%{opacity:.8}100%{opacity:0;transform:translateY(-52vh)}}
@keyframes igs-id-write{to{clip-path:inset(0 0 0 0)}}
@keyframes igs-id-lock{from{opacity:0;transform:scale(3)}}
@keyframes igs-id-shot{0%{opacity:.8}100%{opacity:0}}
@keyframes igs-id-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4%)}}
@keyframes igs-id-metro{0%,100%{transform:rotate(-26deg)}50%{transform:rotate(26deg)}}
@keyframes igs-id-count{0%{opacity:1}100%{opacity:0}}
@keyframes igs-id-go{from{opacity:0;transform:scale(1.8)}to{opacity:1;transform:scale(1)}}
@keyframes igs-id-bn-up{from{transform:translateY(110%)}}
@keyframes igs-id-bn-sway{from{rotate:-1.6deg}to{rotate:1.6deg}}
@keyframes igs-id-flicker{0%,93%,97%{opacity:.7}95%{opacity:.3}}
`;

export const IDOL_STYLE_TEXT = RAW.replace(/^@@/gm, '#igs-overlay ').replace(/,@@/g, ',#igs-overlay ');
