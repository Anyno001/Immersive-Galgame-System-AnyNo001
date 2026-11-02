// 结算画面·tech（概念 B：六边形网格 + 雷达扫描 + 四角 HUD）：版式见 计划-战斗结算返工.md。
// html 返回空串，继续走通用 resultStageHtml；decor 往通用标记里追加特效节点；css 只写 [data-skin="tech"] 作用域。
// 版式：.result 改成网格，右列（标题牌 / 回合 / 数据行 / 可点区）自然堆叠；横屏整列垂直居中，竖屏整块下移叠在放大后的立绘上，可点区贴底。
export const html = () => '';

// 标题字数 → 字号档（牌内完整放下）；8 字及以上共用一档。
const labelClass = (end) => `tx-n${Math.min(8, Math.max(1, Array.from(String(end?.label || '')).length))}`;
const HEX = '<svg aria-hidden="true"><defs><pattern id="igs-tx-hp" width="54" height="31.18" patternUnits="userSpaceOnUse"><path d="M0 15.59H13.5L27 0M13.5 15.59L27 31.18M40.5 15.59L27 31.18M40.5 15.59H54M40.5 15.59L54 0M27 0H0" fill="none" stroke="#26323c" stroke-width="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#igs-tx-hp)"/></svg>';

export const decor = ({ won, end }) => `<i class="tx-lab ${labelClass(end)}"></i><div class="tx-hx">${HEX}</div>`
    + '<div class="tx-rd"><i></i><i></i><i></i><u></u><s></s></div><div class="tx-sw"></div>'
    + `${won ? '<i class="tx-pg"></i>' : ''}<i class="tx-hc a"></i><i class="tx-hc b"></i><i class="tx-hc c"></i><i class="tx-hc d"></i><i class="tx-tk a"></i><i class="tx-tk b"></i>`;

const P = '#igs-overlay .igs-sfx[data-skin="tech"][data-sfx="tech"]';
const R = `${P} .result`;
const T = (ms) => `calc(${ms}ms * var(--k))`;
const CH = (c) => `polygon(0 ${c}, ${c} 0, 100% 0, 100% calc(100% - ${c}), calc(100% - ${c}) 100%, 0 100%)`;
// 内层（缩进 1px 后）的切角，与外层平行。
const CHI = (c) => `polygon(0 calc(${c} - .6px), calc(${c} - .6px) 0, 100% 0, 100% calc(100% - ${c} + .6px), calc(100% - ${c} + .6px) 100%, 0 100%)`;
const CJK = '"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';
const S = '.igs-sfx[data-skin="tech"] .result';
const ALL = (pre) => [`${pre} ${S}`, `${pre} ${S} *`, `${pre} ${S} *::before`, `${pre} ${S} *::after`].join(', ');

