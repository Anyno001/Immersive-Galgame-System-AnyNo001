// 由 gen-fx-css.mjs 从设计稿的 fx.css、fx3.css、land.css 与各 style-*.css 生成（入场 / 技能切入 / 觉醒 / 结算的演出样式）。请改设计稿后重新生成，不要手改。
// 作用域：#igs-overlay .igs-sfx[data-sfx="<风格>"]；关键帧按 sfxb-（基础）与 sfx-<风格>- 命名。
export const COMBAT_STAGE_FX_BASE_CSS = `
#igs-overlay .igs-sfx { --edge: #050506; --k: 1; --seam-gold: var(--gold); --glow-hi: rgba(255,196,120,.9); --glow-rgb: 255,190,110; --gold: #e8c27a; --glow: #ffc27a; --tstroke: 1; --text: #ecebe6; --jade: #7fd8b6; --red: #e2554f; --font-big: Impact, "Haettenschweiler", "Arial Narrow", var(--num); --display: "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif; --glow-mid: rgba(255,190,110,.75); --num: "Bahnschrift", "DIN Alternate", "Noto Sans SC", sans-serif; --skew: 8deg; --skew-k: 1; --rim: #f4f2ec; --dim: #8e8d88; --seam-cool: #8a2a1c; --panel-2: #232429; --faint: #5d5c59; }
#igs-overlay .igs-sfx .clash { --hit: 480ms; position: absolute; inset: 0; z-index: 50; background: var(--edge); overflow: hidden; }
#igs-overlay .igs-sfx .clash .shake { position: absolute; inset: 0; }
#igs-overlay .igs-sfx .clash.hit .shake { animation: sfxb-punch calc(380ms * var(--k)) cubic-bezier(.2,.9,.3,1); }
#igs-overlay .igs-sfx .clash .half { position: absolute; inset: 0; }
#igs-overlay .igs-sfx .clash .hero-side { background: linear-gradient(160deg, #2a0f12, #0d0607 70%); animation: sfxb-inL calc(640ms * var(--k)) both; }
#igs-overlay .igs-sfx .clash .foe-side { background: linear-gradient(200deg, #10131c, #060709 70%); animation: sfxb-inR calc(640ms * var(--k)) both; }
#igs-overlay .igs-sfx .clash .fig { position: absolute; background: center top / contain no-repeat; }
#igs-overlay .igs-sfx .clash .fig.lead { left: -96px; bottom: -40px; width: 470px; height: 640px; background-image: none; z-index: 2; }
#igs-overlay .igs-sfx .clash .fig.mate { left: -30px; top: 30px; width: 300px; height: 454px; background-image: none;
  filter: brightness(.55) saturate(.8); z-index: 1; }
#igs-overlay .igs-sfx .clash .fig.foe1 { right: -40px; top: 40px; width: 330px; height: 430px; z-index: 2; }
#igs-overlay .igs-sfx .clash .fig.foe2 { right: 120px; top: 300px; width: 220px; height: 290px; filter: brightness(.55); z-index: 1; }
#igs-overlay .igs-sfx .clash svg.fxsvg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
#igs-overlay .igs-sfx .clash .seam { z-index: 3; clip-path: circle(0 at var(--ix) var(--iy)); animation: sfxb-ignite calc(240ms * var(--k)) ease-out calc(var(--hit) * var(--k)) forwards; }
#igs-overlay .igs-sfx .clash .seam polyline { fill: none; stroke-linejoin: miter; stroke-linecap: square; }
#igs-overlay .igs-sfx .clash .seam .ink { stroke: var(--edge); stroke-width: 16; }
#igs-overlay .igs-sfx .clash .seam .gold { stroke: var(--seam-gold); stroke-width: 10; animation: sfxb-sgold calc(1200ms * var(--k)) ease-in calc(var(--hit) * var(--k)) both; }
#igs-overlay .igs-sfx .clash .seam .hot { stroke: #fff; stroke-width: 4; filter: drop-shadow(0 0 6px #ffd9a0); animation: sfxb-shot calc(900ms * var(--k)) ease-in calc(var(--hit) * var(--k)) both; }
#igs-overlay .igs-sfx .clash .light { z-index: 4; mix-blend-mode: screen; }
#igs-overlay .igs-sfx .clash .light .rays { transform-box: view-box; transform-origin: var(--ox) var(--oy); opacity: 0; filter: drop-shadow(0 0 6px var(--glow-hi));
  animation: sfxb-rays calc(700ms * var(--k)) cubic-bezier(.05,.9,.25,1) calc(var(--hit) * var(--k)) both; }
#igs-overlay .igs-sfx .clash .light .rays2 { animation-duration: calc(560ms * var(--k)); animation-delay: calc((var(--hit) + 50ms) * var(--k)); }
#igs-overlay .igs-sfx .clash .light .core { transform-box: view-box; transform-origin: var(--ox) var(--oy); opacity: 0; animation: sfxb-core calc(620ms * var(--k)) cubic-bezier(.1,.8,.3,1) calc(var(--hit) * var(--k)) both; }
#igs-overlay .igs-sfx .clash .light .ring { fill: none; stroke: #fff4e0; opacity: 0; filter: drop-shadow(0 0 8px rgba(var(--glow-rgb), .9)); animation: sfxb-lring calc(620ms * var(--k)) cubic-bezier(.1,.7,.3,1) calc(var(--hit) * var(--k)) both; }
#igs-overlay .igs-sfx .clash .light .ring.r2 { stroke: var(--gold); animation-name: sfxb-lring2; animation-duration: calc(820ms * var(--k)); animation-delay: calc((var(--hit) + 100ms) * var(--k)); }
#igs-overlay .igs-sfx .clash .flare { position: absolute; z-index: 5; left: var(--ix); top: var(--iy); width: 170%; height: 5px; margin: -2.5px 0 0 -85%; mix-blend-mode: screen;
  background: linear-gradient(90deg, transparent, rgba(255,200,130,.6) 30%, #fff 50%, rgba(255,200,130,.6) 70%, transparent); filter: drop-shadow(0 0 6px var(--glow));
  transform: rotate(-22deg) scaleX(0); opacity: 0; animation: sfxb-flare calc(560ms * var(--k)) cubic-bezier(.1,.8,.3,1) calc(var(--hit) * var(--k)) both; }
#igs-overlay .igs-sfx .clash .spark { position: absolute; z-index: 5; left: var(--ix); top: var(--iy); width: var(--s); height: 2px; margin-top: -1px; transform-origin: 0 50%; mix-blend-mode: screen;
  background: linear-gradient(90deg, transparent, #fff); filter: drop-shadow(0 0 4px var(--glow)); opacity: 0;
  animation: sfxb-spark calc(640ms * var(--k)) cubic-bezier(.05,.8,.3,1) calc(var(--hit) * var(--k)) both; }
#igs-overlay .igs-sfx .clash .flash { position: absolute; inset: 0; z-index: 7; background: #fff; opacity: 0; animation: sfxb-flash calc(260ms * var(--k)) ease-out calc(var(--hit) * var(--k)) both; }
#igs-overlay .igs-sfx .clash.hit .half .fig.lead, #igs-overlay .igs-sfx .clash.hit .half .fig.foe1 { animation: sfxb-impactframe calc(110ms * var(--k)) steps(1) 1; }
#igs-overlay .igs-sfx .clash .name { position: absolute; z-index: 6; font-weight: 900; letter-spacing: .06em; color: #fff; line-height: 1;
  -webkit-text-stroke: calc(8px * var(--tstroke)) var(--edge); paint-order: stroke fill; animation: sfxb-slam calc(360ms * var(--k)) cubic-bezier(.2,1.4,.4,1) calc(640ms * var(--k)) both; }
#igs-overlay .igs-sfx .clash .name small { display: block; margin-top: 10px; font-size: 13px; font-weight: 800; letter-spacing: .3em; color: var(--text); -webkit-text-stroke: calc(4px * var(--tstroke)) var(--edge); }
#igs-overlay .igs-sfx .clash .name i { display: block; width: 64px; height: 8px; margin-top: 10px; transform: skewX(-24deg); box-shadow: 0 0 0 2px var(--edge); }
#igs-overlay .igs-sfx .clash .name.h { left: 22px; bottom: 124px; font-size: 58px; }
#igs-overlay .igs-sfx .clash .name.h i { background: var(--jade); }
#igs-overlay .igs-sfx .clash .name.f { right: 22px; top: 92px; font-size: 58px; text-align: right; }
#igs-overlay .igs-sfx .clash .name.f i { background: var(--red); margin-left: auto; }
#igs-overlay .igs-sfx .clash .name .and { display: block; margin-top: 8px; font-size: 20px; letter-spacing: .1em; -webkit-text-stroke: calc(5px * var(--tstroke)) var(--edge); }
#igs-overlay .igs-sfx .clash .vs { position: absolute; z-index: 6; left: var(--ix); top: var(--iy); width: 3.4em; height: 1.5em; margin: -.75em 0 0 -1.7em; font-size: 60px;
  animation: sfxb-vs calc(380ms * var(--k)) cubic-bezier(.2,1.6,.4,1) calc(700ms * var(--k)) both; }
#igs-overlay .igs-sfx .clash .vs svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
#igs-overlay .igs-sfx .clash .vs .p-shadow { fill: var(--edge); transform: translate(4px, 6px); }
#igs-overlay .igs-sfx .clash .vs .p-gold { fill: var(--gold); stroke: var(--edge); stroke-width: 3; stroke-linejoin: miter; vector-effect: non-scaling-stroke; }
#igs-overlay .igs-sfx .clash .vs .p-hi { fill: #ffe9b8; }
#igs-overlay .igs-sfx .clash .vs .blade { position: absolute; left: -1.4em; right: -1.4em; top: 50%; height: 4px; margin-top: -2px; mix-blend-mode: screen;
  background: linear-gradient(90deg, transparent, #fff 35%, #fff 65%, transparent); filter: drop-shadow(0 0 6px var(--glow)); transform: rotate(-24deg) scaleX(0);
  animation: sfxb-blade calc(420ms * var(--k)) cubic-bezier(.1,.8,.3,1) calc(760ms * var(--k)) both; }
#igs-overlay .igs-sfx .clash .vs .blade.b2 { animation-name: sfxb-blade2; animation-delay: calc(820ms * var(--k)); }
#igs-overlay .igs-sfx .clash .vs b { position: absolute; z-index: 2; left: 50%; top: 50%; font: italic 400 2.3em/1 var(--font-big); color: #fff; letter-spacing: -.02em;
  white-space: nowrap; transform: translate(-50%, -52%) skewX(-14deg); -webkit-text-stroke: calc(.07em * var(--tstroke)) var(--edge); paint-order: stroke fill;
  text-shadow: .045em .06em 0 var(--edge), 0 0 .3em rgba(var(--glow-rgb), .8); }
#igs-overlay .igs-sfx .clash.out .hero-side { animation: sfxb-outL calc(420ms * var(--k)) cubic-bezier(.6,0,.8,.4) both; }
#igs-overlay .igs-sfx .clash.out .foe-side { animation: sfxb-outR calc(420ms * var(--k)) cubic-bezier(.6,0,.8,.4) both; }
#igs-overlay .igs-sfx .clash.out .name, #igs-overlay .igs-sfx .clash.out .vs, #igs-overlay .igs-sfx .clash.out .seam { animation: sfxb-gone calc(200ms * var(--k)) both; }
#igs-overlay .igs-sfx .clash.out { background: transparent; transition: background calc(300ms * var(--k)); }
#igs-overlay .igs-sfx .plate { position: absolute; }
#igs-overlay .igs-sfx .plate svg { width: 100%; height: 100%; overflow: visible; }
#igs-overlay .igs-sfx .plate .p-shadow { fill: var(--edge); transform: translate(5px, 6px); }
#igs-overlay .igs-sfx .plate .p-gold { fill: var(--gold); stroke: var(--edge); stroke-width: 3; stroke-linejoin: miter; stroke-miterlimit: 20; vector-effect: non-scaling-stroke; }
#igs-overlay .igs-sfx .plate .p-hi { fill: #ffe9b8; }
#igs-overlay .igs-sfx .big { position: absolute; left: 0; right: 0; z-index: 3; text-align: center; font: 900 92px/1 var(--display); letter-spacing: .02em; color: #fff;
  -webkit-text-stroke: calc(12px * var(--tstroke)) var(--edge); paint-order: stroke fill; text-shadow: 4px 6px 0 var(--edge), 0 0 26px var(--glow-mid); }
#igs-overlay .igs-sfx .big small { display: block; margin-top: 16px; font: 900 21px var(--num); letter-spacing: .32em; text-indent: .32em; color: var(--gold); -webkit-text-stroke: calc(4px * var(--tstroke)) var(--edge); text-shadow: none; }
#igs-overlay .igs-sfx .gleam { position: absolute; height: 4px; mix-blend-mode: screen; background: linear-gradient(90deg, transparent, #fff 40%, #fff 60%, transparent); filter: drop-shadow(0 0 6px var(--glow)); }
#igs-overlay .igs-sfx .line { position: absolute; z-index: 4; padding: 8px 16px; background: var(--edge); box-shadow: 0 0 0 2px var(--el, var(--gold)); transform: skewX(calc(var(--skew) * -1));
  font: 900 20px/1.2 var(--display); color: #fff; white-space: nowrap; }
#igs-overlay .igs-sfx .line > span { display: block; transform: skewX(var(--skew)); }
#igs-overlay .igs-sfx .cut { position: absolute; inset: 0; z-index: 45; pointer-events: none; --el: #ff8a3d; }
#igs-overlay .igs-sfx .cut.jade { --el: var(--jade); }
#igs-overlay .igs-sfx .cut .dim { position: absolute; inset: 0; background: rgba(5,5,6,.55); animation: sfxb-cutDim calc(1500ms * var(--k)) ease both; }
#igs-overlay .igs-sfx .cut .band { position: absolute; left: -30px; right: -30px; top: 330px; height: 150px; overflow: hidden; transform: skewY(calc(-7deg * var(--skew-k)));
  background: linear-gradient(100deg, #16080a 0, var(--edge) 55%); box-shadow: 0 0 0 3px var(--el), 0 0 0 6px var(--edge);
  animation: sfxb-cutBand calc(1500ms * var(--k)) cubic-bezier(.2,.9,.3,1) both; }
#igs-overlay .igs-sfx .cut .streak { position: absolute; left: 0; right: 0; height: 3px; mix-blend-mode: screen; background: linear-gradient(90deg, transparent, var(--el) 30%, #fff 60%, transparent);
  filter: drop-shadow(0 0 6px var(--el)); animation: sfxb-streak calc(520ms * var(--k)) linear infinite; }
#igs-overlay .igs-sfx .cut .ember { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #fff3dc; box-shadow: 0 0 8px 2px var(--el); mix-blend-mode: screen;
  animation: sfxb-ember calc(1200ms * var(--k)) ease-out both; }
#igs-overlay .igs-sfx .cut .fig { position: absolute; z-index: 2; left: -40px; top: 150px; width: 340px; height: 464px; background: center top / contain no-repeat;
  clip-path: inset(-200px -200px 154px -200px); filter: drop-shadow(0 0 0 var(--edge)) drop-shadow(0 0 18px color-mix(in srgb, var(--el) 70%, transparent));
  animation: sfxb-cutFig calc(1500ms * var(--k)) cubic-bezier(.2,.9,.3,1) both; }
#igs-overlay .igs-sfx .cut .line { left: 170px; top: 300px; animation: sfxb-cutLine calc(1500ms * var(--k)) cubic-bezier(.2,1.4,.4,1) both; }
#igs-overlay .igs-sfx .cut .move { position: absolute; z-index: 3; right: 18px; top: 400px; text-align: right; font: 900 46px/1 var(--display); color: #fff;
  -webkit-text-stroke: calc(9px * var(--tstroke)) var(--edge); paint-order: stroke fill; text-shadow: 0 0 18px var(--el); animation: sfxb-cutMove calc(1500ms * var(--k)) cubic-bezier(.2,1.4,.4,1) both; }
#igs-overlay .igs-sfx .cut .move small { display: block; margin-bottom: 6px; font-size: 12px; letter-spacing: .4em; color: var(--el); -webkit-text-stroke: calc(4px * var(--tstroke)) var(--edge); text-shadow: none; }
#igs-overlay .igs-sfx .awaken { position: absolute; inset: 0; z-index: 48; pointer-events: none; }
#igs-overlay .igs-sfx .awaken .veil { position: absolute; inset: 0; background: rgba(5,5,6,.9); animation: sfxb-awVeil calc(2400ms * var(--k)) ease both; }
#igs-overlay .igs-sfx .awaken .eye { position: absolute; z-index: 3; left: -30px; right: -30px; top: 330px; height: 124px; overflow: hidden; transform: skewY(calc(-8deg * var(--skew-k)));
  background: var(--edge); border-top: 5px solid var(--gold); border-bottom: 3px solid var(--rim); animation: sfxb-awEye calc(2400ms * var(--k)) cubic-bezier(.2,.9,.3,1) both; }
#igs-overlay .igs-sfx .awaken .eye i { position: absolute; inset: -60px 0; transform: skewY(calc(8deg * var(--skew-k))); background: none 50% 14% / 230% auto no-repeat; filter: contrast(1.12); }
#igs-overlay .igs-sfx .awaken .eye .gleam { inset: auto 0; top: 50%; transform: scaleX(0); transform-origin: left; animation: sweep calc(520ms * var(--k)) cubic-bezier(.2,.8,.3,1) calc(220ms * var(--k)) both; }
#igs-overlay .igs-sfx .awaken .shaft { animation-duration: calc(1640ms * var(--k)); }
#igs-overlay .igs-sfx .awaken .fig { position: absolute; z-index: 2; left: 50%; top: 60px; width: 420px; height: 573px; margin-left: -210px; background: none center top / contain no-repeat;
  filter: drop-shadow(0 0 22px rgba(255,200,120,.7)); animation: sfxb-awFig calc(2400ms * var(--k)) cubic-bezier(.2,.9,.3,1) both; }
#igs-overlay .igs-sfx .awaken .line { left: 24px; top: 96px; animation: sfxb-awLine calc(2400ms * var(--k)) cubic-bezier(.2,1.4,.4,1) both; }
#igs-overlay .igs-sfx .awaken .plate { left: 28px; right: 28px; top: 560px; height: 82px; z-index: 3; animation: sfxb-awPlate calc(2400ms * var(--k)) cubic-bezier(.2,1.5,.4,1) both; }
#igs-overlay .igs-sfx .awaken .big { top: 538px; z-index: 4; animation: sfxb-awWord calc(2400ms * var(--k)) cubic-bezier(.2,1.4,.4,1) both; }
#igs-overlay .igs-sfx .awaken .flash { position: absolute; inset: 0; z-index: 5; background: #fff; opacity: 0; animation: sfxb-flash calc(280ms * var(--k)) ease-out calc(720ms * var(--k)) both; }
#igs-overlay .igs-sfx .result { position: absolute; inset: 0; z-index: 48; pointer-events: none; --el: var(--gold); }
#igs-overlay .igs-sfx .result.lose { --el: #b8453a; }
#igs-overlay .igs-sfx .result .veil { position: absolute; inset: 0; background: rgba(5,5,6,.86); animation: sfxb-rsVeil calc(600ms * var(--k)) ease both; }
#igs-overlay .igs-sfx .result .hband { position: absolute; left: 0; right: 0; top: 100px; height: 160px; mix-blend-mode: screen;
  background: linear-gradient(to bottom, transparent, rgba(255,200,130,.32) 40%, rgba(255,240,215,.5) 50%, rgba(255,200,130,.32) 60%, transparent);
  animation: sfxb-hband calc(900ms * var(--k)) cubic-bezier(.2,.8,.3,1) calc(150ms * var(--k)) both; }
#igs-overlay .igs-sfx .result .shaft { animation: sfxb-rsShaft calc(1100ms * var(--k)) cubic-bezier(.2,.8,.3,1) both; }
#igs-overlay .igs-sfx .result .fig { position: absolute; background: center top / contain no-repeat; }
#igs-overlay .igs-sfx .result .fig.lead { z-index: 2; left: -70px; top: 262px; width: 380px; height: 518px; background-image: none;
  filter: drop-shadow(0 0 20px rgba(255,200,120,.55)); animation: sfxb-rsFig calc(700ms * var(--k)) cubic-bezier(.2,.9,.3,1) calc(160ms * var(--k)) both; }
#igs-overlay .igs-sfx .result .fig.mate { z-index: 1; left: -40px; top: 168px; width: 260px; height: 393px; background-image: none;
  -webkit-mask-image: linear-gradient(to bottom, #000 62%, transparent 96%); mask-image: linear-gradient(to bottom, #000 62%, transparent 96%);
  filter: brightness(.6); animation: sfxb-rsFig calc(700ms * var(--k)) cubic-bezier(.2,.9,.3,1) calc(240ms * var(--k)) both; }
#igs-overlay .igs-sfx .result.lose .fig { filter: grayscale(1) brightness(.5); animation-name: sfxb-rsFigLose; }
#igs-overlay .igs-sfx .result .plate { left: auto; right: 14px; width: 250px; top: 150px; height: 80px; z-index: 3;
  animation: sfxb-rsPlate calc(420ms * var(--k)) cubic-bezier(.2,1.5,.4,1) calc(420ms * var(--k)) both; }
#igs-overlay .igs-sfx .result .big { left: auto; right: 22px; top: 126px; width: 250px; font-size: 82px; z-index: 4;
  animation: sfxb-rsWord calc(380ms * var(--k)) cubic-bezier(.2,1.4,.4,1) calc(480ms * var(--k)) both; }
#igs-overlay .igs-sfx .result .grade { position: absolute; z-index: 4; right: 28px; top: 262px; text-align: right; font: italic 400 116px/1 var(--font-big); color: var(--el);
  -webkit-text-stroke: calc(8px * var(--tstroke)) var(--edge); paint-order: stroke fill; text-shadow: 0 0 24px rgba(var(--glow-rgb), .7); animation: sfxb-rsGrade calc(360ms * var(--k)) cubic-bezier(.2,1.6,.4,1) calc(900ms * var(--k)) both; }
#igs-overlay .igs-sfx .result .grade small { display: block; margin-bottom: 2px; font: 800 11px var(--display); font-style: normal; letter-spacing: .4em; color: var(--text); -webkit-text-stroke: 0; text-shadow: none; }
#igs-overlay .igs-sfx .result .rows { position: absolute; z-index: 4; right: 14px; top: 420px; width: 226px; display: flex; flex-direction: column; gap: 10px; }
#igs-overlay .igs-sfx .result .row { display: flex; align-items: center; height: 44px; padding: 0 16px; background: var(--edge); border-left: 4px solid var(--el); transform: skewX(calc(var(--skew) * -1));
  animation: sfxb-rsRow calc(460ms * var(--k)) cubic-bezier(.2,.9,.3,1) calc(var(--d) * var(--k)) both; }
#igs-overlay .igs-sfx .result .row > * { transform: skewX(var(--skew)); }
#igs-overlay .igs-sfx .result .row span { font-size: 12px; font-weight: 700; color: var(--dim); }
#igs-overlay .igs-sfx .result .row b { margin-left: auto; font: italic 400 24px/1 var(--font-big); color: #fff; }
#igs-overlay .igs-sfx .result .row b.g { color: var(--gold); }
#igs-overlay .igs-sfx .result .tap { position: absolute; z-index: 4; left: 0; right: 0; bottom: 30px; text-align: center; font-size: 12px; letter-spacing: .3em; color: var(--dim);
  animation: sfxb-rsTap calc(1600ms * var(--k)) ease-in-out calc(1700ms * var(--k)) infinite both; }
#igs-overlay .igs-sfx .result.lose .big { color: #ffd0cb; text-shadow: 4px 6px 0 var(--edge); }
#igs-overlay .igs-sfx .result.lose .big small { color: var(--dim); }
#igs-overlay .igs-sfx .result.lose .grade { text-shadow: none; }
#igs-overlay .igs-sfx .result.lose .hband, #igs-overlay .igs-sfx .result.lose .shaft { display: none; }
#igs-overlay .igs-sfx .awaken .aw-tint { position: absolute; inset: 0; z-index: 0; background: linear-gradient(160deg, #3a0d0b 0%, #120506 55%, var(--edge) 100%); opacity: 0;
  animation: sfxb-awTint calc(2400ms * var(--k)) ease both; }
#igs-overlay .igs-sfx .awaken .aw-cross { position: absolute; z-index: 1; left: -60px; right: -60px; top: 250px; height: 70px; background: #5a1410; border-top: 3px solid var(--gold);
  border-bottom: 2px solid #ff7a3d; transform: rotate(-24deg) scaleX(0); transform-origin: left; animation: sfxb-awCross calc(2400ms * var(--k)) cubic-bezier(.2,.9,.3,1) both; }
#igs-overlay .igs-sfx .awaken .aw-cross.c2 { top: 330px; height: 40px; background: var(--edge); border-top-color: #ff7a3d; border-bottom-color: var(--gold);
  transform: rotate(18deg) scaleX(0); transform-origin: right; animation-name: sfxb-awCross2; }
#igs-overlay .igs-sfx .awaken .aw-streak { position: absolute; z-index: 1; left: -40px; right: -40px; height: 2px; mix-blend-mode: screen; transform: rotate(-24deg);
  background: linear-gradient(90deg, transparent, rgba(255,122,61,.6) 30%, #fff 60%, transparent); filter: drop-shadow(0 0 6px #ff7a3d); opacity: 0;
  animation: sfxb-awStreak calc(700ms * var(--k)) linear both; }
#igs-overlay .igs-sfx .awaken .aw-ember { position: absolute; z-index: 2; width: 4px; height: 4px; border-radius: 50%; background: #fff3dc; box-shadow: 0 0 8px 2px #ff7a3d; mix-blend-mode: screen; opacity: 0;
  animation: sfxb-awEmber calc(1300ms * var(--k)) ease-out both; }
#igs-overlay .igs-sfx .awaken .fig { filter: drop-shadow(0 0 0 var(--edge)) drop-shadow(-6px 0 0 #ff7a3d) drop-shadow(0 0 26px rgba(255,122,61,.75)); }
#igs-overlay .igs-sfx .awaken .aw-plate-gleam { position: absolute; z-index: 4; left: 28px; right: 28px; top: 594px; height: 5px; mix-blend-mode: screen; transform: rotate(-4deg) scaleX(0); transform-origin: left;
  background: linear-gradient(90deg, transparent, #fff 45%, transparent); filter: drop-shadow(0 0 8px var(--glow)); animation: sfxb-awPG calc(2400ms * var(--k)) cubic-bezier(.2,.8,.3,1) both; }
#igs-overlay .igs-sfx.land .awaken .aw-cross { top: 220px; height: 90px; }
#igs-overlay .igs-sfx.land .awaken .aw-cross.c2 { top: 330px; height: 50px; }
#igs-overlay .igs-sfx.land .awaken .aw-plate-gleam { left: 360px; right: 360px; top: 516px; }
#igs-overlay .igs-sfx .awaken .fig { -webkit-mask: linear-gradient(to bottom, #000 78%, transparent 98%); mask: linear-gradient(to bottom, #000 78%, transparent 98%); }
#igs-overlay .igs-sfx.land .clash .fig.lead { left: 60px; bottom: -140px; width: 560px; height: 760px; }
#igs-overlay .igs-sfx.land .clash .fig.mate { left: -60px; top: -20px; width: 380px; height: 575px; }
#igs-overlay .igs-sfx.land .clash .fig.foe1 { right: 60px; top: 30px; width: 540px; height: 640px; }
#igs-overlay .igs-sfx.land .clash .fig.foe2 { right: 420px; top: 300px; width: 300px; height: 390px; }
#igs-overlay .igs-sfx.land .clash .name { font-size: 78px; }
#igs-overlay .igs-sfx.land .clash .name.h { left: 80px; bottom: 90px; }
#igs-overlay .igs-sfx.land .clash .name.f { right: 80px; top: 80px; }
#igs-overlay .igs-sfx.land .clash .vs { font-size: 88px; }
#igs-overlay .igs-sfx.land .awaken .eye { top: 250px; height: 170px; }
#igs-overlay .igs-sfx.land .awaken .fig { top: 20px; width: 500px; height: 682px; margin-left: -250px; }
#igs-overlay .igs-sfx.land .awaken .line { left: 120px; top: 150px; }
#igs-overlay .igs-sfx.land .awaken .plate { left: 360px; right: 360px; top: 470px; height: 96px; }
#igs-overlay .igs-sfx.land .awaken .big { top: 448px; font-size: 110px; }
#igs-overlay .igs-sfx.land .cut .band { top: 250px; height: 200px; }
#igs-overlay .igs-sfx.land .cut .fig { left: 80px; top: -10px; width: 460px; height: 628px; clip-path: inset(-300px -300px 172px -300px); }
#igs-overlay .igs-sfx.land .cut .line { left: 480px; top: 210px; font-size: 26px; }
#igs-overlay .igs-sfx.land .cut .move { right: 80px; top: 330px; font-size: 72px; }
#igs-overlay .igs-sfx.land .result .hband { top: 120px; height: 200px; }
#igs-overlay .igs-sfx.land .result .fig.lead { left: 80px; top: 120px; width: 460px; height: 627px; }
#igs-overlay .igs-sfx.land .result .fig.mate { left: 300px; top: 60px; width: 330px; height: 499px; }
#igs-overlay .igs-sfx.land .result .plate { right: 120px; width: 380px; top: 150px; height: 104px; }
#igs-overlay .igs-sfx.land .result .big { right: 120px; width: 380px; top: 118px; font-size: 118px; }
#igs-overlay .igs-sfx.land .result .grade { right: 520px; top: 300px; font-size: 150px; }
#igs-overlay .igs-sfx.land .result .rows { right: 120px; top: 310px; width: 380px; }
@keyframes sfxb-punch { 0% { transform: scale(1); } 25% { transform: scale(1.06); } 100% { transform: scale(1); } }
@keyframes sfxb-inL { 0% { transform: translate(-70%, 22%); animation-timing-function: cubic-bezier(.6,0,1,.6); } 75% { transform: none; }
  85% { transform: translate(-2.5%, .8%); } 100% { transform: none; } }
@keyframes sfxb-inR { 0% { transform: translate(70%, -22%); animation-timing-function: cubic-bezier(.6,0,1,.6); } 75% { transform: none; }
  85% { transform: translate(2.5%, -.8%); } 100% { transform: none; } }
@keyframes sfxb-ignite { to { clip-path: circle(150% at var(--ix) var(--iy)); } }
@keyframes sfxb-sgold { 0% { stroke-width: 14; } 100% { stroke: var(--seam-cool); stroke-width: 6; } }
@keyframes sfxb-shot { 0% { stroke-width: 7; } 100% { stroke: var(--gold); stroke-width: 0; } }
@keyframes sfxb-rays { 0% { opacity: 0; transform: scale(.1) rotate(-4deg); } 12% { opacity: 1; } 55% { opacity: 1; } 100% { opacity: 0; transform: scale(1.12) rotate(2deg); } }
@keyframes sfxb-core { 0% { opacity: 0; transform: scale(.2); } 10% { opacity: 1; transform: scale(.8); } 100% { opacity: 0; transform: scale(1.6); } }
@keyframes sfxb-lring { 0% { opacity: 1; r: 10px; stroke-width: 8; } 100% { opacity: 0; r: var(--R); stroke-width: .5; } }
@keyframes sfxb-lring2 { 0% { opacity: .9; r: 10px; stroke-width: 5; } 100% { opacity: 0; r: calc(var(--R) * 1.3); stroke-width: .5; } }
@keyframes sfxb-flare { 0% { opacity: 1; transform: rotate(-22deg) scaleX(0); } 30% { opacity: 1; transform: rotate(-22deg) scaleX(1); } 100% { opacity: 0; transform: rotate(-22deg) scaleX(1.1) scaleY(.3); } }
@keyframes sfxb-spark { 0% { opacity: 1; transform: rotate(var(--a)) translateX(10px) scaleX(.2); } 70% { opacity: 1; } 100% { opacity: 0; transform: rotate(var(--a)) translateX(var(--d)) scaleX(1); } }
@keyframes sfxb-flash { 0% { opacity: 0; } 12% { opacity: .95; } 100% { opacity: 0; } }
@keyframes sfxb-impactframe { 0% { filter: grayscale(1) contrast(3) brightness(1.4); } }
@keyframes sfxb-slam { from { opacity: 0; transform: scale(1.7) rotate(-4deg); } to { opacity: 1; transform: none; } }
@keyframes sfxb-vs { 0% { opacity: 0; transform: scale(3.2) rotate(-24deg); } 55% { opacity: 1; transform: scale(.9) rotate(3deg); } 100% { opacity: 1; transform: rotate(-6deg); } }
@keyframes sfxb-blade { 0% { opacity: 1; transform: rotate(-24deg) scaleX(0); } 40% { transform: rotate(-24deg) scaleX(1); } 100% { opacity: .7; transform: rotate(-24deg) scaleX(1); } }
@keyframes sfxb-blade2 { 0% { opacity: 1; transform: rotate(-24deg) translateY(.5em) scaleX(0); } 40% { transform: rotate(-24deg) translateY(.5em) scaleX(1); } 100% { opacity: .5; transform: rotate(-24deg) translateY(.5em) scaleX(1); } }
@keyframes sfxb-outL { to { transform: translate(-75%, 18%); } }
@keyframes sfxb-outR { to { transform: translate(75%, -18%); } }
@keyframes sfxb-gone { to { opacity: 0; } }
@keyframes sfxb-cutDim { 0% { opacity: 0; } 12% { opacity: 1; } 82% { opacity: 1; } 100% { opacity: 0; } }
@keyframes sfxb-cutBand { 0% { clip-path: inset(0 100% 0 0); } 18% { clip-path: inset(0 0 0 0); } 82% { clip-path: inset(0 0 0 0); } 100% { clip-path: inset(0 0 0 100%); } }
@keyframes sfxb-streak { from { transform: translateX(-60%); } to { transform: translateX(60%); } }
@keyframes sfxb-ember { 0% { opacity: 0; transform: none; } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)); } }
@keyframes sfxb-cutFig { 0%, 8% { opacity: 0; transform: translateX(-120px); } 24% { opacity: 1; transform: none; } 82% { opacity: 1; transform: translateX(16px); } 100% { opacity: 0; transform: translateX(80px); } }
@keyframes sfxb-cutLine { 0%, 22% { opacity: 0; transform: skewX(calc(var(--skew) * -1)) scale(1.4); } 32% { opacity: 1; transform: skewX(calc(var(--skew) * -1)); } 82% { opacity: 1; } 100% { opacity: 0; } }
@keyframes sfxb-cutMove { 0%, 30% { opacity: 0; transform: translateX(60px) scale(1.5); } 40% { opacity: 1; transform: none; } 82% { opacity: 1; } 100% { opacity: 0; transform: translateX(-30px); } }
@keyframes sfxb-awVeil { 0% { opacity: 0; } 6% { opacity: 1; } 88% { opacity: 1; } 100% { opacity: 0; } }
@keyframes sfxb-awEye { 0% { clip-path: inset(0 100% 0 0); } 9% { clip-path: inset(0 0 0 0); } 27% { clip-path: inset(0 0 0 0); transform: skewY(calc(-8deg * var(--skew-k))); }
  31% { clip-path: inset(48% 0 48% 0); transform: skewY(calc(-8deg * var(--skew-k))) scaleX(1.1); opacity: 1; } 33% { opacity: 0; } 100% { opacity: 0; } }
@keyframes sfxb-awFig { 0%, 30% { opacity: 0; transform: translateY(260px) scale(.7) rotate(-6deg); } 40% { opacity: 1; transform: scale(1.06); } 46% { transform: none; } 88% { opacity: 1; transform: translateY(-8px); } 100% { opacity: 0; transform: translateY(-20px); } }
@keyframes sfxb-awLine { 0%, 44% { opacity: 0; transform: skewX(calc(var(--skew) * -1)) scale(1.4); } 52% { opacity: 1; transform: skewX(calc(var(--skew) * -1)); } 88% { opacity: 1; } 100% { opacity: 0; } }
@keyframes sfxb-awPlate { 0%, 48% { opacity: 0; transform: scale(1.5) rotate(-8deg); } 56% { opacity: 1; transform: rotate(-4deg); } 88% { opacity: 1; transform: rotate(-4deg); } 100% { opacity: 0; transform: rotate(-4deg); } }
@keyframes sfxb-awWord { 0%, 50% { opacity: 0; transform: scale(1.9); } 59% { opacity: 1; transform: rotate(-4deg); } 88% { opacity: 1; transform: rotate(-4deg); } 100% { opacity: 0; transform: rotate(-4deg); } }
@keyframes sfxb-rsVeil { from { opacity: 0; } to { opacity: 1; } }
@keyframes sfxb-hband { 0% { opacity: 0; transform: scaleX(0); } 40% { opacity: 1; transform: scaleX(1); } 100% { opacity: .8; transform: scaleX(1); } }
@keyframes sfxb-rsShaft { 0% { opacity: 0; transform: scaleY(0); } 50% { opacity: 1; transform: scaleY(1); } 100% { opacity: .7; transform: scaleY(1); } }
@keyframes sfxb-rsFig { from { opacity: 0; transform: translateY(90px); } to { opacity: 1; transform: none; } }
@keyframes sfxb-rsFigLose { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(24px); } }
@keyframes sfxb-rsPlate { from { opacity: 0; transform: scale(1.6) rotate(-10deg); } to { opacity: 1; transform: rotate(-4deg); } }
@keyframes sfxb-rsWord { from { opacity: 0; transform: scale(1.9); } to { opacity: 1; transform: rotate(-4deg); } }
@keyframes sfxb-rsGrade { from { opacity: 0; transform: scale(2.6) rotate(-20deg); } to { opacity: 1; transform: rotate(-8deg); } }
@keyframes sfxb-rsRow { from { opacity: 0; transform: skewX(calc(var(--skew) * -1)) translateX(80px); } to { opacity: 1; transform: skewX(calc(var(--skew) * -1)); } }
@keyframes sfxb-rsTap { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
@keyframes sfxb-awTint { 0%, 30% { opacity: 0; } 36% { opacity: 1; } 88% { opacity: 1; } 100% { opacity: 0; } }
@keyframes sfxb-awCross { 0%, 32% { transform: rotate(-24deg) scaleX(0); } 42% { transform: rotate(-24deg) scaleX(1); } 88% { opacity: 1; transform: rotate(-24deg) scaleX(1); } 100% { opacity: 0; transform: rotate(-24deg) scaleX(1); } }
@keyframes sfxb-awCross2 { 0%, 35% { transform: rotate(18deg) scaleX(0); } 45% { transform: rotate(18deg) scaleX(1); } 88% { opacity: 1; transform: rotate(18deg) scaleX(1); } 100% { opacity: 0; transform: rotate(18deg) scaleX(1); } }
@keyframes sfxb-awStreak { 0% { opacity: 0; transform: rotate(-24deg) translateX(-50%); } 30% { opacity: 1; } 100% { opacity: 0; transform: rotate(-24deg) translateX(50%); } }
@keyframes sfxb-awEmber { 0% { opacity: 0; transform: none; } 15% { opacity: 1; } 100% { opacity: 0; transform: translate(30px, calc(var(--rise) * -1)); } }
@keyframes sfxb-awPG { 0%, 58% { opacity: 0; transform: rotate(-4deg) scaleX(0); } 64% { opacity: 1; transform: rotate(-4deg) scaleX(1); } 72% { opacity: 0; transform: rotate(-4deg) scaleX(1); } 100% { opacity: 0; } }
`;
export const COMBAT_STAGE_FX_STYLE_CSS = Object.freeze({
    'veil': `
#igs-overlay .igs-sfx[data-sfx="veil"] { --halo: 0 1px 3px #000, 0 0 14px #000; --edge: #0a0a0b; --title-halo: 0 0 16px rgba(255,238,184,.35), 0 2px 6px #000; --veil-x: linear-gradient(90deg, transparent, var(--edge) 22%, var(--edge) 78%, transparent); --glow: #ffe9b0; --gold: #ffeeb8; --veil-y: linear-gradient(to bottom, transparent, var(--edge) 26%, var(--edge) 74%, transparent); --glow-mid: rgba(255,233,176,.55); }
#igs-overlay .igs-sfx[data-sfx="veil"] .cut { --skew-k: 1; }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .name, #igs-overlay .igs-sfx[data-sfx="veil"] .clash .name small, #igs-overlay .igs-sfx[data-sfx="veil"] .big small { text-shadow: var(--halo); }
#igs-overlay .igs-sfx[data-sfx="veil"] .awaken .plate svg, #igs-overlay .igs-sfx[data-sfx="veil"] .result .plate svg, #igs-overlay .igs-sfx[data-sfx="veil"] .vs svg { display: none; }
#igs-overlay .igs-sfx[data-sfx="veil"] .awaken .plate, #igs-overlay .igs-sfx[data-sfx="veil"] .result .plate { background: radial-gradient(ellipse closest-side at 50% 50%, var(--edge) 62%, transparent) center / 100% 100% no-repeat; }
#igs-overlay .igs-sfx[data-sfx="veil"] .big { font: 800 64px/1 var(--display); letter-spacing: .14em; text-indent: .14em; text-shadow: var(--title-halo); }
#igs-overlay .igs-sfx[data-sfx="veil"] .awaken .big { top: 546px; }
#igs-overlay .igs-sfx[data-sfx="veil"] .result .big { top: 140px; font-size: 58px; }
#igs-overlay .igs-sfx[data-sfx="veil"].land .awaken .big { top: 456px; font-size: 76px; }
#igs-overlay .igs-sfx[data-sfx="veil"].land .result .big { top: 138px; font-size: 84px; }
#igs-overlay .igs-sfx[data-sfx="veil"] .result.lose .big { text-shadow: var(--halo); }
#igs-overlay .igs-sfx[data-sfx="veil"] .big small { font-weight: 800; letter-spacing: .32em; }
#igs-overlay .igs-sfx[data-sfx="veil"] .line { padding: 10px 56px; background: var(--veil-x); box-shadow: none; transform: none; font-weight: 800; text-shadow: var(--halo); }
#igs-overlay .igs-sfx[data-sfx="veil"] .line > span { transform: none; }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .vs { background: none; }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .vs b { font: 800 1.45em/1 var(--display); letter-spacing: .16em; text-indent: .16em; transform: translate(-50%, -50%); text-shadow: var(--title-halo); }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .vs .blade { height: 1px; margin-top: -.5px; transform: rotate(0) scaleX(0); animation-name: sfx-veil-vBlade; }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .vs .blade.b2 { animation-name: sfx-veil-vBlade2; }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .vs { animation-name: sfx-veil-vVs; }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .name { font-weight: 800; letter-spacing: .1em; }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .name.h, #igs-overlay .igs-sfx[data-sfx="veil"] .clash .name.f { font-size: 42px; }
#igs-overlay .igs-sfx[data-sfx="veil"].land .clash .name { font-size: 54px; }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .name .and { font-size: 17px; }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .name i { width: 48px; height: 2px; transform: none; box-shadow: none; }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .hero-side { background: linear-gradient(160deg, #1c1213, #0a0a0b 70%); }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .foe-side { background: linear-gradient(200deg, #12141a, #070708 70%); }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .seam .ink, #igs-overlay .igs-sfx[data-sfx="veil"] .clash .seam .gold { display: none; }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .seam .hot { stroke-width: 2; filter: drop-shadow(0 0 5px var(--glow)); animation-name: sfx-veil-vShot; }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .light path.rays2 { fill: var(--glow); }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash radialGradient stop:nth-child(3), #igs-overlay .igs-sfx[data-sfx="veil"] .clash radialGradient stop:nth-child(4) { stop-color: var(--glow); }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .light .ring { stroke: #fffaf0; }
#igs-overlay .igs-sfx[data-sfx="veil"] .clash .flare { background: linear-gradient(90deg, transparent, var(--glow) 30%, #fff 50%, var(--glow) 70%, transparent); }
#igs-overlay .igs-sfx[data-sfx="veil"] .result .hband { background: linear-gradient(to bottom, transparent, #302b1d 40%, #5c5439 50%, #302b1d 60%, transparent); }
#igs-overlay .igs-sfx[data-sfx="veil"] .cut { --el: var(--gold); }
#igs-overlay .igs-sfx[data-sfx="veil"] .cut .band { background: var(--edge); box-shadow: none; }
#igs-overlay .igs-sfx[data-sfx="veil"] .cut .band::before, #igs-overlay .igs-sfx[data-sfx="veil"] .cut .band::after { content: ""; position: absolute; left: 0; right: 0; height: 1px; z-index: 3; background: linear-gradient(90deg, transparent, var(--el, var(--gold)) 25%, var(--el, var(--gold)) 75%, transparent); }
#igs-overlay .igs-sfx[data-sfx="veil"] .cut .band::before { top: 0; }
#igs-overlay .igs-sfx[data-sfx="veil"] .cut .band::after { bottom: 0; }
#igs-overlay .igs-sfx[data-sfx="veil"] .cut .fig { filter: drop-shadow(0 0 18px var(--el)); }
#igs-overlay .igs-sfx[data-sfx="veil"] .cut .move { font-size: 40px; font-weight: 800; letter-spacing: .06em; text-shadow: var(--halo), 0 0 18px var(--el); }
#igs-overlay .igs-sfx[data-sfx="veil"] .cut .move small { text-shadow: var(--halo); }
#igs-overlay .igs-sfx[data-sfx="veil"].land .cut .move { font-size: 60px; }
#igs-overlay .igs-sfx[data-sfx="veil"] .awaken .eye { border: 0; -webkit-mask: var(--veil-y); mask: var(--veil-y); }
#igs-overlay .igs-sfx[data-sfx="veil"] .awaken .aw-tint { background: linear-gradient(160deg, #1c1517 0%, #0e0d0f 55%, var(--edge) 100%); }
#igs-overlay .igs-sfx[data-sfx="veil"] .awaken .aw-cross { display: none; }
#igs-overlay .igs-sfx[data-sfx="veil"] .awaken .aw-streak { background: linear-gradient(90deg, transparent, var(--glow) 30%, #fff 60%, transparent); filter: drop-shadow(0 0 6px var(--glow)); }
#igs-overlay .igs-sfx[data-sfx="veil"] .awaken .aw-ember { box-shadow: 0 0 8px 2px var(--glow); }
#igs-overlay .igs-sfx[data-sfx="veil"] .awaken .fig { filter: drop-shadow(0 0 22px var(--glow-mid)); }
#igs-overlay .igs-sfx[data-sfx="veil"] .awaken .plate { animation-name: sfx-veil-vAwPlate; }
#igs-overlay .igs-sfx[data-sfx="veil"] .awaken .big { animation-name: sfx-veil-vAwWord; }
#igs-overlay .igs-sfx[data-sfx="veil"] .result.lose { --el: #b4605a; }
#igs-overlay .igs-sfx[data-sfx="veil"] .result .plate { animation-name: sfx-veil-vRsPlate; }
#igs-overlay .igs-sfx[data-sfx="veil"] .result .big { animation-name: sfx-veil-vRsWord; }
#igs-overlay .igs-sfx[data-sfx="veil"] .result .grade { animation-name: sfx-veil-vRsGrade; font: 800 80px/1 var(--display); text-shadow: var(--halo), 0 0 22px var(--glow-mid); }
#igs-overlay .igs-sfx[data-sfx="veil"].land .result .grade { font-size: 104px; }
#igs-overlay .igs-sfx[data-sfx="veil"] .result.lose .grade { text-shadow: var(--halo); }
#igs-overlay .igs-sfx[data-sfx="veil"] .result .row { padding: 0 40px; background: var(--veil-x); border-left: 0; transform: none; animation-name: sfx-veil-vRsRow; }
#igs-overlay .igs-sfx[data-sfx="veil"] .result .row > * { transform: none; }
#igs-overlay .igs-sfx[data-sfx="veil"] .result .row b { font: 800 22px/1 var(--num); }
@keyframes sfx-veil-vBlade { 0% { opacity: 1; transform: scaleX(0); } 40% { transform: scaleX(1); } 100% { opacity: .7; transform: scaleX(1); } }
@keyframes sfx-veil-vBlade2 { 0% { opacity: 1; transform: translateY(.5em) scaleX(0); } 40% { transform: translateY(.5em) scaleX(1); } 100% { opacity: .5; transform: translateY(.5em) scaleX(1); } }
@keyframes sfx-veil-vVs { 0% { opacity: 0; transform: scale(1.8); } 100% { opacity: 1; transform: none; } }
@keyframes sfx-veil-vShot { 0% { stroke-width: 3; } 100% { stroke: var(--gold); stroke-width: 0; } }
@keyframes sfx-veil-vAwPlate { 0%, 48% { opacity: 0; transform: scale(1.3); } 56% { opacity: 1; transform: none; } 88% { opacity: 1; } 100% { opacity: 0; } }
@keyframes sfx-veil-vAwWord { 0%, 50% { opacity: 0; transform: scale(1.5); } 59% { opacity: 1; transform: none; } 88% { opacity: 1; } 100% { opacity: 0; } }
@keyframes sfx-veil-vRsPlate { from { opacity: 0; transform: scale(1.3); } to { opacity: 1; transform: none; } }
@keyframes sfx-veil-vRsWord { from { opacity: 0; transform: scale(1.5); } to { opacity: 1; transform: none; } }
@keyframes sfx-veil-vRsGrade { from { opacity: 0; transform: scale(1.8); } to { opacity: 1; transform: none; } }
@keyframes sfx-veil-vRsRow { from { opacity: 0; transform: translateX(80px); } to { opacity: 1; transform: none; } }
`,
    'ink': `
#igs-overlay .igs-sfx[data-sfx="ink"] { --text: #ece7dd; --dim: #9a968c; --font-brush: "IGS-MaShanZheng", "LXGW Neo ZhiSong", "KaiTi", serif; --edge: #0c0c0b; --font-song: "LXGW Neo ZhiSong", "Source Han Serif CN", "Noto Serif SC", serif; --halo: 0 0 12px var(--edge), 0 1px 2px var(--edge); --wx-lead: url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%20420%2012'%20preserveAspectRatio%3D'none'%3E%3Cdefs%3E%3Cfilter%20id%3D'rough'%20x%3D'-5%25'%20y%3D'-30%25'%20width%3D'110%25'%20height%3D'160%25'%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'.03%20.4'%20numOctaves%3D'3'%20seed%3D'5'%20result%3D'n'%2F%3E%3CfeDisplacementMap%20in%3D'SourceGraphic'%20in2%3D'n'%20scale%3D'7'%20xChannelSelector%3D'R'%20yChannelSelector%3D'G'%2F%3E%3C%2Ffilter%3E%3Cfilter%20id%3D'dryh'%20x%3D'-5%25'%20y%3D'-30%25'%20width%3D'110%25'%20height%3D'160%25'%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'.03%20.4'%20numOctaves%3D'3'%20seed%3D'5'%20result%3D'n'%2F%3E%3CfeDisplacementMap%20in%3D'SourceGraphic'%20in2%3D'n'%20scale%3D'7'%20xChannelSelector%3D'R'%20yChannelSelector%3D'G'%20result%3D'rough'%2F%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'.004%20.3'%20numOctaves%3D'2'%20seed%3D'21'%20result%3D's'%2F%3E%3CfeColorMatrix%20in%3D's'%20type%3D'matrix'%20values%3D'0%200%200%200%200%20%200%200%200%200%200%20%200%200%200%200%200%20%200%200%200%20-7%204.3'%20result%3D'streak'%2F%3E%3CfeComposite%20in%3D'rough'%20in2%3D'streak'%20operator%3D'in'%2F%3E%3C%2Ffilter%3E%3ClinearGradient%20id%3D'solidL'%20x1%3D'0'%20x2%3D'1'%3E%3Cstop%20offset%3D'0'%20stop-color%3D'%23fff'%2F%3E%3Cstop%20offset%3D'.42'%20stop-color%3D'%23fff'%2F%3E%3Cstop%20offset%3D'.96'%20stop-color%3D'%23fff'%20stop-opacity%3D'0'%2F%3E%3C%2FlinearGradient%3E%3Cmask%20id%3D'mSolidH'%20maskContentUnits%3D'objectBoundingBox'%3E%3Crect%20width%3D'1'%20height%3D'1'%20fill%3D'none'%2F%3E%3C%2Fmask%3E%3Cpath%20id%3D'p'%20d%3D'M2%205%20C2%202.2%204.6%201%2011%201.2%20C120%202.4%20260%203.6%20418%204.8%20C260%206%20120%207.4%2011%208.8%20C4.6%209%202%207.8%202%205Z'%20fill%3D'%23fff'%2F%3E%3C%2Fdefs%3E%3Cuse%20href%3D'%23p'%20filter%3D'none'%2F%3E%3Cg%20mask%3D'none'%3E%3Cuse%20href%3D'%23p'%20filter%3D'none'%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E"); --jade: #8fa8a0; --foe: #c9c3b6; --wx-tband: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 960 150' preserveAspectRatio='none'%3E%3Cfilter id='d' x='-.02' y='-.1' width='1.04' height='1.2'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.03 .6' numOctaves='3' seed='3'/%3E%3CfeDisplacementMap in='SourceGraphic' scale='10' yChannelSelector='R'/%3E%3C/filter%3E%3ClinearGradient id='h'%3E%3Cstop offset='0' stop-color='%23fff' stop-opacity='0'/%3E%3Cstop offset='.16' stop-color='%23fff'/%3E%3Cstop offset='.84' stop-color='%23fff'/%3E%3Cstop offset='1' stop-color='%23fff' stop-opacity='0'/%3E%3C/linearGradient%3E%3Crect x='0' y='10' width='960' height='130' fill='none' filter='none'/%3E%3C/svg%3E"); --wx-tag-h: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 60' preserveAspectRatio='none'%3E%3Cfilter id='d' x='-.02' y='-.2' width='1.04' height='1.4'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.04 .5' numOctaves='3' seed='3'/%3E%3CfeDisplacementMap in='SourceGraphic' scale='6' yChannelSelector='R'/%3E%3C/filter%3E%3ClinearGradient id='h'%3E%3Cstop offset='0' stop-color='%23fff' stop-opacity='0'/%3E%3Cstop offset='.07' stop-color='%23fff'/%3E%3Cstop offset='.93' stop-color='%23fff'/%3E%3Cstop offset='1' stop-color='%23fff' stop-opacity='0'/%3E%3C/linearGradient%3E%3Crect x='0' y='6' width='400' height='48' fill='none' filter='none'/%3E%3C/svg%3E"); --wx-hstroke: url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%201040%20150'%20preserveAspectRatio%3D'none'%3E%3Cdefs%3E%3Cfilter%20id%3D'rough'%20x%3D'-5%25'%20y%3D'-30%25'%20width%3D'110%25'%20height%3D'160%25'%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'.03%20.4'%20numOctaves%3D'3'%20seed%3D'5'%20result%3D'n'%2F%3E%3CfeDisplacementMap%20in%3D'SourceGraphic'%20in2%3D'n'%20scale%3D'7'%20xChannelSelector%3D'R'%20yChannelSelector%3D'G'%2F%3E%3C%2Ffilter%3E%3Cfilter%20id%3D'dryh'%20x%3D'-5%25'%20y%3D'-30%25'%20width%3D'110%25'%20height%3D'160%25'%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'.03%20.4'%20numOctaves%3D'3'%20seed%3D'5'%20result%3D'n'%2F%3E%3CfeDisplacementMap%20in%3D'SourceGraphic'%20in2%3D'n'%20scale%3D'7'%20xChannelSelector%3D'R'%20yChannelSelector%3D'G'%20result%3D'rough'%2F%3E%3CfeTurbulence%20type%3D'fractalNoise'%20baseFrequency%3D'.004%20.3'%20numOctaves%3D'2'%20seed%3D'21'%20result%3D's'%2F%3E%3CfeColorMatrix%20in%3D's'%20type%3D'matrix'%20values%3D'0%200%200%200%200%20%200%200%200%200%200%20%200%200%200%200%200%20%200%200%200%20-7%204.3'%20result%3D'streak'%2F%3E%3CfeComposite%20in%3D'rough'%20in2%3D'streak'%20operator%3D'in'%2F%3E%3C%2Ffilter%3E%3ClinearGradient%20id%3D'solidL'%20x1%3D'0'%20x2%3D'1'%3E%3Cstop%20offset%3D'0'%20stop-color%3D'%23fff'%2F%3E%3Cstop%20offset%3D'.42'%20stop-color%3D'%23fff'%2F%3E%3Cstop%20offset%3D'.96'%20stop-color%3D'%23fff'%20stop-opacity%3D'0'%2F%3E%3C%2FlinearGradient%3E%3Cmask%20id%3D'mSolidH'%20maskContentUnits%3D'objectBoundingBox'%3E%3Crect%20width%3D'1'%20height%3D'1'%20fill%3D'none'%2F%3E%3C%2Fmask%3E%3Cpath%20id%3D'p'%20d%3D'M30%2074%20C26%2040%2064%2018%20126%2020%20C320%2024%20600%2032%20820%2042%20C900%2046%20980%2056%201032%2072%20C962%2080%20882%2096%20802%20104%20C602%20118%20330%20128%20122%20130%20C58%20130%2033%20104%2030%2074Z'%20fill%3D'%23fff'%2F%3E%3C%2Fdefs%3E%3Cuse%20href%3D'%23p'%20filter%3D'none'%2F%3E%3Cg%20mask%3D'none'%3E%3Cuse%20href%3D'%23p'%20filter%3D'none'%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E"); --wx-mad: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1000 648' preserveAspectRatio='none'%3E%3Cfilter id='d' x='-.1' y='-.5' width='1.2' height='2'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.007 .012' numOctaves='3' seed='6'/%3E%3CfeDisplacementMap in='SourceGraphic' scale='150'/%3E%3CfeGaussianBlur stdDeviation='9'/%3E%3C/filter%3E%3Crect x='-60' y='250' width='1120' height='520' fill='%23fff' filter='none'/%3E%3C/svg%3E"); --panel-2: #252422; --faint: #625f58; }
#igs-overlay .igs-sfx[data-sfx="ink"] .clash .hero-side { background: linear-gradient(160deg, #1a1c1d, #0a0b0b 70%); }
#igs-overlay .igs-sfx[data-sfx="ink"] .clash .foe-side { background: linear-gradient(200deg, #161819, #070808 70%); }
#igs-overlay .igs-sfx[data-sfx="ink"] .clash .seam .hot { filter: drop-shadow(0 0 6px var(--text)); }
#igs-overlay .igs-sfx[data-sfx="ink"] .clash .light .ring { stroke: var(--text); filter: drop-shadow(0 0 8px var(--glow)); }
#igs-overlay .igs-sfx[data-sfx="ink"] .clash .flare { background: linear-gradient(90deg, transparent, var(--dim) 30%, #fff 50%, var(--dim) 70%, transparent); }
#igs-overlay .igs-sfx[data-sfx="ink"] .clash .name { font-family: var(--font-brush); font-weight: 400; letter-spacing: .1em; -webkit-text-stroke: 0;
  text-shadow: 0 0 22px var(--edge), 0 2px 4px var(--edge), 0 0 14px var(--glow-mid); }
#igs-overlay .igs-sfx[data-sfx="ink"] .clash .name small { font-family: var(--font-song); font-weight: 400; -webkit-text-stroke: 0; text-shadow: var(--halo); }
#igs-overlay .igs-sfx[data-sfx="ink"] .clash .name .and { font-family: var(--font-brush); -webkit-text-stroke: 0; }
#igs-overlay .igs-sfx[data-sfx="ink"] .clash .name i { width: 120px; height: 10px; transform: none; box-shadow: none;
  -webkit-mask: var(--wx-lead) center/100% 100% no-repeat; mask: var(--wx-lead) center/100% 100% no-repeat; }
#igs-overlay .igs-sfx[data-sfx="ink"] .clash .name.h i { background: var(--jade); }
#igs-overlay .igs-sfx[data-sfx="ink"] .clash .name.f i { background: var(--foe); }
#igs-overlay .igs-sfx[data-sfx="ink"] .clash .vs svg { display: none; }
#igs-overlay .igs-sfx[data-sfx="ink"] .clash .vs b { font: 400 2.8em/1 "IGS-PangMen", var(--font-brush); transform: translate(-50%, -52%); -webkit-text-stroke: 0; color: var(--text);
  text-shadow: 0 0 .3em var(--glow-mid), 0 .03em .08em var(--edge); }
#igs-overlay .igs-sfx[data-sfx="ink"] .clash .vs .blade { background: linear-gradient(90deg, transparent, #fff 35%, #fff 65%, transparent); }
#igs-overlay .igs-sfx[data-sfx="ink"] .cut .band { background: var(--edge); box-shadow: none; border: 0;
  -webkit-mask: var(--wx-tband) center/100% 100% no-repeat; mask: var(--wx-tband) center/100% 100% no-repeat; }
#igs-overlay .igs-sfx[data-sfx="ink"] .cut .move { font-family: var(--font-brush); font-weight: 400; letter-spacing: .08em; -webkit-text-stroke: 0; text-shadow: 0 0 18px var(--edge), 0 2px 4px var(--edge); }
#igs-overlay .igs-sfx[data-sfx="ink"] .cut { --el: var(--text); }
#igs-overlay .igs-sfx[data-sfx="ink"] .cut.jade { --el: var(--jade); }
#igs-overlay .igs-sfx[data-sfx="ink"] .cut .dim { background: var(--edge); }
#igs-overlay .igs-sfx[data-sfx="ink"] .cut .ember { background: #fff; box-shadow: 0 0 8px 2px var(--el); }
#igs-overlay .igs-sfx[data-sfx="ink"] .line { background: var(--edge); box-shadow: none; padding: 10px 22px;
  -webkit-mask: var(--wx-tag-h) center/100% 100% no-repeat; mask: var(--wx-tag-h) center/100% 100% no-repeat; font-family: var(--font-song); font-weight: 400; }
#igs-overlay .igs-sfx[data-sfx="ink"] .awaken .plate svg, #igs-overlay .igs-sfx[data-sfx="ink"] .result .plate svg { display: none; }
#igs-overlay .igs-sfx[data-sfx="ink"] .awaken .plate::before, #igs-overlay .igs-sfx[data-sfx="ink"] .result .plate::before { content: ""; position: absolute; inset: -10% -4%; background: var(--edge);
  -webkit-mask: var(--wx-hstroke) center/100% 100% no-repeat; mask: var(--wx-hstroke) center/100% 100% no-repeat; }
#igs-overlay .igs-sfx[data-sfx="ink"] .big { -webkit-text-stroke: 0; font-family: var(--font-brush); font-weight: 400; color: var(--text);
  text-shadow: 0 0 26px var(--glow-mid), 0 2px 6px var(--edge); }
#igs-overlay .igs-sfx[data-sfx="ink"] .big small { font-family: var(--font-song); font-weight: 400; color: var(--dim); -webkit-text-stroke: 0; }
#igs-overlay .igs-sfx[data-sfx="ink"] .result { --el: var(--text); }
#igs-overlay .igs-sfx[data-sfx="ink"] .result.lose { --el: var(--dim); }
#igs-overlay .igs-sfx[data-sfx="ink"] .result.lose .big { color: var(--bt-lose); text-shadow: 0 2px 6px var(--edge); }
#igs-overlay .igs-sfx[data-sfx="ink"] .result.lose::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 52%; background: var(--edge); pointer-events: none;
  -webkit-mask: var(--wx-mad) center bottom/100% 100% no-repeat; mask: var(--wx-mad) center bottom/100% 100% no-repeat; }
#igs-overlay .igs-sfx[data-sfx="ink"] .result .veil, #igs-overlay .igs-sfx[data-sfx="ink"] .awaken .veil { background: var(--edge); }
#igs-overlay .igs-sfx[data-sfx="ink"] .result .hband { background: linear-gradient(to bottom, transparent, var(--dim) 40%, var(--text) 50%, var(--dim) 60%, transparent); }
#igs-overlay .igs-sfx[data-sfx="ink"] .result .grade { font: 400 116px/1 var(--font-brush); -webkit-text-stroke: 0; color: var(--text); text-shadow: 0 0 24px var(--glow-mid), 0 3px 6px var(--edge); }
#igs-overlay .igs-sfx[data-sfx="ink"] .result .grade small { font-family: var(--font-song); font-weight: 400; }
#igs-overlay .igs-sfx[data-sfx="ink"] .result .row { background: var(--panel-2); border-left: 0; padding: 0 22px;
  -webkit-mask: var(--wx-tag-h) center/100% 100% no-repeat; mask: var(--wx-tag-h) center/100% 100% no-repeat; }
#igs-overlay .igs-sfx[data-sfx="ink"] .result .row span { color: var(--dim); font-family: var(--font-song); font-weight: 400; }
#igs-overlay .igs-sfx[data-sfx="ink"] .result .row b.g { color: var(--text); }
#igs-overlay .igs-sfx[data-sfx="ink"] .result .tap { color: var(--faint); }
#igs-overlay .igs-sfx[data-sfx="ink"] .awaken .eye i { background: var(--text); }

`,
    'tech': `
#igs-overlay .igs-sfx[data-sfx="tech"] { --hair: #2a3b47; --ring-s: polygon(0 var(--cs), var(--cs) 0, 100% 0, 100% calc(100% - var(--cs)), calc(100% - var(--cs)) 100%, 0 100%, 0 var(--cs),
    1px calc(var(--cs) + 1px), 1px calc(100% - 1px), calc(100% - var(--cs) - 1px) calc(100% - 1px), calc(100% - 1px) calc(100% - var(--cs) - 1px), calc(100% - 1px) 1px, calc(var(--cs) + 1px) 1px, 1px calc(var(--cs) + 1px)); --ring-m: polygon(0 var(--cm), var(--cm) 0, 100% 0, 100% calc(100% - var(--cm)), calc(100% - var(--cm)) 100%, 0 100%, 0 var(--cm),
    1px calc(var(--cm) + 1px), 1px calc(100% - 1px), calc(100% - var(--cm) - 1px) calc(100% - 1px), calc(100% - 1px) calc(100% - var(--cm) - 1px), calc(100% - 1px) 1px, calc(var(--cm) + 1px) 1px, 1px calc(var(--cm) + 1px)); --halo: 0 1px 2px #000, 0 0 10px #000; --edge: #07090b; --cut-l: polygon(0 var(--cl), var(--cl) 0, 100% 0, 100% calc(100% - var(--cl)), calc(100% - var(--cl)) 100%, 0 100%); --cy: #7fd0ff; --ring-l: polygon(0 var(--cl), var(--cl) 0, 100% 0, 100% calc(100% - var(--cl)), calc(100% - var(--cl)) 100%, 0 100%, 0 var(--cl),
    2px calc(var(--cl) + 2px), 2px calc(100% - 2px), calc(100% - var(--cl) - 2px) calc(100% - 2px), calc(100% - 2px) calc(100% - var(--cl) - 2px), calc(100% - 2px) 2px, calc(var(--cl) + 2px) 2px, 2px calc(var(--cl) + 2px)); --font-big: Bahnschrift, "DIN Alternate", "Arial Narrow", var(--num); --glow-mid: rgba(127,208,255,.6); --cut-m: polygon(0 var(--cm), var(--cm) 0, 100% 0, 100% calc(100% - var(--cm)), calc(100% - var(--cm)) 100%, 0 100%); --glow: #7fd0ff; --rim: #e8f6ff; --red: #ff7a3d; --cut-s: polygon(0 var(--cs), var(--cs) 0, 100% 0, 100% calc(100% - var(--cs)), calc(100% - var(--cs)) 100%, 0 100%); --cs: 6px; --cm: 10px; --cl: 16px; }
#igs-overlay .igs-sfx[data-sfx="tech"] .line::after, #igs-overlay .igs-sfx[data-sfx="tech"] .result .row::after { content: ""; position: absolute; inset: 0; z-index: 6; pointer-events: none; background: var(--rc, var(--hair)); clip-path: var(--ring-s); }
#igs-overlay .igs-sfx[data-sfx="tech"] .line::after { clip-path: var(--ring-m); }
#igs-overlay .igs-sfx[data-sfx="tech"] .result .row { position: relative; }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .name, #igs-overlay .igs-sfx[data-sfx="tech"] .clash .name small, #igs-overlay .igs-sfx[data-sfx="tech"] .big small { text-shadow: var(--halo); }
#igs-overlay .igs-sfx[data-sfx="tech"] .awaken .plate svg, #igs-overlay .igs-sfx[data-sfx="tech"] .result .plate svg, #igs-overlay .igs-sfx[data-sfx="tech"] .vs svg { display: none; }
#igs-overlay .igs-sfx[data-sfx="tech"] .awaken .plate, #igs-overlay .igs-sfx[data-sfx="tech"] .result .plate, #igs-overlay .igs-sfx[data-sfx="tech"] .vs { background: var(--edge); clip-path: var(--cut-l); }
#igs-overlay .igs-sfx[data-sfx="tech"] .awaken .plate::after, #igs-overlay .igs-sfx[data-sfx="tech"] .result .plate::after, #igs-overlay .igs-sfx[data-sfx="tech"] .vs::after { content: ""; position: absolute; inset: 0; background: var(--el, var(--cy)); clip-path: var(--ring-l); }
#igs-overlay .igs-sfx[data-sfx="tech"] .result.lose .plate::after { background: #8a3a22; }
#igs-overlay .igs-sfx[data-sfx="tech"] .big { font: 800 64px/1 var(--font-big); letter-spacing: .12em; text-indent: .12em; text-shadow: var(--halo), 0 0 20px var(--glow-mid); }
#igs-overlay .igs-sfx[data-sfx="tech"] .awaken .big { top: 546px; animation-name: sfx-tech-tAwWord; }
#igs-overlay .igs-sfx[data-sfx="tech"] .result .big { top: 140px; font-size: 58px; animation-name: sfx-tech-tRsWord; }
#igs-overlay .igs-sfx[data-sfx="tech"].land .awaken .big { top: 456px; font-size: 76px; }
#igs-overlay .igs-sfx[data-sfx="tech"].land .result .big { top: 138px; font-size: 84px; }
#igs-overlay .igs-sfx[data-sfx="tech"] .result.lose .big { text-shadow: var(--halo); }
#igs-overlay .igs-sfx[data-sfx="tech"] .big small { font-weight: 800; letter-spacing: .32em; color: var(--cy); }
#igs-overlay .igs-sfx[data-sfx="tech"] .awaken .plate { animation-name: sfx-tech-tAwPlate; }
#igs-overlay .igs-sfx[data-sfx="tech"] .result .plate { animation-name: sfx-tech-tRsPlate; }
#igs-overlay .igs-sfx[data-sfx="tech"] .line { background: var(--edge); box-shadow: none; transform: none; clip-path: var(--cut-m); --rc: var(--el, var(--cy)); font-weight: 800; }
#igs-overlay .igs-sfx[data-sfx="tech"] .line > span { transform: none; }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .vs { animation-name: sfx-tech-tVs; font-size: 76px; background: none; clip-path: none; }
#igs-overlay .igs-sfx[data-sfx="tech"].land .clash .vs { font-size: 108px; }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .vs::before { content: ""; position: absolute; inset: .12em -.2em; background: var(--edge); clip-path: var(--cut-l); }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .vs::after { inset: .12em -.2em; }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .vs b { font: 800 2.2em/1 var(--font-big); letter-spacing: .06em; text-indent: .06em; transform: translate(-50%, -50%); text-shadow: var(--halo), 0 0 .3em var(--glow-mid); }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .name { font-weight: 800; letter-spacing: .08em; }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .name.h, #igs-overlay .igs-sfx[data-sfx="tech"] .clash .name.f { font-size: 48px; }
#igs-overlay .igs-sfx[data-sfx="tech"].land .clash .name { font-size: 64px; }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .name .and { font-size: 18px; }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .name i { width: 56px; height: 3px; transform: none; box-shadow: none; }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .hero-side { background: linear-gradient(160deg, #0f1a22, #07090b 70%); }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .foe-side { background: linear-gradient(200deg, #1a1009, #070708 70%); }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .seam .hot { filter: drop-shadow(0 0 6px var(--cy)); }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .light path.rays2 { fill: var(--glow); }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash radialGradient stop:nth-child(2) { stop-color: #e6f7ff; }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash radialGradient stop:nth-child(3) { stop-color: var(--glow); }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash radialGradient stop:nth-child(4) { stop-color: #2d7fb0; }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .light .ring { stroke: #e6f7ff; }
#igs-overlay .igs-sfx[data-sfx="tech"] .clash .flare { background: linear-gradient(90deg, transparent, var(--glow) 30%, #fff 50%, var(--glow) 70%, transparent); }
#igs-overlay .igs-sfx[data-sfx="tech"] .result .hband { background: linear-gradient(to bottom, transparent, #12303f 40%, #2a6a8c 50%, #12303f 60%, transparent); }
#igs-overlay .igs-sfx[data-sfx="tech"] .cut .band { background: var(--edge); box-shadow: none; border-top: 2px solid var(--el); border-bottom: 1px solid var(--el); }
#igs-overlay .igs-sfx[data-sfx="tech"] .cut .fig { filter: drop-shadow(0 0 18px var(--el)); }
#igs-overlay .igs-sfx[data-sfx="tech"] .cut .move { font-weight: 800; font-size: 42px; letter-spacing: .06em; text-shadow: var(--halo), 0 0 18px var(--el); }
#igs-overlay .igs-sfx[data-sfx="tech"] .cut .move small { text-shadow: var(--halo); }
#igs-overlay .igs-sfx[data-sfx="tech"].land .cut .move { font-size: 64px; }
#igs-overlay .igs-sfx[data-sfx="tech"] .awaken .eye { border-top: 2px solid var(--cy); border-bottom: 1px solid var(--rim); }
#igs-overlay .igs-sfx[data-sfx="tech"] .awaken .aw-tint { background: linear-gradient(160deg, #0d2230 0%, #090d11 55%, var(--edge) 100%); }
#igs-overlay .igs-sfx[data-sfx="tech"] .awaken .aw-cross { background: #0f2a3a; border-top-color: var(--cy); border-bottom-color: var(--red); }
#igs-overlay .igs-sfx[data-sfx="tech"] .awaken .aw-cross.c2 { background: var(--edge); border-top-color: var(--red); border-bottom-color: var(--cy); }
#igs-overlay .igs-sfx[data-sfx="tech"] .awaken .aw-streak { background: linear-gradient(90deg, transparent, var(--glow) 30%, #fff 60%, transparent); filter: drop-shadow(0 0 6px var(--glow)); }
#igs-overlay .igs-sfx[data-sfx="tech"] .awaken .aw-ember { box-shadow: 0 0 8px 2px var(--glow); }
#igs-overlay .igs-sfx[data-sfx="tech"] .awaken .fig { filter: drop-shadow(0 0 0 var(--edge)) drop-shadow(-6px 0 0 var(--cy)) drop-shadow(0 0 24px var(--glow-mid)); }
#igs-overlay .igs-sfx[data-sfx="tech"] .result.lose { --el: #c4562e; }
#igs-overlay .igs-sfx[data-sfx="tech"] .result .grade { font: 800 80px/1 var(--font-big); animation-name: sfx-tech-tRsGrade; text-shadow: var(--halo), 0 0 22px var(--glow-mid); }
#igs-overlay .igs-sfx[data-sfx="tech"].land .result .grade { font-size: 104px; }
#igs-overlay .igs-sfx[data-sfx="tech"] .result.lose .grade { text-shadow: var(--halo); }
#igs-overlay .igs-sfx[data-sfx="tech"] .result .row { background: var(--edge); border-left: 0; transform: none; clip-path: var(--cut-s); --rc: var(--el); animation-name: sfx-tech-tRsRow; }
#igs-overlay .igs-sfx[data-sfx="tech"] .result .row > * { transform: none; }
#igs-overlay .igs-sfx[data-sfx="tech"] .result .row b { font: 800 22px/1 var(--font-big); }
@keyframes sfx-tech-tAwWord { 0%, 50% { opacity: 0; transform: scale(1.5); } 59% { opacity: 1; transform: none; } 88% { opacity: 1; } 100% { opacity: 0; } }
@keyframes sfx-tech-tRsWord { from { opacity: 0; transform: scale(1.5); } to { opacity: 1; transform: none; } }
@keyframes sfx-tech-tAwPlate { 0%, 48% { opacity: 0; transform: scale(1.3); } 56% { opacity: 1; transform: none; } 88% { opacity: 1; } 100% { opacity: 0; } }
@keyframes sfx-tech-tRsPlate { from { opacity: 0; transform: scale(1.3); } to { opacity: 1; transform: none; } }
@keyframes sfx-tech-tVs { 0% { opacity: 0; transform: scale(2); } 55% { opacity: 1; transform: scale(.94); } 100% { opacity: 1; transform: none; } }
@keyframes sfx-tech-tRsGrade { from { opacity: 0; transform: scale(1.8); } to { opacity: 1; transform: none; } }
@keyframes sfx-tech-tRsRow { from { opacity: 0; transform: translateX(80px); } to { opacity: 1; transform: none; } }
`,
    'mystic': `
#igs-overlay .igs-sfx[data-sfx="mystic"] { --title: "LXGW Neo ZhiSong", "Songti SC", "SimSun", serif; --gold: #b9a46a; --font-big: "Cinzel", "Tsanger YuYang", serif; --jade: #8fc4ae; --num: "Cinzel", "LXGW Neo ZhiSong", serif; --title-big: "Tsanger YuYang", "LXGW Neo ZhiSong", serif; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .name, #igs-overlay .igs-sfx[data-sfx="mystic"] .big, #igs-overlay .igs-sfx[data-sfx="mystic"] .cut .move, #igs-overlay .igs-sfx[data-sfx="mystic"] .line { font-family: var(--title); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .name, #igs-overlay .igs-sfx[data-sfx="mystic"] .cut .move { text-shadow: 0 1px 3px #000, 0 0 12px #000; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result .grade, #igs-overlay .igs-sfx[data-sfx="mystic"] .result .row b { font-style: normal; font-weight: 600; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .hero-side { background: linear-gradient(160deg, #1d1a2c, #09090e 70%); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .foe-side { background: linear-gradient(200deg, #121a26, #07080b 70%); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .seam .ink { stroke-width: 6; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .seam .gold { stroke-width: 2; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .seam .hot { stroke-width: 2; filter: drop-shadow(0 0 6px #d9c88e); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .light .rays2 { fill: #d9c88e; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .light .ring { stroke: #f4efe0; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .flare { background: linear-gradient(90deg, transparent, #b9a46a 30%, #fff 50%, #b9a46a 70%, transparent); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .name { font-weight: 400; letter-spacing: .2em; font-size: 54px; text-shadow: 0 2px 6px #000, 0 0 22px #000; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .name small { font-weight: 400; letter-spacing: .4em; font-family: var(--title); color: #d9d2bd; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .name .and { font-family: var(--title); font-weight: 400; letter-spacing: .2em; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .name i { width: 72px; height: 1px; transform: none; box-shadow: none; background: var(--gold); position: relative; overflow: visible; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .name i::after { content: ""; position: absolute; top: -3px; width: 7px; height: 7px; background: var(--gold); transform: rotate(45deg); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .name.h i::after { right: -4px; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .name.f i::after { left: -4px; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .name.h i, #igs-overlay .igs-sfx[data-sfx="mystic"] .clash .name.f i { background: var(--gold); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .vs svg { display: none; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .vs { font-size: 76px; }
#igs-overlay .igs-sfx[data-sfx="mystic"].land .clash .vs { font-size: 104px; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .vs::before { content: ""; position: absolute; left: 50%; top: 50%; width: 1.7em; height: 1.7em; margin: -.85em 0 0 -.85em; transform: rotate(45deg);
  background: #07070b; box-shadow: 0 0 0 1px var(--gold), 0 0 0 4px #07070b, 0 0 0 5px #6f6444; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .vs::after { content: ""; position: absolute; left: -1.2em; right: -1.2em; top: 50%; height: 1px; background: linear-gradient(90deg, transparent, #b9a46a 22%, #b9a46a 36%, transparent 36%, transparent 64%, #b9a46a 64%, #b9a46a 78%, transparent); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .vs b { z-index: 2; font: 800 1.3em/1 var(--font-big); letter-spacing: .08em; transform: translate(-50%, -52%); text-shadow: 0 0 .4em #d9c88e; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .vs .blade { height: 2px; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .cut { --el: #d9c88e; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .cut.jade { --el: var(--jade); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .cut .band { background: #07070b; box-shadow: 0 0 0 1px var(--el), 0 0 0 4px #07070b, 0 0 0 5px #6f6444; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .cut .fig { filter: drop-shadow(0 0 16px #6e6137); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .cut .ember { background: #f4efe0; box-shadow: 0 0 8px 2px #b9a46a; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .cut .move { font-weight: 400; font-size: 44px; letter-spacing: .14em; text-shadow: 0 1px 3px #000, 0 0 16px #6e6137; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .cut .move small, #igs-overlay .igs-sfx[data-sfx="mystic"] .big small { font-family: var(--num); font-weight: 500; color: var(--gold); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .line { border-radius: 0; background: #07070b; box-shadow: 0 0 0 1px var(--el, var(--gold)); font-weight: 400; letter-spacing: .1em; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .awaken .veil { background: rgba(7,7,11,.9); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .awaken .eye { background: #07070b; border-top: 1px solid var(--gold); border-bottom: 1px solid var(--gold); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .awaken .fig { filter: drop-shadow(0 0 22px #6e6137); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .awaken .aw-tint { background: linear-gradient(160deg, #1f1a33 0%, #0a0a10 55%, #07070b 100%); }
#igs-overlay .igs-sfx[data-sfx="mystic"] :is(.awaken, #igs-overlay .result) .plate svg { display: none; }
#igs-overlay .igs-sfx[data-sfx="mystic"] :is(.awaken, #igs-overlay .result) .plate::before, #igs-overlay .igs-sfx[data-sfx="mystic"] :is(.awaken, #igs-overlay .result) .plate::after { content: ""; position: absolute; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, var(--el, #b9a46a) 20%, var(--el, #b9a46a) 80%, transparent); }
#igs-overlay .igs-sfx[data-sfx="mystic"] :is(.awaken, #igs-overlay .result) .plate::before { top: 0; }
#igs-overlay .igs-sfx[data-sfx="mystic"] :is(.awaken, #igs-overlay .result) .plate::after { bottom: 0; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .awaken .plate, #igs-overlay .igs-sfx[data-sfx="mystic"] .result .plate { background: linear-gradient(90deg, #07070b 0, #07070b 85%, #07070b 100%); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .big { font-family: var(--title); font-weight: 400; font-size: 76px; letter-spacing: .24em; text-indent: .24em; text-shadow: 0 2px 6px #000, 0 0 26px #6e6137; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .big small { letter-spacing: .34em; text-shadow: none; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result .big { font-size: 66px; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result { --el: #b9a46a; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result.lose { --el: #a85250; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result .veil { background: rgba(7,7,11,.88); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result .hband { background: linear-gradient(to bottom, transparent, #2a2618 40%, #4a4328 50%, #2a2618 60%, transparent); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result .fig { filter: drop-shadow(0 0 18px #6e6137); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result .fig.lead { filter: drop-shadow(0 0 18px #6e6137); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result.lose .fig { filter: grayscale(1) brightness(.5); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result.lose .big { color: #e5bcb8; text-shadow: 0 2px 6px #000; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result .grade { font-weight: 600; text-shadow: 0 2px 6px #000, 0 0 24px #6e6137; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result .row { background: #07070b; border-left: 1px solid var(--el); box-shadow: 0 0 0 1px #2c2d3a; transform: none; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result .row > * { transform: none; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result .row span { font-family: var(--title); font-weight: 400; letter-spacing: .1em; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result .row b { font-size: 22px; }
#igs-overlay .igs-sfx[data-sfx="mystic"] .result .tap { font-family: var(--title); }
#igs-overlay .igs-sfx[data-sfx="mystic"] .clash .name, #igs-overlay .igs-sfx[data-sfx="mystic"] .big, #igs-overlay .igs-sfx[data-sfx="mystic"] .cut .move { font-family: var(--title-big); }

`,
    'soft': `
#igs-overlay .igs-sfx[data-sfx="soft"] { --font-big: "ChillRoundF", sans-serif; --jade: #93d9bb; --gold: #f3d68f; }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .name, #igs-overlay .igs-sfx[data-sfx="soft"] .cut .move { text-shadow: 0 2px 6px #0e0c0f, 0 0 14px #0e0c0f; }
#igs-overlay .igs-sfx[data-sfx="soft"] .big, #igs-overlay .igs-sfx[data-sfx="soft"] .clash .name, #igs-overlay .igs-sfx[data-sfx="soft"] .cut .move, #igs-overlay .igs-sfx[data-sfx="soft"] .line { font-weight: 700; }
#igs-overlay .igs-sfx[data-sfx="soft"] .result .grade, #igs-overlay .igs-sfx[data-sfx="soft"] .result .row b { font-style: normal; font-weight: 700; }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .hero-side { background: linear-gradient(160deg, #3a2528, #171316 70%); }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .foe-side { background: linear-gradient(200deg, #262230, #151316 70%); }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .seam .ink { stroke-width: 10; stroke-linejoin: round; }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .seam .gold { stroke-width: 6; }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .seam .hot { stroke-width: 3; filter: drop-shadow(0 0 6px #ffd9b0); }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .seam polyline { stroke-linejoin: round; stroke-linecap: round; }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .light .rays2 { fill: #ffd9b0; }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .flare { background: linear-gradient(90deg, transparent, #ffd9b0 30%, #fff 50%, #ffd9b0 70%, transparent); }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .name { font-size: 52px; letter-spacing: .06em; text-shadow: 0 3px 8px #0e0c0f, 0 0 22px #0e0c0f; }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .name small { font-weight: 700; letter-spacing: .24em; }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .name i { height: 8px; width: 64px; border-radius: 999px; transform: none; box-shadow: none; }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .name .and { font-weight: 700; }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .vs svg { display: none; }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .vs::before { content: ""; position: absolute; inset: .15em -.1em; border-radius: 999px; background: #353138; box-shadow: 0 6px 16px #0e0c0f, 0 0 0 3px #f3d68f; }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .vs::after { content: ""; position: absolute; left: -.9em; right: -.9em; top: 50%; height: 6px; margin-top: -3px;
  background: radial-gradient(circle, #f3d68f 0 2.5px, transparent 3px) 0 50% / 14px 6px repeat-x;
  -webkit-mask: linear-gradient(90deg, #000 0 14%, transparent 14% 86%, #000 86%); mask: linear-gradient(90deg, #000 0 14%, transparent 14% 86%, #000 86%); }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .vs b { z-index: 2; font: 700 1.05em/1 var(--font-big); letter-spacing: .06em; transform: translate(-50%, -52%); text-shadow: 0 0 .4em #ffd9b0; }
#igs-overlay .igs-sfx[data-sfx="soft"] .clash .vs .blade { height: 3px; border-radius: 3px; }
#igs-overlay .igs-sfx[data-sfx="soft"] .cut { --el: #ffc9a0; }
#igs-overlay .igs-sfx[data-sfx="soft"] .cut.jade { --el: var(--jade); }
#igs-overlay .igs-sfx[data-sfx="soft"] .cut .band { background: #353138; box-shadow: 0 0 0 4px var(--el), 0 8px 20px #0e0c0f; }
#igs-overlay .igs-sfx[data-sfx="soft"] .cut .fig { filter: drop-shadow(0 0 16px #b0707c); }
#igs-overlay .igs-sfx[data-sfx="soft"] .cut .ember { background: #fff3dc; box-shadow: 0 0 8px 2px #ffc9a0; }
#igs-overlay .igs-sfx[data-sfx="soft"] .cut .move { font-size: 42px; letter-spacing: .06em; text-shadow: 0 3px 8px #0e0c0f, 0 0 18px #b0707c; }
#igs-overlay .igs-sfx[data-sfx="soft"] .cut .move small, #igs-overlay .igs-sfx[data-sfx="soft"] .big small { font-weight: 700; }
#igs-overlay .igs-sfx[data-sfx="soft"] .line { border-radius: 999px; padding: 8px 20px; background: #353138; box-shadow: 0 0 0 2px var(--el, var(--gold)), 0 6px 16px #0e0c0f; }
#igs-overlay .igs-sfx[data-sfx="soft"] .awaken .veil { background: rgba(29,27,30,.9); }
#igs-overlay .igs-sfx[data-sfx="soft"] .awaken .eye { background: #353138; border-top: 6px solid var(--gold); border-bottom: 3px solid #f6f0e8; }
#igs-overlay .igs-sfx[data-sfx="soft"] .awaken .fig { filter: drop-shadow(0 0 22px #b0707c); }
#igs-overlay .igs-sfx[data-sfx="soft"] .awaken .aw-tint { background: linear-gradient(160deg, #4a2830 0%, #1d1b1e 60%, #151316 100%); }
#igs-overlay .igs-sfx[data-sfx="soft"] :is(.awaken, #igs-overlay .result) .plate svg { display: none; }
#igs-overlay .igs-sfx[data-sfx="soft"] :is(.awaken, #igs-overlay .result) .plate { border-radius: 999px; background: #353138; box-shadow: 0 0 0 4px var(--el, var(--gold)), 0 8px 20px #0e0c0f; }
#igs-overlay .igs-sfx[data-sfx="soft"] .result.lose .plate { box-shadow: 0 0 0 4px var(--el), 0 8px 20px #0e0c0f; }
#igs-overlay .igs-sfx[data-sfx="soft"] .big { font-size: 78px; letter-spacing: .06em; text-shadow: 0 4px 10px #0e0c0f, 0 0 26px #b0707c; }
#igs-overlay .igs-sfx[data-sfx="soft"] .big small { letter-spacing: .26em; text-shadow: none; }
#igs-overlay .igs-sfx[data-sfx="soft"] .result { --el: #f3d68f; }
#igs-overlay .igs-sfx[data-sfx="soft"] .result.lose { --el: #d08a8a; }
#igs-overlay .igs-sfx[data-sfx="soft"] .result .big { font-size: 66px; }
#igs-overlay .igs-sfx[data-sfx="soft"] .result .veil { background: rgba(29,27,30,.88); }
#igs-overlay .igs-sfx[data-sfx="soft"] .result .hband { background: linear-gradient(to bottom, transparent, #3a2830 40%, #6a4450 50%, #3a2830 60%, transparent); }
#igs-overlay .igs-sfx[data-sfx="soft"] .result .fig, #igs-overlay .igs-sfx[data-sfx="soft"] .result .fig.lead { filter: drop-shadow(0 0 18px #b0707c); }
#igs-overlay .igs-sfx[data-sfx="soft"] .result.lose .fig { filter: grayscale(1) brightness(.5); }
#igs-overlay .igs-sfx[data-sfx="soft"] .result.lose .big { color: #ffd0cb; text-shadow: 0 3px 8px #0e0c0f; }
#igs-overlay .igs-sfx[data-sfx="soft"] .result .grade { text-shadow: 0 3px 8px #0e0c0f, 0 0 24px #b0707c; }
#igs-overlay .igs-sfx[data-sfx="soft"] .result .row { border-radius: 999px; border-left: 0; background: #353138; box-shadow: 0 0 0 2px var(--el), 0 6px 14px #0e0c0f; transform: none; }
#igs-overlay .igs-sfx[data-sfx="soft"] .result .row > * { transform: none; }
#igs-overlay .igs-sfx[data-sfx="soft"] .result .row span { font-weight: 700; }

`,
    'dark': `
#igs-overlay .igs-sfx[data-sfx="dark"] { --clash-hero: #1f0b0d; --clash-foe: #0f1114; --cold: #e8e4dc; --bone: #f1ece4; --serif: "Huiwen Mincho", "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif; --dim: #8f8b88; --jade: #7d8a8c; --blood-hi: #b02a2a; --blood: #8c1c1c; --edge: #060506; --cold-dim: #9aa4a8; }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .hero-side { background: linear-gradient(160deg, var(--clash-hero), #0a0506 70%); }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .foe-side { background: linear-gradient(200deg, var(--clash-foe), #060707 70%); }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .seam .hot { filter: drop-shadow(0 0 6px var(--cold)); }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .light .rays2 { fill: var(--cold); }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .light .ring { stroke: var(--bone); filter: drop-shadow(0 0 8px var(--cold)); }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .flare { background: linear-gradient(90deg, transparent, #9aa4a8 30%, #fff 50%, #9aa4a8 70%, transparent); }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .name { font-family: var(--serif); font-weight: 400; letter-spacing: .1em; text-shadow: 0 2px 0 #000, 0 0 20px #000; }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .name small { font-family: var(--serif); font-weight: 400; color: var(--dim); }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .name i { height: 2px; transform: none; box-shadow: none; }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .name.h i { background: var(--jade); }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .name.f i { background: var(--blood-hi); }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .name .and { font-family: var(--serif); font-weight: 400; }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .vs .p-shadow { display: none; }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .vs svg { display: none; }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .vs .p-gold, #igs-overlay .igs-sfx[data-sfx="dark"] .plate .p-gold { fill: #0a0809; stroke: none; }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .vs .p-hi, #igs-overlay .igs-sfx[data-sfx="dark"] .plate .p-hi { fill: #121013; }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .vs svg, #igs-overlay .igs-sfx[data-sfx="dark"] .plate svg { filter: drop-shadow(0 1px 0 var(--blood)); }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .vs .blade { background: linear-gradient(90deg, transparent, var(--cold) 35%, var(--cold) 65%, transparent); filter: drop-shadow(0 0 6px var(--cold)); }
#igs-overlay .igs-sfx[data-sfx="dark"] .clash .vs b { font: normal 400 2.1em/1 var(--serif); letter-spacing: .08em; color: var(--bone); transform: translate(-50%, -52%);
  text-shadow: 0 2px 6px var(--edge), 0 0 .3em var(--cold-dim); }
#igs-overlay .igs-sfx[data-sfx="dark"] .plate .p-shadow { display: none; }
#igs-overlay .igs-sfx[data-sfx="dark"] .big { font: 400 78px/1 var(--serif); letter-spacing: .14em; color: var(--bone); text-shadow: 0 2px 0 #000, 0 0 24px var(--cold-dim); }
#igs-overlay .igs-sfx[data-sfx="dark"] .big small { font: 400 20px var(--serif); letter-spacing: .32em; color: var(--dim); text-shadow: none; }
#igs-overlay .igs-sfx[data-sfx="dark"] .gleam { background: linear-gradient(90deg, transparent, var(--cold) 40%, var(--cold) 60%, transparent); filter: drop-shadow(0 0 6px var(--cold)); }
#igs-overlay .igs-sfx[data-sfx="dark"] .line { --el: var(--blood); background: #060506; box-shadow: inset 0 -1px 0 var(--el); font-family: var(--serif); font-weight: 400; letter-spacing: .06em; }
#igs-overlay .igs-sfx[data-sfx="dark"] .cut { --el: #c9d4d8; }
#igs-overlay .igs-sfx[data-sfx="dark"] .cut .dim { background: rgba(5,5,6,.7); }
#igs-overlay .igs-sfx[data-sfx="dark"] .cut .band { background: linear-gradient(100deg, #140809 0, var(--edge) 55%); box-shadow: 0 0 0 1px var(--el); }
#igs-overlay .igs-sfx[data-sfx="dark"] .cut .ember, #igs-overlay .igs-sfx[data-sfx="dark"] .awaken .aw-ember { background: var(--cold); box-shadow: 0 0 8px 2px var(--el, var(--blood)); }
#igs-overlay .igs-sfx[data-sfx="dark"] .cut .fig { filter: drop-shadow(0 0 18px var(--el)); }
#igs-overlay .igs-sfx[data-sfx="dark"] .cut .move { font: 400 48px/1 var(--serif); letter-spacing: .12em; text-shadow: 0 2px 0 #000, 0 0 18px var(--el); }
#igs-overlay .igs-sfx[data-sfx="dark"] .cut .move small { font-family: var(--serif); font-weight: 400; }
#igs-overlay .igs-sfx[data-sfx="dark"] .cut.jade { --el: #9fb0b4; }
#igs-overlay .igs-sfx[data-sfx="dark"] .awaken .eye { border-top-color: var(--blood); border-bottom-color: var(--bone); }
#igs-overlay .igs-sfx[data-sfx="dark"] .awaken .aw-tint { background: linear-gradient(160deg, #260809 0%, #0f0708 55%, var(--edge) 100%); }
#igs-overlay .igs-sfx[data-sfx="dark"] .awaken .aw-cross { background: #3a0d0d; border-top-color: var(--bone); border-bottom-color: var(--blood-hi); }
#igs-overlay .igs-sfx[data-sfx="dark"] .awaken .aw-cross.c2 { background: var(--edge); border-top-color: var(--blood-hi); border-bottom-color: var(--bone); }
#igs-overlay .igs-sfx[data-sfx="dark"] .awaken .aw-streak { background: linear-gradient(90deg, transparent, var(--blood-hi) 30%, var(--cold) 60%, transparent); filter: drop-shadow(0 0 6px var(--blood-hi)); }
#igs-overlay .igs-sfx[data-sfx="dark"] .awaken .aw-plate-gleam { background: linear-gradient(90deg, transparent, var(--cold) 45%, transparent); filter: drop-shadow(0 0 8px var(--cold)); }
#igs-overlay .igs-sfx[data-sfx="dark"] .awaken .fig { filter: drop-shadow(0 0 0 var(--edge)) drop-shadow(-4px 0 0 var(--blood)) drop-shadow(0 0 22px var(--cold-dim)); }
#igs-overlay .igs-sfx[data-sfx="dark"] .result { --el: var(--bone); }
#igs-overlay .igs-sfx[data-sfx="dark"] .result.lose { --el: var(--blood); }
#igs-overlay .igs-sfx[data-sfx="dark"] .result .hband { background: linear-gradient(to bottom, transparent, #2a2c2e 40%, #4a4c4e 50%, #2a2c2e 60%, transparent); }
#igs-overlay .igs-sfx[data-sfx="dark"] .result .fig.lead { filter: drop-shadow(0 0 20px var(--cold-dim)); }
#igs-overlay .igs-sfx[data-sfx="dark"] .result .fig.mate { filter: brightness(.6); }
#igs-overlay .igs-sfx[data-sfx="dark"] .result.lose .fig { filter: grayscale(1) brightness(.5); }
#igs-overlay .igs-sfx[data-sfx="dark"] .result .big { font-size: 80px; }
#igs-overlay .igs-sfx[data-sfx="dark"] .result.lose .big { color: #c9908c; text-shadow: 0 2px 0 #000; }
#igs-overlay .igs-sfx[data-sfx="dark"] .result.lose .plate .p-gold { fill: #1a0809; }
#igs-overlay .igs-sfx[data-sfx="dark"] .result.lose .plate .p-hi { fill: #240c0d; }
#igs-overlay .igs-sfx[data-sfx="dark"] .result .grade { font: 400 110px/1 var(--serif); text-shadow: 0 0 22px var(--cold-dim); }
#igs-overlay .igs-sfx[data-sfx="dark"] .result.lose .grade { text-shadow: none; }
#igs-overlay .igs-sfx[data-sfx="dark"] .result .grade small { font-family: var(--serif); font-weight: 400; }
#igs-overlay .igs-sfx[data-sfx="dark"] .result .row { border-left-width: 2px; background: #060506; }
#igs-overlay .igs-sfx[data-sfx="dark"] .result .row b { font: 400 24px/1 var(--serif); }
#igs-overlay .igs-sfx[data-sfx="dark"] .result .row b.g { color: var(--bone); }
#igs-overlay .igs-sfx[data-sfx="dark"] .result .tap { font-family: var(--serif); }

`,
});
