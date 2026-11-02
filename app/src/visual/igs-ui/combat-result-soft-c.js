// 结算画面·soft-c（绘本页，雾蓝）：版式见 计划-战斗结算返工.md。html 返回整段结算标记；样式只写 [data-skin="soft-c"] 作用域。
// 竖屏不出立绘，纸页在画布内水平垂直居中、按内容撑高；横屏立绘在左、纸页在右。
// ui（战利品、挑战收获、按钮的真实标记）经 display:contents 的容器并入纸页纵向排布，样式落在真实 class 上。
const EN = { victory: 'VICTORY', defeat: 'DEFEAT', escape: 'ESCAPE' };
const FEAT_AV = '<i class="av pt flower"></i>';

export const html = ({ skin, orient, end, pics, ui, esc, style, size, won, heroes, cssUrl }) => {
    const land = orient === 'land';
    const rows = [...(end.feats || []).map((f) => ({ av: FEAT_AV, h: '战功', v: f.title || '' })), ...(end.allies || []).map((a, i) => ({ av: `<i class="av t${i % 2 ? 2 : 1}">${esc(Array.from(a.name || '')[0] || '')}</i>`, h: esc(a.name), v: a.injury || '' }))].slice(0, 3)
        .map((r) => `<div class="rs-r"><span class="l">${r.av}${r.h}</span><span class="d"></span><span class="v">${esc(r.v)}</span></div>`).join('');
    const lead = heroes[0];
    const spr = land && lead && pics[lead] ? `<i class="spr" style="background-image:${esc(cssUrl(pics[lead]))}"></i>` : '';
    const label = String(end.label ?? '');
    return `<section class="igs-sfx igs-sfx-result${land ? ' land' : ''}" data-sfx="${esc(style)}" data-skin="${esc(skin)}" data-outcome="${esc(end.outcome || '')}" style="--cw:var(--cx-w,${size.w}px);--ch:${size.h}px">`
        + `<div class="sfx-canvas"><div class="result${won ? '' : ' lose'}"><div class="veil"></div>${spr}<div class="rs-stage">`
        + `<div class="pgw"><div class="pg"><i class="fold"></i>`
        + `<div class="hd"><div class="ttl"><b data-n="${Math.min(Array.from(label).length, 5)}">${esc(label)}</b><small>${esc(EN[end.outcome] || '')}</small></div><div class="rnd"><div class="fl flower">${esc(end.turn ?? '')}</div><small>回合</small></div></div>`
        + `<div class="ln"></div><div class="toc">${rows}</div><div class="ui-slot">${ui}</div></div><div class="curl"></div></div>`
        + `</div></div></div></section>`;
};
export const decor = () => '';

const S = '#igs-overlay .igs-sfx-result[data-skin="soft-c"]';
const T = (ms) => `calc(${ms}ms * var(--k,1))`;
// 花形遮罩与战利品小图案：数据地址里的 # 写成 %23。
const PETAL = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cg fill='%23000'%3E%3Ccircle cx='20' cy='9.5' r='9'/%3E%3Ccircle cx='30' cy='16.8' r='9'/%3E%3Ccircle cx='26.2' cy='28.5' r='9'/%3E%3Ccircle cx='13.8' cy='28.5' r='9'/%3E%3Ccircle cx='10' cy='16.8' r='9'/%3E%3Ccircle cx='20' cy='20' r='10'/%3E%3C/g%3E%3C/svg%3E\")";
const petalFill = (c) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Cg fill='%23${c}'%3E%3Ccircle cx='20' cy='9.5' r='9'/%3E%3Ccircle cx='30' cy='16.8' r='9'/%3E%3Ccircle cx='26.2' cy='28.5' r='9'/%3E%3Ccircle cx='13.8' cy='28.5' r='9'/%3E%3Ccircle cx='10' cy='16.8' r='9'/%3E%3Ccircle cx='20' cy='20' r='10'/%3E%3C/g%3E%3C/svg%3E")`;
const PRINT = (c) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cg fill='%23${c}'%3E%3Ccircle cx='4' cy='2.6' r='1.3'/%3E%3Ccircle cx='5.4' cy='3.8' r='1.3'/%3E%3Ccircle cx='4.8' cy='5.4' r='1.3'/%3E%3Ccircle cx='3.2' cy='5.4' r='1.3'/%3E%3Ccircle cx='2.6' cy='3.8' r='1.3'/%3E%3Ccircle cx='12' cy='10.6' r='1.3'/%3E%3Ccircle cx='13.4' cy='11.8' r='1.3'/%3E%3Ccircle cx='12.8' cy='13.4' r='1.3'/%3E%3Ccircle cx='11.2' cy='13.4' r='1.3'/%3E%3Ccircle cx='10.6' cy='11.8' r='1.3'/%3E%3C/g%3E%3C/svg%3E")`;
const TILE = (print) => `${petalFill('fffaf2')} center/28px 28px no-repeat,${print} 0 0/14px 14px repeat`;
// 格纹：横纵条纹与交叉处三档实色（原稿半透明叠色换算而成）。
const PLAID = (a, b, base) => `conic-gradient(from 270deg,${b} 25%,transparent 0) 0 0/var(--ps) var(--ps),linear-gradient(90deg,${a} 50%,transparent 0) 0 0/var(--ps) var(--ps),linear-gradient(${a} 50%,transparent 0) 0 0/var(--ps) var(--ps),${base}`;

