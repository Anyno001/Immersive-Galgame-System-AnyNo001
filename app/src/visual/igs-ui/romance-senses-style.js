// 感官调度、脱衣扫光与 CG 镜头缓移的样式。感官层与扫光层在亲密前景层 .igs-rm-front 里（立绘之上、对话框之下）；
// 挂 CG 时（data-igs-rm-asset）一律只压画面边缘，中心留给 CG。只用渐变、opacity 与 transform，不用混合模式与 backdrop-filter。
// CG 运镜写在 #igs-bg 的 transform 上：特异性高于「挂 CG 时关掉背景推镜」那条，动画名 1 / 2 交替用于重播。
export const SENSES_STYLE_TEXT = `
#igs-stage-motion .igs-rm-front>.igs-rm-sense{transition:opacity .9s ease,visibility 0s linear .9s;}
#igs-stage-motion .igs-rm-front[data-igs-rm-sense] .igs-rm-sense{opacity:1;visibility:visible;transition:opacity .9s ease,visibility 0s;}
#igs-stage-motion .igs-rm-front[data-igs-rm-sense="blind"] .igs-rm-sense{background:radial-gradient(ellipse 58% 52% at 50% 45%,rgba(6,3,10,.42) 0%,rgba(6,3,10,.9) 72%,rgba(4,2,8,.97) 100%);}
#igs-stage-motion[data-igs-rm-asset] .igs-rm-front[data-igs-rm-sense="blind"] .igs-rm-sense{background:radial-gradient(ellipse 66% 60% at 50% 45%,transparent 42%,rgba(6,3,10,.86) 100%);}
#igs-stage-motion .igs-rm-front[data-igs-rm-sense="hush"] .igs-rm-sense{background:radial-gradient(ellipse 70% 64% at 50% 45%,transparent 38%,rgba(8,8,14,.62) 100%);}
#igs-stage-motion .igs-rm-front[data-igs-rm-sense="daze"] .igs-rm-sense{background:radial-gradient(ellipse 70% 64% at 50% 45%,transparent 36%,rgba(255,250,244,.56) 100%);animation:igs-rm-sense-pulse 6s ease-in-out infinite alternate;}
#igs-stage-motion .igs-rm-front[data-igs-rm-sense="ear"] .igs-rm-sense{background:linear-gradient(90deg,rgba(255,186,204,.3),rgba(255,186,204,.08) 22%,transparent 40%);animation:igs-rm-sense-pulse 4.8s ease-in-out infinite alternate;}
#igs-stage-motion .igs-rm-front[data-igs-rm-sense="ear"][data-igs-rm-ear="r"] .igs-rm-sense{background:linear-gradient(270deg,rgba(255,186,204,.3),rgba(255,186,204,.08) 22%,transparent 40%);}
#igs-stage-motion[data-igs-rm-tone="moon"] .igs-rm-front[data-igs-rm-sense="ear"] .igs-rm-sense{background:linear-gradient(90deg,rgba(196,186,255,.28),transparent 40%);}
#igs-stage-motion[data-igs-rm-tone="moon"] .igs-rm-front[data-igs-rm-sense="ear"][data-igs-rm-ear="r"] .igs-rm-sense{background:linear-gradient(270deg,rgba(196,186,255,.28),transparent 40%);}
#igs-stage-motion .igs-rm-front[data-igs-rm-sense="touch"] .igs-rm-sense{background:radial-gradient(ellipse 72% 66% at 50% 46%,transparent 60%,rgba(255,200,214,.2) 100%);}
#igs-stage-motion .igs-rm-sense::after{content:"";position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse 72% 66% at 50% 46%,transparent 58%,rgba(255,214,226,.42) 66%,transparent 74%);}
#igs-stage-motion .igs-rm-sense[data-igs-rm-ripple]::after{animation:igs-rm-ripple 2.2s ease-out both;}
#igs-stage-motion .igs-rm-front[data-igs-rm-sense="heat"] .igs-rm-sense{background:radial-gradient(ellipse 72% 66% at 50% 46%,transparent 50%,rgba(255,112,64,.26) 100%);animation:igs-rm-sense-pulse 5.6s ease-in-out infinite alternate;}
#igs-stage-motion .igs-rm-front[data-igs-rm-sense="cool"] .igs-rm-sense{background:radial-gradient(ellipse 72% 66% at 50% 46%,transparent 50%,rgba(112,164,255,.24) 100%);}
#igs-stage-motion .igs-rm-front[data-igs-rm-sense="scent"] .igs-rm-sense{inset:-20%;}
#igs-stage-motion .igs-rm-front[data-igs-rm-sense="scent"] .igs-rm-sense{background:linear-gradient(115deg,transparent 30%,rgba(255,196,226,.15) 44%,rgba(214,190,255,.13) 56%,transparent 70%);animation:igs-rm-scent 14s ease-in-out infinite alternate;}
#igs-stage-motion[data-igs-rm-asset] .igs-rm-front[data-igs-rm-sense="scent"] .igs-rm-sense{-webkit-mask-image:radial-gradient(ellipse 60% 56% at 50% 46%,transparent 46%,#000 92%);mask-image:radial-gradient(ellipse 60% 56% at 50% 46%,transparent 46%,#000 92%);}
#igs-stage-motion .igs-rm-front>.igs-rm-sweep{inset:-50% 0;transition:none;background:linear-gradient(180deg,transparent 0%,transparent 38%,rgba(255,238,230,.22) 50%,transparent 62%,transparent 100%);}
#igs-stage-motion[data-igs-rm-asset] .igs-rm-sweep{-webkit-mask-image:linear-gradient(90deg,#000,rgba(0,0,0,.3) 30%,rgba(0,0,0,.3) 70%,#000);mask-image:linear-gradient(90deg,#000,rgba(0,0,0,.3) 30%,rgba(0,0,0,.3) 70%,#000);}
#igs-stage-motion .igs-rm-sweep[data-igs-rm-sweep]{visibility:visible;animation:igs-rm-sweep 1.7s cubic-bezier(.45,.05,.4,1) both;}
#igs-overlay[data-igs-rm-sense="daze"] #igs-text{letter-spacing:.08em;}
#igs-overlay #igs-stage-motion[data-igs-cgp="1"] #igs-bg{animation:igs-cgp-1 var(--igs-cgp-dur,26s) ease-in-out 0s var(--igs-cgp-iter,infinite) alternate both!important;}
#igs-overlay #igs-stage-motion[data-igs-cgp="2"] #igs-bg{animation:igs-cgp-2 var(--igs-cgp-dur,26s) ease-in-out 0s var(--igs-cgp-iter,infinite) alternate both!important;}
#igs-overlay #igs-stage-motion[data-igs-cgp][data-igs-cgp-hold] #igs-bg{animation-play-state:paused!important;}
@keyframes igs-cgp-1{from{transform:var(--igs-cgp-a);}to{transform:var(--igs-cgp-b);}}
@keyframes igs-cgp-2{from{transform:var(--igs-cgp-a);}to{transform:var(--igs-cgp-b);}}
@keyframes igs-rm-sense-pulse{from{opacity:.6;}to{opacity:1;}}
@keyframes igs-rm-ripple{0%{opacity:0;transform:scale(1.18);}25%{opacity:.9;}100%{opacity:0;transform:scale(.94);}}
@keyframes igs-rm-scent{from{transform:translate3d(-22%,4%,0);}to{transform:translate3d(22%,-4%,0);}}
@keyframes igs-rm-sweep{0%{opacity:0;transform:translate3d(0,-34%,0);}20%{opacity:1;}100%{opacity:0;transform:translate3d(0,34%,0);}}
@media (prefers-reduced-motion: reduce){
#igs-stage-motion .igs-rm-sense,#igs-stage-motion .igs-rm-sense::after,#igs-stage-motion .igs-rm-sweep[data-igs-rm-sweep]{animation:none!important;}
#igs-overlay #igs-stage-motion[data-igs-cgp] #igs-bg{animation:none!important;}
}
`;
