// 亲密声画的前景层与晃动。前景层只画在画面边缘（中心透明），不给背景、立绘、CG 加滤镜。
// 晃动由 romance-intimate-runtime 每帧往背景、立绘、多人立绘各自写 --igs-rm-sx/sy/sr，对话框不动；
// 这里的 translate 沿用视差与恋爱逼近的原有算式再加上晃动量，并去掉 translate 过渡，否则逐帧位移会被拖慢。
// 触屏与低画质不用混合模式、不做热浪（backdrop-filter 太贵）。
export const INTIMATE_STYLE_TEXT = `
#igs-overlay #igs-stage-motion[data-igs-rm-sway] #igs-bg{translate:calc(var(--igs-sd-px,0) * -9px + var(--igs-rm-sx,0px)) calc(var(--igs-sd-py,0) * -6px + var(--igs-rm-sy,0px));rotate:var(--igs-rm-sr,0deg);scale:1.03;transition:opacity .3s ease,scale .9s cubic-bezier(.3,.7,.2,1),filter 1.6s ease;}
#igs-overlay[data-igs-sd-closeup] #igs-stage-motion[data-igs-rm-sway] #igs-bg{scale:1.06;}
#igs-overlay #igs-stage-motion[data-igs-rm-sway] #igs-sprite:not(.igs-sprite-editing){translate:calc(var(--igs-sd-tx,0px) + var(--igs-rm-dx,0%) + var(--igs-rm-sx,0px)) calc(var(--igs-sd-ty,0px) + var(--igs-rm-sy,0px));rotate:var(--igs-rm-sr,0deg);transition:scale 1.6s cubic-bezier(.3,.7,.2,1);}
#igs-overlay #igs-stage-motion[data-igs-rm-sway] #igs-cast{translate:calc(var(--igs-sd-px,0) * -12px + var(--igs-rm-sx,0px)) calc(var(--igs-sd-py,0) * -5px + var(--igs-rm-sy,0px));rotate:var(--igs-rm-sr,0deg);transition:filter 1.2s ease;}
#igs-stage-motion[data-igs-rm-asset] .igs-rm-back{-webkit-mask-image:radial-gradient(ellipse 72% 68% at 50% 46%,transparent 52%,#000 100%);mask-image:radial-gradient(ellipse 72% 68% at 50% 46%,transparent 52%,#000 100%);}
#igs-stage-motion .igs-rm-front{position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden;}
#igs-stage-motion .igs-rm-front>div{position:absolute;inset:0;opacity:0;visibility:hidden;transition:opacity 1.6s ease,visibility 0s linear 1.6s;}
#igs-stage-motion .igs-rm-gobo{inset:-12%;background:repeating-linear-gradient(112deg,transparent 0 9%,rgba(255,222,184,.2) 11% 15%,transparent 18% 26%);-webkit-mask-image:radial-gradient(ellipse 70% 66% at 50% 45%,transparent 45%,#000 95%);mask-image:radial-gradient(ellipse 70% 66% at 50% 45%,transparent 45%,#000 95%);animation:igs-rm-gobo 24s ease-in-out infinite alternate;animation-play-state:paused;}
#igs-stage-motion[data-igs-rm-tone="moon"] .igs-rm-gobo{background:repeating-linear-gradient(112deg,transparent 0 9%,rgba(196,208,255,.16) 11% 15%,transparent 18% 26%);}
#igs-stage-motion .igs-rm-front[data-igs-rm-gobo] .igs-rm-gobo{opacity:.8;visibility:visible;transition-delay:0s;animation-play-state:running;}
#igs-stage-motion .igs-rm-vig{background:radial-gradient(ellipse 78% 74% at 50% 46%,transparent 52%,rgba(70,12,34,.62) 100%);}
#igs-stage-motion[data-igs-rm-tone="moon"] .igs-rm-vig{background:radial-gradient(ellipse 78% 74% at 50% 46%,transparent 52%,rgba(18,20,58,.66) 100%);}
#igs-stage-motion .igs-rm-front[data-igs-rm-vig] .igs-rm-vig{opacity:calc(.34 + var(--igs-rm-pulse,0) * .3);visibility:visible;transition:opacity .3s ease-out,visibility 0s;}
#igs-stage-motion .igs-rm-front[data-igs-rm-vig][data-igs-rm-level="3"] .igs-rm-vig{opacity:calc(.5 + var(--igs-rm-pulse,0) * .32);}
#igs-stage-motion .igs-rm-haze{display:none;-webkit-backdrop-filter:blur(2.4px);backdrop-filter:blur(2.4px);-webkit-mask-image:radial-gradient(ellipse 66% 62% at 50% 45%,transparent 50%,#000 90%);mask-image:radial-gradient(ellipse 66% 62% at 50% 45%,transparent 50%,#000 90%);animation:igs-rm-haze 3.4s ease-in-out infinite alternate;}
#igs-stage-motion .igs-rm-front[data-igs-rm-haze] .igs-rm-haze{display:block;opacity:var(--igs-rm-haze,0);visibility:visible;transition-delay:0s;}
#igs-stage-motion .igs-rm-fringe::before,#igs-stage-motion .igs-rm-fringe::after{content:"";position:absolute;inset:0;mix-blend-mode:screen;}
#igs-stage-motion .igs-rm-fringe::before{background:radial-gradient(ellipse 70% 66% at 48.5% 46%,transparent 58%,rgba(255,40,90,.34) 100%);}
#igs-stage-motion .igs-rm-fringe::after{background:radial-gradient(ellipse 70% 66% at 51.5% 46%,transparent 58%,rgba(40,210,255,.26) 100%);}
#igs-stage-motion .igs-rm-front[data-igs-rm-fringe] .igs-rm-fringe{opacity:calc(var(--igs-rm-fringe,0) * .5);visibility:visible;transition:opacity .35s ease-out,visibility 0s;}
#igs-stage-motion .igs-rm-veil{transition:none;}
#igs-stage-motion .igs-rm-veil[data-igs-rm-veil="flash"]{visibility:visible;background:radial-gradient(ellipse at 50% 45%,#fff 30%,rgba(255,236,226,.96) 100%);animation:igs-rm-flash 2.4s ease-out both;}
#igs-stage-motion .igs-rm-veil[data-igs-rm-veil="dark"]{visibility:visible;background:#000;animation:igs-rm-dark 2.6s ease-in-out both;}
#igs-overlay[data-igs-quality="low"] #igs-stage-motion .igs-rm-haze{display:none!important;}
#igs-overlay[data-igs-quality="low"] #igs-stage-motion .igs-rm-fringe::before,#igs-overlay[data-igs-quality="low"] #igs-stage-motion .igs-rm-fringe::after{mix-blend-mode:normal;opacity:.6;}
@media (pointer: coarse){
#igs-stage-motion .igs-rm-haze{display:none!important;}
#igs-stage-motion .igs-rm-fringe::before,#igs-stage-motion .igs-rm-fringe::after{mix-blend-mode:normal;opacity:.6;}
}
@keyframes igs-rm-gobo{from{transform:translate3d(-3%,1%,0);}to{transform:translate3d(3%,-1.5%,0);}}
@keyframes igs-rm-haze{from{transform:scale(1) translate3d(0,0,0);}to{transform:scale(1.015) translate3d(.4%,-.5%,0);}}
@keyframes igs-rm-flash{0%{opacity:0;}6%{opacity:.92;}20%{opacity:.88;}100%{opacity:0;}}
@keyframes igs-rm-dark{0%{opacity:0;}28%{opacity:1;}58%{opacity:1;}100%{opacity:0;}}
@media (prefers-reduced-motion: reduce){
#igs-stage-motion .igs-rm-gobo,#igs-stage-motion .igs-rm-haze{animation:none;}
#igs-stage-motion .igs-rm-veil[data-igs-rm-veil="flash"]{animation:igs-rm-flash 2.4s linear both;}
}
`;
