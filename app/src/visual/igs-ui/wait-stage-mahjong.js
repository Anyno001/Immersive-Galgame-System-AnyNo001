// 立直麻将的规则、和牌、算点、牌山和三家电脑都来自電脳麻将，不在这里重写。
// @kobalab/majiang-core 负责局进行，@kobalab/majiang-ai 负责对局。MIT，Satoshi Kobayashi。
import Majiang from '@kobalab/majiang-core';
import AI from '@kobalab/majiang-ai';
import { MAHJONG_STYLES, MindfulAI, STYLE_IDS, autoPersona, createPersonaStore, mindMood, readSituation } from './wait-stage-mahjong-mind.js';
import { declareLine, riichiWinKeys, voiceLine, wantsToTalk } from './wait-stage-mahjong-voice.js';
import { createMahjongSound } from './wait-stage-mahjong-sound.js';
import { createMahjongFelt } from './wait-stage-mahjong-felt.js';
import { avatarCrop, createMahjongTable, cropInto, faceFor, openMahjongAlbum, pictureBrief, setMahjongImageLoader } from './wait-stage-mahjong-table.js';
export { avatarCrop };
import { bindScmjFace, openScmjTable, readMahjongMode, readScmjSave, scmjLiveMatch, writeMahjongMode } from './wait-stage-scmj.js';

bindScmjFace((doc, code) => tileSvg(doc, code));
import { ORIGINAL_READER_ICONS as ICONS } from './reader-icons.js';

const WIND = ['东', '南', '西', '北'];
const NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONOR = ['', '东', '南', '西', '北', '白', '发', '中'];
const REL = ['自家', '下家', '对家', '上家'];
const PLACE = ['self', 'right', 'top', 'left'];

const YAKU_ZH = {
    '立直': '立直',
    'ダブル立直': '两立直',
    '一発': '一发',
    '海底摸月': '海底摸月',
    '河底撈魚': '河底捞鱼',
    '嶺上開花': '岭上开花',
    '槍槓': '抢杠',
    '天和': '天和',
    '地和': '地和',
    '門前清自摸和': '门前清自摸和',
    '翻牌 白': '役牌 白',
    '翻牌 發': '役牌 发',
    '翻牌 中': '役牌 中',
    '平和': '平和',
    '断幺九': '断幺九',
    '一盃口': '一杯口',
    '三色同順': '三色同顺',
    '一気通貫': '一气通贯',
    '混全帯幺九': '混全带幺九',
    '七対子': '七对子',
    '対々和': '对对和',
    '三暗刻': '三暗刻',
    '三槓子': '三杠子',
    '三色同刻': '三色同刻',
    '混老頭': '混老头',
    '小三元': '小三元',
    '混一色': '混一色',
    '純全帯幺九': '纯全带幺九',
    '二盃口': '二杯口',
    '清一色': '清一色',
    '国士無双十三面': '国士无双十三面',
    '国士無双': '国士无双',
    '四暗刻単騎': '四暗刻单骑',
    '四暗刻': '四暗刻',
    '大三元': '大三元',
    '大四喜': '大四喜',
    '小四喜': '小四喜',
    '字一色': '字一色',
    '緑一色': '绿一色',
    '清老頭': '清老头',
    '四槓子': '四杠子',
    '純正九蓮宝燈': '纯正九莲宝灯',
    '九蓮宝燈': '九莲宝灯',
    'ドラ': '宝牌',
    '赤ドラ': '赤宝牌',
    '裏ドラ': '里宝牌',
};

const PINGJU_ZH = {
    '荒牌平局': '荒牌流局',
    '流し満貫': '流局满贯',
    '九種九牌': '九种九牌',
    '四家立直': '四家立直',
    '四風連打': '四风连打',
    '四開槓': '四杠散了',
    '三家和': '三家和',
};

const STAGE = '.igs-waitstage[data-igs-waitstage-game="mahjong"]';
const FULL = `${STAGE}:not(.igs-embedded-loading)`;
const WAVE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="24" viewBox="0 0 48 24"><g fill="none" stroke="#fff" stroke-opacity=".07"><path d="M0 24a24 24 0 0 1 48 0M8 24a16 16 0 0 1 32 0M16 24a8 8 0 0 1 16 0"/><path d="M-24 12a24 24 0 0 1 48 0M-16 12a16 16 0 0 1 32 0M-8 12a8 8 0 0 1 16 0M24 12a24 24 0 0 1 48 0M32 12a16 16 0 0 1 32 0M40 12a8 8 0 0 1 16 0"/></g></svg>';
const WAVE = `url("data:image/svg+xml,${encodeURIComponent(WAVE_SVG)}")`;
const GOLD_BUTTON = 'background:linear-gradient(180deg,#fbe39a 0%,#e9b84a 55%,#c98a22 100%);color:#3b2400;font-weight:800;box-shadow:0 0 0 1px rgba(255,248,220,.75),0 3px 0 #8d5b12,0 6px 14px rgba(0,0,0,.35);';

