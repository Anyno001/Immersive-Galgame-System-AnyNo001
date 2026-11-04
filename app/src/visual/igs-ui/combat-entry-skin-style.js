// 开战入口卡、日常挑战入口、准备中、阻断提示、战前对阵、入场白闪随当前战斗皮肤取色取形。
// 入口卡在阅读器层（#igs-combat-entry，data-combat-skin），其余在面板根（data-igs-combat-skin），共用同一组变量；
// 变量取自各套战斗画面的顶栏与按钮语言：--ce-bg 底色、--ce-bg2 次底色、--ce-ink 主字、--ce-sub 次字、--ce-acc 强调色、--ce-on 强调色上的字色、
// --ce-font 字体、--ce-r 卡片圆角、--ce-br 按钮圆角、--ce-border 边线、--ce-clip 切角、--ce-pop 硬投影、--ce-flash 入场白闪色。
// 斜切横幅与平行四边形立绘框只保留给初始方案；画布皮肤在战前对阵里按各自语言重画（黑幕皮肤另有 combat-panel-skin-veil.js）。
const SANS = '"Microsoft YaHei","PingFang SC","Noto Sans SC",sans-serif';
const SERIF = '"Songti SC","Noto Serif SC","LXGW Neo ZhiSong",serif';
const SOFT = '"ChillRoundF","Microsoft YaHei",sans-serif';
const CUT = 'polygon(0 6px,6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%)';

const SKINS = Object.freeze({
    initial: { bg: '#1c1c1e', bg2: '#26262a', ink: '#f4f2ec', sub: '#b8b5ae', acc: '#f2d49b', on: '#1c1c1e', font: SANS, r: '6px', br: '4px', flash: '#ffffff' },
    veil: { bg: '#0a0a0b', bg2: '#141416', ink: '#f4f2ec', sub: '#9a9993', acc: '#ffeeb8', on: '#0a0a0b', font: SANS, r: '2px', br: '2px', flash: '#0a0a0b' },
    'dark-a': { bg: '#121214', bg2: '#1c1c1e', ink: '#ecebe6', sub: '#98a5b1', acc: '#f2b93a', on: '#121214', font: SANS, r: '0', br: '0', flash: '#121214' },
    'dark-b': { bg: '#101214', bg2: '#1a1d20', ink: '#ecebe6', sub: '#98a5b1', acc: '#58c7ea', on: '#101214', font: SANS, r: '0', br: '0', flash: '#101214' },
    'soft-a': { bg: '#f6efe4', bg2: '#e9e0d2', ink: '#38333a', sub: '#6f666e', acc: '#d9566b', on: '#ffffff', font: SOFT, r: '18px', br: '999px', flash: '#fff8ee' },
    'soft-c': { bg: '#f6f0e8', bg2: '#ebe3d8', ink: '#38333a', sub: '#6f666e', acc: '#4f74a8', on: '#fff8f2', font: SOFT, r: '22px', br: '16px', flash: '#fff8ee' },
    ink: { bg: '#101619', bg2: '#1a2326', ink: '#f1eee3', sub: '#a5b0aa', acc: '#d4503a', on: '#f1eee3', font: SERIF, r: '0', br: '0', flash: '#101619' },
    mystic: { bg: '#141318', bg2: '#1e1d24', ink: '#ebe7da', sub: '#a8a595', acc: '#b9a46a', on: '#141318', font: SERIF, r: '2px', br: '2px', flash: '#e3d49c' },
    tech: { bg: '#12171c', bg2: '#181f26', ink: '#e9f1f6', sub: '#9fb0bb', acc: '#7fd0ff', on: '#0e1114', font: SANS, r: '0', br: '0', clip: CUT, flash: '#dff4ff' },
    comic: { bg: '#17181b', bg2: '#1d1e22', ink: '#ecebe6', sub: '#9a9993', acc: '#f2c45a', on: '#121214', font: '"IGS-PangMen","Noto Sans SC","Microsoft YaHei",sans-serif', r: '2px', br: '2px', border: '3px solid #f4f2ec', pop: '4px 4px 0 #f2c45a', flash: '#f4f2ec' },
});
const CANVAS = Object.keys(SKINS).filter((k) => k !== 'initial' && k !== 'veil');

