// 等待过场小游戏：飞行棋。DOM 棋盘，格子与棋子位置都走 CSS 变量，颜色取自主题变量。
import { avatarCrop } from './wait-stage-mahjong.js';
import { waitStageGameLine } from './wait-stage-game-lines.js';

export const LUDO_COLOR_NAMES = Object.freeze(['红', '黄', '蓝', '绿']);
export const LUDO_RING = 52; // 外圈格数
export const LUDO_FINISH = 56; // 进度：-1 机场，0–50 外圈，51–55 终点直道，56 终点
export const LUDO_LANE_START = 51;
export const LUDO_SHORT_FROM = 16; // 本色捷径起点（相对进度）
export const LUDO_SHORT_TO = 28;
export const LUDO_PIECES = 4;
const SAVE_KEY = 'igs:wait-games:ludo-cast';

// 参与的颜色：两家对角，三家缺最后一色，四家全上。
export function ludoSeatColors(count) {
    const n = Math.max(2, Math.min(4, Math.floor(Number(count) || 4)));
    return n === 2 ? [0, 2] : (n === 3 ? [0, 1, 2] : [0, 1, 2, 3]);
}

// 外圈 52 格：顺时针，从左上角起，14×14 棋盘的周边一圈。返回格子左上角坐标。
export function ringCell(abs) {
    const p = ((abs % LUDO_RING) + LUDO_RING) % LUDO_RING;
    if (p < 13) return { x: p, y: 0 };
    if (p < 26) return { x: 13, y: p - 13 };
    if (p < 39) return { x: 13 - (p - 26), y: 13 };
    return { x: 0, y: 13 - (p - 39) };
}

// 绕棋盘中心顺时针转 90° 若干次；坐标是格子中心坐标（格子 (i,j) 的中心为 i+.5, j+.5）。
export function rotatePoint(point, times) {
    let { x, y } = point;
    for (let i = 0; i < ((times % 4) + 4) % 4; i += 1) [x, y] = [14 - y, x];
    return { x, y };
}

// 每色的起飞点在外圈的绝对位置；相对进度 r 对应 (start + r) % 52。
export function ludoStart(color) {
    return color * 13 + 8;
}

export function ludoAbs(color, progress) {
    return progress >= 0 && progress <= 50 ? (ludoStart(color) + progress) % LUDO_RING : -1;
}

// 外圈格的底色序号，也就是「本色格」。
export function ringColor(abs) {
    return ((abs % 4) + 4) % 4;
}

const HANGAR_SLOTS = Object.freeze([{ x: 9.5, y: 2.5 }, { x: 11.5, y: 2.5 }, { x: 9.5, y: 4.5 }, { x: 11.5, y: 4.5 }]);
export const HANGAR_CENTER = Object.freeze({ x: 10.5, y: 3.5 });

// 棋子所在位置的中心坐标（格子单位）。
export function ludoPoint(color, progress, slot = 0) {
    if (progress < 0) return rotatePoint(HANGAR_SLOTS[slot % LUDO_PIECES], color);
    if (progress <= 50) {
        const cell = ringCell(ludoAbs(color, progress));
        return { x: cell.x + 0.5, y: cell.y + 0.5 };
    }
    return rotatePoint({ x: 6.5, y: 1.5 + (Math.min(progress, LUDO_FINISH) - LUDO_LANE_START) }, color);
}

// 走到 p 之后的结算：落在本色格先跳四格；落在捷径起点沿捷径飞到对面。
export function settleProgress(p) {
    const stay = { progress: p, jumped: false, flew: false };
    if (p <= 0 || p > 50) return stay;
    if (p === LUDO_SHORT_FROM) return { progress: LUDO_SHORT_TO, jumped: false, flew: true };
    if (p % 4 !== 0 || p + 4 > 50) return stay;
    if (p + 4 === LUDO_SHORT_FROM) return { progress: LUDO_SHORT_TO, jumped: true, flew: true };
    return { progress: p + 4, jumped: true, flew: false };
}

export function ludoRoll(random = Math.random) {
    return 1 + Math.min(5, Math.floor(random() * 6));
}

// colors：参与的颜色序号。棋子进度按座位存。
export function createLudoState(colors = [0, 1, 2, 3]) {
    return {
        seats: colors.slice(),
        pieces: colors.map(() => Array(LUDO_PIECES).fill(-1)),
        turn: 0,
        dice: 0,
        winner: -1,
    };
}

// 可走的棋子序号；同进度的棋子等价，只列第一枚。
export function legalMoves(state, seat, roll) {
    if (!state || state.winner >= 0) return [];
    const seen = new Set();
    const out = [];
    state.pieces[seat].forEach((progress, index) => {
        if (progress >= LUDO_FINISH || seen.has(progress)) return;
        if (progress < 0 && roll !== 6) return;
        seen.add(progress);
        out.push(index);
    });
    return out;
}