// 牌桌尺寸都写成 cqi，出样式时换成 --igs-mj-u：16:9 基准宽的百分之一。
// 屏幕比 16:9 宽时牌桌横向铺满，牌区仍是 16:9 居中，头像、宝牌、工具栏贴边。
const MAHJONG_STYLE_SOURCE = `
@keyframes igs-mj-pop{0%{opacity:0;transform:scale(.92);}100%{opacity:1;transform:scale(1);}}
${STAGE} .igs-ws-dots,${STAGE} .igs-ws-line{display:none;}
${STAGE} .igs-ws-board{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:100%;max-width:min(1100px,100%);padding:0;background:none;box-shadow:none;color:#f4efe4;}
${STAGE} .igs-ws-board[hidden]{display:none;}
${FULL}{padding:0;container:igs-mj-stage/size;background:#10162f;-webkit-backdrop-filter:none;backdrop-filter:none;}
${FULL} .igs-ws-body{position:absolute;inset:6px;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);width:auto;height:auto;max-width:none;animation:none;}
${FULL} .igs-ws-note{position:absolute;left:50%;top:8px;z-index:20;box-sizing:border-box;max-width:34%;padding:4px 12px;overflow:hidden;border-radius:999px;background:rgba(8,12,34,.86);box-shadow:inset 0 0 0 1px rgba(234,200,124,.5);color:#fbf4e2;font-size:12px;line-height:1.5;letter-spacing:.04em;white-space:nowrap;text-overflow:ellipsis;transform:translateX(-82%);pointer-events:none;animation:none;}
${FULL} .igs-ws-note:empty{display:none;}
${FULL} .igs-ws-actions{display:none!important;}
${FULL} .igs-ws-board{grid-column:1;grid-row:1;align-self:stretch;justify-self:stretch;max-width:none;height:100%;min-height:0;container:igs-mj-board/size;animation:none;}
${FULL} .igs-mj-table{width:min(100cqw,100cqh * 2.4);height:min(100cqh,100cqw * 9 / 16);aspect-ratio:auto;}
@container igs-mj-stage (orientation: portrait) and (max-width: 720px){
${FULL} .igs-ws-body{inset:auto;left:50%;top:50%;width:calc(100cqh - 16px);height:calc(100cqw - 16px);transform:translate(-50%,-50%) rotate(90deg);}
}
.igs-mj{display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:0;font-family:"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;}
.igs-mj-table{--tw:2.5cqi;--igs-mj-back:#e2546d;--igs-mj-back-deep:#b3304b;--igs-mj-serif:"Hiragino Mincho ProN","Yu Mincho","Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC","Noto Serif SC",serif;position:relative;box-sizing:border-box;flex:none;width:100%;aspect-ratio:16/9;border-radius:14px;overflow:hidden;container-type:inline-size;color:#f4efe4;background:radial-gradient(ellipse 46% 40% at 50% 47%,rgba(130,160,255,.2),transparent 72%),radial-gradient(circle at 9% 3%,rgba(196,146,255,.36),transparent 30%),radial-gradient(circle at 93% 5%,rgba(196,146,255,.26),transparent 27%),radial-gradient(circle at 78% 98%,rgba(120,90,220,.24),transparent 34%),${WAVE},linear-gradient(180deg,#2b3b7a 0%,#1e2b60 42%,#141c45 100%);background-size:auto,auto,auto,auto,44px 22px,auto;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1),inset 0 0 70px rgba(4,6,20,.55),0 18px 40px rgba(0,0,0,.4);}
.igs-mj-scene{position:absolute;inset:0;}
.igs-mj-crowd{pointer-events:none;}
.igs-mj-felt{position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none;}
.igs-mj-rail{position:absolute;display:flex;align-items:flex-end;gap:1.2cqi;}
.igs-mj-rail.is-self{--dx:0;--dy:1;left:calc(50% - 38.4cqi);right:calc(50% - 47.6cqi);bottom:1.8cqi;z-index:4;justify-content:space-between;transform:none;}
.igs-mj-rail.is-self .igs-mj-hand .igs-mj-pai{--tw:4.75cqi;--th:calc(var(--tw) * 1.4);--tz:calc(var(--tw) * .09);}
.igs-mj-rail.is-self .igs-mj-meld .igs-mj-pai{--tw:3cqi;}
.igs-mj-hand{display:flex;align-items:flex-end;gap:.08cqi;}
.igs-mj-melds{display:flex;align-items:flex-end;gap:.8cqi;}
.igs-mj-meld{display:flex;align-items:flex-end;gap:.04cqi;}
.igs-mj-pai{--th:calc(var(--tw) * 4 / 3);--tz:calc(var(--tw) * .11);position:relative;box-sizing:border-box;display:inline-block;flex:none;width:var(--tw);height:var(--th);margin:0;padding:0;border:0;border-radius:calc(var(--tw) * .13);background:linear-gradient(165deg,#ffffff 0%,#fbf7ee 52%,#ece3d1 100%);color:inherit;font:inherit;line-height:0;vertical-align:bottom;box-shadow:inset 0 0 0 max(1px,calc(var(--tw) * .03)) rgba(150,128,96,.3),calc(var(--dx,0) * var(--tz)) calc(var(--dy,1) * var(--tz)) 0 #e3d7bf,calc(var(--dx,0) * var(--tz) * 2.1) calc(var(--dy,1) * var(--tz) * 2.1) 0 var(--igs-mj-back),calc(var(--dx,0) * var(--tz) * 2.6) calc(var(--dy,1) * var(--tz) * 2.6) calc(var(--tz) * 2.2) rgba(0,0,0,.4);}
.igs-mj-pai.is-back{background:linear-gradient(165deg,#f57e93 0%,var(--igs-mj-back) 46%,var(--igs-mj-back-deep) 100%);box-shadow:inset 0 0 0 max(1px,calc(var(--tw) * .03)) rgba(110,16,36,.4),calc(var(--dx,0) * var(--tz)) calc(var(--dy,1) * var(--tz)) 0 var(--igs-mj-back-deep),calc(var(--dx,0) * var(--tz) * 2.1) calc(var(--dy,1) * var(--tz) * 2.1) 0 #f1e8d4,calc(var(--dx,0) * var(--tz) * 2.6) calc(var(--dy,1) * var(--tz) * 2.6) calc(var(--tz) * 2.2) rgba(0,0,0,.4);}
.igs-mj-pai.is-side{width:var(--th);height:var(--tw);}
.igs-mj-svg{display:block;width:100%;height:100%;pointer-events:none;}
.igs-mj-pai.is-side .igs-mj-svg{position:absolute;left:50%;top:50%;width:var(--tw);height:var(--th);transform:translate(-50%,-50%) rotate(-90deg);}
.igs-mj-pai.is-out{filter:brightness(.72) saturate(.6);opacity:.6;}
.igs-mj-pai.is-fresh::after{content:"";position:absolute;inset:0;border-radius:inherit;box-shadow:0 0 0 .18cqi #ffd65a;pointer-events:none;}
.igs-mj-pai.is-zimo{margin-left:1.4cqi;}
.igs-mj-pai.is-hot{cursor:pointer;transition:transform .12s ease,filter .12s ease;}
.igs-mj-pai.is-hot:focus-visible{outline:none;transform:translateY(-1.2cqi);}
@media (hover:hover){.igs-mj-pai.is-hot:hover{transform:translateY(-1.2cqi);}}
.igs-mj-hand.is-live .igs-mj-pai:not(.is-hot){filter:brightness(.6) saturate(.7);}
.igs-mj-pai:disabled{cursor:default;}
.igs-mj-label{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);border:0;}
.igs-mj-head{position:absolute;z-index:3;display:flex;flex-direction:column;align-items:center;gap:.6cqi;pointer-events:none;}
.igs-mj-head.is-top{left:calc(50% + 16cqi);top:1.3cqi;flex-direction:row;gap:1cqi;}
.igs-mj-head.is-left{left:1.2cqi;top:14cqi;}
.igs-mj-head.is-right{right:1.2cqi;top:14cqi;}
.igs-mj-head.is-self{left:calc(50% - 48.4cqi);bottom:1.4cqi;}
.igs-mj-avatar{position:relative;box-sizing:border-box;width:8.8cqi;height:11cqi;padding:.24cqi;border-radius:1.2cqi;background:linear-gradient(160deg,#fff4cf 0%,#d9b467 46%,#8a6326 100%);box-shadow:0 .5cqi 1.2cqi rgba(0,0,0,.45);transition:box-shadow .2s ease;}
.igs-mj-head.is-turn .igs-mj-avatar{box-shadow:0 0 0 .26cqi #ffd65a,0 0 1.8cqi .5cqi rgba(255,214,90,.65);}
.igs-mj-face{position:relative;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:100%;height:100%;overflow:hidden;border-radius:1cqi;background:linear-gradient(160deg,#6274c0,#2b3672);color:#fff;font-size:2.8cqi;font-weight:700;line-height:1;}
.igs-mj-crop{position:absolute;display:block;max-width:none;height:auto;opacity:0;transition:opacity .28s ease;pointer-events:none;}
.igs-mj-crop.is-ready{opacity:1;}
.igs-mj-crop.is-swap{transition:none;}
.igs-mj-wind{position:absolute;right:-.8cqi;bottom:-.8cqi;display:flex;align-items:center;justify-content:center;width:2.4cqi;height:2.4cqi;border-radius:50%;background:#1b2142;box-shadow:0 0 0 .18cqi #ead39a;color:#f3e8cc;font-size:1.3cqi;font-weight:800;line-height:1;}
.igs-mj-wind.is-dealer{background:linear-gradient(160deg,#ff6b6b,#c21d38);color:#fff;}
.igs-mj-name{max-width:12cqi;padding:.35cqi 1.1cqi;overflow:hidden;border-radius:.7cqi;background:rgba(8,12,34,.74);box-shadow:inset 0 0 0 1px rgba(234,211,154,.38);color:#fbf4e2;font-size:max(10px,1.3cqi);font-weight:700;line-height:1.3;white-space:nowrap;text-overflow:ellipsis;}
.igs-mj-say{position:absolute;top:calc(100% + 1cqi);left:0;width:max-content;max-width:24cqi;box-sizing:border-box;padding:.7cqi 1.2cqi;border-radius:1cqi;background:rgba(255,250,236,.96);box-shadow:0 .5cqi 1.2cqi rgba(0,0,0,.4);color:#2a2238;font-size:max(11px,1.45cqi);font-weight:700;line-height:1.45;text-align:left;visibility:hidden;}
.igs-mj-say::before{content:"";position:absolute;top:-.9cqi;left:2.4cqi;border:.5cqi solid transparent;border-bottom:.5cqi solid rgba(255,250,236,.96);}
.igs-mj-say.is-on{visibility:visible;}
.igs-mj-head.is-right .igs-mj-say,.igs-mj-head.is-top .igs-mj-say{left:auto;right:0;}
.igs-mj-head.is-right .igs-mj-say::before,.igs-mj-head.is-top .igs-mj-say::before{left:auto;right:2.4cqi;}
.igs-mj-head.is-self .igs-mj-say{display:none;}
.igs-mj-dora{position:absolute;left:1.6cqi;top:1.6cqi;z-index:3;display:flex;flex-direction:column;gap:.6cqi;padding:.9cqi 1.1cqi .8cqi;border-radius:1.1cqi;background:linear-gradient(180deg,rgba(20,24,52,.9),rgba(10,12,30,.9));box-shadow:0 0 0 .14cqi rgba(234,200,124,.6),0 .6cqi 1.4cqi rgba(0,0,0,.4);}
.igs-mj-dora-tiles{display:flex;gap:.2cqi;}
.igs-mj-dora .igs-mj-pai{--tw:2.5cqi;--tz:calc(var(--tw) * .08);}
.igs-mj-dora-sticks{display:flex;align-items:center;gap:1.6cqi;color:#f4eedc;font-size:max(10px,1.25cqi);font-weight:700;line-height:1;}
.igs-mj-count{display:inline-flex;align-items:center;gap:.5cqi;}
.igs-mj-chip{position:relative;display:inline-block;width:3cqi;height:.6cqi;border-radius:.3cqi;background:linear-gradient(180deg,#fff,#ddd3c0);}
.igs-mj-chip.is-1000::after{content:"";position:absolute;left:50%;top:50%;width:.4cqi;height:.4cqi;border-radius:50%;background:#d8202f;transform:translate(-50%,-50%);}
.igs-mj-chip.is-100{background:radial-gradient(circle,#222 0 36%,transparent 40%) 0 50%/.75cqi .6cqi repeat-x,linear-gradient(180deg,#fff,#ddd3c0);}
.igs-mj-dora-title{color:#ecc97c;font-size:max(10px,1.15cqi);letter-spacing:.14em;line-height:1;white-space:nowrap;}
.igs-mj-tools{position:absolute;right:1.2cqi;top:1.2cqi;z-index:7;}
.igs-mj-actions{position:absolute;right:calc(50% - 47cqi);bottom:12.6cqi;z-index:6;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:1.1cqi;max-width:80cqi;pointer-events:none;}
.igs-mj-act{display:inline-flex;align-items:center;justify-content:center;gap:.8cqi;box-sizing:border-box;height:5.4cqi;min-height:32px;padding:0 2.4cqi;border:0;border-radius:2.7cqi;background:linear-gradient(180deg,#7fd6ff 0%,#2a8be6 55%,#1b5fc4 100%);box-shadow:0 0 0 .22cqi rgba(255,255,255,.9),0 .45cqi 0 rgba(10,20,60,.45),0 .9cqi 1.8cqi rgba(0,0,0,.35);color:#fff;font:900 max(14px,2.2cqi)/1 var(--igs-mj-serif);letter-spacing:.14em;text-shadow:0 .15cqi .3cqi rgba(0,0,0,.45);cursor:pointer;pointer-events:auto;}
@media (hover:hover){.igs-mj-act:hover{filter:brightness(1.08);transform:translateY(-.3cqi);transition:transform .12s ease,filter .12s ease;}}
.igs-mj-act.is-win{background:linear-gradient(180deg,#ffb36b 0%,#ff5a4f 50%,#d81e4f 100%);}
.igs-mj-act.is-riichi{background:linear-gradient(180deg,#ffe27a 0%,#ffae2b 55%,#e8780f 100%);}
.igs-mj-act.is-riichi.is-on{box-shadow:0 0 0 .22cqi #fff,0 0 1.6cqi .5cqi rgba(255,200,70,.85),0 .45cqi 0 rgba(10,20,60,.45);}
.igs-mj-act.is-misc{background:linear-gradient(180deg,#c9a6ff 0%,#8a5ae8 55%,#6337c4 100%);}
.igs-mj-act.is-skip{background:linear-gradient(180deg,#4a5578 0%,#2a3252 100%);box-shadow:0 0 0 .22cqi rgba(255,255,255,.55),0 .45cqi 0 rgba(10,20,60,.45),0 .9cqi 1.8cqi rgba(0,0,0,.35);}
.igs-mj-act-tiles{display:inline-flex;gap:.05cqi;}
.igs-mj-act .igs-mj-pai{--tw:2cqi;--tz:calc(var(--tw) * .07);}
.igs-mj-banner{position:absolute;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(6,8,22,.5),rgba(6,8,22,.84));}
.igs-mj-banner[hidden]{display:none;}
.igs-mj-card{display:flex;flex-direction:column;align-items:center;gap:1cqi;box-sizing:border-box;width:min(66cqi,94%);max-height:94%;overflow:auto;padding:2.2cqi 3cqi;border-radius:1.6cqi;background:linear-gradient(180deg,#222b56 0%,#141936 100%);box-shadow:0 0 0 .2cqi rgba(234,200,124,.75),0 0 0 .7cqi rgba(234,200,124,.12),0 2cqi 4cqi rgba(0,0,0,.55);color:#f4efe4;text-align:center;animation:igs-mj-pop .25s ease-out both;}
.igs-mj-card-title{background:linear-gradient(180deg,#fff7d6 0%,#f4c654 55%,#d4851c 100%);-webkit-background-clip:text;background-clip:text;color:transparent;font:900 max(26px,4.8cqi)/1.1 var(--igs-mj-serif);letter-spacing:.24em;filter:drop-shadow(0 .3cqi .4cqi rgba(0,0,0,.5));}
.igs-mj-card.is-draw .igs-mj-card-title{background-image:linear-gradient(180deg,#eef4ff 0%,#a9bde8 60%,#6f86c0 100%);}
.igs-mj-card-who{color:#e9e2cf;font-size:max(12px,1.6cqi);letter-spacing:.1em;}
.igs-mj-card-quote{display:flex;flex-direction:column;gap:.3cqi;color:#fff2c8;font-size:max(12px,1.5cqi);line-height:1.5;}
.igs-mj-card-hand{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:center;gap:.6cqi;}
.igs-mj-card-hand .igs-mj-hand,.igs-mj-card-hand .igs-mj-melds{gap:.06cqi;}
.igs-mj-card-hand .igs-mj-pai{--tw:3cqi;--tz:calc(var(--tw) * .08);}
.igs-mj-card-dora{display:flex;align-items:center;gap:.4cqi;color:#bfc8e8;font-size:max(11px,1.25cqi);}
.igs-mj-card-dora .igs-mj-pai{--tw:2.1cqi;--tz:calc(var(--tw) * .08);}
.igs-mj-card-yaku{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.4cqi 2.6cqi;width:100%;margin:0;padding:0;list-style:none;font-size:max(12px,1.55cqi);}
.igs-mj-card-yaku li{display:flex;justify-content:space-between;gap:1cqi;padding:.3cqi 0;border-bottom:1px dashed rgba(255,255,255,.14);}
.igs-mj-card-yaku b{color:#ffd77a;font-weight:700;}
.igs-mj-card-total{display:flex;align-items:baseline;justify-content:center;gap:1.4cqi;color:#e9e2cf;font-size:max(12px,1.6cqi);}
.igs-mj-card-total strong{color:#ffe08a;font:900 max(20px,3.4cqi)/1 var(--igs-mj-serif);letter-spacing:.06em;}
.igs-mj-card-total em{padding:.2cqi 1cqi;border-radius:.5cqi;background:linear-gradient(180deg,#ff7b5c,#d0234a);color:#fff;font-style:normal;font-weight:800;letter-spacing:.12em;}
.igs-mj-card-delta{display:flex;flex-wrap:wrap;justify-content:center;gap:.6cqi 2cqi;font-size:max(11px,1.35cqi);}
.igs-mj-card-delta>span{display:flex;align-items:center;gap:.6cqi;}
.igs-mj-card-delta i{font-style:normal;}
.igs-mj-card-delta .igs-mj-avatar{width:4cqi;height:4cqi;padding:.16cqi;border-radius:.8cqi;}
.igs-mj-card-delta .igs-mj-face{border-radius:.6cqi;font-size:1.6cqi;}
.igs-mj-card-delta .is-up b{color:#8ff0a8;}
.igs-mj-card-delta .is-down b{color:#ff9a9a;}
.igs-mj-card-rank{display:flex;flex-direction:column;gap:.7cqi;width:100%;}
.igs-mj-card-rank li{display:flex;align-items:center;gap:1.2cqi;padding:.6cqi 1.2cqi;border-radius:1cqi;background:rgba(255,255,255,.05);list-style:none;font-size:max(12px,1.6cqi);}
.igs-mj-card-rank li:first-child{background:linear-gradient(90deg,rgba(244,198,84,.28),rgba(244,198,84,.04));}
.igs-mj-card-rank .igs-mj-avatar{width:4.4cqi;height:4.4cqi;border-radius:.9cqi;}
.igs-mj-card-rank .igs-mj-face{border-radius:.7cqi;font-size:1.8cqi;}
.igs-mj-card-place{width:2.6cqi;color:#ffd77a;font:900 max(16px,2.4cqi)/1 var(--igs-mj-serif);}
.igs-mj-card-rank span{flex:1;text-align:left;}
.igs-mj-card-rank b{font-variant-numeric:tabular-nums;}
.igs-mj-card-text{color:#e9e2cf;font-size:max(12px,1.6cqi);line-height:1.6;}
.igs-mj-card-foot{display:flex;justify-content:center;gap:1cqi;margin-top:.4cqi;}
.igs-mj-card-foot .igs-ws-chip{height:max(30px,4.4cqi);padding:0 3.2cqi;border-radius:999px;font-size:max(12px,1.5cqi);letter-spacing:.16em;${GOLD_BUTTON}}
.igs-mj.igs-mj-picker{--igs-mj-card-h:clamp(88px,28cqh,128px);--igs-mj-seat:clamp(44px,14cqh,80px);flex-direction:column;justify-content:flex-start;align-items:stretch;gap:clamp(6px,2.2cqh,14px);box-sizing:border-box;width:min(1100px,100%);height:auto;max-height:100%;overflow:hidden;padding:clamp(10px,3cqh,20px) clamp(12px,2.4cqw,22px);border-radius:14px;background:radial-gradient(circle at 12% 0%,rgba(196,146,255,.28),transparent 42%),${WAVE},linear-gradient(180deg,#26346e,#141c45);background-size:auto,44px 22px,auto;box-shadow:inset 0 0 0 1px rgba(234,200,124,.4),0 18px 40px rgba(0,0,0,.4);color:#f4efe4;}
.igs-mj-picker>*{flex-shrink:0;}
.igs-mj-picker .igs-ws-board-head{display:flex;align-items:center;gap:12px;color:#f0cf86;font-size:15px;font-weight:700;letter-spacing:.2em;}
.igs-mj-picker .igs-ws-status{flex:1;min-width:0;min-height:0;margin:0;overflow:hidden;color:#aeb8e0;font-size:12px;font-weight:400;letter-spacing:.04em;white-space:nowrap;text-overflow:ellipsis;}
.igs-mj-lineup{display:flex;justify-content:center;}
.igs-mj-slots{display:flex;justify-content:center;gap:clamp(10px,3cqw,28px);}
.igs-mj-slot{display:flex;flex-direction:column;align-items:center;gap:2px;box-sizing:border-box;width:calc(var(--igs-mj-seat) + 24px);padding:6px 0 5px;border-radius:10px;background:rgba(8,12,34,.5);box-shadow:inset 0 0 0 1px rgba(170,195,255,.2);color:inherit;transition:box-shadow .15s ease;}
.igs-mj-slot.is-filled{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:1fr auto auto 1fr;align-items:center;column-gap:6px;row-gap:4px;width:clamp(176px,22cqw,232px);padding:6px 8px 5px 0;}
.igs-mj-slot.is-filled>.igs-mj-slot-pick{grid-column:1;grid-row:1/-1;width:calc(var(--igs-mj-seat) + 24px);}
.igs-mj-slot.is-filled>.igs-mj-outfit{grid-column:2;grid-row:2;width:100%;}
.igs-mj-slot.is-filled>.igs-mj-mind{grid-column:2;grid-row:3;width:100%;margin-top:0;}
.igs-mj-slot-pick{display:flex;flex-direction:column;align-items:center;gap:4px;width:100%;padding:0 0 2px;border:0;background:none;color:inherit;font:inherit;cursor:pointer;}
.igs-mj-outfit{display:flex;align-items:center;justify-content:center;width:calc(100% - 6px);min-height:18px;color:#d8def5;font-size:11px;}
.igs-mj-outfit-step{flex:none;width:16px;height:18px;padding:0 0 2px;border:0;border-radius:4px;background:none;color:#f0cf86;font:inherit;font-size:14px;line-height:1;cursor:pointer;}
.igs-mj-outfit-step:hover{background:rgba(240,207,134,.14);}
.igs-mj-outfit-step.is-idle{visibility:hidden;pointer-events:none;}
.igs-mj-outfit-name{flex:1;min-width:0;text-align:center;line-height:1.3;overflow-wrap:anywhere;}
.igs-mj-mind{display:flex;flex-wrap:wrap;align-items:center;gap:2px;width:calc(100% - 6px);margin-top:1px;}
.igs-mj-style{flex:1;min-width:0;max-width:100%;min-height:18px;padding:2px 7px;border:0;border-radius:9px;background:rgba(240,207,134,.16);color:#f0cf86;font:inherit;font-size:10px;letter-spacing:.04em;line-height:1.35;white-space:normal;word-break:keep-all;cursor:pointer;}
.igs-mj-style-tag{display:inline-block;margin-left:.3em;white-space:nowrap;opacity:.85;}
.igs-mj-style:hover{background:rgba(240,207,134,.28);}
.igs-mj-style.is-user{background:rgba(143,240,168,.18);color:#a8f0bb;}
.igs-mj-style.is-auto{color:#c9d0ee;background:rgba(170,195,255,.12);}
.igs-mj-style:disabled{opacity:.6;cursor:default;}
.igs-mj-rewrite{flex:none;height:18px;padding:0 5px;border:0;border-radius:9px;background:rgba(170,195,255,.16);color:#d5def8;font:inherit;font-size:10px;line-height:18px;letter-spacing:.04em;cursor:pointer;}
.igs-mj-rewrite:hover{background:rgba(170,195,255,.3);}
.igs-mj-rewrite:disabled{opacity:.45;cursor:default;}
.igs-mj-slot.is-filled{box-shadow:inset 0 0 0 1px rgba(240,207,134,.7);}
.igs-mj-slot .igs-mj-pic{width:var(--igs-mj-seat);height:var(--igs-mj-seat);border-radius:8px;font-size:18px;}
.igs-mj-slot-name{max-width:calc(100% - 8px);overflow:hidden;font-size:12px;letter-spacing:.04em;white-space:nowrap;text-overflow:ellipsis;}
.igs-mj-slot:not(.is-filled) .igs-mj-slot-name{color:#8e98c2;}
.igs-mj-seat-tag{color:#f0cf86;font-size:10px;letter-spacing:.2em;line-height:1.2;}
.igs-mj-pic{position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;background:linear-gradient(160deg,#4b5aa0,#232c62);color:rgba(255,255,255,.55);font-weight:700;}
.igs-mj-reel-wrap{position:relative;padding:0 26px;}
.igs-mj-reel{display:flex;gap:8px;padding:4px 2px 6px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 16px,#000 calc(100% - 16px),transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 16px,#000 calc(100% - 16px),transparent 100%);cursor:grab;}
.igs-mj-reel::-webkit-scrollbar{display:none;}
.igs-mj-reel.is-dragging{scroll-snap-type:none;cursor:grabbing;}
.igs-mj-person{position:relative;flex:none;width:calc(var(--igs-mj-card-h) * .75);height:var(--igs-mj-card-h);box-sizing:border-box;padding:0;border:0;border-radius:8px;overflow:hidden;background:linear-gradient(180deg,#3b4b8e,#1a2252);box-shadow:inset 0 0 0 1px rgba(170,195,255,.25);color:inherit;font:inherit;cursor:pointer;scroll-snap-align:start;transition:box-shadow .15s ease,filter .15s ease;}
.igs-mj-person .igs-mj-pic{position:absolute;inset:0;font-size:24px;}
.igs-mj-person-name{position:absolute;left:0;right:0;bottom:0;box-sizing:border-box;padding:12px 4px 4px;overflow:hidden;background:linear-gradient(180deg,transparent,rgba(6,9,30,.88) 55%);font-size:11px;letter-spacing:.04em;text-align:center;white-space:nowrap;text-overflow:ellipsis;}
.igs-mj-person::after{position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 2px #f0cf86;pointer-events:none;}
.igs-mj-person:hover{filter:brightness(1.1);}
.igs-mj-person.is-on::after{content:"";}
.igs-mj-person.is-on::before{content:attr(data-seat);position:absolute;left:4px;top:4px;z-index:1;padding:1px 5px;border-radius:4px;background:#f0cf86;color:#3b2400;font-size:10px;font-weight:800;letter-spacing:.1em;}
.igs-mj-reel.is-full .igs-mj-person:not(.is-on){filter:brightness(.6);}
.igs-mj-reel-nav{position:absolute;top:50%;display:flex;align-items:center;justify-content:center;width:22px;height:40px;margin-top:-20px;padding:0 0 2px;border:0;border-radius:6px;background:rgba(8,12,34,.55);box-shadow:inset 0 0 0 1px rgba(170,195,255,.25);color:#f0cf86;font-size:20px;line-height:1;cursor:pointer;}
.igs-mj-reel-nav.is-prev{left:0;}
.igs-mj-reel-nav.is-next{right:0;}
.igs-mj-reel-nav:hover{background:rgba(30,40,90,.75);}
.igs-mj-picker .igs-mj-go{align-self:center;height:36px;padding:0 36px;border-radius:999px;font-size:14px;letter-spacing:.24em;${GOLD_BUTTON}}
.igs-mj-picker .igs-mj-go:disabled{opacity:.45;cursor:default;filter:grayscale(.4);}
.igs-mj-card[hidden],.igs-mj-card-text[hidden],.igs-mj-album-open[hidden],.igs-mj-cgprompt[hidden]{display:none!important;}
.igs-mj-card-foot{flex-wrap:wrap;}
.igs-mj-card-foot .igs-ws-chip:disabled{opacity:.45;cursor:default;filter:grayscale(.4);}
.igs-mj-card-foot .igs-mj-punish{background:linear-gradient(180deg,#ffb3a6 0%,#f0627a 55%,#c42c55 100%);color:#fff;box-shadow:0 0 0 1px rgba(255,220,226,.75),0 3px 0 #82173a,0 6px 14px rgba(0,0,0,.35);}
.igs-mj-card.is-penalty{width:min(78cqi,96%);}
.igs-mj-penalty-form{display:flex;flex-direction:column;align-items:center;gap:1cqi;width:100%;}
.igs-mj-penalty-modes{display:flex;gap:.8cqi;}
.igs-mj-penalty-mode{height:max(28px,3.8cqi);padding:0 2.4cqi;border:0;border-radius:999px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(170,195,255,.3);color:#d8def5;font:inherit;font-size:max(12px,1.4cqi);letter-spacing:.12em;cursor:pointer;}
.igs-mj-penalty-mode.is-on{background:rgba(244,198,84,.2);box-shadow:inset 0 0 0 1px #f0cf86;color:#ffe4a0;}
.igs-mj-penalty-mode:disabled{opacity:.4;cursor:not-allowed;}
.igs-mj-penalty-input{box-sizing:border-box;width:100%;min-height:max(64px,9cqi);padding:1cqi 1.2cqi;border:0;border-radius:1cqi;background:rgba(6,9,30,.6);box-shadow:inset 0 0 0 1px rgba(170,195,255,.3);color:#f4efe4;font:inherit;font-size:max(13px,1.5cqi);line-height:1.5;resize:vertical;-webkit-user-select:text;user-select:text;}
.igs-mj-penalty-input:focus{outline:none;box-shadow:inset 0 0 0 1px #f0cf86;}
.igs-mj-penalty-input:disabled{opacity:.6;}
.igs-mj-penalty-status{color:#aeb8e0;font-size:max(11px,1.3cqi);line-height:1.5;}
.igs-mj-penalty-status:empty{display:none;}
.igs-mj-penalty-status.is-error{color:#ff9a9a;}
.igs-mj-cgview{position:absolute;inset:0;z-index:14;overflow:hidden;border-radius:inherit;background:#05060f;animation:igs-mj-pop .25s ease-out both;}
.igs-mj-cgview>img{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain;}
.igs-mj-cgbar{position:absolute;top:8px;right:8px;}
.igs-mj-cgbar,.igs-mj-bar{display:flex;align-items:center;padding:2px 3px;border-radius:10px;background:rgba(18,18,20,.32);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fff;}
.igs-mj-bar{flex:none;background:rgba(8,10,26,.72);-webkit-backdrop-filter:none;backdrop-filter:none;}
.igs-mj-bar-group{display:flex;align-items:center;}
.igs-mj-bar-group[hidden],.igs-mj-icon[hidden]{display:none;}
.igs-mj-bar-group+.igs-mj-bar-group::before{content:"";flex:none;width:1px;height:14px;margin:0 3px;background:currentColor;opacity:.2;}
.igs-mj-icon.is-next{width:auto;gap:2px;padding:0 8px 0 4px;color:#ffe08a;opacity:1;font:inherit;font-size:12px;font-weight:700;letter-spacing:.06em;}
.igs-mj-icon{display:inline-flex;flex:none;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:7px;background:transparent;color:inherit;opacity:.6;cursor:pointer;transition:opacity .15s;}
.igs-mj-icon:hover,.igs-mj-icon:focus-visible{opacity:.95;outline:none;}
.igs-mj-icon[aria-pressed="true"]{opacity:.95;}
.igs-mj-icon:disabled{opacity:.2;cursor:default;}
.igs-mj-icon svg{width:14px;height:14px;}
.igs-mj-cgbar-gap{flex:none;width:1px;height:14px;margin:0 3px;background:currentColor;opacity:.2;}
.igs-mj-cgnote{position:absolute;left:8px;bottom:8px;max-width:70%;padding:3px 10px;border-radius:8px;background:rgba(0,0,0,.45);color:#f4efe4;font-size:12px;line-height:1.5;}
.igs-mj-cgnote:empty{display:none;}
.igs-mj-cgnote.is-error{color:#ffb0b0;}
.igs-mj-cgprompt{position:absolute;left:8px;right:8px;top:44px;bottom:40px;overflow:auto;padding:10px 12px;border-radius:10px;background:rgba(8,10,24,.88);color:#e8e5df;font-size:12px;line-height:1.55;text-align:left;-webkit-user-select:text;user-select:text;}
.igs-mj-cgprompt b{display:block;margin:6px 0 2px;color:#f0cf86;font-size:11px;letter-spacing:.12em;}
.igs-mj-cgprompt b:first-child{margin-top:0;}
.igs-mj-cgprompt p{margin:0;white-space:pre-wrap;word-break:break-word;}
@media (pointer:coarse){.igs-mj-icon{position:relative;}.igs-mj-icon::after{content:"";position:absolute;left:0;right:0;top:50%;height:max(100%,44px);transform:translateY(-50%);}}
.igs-mj.igs-mj-picker{position:relative;}
.igs-mj-picker .igs-mj-album-open{height:26px;padding:0 12px;border-radius:999px;font-size:12px;letter-spacing:.08em;${GOLD_BUTTON}}
.igs-mj-album{position:absolute;inset:0;z-index:12;display:flex;flex-direction:column;gap:10px;box-sizing:border-box;padding:12px 14px;border-radius:inherit;background:rgba(12,16,40,.97);color:#f4efe4;text-align:left;}
.igs-mj-album-head{display:flex;align-items:center;justify-content:space-between;color:#f0cf86;font-size:14px;font-weight:700;letter-spacing:.16em;}
.igs-mj-album-close{width:28px;height:28px;padding:0;border:0;border-radius:6px;background:rgba(255,255,255,.08);color:#f0cf86;font:inherit;cursor:pointer;}
.igs-mj-album-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));align-content:start;gap:8px;flex:1;min-height:0;overflow-y:auto;}
.igs-mj-album-item{position:relative;display:flex;flex-direction:column;padding:0;border:0;border-radius:8px;overflow:hidden;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px rgba(170,195,255,.2);color:inherit;font:inherit;text-align:left;cursor:pointer;}
.igs-mj-album-pic{display:flex;align-items:center;justify-content:center;aspect-ratio:16/10;overflow:hidden;background:#141a3c;color:#8e98c2;font-size:11px;}
.igs-mj-album-pic img{display:block;width:100%;height:100%;object-fit:cover;}
.igs-mj-album-cap{padding:4px 6px;overflow:hidden;font-size:11px;white-space:nowrap;text-overflow:ellipsis;}
.igs-mj-album-tag{position:absolute;right:4px;top:4px;padding:1px 5px;border-radius:4px;background:#c42c55;color:#fff;font-size:10px;}
@media (prefers-reduced-motion: reduce){
.igs-mj-card{animation:none!important;}
}
`;

