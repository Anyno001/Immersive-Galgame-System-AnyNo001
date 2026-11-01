// 由 gal/战斗界面设计稿/落盘/gen-skin-css.mjs 从概念稿 comic/base.css、comic/定稿.css 生成，不要手改；改设计稿后重新生成。
// 选择器作用域见生成脚本说明，规则内容与设计稿一致（本地图片地址换成 none）。
export const COMBAT_SKIN_COMIC_CONCEPT_CSS = `
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]){--ink: #121214; --cream: #f4f2ec; --text: #ecebe6; --dim: #9a9993; --red: #ee4a42; --jade: #6fe0b4; --blue: #6fb0ff; --violet: #b48cff; --gold: #f2c45a; --acc: #f2c45a; --acc-ink: #121214; --paper: #0a0a0b; --plate: #17181b; --cbg: #1d1e22; --buff: #6fe0b4; --num: "Bahnschrift", "DIN Alternate", "Noto Sans SC", "Microsoft YaHei", sans-serif; --disp: "IGS-PangMen", "Noto Sans SC", "Microsoft YaHei", sans-serif;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) *{box-sizing: border-box;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]){margin: 0; background: #0c0c0e; color: var(--text); font: 13px/1.4 "Noto Sans SC", "Microsoft YaHei", sans-serif;}
#igs-overlay #igs-cx-canvas:where([data-cx="comic"]){position: relative; width: 390px; height: 844px; overflow: hidden; background: var(--paper);}
#igs-overlay #igs-cx-canvas:where([data-cx="comic"]).land{width: 1280px; height: 720px;}
#igs-overlay #igs-cx-canvas:where([data-cx="comic"]) > *{position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) button{font: inherit; color: inherit; border: 0; padding: 0; cursor: pointer; background-color: transparent;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) svg{fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .stage{inset: 0; z-index: 0; background: none 0 0 / 100% 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .stage{background-image: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .decor{inset: 0; z-index: 1; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .decor i{position: absolute; display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .veil{inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(to bottom, rgba(10,10,12,.7) 0, rgba(10,10,12,0) 13%, rgba(10,10,12,0) 54%, rgba(10,10,12,.78) 76%, rgba(10,10,12,.95) 100%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .veil{background: linear-gradient(to bottom, rgba(10,10,12,.7) 0, rgba(10,10,12,0) 14%, rgba(10,10,12,0) 56%, rgba(10,10,12,.8) 78%, rgba(10,10,12,.95) 100%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .track,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pending,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mates,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .items,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .piles{z-index: 5;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top{left: 12px; right: 10px; top: 8px; height: 36px; display: flex; align-items: center; gap: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .sp{flex: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .round{display: flex; align-items: baseline; gap: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .round small{font-size: 11px; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .spd{font: 800 12px var(--num); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .retreat{display: flex; align-items: center; gap: 4px; height: 28px; padding: 0 8px; background: var(--paper); font-size: 11px; color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .retreat svg{width: 13px; height: 13px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .ctl{width: 28px; height: 28px; display: grid; place-items: center; background: var(--paper);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .ctl svg{width: 13px; height: 13px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .track{left: 10px; top: 56px; width: 34px; display: flex; flex-direction: column; gap: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .who{position: relative; display: block; width: 26px; height: 26px; overflow: hidden; border-radius: 50%; background-color: #232429; box-shadow: 0 0 0 2px var(--paper), 0 0 0 3.5px var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .who.now{width: 34px; height: 34px; margin-left: -4px; box-shadow: 0 0 0 2px var(--acc), 0 0 0 4px var(--paper);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .who.ally{box-shadow: 0 0 0 2px var(--jade), 0 0 0 3.5px var(--paper);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .who .igs-combat-art{position: absolute; left: 12.5%; top: 0; width: 75%; height: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foes{inset: 0; z-index: 2; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foes .foe{position: absolute; left: 50%; bottom: calc(var(--base, 0px) + var(--fb, 0px)); width: var(--w); z-index: var(--fz, 1); cursor: pointer; pointer-events: auto; transform: translateX(calc(-50% + var(--fx, 0px))) scale(var(--fs, 1)); transform-origin: 50% 100%; --hoff: .068;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe.f2{--hoff: .075;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe.f3{--hoff: .055;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .art{position: relative; width: 100%; height: calc(var(--w) * 1.3); filter: brightness(var(--fl, 1)) saturate(var(--fsat, 1));}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .art .igs-combat-art{position: absolute; inset: 0; filter: drop-shadow(0 8px 14px rgba(0,0,0,.6));}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .head{position: absolute; left: 50%; bottom: calc(100% - var(--w) * 1.3 * var(--hoff)); width: 172px; margin-left: -86px; display: flex; flex-direction: column; align-items: center; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent{display: flex; align-items: center; gap: 5px; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent svg{width: 14px; height: 14px; stroke: var(--red); stroke-width: 2.4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .plate{width: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .plate .n{display: flex; align-items: baseline; gap: 6px; font-weight: 900; font-size: 16px; line-height: 1.2; text-shadow: 0 0 3px #000, 0 0 3px #000, 0 1px 6px #000;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .plate .n .hp{margin-left: auto; font: 800 12px var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .tier{text-shadow: none; display: inline-flex; align-items: center; gap: 2px; font: 800 10px var(--num); font-style: normal; padding: 0 5px; background: var(--acc); color: var(--acc-ink); letter-spacing: .1em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .tier i{width: 5px; height: 5px; border: 1px solid var(--acc-ink); transform: rotate(45deg); margin-left: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .tier i.on{background: var(--acc-ink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .bars{display: flex; align-items: center; gap: 4px; margin-top: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .blk{display: inline-flex; align-items: center; gap: 1px; padding: 0 4px 0 3px; height: 14px; background: var(--paper); color: var(--blue); font: 900 11px var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .blk svg{width: 10px; height: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .st{display: inline-flex; align-items: baseline; gap: 1px; padding: 0 4px; height: 14px; line-height: 14px; background: var(--paper); font-size: 10px; color: var(--text); white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .st b{font: 900 11px var(--num); color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .hpbar{position: relative; flex: 1; height: 8px; background: #050506; overflow: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .hpbar i{display: block; height: 100%; background: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .hpbar.ally i{background: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .hpbar{opacity: var(--fp, 1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe.rear .head{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pending{display: flex; align-items: center; justify-content: flex-end; gap: 4px; height: 18px; font-size: 11px; color: var(--text); text-shadow: 0 0 3px #000, 0 0 3px #000; border-bottom: 1.5px solid var(--acc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pending b{font: 900 12px var(--num); color: var(--acc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy .v{font: 900 30px/1 var(--num); font-style: italic; color: var(--acc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy .v small{font-size: 13px; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy .pips{display: flex; gap: 5px; margin-top: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy .pips i{width: 9px; height: 9px; background: var(--acc); transform: rotate(45deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy .pips i.off{background: #3a3b40;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end{display: grid; place-items: center; overflow: visible; background: var(--acc); color: var(--acc-ink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end b{font: 400 16px/1 var(--disp); letter-spacing: .05em; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end .hold{position: absolute; left: -4px; top: -4px; width: calc(100% + 8px); height: calc(100% + 8px); overflow: visible; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end .hold rect{x: 2px; y: 2px; width: calc(100% - 4px); height: calc(100% - 4px); rx: 3px; fill: none; stroke-width: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end .hold .trk{stroke: #3a3b40;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end .hold .prg{stroke: var(--cream); stroke-dasharray: 0 100;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .hand{z-index: 4; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .hand .card{position: absolute; bottom: 0; width: var(--cw); height: var(--ch); pointer-events: auto; cursor: pointer; background: var(--cbg); border-radius: 5px; transform: translateY(var(--tx, 0)) rotate(var(--rot, 0deg)); transform-origin: 50% 100%; box-shadow: inset 0 0 0 1.5px var(--rc, transparent), 0 2px 8px rgba(0,0,0,.6);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.t-atk{--tc: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.t-def{--tc: var(--blue);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.t-skl{--tc: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.t-pow{--tc: var(--violet);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-uncommon{--rc: #8e8d88;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-rare{--rc: var(--blue);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-epic{--rc: var(--violet);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth{--rc: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own{--rc: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign{--rc: #ff9f43;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.poor{filter: brightness(.6) saturate(.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.temp{outline: 1.5px dashed var(--cream); outline-offset: -4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.stack{box-shadow: inset 0 0 0 1.5px var(--rc, transparent), 0 -4px 0 -1px #2c2e35, 0 -7px 0 -3px #23242a, 0 2px 8px rgba(0,0,0,.6);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .tab{position: absolute; left: 0; top: 0; width: calc(var(--vis) / var(--ts, 1)); height: calc(var(--ch) / var(--ts, 1)); transform: scale(var(--ts, 1)); transform-origin: 0 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .full{display: none; position: absolute; left: 0; top: 0; width: 112px; height: 176px; transform: scale(var(--fs, 1)); transform-origin: 0 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.sel{width: var(--sw); height: var(--sh); transform: translateY(-8px) rotate(0deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.sel .tab{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.sel .full{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost{position: absolute; left: 4px; top: 5px; width: 22px; height: 22px; text-align: center; background: var(--acc); color: var(--acc-ink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost b{font: 900 14px/22px var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost s{position: absolute; left: 4px; top: 100%; font: 700 10px/1 var(--num); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost.cut{background: var(--buff);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .tab .name{position: absolute; left: 0; top: 31px; width: 100%; padding: 0 2px; text-align: center; font: 900 11px/12px "Noto Sans SC", sans-serif; color: var(--cream); word-break: break-all;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .tab .val{position: absolute; left: 0; bottom: 9px; width: 100%; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .tab .val b{display: block; font: 900 27px/1 var(--num); font-style: italic; color: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.buff .val b{color: var(--buff);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .tab .val em{display: block; font: 600 10px/1 "Noto Sans SC", sans-serif; color: var(--dim); margin-top: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .bd{position: absolute; left: calc(var(--vis) / var(--ts, 1) - 20px); top: 5px; min-width: 16px; height: 16px; padding: 0 3px; font: 900 10px/16px var(--num); font-style: normal; text-align: center; background: var(--cream); color: var(--ink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .bd.pick{width: 14px; min-width: 14px; height: 14px; padding: 0; border-radius: 50%; background: transparent; border: 2px solid var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .bd.pick.on{background: var(--acc); border-color: var(--acc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .cost{left: 6px; top: 6px; width: 26px; height: 26px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .cost b{font-size: 16px; line-height: 26px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .cost s{left: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .name{position: absolute; left: 38px; right: 6px; top: 8px; font: 900 14px/1.2 "Noto Sans SC", sans-serif; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .motif{position: absolute; left: 50%; top: 42px; width: 50px; height: 50px; margin-left: -25px; color: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .motif svg{width: 100%; height: 100%; fill: currentColor; stroke: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .val{position: absolute; left: 0; right: 0; top: 96px; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .val b{font: 900 32px/1 var(--num); font-style: italic; color: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.buff .full .val b{color: var(--buff);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .val em{margin-left: 3px; font: 600 11px "Noto Sans SC", sans-serif; font-style: normal; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .bonus{position: absolute; left: 0; right: 0; top: 132px; text-align: center; font: 600 10px var(--num); color: var(--buff); text-decoration: underline dotted;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .desc{position: absolute; left: 8px; right: 8px; top: 146px; margin: 0; font-size: 10px; line-height: 1.35; color: var(--text); text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .desc b{font-family: var(--num); color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .kw{position: absolute; right: 6px; top: 44px; display: flex; flex-direction: column; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .kw i{display: grid; place-items: center; width: 17px; height: 17px; border-radius: 50%; background: #3a3b40; color: var(--cream); font: 800 10px/1 "Noto Sans SC", sans-serif; font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead{left: 10px; top: 756px; width: 216px; height: 66px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .face{position: absolute; left: 4px; top: 4px; width: 54px; height: 54px; border-radius: 50%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .chg{position: absolute; inset: -5px; border-radius: 50%; background: conic-gradient(var(--acc) 0 74%, #3a3b40 74% 100%); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px)); mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 3px));}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .aw{position: absolute; left: 50%; bottom: -8px; transform: translateX(-50%); padding: 0 6px; background: var(--acc); color: var(--acc-ink); font: 900 10px/14px var(--num); white-space: nowrap; letter-spacing: .06em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill{z-index: 5; width: 28px; height: 28px; border-radius: 50%; background: var(--paper); box-shadow: 0 0 0 1.5px var(--acc); font: 900 12px/28px "Noto Sans SC", sans-serif; color: var(--cream); text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill i{position: absolute; right: -4px; top: -5px; min-width: 13px; height: 13px; border-radius: 7px; background: var(--acc); color: var(--acc-ink); font: 900 9px/13px var(--num); font-style: normal; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .info{position: absolute; left: 84px; top: 4px; right: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .n{display: flex; align-items: baseline; font: 400 17px/1 var(--disp); letter-spacing: .05em; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .hp{margin-left: auto; font: 700 11px var(--num); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .hp b{color: var(--cream); font-size: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .hpbar{display: block; flex: none; height: 8px; margin-top: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .chips{display: flex; gap: 4px; margin-top: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .chip{display: flex; align-items: center; gap: 3px; height: 16px; padding: 0 6px; background: var(--paper); font-size: 10px; color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .chip svg{width: 10px; height: 10px; stroke: var(--blue);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .chip b{font: 900 11px var(--num); color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .items{left: 224px; top: 766px; width: 32px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item{position: relative; display: grid; place-items: center; width: 32px; height: 32px; background: var(--paper); color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item svg{width: 16px; height: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item i{position: absolute; right: -3px; top: -4px; min-width: 13px; height: 13px; border-radius: 7px; background: var(--acc); color: var(--acc-ink); font: 900 9px/13px var(--num); font-style: normal; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mates{left: 266px; top: 760px; width: 122px; display: flex; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mate{position: relative; width: 38px; display: flex; flex-direction: column; align-items: center; gap: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mface{position: relative; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background-color: #232429; font: 900 13px var(--num); color: var(--cream); box-shadow: 0 0 0 2px var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mst{position: absolute; right: -5px; top: -4px; min-width: 13px; height: 13px; border-radius: 7px; background: var(--red); color: #fff; font: 900 9px/13px var(--num); font-style: normal; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mate .mn{font-size: 9px; line-height: 11px; color: var(--cream); white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mate .hpbar{flex: none; width: 32px; height: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .piles{left: 266px; top: 812px; width: 122px; text-align: center; font-size: 10px; color: var(--dim); white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .piles b{color: var(--cream); font: 900 11px var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .piles i{display: inline-block; width: 1px; height: 8px; background: var(--dim); margin: 0 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pending{left: 244px; top: 594px; width: 138px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy{left: 12px; top: 568px; width: 60px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill{left: 74px; top: 572px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end{left: 306px; top: 518px; width: 76px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .hand{left: 8px; top: 564px; width: 374px; height: 164px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .top{left: 34px; right: 24px; top: 10px; height: 40px; gap: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .top .retreat{height: 32px; padding: 0 12px; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .top .ctl{width: 32px; height: 32px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .track{left: auto; right: 330px; top: 14px; width: auto; flex-direction: row; gap: 10px; align-items: center; height: 36px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .who{width: 30px; height: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .who.now{width: 38px; height: 38px; margin: 0 2px 0 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .hand{left: 345px; top: 462px; width: 620px; height: 228px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .pending{left: 716px; top: 516px; width: 200px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .energy{left: 986px; top: 566px; width: 100px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .energy .v{font-size: 46px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .energy .v small{font-size: 18px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .energy .pips i{width: 11px; height: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .end{left: 1096px; top: 594px; width: 156px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .lead{left: 28px; top: 560px; width: 270px; height: 86px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .lead .face{left: 4px; top: 6px; width: 72px; height: 72px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .skill{left: 1060px; top: 580px; width: 32px; height: 32px; line-height: 32px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .lead .info{left: 100px; top: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .lead .n{font-size: 24px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .lead .hp{font-size: 13px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .lead .hp b{font-size: 18px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .lead .hpbar{height: 10px; margin-top: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .lead .chips{margin-top: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .lead .chip{height: 20px; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .lead .chip b{font-size: 13px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .items{left: 296px; top: 580px; width: 36px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .item{width: 36px; height: 36px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .item svg{width: 18px; height: 18px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .mates{left: 28px; top: 654px; width: 300px; gap: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .mate{flex-direction: row; width: 94px; gap: 6px; align-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .mate .mface{flex: none; width: 34px; height: 34px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .mate .mn{font-size: 11px; position: absolute; left: 40px; top: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .mate .hpbar{position: absolute; left: 40px; top: 20px; width: 50px; height: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .piles{left: 1096px; top: 654px; width: 156px; font-size: 12px; text-align: left;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .piles b{font-size: 13px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]){--red: #e8392f; --cream: #f2f0ea; --jade: #5fd6a4; --yel: #ffc933; --acc: #ffc933; --acc-ink: #121214; --plate: #0a0a0b; --cbg: #17181c; --buff: #5fd6a4; --dim: #a3a29c; --gl: #c9c8c3; --gd: #8b8d96; --sk: -12deg;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.t-atk{--tc: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.t-def{--tc: var(--gl);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.t-skl{--tc: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.t-pow{--tc: var(--gd);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .tier,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .blk,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .st,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .chip,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .aw,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .retreat,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .ctl,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .kw i,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pending span,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .slot,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mst,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .bd:not(.pick){position: relative; isolation: isolate; background: none !important; clip-path: none !important; box-shadow: none; border: 0; border-radius: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .tier::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .blk::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .st::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .chip::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .aw::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .retreat::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .ctl::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .kw i::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pending span::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .slot::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mst::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .bd:not(.pick)::before{content: ""; position: absolute; inset: 0; z-index: -1; transform: skewX(var(--sk)); background: var(--pc, var(--plate));}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent{--pc: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end{--pc: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .aw{--pc: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mst{--pc: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost{--pc: var(--yel);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost.cut{--pc: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill i,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item i{background: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) u{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .decor .d1{left: -20%; width: 140%; top: 396px; height: 8px; transform: rotate(-17deg); background: linear-gradient(90deg, rgba(232,57,47,0), var(--red) 38%, var(--red) 62%, rgba(232,57,47,0)); clip-path: polygon(0 50%, 50% 0, 100% 50%, 50% 100%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .decor .d1{top: 334px; transform: rotate(-6deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .title b{font: 400 26px var(--disp); letter-spacing: .1em; color: var(--cream); text-shadow: 0 0 4px #000, 0 2px 8px #000;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .round small{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .round b{font: 900 24px var(--num); font-style: italic; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .retreat,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .ctl{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .ctl{width: 36px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .retreat{height: 36px; padding: 0 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .who{box-shadow: 0 0 0 2px var(--plate), 0 0 0 3.5px var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .who.ally{box-shadow: 0 0 0 2px var(--plate), 0 0 0 3.5px var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .who.now{margin-left: -4px; box-shadow: 0 0 0 2px var(--plate), 0 0 0 4px var(--jade), 0 0 14px 4px rgba(95,214,164,.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .head{width: 300px; margin-left: -150px; gap: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent{padding: 3px 16px 3px 12px; gap: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent svg{stroke: var(--cream); width: 15px; height: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent b{font: 900 26px/1 var(--num); font-style: italic; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent em{font-style: normal; font-size: 13px; font-weight: 700; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .plate{display: flex; align-items: center; justify-content: center; gap: 5px; width: auto;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .plate .nm{font-weight: 900; font-size: 18px; line-height: 1.2; color: var(--cream); text-shadow: 0 0 3px #000, 0 0 3px #000, 0 1px 6px #000; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .tier{padding: 0 6px; height: 16px; font: 800 10px/16px "Noto Sans SC", sans-serif; letter-spacing: .08em; color: var(--cream); text-shadow: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .hpbar{flex: none; width: 92px; height: 14px; transform: none; box-shadow: 0 0 0 2px var(--plate);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .hpbar span{position: absolute; inset: 0; display: grid; place-items: center; font: 800 10px/1 var(--num); color: var(--cream); text-shadow: 0 0 3px #000, 0 0 3px #000;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .blk,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .st{height: 16px; padding: 0 5px; line-height: 16px; font-size: 10px; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .blk svg{stroke: var(--gl); width: 10px; height: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .blk b,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .st b{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pickmark{display: none; position: absolute; left: 50%; top: -17px; width: 18px; height: 11px; margin-left: -9px; background: var(--red); clip-path: polygon(0 0, 100% 0, 50% 100%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .head{position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).aiming .foe.front .pickmark,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).item-aim .foe .pickmark{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).item-aim .foe.rear .head{display: flex;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).item-aim .foe.rear .intent,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).item-aim .foe.rear .plate{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).item-aim .foe.rear .art{filter: brightness(.7) saturate(.8);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pending{border: 0; justify-content: flex-start; height: 22px; font-size: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pending span{padding: 0 10px; line-height: 22px; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pending b{color: var(--red); font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy .v{color: var(--yel);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy .v small{color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy .pips i{width: 14px; height: 5px; transform: skewX(var(--sk)); background: var(--yel);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy .pips i.off{background: #3a3b40;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy .pips{gap: 4px; margin-top: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item{width: 42px; height: 40px; border-radius: 0; display: grid; place-items: center; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill svg,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item svg{width: 20px; height: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill i{position: absolute; right: -4px; top: -6px; min-width: 14px; height: 14px; border-radius: 0; background: var(--yel) !important; color: var(--acc-ink); font: 900 10px/14px var(--num); transform: skewX(var(--sk));}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item i{position: absolute; right: -4px; top: -6px; min-width: 20px; height: 14px; padding: 0 3px; border-radius: 0; color: var(--cream); font: 800 10px/14px var(--num); background: var(--red) !important; transform: skewX(var(--sk));}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).tray-on .item::before{background: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .tray{display: none; z-index: 6; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).tray-on .tray{display: flex;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).tray-on .hand{opacity: .45; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).tray-on .energy{opacity: .6;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .slot{width: 68px; height: 58px; display: grid; grid-template-rows: 22px 16px 14px; justify-items: center; align-content: center; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .slot svg{width: 20px; height: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .slot b{font: 800 11px/16px "Noto Sans SC", sans-serif;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .slot i{font: 800 10px/14px var(--num); font-style: normal; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .slot.on::before{background: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .slot.on i{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .slot.off{opacity: .4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end b{display: block; font-size: 16px; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end .hold{transform: skewX(var(--sk));}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end .hold .prg{stroke: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .face{box-shadow: 0 0 0 3px var(--plate);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .chg{background: conic-gradient(var(--red) 0 74%, #3a3b40 74% 100%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .aw{padding: 0 8px; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .n{font: 400 20px/1 var(--disp); color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .hpbar{transform: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .chip{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .chip svg{stroke: var(--gl);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .chip b{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mface{box-shadow: 0 0 0 2px var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mst{color: var(--cream); min-width: 14px; height: 14px; font: 900 10px/14px var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .piles{display: flex; gap: 12px; justify-content: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .piles .pile{display: flex; align-items: baseline; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .piles em{font-style: normal; font-size: 10px; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .piles b{color: var(--cream); font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card{border-radius: 3px; --rc: transparent;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card{background-image: linear-gradient(to bottom, rgba(255,255,255,var(--shine, 0)), rgba(255,255,255,0) 45%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-uncommon{--shine: .05;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-rare,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own{--shine: .09;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-epic,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign{--shine: .13;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth{--shine: .2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-uncommon{--rc: #6c6d73;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-rare,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-epic{--rc: #a9aab0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth{--rc: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-epic,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth{box-shadow: inset 0 0 0 1.5px var(--rc), inset 0 0 0 4px var(--cbg), inset 0 0 0 5.5px var(--rc), 0 2px 8px rgba(0,0,0,.6);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign{outline: 1.5px dotted #a9aab0; outline-offset: -4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.temp{outline: 1.5px dashed var(--gd); outline-offset: -4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth .cost::before{box-shadow: 0 0 10px 3px rgba(255,244,225,.85);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .tab::after,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .full::after{content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .full::after{width: 112px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost{color: var(--acc-ink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost b{color: var(--acc-ink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost s{color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .tab .val{display: flex; justify-content: center; align-items: flex-end; gap: 2px; bottom: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .tab .val b{display: block; color: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.buff .tab .val b{color: var(--buff);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .val em{display: inline-block; width: 12px; height: 12px; margin: 0 0 3px; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .val em svg{width: 100%; height: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .val{display: flex; justify-content: center; align-items: flex-end; gap: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .val em{width: 16px; height: 16px; margin: 0 0 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .tab .name{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .bd:not(.pick){color: var(--cream); --pc: #2a2b31;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .bd.pick{border-radius: 0; width: 12px; min-width: 12px; height: 12px; border: 2px solid var(--cream); background: transparent; transform: skewX(var(--sk));}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .bd.pick.on{background: var(--red); border-color: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .kw i{--pc: #2a2b31; color: var(--cream); width: 18px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.sel{background-color: #24252b; box-shadow: inset 0 0 0 1.5px var(--rc), 0 0 0 2px var(--red), 0 0 32px 10px rgba(232,57,47,.5), 0 12px 22px rgba(0,0,0,.75);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .hand.has-sel .card:not(.sel){filter: brightness(.68);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .hand.has-sel .card.poor:not(.sel){filter: brightness(.5) saturate(.5);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pending{left: 12px; top: 522px; width: 150px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy{left: 14px; top: 558px; width: 50px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill{left: 72px; top: 562px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item{left: 122px; top: 562px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .hand{top: 554px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end{top: 510px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .tray{left: 8px; top: 470px; width: 296px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead{top: 736px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mates{top: 734px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .piles{top: 788px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .lead{top: 538px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .mates{top: 626px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .piles{left: 1096px; top: 660px; width: 156px; justify-content: flex-start;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .energy{left: 986px; top: 548px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .skill{left: 1090px; top: 552px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .item{left: 1142px; top: 552px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .end{left: 1096px; top: 606px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .tray{left: 345px; top: 392px; width: 320px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .pending{left: 716px; top: 516px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .slot{width: 76px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .bd:not(.pick),#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mst,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .aw{position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item{z-index: 6;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill{left: 68px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item{left: 116px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .decor{z-index: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill{left: 64px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item{left: 110px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .tray{top: 454px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .hand{top: 440px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .pending{left: 1000px; top: 504px; width: 250px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .tray{top: 372px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .decor .d1{left: 14%; width: 72%; top: 372px; height: 7px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .decor .d1{left: 34%; width: 32%; top: 300px; height: 7px; transform: rotate(-12deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .slot.on{transform: translateY(-5px); filter: brightness(1.12);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).tray-on .slot:not(.on){filter: brightness(.7);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).aiming .foe.front .art,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).item-aim .foe .art{filter: brightness(calc(var(--fl, 1) * 1.1)) saturate(var(--fsat, 1));}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]){--red: #ff4a3d; --acc: #fff7ee; --acc-ink: #0c0c0e; --yel: #fff7ee; --plate: #131417; --jade: #6fe0b4; --buff: #6fe0b4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .decor{z-index: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .decor .d1{left: -20%; width: 140%; top: 392px; height: 3px; transform: rotate(-17deg); background: linear-gradient(90deg, rgba(255,247,238,0), #fff7ee 35%, #fff7ee 65%, rgba(255,247,238,0)); clip-path: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .decor .d2{left: -20%; width: 140%; top: 396px; height: 9px; transform: rotate(-17deg); background: linear-gradient(90deg, rgba(255,74,61,0), #ff4a3d 38%, #ff4a3d 62%, rgba(255,74,61,0)); clip-path: polygon(0 50%, 50% 0, 100% 50%, 50% 100%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .decor .d1{left: -20%; width: 140%; top: 330px; height: 3px; transform: rotate(-6deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .decor .d2{top: 334px; transform: rotate(-6deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .title{position: relative; padding-bottom: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .title::after{content: ""; position: absolute; left: -4px; right: 14px; bottom: 0; height: 4px; background: var(--red); transform: skewX(-30deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .round b{color: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .retreat{height: 28px; padding: 0 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .ctl{width: 28px; height: 28px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .who{box-shadow: 0 0 0 2px var(--paper), 0 0 0 3.5px var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .who.now{margin-left: -4px; box-shadow: 0 0 0 2px var(--acc), 0 0 0 4px var(--paper);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .who.ally{box-shadow: 0 0 0 2px var(--jade), 0 0 0 3.5px var(--paper);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .tier{--pc: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .tier i{border-color: var(--acc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .tier i.on{background: var(--acc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).aiming .foe.front .intent{--pc: var(--acc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).aiming .foe.front .intent b,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).aiming .foe.front .intent em{color: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).aiming .foe.front .intent svg{stroke: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).aiming .foe.front .pickmark{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .face{box-shadow: 0 0 0 3px var(--acc), 0 0 0 5px var(--paper), 0 0 14px 5px rgba(255,74,61,.65);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead .chip::before{transform: skewX(-20deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy .v{color: var(--acc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy .pips{gap: 5px; margin-top: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy .pips i{width: 9px; height: 9px; transform: rotate(45deg); background: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .energy .pips i.off{background: #3a3b40;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pending{border-bottom: 1.5px solid var(--acc); justify-content: flex-end; height: 18px; font-size: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pending span{padding: 0; line-height: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pending span::before{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item{width: 28px; height: 28px; font: 900 12px/28px "Noto Sans SC", sans-serif;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill{left: 66px; top: 566px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item{left: 104px; top: 564px; width: 32px; height: 32px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill::before{border-radius: 50%; transform: none; background: var(--paper); box-shadow: 0 0 0 1.5px var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item::before{transform: none; background: var(--paper);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill i,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item i{right: -4px; top: -5px; min-width: 13px; height: 13px; border-radius: 7px; background: var(--red) !important; color: var(--acc); font: 900 9px/13px var(--num); transform: none; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item i{padding: 0 2px; right: -3px; top: -4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end{--pc: var(--acc); color: var(--acc-ink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end b{color: var(--acc-ink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end::after{content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 6px; background: var(--red); transform: skewX(var(--sk)); z-index: -1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end .hold .prg{stroke: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .piles{display: block; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .piles b{font-size: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card{background-image: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-epic,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth{box-shadow: inset 0 0 0 1.5px var(--rc), 0 2px 8px rgba(0,0,0,.6);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign{outline: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-uncommon .cost::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-rare .cost::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-epic .cost::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth .cost::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own .cost::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign .cost::before{box-shadow: 0 0 0 2px var(--cbg), 0 0 0 3.5px var(--rc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-epic .cost::before{box-shadow: 0 0 0 2px var(--cbg), 0 0 0 3.5px var(--rc), 0 0 0 5px var(--cbg), 0 0 0 6.5px var(--rc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .tab::after,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .full::after{height: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .bd:not(.pick){--pc: var(--acc); color: var(--acc-ink);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .bd:not(.pick)::before{transform: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .bd.pick{width: 14px; min-width: 14px; height: 14px; border-radius: 50%; transform: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .kw i{width: 17px; --pc: #3a3b40;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .kw i::before{transform: none; border-radius: 50%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.sel{background-color: var(--cbg); box-shadow: inset 0 0 0 1.5px var(--rc, transparent), 0 0 0 2px var(--acc), 0 0 14px 3px rgba(255,74,61,.6), 0 8px 18px rgba(0,0,0,.7);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .hand.has-sel .card:not(.sel){filter: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .hand.has-sel .card.poor:not(.sel){filter: brightness(.6) saturate(.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent{--pc: var(--plate);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent::after{content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: var(--red); transform: skewX(var(--sk)); z-index: -1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent svg{stroke: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent b{color: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent em{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).aiming .foe.front .intent{--pc: var(--plate);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).aiming .foe.front .intent b{color: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).aiming .foe.front .intent em{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).aiming .foe.front .intent svg{stroke: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end{--pc: var(--plate); color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end b{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end .hold .trk{stroke: #3a3b40;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end .hold .prg{stroke: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .head{width: 340px; margin-left: -170px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .foe .head{width: 380px; margin-left: -190px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .hpbar{width: 220px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .foe .hpbar{width: 260px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .tier{padding: 0 6px; letter-spacing: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .bars{display: flex; justify-content: center; align-items: center; gap: 4px; margin-top: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).item-aim .foe.rear .bars{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .hand{top: 556px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .lead{top: 748px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .mates{top: 746px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .piles{top: 800px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .energy{left: 986px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .skill{left: 1090px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .item{left: 1142px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill{top: 574px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item{top: 570px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .hand{left: 355px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .energy{left: 998px; top: 548px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .skill{left: 1102px; top: 552px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .item{left: 1154px; top: 552px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .end{left: 1108px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .piles{left: 1108px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .pending{left: 1000px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe.front .head{translate: 0 20px; gap: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .foe.front .head{translate: 0 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end::after,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent::after{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe .intent::before{background: linear-gradient(to top, var(--red) 0 4px, var(--plate) 4px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end .hold .trk{stroke: transparent;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end .hold{transform: skewX(var(--sk));}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end .hold rect{rx: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .retreat::before{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .retreat{height: auto; padding: 0 4px; font: 400 15px/1 var(--disp); letter-spacing: .08em; color: var(--cream); text-shadow: 0 0 4px #000, 0 1px 6px #000;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .top .spd{font: 900 16px/1 var(--num); font-style: italic; color: var(--cream); text-shadow: 0 0 4px #000;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .top .retreat{height: auto; padding: 0 4px; font-size: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item{width: 32px; height: 32px; border-radius: 50%; font: 900 13px/32px "Noto Sans SC", sans-serif; color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item::before{transform: none; border-radius: 50%; background: var(--paper); box-shadow: 0 0 0 1.5px var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item svg{width: 16px; height: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill i,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item i{right: -5px; top: -5px; min-width: 15px; height: 15px; padding: 0 3px; border-radius: 8px; background: var(--red) !important; color: var(--cream); font: 900 9px/15px var(--num); transform: none; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .skill{left: 64px; top: 570px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .item{left: 106px; top: 570px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end{top: 558px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .pending{left: 14px; top: 526px; width: 250px; justify-content: flex-start;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .kw{gap: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .kw i{width: auto; height: 18px; padding: 0 6px; font: 700 10px/18px "Noto Sans SC", sans-serif; letter-spacing: .05em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.t-skl{--tc: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.t-pow{--tc: var(--gd);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-uncommon,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-rare,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-epic,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth{--shine: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-epic,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth{box-shadow: 0 2px 8px rgba(0,0,0,.6);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign{outline: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost::before{box-shadow: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-common .cost::before{box-shadow: 0 0 0 2px var(--cbg), 0 0 0 3.5px #8b8d96;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-uncommon .cost::before{box-shadow: 0 0 0 2px var(--cbg), 0 0 0 3.5px #4f9cff;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-rare .cost::before{box-shadow: 0 0 0 2px var(--cbg), 0 0 0 3.5px #a874ff;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-epic .cost::before{box-shadow: 0 0 0 2px var(--cbg), 0 0 0 3.5px #f2b632;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth .cost::before{box-shadow: 0 0 0 2px var(--cbg), 0 0 0 3.5px #ffd76a, 0 0 9px 3px rgba(255,215,106,.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own .cost::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign .cost::before{box-shadow: 0 0 0 2px var(--cbg), 0 0 0 3.5px var(--red), 0 0 0 5px var(--cbg), 0 0 0 6.5px var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end .hold{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end::after{display: block; content: ""; position: absolute; left: 0; top: 0; bottom: 0; right: auto; width: calc(var(--hold, 0) * 100%); height: auto; z-index: -1; transform: skewX(var(--sk)); background: var(--red); opacity: .55;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .kw i::before{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .full .kw i{background: none !important; box-shadow: inset 0 0 0 1px #55565c; border-radius: 0; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own .cost::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign .cost::before{box-shadow: 0 0 0 2px var(--cbg), 0 0 0 3.5px var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card{--gap: #fff7ee;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-common .cost::before{box-shadow: 0 0 0 2px var(--gap), 0 0 0 4px #8b8d96;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-uncommon .cost::before{box-shadow: 0 0 0 2px var(--gap), 0 0 0 4px #4f9cff;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-rare .cost::before{box-shadow: 0 0 0 2px var(--gap), 0 0 0 4px #a874ff;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-epic .cost::before{box-shadow: 0 0 0 2px var(--gap), 0 0 0 4px #f2b632;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth .cost::before{box-shadow: 0 0 0 2px var(--gap), 0 0 0 4px #ffd76a, 0 0 9px 3px rgba(255,215,106,.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own .cost::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign .cost::before{box-shadow: 0 0 0 2px var(--gap), 0 0 0 4px var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost.cut{--pc: var(--cbg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost b{color: var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost.cut b{color: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost::before{box-shadow: 0 0 0 2px var(--gap);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .end::before{background: var(--plate); box-shadow: inset 0 0 0 1.5px var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe.k-beast .art{translate: 0 -150px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .foe.k-beast .art{translate: 0 -90px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe.k-beast .art{scale: .82; transform-origin: 50% 100%; translate: 0 -120px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .foe.k-beast .art{scale: 1; translate: 0 -125px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost::after{content: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-common .cost::before{box-shadow: 0 0 0 2px var(--gap), 0 0 0 3px #6c6d73;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-uncommon .cost::before{box-shadow: 0 0 0 2px var(--gap), 0 0 0 4px var(--cbg), 0 0 0 5.5px var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-rare .cost::before{box-shadow: 0 0 0 2px var(--gap), 0 0 0 4px var(--cbg), 0 0 0 5.5px var(--cream), 0 0 0 7px var(--cbg), 0 0 0 8.5px var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-epic .cost::before{box-shadow: 0 0 0 2px var(--gap), 0 0 0 4px var(--cbg), 0 0 0 6.5px var(--cream), 0 0 0 8px var(--cbg), 0 0 0 10.5px var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth .cost::before{box-shadow: 0 0 0 2px var(--gap), 0 0 0 4px var(--cbg), 0 0 0 6.5px var(--cream), 0 0 0 8px var(--cbg), 0 0 0 10.5px var(--cream), 0 0 12px 6px rgba(255,247,238,.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own .cost::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign .cost::before{box-shadow: 0 0 0 2px var(--gap), 0 0 0 4px var(--cbg), 0 0 0 5.5px var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own .cost::after,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign .cost::after{content: ""; position: absolute; left: -7px; top: -7px; width: 9px; height: 9px; background: var(--red); clip-path: polygon(0 0, 100% 0, 0 100%); z-index: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost::before,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card[class*=" r-"] .cost::before{box-shadow: 0 0 0 2px var(--gap);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost::after{content: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card[class*=" r-"] .cost::after{content: ""; position: absolute; left: 50%; top: calc(100% + 1px); height: 6px; width: calc(var(--pip) * 7px - 1px); translate: -50% 0; z-index: 2; clip-path: none; background: var(--cream); -webkit-mask: none 0 0/7px 6px repeat-x; mask: none 0 0/7px 6px repeat-x;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-common{--pip: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-uncommon{--pip: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-rare{--pip: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-epic,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth{--pip: 4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth .cost::after{filter: drop-shadow(0 0 3px rgba(255,247,238,.9));}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign{--pip: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own .cost::after,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign .cost::after{left: 50%; top: calc(100% + 1px); width: 6px; height: 6px; background: var(--red); clip-path: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost s{top: calc(100% + 7px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .foe.k-beast .art{translate: 0 -200px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]).land .foe.k-beast .art{translate: 0 -125px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost::after,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card[class*=" r-"] .cost::after{content: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card .cost s{top: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card{--rf: inset 0 0 0 0 transparent; box-shadow: var(--rf), 0 2px 8px rgba(0,0,0,.6); outline: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-common{--rf: inset 0 0 0 1px #55565c;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-uncommon{--rf: inset 0 0 0 1.5px var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-rare{--rf: inset 0 0 0 1.5px var(--cream), inset 0 0 0 3.5px var(--cbg), inset 0 0 0 4.5px var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-epic{--rf: inset 0 0 0 2.5px var(--cream), inset 0 0 0 4.5px var(--cbg), inset 0 0 0 6px var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth{--rf: inset 0 0 0 2.5px var(--cream), inset 0 0 0 4.5px var(--cbg), inset 0 0 0 6px var(--cream), inset 0 0 14px 2px rgba(255,247,238,.35);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-myth:not(.sel){box-shadow: var(--rf), 0 0 10px 1px rgba(255,247,238,.35), 0 2px 8px rgba(0,0,0,.6);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign{--rf: inset 0 0 0 1.5px var(--cream);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-own::after,#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.r-sign::after{content: ""; position: absolute; left: 0; top: 0; width: 12px; height: 12px; background: var(--red); clip-path: polygon(0 0, 100% 0, 0 100%); z-index: 3; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.sel{box-shadow: var(--rf), 0 0 0 2px var(--acc), 0 0 14px 3px rgba(255,74,61,.6), 0 8px 18px rgba(0,0,0,.7);}
#igs-overlay :where(.igs-cx-canvas[data-cx="comic"],.igs-cx-ghost[data-cx="comic"]) .card.temp{outline: 1.5px dashed var(--gd); outline-offset: -4px;}
`;
