// 结算画面·ink（水墨）：设计图 gal/水墨结算设计图/方案B暗影.html。html 返回整段结算标记；样式只写 [data-skin="ink"] 作用域。
// 横屏暗影从右侧压过来、立绘在左；竖屏暗影从下方漫上来、立绘在上。内容落在暗影最深处：月白大字标题 + 灰石竖排回合数、干笔墨痕分行。
// 整幅只留一方朱印：「发送战报」做成右下角落款印（输的结局改灰石印）；重新开始、重新抽取是印旁的灰石小字。
const NUM = '零一二三四五六七八九';
const cnNum = (n) => {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v) || v < 0) return '';
    if (v < 10) return NUM[v];
    if (v < 100) return `${v >= 20 ? NUM[Math.floor(v / 10)] : ''}十${v % 10 ? NUM[v % 10] : ''}`;
    return String(v);
};

export const html = ({ skin, orient, end, pics, ui, esc, style, size, won, heroes, cssUrl }) => {
    const land = orient === 'land';
    const lead = heroes[0];
    const fig = lead && pics[lead] ? `<i class="ik-fig" style="background-image:${esc(cssUrl(pics[lead]))}"></i>` : '';
    const rows = [...(end.feats || []).map((f) => ['战功', f.title || '']), ...(end.allies || []).map((a) => [a.name, a.injury || ''])].slice(0, 3)
        .map(([k, v], i) => `<div class="ik-row" style="--i:${i}"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    const turn = cnNum(end.turn);
    return `<section class="igs-sfx igs-sfx-result${land ? ' land' : ''}" data-sfx="${esc(style)}" data-skin="${esc(skin)}" data-outcome="${esc(end.outcome || '')}" style="--cw:var(--cx-w,${size.w}px);--ch:${size.h}px">`
        + `<div class="sfx-canvas"><div class="result ik${won ? '' : ' lose'}"><div class="veil"></div>`
        + (land ? `<i class="ik-shade"></i>${fig}` : `${fig}<i class="ik-shade"></i>`)
        + `<div class="ik-panel"><div class="ik-head"><div class="ik-ttl">${esc(end.label || '')}</div>${turn ? `<div class="ik-turn">${esc(turn)}回合</div>` : ''}</div>`
        + `${rows ? `<div class="ik-rows">${rows}</div>` : ''}${ui}</div>`
        + `</div></div></section>`;
};
export const decor = () => '';

const S = '#igs-overlay .igs-sfx-result[data-skin="ink"]';
const P = `${S}:not(.land)`;
const L = `${S}.land`;
const T = (ms) => `calc(${ms}ms * var(--k,1))`;
// 干笔墨痕：起笔圆头、收尾尖、带飞白；只作遮罩形状，颜色由 background 给。
const STROKE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 420 14' preserveAspectRatio='none'%3E%3Cfilter id='r' x='-2%25' y='-40%25' width='104%25' height='180%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.05 .5' numOctaves='3' seed='5' result='n'/%3E%3CfeDisplacementMap in='SourceGraphic' in2='n' scale='3.5' result='e'/%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.006 1.1' numOctaves='2' seed='21' result='s'/%3E%3CfeColorMatrix in='s' type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -9 5.6' result='k'/%3E%3CfeComposite in='e' in2='k' operator='in'/%3E%3C/filter%3E%3Cpath filter='url(%23r)' fill='%23fff' d='M2 7 C1 1 7 0 18 .6 C90 2.2 200 4.6 418 6.8 C200 8.4 90 12 18 13.6 C7 14.2 1 12.6 2 7Z'/%3E%3C/svg%3E\")";

export const css = `
${S} .ik{--ink:#121416;--ink2:#1b1f21;--line:#4b5558;--card-line:#5b6669;--stone:#9aa6a1;--moon:#ece7dd;--seal:#b8402e;--seal-tx:#f3ead8;--stroke:#6a7577;--ttl-c:var(--moon);--seal-bg:var(--seal);--seal-fg:var(--seal-tx);color:var(--moon);font-family:var(--font-song);}
${S} .ik.lose{--ttl-c:#8d9693;--seal-bg:var(--stone);--seal-fg:var(--ink);}
${S} .result.ik.lose::after{content:none;display:none;}
${S} .ik .veil{background:none;-webkit-backdrop-filter:brightness(.78) saturate(.7);backdrop-filter:brightness(.78) saturate(.7);}
${S} .ik.lose .veil{-webkit-backdrop-filter:brightness(.7) saturate(.4);backdrop-filter:brightness(.7) saturate(.4);}
${S} .ik-shade{position:absolute;inset:0;pointer-events:none;animation:sfxk-fade ${T(500)} ease backwards;}
${L} .ik-shade{background:linear-gradient(90deg,rgba(18,20,22,0) 34%,rgba(18,20,22,.72) 50%,var(--ink) 64%);}
${P} .ik-shade{background:linear-gradient(180deg,rgba(18,20,22,0) 34%,rgba(18,20,22,.78) 50%,var(--ink) 62%);}
${S} .ik-fig{position:absolute;background:center bottom / contain no-repeat;pointer-events:none;animation:sfxk-fig ${T(600)} ease-out backwards;}
${L} .ik-fig{left:30px;bottom:0;width:560px;height:700px;}
${P} .ik-fig{left:-20px;top:10px;width:430px;height:560px;}
${S} .ik.lose .ik-fig{filter:grayscale(1) brightness(.8);}
${S} .ik-panel{position:absolute;display:flex;flex-direction:column;pointer-events:auto;}
${L} .ik-panel{left:720px;right:70px;top:40px;bottom:40px;justify-content:center;gap:20px;}
${P} .ik-panel{left:26px;right:26px;bottom:30px;max-height:520px;gap:14px;}
${S} .ik-head{display:flex;align-items:flex-end;justify-content:center;gap:18px;animation:sfxk-rise ${T(600)} ease-out ${T(200)} backwards;}
${S} .ik-ttl{font-family:var(--font-brush);font-weight:400;line-height:1;font-size:140px;letter-spacing:6px;color:var(--ttl-c);white-space:nowrap;}
${P} .ik-ttl{font-size:100px;}
${S} .ik-turn{writing-mode:vertical-rl;color:var(--stone);font-size:15px;letter-spacing:6px;line-height:1.2;padding-left:14px;margin-bottom:14px;box-shadow:inset 1px 0 0 var(--line);}
${S} .ik.lose .ik-turn{color:#7d8784;}
${S} .ik-rows{display:flex;flex-direction:column;gap:4px;}
${S} .ik-row,${S} .igs-challenge-harvest-row{position:relative;display:flex;align-items:baseline;gap:14px;padding:10px 0 12px;animation:sfxk-fade ${T(400)} ease backwards;animation-delay:calc(700ms * var(--k,1) + var(--i,0) * 120ms * var(--k,1));}
${S} .ik-row::after,${S} .igs-challenge-harvest-row::after{content:"";position:absolute;left:-6px;bottom:-6px;width:86%;height:14px;background:var(--stroke);-webkit-mask:${STROKE} no-repeat 0 0 / 100% 100%;mask:${STROKE} no-repeat 0 0 / 100% 100%;pointer-events:none;}
${P} .ik-row::after,${P} .igs-challenge-harvest-row::after{width:calc(100% + 16px);}
${S} .ik-row span,${S} .igs-challenge-harvest-row .igs-combat-label{flex:none;width:64px;color:var(--stone);font-size:15px;font-weight:400;letter-spacing:2px;text-shadow:none;}
${S} .ik-row b,${S} .igs-challenge-harvest-row b{color:var(--moon);font-size:21px;font-weight:700;letter-spacing:0;}
${S} .igs-challenge-harvest{display:flex;flex-direction:column;align-items:stretch;gap:4px;padding:0;margin:0;background:none;}
${S} .igs-challenge-harvest-row{flex-wrap:wrap;row-gap:2px;}
${S} .igs-challenge-harvest-row small{color:var(--stone);font-size:12px;margin-left:4px;}
${S} .igs-combat-loot{display:flex;flex-direction:column;align-items:stretch;align-self:flex-start;gap:0;margin:6px 0 0;animation:sfxk-fade ${T(400)} ease ${T(1000)} backwards;}
${S} .igs-combat-loot-cap{color:var(--stone);font-size:13px;font-weight:400;letter-spacing:4px;text-shadow:none;margin:0 0 10px;text-align:left;}
${S} .igs-combat-state{margin:0;color:var(--stone);font-size:14px;letter-spacing:2px;text-shadow:none;text-align:left;}
${S} .igs-combat-loot-row{display:flex;justify-content:flex-start;gap:12px;width:auto;--loot-w:auto;}
${S} .igs-combat-loot-card{--rar:var(--stone);--rar-tx:var(--ink);position:relative;flex:none;width:104px;height:140px;min-width:0;aspect-ratio:auto;display:flex;background:var(--ink2);border:0;border-radius:3px;box-shadow:inset 0 0 0 1px var(--card-line);color:var(--moon);transform:none;opacity:1;}
${P} .igs-combat-loot-card{width:96px;height:112px;}
${S} .igs-combat-loot-card:is([data-rarity="epic"],[data-rarity="mythic"]){--rar:var(--seal);--rar-tx:var(--seal-tx);}
${S} button.igs-combat-loot-card:not([aria-disabled="true"]):hover{transform:none;background:#232829;}
${S} .igs-combat-loot-card.is-chosen{box-shadow:inset 0 0 0 1px var(--moon);transform:none;}
${S} .igs-combat-loot-card.is-dim{opacity:1;}
${S} .igs-combat-loot-face{position:relative;inset:auto;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;padding:6px 4px 16px;background:none;box-shadow:none;border-radius:inherit;}
${P} .igs-combat-loot-face{padding-bottom:12px;}
${S} .igs-combat-loot-card.is-chosen .igs-combat-loot-face{box-shadow:none;}
${S} .igs-combat-loot-tag{color:var(--stone);font-size:11px;font-weight:400;letter-spacing:2px;white-space:nowrap;}
${S} .igs-combat-loot-name{color:var(--moon);font-size:17px;font-weight:700;line-height:1.2;text-align:center;}
${S} .igs-combat-loot-card:is([data-rarity="epic"],[data-rarity="mythic"]) .igs-combat-loot-name{color:var(--moon);}
${S} .igs-combat-loot-origin{display:none;}
${S} .igs-combat-loot-card[data-rarity]::before{content:"";position:absolute;top:8px;right:8px;width:16px;height:16px;border-radius:2px 1px 3px 1px;background:var(--rar);color:var(--rar-tx);font-size:10px;font-weight:700;line-height:16px;text-align:center;z-index:1;}
${S} .igs-combat-loot-card[data-rarity="common"]::before{content:"普";}
${S} .igs-combat-loot-card[data-rarity="uncommon"]::before{content:"罕";}
${S} .igs-combat-loot-card[data-rarity="rare"]::before{content:"稀";}
${S} .igs-combat-loot-card[data-rarity="epic"]::before{content:"史";}
${S} .igs-combat-loot-card[data-rarity="mythic"]::before{content:"神";}
${S} .igs-combat-loot-back{background:var(--ink2);box-shadow:none;border-radius:inherit;}
${S} .igs-combat-loot-back::after{content:"?";position:absolute;inset:14px;left:14px;top:14px;width:auto;height:auto;aspect-ratio:auto;translate:none;rotate:none;display:flex;align-items:center;justify-content:center;background:none;border-radius:2px;box-shadow:inset 0 0 0 1px var(--line);font-family:var(--font-brush);font-size:34px;color:#3a4245;transform:none;}
${S} .igs-combat-loot-tools{display:flex;justify-content:center;width:auto;margin-top:12px;}
${S} .igs-combat-loot-tools .igs-combat-btn{font-size:14px;letter-spacing:2px;}
${P} .ik:has(.igs-combat-loot) .ik-shade{background:linear-gradient(180deg,rgba(18,20,22,0) 22%,rgba(18,20,22,.8) 38%,var(--ink) 50%);}
${P} .ik:has(.igs-combat-loot) .ik-fig{top:-20px;width:380px;height:500px;left:5px;}
${P} .ik:has(.igs-combat-loot) .ik-panel{gap:10px;}
${P} .ik:has(.igs-combat-loot) .ik-ttl{font-size:92px;}
${P} .ik:has(.igs-combat-loot) .ik-row{padding:7px 0 9px;}
${P} .ik:has(.igs-combat-loot) .ik-row b{font-size:19px;}
${P} .ik:has(.igs-combat-loot) .igs-combat-loot-card{height:100px;}
${P} .ik:has(.igs-combat-loot) .igs-combat-loot-tools{margin-top:6px;}
${S} .igs-combat-actions{display:flex;flex-wrap:nowrap;align-items:flex-end;justify-content:flex-end;gap:22px;margin:10px 0 0;width:86%;animation:sfxk-fade ${T(400)} ease ${T(1200)} backwards;}
${P} .igs-combat-actions{width:100%;margin-top:auto;padding-top:10px;}
${S} .igs-combat-actions:empty{display:none;}
${S} .igs-combat-btn{flex:none;width:auto;min-width:0;height:auto;min-height:0;padding:0 0 4px;border:0;border-radius:0;background:none;box-shadow:none;color:var(--stone);font-family:var(--font-song);font-size:16px;font-weight:400;letter-spacing:4px;white-space:nowrap;text-shadow:none;}
${S} .igs-combat-btn:hover{background:none;color:var(--moon);opacity:1;}
${S} .igs-combat-btn.is-primary{width:68px;height:68px;padding:0;display:inline-flex;align-items:center;justify-content:center;background:var(--seal-bg);color:var(--seal-fg);border-radius:4px 3px 5px 3px;box-shadow:inset 0 0 0 4px var(--seal-bg),inset 0 0 0 5px var(--seal-fg);font-family:var(--font-brush);font-size:24px;line-height:1.05;letter-spacing:0;writing-mode:vertical-rl;white-space:normal;animation:sfxk-seal ${T(450)} cubic-bezier(.3,.7,.3,1) ${T(1300)} backwards;}
${P} .igs-combat-btn.is-primary{width:62px;height:62px;font-size:22px;}
${S} .igs-combat-btn.is-primary:hover{background:var(--seal-bg);color:var(--seal-fg);filter:brightness(1.08);}
${S} .igs-combat-btn[disabled],${S} .igs-combat-btn[aria-disabled="true"]{opacity:.5;cursor:default;}
@keyframes sfxk-fade{from{opacity:0}to{opacity:1}}
@keyframes sfxk-rise{from{opacity:0;translate:0 10px}to{opacity:1;translate:0 0}}
@keyframes sfxk-fig{from{opacity:0;translate:-14px 0}to{opacity:1;translate:0 0}}
@keyframes sfxk-seal{from{opacity:0;scale:1.5}60%{opacity:1;scale:.94}to{opacity:1;scale:1}}
#igs-combat-panel:not([data-igs-combat-result-in]) ${S} .ik :is(.ik-shade,.ik-fig,.ik-head,.ik-row,.igs-challenge-harvest-row,.igs-combat-loot,.igs-combat-actions,.igs-combat-btn),#igs-combat-panel[data-igs-combat-reduced] ${S} .ik :is(.ik-shade,.ik-fig,.ik-head,.ik-row,.igs-challenge-harvest-row,.igs-combat-loot,.igs-combat-actions,.igs-combat-btn){animation-duration:0s;animation-delay:0s;}
`;
