// 日常演出样式。所有卡片的寿命由 --igs-dfx-life 驱动，进出场用百分比关键帧跟随寿命伸缩。
const RED = '#c8392b';
export const DAILY_FX_STYLE_TEXT = `
#igs-overlay .igs-dfx{position:absolute;inset:0;pointer-events:none;--igs-dfx-life:3000ms;}
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

`;
