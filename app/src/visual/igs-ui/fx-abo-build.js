// ABO 包的构建器：每个返回 { layer, life, sounds, node }。读立绘位置只走 stage-snapshot 读当前 DOM。
// 古风换皮取 env.ancient（淡墨雾、朱砂印），西幻取 worldSkin 追加的 is-magic（魔力雾）；时长乘 env.hold，reduced 时不起任何 JS 动画。
import { esc } from './reader-value-utils.js';
import { charSpans, make } from './fx-daily-kit.js';
import { MANGA_SYMBOL_SVG, MARK_SYMBOL_SVG } from './fx-symbols.js';
import { panelToneOf, gaugeHtml } from './fx-panel-kit.js';
import { rollNumber } from './fx-ticker.js';
import { playWarp, resolveHeadAnchor, spriteElOf } from './stage-snapshot.js';
import { scentColorOf } from './fx-abo-model.js';
import { at, atFilter, headPoint, reactSprite, spriteShown } from './fx-sprite-react.js';
import { playSpriteSpec } from './sprite-actions.js';

const LIFE = Object.freeze({ scent: 4200, scentlink: 4600, suppress: 3600, soothe: 4800, inhibitor: 3400, bond: 3800, bondLife: 5600, gendertest: 5600, match: 4600, nest: 4400, detector: 4600, phase: 4600 });
const life = (ms, env) => Math.round(ms * Math.max(1, env.hold || 1));
const skinOf = (env) => (env.ancient ? ' is-ancient' : '');
const cssSafe = (value) => String(value).replace(/[^\p{L}\p{N}_-]/gu, '');
const pct = (n) => Math.round(n * 10) / 10;

function box(env, className, html = '') {
    return make(env.doc, `igs-dfx igs-abo ${className}${skinOf(env)}`, html);
}

const JOLT_SPEC = Object.freeze({ duration: 380, easing: 'ease-out', frames: ['translate(0,0)', 'translate(-2.4%,0)', 'translate(1.2%,0)', 'translate(0,0)'] });
const clampX = (n) => Math.max(6, Math.min(94, n));
const clampY = (n) => Math.max(6, Math.min(88, n));

// 阶段演出的漫画符号：复用 .igs-fx-symbol 的配色与弹出动画，位置与宽度是舞台百分比。
// scent 是自左向右飘的波浪线，dx 为飘移距离（占自身宽度的百分比，带方向）；flip 让它朝左飘。
function symbolNode(env, kind, x, y, w, { delay = 0, flip = false, color = '', ms = 2400, dx = 0, cls = '' } = {}) {
    const el = make(env.doc, `igs-fx-symbol igs-abo-sym${kind === 'scent' ? ' is-scent' : ''}${cls ? ` ${cls}` : ''}`, MANGA_SYMBOL_SVG[kind] || '');
    el.setAttribute('data-kind', kind);
    if (flip) el.setAttribute('data-flip', '1');
    const hue = color ? `--igs-fx-hue:${color};--igs-fx-accent:${color};` : '';
    el.setAttribute('style', `left:${pct(clampX(x))}%;top:${pct(clampY(y))}%;--igs-abo-sw:${pct(w)}%;--igs-abo-dx:${pct(dx)}%;--igs-fx-life:${ms}ms;animation-delay:${delay}ms;${hue}`);
    return el;
}

// 另一位在场者（接收者）：取第一个不是 who 的可见立绘；who 为空串表示主立绘。
function receiverOf(env, who) {
    if (!env.root || typeof env.root.querySelector !== 'function') return null;
    const mainEl = env.root.querySelector('#igs-sprite');
    const source = spriteElOf(env, who);
    const casts = typeof env.root.querySelectorAll === 'function' ? Array.from(env.root.querySelectorAll('.igs-cast-sprite')) : [];
    const el = [mainEl, ...casts].find((e) => e && e !== source && spriteShown(e));
    if (!el) return null;
    const name = el === mainEl ? '' : (el.getAttribute('data-igs-cast-char') || '');
    return { who: name, head: headPoint(env, name) };
}

const leanFrames = (sign) => [at(0, 'translate(0,0)'), at(0.3, `translate(${sign * 1.2}%,0)`), at(0.75, `translate(${sign * 1.2}%,0)`), at(1, 'translate(0,0)')];

