// 常驻氛围层的细节层：载具窗框与窗外景、太空星闪与星球、云海仙山、客栈梁灯、洞府钟乳、约会地点的杯口热气 / 海平线 / 天际线。
// 只用静态元素加 transform / opacity 慢动画；low 画质与 reduced 一律静止，静止时画面仍完整。
const A = '#igs-overlay .igs-dfx-amb';
const LOW = '#igs-overlay[data-igs-quality="low"] .igs-dfx-amb.igs-dfx-amb';
const RED = `${A}.is-reduced.igs-dfx-amb`;

export const AMB_DETAIL_STYLE_TEXT = `
${A}-frame{inset:0;opacity:.72;}
${A}.is-train .igs-dfx-amb-frame,${A}.is-car .igs-dfx-amb-frame{background:linear-gradient(180deg,rgba(10,12,18,.5),transparent 4%),linear-gradient(0deg,rgba(10,12,18,.5),transparent 5%),radial-gradient(ellipse 80% 75% at 50% 50%,transparent 60%,rgba(10,12,18,.28));}
${A}.is-subway .igs-dfx-amb-frame{opacity:.9;}
${A}.is-plane .igs-dfx-amb-frame{background:radial-gradient(ellipse 72% 78% at 50% 50%,transparent 58%,rgba(14,18,28,.34));opacity:.6;}
${A}.is-plane.is-airship .igs-dfx-amb-frame{background:radial-gradient(ellipse 72% 78% at 50% 50%,transparent 58%,rgba(40,24,10,.34));opacity:.8;}
${A}-scenery{left:0;top:0;width:200%;height:100%;}
${A}.is-train .igs-dfx-amb-scenery{top:8%;height:80%;background:linear-gradient(90deg,transparent,rgba(10,12,18,.16) 50%,transparent) 0 0/25% 100% repeat-x;animation:igs-amb-clouds 16s linear infinite;}
${A}.is-subway .igs-dfx-amb-scenery{top:0;height:100%;background:linear-gradient(90deg,transparent 40%,rgba(255,236,196,.26) 40%,rgba(255,236,196,.26) 60%,transparent 60%) 0 30%/25% 3px repeat-x,linear-gradient(90deg,transparent 40%,rgba(255,236,196,.18) 40%,rgba(255,236,196,.18) 60%,transparent 60%) 0 62%/25% 2px repeat-x;animation:igs-amb-clouds 3s linear infinite;}
${A}.is-car .igs-dfx-amb-scenery{top:8%;height:80%;background:linear-gradient(90deg,transparent,rgba(10,12,18,.14) 50%,transparent) 0 0/25% 100% repeat-x;animation:igs-amb-clouds 26s linear infinite;}
${A}.is-car.is-night .igs-dfx-amb-scenery{top:0;height:60%;background:radial-gradient(ellipse 12% 34% at 50% 0,rgba(255,186,110,.32),transparent 72%) 0 0/25% 100% repeat-x;animation-duration:8s;}
${A}.is-plane .igs-dfx-amb-scenery{top:48%;height:52%;background:radial-gradient(ellipse 14% 22% at 30% 40%,rgba(255,255,255,.18),transparent 70%) 0 0/25% 100% repeat-x,radial-gradient(ellipse 20% 26% at 78% 72%,rgba(255,255,255,.13),transparent 70%) 0 0/25% 100% repeat-x;animation:igs-amb-clouds 70s linear infinite;}
${A}.is-plane.is-night .igs-dfx-amb-scenery{opacity:.4;}
${A}.is-plane.is-airship .igs-dfx-amb-scenery{opacity:.8;}

${A}-planet{right:-10%;top:-34%;width:44%;aspect-ratio:1/1;border-radius:50%;background:radial-gradient(circle at 30% 70%,#050b18 0,#050b18 40%,#0b1a34 100%);box-shadow:inset 8px -10px 18px -8px rgba(130,190,255,.6),inset 2px -2px 1px rgba(190,225,255,.7),0 0 36px 4px rgba(90,150,240,.16);}
${A}-twink{inset:0;background:radial-gradient(circle at 18% 22%,#fff 0 1.6px,rgba(190,215,255,.4) 3px,transparent 9px),radial-gradient(circle at 36% 68%,#fff 0 1.4px,rgba(190,215,255,.35) 3px,transparent 8px);animation:igs-amb-pulse 4.6s ease-in-out infinite alternate;}
${A}-twink::before,${A}-twink::after{content:"";position:absolute;inset:0;}
${A}-twink::before{background:radial-gradient(circle at 71% 16%,#fff 0 1.8px,rgba(200,220,255,.4) 3.5px,transparent 10px),radial-gradient(circle at 86% 74%,#fff 0 1.4px,rgba(190,215,255,.35) 3px,transparent 8px);animation:igs-amb-pulse 6.4s ease-in-out -2s infinite alternate;}
${A}-twink::after{background:radial-gradient(circle at 52% 34%,#fff 0 1.5px,rgba(190,215,255,.35) 3px,transparent 8px),radial-gradient(circle at 8% 84%,#fff 0 1.3px,rgba(190,215,255,.3) 3px,transparent 8px);animation:igs-amb-pulse 5.4s ease-in-out -4s infinite alternate;}

${A}-sunrim{inset:0;background:radial-gradient(ellipse 62% 22% at 50% 62%,rgba(255,216,140,.42),rgba(255,180,110,.12) 52%,transparent 76%);}
${A}.is-cloudsea.is-night .igs-dfx-amb-sunrim{background:radial-gradient(ellipse 50% 20% at 50% 62%,rgba(170,196,255,.26),transparent 74%);}
${A}.is-cloudsea .igs-dfx-amb-clouds{opacity:.75;animation-duration:44s;}

${A}-hveil{inset:0;background:radial-gradient(ellipse 90% 60% at 50% 100%,rgba(255,252,246,.1),transparent 78%),radial-gradient(ellipse 70% 50% at 8% 55%,rgba(255,252,246,.06),transparent 80%),radial-gradient(ellipse 70% 50% at 94% 40%,rgba(255,252,246,.06),transparent 80%);animation:igs-amb-pulse 14s ease-in-out infinite alternate;}
${A}-hfar{left:0;bottom:6%;width:200%;height:30%;background:radial-gradient(ellipse 12% 30% at 12% 60%,rgba(255,252,246,.12),transparent 72%),radial-gradient(ellipse 9% 24% at 38% 40%,rgba(255,252,246,.09),transparent 72%),radial-gradient(ellipse 13% 28% at 66% 66%,rgba(255,252,246,.1),transparent 72%),radial-gradient(ellipse 8% 22% at 90% 46%,rgba(255,252,246,.08),transparent 72%);background-size:50% 100%;background-repeat:repeat-x;animation:igs-amb-clouds 110s linear infinite;}
${A}-hnear{left:0;bottom:-6%;width:200%;height:40%;background:radial-gradient(ellipse 20% 42% at 16% 80%,rgba(255,252,246,.24),rgba(255,252,246,.08) 58%,transparent 76%),radial-gradient(ellipse 15% 30% at 24% 62%,rgba(255,252,246,.14),transparent 72%),radial-gradient(ellipse 24% 40% at 70% 88%,rgba(255,252,246,.22),rgba(255,252,246,.07) 58%,transparent 76%),radial-gradient(ellipse 14% 26% at 80% 70%,rgba(255,252,246,.12),transparent 72%);background-size:50% 100%;background-repeat:repeat-x;animation:igs-amb-clouds 56s linear infinite reverse;}
${A}.is-heaven.is-night .igs-dfx-amb-hveil,${A}.is-heaven.is-night .igs-dfx-amb-hfar,${A}.is-heaven.is-night .igs-dfx-amb-hnear{opacity:.6;}
${A}-innbeam{inset:0;opacity:.85;background:linear-gradient(180deg,#2a190c 5%,#4a2f17 5%,#4a2f17 5.7%,transparent 5.7%),linear-gradient(90deg,#2a190c 3%,#4a2f17 3%,#4a2f17 3.5%,transparent 3.5%),linear-gradient(270deg,#2a190c 3%,#4a2f17 3%,#4a2f17 3.5%,transparent 3.5%);}
${A}-innlamps{left:0;right:0;top:0;height:30%;}
${A}-innlamps b{position:absolute;top:6%;width:clamp(24px,4.6vmin,40px);height:clamp(32px,6vmin,52px);border-radius:42%;background:#b8321f;box-shadow:0 0 22px 8px rgba(255,160,70,.4),inset 0 6px 0 #5a2a14,inset 0 -6px 0 #5a2a14;transform-origin:50% -40px;animation:igs-amb-lamp 4.8s ease-in-out infinite alternate;}
${A}-innlamps b::before{content:"";position:absolute;left:50%;top:-34px;width:1px;height:34px;background:#3a2412;}
${A}-innlamps b:nth-child(1){left:9%;}
${A}-innlamps b:nth-child(2){right:9%;animation-duration:6.1s;animation-delay:-2s;}
${A}.is-inn.is-night .igs-dfx-amb-innlamps b{box-shadow:0 0 30px 12px rgba(255,160,70,.55),inset 0 6px 0 #5a2a14,inset 0 -6px 0 #5a2a14;}
${A}-innsmoke{left:-5%;right:-5%;bottom:-10%;height:46%;background:radial-gradient(ellipse 50% 60% at 30% 100%,rgba(255,232,170,.2),transparent 70%),radial-gradient(ellipse 40% 50% at 78% 100%,rgba(255,232,170,.14),transparent 70%);animation:igs-amb-drift 22s ease-in-out infinite alternate;}

${A}-caveglow{left:20%;right:20%;bottom:-8%;height:46%;background:radial-gradient(ellipse 50% 60% at 50% 100%,rgba(120,230,210,.26),transparent 72%);animation:igs-amb-pulse 7s ease-in-out infinite alternate;}
${A}.is-cave .igs-dfx-amb-cavedrip{top:14%;}
${A}-cavedrip2,${A}-cavedrip3{left:71%;top:14%;width:3px;height:3px;border-radius:50%;background:rgba(200,236,255,.9);box-shadow:0 0 8px 3px rgba(150,210,255,.5);animation:igs-amb-drip 5.7s cubic-bezier(.5,0,.9,.6) -1.9s infinite;}
${A}-cavedrip3{left:48%;animation-duration:7.3s;animation-delay:-3.4s;}

${A}-cafebokeh{left:0;right:0;top:0;height:30%;background:radial-gradient(circle at 14% 30%,rgba(255,214,150,.34) 0 16px,rgba(255,214,150,0) 18px),radial-gradient(circle at 30% 18%,rgba(255,196,120,.3) 0 22px,rgba(255,196,120,0) 24px),radial-gradient(circle at 56% 34%,rgba(255,226,170,.3) 0 13px,rgba(255,226,170,0) 15px),radial-gradient(circle at 74% 16%,rgba(255,204,130,.32) 0 19px,rgba(255,204,130,0) 21px),radial-gradient(circle at 90% 32%,rgba(255,220,160,.28) 0 14px,rgba(255,220,160,0) 16px);}
${A}-cafepane{left:0;top:0;width:46%;height:70%;background:conic-gradient(from 90deg at 8px 8px,rgba(255,236,200,.14) 90deg,transparent 0) 0 0/66px 78px;-webkit-mask-image:linear-gradient(90deg,#000,transparent 96%);mask-image:linear-gradient(90deg,#000,transparent 96%);transform:skewX(-10deg);transform-origin:0 0;}
${A}.is-cafe.is-night .igs-dfx-amb-cafepane{opacity:.45;}
${A}-cafesteam{left:7%;bottom:24%;width:7vmin;height:14vmin;}
${A}-cafesteam::before,${A}-cafesteam::after{content:"";position:absolute;bottom:0;width:50%;height:70%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,250,240,.3),transparent);opacity:0;animation:igs-amb-steamup 6s ease-out infinite;}
${A}-cafesteam::before{left:10%;}
${A}-cafesteam::after{left:40%;animation-delay:-3s;}

${A}-seaplane{left:0;right:0;top:46%;bottom:0;background:linear-gradient(180deg,transparent 0 28%,rgba(255,255,255,.07) 28%,rgba(255,255,255,.07) 29%,transparent 29% 56%,rgba(255,255,255,.06) 56%,rgba(255,255,255,.06) 57%,transparent 57%),linear-gradient(180deg,rgba(54,132,180,.3),rgba(88,168,206,.16) 34%,rgba(255,244,214,.08));}
${A}-seaplane::before,${A}-seaplane::after{content:"";position:absolute;left:0;right:0;}
${A}-seaplane::before{top:0;height:2px;background:rgba(255,246,222,.6);}
${A}-seaplane::after{left:-4%;right:-4%;top:46%;height:3px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55) 20%,rgba(255,255,255,.4) 70%,transparent);animation:igs-amb-foam 9s ease-in-out infinite;}
${A}.is-beach.is-night .igs-dfx-amb-seaplane{background:linear-gradient(180deg,transparent 0 28%,rgba(220,232,255,.08) 28%,rgba(220,232,255,.08) 29%,transparent 29% 56%,rgba(220,232,255,.06) 56%,rgba(220,232,255,.06) 57%,transparent 57%),linear-gradient(180deg,rgba(40,50,120,.34),rgba(60,70,140,.18) 40%,rgba(30,40,100,.1));}
${A}.is-beach.is-night .igs-dfx-amb-seaplane::before{background:rgba(214,226,255,.5);}


${A}-shiphz{left:-5%;right:-5%;top:-5%;bottom:-5%;background:linear-gradient(180deg,transparent 46%,rgba(40,100,150,.16) 46%,rgba(40,100,150,.04));transform-origin:50% 60%;animation:igs-amb-rock 8s ease-in-out infinite alternate;}
${A}-shiphz::before,${A}-shiphz::after{content:"";position:absolute;}
${A}-shiphz::before{left:0;right:0;top:46%;height:2px;background:rgba(230,240,250,.5);}
${A}-shiphz::after{left:40%;width:20%;top:46.5%;bottom:0;background:repeating-linear-gradient(180deg,rgba(255,240,200,.3) 0 3px,transparent 3px 11px);clip-path:polygon(40% 0,60% 0,100% 100%,0 100%);-webkit-mask-image:linear-gradient(180deg,#000,transparent 80%);mask-image:linear-gradient(180deg,#000,transparent 80%);}
${A}.is-ship.is-night .igs-dfx-amb-shiphz{background:linear-gradient(180deg,transparent 46%,rgba(20,40,90,.3) 46%,rgba(20,40,90,.08));}
${A}.is-ship.is-night .igs-dfx-amb-shiphz::after{background:repeating-linear-gradient(180deg,rgba(214,226,255,.3) 0 3px,transparent 3px 11px);}

${A}-cineseats{left:0;right:0;bottom:0;height:20%;background:radial-gradient(ellipse 34px 30px at 50% 100%,#06060b 0,#06060b 97%,transparent 100%) 0 0/76px 100% repeat-x,radial-gradient(ellipse 30px 26px at 50% 100%,#12131c 0,#12131c 97%,transparent 100%) 38px -20px/76px 100% repeat-x,linear-gradient(0deg,#06060b 24%,transparent 24%);}

@keyframes igs-amb-pulse{from{opacity:.45}to{opacity:1}}
@keyframes igs-amb-steamup{0%{transform:translate3d(0,0,0) scale(.7);opacity:0}30%{opacity:.8}100%{transform:translate3d(8%,-90%,0) scale(1.3);opacity:0}}
@keyframes igs-amb-foam{0%{transform:translate3d(0,0,0);opacity:0}30%{opacity:.9}100%{transform:translate3d(0,26px,0);opacity:0}}
@keyframes igs-amb-rock{from{transform:rotate(-.5deg)}to{transform:rotate(.5deg)}}
${LOW} *,${LOW} *::before,${LOW} *::after,${RED} *,${RED} *::before,${RED} *::after{animation:none;}
${RED}.is-cave .igs-dfx-amb-cavedrip2,${RED}.is-cave .igs-dfx-amb-cavedrip3,${LOW}.is-cave .igs-dfx-amb-cavedrip2,${LOW}.is-cave .igs-dfx-amb-cavedrip3{display:none;}
${RED}.is-cafe .igs-dfx-amb-cafesteam::before,${RED}.is-cafe .igs-dfx-amb-cafesteam::after,${LOW}.is-cafe .igs-dfx-amb-cafesteam::before,${LOW}.is-cafe .igs-dfx-amb-cafesteam::after{opacity:.5;}
${RED}.is-beach .igs-dfx-amb-seaplane::after,${LOW}.is-beach .igs-dfx-amb-seaplane::after{opacity:.5;}
`;
