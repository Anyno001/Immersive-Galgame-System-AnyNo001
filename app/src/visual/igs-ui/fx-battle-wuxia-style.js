import { WX_HSTROKE, WX_HURT_MASK, WX_RING, WX_RUBBING, WX_SEAL_MASK, WX_SEAL_MASK_SMALL, WX_SLASH, WX_SPLAT, WX_TAG_H, WX_TAG_V, maskOf, wxEdge } from './wuxia-ink-svg.js';

// 水墨武侠战斗样式：坐标、字号、延时一律取 plan/wuxia-ink-ui/v6 定稿（桌面 960×540，手机 390×844）。
// 遭遇 / 出招 / 结算根节点设为尺寸容器，以居中的定稿画布为基准按 --wu 等比换算；名牌与中招不在容器内，按定稿 px。
const JIAO = '#1c1b19';
const PAPER = '243,240,232';
const ZHU = '#a8382a';
const BRUSH = '"IGS-MaShanZheng","LXGW WenKai",serif';
const CURSIVE = '"IGS-ZhiMangXing","IGS-MaShanZheng",serif';
const SONG = '"LXGW Neo ZhiSong","Source Han Serif CN",serif';
const RGLOW = '0 0 2px rgba(250,250,250,.95),0 0 10px rgba(250,250,250,.8),0 0 26px rgba(250,250,250,.45)';
const W = '.is-ancient.is-wuxia';
const E = `.igs-fx-battle-encounter${W}`;
const H = `.igs-fx-battle-hit${W}`;
const R = `.igs-fx-battle-result${W}`;
const ALL = `:is(${E},${H},${R})`;
const u = (v) => `calc(${v} * var(--wu))`;
const x = (v) => `calc(50% + (${v} - var(--wcx)) * var(--wu))`;
const y = (v) => `calc(50% + (${v} - var(--wcy)) * var(--wu))`;
const at = (l, t) => `left:${x(l)};top:${y(t)};`;
const atR = (r, t) => `right:${x(r)};top:${y(t)};`;
const box = (l, t, w, h) => `${at(l, t)}width:${u(w)};height:${u(h)};`;
const ink = (image) => `background:${JIAO};${maskOf(image)}`;
// 节奏 --wxs（默认 1.6，与 fx-battle-wuxia.js 的 WUXIA_PACE 一致）：时长与延时一起放慢。
const anim = (name, dur, delay, ease = 'ease-out') => `animation:igs-wx-${name} calc(${dur}s * var(--wxs,1.6)) ${ease} calc(${delay}s * var(--wxs,1.6)) both;`;

