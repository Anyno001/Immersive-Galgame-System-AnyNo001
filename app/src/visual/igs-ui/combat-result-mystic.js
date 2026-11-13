// 结算画面·mystic（星辉，概念 B）：金色地平线。版式见 计划-战斗结算返工.md。
// html 返回整段结算标记（替代通用 resultStageHtml）；decor 不用；css 只写 [data-skin="mystic"] 作用域。
// 战利品、挑战收获、按钮来自调用方的真实标记（ui），原样放进下方网格，外观全部靠这里的样式给到。

const STAR = 'M0-6L1.6-1.6L6 0L1.6 1.6L0 6L-1.6 1.6L-6 0L-1.6-1.6Z';
const GLYPHS = ['α', 'β', 'γ'];

export const html = (a) => {
    const { skin, orient, end, pics, esc, won, heroes, english, cssUrl, size } = a;
    const land = orient === 'land';
    const lead = heroes[0];
    const fig = lead && pics[lead] ? `<i class="mr-fig" style="background-image:${esc(cssUrl(pics[lead]))}"></i>` : '';
    const rows = [...(end.feats || []).map((f) => ['战功', f.title || '', 'hi']), ...(end.allies || []).map((x) => [x.name, x.injury || '', /倒下|力竭/.test(x.injury || '') ? 'dn' : ''])].slice(0, 3)
        .map(([k, v, c], i) => `<div class="mr-row ${c}" style="--d:${1100 + i * 150}ms"><span class="mr-g">${GLYPHS[i]}</span><span class="mr-k">${esc(k)}</span><span class="mr-v">${esc(v)}</span></div>`).join('');
    const star = `<svg class="mr-hzs" width="32" height="32" viewBox="-16 -16 32 32" aria-hidden="true"><path class="mr-st" style="--d:700ms" transform="scale(2.4)" d="${STAR}"/></svg>`;
    return `<section class="igs-sfx igs-sfx-result${land ? ' land' : ''}" data-sfx="${esc(a.style)}" data-skin="${esc(skin)}" data-outcome="${esc(end.outcome || '')}" style="--cw:var(--cx-w,${size.w}px);--ch:${size.h}px">`
        + `<div class="sfx-canvas"><div class="result mr${won ? '' : ' lose'}"><div class="veil"></div><div class="mr-shade"></div><div class="mr-frame">`
        + `${fig}<div class="mr-ttl mr-a" style="--d:500ms">${esc(end.label || '')}</div>`
        + `<div class="mr-hz"><div class="mr-hzl"></div>${star}</div>`
        + `<div class="mr-en mr-a" style="--d:1000ms">${esc(english)}</div><div class="mr-rd mr-a" style="--d:1000ms">回合<b>${esc(end.turn ?? '')}</b></div>`
        + `<div class="mr-low"><div class="mr-rows">${rows}</div>${a.ui}</div>`
        + `</div></div></div></section>`;
};
export const decor = () => '';

const S = '#igs-overlay .igs-sfx-result[data-skin="mystic"]';
const P = `${S}:not(.land)`;
const L = `${S}.land`;
const T = (ms) => `calc(${ms}ms * var(--k,1))`;
const BACK_STAR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='-12 -12 24 24'%3E%3Cpath d='M0-9L3-3L9 0L3 3L0 9L-3 3L-9 0L-3-3Z' fill='none' stroke='%237a7888' stroke-width='1.4'/%3E%3C/svg%3E\")";

