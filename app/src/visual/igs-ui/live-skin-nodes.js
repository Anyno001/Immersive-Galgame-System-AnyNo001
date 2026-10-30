import { isStagePaused } from './stage-pause.js';
import { stableHash } from './danmaku-pools.js';
import {
    auctionRaise, boardAdd, boardTop, camNumber, clockText, formatSkinAmount, onionAddress, seedBoard, tipLines, tipValue, timecode,
} from './live-skin.js';

// 暗网直播间皮肤的额外节点与计时：地址条 / OSD / 拍品栏、转账 / 打赏 / 加价条、榜单、拍卖倒计时与监控时间码。
// 节点只建一次，之后只在文字变了才写；计时走直播手机自己的 schedule / clear（记进 state.timers），
// 没有常驻 setInterval：舞台暂停、页面隐藏、被封、收起时这条链自然断开，由主节拍恢复时重新拉起。
const AUCTION_ROUND = 45;
const AUCTION_SNIPE = 10;
const AUCTION_EXTEND = 15;
const NOTE_MS = 4200;
const TITLES = Object.freeze({
    terminal: { anchor: '主播', list: '聊天日志', board: '贡献榜', note: '打赏记录', follow: '订阅', sub: '已播' },
    cctv: { anchor: '主播', list: '观众留言', board: '贡献榜', note: '', follow: '订阅', sub: '已录' },
    auction: { anchor: '', list: '席间私语', board: '出价排行', note: '', follow: '入席', sub: '' },
});

