import { WX_MAD_MASK, WX_RUBBING, WX_SEAL_MASK, WX_SPLAT, WX_TAG_H, WX_TAG_V, WX_TOKEN_LINES, WX_TOKEN_SHAPE, WX_WAVE, maskOf } from './wuxia-ink-svg.js';

// 武侠江湖包样式：坐标、字号、延时一律取 plan/wuxia-ink-ui/v6 定稿（桌面 960×540，手机 390×844）。
// 演出根节点设为尺寸容器，以居中的定稿画布为基准按 --wu 等比换算。整屏演出期间对话框淡出；走火入魔挂舞台层。
const JIAO = '#1c1b19';
const PAPER = '243,240,232';
const MOON = '236,231,221';
const ZHU = '#a8382a';
const BRUSH = '"IGS-MaShanZheng","LXGW WenKai",serif';
// 江湖令的令字与令名用另一款毛笔字（志莽行），与拓片上的马善政区分开。
const CURSIVE = '"IGS-ZhiMangXing","IGS-MaShanZheng","LXGW WenKai",serif';
const SONG = '"LXGW Neo ZhiSong","Source Han Serif CN",serif';
const RGLOW = '0 0 2px rgba(250,250,250,.95),0 0 10px rgba(250,250,250,.8),0 0 26px rgba(250,250,250,.45)';
const S = '#igs-overlay .igs-wx';
const K = (kind) => `${S}-${kind}`;
const u = (v) => `calc(${v} * var(--wu))`;
const x = (v) => `calc(50% + (${v} - var(--wcx)) * var(--wu))`;
const y = (v) => `calc(50% + (${v} - var(--wcy)) * var(--wu))`;
const at = (l, t) => `left:${x(l)};top:${y(t)};`;
const atR = (r, t) => `right:${x(r)};top:${y(t)};`;
const box = (l, t, w, h) => `${at(l, t)}width:${u(w)};height:${u(h)};`;
// 节奏 --wxs（默认 1.6，与 fx-wuxia.js 的 PACE 一致）：时长与延时一起放慢。
const anim = (name, dur, delay, ease = 'ease-out') => `animation:igs-wxp-${name} calc(${dur}s * var(--wxs,1.6)) ${ease} calc(${delay}s * var(--wxs,1.6)) both;`;

const BASE = [
    `${S}{position:absolute;inset:0;pointer-events:none;container-type:size;--wcx:480;--wcy:270;--wu:min(calc(100cqw / 960),calc(100cqh / 540));color:${JIAO};animation:igs-wxp-life var(--igs-dfx-life,3s) linear both;}`,
    `@media (max-width:640px){${S}{--wcx:195;--wcy:422;--wu:min(calc(100cqw / 390),calc(100cqh / 844));}}`,
    '#igs-overlay:has(.igs-wx.is-full) .igs-dialog{opacity:0;transition:opacity .2s ease-out;}',
    `${S} .wx{position:absolute;display:block;box-sizing:border-box;white-space:nowrap;opacity:0;}`,
    `${S} .wx-clash{position:absolute;inset:0;}${S} .wx-clash.is-mirror{transform:scaleX(-1);}`,
    `${S} .wx-inkv{inset:0;background:radial-gradient(ellipse closest-side at 50% 46%,rgba(28,27,25,0) 62%,rgba(28,27,25,.42) 86%,rgba(28,27,25,.72) 100%);${anim('fade-in', 0.45, 0)}}`,
    `${S} :where(.wx-tag){background:rgba(22,21,19,.9);color:rgb(${PAPER});text-shadow:none;padding:${u(5)} ${u(20)} ${u(6)};${maskOf(WX_TAG_H)}}`,
    `${S} :where(.wx-tag.v){writing-mode:vertical-rl;padding:${u(16)} ${u(7)} ${u(14)};${maskOf(WX_TAG_V)}}`,
    // 印须压过 .wx{display:block} 才能字居中，不包 :where；各演出的印位规则特异度相同、排在其后。
    `${S} .wx-seal{position:absolute;display:grid;place-items:center;background:${ZHU};color:#f5ece0;font-family:${BRUSH};font-weight:400;line-height:1.05;text-align:center;${maskOf(WX_SEAL_MASK)}}`,
    `${S} .wx-ch{display:inline-block;font-weight:400;opacity:0;}`,
    // 拓片（v6 .item）：墨底叠石纹，外一线、内收 6px 再一线作碑框，竖排。
    `${S} .wx-item{writing-mode:vertical-rl;white-space:normal;padding:${u(30)} ${u(24)};background:${WX_RUBBING} 0 0/1024px 512px,rgba(12,11,10,.92);border:1px solid rgba(${MOON},.1);text-align:center;}`,
    `${S} .wx-item::before{content:"";position:absolute;inset:${u(6)};border:1px solid rgba(${MOON},.2);pointer-events:none;}`,
    `${S} .wx-k{font:400 ${u(13)} ${SONG};letter-spacing:.4em;color:#a39e95;}`,
    `${S} .wx-n{margin:0 ${u(12)} 0 ${u(14)};font:400 ${u(34)} ${BRUSH};letter-spacing:.24em;color:#f3eee4;}`,
    `${S} .wx-d{font:400 ${u(14)}/2 ${SONG};color:#c7c1b6;letter-spacing:.08em;text-align:start;}`,
];

