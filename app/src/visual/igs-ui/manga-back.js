import { normalizeEmotionList } from './stage-shake-runtime.js';
import { peekSpriteHead, spriteDrawRect } from './fx-anchor.js';

// 漫画背景与特效：按角色情绪在背景与立绘之间铺一张漫画背景（花、亮片、爆光、漩涡、网点、阴沉竖线、速度线），
// 另有整屏黑白反转定格、说话人身后的气场、立绘石化 / 风化。全部只读表情栏，不占提示词。

export const MANGA_BACK_KINDS = Object.freeze(['flowers', 'sparkle', 'burst', 'swirl', 'tone', 'gloom', 'speed']);
export const MANGA_BACK_LABELS = Object.freeze({
    flowers: '花背景', sparkle: '亮片背景', burst: '黑底爆光', swirl: '漩涡', tone: '网点渐变', gloom: '阴沉竖线', speed: '平行速度线',
    invert: '黑白反转定格', fire: '怒火气场', dark: '杀气气场', petrify: '石化', weather: '风化',
});
const list = (items) => Object.freeze(items.slice());
export const MANGA_BACK_DEFAULTS = Object.freeze({
    flowers: list(['怦然心动', '心花怒放', '一见钟情', '春心荡漾']),
    sparkle: list(['闪亮登场', '光芒四射', '得意洋洋', '眼睛发亮']),
    burst: list(['晴天霹雳', '大受打击', '五雷轰顶', '受到暴击']),
    swirl: list(['一头雾水', '晕头转向', '思绪混乱', '大脑宕机']),
    tone: list(['冷场', '社死', '尴尬至极', '无地自容']),
    gloom: list(['万念俱灰', '心灰意冷', '跌入谷底', '一蹶不振']),
    speed: list(['冲刺', '飞奔', '狂奔', '突然出现']),
    invert: list(['震惊到失语', '如梦初醒', '脑中一片空白', '惊呆了']),
    fire: list(['怒火中烧', '火冒三丈', '怒不可遏']),
    dark: list(['杀气腾腾', '杀意', '黑化', '病娇']),
    petrify: list(['石化', '呆若木鸡', '如遭雷击', '僵住']),
    weather: list(['风化', '灰飞烟灭', '化成灰']),
});
const EXTRA_KINDS = Object.freeze(['invert', 'fire', 'dark', 'petrify', 'weather']);
const ALL_KINDS = Object.freeze([...MANGA_BACK_KINDS, ...EXTRA_KINDS]);

export function normalizeMangaBackSettings(value) {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const words = src.words && typeof src.words === 'object' ? src.words : {};
    const out = { enabled: src.enabled === true, words: {} };
    for (const kind of ALL_KINDS) out.words[kind] = normalizeEmotionList(words[kind], MANGA_BACK_DEFAULTS[kind]);
    return out;
}

export const MANGA_BACK_WORD_LIST_PATHS = Object.freeze(ALL_KINDS.map((kind) => `mangaBack.words.${kind}`));
export const MANGA_BACK_ALL_KINDS = ALL_KINDS;

// 纯函数：本页情绪命中哪些效果。背景只取一种，其余各类各取一种。
export function pickMangaBack(emotion, settings) {
    const s = normalizeMangaBackSettings(settings);
    const target = String(emotion || '').trim();
    if (!s.enabled || !target) return { back: '', invert: false, aura: '', sprite: '' };
    const hit = (kind) => s.words[kind].includes(target);
    return {
        back: MANGA_BACK_KINDS.find(hit) || '',
        invert: hit('invert'),
        aura: hit('fire') ? 'fire' : (hit('dark') ? 'dark' : ''),
        sprite: hit('petrify') ? 'petrify' : (hit('weather') ? 'weather' : ''),
    };
}

const states = new WeakMap();

