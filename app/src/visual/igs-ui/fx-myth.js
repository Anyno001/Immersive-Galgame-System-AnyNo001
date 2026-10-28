// 神话妖魔包的演出构建器：法宝、封神榜、阵法、真火天雷、妖气魅惑、吸取、降妖、结界、妖丹、血契。
// 每个构建器返回 { node, life, layer, sounds }；减少动态效果时只留静止的终态，不起动画。
import { esc } from './reader-value-utils.js';
import { charSpans, make } from './fx-daily-kit.js';
import { resolveHeadAnchor, spriteElOf } from './stage-snapshot.js';
import { drawLinks } from './fx-links.js';
import { spawnMist } from './fx-mist.js';
import { absorbCreatureSprite, foeElementOf } from './fx-creature-battle.js';
import { MANGA_SYMBOL_SVG, MARK_SYMBOL_SVG } from './fx-symbols.js';
import { SPRITE_ACTION_FRAMES } from './sprite-actions.js';
import { pushStage } from './fx-sprite-react.js';

export const MYTH_LIFE_MS = Object.freeze({
    relic: 3000, clash: 3200, mythroll: 3000, formation: 3800, flame: 3200, thunder: 2200, aura: 3600,
    charm: 3400, drain: 3400, subdue: 3000, barrier: 3000, core: 3600, pact: 3400,
});

// 封印类字卡文字，便于以后调整。
export const SEAL_CARDS = Object.freeze({ talisman: '封', bowl: '金钵', gourd: '收', chain: '锁' });
export const PACT_CARD = '血契';
const SEAL_TONES = Object.freeze(['gold', 'azure', 'crimson', 'violet', 'silver', 'jade']);
const NAME_TONES = Object.freeze([[/[血赤红]/, 'crimson'], [/[青碧]/, 'azure'], [/紫/, 'violet'], [/[玄黑]/, 'violet'], [/[玉翠]/, 'jade'], [/[白银雪]/, 'silver']]);

