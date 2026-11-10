// 战斗大节点演出的分套设计（手写，不经生成脚本）：按皮肤键 [data-skin] 改原版骨架的细节——接缝线形（几何在 combat-stage-fx.js 的 SEAM_KEYS）、光的种类、闪白、VS 与名字的版式、入场动势；
// 特色节点是 buildStageClash 里的 .sfx-deco > i.d0…d11。漫画是样板，不改。
// 时刻沿用基础样式：撞击 var(--hit)、慢放倍数 var(--k)。全部实色；光用 screen 叠加。
const P = (k) => `#igs-overlay .igs-sfx[data-skin="${k}"]`;
const T = (ms) => `calc(${ms} * var(--k))`;
const HIT = 'calc(var(--hit) * var(--k))';
const AFTER = (ms) => `calc((var(--hit) + ${ms}ms) * var(--k))`;

const BASE = `
#igs-overlay .igs-sfx .sfx-deco{position:absolute;inset:0;pointer-events:none;}
#igs-overlay .igs-sfx .sfx-deco>i{display:none;position:absolute;}
#igs-overlay .igs-sfx .clash.out .sfx-deco{animation:sfxp-gone ${T('200ms')} both;}
@keyframes sfxp-gone{to{opacity:0;}}
@keyframes sfxp-in{from{opacity:0;}to{opacity:1;}}
@keyframes sfxp-frame{0%,100%{opacity:.85;}}
@keyframes sfxp-half-flash{0%{opacity:0;}15%{opacity:.5;}100%{opacity:0;}}
`;

// 去掉漫画骨架里的放射光芒、光环、光刃火花与整屏白闪（keep 里列出的保留，各套再按需改成自己的光）。
const NO_COMIC = (k, keep = []) => `${P(k)} .clash :is(${['.light .rays', '.light .ring', '.flare', '.spark', '.flash'].filter((s) => !keep.includes(s)).join(',')}){display:none;}`;
// 一帧闪：不带填充，只在播放的那一帧可见。
const FRAME_FLASH = (k, color) => `${P(k)} .clash .flash{background:${color};animation:sfxp-frame ${T('70ms')} steps(1) ${HIT};}`;
// 沿接缝的斜劈笔触：起点为接缝顶端（百分比），长度与角度按画布换算（竖屏 66%→34%、横屏 57%→43%）。
const SLASH = { port: { x: 66, len: 853, deg: 98.4 }, land: { x: 57, len: 742, deg: 104 } };

// 水墨：不要闪电折线与金色放射光。接缝是一笔斜劈的月白飞白，在撞击前从上往下写完；撞点只留月白光芯与墨晕洇开，
// 「战」压在一道焦墨横笔上，最后盖一枚朱砂小印。
const INK_BLADE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' preserveAspectRatio='none'%3E%3Cpath d='M0 5C28 3.4 44 3.1 56 3.3C76 3.7 90 4.5 100 5C90 5.5 76 6.3 56 6.7C44 6.9 28 6.6 0 5Z'/%3E%3C/svg%3E\")";
const INK = `
${NO_COMIC('ink')}
${P('ink')} .clash .seam{display:none;}
${P('ink')} .sfx-deco>:is(.d0,.d3,.d4){display:block;}
${P('ink')} .sfx-deco .d1,${P('ink')} .clash .vs .blade{display:none;}
/* 一刀：极细、两端收成尖头、中段最粗约 3–5px（竖屏 2–4px），实色月白，不发光 */
${P('ink')} .sfx-deco .d4{z-index:3;left:${SLASH.port.x}%;top:0;width:${SLASH.port.len}px;height:11px;margin-top:-5.5px;transform-origin:0 50%;transform:rotate(${SLASH.port.deg}deg);background:var(--text);
  -webkit-mask:${INK_BLADE} center/100% 100% no-repeat;mask:${INK_BLADE} center/100% 100% no-repeat;
  clip-path:inset(0 100% 0 0);animation:sfxp-ink-write ${T('300ms')} cubic-bezier(.5,0,.3,1) ${T('200ms')} both;}
${P('ink')}.land .sfx-deco .d4{left:${SLASH.land.x}%;width:${SLASH.land.len}px;height:14px;margin-top:-7px;transform:rotate(${SLASH.land.deg}deg);}
/* 「战」后的淡墨晕：中心实色墨，向外渐隐，无硬边 */
${P('ink')} .sfx-deco .d0{z-index:1;left:var(--ix);top:var(--iy);width:300px;height:300px;margin:-150px 0 0 -150px;background:radial-gradient(closest-side,#0c0c0b 0,transparent 100%);
  transform:scale(.1);opacity:0;animation:sfxp-ink-halo ${T('900ms')} cubic-bezier(.15,.8,.3,1) ${HIT} both;}
${P('ink')}.land .sfx-deco .d0{width:420px;height:420px;margin:-210px 0 0 -210px;}
@keyframes sfxp-ink-halo{0%{opacity:0;transform:scale(.1);}100%{opacity:.6;transform:scale(1);}}
@keyframes sfxp-ink-write{to{clip-path:inset(0 0 0 0);}}
${P('ink')} .sfx-deco .d3{z-index:6;left:var(--ix);top:var(--iy);width:44px;height:44px;margin:42px 0 0 62px;background:#b0342b;border-radius:2px;
  box-shadow:inset 0 0 0 2px #b0342b,inset 0 0 0 3px #e9d9c6;color:#f3e9dc;font:400 18px/19px var(--font-brush);writing-mode:vertical-rl;
  display:grid;place-items:center;letter-spacing:0;animation:sfxp-ink-seal ${T('240ms')} cubic-bezier(.3,1.4,.5,1) ${T('980ms')} both;}
${P('ink')} .sfx-deco .d3::before{content:"交锋";}
${P('ink')}.land .sfx-deco .d3{width:50px;height:50px;margin:66px 0 0 104px;font-size:21px;line-height:22px;}
@keyframes sfxp-ink-seal{0%{opacity:0;transform:scale(2.2) rotate(-12deg);}60%{opacity:1;transform:scale(.92) rotate(-4deg);}100%{opacity:1;transform:rotate(-4deg);}}
`;

