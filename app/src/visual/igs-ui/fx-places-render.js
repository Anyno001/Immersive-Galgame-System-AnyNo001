import { prepareAncientPanel } from './ancient-panel-layout.js';
// 地点与场景包的演出构建器。每个返回 { layer, life, sounds, node }；reduced 时基础态即终态（样式里动画只负责入场）。
import { esc } from './reader-value-utils.js';
import { noteGlyph } from './fx-glyphs.js';
import { make } from './fx-daily-kit.js';
import { setVoiceFilter } from './voice-filter.js';
import { CHEST_GRADES, QUEST_STATES, floorFrames, scoreParts } from './fx-places-model.js';
import { HAND_FRAMES, HAND_PERIOD_MS } from './camera-shots.js';
import { pushStage } from './fx-sprite-react.js';

export const PLACES_LIFE_MS = Object.freeze({
    elevator: 3800, eavesdrop: 4600, concert: 5200, flashes: 900, raceStart: 3000, raceFinish: 3200, raceScore: 3400,
    chest: 4400, levelup: 3600, quest: 3600, route: 4200, gust: 5200,
});
const FLASH_STEP_MS = 340;
const FLASH_SPOTS = Object.freeze([[18, 30], [72, 24], [44, 52], [84, 56], [28, 66], [58, 34], [10, 54], [66, 68], [38, 22]]);
const STICK_COLORS = Object.freeze(['#ffd9b0', '#cfe0ff', '#fff1c4', '#ffe0ea']);
const STICK_SPOTS = Object.freeze([6, 14, 22, 30, 38, 46, 54, 62, 70, 78, 86, 94]);
const GRADE_NAMES = Object.freeze({ common: '普通', rare: '稀有', epic: '史诗', legend: '传说' });
const STATE_NAMES = Object.freeze({ take: '已接取', done: '已完成', fail: '已失败' });
const ROUTE_YS = Object.freeze([68, 36, 62, 30, 64, 38]);
const MUFFLE_EVENT = 'igs-ambient-muffle';

let voiceTimer = null;

const scaled = (ms, env) => Math.round(ms * Math.max(1, env.hold || 1));

function shell(env, name, html, extra = '') {
    const cls = ['igs-dfx', 'igs-pl', `igs-pl-${name}`, extra, env.ancient && 'is-ancient', env.reduced && 'is-reduced'].filter(Boolean).join(' ');
    return make(env.doc, cls, html);
}

function dispatchMuffle(doc, on, ms) {
    if (!doc || typeof doc.dispatchEvent !== 'function' || typeof globalThis.CustomEvent !== 'function') return;
    try { doc.dispatchEvent(new globalThis.CustomEvent(MUFFLE_EVENT, { detail: { on, ms } })); } catch { /* 无事件环境 */ }
}

function holdMuffle(env, ms) {
    setVoiceFilter('muffled', 'places');
    dispatchMuffle(env.doc, true, ms);
    if (voiceTimer) globalThis.clearTimeout(voiceTimer);
    voiceTimer = globalThis.setTimeout(() => {
        voiceTimer = null;
        setVoiceFilter('none', 'places');
    }, ms);
}

function sideOf(text) {
    const m = String(text || '').trim().match(/^(.*?)[\s:：×x]*(\d{1,3})$/);
    return m ? { name: m[1].trim().slice(0, 8), score: m[2] } : { name: String(text || '').trim().slice(0, 8), score: '-' };
}

function lowQuality(env) {
    const root = env.root;
    return Boolean(root && typeof root.getAttribute === 'function' && root.getAttribute('data-igs-quality') === 'low');
}

// 整台舞台上的一次性镜头动作（叠加合成，结束自动还原）；减少动态效果与低画质不做。
function stageAnimate(env, frames, options) {
    if (env.reduced || lowQuality(env) || !env.root || typeof env.root.querySelector !== 'function') return;
    const motion = env.root.querySelector('#igs-stage-motion');
    if (!motion || typeof motion.animate !== 'function') return;
    try { motion.animate(frames, { composite: 'add', fill: 'none', ...options }); } catch { /* 无 WAAPI */ }
}

