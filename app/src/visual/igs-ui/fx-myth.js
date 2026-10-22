// 神话妖魔包的演出构建器：法宝、封神榜、阵法、真火天雷、妖气魅惑、吸取、降妖、结界、妖丹、血契。
// 每个构建器返回 { node, life, layer, sounds }；减少动态效果时只留静止的终态，不起动画。
import { esc } from './reader-value-utils.js';
import { charSpans, make } from './fx-daily-kit.js';
import { resolveHeadAnchor, spriteElOf } from './stage-snapshot.js';
import { drawLinks } from './fx-links.js';
import { spawnMist } from './fx-mist.js';
import { absorbCreatureSprite, foeElementOf } from './fx-creature-battle.js';

export const MYTH_LIFE_MS = Object.freeze({
    relic: 3000, clash: 3200, mythroll: 3000, formation: 3800, flame: 3200, thunder: 2200, aura: 3600,
    charm: 3400, drain: 3400, subdue: 3000, barrier: 3000, core: 3600, pact: 3400,
});

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

function spritePulse(env, who, filters, life) {
    animateEl(env, spriteOf(env, who), filters.map((filter) => ({ filter })), { duration: life, easing: 'ease-in-out', composite: 'add', fill: 'none' });
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

// 碎片：同一张图案复制四份，各自按斜切多边形裁剪后向外飞散；静止态只留细微错位。
const SHARDS = Object.freeze([
    { clip: 'polygon(0 0,50% 0,40% 55%,0 45%)', tx: '-14%', ty: '-10%', rot: '-9deg' },
    { clip: 'polygon(50% 0,100% 0,100% 40%,40% 55%)', tx: '14%', ty: '-12%', rot: '8deg' },
    { clip: 'polygon(0 45%,40% 55%,55% 100%,0 100%)', tx: '-12%', ty: '14%', rot: '7deg' },
    { clip: 'polygon(40% 55%,100% 40%,100% 100%,55% 100%)', tx: '15%', ty: '12%', rot: '-8deg' },
]);

function shardHtml(inner, cls) {
    return SHARDS.map((s) => `<div class="igs-myth-shard ${cls}" style="clip-path:${s.clip};--tx:${s.tx};--ty:${s.ty};--rot:${s.rot}">${inner}</div>`).join('');
}

const RING_DOTS = Object.freeze([0, 60, 120, 180, 240, 300]);
const sparkHtml = (extra = '') => RING_DOTS.map((a, i) => `<i class="igs-myth-spark" style="--a:${a}deg;--d:${58 + (i % 3) * 16}px;animation-delay:${900 + i * 40}ms${extra}"></i>`).join('');

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
        const svg = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'
            + '<circle class="igs-myth-line" cx="50" cy="50" r="47" pathLength="1"/><circle class="igs-myth-line is-thin" cx="50" cy="50" r="40" pathLength="1"/>'
            + '<polygon class="igs-myth-line" points="50,9 85,29.5 85,70.5 50,91 15,70.5 15,29.5" pathLength="1"/>'
            + '<polygon class="igs-myth-line is-thin" points="50,14 87,74 13,74" pathLength="1"/><polygon class="igs-myth-line is-thin" points="50,86 13,26 87,26" pathLength="1"/>'
            + '<circle class="igs-myth-line" cx="50" cy="50" r="12" pathLength="1"/>'
            + [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line class="igs-myth-tick" x1="50" y1="1" x2="50" y2="7" transform="rotate(${a} 50 50)"/>`).join('')
            + '</svg>';
        const plate = mode === 'break'
            ? `<div class="igs-myth-ground">${shardHtml(svg, 'is-form')}</div>`
            : `<div class="igs-myth-ground"><div class="igs-myth-spin">${svg}</div></div>`;
        const tint = mode === 'enter' ? '<i class="igs-myth-tint"></i>' : '';
        const flash = mode === 'break' ? '<i class="igs-myth-flash is-soft"></i>' : '';
        const node = root(env, 'formation', `is-${mode}`, `${tint}${plate}${flash}<div class="igs-myth-name is-low">${charSpans(item.name, 100, 700)}</div>`);
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
        const a = headOf(env, item.who);
        const x = round(a.x);
        const y = round(a.y);
        const sx = round(clamp(x + (x < 50 ? 1 : -1) * Math.max(a.d * 1.1, 11), 8, 92));
        const map = { '--x': `${x}%`, '--y': `${y}%`, '--sx': `${sx}%` };
        // 已确认的非人角色：演出作用在立绘本身，缩小并被吸入法器位置；临时档案收服后提示转正。人类走下面原有分支。
        const creature = creatureTarget(env, item.who);
        const finish = (node, vessel, sounds) => {
            const life = lifeOf('subdue', env);
            // 立绘被吸入法器后保持消失到翻页（动画交给宿主，换页时取消）；波纹圈是给人类用的施法反馈，这里去掉，只留法器本身。
            for (const anim of absorbCreatureSprite(creature.el, vessel, { life, origin: { x, y: 100 }, reduced: env.reduced })) if (typeof env.holdAnim === 'function') env.holdAnim(anim);
            for (const ring of Array.from(node.querySelectorAll('.igs-myth-ring'))) ring.remove();
            if (creature.profile.temp) {
                const note = env.doc.createElement('div');
                note.className = 'igs-creature-tame-note';
                note.textContent = `「${String(item.who).trim()}」为临时档案，可在角色设置中转为正式角色。`;
                node.appendChild(note);
            }
            return result(env, 'subdue', 'stage', node, sounds);
        };
        if (mode === 'talisman') {
            const node = root(env, 'subdue', 'is-talisman', `<div class="igs-myth-slip"><b>敕</b><b>令</b></div><i class="igs-myth-ring is-red"></i>`, map);
            if (creature) return finish(node, { x, y }, ['myth-seal-talisman']);
            return result(env, 'subdue', 'stage', node, ['myth-seal-talisman']);
        }
        if (mode === 'bowl') {
            const by = round(clamp(y + 40, 40, 80));
            const node = root(env, 'subdue', 'is-bowl', '<div class="igs-myth-bowl"><i class="igs-myth-bowl-rim"></i></div><i class="igs-myth-ring is-b"></i>', { ...map, '--by': `${by}%` });
            if (creature) return finish(node, { x, y: by }, ['myth-seal-bowl']);
            return result(env, 'subdue', 'stage', node, ['myth-seal-bowl']);
        }
        if (mode === 'gourd') {
            const gx = x < 50 ? 82 : 18;
            const node = root(env, 'subdue', 'is-gourd', `<i class="igs-myth-gourd-orb" style="left:${gx}%"></i>`
                + `<i class="igs-myth-vortex" style="left:${gx}%"></i><i class="igs-myth-vortex is-b" style="left:${gx}%"></i>`, map);
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
        const pts = [[-9, 6], [9, 20], [-9, 34], [9, 48]];
        const segs = (list) => `M${list.map(([dx, dy]) => `${round(x + dx)} ${round(y + dy)}`).join('L')}`;
        const back = pts.map(([dx, dy]) => [-dx, dy]);
        const node = root(env, 'subdue', 'is-chain', `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="igs-myth-chain is-under" pathLength="1" d="${segs(pts)}"/><path class="igs-myth-chain is-under" pathLength="1" d="${segs(back)}"/><path class="igs-myth-chain" pathLength="1" d="${segs(pts)}"/><path class="igs-myth-chain" pathLength="1" d="${segs(back)}"/></svg>`
            + `<i class="igs-myth-lock" style="left:${x}%;top:${round(y + 27)}%"></i><i class="igs-myth-flash is-soft"></i>`, map);
        if (creature) return finish(node, { x, y: round(y + 27) }, ['myth-seal-chain']);
        return result(env, 'subdue', 'stage', node, ['myth-seal-chain']);
    },

    barrier(item, env) {
        const mode = item.mode === 'break' ? 'break' : 'open';
        const lines = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">'
            + '<path class="igs-myth-line" pathLength="1" d="M4 96A46 86 0 0 1 96 96"/>'
            + '<path class="igs-myth-line is-thin" pathLength="1" d="M4 96A46 86 0 0 1 96 96Z"/>'
            + '<path class="igs-myth-line is-thin" pathLength="1" d="M22 96A28 86 0 0 1 78 96"/><path class="igs-myth-line is-thin" pathLength="1" d="M40 96A10 86 0 0 1 60 96"/>'
            + '<path class="igs-myth-line is-thin" pathLength="1" d="M8 72Q50 62 92 72"/><path class="igs-myth-line is-thin" pathLength="1" d="M16 50Q50 40 84 50"/><path class="igs-myth-line is-thin" pathLength="1" d="M30 30Q50 24 70 30"/>'
            + '</svg>';
        const dome = mode === 'break' ? `<div class="igs-myth-dome">${shardHtml(lines, 'is-dome')}</div>` : `<div class="igs-myth-dome"><div class="igs-myth-grow">${lines}</div></div>`;
        const node = root(env, 'barrier', `is-${mode}`, `${dome}<i class="igs-myth-pulse"></i>${mode === 'break' ? '<i class="igs-myth-flash is-soft"></i>' : ''}`);
        if (mode === 'break') shake(env, 80, 5);
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
        const seal = (p, cls) => `<svg class="igs-myth-seal ${cls}" style="left:${round(p.x)}%;top:${round(clamp(p.y + p.d * 1.2, 20, 88))}%;width:${round(clamp(p.d * 0.78, 6, 14))}%" viewBox="0 0 40 40" aria-hidden="true">`
            + '<circle cx="20" cy="20" r="18"/><circle cx="20" cy="20" r="13" class="is-thin"/><polygon points="20,8 30,26 10,26" class="is-thin"/><circle cx="20" cy="20" r="3" class="is-fill"/></svg>';
        const node = root(env, 'pact', '', seal(a, '') + (b ? seal(b, 'is-b') : '') + `<div class="igs-myth-name is-tag" style="left:50%;top:${round(clamp((b ? (a.y + b.y) / 2 : a.y) + Math.max(a.d, b ? b.d : 0) * 1.2 + 8, 24, 78))}%">${charSpans('血契', 160, 1000)}</div>`);
        if (b) drawLinks(node, [{ from: { x: a.x, y: clamp(a.y + a.d * 1.2, 20, 88) }, to: { x: b.x, y: clamp(b.y + b.d * 1.2, 20, 88) }, tone: 'red', style: 'line' }], env, { reduced: env.reduced });
        return result(env, 'pact', 'stage', node, ['myth-pact']);
    },
};

export const MYTH_BUILDERS = Object.freeze(BUILDERS);