// 科技：接缝是直角台阶加一段 45° 斜冲的粗电路线（青边白芯、硬折角）；双方不滑入，而是随扫描线逐行显影；撞击只闪一帧冷白，
// 撞点青色光芯 + 两道菱形框扩散，火花换成数据碎片；四角取景角标与读数。
const TECH = `
${NO_COMIC('tech', ['.spark', '.flash'])}
${FRAME_FLASH('tech', '#d9f6ff')}
${P('tech')}{--seam-gold:#7fd6ff;--seam-cool:#1d5470;}
${P('tech')} .clash .seam .ink{stroke-width:12;}
${P('tech')} .clash .seam .gold{stroke-width:5;animation:none;}
${P('tech')} .clash .seam .hot{stroke-width:2;animation:none;filter:drop-shadow(0 0 8px #4fc3f7);}
${P('tech')} .clash .half{-webkit-mask:linear-gradient(#000,#000) top/100% 0 no-repeat;mask:linear-gradient(#000,#000) top/100% 0 no-repeat;animation:sfxp-tech-rev ${T('440ms')} steps(16) 0s both;}
${P('tech')} .clash .foe-side{animation-delay:${T('40ms')};}
${P('tech')} .clash.out .half{animation:sfxp-gone ${T('200ms')} both;}
@keyframes sfxp-tech-rev{to{-webkit-mask-size:100% 100%;mask-size:100% 100%;}}
${P('tech')} .sfx-deco>i{display:block;}
${P('tech')} .sfx-deco>:is(.d9,.d10,.d11){display:none;}
${P('tech')} .sfx-deco .d0{z-index:5;left:0;right:0;height:2px;top:-2%;background:#d9f6ff;box-shadow:0 0 10px #4fc3f7;animation:sfxp-tech-scan ${T('480ms')} linear 0s both;}
${P('tech')} .sfx-deco .d1{z-index:4;left:0;right:0;height:90px;top:-2%;margin-top:-90px;mix-blend-mode:screen;background:linear-gradient(to top,#1a5f80,#000);animation:sfxp-tech-scan ${T('480ms')} linear 0s both;}
@keyframes sfxp-tech-scan{0%{top:-2%;opacity:1;}92%{opacity:1;}100%{top:104%;opacity:0;}}
${P('tech')} .sfx-deco :is(.d2,.d3,.d4,.d5){z-index:6;width:24px;height:24px;border:0 solid #7fd6ff;animation:sfxp-tech-blink ${T('240ms')} steps(1) ${T('80ms')} both;}
${P('tech')} .sfx-deco .d2{left:14px;top:14px;border-width:2px 0 0 2px;}
${P('tech')} .sfx-deco .d3{right:14px;top:14px;border-width:2px 2px 0 0;}
${P('tech')} .sfx-deco .d4{left:14px;bottom:14px;border-width:0 0 2px 2px;}
${P('tech')} .sfx-deco .d5{right:14px;bottom:14px;border-width:0 2px 2px 0;}
@keyframes sfxp-tech-blink{0%{opacity:0;}25%{opacity:1;}50%{opacity:0;}75%{opacity:1;}}
${P('tech')} .sfx-deco .d6{z-index:6;left:22px;top:44px;color:#7fd6ff;font:700 11px/1 var(--num);letter-spacing:.24em;animation:sfxp-tech-blink ${T('240ms')} steps(1) ${HIT} both;}
${P('tech')} .sfx-deco .d6::before{content:"ENGAGE // 01";}
${P('tech')} .sfx-deco .d6::after{content:"";display:inline-block;width:6px;height:10px;margin-left:6px;vertical-align:-1px;background:#7fd6ff;animation:sfxp-tech-cursor ${T('500ms')} steps(1) infinite;}
@keyframes sfxp-tech-cursor{50%{opacity:0;}}
${P('tech')} .sfx-deco :is(.d7,.d8){z-index:4;left:var(--ix);top:var(--iy);width:44px;height:44px;margin:-22px 0 0 -22px;border:2px solid #d9f6ff;box-shadow:0 0 8px #4fc3f7;
  opacity:0;animation:sfxp-tech-dia ${T('620ms')} cubic-bezier(.1,.7,.3,1) ${HIT} both;}
${P('tech')} .sfx-deco .d8{border-width:1px;border-color:#4fc3f7;animation-duration:${T('820ms')};animation-delay:${AFTER(90)};}
@keyframes sfxp-tech-dia{0%{opacity:1;transform:rotate(45deg) scale(.4);}100%{opacity:0;transform:rotate(45deg) scale(9);}}
${P('tech')} .clash .spark{height:3px;width:calc(var(--s) * .45);background:#bfefff;filter:none;box-shadow:0 0 6px #4fc3f7;animation-timing-function:steps(6);}
${P('tech')} .clash .spark:nth-of-type(3n){height:7px;width:9px;background:#7fd6ff;}
`;