const KINDS = [
    `${K('wxname')} .wx-n-card{${atR(170, 36)}${anim('rise-in', 0.45, 0.15)}}`,
    `${K('wxname')} .wx-n-name{font-size:${u(96)};color:#f3eee4;text-shadow:none;}`,
    `${K('wxname')} .wx-n-name .wx-ch{animation:igs-wxp-write-down calc(.34s * var(--wxs,1.6)) ease-out calc((.3s + var(--i,0) * .22s) * var(--wxs,1.6)) both;}`,
    `${K('wxname')} .wx-n-seal{right:${u(16)};bottom:${u(16)};width:${u(34)};height:${u(34)};font-size:${u(19)};${anim('stamp', 0.22, 1.5)}}`,
    `${K('wxpalm')} .wx-p-a{${at(330, 40)}font:400 ${u(22)} ${BRUSH};letter-spacing:.4em;${anim('fade-in', 0.3, 0.1)}}`,
    `${K('wxpalm')} .wx-p-b{${atR(330, 40)}font:400 ${u(22)} ${BRUSH};letter-spacing:.4em;${anim('fade-in', 0.3, 0.1)}}`,
    `${K('wxpalm')} .wx-wave{top:${y(40)};width:${u(220)};height:${u(270)};background:${JIAO};${maskOf(WX_WAVE)}}`,
    `${K('wxpalm')} .wx-wave.l{left:${x(262)};${anim('wave-l', 2.4, 0.2, 'cubic-bezier(.3,.6,.3,1)')}}`,
    `${K('wxpalm')} .wx-wave.r{left:${x(478)};transform:scaleX(-1);${anim('wave-r', 2.4, 0.2, 'cubic-bezier(.3,.6,.3,1)')}}`,
    `${K('wxpalm')} .wx-p-burst{${box(350, 46, 260, 260)}background:${JIAO};${maskOf(WX_SPLAT)}${anim('splat-in', 0.3, 1.6)}}`,
    `${K('wxdart')} .wx-dart{left:0;height:${u(4)};width:${u(300)};border-radius:2px;box-shadow:0 0 0 2px rgba(${PAPER},.55);background:linear-gradient(90deg,rgba(28,27,25,0),rgba(28,27,25,.6) 70%,${JIAO} 96%,rgba(28,27,25,0));animation:igs-wxp-dart calc(.3s * var(--wxs,1.6)) cubic-bezier(.5,0,.9,.6) both;}`,
    `${K('wxdart')} .d1{top:${y(120)};rotate:-4deg;animation-delay:calc(.1s * var(--wxs,1.6));}${K('wxdart')} .d2{top:${y(164)};rotate:-2deg;animation-delay:calc(.16s * var(--wxs,1.6));}${K('wxdart')} .d3{top:${y(196)};rotate:-5deg;animation-delay:calc(.2s * var(--wxs,1.6));}${K('wxdart')} .d4{top:${y(236)};rotate:-3deg;animation-delay:calc(.27s * var(--wxs,1.6));}`,
    `${K('wxdart')} .wx-d-pin{${box(760, 116, 90, 150)}background:${JIAO};${maskOf(WX_SPLAT)}${anim('splat-in', 0.2, 0.5)}}`,
    `${K('wxdart')} .wx-d-tag{${at(840, 60)}font:400 ${u(24)} ${BRUSH};letter-spacing:.4em;${anim('write-down', 0.45, 0.55)}}`,
    `${K('wxmanual')} .wx-m-card{${at(330, 64)}height:${u(340)};${anim('rise-in', 0.45, 0.2)}}`,
    `${K('wxmanual')} .wx-m-card .wx-n{font-size:${u(40)};}`,
    // 令牌与拓片同底（石纹 + 墨 .92），轮廓遮罩裁成挂耳切角，线稿层叠在最上；入场与秘籍拓片同款升起。
    `${K('wxtoken')} .wx-token{${box(250, 96, 180, 330)}background:${WX_TOKEN_LINES} center/100% 100% no-repeat,${WX_RUBBING} 0 0/1024px 512px,rgba(12,11,10,.92);${maskOf(WX_TOKEN_SHAPE)}${anim('rise-in', 0.45, 0.2)}}`,
    `${K('wxtoken')} .wx-k-char{${at(250, 160)}width:${u(180)};text-align:center;font:400 ${u(88)}/1 ${CURSIVE};color:rgb(${PAPER});text-shadow:0 0 1px rgba(${PAPER},.6);${anim('fade-in', 0.35, 0.7)}}`,
    // 令名按字数缩字，始终落在令牌内框里（内框下沿在定稿 y≈404）。
    `${K('wxtoken')} .wx-k-sub{left:${x(340)};top:${y(282)};translate:-50% 0;writing-mode:vertical-rl;font:400 calc(min(22, 118 / (var(--n,4) * 1.3)) * var(--wu)) ${CURSIVE};letter-spacing:.3em;color:rgba(${PAPER},.82);${anim('write-down', 0.5, 0.95)}}`,
    `${K('wxoath')} .wx-o-who{${at(560, 40)}font:400 ${u(17)} ${SONG};letter-spacing:.5em;${anim('fade-in', 0.5, 1.6)}}`,
    `${K('wxoath')} .wx-o-words{${at(432, 40)}writing-mode:vertical-rl;font:400 ${u(96)}/1.02 ${BRUSH};color:${JIAO};text-shadow:${RGLOW};filter:drop-shadow(0 0 1px rgba(250,250,250,.95)) drop-shadow(0 0 6px rgba(250,250,250,.8)) drop-shadow(0 0 16px rgba(250,250,250,.5));opacity:1;}${K('wxoath')} .wx-o-words .wx-ch{text-shadow:inherit;}`,
    `${K('wxoath')} .wx-o-words .wx-ch{animation:igs-wxp-ink-deepen calc(.6s * var(--wxs,1.6)) ease-out calc((.3s + var(--i,0) * .32s) * var(--wxs,1.6)) both;}`,
    `${K('wxoath')} .wx-o-seal{${box(448, 440, 42, 42)}font-size:${u(15)};${anim('stamp', 0.22, 1.85)}}`,
    `${K('wxmad')} .wx-mad{left:${u(-20)};right:${u(-20)};bottom:${u(-40)};height:120%;background:linear-gradient(0deg,rgba(28,27,25,.96),rgba(28,27,25,.9) 50%,rgba(28,27,25,.82) 70%);${maskOf(WX_MAD_MASK)}${anim('mad', 2.2, 0.1, 'cubic-bezier(.4,.1,.4,1)')}}`,
];

