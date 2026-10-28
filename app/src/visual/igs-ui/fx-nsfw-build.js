// 直白亲密包的构建器。每个 builder 返回 { layer, life, sounds, node }，减少动态效果时返回静态节点；life 乘 env.hold。
// 立绘相关的位置一律由 stage-snapshot 读当前 DOM 的头部锚点，不读像素。
import { esc } from './reader-value-utils.js';
import { make } from './fx-daily-kit.js';
import { rollNumber } from './fx-ticker.js';
import { drawLinks } from './fx-links.js';
import { spawnMist } from './fx-mist.js';
import { readStageBackground, resolveHeadAnchor } from './stage-snapshot.js';
import { HEAD_ASPECT } from './fx-anchor.js';
import { at, atFilter, clampNum, headPoint, reactSprite, roundTo } from './fx-sprite-react.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round = (n) => Math.round(n * 10) / 10;
const lifeOf = (ms, env) => Math.round(ms * (env.hold > 0 ? env.hold : 1));
const signed = (n) => `${n > 0 ? '+' : ''}${Math.round(n)}`;
const skin = (env, extra = '') => [env.ancient ? 'is-ancient' : '', extra].filter(Boolean).join(' ');

export const PEAK_WORDS = Object.freeze(['嗯…', '啊——', '——！']);
const PEAK_LIFE = Object.freeze([2600, 3400, 4400]);
const PEAK_SHAKE_PX = Object.freeze([2, 4, 7]);
const lastPeak = new WeakMap();

// 契约印记读取：同一舞台最近一次高潮的档位。
export function lastPeakTier(root) {
    return lastPeak.get(root) || 0;
}

function shakeStage(env, tier) {
    const motion = env.root.querySelector('#igs-stage-motion');
    if (!motion || typeof motion.animate !== 'function') return;
    const amp = PEAK_SHAKE_PX[tier - 1];
    const frames = [0, -1, 0.9, -0.7, 0.5, -0.3, 0].map((k, i) => ({ translate: `${round(k * amp)}px ${round((i % 2 ? -0.5 : 0.5) * k * amp)}px` }));
    try {
        motion.animate(frames, { duration: 260 + tier * 120, easing: 'ease-out' });
    } catch { /* 不支持独立 translate 时不震 */ }
}

function peak(item, env) {
    const tier = clamp(Math.round(item.tier) || 2, 1, 3);
    const word = esc(item.word || PEAK_WORDS[tier - 1]);
    lastPeak.set(env.root, tier);
    const sounds = [`nsfw-peak${tier}`];
    if (env.reduced) {
        return { layer: 'front', life: lifeOf(2200, env), sounds, node: make(env.doc, `igs-dfx igs-nfx igs-nfx-peak is-t${tier}`, `<div class="igs-nfx-word"><span>${word}</span></div>`) };
    }
    shakeStage(env, tier);
    return {
        layer: 'front', life: lifeOf(PEAK_LIFE[tier - 1], env), sounds,
        node: make(env.doc, `igs-dfx igs-nfx igs-nfx-peak is-t${tier}`, `<div class="igs-nfx-flash"></div><div class="igs-nfx-pulse"></div><div class="igs-nfx-word"><span>${word}</span></div>`),
    };
}

const counted = new WeakMap();
const TALLY_MAX = 20;

// 计数牌：五画一组的刻痕，新增的刻痕按节拍逐笔落下；高潮档位越高，牌边越亮。
function tallyHtml(count, prev, reduced) {
    const shown = Math.min(count, TALLY_MAX);
    const from = Number.isFinite(prev) && prev < count && !reduced ? Math.min(prev, TALLY_MAX) : shown;
    const groups = [];
    for (let i = 0; i < shown; i += 5) {
        const size = Math.min(5, shown - i);
        const marks = Array.from({ length: size }, (_, k) => {
            const index = i + k;
            const fresh = index >= from;
            const style = fresh ? ` style="--igs-nfx-i:${index - from}"` : '';
            return `<i class="igs-nfx-tick${k === 4 ? ' is-slash' : ''}${fresh ? ' is-new' : ''}"${style}></i>`;
        }).join('');
        groups.push(`<span class="igs-nfx-tally-group">${marks}</span>`);
    }
    return groups.join('');
}