// 恐怖 A「断帧」：不用漫画的闪电接缝与放射光。黑场里先亮 REC，双方画面以掉帧的方式一闪一闪切进来（绿灰监控色、立绘带红色重影，呼应战斗中的红边），
// 接缝是一刀直斜切（骨白细线 + 错位的暗红线）；撞击时整幅画面撕裂错位、黑色信号条闪过；VS 与名字用宋体骨白、红色重影，掉两帧后落定；收场直接黑场切走。
const DARK_A = `
${P('dark-a')} .clash :is(.light,.flare,.spark,.flash){display:none;}
${P('dark-a')} .clash .hero-side{background:linear-gradient(160deg,#17211c,#060807 70%);animation:sfxp-da-feed ${T('380ms')} steps(1) ${T('90ms')} both;}
${P('dark-a')} .clash .foe-side{background:linear-gradient(200deg,#121a16,#050706 70%);animation:sfxp-da-feed ${T('320ms')} steps(1) 0s both;}
@keyframes sfxp-da-feed{0%{opacity:0;}18%{opacity:1;transform:translateX(-10px);}30%{opacity:0;}52%{opacity:1;transform:translateX(4px);}64%{opacity:0;}76%{opacity:1;transform:none;}100%{opacity:1;transform:none;}}
${P('dark-a')} .clash .fig:is(.lead,.foe1){filter:grayscale(.4) contrast(1.08) brightness(.88) drop-shadow(-3px 0 0 #8c1c1c);}
${P('dark-a')} .clash .fig:is(.mate,.foe2){filter:grayscale(.6) brightness(.5) drop-shadow(-2px 0 0 #5a1212);}
${P('dark-a')} .clash .seam{clip-path:none;opacity:0;animation:sfxp-da-seam ${T('200ms')} steps(1) ${HIT} both;}
@keyframes sfxp-da-seam{0%{opacity:1;}30%{opacity:0;}55%{opacity:1;}100%{opacity:1;}}
${P('dark-a')} .clash .seam .ink{stroke:#050605;stroke-width:12;}
${P('dark-a')} .clash .seam .gold{animation:none;stroke:#e8e4dc;stroke-width:1.5;}
${P('dark-a')} .clash .seam .hot{animation:none;stroke:#a32222;stroke-width:1.5;filter:none;transform:translate(-5px,0);}
${P('dark-a')} .clash.hit .shake{animation:sfxp-da-tear ${T('420ms')} steps(1) 1;}
@keyframes sfxp-da-tear{0%{transform:translate(-16px,0) skewX(6deg);filter:contrast(1.7) brightness(1.3);}14%{transform:translate(11px,2px);filter:none;}28%{transform:translate(-5px,0) skewX(-3deg);}
  42%{transform:none;}60%{transform:translate(6px,-1px);}74%{transform:none;}}
${P('dark-a')} .clash .vs .blade{display:none;}
${P('dark-a')} .clash .vs{animation:sfxp-da-stutter ${T('320ms')} steps(1) ${T('720ms')} both;}
${P('dark-a')} .clash .vs b{font:400 2.3em/1 var(--serif);letter-spacing:.02em;color:#f1ece4;transform:translate(-50%,-50%);text-shadow:-5px 0 0 #8c1c1c,0 3px 0 #000;}
${P('dark-a')} .clash .name{animation:sfxp-da-stutter ${T('320ms')} steps(1) ${T('640ms')} both;text-shadow:-3px 0 0 #8c1c1c,0 2px 0 #000,0 0 18px #000;}
${P('dark-a')} .clash .name i{background:#8c1c1c;}
${P('dark-a')} .clash .name.h i{background:#7d8a8c;}
@keyframes sfxp-da-stutter{0%{opacity:0;}16%{opacity:1;transform:translateX(-10px);}30%{opacity:0;}46%{opacity:1;transform:translateX(5px) skewX(-8deg);}62%{opacity:1;transform:none;}100%{opacity:1;transform:none;}}
${P('dark-a')} .clash.out :is(.half,.name,.vs,.seam,.sfx-deco){animation:sfxp-da-cut ${T('160ms')} steps(1) both;}
@keyframes sfxp-da-cut{0%{opacity:1;}50%{opacity:0;}100%{opacity:0;}}
${P('dark-a')} .sfx-deco>i{display:block;}
${P('dark-a')} .sfx-deco .d0{z-index:6;left:22px;top:20px;color:#c9c4bc;font:400 12px/1 var(--serif);letter-spacing:.14em;}
${P('dark-a')} .sfx-deco .d0::before{content:"";display:inline-block;width:8px;height:8px;margin-right:8px;background:#c42a2a;vertical-align:0;animation:sfxp-da-dot ${T('1000ms')} steps(1) infinite;}
${P('dark-a')} .sfx-deco .d1{z-index:6;right:22px;bottom:20px;color:#8f8b88;font:400 11px/1 var(--serif);letter-spacing:.2em;}
${P('dark-a')} .sfx-deco .d1::before{content:"CAM 02";}
${P('dark-a')} .sfx-deco :is(.d2,.d3,.d4,.d5){z-index:6;width:18px;height:18px;border:0 solid #8f8b88;}
${P('dark-a')} .sfx-deco .d2{left:10px;top:10px;border-width:1px 0 0 1px;}
${P('dark-a')} .sfx-deco .d3{right:10px;top:10px;border-width:1px 1px 0 0;}
${P('dark-a')} .sfx-deco .d4{left:10px;bottom:10px;border-width:0 0 1px 1px;}
${P('dark-a')} .sfx-deco .d5{right:10px;bottom:10px;border-width:0 1px 1px 0;}
${P('dark-a')} .sfx-deco :is(.d6,.d7,.d8){z-index:8;left:0;right:0;background:#050605;opacity:0;animation:sfxp-da-bar ${T('80ms')} steps(1) ${HIT};}
${P('dark-a')} .sfx-deco .d6{top:21%;height:22px;}
${P('dark-a')} .sfx-deco .d7{top:48%;height:6px;animation-delay:${AFTER(90)};}
${P('dark-a')} .sfx-deco .d8{top:70%;height:38px;animation-delay:${AFTER(200)};}
@keyframes sfxp-da-bar{0%{opacity:1;}100%{opacity:1;}}
${P('dark-a')} .sfx-deco .d9{z-index:8;left:0;right:0;top:62%;height:2px;background:#d9d4cc;opacity:0;animation:sfxp-da-bar ${T('60ms')} steps(1) ${AFTER(140)};}
${P('dark-a')} .sfx-deco .d10{z-index:9;inset:0;background:#050605;opacity:0;animation:sfxp-da-bar ${T('70ms')} steps(1) ${T('1320ms')};}
${P('dark-a')} .sfx-deco .d11{z-index:5;inset:0;background:repeating-linear-gradient(to bottom,#0b0f0d 0 1px,transparent 1px 3px);}
`;