function el(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function later(state, fn, ms) {
    const timer = state.schedule(() => {
        state.timers.delete(timer);
        fn();
    }, ms);
    state.timers.add(timer);
    return timer;
}

function cancel(state, timer) {
    if (!timer) return;
    state.clear(timer);
    state.timers.delete(timer);
}

function alive(state) {
    return state.visible && !state.banned && state.doc.hidden !== true && state.els.root.isConnected && !isStagePaused(state.els.root);
}

function setText(ui, key, node, text) {
    if (!node || ui.cache[key] === text) return;
    ui.cache[key] = text;
    node.textContent = text;
}

function buildBoard(doc, ui, title) {
    const board = el(doc, 'div', 'igs-ls-board');
    board.setAttribute('data-ls-title', title);
    ui.rows = [0, 1, 2].map((i) => {
        const row = el(doc, 'div', 'igs-ls-row');
        row.append(el(doc, 'i', '', String(i + 1)), el(doc, 'b'), el(doc, 'span', 'v'), el(doc, 'span', 'vs'));
        board.appendChild(row);
        return row;
    });
    return board;
}

function renderBoard(ui) {
    const top = boardTop(ui.board);
    const sig = top.map((row) => `${row.code}:${row.value}`).join('|');
    if (ui.cache.board === sig) return;
    ui.cache.board = sig;
    ui.rows.forEach((row, i) => {
        const item = top[i];
        if (!item) return;
        row.children[1].textContent = item.code;
        row.children[2].textContent = formatSkinAmount(ui.skin, item.value);
        row.children[3].textContent = formatSkinAmount(ui.skin, item.value, true);
    });
}

function renderLot(ui) {
    const a = ui.auction;
    if (!a) return;
    setText(ui, 'lotNo', ui.nodes.lotNo, `拍品№${a.lot}`);
    setText(ui, 'bid', ui.nodes.bid, formatSkinAmount('auction', a.bid));
    setText(ui, 'cd', ui.nodes.cd, a.remain <= 0 ? '落槌' : clockText(a.remain * 1000));
    const pct = `${Math.max(0, Math.round((a.remain * 100) / AUCTION_ROUND))}%`;
    if (ui.cache.pg !== pct) {
        ui.cache.pg = pct;
        ui.nodes.lot.style.setProperty('--ls-pg', pct);
    }
}

function newRound(ui) {
    const a = ui.auction;
    ui.rounds += 1;
    a.lot = (a.lot % 9) + 1;
    ui.board = seedBoard('auction', `${ui.seed}|${a.lot}|${ui.rounds}`);
    a.bid = ui.board[0].value;
    a.remain = AUCTION_ROUND;
    renderBoard(ui);
}

function buildTerminal(doc, state, ui) {
    const bar = el(doc, 'div', 'igs-ls-bar');
    const nodes = el(doc, 'span', 'igs-ls-nodes');
    nodes.append('连接节点数', el(doc, 'b', '', String(3 + (stableHash(ui.seed) % 9))));
    const online = el(doc, 'span', 'igs-ls-online');
    ui.nodes.online = el(doc, 'b', '', '0');
    online.append('在线', ui.nodes.online);
    bar.append(el(doc, 'span', 'igs-ls-chip', '加密'), el(doc, 'span', 'igs-ls-addr', onionAddress(ui.seed)), nodes, online);
    return [bar];
}

function buildCctv(doc, state, ui) {
    const out = ['a', 'b', 'c', 'd'].map((k) => el(doc, 'i', `igs-ls-cr igs-ls-cr-${k}`));
    const l1 = el(doc, 'div', 'igs-ls-osd igs-ls-l1');
    l1.append(el(doc, 'span', 'igs-ls-rd'), `REC CAM-${camNumber(ui.seed)}`);
    ui.nodes.tm = el(doc, 'div', 'igs-ls-osd igs-ls-tm', '00:00:00');
    const view = el(doc, 'div', 'igs-ls-view');
    ui.nodes.online = el(doc, 'b', '', '0');
    view.append('在线', ui.nodes.online);
    out.push(l1, el(doc, 'div', 'igs-ls-osd igs-ls-l2', state.title || ''), ui.nodes.tm, view);
    return out;
}

function buildAuction(doc, state, ui) {
    const lot = el(doc, 'div', 'igs-ls-lot');
    const top = el(doc, 'div', 'top');
    ui.nodes.lotNo = el(doc, 'span', 'a');
    top.append(ui.nodes.lotNo, el(doc, 'span', 'ti', state.title || ''));
    const bid = el(doc, 'div', 'cu bid');
    ui.nodes.bid = el(doc, 'b');
    const unit = el(doc, 'small', '', '筹');
    const bidValue = el(doc, 'span', 'val');
    bidValue.append(ui.nodes.bid, unit);
    bid.append(el(doc, 'span', '', '当前出价'), bidValue);
    const cd = el(doc, 'div', 'cu cd');
    ui.nodes.cd = el(doc, 'b');
    cd.append(el(doc, 'span', '', '落槌倒计时'), ui.nodes.cd);
    const pg = el(doc, 'div', 'pg');
    pg.appendChild(el(doc, 'i'));
    lot.append(top, bid, cd, pg);
    ui.nodes.lot = lot;
    const seats = el(doc, 'div', 'igs-ls-seats');
    ui.nodes.online = el(doc, 'b', '', '0');
    seats.append('在席', ui.nodes.online);
    const elapsed = Math.max(0, Math.floor((state.now() - state.startedAt) / 1000));
    const round = Math.floor(elapsed / AUCTION_ROUND);
    ui.auction = { lot: 1 + ((stableHash(ui.seed) + round) % 9), bid: 0, remain: AUCTION_ROUND - (elapsed % AUCTION_ROUND) };
    if (round > 0) ui.board = seedBoard('auction', `${ui.seed}|${round}`);
    ui.auction.bid = ui.board[0].value;
    return [lot, seats];
}

// 建皮肤层：调色 / 扫描线层插在画面之后，其余节点插在封禁画面之前。返回 null 表示没有皮肤。
export function attachLiveSkin(state) {
    const skin = state.skin;
    if (!skin || !TITLES[skin]) return null;
    const { doc, els } = state;
    const t = TITLES[skin];
    const seed = `${state.hostName}|${state.title || ''}`;
    const ui = { skin, seed, nodes: {}, cache: {}, rows: [], timer: null, noteTimer: null, glitchTimer: null, seq: 0, rounds: 0, board: seedBoard(skin, seed), clocked: skin !== 'terminal', auction: null };
    els.root.setAttribute('data-live-skin', skin);
    if (state.skinTone) els.root.setAttribute('data-live-tone', state.skinTone);
    const fx = el(doc, 'div', 'igs-ls-fx');
    fx.append(el(doc, 'i', 'igs-ls-scan'), el(doc, 'i', 'igs-ls-glitch'));
    if (els.cover.parentNode) els.cover.parentNode.after(fx);
    const build = skin === 'terminal' ? buildTerminal : skin === 'cctv' ? buildCctv : buildAuction;
    const nodes = build(doc, state, ui);
    ui.note = el(doc, 'div', 'igs-ls-note');
    ui.note.hidden = true;
    if (t.note) ui.note.setAttribute('data-ls-title', t.note);
    const board = buildBoard(doc, ui, t.board);
    els.ban.before(...nodes, ui.note, board);
    const anchor = els.phone.querySelector('.igs-live-anchor');
    if (anchor && t.anchor) anchor.setAttribute('data-ls-title', t.anchor);
    els.list.setAttribute('data-ls-title', t.list);
    const follow = els.phone.querySelector('.igs-live-follow span:last-child');
    if (follow) follow.textContent = t.follow;
    const meta = els.phone.querySelector('.igs-live-meta');
    if (meta && t.sub) {
        ui.nodes.sub = el(doc, 'div', 'igs-ls-sub');
        meta.appendChild(ui.nodes.sub);
    }
    state.skinUi = ui;
    renderBoard(ui);
    renderLot(ui);
    syncSkinCounts(state);
    advance(state);
    return ui;
}

// 每个主节拍同步一次：在线 / 在席人数跟人气走，已播 / 已录时长。
export function syncSkinCounts(state) {
    const ui = state.skinUi;
    if (!ui) return;
    const people = Math.round(state.popularity / 9);
    setText(ui, 'online', ui.nodes.online, formatSkinAmount('auction', ui.skin === 'auction' ? Math.max(8, Math.round(people / 12)) : people));
    if (ui.nodes.sub) setText(ui, 'sub', ui.nodes.sub, `${TITLES[ui.skin].sub}${clockText(state.now() - state.startedAt)}`);
}

// 每秒一步：监控时间码、拍卖倒计时。
function advance(state) {
    const ui = state.skinUi;
    if (!ui) return;
    if (ui.skin === 'cctv') setText(ui, 'tm', ui.nodes.tm, timecode(state.now() - state.startedAt));
    else if (ui.skin === 'auction') {
        const a = ui.auction;
        if (ui.cache.started) a.remain -= 1;
        ui.cache.started = true;
        if (a.remain < 0) newRound(ui);
        renderLot(ui);
    }
}

function step(state) {
    const ui = state.skinUi;
    if (!ui) return;
    ui.timer = null;
    if (!alive(state)) return;
    advance(state);
    ui.timer = later(state, () => step(state), 1000);
}

// 偶发电波干扰（终端 / 监控）：每隔 8 到 16 秒闪一次约 0.3 秒的横带与轻微抖动，其余时间画面不动；链条与倒计时同一套规矩，静置 / 暂停 / 减少动态效果时不排。
const GLITCH_MIN_MS = 8000;
const GLITCH_SPAN_MS = 8000;
const GLITCH_MS = 300;

function glitch(state) {
    const ui = state.skinUi;
    if (!ui) return;
    ui.glitchTimer = null;
    if (!alive(state) || state.reduced) return;
    const { root } = state.els;
    root.setAttribute('data-ls-glitch', '1');
    later(state, () => root.removeAttribute('data-ls-glitch'), GLITCH_MS);
    ui.glitchTimer = later(state, () => glitch(state), GLITCH_MIN_MS + Math.floor(state.rng() * GLITCH_SPAN_MS));
}

// 主节拍每次运行时调用：计时链断了（暂停、隐藏后恢复）就接上。
export function skinWake(state) {
    const ui = state.skinUi;
    if (!ui) return;
    if (ui.clocked && !(ui.timer && state.timers.has(ui.timer))) ui.timer = later(state, () => step(state), 1000);
    if (ui.skin !== 'auction' && !state.reduced && !(ui.glitchTimer && state.timers.has(ui.glitchTimer))) {
        ui.glitchTimer = later(state, () => glitch(state), GLITCH_MIN_MS + Math.floor(state.rng() * GLITCH_SPAN_MS));
    }
}

function showNote(state, lines) {
    const ui = state.skinUi;
    const { note } = ui;
    while (note.firstChild) note.firstChild.remove();
    lines.forEach((parts, li) => {
        const row = el(state.doc, 'div', ui.skin === 'terminal' && li === 1 ? 'd' : '');
        parts.forEach((part, pi) => row.appendChild(el(state.doc, 'span', ui.skin === 'terminal' && li === 0 && pi === 0 ? 'inv' : '', part)));
        note.appendChild(row);
    });
    note.hidden = false;
    cancel(state, ui.noteTimer);
    ui.noteTimer = later(state, () => {
        ui.noteTimer = null;
        note.hidden = true;
    }, NOTE_MS);
}

// 礼物 / 醒目留言 / 上舰：改写成转账记录 / 打赏条 / 加价条，并计入榜单。msg.user 此时已是观众代号。
export function skinTip(state, msg) {
    const ui = state.skinUi;
    if (!ui) return;
    const code = String(msg.user || '');
    const value = tipValue(msg);
    let raise = 0;
    let lead = false;
    if (ui.skin === 'auction') {
        const a = ui.auction;
        raise = auctionRaise(value);
        a.bid += raise;
        ui.board = boardAdd(ui.board, 'auction', code, a.bid);
        lead = true;
        if (a.remain <= AUCTION_SNIPE) a.remain = AUCTION_EXTEND;
        renderLot(ui);
    } else ui.board = boardAdd(ui.board, ui.skin, code, value);
    ui.seq += 1;
    renderBoard(ui);
    showNote(state, tipLines(ui.skin, { code, value, seq: ui.seq, raise, lead }));
}

const overlayOf = (state) => (typeof state.els.root.closest === 'function' ? state.els.root.closest('#igs-overlay') : null);

// 把皮肤标记挂到阅读器根节点，供前层的控制条、视角切换、全屏字幕按皮肤换样式；手机收起 / 关闭时摘掉。
export function syncSkinHost(state) {
    if (!state.skin) return;
    const overlay = overlayOf(state);
    if (!overlay) return;
    if (state.visible) {
        overlay.setAttribute('data-ls-skin', state.skin);
        if (state.skinTone) overlay.setAttribute('data-ls-tone', state.skinTone);
        else overlay.removeAttribute('data-ls-tone');
    } else {
        overlay.removeAttribute('data-ls-skin');
        overlay.removeAttribute('data-ls-tone');
    }
}

export function disposeLiveSkin(state) {
    if (!state.skin) return;
    const overlay = overlayOf(state);
    if (!overlay) return;
    overlay.removeAttribute('data-ls-skin');
    overlay.removeAttribute('data-ls-tone');
}