function scentBuilder(item, env) {
    const color = scentColorOf(item.who, item.color);
    const head = resolveHeadAnchor(env, item.who);
    const target = receiverOf(env, item.who);
    const toward = target ? (target.head.x >= head.x ? 1 : -1) : (head.x < 50 ? 1 : -1);
    const ms = life(LIFE.scent, env);
    const node = box(env, 'igs-abo-scent', '<div class="igs-abo-tint"></div>');
    if (env.reduced) node.classList.add('is-reduced');
    node.setAttribute('style', `--igs-abo-c:${color}`);
    const w = Math.max(8, head.d * 1.7);
    const reach = target ? Math.min(Math.abs(target.head.x - head.x) * 0.55, 22) : 12;
    const dx = toward * reach / w * 100;
    const x0 = head.x + toward * head.d * 1;
    const y0 = head.y + head.d * 0.3;
    node.appendChild(symbolNode(env, 'scent', x0, y0, w, { flip: toward < 0, color, ms: Math.round(ms * 0.7), dx }));
    node.appendChild(symbolNode(env, 'scent', x0 + toward * head.d * 0.4, y0 - head.d * 0.5, w * 0.75, { flip: toward < 0, color, ms: Math.round(ms * 0.6), dx, delay: 700 }));
    if (item.name) {
        const tag = make(env.doc, 'igs-abo-scent-name', charSpans(item.name, 90, 700));
        tag.setAttribute('style', `left:${pct(head.x)}%;top:${pct(Math.max(4, head.y - head.d * 0.95))}%`);
        node.appendChild(tag);
    }
    if (target) {
        const t = target.head;
        node.appendChild(symbolNode(env, 'blush', t.x, t.y + t.d * 0.25, Math.max(6, t.d), { delay: 900, ms: 2200 }));
        reactSprite(env, target.who, leanFrames(-toward), { duration: Math.min(ms - 900, 2600), delay: 900 });
    }
    // stage 层：符号要压在立绘之上
    return { layer: 'stage', life: ms, sounds: target ? ['abo-waft', 'abo-inhale'] : ['abo-waft'], node };
}

function scentlinkBuilder(item, env) {
    const ca = scentColorOf(item.a);
    const cb = scentColorOf(item.b);
    const a = resolveHeadAnchor(env, item.a);
    const b = resolveHeadAnchor(env, item.b);
    const ms = life(LIFE.scentlink, env);
    const node = box(env, 'igs-abo-link');
    if (env.reduced) node.classList.add('is-reduced');
    const dir = a.x <= b.x ? 1 : -1;
    const mid = (a.x + b.x) / 2;
    const wa = Math.max(8, a.d * 1.5);
    const wb = Math.max(8, b.d * 1.5);
    const xa = a.x + dir * a.d * 0.9;
    const xb = b.x - dir * b.d * 0.9;
    const ya = a.y + a.d * 0.5;
    const yb = b.y + b.d * 0.5;
    // 两人各自的波浪线飘向中间，叠在一处像缠成一个结，随后心形符号浮起
    node.appendChild(symbolNode(env, 'scent', xa, ya, wa, { flip: dir < 0, color: ca, ms: Math.round(ms * 0.65), dx: (mid - xa) / wa * 100 }));
    node.appendChild(symbolNode(env, 'scent', xb, yb, wb, { flip: dir > 0, color: cb, ms: Math.round(ms * 0.65), dx: (mid - xb) / wb * 100, delay: 200 }));
    node.appendChild(symbolNode(env, 'heart', mid, (ya + yb) / 2 - a.d * 0.5, Math.max(6, a.d * 0.9), { delay: 1500, ms: 2200 }));
    const leanMs = Math.min(ms - 400, 3600);
    reactSprite(env, item.a, leanFrames(dir), { duration: leanMs, delay: 300 });
    reactSprite(env, item.b, leanFrames(-dir), { duration: leanMs, delay: 300 });
    return { layer: 'stage', life: ms, sounds: ['abo-link', 'abo-pulse'], node };
}

// 压制时其他陪衬下沉：只写纵向变量 --igs-cast-sink，translate 由同屏样式合成，不覆盖撑伞靠拢等横向位移。
export function aboCastSinkRule(name) {
    return `#igs-overlay:has(.igs-abo-suppress) .igs-cast-sprite${name ? `:not([data-igs-cast-char="${name}"])` : ''}{--igs-cast-sink:var(--igs-abo-sink,2.4%);}`;
}