const FRAME = [
    `${ALL}{container-type:size;--wcx:480;--wcy:270;--wu:min(calc(100cqw / 960),calc(100cqh / 540));color:${JIAO};animation:igs-wx-life var(--igs-battle-life,1.3s) linear both;}`,
    `@media (max-width:640px){${ALL}{--wcx:195;--wcy:422;--wu:min(calc(100cqw / 390),calc(100cqh / 844));}}`,
    `${ALL} .wx{position:absolute;display:block;opacity:0;pointer-events:none;box-sizing:border-box;white-space:nowrap;}`,
    `${ALL} .wx-inkv{inset:0;background:radial-gradient(ellipse closest-side at 50% 46%,rgba(28,27,25,0) 62%,rgba(28,27,25,.42) 86%,rgba(28,27,25,.72) 100%);${anim('fade-in', 0.45, 0)}}`,
    `${ALL} :where(.wx-tag){background:rgba(22,21,19,.9);color:rgb(${PAPER});text-shadow:none;padding:${u(5)} ${u(20)} ${u(6)};${maskOf(WX_TAG_H)}}`,
    `${ALL} :where(.wx-tag.v){writing-mode:vertical-rl;padding:${u(16)} ${u(7)} ${u(14)};${maskOf(WX_TAG_V)}}`,
    // 印须压过同特异度、排在前面的 .wx{display:block} 才能字居中，所以不包 :where；各处印位规则只改尺寸字号，排在其后照样生效。
    `${ALL} .wx-seal{display:grid;place-items:center;background:${ZHU};color:#f5ece0;font-family:${BRUSH};font-weight:400;line-height:1;${maskOf(WX_SEAL_MASK)}}`,
    `${ALL} :where(.wx-seal.v){writing-mode:vertical-rl;letter-spacing:.06em;}`,
    '#igs-overlay[data-igs-dialog-skin="wuxia-ink"] .igs-dialog{transition:opacity .2s ease-out;}',
    `#igs-overlay:has(#igs-stage-motion[data-igs-fx-battle-show="1"] .igs-fx-battle-encounter${W},#igs-stage-motion[data-igs-fx-battle-show="1"] .igs-fx-battle-result${W}) .igs-dialog{opacity:0;}`,
    `.igs-fx-battle-vignette${W}{background:none;}`,
    // 名牌干笔与状态栏同款：离左缘 8px，左内距 28px。
    `.igs-fx-battle-plate${W}{left:18px;top:calc(16px + var(--igs-bt-hud-gap,0px));transform:none;display:flex;align-items:center;gap:12px;max-width:min(340px,72%);padding:10px 18px 10px 28px;border:0;border-radius:0;background:${wxEdge('rgba(236,231,221,.8)')} 8px 8px/6px calc(100% - 16px) no-repeat,${WX_RUBBING} 0 0/1024px 512px,rgba(12,11,10,.8);box-shadow:none;color:#ece7dd;font:400 20px/1.2 ${BRUSH};letter-spacing:.2em;text-shadow:none;animation:igs-wx-fade-in .2s both;}`,
    // 名牌【战】只有 28px：用放粗毛边与斑驳的小印遮罩，颗粒与情绪印一致，不糊成实心方块。
    `.igs-fx-battle-plate${W} .igs-fx-battle-plate-mark{display:grid;place-items:center;width:28px;height:28px;padding:0;border-radius:0;background:${ZHU};color:rgb(${PAPER});font:400 16px/1 ${BRUSH};letter-spacing:0;box-shadow:none;${maskOf(WX_SEAL_MASK_SMALL)}}`,
    `.igs-fx-battle-plate${W} .igs-fx-battle-plate-name{overflow:hidden;text-overflow:ellipsis;}`,
    `.igs-fx-battle-plate${W} .igs-fx-battle-plate-name small{display:block;margin-top:3px;font:400 11px ${SONG};letter-spacing:.3em;color:#a39e95;}`,
    `#igs-stage-motion[data-igs-fx-battle-shake]:has(.igs-fx-battle-hit${W}){animation:none;}`,
    `.igs-fx-battle-wx-hurt{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse closest-side at 50% 48%,rgba(28,27,25,0) 52%,rgba(28,27,25,.5) 80%,rgba(28,27,25,.9) 100%);-webkit-mask:${WX_HURT_MASK} 0 0/100% 100%;mask:${WX_HURT_MASK} 0 0/100% 100%;opacity:0;animation:igs-wx-hurt calc(1.1s * var(--wxs,1.6)) ease-out calc(.1s * var(--wxs,1.6)) both;}`,
    '.igs-fx-battle-wx-hurt[data-igs-fx-static]{animation:none;opacity:.6;}',
];

