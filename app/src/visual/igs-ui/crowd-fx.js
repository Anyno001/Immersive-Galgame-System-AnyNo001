import { CROWD_WORDS, TAVERN_WORDS } from './scene-audio.js';
import { makeRand, hashSeed } from './comic-shapes.js';

// 人群剪影：地点命中人多的词时，在背景与时段叠色之间铺两排平涂剪影（远排小而浅、近排大而深、被画面底边裁切），
// 随时段叠色一起变色。身形由部件拼出（体型、发型、配件、朝向），按世界观换外形；正文写到鼓掌、欢呼等时整群一起反应。
// 所有模式通用，不依赖漫画模式。

const BUSY_WORDS = Object.freeze(['车站', '广场', '集市', '商场', '商店街', '步行街', '庙会', '祭典', '夏日祭', '游乐园', '市场', '码头', '机场', '人群', '人潮', '演唱会', '体育场', '会场']);
const CALM_WORDS = Object.freeze(['教室', '食堂', '餐厅', '咖啡', '酒吧', '街', '市', '大厅', '大堂', '礼堂']);
const QUIET_PLACE = /卧室|房间|宿舍|浴室|病房|车内|小巷|天台|屋顶|山顶|森林|海边|密室|地牢/;

export function normalizeCrowdFxSettings(value) {
    const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return { enabled: src.enabled === true, react: src.react !== false };
}

const includesAny = (text, words) => words.some((word) => text.includes(word));

// 纯函数：0 无人、1 稀疏、2 人多、3 拥挤。夜里降一档。
export function resolveCrowdDensity(location, time) {
    const place = String(location || '');
    if (!place || QUIET_PLACE.test(place)) return 0;
    let level = includesAny(place, BUSY_WORDS) ? 3 : (includesAny(place, TAVERN_WORDS) || includesAny(place, CROWD_WORDS) || includesAny(place, CALM_WORDS) ? 2 : 0);
    if (level && /夜|深夜|午夜|night|midnight/i.test(String(time || ''))) level -= 1;
    return level;
}

const REACTIONS = Object.freeze([
    ['clap', /鼓掌|掌声/],
    ['cheer', /欢呼|喝彩|叫好/],
    ['gasp', /惊呼|倒吸一口|一片惊叫/],
    ['laugh', /哄笑|哄堂大笑|笑成一片/],
    ['murmur', /哗然|议论纷纷|窃窃私语|交头接耳/],
    ['hush', /鸦雀无声|安静了下来|一片寂静|全场安静|安静下来/],
]);

export function resolveCrowdReaction(text) {
    const src = String(text || '');
    const hit = REACTIONS.find(([, re]) => re.test(src));
    return hit ? hit[0] : '';
}