const vars = (s) => `--ce-bg:${s.bg};--ce-bg2:${s.bg2};--ce-ink:${s.ink};--ce-sub:${s.sub};--ce-acc:${s.acc};--ce-on:${s.on};--ce-font:${s.font};--ce-r:${s.r};--ce-br:${s.br};--ce-border:${s.border || '0'};--ce-clip:${s.clip || 'none'};--ce-pop:${s.pop || 'none'};--ce-flash:${s.flash};`;
const VAR_RULES = Object.entries(SKINS).map(([k, s]) => `#igs-combat-entry[data-combat-skin="${k}"],#igs-combat-resume[data-combat-skin="${k}"],#igs-combat-panel[data-igs-combat-skin="${k}"]{${vars(s)}}`).join('\n');


// 定格画面按钮：按各皮肤战斗画面里「结束回合」键的造型语言做（形状、边角、字体、质感、按下态）；主按钮大、次级按钮小，均为实色。
const P = '#igs-combat-panel';
const PAR = 'polygon(8px 0,100% 0,calc(100% - 8px) 100%,0 100%)';
const TAG = 'polygon(10px 0,calc(100% - 10px) 0,100% 50%,calc(100% - 10px) 100%,10px 100%,0 50%)';
const CUT2 = 'polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)';
const BTN = {
    veil: { f: SANS, p: 'background:#ffeeb8;color:#121214;font-weight:700;letter-spacing:.3em;border-radius:0;', pa: 'filter:brightness(.92);transform:translateY(1px);', s: 'background:#0a0a0b;color:#d9d7d1;border-radius:0;box-shadow:inset 0 0 0 1px #3a3a3e;', sa: 'background:#1a1b1f;box-shadow:inset 0 0 0 1px #ffeeb8;' },
    'dark-a': { f: '"Huiwen Mincho","Noto Serif SC",serif', p: 'background:#b3202a;color:#ece8de;border-radius:0;letter-spacing:.3em;box-shadow:inset 0 -3px 0 #861820;', pa: 'box-shadow:inset 0 -1px 0 #861820;transform:translateY(2px);', s: 'background:#121214;color:#98a5b1;border-radius:0;box-shadow:inset 0 0 0 1px #34373b;', sa: 'color:#ece8de;' },
    'dark-b': { f: '"Huiwen Mincho","Noto Serif SC",serif', p: 'background:#0f1214;color:#dce8ee;border-radius:0;letter-spacing:.3em;box-shadow:inset 0 0 0 1px #dce8ee,0 0 18px 2px #2c3438;', pa: 'background:#1c2327;', s: 'background:#0f1214;color:#98a5b1;border-radius:0;box-shadow:inset 0 0 0 1px #3d454b;', sa: 'color:#dce8ee;background:#1c2327;' },
    'soft-a': { f: SOFT, p: 'background:#f2a1ac;color:#4a2f3f;font-weight:700;letter-spacing:.14em;border-radius:999px;border:3px solid #4a2f3f;box-shadow:0 4px 0 #c9747f;', pa: 'transform:translateY(3px);box-shadow:0 1px 0 #c9747f;', s: 'background:#f6efe4;color:#4a2f3f;font-weight:700;letter-spacing:.1em;border-radius:999px;border:2px solid #4a2f3f;box-shadow:0 3px 0 #cbbfae;', sa: 'transform:translateY(2px);box-shadow:0 1px 0 #cbbfae;' },
    'soft-c': { f: SOFT, p: 'background:#5f7eab;color:#fff8f2;font-weight:700;letter-spacing:.14em;border-radius:18px;border:3px solid #34486b;box-shadow:inset 0 0 0 2px #a9c0de,0 4px 0 #34486b;', pa: 'transform:translateY(3px);box-shadow:inset 0 0 0 2px #a9c0de,0 1px 0 #34486b;', s: 'background:#f6f0e8;color:#34486b;font-weight:700;letter-spacing:.1em;border-radius:14px;border:2px solid #34486b;box-shadow:0 3px 0 #9fb3cf;', sa: 'transform:translateY(2px);box-shadow:0 1px 0 #9fb3cf;' },
    ink: { f: '"IGS-MaShanZheng","Songti SC",serif', p: `background:#f1eee3;color:#101619;clip-path:${TAG};letter-spacing:.3em;`, pa: 'background:#d4503a;color:#e8efe9;', s: `background:#1a2326;color:#a5b0aa;clip-path:${TAG};`, sa: 'background:#2c393d;color:#f1eee3;' },
    mystic: { f: '"Tsanger YuYang","LXGW Neo ZhiSong",serif', p: 'background:#3b3a55;color:#ebe7da;font-weight:600;border-radius:999px;letter-spacing:.3em;box-shadow:inset 0 0 0 1px #b9a46a,inset 0 0 0 4px #3b3a55,inset 0 0 0 5px #6e633f,0 0 0 3px #1c1d27,0 0 0 4px #6e633f;', pa: 'background:#2c2d3a;color:#e3d49c;', s: 'background:#1c1d27;color:#a8a595;border-radius:999px;box-shadow:inset 0 0 0 1px #6e633f;', sa: 'color:#e3d49c;box-shadow:inset 0 0 0 1px #b9a46a;' },
    tech: { f: SANS, p: `background:#7fd0ff;color:#07090b;font-weight:800;clip-path:${CUT2};letter-spacing:.24em;`, pa: 'background:#5fb8ea;transform:translateY(1px);', s: `background:linear-gradient(#7fd0ff,#7fd0ff) 0 0/3px 100% no-repeat,#1b2a36;color:#cfe8f6;clip-path:${CUT2};`, sa: 'background-color:#2b4254;color:#7fd0ff;' },
    comic: { f: '"IGS-PangMen","Noto Sans SC","Microsoft YaHei",sans-serif', p: 'background:#f4f2ec;color:#121214;border-radius:0;border:3px solid #121214;box-shadow:5px 5px 0 #ee4a42;transform:skewX(-7deg);letter-spacing:.12em;font-weight:400;font-size:24px;', pa: 'transform:skewX(-7deg) translate(4px,4px);box-shadow:1px 1px 0 #ee4a42;', s: 'background:#121214;color:#f4f2ec;border-radius:0;border:2px solid #f4f2ec;box-shadow:3px 3px 0 #ee4a42;transform:skewX(-7deg);font-weight:400;', sa: 'transform:skewX(-7deg) translate(2px,2px);box-shadow:1px 1px 0 #ee4a42;' },
};
// 各皮肤的装饰层（伪元素，实色）：RR 为按钮组选择器前缀，PR 为主按钮选择器。
const DECO = (RR, PR, k) => ({
    veil: `${PR}::before{content:"";position:absolute;inset:4px;border:1px solid #b9ab7e;pointer-events:none;}
${PR}::after{content:"";position:absolute;left:50%;top:-8px;width:1px;height:5px;margin-left:-.5px;background:#ffeeb8;box-shadow:-14px 2px 0 #9a9993,14px 2px 0 #9a9993,-28px 3px 0 #5a5a5e,28px 3px 0 #5a5a5e;pointer-events:none;}`,
    'soft-a': `${PR}::before{content:"";position:absolute;left:18px;top:6px;width:30px;height:7px;border-radius:99px;background:#fbd3d8;pointer-events:none;}
${PR}::after{content:"";position:absolute;right:20px;top:9px;width:7px;height:7px;border-radius:50%;background:#fff8ee;box-shadow:-11px 6px 0 -2px #fbd3d8;pointer-events:none;}`,
    'soft-c': `${PR}::before{content:"";position:absolute;left:20px;top:7px;width:34px;height:7px;border-radius:99px;background:#a9c0de;pointer-events:none;}
${PR}::after{content:"";position:absolute;right:20px;top:10px;width:7px;height:7px;border-radius:50%;background:#f6dcc0;box-shadow:-12px 5px 0 -2px #d8e2f0;pointer-events:none;}`,
    mystic: `${PR}::before{content:"\\2726";position:absolute;left:22px;top:50%;transform:translateY(-52%);font-size:13px;color:#e3d49c;pointer-events:none;}
${PR}::after{content:"\\2726";position:absolute;right:22px;top:50%;transform:translateY(-52%);font-size:13px;color:#e3d49c;pointer-events:none;}`,
    tech: `${PR}::before{content:"";position:absolute;left:8px;top:7px;width:12px;height:12px;border-left:2px solid #07090b;border-top:2px solid #07090b;pointer-events:none;}
${PR}::after{content:"";position:absolute;left:24px;right:0;top:5px;height:1px;background:#b7e6ff;pointer-events:none;}
${RR} .igs-combat-intro-sub .igs-combat-btn::after{content:"";position:absolute;right:8px;bottom:5px;width:6px;height:6px;border-right:1px solid #7fd0ff;border-bottom:1px solid #7fd0ff;pointer-events:none;}`,
    comic: `${PR}::before{content:"";position:absolute;right:0;top:0;bottom:0;width:22%;background:radial-gradient(#ee4a42 1.6px,transparent 2.1px) 0 0/7px 7px;pointer-events:none;}
${RR} .igs-combat-intro-sub .igs-combat-btn{font-size:13px;letter-spacing:.1em;}`,
}[k] || '');
const BTN_RULES = Object.entries(BTN).map(([k, b]) => {
    const R = `${P}[data-igs-combat-skin="${k}"] .igs-combat-intro-actions`;
    const PRI = ':is([data-combat-act="start"],[data-combat-act="retry-prepare"])';
    return `${R} .igs-combat-btn{font-family:${b.f};border:0;box-shadow:none;clip-path:none;transition:transform .12s ease,filter .12s ease,background .12s ease;${b.s}}
${R} .igs-combat-btn:not(${PRI}):active{${b.sa}}
${R} ${PRI}{font-family:${b.f};border:0;clip-path:none;${b.p}}
${R} ${PRI}:active{${b.pa}}
${R} .igs-combat-btn:focus-visible{outline:2px solid ${SKINS[k].acc};outline-offset:3px;}
${R} .igs-combat-btn{position:relative;}
${DECO(R, `${R} ${PRI}`, k)}`;
}).join('\n');