// 光色：AI 写的优先，其次阵名里的颜色字，最后按演出给默认（法阵与封印暖金、结界青白、入阵紫、魔法世界观的法阵冷蓝白）。
export function sealToneOf(kind, item, env) {
    const given = String((item && item.tone) || '');
    if (SEAL_TONES.includes(given)) return given;
    if (kind === 'formation') {
        const hit = NAME_TONES.find(([re]) => re.test(String(item.name || '')));
        if (hit) return hit[1];
        if (env && env.worldview === 'magic') return 'azure';
        return item.mode === 'enter' ? 'violet' : 'gold';
    }
    return kind === 'barrier' ? 'azure' : 'gold';
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round = (n) => Math.round(n * 10) / 10;
const lifeOf = (kind, env) => Math.round(MYTH_LIFE_MS[kind] * (env.hold || 1));

function headOf(env, who) {
    try {
        const a = resolveHeadAnchor(env, who);
        return { x: clamp(Number(a.x) || 50, 6, 94), y: clamp(Number(a.y) || 26, 8, 80), d: clamp(Number(a.d) || 14, 6, 30) };
    } catch {
        return { x: 50, y: 26, d: 14 };
    }
}

function spriteOf(env, who) {
    try { return spriteElOf(env, who); } catch { return null; }
}

function vars(node, map) {
    node.setAttribute('style', Object.entries(map).map(([k, v]) => `${k}:${v}`).join(';'));
}

function root(env, kind, className, html, map) {
    const node = make(env.doc, `igs-dfx igs-myth igs-myth-${kind} ${className || ''}${env.reduced ? ' is-reduced' : ''}`.replace(/\s+/g, ' ').trim(), html);
    if (map) vars(node, map);
    return node;
}

function animateEl(env, el, frames, options) {
    if (env.reduced || !el || typeof el.animate !== 'function') return null;
    try { return el.animate(frames, options); } catch { return null; }
}

function shake(env, delay, px) {
    const motion = env.layers && env.layers.motion;
    animateEl(env, motion, [{ translate: '0 0' }, { translate: `${-px}px ${px / 2}px` }, { translate: `${px}px ${-px / 3}px` }, { translate: `${-px / 2}px 0` }, { translate: '0 0' }], { delay, duration: 380, easing: 'linear' });
}

function spritePulse(env, who, filters, life, delay = 0) {
    animateEl(env, spriteOf(env, who), filters.map((filter) => ({ filter })), { duration: life, delay, easing: 'ease-in-out', composite: 'add', fill: 'none' });
}

const JOLT_SPEC = Object.freeze({ duration: 380, easing: 'ease-out', frames: ['translate(0,0)', 'translate(-2.4%,0)', 'translate(1.2%,0)', 'translate(0,0)'] });
const SINK_ONCE = Object.freeze({ duration: 1200, easing: SPRITE_ACTION_FRAMES.sink.easing, frames: [...SPRITE_ACTION_FRAMES.sink.frames, SPRITE_ACTION_FRAMES.sink.frames[0]] });
const WARM_LIFT = Object.freeze(['brightness(1)', 'brightness(1.12) sepia(.15)', 'brightness(1)']);

// 立绘一次性动作：按帧规格延迟播放，结束自动还原（不用 fill:forwards，避免翻页后残留）。
function spriteAct(env, who, spec, { delay = 0, duration } = {}) {
    animateEl(env, spriteOf(env, who), spec.frames.map((transform) => ({ transform })), { delay, duration: duration || spec.duration, easing: spec.easing, composite: 'add', fill: 'none' });
}

// 收服目标是已确认的非人角色且在台上时返回 { profile, el }，否则 null（人类、待定档、不在台上都走原有分支）。
function creatureTarget(env, who) {
    const name = String(who || '').trim();
    if (!name || typeof env.creatureOf !== 'function') return null;
    const profile = env.creatureOf(name);
    if (!profile) return null;
    const el = foeElementOf({ motion: env.layers.motion, root: env.root, spriteName: env.speaker }, name);
    return el ? { profile, el } : null;
}

const result = (env, kind, layer, node, sounds) => ({ layer, life: lifeOf(kind, env), sounds, node });

// 法阵：地面是一张透视平面，上面叠三层宽大柔边的光幕（样式里按阵型画出走向与交错），逐层铺开后缓慢流动。
// 每层的流动方向（占自身尺寸的百分比）与倾角（度）写在这里，阵型走向写在样式里的 .is-<阵型>。
export const FORMATION_LAYOUTS = Object.freeze({
    ring: Object.freeze([{ dx: 0, dy: 0, rot: 16 }, { dx: 0, dy: 0, rot: -20 }, { dx: 5, dy: -3, rot: 0 }]),
    bagua: Object.freeze([{ dx: 0, dy: 0, rot: 12 }, { dx: 0, dy: 0, rot: -14 }, { dx: 0, dy: 0, rot: 8 }]),
    qixing: Object.freeze([{ dx: -6, dy: 3, rot: 0 }, { dx: 4, dy: 5, rot: 6 }, { dx: 6, dy: -4, rot: -5 }]),
    square: Object.freeze([{ dx: 0, dy: 5, rot: 0 }, { dx: 6, dy: 0, rot: 0 }, { dx: 0, dy: 0, rot: 10 }]),
});
const LAYOUT_KEYS = Object.freeze(Object.keys(FORMATION_LAYOUTS));
const SHEET_PEAK = Object.freeze([0.5, 0.45, 0.4]);
const SHEET_STEP_MS = 260;

export function formationLayoutOf(name) {
    const text = String(name || '');
    if (/八卦|两仪|四象/.test(text)) return 'bagua';
    if (/七星|北斗|天罡/.test(text)) return 'qixing';
    if (/方|九宫|军阵|大阵/.test(text)) return 'square';
    return LAYOUT_KEYS[[...text].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) >>> 0, 7) % LAYOUT_KEYS.length];
}

const RING_DOTS = Object.freeze([0, 60, 120, 180, 240, 300]);
const sparkHtml = (extra = '') => RING_DOTS.map((a, i) => `<i class="igs-myth-spark" style="--a:${a}deg;--d:${58 + (i % 3) * 16}px;animation-delay:${900 + i * 40}ms${extra}"></i>`).join('');

