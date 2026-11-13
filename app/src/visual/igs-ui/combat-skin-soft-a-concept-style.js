// 由 gal/战斗界面设计稿/落盘/gen-skin-css.mjs 从概念稿 soft/common.css、soft/geo.css、soft/方案A.css、soft/卡面.css 生成，不要手改；改设计稿后重新生成。
// 选择器作用域见生成脚本说明，规则内容与设计稿一致（本地图片地址换成 none）。
export const COMBAT_SKIN_SOFT_A_CONCEPT_CSS = `
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) *{box-sizing: border-box;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]){margin: 0; background: #2b292d; font-family: "ChillRoundF", "Microsoft YaHei", sans-serif; color: #f6f0e8;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) body.shot #bar{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) body.shot #wrap{padding: 0; justify-content: flex-start;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-a"]){position: relative; overflow: hidden; flex: none; font-synthesis: none; user-select: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-a"]).port{width: var(--cx-w); height: 844px;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-a"]).land{width: var(--cx-w); height: 720px;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-a"]) button{font-family: inherit; cursor: pointer;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-a"]) .stage{position: absolute; inset: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-a"]) .stage .bgi{position: absolute; inset: 0; background: none 38% center / cover; filter: brightness(.78) saturate(.7);}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-a"]) .stage .vig{position: absolute; inset: 0; background: radial-gradient(ellipse 75% 70% at 50% 45%, rgba(18,16,18,0) 55%, rgba(18,16,18,.5) 100%);}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-a"]) svg{fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .face-t1,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .face-t2{display: grid; place-items: center; font-weight: 700; color: #1d1b1e;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .face-t1{background: #f2b8a8;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .face-t2{background: #b9dcc4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .track .who{position: relative; border-radius: 50%; overflow: hidden; flex: none; display: grid; place-items: center; font-size: 11px; font-weight: 700; color: #1d1b1e;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .track .who .igs-combat-art{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes{position: absolute; left: 0; right: 0; top: var(--foes-top); height: var(--foes-h); z-index: 2; touch-action: pan-y;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe{position: absolute; left: 50%; bottom: calc(var(--foe-b) + var(--fb, 0px)); width: var(--w, 200px); z-index: var(--fz, 1); transform: translateX(calc(-50% + var(--fx, 0px))) scale(var(--fs, 1)); transform-origin: 50% 100%; cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .art{position: relative; width: 100%; height: calc(var(--w, 200px) * 1.3); filter: brightness(var(--fl, 1)) saturate(var(--fsat, 1));}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .art .igs-combat-art{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .plate{position: absolute; left: 50%; bottom: calc(100% - var(--plate-drop, 0px)); width: 184px; margin: 0 0 0 -92px; display: flex; flex-direction: column; align-items: center; opacity: var(--fi, 1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .intent{display: flex; align-items: center; gap: 5px; height: 26px; padding: 0 12px; margin-bottom: 6px; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .intent svg{width: 14px; height: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .intent b{font-size: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .intent em{font-size: 11px; font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .n{width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 0 4px; font-size: 16px; font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .n .hpn{font-size: 12px;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-a"]) .crown{width: 14px; height: 14px; fill: var(--crown, #f7dc9a); stroke: none; margin-right: 5px; vertical-align: -1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .fchips{display: flex; gap: 6px; margin-top: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .fchip{display: inline-flex; align-items: center; gap: 3px; height: 20px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .fchip svg{width: 11px; height: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .hpbar{position: relative; height: 8px; border-radius: 999px; overflow: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .hpbar i{position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .hpbar.thin{height: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .deck{position: absolute; inset: 0; z-index: 4; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .deck > *{position: absolute; pointer-events: auto;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .face{position: relative; flex: none; border: 0; padding: 0; border-radius: 50%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .face .aw{position: absolute; left: 50%; bottom: -9px; transform: translateX(-50%); padding: 0 9px; height: 17px; border-radius: 999px; font: 700 10px/17px "ChillRoundF", sans-serif; letter-spacing: .1em; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .lead{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .lead .face,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .lead .info{position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .lead .n{display: flex; align-items: baseline; font-size: 17px; font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .lead .n .hp{margin-left: auto; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .chips{display: flex; gap: 6px; margin-top: 7px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .chip{display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 9px; border-radius: 999px; font-size: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .chip svg{width: 11px; height: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .mates{position: absolute; display: flex;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .mate{display: flex; align-items: center; gap: 7px; min-width: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .mate .mface{width: 28px; height: 28px; flex: none; border-radius: 50%; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .mate .mi{flex: 1; min-width: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .mate .mn{font-size: 11px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .items{position: absolute; border: 0; padding: 0; display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .items svg{width: 16px; height: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .items .badge{position: absolute; right: -3px; top: -4px; min-width: 15px; height: 15px; border-radius: 999px; font-size: 10px; font-style: normal; display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .piles{font-size: 11px; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .piles b{font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .hand{position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card{position: absolute; border-radius: 12px; cursor: pointer; display: flex; flex-direction: column; align-items: center; padding: 8px 0 8px; transform-origin: 50% 130%; transition: transform .22s cubic-bezier(.2,.8,.2,1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .top{display: flex; flex-direction: column; align-items: flex-start; gap: 3px; width: 100%; padding: 0 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .cost{flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 700; font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .was{display: none; font-size: 12px; font-weight: 700; opacity: .7;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .name{max-width: 100%; font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .pat{flex: 1; display: grid; place-items: center; width: 100%; opacity: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .pat svg{width: 26px; height: 26px; stroke: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .pat .fl{fill: var(--tc); stroke: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .pat .ln{fill: none; stroke: var(--tc); stroke-width: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val{display: flex; align-items: baseline; gap: 2px; margin-top: auto;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val b{font-size: 24px; line-height: 1; font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val em{display: none; font-size: 10px; font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .desc,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .kws{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .badge{position: absolute; right: 4px; top: 6px; min-width: 20px; height: 16px; padding: 0 5px; border-radius: 999px; font-size: 10px; font-style: normal; font-weight: 700; display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.t-atk{--tc: var(--c-atk);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.t-def{--tc: var(--c-def);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.t-skl{--tc: var(--c-skl);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.t-pow{--tc: var(--c-pow);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.r-rare .cost{box-shadow: 0 0 0 2px var(--cardbg), 0 0 0 3.5px var(--rare);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.r-epic .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.r-myth .cost{box-shadow: 0 0 0 2px var(--cardbg), 0 0 0 3.5px var(--rare), 0 0 0 5px var(--cardbg), 0 0 0 6.5px var(--epic);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.r-epic{outline: 2px solid var(--epic); outline-offset: -2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.r-myth{outline: 3px solid var(--myth); outline-offset: -3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.tmp::after{content: ""; position: absolute; inset: 4px; border-radius: 9px; border: 1.5px dashed var(--tmp); pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.dup::after{content: ""; position: absolute; left: 8px; right: 8px; top: -6px; height: 6px; border-radius: 9px 9px 0 0; background: var(--dupbg, var(--cardbg));}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel.dup::after{left: 14px; right: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel{padding: 10px 0 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .top{flex-direction: row; justify-content: flex-start; gap: 6px; padding: 0 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .name{font-size: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .was{display: inline; text-decoration: line-through;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .pat{opacity: 1; flex: none; height: 50px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .pat svg{width: 40px; height: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .val{margin-top: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .val b{font-size: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .val b.up{padding-right: 14px; position: relative; color: var(--boost);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .val b.up::after{content: ""; position: absolute; right: 0; top: 4px; border: 5px solid transparent; border-bottom: 8px solid var(--boost); border-top: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .val em{display: inline;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .desc{display: block; margin: 5px 9px 0; font-size: 11px; line-height: 1.45; text-align: center; align-self: stretch;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .kws{display: flex; gap: 6px; margin-top: auto; padding-top: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .kw{width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700; font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tipbox{position: absolute; z-index: 90; display: none; width: 180px; padding: 6px 10px; border-radius: 10px; font-size: 11px; line-height: 1.4; background: var(--cream, #f6f0e8); color: #38333a; box-shadow: 0 6px 14px rgba(0,0,0,.45); pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tipbox.on{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .energy .v{font-size: 30px; font-weight: 700; line-height: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .energy .v small{font-size: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .energy .pips{display: flex; gap: 6px; margin-top: 6px; justify-content: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .energy .pips i{width: 8px; height: 8px; transform: rotate(45deg); border-radius: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .energy{display: flex; flex-direction: column; align-items: center; justify-content: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .end{border: 0; padding: 0; display: grid; place-items: center; overflow: visible;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .end b{position: relative; font-size: 15px; font-weight: 700; letter-spacing: .04em; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .end .ring{position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .end .ring rect{fill: none; stroke-width: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .end .ring .trk{stroke: var(--ring-trk, transparent);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .end .ring .prog{stroke: var(--ring, #fff); stroke-dasharray: 100; stroke-dashoffset: 100;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .end.holding .ring .prog{stroke-dashoffset: 0; transition: stroke-dashoffset .4s linear;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .end.holding{transform: translateY(2px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .desc .ty{display: table; margin: 0 0 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .end .ring .prog{opacity: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .end.holding .ring .prog{opacity: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .hpbar{width: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .face .chg{position: absolute; inset: -6px; border-radius: 50%; background: conic-gradient(var(--chg, #f7dc9a) calc(var(--charge, .7) * 360deg), var(--chg-trk, #4a454d) 0); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .skill{position: absolute; border: 0; padding: 0; border-radius: 50%; display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .skill svg{width: 18px; height: 18px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .skill .badge{position: absolute; right: -3px; top: -4px; min-width: 15px; height: 15px; border-radius: 999px; font-size: 10px; font-style: normal; display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .fchip{background: var(--fc-bg, #1d1b1e);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .fchip.blk{color: var(--fc-blk, #a9c8ee);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .fchip.vul{color: var(--fc-vul, #f2a1ac);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .plate{width: max-content; max-width: none; margin-left: 0; transform: translateX(-50%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .row2{display: flex; align-items: center; gap: 7px; width: max-content; height: 26px; padding: 0 8px 0 10px; border-radius: 999px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .row2 .nm{flex: none; font-size: 15px; font-weight: 700; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .row2 .hpbar{flex: none; width: var(--hpw, 220px); margin: 0; height: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .row2 .fchip{flex: none; height: 18px; padding: 0 6px; gap: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .intent{margin-bottom: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .intent{border-left: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val em{display: none; line-height: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val em .ui{width: 13px; height: 13px; fill: currentColor; stroke: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val{align-items: center; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card:not(.sel) .val em{display: inline-flex;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card:not(.sel) .val em .ui{width: 11px; height: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .val em .ui{width: 15px; height: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .skill,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .items{position: absolute; border: 0; padding: 0; width: 44px; height: 46px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .skill svg,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .items svg{width: 19px; height: 19px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .skill .cnt,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .items .cnt{font-style: normal; font-size: 11px; font-weight: 700; line-height: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .items.on{transform: translateY(1px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).tray-on .items{outline: 2px solid var(--tray-ac, #fff); outline-offset: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tray{display: none; z-index: 70 !important; padding: 8px; border-radius: 18px; flex-direction: column; gap: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).tray-on .tray{display: flex;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tray .th{display: flex; align-items: baseline; gap: 8px; font-size: 12px; font-weight: 700; padding: 0 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tray .th em{font-style: normal; font-size: 10px; font-weight: 400;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tcells{display: flex; gap: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tcell{position: relative; flex: 1; height: 62px; border: 0; border-radius: 14px; padding: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tcell svg{width: 20px; height: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tcell b{font-size: 11px; font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tcell em{font-style: normal; font-size: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tcell .tg{position: absolute; right: 6px; top: 6px; width: 6px; height: 6px; border-radius: 50%; background: currentColor;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tcell.off{filter: brightness(.5) saturate(.5); cursor: default;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).tray-on .hand .card.sel{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .pick-tg .foes .foe.front .row2{outline: 3px solid var(--aim, #fff); outline-offset: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .skill,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .items{width: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val em .ui{width: 13px !important; height: 13px !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .face .aw{bottom: -4px; height: 15px; line-height: 15px; font-size: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .lead .face{top: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .face .chg{inset: -4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .foes .foe .row2{max-width: 340px; height: auto; min-height: 26px; flex-wrap: wrap; justify-content: center; row-gap: 3px; padding-top: 4px; padding-bottom: 4px; border-radius: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card{border-radius: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel{border-radius: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.tmp::after{border-radius: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.dup::after{border-radius: 4px 4px 0 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .topbar{position: absolute; z-index: 5; left: 12px; right: 12px; top: 12px; height: 32px; display: flex; align-items: center; gap: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .topbar .sp{flex: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .topbar .ic{min-width: 30px; height: 30px; padding: 0 6px; display: grid; place-items: center; border-radius: 999px; font-size: 12px; font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .topbar .ic svg{width: 14px; height: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .track{position: absolute; z-index: 5; display: flex; align-items: center; gap: 7px; padding: 6px; border-radius: 999px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .track .who{width: 28px; height: 28px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .track .who.now{width: 34px; height: 34px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port{--HW: min(calc(var(--cx-w) - 32px), 400px); --HL: calc((var(--cx-w) - var(--HW)) / 2); --GW: min(calc(var(--cx-w) - 32px), 440px); --hpw: 220px; --foes-top: 0px; --foes-h: 640px; --foe-b: 40px; --plate-drop: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land{--W: min(calc(var(--cx-w) - 40px), 1360px); --L: calc((var(--cx-w) - var(--W)) / 2); --IW: clamp(280px, calc(var(--W) * .26), 380px); --RX: calc(var(--L) + var(--IW) + 16px); --HX: calc(var(--RX) + 120px); --HWD: calc(var(--L) + var(--W) - var(--HX)); --hpw: 260px; --foes-top: 0px; --foes-h: 720px; --foe-b: 145px; --plate-drop: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .track{left: 8px; top: 60px; flex-direction: column;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .topbar{left: 20px; right: 20px; top: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .track{left: 300px; top: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .party{left: calc((var(--cx-w) - var(--GW)) / 2); top: 750px; width: var(--GW); height: 72px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .lead .face{left: 10px; top: 14px; width: 44px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .lead .info{left: 64px; top: 13px; width: calc(var(--GW) - 208px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .lead .n{font-size: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .lead .n .hp{font-size: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .lead .hpbar{margin-top: 3px; height: 7px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .chips{margin-top: 3px; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .chip{height: 17px; padding: 0 7px; font-size: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .mates{left: auto; right: 10px; top: 0; bottom: 0; width: 122px; flex-direction: column; justify-content: center; gap: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .mate{flex-direction: row; gap: 6px; width: 100%; align-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .mate .mface{width: 20px; height: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .mate .mi{width: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .mate .mn{font-size: 10px; text-align: left;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .hand{left: var(--HL); top: 545px; width: var(--HW); height: 176px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .energy{left: auto; right: calc(var(--HL) + 84px); top: 491px; width: 84px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .energy .v{font-size: 32px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .energy .v small{font-size: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .energy .pips{margin-top: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .energy .pips i{width: 6px; height: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .skill{left: var(--HL); top: 543px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .items{left: calc(var(--HL) + 56px); top: 543px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .piles{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .pile{display: flex; flex-direction: row; align-items: baseline; gap: 5px; top: 725px; height: 18px; font-weight: 700; font-size: 12px; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .pile-d{left: var(--HL);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .pile-x{left: auto; right: var(--HL);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .end{left: auto; right: var(--HL); top: 491px; width: 72px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).port .tray{left: 10px; top: 423px; width: calc(var(--cx-w) - 20px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .track{left: 20px; top: 70px; flex-direction: column;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .topbar .title{min-width: 0; flex: 0 1 auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .topbar .round{flex: none; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .topbar .ic{flex: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .pile{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .pile span{font-size: 12px; font-weight: 400; line-height: 1.2; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .pile b{font-size: 18px; line-height: 1.1; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .pile{color: var(--cream); text-shadow: 0 1px 3px #121212;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .party{left: var(--L); top: 520px; width: var(--IW); height: 170px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .lead .face{left: 6px; top: 8px; width: 72px; height: 72px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .lead .info{left: 92px; top: 12px; width: calc(var(--IW) - 100px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .lead .n{font-size: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .lead .hpbar{margin-top: 6px; height: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .mates{left: 6px; top: 112px; width: calc(var(--IW) - 12px); gap: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .mate{flex: 1; gap: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .mate .mface{width: 36px; height: 36px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .mate .mn{font-size: 13px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .energy{left: var(--RX); top: 588px; width: 100px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .skill{left: var(--RX); top: 640px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .items{left: calc(var(--RX) + 56px); top: 640px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .hand{left: var(--HX); top: 490px; width: var(--HWD); height: 210px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .end{left: auto; right: var(--L); top: 420px; width: 112px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .tray{left: var(--HX); top: 386px; width: 440px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .piles{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .pile{display: flex; flex-direction: row; align-items: baseline; gap: 6px; top: 514px; height: 28px; font-weight: 700; font-size: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .pile-d{left: var(--HX);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .pile-x{left: calc(var(--HX) + 84px);}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-a"]){--ink: #1d1b1e; --surf: #2a272c; --cream: #f6efe4; --cream-2: #e9e0d2; --txt: #38333a; --txt-2: #6f666e; --pink: #f2a1ac; --pink-d: #d9566b; --butter: #f7dc9a; --mint: #a8d8bf; --green: #3f9a78; --red: #e5586d; --c-atk: #d9566b; --c-def: #4f86c6; --c-skl: #3d9c78; --c-pow: #8567c9; --ring: #ffffff; --ring-trk: #f0b8c0; --tray-ac: #f2a1ac; --aim: #f2a1ac; --pile: #f6efe4; --pile-2: #8a808a; --cardbg: #f6efe4; --dupbg: #e9e0d2; --rare: #d9a441; --epic: #d9a441; --myth: #f0b93a; --tmp: #8a808a; --boost: #d9791f; --crown: #d9a441; --fc-bg: #1d1b1e; --fc-blk: #a9c8ee; --fc-vul: #f2a1ac; --chg: #f2a1ac; --chg-trk: #e9e0d2; --charge: .7; background: var(--ink);}
/* 结算三选一奖励牌（ghost）只需类型色，其余变量保持原样（牌底沿用结算页奶色） */
#igs-overlay .igs-cx-ghost[data-cx="soft-a"]{--c-atk: #d9566b; --c-def: #4f86c6; --c-skl: #3d9c78; --c-pow: #8567c9;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-a"]) .stage::after{content: ""; position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(29,27,30,.6) 0, rgba(29,27,30,0) 12%, rgba(29,27,30,0) 52%, rgba(29,27,30,.85) 76%, #1d1b1e 90%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .stage::after{background: linear-gradient(to bottom, rgba(29,27,30,.6) 0, rgba(29,27,30,0) 12%, rgba(29,27,30,0) 50%, rgba(29,27,30,.85) 76%, #1d1b1e 92%) !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .topbar .title{position: relative; overflow: hidden; padding: 5px 16px 5px 34px; border-radius: 999px; background: var(--cream); color: var(--txt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .topbar .title::before{content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 22px; background: repeating-conic-gradient(#f2a1ac 0 25%, #f9d6db 0 50%) 0 0 / 11px 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .topbar .title b{font-size: 15px; letter-spacing: .08em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .topbar .round{padding: 3px 12px; border-radius: 999px; background: var(--ink); font-size: 12px; font-weight: 700; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .topbar .ic{background: var(--ink); color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .track{background: var(--ink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .track .who{box-shadow: 0 0 0 2px var(--surf);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .track .who.now{box-shadow: 0 0 0 3px var(--pink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .track .who.ally{box-shadow: 0 0 0 2px var(--mint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .intent{background: var(--red); color: #fff8f2; border-radius: 999px; height: 30px; padding: 0 14px; box-shadow: 0 3px 0 #b83a50;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .intent b{font-size: 17px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .intent svg{stroke-width: 2.6;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .row2{background: none; color: var(--cream); text-shadow: 0 1px 3px #121012, 0 0 6px #121012;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .row2 .hpbar{background: #2a272c; box-shadow: 0 0 0 1px #121012;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .row2 .hpbar i{background: var(--pink-d);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .fchip{background: var(--cream-2);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .fchip.blk{color: #3f6fae;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .fchip.vul{color: #c04258;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .foes .foe .art .igs-combat-art{filter: drop-shadow(0 8px 14px #121012);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .party{background: var(--cream); color: var(--txt); border-radius: 24px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .lead .face{box-shadow: 0 0 0 2px var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .lead .face .aw{background: var(--pink); color: var(--ink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .lead .hpbar{background: var(--cream-2);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .lead .hpbar i{background: var(--green);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .lead .n .hp{color: var(--txt-2);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .lead .n .hp b{color: var(--green);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .chip{background: var(--cream-2); color: var(--txt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .chip svg{stroke: var(--c-def);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .mate .mface{box-shadow: 0 0 0 2px var(--cream), 0 0 0 3.5px var(--mint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .mate .mn{color: var(--txt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .mate .hpbar{background: var(--cream-2);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .mate .hpbar i{background: var(--green);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .piles{color: #cfc6cb;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .piles b{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card{background: var(--cream); color: var(--txt); box-shadow: 0 6px 12px rgba(18,16,18,.5); border-top: 5px solid var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .cost{background: var(--ink); color: var(--butter);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val b{color: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val em{color: var(--txt-2);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .desc{color: var(--txt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel{box-shadow: 0 0 0 3px var(--pink), 0 12px 22px rgba(18,16,18,.6);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .badge{background: var(--ink); color: var(--butter);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .kw{background: var(--ink); color: var(--butter);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .cost.down{background: var(--green); color: #fff;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .was{color: var(--txt-2);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .energy{border-radius: 999px; background: var(--ink); box-shadow: 0 0 0 2px var(--surf);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .energy .v{color: var(--butter);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .energy .v small{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .energy .pips i{background: var(--butter);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .energy .pips i.off{background: #4a454d;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .skill,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .items{background: var(--ink); color: var(--butter); box-shadow: 0 0 0 2px var(--surf);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .skill .cnt,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .items .cnt{color: var(--butter);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tray{background: var(--cream); color: var(--txt); box-shadow: 0 8px 18px rgba(18,16,18,.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tray .th em{color: var(--txt-2);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tcell{background: var(--cream-2); color: var(--txt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tcell em{color: var(--pink-d);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tcell.pick{background: var(--pink); box-shadow: 0 0 0 2px var(--cream), 0 0 0 4px var(--pink-d);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .tcell.pick em{color: var(--ink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .end{border-radius: 50%; background: var(--pink); color: var(--ink); box-shadow: 0 4px 0 #c9747f;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .end b{font-size: 13px; line-height: 1.12; text-align: center; letter-spacing: .02em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .end::before{content: ""; position: absolute; left: 50%; top: 4px; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: var(--ink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .end b{font-size: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .party{border-radius: 28px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card{--petal: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cg fill='%23000'%3E%3Ccircle cx='20' cy='9.5' r='9'/%3E%3Ccircle cx='30' cy='16.8' r='9'/%3E%3Ccircle cx='26.2' cy='28.5' r='9'/%3E%3Ccircle cx='13.8' cy='28.5' r='9'/%3E%3Ccircle cx='10' cy='16.8' r='9'/%3E%3Ccircle cx='20' cy='20' r='10'/%3E%3C/g%3E%3C/svg%3E"); --print: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cg fill='%23000'%3E%3Ccircle cx='4' cy='2.6' r='1.3'/%3E%3Ccircle cx='5.4' cy='3.8' r='1.3'/%3E%3Ccircle cx='4.8' cy='5.4' r='1.3'/%3E%3Ccircle cx='3.2' cy='5.4' r='1.3'/%3E%3Ccircle cx='2.6' cy='3.8' r='1.3'/%3E%3Ccircle cx='12' cy='10.6' r='1.3'/%3E%3Ccircle cx='13.4' cy='11.8' r='1.3'/%3E%3Ccircle cx='12.8' cy='13.4' r='1.3'/%3E%3Ccircle cx='11.2' cy='13.4' r='1.3'/%3E%3Ccircle cx='10.6' cy='11.8' r='1.3'/%3E%3C/g%3E%3C/svg%3E"); border-top: 0; padding: 0; display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.t-atk{--tc2: #ea8494; --pale: #f9dde1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.t-def{--tc2: #7ea8da; --pale: #dde8f5;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.t-skl{--tc2: #6cbd9b; --pale: #d8eee4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.t-pow{--tc2: #a58ddc; --pale: #e6def5;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .top{display: contents;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .pat{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .win{position: absolute; left: 4px; right: 4px; top: 4px; height: 68px; background: var(--tc2); overflow: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .win::before{content: ""; position: absolute; inset: 4px; background: var(--pale); -webkit-mask: var(--print) 0 0 / 16px 16px repeat; mask: var(--print) 0 0 / 16px 16px repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .win::after{content: ""; position: absolute; inset: 0; pointer-events: none; --pf: 6px; --pr: 1.8px; background-image: radial-gradient(circle at 50% 0, var(--cardbg) var(--pr), transparent calc(var(--pr) + .4px)), radial-gradient(circle at 50% 100%, var(--cardbg) var(--pr), transparent calc(var(--pr) + .4px)), radial-gradient(circle at 0 50%, var(--cardbg) var(--pr), transparent calc(var(--pr) + .4px)), radial-gradient(circle at 100% 50%, var(--cardbg) var(--pr), transparent calc(var(--pr) + .4px)); background-size: var(--pf) var(--pf); background-repeat: repeat-x, repeat-x, repeat-y, repeat-y; background-position: 0 0, 0 100%, 0 0, 100% 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .cost{position: absolute; left: 6px; top: 6px; z-index: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .name{position: absolute; left: 2px; right: 2px; top: 79px; z-index: 3; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .badge{z-index: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val{position: absolute; left: 50%; top: 31px; z-index: 2; width: 36px; height: 36px; margin: 0 0 0 -18px; display: grid; place-items: center; transform: rotate(calc(-1 * var(--rot, 0deg)));}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val::before,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val::after{content: ""; position: absolute; pointer-events: none; -webkit-mask: var(--petal) 50% 46% / 100% 100% no-repeat; mask: var(--petal) 50% 46% / 100% 100% no-repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val::before{inset: 0; background: #f6efe4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val::after{inset: 17%; background: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val b{position: relative; z-index: 1; font-size: 15px; color: #fff8f0 !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val em{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .win{left: 6px; right: 6px; top: 6px; height: 102px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .win::before{inset: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .win::after{--pf: 8px; --pr: 2.4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .cost{left: 9px; top: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .name{top: 116px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .was{position: absolute; left: 38px; top: 13px; z-index: 3; color: #fff8f0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .val{top: 16px; width: 80px; height: 80px; margin-left: -40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .val b{font-size: 28px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .val b.up{padding-right: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .val b.up::after{right: -12px; top: 5px; border-bottom-color: #fff8f0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .val em{display: grid; place-items: center; position: absolute; z-index: 1; right: -4px; bottom: 0; width: 24px; height: 24px; border-radius: 50%; background: var(--cardbg); box-shadow: 0 0 0 2px var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .val em svg{width: 13px; height: 13px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .desc{position: absolute; left: 0; right: 0; top: 136px; margin: 0 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .kws{position: absolute; left: 0; right: 0; bottom: 9px; justify-content: center; margin: 0; padding: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .card:not(.sel) .win{height: 74px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .card:not(.sel) .val{top: 34px; width: 40px; height: 40px; margin-left: -20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .card:not(.sel) .val b{font-size: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .card:not(.sel) .name{top: 86px; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .card.sel .win{height: 112px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .card.sel .val{top: 18px; width: 88px; height: 88px; margin-left: -44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .card.sel .val b{font-size: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .card.sel .name{top: 128px; font-size: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]).land .card.sel .desc{top: 150px; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .val b,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card.sel .val b.up{position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); line-height: 1; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card:not(.sel) .val em{display: none !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-a"],.igs-cx-ghost[data-cx="soft-a"]) .card .cost{box-shadow: 0 0 0 2px var(--cardbg);}
`;