function nextSeat(state) {
    return (state.turn + 1) % state.seats.length;
}

// 走一步，返回 { state, events }（不改入参）；不合法返回 null。
export function applyMove(state, seat, piece, roll) {
    if (!state || state.winner >= 0 || state.turn !== seat) return null;
    const from = state.pieces[seat][piece];
    if (from === undefined || from >= LUDO_FINISH || (from < 0 && roll !== 6)) return null;
    const events = { takeoff: false, jumped: false, flew: false, bounced: false, captured: [], finished: false, win: false, extra: false, to: 0 };
    let to;
    if (from < 0) {
        to = 0;
        events.takeoff = true;
    } else {
        to = from + roll;
        if (to > LUDO_FINISH) {
            to = 2 * LUDO_FINISH - to;
            events.bounced = true;
        } else {
            const settled = settleProgress(to);
            to = settled.progress;
            events.jumped = settled.jumped;
            events.flew = settled.flew;
        }
    }
    events.to = to;
    const pieces = state.pieces.map((list) => list.slice());
    pieces[seat][piece] = to;
    if (to <= 50) {
        const abs = ludoAbs(state.seats[seat], to);
        pieces.forEach((list, other) => {
            if (other === seat) return;
            const here = [];
            list.forEach((progress, index) => {
                if (progress >= 0 && progress <= 50 && ludoAbs(state.seats[other], progress) === abs) here.push(index);
            });
            // 同格叠了两枚以上的互相护着，不会被打。
            if (here.length === 1) {
                pieces[other][here[0]] = -1;
                events.captured.push({ seat: other, piece: here[0] });
            }
        });
    }
    events.finished = to === LUDO_FINISH;
    const win = pieces[seat].every((progress) => progress === LUDO_FINISH);
    events.win = win;
    events.extra = roll === 6 && !win;
    const next = { ...state, pieces, dice: roll, winner: win ? seat : -1 };
    if (!events.extra && !win) next.turn = nextSeat(state);
    return { state: next, events };
}

// 无子可走：交给下一家。
export function passTurn(state) {
    return { ...state, turn: nextSeat(state), dice: 0 };
}

// 电脑：能打人先打人 > 能起飞先起飞 > 能进终点 > 走最前面的。
export function chooseAiMove(state, seat, roll) {
    const moves = legalMoves(state, seat, roll);
    if (!moves.length) return -1;
    let best = moves[0];
    let bestScore = -Infinity;
    for (const index of moves) {
        const result = applyMove(state, seat, index, roll);
        if (!result) continue;
        const ev = result.events;
        const progress = state.pieces[seat][index];
        let score = progress + roll;
        if (ev.finished) score += 1000;
        if (ev.takeoff) score += 2000;
        if (ev.captured.length) score += 4000 + ev.captured.length * 100;
        if (score > bestScore) {
            bestScore = score;
            best = index;
        }
    }
    return best;
}

// 同格叠放时的错开量（格子单位）。
export function stackOffsets(count) {
    if (count <= 1) return [{ x: 0, y: 0 }];
    const radius = count === 2 ? 0.2 : 0.24;
    return Array.from({ length: count }, (_, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count + (count === 2 ? Math.PI / 4 : 0);
        return { x: Number((Math.cos(angle) * radius).toFixed(3)), y: Number((Math.sin(angle) * radius).toFixed(3)) };
    });
}

// 可选的棋子形象：本卡角色；没有就用名字；再不够用红黄蓝绿补足四个。
export function ludoCandidates(model) {
    const out = [];
    const seen = new Set();
    const add = (name, person) => {
        const key = String(name || '').trim();
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push({ name: key, person: person || null });
    };
    for (const item of Array.isArray(model && model.cast) ? model.cast : []) add(item && item.name, item);
    for (const name of Array.isArray(model && model.names) ? model.names : []) add(name, null);
    for (const name of LUDO_COLOR_NAMES) {
        if (out.length >= LUDO_PIECES) break;
        add(name, null);
    }
    return out;
}

// 校正每个槽位的选择：'' 只有第 0 槽（你）可用，其余必须是未被占用的候选。
export function normalizeLudoPicks(candidates, saved) {
    const names = candidates.map((item) => item.name);
    const used = new Set();
    const picks = [];
    for (let slot = 0; slot < LUDO_PIECES; slot += 1) {
        const want = saved && saved[slot] != null ? String(saved[slot]) : null;
        if (slot === 0 && (want === '' || want === null)) {
            picks.push('');
            continue;
        }
        if (want && names.includes(want) && !used.has(want)) {
            used.add(want);
            picks.push(want);
            continue;
        }
        const free = names.find((name) => !used.has(name)) || '';
        if (free) used.add(free);
        picks.push(free);
    }
    return picks;
}

