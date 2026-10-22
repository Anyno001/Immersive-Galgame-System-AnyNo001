// 直白亲密包的样式。寿命由 --igs-dfx-life 驱动；装饰一律实色，光晕用实色径向渐变加 opacity。
// 减少动态效果（.is-reduced，由日常演出统一加类）与低画质下全部静态；对话框只当画框，不遮中央。
export const NSFW_STYLE_TEXT = `
#igs-overlay .igs-nfx{overflow:hidden;}
@keyframes igs-nfx-fade{0%{opacity:0}12%{opacity:1}84%{opacity:1}100%{opacity:0}}
@keyframes igs-nfx-flash{0%{opacity:0}5%{opacity:var(--igs-nfx-flash,.6)}22%{opacity:.18}40%{opacity:0}100%{opacity:0}}
@keyframes igs-nfx-beat{0%{opacity:0}14%{opacity:var(--igs-nfx-beat,.5)}40%{opacity:.1}100%{opacity:0}}
@keyframes igs-nfx-word{0%{opacity:0;transform:translateY(10px)}12%{opacity:1;transform:translateY(0)}82%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-8px)}}
#igs-overlay .igs-nfx-peak{--igs-nfx-flash:.45;--igs-nfx-beat:.4;--igs-nfx-beats:2;}
#igs-overlay .igs-nfx-peak.is-t2{--igs-nfx-flash:.65;--igs-nfx-beat:.55;--igs-nfx-beats:3;}
#igs-overlay .igs-nfx-peak.is-t3{--igs-nfx-flash:.85;--igs-nfx-beat:.7;--igs-nfx-beats:4;}
#igs-overlay .igs-nfx-flash{position:absolute;inset:0;background:#ffffff;opacity:0;animation:igs-nfx-flash 900ms ease-out both;}
#igs-overlay .igs-nfx-pulse{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 78% 74% at 50% 46%,transparent 48%,#8c1c3c 100%);animation:igs-nfx-beat 880ms ease-out 160ms var(--igs-nfx-beats) both;}
#igs-overlay .igs-nfx-word{position:absolute;left:0;right:0;top:9%;text-align:center;}
#igs-overlay .igs-nfx-word span{display:inline-block;font-size:clamp(18px,3.6vw,38px);font-weight:600;letter-spacing:.14em;color:#ffe8ec;text-shadow:0 1px 0 rgba(140,28,60,.8),0 0 18px rgba(194,48,90,.5);animation:igs-nfx-word var(--igs-dfx-life) ease both;}
#igs-overlay .igs-nfx-peak.is-t1 .igs-nfx-word span{font-size:clamp(14px,2.8vw,28px);}
#igs-overlay .igs-nfx-peak.is-t3 .igs-nfx-word span{font-size:clamp(22px,4.6vw,48px);}
#igs-overlay .igs-nfx-count{position:absolute;top:9%;right:4%;display:flex;flex-direction:column;align-items:flex-end;gap:4px;padding:6px 12px 5px;border-radius:4px;background:#2a1620;color:#ffd9e4;border:1px solid #8c1c3c;font-variant-numeric:tabular-nums;animation:igs-nfx-slate var(--igs-dfx-life) cubic-bezier(.2,.8,.3,1) both;}
#igs-overlay .igs-nfx-counter.is-t2 .igs-nfx-count{border-color:#c2305a;}
#igs-overlay .igs-nfx-counter.is-t3 .igs-nfx-count{border-color:#ff6f91;}
#igs-overlay .igs-nfx-tally{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px 9px;max-width:170px;}
#igs-overlay .igs-nfx-tally-group{position:relative;display:inline-flex;gap:3px;height:18px;align-items:flex-end;}
#igs-overlay .igs-nfx-tick{display:block;width:3px;height:18px;border-radius:2px;background:#ffd9e4;}
#igs-overlay .igs-nfx-tick.is-slash{position:absolute;left:-3px;right:-3px;bottom:7px;width:auto;height:3px;transform:rotate(-24deg);background:#ff6f91;}
#igs-overlay .igs-nfx-tick.is-new{transform-origin:50% 100%;animation:igs-nfx-tick 320ms cubic-bezier(.3,1.4,.5,1) calc(240ms + var(--igs-nfx-i,0) * 260ms) both;}
#igs-overlay .igs-nfx-tick.is-slash.is-new{transform-origin:0 50%;animation-name:igs-nfx-tick-slash;}
@keyframes igs-nfx-tick{0%{opacity:0;transform:scaleY(0)}100%{opacity:1;transform:scaleY(1)}}
@keyframes igs-nfx-tick-slash{0%{opacity:0;transform:rotate(-24deg) scaleX(0)}100%{opacity:1;transform:rotate(-24deg) scaleX(1)}}
@keyframes igs-nfx-slate{0%{opacity:0;transform:translateX(24px)}12%{opacity:1;transform:translateX(0)}84%{opacity:1;transform:translateX(0)}100%{opacity:0;transform:translateX(12px)}}
#igs-overlay .igs-nfx-count-row{display:flex;align-items:baseline;gap:4px;}
#igs-overlay .igs-nfx-count-n{font-size:1.9em;font-weight:800;line-height:1;}
#igs-overlay .igs-nfx-count-u{font-size:.9em;opacity:.9;}
#igs-overlay .igs-nfx-counter.is-ancient .igs-nfx-count{background:#f1ead8;color:#5a1b1b;border:1px solid #7a5b36;font-family:serif;}
#igs-overlay .igs-nfx-counter.is-ancient .igs-nfx-tick{background:#5a1b1b;}
#igs-overlay .igs-nfx-counter.is-ancient .igs-nfx-tick.is-slash{background:#a62a2a;}
#igs-overlay .igs-nfx-afterglow{position:absolute;inset:0;background:radial-gradient(ellipse 90% 86% at 50% 50%,transparent 38%,#4a3a34 100%);opacity:.42;animation:igs-nfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-nfx-sweat{position:absolute;width:6px;height:9px;margin:-4px 0 0 -3px;border-radius:50% 50% 50% 50%/65% 65% 35% 35%;background:#e9f1f5;box-shadow:0 0 6px 2px #cfe0ea;animation:igs-nfx-sweat var(--igs-dfx-life) ease-in calc(var(--igs-nfx-i,0) * 700ms) both;}
@keyframes igs-nfx-sweat{0%{opacity:0;transform:translateY(0)}14%{opacity:.95}60%{opacity:.9;transform:translateY(8px)}100%{opacity:0;transform:translateY(16px)}}
#igs-overlay .igs-nfx-sheet{position:absolute;left:0;bottom:calc(var(--igs-fx-safe) - 32px);width:30%;aspect-ratio:12/7;pointer-events:none;animation:igs-nfx-sheet var(--igs-dfx-life) cubic-bezier(.3,.7,.2,1) both;}
#igs-overlay .igs-nfx-sheet svg{display:block;width:100%;height:100%;}
@keyframes igs-nfx-sheet{0%{opacity:0;transform:translate(-30%,30%)}16%{opacity:1;transform:translate(0,0)}84%{opacity:1;transform:translate(0,0)}100%{opacity:0;transform:translate(-20%,20%)}}
#igs-overlay .igs-nfx-after-time{position:absolute;left:12%;right:12%;bottom:calc(var(--igs-fx-safe) - 20px);height:3px;background:#2f2622;border-radius:2px;overflow:hidden;animation:igs-nfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-nfx-after-time i{display:block;height:100%;background:#c9a98f;transform-origin:0 50%;animation:igs-nfx-time var(--igs-dfx-life) linear both;}
@keyframes igs-nfx-time{from{transform:scaleX(0)}to{transform:scaleX(1)}}
#igs-overlay .igs-nfx-after-text{position:absolute;left:5%;top:12%;max-width:44%;padding:3px 10px;border-left:2px solid #c9a98f;background:#2f2622;color:#eadccf;font-size:.85em;letter-spacing:.06em;animation:igs-nfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-nfx-after.is-ancient .igs-nfx-after-text{font-family:serif;background:#f1ead8;color:#4a3418;border-left-color:#7a5b36;}
#igs-overlay .igs-nfx-valance{position:absolute;left:0;right:0;top:0;height:4%;background:#8a1c28;animation:igs-nfx-valance var(--igs-dfx-life) ease both;}
#igs-overlay .igs-nfx-drape{position:absolute;top:0;bottom:0;width:10%;background:#8a1c28;clip-path:polygon(0 0,100% 0,100% 32%,58% 50%,100% 68%,100% 100%,0 100%);border-right:1px solid rgba(216,180,90,.6);animation:igs-nfx-drape-l var(--igs-dfx-life) cubic-bezier(.3,.7,.2,1) both;}
#igs-overlay .igs-nfx-drape.is-r{right:0;left:auto;clip-path:polygon(0 0,100% 0,100% 100%,0 100%,0 68%,42% 50%,0 32%);border-right:0;border-left:1px solid rgba(216,180,90,.6);animation-name:igs-nfx-drape-r;}
#igs-overlay .igs-nfx-drape.is-l{left:0;}
@keyframes igs-nfx-valance{0%{transform:translateY(-100%)}14%{transform:translateY(0)}86%{transform:translateY(0)}100%{transform:translateY(-100%)}}
@keyframes igs-nfx-drape-l{0%{transform:translateX(-100%)}16%{transform:translateX(0)}84%{transform:translateX(0)}100%{transform:translateX(-100%)}}
@keyframes igs-nfx-drape-r{0%{transform:translateX(100%)}16%{transform:translateX(0)}84%{transform:translateX(0)}100%{transform:translateX(100%)}}
#igs-overlay .igs-nfx-candles{position:absolute;top:min(54%,calc(var(--igs-fx-vis) - 72px));width:6%;display:flex;justify-content:center;animation:igs-nfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-nfx-candles.is-l{left:2.5%;}
#igs-overlay .igs-nfx-candles.is-r{right:2.5%;}
#igs-overlay .igs-nfx-candle{position:relative;display:block;width:12px;height:38px;border-radius:2px;background:#b3262e;border-top:3px solid #f1e3c4;}
#igs-overlay .igs-nfx-flame{position:absolute;left:50%;bottom:100%;width:10px;height:18px;margin:0 0 3px -5px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:#ffd37a;box-shadow:0 0 14px 6px #ff9a3c;transform-origin:50% 100%;animation:igs-nfx-flicker 1.6s ease-in-out infinite alternate;}
@keyframes igs-nfx-flicker{from{transform:scale(1,.92) rotate(-2deg)}to{transform:scale(.94,1.08) rotate(2deg)}}
#igs-overlay .igs-nfx-curtain-text{position:absolute;left:0;right:0;top:12%;text-align:center;font-family:serif;font-size:1.3em;letter-spacing:.5em;color:#f1d58a;animation:igs-nfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-nfx-bed.is-modern .igs-nfx-valance{height:2%;background:#8c8a94;}
#igs-overlay .igs-nfx-bed.is-modern .igs-nfx-drape{width:10%;background:#d6d3de;clip-path:polygon(0 0,100% 0,100% 34%,70% 52%,100% 70%,100% 100%,0 100%);border-right:0;}
#igs-overlay .igs-nfx-bed.is-modern .igs-nfx-drape.is-r{clip-path:polygon(0 0,100% 0,100% 100%,0 100%,0 70%,30% 52%,0 34%);border-left:0;}
#igs-overlay .igs-nfx-lamp{position:relative;display:block;width:14px;height:34px;}
#igs-overlay .igs-nfx-lamp::before{content:"";position:absolute;left:0;top:0;width:14px;height:16px;background:#f3e3b8;clip-path:polygon(18% 0,82% 0,100% 100%,0 100%);box-shadow:0 0 12px 5px #ffd9a0;}
#igs-overlay .igs-nfx-lamp::after{content:"";position:absolute;left:6px;top:16px;width:2px;height:12px;background:#6f6a78;}
#igs-overlay .igs-nfx-lamp i{position:absolute;left:2px;bottom:0;width:10px;height:6px;background:#6f6a78;border-radius:2px;}
#igs-overlay .igs-nfx-bed.is-modern .igs-nfx-curtain-text{font-family:sans-serif;letter-spacing:.3em;color:#f4efe6;}
#igs-overlay .igs-nfx-cult-label{position:absolute;transform:translate(-50%,-50%);display:flex;gap:6px;align-items:baseline;padding:3px 12px;border-radius:4px;background:#2b2210;border:2px solid #d8b45a;color:#f6e3a1;font-family:serif;font-variant-numeric:tabular-nums;animation:igs-nfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-nfx-cult-label b{font-size:1.25em;}
#igs-overlay .igs-nfx-cult .igs-links{animation:igs-nfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-nfx-tip-card{position:absolute;transform:translate(-50%,0);min-width:110px;border-radius:3px;background:rgba(13,37,64,.92);color:#cfe8ff;border:1px solid #3b9dff;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;animation:igs-nfx-tip var(--igs-dfx-life) cubic-bezier(.2,.8,.3,1) both;}
#igs-overlay .igs-nfx-tip-title{display:flex;align-items:center;gap:5px;padding:2px 8px;background:rgba(59,157,255,.18);color:#a0c8ff;font-size:.68em;font-weight:600;letter-spacing:.18em;}
#igs-overlay .igs-nfx-tip-title i{display:block;width:4px;height:4px;background:#3b9dff;border-radius:50%;}
#igs-overlay .igs-nfx-tip-body{display:grid;grid-template-columns:auto auto;gap:3px 10px;align-items:center;padding:5px 10px 6px;}
#igs-overlay .igs-nfx-tip-num{display:inline-flex;align-items:baseline;gap:3px;justify-content:flex-end;}
#igs-overlay .igs-nfx-tip-arrow{font-style:normal;font-size:.7em;color:#7fe0a0;}
#igs-overlay .igs-nfx-tip-delta{font-size:1.4em;color:#7fe0a0;}
#igs-overlay .igs-nfx-tip.is-down .igs-nfx-tip-card{background:rgba(42,18,20,.92);color:#ffd5d5;border-color:#d23b3b;}
#igs-overlay .igs-nfx-tip.is-down .igs-nfx-tip-title{background:rgba(210,59,59,.18);color:#ffaaaa;}
#igs-overlay .igs-nfx-tip.is-down .igs-nfx-tip-title i{background:#d23b3b;}
#igs-overlay .igs-nfx-tip.is-down .igs-nfx-tip-delta,#igs-overlay .igs-nfx-tip.is-down .igs-nfx-tip-arrow{color:#ff8a8a;}
#igs-overlay .igs-nfx-tip-bar{display:block;width:84px;height:6px;border-radius:3px;background:#17395e;overflow:hidden;}
@keyframes igs-nfx-tip{0%{opacity:0;transform:translate(-50%,10px) scale(.94)}12%{opacity:1;transform:translate(-50%,0) scale(1)}84%{opacity:1;transform:translate(-50%,0) scale(1)}100%{opacity:0;transform:translate(-50%,-8px) scale(1)}}
#igs-overlay .igs-nfx-tip-bar i{display:block;height:100%;background:#3b9dff;}
#igs-overlay .igs-nfx-tip.is-down .igs-nfx-tip-bar{background:#4a1c1f;}
#igs-overlay .igs-nfx-tip.is-down .igs-nfx-tip-bar i{background:#d23b3b;}
#igs-overlay .igs-nfx-tip-total{font-style:normal;font-size:.85em;opacity:.9;}
#igs-overlay .igs-nfx-sigil-mark{position:absolute;transform:translate(-50%,-50%);aspect-ratio:1/1;animation:igs-nfx-sigil var(--igs-dfx-life) ease-in-out both;}
#igs-overlay .igs-nfx-sigil-mark svg{width:100%;height:100%;fill:none;stroke:var(--igs-nfx-sigil,#c7a0ff);stroke-width:1.6;filter:drop-shadow(0 0 4px var(--igs-nfx-sigil,#c7a0ff));}
#igs-overlay .igs-nfx-sigil.is-t1 .igs-nfx-sigil-mark{--igs-nfx-lit:.55;}
#igs-overlay .igs-nfx-sigil.is-t2 .igs-nfx-sigil-mark{--igs-nfx-lit:.8;}
#igs-overlay .igs-nfx-sigil.is-t3 .igs-nfx-sigil-mark{--igs-nfx-lit:1;}
@keyframes igs-nfx-sigil{0%{opacity:0;transform:translate(-50%,-50%) scale(.8)}18%{opacity:var(--igs-nfx-lit,.8);transform:translate(-50%,-50%) scale(1.06)}34%{opacity:calc(var(--igs-nfx-lit,.8) * .65)}50%{opacity:var(--igs-nfx-lit,.8)}70%{opacity:calc(var(--igs-nfx-lit,.8) * .7)}84%{opacity:var(--igs-nfx-lit,.8);transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(1)}}
#igs-overlay.is-fantasy .igs-nfx-sigil-mark svg,#igs-overlay .igs-nfx-sigil.is-magic .igs-nfx-sigil-mark svg{stroke:#9ad3ff;filter:drop-shadow(0 0 4px #9ad3ff);}
#igs-overlay .igs-nfx-crack{position:absolute;left:7%;top:min(62%,calc(var(--igs-fx-vis) - 12px));width:26%;height:5px;background:#ffcf7a;box-shadow:0 0 12px 4px #ff9a3c;animation:igs-nfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-nfx-shoe{position:absolute;top:0;width:15%;height:100%;background:#2a1a10;opacity:0;}
#igs-overlay .igs-nfx-shoe.is-a{left:22%;}
#igs-overlay .igs-nfx-shoe.is-b{left:58%;}
#igs-overlay .igs-nfx-foot.is-near .igs-nfx-shoe.is-a{animation:igs-nfx-shoe 1100ms steps(1,end) 300ms 2 both;}
#igs-overlay .igs-nfx-foot.is-near .igs-nfx-shoe.is-b{animation:igs-nfx-shoe 1100ms steps(1,end) 850ms 2 both;}
#igs-overlay .igs-nfx-foot.is-leave .igs-nfx-shoe.is-b{animation:igs-nfx-shoe 1100ms steps(1,end) 300ms 2 both;}
#igs-overlay .igs-nfx-foot.is-leave .igs-nfx-shoe.is-a{animation:igs-nfx-shoe 1100ms steps(1,end) 850ms 2 both;}
@keyframes igs-nfx-shoe{0%{opacity:0}20%{opacity:1}55%{opacity:0}100%{opacity:0}}
#igs-overlay .igs-nfx-knotglow{position:absolute;inset:0;background:radial-gradient(ellipse 70% 60% at 50% 55%,#e8a76a 0%,transparent 70%);opacity:.22;animation:igs-nfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-nfx-knot .igs-mist,#igs-overlay .igs-nfx-knot .igs-links{animation:igs-nfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-nfx-fetal-card{position:absolute;right:5%;top:14%;display:grid;grid-template-columns:auto auto auto;grid-template-areas:"ecg ecg ecg" "k n u";gap:2px 8px;align-items:baseline;padding:8px 14px 7px;border-radius:6px;background:#1c1418;color:#ffd9e4;border:2px solid #c2305a;font-variant-numeric:tabular-nums;animation:igs-nfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-nfx-fetal-glow{position:absolute;transform:translate(-50%,-50%);aspect-ratio:1/1;animation:igs-nfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-nfx-fetal-glow i{display:block;width:100%;height:100%;border-radius:50%;background:radial-gradient(circle,#ffd0dc 0%,#ff9db6 38%,transparent 70%);opacity:.5;animation:igs-nfx-glow var(--igs-nfx-bpm,.4s) ease-in-out infinite;}
@keyframes igs-nfx-glow{0%,100%{transform:scale(.7);opacity:.28}40%{transform:scale(1);opacity:.6}}
#igs-overlay .igs-nfx-fetal-dot{position:absolute;right:10px;top:10px;width:9px;height:9px;border-radius:50%;background:#ff6f91;animation:igs-nfx-dot var(--igs-nfx-bpm,.4s) ease-in-out infinite;}
@keyframes igs-nfx-dot{0%,100%{transform:scale(1)}40%{transform:scale(1.5)}}
#igs-overlay .igs-nfx-fetal-card svg{grid-area:ecg;width:130px;height:34px;fill:none;stroke:#ff6f91;stroke-width:1.8;stroke-linejoin:round;}
#igs-overlay .igs-nfx-fetal-card svg path{stroke-dasharray:1;stroke-dashoffset:0;animation:igs-nfx-ecg 1.6s linear 2 both;}
@keyframes igs-nfx-ecg{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
#igs-overlay .igs-nfx-fetal-k{grid-area:k;font-size:.82em;opacity:.9;}
#igs-overlay .igs-nfx-fetal-n{grid-area:n;font-size:1.5em;color:#ff9db6;}
#igs-overlay .igs-nfx-fetal-u{grid-area:u;font-size:.78em;opacity:.85;}
#igs-overlay .igs-nfx-fetal-text{grid-column:1 / 4;font-size:.78em;opacity:.85;}
#igs-overlay .igs-dfx.is-reduced .igs-nfx-tick,#igs-overlay .igs-dfx.is-reduced .igs-nfx-sweat,#igs-overlay .igs-dfx.is-reduced .igs-nfx-fetal-glow i,#igs-overlay .igs-dfx.is-reduced .igs-nfx-after-time i{animation:none;}
#igs-overlay .igs-dfx.is-reduced .igs-nfx-flash,#igs-overlay .igs-dfx.is-reduced .igs-nfx-pulse{display:none;}
#igs-overlay .igs-dfx.is-reduced .igs-nfx-flame{box-shadow:0 0 8px 3px #ff9a3c;}
#igs-overlay[data-igs-quality="low"] .igs-nfx-fetal-glow i{animation:none;}
#igs-overlay[data-igs-quality="low"] .igs-nfx-sweat,#igs-overlay[data-igs-quality="low"] .igs-nfx-tick.is-new{animation:none;}
#igs-overlay[data-igs-quality="low"] .igs-nfx-after-time i{animation:none;}
#igs-overlay[data-igs-quality="low"] .igs-nfx-flame{animation:none;}
#igs-overlay[data-igs-quality="low"] .igs-nfx-pulse{animation-iteration-count:1;}
#igs-overlay[data-igs-quality="low"] .igs-nfx-sigil-mark svg{filter:none;}
#igs-overlay[data-igs-quality="low"] .igs-nfx-fetal-dot{animation:none;}
#igs-overlay[data-igs-quality="low"] .igs-nfx-fetal-card svg path{animation:none;}
@media (prefers-reduced-motion: reduce){
#igs-overlay .igs-nfx-flame,#igs-overlay .igs-nfx-fetal-dot,#igs-overlay .igs-nfx-fetal-card svg path,#igs-overlay .igs-nfx-fetal-glow i,#igs-overlay .igs-nfx-sweat,#igs-overlay .igs-nfx-tick,#igs-overlay .igs-nfx-after-time i{animation:none;}
}
`;