export const css = `
${S} .mr{--text:#ebe7da;--dim:#a8a595;--faint:#7a7888;--gold:#b9a46a;--gold-hi:#e3d49c;--gd:#8c7d4e;--red:#d06a68;--violet:#a897d6;--blue:#8fa8d8;--shade:#0f1015;--star-off:#3a3a46;--num:"Cinzel","LXGW Neo ZhiSong",serif;--ttl:"Tsanger YuYang","LXGW Neo ZhiSong",serif;color:var(--text);}
${S} .mr.lose{--gold:#8e4d50;--gold-hi:#c9908c;--gd:#6a3a3d;}
${S} .mr .veil{-webkit-backdrop-filter:brightness(.36) saturate(.7);backdrop-filter:brightness(.36) saturate(.7);}
${S} .mr.lose .veil{-webkit-backdrop-filter:brightness(.26) saturate(.18);backdrop-filter:brightness(.26) saturate(.18);}
${S} .mr-shade{position:absolute;inset:0;pointer-events:none;}
${P} .mr-shade{background:linear-gradient(180deg,rgba(15,16,21,0) 52%,var(--shade) 80%);}
${L} .mr-shade{background:linear-gradient(90deg,rgba(15,16,21,0) 40%,var(--shade) 100%);}
${S} .mr-frame{position:absolute;top:0;bottom:0;left:50%;pointer-events:none;}
${P} .mr-frame{width:390px;margin-left:-195px;}
${L} .mr-frame{width:1280px;margin-left:-640px;}
${S} .mr-frame>*{position:absolute;}
/* 立绘 */
${S} .mr-fig{background:center top / contain no-repeat;filter:brightness(.6) saturate(.8);-webkit-mask-image:linear-gradient(#000 62%,transparent 98%);mask-image:linear-gradient(#000 62%,transparent 98%);}
${S} .mr.lose .mr-fig{filter:brightness(.4) saturate(.15);}
${P} .mr-fig{left:-20px;top:110px;width:425px;height:580px;}
${L} .mr-fig{left:20px;top:24px;width:506px;height:690px;}
/* 星座连线与星点 */
${S} .mr-st{fill:var(--gold-hi);transform-box:fill-box;transform-origin:center;animation:mr-on ${T(450)} calc(var(--d) * var(--k,1)) backwards;}
${S} .mr.lose .mr-st{fill:var(--star-off);scale:.55;animation-name:mr-off;animation-duration:${T(500)};}
@keyframes mr-draw{from{stroke-dashoffset:1;}}
@keyframes mr-fade{from{opacity:0;}}
@keyframes mr-on{from{fill:#3a3a46;transform:scale(.4);}}
@keyframes mr-off{from{fill:#e3d49c;scale:1;}}
/* 标题、地平线、英文与回合 */
${S} .mr-ttl{text-align:center;font-family:var(--ttl);color:var(--text);letter-spacing:.22em;text-indent:.22em;line-height:1;white-space:nowrap;}
${S} .mr.lose .mr-ttl{color:#cdc6c2;}
${P} .mr-ttl{left:0;width:390px;top:450px;font-size:56px;}
${L} .mr-ttl{left:540px;width:720px;top:262px;font-size:92px;}
${S} .mr-hz{height:0;}
${P} .mr-hz{left:20px;width:350px;top:522px;}
${L} .mr-hz{left:560px;width:680px;top:372px;}
${S} .mr-hzl{position:absolute;left:0;right:0;top:-1.25px;height:2.5px;background:var(--gold);clip-path:polygon(0 50%,6% 0,94% 0,100% 50%,94% 100%,6% 100%);animation:mr-hz ${T(1100)} ${T(200)} backwards;}
${S} .mr.lose .mr-hzl{-webkit-mask-image:linear-gradient(90deg,#000 0 45%,transparent 45% 51%,#000 51% 81%,transparent 81%);mask-image:linear-gradient(90deg,#000 0 45%,transparent 45% 51%,#000 51% 81%,transparent 81%);}
${S} .mr-hzs{position:absolute;left:50%;top:-16px;margin-left:-16px;overflow:visible;}
@keyframes mr-hz{from{transform:scaleX(0);}}
${S} .mr-en{font-family:var(--num);color:var(--gold-hi);font-size:14px;letter-spacing:.34em;text-indent:.34em;text-align:center;line-height:1;white-space:nowrap;}
${P} .mr-en{left:0;width:390px;top:542px;}
${L} .mr-en{left:540px;width:720px;top:394px;}
${S} .mr-rd{color:var(--dim);font-size:12px;letter-spacing:.2em;line-height:1;white-space:nowrap;text-align:right;}
${S} .mr-rd b{font-family:var(--num);font-weight:500;font-size:22px;color:var(--gold-hi);margin-left:8px;letter-spacing:0;}
${P} .mr-rd{right:36px;top:546px;}
${L} .mr-rd{right:60px;top:394px;}
${S} .mr-a{animation:mr-rin ${T(550)} calc(var(--d,900ms) * var(--k,1)) backwards;}
@keyframes mr-rin{from{opacity:0;transform:translateY(7px);}}
/* 下方网格：数据行 + 真实的收获 / 战利品 / 按钮 */
${S} .mr-low{pointer-events:auto;display:grid;align-items:start;column-gap:8px;}
${P} .mr-low{left:36px;right:36px;top:584px;grid-template-columns:1.7fr 1fr;}
${L} .mr-low{left:580px;top:440px;width:640px;grid-template-columns:268px 164px 1fr;}
${S} .mr-rows{display:flex;flex-direction:column;}
${P} .mr-rows{grid-column:1 / -1;grid-row:1;}
${L} .mr-rows{grid-column:1;grid-row:1 / span 3;}
${S} .mr-row{position:relative;display:flex;align-items:center;justify-content:space-between;padding:0 4px 0 26px;animation:mr-rin ${T(550)} calc(var(--d,900ms) * var(--k,1)) backwards;}
${S} .mr-row::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,var(--gold),var(--gold) 55%,rgba(15,16,21,0));}
${S} .mr-g{position:absolute;left:4px;font-family:var(--num);color:var(--gd);font-size:12px;}
${S} .mr-k{color:var(--dim);letter-spacing:.12em;}
${S} .mr-v{font-family:var(--ttl);letter-spacing:.1em;color:var(--text);}
${S} .mr-row.hi .mr-v{color:var(--gold-hi);}
${S} .mr-row.dn .mr-v{color:var(--red);}
${P} .mr-row{height:28px;}
${P} .mr-k{font-size:13px;}
${P} .mr-v{font-size:16px;}
${L} .mr-row{height:38px;}
${L} .mr-k{font-size:14px;}
${L} .mr-v{font-size:18px;}
/* 挑战收获 */
${S} .igs-challenge-harvest{gap:0;align-items:stretch;padding:0;margin:0;}
${P} .igs-challenge-harvest{grid-column:1 / -1;grid-row:2;margin-top:14px;}
${L} .igs-challenge-harvest{grid-column:2 / 4;grid-row:1;margin-left:16px;}
${S} .igs-challenge-harvest-row{position:relative;display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;padding:6px 4px 6px 26px;color:var(--text);font-size:14px;}
${S} .igs-challenge-harvest-row::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,var(--gd),var(--gd) 55%,rgba(15,16,21,0));}
${S} .igs-challenge-harvest-row::before{content:"\\25C6";position:absolute;left:5px;top:50%;margin-top:-6px;color:var(--gold-hi);font-size:9px;}
${S} .igs-challenge-harvest-row .igs-combat-label{color:var(--dim);font-size:13px;letter-spacing:.12em;}
${S} .igs-challenge-harvest-row b{margin-left:auto;font-family:var(--ttl);font-weight:400;color:var(--gold-hi);font-size:16px;letter-spacing:.1em;}
${S} .igs-challenge-harvest-row small{flex-basis:100%;color:var(--faint);font-size:12px;letter-spacing:.06em;line-height:1.4;}
/* 战利品：外层 section 不占盒，标题、牌行、重新抽取按钮各自进网格 */
${S} .igs-combat-loot{display:contents;}
${S} .igs-combat-loot-cap{display:flex;align-items:center;gap:10px;color:var(--dim);font-size:12px;font-weight:400;letter-spacing:.3em;text-shadow:none;margin-top:20px;margin-bottom:6px;}
${S} .igs-combat-loot-cap::before,${S} .igs-combat-loot-cap::after{content:"";flex:1;height:2px;background:linear-gradient(90deg,rgba(15,16,21,0),var(--gd));}
${S} .igs-combat-loot-cap::after{transform:scaleX(-1);}
${S} .igs-combat-loot-row{--loot-w:auto;gap:9px;width:auto;justify-content:stretch;}
${S} .igs-combat-loot>.igs-combat-state{margin:20px 0 0;color:var(--dim);font-size:13px;letter-spacing:.2em;text-shadow:none;text-align:left;}
${P} .igs-combat-loot-cap,${P} .igs-combat-loot-row,${P} .igs-combat-loot>.igs-combat-state{grid-column:1 / -1;}
${P} .igs-combat-loot-cap,${P} .igs-combat-loot>.igs-combat-state{grid-row:3;}
${P} .igs-combat-loot-row{grid-row:4;height:54px;}
${L} .igs-combat-loot-cap,${L} .igs-combat-loot-row,${L} .igs-combat-loot>.igs-combat-state{grid-column:2 / 4;margin-left:16px;}
${L} .igs-combat-loot-cap{margin-top:0;}
${L} .igs-combat-loot>.igs-combat-state{margin-top:0;}
${L} .igs-combat-loot-cap,${L} .igs-combat-loot>.igs-combat-state{grid-row:2;}
${L} .igs-combat-loot-row{grid-row:3;height:76px;}
/* 三选一候选牌是完整卡面：下方网格上移，牌行改自适应高度 */
${P} .mr-low:has(.igs-combat-loot-choices) .mr-rows{display:none;}
${P} .mr-low:has(.igs-combat-loot-choices) .igs-combat-loot-row.igs-combat-loot-choices{grid-row:4;height:auto;display:block;}
${L} .mr-low:has(.igs-combat-loot-choices){top:362px;}
${L} .mr-low:has(.igs-combat-loot-choices) .mr-rows{display:none;}
${L} .mr-low:has(.igs-combat-loot-choices) :is(.igs-combat-loot-cap,.igs-combat-loot-row.igs-combat-loot-choices){grid-column:1 / -1;margin-left:0;}
${L} .mr-low:has(.igs-combat-loot-choices) .igs-combat-loot-row.igs-combat-loot-choices{grid-row:3;height:auto;display:block;}
${S} .igs-combat-loot-card{--rar:var(--faint);flex:1;width:auto;min-width:0;aspect-ratio:auto;height:100%;background:#1c1c1e;border:2px solid #34343e;border-radius:2px;box-shadow:none;transform:none;opacity:1;}
${S} .igs-combat-loot-card[data-rarity="epic"]{--rar:var(--violet);}
${S} .igs-combat-loot-card[data-rarity="rare"]{--rar:var(--blue);}
${S} .igs-combat-loot-card[data-rarity="uncommon"]{--rar:#8fc4ae;}
${S} .igs-combat-loot-card[data-rarity="common"]{--rar:var(--dim);}
${S} .igs-combat-loot-card[data-rarity="mythic"]{--rar:var(--red);}
${S} button.igs-combat-loot-card:not([aria-disabled="true"]):hover{transform:none;background:#25262e;}
${S} .igs-combat-loot-card.is-chosen{border-color:var(--gold);transform:none;}
${S} .igs-combat-loot-card.is-chosen .igs-combat-loot-face{box-shadow:none;}
${S} .igs-combat-loot-card.is-dim{opacity:1;}
${S} .igs-combat-loot-card:not(.is-face){background:#16171c;border-color:#2c2c36;}
${S} .igs-combat-loot-back{background:${BACK_STAR} center / 26px no-repeat;box-shadow:none;border-radius:0;}
${S} .igs-combat-loot-back::after{display:none;}
${S} .igs-combat-loot-face{padding:4px 4px;gap:3px;background:none;box-shadow:none;border-radius:0;}
${S} .igs-combat-loot-tag{order:-1;display:flex;align-items:center;gap:5px;color:var(--rar);font-size:12px;font-weight:400;letter-spacing:.14em;line-height:1.1;}
${S} .igs-combat-loot-tag::before{content:"";width:5px;height:5px;background:currentColor;transform:rotate(45deg);}
${S} .igs-combat-loot-name{order:0;font-family:var(--ttl);font-weight:400;font-size:16px;letter-spacing:.08em;line-height:1.15;color:var(--text);}
${S} .igs-combat-loot-card:is([data-rarity="epic"],[data-rarity="mythic"]) .igs-combat-loot-name{color:var(--text);}
${S} .igs-combat-loot-card.is-chosen .igs-combat-loot-name{color:var(--gold-hi);}
${S} .igs-combat-loot-origin{display:none;}
/* 按钮：重新抽取（战利品区内）与主按钮 / 重新开始（actions）同排，实色不描边；横屏与左侧数据列左对齐 */
${S} .igs-combat-loot-tools{display:flex;justify-content:stretch;}
${S} .igs-combat-actions{display:flex;flex-wrap:nowrap;gap:8px;justify-content:stretch;}
${S} .igs-combat-actions:empty{display:none;}
${S} .igs-combat-btn{flex:1.7;min-width:0;height:100%;min-height:0;padding:0 8px;border:0;border-radius:2px;background:#25262e;color:var(--text);font-family:var(--ttl);font-weight:400;font-size:14px;letter-spacing:.1em;white-space:nowrap;}
${S} .igs-combat-btn:hover{background:#2f3039;color:var(--text);}
${S} .igs-combat-btn.is-primary{flex:1;padding:0 8px;background:#ebe7da;color:#121212;font-weight:400;font-size:14px;letter-spacing:.1em;}
${S} .igs-combat-btn.is-primary:hover{background:#f4efe0;opacity:1;}
${S} .igs-combat-btn[disabled],${S} .igs-combat-btn[aria-disabled="true"]{opacity:.45;cursor:default;}
${S} .igs-combat-loot-tools .igs-combat-btn{width:100%;flex:none;}
${S} .igs-combat-loot-tools,${S} .igs-combat-actions{margin-top:12px;}
${P} .igs-combat-loot-tools,${P} .igs-combat-actions{grid-row:5;height:40px;}
${P} .igs-combat-loot-tools{grid-column:1;}
${P} .igs-combat-actions{grid-column:1 / -1;}
${P} .mr-low:has(.igs-combat-loot-tools) .igs-combat-actions{grid-column:2;}
${L} .igs-combat-loot-tools,${L} .igs-combat-actions{grid-row:4;height:46px;margin-top:28px;}
${L} .igs-combat-loot-tools{grid-column:1;}
${L} .igs-combat-actions{grid-column:1 / 3;}
${L} .mr-low:has(.igs-combat-loot-tools) .igs-combat-actions{grid-column:2;}
${L} .igs-combat-btn{font-size:15px;}
/* 入场结束后重绘不再重播入场动画；减少动态效果时直接到位 */
#igs-overlay #igs-combat-panel:not([data-igs-combat-result-in]) ${S.replace('#igs-overlay ', '')} .mr :is(.mr-a,.mr-row,.mr-st,.mr-hzl){animation-duration:0s;animation-delay:0s;}
#igs-overlay #igs-combat-panel[data-igs-combat-reduced] ${S.replace('#igs-overlay ', '')} .mr :is(.mr-a,.mr-row,.mr-st,.mr-hzl){animation-duration:0s;animation-delay:0s;}
`;
