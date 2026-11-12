// 结算画面·dark-a（恐怖A，概念 B：四路监控分屏）：CAM 01 主画面（立绘）、CAM 02 结果、CAM 03 记录、CAM 04 战利品/收获/无信号；按钮在分屏下方。
// html 返回整段结算标记（返回空串则走通用 resultStageHtml）；样式只写 [data-skin="dark-a"] 作用域，恐怖B 共用 data-sfx="dark"，不许碰。
// ui 是调用方拼好的 HTML（已转义）：挑战收获 section、战利品 section（内含重新抽取 tools）、按钮 div。这里只按固定外壳切成三段，不改里面的内容。

const CHALLENGE_LABELS = ['成功', '失败', '放弃'];
const isChallenge = (end) => Boolean(end.harvest || end.challengeOutcome !== undefined || CHALLENGE_LABELS.includes(end.label));

// 把 ui 拆成 { harvest, loot, tools, actions }；找不到按钮区时返回 null（回退通用版式）。
function splitUi(ui) {
    const src = String(ui || '');
    const at = src.lastIndexOf('<div class="igs-combat-actions">');
    if (at < 0) return null;
    const actions = src.slice(at);
    let rest = src.slice(0, at);
    const harvest = (rest.match(/<section class="igs-challenge-harvest">[\s\S]*?<\/section>/) || [''])[0];
    if (harvest) rest = rest.replace(harvest, '');
    const tools = (rest.match(/<div class="igs-combat-loot-tools">[\s\S]*?<\/div>/) || [''])[0];
    if (tools) rest = rest.replace(tools, '');
    return { harvest, loot: rest.trim(), tools, actions };
}

export const html = ({ skin, orient, end, pics, ui, esc, style, size, won, heroes, english, cssUrl }) => {
    const parts = splitUi(ui);
    if (!parts) return '';
    const challenge = isChallenge(end);
    const bgOf = (n) => (pics[n] ? ` style="background-image:${esc(cssUrl(pics[n]))}"` : '');
    const chip = (cam, lab) => `<div class="da-chip">CAM ${cam}<b>${lab}</b></div>`;
    const vf = '<i class="da-vf a"></i><i class="da-vf b"></i><i class="da-vf c"></i><i class="da-vf d"></i>';
    const base = '<i class="da-bg"></i>';
    const top = '<i class="da-ch"></i><i class="da-scan"></i>' + vf + '<i class="da-sn"></i>';

    const lead = heroes[0];
    const sprite = lead
        ? `<div class="da-spw">${pics[lead]
            ? `<i class="da-sp"${bgOf(lead)}></i><i class="da-sp s1"${bgOf(lead)}></i><i class="da-sp s2"${bgOf(lead)}></i>`
            : `<b class="da-char">${esc(Array.from(lead)[0] || '')}</b>`}</div>`
        : '';
    const c1 = `<div class="da-cl c1">${base}${sprite}${top}<div class="da-rec"><i></i>REC 00:14:27</div>${chip('01', '主画面')}</div>`;

    const c2 = `<div class="da-cl c2">${base}${top}${chip('02', '结果')}<div class="da-cc"><div class="da-ttl"><h1>${esc(end.label || '')}</h1>${english ? `<em>${esc(english)}</em>` : ''}</div>`
        + `<div class="da-rd"><span>回合</span><b>${esc(end.turn ?? '')}</b></div></div></div>`;

    const face = (n, cls) => `<div class="da-av ${cls}">${pics[n] ? `<i${bgOf(n)}></i>` : esc(Array.from(n)[0] || '')}</div>`;
    const rows = [
        ...(end.feats || []).map((f) => `<div class="da-rw"><div class="da-av">功</div><div><small>战功</small><strong>${esc(f.title || '')}</strong></div></div>`),
        ...(end.allies || []).map((a) => `<div class="da-rw">${face(a.name, won ? 'ok' : 'ko')}<div><small>${esc(a.name)}</small><strong${won ? '' : ' class="d"'}>${esc(a.injury || '')}</strong></div></div>`),
    ].slice(0, 3).join('');
    const c3 = `<div class="da-cl c3">${base}${top}${chip('03', '记录')}<div class="da-cc">${rows}</div></div>`;

    const has = parts.harvest || parts.loot;
    const bars = ['#6b6e73', '#5a8f95', '#5f9a7e', '#7a5f94', '#9a4a58', '#4c6798'].map((c) => `<u style="background:${c}"></u>`).join('');
    const c4In = has ? `<div class="da-c4in">${parts.harvest}${parts.loot}</div>`
        : `<div class="da-cc"><div class="da-nos"><div class="da-bars">${bars}</div><b>无战利品</b><i>NO SIGNAL</i></div></div>`;
    const c4 = `<div class="da-cl c4">${base}${top}${chip('04', parts.loot ? '战利品' : parts.harvest ? '收获' : '信号')}${c4In}</div>`;

    return `<section class="igs-sfx igs-sfx-result${orient === 'land' ? ' land' : ''}" data-sfx="${esc(style)}" data-skin="${esc(skin)}" data-outcome="${esc(end.outcome || '')}" style="--cw:var(--cx-w,${size.w}px);--ch:${size.h}px">`
        + `<div class="sfx-canvas"><div class="da-cv ${won ? 'win' : 'lose'}"><i class="da-frame"></i>`
        + `<div class="da-tb"><b>${challenge ? '挑战回放' : '战斗回放'}</b>${won ? '<span>CH-01</span>' : ''}</div>`
        + `<div class="da-gb">${c1}${c2}${c3}${c4}</div>`
        + `<div class="da-bar">${parts.tools}${parts.actions}</div></div></div></section>`;
};

