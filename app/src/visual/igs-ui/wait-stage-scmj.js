/*!
 * 幼麟棋牌-四川麻将 v1.0
 * 版权所有者为成都幼麟科技有限公司。
 * 本规则按该开源协议随脚本发布，允许第三方把包含它的作品作为整体免费使用。
 * 2026-10-23：原文件用宿主垫片包进工厂，并导出 __internals。原文与协议见 scmj/vendor/babykylin/COPYRIGHT.md。
 */
import { openMahjongView } from './wait-stage-mahjong.js';
import { mahjongBeat } from './wait-stage-mahjong-table.js';
import { autoPersona, mindMood } from './wait-stage-mahjong-mind.js';
import { chengduWinKeys, declareLine, voiceLine, wantsToTalk } from './wait-stage-mahjong-voice.js';
import { mulberry32 } from './scmj/host.js';
import { createScmjController } from './scmj/controller.js';
import { createScmjPlayer } from './scmj/player.js';
import { youlinToCode } from './scmj/profile.js';

export const SCMJ_SAVE_KEY = 'igs-wait-mahjong-scmj-v1';
export const MAHJONG_MODE_KEY = 'igs-wait-mahjong-mode-v1';
export const SCMJ_STYLE = [
    '.igs-scmj-banner{color:#f4f1e8;background:#10141c;}',
    '.igs-scmj-act{position:relative;color:#fff;}',
    '.igs-scmj-act:disabled{filter:grayscale(1) brightness(.75);opacity:.5;cursor:not-allowed;}',
    '.igs-scmj-act.is-hint{box-shadow:0 0 0 .3cqi #ffd36a,0 0 1.6cqi .3cqi rgba(255,211,106,.75),0 .45cqi 0 rgba(10,20,60,.45);}',
    '.igs-scmj-act.is-hint::after{content:"推荐";position:absolute;top:-1.3cqi;right:-.6cqi;padding:.15cqi .7cqi;border-radius:999px;background:#ffd36a;color:#4a2a00;font-size:max(9px,1.05cqi);font-weight:800;letter-spacing:.05em;line-height:1.3;}',
    '.igs-scmj-tile.is-locked{color:#8d93a3;}',
    '.igs-scmj-tile[aria-pressed="true"]{position:relative;top:-1.6cqi;}',
    '.igs-scmj-tile[aria-pressed="true"] .igs-mj-pai{box-shadow:0 0 0 .3cqi #ffd36a,0 0 1.4cqi .2cqi rgba(255,211,106,.85);}',
    '.igs-scmj-say{background:#10141c;color:#fff;}',
    '.igs-scmj-tags{position:absolute;left:-.9cqi;top:-.9cqi;z-index:1;display:flex;flex-direction:column;align-items:flex-start;gap:.3cqi;font-size:max(10px,1.2cqi);pointer-events:none;}',
    '.igs-scmj-tags>span{margin-left:0;box-shadow:0 .2cqi .6cqi rgba(0,0,0,.5);white-space:nowrap;}',
    '.igs-scmj-tags>.igs-scmj-que{background:#3a2a0c;box-shadow:inset 0 0 0 1px rgba(255,211,106,.8),0 .2cqi .6cqi rgba(0,0,0,.5);}',
    '.igs-scmj-tile.is-won .igs-mj-pai{box-shadow:0 0 0 .3cqi #ffd36a,0 0 1.6cqi .3cqi rgba(255,211,106,.85);}',
    '.igs-scmj-que{display:inline-block;margin-left:.4em;padding:0 .45em;border-radius:999px;background:rgba(255,211,106,.18);box-shadow:inset 0 0 0 1px rgba(255,211,106,.7);color:#ffd36a;font-weight:800;line-height:1.5;}',
    '.igs-scmj-hued{display:inline-block;margin-left:.4em;padding:0 .5em;border-radius:999px;background:linear-gradient(180deg,#ff7a6b,#d8243f);color:#fff;font-weight:900;line-height:1.5;}',
    '.igs-scmj-card{background:#10141c;color:#f4f1e8;}',
    '.igs-scmj .igs-mj-card{gap:.7cqi;padding:1.6cqi 2.6cqi;}',
    '.igs-scmj .igs-mj-card-title{font-size:max(22px,3.4cqi);}',
    '.igs-scmj .igs-mj-card-hand .igs-mj-pai{--tw:2.3cqi;}',
    '.igs-scmj-table{display:grid;grid-template-columns:auto 1fr auto auto;gap:.35cqi 1.6cqi;align-items:center;width:100%;max-width:56cqi;margin:.2cqi 0;font-size:max(12px,1.4cqi);}',
    '.igs-scmj-row{display:contents;}',
    '.igs-scmj-row>span{padding:.3cqi 0;border-bottom:1px solid rgba(234,200,124,.18);}',
    '.igs-scmj-row .n{text-align:left;font-weight:800;color:#f4efe4;}',
    '.igs-scmj-row .l{text-align:left;color:#d9d2bd;}',
    '.igs-scmj-row .f{color:#ffd36a;font-weight:800;}',
    '.igs-scmj-row .s{text-align:right;font-weight:900;min-width:4em;}',
    '.igs-scmj-row .s.is-up{color:#8ff0a8;}',
    '.igs-scmj-row .s.is-down{color:#ff9a9a;}',
    '.igs-scmj-endinfo{font-size:max(11px,1.25cqi);color:#cfc8b4;}',
    '.igs-mj-mode{height:28px;margin-left:10px;padding:0 14px;border:1px solid rgba(236,201,124,.45);border-radius:999px;background:rgba(10,14,36,.55);color:#cfd6f0;font:600 13px/1 inherit;letter-spacing:.08em;cursor:pointer;}',
    '.igs-mj-mode[aria-pressed="true"]{background:linear-gradient(180deg,#fff1c2 0%,#ecc265 60%,#d49a2c 100%);border-color:#ffe6a6;color:#3a2300;font-weight:800;}',
].join('');

let paintFace = () => null;

export function bindScmjFace(fn) {
    paintFace = typeof fn === 'function' ? fn : () => null;
}

const SUIT_NAME = ['筒', '条', '万'];
const HUAN_NAME = ['对家换牌', '下家换牌', '上家换牌'];
const HU_TYPES = new Set(['zimo', 'hu', 'ganghua', 'dianganghua', 'gangpaohu', 'qiangganghu']);
const ACTION_NAME = {
    '7pairs': '七对',
    l7pairs: '龙七对',
    j7paris: '将七对',
    duidui: '碰碰胡',
    jiangdui: '将对',
    normal: '平胡',
    zimo: '自摸',
    hu: '胡',
    ganghua: '杠上花',
    dianganghua: '点杠花',
    gangpaohu: '杠炮胡',
    qiangganghu: '抢杠胡',
    fangpao: '放炮',
    angang: '暗杠',
    diangang: '明杠',
    wangang: '弯杠',
    fanggang: '放杠',
    zhuanshougang: '转手杠',
    beiqianggang: '被抢杠',
    beichadajiao: '被查叫',
    chadajiao: '查大叫',
    maozhuanyu: '呼叫转移',
};

let scmjLive = null;

export function readMahjongMode(storage) {
    if (!storage || typeof storage.getItem !== 'function') return 'riichi';
    return storage.getItem(MAHJONG_MODE_KEY) === 'scmj' ? 'scmj' : 'riichi';
}

