// 手机社区样式：phone 皮肤沿用直播手机外壳（.igs-live-stage / .igs-live-phone，样式在 danmaku-style），这里只改屏幕内容；paper 皮肤是一张纸面 / 布告。
// 每个平台的页面结构不同（顶栏、卡片、互动区），结构由 feed-phone.js 按平台构建，这里按 data-platform 写各自外观。
// 运动只用 transform / opacity，不用 backdrop-filter 与滤镜动画，装饰用实色。
export const FEED_STYLE_TEXT = `
@keyframes igs-feed-in{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
@keyframes igs-feed-rise{from{opacity:0;transform:translateY(24px);}to{opacity:1;transform:none;}}
@keyframes igs-feed-sink{to{opacity:0;transform:translateY(24px);}}
.igs-feed-stage{--fp-bg:#f4f5f7;--fp-card:#fff;--fp-bar:#fff;--fp-ink:#18191c;--fp-sub:#8a8f98;--fp-name:#18191c;--fp-reply:#f1f2f4;--fp-status:#18191c;--fp-line:#eceef1;--fp-head-ink:var(--fp-sub);--fp-app:var(--fp-accent);--fp-head-line:var(--fp-accent);}
.igs-feed-stage [hidden]{display:none !important;}
.igs-feed-stage .igs-live-phone{background:var(--fp-bg);color:var(--fp-ink);}
.igs-feed-stage .igs-phone-status{color:var(--fp-status);}
.igs-feed-stage[data-leaving] .igs-live-dim{animation:igs-live-dim-out .42s ease forwards;}
.igs-feed-screen{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--fp-bg);}
.igs-feed-stage[data-skin="phone"] .igs-feed-list{overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;scrollbar-width:none;pointer-events:auto;clip-path:inset(0 0 var(--igs-phone-sink,0px) 0);}
.igs-feed-stage[data-skin="phone"] .igs-feed-list::-webkit-scrollbar{display:none;}
.igs-feed-head{flex:none;display:flex;align-items:center;gap:8px;padding:38px 12px 8px;background:var(--fp-bar);border-bottom:2px solid var(--fp-head-line);color:var(--fp-head-ink);}
.igs-feed-app{flex:1;min-width:0;text-align:center;font-size:15px;font-weight:800;letter-spacing:.06em;color:var(--fp-app);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-feed-close{flex:none;display:inline-flex;width:20px;height:20px;padding:0;margin:0;border:0;background:none;color:inherit;opacity:.7;cursor:pointer;pointer-events:auto;}
.igs-feed-close svg{display:block;width:100%;height:100%;}
.igs-feed-follow{flex:none;padding:2px 10px;border-radius:999px;background:var(--fp-accent);color:#fff;font-size:11px;font-weight:700;}
.igs-feed-icon{display:inline-flex;flex:none;width:16px;height:16px;}
.igs-feed-head .igs-feed-icon{width:20px;height:20px;}
.igs-feed-icon svg{width:100%;height:100%;display:block;}
.igs-feed-list{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;padding:8px 10px calc(34px + var(--igs-phone-sink,0px));overflow:hidden;contain:layout paint;}
.igs-feed-post{flex:none;display:flex;gap:9px;padding:10px;border-radius:10px;background:var(--fp-card);box-sizing:border-box;}
.igs-feed-post[data-fresh]{animation:igs-feed-in .38s ease-out both;}
.igs-feed-avatar{flex:none;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--fp-av,#9aa0aa);color:#fff;font-size:14px;font-weight:700;}
.igs-feed-avatar.is-small{width:18px;height:18px;font-size:10px;}
.igs-feed-avatar[data-anon]{background:#c9ccd3;}
.igs-feed-avatar .igs-feed-icon{width:20px;height:20px;}
.igs-feed-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;}
.igs-feed-who{display:flex;align-items:center;gap:6px;min-width:0;}
.igs-feed-info{display:flex;flex-direction:column;gap:1px;min-width:0;}
.igs-feed-name{font-size:12.5px;font-weight:700;color:var(--fp-name);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-feed-identity{font-size:10.5px;color:var(--fp-sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-feed-sub-line,.igs-feed-time,.igs-feed-byline{font-size:10.5px;color:var(--fp-sub);}
.igs-feed-extra{display:flex;align-items:center;gap:6px;min-width:0;}
.igs-feed-extra-text{max-width:100%;padding:1px 7px;border-radius:999px;background:var(--fp-accent);color:#fff;font-size:10.5px;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-feed-stars{display:inline-flex;gap:1px;}
.igs-feed-star{width:12px;height:12px;color:#d9d2c0;}
.igs-feed-star.is-on{color:#f5a300;}
.igs-feed-text{font-size:12.5px;line-height:1.5;word-break:break-all;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;}
.igs-feed-hl{color:var(--fp-accent);}
.igs-feed-meta{display:flex;align-items:center;gap:16px;color:var(--fp-sub);font-size:10.5px;}
.igs-feed-stat{display:inline-flex;align-items:center;gap:3px;}
.igs-feed-replies{display:flex;flex-direction:column;gap:2px;margin-top:2px;padding:5px 7px;border-radius:6px;background:var(--fp-reply);}
.igs-feed-reply{display:flex;gap:4px;font-size:11.5px;line-height:1.45;}
.igs-feed-rname{flex:none;color:var(--fp-name);font-weight:600;}
.igs-feed-rname::after{content:"：";font-weight:400;}
.igs-feed-rtext{min-width:0;word-break:break-all;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.igs-feed-hot,.igs-feed-badge{display:none;}
.igs-feed-stage[data-platform="news"]{--fp-bg:#fff;--fp-bar:#d7263d;--fp-status:#fff;--fp-head-ink:#fff;--fp-app:#fff;--fp-head-line:#d7263d;--fp-name:#8a8f98;--fp-reply:#f6f6f6;}
.igs-feed-strip{flex:none;display:flex;gap:16px;padding:0 14px 7px;background:#d7263d;font-size:12.5px;}
.igs-feed-chip{color:#ffc9d0;}
.igs-feed-chip.is-on{color:#fff;font-weight:800;box-shadow:inset 0 -2px 0 #fff;}
.igs-feed-stage[data-platform="news"] .igs-feed-post{flex-direction:column;gap:6px;border-radius:0;border-bottom:1px solid var(--fp-line);padding:11px 4px;}
.igs-feed-news-row{display:flex;gap:10px;align-items:flex-start;}
.igs-feed-news-row .igs-feed-body{gap:6px;}
.igs-feed-stage[data-platform="news"] .igs-feed-text{font-size:15px;font-weight:800;line-height:1.4;-webkit-line-clamp:3;}
.igs-feed-thumb{flex:none;width:74px;height:56px;border-radius:4px;background:#dde0e5;}
.igs-feed-stage[data-platform="news"] .igs-feed-replies::before{content:"热评";margin-bottom:2px;color:#d7263d;font-size:11px;font-weight:800;}
.igs-feed-stage[data-platform="moments"]{--fp-bg:#fff;--fp-line:#e5e5e5;--fp-name:#576b95;--fp-reply:#f3f3f5;--fp-card:#fff;--fp-head-line:#e5e5e5;--fp-app:#18191c;}
.igs-feed-stage[data-platform="moments"] .igs-feed-head{position:absolute;z-index:2;top:0;left:0;right:0;background:none;border:0;color:#fff;}
.igs-feed-stage[data-platform="moments"] .igs-feed-app{display:none;}
.igs-feed-stage[data-platform="moments"] .igs-phone-status{color:#fff;}
.igs-feed-cover{position:relative;flex:none;height:26%;min-height:110px;background:linear-gradient(160deg,#6d8fb8,#2c3e55);background-size:cover;background-position:center;}
.igs-feed-cover-who{position:absolute;right:12px;bottom:-18px;display:flex;align-items:center;gap:8px;}
.igs-feed-cover-who .igs-feed-name{color:#fff;font-size:13px;text-shadow:0 1px 2px #000;}
.igs-feed-cover-who .igs-feed-avatar{width:44px;height:44px;border-radius:6px;box-shadow:0 0 0 2px #fff;font-size:18px;}
.igs-feed-stage[data-platform="moments"] .igs-feed-list{padding-top:28px;gap:0;}
.igs-feed-stage[data-platform="moments"] .igs-feed-post{border-radius:0;border-bottom:1px solid var(--fp-line);padding:12px 8px;}
.igs-feed-stage[data-platform="moments"] .igs-feed-avatar{border-radius:5px;}
.igs-feed-stage[data-platform="moments"] .igs-feed-text{margin-bottom:22px;}
.igs-feed-stage[data-platform="moments"] .igs-feed-extra{order:1;gap:10px;}
.igs-feed-stage[data-platform="moments"] .igs-feed-extra-text{padding:0;background:none;color:#576b95;font-size:10.5px;}
.igs-feed-stage[data-platform="moments"] .igs-feed-meta{order:2;justify-content:flex-end;}
.igs-feed-stage[data-platform="moments"] .igs-feed-meta .igs-feed-stat:last-child{display:none;}
.igs-feed-stage[data-platform="moments"] .igs-feed-replies{order:3;border-radius:2px;}
.igs-feed-stage[data-platform="weibo"]{--fp-bg:#f2f2f2;--fp-name:#eb7340;--fp-reply:#f7f7f7;}
.igs-feed-hotbar{flex:none;display:flex;align-items:center;gap:5px;padding:6px 12px;background:#fff4e6;color:#ff8200;font-size:11.5px;overflow:hidden;white-space:nowrap;}
.igs-feed-hotbar b{flex:none;}
.igs-feed-hotbar span:last-child{color:#7a5a30;overflow:hidden;text-overflow:ellipsis;}
.igs-feed-stage[data-platform="weibo"] .igs-feed-post{border-radius:6px;}
.igs-feed-stage[data-platform="weibo"] .igs-feed-body{gap:5px;}
.igs-feed-stage[data-platform="weibo"] .igs-feed-hl{color:#eb7340;font-weight:600;}
.igs-feed-stage[data-platform="weibo"] .igs-feed-hl.is-at{color:#3b7ef6;}
.igs-feed-stage[data-platform="weibo"] .igs-feed-extra{display:none;}
.igs-feed-stage[data-platform="weibo"] .igs-feed-meta{justify-content:space-between;padding-top:6px;border-top:1px solid var(--fp-line);}
.igs-feed-stage[data-platform="weibo"] .igs-feed-meta .igs-feed-stat{flex:1;justify-content:center;}
.igs-feed-stage[data-platform="zhihu"]{--fp-bg:#f6f6f6;--fp-bar:#1772f6;--fp-status:#fff;--fp-head-ink:#fff;--fp-app:#fff;--fp-head-line:#1772f6;--fp-name:#121212;--fp-reply:#f6f6f6;}
.igs-feed-search{flex:none;display:flex;align-items:center;gap:8px;padding:0 12px 8px;background:#1772f6;color:#fff;}
.igs-feed-search .igs-feed-icon{width:18px;height:18px;}
.igs-feed-search-pill{flex:1;height:22px;border-radius:999px;background:#fff;}
.igs-feed-stage[data-platform="zhihu"] .igs-feed-post{flex-direction:column;gap:6px;border-radius:0;}
.igs-feed-question{font-size:14px;font-weight:800;line-height:1.4;color:#121212;}
.igs-feed-stage[data-platform="zhihu"] .igs-feed-avatar{width:24px;height:24px;font-size:11px;}
.igs-feed-stage[data-platform="zhihu"] .igs-feed-text{-webkit-line-clamp:3;color:#444;}
.igs-feed-agree{display:inline-flex;align-items:center;gap:3px;padding:3px 10px 3px 6px;border-radius:3px;background:#e5f0ff;color:#1772f6;font-weight:700;}
.igs-feed-agree .igs-feed-icon{width:13px;height:13px;}
.igs-feed-stage[data-platform="review"]{--fp-bg:#fbf3df;--fp-card:#fffaf0;--fp-name:#a8741a;--fp-reply:#f6ead0;--fp-app:#7a5410;--fp-head-line:#e0a43a;}
.igs-feed-work{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;background:#fff0c9;}
.igs-feed-work-title{min-width:0;font-size:16px;font-weight:800;color:#7a5410;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-feed-work-stars{flex:none;}
.igs-feed-stars.is-big{gap:2px;}
.igs-feed-stars.is-big .igs-feed-star{width:19px;height:19px;color:#e6dcc3;}
.igs-feed-stars.is-big .igs-feed-star.is-on{color:#f5a300;}
.igs-feed-stage[data-platform="review"] .igs-feed-post{flex-direction:column;gap:6px;box-shadow:0 0 0 1px #ecd9a8;}
.igs-feed-stage[data-platform="review"] .igs-feed-who{gap:8px;}
.igs-feed-stage[data-platform="review"] .igs-feed-replies::before{content:"讨论";color:#a8741a;font-size:10.5px;font-weight:700;}
.igs-feed-stage[data-platform="xhs"]{--fp-bg:#f7f7f8;--fp-name:#555;--fp-reply:#f7f7f8;}
.igs-feed-stage[data-platform="xhs"] .igs-feed-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:8px;}
.igs-feed-stage[data-platform="xhs"] .igs-feed-list[data-n="1"]{grid-template-columns:minmax(0,72%);justify-content:center;}
.igs-feed-stage[data-platform="xhs"] .igs-feed-post{flex-direction:column;gap:5px;padding:0 0 8px;border-radius:10px;overflow:hidden;}
.igs-feed-cover-block{display:flex;align-items:flex-end;min-height:92px;padding:8px;background:linear-gradient(145deg,#ff2442,#ff9aa8);}
.igs-feed-post:nth-child(2) .igs-feed-cover-block{min-height:122px;background:linear-gradient(145deg,#ff7a45,#ffc7a3);}
.igs-feed-post:nth-child(3) .igs-feed-cover-block{background:linear-gradient(145deg,#ff5c8a,#ffc2d4);}
.igs-feed-cover-title{color:#fff;font-size:14px;font-weight:800;line-height:1.3;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.igs-feed-stage[data-platform="xhs"] .igs-feed-text{padding:0 8px;font-size:12px;font-weight:600;-webkit-line-clamp:2;}
.igs-feed-foot{display:flex;align-items:center;gap:5px;padding:0 8px;color:var(--fp-sub);font-size:10.5px;}
.igs-feed-foot .igs-feed-name{flex:1;font-size:10.5px;font-weight:400;}
.igs-feed-foot .igs-feed-stat{color:#ff2442;}
.igs-feed-stage[data-platform="xhs"] .igs-feed-replies{margin:0 8px;padding:3px 5px;}
.igs-feed-stage[data-platform="xhs"] .igs-feed-reply{font-size:10.5px;}
.igs-feed-stage[data-platform="xhs"] .igs-feed-rtext{-webkit-line-clamp:1;}
.igs-feed-stage[data-platform="tieba"]{--fp-bg:#eef3fb;--fp-name:#3385ff;--fp-reply:#f2f6fd;--fp-bar:#3385ff;--fp-status:#fff;--fp-head-ink:#fff;--fp-app:#fff;--fp-head-line:#3385ff;}
.igs-feed-stage[data-platform="tieba"] .igs-feed-post{flex-direction:column;gap:6px;border-radius:3px;}
.igs-feed-floorbar{display:flex;align-items:center;gap:6px;}
.igs-feed-floor{flex:none;font-size:11px;font-weight:800;color:#3385ff;}
.igs-feed-owner{flex:none;padding:0 5px;border-radius:2px;box-shadow:0 0 0 1px #3385ff;color:#3385ff;font-size:9.5px;line-height:14px;}
.igs-feed-floorbar .igs-feed-avatar{width:22px;height:22px;font-size:11px;border-radius:3px;}
.igs-feed-stage[data-platform="tieba"] .igs-feed-text{padding-left:2px;}
.igs-feed-stage[data-platform="tieba"] .igs-feed-replies{margin-left:12px;border-radius:2px;border-left:2px solid #c9dafc;}
.igs-feed-stage[data-platform="douban"]{--fp-bg:#f1f4ec;--fp-name:#2e963d;--fp-reply:#f0f4ea;--fp-bar:#2e963d;--fp-status:#fff;--fp-head-ink:#fff;--fp-app:#fff;--fp-head-line:#2e963d;--fp-card:#fcfdf9;}
.igs-feed-stage[data-platform="douban"] .igs-feed-post{flex-direction:column;gap:4px;border-radius:3px;box-shadow:0 0 0 1px #dde6d2;}
.igs-feed-title{font-size:14px;font-weight:800;line-height:1.35;color:#111;}
.igs-feed-stage[data-platform="douban"] .igs-feed-byline{display:flex;gap:2px;}
.igs-feed-stage[data-platform="douban"] .igs-feed-name{font-size:11px;font-weight:400;}
.igs-feed-stage[data-platform="douban"] .igs-feed-text{color:#7b8076;-webkit-line-clamp:2;}
.igs-feed-stage[data-platform="hupu"]{--fp-bg:#ececec;--fp-name:#c60100;--fp-reply:#f5f5f5;--fp-bar:#8f0000;--fp-status:#fff;--fp-head-ink:#fff;--fp-app:#fff;--fp-head-line:#c60100;}
.igs-feed-stage[data-platform="hupu"] .igs-feed-post{border-radius:2px;border-left:4px solid #c60100;}
.igs-feed-stage[data-platform="hupu"] .igs-feed-reply{flex-wrap:wrap;align-items:baseline;}
.igs-feed-stage[data-platform="hupu"] .igs-feed-hot{display:inline;margin-left:auto;font-size:10.5px;font-weight:700;color:#c60100;}
.igs-feed-stage[data-platform="hupu"] .igs-feed-badge{display:inline;padding:0 4px;border-radius:2px;background:#c60100;color:#fff;font-size:9.5px;line-height:14px;}
.igs-feed-stage[data-platform="hupu"] .igs-feed-reply[data-top]{font-weight:600;}
.igs-feed-stage[data-platform="confess"]{--fp-bg:#ffeef3;--fp-name:#e0527a;--fp-reply:#fff;--fp-head-line:#ffc2d4;}
.igs-feed-stage[data-platform="confess"] .igs-feed-list{gap:12px;padding-top:14px;}
.igs-feed-stage[data-platform="confess"] .igs-feed-post{border-radius:3px;background:#fff3b0;box-shadow:0 5px 8px -5px #c9a8b4;transform:rotate(-1deg);}
.igs-feed-stage[data-platform="confess"] .igs-feed-post:nth-child(2){background:#ffd9e4;transform:rotate(1deg);}
.igs-feed-stage[data-platform="confess"] .igs-feed-post:nth-child(3){background:#d9efff;transform:rotate(-.6deg);}
.igs-feed-notetag{align-self:flex-start;font-size:11.5px;font-weight:800;color:#e0527a;}
.igs-feed-stage[data-platform="confess"] .igs-feed-extra-text{background:#fff;color:#e0527a;}
.igs-feed-stage[data-platform="starnet"]{--fp-bg:#0b1220;--fp-card:#111b2e;--fp-bar:#0d1626;--fp-ink:#cfe6ff;--fp-sub:#6f8bb0;--fp-name:#38bdf8;--fp-reply:#0b1424;--fp-status:#e8f4ff;--fp-line:#1f3a5f;}
.igs-feed-stage[data-platform="starnet"] .igs-feed-post{border-radius:4px;box-shadow:0 0 0 1px #1f3a5f;}
.igs-feed-stamp{font:10.5px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#6f8bb0;}
.igs-feed-stage[data-platform="starnet"] .igs-feed-extra-text{border-radius:2px;background:#0b1220;color:#38bdf8;box-shadow:0 0 0 1px #38bdf8;}
.igs-feed-stage[data-skin="paper"]{position:absolute;inset:0;--fp-paper:#efe2c3;--fp-ink:#3b2f1f;--fp-rule:#b9a679;--fp-note:#6b5a3a;}
.igs-feed-stage[data-skin="paper"] .igs-live-dim{position:absolute;inset:0;}
.igs-feed-paper{position:absolute;top:5%;left:0;right:0;margin-inline:auto;width:min(560px,88%);max-height:var(--igs-feed-max,66%);box-sizing:border-box;padding:20px 26px 18px;overflow:hidden;contain:layout paint style;background:var(--fp-paper);color:var(--fp-ink);box-shadow:0 0 0 1px #c9b78f,0 0 0 6px var(--fp-paper),0 0 0 7px #c9b78f,0 20px 40px -18px rgba(0,0,0,.65);font-family:"LXGW WenKai","LXGW WenKai Lite","Source Han Serif CN","Songti SC",serif;animation:igs-feed-rise .45s cubic-bezier(.22,1,.36,1) both;}
.igs-feed-stage[data-leaving] .igs-feed-paper{animation:igs-feed-sink .4s ease-in forwards;}
.igs-feed-paper-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:8px;margin-bottom:6px;border-bottom:3px double var(--fp-accent);}
.igs-feed-paper-title{font-size:22px;font-weight:800;letter-spacing:.32em;color:var(--fp-accent);}
.igs-feed-seal{flex:none;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:2px solid var(--fp-accent);border-radius:5px;color:var(--fp-accent);font-size:19px;font-weight:800;transform:rotate(-8deg);}
.igs-feed-stage[data-skin="paper"] .igs-feed-list{display:block;padding:0;overflow:hidden;}
.igs-feed-stage[data-skin="paper"] .igs-feed-post{display:block;padding:10px 0 8px;border-radius:0;background:none;border-bottom:1px dashed var(--fp-rule);}
.igs-feed-stage[data-skin="paper"] .igs-feed-post:last-child{border-bottom:0;}
.igs-feed-stage[data-skin="paper"] .igs-feed-avatar,.igs-feed-stage[data-skin="paper"] .igs-feed-meta{display:none;}
.igs-feed-stage[data-skin="paper"] .igs-feed-body{gap:3px;}
.igs-feed-stage[data-skin="paper"] .igs-feed-name{font-size:13px;color:var(--fp-accent);letter-spacing:.08em;}
.igs-feed-stage[data-skin="paper"] .igs-feed-extra-text{padding:0;background:none;color:var(--fp-note);font-size:11.5px;}
.igs-feed-stage[data-skin="paper"] .igs-feed-extra-text::before{content:"【";}
.igs-feed-stage[data-skin="paper"] .igs-feed-extra-text::after{content:"】";}
.igs-feed-stage[data-skin="paper"] .igs-feed-text{font-size:15px;line-height:1.7;-webkit-line-clamp:5;}
.igs-feed-stage[data-skin="paper"] .igs-feed-hl{color:var(--fp-accent);}
.igs-feed-stage[data-skin="paper"] .igs-feed-replies{margin-top:3px;padding:0 0 0 12px;border-radius:0;background:none;border-left:2px solid var(--fp-accent);}
.igs-feed-stage[data-skin="paper"] .igs-feed-reply{font-size:12px;color:var(--fp-note);}
.igs-feed-stage[data-skin="paper"] .igs-feed-rname{color:var(--fp-note);}
.igs-feed-stage[data-platform="radio"],.igs-feed-stage[data-platform="wall"]{--fp-paper:#2d3027;--fp-ink:#dcd8c2;--fp-rule:#59604a;--fp-note:#a9a68f;}
.igs-feed-stage[data-platform="radio"] .igs-feed-paper,.igs-feed-stage[data-platform="wall"] .igs-feed-paper{box-shadow:0 0 0 1px #59604a,0 0 0 6px var(--fp-paper),0 0 0 7px #59604a,0 20px 40px -18px rgba(0,0,0,.7);}
.igs-feed-stage[data-platform="extra"]{--fp-paper:#e9e7e0;--fp-ink:#222;--fp-rule:#9a9a92;--fp-note:#555;}
.igs-feed-stage[data-platform="extra"] .igs-feed-paper-title{font-size:28px;letter-spacing:.5em;}
.igs-feed-stage[data-platform="gazette"],.igs-feed-stage[data-platform="owl"],.igs-feed-stage[data-platform="letters"]{--fp-paper:#ece4d2;}
/* 状态栏跟剧情：低电量（红）与无服务；锁屏时状态栏改白字 */
.igs-phone-lowbat{color:#ff3b30;font-size:11px;font-weight:700;}
.igs-phone-nosig{font-size:11px;font-weight:600;opacity:.85;}
.igs-feed-stage[data-locked] .igs-phone-status{color:#fff;}
/* 夜间：社区 App 页面切深色（各平台沿用自己的主色，换暗底暗卡） */
.igs-feed-stage[data-night][data-layout="phone"]{--fp-bg:#14161a;--fp-card:#1e2127;--fp-bar:#1a1c21;--fp-ink:#e6e8ec;--fp-sub:#8b919b;--fp-name:#aeb4be;--fp-reply:#262a31;--fp-status:#e6e8ec;--fp-line:#2a2e36;--fp-head-ink:#8b919b;}
.igs-feed-stage[data-night] .igs-feed-title,.igs-feed-stage[data-night] .igs-feed-question{color:var(--fp-ink);}
.igs-feed-stage[data-night][data-platform="zhihu"] .igs-feed-text,.igs-feed-stage[data-night][data-platform="douban"] .igs-feed-text{color:var(--fp-ink);}
.igs-feed-stage[data-night][data-platform="news"]{--fp-bar:#8f1a28;--fp-status:#fff;--fp-head-ink:#fff;}
.igs-feed-stage[data-night][data-platform="zhihu"]{--fp-bar:#0f4aa8;--fp-status:#fff;--fp-head-ink:#fff;--fp-name:#e6e8ec;}
.igs-feed-stage[data-night][data-platform="tieba"]{--fp-bar:#1d56b3;--fp-status:#fff;--fp-head-ink:#fff;--fp-name:#7fb0ff;}
.igs-feed-stage[data-night][data-platform="douban"]{--fp-bar:#1f6b2a;--fp-status:#fff;--fp-head-ink:#fff;--fp-name:#7fcf8a;}
.igs-feed-stage[data-night][data-platform="hupu"]{--fp-bar:#5c0000;--fp-status:#fff;--fp-head-ink:#fff;--fp-name:#ff6b6b;}
.igs-feed-stage[data-night][data-platform="moments"]{--fp-name:#8fa4d0;--fp-app:#e6e8ec;}
.igs-feed-stage[data-night][data-platform="weibo"]{--fp-name:#eb7340;}
.igs-feed-stage[data-night][data-platform="review"]{--fp-name:#e0b25a;--fp-app:#e8c880;--fp-card:#2a2418;--fp-reply:#352d1d;}
.igs-feed-stage[data-night][data-platform="review"] .igs-feed-work{background:#2a2418;}
.igs-feed-stage[data-night][data-platform="review"] .igs-feed-work-title{color:#e8c880;}
.igs-feed-stage[data-night][data-platform="confess"]{--fp-ink:#2b2b33;--fp-name:#e0527a;--fp-reply:#fff;}
.igs-feed-stage[data-night][data-platform="starnet"]{--fp-bg:#0b1220;--fp-card:#111b2e;--fp-bar:#0d1626;--fp-ink:#cfe6ff;--fp-sub:#6f8bb0;--fp-name:#38bdf8;--fp-reply:#0b1424;--fp-status:#e8f4ff;--fp-line:#1f3a5f;}
/* 熟人：头像换成角色头像，名字后一枚实色小胶囊 */
.igs-feed-avatar-img{display:block;width:100%;height:100%;border-radius:inherit;object-fit:cover;}
.igs-feed-avatar[data-friend]{overflow:hidden;background:#d9dce2;}
.igs-feed-friend{flex:none;padding:0 6px;border-radius:999px;background:var(--fp-accent);color:#fff;font-size:9.5px;font-weight:700;line-height:15px;white-space:nowrap;}
.igs-feed-reply .igs-feed-friend{align-self:center;margin-right:-1px;}
.igs-feed-stage[data-skin="paper"] .igs-feed-friend{display:none;}
/* 锁屏：壁纸 + 大号时间 + 一张通知卡，约 900ms 后整屏上滑 */
.igs-feed-lock{position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;align-items:center;overflow:hidden;background:#20242c;color:#fff;will-change:transform;}
.igs-feed-lock[data-unlock]{transform:translateY(-104%);transition:transform .46s cubic-bezier(.55,0,.35,1);}
.igs-feed-lock-wall{position:absolute;inset:0;background:linear-gradient(165deg,#3b4a63,#161a24);background-size:cover;background-position:center;}
.igs-feed-lock-clock{position:relative;margin-top:16%;text-align:center;text-shadow:0 1px 6px #000;}
.igs-feed-lock-time{font-size:58px;font-weight:300;line-height:1;letter-spacing:.02em;}
.igs-feed-lock-date{margin-top:6px;font-size:13px;font-weight:500;}
.igs-feed-lock-note{position:relative;width:86%;margin-top:auto;margin-bottom:16%;padding:9px 11px;box-sizing:border-box;border-radius:14px;background:#f2f3f5;color:#18191c;}
.igs-feed-lock-app{display:flex;align-items:center;gap:6px;font-size:10.5px;color:#6b7078;}
.igs-feed-lock-dot{flex:none;width:9px;height:9px;border-radius:50%;background:var(--fp-accent);}
.igs-feed-lock-body{margin-top:3px;font-size:12.5px;line-height:1.4;word-break:break-all;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
/* 购物：橙色顶栏 + 搜索框 + 双列商品卡 */
.igs-feed-stage[data-platform="shop"]{--fp-bg:#f5f5f5;--fp-bar:#ff5000;--fp-status:#fff;--fp-head-ink:#fff;--fp-app:#fff;--fp-head-line:#ff5000;--fp-name:#8a8f98;--fp-reply:#fff6f0;}
.igs-feed-stage[data-platform="shop"] .igs-feed-search{background:#ff5000;}
.igs-feed-stage[data-platform="shop"] .igs-feed-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:8px;}
.igs-feed-stage[data-platform="shop"] .igs-feed-list[data-n="1"]{grid-template-columns:minmax(0,72%);justify-content:center;}
.igs-feed-stage[data-platform="shop"] .igs-feed-post{flex-direction:column;gap:4px;padding:0 0 8px;border-radius:8px;overflow:hidden;}
.igs-feed-shop-img{display:flex;align-items:center;justify-content:center;aspect-ratio:1/1;background:#ececec;color:#c4c6cb;}
.igs-feed-shop-bag{width:38px;height:38px;}
.igs-feed-shop-title{padding:0 8px;font-size:12px;font-weight:600;-webkit-line-clamp:2;}
.igs-feed-shop-row{display:flex;align-items:baseline;gap:6px;padding:0 8px;}
.igs-feed-price{color:#ff2d1f;font-size:17px;font-weight:800;line-height:1.1;}
.igs-feed-sales{color:var(--fp-sub);font-size:10px;}
.igs-feed-shop-name{padding:0 8px;color:var(--fp-sub);font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-feed-stage[data-platform="shop"] .igs-feed-replies{margin:2px 8px 0;padding:3px 5px;}
.igs-feed-stage[data-platform="shop"] .igs-feed-replies::before{content:"宝贝评价";color:#ff5000;font-size:10px;font-weight:800;}
.igs-feed-stage[data-platform="shop"] .igs-feed-reply{font-size:10.5px;}
.igs-feed-stage[data-platform="shop"] .igs-feed-rtext{-webkit-line-clamp:2;}
/* 偷看专属 App：搜索记录 / 备忘录 / 相册 / 聊天列表 */
.igs-feed-stage[data-platform="search"]{--fp-bg:#fff;--fp-bar:#fff;--fp-head-line:#eceef1;--fp-app:#18191c;--fp-head-ink:#8a8f98;}
.igs-feed-stage[data-platform="search"] .igs-feed-search{background:var(--fp-bar);color:#8a8f98;}
.igs-feed-stage[data-platform="search"] .igs-feed-search-pill{background:#f1f2f4;}
.igs-feed-stage[data-platform="search"] .igs-feed-list{flex-direction:column-reverse;justify-content:flex-end;gap:0;padding-top:2px;}
.igs-feed-stage[data-platform="search"] .igs-feed-post{align-items:center;gap:10px;padding:12px 6px;border-radius:0;background:none;border-bottom:1px solid var(--fp-line);}
.igs-feed-term-clock,.igs-feed-term-x{color:#b6bac2;}
.igs-feed-term-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.igs-feed-term{font-size:13.5px;line-height:1.35;word-break:break-all;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.igs-feed-term-time{font-size:10px;color:var(--fp-sub);}
.igs-feed-stage[data-platform="memo"]{--fp-bg:#f6f1dc;--fp-bar:#f6f1dc;--fp-head-line:#e8dfb8;--fp-app:#7a5c00;--fp-head-ink:#b08a00;}
.igs-feed-stage[data-platform="memo"] .igs-feed-list{gap:12px;padding-top:12px;}
.igs-feed-stage[data-platform="memo"] .igs-feed-post{flex-direction:column;gap:5px;padding:11px 12px;border-radius:2px;background:#fff0a0;color:#3d3510;box-shadow:0 5px 8px -5px rgba(90,70,0,.5);transform:rotate(-.8deg);}
.igs-feed-stage[data-platform="memo"] .igs-feed-post:nth-child(2){background:#ffe27a;transform:rotate(.7deg);}
.igs-feed-stage[data-platform="memo"] .igs-feed-post:nth-child(3){background:#fff7bd;transform:rotate(-.4deg);}
.igs-feed-memo-head{display:flex;align-items:center;gap:8px;min-width:0;}
.igs-feed-memo-title{flex:1;min-width:0;font-size:14px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-feed-draft{flex:none;padding:0 6px;border-radius:2px;background:#d6453d;color:#fff;font-size:9.5px;font-weight:700;line-height:15px;}
.igs-feed-memo-text{font-size:12.5px;line-height:1.55;word-break:break-all;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden;}
.igs-feed-stage[data-platform="album"]{--fp-bg:#f2f2f7;--fp-bar:#f2f2f7;--fp-head-line:#e3e3e8;--fp-app:#18191c;--fp-head-ink:#8a8f98;}
.igs-feed-stage[data-platform="album"] .igs-feed-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:10px;}
.igs-feed-stage[data-platform="album"] .igs-feed-list[data-n="1"]{grid-template-columns:minmax(0,64%);justify-content:center;}
.igs-feed-stage[data-platform="album"] .igs-feed-post{flex-direction:column;gap:3px;padding:0;background:none;pointer-events:none;}
.igs-feed-photo{display:flex;align-items:center;justify-content:center;aspect-ratio:4/3;border-radius:8px;background:#c8c9ce;color:#f2f2f7;}
.igs-feed-photo-icon{width:34px;height:34px;}
.igs-feed-photo-cap{font-size:10.5px;line-height:1.4;word-break:break-all;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.igs-feed-photo-meta{font-size:9.5px;color:var(--fp-sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-feed-stage[data-night][data-platform="album"] .igs-feed-photo{background:#3a3d44;color:#8b919b;}
.igs-feed-stage[data-platform="chats"]{--fp-bg:#ededed;--fp-bar:#ededed;--fp-card:#fff;--fp-head-line:#dcdcdc;--fp-app:#18191c;--fp-head-ink:#8a8f98;--fp-reply:#f0f0f0;--fp-name:#18191c;}
.igs-feed-stage[data-platform="chats"] .igs-feed-list{gap:0;padding:0 0 calc(34px + var(--igs-phone-sink,0px));}
.igs-feed-stage[data-platform="chats"] .igs-feed-post{flex-direction:column;gap:0;padding:0;border-radius:0;border-bottom:1px solid var(--fp-line);}
.igs-feed-stage[data-platform="chats"] .igs-feed-post[data-pinned]{background:var(--fp-reply);}
.igs-feed-chat-row{display:flex;align-items:center;gap:10px;padding:9px 12px;}
.igs-feed-chat-face{position:relative;flex:none;}
.igs-feed-chat-face .igs-feed-avatar{width:38px;height:38px;border-radius:5px;font-size:16px;}
.igs-feed-unread{position:absolute;top:-5px;right:-5px;min-width:15px;height:15px;padding:0 3px;box-sizing:border-box;border-radius:999px;background:#fa5151;color:#fff;font-size:9.5px;font-style:normal;font-weight:700;line-height:15px;text-align:center;}
.igs-feed-chat-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}
.igs-feed-chat-last{font-size:11.5px;color:var(--fp-sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-feed-chat-side{flex:none;align-self:flex-start;display:flex;flex-direction:column;align-items:flex-end;gap:5px;padding-top:2px;}
.igs-feed-chat-time{font-size:10px;color:#b2b2b2;}
.igs-feed-chat-pin{width:12px;height:12px;color:#b2b2b2;}
.igs-feed-bubbles{display:flex;flex-direction:column;gap:5px;padding:0 12px 9px 60px;}
.igs-feed-bubbles:empty{display:none;}
.igs-feed-bubble{max-width:82%;padding:5px 9px;border-radius:5px;background:#fff;color:#18191c;font-size:11.5px;line-height:1.45;word-break:break-all;box-shadow:0 0 0 1px #e1e1e1;}
.igs-feed-bubble[data-side="self"]{align-self:flex-end;background:#95ec69;box-shadow:none;}
.igs-feed-stage[data-night][data-platform="chats"] .igs-feed-bubble{background:#2c2f36;color:#e6e8ec;box-shadow:none;}
.igs-feed-stage[data-night][data-platform="chats"] .igs-feed-bubble[data-side="self"]{background:#2f7d3b;}
/* 偷看别人的手机：左上角小角标 + 四周暗角；锁屏多一步密码点阵 */
.igs-feed-peek{position:absolute;z-index:6;top:1px;left:30px;display:flex;align-items:center;gap:3px;padding:0 6px 0 4px;height:11px;border-radius:0 0 5px 5px;background:#d6453d;color:#fff;font-size:8.5px;font-weight:700;line-height:11px;letter-spacing:.04em;pointer-events:none;}
.igs-feed-peek-icon{display:inline-flex;width:9px;height:9px;}
.igs-feed-peek-icon svg{display:block;width:100%;height:100%;}
.igs-feed-vignette{position:absolute;inset:0;z-index:3;pointer-events:none;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 58%,rgba(0,0,0,.3) 100%);}
.igs-feed-lock-wall.is-peek{transform:scale(1.7);}
.igs-feed-lock-shade{position:absolute;inset:0;background:#000;opacity:.5;}
.igs-feed-lock-owner{margin-bottom:10px;font-size:12px;font-weight:600;letter-spacing:.06em;}
.igs-feed-lock-pin{position:relative;display:flex;gap:12px;margin-top:22px;}
.igs-feed-lock-pin-dot{width:11px;height:11px;border-radius:50%;box-sizing:border-box;border:1.5px solid #fff;opacity:.45;transition:transform .16s ease,opacity .16s ease;}
.igs-feed-lock-pin-dot[data-on]{background:#fff;opacity:1;transform:scale(1.2);}
/* 回看入口：与观众弹幕入口同位同尺寸，开着观众弹幕时排在它右边 */
.igs-feed-entry{--igs-aud-entry:38px;position:absolute;left:14px;top:var(--igs-feed-top,14px);width:calc(var(--igs-aud-entry) * var(--igs-hud-scale,1));height:calc(var(--igs-aud-entry) * var(--igs-hud-scale,1));padding:0;border:0;background:transparent;color:#f4f1ec;opacity:.55;cursor:pointer;pointer-events:auto;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));transition:opacity .2s ease;}
.igs-feed-entry[hidden]{display:none;}
.igs-feed-entry svg{display:block;width:100%;height:100%;}
.igs-feed-entry[data-beside="1"]{left:calc(14px + var(--igs-aud-entry) * var(--igs-hud-scale,1) + 8px);}
.igs-feed-entry[data-size="small"]{--igs-aud-entry:30px;}
.igs-feed-entry[data-size="large"]{--igs-aud-entry:46px;}
.igs-feed-entry:hover,.igs-feed-entry:focus-visible{opacity:1;}
.igs-feed-entry:focus-visible{outline:2px solid #f4e3ad;outline-offset:2px;border-radius:8px;}
.igs-feed-entry-dot{position:absolute;top:-1px;right:-2px;width:11px;height:11px;border-radius:50%;box-shadow:0 0 0 1.5px #14161a;}
@media (pointer:coarse){.igs-feed-entry::after{content:"";position:absolute;inset:-8px;}}
.igs-feed-review{position:absolute;inset:0;z-index:2;pointer-events:auto;}
.igs-feed-review-host{position:absolute;inset:0;pointer-events:none;}
.igs-feed-review .igs-live-phone,.igs-feed-review .igs-feed-paper{pointer-events:auto;}
.igs-feed-review .igs-feed-stage .igs-feed-list{overflow-y:auto;overscroll-behavior:contain;}
.igs-feed-review-close{position:absolute;top:14px;right:14px;width:38px;height:38px;padding:8px;box-sizing:border-box;border:0;border-radius:50%;background:#22262e;color:#f4f1ec;cursor:pointer;}
.igs-feed-review-close svg{display:block;width:100%;height:100%;}
@media (prefers-reduced-motion: reduce){
.igs-feed-post[data-fresh],.igs-feed-paper{animation:none;}
}
`.trim();