// 偷看的聚焦与手持轻晃：推近一点，再叠有限轮的手持抖动（不循环）。
function peekFocus(env, life) {
    pushStage(env, { scale: 1.025, duration: Math.round(life * 0.9) });
    stageAnimate(env, HAND_FRAMES, { duration: HAND_PERIOD_MS, iterations: Math.max(1, Math.ceil(life / HAND_PERIOD_MS)), easing: 'ease-in-out' });
}

export const PLACES_BUILDERS = {
    elevator(item, env) {
        const frames = floorFrames(item.floor);
        const down = /^B/i.test(frames[0]) || (frames.length > 1 && Number(frames[0]) > Number(frames[frames.length - 1]));
        const n = frames.length;
        const strip = `<span class="igs-pl-strip" style="--n:${n};animation-timing-function:steps(${Math.max(1, n - 1)},end)">${frames.map((f) => `<span>${esc(f)}</span>`).join('')}</span>`;
        const arrow = n > 1 ? `<b class="igs-pl-elev-arrow${down ? ' is-down' : ''}"></b>` : '';
        const life = scaled(PLACES_LIFE_MS.elevator, env);
        // 门开的那一刻（样式里 44%）整台轻微一顿：电梯到站的顿挫。
        stageAnimate(env, [{ translate: '0 0' }, { translate: '0 1.1%' }, { translate: '0 -0.3%' }, { translate: '0 0' }], { duration: 320, delay: Math.round(life * 0.44), easing: 'ease-out' });
        return {
            layer: 'stage', life, sounds: ['pl-doors', 'pl-ding'],
            node: shell(env, 'elevator', `<div class="igs-pl-door is-l"></div><div class="igs-pl-door is-r"></div><div class="igs-pl-elev-lamp">${arrow}<span class="igs-pl-elev-window">${strip}</span></div>`),
        };
    },
    eavesdrop(item, env) {
        const life = scaled(PLACES_LIFE_MS.eavesdrop, env);
        holdMuffle(env, life);
        peekFocus(env, life);
        const heard = item.heard ? `<div class="igs-pl-heard">${esc(item.heard)}</div>` : '<div class="igs-pl-heard">……</div>';
        return {
            layer: 'stage', life, sounds: ['pl-eaves', 'cm-creak'],
            node: shell(env, 'eavesdrop', `<div class="igs-pl-crack is-l"></div><div class="igs-pl-crack is-r"></div>${heard}`),
        };
    },
    concert(item, env) {
        const sticks = STICK_SPOTS.map((x, i) => `<b class="igs-pl-stick" style="--x:${x}%;--c:${STICK_COLORS[i % STICK_COLORS.length]};--d:${(i % 5) * 140}ms;--r:${i % 2 ? 14 : -14}deg"></b>`).join('');
        const song = item.song ? `<div class="igs-pl-song">${noteGlyph(0)} ${esc(item.song)}</div>` : '';
        return {
            layer: 'stage', life: scaled(PLACES_LIFE_MS.concert, env), sounds: ['pl-cheer'],
            node: shell(env, 'concert', `<i class="igs-pl-spot is-a"></i><i class="igs-pl-spot is-b"></i><i class="igs-pl-spot is-c"></i>${song}<div class="igs-pl-crowd">${sticks}</div>`),
        };
    },
    flashes(item, env) {
        const count = Math.min(FLASH_SPOTS.length, Math.max(3, Number(item.count) || 6));
        const spots = (env.reduced ? FLASH_SPOTS.slice(0, 3) : FLASH_SPOTS.slice(0, count))
            .map(([x, y], i) => `<i class="igs-pl-flash" style="left:${x}%;top:${y}%;animation-delay:${i * FLASH_STEP_MS}ms"></i>`).join('');
        return {
            layer: 'front', life: scaled(count * FLASH_STEP_MS + PLACES_LIFE_MS.flashes, env), sounds: ['pl-flashes'],
            node: shell(env, 'flashes', `<i class="igs-pl-flashwash" style="animation-duration:${count * FLASH_STEP_MS}ms"></i>${spots}`),
        };
    },
    race(item, env) {
        if (item.phase === 'finish') {
            const who = item.a ? `<span class="igs-pl-race-who">${esc(item.a)}</span>` : '';
            const time = item.b ? `<span class="igs-pl-race-time">${esc(item.b)}</span>` : '';
            return {
                layer: 'front', life: scaled(PLACES_LIFE_MS.raceFinish, env), sounds: ['pl-whistle', 'pl-finish'],
                node: shell(env, 'race', `<div class="igs-pl-tape"><i class="is-l"></i><i class="is-r"></i></div><div class="igs-pl-race-text is-finish"><b>冲线</b>${who}${time}</div>`, 'is-finish'),
            };
        }
        if (item.phase === 'score') {
            let left = sideOf(item.a);
            let right = sideOf(item.b);
            const joined = scoreParts(item.a);
            if (joined && !item.b) {
                left = { name: '', score: String(joined[0]) };
                right = { name: '', score: String(joined[1]) };
            }
            const side = (s, cls) => `<div class="igs-pl-side ${cls}">${s.name ? `<em>${esc(s.name)}</em>` : ''}<b>${esc(s.score)}</b></div>`;
            return {
                layer: 'front', life: scaled(PLACES_LIFE_MS.raceScore, env), sounds: ['pl-whistle'],
                node: shell(env, 'race', `<div class="igs-pl-board">${side(left, 'is-a')}<span class="igs-pl-colon">:</span>${side(right, 'is-b')}</div>`, 'is-score'),
            };
        }
        const label = item.a ? `<span class="igs-pl-race-who">${esc(item.a)}</span>` : '';
        return {
            layer: 'front', life: scaled(PLACES_LIFE_MS.raceStart, env), sounds: ['pl-gun'],
            node: shell(env, 'race', `<div class="igs-pl-lamps"><i></i><i></i><i></i></div><div class="igs-pl-race-text is-start"><span class="igs-pl-ready">预备</span><b class="igs-pl-go">起跑</b>${label}</div>`, 'is-start'),
        };
    },
    chest(item, env) {
        const grade = Object.values(CHEST_GRADES).includes(item.grade) ? item.grade : 'common';
        const name = item.item ? esc(item.item) : '';
        return {
            layer: 'front', life: scaled(PLACES_LIFE_MS.chest, env), sounds: ['pl-chest'],
            node: shell(env, 'chest', `<div class="igs-pl-chestbox is-${grade}"><i class="igs-pl-beam"></i><div class="igs-pl-ch-item"><small>${GRADE_NAMES[grade]}</small>${name ? `<span>${name}</span>` : ''}</div></div>`),
        };
    },
    levelup(item, env) {
        const level = Math.max(1, Number(item.level) || 1);
        const frames = level > 1 ? [level - 1, level] : [level];
        const strip = `<span class="igs-pl-strip is-lv" style="--n:${frames.length};animation-timing-function:steps(${Math.max(1, frames.length - 1)},end)">${frames.map((f) => `<span>${f}</span>`).join('')}</span>`;
        const reward = item.reward ? `<div class="igs-pl-lv-reward">${esc(item.reward)}</div>` : '';
        const sparks = Array.from({ length: 8 }, (_, i) => `<i class="igs-pl-spark" style="--x:${12 + i * 11}%;--d:${(i % 4) * 160}ms"></i>`).join('');
        return {
            layer: 'front', life: scaled(PLACES_LIFE_MS.levelup, env), sounds: ['pl-levelup'],
            node: shell(env, 'levelup', `<div class="igs-pl-lv"><div class="igs-pl-lv-title">${env.ancient ? '境界提升' : 'LEVEL UP'}</div><div class="igs-pl-lv-num"><small>${env.ancient ? '第' : 'Lv.'}</small><span class="igs-pl-lv-win">${strip}</span>${env.ancient ? '<small>重</small>' : ''}</div>${reward}${sparks}</div>`),
        };
    },
    quest(item, env) {
        const state = Object.values(QUEST_STATES).includes(item.state) ? item.state : 'take';
        const kind = env.ancient || env.worldview === 'magic' || env.worldview === 'fantasy' ? 'is-scroll' : 'is-board';
        const title = esc(item.title);
        const reward = item.reward ? `<div class="igs-pl-q-reward"><small>${state === 'fail' ? '落空' : '报酬'}</small><span>${esc(item.reward)}</span></div>` : '';
        const head = env.ancient ? '悬赏榜' : (kind === 'is-scroll' ? '任务卷轴' : '委托板');
        const mark = state === 'done' ? '<svg class="igs-pl-q-check" viewBox="0 0 40 40" aria-hidden="true"><path pathLength="1" d="M7 21l9 9L33 9"/></svg>'
            : (state === 'fail' ? '<svg class="igs-pl-q-cross" viewBox="0 0 40 40" aria-hidden="true"><path pathLength="1" d="M8 8l24 24"/><path pathLength="1" d="M32 8L8 32"/></svg>' : '');
        const html = `<div class="igs-pl-q ${kind} is-${state}"><div class="igs-pl-q-paper"><div class="igs-pl-q-head">${head}</div><div class="igs-pl-q-title">${title}</div>${reward}${mark}<div class="igs-pl-stamp is-${state}">${STATE_NAMES[state]}</div></div></div>`;
        const node = shell(env, 'quest', html);
        if (env.ancient) prepareAncientPanel(node);
        return { layer: 'front', life: scaled(PLACES_LIFE_MS.quest, env), sounds: [`pl-quest-${state}`], node };
    },
    route(item, env) {
        const stops = (item.stops || []).slice(0, 6);
        const n = stops.length;
        const pts = stops.map((_, i) => [Math.round(14 + i * (272 / Math.max(1, n - 1))), ROUTE_YS[i % ROUTE_YS.length] + 20]);
        const marks = pts.map(([x, y], i) => `<circle class="igs-pl-pin${i === n - 1 ? ' is-end' : ''}" cx="${x}" cy="${y}" r="${i === n - 1 ? 7 : 5}" style="animation-delay:${Math.round(500 + i * (2000 / n))}ms"/>`).join('');
        const labels = pts.map(([x, y], i) => `<span class="igs-pl-stop ${y > 90 ? 'is-up' : ''}" style="left:${(x / 300 * 100).toFixed(1)}%;top:${(y / 180 * 100).toFixed(1)}%;animation-delay:${Math.round(500 + i * (2000 / n))}ms">${esc(stops[i])}</span>`).join('');
        const tone = env.ancient ? 'is-ancient-map' : (env.worldview === 'magic' || env.worldview === 'fantasy' ? 'is-parchment' : 'is-modern');
        return {
            layer: 'front', life: scaled(PLACES_LIFE_MS.route, env), sounds: ['pl-route'],
            node: shell(env, 'route', `<div class="igs-pl-map ${tone}"><svg viewBox="0 0 300 180" aria-hidden="true"><polyline class="igs-pl-path" pathLength="1" points="${pts.map((p) => p.join(',')).join(' ')}"/>${marks}</svg>${labels}</div>`),
        };
    },
    gust(item, env) {
        const life = scaled(PLACES_LIFE_MS.gust, env);
        const sprite = env.root && typeof env.root.querySelector === 'function' ? env.root.querySelector('#igs-sprite') : null;
        if (!env.reduced && !lowQuality(env) && sprite && typeof sprite.animate === 'function') {
            const period = 2600;
            try {
                sprite.animate([{ translate: '-0.3% 0', rotate: '-0.25deg' }, { translate: '0.45% 0', rotate: '0.3deg' }], {
                    duration: period, iterations: Math.max(1, Math.ceil(life / period)), direction: 'alternate', easing: 'ease-in-out',
                });
            } catch { /* 不支持单项变换属性时只留风线 */ }
        }
        const streaks = Array.from({ length: 5 }, (_, i) => `<i class="igs-pl-streak" style="top:${14 + i * 15}%;animation-delay:${i * 380}ms;width:${28 + (i % 3) * 12}%"></i>`).join('');
        return { layer: 'stage', life, sounds: ['pl-breeze'], node: shell(env, 'gust', streaks) };
    },
};
