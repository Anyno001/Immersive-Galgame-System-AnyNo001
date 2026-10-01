import { worldSkinOf } from '../../scene/worldview.js';

// 日常演出运行时：reader-dom-render 每次渲染调用一次 renderDailyFx。
// 卡片类演出挂在 #igs-fx-front（对话层之上），触碰与飘花挂在 #igs-fx-stage（立绘之上、对话层之下），
// 烟花挂在紧贴 #igs-bg 之后的天空层（背景之上、立绘之下）。同一次停留内重绘不重播，翻页清理上一页卡片，烟花与飘花跨页持续。
import { ensureFxLayers } from './fx-layer.js';
import { esc } from './reader-value-utils.js';
import { prefersReducedMotion } from './reduced-motion.js';
import { FX_HOLD_SCALE, normalizeFxSoundSettings, normalizeFxStyleSettings } from './fx-settings.js';
import { normalizeDailyFxSettings, planDailyFx } from './fx-daily-model.js';
import { playDailySfx } from './fx-daily-sfx.js';
import { resolvePetalKind, startFireworks, startLanterns, startPetals } from './fx-daily-particles.js';
import { playSpriteSpec } from './sprite-actions.js';

export const DAILY_FX_LIFETIME_MS = Object.freeze({
    timeskip: 2900, photo: 3600, letterBase: 1100, letterPerChar: 55, letterHold: 2800, note: 3800, bell: 4700,
    broadcastBase: 1500, broadcastPerChar: 110, broadcastMin: 3000, fireworks: 5600, touch: 2600, alarm: 3200,
    omikuji: 5000, receiptPrint: 1100, receiptHold: 3400, tvBase: 1600, tvPerChar: 140, tvMin: 3200,
});
const SEEN_LIMIT = 128;
const HEART_COUNT = 7;

const states = new WeakMap();

function getState(root, ctx) {
    let state = states.get(root);
    if (!state) {
        state = {
            pageKey: '', visitKey: '', visitSeen: new Set(), seen: new Set(), transients: new Set(), timers: new Set(),
            fireworks: null, petals: null, petalKind: '', sky: null, petalLayer: null,
        };
        states.set(root, state);
    }
    state.schedule = typeof ctx.schedule === 'function' ? ctx.schedule : (fn, delay) => setTimeout(fn, delay);
    state.clear = typeof ctx.clear === 'function' ? ctx.clear : (timer) => clearTimeout(timer);
    return state;
}

function later(state, fn, delay) {
    const timer = state.schedule(() => {
        state.timers.delete(timer);
        fn();
    }, delay);
    state.timers.add(timer);
}

function removeNode(node) {
    if (node && node.parentNode && typeof node.parentNode.removeChild === 'function') node.parentNode.removeChild(node);
}

function make(doc, className, html = '') {
    const node = doc.createElement('div');
    node.className = className;
    if (html) node.innerHTML = html;
    return node;
}

function spawn(state, parent, node, life) {
    parent.appendChild(node);
    if (node.style && typeof node.style.setProperty === 'function') node.style.setProperty('--igs-dfx-life', `${life}ms`);
    state.transients.add(node);
    later(state, () => {
        removeNode(node);
        state.transients.delete(node);
    }, life);
    return node;
}

function clearTransients(state) {
    for (const node of state.transients) removeNode(node);
    state.transients.clear();
}

function markPage(state, key, replay) {
    const fresh = !state.seen.has(key);
    state.seen.add(key);
    if (state.seen.size > SEEN_LIMIT) state.seen.delete(state.seen.values().next().value);
    if (state.visitSeen.has(key)) return false;
    state.visitSeen.add(key);
    return replay || fresh;
}

function chars(value) {
    return Array.from(String(value || ''));
}

function charSpans(value, stepMs, startMs) {
    return chars(value).map((ch, index) => `<span style="animation-delay:${startMs + index * stepMs}ms">${esc(ch)}</span>`).join('');
}

