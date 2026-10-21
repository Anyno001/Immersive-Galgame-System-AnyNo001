import { esc } from './reader-value-utils.js';
import { make } from './fx-daily-kit.js';
import { cloneSpriteLayer, readStageBackground, resolveRegionCrop } from './stage-snapshot.js';
import { BOKEH_SPOTS, DAPPLE_SPOTS, FG_PARTS, PEEK_LEAF, STREAK_ROWS } from './fx-camera-parts.js';
import { STREAK_COLORS, inferStepMaterial } from './fx-camera-model.js';
import { buildStepPlan, playBodySounds, playSteps } from './camera-steps-audio.js';

export const CAMERA_LIFE_MS = Object.freeze({
    leaf: 1600, rail: 2200, pole: 1400, passer: 2000, peek: 3600, flare: 2200, streak: 3600, bob: 3600, backdrop: 4200, thunder: 2600,
    cut: 700, establish: 3600, montageTail: 2600, timelapse: 4200, split: 5200, linger: 9000, step: 3000, walk: 5600, chase: 5200, sneak: 5600, seeoff: 4200, enterroom: 3600,
});

const MUFFLE_EVENT = 'igs-ambient-muffle';
const CELL_FRAMES = Object.freeze([
    { l: -6, t: -6, r: -6, b: -6, dx: -3, dy: -2 }, { l: -40, t: -22, r: -4, b: -6, dx: 3, dy: -1 },
    { l: -6, t: -46, r: -40, b: -4, dx: -2, dy: 2 }, { l: -30, t: -10, r: -26, b: -30, dx: 2, dy: -2 },
]);
const CELL_REGIONS = Object.freeze(['face', 'hand', 'waist', 'face']);
const CELL_RATIO = Object.freeze({ 2: 1.1, 3: 1.6, 4: 0.55 });
const TL_CLOUDS = Object.freeze([[8, 0], [30, 380], [52, 760]]);
const PETAL_COLORS = Object.freeze(['#ff9fc0', '#ffc2d6', '#ffb0a0', '#fff0f4']);

const scaled = (ms, env) => Math.round(ms * Math.max(1, env.hold || 1));
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const hexOrNamed = (value) => (Object.hasOwn(STREAK_COLORS, value) ? STREAK_COLORS[value] : (/^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : ''));

function shell(env, name, html = '', extra = '') {
    const cls = ['igs-dfx', 'igs-cm', `igs-cm-${name}`, extra, env.ancient && 'is-ancient', env.reduced && 'is-reduced'].filter(Boolean).join(' ');
    return make(env.doc, cls, html);
}

function lowQuality(env) {
    const root = env.root;
    return Boolean(root && typeof root.getAttribute === 'function' && root.getAttribute('data-igs-quality') === 'low');
}

function dispatchMuffle(doc, on, ms) {
    if (!doc || typeof doc.dispatchEvent !== 'function' || typeof globalThis.CustomEvent !== 'function') return;
    try { doc.dispatchEvent(new globalThis.CustomEvent(MUFFLE_EVENT, { detail: { on, ms } })); } catch { /* 无事件环境 */ }
}

function walkSteps(env, spec) {
    const cam = env.camera;
    if (!cam || cam.sound !== true) return null;
    const hints = typeof cam.ground === 'function' ? cam.ground() : {};
    const material = inferStepMaterial({ tag: spec.material || '', ...hints });
    return playSteps(buildStepPlan({ ...spec, material }), { volume: cam.volume });
}

function bodySounds(env, options) {
    const cam = env.camera;
    if (!cam || cam.sound !== true) return null;
    return playBodySounds({ volume: cam.volume, ...options });
}

function bobSprite(env, life) {
    if (env.reduced || lowQuality(env)) return false;
    const sprite = env.root && typeof env.root.querySelector === 'function' ? env.root.querySelector('#igs-sprite') : null;
    if (!sprite || typeof sprite.animate !== 'function') return false;
    const period = 450;
    try {
        sprite.animate([{ translate: '0 0' }, { translate: '0 -1%' }, { translate: '0 0' }], {
            duration: period, iterations: Math.max(1, Math.ceil(life / period)), easing: 'ease-in-out', composite: 'add',
        });
        return true;
    } catch {
        return false;
    }
}

