// 由 gal/战斗界面设计稿/落盘/gen-skin-css.mjs 从概念稿 mystic/common.css、mystic/基底.css、mystic/定稿.css 生成，不要手改；改设计稿后重新生成。
// 选择器作用域见生成脚本说明，规则内容与设计稿一致（本地图片地址换成 none）。
export const COMBAT_SKIN_MYSTIC_CONCEPT_CSS = `
@font-face{font-family: "Tsanger YuYang"; font-weight: 100 900; font-display: swap; src: url("../../../fonts/TsangerYuYangT-W05.woff2") format("woff2");}
@font-face{font-family: "Cinzel"; font-weight: 400 900; font-display: swap; src: url("../../../fonts/Cinzel-Variable.ttf") format("truetype");}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) *{box-sizing: border-box; margin: 0; padding: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]){background: #0a0a0d; color: #ebe7da; font-family: "LXGW Neo ZhiSong", "Songti SC", serif;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]){display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 14px; min-height: 100vh;}
#igs-overlay #igs-cx-canvas:where([data-cx="mystic"]){position: relative; overflow: hidden; background: #0f1015; flex: none; user-select: none; -webkit-user-select: none; --text: #ebe7da; --dim: #a8a595; --faint: #7a7888; --gold: #b9a46a; --gold-hi: #e3d49c; --gd: #8c7d4e; --red: #d06a68; --jade: #8fc4ae; --blue: #8fa8d8; --violet: #a897d6; --serif: "LXGW Neo ZhiSong", "Songti SC", serif; --title: "Tsanger YuYang", "LXGW Neo ZhiSong", serif; --num: "Cinzel", "LXGW Neo ZhiSong", serif; font-family: var(--serif); color: var(--text); font-synthesis: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="mystic"]).port{width: var(--cx-w, 390px); height: 844px;}
#igs-overlay #igs-cx-canvas:where([data-cx="mystic"]).land{width: var(--cx-w, 1280px); height: 720px;}
#igs-overlay #igs-cx-canvas:where([data-cx="mystic"]) > *{position: absolute;}
#igs-overlay #igs-cx-canvas:where([data-cx="mystic"]) button{font-family: inherit; color: inherit; background: none; border: 0; cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .stage{inset: 0; background: #0f1015 none 50% 30% / cover no-repeat; filter: saturate(.8) brightness(.5);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .shade{inset: 0; pointer-events: none; z-index: 4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .shade{background: linear-gradient(to bottom, rgba(15,16,21,.7) 0, rgba(15,16,21,0) 9%), linear-gradient(to bottom, rgba(15,16,21,0) 0, rgba(15,16,21,0) 55%, rgba(15,16,21,.55) 66%, rgba(15,16,21,.9) 76%, #0f1015 84%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .shade{background: linear-gradient(to bottom, rgba(15,16,21,.7) 0, rgba(15,16,21,0) 9%), linear-gradient(to bottom, rgba(15,16,21,0) 0, rgba(15,16,21,0) 58%, rgba(15,16,21,.55) 68%, rgba(15,16,21,.9) 78%, #0f1015 86%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .face-x{background-repeat: no-repeat; background-color: #1c1d27;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .face-x{display: grid; place-items: center; font: 600 13px var(--title); color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .hpbar{position: relative; height: 4px; background: #2a2b36;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .hpbar i{position: absolute; left: 0; top: 0; bottom: 0; background: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .hpbar.ally i{background: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foes{z-index: 3; left: 0; right: 0; touch-action: pan-y; --ground: 0px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .foes{top: 70px; height: 480px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .foes{top: 66px; height: 410px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe{position: absolute; left: 50%; bottom: calc(var(--ground, 0px) + var(--fb, 0px)); width: var(--w, 200px); z-index: var(--fz, 1); transform: translateX(calc(-50% + var(--fx, 0px))) scale(var(--fs, 1)); transform-origin: 50% 100%; cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .art{position: relative; width: 100%; height: calc(var(--w, 200px) * 1.3); filter: brightness(var(--fl, 1)) saturate(var(--fsat, 1));}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .art .igs-combat-art{position: absolute; inset: 0; filter: drop-shadow(0 10px 16px #000);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .head{position: absolute; left: 50%; bottom: 100%; width: 158px; margin: 0 0 4px -79px; display: flex; flex-direction: column; align-items: center; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .head .intent{opacity: var(--fi, 1); display: flex; align-items: center; gap: 5px; padding: 3px 12px; background: #0c0c10;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .head .n{opacity: var(--fi, 1); display: flex; justify-content: space-between; align-items: baseline; width: 100%; font-size: 16px; text-shadow: 0 1px 6px #000;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .head .n span{font: 500 12px var(--num); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .head .hpbar{width: 100%; height: 4px; opacity: var(--fi, 1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .intent b{font: 600 18px var(--num); color: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .intent em{font: 11px var(--serif); color: var(--dim); font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .intent svg{width: 13px; height: 13px; stroke: var(--red); fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .ic{z-index: 5; width: 24px; height: 24px; top: 18px; color: var(--dim); font: 500 12px var(--num); display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .ic svg{width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .ic em{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .ic-c{right: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .ic-r{right: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .ic-x{right: 76px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .ic{top: 26px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .ic-c{right: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .ic-r{right: 66px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .ic-x{right: 102px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .track{z-index: 5; display: flex; align-items: center; gap: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .track{left: 10px; top: 76px; flex-direction: column; width: 34px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .track{left: 40px; top: 24px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .track .label{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .track .who{position: relative; width: 26px; height: 26px; border-radius: 50%; overflow: hidden; flex: none; box-shadow: 0 0 0 1px #4a4332; background-size: cover;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .track .who.now{width: 34px; height: 34px; box-shadow: 0 0 0 1px var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .track .who .igs-combat-art{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .track .who.face-x{font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .mates,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .bag,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .piles,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .energy,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .end,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .hand{z-index: 6;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead{display: flex; align-items: center; gap: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead .face{position: relative; flex: none; display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead .info{flex: 1; min-width: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead .n{display: flex; justify-content: space-between; align-items: baseline; font: 400 14px var(--title); letter-spacing: .08em; margin-bottom: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead .hp{font: 10px var(--num); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead .hp b{font: 600 12px var(--num); color: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead .hpbar{height: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .chips{display: flex; gap: 4px; margin-top: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .chip{display: flex; align-items: center; gap: 3px; padding: 1px 5px; background: #1c1d27; font: 10px var(--serif); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .chip b{font: 600 11px var(--num); color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .chip svg{width: 10px; height: 10px; fill: none; stroke: var(--blue); stroke-width: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .mates{display: flex;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .mate{display: flex; flex-direction: column; align-items: center; gap: 2px; width: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .mface{width: 22px; height: 22px; border-radius: 50%; box-shadow: 0 0 0 1px #4a4332; background-size: 300% auto;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .mate .mn{font: 9px var(--serif); color: var(--dim); white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .mate .hpbar{height: 3px; width: 36px; order: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .mate .mn{order: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .bag{width: 32px; height: 28px; display: grid; place-items: center; color: var(--dim); background: #1c1d27; position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .bag svg{width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .bag em{position: absolute; right: 2px; top: 0; font: 600 9px var(--num); color: var(--gold-hi); font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .piles{font: 10px/1.35 var(--serif); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .piles b{font: 500 11px var(--num); color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .sp{display: block; height: 0; font-size: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .lead{left: 14px; top: 792px; width: 150px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .lead .face{width: 40px; height: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .mates{left: 170px; top: 790px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .bag{left: 306px; top: 798px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .piles{left: 344px; top: 794px; width: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .piles{word-break: keep-all;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .hand{left: 16px; top: 620px; width: 358px; height: 104px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .hand{left: 392px; top: 498px; width: 620px; height: 138px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .hand .card{position: absolute; bottom: 0; transform-origin: 50% 50%; transition: transform .25s, left .25s, width .2s, height .2s; cursor: pointer; overflow: hidden; --tc: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.t-def{--tc: var(--blue);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.t-skl{--tc: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.t-pow{--tc: var(--violet);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .edge{position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .art{position: absolute; left: 0; right: 0; margin: 0 auto; color: var(--tc); display: block; width: 34px; height: 34px; top: 46px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .art svg{display: block; width: 100%; height: 100%; overflow: visible;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .cost{position: absolute; left: 3px; top: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .name{position: absolute; left: 2px; right: 2px; top: 31px; text-align: center; white-space: nowrap; font: 400 10.5px var(--title);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .val{position: absolute; left: 0; right: 0; bottom: 4px; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .val b{font: 600 24px var(--num); color: var(--tc); line-height: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .val em,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .tag,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .desc,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .lv{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.poor{filter: brightness(.55);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .val em,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .tag,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .desc{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .lv{display: flex;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .name{left: 32px; right: 4px; top: 9px; text-align: left; font-size: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .tag{position: absolute; left: 32px; top: 28px; font: 10px var(--serif); color: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .art{width: 56px; height: 56px; top: 48px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .val{bottom: 46px; display: flex; justify-content: center; align-items: baseline; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .val b{font-size: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .val em{font: 11px var(--serif); color: var(--dim); font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .desc{position: absolute; left: 8px; right: 8px; bottom: 7px; text-align: center; font: 11px/1.35 var(--serif); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .desc b{color: var(--text); font-family: var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .lv{position: absolute; right: 6px; top: 10px; gap: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .lv i{width: 4px; height: 4px; background: var(--gold); transform: rotate(45deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card .art{width: 44px; height: 44px; top: 56px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card .name{top: 36px; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card .val b{font-size: 28px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .art{width: 64px; height: 64px; top: 52px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .name{font-size: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .val{bottom: 56px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .val b{font-size: 36px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .desc{font-size: 12.5px; bottom: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .energy{left: 16px; top: 576px; width: 80px; height: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .end{left: 298px; top: 566px; width: 76px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .energy{left: 296px; top: 548px; width: 90px; height: 64px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .end{left: 1090px; top: 566px; width: 128px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .lead{left: 40px; top: 548px; width: 250px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .lead .face{width: 64px; height: 64px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .mates{left: 40px; top: 636px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .bag{left: 1090px; top: 500px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .piles{left: 1134px; top: 502px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .mate{width: 70px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .mface{width: 28px; height: 28px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .mate .hpbar{width: 56px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .end{display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .end b{white-space: nowrap; line-height: 1; font-weight: 400;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .hold{position: absolute; left: -5px; top: -5px; width: calc(100% + 10px); height: calc(100% + 10px); overflow: visible; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .hold rect{x: 1px; y: 1px; width: calc(100% - 2px); height: calc(100% - 2px); rx: var(--hr, 27px); fill: none; stroke-width: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .hold .trk{stroke: #2c2d3a;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .hold .run{stroke: var(--gold-hi); stroke-dasharray: 62 38; stroke-linecap: round;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .name{top: 9px; left: 34px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .tag{left: 34px; top: 32px; font-size: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .end{top: 558px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .head .n .nm{font: inherit; color: var(--text); display: inline-flex; align-items: center; gap: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .head .n .hpn{font: 500 12px var(--num); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .elite{font: 10px/1 var(--serif); font-style: normal; color: var(--gold-hi); border: 1px solid var(--gold); padding: 2px 4px; letter-spacing: .06em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .sts{display: flex; gap: 6px; justify-content: center; opacity: var(--fi, 1); min-height: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .sts em{display: inline-flex; align-items: center; gap: 3px; font: 11px/1 var(--serif); font-style: normal; padding: 3px 6px; background: #14151c; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .sts .blk{color: var(--blue);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .sts .blk b,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .sts .st b{font: 600 12px var(--num); color: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .sts .blk svg{width: 11px; height: 11px; fill: none; stroke: var(--blue); stroke-width: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .sts .st{color: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .ic-x{width: auto; height: 20px; padding: 0 6px; border: 1px solid var(--gd); color: var(--gold-hi); font: 11px var(--serif); margin-top: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead .nmw{display: inline-flex; align-items: baseline; gap: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead .ty{font: 9px var(--serif); color: var(--faint); letter-spacing: .06em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead .aw{overflow: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead .aw::after{content: ""; position: absolute; left: 0; bottom: 0; height: 2px; width: var(--p, 0); background: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .skill{z-index: 6; display: flex; align-items: center; gap: 6px; padding: 0 9px 0 6px; height: 30px; background: #1c1d27; border-left: 2px solid var(--jade); font: 12px var(--title); color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .skill .sc{display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--gold); font: 600 11px var(--num); color: var(--gold-hi); font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .skill b{font-weight: 400; letter-spacing: .08em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .skill{left: 104px; top: 581px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .skill{left: 296px; top: 622px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .bag{width: auto; padding: 0 7px; display: flex; align-items: center; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .bag em{position: static; font: 600 11px var(--num); color: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .lead{width: 148px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .mates{left: 166px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .mate{width: 38px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .mate .hpbar{width: 32px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .bag{left: 284px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .piles{left: 338px; width: 46px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .piles{left: 1144px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .fls{position: absolute; right: 3px; top: 7px; display: flex; gap: 2px; align-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .fl{font: 600 9px/14px var(--num); font-style: normal; height: 14px; padding: 0 3px; min-width: 14px; text-align: center; text-decoration: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .fl.was{font-size: 11px; color: var(--faint); text-decoration: line-through; padding: 0; min-width: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .fl.plus{background: var(--gold); color: #121212;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .fl.tmp,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .fl.kw{font: 600 9px/12px var(--serif); border: 1px solid var(--dim); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .fl.kw{border-color: var(--red); color: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .fl.nn{background: #2c2d3a; color: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .fls{right: auto; left: 5px; top: 33px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .fl.was::before{content: "原"; font: 9px var(--serif); margin-right: 1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .rar{position: absolute; left: 0; right: 0; bottom: 2px; display: flex; justify-content: center; gap: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .rar i{width: 4px; height: 4px; background: var(--gold-hi); transform: rotate(45deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .rar{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .val{bottom: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .val{bottom: 46px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card .val{bottom: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .val{bottom: 56px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .val b.up{color: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .val b.up::after{content: "▲"; font: 8px var(--serif); vertical-align: top; margin-left: 1px; color: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .desc .src{display: block; margin-top: 2px; font: 10.5px var(--serif); color: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .tag{right: 4px; white-space: nowrap; overflow: hidden; font-size: 9.5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.cut .cost{color: var(--jade); border-color: var(--jade);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .hand .card.tmp{border-style: dashed;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .hand .card.stack{box-shadow: 0 -4px 0 -1px #3a3b4a, 0 -7px 0 -2px #272835;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .name{top: 29px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .art{top: 43px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .name{top: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .art{top: 52px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .skill{z-index: 5;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .art{width: 48px; height: 48px; top: 58px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .val{bottom: 62px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .tag{left: 8px; top: 34px; right: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .fls{left: auto; right: 6px; top: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .fl.was{text-decoration: none; color: var(--dim); font: 10px/14px var(--serif);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .fl.was::before{content: "原费用 "; margin-right: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .fl.was{font-size: 12px; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .art{width: 64px; height: 64px; top: 62px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .val{bottom: 60px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .tag{left: 10px; top: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .fls{top: 13px; right: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .fls{right: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead .hp{margin-left: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .fl.plus{font-size: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card:not(.sel) .fls{right: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .energy{z-index: 5;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card:not(.sel) .fl.was{font: 600 14px/14px var(--num); color: var(--text); text-decoration-thickness: 1.5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .tag,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .val em{display: none !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .fl.was{text-decoration: line-through; color: var(--dim); font: 600 13px/14px var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .fl.was::before{content: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .rar{display: flex; bottom: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .art{top: 46px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .val{bottom: 62px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .rar{bottom: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .art{top: 52px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .r-rare .cost{box-shadow: 0 0 0 2px #15161d, 0 0 0 3px var(--gd);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .r-epic .cost{box-shadow: 0 0 0 2px #15161d, 0 0 0 3px var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .fl.was{font: 600 17px/16px var(--num); color: var(--text); top: -1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .fl.was{font-size: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card:not(.sel) .art{opacity: .14; width: 44px; height: 44px; top: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card:not(.sel) .rar,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card:not(.sel) .fl.kw,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card:not(.sel) .fl.nn,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card:not(.sel) .was{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card:not(.sel) .fl.plus .n{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card:not(.sel) .fl.plus{background: none; color: var(--gold-hi); font: 700 14px/14px var(--num); padding: 0; min-width: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card:not(.sel) .art{width: 60px; height: 60px; top: 46px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .was{display: none; position: absolute; left: 31px; top: 14px; font: 600 11px/12px var(--num); color: var(--dim); text-decoration: line-through;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .was{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel.cut .name{left: 46px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .fls{top: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .was{left: 39px; top: 17px; font-size: 13px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel.cut .name{left: 56px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .head{margin-bottom: -10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .foes{--ground: 0px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .foes{--ground: 0px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .head{margin-bottom: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .head{margin-bottom: -14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .was{font: 600 15px/16px var(--num); color: var(--text); left: 33px; top: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .was{font-size: 18px; left: 41px; top: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .was{font: 500 18px/18px var(--serif); color: var(--dim); text-decoration-thickness: 1px; left: 34px; top: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .was{font-size: 22px; left: 42px; top: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .was{left: 25px; top: 21px; font: 600 11px/12px var(--num); color: var(--text); text-decoration: none; z-index: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .was::after{content: ""; position: absolute; left: -2px; right: -2px; top: 50%; height: 1.5px; background: var(--red); transform: rotate(-38deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel.cut .name{left: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .was{left: 31px; top: 24px; font-size: 13px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel.cut .name{left: 48px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .was{left: 27px; top: 17px; font: 600 15px/16px var(--num); width: 10px; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .was::after{left: -3px; right: -3px; height: 1px; transform: rotate(-45deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel.cut .name{left: 46px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .was{left: 33px; top: 20px; font-size: 18px; line-height: 19px; width: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel.cut .name{left: 54px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .gate{z-index: 2; pointer-events: none; transform: scaleY(.24);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .gate svg{position: absolute; inset: 0; width: 100%; height: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .g1{transform: rotate(var(--ringrot, 0deg));}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .g2{transform: rotate(calc(var(--ringrot, 0deg) * -1));}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .gate{left: 5px; top: 340px; width: 380px; height: 380px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .gate{left: 470px; top: 290px; width: 340px; height: 340px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .foes{--ground: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .foes{--ground: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .topbar{z-index: 5; left: 18px; top: 16px; display: flex; align-items: baseline; gap: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .topbar{left: 36px; top: 24px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .title{font: 400 20px var(--title); letter-spacing: .2em; padding-bottom: 5px; border-bottom: 1px solid var(--gd); position: relative;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .title::after{content: ""; position: absolute; left: 0; bottom: -3px; width: 5px; height: 5px; background: var(--gold); transform: rotate(45deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .round{font: 13px var(--serif); letter-spacing: .12em; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .track{left: 400px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .intent{border-left: 2px solid var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .n{font-family: var(--title); letter-spacing: .12em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead .face{width: 44px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead .pic{position: absolute; inset: 4px; border-radius: 50%; background-size: 300% auto; box-shadow: 0 0 0 1px var(--gold), 0 0 12px #7a77ad66;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .tk{position: absolute; inset: 0; width: 100%; height: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .lead .face{width: 72px; height: 72px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .lead .aw{position: absolute; left: 50%; bottom: -5px; transform: translateX(-50%); padding: 0 5px; background: #0c0c10; border: 1px solid var(--gold); font: 9px var(--serif); color: var(--gold-hi); white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .lead .aw{font-size: 11px; padding: 1px 8px; bottom: -8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .hand .card{background: #14151c; border: 1px solid #3b3a55; box-shadow: 0 -6px 14px #0008;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .edge{top: -1px; left: 14%; right: 14%; height: 1px; box-shadow: 0 0 8px var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.r-rare{border-color: #6e633f;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.r-epic{border-color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.r-myth{border-color: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .cost{width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--gold); display: grid; place-items: center; font: 600 11px var(--num); color: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .cost{width: 24px; height: 24px; font-size: 13px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel{border-color: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .energy{text-align: center; display: grid; place-content: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .energy .v{font: 500 24px/1 var(--num); color: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .energy small{font-size: 12px; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .pips{display: flex; gap: 8px; justify-content: center; margin-top: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .pips i{width: 7px; height: 7px; background: var(--gold-hi); transform: rotate(45deg); box-shadow: 0 0 8px #e3d49c;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .pips i.off{background: #3b3a55; box-shadow: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .end{background: #b9a46a; color: #121212; border-radius: 22px; --hr: 27px; box-shadow: 0 0 22px #7a77ad66;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .end b{font: 400 15px var(--title); letter-spacing: .08em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .end b{font-size: 17px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .hold .run{stroke: #e3d49c;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .foes{top: 70px; height: 515px; --ground: 0px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .foes{top: 66px; height: 447px; --ground: 0px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .gate{left: 5px; top: 370px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .gate{left: 470px; top: 310px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .foes{top: 70px; height: 530px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .foes{top: 66px; height: 480px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .gate{top: 382px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .gate{top: 351px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .dial,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .dial2{pointer-events: none; z-index: 1; transform-origin: 50% 50%; opacity: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .dial2{transform: rotate(var(--ringrot, 0deg));}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .dial,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .dial2{left: -5px; top: 135px; width: 400px; height: 400px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .dial,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .dial2{left: 450px; top: 105px; width: 380px; height: 380px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .gate{top: 338px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .gate{top: 352px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .foes{top: 70px; height: 500px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .foes{top: 66px; height: 470px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .head{width: 220px; margin-left: -110px; gap: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .foe .head{width: 260px; margin-left: -130px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .head .intent{border: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .foe .head .row2{opacity: var(--fi, 1); display: flex; flex-direction: column; align-items: center; gap: 3px; width: 100%; text-shadow: 0 1px 6px #000;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .row2 .nl{display: flex; justify-content: space-between; align-items: baseline; width: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .row2 .nm{display: inline-flex; align-items: center; gap: 6px; font: 400 16px var(--title); letter-spacing: .12em; white-space: nowrap; color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .row2 .hpn{font: 500 12px var(--num); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .row2 .hpbar{width: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .row2 .sts{min-height: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).pick .foe.front .art::after{content: ""; position: absolute; left: 14%; right: 14%; bottom: 2%; height: 22px; border: 1.5px solid var(--gold-hi); border-radius: 50%; box-shadow: 0 0 14px #e3d49c;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).pick .foe.front .head .intent{outline: 1.5px solid var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .val{display: flex; justify-content: center; align-items: center; gap: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card .val svg{width: 13px; height: 13px; flex: none; fill: none; stroke: var(--tc); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .card.sel .val svg{width: 17px; height: 17px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card .val svg{width: 15px; height: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .card.sel .val svg{width: 20px; height: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .lead{top: 755px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .mates{top: 753px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .piles{left: 314px; top: 753px; width: 62px; height: 52px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .piles{left: 1100px; top: 632px; width: 76px; height: 52px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .piles{display: flex; flex-direction: column; justify-content: space-between;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .pile{display: flex; justify-content: space-between; align-items: baseline; width: 100%; height: 24px; padding: 0 2px; border: 0; border-bottom: 1px solid #4a4332; font: 12px var(--title); letter-spacing: .08em; color: var(--dim); cursor: default;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .pile b{font: 600 13px var(--num); letter-spacing: 0; color: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .pile.disc b{color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .pile{font-size: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .pile b{font-size: 15px;}
#igs-overlay #igs-cx-canvas:where([data-cx="mystic"]) .pile{background: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .energy{left: 16px; top: 546px; width: 70px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .skill,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .bag{height: 30px; border: 0; border-bottom: 1px solid #6e633f; border-radius: 0; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .skill .sc{border-color: #6e633f; color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .skill b,#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .bag b{color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .bag svg{opacity: .8;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .bag em{color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .bag b{font: 400 12px var(--title); letter-spacing: .08em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .bag svg{stroke: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .bag em{font-style: normal;}
#igs-overlay #igs-cx-canvas:where([data-cx="mystic"]) .skill,#igs-overlay #igs-cx-canvas:where([data-cx="mystic"]) .bag{background: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .skill{left: 94px; top: 553px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .bag{left: 188px; top: 553px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .energy{left: 296px; top: 540px; width: 90px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .skill{left: 296px; top: 592px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .bag{left: 296px; top: 636px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .hand{top: 604px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .hand{top: 488px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .tray{display: none; z-index: 8; background: #0c0c10; padding: 7px 8px 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .tray::before{content: ""; position: absolute; left: 12%; right: 12%; top: 0; height: 1px; background: linear-gradient(90deg, #0c0c10, var(--gold), #0c0c10);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).tray-open .tray{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .tray{left: 16px; top: 466px; width: 290px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .tray{left: 392px; top: 420px; width: 380px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .th{display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .th b{font: 400 13px var(--title); letter-spacing: .12em; color: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .th .hint{font: 11px var(--serif); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .slots{display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .slot{height: 40px; padding: 0 7px; display: flex; align-items: center; gap: 5px; background: #1c1d27; font: 12px var(--title); color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .slot svg{width: 18px; height: 18px; flex: none; fill: none; stroke: var(--jade); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .slot.tg svg{stroke: var(--red);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .slot .sn{flex: 1; text-align: left; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .slot .sx{font: 600 11px var(--num); font-style: normal; color: var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .slot.on{outline: 1.5px solid var(--gold-hi);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .slot.off{opacity: .45;}
#igs-overlay #igs-cx-canvas:where([data-cx="mystic"]) .slot{background: #1c1d27;}
#igs-overlay #igs-cx-canvas:where([data-cx="mystic"]) .slot.on{background: #2a2820;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .end{background: none; box-shadow: none; border-radius: 50%; display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).port .end{left: 318px; top: 530px; width: 58px; height: 58px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .end{left: 1100px; top: 534px; width: 72px; height: 72px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .clk{position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .clk .cf{fill: #1c1d27; stroke: #b9a46a; stroke-width: 1.2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .clk .trk{stroke: #2c2d3a; stroke-width: 1.5;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .clk .run{stroke: var(--gold-hi); stroke-width: 2; stroke-linecap: round;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .clk .tk{stroke: #8c7d4e; stroke-width: .9;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .end b{position: relative; z-index: 1; display: block; width: 100%; text-align: center; font: 400 13px/1.2 var(--title); letter-spacing: .1em; text-indent: .1em; color: var(--gold-hi); white-space: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .end b{font-size: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .end{cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .end.hold .clk{filter: drop-shadow(0 0 6px #e3d49c);}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]) .end.done .cf{stroke: var(--gold-hi); stroke-width: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .skill{left: 1186px; top: 540px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .bag{left: 1186px; top: 580px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .tray{left: 792px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .track{left: 40px; top: 84px; flex-direction: column;}
#igs-overlay :where(.igs-cx-canvas[data-cx="mystic"],.igs-cx-ghost[data-cx="mystic"]).land .foes{top: 116px;}
`;
