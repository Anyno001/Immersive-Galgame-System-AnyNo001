import { CROWD_WORDS, TAVERN_WORDS } from './scene-audio.js';
import { makeRand, hashSeed } from './comic-shapes.js';

// 人群剪影：地点命中人多的词时，在背景与时段叠色之间铺三排平涂剪影（远排小而浅、中排、近排大而深被画面底边裁切），
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

// 一个剪影（局部坐标：脚底中心为原点，高度 h）。按真人比例拼：头、颈、斜肩、收腰、胯、两条腿和脚、垂在身侧的手臂；
// 再按随机叠裙摆 / 长外套、发型、帽子与配件。部件同色平涂（每排一种灰），重叠处看不出接缝。
const f1 = (v) => v.toFixed(1);
const poly = (pts) => `<path d="M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z"/>`;

// 一段有粗细的肢体：从 a 到 b，两端宽 wa / wb，末端圆头。
function limb(ax, ay, bx, by, wa, wb) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    return poly([[ax + nx * wa, ay + ny * wa], [bx + nx * wb, by + ny * wb], [bx - nx * wb, by - ny * wb], [ax - nx * wa, ay - ny * wa]])
        + `<circle cx="${f1(bx)}" cy="${f1(by)}" r="${f1(wb)}"/>`;
}