export const decor = () => '';

const S = '#igs-overlay .igs-sfx[data-skin="dark-a"]';
const L = `${S}.land`;
const T = (ms) => `calc(${ms}ms * var(--k,1))`;
const NOISE = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='1' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
const BGF = 'grayscale(.9) brightness(.62) contrast(1.2) sepia(.6) hue-rotate(112deg)';
const BGF_LOSE = 'grayscale(1) brightness(.3) contrast(1.2) sepia(.2) hue-rotate(112deg)';
const GLITCH = (a, b) => `drop-shadow(-${a}px 0 0 rgba(179,32,42,.8)) drop-shadow(${b}px 0 0 rgba(205,230,255,.5))`;
const CELL_DELAY = { win: [200, 700, 1100, 1500], lose: [300, 800, 1200, 1600] };
const cellAnim = (o) => CELL_DELAY[o].map((d, i) => {
    const n = i + 1;
    return o === 'win'
        ? `${S} .win .c${n} :is(.da-cc,.da-c4in,.da-chip){animation:sfxda-ln ${T(120)} steps(2) ${T(d)} backwards;}${S} .win .c${n} .da-sn{animation:sfxda-snw ${T(500)} linear ${T(d)} backwards,sfxda-snm ${T(400)} steps(3) ${T(d)} 5;}`
        : `${S} .lose .c${n} :is(.da-cc,.da-c4in,.da-chip){animation:sfxda-cll ${T(800)} linear ${T(d)} backwards;}${S} .lose .c${n} .da-sn{animation:sfxda-snl ${T(800)} linear ${T(d)} backwards,sfxda-snm ${T(400)} steps(3) ${T(d)} 5;}`;
}).join('\n');