// 嵌在阅读器加载位时牌桌就是 16:9，1cqi 即基准；铺满整层时在子元素上解析，cqi 量的是牌桌宽、cqh 量的是外面的 board。
export const MAHJONG_STYLE = MAHJONG_STYLE_SOURCE.replace(/(-?\d*\.?\d+)cqi\b/g, 'calc($1 * var(--igs-mj-u))')
    + `.igs-mj-table{--igs-mj-u:1cqi;}${FULL} .igs-mj-table{--igs-mj-u:min(1cqi,1cqh * 16 / 9);}`;

export function mahjongRule(extra = {}) {
    return Majiang.rule(Object.assign({
        '場数': 1,
        '最大同時和了数': 1,
    }, extra));
}

function listOf(value) {
    return Array.isArray(value) ? value : [];
}

function yakuZh(name) {
    const text = String(name || '');
    const wind = text.match(/^(場風|自風) (.)$/);
    if (wind) {
        const han = { '東': '东', '南': '南', '西': '西', '北': '北' };
        return `${wind[1] === '場風' ? '场风' : '自风'}${han[wind[2]] || wind[2]}`;
    }
    return YAKU_ZH[text] || text;
}

function faceOf(code) {
    const raw = String(code || '').replace(/[_*+=-]/g, '');
    const suit = raw[0];
    const n = raw[1];
    if (suit === 'z') return { text: HONOR[+n] || '牌', suit, red: false };
    const red = n === '0';
    const num = red ? '五' : (NUM[+n] || '');
    const kind = suit === 'm' ? '万' : (suit === 'p' ? '筒' : '索');
    return { text: `${num}${kind}`, suit, red };
}

function rongpai(player, data) {
    if (!data) return null;
    if (data.m && /^[mpsz]\d{4}$/.test(data.m)) return null;
    const dir = ['', '+', '=', '-'][(4 + player.model.lunban - player._menfeng) % 4];
    if (data.m) return data.m[0] + data.m.slice(-1) + dir;
    if (!data.p) return null;
    return data.p.slice(0, 2) + dir;
}

export function collectTurn(player, gangzimo) {
    const lizhi = player.allow_lizhi(player.shoupai);
    return {
        kind: 'turn',
        dapai: listOf(player.get_dapai(player.shoupai)),
        lizhi: Array.isArray(lizhi) ? lizhi : [],
        pass: false,
        replies: [
            player.allow_hule(player.shoupai, null, Boolean(gangzimo)) ? { label: '自摸', reply: { hule: '-' } } : null,
            player.allow_pingju(player.shoupai) ? { label: '九种九牌', reply: { daopai: '-' } } : null,
            ...listOf(player.get_gang_mianzi(player.shoupai)).map((m) => meldReply('杠', m, { gang: m })),
        ].filter(Boolean),
    };
}

export function collectDiscard(player) {
    const lizhi = player.allow_lizhi(player.shoupai);
    return {
        kind: 'discard',
        dapai: listOf(player.get_dapai(player.shoupai)),
        lizhi: Array.isArray(lizhi) ? lizhi : [],
        pass: false,
        replies: [],
    };
}

export function collectCall(player, data, robbed) {
    const tile = rongpai(player, data);
    if (!tile) return { kind: 'call', dapai: [], lizhi: [], pass: false, replies: [] };
    const replies = [];
    if (player.allow_hule(player.shoupai, tile, Boolean(robbed))) {
        replies.push({ label: robbed ? '抢杠' : '荣和', reply: { hule: '-' } });
    }
    if (!robbed) {
        // 别家打的牌只认 fulou：大明杠也是副露，gang 只在自己摸牌后（暗杠 / 加杠）才认，发错会被当成跳过。
        for (const m of listOf(player.get_gang_mianzi(player.shoupai, tile))) replies.push(meldReply('杠', m, { fulou: m }));
        for (const m of listOf(player.get_peng_mianzi(player.shoupai, tile))) replies.push(meldReply('碰', m, { fulou: m }));
        for (const m of listOf(player.get_chi_mianzi(player.shoupai, tile))) replies.push(meldReply('吃', m, { fulou: m }));
    }
    return { kind: 'call', dapai: [], lizhi: [], pass: replies.length > 0, replies };
}

function meldKind(m, prefix) {
    const body = String(m || '');
    if (/^[mpsz]\d{4}/.test(body)) return prefix === 'a' ? 'aMinkan' : 'mMinkan';
    const digits = body.replace(/[^0-9]/g, '').replace(/0/g, '5');
    if (digits.length >= 3 && digits[0] === digits[1] && digits[1] === digits[2]) return prefix === 'a' ? 'aPon' : 'mPon';
    return prefix === 'a' ? 'aChi' : 'mChi';
}

function stolenFrom(caller, m) {
    const mark = (String(m || '').match(/[+=-]/) || [])[0];
    if (!CALL_FROM[mark]) return -1;
    return (caller + CALL_FROM[mark]) % 4;
}

function passingClaim(player, msg, reply) {
    if (!player || !msg || !player.shoupai) return false;
    if (reply && (reply.dapai || reply.fulou || reply.gang || reply.hule || reply.daopai || reply.pass)) return false;
    if (msg.dapai && msg.dapai.l !== player._menfeng) return collectCall(player, msg.dapai, false).pass;
    if (msg.gang && msg.gang.l !== player._menfeng) return collectCall(player, msg.gang, true).pass;
    if (msg.dapai && msg.dapai.l === player._menfeng && typeof player.allow_no_daopai === 'function' && player.allow_no_daopai(player.shoupai)) return true;
    return false;
}

function meldReply(verb, m, reply) {
    return { label: `${verb} ${meldText(m)}`, verb, meld: m, reply };
}

function meldText(m) {
    return meldTiles(m).map((tile) => faceOf(tile.code).text).join('');
}

// 副露按来源横放：上家放左、对家放中、下家放右；暗杠两头扣着。
function meldLayout(m) {
    const tiles = [];
    let dir = '';
    const pattern = /(\d)([+=-]?)/g;
    let found;
    while ((found = pattern.exec(m.slice(1)))) {
        tiles.push({ code: m[0] + found[1], called: Boolean(found[2]) && !dir, back: false });
        if (found[2] && !dir) dir = found[2];
    }
    if (!dir) {
        if (tiles.length === 4) {
            tiles[0].back = true;
            tiles[3].back = true;
        }
        return tiles;
    }
    const [called] = tiles.splice(tiles.findIndex((tile) => tile.called), 1);
    tiles.splice(dir === '-' ? 0 : (dir === '=' ? 1 : tiles.length), 0, called);
    return tiles;
}

function meldTiles(m) {
    const suit = m[0];
    const tiles = [];
    const pattern = /(\d)([+=-])?/g;
    let found;
    while ((found = pattern.exec(m.slice(1)))) {
        tiles.push({ code: suit + found[1], called: Boolean(found[2]) });
    }
    return tiles;
}

function closedTiles(shoupai) {
    const bing = shoupai && shoupai._bingpai;
    if (!bing) return { tiles: [], zimo: null, backs: 0 };
    const suited = ['m', 'p', 's', 'z'].some((suit) => bing[suit].some((count) => count > 0));
    if (!suited) return { tiles: [], zimo: null, backs: bing._ || 13 };
    const tiles = [];
    for (const suit of ['m', 'p', 's', 'z']) {
        const row = bing[suit];
        const max = suit === 'z' ? 7 : 9;
        for (let n = 1; n <= max; n += 1) {
            let count = row[n] || 0;
            if (suit !== 'z' && n === 5) count -= row[0] || 0;
            for (let i = 0; i < count; i += 1) tiles.push(suit + n);
            if (suit !== 'z' && n === 5) {
                for (let i = 0; i < (row[0] || 0); i += 1) tiles.push(suit + '0');
            }
        }
    }
    const drawn = shoupai._zimo && shoupai._zimo.length === 2 ? shoupai._zimo.replace(/[_*]/g, '') : null;
    if (drawn) {
        const index = tiles.lastIndexOf(drawn);
        if (index >= 0) tiles.splice(index, 1);
    }
    return { tiles, zimo: drawn, backs: 0 };
}

function discardCode(code, offer, zimoSlot) {
    if (!offer || !offer.dapai.length) return null;
    const pool = offer.riichi ? offer.lizhi : offer.dapai;
    if (zimoSlot) {
        const drawn = pool.find((item) => item.replace(/_$/, '') === code && item.endsWith('_'));
        if (drawn) return offer.riichi ? `${drawn}*` : drawn;
    }
    const plain = pool.find((item) => item === code);
    if (!plain) return null;
    return offer.riichi ? `${plain}*` : plain;
}

class HumanPlayer extends Majiang.Player {
    constructor(table) {
        super();
        this.table = table;
    }

    finish(reply) {
        const callback = this._callback;
        this._callback = null;
        if (callback) callback(reply || {});
    }

    action_kaiju() { this.finish(); }
    action_qipai() { this.finish(); }
    action_hule() { this.table.pause(() => this.finish()); }
    action_pingju() { this.table.pause(() => this.finish()); }
    action_jieju(paipu) {
        this.table.summary(paipu);
        this.finish();
    }

    action_zimo(zimo, gangzimo) {
        if (zimo.l != this._menfeng) return this.finish();
        this.table.choose(this, collectTurn(this, gangzimo));
    }

    action_dapai(dapai) {
        if (dapai.l == this._menfeng) {
            if (this.allow_no_daopai(this.shoupai)) {
                this.table.choose(this, {
                    kind: 'tenpai',
                    dapai: [],
                    lizhi: [],
                    pass: true,
                    replies: [{ label: '报听', reply: { daopai: '-' } }],
                });
            } else this.finish();
            return;
        }
        const offer = collectCall(this, dapai, false);
        if (!offer.replies.length) return this.finish();
        this.table.choose(this, offer);
    }

    action_fulou(fulou) {
        if (fulou.l != this._menfeng || /^[mpsz]\d{4}/.test(fulou.m)) return this.finish();
        this.table.choose(this, collectDiscard(this));
    }

    action_gang(gang) {
        if (gang.l == this._menfeng) return this.finish();
        const offer = collectCall(this, gang, true);
        if (!offer.replies.length) return this.finish();
        this.table.choose(this, offer);
    }
}

function defaultDecide(offer) {
    if (offer.dapai && offer.dapai.length) return { dapai: offer.dapai[offer.dapai.length - 1] };
    return {};
}

export function playMahjongSync(options = {}) {
    const decide = options.decide || defaultDecide;
    const table = {
        choose(player, offer) { player.finish(decide(player, offer)); },
        pause(done) { done(); },
        summary() {},
        closed: false,
    };
    const human = new HumanPlayer(table);
    // options.opponents：三位对手的打法；不给就是原版引擎。
    const rivals = Array.isArray(options.opponents)
        ? options.opponents.slice(0, 3).map((persona) => new MindfulAI(persona, { think: false, random: options.random }))
        : [new AI(), new AI(), new AI()];
    const game = new Majiang.Game(
        [human, ...rivals],
        () => {},
        mahjongRule(options.rule),
        '立直麻将',
    );
    game._model.player = ['你', '电脑一', '电脑二', '电脑三'];
    game.do_sync();
    return game._paipu;
}

const MAHJONG_SAVE_KEY = 'igs-wait-mahjong-v1';
const MEMORY_KEY = '__IGS_MAHJONG_MATCH__';
let liveMatch = null;

export function listMahjongCast(model) {
    const found = new Map();
    const art = model && model.art || {};
    const add = (name, url, faces, extra) => {
        const key = String(name || '').trim();
        if (!key) return;
        const current = found.get(key);
        const picture = String(url || '');
        if (!current) found.set(key, { name: key, url: picture, ...(faces && { faces }), ...extra });
        else if (!current.url && picture) current.url = picture;
    };
    for (const person of (model && model.cast) || []) {
        const faces = person && person.faces;
        add(person && person.name, faces && faces['平和'] && faces['平和'].url, faces || null, {
            ...(person && person.outfit && { outfit: person.outfit }),
            ...(person && Array.isArray(person.wardrobe) && person.wardrobe.length > 1 && { wardrobe: person.wardrobe }),
            ...(person && person.nude && { nudeFaces: person.nude }),
        });
    }
    for (const sprite of art.sprites || []) add(sprite.character, sprite.url);
    for (const picture of art.pictures || []) add(picture.character, picture.url);
    for (const name of (model && model.names) || []) add(name, '');
    return [...found.values()];
}