const ENCOUNTER = [
    // 大笔垫底，墨签、对手名、称号与印压在墨痕之上。
    `${E} .wx-e-stroke{z-index:0;}${E} :is(.wx-e-tag,.wx-e-name,.wx-e-title,.wx-e-seal){z-index:1;}`,
    `${E} .wx-e-tag{${atR(120, 90)}font:400 ${u(22)} ${BRUSH};letter-spacing:.5em;${anim('write-down', 0.5, 0.5)}}`,
    `${E} .wx-e-stroke{${box(-40, 186, 1040, 150)}transform:rotate(-3deg);${ink(WX_HSTROKE)}${anim('sweep-r', 0.38, 0.15, 'cubic-bezier(.25,.7,.2,1)')}}`,
    `${E} .wx-e-name{${at(435, 198)}translate:-50% 0;rotate:-3deg;font:400 ${u(80)}/1 ${BRUSH};letter-spacing:.24em;color:rgb(${PAPER});${anim('name-in', 0.45, 0.42)}}`,
    `${E} .wx-e-title{${at(435, 286)}translate:-50% 0;rotate:-3deg;font:400 ${u(16)} ${SONG};letter-spacing:.5em;color:rgba(${PAPER},.82);${anim('fade-in', 0.4, 0.72)}}`,
    `${E} .wx-e-seal{${box(772, 298, 46, 46)}font-size:${u(26)};--r:rotate(-3deg);${anim('stamp', 0.22, 0.95)}}`,
];

const res = (r) => `${H}[data-igs-battle-result="${r}"]`;
const CK = `${H}:is([data-igs-battle-result="crit"],[data-igs-battle-result="ko"])`;
const HIT = [
    `${H} .wx-h-who{${atR(190, 40)}font:400 ${u(17)} ${BRUSH};letter-spacing:.42em;${anim('fade-in', 0.2, 0.05)}}`,
    `${H} .wx-h-skill{${atR(88, 30)}padding:${u(26)} ${u(14)} ${u(22)};font:400 ${u(58)}/1.05 ${CURSIVE};letter-spacing:.04em;opacity:1;${anim('write-down', 0.3, 0)}}`,
    `${H} .wx-h-skill .wx-ch{display:inline-block;opacity:0;animation:igs-wx-char-in calc(.26s * var(--wxs,1.6)) ease-out calc((.1s + var(--i,0) * 70ms) * var(--wxs,1.6)) both;}`,
    `${H} .wx-s1{${box(120, 196, 520, 58)}transform:rotate(-26deg);${ink(WX_SLASH)}}`,
    `${H} .wx-s2{${box(300, 170, 300, 36)}transform:rotate(9deg) scaleX(-1);${ink(WX_SLASH)}}`,
    `${H} .wx-sp{${box(262, 84, 260, 260)}${ink(WX_SPLAT)}}`,
    `${H} .wx-ghost{${box(150, 184, 480, 50)}transform:rotate(-26deg);${ink(WX_SLASH)}${anim('ghost', 0.5, 0.55)}}`,
    `${H} .wx-g1{${box(250, 200, 210, 34)}transform:rotate(-6deg);${ink(WX_SLASH)}${anim('g-l', 0.22, 0.55, 'ease-in')}}`,
    `${H} .wx-g2{${box(392, 180, 210, 34)}transform:rotate(186deg);${ink(WX_SLASH)}${anim('g-r', 0.22, 0.55, 'ease-in')}}`,
    `${H} .wx-gsp{${box(336, 110, 160, 160)}${ink(WX_SPLAT)}${anim('splat-in', 0.3, 0.76)}}`,
    `${H} .wx-ring{${box(280, 90, 240, 240)}background:${WX_RING} center/100% 100% no-repeat;${anim('ring', 1.3, 0.55)}}`,
    `${H} .wx-ring.r2{animation-delay:calc(.9s * var(--wxs,1.6));}`,
    `${H} .wx-v-ink{${at(700, 150)}font:400 ${u(24)} ${BRUSH};letter-spacing:.3em;}`,
    `${H} .wx-v-seal{${box(703, 250, 34, 34)}font-size:${u(19)};--r:rotate(-4deg);}`,
    `${H} .wx-v-big{${box(697, 250, 46, 46)}font-size:${u(26)};--r:rotate(-4deg);}`,
    `${res('hit')} .wx-s1{${anim('sweep-r', 0.18, 0.55, 'ease-in')}}${res('hit')} .wx-sp{${anim('splat-in', 0.3, 0.66)}}${res('hit')} .wx-v-ink{${anim('fade-in', 0.3, 0.8)}}`,
    `${CK} .wx-s1{${anim('sweep-r', 0.16, 0.55, 'ease-in')}}${CK} .wx-s2{${anim('sweep-r', 0.12, 0.78, 'ease-in')}}${CK} .wx-sp{${anim('splat-in', 0.32, 0.98)}}`,
    `${CK} .wx-v-ink{${anim('fade-in', 0.3, 0.98)}}${res('crit')} .wx-v-seal{${anim('stamp', 0.2, 1.06)}}${res('ko')} .wx-v-big{${anim('stamp', 0.26, 1.12, 'cubic-bezier(.3,.6,.3,1)')}}`,
    `${res('miss')} .wx-v-ink{${anim('fade-in', 0.3, 0.7)}}${res('guard')} .wx-v-ink{${anim('fade-in', 0.3, 0.9)}}${res('heal')} .wx-v-ink{${anim('fade-in', 0.4, 0.9)}}`,
];