// 漫画符号（复用 fx-symbols）：位置与宽度为舞台百分比，延迟毫秒。
function sealSymbol(kind, x, y, w, delay) {
    const style = `left:${round(clamp(x, 6, 94))}%;top:${round(clamp(y, 6, 88))}%;--igs-myth-sw:${round(w)}%;--igs-fx-life:2200ms;animation-delay:${delay}ms`;
    return `<div class="igs-fx-symbol igs-myth-sym" data-kind="${kind}" style="${style}">${MANGA_SYMBOL_SVG[kind] || ''}</div>`;
}

const BUILDERS = {
    relic(item, env) {
        const body = headOf(env, item.who);
        const side = body.x < 50 ? 1 : -1;
        const x = clamp(body.x + side * 17, 12, 88);
        const y = clamp(body.y + 4, 14, 60);
        const node = root(env, 'relic', `is-${esc(item.tone || 'gold')}`, '', {
            '--x': `${round(x)}%`, '--y': `${round(y)}%`, '--fdx': `${round(body.x - x)}%`, '--fdy': `${round(body.y + 12 - y)}%`,
        });
        node.innerHTML = '<div class="igs-myth-fly"><i class="igs-myth-relic-orb"><i class="igs-myth-relic-gem"></i></i></div>'
            + '<i class="igs-myth-ring"></i><i class="igs-myth-ring is-b"></i>'
            + `${sparkHtml()}<div class="igs-myth-name">${charSpans(item.name, 90, 1000)}</div>`;
        if (item.who) animateEl(env, spriteOf(env, item.who), [{ transform: 'translate(0,0)' }, { transform: 'translate(0,-1.2%)' }, { transform: 'translate(0,0)' }], { duration: 760, easing: 'ease-out', composite: 'add' });
        return result(env, 'relic', 'stage', node, ['myth-relic']);
    },

    clash(item, env) {
        const node = root(env, 'clash', '', '', { '--x': '50%', '--y': '40%' });
        node.innerHTML = '<div class="igs-myth-fly is-l"><i class="igs-myth-relic-orb is-gold"><i class="igs-myth-relic-gem"></i></i></div>'
            + '<div class="igs-myth-fly is-r"><i class="igs-myth-relic-orb is-azure"><i class="igs-myth-relic-gem"></i></i></div>'
            + '<i class="igs-myth-flash"></i><i class="igs-myth-ring is-hit"></i><i class="igs-myth-ring is-hit is-b"></i>'
            + `${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<i class="igs-myth-ray" style="--a:${a}deg"></i>`).join('')}`
            + `<div class="igs-myth-tag is-l">${esc(item.a)}</div><div class="igs-myth-tag is-r">${esc(item.b)}</div>`;
        shake(env, 640, 7);
        return result(env, 'clash', 'stage', node, ['myth-clash']);
    },

    mythroll(item, env) {
        const names = (item.names || []).slice(0, 8);
        const rows = names.map((name, i) => {
            const delay = 700 + i * 430;
            const dy = (names.length - i) * 31 + 26;
            return `<div class="igs-myth-roll-row" style="--delay:${delay}ms"><b>${esc(name)}</b><i class="igs-myth-soul" style="--delay:${delay + 380}ms;--dy:${dy}px"></i></div>`;
        }).join('');
        const node = root(env, 'mythroll', '', `<div class="igs-myth-roll-board"><div class="igs-myth-roll-title">封神榜</div><div class="igs-myth-roll-list">${rows}</div></div>`);
        const life = Math.round((1600 + names.length * 440 + 1800) * (env.hold || 1));
        return { layer: 'front', life, sounds: ['myth-roll'], node };
    },

    formation(item, env) {
        const mode = item.mode === 'enter' || item.mode === 'break' ? item.mode : 'open';
        const tone = sealToneOf('formation', { ...item, mode }, env);
        const key = formationLayoutOf(item.name);
        const lit = 500 + FORMATION_LAYOUTS[key].length * SHEET_STEP_MS + 700;
        const sheets = FORMATION_LAYOUTS[key].map((m, i) => {
            const on = mode === 'break' ? i * 50 : 500 + i * SHEET_STEP_MS;
            const off = mode === 'break' ? `;--od:${900 + i * 220}ms` : '';
            return `<i class="igs-myth-sheet" style="--dx:${m.dx}%;--dy:${m.dy}%;--rt:${m.rot}deg;--lo:${SHEET_PEAK[i]};--ld:${on}ms${off}"></i>`;
        }).join('');
        const tint = mode === 'enter' ? '<i class="igs-myth-tint"></i>' : '';
        const flash = mode === 'break' ? '<i class="igs-myth-flash is-soft"></i>' : '';
        const node = root(env, 'formation', `is-${mode} is-${tone}`, `${tint}<div class="igs-myth-ground is-${key}">${sheets}</div>${flash}<div class="igs-myth-name is-low">${charSpans(item.name, 100, 700)}</div>`, { '--bd': `${lit}ms`, '--fd': '2.1s' });
        if (mode === 'break') shake(env, 2100, 5);
        else {
            spritePulse(env, '', WARM_LIFT, 900, lit);
            if (mode === 'enter') spriteAct(env, '', SINK_ONCE, { delay: 600 });
        }
        return result(env, 'formation', 'stage', node, [mode === 'break' ? 'myth-break' : 'myth-formation']);
    },

    flame(item, env) {
        const a = headOf(env, item.who);
        const tongues = [-9, -4.5, 0, 4.5, 9].map((dx, i) => `<i class="igs-myth-tongue" style="--dx:${dx}%;--h:${[34, 48, 58, 46, 32][i]}%;--w:${[7, 9, 11, 9, 7][i]}%;animation-delay:${i * 90}ms"></i>`).join('');
        const embers = [0, 1, 2, 3, 4, 5].map((i) => `<i class="igs-myth-ember" style="--dx:${(i - 2.5) * 5}%;--rise:${28 + (i % 3) * 10};animation-delay:${400 + i * 160}ms"></i>`).join('');
        const node = root(env, 'flame', '', `<i class="igs-myth-glow"></i><div class="igs-myth-fire">${tongues}${embers}</div>`, { '--x': `${round(a.x)}%`, '--base': '90%' });
        if (item.who || env.speaker) animateEl(env, spriteOf(env, item.who), [{ transform: 'translate(0,0)' }, { transform: 'translate(.4%,0)' }, { transform: 'translate(-.4%,0)' }, { transform: 'translate(.3%,0)' }, { transform: 'translate(0,0)' }], { duration: 900, easing: 'linear', composite: 'add', iterations: 2 });
        return result(env, 'flame', 'stage', node, ['myth-flame']);
    },

    thunder(item, env) {
        const a = headOf(env, item.who);
        const x = round(a.x);
        const y = round(clamp(a.y + 8, 20, 70));
        const path = `M${round(x + 9)} 0L${round(x + 3)} 12L${round(x + 8)} 22L${round(x - 4)} 36L${round(x + 3)} 44L${round(x - 2)} ${y}`;
        const fork = `M${round(x + 3)} 12L${round(x + 16)} 26L${round(x + 11)} 31`;
        const node = root(env, 'thunder', '', '<i class="igs-myth-dark"></i><i class="igs-myth-cloud"></i>'
            + `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="igs-myth-bolt is-glow" d="${path}"/><path class="igs-myth-bolt" d="${path}"/><path class="igs-myth-bolt is-fork" d="${fork}"/></svg>`
            + '<i class="igs-myth-flash"></i><i class="igs-myth-ring is-hit"></i>'
            + `<i class="igs-myth-scorch"></i>`, { '--x': `${x}%`, '--y': `${y}%` });
        shake(env, 150, 8);
        spritePulse(env, item.who, ['brightness(1)', 'brightness(2.2)', 'brightness(1)'], 520);
        return result(env, 'thunder', 'stage', node, ['myth-thunder']);
    },

    aura(item, env) {
        const mode = item.mode === 'mo' || item.mode === 'xian' ? item.mode : 'yao';
        const a = headOf(env, item.who);
        const color = { yao: '#5b2a86', mo: '#8c1226', xian: '#bfe6ff' }[mode];
        const spots = [[a.x, a.y + 24, 46], [a.x - 8, a.y + 38, 34], [a.x + 8, a.y + 14, 30]];
        const wisps = [-10, -5, 0, 5, 10].map((dx, i) => `<i class="igs-myth-wisp" style="left:${round(a.x + dx)}%;--top:${round(clamp(a.y + 40, 30, 92))}%;animation-delay:${i * 260}ms"></i>`).join('');
        const label = { yao: '妖气', mo: '魔气', xian: '仙气' }[mode];
        const node = root(env, 'aura', `is-${mode}`, `${wisps}<div class="igs-myth-name is-tag" style="left:${round(a.x)}%;top:${round(clamp(a.y - a.d * 0.8, 4, 70))}%">${charSpans(label, 120, 500)}</div>`);
        spots.forEach(([x, y, size]) => spawnMist(node, { x, y: clamp(y, 10, 92), size, color, drift: 4 }, { reduced: env.reduced }));
        return result(env, 'aura', 'stage', node, ['myth-aura']);
    },

    charm(item, env) {
        const target = headOf(env, item.target);
        const from = item.caster || { x: target.x < 50 ? 92 : 8, y: target.y };
        const node = root(env, 'charm', '', `<i class="igs-myth-swirl" style="left:${round(target.x)}%;top:${round(target.y)}%;width:${round(target.d * 1.8)}%"></i><i class="igs-myth-swirl is-b" style="left:${round(target.x)}%;top:${round(target.y)}%;width:${round(target.d * 1.8)}%"></i>`);
        drawLinks(node, [
            { from, to: item.target, tone: 'pink', style: 'mist' },
            { from, to: item.target, tone: 'pink', style: 'line' },
        ], env, { reduced: env.reduced });
        spawnMist(node, { x: target.x, y: clamp(target.y + 14, 10, 90), size: 40, color: '#ff7eb6', drift: 5 }, { reduced: env.reduced });
        spawnMist(node, { x: clamp(target.x + 8, 8, 92), y: clamp(target.y + 30, 10, 92), size: 28, color: '#ffb3d1', drift: 4 }, { reduced: env.reduced });
        spritePulse(env, item.target, ['saturate(1) brightness(1)', 'saturate(1.35) brightness(1.06)', 'saturate(1) brightness(1)'], 1800);
        return result(env, 'charm', 'stage', node, ['myth-charm']);
    },

    drain(item, env) {
        const from = headOf(env, item.to);
        const to = headOf(env, item.from);
        const dx = round(to.x - from.x);
        const dy = round(to.y - from.y);
        const node = root(env, 'drain', '', [0, 1, 2, 3, 4].map((i) => `<div class="igs-myth-mote" style="--dx:${dx}%;--dy:${dy}%;animation-delay:${i * 420}ms"><i style="left:${round(from.x + (i - 2) * 1.6)}%;top:${round(from.y + 4 + (i % 2) * 3)}%"></i></div>`).join('')
            + `<i class="igs-myth-gain" style="left:${round(to.x)}%;top:${round(to.y)}%;width:${round(to.d * 1.7)}%"></i>`);
        drawLinks(node, [
            { from: item.to, to: item.from, tone: 'cyan', style: 'line' },
            { from: item.to, to: item.from, tone: 'white', style: 'line' },
            { from: item.to, to: item.from, tone: 'violet', style: 'line' },
        ], env, { reduced: env.reduced });
        const life = lifeOf('drain', env);
        animateEl(env, spriteOf(env, item.to), ['saturate(1) brightness(1)', 'saturate(.3) brightness(.85)', 'saturate(.3) brightness(.85)', 'saturate(1) brightness(1)'].map((filter, i) => ({ filter, offset: [0, 0.3, 0.75, 1][i] })), { duration: life, easing: 'ease-in-out', composite: 'add' });
        spritePulse(env, item.from, ['brightness(1)', 'brightness(1.16)', 'brightness(1)'], 1800);
        return result(env, 'drain', 'stage', node, ['myth-drain']);
    },

    subdue(item, env) {
        const mode = ['bowl', 'gourd', 'chain'].includes(item.mode) ? item.mode : 'talisman';
        const tone = sealToneOf('subdue', item, env);
        const a = headOf(env, item.who);
        const x = round(a.x);
        const y = round(a.y);
        const chest = round(clamp(y + a.d * 1.2, 20, 88));
        const sx = round(clamp(x + (x < 50 ? 1 : -1) * Math.max(a.d * 1.1, 11), 8, 92));
        const map = { '--x': `${x}%`, '--y': `${y}%`, '--sx': `${sx}%`, '--cy': `${chest}%` };
        const cls = `is-${mode} is-${tone}`;
        const card = (delay) => `<div class="igs-myth-name is-seal${mode === 'talisman' ? ' is-by-slip' : ''}">${charSpans(SEAL_CARDS[mode], 140, delay)}</div>`;
        const lit = (name, delay) => `<i class="${name}" style="--d:${delay}ms"></i>`;
        // 已确认的非人角色：演出作用在立绘本身，缩小并被吸入法器位置；临时档案收服后提示转正。人类走下面原有分支。
        const creature = creatureTarget(env, item.who);
        const finish = (node, vessel, sounds) => {
            const life = lifeOf('subdue', env);
            // 立绘被吸入法器后保持消失到翻页（动画交给宿主，换页时取消）。
            for (const anim of absorbCreatureSprite(creature.el, vessel, { life, origin: { x, y: 100 }, reduced: env.reduced })) if (typeof env.holdAnim === 'function') env.holdAnim(anim);
            if (creature.profile.temp) {
                const note = env.doc.createElement('div');
                note.className = 'igs-creature-tame-note';
                note.textContent = `「${String(item.who).trim()}」为临时档案，可在角色设置中转为正式角色。`;
                node.appendChild(note);
            }
            return result(env, 'subdue', 'stage', node, sounds);
        };
        if (mode === 'talisman') {
            const gloom = creature ? '' : sealSymbol('gloom', x + a.d * 0.4, y - a.d * 0.3, Math.max(3, a.d * 0.24), 700);
            const node = root(env, 'subdue', cls, `<div class="igs-myth-throw ${sx < x ? 'is-from-l' : 'is-from-r'}"><div class="igs-myth-slip"><b>敕</b><b>令</b></div></div>`
                + `${lit('igs-myth-gglow', 500)}${lit('igs-myth-rise', 550)}${gloom}${card(900)}`, map);
            if (creature) return finish(node, { x: sx, y: chest }, ['myth-seal-talisman']);
            spriteAct(env, item.who, SPRITE_ACTION_FRAMES.recoil, { delay: 450 });
            spriteAct(env, item.who, SPRITE_ACTION_FRAMES.tremble, { delay: 650, duration: 600 });
            return result(env, 'subdue', 'stage', node, ['myth-seal-talisman']);
        }
        if (mode === 'bowl') {
            const by = round(clamp(y + 40, 40, 80));
            const node = root(env, 'subdue', cls, `${lit('igs-myth-cone', 0)}${lit('igs-myth-gglow', 500)}${card(1000)}`, { ...map, '--by': `${by}%` });
            if (creature) return finish(node, { x, y: by }, ['myth-seal-bowl']);
            spriteAct(env, item.who, SINK_ONCE, { delay: 400 });
            animateEl(env, spriteOf(env, item.who), ['saturate(1)', 'saturate(.85)', 'saturate(.85)', 'saturate(1)'].map((filter) => ({ filter })), { delay: 400, duration: 1500, easing: 'ease-in-out', composite: 'add', fill: 'none' });
            return result(env, 'subdue', 'stage', node, ['myth-seal-bowl']);
        }
        if (mode === 'gourd') {
            const gx = x < 50 ? 82 : 18;
            const node = root(env, 'subdue', cls, `<i class="igs-myth-corner ${gx > 50 ? 'is-r' : 'is-l'}"></i>${card(900)}`, map);
            pushStage(env, { scale: 1.03, duration: 1500, delay: 400 });
            if (creature) return finish(node, { x: gx, y: 28 }, ['myth-seal-gourd']);
            const tx = round((gx - x) * 0.9);
            const life = lifeOf('subdue', env);
            animateEl(env, spriteOf(env, item.who), [
                { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 0 },
                { transform: `translate(${round(tx * 0.3)}%,-4%) scale(.7) rotate(8deg)`, opacity: 1, offset: 0.2 },
                { transform: `translate(${tx}%,-30%) scale(.05) rotate(40deg)`, opacity: 0, offset: 0.4 },
                { transform: `translate(${tx}%,-30%) scale(.05) rotate(40deg)`, opacity: 0, offset: 0.9 },
                { transform: 'translate(0,0) scale(1)', opacity: 1, offset: 1 },
            ], { duration: life, easing: 'ease-in-out', composite: 'add' });
            return result(env, 'subdue', 'stage', node, ['myth-seal-gourd']);
        }
        const bands = [0, 1, 2].map((i) => `<i class="igs-myth-band" style="top:${round(clamp(chest + a.d * 1.2 * i, 20, 90))}%;--d:${i * 120}ms"></i>`).join('');
        const node = root(env, 'subdue', cls, `${bands}<i class="igs-myth-flash is-soft"></i>${card(850)}`, map);
        if (creature) return finish(node, { x, y: chest }, ['myth-seal-chain']);
        [0, 1, 2].forEach((i) => spriteAct(env, item.who, SPRITE_ACTION_FRAMES.tremble, { delay: 300 + i * 120, duration: 400 }));
        return result(env, 'subdue', 'stage', node, ['myth-seal-chain']);
    },

    barrier(item, env) {
        const mode = item.mode === 'break' ? 'break' : 'open';
        const tone = sealToneOf('barrier', item, env);
        const body = mode === 'break'
            ? '<i class="igs-myth-edge is-l"></i><i class="igs-myth-edge is-r"></i><i class="igs-myth-dometint"></i><i class="igs-myth-flash is-soft"></i>'
            : '<i class="igs-myth-gglow"></i><i class="igs-myth-rise is-dome"></i><i class="igs-myth-edge is-l"></i><i class="igs-myth-edge is-r"></i><i class="igs-myth-dometint"></i>';
        const node = root(env, 'barrier', `is-${mode} is-${tone}`, body, { '--x': '50%' });
        if (mode === 'break') shake(env, 1000, 5);
        return result(env, 'barrier', 'stage', node, [mode === 'break' ? 'myth-break' : 'myth-barrier']);
    },

    core(item, env) {
        const hue = [...String(item.name || '')].reduce((h, ch) => (h * 31 + ch.codePointAt(0)) >>> 0, 7) % 5;
        const tone = ['gold', 'azure', 'violet', 'jade', 'crimson'][hue];
        const motes = [0, 1, 2, 3, 4, 5].map((i) => `<i class="igs-myth-mote-up" style="--dx:${(i - 2.5) * 11}px;animation-delay:${i * 330}ms"></i>`).join('');
        const node = root(env, 'core', `is-${tone}`, `<div class="igs-myth-core"><i class="igs-myth-core-ring"></i><i class="igs-myth-core-ring is-b"></i><i class="igs-myth-core-body"></i>${motes}</div>`
            + `<div class="igs-myth-core-label"><span>妖丹</span>${item.name ? `<b>${charSpans(item.name, 90, 700)}</b>` : ''}</div>`);
        return result(env, 'core', 'front', node, ['myth-core']);
    },

    pact(item, env) {
        const a = headOf(env, item.a);
        const b = item.b ? headOf(env, item.b) : null;
        const mark = (p, cls) => `<div class="igs-myth-mark ${cls}" style="left:${round(p.x)}%;top:${round(clamp(p.y + p.d * 1.2, 20, 88))}%;width:${round(clamp(p.d * 0.78, 6, 14) * 0.55)}%">${MARK_SYMBOL_SVG.bondsigil}</div>`;
        const node = root(env, 'pact', '', mark(a, '') + (b ? mark(b, 'is-b') : '') + `<div class="igs-myth-name is-tag" style="left:50%;top:${round(clamp((b ? (a.y + b.y) / 2 : a.y) + Math.max(a.d, b ? b.d : 0) * 1.2 + 13, 24, 82))}%">${charSpans(PACT_CARD, 160, 1000)}</div>`);
        if (b) drawLinks(node, [{ from: { x: a.x, y: clamp(a.y + a.d * 1.2, 20, 88) }, to: { x: b.x, y: clamp(b.y + b.d * 1.2, 20, 88) }, tone: 'red', style: 'line' }], env, { reduced: env.reduced });
        spriteAct(env, item.a, JOLT_SPEC, { delay: 300 });
        if (b) spriteAct(env, item.b, JOLT_SPEC, { delay: 550 });
        return result(env, 'pact', 'stage', node, ['myth-pact']);
    },
};

export const MYTH_BUILDERS = Object.freeze(BUILDERS);