// 换上指定那套衣装；没有这套就照旧。
export function dressMahjongPerson(person, outfit) {
    if (!person || !outfit || !Array.isArray(person.wardrobe)) return person;
    const look = person.wardrobe.find((item) => item.outfit === outfit);
    if (!look) return person;
    const calm = look.faces && look.faces['平和'];
    return { ...person, outfit, faces: look.faces, url: (calm && calm.url) || person.url };
}

function facesKey(faces) {
    return faces ? Object.keys(faces).sort().map((mood) => `${mood}=${(faces[mood] && faces[mood].url) || ''}`).join('\n') : '';
}

function shownKey(person) {
    const face = faceFor(person, '平和');
    return face ? `${face.url}\n${JSON.stringify(face.head || null)}` : '';
}

// 图库里的立绘读回来后，按名字换成新模型里的那份：衣装照旧。
function freshPerson(person, list) {
    const found = person && list.find((item) => item.name === person.name);
    if (!found) return person;
    return dressMahjongPerson(found, person.outfit) || found;
}

function nextOutfit(person, step) {
    const list = (person && person.wardrobe) || [];
    const index = list.findIndex((item) => item.outfit === person.outfit);
    return list.length ? list[(index + step + list.length) % list.length].outfit : '';
}

function memoryRoot() {
    return globalThis;
}

function remember(match) {
    liveMatch = match;
    try { memoryRoot()[MEMORY_KEY] = match; } catch (error) { /* 页面不允许挂全局时只留模块内这一局。 */ }
}

export function forgetMahjongTable() {
    if (liveMatch) {
        liveMatch.generation = -1;
        clearInterval(liveMatch.watch);
    }
    liveMatch = null;
    try { delete memoryRoot()[MEMORY_KEY]; } catch (error) { /* 没有全局对象时忽略。 */ }
}

function bucket(ctx) {
    if (ctx && ctx.storage) return ctx.storage;
    try { return memoryRoot().localStorage || null; } catch (error) { return null; }
}

// 打法表跨选人和牌桌共用一份；换了存储（测试、换页）就重开。宿主的世界书 / 副 API 接口每次开局换成最新的。
let sharedPersonas = null;
let sharedPersonaStorage = null;
export function personaStoreFor(ctx) {
    const storage = bucket(ctx);
    if (!sharedPersonas || sharedPersonaStorage !== storage) {
        sharedPersonas = createPersonaStore({ storage, service: (ctx && ctx.persona) || null });
        sharedPersonaStorage = storage;
    } else sharedPersonas.setService((ctx && ctx.persona) || null);
    return sharedPersonas;
}

// 点一下换下一种打法；转回世界书配的那种就是不再手选。
function nextStyle(personas, name) {
    const base = personas.baseStyle(name);
    const current = personas.userStyle(name) || base;
    const next = STYLE_IDS[(STYLE_IDS.indexOf(current) + 1) % STYLE_IDS.length];
    return next === base ? '' : next;
}

function readSave(storage) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
        const text = storage.getItem(MAHJONG_SAVE_KEY);
        return text ? JSON.parse(text) : null;
    } catch (error) {
        return null;
    }
}

function writeSave(storage, data) {
    if (!storage || typeof storage.setItem !== 'function') return;
    try { storage.setItem(MAHJONG_SAVE_KEY, JSON.stringify(data)); } catch (error) { /* 存满了就只留在这一页。 */ }
}

function clearSave(storage) {
    if (!storage || typeof storage.removeItem !== 'function') return;
    try { storage.removeItem(MAHJONG_SAVE_KEY); } catch (error) { /* 清不掉也不影响这一页。 */ }
}

// 受罚的人：分数最低的并列都算；busted 时分数为负（被飞）的也都算；losing 时最低分必须是负的（这一局真丢了分）。
// 四家同分就没人受罚。rows 为 [{ id, score }]：终局传总分，每局传这一局的得失。
export function penaltyLosers(rows, { busted = false, losing = false } = {}) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length < 2) return [];
    const scores = list.map((row) => row.score);
    const low = Math.min(...scores);
    if (low === Math.max(...scores) || (losing && low >= 0)) return [];
    return list.filter((row) => row.score === low || (busted && row.score < 0)).map((row) => row.id);
}

// targets 里的「你」是玩家：玩家受罚时由第一名动手，玩家只以第一人称入镜；同罚的角色一起画进去。
export function penaltyBrief({ targets, target, punisher, request, nsfw = false, stage = 'hand', outfits = {}, rules = 'riichi', scene = '', present = null, basis = '' }) {
    const line = scene || (rules === 'chengdu'
        ? '一场成都麻将血战到底刚刚打完'
        : (stage === 'final' ? '一场东风战立直麻将刚刚结束' : '立直麻将的一局刚刚打完'));
    return pictureBrief({
        targets, target, punisher, request, nsfw, stage, outfits, present, scene: line,
        basis: basis || (rules === 'chengdu' ? 'negative' : ''),
    });
}

function restoreHe(pai) {
    const he = new Majiang.He();
    he._pai = pai.slice();
    for (const tile of pai) {
        const raw = String(tile).replace(/[_*+=-]/g, '');
        if (raw) he._find[raw[0] + (+raw[1] || 5)] = true;
    }
    return he;
}

function restoreShan(rule, snap) {
    const shan = new Majiang.Shan(rule);
    shan._pai = snap.pai.slice();
    shan._baopai = snap.baopai.slice();
    shan._fubaopai = snap.fubaopai ? snap.fubaopai.slice() : null;
    shan._weikaigang = Boolean(snap.weikaigang);
    shan._closed = Boolean(snap.closed);
    return shan;
}

function snapshotGame(game) {
    const model = game._model;
    const shan = model.shan;
    return {
        rule: game._rule,
        status: game._status || '',
        reply: (game._reply || []).map((item) => item || null),
        maxJushu: game._max_jushu,
        speed: game._speed,
        diyizimo: game._diyizimo,
        fengpai: game._fengpai,
        dapai: game._dapai,
        gang: game._gang,
        lizhi: (game._lizhi || []).slice(),
        yifa: (game._yifa || []).slice(),
        nGang: (game._n_gang || []).slice(),
        nengRong: (game._neng_rong || []).slice(),
        hule: (game._hule || []).slice(),
        huleOption: game._hule_option,
        noGame: game._no_game,
        lianzhuang: game._lianzhuang,
        changbang: game._changbang,
        fenpei: game._fenpei,
        paipu: game._paipu,
        model: {
            title: model.title,
            player: (model.player || []).slice(),
            qijia: model.qijia,
            zhuangfeng: model.zhuangfeng,
            jushu: model.jushu,
            changbang: model.changbang,
            lizhibang: model.lizhibang,
            defen: (model.defen || []).slice(),
            player_id: (model.player_id || []).slice(),
            lunban: model.lunban,
            shoupai: (model.shoupai || []).map((item) => item && item.toString ? item.toString() : ''),
            he: (model.he || []).map((item) => (item && item._pai ? item._pai.slice() : [])),
            shan: shan && shan._pai ? {
                pai: shan._pai.slice(),
                baopai: shan._baopai.slice(),
                fubaopai: shan._fubaopai ? shan._fubaopai.slice() : null,
                weikaigang: shan._weikaigang,
                closed: shan._closed,
            } : null,
        },
    };
}

function applyGameSnapshot(game, snap) {
    const model = snap.model;
    game._rule = snap.rule;
    game._status = snap.status;
    game._reply = (snap.reply || []).map((item) => item || undefined);
    game._max_jushu = snap.maxJushu;
    game._speed = snap.speed || 1;
    game._dwell = game._speed * 200;
    game._diyizimo = snap.diyizimo;
    game._fengpai = snap.fengpai;
    game._dapai = snap.dapai;
    game._gang = snap.gang;
    game._lizhi = (snap.lizhi || []).slice();
    game._yifa = (snap.yifa || []).slice();
    game._n_gang = (snap.nGang || []).slice();
    game._neng_rong = (snap.nengRong || []).slice();
    game._hule = (snap.hule || []).slice();
    game._hule_option = snap.huleOption;
    game._no_game = snap.noGame;
    game._lianzhuang = snap.lianzhuang;
    game._changbang = snap.changbang;
    game._fenpei = snap.fenpei;
    game._paipu = snap.paipu;
    game._model.title = model.title;
    game._model.player = model.player.slice();
    game._model.qijia = model.qijia;
    game._model.zhuangfeng = model.zhuangfeng;
    game._model.jushu = model.jushu;
    game._model.changbang = model.changbang;
    game._model.lizhibang = model.lizhibang;
    game._model.defen = model.defen.slice();
    game._model.player_id = model.player_id.slice();
    game._model.lunban = model.lunban;
    game._model.shoupai = model.shoupai.map((text) => Majiang.Shoupai.fromString(text || ''));
    game._model.he = model.he.map((pai) => restoreHe(pai));
    game._model.shan = model.shan ? restoreShan(snap.rule, model.shan) : null;
}

function storedCast(cast) {
    return (cast || []).map((item) => ({
        name: item.name,
        url: item.url && item.url.length < 2000 ? item.url : '',
        ...(item.outfit && { outfit: item.outfit }),
    }));
}

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function button(doc, className, text) {
    const node = el(doc, 'button', className, text);
    node.type = 'button';
    return node;
}

function playerId(model, seat) {
    return model && model.player_id ? model.player_id[seat] : seat;
}

// options.nude：上一场被成人向惩罚的角色，这一场换裸体立绘；没有裸体立绘就照旧用默认那套。
export function openMahjongView(ctx) {
    return createMahjongTable(ctx, {
        el, button, tileNode, liveFace, iconTool, toolBar, hostTools, labelTool,
        createMahjongFelt, createMahjongSound, ICONS, BAR_ICONS,
        faceSvg: tileSvg,
        storage: bucket,
    });
}

