// 由 gal/战斗界面设计稿/落盘/gen-skin-css.mjs 从概念稿 ../../落盘/gen-skins/ink-src.css 生成，不要手改；改设计稿后重新生成。
// 选择器作用域见生成脚本说明，规则内容与设计稿一致（本地图片地址换成 none）。
export const COMBAT_SKIN_INK_CONCEPT_CSS = `
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) *{box-sizing: border-box; margin: 0; padding: 0;}
#igs-overlay #igs-cx-canvas:where([data-cx="ink"]){position: relative; margin: 0 auto; overflow: hidden; background: var(--ink); font-family: var(--font-song); color: var(--text);}
#igs-overlay #igs-cx-canvas:where([data-cx="ink"]).port{width: 390px; height: 844px;}
#igs-overlay #igs-cx-canvas:where([data-cx="ink"]).land{width: 1280px; height: 720px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) button{font: inherit; color: inherit; background: none; border: 0; cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) svg{fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .stage,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foes,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .stage .bg{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .stage .bg{background: none center/cover no-repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foes{z-index: 5;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe{position: absolute; left: 50%; width: var(--w); margin-left: calc(var(--w) / -2); bottom: calc(var(--base, 0px) + var(--fb, 0px)); transform: translateX(var(--fx, 0)) scale(var(--fs, 1)); transform-origin: 50% 100%; z-index: var(--fz, 1); cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .art{position: relative; width: 100%; height: calc(var(--w) * 1.3); filter: brightness(var(--fl, 1)) saturate(var(--fsat, 1)) grayscale(var(--gs, 0.82));}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .art .igs-combat-art{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .plate{position: absolute; left: 50%; bottom: 100%; width: 150px; margin: 0 0 calc(var(--w) * -0.085) -75px; opacity: var(--fi, 1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .plate .n{display: flex; align-items: baseline; justify-content: space-between;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .intent{position: absolute; left: 50%; bottom: calc(100% + 46px - var(--w) * .085); transform: translateX(-50%); opacity: var(--fi, 1); display: flex; align-items: center; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .intent svg{width: 14px; height: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .hpbar{position: relative; overflow: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .hpbar i{position: absolute; left: 0; top: 0; bottom: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .topbar,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .track,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .deck{position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .topbar{z-index: 12; display: flex; align-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .topbar .x svg{width: 16px; height: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .track{z-index: 11; display: flex; align-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .track .who{position: relative; border-radius: 50%; overflow: hidden; flex: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .track .who .igs-combat-art{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .deck{z-index: 10;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .floor{position: absolute; left: 0; right: 0; bottom: 0; z-index: 8; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .deck > *{position: absolute;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ch{display: grid; place-items: center; font-family: var(--font-brush);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .lead{display: flex; align-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .lead .face{position: relative; flex: none; border-radius: 50%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .lead .info{min-width: 0; flex: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .lead .n{display: flex; align-items: baseline; justify-content: space-between;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .chips{display: flex; gap: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .chip{display: inline-flex; align-items: center; gap: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .chip svg{width: 11px; height: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .mates{display: flex; flex-direction: column;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .mate{display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: 7px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .mate .mface{grid-row: 1 / 3; border-radius: 50%; background-repeat: no-repeat; background-size: 300% auto; display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .mate .mn{white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .hand{overflow: visible;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card{position: absolute; transform-origin: 50% 100%; cursor: pointer; transition: transform .28s cubic-bezier(.2, .8, .2, 1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .art{position: relative;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .art svg{width: 100%; height: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .val{display: flex; align-items: baseline;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .val em{font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .piles{display: flex; align-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .piles .mini{position: relative; display: inline-grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .piles .mini svg{width: 15px; height: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .piles .mini i{position: absolute; font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .energy{display: flex; align-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .energy .pips{display: flex;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .end{cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe.front{pointer-events: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="ink"]){--ink: #101619; --edge: #0a0f11; --panel-2: #1a2326; --line: #2c393d; --text: #f1eee3; --dim: #a5b0aa; --faint: #5f6e6b; --slip: #f1eee3; --moon: #e8efe9; --slip-ink: #101619; --slip-off: #aeb4a8; --cin: #d4503a; --azu: #4f8fc0; --mal: #5fb08c; --gilt: #d9b45a; --halo: 0 0 10px var(--edge), 0 1px 2px var(--edge);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .stage .bg{filter: saturate(.72) brightness(.6) contrast(1.05);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .stage::after{content: ""; position: absolute; inset: 0; background: linear-gradient(to bottom, var(--ink) 0, transparent 20%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .floor{background: linear-gradient(to bottom, rgba(16,22,25,0) 0, rgba(16,22,25,.22) 18%, rgba(16,22,25,.62) 42%, rgba(16,22,25,.9) 68%, #101619 88%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .hpbar{height: 6px; background: #2c393d; -webkit-mask: var(--wx-bar) center/100% 100% no-repeat; mask: var(--wx-bar) center/100% 100% no-repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .hpbar i{background: var(--cin);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .hpbar.ally i{background: var(--mal);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .hpbar.thin{height: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .art{--gs: .35;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .plate{width: 250px; margin: 0 0 calc(var(--w) * -0.085) -125px; display: flex; align-items: center; gap: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .plate .pn{font: 400 20px/1 var(--font-brush); letter-spacing: .1em; text-shadow: var(--halo); white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .plate .tier{background: var(--gilt); color: var(--slip-ink); font: 11px/14px var(--font-brush); width: 14px; text-align: center; flex: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .plate .hpbar{flex: 1; min-width: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .plate .php{font: 12px var(--font-song); color: var(--text); text-shadow: var(--halo); white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .plate .pst{display: flex; gap: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .sc{display: inline-flex; align-items: baseline; gap: 1px; padding: 1px 4px; background: var(--panel-2); color: var(--text); font: 10px/14px var(--font-song); font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .sc b{color: var(--gilt); font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .intent{bottom: calc(100% + 28px - var(--w) * .085);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .intent{height: 26px; padding: 0 16px; gap: 5px; background: var(--cin); color: var(--slip); -webkit-mask: var(--wx-tag-h) center/100% 100% no-repeat; mask: var(--wx-tag-h) center/100% 100% no-repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .intent b{font: 700 17px var(--font-song);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .intent em{font: 12px var(--font-song);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe.target .art{filter: brightness(1.08) grayscale(.3);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .topbar .title{position: relative; background: var(--slip); color: var(--slip-ink); -webkit-mask: var(--wx-tag-v) center/100% 100% no-repeat; mask: var(--wx-tag-v) center/100% 100% no-repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .topbar .title b{display: block; white-space: nowrap; font: 400 20px/1.15 var(--font-brush); writing-mode: vertical-rl; letter-spacing: .14em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .topbar .round{font: 13px var(--font-song); letter-spacing: .16em; text-shadow: var(--halo);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .tools{position: absolute; display: flex;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .tl{display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; width: 40px; height: 46px; color: var(--text); filter: drop-shadow(0 0 3px var(--edge));}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .tl svg{width: 18px; height: 18px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .tl span{font: 10px/1 var(--font-song); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .track::before{content: ""; position: absolute; background: var(--faint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .track .who{box-shadow: 0 0 0 1.5px var(--faint); background-color: var(--panel-2);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .track .who.now{box-shadow: 0 0 0 2px var(--gilt), 0 0 0 4px var(--edge);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .track .who.ally{box-shadow: 0 0 0 1.5px var(--mal);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .track .ch{color: var(--text); font-size: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .deck > *{z-index: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .lead .face{background-color: var(--panel-2); box-shadow: 0 0 0 2px var(--slip), 0 0 0 4px var(--edge);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .lead .face .aw{position: absolute; left: 50%; bottom: -7px; transform: translateX(-50%); padding: 1px 7px; background: var(--gilt); color: var(--slip-ink); font: 12px/1.2 var(--font-brush); letter-spacing: .1em; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .lead .n{font: 400 20px var(--font-brush); letter-spacing: .12em; text-shadow: var(--halo);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .lead .n .hp{font: 12px var(--font-song); color: var(--dim); letter-spacing: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .lead .n .hp b{color: var(--mal); font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .chips{margin-top: 6px; font-size: 11px; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .chip b{color: var(--text); font-weight: 400;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .mate .mface{background-color: var(--panel-2); box-shadow: 0 0 0 1.5px var(--mal); color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .mate .mn{font-size: 11px; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .piles{font-size: 11px; color: var(--dim); gap: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .piles b{color: var(--text); font-weight: 400;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card{--dry: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 20' preserveAspectRatio='none'%3E%3Cfilter id='f' x='0' y='-50%25' width='100%25' height='200%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.05 .45' numOctaves='2' seed='3'/%3E%3CfeDisplacementMap in='SourceGraphic' scale='10'/%3E%3C/filter%3E%3Crect x='0' y='4' width='200' height='11' fill='%23000' filter='url%28%23f%29'/%3E%3C/svg%3E"); background: radial-gradient(ellipse 80% 55% at 85% 100%, #20272a 0, #15181a 100%); color: var(--moon); border-radius: 4px; box-shadow: 0 2px 7px var(--edge); overflow: hidden; --tc: var(--cin); --moon: #e8efe9; transition: transform .28s cubic-bezier(.2, .8, .2, 1), width .2s, height .2s;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.t-atk{--tc: var(--cin);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.t-def{--tc: var(--azu);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.t-skl{--tc: var(--azu);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.t-heal{--tc: var(--mal);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.t-pow{--tc: var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card::before{content: ""; position: absolute; left: 0; right: 0; top: 0; height: 9px; background: var(--tc); -webkit-mask: var(--dry) center/100% 100% no-repeat; mask: var(--dry) center/100% 100% no-repeat; z-index: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-rare::before{height: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-epic::before{height: 15px; background: linear-gradient(to bottom, var(--tc) 0, var(--tc) 55%, var(--gilt) 56%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card > *{z-index: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .cost{position: absolute; left: 6px; top: 13px; width: 18px; height: 18px; border-radius: 50%; background: var(--gilt); color: #15181a; font: 700 12px/18px var(--font-song); text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-rare .cost{box-shadow: 0 0 0 1.5px #15181a, 0 0 0 3px var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-epic .cost{box-shadow: 0 0 0 1.5px #15181a, 0 0 0 3px var(--gilt), 0 0 0 4.5px #15181a, 0 0 0 6px var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .name.n4{font-size: 11px; left: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .name{position: absolute; left: 6px; top: 38px; right: 2px; font: 700 13px/1.15 var(--font-song); letter-spacing: 0; white-space: nowrap; color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .art{display: none; position: absolute; left: 50%; color: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .art svg{width: 100%; height: 100%; display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .val{position: absolute; left: 7px; bottom: 8px; align-items: center; gap: 4px; color: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .val b{font: 700 22px/1 var(--font-song);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .gl{width: 13px; height: 13px; flex: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .gl.f{fill: currentColor; stroke: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .gl.s{stroke-width: 2.2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .fx{display: none; position: absolute; font: 10px/1.45 var(--font-song); color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel{box-shadow: 0 0 0 1.5px var(--gilt), 0 4px 12px var(--edge);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel .fx{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel .art{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.poor .name,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.poor .val{color: var(--faint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.poor .cost{background: var(--faint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .energy .v{font: 700 32px/1 var(--font-song); color: var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .energy .v small{font-size: 16px; color: var(--dim); font-weight: 400;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .energy .pips{gap: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .energy .pips i{width: 8px; height: 8px; transform: rotate(45deg); background: var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .energy .pips i.off{background: var(--line);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) button.end{background: var(--slip); color: var(--slip-ink); -webkit-mask: var(--wx-tag-h) center/100% 100% no-repeat; mask: var(--wx-tag-h) center/100% 100% no-repeat; display: grid; place-items: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .end b{font: 400 17px var(--font-brush); letter-spacing: .1em; text-indent: .1em; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .seal{position: absolute; z-index: 13; width: 20px; height: 20px; background: var(--seal); color: var(--text); font: 12px/20px var(--font-song); text-align: center; -webkit-mask: var(--wx-seal-small) center/100% 100% no-repeat; mask: var(--wx-seal-small) center/100% 100% no-repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .floor{background: linear-gradient(to bottom, rgba(16,22,25,0) 0, rgba(16,22,25,.3) 14%, rgba(16,22,25,.78) 34%, rgba(16,22,25,.95) 56%, #101619 74%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .sq{position: absolute; width: 46px; height: 44px; background: #3a4b50; color: var(--text); border-radius: 5px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .sq svg{width: 18px; height: 18px; color: var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .sq span{font: 10px/1 var(--font-song); white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .sq span b{font-weight: 700; color: var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .sq .bd{position: absolute; right: 3px; top: 3px; width: 13px; height: 13px; border-radius: 50%; background: var(--gilt); color: var(--slip-ink); font: 700 9px/13px var(--font-song); text-align: center; font-style: normal;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).tray-on .sq.items{background: #2c393d; box-shadow: 0 0 0 1.5px var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).tray-on .sq.items svg,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).tray-on .sq.items span b{color: var(--cin);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .tray{display: none; z-index: 20 !important; background: var(--panel-2); -webkit-mask: var(--wx-tag-h) center/100% 100% no-repeat; mask: var(--wx-tag-h) center/100% 100% no-repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).tray-on .tray{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .tray .th{font: 12px/1 var(--font-song); color: var(--dim); padding: 18px 16px 0; letter-spacing: .08em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).aim .tray .th{color: var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .tray .tg{display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 8px 14px 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti{position: relative; height: 62px; background: #2c393d; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--text);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti svg{width: 24px; height: 24px; color: var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti span{font: 12px/1 var(--font-song); white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti i{position: absolute; right: 5px; top: 4px; font: 700 11px/1 var(--font-song); font-style: normal; color: var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.off{background: #1c2528; color: var(--faint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.off svg,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.off i{color: var(--faint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.on{background: #2c393d; color: var(--text); box-shadow: 0 0 0 1.5px var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.on svg,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.on i{color: var(--cin);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .foes{--base: 232px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .floor{height: 300px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .topbar{left: 0; right: 0; top: 0; height: 60px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .topbar .title{position: absolute; left: 14px; top: 14px; width: 34px; height: 124px; padding: 14px 0 0 7px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .topbar .round{position: absolute; left: 0; right: 0; top: 18px; text-align: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .tools{right: 8px; top: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .seal{left: 21px; top: 146px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .track{left: 18px; top: 182px; flex-direction: column; gap: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .track::before{left: 50%; top: 0; bottom: 0; width: 1px; z-index: -1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .track .who{width: 26px; height: 26px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .track .who.now{width: 34px; height: 34px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .deck{left: 0; top: 538px; width: 390px; height: 306px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .energy{left: 14px; top: 0; width: 60px; flex-direction: column; align-items: flex-start; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .energy .v{font-size: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .skill{left: 80px; top: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .items{left: 132px; top: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .piles{left: 192px; top: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .end{right: 14px; top: 0; width: 76px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .tray{left: 12px; right: 12px; bottom: 318px; height: 114px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .hand{left: 14px; top: 68px; width: 362px; height: 118px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card{width: 62px; height: 112px; top: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel{width: 100px; height: 164px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel .name.n4{font-size: 14px; left: 32px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel .cost{top: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel .name{left: 32px; top: 17px; font-size: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel .art{top: 46px; width: 44px; height: 44px; margin-left: -22px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel .val{top: 96px; bottom: auto; left: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel .val b{font-size: 26px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel .fx{left: 10px; right: 8px; top: 130px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .lead{left: 14px; top: 204px; width: 240px; gap: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .lead .face{width: 54px; height: 54px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .mates{right: 12px; top: 202px; width: 112px; gap: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .mate .mface{width: 22px; height: 22px; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .foes{--base: 177px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .floor{height: 270px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .topbar{left: 0; right: 0; top: 0; height: 64px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .topbar .title{position: absolute; left: 26px; top: 18px; width: 38px; height: 128px; padding: 14px 0 0 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .topbar .round{position: absolute; left: 0; right: 0; top: 22px; text-align: center; font-size: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .tools{right: 20px; top: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .tl{width: 46px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .seal{left: 35px; top: 154px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .track{left: 92px; top: 26px; gap: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .track::before{left: 0; right: 0; top: 50%; height: 1px; z-index: -1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .track .who{width: 30px; height: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .track .who.now{width: 40px; height: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .deck{left: 0; top: 480px; width: 1280px; height: 240px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .lead{left: 30px; top: 44px; width: 330px; gap: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .lead .face{width: 64px; height: 64px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .mates{left: 30px; top: 132px; width: 400px; flex-direction: row; gap: 18px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .mate .mface{width: 26px; height: 26px; font-size: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .mate{width: 112px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .hand{left: 410px; top: 24px; width: 600px; height: 150px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .piles{left: 410px; top: 192px; flex-direction: row; gap: 16px; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .energy{left: 1040px; top: 20px; flex-direction: column; align-items: flex-start; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .skill{left: 1112px; top: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .items{left: 1166px; top: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .end{right: 40px; top: 96px; width: 110px; height: 48px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .end b{font-size: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .tray{right: 40px; width: 320px; bottom: 228px; height: 114px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card{width: 94px; height: 140px; top: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card .name.n4{font-size: 15px; left: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card .name{font-size: 16px; top: 44px; left: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card .cost{left: 10px; top: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card .val b{font-size: 26px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel{width: 120px; height: 178px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel .name.n4{font-size: 16px; left: 38px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel .name{left: 38px; top: 19px; font-size: 17px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel .art{top: 54px; width: 48px; height: 48px; margin-left: -24px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel .val{top: 112px; bottom: auto; left: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel .val b{font-size: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel .fx{left: 12px; right: 10px; top: 148px; font-size: 11px;}
#igs-overlay #igs-cx-canvas:where([data-cx="ink"]){--stone: #4f8f76; --inkring: #0a0f11; --inkhair: #3a4b50;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .track .who{box-shadow: 0 0 0 2.5px var(--inkring), 0 0 0 3.5px var(--inkhair); background-color: var(--panel-2); position: relative;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .track .who.ally{box-shadow: 0 0 0 2.5px var(--inkring), 0 0 0 3.5px var(--inkhair);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .track .who.now{box-shadow: 0 0 0 3px var(--inkring), 0 0 0 4.5px var(--inkhair);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .track .who.now::after{content: ""; position: absolute; right: -3px; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: var(--cin); box-shadow: 0 0 0 1.5px var(--inkring);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .track .who:not(.ally):not(.now):not(.ch):not(.face-nz):not(.face-sr){box-shadow: 0 0 0 1.5px var(--cin);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .lead .face{position: relative; box-shadow: 0 0 0 3px var(--inkring), 0 0 0 4.5px var(--inkhair);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .lead .face::after{content: ""; position: absolute; right: -2px; top: -2px; width: 10px; height: 10px; border-radius: 50%; background: var(--cin); box-shadow: 0 0 0 2px var(--inkring);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .lead .face .aw{background: var(--cin); color: var(--moon); border-radius: 1px; padding: 1px 6px; font: 12px/1.2 var(--font-brush); letter-spacing: .08em; box-shadow: 0 0 0 1.5px var(--inkring);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .mate .mface{box-shadow: 0 0 0 2px var(--inkring), 0 0 0 3px var(--inkhair);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .hpbar.ally i{background: var(--stone);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .lead .n .hp b{color: #6aa690;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .sc{background: #0a0f11; color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .sc b{color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .chip b{color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.t-heal{--tc: var(--stone);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel{box-shadow: 0 10px 22px #05080a; background: radial-gradient(ellipse 95% 70% at 50% 100%, #2c3a3f 0, #1a2023 55%, #15181a 100%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel::before{height: 16px; filter: brightness(1.25) saturate(1.1);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel.r-rare::before,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel.r-epic::before{height: 18px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .hand:has(.card.sel) .card:not(.sel){filter: brightness(.7);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-rare .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-epic .cost{box-shadow: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-rare .cost{width: 22px; height: 22px; line-height: 22px; font-size: 13px; left: 4px; top: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-epic .cost{width: 24px; height: 24px; line-height: 24px; font-size: 14px; left: 3px; top: 10px; border-radius: 0; -webkit-mask: var(--wx-seal-small) center/100% 100% no-repeat; mask: var(--wx-seal-small) center/100% 100% no-repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.r-rare .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.r-epic .cost{left: 8px; top: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel.r-rare .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel.r-epic .cost{top: 13px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).tray-on .sq.items{background: #3a4b50; box-shadow: none; transform: translateY(-4px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).tray-on .sq.items svg{color: var(--cin);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.on{background: #3f5156; box-shadow: none; transform: translateY(-5px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.on span{color: #fff;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .tray .tg:has(.ti.on) .ti:not(.on){filter: brightness(.7);}
#igs-overlay #igs-cx-canvas:where([data-cx="ink"]){--wash: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 120' preserveAspectRatio='none'%3E%3Cfilter id='w' x='-20%25' y='-50%25' width='140%25' height='200%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.018 .04' numOctaves='3' seed='8'/%3E%3CfeDisplacementMap in='SourceGraphic' scale='70'/%3E%3CfeGaussianBlur stdDeviation='7'/%3E%3C/filter%3E%3Cellipse cx='150' cy='60' rx='105' ry='32' fill='%23000' filter='url%28%23w%29'/%3E%3C/svg%3E");}
#igs-overlay #igs-cx-canvas:where([data-cx="ink"]){--mottle: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 80' preserveAspectRatio='none'%3E%3Cfilter id='m' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.55' numOctaves='2' seed='11' result='n'/%3E%3CfeColorMatrix in='n' type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -5 0 0 0 4.1' result='h'/%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.06' numOctaves='2' seed='4' result='e'/%3E%3CfeDisplacementMap in='SourceGraphic' in2='e' scale='7' result='r'/%3E%3CfeComposite in='r' in2='h' operator='in'/%3E%3C/filter%3E%3Crect x='4' y='4' width='92' height='72' fill='%23000' filter='url%28%23m%29'/%3E%3C/svg%3E");}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) button.end{background: var(--cin); color: var(--moon); -webkit-mask: var(--mottle) center/100% 100% no-repeat; mask: var(--mottle) center/100% 100% no-repeat; position: absolute; overflow: hidden;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .end b{font: 400 22px var(--font-brush); letter-spacing: .12em; text-indent: .12em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .end::after{content: ""; position: absolute; left: 50%; top: 50%; width: 0; height: 0; border-radius: 50%; background: #8f2c20; transform: translate(-50%, -50%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .end:active::after{animation: inkspread .4s ease-out forwards;}
@keyframes inkspread{to { width: 220%; height: 360%; }}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .end{width: 70px; height: 56px; top: -6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .end{width: 76px; height: 60px; right: 44px; top: 90px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .end b{font-size: 24px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .sq{background: #0a0f11; border-radius: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).tray-on .sq.items{background: #0a0f11; box-shadow: none; transform: translateY(-5px) scale(1.08);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).tray-on .sq.items svg{color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).tray-on .sq.items span,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).tray-on .sq.items span b{color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).tray-on .sq.items::before,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.on::before{content: ""; position: absolute; inset: -14px -16px; z-index: -1; background: radial-gradient(ellipse at 45% 55%, #2a373b 0, #182125 50%, #0a0f11 100%); -webkit-mask: var(--wash) center/100% 100% no-repeat; mask: var(--wash) center/100% 100% no-repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).tray-on .sq.items{z-index: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .tray{background: #0a0f11;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .tray .tg{gap: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti{background: transparent; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti svg{color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti i{color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.off{background: transparent; color: #4a5753;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.off svg,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.off i{color: #3c4845;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.on{background: transparent; box-shadow: none; transform: translateY(-6px) scale(1.14); z-index: 2; color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.on svg{color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.on i{color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.on span{color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.on span::after{content: ""; display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--cin); margin-left: 4px; vertical-align: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .tray .tg:has(.ti.on) .ti:not(.on){filter: brightness(.6);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel{box-shadow: 0 0 0 1.5px var(--gilt), 0 10px 22px #05080a;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-rare .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-epic .cost{width: 18px; height: 18px; line-height: 18px; font-size: 12px; left: 6px; top: 13px; border-radius: 50%; -webkit-mask: none; mask: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-rare .cost{box-shadow: 0 0 0 1.5px #15181a, 0 0 0 3px var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-epic .cost{box-shadow: 0 0 0 1.5px #15181a, 0 0 0 3px var(--gilt), 0 0 0 4.5px #15181a, 0 0 0 6px var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.r-rare .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.r-epic .cost{left: 10px; top: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel.r-rare .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel.r-epic .cost{top: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).tray-on .sq.items{box-shadow: 0 0 0 1.5px var(--gilt);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .ti.on{box-shadow: 0 0 0 1.5px var(--gilt);}
#igs-overlay #igs-cx-canvas:where([data-cx="ink"]){--dryw: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 20' preserveAspectRatio='none'%3E%3Cfilter id='f' x='0' y='-50%25' width='100%25' height='200%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.05 .45' numOctaves='2' seed='9'/%3E%3CfeDisplacementMap in='SourceGraphic' scale='10'/%3E%3C/filter%3E%3Crect x='0' y='2' width='200' height='16' fill='%23000' filter='url%28%23f%29'/%3E%3C/svg%3E");}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .topbar .title{background: #0e1315; color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .topbar .title::before,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .topbar .title::after{content: ""; position: absolute; left: 3px; right: 3px; height: 6px; background: #3a4b50; -webkit-mask: var(--dry) center/100% 100% no-repeat; mask: var(--dry) center/100% 100% no-repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .topbar .title::before{top: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .topbar .title::after{bottom: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .swipe{position: absolute; z-index: 0 !important; background: #0a0f11; -webkit-mask: var(--dryw) center/100% 100% no-repeat; mask: var(--dryw) center/100% 100% no-repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .sq{background: transparent; border-radius: 0; width: 50px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .sq svg{color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .sq span{color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .sq span b{color: var(--cin);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .swipe{left: 76px; top: -8px; width: 118px; height: 62px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .skill{left: 80px; top: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .items{left: 138px; top: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .piles{left: 206px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .swipe{left: 1100px; top: 10px; width: 128px; height: 66px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .skill{left: 1106px; top: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .items{left: 1166px; top: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .plate{flex-wrap: wrap; row-gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .plate .pn{order: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .plate .tier{order: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .plate .php{order: 3; margin-left: auto;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .plate .hpbar{order: 4; flex: 0 0 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .plate .pst{order: 5; flex: 0 0 100%; min-height: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .foe .plate{width: 220px; margin-left: -110px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .foe .plate{width: 260px; margin-left: -130px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .foe .intent{bottom: calc(100% + 56px - var(--w) * .085);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .stage .bg{filter: saturate(.3) brightness(.6) contrast(1.05);}
#igs-overlay #igs-cx-canvas:where([data-cx="ink"]){--cin: #c75a4a; --azu: #6f91ad; --mal: #77a593; --gilt: #e0c88e;}
#igs-overlay #igs-cx-canvas:where([data-cx="ink"]){--stone: #6f9a8a;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel::before{filter: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card{--tc: var(--cin); --c-frame: #2c393d; --c-hi: #d9b45a; border-radius: 0; background: #131719; box-shadow: inset 0 0 0 1px var(--c-frame), 0 4px 10px var(--edge);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.t-atk{--tc: var(--cin);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.t-def,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.t-skl,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.t-heal{--tc: var(--mal);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.t-pow{--tc: var(--azu);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card::before,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel::before,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-rare::before,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-epic::before,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel.r-rare::before,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel.r-epic::before{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card:not(.sel) .art{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .val .gl{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-rare .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-epic .cost{left: 5px; top: 5px; width: 20px; height: 20px; line-height: 20px; font-size: 12px; border-radius: 0; -webkit-mask: none; mask: none; background: none; color: var(--moon); box-shadow: inset 0 0 0 1px var(--faint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-rare .cost{box-shadow: inset 0 0 0 1px var(--moon), inset 0 0 0 2px #131719, inset 0 0 0 3px var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.r-epic .cost{box-shadow: inset 0 0 0 2px var(--moon), inset 0 0 0 3px #131719, inset 0 0 0 4px var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.poor .cost{background: none; color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.poor:not(.sel){filter: saturate(.3) brightness(.62);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.poor .name,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.poor .val{color: inherit;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card:not(.sel) .name,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card:not(.sel) .name.n4{left: 30px; top: 6px; right: auto; writing-mode: vertical-rl; white-space: nowrap; font: 700 12px/14px var(--font-song); letter-spacing: .06em; color: var(--moon);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .val{left: 6px; bottom: 20px; color: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .val b{font: 700 21px/1 var(--font-song);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card .ut{position: absolute; left: 6px; bottom: 6px; font: normal 10px/1 var(--font-song); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .hand:has(.card.sel) .card:not(.sel){filter: brightness(.7);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel.r-rare,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel.r-epic{background: #131719; box-shadow: inset 0 0 0 1px var(--c-hi), 0 10px 22px #05080a;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel.r-rare .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel.r-epic .cost{left: 8px; top: 8px; width: 26px; height: 26px; line-height: 26px; font-size: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel .name,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel .name.n4{left: 40px; top: 12px; writing-mode: horizontal-tb; font-size: 14px; line-height: 18px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel .art{top: 40px; width: 36px; height: 36px; margin-left: -18px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel .val{top: auto; bottom: 24px; left: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel .ut{left: 9px; bottom: 9px; font-size: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).port .card.sel .fx{top: 82px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]) .card.sel .art{color: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card:not(.sel) .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card:not(.sel).r-rare .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card:not(.sel).r-epic .cost{left: 8px; top: 8px; width: 26px; height: 26px; line-height: 26px; font-size: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card:not(.sel) .name,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card:not(.sel) .name.n4{left: 40px; top: 9px; font-size: 15px; line-height: 17px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card .val{left: 9px; bottom: 26px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card .val b{font-size: 27px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card .ut{left: 9px; bottom: 9px; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel.r-rare .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel.r-epic .cost{left: 9px; top: 9px; width: 30px; height: 30px; line-height: 30px; font-size: 17px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel .name,#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel .name.n4{left: 48px; top: 14px; writing-mode: horizontal-tb; font-size: 17px; line-height: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel .art{top: 46px; width: 40px; height: 40px; margin-left: -20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel .val{top: auto; bottom: 24px; left: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel .ut{left: 10px; bottom: 8px; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="ink"],.igs-cx-ghost[data-cx="ink"]).land .card.sel .fx{top: 90px;}
#igs-overlay #igs-cx-canvas:where([data-cx="ink"]){--wx-bar: url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20200%209'%20preserveAspectRatio%3D'none'%3E%3Cdefs%3E%3Cfilter%20id%3D'rough'%20x%3D'-5%25'%20y%3D'-30%25'%20width%3D'110%25'%20height%3D'160%25'%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'.03%20.4'%20numOctaves%3D'3'%20seed%3D'5'%20result%3D'n'%2F%3E%3CfeDisplacementMap%20in%3D'SourceGraphic'%20in2%3D'n'%20scale%3D'7'%20xChannelSelector%3D'R'%20yChannelSelector%3D'G'%2F%3E%3C%2Ffilter%3E%3Cfilter%20id%3D'dryh'%20x%3D'-5%25'%20y%3D'-30%25'%20width%3D'110%25'%20height%3D'160%25'%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'.03%20.4'%20numOctaves%3D'3'%20seed%3D'5'%20result%3D'n'%2F%3E%3CfeDisplacementMap%20in%3D'SourceGraphic'%20in2%3D'n'%20scale%3D'7'%20xChannelSelector%3D'R'%20yChannelSelector%3D'G'%20result%3D'rough'%2F%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'.004%20.3'%20numOctaves%3D'2'%20seed%3D'21'%20result%3D's'%2F%3E%3CfeColorMatrix%20in%3D's'%20type%3D'matrix'%20values%3D'0%200%200%200%200%20%200%200%200%200%200%20%200%200%200%200%200%20%200%200%200%20-7%204.3'%20result%3D'streak'%2F%3E%3CfeComposite%20in%3D'rough'%20in2%3D'streak'%20operator%3D'in'%2F%3E%3C%2Ffilter%3E%3ClinearGradient%20id%3D'solidL'%20x1%3D'0'%20x2%3D'1'%3E%3Cstop%20offset%3D'0'%20stop-color%3D'%23fff'%2F%3E%3Cstop%20offset%3D'.42'%20stop-color%3D'%23fff'%2F%3E%3Cstop%20offset%3D'.96'%20stop-color%3D'%23fff'%20stop-opacity%3D'0'%2F%3E%3C%2FlinearGradient%3E%3Cmask%20id%3D'mSolidH'%20maskContentUnits%3D'objectBoundingBox'%3E%3Crect%20width%3D'1'%20height%3D'1'%20fill%3D'url%28%23solidL%29'%2F%3E%3C%2Fmask%3E%3Cpath%20id%3D'p'%20d%3D'M1%204.5%20C1%201.5%204%20.8%2010%201%20L196%202.6%20C198.6%203%20199.4%204.6%20197.4%206%20L10%208.2%20C4%208.4%201%207.4%201%204.5Z'%20fill%3D'%23fff'%2F%3E%3C%2Fdefs%3E%3Cuse%20href%3D'%23p'%20filter%3D'url%28%23dryh%29'%2F%3E%3Cg%20mask%3D'url%28%23mSolidH%29'%3E%3Cuse%20href%3D'%23p'%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E"); --wx-tag-h: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 60' preserveAspectRatio='none'%3E%3Cfilter id='d' x='-.02' y='-.2' width='1.04' height='1.4'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.04 .5' numOctaves='3' seed='3'/%3E%3CfeDisplacementMap in='SourceGraphic' scale='6' yChannelSelector='R'/%3E%3C/filter%3E%3ClinearGradient id='h'%3E%3Cstop offset='0' stop-color='%23fff' stop-opacity='0'/%3E%3Cstop offset='.07' stop-color='%23fff'/%3E%3Cstop offset='.93' stop-color='%23fff'/%3E%3Cstop offset='1' stop-color='%23fff' stop-opacity='0'/%3E%3C/linearGradient%3E%3Crect x='0' y='6' width='400' height='48' fill='url%28%23h%29' filter='url%28%23d%29'/%3E%3C/svg%3E"); --wx-tag-v: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 400' preserveAspectRatio='none'%3E%3Cfilter id='d' x='-.2' y='-.02' width='1.4' height='1.04'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.5 .04' numOctaves='3' seed='3'/%3E%3CfeDisplacementMap in='SourceGraphic' scale='6' xChannelSelector='R'/%3E%3C/filter%3E%3ClinearGradient id='h' x2='0' y2='1'%3E%3Cstop offset='0' stop-color='%23fff' stop-opacity='0'/%3E%3Cstop offset='.07' stop-color='%23fff'/%3E%3Cstop offset='.93' stop-color='%23fff'/%3E%3Cstop offset='1' stop-color='%23fff' stop-opacity='0'/%3E%3C/linearGradient%3E%3Crect x='6' y='0' width='48' height='400' fill='url%28%23h%29' filter='url%28%23d%29'/%3E%3C/svg%3E"); --wx-seal-small: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 60'%3E%3Cfilter id='e' x='-10%25' y='-10%25' width='120%25' height='120%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.04' numOctaves='2' seed='9' result='n'/%3E%3CfeDisplacementMap in='SourceGraphic' in2='n' scale='5.6' result='r'/%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.3' numOctaves='1' seed='3' result='g'/%3E%3CfeColorMatrix in='g' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -5 3.9' result='k'/%3E%3CfeComposite in='r' in2='k' operator='in'/%3E%3C/filter%3E%3Crect x='2' y='2' width='56' height='56' rx='1.5' fill='%23fff' filter='url%28%23e%29'/%3E%3C/svg%3E"); --seal: #a8382a; --font-brush: "IGS-MaShanZheng", "LXGW Neo ZhiSong", "KaiTi", serif; --font-song: "LXGW Neo ZhiSong", "Source Han Serif CN", "Noto Serif SC", serif;}
`;
