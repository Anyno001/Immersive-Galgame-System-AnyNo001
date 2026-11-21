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
${ON}{--igs-fm-bar-h:76px;--igs-fm-bar-mid:calc(var(--igs-fm-bar-h) - 37px);--igs-fm-bar-low:calc(var(--igs-fm-bar-h) - 17.5px);}
${ON}:is(.igs-toolbar-top,.igs-mode-embedded) #igs-toolbar-layer{top:var(--igs-fm-bar-low)!important;bottom:auto!important;transform:translateY(-50%)!important;}
${R} .igs-fm-bar{position:absolute;left:0;right:0;top:0;height:var(--igs-fm-bar-h);box-sizing:border-box;padding:0 120px 10px 12px;display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-start;background:var(--igs-fm-main,#800000);border-bottom:1px solid var(--igs-fm-line,#d9bfb7);color:var(--igs-fm-card,#ffffee);overflow:hidden;white-space:nowrap;}
${R} .igs-fm-bar-no{max-width:100%;overflow:hidden;text-overflow:ellipsis;font-size:19px;font-weight:400;line-height:24px;}
${R} .igs-fm-bar-board{max-width:100%;overflow:hidden;text-overflow:ellipsis;font-size:11px;line-height:15px;}
${R} .igs-fm-bar-board:first-child{font-size:14px;}
${R} .igs-fm-scroll{position:absolute;left:0;right:0;top:var(--igs-fm-bar-h,76px);bottom:var(--igs-log-foot,64px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;display:flex;flex-direction:column;pointer-events:auto;cursor:pointer;user-select:none;-webkit-user-select:none;}
${R} .igs-fm-scroll::-webkit-scrollbar{display:none;}
${R} .igs-fm-list{display:flex;flex-direction:column;padding:0 0 6px;}
${R} .igs-fm-thread{padding:10px var(--igs-fm-edge,12px) 0;background:var(--igs-fm-card,#ffffee);opacity:0;transition:opacity .3s;}
${R} .igs-fm-thread.is-in{opacity:1;}
${R} .igs-fm-thread h1{margin:0;font-size:15px;line-height:1.5;color:var(--igs-fm-title,#cc1105);}
${R} .igs-fm-post{padding:6px var(--igs-fm-edge,12px) 8px;background:var(--igs-fm-card,#ffffee);font-family:var(--igs-fm-font,"Microsoft YaHei",sans-serif);opacity:0;transition:opacity .3s;}
${R} .igs-fm-post.is-in,${R} .igs-fm-reply.is-in{opacity:1;}
${R} .igs-fm-thread+.igs-fm-post{padding-top:4px;}
${R} .igs-fm-reply{margin:6px calc(var(--igs-fm-edge,12px) - 2px) 0;padding:7px 10px 8px;background:var(--igs-fm-pg,#f0e0d6);border:1px solid var(--igs-fm-line,#d9bfb7);border-left:none;border-top:none;font-family:var(--igs-fm-font,"Microsoft YaHei",sans-serif);opacity:0;transition:opacity .3s;}
${R} .igs-fm-post:not([data-post="0"]){background:var(--igs-fm-card2,#ead6ca);}
${R} .igs-fm-post+.igs-fm-post{margin-top:6px;}
${R} .igs-fm-meta{display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:11.5px;line-height:1.5;color:var(--igs-fm-sub,#707070);}
${R} .igs-fm-meta .igs-fm-time{flex:none;}
${R} .igs-fm-meta .igs-fm-mno{margin-left:auto;flex:none;}
${R} .igs-fm-id{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-weight:700;color:var(--igs-fm-body,#222);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
${R} .igs-fm-pobadge{flex:none;box-sizing:border-box;height:15px;padding:0 3px;border-radius:2px;background:var(--igs-fm-main,#800000);color:var(--igs-fm-card,#ffffee);font-size:10px;line-height:15px;}
${R} .igs-fm-nm{color:var(--igs-fm-nm,#117743);font-weight:700;}
${R} .igs-fm-po{color:var(--igs-fm-title,#cc1105);font-weight:700;}
${R} .igs-fm-body{font-size:var(--igs-fm-fs);line-height:var(--igs-fm-lh,1.75);color:var(--igs-fm-body,#222);word-break:break-word;overflow-wrap:anywhere;text-align:left;}
${R} .igs-fm-line{margin:0 0 var(--igs-fm-gap,5px);}
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
${R}[data-say-ink="name"] .igs-fm-line.is-say{color:var(--igs-fm-sub,#707070);}
${R}[data-indent] .igs-fm-line.is-narr{text-indent:2em;}
${R} .igs-fm-line.is-say+.igs-fm-line:not(.is-say),${R} .igs-fm-line:not(.is-say)+.igs-fm-line.is-say{margin-top:calc(var(--igs-fm-gap,5px) * 2 + 4px);}
${R} .igs-fm-body>.igs-fm-line.is-say:first-child:not(.is-cont){margin-top:6px;}
${R} .igs-fm-line.is-say.is-cont{margin-top:calc(-1 * var(--igs-fm-gap,5px));padding-top:5px;}
${R} .igs-fm-line.is-say .igs-fm-who{color:var(--igs-fm-sub,#707070);font-weight:700;margin:0;}
${R} .igs-fm-ref{color:var(--igs-fm-ref,#dd0000);text-decoration:underline;}
${R} .igs-fm-retitle{margin:6px 12px 2px;text-align:center;color:var(--igs-fm-sub,#707070);font-size:11px;opacity:0;transition:opacity .3s;}
${R} .igs-fm-retitle.is-in{opacity:1;}
${R} .igs-fm-scene{margin:2px 0 5px;color:var(--igs-fm-sub,#707070);font-size:11px;letter-spacing:.12em;}
${R} .igs-fm-line .igs-thought{color:inherit!important;}
${R} .igs-fm-play{display:inline-grid;vertical-align:-4px;width:22px;height:20px;margin-left:4px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--igs-fm-sub,#707070);place-items:center;cursor:pointer;}
${R} .igs-fm-play svg{width:15px;height:15px;}
${R} .igs-fm-solo{margin:6px 0;}
${R} .igs-fm-open{display:inline-block;min-height:30px;padding:4px 12px;border:1px solid var(--igs-fm-line,#d9bfb7);background:var(--igs-fm-pg,#f0e0d6);color:var(--igs-fm-main,#800000);font:inherit;font-size:12.5px;line-height:1.5;text-align:left;cursor:pointer;}
${R} .igs-fm-shots{display:flex;flex-wrap:wrap;gap:6px;}
${R} .igs-fm-shot-thumb{flex:0 0 48%;max-width:190px;aspect-ratio:9/17;overflow:hidden;container-type:inline-size;cursor:zoom-in;}
${R} .igs-fm-shots[data-multi] .igs-fm-shot-thumb{flex-basis:calc(50% - 3px);max-width:190px;}
${R} .igs-fm-shot{font-size:calc(100cqw / 24);width:100%;min-height:100%;box-sizing:border-box;display:flex;flex-direction:column;border:.5em solid var(--igs-shot-case);border-radius:2.2em;background:var(--igs-shot-shell);overflow:hidden;line-height:1.5;text-align:left;user-select:none;-webkit-user-select:none;}
${R} .igs-fm-shot-top{flex:none;background:var(--igs-shot-head);color:var(--igs-shot-ink);}
${R} .igs-fm-shot .igs-phone-status{position:relative;height:2.4em;padding:.2em 1.4em 0;font-size:.8em;color:var(--igs-shot-ink);}
${R} .igs-fm-shot .igs-phone-status-icons{gap:.4em;}
${R} .igs-fm-shot .igs-phone-status-icons svg,${R} .igs-fm-shot .igs-phone-status-icons svg:last-child{height:.8em;}
${R} .igs-fm-shot-title{padding:.1em 1em .6em;text-align:center;font-size:1.05em;font-weight:600;}
${R} .igs-fm-shot-list{flex:1 1 auto;padding:.7em .8em 1.2em;}
${R} .igs-fm-shot-row{display:flex;margin:.45em 0;}
${R} .igs-fm-shot-row.is-right{justify-content:flex-end;}
${R} .igs-fm-shot-row.is-note{justify-content:center;}
${R} .igs-fm-shot-note{padding:.1em .7em;font-size:.8em;color:var(--igs-shot-sub);}
${R} .igs-fm-shot-body{max-width:78%;min-width:0;}
${R} .igs-fm-shot-name{margin:0 0 .15em .2em;font-size:.8em;color:var(--igs-shot-sub);}
${R} .igs-fm-shot-bubble{padding:.55em .8em;border-radius:1em;border:1px solid var(--igs-shot-border,transparent);white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;}
${R} .igs-fm-shot-row.is-left .igs-fm-shot-bubble{border-top-left-radius:.3em;}
${R} .igs-fm-shot-row.is-right .igs-fm-shot-bubble{border-top-right-radius:.3em;}
${R} .igs-fm-shot-full .igs-fm-shot{min-height:calc(100cqw * 17 / 9);}
${R} .igs-fm-shot-full{container-type:inline-size;width:min(300px,80%);max-height:100%;overflow-y:auto;scrollbar-width:none;cursor:zoom-out;}
${R} .igs-fm-viewer-nav{position:absolute;top:50%;z-index:1;width:36px;height:56px;margin-top:-28px;padding:0;border:0;background:var(--igs-fm-main,#800000);color:var(--igs-fm-card,#ffffee);font:inherit;font-size:24px;line-height:1;cursor:pointer;}
${R} .igs-fm-viewer-nav[hidden]{display:none;}
${R} .igs-fm-viewer-nav.is-prev{left:0;}
${R} .igs-fm-viewer-nav.is-next{right:0;}
${R} .igs-fm-card{display:flex;align-items:center;gap:8px;margin:6px 0;padding:6px 10px;border:1px solid var(--igs-fm-line,#d9bfb7);background:var(--igs-fm-pg,#f0e0d6);font-size:12.5px;line-height:1.4;color:var(--igs-fm-main,#800000);opacity:0;transition:opacity .3s;}
${R} .igs-fm-card.is-in{opacity:1;}
${R} .igs-fm-card b{font-weight:700;}
${R} .igs-fm-card span{color:var(--igs-fm-sub,#707070);}
${R} .igs-fm-alias{position:absolute;left:10px;right:10px;top:calc(var(--igs-fm-bar-h,76px) + 8px);z-index:5;padding:6px 8px;background:var(--igs-fm-card,#ffffee);border:1px solid var(--igs-fm-line,#d9bfb7);box-shadow:0 2px 0 var(--igs-fm-line,#d9bfb7);pointer-events:auto;cursor:default;}
${R} .igs-fm-alias-row{display:flex;align-items:center;gap:6px;min-height:30px;}
${R} .igs-fm-alias-name{flex:1 1 auto;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px;color:var(--igs-fm-main,#800000);}
${R} .igs-fm-alias-input{flex:0 0 96px;width:96px;height:26px;box-sizing:border-box;padding:0 6px;border:1px solid var(--igs-fm-line,#d9bfb7);background:var(--igs-fm-pg,#f0e0d6);color:var(--igs-fm-main,#800000);font:inherit;font-size:13px;}
${R} .igs-fm-alias-ok{flex:none;height:26px;padding:0 10px;border:0;background:var(--igs-fm-main,#800000);color:var(--igs-fm-card,#ffffee);font:inherit;font-size:12.5px;cursor:pointer;}
${R} .igs-fm-live{position:absolute;top:calc(var(--igs-fm-bar-low,58.5px) - 14px);right:12px;z-index:6;width:28px;height:28px;padding:0;border:0;border-radius:999px;background:var(--igs-fm-main,#800000);color:var(--igs-fm-card,#ffffee);display:grid;place-items:center;cursor:pointer;pointer-events:auto;}
${R} .igs-fm-live svg{width:16px;height:16px;}
${ON} .igs-entry-dock{top:calc(var(--igs-fm-bar-mid,39px) - 14px)!important;width:auto;flex-direction:row;align-items:center;--igs-entry-ink:var(--igs-fm-main-ink,#800000);--igs-entry-dot-ring:var(--igs-fm-card-ink,#ffffee);}
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