// 手机竖屏：坐标取 v6-手机定稿（390×844），小字一律 16。
const MOBILE = `@media (max-width:640px){${[
    `${K('wxname')} .wx-n-card{${atR(24, 96)}}${K('wxname')} .wx-n-name{font-size:${u(72)};}${K('wxname')} .wx-n-seal{right:${u(14)};bottom:${u(14)};width:${u(30)};height:${u(30)};font-size:${u(17)};}`,
    `${K('wxpalm')} .wx-wave{top:${y(250)};width:${u(150)};height:${u(190)};}${K('wxpalm')} .wx-wave.l{left:${x(44)};}${K('wxpalm')} .wx-wave.r{left:${x(196)};}`,
    `${K('wxpalm')} .wx-p-burst{${box(95, 240, 200, 200)}}${K('wxpalm')} .wx-p-a{${at(24, 110)}font-size:${u(16)};}${K('wxpalm')} .wx-p-b{${atR(24, 110)}font-size:${u(16)};}`,
    `${K('wxdart')} .wx-dart{width:${u(200)};animation-name:igs-wxp-dart-m;}${K('wxdart')} .d1{top:${y(250)};}${K('wxdart')} .d2{top:${y(290)};}${K('wxdart')} .d3{top:${y(318)};}${K('wxdart')} .d4{top:${y(352)};}`,
    `${K('wxdart')} .wx-d-pin{${box(260, 250, 80, 120)}}${K('wxdart')} .wx-d-tag{${at(336, 120)}font-size:${u(16)};}`,
    `${K('wxmanual')} .wx-m-card{${at(40, 150)}height:${u(330)};}${K('wxmanual')} .wx-m-card .wx-n{font-size:${u(32)};}`,
    `${K('wxtoken')} .wx-token{${box(30, 120, 150, 275)}}${K('wxtoken')} .wx-k-char{${at(30, 173)}width:${u(150)};font-size:${u(72)};}${K('wxtoken')} .wx-k-sub{left:${x(105)};top:${y(272)};font-size:calc(min(18, 100 / (var(--n,4) * 1.3)) * var(--wu));}`,
    `${K('wxoath')} .wx-o-words{${at(195, 110)}translate:-50% 0;font-size:${u(80)};}${K('wxoath')} .wx-o-who{${at(118, 190)}font-size:${u(16)};}${K('wxoath')} .wx-o-seal{${box(176, 470, 38, 38)}font-size:${u(14)};}`,
].join('')}}`;