const RESULT = [
    `${R} .wx-defs{position:absolute;width:0;height:0;overflow:hidden;}`,
    `${R} .wx-r-char{${at(120, 110)}font:400 ${u(260)}/1 ${BRUSH};color:${JIAO};text-shadow:${RGLOW};filter:url(#igs-wx-inkchar);}`,
    `${R} .wx-r-line{${at(404, 160)}font:400 ${u(19)} ${SONG};letter-spacing:.5em;${anim('fade-in', 0.4, 0.8)}}`,
    `${R} .wx-r-seal{${box(404, 420, 38, 38)}font-size:${u(21)};${anim('stamp', 0.22, 1.05)}}`,
    `${R}[data-igs-battle-result="win"] .wx-r-char{${anim('write-down', 0.55, 0.25, 'cubic-bezier(.3,.6,.3,1)')}}`,
    `${R}[data-igs-battle-result="lose"] .wx-r-char{${anim('lose', 1.6, 0.25)}}`,
    `${R}[data-igs-battle-result="escape"] .wx-r-char{${anim('escape', 1.5, 0.2, 'ease-in')}}${R}[data-igs-battle-result="escape"] .wx-r-line{animation-delay:calc(.6s * var(--wxs,1.6));}`,
];

// 减少动态效果：去掉扫出与洇开，保留静态的笔痕、大字与印章（残影与水晕不留）。
const REDUCED = `${ALL}[data-igs-fx-static] .wx,${ALL}[data-igs-fx-static] .wx-ch{opacity:1;}${ALL}[data-igs-fx-static] :is(.wx-ghost,.wx-ring,.wx-inkv){display:none;}`;
const KEYFRAMES = `
@keyframes igs-wx-life{0%,90%{opacity:1}100%{opacity:0}}
@keyframes igs-wx-fade-in{from{opacity:0}to{opacity:1}}
@keyframes igs-wx-sweep-r{from{opacity:1;clip-path:inset(0 100% 0 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}
@keyframes igs-wx-write-down{from{opacity:1;clip-path:inset(0 0 100% 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}
@keyframes igs-wx-stamp{0%{opacity:0;transform:var(--r,rotate(0)) scale(1.7)}55%{opacity:1;transform:var(--r,rotate(0)) scale(.94)}100%{opacity:1;transform:var(--r,rotate(0)) scale(1)}}
@keyframes igs-wx-splat-in{0%{opacity:0;transform:scale(.35)}40%{opacity:.95}100%{opacity:.9;transform:scale(1)}}
@keyframes igs-wx-char-in{from{opacity:0;transform:translateY(-10px);filter:blur(3px)}to{opacity:1;transform:none;filter:none}}
@keyframes igs-wx-name-in{from{opacity:0;letter-spacing:.42em}to{opacity:1;letter-spacing:.24em}}
@keyframes igs-wx-ghost{0%{opacity:0;clip-path:inset(0 100% 0 0);transform:rotate(-26deg) translateX(-30px)}40%{opacity:.28;clip-path:inset(0 0 0 0)}100%{opacity:0;transform:rotate(-26deg) translateX(40px)}}
@keyframes igs-wx-g-l{from{opacity:0;transform:rotate(-6deg) translateX(-160px)}to{opacity:1;transform:rotate(-6deg)}}
@keyframes igs-wx-g-r{from{opacity:0;transform:rotate(186deg) translateX(-160px)}to{opacity:1;transform:rotate(186deg)}}
@keyframes igs-wx-ring{0%{opacity:0;transform:scale(.25)}25%{opacity:1}100%{opacity:0;transform:scale(1.5)}}
@keyframes igs-wx-hurt{0%{opacity:0;transform:scale(1.18)}30%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.04)}}
@keyframes igs-wx-lose{0%{opacity:0;clip-path:inset(0 0 100% 0)}35%{opacity:1;clip-path:inset(0 0 0 0);color:${JIAO};filter:url(#igs-wx-inkchar)}100%{opacity:.92;color:#5a5752;filter:url(#igs-wx-inkchar) blur(.8px)}}
@keyframes igs-wx-escape{0%{opacity:0;transform:translateX(-20px)}25%{opacity:1;transform:none;text-shadow:${RGLOW}}100%{opacity:0;transform:translateX(120px);text-shadow:${RGLOW},-30px 0 0 rgba(20,19,17,.35),-60px 0 0 rgba(20,19,17,.16)}}
`;