// 一个剪影（局部坐标：脚底中心为原点，高度 h）。
function figure(rand, h, era, umbrella) {
    const kind = rand();
    const scale = kind < 0.12 ? 0.68 : 1;
    const H = h * scale * (0.9 + rand() * 0.18);
    const headR = H * 0.085;
    const shoulder = H * (0.2 + rand() * 0.05);
    const neckY = -H + headR * 2.1;
    const side = rand() < 0.3 ? (rand() < 0.5 ? -1 : 1) : 0;
    const hx = side * headR * 0.25;
    const body = `M${-shoulder} 0L${-shoulder * 0.98} ${(neckY + H * 0.12).toFixed(1)}Q${-shoulder} ${(neckY + headR * 0.4).toFixed(1)} ${(-shoulder * 0.45).toFixed(1)} ${(neckY + headR * 0.2).toFixed(1)}L${(shoulder * 0.45).toFixed(1)} ${(neckY + headR * 0.2).toFixed(1)}Q${shoulder} ${(neckY + headR * 0.4).toFixed(1)} ${(shoulder * 0.98).toFixed(1)} ${(neckY + H * 0.12).toFixed(1)}L${shoulder} 0Z`;
    const cy = -H + headR;
    let parts = `<path d="${body}"/><ellipse cx="${hx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(headR * 0.92).toFixed(1)}" ry="${headR.toFixed(1)}"/>`;
    const hair = rand();
    if (era === 'ancient') {
        if (hair < 0.4) parts += `<path d="M${-headR * 2.2} ${(cy - headR * 0.3).toFixed(1)}L0 ${(cy - headR * 2).toFixed(1)}L${headR * 2.2} ${(cy - headR * 0.3).toFixed(1)}Z"/>`;
        else parts += `<circle cx="${hx}" cy="${(cy - headR * 1.1).toFixed(1)}" r="${(headR * 0.5).toFixed(1)}"/>`;
    } else if (era === 'magic' && hair < 0.45) {
        parts += `<path d="M${-headR * 1.6} ${(cy - headR * 0.4).toFixed(1)}L${(headR * 0.4).toFixed(1)} ${(cy - headR * 3.4).toFixed(1)}L${headR * 1.6} ${(cy - headR * 0.4).toFixed(1)}Z"/>`;
    } else if (hair < 0.22) {
        parts += `<path d="M${(hx - headR).toFixed(1)} ${cy.toFixed(1)}Q${(hx - headR * 1.2).toFixed(1)} ${(cy + headR * 2.6).toFixed(1)} ${(hx - headR * 0.4).toFixed(1)} ${(cy + headR * 2.8).toFixed(1)}L${(hx + headR * 0.4).toFixed(1)} ${(cy + headR * 2.8).toFixed(1)}Q${(hx + headR * 1.2).toFixed(1)} ${(cy + headR * 2.6).toFixed(1)} ${(hx + headR).toFixed(1)} ${cy.toFixed(1)}Z"/>`;
    } else if (hair < 0.36) {
        parts += `<ellipse cx="${(hx - (side || 1) * headR * 1.05).toFixed(1)}" cy="${(cy + headR * 0.6).toFixed(1)}" rx="${(headR * 0.35).toFixed(1)}" ry="${(headR * 0.95).toFixed(1)}"/>`;
    } else if (hair < 0.44) {
        parts += `<circle cx="${(hx - headR * 1.05).toFixed(1)}" cy="${(cy - headR * 0.2).toFixed(1)}" r="${(headR * 0.45).toFixed(1)}"/><circle cx="${(hx + headR * 1.05).toFixed(1)}" cy="${(cy - headR * 0.2).toFixed(1)}" r="${(headR * 0.45).toFixed(1)}"/>`;
    }
    const acc = rand();
    if (umbrella && acc < 0.55) {
        const r = shoulder * 1.9;
        const top = cy - headR * 2.2;
        parts += `<path d="M${-r} ${top.toFixed(1)}Q0 ${(top - r * 0.9).toFixed(1)} ${r} ${top.toFixed(1)}Z"/><rect x="-1" y="${top.toFixed(1)}" width="2" height="${(headR * 3).toFixed(1)}"/>`;
    } else if (acc < 0.2) {
        parts += `<rect x="${(shoulder * 0.8).toFixed(1)}" y="${(-H * 0.5).toFixed(1)}" width="${(shoulder * 0.55).toFixed(1)}" height="${(H * 0.16).toFixed(1)}" rx="3"/>`;
    } else if (era === 'modern' && acc < 0.3) {
        parts += `<rect x="${(hx + headR * 0.3).toFixed(1)}" y="${(cy + headR * 1.2).toFixed(1)}" width="${(headR * 0.5).toFixed(1)}" height="${(headR * 0.9).toFixed(1)}" rx="1.5"/>`;
    }
    return { parts, shoulder };
}

// 一排剪影：返回 SVG 字符串。近排每人一个 <g>，做呼吸与反应动画。
export function buildCrowdSvg({ width, height, density, seed, era = 'modern', umbrella = false }) {
    const rand = makeRand(seed);
    const far = [];
    const near = [];
    const farCount = [0, 10, 18, 26][density] || 0;
    const nearCount = [0, 4, 7, 11][density] || 0;
    const farH = height * 0.3;
    for (let i = 0; i < farCount; i += 1) {
        const x = width * (i + rand() * 0.8) / farCount;
        const { parts } = figure(rand, farH, era, umbrella);
        far.push(`<g transform="translate(${x.toFixed(1)} ${(height * (0.74 + rand() * 0.04)).toFixed(1)})">${parts}</g>`);
    }
    const nearH = height * 0.52;
    for (let i = 0; i < nearCount; i += 1) {
        const x = width * (i + 0.2 + rand() * 0.6) / nearCount;
        const { parts } = figure(rand, nearH, era, umbrella);
        const delay = (rand() * -4).toFixed(2);
        const flip = rand() < 0.5 ? ' scale(-1 1)' : '';
        near.push(`<g transform="translate(${x.toFixed(1)} ${(height * (1.08 + rand() * 0.06)).toFixed(1)})${flip}"><g class="igs-crowd-p" style="animation-delay:${delay}s">${parts}</g></g>`);
    }
    return `<svg class="igs-crowd-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">`
        + '<defs><linearGradient id="igs-crowd-far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa3b2"/><stop offset="1" stop-color="#6b7383"/></linearGradient>'
        + '<linearGradient id="igs-crowd-near" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d4452"/><stop offset="1" stop-color="#1d2129"/></linearGradient></defs>'
        + `<g class="igs-crowd-far" fill="url(#igs-crowd-far)">${far.join('')}</g>`
        + `<g class="igs-crowd-near" fill="url(#igs-crowd-near)">${near.join('')}</g></svg>`;
}

const states = new WeakMap();

