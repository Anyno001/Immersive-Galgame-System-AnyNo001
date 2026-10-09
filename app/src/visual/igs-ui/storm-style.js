// 舆论风暴样式：手机外壳沿用 .igs-live-stage / .igs-live-phone（样式在 danmaku-style），这里只写屏幕内容。
// 运动只用 transform / opacity，不用 backdrop-filter 与滤镜动画，装饰用实色。
export const STORM_STYLE_TEXT = `
@keyframes igs-storm-shake{0%,100%{transform:none;}12%{transform:translateX(-5px) rotate(-.5deg);}25%{transform:translateX(5px) rotate(.5deg);}37%{transform:translateX(-4px);}50%{transform:translateX(4px);}62%{transform:translateX(-3px);}75%{transform:translateX(3px);}88%{transform:translateX(-1px);}}
@keyframes igs-storm-drop{from{opacity:0;transform:translateY(-120%);}to{opacity:1;transform:none;}}
@keyframes igs-storm-float{0%{opacity:0;transform:translate(0,0) scale(.6);}15%{opacity:1;}100%{opacity:0;transform:translate(var(--sn-drift,0),-190px) scale(1.15);}}
.igs-storm-stage{--sn-bg:#fff4f7;--sn-ink:#2a1a20;--sn-sub:#9a7a85;--sn-hot:#ff5c8a;--sn-hot-ink:#fff;--sn-tag:#f5b800;--sn-tag-ink:#4a3000;--sn-card:#fff;--sn-bar:transparent;--sn-status:#18191c;}
.igs-storm-stage[data-tone="black"]{--sn-bg:#15161a;--sn-ink:#e8e6e6;--sn-sub:#8b8f98;--sn-hot:#2a0f12;--sn-hot-ink:#ffd9d9;--sn-tag:#d7263d;--sn-tag-ink:#fff;--sn-card:#22242b;--sn-bar:#d7263d;--sn-status:#e8e6e6;}
.igs-storm-stage [hidden]{display:none !important;}
.igs-storm-stage .igs-live-phone{background:var(--sn-bg);color:var(--sn-ink);}
.igs-storm-stage .igs-phone-status{color:var(--sn-status);}
.igs-storm-stage[data-leaving] .igs-live-dim{animation:igs-live-dim-out .42s ease forwards;}
.igs-storm-screen{position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;padding:34px 10px 10px;box-sizing:border-box;background:var(--sn-bg);overflow:hidden;}
.igs-storm-stage[data-cover] .igs-storm-screen{background-image:var(--sn-cover);background-size:cover;background-position:center;}
.igs-storm-screen[data-shake]{animation:igs-storm-shake .5s ease-in-out .45s 3 both;}
.igs-storm-hot{position:relative;flex:none;display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:10px;background:var(--sn-hot);color:var(--sn-hot-ink);overflow:hidden;}
.igs-storm-flame{flex:none;display:inline-flex;width:16px;height:16px;color:var(--sn-tag);}
.igs-storm-flame svg,.igs-storm-bell svg,.igs-storm-heart svg{display:block;width:100%;height:100%;}
.igs-storm-hot-label{flex:none;font-size:11px;font-weight:800;letter-spacing:.08em;opacity:.85;}
.igs-storm-topic{position:relative;z-index:1;flex:1;min-width:0;font-size:14px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-storm-tag{position:relative;z-index:1;flex:none;padding:0 7px;border-radius:4px;background:var(--sn-tag);color:var(--sn-tag-ink);font-size:11px;font-weight:900;line-height:18px;}
.igs-storm-crack{position:absolute;inset:0;color:#d7263d;opacity:.6;pointer-events:none;}
.igs-storm-crack svg{display:block;width:100%;height:100%;}
.igs-storm-badge{flex:none;display:flex;align-items:center;gap:5px;font-size:12px;color:var(--sn-sub);}
.igs-storm-bell{display:inline-flex;width:15px;height:15px;color:var(--sn-hot);}
.igs-storm-stage[data-tone="black"] .igs-storm-bell{color:#d7263d;}
.igs-storm-badge-num{padding:0 6px;border-radius:999px;background:#ff3b30;color:#fff;font-size:11px;line-height:16px;font-variant-numeric:tabular-nums;}
.igs-storm-stats{flex:none;display:flex;gap:6px;}
.igs-storm-stat{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 2px;border-radius:8px;background:var(--sn-card);}
.igs-storm-num{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--sn-ink);}
.igs-storm-stat[data-stat="fans"] .igs-storm-num{color:#e0a000;}
.igs-storm-stage[data-tone="black"] .igs-storm-stat[data-stat="fans"] .igs-storm-num{color:#d7263d;}
.igs-storm-label{font-size:10px;color:var(--sn-sub);}
.igs-storm-notes{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;overflow:hidden;contain:layout paint;}
.igs-storm-note{flex:none;padding:7px 10px;border-radius:10px;background:var(--sn-card);border-left:4px solid var(--sn-accent);box-sizing:border-box;animation:igs-storm-drop .36s cubic-bezier(.22,1,.36,1) both;transition:opacity .3s ease;}
.igs-storm-stage[data-tone="black"] .igs-storm-note{border-left-color:#d7263d;}
.igs-storm-note[data-leaving]{opacity:0;}
.igs-storm-note-head{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--sn-sub);min-width:0;}
.igs-storm-dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--sn-accent);}
.igs-storm-plat{flex:none;}
.igs-storm-at{flex:none;color:#e0a000;font-weight:700;}
.igs-storm-stage[data-tone="black"] .igs-storm-at{color:#ff6b6b;}
.igs-storm-author{min-width:0;font-weight:700;color:var(--sn-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-storm-note-text{margin-top:3px;font-size:12.5px;line-height:1.45;word-break:break-all;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.igs-storm-hearts{position:absolute;left:0;right:0;bottom:0;height:0;pointer-events:none;}
.igs-storm-heart{position:absolute;bottom:20px;left:var(--sn-x,50%);width:20px;height:20px;color:#ff5c8a;opacity:0;animation:igs-storm-float 2.2s ease-out both;}
.igs-storm-heart:nth-child(even){color:#f5b800;}
.igs-storm-vignette{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .8s ease;background:radial-gradient(ellipse at center,transparent 45%,#120204 100%);}
.igs-storm-vignette[data-on]{opacity:.55;}
@media (prefers-reduced-motion: reduce){
.igs-storm-screen[data-shake],.igs-storm-note,.igs-storm-heart{animation:none;}
}
`.trim();