// 恐怖 B「无影灯」：不用对撞与放射光，也不画灯具。全黑里画面顶上出框的无影灯咔哒两下亮起，只见顶边过曝光晕，三道错开的冷光束叠成光锥罩下来，光外压成黑；一道竖直切口从上往下划开双方（骨白细线 + 渗出的暗红线），
// 划到中点时灯光过曝一下、一道心电线从左扫到右在撞点跳一下；VS 与名字是安静的宋体，淡入落定。
const ECG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 40' preserveAspectRatio='none'%3E%3Cpath d='M0 20H182L189 12 194 20 197 20 201 2 206 37 211 20 220 20 225 15 230 20H400' fill='none' stroke='%23fff' stroke-width='1.6' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E")`;
const DARK_B = `
${P('dark-b')} .clash :is(.light,.flare,.spark,.flash){display:none;}
${P('dark-b')} .clash.hit .shake{animation:none;}
${P('dark-b')} .clash .half{animation:none;}
${P('dark-b')} .clash.out .half{animation:sfxp-gone ${T('200ms')} both;}
${P('dark-b')} .clash .hero-side{background:linear-gradient(180deg,#0e1516,#050707 75%);}
${P('dark-b')} .clash .foe-side{background:linear-gradient(180deg,#0c1213,#040606 75%);}
${P('dark-b')} .clash .fig:is(.lead,.foe1){filter:saturate(.7) contrast(1.05);}
${P('dark-b')} .clash.hit .half .fig:is(.lead,.foe1){animation:sfxp-db-expose ${T('380ms')} ease-out 1;}
@keyframes sfxp-db-expose{0%{filter:saturate(.2) brightness(1.9) contrast(.9);}100%{filter:saturate(.7) contrast(1.05);}}
${P('dark-b')} .clash .seam{clip-path:inset(0 0 100% 0);animation:sfxp-db-cut ${T('560ms')} cubic-bezier(.55,0,.35,1) ${T('200ms')} forwards;}
@keyframes sfxp-db-cut{to{clip-path:inset(0 0 0 0);}}
${P('dark-b')} .clash .seam .ink{stroke:#030404;stroke-width:7;}
${P('dark-b')} .clash .seam .gold{animation:none;stroke:#e8f0f0;stroke-width:1.2;}
${P('dark-b')} .clash .seam .hot{animation:none;stroke:#9e1f1f;stroke-width:2;filter:none;transform:translate(3px,0);}
${P('dark-b')} .clash .vs .blade{display:none;}
${P('dark-b')} .clash .vs{animation:sfxp-db-settle ${T('520ms')} cubic-bezier(.2,.7,.2,1) ${T('760ms')} both;}
${P('dark-b')} .clash .vs b{font:400 1.7em/1 var(--serif);letter-spacing:.32em;text-indent:.32em;color:#eef3f3;transform:translate(-50%,-50%);text-shadow:0 2px 0 #000,0 0 18px #000;}
${P('dark-b')} .clash .name{animation:sfxp-db-settle ${T('520ms')} cubic-bezier(.2,.7,.2,1) ${T('820ms')} both;text-shadow:0 2px 0 #000,0 0 22px #000;}
${P('dark-b')} .clash .name i{height:1px;background:#9e1f1f;}
${P('dark-b')} .clash .name.h i{background:#7d8a8c;}
@keyframes sfxp-db-settle{0%{opacity:0;transform:scale(1.06);}100%{opacity:1;transform:none;}}
${P('dark-b')} .sfx-deco>:is(.d0,.d1,.d2,.d3,.d4,.d5,.d6,.d7){display:block;}
${P('dark-b')} .sfx-deco .d3{z-index:3;inset:0;background:#030404;animation:sfxp-db-dark ${T('420ms')} steps(1) 0s both;}
@keyframes sfxp-db-dark{0%{opacity:1;}40%{opacity:0;}52%{opacity:1;}70%{opacity:0;}100%{opacity:0;}}
${P('dark-b')} .sfx-deco .d2{z-index:3;inset:0;background:#030404;
  -webkit-mask:radial-gradient(ellipse 70% 58% at 50% 42%,transparent 38%,#000 100%);mask:radial-gradient(ellipse 70% 58% at 50% 42%,transparent 38%,#000 100%);}
${P('dark-b')} .sfx-deco .d1{z-index:2;left:50%;top:60px;width:470px;height:800px;margin-left:-235px;mix-blend-mode:screen;
  background:linear-gradient(to bottom,#5f7476,#1d2627 55%,#000);clip-path:polygon(38% 0,62% 0,100% 100%,0 100%);
  -webkit-mask:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);mask:linear-gradient(90deg,transparent,#000 22%,#000 78%,transparent);
  animation:sfxp-db-dark ${T('420ms')} steps(1) 0s reverse both;}
${P('dark-b')}.land .sfx-deco .d1{top:90px;width:900px;height:640px;margin-left:-450px;}
${P('dark-b')} .sfx-deco :is(.d6,.d7){z-index:2;left:50%;top:-20px;width:420px;height:880px;margin-left:-210px;mix-blend-mode:screen;transform-origin:50% 0;
  background:linear-gradient(to bottom,#31403f,#121a1a 50%,#000);clip-path:polygon(44% 0,56% 0,92% 100%,8% 100%);
  -webkit-mask:linear-gradient(90deg,transparent,#000 30%,#000 70%,transparent);mask:linear-gradient(90deg,transparent,#000 30%,#000 70%,transparent);
  animation:sfxp-db-dark ${T('420ms')} steps(1) 0s reverse both;}
${P('dark-b')} .sfx-deco .d6{transform:rotate(7deg);}
${P('dark-b')} .sfx-deco .d7{transform:rotate(-7deg);}
${P('dark-b')}.land .sfx-deco :is(.d6,.d7){width:820px;height:760px;margin-left:-410px;}
${P('dark-b')} .sfx-deco .d0{z-index:4;left:50%;top:-150px;width:360px;height:260px;margin-left:-180px;mix-blend-mode:screen;
  background:radial-gradient(closest-side,#f4f9f9,#a9bfc1 30%,#2a3536 62%,#000);animation:sfxp-db-dark ${T('420ms')} steps(1) 0s reverse both;}
${P('dark-b')}.land .sfx-deco .d0{top:-170px;width:560px;height:300px;margin-left:-280px;}
${P('dark-b')} .sfx-deco .d4{z-index:6;left:0;right:0;top:0;height:70%;mix-blend-mode:screen;background:radial-gradient(ellipse 60% 70% at 50% 0,#dfeaeb,#000 80%);opacity:0;
  animation:sfxp-db-flare ${T('460ms')} ease-out ${HIT} both;}
@keyframes sfxp-db-flare{0%{opacity:0;}12%{opacity:1;}100%{opacity:0;}}
${P('dark-b')} .sfx-deco .d5{z-index:5;left:0;right:0;top:var(--iy);height:46px;margin-top:58px;background:#c42a2a;
  -webkit-mask:${ECG} center/100% 100% no-repeat;mask:${ECG} center/100% 100% no-repeat;filter:drop-shadow(0 0 4px #7a1414);
  clip-path:inset(0 100% 0 0);animation:sfxp-db-ecg ${T('520ms')} linear ${T('220ms')} both;}
@keyframes sfxp-db-ecg{to{clip-path:inset(0 0 0 0);}}
`;