function figure(rand, h, era, umbrella) {
    const child = rand() < 0.1;
    const H = h * (child ? 0.62 : 1) * (0.9 + rand() * 0.18);
    const fem = rand() < 0.5;
    const headR = H * (child ? 0.085 : 0.066);
    const side = rand() < 0.35 ? (rand() < 0.5 ? -1 : 1) : 0;
    const walking = side !== 0 || rand() < 0.25;
    const sw = H * (fem ? 0.1 : 0.12) * (0.94 + rand() * 0.14) * (side ? 0.78 : 1);
    const hx = side * headR * 0.35;
    const cy = -H + headR * 1.08;
    const neckTop = cy + headR * 0.7;
    const sy = -H * 0.8;
    const wy = -H * 0.57;
    const hy = -H * 0.47;
    const crotch = -H * 0.43;
    const ww = sw * (fem ? 0.56 : 0.66);
    const hw = sw * (fem ? 0.86 : 0.74);
    const nw = headR * 0.42;
    const trap = headR * 0.32;
    let parts = '';
    // 背包画在最底下，侧身时从背后露出来。
    const acc = rand();
    if (!umbrella && acc < 0.12) {
        const bx = side ? -side * sw * 0.9 : 0;
        parts += `<rect x="${f1(bx - sw * 0.55)}" y="${f1(sy + headR * 0.2)}" width="${f1(sw * 1.1)}" height="${f1(H * 0.24)}" rx="${f1(sw * 0.3)}"/>`;
    }
    // 躯干：斜方肌 → 圆肩 → 腋下收进 → 腰 → 胯。
    parts += `<path d="M${f1(-nw)} ${f1(neckTop)}L${f1(-nw)} ${f1(sy - trap)}Q${f1(-sw * 0.82)} ${f1(sy - trap * 0.5)} ${f1(-sw)} ${f1(sy + headR * 0.45)}`
        + `Q${f1(-sw * 1.02)} ${f1(sy + H * 0.07)} ${f1(-sw * 0.88)} ${f1(-H * 0.68)}L${f1(-ww)} ${f1(wy)}Q${f1(-hw * 1.04)} ${f1((wy + hy) / 2)} ${f1(-hw)} ${f1(hy)}`
        + `L${f1(-hw * 0.9)} ${f1(crotch)}L${f1(hw * 0.9)} ${f1(crotch)}L${f1(hw)} ${f1(hy)}Q${f1(hw * 1.04)} ${f1((wy + hy) / 2)} ${f1(ww)} ${f1(wy)}`
        + `L${f1(sw * 0.88)} ${f1(-H * 0.68)}Q${f1(sw * 1.02)} ${f1(sy + H * 0.07)} ${f1(sw)} ${f1(sy + headR * 0.45)}Q${f1(sw * 0.82)} ${f1(sy - trap * 0.5)} ${f1(nw)} ${f1(sy - trap)}L${f1(nw)} ${f1(neckTop)}Z"/>`;
    // 腿：走路的迈开，站着的微微分开；脚尖朝身体朝向。
    const stride = walking ? H * (0.05 + rand() * 0.06) : H * (0.018 + rand() * 0.02);
    const legTop = hw * 0.48;
    const legW = hw * 0.46;
    const ankle = H * 0.024;
    const toe = side || (rand() < 0.5 ? -1 : 1) * 0.3;
    for (const dir of [-1, 1]) {
        const fx = dir * stride;
        parts += limb(dir * legTop, hy + H * 0.02, fx, -ankle, legW, ankle);
        parts += `<ellipse cx="${f1(fx + toe * H * 0.022)}" cy="${f1(-H * 0.012)}" rx="${f1(H * 0.038)}" ry="${f1(H * 0.013)}"/>`;
    }
    // 下装：裙摆或过膝外套盖住大腿。
    const wear = rand();
    if (fem && wear < 0.5) {
        const hem = -H * (0.26 + rand() * 0.08);
        const flare = hw * (1.25 + rand() * 0.25);
        parts += `<path d="M${f1(-ww)} ${f1(wy)}L${f1(ww)} ${f1(wy)}L${f1(flare)} ${f1(hem)}Q0 ${f1(hem + H * 0.025)} ${f1(-flare)} ${f1(hem)}Z"/>`;
    } else if (wear > 0.78 || era === 'ancient') {
        const hem = era === 'ancient' ? -H * (0.06 + rand() * 0.08) : -H * (0.22 + rand() * 0.06);
        const flare = hw * (era === 'ancient' ? 1.45 : 1.2);
        parts += `<path d="M${f1(-sw * 0.9)} ${f1(sy + headR * 0.6)}L${f1(sw * 0.9)} ${f1(sy + headR * 0.6)}L${f1(flare)} ${f1(hem)}L${f1(-flare)} ${f1(hem)}Z"/>`;
    }
    // 手臂：自然垂下，走路的前后摆；现代背景有人举着手机看。
    const phone = era === 'modern' && !umbrella && acc >= 0.12 && acc < 0.24;
    const armW = H * 0.03;
    for (const dir of [-1, 1]) {
        const ax = dir * sw * 0.84;
        const ay = sy + headR * 0.5;
        if (phone && dir === 1) {
            const ex = sw * 1.05;
            const ey = -H * 0.62;
            const px = hx + headR * 1.1;
            const py = cy + headR * 1.6;
            parts += limb(ax, ay, ex, ey, armW, armW * 0.85) + limb(ex, ey, px, py, armW * 0.85, armW * 0.7);
            parts += `<rect x="${f1(px - headR * 0.25)}" y="${f1(py - headR * 0.9)}" width="${f1(headR * 0.5)}" height="${f1(headR * 0.9)}" rx="1.5"/>`;
            continue;
        }
        const swing = walking ? dir * (side || 1) * H * (0.03 + rand() * 0.04) : 0;
        parts += limb(ax, ay, dir * sw * 0.96 + swing, -H * 0.42, armW, armW * 0.72);
    }
    if (!phone && !umbrella && acc >= 0.12 && acc < 0.3) {
        const bx = (rand() < 0.5 ? -1 : 1) * sw * 1.05;
        parts += `<rect x="${f1(bx - sw * 0.28)}" y="${f1(-H * 0.46)}" width="${f1(sw * 0.56)}" height="${f1(H * 0.13)}" rx="3"/>`;
    }
    // 头与颈。
    parts += `<rect x="${f1(-nw + hx * 0.3)}" y="${f1(cy)}" width="${f1(nw * 2)}" height="${f1(neckTop - cy + trap)}"/>`
        + `<ellipse cx="${f1(hx)}" cy="${f1(cy)}" rx="${f1(headR * 0.9)}" ry="${f1(headR * 1.08)}"/>`;
    // 发型 / 帽子。
    const hair = rand();
    if (era === 'ancient') {
        if (hair < 0.35) parts += `<path d="M${f1(hx - headR * 2.3)} ${f1(cy - headR * 0.2)}Q${f1(hx)} ${f1(cy - headR * 2.6)} ${f1(hx + headR * 2.3)} ${f1(cy - headR * 0.2)}Z"/>`;
        else parts += `<ellipse cx="${f1(hx)}" cy="${f1(cy - headR * 1.15)}" rx="${f1(headR * 0.42)}" ry="${f1(headR * 0.5)}"/>`;
        if (fem && hair > 0.6) parts += `<path d="M${f1(hx - headR * 0.9)} ${f1(cy)}Q${f1(hx - headR * 1.3)} ${f1(cy + headR * 3.2)} ${f1(hx)} ${f1(cy + headR * 3.6)}Q${f1(hx + headR * 1.3)} ${f1(cy + headR * 3.2)} ${f1(hx + headR * 0.9)} ${f1(cy)}Z"/>`;
    } else if (era === 'magic' && hair < 0.4) {
        parts += `<path d="M${f1(hx - headR * 1.9)} ${f1(cy - headR * 0.45)}Q${f1(hx)} ${f1(cy - headR * 0.85)} ${f1(hx + headR * 1.9)} ${f1(cy - headR * 0.45)}L${f1(hx + headR * 0.7)} ${f1(cy - headR * 0.75)}`
            + `Q${f1(hx + headR * 0.4)} ${f1(cy - headR * 2.6)} ${f1(hx + headR * 1.3)} ${f1(cy - headR * 3.4)}Q${f1(hx - headR * 0.3)} ${f1(cy - headR * 2.6)} ${f1(hx - headR * 0.7)} ${f1(cy - headR * 0.75)}Z"/>`;
    } else if (fem && hair < 0.3) {
        // 长发披肩。
        parts += `<path d="M${f1(hx - headR * 0.95)} ${f1(cy - headR * 0.2)}Q${f1(hx - headR * 1.25)} ${f1(cy + headR * 2.4)} ${f1(hx - headR * 0.85)} ${f1(cy + headR * 3.1)}L${f1(hx + headR * 0.85)} ${f1(cy + headR * 3.1)}Q${f1(hx + headR * 1.25)} ${f1(cy + headR * 2.4)} ${f1(hx + headR * 0.95)} ${f1(cy - headR * 0.2)}Z"/>`;
    } else if (fem && hair < 0.5) {
        // 马尾：从后脑垂下的一束。
        const back = -(side || 1);
        parts += limb(hx + back * headR * 0.7, cy - headR * 0.3, hx + back * headR * 1.4, cy + headR * 2, headR * 0.38, headR * 0.12);
    } else if (fem && hair < 0.6) {
        parts += `<ellipse cx="${f1(hx)}" cy="${f1(cy - headR * 1.05)}" rx="${f1(headR * 0.5)}" ry="${f1(headR * 0.42)}"/>`;
    } else if (!fem && hair < 0.14 && era === 'modern') {
        // 鸭舌帽。
        const front = side || 1;
        parts += `<path d="M${f1(hx - headR * 0.95)} ${f1(cy - headR * 0.25)}Q${f1(hx)} ${f1(cy - headR * 1.55)} ${f1(hx + headR * 0.95)} ${f1(cy - headR * 0.25)}Z"/>`
            + (side
                ? `<rect x="${f1(front > 0 ? hx : hx - headR * 1.6)}" y="${f1(cy - headR * 0.4)}" width="${f1(headR * 1.6)}" height="${f1(headR * 0.22)}" rx="1"/>`
                : `<ellipse cx="${f1(hx)}" cy="${f1(cy - headR * 0.3)}" rx="${f1(headR * 1.12)}" ry="${f1(headR * 0.2)}"/>`);
    } else {
        // 短发：头顶略蓬一点，免得像光头。
        parts += `<ellipse cx="${f1(hx)}" cy="${f1(cy - headR * 0.3)}" rx="${f1(headR * 0.98)}" ry="${f1(headR * 0.9)}"/>`;
    }
    if (umbrella && acc < 0.55) {
        const r = sw * 2.1;
        const top = cy - headR * 2.2;
        parts += `<path d="M${f1(-r)} ${f1(top)}Q0 ${f1(top - r * 0.9)} ${f1(r)} ${f1(top)}Q${f1(r * 0.5)} ${f1(top - r * 0.12)} 0 ${f1(top)}Q${f1(-r * 0.5)} ${f1(top - r * 0.12)} ${f1(-r)} ${f1(top)}Z"/>`
            + `<rect x="-1" y="${f1(top - r * 0.95)}" width="2" height="${f1(r * 0.95 + headR * 3)}"/>`;
    }
    return { parts, shoulder: sw };
}