function ensureBackLayer(motion, doc) {
    let layer = motion.querySelector('#igs-comic-back');
    const sprite = motion.querySelector('#igs-sprite');
    if (!layer) {
        layer = doc.createElement('div');
        layer.id = 'igs-comic-back';
        layer.setAttribute('aria-hidden', 'true');
    }
    // 紧贴在立绘之前：盖在背景、时段叠色与天气后层之上，不被调色。
    const anchor = motion.querySelector('#igs-cast') && motion.querySelector('#igs-cast').parentNode === motion ? motion.querySelector('#igs-cast') : sprite;
    if (anchor && anchor.parentNode === motion && layer.nextSibling !== anchor) motion.insertBefore(layer, anchor);
    else if (!layer.parentNode) motion.appendChild(layer);
    return layer;
}

function auraRect(motion, sprite) {
    if (!sprite || !sprite.url) return null;
    const probed = peekSpriteHead(sprite.url);
    if (!probed) return null;
    return spriteDrawRect(motion.clientWidth, motion.clientHeight, { ...sprite, naturalW: probed.naturalW, naturalH: probed.naturalH });
}

export function applyMangaBack(root, snapshot, opts = {}) {
    const motion = root && root.querySelector ? root.querySelector('#igs-stage-motion') : null;
    if (!motion) return null;
    const content = (snapshot && snapshot.content) || {};
    const reader = (snapshot && snapshot.readerSettings) || {};
    const blocked = content.sceneNsfw === true || content.illustrationActive === true;
    const pick = blocked ? { back: '', invert: false, aura: '', sprite: '' } : pickMangaBack(content.statusEmotion, reader.mangaBack);
    const doc = root.ownerDocument;
    let state = states.get(root);
    if (!state) { state = { pageKey: '', timers: [] }; states.set(root, state); }
    const pageKey = `${snapshot && snapshot.messageId}:${content.currentIndex}`;
    const layer = pick.back || pick.aura || motion.querySelector('#igs-comic-back') ? ensureBackLayer(motion, doc) : null;
    if (layer) {
        if (pick.back) layer.setAttribute('data-kind', pick.back);
        else layer.removeAttribute('data-kind');
        let aura = layer.querySelector('.igs-manga-aura');
        const rect = pick.aura ? auraRect(motion, opts.sprite) : null;
        if (pick.aura && (rect || opts.sprite)) {
            if (!aura) { aura = doc.createElement('div'); aura.className = 'igs-manga-aura'; layer.appendChild(aura); }
            aura.setAttribute('data-aura', pick.aura);
            const cx = rect ? rect.left + rect.w / 2 : motion.clientWidth * (Number(opts.sprite.posX) || 50) / 100;
            const w = rect ? rect.w * 1.3 : motion.clientWidth * 0.4;
            aura.style.left = `${Math.round(cx - w / 2)}px`;
            aura.style.width = `${Math.round(w)}px`;
        } else if (aura) aura.remove();
    }
    // 一次性效果（反转定格、石化、风化）每页只播一次，同页重绘不重播。
    if (state.pageKey !== pageKey) {
        state.pageKey = pageKey;
        for (const t of state.timers) clearTimeout(t);
        state.timers = [];
        motion.removeAttribute('data-igs-manga-invert');
        motion.removeAttribute('data-igs-manga-sprite');
        const flash = (attr, value, ms) => {
            motion.setAttribute(attr, value);
            state.timers.push(setTimeout(() => motion.removeAttribute(attr), ms));
        };
        if (pick.invert) flash('data-igs-manga-invert', '1', 700);
        if (pick.sprite) flash('data-igs-manga-sprite', pick.sprite, pick.sprite === 'weather' ? 2600 : 2200);
    }
    return pick;
}