function counter(item, env) {
    const count = clamp(Math.round(item.count) || 0, 0, 999);
    const unit = esc(item.unit || '次');
    const prev = counted.get(env.root);
    counted.set(env.root, count);
    const tier = lastPeakTier(env.root);
    const rising = Number.isFinite(prev) && prev < count;
    const node = make(env.doc, `igs-dfx igs-nfx igs-nfx-counter ${skin(env, tier ? `is-t${tier}` : '')}`, `<div class="igs-nfx-count${rising ? ' is-rising' : ''}"><div class="igs-nfx-tally">${tallyHtml(count, prev, env.reduced)}</div><div class="igs-nfx-count-row"><b class="igs-nfx-count-n">${count}</b><span class="igs-nfx-count-u">${unit}</span></div></div>`);
    const target = node.querySelector && node.querySelector('.igs-nfx-count-n');
    if (target && rising && !env.reduced) rollNumber(target, prev, count, 700);
    return { layer: 'front', life: lifeOf(3600, env), sounds: prev !== count ? ['nsfw-count'] : [], node };
}

const SHEET_SVG = '<svg viewBox="0 0 120 70" aria-hidden="true"><path d="M0 70V34Q14 24 30 30T62 24Q82 20 96 34T120 40V70Z" fill="#e9e1d6"/><path d="M0 70V50Q16 42 34 48T70 44Q92 42 120 52V70Z" fill="#d6cbbd"/><path d="M30 30Q40 40 36 54M62 24Q72 36 68 46" fill="none" stroke="#b9ab9a" stroke-width="1.6" stroke-linecap="round"/></svg>';

// 余温：暗角收拢、立绘慢呼吸、额侧汗光、画角一抹凌乱的被单，底边一条时间推移的细线。
function aftermath(item, env) {
    const caption = item.text ? `<div class="igs-nfx-after-text">${esc(item.text)}</div>` : '';
    const head = headPoint(env, env.speaker);
    const drops = [[-0.28, 0.1], [0.3, 0.32], [-0.1, 0.62]].map(([dx, dy], i) => `<i class="igs-nfx-sweat" style="left:${roundTo(clampNum(head.x + dx * head.d, 3, 97))}%;top:${roundTo(clampNum(head.y + (dy - 0.3) * head.d * 1.4, 3, 90))}%;--igs-nfx-i:${i}"></i>`).join('');
    const node = make(env.doc, `igs-dfx igs-nfx igs-nfx-after ${skin(env)}`, `<div class="igs-nfx-afterglow"></div><div class="igs-nfx-sweats">${drops}</div><div class="igs-nfx-sheet">${SHEET_SVG}</div><div class="igs-nfx-after-time"><i></i></div>${caption}`);
    const life = lifeOf(7000, env);
    reactSprite(env, env.speaker, [at(0, 'translate(0,0) scale(1)'), at(0.5, 'translate(0,.5%) scale(1.006,1.01)'), at(1, 'translate(0,0) scale(1)')], { duration: 2600, iterations: Math.max(1, Math.floor(life / 2600)) });
    return { layer: 'front', life, sounds: ['nsfw-after'], node };
}

// 床幔：不画帐子与烛台。整台暖色温加收窄的暗角，两侧边缘各一抹极淡的暖光，古代偏暖橙，现代偏暖白。
function bedcurtain(item, env) {
    const caption = item.text ? `<div class="igs-nfx-curtain-text">${esc(item.text)}</div>` : '';
    const ancient = env.ancient === true || env.worldview === 'magic' || env.worldview === 'fantasy';
    return {
        layer: 'front', life: lifeOf(7200, env), sounds: ['nsfw-curtain'],
        node: make(env.doc, `igs-dfx igs-nfx igs-nfx-bed ${ancient ? 'is-ancient' : 'is-modern'}`, `<div class="igs-nfx-bed-tone"></div><div class="igs-nfx-bed-vig"></div><div class="igs-nfx-bed-glow is-l"><i></i></div><div class="igs-nfx-bed-glow is-r"><i></i></div>${caption}`),
    };
}

// 两人头部锚点；缺一方时另一方镜像到对侧，避免两端重合。
function pairAnchors(env, a, b) {
    const first = resolveHeadAnchor(env, a || env.speaker);
    const second = b ? resolveHeadAnchor(env, b) : { ...first, x: 100 - first.x };
    return { first, second: Math.abs(first.x - second.x) < 4 ? { ...second, x: clamp(100 - first.x, 8, 92) } : second };
}

