import { ANCIENT_PAPER_TEXTURE } from './fx-ancient-paper-assets.js';
// 地点与场景包的样式。一次性演出的动画只负责入场与退场，基础态即终态（reduced 与 low 直接落终态）；常驻地点层只用静态或慢动画。
// 一次性演出统一用 --igs-dfx-life 做总时长，百分比关键帧分入场 / 停留 / 退场；装饰用实色，光晕类才用渐变透明。
const L = 'var(--igs-dfx-life)';
const O = '#igs-overlay';

export const PLACES_AMBIENCE_HTML = Object.freeze({
    plpolice: '<i class="igs-pl-pol-beacon is-r"></i><i class="igs-pl-pol-beacon is-b"></i>',
    plhospital: '<i class="igs-pl-hos-tint"></i><i class="igs-pl-hos-tube"></i>',
    plkonbini: '<i class="igs-pl-kon-light"></i>',
    plkitchen: '<i class="igs-pl-kit-warm"></i><i class="igs-pl-kit-steam"></i><i class="igs-pl-kit-steam is-b"></i>',
    plmansion: '<i class="igs-pl-man-dark"></i><i class="igs-pl-man-shaft"></i><i class="igs-pl-man-candle"></i><i class="igs-pl-man-candle is-b"></i>',
    plneonrain: '<i class="igs-pl-neo-pink"></i><i class="igs-pl-neo-cyan"></i><i class="igs-pl-neo-rain"></i>',
    plshrine: '<i class="igs-pl-shr-glow"></i><i class="igs-pl-shr-lanterns"><b></b><b></b><b></b><b></b></i>',
    plgym: '<i class="igs-pl-gym-flood"></i><i class="igs-pl-gym-floor"></i>',
    pldungeon: '<i class="igs-pl-dun-dark"></i><i class="igs-pl-dun-torch"></i><i class="igs-pl-dun-torch is-b"></i><i class="igs-pl-dun-mist"></i>',
});

