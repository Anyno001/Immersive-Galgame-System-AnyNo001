// 亲密演出样式：环境层（暖光 / 光斑 / 逆光）在背景之上、立绘之下；逼近只写 --igs-rm-* 变量，由 stage-direction-style 合成进立绘 scale / translate。
// 剪影用伪元素继承立绘背景图再压成纯黑，不用 mask-image: url(立绘)——外部图床缺 CORS 时 mask 会失效并露出完整立绘。
// 换表情（stage-direction）与换装（sprite-outfit-swap）的旧立绘残影在剪影模式下同样压黑，转场瞬间不露出完整立绘。
// 未启用的环境层淡出后 visibility:hidden，不再参与绘制与 screen 混合；光斑漂移同时暂停。
// 光斑不挂 filter（全屏常驻层每帧重做模糊）：软边是按原 blur(1.5px) 预算的多段色标，修罗场冷色是预换算的 hue-rotate(170deg) saturate(.5)。
// 背景柔焦叠在环境滤镜（--igs-grade-bg）之上，不替换它，否则亲密演出时背景丢调色、立绘却还带着，前后不一致。
export const ROMANCE_STYLE_TEXT = `
#igs-stage-motion .igs-rm-back{position:absolute;inset:0;z-index:1;pointer-events:none;overflow:hidden;}
#igs-stage-motion .igs-rm-back>div{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity 1.6s ease,visibility 0s linear 1.6s;}
#igs-stage-motion .igs-rm-glow{mix-blend-mode:screen;background:radial-gradient(ellipse 80% 70% at 50% 40%,rgba(255,196,170,.3),transparent 70%),linear-gradient(180deg,rgba(255,176,160,.2),rgba(230,130,150,.26));}
#igs-stage-motion[data-igs-rm-tone="moon"] .igs-rm-glow{background:radial-gradient(ellipse 80% 70% at 50% 40%,rgba(196,190,255,.24),transparent 70%),linear-gradient(180deg,rgba(150,160,230,.16),rgba(190,140,200,.22));}
#igs-stage-motion[data-igs-rm-tone="rival"] .igs-rm-glow{background:radial-gradient(ellipse 80% 70% at 50% 40%,rgba(170,200,230,.22),transparent 70%),linear-gradient(180deg,rgba(90,120,170,.22),rgba(60,70,120,.3));}
#igs-stage-motion[data-igs-rm-tone="rival"] .igs-rm-bokeh{background-image:radial-gradient(circle,rgba(216,233,243,.83),rgba(216,233,243,.82) 1px,rgba(216,233,243,.77) 2px,rgba(216,233,243,.68) 3px,rgba(216,233,243,.54) 4px,rgba(216,233,243,.22) 6px,rgba(216,233,243,.1) 7px,rgba(216,233,243,.04) 8px,rgba(216,233,243,.01) 9px,rgba(216,233,243,0) 10px),radial-gradient(circle,rgba(179,212,202,.6),rgba(179,212,202,.6) 2px,rgba(179,212,202,.59) 3px,rgba(179,212,202,.57) 4px,rgba(179,212,202,.53) 5px,rgba(179,212,202,.46) 6px,rgba(179,212,202,.28) 8px,rgba(179,212,202,.11) 10px,rgba(179,212,202,.05) 11px,rgba(179,212,202,.02) 12px,rgba(179,212,202,0) 14px),radial-gradient(circle,rgba(233,243,251,.44),rgba(233,243,251,.42) 1px,rgba(233,243,251,.36) 2px,rgba(233,243,251,.16) 4px,rgba(233,243,251,.07) 5px,rgba(233,243,251,.03) 6px,rgba(233,243,251,.01) 7px,rgba(233,243,251,0) 8px);}
#igs-stage-motion[data-igs-rm-glow] .igs-rm-glow{opacity:var(--igs-rm-glow,0);visibility:visible;transition-delay:0s;}
#igs-stage-motion .igs-rm-bokeh{inset:-10%;mix-blend-mode:screen;background-image:radial-gradient(circle,rgba(255,226,200,.83),rgba(255,226,200,.82) 1px,rgba(255,226,200,.77) 2px,rgba(255,226,200,.68) 3px,rgba(255,226,200,.54) 4px,rgba(255,226,200,.22) 6px,rgba(255,226,200,.1) 7px,rgba(255,226,200,.04) 8px,rgba(255,226,200,.01) 9px,rgba(255,226,200,0) 10px),radial-gradient(circle,rgba(255,190,200,.6),rgba(255,190,200,.6) 2px,rgba(255,190,200,.59) 3px,rgba(255,190,200,.57) 4px,rgba(255,190,200,.53) 5px,rgba(255,190,200,.46) 6px,rgba(255,190,200,.28) 8px,rgba(255,190,200,.11) 10px,rgba(255,190,200,.05) 11px,rgba(255,190,200,.02) 12px,rgba(255,190,200,0) 14px),radial-gradient(circle,rgba(255,240,220,.44),rgba(255,240,220,.42) 1px,rgba(255,240,220,.36) 2px,rgba(255,240,220,.16) 4px,rgba(255,240,220,.07) 5px,rgba(255,240,220,.03) 6px,rgba(255,240,220,.01) 7px,rgba(255,240,220,0) 8px);background-size:230px 260px,370px 310px,150px 170px;background-position:0 0,120px 80px,60px 140px;animation:igs-rm-bokeh 26s ease-in-out infinite alternate;}
#igs-stage-motion:not([data-igs-rm-bokeh]) .igs-rm-bokeh{animation-play-state:paused;}
#igs-stage-motion[data-igs-rm-bokeh] .igs-rm-bokeh{opacity:var(--igs-rm-bokeh,0);visibility:visible;transition-delay:0s;}
#igs-overlay[data-igs-quality="low"] #igs-stage-motion .igs-rm-bokeh{display:none;}
#igs-stage-motion .igs-rm-backlight{mix-blend-mode:screen;background:radial-gradient(circle at var(--igs-rm-light-x,50%) var(--igs-rm-light-y,35%),rgba(255,214,176,.75),rgba(255,160,130,.28) 18%,transparent 44%);}
#igs-stage-motion[data-igs-rm-tone="moon"] .igs-rm-backlight{background:radial-gradient(circle at var(--igs-rm-light-x,50%) var(--igs-rm-light-y,35%),rgba(206,218,255,.7),rgba(140,160,255,.24) 18%,transparent 44%);}
#igs-stage-motion[data-igs-rm-backlight] .igs-rm-backlight{opacity:var(--igs-rm-backlight,0);visibility:visible;transition-delay:0s;}
#igs-stage-motion[data-igs-rm-glow]:not([data-igs-fx-flashback]):not([data-igs-fx-dream]) #igs-bg{filter:brightness(var(--igs-bg-brightness,1)) blur(var(--igs-rm-bg-blur,0px)) saturate(1.06) var(--igs-grade-bg,)!important;-webkit-filter:brightness(var(--igs-bg-brightness,1)) blur(var(--igs-rm-bg-blur,0px)) saturate(1.06) var(--igs-grade-bg,)!important;transition:opacity .3s ease,scale .9s cubic-bezier(.3,.7,.2,1),filter 1.6s ease;animation-play-state:paused;}
#igs-stage-motion[data-igs-rm-glow]:not([data-igs-fx-flashback]):not([data-igs-fx-dream]) #igs-bg-blur{display:block;}
#igs-stage-motion[data-igs-rm-level] #igs-sprite:not(.igs-sprite-editing){transition:translate 1.6s cubic-bezier(.3,.7,.2,1);}
#igs-stage-motion[data-igs-rm-approach] #igs-sprite:not(.igs-sprite-editing){transform-origin:var(--igs-rm-origin-x,50%) var(--igs-rm-origin-y,28%);}
#igs-stage-motion[data-igs-rm-breathe] #igs-sprite:not(.igs-sprite-editing){animation:igs-rm-breathe 5.4s ease-in-out infinite;}
#igs-stage-motion[data-igs-rm-shade] #igs-sprite::after{content:"";position:absolute;inset:0;pointer-events:none;background-image:inherit;background-size:inherit;background-position:inherit;background-repeat:no-repeat;filter:brightness(0);-webkit-filter:brightness(0);}
#igs-stage-motion[data-igs-rm-face] #igs-sprite::after{-webkit-mask-image:linear-gradient(to bottom,transparent var(--igs-rm-neck,100%),#000 var(--igs-rm-shade-end,100%));mask-image:linear-gradient(to bottom,transparent var(--igs-rm-neck,100%),#000 var(--igs-rm-shade-end,100%));}
#igs-stage-motion[data-igs-rm-shade] .igs-sd-sprite-ghost,#igs-stage-motion[data-igs-rm-shade] #igs-sprite-ghost{filter:brightness(0)!important;-webkit-filter:brightness(0)!important;}
#igs-stage-motion .igs-rm-relation-card{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);min-width:220px;padding:18px 32px;text-align:center;color:#fff;pointer-events:auto;cursor:pointer;border-radius:14px;background:linear-gradient(180deg,rgba(60,28,44,.78),rgba(28,18,30,.82));border:1px solid rgba(255,180,200,.45);box-shadow:0 0 40px rgba(255,150,180,.25);animation:igs-rm-card 2.6s ease both;}
#igs-stage-motion .igs-rm-relation-title{font-size:12px;letter-spacing:.3em;color:rgba(255,200,215,.85);}
#igs-stage-motion .igs-rm-relation-name{margin-top:6px;font-size:20px;font-weight:600;}
#igs-stage-motion .igs-rm-relation-value{margin-top:4px;font-size:15px;color:rgba(255,226,234,.95);}
#igs-stage-motion .igs-rm-memory-toast{position:absolute;right:14px;bottom:30%;padding:5px 14px;border-radius:999px;font-size:13px;color:#fff;background:rgba(40,22,34,.7);border:1px solid rgba(255,170,200,.55);animation:igs-rm-toast 2.4s ease both;}
#igs-stage-motion[data-igs-rm-confess] .igs-fx-letterbox-bar{transform:scaleY(1);}
#igs-stage-motion[data-igs-rm-confess] #igs-fx-stage::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 50%,transparent 48%,rgba(255,110,160,.42) 100%);animation:igs-fx-beat 1.6s ease-in-out infinite;}
#igs-stage-motion .igs-rm-action-btn{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;padding:7px;border-radius:50%;pointer-events:auto;cursor:pointer;color:#ff7fa8;background:rgba(30,18,26,.55);border:1px solid rgba(255,160,190,.6);box-shadow:0 0 14px rgba(255,120,170,.35);transition:left .6s ease,top .6s ease,transform .2s ease;animation:igs-rm-btn-pulse 2.4s ease-in-out infinite;}
#igs-stage-motion .igs-rm-action-btn:hover,#igs-stage-motion .igs-rm-action-btn[aria-expanded="true"]{transform:scale(1.12);}
#igs-stage-motion .igs-rm-action-btn svg{display:block;width:100%;height:100%;fill:currentColor;}
#igs-stage-motion .igs-rm-action-menu{position:absolute;margin:22px 0 0 -60px;min-width:120px;display:flex;flex-direction:column;gap:2px;padding:6px;pointer-events:auto;border-radius:10px;background:rgba(28,18,26,.88);border:1px solid rgba(255,160,190,.45);}
#igs-stage-motion .igs-rm-action-item{all:unset;padding:6px 12px;border-radius:6px;font-size:14px;color:#fff;cursor:pointer;}
#igs-stage-motion .igs-rm-action-item:hover,#igs-stage-motion .igs-rm-action-item:focus-visible{background:rgba(255,140,180,.25);}
@keyframes igs-rm-btn-pulse{0%,100%{box-shadow:0 0 10px rgba(255,120,170,.25);}50%{box-shadow:0 0 18px rgba(255,120,170,.55);}}
@keyframes igs-rm-toast{0%{opacity:0;transform:translateY(8px);}12%,82%{opacity:1;transform:none;}100%{opacity:0;}}
@keyframes igs-rm-card{0%{opacity:0;transform:translate(-50%,-44%) scale(.96);}14%,80%{opacity:1;transform:translate(-50%,-50%) scale(1);}100%{opacity:0;transform:translate(-50%,-54%);}}
@keyframes igs-rm-bokeh{from{transform:translate3d(-2%,1%,0);}to{transform:translate3d(2%,-2%,0);}}
@keyframes igs-rm-breathe{0%,100%{transform:scale(1,1);}50%{transform:scale(1.006,1.018);}}
@media (prefers-reduced-motion: reduce){
#igs-stage-motion .igs-rm-back>div,#igs-stage-motion[data-igs-rm-level] #igs-sprite:not(.igs-sprite-editing){transition:none;}
#igs-stage-motion .igs-rm-bokeh,#igs-stage-motion[data-igs-rm-breathe] #igs-sprite:not(.igs-sprite-editing){animation:none;}
#igs-stage-motion .igs-rm-relation-card{animation:igs-rm-card-fade 2.2s linear both;}
#igs-stage-motion[data-igs-rm-confess] #igs-fx-stage::after{animation:none;opacity:.5;}
#igs-stage-motion .igs-rm-memory-toast{animation:igs-rm-card-fade 2.4s linear both;}
#igs-stage-motion .igs-rm-action-btn{animation:none;transition:none;}
@keyframes igs-rm-card-fade{0%,100%{opacity:0;}10%,85%{opacity:1;}}
}
`;
