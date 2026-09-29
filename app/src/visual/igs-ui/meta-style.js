// Meta 互动样式：热区与气泡挂在 #igs-fx-front。戳头的压扁只在 data-igs-meta-poke 期间把立绘 scale 拆成横纵两值，
// 基数沿用 stage-direction-style 的合成式（特写 × 逼近，上限 1.3），不影响平时的 scale / translate。
const BASE_SCALE = 'min(1.3,calc(var(--igs-sd-closeup-scale,1) * var(--igs-rm-scale,1)))';

export const META_STYLE_TEXT = `
#igs-stage-motion .igs-meta-hot{position:absolute;border-radius:50%;pointer-events:auto;cursor:pointer;background:transparent;-webkit-tap-highlight-color:transparent;}
#igs-stage-motion .igs-meta-hot.is-spent{pointer-events:none;cursor:default;}
#igs-overlay #igs-stage-motion[data-igs-meta-poke] #igs-sprite:not(.igs-sprite-editing){scale:calc(${BASE_SCALE} * var(--igs-meta-sx,1)) calc(${BASE_SCALE} * var(--igs-meta-sy,1));}
#igs-overlay #igs-stage-motion[data-igs-meta-poke="in"] #igs-sprite:not(.igs-sprite-editing){transition:scale .11s ease-out,translate 1.2s cubic-bezier(.3,.7,.2,1);}
#igs-overlay #igs-stage-motion[data-igs-meta-poke="out"] #igs-sprite:not(.igs-sprite-editing){transition:scale .3s cubic-bezier(.34,1.8,.64,1),translate 1.2s cubic-bezier(.3,.7,.2,1);}
#igs-stage-motion .igs-meta-bubble{position:absolute;transform:translate(-50%,-100%);max-width:min(260px,70%);padding:6px 14px;border-radius:14px;font-size:14px;line-height:1.45;color:#3a2a33;background:rgba(255,252,250,.94);box-shadow:0 4px 14px rgba(0,0,0,.22);pointer-events:none;white-space:pre-wrap;text-align:center;animation:igs-meta-bubble 2.4s ease both;}
#igs-stage-motion .igs-meta-bubble::after{content:"";position:absolute;left:50%;bottom:-6px;margin-left:-6px;border:6px solid transparent;border-bottom:0;border-top-color:rgba(255,252,250,.94);}
#igs-stage-motion .igs-meta-bubble.is-angry{color:#fff;background:rgba(214,72,72,.92);}
#igs-stage-motion .igs-meta-bubble.is-angry::after{border-top-color:rgba(214,72,72,.92);}
#igs-stage-motion .igs-meta-symbol{pointer-events:none;}
@keyframes igs-meta-bubble{0%{opacity:0;transform:translate(-50%,-88%) scale(.9);}10%,84%{opacity:1;transform:translate(-50%,-100%) scale(1);}100%{opacity:0;transform:translate(-50%,-108%);}}
@media (prefers-reduced-motion: reduce){
#igs-stage-motion .igs-meta-bubble{animation:igs-meta-fade 2.4s linear both;}
@keyframes igs-meta-fade{0%,100%{opacity:0;}8%,88%{opacity:1;}}
}
`;
