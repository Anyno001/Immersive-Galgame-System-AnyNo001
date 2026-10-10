// 舞台调度样式：残影层贴在背景 / 立绘正上方做交叉淡出；黑场幕布在天气前景之上、对话层之下。环境滤镜见 scene-grade.js。
// 镜头只用独立的 translate / scale 属性，呼吸动画用 transform，三者叠加不互相覆盖。
// 低画质档（data-igs-quality="low"）：停推镜与立绘呼吸，亲密演出背景不再模糊、隐藏模糊垫底层，梦境雾去 blur。
// 立绘 scale / translate 由变量合成：特写 --igs-sd-closeup-scale、视差 --igs-sd-tx/ty、亲密演出逼近 --igs-rm-scale/dx，总放大上限 1.3。
export const STAGE_DIRECTION_STYLE_TEXT = `
#igs-overlay .igs-sd-ghost{position:absolute;inset:0;pointer-events:none;background-repeat:no-repeat;}
#igs-overlay .igs-sd-bg-ghost{background-position:center;background-size:cover;}
#igs-overlay .igs-sd-ghost-stripe{position:absolute;inset:0;background-repeat:no-repeat;background-position:center;background-size:cover;}
#igs-overlay .igs-sd-curtain{position:absolute;inset:0;z-index:3;background:#000;pointer-events:none;}
#igs-overlay[data-igs-sd-breathe] #igs-sprite:not(.igs-sprite-editing){transform-origin:var(--igs-sd-origin-x,50%) 100%;animation:igs-sd-breathe 4.6s ease-in-out infinite;}
#igs-overlay[data-igs-sd-kenburns] #igs-bg{animation:igs-sd-kenburns 34s ease-in-out infinite alternate;}
#igs-overlay[data-igs-sd-parallax] #igs-bg{scale:1.03;translate:calc(var(--igs-sd-px,0) * -9px) calc(var(--igs-sd-py,0) * -6px);transition:translate .6s cubic-bezier(.2,.7,.3,1),scale .8s ease;}
#igs-overlay[data-igs-sd-parallax] #igs-sprite:not(.igs-sprite-editing){--igs-sd-tx:calc(var(--igs-sd-px,0) * -18px);--igs-sd-ty:calc(var(--igs-sd-py,0) * -7px);transition:translate .6s cubic-bezier(.2,.7,.3,1);}
#igs-overlay #igs-sprite{transition:translate 1.2s cubic-bezier(.3,.7,.2,1);}
#igs-overlay #igs-sprite:not(.igs-sprite-editing){scale:min(1.3,calc(var(--igs-sd-closeup-scale,1) * var(--igs-rm-scale,1)));translate:calc(var(--igs-sd-tx,0px) + var(--igs-rm-dx,0%)) var(--igs-sd-ty,0px);}
/* 滤镜一开一停，或立绘层出现、消失，都会把 #igs-bg 拆成独立图层又并回去。没画完的那一帧是一闪黑。背景一直留在自己的图层上。
   平时用 will-change:transform 钉图层：常驻 will-change:filter 会让全屏背景配着 Ken Burns 每帧多走一遍离屏滤镜，手机发烫。
   CG 对焦时 filter 过渡一开一停，整张 CG 会重新栅格化，CG 页才提示 filter。 */
#igs-overlay #igs-bg{transition:opacity .3s ease,scale .9s cubic-bezier(.3,.7,.2,1);will-change:transform;}
#igs-stage-motion[data-igs-cg] #igs-bg{will-change:filter;}
#igs-overlay[data-igs-cg] #igs-bg,#igs-stage-motion[data-igs-cg] #igs-bg{animation:none!important;scale:1;}
#igs-overlay[data-igs-cg] #igs-bg-blur,#igs-stage-motion[data-igs-cg] #igs-bg-blur{display:none!important;opacity:0!important;}
/* 播 CG 时底图在对焦或运镜。对话框若还挂着毛玻璃，或还留着透明度 / 位移过渡，就会跟着底图每一帧重绘，看起来只有对话框在闪。 */
#igs-stage-motion[data-igs-cg] .igs-dialog{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;transition:none!important;}
#igs-stage-motion[data-igs-cg] .igs-option-bubble,#igs-stage-motion[data-igs-cg] .igs-ctrl-bar{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;}
#igs-stage-motion[data-igs-cg] #igs-dialog-layer{isolation:isolate;transform:translateZ(0);}
#igs-overlay[data-igs-sd-closeup] #igs-sprite:not(.igs-sprite-editing){--igs-sd-closeup-scale:1.12;transform-origin:var(--igs-sd-origin-x,50%) 28%;}
#igs-overlay[data-igs-sd-closeup] #igs-bg{scale:1.06;}
/* AI 镜头指令：特写推到脸、拉远缩小立绘、虚化只糊背景、摇镜横扫背景一次、倾斜是背景与立绘一起歪。 */
#igs-overlay[data-igs-sd-cam="closeup"] #igs-sprite:not(.igs-sprite-editing){--igs-sd-closeup-scale:1.24;transform-origin:var(--igs-sd-origin-x,50%) 22%;}
#igs-overlay[data-igs-sd-cam="closeup"] #igs-bg{scale:1.1;}
#igs-overlay[data-igs-sd-cam="wide"] #igs-sprite:not(.igs-sprite-editing){--igs-sd-closeup-scale:.82;transform-origin:var(--igs-sd-origin-x,50%) 100%;}
#igs-overlay[data-igs-sd-cam="wide"] #igs-bg{animation:none;scale:1;}
#igs-overlay[data-igs-sd-cam="focus"] #igs-stage-motion:not([data-igs-rm-glow]):not([data-igs-fx-flashback]):not([data-igs-fx-dream]) #igs-bg{filter:brightness(var(--igs-bg-brightness,1)) blur(6px) var(--igs-grade-bg,)!important;-webkit-filter:brightness(var(--igs-bg-brightness,1)) blur(6px) var(--igs-grade-bg,)!important;scale:1.05;}
#igs-overlay[data-igs-sd-cam^="pan-"] #igs-bg{animation:igs-sd-pan 9s cubic-bezier(.45,.05,.4,1) both;}
#igs-overlay[data-igs-sd-cam="pan-left"] #igs-bg{animation-direction:reverse;}
#igs-overlay[data-igs-sd-cam="tilt"] #igs-bg{rotate:-3deg;scale:1.12;transition:opacity .3s ease,scale .9s cubic-bezier(.3,.7,.2,1),rotate .9s cubic-bezier(.3,.7,.2,1);}
#igs-overlay[data-igs-sd-cam="tilt"] #igs-sprite:not(.igs-sprite-editing){rotate:-2.5deg;transition:translate 1.2s cubic-bezier(.3,.7,.2,1),rotate .9s cubic-bezier(.3,.7,.2,1);}
#igs-overlay[data-igs-quality="low"][data-igs-sd-cam^="pan-"] #igs-bg{animation:none;}
#igs-overlay[data-igs-quality="low"][data-igs-sd-breathe] #igs-sprite:not(.igs-sprite-editing),#igs-overlay[data-igs-quality="low"][data-igs-sd-kenburns] #igs-bg,#igs-overlay[data-igs-quality="low"] #igs-stage-motion[data-igs-rm-breathe] #igs-sprite:not(.igs-sprite-editing){animation:none;}
#igs-overlay[data-igs-quality="low"] #igs-bg{--igs-rm-bg-blur:0px;}
#igs-overlay[data-igs-quality="low"] #igs-stage-motion #igs-bg-blur{display:none;}
#igs-overlay[data-igs-quality="low"] .igs-fx-dream-mist{filter:none;}
@keyframes igs-sd-breathe{0%,100%{transform:scale(1,1);}50%{transform:scale(1.004,1.011);}}
@keyframes igs-sd-pan{0%{transform:scale(1.14) translateX(5%);}100%{transform:scale(1.14) translateX(-5%);}}
@keyframes igs-sd-kenburns{0%{transform:scale(1) translate(0,0);}100%{transform:scale(1.07) translate(-1.2%,-.8%);}}
@media (prefers-reduced-motion: reduce){
#igs-overlay[data-igs-sd-breathe] #igs-sprite,#igs-overlay[data-igs-sd-kenburns] #igs-bg{animation:none;}
}
`;