export function writeMahjongMode(storage, mode) {
    if (!storage || typeof storage.setItem !== 'function') return;
    storage.setItem(MAHJONG_MODE_KEY, mode === 'scmj' ? 'scmj' : 'riichi');
}

export function forgetScmjTable() {
    if (scmjLive) scmjLive.generation = -1;
    scmjLive = null;
}

export function scmjLiveMatch() {
    return scmjLive && scmjLive.generation > 0 ? scmjLive : null;
}

export function tileSuit(id) {
    if (id < 9) return 0;
    if (id < 18) return 1;
    return 2;
}

function tileOrder(id) {
    const suit = tileSuit(id);
    const rank = suit === 2 ? 0 : suit === 0 ? 1 : 2;
    return rank * 9 + (id % 9);
}

export function tileLabel(id) {
    return `${'一二三四五六七八九'[id % 9]}${SUIT_NAME[tileSuit(id)]}`;
}

const SCMJ_MAX_FAN = 4;

// 胡的那一刻按手牌认牌型、估番数，算法照幼麟 calculateResult（结算时以幼麟为准）。
// seat 是控制器里胡牌那家，holds 已含胡的那张；另给剩几张牌、谁坐庄、本局出过几张牌、点炮的是谁。
export function scmjHuShape(seat, { zimo = false, kind = '', left = -1, button = -1, discards = 0, from = -1 } = {}) {
    const holds = (seat && seat.holds) || [];
    const pengs = seat.pengs || [];
    const gangs = [...(seat.angangs || []), ...(seat.diangangs || []), ...(seat.wangangs || [])];
    const counts = new Array(27).fill(0);
    for (const id of holds) counts[id] += 1;
    const all = [...holds, ...pengs, ...gangs];
    const patterns = [];
    let gen = gangs.length + pengs.filter((id) => counts[id] === 1).length + counts.filter((n) => n === 4).length;
    const pairs = counts.filter((n) => n === 2).length;
    const sevenPairs = !pengs.length && !gangs.length && holds.length === 14 && counts.every((n) => n % 2 === 0);
    const duidui = !sevenPairs && pairs === 1 && counts.every((n) => n === 0 || n === 2 || n === 3);
    const jiang = all.every((id) => [1, 4, 7].includes(id % 9));
    let fan = 0;
    let jiangdui = false;
    if (sevenPairs) {
        fan = 2;
        if (gen > 0) {
            gen -= 1;
            jiangdui = jiang;
            fan += jiangdui ? 2 : 1;
            patterns.push('龙七对');
        } else patterns.push('七对');
    } else if (duidui) {
        fan = 1;
        jiangdui = jiang;
        if (jiangdui) fan += 2;
        patterns.push(jiangdui ? '将对' : '碰碰胡');
    }
    if (new Set(all.map(tileSuit)).size === 1) {
        fan += 2;
        patterns.push('清一色');
    }
    if (holds.length <= 2) {
        fan += 1;
        patterns.push('金钩胡');
    }
    if (left === 0) {
        fan += 1;
        patterns.push('海底');
    }
    const index = seat.index;
    if (zimo && index === button && !discards) {
        fan += 3;
        patterns.push('天胡');
    } else if (!zimo && index !== button && from === button && discards === 1) {
        fan += 2;
        patterns.push('地胡');
    }
    if (!jiangdui && all.every((id) => id % 9 !== 0 && id % 9 !== 8)) fan += 1;
    if (!pengs.length && !(seat.diangangs || []).length && !(seat.wangangs || []).length) fan += 1;
    fan += gen;
    const gangName = { ganghua: '杠上花', dianganghua: '杠上花', gangpao: '杠上炮', qianggang: '抢杠胡' }[kind];
    if (gangName) {
        fan += 1;
        patterns.unshift(gangName);
    }
    return { patterns, fan: Math.min(SCMJ_MAX_FAN, fan) };
}

export function scmjCue(kind, { self = false, won = false } = {}) {
    if (kind === 'peng') return 'call';
    if (kind === 'gang') return 'kan';
    if (kind === 'hu') return self ? 'win' : 'lose';
    if (kind === 'fangpao') return self ? 'dealin' : null;
    if (kind === 'draw') return 'drawgame';
    if (kind === 'end') return won ? 'top' : 'final';
    return null;
}

export function scmjPenaltyTargets(rows) {
    const list = Array.isArray(rows) ? rows : [];
    const none = { losers: [], punisher: null };
    if (list.length < 2) return none;
    const scores = list.map((row) => row.score);
    const high = Math.max(...scores);
    if (scores.every((score) => score === high)) return none;
    const punisher = list.find((row) => row.score === high);
    const losers = list.filter((row) => row !== punisher && row.score < 0).map((row) => row.id);
    if (!losers.length) return none;
    return { losers, punisher: punisher.id };
}

function countedLabels(labels) {
    const counts = new Map();
    for (const label of labels) counts.set(label, (counts.get(label) || 0) + 1);
    return [...counts].map(([label, n]) => (n > 1 ? `${label}×${n}` : label));
}

export function scmjResultLabels(row) {
    const labels = [];
    if (row.pattern && ACTION_NAME[row.pattern]) labels.push(ACTION_NAME[row.pattern]);
    for (const action of row.actions || []) {
        if (ACTION_NAME[action.type] && action.type !== row.pattern) labels.push(ACTION_NAME[action.type]);
    }
    if (row.qingyise) labels.push('清一色');
    if (row.menqing) labels.push('门清');
    if (row.zhongzhang) labels.push('中张');
    if (row.jingouhu) labels.push('金钩胡');
    if (row.haidihu) labels.push('海底胡');
    if (row.tianhu) labels.push('天胡');
    if (row.dihu) labels.push('地胡');
    if (row.numofgen) labels.push(`根×${row.numofgen}`);
    return labels;
}

function storageOf(ctx) {
    return ctx && ctx.storage ? ctx.storage : null;
}

function readSave(storage) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
        const text = storage.getItem(SCMJ_SAVE_KEY);
        return text ? JSON.parse(text) : null;
    } catch (error) {
        return null;
    }
}

function writeSave(storage, data) {
    if (!storage || typeof storage.setItem !== 'function') return;
    storage.setItem(SCMJ_SAVE_KEY, JSON.stringify(data));
}

function clearSave(storage) {
    if (!storage || typeof storage.removeItem !== 'function') return;
    storage.removeItem(SCMJ_SAVE_KEY);
}

export function readScmjSave(storage) {
    return readSave(storage);
}

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function button(doc, className, text) {
    const node = el(doc, 'button', className, text);
    node.type = 'button';
    return node;
}

function faceTile(doc, id, className, locked = false) {
    const node = locked ? el(doc, 'span', className) : button(doc, className, '');
    node.setAttribute('data-tile', String(id));
    node.setAttribute('aria-label', tileLabel(id));
    const face = paintFace(doc, youlinToCode(id));
    if (face) node.appendChild(face);
    else node.textContent = tileLabel(id);
    return node;
}

function copiedMeld(id, count, concealed) {
    const code = youlinToCode(id);
    return Array.from({ length: count }, (_, index) => ({
        code: concealed ? 'back' : code,
        back: concealed,
        side: !concealed && index === count - 1,
    }));
}

