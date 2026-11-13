// 结算画面·soft-a（邮票卡）：版式见 计划-战斗结算返工.md。html 返回整段结算标记；样式只写 [data-skin="soft-a"] 作用域。
// 竖屏不出立绘，邮票卡在画布内水平垂直居中、按内容撑高；横屏立绘在左、卡在右。
// ui（战利品、挑战收获、按钮的真实标记）经 display:contents 的容器并入卡片纵向排布，样式落在真实 class 上。
const FLOWER = '<svg viewBox="0 0 100 100" aria-hidden="true"><g class="pt"><circle cx="50" cy="22" r="22"/><circle cx="76.6" cy="41.3" r="22"/><circle cx="66.4" cy="72.7" r="22"/><circle cx="33.6" cy="72.7" r="22"/><circle cx="23.4" cy="41.3" r="22"/><circle cx="50" cy="50" r="28"/></g><circle class="ds" cx="50" cy="50" r="26"/></svg>';
const MILD = /^(无伤|轻伤|从容)$/;
const EN = { victory: 'VICTORY', defeat: 'DEFEAT', escape: 'ESCAPE' };

export const html = ({ skin, orient, end, pics, ui, esc, style, size, won, heroes, cssUrl }) => {
    const land = orient === 'land';
    const rows = [...(end.feats || []).map((f) => ['', '战功', f.title || '', 0]), ...(end.allies || []).map((a, i) => [Array.from(a.name || '')[0] || '', a.name, a.injury || '', i])].slice(0, 3)
        .map(([c, h, v, i], n) => `<div class="rs-row" style="--i:${n}"><span class="lb">${c ? `<span class="av${i % 2 ? ' m' : ''}">${esc(c)}</span>` : ''}${esc(h)}</span><span class="vl${MILD.test(v) ? ' ok' : ''}">${esc(v)}</span></div>`).join('');
    const lead = heroes[0];
    const sp = land && lead && pics[lead] ? `<i class="sp" style="background-image:${esc(cssUrl(pics[lead]))}"></i>` : '';
    const label = String(end.label ?? '');
    return `<section class="igs-sfx igs-sfx-result${land ? ' land' : ''}" data-sfx="${esc(style)}" data-skin="${esc(skin)}" data-outcome="${esc(end.outcome || '')}" style="--cw:var(--cx-w,${size.w}px);--ch:${size.h}px">`
        + `<div class="sfx-canvas"><div class="result${won ? '' : ' lose'}"><div class="veil"></div>${sp}<div class="rs-stage">`
        + `<div class="card"><div class="stamp perf"><div class="in">`
        + `<div class="head"><div class="tx"><div class="tt" data-n="${Math.min(Array.from(label).length, 5)}">${esc(label)}</div><div class="en">${esc(EN[end.outcome] || '')}</div></div>`
        + `<div class="fw"><div class="flower">${FLOWER}<b>${esc(end.turn ?? '')}</b></div><div class="cap">回合</div></div></div>`
        + `<div class="rs-rows">${rows}</div><div class="ui-slot">${ui}</div>`
        + `</div></div></div></div></div></section>`;
};
export const decor = () => '';

