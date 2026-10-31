// 暗网直播间皮肤样式：终端 / 监控 / 拍卖三套，挂在直播根节点 data-live-skin 上，前层控制条与全屏字幕按阅读器根节点 data-ls-skin 取同一组变量。
// 颜色与字体全走 --ls-* 变量；装饰用实色，扫描线与暗角克制；不放密集纹样。字体放行写在这里（stock 的 !important 字体规则优先级见各条）。
const S = '.igs-live-stage[data-live-skin]';
const T = '.igs-live-stage[data-live-skin="terminal"]';
const C = '.igs-live-stage[data-live-skin="cctv"]';
const A = '.igs-live-stage[data-live-skin="auction"]';
const OV = '#igs-overlay[data-ls-skin]';
const MONO = '"Cascadia Mono","Consolas","Courier New","Microsoft YaHei",monospace';
const SERIF = '"Source Han Serif CN","Noto Serif SC","Songti SC","SimSun","Georgia",serif';

export const LIVE_SKIN_STYLE_TEXT = `
@keyframes igs-ls-bl{50%{opacity:0;}}
${T},#igs-overlay[data-ls-skin="terminal"]{--ls-ink:#4dff7a;--ls-dim:#2a9a49;--ls-bg:#040905;--ls-ln:#2a9a49;--ls-ac:#4dff7a;--ls-tint:#04140a;--ls-font:${MONO};--ls-pic:saturate(.8) sepia(.18) hue-rotate(40deg) contrast(1.03);--ls-pic-sprite:saturate(.8) sepia(.08) brightness(.98);--ls-scan:repeating-linear-gradient(180deg,rgba(0,0,0,.1) 0 1px,transparent 1px 3px);}
${T}[data-live-tone="amber"],#igs-overlay[data-ls-skin="terminal"][data-ls-tone="amber"]{--ls-ink:#ffb52e;--ls-dim:#9a6a14;--ls-bg:#090602;--ls-ln:#9a6a14;--ls-ac:#ffb52e;--ls-tint:#140b02;--ls-pic:saturate(.82) sepia(.2) contrast(1.02);--ls-pic-sprite:sepia(.22) saturate(.92);}
${C},#igs-overlay[data-ls-skin="cctv"]{--ls-ink:#e6e6de;--ls-dim:#9a9a90;--ls-bg:#1b1c1e;--ls-ln:#34363a;--ls-ac:#f2d41c;--ls-tint:#101a15;--ls-font:${MONO};--ls-pic:saturate(.75) contrast(1.04);--ls-pic-sprite:saturate(.72) contrast(1.04);--ls-scan:repeating-linear-gradient(180deg,rgba(0,0,0,.12) 0 1px,transparent 1px 4px);}
${A},#igs-overlay[data-ls-skin="auction"]{--ls-ink:#eadfc6;--ls-dim:#8f836c;--ls-bg:#0b0809;--ls-ln:#b8934a;--ls-ln2:#4a0f19;--ls-ac:#b8934a;--ls-ox:#4a0f19;--ls-ox2:#2a0a10;--ls-tint:#1a0f0a;--ls-font:${SERIF};--ls-pic:sepia(.22) saturate(.92) contrast(1.02);--ls-pic-sprite:sepia(.2) saturate(.95);--ls-scan:none;}
${S} .igs-live-phone{--ls-t:var(--igs-live-name-top,14px);--ls-w:250px;}
${S}[data-layout="phone"] .igs-live-phone{--ls-t:38px;--ls-w:min(200px,calc(100% - 24px));}
${T} .igs-live-phone{--ls-bh:28px;--ls-at:44px;--ls-nt:112px;}
${T}[data-layout="phone"] .igs-live-phone{--ls-bh:44px;--ls-at:58px;--ls-nt:126px;}
${C} .igs-live-phone{--ls-at:48px;--ls-nt:116px;}
${C}[data-layout="phone"] .igs-live-phone{--ls-at:62px;--ls-nt:130px;}
${A} .igs-live-phone{--ls-at:6px;--ls-nt:154px;--ls-w:220px;}
${A}[data-layout="phone"] .igs-live-phone{--ls-nt:134px;--ls-w:min(220px,calc(100% - 24px));}
${S} :is(.igs-live-medal,.igs-live-lv,.igs-live-tag,.igs-live-pop,.igs-live-rankcard,.igs-live-chips,.igs-live-cc-tag,.igs-live-gifts,.igs-live-guard,.igs-live-hearts,.igs-live-viewers,.igs-live-follow .igs-live-icon){display:none;}
${S} .igs-live-top{display:contents;}
${S} .igs-live-screen::after{display:none;}
${S}[data-layout="phone"] .igs-live-phone{background:var(--ls-bg);}
${S}[data-layout="phone"] .igs-live-screen{background:var(--ls-bg);}
${S} .igs-live-cover{filter:var(--ls-pic);}
${S} .igs-live-dim{opacity:.5;}
${S} :is(.igs-live-portrait,.igs-live-cg){filter:var(--ls-pic-sprite,none);}
${S}[data-cg="1"] .igs-live-cover{filter:var(--ls-pic) blur(14px);}
#igs-overlay ${S} .igs-live-phone,#igs-overlay ${S} .igs-live-phone *:not(svg):not(svg *):not(.igs-feed-stamp),#igs-overlay ${S} .igs-live-fly *{font-family:var(--ls-font)!important;}
${OV} .igs-live-ctl *:not(svg):not(svg *):not(.igs-feed-stamp){font-family:var(--ls-font)!important;}
.igs-ls-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
.igs-ls-fx i{position:absolute;inset:0;}
.igs-ls-scan{background:var(--ls-scan);}
@keyframes igs-ls-glitch{from{transform:translateY(-40%);}to{transform:translateY(60%);}}
@keyframes igs-ls-jit{0%,100%{transform:none;}25%{transform:translateX(-3px);}50%{transform:translateX(2px);}75%{transform:translateX(-1px);}}
.igs-ls-glitch{display:none;background:linear-gradient(180deg,transparent 0 40%,var(--ls-ac) 40% 43%,transparent 43% 47%,var(--ls-ink) 47% 48%,transparent 48%);}
${S}[data-ls-glitch] .igs-ls-glitch{display:block;animation:igs-ls-glitch .3s linear 1 both;}
${S}[data-ls-glitch] :is(.igs-live-cover,.igs-live-portrait,.igs-live-cg){animation:igs-ls-jit .3s steps(2) 1;}
${A} .igs-ls-glitch,${A}[data-ls-glitch] :is(.igs-live-cover,.igs-live-portrait,.igs-live-cg){display:none;animation:none;}
@media (prefers-reduced-motion: reduce){${S}[data-ls-glitch] :is(.igs-live-cover,.igs-live-portrait,.igs-live-cg),${S}[data-ls-glitch] .igs-ls-glitch{animation:none;}}
${S} .igs-live-tools{position:absolute;right:12px;top:calc(var(--ls-t) + 6px);z-index:7;gap:8px;color:var(--ls-ac);}
${S}[data-layout="full"] .igs-live-tools{right:16px;}
${S} .igs-live-list{box-sizing:border-box;gap:0;padding:24px 8px 4px;border:1px solid var(--ls-ln);border-radius:0;background:var(--ls-bg);-webkit-mask-image:none;mask-image:none;}
${S} .igs-live-list::before{content:attr(data-ls-title);position:absolute;z-index:1;left:0;right:0;top:0;height:20px;padding:0 8px;line-height:19px;font-size:11px;color:var(--ls-dim);background:var(--ls-bg);border-bottom:1px solid var(--ls-ln);}
${S} .igs-live-line{padding:0 2px;border-radius:0;background:none;box-shadow:none;color:var(--ls-ink);font-size:calc(12px * var(--igs-live-fs,1));line-height:18px;}
${S} .igs-live-line .igs-live-text{color:var(--ls-ink);font-weight:400;}
${S} .igs-live-name{margin-right:6px;color:var(--ls-dim);}
.igs-live-ts{margin-right:6px;color:var(--ls-dim);}
${S} .igs-live-line.is-note{padding:0 2px;background:none;color:var(--ls-dim);font-size:calc(12px * var(--igs-live-fs,1));}
${S} .igs-live-line.is-narration{background:none;color:var(--ls-dim);font-style:italic;}
${S} .igs-live-line.is-gift,${S} .igs-live-line.is-guard,${S} .igs-live-line.is-sc{background:none;color:var(--ls-ac);}
${S} .igs-live-line.is-sc .igs-live-text{color:var(--ls-ac);}
${S} .igs-live-line.is-warn{background:#a51f2b;color:#ffd7d7;}
${S} .igs-live-line.is-warn .igs-live-text{color:#ffd7d7;}
${T} .igs-live-line:is([data-mine],[data-type="host"]){background:var(--ls-ink);color:var(--ls-bg);}
${T} .igs-live-line:is([data-mine],[data-type="host"]) :is(.igs-live-text,.igs-live-name,.igs-live-ts){color:var(--ls-bg);}
${C} .igs-live-line:is([data-mine],[data-type="host"]) .igs-live-text,${C} .igs-live-line[data-type="host"] .igs-live-name{color:var(--ls-ac);}
${A} .igs-live-line:is([data-mine],[data-type="host"]) .igs-live-text{color:var(--ls-ac);}
${A} .igs-live-name{padding:0 4px;border:1px solid var(--ls-ln);color:var(--ls-ac);font-size:10px;line-height:14px;display:inline-block;vertical-align:1px;}
${C} .igs-live-name{color:#b9a83a;}
${S} .igs-live-flyer{color:var(--ls-ink);font-weight:700;-webkit-text-stroke:0;text-shadow:1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000;}
${S} .igs-live-flyer.is-sc,${S} .igs-live-flyer.is-host{color:var(--ls-ac);}
${A} .igs-live-flyer{font-style:italic;font-weight:400;}
${S} .igs-live-sc{top:calc(var(--ls-t) + var(--ls-nt) + 64px);z-index:2;}
${S} .igs-live-sc-card{border-radius:0;border:1px solid var(--ls-ln);background:var(--ls-bg);color:var(--ls-ink);}
${S} .igs-live-sc-head{background:var(--ls-ink);color:var(--ls-bg);}
${S} .igs-live-sc-text{color:var(--ls-ink);}
${S} .igs-live-anchor{position:absolute;z-index:2;left:12px;top:calc(var(--ls-t) + var(--ls-at));width:var(--ls-w);box-sizing:border-box;padding:9px 12px 7px;gap:8px;align-items:center;border:1px solid var(--ls-ln);background:var(--ls-bg);color:var(--ls-ink);}
${S}[data-layout="full"] .igs-live-anchor,${S}[data-layout="full"] .igs-ls-note{left:16px;}
.igs-live-anchor[data-ls-title]::before,.igs-ls-note[data-ls-title]::before,.igs-ls-board::before{content:attr(data-ls-title);position:absolute;top:-8px;left:8px;padding:0 5px;background:var(--ls-bg);color:var(--ls-ink);font-size:11px;line-height:14px;}
${T} .igs-live-avatar,${C} .igs-live-avatar{display:none;}
${S} .igs-live-meta{flex:1;min-width:0;color:var(--ls-ink);text-shadow:none;}
${S} .igs-live-host{max-width:none;font-size:15px;font-weight:700;}
${S} .igs-live-follow{padding:0 6px;border-radius:0;background:var(--ls-ink);color:var(--ls-bg);font-size:11px;font-weight:700;}
${C} .igs-live-follow{background:none;border:1px solid var(--ls-ac);color:var(--ls-ac);}
${A} .igs-live-follow{background:none;border:1px solid var(--ls-ac);color:var(--ls-ac);letter-spacing:.1em;font-weight:400;}
.igs-ls-sub{font-size:11px;color:var(--ls-dim);white-space:nowrap;}
.igs-ls-bar{position:absolute;z-index:2;left:0;right:0;top:var(--ls-t);height:var(--ls-bh);box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;column-gap:12px;padding:0 90px 0 14px;background:var(--ls-bg);border-bottom:1px solid var(--ls-ln);color:var(--ls-ink);font-size:12px;white-space:nowrap;overflow:hidden;}
.igs-ls-chip{padding:0 6px;background:var(--ls-ink);color:var(--ls-bg);font-size:11px;font-weight:700;}
.igs-ls-addr{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;}
.igs-ls-nodes,.igs-ls-online{color:var(--ls-dim);}
.igs-ls-nodes b,.igs-ls-online b{margin-left:6px;font-weight:400;color:var(--ls-ink);}
${T}[data-layout="phone"] .igs-ls-bar{align-content:flex-start;row-gap:2px;padding-top:2px;}
${T}[data-layout="phone"] .igs-ls-chip{display:none;}
${T}[data-layout="phone"] .igs-ls-addr{flex:0 0 100%;}
${T}[data-layout="phone"] .igs-ls-nodes,${T}[data-layout="phone"] .igs-ls-online{font-size:11px;}
.igs-ls-note{position:absolute;z-index:2;left:12px;top:calc(var(--ls-t) + var(--ls-nt));width:var(--ls-w);box-sizing:border-box;padding:7px 10px;border:1px solid var(--ls-ln);background:var(--ls-bg);color:var(--ls-ink);font-size:11.5px;line-height:1.55;}
.igs-ls-note[hidden]{display:none;}
.igs-ls-note span+span{margin-left:6px;}
.igs-ls-note .inv{padding:0 5px;background:var(--ls-ink);color:var(--ls-bg);font-weight:700;}
.igs-ls-note .d{color:var(--ls-dim);}
.igs-ls-board{position:absolute;z-index:2;right:12px;bottom:calc(58px + var(--igs-live-under,0px));width:94px;box-sizing:border-box;padding:9px 8px 6px;border:1px solid var(--ls-ln);background:var(--ls-bg);color:var(--ls-ink);font-size:11.5px;line-height:17px;}
${S}[data-layout="full"] .igs-ls-board{right:16px;bottom:calc(var(--igs-cc-clear,var(--igs-live-floor,160px)) + 8px);width:170px;padding:9px 10px 6px;}
.igs-ls-row{display:flex;justify-content:space-between;gap:4px;}
.igs-ls-row i{font-style:normal;color:var(--ls-dim);width:10px;}
${S}[data-layout="phone"] .igs-ls-board{width:100px;padding:9px 7px 6px;font-size:11px;}
${S} .igs-live-bar{background:none;}
${S} .igs-live-input{border-radius:0;border:1px solid var(--ls-ln);background:var(--ls-bg);color:var(--ls-dim);}
${S} .igs-live-btn{border-radius:0;border:1px solid var(--ls-ln);background:var(--ls-bg);color:var(--ls-ac);}
${S} .igs-live-btn:is(.is-gift,.is-like){color:var(--ls-ac);}
.igs-ls-row b{flex:1;min-width:0;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.igs-ls-row .v{display:none;}
${S}[data-layout="full"] .igs-ls-row .v{display:inline;}
${S}[data-layout="full"] .igs-ls-row .vs{display:none;}
${A} .igs-ls-row span{flex:none;white-space:nowrap;}
${A}[data-layout="phone"] .igs-ls-row{gap:3px;}
${A}[data-layout="phone"] .igs-ls-row .vs{color:var(--ls-ac);}
${T}[data-layout="phone"] .igs-ls-row .vs,${C}[data-layout="phone"] .igs-ls-row .vs{display:none;}
${C}{--ls-pn:#1b1c1e;}
${C} .igs-ls-cr{position:absolute;z-index:2;width:18px;height:18px;border:0 solid var(--ls-ac);}
${C} .igs-ls-cr-a{left:10px;top:calc(var(--ls-t) - 4px);border-width:2px 0 0 2px;}
${C} .igs-ls-cr-b{right:10px;top:calc(var(--ls-t) - 4px);border-width:2px 2px 0 0;}
${C} .igs-ls-cr-c{left:10px;bottom:10px;border-width:0 0 2px 2px;}
${C} .igs-ls-cr-d{right:10px;bottom:10px;border-width:0 2px 2px 0;}
${C}[data-layout="phone"] :is(.igs-ls-cr-c,.igs-ls-cr-d){display:none;}
${C} .igs-ls-osd{position:absolute;z-index:2;left:34px;color:var(--ls-ac);font-size:13px;font-weight:700;line-height:18px;white-space:nowrap;max-width:50%;overflow:hidden;text-overflow:ellipsis;text-shadow:1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000;}
${C} .igs-ls-l1{top:calc(var(--ls-t) - 2px);}
${C} .igs-ls-l2{top:calc(var(--ls-t) + 18px);}
${C} .igs-ls-tm{top:calc(var(--ls-t) + 36px);}
${C}[data-layout="full"] .igs-ls-tm{top:calc(var(--ls-t) - 2px);left:auto;right:96px;}
.igs-ls-rd{display:inline-block;width:10px;height:10px;margin-right:6px;border-radius:50%;background:#e5322d;vertical-align:-1px;animation:igs-ls-bl 1.2s steps(1) infinite;}
.igs-ls-view{position:absolute;z-index:2;right:96px;top:calc(var(--ls-t) + 26px);padding:2px 8px;border:1px solid var(--ls-ln);background:var(--ls-bg);color:var(--ls-ac);font-size:12px;}
${C}[data-layout="phone"] .igs-ls-view{display:none;}
.igs-ls-view b{margin-left:6px;font-weight:400;}
${C} .igs-live-anchor{border-color:var(--ls-ln);padding-left:16px;}
${C} .igs-live-anchor::after{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--ls-ac);}
${C} .igs-live-anchor[data-ls-title]::before{position:static;order:-1;padding:0 5px;background:var(--ls-ac);color:#111;font-weight:700;}
${C} .igs-ls-note{border-left:4px solid var(--ls-ac);background:#000;color:var(--ls-ac);font-weight:700;}
${C} .igs-ls-note span+span{color:var(--ls-ink);font-weight:400;}
${A} :is(.igs-live-anchor,.igs-ls-lot,.igs-ls-board,.igs-ls-note,.igs-ls-seats){z-index:4;}
${A} .igs-live-list{z-index:4;}
${A} .igs-live-anchor{left:12px;top:calc(var(--ls-t) + var(--ls-at));height:48px;padding:6px 10px;gap:8px;background:var(--ls-ox);border:0;}
${A}[data-layout="full"] .igs-live-anchor{left:16px;}
${A} .igs-live-anchor::after{content:"会员卡";position:absolute;left:52px;top:7px;font-size:10px;letter-spacing:.14em;color:var(--ls-ac);}
${A} .igs-live-avatar{width:32px;height:32px;border-radius:50%;box-shadow:none;border:0;background-color:var(--ls-bg);color:var(--ls-ac);font-size:15px;}
${A} .igs-live-host{margin-top:11px;font-size:15px;font-weight:400;color:var(--ls-ink);}
${A} .igs-live-follow{border:0;background:var(--ls-bg);color:var(--ls-ac);}
${A} .igs-ls-note{border-left:3px solid var(--ls-ac);background:var(--ls-ox);white-space:nowrap;}
${A} .igs-ls-note span:first-child{color:var(--ls-ac);}
.igs-ls-lot{position:absolute;z-index:2;left:16px;top:calc(var(--ls-t) + var(--ls-at) + 52px);width:var(--ls-w);box-sizing:border-box;padding:6px 10px 7px;background:var(--ls-bg);color:var(--ls-ink);}
${A}[data-layout="phone"] .igs-ls-lot{left:12px;}
.igs-ls-lot .top{display:flex;align-items:baseline;gap:8px;min-width:0;}
.igs-ls-lot .a{flex:none;font-size:10px;letter-spacing:.14em;color:var(--ls-ac);}
.igs-ls-lot .ti{min-width:0;font-size:15px;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.igs-ls-lot .cu{margin-top:2px;display:flex;justify-content:space-between;align-items:baseline;font-size:11px;line-height:20px;color:var(--ls-dim);}
.igs-ls-lot .cu b{font-size:17px;font-weight:400;color:var(--ls-ac);}
.igs-ls-lot .cu small{margin-left:3px;font-size:10px;color:var(--ls-dim);}
.igs-ls-lot .pg{margin-top:6px;height:3px;background:var(--ls-ox2);}
.igs-ls-lot .pg i{display:block;width:var(--ls-pg,100%);height:100%;background:var(--ls-ac);}
${A}[data-layout="phone"] .igs-ls-lot .cd{display:none;}
.igs-ls-seats{position:absolute;z-index:2;right:52px;top:calc(var(--ls-t) + 4px);padding:2px 10px;border:1px solid var(--ls-ln);background:var(--ls-bg);color:var(--ls-ac);font-size:12px;}
.igs-ls-seats b{margin-left:6px;font-weight:400;}
${A}[data-layout="phone"] .igs-ls-seats{display:none;}
${A} .igs-ls-note{border-left:0;box-shadow:inset 3px 0 0 var(--ls-ac);}
${A} .igs-ls-seats{border:0;}
${A} .igs-ls-board{border:0;}
${A}[data-layout="phone"] .igs-ls-board{right:10px;bottom:calc(62px + var(--igs-live-under,0px));width:76px;padding:6px 4px;font-size:10.5px;line-height:15px;}
${A}[data-layout="full"] .igs-ls-board{right:16px;bottom:calc(var(--igs-live-floor,160px) + 52px);width:108px;padding:8px 6px;}
#igs-overlay[data-igs-live-cc="wide"] ${A}[data-layout="full"][data-sub] .igs-ls-board{bottom:calc(var(--igs-cc-clear,160px) + 10px);}
${A} .igs-ls-board::before{position:static;display:block;margin-bottom:3px;padding:0;background:none;color:var(--ls-ac);text-align:center;text-indent:.2em;letter-spacing:.2em;font-size:10px;line-height:14px;}
${A}[data-layout="full"] .igs-live-phone[data-view="host"] .igs-live-initial:not([hidden]){display:none;}
${A} .igs-live-list{padding:0;border:0;background:none;gap:3px;}
${A} .igs-live-list::before{display:none;}
${A} .igs-live-line,${A} .igs-live-line:is(.is-note,.is-narration,.is-gift,.is-guard,.is-sc){padding:2px 8px;background:var(--ls-bg);}
${A} .igs-live-name{border:0;background:var(--ls-ox);}
${A} :is(.igs-live-input,.igs-live-btn){border:0;}
#igs-overlay[data-ls-skin="auction"][data-ls-skin] :is(.igs-live-ctl-pill,.igs-live-ctl-btn,.igs-live-ctl-send,.igs-live-ctl-field,.igs-live-ctl-gift,.igs-live-ctl-amount,.igs-live-ctl-guard,.igs-live-ctl-panel){border:0;}
${OV}[data-igs-live-full="subtitle"] #igs-dialog-layer .igs-dialog #igs-text{border-radius:0;background:var(--ls-bg)!important;color:var(--ls-ink)!important;font-family:var(--ls-font)!important;}
${OV}[data-igs-live-full="subtitle"][data-igs-live-sub="narration"] #igs-dialog-layer .igs-dialog #igs-text{color:var(--ls-dim)!important;}
#igs-overlay[data-ls-skin="terminal"][data-igs-live-full="subtitle"] #igs-text{border:1px solid var(--ls-ln);}
#igs-overlay[data-ls-skin="cctv"][data-igs-live-full="subtitle"] #igs-text{border:1px solid var(--ls-ln);color:var(--ls-ac)!important;font-weight:700;}
#igs-overlay[data-ls-skin="auction"][data-igs-live-full="subtitle"] #igs-text{box-shadow:inset 0 2px 0 var(--ls-ox);}
${OV} .igs-live-ctl-pill,${OV} .igs-live-ctl-btn,${OV} .igs-live-ctl-send,${OV} .igs-live-ctl-field,${OV} .igs-live-ctl-gift,${OV} .igs-live-ctl-amount,${OV} .igs-live-ctl-guard{border-radius:0;border:1px solid var(--ls-ln);background:var(--ls-bg);color:var(--ls-ink);}
${OV} .igs-live-ctl-send,${OV} .igs-live-ctl-amount[aria-pressed="true"],${OV} .igs-live-ctl-tab[aria-pressed="true"]{background:var(--ls-ink);color:var(--ls-bg);}
${OV} .igs-live-ctl-btn.is-gift,${OV} .igs-live-ctl-btn.is-like,${OV} .igs-live-ctl-gift{color:var(--ls-ac);}
${OV} .igs-live-ctl-panel{border-radius:0;border:1px solid var(--ls-ln);background:var(--ls-bg);}
${OV} .igs-live-ctl-tab,${OV} .igs-live-ctl-close{border-radius:0;color:var(--ls-dim);}
${OV} .igs-live-switch{color:var(--ls-ac);}
@media (prefers-reduced-motion: reduce){.igs-ls-rd{animation:none;}}
#igs-overlay[data-igs-paused] .igs-ls-rd{animation-play-state:paused;}
`.trim();
