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
.igs-aud-entry{--igs-aud-entry:38px;position:absolute;left:14px;top:var(--igs-aud-top,14px);width:calc(var(--igs-aud-entry) * var(--igs-hud-scale,1));height:calc(var(--igs-aud-entry) * var(--igs-hud-scale,1));padding:0;border:0;background:transparent;color:#f4f1ec;opacity:.55;cursor:pointer;pointer-events:auto;filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));transition:opacity .2s ease;}
.igs-aud-entry svg{display:block;width:100%;height:100%;}
.igs-aud-entry[data-size="small"]{--igs-aud-entry:30px;}
.igs-aud-entry[data-size="large"]{--igs-aud-entry:46px;}
.igs-aud-entry:hover,.igs-aud-entry:focus-visible,.igs-aud-entry[data-unread="1"]{opacity:1;}
.igs-aud-entry:focus-visible{outline:2px solid #f4e3ad;outline-offset:2px;border-radius:8px;}
.igs-aud-entry[data-pulse="1"]{animation:igs-aud-nudge .6s ease-in-out 1;}
.igs-aud-entry[data-pulse="2"]{animation:igs-aud-nudge-b .6s ease-in-out 1;}
.igs-aud-badge{position:absolute;top:-3px;right:-5px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:999px;background:#fb7299;color:#fff;font:700 10px/16px system-ui,sans-serif;text-align:center;box-shadow:0 0 0 1.5px rgba(12,14,20,.7);}
@media (pointer:coarse){.igs-aud-entry::after{content:"";position:absolute;inset:-8px;}}
.igs-aud-stage{position:absolute;inset:0;pointer-events:auto;}
.igs-aud-dim{position:absolute;inset:0;background:rgba(8,10,16,.5);cursor:pointer;animation:igs-live-dim-in .35s ease both;}
.igs-aud-phone{position:absolute;top:4%;bottom:4%;left:0;right:0;margin-inline:auto;aspect-ratio:9/18.5;max-width:92%;max-height:820px;box-sizing:border-box;display:flex;flex-direction:column;padding-top:34px;border-radius:34px;background-clip:padding-box;box-shadow:0 0 0 3px var(--igs-phone-case,#111215),0 32px 64px -24px rgba(0,0,0,.7),0 12px 28px -14px rgba(0,0,0,.45);background:linear-gradient(#000 0 34px,#fff 34px);color:#18191c;overflow:hidden;contain:layout paint style;font:13px/1.4 -apple-system,"PingFang SC","SF Pro Text","Microsoft YaHei","Noto Sans CJK SC",sans-serif;animation:igs-live-raise .5s cubic-bezier(.22,1,.36,1) both;}
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
.igs-aud-bar{flex:none;display:flex;align-items:center;gap:8px;padding:8px 12px 20px;background:#fff;border-top:1px solid #e3e5e7;}
.igs-aud-dm-toggle{flex:none;width:26px;height:26px;border-radius:6px;display:grid;place-items:center;background:#fb7299;color:#fff;font-size:13px;font-weight:700;}
.igs-aud-input{flex:1;min-width:0;padding:6px 12px;border-radius:999px;background:#f1f2f3;color:#9499a0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
@keyframes igs-dm-word-in{to{opacity:.94;transform:translate(-50%,-50%) scale(var(--igs-dm-s,1)) rotate(var(--igs-dm-r,0deg));}}
@keyframes igs-dm-word-out{from{opacity:.94;transform:translate(-50%,-50%) scale(var(--igs-dm-s,1)) rotate(var(--igs-dm-r,0deg));}to{opacity:0;transform:translate(-50%,-50%) scale(calc(var(--igs-dm-s,1) * 1.55)) rotate(var(--igs-dm-r,0deg));}}
.igs-dm-inner{position:absolute;inset:0;z-index:2;--igs-dm-c:#ff5c9e;}
.igs-dm-inner[data-mood="panic"]{--igs-dm-c:#3f8fff;}
.igs-dm-inner[data-mood="anger"]{--igs-dm-c:#ff3b4a;}
.igs-dm-inner[data-mood="guilty"]{--igs-dm-c:#8a6cff;}
.igs-dm-word{position:absolute;left:0;top:0;white-space:nowrap;font:700 var(--igs-dm-inner-size,20px)/1 "LXGW WenKai","LXGW WenKai Lite","Source Han Serif CN",serif;color:var(--igs-dm-c);-webkit-text-stroke:3px #fff;paint-order:stroke fill;text-shadow:0 0 2px rgba(0,0,0,.55),0 1px 3px rgba(0,0,0,.5);opacity:0;transform:translate(-50%,-50%) scale(.4) rotate(var(--igs-dm-r,0deg));animation:igs-dm-word-in .38s cubic-bezier(.2,1.5,.4,1) var(--igs-dm-d,0ms) forwards,igs-dm-word-out .42s ease-in var(--igs-dm-burst,2600ms) forwards;}
#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-dm-word{animation-timing-function:steps(2,end),steps(2,end);}
.igs-dm-word[data-real]{font-size:calc(var(--igs-dm-inner-size,20px) * 1.3);font-weight:900;color:#fff;-webkit-text-stroke:4px var(--igs-dm-c);}
.igs-dm-inner[data-style="fly"] .igs-dm-word{opacity:.94;transform:none;-webkit-text-stroke:2.5px #fff;animation:igs-dm-scroll var(--igs-dm-dur,5200ms) linear var(--igs-dm-d,0ms) both;}
#igs-stage-motion[data-igs-fx-motion="snappy"] .igs-dm-inner[data-style="fly"] .igs-dm-word{animation-timing-function:linear;}
.igs-dm-inner[data-style="fly"] .igs-dm-word[data-real]{-webkit-text-stroke:3.5px var(--igs-dm-c);}
@keyframes igs-live-raise{from{transform:translateY(100%);}to{transform:none;}}
@keyframes igs-live-lower{to{transform:translateY(105%);}}
@keyframes igs-live-dim-in{from{opacity:0;}to{opacity:1;}}
@keyframes igs-live-dim-out{to{opacity:0;}}
@keyframes igs-live-line{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
@keyframes igs-live-gift{0%{opacity:0;transform:translateX(-100%);}12%{opacity:1;transform:none;}84%{opacity:1;transform:none;}100%{opacity:0;transform:translateX(-24px);}}
@keyframes igs-live-card{0%{opacity:0;transform:translateY(-8px);}6%{opacity:1;transform:none;}92%{opacity:1;}100%{opacity:0;}}
@keyframes igs-live-guard{0%{opacity:0;transform:scaleX(.5);}12%{opacity:1;transform:scaleX(1.04);}18%{transform:none;}86%{opacity:1;}100%{opacity:0;}}
@keyframes igs-live-heart{0%{opacity:0;transform:translate(0,0) scale(.4);}15%{opacity:1;transform:translate(0,-10px) scale(1);}100%{opacity:0;transform:translate(var(--igs-live-drift,0px),-150px) scale(.8);}}
.igs-live-stage{position:absolute;inset:0;}
#igs-overlay[data-igs-stage-covered] #igs-sprite,#igs-overlay[data-igs-stage-covered] .igs-cast-sprite{visibility:hidden!important;}
#igs-overlay.igs-options-visible :is(.igs-dm-root,.igs-dm-front){visibility:hidden;}
.igs-live-dim{position:absolute;inset:0;background:rgba(8,10,16,.5);animation:igs-live-dim-in .4s ease both;}
.igs-live-phone{position:absolute;top:var(--igs-live-top,3%);left:0;right:0;margin-inline:auto;height:var(--igs-live-h,76%);width:var(--igs-live-w,auto);max-height:820px;aspect-ratio:9/18.5;max-width:92%;box-sizing:border-box;border-radius:34px;background-clip:padding-box;box-shadow:0 0 0 3px var(--igs-phone-case,#111215),0 32px 64px -24px rgba(0,0,0,.7),0 12px 28px -14px rgba(0,0,0,.45);background:#0e0f14;overflow:hidden;contain:layout paint style;color:#fff;font:13px/1.35 -apple-system,"PingFang SC","SF Pro Text","Microsoft YaHei","Noto Sans CJK SC",sans-serif;animation:igs-live-raise .5s cubic-bezier(.22,1,.36,1) both;}
#igs-overlay[data-igs-live-full] #igs-status-hud{visibility:hidden!important;}
#igs-overlay[data-igs-live-full="subtitle"] #igs-dialog-layer .igs-dialog{left:50%!important;right:auto!important;bottom:max(14px,4%)!important;width:min(86%,880px)!important;height:auto!important;min-height:0!important;max-height:none!important;padding:0!important;transform:translateX(-50%)!important;text-align:center;background:none!important;background-image:none!important;border:0!important;border-image:none!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;}
#igs-overlay[data-igs-live-full="subtitle"] #igs-dialog-layer .igs-dialog::before,#igs-overlay[data-igs-live-full="subtitle"] #igs-dialog-layer .igs-dialog::after,#igs-overlay[data-igs-live-full="minimal"] #igs-dialog-layer .igs-dialog::before,#igs-overlay[data-igs-live-full="minimal"] #igs-dialog-layer .igs-dialog::after{display:none!important;}
#igs-overlay[data-igs-live-full="subtitle"] #igs-dialog-layer .igs-dialog>:not(#igs-ctrl-bar):not(#igs-text):not(.igs-controls){display:none!important;}
#igs-overlay[data-igs-live-full="subtitle"] #igs-text{padding:0!important;background:none!important;color:#fff!important;font-size:clamp(15px,2.7vw,26px)!important;line-height:1.45!important;font-weight:600;text-align:center!important;text-shadow:0 0 2px #000,0 1px 3px #000,0 0 6px rgba(0,0,0,.9);-webkit-text-stroke:.6px rgba(0,0,0,.85);paint-order:stroke fill;}
#igs-overlay[data-igs-live-full="subtitle"][data-igs-live-sub="other"] #igs-text::before{content:attr(data-igs-sub-name) "：";color:#ffd166;}
#igs-overlay[data-igs-live-full="subtitle"][data-igs-live-sub="narration"] #igs-text{font-size:clamp(13px,2.2vw,21px)!important;font-style:italic;opacity:.75;}
#igs-overlay[data-igs-live-full="subtitle"][data-igs-live-sub="narration"][data-igs-live-npos="above"] #igs-dialog-layer .igs-dialog{bottom:calc(max(14px,4%) + 9%)!important;}
#igs-overlay[data-igs-live-full="subtitle"][data-igs-live-sub="narration"][data-igs-live-npos="name"] #igs-dialog-layer .igs-dialog{left:12px!important;bottom:auto!important;top:var(--igs-lf-name-top,110px)!important;width:min(60%,420px)!important;transform:none!important;text-align:left;}
#igs-overlay[data-igs-live-full="subtitle"][data-igs-live-sub="narration"][data-igs-live-npos="name"] #igs-text{text-align:left!important;}
#igs-overlay[data-igs-live-full="minimal"] #igs-dialog-layer .igs-dialog{background:rgba(0,0,0,.55)!important;background-image:none!important;border:0!important;border-image:none!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;border-radius:10px!important;}
.igs-live-stage[data-layout="full"][data-sub] .igs-live-top{top:var(--igs-live-name-top,14px);padding:0 12px;right:auto;width:calc(100% / .82);transform:scale(.82);transform-origin:left top;}
.igs-live-stage[data-layout="full"][data-sub] .igs-live-title{top:calc(var(--igs-live-name-top,14px) + 46px);}
.igs-live-stage[data-layout="full"][data-sub] .igs-live-sc{top:calc(var(--igs-live-name-top,14px) + 72px);}
.igs-live-stage[data-layout="full"][data-sub] .igs-live-list{bottom:auto;top:36%;height:26%;}
#igs-overlay:has(.igs-live-phone) #igs-dialog-layer{transition:opacity .2s ease;}
#igs-overlay.igs-phone-focus #igs-dialog-layer{opacity:0!important;pointer-events:none!important;}
.igs-live-phone,.igs-live-ctl{transition:height .28s ease,width .28s ease,top .28s ease;}
.igs-live-phone[data-igs-sunk]{-webkit-mask-image:linear-gradient(180deg,#000 calc(100% - var(--igs-phone-sink,0px) - 28px),transparent calc(100% - var(--igs-phone-sink,0px) + 4px));mask-image:linear-gradient(180deg,#000 calc(100% - var(--igs-phone-sink,0px) - 28px),transparent calc(100% - var(--igs-phone-sink,0px) + 4px));}
.igs-live-phone::before,.igs-aud-phone::before{content:"";position:absolute;z-index:6;top:9px;left:50%;width:78px;height:22px;margin-left:-39px;border-radius:999px;background:#000;}
.igs-live-phone::after,.igs-aud-phone::after{content:"";position:absolute;z-index:6;bottom:6px;left:50%;width:34%;height:4px;margin-left:-17%;border-radius:999px;background:rgba(255,255,255,.72);}
.igs-aud-phone::after{background:rgba(0,0,0,.28);}
.igs-phone-status{position:absolute;z-index:5;top:0;left:0;right:0;height:34px;display:flex;align-items:center;justify-content:space-between;padding:2px 24px 0 28px;box-sizing:border-box;color:#fff;font:600 12px/1 -apple-system,"PingFang SC","SF Pro Text","Microsoft YaHei","Noto Sans CJK SC",sans-serif;letter-spacing:.01em;pointer-events:none;}
.igs-phone-status-icons{display:flex;align-items:center;gap:5px;}
.igs-phone-status-icons svg{display:block;height:10px;width:auto;fill:currentColor;}
.igs-phone-status-icons svg:last-child{height:11px;}
.igs-live-stage[data-leaving] .igs-live-phone{animation:igs-live-lower .42s cubic-bezier(.5,0,.8,.4) forwards;}
.igs-live-stage[data-leaving] .igs-live-dim{animation:igs-live-dim-out .42s ease forwards;}
.igs-live-screen{position:absolute;inset:0;background:linear-gradient(160deg,#2a2f45,#12131b);}
.igs-live-cover{position:absolute;inset:0;background:center/cover no-repeat;}
.igs-live-portrait{position:absolute;left:calc(50% + var(--igs-lp-x,0%));bottom:calc(0% - var(--igs-lp-y,0%));height:86%;width:auto;max-width:none;transform:translateX(-50%) scale(var(--igs-lp-z,1));transform-origin:50% 100%;object-fit:contain;object-position:bottom;}
.igs-live-stage[data-editing] .igs-live-screen{pointer-events:auto;cursor:grab;touch-action:none;outline:2px dashed rgba(255,255,255,.55);outline-offset:-4px;}
.igs-live-stage[data-interact="1"] .igs-live-bar{visibility:hidden;}
.igs-live-line[data-mine]{box-shadow:inset 0 0 0 1px rgba(251,114,153,.75);}
.igs-live-line[data-mine] .igs-live-name{color:#fb7299;}
.igs-live-stage[data-model="notch"] .igs-live-phone{border-radius:28px;}
.igs-live-stage[data-model="notch"] .igs-live-phone::before{top:0;width:44%;height:24px;margin-left:-22%;border-radius:0 0 16px 16px;}
.igs-live-stage[data-model="fold"] .igs-live-phone{border-radius:18px;}
.igs-live-stage[data-model="fold"] .igs-live-phone::before{top:12px;width:10px;height:10px;margin-left:-5px;}
.igs-live-stage[data-model="fold"] .igs-live-screen::before{content:"";position:absolute;z-index:1;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:linear-gradient(180deg,transparent,rgba(255,255,255,.14) 30%,rgba(0,0,0,.18) 70%,transparent);}
.igs-live-stage[data-model="tablet"] .igs-live-phone{border-radius:22px;box-shadow:0 0 0 10px var(--igs-phone-case,#111215),0 0 0 11px #2a2c33,0 32px 64px -24px rgba(0,0,0,.7);}
.igs-live-stage[data-model="tablet"] .igs-live-phone::before{top:-7px;width:6px;height:6px;margin-left:-3px;background:#2b3a55;}
.igs-live-stage[data-model="tablet"] .igs-live-phone::after{display:none;}
.igs-live-ctl{position:absolute;top:var(--igs-live-top,3%);left:0;right:0;margin-inline:auto;height:var(--igs-live-h,76%);width:var(--igs-live-w,auto);aspect-ratio:9/18.5;max-height:820px;max-width:92%;pointer-events:none;color:#fff;font:13px/1.35 -apple-system,"PingFang SC","SF Pro Text","Microsoft YaHei","Noto Sans CJK SC",sans-serif;}
.igs-live-ctl[data-layout="full"]{inset:0;height:auto;width:auto;max-height:none;max-width:none;aspect-ratio:auto;margin:0;}
.igs-live-ctl-bar{position:absolute;left:0;right:0;bottom:var(--igs-live-under,0px);display:flex;align-items:center;gap:8px;padding:8px 12px max(8px,calc(20px - var(--igs-live-under,0px)));box-sizing:border-box;}
.igs-live-ctl[data-layout="full"] .igs-live-ctl-bar{left:auto;right:16px;bottom:calc(var(--igs-live-floor,160px) + 6px);width:min(380px,46%);padding:0;}
.igs-live-ctl-bar>*,.igs-live-ctl-panel{pointer-events:auto;}
.igs-live-ctl-pill{flex:1;min-width:0;padding:7px 12px;border:0;border-radius:999px;background:rgba(255,255,255,.16);color:rgba(255,255,255,.72);font:inherit;font-size:11.5px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:text;}
.igs-live-ctl-compose{display:none;flex:1;min-width:0;gap:6px;align-items:center;}
.igs-live-ctl[data-compose] .igs-live-ctl-pill{display:none;}
.igs-live-ctl[data-compose] .igs-live-ctl-compose{display:flex;}
.igs-live-ctl-field{flex:1;min-width:0;padding:7px 12px;border:0;border-radius:999px;background:rgba(255,255,255,.94);color:#18191c;font:inherit;font-size:12px;outline:none;}
.igs-live-ctl-send{flex:none;padding:7px 12px;border:0;border-radius:999px;background:#fb7299;color:#fff;font:inherit;font-size:12px;font-weight:600;cursor:pointer;}
.igs-live-ctl-btn{flex:none;display:flex;align-items:center;justify-content:center;width:30px;height:30px;padding:6px;box-sizing:border-box;border:0;border-radius:50%;background:rgba(255,255,255,.16);cursor:pointer;}
.igs-live-ctl-btn svg,.igs-live-ctl-close svg{width:100%;height:100%;display:block;}
.igs-live-ctl-btn.is-gift{color:#ffd166;}
.igs-live-ctl-btn.is-like{color:#ff5f8f;}
.igs-live-ctl-btn:active,.igs-live-ctl-gift:active,.igs-live-ctl-send:active{transform:scale(.92);}
.igs-live-ctl-panel{display:none;position:absolute;left:8px;right:8px;bottom:calc(var(--igs-live-under,0px) + 60px);padding:8px;border-radius:14px;background:rgba(22,23,30,.95);box-shadow:0 12px 30px -12px rgba(0,0,0,.7);}
.igs-live-ctl[data-layout="full"] .igs-live-ctl-panel{left:auto;right:16px;width:min(380px,60%);bottom:calc(var(--igs-live-floor,160px) + 48px);}
.igs-live-ctl[data-panel] .igs-live-ctl-panel{display:block;animation:igs-live-line .2s ease-out both;}
.igs-live-ctl-tabs{display:flex;align-items:center;gap:4px;margin-bottom:8px;}
.igs-live-ctl-tab{padding:4px 10px;border:0;border-radius:999px;background:transparent;color:rgba(255,255,255,.6);font:inherit;font-size:12px;cursor:pointer;}
.igs-live-ctl-tab[aria-pressed="true"]{background:rgba(251,114,153,.2);color:#fb7299;font-weight:600;}
.igs-live-ctl-close{margin-left:auto;width:24px;height:24px;padding:6px;box-sizing:border-box;border:0;border-radius:50%;background:rgba(255,255,255,.1);color:rgba(255,255,255,.7);cursor:pointer;}
.igs-live-ctl-body{display:none;}
.igs-live-ctl[data-tab="gift"] .igs-live-ctl-body.is-gift{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
.igs-live-ctl[data-tab="sc"] .igs-live-ctl-body.is-sc,.igs-live-ctl[data-tab="guard"] .igs-live-ctl-body.is-guard{display:flex;flex-direction:column;gap:8px;}
.igs-live-ctl-gift{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;border:0;border-radius:10px;background:rgba(255,255,255,.06);color:#ffd166;font:inherit;font-size:10.5px;cursor:pointer;}
.igs-live-ctl-gift svg{width:22px;height:22px;display:block;}
.igs-live-ctl-gift span{color:rgba(255,255,255,.85);white-space:nowrap;}
.igs-live-ctl-amounts{display:flex;flex-wrap:wrap;gap:6px;}
.igs-live-ctl-amount{padding:5px 10px;border:0;border-radius:999px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.75);font:inherit;font-size:11.5px;cursor:pointer;}
.igs-live-ctl-amount[aria-pressed="true"]{background:#2a60b2;color:#fff;}
.igs-live-ctl-row{display:flex;gap:6px;align-items:center;}
.igs-live-ctl-guard{padding:9px 12px;border:0;border-radius:10px;background:color-mix(in srgb,var(--igs-g,#4f8cff) 28%,transparent);color:#fff;font:inherit;font-size:12.5px;font-weight:600;text-align:left;cursor:pointer;}
.igs-live-ctl-guard[data-level="提督"]{--igs-g:#b367ff;}
.igs-live-ctl-guard[data-level="总督"]{--igs-g:#ff6a3d;}
.igs-live-cg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;}
.igs-live-stage[data-cg="1"] .igs-live-cover{transform:scale(1.15);filter:blur(14px) brightness(.7);}
.igs-live-stage[data-cg="1"] .igs-live-portrait,.igs-live-stage[data-cg="1"] .igs-live-initial{display:none;}
.igs-live-initial{position:absolute;left:50%;top:38%;width:30%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:500;color:rgba(255,255,255,.9);background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);}
.igs-live-screen::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45) 0,transparent 24%,transparent 48%,rgba(0,0,0,.6) 100%);}
.igs-live-icon{display:inline-flex;flex:none;width:18px;height:18px;}
.igs-live-icon svg{width:100%;height:100%;display:block;}
.igs-live-top{position:absolute;top:38px;left:0;right:0;display:flex;justify-content:space-between;align-items:center;gap:6px;padding:0 12px;}
.igs-live-anchor{display:flex;align-items:center;gap:7px;min-width:0;}
.igs-live-avatar{flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;background:#fb7299 center/cover no-repeat;box-shadow:0 0 0 1.5px rgba(255,255,255,.85),0 1px 4px rgba(0,0,0,.4);}
.igs-live-avatar[data-img="1"]{color:transparent;}
.igs-live-meta{min-width:0;display:flex;flex-direction:column;gap:1px;text-shadow:0 1px 3px rgba(0,0,0,.65);}
.igs-live-host{max-width:7em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;}
.igs-live-pop{display:flex;align-items:center;gap:2px;font-size:9.5px;opacity:.9;}
.igs-live-pop .igs-live-icon{width:10px;height:10px;color:#ff8a3d;}
.igs-live-follow{flex:none;display:flex;align-items:center;gap:1px;padding:3px 9px 3px 6px;border-radius:999px;background:#fb7299;font-size:10.5px;font-weight:600;}
.igs-live-follow .igs-live-icon{width:11px;height:11px;}
.igs-live-view{appearance:none;border:0;background:none;color:inherit;width:15px;height:15px;opacity:.55;pointer-events:auto;cursor:pointer;padding:6px;margin:-6px 0 -6px -6px;box-sizing:content-box;transition:opacity .15s ease;}
.igs-live-view:hover,.igs-live-view:active,.igs-live-view:focus-visible{opacity:1;}
.igs-live-view svg{width:100%;height:100%;display:block;}
.igs-live-switch{position:absolute;right:10px;top:calc(var(--igs-live-view-top,56px) + 28px);z-index:2;pointer-events:auto;color:#fff;}
.igs-live-switch-btn{appearance:none;border:0;margin:0;padding:6px;width:30px;height:30px;box-sizing:border-box;background:none;color:inherit;opacity:.55;cursor:pointer;transition:opacity .15s ease;}
.igs-live-switch-btn:hover,.igs-live-switch-btn:active,.igs-live-switch-btn:focus-visible{opacity:1;}
.igs-live-switch-btn svg{width:100%;height:100%;display:block;}
.igs-live-tools{flex:none;display:flex;align-items:center;gap:6px;}
.igs-live-viewers{display:flex;align-items:center;gap:3px;padding:3px 8px;border-radius:999px;background:rgba(0,0,0,.26);font-size:10px;font-variant-numeric:tabular-nums;}
.igs-live-viewers .igs-live-icon{width:12px;height:12px;}
.igs-live-close{width:15px;height:15px;opacity:.7;pointer-events:auto;cursor:pointer;padding:6px;margin:-6px;}
.igs-live-title{position:absolute;top:76px;left:12px;right:12px;display:flex;align-items:center;gap:6px;overflow:hidden;white-space:nowrap;font-size:10.5px;}
.igs-live-badge{flex:none;padding:1px 5px;border-radius:3px;background:#fb7299;font-size:9px;font-weight:700;letter-spacing:.06em;}
.igs-live-phone[data-view="host"] .igs-live-badge{background:#ff3b30;}
.igs-live-title-text{overflow:hidden;text-overflow:ellipsis;opacity:.8;}
.igs-live-clock{flex:none;margin-left:auto;font-variant-numeric:tabular-nums;opacity:.85;}
.igs-live-sc{position:absolute;top:98px;left:12px;right:12px;}
.igs-live-sc-card{border-radius:8px;overflow:hidden;color:#222;background:color-mix(in srgb,var(--igs-live-sc,#2a60b2) 22%,#fff);animation:igs-live-card 7s ease both;}
.igs-live-sc-head{display:flex;justify-content:space-between;gap:8px;padding:4px 8px;color:#fff;background:var(--igs-live-sc,#2a60b2);font-size:11px;font-weight:700;}
.igs-live-sc-text{padding:5px 8px;font-size:12px;line-height:1.4;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
.igs-live-gifts{position:absolute;left:0;top:44%;display:flex;flex-direction:column;gap:6px;}
.igs-live-gift{display:flex;align-items:center;gap:6px;padding:4px 12px 4px 8px;border-radius:0 999px 999px 0;background:linear-gradient(90deg,rgba(251,114,153,.82),rgba(251,114,153,0));animation:igs-live-gift 2.6s ease both;}
.igs-live-gift .igs-live-icon{width:22px;height:22px;color:#ffe9a8;}
.igs-live-gift-user{max-width:7em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:600;}
.igs-live-gift-name{font-size:10px;opacity:.9;}
.igs-live-gift-count{margin-left:4px;font:italic 800 16px/1 system-ui,sans-serif;color:#ffe9a8;}
.igs-live-guard{position:absolute;left:0;right:0;top:36%;}
.igs-live-guard-banner{display:flex;align-items:center;justify-content:center;gap:6px;margin:0 10px;padding:7px 10px;border-radius:10px;font-size:11.5px;font-weight:600;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--igs-live-guard,#4f8cff) 80%,#000) 18%,color-mix(in srgb,var(--igs-live-guard,#4f8cff) 80%,#000) 82%,transparent);animation:igs-live-guard 3.4s ease both;}
.igs-live-guard-banner .igs-live-icon{width:18px;height:18px;color:#ffe9a8;}
.igs-live-list{position:absolute;left:10px;right:22%;bottom:calc(58px + var(--igs-live-under,0px));height:24%;display:flex;flex-direction:column;justify-content:flex-end;gap:3px;overflow:hidden;contain:layout paint;-webkit-mask-image:linear-gradient(180deg,transparent,#000 22%);mask-image:linear-gradient(180deg,transparent,#000 22%);}
.igs-live-phone[data-view="host"] .igs-live-list{right:10px;height:46%;}
.igs-live-line{flex:none;align-self:flex-start;max-width:100%;box-sizing:border-box;padding:3px 8px;border-radius:10px;background:rgba(0,0,0,.24);font-size:11.5px;line-height:1.45;word-break:break-all;animation:igs-live-line .28s ease-out both;}
.igs-live-name{color:rgba(255,255,255,.55);}
.igs-live-text{color:rgba(255,255,255,.95);}
.igs-live-line[data-ai] .igs-live-text{color:#fff;font-weight:500;}
.igs-live-line.is-note{padding:1px 8px;background:none;color:rgba(255,255,255,.5);font-size:10.5px;}
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
.igs-live-hearts{position:absolute;right:10px;bottom:calc(58px + var(--igs-live-under,0px));width:40px;height:40%;}
.igs-live-heart{position:absolute;left:8px;bottom:0;width:20px;height:20px;animation:igs-live-heart 1.6s ease-out forwards;}
.igs-live-bar{position:absolute;left:0;right:0;bottom:var(--igs-live-under,0px);display:flex;align-items:center;gap:8px;padding:8px 12px max(8px,calc(20px - var(--igs-live-under,0px)));background:linear-gradient(0deg,rgba(0,0,0,.45),transparent);}
.igs-live-input{flex:1;min-width:0;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.12);color:rgba(255,255,255,.55);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.igs-live-btn{width:28px;height:28px;padding:6px;box-sizing:border-box;border-radius:50%;background:rgba(255,255,255,.12);}
.igs-live-btn.is-gift{color:#ffd166;}
.igs-live-btn.is-like{color:#ff5f8f;}
.igs-live-phone[data-view="host"] .igs-live-input{order:5;}
@keyframes igs-live-fade{from{opacity:0;}to{opacity:1;}}
.igs-live-stage[data-layout="full"] .igs-live-dim{display:none;}
.igs-live-stage[data-layout="full"] .igs-live-phone{inset:0;height:auto;max-height:none;max-width:none;aspect-ratio:auto;margin:0;border-radius:0;box-shadow:none;background:transparent;animation:igs-live-fade .4s ease both;}
.igs-live-stage[data-layout="full"][data-leaving] .igs-live-phone{animation:igs-live-dim-out .42s ease forwards;}
.igs-live-stage[data-layout="full"] .igs-live-phone::before,.igs-live-stage[data-layout="full"] .igs-live-phone::after,.igs-live-stage[data-layout="full"] .igs-live-phone:not([data-view="host"]) .igs-live-bar{display:none;}
.igs-live-stage[data-layout="full"] .igs-live-phone[data-view="host"] .igs-live-bar{left:auto;right:16px;bottom:calc(var(--igs-live-floor,160px) - 52px);padding:6px 8px;border-radius:999px;background:rgba(0,0,0,.36);}
.igs-live-stage[data-layout="full"] .igs-live-phone[data-view="host"] .igs-live-input{display:none;}
.igs-live-stage[data-layout="full"] .igs-live-screen{background:none;}
.igs-live-stage[data-layout="full"] .igs-live-cover,.igs-live-stage[data-layout="full"] .igs-live-portrait,.igs-live-stage[data-layout="full"] .igs-live-initial,.igs-live-stage[data-layout="full"] .igs-live-cg{display:none;}
.igs-live-stage[data-layout="full"] .igs-live-top{top:14px;padding:0 16px;}
.igs-live-stage[data-layout="full"] .igs-live-title{top:88px;left:16px;right:auto;max-width:46%;}
.igs-live-stage[data-layout="full"] .igs-live-sc{top:114px;left:16px;right:auto;width:min(320px,40%);}
.igs-live-stage[data-layout="full"] .igs-live-gifts{top:34%;}
.igs-live-stage[data-layout="full"] .igs-live-guard{top:24%;}
.igs-live-stage[data-layout="full"] .igs-live-guard-banner{max-width:460px;margin:0 auto;}
.igs-live-stage[data-layout="full"] .igs-live-list{left:16px;right:auto;width:min(380px,42%);bottom:var(--igs-live-floor,160px);height:30%;}
.igs-live-stage[data-layout="full"] .igs-live-hearts{right:28px;bottom:calc(var(--igs-live-floor,160px) + 118px);}
.igs-live-fly{position:absolute;inset:0;z-index:3;overflow:hidden;pointer-events:none;}
.igs-live-flyer{position:absolute;left:100%;top:0;white-space:nowrap;font:700 var(--igs-live-fly-font,16px)/1.3 "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;color:#fff;text-shadow:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000,1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,0 1px 4px rgba(0,0,0,.65);animation:igs-dm-scroll var(--igs-dm-dur,7s) linear both;}
.igs-live-flyer:not([data-ai]){font-weight:500;opacity:.85;}
.igs-live-flyer.is-sc{color:#ffd166;}
.igs-live-stage[data-chat="fly"] .igs-live-list{display:none;}
.igs-live-initial[data-img="1"]{color:transparent;background-size:cover;background-position:center;background-repeat:no-repeat;}
.igs-live-stage[data-layout="full"] .igs-live-phone[data-view="host"] .igs-live-initial:not([hidden]){display:flex;top:30%;width:min(140px,16%);box-shadow:0 0 0 3px rgba(251,114,153,.8),0 10px 24px -10px rgba(0,0,0,.6);}
.igs-live-tag.is-host{background:#fb7299;}
.igs-live-line[data-type="host"]{box-shadow:inset 0 0 0 1px rgba(251,114,153,.75);}
.igs-live-line[data-type="host"] .igs-live-text{color:#fff;font-weight:600;}
.igs-live-flyer.is-host{color:#ffa3c4;}
.igs-live-stage[data-theme] .igs-live-phone{font-family:var(--igs-live-t-font);}
.igs-live-stage[data-theme][data-layout="phone"] .igs-live-phone{box-shadow:0 0 0 3px var(--igs-live-t-frame),0 32px 64px -24px rgba(0,0,0,.7),0 12px 28px -14px rgba(0,0,0,.45);}
.igs-live-stage[data-theme] .igs-live-line{background:color-mix(in srgb,var(--igs-live-t-head) 55%,transparent);color:var(--igs-live-t-headInk);}
.igs-live-stage[data-theme] .igs-live-line .igs-live-text{color:var(--igs-live-t-headInk);}
.igs-live-stage[data-theme] .igs-live-name{color:var(--igs-live-t-sub);}
.igs-live-stage[data-theme] .igs-live-line[data-type="host"]{box-shadow:inset 0 0 0 1.5px var(--igs-live-t-right);}
.igs-live-stage[data-theme] .igs-live-chip,.igs-live-stage[data-theme] .igs-live-viewers{background:color-mix(in srgb,var(--igs-live-t-head) 70%,transparent);color:var(--igs-live-t-headInk);}
.igs-live-stage[data-theme] .igs-live-meta{color:var(--igs-live-t-headInk);}
.igs-live-ranks{display:flex;gap:2px;}
.igs-live-rank{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font:700 10px/1 system-ui,sans-serif;color:#1b1d26;background:#e3e6ee;box-shadow:0 0 0 1.5px var(--igs-live-rank,#c0c7d4);}
.igs-live-rank[data-rank="1"]{--igs-live-rank:#f2c94c;background:#fff4cc;}
.igs-live-rank[data-rank="3"]{--igs-live-rank:#d99a5b;background:#fbe6d2;}
.igs-live-chips{position:absolute;top:52px;left:16px;right:16px;display:flex;align-items:center;gap:8px;}
.igs-live-chip{flex:none;padding:4px 11px;border-radius:999px;background:rgba(0,0,0,.36);font-size:11.5px;white-space:nowrap;}
.igs-live-watching{margin-left:auto;font-variant-numeric:tabular-nums;}
.igs-live-rankcard{position:absolute;right:16px;bottom:var(--igs-live-floor,160px);width:108px;box-sizing:border-box;padding:8px 6px;border-radius:10px;display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;color:#fff;background:linear-gradient(180deg,#3d7bff,#8fbfff);box-shadow:0 6px 16px -8px rgba(0,0,0,.5);}
.igs-live-rankcard-title{font-size:13px;font-weight:800;letter-spacing:.04em;}
.igs-live-rankcard-sub{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;opacity:.9;}
.igs-live-rankcard-place{padding:2px 10px;border-radius:999px;background:#fff;color:#2f6bff;font-size:12px;font-weight:800;}
.igs-live-rankcard-gap{font-size:9.5px;opacity:.9;}
.igs-live-stage[data-layout="full"] .igs-live-line{padding:5px 10px;border-radius:14px;background:rgba(18,22,36,.72);font-size:13px;}
.igs-live-stage[data-layout="full"] .igs-live-name{color:#8fd0ff;}
.igs-live-stage[data-layout="full"] .igs-live-line.is-note{padding:4px 10px;background:rgba(18,22,36,.6);color:rgba(143,208,255,.85);font-size:12px;}
.igs-live-lv{display:inline-flex;align-items:center;margin-right:4px;padding:0 6px;border-radius:999px;background:#3f5fa8;color:#fff;font:700 10px/16px system-ui,sans-serif;vertical-align:1px;}
.igs-live-lv::before{content:"V";margin-right:2px;opacity:.75;}
.igs-live-stage[data-layout="full"] .igs-live-sc-card{border-radius:10px;color:#fff;background:var(--igs-live-sc,#2a60b2);}
.igs-live-stage[data-layout="full"] .igs-live-sc-head{color:#2b2f38;background:#eef2fb;}
@media (prefers-reduced-motion: reduce){
.igs-dm-word{opacity:.94;transform:translate(-50%,-50%) scale(var(--igs-dm-s,1)) rotate(var(--igs-dm-r,0deg));}
.igs-aud-item.is-top{opacity:1;}
}
`.trim();