// 减少动态效果：去掉全部动画，留静止终态（暗器飞线与墨晕不留，走火入魔留半截墨）。
const REDUCED = `${S}.is-reduced,${S}.is-reduced *{animation:none!important;}${S}.is-reduced .wx,${S}.is-reduced .wx-ch{opacity:1;}${S}.is-reduced :is(.wx-dart,.wx-inkv){display:none;}${K('wxmad')}.is-reduced .wx-mad{transform:translateY(60%);opacity:.6;}`;

const KEYFRAMES = `
@keyframes igs-wxp-life{0%,88%{opacity:1}100%{opacity:0}}
@keyframes igs-wxp-fade-in{from{opacity:0}to{opacity:1}}
@keyframes igs-wxp-rise-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes igs-wxp-write-down{from{opacity:1;clip-path:inset(0 0 100% 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}
@keyframes igs-wxp-stamp{0%{opacity:0;transform:scale(1.7)}55%{opacity:1;transform:scale(.94)}100%{opacity:1;transform:scale(1)}}
@keyframes igs-wxp-splat-in{0%{opacity:0;transform:scale(.35)}40%{opacity:.95}100%{opacity:.9;transform:scale(1)}}
@keyframes igs-wxp-wave-l{0%{opacity:0;transform:translateX(calc(-200 * var(--wu)))}25%{opacity:1;transform:translateX(0)}30%{transform:translateX(-4px)}35%{transform:translateX(3px)}40%{transform:translateX(-3px)}45%{transform:translateX(4px)}50%{transform:translateX(-2px)}58%{transform:translateX(0)}72%{opacity:1;transform:translateX(calc(150 * var(--wu)))}100%{opacity:0;transform:translateX(calc(220 * var(--wu)))}}
@keyframes igs-wxp-wave-r{0%{opacity:0;transform:scaleX(-1) translateX(calc(-200 * var(--wu)))}25%{opacity:1;transform:scaleX(-1) translateX(0)}30%{transform:scaleX(-1) translateX(-4px)}35%{transform:scaleX(-1) translateX(3px)}40%{transform:scaleX(-1) translateX(-3px)}45%{transform:scaleX(-1) translateX(4px)}50%{transform:scaleX(-1) translateX(-2px)}58%{opacity:1;transform:scaleX(-1) translateX(0)}72%{opacity:.35;transform:scaleX(-1) translateX(calc(-150 * var(--wu)))}100%{opacity:0;transform:scaleX(-1) translateX(calc(-200 * var(--wu)))}}
@keyframes igs-wxp-dart{0%{opacity:1;translate:calc(-300 * var(--wu)) 0}100%{opacity:1;translate:calc(1180 * var(--wu)) 0}}
@keyframes igs-wxp-dart-m{0%{opacity:1;translate:calc(-240 * var(--wu)) 0}100%{opacity:1;translate:calc(640 * var(--wu)) 0}}
@keyframes igs-wxp-ink-deepen{0%{opacity:0;color:rgba(28,27,25,.1);filter:blur(4px)}40%{opacity:1;color:rgba(28,27,25,.35);filter:blur(1.5px)}100%{opacity:1;color:${JIAO};filter:none}}
@keyframes igs-wxp-token{from{opacity:0;transform:scale(1.12) rotate(-3deg)}to{opacity:1;transform:none}}
@keyframes igs-wxp-mad{0%{opacity:1;transform:translateY(100%)}40%{opacity:1;transform:translateY(22%)}62%{opacity:1;transform:translateY(26%)}100%{opacity:0;transform:translateY(100%)}}
`;

export const WUXIA_STYLE_TEXT = [...BASE, ...KINDS, MOBILE, REDUCED, KEYFRAMES].join('\n');