const CLOCK_TICKS = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    const r1 = i % 3 === 0 ? 34 : 37;
    return `<line x1="${(50 + Math.sin(a) * r1).toFixed(1)}" y1="${(50 - Math.cos(a) * r1).toFixed(1)}" x2="${(50 + Math.sin(a) * 41).toFixed(1)}" y2="${(50 - Math.cos(a) * 41).toFixed(1)}"/>`;
}).join('');
const CLOCK_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle class="igs-dfx-clock-face" cx="50" cy="50" r="45"/><g class="igs-dfx-clock-ticks">${CLOCK_TICKS}</g><line class="igs-dfx-clock-h" x1="50" y1="50" x2="50" y2="29"/><line class="igs-dfx-clock-m" x1="50" y1="50" x2="50" y2="15"/><circle class="igs-dfx-clock-pin" cx="50" cy="50" r="3"/></svg>`;
const BELL_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a1.4 1.4 0 0 1 1.4 1.4v.5A6 6 0 0 1 18 10.8v3.6l1.6 2.3a.8.8 0 0 1-.7 1.3H5.1a.8.8 0 0 1-.7-1.3L6 14.4v-3.6a6 6 0 0 1 4.6-5.9v-.5A1.4 1.4 0 0 1 12 3Z"/><path d="M9.8 19.2a2.2 2.2 0 0 0 4.4 0Z"/></svg>';
const SPEAKER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="igs-dfx-spk-body" d="M3 9.5h3.6L11 5.6v12.8l-4.4-3.9H3z"/><path class="igs-dfx-spk-w1" d="M14.2 9.2a4 4 0 0 1 0 5.6"/><path class="igs-dfx-spk-w2" d="M16.8 6.8a7.4 7.4 0 0 1 0 10.4"/></svg>';
const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3 4.6 13a4.7 4.7 0 0 1 6.6-6.7l.8.8.8-.8A4.7 4.7 0 0 1 19.4 13Z"/></svg>';

function readStageBackground(root) {
    const pick = (el) => {
        if (!el || !el.style) return null;
        return {
            image: el.style.backgroundImage || '',
            size: el.style.backgroundSize || '',
            position: el.style.backgroundPosition || '',
            visible: el.style.display !== 'none' && Boolean(el.style.backgroundImage),
            // 站位「背对」：陪衬带 data-igs-cast-flip、说话人带 data-igs-sprite-flip，合成图同样水平镜像。
            flip: typeof el.hasAttribute === 'function' && (el.hasAttribute('data-igs-cast-flip') || el.hasAttribute('data-igs-sprite-flip')),
        };
    };
    const rect = typeof root.getBoundingClientRect === 'function' ? root.getBoundingClientRect() : null;
    const aspect = rect && rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 16 / 9;
    const castLayer = root.querySelector('#igs-cast');
    const cast = castLayer
        ? Array.from(castLayer.children || []).filter((el) => !el.hasAttribute('data-igs-cast-leaving')).map(pick).filter((layer) => layer && layer.visible)
        : [];
    return { bg: pick(root.querySelector('#igs-bg')), sprite: pick(root.querySelector('#igs-sprite')), cast, aspect };
}

function layerStyle(layer) {
    if (!layer || !layer.image) return '';
    const parts = [`background-image:${layer.image.replace(/"/g, '&quot;')}`];
    if (layer.size) parts.push(`background-size:${layer.size}`);
    if (layer.position) parts.push(`background-position:${layer.position}`);
    if (layer.flip) {
        // 与舞台一致：绕图的中心水平镜像（原点 = posX + scale × (50 - posX) / 100），否则合成图会整体平移。
        const posX = parseFloat(String(layer.position || '').split(/\s+/)[0]);
        const size = parseFloat(String(layer.size || ''));
        const origin = Number.isFinite(posX) && Number.isFinite(size) ? Math.round((posX + size * (50 - posX) / 100) * 100) / 100 : 50;
        parts.push(`transform:scaleX(-1)`, `transform-origin:${origin}% 100%`);
    }
    return parts.join(';');
}

function omikujiTone(result) {
    if (result === '大吉') return 'great';
    if (result === '凶' || result === '大凶') return 'bad';
    return 'good';
}

// 古代背景的签等：日式吉凶折成中式五等签，色调类沿用 omikujiTone。
const ANCIENT_LOTS = Object.freeze({ 大吉: '上上签', 中吉: '上签', 吉: '上签', 小吉: '中签', 末吉: '中签', 凶: '下签', 大凶: '下下签' });
const CN_DIGITS = '〇一二三四五六七八九';

export function ancientLotOf(result) {
    return ANCIENT_LOTS[result] || '中签';
}

// 签号由结果与签文散列得出（1–100），同一支签重播时号数不变。
function lotNumber(seed) {
    let h = 7;
    for (const ch of String(seed)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    const n = (h % 100) + 1;
    if (n === 100) return '一百';
    const t = Math.floor(n / 10);
    const u = n % 10;
    return `${t > 1 ? CN_DIGITS[t] : ''}${t ? '十' : ''}${u ? CN_DIGITS[u] : ''}`;
}

function nowClock() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 结果类日常演出的停留时长（未并入导出的 DAILY_FX_LIFETIME_MS，避免改变其既有结构）。
const DAILY_RESULT_LIFE_MS = Object.freeze({ rps: 2600, gacha: 3000, game: 2200, score: 2800, pat: 2000, poke: 900, fever: 2800, cheers: 2000, cook: 3000, cat: 2200, guqin: 3200, go: 2600, poem: 4200, edict: 4200, tea: 2600, bow: 900 });
// 行礼：立绘微沉再起，add 合成叠加，结束后自动还原。
const BOW_SPEC = Object.freeze({ duration: 760, easing: 'ease-in-out', frames: ['translate(0,0)', 'translate(0,2.2%)', 'translate(0,2.2%)', 'translate(0,0)'] });
// 捏脸：横向挤扁再回弹，composite:'add' 叠加在呼吸与动作之上，结束后自动还原。
const POKE_SPEC = Object.freeze({ duration: 420, easing: 'ease-out', frames: ['scale(1,1)', 'scale(.92,1.03)', 'scale(1.03,.99)', 'scale(1,1)'] });
const HAND_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V10h.5V4.5a1.5 1.5 0 0 1 3 0V10h.5V5.5a1.5 1.5 0 0 1 3 0V11h.5V8.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5A6.5 6.5 0 0 1 7 14.5Z"/></svg>';

// 立绘 background-position 横向百分比；读不到时居中，并收在 10–90 之间避免贴边。
function spritePosX(layer) {
    const m = layer && layer.visible ? String(layer.position || '').match(/(-?\d+(?:\.\d+)?)%/) : null;
    const x = m ? Number(m[1]) : 50;
    return Math.max(10, Math.min(90, Number.isFinite(x) ? x : 50));
}

// 每个构建器返回 { node, life, layer: 'front' | 'stage', sounds: [...] }。
// env.ancient 为古代背景：时间跳跃换成一炷香 + 更鼓，便签换成对折字条，信件换成竖排信笺 + 落款小印，
// 御神籤换成竹签筒 + 竖排签文（烟花换孔明灯见 playFireworks）。
const BUILDERS = {
    timeskip(item, env) {
        const life = Math.round(DAILY_FX_LIFETIME_MS.timeskip * Math.max(1, env.hold));
        const text = `<div class="igs-dfx-timeskip-text"><i></i><span>${esc(item.text)}</span><i></i></div>`;
        if (env.ancient) {
            return {
                layer: 'front', life, sounds: ['drum'],
                node: make(env.doc, 'igs-dfx igs-dfx-timeskip is-ancient', `<div class="igs-dfx-veil"></div><div class="igs-dfx-incense"><i class="igs-dfx-stick"><i class="igs-dfx-smoke"></i><i class="igs-dfx-smoke is-b"></i></i><i class="igs-dfx-censer"></i></div>${text}`),
            };
        }
        return {
            layer: 'front', life, sounds: ['clock'],
            node: make(env.doc, 'igs-dfx igs-dfx-timeskip', `<div class="igs-dfx-veil"></div><div class="igs-dfx-clock">${CLOCK_SVG}</div><div class="igs-dfx-timeskip-text"><i></i><span>${esc(item.text)}</span><i></i></div>`),
        };
    },
    photo(item, env) {
        const shot = readStageBackground(env.root);
        const castHtml = shot.cast.map((layer) => `<div class="igs-dfx-photo-sprite" style="${layerStyle(layer)}"></div>`).join('');
        const img = `<div class="igs-dfx-photo-img" style="aspect-ratio:${shot.aspect.toFixed(4)}"><div class="igs-dfx-photo-bg" style="${layerStyle(shot.bg)}"></div>${castHtml}${shot.sprite && shot.sprite.visible ? `<div class="igs-dfx-photo-sprite" style="${layerStyle(shot.sprite)}"></div>` : ''}<div class="igs-dfx-photo-gloss"></div></div>`;
        const caption = item.caption ? `<div class="igs-dfx-photo-cap">${esc(item.caption)}</div>` : '<div class="igs-dfx-photo-cap"></div>';
        if (typeof env.onPhoto === 'function') {
            try { env.onPhoto({ messageId: env.messageId, caption: item.caption || '', bg: shot.bg, sprite: shot.sprite && shot.sprite.visible ? shot.sprite : null, cast: shot.cast, aspect: shot.aspect }); } catch { /* 相册写入失败不影响演出 */ }
        }
        return {
            layer: 'front', life: Math.round(DAILY_FX_LIFETIME_MS.photo * env.hold), sounds: ['shutter'],
            node: make(env.doc, 'igs-dfx igs-dfx-photo', `<div class="igs-dfx-flash"></div><div class="igs-dfx-polaroid">${img}${caption}</div>`),
        };
    },
    letter(item, env) {
        const n = chars(item.text).length;
        const life = DAILY_FX_LIFETIME_MS.letterBase + n * DAILY_FX_LIFETIME_MS.letterPerChar + Math.round(DAILY_FX_LIFETIME_MS.letterHold * env.hold);
        const sign = item.from ? `<div class="igs-dfx-letter-sign">${env.ancient ? '' : '—— '}${esc(item.from)}</div>` : '';
        return {
            layer: 'front', life, sounds: ['paper'],
            node: make(env.doc, env.ancient ? 'igs-dfx igs-dfx-letter is-ancient' : 'igs-dfx igs-dfx-letter', `<div class="igs-dfx-paper"><div class="igs-dfx-letter-body">${charSpans(item.text, DAILY_FX_LIFETIME_MS.letterPerChar, 620)}</div>${sign}</div>`),
        };
    },
    note(item, env) {
        if (env.ancient) {
            return {
                layer: 'front', life: Math.round(DAILY_FX_LIFETIME_MS.note * env.hold), sounds: ['paper'],
                node: make(env.doc, 'igs-dfx igs-dfx-note is-ancient', `<div class="igs-dfx-scrap">${esc(item.text)}</div>`),
            };
        }
        return {
            layer: 'front', life: Math.round(DAILY_FX_LIFETIME_MS.note * env.hold), sounds: ['sticky'],
            node: make(env.doc, 'igs-dfx igs-dfx-note', `<div class="igs-dfx-sticky"><i class="igs-dfx-tape"></i><div>${esc(item.text)}</div></div>`),
        };
    },
    bell(item, env) {
        return {
            layer: 'front', life: DAILY_FX_LIFETIME_MS.bell, sounds: ['bell'],
            node: make(env.doc, 'igs-dfx igs-dfx-bell', `<div class="igs-dfx-chip"><span class="igs-dfx-bell-icon">${BELL_SVG}</span><span class="igs-dfx-notes"><b>♪</b><b>♫</b><b>♪</b><b>♫</b></span></div>`),
        };
    },
    broadcast(item, env) {
        const n = chars(item.text).length;
        const life = DAILY_FX_LIFETIME_MS.broadcastBase + Math.round(Math.max(DAILY_FX_LIFETIME_MS.broadcastMin, n * DAILY_FX_LIFETIME_MS.broadcastPerChar) * env.hold);
        return {
            layer: 'front', life, sounds: ['broadcast'],
            node: make(env.doc, 'igs-dfx igs-dfx-broadcast', `<div class="igs-dfx-banner"><span class="igs-dfx-spk">${SPEAKER_SVG}</span><span class="igs-dfx-banner-label">广播</span><span class="igs-dfx-banner-text">${esc(item.text)}</span></div>`),
        };
    },
    touch(item, env) {
        const hearts = Array.from({ length: HEART_COUNT }, (_, i) => {
            const x = 14 + ((i * 37) % 72);
            return `<i style="left:${x}%;animation-delay:${i * 150}ms;--igs-dfx-s:${(0.7 + ((i * 13) % 5) / 10).toFixed(2)}">${HEART_SVG}</i>`;
        }).join('');
        return {
            layer: 'stage', life: DAILY_FX_LIFETIME_MS.touch, sounds: ['touch'],
            node: make(env.doc, 'igs-dfx igs-dfx-touch', `<div class="igs-dfx-warm"></div><div class="igs-dfx-hearts">${hearts}</div>`),
        };
    },
    alarm(item, env) {
        return {
            layer: 'front', life: DAILY_FX_LIFETIME_MS.alarm, sounds: ['alarm', 'vibrate'],
            node: make(env.doc, 'igs-dfx igs-dfx-alarm', `<div class="igs-dfx-phone"><div class="igs-dfx-phone-screen"><span class="igs-dfx-alarm-label">${BELL_SVG}闹钟</span><b>${esc(item.time || nowClock())}</b><span class="igs-dfx-alarm-bar"><i>稍后提醒</i><i>停止</i></span></div></div>`),
        };
    },
    omikuji(item, env) {
        const tone = omikujiTone(item.result);
        const extra = item.text ? `<div class="igs-dfx-slip-text">${esc(item.text)}</div>` : '';
        const life = Math.round(DAILY_FX_LIFETIME_MS.omikuji * Math.max(1, env.hold));
        if (env.ancient) {
            // 签筒前倾摇动，掉出一支红头竹签，随后展开竖排签文；摇签声沿用竹签碰撞的 omikuji。
            const sticks = '<span class="igs-dfx-qian-sticks"><i></i><i></i><i></i><i></i><i></i></span>';
            return {
                layer: 'front', life, sounds: ['omikuji'],
                node: make(env.doc, `igs-dfx igs-dfx-omikuji is-ancient is-${tone}`, `<div class="igs-dfx-qian"><div class="igs-dfx-qian-tube">${sticks}<span class="igs-dfx-qian-label">灵签</span></div><i class="igs-dfx-qian-stick"></i></div><div class="igs-dfx-slip"><div class="igs-dfx-slip-head">第${lotNumber(`${item.result}|${item.text || ''}`)}签</div><div class="igs-dfx-slip-result">${ancientLotOf(item.result)}</div>${extra}</div>`),
            };
        }
        return {
            layer: 'front', life, sounds: ['omikuji'],
            node: make(env.doc, `igs-dfx igs-dfx-omikuji is-${tone}`, `<div class="igs-dfx-kuji-box"><span>御神籤</span><i class="igs-dfx-kuji-stick"></i></div><div class="igs-dfx-slip"><div class="igs-dfx-slip-head">御神籤</div><div class="igs-dfx-slip-result">${esc(item.result)}</div>${extra}</div>`),
        };
    },
    receipt(item, env) {
        const lines = item.items.map((line) => `<div class="igs-dfx-rc-line"><span>${esc(line)}</span></div>`).join('');
        const total = item.total ? `<div class="igs-dfx-rc-total"><span>合计</span><span>${esc(item.total)}</span></div>` : '';
        const life = DAILY_FX_LIFETIME_MS.receiptPrint + Math.round(DAILY_FX_LIFETIME_MS.receiptHold * env.hold);
        return {
            layer: 'front', life, sounds: ['receipt'],
            node: make(env.doc, 'igs-dfx igs-dfx-receipt', `<div class="igs-dfx-rc-slot"></div><div class="igs-dfx-rc-paper"><div class="igs-dfx-rc-shop">${esc(item.shop || 'RECEIPT')}</div><div class="igs-dfx-rc-rule"></div>${lines}<div class="igs-dfx-rc-rule"></div>${total}<div class="igs-dfx-rc-thanks">谢谢惠顾</div></div>`),
        };
    },
    tv(item, env) {
        const n = chars(item.text).length;
        const life = DAILY_FX_LIFETIME_MS.tvBase + Math.round(Math.max(DAILY_FX_LIFETIME_MS.tvMin, n * DAILY_FX_LIFETIME_MS.tvPerChar) * env.hold);
        const scroll = n > 16 ? ' is-scroll' : '';
        return {
            layer: 'front', life, sounds: ['tv-on'],
            node: make(env.doc, 'igs-dfx igs-dfx-tv', `<div class="igs-dfx-crt"><div class="igs-dfx-crt-screen"><div class="igs-dfx-crt-static"></div><div class="igs-dfx-crt-content"><span class="igs-dfx-crt-ch">${esc(item.channel || 'LIVE')}</span><div class="igs-dfx-crt-ticker${scroll}"><span>${esc(item.text)}</span></div></div><div class="igs-dfx-crt-lines"></div></div></div>`),
        };
    },
    // 结果类：结果完全来自标签字段，前端不掷骰、不编造；音效复用既有预设。
    rps(item, env) {
        const hand = { rock: '✊', scissors: '✌', paper: '✋' };
        const name = { rock: '石头', scissors: '剪刀', paper: '布' };
        const verdict = { win: '你赢了', lose: '你输了', draw: '平局' }[item.outcome] || '';
        const node = make(env.doc, `igs-dfx igs-dfx-rps is-${item.outcome || 'draw'}`, `<div class="igs-dfx-rps-hands"><span class="igs-dfx-rps-hand is-mine" aria-label="${name[item.mine] || ''}">${hand[item.mine] || ''}</span><span class="igs-dfx-rps-vs">VS</span><span class="igs-dfx-rps-hand is-theirs" aria-label="${name[item.theirs] || ''}">${hand[item.theirs] || ''}</span></div><div class="igs-dfx-rps-verdict">${verdict}</div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.rps * env.hold), sounds: ['sticky'], node };
    },
    gacha(item, env) {
        const node = make(env.doc, 'igs-dfx igs-dfx-gacha', `<div class="igs-dfx-gacha-capsule"><i class="igs-dfx-gacha-top"></i><i class="igs-dfx-gacha-bottom"></i></div><div class="igs-dfx-gacha-item">${esc(item.item)}</div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.gacha * env.hold), sounds: ['omikuji'], node };
    },
    game(item, env) {
        const word = { win: 'WIN', lose: 'LOSE', draw: 'DRAW' }[item.result] || 'DRAW';
        const node = make(env.doc, `igs-dfx igs-dfx-game is-${item.result || 'draw'}`, `<div class="igs-dfx-game-word">${word}</div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.game * env.hold), sounds: ['bell'], node };
    },
    score(item, env) {
        const stamp = item.fail ? '<div class="igs-dfx-score-stamp">不及格</div>' : '';
        const node = make(env.doc, `igs-dfx igs-dfx-score${item.fail ? ' is-fail' : ''}`, `<div class="igs-dfx-score-card"><div class="igs-dfx-score-subject">${esc(item.subject)}</div><div class="igs-dfx-score-value">${esc(item.score)}</div>${stamp}</div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.score * env.hold), sounds: ['paper'], node };
    },
    // 身体接触：只作用于当前说话人立绘；角色参数留给多人同屏定位，本期不区分。
    pat(item, env) {
        const x = spritePosX(readStageBackground(env.root).sprite);
        const node = make(env.doc, 'igs-dfx igs-dfx-pat', `<div class="igs-dfx-pat-hand" style="left:${x}%">${HAND_SVG}</div><div class="igs-dfx-pat-flowers" style="left:${x}%"><i>✿</i><i>✿</i><i>✿</i></div>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.pat * env.hold), sounds: ['touch'], node };
    },
    poke(item, env) {
        const sprite = env.root.querySelector('#igs-sprite');
        const visible = sprite && sprite.style && sprite.style.backgroundImage && sprite.style.display !== 'none';
        if (!visible || env.reduced) return null;
        if (!playSpriteSpec(sprite, POKE_SPEC)) return null;
        const x = spritePosX(readStageBackground(env.root).sprite);
        const node = make(env.doc, 'igs-dfx igs-dfx-poke', `<div class="igs-dfx-poke-puff" style="left:${x}%">噗</div>`);
        return { layer: 'stage', life: DAILY_RESULT_LIFE_MS.poke, sounds: ['sticky'], node };
    },
    fever(item, env) {
        const node = make(env.doc, `igs-dfx igs-dfx-fever${item.high ? ' is-high' : ''}`, `<div class="igs-dfx-fever-meter"><i class="igs-dfx-fever-bulb"></i><span class="igs-dfx-fever-value">${esc(item.temp)}℃</span></div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.fever * env.hold), sounds: ['paper'], node };
    },
    // 其余日常：碰杯、做饭（只出料理卡，不走物品演出）、撸猫（肉球印，不出猫叫）。
    cheers(item, env) {
        const node = make(env.doc, 'igs-dfx igs-dfx-cheers', '<div class="igs-dfx-cheers-cups"><i class="igs-dfx-cheers-cup is-left">🥂</i><i class="igs-dfx-cheers-cup is-right">🥂</i></div><div class="igs-dfx-cheers-splash"><i></i><i></i><i></i></div>');
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.cheers * env.hold), sounds: ['touch'], node };
    },
    cook(item, env) {
        const node = make(env.doc, 'igs-dfx igs-dfx-cook', `<div class="igs-dfx-cook-card"><div class="igs-dfx-cook-steam"><i></i><i></i><i></i></div><div class="igs-dfx-cook-label">完成</div><div class="igs-dfx-cook-dish">${esc(item.dish)}</div></div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.cook * env.hold), sounds: ['lantern'], node };
    },
    cat(item, env) {
        const paws = [[22, 58], [34, 40], [48, 52], [62, 36], [74, 50]]
            .map(([x, y], i) => `<i style="left:${x}%;top:${y}%;animation-delay:${i * 180}ms">🐾</i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-cat', `<div class="igs-dfx-cat-paws">${paws}</div>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.cat * env.hold), sounds: ['sticky'], node };
    },
    // 古风独有：只在古代模式可用（fx-era 在现代模式拨掉）；音效复用既有预设，不新增音色。
    guqin(item, env) {
        const notes = [18, 34, 52, 68, 82].map((x, i) => `<i style="left:${x}%;animation-delay:${i * 260}ms">♪</i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-guqin', `<div class="igs-dfx-guqin-strings"><i></i><i></i><i></i><i></i><i></i></div><div class="igs-dfx-guqin-notes">${notes}</div>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.guqin * env.hold), sounds: ['lantern'], node };
    },
    go(item, env) {
        const verdict = { win: '胜', lose: '败', draw: '和' }[item.result] || '';
        const node = make(env.doc, 'igs-dfx igs-dfx-go', `<div class="igs-dfx-go-board"><i class="igs-dfx-go-stone"></i></div>${verdict ? `<div class="igs-dfx-go-verdict">${verdict}</div>` : ''}`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.go * env.hold), sounds: ['sticky'], node };
    },
    poem(item, env) {
        const node = make(env.doc, 'igs-dfx igs-dfx-poem', `<div class="igs-dfx-poem-paper"><div class="igs-dfx-poem-text">${esc(item.text)}</div><div class="igs-dfx-poem-seal">印</div></div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.poem * env.hold), sounds: ['paper'], node };
    },
    edict(item, env) {
        const node = make(env.doc, 'igs-dfx igs-dfx-edict', `<div class="igs-dfx-edict-scroll"><i class="igs-dfx-edict-rod is-left"></i><div class="igs-dfx-edict-body">${esc(item.text)}</div><i class="igs-dfx-edict-rod is-right"></i></div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.edict * env.hold), sounds: ['paper'], node };
    },
    tea(item, env) {
        const node = make(env.doc, 'igs-dfx igs-dfx-tea', '<div class="igs-dfx-tea-cup"><div class="igs-dfx-tea-steam"><i></i><i></i><i></i></div><i class="igs-dfx-tea-bowl"></i></div>');
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.tea * env.hold), sounds: ['lantern'], node };
    },
    bow(item, env) {
        const sprite = env.root.querySelector('#igs-sprite');
        const visible = sprite && sprite.style && sprite.style.backgroundImage && sprite.style.display !== 'none';
        if (!visible || env.reduced) return null;
        if (!playSpriteSpec(sprite, BOW_SPEC)) return null;
        return { layer: 'stage', life: DAILY_RESULT_LIFE_MS.bow, sounds: [], node: make(env.doc, 'igs-dfx igs-dfx-bow') };
    },

};

