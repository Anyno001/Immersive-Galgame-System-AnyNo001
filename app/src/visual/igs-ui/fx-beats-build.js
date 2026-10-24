import { prepareAncientPanel } from './ancient-panel-layout.js';
// 戏剧节拍的构建器：每个返回 { layer, life, sounds, node }，不满足条件时返回 null。
// 读立绘一律走 stage-snapshot（读当前 DOM，跟随服装表情）。减少动态效果时返回静态节点，寿命乘 env.hold。
import { esc } from './reader-value-utils.js';
import { charSpans, make } from './fx-daily-kit.js';
import { buildPanel, panelToneOf } from './fx-panel-kit.js';
import { rollNumber } from './fx-ticker.js';
import { drawLinks, LINK_MAX } from './fx-links.js';
import { cloneSpriteLayer, resolveHeadAnchor, resolveRegionCrop } from './stage-snapshot.js';
import { SPRITE_ACTION_FRAMES, playSpriteSpec } from './sprite-actions.js';
import { isLowQuality, punchStage } from './fx-beats-punch.js';
import { pushStage } from './fx-sprite-react.js';
import { buildItemCard } from './fx-item-card.js';
import { CROWD_CAPTIONS, PANEL_TYPE_LABELS } from './fx-beats-model.js';

export const BEATS_LIFE_MS = Object.freeze({ reveal: 3600, panel: 4200, count: 3600, evidence: 3800, link: 3800, crowd: 2400, reunion: 3200, order: 3600, os: 2600 });
const COUNT_ROLL_MS = 900;

const life = (key, env, extra = 0) => Math.round((BEATS_LIFE_MS[key] + extra) * Math.max(0.5, env.hold || 1));
const classOf = (name, env) => `igs-dfx igs-bt igs-bt-${name}${env.reduced ? ' is-reduced' : ''}${env.ancient ? ' is-ancient' : ''}`;