function meldRow(seat) {
    return [
        ...seat.pengs.map((id) => copiedMeld(id, 3, false)),
        ...seat.diangangs.map((id) => copiedMeld(id, 4, false)),
        ...seat.wangangs.map((id) => copiedMeld(id, 4, false)),
        ...seat.angangs.map((id) => copiedMeld(id, 4, true)),
    ];
}

function lastRows(controller) {
    let rows = null;
    for (const step of controller.trace) {
        for (const msg of step.messages) {
            if (msg.event === 'game_over_push' && msg.userId === 1001) rows = msg.data;
        }
    }
    return rows;
}

function turnUser(controller) {
    let id = null;
    for (const step of controller.trace) {
        for (const msg of step.messages) {
            if (msg.event === 'game_chupai_push' && msg.userId === 1001) id = msg.data;
        }
    }
    return id;
}

function stepSeats(controller) {
    const seats = controller.seats;
    const waiting = seats.filter((seat) => seat.pending && !seat.hued);
    if (!waiting.some((seat) => seat.pending === 'action')) return waiting.slice(0, 1);
    const id = turnUser(controller);
    const discarder = Math.max(0, seats.findIndex((seat) => seat.userId === id));
    return [1, 2, 3, 4].map((delta) => seats[(discarder + delta) % 4]).filter((seat) => seat.pending === 'action');
}

function mjLeft(controller) {
    let left = null;
    for (const step of controller.trace) {
        for (const msg of step.messages) {
            if (msg.event === 'mj_count_push' && msg.userId === 1001) left = msg.data;
        }
    }
    return left;
}

function namedRows(rows, names) {
    return (rows || []).map((row, index) => ({ ...row, id: names[index] || `座位${index + 1}` }));
}