export function applyCrowdFx(root, snapshot) {
    const motion = root && root.querySelector ? root.querySelector('#igs-stage-motion') : null;
    if (!motion) return 0;
    const reader = (snapshot && snapshot.readerSettings) || {};
    const content = (snapshot && snapshot.content) || {};
    const settings = normalizeCrowdFxSettings(reader.crowdFx);
    const blocked = content.sceneNsfw === true || content.illustrationActive === true;
    const density = settings.enabled && !blocked ? resolveCrowdDensity(content.sceneLocation, content.sceneTime) : 0;
    let layer = motion.querySelector('#igs-crowd');
    if (!density) {
        if (layer) layer.remove();
        return 0;
    }
    const doc = root.ownerDocument;
    const bg = motion.querySelector('#igs-bg');
    if (!layer) {
        layer = doc.createElement('div');
        layer.id = 'igs-crowd';
        layer.setAttribute('aria-hidden', 'true');
    }
    // 紧跟在背景图后：时段叠色层插在立绘之前，会一起染到剪影上。
    if (bg && bg.parentNode === motion && bg.nextSibling !== layer) motion.insertBefore(layer, bg.nextSibling);
    else if (!layer.parentNode) motion.appendChild(layer);
    const era = reader._ancientEra === true ? 'ancient' : (reader._worldview === 'magic' ? 'magic' : 'modern');
    const umbrella = /雨/.test(String(content.sceneWeather || ''));
    const key = `${content.sceneLocation}|${density}|${era}|${umbrella}`;
    let state = states.get(root);
    if (!state) { state = { key: '', pageKey: '', timer: null }; states.set(root, state); }
    if (state.key !== key) {
        state.key = key;
        layer.innerHTML = buildCrowdSvg({ width: 1600, height: 900, density, seed: hashSeed(String(content.sceneLocation || '')), era, umbrella });
        layer.setAttribute('data-flow', includesAny(String(content.sceneLocation || ''), ['车站', '街', '商场', '集市', '市场', '机场']) ? '1' : '0');
    }
    const pageKey = `${snapshot && snapshot.messageId}:${content.currentIndex}`;
    if (settings.react && state.pageKey !== pageKey) {
        state.pageKey = pageKey;
        const reaction = resolveCrowdReaction(content.displayText || content.text);
        clearTimeout(state.timer);
        if (reaction) {
            layer.setAttribute('data-react', reaction);
            // 安静下来保持到翻页；其余反应 1.8 秒后回到日常呼吸。
            if (reaction !== 'hush') state.timer = setTimeout(() => layer.removeAttribute('data-react'), 1800);
        } else layer.removeAttribute('data-react');
    }
    return density;
}

export const CROWD_STYLE_TEXT = `
#igs-crowd{position:absolute;inset:0;pointer-events:none;overflow:hidden;animation:igs-crowd-in .8s ease both;}
#igs-crowd .igs-crowd-svg{position:absolute;inset:0;width:100%;height:100%;}
#igs-crowd .igs-crowd-far{opacity:.55;filter:blur(1.2px);}
#igs-crowd .igs-crowd-near{opacity:.92;}
#igs-crowd .igs-crowd-p{transform-box:fill-box;transform-origin:50% 100%;animation:igs-crowd-breathe 4s ease-in-out infinite;}
#igs-crowd[data-flow="1"] .igs-crowd-near{animation:igs-crowd-flow 18s ease-in-out infinite alternate;}
#igs-crowd[data-react="clap"] .igs-crowd-p{animation:igs-crowd-bob .18s ease-in-out infinite alternate;}
#igs-crowd[data-react="cheer"] .igs-crowd-p{animation:igs-crowd-jump .45s cubic-bezier(.3,0,.4,1) infinite alternate;}
#igs-crowd[data-react="gasp"] .igs-crowd-p{animation:igs-crowd-lean .35s ease-out both;}
#igs-crowd[data-react="laugh"] .igs-crowd-p{animation:igs-crowd-shake .14s steps(2,end) infinite;}
#igs-crowd[data-react="murmur"] .igs-crowd-p{animation:igs-crowd-tilt 1.2s ease-in-out infinite alternate;}
#igs-crowd[data-react="hush"] .igs-crowd-p{animation:none;}
#igs-crowd[data-react="hush"]{filter:brightness(.82);transition:filter .6s ease;}
@keyframes igs-crowd-in{from{opacity:0;}to{opacity:1;}}
@keyframes igs-crowd-breathe{0%,100%{transform:scaleY(1);}50%{transform:scaleY(1.012);}}
@keyframes igs-crowd-flow{from{transform:translateX(-24px);}to{transform:translateX(24px);}}
@keyframes igs-crowd-bob{from{transform:translateY(0);}to{transform:translateY(-1.5%);}}
@keyframes igs-crowd-jump{from{transform:translateY(0);}to{transform:translateY(-6%);}}
@keyframes igs-crowd-lean{to{transform:rotate(-4deg) translateY(1%);}}
@keyframes igs-crowd-shake{0%{transform:rotate(-1.5deg);}100%{transform:rotate(1.5deg);}}
@keyframes igs-crowd-tilt{from{transform:rotate(-2deg);}to{transform:rotate(2deg);}}
#igs-overlay[data-igs-comic="mono"] #igs-crowd{filter:grayscale(1);}
#igs-overlay[data-igs-quality="low"] #igs-crowd .igs-crowd-near{display:none;}
#igs-overlay[data-igs-quality="low"] #igs-crowd .igs-crowd-far{filter:none;}
@media (prefers-reduced-motion: reduce){#igs-crowd,#igs-crowd *{animation:none!important;}}
`;