export const LUDO_STYLE = `
.igs-ld{--ld-0:#e0675c;--ld-1:#f0b93a;--ld-2:#4d8fd6;--ld-3:#4fae6e;--ld-s0:#f6d3cf;--ld-s1:#fbe6b5;--ld-s2:#cfe1f5;--ld-s3:#cfeedb;--ld-plate:#faf7f0;--ld-ink:#3b3631;display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;color:var(--igs-bar-ink,#e8e5df);}
.igs-ld .is-c0{--ld:var(--ld-0);--ld-soft:var(--ld-s0);}
.igs-ld .is-c1{--ld:var(--ld-1);--ld-soft:var(--ld-s1);}
.igs-ld .is-c2{--ld:var(--ld-2);--ld-soft:var(--ld-s2);}
.igs-ld .is-c3{--ld:var(--ld-3);--ld-soft:var(--ld-s3);}
.igs-ld-face{position:relative;display:flex;align-items:center;justify-content:center;flex:none;overflow:hidden;border-radius:50%;background:var(--ld-soft,var(--ld-plate));color:var(--ld-ink);font-size:12px;line-height:1;}
.igs-ld-crop{position:absolute;max-width:none;width:var(--iw,100%);left:var(--il,0);top:var(--it,0);opacity:0;pointer-events:none;}
.igs-ld-crop.is-ready.is-on{opacity:1;}
.igs-ld-setup{display:flex;flex-direction:column;align-items:center;gap:12px;width:100%;}
.igs-ld-count,.igs-ld-picks,.igs-ld-ctl{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;}
.igs-ld-count .igs-ws-chip,.igs-ld-ctl .igs-ws-chip{height:32px;padding:0 16px;font-size:13px;}
.igs-ld-count .igs-ws-chip.is-on{box-shadow:inset 0 0 0 1px var(--igs-bar-ink,#e8e5df);}
.igs-ld-ctl [hidden]{display:none;}
.igs-ld-slots{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;}
.igs-ld-slot{display:flex;align-items:center;gap:8px;min-width:0;padding:6px 10px 6px 6px;border:0;border-radius:999px;background:color-mix(in srgb,var(--igs-bar-ink,#e8e5df) 6%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--igs-bar-ink,#e8e5df) 14%,transparent);color:inherit;font:inherit;font-size:13px;cursor:pointer;text-align:left;}
.igs-ld-slot.is-on{box-shadow:inset 0 0 0 1.5px var(--ld);}
.igs-ld-slot .igs-ld-face{width:32px;height:32px;box-shadow:0 0 0 2px var(--ld);}
.igs-ld-slot-name{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.igs-ld-slot-tag{margin-left:auto;font-size:11px;opacity:.55;white-space:nowrap;}
.igs-ld-pick{display:flex;align-items:center;gap:6px;padding:3px 10px 3px 3px;border:0;border-radius:999px;background:color-mix(in srgb,var(--igs-bar-ink,#e8e5df) 6%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--igs-bar-ink,#e8e5df) 14%,transparent);color:inherit;font:inherit;font-size:12px;cursor:pointer;}
.igs-ld-pick .igs-ld-face{width:26px;height:26px;}
.igs-ld-pick.is-on{box-shadow:inset 0 0 0 1.5px var(--igs-bar-ink,#e8e5df);}
.igs-ld-pick:disabled{opacity:.35;cursor:default;}
.igs-ld-seats{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;}
.igs-ld-seat{display:flex;align-items:center;gap:6px;padding:3px 10px 3px 3px;border-radius:999px;background:color-mix(in srgb,var(--igs-bar-ink,#e8e5df) 6%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--igs-bar-ink,#e8e5df) 12%,transparent);font-size:12px;opacity:.55;}
.igs-ld-seat.is-turn{opacity:1;box-shadow:inset 0 0 0 1.5px var(--ld);}
.igs-ld-seat .igs-ld-face{width:26px;height:26px;box-shadow:0 0 0 2px var(--ld);}
.igs-ld-seat-n{font-size:11px;opacity:.6;}
.igs-ld-field{position:relative;container-type:inline-size;width:min(100%,400px);aspect-ratio:1/1;border-radius:10px;background:var(--ld-plate);color:var(--ld-ink);}
.igs-ld-cell{position:absolute;left:calc(var(--x) * 7.142857%);top:calc(var(--y) * 7.142857%);width:7.142857%;height:7.142857%;box-sizing:border-box;border-radius:24%;background:var(--ld-soft);box-shadow:inset 0 0 0 1.5px var(--ld-plate);}
.igs-ld-cell.is-start,.igs-ld-cell.is-lane,.igs-ld-cell.is-goal{background:var(--ld);}
.igs-ld-cell.is-lane{background:var(--ld);}
.igs-ld-cell.is-goal{background:var(--ld);}
.igs-ld-hangar{position:absolute;left:calc(var(--x) * 7.142857%);top:calc(var(--y) * 7.142857%);width:35.714285%;height:35.714285%;box-sizing:border-box;border-radius:12%;background:var(--ld-soft);}
.igs-ld-slotmark{position:absolute;left:calc(var(--x) * 7.142857%);top:calc(var(--y) * 7.142857%);width:6.4%;aspect-ratio:1/1;transform:translate(-50%,-50%);box-sizing:border-box;border-radius:50%;background:var(--ld-plate);}
.igs-ld-flightmark{position:absolute;left:calc(var(--x) * 7.142857%);top:calc(var(--y) * 7.142857%);width:5.2%;aspect-ratio:1/1;transform:translate(-50%,-50%);box-sizing:border-box;border-radius:50%;border:1px dashed var(--ld);pointer-events:none;}
.igs-ld-piece{position:absolute;z-index:3;left:calc(var(--x) * 7.142857%);top:calc(var(--y) * 7.142857%);width:6.4%;aspect-ratio:1/1;transform:translate(-50%,-50%);box-sizing:border-box;padding:0;border:0;border-radius:50%;background:var(--ld-plate);box-shadow:0 0 0 2px var(--ld);color:var(--ld-ink);cursor:default;transition:left .32s ease,top .32s ease;}
.igs-ld-piece .igs-ld-face{position:absolute;inset:0;font-size:3.2cqi;}
.igs-ld-piece.is-under{visibility:hidden;pointer-events:none;}
.igs-ld-piece.is-can{z-index:4;cursor:pointer;outline:2px solid var(--ld-ink);outline-offset:2px;animation:igs-ld-pulse 1s ease-in-out infinite alternate;}
.igs-ld-piece[data-n]::after{content:attr(data-n);position:absolute;right:-12%;top:-12%;min-width:1.5em;box-sizing:border-box;padding:0 .3em;border-radius:999px;background:var(--ld);color:var(--ld-plate);font-size:2.6cqi;line-height:1.5;text-align:center;}
@keyframes igs-ld-pulse{from{outline-offset:2px;}to{outline-offset:3.5px;}}
.igs-ld-bar{display:flex;align-items:center;justify-content:center;gap:12px;}
.igs-ld-die{display:grid;grid-template:repeat(3,1fr) / repeat(3,1fr);gap:2px;box-sizing:border-box;width:46px;height:46px;padding:8px;border:0;border-radius:10px;background:var(--ld-plate);cursor:pointer;}
.igs-ld-die:disabled{cursor:default;}
.igs-ld-die i{border-radius:50%;}
.igs-ld-die i.is-on{background:var(--ld,var(--ld-ink));}
.igs-ld-die.is-ready{box-shadow:0 0 0 2px var(--ld,var(--ld-ink));}
.igs-ld-hint{font-size:12px;opacity:.65;}
@media (max-width:480px){
.igs-ld-field{width:100%;}
.igs-ld-slots{grid-template-columns:minmax(0,1fr);}
}
@media (prefers-reduced-motion: reduce){
.igs-ld-piece{transition:none;}
.igs-ld-piece.is-can{animation:none;}
}
`;