const S = '#igs-overlay .igs-sfx-result[data-skin="soft-a"]';
const T = (ms) => `calc(${ms}ms * var(--k,1))`;
const DOTS = 'radial-gradient(circle,var(--dot) 2px,transparent 2.6px)';
export const css = `
${S}{--ink:#1d1b1e;--cream:#f6efe4;--cream2:#e9e0d2;--txt:#38333a;--txt2:#6f666e;--pink:#f2a1ac;--pinkd:#d9566b;--mint:#a8d8bf;--green:#3f9a78;--gold:#c48a22;--blue:#4f86c6;font-family:var(--display);}
${S} .result{--blk:var(--pinkd);--dot:#e0697d;--ttl:#fbe3e6;--paper:var(--cream);--fd:var(--pinkd);}
${S} .result.lose{--blk:#cfc6cb;--dot:#c4babf;--ttl:#4a444b;--paper:#ece6dd;--fd:#8a808a;}
${S} .sp{position:absolute;left:150px;top:10px;width:513px;height:700px;background:center top/contain no-repeat;-webkit-mask-image:linear-gradient(#000 82%,transparent 99%);mask-image:linear-gradient(#000 82%,transparent 99%);filter:drop-shadow(0 8px 18px #1d1b1e);animation:sfxa-sprite ${T(600)} ease-out backwards;}
${S} .result.lose .sp{filter:saturate(.5) brightness(.82) drop-shadow(0 8px 18px #1d1b1e);}
${S} .rs-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
${S}.land .rs-stage{justify-content:flex-end;padding-right:70px;}
${S} .card{width:300px;flex:none;pointer-events:auto;filter:drop-shadow(0 5px 12px #1d1b1e);}
${S}.land .card{width:400px;}
${S} .perf{--t:10px;padding:calc(var(--t) / 2);-webkit-mask:linear-gradient(#000,#000) content-box no-repeat,radial-gradient(circle,transparent calc(var(--t) * .3),#000 calc(var(--t) * .34)) calc(var(--t) / -2) calc(var(--t) / -2) / var(--t) var(--t) round;mask:linear-gradient(#000,#000) content-box no-repeat,radial-gradient(circle,transparent calc(var(--t) * .3),#000 calc(var(--t) * .34)) calc(var(--t) / -2) calc(var(--t) / -2) / var(--t) var(--t) round;mask-composite:add;-webkit-mask-composite:source-over;}
${S} .stamp{background:var(--paper);display:flex;flex-direction:column;}
${S} .in{display:flex;flex-direction:column;padding-bottom:14px;}
${S}.land .in{padding-bottom:20px;}
${S} .head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 12px;border-radius:10px;margin:5px 5px 0;background-color:var(--blk);background-image:${DOTS};background-size:14px 14px;background-position:7px 7px;}
${S}.land .head{padding:18px 22px 16px;}
${S} .tx{display:flex;flex-direction:column;min-width:0;}
${S} .fw{display:flex;flex-direction:column;align-items:center;flex:none;}
${S} .tt{font-size:44px;font-weight:700;line-height:1.05;color:#fff8f2;letter-spacing:.06em;white-space:nowrap;}
${S} .tt[data-n="4"]{font-size:38px;}
${S} .tt[data-n="5"]{font-size:30px;}
${S}.land .tt{font-size:52px;}
${S}.land .tt[data-n="4"]{font-size:46px;}
${S}.land .tt[data-n="5"]{font-size:38px;}
${S} .result.lose .tt{color:#3a353c;}
${S} .en{font-size:12px;font-weight:700;letter-spacing:.3em;color:var(--ttl);margin-top:6px;}
${S} .flower{position:relative;width:76px;height:76px;flex:none;rotate:6deg;}
${S}.land .flower{width:92px;height:92px;}
${S} .flower svg{position:absolute;inset:0;width:100%;height:100%;}
${S} .flower .pt{fill:var(--cream);}
${S} .flower .ds{fill:var(--fd);}
${S} .flower b{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font-size:27px;line-height:1;color:#fff8f2;font-weight:700;}
${S}.land .flower b{font-size:33px;}
${S} .cap{font-size:12px;font-weight:700;letter-spacing:.2em;color:var(--ttl);text-align:center;margin-top:4px;padding-left:.2em;}
${S} :is(.rs-rows,.igs-challenge-harvest,.igs-combat-loot,.igs-combat-actions){margin-left:14px;margin-right:14px;}
${S}.land :is(.rs-rows,.igs-challenge-harvest,.igs-combat-loot,.igs-combat-actions){margin-left:22px;margin-right:22px;}
${S} .rs-rows{display:flex;flex-direction:column;margin-top:8px;}
${S}.land .rs-rows{margin-top:12px;}
${S} .ui-slot{display:contents;}
${S} .rs-row,${S} .igs-challenge-harvest-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;padding:0 2px;background-image:radial-gradient(circle,var(--pink) 1.1px,transparent 1.6px);background-size:8px 3px;background-repeat:repeat-x;background-position:0 100%;}
${S}.land :is(.rs-row,.igs-challenge-harvest-row){min-height:54px;}
${S} .rs-row:last-child,${S} .igs-challenge-harvest-row:last-child{background-image:none;}
${S} .lb,${S} .igs-challenge-harvest-row .igs-combat-label{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--txt2);min-width:0;letter-spacing:0;font-weight:400;}
${S} .vl,${S} .igs-challenge-harvest-row b{font-size:18px;font-weight:700;color:var(--pinkd);}
${S} .vl.ok{color:var(--green);}
${S} .result.lose .vl{color:var(--txt2);}
${S} .av{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;font-style:normal;color:var(--ink);background:var(--pink);}
${S} .av.m{background:var(--mint);}
${S} .result.lose .av{background:#cfc6cb;}
${S} .igs-challenge-harvest{display:flex;flex-direction:column;align-items:stretch;gap:0;padding:0;background-image:radial-gradient(circle,var(--pink) 1.1px,transparent 1.6px);background-size:8px 3px;background-repeat:repeat-x;background-position:0 0;}
${S} .igs-challenge-harvest-row{flex-wrap:wrap;align-content:center;row-gap:0;padding-top:8px;padding-bottom:8px;}
${S} .igs-challenge-harvest-row small{flex-basis:100%;order:3;margin-top:2px;text-align:right;font-size:12px;color:var(--txt2);}
${S} .igs-combat-loot{display:flex;flex-direction:column;align-items:stretch;gap:0;margin-top:10px;}
${S}.land .igs-combat-loot{margin-top:18px;}
${S} .igs-combat-state{margin:4px 0 0;font-size:14px;color:var(--txt2);text-shadow:none;letter-spacing:0;text-align:center;}
${S} .igs-combat-loot-cap{font-size:12px;font-weight:700;color:var(--txt2);letter-spacing:.2em;margin:2px 0 6px;text-shadow:none;text-align:left;}
${S}.land .igs-combat-loot-cap{margin:4px 0 8px;}
${S} .igs-combat-loot-row{display:flex;justify-content:flex-start;gap:6px;width:100%;}
${S} .igs-combat-loot-card{--rar:var(--txt2);flex:1 1 0;min-width:0;width:auto;aspect-ratio:auto;min-height:96px;display:flex;border-radius:5px;background:var(--cream2);color:var(--txt);transform:none;font-size:14px;}
${S}.land .igs-combat-loot-card{min-height:128px;}
${S} .igs-combat-loot-card[data-rarity="common"]{--rar:var(--txt2);}
${S} .igs-combat-loot-card[data-rarity="uncommon"]{--rar:var(--green);}
${S} .igs-combat-loot-card[data-rarity="rare"]{--rar:var(--blue);}
${S} .igs-combat-loot-card[data-rarity="epic"]{--rar:var(--gold);}
${S} .igs-combat-loot-card:is([data-rarity="mythic"],[data-rarity="signature"],[data-rarity="personal"]){--rar:var(--pinkd);}
${S} button.igs-combat-loot-card:not([aria-disabled="true"]):hover{transform:none;}
${S} .igs-combat-loot-card.is-dim{opacity:1;}
${S} .igs-combat-loot-card.is-chosen{background:#fffaf2;box-shadow:inset 0 0 0 2px var(--pinkd);transform:none;}
${S} .igs-combat-loot-face{position:relative;inset:auto;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:6px 4px;background:none;box-shadow:none;border-radius:inherit;}
${S} .igs-combat-loot-card.is-chosen .igs-combat-loot-face{box-shadow:none;}
${S} .igs-combat-loot-tag{font-size:12px;font-weight:700;letter-spacing:0;color:var(--rar);white-space:nowrap;}
${S} .igs-combat-loot-name{font-size:14px;font-weight:700;color:var(--txt);line-height:1.3;}
${S} .igs-combat-loot-card:is([data-rarity="epic"],[data-rarity="mythic"]) .igs-combat-loot-name{color:var(--txt);}
${S} .igs-combat-loot-origin{font-size:12px;color:var(--txt2);-webkit-line-clamp:2;}
${S} .igs-combat-loot-card.is-chosen .igs-combat-loot-face::after{content:"已选";margin-top:2px;height:18px;line-height:18px;padding:0 8px;border-radius:999px;background:var(--mint);color:var(--ink);font-size:12px;font-weight:700;}
${S} .igs-combat-loot-back{background:#fffaf2;border:2px dashed #d8cdbd;box-shadow:none;border-radius:inherit;}
${S} .igs-combat-loot-back::after{width:16px;height:16px;background:#eadfcf;border-radius:3px;}
${S} .igs-combat-loot-tools{display:flex;gap:8px;margin-top:8px;}
${S} .igs-combat-actions{display:flex;flex-direction:column;align-items:stretch;gap:8px;margin-top:16px;margin-bottom:0;}
${S}.land .igs-combat-actions{margin-top:20px;}
${S} .igs-combat-loot ~ .igs-combat-actions{margin-top:8px;}
${S} .igs-combat-btn{width:100%;height:42px;min-height:42px;padding:0 12px;border-radius:999px;font-size:14px;font-weight:700;letter-spacing:0;background:var(--cream2);color:var(--txt);}
${S} .igs-combat-btn:hover{background:#ded4c4;color:var(--txt);opacity:1;}
${S} .igs-combat-btn.is-primary{background:var(--pinkd);color:#fff8f2;padding:0 12px;letter-spacing:0;}
${S} .igs-combat-btn.is-primary:hover{background:#c84a5f;opacity:1;}
${S} .igs-combat-btn[aria-disabled="true"]{opacity:.5;}
${S} .result.lose .igs-combat-btn.is-primary{background:var(--txt2);}
${S} .result.lose .igs-combat-btn.is-primary:hover{background:#5f5860;}
${S} .result.lose .igs-combat-btn:not(.is-primary){background:#e3dcd2;}
@keyframes sfxa-drop{from{translate:0 -110%;rotate:-5deg;opacity:0}55%{translate:0 10px;rotate:1deg;opacity:1}78%{translate:0 -3px;rotate:0deg}to{translate:0 0;rotate:0deg}}
@keyframes sfxa-sink{from{translate:0 -60px;rotate:-1deg;opacity:0}to{translate:0 0;rotate:0deg;opacity:1}}
@keyframes sfxa-stamp{from{scale:1.9;opacity:0;rotate:-24deg}45%{scale:.84;opacity:1;rotate:5deg}70%{scale:1.07;rotate:-1deg}to{scale:1;rotate:6deg}}
@keyframes sfxa-stamp-lose{from{scale:1.25;opacity:0;rotate:-10deg}to{scale:1;opacity:1;rotate:6deg}}
@keyframes sfxa-fade{from{opacity:0;translate:0 8px}to{opacity:1;translate:0 0}}
@keyframes sfxa-pop{from{opacity:0;scale:.7}to{opacity:1;scale:1}}
@keyframes sfxa-sprite{from{opacity:0;translate:-16px 0}to{opacity:1;translate:0 0}}
@keyframes sfxa-blk{from{background-color:var(--pinkd)}to{background-color:var(--blk)}}
@keyframes sfxa-paper{from{background-color:var(--cream)}to{background-color:var(--paper)}}
@keyframes sfxa-fd{from{fill:var(--pinkd)}to{fill:var(--fd)}}
${S} .result:not(.lose) .card{animation:sfxa-drop ${T(750)} cubic-bezier(.2,.8,.2,1) ${T(150)} backwards;}
${S} .result.lose .card{animation:sfxa-sink ${T(800)} ease-out ${T(150)} backwards;}
${S} .result:not(.lose) .flower{animation:sfxa-stamp ${T(550)} cubic-bezier(.3,.7,.3,1) ${T(1000)} backwards;}
${S} .result.lose .flower{animation:sfxa-stamp-lose ${T(600)} ease-out ${T(1000)} backwards;}
${S} .result.lose .head{animation:sfxa-blk ${T(900)} ease ${T(1000)} backwards;}
${S} .result.lose .stamp{animation:sfxa-paper ${T(900)} ease ${T(1000)} backwards;}
${S} .result.lose .flower .ds{animation:sfxa-fd ${T(900)} ease ${T(1000)} backwards;}
${S} .rs-row{animation:sfxa-fade ${T(400)} ease backwards;animation-delay:calc(800ms * var(--k,1) + var(--i,0) * 120ms * var(--k,1));}
${S} .igs-challenge-harvest{animation:sfxa-fade ${T(400)} ease ${T(1100)} backwards;}
${S} .igs-combat-loot-card{animation:sfxa-pop ${T(350)} cubic-bezier(.3,1.3,.5,1) ${T(1300)} backwards;}
${S} .igs-combat-loot-card:nth-child(2){animation-delay:${T(1450)};}
${S} .igs-combat-loot-card:nth-child(3){animation-delay:${T(1600)};}
${S} .igs-combat-actions{animation:sfxa-fade ${T(400)} ease ${T(1900)} backwards;}
#igs-overlay #igs-combat-panel:not([data-igs-combat-result-in]) ${S.replace('#igs-overlay ', '')} :is(.sp,.card,.flower,.head,.stamp,.rs-row,.igs-challenge-harvest,.igs-combat-loot-card,.igs-combat-actions,.flower .ds),#igs-overlay #igs-combat-panel[data-igs-combat-reduced] ${S.replace('#igs-overlay ', '')} :is(.sp,.card,.flower,.head,.stamp,.rs-row,.igs-challenge-harvest,.igs-combat-loot-card,.igs-combat-actions,.flower .ds){animation-duration:0s;animation-delay:0s;}
`;