function suppressBuilder(item, env) {
    const mainEl = env.root.querySelector('#igs-sprite');
    const sourceEl = spriteElOf(env, item.who);
    const sourceIsMain = sourceEl === mainEl;
    const name = cssSafe(item.who);
    const sink = aboCastSinkRule(name);
    const ms = life(LIFE.suppress, env);
    const node = box(env, `igs-abo-suppress is-${item.range === 'all' ? 'all' : 'near'}${sourceIsMain ? ' is-main' : ''}`,
        `<style>${sink}</style><div class="igs-abo-dim"></div>`);
    if (env.reduced) node.classList.add('is-reduced');
    const others = Array.from(env.root.querySelectorAll('.igs-cast-sprite')).filter((el) => el !== sourceEl);
    if (!sourceIsMain && mainEl) others.push(mainEl);
    // 被压制者额头出阴影竖线，立绘去饱和并颤抖
    for (const el of others.slice(0, 4)) {
        if (!spriteShown(el)) continue;
        const who = el === mainEl ? '' : (el.getAttribute('data-igs-cast-char') || '');
        const h = headPoint(env, who);
        node.appendChild(symbolNode(env, 'gloom', h.x, h.y - h.d * 0.7, Math.max(6, h.d * 0.9), { delay: 300, ms: 2600 }));
        reactSprite(env, who, [atFilter(0, 'saturate(1)'), atFilter(0.2, 'saturate(.85)'), atFilter(0.8, 'saturate(.85)'), atFilter(1, 'saturate(1)')], { duration: Math.max(600, ms - 400), delay: 200 });
    }
    if (!env.reduced) {
        const motion = env.root.querySelector('#igs-stage-motion');
        if (motion && typeof motion.animate === 'function') {
            try {
                motion.animate([{ translate: '0 0' }, { translate: '0 .35%' }, { translate: '.3% 0' }, { translate: '-.3% .2%' }, { translate: '0 0' }], { duration: 640, easing: 'ease-out', composite: 'add' });
            } catch { /* 不支持时保持静止 */ }
        }
        for (const el of others.slice(0, 4)) playWarp(el, 'tremble', { reduced: false });
    }
    return { layer: 'stage', life: ms, sounds: ['abo-press'], node };
}

function sootheBuilder(item, env) {
    const head = resolveHeadAnchor(env, item.who);
    const target = receiverOf(env, item.who);
    const subject = target ? target.head : head;
    const dir = target ? (target.head.x >= head.x ? 1 : -1) : (head.x < 50 ? 1 : -1);
    const ms = life(LIFE.soothe, env);
    const node = box(env, 'igs-abo-soothe', '<div class="igs-abo-glow"></div>');
    if (env.reduced) node.classList.add('is-reduced');
    // 安抚者的波浪线更平缓，慢慢绕到被安抚者的肩旁
    const w = Math.max(8, head.d * 1.7);
    const x0 = head.x + dir * head.d * 0.9;
    const reach = target ? Math.max(6, Math.abs(target.head.x - x0) - target.head.d * 0.9) : 10;
    node.appendChild(symbolNode(env, 'scent', x0, head.y + head.d * 0.5, w, { flip: dir < 0, color: '#ffcf9e', ms: Math.round(ms * 0.75), dx: dir * reach / w * 100, cls: 'is-calm' }));
    node.appendChild(symbolNode(env, 'sigh', subject.x + subject.d * 0.2, subject.y - subject.d * 0.9, Math.max(6, subject.d), { delay: 1500, ms: 2400 }));
    if (target) reactSprite(env, target.who, [at(0, 'translate(0,0)'), at(0.35, 'translate(0,1%)'), at(1, 'translate(0,0)')], { duration: Math.min(ms - 1200, 2800), delay: 1200 });
    return { layer: 'stage', life: ms, sounds: ['abo-calm', 'abo-exhale'], node };
}

const SYRINGE = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M44 8l12 12-6 6-12-12z" fill="#d9dde3"/><path d="M38 14l12 12-20 20-12-12z" fill="#eef2f6" stroke="#5d6672" stroke-width="2"/><path d="M24 32l8 8-14 14-8-2-2-8z" fill="#7ad0c4"/><path d="M8 56l-4 4" stroke="#5d6672" stroke-width="3" stroke-linecap="round"/></svg>';
const PATCH = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="18" width="44" height="28" rx="8" fill="#f1d3b8" stroke="#a97f5d" stroke-width="2"/><rect x="26" y="18" width="12" height="28" fill="#e6c09f"/><circle cx="18" cy="32" r="2" fill="#a97f5d"/><circle cx="46" cy="32" r="2" fill="#a97f5d"/></svg>';
const WARN = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6l27 48H5z" fill="#d23b3b" stroke="#7d1313" stroke-width="3" stroke-linejoin="round"/><path d="M32 22v16" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="46" r="3" fill="#fff"/></svg>';