function openMahjongTable(ctx, seats, revived, options = {}) {
    const { doc, board } = ctx;
    if (!doc || !board) return null;
    const view = openMahjongView(ctx);
    if (!view) return null;
    const bare = new Set((revived ? revived.nude : options.nude) || []);
    const cast = seats.map((person) => (bare.has(person.name) && person.nudeFaces ? { ...person, faces: person.nudeFaces } : person));
    const stripped = new Set();
    const { root, table, scene, felt, sceneTop, actions, end, close, leave, banner, crowd } = view;
    let host = ctx;
    const names = cast.map((item) => item.name);
    const feed = revived && revived.feed ? revived.feed.slice() : [];
    const match = {
        generation: 1,
        finished: false,
        cast,
        feed,
        root,
        game: null,
        reattach(next) {
            const nextBoard = next && next.board;
            if (!nextBoard || match.generation < 0) return;
            host = next;
            view.attach(next);
            match.parked = false;
            watchModel(next, true);
            armWatch();
            paint();
        },
    };

    const session = {
        closed: false,
        offer: null,
        pending: null,
        wait: null,
        player: null,
        last: null,
        foot: null,
        replaying: false,
    };
    const human = new HumanPlayer({
        choose(player, offer) { choose(player, offer); },
        pause(done) { pause(done); },
        summary(paipu) { showSummary(paipu); },
    });
    const personas = personaStoreFor(ctx);
    const rivals = [1, 2, 3].map((id) => new MindfulAI(personas.get(cast[id] && cast[id].name), { random: Math.random }));
    const game = new Majiang.Game(
        [human, ...rivals],
        () => {},
        mahjongRule(),
        '立直麻将',
    );
    game.speed = 1;
    game._model.player = names.slice();
    match.game = game;
    remember(match);
    const offPersonas = personas.subscribe(() => {
        if (match.generation < 0) return offPersonas();
        rivals.forEach((ai, index) => ai.setPersona(personas.get(cast[index + 1] && cast[index + 1].name)));
    });
    // 头像就地换成新读回的立绘：衣装照旧，受罚的人照旧用裸体那套。头像闭包拿的是 cast 里同一个对象。
    function refreshCast(model) {
        const fresh = listMahjongCast(model);
        let changed = false;
        for (let id = 1; id < cast.length; id += 1) {
            const person = cast[id];
            const next = freshPerson(person, fresh);
            if (!person || next === person) continue;
            const faces = bare.has(person.name) && next.nudeFaces ? next.nudeFaces : next.faces;
            if (!faces || facesKey(faces) === facesKey(person.faces)) continue;
            Object.assign(person, {
                faces,
                url: (faces['平和'] && faces['平和'].url) || next.url || person.url,
                ...(next.nudeFaces && { nudeFaces: next.nudeFaces }),
                ...(next.wardrobe && { wardrobe: next.wardrobe }),
            });
            changed = true;
        }
        if (changed && human.model) paintHeads();
    }
    let offModel = () => {};
    function watchModel(next, catchUp) {
        offModel();
        offModel = next && typeof next.onModel === 'function'
            ? next.onModel((model) => (match.generation < 0 ? offModel() : refreshCast(model)))
            : () => {};
        if (catchUp && next && typeof next.getModel === 'function' && next.getModel()) refreshCast(next.getModel());
    }
    watchModel(ctx, false);
    // 对手想一会儿再出牌；回调晚到时牌局可能已经结束。
    function thinkReply(player, callback) {
        return (reply) => {
            const go = () => {
                if (match.generation > 0) callback(reply);
            };
            const wait = typeof player.thinkDelay === 'function' ? player.thinkDelay(reply) : 0;
            if (!wait) return go();
            setTimeout(go, wait);
            return undefined;
        };
    }
    for (let id = 0; id < 4; id += 1) {
        const player = game._players[id];
        const play = player.action.bind(player);
        player.action = (msg, callback) => {
            if (match.generation > 0) feed.push({ id, msg: JSON.parse(JSON.stringify(msg)) });
            return play(msg, id && callback ? thinkReply(player, callback) : callback);
        };
    }
    human.view = {
        kaiju() { paint(); },
        redraw() {
            session.last = null;
            clearBanner();
            paint();
            openingLine();
        },
        update(msg) {
            session.last = msg || null;
            react(msg);
            paint();
            speak(msg);
            if (msg && msg.hule) showHule(msg.hule);
            else if (msg && msg.pingju) showPingju(msg.pingju);
        },
        summary(paipu) { showSummary(paipu); },
    };

    function alive() {
        return match.generation > 0 && !session.closed;
    }

    const flashes = new Map();

    function react(msg) {
        const board = human.model;
        const self = Number.isInteger(human._menfeng) ? human._menfeng : 0;
        for (const { seat, mood, long } of mahjongReactions(msg, board, self)) {
            const id = playerId(board, seat);
            if (!id) continue;
            const hold = long ? RESULT_HOLD_MS + 2500 : MOOD_FLASH_MS;
            flashes.set(id, { mood, until: Date.now() + hold });
            setTimeout(() => {
                if (alive()) paintHeads();
            }, hold + 60);
        }
    }

    // 没有事件表情时看局面：别家立直或快流局而自己没听牌就紧张，牌型差到中盘就思考。
    function standingMood(seat) {
        const real = game._model;
        const hands = (real && real.shoupai) || [];
        const shoupai = hands[seat];
        if (!shoupai || shoupai.lizhi) return '平和';
        let shanten = 0;
        try {
            shanten = Majiang.Util.xiangting(shoupai);
        } catch (error) {
            return '平和';
        }
        const left = real.shan ? real.shan.paishu : 70;
        const threat = hands.some((hand, other) => other !== seat && hand && hand.lizhi);
        if (shanten > 0 && (threat || left <= 8)) return '紧张';
        if (shanten >= 3 && left <= 42) return '思考';
        return '平和';
    }

    function moodOf(id, seat) {
        const flash = flashes.get(id);
        if (flash && flash.until > Date.now()) return flash.mood;
        const ai = game._players[id];
        const inner = ai && ai.mind ? mindMood(ai.mind) : '';
        return inner || standingMood(seat);
    }

    // 台词：头像下冒气泡。和牌、放铳、立直、开局和终局一定开口；鸣牌、看别人立直这类闲话看她话多话少，
    // 同一个人刚说过就先不插嘴。玩家本人只喊宣言。
    const CHATTER_GAP_MS = 2600;
    const spoken = { hand: new Set(), last: new Map(), at: new Map(), greeted: false };
    // 跨局记账：谁上次胡了她（报仇），她连着放了几次铳。
    const ledger = { burnedBy: new Map(), streak: new Map() };
    let cardLines = [];
    let lastTile = '';

    function nameAt(seat) {
        const id = playerId(human.model, seat);
        if (id === 0) return '你';
        return (cast[id] && cast[id].name) || '';
    }

    function seatOfId(id) {
        for (let seat = 0; seat < 4; seat += 1) if (playerId(human.model, seat) === id) return seat;
        return -1;
    }

    function rivalSeats(...skip) {
        return [0, 1, 2, 3].filter((seat) => !skip.includes(seat) && playerId(human.model, seat) > 0);
    }

    function anyOf(list) {
        return list.length ? list[Math.floor(Math.random() * list.length) % list.length] : -1;
    }

    function flashLine(id, mood) {
        const prev = flashes.get(id);
        const until = Math.max(prev ? prev.until : 0, Date.now() + MOOD_FLASH_MS);
        flashes.set(id, { mood, until });
        setTimeout(() => {
            if (alive()) paintHeads();
        }, until - Date.now() + 60);
    }

    // keys 从具体到一般；chatter 不为 0 时是闲话，按她的 talk 掷一次；declare 是玩家这时喊的宣言。
    function voice(seat, keys, { slots = {}, chatter = 0, once = '', declare = '' } = {}) {
        if (session.replaying || !alive() || seat < 0) return null;
        const id = playerId(human.model, seat);
        if (!Number.isInteger(id) || id < 0) return null;
        if (once && spoken.hand.has(`${id}:${once}`)) return null;
        if (id === 0) {
            const text = declareLine('riichi', declare);
            if (!text) return null;
            headFor(0);
            view.say(0, text);
            return { id, name: '你', text, declared: true };
        }
        const person = cast[id];
        const who = (person && person.name) || '';
        const ai = game._players[id];
        const persona = (ai && ai.persona) || autoPersona(who);
        if (chatter) {
            if (Date.now() - (spoken.at.get(id) || 0) < CHATTER_GAP_MS) return null;
            if (!wantsToTalk(persona, chatter)) return null;
        }
        const line = voiceLine(persona, 'riichi', keys, { slots, avoid: spoken.last.get(id) || [] });
        if (!line) return null;
        spoken.last.set(id, [line.text, ...(spoken.last.get(id) || [])].slice(0, 4));
        spoken.at.set(id, Date.now());
        if (once) spoken.hand.add(`${id}:${once}`);
        flashLine(id, line.mood);
        const out = { id, name: who, text: line.text, key: line.key };
        cardLines.push(out);
        headFor(id);
        view.say(id, line.text);
        if (typeof host.onVoice === 'function') host.onVoice({ who, text: line.text, mood: line.mood, event: line.key });
        return out;
    }

    function tileName(code) {
        return code ? faceOf(code).text : '';
    }

    // 副露串里方向记号前面那一位是叫来的牌；暗杠、加杠取最后一位。
    function calledTile(m) {
        const body = String(m || '');
        const hit = body.match(/(\d)[+=-]/);
        return body[0] + (hit ? hit[1] : body.slice(-1));
    }

    function ranks(scores) {
        return scores.map((score, seat) => rankOf(scores, seat));
    }

    function speakHule(hule) {
        const board = human.model;
        if (!board) return;
        const winId = playerId(board, hule.l);
        const ron = hule.baojia != null;
        const loserId = ron ? playerId(board, hule.baojia) : -1;
        const before = [0, 1, 2, 3].map((seat) => Number(board.defen[playerId(board, seat)]) || 0);
        const after = before.map((score, seat) => score + ((hule.fenpei && hule.fenpei[seat]) || 0));
        const was = ranks(before)[hule.l];
        const now = ranks(after)[hule.l];
        const late = readSituation(board, hule.l).late;
        const ai = game._players[winId];
        const hand = board.shoupai && board.shoupai[hule.l];
        const dama = Boolean(ai && ai.damaHand && !(hand && hand.lizhi));
        const keys = riichiWinKeys(hule, {
            dama,
            comeback: was >= 3 && now < was && (late >= 0.66 || was === 4 || now === 1),
            revenge: ron && ledger.burnedBy.get(winId) === loserId,
        });
        const points = Number(hule.defen) || 0;
        const tile = ron ? tileName(lastTile) : '';
        voice(hule.l, keys, { slots: { 点: points, 牌: tile, 对方: ron ? nameAt(hule.baojia) : '' }, declare: ron ? 'win.ron' : 'win.tsumo' });
        const big = points >= 8000 || Boolean(hule.damanguan);
        let payer = -1;
        if (ron) {
            const lose = [];
            if (big) lose.push('dealIn.big');
            if (dama) lose.push('dealIn.dama');
            if ((ledger.streak.get(loserId) || 0) >= 1) lose.push('dealIn.again');
            lose.push('dealIn');
            voice(hule.baojia, lose, { slots: { 对方: nameAt(hule.l), 牌: tile, 点: points } });
        } else if (big) {
            const payers = rivalSeats(hule.l);
            payer = payers.includes(0) ? 0 : anyOf(payers);
            voice(payer, ['tsumoed'], { slots: { 对方: nameAt(hule.l), 点: points }, chatter: 1.3 });
        }
        if (big) voice(anyOf(rivalSeats(hule.l, ron ? hule.baojia : payer)), ['react.big'], { slots: { 对方: nameAt(hule.l), 点: points }, chatter: 1.1 });
        if (ron) {
            ledger.burnedBy.set(loserId, winId);
            ledger.streak.set(loserId, (ledger.streak.get(loserId) || 0) + 1);
        }
        ledger.streak.set(winId, 0);
    }

    function speakPingju(pingju) {
        const name = pingju.name || '荒牌平局';
        const hands = listOf(pingju.shoupai);
        if (name === '荒牌平局') {
            voice(anyOf(rivalSeats().filter((seat) => hands[seat])), ['draw.tenpai']);
            voice(anyOf(rivalSeats().filter((seat) => !hands[seat])), ['draw.noten']);
            return;
        }
        if (name === '流し満貫') {
            const fenpei = listOf(pingju.fenpei);
            const best = fenpei.indexOf(Math.max(...fenpei.map((n) => Number(n) || 0)));
            voice(best, ['draw.nagashi']);
            return;
        }
        let seat = anyOf(rivalSeats());
        if (name === '九種九牌') {
            const who = hands.findIndex(Boolean);
            if (who >= 0) seat = who;
        }
        voice(seat, ['draw.abort']);
    }

    function speak(msg) {
        if (!msg || session.replaying) return;
        cardLines = [];
        const board = human.model;
        if (msg.dapai) {
            const seat = msg.dapai.l;
            const id = playerId(board, seat);
            const ai = Number.isInteger(id) ? game._players[id] : null;
            const intent = ai && typeof ai.takeIntent === 'function' ? ai.takeIntent() : '';
            const shown = String(msg.dapai.p || '');
            lastTile = shown.slice(0, 2);
            const riichiers = ((board && board.shoupai) || []).map((hand, other) => (other !== seat && hand && hand.lizhi ? other : -1)).filter((other) => other >= 0);
            if (/\*$/.test(shown)) {
                const where = readSituation(board, seat);
                const keys = [];
                if (intent === 'chase' || riichiers.length) keys.push('riichi.chase');
                if ((where.rank === 4 && where.late >= 0.66) || (where.allLast && where.rank >= 3 && where.gapUp > 8000)) keys.push('riichi.allin');
                keys.push('riichi');
                voice(seat, keys, { slots: { 对方: riichiers.length ? nameAt(riichiers[0]) : '' }, declare: 'riichi' });
                const calm = rivalSeats(seat).filter((other) => !(board.shoupai[other] && board.shoupai[other].lizhi));
                voice(anyOf(calm), ['threat'], { slots: { 对方: nameAt(seat) }, chatter: 0.9 });
            } else if (intent === 'fold') voice(seat, ['fold'], { once: 'fold', chatter: 1.5 });
            else if (intent === 'push') voice(seat, ['push'], { once: 'push', chatter: 1.4, slots: { 对方: riichiers.length ? nameAt(riichiers[0]) : '' } });
        } else if (msg.fulou) {
            const kind = meldKind(msg.fulou.m, 'm');
            const from = stolenFrom(msg.fulou.l, msg.fulou.m);
            const tile = tileName(calledTile(msg.fulou.m));
            const slots = { 对方: from >= 0 ? nameAt(from) : '', 牌: tile };
            if (kind === 'mMinkan') voice(msg.fulou.l, ['kan'], { slots, chatter: 1.1, declare: 'kan' });
            else voice(msg.fulou.l, ['call'], { slots, chatter: 0.8, declare: kind === 'mChi' ? 'chi' : 'pon' });
            if (from >= 0) voice(from, ['stolen'], { slots: { 对方: nameAt(msg.fulou.l), 牌: tile }, chatter: 0.45 });
        } else if (msg.gang) {
            voice(msg.gang.l, ['kan'], { slots: { 牌: tileName(calledTile(msg.gang.m)) }, chatter: 1.1, declare: 'kan' });
        } else if (msg.hule) speakHule(msg.hule);
        else if (msg.pingju) speakPingju(msg.pingju);
    }

    // 开局一句：第一局打招呼；之后是上一手被打急了、吓到了，或者最后一局领先 / 垫底的那个人。
    function openingLine() {
        spoken.hand.clear();
        if (session.replaying || !alive()) return;
        const board = human.model;
        if (!board) return;
        const options = [];
        for (const seat of rivalSeats()) {
            const ai = game._players[playerId(board, seat)];
            if (!ai || !ai.mind) continue;
            const inner = mindMood(ai.mind);
            const where = readSituation(board, seat);
            if (inner === '愤怒') options.push([seat, 'open.tilt']);
            else if (inner === '紧张') options.push([seat, 'open.shrink']);
            else if (where.allLast && where.rank === 1 && where.gapDown >= 8000) options.push([seat, 'open.lead']);
            else if (where.allLast && where.rank === 4) options.push([seat, 'open.behind']);
        }
        const first = !spoken.greeted && !(board.zhuangfeng || 0) && !(board.jushu || 0) && !(board.changbang || 0);
        if (first) {
            spoken.greeted = true;
            options.push([anyOf(rivalSeats()), 'open.first']);
        }
        if (!options.length) return;
        const [seat, key] = options[Math.floor(Math.random() * options.length) % options.length];
        setTimeout(() => voice(seat, [key], { slots: { 对方: '你' } }), 400);
    }

    // 结算卡上写这一手说过的话；玩家的宣言不写。
    function quoteBox() {
        const lines = cardLines.filter((line) => !line.declared);
        if (!lines.length) return null;
        const box = el(doc, 'div', 'igs-mj-card-quote');
        for (const line of lines) box.appendChild(el(doc, 'span', '', `${line.name}：「${line.text}」`));
        return box;
    }

    function huleQuotes() {
        if (session.replaying) return null;
        return quoteBox();
    }

    // 终局：第一名和最后一名各说一句，冲着对方说。
    function finalQuotes(paipu) {
        cardLines = [];
        if (session.replaying || !paipu) return null;
        const order = paipu.player.map((name, id) => id).sort((a, b) => (paipu.rank[a] || 0) - (paipu.rank[b] || 0));
        const top = order[0];
        const last = order[order.length - 1];
        const label = (id) => (id === 0 ? '你' : paipu.player[id]);
        if (top > 0) voice(seatOfId(top), ['final.top'], { slots: { 对方: label(last) } });
        if (last > 0 && last !== top) voice(seatOfId(last), ['final.last'], { slots: { 对方: label(top) } });
        return quoteBox();
    }

    function headFor(id) {
        const person = cast[id];
        const name = id === 0 ? '你' : ((person && person.name) || REL[id] || '');
        return view.ensureHead(id, person, name);
    }

    function paintHeads() {
        const model = human.model;
        const self = Number.isInteger(human._menfeng) ? human._menfeng : 0;
        for (const rel of [0, 1, 2, 3]) {
            const seat = (self + rel) % 4;
            const id = playerId(model, seat);
            headFor(id);
            view.renderHead(id, {
                place: PLACE[rel],
                turn: Boolean(model && model.lunban === seat),
                wind: WIND[seat],
                dealer: seat === 0,
                mood: id ? moodOf(id, seat) : '',
            });
        }
    }

    function persist() {
        if (match.generation < 0 || match.finished) return;
        writeSave(bucket(host), {
            version: 1,
            finished: false,
            cast: storedCast(cast),
            nude: [...bare],
            feed,
            waiting: session.pending ? 'choose' : (session.wait ? 'pause' : ''),
            pendingMsg: session.pendingMsg || null,
            game: snapshotGame(game),
        });
    }

    function park() {
        clearInterval(session.watch);
        match.parked = true;
        persist();
    }

    function finishMatch() {
        if (match.generation < 0) return;
        const ended = match.finished;
        match.generation = -1;
        match.finished = true;
        felt.destroy();
        offPersonas();
        offModel();
        clearInterval(session.watch);
        if (!ended) clearSave(bucket(host));
        if (liveMatch === match) forgetMahjongTable();
        try { game.stop(); } catch (error) { /* 牌局已经结束时不用再停。 */ }
        const pending = session.pending;
        const wait = session.wait;
        session.pending = null;
        session.wait = null;
        session.offer = null;
        if (pending) pending({});
        if (wait) wait();
    }

    close.addEventListener('click', () => {
        park();
        host.requestClose();
    });
    end.addEventListener('click', () => {
        finishMatch();
        host.requestClose();
    });

    function send(reply) {
        if (!session.pending) return;
        const pending = session.pending;
        const body = reply || {};
        session.pending = null;
        session.offer = null;
        paint();
        pending(body);
    }

    function choose(player, offer) {
        if (!alive()) return;
        session.player = player;
        session.offer = Object.assign({ riichi: false }, offer);
        session.pendingMsg = feed.filter((item) => item.id === player._id).pop();
        session.pendingMsg = session.pendingMsg && session.pendingMsg.msg || null;
        session.pending = (reply) => player.finish(reply);
        paint();
        setTimeout(persist, 0);
    }

    function pause(done) {
        if (!alive()) {
            done();
            return;
        }
        let sent = false;
        // 结算停在这里等玩家点「继续」，不替玩家往下走。
        const finish = () => {
            if (sent) return;
            sent = true;
            session.wait = null;
            done();
        };
        session.wait = finish;
        setTimeout(persist, 0);
        const next = button(doc, 'igs-ws-chip', '继续');
        next.addEventListener('click', finish);
        banner.hidden = false;
        (session.foot || banner).appendChild(next);
    }

    function clearBanner() {
        view.clearBanner();
        session.foot = null;
    }

    function openCard(kind, title) {
        const card = view.openCard(kind, title);
        session.foot = view.foot;
        return card;
    }

    function sealCard(card) {
        view.sealCard(card);
    }

    function seatName(seat) {
        const model = human.model;
        const self = Number.isInteger(human._menfeng) ? human._menfeng : 0;
        if (seat === self) return '你';
        const person = cast[playerId(model, seat)];
        return (person && person.name) || REL[(4 + seat - self) % 4];
    }

    function deltaRow(fenpei) {
        return view.deltas((fenpei || []).map((delta, seat) => {
            const id = playerId(human.model, seat);
            return { person: cast[id], name: seatName(seat), mood: id ? moodOf(id, seat) : '平和', delta };
        }));
    }

    function nameOf(id) {
        return id === 0 ? '你' : ((cast[id] && cast[id].name) || REL[id] || '');
    }

    // 这一局的得失，从赢得多到输得多；得失一样时按总分名次排。
    function handRows(fenpei) {
        const place = new Map(standings(fenpei).map((row, index) => [row.id, index]));
        return [0, 1, 2, 3].map((seat) => ({ id: playerId(human.model, seat), score: (fenpei && fenpei[seat]) || 0 }))
            .sort((a, b) => b.score - a.score || place.get(a.id) - place.get(b.id));
    }

    // 这一局打完后的名次：本局得失要到下一局开局才记进分数，这里先加上。
    function standings(fenpei) {
        const model = human.model;
        return [0, 1, 2, 3].map((seat) => {
            const id = playerId(model, seat);
            return { id, score: ((model && model.defen && model.defen[id]) || 0) + ((fenpei && fenpei[seat]) || 0) };
        }).sort((a, b) => b.score - a.score || a.id - b.id);
    }

    // 每局罚这一局输分最多的人（只能全年龄），由这一局赢分最多的人动手；终局罚总分末位和被飞的人（可选成人向），由第一名动手。
    // 输得一样多、并列垫底、一起被飞的都一起罚。rows 按分数从高到低，第一个是动手的人。
    function addPenalty(card, stage, rows) {
        const losers = penaltyLosers(rows, stage === 'final' ? { busted: true } : { losing: true });
        if (!losers.length) return;
        view.punish(card, {
            targets: losers.map(nameOf),
            punisher: nameOf(rows[0].id),
            present: [0, 1, 2, 3].map((seat) => nameOf(playerId(human.model, seat))).filter(Boolean),
            stage,
            scene: stage === 'final' ? '一场东风战立直麻将刚刚结束' : '立直麻将的一局刚刚打完',
            outfits: wornOutfits,
            onStrip(names) {
                for (const name of names) stripped.add(name);
                if (match.finished) saveRematch();
            },
            onDone(final) {
                if (final) refreshRematchNote();
                else if (session.wait) session.wait();
            },
        });
    }

    // 画面按每人眼下的样子：这一场换了裸体立绘的按裸体，其余按选的那套衣装。
    function wornOutfits() {
        return Object.fromEntries(cast.slice(1)
            .map((person) => [person && person.name, person && (bare.has(person.name) && person.nudeFaces ? '裸体' : person.outfit)])
            .filter(([name, outfit]) => name && outfit));
    }

    function showHule(hule) {
        const card = openCard('win', hule.baojia == null ? '自摸' : '荣和');
        const who = hule.baojia == null ? seatName(hule.l) : `${seatName(hule.l)} ← ${seatName(hule.baojia)}`;
        card.appendChild(el(doc, 'div', 'igs-mj-card-who', who));
        const quotes = huleQuotes();
        if (quotes) card.appendChild(quotes);
        const shoupai = Majiang.Shoupai.fromString(hule.shoupai || '');
        const closed = closedTiles(shoupai);
        card.appendChild(view.played({
            backs: closed.backs,
            tiles: closed.tiles,
            zimo: closed.zimo,
            melds: ((shoupai && shoupai._fulou) || []).map((m) => meldLayout(m).map((tile) => ({ code: tile.back ? 'back' : tile.code, back: tile.back, side: tile.called }))),
        }));
        const model = human.model;
        const dora = model && model.shan ? listOf(model.shan.baopai) : [];
        if (dora.length || listOf(hule.fubaopai).length) {
            const row = el(doc, 'div', 'igs-mj-card-dora');
            row.appendChild(el(doc, 'span', '', '宝牌'));
            for (const code of dora) row.appendChild(tileNode(doc, code));
            if (listOf(hule.fubaopai).length) {
                row.appendChild(el(doc, 'span', '', '里宝牌'));
                for (const code of hule.fubaopai) row.appendChild(tileNode(doc, code));
            }
            card.appendChild(row);
        }
        const yaku = el(doc, 'ul', 'igs-mj-card-yaku');
        for (const item of hule.hupai || []) {
            const li = el(doc, 'li');
            li.appendChild(el(doc, 'span', '', yakuZh(item.name)));
            li.appendChild(el(doc, 'b', '', fanText(item.fanshu)));
            yaku.appendChild(li);
        }
        card.appendChild(yaku);
        const total = el(doc, 'div', 'igs-mj-card-total');
        const detail = hule.damanguan ? '' : [hule.fu ? `${hule.fu}符` : '', hule.fanshu ? `${hule.fanshu}番` : ''].filter(Boolean).join(' ');
        if (detail) total.appendChild(el(doc, 'span', '', detail));
        const rank = scoreRank(hule);
        if (rank) total.appendChild(el(doc, 'em', '', rank));
        total.appendChild(el(doc, 'strong', '', `${hule.defen || 0}点`));
        card.appendChild(total);
        card.appendChild(deltaRow(hule.fenpei));
        addPenalty(card, 'hand', handRows(hule.fenpei));
        sealCard(card);
    }

    function showPingju(pingju) {
        const card = openCard('draw', '流局');
        card.appendChild(el(doc, 'div', 'igs-mj-card-who', PINGJU_ZH[pingju.name] || pingju.name || '流局'));
        const quotes = quoteBox();
        if (quotes) card.appendChild(quotes);
        const ready = listOf(pingju.shoupai).map((text, seat) => (text ? seatName(seat) : '')).filter(Boolean);
        if (pingju.name === '荒牌平局') {
            card.appendChild(el(doc, 'div', 'igs-mj-card-text', ready.length ? `听牌：${ready.join('、')}` : '四家都没听牌'));
        }
        if (listOf(pingju.fenpei).some((delta) => delta)) card.appendChild(deltaRow(pingju.fenpei));
        addPenalty(card, 'hand', handRows(pingju.fenpei));
        sealCard(card);
    }

    function showNote(text) {
        const card = openCard('note', '牌局');
        card.appendChild(el(doc, 'div', 'igs-mj-card-text', text));
        sealCard(card);
    }

    function showSummary(paipu) {
        if (!paipu) return;
        const card = openCard('end', '终局');
        const order = paipu.player.map((name, id) => id).sort((a, b) => (paipu.rank[a] || 0) - (paipu.rank[b] || 0));
        card.appendChild(view.rank(order.map((id) => {
            const place = paipu.rank[id] || 0;
            return {
                person: cast[id],
                name: id === 0 ? '你' : paipu.player[id],
                mood: place === 1 ? '喜悦' : (place === 4 ? '悲伤' : '平和'),
                place,
                score: paipu.defen[id],
            };
        })));
        view.announce(paipu.rank[0] === 1 ? 'top' : 'final');
        const quotes = finalQuotes(paipu);
        if (quotes) card.appendChild(quotes);
        session.rematchNote = el(doc, 'div', 'igs-mj-card-text');
        card.appendChild(session.rematchNote);
        match.finished = true;
        saveRematch();
        refreshRematchNote();
        addPenalty(card, 'final', order.map((id) => ({ id, score: paipu.defen[id] || 0 })));
        const leave = (next) => {
            match.generation = -1;
            felt.destroy();
            if (liveMatch === match) forgetMahjongTable();
            next();
        };
        const again = button(doc, 'igs-ws-chip', '再来一局');
        again.addEventListener('click', () => leave(() => openMahjongTable(host, seats, null, { nude: [...stripped] })));
        const swap = button(doc, 'igs-ws-chip', '换对手');
        swap.addEventListener('click', () => leave(() => startMahjong(host)));
        session.foot.appendChild(again);
        session.foot.appendChild(swap);
        session.album = view.album(banner, () => {
            card.hidden = true;
            return () => { card.hidden = false; };
        });
        if (session.album) session.foot.appendChild(session.album);
        sealCard(card);
    }

    // 终局后存下这一桌、各自的衣装和要换裸体的角色：「再来一局」直接用，离开后再开时选人界面按它预选。
    function saveRematch() {
        const rivals = seats.slice(1);
        writeSave(bucket(host), { version: 1, finished: true, rematch: {
            names: rivals.map((person) => person.name),
            outfits: Object.fromEntries(rivals.filter((person) => person.outfit).map((person) => [person.name, person.outfit])),
            nude: [...stripped],
        } });
    }

    function refreshRematchNote() {
        const note = session.rematchNote;
        if (!note) return;
        note.textContent = stripped.size ? `再来一局时${[...stripped].join('、')}换裸体立绘。` : '';
        note.hidden = !stripped.size;
        if (session.album && session.album.refresh) session.album.refresh();
    }

    function paint() {
        if (!alive()) return;
        const model = human.model;
        const self = Number.isInteger(human._menfeng) ? human._menfeng : 0;
        view.ensureFelt();
        view.quiet(Boolean(session.replaying || match.parked));
        view.show(feltScene(model, self));
        sceneTop.appendChild(doraNode(model));
        sceneTop.appendChild(selfNode(model, self));
        paintHeads();
        paintActions();
    }

    function feltScene(model, self) {
        const seats = [0, 1, 2, 3].map((rel) => {
            const seat = (self + rel) % 4;
            const id = playerId(model, seat);
            const shoupai = model && model.shoupai ? model.shoupai[seat] : null;
            const pai = (model && model.he && model.he[seat] && model.he[seat]._pai) || [];
            return {
                wind: WIND[seat],
                score: model && model.defen && Number.isFinite(model.defen[id]) ? model.defen[id] : '',
                dealer: seat === 0,
                turn: Boolean(model && model.lunban === seat),
                riichi: Boolean(shoupai && shoupai.lizhi),
                hand: closedTiles(shoupai),
                melds: ((shoupai && shoupai._fulou) || []).map((m) => meldLayout(m).map((tile) => ({ code: tile.back ? 'back' : tile.code, back: tile.back, side: tile.called }))),
                pond: pai.map((code) => ({ code, spent: /[+=-]/.test(code), side: /[*]/.test(code) })),
            };
        });
        const hu = session.last && session.last.hule;
        const win = hu ? {
            key: `${hu.l}:${hu.baojia}:${hu.defen}`,
            seat: (4 + hu.l - self) % 4,
            kind: hu.baojia == null ? 'zimo' : 'ron',
            from: hu.baojia == null ? -1 : (4 + hu.baojia - self) % 4,
        } : null;
        return {
            round: model && model.jushu != null ? `${WIND[model.zhuangfeng] || '东'}${model.jushu + 1}局` : '开局',
            left: model && model.shan ? model.shan.paishu : null,
            end: session.last && session.last.pingju ? 'drawgame' : '',
            wins: win ? [win] : [],
            seats,
        };
    }

    function doraNode(model) {
        const node = el(doc, 'div', 'igs-mj-dora');
        const tiles = el(doc, 'div', 'igs-mj-dora-tiles');
        const shown = model && model.shan ? listOf(model.shan.baopai) : [];
        for (let i = 0; i < 5; i += 1) tiles.appendChild(tileNode(doc, shown[i] || 'back'));
        node.appendChild(tiles);
        const sticks = el(doc, 'div', 'igs-mj-dora-sticks');
        for (const [kind, count] of [['is-1000', model && model.lizhibang], ['is-100', model && model.changbang]]) {
            const item = el(doc, 'span', 'igs-mj-count');
            item.appendChild(el(doc, 'i', `igs-mj-chip ${kind}`));
            item.appendChild(el(doc, 'b', '', `×${count || 0}`));
            sticks.appendChild(item);
        }
        node.appendChild(sticks);
        node.appendChild(el(doc, 'div', 'igs-mj-dora-title', '立直麻将 · 东风战'));
        return node;
    }

    function selfNode(model, self) {
        const shoupai = model && model.shoupai ? model.shoupai[self] : null;
        const hand = closedTiles(shoupai);
        const tiles = hand.tiles.map((code, index) => handEntry(code, false, index));
        if (hand.zimo) tiles.push(handEntry(hand.zimo, true, 'zimo'));
        const melds = ((shoupai && shoupai._fulou) || []).map((m) => meldLayout(m).map((tile) => ({
            code: tile.back ? 'back' : tile.code,
            back: tile.back,
            side: tile.called,
        })));
        return view.selfRail({
            live: Boolean(session.offer && session.offer.dapai.length),
            tiles,
            backs: hand.backs,
            melds,
        });
    }

    function handEntry(code, zimoSlot, key) {
        const reply = discardCode(code, session.offer, zimoSlot);
        return {
            code,
            button: Boolean(reply),
            zimo: zimoSlot,
            hot: Boolean(reply),
            key,
            onClick: reply ? () => send({ dapai: reply }) : null,
        };
    }

    function paintActions() {
        const offer = session.offer;
        const riichi = Boolean(offer && offer.riichi);
        view.keepActions(offer, riichi, (box) => {
            const rank = (item) => (item.reply.hule ? 3 : (item.reply.daopai ? 2 : 0));
            const replies = offer.replies.slice().sort((a, b) => rank(a) - rank(b));
            for (const item of replies.filter((entry) => rank(entry) === 0)) {
                box.appendChild(view.actButton(item.verb || item.label, 'is-call', item.meld ? meldTiles(item.meld).map((tile) => tile.code) : null, () => send(item.reply)));
            }
            if (offer.lizhi.length) {
                box.appendChild(view.actButton(offer.riichi ? '取消立直' : '立直', `is-riichi${offer.riichi ? ' is-on' : ''}`, null, () => {
                    if (!session.offer) return;
                    session.offer.riichi = !session.offer.riichi;
                    paint();
                }));
            }
            for (const item of replies.filter((entry) => rank(entry) > 0)) {
                box.appendChild(view.actButton(item.verb || item.label, item.reply.hule ? 'is-win' : 'is-misc', null, () => send(item.reply)));
            }
            if (offer.pass) box.appendChild(view.actButton('跳过', 'is-skip', null, () => send({})));
        }, Boolean(offer && offer.replies && offer.replies.length));
    }

    function redecide(player, msg) {
        if (msg.zimo) player.action_zimo(msg.zimo, false);
        else if (msg.gangzimo) player.action_zimo(msg.gangzimo, true);
        else if (msg.dapai) player.action_dapai(msg.dapai);
        else if (msg.fulou) player.action_fulou(msg.fulou);
        else if (msg.gang) player.action_gang(msg.gang);
        else if (player._callback) player._callback({});
    }

    function armWatch() {
        clearInterval(session.watch);
        clearInterval(match.watch);
        session.watch = setInterval(() => {
            if (!root.parentNode) {
                clearInterval(session.watch);
                match.parked = true;
                persist();
            }
        }, 1000);
        match.watch = session.watch;
    }

    paint();
    if (revived && revived.game) applyGameSnapshot(game, revived.game);
    else game.kaiju(0);

    if (revived && revived.feed) {
        const dummy = {
            choose(player) { player.finish({}); },
            pause(done) { done(); },
            summary() {},
        };
        const previous = human.table;
        human.table = dummy;
        session.replaying = true;
        for (const item of revived.feed) {
            Majiang.Player.prototype.action.call(game._players[item.id], item.msg, () => {});
        }
        session.replaying = false;
        human.table = previous;
        human._callback = (reply) => game.reply(human._id, reply);
        // 收起时对手可能还在想，回复没进存档：照它收到的最后一条消息再想一次。
        if (game._status) {
            for (let id = 1; id < 4; id += 1) {
                if (game._reply[id]) continue;
                const last = revived.feed.filter((item) => item.id === id && !item.msg.kaigang).pop();
                const player = game._players[id];
                if (!last) continue;
                player._callback = thinkReply(player, (reply) => game.reply(id, reply));
                redecide(player, last.msg);
            }
        }
        const msg = revived.pendingMsg;
        if (revived.waiting === 'choose' && msg) {
            redecide(human, msg);
        } else if (revived.waiting === 'pause') {
            showNote('这一局还在，点继续接着打。');
            pause(() => human.finish());
        } else {
            paint();
            if (game._status && game._reply.filter(Boolean).length === 4) game.start();
        }
    }
    armWatch();
    return game;
}