function ensureSky(state, root, doc) {
    if (state.sky && state.sky.parentNode) return state.sky;
    const bg = root.querySelector('#igs-bg');
    if (!bg || !bg.parentNode) return null;
    const sky = make(doc, 'igs-dfx-sky');
    bg.parentNode.insertBefore(sky, bg.nextSibling || null);
    state.sky = sky;
    return sky;
}

function playFireworks(state, env) {
    const sky = ensureSky(state, env.root, env.doc);
    if (!sky) return false;
    if (state.fireworks) {
        try { state.fireworks.stop(); } catch { /* 已结束 */ }
    }
    const glowClass = env.ancient ? `igs-dfx-sky-glow is-warm${env.reduced ? ' is-reduced' : ''}` : 'igs-dfx-sky-glow';
    const glow = spawn(state, env.layers.stage, make(env.doc, glowClass), DAILY_FX_LIFETIME_MS.fireworks + 400);
    let handle = null;
    try {
        // 古代背景：孔明灯缓缓升空，天光换成整段的暖色柔光，放第一盏时一阵轻风声，不再有爆炸声。
        handle = env.ancient ? startLanterns(sky, {
            count: 7,
            duration: DAILY_FX_LIFETIME_MS.fireworks,
            reducedMotion: env.reduced,
            onLaunch: (index) => { if (index === 0) env.play('lantern'); },
        }) : startFireworks(sky, {
            count: 5,
            reducedMotion: env.reduced,
            onBurst: (index, burst) => {
                env.play(index === 0 ? 'firework' : 'firework-pop');
                if (glow.style && burst && burst.color) glow.style.setProperty('--igs-dfx-glow', burst.color);
                if (glow.classList) {
                    glow.classList.remove('is-lit');
                    void glow.offsetWidth;
                    glow.classList.add('is-lit');
                }
            },
        });
    } catch {
        handle = null;
    }
    state.fireworks = handle;
    return Boolean(handle);
}