function inhibitorBuilder(item, env) {
    const fail = item.mode === 'fail';
    const icon = item.mode === 'patch' ? PATCH : (fail ? WARN : SYRINGE);
    const title = fail ? '抑制失效' : (item.mode === 'patch' ? '阻隔贴' : '抑制剂');
    const sub = item.name || (fail ? '信息素外泄' : (item.mode === 'patch' ? '已贴合' : '已注射'));
    const node = box(env, `igs-abo-inhibitor is-${item.mode}`,
        `<div class="igs-abo-item"><span class="igs-abo-item-icon">${icon}</span><span class="igs-abo-item-text"><b>${esc(title)}</b><em>${esc(sub)}</em></span></div>`);
    return { layer: 'front', life: life(LIFE.inhibitor, env), sounds: [fail ? 'abo-warn' : (item.mode === 'patch' ? 'abo-patch' : 'abo-inject')], node };
}

const SIGIL = MARK_SYMBOL_SVG.bondsigil;
const BITE = MARK_SYMBOL_SVG.bite;

function bondBuilder(item, env) {
    const head = resolveHeadAnchor(env, item.who);
    const forever = item.mode === 'life';
    const size = Math.max(7, head.d * 0.9);
    const label = forever ? '终身标记' : '临时标记';
    const node = box(env, `igs-abo-bond is-${forever ? 'life' : 'temp'}`,
        `<div class="igs-abo-mark" style="left:${pct(head.x)}%;top:${pct(head.y + head.d * 0.85)}%;width:${pct(size)}%">${forever ? SIGIL : BITE}</div>${forever ? `<div class="igs-abo-pulse" style="left:${pct(head.x)}%;top:${pct(head.y + head.d * 0.85)}%;width:${pct(size * 1.5)}%"></div>` : ''}`
        + `<div class="igs-abo-tag" style="left:${pct(head.x)}%;top:${pct(Math.max(4, head.y - head.d * 0.95))}%">${label}</div>`);
    if (env.reduced) node.classList.add('is-reduced');
    else playSpriteSpec(spriteElOf(env, item.who), JOLT_SPEC);
    return { layer: 'stage', life: life(forever ? LIFE.bondLife : LIFE.bond, env), sounds: ['abo-chomp', forever ? 'abo-seal' : 'abo-bond'], node };
}

function gendertestBuilder(item, env) {
    const tone = panelToneOf(env);
    const node = box(env, 'igs-abo-report',
        `<div class="igs-panel is-${tone}"><div class="igs-panel-title">第二性别分化报告</div><div class="igs-panel-rows">`
        + `<div class="igs-panel-row"><span class="igs-panel-k">受检者</span><span class="igs-panel-v">${esc(item.who)}</span></div>`
        + '<div class="igs-panel-row"><span class="igs-panel-k">检测项</span><span class="igs-panel-v">腺体与信息素</span></div>'
        + `<div class="igs-panel-row igs-abo-result"><span class="igs-panel-k">分化结果</span><span class="igs-panel-v igs-abo-reveal">${charSpans(item.result, 220, 1500)}</span></div>`
        + '</div><div class="igs-panel-foot">检测完毕</div></div>');
    return { layer: 'front', life: life(LIFE.gendertest, env), sounds: ['abo-scan'], node };
}

function matchBuilder(item, env) {
    const value = Math.max(0, Math.min(100, Number(item.percent) || 0));
    const node = box(env, 'igs-abo-match',
        `<div class="igs-abo-match-card"><div class="igs-abo-match-names"><span>${esc(item.a)}</span><i></i><span>${esc(item.b)}</span></div>`
        + `<div class="igs-abo-ring-wrap" style="--igs-abo-pct:${value}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="igs-abo-track" cx="50" cy="50" r="42"/><circle class="igs-abo-arc" pathLength="100" cx="50" cy="50" r="42"/></svg><b class="igs-abo-pct-num"><span class="igs-abo-pct">${value}</span>%</b></div>`
        + '<div class="igs-abo-match-cap">信息素匹配度</div></div>');
    const target = typeof node.querySelector === 'function' ? node.querySelector('.igs-abo-pct') : null;
    if (target) rollNumber(target, 0, value, 1600, { reduced: env.reduced });
    return { layer: 'front', life: life(LIFE.match, env), sounds: ['abo-match'], node };
}