const RESULT_HOLD_MS = 6000;
const MOOD_FLASH_MS = 3200;
const CALL_FROM = { '+': 1, '=': 2, '-': 3 };

function rankOf(scores, seat) {
    return 1 + scores.filter((score, other) => other !== seat && score > scores[seat]).length;
}

function rankShifts(board, fenpei, out) {
    if (!board || !Array.isArray(board.defen) || !Array.isArray(fenpei)) return;
    const before = [0, 1, 2, 3].map((seat) => board.defen[playerId(board, seat)] || 0);
    const after = before.map((score, seat) => score + (fenpei[seat] || 0));
    for (let seat = 0; seat < 4; seat += 1) {
        if (out.some((item) => item.seat === seat)) continue;
        const was = rankOf(before, seat);
        const now = rankOf(after, seat);
        if (now === 4 && was < 4) out.push({ seat, mood: '悲伤', long: true });
        else if (now < was) out.push({ seat, mood: '喜悦', long: true });
    }
}

// 牌局消息 → 各座位的一过性表情；long 的要撑过结算卡。和牌消息到时点数还没入账，名次按 fenpei 现算。
export function mahjongReactions(msg, board, self) {
    const out = [];
    if (!msg) return out;
    if (msg.dapai) {
        if (/\*$/.test(String(msg.dapai.p || ''))) out.push({ seat: msg.dapai.l, mood: '喜悦' });
    } else if (msg.fulou) {
        const from = (String(msg.fulou.m || '').match(/[+=-]/) || [])[0];
        out.push({ seat: msg.fulou.l, mood: '喜悦' });
        if (from) out.push({ seat: (msg.fulou.l + CALL_FROM[from]) % 4, mood: '愤怒' });
    } else if (msg.gang) {
        out.push({ seat: msg.gang.l, mood: '喜悦' });
    } else if (msg.kaigang) {
        for (let seat = 0; seat < 4; seat += 1) if (!board || seat !== board.lunban) out.push({ seat, mood: '惊讶' });
    } else if (msg.hule) {
        const { l, baojia } = msg.hule;
        const big = (msg.hule.defen || 0) >= 8000;
        for (let seat = 0; seat < 4; seat += 1) {
            if (seat === l) out.push({ seat, mood: baojia != null && baojia === self ? '害羞' : '喜悦', long: true });
            else if (seat === baojia) out.push({ seat, mood: '悲伤', long: true });
            else if (big) out.push({ seat, mood: '惊讶', long: true });
        }
        rankShifts(board, msg.hule.fenpei, out);
    } else if (msg.pingju) {
        if (msg.pingju.name === '荒牌平局') {
            listOf(msg.pingju.shoupai).forEach((hand, seat) => out.push({ seat, mood: hand ? '喜悦' : '悲伤', long: true }));
        }
        rankShifts(board, msg.pingju.fenpei, out);
    }
    return out;
}

function fanText(fanshu) {
    if (typeof fanshu === 'string' && /^\*+$/.test(fanshu)) return fanshu.length > 1 ? `${fanshu.length}倍役满` : '役满';
    return `${fanshu}番`;
}

function scoreRank(hule) {
    if (hule.damanguan) return hule.damanguan > 1 ? `${hule.damanguan}倍役满` : '役满';
    const fan = hule.fanshu || 0;
    const fu = hule.fu || 0;
    if (fan >= 13) return '累计役满';
    if (fan >= 11) return '三倍满';
    if (fan >= 8) return '倍满';
    if (fan >= 6) return '跳满';
    if (fan >= 5 || fu * 2 ** (fan + 2) >= 2000) return '满贯';
    return '';
}

// 牌桌头像是竖框（与 .igs-mj-avatar 内框同比例），取到肩，头顶多留些给发饰。
const TABLE_SHAPE = { aspect: 0.79, reach: 0.62, headroom: 0.9 };

const FACE_SWITCH_MS = 1500;

// 牌桌头像常驻，不跟着每次重绘重建。换表情是硬切：新图读好当场顶上、旧图当场撤，不叠影也不透底；
// 只有第一张盖住首字时淡入。表情至多 1.5 秒换一次、只认最新的；同一表情换了图（图库读回、换装）当场换。
// 某个表情没标头部时借「平和」的标定裁，不退回半身裁法，脸才不会忽大忽小地跳。
// 同一套衣装的表情图尺寸相同，各自的头部标定却差几像素：同尺寸的图沿用第一张的取景框，换表情时脸不挪位。
export function liveFace(doc, person, name) {
    const node = el(doc, 'div', 'igs-mj-face');
    node.appendChild(el(doc, 'span', 'igs-mj-initial', String(name || '?').slice(0, 1)));
    let shown = '';
    let shownMood = '';
    let shownAt = 0;
    let wanted = '';
    let timer = 0;
    let seq = 0;
    let frame = null;
    const boxFor = (width, height, face) => {
        const calm = faceFor(person, '平和');
        const outfit = calm ? calm.url : '';
        if (frame && frame.outfit === outfit && frame.width === width && frame.height === height) return frame.box;
        const box = avatarCrop(width, height, face.head, TABLE_SHAPE.aspect, TABLE_SHAPE.reach, TABLE_SHAPE.headroom);
        frame = { outfit, width, height, box };
        return box;
    };
    const apply = (mood) => {
        const face = faceFor(person, mood);
        if (!face) return;
        const calm = faceFor(person, '平和');
        const head = face.head || (calm && calm.head) || null;
        const key = `${face.url}\n${JSON.stringify(head)}`;
        if (key === shown) return;
        shown = key;
        shownMood = mood;
        shownAt = Date.now();
        const token = ++seq;
        // 缓存里的图设地址当场就读好，回调早于 cropInto 返回，所以按 DOM 先后找旧图层。
        cropInto(doc, node, { ...face, head }, (ready) => {
            if (token !== seq) {
                ready.remove();
                return;
            }
            const olds = [];
            for (const old of node.querySelectorAll('.igs-mj-crop')) {
                if (old === ready) break;
                olds.push(old);
            }
            if (!olds.length) return;
            ready.className += ' is-swap';
            olds.forEach((old) => old.remove());
        }, { ...TABLE_SHAPE, boxFor });
    };
    return {
        node,
        show(mood) {
            node.setAttribute('data-mood', mood);
            wanted = mood;
            const wait = shownAt + FACE_SWITCH_MS - Date.now();
            if (!shown || mood === shownMood || wait <= 0) {
                clearTimeout(timer);
                timer = 0;
                apply(mood);
                return;
            }
            if (!timer) timer = setTimeout(() => { timer = 0; apply(wanted); }, wait);
        },
    };
}