// 星辉：接缝是星座连线式的直线折段（折点有菱形星点）；撞点不放射尖刺，只留柔和光芯与两圈细光环，撞点展开一面星盘（外圈细刻度、主刻度、细圈，内外反向慢转）；
// 火花换成细小的星尘光点；白闪压到一半亮度。不碰地面。
const MYSTIC = `
${NO_COMIC('mystic', ['.light .ring', '.spark', '.flash'])}
${P('mystic')} .clash .flash{animation-name:sfxp-half-flash;}
${P('mystic')}{--seam-cool:#b9a46a;}
${P('mystic')} .clash .spark{width:3px;height:3px;margin-top:-1.5px;border-radius:50%;background:#f4efe0;box-shadow:0 0 6px #d9c88e;filter:none;}
${P('mystic')} .sfx-deco>:is(.d0,.d1,.d2){display:block;}
${P('mystic')} .sfx-deco :is(.d0,.d1,.d2){z-index:1;left:var(--ix);top:var(--iy);width:340px;height:340px;margin:-170px 0 0 -170px;border-radius:50%;}
${P('mystic')}.land .sfx-deco :is(.d0,.d1,.d2){width:480px;height:480px;margin:-240px 0 0 -240px;}
${P('mystic')} .sfx-deco .d0{background:repeating-conic-gradient(#b9a46a 0 .5deg,transparent .5deg 5deg);
  -webkit-mask:radial-gradient(closest-side,transparent 91%,#000 91.5% 97%,transparent 97.5%);mask:radial-gradient(closest-side,transparent 91%,#000 91.5% 97%,transparent 97.5%);
  animation:sfxp-my-open ${T('420ms')} cubic-bezier(.2,.9,.3,1) ${HIT} both,sfxp-my-spin ${T('6000ms')} linear ${HIT} both;}
${P('mystic')} .sfx-deco .d1{background:repeating-conic-gradient(#e6d6a2 0 1.2deg,transparent 1.2deg 30deg);
  -webkit-mask:radial-gradient(closest-side,transparent 84%,#000 84.5% 97%,transparent 97.5%);mask:radial-gradient(closest-side,transparent 84%,#000 84.5% 97%,transparent 97.5%);
  animation:sfxp-my-open ${T('420ms')} cubic-bezier(.2,.9,.3,1) ${HIT} both,sfxp-my-spin-r ${T('6000ms')} linear ${HIT} both;}
${P('mystic')} .sfx-deco .d2{width:250px;height:250px;margin:-125px 0 0 -125px;box-shadow:0 0 0 1px #b9a46a;
  animation:sfxp-my-open ${T('420ms')} cubic-bezier(.2,.9,.3,1) ${AFTER(60)} both;}
${P('mystic')}.land .sfx-deco .d2{width:350px;height:350px;margin:-175px 0 0 -175px;}
@keyframes sfxp-my-open{0%{opacity:0;scale:.6;}100%{opacity:1;scale:1;}}
@keyframes sfxp-my-spin{from{rotate:-24deg;}to{rotate:30deg;}}
@keyframes sfxp-my-spin-r{from{rotate:20deg;}to{rotate:-26deg;}}
// 星座节点：接缝内侧四个折点上的菱形星点，撞击后依次亮起。
${P('mystic')} .clash .seam .gold{stroke-width:2.5;}
${P('mystic')} .sfx-deco>:is(.d3,.d4,.d5,.d6){display:block;z-index:4;width:8px;height:8px;margin:-4px 0 0 -4px;background:#f4efe0;box-shadow:0 0 8px #d9c88e;transform:rotate(45deg);opacity:0;animation:sfxp-in ${T('160ms')} steps(2) ${AFTER(80)} both;}
${P('mystic')} .sfx-deco .d3{left:63%;top:22%;}
${P('mystic')} .sfx-deco .d4{left:69%;top:36%;animation-delay:${AFTER(140)};}
${P('mystic')} .sfx-deco .d5{left:41%;top:62%;animation-delay:${AFTER(200)};}
${P('mystic')} .sfx-deco .d6{left:47%;top:74%;animation-delay:${AFTER(260)};}
${P('mystic')}.land .sfx-deco .d3{left:53%;top:22%;}
${P('mystic')}.land .sfx-deco .d4{left:57%;top:38%;}
${P('mystic')}.land .sfx-deco .d5{left:44%;top:62%;}
${P('mystic')}.land .sfx-deco .d6{left:47%;top:76%;}
`;