function nestBuilder(item, env) {
    const who = item.who ? `<span class="igs-abo-nest-who">${esc(item.who)}</span>` : '';
    const node = box(env, 'igs-abo-nest',
        `<div class="igs-abo-nest-badge"><svg viewBox="-50 -50 100 100" aria-hidden="true"><circle class="igs-abo-nest-ring" r="38"/><path class="igs-abo-nest-heart" d="M0 10c-9-6-12-11-12-15a6 6 0 0112-1 6 6 0 0112 1c0 4-3 9-12 15z" transform="scale(.8)"/></svg>${who}<em>筑巢中</em></div>`);
    const nestMs = life(LIFE.nest, env) - 600;
    reactSprite(env, item.who, [at(0, 'translate(0,0) scale(1)'), at(0.28, 'translate(0,1.4%) scale(.985)'), at(0.8, 'translate(0,1.4%) scale(.985)'), at(1, 'translate(0,0) scale(1)')], { duration: nestMs, delay: 300 });
    reactSprite(env, item.who, [atFilter(0, 'saturate(1) brightness(1)'), atFilter(0.3, 'saturate(1.1) brightness(1.04) hue-rotate(-5deg)'), atFilter(0.8, 'saturate(1.1) brightness(1.04) hue-rotate(-5deg)'), atFilter(1, 'saturate(1) brightness(1)')], { duration: nestMs, delay: 300 });
    return { layer: 'front', life: life(LIFE.nest, env), sounds: ['abo-nest', 'abo-cloth'], node };
}

function detectorBuilder(item, env) {
    const level = Math.max(0, Math.min(100, Number(item.level) || 0));
    const tone = level >= 75 ? 'bad' : (level >= 40 ? 'warn' : 'good');
    const g = gaugeHtml({ label: '浓度', value: level, max: 100, tone, text: `${level}%` });
    const alarm = level >= 75;
    const node = box(env, `igs-abo-detector is-${tone}`,
        `<div class="igs-abo-det-card"><div class="igs-abo-det-head"><b>信息素检测仪</b>${item.place ? `<span>${esc(item.place)}</span>` : ''}</div>`
        + `<div class="${g.className}" style="${g.style}">${g.html}</div><div class="igs-abo-det-state">${alarm ? '浓度超标' : (tone === 'warn' ? '浓度偏高' : '浓度正常')}</div></div>${alarm ? '<div class="igs-abo-det-flash"></div>' : ''}`);
    const value = typeof node.querySelector === 'function' ? node.querySelector('.igs-gauge-value') : null;
    if (value) rollNumber(value, 0, level, 1200, { reduced: env.reduced, format: (n) => `${Math.round(n)}%` });
    return { layer: 'front', life: life(LIFE.detector, env), sounds: [alarm ? 'abo-alarm' : 'abo-scan'], node };
}

function phaseBuilder(item, env) {
    const heat = item.phase === 'heat';
    const known = item.ratio >= 0;
    const g = gaugeHtml({ label: '剩余', value: known ? item.ratio : 100, max: 100, tone: heat ? 'warn' : 'bad', text: item.remain || (known ? `${item.ratio}%` : '') });
    const who = item.who ? `<span class="igs-abo-phase-who">${esc(item.who)}</span>` : '';
    const node = box(env, `igs-abo-phase is-${item.phase}`,
        `<div class="igs-abo-phase-card"><div class="igs-abo-phase-head"><b>${heat ? '发情期' : '易感期'}</b>${who}</div>${known ? `<div class="${g.className}" style="${g.style}">${g.html}</div>` : `<div class="igs-abo-phase-text">${esc(item.remain || '持续中')}</div>`}</div>`);
    return { layer: 'front', life: life(LIFE.phase, env), sounds: ['abo-pulse'], node };
}

export const ABO_BUILDERS = Object.freeze({
    scent: scentBuilder,
    scentlink: scentlinkBuilder,
    suppress: suppressBuilder,
    soothe: sootheBuilder,
    inhibitor: inhibitorBuilder,
    bond: bondBuilder,
    gendertest: gendertestBuilder,
    match: matchBuilder,
    nest: nestBuilder,
    detector: detectorBuilder,
    phase: phaseBuilder,
});