const SEAT_LABELS = ['下家', '对家', '上家'];

const CARD_SHAPE = { aspect: 0.75, reach: 0.5 };

function pictureNode(doc, person, lazy, shape) {
    const pic = el(doc, 'span', 'igs-mj-pic');
    const face = person ? faceFor(person, '平和') : null;
    if (!face) {
        pic.textContent = person ? String(person.name).slice(0, 1) : '+';
        return pic;
    }
    pic.appendChild(el(doc, 'span', 'igs-mj-initial', String(person.name).slice(0, 1)));
    const load = () => cropInto(doc, pic, face, null, shape);
    if (lazy) lazy(pic, load);
    else load();
    return pic;
}

// 横向卡带：竖向滚轮转成横移，鼠标可以拖着滑，拖动后松手不算点选。
function reelControls(doc, reel) {
    reel.addEventListener('wheel', (event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        reel.scrollLeft += event.deltaY;
        event.preventDefault();
    }, { passive: false });
    let drag = null;
    let dragged = false;
    reel.addEventListener('pointerdown', (event) => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        drag = { x: event.clientX, left: reel.scrollLeft };
        dragged = false;
    });
    reel.addEventListener('pointermove', (event) => {
        if (!drag) return;
        const dx = event.clientX - drag.x;
        if (!dragged && Math.abs(dx) > 6) {
            dragged = true;
            reel.classList.add('is-dragging');
        }
        if (dragged) reel.scrollLeft = drag.left - dx;
    });
    const release = () => {
        drag = null;
        reel.classList.remove('is-dragging');
    };
    reel.addEventListener('pointerup', release);
    reel.addEventListener('pointerleave', release);
    reel.addEventListener('click', (event) => {
        if (!dragged) return;
        dragged = false;
        event.stopPropagation();
        event.preventDefault();
    }, true);
    const nav = (step, label, className) => {
        const node = button(doc, `igs-mj-reel-nav ${className}`, label);
        node.addEventListener('click', () => {
            const left = step * Math.max(120, reel.clientWidth * 0.8);
            if (typeof reel.scrollBy === 'function') reel.scrollBy({ left, behavior: 'smooth' });
            else reel.scrollLeft += left;
        });
        return node;
    };
    return [nav(-1, '‹', 'is-prev'), nav(1, '›', 'is-next')];
}

// 角色多时只给滚进视野的格子读图，其余先显示首字。
function lazyLoader(doc) {
    const View = doc.defaultView && doc.defaultView.IntersectionObserver;
    if (typeof View !== 'function') return null;
    const jobs = new Map();
    const observer = new View((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const job = jobs.get(entry.target);
            jobs.delete(entry.target);
            observer.unobserve(entry.target);
            if (job) job();
        }
    }, { rootMargin: '160px 0px' });
    return (node, job) => {
        jobs.set(node, job);
        observer.observe(node);
    };
}

const BAR_ICONS = {
    muted: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>',
    fold: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><polyline points="7 9 12 14 17 9"/><line x1="5" y1="19" x2="19" y2="19"/></svg>',
    read: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z"/><path d="M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z"/></svg>',
};

function iconTool(doc, glyph, title, run) {
    const node = button(doc, 'igs-mj-icon');
    node.innerHTML = glyph;
    labelTool(node, title);
    if (run) {
        node.addEventListener('click', (event) => {
            event.stopPropagation();
            run(node);
        });
    }
    return node;
}

function labelTool(node, title) {
    node.title = title;
    node.setAttribute('aria-label', title);
}

function toolBar(doc, className, groups) {
    const bar = el(doc, 'div', `igs-mj-bar ${className}`.trim());
    for (const group of groups) {
        const node = Array.isArray(group) ? el(doc, 'span', 'igs-mj-bar-group') : group;
        if (Array.isArray(group)) group.forEach((item) => node.appendChild(item));
        bar.appendChild(node);
    }
    return bar;
}

function hostTools(doc) {
    const group = el(doc, 'span', 'igs-mj-bar-group');
    const back = iconTool(doc, BAR_ICONS.read, '返回阅读', () => { if (host) host.back(); });
    const next = iconTool(doc, ICONS.lastPage, '加载下一楼', (node) => { if (host && !node.disabled) host.next(); });
    next.className += ' is-next';
    next.appendChild(el(doc, 'span', '', '下一楼'));
    group.appendChild(back);
    group.appendChild(next);
    let host = null;
    let off = () => {};
    const sync = (state) => {
        back.hidden = !state.back;
        if (state.back) labelTool(back, state.back);
        const caption = next.querySelector('span');
        if (caption) caption.textContent = state.nextText || '下一楼';
        labelTool(next, state.nextBusy ? 'CG 还在生成' : '加载下一楼');
        next.hidden = !state.next;
        next.disabled = Boolean(state.nextBusy);
        group.hidden = back.hidden && next.hidden;
    };
    return {
        group,
        bind(ctx) {
            off();
            host = ctx && ctx.host && typeof ctx.host.state === 'function' ? ctx.host : null;
            off = host && typeof host.onChange === 'function' ? host.onChange(sync) : () => {};
            sync(host ? host.state() : {});
        },
    };
}

function openMahjongPicker(ctx, cast, rematch) {
    const { doc, board } = ctx;
    board.innerHTML = '';
    const root = el(doc, 'div', 'igs-mj igs-mj-picker');
    const head = el(doc, 'div', 'igs-ws-board-head');
    const prior = rematch && Array.isArray(rematch.names) ? rematch.names : [];
    const priorOutfits = (rematch && rematch.outfits) || {};
    const picked = [0, 1, 2].map((index) => dressMahjongPerson(cast.find((person) => person.name === prior[index]), priorOutfits[prior[index]]) || null);
    const stripped = new Set(((rematch && rematch.nude) || []).filter((name) => picked.some((person) => person && person.name === name)));
    let mode = readMahjongMode(bucket(ctx));
    const title = el(doc, 'span', '', '麻将 · 选择对手');
    const riichiMode = button(doc, 'igs-mj-mode', '立直麻将');
    const scmjMode = button(doc, 'igs-mj-mode', '成都麻将');
    const markMode = () => {
        riichiMode.setAttribute('aria-pressed', String(mode !== 'scmj'));
        scmjMode.setAttribute('aria-pressed', String(mode === 'scmj'));
    };
    riichiMode.addEventListener('click', () => { mode = 'riichi'; writeMahjongMode(bucket(ctx), mode); markMode(); queueEnsure(); });
    scmjMode.addEventListener('click', () => { mode = 'scmj'; writeMahjongMode(bucket(ctx), mode); markMode(); queueEnsure(); });
    markMode();
    head.appendChild(title);
    head.appendChild(riichiMode);
    head.appendChild(scmjMode);
    const idleStatus = stripped.size
        ? `上一场受罚：${[...stripped].join('、')}这一场换裸体立绘。`
        : `从这张卡的 ${cast.length} 位角色里选三位，左右滑动查看。`;
    const status = el(doc, 'p', 'igs-ws-status', idleStatus);
    head.appendChild(status);
    const personas = personaStoreFor(ctx);
    // 选的人变了才去读世界书；等一会儿凑齐几个一起问，省得每点一个人发一次。
    let ensureTimer = 0;
    let ensuredFor = '';
    // 台词按牌桌分开写，切换立直 / 成都也要补问那一套。
    function queueEnsure() {
        const names = picked.filter(Boolean).map((person) => person.name);
        const rules = mode === 'scmj' ? 'chengdu' : 'riichi';
        const key = `${rules}\n${names.join('\n')}`;
        if (!names.length || key === ensuredFor) return;
        clearTimeout(ensureTimer);
        ensureTimer = setTimeout(() => {
            if (!root.parentNode) return;
            ensuredFor = key;
            void personas.ensure(names, { rules, cast: names });
        }, 1200);
    }
    const offPersonas = personas.subscribe(() => {
        if (!root.parentNode) return offPersonas();
        render();
    });
    const album = openMahjongAlbum(ctx, root, () => () => {});
    if (album) head.appendChild(album);
    const close = iconTool(doc, BAR_ICONS.fold, '收起小游戏', () => ctx.requestClose());
    close.className += ' igs-ws-close';
    const leave = hostTools(doc);
    leave.bind(ctx);
    head.appendChild(toolBar(doc, '', [[close], leave.group]));
    root.appendChild(head);
    const lineup = el(doc, 'div', 'igs-mj-lineup');
    const slots = el(doc, 'div', 'igs-mj-slots');
    const shelf = el(doc, 'div', 'igs-mj-reel-wrap');
    const list = el(doc, 'div', 'igs-mj-cast igs-mj-reel');
    const start = button(doc, 'igs-ws-chip igs-mj-go', '开始这局');
    start.disabled = true;
    const lazy = lazyLoader(doc);
    const items = [];
    const render = () => {
        slots.innerHTML = '';
        picked.forEach((person, index) => {
            const bareNow = Boolean(person && stripped.has(person.name));
            const slot = el(doc, 'div', `igs-mj-slot${person ? ' is-filled' : ''}`);
            const pick = button(doc, 'igs-mj-slot-pick');
            pick.appendChild(el(doc, 'span', 'igs-mj-seat-tag', bareNow ? `${SEAT_LABELS[index]} · 裸体` : SEAT_LABELS[index]));
            pick.appendChild(pictureNode(doc, bareNow && person.nudeFaces ? { ...person, faces: person.nudeFaces } : person));
            pick.appendChild(el(doc, 'span', 'igs-mj-slot-name', person ? person.name : '待选'));
            if (person) pick.title = '点一下换掉';
            pick.addEventListener('click', () => {
                picked[index] = null;
                render();
            });
            slot.appendChild(pick);
            // 衣装行每格都有，三格才对齐；有几套衣装才给箭头，这一场换裸体的人先不换。
            if (person) {
                const row = el(doc, 'div', 'igs-mj-outfit');
                const canShift = !bareNow && person.wardrobe && person.wardrobe.length > 1;
                const shift = (step) => {
                    picked[index] = dressMahjongPerson(person, nextOutfit(person, step));
                    render();
                };
                const prev = button(doc, 'igs-mj-outfit-step', '‹');
                const next = button(doc, 'igs-mj-outfit-step', '›');
                if (canShift) {
                    prev.title = '上一套衣装';
                    next.title = '下一套衣装';
                    prev.addEventListener('click', () => shift(-1));
                    next.addEventListener('click', () => shift(1));
                } else {
                    for (const step of [prev, next]) {
                        step.className += ' is-idle';
                        step.disabled = true;
                        step.setAttribute('aria-hidden', 'true');
                    }
                }
                row.appendChild(prev);
                row.appendChild(el(doc, 'span', 'igs-mj-outfit-name', bareNow ? '裸体' : person.outfit || '默认衣装'));
                row.appendChild(next);
                slot.appendChild(row);
            }
            if (person) slot.appendChild(styleChip(person.name));
            slots.appendChild(slot);
        });
        const rewriting = picked.some((person) => person && personas.state(person.name) === 'rewrite');
        const waiting = picked.some((person) => person && ['pending', 'none'].includes(personas.state(person.name)));
        const writing = picked.some((person) => person && personas.busy(person.name));
        if (rewriting && !stripped.size) status.textContent = '正在按世界书重新生成打法和台词…';
        else if (waiting && !stripped.size) status.textContent = '正在按角色卡世界书给对手配打法…';
        else if (writing && !stripped.size) status.textContent = '正在按世界书给对手写台词，可以先开局，写好了牌桌上就换成她们自己的话。';
        else status.textContent = idleStatus;
        for (const { person, item } of items) {
            const seat = picked.findIndex((entry) => entry && entry.name === person.name);
            item.className = `igs-mj-person${seat >= 0 ? ' is-on' : ''}`;
            item.setAttribute('data-seat', seat >= 0 ? SEAT_LABELS[seat] : '');
        }
        list.className = `igs-mj-cast igs-mj-reel${picked.every(Boolean) ? ' is-full' : ''}`;
        start.disabled = picked.filter(Boolean).length < Math.min(3, cast.length);
        queueEnsure();
    };
    // 打法标签：世界书配的直接写打法，手选 / 随机另外标出来；点一下换下一种。旁边的「重写」再问一次副 API。
    const STATE_TAG = { user: ' · 手选', auto: ' · 随机' };
    const CHIP_TEXT = { pending: '配打法中…', rewrite: '重写中…' };
    function styleChip(name) {
        const known = personas.state(name);
        const state = known === 'none' ? 'pending' : known;
        const persona = personas.get(name);
        const style = MAHJONG_STYLES[persona.style] || MAHJONG_STYLES.steady;
        const row = el(doc, 'div', 'igs-mj-mind');
        const chip = button(doc, `igs-mj-style is-${state}`, CHIP_TEXT[state] || style.label);
        // 打法名长了就折行，不截断；「· 手选」整块换到下一行。
        if (!CHIP_TEXT[state] && STATE_TAG[state]) chip.appendChild(el(doc, 'span', 'igs-mj-style-tag', STATE_TAG[state]));
        chip.title = [style.blurb, persona.summary, personas.note(name), '点一下换打法，转一圈回到世界书配的'].filter(Boolean).join('\n');
        chip.disabled = state === 'pending' || state === 'rewrite';
        chip.addEventListener('click', () => personas.setStyle(name, nextStyle(personas, name)));
        const rewrite = button(doc, 'igs-mj-rewrite', '重写');
        rewrite.title = '按世界书重新生成打法和当前这套台词。手选的打法会被换掉，另一套牌桌的台词留着。';
        rewrite.disabled = state === 'pending' || state === 'rewrite' || personas.busy(name);
        rewrite.addEventListener('click', () => {
            const names = picked.filter(Boolean).map((person) => person.name);
            void personas.refresh(name, { rules: mode === 'scmj' ? 'chengdu' : 'riichi', cast: names });
        });
        row.appendChild(chip);
        row.appendChild(rewrite);
        return row;
    }
    const paintCard = (entry) => {
        entry.item.innerHTML = '';
        entry.item.appendChild(pictureNode(doc, entry.person, lazy, CARD_SHAPE));
        entry.item.appendChild(el(doc, 'span', 'igs-mj-person-name', entry.person.name));
    };
    for (const person of cast) {
        const entry = { person, item: button(doc, 'igs-mj-person') };
        paintCard(entry);
        entry.item.title = person.name;
        entry.item.addEventListener('click', () => {
            const index = picked.findIndex((one) => one && one.name === entry.person.name);
            if (index >= 0) picked[index] = null;
            else {
                const empty = picked.findIndex((one) => !one);
                if (empty >= 0) picked[empty] = entry.person;
            }
            render();
        });
        items.push(entry);
        list.appendChild(entry.item);
    }
    // 开局时图库里没读回的立绘只有首字；读回一批就换上，只重画露脸变了的格子。
    const offModel = typeof ctx.onModel === 'function' ? ctx.onModel((model) => {
        if (!root.parentNode) return offModel();
        const fresh = listMahjongCast(model);
        for (const entry of items) {
            const next = freshPerson(entry.person, fresh);
            const repaint = shownKey(next) !== shownKey(entry.person);
            entry.person = next;
            if (repaint) paintCard(entry);
        }
        let changed = false;
        picked.forEach((person, index) => {
            if (!person) return;
            const next = freshPerson(person, fresh);
            if (shownKey(next) !== shownKey(person)) changed = true;
            picked[index] = next;
        });
        if (changed) render();
        return undefined;
    }) : () => {};
    start.addEventListener('click', () => {
        const rivals = [0, 1, 2].map((index) => picked[index] || { name: `路人${'甲乙丙'[index]}`, url: '' });
        const nude = [...stripped].filter((name) => rivals.some((person) => person.name === name));
        leave.bind(null);
        writeMahjongMode(bucket(ctx), mode);
        clearTimeout(ensureTimer);
        const seatedNames = picked.filter(Boolean).map((person) => person.name);
        if (seatedNames.length) void personas.ensure(seatedNames, { rules: mode === 'scmj' ? 'chengdu' : 'riichi', cast: seatedNames });
        const seated = [{ name: '你', url: '' }, ...rivals];
        if (mode === 'scmj') openScmjTable(ctx, seated, null, { present: true, nude, personas: personaStoreFor(ctx), onPicker: () => openMahjongPicker(ctx, listMahjongCast(ctx.model), null) });
        else openMahjongTable(ctx, seated, null, { nude });
    });
    render();
    lineup.appendChild(slots);
    const [prev, next] = reelControls(doc, list);
    shelf.appendChild(prev);
    shelf.appendChild(list);
    shelf.appendChild(next);
    root.appendChild(lineup);
    root.appendChild(shelf);
    root.appendChild(start);
    board.appendChild(root);
    ctx.setNote('');
    return null;
}

