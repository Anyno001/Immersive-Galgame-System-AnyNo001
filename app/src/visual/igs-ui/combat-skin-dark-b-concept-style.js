// 由 gal/战斗界面设计稿/落盘/gen-skin-css.mjs 从概念稿 dark/common.css、dark/grid.css、dark/B.css、dark/minimal.css 生成，不要手改；改设计稿后重新生成。
// 选择器作用域见生成脚本说明，规则内容与设计稿一致（本地图片地址换成 none）。
export const COMBAT_SKIN_DARK_B_CONCEPT_CSS = `
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) *{box-sizing: border-box; margin: 0; padding: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]){position: relative; overflow: hidden; background: #0b0b0c; user-select: none; -webkit-user-select: none; --k: 1;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]):not(.land){width: 390px; height: 844px; border-radius: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land{width: 1280px; height: 720px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) > *{position: absolute;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .deco > *{position: absolute;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .bg,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .shade,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .deco,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .over{inset: 0; pointer-events: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .bg{background: none center 30% / cover no-repeat;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) svg{fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .who{position: relative; display: block; overflow: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .who .igs-combat-art{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .mface{display: grid; place-items: center; background-color: #1c1c1e; color: #d9d6cf;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .foes{pointer-events: auto;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .foes .foe{position: absolute; left: 50%; bottom: calc(var(--base, 0px) + var(--fb, 0px)); width: var(--w, 200px); z-index: var(--fz, 1); transform: translateX(calc(-50% + var(--fx, 0px))); display: flex; flex-direction: column; align-items: center; cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .foes .foe .art{position: relative; width: 100%; height: calc(var(--w, 200px) * 1.3); filter: brightness(var(--fl, 1)) saturate(var(--fsat, 1));}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .foes .foe .art .igs-combat-art{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .foes .foe .plate{width: 150px; flex: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .foes .foe .plate .n{opacity: var(--fi, 1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .foes .foe .plate .hpbar{opacity: var(--fp, 1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .foes .foe .intent{opacity: var(--fi, 1); display: flex; align-items: center; gap: 5px; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .foes .foe:not(.front) .intent{visibility: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .intent svg{width: 14px; height: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .hpbar{position: relative; overflow: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .hpbar i{position: absolute; left: 0; top: 0; bottom: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .hand{z-index: 20;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .hand .card{position: absolute; bottom: 0; width: var(--cw, 80px); height: var(--ch, 120px); cursor: pointer; transform: var(--rest, none); transform-origin: 50% 120%; transition: transform .25s cubic-bezier(.2,.8,.2,1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .hand .card.sel{transform: translateY(var(--lift, -38px)) scale(1.06); z-index: 60 !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .hand .card .art svg{width: 100%; height: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .hand .pop{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .hand .pop.on{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .hand .card .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .hand .card .val{position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .hand .card .val em{font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) button{font-family: inherit; cursor: pointer; border: 0; background: none; color: inherit;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]){--atk: #ff5c63; --hp: #52c48e; --good: #62d3b0; --bad: #ee6a86; --blk: #8db7ee; --tdef: #6a9be0; --tskl: #a78be6; --tpow: #ee9a48; --tatk: #ee5560; --r-unc: #98a5b1; --r-rare: #5b9be0; --r-epic: #a583ec; --r-myth: #edb34c; --r-pers: #3ec6d4; --r-sign: #edb34c; --track: #2a2d31; font-family: var(--serif); color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) *{border-radius: 0 !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .sp{flex: 1;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .top{left: 12px; right: 12px; top: 10px; height: 32px; display: flex; align-items: center; gap: 10px; z-index: 30;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .top .rnd{font-size: 12px; color: var(--dim); letter-spacing: .08em;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .top .x2{font-size: 11px; color: var(--en); letter-spacing: .06em;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .top .ic svg{width: 18px; height: 18px; display: block; color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .top .ic.flee svg{color: #b4b6b8;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .top{left: 28px; right: 28px; top: 14px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .track{left: 12px; top: 56px; width: 30px; display: flex; flex-direction: column; gap: 8px; z-index: 12;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .track .who{width: 30px; height: 30px; background-color: var(--ink); box-shadow: 0 0 0 1.5px var(--atk); filter: saturate(.7) brightness(.85);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .track .who.ally{box-shadow: 0 0 0 1.5px var(--hp);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .track .who.ctrl{box-shadow: 0 0 0 2px #0a0a0b, 0 0 0 3.5px var(--bone); filter: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .track{left: 28px; top: 64px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foes{left: 0; right: 0; top: 44px; height: 624px; --base: 33px; z-index: 2;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foes .foe .art{margin-top: -20px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .foes .foe .art{margin-top: -26px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .foes{top: 40px; height: 640px; --base: 52px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foes .foe .art .igs-combat-art{filter: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe:not(.front) .plate,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe:not(.front) .intent{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .intent{margin-bottom: 6px; padding: 4px 12px; background: var(--ink); font-size: 12px; color: #c4c4c0; box-shadow: 0 2px 10px rgba(0,0,0,.6);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .intent b{font: 700 17px var(--num); color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .intent.atk b,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .intent.atk svg{color: var(--atk);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .intent.cast svg{color: #b79bf2;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foes .foe .plate{position: relative; width: 220px; display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 8px; row-gap: 6px; margin-bottom: 6px; text-shadow: 0 1px 8px #000;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .plate .nm{display: inline-flex; align-items: center; gap: 6px; font-size: 20px; letter-spacing: .18em; opacity: var(--fi, 1); white-space: nowrap;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .plate .hpn{font: 500 12px var(--num); letter-spacing: .04em; color: #b9bcbe; text-align: right; opacity: var(--fi, 1);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .plate u{text-decoration: none; display: inline-flex; align-items: center; height: 16px; font: normal 600 10px/1 var(--serif); letter-spacing: .06em; padding: 0 5px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .plate u.tier{background: var(--bone); color: #121212;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .plate u.phase{background: var(--atk); color: #130c0c;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .hpbar{width: auto; height: 4px; background: var(--track);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .hpbar i{background: var(--blood-hi);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .sts{display: inline-flex; gap: 3px; opacity: var(--fi, 1);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .sc{display: inline-flex; align-items: center; gap: 3px; height: 16px; padding: 0 5px; background: #121316; font: 500 10px/1 var(--serif); color: #bdbdb8; letter-spacing: .02em; white-space: nowrap; text-shadow: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .sc b{font: 700 11px var(--num); color: var(--bone); letter-spacing: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .sc.bad,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .sc.bad b{color: var(--bad);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .sc.good,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .sc.good b{color: var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .sc.blk,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .sc.blk b{color: var(--blk);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .sc svg{width: 11px; height: 11px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe.pickable.front .plate{background: var(--ink); box-shadow: 0 0 0 4px var(--ink), 0 0 0 5px var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead{left: 10px; top: 764px; width: 262px; height: 66px; z-index: 12;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .face{position: absolute; left: 0; top: 0; width: 56px; height: 56px; padding: 0; background-clip: padding-box;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .face .ring,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .face .hpring{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .face .aw{position: absolute; left: 0; right: 0; bottom: 0; height: 14px; line-height: 14px; background: var(--blood); color: var(--bone); font-size: 9px; letter-spacing: .08em; text-align: center; white-space: nowrap;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .face .awp{position: absolute; left: 0; right: 0; top: 0; display: flex; gap: 1px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .face .awp i{flex: 1; height: 3px; background: var(--en);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .info{position: absolute; left: 66px; right: 0; top: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .n{display: flex; align-items: baseline; font-size: 15px; letter-spacing: .16em; line-height: 18px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .n .ctl{text-decoration: none; margin-left: 7px; align-self: center; padding: 1px 4px; font: normal 600 9px/1 var(--serif); letter-spacing: .1em; background: var(--bone); color: #121212;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .n .hp{margin-left: auto; font: 500 11px var(--num); color: #b9bcbe;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .n .hp b{font-size: 15px; color: var(--bone); font-weight: 600;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .hpbar{height: 4px; margin-top: 3px; background: var(--track);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .hpbar i{background: var(--hp);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .chips{display: flex; gap: 4px; margin-top: 5px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .skill{display: flex; align-items: center; gap: 5px; margin-top: 4px; font-size: 11px; letter-spacing: .08em; line-height: 14px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .skill svg{width: 11px; height: 11px; color: var(--en);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .skill b{font: 700 11px var(--num); color: var(--en);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .ecg{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .mates{left: 282px; top: 764px; width: 100px; display: flex; flex-direction: column; gap: 2px; z-index: 12;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .mate{display: grid; grid-template-columns: 19px 1fr; column-gap: 5px; align-items: center; height: 20px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .mate .mface{grid-row: 1 / 3; position: relative; width: 19px; height: 19px; font-size: 10px; box-shadow: 0 0 0 1px #3a3d42;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .mate .mn{font-size: 10px; line-height: 11px; color: #bdbdb8; white-space: nowrap; align-self: end;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .mate .mbar{height: 2px; background: var(--track); position: relative; align-self: start; margin-top: 2px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .mate .mbar i{position: absolute; inset: 0 auto 0 0; background: var(--hp);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .mate .mb{position: absolute; right: -5px; bottom: -3px; padding: 1px 2px; text-decoration: none; font: normal 600 8px/1 var(--serif); background: #0c0c0e;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .mate .mb.bad{color: var(--bad);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .mate .mb.good{color: var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .energy{left: 8px; top: 572px; width: 64px; height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--ink2); z-index: 40;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .energy .v{display: flex; align-items: center; gap: 3px; font: 700 20px/20px var(--num); color: var(--en);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .energy .v small{font-size: 12px; color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .energy .v svg{width: 12px; height: 12px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .energy .pips{display: flex; gap: 4px; margin-top: 5px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .energy .pips i{width: 12px; height: 3px; background: var(--en);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .energy .pips i.off{background: #3a3d42;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .end{left: 306px; top: 572px; width: 76px; height: 44px; font-size: 14px; letter-spacing: .1em; text-indent: .1em; z-index: 40;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .piles{left: 80px; top: 582px; width: 218px; height: 24px; display: flex; align-items: center; gap: 10px; font-size: 11px; color: var(--dim); white-space: nowrap; z-index: 40;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .piles b{font: 600 12px var(--num); color: #c8c8c4;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .piles .mini{display: flex; align-items: center; gap: 4px; height: 28px; margin-left: auto; padding: 0 8px; background: var(--ink2); color: var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .piles .mini svg{width: 14px; height: 14px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .piles .mini em{font: normal 600 11px var(--serif); letter-spacing: .06em; color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .end b{font-weight: 400;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .tray{display: none; left: 8px; top: 478px; width: 374px; height: 84px; padding: 6px; gap: 6px; flex-wrap: wrap; align-content: flex-start; background: var(--ink); z-index: 50; box-shadow: 0 8px 24px rgba(0,0,0,.7);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).tray-on .tray{display: flex;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .ti{position: relative; flex: 1 1 0; min-width: 0; height: 40px; display: flex; align-items: center; gap: 4px; padding: 0 6px; background: var(--ink2); color: var(--bone); font-size: 12px; white-space: nowrap;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .ti svg{width: 18px; height: 18px; color: var(--good); flex: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .ti b{margin-left: auto; font: 700 12px var(--num);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .ti.off{opacity: .4;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .ti.off svg{color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .tray .td{flex: 0 0 100%; margin: 0; height: 22px; line-height: 22px; font-size: 11px; color: #c4c4c0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .tray .td b{margin-right: 8px; color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .tray .td u{text-decoration: none; margin-left: 8px; color: var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .pickbar{display: none; left: 80px; top: 576px; width: 218px; height: 36px; padding: 0 8px 0 10px; align-items: center; gap: 8px; background: #101113; z-index: 45;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).picking .pickbar{display: flex;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).picking .piles{visibility: hidden;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .pickbar .pt{font-size: 13px; letter-spacing: .1em; white-space: nowrap;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .pickbar .pt b{font: 700 15px var(--num); color: var(--acc);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .pickbar .ps{flex: 1; font-size: 10px; color: var(--dim); white-space: nowrap;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .pickbar .pok{padding: 4px 10px; background: var(--acc); color: #101010; font-size: 12px; letter-spacing: .1em;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .card.t-atk{--tc: var(--tatk);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .card.t-def{--tc: var(--tdef);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .card.t-skl{--tc: var(--tskl);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .card.t-pow{--tc: var(--tpow);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .card.r-unc{--rc: var(--r-unc);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .card.r-rare{--rc: var(--r-rare);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .card.r-epic{--rc: var(--r-epic);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .card.r-myth{--rc: var(--r-myth);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .card.r-pers{--rc: var(--r-pers);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .card.r-sign{--rc: var(--r-sign);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand{left: 8px; top: 626px; width: 374px; height: 118px; z-index: 20; --cw: 82px; --ch: 114px; --selw: 140px; --selh: 250px; --selmin: 70px; --selmax: 292px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card{position: absolute; bottom: 0; width: var(--cw); height: var(--ch); overflow: visible; background: var(--cbg); cursor: pointer; box-shadow: inset 0 0 0 1px var(--rc, var(--cedge)), 0 6px 14px rgba(0,0,0,.5); transform: var(--rest, none); transform-origin: 50% 120%; transition: transform .25s cubic-bezier(.2,.8,.2,1);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card::before{content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--tc);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .cost{position: absolute; left: 4px; top: 6px; width: 24px; height: 24px; display: grid; place-items: center; font: 600 15px/1 var(--num); font-style: normal; color: var(--en); box-shadow: inset 0 0 0 1px var(--rc, #5d6066);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .cost s{display: none; font: 500 10px var(--num); color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-epic .cost{box-shadow: inset 0 0 0 1px var(--rc), 0 0 0 2px var(--cbg), 0 0 0 3px var(--rc);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-myth .cost{box-shadow: inset 0 0 0 1px var(--rc), 0 0 0 2px var(--cbg), 0 0 0 3px var(--rc), 0 0 8px 3px rgba(237,179,76,.35);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-sign .cost{background: var(--rc); box-shadow: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-sign .cost span{color: #14110a !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .cost.cut{color: var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .cost.rise{color: var(--bad);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .cdir{display: none; position: absolute; left: 30px; top: 12px; border: 4px solid transparent;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.b-cx:has(.cost.cut) .cdir{display: block; border-top: 6px solid var(--good); border-bottom: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.b-cx:has(.cost.rise) .cdir{display: block; border-bottom: 6px solid var(--bad); border-top: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .name{position: absolute; left: 5px; top: 34px; max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 14px; color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .name sup{font: 600 9px var(--num); color: var(--en); margin-left: 1px; vertical-align: top;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .art{position: absolute; left: 50%; top: 63px; width: 34px; height: 34px; margin-left: -17px; transform: translateY(-50%); display: grid; place-items: center; color: var(--tc); opacity: .16;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .art svg{width: 100%; height: 100%;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .val{position: absolute; left: 5px; bottom: 5px; display: flex; align-items: baseline; gap: 3px; white-space: nowrap;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .val b{font: 700 20px/1 var(--num); color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.t-atk .val b{color: var(--atk);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .val b.up{color: var(--good) !important; text-decoration: underline dotted 1px; text-underline-offset: 3px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .val b.dn{color: var(--bad) !important; text-decoration: underline dotted 1px; text-underline-offset: 3px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .val em{font: normal 10px var(--serif); color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .vdir{display: none; border: 4px solid transparent; border-bottom: 6px solid var(--en); border-top: 0; align-self: center;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.b-lv .vdir{display: block;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.b-tmp{outline: 1px dashed var(--en); outline-offset: -3px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.b-stk{box-shadow: inset 0 0 0 1px var(--rc, var(--cedge)), 0 -3px 0 -1px var(--cbg), 0 -4px 0 -1px #50545a, 0 -7px 0 -2px var(--cbg), 0 -8px 0 -2px #3a3d42, 0 6px 14px rgba(0,0,0,.5);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .full,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .pk{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.poor .art,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.poor .val,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.poor .name{opacity: .45;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.poor .cost{color: var(--bad);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.lock{filter: saturate(.35) brightness(.72);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel{width: var(--selw); height: var(--selh); bottom: 6px; transform: none; z-index: 60 !important; opacity: 1; filter: none; box-shadow: inset 0 0 0 1px var(--rc, #8a8d92), 0 10px 26px rgba(0,0,0,.7); outline: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .cost{left: 8px; top: 10px; width: 30px; height: 30px; font-size: 18px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .cost s{display: block; position: absolute; left: 100%; top: 0; margin-left: 3px; text-decoration: line-through;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .cdir{display: none !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .name{left: 46px; top: 14px; max-width: 86px; font-size: 16px; line-height: 20px; letter-spacing: .06em;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .art{top: 104px; width: 56px; height: 56px; margin-left: -28px; opacity: 1;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .val{left: 8px; bottom: 8px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .val b{font-size: 30px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .val em{font-size: 12px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .vdir{margin-left: 2px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .full{display: block;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .kws{position: absolute; left: 8px; top: 48px; display: flex; gap: 4px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .kg{display: grid; place-items: center; min-width: 20px; height: 20px; padding: 0 3px; font: normal 600 11px/1 var(--serif); font-style: normal; background: #0c0c0e; color: var(--bone); box-shadow: inset 0 0 0 1px #6d7076; cursor: pointer;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .kg.tp{color: var(--en); box-shadow: inset 0 0 0 1px var(--en);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .kg.sk{font-family: var(--num); color: var(--en); box-shadow: inset 0 0 0 1px var(--en); cursor: default;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .ds,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .sr,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .ex{position: absolute; left: 8px; right: 8px; margin: 0; font-size: 11px; line-height: 15px; color: #c4c4c0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .ds{top: 150px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .ds b{color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .sr{top: 168px; font-size: 10px; color: var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .sr.bad{color: var(--bad); top: 186px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .ex{top: 150px; display: none; color: var(--bone); background: var(--cbg); z-index: 3; min-height: 33px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.kopen .ex{display: block;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.kopen .ds,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.kopen .sr{visibility: hidden;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .val{z-index: 4;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).picking .hand .card.offpick{filter: brightness(.4) saturate(.3);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).picking .hand .card.chosen .pk{display: grid; place-items: center; position: absolute; right: 4px; top: 8px; width: 20px; height: 20px; background: var(--acc); color: #101010; font: 700 12px/1 var(--serif); z-index: 5;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand{left: 336px; top: 540px; width: 624px; height: 150px; --cw: 98px; --ch: 148px; --selw: 168px; --selh: 270px; --selmin: 70px; --selmax: 470px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card .cost{left: 7px; top: 8px; width: 28px; height: 28px; font-size: 17px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card .cdir{left: 38px; top: 16px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card .name{left: 8px; top: 44px; max-width: 86px; font-size: 14px; line-height: 18px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card .art{top: 90px; width: 42px; height: 42px; margin-left: -21px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card .val{left: 8px; bottom: 7px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card .val b{font-size: 24px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card .val em{font-size: 11px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card.sel .cost{width: 32px; height: 32px; font-size: 19px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card.sel .name{left: 50px; top: 16px; max-width: 108px; font-size: 18px; line-height: 22px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card.sel .kws{top: 54px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card.sel .art{top: 118px; width: 64px; height: 64px; margin-left: -32px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card.sel .ds,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card.sel .ex{top: 170px; font-size: 12px; line-height: 17px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card.sel .sr{top: 192px; font-size: 11px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card.sel .sr.bad{top: 209px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card.sel .val b{font-size: 34px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .lead{left: 28px; top: 622px; width: 260px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .mates{left: 28px; top: 516px; width: 150px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .mate{grid-template-columns: 24px 1fr; height: 30px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .mate .mface{width: 24px; height: 24px; font-size: 12px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .mate .mn{font-size: 12px; line-height: 14px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .energy{left: 336px; top: 486px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .piles{left: 408px; top: 492px; width: 300px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .tray{left: 336px; top: 392px; width: 400px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .end{left: 1092px; top: 486px; width: 160px; font-size: 16px; letter-spacing: .16em;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .pickbar{left: 410px; top: 490px; width: 300px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .val em.u{display: inline-flex; width: 14px; height: 14px; color: var(--dim); align-self: center;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .val em.u svg{width: 100%; height: 100%;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .val em.u{width: 18px; height: 18px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .tcx{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe:not(.front) .plate,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe:not(.front) .intent{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand{top: 626px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card:not(.sel) .name{width: 37px; max-width: 37px; white-space: normal; word-break: break-all; line-height: 13px; overflow: visible; text-overflow: clip;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card:not(.sel) .name{width: 80px; max-width: 80px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel{box-shadow: inset 0 0 0 1px var(--rc, #8a8d92), 0 14px 30px rgba(0,0,0,.8);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).tray-on .piles .itembtn{box-shadow: inset 0 0 0 1px var(--good), 0 6px 12px rgba(0,0,0,.6); background: #26382f; transform: translateY(-3px);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .ti{transition: transform .2s;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .ti.sel{box-shadow: inset 0 0 0 1px var(--good), 0 6px 12px rgba(0,0,0,.6); background: #2c3d35; transform: translateY(-3px) scale(1.04); z-index: 2;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .ti.sel svg{color: #7fe6c3;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .tray:has(.ti.sel) .ti:not(.sel):not(.off){filter: brightness(.65);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe.pickable.front .plate{background: var(--ink); box-shadow: 0 0 0 4px var(--ink), 0 0 0 5px var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe.pickable.front .art{filter: brightness(1.22) saturate(1.1);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).item-need .over{z-index: 3; background: radial-gradient(55% 40% at 50% 36%, rgba(0,0,0,0) 45%, rgba(0,0,0,.66) 100%);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).picking .hand .card.cand{outline: 1px solid var(--acc); outline-offset: -1px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).picking .hand .card.chosen{z-index: 60 !important; transform: translateY(-4px); outline: 2px solid var(--acc); outline-offset: -1px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .plate .hpbar{grid-column: 1 / 3;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .plate .sts{grid-column: 1 / 3; justify-self: start;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .foes .foe .plate{width: 260px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .face .awp{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .piles{left: 1092px; top: 546px; width: 160px; height: auto; flex-wrap: wrap; row-gap: 8px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .tray{left: 852px; top: 380px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]){--bone: #dce8ee; --dim: #7c8a92; --ink: #101214; --ink2: #16191b; --blood: #a8222c; --blood-hi: #cf2f3a; --en: #58c7ea; --acc: #58c7ea; --cbg: #101214; --cedge: #3d454b; --ice: #dce8ee; --ice2: #9fb0b9; --serif: "Huiwen Mincho", "Noto Serif SC", serif; --num: "Cinzel", "Huiwen Mincho", serif;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .bg{filter: grayscale(1) brightness(.3) contrast(1.15); background-position: center 35%;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .shade{background: linear-gradient(to bottom, #0b0c0d 0, rgba(11,12,13,0) 110px), linear-gradient(to top, #0b0c0d 0, rgba(11,12,13,.94) 120px, rgba(11,12,13,0) 300px), radial-gradient(110% 80% at 50% 40%, rgba(0,0,0,0) 30%, rgba(0,0,0,.72) 100%);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .shade{background: linear-gradient(to bottom, #0b0c0d 0, rgba(11,12,13,0) 90px), linear-gradient(to top, #0b0c0d 0, rgba(11,12,13,.9) 80px, rgba(11,12,13,0) 240px), radial-gradient(80% 90% at 50% 42%, rgba(0,0,0,0) 28%, rgba(0,0,0,.74) 100%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .tint{inset: 0; background: #1d4f63; mix-blend-mode: color; opacity: .48;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .cone{left: 50%; top: 0; width: 470px; height: 700px; transform: translateX(-50%); clip-path: polygon(47% 0, 53% 0, 100% 100%, 0 100%); background: linear-gradient(to bottom, rgba(220,232,238,.5), rgba(220,232,238,.12) 70%, rgba(220,232,238,.04)); -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,0), #000 38%, #000 62%, rgba(0,0,0,0)); mask-image: linear-gradient(to right, rgba(0,0,0,0), #000 38%, #000 62%, rgba(0,0,0,0));}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .cone{width: 800px; height: 640px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .lamp{left: 50%; top: 0; width: 44px; height: 3px; transform: translateX(-50%); background: var(--ice);}
#igs-overlay :where(.igs-cx-canvas[data-cx="dark-b"],.igs-cx-ghost[data-cx="dark-b"]) .ring3{left: 50%; width: 360px; height: 60px; margin-left: -180px; border-radius: 50%; box-shadow: 0 0 0 1px rgba(220,232,238,.5), 0 0 28px 2px rgba(220,232,238,.18), inset 0 0 28px rgba(220,232,238,.16);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]):not(.land) .ring3{top: 580px; height: 44px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .ring3{top: 580px; width: 520px; margin-left: -260px; height: 70px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .ring3{border-radius: 50% !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .top .enc{position: absolute; left: 50%; top: 14px; transform: translateX(-50%); font-size: 16px; letter-spacing: .3em; white-space: nowrap; text-indent: .3em;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .top .rnd{position: absolute; left: 4px; top: 8px; font: 600 11px var(--num); letter-spacing: .1em; color: var(--ice2);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .top .flee,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .top .x2{position: relative; z-index: 1;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .top .enc{top: 8px; font-size: 18px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .top .rnd{left: auto; right: 150px; top: 9px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .track{top: 64px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]):not(.land) .track{top: 58px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foes .foe.front .art .igs-combat-art{filter: drop-shadow(0 0 1px rgba(220,232,238,.9)) drop-shadow(0 0 16px rgba(220,232,238,.18));}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foes .foe.target .art .igs-combat-art{filter: drop-shadow(0 0 1px rgba(220,232,238,.9)) drop-shadow(0 0 12px rgba(207,47,58,.6));}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe .plate .n{letter-spacing: .2em;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .face{box-shadow: 0 0 0 1px var(--ice), 0 0 0 4px #0c0d0e, 0 0 0 5px var(--blood-hi);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .face .aw{background: var(--ice); color: var(--ink);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .hpbar{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .ecg{display: block; height: 11px; margin-top: 2px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .ecg svg{width: 100%; height: 100%; display: block; overflow: hidden;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .ecg path{fill: none; stroke-width: 1.3; vector-effect: non-scaling-stroke; stroke-linejoin: round;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .info{display: flex; flex-direction: column;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .ecg{order: 1; height: 9px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .chips{order: 2; margin-top: 3px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead .skill{order: 3; margin-top: 2px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .lead{top: 764px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .lead{top: 618px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .energy{box-shadow: inset 0 0 0 1px var(--cedge); background: var(--ink2);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card{background: #0f1214; box-shadow: inset 0 0 0 1px #3d454b, 0 6px 14px rgba(0,0,0,.55);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card::before{height: 1px; background: var(--rc, #9fb0b9);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .cost{left: 7px; top: 7px; background: #0b0d0e; color: var(--en); box-shadow: inset 0 0 0 1px #9fb0b9; z-index: 3;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .cost.cut{color: var(--good);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .name{top: 38px; z-index: 3; padding-top: 4px; border-top: 1px solid #3d454b; letter-spacing: .06em;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .art{opacity: 1; color: var(--tc); width: 32px; height: 32px; margin-left: -17px; z-index: 1;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .art svg{width: 58%; height: 58%; margin: auto; grid-area: 1/1;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .val b{color: var(--ice);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.t-atk .val b{color: #ff6b73;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .val em.u{color: var(--ice2);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .name{top: 16px; left: 50px; width: auto; max-width: 96px; border-top: 0; padding-top: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .art{width: 64px; height: 64px; margin-left: -32px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .cost{left: 10px; top: 12px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .full{position: relative; z-index: 3;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .tray{background: #0f1214; box-shadow: inset 0 0 0 1px #3d454b, 0 8px 24px rgba(0,0,0,.7);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .ti{background: #16191b;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .ti.sel{background: #26323a; box-shadow: inset 0 0 0 1px var(--ice), 0 6px 12px rgba(0,0,0,.6);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .ti.sel svg{color: var(--ice);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .end{background: #0f1214; color: var(--ice); box-shadow: inset 0 0 0 1px #3d454b; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 8px; text-indent: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .end .lampsvg{width: 32px; height: 32px; flex: none; overflow: visible;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .end .lampsvg circle{stroke-width: 1.2;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .end .lampsvg .trk{stroke: #3d454b;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .end .lampsvg .prg{stroke: var(--ice); stroke-width: 2; stroke-dasharray: 88; stroke-dashoffset: 88; transform: rotate(-90deg); transform-origin: 16px 16px; transition: stroke-dashoffset .1s;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .end .lampsvg .bulb{fill: #3d454b; stroke: none; transition: fill .4s linear;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .end .lampsvg .core{fill: var(--ice2); stroke: none; transition: fill .4s linear;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .end.hold .lampsvg .prg{stroke-dashoffset: 0; transition: stroke-dashoffset .4s linear;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .end.hold .lampsvg .bulb,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .end.hold .lampsvg .core{fill: #ffffff;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .end.hold{background: #1c2327; box-shadow: inset 0 0 0 1px var(--ice), 0 0 22px 4px rgba(220,232,238,.38);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .end .et{font-size: 12px; line-height: 14px; letter-spacing: .12em; text-align: left; white-space: nowrap;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .end .et{font-size: 15px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel{background: linear-gradient(to bottom, #2b3840 0, #0f1214 55%); box-shadow: inset 0 0 0 1px var(--rc, #8a8d92), 0 14px 30px rgba(0,0,0,.8), 0 -6px 30px rgba(220,232,238,.28);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .name,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .val b{color: #ffffff;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .tray:has(.ti.sel){background: #0f1214;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .foe.pickable.front .art .igs-combat-art{filter: drop-shadow(0 0 22px rgba(220,232,238,.65)) drop-shadow(0 0 10px rgba(207,47,58,.5));}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .top .enc,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .top .enc{position: static; transform: none; text-indent: 0; letter-spacing: .14em;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .top .rnd,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .top .rnd{position: static;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .top .enc{font-size: 18px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .foes{--base: 80px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]){--c-frame: #34373c; --c-frame-hi: #8a8d92; --c-atk: #c2444c; --c-skl: #6aae92; --c-pow: #9888c4;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .card.t-atk{--tc: var(--c-atk);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .card.t-def,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .card.t-skl{--tc: var(--c-skl);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .card.t-pow{--tc: var(--c-pow);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card{background: var(--cbg); box-shadow: inset 0 0 0 1px var(--c-frame), 0 6px 14px rgba(0,0,0,.55); outline: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card::before,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card::after{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.b-stk{box-shadow: inset 0 0 0 1px var(--c-frame), 0 6px 14px rgba(0,0,0,.55);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.b-tmp{outline: 1px dashed var(--dim); outline-offset: -4px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .cdir,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .vdir,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .val em.u{display: none !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card:not(.sel) .art{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .cost{left: 6px; top: 6px; width: 22px; height: 22px; background: none; color: var(--bone); font-size: 13px; box-shadow: inset 0 0 0 1px #5d6066;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .cost span,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-sign .cost span{color: var(--bone) !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .cost.cut,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .cost.rise,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.poor .cost{color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-unc .cost,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-pers .cost,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-sign .cost{background: none; box-shadow: inset 0 0 0 1px var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-rare .cost{box-shadow: inset 0 0 0 1px var(--bone), inset 0 0 0 2px var(--cbg), inset 0 0 0 3px var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-epic .cost{box-shadow: inset 0 0 0 2px var(--bone), inset 0 0 0 3px var(--cbg), inset 0 0 0 4px var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-myth .cost{box-shadow: inset 0 0 0 2px var(--bone), inset 0 0 0 3px var(--cbg), inset 0 0 0 4px var(--bone), 0 0 6px 1px rgba(236,232,222,.3);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-pers,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-sign{background: linear-gradient(225deg, var(--bone) 0 7px, var(--cbg) 7px);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card:not(.sel) .name{left: 32px; top: 7px; width: auto; max-width: none; writing-mode: vertical-rl; white-space: nowrap; font-size: 12px; line-height: 14px; letter-spacing: .08em; color: var(--bone); text-shadow: none; padding: 0; border: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .name sup{color: var(--en); text-shadow: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card:not(.sel) .name sup{display: inline-block; writing-mode: horizontal-tb; margin: 3px 0 0; line-height: 1; vertical-align: baseline;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .val{left: 7px; bottom: 21px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .val b,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .val b.up,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .val b.dn{color: var(--tc) !important; text-decoration: none; text-shadow: none; font-size: 22px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .ut{position: absolute; left: 7px; bottom: 7px; font: normal 10px/1 var(--serif); color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .stk{position: absolute; right: 6px; bottom: 7px; font: normal 600 10px/1 var(--num); color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .stk{display: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.poor .name,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.poor .val,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.poor .ut{opacity: 1;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.poor:not(.sel){filter: saturate(.3) brightness(.62);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel{background: var(--cbg); box-shadow: inset 0 0 0 1px var(--c-frame-hi), 0 14px 30px rgba(0,0,0,.8);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel.r-pers,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel.r-sign{background: linear-gradient(225deg, var(--bone) 0 9px, var(--cbg) 9px);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .cost{left: 9px; top: 9px; width: 28px; height: 28px; font-size: 17px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .name{left: 46px; top: 13px; text-shadow: none; color: var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .val{bottom: 26px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .val b,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .name{text-shadow: none !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .val b{font-size: 30px; color: var(--tc) !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .ut{left: 9px; bottom: 10px; font-size: 11px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .art{color: var(--tc); opacity: .9;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .kg,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .kg.tp,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .kg.sk{height: 18px; padding: 0 4px; font-size: 10px; background: none; color: var(--dim); box-shadow: inset 0 0 0 1px #4a4d52;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .sr{color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .sr.bad{color: var(--dim);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card:not(.sel) .cost{left: 8px; top: 8px; width: 26px; height: 26px; font-size: 16px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card:not(.sel) .name{left: 40px; top: 9px; width: auto; max-width: none; font-size: 15px; line-height: 17px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card .val{left: 9px; bottom: 26px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card .val b{font-size: 28px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card .ut{left: 9px; bottom: 9px; font-size: 12px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card .stk{right: 8px; bottom: 9px; font-size: 12px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card.sel .val{bottom: 30px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card.sel .val b{font-size: 34px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand:has(.card.sel){z-index: 45;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .cost,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card[class*=" r-"] .cost{background: none; box-shadow: inset 0 0 0 1px #5d6066;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-pers,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-sign,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel.r-pers,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel.r-sign{background: var(--cbg);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card .rtab{position: absolute; left: 32px; bottom: 100%; z-index: 3; width: 16px; height: var(--th, 12px); padding-top: 2px; box-sizing: border-box; background: var(--bone); color: #121214; font: normal 700 9px/1 var(--serif); text-align: center;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-unc .rtab{--th: 12px; background: #8d8f93;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-rare .rtab{--th: 14px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-epic .rtab{--th: 16px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-myth .rtab{--th: 18px; box-shadow: 0 0 6px 1px rgba(236,232,222,.3);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-pers .rtab,#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.r-sign .rtab{--th: 14px; background: #121214; color: var(--bone); box-shadow: inset 0 0 0 1px var(--bone);}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]) .hand .card.sel .rtab{left: 46px; width: 18px; font-size: 10px;}
#igs-overlay #igs-cx-canvas:where([data-cx="dark-b"]).land .hand .card:not(.sel) .rtab{left: 40px; width: 18px; font-size: 10px;}
`;
