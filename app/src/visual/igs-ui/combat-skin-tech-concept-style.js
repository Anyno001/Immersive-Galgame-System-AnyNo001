// 由 gal/战斗界面设计稿/落盘/gen-skin-css.mjs 从概念稿 tech/common.css、../../落盘/gen-skins/tech-final.css 生成，不要手改；改设计稿后重新生成。
// 选择器作用域见生成脚本说明，规则内容与设计稿一致（本地图片地址换成 none）。
export const COMBAT_SKIN_TECH_CONCEPT_CSS = `
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]){--ink: #0e1114; --panel: #12171c; --panel2: #181f26; --line: #26323c; --hair: #3a5163; --cy: #7fd0ff; --cyd: #3d7ea5; --cydd: #1d3a4d; --or: #ff7a3d; --ord: #8a3a1c; --tx: #e9f1f6; --dim: #9fb0bb; --faint: #6b7d89; --mint: #6fe0b0; --vio: #b49cff; --rose: #ff6f7d; --gold: #ffd36e; --num: Bahnschrift, "DIN Alternate", "Arial Narrow", sans-serif; --ui: "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif; --cut6: polygon(0 6px, 6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%); --cut10: polygon(0 10px, 10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%); --cut16: polygon(0 16px, 16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) *{box-sizing: border-box;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]){margin: 0; background: #07090b; color: var(--tx); font: 13px/1.4 var(--ui);}
#igs-overlay #igs-cx-canvas:where([data-cx="tech"]){position: relative; overflow: hidden; background: var(--ink); font-family: var(--ui); user-select: none; -webkit-user-select: none;}
#igs-overlay #igs-cx-canvas:where([data-cx="tech"]).port{width: 390px; height: 844px;}
#igs-overlay #igs-cx-canvas:where([data-cx="tech"]).land{width: 1280px; height: 720px;}
#igs-overlay #igs-cx-canvas:where([data-cx="tech"]) button{font-family: inherit;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) svg{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .stage{position: absolute; inset: 0; z-index: 0; filter: brightness(.74) saturate(.88); background: none 38% center / cover;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .stage{background-position: center 40%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .deco{position: absolute; inset: 0; z-index: 1; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .veil{position: absolute; left: 0; right: 0; bottom: 0; z-index: 3; pointer-events: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .veil{top: 500px; background: linear-gradient(to bottom, rgba(14,17,20,0) 0, rgba(14,17,20,.55) 26%, rgba(14,17,20,.9) 52%, #0e1114 74%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .veil{top: 400px; background: linear-gradient(to bottom, rgba(14,17,20,0) 0, rgba(14,17,20,.6) 34%, rgba(14,17,20,.92) 60%, #0e1114 82%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .topbar,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .track,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .mates,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .piles,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tools,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .hand,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .energy,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .end{position: absolute; z-index: 6;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .num{font-family: var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .topbar{display: flex; align-items: center; gap: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .topbar .sp{flex: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .topbar .tr{display: flex; align-items: center; gap: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .topbar .spd{font: 700 12px var(--num); color: var(--cy); padding: 2px 6px; background: var(--panel2);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .topbar .ic{background: none; border: 0; padding: 0; color: var(--tx); display: grid; place-items: center; width: 26px; height: 26px; cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .topbar .ic svg{width: 18px; height: 18px; stroke: var(--tx); fill: none; stroke-width: 1.6;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .topbar .ic.ret svg{stroke: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .topbar{left: 14px; right: 12px; top: 10px; height: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .topbar{left: 28px; right: 24px; top: 16px; height: 30px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .track{display: flex; align-items: center; gap: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .track{left: 12px; top: 62px; flex-direction: column;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .who{position: relative; width: 30px; height: 30px; overflow: hidden; background-color: var(--panel2); flex: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .who.now{width: 38px; height: 38px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .who .igs-combat-art{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .who.ltr{display: grid; place-items: center; font-weight: 700; color: var(--tx);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .who::after{content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--or);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .who.ally::after{background: var(--mint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .who.now::after{background: var(--cy); height: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foes{position: absolute; left: 0; right: 0; z-index: 2; touch-action: pan-y;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .foes{top: 0; height: 700px; --base: 51px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .foes{top: 0; height: 560px; --base: -36px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe{position: absolute; left: 50%; bottom: calc(var(--base) + var(--fb, 0px)); width: var(--w, 200px); z-index: var(--fz, 1); transform: translateX(calc(-50% + var(--fx, 0px))) scale(var(--fs, 1)); transform-origin: 50% 100%; cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .art{position: relative; width: 100%; height: calc(var(--w, 200px) * 1.3); filter: brightness(var(--fl, 1)) saturate(var(--fsat, 1));}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .art .igs-combat-art{position: absolute; inset: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .tag{display: none; position: absolute; left: 50%; bottom: 100%; width: 188px; margin: 0 0 var(--tag-gap, -20px) -94px; flex-direction: column; align-items: center; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe.front .tag{display: flex;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .intent{display: inline-flex; align-items: center; gap: 5px; font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .intent svg{width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2.2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .intent b{font: 700 17px var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .intent em{font-style: normal; font-size: 12px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .plate{width: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .plate .n{display: flex; align-items: baseline; gap: 6px; font-weight: 700; font-size: 15px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .plate .n .hp{margin-left: auto; font: 600 11px var(--num); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .elite{font-size: 9px; font-weight: 700; padding: 0 5px; line-height: 14px; color: var(--or); border: 1px solid var(--or); align-self: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .hpbar{position: relative; height: 6px; background: #0a0d10;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .hpbar i{position: absolute; left: 0; top: 0; bottom: 0; background: var(--or);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .hpbar.ally i{background: var(--cy);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .hpbar.seg::after{content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), #0a0d10 calc(10% - 1px) 10%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .st{display: flex; gap: 5px; margin-top: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .sc{display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 700; padding: 0 6px; line-height: 16px; background: var(--panel2); color: var(--tx);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .sc svg{width: 10px; height: 10px; stroke: var(--cy); fill: none; stroke-width: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .sc b{font: 700 11px var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .sc.deb{color: #ffb48c;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead{display: flex; align-items: center; gap: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .ava{position: relative; flex: none; border: 0; padding: 0; background: none; cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .face{display: block; width: 100%; height: 100%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .aw{position: absolute; left: 50%; bottom: -8px; transform: translateX(-50%); font-weight: 700; font-size: 10px; padding: 0 7px; line-height: 15px; background: var(--cy); color: #07090b; white-space: nowrap; font-family: var(--ui);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .aw b{font: 800 10px var(--num); letter-spacing: -.5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .info{flex: 1; min-width: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .n{display: flex; align-items: baseline; gap: 6px; font-weight: 700; font-size: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .n .ctl{font-size: 9px; font-weight: 700; color: var(--cy); border: 1px solid var(--cy); padding: 0 4px; line-height: 13px; align-self: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .n .hp{margin-left: auto; font: 600 11px var(--num); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .n .hp b{color: var(--cy); font-size: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .chips{display: flex; gap: 5px; margin-top: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .chip{display: inline-flex; align-items: center; gap: 3px; padding: 0 6px; line-height: 17px; background: var(--panel2); font-size: 10px; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .chip svg{width: 11px; height: 11px; stroke: var(--cy); fill: none; stroke-width: 1.8;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .chip b{font: 700 11px var(--num); color: var(--tx);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .mates{display: flex; flex-direction: column; gap: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .mate{display: flex; align-items: center; gap: 6px; min-width: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .mface{flex: none; width: 20px; height: 20px; background-color: var(--panel2); display: grid; place-items: center; font-weight: 700; font-size: 11px; color: var(--cy);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .mi{flex: 1; min-width: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .mn{font-size: 10px; color: var(--dim); white-space: nowrap; line-height: 1.2; display: flex; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .mn u{text-decoration: none; color: #ffb48c; font-weight: 700;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .mate .hpbar{height: 3px; margin-top: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .lead{left: 14px; top: 776px; width: 196px; height: 60px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .mates{left: 296px; top: 774px; width: 86px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .lead{left: 28px; top: 568px; width: 262px; height: 74px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .mates{left: 28px; top: 660px; width: 262px; flex-direction: row;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .mate{flex: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .piles{font-size: 11px; color: var(--faint); display: flex; align-items: center; gap: 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .piles b{font: 700 12px var(--num); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .piles i{width: 3px; height: 3px; background: var(--faint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .piles{left: 14px; top: 758px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tools{display: flex; gap: 6px; flex-direction: column;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tool{position: relative; display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 9px 0 7px; border: 0; background: var(--panel2); color: var(--dim); font-size: 11px; cursor: pointer; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tool svg{width: 14px; height: 14px; stroke: var(--cy); fill: none; stroke-width: 1.7;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tool b{font: 700 11px var(--num); color: var(--tx);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .tools{left: 218px; top: 776px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .tools{left: 950px; top: 614px; flex-direction: row;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .piles{left: 950px; top: 660px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .energy{display: flex; flex-direction: column; align-items: center; justify-content: center;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .energy .v{font: 700 24px/1 var(--num); color: var(--tx);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .energy .v small{font-size: 12px; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .pips{display: flex; gap: 5px; margin-top: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .pips i{width: 7px; height: 7px; background: var(--cy); transform: rotate(45deg);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .pips i.off{background: var(--line);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .energy{left: 12px; top: 508px; width: 62px; height: 56px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .energy{left: 292px; top: 566px; width: 62px; height: 56px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .end{border: 0; padding: 0; cursor: pointer; background: var(--cy); color: #07090b; font-weight: 800; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .end b{font-size: 14px; letter-spacing: .04em; position: relative;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .end i{font-style: normal; font-size: 8px; font-weight: 700; letter-spacing: .16em; position: relative; margin-top: 1px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .end svg.hr{position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .end svg.hr path{fill: none; stroke-width: 2.4; vector-effect: non-scaling-stroke;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .end svg.hr .t{stroke: var(--cyd);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .end svg.hr .p{stroke: #07090b; stroke-dasharray: 30 100; transition: stroke-dasharray .4s linear;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .end.holding svg.hr .p{stroke-dasharray: 100 100;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .end{left: 306px; top: 514px; width: 76px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .end{left: 1090px; top: 556px; width: 156px; height: 44px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .hand .card{position: absolute; bottom: 0; width: var(--cw); height: var(--ch); transform: translateY(var(--ty, 0px)) rotate(var(--r, 0deg)); transform-origin: 50% 100%; cursor: pointer;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .hand .card.sel{width: var(--sw); height: var(--sh); margin-left: var(--sx, 0px); transform: translateY(calc(var(--ty, 0px) - var(--lift, 10px))) rotate(0deg); z-index: 60 !important;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .cf{position: absolute; left: 0; top: 0; transform: scale(var(--z, 1)); transform-origin: 0 0; width: calc(100% / var(--z, 1)); height: calc(100% / var(--z, 1));}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.t-atk{--tc: #ff6f7d;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.t-def{--tc: #7fd0ff;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.t-skl{--tc: #6fe0b0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.t-pow{--tc: #b49cff;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-rare{--rc: #7fd0ff;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-epic{--rc: #b49cff;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-myth{--rc: #ffd36e;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .cost{position: absolute; left: 8px; top: 8px; min-width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; gap: 2px; font: 800 13px var(--num); z-index: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .cost s{font-size: 9px; font-weight: 600; opacity: .85;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-rare .cost{box-shadow: 0 0 0 1px var(--ink), 0 0 0 2px var(--rc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-epic .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-myth .cost{box-shadow: 0 0 0 1px var(--ink), 0 0 0 2px var(--rc), 0 0 0 3px var(--ink), 0 0 0 4px var(--rc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .nm{position: absolute; left: 0; right: 0; top: 29px; text-align: center; font-weight: 700; font-size: 11px; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .art{position: absolute; left: 50%; top: 46px; width: 24px; height: 24px; margin-left: -12px; color: var(--tc); opacity: .5;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .art svg{width: 100%; height: 100%; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linejoin: miter; stroke-linecap: butt;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .val{position: absolute; left: 0; right: 0; top: 72px; display: flex; justify-content: center; align-items: baseline; gap: 1px; color: var(--tc); line-height: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .val b{font: 700 24px/1 var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.boost .val b{color: var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .val sup{font: 800 10px var(--num); color: var(--gold); position: relative; top: -10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.has-stk:not(.sel) .val sup{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .unit{position: absolute; left: 0; right: 0; top: 98px; text-align: center; font-size: 9px; color: var(--dim); line-height: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .bdg{position: absolute; right: 5px; top: 9px; z-index: 2; font: 800 10px/13px var(--num); color: var(--gold); padding: 0 3px; border: 1px solid var(--gold);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .kws,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .desc{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .dash{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.tmp .dash{display: block; position: absolute; inset: 2px; border: 1px dashed var(--vio); pointer-events: none; z-index: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.disc .cost b{color: var(--mint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.poor .cost b{color: var(--or);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.poor{filter: saturate(.35) brightness(.72);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .cost{left: 9px; top: 9px; min-width: 24px; height: 24px; font-size: 17px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .cost s{font-size: 11px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .bdg{right: 9px; top: 40px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .kws{display: flex; position: absolute; right: 9px; top: 11px; gap: 4px; z-index: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .kws u{text-decoration: none; width: 18px; height: 18px; display: grid; place-items: center; font-size: 10px; font-weight: 700; color: var(--dim); border: 1px solid var(--hair); border-radius: 50%;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .nm{top: 36px; font-size: 14px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .art{top: 58px; width: 44px; height: 44px; margin-left: -22px; opacity: 1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .val{top: 106px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .val b{font-size: 26px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .val sup{font-size: 11px; top: -10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .unit{top: 135px; font-size: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .desc{display: block; position: absolute; left: 8px; right: 8px; top: 150px; text-align: center; font-size: 10px; line-height: 1.35; color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .desc b{color: var(--tx); font-family: var(--num);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .desc .det{display: block; font-style: normal; font-size: 9px; color: var(--gold); margin-top: 2px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .hand{left: 10px; top: 614px; width: 370px; height: 130px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .hand{left: 350px; top: 534px; width: 580px; height: 160px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]){--pg4: polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%); --pg6: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%); --pg8: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%); --pg10: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%);}
#igs-overlay #igs-cx-canvas:where([data-cx="tech"]){--lk: var(--cy);}
#igs-overlay #igs-cx-canvas:where([data-cx="tech"]).aim,#igs-overlay #igs-cx-canvas:where([data-cx="tech"]).item-aim{--lk: var(--or);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .stage::after{content: ""; position: absolute; inset: 0; background: linear-gradient(to bottom, #0e1114 0, rgba(14,17,20,0) 12%);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .deco .cn{position: absolute; width: 20px; height: 20px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .deco .cn.tl{left: 6px; top: 6px; border-left: 1px solid var(--cy); border-top: 1px solid var(--cy);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .deco .cn.tr{right: 6px; top: 6px; border-right: 1px solid var(--cy); border-top: 1px solid var(--cy);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .deco .gr{position: absolute; top: 130px; height: 360px; width: 6px; background: repeating-linear-gradient(to bottom, var(--hair) 0 1px, transparent 1px 24px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .deco .gr.l{left: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .deco .gr.r{right: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .deco .gr{top: 110px; height: 340px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .title{font-weight: 800; font-size: 15px; letter-spacing: .06em; padding-left: 9px; border-left: 2px solid var(--cy);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .round{font-size: 12px; color: #c4d2dc; letter-spacing: .1em;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .topbar .spd{clip-path: var(--pg4); padding: 2px 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .who{clip-path: var(--pg4);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .track{left: 28px; top: 70px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe.front .art::before{content: ""; position: absolute; left: 10%; right: 10%; top: 12%; bottom: 3%; pointer-events: none; z-index: 3; --c: var(--lk); background: linear-gradient(var(--c), var(--c)) 0 0 / 22px 1px no-repeat, linear-gradient(var(--c), var(--c)) 0 0 / 1px 22px no-repeat, linear-gradient(var(--c), var(--c)) 100% 0 / 22px 1px no-repeat, linear-gradient(var(--c), var(--c)) 100% 0 / 1px 22px no-repeat, linear-gradient(var(--c), var(--c)) 0 100% / 22px 1px no-repeat, linear-gradient(var(--c), var(--c)) 0 100% / 1px 22px no-repeat, linear-gradient(var(--c), var(--c)) 100% 100% / 22px 1px no-repeat, linear-gradient(var(--c), var(--c)) 100% 100% / 1px 22px no-repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe.front .art::after{content: ""; position: absolute; left: 50%; top: 52%; width: 14px; height: 14px; margin: -7px 0 0 -7px; pointer-events: none; z-index: 3; background: linear-gradient(var(--lk), var(--lk)) 50% 0 / 1px 5px no-repeat, linear-gradient(var(--lk), var(--lk)) 50% 100% / 1px 5px no-repeat, linear-gradient(var(--lk), var(--lk)) 0 50% / 5px 1px no-repeat, linear-gradient(var(--lk), var(--lk)) 100% 50% / 5px 1px no-repeat;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .tag{width: 240px; margin-left: -120px; align-items: stretch; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .foe .tag{width: 280px; margin-left: -140px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .foe .tag{--tag-gap: -16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .foe .tag{--tag-gap: -4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .intent{align-self: center; padding: 3px 14px 3px 12px; background: var(--ord); color: #ffe3d2; font-size: 12px; clip-path: var(--pg6);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .intent b{color: #fff;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .plate{display: flex; flex-wrap: wrap; align-items: center; gap: 0 6px; padding: 5px 10px 7px; background: var(--ink); clip-path: var(--pg6);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .plate .nm2{order: 1; font-weight: 700; font-size: 15px; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .plate .elite{order: 2; box-shadow: inset 0 0 0 1px var(--or); border: 0; clip-path: var(--pg4); padding: 0 7px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .plate .st{order: 3; margin: 0; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .plate .hp{order: 4; margin-left: auto; white-space: nowrap; font: 600 11px var(--num); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .foe .hpbar{order: 5; flex: 0 0 100%; height: 5px; margin-top: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .sc{clip-path: var(--pg4); padding: 0 7px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .sc.deb b{margin-left: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .ava{width: 52px; height: 52px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .lead .ava{width: 64px; height: 64px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .ava::before{content: ""; position: absolute; inset: 0; background: var(--cy); clip-path: var(--cut10);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .face{position: absolute; inset: 2px; width: auto; height: auto; clip-path: var(--cut10); background-color: var(--panel);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .aw{clip-path: var(--pg4);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .lead .hpbar{height: 6px; margin-top: 5px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .chip,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .mface{clip-path: var(--pg4);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .chip{padding: 0 8px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .lead .info{padding-right: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .lead{left: 14px; top: 746px; width: 196px; height: 52px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .mates{left: 296px; top: 746px; width: 86px; gap: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .mates{top: 656px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .piles{left: 220px; top: 750px; flex-direction: column; align-items: flex-start; gap: 4px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .piles i{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .piles{left: 950px; top: 660px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tool{clip-path: var(--pg6); padding: 0 10px 0 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tool.item.on,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).tray-open .tool.item{background: var(--cy); color: #07090b;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).tray-open .tool.item svg{stroke: #07090b;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).tray-open .tool.item b{color: #07090b;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .tools{left: 306px; top: 488px; width: 76px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .tool{width: 76px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .tools{left: 950px; top: 614px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .energy{background: var(--hair); clip-path: var(--pg10);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .energy::before{content: ""; position: absolute; inset: 1px; background: var(--panel); clip-path: var(--pg10);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .energy > *{position: relative;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .end{clip-path: var(--pg8);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .end b{font-size: 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .energy{left: 12px; top: 542px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .end{left: 306px; top: 554px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tray{display: none; position: absolute; z-index: 8; background: var(--panel); clip-path: var(--pg10); padding: 8px 16px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).tray-open .tray{display: block;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .tray{left: 84px; top: 490px; width: 214px; height: 104px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .tray{left: 950px; top: 440px; width: 296px; height: 108px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tray .th{display: flex; align-items: center; justify-content: space-between; height: 22px; font-size: 12px; font-weight: 700; color: var(--tx);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tray .th .hint{font-size: 11px; color: var(--or);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tray .cells{display: flex; gap: 6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tray .cell{flex: 1; height: 62px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; background: var(--panel2); clip-path: var(--pg4); color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).land .tray .cell{height: 66px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tray .cell svg{width: 22px; height: 22px; stroke: var(--cy); fill: none; stroke-width: 1.7;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tray .cell em{font-style: normal; font-size: 10px; white-space: nowrap;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tray .cell b{font: 800 12px var(--num); color: var(--tx);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tray .cell.sel{background: var(--cy); color: #07090b;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tray .cell.sel svg{stroke: #07090b;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tray .cell.sel b{color: #07090b;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tray .cell.off{background: var(--ink); color: var(--faint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tray .cell.off svg{stroke: var(--faint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .tray .cell.off b{color: var(--faint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]).port .hand{top: 592px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card{filter: drop-shadow(0 5px 7px #000);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.t-def,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.t-skl{--tc: var(--mint);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .cf{background: var(--cyd); clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .cf{background: var(--cy);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .cf::before{content: ""; position: absolute; inset: 1px; background: #11171c; clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-own .cf::after{content: ""; position: absolute; left: 0; top: 0; width: 20px; height: 20px; background: var(--tx); clip-path: polygon(0 12px, 12px 0, 18px 0, 0 18px); z-index: 3;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .cf > *{z-index: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .cost{color: var(--tx); background: none; box-shadow: none !important; --rb: #4a5a66; --d: 22px; transform: rotate(calc(-1 * var(--r, 0deg)));}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .cost::before{content: ""; position: absolute; left: 50%; top: 50%; box-sizing: border-box; width: var(--d); height: var(--d); margin: calc(var(--d) / -2) 0 0 calc(var(--d) / -2); border: 1px solid var(--rb); transform: rotate(45deg); z-index: -1;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-common .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-own .cost{--rb: #8c9aa4;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-unc .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-rare .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-epic .cost,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-myth .cost{--rb: #e9f1f6;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-rare .cost::before{width: calc(var(--d) - 6px); height: calc(var(--d) - 6px); margin: calc(var(--d) / -2 + 3px) 0 0 calc(var(--d) / -2 + 3px); box-shadow: 0 0 0 2px #11171c, 0 0 0 3px var(--rb);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-epic .cost::before,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-myth .cost::before{width: calc(var(--d) - 8px); height: calc(var(--d) - 8px); margin: calc(var(--d) / -2 + 4px) 0 0 calc(var(--d) / -2 + 4px); box-shadow: 0 0 0 2px #11171c, 0 0 0 4px var(--rb);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.r-myth .cost::before{box-shadow: 0 0 0 2px #11171c, 0 0 0 4px var(--rb), 0 0 4px 2px rgba(233, 241, 246, .3);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .cost{min-width: 22px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .cost s{color: var(--dim); position: absolute; left: 100%; margin-left: 9px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .cost{min-width: 24px; --d: 28px; left: 13px; top: 13px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .cost s{margin-left: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card:not(.sel) .cost{top: 10px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card:not(.sel) .art{display: none;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .nm{top: 37px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card:not(.sel) .val{top: 59px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card:not(.sel) .bdg{right: auto; left: 7px; top: auto; bottom: 7px; padding: 0; border: 0;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.tmp .dash{border-color: var(--dim);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .cost b,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.disc .cost b,#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.poor .cost b{color: var(--tx);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.boost .val b{color: var(--tc);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .bdg{color: var(--dim); border-color: var(--hair);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .desc .det{color: var(--tx);}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .val .unit{position: absolute; left: 50%; top: 30px; width: 12px; height: 12px; margin-left: -6px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card .val .unit svg{width: 100%; height: 100%; stroke: var(--dim); fill: none; stroke-width: 2;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .val .unit{top: 29px; width: 14px; height: 14px; margin-left: -7px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .kws{top: 14px; right: 8px; gap: 3px;}
#igs-overlay :where(.igs-cx-canvas[data-cx="tech"],.igs-cx-ghost[data-cx="tech"]) .card.sel .kws u{width: auto; height: auto; padding: 0 3px; line-height: 14px; font-size: 9px; font-weight: 600; border-radius: 0; color: var(--dim); border: 1px solid var(--hair);}
`;