function syncPetals(state, env, kind) {
    if (!kind) {
        if (state.petals) {
            try { state.petals.stop(); } catch { /* 已停止 */ }
            state.petals = null;
        }
        removeNode(state.petalLayer);
        state.petalLayer = null;
        state.petalKind = '';
        return;
    }
    if (state.petals && state.petalKind === kind) return;
    if (state.petals && typeof state.petals.setKind === 'function') {
        state.petals.setKind(kind);
        state.petalKind = kind;
        return;
    }
    if (!state.petalLayer || !state.petalLayer.parentNode) {
        state.petalLayer = make(env.doc, 'igs-dfx-petals');
        env.layers.stage.appendChild(state.petalLayer);
    }
    try {
        state.petals = startPetals(state.petalLayer, { kind, density: 'medium', reducedMotion: env.reduced });
        state.petalKind = kind;
    } catch {
        state.petals = null;
    }
}

export function cancelDailyFx(root) {
    const state = root && states.get(root);
    if (!state) return false;
    for (const timer of state.timers) state.clear(timer);
    state.timers.clear();
    clearTransients(state);
    if (state.fireworks) {
        try { state.fireworks.stop(); } catch { /* 已结束 */ }
    }
    if (state.petals) {
        try { state.petals.stop(); } catch { /* 已停止 */ }
    }
    removeNode(state.sky);
    removeNode(state.petalLayer);
    states.delete(root);
    return true;
}