const AMBIENCE_CSS = `
${O} .igs-dfx-amb.is-plpolice .igs-pl-pol-beacon{top:0;bottom:0;width:44%;opacity:0;}
${O} .igs-dfx-amb.is-plpolice .igs-pl-pol-beacon.is-r{left:-8%;background:radial-gradient(ellipse at 0% 42%,rgba(214,92,100,.18),transparent 70%);animation:igs-pl-beacon-r 1.4s ease-in-out infinite;}
${O} .igs-dfx-amb.is-plpolice .igs-pl-pol-beacon.is-b{right:-8%;background:radial-gradient(ellipse at 100% 42%,rgba(96,138,226,.18),transparent 70%);animation:igs-pl-beacon-b 1.4s ease-in-out infinite;}
@keyframes igs-pl-beacon-r{0%{opacity:0}14%{opacity:1}30%{opacity:.25}40%{opacity:.9}56%,100%{opacity:0}}
@keyframes igs-pl-beacon-b{0%,50%{opacity:0}64%{opacity:1}80%{opacity:.25}90%{opacity:.9}100%{opacity:0}}
${O} .igs-dfx-amb.is-plhospital .igs-pl-hos-tint{inset:0;background:linear-gradient(180deg,rgba(214,238,232,.16),rgba(214,238,232,.04) 40%,rgba(140,190,190,.12));}
${O} .igs-dfx-amb.is-plhospital .igs-pl-hos-tube{left:18%;right:18%;top:0;height:5px;background:#eefaf6;box-shadow:0 0 26px 10px rgba(226,250,244,.38);animation:igs-pl-tube 7s linear infinite;}
@keyframes igs-pl-tube{0%,86%,90%,100%{opacity:1}88%{opacity:.55}93%{opacity:.8}}
${O} .igs-dfx-amb.is-plkonbini .igs-pl-kon-light{left:0;right:0;top:0;height:46%;background:linear-gradient(180deg,rgba(226,240,255,.2),rgba(226,240,255,.05) 60%,transparent);}
${O} .igs-dfx-amb.is-plkitchen .igs-pl-kit-warm{inset:0;background:radial-gradient(ellipse at 50% 100%,rgba(255,196,110,.22),transparent 70%),linear-gradient(180deg,rgba(255,226,170,.06),rgba(120,70,20,.1));}
${O} .igs-dfx-amb.is-plkitchen .igs-pl-kit-steam{left:12%;bottom:calc(var(--igs-fx-safe) + var(--igs-fx-vis) * .26);width:16%;height:36%;background:radial-gradient(ellipse at 50% 100%,rgba(255,255,255,.2),transparent 70%);filter:blur(6px);animation:igs-pl-rise 5.4s ease-out infinite;}
${O} .igs-dfx-amb.is-plkitchen .igs-pl-kit-steam.is-b{left:auto;right:16%;bottom:calc(var(--igs-fx-safe) + var(--igs-fx-vis) * .22);animation-delay:2.4s;}
@keyframes igs-pl-rise{0%{transform:translate3d(0,8%,0);opacity:0}25%{opacity:.9}100%{transform:translate3d(6%,-30%,0);opacity:0}}
${O} .igs-dfx-amb.is-plmansion .igs-pl-man-dark{inset:0;background:radial-gradient(ellipse at 50% 46%,transparent 40%,rgba(30,8,14,.5));}
${O} .igs-dfx-amb.is-plmansion .igs-pl-man-shaft{top:-6%;left:10%;width:22%;height:96%;background:linear-gradient(180deg,rgba(190,206,255,.2),transparent 80%);transform:skewX(-14deg);}
${O} .igs-dfx-amb.is-plmansion .igs-pl-man-candle{left:6%;bottom:calc(var(--igs-fx-safe) + var(--igs-fx-vis) * .3);width:14%;height:26%;background:radial-gradient(ellipse at 50% 60%,rgba(255,176,84,.3),transparent 70%);animation:igs-pl-candle 3.2s ease-in-out infinite;}
${O} .igs-dfx-amb.is-plmansion .igs-pl-man-candle.is-b{left:auto;right:6%;animation-delay:1.1s;}
@keyframes igs-pl-candle{0%,100%{opacity:.8}30%{opacity:1}60%{opacity:.65}}
${O} .igs-dfx-amb.is-plneonrain .igs-pl-neo-pink{left:-10%;bottom:-8%;width:56%;height:62%;background:radial-gradient(ellipse at 40% 70%,rgba(255,60,170,.3),transparent 68%);}
${O} .igs-dfx-amb.is-plneonrain .igs-pl-neo-cyan{right:-10%;bottom:-8%;width:56%;height:62%;background:radial-gradient(ellipse at 60% 70%,rgba(40,220,255,.28),transparent 68%);animation:igs-pl-neon 5s ease-in-out infinite;}
@keyframes igs-pl-neon{0%,100%{opacity:1}50%{opacity:.7}}
${O} .igs-dfx-amb.is-plneonrain .igs-pl-neo-rain{inset:-120px -46px 0 0;will-change:transform;background:repeating-linear-gradient(104deg,transparent 0 22px,rgba(200,220,255,.1) 22px 23px);background-size:46px 100%;animation:igs-pl-rain 1.6s linear infinite;}
@keyframes igs-pl-rain{to{transform:translate3d(-46px,120px,0)}}
${O} .igs-dfx-amb.is-plshrine .igs-pl-shr-glow{inset:0;background:linear-gradient(180deg,rgba(255,120,40,.18),transparent 42%);}
${O} .igs-dfx-amb.is-plshrine .igs-pl-shr-lanterns{left:0;right:0;top:0;height:22%;}
${O} .igs-dfx-amb.is-plshrine .igs-pl-shr-lanterns b{position:absolute;top:-10%;width:18%;height:100%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,174,92,.3),transparent);animation:igs-pl-lantern 4.6s ease-in-out infinite;}
${O} .igs-dfx-amb.is-plshrine .igs-pl-shr-lanterns b:nth-child(1){left:12%}
${O} .igs-dfx-amb.is-plshrine .igs-pl-shr-lanterns b:nth-child(2){left:36%;animation-delay:-1.2s}
${O} .igs-dfx-amb.is-plshrine .igs-pl-shr-lanterns b:nth-child(3){left:62%;animation-delay:-2.4s}
${O} .igs-dfx-amb.is-plshrine .igs-pl-shr-lanterns b:nth-child(4){left:86%;animation-delay:-3.4s}
@keyframes igs-pl-lantern{0%,100%{transform:translateX(-2px);opacity:.9}50%{transform:translateX(2px);opacity:1}}
${O} .igs-dfx-amb.is-plgym .igs-pl-gym-flood{top:-6%;left:8%;right:8%;height:48%;background:linear-gradient(180deg,rgba(255,250,226,.2),transparent);clip-path:polygon(18% 0,82% 0,100% 100%,0 100%);}
${O} .igs-dfx-amb.is-plgym .igs-pl-gym-floor{left:0;right:0;bottom:0;height:24%;background:linear-gradient(180deg,transparent,rgba(210,150,70,.22));}
${O} .igs-dfx-amb.is-pldungeon .igs-pl-dun-dark{inset:0;background:radial-gradient(ellipse at 50% 52%,transparent 30%,rgba(6,6,10,.62));}
${O} .igs-dfx-amb.is-pldungeon .igs-pl-dun-torch{left:4%;top:30%;width:20%;height:34%;background:radial-gradient(ellipse at 50% 50%,rgba(255,150,50,.34),transparent 70%);animation:igs-pl-torch 2.2s ease-in-out infinite;}
${O} .igs-dfx-amb.is-pldungeon .igs-pl-dun-torch.is-b{left:auto;right:4%;animation-delay:-1s;}
@keyframes igs-pl-torch{0%,100%{opacity:.85;transform:scale(1)}35%{opacity:1;transform:scale(1.06)}70%{opacity:.7;transform:scale(.97)}}
${O} .igs-dfx-amb.is-pldungeon .igs-pl-dun-mist{left:0;right:0;bottom:0;height:30%;background:linear-gradient(180deg,transparent,rgba(120,130,150,.16));}
${O} .igs-dfx-amb.is-pldungeon.is-ancient .igs-pl-dun-torch{background:radial-gradient(ellipse at 50% 50%,rgba(90,230,190,.3),transparent 70%);}
${O} .igs-dfx-amb.is-pldungeon.is-magic .igs-pl-dun-torch{background:radial-gradient(ellipse at 50% 50%,rgba(170,110,255,.34),transparent 70%);}
${O} .igs-dfx-amb.is-plmansion.is-magic .igs-pl-man-candle{background:radial-gradient(ellipse at 50% 60%,rgba(150,170,255,.3),transparent 70%);}
${O} .igs-dfx-amb.is-reduced [class*="igs-pl-"],${O}[data-igs-quality="low"] .igs-dfx-amb [class*="igs-pl-"],${O}[data-igs-quality="low"] .igs-dfx-amb [class*="igs-pl-"] b{animation:none!important;}
${O}[data-igs-quality="low"] .igs-dfx-amb.is-plkitchen .igs-pl-kit-steam,${O}[data-igs-quality="low"] .igs-dfx-amb.is-plpolice .igs-pl-pol-beacon.is-b{display:none;}
${O} .igs-dfx-amb.is-reduced.is-plpolice .igs-pl-pol-beacon,${O}[data-igs-quality="low"] .igs-dfx-amb.is-plpolice .igs-pl-pol-beacon.is-r{opacity:.7;}
`;

