// 紧急求助样式：紧急来电屏 / 通话徽章 / 挂断记录的深红款，以及警灯光带。
// 只用 transform / opacity 做动画，颜色全部实色。
export const EMERGENCY_FX_STYLE_TEXT = `
.igs-fx-call-screen.is-emergency{background:#3a0a10;}
.igs-fx-emergency-head{position:absolute;top:18px;left:0;right:0;text-align:center;font-size:13px;letter-spacing:.4em;font-weight:700;color:#ffd7d7;}
.igs-fx-call-screen.is-emergency .igs-fx-call-ring{width:92px;height:92px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#c4161f;animation:none;}
.igs-fx-call-screen.is-emergency .igs-fx-call-ring svg{width:46px;height:46px;fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
.igs-fx-call-screen.is-emergency .igs-fx-call-ring::before,.igs-fx-call-screen.is-emergency .igs-fx-call-ring::after{content:"";position:absolute;inset:0;border-radius:50%;border:3px solid #ff4a55;animation:igs-fx-emergency-pulse 1.2s ease-out infinite;}
.igs-fx-call-screen.is-emergency .igs-fx-call-ring::after{animation-delay:.6s;}
.igs-fx-emergency-num{font-size:44px;font-weight:800;line-height:1;letter-spacing:.06em;color:#fff;font-variant-numeric:tabular-nums;}
.igs-fx-call-screen.is-emergency .igs-fx-call-name{font-size:15px;color:#ffd7d7;}
.igs-fx-call-badge[data-emergency]{background:#a5131b;color:#fff;}
.igs-fx-call-end.is-emergency{--igs-fx-end-bg:#a5131b;}
@keyframes igs-fx-emergency-pulse{0%{transform:scale(1);opacity:.9;}100%{transform:scale(1.9);opacity:0;}}
.igs-fx-siren{position:absolute;inset:0;pointer-events:none;animation:igs-fx-siren-life var(--igs-fx-life,3200ms) linear both;}
.igs-fx-siren > i{position:absolute;top:0;bottom:0;width:7%;opacity:0;}
.igs-fx-siren > i.is-l{left:0;}
.igs-fx-siren > i.is-r{right:0;}
.igs-fx-siren > i.is-a{background:var(--igs-siren-a,#e8212b);animation:igs-fx-siren-on .64s steps(1,end) infinite;}
.igs-fx-siren > i.is-b{background:var(--igs-siren-b,#2457ff);animation:igs-fx-siren-off .64s steps(1,end) infinite;}
.igs-fx-siren > i.is-r.is-a{animation-name:igs-fx-siren-off;}
.igs-fx-siren > i.is-r.is-b{animation-name:igs-fx-siren-on;}
.igs-fx-siren[data-kind="ambulance"]{--igs-siren-a:#e8212b;--igs-siren-b:#f4f6fa;}
.igs-fx-siren[data-kind="fire"]{--igs-siren-a:#e8212b;--igs-siren-b:#ff8a1f;}
.igs-fx-siren.is-reduced > i.is-a{animation:none;opacity:.55;}
.igs-fx-siren.is-reduced > i.is-b{display:none;}
@keyframes igs-fx-siren-on{0%{opacity:.6;}50%{opacity:0;}}
@keyframes igs-fx-siren-off{0%{opacity:0;}50%{opacity:.6;}}
@keyframes igs-fx-siren-life{0%{opacity:0;}8%{opacity:1;}78%{opacity:1;}100%{opacity:0;}}
@media (prefers-reduced-motion: reduce){.igs-fx-call-screen.is-emergency .igs-fx-call-ring::before,.igs-fx-call-screen.is-emergency .igs-fx-call-ring::after{animation:none;opacity:.7;}.igs-fx-siren > i.is-a{animation:none;opacity:.55;}.igs-fx-siren > i.is-b{display:none;}}
`;