function part(doc, className, text) {
    const node = doc.createElement('div');
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

// 指名角色的立绘节点：省略或就是说话人时是 #igs-sprite，否则只在同屏陪衬里找；台上没有这个人返回 null（不拿说话人顶替）。
function spriteOn(env, who) {
    const name = String(who || '').trim();
    if (!name || name === env.speaker) return env.root.querySelector('#igs-sprite');
    return Array.from(env.root.querySelectorAll('.igs-cast-sprite')).find((el) => el.getAttribute('data-igs-cast-char') === name) || null;
}

function posXOf(el) {
    const m = el && el.style ? String(el.style.backgroundPosition || '').match(/(-?\d+(?:\.\d+)?)%/) : null;
    const x = m ? Number(m[1]) : 50;
    return Math.max(10, Math.min(90, Number.isFinite(x) ? x : 50));
}

function urlOfImage(image) {
    const m = String(image || '').match(/url\((['"]?)(.*?)\1\)/);
    return m ? m[2] : '';
}

function animateSprite(el, frames, options) {
    if (!el || typeof el.animate !== 'function') return null;
    try { return el.animate(frames, options); } catch { return null; }
}

const INITIAL_COLORS = Object.freeze(['#c2415b', '#2f7fb8', '#3f9a62', '#b8802a', '#7a5bc4', '#c4623a', '#2a9a9a', '#8a5a44']);

// 没有立绘时按姓名取一块实色底，同名恒同色。
function initialColor(name) {
    let h = 0;
    for (const ch of String(name || '').trim()) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return INITIAL_COLORS[h % INITIAL_COLORS.length];
}

// 圆形头像：台上有这个人就裁立绘当前的脸（B1 + B9），没有就用姓名首字。
function avatar(env, name, className) {
    const wrap = part(env.doc, className);
    wrap.setAttribute('aria-hidden', 'true');
    const sprite = spriteOn(env, name);
    if (sprite && String(name || '').trim()) {
        const crop = resolveRegionCrop({ url: urlOfImage(sprite.style && sprite.style.backgroundImage) }, 'face', 1, sprite.ownerDocument);
        const face = cloneSpriteLayer(env.root, name, { speaker: env.speaker, crop });
        if (face) {
            wrap.appendChild(face);
            return wrap;
        }
    }
    wrap.textContent = Array.from(String(name || '').trim())[0] || '?';
    wrap.className = `${className} is-initial`;
    wrap.setAttribute('style', `background:${initialColor(name)}`);
    return wrap;
}

function rowOf(text) {
    const m = String(text).match(/^(.{1,12}?)[：:]\s*(.+)$/);
    const value = m ? m[2] : String(text);
    const tone = /^[+＋]/.test(value) ? 'good' : /^[-－−]/.test(value) ? 'bad' : '';
    return m ? { label: m[1], value, ...(tone ? { tone } : {}) } : { label: '', value, ...(tone ? { tone } : {}) };
}

function decimalsOf(n) {
    const f = String(n).split('.')[1];
    return f ? Math.min(2, f.length) : 0;
}

function numberFormat(from, to) {
    const dec = Math.max(decimalsOf(from), decimalsOf(to));
    return (n) => {
        const [int, frac] = Number(n).toFixed(dec).split('.');
        const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return frac ? `${grouped}.${frac}` : grouped;
    };
}

const BOW_SPEC = Object.freeze({ duration: 1500, easing: 'ease-in-out', frames: ['translate(0,0) rotate(0deg)', 'translate(0,1.6%) rotate(2.2deg)', 'translate(0,1.8%) rotate(2.4deg)', 'translate(0,0) rotate(0deg)'] });
const TURN_SPEC = Object.freeze({ duration: 620, easing: 'cubic-bezier(.3,.8,.3,1)', frames: ['translate(0,0) rotate(0deg)', 'translate(-.6%,0) rotate(-1.2deg)', 'translate(0,0) rotate(0deg)'] });
const CROWD_SPRITE_ACTION = Object.freeze({ gasp: 'recoil', clap: 'nod', cheer: 'hop', laugh: 'shake', murmur: 'sway', hush: 'sink' });
const REUNION_SPEC = Object.freeze({ duration: 2600, easing: 'ease-in-out', frames: ['translate(0,0) rotate(0deg) scale(1)', 'translate(-1.2%,0) rotate(-1.2deg) scale(1.01)', 'translate(.4%,-.6%) rotate(.4deg) scale(1.025)', 'translate(0,0) rotate(0deg) scale(1)'] });

export const BEATS_BUILDERS = {
    // 揭晓定格：画面压暗，立绘黑白定格一瞬，一道光扫过，大字逐字砸下，副字随后落在横线下。
    reveal(item, env) {
        const sprite = env.root.querySelector('#igs-sprite');
        if (!env.reduced) {
            animateSprite(sprite, [{ filter: 'grayscale(0)' }, { filter: 'grayscale(1) contrast(1.35)', offset: 0.15 }, { filter: 'grayscale(1) contrast(1.35)', offset: 0.7 }, { filter: 'grayscale(0)' }], { duration: 2000, composite: 'add' });
            playSpriteSpec(sprite, { duration: 620, easing: 'ease-out', frames: ['translate(0,0)', 'translate(.5%,0)', 'translate(-.4%,0)', 'translate(.2%,0)', 'translate(0,0)'] });
            punchStage(env.layers.motion, { low: isLowQuality(env.root) });
        }
        const x = posXOf(sprite);
        const big = env.reduced ? esc(item.text) : charSpans(item.text, 110, 380);
        const sub = item.sub ? `<div class="igs-bt-reveal-sub">${esc(item.sub)}</div>` : '';
        const node = make(env.doc, classOf('reveal', env), `<i class="igs-bt-reveal-veil"></i><i class="igs-bt-reveal-beam" style="left:${x}%"></i><i class="igs-bt-reveal-scan"></i><div class="igs-bt-reveal-big">${big}</div>${sub}`);
        return { layer: 'front', life: life('reveal', env, Array.from(item.text).length * 110), sounds: ['bt-slam'], node };
    },

    // 系统 / 公告面板：复用小弹窗皮肤，类型标签收在卡内；行逐条浮现，突破额外带光点。
    panel(item, env) {
        const doc = env.doc;
        const tone = panelToneOf(env);
        const kind = PANEL_TYPE_LABELS[item.kind] ? item.kind : 'system';
        const wrap = make(doc, `igs-bt-panel-wrap is-${kind} is-tone-${tone}`);
        const panel = buildPanel(doc, { title: item.title, rows: item.rows.map(rowOf), env, tone });
        panel.insertBefore(part(doc, 'igs-bt-panel-chip', PANEL_TYPE_LABELS[kind]), panel.firstChild);
        if (env.ancient) prepareAncientPanel(panel);
        panel.setAttribute('role', 'status');
        panel.setAttribute('aria-label', `${PANEL_TYPE_LABELS[kind]}：${item.title}`);
        wrap.appendChild(panel);
        if (kind === 'breakthrough') wrap.appendChild(make(doc, 'igs-bt-panel-motes', [8, 22, 36, 50, 64, 78, 90].map((x, i) => `<i style="left:${x}%;animation-delay:${i * 210}ms"></i>`).join('')));
        const node = make(doc, classOf('panel', env));
        node.appendChild(wrap);
        return { layer: 'front', life: life('panel', env, item.rows.length * 300), sounds: ['bt-chime'], node };
    },

    // 数字滚动卡：标签、一串从起值滚到止值的数字、单位；有起值时再标出增减。
    count(item, env) {
        const doc = env.doc;
        const from = Number.isFinite(item.from) ? item.from : 0;
        const to = Number.isFinite(item.to) ? item.to : 0;
        const fmt = numberFormat(from, to);
        const dir = to > from ? 'up' : to < from ? 'down' : 'flat';
        const card = make(doc, `igs-bt-count-card is-${dir}`);
        card.setAttribute('role', 'status');
        card.setAttribute('aria-label', `${item.label || ''} ${fmt(to)}${item.unit || ''}`.trim());
        if (item.label) card.appendChild(part(doc, 'igs-bt-count-label', item.label));
        const row = make(doc, 'igs-bt-count-row');
        const num = part(doc, 'igs-bt-count-num', fmt(from));
        row.appendChild(num);
        if (item.unit) row.appendChild(part(doc, 'igs-bt-count-unit', item.unit));
        card.appendChild(row);
        if (from !== 0 && dir !== 'flat') card.appendChild(part(doc, 'igs-bt-count-delta', `${to > from ? '+' : '-'}${fmt(Math.abs(to - from))}`));
        rollNumber(num, from, to, COUNT_ROLL_MS, { reduced: env.reduced, format: fmt });
        const node = make(doc, classOf('count', env));
        node.appendChild(card);
        if (env.ancient) prepareAncientPanel(card);
        return { layer: 'front', life: life('count', env), sounds: ['bt-tick'], node };
    },

    // 出示证据沿用物品小弹窗的卡片与皮肤；只复用视图，不进入物品的获得/背包状态机。
    evidence(item, env) {
        let imageUrl = '';
        try { imageUrl = typeof env.resolveItemImage === 'function' ? env.resolveItemImage(item.name) : ''; } catch { /* 缺图显示物品占位图标 */ }
        const card = buildItemCard(env.doc, {
            action: 'present', actionLabel: '出示证据', name: item.name,
            description: item.desc, imageUrl,
        });
        const stack = make(env.doc, 'igs-fx-item-stack igs-bt-evidence-stack');
        stack.appendChild(card);
        const node = make(env.doc, classOf('evidence', { ...env, ancient: false }));
        node.appendChild(stack);
        return { layer: 'front', life: life('evidence', env), sounds: ['bt-slap'], node };
    },

    // 红线 / 视线 / 光丝：连在两个人的头部之间；台上没有的一端落在画面另一侧。同页最多 LINK_MAX 条。
    link(item, env) {
        const stage = env.layers.stage;
        if (stage && stage.querySelectorAll('.igs-bt-link').length >= LINK_MAX) return null;
        const onA = Boolean(spriteOn(env, item.from)) && String(item.from).trim() !== '';
        const onB = Boolean(spriteOn(env, item.to)) && String(item.to).trim() !== '';
        const anchorX = (name) => resolveHeadAnchor(env, name).x;
        const end = (on, name, other) => {
            if (on) return name;
            return { x: other !== null && other < 50 ? 78 : 22, y: 34 };
        };
        const ax = onA ? anchorX(item.from) : null;
        const bx = onB ? anchorX(item.to) : null;
        let from = end(onA, item.from, bx);
        let to = end(onB, item.to, ax);
        if (!onA && !onB) {
            from = { x: 24, y: 34 };
            to = { x: 76, y: 34 };
        }
        const style = item.style === 'gaze' ? 'gaze' : item.style === 'thread' ? 'thread' : 'redline';
        const links = style === 'thread'
            ? [{ from, to, tone: 'pink', style: 'mist' }, { from, to, tone: 'white', style: 'line' }]
            : [{ from, to, tone: style === 'gaze' ? 'cyan' : 'red', style: 'line' }];
        const node = make(env.doc, `${classOf('link', env)} igs-bt-link-${style}`);
        if (!drawLinks(node, links, env, { reduced: env.reduced })) return null;
        return { layer: 'stage', life: life('link', env), sounds: ['bt-thread'], node };
    },

    // 众人反应：人群氛围层（若开着）整群起反应，同屏立绘一起动，上方落一行字幕；转头、鞠躬是这里新增的两档。
    crowd(item, env) {
        const reaction = Object.hasOwn(CROWD_CAPTIONS, item.reaction) ? item.reaction : 'murmur';
        const layer = env.root.querySelector('#igs-crowd');
        if (layer) {
            layer.setAttribute('data-react', reaction);
            if (reaction !== 'hush' && reaction !== 'turn') {
                globalThis.setTimeout(() => { if (layer.getAttribute('data-react') === reaction) layer.removeAttribute('data-react'); }, 1800);
            }
        }
        if (!env.reduced) {
            const spec = reaction === 'bow' ? BOW_SPEC : reaction === 'turn' ? TURN_SPEC : SPRITE_ACTION_FRAMES[CROWD_SPRITE_ACTION[reaction]];
            playSpriteSpec(env.root.querySelector('#igs-sprite'), spec);
            playSpriteSpec(env.root.querySelector('#igs-cast'), spec);
            pushStage(env, { scale: 1.015, duration: 1600 });
        }
        const text = item.text || CROWD_CAPTIONS[reaction];
        const node = make(env.doc, `${classOf('crowd', env)} is-${reaction}`, `<div class="igs-bt-crowd-chip">${esc(text)}</div>`);
        return { layer: 'front', life: life('crowd', env), sounds: [reaction === 'clap' || reaction === 'cheer' ? 'bt-applause' : 'bt-murmur'], node };
    },

    // 慢动作回眸重逢：暖光从人物身后涌开，一圈光环缓缓扩散，立绘留下一道淡淡的残影，几点光尘升起。
    reunion(item, env) {
        const doc = env.doc;
        const named = String(item.who || '').trim();
        const target = spriteOn(env, named);
        const x = posXOf(target);
        const node = make(doc, classOf('reunion', env));
        node.setAttribute('style', `--igs-bt-x:${x}%`);
        node.appendChild(make(doc, 'igs-bt-reunion-vig'));
        node.appendChild(make(doc, 'igs-bt-reunion-halo'));
        node.appendChild(make(doc, 'igs-bt-reunion-ring'));
        node.appendChild(make(doc, 'igs-bt-reunion-ring is-b'));
        if (target && !env.reduced) {
            const ghost = cloneSpriteLayer(env.root, named, { speaker: env.speaker, filter: 'brightness(1.35) saturate(.85)' });
            if (ghost) {
                const holder = make(doc, 'igs-bt-reunion-ghost');
                holder.appendChild(ghost);
                node.appendChild(holder);
            }
            playSpriteSpec(target, REUNION_SPEC);
        }
        node.appendChild(make(doc, 'igs-bt-reunion-motes', [-18, -9, 0, 9, 18, 4, -4].map((dx, i) => `<i style="left:calc(${x}% + ${dx}%);animation-delay:${i * 260}ms"></i>`).join('')));
        return { layer: 'stage', life: life('reunion', env), sounds: ['bt-glow'], node };
    },

    // 行动顺序条：顶部一条横幅，按先后排出头像与名字，第一位高亮。台上有立绘的用当前的脸，没有的用姓名首字。
    order(item, env) {
        const doc = env.doc;
        const bar = make(doc, 'igs-bt-order-bar');
        bar.appendChild(part(doc, 'igs-bt-order-label', '先攻'));
        item.names.forEach((name, index) => {
            const chip = make(doc, `igs-bt-order-chip${index === 0 ? ' is-first' : ''}`);
            chip.setAttribute('style', `--igs-bt-i:${index}`);
            chip.appendChild(part(doc, 'igs-bt-order-no', String(index + 1)));
            chip.appendChild(avatar(env, name, 'igs-bt-order-ava'));
            chip.appendChild(part(doc, 'igs-bt-order-name', name));
            bar.appendChild(chip);
        });
        const node = make(doc, classOf('order', env));
        node.appendChild(bar);
        return { layer: 'front', life: life('order', env, item.names.length * 140), sounds: ['bt-order'], node };
    },

    // 内心独白：屏幕一角，离说话人远的那一侧，小字逐字淡入再淡出。
    os(item, env) {
        const sprite = env.root.querySelector('#igs-sprite');
        const side = posXOf(sprite) < 50 ? 'is-right' : 'is-left';
        const body = env.reduced ? esc(item.text) : charSpans(item.text, 60, 300);
        const node = make(env.doc, `${classOf('os', env)} ${side}`, `<div class="igs-bt-os-text">${body}</div>`);
        return { layer: 'front', life: life('os', env, Array.from(item.text).length * 90), sounds: ['bt-whisper'], node };
    },
};