export const css = `
${S}{--da-bone:#ece8de;--da-dim:#8d8f93;--da-ink:#121214;--da-ink2:#1c1c1e;--da-blood:#b3202a;--da-hi:#d3303a;--da-bad:#ee6a86;--da-serif:"Huiwen Mincho","Noto Serif SC",serif;--da-num:"Cinzel","Huiwen Mincho",serif;}
${S} .da-cv{position:absolute;inset:0;color:var(--da-bone);font-family:var(--da-serif);user-select:none;-webkit-user-select:none;pointer-events:none;}
${S} .da-cv *{border-radius:0;}
${S} .da-cv :is(h1,strong,small,em){margin:0;}
${S} .da-cv i,${S} .da-cv u{display:block;text-decoration:none;font-style:normal;}
${S} .da-cv>*{position:absolute;}
${S} .da-frame{inset:0;background:#0b0b0c;clip-path:path(evenodd,"M0 0H390V844H0Z M8 52h374v400h-374Z M8 456h185v150h-185Z M197 456h185v150h-185Z M8 610h374v142h-374Z");}
${L} .da-frame{clip-path:path(evenodd,"M0 0H1280V720H0Z M22 56h500v574h-500Z M526 56h364v285h-364Z M894 56h364v285h-364Z M526 345h732v285h-732Z");}
${S} .da-tb{left:22px;right:22px;top:12px;height:30px;display:flex;justify-content:space-between;align-items:center;}
${L} .da-tb{left:28px;right:28px;top:14px;}
${S} .da-tb b{font-weight:400;font-size:18px;letter-spacing:.14em;}
${S} .da-tb span{font:600 12px var(--da-num);letter-spacing:.12em;color:var(--da-dim);}
${S} .lose .da-tb b{color:var(--da-dim);}
${S} .da-gb{left:8px;top:52px;width:374px;display:grid;grid-template-columns:185px 185px;grid-template-rows:400px 150px 142px;gap:4px;}
${L} .da-gb{left:22px;top:56px;width:1236px;grid-template-columns:500px 364px 364px;grid-template-rows:285px 285px;}
${S} .da-cl{position:relative;overflow:hidden;}
${S} .da-cl.c1,${S} .da-cl.c4{grid-column:1/3;}
${L} .da-cl.c1{grid-column:1;grid-row:1/3;}${L} .da-cl.c2{grid-column:2;grid-row:1;}${L} .da-cl.c3{grid-column:3;grid-row:1;}${L} .da-cl.c4{grid-column:2/4;grid-row:2;}
${S} .da-cl>*{position:absolute;}
${S} .da-bg{inset:0;-webkit-backdrop-filter:${BGF};backdrop-filter:${BGF};}
${S} .lose .da-bg{-webkit-backdrop-filter:${BGF_LOSE};backdrop-filter:${BGF_LOSE};}
${S} .da-ch{inset:0;background:linear-gradient(to top,rgba(12,12,13,.88) 0,rgba(12,12,13,0) 70%);}
${S} .da-scan{inset:0;background:repeating-linear-gradient(to bottom,rgba(0,0,0,.28) 0 1px,rgba(0,0,0,0) 1px 3px);}
${S} .da-sn{inset:0;opacity:.12;background:${NOISE};}
${S} .lose .da-sn{opacity:.4;}
${S} .da-vf{width:12px;height:12px;border:0 solid #6d6d73;}
${S} .da-vf.a{left:6px;top:6px;border-width:1px 0 0 1px;}${S} .da-vf.b{right:6px;top:6px;border-width:1px 1px 0 0;}
${S} .da-vf.c{left:6px;bottom:6px;border-width:0 0 1px 1px;}${S} .da-vf.d{right:6px;bottom:6px;border-width:0 1px 1px 0;}
${S} .lose .da-vf{opacity:0;}
${S} .da-spw{left:-13px;top:14px;width:400px;aspect-ratio:1288/1756;filter:drop-shadow(-2px 0 0 rgba(179,32,42,.75)) drop-shadow(2px 0 0 rgba(205,230,255,.4));}
${L} .da-spw{left:-10px;top:12px;width:520px;}
${S} .da-sp{position:absolute;inset:0;background:center top/contain no-repeat;}
${S} .da-sp.s1,${S} .da-sp.s2{opacity:0;}
${S} .da-sp.s1{clip-path:inset(20% 0 62% 0);}${S} .da-sp.s2{clip-path:inset(60% 0 24% 0);}
${S} .da-char{position:absolute;inset:0;display:grid;place-items:center;font:400 180px/1 var(--da-serif);color:var(--da-dim);opacity:.4;}
${S} .lose .da-spw{opacity:.6;filter:grayscale(1) brightness(.75) drop-shadow(-2px 0 0 rgba(179,32,42,.6));}
${S} .da-chip{left:16px;top:14px;font:600 12px var(--da-num);letter-spacing:.14em;background:#121214;padding:3px 7px 2px;line-height:14px;color:var(--da-bone);}
${S} .da-chip b{font:400 12px var(--da-serif);letter-spacing:.1em;color:var(--da-dim);margin-left:6px;}
${S} .da-rec{right:16px;top:14px;display:flex;align-items:center;gap:7px;font:600 12px var(--da-num);letter-spacing:.1em;color:var(--da-dim);background:#121214;padding:3px 7px;line-height:14px;}
${S} .da-rec i{width:7px;height:7px;background:var(--da-hi);}
${S} .lose .da-rec{color:var(--da-hi);font-size:14px;letter-spacing:.14em;}${S} .lose .da-rec i{width:9px;height:9px;}
${S} .lose .da-cl .da-cc,${S} .lose .da-cl .da-chip{opacity:.72;}
${S} .da-cc{inset:0;padding:12px;display:flex;flex-direction:column;justify-content:flex-end;gap:4px;}
${S} .c2 .da-ttl{display:block;}
${S} .da-ttl h1{font-weight:400;font-size:46px;line-height:48px;letter-spacing:.16em;white-space:nowrap;text-shadow:-2px 0 0 rgba(179,32,42,.85),2px 0 0 rgba(205,230,255,.45);}
${L} .da-ttl h1{font-size:84px;line-height:88px;}
${S} .lose .da-ttl h1{color:#d9d6cf;text-shadow:-3px 0 0 rgba(179,32,42,.9),3px 0 0 rgba(205,230,255,.4);}
${S} .da-ttl em{display:flex;align-items:center;gap:8px;font:600 12px var(--da-num);letter-spacing:.34em;color:var(--da-dim);}
${L} .da-ttl em{font-size:14px;}
${S} .da-ttl em::before{content:"";width:14px;height:2px;background:var(--da-hi);}
${S} .da-rd{display:flex;align-items:baseline;gap:8px;padding-bottom:4px;}
${S} .da-rd span{font-size:14px;letter-spacing:.2em;color:var(--da-dim);}
${S} .da-rd b{font:600 28px/30px var(--da-num);text-shadow:-1.5px 0 0 rgba(179,32,42,.85),1.5px 0 0 rgba(205,230,255,.4);}
${L} .da-rd b{font-size:56px;line-height:58px;}
${L} .c2 .da-cc{padding:20px;}
${S} .c3 .da-cc{padding:10px;}
${S} .da-rw{display:flex;align-items:center;gap:8px;height:32px;--a:28px;}
${L} .da-rw{height:52px;gap:14px;--a:44px;}
${S} .da-av{width:var(--a);height:var(--a);flex:none;overflow:hidden;position:relative;background:#1c1c1e;display:grid;place-items:center;font-size:13px;color:var(--da-dim);box-shadow:0 0 0 1px #3a3d42;}
${S} .da-av i{position:absolute;inset:0;background-repeat:no-repeat;background-size:calc(var(--a) * 3.07) auto;background-position:calc(var(--a) * -.96) calc(var(--a) * -.38);}
${S} .da-av.ok{box-shadow:0 0 0 1px var(--da-bone);}${S} .da-av.ko{filter:grayscale(1) brightness(.7);}
${S} .da-rw>div:last-child{display:flex;flex-direction:column;min-width:0;}
${S} .da-rw small{font-size:12px;line-height:14px;color:var(--da-dim);letter-spacing:.12em;}
${S} .da-rw strong{font-weight:400;font-size:15px;line-height:17px;letter-spacing:.08em;white-space:nowrap;}
${S} .da-rw strong.d{color:var(--da-bad);}
${L} .da-rw small{font-size:14px;line-height:18px;}${L} .da-rw strong{font-size:24px;line-height:28px;}
${S} .da-c4in{inset:0;padding:40px 10px 10px;display:flex;flex-direction:column;gap:6px;}
${L} .da-c4in{padding:50px 20px 20px;gap:10px;}
${S} .da-c4in .igs-combat-loot{position:relative;flex:1 1 0;min-height:0;display:flex;align-items:center;justify-content:center;gap:0;padding:0;margin:0;pointer-events:none;}
${S}:not(.land) .da-gb:has(.igs-combat-loot-choices){grid-template-rows:250px 150px 290px;}
${S} .da-c4in .igs-combat-loot-choices{align-items:center;justify-content:center;display:flex;}
${S} .da-c4in .igs-combat-loot-cap{display:none;}
${S} .da-c4in .igs-combat-state{margin:0;font-size:14px;letter-spacing:.2em;color:var(--da-dim);}
${S} .da-c4in .igs-combat-loot-row{position:absolute;inset:0;width:auto;display:flex;justify-content:stretch;gap:8px;--loot-w:auto;}
${L} .da-c4in .igs-combat-loot-row{gap:14px;}
${S} .da-c4in .igs-combat-loot-card{flex:1 1 0;width:auto;min-width:0;height:auto;aspect-ratio:auto;border-radius:0;pointer-events:auto;transform:none!important;--rar:#c4c4c0;}
${S} .da-c4in .igs-combat-loot-card[data-rarity="common"]{--rar:#c4c4c0;}
${S} .da-c4in .igs-combat-loot-card[data-rarity="uncommon"]{--rar:#5f9a7e;}
${S} .da-c4in .igs-combat-loot-card[data-rarity="rare"]{--rar:#5b9be0;}
${S} .da-c4in .igs-combat-loot-card[data-rarity="epic"]{--rar:#a583ec;}
${S} .da-c4in .igs-combat-loot-card[data-rarity="mythic"]{--rar:#ee6a6a;}
${S} .da-c4in .igs-combat-loot-card[data-rarity="personal"]{--rar:#d9a4e8;}
${S} .da-c4in .igs-combat-loot-card[data-rarity="signature"]{--rar:#ff8a5c;}
${S} .da-c4in .igs-combat-loot-face{display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:2px;padding:8px 10px;background:#17181a;box-shadow:inset 0 0 0 1px #2e3034;text-align:left;border-radius:0;}
${S} .da-c4in .igs-combat-loot-card.is-chosen .igs-combat-loot-face{box-shadow:inset 0 0 0 1px var(--da-bone);}
${S} .da-c4in .igs-combat-loot-card.is-chosen::after{content:"已选";position:absolute;right:0;top:0;z-index:3;background:var(--da-bone);color:#121214;font-size:12px;line-height:16px;padding:0 6px;letter-spacing:.1em;}
${S} .da-c4in .igs-combat-loot-card.is-dim{opacity:1;}
${S} .da-c4in .igs-combat-loot-tag{font-size:12px;letter-spacing:.1em;color:var(--rar);}
${S} .da-c4in .igs-combat-loot-name{margin-top:auto;font-size:16px;font-weight:400;line-height:20px;letter-spacing:.08em;color:var(--da-bone);}
${S} .da-c4in .igs-combat-loot-card:is([data-rarity="epic"],[data-rarity="mythic"]) .igs-combat-loot-name{color:var(--da-bone);}
${S} .da-c4in .igs-combat-loot-origin{font-size:12px;line-height:14px;color:var(--da-dim);-webkit-line-clamp:1;}
${L} .da-c4in .igs-combat-loot-face{padding:14px 16px;}
${L} .da-c4in .igs-combat-loot-name{font-size:24px;line-height:30px;}${L} .da-c4in .igs-combat-loot-tag{font-size:14px;}${L} .da-c4in .igs-combat-loot-origin{font-size:14px;line-height:18px;-webkit-line-clamp:2;}
${S} .da-c4in .igs-combat-loot-back{background:repeating-linear-gradient(135deg,#17181a 0 6px,#1c1c1e 6px 12px);box-shadow:inset 0 0 0 1px #2e3034;}
${S} .da-c4in .igs-combat-loot-back::after{content:"未翻";left:50%;top:50%;width:auto;aspect-ratio:auto;rotate:0deg;background:none;color:var(--da-dim);font-size:13px;letter-spacing:.1em;white-space:nowrap;}
${S} .da-c4in .igs-challenge-harvest{flex:none;margin:auto 0;padding:0;display:flex;flex-direction:column;align-items:stretch;gap:6px;pointer-events:none;}
${L} .da-c4in .igs-challenge-harvest{gap:10px;}
${S} .da-c4in .igs-challenge-harvest-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 12px;padding:6px 12px;background:#121214;box-shadow:inset 2px 0 0 var(--da-hi);color:var(--da-bone);--rar:var(--da-bone);}
${L} .da-c4in .igs-challenge-harvest-row{padding:12px 18px;gap:4px 18px;}
${S} .da-c4in .igs-challenge-harvest-row[data-rarity="uncommon"]{--rar:#5f9a7e;}${S} .da-c4in .igs-challenge-harvest-row[data-rarity="rare"]{--rar:#5b9be0;}
${S} .da-c4in .igs-challenge-harvest-row[data-rarity="epic"]{--rar:#a583ec;}${S} .da-c4in .igs-challenge-harvest-row[data-rarity="mythic"]{--rar:#ee6a6a;}
${S} .da-c4in .igs-challenge-harvest-row .igs-combat-label{font-size:14px;letter-spacing:.2em;color:var(--da-dim);}
${S} .da-c4in .igs-challenge-harvest-row b{font-weight:400;font-size:17px;letter-spacing:.08em;color:var(--rar);}
${S} .da-c4in .igs-challenge-harvest-row small{font-size:12px;letter-spacing:.06em;color:var(--da-dim);}
${L} .da-c4in .igs-challenge-harvest-row .igs-combat-label{font-size:18px;}${L} .da-c4in .igs-challenge-harvest-row b{font-size:28px;}${L} .da-c4in .igs-challenge-harvest-row small{font-size:16px;}
${S} .da-nos{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;}
${S} .da-nos b{font-weight:400;font-size:18px;letter-spacing:.2em;}
${S} .da-nos i{font:600 12px var(--da-num);letter-spacing:.3em;color:var(--da-dim);}
${L} .da-nos b{font-size:26px;}${L} .da-nos i{font-size:14px;}
${S} .da-bars{display:flex;height:8px;width:160px;margin-bottom:8px;}${S} .da-bars u{flex:1;}
${L} .da-bars{height:12px;width:240px;}
${S} .da-bar{left:8px;right:8px;top:764px;height:46px;display:flex;gap:8px;pointer-events:auto;}
${L} .da-bar{left:22px;right:22px;top:642px;height:48px;justify-content:flex-end;align-items:center;}
${S} .da-bar :is(.igs-combat-loot-tools,.igs-combat-actions){display:contents;}
${S} .da-bar .igs-combat-btn{flex:1 1 0;height:46px;min-height:0;min-width:0;padding:0 8px;border:0;border-radius:0;background:#1c1c1e;color:var(--da-bone);font:400 15px var(--da-serif);letter-spacing:.1em;white-space:nowrap;box-shadow:none;cursor:pointer;}
${S} .da-bar .igs-combat-btn:not(.is-primary){flex-grow:1.7;}
${S} .da-bar .igs-combat-btn.is-primary,${S} .da-bar .igs-combat-btn.is-primary:hover{background:var(--da-blood);color:var(--da-bone);box-shadow:inset 0 -3px 0 #861820;opacity:1;}
${S} .da-bar .igs-combat-btn:not(.is-primary):hover{background:#26272a;color:var(--da-bone);}
${S} .da-bar .igs-combat-btn[aria-disabled="true"]{opacity:.5;cursor:default;}
${L} .da-bar .igs-combat-btn{flex:none;width:230px;height:48px;font-size:15px;}
${L} .da-bar .igs-combat-btn.is-primary{width:190px;}
@keyframes sfxda-jw{0%{transform:translate(-9px,0);}8%{transform:translate(7px,2px);}15%{transform:translate(0,0);}24%{transform:translate(-5px,-2px);}33%{transform:translate(0,0);}46%{transform:translate(3px,0);}58%{transform:translate(0,0);}}
@keyframes sfxda-gw{0%{filter:${GLITCH(9, 9)};}60%{filter:${GLITCH(5, 5)};}100%{filter:${GLITCH(2, 2)};}}
@keyframes sfxda-bw{0%,30%{opacity:1;transform:translateX(22px);}15%{transform:translateX(-18px);}45%,100%{opacity:0;transform:none;}}
@keyframes sfxda-bl{0%,20%,40%,60%{opacity:1;}10%,30%,50%,70%{opacity:.1;}80%,100%{opacity:1;}}
@keyframes sfxda-fi{from{opacity:0;}}
@keyframes sfxda-fl{0%,100%{opacity:1;}12%{opacity:.2;}24%{opacity:1;}36%{opacity:.4;}}
@keyframes sfxda-ln{from{opacity:0;}}
@keyframes sfxda-snm{33%{background-position:37px 61px;}66%{background-position:-52px 22px;}}
@keyframes sfxda-snw{0%{opacity:.9;}100%{opacity:.12;}}
@keyframes sfxda-jl{0%{transform:translate(-14px,0);}6%{transform:translate(10px,3px);}12%{transform:translate(0,-4px);}20%{transform:translate(-8px,6px);}27%{transform:translate(12px,0);}35%{transform:translate(0,0);}44%{transform:translate(-6px,-3px);}52%{transform:translate(0,0);}}
@keyframes sfxda-gl2{0%{filter:${GLITCH(10, 8)};}100%{filter:grayscale(1) brightness(.75) drop-shadow(-2px 0 0 rgba(179,32,42,.6));opacity:.6;}}
@keyframes sfxda-bl2{0%{opacity:1;transform:translateX(-26px);}10%{transform:translateX(30px);}20%{transform:translateX(-12px);}30%{transform:translateX(18px);}45%,100%{opacity:0;transform:none;}}
@keyframes sfxda-cll{0%{opacity:1;}35%{opacity:0;}100%{opacity:.72;}}
@keyframes sfxda-snl{0%{opacity:.12;}35%{opacity:.95;}100%{opacity:.4;}}
@keyframes sfxda-recl{0%,30%,60%{opacity:1;}15%,45%{opacity:.15;}}
${S} .win .da-spw{animation:sfxda-jw ${T(1500)} steps(1) ${T(200)} backwards,sfxda-gw ${T(1700)} ease-out ${T(200)} backwards;}
${S} .win .da-sp.s1{animation:sfxda-bw ${T(1300)} steps(1) ${T(100)} backwards;}
${S} .win .da-sp.s2{animation:sfxda-bw ${T(1300)} steps(1) ${T(350)} backwards;}
${S} .win .da-rec i{animation:sfxda-bl ${T(1600)} steps(1) backwards;}
${S} .win .da-ttl h1{animation:sfxda-fl ${T(900)} steps(1) ${T(700)} backwards;}
${S} .win .da-rd{animation:sfxda-fi ${T(300)} ${T(900)} backwards;}
${S} .win .da-bar{animation:sfxda-fi ${T(400)} ${T(2000)} backwards;}
${cellAnim('win')}
${S} .lose .da-spw{animation:sfxda-jl ${T(1100)} steps(1) backwards,sfxda-gl2 ${T(1000)} ease-in ${T(300)} backwards;}
${S} .lose .da-sp.s1{animation:sfxda-bl2 ${T(1100)} steps(1) backwards;}
${S} .lose .da-sp.s2{clip-path:inset(46% 0 40% 0);animation:sfxda-bl2 ${T(1100)} steps(1) ${T(150)} backwards;}
${S} .lose .da-rec i{animation:sfxda-recl ${T(1400)} steps(1) backwards;}
${S} .lose .da-ttl h1{animation:sfxda-fl ${T(700)} steps(1) ${T(900)} backwards;}
${S} .lose .da-rd{animation:sfxda-fi ${T(300)} ${T(1200)} backwards;}
${S} .lose .da-bar{animation:sfxda-fi ${T(400)} ${T(2000)} backwards;}
${cellAnim('lose')}
#igs-overlay #igs-combat-panel:not([data-igs-combat-result-in]) ${S.replace('#igs-overlay ', '')} .da-cv *,#igs-overlay #igs-combat-panel:not([data-igs-combat-result-in]) ${S.replace('#igs-overlay ', '')} .da-cv *::before,#igs-overlay #igs-combat-panel:not([data-igs-combat-result-in]) ${S.replace('#igs-overlay ', '')} .da-cv *::after,#igs-overlay #igs-combat-panel[data-igs-combat-reduced] ${S.replace('#igs-overlay ', '')} .da-cv *,#igs-overlay #igs-combat-panel[data-igs-combat-reduced] ${S.replace('#igs-overlay ', '')} .da-cv *::before,#igs-overlay #igs-combat-panel[data-igs-combat-reduced] ${S.replace('#igs-overlay ', '')} .da-cv *::after{animation-duration:0s!important;animation-delay:0s!important;}
`;