export function createScmjMatch(options = {}) {
    const seed = options.seed >>> 0 || 1;
    const names = options.names || ['你', '路人甲', '路人乙', '路人丙'];
    const controller = options.controller || createScmjController({ seed, strict: true });
    const internals = controller.xzdd.__internals;
    const userIds = controller.host.userIds;
    const personaOf = (index) => (index > 0 && options.personas ? options.personas.get(names[index]) : null);
    const ais = userIds.map((userId, index) => createScmjPlayer(index, userId, internals, {
        userIds,
        seed: seed * 4 + index,
        persona: personaOf(index),
        plain: !personaOf(index),
    }));
    const made = [];
    const planned = (options.decisions || []).slice();
    const cues = [];
    const lines = [];
    const hands = [];
    let cursor = 0;
    let feedAt = 0;
    let humanChoice = null;
    let fast = Boolean(options.fast);
    let restoring = Boolean(options.pause);
    // 只有重放旧决定时才不出声；新开的一桌停着等玩家时也要能开口打招呼。
    let quiet = Boolean(options.quiet) || (restoring && planned.length > 0);
    let huSeq = 0;
    const huOrder = [0, 0, 0, 0];
    let huanMethod = null;
    let discarderSeat = -1;
    let buttonSeat = 0;
    let drawnTile = null;
    let prevShot = null;
    let lastBeat = false;
    let paced = false;
    const huKind = ['', '', '', ''];
    const huFrom = [-1, -1, -1, -1];
    let notice = '';
    let holdResult = options.hold === 'result';
    let dissolved = false;
    let generation = 1;
    // 台词：和牌、点炮、被抢杠、开局、结算一定开口；碰杠、被碰、看别人胡大牌按她话多话少。玩家只喊宣言。
    // 说什么用另一条随机数，和电脑打牌的随机数分开，续局重放时不说话也不影响牌局。
    const voiceRandom = mulberry32((seed * 2654435761) >>> 0);
    const spoken = new Map();
    const saidIntent = new Set();
    // 跨局记账：谁上次胡了她（报仇），她连着点了几次炮。
    const burnedBy = [-1, -1, -1, -1];
    const streak = [0, 0, 0, 0];
    let greeted = false;
    let wallLeft = -1;
    let lastPai = -1;
    let discards = 0;
    let handHus = 0;
    let gangSeat = -1;
    let gangType = '';
    let armedGang = false;
    let hangangSeat = -1;
    let gangPaoSeat = -1;
    let stepHus = [];

    const nameOf = (index) => (index === 0 ? '你' : (names[index] || ''));
    const pick = (list) => (list.length ? list[Math.floor(voiceRandom() * list.length) % list.length] : -1);
    const rivals = (...skip) => [1, 2, 3].filter((index) => !skip.includes(index));

    // keys 从具体到一般；chatter 不为 0 时是闲话，按她的 talk 掷一次；declare 是玩家这时喊的宣言。
    function say(index, keys, { slots = {}, chatter = 0, once = '', declare = '' } = {}) {
        if (quiet || index < 0) return null;
        if (once && saidIntent.has(`${index}:${once}`)) return null;
        if (index === 0) {
            const text = declareLine('chengdu', declare);
            if (!text) return null;
            const entry = { index, event: declare, text, mood: '', hand: hands.length, declared: true };
            lines.push(entry);
            return entry;
        }
        const persona = personaOf(index) || autoPersona(names[index] || '');
        if (chatter && !wantsToTalk(persona, chatter, voiceRandom)) return null;
        const line = voiceLine(persona, 'chengdu', keys, { slots, random: voiceRandom, avoid: spoken.get(index) || [] });
        if (!line) return null;
        if (once) saidIntent.add(`${index}:${once}`);
        spoken.set(index, [line.text, ...(spoken.get(index) || [])].slice(0, 4));
        const entry = { index, event: line.key, text: line.text, mood: line.mood, hand: hands.length };
        lines.push(entry);
        if (typeof options.onVoice === 'function') options.onVoice({ who: names[index], text: line.text, mood: line.mood, event: line.key });
        return entry;
    }

    function totals() {
        return controller.host.room.seats.map((seat) => Number(seat.score) || 0);
    }

    function rankIn(scores, index) {
        return 1 + scores.filter((score, other) => other !== index && score > scores[index]).length;
    }

    function openingSpeak() {
        const scores = totals();
        const handNo = hands.length;
        const picks = [];
        for (const seat of rivals()) {
            const ai = ais[seat];
            if (!ai || !ai.mind) continue;
            const inner = mindMood(ai.mind);
            const rank = rankIn(scores, seat);
            const lower = scores.filter((score, index) => index !== seat && score <= scores[seat]);
            const gapDown = lower.length ? scores[seat] - Math.max(...lower) : 0;
            if (inner === '愤怒') picks.push([seat, 'open.tilt']);
            else if (inner === '紧张') picks.push([seat, 'open.shrink']);
            else if (handNo >= 3 && rank === 1 && gapDown >= 2) picks.push([seat, 'open.lead']);
            else if (handNo >= 3 && rank === 4) picks.push([seat, 'open.behind']);
        }
        if (!handNo && !greeted) {
            greeted = true;
            picks.push([pick(rivals()), 'open.first']);
        }
        if (!picks.length) return;
        const [seat, key] = picks[Math.floor(voiceRandom() * picks.length) % picks.length];
        say(seat, [key], { slots: { 对方: '你' } });
    }

    // 一步里的胡一起说：一炮多响要知道同一张被几家胡了。
    function flushHus(ending) {
        const list = stepHus;
        stepHus = [];
        if (!list.length) return;
        const scores = totals();
        const shots = new Map();
        let speaker = -1;
        for (const hu of list) {
            const { seat, zimo, from, shape } = hu;
            const others = controller.seats.filter((item) => !item.hued).map((item) => item.index);
            const keys = chengduWinKeys(shape, {
                zimo,
                first: hu.order === 1,
                last: hu.order === 3,
                comeback: hands.length >= 2 && rankIn(scores, seat) >= 3,
                revenge: !zimo && from >= 0 && burnedBy[seat] === from,
            });
            const tile = hu.pai >= 0 ? tileLabel(hu.pai) : '';
            const target = zimo ? (hu.order === 3 ? others[0] : -1) : from;
            say(seat, keys, { slots: { 对方: target >= 0 ? nameOf(target) : '', 牌: tile, 番: shape.fan }, declare: zimo ? 'win.zimo' : 'win.ron' });
            if (hu.kind === 'qianggang' && hu.robbed >= 0) say(hu.robbed, ['robbed'], { slots: { 对方: nameOf(seat), 牌: tile } });
            else if (!zimo && from >= 0) {
                const shot = shots.get(from) || [];
                shot.push(hu);
                shots.set(from, shot);
            }
            if (zimo && shape.fan >= 3) {
                speaker = pick(rivals(seat).filter((index) => !controller.seats[index].hued));
                say(speaker, ['tsumoed'], { slots: { 对方: nameOf(seat), 番: shape.fan }, chatter: 1.2 });
            }
            if (!zimo && from >= 0) burnedBy[from] = seat;
            streak[seat] = 0;
        }
        for (const [from, shot] of shots) {
            const big = shot.reduce((best, hu) => (hu.shape.fan > best.shape.fan ? hu : best), shot[0]);
            const keys = [];
            if (shot.length > 1) keys.push('dealIn.multi');
            if (big.shape.fan >= 3) keys.push('dealIn.big');
            if (streak[from] >= 1) keys.push('dealIn.again');
            keys.push('dealIn');
            say(from, keys, { slots: { 对方: nameOf(big.seat), 牌: big.pai >= 0 ? tileLabel(big.pai) : '', 番: big.shape.fan } });
            streak[from] += 1;
        }
        const loud = list.reduce((best, hu) => (hu.shape.fan > (best ? best.shape.fan : -1) ? hu : best), null);
        if (loud && loud.shape.fan >= SCMJ_MAX_FAN) {
            const watchers = rivals(loud.seat, loud.from, speaker);
            say(pick(watchers), ['react.big'], { slots: { 对方: nameOf(loud.seat), 番: loud.shape.fan }, chatter: 1 });
        }
        const standing = controller.seats.filter((item) => !item.hued).map((item) => item.index);
        if (!ending && standing.length === 2) {
            const voiced = standing.filter((index) => index > 0);
            const who = pick(voiced);
            say(who, ['duel'], { slots: { 对方: nameOf(standing.find((index) => index !== who)) }, chatter: 1.5, once: 'duel' });
        }
    }

    function speakSettlement(data) {
        const results = (data && data.results) || [];
        const has = (type) => results.map((row, index) => ((row.actions || []).some((action) => action.type === type) ? index : -1)).filter((index) => index > 0);
        const anyHu = results.some((row) => (row.actions || []).some((action) => HU_TYPES.has(action.type)));
        say(pick(has('chadajiao')), ['chajiao']);
        say(pick(has('beichadajiao')), ['beichajiao']);
        if (!anyHu) say(buttonSeat > 0 ? buttonSeat : pick(rivals()), ['drawgame']);
        if (!data || !data.endinfo || !results.length) return;
        const end = results.map((row) => Number(row.totalscore) || 0);
        const top = end.indexOf(Math.max(...end));
        const bottom = end.lastIndexOf(Math.min(...end));
        if (top > 0) say(top, ['final.top'], { slots: { 对方: nameOf(bottom) } });
        if (bottom > 0 && bottom !== top) say(bottom, ['final.last'], { slots: { 对方: nameOf(top) } });
    }

    function feed() {
        for (const step of controller.trace.slice(feedAt)) {
            for (const msg of step.messages) {
                const ai = ais.find((item) => item.userId === msg.userId);
                if (ai) ai.feed(msg);
                const mine = userIds.indexOf(msg.userId);
                const once = msg.userId === 1001;
                if (once && msg.event === 'game_begin_push') {
                    buttonSeat = Number(msg.data) || 0;
                    saidIntent.clear();
                    drawnTile = null;
                    huKind.fill('');
                    huFrom.fill(-1);
                    gangSeat = -1;
                    gangType = '';
                    armedGang = false;
                    hangangSeat = -1;
                    gangPaoSeat = -1;
                    wallLeft = -1;
                    lastPai = -1;
                    discards = 0;
                    handHus = 0;
                    stepHus = [];
                    if (!quiet) openingSpeak();
                }
                if (msg.event === 'game_mopai_push' && once) {
                    notice = '';
                    drawnTile = msg.data;
                }
                if (once && msg.event === 'mj_count_push') wallLeft = Number(msg.data);
                if (msg.event === 'guohu_push') {
                    if (once) notice = '过胡，本巡只能胡更大的';
                    if (mine >= 0) say(mine, ['guohu'], { slots: { 对方: discarderSeat >= 0 ? nameOf(discarderSeat) : '', 牌: lastPai >= 0 ? tileLabel(lastPai) : '' }, chatter: 1.3, once: 'guohu' });
                }
                if (!once) continue;
                if (msg.event === 'game_huanpai_over_push') huanMethod = msg.data.method;
                if (msg.event === 'game_chupai_notify_push') {
                    discarderSeat = userIds.indexOf(msg.data.userId);
                    lastPai = msg.data.pai;
                    discards += 1;
                    if (discarderSeat === 0) drawnTile = null;
                    gangPaoSeat = armedGang && gangSeat === discarderSeat ? discarderSeat : -1;
                    armedGang = false;
                    hangangSeat = -1;
                }
                if (msg.event === 'peng_notify_push' || msg.event === 'gang_notify_push') {
                    if (userIds.indexOf(msg.data.userid) === 0) drawnTile = null;
                }
                if (msg.event === 'peng_notify_push') {
                    const seat = userIds.indexOf(msg.data.userid);
                    const tile = tileLabel(msg.data.pai);
                    armedGang = false;
                    hangangSeat = -1;
                    const from = discarderSeat >= 0 && discarderSeat !== seat ? discarderSeat : -1;
                    say(seat, ['peng'], { slots: { 对方: from >= 0 ? nameOf(from) : '', 牌: tile }, chatter: 0.6, once: 'peng', declare: 'peng' });
                    if (from >= 0) say(from, ['stolen'], { slots: { 对方: nameOf(seat), 牌: tile }, chatter: 0.5, once: 'stolen' });
                }
                if (msg.event === 'gang_notify_push') {
                    const seat = userIds.indexOf(msg.data.userid);
                    const tile = tileLabel(msg.data.pai);
                    gangSeat = seat;
                    gangType = msg.data.gangtype || '';
                    armedGang = true;
                    hangangSeat = -1;
                    gangPaoSeat = -1;
                    const key = gangType === 'angang' ? 'gang.an' : (gangType === 'diangang' ? 'gang.dian' : 'gang.wan');
                    const from = gangType === 'diangang' && discarderSeat >= 0 && discarderSeat !== seat ? discarderSeat : -1;
                    say(seat, [key], { slots: { 对方: from >= 0 ? nameOf(from) : '', 牌: tile }, chatter: 1.1, declare: key });
                    if (from >= 0) say(from, ['fanggang'], { slots: { 对方: nameOf(seat), 牌: tile }, chatter: 0.9 });
                }
                if (msg.event === 'hangang_notify_push') hangangSeat = Number(msg.data);
                if (msg.event === 'hu_push') {
                    huSeq += 1;
                    const seat = msg.data.seatindex;
                    const zimo = Boolean(msg.data.iszimo);
                    let kind = '';
                    if (!zimo && hangangSeat >= 0 && !armedGang) kind = 'qianggang';
                    else if (zimo && armedGang && gangSeat === seat) kind = gangType === 'diangang' ? 'dianganghua' : 'ganghua';
                    else if (!zimo && gangPaoSeat >= 0 && gangPaoSeat === discarderSeat) kind = 'gangpao';
                    const holder = controller.seats[seat];
                    const from = zimo ? -1 : (kind === 'qianggang' ? hangangSeat : discarderSeat);
                    const pai = msg.data.hupai >= 0 ? msg.data.hupai : holder.holds[holder.holds.length - 1];
                    huOrder[seat] = huSeq;
                    huKind[seat] = zimo ? 'zimo' : 'ron';
                    huFrom[seat] = from;
                    handHus += 1;
                    if (!quiet) {
                        const shape = scmjHuShape(holder, { zimo, kind, left: wallLeft, button: buttonSeat, discards, from });
                        stepHus.push({ seat, zimo, kind, from, robbed: kind === 'qianggang' ? hangangSeat : -1, order: handHus, pai: Number.isInteger(pai) ? pai : -1, shape });
                    }
                    if (zimo || kind === 'qianggang') armedGang = false;
                    hangangSeat = -1;
                }
                if (msg.event === 'game_over_push') {
                    flushHus(true);
                    if (!quiet) speakSettlement(msg.data);
                }
            }
            flushHus(false);
        }
        const now = tableShot();
        const heard = mahjongBeat(prevShot, now);
        if (!quiet) {
            for (const name of heard.sounds) if (name !== 'riichi') cues.push(name);
        }
        lastBeat = heard.beat;
        prevShot = now;
        feedAt = controller.trace.length;
    }

    function tableShot() {
        const over = lastRows(controller);
        const types = over && over.results ? over.results.flatMap((row) => (row.actions || []).map((action) => action.type)) : [];
        let end = '';
        if (over && over.endinfo) {
            const totals = over.results.map((row) => row.totalscore);
            end = totals[0] === Math.max(...totals) ? 'top' : 'final';
        } else if (over && !types.some((type) => HU_TYPES.has(type))) end = 'drawgame';
        return {
            left: mjLeft(controller),
            end,
            wins: controller.seats.map((seat, index) => (seat.hued ? {
                seat: index,
                kind: huKind[index] || 'ron',
                from: huFrom[index],
                key: String(huOrder[index]),
            } : null)).filter(Boolean),
            seats: controller.seats.map((seat, index) => ({
                pond: seat.rivers.map((id) => ({ code: youlinToCode(id) })),
                melds: meldRow(seat),
                hand: { zimo: index === 0 && drawnTile != null ? youlinToCode(drawnTile) : '', backs: seat.holds.length },
            })),
        };
    }

    function speakChoice(index, choice, intent) {
        if (!choice || choice.dapai == null || (intent !== 'fold' && intent !== 'push')) return;
        say(index, [intent], { chatter: 0.8, once: intent });
    }

    function decide(view) {
        feed();
        let choice;
        let intent = '';
        if (cursor < planned.length) choice = planned[cursor];
        else if (view.index === 0 && humanChoice && !fast) {
            choice = humanChoice;
            humanChoice = null;
        } else if (view.index === 0 && options.policy && !fast && !(view.hued && fast)) choice = options.policy(view);
        else {
            choice = ais[view.index].decide(view);
            intent = ais[view.index].takeIntent() || '';
        }
        speakChoice(view.index, choice, intent);
        made.push(choice);
        cursor += 1;
        return choice;
    }

    function ready(seat, offset) {
        if (cursor + offset < planned.length) return true;
        if (restoring && cursor + offset >= planned.length) return false;
        if (seat.index !== 0 || fast || (seat.hued && fast)) return true;
        if (options.policy && !humanChoice) return true;
        return Boolean(humanChoice);
    }

    function atResult() {
        const waiting = controller.seats.some((seat) => seat.pending && !seat.hued);
        return Boolean(controller.over && !controller.over.endinfo && !waiting);
    }

    function publicState() {
        const over = lastRows(controller);
        return {
            seats: controller.seats.map((seat, index) => ({
                holds: seat.holds.slice(),
                rivers: seat.rivers.slice(),
                pengs: seat.pengs.slice(),
                angangs: seat.angangs.slice(),
                diangangs: seat.diangangs.slice(),
                wangangs: seat.wangangs.slice(),
                que: seat.que,
                hued: seat.hued,
                huOrder: huOrder[index],
                pending: seat.pending,
            })),
            totals: controller.host.room.seats.map((seat) => seat.score),
            left: mjLeft(controller),
            hand: over && over.results ? over.results.map((row) => row.score) : null,
            final: Boolean(over && over.endinfo),
        };
    }

    function phaseOf(group) {
        if (!group.length) return atResult() ? 'result' : 'stop';
        if (group.length === 1 && group[0].pending === 'huan') return 'huan';
        if (group.length === 1 && group[0].pending === 'dingque') return 'dingque';
        if (group.some((seat) => seat.pending === 'action')) return group.some((seat) => seat.index === 0) ? 'action' : 'computer';
        return group[0].index === 0 ? 'turn' : 'computer';
    }

    const match = {
        seed,
        names,
        cues,
        lines,
        hands,
        controller,
        get generation() { return generation; },
        set generation(value) { generation = value; },
        get decisions() { return made.slice(); },
        get fast() { return fast; },
        get dissolved() { return dissolved; },
        get huanMethod() { return huanMethod; },
        get button() { return buttonSeat; },
        get notice() { return notice; },
        innerMood(index) {
            const ai = index > 0 ? ais[index] : null;
            return ai && ai.mind ? mindMood(ai.mind) : '';
        },
        get drawn() { return drawnTile; },
        get wins() {
            return controller.seats.map((seat, index) => (seat.hued ? {
                seat: index,
                kind: huKind[index] || 'ron',
                from: huFrom[index],
                key: String(huOrder[index]),
            } : null)).filter(Boolean);
        },
        awaitingHuman() {
            if (generation < 0 || fast) return true;
            if (controller.over && controller.over.endinfo) return true;
            if (atResult()) return true;
            const group = stepSeats(controller);
            if (!group.length) return true;
            return group.some((seat) => seat.index === 0 && seat.pending);
        },
        advance() {
            if (match.awaitingHuman()) return match;
            return tick();
        },
        get huOrder() { return huOrder.slice(); },
        get paced() { return paced; },
        publicState,
        phase() {
            if (controller.over && controller.over.endinfo) return 'final';
            if (atResult()) return 'result';
            return phaseOf(stepSeats(controller));
        },
        view() {
            const group = stepSeats(controller);
            const human = group.find((seat) => seat.index === 0) || controller.seats[0];
            return controller.view(human);
        },
        answer(choice) {
            humanChoice = choice;
            restoring = false;
            quiet = Boolean(options.quiet);
            holdResult = false;
            tick();
        },
        setFast(value) {
            fast = Boolean(value);
            if (fast) tick();
        },
        continueHand() {
            releaseHand();
            tick();
        },
        dissolve() {
            try {
                controller.xzdd.doDissolve(controller.host.room.id);
                controller.host.flush();
            } catch (error) { /* 房间已经结束时解散会直接返回。 */ }
            dissolved = true;
            generation = -1;
            if (scmjLive === match) scmjLive = null;
            clearSave(options.storage);
        },
        capture(phase) {
            return { phase: phase || match.phase(), decisions: made.slice(), state: JSON.parse(JSON.stringify(publicState())), hold: atResult() ? 'result' : '' };
        },
    };

    function releaseHand() {
        if (!atResult()) return false;
        const over = lastRows(controller);
        if (over && over.results) hands.push(over.results.map((row) => row.score));
        for (const seat of controller.seats) controller.invoke('setReady', seat.userId);
        huSeq = 0;
        huOrder.fill(0);
        huanMethod = null;
        holdResult = false;
        return true;
    }

    function tick() {
        if (generation < 0) return match;
        drive();
        if (typeof match.onChange === 'function') match.onChange();
        return match;
    }

    function drive() {
        paced = false;
        if (generation < 0) return;
        let guard = 0;
        while (guard < 4000) {
            guard += 1;
            if (controller.over && controller.over.endinfo) return;
            if (options.record) options.record.push(match.capture());
            if (atResult()) {
                const more = cursor < planned.length;
                if (more || (options.policy && !options.hold)) {
                    releaseHand();
                    continue;
                }
                return match;
            }
            const group = stepSeats(controller);
            if (!group.length) return match;
            if (restoring && cursor >= planned.length) return match;
            if (!group.every((seat, index) => ready(seat, index))) return match;
            const before = cursor;
            controller.step(decide);
            feed();
            if (cursor === before) return match;
            if (options.pace && !fast && !restoring && lastBeat) {
                paced = true;
                return match;
            }
        }
        throw new Error('成都牌局超过步数');
    }

    controller.start();
    feed();
    if (planned.length) {
        restoring = true;
        quiet = true;
        tick();
        restoring = Boolean(options.pause);
        quiet = Boolean(options.quiet);
        if (!options.pause) tick();
    } else if (options.auto || options.policy) tick();
    return match;
}

