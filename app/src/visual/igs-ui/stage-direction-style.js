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
#igs-overlay[data-igs-sd-parallax] #igs-sprite:not(.igs-sprite-editing){--igs-sd-tx:calc(var(--igs-sd-px,0) * -18px);--igs-sd-ty:calc(var(--igs-sd-py,0) * -7px);transition:translate .6s cubic-bezier(.2,.7,.3,1),scale .8s cubic-bezier(.3,.7,.2,1);}
#igs-overlay #igs-sprite{transition:scale .8s cubic-bezier(.3,.7,.2,1),translate 1.2s cubic-bezier(.3,.7,.2,1);}
#igs-overlay #igs-sprite:not(.igs-sprite-editing){scale:min(1.3,calc(var(--igs-sd-closeup-scale,1) * var(--igs-rm-scale,1)));translate:calc(var(--igs-sd-tx,0px) + var(--igs-rm-dx,0%)) var(--igs-sd-ty,0px);}
#igs-overlay #igs-bg{transition:opacity .3s ease,scale .9s cubic-bezier(.3,.7,.2,1);}
#igs-overlay[data-igs-sd-closeup] #igs-sprite:not(.igs-sprite-editing){--igs-sd-closeup-scale:1.12;transform-origin:var(--igs-sd-origin-x,50%) 28%;}
#igs-overlay[data-igs-sd-closeup] #igs-bg{scale:1.06;}
#igs-overlay[data-igs-quality="low"][data-igs-sd-breathe] #igs-sprite:not(.igs-sprite-editing),#igs-overlay[data-igs-quality="low"][data-igs-sd-kenburns] #igs-bg,#igs-overlay[data-igs-quality="low"] #igs-stage-motion[data-igs-rm-breathe] #igs-sprite:not(.igs-sprite-editing){animation:none;}
#igs-overlay[data-igs-quality="low"] #igs-bg{--igs-rm-bg-blur:0px;}
#igs-overlay[data-igs-quality="low"] #igs-stage-motion #igs-bg-blur{display:none;}
#igs-overlay[data-igs-quality="low"] .igs-fx-dream-mist{filter:none;}
@keyframes igs-sd-breathe{0%,100%{transform:scale(1,1);}50%{transform:scale(1.004,1.011);}}
@keyframes igs-sd-kenburns{0%{transform:scale(1) translate(0,0);}100%{transform:scale(1.07) translate(-1.2%,-.8%);}}
@media (prefers-reduced-motion: reduce){
#igs-overlay[data-igs-sd-breathe] #igs-sprite,#igs-overlay[data-igs-sd-kenburns] #igs-bg{animation:none;}
}
`;
