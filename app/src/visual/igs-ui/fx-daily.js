import { worldSkinOf } from '../../scene/worldview.js';
import { STILL_PLACE_KINDS, VEHICLE_KINDS, isHorseDrawnWorld, resolvePlaceAmbience } from '../../scene/place-ambience.js';
import { DATE_AMBIENCE_HTML, DATE_STILL_KINDS, resolveDateAmbience } from '../../scene/date-ambience.js';

// 日常演出运行时：reader-dom-render 每次渲染调用一次 renderDailyFx。
// 卡片类演出挂在 #igs-fx-front（对话层之上），触碰与飘花挂在 #igs-fx-stage（立绘之上、对话层之下），
// 烟花挂在紧贴 #igs-bg 之后的天空层（背景之上、立绘之下）。同一次停留内重绘不重播，翻页清理上一页卡片，烟花与飘花跨页持续。
import { ensureFxLayers } from './fx-layer.js';
import { esc } from './reader-value-utils.js';
import { prefersReducedMotion } from './reduced-motion.js';
import { FX_HOLD_SCALE, normalizeFxSoundSettings, normalizeFxStyleSettings } from './fx-settings.js';
import { normalizeDailyFxSettings, planDailyFx } from './fx-daily-model.js';
import { headTopAnchor } from './meta-runtime.js';
import { isLiveHostCovered } from './stage-pause.js';
import { playDailySfx } from './fx-daily-sfx.js';
import { GAME_BUILDERS } from './fx-daily-game.js';
import { CAMPUS_BUILDERS } from './fx-daily-campus.js';
import { CAMPUS_AMBIENCE_HTML, CAMPUS_STILL_KINDS, resolveCampusAmbience } from '../../scene/campus-fx.js';
import { resolvePetalKind, startFireworks, startLanterns, startPetals } from './fx-daily-particles.js';
import { playSpriteSpec } from './sprite-actions.js';
import { resolveWeatherFxTime } from './weather-fx-runtime.js';

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
            fireworks: null, petals: null, petalKind: '', sky: null, petalLayer: null, ambience: null, ambienceKey: '',
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
const DAILY_RESULT_LIFE_MS = Object.freeze({ say: 2600, rps: 2600, gacha: 3000, game: 2200, score: 2800, pat: 2000, poke: 900, fever: 2800, cheers: 2000, cook: 3000, cat: 2200, guqin: 3200, go: 2600, poem: 4200, edict: 4200, tea: 2600, bow: 900, spell: 2400, potion: 3200, owl: 3400, broom: 2200, blackout: 3600, murmur: 3400, brake: 1500, depart: 2600, arrive: 3600, ticket: 3400, steam: 3400, shower: 2600, splash: 2400, hairdry: 2600, dive: 2400, bubble: 2200, vacuum: 3200, surface: 2000, sleep: 3200, wake: 2800, dressup: 2600, drape: 2200, fitting: 3000, sing: 3000, dance: 3000, fish: 3400, draw: 3200, music: 3000, ride: 3600, clean: 2800, shopping: 3000, stroll: 2800, yujian: 2200, liandan: 3600, biguan: 4200, dianxue: 2200, qinggong: 2000, yungong: 3400, opendoor: 2000, shield: 1800, tend: 2200, carry: 2600, candle: 3000, pass: 2400, stance: 3000 });
// 敲门：每下间隔，末下之后再停留一会儿。
const KNOCK_MS = Object.freeze({ gap: 420, tail: 1300 });
// 吼叫信：抖动 900ms 后炸开，逐字吼出，吼完再停留。
const HOWLER_MS = Object.freeze({ shake: 900, perChar: 70, hold: 2400 });
// 行礼：立绘微沉再起，add 合成叠加，结束后自动还原。
const BOW_SPEC = Object.freeze({ duration: 760, easing: 'ease-in-out', frames: ['translate(0,0)', 'translate(0,2.2%)', 'translate(0,2.2%)', 'translate(0,0)'] });
// 捏脸：横向挤扁再回弹，composite:'add' 叠加在呼吸与动作之上，结束后自动还原。
const POKE_SPEC = Object.freeze({ duration: 420, easing: 'ease-out', frames: ['scale(1,1)', 'scale(.92,1.03)', 'scale(1.03,.99)', 'scale(1,1)'] });
// 魔法光色：咒语 / 魔药名按字取色，同名每次同色。
const MAGIC_HUES = Object.freeze(['#ffd36a', '#8fd3ff', '#ff7a7a', '#8ff0a4', '#d9a8ff', '#ffa8d8']);
function magicHue(text) {
    let h = 0;
    for (const ch of String(text || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return MAGIC_HUES[h % MAGIC_HUES.length];
}
// 咒语先按语义归类取色，归不了类再按字取色。
const SPELL_HUES = Object.freeze([
    [/阿瓦达|索命|钻心|剜骨|魂魄出窍|夺魂|不可饶恕|黑魔法|诅咒|死咒|avada|kedavra|crucio|imperio/iu, '#4dff6e'],
    [/除你武器|缴械|昏昏倒地|昏迷|击晕|障碍|粉身碎骨|爆炸|火焰|烈火|expelliarmus|stupefy|reducto|confringo|incendio/iu, '#ff6b5a'],
    [/守护神|呼神护卫|铁甲护身|护盾|守护|屏障|治愈|愈合|恢复|patronum|protego|episkey|vulnera/iu, '#e4ecff'],
    [/荧光闪烁|照明|光明|点亮|lumos/iu, '#fffbe8'],
    [/统统石化|石化|冰冻|冻结|定身|禁锢|束缚|petrificus|glacius|incarcerous|immobulus/iu, '#7fc8ff'],
]);
export function spellHue(words) {
    const hit = SPELL_HUES.find(([pattern]) => pattern.test(String(words || '')));
    return hit ? hit[1] : magicHue(words);
}
// 急刹：立绘往前一冲（放大即贴近镜头），背景往反方向一顿；起步：立绘往后一仰。都是 add 叠加，结束自动还原。
const BRAKE_SPEC = Object.freeze({ duration: 560, easing: 'cubic-bezier(.2,.8,.3,1)', frames: ['translate(0,0) scale(1)', 'translate(0,1.2%) scale(1.045)', 'translate(0,.3%) scale(1.01)', 'translate(0,0) scale(1)'] });
const BRAKE_BG_SPEC = Object.freeze({ duration: 480, easing: 'ease-out', frames: ['translate(0,0)', 'translate(-1%,0)', 'translate(.3%,0)', 'translate(0,0)'] });
const DEPART_SPEC = Object.freeze({ duration: 900, easing: 'ease-in-out', frames: ['translate(0,0) scale(1)', 'translate(0,.6%) scale(.98)', 'translate(0,0) scale(1)'] });
// 换装登场：立绘先微微一沉、再轻轻一挺（像站定亮相），只动 transform，结束自动还原。
const DRESSUP_SPEC = Object.freeze({ duration: 900, easing: 'cubic-bezier(.3,.8,.3,1)', frames: ['translate(0,0) scale(1)', 'translate(0,.8%) scale(.99)', 'translate(0,-.5%) scale(1.012)', 'translate(0,0) scale(1)'] });
// 站位身段：立绘位移 + 缩放 + 微倾来表现尊卑与亲近。中间几帧保持姿态、首尾回到原位；composite 为 add 叠加，结束自动还原，不改立绘本身的位置设定。
// 跪拜：整个人沉下去收小；侍立：退到一侧收小、微垂；上座：抬高放大压场；并肩 / 依偎：向对方靠拢并微倾；俯身：向前低头。
const STANCE_POSE = Object.freeze({
    kneel: 'translate(0,5.5%) scale(.9)',
    attend: 'translate(-4.5%,1.2%) scale(.95) rotate(1.2deg)',
    throne: 'translate(0,-2.4%) scale(1.08)',
    side: 'translate(3.2%,0) scale(1)',
    lean: 'translate(2.4%,.4%) rotate(-3.2deg)',
    stoop: 'translate(0,2.6%) rotate(2.6deg) scale(.98)',
});
const STANCE_LABEL = Object.freeze({ kneel: '跪拜', attend: '侍立', throne: '上座', side: '并肩', lean: '依偎', stoop: '俯身' });
const stanceSpec = (pose) => ({ duration: 2800, easing: 'cubic-bezier(.3,.7,.3,1)', frames: ['translate(0,0)', STANCE_POSE[pose], STANCE_POSE[pose], STANCE_POSE[pose], 'translate(0,0)'] });
// 点穴：被点中的人一顿僵住；轻功：身形一掠而过；公主抱：立绘被轻轻托起；护身：立绘向前一顿。
const FREEZE_SPEC = Object.freeze({ duration: 620, easing: 'ease-out', frames: ['translate(0,0)', 'translate(.5%,0)', 'translate(-.4%,0)', 'translate(.2%,0)', 'translate(0,0)'] });
const DASH_SPEC = Object.freeze({ duration: 760, easing: 'cubic-bezier(.2,.8,.3,1)', frames: ['translate(0,0)', 'translate(5%,-3%) scale(.97)', 'translate(-1.5%,-1%)', 'translate(0,0)'] });
const LIFT_SPEC = Object.freeze({ duration: 1500, easing: 'ease-in-out', frames: ['translate(0,0)', 'translate(0,-3.4%) scale(1.02)', 'translate(0,-3.6%) scale(1.02)', 'translate(0,0)'] });
const GUARD_SPEC = Object.freeze({ duration: 620, easing: 'cubic-bezier(.2,.9,.3,1)', frames: ['translate(0,0) scale(1)', 'translate(-2%,0) scale(1.05)', 'translate(-1.4%,0) scale(1.03)', 'translate(0,0) scale(1)'] });
// 找到指名角色的立绘节点：省略或就是说话人时是 #igs-sprite，否则在同屏陪衬里按角色名找；找不到退回说话人。
function spriteElOf(env, who) {
    const name = String(who || '').trim();
    if (name && name !== env.speaker) {
        const hit = Array.from(env.root.querySelectorAll('.igs-cast-sprite')).find((el) => el.getAttribute('data-igs-cast-char') === name);
        if (hit) return hit;
    }
    return env.root.querySelector('#igs-sprite');
}
// 刹车、起步、到站的声音与字样跟着所在的载具换；地点认不出时按世界观猜（古代、西幻是马车，其余是汽车）。
// 飞艇 / 热气球 / 飞毯（plane 的 airship 变体）没有喷气引擎：起飞是螺旋桨与风，颠簸是船身吱呀，靠港鸣笛。
// 露天飞行（sky：御剑、骑龙、乘云）：腾空是一道上扬的风声，颠簸是一阵乱风，落地是风声收住、轻轻一踏。
// 自行车 / 摩托（bike）：起步是一下蹬踏 / 拧油门，刹停是刹皮一捏、车铃一响，到了也是一声车铃。
const VEHICLE_SOUNDS = Object.freeze({
    brake: Object.freeze({ train: 'screech', car: 'screech', carriage: 'rein', ship: 'door', plane: 'touchdown', airship: 'creak', sky: 'gust', bike: 'bike-skid' }),
    depart: Object.freeze({ train: 'train-depart', car: 'engine', carriage: 'giddyup', ship: 'horn', plane: 'jet', airship: 'propeller', sky: 'soar', bike: 'bike-ride' }),
    arrive: Object.freeze({ train: 'arrive-chime', car: 'door', carriage: 'rein', ship: 'horn', plane: 'arrive-chime', airship: 'horn', sky: 'alight', bike: 'bike-bell' }),
});
const DEPART_WORDS = Object.freeze({ train: '开往', car: '前往', carriage: '启程', ship: '驶向', plane: '飞往', airship: '启航', sky: '飞向', bike: '骑往' });
const ARRIVE_WORDS = Object.freeze({ train: '到站', car: '到了', carriage: '到了', ship: '靠岸', plane: '降落', airship: '抵达', sky: '落地', bike: '到了' });
const BRAKE_WORDS = Object.freeze({ carriage: '吁——', ship: '晃——', plane: '咚——', airship: '晃——', sky: '呼——', bike: '叮铃——' });

function vehicleOf(env) {
    if (env.place && env.place.kind === 'plane' && env.place.variant === 'airship') return 'airship';
    if (env.place && VEHICLE_KINDS.includes(env.place.kind)) return env.place.kind;
    return env.ancient || isHorseDrawnWorld(env.worldview) ? 'carriage' : 'car';
}

function ticketLabel(item, vehicle) {
    if (vehicle === 'airship' || vehicle === 'ship') return '船票';
    if (vehicle === 'plane' || /航班|登机|机场|飞机|航站/.test(`${item.from}${item.to}${item.note}`)) return '登机牌';
    return '车票';
}

const HOURGLASS_HTML = '<div class="igs-dfx-hourglass"><i class="igs-dfx-hg-cap"></i><div class="igs-dfx-hg-glass"><i class="igs-dfx-hg-sand is-top"></i><i class="igs-dfx-hg-stream"></i><i class="igs-dfx-hg-sand is-bottom"></i></div><i class="igs-dfx-hg-cap"></i></div>';
const OWL_SVG = '<svg class="igs-dfx-owl-bird" viewBox="0 0 64 48" aria-hidden="true"><path class="igs-dfx-owl-wing is-left" d="M28 22C18 8 6 9 0 17c10 1 17 7 26 13Z"/><path class="igs-dfx-owl-wing is-right" d="M36 22C46 8 58 9 64 17c-10 1-17 7-26 13Z"/><path d="M24 20l2-8 4 5h4l4-5 2 8c2 10-2 20-8 22-6-2-10-12-8-22Z"/><circle cx="29" cy="21" r="2.2" fill="#ffd46a"/><circle cx="35" cy="21" r="2.2" fill="#ffd46a"/></svg>';
const BROOM_SVG = '<svg class="igs-dfx-broom-stick" viewBox="0 0 120 30" aria-hidden="true"><path d="M4 13 82 15" stroke="#6b4423" stroke-width="3.5" stroke-linecap="round"/><path d="M80 10 118 2l-4 13 4 13-38-8Z" fill="#c9a25a"/><path d="M80 9v12" stroke="#4a2e14" stroke-width="3"/></svg>';
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
        // 魔法世界：沙漏流沙 + 城堡钟声；星空底与字体由 is-magic 换皮提供。
        if (env.worldview === 'magic') {
            return {
                layer: 'front', life, sounds: ['hourglass'],
                node: make(env.doc, 'igs-dfx igs-dfx-timeskip is-hourglass', `<div class="igs-dfx-veil"></div>${HOURGLASS_HTML}${text}`),
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
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.game * env.hold), sounds: [{ win: 'game-win', lose: 'game-lose' }[item.result] || 'game-draw'], node };
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
    // ── 修仙武侠（古代专属，fx-era 在其他世界观拨掉）──
    // 御剑飞行：一道青白剑光自左下斜掠向右上，拖淡墨尾，剑尖一点亮芯；立绘轻轻一提。
    yujian(item, env) {
        if (!env.reduced) playSpriteSpec(env.root.querySelector('#igs-sprite'), LIFT_SPEC);
        const node = make(env.doc, 'igs-dfx igs-dfx-yujian', '<i class="igs-dfx-yujian-trail"></i><i class="igs-dfx-yujian-blade"></i><i class="igs-dfx-yujian-glint"></i>');
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.yujian * env.hold), sounds: ['soar', 'sword-ring'], node };
    },
    // 炼丹：丹炉烟气盘旋而上；成丹一点金光跃出，炼废则冒一缕黑烟。成败由标签定，不写不显示字样。
    liandan(item, env) {
        const fail = item.result === 'lose';
        const smoke = [0, 1, 2, 3].map((i) => `<i style="animation-delay:${i * 340}ms;left:${38 + i * 8}%"></i>`).join('');
        const tail = fail ? '<i class="igs-dfx-liandan-fume"></i>' : '<i class="igs-dfx-liandan-pill"></i><i class="igs-dfx-liandan-aura"></i>';
        const word = fail ? '丹毁' : item.result === 'win' ? '丹成' : '';
        const label = word ? `<div class="igs-dfx-liandan-label">${word}</div>` : '';
        const node = make(env.doc, `igs-dfx igs-dfx-liandan${fail ? ' is-fail' : ''}`, `<div class="igs-dfx-liandan-stage"><i class="igs-dfx-liandan-fire"></i><i class="igs-dfx-liandan-cauldron"></i><div class="igs-dfx-liandan-smoke">${smoke}</div>${tail}</div>${label}`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.liandan * env.hold), sounds: ['pill'], node };
    },
    // 闭关吐纳：四周压暗留白，气旋一圈圈随呼吸涨落；境界落在下方（可省）。
    biguan(item, env) {
        const rings = [0, 1, 2].map((i) => `<i style="animation-delay:${i * 900}ms"></i>`).join('');
        const text = item.text ? `<div class="igs-dfx-biguan-text">${esc(item.text)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-biguan', `<i class="igs-dfx-biguan-veil"></i><div class="igs-dfx-biguan-qi">${rings}</div>${text}`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.biguan * env.hold), sounds: ['qi'], node };
    },
    // 点穴：指尖一点，涟漪一圈圈自立绘胸前荡开，被点中的人一顿僵住。
    dianxue(item, env) {
        if (!env.reduced) playSpriteSpec(env.root.querySelector('#igs-sprite'), FREEZE_SPEC);
        const x = spritePosX(readStageBackground(env.root).sprite);
        const node = make(env.doc, 'igs-dfx igs-dfx-dianxue', `<div class="igs-dfx-dianxue-stage" style="left:${x}%"><i class="igs-dfx-dianxue-dot"></i><i class="igs-dfx-dianxue-ring"></i><i class="igs-dfx-dianxue-ring is-2"></i></div>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.dianxue * env.hold), sounds: ['tap'], node };
    },
    // 轻功：身形一掠，身后两道横向残影，几片落叶被风带起。
    qinggong(item, env) {
        if (!env.reduced) playSpriteSpec(env.root.querySelector('#igs-sprite'), DASH_SPEC);
        const leaves = [14, 32, 50, 70, 86].map((y, i) => `<i style="top:${y}%;animation-delay:${i * 150}ms"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-qinggong', `<i class="igs-dfx-qinggong-ghost"></i><i class="igs-dfx-qinggong-ghost is-2"></i><div class="igs-dfx-qinggong-leaves">${leaves}</div>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.qinggong * env.hold), sounds: ['soar'], node };
    },
    // 运功疗伤：掌心泛起青光，几缕细线沿身游走；成败可省，败时青光转灰。
    yungong(item, env) {
        const x = spritePosX(readStageBackground(env.root).sprite);
        const lines = [0, 1, 2, 3].map((i) => `<i style="animation-delay:${i * 420}ms;left:${30 + i * 13}%"></i>`).join('');
        const node = make(env.doc, `igs-dfx igs-dfx-yungong${item.result === 'lose' ? ' is-fail' : ''}`, `<div class="igs-dfx-yungong-stage" style="left:${x}%"><i class="igs-dfx-yungong-palm"></i><div class="igs-dfx-yungong-lines">${lines}</div></div>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.yungong * env.hold), sounds: ['qi'], node };
    },
    // ── 体贴动作（约会向）：光效 + 角落动作字样，机制同 drape ──
    // 开门礼让：门 / 椅方向一道弧形光扫开。
    opendoor(item, env) {
        const label = item.act ? `<div class="igs-dfx-courtesy-label">${esc(item.act)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-opendoor', `<div class="igs-dfx-opendoor-stage"><i class="igs-dfx-opendoor-arc"></i><i class="igs-dfx-opendoor-gap"></i></div>${label}`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.opendoor * env.hold), sounds: ['door'], node };
    },
    // 护在身前：立绘前方一道护光横展，立绘向前一顿。
    shield(item, env) {
        if (!env.reduced) playSpriteSpec(spriteElOf(env, item.who), GUARD_SPEC);
        const x = spritePosX(readStageBackground(env.root).sprite);
        const label = item.act ? `<div class="igs-dfx-courtesy-label">${esc(item.act)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-shield', `<div class="igs-dfx-shield-stage" style="left:${x}%"><i class="igs-dfx-shield-wall"></i><i class="igs-dfx-shield-edge"></i></div>${label}`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.shield * env.hold), sounds: ['tap'], node };
    },
    // 贴心照料：低头处（脚边、脸侧）一点柔光晕缓缓亮起、散开。
    tend(item, env) {
        const x = spritePosX(readStageBackground(env.root).sprite);
        const label = item.act ? `<div class="igs-dfx-courtesy-label">${esc(item.act)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-tend', `<div class="igs-dfx-tend-stage" style="left:${x}%"><i class="igs-dfx-tend-halo"></i><i class="igs-dfx-tend-spark"></i><i class="igs-dfx-tend-spark is-2"></i></div>${label}`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.tend * env.hold), sounds: ['rustle'], node };
    },
    // 公主抱 / 背起：自立绘位置升起一片暖光托举感，立绘被轻轻托起。
    carry(item, env) {
        if (!env.reduced) playSpriteSpec(spriteElOf(env, item.who), LIFT_SPEC);
        const x = spritePosX(readStageBackground(env.root).sprite);
        const label = item.act ? `<div class="igs-dfx-courtesy-label">${esc(item.act)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-carry', `<div class="igs-dfx-carry-stage" style="left:${x}%"><i class="igs-dfx-carry-lift"></i><i class="igs-dfx-carry-glow"></i></div>${label}`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.carry * env.hold), sounds: ['rustle'], node };
    },
    // ── 积木（约会与后宫共用）──
    // 点灯烛火：一点火光擦亮、烛焰由小变大并跳动；灯 = 宫灯红罩，香 = 一缕青烟。落在立绘身侧。
    candle(item, env) {
        const style = item.style === 'lamp' || item.style === 'incense' ? item.style : 'candle';
        const x = spritePosX(readStageBackground(env.root).sprite);
        const body = style === 'incense'
            ? '<i class="igs-dfx-candle-stick"></i><i class="igs-dfx-candle-ember"></i><i class="igs-dfx-candle-smoke"></i><i class="igs-dfx-candle-smoke is-2"></i>'
            : '<i class="igs-dfx-candle-body"></i><i class="igs-dfx-candle-flame"></i><i class="igs-dfx-candle-halo"></i><i class="igs-dfx-candle-glow"></i>';
        const node = make(env.doc, `igs-dfx igs-dfx-candle is-${style}`, `<div class="igs-dfx-candle-stage" style="left:${x}%">${body}</div>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.candle * env.hold), sounds: ['candle'], node };
    },
    // 递接：物品名浮起，沿一道弧线从递出一侧飘向接物一侧，落点一圈微光；物品名必填。
    pass(item, env) {
        const x = spritePosX(readStageBackground(env.root).sprite);
        const node = make(env.doc, 'igs-dfx igs-dfx-pass', `<div class="igs-dfx-pass-stage" style="left:${x}%"><i class="igs-dfx-pass-trail"></i><div class="igs-dfx-pass-item">${esc(item.item)}</div><i class="igs-dfx-pass-ring"></i></div>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.pass * env.hold), sounds: ['rustle'], node };
    },
    // 站位身段：用立绘位移、缩放、微倾表现尊卑与亲近（跪拜 / 侍立 / 上座 / 并肩 / 依偎 / 俯身），角落落姿态字样。
    // 指名陪衬角色时动陪衬，否则动说话人；上座另有一道自下而上的升座光。
    stance(item, env) {
        const pose = STANCE_POSE[item.pose] ? item.pose : 'attend';
        if (!env.reduced) playSpriteSpec(spriteElOf(env, item.who), stanceSpec(pose));
        const x = spritePosX(readStageBackground(env.root).sprite);
        const node = make(env.doc, `igs-dfx igs-dfx-stance is-${pose}`, `<div class="igs-dfx-stance-stage" style="left:${x}%"><i class="igs-dfx-stance-dais"></i><i class="igs-dfx-stance-beam"></i></div><div class="igs-dfx-courtesy-label">${STANCE_LABEL[pose]}</div>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.stance * env.hold), sounds: ['rustle'], node };
    },
    // 魔法世界独有：只在魔法世界观可用（fx-era 在其他世界观拨掉）。
    spell(item, env) {
        const sparks = Array.from({ length: 10 }, (_, i) => {
            const angle = i * 36 + (i % 2) * 14;
            return `<i style="--igs-spark-a:${angle}deg;--igs-spark-d:${46 + (i % 3) * 18}px;animation-delay:${520 + (i % 4) * 40}ms"></i>`;
        }).join('');
        const words = item.words ? `<div class="igs-dfx-spell-words">${esc(item.words)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-spell', `<i class="igs-dfx-spell-beam"></i><div class="igs-dfx-spell-burst"><i class="igs-dfx-spell-core"></i>${sparks}</div>${words}`);
        if (node.style && typeof node.style.setProperty === 'function') node.style.setProperty('--igs-magic', spellHue(item.words));
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.spell * env.hold), sounds: ['spell'], node };
    },
    potion(item, env) {
        const bubbles = [22, 40, 58, 74, 32, 66].map((x, i) => `<i style="left:${x}%;animation-delay:${i * 230}ms"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-potion', `<div class="igs-dfx-potion-pot"><div class="igs-dfx-potion-smoke"><i></i><i></i><i></i></div><i class="igs-dfx-potion-brew"></i><div class="igs-dfx-potion-bubbles">${bubbles}</div><i class="igs-dfx-potion-body"></i></div><div class="igs-dfx-potion-label"><span>魔药完成</span>${item.name ? `<b>${esc(item.name)}</b>` : ''}</div>`);
        if (node.style && typeof node.style.setProperty === 'function') node.style.setProperty('--igs-magic', magicHue(item.name || 'potion'));
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.potion * env.hold), sounds: ['potion'], node };
    },
    owl(item, env) {
        const from = item.from ? `<div class="igs-dfx-owl-from">来自 ${esc(item.from)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-owl', `<div class="igs-dfx-owl-flight">${OWL_SVG}</div><div class="igs-dfx-owl-drop"><div class="igs-dfx-owl-letter"><i class="igs-dfx-owl-seal"></i></div>${from}</div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.owl * env.hold), sounds: ['owl'], node };
    },
    howler(item, env) {
        const n = chars(item.text).length;
        const life = HOWLER_MS.shake + n * HOWLER_MS.perChar + Math.round(HOWLER_MS.hold * env.hold);
        const from = item.from ? `<div class="igs-dfx-howler-from">${esc(item.from)} 的吼叫信</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-howler', `<div class="igs-dfx-howler-env"><i class="igs-dfx-howler-flap"></i></div><div class="igs-dfx-howler-mouth">${charSpans(item.text, HOWLER_MS.perChar, HOWLER_MS.shake + 120)}</div>${from}`);
        return { layer: 'front', life, sounds: ['howler'], node };
    },
    broom(item, env) {
        const streaks = [18, 34, 52, 66, 80].map((y, i) => `<i style="top:${y}%;animation-delay:${i * 90}ms"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-broom', `<div class="igs-dfx-broom-wind">${streaks}</div><div class="igs-dfx-broom-flight">${BROOM_SVG}<i class="igs-dfx-broom-trail"></i></div>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.broom * env.hold), sounds: ['broom'], node };
    },

    // 恐怖：灯管闪几下后全黑，黑暗里浮出一句旁白，再慢慢亮回来。
    blackout(item, env) {
        const text = item.text ? `<div class="igs-dfx-blackout-text">${esc(item.text)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-blackout', `<i class="igs-dfx-blackout-veil"></i>${text}`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.blackout * env.hold), sounds: ['blackout'], node };
    },
    // 敲门：每一下画面边缘的暗角收紧一次，「咚」字从侧面浮出来；次数由标签决定，音效按次数合成。
    knock(item, env) {
        const count = Math.min(6, Math.max(1, Math.round(item.count) || 3));
        const hits = Array.from({ length: count }, (_, i) => `<i class="igs-dfx-knock-hit" style="animation-delay:${i * KNOCK_MS.gap}ms;top:${[38, 52, 30, 60, 44, 34][i]}%">咚</i>`
            + `<i class="igs-dfx-knock-pulse" style="animation-delay:${i * KNOCK_MS.gap}ms"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-knock', hits);
        return { layer: 'front', life: count * KNOCK_MS.gap + KNOCK_MS.tail, sounds: [`knock${count}`], node };
    },
    // 耳边低语：一句模糊的字从画面一侧逐字浮现、发虚、散掉，左右随句子而定。
    // 头顶小字：落在指名角色（说话人或在台陪衬）头顶，沿用 Meta 气泡样式；角色不在台上时放舞台上方正中。
    say(item, env) {
        if (!item.text) return null;
        const who = String(item.who || '').trim();
        const target = !who || who === env.speaker ? env.sprite : env.cast.find((m) => m && m.character === who);
        if (target && isLiveHostCovered(env.root, who || env.speaker)) return null;
        const anchor = target ? headTopAnchor(env.root, target) : null;
        const node = env.doc.createElement('div');
        node.className = 'igs-dfx igs-meta-bubble igs-dfx-say';
        node.textContent = item.text;
        node.style.left = anchor ? `${Math.round(anchor.x)}px` : '50%';
        node.style.top = anchor ? `${Math.round(anchor.y)}px` : '22%';
        const life = Math.round(DAILY_RESULT_LIFE_MS.say * env.hold);
        node.style.animationDuration = `${life}ms`;
        return { layer: 'front', life, sounds: [], node };
    },
    murmur(item, env) {
        const side = chars(item.text).length % 2 ? 'is-left' : 'is-right';
        const node = make(env.doc, `igs-dfx igs-dfx-murmur ${side}`, `<div class="igs-dfx-murmur-text">${charSpans(item.text, 110, 250)}</div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.murmur * env.hold), sounds: ['murmur'], node };
    },

    // 载具：急刹 / 起步只动立绘与背景，再配一层速度线；到站牌与车票是卡片。
    brake(item, env) {
        const vehicle = vehicleOf(env);
        if (!env.reduced) {
            playSpriteSpec(env.root.querySelector('#igs-sprite'), BRAKE_SPEC);
            playSpriteSpec(env.root.querySelector('#igs-cast'), BRAKE_SPEC);
            playSpriteSpec(env.root.querySelector('#igs-bg'), BRAKE_BG_SPEC);
        }
        const lines = [22, 36, 48, 63, 76].map((y, i) => `<i style="top:${y}%;animation-delay:${i * 40}ms"></i>`).join('');
        const word = BRAKE_WORDS[vehicle] || '吱——';
        const node = make(env.doc, 'igs-dfx igs-dfx-brake', `<div class="igs-dfx-brake-lines">${lines}</div><div class="igs-dfx-brake-word">${word}</div>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.brake * env.hold), sounds: [VEHICLE_SOUNDS.brake[vehicle]], node };
    },
    depart(item, env) {
        const vehicle = vehicleOf(env);
        if (!env.reduced) playSpriteSpec(env.root.querySelector('#igs-sprite'), DEPART_SPEC);
        const flow = [20, 33, 47, 61, 74].map((y, i) => `<i style="top:${y}%;animation-delay:${200 + i * 120}ms"></i>`).join('');
        const chip = item.to ? `<div class="igs-dfx-depart-chip"><span>${DEPART_WORDS[vehicle]}</span><b>${esc(item.to)}</b></div>` : '';
        const node = make(env.doc, `igs-dfx igs-dfx-depart is-${vehicle}`, `<div class="igs-dfx-depart-flow">${flow}</div>${chip}`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.depart * env.hold), sounds: [VEHICLE_SOUNDS.depart[vehicle]], node };
    },
    arrive(item, env) {
        const vehicle = vehicleOf(env);
        const word = ARRIVE_WORDS[vehicle];
        const sub = item.station ? `<div class="igs-dfx-arrive-sub">${word}</div>` : '';
        const node = make(env.doc, `igs-dfx igs-dfx-arrive is-${vehicle}`, `<div class="igs-dfx-arrive-board"><div class="igs-dfx-arrive-name">${esc(item.station || word)}</div><i class="igs-dfx-arrive-bar"></i>${sub}</div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.arrive * env.hold), sounds: [VEHICLE_SOUNDS.arrive[vehicle]], node };
    },
    ticket(item, env) {
        const label = ticketLabel(item, vehicleOf(env));
        const from = item.from ? `<b>${esc(item.from)}</b><i>→</i>` : '<i>→</i>';
        const note = item.note ? `<div class="igs-dfx-ticket-note">${esc(item.note)}</div>` : '';
        const kind = label === '登机牌' ? ' is-plane' : label === '船票' ? ' is-ship' : '';
        const node = make(env.doc, `igs-dfx igs-dfx-ticket${kind}`, `<div class="igs-dfx-ticket-card"><div class="igs-dfx-ticket-head">${label}</div><div class="igs-dfx-ticket-route">${from}<b>${esc(item.to)}</b></div>${note}<i class="igs-dfx-ticket-punch"></i></div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.ticket * env.hold), sounds: ['punch'], node };
    },
    // 洗浴：一团水汽涌过来挡住视线；拧开淋浴的水帘；泼水的水花与溅在镜头上的水珠；吹风机的风。
    steam(item, env) {
        const puffs = [[-8, 20, 0], [38, 6, 160], [10, 40, 300], [46, 34, 420]]
            .map(([x, y, d]) => `<i style="left:${x}%;top:${y}%;animation-delay:${d}ms"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-steam', `<div class="igs-dfx-steam-cloud">${puffs}</div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.steam * env.hold), sounds: ['hiss'], node };
    },
    shower(item, env) {
        const drops = Array.from({ length: 16 }, (_, i) => `<i style="left:${4 + ((i * 29) % 92)}%;animation-delay:${-((i * 113) % 550)}ms"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-shower', `<div class="igs-dfx-shower-rain">${drops}</div><i class="igs-dfx-shower-mist"></i>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.shower * env.hold), sounds: ['shower'], node };
    },
    splash(item, env) {
        const drops = Array.from({ length: 12 }, (_, i) => {
            const angle = -75 + i * 13.6 + (i % 2) * 5;
            return `<i style="--igs-sp-a:${angle.toFixed(1)}deg;--igs-sp-d:${70 + (i % 4) * 26}px;animation-delay:${(i % 3) * 30}ms"></i>`;
        }).join('');
        const lens = [[16, 22, 22], [72, 16, 30], [60, 54, 18], [28, 62, 26], [86, 44, 16]]
            .map(([x, y, size], i) => `<i style="left:${x}%;top:${y}%;--igs-sp-s:${size}px;animation-delay:${80 + i * 50}ms"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-splash', `<div class="igs-dfx-splash-burst">${drops}</div><div class="igs-dfx-splash-lens">${lens}</div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.splash * env.hold), sounds: ['splash'], node };
    },
    hairdry(item, env) {
        const x = spritePosX(readStageBackground(env.root).sprite);
        const gusts = [0, 26, 52, 78].map((y, i) => `<i style="top:${y}%;animation-delay:${i * 190}ms"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-hairdry', `<div class="igs-dfx-hairdry-wind" style="left:${x}%">${gusts}</div>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.hairdry * env.hold), sounds: ['dryer'], node };
    },
    // 居家：入睡时画面渐暗成夜色，几个「Z」轻飘上去；起床时晨光自上而下铺开。旁白可省。
    sleep(item, env) {
        const text = item.text ? `<div class="igs-dfx-rest-text">${esc(item.text)}</div>` : '';
        const zzz = [0, 1, 2].map((i) => `<i style="animation-delay:${600 + i * 520}ms">Z</i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-sleep', `<i class="igs-dfx-rest-veil"></i><div class="igs-dfx-sleep-z">${zzz}</div>${text}`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.sleep * env.hold), sounds: ['sleep'], node };
    },
    // 场景时间是深夜、夜里时（半夜惊醒、夜里醒来）不铺晨光，换一层清冷的月色。
    wake(item, env) {
        const text = item.text ? `<div class="igs-dfx-rest-text">${esc(item.text)}</div>` : '';
        const time = resolveWeatherFxTime(env.sceneTime);
        const night = time === 'night' || time === 'midnight' ? ' is-night' : '';
        const node = make(env.doc, `igs-dfx igs-dfx-wake${night}`, `<i class="igs-dfx-wake-glow"></i><i class="igs-dfx-wake-sheen"></i>${text}`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.wake * env.hold), sounds: ['wake'], node };
    },
    // 居家 · 换装登场：换上新装亮相的那一刻——柔光聚拢、一圈光点环绕扫过，服装名落章，立绘轻轻一挺。
    // 魔法世界观换皮成旋转魔法阵 / 光环（is-magic），结构、时长、音效不变。服装名可省（省了只有光效）。
    dressup(item, env) {
        if (!env.reduced) {
            playSpriteSpec(env.root.querySelector('#igs-sprite'), DRESSUP_SPEC);
            playSpriteSpec(env.root.querySelector('#igs-cast'), DRESSUP_SPEC);
        }
        const x = spritePosX(readStageBackground(env.root).sprite);
        const sparks = [0, 45, 90, 135, 180, 225, 270, 315]
            .map((a, i) => `<i style="--igs-du-a:${a}deg;animation-delay:${300 + i * 55}ms"></i>`).join('');
        const label = item.outfit ? `<div class="igs-dfx-dressup-label">${esc(item.outfit)}</div>` : '';
        const skin = env.worldview === 'magic' ? ' is-magic' : env.ancient ? ' is-ancient' : '';
        const node = make(env.doc, `igs-dfx igs-dfx-dressup${skin}`, `<div class="igs-dfx-dressup-stage" style="left:${x}%"><i class="igs-dfx-dressup-beam"></i><i class="igs-dfx-dressup-ring"></i><div class="igs-dfx-dressup-sparks">${sparks}</div></div>${label}`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.dressup * env.hold), sounds: ['dressup'], node };
    },
    // 衣 · 披衣 / 整理着装：肩头落一层暖光、顺着布料滑一道柔光，角落浮出动作字样（披上外套 / 系好领带……）。
    drape(item, env) {
        const x = spritePosX(readStageBackground(env.root).sprite);
        const label = item.act ? `<div class="igs-dfx-drape-label">${esc(item.act)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-drape', `<div class="igs-dfx-drape-stage" style="left:${x}%"><i class="igs-dfx-drape-glow"></i><i class="igs-dfx-drape-sheen"></i></div>${label}`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.drape * env.hold), sounds: ['rustle'], node };
    },
    // 衣 · 试衣镜：中央立起一面试衣镜，镜面一道微光扫过，照出换上的新装，镜框下方落新装名。古风换成铜镜木框。
    fitting(item, env) {
        const label = item.outfit ? `<div class="igs-dfx-fitting-name">${esc(item.outfit)}</div>` : '';
        const skin = env.ancient || env.worldview === 'ancient' ? ' is-ancient' : '';
        const node = make(env.doc, `igs-dfx igs-dfx-fitting${skin}`, `<div class="igs-dfx-fitting-mirror"><i class="igs-dfx-fitting-glass"></i><i class="igs-dfx-fitting-sheen"></i><i class="igs-dfx-fitting-stand"></i></div>${label}`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.fitting * env.hold), sounds: ['dressup'], node };
    },
    // 水下与真空：入水时水面一闪、蓝色从上往下漫过、气泡往上涌；说话吐出一串气泡；泄压时空气往一侧冲走，四周暗下来。
    dive(item, env) {
        const bubbles = [14, 27, 41, 55, 68, 82, 34, 74]
            .map((x, i) => `<i style="left:${x}%;--igs-bb-s:${8 + ((i * 5) % 12)}px;animation-delay:${350 + ((i * 97) % 500)}ms"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-dive', `<i class="igs-dfx-dive-flash"></i><i class="igs-dfx-dive-veil"></i><div class="igs-dfx-dive-bubbles">${bubbles}</div>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.dive * env.hold), sounds: ['dive'], node };
    },
    bubble(item, env) {
        const x = spritePosX(readStageBackground(env.root).sprite);
        const beads = [-4, 6, -8, 3, -2]
            .map((dx, i) => `<i style="--igs-bb-s:${6 + (i % 3) * 3}px;margin-left:${dx}px;animation-delay:${i * 170}ms"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-bubble', `<div class="igs-dfx-bubble-rise" style="left:${x}%">${beads}</div>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.bubble * env.hold), sounds: ['blub'], node };
    },
    // 出水：不是标签，换地点离开水下时自动播（见 syncWaterCrossing）：蓝色往下退去、水面一亮。
    surface(item, env) {
        const node = make(env.doc, 'igs-dfx igs-dfx-surface', '<i class="igs-dfx-surface-veil"></i><i class="igs-dfx-dive-flash"></i>');
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.surface * env.hold), sounds: ['splash'], node };
    },
    vacuum(item, env) {
        const rush = [18, 30, 42, 54, 66, 78].map((y, i) => `<i style="top:${y}%;animation-delay:${(i % 3) * 60}ms"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-vacuum', `<div class="igs-dfx-vacuum-rush">${rush}</div><i class="igs-dfx-vacuum-hush"></i>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.vacuum * env.hold), sounds: ['vacuum'], node };
    },
    // 玩乐：唱歌——话筒旁泛起一圈圈声波，音符随旋律往上飘；歌名落在下方。
    sing(item, env) {
        const notes = [16, 32, 50, 66, 82].map((x, i) => `<i style="left:${x}%;animation-delay:${i * 220}ms">${['♪', '♫', '♩', '♬', '♪'][i]}</i>`).join('');
        const rings = [0, 1, 2].map((i) => `<i style="animation-delay:${i * 420}ms"></i>`).join('');
        const label = item.song ? `<div class="igs-dfx-sing-label">${esc(item.song)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-sing', `<div class="igs-dfx-sing-waves">${rings}</div><div class="igs-dfx-sing-notes">${notes}</div>${label}`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.sing * env.hold), sounds: ['sing'], node };
    },
    // 跳舞：一对剪影随旋律旋转，脚边荡开光圈，几点亮片飞散；舞种落在下方。
    dance(item, env) {
        const sparks = [0, 60, 120, 180, 240, 300].map((a, i) => `<i style="--igs-dc-a:${a}deg;animation-delay:${200 + i * 90}ms"></i>`).join('');
        const label = item.style ? `<div class="igs-dfx-dance-label">${esc(item.style)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-dance', `<div class="igs-dfx-dance-pair"><i class="igs-dfx-dance-figure is-a"></i><i class="igs-dfx-dance-figure is-b"></i><i class="igs-dfx-dance-ring"></i></div><div class="igs-dfx-dance-sparks">${sparks}</div>${label}`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.dance * env.hold), sounds: ['dance'], node };
    },
    // 钓鱼：水面漾开一圈圈涟漪，浮漂一沉，鱼线一绷拉起一尾鱼影；钓到的鱼落在下方。
    fish(item, env) {
        const ripples = [0, 1, 2].map((i) => `<i style="animation-delay:${i * 500}ms"></i>`).join('');
        const label = item.catch ? `<div class="igs-dfx-fish-catch">${esc(item.catch)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-fish', `<div class="igs-dfx-fish-water">${ripples}</div><i class="igs-dfx-fish-line"></i><i class="igs-dfx-fish-float"></i><i class="igs-dfx-fish-silhouette"></i>${label}`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.fish * env.hold), sounds: ['fish'], node };
    },
    // 画画：画布上笔触一道道落下、渐渐成形，画笔在角上游走；画的内容落在下方。
    draw(item, env) {
        const strokes = [0, 1, 2, 3].map((i) => `<i class="igs-dfx-draw-stroke" style="animation-delay:${300 + i * 360}ms"></i>`).join('');
        const label = item.subject ? `<div class="igs-dfx-draw-label">${esc(item.subject)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-draw', `<div class="igs-dfx-draw-canvas">${strokes}<i class="igs-dfx-draw-pencil"></i></div>${label}`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.draw * env.hold), sounds: ['draw'], node };
    },
    // 演奏乐器：一道五线谱浮起，音符顺着谱线依次亮起、跳动；乐器名落在下方。古琴另走 guqin。
    music(item, env) {
        const notes = [12, 28, 44, 60, 76, 90].map((x, i) => `<i style="left:${x}%;top:${[30, 55, 20, 60, 35, 48][i]}%;animation-delay:${i * 200}ms">${['♪', '♫', '♩', '♬', '♪', '♫'][i]}</i>`).join('');
        const staff = [0, 1, 2, 3, 4].map((i) => `<i style="top:${12 + i * 18}%"></i>`).join('');
        const label = item.instrument ? `<div class="igs-dfx-music-label">${esc(item.instrument)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-music', `<div class="igs-dfx-music-staff">${staff}</div><div class="igs-dfx-music-notes">${notes}</div>${label}`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.music * env.hold), sounds: ['music'], node };
    },
    // 游乐设施：一座摩天轮缓缓转起，彩灯一圈点亮，座舱随之起伏；设施名落在下方。仅现代类世界观（见 fx-era）。
    ride(item, env) {
        const cabins = [0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => `<i style="--igs-rd-a:${a}deg;animation-delay:${i * 70}ms"></i>`).join('');
        const label = item.name ? `<div class="igs-dfx-ride-label">${esc(item.name)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-ride', `<div class="igs-dfx-ride-wheel"><i class="igs-dfx-ride-hub"></i><div class="igs-dfx-ride-cabins">${cabins}</div></div>${label}`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.ride * env.hold), sounds: ['ride'], node };
    },
    // 打扫：扫帚扫过一道光痕，几点尘埃扬起又落下，角上冒出几颗「窗明几净」的亮晶。都不带字段。
    clean(item, env) {
        const sparks = [[22, 34], [48, 24], [68, 40], [80, 28], [36, 52]]
            .map(([x, y], i) => `<i style="left:${x}%;top:${y}%;animation-delay:${300 + i * 180}ms">✦</i>`).join('');
        const dust = [20, 40, 60, 78].map((x, i) => `<i style="left:${x}%;animation-delay:${i * 150}ms"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-clean', `<i class="igs-dfx-clean-sweep"></i><div class="igs-dfx-clean-dust">${dust}</div><div class="igs-dfx-clean-sparks">${sparks}</div>`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.clean * env.hold), sounds: ['sweep'], node };
    },
    // 逛街购物：一两只购物袋晃进来，袋口蹦出几点亮晶；买到的东西落在下方。
    shopping(item, env) {
        const sparks = [30, 50, 70].map((x, i) => `<i style="left:${x}%;animation-delay:${400 + i * 160}ms">✧</i>`).join('');
        const label = item.item ? `<div class="igs-dfx-shopping-label">${esc(item.item)}</div>` : '';
        const node = make(env.doc, 'igs-dfx igs-dfx-shopping', `<div class="igs-dfx-shopping-bags"><i class="igs-dfx-shopping-bag is-a"></i><i class="igs-dfx-shopping-bag is-b"></i></div><div class="igs-dfx-shopping-sparks">${sparks}</div>${label}`);
        return { layer: 'front', life: Math.round(DAILY_RESULT_LIFE_MS.shopping * env.hold), sounds: ['shopping'], node };
    },
    // 散步：画面底部漾过一道暖光，两串脚印一前一后印出来，一片叶子轻轻飘落——并肩同行的闲适。都不带字段。
    stroll(item, env) {
        const steps = [0, 1, 2, 3, 4].map((i) => `<i class="igs-dfx-stroll-step ${i % 2 ? 'is-r' : 'is-l'}" style="left:${18 + i * 14}%;animation-delay:${i * 300}ms"></i>`).join('');
        const node = make(env.doc, 'igs-dfx igs-dfx-stroll', `<i class="igs-dfx-stroll-warm"></i><div class="igs-dfx-stroll-steps">${steps}</div><i class="igs-dfx-stroll-leaf"></i>`);
        return { layer: 'stage', life: Math.round(DAILY_RESULT_LIFE_MS.stroll * env.hold), sounds: ['stroll'], node };
    },
};
// 在家玩游戏机：开机 / 对战 / 连击 / 抢手柄，构建器在 fx-daily-game.js。
Object.assign(BUILDERS, GAME_BUILDERS);
// 校园演出：黑板 / 传纸条 / 抽屉 / 点名 / 考试 / 文化祭 / 毕业 / 纽扣，构建器在 fx-daily-campus.js。
Object.assign(BUILDERS, CAMPUS_BUILDERS);

// 常驻氛围层：人在车里、船上、浴室时一直挂着，换地点淡出。每种只有一两个动画元素，样式见 fx-daily-style。
const AMBIENCE_HTML = Object.freeze({
    train: '<i class="igs-dfx-amb-shade"></i><i class="igs-dfx-amb-band"></i>',
    car: '<i class="igs-dfx-amb-shade"></i><i class="igs-dfx-amb-band"></i>',
    carriage: '<i class="igs-dfx-amb-shade"></i><i class="igs-dfx-amb-band"></i>',
    // 修仙武侠古风地点（只在古代世界观生效）：客栈暖灯晕 + 飘尘、洞府暗角 + 水滴光点、云海流云 + 薄雾。
    inn: '<i class="igs-dfx-amb-innglow"></i><i class="igs-dfx-amb-innmote"></i>',
    cave: '<i class="igs-dfx-amb-cavedark"></i><i class="igs-dfx-amb-cavedrip"></i>',
    cloudsea: '<i class="igs-dfx-amb-clouds"></i><i class="igs-dfx-amb-seamist"></i>',
    plane: '<i class="igs-dfx-amb-shade"></i><i class="igs-dfx-amb-band"></i>',
    sky: '<i class="igs-dfx-amb-clouds"></i><i class="igs-dfx-amb-gust"></i>',
    // 自行车 / 摩托：开放式骑行，不是封闭车厢——用迎面掠过的风线，不挂车窗光带。
    bike: '<i class="igs-dfx-amb-rush"></i>',
    ship: '<i class="igs-dfx-amb-water"></i>',
    bath: '<i class="igs-dfx-amb-fog"></i><i class="igs-dfx-amb-steam"></i>',
    underwater: '<i class="igs-dfx-amb-deep"></i><i class="igs-dfx-amb-rays"></i><i class="igs-dfx-amb-bubbles"></i>',
    space: '<i class="igs-dfx-amb-void"></i><i class="igs-dfx-amb-dust"></i>',
});
const AMBIENCE_FADE_MS = 900;

// 换地点时自动入水 / 出水：上一个正文页在岸上、这一页到了水下就播一次入水，反过来播出水。
// 跟「车窗光影、浴室水汽」同一个开关；刚打开阅读器的第一页、聊天/卡片页、NSFW 页、本页已有入水标签时都不播。
function syncWaterCrossing(state, env, settings, content, played) {
    if (!settings.ambience || pageKindOf(content) !== 'text') return '';
    const under = Boolean(env.place && env.place.kind === 'underwater');
    const was = state.underwater;
    state.underwater = under;
    if (was === undefined || was === under || content.sceneNsfw === true) return '';
    if (under && played.includes('dive')) return '';
    const built = BUILDERS[under ? 'dive' : 'surface']({}, env);
    if (env.reduced && built.node.classList) built.node.classList.add('is-reduced');
    spawn(state, env.layers.stage, built.node, built.life);
    for (const kind of built.sounds) env.play(kind);
    return under ? 'dive' : 'surface';
}

// 聊天页、卡片页不挂；NSFW 页只留浴室水汽、水下与太空这类环境本身（车里的光带会扫过 CG）。
function resolveAmbience(settings, content, place) {
    if (!settings.ambience || !place || pageKindOf(content) !== 'text') return null;
    if (content.sceneNsfw === true && !STILL_PLACE_KINDS.includes(place.kind) && !DATE_STILL_KINDS.includes(place.kind) && !CAMPUS_STILL_KINDS.includes(place.kind)) return null;
    const time = resolveWeatherFxTime(content.sceneTime);
    return { ...place, night: time === 'night' || time === 'midnight' || time === 'dusk' };
}

function syncAmbience(state, env, spec) {
    const key = spec ? `${spec.kind}:${spec.variant}:${spec.night ? 1 : 0}` : '';
    if (key === state.ambienceKey && (!spec || (state.ambience && state.ambience.parentNode))) return;
    const old = state.ambience;
    if (old) {
        if (old.classList) old.classList.add('is-leaving');
        state.transients.add(old);
        later(state, () => {
            removeNode(old);
            state.transients.delete(old);
        }, AMBIENCE_FADE_MS);
    }
    state.ambience = null;
    state.ambienceKey = key;
    if (!spec) return;
    const classes = ['igs-dfx-amb', `is-${spec.kind}`, spec.variant && `is-${spec.variant}`, spec.night && 'is-night', env.reduced && 'is-reduced'].filter(Boolean).join(' ');
    const node = make(env.doc, classes, AMBIENCE_HTML[spec.kind] || DATE_AMBIENCE_HTML[spec.kind] || CAMPUS_AMBIENCE_HTML[spec.kind]);
    const stage = env.layers.stage;
    stage.insertBefore(node, stage.firstChild || null);
    state.ambience = node;
}

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
    removeNode(state.ambience);
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
        sprite: ctx.sprite || null,
        cast: Array.isArray(ctx.cast) ? ctx.cast : [],
        speaker: String(content.spriteCharacter || content.speaker || '').trim(),
        sceneTime: content.sceneTime,
    };
    env.place = resolvePlaceAmbience(content.sceneLocation, { worldview: env.ancient ? 'ancient' : env.worldview })
        || resolveCampusAmbience(content.sceneLocation, { worldview: env.ancient ? 'ancient' : env.worldview })
        || resolveDateAmbience(content.sceneLocation, { worldview: env.ancient ? 'ancient' : env.worldview });
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
    const ambience = resolveAmbience(settings, content, env.place);
    syncAmbience(state, env, ambience);
    const crossing = syncWaterCrossing(state, env, settings, content, played);
    if (crossing) played.push(crossing);
    return { played, petals: petalKind, ambience: ambience ? ambience.kind : '' };
}