// 手机竖屏：坐标取 v6-手机定稿（390×844）。
const MOBILE = `@media (max-width:640px){${[
    `${E} .wx-e-tag{${atR(30, 110)}font-size:${u(16)};}`,
    `${E} .wx-e-stroke{${box(-30, 494, 460, 130)}}`,
    `${E} .wx-e-name{${at(195, 508)}font-size:${u(50)};letter-spacing:.2em;}`,
    `${E} .wx-e-title{${at(195, 566)}font-size:${u(14)};letter-spacing:.4em;}`,
    `${E} .wx-e-seal{${box(312, 612, 38, 38)}font-size:${u(21)};}`,
    `${H} .wx-h-skill{${atR(22, 118)}padding:${u(20)} ${u(12)} ${u(18)};font-size:${u(44)};}`,
    `${H} .wx-h-who{${atR(104, 122)}font-size:${u(16)};}`,
    `${H} .wx-s1{${box(10, 310, 340, 44)}}`,
    `${H} .wx-s2{${box(110, 292, 200, 28)}}`,
    `${H} .wx-sp{${box(90, 230, 200, 200)}}`,
    `${H} .wx-ghost{${box(30, 300, 320, 40)}}`,
    `${H} .wx-g1{${box(40, 330, 160, 28)}}`,
    `${H} .wx-g2{${box(180, 316, 160, 28)}}`,
    `${H} .wx-gsp{${box(120, 250, 140, 140)}}`,
    `${H} .wx-ring{${box(80, 220, 230, 230)}}`,
    `${H} .wx-v-ink{${at(28, 150)}font-size:${u(16)};}`,
    `${H} .wx-v-seal{${box(26, 236, 30, 30)}font-size:${u(16)};}`,
    `${H} .wx-v-big{${box(22, 236, 38, 38)}font-size:${u(21)};}`,
    `${R} .wx-r-char{${at(195, 120)}translate:-50% 0;font-size:${u(190)};}`,
    `${R} .wx-r-line{${at(195, 322)}translate:-50% 0;writing-mode:horizontal-tb;padding:${u(5)} ${u(20)} ${u(6)};font-size:${u(16)};letter-spacing:.4em;${maskOf(WX_TAG_H)}}`,
    `${R} .wx-r-seal{${box(179, 370, 32, 32)}font-size:${u(18)};}`,
    `.igs-fx-battle-plate${W}{left:12px;top:calc(44px + var(--igs-bt-hud-gap,0px));}`,
].join('')}}`;

export const WUXIA_BATTLE_STYLE_TEXT = [...FRAME, ...ENCOUNTER, ...HIT, ...RESULT, MOBILE, REDUCED, KEYFRAMES].join('\n');