// 圆润：接缝是一道圆滑的波浪线；撞点不放射尖刺，只留柔光与两圈圆环，白闪减半；VS 不用胶囊，换成一枚实色圆章，
// 圆体白字比圆章大、冲出边界；VS 与名字弹跳落定；撞点散出几片花瓣飘落。a 野餐用樱粉，c 绘本用天蓝。
const PETALS = [[-150, -120, 260], [140, -150, -220], [-90, -190, 180], [170, -40, -300], [-180, -10, 240], [60, -210, -160], [-40, 120, 200], [120, 90, -260]];
const SOFT = { 'soft-a': { disk: '#f1a0ad', ring: '#f8cdd5', seam: '#e7a3b0', petals: ['#f1a0ad', '#f6c6cf', '#f3d68f'] }, 'soft-c': { disk: '#92b5e0', ring: '#c9daf1', seam: '#a9c3e8', petals: ['#f1a0ad', '#92b5e0', '#82c8a9', '#f3d68f'] } };
const soft = (k) => `
${NO_COMIC(k, ['.light .ring', '.flash'])}
${P(k)} .clash .flash{animation-name:sfxp-half-flash;}
${P(k)}{--seam-cool:${SOFT[k].seam};}
${P(k)} .clash .vs::before{inset:auto;left:50%;top:50%;width:1.9em;height:1.9em;margin:-.95em 0 0 -.95em;border-radius:50%;background:${SOFT[k].disk};box-shadow:0 0 0 5px ${SOFT[k].ring};}
${P(k)} .clash .vs::after,${P(k)} .clash .vs .blade{display:none;}
${P(k)} .clash .vs b{font:700 1.45em/1 var(--font-big);letter-spacing:.02em;color:#fffaf2;-webkit-text-stroke:0;transform:translate(-50%,-50%);text-shadow:0 2px 6px #6e3a44;}
${P(k)} .clash .vs{animation-name:sfxp-soft-vs;animation-duration:${T('620ms')};animation-timing-function:ease-out;}
@keyframes sfxp-soft-vs{0%{opacity:0;transform:translateY(40px) scale(.3);}45%{opacity:1;transform:scale(1.16);}66%{transform:scale(.94);}84%{transform:scale(1.03);}100%{opacity:1;transform:none;}}
${P(k)} .clash .name{animation-name:sfxp-soft-name;animation-duration:${T('520ms')};animation-timing-function:ease-out;}
@keyframes sfxp-soft-name{0%{opacity:0;transform:translateY(26px) scale(.9);}60%{opacity:1;transform:translateY(-6px) scale(1.03);}100%{opacity:1;transform:none;}}
${P(k)} .sfx-deco>:is(${PETALS.map((_, i) => `.d${i}`).join(',')}){display:block;z-index:5;left:var(--ix);top:var(--iy);width:20px;height:14px;margin:-7px 0 0 -10px;border-radius:80% 0 80% 0;opacity:0;
  animation:sfxp-soft-petal ${T('1500ms')} cubic-bezier(.2,.7,.4,1) ${AFTER(40)} both;}
${PETALS.map(([x, y, r], i) => `${P(k)} .sfx-deco .d${i}{--px:${x}px;--py:${y}px;--pr:${r}deg;background:${SOFT[k].petals[i % SOFT[k].petals.length]};${i % 3 === 1 ? 'width:14px;height:10px;' : ''}animation-delay:${AFTER(40 + (i % 4) * 30)};}`).join('\n')}
${P(k)}.land .sfx-deco>i{width:26px;height:18px;margin:-9px 0 0 -13px;}
@keyframes sfxp-soft-petal{0%{opacity:0;transform:translate(0,0) scale(.3) rotate(0);}10%{opacity:1;}38%{transform:translate(var(--px),var(--py)) scale(1) rotate(calc(var(--pr) * .4));}
  85%{opacity:1;}100%{opacity:0;transform:translate(calc(var(--px) * 1.25),calc(var(--py) + 240px)) scale(.9) rotate(var(--pr));}}
`;