function dualcult(item, env) {
    const { first, second } = pairAnchors(env, item.from, item.to);
    const delta = Number(item.delta) || 0;
    const node = make(env.doc, 'igs-dfx igs-nfx igs-nfx-cult');
    drawLinks(node, [
        { from: { x: first.x, y: first.y }, to: { x: second.x, y: second.y }, tone: 'amber', style: 'mist' },
        { from: { x: second.x, y: second.y }, to: { x: first.x, y: first.y }, tone: 'amber', style: 'line' },
    ], env, { reduced: env.reduced });
    const mx = round((first.x + second.x) / 2);
    const my = round(Math.min(first.y, second.y) - 7);
    const label = make(env.doc, 'igs-nfx-cult-label', `<span>修为</span><b>${signed(env.reduced ? delta : 0)}</b>`);
    label.setAttribute('style', `left:${mx}%;top:${my}%`);
    node.appendChild(label);
    const target = label.querySelector && label.querySelector('b');
    if (target && !env.reduced) rollNumber(target, 0, delta, 1200, { format: signed });
    return { layer: 'front', life: lifeOf(4800, env), sounds: ['nsfw-cult'], node };
}

// 系统浮窗：锚在目标立绘头侧（靠舞台中线的一侧让位），标题条、数值滚动、好感条；涨时立绘微微泛红，降时轻缩。
function favortip(item, env) {
    const delta = Number(item.delta) || 0;
    const who = item.who || env.speaker;
    const name = item.who ? `${esc(item.who)}　好感度` : '好感度';
    const total = item.total != null && Number.isFinite(Number(item.total)) ? clamp(Math.round(Number(item.total)), 0, 100) : null;
    const bar = total == null ? '' : `<i class="igs-nfx-tip-bar"><i style="width:${total}%"></i></i><em class="igs-nfx-tip-total">${total}</em>`;
    const head = headPoint(env, who);
    const side = head.x < 50 ? 1 : -1;
    const left = roundTo(clampNum(head.x + side * (head.d * 0.75 + 11), 14, 86));
    const top = roundTo(clampNum(head.y - head.d * 0.5, 6, 54));
    const arrow = delta < 0 ? '▼' : '▲';
    const node = make(env.doc, `igs-dfx igs-nfx igs-nfx-tip ${delta < 0 ? 'is-down' : 'is-up'} ${side > 0 ? 'is-right' : 'is-left'}`, `<div class="igs-nfx-tip-card" style="left:${left}%;top:${top}%"><div class="igs-nfx-tip-title"><i></i>系统提示</div><div class="igs-nfx-tip-body"><span class="igs-nfx-tip-name">${name}</span><span class="igs-nfx-tip-num"><em class="igs-nfx-tip-arrow">${arrow}</em><b class="igs-nfx-tip-delta">${signed(env.reduced ? delta : 0)}</b></span>${bar}</div></div>`);
    const target = node.querySelector && node.querySelector('.igs-nfx-tip-delta');
    if (target && !env.reduced) rollNumber(target, 0, delta, 600, { format: signed });
    if (delta < 0) reactSprite(env, who, [at(0, 'translate(0,0) scale(1)'), at(0.4, 'translate(0,.6%) scale(.985)'), at(1, 'translate(0,0) scale(1)')], { duration: 700, easing: 'ease-out' });
    else reactSprite(env, who, [atFilter(0, 'saturate(1) brightness(1)'), atFilter(0.3, 'saturate(1.25) brightness(1.05) hue-rotate(-6deg)'), atFilter(1, 'saturate(1) brightness(1)')], { duration: 1500 });
    return { layer: 'front', life: lifeOf(3200, env), sounds: [delta < 0 ? 'nsfw-tip-down' : 'nsfw-tip'], node };
}