// 剪影分远、中、近三排：远排小而浅、带一点雾；近排大而深、被画面底边裁切，做呼吸与反应动画。
export function buildCrowdSvg({ width, height, density, seed, era = 'modern', umbrella = false }) {
    const rand = makeRand(seed);
    const rows = [
        { cls: 'far', count: [0, 10, 18, 26][density] || 0, h: 0.28, y: 0.74, spread: 0.04, animate: false, fill: '#8e96a4' },
        { cls: 'mid', count: [0, 0, 5, 8][density] || 0, h: 0.4, y: 0.92, spread: 0.04, animate: true, fill: '#5a6170' },
        { cls: 'near', count: [0, 4, 6, 9][density] || 0, h: 0.54, y: 1.1, spread: 0.06, animate: true, fill: '#2a2f39' },
    ];
    const groups = rows.map((row) => {
        const out = [];
        // 两三人结伴：偶尔把下一个人挨着上一个放。
        let x = width * rand() * 0.6 / Math.max(1, row.count);
        for (let i = 0; i < row.count; i += 1) {
            const pair = i && rand() < 0.3;
            x += pair ? width * (0.18 + rand() * 0.12) / row.count : width * (0.7 + rand() * 0.6) / row.count;
            const px = x % width;
            const { parts } = figure(rand, height * row.h, era, umbrella);
            const flip = rand() < 0.5 ? ' scale(-1 1)' : '';
            const at = `translate(${f1(px)} ${f1(height * (row.y + rand() * row.spread))})${flip}`;
            out.push(row.animate
                ? `<g transform="${at}"><g class="igs-crowd-p" style="animation-delay:${(rand() * -4).toFixed(2)}s">${parts}</g></g>`
                : `<g transform="${at}">${parts}</g>`);
        }
        return `<g class="igs-crowd-${row.cls}" fill="${row.fill}">${out.join('')}</g>`;
    });
    // 远排与中排之间垫一层地面雾，拉开前后距离。
    const haze = `<rect x="0" y="${f1(height * 0.6)}" width="${width}" height="${f1(height * 0.4)}" fill="url(#igs-crowd-haze)"/>`;
    return `<svg class="igs-crowd-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">`
        + '<defs>'
        + '<linearGradient id="igs-crowd-haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8c0cc" stop-opacity="0"/><stop offset=".55" stop-color="#b8c0cc" stop-opacity=".22"/><stop offset="1" stop-color="#b8c0cc" stop-opacity="0"/></linearGradient></defs>'
        + groups[0] + haze + groups[1] + groups[2] + '</svg>';
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
#igs-crowd .igs-crowd-far{opacity:.5;filter:blur(1.2px);}
#igs-crowd .igs-crowd-mid{opacity:.72;filter:blur(.5px);}
#igs-crowd .igs-crowd-near{opacity:.9;}
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
#igs-overlay[data-igs-quality="low"] #igs-crowd :is(.igs-crowd-far,.igs-crowd-mid){filter:none;}
@media (prefers-reduced-motion: reduce){#igs-crowd,#igs-crowd *{animation:none!important;}}
`;