// 头像切换键：随皮肤换边框与选中态（实色）。
const PICK = {
    veil: ['#141416', '#3a3a3e', '#ffeeb8', '#ecebe6', '0'],
    'soft-a': ['#f6efe4', '#4a2f3f', '#f2a1ac', '#4a2f3f', '50%'],
    'soft-c': ['#f6f0e8', '#34486b', '#7f9cc2', '#34486b', '50%'],
    mystic: ['#1c1d27', '#6e633f', '#b9a46a', '#ebe7da', '50%'],
    tech: ['#1b2a36', '#3a5163', '#7fd0ff', '#cfe8f6', '0'],
    comic: ['#121214', '#f4f2ec', '#ee4a42', '#f4f2ec', '0'],
};
const PICK_RULES = Object.entries(PICK).map(([k, [bg, bd, on, ink, r]]) => {
    const Q = `${P}[data-igs-combat-skin="${k}"] .igs-sfx .pick`;
    return `${Q}{background-color:${bg};border:2px solid ${bd};border-radius:${r};color:${ink};box-shadow:none;transition:transform .12s ease;${k === 'tech' ? `clip-path:${CUT2};` : ''}${k === 'comic' ? 'transform:skewX(-7deg);' : ''}}
${Q}[aria-pressed="true"]{border-color:${on};box-shadow:0 0 0 2px ${on};}
${Q}:active{transform:${k === 'comic' ? 'skewX(-7deg) ' : ''}scale(.92);}`;
}).join('\n');