export const css = `
${S}{--ink:#2b2a2e;--dim:#6d6670;--pk:#8fb0d8;--pk-d:#4f74a8;--pk-l:#d9e5f4;--pk-xl:#eaf1fa;--btn:#4f74a8;--btn-d:#34527c;--cream:#f8f1e6;--rule:#9db8dc;--tone-a:#7ea8da;--tone-s:#86b4cf;--page:#f8f1e6;--g1:#bcd0e9;--g2:#a6c0e1;--gb:#eaf1fa;font-family:var(--display);}
${S} .result.lose{--pk:#8d8890;--pk-d:#4d484f;--pk-l:#c9c6c8;--pk-xl:#ebe9e9;--btn:#5f5a62;--btn-d:#3c383f;--page:#dcd9d9;--cream:#dcd9d9;--rule:#a9a4aa;--dim:#5a555c;--tone-a:#9a959c;--tone-s:#a4a0a6;--g1:#bdbbbd;--g2:#a3a0a4;--gb:#e8e6e6;}
${S} .spr{position:absolute;left:150px;top:-10px;width:560px;height:763px;background:center top/100% auto no-repeat;filter:drop-shadow(0 6px 14px #1c1c1e);animation:sfxc-rise ${T(600)} ${T(100)} both;}
${S} .result.lose .spr{filter:grayscale(.55) brightness(.72);}
${S} .rs-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;perspective:1400px;}
${S}.land .rs-stage{justify-content:flex-end;padding-right:50px;}
${S} .pgw{position:relative;width:300px;flex:none;pointer-events:auto;filter:drop-shadow(0 4px 8px #1c1c1e);transform-origin:0 50%;--F:56px;--pd:16px;--sp:16px;--ps:16px;}
${S}.land .pgw{width:400px;--F:72px;--pd:22px;--sp:20px;}
${S} .result.lose .pgw{transform:rotate(1.4deg);--C:62px;}
${S}.land .result.lose .pgw{transform:rotate(1deg);--C:80px;}
${S} .pg{position:relative;display:flex;flex-direction:column;background:var(--page);clip-path:polygon(var(--F) 0,100% 0,100% 100%,0 100%,0 var(--F));padding:0 var(--pd) var(--pd);}
${S} .result.lose .pg{clip-path:polygon(var(--F) 0,100% 0,100% calc(100% - var(--C)),calc(100% - var(--C)) 100%,0 100%,0 var(--F));}
${S} .result.lose .pg{padding-bottom:calc(var(--C) - 8px);}
${S} .fold{position:absolute;left:0;top:0;width:var(--F);height:var(--F);clip-path:polygon(0 100%,100% 0,100% 100%);background:${PLAID('var(--g1)', 'var(--g2)', 'var(--gb)')};}
${S} .curl{display:none;}
${S} .result.lose .curl{display:block;position:absolute;right:0;bottom:0;width:var(--C);height:var(--C);clip-path:polygon(100% 0,100% 100%,0 100%);transform-origin:100% 100%;background:linear-gradient(135deg,#b9b5b8 0 50%,#cfcccd 50%);}
${S} .hd{margin-top:calc(var(--F) + 8px);display:flex;justify-content:space-between;align-items:flex-end;}
${S} .ttl{min-width:0;}
${S} .ttl b{display:block;font-size:46px;line-height:1;font-weight:700;color:var(--pk-d);letter-spacing:.06em;white-space:nowrap;}
${S} .ttl b[data-n="4"]{font-size:40px;}
${S} .ttl b[data-n="5"]{font-size:32px;}
${S}.land .ttl b{font-size:60px;}
${S}.land .ttl b[data-n="4"]{font-size:52px;}
${S}.land .ttl b[data-n="5"]{font-size:42px;}
${S} .ttl small{display:block;margin-top:6px;font-size:12px;letter-spacing:.32em;color:var(--pk);font-weight:700;}
${S}.land .ttl small{font-size:13px;}
${S} .flower{-webkit-mask:${PETAL} 50% 46% / 100% 100% no-repeat;mask:${PETAL} 50% 46% / 100% 100% no-repeat;}
${S} .rnd{display:flex;flex-direction:column;align-items:center;gap:2px;flex:none;}
${S} .rnd .fl{width:46px;height:46px;background:var(--pk);display:grid;place-items:center;color:#fff8f0;font-weight:700;font-size:22px;line-height:1;padding-top:1px;}
${S} .rnd small{font-size:12px;color:var(--dim);letter-spacing:.12em;}
${S} .ln{height:0;border-top:1.5px dotted var(--rule);margin:14px 0 6px;}
${S} .toc{display:flex;flex-direction:column;}
${S} .rs-r{display:flex;align-items:center;gap:6px;height:32px;}
${S}.land .rs-r{height:40px;}
${S} .rs-r .l{display:flex;align-items:center;gap:6px;font-size:14px;color:var(--dim);white-space:nowrap;}
${S}.land .rs-r .l{font-size:16px;}
${S} .rs-r .d{flex:1;height:0;border-top:2px dotted var(--rule);transform:translateY(3px);}
${S} .rs-r .v{font-size:17px;font-weight:700;color:var(--pk-d);white-space:nowrap;}
${S}.land .rs-r .v{font-size:20px;}
${S} .av{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;font-style:normal;color:#1d1b1e;flex:none;}
${S} .av.t1{background:#f2b8a8;}
${S} .av.t2{background:#b9dcc4;}
${S} .av.pt{background:var(--pk);border-radius:0;}
${S} .result.lose .av{filter:grayscale(.8);}
${S} .ui-slot{display:contents;}
${S} .igs-challenge-harvest{display:flex;flex-direction:column;align-items:stretch;gap:0;padding:0;}
${S} .igs-challenge-harvest-row{display:flex;flex-wrap:wrap;align-items:center;align-content:center;gap:0 6px;min-height:32px;}
${S}.land .igs-challenge-harvest-row{min-height:40px;}
${S} .igs-challenge-harvest-row .igs-combat-label{display:flex;flex:1;align-items:center;gap:6px;min-width:0;font-size:14px;font-weight:400;letter-spacing:0;color:var(--dim);}
${S}.land .igs-challenge-harvest-row .igs-combat-label{font-size:16px;}
${S} .igs-challenge-harvest-row .igs-combat-label::after{content:"";flex:1;height:0;border-top:2px dotted var(--rule);transform:translateY(3px);}
${S} .igs-challenge-harvest-row b{font-size:17px;font-weight:700;color:var(--pk-d);}
${S}.land .igs-challenge-harvest-row b{font-size:20px;}
${S} .igs-challenge-harvest-row small{flex-basis:100%;order:3;margin:-2px 0 4px;text-align:right;font-size:12px;color:var(--dim);}
${S} .igs-combat-loot{display:flex;flex-direction:column;align-items:stretch;gap:0;}
${S} .igs-combat-state{margin:var(--sp) 0 0;font-size:14px;color:var(--dim);text-shadow:none;letter-spacing:0;text-align:center;}
${S} .igs-combat-loot-cap{display:flex;align-items:center;gap:8px;margin:var(--sp) 0 8px;font-size:12px;font-weight:400;color:var(--dim);letter-spacing:.2em;text-shadow:none;}
${S}.land .igs-combat-loot-cap{font-size:13px;}
${S} .igs-combat-loot-cap::after{content:"";flex:1;border-top:1.5px dotted var(--rule);}
${S} .igs-combat-loot-row{display:flex;justify-content:center;gap:8px;width:100%;}
${S} .igs-combat-loot-card{--rar:#3f6aa3;--rbg:#dde8f5;--tone:var(--tone-a);--print:${PRINT('fbe3e7')};flex:1 1 0;min-width:0;max-width:130px;width:auto;aspect-ratio:auto;display:flex;border-radius:8px;background:#fffdf8;padding:4px;transform:none;color:var(--ink);}
${S} .igs-combat-loot-card[data-rarity="common"]{--rar:#5a555c;--rbg:#e6e3e3;}
${S} .igs-combat-loot-card[data-rarity="uncommon"]{--rar:#2f7a5c;--rbg:#dff1e8;--tone:var(--tone-s);--print:${PRINT('dff1e8')};}
${S} .igs-combat-loot-card[data-rarity="rare"]{--rar:#3f6aa3;--rbg:#dde8f5;--tone:var(--tone-s);--print:${PRINT('dff1e8')};}
${S} .igs-combat-loot-card[data-rarity="epic"]{--rar:#6a4fb0;--rbg:#e6def5;}
${S} .igs-combat-loot-card:is([data-rarity="mythic"],[data-rarity="signature"],[data-rarity="personal"]){--rar:#a5456a;--rbg:#f5dde6;}
${S} button.igs-combat-loot-card:not([aria-disabled="true"]):hover{transform:none;}
${S} .igs-combat-loot-card.is-dim{opacity:1;}
${S} .igs-combat-loot-card.is-chosen{box-shadow:0 0 0 2px var(--btn);transform:none;}
${S} .igs-combat-loot-face{position:relative;inset:auto;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:3px;padding:0;background:none;box-shadow:none;border-radius:inherit;overflow:visible;}
${S} .igs-combat-loot-card.is-chosen .igs-combat-loot-face{box-shadow:none;}
${S} .igs-combat-loot-face::before{content:"";order:0;align-self:stretch;height:46px;border-radius:5px;background:${TILE('var(--print)')},var(--tone);}
${S}.land .igs-combat-loot-face::before{height:62px;}
${S} .igs-combat-loot-name{order:1;font-size:12px;font-weight:700;line-height:1.2;color:var(--ink);text-align:center;}
${S}.land .igs-combat-loot-name{font-size:13px;}
${S} .igs-combat-loot-card:is([data-rarity="epic"],[data-rarity="mythic"]) .igs-combat-loot-name{color:var(--ink);}
${S} .igs-combat-loot-tag{order:2;height:16px;line-height:16px;padding:0 6px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:0;white-space:nowrap;background:var(--rbg);color:var(--rar);}
${S}.land .igs-combat-loot-tag{font-size:13px;}
${S} .igs-combat-loot-origin{order:3;font-size:12px;color:var(--dim);line-height:1.3;-webkit-line-clamp:2;text-align:center;}
${S} .igs-combat-loot-card.is-chosen .igs-combat-loot-face::after{content:"已选";order:4;height:16px;line-height:16px;padding:0 8px;border-radius:999px;background:var(--btn);color:#fff;font-size:12px;font-weight:700;}
${S} .igs-combat-loot-back{inset:0;border-radius:inherit;background:#fffdf8;box-shadow:none;}
${S} .igs-combat-loot-back::before{content:"?";position:absolute;left:4px;right:4px;top:4px;height:46px;border-radius:5px;background:${petalFill('6a666e')} center/30px 30px no-repeat,${PRINT('4d4950')} 0 0/14px 14px repeat,#3a373d;color:#fffaf2;font-size:16px;font-weight:700;line-height:47px;text-align:center;}
${S}.land .igs-combat-loot-back::before{height:62px;line-height:63px;}
${S} .igs-combat-loot-back::after{content:"未翻开";position:absolute;left:0;right:0;top:56px;width:auto;height:auto;rotate:0deg;translate:none;background:none;text-align:center;font-size:12px;color:var(--dim);}
${S}.land .igs-combat-loot-back::after{top:72px;font-size:13px;}
${S} .igs-combat-loot-tools{display:flex;margin-top:var(--sp);}
${S} .igs-combat-loot-tools .igs-combat-btn{flex:1;}
${S} .igs-combat-actions{display:flex;flex-direction:column;align-items:stretch;gap:8px;margin-top:var(--sp);}
${S} .igs-combat-loot-tools + .igs-combat-actions,${S} .igs-combat-loot ~ .igs-combat-actions{margin-top:8px;}
${S} .igs-combat-btn{position:relative;width:100%;height:44px;min-height:44px;padding:0;border-radius:12px;font-size:14px;font-weight:400;letter-spacing:0;background:var(--pk-l);color:var(--pk-d);white-space:nowrap;}
${S}.land .igs-combat-btn{height:50px;min-height:50px;font-size:15px;}
${S} .igs-combat-btn:hover{background:#c9daee;color:var(--pk-d);opacity:1;}
${S} .result.lose .igs-combat-btn:hover{background:#bdbabc;}
${S} .igs-combat-btn.is-primary{padding:0;background:var(--btn);color:#fff8f2;font-size:15px;font-weight:700;letter-spacing:.04em;box-shadow:0 3px 0 var(--btn-d);}
${S}.land .igs-combat-btn.is-primary{font-size:16px;}
${S} .igs-combat-btn.is-primary:hover{background:#456a9e;opacity:1;}
${S} .result.lose .igs-combat-btn.is-primary:hover{background:#56515a;}
${S} .igs-combat-btn[aria-disabled="true"]{opacity:.5;}
@keyframes sfxc-flip{from{transform:translateX(50px) rotateY(-78deg);opacity:0}60%{opacity:1}to{transform:none;opacity:1}}
@keyframes sfxc-flipl{from{transform:translateX(50px) rotateY(-78deg) rotate(1.4deg);opacity:0}60%{opacity:1}to{transform:rotate(1.4deg);opacity:1}}
@keyframes sfxc-flipl-land{from{transform:translateX(50px) rotateY(-78deg) rotate(1deg);opacity:0}60%{opacity:1}to{transform:rotate(1deg);opacity:1}}
@keyframes sfxc-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes sfxc-stamp{0%{opacity:0;transform:scale(1.35)}70%{opacity:1;transform:scale(.97)}100%{transform:scale(1)}}
@keyframes sfxc-gray{from{background-color:#f8f1e6}to{background-color:var(--page)}}
@keyframes sfxc-curl{from{transform:scale(.15)}to{transform:scale(1)}}
${S} .result:not(.lose) .pgw{animation:sfxc-flip ${T(800)} cubic-bezier(.2,.8,.2,1) both;}
${S} .result.lose .pgw{animation:sfxc-flipl ${T(1000)} cubic-bezier(.2,.8,.2,1) both;}
${S}.land .result.lose .pgw{animation-name:sfxc-flipl-land;}
${S} .result.lose .pg{animation:sfxc-gray ${T(1000)} ${T(900)} both;}
${S} .result.lose .curl{animation:sfxc-curl ${T(700)} ${T(1100)} cubic-bezier(.2,.8,.2,1) both;}
${S} .ttl b{animation:sfxc-stamp ${T(450)} ${T(750)} both;}
${S} .rs-r,${S} .igs-challenge-harvest-row{animation:sfxc-rise ${T(350)} both;animation-delay:${T(1000)};}
${S} .rs-r:nth-child(2){animation-delay:${T(1150)};}
${S} .rs-r:nth-child(3){animation-delay:${T(1300)};}
${S} .igs-combat-loot-cap,${S} .igs-combat-loot-card{animation:sfxc-rise ${T(350)} ${T(1500)} both;}
${S} .igs-combat-loot-card:nth-child(2){animation-delay:${T(1650)};}
${S} .igs-combat-loot-card:nth-child(3){animation-delay:${T(1800)};}
${S} .igs-combat-actions,${S} .igs-combat-loot-tools{animation:sfxc-rise ${T(400)} ${T(1900)} both;}
#igs-combat-panel:not([data-igs-combat-result-in]) ${S} :is(.spr,.pgw,.pg,.curl,.ttl b,.rs-r,.igs-challenge-harvest-row,.igs-combat-loot-cap,.igs-combat-loot-card,.igs-combat-actions,.igs-combat-loot-tools),#igs-combat-panel[data-igs-combat-reduced] ${S} :is(.spr,.pgw,.pg,.curl,.ttl b,.rs-r,.igs-challenge-harvest-row,.igs-combat-loot-cap,.igs-combat-loot-card,.igs-combat-actions,.igs-combat-loot-tools){animation-duration:0s;animation-delay:0s;}
`;