// 平铺小图案：只作遮罩形状，颜色由背景色决定。
const svgUrl = (body, size) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>${body}</svg>`)}")`;
const FLOWER = (x, y, r) => [0, 72, 144, 216, 288].map((a) => {
    const t = a * Math.PI / 180;
    return `<circle cx='${(x + Math.cos(t) * r).toFixed(1)}' cy='${(y + Math.sin(t) * r).toFixed(1)}' r='${(r * 0.72).toFixed(1)}'/>`;
}).join('') + `<circle cx='${x}' cy='${y}' r='${(r * 0.5).toFixed(1)}' fill='%23fff3a8'/>`;
const FLOWERS = svgUrl(`<g fill='%23ffc2d6'>${FLOWER(40, 40, 14)}${FLOWER(130, 100, 10)}${FLOWER(70, 150, 8)}${FLOWER(165, 25, 7)}</g>`, 180);
const STAR4 = (x, y, r) => `<path d='M${x} ${y - r}Q${x + r * 0.12} ${y - r * 0.12} ${x + r} ${y}Q${x + r * 0.12} ${y + r * 0.12} ${x} ${y + r}Q${x - r * 0.12} ${y + r * 0.12} ${x - r} ${y}Q${x - r * 0.12} ${y - r * 0.12} ${x} ${y - r}Z'/>`;
const SPARKS = svgUrl(`<g fill='%23fff'>${STAR4(30, 34, 16)}${STAR4(110, 80, 10)}${STAR4(60, 130, 7)}${STAR4(140, 150, 12)}</g>`, 170);