// 新开的桌每次洗一副新牌；存档里记着种子，续局按同一个种子重放。
function freshSeed() {
    return Math.floor(Math.random() * 0x7fffffff) + 1;
}

function hintQue(holds, internals) {
    return createScmjPlayer(0, 1001, internals).decide({ pending: 'dingque', holds }).que;
}

const SCMJ_FLASH_MS = 3200;
const SCMJ_HU_HOLD_MS = 1800;
const CARD_KEYS = /^(win\.|pattern\.|dealIn|robbed|tsumoed|react\.big|chajiao|beichajiao|drawgame|final\.|duel)/;

export function openScmjTable(ctx, cast, saved, options = {}) {
    const doc = ctx.doc;
    const board = ctx.board;
    board.innerHTML = '';
    const names = (cast || []).map((person) => person.name);
    const bare = new Set([...(saved && saved.nude || []), ...(options.nude || [])]);
    const people = (cast || []).map((person) => (
        person && bare.has(person.name) && person.nudeFaces ? { ...person, faces: person.nudeFaces } : person
    ));
    const match = createScmjMatch({
        seed: saved && saved.seed ? saved.seed : (options.seed || freshSeed()),
        pace: Boolean(options.present),
        names,
        storage: storageOf(ctx),
        decisions: saved && saved.decisions ? saved.decisions : [],
        hold: saved && saved.hold,
        pause: true,
        quiet: false,
        onVoice: ctx.onVoice,
        policy: options.policy || null,
        personas: options.personas || null,
    });
    match.generation = 1;
    scmjLive = match;
    const view = openMahjongView(ctx);
    const { root, sceneTop, actions, end, close } = view
    root.className += ' igs-scmj';
    const PLACE = ['self', 'right', 'top', 'left'];
    let selected = [];
    let selectedFor = '';
    let shownLines = 0;
    const flashes = new Map();
    const heads = [];
    const winKey = (win) => `${match.hands.length}:${win.seat}:${win.key}`;
    const shownWins = new Set(match.wins.map(winKey));

    function persist() {
        if (match.generation < 0) return;
        writeSave(storageOf(ctx), {
            version: 1,
            seed: match.seed,
            decisions: match.decisions,
            hold: match.phase() === 'result' ? 'result' : '',
            cast: names.map((name) => ({ name })),
            nude: [...bare],
            finished: match.phase() === 'final',
        });
    }

    function tileEntry(player, id, index, zimo) {
        const legal = new Set(player.legal || []);
        const play = player.pending === 'huan' || (player.pending === 'turn' && legal.has(id));
        const locked = player.pending === 'turn' && !legal.has(id);
        return {
            code: youlinToCode(id),
            button: play,
            hot: play,
            locked,
            zimo,
            key: zimo ? 'zimo' : index,
            className: `igs-scmj-tile${locked ? ' is-locked' : ''}`,
            attrs: {
                'data-tile': id,
                'data-index': index,
                'aria-pressed': selected.includes(index) ? 'true' : 'false',
            },
            onClick: play ? () => chooseTile(player, id, index) : null,
        };
    }

    // 胡了以后胡的那张（幼麟把它接在手牌最后）单独放在右边亮出来。
    function handEntries(player, won) {
        const drawnAt = won ? player.holds.length - 1 : (match.drawn == null ? -1 : player.holds.lastIndexOf(match.drawn));
        const order = player.holds.map((id, index) => ({ id, index })).filter((item) => item.index !== drawnAt);
        order.sort((a, b) => tileOrder(a.id) - tileOrder(b.id) || a.index - b.index);
        const entries = order.map(({ id, index }) => tileEntry(player, id, index, false));
        if (drawnAt >= 0) {
            const last = tileEntry(player, player.holds[drawnAt], drawnAt, true);
            if (won) last.className += ' is-won';
            entries.push(last);
        }
        return entries;
    }

    function chooseTile(player, id, index) {
        if (player.pending === 'huan') {
            const suit = tileSuit(id);
            const at = selected.indexOf(index);
            if (at >= 0) selected.splice(at, 1);
            else if (selected.length && tileSuit(player.holds[selected[0]]) !== suit) selected = [index];
            else if (selected.length < 3) selected.push(index);
            for (const child of sceneTop.querySelectorAll('.igs-scmj-tile')) {
                child.setAttribute('aria-pressed', String(selected.includes(Number(child.getAttribute('data-index')))));
            }
            const confirm = actions.querySelector('.igs-scmj-confirm');
            if (confirm) confirm.disabled = selected.length !== 3;
            return;
        }
        match.answer({ dapai: id });
    }

    function paintActions(player) {
        const key = `${player.pending}:${JSON.stringify(player.action || null)}`;
        view.keepActions(key, false, (box) => {
            const press = (label, kind, run, tiles) => {
                const node = view.actButton(label, `igs-scmj-act ${kind}`.trim(), tiles || null, run);
                box.appendChild(node);
                return node;
            };
            if (player.pending === 'huan') {
                const confirm = press('确认换牌', 'igs-scmj-confirm', () => {
                    if (selected.length !== 3) return;
                    match.answer({ huan: selected.map((index) => player.holds[index]) });
                });
                confirm.disabled = selected.length !== 3;
                return;
            }
            if (player.pending === 'dingque') {
                const hint = hintQue(player.holds, match.controller.xzdd.__internals);
                SUIT_NAME.forEach((name, que) => {
                    press(name, que === hint ? 'is-hint' : '', () => {
                        match.answer({ que });
                    });
                });
                return;
            }
            if (player.pending === 'action' && player.action) {
                if (player.action.hu) press('胡', 'is-win', () => match.answer({ hu: true }));
                if (player.action.gang) {
                    for (const pai of player.action.gangpai) {
                        const face = youlinToCode(pai);
                        press(`杠${tileLabel(pai)}`, 'is-call', () => match.answer({ gang: true, pai }), [face, face, face, face]);
                    }
                }
                if (player.action.peng && Number.isInteger(player.action.pai)) {
                    const face = youlinToCode(player.action.pai);
                    press('碰', 'is-call', () => match.answer({ peng: true }), [face, face, face]);
                } else if (player.action.peng) press('碰', 'is-call', () => match.answer({ peng: true }));
                press('过', 'is-skip', () => match.answer({ guo: true }));
            }
            if (match.controller.seats[0].hued) press('快进', 'igs-scmj-fast', () => match.setFast(true));
        }, player.pending === 'action' && player.action && (player.action.hu || player.action.peng || player.action.gang));
    }

    // 说话时头像换上台词的表情，过一会儿回到她心里的情绪。
    function faceOf(index) {
        const flash = flashes.get(index);
        if (flash && flash.until > Date.now()) return flash.mood;
        return match.innerMood(index) || '平和';
    }

    function paintFaces() {
        if (match.generation < 0) return;
        heads.forEach((spec, index) => {
            if (spec) view.renderHead(index, { ...spec, mood: faceOf(index) });
        });
    }

    function flashLine(index, mood) {
        const prev = flashes.get(index);
        const until = Math.max(prev ? prev.until : 0, Date.now() + SCMJ_FLASH_MS);
        flashes.set(index, { mood, until });
        setTimeout(paintFaces, until - Date.now() + 60);
    }

    // 结算卡上写这一局的要紧话：胡牌、点炮、被抢杠、查叫、终局；碰杠闲话和玩家宣言不写。
    function quoteBox() {
        const lines = match.lines.filter((line) => line.hand === match.hands.length && !line.declared && CARD_KEYS.test(line.event)).slice(-5);
        if (!lines.length) return null;
        const box = el(doc, 'div', 'igs-mj-card-quote');
        for (const line of lines) box.appendChild(el(doc, 'span', '', `${names[line.index]}：「${line.text}」`));
        return box;
    }

    function paint() {
        const phase = match.phase();
        const pendingNow = `${match.hands.length}:${match.view().pending || ''}`;
        if (pendingNow !== selectedFor) {
            selected = [];
            selectedFor = pendingNow;
        }
        const state = match.publicState();
        const player = match.view();
        const queName = ['筒', '条', '万'];
        const live = state.seats.findIndex((seat) => seat.pending === 'turn' || seat.pending === 'action');
        const handNo = (match.hands.length || 0) + 1;
        const round = `第${handNo}局 / 共 4 局`;
        const direction = match.huanMethod == null ? '' : HUAN_NAME[match.huanMethod];
        const fresh = match.lines.slice(shownLines);
        shownLines = match.lines.length;
        for (const line of fresh) if (line.mood) flashLine(line.index, line.mood);
        state.seats.forEach((seat, index) => {
            const name = index === 0 ? '你' : (names[index] || '');
            const head = view.ensureHead(index, people[index], name);
            heads[index] = {
                place: PLACE[index],
                turn: index === live,
                wind: index === match.button ? '庄' : '',
                dealer: index === match.button,
            };
            view.renderHead(index, { ...heads[index], mood: faceOf(index) });
            // 缺门和胡序贴在头像左上角，不跟名字挤一行，名字长了也不会被省略号吃掉。
            const tagKey = `${seat.que}|${seat.hued ? seat.huOrder || 0 : -1}`;
            if (head.scmjTagKey !== tagKey) {
                head.scmjTagKey = tagKey;
                if (!head.scmjTags) {
                    head.scmjTags = el(doc, 'span', 'igs-scmj-tags');
                    head.wind.parentNode.appendChild(head.scmjTags);
                }
                head.scmjTags.textContent = '';
                if (seat.que >= 0) head.scmjTags.appendChild(el(doc, 'span', 'igs-scmj-que', `缺${queName[seat.que]}`));
                if (seat.hued) head.scmjTags.appendChild(el(doc, 'span', 'igs-scmj-hued', seat.huOrder ? `胡${seat.huOrder}` : '胡'));
            }
        });
        for (const line of fresh) view.say(line.index, line.text);
        const wins = match.wins;
        const newWins = wins.filter((win) => !shownWins.has(winKey(win)));
        for (const win of newWins) shownWins.add(winKey(win));
        const info = el(doc, 'div', 'igs-mj-dora');
        info.appendChild(el(doc, 'div', 'igs-mj-dora-title', '成都麻将 · 血战到底'));
        info.appendChild(el(doc, 'div', 'igs-mj-dora-sticks', [round, '底分1', '封顶4番', direction, match.notice].filter(Boolean).join(' · ')));
        view.ensureFelt();
        view.show({
            round: `第${handNo}局`,
            left: state.left,
            end: phase === 'final'
                ? (state.totals[0] === Math.max(...state.totals) ? 'top' : 'final')
                : (phase === 'result' && !state.seats.some((seat) => seat.hued) ? 'drawgame' : ''),
            wins,
            pondRow: 8,
            seats: state.seats.map((seat, index) => ({
                wind: index === match.button ? '庄' : '',
                score: state.totals[index],
                dealer: index === match.button,
                turn: index === live,
                hand: seat.hued && seat.holds.length ? {
                    tiles: [],
                    backs: index === 0 ? 0 : seat.holds.length - 1,
                    zimo: youlinToCode(seat.holds[seat.holds.length - 1]),
                    won: true,
                } : {
                    tiles: [],
                    backs: index === 0 ? 0 : seat.holds.length,
                    zimo: index === 0 && match.drawn != null ? youlinToCode(match.drawn) : '',
                },
                melds: meldRow(seat),
                pond: seat.rivers.map((id) => ({ code: youlinToCode(id) })),
            })),
        });
        sceneTop.appendChild(info);
        sceneTop.appendChild(view.selfRail({
            live: player.pending === 'turn',
            tiles: handEntries(player, state.seats[0].hued),
            melds: meldRow(player),
        }));
        if (phase === 'result' || phase === 'final') {
            const card = view.openCard(phase === 'final' ? 'end' : 'win', phase === 'final' ? '终局' : '本局');
            const over = lastRows(match.controller);
            const rows = namedRows(over && over.results, names);
            const byOrder = rows.map((row, index) => ({ row, index }))
                .sort((a, b) => (a.row.huorder >= 0 ? a.row.huorder : 9) - (b.row.huorder >= 0 ? b.row.huorder : 9) || a.index - b.index);
            byOrder.forEach(({ row, index }) => {
                const won = row.huorder >= 0;
                const holds = row.holds || [];
                if ((won || row.pattern) && holds.length) {
                    const body = won ? holds.slice(0, -1) : holds;
                    const closed = body.map((id) => ({ id, code: youlinToCode(id) })).sort((a, b) => tileOrder(a.id) - tileOrder(b.id));
                    if (won) card.appendChild(el(doc, 'div', 'igs-mj-card-who', `胡${row.huorder + 1} ${names[index]}`));
                    card.appendChild(view.played({
                        tiles: closed.map((tile) => tile.code),
                        zimo: won ? youlinToCode(holds[holds.length - 1]) : '',
                        melds: meldRow(row),
                    }));
                }
            });
            const table = el(doc, 'div', 'igs-scmj-table');
            byOrder.forEach(({ row, index }) => {
                const won = row.huorder >= 0;
                const line = el(doc, 'div', 'igs-scmj-row');
                line.appendChild(el(doc, 'span', 'n', won ? `${names[index]} · 胡${row.huorder + 1}` : names[index]));
                line.appendChild(el(doc, 'span', 'l', countedLabels(scmjResultLabels(row).map((label) => (label === '胡' ? '接炮' : label))).join(' ') || '—'));
                line.appendChild(el(doc, 'span', 'f', won ? `${row.fan || 0}番` : ''));
                const score = row.score || 0;
                line.appendChild(el(doc, 'span', `s${score > 0 ? ' is-up' : score < 0 ? ' is-down' : ''}`, score > 0 ? `+${score}` : String(score)));
                table.appendChild(line);
            });
            card.appendChild(table);
            const quotes = quoteBox();
            if (quotes) card.appendChild(quotes);
            card.appendChild(view.deltas(rows.map((row, index) => ({
                person: people[index],
                name: names[index],
                mood: row.huorder >= 0 ? '喜悦' : (row.score < 0 ? '悲伤' : '平和'),
                delta: row.score,
            }))));
            const penalty = scmjPenaltyTargets(rows.map((row) => ({ id: row.id, score: phase === 'final' ? row.totalscore : row.score })));
            if (penalty.losers.length) {
                view.punish(card, {
                    targets: penalty.losers,
                    punisher: penalty.punisher,
                    present: names,
                    basis: 'negative',
                    stage: phase === 'final' ? 'final' : 'hand',
                    scene: '一场成都麻将血战到底刚刚打完',
                    outfits() {
                        return Object.fromEntries(people.slice(1)
                            .map((person) => [person && person.name, person && (bare.has(person.name) && person.nudeFaces ? '裸体' : person.outfit)])
                            .filter(([name, outfit]) => name && outfit));
                    },
                    onStrip(names) { for (const name of names) bare.add(name); },
                    onDone(final) { if (!final) { match.continueHand(); paint(); } },
                });
            }
            if (phase === 'final' && over && over.endinfo) {
                const order = rows.map((row, index) => ({ row, index }))
                    .sort((a, b) => (b.row.totalscore || 0) - (a.row.totalscore || 0) || a.index - b.index);
                let place = 0;
                let lastScore = null;
                const lowTotal = Math.min(...rows.map((row) => row.totalscore || 0));
                card.appendChild(view.rank(order.map((item, index) => {
                    if (item.row.totalscore !== lastScore) {
                        place = index + 1;
                        lastScore = item.row.totalscore;
                    }
                    return {
                        person: people[item.index],
                        name: names[item.index],
                        mood: place === 1 ? '喜悦' : (item.row.totalscore === lowTotal ? '悲伤' : '平和'),
                        place,
                        score: item.row.totalscore,
                    };
                })));
                over.endinfo.forEach((info, index) => {
                    card.appendChild(el(doc, 'div', 'igs-scmj-endinfo', `${names[index]} 自摸${info.numzimo} 接炮${info.numjiepao} 点炮${info.numdianpao} 暗杠${info.numangang} 明杠${info.numminggang} 被查叫${info.numchadajiao} 总分${over.results[index].totalscore}`));
                });
                const again = button(doc, 'igs-ws-chip igs-scmj-again', '再来一局');
                again.addEventListener('click', () => openScmjTable(ctx, cast, null, {
                    present: Boolean(options.present), seed: freshSeed(), nude: [...bare], onPicker: options.onPicker,
                }));
                const swap = button(doc, 'igs-ws-chip igs-scmj-switch', '换对手');
                swap.addEventListener('click', () => { match.dissolve(); if (typeof options.onPicker === 'function') options.onPicker(); });
                view.foot.appendChild(again);
                view.foot.appendChild(swap);
                const album = view.album(view.banner, () => {
                    card.hidden = true;
                    return () => { card.hidden = false; };
                });
                if (album) view.foot.appendChild(album);
            } else {
                const next = button(doc, 'igs-ws-chip igs-scmj-next', '继续');
                next.addEventListener('click', () => { match.continueHand(); paint(); });
                view.foot.appendChild(next);
            }
            view.sealCard(card);
            view.clearActions();
        } else {
            view.clearBanner();
            paintActions(player);
        }
        persist();
        // 一次操作可能连着重绘两回，第二回没有新动作；看 beat 会把上一回装好的计时器清掉，AI 就停住不打了。
        // 只在牌局为了节奏停下时才续，推进不了的局面不装计时器，免得每 450ms 空转重绘。
        // 刚有人胡，多停一会儿让人看清胡的哪张。
        view.hold(options.present && match.paced && !match.fast && match.generation > 0 && !match.awaitingHuman() ? () => match.advance() : null, newWins.length ? SCMJ_HU_HOLD_MS : undefined);
    }

    end.addEventListener('click', () => {
        view.stopHold();
        match.dissolve();
        board.innerHTML = '';
        if (typeof ctx.requestClose === 'function') ctx.requestClose();
    });
    close.addEventListener('click', () => {
        view.stopHold();
        persist();
        if (typeof ctx.requestClose === 'function') ctx.requestClose();
    });
    match.reattach = (next) => {
        if (!next || !next.board || match.generation < 0) return;
        view.attach(next);
        paint();
    };
    if (saved && saved.decisions) {
        match.answer = match.answer.bind(match);
        restoringRelease(match);
    }
    match.onChange = paint;
    paint();
    return match;
}

function restoringRelease(match) {
    match.phase();
}

export function runScmj(seed, policy) {
    const snapshots = [];
    const match = createScmjMatch({ seed, policy, auto: true, record: snapshots });
    if (match.phase() === 'final' || (match.controller.over && match.controller.over.endinfo)) snapshots.push(match.capture('final'));
    return { snapshots, decisions: match.decisions, hands: match.hands, cues: match.cues.slice(), lines: match.lines.slice() };
}

export function restoreScmj(seed, decisions, hold = '') {
    return createScmjMatch({ seed, decisions, pause: true, quiet: true, hold, auto: false });
}