// 黑幕：接缝是一刀笔直的发丝亮线，没有放射光与光芯；撞击只闪一帧白，上下两道渐变黑幕合拢，内沿各一条细灰线，画面收成横幅。
const VEIL = `
${NO_COMIC('veil', ['.flash'])}
${P('veil')} .clash .light{display:none;}
${FRAME_FLASH('veil', '#f4f2ec')}
${P('veil')} .clash .seam .ink{stroke:#050506;stroke-width:4;}
${P('veil')} .clash .seam .gold{animation:none;stroke:#f4f2ec;stroke-width:1.2;}
${P('veil')} .clash .seam .hot{display:none;}
${P('veil')} .sfx-deco>:is(.d0,.d1){display:block;}
${P('veil')} .sfx-deco :is(.d0,.d1){z-index:5;left:0;right:0;height:17%;}
${P('veil')} .sfx-deco .d0{top:0;background:linear-gradient(to bottom,#050506,#141416);box-shadow:0 1px 0 #8e8d88;animation:sfxp-veil-top ${T('300ms')} cubic-bezier(.2,.9,.2,1) ${HIT} both;}
${P('veil')} .sfx-deco .d1{bottom:0;background:linear-gradient(to top,#050506,#141416);box-shadow:0 -1px 0 #8e8d88;animation:sfxp-veil-bot ${T('300ms')} cubic-bezier(.2,.9,.2,1) ${HIT} both;}
@keyframes sfxp-veil-top{from{transform:translateY(-101%);}to{transform:none;}}
@keyframes sfxp-veil-bot{from{transform:translateY(101%);}to{transform:none;}}
`;