function fgPiece(kind, dir, delayMs = 0, durationMs = 0) {
    const style = [delayMs ? `animation-delay:${delayMs}ms` : '', durationMs ? `animation-duration:${durationMs}ms` : ''].filter(Boolean).join(';');
    return `<div class="igs-cm-fg is-${kind} is-${dir}"${style ? ` style="${style}"` : ''}>${FG_PARTS[kind] || ''}</div>`;
}

function streakLines(color, rows = STREAK_ROWS, speedScale = 1) {
    return rows.map((y, i) => {
        const w = 30 + ((i * 17) % 41);
        const h = 1 + (i % 3);
        const t = Math.round((520 + (i % 4) * 130) / speedScale);
        const d = (i * 173) % 700;
        return `<i class="igs-cm-streak-line" style="--y:${y}%;--w:${w}%;--h:${h}px;--c:${color};--t:${t}ms;--d:${d}ms;--sx:${(i * 11) % 40}vw"></i>`;
    }).join('');
}

function bgStyle(env) {
    const layer = readStageBackground(env.root).bg;
    return layer && layer.visible ? layer.image.replace(/"/g, '&quot;') : '';
}

function titleCard(env, text, life) {
    if (!text) return '';
    const front = env.layers && env.layers.front;
    if (front && typeof front.querySelector === 'function' && front.querySelector('.igs-fx-title-card')) return '';
    return `<div class="igs-fx-title-card${env.ancient ? ' is-ancient' : ''}" data-igs-seal="${esc(Array.from(String(text))[0] || '')}" style="--igs-fx-life:${life}ms"><div class="igs-fx-title-main">${esc(text)}</div></div>`;
}

const POSITIONS = Object.freeze([[10, 8], [24, 70], [40, 20], [58, 78], [74, 16], [88, 66], [18, 40], [66, 44], [82, 84], [34, 54], [50, 6], [92, 30]]);

function sparkles(count) {
    return POSITIONS.slice(0, count).map(([x, y], i) => `<i class="igs-cm-star" style="--x:${x}%;--y:${y}%;--s:${10 + (i % 4) * 5}px;--t:${1400 + (i % 5) * 260}ms;--d:${(i * 190) % 900}ms"></i>`).join('');
}

function petals(count) {
    return POSITIONS.slice(0, count).map(([x], i) => `<i class="igs-cm-petal" style="--x:${x}%;--s:${12 + (i % 3) * 5}px;--t:${2600 + (i % 4) * 500}ms;--d:${(i * 260) % 1800}ms;--pc:${PETAL_COLORS[i % PETAL_COLORS.length]};--sy:${12 + (i * 7) % 60}%"></i>`).join('');
}

export const CAMERA_BUILDERS = {
    fg(item, env) {
        if (env.reduced) return null;
        const life = scaled(CAMERA_LIFE_MS[item.item] || CAMERA_LIFE_MS.leaf, env);
        return {
            layer: 'stage', life, sounds: [item.item === 'leaf' ? 'cm-leaf' : 'cm-swish'],
            node: shell(env, 'fgwrap', fgPiece(item.item, item.dir)),
        };
    },
    peek(item, env) {
        const corner = item.corner || 'bl';
        let body;
        if (item.object === 'door') {
            const rightSide = corner === 'tr' || corner === 'br';
            body = `<i class="igs-cm-door-slab is-l" style="--a:${rightSide ? 58 : 14}%"></i><i class="igs-cm-door-slab is-r" style="--b:${rightSide ? 14 : 58}%"></i>`;
        } else if (item.object === 'leaf') {
            body = `<div class="igs-cm-peek is-leaf is-${corner}">${PEEK_LEAF}</div>`;
        } else {
            body = `<div class="igs-cm-peek is-window is-${corner}"></div>`;
        }
        return { layer: 'stage', life: scaled(CAMERA_LIFE_MS.peek, env), sounds: item.object === 'leaf' ? ['cm-leaf'] : [], node: shell(env, 'peekwrap', body) };
    },
    flare(item, env) {
        const dir = item.dir === 'left' ? 'left' : 'right';
        const bokeh = BOKEH_SPOTS.map(([x, y, d], i) => `<i class="igs-cm-bokeh" style="--x:${x}%;--y:${y}%;--d:${d}vmin;animation-delay:${i * 180}ms"></i>`).join('');
        return {
            layer: 'stage', life: scaled(CAMERA_LIFE_MS.flare, env), sounds: ['cm-flare'],
            node: shell(env, 'flare', `<i class="igs-cm-flare-sweep"></i><i class="igs-cm-flare-core"></i>${bokeh}`, `is-${dir}`),
        };
    },
    streak(item, env) {
        const color = hexOrNamed(item.color) || '#ffffff';
        return {
            layer: 'under', life: scaled(CAMERA_LIFE_MS.streak, env), sounds: ['cm-whoosh'],
            node: shell(env, 'streakwrap', `<div class="igs-cm-streaks${item.dir === 'left' ? ' is-left' : ''}">${streakLines(color)}</div>`),
        };
    },
    bob(item, env) {
        const life = scaled(CAMERA_LIFE_MS.bob, env);
        if (!bobSprite(env, life)) return null;
        return { layer: 'stage', life, sounds: [], node: shell(env, 'bob') };
    },
    backdrop(item, env) {
        const color = hexOrNamed(item.color);
        const style = item.style || 'solid';
        const life = scaled(style === 'thunder' ? CAMERA_LIFE_MS.thunder : CAMERA_LIFE_MS.backdrop, env);
        let inner = '';
        let attr = '';
        let sounds = [];
        if (style === 'solid') attr = ` style="--c1:${color || '#ffd9e8'};--c2:#fff6e6"`;
        if (style === 'flowers') { inner = petals(10); sounds = ['cm-swish']; }
        if (style === 'sparkle') { inner = sparkles(12); sounds = ['cm-flare']; }
        if (style === 'thunder') { inner = `<div class="igs-cm-bolt"></div>`; sounds = ['cm-thunder']; }
        return { layer: 'under', life, sounds, node: shell(env, 'backwrap', `<div class="igs-cm-backdrop is-${style}"${attr}>${inner}</div>`) };
    },
    jcut() {
        return null;
    },
    lcut() {
        return null;
    },
    cut(item, env) {
        return { layer: 'stage', life: CAMERA_LIFE_MS.cut, sounds: ['cm-whoosh'], node: shell(env, 'cut') };
    },
    establish(item, env) {
        const life = scaled(CAMERA_LIFE_MS.establish, env);
        const place = String(item.place || (env.camera && env.camera.place) || '').trim();
        return { layer: 'stage', life, sounds: ['cm-title'], node: shell(env, 'establish', titleCard(env, place, life)) };
    },
    montage(item, env) {
        const n = clamp(Number(item.cells) || 3, 2, 4);
        const image = bgStyle(env);
        const cells = Array.from({ length: n }, (_, i) => {
            const f = CELL_FRAMES[i];
            const bg = image ? `<div class="igs-cm-cell-bg" style="inset:${f.t}% ${f.r}% ${f.b}% ${f.l}%;background-image:${image};background-size:cover;background-position:center;--dx:${f.dx}%;--dy:${f.dy}%"></div>` : '<div class="igs-cm-cell-bg" style="background:#3a3f4a"></div>';
            return `<div class="igs-cm-cell" style="--i:${i}">${bg}</div>`;
        }).join('');
        const node = shell(env, 'montage', cells, `is-n${n}`);
        const cellNodes = typeof node.querySelectorAll === 'function' ? Array.from(node.querySelectorAll('.igs-cm-cell')) : [];
        cellNodes.forEach((cell, i) => {
            if (i % 2 === 0 && i > 1) return;
            const crop = resolveRegionCrop(env.sprite || {}, CELL_REGIONS[i], CELL_RATIO[n], env.root.ownerDocument);
            const clone = cloneSpriteLayer(env.root, '', { speaker: env.speaker, crop });
            if (clone) cell.appendChild(clone);
        });
        return { layer: 'stage', life: scaled(n * 250 + CAMERA_LIFE_MS.montageTail, env), sounds: [`cm-montage-${n}`], node };
    },
    timelapse(item, env) {
        const target = item.target || 'dusk';
        const clouds = TL_CLOUDS.map(([y, d]) => `<i class="igs-cm-tl-cloud" style="--y:${y}%;--d:${d}ms"></i>`).join('');
        return {
            layer: 'stage', life: scaled(CAMERA_LIFE_MS.timelapse, env), sounds: ['cm-tick'],
            node: shell(env, 'tl', `<i class="igs-cm-tl-tint"></i>${clouds}<i class="igs-cm-tl-band"></i>`, `is-${target}`),
        };
    },
    split(item, env) {
        const image = bgStyle(env);
        const who = String(item.who || '').trim();
        const place = String(item.place || '').trim();
        const bg = image ? `<div class="igs-cm-split-bg" style="background-image:${image};background-size:cover;background-position:72% 38%"></div>` : '';
        const label = place || who;
        const node = shell(env, 'split', `<div class="igs-cm-split-panel">${bg}<div class="igs-cm-sprite-hush"></div></div><i class="igs-cm-split-line"></i>${label ? `<span class="igs-cm-split-tag">${esc(label)}</span>` : ''}`);
        const castHit = who && who !== env.speaker && typeof env.root.querySelectorAll === 'function'
            && Array.from(env.root.querySelectorAll('.igs-cast-sprite')).some((el) => el.getAttribute('data-igs-cast-char') === who);
        const host = castHit && typeof node.querySelector === 'function' ? node.querySelector('.igs-cm-sprite-hush') : null;
        if (host) {
            const crop = resolveRegionCrop(env.sprite || {}, 'face', 1.2, env.root.ownerDocument);
            const clone = cloneSpriteLayer(env.root, who, { speaker: env.speaker, crop });
            if (clone) {
                const box = make(env.doc, '');
                box.setAttribute('style', 'position:absolute;left:54%;right:0;top:0;bottom:0');
                box.appendChild(clone);
                host.appendChild(box);
            }
        }
        return { layer: 'stage', life: scaled(CAMERA_LIFE_MS.split, env), sounds: ['cm-whoosh'], node };
    },
    linger(item, env) {
        const what = item.what || 'window';
        const parts = {
            window: '<i class="igs-cm-linger-pane"><b></b><b></b><b></b><b></b></i>',
            shadow: '<i class="igs-cm-linger-shadow"></i>',
            headlight: '<i class="igs-cm-linger-head"></i>',
            curtain: '<i class="igs-cm-linger-curtain"></i>',
        };
        return {
            layer: what === 'curtain' ? 'stage' : 'under', life: scaled(CAMERA_LIFE_MS.linger, env), sounds: what === 'headlight' ? ['cm-whoosh'] : (what === 'curtain' ? ['cm-swish'] : []),
            node: shell(env, 'lingerwrap', `<div class="igs-cm-linger">${parts[what] || parts.window}</div>`),
        };
    },
    step(item, env) {
        walkSteps(env, { material: item.material, dir: item.dir, count: item.count, pair: item.pair });
        return { layer: 'stage', life: CAMERA_LIFE_MS.step, sounds: [], node: shell(env, 'step') };
    },
    walk(item, env) {
        const forest = item.mode !== 'side';
        const life = scaled(CAMERA_LIFE_MS.walk, env);
        const pieces = forest
            ? `${fgPiece('leaf', 'right', 300, 1900)}${fgPiece('leaf', 'left', 2400, 1900)}${fgPiece('leaf', 'right', 4000, 1700)}`
            : `${fgPiece('rail', 'right', 200, 2300)}${fgPiece('pole', 'right', 2700, 1500)}`;
        const dapples = forest ? DAPPLE_SPOTS.map(([x, y, d], i) => `<i class="igs-cm-dapple" style="--x:${x}%;--y:${y}%;--d:${d}vmin;--t:${-i * 600}ms"></i>`).join('') : '';
        const warm = forest ? '' : `<div class="igs-cm-streaks" style="animation-duration:${life}ms">${streakLines('#ffe2b0', STREAK_ROWS.slice(0, 4), 0.6)}</div>`;
        walkSteps(env, { material: forest ? 'grass' : '', dir: 'lr', count: 9, pair: !forest });
        return {
            layer: 'stage', life, sounds: forest ? ['cm-swish'] : [],
            node: shell(env, 'walk', env.reduced ? dapples : `${dapples}${warm}${pieces}`),
        };
    },
    chase(item, env) {
        const life = scaled(CAMERA_LIFE_MS.chase, env);
        const result = item.result || 'run';
        const streaks = `<div class="igs-cm-streaks" style="animation-duration:${life}ms">${streakLines('#ffffff', STREAK_ROWS, 1.4)}</div>`;
        const end = result === 'caught' ? '<i class="igs-cm-flash" style="--d:3000ms"></i>'
            : result === 'saved' ? '<i class="igs-cm-flare-sweep" style="animation-duration:1800ms;animation-delay:3000ms"></i>' : '';
        bobSprite(env, life);
        walkSteps(env, { material: '', dir: 'near', count: 10, pair: false });
        bodySounds(env, { ms: life, bpmFrom: 98, bpmTo: 152, stopAtMs: result === 'caught' ? 3000 : 0 });
        const sounds = result === 'escape' ? ['cm-chase-escape'] : result === 'caught' ? ['cm-chase-caught'] : result === 'saved' ? ['cm-chase-saved'] : ['cm-whoosh'];
        return {
            layer: 'stage', life, sounds,
            node: shell(env, 'chase', `<i class="igs-cm-vignette"></i><i class="igs-cm-pulse"></i>${streaks}${end}`),
        };
    },
    sneak(item, env) {
        const life = scaled(CAMERA_LIFE_MS.sneak, env);
        dispatchMuffle(env.doc, true, life);
        walkSteps(env, { material: '', dir: 'far', count: 6, pair: false, side: 1 });
        bodySounds(env, { ms: life, bpmFrom: 70, bpmTo: 96, muffled: true });
        const door = '<i class="igs-cm-door-slab is-l" style="--a:12%"></i><i class="igs-cm-door-slab is-r" style="--b:56%"></i>';
        return { layer: 'stage', life, sounds: ['cm-gasp'], node: shell(env, 'sneak', `<i class="igs-cm-vignette"></i><i class="igs-cm-pulse" style="animation-duration:1.1s"></i>${door}`) };
    },
    seeoff(item, env) {
        const dir = item.dir === 'left' ? 'left' : 'right';
        walkSteps(env, { material: '', dir: 'far', count: 7, pair: false, side: dir === 'left' ? -1 : 1 });
        return {
            layer: 'stage', life: scaled(CAMERA_LIFE_MS.seeoff, env), sounds: [],
            node: shell(env, 'seeoff', `<i class="igs-cm-drain" style="--to:${dir === 'left' ? 'right' : 'left'}"></i>`),
        };
    },
    enterroom(item, env) {
        const life = scaled(CAMERA_LIFE_MS.enterroom, env);
        walkSteps(env, { material: 'hall', dir: 'near', count: 5, pair: false });
        return {
            layer: 'stage', life, sounds: ['cm-door'],
            node: shell(env, 'enterroom', `<i class="igs-cm-doorlight"></i>${titleCard(env, String(item.room || '').trim(), life)}`),
        };
    },
};