function pageKindOf(content) {
    if (content.chatPage === true || content.textType === 'chat') return 'chat';
    if (content.htmlCardPage === true) return 'card';
    return 'text';
}

export function renderDailyFx(root, snapshot, ctx = {}) {
    if (!root || !snapshot || typeof root.querySelector !== 'function') return { played: [] };
    const readerSettings = snapshot.readerSettings || {};
    const settings = normalizeDailyFxSettings(readerSettings.dailyFx);
    if (!settings.enabled) {
        if (states.has(root)) cancelDailyFx(root);
        return { played: [] };
    }
    const layers = ensureFxLayers(root);
    if (!layers) return { played: [] };
    const state = getState(root, ctx);
    const content = snapshot.content || {};
    const pageKey = `${snapshot.messageId}:${content.currentIndex}`;
    if (state.pageKey && state.pageKey !== pageKey) clearTransients(state);
    if (state.visitKey !== pageKey) {
        state.visitKey = pageKey;
        state.visitSeen = new Set();
    }
    state.pageKey = pageKey;
    const reduced = ctx.reducedMotion === true || (ctx.reducedMotion !== false && prefersReducedMotion());
    const style = normalizeFxStyleSettings(readerSettings.fxStyle);
    const sound = normalizeFxSoundSettings(readerSettings.fxSound);
    const play = typeof ctx.playSfx === 'function'
        ? ctx.playSfx
        : (kind) => { try { playDailySfx(kind, sound, { audioScheduler: ctx.audioScheduler }); } catch { /* 无音频环境 */ } };
    const env = {
        root, doc: layers.doc, layers, reduced, play, messageId: snapshot.messageId, hold: FX_HOLD_SCALE[style.hold] || 1,
        ancient: readerSettings._ancientEra === true,
        worldview: String(readerSettings._worldview || ''),
        onPhoto: settings.photoAlbum ? ctx.onPhoto : null,
    };
    // 西幻 / 科幻 / 末日：在现代节点上追加 is-<id> 换皮，结构、时长与音效不变；古代沿用自身分支。
    const worldSkin = !env.ancient && worldSkinOf(env.worldview) ? `is-${env.worldview}` : '';
    const played = [];
    const plan = planDailyFx(content.fx, { settings, nsfw: content.sceneNsfw === true, pageKind: pageKindOf(content) });
    for (const item of plan) {
        const key = `${pageKey}:${JSON.stringify(item)}`;
        if (!markPage(state, key, style.replay)) continue;
        if (item.type === 'fireworks') {
            if (playFireworks(state, env)) played.push('fireworks');
            continue;
        }
        const build = BUILDERS[item.type];
        if (!build) continue;
        const built = build(item, env);
        // 构建器可因条件不满足（如捏脸无立绘、减少动态效果）放弃播放。
        if (!built) continue;
        const parent = built.layer === 'stage' ? layers.stage : layers.front;
        if (reduced && built.node.classList) built.node.classList.add('is-reduced');
        if (worldSkin) built.node.className = `${String(built.node.className || '')} ${worldSkin}`.trim();
        spawn(state, parent, built.node, built.life);
        for (const kind of built.sounds) play(kind);
        played.push(item.type);
    }
    const petalKind = settings.petals && content.sceneNsfw !== true
        ? resolvePetalKind({ location: content.sceneLocation, time: content.sceneTime, weather: content.sceneWeather })
        : '';
    syncPetals(state, env, petalKind);
    return { played, petals: petalKind };
}