const PIPS = Object.freeze({ 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] });

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function setVars(node, vars) {
    for (const [key, value] of Object.entries(vars)) node.style.setProperty(key, String(value));
}

function faceFor(person, mood) {
    const faces = person && person.faces;
    const face = faces && (faces[mood] || faces['平和']);
    return face && face.url ? face : null;
}

export function startLudo(ctx) {
    if (!ctx || !ctx.doc || !ctx.board) return null;
    const { doc, board } = ctx;
    const view = doc.defaultView || globalThis;
    const timers = ctx.timers || globalThis;
    const random = typeof ctx.random === 'function' ? ctx.random : Math.random;
    const loadImage = typeof ctx.loadImage === 'function' ? ctx.loadImage : (url) => String(url || '');
    const candidates = ludoCandidates(ctx.model);
    let reduceMotion = false;
    try { reduceMotion = Boolean(view.matchMedia && view.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (error) { reduceMotion = false; }

    board.innerHTML = '';
    if (board.classList) board.classList.remove('is-wide');
    const head = el(doc, 'div', 'igs-ws-board-head');
    head.appendChild(el(doc, 'span', '', '飞行棋'));
    const close = el(doc, 'button', 'igs-ws-close', '✕');
    close.type = 'button';
    head.appendChild(close);
    board.appendChild(head);
    const status = el(doc, 'div', 'igs-ws-status');
    board.appendChild(status);
    const root = el(doc, 'div', 'igs-ld');
    board.appendChild(root);

    let disposed = false;
    let gen = 0;
    let count = 4;
    let picks = [];
    let phase = 'setup'; // setup | roll | rolling | pick | ai | moving | over
    let state = null;
    let players = [];
    let faces = []; // 每座位的头像（座位条 + 棋子），按表情换图
    let pieceNodes = [];
    let seatNodes = [];
    let die = null;
    let dieNodes = [];
    let ctlAgain = null;
    let ctlReset = null;
    let moveOptions = [];
    let moodToken = [];
    const urlCache = new Map();

    const alive = () => !disposed && board.hidden !== true && board.isConnected !== false && board.contains(root);
    const later = (fn, ms) => {
        const g = gen;
        timers.setTimeout(() => {
            if (g !== gen || !alive()) return;
            fn();
        }, ms);
    };
    const pace = () => 500 + Math.floor(random() * 200);
    const setStatus = (text) => { status.textContent = text; };
    const note = (kind) => {
        try { ctx.setNote(waitStageGameLine(kind, random)); } catch (error) { /* 台词失败不影响这一局 */ }
        try { if (typeof ctx.onVoice === 'function') ctx.onVoice(null); } catch (error) { /* 语气音失败同上 */ }
    };

    function resolveUrl(url) {
        if (!urlCache.has(url)) urlCache.set(url, Promise.resolve().then(() => loadImage(url)));
        return urlCache.get(url);
    }

    // 一枚圆形头像：没有立绘时显示名字首字；有立绘按头部裁切，setMood 换表情。
    function makeFace(name, person) {
        const frame = el(doc, 'span', 'igs-ld-face');
        frame.appendChild(el(doc, 'span', 'igs-ld-initial', name === '你' ? '你' : String(name || '?').slice(0, 1)));
        const imgs = {};
        let current = '';
        const show = (mood) => {
            for (const [key, img] of Object.entries(imgs)) img.classList.toggle('is-on', key === mood);
        };
        const setMood = (mood) => {
            if (current === mood) return;
            current = mood;
            const face = faceFor(person, mood);
            if (!face) return;
            const key = face.url;
            if (imgs[key]) {
                if (imgs[key].classList.contains('is-ready')) show(key);
                return;
            }
            const img = el(doc, 'img', 'igs-ld-crop');
            img.alt = '';
            img.decoding = 'async';
            imgs[key] = img;
            let placed = false;
            const place = () => {
                const width = img.naturalWidth;
                const height = img.naturalHeight;
                if (placed || !(width > 0 && height > 0)) return;
                placed = true;
                const box = avatarCrop(width, height, face.head, 1, 0.5, 0.45);
                setVars(img, { '--iw': `${(width / box.w) * 100}%`, '--il': `${(-box.x / box.w) * 100}%`, '--it': `${(-box.y / box.h) * 100}%` });
                const done = () => {
                    img.classList.add('is-ready');
                    if (faceFor(person, current) && faceFor(person, current).url === key) show(key);
                };
                if (typeof img.decode === 'function') img.decode().then(done, done); else done();
            };
            img.addEventListener('load', place);
            img.addEventListener('error', () => img.remove());
            frame.appendChild(img);
            Promise.resolve(resolveUrl(face.url)).then((src) => {
                if (src) img.src = src; else img.remove();
                if (img.complete) place();
            }, () => img.remove());
        };
        setMood('平和');
        return { node: frame, setMood };
    }

    function setMood(seat, mood, hold = 0) {
        for (const item of faces[seat] || []) item.setMood(mood);
        moodToken[seat] = (moodToken[seat] || 0) + 1;
        const token = moodToken[seat];
        if (mood !== '平和' && hold > 0) {
            later(() => {
                if (moodToken[seat] === token && phase !== 'over') for (const item of faces[seat] || []) item.setMood('平和');
            }, hold);
        }
    }

    // ---------- 选人 ----------
    function readSaved() {
        try {
            const raw = view.localStorage && view.localStorage.getItem(SAVE_KEY);
            const data = raw ? JSON.parse(raw) : null;
            return data && typeof data === 'object' ? data : null;
        } catch (error) {
            return null;
        }
    }

    function writeSaved() {
        try { if (view.localStorage) view.localStorage.setItem(SAVE_KEY, JSON.stringify({ count, picks })); } catch (error) { /* 存不下就算了 */ }
    }

    function personOf(name) {
        const found = candidates.find((item) => item.name === name);
        return found ? found.person : null;
    }

    function openSetup() {
        gen += 1;
        phase = 'setup';
        state = null;
        root.innerHTML = '';
        const saved = readSaved();
        if (saved && [2, 3, 4].includes(Number(saved.count))) count = Number(saved.count);
        picks = normalizeLudoPicks(candidates, saved && saved.picks);
        let active = 0;
        setStatus('选择棋子形象与对手数量。');
        const wrap = el(doc, 'div', 'igs-ld-setup');
        root.appendChild(wrap);

        const render = () => {
            wrap.innerHTML = '';
            faces = [];
            const countRow = el(doc, 'div', 'igs-ld-count');
            for (const n of [2, 3, 4]) {
                const chip = el(doc, 'button', `igs-ws-chip${n === count ? ' is-on' : ''}`, `${n} 家`);
                chip.type = 'button';
                chip.addEventListener('click', () => {
                    count = n;
                    if (active >= count) active = 0;
                    render();
                });
                countRow.appendChild(chip);
            }
            wrap.appendChild(countRow);

            const colors = ludoSeatColors(count);
            const slots = el(doc, 'div', 'igs-ld-slots');
            colors.forEach((color, slot) => {
                const name = picks[slot];
                const button = el(doc, 'button', `igs-ld-slot is-c${color}${slot === active ? ' is-on' : ''}`);
                button.type = 'button';
                button.appendChild(makeFace(name || '你', personOf(name)).node);
                button.appendChild(el(doc, 'span', 'igs-ld-slot-name', name || '你'));
                button.appendChild(el(doc, 'span', 'igs-ld-slot-tag', slot === 0 ? '玩家' : '电脑'));
                button.addEventListener('click', () => {
                    active = slot;
                    render();
                });
                slots.appendChild(button);
            });
            wrap.appendChild(slots);

            const strip = el(doc, 'div', 'igs-ld-picks');
            const taken = new Set(picks.slice(0, count).filter((name, slot) => slot !== active && name));
            const options = active === 0 ? [{ name: '', label: '你', person: null }] : [];
            for (const item of candidates) options.push({ name: item.name, label: item.name, person: item.person });
            for (const option of options) {
                const button = el(doc, 'button', `igs-ld-pick${picks[active] === option.name ? ' is-on' : ''}`);
                button.type = 'button';
                button.disabled = Boolean(option.name) && taken.has(option.name);
                button.appendChild(makeFace(option.label, option.person).node);
                button.appendChild(el(doc, 'span', '', option.label));
                button.addEventListener('click', () => {
                    picks[active] = option.name;
                    render();
                });
                strip.appendChild(button);
            }
            wrap.appendChild(strip);

            const ctl = el(doc, 'div', 'igs-ld-ctl');
            const start = el(doc, 'button', 'igs-ws-chip', '开始');
            start.type = 'button';
            start.addEventListener('click', () => {
                writeSaved();
                openGame();
            });
            ctl.appendChild(start);
            wrap.appendChild(ctl);
        };
        render();
        try { ctx.setNote(waitStageGameLine('start', random)); } catch (error) { /* 同上 */ }
    }

    // ---------- 对局 ----------
    function seatName(seat) {
        return players[seat] ? players[seat].name : '';
    }

    function buildField() {
        const field = el(doc, 'div', 'igs-ld-field');
        const cells = field;
        const seatColors = state.seats;
        for (let abs = 0; abs < LUDO_RING; abs += 1) {
            const cell = ringCell(abs);
            const color = ringColor(abs);
            const node = el(doc, 'span', `igs-ld-cell is-c${color}`);
            setVars(node, { '--x': cell.x, '--y': cell.y });
            // 起飞点
            if (seatColors.includes(color) && abs === ludoStart(color) % LUDO_RING) node.classList.add('is-start');
            cells.appendChild(node);
        }
        for (const color of seatColors) {
            // 终点直道：5 格 + 终点
            for (let k = 0; k < 6; k += 1) {
                const pt = rotatePoint({ x: 6.5, y: 1.5 + k }, color);
                const node = el(doc, 'span', `igs-ld-cell is-c${color} ${k === 5 ? 'is-goal' : 'is-lane'}`);
                setVars(node, { '--x': pt.x - 0.5, '--y': pt.y - 0.5 });
                cells.appendChild(node);
            }
            const center = rotatePoint(HANGAR_CENTER, color);
            const hangar = el(doc, 'span', `igs-ld-hangar is-c${color}`);
            setVars(hangar, { '--x': center.x - 2.5, '--y': center.y - 2.5 });
            cells.appendChild(hangar);
            for (let slot = 0; slot < LUDO_PIECES; slot += 1) {
                const pt = ludoPoint(color, -1, slot);
                const mark = el(doc, 'span', `igs-ld-slotmark is-c${color}`);
                setVars(mark, { '--x': pt.x, '--y': pt.y });
                cells.appendChild(mark);
            }
            // 捷径起点与终点各一个细虚线小圈
            for (const progress of [LUDO_SHORT_FROM, LUDO_SHORT_TO]) {
                const pt = ludoPoint(color, progress);
                const mark = el(doc, 'span', `igs-ld-flightmark is-c${color}`);
                setVars(mark, { '--x': pt.x, '--y': pt.y });
                cells.appendChild(mark);
            }
        }
        return field;
    }

    function layout() {
        const groups = new Map();
        state.seats.forEach((color, seat) => {
            state.pieces[seat].forEach((progress, index) => {
                const pt = ludoPoint(color, progress, index);
                const key = progress < 0 ? `h${seat}.${index}` : `${pt.x},${pt.y}`;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push({ seat, index, pt });
            });
        });
        for (const list of groups.values()) {
            // 同格叠放只画一枚（优先当前行棋方的），右上角标数量。
            const top = list.find((item) => item.seat === state.turn) || list[0];
            for (const item of list) {
                const node = pieceNodes[item.seat][item.index];
                setVars(node, { '--x': item.pt.x, '--y': item.pt.y });
                node.classList.toggle('is-under', item !== top);
                if (item === top && list.length > 1) node.setAttribute('data-n', String(list.length));
                else node.removeAttribute('data-n');
            }
        }
        seatNodes.forEach((entry, seat) => {
            entry.node.classList.toggle('is-turn', state.winner < 0 && state.turn === seat);
            entry.count.textContent = `${state.pieces[seat].filter((p) => p === LUDO_FINISH).length}/${LUDO_PIECES}`;
        });
    }

    function markMovable(list) {
        moveOptions = list;
        const progresses = new Set(list.map((index) => state.pieces[state.turn][index]));
        pieceNodes.forEach((nodes, seat) => {
            nodes.forEach((node, index) => {
                const can = phase === 'pick' && !node.classList.contains('is-under') && seat === state.turn && progresses.has(state.pieces[seat][index]);
                node.classList.toggle('is-can', can);
                node.disabled = !can;
            });
        });
    }

    function showDie(value) {
        dieNodes.forEach((pip, i) => pip.classList.toggle('is-on', (PIPS[value] || []).includes(i)));
    }

    function setDie(enabled) {
        die.disabled = !enabled;
        die.classList.toggle('is-ready', enabled);
        const color = state.seats[state.turn];
        die.className = die.className.replace(/\bis-c\d\b/g, '').trim() + ` is-c${color}`;
    }

    function openGame() {
        gen += 1;
        const colors = ludoSeatColors(count);
        state = createLudoState(colors);
        players = colors.map((color, slot) => ({ color, name: picks[slot] || '你', human: slot === 0, person: personOf(picks[slot]) }));
        faces = players.map(() => []);
        moodToken = players.map(() => 0);
        root.innerHTML = '';

        const seatsRow = el(doc, 'div', 'igs-ld-seats');
        seatNodes = players.map((player, seat) => {
            const node = el(doc, 'span', `igs-ld-seat is-c${player.color}`);
            const face = makeFace(player.name, player.person);
            faces[seat].push(face);
            node.appendChild(face.node);
            node.appendChild(el(doc, 'span', '', player.name));
            const counter = el(doc, 'span', 'igs-ld-seat-n', `0/${LUDO_PIECES}`);
            node.appendChild(counter);
            seatsRow.appendChild(node);
            return { node, count: counter };
        });
        root.appendChild(seatsRow);

        const field = buildField();
        pieceNodes = players.map((player, seat) => Array.from({ length: LUDO_PIECES }, (_, index) => {
            const node = el(doc, 'button', `igs-ld-piece is-c${player.color}`);
            node.type = 'button';
            node.disabled = true;
            node.setAttribute('aria-label', `${player.name} ${index + 1}`);
            const face = makeFace(player.name, player.person);
            faces[seat].push(face);
            node.appendChild(face.node);
            node.addEventListener('click', () => onPiece(seat, index));
            field.appendChild(node);
            return node;
        }));
        root.appendChild(field);

        const bar = el(doc, 'div', 'igs-ld-bar');
        die = el(doc, 'button', 'igs-ld-die');
        die.type = 'button';
        die.setAttribute('aria-label', '掷骰');
        dieNodes = Array.from({ length: 9 }, () => die.appendChild(el(doc, 'i')));
        die.addEventListener('click', onDie);
        bar.appendChild(die);
        root.appendChild(bar);

        const ctl = el(doc, 'div', 'igs-ld-ctl');
        ctlAgain = el(doc, 'button', 'igs-ws-chip', '再来一局');
        ctlReset = el(doc, 'button', 'igs-ws-chip', '重新选人');
        for (const button of [ctlAgain, ctlReset]) {
            button.type = 'button';
            button.hidden = true;
            ctl.appendChild(button);
        }
        ctlAgain.addEventListener('click', openGame);
        ctlReset.addEventListener('click', openSetup);
        root.appendChild(ctl);

        showDie(0);
        layout();
        beginTurn();
    }

    function beginTurn() {
        const seat = state.turn;
        markMovable([]);
        if (players[seat].human) {
            phase = 'roll';
            setDie(true);
            setStatus('轮到你，点击骰子。');
        } else {
            phase = 'ai';
            setDie(false);
            setStatus(`轮到${players[seat].name}。`);
            later(() => roll(), pace());
        }
    }

    function onDie() {
        if (phase === 'roll') roll();
    }

    function roll() {
        const seat = state.turn;
        phase = 'rolling';
        setDie(false);
        const value = ludoRoll(random);
        let n = 0;
        const tick = () => {
            if (n < 6 && !reduceMotion) {
                n += 1;
                showDie(ludoRoll(random));
                later(tick, 70);
                return;
            }
            showDie(value);
            afterRoll(seat, value);
        };
        tick();
    }

    function afterRoll(seat, value) {
        state = { ...state, dice: value };
        const name = seatName(seat);
        const moves = legalMoves(state, seat, value);
        if (!moves.length) {
            setStatus(`${name}掷出 ${value}，无子可走。`);
            later(() => {
                state = passTurn(state);
                layout();
                beginTurn();
            }, pace() + 200);
            return;
        }
        if (players[seat].human && moves.length > 1) {
            phase = 'pick';
            setStatus(`你掷出 ${value}，选一枚棋子。`);
            markMovable(moves);
            return;
        }
        setStatus(`${name}掷出 ${value}。`);
        const choice = players[seat].human ? moves[0] : chooseAiMove(state, seat, value);
        later(() => doMove(seat, choice, value), pace());
    }

    function onPiece(seat, index) {
        if (phase !== 'pick' || seat !== state.turn) return;
        const progress = state.pieces[seat][index];
        const choice = moveOptions.find((candidate) => state.pieces[seat][candidate] === progress);
        if (choice === undefined) return;
        markMovable([]);
        doMove(seat, choice, state.dice);
    }

    function doMove(seat, piece, value) {
        const result = applyMove(state, seat, piece, value);
        if (!result) {
            beginTurn();
            return;
        }
        phase = 'moving';
        markMovable([]);
        state = result.state;
        layout();
        const ev = result.events;
        const name = seatName(seat);
        const bits = [];
        if (ev.takeoff) bits.push('起飞');
        if (ev.jumped && !ev.flew) bits.push('跳了四格');
        if (ev.flew) bits.push(ev.jumped ? '跳格后沿捷径飞出' : '沿捷径飞出');
        if (ev.bounced) bits.push('多出的步数退回');
        for (const hit of ev.captured) bits.push(`打回了${seatName(hit.seat)}的棋子`);
        if (ev.finished) bits.push('一枚抵达终点');
        if (ev.extra) bits.push('再掷一次');
        setStatus(`${name}掷出 ${value}${bits.length ? `，${bits.join('，')}` : ''}。`);

        if (ev.takeoff || ev.finished) setMood(seat, '喜悦', 1400);
        for (const hit of ev.captured) {
            setMood(seat, '喜悦', 1600);
            setMood(hit.seat, random() < 0.5 ? '悲伤' : '愤怒', 1800);
        }
        const humanSeat = players.findIndex((p) => p.human);
        if (ev.captured.length) {
            if (seat === humanSeat) note('right');
            else if (ev.captured.some((hit) => hit.seat === humanSeat)) note('wrong');
        }
        if (ev.win) {
            finish(seat);
            return;
        }
        later(beginTurn, pace() + 100);
    }

    function finish(winner) {
        phase = 'over';
        markMovable([]);
        setDie(false);
        die.classList.remove('is-ready');
        players.forEach((_, seat) => setMood(seat, seat === winner ? '喜悦' : '悲伤'));
        const human = players[winner].human;
        setStatus(human ? '你的四枚棋子全部到达终点，你赢了。' : `${players[winner].name}率先到达终点。`);
        note(human ? 'win' : 'lose');
        try { ctx.markDone(); } catch (error) { /* 同上 */ }
        ctlAgain.hidden = false;
        ctlReset.hidden = false;
    }

    function dispose() {
        disposed = true;
        gen += 1;
    }

    close.addEventListener('click', () => { dispose(); ctx.requestClose(); });
    openSetup();
    return { dispose, get state() { return state; } };
}