const NL = '\n';
// 结算背景（九套通用）：不再铺近黑遮罩，用 backdrop-filter 套各皮肤战斗画布 .stage 背景所用的同一组滤镜，底下是当前场景图本身。
// 浏览器不支持 backdrop-filter 时退回 #1c1c1e 实色。
const RESULT_BG_FILTER = { comic: 'brightness(.7) saturate(.9)', veil: 'brightness(.62) saturate(.85)', ink: 'saturate(.72) brightness(.6) contrast(1.05)', tech: 'brightness(.74) saturate(.88)', mystic: 'saturate(.8) brightness(.5)', 'soft-a': 'brightness(.78) saturate(.7)', 'soft-c': 'brightness(.78) saturate(.7)', 'dark-a': 'grayscale(.9) brightness(.4) contrast(1.25)', 'dark-b': 'grayscale(1) brightness(.3) contrast(1.15)' };
const RESULT_BG = `
${Object.entries(RESULT_BG_FILTER).map(([k, f]) => `${P(k)} .result .veil{background:transparent;-webkit-backdrop-filter:${f};backdrop-filter:${f};}`).join(NL)}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){#igs-overlay .igs-sfx .result .veil{background:#1c1c1e;}}
`;

// 圆润结算去金：a 野餐粉系（粉 / 深粉 / 奶白 / 薄荷），c 绘本雾蓝系（雾蓝 / 深蓝 / 杏奶白 / 淡紫）。实色，不用金与暗棕。
const SOFT_RS = {
    'soft-a': { main: '#f2a1ac', deep: '#d9566b', card: '#f6efe4', acc: '#a8d8bf', edge: '#8a3a4e', lose: '#cf9aa2', loseDeep: '#b0707c', shade: '#e4c9cd', heroA: '#f8cfd6', heroB: '#ea8d9d', foeA: '#d3ece0', foeB: '#a8d8bf' },
    'soft-c': { main: '#8fb0d8', deep: '#4f74a8', card: '#f7efe6', acc: '#b9a9dc', edge: '#37507c', lose: '#9fa9c8', loseDeep: '#6b7aa6', shade: '#c9d6e8', heroA: '#c4d6ee', heroB: '#8fb0d8', foeA: '#dcd3ef', foeB: '#b9a9dc' },
};
const softRs = (k) => {
    const c = SOFT_RS[k];
    return `
${P(k)}{--gold:${c.main};--seam-gold:${c.main};--jade:${c.acc};--edge:${c.edge};}
${P(k)} .clash .hero-side{background:linear-gradient(160deg,${c.heroA},${c.heroB} 75%);}
${P(k)} .clash .foe-side{background:linear-gradient(200deg,${c.foeA},${c.foeB} 75%);}
${P(k)} .clash .name,${P(k)} .cut .move{text-shadow:0 2px 0 ${c.edge};}
`;
};

export const COMBAT_STAGE_FX_POLISH_CSS = [BASE, INK, TECH, DARK_A, DARK_B, MYSTIC, soft('soft-a'), soft('soft-c'), VEIL, RESULT_BG, softRs('soft-a'), softRs('soft-c')].join('\n');