export const css = `
@property --tx-mr{syntax:"<length>";inherits:false;initial-value:2400px;}
${R}{--ac:#7fd0ff;--el:#7fd0ff;--tx-ph:108px;--tx-row:44px;--tx-card:100px;--tx-pad:10px;
 display:grid;grid-template-columns:minmax(0,1fr) 236px;grid-template-rows:auto auto auto 1fr;align-content:start;padding:126px 20px 36px;overflow:hidden;}
${R}.lose{--ac:#ff7a3d;--el:#ff7a3d;}
${P}.land .result{--tx-ph:120px;--tx-row:48px;--tx-card:110px;--tx-pad:12px;grid-template-columns:minmax(0,1fr) 380px;grid-template-rows:auto auto auto auto;align-content:safe center;padding:0 120px;}

/* 底：背景压暗 + 渐变遮罩（竖屏压下沿，横屏压右列） */
${R} .veil{background:linear-gradient(to bottom,rgba(14,17,20,.35) 0,rgba(14,17,20,0) 30%,rgba(14,17,20,.55) 62%,#0e1114 100%);-webkit-backdrop-filter:brightness(.56) saturate(.75);backdrop-filter:brightness(.56) saturate(.75);}
${P}.land .result .veil{background:linear-gradient(to left,#0e1114 0,rgba(14,17,20,.88) 34%,rgba(14,17,20,.2) 62%,rgba(14,17,20,.1) 100%);}
${R} .hband{display:none;}

/* 立绘：竖屏放大并压到右列之下，横屏居左 */
${R} .fig.lead{left:-90px;top:175px;width:460px;height:694px;filter:none;}
${R} .fig.mate{left:-60px;top:214px;width:280px;height:420px;}
${R}.lose .fig{filter:none;}
${R}.lose .fig.mate{filter:brightness(.6);}
${P}.land .result .fig.lead{left:110px;top:20px;width:520px;height:700px;}
${P}.land .result .fig.mate{left:20px;top:110px;width:330px;height:499px;}

/* 标题牌：切角描边 + 实色底；标题与英文同在牌内居中 */
${R} .plate{position:relative;grid-area:1/2;left:auto;right:auto;top:auto;width:auto;height:var(--tx-ph);z-index:3;background:none;clip-path:none;animation:none;}
${R} .plate::before{content:"";position:absolute;inset:0;background:var(--ac);clip-path:${CH('14px')};animation:sfx-txr-fade ${T(500)} ease-out ${T(600)} both;}
${R} .plate::after{content:"";position:absolute;inset:1.25px;background:#12171c;clip-path:${CHI('14px')};animation:sfx-txr-fade ${T(400)} ease-out ${T(200)} both;}
${R}.lose .plate::before{animation:sfx-txr-tolose ${T(500)} linear ${T(600)} both;}
${R} .big{position:relative;grid-area:1/2;left:auto;right:auto;top:auto;width:auto;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
 font:800 46px/1.1 ${CJK};letter-spacing:.12em;text-indent:.12em;color:#e9f1f6;text-shadow:none;-webkit-text-stroke:0;white-space:nowrap;animation:sfx-txr-fade ${T(400)} ease-out ${T(200)} both;}
${R}.lose .big{color:#e9f1f6;text-shadow:none;animation:sfx-txr-fade ${T(400)} ease-out ${T(200)} both,sfx-txr-jit ${T(500)} steps(1) ${T(1150)} both;}
${R} .big small{display:block;margin:0;font:700 13px/1.2 var(--font-big);letter-spacing:.42em;text-indent:.42em;color:var(--ac);text-shadow:none;-webkit-text-stroke:0;}
${R}.lose .big small{color:var(--ac);}
${P}.land .result .big{font-size:56px;}
${P}.land .result .big small{font-size:14px;}
${R} .tx-lab{display:none;}
${R} .tx-n4~.big{font-size:44px;}${R} .tx-n5~.big{font-size:36px;}${R} .tx-n6~.big{font-size:30px;}${R} .tx-n7~.big,${R} .tx-n8~.big{font-size:26px;}
${P}.land .result .tx-n5~.big{font-size:56px;}${P}.land .result .tx-n6~.big{font-size:48px;}${P}.land .result .tx-n7~.big{font-size:42px;}${P}.land .result .tx-n8~.big{font-size:38px;}

/* 回合：一条渐隐细线 + 「回合 7」右对齐，与数据行同列 */
${R} .grade{position:relative;grid-area:2/2;right:auto;top:auto;z-index:4;display:flex;align-items:baseline;gap:10px;height:34px;margin-top:12px;
 font:800 28px/34px var(--font-big);color:#e9f1f6;text-align:right;-webkit-text-stroke:0;text-shadow:none;animation:sfx-txr-rise ${T(450)} ease-out ${T(950)} both;}
${R} .grade::before{content:"";flex:1;height:1px;align-self:center;background:linear-gradient(90deg,#3a5163,rgba(58,81,99,0));}
${R} .grade small{display:inline;margin:0;font:400 14px/34px ${CJK};letter-spacing:0;color:#9fb0bb;}
${R}.lose .grade{text-shadow:none;}

/* 数据行：标签约 14px、数值约 20px，基线对齐 */
${R} .rows{position:relative;grid-area:3/2;right:auto;top:auto;width:auto;z-index:4;gap:8px;margin-top:150px;}
${P}.land .result .rows{margin-top:10px;}
${R} .row{height:var(--tx-row);padding:var(--tx-pad) 14px;align-items:baseline;background:#12171c;--cs:8px;--rc:#26323c;clip-path:${CH('8px')};animation:sfx-txr-ping ${T(380)} ease-out calc(var(--d) * var(--k)) backwards;}
${R} .row span{flex:none;font:400 14px/24px ${CJK};color:#9fb0bb;}
${R} .row b{min-width:0;margin-left:auto;padding-left:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:800 20px/24px var(--font-big);color:#e9f1f6;}
${R} .row::before{content:attr(data-ch);flex:none;align-self:center;width:28px;height:28px;margin-right:12px;display:grid;place-items:center;background:#1c252d center 18%/cover no-repeat;box-shadow:inset 0 -2px 0 var(--ac);font:700 13px/1 ${CJK};color:#7fd0ff;}
${R} .row[data-kind="feat"]::before{content:"\\25C6";font-size:12px;}
${R} .row[data-kind="ally"][style*="--pic"]::before{content:"";background-image:var(--pic);background-size:260% auto;background-position:50% 6%;}
${R} .row[data-tone="good"] b{color:#5fd39a;}
${R} .row[data-tone="bad"] b{color:#ff6b6b;}

/* 可点区：战利品 / 收获 / 按钮 */
${R} .rs-ui{position:relative;grid-area:4/1/5/3;right:auto;top:auto;width:auto;align-self:end;z-index:5;display:grid;grid-template-columns:3fr 2fr;gap:8px 10px;align-content:end;pointer-events:auto;animation:sfx-txr-rise ${T(450)} ease-out ${T(1500)} both;}
${P}.land .result .rs-ui{grid-area:4/2;margin-top:22px;align-self:start;}
${R} .rs-ui>*{grid-column:1/-1;min-width:0;}
${R} .rs-ui .igs-combat-loot{display:contents;}
${R} .rs-ui .igs-combat-loot>*{grid-column:1/-1;}
${R} .rs-ui .igs-combat-loot>.igs-combat-state{margin:0;font-size:13px;color:#9fb0bb;}
${R} .rs-ui .igs-combat-loot-cap{display:flex;align-items:center;gap:10px;font:700 13px/18px ${CJK};letter-spacing:.2em;color:#9fb0bb;text-shadow:none;}
${R} .rs-ui .igs-combat-loot-cap::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,#3a5163,rgba(58,81,99,0));}
${R} .rs-ui .igs-combat-loot-row{--loot-w:calc((100% - (var(--n,3) - 1) * 8px) / var(--n,3));justify-content:flex-start;gap:8px;}
${R} .igs-combat-loot-card{--ln:#26323c;--rar:#9fb0bb;width:var(--loot-w);aspect-ratio:auto;height:var(--tx-card);border-radius:0;color:#e9f1f6;}
${R} .igs-combat-loot-card[data-rarity="common"]{--rar:#9fb0bb;}
${R} .igs-combat-loot-card[data-rarity="uncommon"]{--rar:#6fe0b0;--ln:#6fe0b0;}
${R} .igs-combat-loot-card[data-rarity="rare"],${R} .igs-combat-loot-card[data-rarity="personal"]{--rar:#b49cff;--ln:#b49cff;}
${R} .igs-combat-loot-card[data-rarity="epic"]{--rar:#ffd36e;--ln:#ffd36e;}
${R} .igs-combat-loot-card[data-rarity="mythic"]{--rar:#ff6f7d;--ln:#ff6f7d;}
${R} .igs-combat-loot-card[data-rarity="signature"]{--rar:#ff7a3d;--ln:#ff7a3d;}
${R} .igs-combat-loot-card.is-chosen{transform:none;}
${R} .igs-combat-loot-card.is-dim{opacity:1;filter:brightness(.62) saturate(.7);}
${R} .igs-combat-loot-back,${R} .igs-combat-loot-face{inset:0;border-radius:0;isolation:isolate;background:var(--ln);box-shadow:none;clip-path:${CH('10px')};}
${R} .igs-combat-loot-back::before,${R} .igs-combat-loot-face::before{content:"";position:absolute;inset:1px;z-index:-1;background:#12171c;clip-path:${CHI('10px')};}
${R} .igs-combat-loot-back::after{left:50%;top:50%;width:22px;height:22px;aspect-ratio:auto;background:none;border:1px solid #3a5163;}
${R} .igs-combat-loot-face{gap:8px;padding:12px 6px;}
${R} .igs-combat-loot-tag{font-size:12px;letter-spacing:.04em;}
${R} .igs-combat-loot-name{font-size:16px;line-height:1.25;color:#e9f1f6;}
${R} .igs-combat-loot-card:is([data-rarity="epic"],[data-rarity="mythic"]) .igs-combat-loot-name{color:#e9f1f6;}
${R} .igs-combat-loot-origin{font-size:11px;color:#9fb0bb;-webkit-line-clamp:1;}
${R} .igs-combat-loot-card.is-chosen .igs-combat-loot-face{box-shadow:none;}
${R} .igs-combat-loot-card.is-chosen .igs-combat-loot-face::after{content:"已选";position:absolute;top:0;right:0;padding:0 6px;font:700 12px/16px ${CJK};background:#7fd0ff;color:#07090b;}
${R} .igs-combat-loot-tools{margin-top:8px;display:flex;}
${R} .rs-ui:has(.igs-combat-actions>.igs-combat-btn) .igs-combat-loot-tools{grid-column:1;}
${R} .rs-ui:has(.igs-combat-loot-tools) .igs-combat-actions:not(:empty){grid-column:2;}
${R} .igs-combat-actions{display:flex;gap:10px;margin-top:8px;justify-content:stretch;}
${R} .igs-combat-btn{flex:3;min-height:48px;height:48px;padding:0 8px;border-radius:0;background:#181f26;color:#e9f1f6;font:700 15px/1 ${CJK};letter-spacing:.04em;white-space:nowrap;box-shadow:none;clip-path:${CH('10px')};}
${R} .igs-combat-btn:hover{background:#222b34;color:#e9f1f6;}
${R} .igs-combat-btn.is-primary{flex:2;padding:0 8px;background:var(--ac);color:#07090b;font-weight:800;letter-spacing:.04em;}
${R} .igs-combat-btn.is-primary:hover{background:var(--ac);opacity:.88;}
${R} .igs-combat-btn[disabled],${R} .igs-combat-btn[aria-disabled="true"]{opacity:.5;}
${R} .igs-combat-loot-tools .igs-combat-btn{flex:1;}
${R} .igs-challenge-harvest{display:flex;flex-direction:column;gap:8px;padding:0;align-items:stretch;margin-bottom:8px;}
${R} .igs-challenge-harvest-row{position:relative;display:flex;flex-wrap:wrap;align-items:baseline;gap:0 10px;padding:10px 14px;background:#12171c;--cs:8px;--rc:#26323c;clip-path:${CH('8px')};color:#e9f1f6;font-size:14px;}
${R} .igs-challenge-harvest-row::after{content:"";position:absolute;inset:0;pointer-events:none;background:var(--rc);clip-path:var(--ring-s);}
${R} .igs-challenge-harvest-row .igs-combat-label{font:400 14px/24px ${CJK};color:#9fb0bb;}
${R} .igs-challenge-harvest-row b{margin-left:auto;font:800 20px/24px var(--font-big);color:#e9f1f6;}
${R} .igs-challenge-harvest-row small{flex-basis:100%;order:3;font-size:12px;line-height:1.4;color:#9fb0bb;}

/* 特效：六边形网格浮现、雷达环、扫描、ping、四角 HUD */
${R} .tx-hx{position:absolute;grid-area:1/2;inset:-126px -20px -186px 66px;z-index:0;pointer-events:none;opacity:.5;--tx-mr:2400px;--mx:calc(100% - 138px);--my:180px;
 -webkit-mask:radial-gradient(circle at var(--mx) var(--my),#000 0,#000 calc(var(--tx-mr) * .7),transparent var(--tx-mr));mask:radial-gradient(circle at var(--mx) var(--my),#000 0,#000 calc(var(--tx-mr) * .7),transparent var(--tx-mr));animation:sfx-txr-hx ${T(1500)} ease-out ${T(300)} both;}
${P}.land .result .tx-hx{inset:-400px -120px -400px -80px;opacity:1;--mx:calc(100% - 310px);--my:50%;}
${R} .tx-hx svg{position:absolute;inset:0;width:100%;height:100%;}
${R} .tx-rd{position:relative;grid-area:1/2;z-index:1;pointer-events:none;}
${R} .tx-rd i{position:absolute;left:50%;top:50%;border:1px solid #3a5163;border-radius:50%;transform:translate(-50%,-50%);}
${R} .tx-rd i:nth-child(1){width:64px;height:64px;border-color:var(--ac);}
${R} .tx-rd i:nth-child(2){width:128px;height:128px;}
${R} .tx-rd i:nth-child(3){width:196px;height:196px;opacity:.6;}
${R} .tx-rd u{position:absolute;left:-60px;right:-60px;top:50%;height:1px;background:#26323c;}
${R} .tx-rd s{position:absolute;top:-60px;bottom:-60px;left:50%;width:1px;background:#26323c;}
${R} .tx-sw{position:relative;grid-area:1/2;z-index:6;overflow:hidden;pointer-events:none;clip-path:${CH('14px')};animation:sfx-txr-swv ${T(1300)} linear ${T(200)} both;}
${R} .tx-sw::before{content:"";position:absolute;left:50%;top:50%;width:520px;height:520px;margin:-260px 0 0 -260px;background:conic-gradient(from 0deg,rgba(127,208,255,0) 0,rgba(127,208,255,0) 285deg,rgba(127,208,255,.3) 358deg,#cfeeff 360deg);animation:sfx-txr-spin ${T(1300)} linear ${T(200)} both;}
${R}.lose .tx-sw::before{background:conic-gradient(from 0deg,rgba(255,122,61,0) 0,rgba(255,122,61,0) 285deg,rgba(255,122,61,.3) 358deg,#ffd2bd 360deg);animation:sfx-txr-spinx ${T(1300)} cubic-bezier(.1,.7,.3,1) ${T(200)} both;}
${R} .tx-pg{position:relative;grid-area:1/2;z-index:2;pointer-events:none;}
${R} .tx-pg::before{content:"";position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px;border:1.25px solid #7fd0ff;border-radius:50%;opacity:0;animation:sfx-txr-ping-ring ${T(900)} ease-out ${T(1500)} both;}
${R} .tx-hc{position:absolute;z-index:3;width:20px;height:20px;border:0 solid var(--ac);pointer-events:none;animation:sfx-txr-hc ${T(350)} ease-out ${T(300)} both;}
${R} .tx-hc.a{left:14px;top:14px;border-width:1.25px 0 0 1.25px;}${R} .tx-hc.b{right:14px;top:14px;border-width:1.25px 1.25px 0 0;}
${R} .tx-hc.c{left:14px;bottom:14px;border-width:0 0 1.25px 1.25px;}${R} .tx-hc.d{right:14px;bottom:14px;border-width:0 1.25px 1.25px 0;}
${P}.land .result .tx-hc.a{left:24px;top:24px;}${P}.land .result .tx-hc.b{right:24px;top:24px;}${P}.land .result .tx-hc.c{left:24px;bottom:24px;}${P}.land .result .tx-hc.d{right:24px;bottom:24px;}
${R} .tx-tk{position:absolute;z-index:3;left:12px;width:1px;height:26px;background:var(--ac);pointer-events:none;animation:sfx-txr-fade ${T(400)} ease-out ${T(1200)} both;}
${R} .tx-tk.a{top:calc(50% - 40px);}${R} .tx-tk.b{top:calc(50% + 14px);}
${P}.land .result .tx-tk{left:22px;}

@keyframes sfx-txr-fade{from{opacity:0;}}
@keyframes sfx-txr-tolose{from{background:#7fd0ff;opacity:0;}40%{background:#7fd0ff;opacity:1;}to{background:#ff7a3d;opacity:1;}}
@keyframes sfx-txr-spin{to{transform:rotate(720deg);}}
@keyframes sfx-txr-spinx{to{transform:rotate(500deg);}}
@keyframes sfx-txr-swv{0%{opacity:1;}85%{opacity:1;}100%{opacity:0;}}
@keyframes sfx-txr-ping-ring{0%{opacity:1;transform:scale(1);}100%{opacity:0;transform:scale(9);}}
@keyframes sfx-txr-hc{from{opacity:0;transform:scale(1.6);}}
@keyframes sfx-txr-rise{from{opacity:0;transform:translateY(8px);}}
@keyframes sfx-txr-ping{from{opacity:0;clip-path:inset(0 100% 0 0);}to{opacity:1;clip-path:inset(0);}}
@keyframes sfx-txr-jit{0%{transform:translateX(-3px);}25%{transform:translateX(3px);}50%{transform:translateX(-2px);}75%{transform:translateX(1px);}100%{transform:none;}}
@keyframes sfx-txr-hx{from{--tx-mr:0px;}}
/* 未入场 / 减弱动效：直接落在终态 */
${ALL('#igs-combat-panel:not([data-igs-combat-result-in])')}, ${ALL('#igs-combat-panel[data-igs-combat-reduced]')}{animation-duration:0s !important;animation-delay:0s !important;}
`;