const CARD_CSS = `
${O} .igs-pl{position:absolute;inset:0;pointer-events:none;--pl-serif:"Noto Serif SC","Source Han Serif SC","Songti SC","STSong",serif;--pl-gold:#f1d9a0;--pl-line:rgba(241,217,160,.42);--pl-glass:linear-gradient(180deg,rgba(12,14,20,.82),rgba(12,14,20,.7));}
${O} .igs-pl.is-ancient{--pl-gold:#e8c987;--pl-line:rgba(232,201,135,.46);}
${O} .igs-pl-strip{display:flex;flex-direction:column;transform:translateY(calc((var(--n) - 1) * -1.2em));animation:igs-pl-roll calc(${L} * .3) steps(1,end) calc(${L} * .1) both;}
${O} .igs-pl-strip>span{display:block;height:1.2em;line-height:1.2em;text-align:center;}
@keyframes igs-pl-roll{from{transform:translateY(0)}to{transform:translateY(calc((var(--n) - 1) * -1.2em))}}
${O} .igs-pl-elev-lamp{position:absolute;top:7%;right:max(16px,6%);display:flex;align-items:center;gap:12px;padding:8px 18px;background:var(--pl-glass);border:1px solid rgba(255,255,255,.2);border-radius:3px;animation:igs-pl-lampfx ${L} ease both;}
${O} .igs-pl-elev-window{display:block;height:1.2em;overflow:hidden;min-width:2.4em;font:300 clamp(24px,5vmin,38px)/1.2 system-ui,"Helvetica Neue","Segoe UI",sans-serif;font-size:clamp(24px,5vmin,38px);letter-spacing:.1em;font-variant-numeric:tabular-nums;color:#ffd9a8;text-shadow:0 0 14px rgba(255,170,90,.55);}
${O} .igs-pl-elev-arrow{width:9px;height:9px;border-left:1.5px solid #ffd9a8;border-top:1.5px solid #ffd9a8;transform:translateY(2px) rotate(45deg);animation:igs-pl-arrow 1s ease-in-out infinite;}
${O} .igs-pl-elev-arrow.is-down{transform:translateY(-2px) rotate(225deg);}
@keyframes igs-pl-arrow{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes igs-pl-lampfx{0%{opacity:0;transform:translateY(-14px)}8%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
${O} .igs-pl-door{position:absolute;top:0;bottom:0;width:50%;background:#000;}
${O} .igs-pl-door.is-l{left:0;animation:igs-pl-door-l ${L} cubic-bezier(.55,.05,.3,1) both;}
${O} .igs-pl-door.is-r{right:0;animation:igs-pl-door-r ${L} cubic-bezier(.55,.05,.3,1) both;}
@keyframes igs-pl-door-l{0%{opacity:0;transform:none}8%{opacity:1}44%{transform:none}66%,100%{transform:translateX(-102%);opacity:1}}
@keyframes igs-pl-door-r{0%{opacity:0;transform:none}8%{opacity:1}44%{transform:none}66%,100%{transform:translateX(102%);opacity:1}}
${O} .igs-pl-elevator.is-reduced .igs-pl-door{display:none;}
${O} .igs-pl-elevator.is-ancient .igs-pl-elev-window{color:#e8c987;text-shadow:0 0 12px rgba(200,150,60,.5);}
${O} .igs-pl-crack{position:absolute;top:0;bottom:0;width:50%;}
${O} .igs-pl-crack.is-l{left:0;background:linear-gradient(90deg,#000 calc(100% - 8px),transparent);transform:translateX(-5.5%);animation:igs-pl-crack-l ${L} cubic-bezier(.3,.7,.3,1) both;}
${O} .igs-pl-crack.is-r{right:0;background:linear-gradient(270deg,#000 calc(100% - 8px),transparent);transform:translateX(5.5%);animation:igs-pl-crack-r ${L} cubic-bezier(.3,.7,.3,1) both;}
@keyframes igs-pl-crack-l{0%{opacity:0;transform:translateX(0)}10%{opacity:.94;transform:translateX(0)}28%{transform:translateX(-5.5%)}84%{transform:translateX(-5.5%);opacity:.94}100%{transform:translateX(0);opacity:0}}
@keyframes igs-pl-crack-r{0%{opacity:0;transform:translateX(0)}10%{opacity:.94;transform:translateX(0)}28%{transform:translateX(5.5%)}84%{transform:translateX(5.5%);opacity:.94}100%{transform:translateX(0);opacity:0}}
${O} .igs-pl-heard{position:absolute;left:50%;bottom:calc(var(--igs-fx-safe) + var(--igs-fx-vis) * .34);transform:translateX(-50%);max-width:70%;padding:5px 18px;color:#f0e6d4;font-family:var(--pl-serif);letter-spacing:.16em;text-align:center;background:linear-gradient(90deg,transparent,rgba(10,8,7,.82) 20%,rgba(10,8,7,.82) 80%,transparent);filter:blur(.5px);animation:igs-pl-heard ${L} ease both;}
@keyframes igs-pl-heard{0%,20%{opacity:0}34%{opacity:.82}70%{opacity:.82}88%,100%{opacity:0}}
@keyframes igs-pl-fadeio{0%{opacity:0}12%{opacity:1}84%{opacity:1}100%{opacity:0}}
${O} .igs-pl-spot{position:absolute;top:-4%;width:30%;height:78%;transform-origin:50% 0;mix-blend-mode:screen;clip-path:polygon(46% 0,54% 0,100% 100%,0 100%);animation:igs-pl-spot-in ${L} ease both,igs-pl-sway 5.2s ease-in-out infinite alternate;}
${O} .igs-pl-spot.is-a{left:8%;background:linear-gradient(180deg,rgba(255,214,168,.36),rgba(255,214,168,0) 90%);}
${O} .igs-pl-spot.is-b{left:35%;background:linear-gradient(180deg,rgba(255,255,255,.36),rgba(255,255,255,0) 90%);animation-delay:0s,-1.7s;}
${O} .igs-pl-spot.is-c{left:62%;background:linear-gradient(180deg,rgba(170,205,255,.32),rgba(170,205,255,0) 90%);animation-delay:0s,-3.1s;}
@keyframes igs-pl-spot-in{0%{opacity:0}14%{opacity:1}84%{opacity:1}100%{opacity:0}}
@keyframes igs-pl-sway{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}
${O} .igs-pl-crowd{position:absolute;left:0;right:0;bottom:var(--igs-fx-safe);height:calc(var(--igs-fx-vis) * .12);background:linear-gradient(180deg,transparent,rgba(5,5,10,.5));animation:igs-pl-crowd ${L} ease both;}
@keyframes igs-pl-crowd{0%{opacity:0;transform:translateY(30%)}12%{opacity:1;transform:none}86%{opacity:1}100%{opacity:0}}
${O} .igs-pl-stick{position:absolute;left:var(--x);top:38%;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:var(--c);box-shadow:0 0 10px 3px var(--c);animation:igs-pl-wag 1.6s ease-in-out var(--d) infinite alternate;}
@keyframes igs-pl-wag{from{opacity:.35;transform:translateY(2px)}to{opacity:.95;transform:translateY(-2px)}}
${O} .igs-pl-song{position:absolute;top:7%;left:max(16px,5%);padding:0 0 6px;color:var(--pl-gold);font-family:var(--pl-serif);letter-spacing:.2em;border-bottom:1px solid var(--pl-line);animation:igs-pl-lampfx ${L} ease both;}
${O} .igs-pl-flashwash{position:absolute;inset:0;background:#fff;opacity:0;animation:igs-pl-wash 340ms linear infinite;}
@keyframes igs-pl-wash{0%{opacity:.1}60%,100%{opacity:0}}
${O} .igs-pl-flash{position:absolute;width:74px;height:74px;margin:-37px 0 0 -37px;background:radial-gradient(circle,#fff 0 8%,rgba(255,255,255,.6) 14%,transparent 52%),linear-gradient(90deg,transparent,rgba(255,255,255,.8),transparent) 50% 50%/100% 1px no-repeat,linear-gradient(180deg,transparent,rgba(255,255,255,.8),transparent) 50% 50%/1px 100% no-repeat;animation:igs-pl-flash 260ms ease-out both;}
@keyframes igs-pl-flash{0%{opacity:0;transform:scale(.4)}20%{opacity:1;transform:scale(1.05)}100%{opacity:0;transform:scale(1.2)}}
${O} .igs-pl-flashes.is-reduced .igs-pl-flashwash{display:none;}
${O} .igs-pl-flashes.is-reduced .igs-pl-flash{opacity:.9;}
${O} .igs-pl-race-text{position:absolute;left:max(16px,5%);top:22%;display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding:10px 34px 10px 4px;background:linear-gradient(90deg,rgba(12,14,20,.78),rgba(12,14,20,.5) 70%,rgba(12,14,20,0));border-top:1px solid var(--pl-line);border-bottom:1px solid var(--pl-line);color:#fff;white-space:nowrap;animation:igs-pl-band ${L} cubic-bezier(.2,.8,.3,1) both;}
@keyframes igs-pl-band{0%{opacity:0;transform:translateX(-16px)}12%{opacity:1;transform:none}86%{opacity:1}100%{opacity:0}}
${O} .igs-pl-race-text b{font-size:clamp(28px,6vmin,46px);font-weight:200;letter-spacing:.36em;color:var(--pl-gold);}
${O} .igs-pl-race-who{font-size:.95em;letter-spacing:.14em;opacity:.92;}
${O} .igs-pl-race-time{color:var(--pl-gold);font-variant-numeric:tabular-nums;letter-spacing:.08em;}
${O} .igs-pl-lamps{position:absolute;left:max(16px,5%);top:12%;display:flex;gap:14px;padding:0;}
${O} .igs-pl-lamps i{width:14px;height:14px;border-radius:50%;background:#7fe3a0;box-shadow:0 0 12px 2px rgba(127,227,160,.6);}
${O} .igs-pl-race.is-start:not(.is-reduced) .igs-pl-lamps i{background:#ff7a6e;box-shadow:0 0 12px 2px rgba(255,122,110,.6);animation:igs-pl-lamp calc(${L} * .6) steps(1,end) both;}
${O} .igs-pl-race.is-start .igs-pl-lamps i:nth-child(2){animation-delay:calc(${L} * .12)}
${O} .igs-pl-race.is-start .igs-pl-lamps i:nth-child(3){animation-delay:calc(${L} * .24)}
@keyframes igs-pl-lamp{0%{background:#3a1a1a;box-shadow:none}30%,99%{background:#ff7a6e;box-shadow:0 0 12px 2px rgba(255,122,110,.6)}100%{background:#7fe3a0;box-shadow:0 0 12px 2px rgba(127,227,160,.6)}}
${O} .igs-pl-race.is-start .igs-pl-ready{display:none;font-size:1.1em;letter-spacing:.3em;}
${O} .igs-pl-race.is-start:not(.is-reduced) .igs-pl-ready{display:block;position:absolute;top:10px;animation:igs-pl-ready ${L} steps(1,end) both;}
@keyframes igs-pl-ready{0%{opacity:1}50%,100%{opacity:0}}
${O} .igs-pl-race.is-start:not(.is-reduced) .igs-pl-go{animation:igs-pl-go ${L} ease-out both;}
@keyframes igs-pl-go{0%,48%{opacity:0;transform:translateX(-10px)}60%,100%{opacity:1;transform:none}}
${O} .igs-pl-tape{position:absolute;left:0;right:0;top:calc(var(--igs-fx-vis) * .16);height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.7) 12%,rgba(255,255,255,.7) 88%,transparent);animation:igs-pl-fadeio ${L} ease both;}
${O} .igs-pl-tape i{position:absolute;top:0;height:1px;width:50%;background:var(--pl-gold);}
${O} .igs-pl-tape i.is-l{left:0;animation:igs-pl-rib-l ${L} ease-out both;}
${O} .igs-pl-tape i.is-r{right:0;animation:igs-pl-rib-r ${L} ease-out both;}
@keyframes igs-pl-rib-l{0%,26%{transform:none;opacity:1}46%,100%{transform:translateX(-30%);opacity:0}}
@keyframes igs-pl-rib-r{0%,26%{transform:none;opacity:1}46%,100%{transform:translateX(30%);opacity:0}}
${O} .igs-pl-race.is-finish .igs-pl-race-text{top:calc(var(--igs-fx-vis) * .22);}
${O} .igs-pl-board{position:absolute;left:max(16px,5%);top:20%;display:flex;align-items:center;gap:18px;padding:10px 28px 10px 4px;background:linear-gradient(90deg,rgba(12,14,20,.78),rgba(12,14,20,.5) 70%,rgba(12,14,20,0));border-top:1px solid var(--pl-line);border-bottom:1px solid var(--pl-line);animation:igs-pl-band ${L} cubic-bezier(.2,.8,.3,1) both;}
${O} .igs-pl-side{display:flex;flex-direction:column;align-items:center;min-width:3em;}
${O} .igs-pl-side em{font-style:normal;color:#e6e9ef;font-size:.9em;letter-spacing:.14em;}
${O} .igs-pl-side b{font:300 clamp(34px,8vmin,60px)/1.1 system-ui,"Segoe UI",sans-serif;color:var(--pl-gold);font-variant-numeric:tabular-nums;animation:igs-pl-digit ${L} ease-out both;}
${O} .igs-pl-side.is-b b{animation-delay:120ms;}
@keyframes igs-pl-digit{0%,14%{opacity:0;transform:translateY(-30%)}28%,100%{opacity:1;transform:none}}
${O} .igs-pl-colon{color:var(--pl-line);font:200 clamp(30px,7vmin,50px)/1 system-ui,sans-serif;}
${O} .igs-pl-chestbox{--c1:#e8dcc0;--c2:rgba(232,220,192,.5);position:absolute;right:max(16px,6%);top:calc(var(--igs-fx-vis) * .30);width:min(34%,260px);animation:igs-pl-chest ${L} ease both;}
${O} .igs-pl-chestbox.is-rare{--c1:#a8d0ff;--c2:rgba(168,208,255,.5);}
${O} .igs-pl-chestbox.is-epic{--c1:#cdb0ff;--c2:rgba(205,176,255,.5);}
${O} .igs-pl-chestbox.is-legend{--c1:#f6dc9a;--c2:rgba(246,220,154,.55);}
@keyframes igs-pl-chest{0%{opacity:0;transform:translateY(16px)}14%{opacity:1;transform:none}88%{opacity:1}100%{opacity:0}}
${O} .igs-pl-beam{position:absolute;right:-8%;bottom:-30px;width:150%;height:calc(var(--igs-fx-vis) * .5);background:radial-gradient(ellipse 50% 60% at 50% 100%,var(--c2),transparent 72%);opacity:1;transform-origin:50% 100%;animation:igs-pl-beam ${L} ease both;}
@keyframes igs-pl-beam{0%,10%{opacity:0;transform:scaleY(.3)}34%{opacity:.8;transform:none}100%{opacity:.7;transform:none}}
${O} .igs-pl-ch-lid,${O} .igs-pl-ch-body{display:none;}
${O} .igs-pl-ch-item{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:12px 28px 12px 4px;background:linear-gradient(90deg,rgba(12,14,20,.78),rgba(12,14,20,.5) 70%,rgba(12,14,20,0));border-top:1px solid var(--c2);border-bottom:1px solid var(--c2);white-space:nowrap;animation:igs-pl-item ${L} ease-out both;}
${O} .igs-pl-ch-item small{color:var(--c1);letter-spacing:.34em;font-size:.82em;opacity:.9;}
${O} .igs-pl-ch-item span{color:#fff;font-family:var(--pl-serif);font-size:1.4em;letter-spacing:.12em;}
@keyframes igs-pl-item{0%,24%{opacity:0;transform:translateY(10px)}44%,100%{opacity:1;transform:none}}
${O} .igs-pl-lv{position:absolute;left:max(16px,5%);top:26%;display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:min(32%,260px);padding:12px 34px 12px 4px;background:linear-gradient(90deg,rgba(12,14,20,.78),rgba(12,14,20,.5) 70%,rgba(12,14,20,0));border-top:1px solid var(--pl-line);border-bottom:1px solid var(--pl-line);animation:igs-pl-lv ${L} cubic-bezier(.2,.9,.3,1) both;}
@keyframes igs-pl-lv{0%{opacity:0;transform:translateY(12px)}12%{opacity:1;transform:none}86%{opacity:1}100%{opacity:0}}
${O} .igs-pl-lv-title{color:var(--pl-gold);letter-spacing:.4em;font-weight:300;font-size:clamp(16px,3.4vmin,24px);}
${O} .igs-pl-lv-num{display:flex;align-items:baseline;gap:6px;color:#fff;}
${O} .igs-pl-lv-num small{font-size:1em;opacity:.8;letter-spacing:.1em;}
${O} .igs-pl-lv-win{display:block;height:1.2em;overflow:hidden;font:300 clamp(30px,7vmin,52px)/1.2 system-ui,"Segoe UI",sans-serif;font-size:clamp(30px,7vmin,52px);color:#fff;font-variant-numeric:tabular-nums;}
${O} .igs-pl-strip.is-lv{animation-delay:calc(${L} * .22);animation-duration:calc(${L} * .12);}
${O} .igs-pl-lv-reward{color:#e6e9ef;font-size:.95em;letter-spacing:.1em;animation:igs-pl-item2 ${L} ease both;}
@keyframes igs-pl-item2{0%,34%{opacity:0}48%,100%{opacity:1}}
${O} .igs-pl-spark{position:absolute;left:var(--x);bottom:-4px;width:3px;height:3px;border-radius:50%;background:var(--pl-gold);box-shadow:0 0 6px 1px rgba(241,217,160,.7);animation:igs-pl-spark 1800ms ease-out var(--d) both;}
@keyframes igs-pl-spark{0%{opacity:0;transform:translateY(0)}25%{opacity:1}100%{opacity:0;transform:translateY(-90px)}}
${O} .igs-pl.is-ancient .igs-pl-lv-title{color:#e8c987;}
${O} .igs-pl-q{position:absolute;left:max(16px,5%);top:clamp(48px,15%,96px);width:min(320px,90%);max-width:calc(100% - 32px);animation:igs-pl-qin ${L} cubic-bezier(.2,.9,.3,1) both;--q:#a9cdf6;}
${O} .igs-pl-q.is-scroll{--q:#e8c987;}
@keyframes igs-pl-qin{0%{opacity:0;transform:translateY(12px)}12%{opacity:1;transform:none}86%{opacity:1}100%{opacity:0}}
${O} .igs-pl-q-paper{position:relative;overflow:hidden;box-sizing:border-box;padding:14px 18px 46px;background:var(--pl-glass);color:#f2f4f8;border:1px solid rgba(255,255,255,.2);border-radius:3px;clip-path:inset(0 0 0 0);animation:igs-pl-unroll ${L} cubic-bezier(.3,.8,.3,1) both;}
@keyframes igs-pl-unroll{0%{clip-path:inset(0 0 100% 0)}18%,86%{clip-path:inset(0 0 0 0)}100%{clip-path:inset(0 0 100% 0)}}
${O} .igs-pl-q-head{color:var(--q);font-size:.82em;letter-spacing:.34em;padding-bottom:6px;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,.18);}
${O} .igs-pl-q-title{font-family:var(--pl-serif);font-size:1.15em;line-height:1.5;overflow-wrap:anywhere;padding-right:24px;min-height:2.6em;letter-spacing:.06em;}
${O} .igs-pl-q-reward{display:flex;gap:8px;align-items:baseline;overflow-wrap:anywhere;margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,.14);font-size:.9em;}
${O} .igs-pl-q-reward small{flex:none;opacity:.7;letter-spacing:.2em}
${O} .igs-pl.is-ancient .igs-pl-q-paper{font-family:var(--pl-serif);}
${O} .igs-pl.is-ancient .igs-pl-q-head{letter-spacing:.5em;}
${O} .igs-pl-stamp{position:absolute;right:12px;bottom:12px;padding:1px 9px;border:1px solid currentColor;border-radius:2px;font-size:.82em;letter-spacing:.2em;animation:igs-pl-stamp ${L} ease-out both;}
${O} .igs-pl-stamp.is-take{color:#a9cdf6}
${O} .igs-pl-stamp.is-done{color:#9fe2b8;animation-name:igs-pl-stamp-done}
${O} .igs-pl-stamp.is-fail{color:#ffa9a0;animation-name:igs-pl-stamp-fail}
@keyframes igs-pl-stamp{0%,34%{opacity:0}46%,100%{opacity:.95}}
@keyframes igs-pl-stamp-done{0%,52%{opacity:0}62%,100%{opacity:.95}}
@keyframes igs-pl-stamp-fail{0%,52%{opacity:0}62%,100%{opacity:.95}}
${O} .igs-pl-q-check,${O} .igs-pl-q-cross{position:absolute;right:14px;top:10px;width:26px;height:26px;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;}
${O} .igs-pl-q-check{stroke:#9fe2b8}
${O} .igs-pl-q-cross{stroke:#ffa9a0}
${O} .igs-pl-q-check path,${O} .igs-pl-q-cross path{stroke-dasharray:1;stroke-dashoffset:0;animation:igs-pl-qdraw calc(${L} * .35) ease-out calc(${L} * .22) both;}
${O} .igs-pl-q-cross path+path{animation-delay:calc(${L} * .3)}
@keyframes igs-pl-qdraw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
${O} .igs-pl-q.is-done .igs-pl-q-paper{border-color:rgba(241,217,160,.5);}
${O} .igs-pl-q.is-done .igs-pl-q-reward span{color:var(--pl-gold);}
${O} .igs-pl-q.is-fail .igs-pl-q-paper{color:#b8bcc6;}
${O} .igs-pl-q.is-fail .igs-pl-q-title{text-decoration:line-through;text-decoration-color:rgba(255,169,160,.8);text-decoration-thickness:1px;}
${O} .igs-pl-q.is-fail .igs-pl-q-reward span{text-decoration:line-through;}
${O} .igs-pl-q.is-fail{animation-name:igs-pl-qin-fail;}
@keyframes igs-pl-qin-fail{0%{opacity:0;transform:translateY(12px)}12%{opacity:1;transform:none}48%{transform:none}52%{transform:translateX(-3px)}56%{transform:translateX(3px)}60%{transform:translateX(-2px)}64%{transform:none}86%{opacity:1}100%{opacity:0}}
${O} .igs-pl-map{position:absolute;left:max(16px,5%);top:18%;width:min(36%,400px);aspect-ratio:300/180;background:var(--pl-glass);border:1px solid rgba(255,255,255,.2);border-radius:3px;animation:igs-pl-qin ${L} cubic-bezier(.2,.9,.3,1) both;}
${O} .igs-pl-map.is-modern{background:repeating-linear-gradient(0deg,transparent 0 23px,rgba(255,255,255,.07) 23px 24px),repeating-linear-gradient(90deg,transparent 0 23px,rgba(255,255,255,.07) 23px 24px),var(--pl-glass);}
${O} .igs-pl-map svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}
${O} .igs-pl-path{fill:none;stroke:var(--pl-gold);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:0;animation:igs-pl-draw calc(${L} * .6) ease-in-out calc(${L} * .1) both;}
@keyframes igs-pl-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
${O} .igs-pl-pin{fill:rgba(12,14,20,.9);stroke:var(--pl-gold);stroke-width:1.5;animation:igs-pl-pop .4s ease-out both;}
${O} .igs-pl-pin.is-end{fill:var(--pl-gold);}
@keyframes igs-pl-pop{from{opacity:0}to{opacity:1}}
${O} .igs-pl-stop{position:absolute;transform:translate(-50%,10px);padding:0 4px;color:#f4f2ea;font-size:.82em;letter-spacing:.08em;white-space:nowrap;text-shadow:0 1px 6px rgba(0,0,0,.8);animation:igs-pl-item2 ${L} ease both;}
${O} .igs-pl-stop.is-up{transform:translate(-50%,calc(-100% - 12px));}
${O} .igs-pl-streak{position:absolute;left:-10%;height:1px;background:linear-gradient(90deg,transparent,#e8f1ff 40%,transparent);opacity:0;animation:igs-pl-streak 1500ms ease-in infinite;}
@keyframes igs-pl-streak{0%{opacity:0;transform:translateX(0)}25%{opacity:.7}100%{opacity:0;transform:translateX(140vw)}}
${O} .igs-pl-gust.is-reduced .igs-pl-streak{opacity:.5;}
${O} .igs-pl.is-reduced *,${O} .igs-pl.is-reduced{animation:none!important;}
${O} .igs-pl-quest.is-reduced .igs-pl-q-paper{clip-path:none;}
${O} .igs-pl-quest.is-reduced .igs-pl-stamp{opacity:.95;}
${O} .igs-pl.is-reduced .igs-pl-spot,${O} .igs-pl.is-reduced .igs-pl-crowd,${O} .igs-pl.is-reduced .igs-pl-stick{opacity:1;}
${O} .igs-pl.is-reduced .igs-pl-flash{opacity:.9;}
${O} .igs-pl-race.is-start.is-reduced .igs-pl-go{opacity:1;}
${O}[data-igs-quality="low"] .igs-pl-spot,${O}[data-igs-quality="low"] .igs-pl-stick{animation:none!important;}
${O}[data-igs-quality="low"] .igs-pl-q-paper{animation:none;clip-path:none;}
${O}[data-igs-quality="low"] .igs-pl-spot{mix-blend-mode:normal;opacity:.7;}
@media (max-aspect-ratio:1/1){
${O} .igs-pl-elev-lamp{right:auto;left:50%;transform:translateX(-50%);animation-name:igs-pl-lampfx-c;}
${O} .igs-pl-song,${O} .igs-pl-race-text,${O} .igs-pl-board,${O} .igs-pl-lamps,${O} .igs-pl-lv,${O} .igs-pl-q,${O} .igs-pl-map,${O} .igs-pl-chestbox{left:50%;right:auto;transform:translateX(-50%);}
${O} .igs-pl-song,${O} .igs-pl-race-text,${O} .igs-pl-board,${O} .igs-pl-lv,${O} .igs-pl-q,${O} .igs-pl-map,${O} .igs-pl-chestbox{top:4%;}
${O} .igs-pl-q,${O} .igs-pl-map{width:min(88%,420px);}
${O} .igs-pl-chestbox{width:min(70%,260px);}
${O} .igs-pl-race-text,${O} .igs-pl-board,${O} .igs-pl-lv{animation-name:igs-pl-fadeio;}
${O} .igs-pl-q,${O} .igs-pl-map,${O} .igs-pl-chestbox{animation-name:igs-pl-fadeio;}
${O} .igs-pl-race.is-finish .igs-pl-race-text{top:4%;}
${O} .igs-pl-lamps{top:3%;}
${O} .igs-pl-ch-item,${O} .igs-pl-song{animation-name:igs-pl-fadeio;}
}
@keyframes igs-pl-lampfx-c{0%{opacity:0}8%{opacity:1}80%{opacity:1}100%{opacity:0}}
`;

export const PLACES_STYLE_TEXT = `
#igs-overlay .igs-pl.is-ancient .igs-pl-map.is-ancient-map{background:#eee3c9 url("${ANCIENT_PAPER_TEXTURE}") 60% 50% / 220% 220%;border:1px solid #b09b72;border-radius:1px;color:#59482c;}
#igs-overlay .igs-pl.is-ancient .igs-pl-map.is-ancient-map .igs-pl-stop{color:#49391f;text-shadow:0 1px 1px #fff8;}
#igs-overlay .igs-pl.is-ancient .igs-pl-map.is-ancient-map .igs-pl-path{stroke:#80623e;}
#igs-overlay .igs-pl.is-ancient .igs-pl-map.is-ancient-map .igs-pl-pin{fill:#aa4c39;stroke:#eee3c9;}${AMBIENCE_CSS}${CARD_CSS}`;
