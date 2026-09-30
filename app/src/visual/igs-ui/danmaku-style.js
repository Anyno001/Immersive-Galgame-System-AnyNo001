// 弹幕样式：全部挂在 #igs-fx-stage（立绘之上、对话层之下）内的 .igs-dm-root，天然不压对话框。
// 运动只用 transform / opacity 动画；描边用无模糊的硬阴影或 text-stroke；不用 backdrop-filter 与滤镜动画。
// 减少动态效果沿用 fx-style 对 .igs-fx-layer 的整体降级，这里只补静态落位。
export const DANMAKU_STYLE_TEXT = `
.igs-dm-root{position:absolute;inset:0;pointer-events:none;overflow:hidden;contain:layout paint style;}
.igs-dm-front{position:absolute;inset:0;pointer-events:none;}
@keyframes igs-dm-scroll{from{transform:translate3d(0,0,0);}to{transform:translate3d(var(--igs-dm-run,-120vw),0,0);}}
@keyframes igs-dm-top{0%{opacity:0;transform:translate(-50%,-4px);}8%{opacity:1;transform:translate(-50%,0);}88%{opacity:1;}100%{opacity:0;transform:translate(-50%,0);}}
@keyframes igs-aud-nudge{0%,100%{transform:none;}20%{transform:rotate(-12deg);}40%{transform:rotate(10deg);}60%{transform:rotate(-6deg);}80%{transform:rotate(3deg);}}
@keyframes igs-aud-nudge-b{0%,100%{transform:none;}20%{transform:rotate(-12deg);}40%{transform:rotate(10deg);}60%{transform:rotate(-6deg);}80%{transform:rotate(3deg);}}
.igs-aud-entry{position:absolute;left:14px;top:var(--igs-aud-top,14px);width:calc(38px * var(--igs-hud-scale,1));height:calc(38px * var(--igs-hud-scale,1));padding:0;border:0;background:transparent;color:#f4f1ec;opacity:.55;cursor:pointer;pointer-events:auto;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));transition:opacity .2s ease;}
.igs-aud-entry svg{display:block;width:100%;height:100%;}
.igs-aud-entry:hover,.igs-aud-entry:focus-visible,.igs-aud-entry[data-unread="1"]{opacity:1;}
.igs-aud-entry:focus-visible{outline:2px solid #f4e3ad;outline-offset:2px;border-radius:8px;}
.igs-aud-entry[data-pulse="1"]{animation:igs-aud-nudge .6s ease-in-out 1;}
.igs-aud-entry[data-pulse="2"]{animation:igs-aud-nudge-b .6s ease-in-out 1;}
.igs-aud-badge{position:absolute;top:-3px;right:-5px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:999px;background:#fb7299;color:#fff;font:700 10px/16px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 1.5px rgba(12,14,20,.7);}
@media (pointer:coarse){.igs-aud-entry::after{content:"";position:absolute;inset:-8px;}}
.igs-aud-stage{position:absolute;inset:0;pointer-events:auto;}
.igs-aud-dim{position:absolute;inset:0;background:rgba(6,8,14,.62);cursor:pointer;animation:igs-live-dim-in .35s ease both;}
.igs-aud-phone{position:absolute;top:4%;bottom:4%;left:0;right:0;margin-inline:auto;aspect-ratio:9/18.5;max-width:92%;max-height:820px;box-sizing:border-box;display:flex;flex-direction:column;border-radius:28px;border:6px solid #16161a;background:#f4f4f6;color:#18191c;box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden;contain:layout paint style;font:13px/1.4 "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;animation:igs-live-raise .5s cubic-bezier(.2,.9,.3,1) both;}
.igs-aud-stage[data-leaving] .igs-aud-phone{animation:igs-live-lower .38s cubic-bezier(.5,0,.8,.4) forwards;}
.igs-aud-stage[data-leaving] .igs-aud-dim{animation:igs-live-dim-out .38s ease forwards;}
.igs-aud-video{position:relative;flex:none;aspect-ratio:16/9;overflow:hidden;background:#000;}
.igs-aud-frame{position:absolute;inset:0;background:center/cover no-repeat #1b1d26;}
.igs-aud-sprite{position:absolute;left:50%;bottom:0;height:92%;width:auto;max-width:none;transform:translateX(-50%);object-fit:contain;}
.igs-aud-lanes{position:absolute;left:0;right:0;top:4%;bottom:10%;overflow:hidden;}
.igs-aud-back{position:absolute;top:6px;left:6px;width:26px;height:26px;padding:4px;box-sizing:border-box;border-radius:50%;color:#fff;background:rgba(0,0,0,.35);cursor:pointer;}
.igs-aud-back svg{display:block;width:100%;height:100%;}
.igs-aud-progress{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.28);}
.igs-aud-progress i{display:block;height:100%;width:0;background:#fb7299;}
.igs-aud-item{position:absolute;left:100%;top:0;white-space:nowrap;font:700 var(--igs-aud-font,14px)/1.3 "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;color:#fff;text-shadow:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000;animation:igs-dm-scroll var(--igs-dm-dur,7s) linear both;}
.igs-aud-item:not([data-ai]){font-weight:500;opacity:.82;}
.igs-aud-item.is-top{left:50%;color:#ffde4d;transform:translateX(-50%);animation:igs-dm-top 4s ease both;}
.igs-aud-info{flex:none;padding:10px 12px 6px;background:#fff;}
.igs-aud-title{font-size:15px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.igs-aud-sub{margin-top:2px;font-size:11px;color:#9499a0;}
.igs-aud-tabs{flex:none;display:flex;gap:22px;padding:0 12px;background:#fff;border-bottom:1px solid #e3e5e7;font-size:13px;color:#61666d;}
.igs-aud-tabs span{padding:8px 0;}
.igs-aud-tabs .is-active{color:#fb7299;font-weight:700;box-shadow:inset 0 -2px 0 #fb7299;}
.igs-aud-tabs b{font-weight:500;font-size:11px;}
.igs-aud-list{flex:1;min-height:0;overflow-y:auto;padding:6px 0;background:#fff;overscroll-behavior:contain;scrollbar-width:thin;}
.igs-aud-row{display:flex;gap:10px;padding:5px 12px;font-size:12.5px;line-height:1.45;}
.igs-aud-time{flex:none;width:3.2em;color:#9499a0;font-variant-numeric:tabular-nums;}
.igs-aud-text{min-width:0;color:#61666d;word-break:break-all;}
.igs-aud-row[data-ai] .igs-aud-text{color:#18191c;font-weight:600;}
.igs-aud-bar{flex:none;display:flex;align-items:center;gap:8px;padding:8px 12px 12px;background:#fff;border-top:1px solid #e3e5e7;}
.igs-aud-dm-toggle{flex:none;width:26px;height:26px;border-radius:6px;display:grid;place-items:center;background:#fb7299;color:#fff;font-size:13px;font-weight:700;}
.igs-aud-input{flex:1;min-width:0;padding:6px 12px;border-radius:999px;background:#f1f2f3;color:#9499a0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
@keyframes igs-dm-word-in{to{opacity:.94;transform:translate(-50%,-50%) scale(var(--igs-dm-s,1)) rotate(var(--igs-dm-r,0deg));}}
@keyframes igs-dm-word-out{from{opacity:.94;transform:translate(-50%,-50%) scale(var(--igs-dm-s,1)) rotate(var(--igs-dm-r,0deg));}to{opacity:0;transform:translate(-50%,-50%) scale(calc(var(--igs-dm-s,1) * 1.55)) rotate(var(--igs-dm-r,0deg));}}
.igs-dm-inner{position:absolute;inset:0;z-index:2;--igs-dm-c:#ff5c9e;}
.igs-dm-inner[data-mood="panic"]{--igs-dm-c:#3f8fff;}
.igs-dm-inner[data-mood="anger"]{--igs-dm-c:#ff3b4a;}
.igs-dm-inner[data-mood="guilty"]{--igs-dm-c:#8a6cff;}
.igs-dm-word{position:absolute;left:0;top:0;white-space:nowrap;font:700 var(--igs-dm-inner-size,20px)/1 "LXGW WenKai","LXGW WenKai Lite","Source Han Serif CN",serif;color:var(--igs-dm-c);-webkit-text-stroke:3px #fff;paint-order:stroke fill;opacity:0;transform:translate(-50%,-50%) scale(.4) rotate(var(--igs-dm-r,0deg));animation:igs-dm-word-in .38s cubic-bezier(.2,1.5,.4,1) var(--igs-dm-d,0ms) forwards,igs-dm-word-out .42s ease-in var(--igs-dm-burst,2600ms) forwards;}
#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-dm-word{animation-timing-function:steps(2,end),steps(2,end);}
@keyframes igs-live-raise{0%{transform:translateY(105%) rotate(-5deg);}70%{transform:translateY(-1.5%) rotate(.6deg);}100%{transform:none;}}
@keyframes igs-live-lower{to{transform:translateY(110%) rotate(4deg);}}
@keyframes igs-live-dim-in{from{opacity:0;}to{opacity:1;}}
@keyframes igs-live-dim-out{to{opacity:0;}}
@keyframes igs-live-line{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
@keyframes igs-live-gift{0%{opacity:0;transform:translateX(-100%);}12%{opacity:1;transform:none;}84%{opacity:1;transform:none;}100%{opacity:0;transform:translateX(-24px);}}
@keyframes igs-live-card{0%{opacity:0;transform:translateY(-8px);}6%{opacity:1;transform:none;}92%{opacity:1;}100%{opacity:0;}}
@keyframes igs-live-guard{0%{opacity:0;transform:scaleX(.5);}12%{opacity:1;transform:scaleX(1.04);}18%{transform:none;}86%{opacity:1;}100%{opacity:0;}}
@keyframes igs-live-heart{0%{opacity:0;transform:translate(0,0) scale(.4);}15%{opacity:1;transform:translate(0,-10px) scale(1);}100%{opacity:0;transform:translate(var(--igs-live-drift,0px),-150px) scale(.8);}}
.igs-live-stage{position:absolute;inset:0;}
.igs-live-dim{position:absolute;inset:0;background:rgba(6,8,14,.62);animation:igs-live-dim-in .4s ease both;}
.igs-live-phone{position:absolute;top:3%;left:0;right:0;margin-inline:auto;height:var(--igs-live-h,76%);max-height:820px;aspect-ratio:9/18.5;max-width:92%;box-sizing:border-box;border-radius:28px;border:6px solid #16161a;background:#0e0f14;box-shadow:0 18px 50px rgba(0,0,0,.55);overflow:hidden;contain:layout paint style;color:#fff;font:13px/1.35 "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;animation:igs-live-raise .55s cubic-bezier(.2,.9,.3,1) both;}
.igs-live-stage[data-leaving] .igs-live-phone{animation:igs-live-lower .42s cubic-bezier(.5,0,.8,.4) forwards;}
.igs-live-stage[data-leaving] .igs-live-dim{animation:igs-live-dim-out .42s ease forwards;}
.igs-live-screen{position:absolute;inset:0;background:linear-gradient(160deg,#2a2f45,#12131b);}
.igs-live-cover{position:absolute;inset:0;background:center/cover no-repeat;opacity:.55;}
.igs-live-portrait{position:absolute;left:50%;bottom:26%;height:64%;width:auto;max-width:none;transform:translateX(-50%);object-fit:contain;}
.igs-live-initial{position:absolute;left:50%;top:36%;width:34%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;background:rgba(251,114,153,.22);border:2px solid rgba(251,114,153,.6);}
.igs-live-screen::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.5) 0,transparent 22%,transparent 45%,rgba(0,0,0,.68) 100%);}
.igs-live-icon{display:inline-flex;flex:none;width:18px;height:18px;}
.igs-live-icon svg{width:100%;height:100%;display:block;}
.igs-live-top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;gap:6px;padding:10px 10px 0;}
.igs-live-anchor{display:flex;align-items:center;gap:6px;min-width:0;padding:3px 4px 3px 3px;border-radius:999px;background:rgba(0,0,0,.38);}
.igs-live-avatar{flex:none;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;background:#fb7299 center/cover no-repeat;}
.igs-live-avatar[data-img="1"]{color:transparent;}
.igs-live-meta{min-width:0;}
.igs-live-host{max-width:7em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:700;}
.igs-live-pop{display:flex;align-items:center;gap:2px;font-size:10px;opacity:.88;}
.igs-live-pop .igs-live-icon{width:10px;height:10px;color:#ff8a3d;}
.igs-live-follow{flex:none;display:flex;align-items:center;gap:1px;padding:3px 8px 3px 5px;border-radius:999px;background:#fb7299;font-size:11px;font-weight:700;}
.igs-live-follow .igs-live-icon{width:11px;height:11px;}
.igs-live-tools{flex:none;display:flex;align-items:center;gap:6px;}
.igs-live-viewers{display:flex;align-items:center;gap:2px;padding:3px 7px;border-radius:999px;background:rgba(0,0,0,.38);font-size:10px;}
.igs-live-viewers .igs-live-icon{width:12px;height:12px;}
.igs-live-close{width:16px;height:16px;opacity:.85;}
.igs-live-title{position:absolute;top:48px;left:10px;right:10px;display:flex;align-items:center;gap:6px;overflow:hidden;white-space:nowrap;font-size:11px;}
.igs-live-badge{flex:none;padding:1px 6px;border-radius:4px;background:#fb7299;font-size:10px;font-weight:800;letter-spacing:.04em;}
.igs-live-phone[data-view="host"] .igs-live-badge{background:#ff3b30;}
.igs-live-title-text{overflow:hidden;text-overflow:ellipsis;opacity:.9;}
.igs-live-clock{flex:none;margin-left:auto;font-variant-numeric:tabular-nums;opacity:.85;}
.igs-live-sc{position:absolute;top:72px;left:10px;right:10px;}
.igs-live-sc-card{border-radius:8px;overflow:hidden;color:#222;background:color-mix(in srgb,var(--igs-live-sc,#2a60b2) 22%,#fff);animation:igs-live-card 7s ease both;}
.igs-live-sc-head{display:flex;justify-content:space-between;gap:8px;padding:4px 8px;color:#fff;background:var(--igs-live-sc,#2a60b2);font-size:11px;font-weight:700;}
.igs-live-sc-text{padding:5px 8px;font-size:12px;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.igs-live-gifts{position:absolute;left:0;top:44%;display:flex;flex-direction:column;gap:6px;}
.igs-live-gift{display:flex;align-items:center;gap:6px;padding:4px 12px 4px 6px;border-radius:0 999px 999px 0;background:linear-gradient(90deg,rgba(251,114,153,.94),rgba(251,114,153,.28));animation:igs-live-gift 2.6s ease both;}
.igs-live-gift .igs-live-icon{width:24px;height:24px;color:#ffe066;}
.igs-live-gift-user{max-width:7em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:700;}
.igs-live-gift-name{font-size:10px;opacity:.9;}
.igs-live-gift-count{margin-left:4px;font:italic 900 18px/1 system-ui,sans-serif;color:#ffe066;-webkit-text-stroke:1px #b8325a;paint-order:stroke fill;}
.igs-live-guard{position:absolute;left:0;right:0;top:36%;}
.igs-live-guard-banner{display:flex;align-items:center;justify-content:center;gap:6px;margin:0 8px;padding:8px 10px;border-radius:10px;font-size:12px;font-weight:700;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--igs-live-guard,#4f8cff) 80%,#000) 18%,color-mix(in srgb,var(--igs-live-guard,#4f8cff) 80%,#000) 82%,transparent);animation:igs-live-guard 3.4s ease both;}
.igs-live-guard-banner .igs-live-icon{width:18px;height:18px;color:#ffe9a8;}
.igs-live-list{position:absolute;left:8px;right:22%;bottom:52px;height:34%;display:flex;flex-direction:column;justify-content:flex-end;gap:3px;overflow:hidden;contain:layout paint;-webkit-mask-image:linear-gradient(180deg,transparent,#000 22%);mask-image:linear-gradient(180deg,transparent,#000 22%);}
.igs-live-phone[data-view="host"] .igs-live-list{right:10px;height:46%;}
.igs-live-line{flex:none;align-self:flex-start;max-width:100%;box-sizing:border-box;padding:3px 8px;border-radius:12px;background:rgba(0,0,0,.34);font-size:12px;line-height:1.4;word-break:break-all;animation:igs-live-line .28s ease-out both;}
.igs-live-name{color:rgba(255,255,255,.66);}
.igs-live-text{color:rgba(255,255,255,.95);}
.igs-live-line[data-ai] .igs-live-text{color:#fff;font-weight:600;}
.igs-live-line.is-note{padding:1px 8px;background:none;color:rgba(255,255,255,.6);font-size:11px;}
.igs-live-line.is-gift{color:#ffd166;}
.igs-live-line.is-guard{color:color-mix(in srgb,var(--igs-live-guard,#4f8cff) 55%,#fff);}
.igs-live-line.is-sc{background:color-mix(in srgb,var(--igs-live-sc,#2a60b2) 72%,transparent);}
.igs-live-line.is-sc .igs-live-name{color:rgba(255,255,255,.85);}
.igs-live-medal{--igs-live-medal:#5c968e;display:inline-flex;align-items:center;margin-right:4px;border:1px solid var(--igs-live-medal);border-radius:3px;overflow:hidden;font-size:9px;line-height:14px;vertical-align:1px;}
.igs-live-medal span{padding:0 3px;color:#fff;background:var(--igs-live-medal);}
.igs-live-medal b{padding:0 3px;color:var(--igs-live-medal);background:#fff;font-weight:700;}
.igs-live-medal[data-tier="2"]{--igs-live-medal:#5d7b9e;}
.igs-live-medal[data-tier="3"]{--igs-live-medal:#8d7ca6;}
.igs-live-medal[data-tier="4"]{--igs-live-medal:#be6686;}
.igs-live-medal[data-tier="5"]{--igs-live-medal:#c79d24;}
.igs-live-tag{display:inline-block;margin-right:4px;padding:0 4px;border-radius:3px;color:#fff;background:#ffb027;font-size:9px;line-height:14px;vertical-align:1px;}
.igs-live-hearts{position:absolute;right:8px;bottom:52px;width:40px;height:40%;}
.igs-live-heart{position:absolute;left:8px;bottom:0;width:24px;height:24px;animation:igs-live-heart 1.6s ease-out forwards;}
.igs-live-bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:8px;padding:8px 10px 12px;background:linear-gradient(0deg,rgba(0,0,0,.55),transparent);}
.igs-live-input{flex:1;min-width:0;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.16);color:rgba(255,255,255,.65);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.igs-live-btn{width:30px;height:30px;padding:6px;box-sizing:border-box;border-radius:50%;background:rgba(255,255,255,.16);}
.igs-live-btn.is-gift{color:#ffd166;}
.igs-live-btn.is-like{color:#ff5f8f;}
.igs-live-phone[data-view="host"] .igs-live-input{order:5;}
@media (prefers-reduced-motion: reduce){
.igs-dm-word{opacity:.94;transform:translate(-50%,-50%) scale(var(--igs-dm-s,1)) rotate(var(--igs-dm-r,0deg));}
.igs-aud-item.is-top{opacity:1;}
}
`.trim();
