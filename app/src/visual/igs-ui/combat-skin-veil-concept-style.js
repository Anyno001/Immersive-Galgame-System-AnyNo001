// 由 gal/战斗界面设计稿/落盘/gen-skin-css.mjs 从概念稿 veil/common.css、veil/veil.css、../../落盘/gen-skins/veil-inline.css 生成，不要手改；改设计稿后重新生成。
// 选择器作用域见生成脚本说明，规则内容与设计稿一致（本地图片地址换成 none）。
export const COMBAT_SKIN_VEIL_CONCEPT_CSS = `
@font-face{font-family: "Cinzel"; src: url("../../../fonts/Cinzel-Variable.ttf"); font-weight: 400 900;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]){--edge: #0a0a0b; --ink: #121214; --slab: #1c1c1e; --text: #f4f2ec; --dim: #9a9993; --faint: #66655f; --gold: #ffeeb8; --red: #ff7d72; --jade: #8fe3c0; --blue: #8db4f2; --violet: #b5a2f0; --halo: 0 1px 3px #000, 0 0 14px #000; --cn: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif; --num: "Cinzel", "Noto Serif SC", serif;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) *{box-sizing: border-box;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]){margin: 0; background: #08080a; color: var(--text); font: 13px/1.5 var(--cn);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]){position: relative; overflow: hidden; background: var(--edge); color: var(--text); font-family: var(--cn); user-select: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]):not(.land){width: 390px; height: 844px;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]).land{width: 1280px; height: 720px;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) *{margin: 0; padding: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) button{font: inherit; color: inherit; background: none; border: 0; cursor: pointer;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) svg{width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .stage,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .shade,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .topbar,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .track,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foes,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .deck{position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .stage{inset: 0; background: none 38% center / cover;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .shade{inset: 0; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .sp{flex: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .face-i{display: grid; place-items: center; background: #26272b; color: var(--text); font: 600 15px var(--cn);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .igs-combat-art{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .track{display: flex; align-items: center; gap: 8px; z-index: 6;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .track .who{position: relative; width: 30px; height: 30px; border-radius: 50%; overflow: hidden; flex: none; filter: brightness(.6) saturate(.7);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .track .who .igs-combat-art{position: absolute; left: 0; top: 2%; width: 100%; height: 130%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .track .who.now{filter: none; box-shadow: 0 0 0 1px var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .track .label{font-size: 11px; color: var(--faint); text-shadow: var(--halo);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .topbar{display: flex; align-items: center; z-index: 7; text-shadow: var(--halo);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .topbar .ic{width: 30px; height: 30px; display: grid; place-items: center; font-size: 18px; color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .topbar .tr{display: flex; align-items: center; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .topbar .retreat{display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--dim); padding: 4px 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .topbar .retreat svg{font-size: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foes{z-index: 2; touch-action: pan-y;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe{position: absolute; left: 50%; bottom: calc(var(--base, 0px) + var(--fb, 0px)); width: var(--w); z-index: var(--fz, 1); transform: translateX(calc(-50% + var(--fx, 0px))) scale(var(--fs, 1)); transform-origin: 50% 100%; cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .art{position: relative; width: 100%; height: calc(var(--w) * 1.3); filter: brightness(var(--fl, 1)) saturate(var(--fsat, 1)) drop-shadow(0 10px 18px rgba(0,0,0,.6));}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .igs-combat-art{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .head{position: absolute; left: 50%; bottom: calc(100% - var(--hd, 0px)); width: var(--pw, 150px); margin-left: calc(var(--pw, 150px) / -2); text-align: center; text-shadow: var(--halo); pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .intent{opacity: var(--fi, 1); white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .intent{color: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .intent svg{width: 1em; height: 1em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .n{opacity: var(--fi, 1); font: 600 14px var(--cn);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .n span{margin-left: 8px; font: 600 12px var(--num); color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .hpbar{height: 3px; background: #050506; position: relative; margin: 4px auto 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .hpbar i{display: block; height: 100%; background: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .hpbar i.ally{background: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .hpbar{opacity: var(--fp, 1); width: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .face{position: relative; border-radius: 50%; flex: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .lead .face{box-shadow: 0 0 0 3px var(--edge);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .lead .aw{position: absolute; left: 50%; bottom: -8px; transform: translateX(-50%); background: var(--gold); color: #121214; font: 700 11px var(--cn); padding: 1px 8px; letter-spacing: 1px; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .lead .glow{position: absolute; inset: -6px; border-radius: 50%; box-shadow: 0 0 22px 4px rgba(255,238,184,.38); pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .lead .n{font: 600 16px var(--cn); text-shadow: var(--halo);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .lead .n b{font: 700 15px var(--num); color: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .lead .n small{color: var(--dim); font: 500 12px var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .chips{display: flex; gap: 6px; margin-top: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .chip{display: inline-flex; align-items: center; gap: 4px; background: var(--slab); padding: 1px 7px; font-size: 11px; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .chip b{font: 600 12px var(--num); color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .mate{text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .mate .mface{width: 34px; height: 34px; border-radius: 50%; margin: 0 auto;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .mate .mn{font-size: 10px; color: var(--dim); margin-top: 3px; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .mate .hpbar{width: 34px; height: 2px; margin-top: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .hand{position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card{position: absolute; background: var(--slab); box-shadow: 0 8px 18px rgba(0,0,0,.55); cursor: pointer; transform-origin: 50% 100%; overflow: hidden; transition: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .bar{position: absolute; left: 0; right: 0; top: 0; height: 3px; background: currentColor;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .cost{position: absolute; left: 6px; top: 8px; font: 700 14px var(--num); color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .mt{position: absolute; left: 50%; transform: translateX(-50%); color: currentColor;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .mt svg{display: block; width: 100%; height: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val{position: absolute; left: 0; right: 0; text-align: center; font-family: var(--num); font-weight: 700; color: var(--text); line-height: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val em{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .nm{position: absolute; font-weight: 600; color: var(--text); white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .ds{display: none; position: absolute; left: 8px; right: 8px; color: var(--dim); font-size: 11px; line-height: 1.45; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .ds b{color: var(--red); font-family: var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-atk{color: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-def{color: var(--blue);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-skl{color: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-pow{color: var(--violet);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.poor .val,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.poor .nm,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.poor .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.poor .mt{opacity: .4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.sel{z-index: 60 !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.sel .ds{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.sel .val em{display: inline; font: 500 11px var(--cn); color: var(--dim); margin-left: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .end{position: absolute; background: var(--gold); color: #121214; font-weight: 700; text-align: center; z-index: 8; touch-action: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .end .ring{position: absolute; left: -5px; top: -5px; pointer-events: none; overflow: visible;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .end .ring rect{fill: none; stroke-width: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .end .ring .rt{stroke: #3a3a3c;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .end .ring .rp{stroke: var(--text); stroke-dasharray: 0 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .end span{position: relative;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .energy{position: absolute; text-shadow: var(--halo);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .energy .v{font: 700 28px/1 var(--num); color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .energy .v small{font-size: 14px; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .energy .pips{display: flex; gap: 5px; margin-top: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .energy .pips i{width: 7px; height: 7px; background: var(--gold); transform: rotate(45deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .energy .pips i.off{background: #3a3a3c;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .bag{position: absolute; display: flex; align-items: center; gap: 4px; color: var(--dim); font-size: 11px; text-shadow: var(--halo);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .bag svg{font-size: 16px; color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .bag em{font: 600 11px var(--num); font-style: normal; color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .piles{position: absolute; color: var(--dim); font-size: 11px; text-shadow: var(--halo); display: flex; flex-direction: column; gap: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .piles b{font: 600 12px var(--num); color: var(--text); margin-left: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .deck{position: absolute; inset: 0; pointer-events: none; z-index: 5;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .deck > *{pointer-events: auto;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .deck .lead,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .deck .mates,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .deck .piles,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .deck .bag,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .deck .energy{pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe:not(.front) .head{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .lead{position: absolute; display: flex; align-items: center; gap: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .mates{position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .mate{display: grid; grid-template-columns: 20px 1fr; column-gap: 6px; align-items: center; text-align: left;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .mate .mface{width: 20px; height: 20px; border-radius: 50%; margin: 0; font-size: 10px; grid-row: 1 / 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .mate .mn{margin: 0; line-height: 1.1; color: var(--text); font-size: 10px; grid-column: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .mate .hpbar{grid-column: 2; width: 100%; margin: 1px 0 0; height: 2px; background: #14302a;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .foes{left: 0; right: 0; top: 0; height: 548px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .topbar{left: 0; right: 0; top: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .topbar .tr{position: absolute; right: 8px; top: -2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .track{left: 12px; top: 76px; flex-direction: column; gap: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .track .label{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .track .who{width: 28px; height: 28px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .end{left: 304px; top: 556px; width: 76px; height: 44px; font-size: 14px; line-height: 44px; letter-spacing: 1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .energy{left: 20px; top: 566px; width: 80px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .hand{left: 12px; top: 604px; width: 366px; height: 158px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .lead{left: 14px; top: 780px; width: 170px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .lead .face{width: 44px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .bag{left: 190px; top: 788px; flex-direction: column; align-items: flex-start; gap: 1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .bag svg + b{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .piles{left: 190px; top: 808px; flex-direction: row; gap: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .mates{left: 276px; top: 776px; width: 104px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .mate{height: 21px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .foes{left: 0; right: 0; top: 0; height: 600px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .topbar{left: 44px; right: 26px; top: 22px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .topbar .tr{margin-left: auto;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .end{left: 1098px; top: 640px; width: 150px; height: 44px; font-size: 16px; line-height: 44px; letter-spacing: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .energy{left: 404px; top: 470px; width: 90px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .hand{left: 400px; top: 484px; width: 650px; height: 206px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .lead{left: 44px; top: 590px; width: 230px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .lead .face{width: 70px; height: 70px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .bag{left: 44px; top: 676px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .piles{left: 130px; top: 676px; flex-direction: row; gap: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .mates{left: 290px; top: 594px; width: 104px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .mate{height: 26px;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .end{background: var(--gold); color: #121214;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .end .ring rect{fill: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .end .ring .rp{stroke-linecap: butt;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .awr{position: absolute; left: -4px; top: -4px; width: calc(100% + 8px); height: calc(100% + 8px); transform: rotate(-90deg); overflow: visible; pointer-events: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .awr circle{fill: none; stroke-width: 2.5;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .awr .rt{stroke: #3a3a3c;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .awr .rp{stroke: var(--gold); stroke-linecap: butt;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .lead .aw{background: #26262a; color: var(--gold); font: 700 10px var(--cn); letter-spacing: 0; padding: 1px 6px; bottom: -9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .topbar .tr{gap: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .topbar .spd{font: 700 11px var(--num); background: #26262a; color: var(--text); padding: 2px 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .track .who{filter: brightness(.85);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .track .who.me{filter: none; box-shadow: 0 0 0 2px var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .track .who.ally{box-shadow: 0 0 0 1px var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .track .who.en{box-shadow: 0 0 0 1px var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .track .who.face-i{display: grid; place-items: center; font: 600 11px var(--cn); background-color: #26272b;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .intent{display: flex; justify-content: center; align-items: center; gap: 6px; margin-bottom: 4px; color: var(--red); font: 600 15px var(--cn); text-shadow: 0 0 16px rgba(255,125,114,.5), var(--halo);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .intent svg{font-size: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .intent b{font: 700 32px/1 var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .intent em{font-style: normal; font-size: 13px; letter-spacing: 3px; color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .row2{display: flex; justify-content: center; align-items: center; gap: 6px; opacity: var(--fi, 1); white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .row3 .nn{font: 600 14px var(--cn); letter-spacing: 3px; padding-left: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .row3{display: flex; justify-content: center; align-items: center; gap: 6px; margin-top: 4px; opacity: var(--fi, 1); white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .row2 .hpbar{width: 220px; height: 3px; margin: 0; background: #3a1d1b; flex: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .row2 .hpbar i{background: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .row2 .hv{font: 600 12px var(--num); color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .row3 .tier{font: 700 10px/14px var(--cn); letter-spacing: 1px; color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); padding: 0 4px; font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .fc{display: inline-flex; align-items: center; gap: 2px; background: #26262a; color: var(--text); padding: 0 5px; line-height: 17px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .fc svg{font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .fc b{font: 700 12px var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .fc.blk,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .fc.blk b{color: var(--blue);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .fc.rage{color: var(--red); padding: 0 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .lead .face{box-shadow: 0 0 0 3px var(--edge);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .lead .info{width: 112px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .lead .n{display: flex; justify-content: space-between; align-items: baseline; font-size: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .lead .info .hpbar{margin: 3px 0 0; height: 3px; background: #14302a;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .chips{margin-top: 3px; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .chip{font-size: 10px; padding: 0 6px; line-height: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .chip svg{font-size: 11px; color: var(--blue);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .chip b{font-size: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .mate .st{font-size: 9px; color: var(--red); margin-left: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .pick{box-shadow: 0 0 0 2px var(--gold), 0 0 12px rgba(255,238,184,.55) !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .energy .v{font-size: 38px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .energy .pips i{width: 8px; height: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .opbag,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .opskill{position: absolute; display: flex; align-items: center; justify-content: center; gap: 6px; height: 40px; background: var(--slab); color: var(--text); font: 600 13px var(--cn); z-index: 8; pointer-events: auto !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .opbag svg{font-size: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .opbag em,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .opskill i{font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .opbag em{font: 700 14px var(--num); color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .opskill i{width: 18px; height: 18px; border-radius: 50%; background: var(--gold); color: #121214; font: 700 12px/18px var(--num); text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .root-tray-on .opbag,#igs-overlay #igs-cx-canvas:where([data-cx="veil"]).tray-on .opbag{background: var(--gold); color: #121214;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]).tray-on .opbag em{color: #121214;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .piles{flex-direction: row !important; gap: 6px !important; z-index: 8;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .pile{display: inline-flex; align-items: center; gap: 4px; height: 28px; padding: 0 8px; background: var(--slab); color: var(--dim); pointer-events: auto !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .pile svg{font-size: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .pile b{font: 700 13px var(--num); color: var(--text); margin: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .deck .piles{pointer-events: auto;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .tray{display: none; position: absolute; z-index: 9; background: var(--slab); padding: 8px; gap: 8px; grid-template-columns: repeat(3, 1fr); pointer-events: auto !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]).tray-on .tray{display: grid;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .tray .hint{display: none; grid-column: 1 / -1; font: 600 11px var(--cn); color: var(--gold); text-align: center; line-height: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .tray.ask .hint{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .cell{display: grid; grid-template-columns: 22px 1fr; grid-template-rows: auto auto; align-items: center; column-gap: 6px; padding: 6px 8px; background: #26262a; color: var(--text); text-align: left; font: 600 12px var(--cn);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .cell svg{grid-row: 1 / 3; font-size: 22px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .cell span{white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .cell em{font: 700 12px var(--num); font-style: normal; color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .cell.on{background: var(--gold); color: #121214;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .cell.on em{color: #121214;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .cell.off{opacity: .4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card{background: #1c1c1e; border: 1px solid #4a4a4f; border-radius: 6px; color: var(--text); --tc: var(--red); --tp: #2a1a1b; box-shadow: 0 8px 18px rgba(0,0,0,.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card::before{content: ""; position: absolute; inset: 3px; border: 1px solid #2e2e32; border-radius: 4px; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-atk{--tc: var(--red); --tp: #2a1a1b;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-def{--tc: var(--blue); --tp: #1a2130;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-skl{--tc: var(--jade); --tp: #172621;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-pow{--tc: var(--violet); --tp: #221d33;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.r-uncommon{border-color: #cfcdc6;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.r-rare{border-color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.r-epic{border-color: var(--gold); box-shadow: 0 0 10px rgba(255,238,184,.4), 0 8px 18px rgba(0,0,0,.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.r-myth{border-color: var(--gold); box-shadow: 0 0 16px 2px rgba(255,238,184,.55), 0 8px 18px rgba(0,0,0,.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.r-myth::before{border-color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .cost{position: absolute; border-radius: 50%; background: var(--gold); color: #121214; text-align: center; font-family: var(--num); font-weight: 700; z-index: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.cut .cost{background: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .c0{display: block; position: absolute; font: 600 11px var(--num); color: var(--dim); text-decoration: line-through; z-index: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .plate{position: absolute; left: 50%; transform: translateX(-50%); background: var(--tp); border: 1px solid var(--tc); border-radius: 50%; display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .mt{position: static; transform: none; color: var(--tc); display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .mt svg{width: 100%; height: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .nm{position: absolute; left: 0; right: 0; transform: none; text-align: center; font-weight: 600; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .nm span{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val{position: absolute; left: 0; right: 0; display: flex; align-items: center; justify-content: center; gap: 4px; font-family: var(--num); font-weight: 700; color: var(--text); line-height: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val svg{color: var(--tc); flex: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val b{font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val.buff b{color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val.buff::after{content: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .kws,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .ds,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .tip,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .ck{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .ds{color: var(--dim); text-align: center; position: absolute; left: 8px; right: 8px; line-height: 1.4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .ds b{color: var(--red); font-family: var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .tip{position: absolute; text-align: center; color: var(--gold); line-height: 1.4; left: 8px; right: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.poor .plate,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.poor .nm,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.poor .val,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.poor .cost{opacity: .4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.cand{box-shadow: 0 0 0 1px var(--gold), 0 8px 18px rgba(0,0,0,.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.chosen{box-shadow: 0 0 0 2px var(--gold), 0 8px 18px rgba(0,0,0,.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.chosen .ck{display: block; position: absolute; right: 5px; top: 6px; font: 700 12px var(--cn); color: var(--gold); font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .lvp{position: absolute; display: flex; gap: 3px; z-index: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .lvp b{width: 5px; height: 5px; background: var(--jade); transform: rotate(45deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.stk{box-shadow: 0 -4px 0 -1px #3a3a3e, 0 -8px 0 -2px #28282b, 0 8px 18px rgba(0,0,0,.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.tmp::after{content: ""; position: absolute; inset: 6px; border: 1px dashed #85857f; border-radius: 3px; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.sel{z-index: 60 !important; background: #222226; box-shadow: 0 0 26px rgba(255,238,184,.4), 0 14px 26px rgba(0,0,0,.7);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.sel::after{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.sel .kws{display: flex; position: absolute; left: 4px; right: 4px; justify-content: center; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.sel .ds{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.tipping .ds{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.tipping .tip{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.sel .nm span{display: inline;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .kw{width: 16px; height: 16px; border-radius: 50%; background: #34343a; color: var(--text); font: 600 10px/16px var(--cn); text-align: center; cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .kw.on{background: var(--gold); color: #121214;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .foes{height: 610px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .tray{left: 12px; right: 12px; top: 424px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .energy{left: 16px; top: 490px; width: 70px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .opbag{left: 100px; top: 498px; width: 64px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .opskill{left: 170px; top: 498px; width: 118px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .end{left: 304px; top: 496px; width: 76px; height: 44px; font-size: 14px; line-height: 44px; letter-spacing: 1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .hand{left: 12px; top: 548px; width: 366px; height: 192px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .lead{left: 14px; top: 756px; width: 170px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .lead .face{width: 44px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .piles{left: 186px; top: 764px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .mates{left: 290px; top: 752px; width: 90px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .mate{height: 20px; grid-template-columns: 18px 1fr;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .mate .mface{width: 18px; height: 18px; font-size: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .cost{left: 4px; top: 4px; width: 16px; height: 16px; font-size: 11px; line-height: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .c0{left: 22px; top: 5px; font-size: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .lvp{left: 24px; top: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .plate{top: 22px; width: 30px; height: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .mt{width: 16px; height: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .nm{top: 57px; font-size: 10px; line-height: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .val{bottom: 7px; font-size: 17px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .val svg{font-size: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .cost{left: 8px; top: 8px; width: 22px; height: 22px; font-size: 14px; line-height: 22px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .c0{left: 34px; top: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .lvp{left: 36px; top: 21px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .plate{top: 14px; width: 56px; height: 56px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .mt{width: 30px; height: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .nm{top: 76px; font-size: 14px; line-height: 18px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .val{top: 98px; bottom: auto; font-size: 28px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .val svg{font-size: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .kws{top: 132px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .ds,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .tip{top: 154px; font-size: 10.5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .foes{height: 620px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .tray{left: 400px; top: 312px; width: 380px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .energy{left: 400px; top: 392px; width: 130px; display: flex; align-items: center; gap: 14px; text-shadow: 0 1px 3px #000, 0 0 10px #000, 0 0 22px #000;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .energy .pips{margin-top: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .energy .v{font-size: 42px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .opbag{left: 540px; top: 396px; width: 72px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .opskill{left: 620px; top: 396px; width: 130px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .end{left: 1098px; top: 596px; width: 150px; height: 44px; font-size: 16px; line-height: 44px; letter-spacing: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .hand{left: 400px; top: 440px; width: 650px; height: 236px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .lead{left: 44px; top: 552px; width: 230px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .lead .face{width: 70px; height: 70px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .lead .info{width: 150px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .piles{left: 44px; top: 650px; gap: 10px !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .mates{left: 290px; top: 566px; width: 120px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .mate{height: 26px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card .cost{left: 6px; top: 6px; width: 22px; height: 22px; font-size: 14px; line-height: 22px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card .c0{left: 32px; top: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card .lvp{left: 34px; top: 18px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card .plate{top: 30px; width: 44px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card .mt{width: 24px; height: 24px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card .nm{top: 80px; font-size: 12px; line-height: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card .nm span{display: inline;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card .val{bottom: 10px; font-size: 24px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card .val svg{font-size: 13px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .cost{left: 10px; top: 10px; width: 26px; height: 26px; font-size: 16px; line-height: 26px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .c0{left: 42px; top: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .lvp{left: 44px; top: 26px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .plate{top: 14px; width: 70px; height: 70px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .mt{width: 38px; height: 38px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .nm{top: 94px; font-size: 17px; line-height: 22px; letter-spacing: 1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .val{top: 120px; bottom: auto; font-size: 38px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .val svg{font-size: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .kws{top: 166px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .ds,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card .tip{top: 190px; font-size: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .nm span{display: inline;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .nm span{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .nm span{display: inline;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .foe .head{margin-left: calc(var(--pw, 300px) / -2);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .opbag,#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .opskill,#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .pile{background: #26262a;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]).tray-on .opbag{background: var(--gold);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .cell{background: #26262a;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .cell.on{background: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .cost{left: 3px; top: 3px; width: 15px; height: 15px; font-size: 10px; line-height: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .c0{left: 20px; top: 4px; font-size: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .lvp{left: 21px; top: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .plate{top: 20px; width: 26px; height: 26px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .mt{width: 14px; height: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .nm{top: 50px; font-size: 10px; line-height: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .val{bottom: 6px; font-size: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .val svg{font-size: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .cost{left: 8px; top: 8px; width: 22px; height: 22px; font-size: 14px; line-height: 22px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .hand{top: 560px; height: 180px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .tray{top: 430px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .foes{height: 660px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .energy .pips{flex: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .hand{left: 4px; width: 382px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .energy .pips i{flex: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .cell.on,#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .cell.on span,#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .cell.on svg{color: #121214;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .foes{height: 566px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .foes{height: 536px;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card,#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-uncommon,#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-rare,#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-epic,#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-myth{border-color: #3a3a3f;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-myth::before{border-color: #2e2e32;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-epic,#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-myth{box-shadow: 0 8px 18px rgba(0,0,0,.55);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.cand{box-shadow: 0 0 0 1px var(--gold), 0 8px 18px rgba(0,0,0,.55);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.chosen{box-shadow: 0 0 0 2px var(--gold), 0 8px 18px rgba(0,0,0,.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.cut .cost{background: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .plate{border: 0; background: radial-gradient(circle at 50% 38%, var(--tp) 0, #17171a 100%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-atk .plate{background: radial-gradient(circle at 50% 40%, #4a2327 0, #1a1214 85%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-def .plate{background: radial-gradient(circle at 50% 40%, #223452 0, #121620 85%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-skl .plate{background: radial-gradient(circle at 50% 40%, #1f4a3d 0, #111b18 85%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-pow .plate{background: radial-gradient(circle at 50% 40%, #3b2f66 0, #17142a 85%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.sel{background: #2e2e33; box-shadow: 0 0 26px rgba(255,238,184,.4), 0 14px 26px rgba(0,0,0,.7);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.chosen .ck{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).ask-foe .foes:has(.foe.target) .foe:not(.target) .art{filter: brightness(calc(var(--fl, 1) * .7)) saturate(var(--fsat, 1)) drop-shadow(0 10px 18px rgba(0,0,0,.6));}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).ask-foe .foe.target .art{filter: brightness(1.12) saturate(var(--fsat, 1)) drop-shadow(0 0 26px rgba(255,238,184,.28)) drop-shadow(0 10px 18px rgba(0,0,0,.6));}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .tray .cell{transition: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .tray:has(.cell.on) .cell:not(.on){filter: brightness(.7);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .cell.on{transform: translateY(-4px); box-shadow: 0 10px 18px rgba(0,0,0,.6), 0 -10px 22px -6px rgba(255,238,184,.4);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .pick{box-shadow: 0 0 18px 3px rgba(255,238,184,.55) !important; transform: scale(1.12); filter: brightness(1.12);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]).ask-ally .foes{filter: brightness(.72);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .chip svg,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .fc svg{stroke-width: 1.8;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-uncommon{border-color: #cfcdc6;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-rare{border-color: var(--gold);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-epic{border-color: var(--gold); box-shadow: 0 0 10px rgba(255,238,184,.4), 0 8px 18px rgba(0,0,0,.55);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-myth{border-color: var(--gold); box-shadow: 0 0 16px 2px rgba(255,238,184,.55), 0 8px 18px rgba(0,0,0,.55);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-myth::before{border-color: var(--gold);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.sel{background: #2e2e33; box-shadow: 0 0 26px rgba(255,238,184,.4), 0 14px 26px rgba(0,0,0,.7);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .nm .pl{font-style: normal; color: var(--jade); font-family: var(--num); font-weight: 700; margin-left: 1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.enhd .nm{color: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val.enh b,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val.enh svg{color: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val .up{font-style: normal; font-size: 8px; color: var(--jade); align-self: flex-start; margin: 0 0 0 1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .ds .eh{font-style: normal; color: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .up,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .up{font-size: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card .up{font-size: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .plate{top: 12px; width: 50px; height: 50px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .mt{width: 28px; height: 28px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .nm{top: 67px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .val{top: 88px; font-size: 26px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .kws{top: 120px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .ds,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .tip{top: 142px; font-size: 10px; line-height: 1.35;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .plate{top: 12px; width: 60px; height: 60px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .mt{width: 32px; height: 32px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .nm{top: 78px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .val{top: 102px; font-size: 36px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .kws{top: 146px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .ds,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card .tip{top: 168px; font-size: 11px; line-height: 1.35;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .ds,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .tip{top: 138px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .kws{top: 116px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .foe .row2 .hpbar{width: 260px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .plate,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-atk .plate,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-def .plate,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-skl .plate,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-pow .plate{background: none; border: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .mt{width: 18px; height: 18px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .mt{width: 34px; height: 34px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card .mt{width: 30px; height: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .mt{width: 40px; height: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .energy{top: 564px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .opbag,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .opskill{top: 572px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .end{top: 570px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .tray{top: 504px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .hand{top: 551px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .tray{top: 382px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .energy{top: 462px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .opbag,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .opskill{top: 466px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .topbar{left: 14px; right: 0; flex-direction: row; align-items: baseline; gap: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .topbar .title{font-size: 16px; letter-spacing: 4px; padding-left: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .topbar .round{margin-top: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .topbar .tr{top: -4px;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .topbar .spd{background: none; padding: 0; font: 700 13px var(--num); color: var(--text);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .topbar .retreat{padding: 0 6px; font: 600 13px var(--cn); letter-spacing: 2px; color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card:not(.sel) .plate{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card:not(.sel) .nm{top: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card:not(.sel) .nm{top: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-skl,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-def{--tc: var(--jade); --tp: #172621;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card,#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card[class*=" r-"]{border-color: #3a3a3f; --rf: 0 0 0 0 transparent;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-myth::before{border-color: #2e2e32;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-common{border-color: #5a5a60;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-uncommon{border-color: #d8d6cf;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-rare{border-color: #d8d6cf;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-rare::before{border-color: #d8d6cf;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-epic{border: 2px solid #ece9e1;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-epic::before{border-color: #d8d6cf;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-myth{border: 2px solid #ece9e1; --rf: 0 0 12px 1px rgba(236,233,225,.35);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-myth::before{border-color: #d8d6cf;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.sig::after{content: ""; position: absolute; left: -1px; top: -1px; width: 12px; height: 12px; border-top-left-radius: 6px; background: var(--red); clip-path: polygon(0 0, 100% 0, 0 100%); z-index: 3; pointer-events: none; border: 0; inset: auto;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card:not(.sel){box-shadow: var(--rf), 0 8px 18px rgba(0,0,0,.55);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.stk:not(.sel){box-shadow: var(--rf), 0 -4px 0 -1px #3a3a3e, 0 -8px 0 -2px #28282b, 0 8px 18px rgba(0,0,0,.55);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.cand{box-shadow: var(--rf), 0 0 0 1px var(--gold), 0 8px 18px rgba(0,0,0,.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .kw{width: auto; height: 18px; padding: 0 6px; border-radius: 0; background: none; box-shadow: inset 0 0 0 1px #55555b; color: var(--dim); font: 600 10px/18px var(--cn); letter-spacing: 1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .kw.on{background: none; box-shadow: inset 0 0 0 1px var(--gold); color: var(--gold);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .opbag,#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .opskill{gap: 6px; font: 600 13px var(--cn); letter-spacing: 1px; color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .opbag em{font: 700 13px var(--num); color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .opskill i{width: 16px; height: 16px; font: 700 10px/16px var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .opbag{width: 76px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .opskill{left: 182px; width: 106px;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .piles{align-items: baseline; gap: 6px !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .pile{height: auto; padding: 0; background: none; color: var(--dim); font: 600 11px var(--cn); gap: 3px; pointer-events: none !important;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .pile b{font: 700 13px var(--num); color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .piles .dot{color: var(--faint); font-size: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .piles{left: 186px; top: 780px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe.k-beast .art{scale: .82; transform-origin: 50% 100%; translate: 0 -200px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .foe.k-beast .art{scale: 1; translate: 0 -125px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .plate,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.sel .plate{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val .up{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .ds b{color: var(--text); font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .nm{top: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .val{top: 64px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .kws{top: 98px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card.sel .ds,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .card .tip{top: 122px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .nm{top: 48px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .val{top: 76px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .kws{top: 122px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card.sel .ds,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .card .tip{top: 146px;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card{border-radius: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card::before{border-radius: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.tmp::after{border-radius: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.sig::after{border-top-left-radius: 0; left: 0; top: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-atk{--tc: #b0706a;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-skl,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-def{--tc: #6fa892;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.t-pow{--tc: #8f84b8;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.enhd.t-atk{--tc: #ff5446;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.enhd.t-skl,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.enhd.t-def{--tc: #3fe6a6;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.enhd.t-pow{--tc: #a78bff;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card{background: linear-gradient(to top, var(--tc) 0 4px, #1c1c1e 4px);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.sel{background: linear-gradient(to top, var(--tc) 0 5px, #2e2e33 5px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val b,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val svg,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val.enh b,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .val.enh svg{color: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.enhd .nm{color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .nm .pl{color: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card .ds .eh{color: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.poor .plate,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.poor .nm,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.poor .val,#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .card.poor .cost{opacity: 1;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.poor{filter: grayscale(1) brightness(.55);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-common{border: 1.5px solid #6a6a70;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-uncommon{border: 2px solid #d8d6cf;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-rare{border: 2px solid #ece9e1;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-rare::before{border: 1px solid #ece9e1;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-epic{border: 3px solid #f4f2ec;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-epic::before{border: 1.5px solid #f4f2ec;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-myth{border: 3px solid #fffaf0; --rf: 0 0 16px 3px rgba(255,250,240,.55);}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.r-myth::before{border: 1.5px solid #fffaf0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .intent{margin-bottom: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .row2{translate: 0 -3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .opskill{left: 304px; top: 474px; width: 76px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .opbag{left: 304px; top: 522px; width: 76px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .opskill{left: 1098px; top: 546px; width: 72px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .opbag{left: 1176px; top: 546px; width: 72px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).port .tray{top: 414px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .tray{top: 482px; left: auto; right: 32px;}
#igs-overlay #igs-cx-canvas:where([data-cx="veil"]) .card.cut .cost{background: #121214; box-shadow: inset 0 0 0 1.5px var(--gold); color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .foe .row2 .hpbar{width: 180px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .foe .row2 .hpbar{width: 220px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .shade.a{z-index: 1; background: radial-gradient(ellipse 62% 40% at 50% 44%, rgba(10,10,11,.1) 0, rgba(10,10,11,.88) 100%), rgba(10,10,11,.5);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .shade.c{z-index: 1; background: radial-gradient(ellipse 46% 100% at 50% 0%, rgba(255,246,224,.26), rgba(255,246,224,.08) 60%, rgba(255,246,224,0) 100%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .shade.c{background: radial-gradient(ellipse 34% 100% at 50% 0%, rgba(255,246,224,.26), rgba(255,246,224,.08) 60%, rgba(255,246,224,0) 100%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .shade.b{z-index: 3; background: linear-gradient(to top, #0a0a0b 0, #0a0a0b 130px, transparent 340px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .shade.b{background: linear-gradient(to top, #0a0a0b 0, #0a0a0b 90px, transparent 260px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .topbar{flex-direction: column; align-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .topbar .title{font: 600 15px var(--cn); letter-spacing: 6px; padding-left: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .topbar .round{font: 600 11px var(--num); letter-spacing: 3px; color: var(--gold); margin-top: 1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .topbar .sp{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]) .topbar .tr{position: absolute; right: 8px; top: -4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .topbar{align-items: flex-start;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .topbar .title{font-size: 17px; letter-spacing: 8px; padding-left: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="veil"],.igs-cx-ghost[data-cx="veil"]).land .topbar .tr{right: 0;}
`;