const SIGIL_POINTS = Array.from({ length: 5 }, (_, i) => {
    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    return `${round(50 + Math.cos(a) * 31)},${round(50 + Math.sin(a) * 31)}`;
}).join(' ');
const SIGIL_TICKS = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12;
    return `<line x1="${round(50 + Math.cos(a) * 41)}" y1="${round(50 + Math.sin(a) * 41)}" x2="${round(50 + Math.cos(a) * 44)}" y2="${round(50 + Math.sin(a) * 44)}"/>`;
}).join('');
const SIGIL_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="38"/><polygon points="${SIGIL_POINTS}"/><g>${SIGIL_TICKS}</g></svg>`;

function sigil(item, env) {
    const tier = clamp(Math.round(item.tier) || lastPeakTier(env.root) || 2, 1, 3);
    const a = resolveHeadAnchor(env, item.who || env.speaker);
    const aspect = readStageBackground(env.root).aspect || 16 / 9;
    const size = round(clamp(a.d * 1.7, 8, 30));
    const y = round(clamp(a.y + a.d * aspect * HEAD_ASPECT * 1.35, 10, 90));
    const node = make(env.doc, `igs-dfx igs-nfx igs-nfx-sigil is-t${tier}`, `<div class="igs-nfx-sigil-mark" style="left:${round(a.x)}%;top:${y}%;width:${size}%">${SIGIL_SVG}</div>`);
    return { layer: 'stage', life: lifeOf(5200, env), sounds: ['nsfw-sigil'], node };
}

function footfall(item, env) {
    const leave = item.dir === 'leave';
    const node = make(env.doc, `igs-dfx igs-nfx igs-nfx-foot ${leave ? 'is-leave' : 'is-near'}`, '<div class="igs-nfx-crack"><i class="igs-nfx-shoe is-a"></i><i class="igs-nfx-shoe is-b"></i></div>');
    return { layer: 'front', life: lifeOf(3800, env), sounds: [leave ? 'nsfw-footfall-leave' : 'nsfw-footfall'], node };
}

function knotafter(item, env) {
    const { first, second } = pairAnchors(env, '', item.target);
    const node = make(env.doc, 'igs-dfx igs-nfx igs-nfx-knot', '<div class="igs-nfx-knotglow"></div>');
    spawnMist(node, { x: first.x, y: first.y + 6, size: 40, color: '#e8a76a', drift: 4 }, { reduced: env.reduced });
    spawnMist(node, { x: second.x, y: second.y + 6, size: 36, color: '#e58fb0', drift: -4 }, { reduced: env.reduced });
    drawLinks(node, [{ from: { x: first.x, y: first.y }, to: { x: second.x, y: second.y }, tone: 'amber', style: 'mist' }], env, { reduced: env.reduced });
    if (item.text) node.appendChild(make(env.doc, 'igs-nfx-after-text', esc(item.text)));
    return { layer: 'front', life: lifeOf(7000, env), sounds: ['nsfw-knot'], node };
}

const ECG = 'M0 20H30L34 20L38 6L43 34L47 14L50 20H70L74 20L78 8L83 32L87 16L90 20H120';

function conceive(item, env) {
    const bpm = clamp(Math.round(item.bpm) || 150, 60, 220);
    const caption = item.text ? `<small class="igs-nfx-fetal-text">${esc(item.text)}</small>` : '';
    const period = Math.round(6000 / bpm) / 100;
    const head = headPoint(env, env.speaker);
    const aspect = readStageBackground(env.root).aspect || 16 / 9;
    const belly = roundTo(clampNum(head.y + head.d * aspect * HEAD_ASPECT * 3.3, 24, 86));
    const glow = `<div class="igs-nfx-fetal-glow" style="left:${roundTo(head.x)}%;top:${belly}%;width:${roundTo(clampNum(head.d * 1.5, 9, 30))}%;--igs-nfx-bpm:${period}s"><i></i></div>`;
    const node = make(env.doc, 'igs-dfx igs-nfx igs-nfx-fetal', `${glow}<div class="igs-nfx-fetal-card" style="--igs-nfx-bpm:${period}s"><svg viewBox="0 0 120 40" aria-hidden="true"><path pathLength="1" d="${ECG}"/></svg><span class="igs-nfx-fetal-k">胎心</span><b class="igs-nfx-fetal-n">${env.reduced ? bpm : 0}</b><span class="igs-nfx-fetal-u">次/分</span><i class="igs-nfx-fetal-dot"></i>${caption}</div>`);
    const target = node.querySelector && node.querySelector('.igs-nfx-fetal-n');
    if (target && !env.reduced) rollNumber(target, 0, bpm, 900);
    return { layer: 'front', life: lifeOf(5200, env), sounds: ['nsfw-fetal'], node };
}

export const NSFW_BUILDERS = Object.freeze({ peak, counter, aftermath, bedcurtain, dualcult, favortip, sigil, footfall, knotafter, conceive });
