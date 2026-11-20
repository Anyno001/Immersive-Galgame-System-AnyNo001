const R = '#igs-forum-reader';
const ON = '#igs-overlay[data-igs-forum-reader="on"]';

// 论坛体（匿名版）：浅色实底纸面，无头像；颜色全是实色。
// 立绘隐藏、对话框收起、输入框换皮复用纵向的 data-igs-log-reader 规则（见 log-reader-style.js）。
export const FORUM_READER_STYLE_TEXT = `
${R}{display:none;}
${ON} #igs-log{display:none!important;}
${ON} ${R}{display:block;position:absolute;inset:0;z-index:1;pointer-events:none;background:var(--igs-fm-pg,#f0e0d6);color:var(--igs-fm-main,#800000);transition:opacity .35s;--igs-fm-fs:14px;}
${R}[data-hidden]{opacity:0;}
${R}[data-hidden] .igs-fm-scroll{pointer-events:none;}
${ON}.igs-options-visible ${R}{opacity:0;}
${ON}.igs-options-visible ${R} .igs-fm-scroll{pointer-events:none;}
${R} .igs-fm-bar{position:absolute;left:0;right:0;top:0;height:44px;box-sizing:border-box;padding:0 120px 0 12px;display:flex;align-items:center;background:var(--igs-fm-card,#ffffee);border-bottom:1px solid var(--igs-fm-line,#d9bfb7);font-size:14px;font-weight:700;color:var(--igs-fm-main,#800000);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
${R} .igs-fm-scroll{position:absolute;left:0;right:0;top:44px;bottom:var(--igs-log-foot,64px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;display:flex;flex-direction:column;pointer-events:auto;cursor:pointer;user-select:none;-webkit-user-select:none;}
${R} .igs-fm-scroll::-webkit-scrollbar{display:none;}
${R} .igs-fm-list{display:flex;flex-direction:column;padding:0 0 6px;}
${R} .igs-fm-thread{padding:10px 12px 0;background:var(--igs-fm-card,#ffffee);opacity:0;transition:opacity .3s;}
${R} .igs-fm-thread.is-in{opacity:1;}
${R} .igs-fm-thread h1{margin:0;font-size:15px;line-height:1.5;color:var(--igs-fm-title,#cc1105);}
${R} .igs-fm-post{padding:6px 12px 8px;background:var(--igs-fm-card,#ffffee);font-family:var(--igs-fm-font,"Microsoft YaHei",sans-serif);opacity:0;transition:opacity .3s;}
${R} .igs-fm-post.is-in,${R} .igs-fm-reply.is-in{opacity:1;}
${R} .igs-fm-thread+.igs-fm-post{padding-top:4px;}
${R} .igs-fm-reply{margin:6px 10px 0;padding:7px 10px 8px;background:var(--igs-fm-pg,#f0e0d6);border:1px solid var(--igs-fm-line,#d9bfb7);border-left:none;border-top:none;font-family:var(--igs-fm-font,"Microsoft YaHei",sans-serif);opacity:0;transition:opacity .3s;}
${R} .igs-fm-post:not([data-post="0"]){background:var(--igs-fm-card2,#ead6ca);}
${R} .igs-fm-post+.igs-fm-post{margin-top:6px;}
${R} .igs-fm-meta{margin-bottom:4px;font-size:11px;line-height:1.5;color:var(--igs-fm-sub,#707070);}
${R} .igs-fm-nm{color:var(--igs-fm-nm,#117743);font-weight:700;}
${R} .igs-fm-po{color:var(--igs-fm-title,#cc1105);font-weight:700;}
${R} .igs-fm-body{font-size:var(--igs-fm-fs);line-height:1.75;color:var(--igs-fm-body,#222);word-break:break-word;overflow-wrap:anywhere;text-align:left;}
${R} .igs-fm-line{margin:0 0 5px;}
${R} .igs-fm-line.igs-fm-fade{animation:igs-fm-in .32s ease-out both;}
@keyframes igs-fm-in{0%{opacity:0;}100%{opacity:1;}}
${R} .igs-fm-fl{opacity:0;animation:igs-fm-fl .26s ease-out forwards;}
@keyframes igs-fm-fl{0%{opacity:0;filter:blur(2px);}100%{opacity:1;filter:none;}}
${R} .igs-fm-line:last-child{margin-bottom:0;}
${R} .igs-fm-line.is-thought{color:var(--igs-fm-sub,#707070);}
${R} .igs-fm-who{font-weight:700;margin-right:.1em;}
${R} .igs-fm-line.is-narr .igs-fm-who{margin:0;}
${R} .igs-fm-gt{color:var(--igs-fm-gt,#789922);}
${R} .igs-fm-line.is-say{padding-left:8px;border-left:3px solid var(--igs-fm-line,#d9bfb7);}
${R} .igs-fm-line.is-say.is-cont{margin-top:-5px;padding-top:5px;}
${R} .igs-fm-line.is-say .igs-fm-who{color:var(--igs-fm-sub,#707070);font-weight:700;margin:0;}
${R} .igs-fm-ref{color:var(--igs-fm-ref,#dd0000);text-decoration:underline;}
${R} .igs-fm-retitle{margin:6px 12px 2px;text-align:center;color:var(--igs-fm-sub,#707070);font-size:11px;opacity:0;transition:opacity .3s;}
${R} .igs-fm-retitle.is-in{opacity:1;}
${R} .igs-fm-scene{margin:2px 0 5px;color:var(--igs-fm-sub,#707070);font-size:11px;letter-spacing:.12em;}
${R} .igs-fm-line .igs-thought{color:inherit!important;}
${R} .igs-fm-play{display:inline-grid;vertical-align:-4px;width:22px;height:20px;margin-left:4px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--igs-fm-sub,#707070);place-items:center;cursor:pointer;}
${R} .igs-fm-play svg{width:15px;height:15px;}
${R} .igs-fm-solo{margin:6px 0;}
${R} .igs-fm-replay{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px;border:1px solid var(--igs-fm-line,#d9bfb7);border-radius:999px;background:var(--igs-fm-pg,#f0e0d6);color:var(--igs-fm-main,#800000);font:inherit;font-size:12.5px;cursor:pointer;}
${R} .igs-fm-replay svg{width:12px;height:12px;fill:currentColor;}
${R} .igs-fm-card{display:flex;align-items:center;gap:8px;margin:6px 0;padding:6px 10px;border:1px solid var(--igs-fm-line,#d9bfb7);background:var(--igs-fm-pg,#f0e0d6);font-size:12.5px;line-height:1.4;color:var(--igs-fm-main,#800000);opacity:0;transition:opacity .3s;}
${R} .igs-fm-card.is-in{opacity:1;}
${R} .igs-fm-card b{font-weight:700;}
${R} .igs-fm-card span{color:var(--igs-fm-sub,#707070);}
${R} .igs-fm-alias{position:absolute;left:10px;right:10px;top:52px;z-index:5;padding:6px 8px;background:var(--igs-fm-card,#ffffee);border:1px solid var(--igs-fm-line,#d9bfb7);box-shadow:0 2px 0 var(--igs-fm-line,#d9bfb7);pointer-events:auto;cursor:default;}
${R} .igs-fm-alias-row{display:flex;align-items:center;gap:6px;min-height:30px;}
${R} .igs-fm-alias-name{flex:1 1 auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px;color:var(--igs-fm-main,#800000);}
${R} .igs-fm-alias-input{flex:0 0 96px;width:96px;height:26px;box-sizing:border-box;padding:0 6px;border:1px solid var(--igs-fm-line,#d9bfb7);background:var(--igs-fm-pg,#f0e0d6);color:var(--igs-fm-main,#800000);font:inherit;font-size:13px;}
${R} .igs-fm-alias-ok{flex:none;height:26px;padding:0 10px;border:0;background:var(--igs-fm-main,#800000);color:var(--igs-fm-card,#ffffee);font:inherit;font-size:12.5px;cursor:pointer;}
${R} .igs-fm-live{position:absolute;top:8px;right:12px;z-index:6;width:28px;height:28px;padding:0;border:0;border-radius:999px;background:var(--igs-fm-main,#800000);color:var(--igs-fm-card,#ffffee);display:grid;place-items:center;cursor:pointer;pointer-events:auto;}
${R} .igs-fm-live svg{width:16px;height:16px;}
${ON} .igs-entry-dock{top:8px!important;width:auto;flex-direction:row;align-items:center;--igs-entry-ink:var(--igs-fm-main-ink,#800000);--igs-entry-dot-ring:var(--igs-fm-card-ink,#ffffee);}
${ON} .igs-entry-dock>*{filter:none;opacity:.8;}
${R} .igs-fm-bar{padding-left:var(--igs-fm-dock,12px);}
${R} .igs-fm-img{width:72%;max-width:280px;margin:4px 0 8px;}
${R} .igs-fm-file{font-size:11px;line-height:1.5;color:var(--igs-fm-sub,#707070);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
${R} .igs-fm-thumb{display:block;width:100%;height:auto;max-height:260px;object-fit:cover;cursor:zoom-in;background:var(--igs-fm-pg,#f0e0d6);}
${R} .igs-fm-fold{display:none;width:100%;min-height:44px;padding:6px 8px;border:1px solid var(--igs-fm-line,#d9bfb7);background:var(--igs-fm-pg,#f0e0d6);color:var(--igs-fm-sub,#707070);font:inherit;font-size:12px;line-height:1.5;text-align:left;cursor:pointer;}
${R} .igs-fm-img[data-folded]{width:auto;max-width:none;}
${R} .igs-fm-img[data-folded] .igs-fm-fold{display:block;}
${R} .igs-fm-img[data-folded] .igs-fm-thumb{display:none;}
${R} .igs-fm-viewer{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:#000;cursor:zoom-out;pointer-events:auto;}
${R} .igs-fm-viewer img{display:block;max-width:100%;max-height:100%;object-fit:contain;}
@media (prefers-reduced-motion:reduce){${R} *{transition:none!important;}${R} .igs-fm-fl{animation:none!important;opacity:1;}}
`;
