// 日常演出样式。所有卡片的寿命由 --igs-dfx-life 驱动，进出场用百分比关键帧跟随寿命伸缩。
import { GAME_FX_STYLE_TEXT } from './fx-daily-game-style.js';
import { CAMPUS_FX_STYLE_TEXT } from './fx-daily-campus-style.js';
const RED = '#c8392b';
export const DAILY_FX_STYLE_TEXT = `
${GAME_FX_STYLE_TEXT}
${CAMPUS_FX_STYLE_TEXT}
#igs-overlay .igs-dfx{position:absolute;inset:0;pointer-events:none;--igs-dfx-life:3000ms;}
#igs-overlay .igs-dfx.igs-dfx-say{inset:auto;}
#igs-overlay .igs-dfx-sky{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
#igs-overlay .igs-dfx-sky canvas,#igs-overlay .igs-dfx-petals canvas{position:absolute;inset:0;width:100%;height:100%;}
#igs-overlay .igs-dfx-petals{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
#igs-overlay .igs-dfx-sky-glow{position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;opacity:0;background:radial-gradient(ellipse at 50% 22%,var(--igs-dfx-glow,#ffd27a) 0%,transparent 65%);}
#igs-overlay .igs-dfx-sky-glow.is-lit{animation:igs-dfx-glow 900ms ease-out;}
@keyframes igs-dfx-glow{0%{opacity:0}12%{opacity:.34}100%{opacity:0}}
/* 古代背景孔明灯：整段一层自下而上的暖色柔光，代替烟花的逐次闪光。 */
#igs-overlay .igs-dfx-sky-glow.is-warm{background:radial-gradient(ellipse 80% 60% at 50% 78%,rgba(255,150,64,.85) 0%,rgba(255,120,48,.3) 45%,transparent 75%);animation:igs-dfx-warm-glow var(--igs-dfx-life) ease-in-out both;}
#igs-overlay .igs-dfx-sky-glow.is-warm.is-reduced{animation:none;}
@keyframes igs-dfx-warm-glow{0%{opacity:0}25%{opacity:.26}70%{opacity:.2}100%{opacity:0}}

#igs-overlay .igs-dfx-timeskip{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-veil{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(18,20,30,.72),rgba(6,7,12,.9));}
#igs-overlay .igs-dfx-clock{position:relative;width:min(22vmin,120px);aspect-ratio:1;filter:drop-shadow(0 4px 18px rgba(0,0,0,.5));}
#igs-overlay .igs-dfx-clock svg{width:100%;height:100%;overflow:visible;}
#igs-overlay .igs-dfx-clock-face{fill:rgba(255,255,255,.06);stroke:rgba(255,246,228,.85);stroke-width:2.2;}
#igs-overlay .igs-dfx-clock-ticks line{stroke:rgba(255,246,228,.7);stroke-width:1.6;stroke-linecap:round;}
#igs-overlay .igs-dfx-clock-h,#igs-overlay .igs-dfx-clock-m{stroke:#fff6e4;stroke-linecap:round;transform-origin:50px 50px;}
#igs-overlay .igs-dfx-clock-h{stroke-width:3.4;animation:igs-dfx-hand-h 1500ms cubic-bezier(.5,0,.3,1) 250ms both;}
#igs-overlay .igs-dfx-clock-m{stroke-width:2.2;animation:igs-dfx-hand-m 1500ms cubic-bezier(.5,0,.3,1) 250ms both;}
#igs-overlay .igs-dfx-clock-pin{fill:#fff6e4;}
#igs-overlay .igs-dfx-timeskip-text{position:relative;display:flex;align-items:center;gap:14px;color:#fff6e4;font-family:"Huiwen Mincho","Source Han Serif CN",serif;font-size:clamp(18px,3.4vmin,28px);letter-spacing:.3em;text-indent:.3em;text-shadow:0 2px 12px rgba(0,0,0,.6);animation:igs-dfx-rise 900ms ease 700ms both;}
#igs-overlay .igs-dfx-timeskip-text i{display:block;width:clamp(28px,8vmin,64px);height:1px;background:linear-gradient(90deg,transparent,rgba(255,246,228,.8),transparent);}
@keyframes igs-dfx-hand-m{from{transform:rotate(0deg)}to{transform:rotate(1080deg)}}
@keyframes igs-dfx-hand-h{from{transform:rotate(0deg)}to{transform:rotate(90deg)}}
@keyframes igs-dfx-fade{0%{opacity:0}10%{opacity:1}86%{opacity:1}100%{opacity:0}}
@keyframes igs-dfx-rise{from{opacity:0;transform:translateY(10px);letter-spacing:.6em}to{opacity:1;transform:none}}

#igs-overlay .igs-dfx-flash{position:absolute;inset:0;background:#fff;opacity:0;animation:igs-dfx-flash 420ms ease-out both;}
@keyframes igs-dfx-flash{0%{opacity:0}8%{opacity:.95}100%{opacity:0}}
#igs-overlay .igs-dfx-polaroid{position:absolute;top:50%;left:50%;width:min(34%,300px);padding:8px 8px 0;background:#fbfaf6;border-radius:2px;box-shadow:0 12px 32px rgba(0,0,0,.45),0 2px 6px rgba(0,0,0,.25);transform-origin:center;animation:igs-dfx-polaroid var(--igs-dfx-life) cubic-bezier(.3,.7,.2,1) both;}
#igs-overlay .igs-dfx-photo-img{position:relative;width:100%;overflow:hidden;background:#222;}
#igs-overlay .igs-dfx-photo-bg,#igs-overlay .igs-dfx-photo-sprite{position:absolute;inset:0;background-repeat:no-repeat;}
#igs-overlay .igs-dfx-photo-bg{background-size:cover;background-position:center;filter:saturate(1.08) contrast(1.04);}
#igs-overlay .igs-dfx-photo-gloss{position:absolute;inset:0;background:linear-gradient(125deg,rgba(255,255,255,.22),transparent 38%),radial-gradient(ellipse at center,transparent 60%,rgba(40,20,0,.25));animation:igs-dfx-develop 1400ms ease-out 200ms both;}
#igs-overlay .igs-dfx-photo-cap{min-height:34px;padding:6px 4px 8px;color:#3a3530;font-family:"Yozai","LXGW WenKai",cursive;font-size:clamp(13px,2.2vmin,18px);text-align:center;line-height:1.4;}
@keyframes igs-dfx-polaroid{0%{opacity:0;transform:translate(-50%,-50%) scale(1.9)}9%{opacity:1;transform:translate(-50%,-50%) scale(1.1) rotate(0)}24%{transform:translate(-50%,-50%) scale(1) rotate(-3deg)}40%{transform:translate(40%,-92%) scale(.78) rotate(6deg)}88%{opacity:1;transform:translate(40%,-92%) scale(.78) rotate(6deg)}100%{opacity:0;transform:translate(46%,-96%) scale(.74) rotate(9deg)}}
@keyframes igs-dfx-develop{from{background-color:rgba(255,250,235,.9)}to{background-color:transparent}}

#igs-overlay .igs-dfx-letter{display:flex;align-items:flex-start;justify-content:center;padding-top:8%;perspective:900px;}
#igs-overlay .igs-dfx-paper{position:relative;width:min(56%,460px);padding:22px 28px 18px;background:repeating-linear-gradient(180deg,transparent 0 29px,rgba(120,150,190,.28) 29px 30px),linear-gradient(180deg,#fffdf6,#f6efe0);border-radius:3px;box-shadow:0 14px 34px rgba(0,0,0,.35),inset 0 0 40px rgba(180,150,100,.12);color:#3a3226;font-family:"LXGW WenKai","Yozai",serif;font-size:clamp(15px,2.6vmin,20px);line-height:30px;transform-origin:top center;animation:igs-dfx-unfold var(--igs-dfx-life) cubic-bezier(.3,.7,.2,1) both;}
#igs-overlay .igs-dfx-letter-body span{opacity:0;animation:igs-dfx-ink 260ms ease-out both;}
#igs-overlay .igs-dfx-letter-sign{margin-top:6px;text-align:right;color:#5b4a36;}
@keyframes igs-dfx-unfold{0%{opacity:0;transform:rotateX(-78deg) scaleY(.4)}10%{opacity:1;transform:rotateX(0) scaleY(1)}92%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-12px)}}
@keyframes igs-dfx-ink{from{opacity:0;filter:blur(2px)}to{opacity:1;filter:none}}

#igs-overlay .igs-dfx-note{display:flex;align-items:flex-start;justify-content:flex-end;padding:9% 11% 0 0;}
#igs-overlay .igs-dfx-sticky{position:relative;width:min(30%,220px);min-height:120px;padding:26px 18px 18px;box-sizing:border-box;background:linear-gradient(170deg,#fff7a8,#ffe97a);box-shadow:0 10px 22px rgba(0,0,0,.28),0 1px 0 rgba(255,255,255,.5) inset;color:#4a3d12;font-family:"Yozai","LXGW WenKai",cursive;font-size:clamp(15px,2.5vmin,19px);line-height:1.5;transform-origin:50% 0;animation:igs-dfx-slap var(--igs-dfx-life) cubic-bezier(.3,1.4,.4,1) both;}
#igs-overlay .igs-dfx-tape{position:absolute;top:-10px;left:50%;width:74px;height:22px;transform:translateX(-50%) rotate(-3deg);background:rgba(255,255,255,.55);box-shadow:0 1px 3px rgba(0,0,0,.12);}
/* 世界观换皮（西幻羊皮纸 / 科幻全息青光 / 末日旧纸锈边）：只改配色字体，结构与动画沿用现代。 */
#igs-overlay .igs-dfx-timeskip.is-fantasy .igs-dfx-veil{background:radial-gradient(ellipse at center,rgba(50,32,14,.7),rgba(14,9,4,.92));}
#igs-overlay .igs-dfx-timeskip.is-fantasy .igs-dfx-timeskip-text{color:#f6e7c1;font-family:Georgia,"Times New Roman",serif;}
#igs-overlay .igs-dfx-timeskip.is-scifi .igs-dfx-veil{background:radial-gradient(ellipse at center,rgba(6,30,44,.72),rgba(2,8,14,.94));}
#igs-overlay .igs-dfx-timeskip.is-scifi .igs-dfx-timeskip-text{color:#bff6ff;letter-spacing:.2em;text-shadow:0 0 10px rgba(60,200,255,.85);}
#igs-overlay .igs-dfx-timeskip.is-apocalypse .igs-dfx-veil{background:radial-gradient(ellipse at center,rgba(44,36,26,.74),rgba(10,8,6,.94));}
#igs-overlay .igs-dfx-timeskip.is-apocalypse .igs-dfx-timeskip-text{color:#efe4cc;font-family:"Courier New",monospace;}
#igs-overlay .igs-dfx-letter.is-fantasy .igs-dfx-paper{background:#efe2c2;color:#3a2614;border:1px solid #9c7a46;box-shadow:inset 0 0 22px rgba(120,80,30,.22),0 10px 26px rgba(0,0,0,.35);font-family:Georgia,"Times New Roman",serif;}
#igs-overlay .igs-dfx-letter.is-scifi .igs-dfx-paper{background:rgba(8,24,36,.92);color:#d8fbff;border:1px solid rgba(80,220,255,.7);box-shadow:0 0 18px rgba(60,200,255,.4);}
#igs-overlay .igs-dfx-letter.is-apocalypse .igs-dfx-paper{background:#d9cdb3;color:#2a2219;border:1px solid #7a6a52;box-shadow:0 10px 24px rgba(0,0,0,.45);font-family:"Courier New",monospace;}
#igs-overlay .igs-dfx-note.is-fantasy .igs-dfx-sticky{background:#efe2c2;color:#3a2614;font-family:Georgia,"Times New Roman",serif;}
#igs-overlay .igs-dfx-note.is-scifi .igs-dfx-sticky{background:rgba(8,24,36,.92);color:#d8fbff;box-shadow:0 0 14px rgba(60,200,255,.4);}
#igs-overlay .igs-dfx-note.is-apocalypse .igs-dfx-sticky{background:#d9cdb3;color:#2a2219;font-family:"Courier New",monospace;}
#igs-overlay .igs-dfx-omikuji.is-fantasy .igs-dfx-slip{background:#efe2c2;color:#3a2614;border:1px solid #9c7a46;font-family:Georgia,"Times New Roman",serif;}
#igs-overlay .igs-dfx-omikuji.is-scifi .igs-dfx-slip{background:rgba(8,24,36,.92);color:#d8fbff;border:1px solid rgba(80,220,255,.7);box-shadow:0 0 16px rgba(60,200,255,.4);}
#igs-overlay .igs-dfx-omikuji.is-apocalypse .igs-dfx-slip{background:#d9cdb3;color:#2a2219;border:1px dashed #7a6a52;font-family:"Courier New",monospace;}
#igs-overlay .igs-dfx-broadcast.is-scifi .igs-dfx-banner{background:rgba(8,24,36,.9);color:#d8fbff;border:1px solid rgba(80,220,255,.7);box-shadow:0 0 14px rgba(60,200,255,.45);}
#igs-overlay .igs-dfx-broadcast.is-apocalypse .igs-dfx-banner{background:rgba(48,40,32,.93);color:#e8dfcf;border:1px dashed rgba(200,150,80,.6);font-family:"Courier New",monospace;}

/* 大正换皮：奶油洋纸 + 海老茶 + 明朝体；照片褪色泛黄。只改配色字体与滤镜，结构与动画沿用现代。 */
#igs-overlay .igs-dfx-timeskip.is-taisho .igs-dfx-veil{background:radial-gradient(ellipse at center,rgba(60,22,18,.7),rgba(16,6,5,.92));}
#igs-overlay .igs-dfx-timeskip.is-taisho .igs-dfx-timeskip-text{color:#f4ead6;font-family:"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS PMincho",serif;letter-spacing:.14em;}
#igs-overlay .igs-dfx-photo.is-taisho .igs-dfx-photo-img{filter:sepia(.55) contrast(1.05) saturate(.85);}
#igs-overlay .igs-dfx-letter.is-taisho .igs-dfx-paper{background:#f4ead6;color:#2a1c18;border:1px solid #7b2e2a;box-shadow:inset 0 0 0 3px #f4ead6,inset 0 0 0 4px rgba(123,46,42,.4),0 10px 26px rgba(0,0,0,.35);font-family:"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS PMincho",serif;}
#igs-overlay .igs-dfx-note.is-taisho .igs-dfx-sticky{background:#f4ead6;color:#2a1c18;font-family:"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS PMincho",serif;}
#igs-overlay .igs-dfx-omikuji.is-taisho .igs-dfx-slip{background:#f4ead6;color:#2a1c18;border:1px solid #7b2e2a;font-family:"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS PMincho",serif;}
#igs-overlay .igs-dfx-broadcast.is-taisho .igs-dfx-banner{background:#f4ead6;color:#2a1c18;border:1px solid #7b2e2a;font-family:"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS PMincho",serif;}

/* 魔法换皮：午夜蓝星空报幕、羊皮纸 + 火漆、会动的照片；结构与时长沿用现代。 */
#igs-overlay .igs-dfx-timeskip.is-horror .igs-dfx-veil{background:radial-gradient(ellipse at center,rgba(20,10,10,.82),rgba(0,0,0,.94));}
#igs-overlay .igs-dfx-timeskip.is-horror .igs-dfx-timeskip-text{color:#e4dad4;font-family:"Source Han Serif CN","Noto Serif CJK SC","Songti SC",serif;letter-spacing:.3em;text-shadow:0 2px 10px rgba(0,0,0,.9);}
#igs-overlay .igs-dfx-photo.is-horror .igs-dfx-photo-img{filter:grayscale(.55) contrast(1.12) brightness(.92);}
#igs-overlay .igs-dfx-letter.is-horror .igs-dfx-paper{background:linear-gradient(160deg,#e3ddd2,#c9c0b2);color:#2a2220;border:1px solid #7a6c62;box-shadow:inset 0 0 30px rgba(90,60,50,.3),0 10px 26px rgba(0,0,0,.5);font-family:"Source Han Serif CN","Noto Serif CJK SC","Songti SC",serif;}
#igs-overlay .igs-dfx-letter.is-horror .igs-dfx-paper::after{content:"";position:absolute;right:22px;bottom:16px;width:30px;height:22px;border-radius:50% 44% 56% 48%;background:rgba(120,10,16,.55);}
#igs-overlay .igs-dfx-note.is-horror .igs-dfx-sticky{background:linear-gradient(160deg,#e6e0d4,#cfc6b8);color:#2a2220;}
#igs-overlay .igs-dfx-broadcast.is-horror .igs-dfx-banner{background:linear-gradient(180deg,rgba(18,12,12,.94),rgba(8,6,6,.96));color:#e4dad4;border:1px solid rgba(150,16,24,.75);box-shadow:0 6px 20px rgba(0,0,0,.45);font-family:"Source Han Serif CN","Noto Serif CJK SC","Songti SC",serif;}
#igs-overlay .igs-dfx-timeskip.is-magic .igs-dfx-veil{background:radial-gradient(1px 1px at 18% 30%,rgba(255,240,200,.9),transparent),radial-gradient(1px 1px at 72% 22%,rgba(255,240,200,.8),transparent),radial-gradient(1.5px 1.5px at 40% 70%,rgba(200,220,255,.8),transparent),radial-gradient(1px 1px at 86% 64%,rgba(255,240,200,.7),transparent),radial-gradient(ellipse at center,rgba(28,34,72,.78),rgba(8,10,26,.94));}
#igs-overlay .igs-dfx-timeskip.is-magic .igs-dfx-timeskip-text{color:#f3e2b6;font-family:"IM Fell English",Georgia,"Times New Roman",serif;letter-spacing:.14em;text-shadow:0 0 12px rgba(255,214,120,.55),0 2px 8px rgba(0,0,0,.6);}
#igs-overlay .igs-dfx-photo.is-magic .igs-dfx-photo-img{filter:sepia(.35) saturate(.9) contrast(1.05);animation:igs-dfx-magic-photo 2.6s ease-in-out infinite alternate;}
@keyframes igs-dfx-magic-photo{from{transform:scale(1) translateX(0);}to{transform:scale(1.04) translateX(-1.5%);}}
#igs-overlay .igs-dfx-letter.is-magic .igs-dfx-paper{background:radial-gradient(ellipse at 30% 20%,rgba(255,250,232,.6),transparent 60%),linear-gradient(160deg,#f1e3c0,#e2cc98);color:#2b1d10;border:1px solid #9c7a46;box-shadow:inset 0 0 26px rgba(120,80,30,.28),0 10px 26px rgba(0,0,0,.4);font-family:"IM Fell English",Georgia,"Times New Roman",serif;}
#igs-overlay .igs-dfx-letter.is-magic .igs-dfx-paper::after{content:"";position:absolute;right:18px;bottom:-14px;width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 38% 34%,#b8323e,#7a1f2b 62%,#5a141e);box-shadow:0 2px 4px rgba(0,0,0,.35),inset 0 0 0 3px rgba(255,255,255,.08);}
#igs-overlay .igs-dfx-note.is-magic .igs-dfx-sticky{background:linear-gradient(160deg,#f1e3c0,#e2cc98);color:#2b1d10;font-family:"IM Fell English",Georgia,"Times New Roman",serif;}
#igs-overlay .igs-dfx-omikuji.is-magic .igs-dfx-slip{background:#f1e3c0;color:#2b1d10;border:1px solid #9c7a46;font-family:"IM Fell English",Georgia,"Times New Roman",serif;}
#igs-overlay .igs-dfx-broadcast.is-magic .igs-dfx-banner{background:linear-gradient(180deg,rgba(28,34,72,.92),rgba(14,18,42,.94));color:#f3e2b6;border:1px solid rgba(201,162,74,.75);box-shadow:0 0 18px rgba(255,214,120,.25),0 6px 20px rgba(0,0,0,.35);font-family:"IM Fell English",Georgia,"Times New Roman",serif;}

/* 古代背景：一炷香（香身随演出时长燃短，烟从香头升起）、对折字条、竖排信笺。 */
#igs-overlay .igs-dfx-timeskip.is-ancient .igs-dfx-veil{background:radial-gradient(ellipse at center,rgba(40,26,12,.72),rgba(12,8,4,.92));}
#igs-overlay .igs-dfx-timeskip.is-ancient .igs-dfx-timeskip-text{font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;}
#igs-overlay .igs-dfx-incense{position:relative;width:60px;height:min(26vmin,150px);}
#igs-overlay .igs-dfx-stick{position:absolute;left:50%;bottom:20px;width:3px;height:78%;margin-left:-1.5px;border-radius:2px;background:#8a5a36;animation:igs-dfx-burn var(--igs-dfx-life) linear both;}
#igs-overlay .igs-dfx-stick::before{content:"";position:absolute;top:-3px;left:-2px;width:7px;height:7px;border-radius:50%;background:#ffb060;box-shadow:0 0 10px 4px rgba(255,120,40,.75);animation:igs-dfx-ember .6s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-smoke{position:absolute;bottom:100%;left:50%;width:14px;height:60px;margin-left:-7px;border-radius:50%;background:radial-gradient(ellipse at 50% 80%,rgba(230,225,215,.55),transparent 70%);filter:blur(3px);opacity:0;animation:igs-dfx-smoke 1.8s ease-out infinite;}
#igs-overlay .igs-dfx-smoke.is-b{animation-delay:.9s;}
#igs-overlay .igs-dfx-censer{position:absolute;left:50%;bottom:0;width:56px;height:24px;margin-left:-28px;border-radius:4px 4px 16px 16px;background:linear-gradient(#8a6a3a,#4a3418);box-shadow:inset 0 3px 0 rgba(255,220,160,.25),0 4px 12px rgba(0,0,0,.4);}
@keyframes igs-dfx-burn{from{height:78%}to{height:28%}}
@keyframes igs-dfx-ember{from{opacity:.7}to{opacity:1}}
@keyframes igs-dfx-smoke{0%{opacity:0;transform:translate(0,10px) scale(.6)}30%{opacity:.9}100%{opacity:0;transform:translate(10px,-40px) scale(1.4,1.8)}}
#igs-overlay .igs-dfx-note.is-ancient{padding:8% 12% 0 0;}
#igs-overlay .igs-dfx-scrap{writing-mode:vertical-rl;max-height:min(46%,260px);padding:18px 14px;box-sizing:border-box;background:linear-gradient(90deg,#efe3c6 0 49.4%,#dccaa4 49.4% 50.6%,#efe3c6 50.6%);border:1px solid rgba(120,70,30,.3);box-shadow:0 10px 22px rgba(0,0,0,.32);color:#2b1d12;font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;font-size:clamp(15px,2.6vmin,19px);line-height:1.8;letter-spacing:.08em;transform-origin:50% 0;animation:igs-dfx-scrap var(--igs-dfx-life) cubic-bezier(.3,1.2,.4,1) both;}
@keyframes igs-dfx-scrap{0%{opacity:0;transform:translateY(-24px) rotate(-8deg)}10%{opacity:1;transform:translateY(0) rotate(3deg)}86%{opacity:1;transform:rotate(3deg)}100%{opacity:0;transform:translate(16px,10px) rotate(6deg)}}
#igs-overlay .igs-dfx-letter.is-ancient .igs-dfx-paper{writing-mode:vertical-rl;width:auto;max-width:80%;height:min(62%,340px);padding:22px 18px;box-sizing:border-box;background:repeating-linear-gradient(to left,transparent 0 33px,rgba(178,62,40,.3) 33px 34px) right top/100% 100% content-box,#f6ecd4;border:1px solid rgba(120,70,30,.35);border-radius:2px;color:#2b1d12;font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;font-size:clamp(16px,2.8vmin,20px);line-height:34px;letter-spacing:.08em;transform-origin:right center;animation-name:igs-dfx-unroll;}
#igs-overlay .igs-dfx-letter.is-ancient .igs-dfx-letter-sign{margin:0;padding-top:1.4em;text-align:end;color:#7a2a1a;font-size:.85em;}
#igs-overlay .igs-dfx-letter.is-ancient .igs-dfx-letter-sign::after{content:"";display:inline-block;width:.9em;height:.9em;margin-top:.35em;border-radius:2px;background:#b8452f;vertical-align:middle;}
@keyframes igs-dfx-unroll{0%{opacity:0;transform:scaleX(.15)}10%{opacity:1;transform:scaleX(1)}92%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-12px)}}
@keyframes igs-dfx-slap{0%{opacity:0;transform:scale(1.5) rotate(-12deg)}8%{opacity:1;transform:scale(.95) rotate(-3deg)}12%{transform:scale(1) rotate(-4deg)}86%{opacity:1;transform:scale(1) rotate(-4deg)}100%{opacity:0;transform:translate(24px,-14px) rotate(8deg) scale(.96)}}

#igs-overlay .igs-dfx-bell,#igs-overlay .igs-dfx-broadcast{display:flex;justify-content:center;align-items:flex-start;padding-top:18px;}
#igs-overlay .igs-dfx-chip{display:flex;align-items:center;gap:10px;padding:8px 16px;border-radius:999px;background:rgba(24,26,34,.72);color:#ffe7a8;box-shadow:0 6px 20px rgba(0,0,0,.3);animation:igs-dfx-drop var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-bell-icon{display:flex;width:22px;height:22px;fill:#ffd66b;transform-origin:50% 12%;animation:igs-dfx-ring 520ms ease-in-out infinite;}
#igs-overlay .igs-dfx-bell-icon svg{width:100%;height:100%;}
#igs-overlay .igs-dfx-notes{display:flex;gap:6px;font-size:15px;}
#igs-overlay .igs-dfx-notes b{font-weight:400;opacity:0;animation:igs-dfx-note 1040ms ease-out infinite;}
#igs-overlay .igs-dfx-notes b:nth-child(2){animation-delay:260ms}
#igs-overlay .igs-dfx-notes b:nth-child(3){animation-delay:520ms}
#igs-overlay .igs-dfx-notes b:nth-child(4){animation-delay:780ms}
@keyframes igs-dfx-ring{0%,100%{transform:rotate(0)}25%{transform:rotate(14deg)}75%{transform:rotate(-14deg)}}
@keyframes igs-dfx-note{0%{opacity:0;transform:translateY(4px)}30%{opacity:1}100%{opacity:0;transform:translateY(-8px)}}
@keyframes igs-dfx-drop{0%{opacity:0;transform:translateY(-24px)}8%{opacity:1;transform:none}90%{opacity:1;transform:none}100%{opacity:0;transform:translateY(-16px)}}
#igs-overlay .igs-dfx-banner{display:flex;align-items:center;gap:10px;max-width:min(80%,640px);padding:9px 18px;border-radius:10px;background:linear-gradient(180deg,rgba(40,44,52,.9),rgba(24,26,32,.9));border:1px solid rgba(255,255,255,.08);color:#f2f0ea;box-shadow:0 8px 24px rgba(0,0,0,.35);animation:igs-dfx-drop var(--igs-dfx-life) ease both;overflow:hidden;}
#igs-overlay .igs-dfx-banner::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(180deg,rgba(255,255,255,.03) 0 1px,transparent 1px 3px);pointer-events:none;}
#igs-overlay .igs-dfx-spk{display:flex;width:22px;height:22px;flex:0 0 auto;}
#igs-overlay .igs-dfx-spk svg{width:100%;height:100%;fill:none;stroke:#ffcf6e;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
#igs-overlay .igs-dfx-spk-body{fill:#ffcf6e;}
#igs-overlay .igs-dfx-spk-w1{animation:igs-dfx-wave 900ms ease-in-out infinite;}
#igs-overlay .igs-dfx-spk-w2{animation:igs-dfx-wave 900ms ease-in-out 180ms infinite;}
#igs-overlay .igs-dfx-banner-label{flex:0 0 auto;padding:1px 7px;border-radius:4px;background:#ffcf6e;color:#2a2418;font-size:11px;font-weight:700;letter-spacing:.12em;}
#igs-overlay .igs-dfx-banner-text{font-size:clamp(13px,2.2vmin,16px);line-height:1.5;letter-spacing:.04em;}
@keyframes igs-dfx-wave{0%,100%{opacity:.25}50%{opacity:1}}

#igs-overlay .igs-dfx-touch{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-warm{position:absolute;inset:0;mix-blend-mode:screen;background:radial-gradient(ellipse at center,transparent 38%,rgba(255,150,180,.38) 100%);animation:igs-dfx-pulse 1200ms ease-in-out 2;}
#igs-overlay .igs-dfx-hearts i{position:absolute;bottom:18%;width:calc(26px * var(--igs-dfx-s,1));height:calc(26px * var(--igs-dfx-s,1));fill:#ff8fb1;filter:drop-shadow(0 2px 6px rgba(255,120,160,.5));opacity:0;animation:igs-dfx-heart 1900ms ease-out both;}
#igs-overlay .igs-dfx-hearts svg{width:100%;height:100%;}
@keyframes igs-dfx-pulse{0%,100%{opacity:.55}45%{opacity:1}}
@keyframes igs-dfx-heart{0%{opacity:0;transform:translateY(0) scale(.5)}20%{opacity:.95;transform:translateY(-20px) scale(1)}100%{opacity:0;transform:translateY(-140px) translateX(12px) scale(.9) rotate(12deg)}}

#igs-overlay .igs-dfx-alarm{display:flex;align-items:center;justify-content:flex-end;padding-right:9%;padding-bottom:10%;}
#igs-overlay .igs-dfx-phone{width:min(22%,170px);aspect-ratio:9/17;padding:7px;border-radius:22px;background:#15161a;box-shadow:0 16px 36px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.08) inset;animation:igs-dfx-phone var(--igs-dfx-life) cubic-bezier(.3,.8,.3,1) both;}
#igs-overlay .igs-dfx-phone-screen{display:flex;flex-direction:column;align-items:center;justify-content:space-between;height:100%;padding:18% 8% 10%;box-sizing:border-box;border-radius:16px;background:linear-gradient(180deg,#2b3a67,#1b2140 60%,#121528);color:#fff;}
#igs-overlay .igs-dfx-alarm-label{display:flex;align-items:center;gap:4px;font-size:11px;letter-spacing:.2em;opacity:.8;}
#igs-overlay .igs-dfx-alarm-label svg{width:12px;height:12px;fill:#ffd66b;animation:igs-dfx-ring 260ms linear infinite;}
#igs-overlay .igs-dfx-phone-screen b{font-family:"Quicksand","Source Han Sans CN",sans-serif;font-size:clamp(22px,5vmin,36px);font-weight:600;letter-spacing:.04em;animation:igs-dfx-blink 900ms steps(2) infinite;}
#igs-overlay .igs-dfx-alarm-bar{display:flex;gap:6px;width:100%;}
#igs-overlay .igs-dfx-alarm-bar i{flex:1;padding:5px 0;border-radius:999px;background:rgba(255,255,255,.14);font-style:normal;font-size:10px;text-align:center;}
#igs-overlay .igs-dfx-alarm-bar i:last-child{background:#ff6b5e;}
@keyframes igs-dfx-phone{0%{opacity:0;transform:translateY(40px)}8%{opacity:1;transform:none}10%,14%,18%,22%,26%,30%{transform:translateX(-3px) rotate(-2deg)}12%,16%,20%,24%,28%{transform:translateX(3px) rotate(2deg)}32%{transform:none}90%{opacity:1;transform:none}100%{opacity:0;transform:translateY(30px)}}
@keyframes igs-dfx-blink{0%{opacity:1}50%{opacity:.55}}

#igs-overlay .igs-dfx-omikuji{display:flex;align-items:center;justify-content:center;gap:5%;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-kuji-box{position:relative;display:flex;align-items:center;justify-content:center;width:min(11%,78px);aspect-ratio:1/2.1;border-radius:8px;background:linear-gradient(90deg,#6b3f1f,#a0663a 40%,#7a4726);box-shadow:0 12px 26px rgba(0,0,0,.4),inset 0 0 0 3px rgba(40,20,8,.35);transform-origin:50% 90%;animation:igs-dfx-shake 900ms ease-in-out both;}
#igs-overlay .igs-dfx-kuji-box span{writing-mode:vertical-rl;color:#f7e6c4;font-family:"Huiwen Mincho",serif;font-size:clamp(12px,2.2vmin,16px);letter-spacing:.2em;}
#igs-overlay .igs-dfx-kuji-stick{position:absolute;top:0;left:50%;width:6px;height:40%;margin-left:-3px;border-radius:2px;background:#e8cf9a;opacity:0;animation:igs-dfx-stick 500ms ease-out 900ms both;}
#igs-overlay .igs-dfx-slip{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:min(16%,120px);padding:14px 16px;background:#fdfaf2;border:1px solid rgba(160,120,70,.35);box-shadow:0 12px 28px rgba(0,0,0,.35);color:#3a2e22;font-family:"Huiwen Mincho","Source Han Serif CN",serif;transform-origin:top center;opacity:0;animation:igs-dfx-slip 700ms cubic-bezier(.3,.8,.3,1) 1300ms both;}
#igs-overlay .igs-dfx-slip-head{font-size:11px;letter-spacing:.4em;opacity:.7;}
#igs-overlay .igs-dfx-slip-result{writing-mode:vertical-rl;font-size:clamp(28px,7vmin,52px);font-weight:700;letter-spacing:.12em;color:${RED};text-shadow:0 1px 0 rgba(255,255,255,.6);}
#igs-overlay .igs-dfx-omikuji.is-great .igs-dfx-slip{background:linear-gradient(180deg,#fffbea,#fbeec7);border-color:rgba(200,150,40,.5);box-shadow:0 12px 28px rgba(0,0,0,.35),0 0 26px rgba(255,210,100,.45);}
#igs-overlay .igs-dfx-omikuji.is-bad .igs-dfx-slip-result{color:#3f4a5c;}
#igs-overlay .igs-dfx-slip-text{max-width:12em;font-size:12px;line-height:1.5;text-align:center;}
@keyframes igs-dfx-shake{0%,100%{transform:rotate(0)}15%{transform:rotate(-14deg)}30%{transform:rotate(12deg)}45%{transform:rotate(-10deg)}60%{transform:rotate(8deg)}75%{transform:rotate(-4deg)}}
@keyframes igs-dfx-stick{from{opacity:0;transform:translateY(20%)}to{opacity:1;transform:translateY(-70%)}}
@keyframes igs-dfx-slip{from{opacity:0;transform:scaleY(.1) translateY(-20px)}to{opacity:1;transform:none}}
/* 古代背景：竹签筒前倾摇动、掉出一支红头签，旁边展开竖排签文（签号、签等、签文自右向左）。 */
#igs-overlay .igs-dfx-omikuji.is-ancient{gap:7%;}
#igs-overlay .igs-dfx-qian{position:relative;width:min(9%,64px);aspect-ratio:1/2.4;}
#igs-overlay .igs-dfx-qian-tube{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:5px 5px 9px 9px;background:linear-gradient(180deg,transparent 0 33%,rgba(60,36,10,.55) 33% 35%,rgba(255,230,170,.25) 35% 36.5%,transparent 36.5% 70%,rgba(60,36,10,.55) 70% 72%,rgba(255,230,170,.25) 72% 73.5%,transparent 73.5%),linear-gradient(90deg,#5e3d14,#b48a48 32%,#d2ad68 44%,#94692c 72%,#5a3a12);box-shadow:0 12px 26px rgba(0,0,0,.42),inset 0 3px 0 rgba(40,24,6,.5);transform-origin:50% 100%;animation:igs-dfx-qian-shake 1200ms ease-in-out both;}
#igs-overlay .igs-dfx-qian-sticks{position:absolute;left:14%;right:14%;bottom:94%;height:34%;}
#igs-overlay .igs-dfx-qian-sticks i{position:absolute;bottom:0;width:4px;border-radius:1px;background:linear-gradient(#b8452f 0 16%,#e2c48a 16%);transform-origin:50% 100%;}
#igs-overlay .igs-dfx-qian-sticks i:nth-child(1){left:4%;height:70%;transform:rotate(-9deg);}
#igs-overlay .igs-dfx-qian-sticks i:nth-child(2){left:24%;height:92%;transform:rotate(-4deg);}
#igs-overlay .igs-dfx-qian-sticks i:nth-child(3){left:46%;height:78%;}
#igs-overlay .igs-dfx-qian-sticks i:nth-child(4){left:66%;height:100%;transform:rotate(5deg);}
#igs-overlay .igs-dfx-qian-sticks i:nth-child(5){left:86%;height:66%;transform:rotate(10deg);}
#igs-overlay .igs-dfx-qian-label{padding:6px 2px;writing-mode:vertical-rl;background:#b8452f;color:#f6ecd4;font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;font-size:clamp(12px,2.2vmin,16px);letter-spacing:.2em;box-shadow:0 1px 2px rgba(0,0,0,.3);}
#igs-overlay .igs-dfx-qian-stick{position:absolute;left:50%;bottom:78%;width:4px;height:52%;margin-left:-2px;border-radius:1px;background:linear-gradient(#b8452f 0 14%,#e2c48a 14%);box-shadow:0 2px 4px rgba(0,0,0,.35);transform-origin:50% 100%;opacity:0;animation:igs-dfx-qian-fall 760ms cubic-bezier(.45,0,.6,1) 820ms both;}
#igs-overlay .igs-dfx-omikuji.is-ancient .igs-dfx-slip{writing-mode:vertical-rl;gap:10px;height:min(50%,290px);min-width:0;padding:18px 14px;box-sizing:border-box;background:#f6ecd4;border:1px solid rgba(120,70,30,.35);outline:1px solid rgba(184,69,47,.55);outline-offset:-7px;color:#2b1d12;font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;transform-origin:right center;animation-name:igs-dfx-qian-unroll;}
#igs-overlay .igs-dfx-omikuji.is-ancient .igs-dfx-slip-head{color:#b8452f;font-size:13px;letter-spacing:.3em;opacity:1;}
#igs-overlay .igs-dfx-omikuji.is-ancient .igs-dfx-slip-result{color:#b8452f;font-size:clamp(26px,6vmin,46px);letter-spacing:.16em;text-shadow:none;}
#igs-overlay .igs-dfx-omikuji.is-ancient .igs-dfx-slip-text{max-width:none;max-height:100%;font-size:clamp(13px,2.2vmin,16px);line-height:1.7;letter-spacing:.1em;text-align:start;}
#igs-overlay .igs-dfx-omikuji.is-ancient.is-great .igs-dfx-slip{box-shadow:0 12px 28px rgba(0,0,0,.35),0 0 26px rgba(255,200,90,.5);}
#igs-overlay .igs-dfx-omikuji.is-ancient.is-bad .igs-dfx-slip-result{color:#3a3530;}
@keyframes igs-dfx-qian-shake{0%{transform:rotate(0)}12%{transform:rotate(-24deg)}22%{transform:rotate(-16deg) translateY(-3px)}32%{transform:rotate(-26deg)}42%{transform:rotate(-17deg) translateY(-3px)}52%{transform:rotate(-26deg)}62%{transform:rotate(-18deg)}72%{transform:rotate(-24deg)}100%{transform:rotate(0)}}
@keyframes igs-dfx-qian-fall{0%{opacity:0;transform:translate(0,30%) rotate(-24deg)}14%{opacity:1}40%{transform:translate(-60%,-40%) rotate(-40deg)}100%{opacity:1;transform:translate(-220%,150%) rotate(-96deg)}}
@keyframes igs-dfx-qian-unroll{from{opacity:0;transform:scaleX(.08)}to{opacity:1;transform:none}}

#igs-overlay .igs-dfx-receipt{display:flex;flex-direction:column;align-items:center;padding-top:5%;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-rc-slot{width:min(34%,260px);height:12px;border-radius:6px;background:linear-gradient(180deg,#2a2c31,#444850);box-shadow:0 4px 10px rgba(0,0,0,.4);}
#igs-overlay .igs-dfx-rc-paper{width:min(29%,220px);margin-top:-4px;padding:12px 14px 16px;box-sizing:border-box;background:#fcfcf8;color:#2a2a2a;font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;font-size:clamp(11px,1.9vmin,13px);line-height:1.6;box-shadow:0 10px 20px rgba(0,0,0,.28);-webkit-mask:linear-gradient(#000,#000) top/100% calc(100% - 6px) no-repeat,conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/10px 6px repeat-x;mask:linear-gradient(#000,#000) top/100% calc(100% - 6px) no-repeat,conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/10px 6px repeat-x;animation:igs-dfx-print 1100ms steps(14) both;}
#igs-overlay .igs-dfx-rc-shop{text-align:center;font-weight:700;letter-spacing:.2em;}
#igs-overlay .igs-dfx-rc-rule{margin:6px 0;border-top:1px dashed rgba(0,0,0,.4);}
#igs-overlay .igs-dfx-rc-total{display:flex;justify-content:space-between;font-weight:700;}
#igs-overlay .igs-dfx-rc-thanks{margin-top:8px;text-align:center;font-size:.9em;opacity:.6;letter-spacing:.2em;}
@keyframes igs-dfx-print{from{clip-path:inset(0 0 100% 0);transform:translateY(-6px)}to{clip-path:inset(0 0 0 0);transform:none}}

#igs-overlay .igs-dfx-tv{display:flex;align-items:flex-start;justify-content:flex-start;padding:5% 0 0 5%;}
#igs-overlay .igs-dfx-crt{width:min(36%,300px);padding:10px;border-radius:18px;background:linear-gradient(160deg,#3a3d44,#1e2025);box-shadow:0 16px 34px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.1);animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-crt-screen{position:relative;aspect-ratio:4/3;overflow:hidden;border-radius:14px/18px;background:#0d1a1f;animation:igs-dfx-power var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-crt-static{position:absolute;inset:-50%;background:repeating-radial-gradient(circle at 17% 32%,#fff 0 1px,#000 1px 2px),repeating-radial-gradient(circle at 71% 64%,#bbb 0 1px,transparent 1px 3px);opacity:.55;animation:igs-dfx-static 120ms steps(3) 4,igs-dfx-static-out 200ms ease 480ms both;}
#igs-overlay .igs-dfx-crt-content{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:10px;background:radial-gradient(ellipse at 50% 40%,#355d6b,#15272f 70%);opacity:0;animation:igs-dfx-show 300ms ease 600ms both;}
#igs-overlay .igs-dfx-crt-ch{position:absolute;top:8px;left:10px;padding:1px 6px;border-radius:3px;background:#e84b3c;color:#fff;font-family:"Smiley Sans","Source Han Sans CN",sans-serif;font-size:11px;letter-spacing:.1em;}
#igs-overlay .igs-dfx-crt-ticker{overflow:hidden;white-space:nowrap;padding:4px 6px;background:rgba(0,0,0,.55);border-left:3px solid #ffcf3e;color:#fff;font-family:"Smiley Sans","Source Han Sans CN",sans-serif;font-size:clamp(12px,2vmin,15px);}
#igs-overlay .igs-dfx-crt-ticker span{display:inline-block;}
#igs-overlay .igs-dfx-crt-ticker.is-scroll span{padding-left:100%;animation:igs-dfx-ticker calc(var(--igs-dfx-life) - 900ms) linear 700ms both;}
#igs-overlay .igs-dfx-crt-lines{position:absolute;inset:0;background:repeating-linear-gradient(180deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px);mix-blend-mode:multiply;pointer-events:none;}
@keyframes igs-dfx-power{0%{transform:scale(1,.004);filter:brightness(4)}6%{transform:scale(1,1);filter:brightness(1.6)}10%{filter:none}90%{transform:scale(1,1)}96%{transform:scale(1,.006);filter:brightness(3)}100%{transform:scale(0,0)}}
@keyframes igs-dfx-static{0%{transform:translate(0,0)}33%{transform:translate(-6%,4%)}66%{transform:translate(5%,-3%)}}
@keyframes igs-dfx-static-out{to{opacity:0}}
@keyframes igs-dfx-show{to{opacity:1}}
@keyframes igs-dfx-ticker{from{transform:translateX(0)}to{transform:translateX(-100%)}}

#igs-overlay .igs-dfx.is-reduced *,#igs-overlay .igs-dfx.is-reduced .igs-dfx-polaroid,#igs-overlay .igs-dfx.is-reduced{animation:none!important;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-flash,#igs-overlay .igs-dfx.is-reduced .igs-dfx-hearts,#igs-overlay .igs-dfx.is-reduced .igs-dfx-crt-static{display:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-smoke{display:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-stick{height:50%;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-letter-body span,#igs-overlay .igs-dfx.is-reduced .igs-dfx-slip,#igs-overlay .igs-dfx.is-reduced .igs-dfx-crt-content,#igs-overlay .igs-dfx.is-reduced .igs-dfx-kuji-stick{opacity:1;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-qian-stick{opacity:1;transform:translateY(-30%);}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-polaroid{transform:translate(40%,-92%) scale(.78) rotate(6deg);}
#igs-overlay .igs-dfx-sky-glow.is-lit.is-reduced{animation:none;}
#igs-overlay .igs-dfx-rps{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-rps-hands{display:flex;align-items:center;gap:22px;font-size:3.2em;}
#igs-overlay .igs-dfx-rps-vs{font-size:.4em;font-weight:700;color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.6);}
#igs-overlay .igs-dfx-rps-verdict{padding:4px 16px;border-radius:999px;background:rgba(20,20,26,.8);color:#fff;font-weight:700;}
#igs-overlay .igs-dfx-rps.is-win .igs-dfx-rps-verdict{color:#8fe3a6;}
#igs-overlay .igs-dfx-rps.is-lose .igs-dfx-rps-verdict{color:#ff9f9f;}
#igs-overlay .igs-dfx-gacha{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-gacha-capsule{position:relative;width:64px;height:64px;}
#igs-overlay .igs-dfx-gacha-top,#igs-overlay .igs-dfx-gacha-bottom{position:absolute;left:0;right:0;height:50%;box-sizing:border-box;border:3px solid #fff;}
#igs-overlay .igs-dfx-gacha-top{top:0;border-radius:32px 32px 0 0;background:#ff7aa2;animation:igs-dfx-gacha-open .5s .6s ease-out both;}
#igs-overlay .igs-dfx-gacha-bottom{bottom:0;border-radius:0 0 32px 32px;background:#fdf6e3;}
#igs-overlay .igs-dfx-gacha-item{padding:6px 14px;border-radius:10px;background:rgba(20,20,26,.84);color:#fff;font-weight:700;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
@keyframes igs-dfx-gacha-open{to{transform:translateY(-60%) rotate(-24deg);}}
#igs-overlay .igs-dfx-game{display:flex;align-items:center;justify-content:center;}
#igs-overlay .igs-dfx-game-word{font-family:monospace;font-size:4em;font-weight:900;letter-spacing:.12em;color:#ffd66b;text-shadow:4px 4px 0 #3a2a6b;animation:igs-dfx-game-pop var(--igs-dfx-life) steps(6,end) both;}
#igs-overlay .igs-dfx-game.is-lose .igs-dfx-game-word{color:#9aa4b8;}
#igs-overlay .igs-dfx-game.is-draw .igs-dfx-game-word{color:#cfd6ff;}
@keyframes igs-dfx-game-pop{0%{opacity:0;transform:scale(2);}12%,85%{opacity:1;transform:scale(1);}100%{opacity:0;}}
#igs-overlay .igs-dfx-score{display:flex;align-items:center;justify-content:center;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-score-card{position:relative;min-width:180px;padding:14px 22px;border-radius:8px;background:#fff;color:#333;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.35);}
#igs-overlay .igs-dfx-score-subject{font-size:.85em;opacity:.7;}
#igs-overlay .igs-dfx-score-value{font-size:2.2em;font-weight:800;font-variant-numeric:tabular-nums;}
#igs-overlay .igs-dfx-score-stamp{position:absolute;right:-10px;top:-10px;padding:2px 8px;border:3px solid #c0392b;border-radius:6px;color:#c0392b;font-weight:800;transform:rotate(12deg);animation:igs-dfx-score-stamp .3s .8s ease-out both;}
@keyframes igs-dfx-score-stamp{from{opacity:0;transform:rotate(12deg) scale(1.8);}}

#igs-overlay .igs-dfx-pat .igs-dfx-pat-hand{position:absolute;top:6%;width:64px;height:64px;margin-left:-32px;color:#fdf6e3;filter:drop-shadow(0 3px 6px rgba(0,0,0,.4));animation:igs-dfx-pat .9s ease-in-out 2 both;}
#igs-overlay .igs-dfx-pat .igs-dfx-pat-hand svg{width:100%;height:100%;fill:currentColor;}
#igs-overlay .igs-dfx-pat-flowers{position:absolute;top:4%;width:90px;margin-left:-45px;display:flex;justify-content:space-between;color:#ff9fc0;font-size:1.3em;}
#igs-overlay .igs-dfx-pat-flowers i{font-style:normal;opacity:0;animation:igs-dfx-pat-flower 1s ease-out both;animation-delay:1.2s;}
#igs-overlay .igs-dfx-pat-flowers i:nth-child(2){animation-delay:1.35s;}
#igs-overlay .igs-dfx-pat-flowers i:nth-child(3){animation-delay:1.5s;}
@keyframes igs-dfx-pat{0%,100%{transform:translateY(0);}50%{transform:translateY(12px);}}
@keyframes igs-dfx-pat-flower{0%{opacity:0;transform:translateY(8px) scale(.6);}40%{opacity:1;}100%{opacity:0;transform:translateY(-18px) scale(1);}}
#igs-overlay .igs-dfx-poke-puff{position:absolute;top:22%;margin-left:-.6em;color:#fff;font-weight:800;font-size:1.4em;text-shadow:0 2px 6px rgba(0,0,0,.5);animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-fever{display:flex;align-items:flex-start;justify-content:flex-end;padding:12% 6% 0 0;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-fever-meter{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.94);color:#335;box-shadow:0 6px 18px rgba(0,0,0,.3);animation:igs-dfx-fever-in .4s ease-out both;}
#igs-overlay .igs-dfx-fever-bulb{width:12px;height:12px;border-radius:50%;background:#5aa9e6;}
#igs-overlay .igs-dfx-fever-value{font-weight:800;font-variant-numeric:tabular-nums;}
#igs-overlay .igs-dfx-fever.is-high .igs-dfx-fever-bulb{background:#e74c3c;}
#igs-overlay .igs-dfx-fever.is-high .igs-dfx-fever-value{color:#c0392b;}
@keyframes igs-dfx-fever-in{from{opacity:0;transform:translateX(24px);}}
#igs-overlay .igs-dfx-cheers{display:flex;flex-direction:column;align-items:center;justify-content:center;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-cheers-cups{display:flex;gap:4px;font-size:3em;}
#igs-overlay .igs-dfx-cheers-cup{font-style:normal;display:inline-block;}
#igs-overlay .igs-dfx-cheers-cup.is-left{animation:igs-dfx-cheers-l .5s ease-out both;}
#igs-overlay .igs-dfx-cheers-cup.is-right{transform:scaleX(-1);animation:igs-dfx-cheers-r .5s ease-out both;}
#igs-overlay .igs-dfx-cheers-splash{position:relative;width:60px;height:20px;}
#igs-overlay .igs-dfx-cheers-splash i{position:absolute;left:50%;top:0;width:6px;height:6px;border-radius:50%;background:#bfe6ff;opacity:0;animation:igs-dfx-cheers-drop .6s .45s ease-out both;}
#igs-overlay .igs-dfx-cheers-splash i:nth-child(2){margin-left:-14px;animation-delay:.5s;}
#igs-overlay .igs-dfx-cheers-splash i:nth-child(3){margin-left:10px;animation-delay:.55s;}
@keyframes igs-dfx-cheers-l{from{transform:translateX(-60px) rotate(-18deg);}to{transform:translateX(0) rotate(0);}}
@keyframes igs-dfx-cheers-r{from{transform:scaleX(-1) translateX(-60px) rotate(-18deg);}to{transform:scaleX(-1) translateX(0) rotate(0);}}
@keyframes igs-dfx-cheers-drop{0%{opacity:1;transform:translateY(0);}100%{opacity:0;transform:translateY(-22px);}}
#igs-overlay .igs-dfx-cook{display:flex;align-items:center;justify-content:center;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-cook-card{position:relative;min-width:160px;padding:26px 20px 12px;border-radius:12px;background:#fffaf0;color:#5a3b1c;text-align:center;box-shadow:0 8px 22px rgba(0,0,0,.32);}
#igs-overlay .igs-dfx-cook-steam{position:absolute;left:50%;top:-22px;width:50px;margin-left:-25px;display:flex;justify-content:space-between;}
#igs-overlay .igs-dfx-cook-steam i{width:6px;height:22px;border-radius:3px;background:rgba(255,255,255,.75);animation:igs-dfx-cook-steam 1.4s ease-in-out infinite;}
#igs-overlay .igs-dfx-cook-steam i:nth-child(2){animation-delay:.3s;}
#igs-overlay .igs-dfx-cook-steam i:nth-child(3){animation-delay:.6s;}
#igs-overlay .igs-dfx-cook-label{font-size:.75em;opacity:.7;letter-spacing:.2em;}
#igs-overlay .igs-dfx-cook-dish{font-size:1.2em;font-weight:800;}
@keyframes igs-dfx-cook-steam{0%{opacity:0;transform:translateY(6px);}50%{opacity:1;}100%{opacity:0;transform:translateY(-10px);}}
#igs-overlay .igs-dfx-cat-paws i{position:absolute;font-style:normal;font-size:1.8em;opacity:0;animation:igs-dfx-cat-paw .5s ease-out both;}
@keyframes igs-dfx-cat-paw{from{opacity:0;transform:scale(1.6);}to{opacity:.85;transform:scale(1);}}
#igs-overlay .igs-dfx-guqin{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-guqin-strings{position:absolute;left:12%;right:12%;bottom:34%;display:flex;flex-direction:column;gap:7px;}
#igs-overlay .igs-dfx-guqin-strings i{height:1px;background:rgba(245,230,200,.8);animation:igs-dfx-guqin-string .18s ease-in-out 8 alternate;}
#igs-overlay .igs-dfx-guqin-strings i:nth-child(2n){animation-delay:.09s;}
#igs-overlay .igs-dfx-guqin-notes i{position:absolute;top:18%;font-style:normal;color:#2b2b2b;font-size:1.6em;opacity:0;text-shadow:0 0 6px rgba(255,255,255,.6);animation:igs-dfx-guqin-note 2s ease-out both;}
@keyframes igs-dfx-guqin-string{to{transform:translateY(2px);}}
@keyframes igs-dfx-guqin-note{0%{opacity:0;transform:translateY(-10px);}25%{opacity:.9;}100%{opacity:0;transform:translateY(60px);}}
#igs-overlay .igs-dfx-go{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-go-board{position:relative;width:140px;height:140px;border-radius:4px;background-color:#d9b36c;background-image:linear-gradient(rgba(60,40,10,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(60,40,10,.6) 1px,transparent 1px);background-size:20px 20px;box-shadow:0 8px 22px rgba(0,0,0,.35);}
#igs-overlay .igs-dfx-go-stone{position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#666,#111);animation:igs-dfx-go-place .3s .3s ease-out both;}
#igs-overlay .igs-dfx-go-verdict{padding:2px 14px;border:2px solid #c0392b;border-radius:4px;color:#c0392b;background:#f3ead3;font-weight:800;font-size:1.4em;}
@keyframes igs-dfx-go-place{from{opacity:0;transform:scale(1.8);}}
#igs-overlay .igs-dfx-poem{display:flex;align-items:center;justify-content:center;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-poem-paper{position:relative;padding:18px 16px 40px;background:#f3ead3;border:1px solid #b89b6a;box-shadow:0 8px 22px rgba(0,0,0,.3);}
#igs-overlay .igs-dfx-poem-text{writing-mode:vertical-rl;max-height:60vh;color:#2b2b2b;font-size:1.2em;letter-spacing:.2em;-webkit-mask-image:linear-gradient(180deg,#000 50%,transparent 50%);mask-image:linear-gradient(180deg,#000 50%,transparent 50%);-webkit-mask-size:100% 200%;mask-size:100% 200%;-webkit-mask-position:0 100%;mask-position:0 100%;animation:igs-dfx-poem-write calc(var(--igs-dfx-life) * .6) linear forwards;}
#igs-overlay .igs-dfx-poem-seal{position:absolute;left:10px;bottom:10px;width:24px;height:24px;border:2px solid #c0392b;border-radius:3px;color:#c0392b;font-size:.8em;font-weight:800;line-height:20px;text-align:center;box-sizing:border-box;animation:igs-dfx-score-stamp .3s 2.4s ease-out both;}
@keyframes igs-dfx-poem-write{to{-webkit-mask-position:0 0;mask-position:0 0;}}
#igs-overlay .igs-dfx-edict{display:flex;align-items:center;justify-content:center;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-edict-scroll{display:flex;align-items:stretch;max-width:86%;}
#igs-overlay .igs-dfx-edict-rod{flex:none;width:10px;border-radius:5px;background:#7a4a1c;}
#igs-overlay .igs-dfx-edict-body{overflow:hidden;padding:16px 20px;background:#e8c35a;color:#3a2410;font-weight:700;writing-mode:vertical-rl;max-height:60vh;letter-spacing:.15em;transform-origin:50% 50%;animation:igs-dfx-edict-open .8s ease-out both;}
@keyframes igs-dfx-edict-open{from{transform:scaleX(0);}}
#igs-overlay .igs-dfx-tea{display:flex;align-items:flex-end;justify-content:center;padding-bottom:30%;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-tea-cup{position:relative;}
#igs-overlay .igs-dfx-tea-bowl{display:block;width:70px;height:34px;border-radius:0 0 35px 35px;background:linear-gradient(#f5f1e6,#cfc5ad);box-shadow:0 6px 16px rgba(0,0,0,.3);}
#igs-overlay .igs-dfx-tea-steam{position:absolute;left:50%;top:-30px;width:40px;margin-left:-20px;display:flex;justify-content:space-between;}
#igs-overlay .igs-dfx-tea-steam i{width:5px;height:22px;border-radius:3px;background:rgba(255,255,255,.7);animation:igs-dfx-cook-steam 1.6s ease-in-out infinite;}
#igs-overlay .igs-dfx-tea-steam i:nth-child(2){animation-delay:.4s;}
#igs-overlay .igs-dfx-tea-steam i:nth-child(3){animation-delay:.8s;}
#igs-overlay .igs-dfx-bow{display:none;}

/* 魔法世界独有：魔杖光束 + 咒语、坩埚冒泡、猫头鹰投信、扫帚掠空。光色由 --igs-magic 给出。 */
#igs-overlay .igs-dfx-spell{--igs-magic:#ffd36a;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-spell-beam{position:absolute;left:6%;bottom:22%;width:50%;height:3px;border-radius:2px;background:linear-gradient(90deg,transparent,var(--igs-magic) 30%,#fff);box-shadow:0 0 10px var(--igs-magic),0 0 24px var(--igs-magic);transform-origin:0 50%;transform:rotate(-24deg) scaleX(0);animation:igs-dfx-spell-beam .9s cubic-bezier(.2,.8,.3,1) both;}
#igs-overlay .igs-dfx-spell-burst{position:absolute;left:51%;top:47%;width:0;height:0;}
#igs-overlay .igs-dfx-spell-core{position:absolute;left:-60px;top:-60px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,#fff 0,var(--igs-magic) 22%,transparent 68%);opacity:0;mix-blend-mode:screen;animation:igs-dfx-spell-core 1.1s ease-out .45s both;}
#igs-overlay .igs-dfx-spell-burst i:not(.igs-dfx-spell-core){position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:0 0 8px var(--igs-magic),0 0 14px var(--igs-magic);opacity:0;animation:igs-dfx-spell-spark .9s ease-out both;}
#igs-overlay .igs-dfx-spell-words{position:absolute;left:0;right:0;top:24%;text-align:center;color:#fff8e6;font:italic 400 clamp(26px,5.4vw,48px)/1.2 "IM Fell English",Georgia,"Times New Roman",serif;letter-spacing:.18em;text-shadow:0 0 10px var(--igs-magic),0 0 26px var(--igs-magic),0 2px 6px rgba(0,0,0,.6);opacity:0;animation:igs-dfx-spell-words var(--igs-dfx-life) ease both;}
@keyframes igs-dfx-spell-beam{0%{transform:rotate(-24deg) scaleX(0);opacity:1;}45%{transform:rotate(-24deg) scaleX(1);opacity:1;}100%{transform:rotate(-24deg) scaleX(1);opacity:0;}}
@keyframes igs-dfx-spell-core{0%{opacity:0;transform:scale(.2);}25%{opacity:1;transform:scale(1);}100%{opacity:0;transform:scale(1.6);}}
@keyframes igs-dfx-spell-spark{0%{opacity:0;transform:rotate(var(--igs-spark-a)) translateX(0);}20%{opacity:1;}100%{opacity:0;transform:rotate(var(--igs-spark-a)) translateX(var(--igs-spark-d));}}
@keyframes igs-dfx-spell-words{0%,14%{opacity:0;transform:translateY(10px);letter-spacing:.4em;}30%{opacity:1;transform:none;letter-spacing:.18em;}84%{opacity:1;}100%{opacity:0;transform:translateY(-8px);}}
#igs-overlay .igs-dfx-potion{--igs-magic:#8ff0a4;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:14px;padding-bottom:26%;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-potion-pot{position:relative;width:120px;height:86px;}
#igs-overlay .igs-dfx-potion-body{position:absolute;left:0;right:0;bottom:0;height:76px;border-radius:14px 14px 60px 60px/14px 14px 70px 70px;background:radial-gradient(ellipse at 34% 30%,#4a4f5c,#1d2027 60%,#0e1014);box-shadow:0 10px 22px rgba(0,0,0,.5),inset 0 -6px 12px rgba(0,0,0,.5);}
#igs-overlay .igs-dfx-potion-body::before{content:"";position:absolute;left:-6px;right:-6px;top:-4px;height:12px;border-radius:6px;background:linear-gradient(#5a5f6c,#23262e);}
#igs-overlay .igs-dfx-potion-brew{position:absolute;z-index:1;left:8px;right:8px;top:4px;height:16px;border-radius:50%;background:radial-gradient(ellipse at 50% 40%,#fff 0,var(--igs-magic) 30%,rgba(0,0,0,.55) 100%),var(--igs-magic);box-shadow:0 0 18px var(--igs-magic);}
#igs-overlay .igs-dfx-potion-bubbles{position:absolute;z-index:2;left:10px;right:10px;top:-6px;height:20px;}
#igs-overlay .igs-dfx-potion-bubbles i{position:absolute;bottom:0;width:9px;height:9px;margin-left:-4.5px;border-radius:50%;border:1.5px solid var(--igs-magic);background:rgba(255,255,255,.22);animation:igs-dfx-potion-bubble 1.2s ease-out infinite;}
#igs-overlay .igs-dfx-potion-smoke{position:absolute;z-index:0;left:50%;top:-58px;width:80px;margin-left:-40px;height:60px;}
#igs-overlay .igs-dfx-potion-smoke i{position:absolute;bottom:0;left:30%;width:30px;height:30px;border-radius:50%;background:radial-gradient(circle,var(--igs-magic),transparent 70%);opacity:0;animation:igs-dfx-potion-smoke 2.2s ease-out infinite;}
#igs-overlay .igs-dfx-potion-smoke i:nth-child(2){left:6%;animation-delay:.7s;}
#igs-overlay .igs-dfx-potion-smoke i:nth-child(3){left:54%;animation-delay:1.4s;}
#igs-overlay .igs-dfx-potion-label{display:flex;flex-direction:column;align-items:center;gap:2px;padding:7px 18px;border:1px solid #9c7a46;border-radius:3px;background:linear-gradient(160deg,#f1e3c0,#e2cc98);color:#2b1d10;font-family:"IM Fell English",Georgia,"Times New Roman",serif;box-shadow:0 6px 16px rgba(0,0,0,.35);opacity:0;animation:igs-dfx-magic-rise .5s ease-out .5s both;}
#igs-overlay .igs-dfx-potion-label span{font-size:12px;letter-spacing:.3em;color:#7a1f2b;}
#igs-overlay .igs-dfx-potion-label b{font-size:18px;font-weight:400;letter-spacing:.08em;}
@keyframes igs-dfx-magic-rise{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:none;}}
@keyframes igs-dfx-potion-bubble{0%{opacity:0;transform:translateY(0) scale(.4);}30%{opacity:1;}100%{opacity:0;transform:translateY(-34px) scale(1.15);}}
@keyframes igs-dfx-potion-smoke{0%{opacity:0;transform:translateY(0) scale(.5);}30%{opacity:.75;}100%{opacity:0;transform:translateY(-46px) scale(1.6);}}
#igs-overlay .igs-dfx-owl{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-owl-flight{position:absolute;left:0;top:16%;width:86px;animation:igs-dfx-owl-fly 1.9s cubic-bezier(.4,.1,.6,.9) both;}
#igs-overlay .igs-dfx-owl-bird{display:block;width:100%;fill:#3b2c22;filter:drop-shadow(0 4px 6px rgba(0,0,0,.35));}
#igs-overlay .igs-dfx-owl-wing{transform-box:fill-box;animation:igs-dfx-owl-flap .22s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-owl-wing.is-left{transform-origin:100% 60%;}
#igs-overlay .igs-dfx-owl-wing.is-right{transform-origin:0 60%;}
#igs-overlay .igs-dfx-owl-drop{position:absolute;left:50%;top:50%;display:flex;flex-direction:column;align-items:center;gap:8px;transform:translate(-50%,-50%);animation:igs-dfx-owl-drop .9s cubic-bezier(.3,.7,.4,1) .75s both;}
#igs-overlay .igs-dfx-owl-letter{position:relative;width:120px;height:78px;border-radius:3px;background:linear-gradient(160deg,#f1e3c0,#dcc391);box-shadow:0 10px 22px rgba(0,0,0,.4),inset 0 0 14px rgba(120,80,30,.25);overflow:hidden;}
#igs-overlay .igs-dfx-owl-letter::before{content:"";position:absolute;left:0;right:0;top:0;height:44px;background:linear-gradient(160deg,#e8d5a8,#d4b981);clip-path:polygon(0 0,100% 0,50% 100%);}
#igs-overlay .igs-dfx-owl-seal{position:absolute;left:50%;top:30px;width:24px;height:24px;margin-left:-12px;border-radius:50%;background:radial-gradient(circle at 38% 34%,#b8323e,#7a1f2b 62%,#5a141e);box-shadow:0 2px 3px rgba(0,0,0,.35);}
#igs-overlay .igs-dfx-owl-from{padding:3px 12px;border-radius:2px;background:rgba(20,24,48,.78);color:#f3e2b6;font:15px/1.5 "IM Fell English",Georgia,"Times New Roman",serif;letter-spacing:.1em;}
@keyframes igs-dfx-owl-fly{0%{transform:translate(110vw,6vh) scale(.7);}55%{transform:translate(48vw,0) scale(1);}100%{transform:translate(-30vw,-10vh) scale(.8);}}
@keyframes igs-dfx-owl-flap{from{transform:scaleY(1);}to{transform:scaleY(-.55);}}
@keyframes igs-dfx-owl-drop{0%{opacity:0;transform:translate(-50%,-140%) rotate(-14deg);}60%{opacity:1;transform:translate(-50%,-44%) rotate(4deg);}100%{opacity:1;transform:translate(-50%,-50%) rotate(-2deg);}}
#igs-overlay .igs-dfx-broom{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-broom-wind i{position:absolute;left:0;width:34%;height:2px;border-radius:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.75),transparent);opacity:0;animation:igs-dfx-broom-wind .7s ease-out both;}
#igs-overlay .igs-dfx-broom-flight{position:absolute;left:0;top:30%;width:140px;animation:igs-dfx-broom-fly 1.3s cubic-bezier(.5,0,.5,1) .15s both;}
#igs-overlay .igs-dfx-broom-stick{display:block;width:100%;filter:drop-shadow(0 4px 5px rgba(0,0,0,.35));}
#igs-overlay .igs-dfx-broom-trail{position:absolute;right:100%;top:40%;width:160px;height:6px;border-radius:3px;background:linear-gradient(90deg,transparent,rgba(255,226,150,.85));box-shadow:0 0 10px rgba(255,214,120,.7);}
@keyframes igs-dfx-broom-wind{0%{opacity:0;transform:translateX(110vw);}30%{opacity:1;}100%{opacity:0;transform:translateX(-40vw);}}
@keyframes igs-dfx-broom-fly{0%{transform:translate(-30vw,10vh) rotate(-8deg);}50%{transform:translate(45vw,-2vh) rotate(-12deg);}100%{transform:translate(115vw,-14vh) rotate(-16deg);}}
#igs-overlay .igs-dfx-hourglass{position:relative;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 0 10px rgba(255,214,120,.45));}
#igs-overlay .igs-dfx-hg-cap{display:block;width:70px;height:7px;border-radius:3px;background:linear-gradient(180deg,#f0cf78,#9c7a2e);}
#igs-overlay .igs-dfx-hg-glass{position:relative;width:54px;height:92px;background:rgba(200,220,255,.14);clip-path:polygon(0 0,100% 0,58% 50%,100% 100%,0 100%,42% 50%);}
#igs-overlay .igs-dfx-hg-sand{position:absolute;left:0;right:0;background:linear-gradient(180deg,#f6dc8e,#d9b45a);transform-origin:50% 100%;}
#igs-overlay .igs-dfx-hg-sand.is-top{top:12%;height:38%;animation:igs-dfx-hg-drain var(--igs-dfx-life) linear both;}
#igs-overlay .igs-dfx-hg-sand.is-bottom{bottom:0;height:40%;animation:igs-dfx-hg-fill var(--igs-dfx-life) linear both;}
#igs-overlay .igs-dfx-hg-stream{position:absolute;left:50%;top:48%;width:2px;height:52%;margin-left:-1px;background:#f0cf78;opacity:.9;}
@keyframes igs-dfx-hg-drain{from{transform:scaleY(1);}to{transform:scaleY(.08);}}
@keyframes igs-dfx-hg-fill{from{transform:scaleY(.1);}to{transform:scaleY(1);}}
#igs-overlay .igs-dfx-howler{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;animation:igs-dfx-fade var(--igs-dfx-life) ease both,igs-dfx-howler-quake .12s linear .9s 8;}
#igs-overlay .igs-dfx-howler-env{position:relative;width:130px;height:84px;border-radius:4px;background:linear-gradient(160deg,#c62f3a,#8a1620);box-shadow:0 10px 24px rgba(0,0,0,.45),inset 0 0 16px rgba(60,0,0,.4);perspective:300px;animation:igs-dfx-howler-rattle .09s linear 10,igs-dfx-howler-burst .4s ease-out .9s both;}
#igs-overlay .igs-dfx-howler-flap{position:absolute;left:0;right:0;top:0;height:48px;background:linear-gradient(160deg,#d8434d,#9e1d27);clip-path:polygon(0 0,100% 0,50% 100%);transform-origin:50% 0;animation:igs-dfx-howler-open .3s ease-out .85s both;}
#igs-overlay .igs-dfx-howler-mouth{max-width:min(86%,720px);text-align:center;color:#fff1e8;font:900 clamp(24px,5vw,44px)/1.3 "Source Han Serif CN","Songti SC",serif;letter-spacing:.06em;text-shadow:0 0 2px #ff2a1a,0 0 14px rgba(255,40,20,.85),0 3px 0 #6a0a10;}
#igs-overlay .igs-dfx-howler-mouth span{display:inline-block;opacity:0;animation:igs-dfx-howler-char .26s cubic-bezier(.2,1.6,.4,1) both;}
#igs-overlay .igs-dfx-howler-from{padding:3px 12px;border-radius:2px;background:rgba(80,8,14,.82);color:#ffd9cf;font:15px/1.5 "IM Fell English",Georgia,"Times New Roman",serif;letter-spacing:.12em;}
@keyframes igs-dfx-howler-rattle{0%,100%{transform:rotate(0);}25%{transform:rotate(-6deg) translateX(-3px);}75%{transform:rotate(6deg) translateX(3px);}}
@keyframes igs-dfx-howler-burst{0%{transform:scale(1);}40%{transform:scale(1.18);}100%{transform:scale(.86);opacity:.85;}}
@keyframes igs-dfx-howler-open{to{transform:rotateX(180deg);}}
@keyframes igs-dfx-howler-char{0%{opacity:0;transform:scale(2.4) rotate(-8deg);}100%{opacity:1;transform:none;}}
@keyframes igs-dfx-howler-quake{0%,100%{transform:translate(0,0);}25%{transform:translate(-4px,2px);}50%{transform:translate(3px,-3px);}75%{transform:translate(-2px,-2px);}}
/* 恐怖：停电 / 敲门 / 耳边低语。都只用 opacity 与 transform；减少动态时只保留淡入淡出。 */
#igs-overlay .igs-dfx-blackout-veil{position:absolute;inset:0;background:#000;opacity:0;animation:igs-dfx-blackout var(--igs-dfx-life) linear both;}
#igs-overlay .igs-dfx-blackout-text{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);max-width:80%;text-align:center;color:rgba(220,212,208,.72);font:400 clamp(16px,2.6vw,24px)/1.6 "Source Han Serif CN","Songti SC",serif;letter-spacing:.24em;opacity:0;animation:igs-dfx-blackout-text var(--igs-dfx-life) ease both;}
@keyframes igs-dfx-blackout{0%{opacity:0;}5%{opacity:.85;}8%{opacity:.1;}12%{opacity:.9;}14%{opacity:.25;}20%,78%{opacity:.97;}100%{opacity:0;}}
@keyframes igs-dfx-blackout-text{0%,30%{opacity:0;}42%,70%{opacity:1;}84%,100%{opacity:0;}}
#igs-overlay .igs-dfx-knock-pulse{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,.6) 100%);opacity:0;animation:igs-dfx-knock-pulse .38s ease-out both;}
#igs-overlay .igs-dfx-knock-hit{position:absolute;right:7%;color:rgba(236,228,224,.86);font:900 clamp(26px,4.4vw,46px)/1 "Source Han Serif CN","Songti SC",serif;text-shadow:0 2px 10px rgba(0,0,0,.85);opacity:0;animation:igs-dfx-knock-hit .9s cubic-bezier(.2,1.4,.4,1) both;}
#igs-overlay .igs-dfx-knock-hit:nth-of-type(even){right:auto;left:7%;}
@keyframes igs-dfx-knock-pulse{0%{opacity:0;}20%{opacity:1;}100%{opacity:0;}}
@keyframes igs-dfx-knock-hit{0%{opacity:0;transform:scale(1.6);}18%{opacity:1;transform:scale(1);}70%{opacity:.8;}100%{opacity:0;transform:translateY(-6px);}}
#igs-overlay .igs-dfx-murmur{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-murmur-text{position:absolute;top:34%;max-width:42%;color:rgba(236,230,230,.62);font:italic 400 clamp(15px,2.2vw,21px)/1.7 "Source Han Serif CN","Songti SC",serif;letter-spacing:.3em;text-shadow:0 0 10px rgba(0,0,0,.9);}
#igs-overlay .igs-dfx-murmur.is-left .igs-dfx-murmur-text{left:8%;}
#igs-overlay .igs-dfx-murmur.is-right .igs-dfx-murmur-text{right:8%;text-align:right;}
#igs-overlay .igs-dfx-murmur-text span{display:inline-block;opacity:0;animation:igs-dfx-murmur-char 2.4s ease both;}
@keyframes igs-dfx-murmur-char{0%{opacity:0;transform:translateX(-4px);filter:blur(5px);}25%{opacity:1;transform:none;filter:blur(0);}70%{opacity:.7;filter:blur(1px);}100%{opacity:0;filter:blur(4px);}}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-blackout-veil{animation:igs-dfx-fade var(--igs-dfx-life) ease both;opacity:.95;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-knock-hit,#igs-overlay .igs-dfx.is-reduced .igs-dfx-murmur-text span{animation:igs-dfx-fade 1.2s ease both;filter:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-knock-pulse{animation:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-hg-sand,#igs-overlay .igs-dfx.is-reduced .igs-dfx-howler-env,#igs-overlay .igs-dfx.is-reduced .igs-dfx-howler-flap{animation:none;}
#igs-overlay .igs-dfx.is-reduced.igs-dfx-howler{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-howler-mouth span{animation:none;opacity:1;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-spell-beam,#igs-overlay .igs-dfx.is-reduced .igs-dfx-spell-burst i,#igs-overlay .igs-dfx.is-reduced .igs-dfx-potion-bubbles i,#igs-overlay .igs-dfx.is-reduced .igs-dfx-potion-smoke i,#igs-overlay .igs-dfx.is-reduced .igs-dfx-owl-flight,#igs-overlay .igs-dfx.is-reduced .igs-dfx-broom-wind,#igs-overlay .igs-dfx.is-reduced .igs-dfx-broom-flight{display:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-spell-words,#igs-overlay .igs-dfx.is-reduced .igs-dfx-owl-drop,#igs-overlay .igs-dfx.is-reduced .igs-dfx-potion-label{animation:none;opacity:1;}
/* 载具：急刹速度线 + 字样、起步流线 + 去向条、到站牌、车票。 */
#igs-overlay .igs-dfx-brake{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-brake-lines i{position:absolute;right:0;width:46%;height:2px;border-radius:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.72));opacity:0;animation:igs-dfx-brake-line .5s ease-out both;}
#igs-overlay .igs-dfx-brake-word{position:absolute;right:9%;top:16%;color:#fff;font:italic 900 clamp(26px,5vw,48px)/1 "Source Han Sans CN","PingFang SC",sans-serif;letter-spacing:.06em;text-shadow:0 3px 0 rgba(0,0,0,.45),0 0 12px rgba(0,0,0,.5);animation:igs-dfx-brake-word var(--igs-dfx-life) cubic-bezier(.2,1.4,.4,1) both;}
@keyframes igs-dfx-brake-line{0%{opacity:0;transform:translateX(30%)}25%{opacity:1}100%{opacity:0;transform:translateX(-60%)}}
@keyframes igs-dfx-brake-word{0%{opacity:0;transform:rotate(-8deg) translateX(30px) scale(1.4)}14%{opacity:1;transform:rotate(-8deg) scale(1)}75%{opacity:1;transform:rotate(-8deg)}100%{opacity:0;transform:rotate(-8deg) translateX(-10px)}}
#igs-overlay .igs-dfx-depart{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-depart-flow i{position:absolute;left:0;width:30%;height:2px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);opacity:0;animation:igs-dfx-depart-flow 1.1s cubic-bezier(.5,0,.8,.6) both;}
#igs-overlay .igs-dfx-depart-chip{position:absolute;left:6%;top:12%;display:flex;align-items:baseline;gap:10px;padding:8px 18px 8px 14px;border-left:4px solid #4fb3a5;border-radius:3px;background:rgba(16,20,28,.84);color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.35);animation:igs-dfx-depart-chip var(--igs-dfx-life) cubic-bezier(.2,.8,.3,1) both;}
#igs-overlay .igs-dfx-depart-chip span{font-size:12px;letter-spacing:.3em;opacity:.7;}
#igs-overlay .igs-dfx-depart-chip b{font-size:clamp(16px,2.6vmin,22px);letter-spacing:.08em;}
#igs-overlay .igs-dfx-depart.is-ship .igs-dfx-depart-chip{border-left-color:#3f86d0;}
#igs-overlay .igs-dfx-depart.is-plane .igs-dfx-depart-chip{border-left-color:#6aa0d8;}
#igs-overlay .igs-dfx-depart.is-airship .igs-dfx-depart-chip{border-left-color:#c8913a;background:rgba(40,28,18,.86);color:#f6e6c4;}
#igs-overlay .igs-dfx-depart.is-sky .igs-dfx-depart-chip{border-left-color:#8fd0e8;}
#igs-overlay .igs-dfx-depart.is-carriage .igs-dfx-depart-chip{border-left-color:#a33b2c;background:rgba(40,28,18,.88);color:#f3e6c8;font-family:"Source Han Serif CN","Songti SC",serif;}
@keyframes igs-dfx-depart-flow{0%{opacity:0;transform:translateX(250%)}30%{opacity:.9}100%{opacity:0;transform:translateX(-120%)}}
@keyframes igs-dfx-depart-chip{0%{opacity:0;transform:translateX(-24px)}12%{opacity:1;transform:none}85%{opacity:1;transform:none}100%{opacity:0;transform:translateX(16px)}}
#igs-overlay .igs-dfx-arrive{display:flex;align-items:flex-start;justify-content:center;padding-top:9%;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-arrive-board{position:relative;min-width:min(46%,320px);max-width:80%;padding:14px 26px 10px;box-sizing:border-box;overflow:hidden;background:#fbfbf8;color:#1f2328;text-align:center;border-radius:4px;box-shadow:0 10px 26px rgba(0,0,0,.38);animation:igs-dfx-arrive-in .6s cubic-bezier(.2,.9,.3,1.2) both;}
#igs-overlay .igs-dfx-arrive-name{font:800 clamp(22px,4.4vmin,36px)/1.25 "Source Han Sans CN","PingFang SC",sans-serif;letter-spacing:.18em;text-indent:.18em;word-break:break-all;}
#igs-overlay .igs-dfx-arrive-bar{display:block;height:6px;margin:8px -26px 6px;background:#3a9b6c;}
#igs-overlay .igs-dfx-arrive-sub{font-size:12px;letter-spacing:.4em;text-indent:.4em;color:#59606a;}
#igs-overlay .igs-dfx-arrive.is-ship .igs-dfx-arrive-bar{background:#2f6fb5;}
#igs-overlay .igs-dfx-arrive.is-car .igs-dfx-arrive-bar{background:#d08a2e;}
#igs-overlay .igs-dfx-arrive.is-plane .igs-dfx-arrive-bar{background:#5a8fc8;}
#igs-overlay .igs-dfx-arrive.is-airship .igs-dfx-arrive-bar{background:#c8913a;}
#igs-overlay .igs-dfx-arrive.is-sky .igs-dfx-arrive-bar{background:#7cc0dc;}
#igs-overlay .igs-dfx-arrive.is-carriage .igs-dfx-arrive-board{background:linear-gradient(180deg,#5a3a22,#3e2716);color:#f1d48a;border:2px solid #b08a4a;border-radius:2px;}
#igs-overlay .igs-dfx-arrive.is-carriage .igs-dfx-arrive-name{font-family:"Source Han Serif CN","Songti SC",serif;font-weight:700;}
#igs-overlay .igs-dfx-arrive.is-carriage .igs-dfx-arrive-bar{height:1px;margin:8px 0 6px;background:rgba(241,212,138,.55);}
#igs-overlay .igs-dfx-arrive.is-carriage .igs-dfx-arrive-sub{color:#e6c98a;}
@keyframes igs-dfx-arrive-in{from{opacity:0;transform:translateY(-18px)}to{opacity:1;transform:none}}
#igs-overlay .igs-dfx-ticket{display:flex;align-items:center;justify-content:center;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-ticket-card{position:relative;min-width:min(52%,340px);max-width:84%;padding:12px 26px 14px;box-sizing:border-box;background:linear-gradient(180deg,#e9f3ff,#d7e8fb);color:#1d2a3a;border-radius:6px;box-shadow:0 10px 24px rgba(0,0,0,.35);transform:rotate(-2deg);-webkit-mask:radial-gradient(circle 10px at left,transparent 98%,#000) left/51% 100% no-repeat,radial-gradient(circle 10px at right,transparent 98%,#000) right/51% 100% no-repeat;mask:radial-gradient(circle 10px at left,transparent 98%,#000) left/51% 100% no-repeat,radial-gradient(circle 10px at right,transparent 98%,#000) right/51% 100% no-repeat;animation:igs-dfx-ticket-in .55s cubic-bezier(.2,.9,.3,1.1) both;}
#igs-overlay .igs-dfx-ticket-head{padding-bottom:6px;margin-bottom:8px;border-bottom:1px dashed rgba(29,42,58,.35);color:#3d6a9e;font-size:12px;letter-spacing:.4em;text-align:center;}
#igs-overlay .igs-dfx-ticket-route{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:6px 14px;font:800 clamp(18px,3.4vmin,28px)/1.2 "Source Han Sans CN","PingFang SC",sans-serif;letter-spacing:.06em;}
#igs-overlay .igs-dfx-ticket-route i{font-style:normal;font-weight:400;opacity:.55;}
#igs-overlay .igs-dfx-ticket-note{margin-top:6px;color:#4a5a6e;font-size:13px;text-align:center;font-variant-numeric:tabular-nums;}
#igs-overlay .igs-dfx-ticket-punch{position:absolute;right:16%;top:8px;width:10px;height:10px;border-radius:50%;background:rgba(10,14,20,.72);opacity:0;animation:igs-dfx-ticket-punch .18s ease-out .6s both;}
#igs-overlay .igs-dfx-ticket.is-ship .igs-dfx-ticket-card{background:linear-gradient(180deg,#eaf6ee,#d3ecdc);}
#igs-overlay .igs-dfx-ticket.is-ship .igs-dfx-ticket-head{color:#2f7a52;}
#igs-overlay .igs-dfx-ticket.is-plane .igs-dfx-ticket-card{background:linear-gradient(90deg,#1f4f8f 0 10px,#fff 10px);}
@keyframes igs-dfx-ticket-in{from{opacity:0;transform:translateY(24px) rotate(-6deg)}to{opacity:1;transform:rotate(-2deg)}}
@keyframes igs-dfx-ticket-punch{from{opacity:0;transform:scale(1.8)}to{opacity:1;transform:none}}
#igs-overlay .igs-dfx-arrive.is-scifi .igs-dfx-arrive-board,#igs-overlay .igs-dfx-ticket.is-scifi .igs-dfx-ticket-card{background:rgba(8,24,36,.92);color:#d8fbff;box-shadow:0 0 16px rgba(60,200,255,.4);}
#igs-overlay .igs-dfx-arrive.is-scifi .igs-dfx-arrive-bar{background:#3cc8ff;}
#igs-overlay .igs-dfx-ticket.is-scifi .igs-dfx-ticket-head,#igs-overlay .igs-dfx-ticket.is-scifi .igs-dfx-ticket-note{color:#8fe6ff;}
#igs-overlay .igs-dfx-arrive.is-taisho .igs-dfx-arrive-board,#igs-overlay .igs-dfx-ticket.is-taisho .igs-dfx-ticket-card{background:#f4ead6;color:#2a1c18;font-family:"Yu Mincho","YuMincho","Hiragino Mincho ProN","MS PMincho",serif;}
#igs-overlay .igs-dfx-arrive.is-taisho .igs-dfx-arrive-bar{background:#7b2e2a;}
#igs-overlay .igs-dfx-ticket.is-taisho .igs-dfx-ticket-head{color:#7b2e2a;}
#igs-overlay .igs-dfx-arrive.is-magic .igs-dfx-arrive-board,#igs-overlay .igs-dfx-ticket.is-magic .igs-dfx-ticket-card{background:linear-gradient(160deg,#f1e3c0,#e2cc98);color:#2b1d10;font-family:"IM Fell English",Georgia,"Times New Roman",serif;}
#igs-overlay .igs-dfx-arrive.is-magic .igs-dfx-arrive-bar{background:#7a1f2b;}
#igs-overlay .igs-dfx-ticket.is-magic .igs-dfx-ticket-head{color:#7a1f2b;}
#igs-overlay .igs-dfx-arrive.is-apocalypse .igs-dfx-arrive-board{background:#d9cdb3;color:#2a2219;font-family:"Courier New",monospace;}
#igs-overlay .igs-dfx-arrive.is-apocalypse .igs-dfx-arrive-bar{background:#8a5a2a;}

/* 洗浴：水汽团、淋浴水帘、水花与镜头水珠、吹风机的风。 */
#igs-overlay .igs-dfx-steam-cloud i{position:absolute;width:70%;height:80%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,253,248,.92),rgba(255,253,248,.5) 55%,transparent);opacity:0;animation:igs-dfx-steam-puff var(--igs-dfx-life) ease-out both;}
@keyframes igs-dfx-steam-puff{0%{opacity:0;transform:translate3d(0,30%,0) scale(.6)}30%{opacity:1;transform:translate3d(0,0,0) scale(1)}70%{opacity:.9}100%{opacity:0;transform:translate3d(0,-14%,0) scale(1.25)}}
#igs-overlay .igs-dfx-shower{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-shower-rain{position:absolute;inset:0;overflow:hidden;transform:rotate(5deg) scale(1.1);}
#igs-overlay .igs-dfx-shower-rain i{position:absolute;top:-30%;width:1.5px;height:26%;background:linear-gradient(180deg,transparent,rgba(225,238,255,.7));opacity:0;animation:igs-dfx-shower-drop .55s linear infinite;}
#igs-overlay .igs-dfx-shower-mist{position:absolute;left:-10%;right:-10%;bottom:-20%;height:60%;background:radial-gradient(ellipse at 50% 100%,rgba(250,246,240,.55),transparent 70%);opacity:0;animation:igs-dfx-shower-mist var(--igs-dfx-life) ease-out both;}
@keyframes igs-dfx-shower-drop{0%{opacity:0;transform:translate3d(0,0,0)}15%{opacity:1}100%{opacity:.6;transform:translate3d(0,560%,0)}}
@keyframes igs-dfx-shower-mist{0%{opacity:0;transform:translate3d(0,20%,0)}45%{opacity:1;transform:none}100%{opacity:.8;transform:none}}
#igs-overlay .igs-dfx-splash{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-splash-burst{position:absolute;left:50%;top:58%;width:0;height:0;}
#igs-overlay .igs-dfx-splash-burst i{position:absolute;left:-5px;top:-6px;width:10px;height:13px;border-radius:50%/60% 60% 40% 40%;background:radial-gradient(circle at 35% 30%,#fff,rgba(190,225,255,.85) 45%,rgba(120,180,240,.5));opacity:0;animation:igs-dfx-splash-drop .7s cubic-bezier(.2,.7,.4,1) both;}
#igs-overlay .igs-dfx-splash-lens i{position:absolute;width:var(--igs-sp-s);height:calc(var(--igs-sp-s) * 1.15);border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.75),rgba(255,255,255,.08) 40%,rgba(160,200,240,.18) 70%,rgba(255,255,255,.4));box-shadow:0 2px 3px rgba(0,0,0,.18);opacity:0;animation:igs-dfx-splash-lens var(--igs-dfx-life) ease-in both;}
@keyframes igs-dfx-splash-drop{0%{opacity:0;transform:rotate(var(--igs-sp-a)) translateY(0) scale(.5)}15%{opacity:1}100%{opacity:0;transform:rotate(var(--igs-sp-a)) translateY(calc(var(--igs-sp-d) * -1)) scale(1)}}
@keyframes igs-dfx-splash-lens{0%,12%{opacity:0;transform:scale(1.6)}20%{opacity:1;transform:none}70%{opacity:1;transform:none}100%{opacity:0;transform:translateY(28px)}}
#igs-overlay .igs-dfx-hairdry{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-hairdry-wind{position:absolute;top:8%;width:200px;height:110px;margin-left:-100px;}
#igs-overlay .igs-dfx-hairdry-wind i{position:absolute;left:0;width:44%;height:16px;border-top:2px solid rgba(255,255,255,.7);border-radius:50%;opacity:0;animation:igs-dfx-hairdry-gust .8s ease-out infinite;}
@keyframes igs-dfx-hairdry-gust{0%{opacity:0;transform:translateX(-40%)}30%{opacity:.9}100%{opacity:0;transform:translateX(140%)}}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-brake-lines,#igs-overlay .igs-dfx.is-reduced .igs-dfx-depart-flow,#igs-overlay .igs-dfx.is-reduced .igs-dfx-shower-rain,#igs-overlay .igs-dfx.is-reduced .igs-dfx-splash-burst,#igs-overlay .igs-dfx.is-reduced .igs-dfx-hairdry-wind{display:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-brake-word{transform:rotate(-8deg);}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-ticket-punch,#igs-overlay .igs-dfx.is-reduced .igs-dfx-splash-lens i{opacity:1;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-steam-cloud i,#igs-overlay .igs-dfx.is-reduced .igs-dfx-shower-mist{opacity:.8;}

/* 居家 · 入睡 / 起床：场景级氛围（不是主视角眼皮，那是 fx 的 eye）。只用 opacity 与 transform。
   入睡：画面渐暗成夜蓝，几个「Z」从一角轻轻飘上去。起床：晨光自上而下铺开，一道柔光扫过。 */
#igs-overlay .igs-dfx-sleep,#igs-overlay .igs-dfx-wake{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-rest-veil{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 46%,rgba(18,22,42,.5),rgba(6,8,20,.82));opacity:0;animation:igs-dfx-sleep-veil var(--igs-dfx-life) ease both;}
@keyframes igs-dfx-sleep-veil{0%{opacity:0}30%{opacity:1}82%{opacity:1}100%{opacity:0}}
#igs-overlay .igs-dfx-sleep-z{position:absolute;right:24%;top:48%;color:rgba(214,224,255,.9);font:700 clamp(20px,4vw,34px)/1 "Quicksand","Source Han Sans CN",sans-serif;text-shadow:0 2px 10px rgba(0,0,0,.6);}
#igs-overlay .igs-dfx-sleep-z i{position:absolute;font-style:normal;opacity:0;animation:igs-dfx-zzz 2.2s ease-out both;}
#igs-overlay .igs-dfx-sleep-z i:nth-child(2){font-size:1.3em;}
#igs-overlay .igs-dfx-sleep-z i:nth-child(3){font-size:1.7em;}
@keyframes igs-dfx-zzz{0%{opacity:0;transform:translate(0,0) rotate(-6deg)}25%{opacity:.95}100%{opacity:0;transform:translate(28px,-70px) rotate(10deg)}}
#igs-overlay .igs-dfx-rest-text{position:absolute;left:50%;top:62%;transform:translateX(-50%);max-width:80%;text-align:center;color:rgba(232,236,250,.86);font:400 clamp(15px,2.4vw,22px)/1.6 "Source Han Serif CN","Songti SC",serif;letter-spacing:.2em;text-indent:.2em;text-shadow:0 2px 10px rgba(0,0,0,.7);opacity:0;animation:igs-dfx-rest-text var(--igs-dfx-life) ease both;}
@keyframes igs-dfx-rest-text{0%,22%{opacity:0}38%,78%{opacity:1}100%{opacity:0}}
/* 起床：顶上一层暖白晨光自上而下铺满、再退去；一道斜向柔光扫过（省电时只留晨光淡入淡出）。 */
#igs-overlay .igs-dfx-wake .igs-dfx-rest-text{color:#5a4a30;text-shadow:0 1px 6px rgba(255,250,235,.7);}
#igs-overlay .igs-dfx-wake-glow{position:absolute;inset:0;background:linear-gradient(180deg,rgba(255,246,220,.72),rgba(255,238,200,.3) 42%,transparent 78%);opacity:0;transform:translate3d(0,-100%,0);animation:igs-dfx-wake-glow var(--igs-dfx-life) cubic-bezier(.3,.7,.3,1) both;}
@keyframes igs-dfx-wake-glow{0%{opacity:0;transform:translate3d(0,-100%,0)}24%{opacity:1;transform:none}66%{opacity:.9;transform:none}100%{opacity:0;transform:none}}
#igs-overlay .igs-dfx-wake-sheen{position:absolute;top:-20%;bottom:-20%;left:0;width:40%;background:linear-gradient(100deg,transparent,rgba(255,252,240,.42) 50%,transparent);transform:translate3d(-120%,0,0) skewX(-12deg);animation:igs-dfx-wake-sheen var(--igs-dfx-life) ease-out both;}
@keyframes igs-dfx-wake-sheen{0%,20%{transform:translate3d(-120%,0,0) skewX(-12deg)}70%,100%{transform:translate3d(320%,0,0) skewX(-12deg)}}
#igs-overlay .igs-dfx-wake.is-night .igs-dfx-wake-glow{background:linear-gradient(180deg,rgba(150,176,230,.42),rgba(110,136,200,.18) 42%,transparent 78%);}
#igs-overlay .igs-dfx-wake.is-night .igs-dfx-wake-sheen{display:none;}
#igs-overlay .igs-dfx-wake.is-night .igs-dfx-rest-text{color:rgba(232,236,250,.9);text-shadow:0 2px 10px rgba(0,0,0,.7);}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-sleep-z,#igs-overlay .igs-dfx.is-reduced .igs-dfx-wake-sheen{display:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-rest-veil{opacity:.8;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-wake-glow{transform:none;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}

/* 衣 · 换装登场：立绘脚下一束柔光往上收拢、一圈光点环绕扫过、服装名落章。只用 opacity 与 transform。
   魔法世界观（is-magic）换成旋转魔法阵的青金光；古风（is-ancient）换成暖金 + 楷体。 */
#igs-overlay .igs-dfx-dressup{--igs-du:#ffe6a8;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-dressup.is-magic{--igs-du:#9fe0ff;}
#igs-overlay .igs-dfx-dressup.is-ancient{--igs-du:#ffd27a;}
#igs-overlay .igs-dfx-dressup-stage{position:absolute;left:50%;bottom:4%;width:min(42%,320px);height:86%;margin-left:min(-21%,-160px);}
#igs-overlay .igs-dfx-dressup-beam{position:absolute;left:50%;bottom:0;width:70%;height:100%;margin-left:-35%;background:linear-gradient(0deg,color-mix(in srgb,var(--igs-du) 55%,transparent),transparent 70%);-webkit-mask-image:linear-gradient(0deg,#000,transparent);mask-image:linear-gradient(0deg,#000,transparent);opacity:0;transform:scaleY(.4);transform-origin:50% 100%;animation:igs-dfx-dressup-beam var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-dressup-ring{position:absolute;left:50%;bottom:6%;width:84%;aspect-ratio:1/.34;margin-left:-42%;border-radius:50%;border:2px solid var(--igs-du);box-shadow:0 0 14px var(--igs-du),inset 0 0 10px var(--igs-du);opacity:0;transform:scale(.3);animation:igs-dfx-dressup-ring var(--igs-dfx-life) cubic-bezier(.3,.7,.3,1) both;}
#igs-overlay .igs-dfx-dressup-sparks{position:absolute;left:50%;top:46%;width:0;height:0;}
#igs-overlay .igs-dfx-dressup-sparks i{position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:50%;background:#fff;box-shadow:0 0 8px var(--igs-du),0 0 16px var(--igs-du);opacity:0;transform:rotate(var(--igs-du-a)) translateY(0);animation:igs-dfx-dressup-spark 1s ease-out both;}
#igs-overlay .igs-dfx-dressup-label{position:absolute;left:50%;bottom:16%;transform:translateX(-50%);padding:5px 18px;border-radius:999px;background:rgba(24,20,14,.72);color:#fff;font:700 clamp(15px,2.6vmin,21px)/1.3 "Source Han Sans CN","PingFang SC",sans-serif;letter-spacing:.14em;text-indent:.14em;box-shadow:0 0 16px color-mix(in srgb,var(--igs-du) 60%,transparent);opacity:0;animation:igs-dfx-dressup-label var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-dressup.is-magic .igs-dfx-dressup-label{font-family:"IM Fell English",Georgia,serif;}
#igs-overlay .igs-dfx-dressup.is-ancient .igs-dfx-dressup-label{font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;background:rgba(60,36,16,.78);color:#f6e6c4;}
@keyframes igs-dfx-dressup-beam{0%{opacity:0;transform:scaleY(.4)}24%{opacity:1;transform:scaleY(1)}72%{opacity:.9;transform:scaleY(1)}100%{opacity:0;transform:scaleY(1)}}
@keyframes igs-dfx-dressup-ring{0%{opacity:0;transform:scale(.3)}22%{opacity:1;transform:scale(1)}70%{opacity:.8;transform:scale(1.04)}100%{opacity:0;transform:scale(1.1)}}
@keyframes igs-dfx-dressup-spark{0%{opacity:0;transform:rotate(var(--igs-du-a)) translateY(0) scale(.5)}25%{opacity:1}100%{opacity:0;transform:rotate(var(--igs-du-a)) translateY(-120px) scale(1)}}
@keyframes igs-dfx-dressup-label{0%,16%{opacity:0;transform:translateX(-50%) translateY(8px)}32%{opacity:1;transform:translateX(-50%)}78%{opacity:1;transform:translateX(-50%)}100%{opacity:0;transform:translateX(-50%) translateY(-6px)}}
/* 魔法换皮：光环改成双层旋转魔法阵感（第二圈反向、虚线）。 */
#igs-overlay .igs-dfx-dressup.is-magic .igs-dfx-dressup-ring{border-style:double;border-width:3px;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-dressup-sparks{display:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-dressup-beam{transform:scaleY(1);animation:igs-dfx-fade var(--igs-dfx-life) ease both;opacity:.7;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-dressup-ring{transform:scale(1);animation:igs-dfx-fade var(--igs-dfx-life) ease both;opacity:.7;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-dressup-label{opacity:1;transform:translateX(-50%);}

/* 衣 · 披衣 / 整理着装：立绘肩头落一层暖光、一道柔光顺着布料滑下，角落浮出动作字样。只用 opacity 与 transform。 */
#igs-overlay .igs-dfx-drape{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-drape-stage{position:absolute;left:50%;bottom:4%;width:min(42%,320px);height:70%;margin-left:min(-21%,-160px);}
#igs-overlay .igs-dfx-drape-glow{position:absolute;left:50%;top:4%;width:84%;height:30%;margin-left:-42%;border-radius:50%;background:radial-gradient(ellipse at 50% 40%,rgba(255,228,180,.42),transparent 70%);opacity:0;animation:igs-dfx-drape-glow var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-drape-sheen{position:absolute;left:30%;top:0;width:40%;height:70%;background:linear-gradient(160deg,transparent,rgba(255,250,238,.5) 50%,transparent);opacity:0;transform:translateY(-30%);animation:igs-dfx-drape-sheen var(--igs-dfx-life) ease-out both;}
#igs-overlay .igs-dfx-drape-label{position:absolute;right:9%;top:16%;padding:5px 16px;border-radius:999px;background:rgba(40,30,20,.72);color:#ffe8c8;font:600 clamp(14px,2.5vmin,20px)/1.3 "Source Han Sans CN","PingFang SC",sans-serif;letter-spacing:.12em;box-shadow:0 0 14px rgba(255,210,150,.4);opacity:0;animation:igs-dfx-drape-label var(--igs-dfx-life) ease both;}
@keyframes igs-dfx-drape-glow{0%{opacity:0}26%{opacity:1}72%{opacity:.85}100%{opacity:0}}
@keyframes igs-dfx-drape-sheen{0%,10%{opacity:0;transform:translateY(-30%)}30%{opacity:1}60%{opacity:.6;transform:translateY(60%)}100%{opacity:0;transform:translateY(90%)}}
@keyframes igs-dfx-drape-label{0%,14%{opacity:0;transform:translateY(8px)}32%{opacity:1;transform:none}78%{opacity:1}100%{opacity:0;transform:translateY(-6px)}}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-drape-sheen{display:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-drape-glow{opacity:.7;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-drape-label{opacity:1;transform:none;}

/* 衣 · 试衣镜：中央立起一面全身镜，镜面一道微光斜扫而过（像照出新装），镜框下方落新装名。
   古风（is-ancient）换成暖铜镜框 + 楷体。只用 opacity 与 transform。 */
#igs-overlay .igs-dfx-fitting{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-fitting-mirror{position:relative;width:min(26%,180px);aspect-ratio:1/2.2;border-radius:999px 999px 14px 14px;padding:6px;box-sizing:border-box;background:linear-gradient(160deg,#d8dde6,#9aa3b2 60%,#767f8e);box-shadow:0 14px 32px rgba(0,0,0,.4);transform-origin:50% 100%;animation:igs-dfx-fitting-in .6s cubic-bezier(.2,.9,.3,1.15) both;}
#igs-overlay .igs-dfx-fitting-glass{position:absolute;inset:6px;border-radius:999px 999px 10px 10px;background:linear-gradient(165deg,#eef3fb 0%,#cdd8e8 44%,#aebccf 72%,#c3cedd);overflow:hidden;}
#igs-overlay .igs-dfx-fitting-sheen{position:absolute;inset:6px;border-radius:999px 999px 10px 10px;overflow:hidden;}
#igs-overlay .igs-dfx-fitting-sheen::before{content:"";position:absolute;top:-30%;left:-60%;width:50%;height:160%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.85) 50%,transparent);transform:skewX(-16deg);animation:igs-dfx-fitting-sheen var(--igs-dfx-life) ease-out both;}
#igs-overlay .igs-dfx-fitting-stand{position:absolute;left:50%;bottom:-5%;width:46%;height:6%;margin-left:-23%;border-radius:50%;background:linear-gradient(180deg,#8a93a2,#5f6774);box-shadow:0 6px 12px rgba(0,0,0,.35);}
#igs-overlay .igs-dfx-fitting-name{padding:5px 18px;border-radius:999px;background:rgba(28,24,20,.74);color:#fff;font:700 clamp(15px,2.6vmin,21px)/1.3 "Source Han Sans CN","PingFang SC",sans-serif;letter-spacing:.14em;text-indent:.14em;box-shadow:0 4px 14px rgba(0,0,0,.3);opacity:0;animation:igs-dfx-fitting-name var(--igs-dfx-life) ease both;}
@keyframes igs-dfx-fitting-in{0%{opacity:0;transform:translateY(18px) scale(.9)}100%{opacity:1;transform:none}}
@keyframes igs-dfx-fitting-sheen{0%,22%{transform:translateX(0) skewX(-16deg)}60%,100%{transform:translateX(360%) skewX(-16deg)}}
@keyframes igs-dfx-fitting-name{0%,20%{opacity:0;transform:translateY(8px)}38%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
#igs-overlay .igs-dfx-fitting.is-ancient .igs-dfx-fitting-mirror{background:linear-gradient(160deg,#d9b26a,#9c7636 60%,#6e5024);border-radius:50% 50% 12px 12px;}
#igs-overlay .igs-dfx-fitting.is-ancient .igs-dfx-fitting-glass,#igs-overlay .igs-dfx-fitting.is-ancient .igs-dfx-fitting-sheen{border-radius:50% 50% 8px 8px;background:linear-gradient(165deg,#cdbfa0,#b3a079 60%,#9c8a63);}
#igs-overlay .igs-dfx-fitting.is-ancient .igs-dfx-fitting-name{font-family:"STKaiti","KaiTi","Kaiti SC","楷体",serif;background:rgba(60,36,16,.78);color:#f6e6c4;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-fitting-sheen{display:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-fitting-mirror{animation:igs-dfx-fade var(--igs-dfx-life) ease both;transform:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-fitting-name{opacity:1;}

/* 常驻氛围层（车里 / 船上 / 浴室）：一直挂着，所以每种最多两个动画元素，只动 transform 与 opacity，周期都在数秒以上，
   不用 canvas、混合模式、模糊与逐帧脚本；省电模式与减少动态效果时定格成静态画面，扫光带直接不画。 */
#igs-overlay .igs-dfx-amb{position:absolute;inset:0;pointer-events:none;overflow:hidden;animation:igs-amb-in 1.4s ease both;}
#igs-overlay .igs-dfx-amb.is-leaving{animation:igs-amb-out .9s ease both;}
#igs-overlay .igs-dfx-amb>i{position:absolute;display:block;}
@keyframes igs-amb-in{from{opacity:0}to{opacity:1}}
@keyframes igs-amb-out{from{opacity:1}to{opacity:0}}
#igs-overlay .igs-dfx-amb-shade{inset:0;background:linear-gradient(180deg,rgba(10,12,18,.26),transparent 16%,transparent 80%,rgba(10,12,18,.3));}
#igs-overlay .igs-dfx-amb-band{top:-10%;bottom:-10%;left:0;width:34%;background:linear-gradient(90deg,transparent,rgba(255,248,226,.1) 40%,rgba(255,248,226,.16) 50%,rgba(255,248,226,.1) 60%,transparent);transform:translate3d(-110%,0,0) skewX(-14deg);animation:igs-amb-sweep 9s linear infinite;}
@keyframes igs-amb-sweep{0%{transform:translate3d(-110%,0,0) skewX(-14deg)}55%,100%{transform:translate3d(320%,0,0) skewX(-14deg)}}
#igs-overlay .igs-dfx-amb.is-train.is-night .igs-dfx-amb-band{background:linear-gradient(90deg,transparent,rgba(214,232,255,.12) 40%,rgba(214,232,255,.2) 50%,rgba(214,232,255,.12) 60%,transparent);animation-duration:5.2s;}
#igs-overlay .igs-dfx-amb.is-subway .igs-dfx-amb-shade{background:linear-gradient(180deg,rgba(6,8,14,.34),rgba(6,8,14,.12) 20%,rgba(6,8,14,.12) 78%,rgba(6,8,14,.36));}
#igs-overlay .igs-dfx-amb.is-subway .igs-dfx-amb-band{width:18%;background:linear-gradient(90deg,transparent,rgba(255,236,196,.22) 50%,transparent);animation-duration:2.6s;}
#igs-overlay .igs-dfx-amb.is-car .igs-dfx-amb-band{opacity:.75;animation-duration:12s;}
#igs-overlay .igs-dfx-amb.is-car.is-night .igs-dfx-amb-band{opacity:1;background:linear-gradient(90deg,transparent,rgba(255,176,96,.14) 40%,rgba(255,186,110,.22) 50%,rgba(255,176,96,.14) 60%,transparent);animation-duration:4.4s;}
#igs-overlay .igs-dfx-amb.is-carriage .igs-dfx-amb-shade{background:linear-gradient(90deg,rgba(60,24,10,.36),transparent 15%,transparent 85%,rgba(60,24,10,.36));}
#igs-overlay .igs-dfx-amb.is-carriage .igs-dfx-amb-band{left:60%;width:24%;top:4%;bottom:30%;background:radial-gradient(ellipse at 50% 40%,rgba(255,226,170,.2),transparent 70%);transform:skewX(-8deg);animation:igs-amb-flicker 6.5s ease-in-out infinite;}
#igs-overlay .igs-dfx-amb.is-carriage.is-night .igs-dfx-amb-band{background:radial-gradient(ellipse at 50% 40%,rgba(255,170,90,.18),transparent 70%);animation-duration:9s;}
@keyframes igs-amb-flicker{0%,100%{opacity:.25}30%{opacity:1}55%{opacity:.45}75%{opacity:.85}}
/* 机舱：顶上压一道暗边当行李舱，一束偏冷的舷窗光横着慢慢扫过（比车厢更缓更淡——高空巡航很稳）。 */
#igs-overlay .igs-dfx-amb.is-plane .igs-dfx-amb-shade{background:linear-gradient(180deg,rgba(14,18,28,.4),transparent 20%,transparent 82%,rgba(14,18,28,.22));}
#igs-overlay .igs-dfx-amb.is-plane .igs-dfx-amb-band{width:26%;background:linear-gradient(90deg,transparent,rgba(226,240,255,.1) 40%,rgba(226,240,255,.18) 50%,rgba(226,240,255,.1) 60%,transparent);animation-duration:16s;}
#igs-overlay .igs-dfx-amb.is-plane.is-night .igs-dfx-amb-band{background:linear-gradient(90deg,transparent,rgba(150,180,230,.1) 40%,rgba(170,200,250,.16) 50%,rgba(150,180,230,.1) 60%,transparent);animation-duration:11s;}
/* 飞艇 / 热气球 / 飞毯：慢悠悠的暖光，没有引擎的硬边。 */
#igs-overlay .igs-dfx-amb.is-airship .igs-dfx-amb-shade{background:linear-gradient(180deg,rgba(40,24,10,.3),transparent 22%,transparent 84%,rgba(40,24,10,.2));}
#igs-overlay .igs-dfx-amb.is-airship .igs-dfx-amb-band{width:30%;background:radial-gradient(ellipse at 50% 40%,rgba(255,224,160,.16),transparent 72%);transform:skewX(-6deg);animation-duration:20s;}
/* 露天飞行：两片薄云从前往后掠过、一道淡淡的风痕；只动 transform，周期十几秒。夜里云色压暗偏蓝。 */
#igs-overlay .igs-dfx-amb-clouds{left:0;top:0;width:200%;height:100%;background:radial-gradient(ellipse 22% 9% at 20% 18%,rgba(255,255,255,.2),transparent 70%),radial-gradient(ellipse 30% 11% at 62% 84%,rgba(255,255,255,.16),transparent 70%),radial-gradient(ellipse 18% 7% at 86% 30%,rgba(255,255,255,.12),transparent 70%);background-size:50% 100%;background-repeat:repeat-x;animation:igs-amb-clouds 18s linear infinite;}
#igs-overlay .igs-dfx-amb-gust{left:0;top:-10%;bottom:-10%;width:40%;background:repeating-linear-gradient(180deg,transparent 0 46px,rgba(240,250,255,.1) 46px 48px,transparent 48px 120px);-webkit-mask-image:linear-gradient(90deg,transparent,#000 40%,#000 60%,transparent);mask-image:linear-gradient(90deg,transparent,#000 40%,#000 60%,transparent);transform:translate3d(260%,0,0);animation:igs-amb-gust 7s linear infinite;}
@keyframes igs-amb-clouds{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}
@keyframes igs-amb-gust{from{transform:translate3d(260%,0,0)}to{transform:translate3d(-110%,0,0)}}
#igs-overlay .igs-dfx-amb.is-sky.is-night .igs-dfx-amb-clouds{opacity:.5;}
#igs-overlay .igs-dfx-amb.is-sky.is-night .igs-dfx-amb-gust{opacity:.6;}
#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-gust,#igs-overlay .igs-dfx-amb.is-reduced .igs-dfx-amb-gust{display:none;}
#igs-overlay .igs-dfx-amb-water{left:-8%;right:-8%;top:-8%;height:58%;background:repeating-linear-gradient(172deg,transparent 0 22px,rgba(220,240,255,.07) 22px 26px,transparent 26px 48px),repeating-linear-gradient(8deg,transparent 0 30px,rgba(220,240,255,.05) 30px 33px,transparent 33px 60px);-webkit-mask-image:linear-gradient(180deg,#000,transparent);mask-image:linear-gradient(180deg,#000,transparent);animation:igs-amb-ripple 7s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-amb.is-ship.is-night .igs-dfx-amb-water{opacity:.55;}
@keyframes igs-amb-ripple{from{transform:translate3d(-2%,0,0)}to{transform:translate3d(2%,1.2%,0)}}
#igs-overlay .igs-dfx-amb-fog{inset:0;background:radial-gradient(ellipse 85% 80% at 50% 45%,transparent 50%,rgba(250,244,236,.3) 100%),linear-gradient(0deg,rgba(250,244,236,.2),transparent 30%);}
#igs-overlay .igs-dfx-amb-steam{inset:0;}
#igs-overlay .igs-dfx-amb-steam::before,#igs-overlay .igs-dfx-amb-steam::after{content:"";position:absolute;left:-10%;bottom:-30%;width:70%;height:70%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,252,246,.32),transparent);opacity:0;animation:igs-amb-steam 11s ease-in-out infinite;}
#igs-overlay .igs-dfx-amb-steam::after{left:auto;right:-14%;animation-duration:14s;animation-delay:-6s;}
@keyframes igs-amb-steam{0%{opacity:0;transform:translate3d(0,0,0) scale(.85)}35%{opacity:1}100%{opacity:0;transform:translate3d(6%,-70%,0) scale(1.15)}}
#igs-overlay .igs-dfx-amb.is-shower .igs-dfx-amb-fog{background:radial-gradient(ellipse 80% 76% at 50% 45%,transparent 40%,rgba(250,244,236,.4) 100%),linear-gradient(0deg,rgba(250,244,236,.26),transparent 36%);}
#igs-overlay .igs-dfx-amb.is-shower .igs-dfx-amb-steam::before{animation-duration:8s;}
#igs-overlay .igs-dfx-amb.is-shower .igs-dfx-amb-steam::after{animation-duration:10s;}
#igs-overlay .igs-dfx-amb.is-onsen .igs-dfx-amb-fog{background:radial-gradient(ellipse 90% 84% at 50% 40%,transparent 55%,rgba(250,244,236,.26) 100%),linear-gradient(0deg,rgba(250,244,236,.32),transparent 42%);}
#igs-overlay .igs-dfx-amb.is-onsen .igs-dfx-amb-steam::before,#igs-overlay .igs-dfx-amb.is-onsen .igs-dfx-amb-steam::after{width:90%;animation-duration:15s;}
#igs-overlay .igs-dfx-amb.is-onsen .igs-dfx-amb-steam::after{animation-duration:18s;}
#igs-overlay[data-igs-quality="low"] .igs-dfx-amb:not(.is-carriage) .igs-dfx-amb-band,#igs-overlay .igs-dfx-amb.is-reduced:not(.is-carriage) .igs-dfx-amb-band{display:none;}
#igs-overlay[data-igs-quality="low"] .igs-dfx-amb.is-carriage .igs-dfx-amb-band,#igs-overlay .igs-dfx-amb.is-reduced.is-carriage .igs-dfx-amb-band{opacity:.6;}
#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-steam::before,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-steam::after,#igs-overlay .igs-dfx-amb.is-reduced .igs-dfx-amb-steam::before,#igs-overlay .igs-dfx-amb.is-reduced .igs-dfx-amb-steam::after{opacity:.6;}
/* 水下与真空的单次演出：入水、吐气泡、泄压。 */
#igs-overlay .igs-dfx-dive{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-dive-flash{position:absolute;inset:0;background:linear-gradient(180deg,rgba(235,250,255,.85),rgba(160,220,240,.4));opacity:0;animation:igs-dfx-dive-flash .5s ease-out both;}
#igs-overlay .igs-dfx-dive-veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(30,120,160,.5),rgba(8,40,80,.62));transform:translate3d(0,-100%,0);animation:igs-dfx-dive-veil var(--igs-dfx-life) cubic-bezier(.3,.7,.3,1) both;}
#igs-overlay .igs-dfx-dive-bubbles i,#igs-overlay .igs-dfx-bubble-rise i{position:absolute;bottom:0;width:var(--igs-bb-s);height:var(--igs-bb-s);border-radius:50%;border:1.5px solid rgba(230,250,255,.75);background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.7),rgba(255,255,255,.06) 55%);opacity:0;}
#igs-overlay .igs-dfx-dive-bubbles i{bottom:-6%;animation:igs-dfx-dive-bubble 1.4s cubic-bezier(.3,.6,.5,1) both;}
@keyframes igs-dfx-dive-flash{0%{opacity:0}15%{opacity:1}100%{opacity:0}}
@keyframes igs-dfx-dive-veil{0%{transform:translate3d(0,-100%,0);opacity:1}30%{transform:none;opacity:1}100%{transform:none;opacity:0}}
@keyframes igs-dfx-dive-bubble{0%{opacity:0;transform:translate3d(0,0,0)}15%{opacity:1}100%{opacity:0;transform:translate3d(10px,-90vh,0)}}
/* 出水：满屏的蓝往下退去，水面一亮。 */
#igs-overlay .igs-dfx-surface{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-surface-veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(30,120,160,.5),rgba(8,40,80,.62));animation:igs-dfx-surface-veil var(--igs-dfx-life) cubic-bezier(.5,0,.6,.5) both;}
#igs-overlay .igs-dfx-surface .igs-dfx-dive-flash{animation-delay:.35s;}
@keyframes igs-dfx-surface-veil{0%,15%{transform:none;opacity:1}100%{transform:translate3d(0,100%,0);opacity:.3}}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-surface-veil{transform:none;animation:igs-dfx-fade var(--igs-dfx-life) ease both;opacity:.6;}
#igs-overlay .igs-dfx-bubble-rise{position:absolute;top:24%;width:0;height:0;}
#igs-overlay .igs-dfx-bubble-rise i{animation:igs-dfx-bubble-up 1.5s ease-out both;}
@keyframes igs-dfx-bubble-up{0%{opacity:0;transform:translate3d(0,0,0) scale(.6)}15%{opacity:1}100%{opacity:0;transform:translate3d(6px,-120px,0) scale(1.1)}}
#igs-overlay .igs-dfx-vacuum-rush i{position:absolute;left:0;width:40%;height:2px;background:linear-gradient(90deg,transparent,rgba(235,240,255,.7));opacity:0;animation:igs-dfx-vacuum-rush .9s cubic-bezier(.4,0,.8,.4) both;}
#igs-overlay .igs-dfx-vacuum-hush{position:absolute;inset:0;background:radial-gradient(ellipse 80% 75% at 50% 48%,transparent 40%,rgba(2,4,12,.72) 100%);opacity:0;animation:igs-dfx-vacuum-hush var(--igs-dfx-life) ease both;}
@keyframes igs-dfx-vacuum-rush{0%{opacity:0;transform:translateX(0)}20%{opacity:1}100%{opacity:0;transform:translateX(260%)}}
@keyframes igs-dfx-vacuum-hush{0%,20%{opacity:0}45%,80%{opacity:1}100%{opacity:0}}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-dive-flash,#igs-overlay .igs-dfx.is-reduced .igs-dfx-dive-bubbles,#igs-overlay .igs-dfx.is-reduced .igs-dfx-bubble-rise,#igs-overlay .igs-dfx.is-reduced .igs-dfx-vacuum-rush{display:none;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-dive-veil{transform:none;opacity:.6;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-vacuum-hush{opacity:.8;}

/* 水下常驻：整体蓝绿（不用混合模式，直接半透明叠色）、水面透下来的光柱轻轻摆、两列气泡慢慢往上冒。 */
#igs-overlay .igs-dfx-amb-deep{inset:0;background:linear-gradient(180deg,rgba(40,150,180,.14),rgba(12,60,100,.32));}
#igs-overlay .igs-dfx-amb.is-night .igs-dfx-amb-deep{background:linear-gradient(180deg,rgba(14,50,90,.3),rgba(2,10,30,.55));}
#igs-overlay .igs-dfx-amb-rays{left:-10%;right:-10%;top:-6%;height:70%;background:repeating-linear-gradient(100deg,transparent 0 40px,rgba(200,240,255,.09) 40px 70px,transparent 70px 140px);-webkit-mask-image:linear-gradient(180deg,#000,transparent);mask-image:linear-gradient(180deg,#000,transparent);transform-origin:50% 0;animation:igs-amb-rays 9s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-amb.is-night .igs-dfx-amb-rays{opacity:.35;}
@keyframes igs-amb-rays{from{transform:translate3d(-3%,0,0) skewX(-4deg)}to{transform:translate3d(3%,0,0) skewX(4deg)}}
#igs-overlay .igs-dfx-amb-bubbles{inset:0;}
#igs-overlay .igs-dfx-amb-bubbles::before,#igs-overlay .igs-dfx-amb-bubbles::after{content:"";position:absolute;top:0;height:200%;background-image:radial-gradient(circle at 30% 20%,rgba(230,250,255,.5) 0 3px,transparent 4px),radial-gradient(circle at 70% 65%,rgba(230,250,255,.4) 0 2px,transparent 3px);background-size:60px 150px;animation:igs-amb-bubbles 16s linear infinite;}
#igs-overlay .igs-dfx-amb-bubbles::before{left:5%;width:12%;}
#igs-overlay .igs-dfx-amb-bubbles::after{right:8%;width:9%;background-size:48px 190px;animation-duration:21s;}
@keyframes igs-amb-bubbles{from{transform:translate3d(0,0,0)}to{transform:translate3d(0,-50%,0)}}
/* 深海（阳光照不到）：更暗、不挂光柱，原光柱元素换成幽幽发光的浮游慢慢漂，气泡只留一列。 */
#igs-overlay .igs-dfx-amb.is-abyss .igs-dfx-amb-deep{background:linear-gradient(180deg,rgba(8,40,72,.42),rgba(0,6,22,.66));}
#igs-overlay .igs-dfx-amb.is-abyss .igs-dfx-amb-rays{inset:-6%;height:auto;opacity:1;-webkit-mask-image:none;mask-image:none;background:radial-gradient(circle,rgba(120,240,255,.75) 0 1.5px,transparent 2.5px),radial-gradient(circle,rgba(150,200,255,.5) 0 1px,transparent 2px);background-size:170px 150px,110px 130px;background-position:0 0,50px 70px;animation:igs-amb-drift 34s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-amb.is-abyss .igs-dfx-amb-bubbles::after{display:none;}
/* 水下立绘：把呼吸换成随水漂浮——以脚为轴轻轻摆、整体上下浮几个像素（仍只动 transform，与镜头的 translate/scale 叠加不冲突）。
   呼吸关了、低画质、减少动态、亲密演出自带呼吸时都不漂。 */
@media (prefers-reduced-motion: no-preference){
#igs-overlay[data-igs-underwater][data-igs-sd-breathe]:not([data-igs-quality="low"]) #igs-stage-motion:not([data-igs-rm-breathe]) #igs-sprite:not(.igs-sprite-editing){animation-name:igs-uw-float;animation-duration:6.8s;}
#igs-overlay[data-igs-underwater][data-igs-cast-breathe]:not([data-igs-quality="low"]) #igs-cast .igs-cast-sprite:not([data-igs-cast-leaving]):not([data-igs-cast-ghost]){animation-name:igs-uw-float;animation-duration:7.4s;}
}
@keyframes igs-uw-float{0%,100%{transform:translate3d(0,0,0) rotate(-.4deg) scale(1,1)}50%{transform:translate3d(0,-7px,0) rotate(.4deg) scale(1.004,1.011)}}
/* 太空真空常驻：四周压暗，极慢漂过的尘埃光点。 */
#igs-overlay .igs-dfx-amb-void{inset:0;background:radial-gradient(ellipse 82% 78% at 50% 46%,transparent 48%,rgba(0,0,8,.55) 100%);}
#igs-overlay .igs-dfx-amb-dust{inset:-6%;background-image:radial-gradient(circle,rgba(255,255,255,.55) 0 1px,transparent 1.5px),radial-gradient(circle,rgba(200,220,255,.35) 0 1px,transparent 1.5px);background-size:130px 110px,190px 170px;background-position:0 0,60px 40px;animation:igs-amb-drift 40s ease-in-out infinite alternate;}
@keyframes igs-amb-drift{from{transform:translate3d(-2%,1%,0)}to{transform:translate3d(2%,-1.5%,0)}}
/* 玩乐类：唱歌 / 跳舞 / 钓鱼 / 画画 / 演奏 / 游乐设施 / 打扫 / 购物 / 散步。只用 opacity 与 transform；标签统一落在下方。 */
#igs-overlay .igs-dfx-sing,#igs-overlay .igs-dfx-dance,#igs-overlay .igs-dfx-fish,#igs-overlay .igs-dfx-draw,#igs-overlay .igs-dfx-music,#igs-overlay .igs-dfx-ride,#igs-overlay .igs-dfx-clean,#igs-overlay .igs-dfx-shopping,#igs-overlay .igs-dfx-stroll{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-sing-label,#igs-overlay .igs-dfx-dance-label,#igs-overlay .igs-dfx-fish-catch,#igs-overlay .igs-dfx-draw-label,#igs-overlay .igs-dfx-music-label,#igs-overlay .igs-dfx-ride-label{position:absolute;left:50%;bottom:26%;transform:translateX(-50%);max-width:80%;padding:4px 14px;border-radius:999px;background:rgba(20,16,28,.62);color:#fff7e6;font-weight:700;font-size:1em;letter-spacing:.12em;text-shadow:0 1px 6px rgba(0,0,0,.5);}
#igs-overlay .igs-dfx-sing-waves{position:absolute;left:50%;bottom:40%;width:0;height:0;}
#igs-overlay .igs-dfx-sing-waves i{position:absolute;left:-40px;top:-40px;width:80px;height:80px;border-radius:50%;border:2px solid rgba(255,214,235,.85);opacity:0;animation:igs-dfx-sing-ring 1.6s ease-out infinite;}
#igs-overlay .igs-dfx-sing-notes i{position:absolute;bottom:38%;font-style:normal;font-size:2em;color:#ffe3f0;opacity:0;text-shadow:0 0 10px rgba(255,150,200,.8);animation:igs-dfx-sing-note 2.2s ease-out both;}
@keyframes igs-dfx-sing-ring{0%{opacity:.9;transform:scale(.3)}100%{opacity:0;transform:scale(2.6)}}
@keyframes igs-dfx-sing-note{0%{opacity:0;transform:translateY(0) rotate(-8deg)}25%{opacity:1}100%{opacity:0;transform:translateY(-120px) rotate(12deg)}}
#igs-overlay .igs-dfx-dance-pair{position:absolute;left:50%;bottom:36%;width:0;height:0;}
#igs-overlay .igs-dfx-dance-figure{position:absolute;bottom:0;font-style:normal;font-size:3.2em;animation:igs-dfx-dance-sway 1.1s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-dance-figure.is-a{left:-64px;}
#igs-overlay .igs-dfx-dance-figure.is-a::before{content:"💃";}
#igs-overlay .igs-dfx-dance-figure.is-b{left:6px;animation-delay:.3s;}
#igs-overlay .igs-dfx-dance-figure.is-b::before{content:"🕺";}
#igs-overlay .igs-dfx-dance-ring{position:absolute;left:-90px;top:6px;width:180px;height:36px;border-radius:50%;border:2px solid rgba(255,230,160,.75);animation:igs-dfx-dance-ring 1.1s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-dance-sparks i{position:absolute;left:50%;bottom:44%;width:8px;height:8px;border-radius:50%;background:#ffe9a8;box-shadow:0 0 8px #ffd36a;opacity:0;animation:igs-dfx-dance-spark 1.6s ease-out both;}
@keyframes igs-dfx-dance-sway{from{transform:translateY(0) rotate(-9deg)}to{transform:translateY(-12px) rotate(9deg)}}
@keyframes igs-dfx-dance-ring{from{transform:scale(.85);opacity:.5}to{transform:scale(1.1);opacity:1}}
@keyframes igs-dfx-dance-spark{0%{opacity:0;transform:rotate(var(--igs-dc-a)) translateY(0)}20%{opacity:1}100%{opacity:0;transform:rotate(var(--igs-dc-a)) translateY(-110px)}}
#igs-overlay .igs-dfx-fish-water{position:absolute;left:50%;bottom:34%;width:0;height:0;}
#igs-overlay .igs-dfx-fish-water i{position:absolute;left:-60px;top:-12px;width:120px;height:24px;border-radius:50%;border:2px solid rgba(190,230,255,.85);opacity:0;animation:igs-dfx-fish-ripple 2s ease-out infinite;}
#igs-overlay .igs-dfx-fish-line{position:absolute;left:50%;top:14%;bottom:34%;width:1px;background:rgba(255,255,255,.8);transform-origin:50% 0;animation:igs-dfx-fish-line 3.2s ease-in-out both;}
#igs-overlay .igs-dfx-fish-float{position:absolute;left:50%;bottom:34%;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:radial-gradient(circle at 50% 30%,#fff 0 35%,#e8483a 36%);animation:igs-dfx-fish-bob 3.2s ease-in-out both;}
#igs-overlay .igs-dfx-fish-silhouette{position:absolute;left:50%;bottom:34%;margin-left:-24px;font-style:normal;font-size:2.6em;opacity:0;animation:igs-dfx-fish-jump 3.2s ease-out both;}
#igs-overlay .igs-dfx-fish-silhouette::before{content:"🐟";}
@keyframes igs-dfx-fish-ripple{0%{opacity:.9;transform:scale(.3)}100%{opacity:0;transform:scale(1.8)}}
@keyframes igs-dfx-fish-bob{0%,45%{transform:translateY(0)}55%{transform:translateY(8px)}70%,100%{transform:translateY(-4px)}}
@keyframes igs-dfx-fish-line{0%,45%{transform:scaleY(1)}55%{transform:scaleY(1.04) rotate(2deg)}100%{transform:scaleY(.96) rotate(-1deg)}}
@keyframes igs-dfx-fish-jump{0%,58%{opacity:0;transform:translateY(20px) rotate(0)}70%{opacity:1;transform:translateY(-70px) rotate(-25deg)}85%{opacity:1;transform:translateY(-30px) rotate(20deg)}100%{opacity:0;transform:translateY(10px) rotate(35deg)}}
#igs-overlay .igs-dfx-draw-canvas{position:absolute;left:50%;top:50%;width:min(46%,260px);aspect-ratio:4/3;transform:translate(-50%,-62%);border-radius:6px;background:#fffdf6;box-shadow:0 8px 22px rgba(0,0,0,.35);overflow:hidden;}
#igs-overlay .igs-dfx-draw-stroke{position:absolute;height:6px;border-radius:3px;opacity:0;transform-origin:0 50%;animation:igs-dfx-draw-stroke .5s ease-out both;}
#igs-overlay .igs-dfx-draw-stroke:nth-child(1){left:12%;top:24%;width:60%;background:#e8604c;}
#igs-overlay .igs-dfx-draw-stroke:nth-child(2){left:20%;top:44%;width:52%;background:#f2b84b;transform:rotate(-6deg);}
#igs-overlay .igs-dfx-draw-stroke:nth-child(3){left:14%;top:62%;width:66%;background:#4fa3d8;transform:rotate(4deg);}
#igs-overlay .igs-dfx-draw-stroke:nth-child(4){left:30%;top:80%;width:44%;background:#6bbf7a;}
#igs-overlay .igs-dfx-draw-pencil{position:absolute;right:8%;bottom:10%;font-style:normal;font-size:1.8em;animation:igs-dfx-draw-pencil 1.8s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-draw-pencil::before{content:"🖌️";}
@keyframes igs-dfx-draw-stroke{from{opacity:0;transform:scaleX(0)}to{opacity:1;transform:scaleX(1)}}
@keyframes igs-dfx-draw-pencil{from{transform:translate(0,0) rotate(-10deg)}to{transform:translate(-90px,-70px) rotate(8deg)}}
#igs-overlay .igs-dfx-music-staff{position:absolute;left:14%;right:14%;top:30%;height:84px;}
#igs-overlay .igs-dfx-music-staff i{position:absolute;left:0;right:0;height:1px;background:rgba(255,246,222,.85);box-shadow:0 0 6px rgba(255,240,200,.5);}
#igs-overlay .igs-dfx-music-notes{position:absolute;left:14%;right:14%;top:30%;height:84px;}
#igs-overlay .igs-dfx-music-notes i{position:absolute;font-style:normal;font-size:1.9em;color:#fff1c9;opacity:0;text-shadow:0 0 10px rgba(255,220,140,.8);animation:igs-dfx-music-note 1.4s ease-out both;}
@keyframes igs-dfx-music-note{0%{opacity:0;transform:translateY(10px) scale(.7)}30%{opacity:1;transform:translateY(-6px) scale(1.1)}60%,100%{opacity:1;transform:translateY(0) scale(1)}}
#igs-overlay .igs-dfx-ride-lights{position:absolute;left:6%;right:6%;top:20%;height:0;}
#igs-overlay .igs-dfx-ride-lights i{position:absolute;top:0;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:#ffd36a;box-shadow:0 0 10px #ffb84a;animation:igs-dfx-ride-bulb .7s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-ride-lights i:nth-child(2n){background:#ff8fb8;box-shadow:0 0 10px #ff6fa0;}
#igs-overlay .igs-dfx-ride-track{position:absolute;left:50%;top:44%;width:0;height:0;}
#igs-overlay .igs-dfx-ride-car{position:absolute;left:-28px;top:-28px;font-style:normal;font-size:3.2em;animation:igs-dfx-ride-car 3.2s ease-in-out both;}
#igs-overlay .igs-dfx-ride-wind i{position:absolute;left:12%;width:30%;height:2px;border-radius:1px;background:rgba(255,255,255,.7);opacity:0;animation:igs-dfx-ride-wind .9s ease-out infinite;}
@keyframes igs-dfx-ride-bulb{from{opacity:.35;transform:scale(.8)}to{opacity:1;transform:scale(1.1)}}
@keyframes igs-dfx-ride-car{0%{transform:translate(0,40px) rotate(-14deg)}35%{transform:translate(0,-30px) rotate(-22deg)}55%{transform:translate(0,-34px) rotate(0)}75%{transform:translate(0,38px) rotate(24deg)}100%{transform:translate(0,0) rotate(0)}}
@keyframes igs-dfx-ride-wind{0%{opacity:0;transform:translateX(160%)}30%{opacity:.8}100%{opacity:0;transform:translateX(-60%)}}
#igs-overlay .igs-dfx-clean-floor{position:absolute;left:50%;bottom:34%;width:0;height:0;}
#igs-overlay .igs-dfx-clean-broom{position:absolute;left:-24px;top:-48px;font-style:normal;font-size:3em;transform-origin:50% 90%;animation:igs-dfx-clean-sweep .9s ease-in-out 2 alternate both;}
#igs-overlay .igs-dfx-clean-dust i{position:absolute;bottom:0;width:10px;height:10px;border-radius:50%;background:rgba(235,225,205,.8);opacity:0;animation:igs-dfx-clean-dust 1.3s ease-out both;}
#igs-overlay .igs-dfx-clean-sparkle i{position:absolute;font-style:normal;font-size:1.6em;opacity:0;animation:igs-dfx-clean-sparkle 1.1s ease-out both;}
@keyframes igs-dfx-clean-sweep{from{transform:translateX(-70px) rotate(-18deg)}to{transform:translateX(70px) rotate(18deg)}}
@keyframes igs-dfx-clean-dust{0%{opacity:0;transform:translate(0,0) scale(.5)}30%{opacity:.9}100%{opacity:0;transform:translate(14px,-46px) scale(1.5)}}
@keyframes igs-dfx-clean-sparkle{0%{opacity:0;transform:scale(.3) rotate(0)}40%{opacity:1;transform:scale(1.2) rotate(20deg)}100%{opacity:0;transform:scale(.8) rotate(40deg)}}
#igs-overlay .igs-dfx-shopping{display:flex;align-items:center;justify-content:center;}
#igs-overlay .igs-dfx-shopping-card{position:relative;min-width:150px;padding:18px 22px 12px;border-radius:14px;background:#fff7ec;color:#6b3f24;text-align:center;box-shadow:0 8px 22px rgba(0,0,0,.32);}
#igs-overlay .igs-dfx-shopping-bag{display:inline-block;font-style:normal;font-size:3em;transform-origin:50% 0;animation:igs-dfx-shopping-swing 1.2s ease-in-out 2 both;}
#igs-overlay .igs-dfx-shopping-label{margin-top:4px;font-size:1.05em;font-weight:800;letter-spacing:.08em;}
#igs-overlay .igs-dfx-shopping-confetti{position:absolute;left:0;right:0;top:-6px;height:0;}
#igs-overlay .igs-dfx-shopping-confetti i{position:absolute;width:7px;height:11px;border-radius:2px;background:#ff8fb8;opacity:0;animation:igs-dfx-shopping-fall 1.6s ease-in both;}
#igs-overlay .igs-dfx-shopping-confetti i:nth-child(3n+1){background:#ffd36a;}
#igs-overlay .igs-dfx-shopping-confetti i:nth-child(3n+2){background:#7fc8ff;}
@keyframes igs-dfx-shopping-swing{from{transform:rotate(-12deg)}to{transform:rotate(12deg)}}
@keyframes igs-dfx-shopping-fall{0%{opacity:0;transform:translateY(0) rotate(0)}15%{opacity:1}100%{opacity:0;transform:translateY(90px) rotate(200deg)}}
#igs-overlay .igs-dfx-stroll-steps{position:absolute;left:8%;right:8%;bottom:26%;height:80px;}
#igs-overlay .igs-dfx-stroll-steps i{position:absolute;font-style:normal;font-size:1.7em;opacity:0;animation:igs-dfx-stroll-step .6s ease-out both;}
#igs-overlay .igs-dfx-stroll-leaves i{position:absolute;top:18%;font-style:normal;font-size:1.5em;opacity:0;animation:igs-dfx-stroll-leaf 2.4s ease-in-out both;}
@keyframes igs-dfx-stroll-step{from{opacity:0;transform:scale(1.4)}to{opacity:.8;transform:scale(1)}}
@keyframes igs-dfx-stroll-leaf{0%{opacity:0;transform:translate(0,0) rotate(0)}20%{opacity:.95}100%{opacity:0;transform:translate(60px,150px) rotate(220deg)}}
/* 省电 / 减少动态效果：关掉循环与位移，延迟出现的元素直接可见。 */
#igs-overlay .igs-dfx.is-reduced.igs-dfx-sing .igs-dfx-sing-notes i,#igs-overlay .igs-dfx.is-reduced.igs-dfx-music .igs-dfx-music-notes i,#igs-overlay .igs-dfx.is-reduced.igs-dfx-draw .igs-dfx-draw-stroke,#igs-overlay .igs-dfx.is-reduced.igs-dfx-clean .igs-dfx-clean-sparkle i,#igs-overlay .igs-dfx.is-reduced.igs-dfx-stroll .igs-dfx-stroll-steps i{opacity:1;}
#igs-overlay .igs-dfx.is-reduced.igs-dfx-sing,#igs-overlay .igs-dfx.is-reduced.igs-dfx-dance,#igs-overlay .igs-dfx.is-reduced.igs-dfx-fish,#igs-overlay .igs-dfx.is-reduced.igs-dfx-draw,#igs-overlay .igs-dfx.is-reduced.igs-dfx-music,#igs-overlay .igs-dfx.is-reduced.igs-dfx-ride,#igs-overlay .igs-dfx.is-reduced.igs-dfx-clean,#igs-overlay .igs-dfx.is-reduced.igs-dfx-shopping,#igs-overlay .igs-dfx.is-reduced.igs-dfx-stroll{animation:igs-dfx-fade var(--igs-dfx-life) ease both!important;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-sing-waves,#igs-overlay .igs-dfx.is-reduced .igs-dfx-dance-sparks,#igs-overlay .igs-dfx.is-reduced .igs-dfx-fish-water,#igs-overlay .igs-dfx.is-reduced .igs-dfx-fish-silhouette,#igs-overlay .igs-dfx.is-reduced .igs-dfx-ride-wind,#igs-overlay .igs-dfx.is-reduced .igs-dfx-clean-dust,#igs-overlay .igs-dfx.is-reduced .igs-dfx-shopping-confetti,#igs-overlay .igs-dfx.is-reduced .igs-dfx-stroll-leaves{display:none;}
#igs-overlay[data-igs-quality="low"] .igs-dfx-amb>i,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb>i::before,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb>i::after,#igs-overlay .igs-dfx-amb.is-reduced>i,#igs-overlay .igs-dfx-amb.is-reduced>i::before,#igs-overlay .igs-dfx-amb.is-reduced>i::after{animation:none;}
/* 玩乐类 · 第二版：按 fx-daily.js 现在实际生成的结构重写，后写覆盖上面同权重的旧规则。暖色实色为主，只用 opacity 与 transform。 */
#igs-overlay .igs-dfx-sing-label,#igs-overlay .igs-dfx-dance-label,#igs-overlay .igs-dfx-fish-catch,#igs-overlay .igs-dfx-draw-label,#igs-overlay .igs-dfx-music-label,#igs-overlay .igs-dfx-ride-label,#igs-overlay .igs-dfx-shopping-label{position:absolute;left:50%;bottom:26%;max-width:80%;margin:0;padding:5px 18px;box-sizing:border-box;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;border:1px solid #e8c9a0;border-radius:999px;background:#fff6e8;color:#6b4226;font-size:clamp(13px,2.4vmin,18px);font-weight:700;line-height:1.4;letter-spacing:.12em;text-indent:.12em;text-shadow:none;box-shadow:0 4px 12px rgba(80,50,20,.22);opacity:0;transform:translateX(-50%);animation:igs-dfx-play-label var(--igs-dfx-life) ease both;}
@keyframes igs-dfx-play-label{0%,14%{opacity:0;transform:translate(-50%,8px)}30%{opacity:1;transform:translate(-50%,0)}80%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-4px)}}
/* 唱歌：话筒（画在音符层的伪元素上，省电模式下也留着）+ 向外扩散的粉色声波环 + 往上飘的彩色音符。 */
#igs-overlay .igs-dfx-sing-waves{bottom:46%;}
#igs-overlay .igs-dfx-sing-waves i{left:-38px;top:-38px;width:76px;height:76px;border:2px solid #f2a1c2;animation:igs-dfx-sing-pulse 1.8s ease-out infinite backwards;}
#igs-overlay .igs-dfx-sing-notes{position:absolute;left:50%;bottom:46%;width:min(52%,320px);height:0;transform:translateX(-50%);}
#igs-overlay .igs-dfx-sing-notes::before{content:"";position:absolute;left:50%;bottom:-14px;width:14px;height:24px;margin-left:-7px;box-sizing:border-box;border:2px solid #e58fb0;border-radius:8px;background:#fff4e6;}
#igs-overlay .igs-dfx-sing-notes::after{content:"";position:absolute;left:50%;bottom:-30px;width:3px;height:17px;margin-left:-1.5px;border-radius:2px;background:#e58fb0;}
#igs-overlay .igs-dfx-sing-notes i{bottom:0;font-size:clamp(20px,4.2vmin,32px);font-weight:700;line-height:1;color:#f48fb1;text-shadow:0 1px 0 #fff,0 2px 8px rgba(120,60,90,.25);animation:igs-dfx-sing-drift 2.6s ease-in-out infinite backwards;}
#igs-overlay .igs-dfx-sing-notes i:nth-child(2){color:#f2a15a;}
#igs-overlay .igs-dfx-sing-notes i:nth-child(3){color:#6fb4e6;}
#igs-overlay .igs-dfx-sing-notes i:nth-child(4){color:#a98be8;}
@keyframes igs-dfx-sing-pulse{0%{opacity:.85;transform:scale(.35)}100%{opacity:0;transform:scale(2.3)}}
@keyframes igs-dfx-sing-drift{0%{opacity:0;transform:translate(0,0) rotate(-8deg) scale(.7)}18%{opacity:1}50%{transform:translate(8px,-46px) rotate(6deg) scale(1)}100%{opacity:0;transform:translate(-6px,-104px) rotate(-6deg) scale(.95)}}
/* 跳舞：一对纯色剪影（粉裙 / 蓝装）绕着小圈缓缓华尔兹，随节奏轻轻倾侧，脚边一圈金色光环，几点亮片向外飞散。 */
#igs-overlay .igs-dfx-dance-pair{bottom:40%;animation:igs-dfx-dance-waltz 3.4s linear infinite;}
#igs-overlay .igs-dfx-dance-figure{width:34px;height:84px;font-size:1em;transform-origin:50% 100%;animation:igs-dfx-dance-lean 1.5s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-dance-figure.is-a{left:-44px;--igs-dc-c:#f08fb4;}
#igs-overlay .igs-dfx-dance-figure.is-b{left:10px;--igs-dc-c:#6fa8dc;animation-delay:-.5s;}
#igs-overlay .igs-dfx-dance-figure.is-a::before,#igs-overlay .igs-dfx-dance-figure.is-b::before{content:"";position:absolute;left:9px;top:0;width:16px;height:16px;border-radius:50%;background:var(--igs-dc-c);}
#igs-overlay .igs-dfx-dance-figure::after{content:"";position:absolute;left:0;right:0;top:18px;bottom:0;background:var(--igs-dc-c);}
#igs-overlay .igs-dfx-dance-figure.is-a::after{clip-path:polygon(34% 0,66% 0,100% 100%,0 100%);}
#igs-overlay .igs-dfx-dance-figure.is-b::after{clip-path:polygon(24% 0,76% 0,82% 54%,72% 100%,53% 100%,50% 62%,47% 100%,28% 100%,18% 54%);}
#igs-overlay .igs-dfx-dance-ring{left:-72px;top:-13px;width:144px;height:26px;box-sizing:border-box;border:2px solid #f3c77e;box-shadow:0 0 10px #f6d9a0;z-index:-1;animation:igs-dfx-dance-halo 1.5s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-dance-sparks{position:absolute;left:50%;bottom:40%;width:0;height:0;}
#igs-overlay .igs-dfx-dance-sparks i{left:-3px;top:-46px;bottom:auto;width:7px;height:7px;background:#fff0b8;box-shadow:0 0 6px #f3c77e;animation:igs-dfx-dance-glint 1.8s ease-out infinite backwards;}
#igs-overlay .igs-dfx-dance-sparks i:nth-child(2n){background:#ffd0e2;box-shadow:0 0 6px #f08fb4;}
@keyframes igs-dfx-dance-waltz{from{transform:rotate(0deg) translateX(9px) rotate(0deg)}to{transform:rotate(360deg) translateX(9px) rotate(-360deg)}}
@keyframes igs-dfx-dance-lean{from{transform:translateY(0) rotate(-7deg) scaleX(1)}50%{transform:translateY(-7px) rotate(0deg) scaleX(.7)}to{transform:translateY(0) rotate(7deg) scaleX(1)}}
@keyframes igs-dfx-dance-halo{from{transform:scale(.86);opacity:.55}to{transform:scale(1.08);opacity:1}}
@keyframes igs-dfx-dance-glint{0%{opacity:0;transform:rotate(var(--igs-dc-a)) translateY(-14px) scale(.5)}20%{opacity:1}100%{opacity:0;transform:rotate(var(--igs-dc-a)) translateY(-84px) scale(1)}}
/* 钓鱼：水面涟漪、一根细线垂到浮漂，浮漂先浮后沉再弹起，鱼影跃出水面。 */
#igs-overlay .igs-dfx-fish-water{bottom:36%;}
#igs-overlay .igs-dfx-fish-water i{left:-64px;top:-13px;width:128px;height:26px;box-sizing:border-box;border:2px solid #bfe3f6;animation:igs-dfx-fish-wave 2.2s ease-out infinite backwards;}
#igs-overlay .igs-dfx-fish-line{top:12%;bottom:36%;background:#fff6e8;box-shadow:0 0 0 .5px rgba(90,60,30,.35);}
#igs-overlay .igs-dfx-fish-float{bottom:36%;margin-bottom:-6px;box-shadow:0 2px 4px rgba(40,70,100,.3);}
#igs-overlay .igs-dfx-fish-silhouette{bottom:36%;margin-left:-22px;width:44px;height:20px;font-size:1em;opacity:0;animation:igs-dfx-fish-leap 3.2s ease-out both;}
#igs-overlay .igs-dfx-fish-silhouette::before{content:"";position:absolute;left:0;top:0;width:32px;height:20px;border-radius:50% 60% 60% 50%;background:#5a86ad;}
#igs-overlay .igs-dfx-fish-silhouette::after{content:"";position:absolute;right:0;top:3px;width:14px;height:14px;background:#5a86ad;clip-path:polygon(0 50%,100% 0,100% 100%);}
@keyframes igs-dfx-fish-wave{0%{opacity:.85;transform:scale(.3)}100%{opacity:0;transform:scale(1.9)}}
@keyframes igs-dfx-fish-leap{0%,56%{opacity:0;transform:translateY(16px) rotate(0)}68%{opacity:1;transform:translateY(-64px) rotate(-22deg)}84%{opacity:1;transform:translateY(-34px) rotate(16deg)}100%{opacity:0;transform:translateY(8px) rotate(30deg)}}
/* 画画：画架上的纸 + 木色边，色块笔触依次扫开成一幅小风景，铅笔在纸角游走。 */
#igs-overlay .igs-dfx-draw-canvas{border:6px solid #c9a06a;border-radius:4px;background:#fffaf0;box-shadow:0 8px 20px rgba(80,50,20,.3);animation:igs-dfx-draw-in .6s cubic-bezier(.3,.8,.3,1) both;}
#igs-overlay .igs-dfx-draw-stroke{transform:none;height:auto;border-radius:3px;opacity:1;animation:igs-dfx-draw-wipe .55s ease-out both;}
#igs-overlay .igs-dfx-draw-stroke:nth-child(1){left:6%;top:8%;width:88%;height:30%;background:#cfe8f7;}
#igs-overlay .igs-dfx-draw-stroke:nth-child(2){left:62%;top:14%;width:20%;height:26%;border-radius:50%;background:#f6c85f;}
#igs-overlay .igs-dfx-draw-stroke:nth-child(3){left:6%;top:50%;width:88%;height:20%;border-radius:40% 60% 8px 8px/70% 70% 8px 8px;background:#8fcf9b;animation-name:igs-dfx-draw-rise;}
#igs-overlay .igs-dfx-draw-stroke:nth-child(4){left:6%;top:70%;width:88%;height:22%;background:#e8b98a;animation-name:igs-dfx-draw-rise;}
#igs-overlay .igs-dfx-draw-pencil{right:10%;bottom:12%;width:44px;height:7px;font-size:1em;border-radius:0 2px 2px 0;background:#f2b84b;transform-origin:100% 50%;animation:igs-dfx-draw-wander 2.4s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-draw-pencil::before{content:"";position:absolute;left:-9px;top:0;width:10px;height:7px;background:#e8d2a8;clip-path:polygon(0 50%,100% 0,100% 100%);}
#igs-overlay .igs-dfx-draw-pencil::after{content:"";position:absolute;left:-9px;top:2px;width:3px;height:3px;border-radius:50%;background:#4a3a30;}
@keyframes igs-dfx-draw-in{from{opacity:0;transform:translate(-50%,-62%) scale(.92)}to{opacity:1;transform:translate(-50%,-62%) scale(1)}}
@keyframes igs-dfx-draw-wipe{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes igs-dfx-draw-rise{from{clip-path:inset(100% 0 0 0)}to{clip-path:inset(0 0 0 0)}}
@keyframes igs-dfx-draw-wander{from{transform:translate(0,0) rotate(-24deg)}50%{transform:translate(-60px,-28px) rotate(-14deg)}to{transform:translate(-110px,-8px) rotate(-30deg)}}
/* 演奏：奶油色谱纸托底，五线用暖棕实线，彩色音符沿谱线依次弹出，之后轻轻起伏。 */
#igs-overlay .igs-dfx-music-staff,#igs-overlay .igs-dfx-music-notes{left:50%;right:auto;top:30%;width:min(72%,460px);height:84px;transform:translateX(-50%);}
#igs-overlay .igs-dfx-music-staff::before{content:"";position:absolute;inset:-16px -18px;border-radius:10px;background:#fff6e8;box-shadow:0 6px 16px rgba(80,50,20,.25);animation:igs-dfx-music-card .5s ease-out both;}
#igs-overlay .igs-dfx-music-staff::after{content:"";position:absolute;left:0;top:12%;bottom:12%;width:2px;background:#8a6340;}
#igs-overlay .igs-dfx-music-staff i{background:#8a6340;box-shadow:none;}
#igs-overlay .igs-dfx-music-notes i{font-size:clamp(22px,4.4vmin,34px);line-height:1;color:#d9715b;text-shadow:none;animation:igs-dfx-music-pop .5s cubic-bezier(.3,1.5,.5,1) both,igs-dfx-music-bob 1.3s ease-in-out .6s infinite alternate;}
#igs-overlay .igs-dfx-music-notes i:nth-child(3n+2){color:#4f93c9;}
#igs-overlay .igs-dfx-music-notes i:nth-child(3n){color:#7a63c4;}
@keyframes igs-dfx-music-card{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
@keyframes igs-dfx-music-pop{0%{opacity:0;transform:translateY(10px) scale(.6)}100%{opacity:1;transform:none}}
@keyframes igs-dfx-music-bob{from{translate:0 0}to{translate:0 -6px}}
/* 摩天轮：整轮缓缓转，八个座舱保持水平（反向抵消轮子的转角），A 字支架立在轮下。 */
#igs-overlay .igs-dfx-ride{--igs-rd-r:clamp(64px,17vmin,120px);}
#igs-overlay .igs-dfx-ride-wheel{position:absolute;left:50%;top:38%;width:calc(var(--igs-rd-r) * 2);height:calc(var(--igs-rd-r) * 2);margin:calc(var(--igs-rd-r) * -1) 0 0 calc(var(--igs-rd-r) * -1);box-sizing:border-box;border:3px solid #d9715b;border-radius:50%;background:repeating-conic-gradient(from 0deg,#e8b9a8 0 1.2deg,transparent 1.2deg 45deg);animation:igs-dfx-ride-turn 14s linear infinite;}
#igs-overlay .igs-dfx-ride-wheel::after{content:"";position:absolute;left:50%;top:50%;width:calc(var(--igs-rd-r) * 1.2);height:calc(var(--igs-rd-r) * 1.45);margin-left:calc(var(--igs-rd-r) * -.6);z-index:-1;background:#b98a63;transform-origin:50% 0;clip-path:polygon(50% 0,54% 0,100% 100%,92% 100%,50% 8%,8% 100%,0 100%,46% 0);animation:igs-dfx-ride-turn 14s linear infinite reverse;}
#igs-overlay .igs-dfx-ride-hub{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#fff6e8;border:3px solid #d9715b;box-sizing:border-box;}
#igs-overlay .igs-dfx-ride-cabins{position:absolute;inset:0;}
#igs-overlay .igs-dfx-ride-cabins i{position:absolute;left:50%;top:50%;width:0;height:0;transform:rotate(var(--igs-rd-a)) translateY(calc(var(--igs-rd-r) * -1 + 2px));}
#igs-overlay .igs-dfx-ride-cabins i::before{content:"";position:absolute;left:-9px;top:-3px;width:18px;height:14px;box-sizing:border-box;border-radius:3px 3px 6px 6px;background:#f4a259;border-top:3px solid #fff6e8;transform:rotate(calc(var(--igs-rd-a) * -1));transform-origin:50% 0;animation:igs-dfx-ride-level 14s linear infinite,igs-dfx-ride-cabin-in .5s ease-out both;animation-delay:0s,var(--igs-rd-d,0s);}
#igs-overlay .igs-dfx-ride-cabins i:nth-child(3n+2)::before{background:#f08fb4;}
#igs-overlay .igs-dfx-ride-cabins i:nth-child(3n)::before{background:#6fb4e6;}
@keyframes igs-dfx-ride-turn{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes igs-dfx-ride-level{from{rotate:0deg}to{rotate:-360deg}}
@keyframes igs-dfx-ride-cabin-in{from{opacity:0}to{opacity:1}}
/* 打扫：一道斜光痕扫过，灰尘扬起又落下，几颗亮晶眨眼。 */
#igs-overlay .igs-dfx-clean-sweep{position:absolute;left:0;top:26%;width:36%;height:34%;background:linear-gradient(100deg,transparent,#fff6dc 50%,transparent);transform:translate3d(-120%,0,0) skewX(-18deg);opacity:0;animation:igs-dfx-clean-glide 1.5s ease-in-out 2 both;}
#igs-overlay .igs-dfx-clean-dust{position:absolute;inset:0;}
#igs-overlay .igs-dfx-clean-dust i{top:62%;bottom:auto;background:#e8dcc4;animation:igs-dfx-clean-puff 1.7s ease-out infinite backwards;}
#igs-overlay .igs-dfx-clean-dust i:nth-child(2n){width:7px;height:7px;}
#igs-overlay .igs-dfx-clean-sparks{position:absolute;inset:0;}
#igs-overlay .igs-dfx-clean-sparks i{position:absolute;font-style:normal;font-size:clamp(16px,3.4vmin,26px);line-height:1;color:#ffe08a;text-shadow:0 0 8px #f6c85f;opacity:0;animation:igs-dfx-clean-twinkle 1.4s ease-in-out infinite backwards;}
@keyframes igs-dfx-clean-glide{0%{opacity:0;transform:translate3d(-120%,0,0) skewX(-18deg)}15%{opacity:.9}85%{opacity:.9}100%{opacity:0;transform:translate3d(300%,0,0) skewX(-18deg)}}
@keyframes igs-dfx-clean-puff{0%{opacity:0;transform:translate(0,0) scale(.5)}25%{opacity:.85}100%{opacity:0;transform:translate(12px,-52px) scale(1.4)}}
@keyframes igs-dfx-clean-twinkle{0%,100%{opacity:0;transform:scale(.4) rotate(0)}50%{opacity:1;transform:scale(1.15) rotate(18deg)}}
/* 购物：两只纸袋（粉 / 蓝）晃进来停稳，袋口蹦出亮晶。 */
#igs-overlay .igs-dfx-shopping{display:block;}
#igs-overlay .igs-dfx-shopping-bags{position:absolute;left:50%;top:36%;width:0;height:0;}
#igs-overlay .igs-dfx-shopping-bag{position:absolute;bottom:0;width:58px;height:70px;margin:0;font-size:1em;box-sizing:border-box;border-radius:4px 4px 8px 8px;background:#f4a6c0;transform-origin:50% 0;animation:igs-dfx-shopping-arrive 1.3s cubic-bezier(.3,1.3,.5,1) both;}
#igs-overlay .igs-dfx-shopping-bag.is-a{left:-66px;}
#igs-overlay .igs-dfx-shopping-bag.is-b{left:8px;width:52px;height:60px;background:#8ec5ec;animation-name:igs-dfx-shopping-arrive-b;animation-delay:.18s;}
#igs-overlay .igs-dfx-shopping-bag::before{content:"";position:absolute;left:50%;top:-18px;width:26px;height:26px;margin-left:-13px;box-sizing:border-box;border:3px solid #fff6e8;border-radius:50%;clip-path:inset(0 0 55% 0);}
#igs-overlay .igs-dfx-shopping-bag::after{content:"";position:absolute;left:0;right:0;top:34%;height:10px;background:#fff6e8;opacity:.9;}
#igs-overlay .igs-dfx-shopping-sparks{position:absolute;left:50%;top:36%;width:0;height:0;}
#igs-overlay .igs-dfx-shopping-sparks i{position:absolute;left:var(--igs-sh-x,0);top:-84px;font-style:normal;font-size:clamp(16px,3.2vmin,24px);line-height:1;color:#ffd36a;text-shadow:0 0 8px #f6b84a;opacity:0;animation:igs-dfx-shopping-pop 1.5s ease-out infinite backwards;}
#igs-overlay .igs-dfx-shopping-sparks i:nth-child(1){margin-left:-62px;}
#igs-overlay .igs-dfx-shopping-sparks i:nth-child(2){margin-left:0;color:#f4a6c0;text-shadow:0 0 8px #f08fb4;}
#igs-overlay .igs-dfx-shopping-sparks i:nth-child(3){margin-left:58px;}
@keyframes igs-dfx-shopping-arrive{0%{opacity:0;transform:translateX(-90px) rotate(-16deg)}60%{opacity:1;transform:translateX(0) rotate(6deg)}100%{opacity:1;transform:translateX(0) rotate(-2deg)}}
@keyframes igs-dfx-shopping-arrive-b{0%{opacity:0;transform:translateX(90px) rotate(16deg)}60%{opacity:1;transform:translateX(0) rotate(-6deg)}100%{opacity:1;transform:translateX(0) rotate(3deg)}}
@keyframes igs-dfx-shopping-pop{0%{opacity:0;transform:translateY(8px) scale(.4)}35%{opacity:1;transform:translateY(-6px) scale(1.15)}100%{opacity:0;transform:translateY(-22px) scale(.8)}}
/* 散步：底部一道暖光，脚印一前一后印出，一片叶子斜斜飘落。 */
#igs-overlay .igs-dfx-stroll-warm{position:absolute;left:0;right:0;bottom:0;height:34%;background:linear-gradient(0deg,#ffd9a0,#ffe9c4 45%,transparent);opacity:0;animation:igs-dfx-stroll-glow var(--igs-dfx-life) ease-in-out both;}
#igs-overlay .igs-dfx-stroll-steps{bottom:20%;height:56px;}
#igs-overlay .igs-dfx-stroll-steps .igs-dfx-stroll-step{position:absolute;width:11px;height:18px;margin:0;box-sizing:border-box;border-radius:50% 50% 45% 45%;background:#c79a6b;box-shadow:0 0 0 1px #fff6e8;font-size:1em;opacity:.85;animation:igs-dfx-stroll-print .5s ease-out both;}
#igs-overlay .igs-dfx-stroll-steps .igs-dfx-stroll-step::after{content:"";position:absolute;left:1px;bottom:-6px;width:8px;height:6px;border-radius:50%;background:#c79a6b;box-shadow:0 0 0 1px #fff6e8;}
#igs-overlay .igs-dfx-stroll-steps .igs-dfx-stroll-step.is-l{top:0;rotate:-8deg;}
#igs-overlay .igs-dfx-stroll-steps .igs-dfx-stroll-step.is-r{top:20px;rotate:8deg;}
#igs-overlay .igs-dfx-stroll-leaf{position:absolute;left:62%;top:-4%;width:16px;height:10px;border-radius:0 80% 0 80%;background:linear-gradient(135deg,#e9a14b,#d9703a);opacity:0;animation:igs-dfx-stroll-fall 2.6s ease-in-out .3s both;}
@keyframes igs-dfx-stroll-glow{0%{opacity:0}30%{opacity:.85}75%{opacity:.7}100%{opacity:0}}
@keyframes igs-dfx-stroll-print{from{opacity:0;transform:scale(1.5)}to{opacity:.85;transform:scale(1)}}
@keyframes igs-dfx-stroll-fall{0%{opacity:0;transform:translate(0,0) rotate(0)}15%{opacity:1}35%{transform:translate(-4vmin,22vmin) rotate(90deg)}65%{transform:translate(3vmin,46vmin) rotate(200deg)}100%{opacity:0;transform:translate(-3vmin,70vmin) rotate(320deg)}}
/* 骑行常驻氛围（自行车 / 摩托）：迎面横向掠过的细风线。两层伪元素各跑各的周期做出远近；竖向遮罩把画面中段让出来，不压立绘与对话框。 */
#igs-overlay .igs-dfx-amb-rush{inset:0;--igs-rush:255,255,255;-webkit-mask-image:linear-gradient(180deg,#000 0,#000 30%,transparent 42%,transparent 62%,#000 76%,#000 100%);mask-image:linear-gradient(180deg,#000 0,#000 30%,transparent 42%,transparent 62%,#000 76%,#000 100%);}
#igs-overlay .igs-dfx-amb-rush::before,#igs-overlay .igs-dfx-amb-rush::after{content:"";position:absolute;left:0;top:0;bottom:0;width:200%;background-repeat:repeat-x;}
#igs-overlay .igs-dfx-amb-rush::before{background-image:linear-gradient(90deg,transparent 0 35%,rgba(var(--igs-rush),.42) 85%,transparent),linear-gradient(90deg,transparent 0 50%,rgba(var(--igs-rush),.3) 90%,transparent),linear-gradient(90deg,transparent 0 25%,rgba(var(--igs-rush),.36) 80%,transparent);background-size:12.5% 2px,10% 1.5px,6.25% 1.5px;background-position:0 8%,0 90%,0 22%;animation:igs-amb-rush 1.4s linear infinite;}
#igs-overlay .igs-dfx-amb-rush::after{background-image:linear-gradient(90deg,transparent 0 40%,rgba(var(--igs-rush),.26) 88%,transparent),linear-gradient(90deg,transparent 0 30%,rgba(var(--igs-rush),.22) 85%,transparent);background-size:25% 1.5px,12.5% 1px;background-position:0 15%,0 80%;animation:igs-amb-rush 2.3s linear infinite;}
#igs-overlay .igs-dfx-amb.is-moto .igs-dfx-amb-rush::before{animation-duration:1s;}
#igs-overlay .igs-dfx-amb.is-moto .igs-dfx-amb-rush::after{animation-duration:1.7s;}
#igs-overlay .igs-dfx-amb.is-night .igs-dfx-amb-rush{--igs-rush:190,210,255;opacity:.8;}
@keyframes igs-amb-rush{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}
#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-rush,#igs-overlay .igs-dfx-amb.is-reduced .igs-dfx-amb-rush{display:none;}
/* 玩乐类省电 / 减少动态：伪元素不受 * 选择器管，单独关；从 opacity:0 起步的元素定格成可见。 */
#igs-overlay .igs-dfx.is-reduced.igs-dfx-sing .igs-dfx-sing-label,#igs-overlay .igs-dfx.is-reduced.igs-dfx-dance .igs-dfx-dance-label,#igs-overlay .igs-dfx.is-reduced.igs-dfx-fish .igs-dfx-fish-catch,#igs-overlay .igs-dfx.is-reduced.igs-dfx-draw .igs-dfx-draw-label,#igs-overlay .igs-dfx.is-reduced.igs-dfx-music .igs-dfx-music-label,#igs-overlay .igs-dfx.is-reduced.igs-dfx-ride .igs-dfx-ride-label,#igs-overlay .igs-dfx.is-reduced.igs-dfx-shopping .igs-dfx-shopping-label{opacity:1;transform:translateX(-50%);}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-ride-wheel::after,#igs-overlay .igs-dfx.is-reduced .igs-dfx-ride-cabins i::before,#igs-overlay .igs-dfx.is-reduced .igs-dfx-music-staff::before{animation:none!important;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-clean-sweep,#igs-overlay .igs-dfx.is-reduced .igs-dfx-stroll-leaf{display:none;}
#igs-overlay .igs-dfx.is-reduced.igs-dfx-clean .igs-dfx-clean-sparks i,#igs-overlay .igs-dfx.is-reduced.igs-dfx-shopping .igs-dfx-shopping-sparks i{opacity:1;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-stroll-warm{opacity:.7;}
/* ── 约会地点氛围层：咖啡厅 / 水族馆 / 电影院 / 海边 / 夜景；帝王后宫：宫灯与帷帐。都是环境叠色，不扫光带；夜间色调淡，避免和时段调色重复压暗 ── */
#igs-overlay .igs-dfx-amb-cafelight{inset:0;background:radial-gradient(ellipse 90% 60% at 50% -6%,rgba(255,214,150,.3),transparent 70%),radial-gradient(ellipse 110% 90% at 50% 50%,transparent 62%,rgba(52,28,12,.26) 100%);animation:igs-amb-warmth 9s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-amb-cafedust{left:0;right:0;top:-12%;bottom:-12%;background-image:radial-gradient(circle,rgba(255,236,196,.55) 0 1.5px,transparent 2.5px),radial-gradient(circle,rgba(255,236,196,.4) 0 1px,transparent 2px);background-size:140px 160px,90px 110px;background-position:20px 30px,70px 80px;animation:igs-amb-mote 26s linear infinite;}
#igs-overlay .igs-dfx-amb.is-cafe.is-night .igs-dfx-amb-cafelight{background:radial-gradient(ellipse 80% 54% at 50% -4%,rgba(255,196,120,.26),transparent 70%),radial-gradient(ellipse 110% 90% at 50% 50%,transparent 58%,rgba(30,16,8,.3) 100%);}
#igs-overlay .igs-dfx-amb-caustics{left:-10%;right:-10%;top:-10%;bottom:-10%;background:repeating-radial-gradient(ellipse 60px 34px at 20% 30%,rgba(190,240,255,.16) 0 6px,transparent 7px 52px),repeating-radial-gradient(ellipse 70px 38px at 70% 60%,rgba(170,230,255,.12) 0 6px,transparent 7px 64px);-webkit-mask-image:linear-gradient(180deg,#000,transparent 92%);mask-image:linear-gradient(180deg,#000,transparent 92%);animation:igs-amb-caustics 15s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-amb-aquaglow{inset:0;background:linear-gradient(180deg,rgba(18,70,120,.16),rgba(10,50,100,.12) 40%,rgba(30,120,190,.3) 100%);}
#igs-overlay .igs-dfx-amb.is-aquarium.is-night .igs-dfx-amb-aquaglow{background:linear-gradient(180deg,rgba(6,30,70,.26),rgba(8,40,90,.22) 50%,rgba(20,90,160,.3) 100%);}
#igs-overlay .igs-dfx-amb-cinedark{inset:0;background:radial-gradient(ellipse 80% 70% at 50% 28%,rgba(8,8,16,.1),rgba(4,4,10,.62) 100%);}
#igs-overlay .igs-dfx-amb-screenglow{left:12%;right:12%;top:-6%;height:46%;background:radial-gradient(ellipse 60% 70% at 50% 16%,rgba(214,226,255,.26),transparent 72%);animation:igs-amb-screen 5.4s steps(1,end) infinite;}
#igs-overlay .igs-dfx-amb-horizon{left:0;right:0;top:0;height:46%;background:linear-gradient(180deg,rgba(255,176,110,.2),rgba(255,214,160,.08) 70%,transparent);}
#igs-overlay .igs-dfx-amb-seashimmer{left:-6%;right:-6%;bottom:0;height:52%;background:repeating-linear-gradient(176deg,transparent 0 26px,rgba(255,236,196,.18) 26px 28px,transparent 28px 52px),repeating-linear-gradient(4deg,transparent 0 40px,rgba(255,255,255,.1) 40px 42px,transparent 42px 90px);-webkit-mask-image:linear-gradient(0deg,#000,transparent 94%);mask-image:linear-gradient(0deg,#000,transparent 94%);animation:igs-amb-ripple 6.5s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-amb.is-beach.is-night .igs-dfx-amb-horizon{background:linear-gradient(180deg,rgba(40,60,120,.22),rgba(70,90,150,.08) 70%,transparent);}
#igs-overlay .igs-dfx-amb.is-beach.is-night .igs-dfx-amb-seashimmer{background:repeating-linear-gradient(176deg,transparent 0 26px,rgba(214,230,255,.2) 26px 28px,transparent 28px 52px),repeating-linear-gradient(4deg,transparent 0 40px,rgba(230,240,255,.12) 40px 42px,transparent 42px 90px);}
#igs-overlay .igs-dfx-amb-citybokeh{inset:0;background-image:radial-gradient(circle at 18% 72%,rgba(255,200,110,.5) 0 14px,transparent 16px),radial-gradient(circle at 34% 84%,rgba(255,150,100,.4) 0 22px,transparent 24px),radial-gradient(circle at 52% 76%,rgba(255,226,150,.46) 0 12px,transparent 14px),radial-gradient(circle at 68% 88%,rgba(255,176,120,.4) 0 26px,transparent 28px),radial-gradient(circle at 84% 74%,rgba(255,214,140,.44) 0 16px,transparent 18px),radial-gradient(circle at 92% 90%,rgba(255,140,110,.34) 0 20px,transparent 22px);-webkit-mask-image:linear-gradient(0deg,#000 20%,transparent 90%);mask-image:linear-gradient(0deg,#000 20%,transparent 90%);animation:igs-amb-twinkle 6s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-amb.is-nightview:not(.is-night) .igs-dfx-amb-citybokeh{opacity:.5;}
@keyframes igs-amb-warmth{from{opacity:.8}to{opacity:1}}
@keyframes igs-amb-mote{from{transform:translate3d(0,-6%,0)}to{transform:translate3d(2%,6%,0)}}
@keyframes igs-amb-caustics{from{transform:translate3d(-3%,-1%,0) scale(1)}to{transform:translate3d(3%,2%,0) scale(1.06)}}
@keyframes igs-amb-screen{0%{opacity:.85}12%{opacity:.5}20%{opacity:1}44%{opacity:.7}58%{opacity:.95}73%{opacity:.55}100%{opacity:.85}}
@keyframes igs-amb-twinkle{from{opacity:.7;transform:scale(1)}to{opacity:1;transform:scale(1.03)}}
/* 后宫：暖金宫灯（实色红罩，缓摆）+ 两侧垂落的帷帐轻纱；variant curtain 时纱帐更浓、宫灯压暗 */
#igs-overlay .igs-dfx-amb-palaceglow{inset:0;background:radial-gradient(ellipse 80% 66% at 50% 8%,rgba(255,196,110,.3),transparent 70%),radial-gradient(ellipse 110% 90% at 50% 50%,transparent 56%,rgba(60,14,8,.36) 100%);animation:igs-amb-warmth 7s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-amb-lamps{left:0;right:0;top:0;height:34%;}
#igs-overlay .igs-dfx-amb-lamps b{position:absolute;top:-2%;width:clamp(26px,5vmin,44px);height:clamp(34px,6.4vmin,56px);border-radius:46% 46% 40% 40%;background:#b3281c;box-shadow:0 0 22px 8px rgba(255,170,80,.42),inset 0 -8px 0 #e0a24a,inset 0 8px 0 #e0a24a;transform-origin:50% -40px;animation:igs-amb-lamp 5.6s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-amb-lamps b::before{content:"";position:absolute;left:50%;top:-34px;width:1px;height:34px;background:#6a4a22;}
#igs-overlay .igs-dfx-amb-lamps b:nth-child(1){left:12%;}
#igs-overlay .igs-dfx-amb-lamps b:nth-child(2){left:48%;animation-delay:-2.2s;top:-6%;}
#igs-overlay .igs-dfx-amb-lamps b:nth-child(3){right:12%;animation-delay:-4s;}
#igs-overlay .igs-dfx-amb-veil{inset:0;background:linear-gradient(90deg,rgba(214,70,60,.2),rgba(214,70,60,.04) 18%,transparent 30%,transparent 70%,rgba(214,70,60,.04) 82%,rgba(214,70,60,.2));transform-origin:50% 0;animation:igs-amb-veil 8s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-amb.is-curtain .igs-dfx-amb-veil{background:linear-gradient(90deg,rgba(200,52,52,.34),rgba(200,52,52,.12) 24%,rgba(255,226,200,.05) 40%,rgba(255,226,200,.05) 60%,rgba(200,52,52,.12) 76%,rgba(200,52,52,.34)),repeating-linear-gradient(90deg,transparent 0 38px,rgba(255,220,180,.07) 38px 40px);}
#igs-overlay .igs-dfx-amb.is-curtain .igs-dfx-amb-lamps{opacity:.45;}
#igs-overlay .igs-dfx-amb.is-palace.is-night .igs-dfx-amb-palaceglow{background:radial-gradient(ellipse 70% 56% at 50% 6%,rgba(255,170,90,.28),transparent 70%),radial-gradient(ellipse 110% 90% at 50% 50%,transparent 50%,rgba(40,8,6,.44) 100%);}
@keyframes igs-amb-lamp{from{transform:rotate(-2.4deg)}to{transform:rotate(2.4deg)}}
@keyframes igs-amb-veil{from{transform:scaleX(1)}to{transform:scaleX(1.012) skewX(.4deg)}}
/* 修仙武侠古风地点：客栈暖灯晕 + 飘尘、洞府暗角 + 水滴光点、云海薄雾（流云复用 sky 的 clouds） */
#igs-overlay .igs-dfx-amb-innglow{inset:0;background:radial-gradient(ellipse 70% 56% at 50% 4%,rgba(255,186,100,.3),transparent 72%),radial-gradient(ellipse 110% 90% at 50% 50%,transparent 56%,rgba(48,22,8,.34) 100%);animation:igs-amb-flicker 7.5s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-amb-innmote{left:0;right:0;top:-12%;bottom:-12%;background-image:radial-gradient(circle,rgba(255,226,170,.5) 0 1.5px,transparent 2.5px);background-size:120px 140px;animation:igs-amb-mote 30s linear infinite;}
#igs-overlay .igs-dfx-amb-cavedark{inset:0;background:radial-gradient(ellipse 72% 66% at 50% 46%,transparent 30%,rgba(6,10,14,.62) 100%);}
#igs-overlay .igs-dfx-amb-cavedrip{left:24%;top:-4%;width:3px;height:3px;border-radius:50%;background:rgba(200,236,255,.9);box-shadow:0 0 8px 3px rgba(150,210,255,.5),38vw 0 0 0 rgba(200,236,255,.0);animation:igs-amb-drip 4.6s cubic-bezier(.5,0,.9,.6) infinite;}
#igs-overlay .igs-dfx-amb-seamist{left:-10%;right:-10%;bottom:-6%;height:52%;background:linear-gradient(0deg,rgba(240,246,250,.34),rgba(240,246,250,.1) 60%,transparent);animation:igs-amb-drift 16s ease-in-out infinite alternate;}
@keyframes igs-amb-drip{0%{transform:translate3d(0,0,0);opacity:0}8%{opacity:1}60%{transform:translate3d(0,64vh,0);opacity:1}64%,100%{transform:translate3d(0,64vh,0) scale(3,.4);opacity:0}}
#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-cafedust,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-caustics,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-screenglow,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-seashimmer,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-citybokeh,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-lamps b,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-veil,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-innmote,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-cavedrip,#igs-overlay[data-igs-quality="low"] .igs-dfx-amb-seamist{animation:none;}
#igs-overlay .igs-dfx-amb.is-reduced.is-cafe i,#igs-overlay .igs-dfx-amb.is-reduced.is-aquarium i,#igs-overlay .igs-dfx-amb.is-reduced.is-cinema i,#igs-overlay .igs-dfx-amb.is-reduced.is-beach i,#igs-overlay .igs-dfx-amb.is-reduced.is-nightview i,#igs-overlay .igs-dfx-amb.is-reduced.is-palace i,#igs-overlay .igs-dfx-amb.is-reduced.is-palace b,#igs-overlay .igs-dfx-amb.is-reduced.is-inn i,#igs-overlay .igs-dfx-amb.is-reduced.is-cave i,#igs-overlay .igs-dfx-amb.is-reduced.is-cloudsea i{animation:none;}
#igs-overlay .igs-dfx-amb.is-reduced .igs-dfx-amb-cavedrip{display:none;}
/* ── 修仙武侠日常演出：墨色留白，青白剑气，朱砂点睛；装饰用实色线，不画铭牌框 ── */
#igs-overlay .igs-dfx-yujian{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-yujian-blade{position:absolute;left:-16%;top:68%;width:34%;height:3px;background:linear-gradient(90deg,transparent,#dff2f4 30%,#fff);border-radius:2px;box-shadow:0 0 14px 3px rgba(190,236,244,.8);transform:rotate(-24deg);transform-origin:100% 50%;animation:igs-dfx-yujian-fly calc(var(--igs-dfx-life) * .62) cubic-bezier(.3,.6,.2,1) both;}
#igs-overlay .igs-dfx-yujian-trail{position:absolute;left:-16%;top:68%;width:58%;height:22px;background:linear-gradient(90deg,transparent,rgba(31,37,35,.32) 60%,rgba(31,37,35,.5));transform:rotate(-24deg);transform-origin:100% 50%;animation:igs-dfx-yujian-fly calc(var(--igs-dfx-life) * .62) cubic-bezier(.3,.6,.2,1) both;}
#igs-overlay .igs-dfx-yujian-glint{position:absolute;right:14%;top:22%;width:8px;height:8px;border-radius:50%;background:#fff;box-shadow:0 0 18px 8px rgba(190,236,244,.85);opacity:0;animation:igs-dfx-yujian-glint calc(var(--igs-dfx-life) * .5) ease-out calc(var(--igs-dfx-life) * .32) both;}
@keyframes igs-dfx-yujian-fly{0%{transform:translate3d(0,0,0) rotate(-24deg);opacity:0}12%{opacity:1}100%{transform:translate3d(190%,-150%,0) rotate(-24deg);opacity:0}}
@keyframes igs-dfx-yujian-glint{0%{opacity:0;transform:scale(.3)}30%{opacity:1;transform:scale(1.3)}100%{opacity:0;transform:scale(.5)}}
#igs-overlay .igs-dfx-liandan{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-liandan-stage{position:absolute;left:50%;bottom:8%;width:min(34%,260px);height:56%;margin-left:min(-17%,-130px);}
#igs-overlay .igs-dfx-liandan-cauldron{position:absolute;left:14%;right:14%;bottom:0;height:38%;border-radius:12% 12% 46% 46%;background:#2a2e2c;box-shadow:inset 0 6px 0 #4a504d,0 0 0 2px #1f2523;}
#igs-overlay .igs-dfx-liandan-cauldron::before,#igs-overlay .igs-dfx-liandan-cauldron::after{content:"";position:absolute;bottom:-12%;width:10%;height:22%;background:#1f2523;}
#igs-overlay .igs-dfx-liandan-cauldron::before{left:14%;}
#igs-overlay .igs-dfx-liandan-cauldron::after{right:14%;}
#igs-overlay .igs-dfx-liandan-fire{position:absolute;left:36%;right:36%;bottom:-4%;height:20%;background:radial-gradient(ellipse at 50% 100%,#ffd27a,#e0762a 50%,transparent 72%);animation:igs-amb-flicker 1.1s ease-in-out infinite;}
#igs-overlay .igs-dfx-liandan-smoke{position:absolute;inset:0 0 34% 0;}
#igs-overlay .igs-dfx-liandan-smoke i{position:absolute;bottom:0;width:22%;height:42%;border-radius:50%;background:radial-gradient(closest-side,rgba(226,232,230,.7),transparent 72%);opacity:0;animation:igs-dfx-liandan-smoke 2.6s ease-out infinite;}
#igs-overlay .igs-dfx-liandan-pill{position:absolute;left:50%;bottom:36%;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#e8b84a;box-shadow:0 0 18px 6px rgba(255,214,110,.8);opacity:0;animation:igs-dfx-liandan-pill calc(var(--igs-dfx-life) * .6) cubic-bezier(.2,.8,.3,1) calc(var(--igs-dfx-life) * .3) both;}
#igs-overlay .igs-dfx-liandan-aura{position:absolute;left:50%;bottom:30%;width:80%;height:50%;margin-left:-40%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,226,140,.34),transparent 72%);opacity:0;animation:igs-dfx-fade calc(var(--igs-dfx-life) * .6) ease calc(var(--igs-dfx-life) * .3) both;}
#igs-overlay .igs-dfx-liandan-fume{position:absolute;left:30%;right:30%;bottom:34%;height:46%;background:radial-gradient(closest-side,rgba(24,24,26,.78),transparent 74%);opacity:0;animation:igs-dfx-liandan-smoke 2.2s ease-out calc(var(--igs-dfx-life) * .3) infinite;}
#igs-overlay .igs-dfx-liandan-label{position:absolute;left:50%;top:22%;transform:translateX(-50%);color:#b23a2a;font:700 clamp(22px,4.4vmin,36px)/1 "Source Han Serif CN","Songti SC",serif;letter-spacing:.3em;writing-mode:vertical-rl;opacity:0;animation:igs-dfx-liandan-label calc(var(--igs-dfx-life) * .6) ease calc(var(--igs-dfx-life) * .36) both;}
#igs-overlay .igs-dfx-liandan.is-fail .igs-dfx-liandan-label{color:#3a3f3d;}
@keyframes igs-dfx-liandan-smoke{0%{opacity:0;transform:translate3d(0,0,0) scale(.6)}30%{opacity:.9}100%{opacity:0;transform:translate3d(14%,-120%,0) scale(1.5)}}
@keyframes igs-dfx-liandan-pill{0%{opacity:0;transform:translateY(0) scale(.4)}30%{opacity:1;transform:translateY(-140%) scale(1.3)}70%{opacity:1;transform:translateY(-110%) scale(1)}100%{opacity:0;transform:translateY(-150%) scale(.9)}}
@keyframes igs-dfx-liandan-label{0%{opacity:0;transform:translateX(-50%) translateY(8px)}30%,80%{opacity:1;transform:translateX(-50%)}100%{opacity:0}}
#igs-overlay .igs-dfx-biguan{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-biguan-veil{position:absolute;inset:0;background:radial-gradient(ellipse 60% 56% at 50% 54%,rgba(31,37,35,.08),rgba(31,37,35,.66) 100%);}
#igs-overlay .igs-dfx-biguan-qi{position:absolute;left:50%;top:54%;width:0;height:0;}
#igs-overlay .igs-dfx-biguan-qi i{position:absolute;left:-90px;top:-90px;width:180px;height:180px;border-radius:50%;border:2px solid rgba(180,226,230,.8);opacity:0;animation:igs-dfx-biguan-breath 3.6s ease-in-out infinite;}
#igs-overlay .igs-dfx-biguan-text{position:absolute;left:50%;bottom:20%;transform:translateX(-50%);color:#e8efe8;font:600 clamp(16px,3vmin,24px)/1.3 "Source Han Serif CN","Songti SC",serif;letter-spacing:.4em;text-shadow:0 2px 10px rgba(0,0,0,.6);}
@keyframes igs-dfx-biguan-breath{0%{opacity:0;transform:scale(.5)}35%{opacity:.85}70%{opacity:.4;transform:scale(1.5)}100%{opacity:0;transform:scale(1.9)}}
#igs-overlay .igs-dfx-dianxue{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-dianxue-stage{position:absolute;left:50%;top:40%;width:0;height:0;}
#igs-overlay .igs-dfx-dianxue-dot{position:absolute;left:-5px;top:-5px;width:10px;height:10px;border-radius:50%;background:#b23a2a;box-shadow:0 0 12px 4px rgba(178,58,42,.6);animation:igs-dfx-dianxue-dot .5s ease-out both;}
#igs-overlay .igs-dfx-dianxue-ring{position:absolute;left:-60px;top:-60px;width:120px;height:120px;border-radius:50%;border:2px solid rgba(178,58,42,.8);opacity:0;animation:igs-dfx-dianxue-ring 1.5s ease-out .25s both;}
#igs-overlay .igs-dfx-dianxue-ring.is-2{border-color:rgba(95,127,134,.8);animation-delay:.6s;}
@keyframes igs-dfx-dianxue-dot{0%{transform:scale(2.4);opacity:0}40%{opacity:1}100%{transform:scale(1)}}
@keyframes igs-dfx-dianxue-ring{0%{opacity:.95;transform:scale(.2)}100%{opacity:0;transform:scale(1.8)}}
#igs-overlay .igs-dfx-qinggong{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-qinggong-ghost{position:absolute;left:0;right:0;top:30%;height:40%;background:linear-gradient(90deg,transparent,rgba(31,37,35,.22) 50%,transparent);animation:igs-dfx-qinggong-ghost calc(var(--igs-dfx-life) * .5) ease-out both;}
#igs-overlay .igs-dfx-qinggong-ghost.is-2{top:38%;height:26%;animation-delay:.12s;opacity:.7;}
#igs-overlay .igs-dfx-qinggong-leaves i{position:absolute;left:-4%;width:14px;height:7px;border-radius:70% 0 70% 0;background:#6f8f6a;opacity:0;animation:igs-dfx-qinggong-leaf 1.5s ease-out both;}
@keyframes igs-dfx-qinggong-ghost{0%{transform:translateX(-60%);opacity:0}30%{opacity:1}100%{transform:translateX(60%);opacity:0}}
@keyframes igs-dfx-qinggong-leaf{0%{opacity:0;transform:translate3d(0,0,0) rotate(0)}20%{opacity:.9}100%{opacity:0;transform:translate3d(120vw,-6vh,0) rotate(540deg)}}
#igs-overlay .igs-dfx-yungong{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-yungong-stage{position:absolute;left:50%;bottom:8%;width:min(40%,300px);height:70%;margin-left:min(-20%,-150px);}
#igs-overlay .igs-dfx-yungong-palm{position:absolute;left:50%;top:44%;width:44%;height:22%;margin-left:-22%;border-radius:50%;background:radial-gradient(closest-side,rgba(150,230,214,.8),transparent 74%);animation:igs-amb-warmth 1.4s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-yungong-lines i{position:absolute;top:8%;width:1px;height:76%;background:linear-gradient(180deg,transparent,#8fe0cf 40%,transparent);opacity:0;animation:igs-dfx-yungong-line 2.2s ease-in-out infinite;}
#igs-overlay .igs-dfx-yungong.is-fail .igs-dfx-yungong-palm{background:radial-gradient(closest-side,rgba(170,176,176,.7),transparent 74%);}
#igs-overlay .igs-dfx-yungong.is-fail .igs-dfx-yungong-lines i{background:linear-gradient(180deg,transparent,#a8aeae 40%,transparent);}
@keyframes igs-dfx-yungong-line{0%{opacity:0;transform:translateY(30%)}40%{opacity:.9}100%{opacity:0;transform:translateY(-30%)}}
/* ── 体贴动作与积木（约会 / 后宫共用）：光效 + 角落动作字样 ── */
#igs-overlay .igs-dfx-courtesy-label{position:absolute;right:9%;top:16%;padding:5px 16px;border-radius:999px;background:rgba(40,30,20,.72);color:#ffe8c8;font:600 clamp(14px,2.5vmin,20px)/1.3 "Source Han Sans CN","PingFang SC",sans-serif;letter-spacing:.12em;opacity:0;animation:igs-dfx-drape-label var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-courtesy-label{opacity:1;animation:none;}
#igs-overlay .igs-dfx-opendoor,#igs-overlay .igs-dfx-shield,#igs-overlay .igs-dfx-tend,#igs-overlay .igs-dfx-carry,#igs-overlay .igs-dfx-candle,#igs-overlay .igs-dfx-pass,#igs-overlay .igs-dfx-stance{animation:igs-dfx-fade var(--igs-dfx-life) ease both;}
#igs-overlay .igs-dfx-opendoor-stage{position:absolute;left:6%;top:12%;width:34%;height:74%;}
#igs-overlay .igs-dfx-opendoor-gap{position:absolute;left:0;top:0;bottom:0;width:6px;background:linear-gradient(180deg,transparent,rgba(255,238,200,.85),transparent);opacity:0;animation:igs-dfx-opendoor-gap calc(var(--igs-dfx-life) * .8) ease-out both;}
#igs-overlay .igs-dfx-opendoor-arc{position:absolute;left:0;top:4%;width:100%;height:92%;border-radius:0 100% 100% 0 / 0 50% 50% 0;background:conic-gradient(from 180deg at 0 50%,transparent 0deg,rgba(255,236,196,.34) 70deg,transparent 90deg);transform-origin:0 50%;opacity:0;animation:igs-dfx-opendoor-arc calc(var(--igs-dfx-life) * .8) cubic-bezier(.3,.8,.3,1) both;}
@keyframes igs-dfx-opendoor-arc{0%{opacity:0;transform:scaleX(.1)}25%{opacity:1}100%{opacity:0;transform:scaleX(1)}}
@keyframes igs-dfx-opendoor-gap{0%{opacity:0;transform:scaleY(.3)}30%{opacity:1;transform:scaleY(1)}100%{opacity:0}}
#igs-overlay .igs-dfx-shield-stage{position:absolute;left:50%;top:18%;width:min(50%,380px);height:66%;margin-left:min(-25%,-190px);}
#igs-overlay .igs-dfx-shield-wall{position:absolute;left:0;right:0;top:0;bottom:0;border-radius:50% / 14%;background:linear-gradient(90deg,transparent,rgba(255,236,196,.2) 30%,rgba(255,248,226,.3) 50%,rgba(255,236,196,.2) 70%,transparent);opacity:0;animation:igs-dfx-shield-wall calc(var(--igs-dfx-life) * .9) ease-out both;}
#igs-overlay .igs-dfx-shield-edge{position:absolute;left:50%;top:0;bottom:0;width:2px;margin-left:-1px;background:linear-gradient(180deg,transparent,#fff3d6,transparent);opacity:0;animation:igs-dfx-shield-wall calc(var(--igs-dfx-life) * .9) ease-out both;}
@keyframes igs-dfx-shield-wall{0%{opacity:0;transform:scaleX(.4)}22%{opacity:1;transform:scaleX(1.04)}36%{transform:scaleX(1)}100%{opacity:0;transform:scaleX(1.1)}}
#igs-overlay .igs-dfx-tend-stage{position:absolute;left:50%;bottom:6%;width:min(40%,300px);height:34%;margin-left:min(-20%,-150px);}
#igs-overlay .igs-dfx-tend-halo{position:absolute;left:10%;right:10%;bottom:0;height:80%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,226,180,.5),transparent 74%);opacity:0;animation:igs-dfx-tend-halo var(--igs-dfx-life) ease-in-out both;}
#igs-overlay .igs-dfx-tend-spark{position:absolute;left:36%;bottom:30%;width:6px;height:6px;border-radius:50%;background:#fff4d8;box-shadow:0 0 10px 3px rgba(255,236,190,.8);opacity:0;animation:igs-dfx-tend-spark calc(var(--igs-dfx-life) * .6) ease-out calc(var(--igs-dfx-life) * .2) both;}
#igs-overlay .igs-dfx-tend-spark.is-2{left:60%;bottom:42%;animation-delay:calc(var(--igs-dfx-life) * .34);}
@keyframes igs-dfx-tend-halo{0%{opacity:0;transform:scale(.6)}40%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.2)}}
@keyframes igs-dfx-tend-spark{0%{opacity:0;transform:translateY(0) scale(.4)}40%{opacity:1}100%{opacity:0;transform:translateY(-70%) scale(1)}}
#igs-overlay .igs-dfx-carry-stage{position:absolute;left:50%;bottom:6%;width:min(44%,330px);height:76%;margin-left:min(-22%,-165px);}
#igs-overlay .igs-dfx-carry-lift{position:absolute;left:14%;right:14%;bottom:0;height:100%;background:linear-gradient(0deg,rgba(255,214,150,.46),rgba(255,226,180,.14) 60%,transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 30%,#000 70%,transparent);mask-image:linear-gradient(90deg,transparent,#000 30%,#000 70%,transparent);transform-origin:50% 100%;opacity:0;animation:igs-dfx-carry-lift calc(var(--igs-dfx-life) * .9) ease-out both;}
#igs-overlay .igs-dfx-carry-glow{position:absolute;left:20%;right:20%;bottom:-4%;height:26%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,226,170,.6),transparent 74%);opacity:0;animation:igs-dfx-tend-halo var(--igs-dfx-life) ease-in-out both;}
@keyframes igs-dfx-carry-lift{0%{opacity:0;transform:scaleY(.2)}35%{opacity:1;transform:scaleY(1)}100%{opacity:0;transform:scaleY(1.12) translateY(-4%)}}
#igs-overlay .igs-dfx-candle-stage{position:absolute;left:50%;bottom:10%;width:80px;height:140px;margin-left:calc(min(22%,170px) - 40px);}
#igs-overlay .igs-dfx-candle-body{position:absolute;left:50%;bottom:0;width:14px;height:64px;margin-left:-7px;border-radius:2px;background:#f3ead4;box-shadow:inset -3px 0 0 #dccfae;}
#igs-overlay .igs-dfx-candle-flame{position:absolute;left:50%;bottom:62px;width:12px;height:26px;margin-left:-6px;border-radius:50% 50% 50% 50% / 62% 62% 38% 38%;background:linear-gradient(0deg,#e0761e,#ffd070 60%,#fff6d0);transform-origin:50% 100%;opacity:0;animation:igs-dfx-candle-ignite var(--igs-dfx-life) ease-out both,igs-dfx-candle-dance .7s ease-in-out infinite alternate;}
#igs-overlay .igs-dfx-candle-halo{position:absolute;left:50%;bottom:34px;width:150px;height:150px;margin-left:-75px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,200,110,.5),transparent 72%);opacity:0;animation:igs-dfx-candle-halo var(--igs-dfx-life) ease-out both;}
#igs-overlay .igs-dfx-candle-glow{position:absolute;left:-200%;right:-200%;bottom:-40px;height:90px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,196,110,.22),transparent 74%);opacity:0;animation:igs-dfx-candle-halo var(--igs-dfx-life) ease-out both;}
@keyframes igs-dfx-candle-ignite{0%{opacity:0;transform:scale(.1)}12%{opacity:1;transform:scale(.5,.7)}30%{transform:scale(1.1,1.2)}80%{opacity:1}100%{opacity:0;transform:scale(.8)}}
@keyframes igs-dfx-candle-dance{from{transform:skewX(-4deg) scaleY(.96)}to{transform:skewX(4deg) scaleY(1.06)}}
@keyframes igs-dfx-candle-halo{0%{opacity:0;transform:scale(.3)}30%{opacity:1;transform:scale(1)}85%{opacity:.8}100%{opacity:0}}
#igs-overlay .igs-dfx-candle.is-lamp .igs-dfx-candle-body{width:46px;height:58px;margin-left:-23px;bottom:20px;border-radius:46% 46% 40% 40%;background:#b3281c;box-shadow:inset 0 -8px 0 #e0a24a,inset 0 8px 0 #e0a24a;}
#igs-overlay .igs-dfx-candle.is-lamp .igs-dfx-candle-flame{bottom:34px;width:10px;height:18px;margin-left:-5px;}
#igs-overlay .igs-dfx-candle.is-incense .igs-dfx-candle-stick{position:absolute;left:50%;bottom:0;width:3px;height:70px;margin-left:-1.5px;background:#6a4a22;}
#igs-overlay .igs-dfx-candle.is-incense .igs-dfx-candle-ember{position:absolute;left:50%;bottom:68px;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:#ff7a30;box-shadow:0 0 10px 4px rgba(255,140,60,.7);animation:igs-amb-flicker 1.2s ease-in-out infinite;}
#igs-overlay .igs-dfx-candle.is-incense .igs-dfx-candle-smoke{position:absolute;left:50%;bottom:72px;width:26px;height:80px;margin-left:-13px;background:radial-gradient(closest-side,rgba(226,232,230,.6),transparent 72%);opacity:0;animation:igs-dfx-liandan-smoke 2.8s ease-out infinite;}
#igs-overlay .igs-dfx-candle.is-incense .igs-dfx-candle-smoke.is-2{animation-delay:1.3s;}
#igs-overlay .igs-dfx-pass-stage{position:absolute;left:50%;top:50%;width:min(36%,280px);height:0;margin-left:min(-18%,-140px);}
#igs-overlay .igs-dfx-pass-item{position:absolute;left:0;top:0;padding:4px 14px;border-radius:999px;background:rgba(255,246,226,.92);color:#4a3622;font:600 clamp(13px,2.4vmin,19px)/1.3 "Source Han Sans CN","PingFang SC",sans-serif;letter-spacing:.1em;white-space:nowrap;opacity:0;animation:igs-dfx-pass-item calc(var(--igs-dfx-life) * .85) cubic-bezier(.4,.1,.3,1) both;}
#igs-overlay .igs-dfx-pass-trail{position:absolute;left:0;top:-4px;width:100%;height:12px;border-radius:50%;background:linear-gradient(90deg,rgba(255,236,196,.4),transparent);opacity:0;animation:igs-dfx-fade calc(var(--igs-dfx-life) * .7) ease both;}
#igs-overlay .igs-dfx-pass-ring{position:absolute;right:0;top:-20px;width:40px;height:40px;border-radius:50%;border:2px solid rgba(255,236,196,.8);opacity:0;animation:igs-dfx-dianxue-ring 1.2s ease-out calc(var(--igs-dfx-life) * .5) both;}
@keyframes igs-dfx-pass-item{0%{opacity:0;transform:translate3d(0,10px,0)}20%{opacity:1}55%{transform:translate3d(60%,-26px,0)}85%{opacity:1;transform:translate3d(120%,-4px,0)}100%{opacity:0;transform:translate3d(130%,0,0)}}
#igs-overlay .igs-dfx-stance-stage{position:absolute;left:50%;bottom:4%;width:min(46%,340px);height:78%;margin-left:min(-23%,-170px);}
#igs-overlay .igs-dfx-stance-dais{position:absolute;left:8%;right:8%;bottom:0;height:7%;border-radius:50%;background:radial-gradient(closest-side,rgba(31,37,35,.5),transparent 74%);opacity:0;animation:igs-dfx-tend-halo var(--igs-dfx-life) ease-in-out both;}
#igs-overlay .igs-dfx-stance-beam{position:absolute;left:30%;right:30%;bottom:0;height:100%;background:linear-gradient(0deg,rgba(255,226,160,.34),transparent 80%);opacity:0;display:none;}
#igs-overlay .igs-dfx-stance.is-throne .igs-dfx-stance-beam{display:block;animation:igs-dfx-carry-lift calc(var(--igs-dfx-life) * .9) ease-out both;}
#igs-overlay .igs-dfx-stance.is-kneel .igs-dfx-stance-dais,#igs-overlay .igs-dfx-stance.is-attend .igs-dfx-stance-dais{background:radial-gradient(closest-side,rgba(120,30,24,.4),transparent 74%);}
#igs-overlay .igs-dfx-stance.is-side .igs-dfx-stance-dais,#igs-overlay .igs-dfx-stance.is-lean .igs-dfx-stance-dais{background:radial-gradient(closest-side,rgba(255,200,160,.4),transparent 74%);}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-yujian-blade,#igs-overlay .igs-dfx.is-reduced .igs-dfx-yujian-trail,#igs-overlay .igs-dfx.is-reduced .igs-dfx-qinggong-ghost,#igs-overlay .igs-dfx.is-reduced .igs-dfx-qinggong-leaves,#igs-overlay .igs-dfx.is-reduced .igs-dfx-dianxue-ring,#igs-overlay .igs-dfx.is-reduced .igs-dfx-pass-trail,#igs-overlay .igs-dfx.is-reduced .igs-dfx-candle-flame{animation:none;opacity:.8;}
#igs-overlay .igs-dfx.is-reduced .igs-dfx-liandan-smoke,#igs-overlay .igs-dfx.is-reduced .igs-dfx-biguan-qi,#igs-overlay .igs-dfx.is-reduced .igs-dfx-yungong-lines{display:none;}
`;
