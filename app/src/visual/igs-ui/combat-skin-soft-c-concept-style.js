// 由 gal/战斗界面设计稿/落盘/gen-skin-css.mjs 从概念稿 soft/common.css、soft/geo.css、soft/方案C.css、soft/卡面.css 生成，不要手改；改设计稿后重新生成。
// 选择器作用域见生成脚本说明，规则内容与设计稿一致（本地图片地址换成 none）。
export const COMBAT_SKIN_SOFT_C_CONCEPT_CSS = `
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) *{box-sizing: border-box;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]){margin: 0; background: #2b292d; font-family: "ChillRoundF", "Microsoft YaHei", sans-serif; color: #f6f0e8;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) body.shot #bar{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) body.shot #wrap{padding: 0; justify-content: flex-start;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-c"]){position: relative; overflow: hidden; flex: none; font-synthesis: none; user-select: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-c"]).port{width: 390px; height: 844px;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-c"]).land{width: 1280px; height: 720px;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-c"]) button{font-family: inherit; cursor: pointer;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-c"]) .stage{position: absolute; inset: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-c"]) .stage .bgi{position: absolute; inset: 0; background: none 38% center / cover; filter: brightness(.78) saturate(.7);}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-c"]) .stage .vig{position: absolute; inset: 0; background: radial-gradient(ellipse 75% 70% at 50% 45%, rgba(18,16,18,0) 55%, rgba(18,16,18,.5) 100%);}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-c"]) svg{fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .face-t1,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .face-t2{display: grid; place-items: center; font-weight: 700; color: #1d1b1e;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .face-t1{background: #f2b8a8;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .face-t2{background: #b9dcc4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .track .who{position: relative; border-radius: 50%; overflow: hidden; flex: none; display: grid; place-items: center; font-size: 11px; font-weight: 700; color: #1d1b1e;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .track .who .igs-combat-art{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes{position: absolute; left: 0; right: 0; top: var(--foes-top); height: var(--foes-h); z-index: 2; touch-action: pan-y;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe{position: absolute; left: 50%; bottom: calc(var(--foe-b) + var(--fb, 0px)); width: var(--w, 200px); z-index: var(--fz, 1); transform: translateX(calc(-50% + var(--fx, 0px))) scale(var(--fs, 1)); transform-origin: 50% 100%; cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .art{position: relative; width: 100%; height: calc(var(--w, 200px) * 1.3); filter: brightness(var(--fl, 1)) saturate(var(--fsat, 1));}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .art .igs-combat-art{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .plate{position: absolute; left: 50%; bottom: calc(100% - var(--plate-drop, 0px)); width: 184px; margin: 0 0 0 -92px; display: flex; flex-direction: column; align-items: center; opacity: var(--fi, 1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .intent{display: flex; align-items: center; gap: 5px; height: 26px; padding: 0 12px; margin-bottom: 6px; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .intent svg{width: 14px; height: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .intent b{font-size: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .intent em{font-size: 11px; font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .n{width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 0 4px; font-size: 16px; font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .n .hpn{font-size: 12px;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-c"]) .crown{width: 14px; height: 14px; fill: var(--crown, #f7dc9a); stroke: none; margin-right: 5px; vertical-align: -1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .fchips{display: flex; gap: 6px; margin-top: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .fchip{display: inline-flex; align-items: center; gap: 3px; height: 20px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .fchip svg{width: 11px; height: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .hpbar{position: relative; height: 8px; border-radius: 999px; overflow: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .hpbar i{position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .hpbar.thin{height: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .deck{position: absolute; inset: 0; z-index: 4; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .deck > *{position: absolute; pointer-events: auto;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .face{position: relative; flex: none; border: 0; padding: 0; border-radius: 50%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .face .aw{position: absolute; left: 50%; bottom: -9px; transform: translateX(-50%); padding: 0 9px; height: 17px; border-radius: 999px; font: 700 10px/17px "ChillRoundF", sans-serif; letter-spacing: .1em; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .lead{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .lead .face,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .lead .info{position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .lead .n{display: flex; align-items: baseline; font-size: 17px; font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .lead .n .hp{margin-left: auto; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .chips{display: flex; gap: 6px; margin-top: 7px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .chip{display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 9px; border-radius: 999px; font-size: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .chip svg{width: 11px; height: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .mates{position: absolute; display: flex;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .mate{display: flex; align-items: center; gap: 7px; min-width: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .mate .mface{width: 28px; height: 28px; flex: none; border-radius: 50%; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .mate .mi{flex: 1; min-width: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .mate .mn{font-size: 11px; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .items{position: absolute; border: 0; padding: 0; display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .items svg{width: 16px; height: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .items .badge{position: absolute; right: -3px; top: -4px; min-width: 15px; height: 15px; border-radius: 999px; font-size: 10px; font-style: normal; display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .piles{font-size: 11px; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .piles b{font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .hand{position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card{position: absolute; border-radius: 12px; cursor: pointer; display: flex; flex-direction: column; align-items: center; padding: 8px 0 8px; transform-origin: 50% 130%; transition: transform .22s cubic-bezier(.2,.8,.2,1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .top{display: flex; flex-direction: column; align-items: flex-start; gap: 3px; width: 100%; padding: 0 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .cost{flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 700; font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .was{display: none; font-size: 12px; font-weight: 700; opacity: .7;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .name{max-width: 100%; font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .pat{flex: 1; display: grid; place-items: center; width: 100%; opacity: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .pat svg{width: 26px; height: 26px; stroke: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .pat .fl{fill: var(--tc); stroke: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .pat .ln{fill: none; stroke: var(--tc); stroke-width: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val{display: flex; align-items: baseline; gap: 2px; margin-top: auto;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val b{font-size: 24px; line-height: 1; font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val em{display: none; font-size: 10px; font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .desc,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .kws{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .badge{position: absolute; right: 4px; top: 6px; min-width: 20px; height: 16px; padding: 0 5px; border-radius: 999px; font-size: 10px; font-style: normal; font-weight: 700; display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.t-atk{--tc: var(--c-atk);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.t-def{--tc: var(--c-def);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.t-skl{--tc: var(--c-skl);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.t-pow{--tc: var(--c-pow);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.r-rare .cost{box-shadow: 0 0 0 2px var(--cardbg), 0 0 0 3.5px var(--rare);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.r-epic .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.r-myth .cost{box-shadow: 0 0 0 2px var(--cardbg), 0 0 0 3.5px var(--rare), 0 0 0 5px var(--cardbg), 0 0 0 6.5px var(--epic);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.r-epic{outline: 2px solid var(--epic); outline-offset: -2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.r-myth{outline: 3px solid var(--myth); outline-offset: -3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.tmp::after{content: ""; position: absolute; inset: 4px; border-radius: 9px; border: 1.5px dashed var(--tmp); pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.dup::after{content: ""; position: absolute; left: 8px; right: 8px; top: -6px; height: 6px; border-radius: 9px 9px 0 0; background: var(--dupbg, var(--cardbg));}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel.dup::after{left: 14px; right: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel{padding: 10px 0 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .top{flex-direction: row; justify-content: flex-start; gap: 6px; padding: 0 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .name{font-size: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .was{display: inline; text-decoration: line-through;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .pat{opacity: 1; flex: none; height: 50px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .pat svg{width: 40px; height: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .val{margin-top: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .val b{font-size: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .val b.up{padding-right: 14px; position: relative; color: var(--boost);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .val b.up::after{content: ""; position: absolute; right: 0; top: 4px; border: 5px solid transparent; border-bottom: 8px solid var(--boost); border-top: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .val em{display: inline;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .desc{display: block; margin: 5px 9px 0; font-size: 11px; line-height: 1.45; text-align: center; align-self: stretch;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .kws{display: flex; gap: 6px; margin-top: auto; padding-top: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .kw{width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700; font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tipbox{position: absolute; z-index: 90; display: none; width: 180px; padding: 6px 10px; border-radius: 10px; font-size: 11px; line-height: 1.4; background: var(--cream, #f6f0e8); color: #38333a; box-shadow: 0 6px 14px rgba(0,0,0,.45); pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tipbox.on{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .energy .v{font-size: 30px; font-weight: 700; line-height: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .energy .v small{font-size: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .energy .pips{display: flex; gap: 6px; margin-top: 6px; justify-content: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .energy .pips i{width: 8px; height: 8px; transform: rotate(45deg); border-radius: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .energy{display: flex; flex-direction: column; align-items: center; justify-content: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .end{border: 0; padding: 0; display: grid; place-items: center; overflow: visible;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .end b{position: relative; font-size: 15px; font-weight: 700; letter-spacing: .04em; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .end .ring{position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .end .ring rect{fill: none; stroke-width: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .end .ring .trk{stroke: var(--ring-trk, transparent);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .end .ring .prog{stroke: var(--ring, #fff); stroke-dasharray: 100; stroke-dashoffset: 100;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .end.holding .ring .prog{stroke-dashoffset: 0; transition: stroke-dashoffset .4s linear;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .end.holding{transform: translateY(2px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .desc .ty{display: table; margin: 0 0 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .end .ring .prog{opacity: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .end.holding .ring .prog{opacity: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .hpbar{width: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .face .chg{position: absolute; inset: -6px; border-radius: 50%; background: conic-gradient(var(--chg, #f7dc9a) calc(var(--charge, .7) * 360deg), var(--chg-trk, #4a454d) 0); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .skill{position: absolute; border: 0; padding: 0; border-radius: 50%; display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .skill svg{width: 18px; height: 18px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .skill .badge{position: absolute; right: -3px; top: -4px; min-width: 15px; height: 15px; border-radius: 999px; font-size: 10px; font-style: normal; display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .fchip{background: var(--fc-bg, #1d1b1e);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .fchip.blk{color: var(--fc-blk, #a9c8ee);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .fchip.vul{color: var(--fc-vul, #f2a1ac);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .plate{width: max-content; max-width: none; margin-left: 0; transform: translateX(-50%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .row2{display: flex; align-items: center; gap: 7px; width: max-content; height: 26px; padding: 0 8px 0 10px; border-radius: 999px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .row2 .nm{flex: none; font-size: 15px; font-weight: 700; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .row2 .hpbar{flex: none; width: var(--hpw, 220px); margin: 0; height: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .row2 .fchip{flex: none; height: 18px; padding: 0 6px; gap: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .intent{margin-bottom: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .intent{border-left: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val em{display: none; line-height: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val em .ui{width: 13px; height: 13px; fill: currentColor; stroke: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val{align-items: center; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card:not(.sel) .val em{display: inline-flex;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card:not(.sel) .val em .ui{width: 11px; height: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .val em .ui{width: 15px; height: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .skill,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .items{position: absolute; border: 0; padding: 0; width: 44px; height: 46px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .skill svg,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .items svg{width: 19px; height: 19px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .skill .cnt,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .items .cnt{font-style: normal; font-size: 11px; font-weight: 700; line-height: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .items.on{transform: translateY(1px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).tray-on .items{outline: 2px solid var(--tray-ac, #fff); outline-offset: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tray{display: none; z-index: 70 !important; padding: 8px; border-radius: 18px; flex-direction: column; gap: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).tray-on .tray{display: flex;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tray .th{display: flex; align-items: baseline; gap: 8px; font-size: 12px; font-weight: 700; padding: 0 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tray .th em{font-style: normal; font-size: 10px; font-weight: 400;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tcells{display: flex; gap: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tcell{position: relative; flex: 1; height: 62px; border: 0; border-radius: 14px; padding: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tcell svg{width: 20px; height: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tcell b{font-size: 11px; font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tcell em{font-style: normal; font-size: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tcell .tg{position: absolute; right: 6px; top: 6px; width: 6px; height: 6px; border-radius: 50%; background: currentColor;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tcell.off{filter: brightness(.5) saturate(.5); cursor: default;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).tray-on .hand .card.sel{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .pick-tg .foes .foe.front .row2{outline: 3px solid var(--aim, #fff); outline-offset: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .skill,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .items{width: 38px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val em .ui{width: 13px !important; height: 13px !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .face .aw{bottom: -4px; height: 15px; line-height: 15px; font-size: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .lead .face{top: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .face .chg{inset: -4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .foes .foe .row2{max-width: 340px; height: auto; min-height: 26px; flex-wrap: wrap; justify-content: center; row-gap: 3px; padding-top: 4px; padding-bottom: 4px; border-radius: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card{border-radius: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel{border-radius: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.tmp::after{border-radius: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.dup::after{border-radius: 4px 4px 0 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .topbar{position: absolute; z-index: 5; left: 12px; right: 12px; top: 12px; height: 32px; display: flex; align-items: center; gap: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .topbar .sp{flex: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .topbar .ic{min-width: 30px; height: 30px; padding: 0 6px; display: grid; place-items: center; border-radius: 999px; font-size: 12px; font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .topbar .ic svg{width: 14px; height: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .track{position: absolute; z-index: 5; display: flex; align-items: center; gap: 7px; padding: 6px; border-radius: 999px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .track .who{width: 28px; height: 28px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .track .who.now{width: 34px; height: 34px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port{--hpw: 220px; --foes-top: 0px; --foes-h: 640px; --foe-b: 40px; --plate-drop: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land{--hpw: 260px; --foes-top: 0px; --foes-h: 720px; --foe-b: 145px; --plate-drop: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .track{left: 8px; top: 60px; flex-direction: column;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .topbar{left: 20px; right: 20px; top: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .track{left: 300px; top: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .party{left: 8px; top: 756px; width: 374px; height: 56px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .lead .face{left: 10px; top: 6px; width: 44px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .lead .info{left: 64px; top: 5px; width: 104px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .lead .n{font-size: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .lead .n .hp{font-size: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .lead .hpbar{margin-top: 3px; height: 7px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .chips{margin-top: 3px; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .chip{height: 17px; padding: 0 7px; font-size: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .mates{left: 178px; top: 6px; width: 188px; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .mate{flex-direction: column; gap: 3px; width: 60px; align-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .mate .mface{width: 28px; height: 28px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .mate .mi{width: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .mate .mn{font-size: 9px; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .hand{left: 0; top: 559px; width: 390px; height: 176px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .energy{left: 10px; top: 561px; width: 66px; height: 46px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .energy .v{font-size: 22px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .energy .v small{font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .energy .pips{margin-top: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .energy .pips i{width: 6px; height: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .skill{left: 84px; top: 561px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .items{left: 126px; top: 561px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .piles{left: 12px; top: 527px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .end{left: 326px; top: 557px; width: 52px; height: 52px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .tray{left: 10px; top: 461px; width: 370px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .party{left: 20px; top: 538px; width: 310px; height: 150px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .lead .face{left: 14px; top: 12px; width: 64px; height: 64px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .lead .info{left: 94px; top: 12px; width: 170px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .mates{left: 14px; top: 94px; width: 282px; gap: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .mate{flex: 1; gap: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .mate .mface{width: 28px; height: 28px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .mate .mn{font-size: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .hand{left: 340px; top: 470px; width: 600px; height: 220px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .energy{left: 352px; top: 495px; width: 84px; height: 56px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .skill{left: 446px; top: 501px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .items{left: 500px; top: 501px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .piles{left: 354px; top: 461px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .end{left: 1170px; top: 596px; width: 60px; height: 60px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .tray{left: 340px; top: 381px; width: 440px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .skill{left: 1050px; top: 603px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .items{left: 1104px; top: 603px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .piles{left: 1050px; top: 664px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .tray{left: 790px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .track{left: 20px; top: 70px; flex-direction: column;}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-c"]){--page: #1d1b1e; --surf: #2a272c; --card: #37323b; --cream: #f6f0e8; --dim: #b3aab0; --txt: #38333a; --pink: #f08a9a; --red: #e5586d; --butter: #f7dc9a; --mint: #8fd3b2; --green: #62c29c; --c-atk: #d9566b; --c-def: #4f86c6; --c-skl: #3d9c78; --c-pow: #8567c9; --ring: #ffffff; --ring-trk: #f2a9b6; --tray-ac: #f08a9a; --aim: #f08a9a; --pile: #f6f0e8; --pile-2: #8a808a; --cardbg: #37323b; --dupbg: #4a454d; --rare: #f7dc9a; --epic: #f7dc9a; --myth: #f08a9a; --tmp: #b3aab0; --boost: #f7dc9a; --crown: #d9a441; --fc-bg: #1d1b1e; --fc-blk: #a9c8ee; --fc-vul: #f2a1ac; --chg: #f08a9a; --chg-trk: #4a454d; --charge: .7; background: var(--page);}
#igs-overlay #igs-cx-canvas:where([data-cx="soft-c"]) .stage::after{content: ""; position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(29,27,30,.6) 0, rgba(29,27,30,0) 12%, rgba(29,27,30,0) 52%, rgba(29,27,30,.85) 76%, #1d1b1e 90%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .topbar{top: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .topbar{top: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .topbar .title{padding: 5px 16px; border-radius: 999px; background: var(--pink); color: var(--page);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .topbar .title b{font-size: 15px; letter-spacing: .08em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .topbar .round{padding: 4px 12px; border-radius: 999px; background: var(--surf); font-size: 12px; font-weight: 700; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .topbar .ic{background: var(--surf); color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .track{background: var(--surf);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .track .who.now{box-shadow: 0 0 0 3px var(--pink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .track .who.ally{box-shadow: 0 0 0 2px var(--mint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).port .track{top: 64px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .track{left: 460px; top: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .intent{background: var(--red); color: #fff8f2; border-radius: 999px; height: 30px; padding: 0 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .intent b{font-size: 17px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .intent svg{stroke-width: 2.6;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .row2{background: none; color: var(--cream); text-shadow: 0 1px 3px #121012, 0 0 6px #121012;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .row2 .hpbar{background: #2a272c; box-shadow: 0 0 0 1px #121012;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .row2 .hpbar i{background: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .fchip{background: #e1d6d0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .fchip.blk{color: #3f6fae;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .fchip.vul{color: #c04258;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .foes .foe .art .igs-combat-art{filter: drop-shadow(0 8px 12px #121012);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .party{color: var(--cream); background: var(--surf); border-radius: 29px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .lead .face{box-shadow: 0 0 0 2px var(--surf);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .lead .face .aw{background: var(--pink); color: var(--page);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .lead .hpbar{background: #4a454d;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .lead .hpbar i{background: var(--green);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .lead .n .hp{color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .lead .n .hp b{color: var(--green);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .chip{background: #4a454d; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .chip svg{stroke: #8db8ee;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .mate .mface{box-shadow: 0 0 0 2px var(--surf), 0 0 0 3.5px var(--mint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .mate .mn{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .mate .hpbar{background: #4a454d;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .mate .hpbar i{background: var(--green);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .piles{color: #cfc6cb;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .piles b{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card{background: var(--card); color: var(--cream); box-shadow: 0 6px 12px rgba(10,9,10,.55); border-top: 4px solid var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .cost{background: var(--pink); color: var(--page);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .pat{position: relative;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .pat::before{content: ""; position: absolute; width: 30px; height: 30px; border-radius: 50%; background: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .pat svg{position: relative; width: 17px; height: 17px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .pat::before{width: 48px; height: 48px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .pat svg{width: 28px; height: 28px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val b{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val em{color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .desc{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel{box-shadow: 0 0 0 3px var(--pink), 0 12px 20px rgba(10,9,10,.6);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .badge{background: var(--pink); color: var(--page);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .kw{background: var(--pink); color: var(--page);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .cost.down{background: var(--green); color: var(--page);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .was{color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .val b.up{color: var(--butter);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .energy{border-radius: 999px; background: var(--surf); color: var(--butter);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .energy .v small{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .energy .pips i{background: var(--butter);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .energy .pips i.off{background: #4a454d;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .skill,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .items{background: var(--surf); color: var(--cream); box-shadow: 0 0 0 2px #4a454d;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .skill .cnt,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .items .cnt{color: var(--butter);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tray{background: var(--surf); color: var(--cream); box-shadow: 0 0 0 2px #4a454d, 0 8px 18px rgba(10,9,10,.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tray .th em{color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tcell{background: #4a454d; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tcell em{color: var(--butter);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tcell.pick{background: var(--pink); color: var(--page); box-shadow: 0 0 0 2px var(--surf), 0 0 0 4px var(--pink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .tcell.pick em{color: var(--page);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .end{border-radius: 16px; background: var(--red); color: #fff8f2; box-shadow: 0 4px 0 #b3394e; overflow: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .end b{font-size: 13px; line-height: 1.12; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .end::before{content: ""; position: absolute; right: 0; bottom: 0; width: 15px; height: 15px; background: linear-gradient(135deg, #b3394e 0 50%, var(--butter) 50% 100%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .end b{font-size: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .party{border-radius: 32px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card{--petal: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cg fill='%23000'%3E%3Ccircle cx='20' cy='9.5' r='9'/%3E%3Ccircle cx='30' cy='16.8' r='9'/%3E%3Ccircle cx='26.2' cy='28.5' r='9'/%3E%3Ccircle cx='13.8' cy='28.5' r='9'/%3E%3Ccircle cx='10' cy='16.8' r='9'/%3E%3Ccircle cx='20' cy='20' r='10'/%3E%3C/g%3E%3C/svg%3E"); --print: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cg fill='%23000'%3E%3Ccircle cx='4' cy='2.6' r='1.3'/%3E%3Ccircle cx='5.4' cy='3.8' r='1.3'/%3E%3Ccircle cx='4.8' cy='5.4' r='1.3'/%3E%3Ccircle cx='3.2' cy='5.4' r='1.3'/%3E%3Ccircle cx='2.6' cy='3.8' r='1.3'/%3E%3Ccircle cx='12' cy='10.6' r='1.3'/%3E%3Ccircle cx='13.4' cy='11.8' r='1.3'/%3E%3Ccircle cx='12.8' cy='13.4' r='1.3'/%3E%3Ccircle cx='11.2' cy='13.4' r='1.3'/%3E%3Ccircle cx='10.6' cy='11.8' r='1.3'/%3E%3C/g%3E%3C/svg%3E"); border-top: 0; padding: 0; display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.t-atk{--tc2: #ea8494; --pale: #f9dde1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.t-def{--tc2: #7ea8da; --pale: #dde8f5;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.t-skl{--tc2: #6cbd9b; --pale: #d8eee4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.t-pow{--tc2: #a58ddc; --pale: #e6def5;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .top{display: contents;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .pat{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .win{position: absolute; left: 4px; right: 4px; top: 4px; height: 68px; background: var(--tc2); overflow: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .win::before{content: ""; position: absolute; inset: 4px; background: var(--pale); -webkit-mask: var(--print) 0 0 / 16px 16px repeat; mask: var(--print) 0 0 / 16px 16px repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .win::after{content: ""; position: absolute; inset: 0; pointer-events: none; --pf: 6px; --pr: 1.8px; background-image: radial-gradient(circle at 50% 0, var(--cardbg) var(--pr), transparent calc(var(--pr) + .4px)), radial-gradient(circle at 50% 100%, var(--cardbg) var(--pr), transparent calc(var(--pr) + .4px)), radial-gradient(circle at 0 50%, var(--cardbg) var(--pr), transparent calc(var(--pr) + .4px)), radial-gradient(circle at 100% 50%, var(--cardbg) var(--pr), transparent calc(var(--pr) + .4px)); background-size: var(--pf) var(--pf); background-repeat: repeat-x, repeat-x, repeat-y, repeat-y; background-position: 0 0, 0 100%, 0 0, 100% 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .cost{position: absolute; left: 6px; top: 6px; z-index: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .name{position: absolute; left: 2px; right: 2px; top: 79px; z-index: 3; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .badge{z-index: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val{position: absolute; left: 50%; top: 31px; z-index: 2; width: 36px; height: 36px; margin: 0 0 0 -18px; display: grid; place-items: center; transform: rotate(calc(-1 * var(--rot, 0deg)));}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val::before,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val::after{content: ""; position: absolute; pointer-events: none; -webkit-mask: var(--petal) 50% 46% / 100% 100% no-repeat; mask: var(--petal) 50% 46% / 100% 100% no-repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val::before{inset: 0; background: #f6efe4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val::after{inset: 17%; background: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val b{position: relative; z-index: 1; font-size: 15px; color: #fff8f0 !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val em{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .win{left: 6px; right: 6px; top: 6px; height: 102px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .win::before{inset: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .win::after{--pf: 8px; --pr: 2.4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .cost{left: 9px; top: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .name{top: 116px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .was{position: absolute; left: 38px; top: 13px; z-index: 3; color: #fff8f0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .val{top: 16px; width: 80px; height: 80px; margin-left: -40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .val b{font-size: 28px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .val b.up{padding-right: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .val b.up::after{right: -12px; top: 5px; border-bottom-color: #fff8f0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .val em{display: grid; place-items: center; position: absolute; z-index: 1; right: -4px; bottom: 0; width: 24px; height: 24px; border-radius: 50%; background: var(--cardbg); box-shadow: 0 0 0 2px var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .val em svg{width: 13px; height: 13px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .desc{position: absolute; left: 0; right: 0; top: 136px; margin: 0 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .kws{position: absolute; left: 0; right: 0; bottom: 9px; justify-content: center; margin: 0; padding: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .card:not(.sel) .win{height: 74px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .card:not(.sel) .val{top: 34px; width: 40px; height: 40px; margin-left: -20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .card:not(.sel) .val b{font-size: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .card:not(.sel) .name{top: 86px; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .card.sel .win{height: 112px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .card.sel .val{top: 18px; width: 88px; height: 88px; margin-left: -44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .card.sel .val b{font-size: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .card.sel .name{top: 128px; font-size: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]).land .card.sel .desc{top: 150px; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .val b,#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card.sel .val b.up{position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); line-height: 1; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card:not(.sel) .val em{display: none !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="soft-c"],.igs-cx-ghost[data-cx="soft-c"]) .card .cost{box-shadow: 0 0 0 2px var(--cardbg);}
`;