export const MANGA_BACK_STYLE_TEXT = `
#igs-comic-back{position:absolute;inset:0;pointer-events:none;overflow:hidden;opacity:0;transition:opacity .35s ease;}
#igs-comic-back[data-kind],#igs-comic-back:has(.igs-manga-aura){opacity:1;}
#igs-comic-back::before{content:"";position:absolute;inset:-10%;}
#igs-comic-back[data-kind="flowers"]::before{background:${FLOWERS} 0 0/180px 180px,${FLOWERS} 90px 60px/120px 120px,radial-gradient(ellipse at 50% 45%,#fff6f9 0%,#ffd9e6 60%,#f6b7cd 100%);animation:igs-mb-drift 14s linear infinite;}
#igs-comic-back[data-kind="sparkle"]::before{background:${SPARKS} 0 0/170px 170px,${SPARKS} 60px 90px/110px 110px,radial-gradient(ellipse at 50% 40%,#b9d4ff 0%,#6f86d6 55%,#3b3f8f 100%);animation:igs-mb-twinkle 1.6s ease-in-out infinite alternate;}
#igs-comic-back[data-kind="burst"]::before{background:repeating-conic-gradient(from 0deg at 50% 42%,#fff 0deg 2.2deg,transparent 2.2deg 7deg),radial-gradient(circle at 50% 42%,#fff 0 4%,#111 40%,#000 100%);animation:igs-mb-burst .5s cubic-bezier(.2,.9,.3,1) both;}
#igs-comic-back[data-kind="swirl"]::before{background:repeating-conic-gradient(from 0deg at 50% 45%,#3d3a5c 0deg 12deg,#6c6896 12deg 24deg);-webkit-mask:radial-gradient(circle at 50% 45%,transparent 0 6%,#000 40%);mask:radial-gradient(circle at 50% 45%,transparent 0 6%,#000 40%);animation:igs-mb-spin 6s linear infinite;}
#igs-comic-back[data-kind="tone"]::before{background:radial-gradient(circle,rgba(30,30,40,.75) 1.6px,transparent 2.2px) 0 0/7px 7px,#e8e6ee;-webkit-mask:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.25) 70%);mask:linear-gradient(to bottom,#000 0%,rgba(0,0,0,.25) 70%);}
#igs-comic-back[data-kind="gloom"]::before{background:repeating-linear-gradient(90deg,rgba(20,10,40,.85) 0 3px,transparent 3px 22px),linear-gradient(#4a3a6e,#16121f);animation:igs-mb-drop 1.2s ease-out both;}
#igs-comic-back[data-kind="speed"]::before{background:repeating-linear-gradient(180deg,transparent 0 9px,rgba(255,255,255,.75) 9px 11px,transparent 11px 23px,rgba(255,255,255,.4) 23px 24px),#2a2f3a;animation:igs-mb-speed .35s linear infinite;}
@keyframes igs-mb-drift{to{transform:translate(-180px,-180px);}}
@keyframes igs-mb-twinkle{from{filter:brightness(.92);}to{filter:brightness(1.12);}}
@keyframes igs-mb-burst{0%{transform:scale(1.4);opacity:0;}100%{transform:none;opacity:1;}}
@keyframes igs-mb-spin{to{transform:rotate(360deg);}}
@keyframes igs-mb-drop{0%{transform:translateY(-30%);opacity:0;}100%{transform:none;opacity:1;}}
@keyframes igs-mb-speed{to{transform:translateX(-120px);}}
#igs-comic-back[data-kind="speed"]::before{background-size:auto;inset:-10% -20%;}
.igs-manga-aura{position:absolute;top:4%;bottom:0;border-radius:48% 48% 20% 20%/60% 60% 10% 10%;filter:blur(14px);animation:igs-mb-aura .9s ease-in-out infinite alternate;}
.igs-manga-aura[data-aura="fire"]{background:radial-gradient(ellipse at 50% 70%,rgba(255,230,120,.9) 0%,rgba(255,96,32,.85) 35%,rgba(200,20,10,.55) 65%,transparent 80%);}
.igs-manga-aura[data-aura="dark"]{background:radial-gradient(ellipse at 50% 70%,rgba(120,40,180,.75) 0%,rgba(40,0,70,.85) 45%,rgba(0,0,0,.6) 70%,transparent 82%);}
@keyframes igs-mb-aura{from{transform:scaleY(.94) skewX(-2deg);opacity:.82;}to{transform:scaleY(1.06) skewX(2deg);opacity:1;}}
#igs-stage-motion[data-igs-manga-invert]{filter:invert(1) grayscale(1) contrast(1.2);}
#igs-stage-motion[data-igs-manga-invert] #igs-sprite,#igs-stage-motion[data-igs-manga-invert] .igs-cast-sprite{animation-play-state:paused!important;}
#igs-stage-motion[data-igs-manga-sprite="petrify"] #igs-sprite{filter:grayscale(1) contrast(1.45) brightness(1.12) sepia(.15)!important;animation:igs-mb-jolt .25s steps(2,end) 2;}
#igs-stage-motion[data-igs-manga-sprite="weather"] #igs-sprite{filter:grayscale(1) contrast(1.2) brightness(1.15)!important;-webkit-mask:linear-gradient(to top,transparent var(--igs-mb-erode,0%),#000 calc(var(--igs-mb-erode,0%) + 12%));mask:linear-gradient(to top,transparent var(--igs-mb-erode,0%),#000 calc(var(--igs-mb-erode,0%) + 12%));animation:igs-mb-erode 2.6s ease-in both;}
@property --igs-mb-erode{syntax:'<percentage>';inherits:false;initial-value:0%;}
@keyframes igs-mb-erode{0%{--igs-mb-erode:-12%;}55%{--igs-mb-erode:70%;}75%{--igs-mb-erode:70%;opacity:1;}100%{--igs-mb-erode:-12%;opacity:1;}}
@keyframes igs-mb-jolt{0%{translate:-3px 0;}100%{translate:3px 0;}}
#igs-overlay[data-igs-comic="mono"] #igs-comic-back{filter:grayscale(1) contrast(1.15);}
#igs-overlay[data-igs-quality="low"] #igs-comic-back::before,#igs-overlay[data-igs-quality="low"] .igs-manga-aura{animation:none;}
@media (prefers-reduced-motion: reduce){#igs-comic-back::before,.igs-manga-aura,#igs-stage-motion[data-igs-manga-sprite] #igs-sprite{animation:none!important;}}
`;