export function startMahjong(ctx) {
    if (!ctx || !ctx.doc || !ctx.board) return null;
    setMahjongImageLoader(ctx.loadImage);
    if (readMahjongMode(bucket(ctx)) === 'scmj') {
        const playing = scmjLiveMatch();
        if (playing && typeof playing.reattach === 'function') {
            playing.reattach(ctx);
            return playing;
        }
        const scmjSaved = readScmjSave(bucket(ctx));
        if (scmjSaved && !scmjSaved.finished && Array.isArray(scmjSaved.decisions)) {
            const cast = resolveCast(ctx.model, scmjSaved.cast);
            return openScmjTable(ctx, cast, scmjSaved, { present: true, personas: personaStoreFor(ctx), onPicker: () => openMahjongPicker(ctx, listMahjongCast(ctx.model), null) });
        }
    }
    const held = liveMatch && liveMatch.generation > 0 ? liveMatch : null;
    if (held && typeof held.reattach === 'function') {
        held.reattach(ctx);
        return held.game;
    }
    const saved = readSave(bucket(ctx));
    if (saved && !saved.finished && saved.game && Array.isArray(saved.feed)) {
        const cast = resolveCast(ctx.model, saved.cast);
        return openMahjongTable(ctx, cast, saved);
    }
    const cast = listMahjongCast(ctx.model);
    if (cast.length) return openMahjongPicker(ctx, cast, saved && saved.finished ? saved.rematch : null);
    return openMahjongTable(ctx, [
        { name: '你', url: '' },
        { name: '路人甲', url: '' },
        { name: '路人乙', url: '' },
        { name: '路人丙', url: '' },
    ]);
}

function resolveCast(model, saved) {
    const current = listMahjongCast(model);
    return (saved || []).map((item, index) => {
        if (index === 0) return { name: '你', url: '' };
        const found = dressMahjongPerson(current.find((person) => person.name === item.name), item.outfit);
        return { ...found, name: item.name, url: (found && found.url) || item.url || '' };
    });
}

// 牌面画在 60×80 的面上，牌身厚度和底色由 CSS 给，横放时只转这一层。
const SVG_NS = 'http://www.w3.org/2000/svg';
const INK = '#1c1b22';
const RED = '#cf1f2b';
const GREEN = '#15804a';
const BLUE = '#1f4e9e';
const IVORY = '#fffdf6';
const DEEP = { [RED]: '#8c1119', [GREEN]: '#0c5530', [BLUE]: '#13336d' };
const SERIF = '"Hiragino Mincho ProN","Yu Mincho","Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC","Noto Serif SC",serif';
const MAN_FACE = ['', '一', '二', '三', '四', '伍', '六', '七', '八', '九'];
const B = BLUE;
const G = GREEN;
const R = RED;
const PIN_PIPS = {
    2: [[30, 22, 11, G], [30, 58, 11, B]],
    3: [[15, 16, 9, B], [30, 40, 9, R], [45, 64, 9, G]],
    4: [[18, 22, 10, B], [42, 22, 10, G], [18, 58, 10, G], [42, 58, 10, B]],
    5: [[16, 16, 9, B], [44, 16, 9, G], [30, 40, 9, R], [16, 64, 9, G], [44, 64, 9, B]],
    6: [[18, 14, 8, G], [42, 14, 8, G], [18, 44, 8, R], [42, 44, 8, R], [18, 66, 8, R], [42, 66, 8, R]],
    7: [[13, 10, 6.6, G], [30, 17, 6.6, G], [47, 24, 6.6, G], [18, 46, 7.6, R], [42, 46, 7.6, R], [18, 66, 7.6, R], [42, 66, 7.6, R]],
    8: [[18, 11, 7.6, B], [42, 11, 7.6, B], [18, 30.5, 7.6, B], [42, 30.5, 7.6, B], [18, 49.5, 7.6, B], [42, 49.5, 7.6, B], [18, 69, 7.6, B], [42, 69, 7.6, B]],
    9: [[13, 15, 7.6, B], [30, 15, 7.6, B], [47, 15, 7.6, B], [13, 40, 7.6, R], [30, 40, 7.6, R], [47, 40, 7.6, R], [13, 65, 7.6, G], [30, 65, 7.6, G], [47, 65, 7.6, G]],
};
const SOU_STICKS = {
    2: [[30, 7, 31, G], [30, 42, 31, G]],
    3: [[30, 7, 31, G], [17, 42, 31, G], [43, 42, 31, G]],
    4: [[18, 7, 31, G], [42, 7, 31, G], [18, 42, 31, G], [42, 42, 31, G]],
    5: [[13, 7, 31, G], [47, 7, 31, G], [30, 24.5, 31, R], [13, 42, 31, G], [47, 42, 31, G]],
    6: [[14, 7, 31, G], [30, 7, 31, G], [46, 7, 31, G], [14, 42, 31, G], [30, 42, 31, G], [46, 42, 31, G]],
    7: [[30, 4, 21, R], [14, 30, 21, G], [30, 30, 21, G], [46, 30, 21, G], [14, 55, 21, G], [30, 55, 21, G], [46, 55, 21, G]],
    // 八索是一倒一正两个 M：两边四根竖直，中间四根斜着在牌心围成菱形。
    8: [[10.5, 7, 31, G], [23, 7, 31, G, 24], [37, 7, 31, G, -24], [49.5, 7, 31, G],
        [10.5, 42, 31, G], [23, 42, 31, G, -24], [37, 42, 31, G, 24], [49.5, 42, 31, G]],
    9: [[14, 4, 21, G], [30, 4, 21, R], [46, 4, 21, G], [14, 29.5, 21, G], [30, 29.5, 21, R], [46, 29.5, 21, G], [14, 55, 21, G], [30, 55, 21, R], [46, 55, 21, G]],
};

function svgEl(doc, tag, attrs, text) {
    const node = doc.createElementNS ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
    if (attrs) for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text != null) node.textContent = text;
    return node;
}

function tileSvg(doc, code) {
    const svg = svgEl(doc, 'svg', { viewBox: '0 0 60 80', class: 'igs-mj-svg', 'aria-hidden': 'true' });
    if (code === 'back') {
        drawBack(doc, svg);
        return svg;
    }
    const raw = String(code || '').replace(/[_*+=-]/g, '');
    const suit = raw[0];
    const n = raw[1] === '0' ? 5 : +raw[1];
    const red = raw[1] === '0';
    if (suit === 'm') drawMan(doc, svg, n, red);
    else if (suit === 'p') drawPin(doc, svg, n, red);
    else if (suit === 's') n === 1 ? drawBird(doc, svg) : drawSou(doc, svg, n, red);
    else drawHonor(doc, svg, n);
    return svg;
}

function glyph(doc, svg, x, y, size, fill, text, weight = 700) {
    svg.appendChild(svgEl(doc, 'text', {
        x, y, fill, 'text-anchor': 'middle', 'font-size': size, 'font-weight': weight, 'font-family': SERIF,
    }, text));
}

function drawBack(doc, svg) {
    svg.appendChild(svgEl(doc, 'rect', { x: 5, y: 5, width: 50, height: 70, rx: 5, fill: 'none', stroke: 'rgba(255,255,255,.4)', 'stroke-width': 1.2 }));
    const bow = svgEl(doc, 'g', { fill: '#fff', 'fill-opacity': '.94' });
    bow.appendChild(svgEl(doc, 'path', { d: 'M30 39C23 29 12 28 12.5 37.5C13 46 23 45.5 30 39Z' }));
    bow.appendChild(svgEl(doc, 'path', { d: 'M30 39C37 29 48 28 47.5 37.5C47 46 37 45.5 30 39Z' }));
    bow.appendChild(svgEl(doc, 'path', { d: 'M28.6 40.5L21.5 55.5L25.6 54L27.2 58L31.2 41.5Z' }));
    bow.appendChild(svgEl(doc, 'path', { d: 'M31.4 40.5L38.5 55.5L34.4 54L32.8 58L28.8 41.5Z' }));
    svg.appendChild(bow);
    svg.appendChild(svgEl(doc, 'path', { d: 'M28 38C23 33 17 32.5 16.5 37M32 38C37 33 43 32.5 43.5 37', fill: 'none', stroke: 'rgba(179,48,75,.55)', 'stroke-width': 1 }));
    svg.appendChild(svgEl(doc, 'ellipse', { cx: 30, cy: 39.5, rx: 3.6, ry: 3.3, fill: '#fff' }));
}

function drawMan(doc, svg, n, red) {
    glyph(doc, svg, 30, 35, 29, red ? RED : INK, MAN_FACE[n] || '', 800);
    glyph(doc, svg, 30, 71, 30, RED, '萬', 800);
}

function pip(doc, svg, cx, cy, r, color) {
    svg.appendChild(svgEl(doc, 'circle', { cx, cy, r, fill: color }));
    svg.appendChild(svgEl(doc, 'circle', {
        cx, cy, r: r * 0.8, fill: 'none', stroke: IVORY, 'stroke-width': r * 0.13, 'stroke-dasharray': `${(r * 0.36).toFixed(2)} ${(r * 0.26).toFixed(2)}`,
    }));
    svg.appendChild(svgEl(doc, 'circle', { cx, cy, r: r * 0.56, fill: IVORY }));
    svg.appendChild(svgEl(doc, 'circle', { cx, cy, r: r * 0.4, fill: color }));
    svg.appendChild(svgEl(doc, 'circle', { cx, cy, r: r * 0.15, fill: IVORY }));
}

function drawPin(doc, svg, n, red) {
    if (n === 1) {
        svg.appendChild(svgEl(doc, 'circle', { cx: 30, cy: 40, r: 22, fill: GREEN }));
        svg.appendChild(svgEl(doc, 'circle', { cx: 30, cy: 40, r: 18.6, fill: 'none', stroke: IVORY, 'stroke-width': 2.2, 'stroke-dasharray': '4.2 2.6' }));
        svg.appendChild(svgEl(doc, 'circle', { cx: 30, cy: 40, r: 15, fill: IVORY }));
        svg.appendChild(svgEl(doc, 'circle', { cx: 30, cy: 40, r: 12.6, fill: RED }));
        for (let i = 0; i < 8; i += 1) {
            const a = (Math.PI / 4) * i;
            svg.appendChild(svgEl(doc, 'circle', { cx: (30 + Math.cos(a) * 8.6).toFixed(2), cy: (40 + Math.sin(a) * 8.6).toFixed(2), r: 2.2, fill: IVORY }));
        }
        svg.appendChild(svgEl(doc, 'circle', { cx: 30, cy: 40, r: 5, fill: BLUE }));
        svg.appendChild(svgEl(doc, 'circle', { cx: 30, cy: 40, r: 1.8, fill: IVORY }));
        return;
    }
    for (const [cx, cy, r, color] of PIN_PIPS[n] || []) pip(doc, svg, cx, cy, r, red ? RED : color);
}

function stick(doc, svg, x, y, h, color, tilt) {
    const w = tilt ? 7.4 : (h > 25 ? 9 : 8);
    const group = svgEl(doc, 'g', tilt ? { transform: `rotate(${tilt} ${x} ${y + h / 2})` } : null);
    const deep = DEEP[color] || color;
    group.appendChild(svgEl(doc, 'rect', { x: x - w / 2, y, width: w, height: h, rx: w / 2, fill: color }));
    group.appendChild(svgEl(doc, 'rect', { x: x - w * 0.14, y: y + 2, width: w * 0.22, height: h - 4, rx: w * 0.11, fill: 'rgba(255,255,255,.38)' }));
    for (const at of [y + 1.4, y + h / 2, y + h - 1.4]) {
        group.appendChild(svgEl(doc, 'rect', { x: x - w / 2 - 0.5, y: at - 1.1, width: w + 1, height: 2.2, rx: 1.1, fill: deep }));
    }
    svg.appendChild(group);
}

function drawSou(doc, svg, n, red) {
    for (const [x, y, h, color, tilt] of SOU_STICKS[n] || []) stick(doc, svg, x, y, h, red ? RED : color, tilt);
}

// 一索画开屏的孔雀：尾屏在身后向上展开成扇，两圈眼斑；身体、长颈和冠羽在扇前。
function drawBird(doc, svg) {
    const GOLD = '#e2a52b';
    const add = (tag, attrs) => svg.appendChild(svgEl(doc, tag, attrs));
    const [cx, cy] = [30, 50];
    const at = (deg, rx, ry) => [cx + rx * Math.cos(deg * Math.PI / 180), cy - ry * Math.sin(deg * Math.PI / 180)];
    const [sx, sy] = at(-8, 27, 35);
    const [ex, ey] = at(188, 27, 35);
    add('path', { d: `M${cx} ${cy}L${sx} ${sy}A27 35 0 1 0 ${ex} ${ey}Z`, fill: DEEP[GREEN] });
    add('path', { d: `M${sx} ${sy}A27 35 0 1 0 ${ex} ${ey}`, fill: 'none', stroke: GOLD, 'stroke-width': 0.7, 'stroke-opacity': '.85' });
    const eye = (deg, rx, ry, k) => {
        const [x, y] = at(deg, rx, ry);
        const turn = `rotate(${90 - deg} ${x} ${y})`;
        add('ellipse', { cx: x, cy: y, rx: 2.5 * k, ry: 3.2 * k, fill: GOLD, transform: turn });
        add('ellipse', { cx: x, cy: y, rx: 1.7 * k, ry: 2.2 * k, fill: GREEN, transform: turn });
        add('ellipse', { cx: x, cy: y, rx: 1 * k, ry: 1.3 * k, fill: BLUE, transform: turn });
    };
    const outer = Array.from({ length: 11 }, (_, i) => -4 + i * 18.8);
    for (const deg of outer) {
        const [tx, ty] = at(deg, 25, 33);
        const [mx, my] = [cx + (tx - cx) * 0.6, cy + (ty - cy) * 0.6];
        const len = Math.hypot(tx - cx, ty - cy);
        const [px, py] = [-(ty - cy) / len * 2.6, (tx - cx) / len * 2.6];
        add('path', { d: `M${cx} ${cy}Q${mx + px} ${my + py} ${tx} ${ty}Q${mx - px} ${my - py} ${cx} ${cy}Z`, fill: '#1f9d63' });
        add('path', { d: `M${cx} ${cy}L${tx} ${ty}`, stroke: DEEP[GREEN], 'stroke-width': 0.45 });
    }
    for (const deg of outer) eye(deg, 23.5, 31, 1);
    for (let i = 0; i < 10; i += 1) eye(5.4 + i * 18.8, 15, 20, 0.8);
    add('path', { d: 'M27.6 65.5L26.8 72M26.8 72L24.8 73.2M26.8 72L27.8 73.6M32 65.8L32.4 72M32.4 72L30.6 73.4M32.4 72L34.2 73.2', fill: 'none', stroke: GOLD, 'stroke-width': 1.1, 'stroke-linecap': 'round' });
    add('path', { d: 'M24 49C20.5 55 22 64 29.5 66C36.5 67.5 39.5 60 37.5 53.5C36 48.5 28 45.5 24 49Z', fill: BLUE });
    add('path', { d: 'M23.6 35.5C22.6 41 23.4 46 25 50L32 49C30 45 29.4 40 30 35Z', fill: BLUE });
    add('path', { d: 'M29.5 51C35.5 49.5 40 54.5 39 60.5C38.4 64 35.4 66.4 32 65.4C30 61 29.2 56 29.5 51Z', fill: GREEN });
    add('path', { d: 'M31 54.4Q34 53 36.8 55M31.6 58Q34.8 56.6 38 58.6M32.6 61.6Q35.4 60.4 38.2 62', fill: 'none', stroke: IVORY, 'stroke-width': 0.75, 'stroke-opacity': '.55', 'stroke-linecap': 'round' });
    add('path', { d: 'M25.4 52Q23.8 56.4 25.6 61', fill: 'none', stroke: '#5b86d6', 'stroke-width': 0.8, 'stroke-opacity': '.7', 'stroke-linecap': 'round' });
    for (const [x, y] of [[23.8, 23.6], [26.8, 22.4], [29.8, 23.6]]) {
        add('path', { d: `M26.8 29.4L${x} ${y}`, stroke: BLUE, 'stroke-width': 0.7, 'stroke-linecap': 'round' });
        add('circle', { cx: x, cy: y, r: 1.15, fill: RED });
    }
    add('circle', { cx: 26.8, cy: 33.2, r: 4.4, fill: BLUE });
    add('path', { d: 'M24.2 31.6Q26.2 30.7 28.2 31.4M24.6 35.1Q26.2 35.8 28 34.9', fill: 'none', stroke: IVORY, 'stroke-width': 0.75, 'stroke-linecap': 'round' });
    add('path', { d: 'M22.7 32.3L18.6 33.8L22.8 35Z', fill: GOLD });
    add('circle', { cx: 26, cy: 33.2, r: 1.1, fill: INK });
    add('circle', { cx: 26.35, cy: 32.85, r: 0.38, fill: IVORY });
}

function drawHonor(doc, svg, n) {
    if (n === 5) {
        svg.appendChild(svgEl(doc, 'rect', { x: 14, y: 16, width: 32, height: 48, rx: 3, fill: 'none', stroke: '#2f6fd0', 'stroke-width': 2.6 }));
        svg.appendChild(svgEl(doc, 'rect', { x: 18.5, y: 20.5, width: 23, height: 39, rx: 1.6, fill: 'none', stroke: '#2f6fd0', 'stroke-width': 1.1 }));
        return;
    }
    const face = ['', '東', '南', '西', '北', '', '發', '中'][n] || '';
    const fill = n === 7 ? RED : (n === 6 ? GREEN : INK);
    glyph(doc, svg, 30, 54, 40, fill, face, 900);
}

export function tileNode(doc, code, options = {}) {
    const back = code === 'back';
    const face = back ? { text: '', suit: '', red: false } : faceOf(code);
    const node = el(doc, options.button ? 'button' : 'span', [
        'igs-mj-pai',
        back ? 'is-back' : `is-${face.suit}`,
        face.red ? 'is-red' : '',
        options.side ? 'is-side' : '',
        options.spent ? 'is-out' : '',
        options.zimo ? 'is-zimo' : '',
        options.hot ? 'is-hot' : '',
        options.fresh ? 'is-fresh' : '',
    ].filter(Boolean).join(' '));
    if (options.button) node.type = 'button';
    node.appendChild(el(doc, 'span', 'igs-mj-label', face.text));
    node.appendChild(tileSvg(doc, back ? 'back' : code));
    if (/[*]/.test(code)) node.title = '立直';
    return node;
}
