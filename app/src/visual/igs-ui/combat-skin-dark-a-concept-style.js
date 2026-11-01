// 由 gal/战斗界面设计稿/落盘/gen-skin-css.mjs 从概念稿 dark/common.css、dark/grid.css、dark/A.css、dark/minimal.css 生成，不要手改；改设计稿后重新生成。
// 选择器作用域见生成脚本说明，规则内容与设计稿一致（本地图片地址换成 none）。
export const COMBAT_SKIN_DARK_A_CONCEPT_CSS = `
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) *{box-sizing: border-box; margin: 0; padding: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]){position: relative; overflow: hidden; background: #0b0b0c; user-select: none; -webkit-user-select: none; --k: 1;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]):not(.land){width: 390px; height: 844px; border-radius: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land{width: 1280px; height: 720px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) > *{position: absolute;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .deco > *{position: absolute;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .bg,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .shade,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .deco,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .over{inset: 0; pointer-events: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .bg{background: none center 30% / cover no-repeat;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) svg{fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .who{position: relative; display: block; overflow: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .who .igs-combat-art{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .mface{display: grid; place-items: center; background-color: #1c1c1e; color: #d9d6cf;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .foes{pointer-events: auto;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .foes .foe{position: absolute; left: 50%; bottom: calc(var(--base, 0px) + var(--fb, 0px)); width: var(--w, 200px); z-index: var(--fz, 1); transform: translateX(calc(-50% + var(--fx, 0px))); display: flex; flex-direction: column; align-items: center; cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .foes .foe .art{position: relative; width: 100%; height: calc(var(--w, 200px) * 1.3); filter: brightness(var(--fl, 1)) saturate(var(--fsat, 1));}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .foes .foe .art .igs-combat-art{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .foes .foe .plate{width: 150px; flex: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .foes .foe .plate .n{opacity: var(--fi, 1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .foes .foe .plate .hpbar{opacity: var(--fp, 1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .foes .foe .intent{opacity: var(--fi, 1); display: flex; align-items: center; gap: 5px; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .foes .foe:not(.front) .intent{visibility: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .intent svg{width: 14px; height: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .hpbar{position: relative; overflow: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .hpbar i{position: absolute; left: 0; top: 0; bottom: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .hand{z-index: 20;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .hand .card{position: absolute; bottom: 0; width: var(--cw, 80px); height: var(--ch, 120px); cursor: pointer; transform: var(--rest, none); transform-origin: 50% 120%; transition: transform .25s cubic-bezier(.2,.8,.2,1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .hand .card.sel{transform: translateY(var(--lift, -38px)) scale(1.06); z-index: 60 !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .hand .card .art svg{width: 100%; height: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .hand .pop{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .hand .pop.on{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .hand .card .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .hand .card .val{position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .hand .card .val em{font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) button{font-family: inherit; cursor: pointer; border: 0; background: none; color: inherit;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]){--atk: #ff5c63; --hp: #52c48e; --good: #62d3b0; --bad: #ee6a86; --blk: #8db7ee; --tdef: #6a9be0; --tskl: #a78be6; --tpow: #ee9a48; --tatk: #ee5560; --r-unc: #98a5b1; --r-rare: #5b9be0; --r-epic: #a583ec; --r-myth: #edb34c; --r-pers: #3ec6d4; --r-sign: #edb34c; --track: #2a2d31; font-family: var(--serif); color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) *{border-radius: 0 !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .sp{flex: 1;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .top{left: 12px; right: 12px; top: 10px; height: 32px; display: flex; align-items: center; gap: 10px; z-index: 30;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .top .rnd{font-size: 12px; color: var(--dim); letter-spacing: .08em;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .top .x2{font-size: 11px; color: var(--en); letter-spacing: .06em;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .top .ic svg{width: 18px; height: 18px; display: block; color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .top .ic.flee svg{color: #b4b6b8;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .top{left: 28px; right: 28px; top: 14px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .track{left: 12px; top: 56px; width: 30px; display: flex; flex-direction: column; gap: 8px; z-index: 12;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .track .who{width: 30px; height: 30px; background-color: var(--ink); box-shadow: 0 0 0 1.5px var(--atk); filter: saturate(.7) brightness(.85);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .track .who.ally{box-shadow: 0 0 0 1.5px var(--hp);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .track .who.ctrl{box-shadow: 0 0 0 2px #0a0a0b, 0 0 0 3.5px var(--bone); filter: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .track{left: 28px; top: 64px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foes{left: 0; right: 0; top: 44px; height: 624px; --base: 33px; z-index: 2;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foes .foe .art{margin-top: -20px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .foes .foe .art{margin-top: -26px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .foes{top: 40px; height: 640px; --base: 52px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foes .foe .art .igs-combat-art{filter: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe:not(.front) .plate,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe:not(.front) .intent{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .intent{margin-bottom: 6px; padding: 4px 12px; background: var(--ink); font-size: 12px; color: #c4c4c0; box-shadow: 0 2px 10px rgba(0,0,0,.6);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .intent b{font: 700 17px var(--num); color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .intent.atk b,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .intent.atk svg{color: var(--atk);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .intent.cast svg{color: #b79bf2;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foes .foe .plate{position: relative; width: 220px; display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 8px; row-gap: 6px; margin-bottom: 6px; text-shadow: 0 1px 8px #000;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .plate .nm{display: inline-flex; align-items: center; gap: 6px; font-size: 20px; letter-spacing: .18em; opacity: var(--fi, 1); white-space: nowrap;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .plate .hpn{font: 500 12px var(--num); letter-spacing: .04em; color: #b9bcbe; text-align: right; opacity: var(--fi, 1);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .plate u{text-decoration: none; display: inline-flex; align-items: center; height: 16px; font: normal 600 10px/1 var(--serif); letter-spacing: .06em; padding: 0 5px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .plate u.tier{background: var(--bone); color: #121212;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .plate u.phase{background: var(--atk); color: #130c0c;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .hpbar{width: auto; height: 4px; background: var(--track);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .hpbar i{background: var(--blood-hi);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .sts{display: inline-flex; gap: 3px; opacity: var(--fi, 1);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .sc{display: inline-flex; align-items: center; gap: 3px; height: 16px; padding: 0 5px; background: #121316; font: 500 10px/1 var(--serif); color: #bdbdb8; letter-spacing: .02em; white-space: nowrap; text-shadow: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .sc b{font: 700 11px var(--num); color: var(--bone); letter-spacing: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .sc.bad,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .sc.bad b{color: var(--bad);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .sc.good,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .sc.good b{color: var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .sc.blk,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .sc.blk b{color: var(--blk);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .sc svg{width: 11px; height: 11px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe.pickable.front .plate{background: var(--ink); box-shadow: 0 0 0 4px var(--ink), 0 0 0 5px var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead{left: 10px; top: 764px; width: 262px; height: 66px; z-index: 12;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .face{position: absolute; left: 0; top: 0; width: 56px; height: 56px; padding: 0; background-clip: padding-box;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .face .ring,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .face .hpring{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .face .aw{position: absolute; left: 0; right: 0; bottom: 0; height: 14px; line-height: 14px; background: var(--blood); color: var(--bone); font-size: 9px; letter-spacing: .08em; text-align: center; white-space: nowrap;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .face .awp{position: absolute; left: 0; right: 0; top: 0; display: flex; gap: 1px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .face .awp i{flex: 1; height: 3px; background: var(--en);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .info{position: absolute; left: 66px; right: 0; top: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .n{display: flex; align-items: baseline; font-size: 15px; letter-spacing: .16em; line-height: 18px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .n .ctl{text-decoration: none; margin-left: 7px; align-self: center; padding: 1px 4px; font: normal 600 9px/1 var(--serif); letter-spacing: .1em; background: var(--bone); color: #121212;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .n .hp{margin-left: auto; font: 500 11px var(--num); color: #b9bcbe;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .n .hp b{font-size: 15px; color: var(--bone); font-weight: 600;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .hpbar{height: 4px; margin-top: 3px; background: var(--track);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .hpbar i{background: var(--hp);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .chips{display: flex; gap: 4px; margin-top: 5px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .skill{display: flex; align-items: center; gap: 5px; margin-top: 4px; font-size: 11px; letter-spacing: .08em; line-height: 14px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .skill svg{width: 11px; height: 11px; color: var(--en);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .skill b{font: 700 11px var(--num); color: var(--en);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .ecg{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .mates{left: 282px; top: 764px; width: 100px; display: flex; flex-direction: column; gap: 2px; z-index: 12;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .mate{display: grid; grid-template-columns: 19px 1fr; column-gap: 5px; align-items: center; height: 20px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .mate .mface{grid-row: 1 / 3; position: relative; width: 19px; height: 19px; font-size: 10px; box-shadow: 0 0 0 1px #3a3d42;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .mate .mn{font-size: 10px; line-height: 11px; color: #bdbdb8; white-space: nowrap; align-self: end;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .mate .mbar{height: 2px; background: var(--track); position: relative; align-self: start; margin-top: 2px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .mate .mbar i{position: absolute; inset: 0 auto 0 0; background: var(--hp);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .mate .mb{position: absolute; right: -5px; bottom: -3px; padding: 1px 2px; text-decoration: none; font: normal 600 8px/1 var(--serif); background: #0c0c0e;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .mate .mb.bad{color: var(--bad);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .mate .mb.good{color: var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .energy{left: 8px; top: 572px; width: 64px; height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--ink2); z-index: 40;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .energy .v{display: flex; align-items: center; gap: 3px; font: 700 20px/20px var(--num); color: var(--en);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .energy .v small{font-size: 12px; color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .energy .v svg{width: 12px; height: 12px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .energy .pips{display: flex; gap: 4px; margin-top: 5px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .energy .pips i{width: 12px; height: 3px; background: var(--en);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .energy .pips i.off{background: #3a3d42;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .end{left: 306px; top: 572px; width: 76px; height: 44px; font-size: 14px; letter-spacing: .1em; text-indent: .1em; z-index: 40;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .piles{left: 80px; top: 582px; width: 218px; height: 24px; display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--dim); white-space: nowrap; z-index: 40;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .piles b{font: 600 12px var(--num); color: #c8c8c4;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .piles .mini{display: flex; align-items: center; gap: 4px; height: 28px; margin-left: auto; padding: 0 8px; background: var(--ink2); color: var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .piles .mini svg{width: 14px; height: 14px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .piles .mini em{font: normal 600 11px var(--serif); letter-spacing: .06em; color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .end b{font-weight: 400;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .tray{display: none; left: 8px; top: 478px; width: 374px; height: 84px; padding: 6px; gap: 6px; flex-wrap: wrap; align-content: flex-start; background: var(--ink); z-index: 50; box-shadow: 0 8px 24px rgba(0,0,0,.7);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).tray-on .tray{display: flex;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .ti{position: relative; flex: 1 1 0; min-width: 0; height: 40px; display: flex; align-items: center; gap: 4px; padding: 0 6px; background: var(--ink2); color: var(--bone); font-size: 12px; white-space: nowrap;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .ti svg{width: 18px; height: 18px; color: var(--good); flex: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .ti b{margin-left: auto; font: 700 12px var(--num);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .ti.off{opacity: .4;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .ti.off svg{color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .tray .td{flex: 0 0 100%; margin: 0; height: 22px; line-height: 22px; font-size: 11px; color: #c4c4c0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .tray .td b{margin-right: 8px; color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .tray .td u{text-decoration: none; margin-left: 8px; color: var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .pickbar{display: none; left: 80px; top: 576px; width: 218px; height: 36px; padding: 0 8px 0 10px; align-items: center; gap: 8px; background: #101113; z-index: 45;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).picking .pickbar{display: flex;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).picking .piles{visibility: hidden;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .pickbar .pt{font-size: 13px; letter-spacing: .1em; white-space: nowrap;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .pickbar .pt b{font: 700 15px var(--num); color: var(--acc);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .pickbar .ps{flex: 1; font-size: 10px; color: var(--dim); white-space: nowrap;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .pickbar .pok{padding: 4px 10px; background: var(--acc); color: #101010; font-size: 12px; letter-spacing: .1em;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .card.t-atk{--tc: var(--tatk);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .card.t-def{--tc: var(--tdef);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .card.t-skl{--tc: var(--tskl);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .card.t-pow{--tc: var(--tpow);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .card.r-unc{--rc: var(--r-unc);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .card.r-rare{--rc: var(--r-rare);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .card.r-epic{--rc: var(--r-epic);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .card.r-myth{--rc: var(--r-myth);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .card.r-pers{--rc: var(--r-pers);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .card.r-sign{--rc: var(--r-sign);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand{left: 8px; top: 626px; width: 374px; height: 118px; z-index: 20; --cw: 82px; --ch: 114px; --selw: 140px; --selh: 250px; --selmin: 70px; --selmax: 292px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card{position: absolute; bottom: 0; width: var(--cw); height: var(--ch); overflow: visible; background: var(--cbg); cursor: pointer; box-shadow: inset 0 0 0 1px var(--rc, var(--cedge)), 0 6px 14px rgba(0,0,0,.5); transform: var(--rest, none); transform-origin: 50% 120%; transition: transform .25s cubic-bezier(.2,.8,.2,1);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card::before{content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--tc);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .cost{position: absolute; left: 4px; top: 6px; width: 24px; height: 24px; display: grid; place-items: center; font: 600 15px/1 var(--num); font-style: normal; color: var(--en); box-shadow: inset 0 0 0 1px var(--rc, #5d6066);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .cost s{display: none; font: 500 10px var(--num); color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-epic .cost{box-shadow: inset 0 0 0 1px var(--rc), 0 0 0 2px var(--cbg), 0 0 0 3px var(--rc);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-myth .cost{box-shadow: inset 0 0 0 1px var(--rc), 0 0 0 2px var(--cbg), 0 0 0 3px var(--rc), 0 0 8px 3px rgba(237,179,76,.35);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-sign .cost{background: var(--rc); box-shadow: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-sign .cost span{color: #14110a !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .cost.cut{color: var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .cost.rise{color: var(--bad);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .cdir{display: none; position: absolute; left: 30px; top: 12px; border: 4px solid transparent;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.b-cx:has(.cost.cut) .cdir{display: block; border-top: 6px solid var(--good); border-bottom: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.b-cx:has(.cost.rise) .cdir{display: block; border-bottom: 6px solid var(--bad); border-top: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .name{position: absolute; left: 5px; top: 34px; max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 14px; color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .name sup{font: 600 9px var(--num); color: var(--en); margin-left: 1px; vertical-align: top;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .art{position: absolute; left: 50%; top: 63px; width: 34px; height: 34px; margin-left: -17px; transform: translateY(-50%); display: grid; place-items: center; color: var(--tc); opacity: .16;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .art svg{width: 100%; height: 100%;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val{position: absolute; left: 5px; bottom: 5px; display: flex; align-items: baseline; gap: 3px; white-space: nowrap;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val b{font: 700 20px/1 var(--num); color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.t-atk .val b{color: var(--atk);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val b.up{color: var(--good) !important; text-decoration: underline dotted 1px; text-underline-offset: 3px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val b.dn{color: var(--bad) !important; text-decoration: underline dotted 1px; text-underline-offset: 3px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val em{font: normal 10px var(--serif); color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .vdir{display: none; border: 4px solid transparent; border-bottom: 6px solid var(--en); border-top: 0; align-self: center;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.b-lv .vdir{display: block;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.b-tmp{outline: 1px dashed var(--en); outline-offset: -3px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.b-stk{box-shadow: inset 0 0 0 1px var(--rc, var(--cedge)), 0 -3px 0 -1px var(--cbg), 0 -4px 0 -1px #50545a, 0 -7px 0 -2px var(--cbg), 0 -8px 0 -2px #3a3d42, 0 6px 14px rgba(0,0,0,.5);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .full,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .pk{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.poor .art,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.poor .val,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.poor .name{opacity: .45;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.poor .cost{color: var(--bad);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.lock{filter: saturate(.35) brightness(.72);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel{width: var(--selw); height: var(--selh); bottom: 6px; transform: none; z-index: 60 !important; opacity: 1; filter: none; box-shadow: inset 0 0 0 1px var(--rc, #8a8d92), 0 10px 26px rgba(0,0,0,.7); outline: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .cost{left: 8px; top: 10px; width: 30px; height: 30px; font-size: 18px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .cost s{display: block; position: absolute; left: 100%; top: 0; margin-left: 3px; text-decoration: line-through;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .cdir{display: none !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .name{left: 46px; top: 14px; max-width: 86px; font-size: 16px; line-height: 20px; letter-spacing: .06em;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .art{top: 104px; width: 56px; height: 56px; margin-left: -28px; opacity: 1;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .val{left: 8px; bottom: 8px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .val b{font-size: 30px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .val em{font-size: 12px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .vdir{margin-left: 2px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .full{display: block;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .kws{position: absolute; left: 8px; top: 48px; display: flex; gap: 4px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .kg{display: grid; place-items: center; min-width: 20px; height: 20px; padding: 0 3px; font: normal 600 11px/1 var(--serif); font-style: normal; background: #0c0c0e; color: var(--bone); box-shadow: inset 0 0 0 1px #6d7076; cursor: pointer;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .kg.tp{color: var(--en); box-shadow: inset 0 0 0 1px var(--en);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .kg.sk{font-family: var(--num); color: var(--en); box-shadow: inset 0 0 0 1px var(--en); cursor: default;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .ds,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .sr,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .ex{position: absolute; left: 8px; right: 8px; margin: 0; font-size: 11px; line-height: 15px; color: #c4c4c0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .ds{top: 150px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .ds b{color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .sr{top: 168px; font-size: 10px; color: var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .sr.bad{color: var(--bad); top: 186px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .ex{top: 150px; display: none; color: var(--bone); background: var(--cbg); z-index: 3; min-height: 33px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.kopen .ex{display: block;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.kopen .ds,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.kopen .sr{visibility: hidden;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .val{z-index: 4;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).picking .hand .card.offpick{filter: brightness(.4) saturate(.3);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).picking .hand .card.chosen .pk{display: grid; place-items: center; position: absolute; right: 4px; top: 8px; width: 20px; height: 20px; background: var(--acc); color: #101010; font: 700 12px/1 var(--serif); z-index: 5;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand{left: 336px; top: 540px; width: 624px; height: 150px; --cw: 98px; --ch: 148px; --selw: 168px; --selh: 270px; --selmin: 70px; --selmax: 470px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card .cost{left: 7px; top: 8px; width: 28px; height: 28px; font-size: 17px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card .cdir{left: 38px; top: 16px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card .name{left: 8px; top: 44px; max-width: 86px; font-size: 14px; line-height: 18px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card .art{top: 90px; width: 42px; height: 42px; margin-left: -21px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card .val{left: 8px; bottom: 7px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card .val b{font-size: 24px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card .val em{font-size: 11px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card.sel .cost{width: 32px; height: 32px; font-size: 19px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card.sel .name{left: 50px; top: 16px; max-width: 108px; font-size: 18px; line-height: 22px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card.sel .kws{top: 54px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card.sel .art{top: 118px; width: 64px; height: 64px; margin-left: -32px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card.sel .ds,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card.sel .ex{top: 170px; font-size: 12px; line-height: 17px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card.sel .sr{top: 192px; font-size: 11px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card.sel .sr.bad{top: 209px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card.sel .val b{font-size: 34px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .lead{left: 28px; top: 622px; width: 260px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .mates{left: 28px; top: 516px; width: 150px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .mate{grid-template-columns: 24px 1fr; height: 30px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .mate .mface{width: 24px; height: 24px; font-size: 12px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .mate .mn{font-size: 12px; line-height: 14px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .energy{left: 336px; top: 486px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .piles{left: 408px; top: 492px; width: 300px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .tray{left: 336px; top: 392px; width: 400px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .end{left: 1092px; top: 486px; width: 160px; font-size: 16px; letter-spacing: .16em;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .pickbar{left: 410px; top: 490px; width: 300px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val em.u{display: inline-flex; width: 14px; height: 14px; color: var(--dim); align-self: center;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val em.u svg{width: 100%; height: 100%;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .val em.u{width: 18px; height: 18px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .tcx{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe:not(.front) .plate,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe:not(.front) .intent{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand{top: 626px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card:not(.sel) .name{width: 37px; max-width: 37px; white-space: normal; word-break: break-all; line-height: 13px; overflow: visible; text-overflow: clip;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card:not(.sel) .name{width: 80px; max-width: 80px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel{box-shadow: inset 0 0 0 1px var(--rc, #8a8d92), 0 14px 30px rgba(0,0,0,.8);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).tray-on .piles .itembtn{box-shadow: inset 0 0 0 1px var(--good), 0 6px 12px rgba(0,0,0,.6); background: #26382f; transform: translateY(-3px);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .ti{transition: transform .2s;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .ti.sel{box-shadow: inset 0 0 0 1px var(--good), 0 6px 12px rgba(0,0,0,.6); background: #2c3d35; transform: translateY(-3px) scale(1.04); z-index: 2;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .ti.sel svg{color: #7fe6c3;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .tray:has(.ti.sel) .ti:not(.sel):not(.off){filter: brightness(.65);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe.pickable.front .plate{background: var(--ink); box-shadow: 0 0 0 4px var(--ink), 0 0 0 5px var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe.pickable.front .art{filter: brightness(1.22) saturate(1.1);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).item-need .over{z-index: 3; background: radial-gradient(55% 40% at 50% 36%, rgba(0,0,0,0) 45%, rgba(0,0,0,.66) 100%);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).picking .hand .card.cand{outline: 1px solid var(--acc); outline-offset: -1px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).picking .hand .card.chosen{z-index: 60 !important; transform: translateY(-4px); outline: 2px solid var(--acc); outline-offset: -1px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .plate .hpbar{grid-column: 1 / 3;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .plate .sts{grid-column: 1 / 3; justify-self: start;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .foes .foe .plate{width: 260px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .face .awp{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .piles{left: 1092px; top: 546px; width: 160px; height: auto; flex-wrap: wrap; row-gap: 8px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .tray{left: 852px; top: 380px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]){--bone: #ece8de; --dim: #8d8f93; --ink: #121214; --ink2: #1a1b1d; --blood: #b3202a; --blood-hi: #d3303a; --en: #f2b93a; --acc: #f2b93a; --cbg: #17181a; --cedge: #2e3034; --serif: "Huiwen Mincho", "Noto Serif SC", serif; --num: "Cinzel", "Huiwen Mincho", serif;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .bg{filter: grayscale(.9) brightness(.4) contrast(1.25); background-position: center 35%;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .shade{background: linear-gradient(to bottom, #0b0b0c 0, rgba(11,11,12,.5) 60px, rgba(11,11,12,0) 130px), linear-gradient(to top, #0c0c0d 0, rgba(12,12,13,.94) 120px, rgba(12,12,13,0) 300px), radial-gradient(120% 80% at 50% 38%, rgba(0,0,0,0) 40%, rgba(0,0,0,.6) 100%);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .shade{background: linear-gradient(to bottom, #0b0b0c 0, rgba(11,11,12,0) 100px), linear-gradient(to top, #0c0c0d 0, rgba(12,12,13,.9) 80px, rgba(12,12,13,0) 240px), radial-gradient(90% 90% at 50% 40%, rgba(0,0,0,0) 45%, rgba(0,0,0,.62) 100%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .tint{inset: 0; background: #2f5a45; mix-blend-mode: color; opacity: .42;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .grain{inset: 0; opacity: .6;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .scan{inset: 0; background: repeating-linear-gradient(to bottom, rgba(0,0,0,.28) 0 1px, rgba(0,0,0,0) 1px 3px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .vf{width: 16px; height: 16px; border: 0 solid #6d6d73;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .vf.a{left: 8px; top: 48px; border-width: 1px 0 0 1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .vf.b{right: 8px; top: 48px; border-width: 1px 1px 0 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .vf.a{left: 12px; top: 56px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .vf.b{right: 12px; top: 56px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .rec{left: 52px; top: 48px; display: flex; align-items: center; gap: 6px; font: 600 10px var(--num); letter-spacing: .1em; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .rec i{width: 6px; height: 6px; background: var(--blood-hi);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .rec{left: auto; right: 28px; top: 48px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .top .enc{font-size: 18px; letter-spacing: .14em; line-height: 20px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foes .foe.front .art .igs-combat-art{filter: drop-shadow(-3px 0 0 rgba(179,32,42,.6)) drop-shadow(3px 0 0 rgba(205,230,255,.34));}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foes .foe.target .art .igs-combat-art{filter: drop-shadow(-3px 0 0 rgba(179,32,42,.75)) drop-shadow(3px 0 0 rgba(205,230,255,.4)) drop-shadow(0 0 14px rgba(211,48,58,.55));}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand{--lift: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .lead .face{border: 2px solid var(--blood-hi);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .energy{background: var(--ink2);}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-a"],.igs-cx-ghost[data-cx="dark-a"]) .over{background: radial-gradient(130% 100% at 50% 50%, rgba(0,0,0,0) 62%, rgba(0,0,0,.5) 100%); z-index: 90;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card{background: #131416; box-shadow: inset 0 0 0 1px #2e3034, 0 6px 14px rgba(0,0,0,.55);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card::before{height: 2px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-unc .cost,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-rare .cost{box-shadow: inset 0 0 0 1px var(--rc);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .cost{left: 12px; top: 12px; box-shadow: none; background: #0b0b0c; color: var(--en); z-index: 3; width: 22px; height: 22px; font-size: 14px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .name{left: 6px; top: 42px; z-index: 3; text-shadow: 1px 0 rgba(179,32,42,.8), -1px 0 rgba(205,230,255,.4);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .art{opacity: .2;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val{z-index: 3;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val b{text-shadow: -1.5px 0 rgba(179,32,42,.85), 1.5px 0 rgba(150,210,255,.45);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val em.u{color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .full,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .cost,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .name,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .art{z-index: 3;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .cost{left: 14px; top: 14px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .name{left: 54px; top: 18px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .kws,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .ds{z-index: 3;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .end{background: var(--blood); color: var(--bone); box-shadow: inset 0 -3px 0 #861820;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe .intent{box-shadow: none; background: #1b1b1d;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .tray,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .pickbar{box-shadow: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .tray{background: #131416;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .tray::before{content: "ITEM 00:14:27"; position: absolute; right: 8px; bottom: 6px; font: 600 9px var(--num); letter-spacing: .1em; color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .tray .td{padding-right: 104px; box-sizing: border-box;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel{background: #1a1b1e; box-shadow: inset 0 0 0 1px var(--rc, #8a8d92), 0 14px 30px rgba(0,0,0,.8), 0 0 26px 2px rgba(211,48,58,.28);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .name,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .val b{text-shadow: -2px 0 rgba(179,32,42,.9), 2px 0 rgba(150,210,255,.55);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).tray-on .piles .itembtn{background: #20352c;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .foe.pickable.front .art .igs-combat-art{filter: drop-shadow(-2px 0 0 rgba(179,32,42,.75)) drop-shadow(2px 0 0 rgba(205,230,255,.4)) drop-shadow(0 0 12px rgba(211,48,58,.45));}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .name sup{text-shadow: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]){--c-frame: #34373c; --c-frame-hi: #8a8d92; --c-atk: #c2444c; --c-skl: #6aae92; --c-pow: #9888c4;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .card.t-atk{--tc: var(--c-atk);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .card.t-def,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .card.t-skl{--tc: var(--c-skl);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .card.t-pow{--tc: var(--c-pow);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card{background: var(--cbg); box-shadow: inset 0 0 0 1px var(--c-frame), 0 6px 14px rgba(0,0,0,.55); outline: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card::before,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card::after{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.b-stk{box-shadow: inset 0 0 0 1px var(--c-frame), 0 6px 14px rgba(0,0,0,.55);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.b-tmp{outline: 1px dashed var(--dim); outline-offset: -4px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .cdir,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .vdir,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val em.u{display: none !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card:not(.sel) .art{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .cost{left: 6px; top: 6px; width: 22px; height: 22px; background: none; color: var(--bone); font-size: 13px; box-shadow: inset 0 0 0 1px #5d6066;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .cost span,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-sign .cost span{color: var(--bone) !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .cost.cut,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .cost.rise,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.poor .cost{color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-unc .cost,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-pers .cost,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-sign .cost{background: none; box-shadow: inset 0 0 0 1px var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-rare .cost{box-shadow: inset 0 0 0 1px var(--bone), inset 0 0 0 2px var(--cbg), inset 0 0 0 3px var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-epic .cost{box-shadow: inset 0 0 0 2px var(--bone), inset 0 0 0 3px var(--cbg), inset 0 0 0 4px var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-myth .cost{box-shadow: inset 0 0 0 2px var(--bone), inset 0 0 0 3px var(--cbg), inset 0 0 0 4px var(--bone), 0 0 6px 1px rgba(236,232,222,.3);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-pers,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-sign{background: linear-gradient(225deg, var(--bone) 0 7px, var(--cbg) 7px);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card:not(.sel) .name{left: 32px; top: 7px; width: auto; max-width: none; writing-mode: vertical-rl; white-space: nowrap; font-size: 12px; line-height: 14px; letter-spacing: .08em; color: var(--bone); text-shadow: none; padding: 0; border: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .name sup{color: var(--en); text-shadow: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card:not(.sel) .name sup{display: inline-block; writing-mode: horizontal-tb; margin: 3px 0 0; line-height: 1; vertical-align: baseline;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val{left: 7px; bottom: 21px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val b,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val b.up,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .val b.dn{color: var(--tc) !important; text-decoration: none; text-shadow: none; font-size: 22px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .ut{position: absolute; left: 7px; bottom: 7px; font: normal 10px/1 var(--serif); color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .stk{position: absolute; right: 6px; bottom: 7px; font: normal 600 10px/1 var(--num); color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .stk{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.poor .name,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.poor .val,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.poor .ut{opacity: 1;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.poor:not(.sel){filter: saturate(.3) brightness(.62);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel{background: var(--cbg); box-shadow: inset 0 0 0 1px var(--c-frame-hi), 0 14px 30px rgba(0,0,0,.8);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel.r-pers,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel.r-sign{background: linear-gradient(225deg, var(--bone) 0 9px, var(--cbg) 9px);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .cost{left: 9px; top: 9px; width: 28px; height: 28px; font-size: 17px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .name{left: 46px; top: 13px; text-shadow: none; color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .val{bottom: 26px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .val b,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .name{text-shadow: none !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .val b{font-size: 30px; color: var(--tc) !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .ut{left: 9px; bottom: 10px; font-size: 11px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .art{color: var(--tc); opacity: .9;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .kg,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .kg.tp,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .kg.sk{height: 18px; padding: 0 4px; font-size: 10px; background: none; color: var(--dim); box-shadow: inset 0 0 0 1px #4a4d52;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .sr{color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .sr.bad{color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card:not(.sel) .cost{left: 8px; top: 8px; width: 26px; height: 26px; font-size: 16px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card:not(.sel) .name{left: 40px; top: 9px; width: auto; max-width: none; font-size: 15px; line-height: 17px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card .val{left: 9px; bottom: 26px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card .val b{font-size: 28px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card .ut{left: 9px; bottom: 9px; font-size: 12px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card .stk{right: 8px; bottom: 9px; font-size: 12px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card.sel .val{bottom: 30px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card.sel .val b{font-size: 34px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand:has(.card.sel){z-index: 45;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .cost,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card[class*=" r-"] .cost{background: none; box-shadow: inset 0 0 0 1px #5d6066;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-pers,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-sign,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel.r-pers,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel.r-sign{background: var(--cbg);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card .rtab{position: absolute; left: 32px; bottom: 100%; z-index: 3; width: 16px; height: var(--th, 12px); padding-top: 2px; box-sizing: border-box; background: var(--bone); color: #121214; font: normal 700 9px/1 var(--serif); text-align: center;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-unc .rtab{--th: 12px; background: #8d8f93;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-rare .rtab{--th: 14px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-epic .rtab{--th: 16px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-myth .rtab{--th: 18px; box-shadow: 0 0 6px 1px rgba(236,232,222,.3);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-pers .rtab,#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.r-sign .rtab{--th: 14px; background: #121214; color: var(--bone); box-shadow: inset 0 0 0 1px var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]) .hand .card.sel .rtab{left: 46px; width: 18px; font-size: 10px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-a"]).land .hand .card:not(.sel) .rtab{left: 40px; width: 18px; font-size: 10px;}
`;