const E = '#igs-combat-entry';
const LS = `${P}:is(${CANVAS.map((k) => `[data-igs-combat-skin="${k}"]`).join(',')})`;
// 入口卡：初始方案保留原有化开黑带，其余皮肤改实底卡片。
const R = '#igs-combat-resume';
const ES = `:is(${E},${R})[data-combat-skin]:not([data-combat-skin="initial"])`;

export const COMBAT_ENTRY_SKIN_STYLE_TEXT = `
${VAR_RULES}
/* 「返回战斗 / 返回挑战」小标签 */
${E}{max-width:92vw;}
${R}{position:absolute;right:16px;bottom:calc(24px + var(--igs-dialog-h,160px) + var(--igs-toolbar-h,50px) + 12px);z-index:7;max-width:calc(100% - 32px);pointer-events:auto;animation:igs-combat-resume-in .24s ease-out both;}
#igs-overlay.igs-toolbar-top ${R}{bottom:calc(24px + var(--igs-dialog-h,160px) + 12px);}
#igs-overlay.igs-floating ${R}{bottom:calc(14px + var(--igs-dialog-h,160px) + var(--igs-toolbar-h,50px) + 10px);}
#igs-overlay.igs-floating.igs-toolbar-top ${R}{bottom:calc(14px + var(--igs-dialog-h,160px) + 10px);}
/* 漫画模式：对话框收成底部输入条，按钮落在输入条上方；窄屏阅读：贴在底部输入框上方，log 列表底边让出按钮的位置 */
#igs-overlay[data-igs-comic] ${R}{bottom:calc(18px + var(--igs-comic-controls-h,56px) + 12px)!important;}
#igs-overlay[data-igs-log-reader="on"] ${R}{right:var(--igs-log-edge)!important;bottom:calc(var(--igs-log-foot) + 10px)!important;}
#igs-overlay[data-igs-log-reader="on"]:has(${R}) #igs-log .igs-log-scroll{bottom:calc(var(--igs-log-foot) + 60px);}
#igs-overlay:is(.igs-record-screen-open,.igs-turn-index-open,[data-igs-combat-open],[data-igs-cg-only="1"],:has(.igs-live-phone)) ${R}{display:none;}
${R} .igs-combat-entry-btn{transition:transform .12s ease;}
${R} .igs-combat-entry-btn:active{transform:translateY(2px);}
@keyframes igs-combat-resume-in{from{opacity:0;}to{opacity:1;}}
#igs-overlay[data-igs-quality="low"] ${R}{animation:none;}
#igs-overlay[data-igs-quality="low"] ${R} .igs-combat-entry-btn{transition:none;}
@media(prefers-reduced-motion:reduce){${R}{animation:none;}${R} .igs-combat-entry-btn{transition:none;}}
${E} .igs-combat-entry-return,${R} .igs-combat-entry-return{display:inline-flex;min-width:0;max-width:100%;box-sizing:border-box;padding:6px 20px;font-size:13px;font-weight:600;letter-spacing:.2em;text-indent:.2em;}
${ES} .igs-combat-entry-btn{background:var(--ce-bg);color:var(--ce-ink);font-family:var(--ce-font);text-shadow:none;border:var(--ce-border);border-radius:var(--ce-r);clip-path:var(--ce-clip);box-shadow:var(--ce-pop);}
${ES} .igs-combat-entry-btn:focus-visible{outline-color:var(--ce-acc);}
/* 悬浮的返回战斗：比入口小标签大一号；初始方案改实底，漫画收细边与小投影 */
#igs-overlay ${R} .igs-combat-entry-return{min-height:40px;padding:10px 26px;font-size:15px;justify-content:center;align-items:center;}
#igs-overlay ${R}[data-combat-skin="initial"] .igs-combat-entry-btn{background:var(--ce-bg);text-shadow:none;border-radius:var(--ce-r);}
#igs-overlay ${R}[data-combat-skin="comic"] .igs-combat-entry-btn{border:2px solid #f4f2ec;box-shadow:2px 2px 0 #f2c45a;}
/* 准备中：三点跳动 + 文字 + 取消；阻断提示沿用同一组变量 */
${P} .igs-combat-loading{display:flex;flex-direction:column;align-items:center;gap:14px;margin:28px 0 0;}
${P} .igs-combat-loading-dots{display:flex;gap:8px;}
${P} .igs-combat-loading-dots i{width:9px;height:9px;border-radius:var(--ce-br,50%);background:var(--ce-acc,var(--igs-cb-warm));animation:igs-combat-loading-dot 1s ease-in-out infinite;}
${P} .igs-combat-loading-dots i:nth-child(2){animation-delay:.16s;}
${P} .igs-combat-loading-dots i:nth-child(3){animation-delay:.32s;}
${P} .igs-combat-loading .igs-combat-state{margin:0;}
${P} .igs-combat-blocked{display:flex;flex-direction:column;align-items:center;gap:12px;}
${P} .igs-combat-blocked .igs-combat-state{margin:24px 0 0;}
@keyframes igs-combat-loading-dot{0%,80%,100%{opacity:.3;transform:translateY(0);}40%{opacity:1;transform:translateY(-6px);}}
${P}[data-igs-combat-reduced] .igs-combat-loading-dots i,#igs-overlay[data-igs-quality="low"] ${P} .igs-combat-loading-dots i{animation:none;opacity:.7;}
@media(prefers-reduced-motion:reduce){${P} .igs-combat-loading-dots i{animation:none;opacity:.7;}}
${LS} :is(.igs-combat-loading,.igs-combat-blocked){width:fit-content;max-width:90%;margin:28px auto 0;padding:18px 28px;background:var(--ce-bg);border:var(--ce-border);border-radius:var(--ce-r);clip-path:var(--ce-clip);box-shadow:var(--ce-pop);font-family:var(--ce-font);}
${LS} :is(.igs-combat-loading,.igs-combat-blocked) .igs-combat-state{color:var(--ce-ink);text-shadow:none;}
${LS} .igs-combat-blocked .igs-combat-actions{margin:0;}
/* 画布皮肤开场：白闪（压在对撞之上、立即开始）→ 对撞定格 → 叠按钮层；点开始后两半向两侧缓出滑开 */
${P}>.igs-combat-lobby-flash.is-early{z-index:9;animation-delay:0s;}
${P} .igs-combat-intro-ui{position:absolute;inset:0;z-index:8;pointer-events:none;font-family:var(--ce-font);animation:igs-intro-ui-in .35s ease-out .9s both;}
${P} .igs-combat-intro-ui[data-instant]{animation:none;}
${P} .igs-combat-intro-ui>*{pointer-events:auto;}
@keyframes igs-intro-ui-in{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
${P} .igs-combat-intro-close{position:absolute;top:10px;right:10px;width:36px;height:36px;padding:0;border:var(--ce-border);border-radius:var(--ce-br);clip-path:var(--ce-clip);background:var(--ce-bg);box-shadow:var(--ce-pop);color:var(--ce-ink);font:inherit;font-size:20px;line-height:1;cursor:pointer;}
${P} .igs-combat-intro-actions{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:10px;width:min(320px,90%);}
${P} .igs-combat-intro-actions .igs-combat-btn{font-family:var(--ce-font);}
${P} .igs-combat-intro-actions :is([data-combat-act="start"],[data-combat-act="retry-prepare"]){width:100%;min-height:56px;font-size:20px;font-weight:700;letter-spacing:.24em;text-indent:.24em;}
${BTN_RULES}
${PICK_RULES}
${P} .igs-combat-intro-status{margin:0;padding:8px 18px;background:var(--ce-bg);border:var(--ce-border);border-radius:var(--ce-br);clip-path:var(--ce-clip);box-shadow:var(--ce-pop);color:var(--ce-ink);font-size:13px;letter-spacing:.1em;text-align:center;}
${P} .igs-combat-intro-sub{display:flex;justify-content:center;gap:14px;}
${P} .igs-combat-intro-sub .igs-combat-btn{min-height:32px;padding:5px 16px;font-size:12px;}
${P} .igs-combat-intro-actions .igs-combat-row{justify-content:center;flex-wrap:wrap;}
${P} .igs-combat-intro-actions .igs-combat-chip{background:var(--ce-bg);color:var(--ce-ink);border-radius:var(--ce-br);}
${P} .igs-combat-intro-actions .igs-combat-chip[aria-pressed="true"]{background:var(--ce-acc);color:var(--ce-on);}
${P} .igs-combat-intro-actions .igs-combat-label{color:var(--ce-ink);}
#igs-overlay .igs-sfx .pickrow{display:flex;gap:6px;margin-top:8px;pointer-events:auto;}
#igs-overlay .igs-sfx .pick{-webkit-text-stroke:0;text-shadow:none;width:30px;height:30px;padding:0;border:2px solid var(--ce-bg,#1c1c1e);border-radius:50%;background:var(--ce-bg2,#26262a) center/cover no-repeat;color:var(--ce-ink,#f4f2ec);font:700 13px/1 var(--ce-font,sans-serif);cursor:pointer;pointer-events:auto;}
#igs-overlay .igs-sfx .pick[aria-pressed="true"]{border-color:var(--ce-acc,#f2d49b);}
#igs-overlay .igs-sfx.reveal .clash.out .hero-side{animation-timing-function:cubic-bezier(.2,.7,.2,1);}
#igs-overlay .igs-sfx.reveal .clash.out .foe-side{animation-timing-function:cubic-bezier(.2,.7,.2,1);}
/* 面板打开时，阅读器战斗名牌（VS 战斗中）不再压在面板顶栏的关卡名上 */
#igs-overlay[data-igs-combat-open] .igs-fx-battle-plate{display:none;}
`;
