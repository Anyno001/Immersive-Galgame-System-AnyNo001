// 神话妖魔包的演出样式。落点与尺寸取舞台百分比；终态即静止态，减少动态效果时去掉全部动画即可。装饰用实色。
export const MYTH_STYLE_TEXT = `
#igs-overlay .igs-myth{animation:igs-myth-fade var(--igs-dfx-life) ease both;--myth-c:#e8c875;--myth-d:#1a1208;--myth-l:#fff3cf;--myth-g:var(--myth-c);}
#igs-overlay .igs-myth.is-azure,#igs-overlay .igs-myth .is-azure{--myth-c:#8cd2f0;--myth-d:#08202e;--myth-l:#e4f6ff;}
#igs-overlay .igs-myth.is-crimson{--myth-c:#f08a78;--myth-d:#2a0c08;--myth-l:#ffe2dc;}
#igs-overlay .igs-myth.is-violet{--myth-c:#bfa2f0;--myth-d:#150a2a;--myth-l:#efe6ff;}
#igs-overlay .igs-myth.is-silver{--myth-c:#dfe6ee;--myth-d:#10151c;--myth-l:#ffffff;}
#igs-overlay .igs-myth.is-jade{--myth-c:#7fd9b0;--myth-d:#06201a;--myth-l:#e2fff2;}
#igs-overlay .igs-myth.is-reduced,#igs-overlay .igs-myth.is-reduced *{animation:none!important;}
#igs-overlay .igs-myth.is-reduced .igs-myth-bolt{opacity:1;}
#igs-overlay .igs-myth.is-reduced .igs-myth-dark{opacity:.16;}
#igs-overlay .igs-myth.is-reduced :is(.igs-myth-ring,.igs-myth-spark,.igs-myth-flash,.igs-myth-ray,.igs-myth-soul,.igs-myth-pulse){display:none;}
#igs-overlay .igs-myth.is-reduced .igs-myth-rise{display:none;}
#igs-overlay .igs-myth.is-reduced .igs-myth-sheet{opacity:var(--lo);transform:none;}
#igs-overlay .igs-myth.is-reduced .igs-myth-halo{display:none;}
#igs-overlay .igs-myth.is-reduced .igs-myth-gglow{opacity:.2;transform:translate(-50%,50%);}
#igs-overlay .igs-myth.is-reduced .igs-myth-cone{opacity:.2;transform:translateX(-50%);}
#igs-overlay .igs-myth.is-reduced .igs-myth-corner{opacity:.3;}
#igs-overlay .igs-myth.is-reduced .igs-myth-band{opacity:.25;transform:translate(-50%,-50%);}
#igs-overlay .igs-myth.is-reduced .igs-myth-edge{opacity:.4;}
#igs-overlay .igs-myth.is-reduced .igs-myth-dometint{opacity:.1;}
@keyframes igs-myth-fade{0%{opacity:0}5%{opacity:1}86%{opacity:1}100%{opacity:0}}
#igs-overlay .igs-myth i,#igs-overlay .igs-myth svg,#igs-overlay .igs-myth-name{position:absolute;display:block;}
#igs-overlay .igs-myth svg{inset:0;width:100%;height:100%;overflow:visible;}

/* 共用：光环、火花、闪白、名称小字 */
#igs-overlay .igs-myth-ring{left:var(--x,50%);top:var(--y,40%);width:9%;aspect-ratio:1;border-radius:50%;border:1px solid var(--myth-c);transform:translate(-50%,-50%) scale(.7);opacity:0;animation:igs-myth-ring 1.4s ease-out .9s both;}
#igs-overlay .igs-myth-ring.is-b{animation-delay:1.2s;}
#igs-overlay .igs-myth-ring.is-hit{animation-delay:.62s;width:12%;border-color:var(--myth-l);}
@keyframes igs-myth-ring{0%{opacity:.8;transform:translate(-50%,-50%) scale(.7)}100%{opacity:0;transform:translate(-50%,-50%) scale(3.4)}}
#igs-overlay .igs-myth-spark{left:var(--x,50%);top:var(--y,40%);width:3px;height:3px;border-radius:50%;background:var(--myth-l);box-shadow:0 0 6px 1px var(--myth-c);opacity:0;animation:igs-myth-spark 1100ms ease-out both;}
@keyframes igs-myth-spark{0%{opacity:1;transform:translate(-50%,-50%) rotate(var(--a)) translateY(0)}100%{opacity:0;transform:translate(-50%,-50%) rotate(var(--a)) translateY(calc(var(--d) * -1))}}
#igs-overlay .igs-myth-flash{inset:0;background:radial-gradient(ellipse at 50% 40%,var(--myth-l) 0,transparent 62%);opacity:0;animation:igs-myth-flash 800ms ease-out .62s both;}
#igs-overlay .igs-myth-flash.is-soft{animation-delay:.1s;}
@keyframes igs-myth-flash{0%{opacity:.5}100%{opacity:0}}
#igs-overlay .igs-myth-name{left:var(--x,50%);top:min(calc(var(--y,40%) + 9%),calc(var(--igs-fx-vis) - 6%));transform:translateX(-50%);white-space:nowrap;font-weight:500;font-size:14px;letter-spacing:.24em;color:var(--myth-l);text-shadow:0 0 6px var(--myth-d),0 0 2px var(--myth-d),0 1px 3px var(--myth-d);}
#igs-overlay .igs-myth-name span{display:inline-block;animation:igs-myth-char .5s ease both;}
#igs-overlay .igs-myth-name.is-low{left:50%;top:auto;bottom:calc(var(--igs-fx-safe) + 12px);}
#igs-overlay .igs-myth-name.is-tag{transform:translate(-50%,-50%);font-size:.95em;}
@keyframes igs-myth-char{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
#igs-overlay .igs-myth-tag{top:26%;font-weight:500;font-size:14px;letter-spacing:.18em;color:var(--myth-l);text-shadow:0 0 6px var(--myth-d),0 1px 3px var(--myth-d);animation:igs-myth-char .6s ease .1s both;}
#igs-overlay .igs-myth-tag.is-l{left:10%;}
#igs-overlay .igs-myth-tag.is-r{right:10%;}

/* 法宝：飞出、落定、光环 */
#igs-overlay .igs-myth-fly{position:absolute;inset:0;animation:igs-myth-fly 1.1s cubic-bezier(.2,.8,.25,1) both;}
@keyframes igs-myth-fly{from{opacity:0;transform:translate(var(--fdx,0),var(--fdy,0)) scale(.4)}to{opacity:1;transform:translate(0,0) scale(1)}}
#igs-overlay .igs-myth-relic-orb{left:var(--x,50%);top:var(--y,40%);width:min(9%,64px);aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,var(--myth-l) 0,var(--myth-c) 14%,transparent 66%);opacity:.9;animation:igs-myth-bob 2.4s ease-in-out 1.1s infinite alternate;}
#igs-overlay .igs-myth-relic-gem{inset:24%;border:1px solid var(--myth-l);transform:rotate(45deg);border-radius:2px;opacity:.7;}
@keyframes igs-myth-bob{from{scale:1}to{scale:1.07}}
#igs-overlay .igs-myth-clash .igs-myth-fly.is-l{animation:igs-myth-clash-l .62s cubic-bezier(.5,0,.9,.6) both;}
#igs-overlay .igs-myth-clash .igs-myth-fly.is-r{animation:igs-myth-clash-r .62s cubic-bezier(.5,0,.9,.6) both;}
#igs-overlay .igs-myth-clash .igs-myth-relic-orb{animation:none;}
#igs-overlay .igs-myth-clash .igs-myth-fly.is-l .igs-myth-relic-orb{left:44%;}
#igs-overlay .igs-myth-clash .igs-myth-fly.is-r .igs-myth-relic-orb{left:56%;}
@keyframes igs-myth-clash-l{from{transform:translate(-34%,6%) scale(.6);opacity:0}15%{opacity:1}to{transform:translate(0,0) scale(1);opacity:1}}
@keyframes igs-myth-clash-r{from{transform:translate(34%,6%) scale(.6);opacity:0}15%{opacity:1}to{transform:translate(0,0) scale(1);opacity:1}}
#igs-overlay .igs-myth-ray{left:50%;top:40%;width:1px;height:12%;background:linear-gradient(180deg,var(--myth-l),transparent);transform-origin:50% 0;transform:rotate(var(--a)) translateY(2%);opacity:0;animation:igs-myth-ray 600ms ease-out .62s both;}
@keyframes igs-myth-ray{0%{opacity:1;transform:rotate(var(--a)) translateY(2%) scaleY(.3)}100%{opacity:0;transform:rotate(var(--a)) translateY(60%) scaleY(1.3)}}

/* 封神榜：侧边细线名录，不压人物 */
#igs-overlay .igs-myth-mythroll{display:block;}
#igs-overlay .igs-myth-roll-board{position:absolute;right:max(16px,4%);top:12%;min-width:96px;padding:6px 4px 6px 16px;border-left:1px solid var(--myth-c);background:linear-gradient(90deg,rgba(14,10,6,.46),transparent);color:var(--myth-c);animation:igs-myth-unroll .8s ease-out both;}
@keyframes igs-myth-unroll{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
#igs-overlay .igs-myth-roll-title{font-weight:500;font-size:14px;letter-spacing:.5em;padding-bottom:6px;margin-bottom:4px;border-bottom:1px solid rgba(232,200,117,.4);color:var(--myth-l);}
#igs-overlay .igs-myth-roll-row{position:relative;height:28px;display:flex;align-items:center;justify-content:flex-start;}
#igs-overlay .igs-myth-roll-row b{font-weight:400;letter-spacing:.3em;font-size:14px;color:var(--myth-l);text-shadow:0 0 6px var(--myth-c),0 1px 3px var(--myth-d);animation:igs-myth-light .6s ease var(--delay) both;}
@keyframes igs-myth-light{from{color:rgba(255,243,207,.4);text-shadow:none}to{color:var(--myth-l);text-shadow:0 0 6px var(--myth-c),0 1px 3px var(--myth-d)}}
#igs-overlay .igs-myth-soul{right:0;top:50%;width:3px;height:3px;margin-top:-1px;border-radius:50%;background:var(--myth-l);box-shadow:0 0 6px 1px var(--myth-c);opacity:0;animation:igs-myth-soul 1.2s ease-in var(--delay) both;}
@keyframes igs-myth-soul{0%{opacity:0;transform:translate(0,0)}20%{opacity:.9}85%{opacity:.9}100%{opacity:0;transform:translate(-12px,calc(var(--dy) * -.5))}}

/* 封印共用：光色降饱和后的 --myth-g；地面光、升光、阵眼、边缘光都是预先画好的柔边渐变，只动 transform 与 opacity，一次性 */
@supports (color: color-mix(in srgb, red 50%, blue)) {
#igs-overlay .igs-myth{--myth-g:color-mix(in srgb,var(--myth-c) 70%,#fff4e0);}
#igs-overlay .igs-myth.is-crimson{--myth-g:color-mix(in srgb,var(--myth-c) 55%,#fff4e0);}
#igs-overlay .igs-myth-barrier{--myth-g:color-mix(in srgb,var(--myth-c) 70%,#eaf6ff);}
}
#igs-overlay .igs-myth-gglow{left:var(--x,50%);bottom:0;width:46%;height:10%;transform:translate(-50%,50%) scaleX(.2);background:radial-gradient(ellipse closest-side,var(--myth-l) 0,var(--myth-c) 40%,transparent 100%);mix-blend-mode:screen;opacity:0;animation:igs-myth-gglow 2.4s ease-out var(--d,0ms) both;}
@keyframes igs-myth-gglow{0%{opacity:0;transform:translate(-50%,50%) scaleX(.2)}30%{opacity:.25;transform:translate(-50%,50%) scaleX(1)}60%{opacity:.18;transform:translate(-50%,50%) scaleX(1.04)}80%{opacity:.24;transform:translate(-50%,50%) scaleX(1)}100%{opacity:.2;transform:translate(-50%,50%) scaleX(1)}}
@keyframes igs-myth-lofade{from{opacity:0}to{opacity:var(--lo,.26)}}
#igs-overlay .igs-myth-rise{left:var(--x,50%);bottom:0;width:30%;height:46%;transform:translate(-50%,20%) scaleY(.4);transform-origin:50% 100%;background:radial-gradient(ellipse 50% 100% at 50% 100%,var(--myth-l) 0,var(--myth-g) 40%,transparent 100%);mix-blend-mode:screen;opacity:0;animation:igs-myth-rise 1.4s ease-out var(--d,0ms) both;}
#igs-overlay .igs-myth-rise.is-dome{width:64%;height:auto;top:15%;background:radial-gradient(ellipse 50% 100% at 50% 100%,var(--myth-l) 0,var(--myth-g) 30%,transparent 100%);}
@keyframes igs-myth-rise{0%{opacity:0;transform:translate(-50%,20%) scaleY(.4)}45%{opacity:.22;transform:translate(-50%,0) scaleY(1)}100%{opacity:.14;transform:translate(-50%,0) scaleY(1)}}
#igs-overlay .igs-myth-tint{inset:0;background:var(--myth-d);mix-blend-mode:multiply;opacity:.2;animation:igs-myth-tint 1.2s ease both;}
@keyframes igs-myth-tint{from{opacity:0}to{opacity:.2}}

/* 法阵：地面是一张透视平面（单层遮罩：四周与远端渐隐），上面三层宽大柔边的光幕相互交错、缓慢流动；近处宽亮，远处窄暗扁 */
#igs-overlay .igs-myth-ground{position:absolute;--aur:var(--myth-c);--aur2:var(--myth-c);left:50%;bottom:0;width:130%;height:64%;transform-origin:50% 100%;transform:translateX(-50%) perspective(1600px) rotateX(40deg);mix-blend-mode:screen;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 8%,#000 100%),linear-gradient(90deg,#000 0,#000 34%,rgba(0,0,0,.44) 41%,rgba(0,0,0,.44) 59%,#000 66%,#000 100%);-webkit-mask-composite:source-in;mask-image:linear-gradient(180deg,transparent 0,#000 8%,#000 100%),linear-gradient(90deg,#000 0,#000 34%,rgba(0,0,0,.44) 41%,rgba(0,0,0,.44) 59%,#000 66%,#000 100%);mask-composite:intersect;animation:igs-myth-breathe 1.6s ease-in-out var(--bd,1500ms) both;}
@supports (color: color-mix(in srgb, red 50%, blue)) {
#igs-overlay .igs-myth-ground{--aur2:color-mix(in srgb,var(--myth-c) 55%,#fff4e0);}
}
@keyframes igs-myth-breathe{0%{opacity:1}50%{opacity:.7}100%{opacity:1}}
#igs-overlay .igs-myth-sheet{inset:0;opacity:0;transform:scale(.5);animation:igs-myth-sheet-on 1.1s ease-out var(--ld,0ms) forwards,igs-myth-sheet-flow 3.6s ease-in-out var(--ld,0ms) forwards;}
#igs-overlay .igs-myth-sheet:nth-child(2){--aur:var(--aur2);}
@keyframes igs-myth-sheet-on{from{opacity:0;transform:scale(.5)}to{opacity:var(--lo);transform:scale(1)}}
@keyframes igs-myth-sheet-flow{from{translate:0 0;rotate:0deg}to{translate:var(--dx,0%) var(--dy,0%);rotate:var(--rt,0deg)}}
#igs-overlay .is-ring .igs-myth-sheet:nth-child(1){background:radial-gradient(ellipse 46% 46% at 50% 50%,transparent 66%,var(--aur) 80%,var(--myth-l) 86%,var(--aur) 92%,transparent 100%);}
#igs-overlay .is-ring .igs-myth-sheet:nth-child(2){background:radial-gradient(ellipse 46% 30% at 34% 56%,transparent 66%,var(--aur) 80%,var(--myth-l) 86%,var(--aur) 92%,transparent 100%),radial-gradient(ellipse 46% 30% at 66% 44%,transparent 66%,var(--aur) 80%,var(--myth-l) 86%,var(--aur) 92%,transparent 100%);}
#igs-overlay .is-ring .igs-myth-sheet:nth-child(3){background:radial-gradient(ellipse 28% 28% at 50% 50%,transparent 66%,var(--aur) 80%,var(--myth-l) 86%,var(--aur) 92%,transparent 100%),linear-gradient(0deg,transparent 56%,var(--aur) 65%,var(--myth-l) 70%,var(--aur) 75%,transparent 84%);}
#igs-overlay .is-bagua .igs-myth-sheet:nth-child(1){background:radial-gradient(ellipse 46% 46% at 50% 50%,transparent 66%,var(--aur) 80%,var(--myth-l) 86%,var(--aur) 92%,transparent 100%);}
#igs-overlay .is-bagua .igs-myth-sheet:nth-child(2){background:linear-gradient(0deg,transparent 36%,var(--aur) 45%,var(--myth-l) 50%,var(--aur) 55%,transparent 64%),linear-gradient(90deg,transparent 36%,var(--aur) 45%,var(--myth-l) 50%,var(--aur) 55%,transparent 64%),linear-gradient(45deg,transparent 36%,var(--aur) 45%,var(--myth-l) 50%,var(--aur) 55%,transparent 64%),linear-gradient(-45deg,transparent 36%,var(--aur) 45%,var(--myth-l) 50%,var(--aur) 55%,transparent 64%);}
#igs-overlay .is-bagua .igs-myth-sheet:nth-child(3){background:radial-gradient(ellipse 26% 26% at 50% 50%,transparent 66%,var(--aur) 80%,var(--myth-l) 86%,var(--aur) 92%,transparent 100%),radial-gradient(ellipse closest-side,var(--myth-l) 0,var(--aur) 18%,transparent 36%);}
#igs-overlay .is-qixing .igs-myth-sheet:nth-child(1){background:radial-gradient(ellipse 36% 30% at 18% 66%,transparent 66%,var(--aur) 80%,var(--myth-l) 86%,var(--aur) 92%,transparent 100%),radial-gradient(ellipse 36% 30% at 82% 34%,transparent 66%,var(--aur) 80%,var(--myth-l) 86%,var(--aur) 92%,transparent 100%);}
#igs-overlay .is-qixing .igs-myth-sheet:nth-child(2){background:radial-gradient(ellipse 40% 26% at 50% 50%,transparent 66%,var(--aur) 80%,var(--myth-l) 86%,var(--aur) 92%,transparent 100%);}
#igs-overlay .is-qixing .igs-myth-sheet:nth-child(3){background:linear-gradient(-28deg,transparent 31%,var(--aur) 40%,var(--myth-l) 45%,var(--aur) 50%,transparent 59%),linear-gradient(24deg,transparent 46%,var(--aur) 55%,var(--myth-l) 60%,var(--aur) 65%,transparent 74%);}
#igs-overlay .is-square .igs-myth-sheet:nth-child(1){background:linear-gradient(0deg,transparent 8%,var(--aur) 17%,var(--myth-l) 22%,var(--aur) 27%,transparent 36%),linear-gradient(0deg,transparent 36%,var(--aur) 45%,var(--myth-l) 50%,var(--aur) 55%,transparent 64%),linear-gradient(0deg,transparent 64%,var(--aur) 73%,var(--myth-l) 78%,var(--aur) 83%,transparent 92%);}
#igs-overlay .is-square .igs-myth-sheet:nth-child(2){background:linear-gradient(90deg,transparent 8%,var(--aur) 17%,var(--myth-l) 22%,var(--aur) 27%,transparent 36%),linear-gradient(90deg,transparent 36%,var(--aur) 45%,var(--myth-l) 50%,var(--aur) 55%,transparent 64%),linear-gradient(90deg,transparent 64%,var(--aur) 73%,var(--myth-l) 78%,var(--aur) 83%,transparent 92%);}
#igs-overlay .is-square .igs-myth-sheet:nth-child(3){background:linear-gradient(45deg,transparent 36%,var(--aur) 45%,var(--myth-l) 50%,var(--aur) 55%,transparent 64%),linear-gradient(-45deg,transparent 36%,var(--aur) 45%,var(--myth-l) 50%,var(--aur) 55%,transparent 64%);}
#igs-overlay .igs-myth-halo{left:50%;top:calc(var(--igs-fx-vis) * .4);width:80%;height:calc(var(--igs-fx-vis) * .6);transform:translate(-50%,0) scaleY(.5);transform-origin:50% 100%;background:radial-gradient(ellipse 50% 100% at 50% 100%,var(--myth-g) 0,transparent 100%);mix-blend-mode:screen;opacity:0;animation:igs-myth-halo 1.6s ease-out .8s forwards;}
@keyframes igs-myth-halo{from{opacity:0;transform:translate(-50%,0) scaleY(.5)}to{opacity:.14;transform:translate(-50%,0) scaleY(1)}}
#igs-overlay .igs-myth-formation.is-break .igs-myth-ground{animation:none;}
#igs-overlay .igs-myth-formation.is-break .igs-myth-sheet{animation:igs-myth-sheet-on .3s ease-out var(--ld,0ms) forwards,igs-myth-sheet-off .6s ease-in var(--od,900ms) forwards;}
@keyframes igs-myth-sheet-off{0%{opacity:var(--lo)}30%{opacity:calc(var(--lo) * .25)}60%{opacity:calc(var(--lo) * .8)}100%{opacity:0}}
#igs-overlay .igs-myth-formation .igs-myth-flash.is-soft{animation-delay:var(--fd,2.1s);}

/* 结界：升光到顶后，两侧边缘出极淡冷光，穹顶区域一层冷色调 */
#igs-overlay .igs-myth-edge{top:0;bottom:0;width:9%;mix-blend-mode:screen;opacity:0;animation:igs-myth-edge 1.2s ease-out 1.1s both;}
#igs-overlay .igs-myth-edge.is-l{left:0;background:linear-gradient(90deg,var(--myth-l) 0,var(--myth-g) 35%,transparent 100%);}
#igs-overlay .igs-myth-edge.is-r{right:0;background:linear-gradient(270deg,var(--myth-l) 0,var(--myth-g) 35%,transparent 100%);}
@keyframes igs-myth-edge{from{opacity:0}to{opacity:.6}}
#igs-overlay .igs-myth-dometint{inset:0;background:radial-gradient(ellipse at 50% 18%,var(--myth-g) 0,transparent 75%);mix-blend-mode:screen;opacity:0;animation:igs-myth-dome-in 1.2s ease-out 1s both;}
@keyframes igs-myth-dome-in{from{opacity:0}to{opacity:.12}}
#igs-overlay .igs-myth-barrier.is-break .igs-myth-edge{animation:igs-myth-edge-break 1.6s ease-out both;}
#igs-overlay .igs-myth-barrier.is-break .igs-myth-dometint{animation:igs-myth-dome-break 1.6s ease-out both;}
#igs-overlay .igs-myth-barrier.is-break .igs-myth-flash.is-soft{animation-delay:1s;}
@keyframes igs-myth-edge-break{0%{opacity:.3}12%{opacity:.7}28%{opacity:.15}42%{opacity:.7}58%{opacity:.15}100%{opacity:0}}
@keyframes igs-myth-dome-break{0%{opacity:.1}12%{opacity:.16}28%{opacity:.04}42%{opacity:.16}58%{opacity:.04}100%{opacity:0}}

/* 三昧真火：柔光火舌 */
#igs-overlay .igs-myth-glow{left:var(--x);top:50%;width:46%;height:70%;transform:translate(-50%,-50%);background:radial-gradient(ellipse,rgba(255,150,70,.5) 0,transparent 70%);opacity:.3;animation:igs-myth-glow 2s ease-in-out infinite alternate;}
@keyframes igs-myth-glow{from{opacity:.2}to{opacity:.38}}
#igs-overlay .igs-myth-fire{position:absolute;inset:0;}
#igs-overlay .igs-myth-tongue{left:calc(var(--x) + var(--dx));bottom:calc(100% - var(--base));width:var(--w);height:calc(var(--h) * .8);transform:translateX(-50%);transform-origin:50% 100%;border-radius:50% 50% 50% 50% / 70% 70% 30% 30%;background:linear-gradient(0deg,rgba(255,226,150,.55) 0%,rgba(255,150,60,.34) 45%,rgba(255,100,40,0) 100%);animation:igs-myth-lick 1.6s ease-in-out infinite alternate,igs-myth-ignite .9s ease-out both;}
#igs-overlay .igs-myth-tongue:nth-child(2n){animation-duration:1.3s,.9s;}
@keyframes igs-myth-lick{from{scale:1 .9}to{scale:1.06 1.05}}
@keyframes igs-myth-ignite{from{opacity:0;transform:translateX(-50%) scaleY(.1)}to{opacity:1;transform:translateX(-50%) scaleY(1)}}
#igs-overlay .igs-myth-ember{left:calc(var(--x) + var(--dx));bottom:calc(100% - var(--base) + 8%);width:3px;height:3px;border-radius:50%;background:#ffe0a0;box-shadow:0 0 5px 1px rgba(255,170,80,.8);opacity:0;animation:igs-myth-ember 2.2s ease-out infinite;}
@keyframes igs-myth-ember{0%{opacity:0;transform:translateY(0)}20%{opacity:.9}100%{opacity:0;transform:translateY(calc(var(--rise) * -6px))}}
#igs-overlay .igs-myth-flame.is-reduced .igs-myth-ember{display:none;}

/* 天雷：细闪电 */
#igs-overlay .igs-myth-dark{inset:0;background:#080818;opacity:.3;animation:igs-myth-dark 1.9s ease both;}
@keyframes igs-myth-dark{0%{opacity:0}8%{opacity:.34}60%{opacity:.28}100%{opacity:0}}
#igs-overlay .igs-myth-cloud{left:0;right:0;top:0;height:20%;background:linear-gradient(180deg,rgba(20,20,46,.7) 0%,transparent 100%);animation:igs-myth-dark 1.9s ease both;}
#igs-overlay .igs-myth-bolt{fill:none;stroke:#f4f0ff;stroke-width:1.5px;stroke-linejoin:round;vector-effect:non-scaling-stroke;opacity:0;animation:igs-myth-bolt 700ms steps(1,end) .14s both;}
#igs-overlay .igs-myth-bolt.is-glow{stroke:#b9a6ff;stroke-width:5px;opacity:.5;}
#igs-overlay .igs-myth-bolt.is-fork{stroke-width:1px;}
@keyframes igs-myth-bolt{0%{opacity:1}25%{opacity:0}40%{opacity:1}60%{opacity:.7}100%{opacity:0}}
#igs-overlay .igs-myth-thunder .igs-myth-flash{animation-delay:.14s;opacity:0;}
#igs-overlay .igs-myth-thunder .igs-myth-ring.is-hit{animation-delay:.14s;width:10%;}
#igs-overlay .igs-myth-scorch{left:var(--x);top:var(--y);width:12%;height:4%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(ellipse,rgba(26,18,38,.5),transparent 70%);opacity:0;animation:igs-myth-scorch 1.8s ease-out .2s both;}
@keyframes igs-myth-scorch{0%{opacity:.7;scale:.4}100%{opacity:0;scale:1.4}}

/* 妖气、魅惑：雾与细丝，不画眼 */
#igs-overlay .igs-myth-wisp{width:1.6%;height:26%;top:var(--top);transform:translate(-50%,-100%);border-radius:50% 50% 0 0;background:linear-gradient(0deg,var(--wisp,#8a5cc0),transparent);opacity:0;animation:igs-myth-wisp 3s ease-out infinite;}
#igs-overlay .igs-myth-aura.is-mo{--wisp:#c0384a;}
#igs-overlay .igs-myth-aura.is-xian{--wisp:#e4f6ff;}
@keyframes igs-myth-wisp{0%{opacity:0;transform:translate(-50%,-70%)}30%{opacity:.5}100%{opacity:0;transform:translate(-50%,-150%)}}
#igs-overlay .igs-myth-aura .igs-myth-name{color:#e4d2ff;}
#igs-overlay .igs-myth-aura.is-xian .igs-myth-name{color:#ffffff;}
#igs-overlay .igs-myth-swirl{aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;border:1px solid rgba(255,150,196,.7);border-top-color:transparent;border-left-color:transparent;animation:igs-myth-swirl 4s linear infinite;}
#igs-overlay .igs-myth-swirl.is-b{width:75%!important;border-color:rgba(255,190,214,.6);border-bottom-color:transparent;border-right-color:transparent;animation-direction:reverse;}
@keyframes igs-myth-swirl{to{transform:translate(-50%,-50%) rotate(360deg)}}

/* 吸取精气 */
#igs-overlay .igs-myth-drain .igs-link.is-line{stroke-dasharray:.05 .07;animation:igs-myth-flow 1.4s linear infinite;stroke-width:1px;opacity:.7;}
@keyframes igs-myth-flow{from{stroke-dashoffset:0}to{stroke-dashoffset:-.12}}
#igs-overlay .igs-myth-mote{position:absolute;inset:0;opacity:0;animation:igs-myth-mote 1.8s ease-in infinite;}
#igs-overlay .igs-myth-mote i{width:4px;height:4px;border-radius:50%;background:#e4f6ff;box-shadow:0 0 6px 1px #8cd2f0;transform:translate(-50%,-50%);}
@keyframes igs-myth-mote{0%{opacity:0;transform:translate(0,0)}15%{opacity:.9}85%{opacity:.9}100%{opacity:0;transform:translate(var(--dx),var(--dy))}}
#igs-overlay .igs-myth-gain{aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;border:1px solid #bfe6ff;opacity:0;animation:igs-myth-gain 1.6s ease-out 1.2s infinite;}
@keyframes igs-myth-gain{0%{opacity:.7;scale:.6}100%{opacity:0;scale:1.6}}

/* 降妖：光起、压制、收尾、字卡。符纸是本批唯一的道具图形，按漫画符号画法：墨线加白外描边、纸面暖黄不透明、朱砂字 */
#igs-overlay .igs-myth-throw{position:absolute;inset:0;animation:igs-myth-throw .45s cubic-bezier(.2,.7,.3,1) both;}
#igs-overlay .igs-myth-throw.is-from-l{--tx0:-70%;--r0:-24deg;}
#igs-overlay .igs-myth-throw.is-from-r{--tx0:70%;--r0:24deg;}
@keyframes igs-myth-throw{from{opacity:0;transform:translate(var(--tx0),-8%) rotate(var(--r0))}to{opacity:1;transform:none}}
#igs-overlay .igs-myth-slip{position:absolute;left:var(--sx);top:var(--cy);width:max(34px,4.2%);aspect-ratio:1/2.6;box-sizing:border-box;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;border:2px solid #2b1a10;border-radius:2px;background:#f0d27a;box-shadow:0 0 0 2px #fff;color:#b3261e;font-weight:400;font-size:15px;}
#igs-overlay .igs-myth-slip b{font-weight:400;}
#igs-overlay .igs-myth-cone{left:var(--x);top:0;width:100%;height:calc(var(--igs-fx-vis) * .8);transform:translateX(-50%) scaleY(.2);transform-origin:50% 0;background:conic-gradient(from 150deg at 50% 0,transparent 0deg,var(--myth-g) 14deg,var(--myth-l) 30deg,var(--myth-g) 46deg,transparent 60deg,transparent 360deg);-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 30%,#000 62%,transparent 100%);mask-image:linear-gradient(180deg,transparent 0,#000 30%,#000 62%,transparent 100%);mix-blend-mode:screen;opacity:0;animation:igs-myth-cone .9s ease-out var(--d,0ms) both;}
@keyframes igs-myth-cone{from{opacity:0;transform:translateX(-50%) scaleY(.2)}55%{opacity:.25;transform:translateX(-50%) scaleY(1)}to{opacity:.2;transform:translateX(-50%) scaleY(1)}}
#igs-overlay .igs-myth-corner{top:-10%;width:56%;aspect-ratio:1;background:radial-gradient(circle closest-side,var(--myth-l) 0,var(--myth-g) 38%,transparent 100%);mix-blend-mode:screen;opacity:0;animation:igs-myth-corner 1s ease-out both;}
#igs-overlay .igs-myth-corner.is-l{left:-14%;}
#igs-overlay .igs-myth-corner.is-r{right:-14%;}
@keyframes igs-myth-corner{from{opacity:0;transform:scale(.5)}40%{opacity:.4;transform:scale(1)}to{opacity:.34;transform:scale(1.04)}}
#igs-overlay .igs-myth-band{left:var(--x);width:34%;height:1.2%;transform:translate(-50%,-50%) scaleX(1.6);background:radial-gradient(ellipse closest-side,var(--myth-l) 0,var(--myth-g) 40%,transparent 100%);mix-blend-mode:screen;opacity:0;animation:igs-myth-band .3s ease-out var(--d,0ms) both;}
@keyframes igs-myth-band{from{opacity:0;transform:translate(-50%,-50%) scaleX(1.6)}to{opacity:.25;transform:translate(-50%,-50%) scaleX(1)}}
#igs-overlay .igs-myth-subdue.is-chain .igs-myth-flash{animation-delay:.78s;}
#igs-overlay .igs-myth-name.is-seal{font-size:22px;}
#igs-overlay .igs-myth-name.is-seal.is-by-slip{left:var(--sx);top:calc(var(--cy) + 11%);}
#igs-overlay .igs-myth-sym{width:var(--igs-myth-sw,8%);height:auto;aspect-ratio:1/1;margin:0;translate:-50% -50%;}
#igs-overlay .igs-myth-sym[data-kind="gloom"]{--igs-fx-hue:#56637a;--igs-fx-c:#56637a;--igs-fx-ink:#1d2330;}

/* 妖丹：一点柔光 */
#igs-overlay .igs-myth-core{position:absolute;left:50%;top:38%;width:0;height:0;}
#igs-overlay .igs-myth-core-body{left:-5vmin;top:-5vmin;width:10vmin;height:10vmin;border-radius:50%;background:radial-gradient(circle,var(--myth-l) 0,var(--myth-c) 16%,transparent 66%);animation:igs-myth-beat 1.6s ease-in-out infinite;}
@keyframes igs-myth-beat{0%,100%{scale:1}30%{scale:1.08}60%{scale:1}}
#igs-overlay .igs-myth-core-ring{left:-5vmin;top:-5vmin;width:10vmin;height:10vmin;border-radius:50%;border:1px solid var(--myth-c);opacity:0;animation:igs-myth-core-ring 2.6s ease-out infinite;}
#igs-overlay .igs-myth-core-ring.is-b{animation-delay:1.3s;}
@keyframes igs-myth-core-ring{0%{opacity:.7;scale:.9}100%{opacity:0;scale:2.6}}
#igs-overlay .igs-myth-mote-up{left:var(--dx);top:0;width:3px;height:3px;border-radius:50%;background:var(--myth-l);box-shadow:0 0 5px 1px var(--myth-c);opacity:0;animation:igs-myth-up 2.4s ease-out infinite;}
@keyframes igs-myth-up{0%{opacity:0;transform:translateY(0)}20%{opacity:.9}100%{opacity:0;transform:translateY(-12vmin)}}
#igs-overlay .igs-myth-core-label{position:absolute;left:50%;top:9vmin;transform:translateX(-50%);text-align:center;color:var(--myth-l);text-shadow:0 0 6px var(--myth-d),0 1px 3px var(--myth-d);}
#igs-overlay .igs-myth-core-label span{display:block;font-size:12px;letter-spacing:.5em;opacity:.85;}
#igs-overlay .igs-myth-core-label b{display:block;font-weight:500;font-size:14px;letter-spacing:.25em;}
#igs-overlay .igs-myth-core-label b span{display:inline-block;font-size:14px;letter-spacing:.25em;opacity:1;animation:igs-myth-char .5s ease both;}

/* 血契：漫画印记（复用终身标记的 bondsigil），暗红配色 */
#igs-overlay .igs-myth-mark{position:absolute;aspect-ratio:1/1;transform:translate(-50%,-50%);--igs-fx-c:#a8323a;--igs-fx-ink:#2a0a0c;--igs-fx-rim-c:#fff;animation:igs-myth-stamp 1.6s ease-out .3s both;}
#igs-overlay .igs-myth-mark .igs-fx-rim{stroke-width:6.5;}
#igs-overlay .igs-myth-mark.is-b{animation-delay:.55s;}
@keyframes igs-myth-stamp{0%{opacity:0;scale:1.4}37%{opacity:.85;scale:1}100%{opacity:.5;scale:1}}
#igs-overlay .igs-myth-pact .igs-myth-name{color:#ffd0c8;}
#igs-overlay .igs-myth-pact .igs-link.is-line{stroke-width:1px;animation-delay:.8s;}
#igs-overlay .igs-myth-pact .igs-links{animation:igs-myth-linkfade 3s ease both;}
@keyframes igs-myth-linkfade{0%,55%{opacity:1}100%{opacity:0}}

/* 常驻地点层 */
#igs-overlay .igs-myth-amb-sky{inset:0;background:linear-gradient(180deg,rgba(255,226,150,.2),rgba(255,236,190,.06) 40%,transparent 70%);}
#igs-overlay .igs-myth-amb-cloud{left:-20%;bottom:-6%;width:70%;height:30%;border-radius:50%;background:radial-gradient(ellipse,rgba(255,255,255,.34),transparent 70%);animation:igs-myth-drift 70s ease-in-out infinite alternate;}
#igs-overlay .igs-myth-amb-cloud.is-b{left:auto;right:-20%;bottom:-2%;width:60%;height:24%;animation-duration:90s;animation-direction:alternate-reverse;}
@keyframes igs-myth-drift{from{transform:translateX(0)}to{transform:translateX(30%)}}
#igs-overlay .igs-myth-amb-pillar{top:0;bottom:0;width:5%;background:linear-gradient(90deg,rgba(214,168,60,.32),rgba(255,226,150,.12));}
#igs-overlay .igs-myth-amb-pillar.is-l{left:0;}
#igs-overlay .igs-myth-amb-pillar.is-r{right:0;transform:scaleX(-1);}
#igs-overlay .igs-myth-amb-lantern{top:-1%;width:3.2%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,var(--lamp,#3fe0b0) 0,transparent 68%);opacity:.5;animation:igs-myth-flick 5s ease-in-out infinite alternate;}
@keyframes igs-myth-flick{from{opacity:.4}to{opacity:.7}}
#igs-overlay .igs-myth-amb-lowmist{left:0;right:0;bottom:0;height:34%;background:linear-gradient(0deg,rgba(60,40,90,.4),transparent);}
#igs-overlay .igs-myth-amb-veil{inset:0;background:radial-gradient(ellipse at 50% 55%,transparent 38%,rgba(12,4,24,.62) 100%);}
#igs-overlay .igs-dfx-amb svg.igs-myth-amb-lilies{position:absolute;left:0;bottom:0;width:100%;height:16%;}
#igs-overlay .igs-myth-amb-lilies path{fill:none;stroke:#c1121f;stroke-width:1.1px;stroke-linecap:round;vector-effect:non-scaling-stroke;}
#igs-overlay .igs-myth-amb-lilies .stem{stroke:#2c5a3a;stroke-width:1.4px;}
#igs-overlay .igs-myth-amb-redmist{left:-10%;bottom:-8%;width:120%;height:30%;background:radial-gradient(ellipse,rgba(190,20,40,.22),transparent 70%);animation:igs-myth-drift 80s ease-in-out infinite alternate;}
#igs-overlay .igs-myth-amb-dark{inset:0;background:radial-gradient(ellipse at 50% 60%,transparent 30%,rgba(6,8,10,.7) 100%);}
#igs-overlay .igs-myth-amb-stalac{left:0;right:0;top:0;height:16%;background:linear-gradient(180deg,rgba(12,14,18,.85),transparent);}
#igs-overlay .igs-myth-amb-eyes{right:14%;bottom:calc(var(--igs-fx-safe) + var(--igs-fx-vis) * .3);width:9%;height:4%;background:radial-gradient(ellipse,rgba(255,226,170,.5),transparent 70%);opacity:.4;animation:igs-myth-blink 12s ease-in-out infinite;}
@keyframes igs-myth-blink{0%,70%,100%{opacity:0}74%,86%{opacity:.6}}
#igs-overlay .igs-myth-amb-glint{left:30%;top:16%;width:3px;height:3px;border-radius:50%;background:#bfe6ff;opacity:0;animation:igs-myth-drip 4.4s ease-in infinite;}
@keyframes igs-myth-drip{0%{opacity:0;transform:translateY(0)}10%{opacity:.8}40%{opacity:.8;transform:translateY(170px)}45%,100%{opacity:0;transform:translateY(190px)}}
#igs-overlay[data-igs-quality="low"] .igs-myth-amb-cloud,#igs-overlay[data-igs-quality="low"] .igs-myth-amb-redmist,#igs-overlay[data-igs-quality="low"] .igs-myth-amb-lantern,#igs-overlay[data-igs-quality="low"] .igs-myth-amb-eyes,#igs-overlay[data-igs-quality="low"] .igs-myth-amb-glint{animation:none;}
#igs-overlay[data-igs-quality="low"] .igs-myth-glow,#igs-overlay[data-igs-quality="low"] .igs-myth-tongue,#igs-overlay[data-igs-quality="low"] .igs-myth-ember,#igs-overlay[data-igs-quality="low"] .igs-myth-core-body,#igs-overlay[data-igs-quality="low"] .igs-myth-core-ring,#igs-overlay[data-igs-quality="low"] .igs-myth-swirl{animation-iteration-count:1;}
#igs-overlay[data-igs-quality="low"] .igs-myth-relic-orb,#igs-overlay[data-igs-quality="low"] .igs-myth-wisp,#igs-overlay[data-igs-quality="low"] .igs-myth-mote,#igs-overlay[data-igs-quality="low"] .igs-myth-mote-up,#igs-overlay[data-igs-quality="low"] .igs-myth-gain,#igs-overlay[data-igs-quality="low"] .igs-myth-drain .igs-link.is-line{animation-iteration-count:1;}
#igs-overlay[data-igs-quality="low"] .igs-myth-ground{animation:none;}
#igs-overlay[data-igs-quality="low"] .igs-myth-halo{display:none;}
#igs-overlay[data-igs-quality="low"] .igs-myth-sheet{animation-name:igs-myth-lofade;transform:none;}
#igs-overlay[data-igs-quality="low"] .igs-myth-rise{display:none;}
#igs-overlay[data-igs-quality="low"] :is(.igs-myth-gglow,.igs-myth-cone,.igs-myth-corner,.igs-myth-band){animation-name:igs-myth-lofade;transform:translate(-50%,-50%);}
#igs-overlay[data-igs-quality="low"] .igs-myth-gglow{transform:translate(-50%,50%);}
#igs-overlay[data-igs-quality="low"] .igs-myth-cone{transform:translateX(-50%);}
#igs-overlay[data-igs-quality="low"] .igs-myth-corner{transform:none;}
`;
