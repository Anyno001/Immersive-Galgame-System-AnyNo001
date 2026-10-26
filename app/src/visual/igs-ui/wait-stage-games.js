// 等待过场里的小游戏。这段不进 Gal 前端主体，只由独立导入脚本登记后才会玩。
import { MAHJONG_STYLE, startMahjong } from './wait-stage-mahjong.js';
import { SCMJ_STYLE } from './wait-stage-scmj.js';
import { SNAKE_STYLE, startSnake } from './wait-stage-snake.js';
import { LUDO_STYLE, startLudo } from './wait-stage-ludo.js';
import { TILES_STYLE, startTiles } from './wait-stage-tiles.js';
import { WAIT_STAGE_GAME_LINES, waitStageGameLine } from './wait-stage-game-lines.js';
export { WAIT_STAGE_GAME_LINES, waitStageGameLine };

export const WAIT_STAGE_GAMES = Object.freeze(['rps', 'mahjong', 'tiles', 'snake', 'ludo', 'whosaid', 'memory', 'mood']);

export const WAIT_STAGE_GAME_LABELS = Object.freeze({
    rps: '猜拳',
    mahjong: '麻将',
    tiles: '消消乐',
    snake: '贪吃蛇',
    ludo: '飞行棋',
    whosaid: '这句是谁说的',
    memory: '翻牌配对',
    mood: '心情猜猜',
});

// 选游戏卡片：一句玩法 + 线描图标（24×24，描边取 currentColor），颜色跟随皮肤。
export const WAIT_STAGE_GAME_CARDS = Object.freeze({
    rps: { sub: '石头剪刀布', icon: '<circle cx="6.5" cy="17.5" r="3"/><circle cx="17.5" cy="17.5" r="3"/><path d="M8.6 15.4 18 4M15.4 15.4 6 4"/>' },
    mahjong: { sub: '立直或成都', icon: '<rect x="5.5" y="3" width="13" height="18" rx="2.5"/><path d="M12 6.5v11M8.8 9.6h6.4v4.2H8.8Z"/>' },
    tiles: { sub: '情绪符号三消', icon: '<rect x="3" y="8" width="10" height="12" rx="2.2"/><rect x="11" y="4" width="10" height="12" rx="2.2"/><path d="M16 13.2c-2.4-1.6-3-3-2.2-3.9.7-.8 1.7-.6 2.2.2.5-.8 1.5-1 2.2-.2.8.9.2 2.3-2.2 3.9Z"/>' },
    snake: { sub: '越吃越长', icon: '<path d="M3.5 18.5c3 0 3-5 6-5s3 5 6 5 3.4-4.4 4.6-7.6"/><circle cx="20.4" cy="8.6" r="2.2"/>' },
    ludo: { sub: '四色飞行棋', icon: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.6" cy="8.6" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="15.4" cy="15.4" r=".9"/>' },
    whosaid: { sub: '台词猜角色', icon: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.5V17h.5A2.5 2.5 0 0 1 4 14.5Z"/><path d="M10 8.6a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.4M12 14v.1"/>' },
    memory: { sub: '五关翻牌', icon: '<rect x="3.5" y="6" width="9" height="13" rx="1.8" transform="rotate(-10 8 12.5)"/><rect x="11.5" y="5" width="9" height="13" rx="1.8" transform="rotate(8 16 11.5)"/>' },
    mood: { sub: '看表情猜心情', icon: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c1.8 2.2 5.2 2.2 7 0M9 9.5v1M15 9.5v1"/>' },
});

function gameCardHtml(id, no) {
    const card = WAIT_STAGE_GAME_CARDS[id];
    const icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${card.icon}</svg>`;
    return `<span class="igs-ws-game-no">${String(no).padStart(2, '0')}</span>`
        + `<span class="igs-ws-game-ico">${icon}</span>`
        + `<span class="igs-ws-game-name">${WAIT_STAGE_GAME_LABELS[id] || id}</span>`
        + `<span class="igs-ws-game-sub">${card.sub}</span>`
        + `<span class="igs-ws-game-mark">${icon}</span>`;
}

// 只有素材够玩时才列出对应的游戏；都不够就只剩猜拳（不需要任何素材）。
export function availableWaitStageGames(art = {}, lines = [], extraNames = []) {
    const pictures = new Set((Array.isArray(art.pictures) ? art.pictures : [])
        .map((item) => String(item && item.url || '').trim())
        .filter(Boolean));
    const sprites = Array.isArray(art.sprites) ? art.sprites.filter((item) => item && item.url) : [];
    const names = new Set();
    for (const line of lines) {
        const who = String((line && line.who) || '').trim();
        if (who) names.add(who);
    }
    for (const name of Array.isArray(extraNames) ? extraNames : []) {
        if (String(name || '').trim()) names.add(String(name).trim());
    }
    const moods = new Set(sprites.map((item) => String(item.mood || '').trim()).filter(Boolean));
    const quotedCount = lines.filter((line) => line && String(line.text || '').trim() && String(line.who || '').trim()).length;
    return WAIT_STAGE_GAMES.filter((id) => {
        if (id === 'rps' || id === 'mahjong' || id === 'tiles' || id === 'snake' || id === 'ludo') return true;
        if (id === 'whosaid') return quotedCount >= 1 && names.size >= 2;
        if (id === 'memory') return pictures.size >= 3;
        return sprites.length >= 2 && moods.size >= 2;
    });
}

export const RPS_HANDS = Object.freeze([
    { id: 'rock', label: '石头' },
    { id: 'scissors', label: '剪刀' },
    { id: 'paper', label: '布' },
]);

// 0 平、1 玩家赢、2 角色赢。
export function rpsOutcome(player, foe) {
    if (player === foe) return 0;
    const beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
    return beats[player] === foe ? 1 : 2;
}

export function rpsLineKey(outcome) {
    return outcome === 1 ? 'win' : (outcome === 2 ? 'lose' : 'draw');
}

// 翻牌：按对数建牌堆，每对两张同图；图不够多时同一张图轮流出现在多对里，保证牌数准确。
export function buildMemoryDeck(pictures, pairCount = 6, random = Math.random) {
    const unique = [];
    const seen = new Set();
    for (const item of Array.isArray(pictures) ? pictures : []) {
        const url = item && item.url ? String(item.url) : '';
        if (!url || seen.has(url)) continue;
        seen.add(url);
        unique.push(item);
    }
    const pairs = Math.max(0, Math.floor(Number(pairCount) || 0));
    const deck = [];
    if (!unique.length) return deck;
    const shuffle = (list) => {
        for (let i = list.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            const swap = list[i];
            list[i] = list[j];
            list[j] = swap;
        }
        return list;
    };
    // 先打乱取图顺序，各关用的图不总是同一批。
    const order = shuffle(unique.slice());
    for (let n = 0; n < pairs; n += 1) {
        const item = order[n % order.length];
        deck.push({ ...item, id: `${item.url}#${n}a` });
        deck.push({ ...item, id: `${item.url}#${n}b` });
    }
    return shuffle(deck);
}

// 翻牌关卡：牌数 2 / 4 / 8 / 16 / 32 张，列数随牌数。
export const MEMORY_LEVEL_PAIRS = Object.freeze([1, 2, 4, 8, 16]);
export function memoryColumns(cardCount) {
    if (cardCount <= 4) return 2;
    if (cardCount <= 16) return 4;
    return 8;
}

function pickOptions(answerValue, candidates, size, random) {
    const pool = candidates.slice();
    const out = [answerValue];
    while (out.length < size && pool.length) {
        out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    }
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        const swap = out[i];
        out[i] = out[j];
        out[j] = swap;
    }
    return out;
}

// 心情猜猜：抽一张差分当谜面，再从本卡全部情绪里挑干扰项。
export function buildMoodRound(sprites, options = {}) {
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const pool = (Array.isArray(sprites) ? sprites : []).filter((item) => item && item.url && item.mood);
    if (pool.length < 2) return null;
    const answer = pool[Math.floor(random() * pool.length)];
    const others = Array.from(new Set(pool.map((item) => item.mood))).filter((mood) => mood !== answer.mood);
    if (!others.length) return null;
    return { sprite: answer, answer: answer.mood, options: pickOptions(answer.mood, others, 3, random) };
}

// 这句是谁说的：从回放池里抽一句台词，混入其他角色的名字。
export function buildWhoSaidRound(lines, random = Math.random, extraNames = []) {
    const quoted = (Array.isArray(lines) ? lines : []).filter((line) => line && line.who && line.text);
    if (!quoted.length) return null;
    const answer = quoted[Math.floor(random() * quoted.length)];
    const names = Array.from(new Set(quoted.map((line) => line.who).concat(Array.isArray(extraNames) ? extraNames : [])));
    if (names.length < 2) return null;
    const others = names.filter((name) => name !== answer.who);
    return { text: answer.text, answer: answer.who, options: pickOptions(answer.who, others, 3, random) };
}

export const WAIT_STAGE_GAME_STYLE_TEXT = `
@keyframes igs-ws-flip{0%{transform:rotateY(90deg);opacity:.2;}100%{transform:rotateY(0);opacity:1;}}
.igs-ws-games{display:grid;grid-template-columns:repeat(auto-fit,minmax(108px,1fr));gap:10px;box-sizing:border-box;width:min(100%,500px);margin-top:4px;}
@keyframes igs-ws-card-in{0%{opacity:0;transform:translateY(10px) scale(.96);}100%{opacity:1;transform:none;}}
.igs-ws-game{position:relative;box-sizing:border-box;display:flex;flex-direction:column;align-items:flex-start;gap:5px;min-height:100px;margin:0;padding:12px 12px 11px;border:0;border-radius:14px;overflow:hidden;text-align:left;font:inherit;color:var(--igs-bar-ink,#e8e5df);cursor:pointer;background:color-mix(in srgb,var(--igs-dialog-bg,#1f2225) 86%,transparent);box-shadow:0 6px 18px rgba(0,0,0,.18);transition:transform .22s cubic-bezier(.2,.8,.2,1),box-shadow .22s ease,background .22s ease;animation:igs-ws-card-in .42s cubic-bezier(.2,.8,.2,1) both;}
.igs-ws-game:nth-child(2){animation-delay:.04s;}.igs-ws-game:nth-child(3){animation-delay:.08s;}.igs-ws-game:nth-child(4){animation-delay:.12s;}.igs-ws-game:nth-child(5){animation-delay:.16s;}.igs-ws-game:nth-child(6){animation-delay:.2s;}.igs-ws-game:nth-child(n+7){animation-delay:.24s;}
.igs-ws-game:hover,.igs-ws-game:focus-visible{transform:translateY(-3px);background:color-mix(in srgb,var(--igs-bar-ink,#fff) 8%,color-mix(in srgb,var(--igs-dialog-bg,#1f2225) 90%,transparent));box-shadow:0 12px 26px rgba(0,0,0,.26);outline:none;}
.igs-ws-game:active{transform:translateY(0) scale(.97);}
.igs-ws-game-ico{display:grid;place-items:center;width:34px;height:34px;margin-bottom:3px;border-radius:10px;color:var(--igs-bar-ink,#e8e5df);background:color-mix(in srgb,var(--igs-bar-ink,#fff) 12%,transparent);transition:background .22s ease,color .22s ease;}
.igs-ws-game:hover .igs-ws-game-ico,.igs-ws-game:focus-visible .igs-ws-game-ico{color:var(--igs-dialog-bg,#1f2225);background:var(--igs-bar-ink,#e8e5df);}
.igs-ws-game-ico svg{width:20px;height:20px;}
.igs-ws-game-name{font-size:14px;font-weight:700;letter-spacing:.06em;line-height:1.3;}
.igs-ws-game-sub{font-size:11px;letter-spacing:.04em;line-height:1.3;opacity:.62;}
.igs-ws-game-no{position:absolute;top:10px;right:12px;font-size:10px;letter-spacing:.12em;font-variant-numeric:tabular-nums;opacity:.38;}
.igs-ws-game-mark{position:absolute;right:-12px;bottom:-14px;width:68px;height:68px;color:var(--igs-bar-ink,#e8e5df);opacity:.07;transform:rotate(-12deg);transition:transform .3s ease,opacity .3s ease;pointer-events:none;}
.igs-ws-game-mark svg{width:100%;height:100%;}
.igs-ws-game:hover .igs-ws-game-mark{opacity:.12;transform:rotate(-4deg) scale(1.06);}
@media (max-width:520px){
.igs-ws-games{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;}
.igs-ws-game{display:grid;grid-template-columns:30px minmax(0,1fr);grid-template-rows:auto auto;column-gap:9px;row-gap:1px;align-items:center;min-height:0;padding:9px 10px;border-radius:12px;}
.igs-ws-game-ico{grid-row:1/3;width:30px;height:30px;margin:0;border-radius:9px;}
.igs-ws-game-ico svg{width:17px;height:17px;}
.igs-ws-game-name,.igs-ws-game-sub{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.igs-ws-game-name{font-size:13px;letter-spacing:.04em;}
.igs-ws-game-sub{font-size:10.5px;letter-spacing:.02em;}
.igs-ws-game-no,.igs-ws-game-mark{display:none;}
}
.igs-ws-board{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;max-width:min(440px,94%);padding:16px;border-radius:14px;background:color-mix(in srgb,var(--igs-dialog-bg,#1f2225) 72%,transparent);box-shadow:0 10px 30px rgba(0,0,0,.28);animation:igs-ws-rise .38s ease-out both;}
.igs-ws-games[hidden],.igs-ws-board[hidden]{display:none;}
.igs-ws-board-head{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;color:color-mix(in srgb,var(--igs-bar-ink,#e8e5df) 60%,transparent);font-size:11px;letter-spacing:.14em;}
.igs-ws-close{border:0;background:transparent;color:inherit;font:inherit;font-size:14px;line-height:1;cursor:pointer;opacity:.6;}
.igs-ws-close:hover{opacity:1;}
.igs-ws-status{min-height:2.6em;display:flex;align-items:center;justify-content:center;color:var(--igs-bar-ink,#e8e5df);font-size:13px;line-height:1.6;letter-spacing:.06em;}
.igs-ws-hands,.igs-ws-choices{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;}
.igs-ws-hands .igs-ws-chip,.igs-ws-choices .igs-ws-chip{height:34px;padding:0 18px;font-size:13px;}
.igs-ws-board.is-wide{max-width:min(680px,96%);}
.igs-ws-grid{display:grid;grid-template-columns:repeat(var(--igs-ws-cols,4),1fr);gap:8px;width:100%;}
.igs-ws-grid.is-sparse{max-width:240px;}
.igs-ws-grid.is-dense{gap:5px;}
.igs-ws-card{position:relative;box-sizing:border-box;aspect-ratio:3/4;border:0;padding:0;border-radius:8px;overflow:hidden;background:color-mix(in srgb,var(--igs-bar-ink,#fff) 24%,var(--igs-dialog-bg,#1f2225));cursor:pointer;transition:background .18s ease,box-shadow .25s ease;}
.igs-ws-card:hover{background:color-mix(in srgb,var(--igs-bar-ink,#fff) 34%,var(--igs-dialog-bg,#1f2225));}
.igs-ws-card.is-open{background:color-mix(in srgb,var(--igs-bar-ink,#fff) 12%,var(--igs-dialog-bg,#1f2225));cursor:default;}
.igs-ws-card img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 12%;animation:igs-ws-flip .3s ease-out both;}
.igs-ws-card.is-done{cursor:default;box-shadow:0 0 0 1.5px color-mix(in srgb,var(--igs-bar-ink,#fff) 62%,transparent);}
.igs-ws-card.is-done img{opacity:.88;}
.igs-ws-card::after{content:"";position:absolute;inset:0;border-radius:8px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--igs-bar-ink,#fff) 42%,transparent);pointer-events:none;}
.igs-ws-card:not(.is-open)::after{background:repeating-linear-gradient(135deg,transparent 0 6px,color-mix(in srgb,var(--igs-bar-ink,#fff) 12%,transparent) 6px 12px);}
.igs-ws-card.is-open::after{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--igs-bar-ink,#fff) 24%,transparent);}
.igs-ws-next{display:flex;justify-content:center;}
.igs-ws-face{display:flex;align-items:center;justify-content:center;width:100%;}
.igs-ws-face img{display:block;max-height:34vh;max-width:100%;object-fit:contain;border-radius:10px;}
@media (prefers-reduced-motion: reduce){
.igs-ws-board,.igs-ws-card img,.igs-ws-game{animation:none!important;}
.igs-ws-game,.igs-ws-game-mark{transition:none!important;}
}
` + MAHJONG_STYLE + SCMJ_STYLE + TILES_STYLE + SNAKE_STYLE + LUDO_STYLE;

const GAME_STYLE_ID = 'igs-wait-games-style';

function mountNode(doc, className, html) {
    const node = doc.createElement('div');
    node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
}

function gameShell(ctx, title) {
    const { doc, board } = ctx;
    board.innerHTML = '';
    if (board.classList) board.classList.remove('is-wide');
    const head = doc.createElement('div');
    head.className = 'igs-ws-board-head';
    const name = doc.createElement('span');
    name.textContent = title;
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'igs-ws-close';
    close.textContent = '✕';
    close.addEventListener('click', () => ctx.requestClose());
    head.appendChild(name);
    head.appendChild(close);
    board.appendChild(head);
    const status = doc.createElement('div');
    status.className = 'igs-ws-status';
    board.appendChild(status);
    return status;
}

function chipRow(ctx, className, labels, onPick) {
    const row = mountNode(ctx.doc, className);
    for (const item of labels) {
        const button = ctx.doc.createElement('button');
        button.type = 'button';
        button.className = 'igs-ws-chip';
        button.textContent = item.label;
        button.addEventListener('click', () => onPick(item));
        row.appendChild(button);
    }
    ctx.board.appendChild(row);
    return row;
}

function say(ctx, status, text, lineKey) {
    status.textContent = text;
    if (!lineKey) return;
    ctx.setNote(waitStageGameLine(lineKey, ctx.random));
    try { ctx.onVoice(null); } catch (error) { /* 语气音失败不影响这一局 */ }
}

function startRps(ctx) {
    const status = gameShell(ctx, WAIT_STAGE_GAME_LABELS.rps);
    status.textContent = '出什么？';
    ctx.setNote(waitStageGameLine('start', ctx.random));
    chipRow(ctx, 'igs-ws-hands', RPS_HANDS.map((hand) => ({ id: hand.id, label: hand.label })), (hand) => {
        if (ctx.isExiting() && ctx.isSettled()) return;
        const foe = RPS_HANDS[Math.floor(ctx.random() * RPS_HANDS.length)];
        const outcome = rpsOutcome(hand.id, foe.id);
        say(ctx, status, `你出${hand.label}，对方出${foe.label}。`, rpsLineKey(outcome));
        ctx.markDone();
    });
}

function startWhoSaid(ctx) {
    const model = ctx.model || {};
    const round = buildWhoSaidRound(model.replay, ctx.random, model.names);
    const status = gameShell(ctx, WAIT_STAGE_GAME_LABELS.whosaid);
    if (!round) {
        say(ctx, status, '能回放的台词还不够，多聊几句再来。');
        return;
    }
    status.textContent = `「${round.text}」`;
    chipRow(ctx, 'igs-ws-choices', round.options.map((name) => ({ id: name, label: name })), (item) => {
        if (ctx.isSettled()) return;
        const right = item.id === round.answer;
        say(ctx, status, right ? `是${round.answer}。` : `是${round.answer}说的。`, right ? 'right' : 'wrong');
        ctx.markDone();
    });
}

// 牌面可能是图库原地址，经 loadImage 读回再显示；读不到就留空。
function showImage(ctx, image, url) {
    const value = typeof ctx.loadImage === 'function' ? ctx.loadImage(url) : url;
    if (typeof value === 'string') {
        if (value) image.src = value;
        return;
    }
    Promise.resolve(value).then((src) => { if (src) image.src = src; }, () => {});
}

function startMemory(ctx) {
    const model = ctx.model || {};
    const pictures = model.art && model.art.pictures;
    const levels = MEMORY_LEVEL_PAIRS.length;
    const renderLevel = (level) => {
        const total = MEMORY_LEVEL_PAIRS[level];
        const deck = buildMemoryDeck(pictures, total, ctx.random);
        const status = gameShell(ctx, WAIT_STAGE_GAME_LABELS.memory);
        if (!deck.length) {
            say(ctx, status, '图库里还没有能用的图。');
            return;
        }
        if (ctx.board.classList && deck.length > 16) ctx.board.classList.add('is-wide');
        // 开局先把这几张读起来，翻牌时多半已经到了。
        if (typeof ctx.loadImage === 'function') for (const url of new Set(deck.map((card) => card.url))) ctx.loadImage(url);
        const grid = mountNode(ctx.doc, 'igs-ws-grid');
        if (deck.length <= 4) grid.classList.add('is-sparse');
        if (deck.length > 16) grid.classList.add('is-dense');
        grid.style.setProperty('--igs-ws-cols', String(memoryColumns(deck.length)));
        const opened = [];
        const done = new Set();
        const nodes = [];
        let pairs = 0;
        let moves = 0;
        const progress = () => `第 ${level + 1} 关 · 配对 ${pairs} / ${total}`;
        status.textContent = progress();
        const hide = (card, node) => {
            if (done.has(card.id)) return;
            node.classList.remove('is-open');
            node.innerHTML = '';
        };
        for (const card of deck) {
            const button = ctx.doc.createElement('button');
            button.type = 'button';
            button.className = 'igs-ws-card';
            button.addEventListener('click', () => {
                if (done.has(card.id) || opened.indexOf(card) >= 0 || opened.length >= 2) return;
                opened.push(card);
                button.classList.add('is-open');
                const image = ctx.doc.createElement('img');
                showImage(ctx, image, card.url);
                image.alt = '';
                button.appendChild(image);
                if (opened.length < 2) return;
                const a = opened[0];
                const b = opened[1];
                const aNode = nodes[deck.indexOf(a)];
                const bNode = nodes[deck.indexOf(b)];
                moves += 1;
                if (String(a.url) === String(b.url)) {
                    done.add(a.id);
                    done.add(b.id);
                    pairs += 1;
                    if (aNode) aNode.classList.add('is-done');
                    if (bNode) bNode.classList.add('is-done');
                    opened.length = 0;
                    status.textContent = progress();
                    if (pairs < total) return;
                    ctx.setNote(waitStageGameLine('right', ctx.random));
                    if (level + 1 >= levels) {
                        status.textContent = `全部通关，最后一关 ${moves} 手。`;
                        ctx.markDone();
                        return;
                    }
                    status.textContent = `第 ${level + 1} 关通过，${moves} 手。`;
                    const row = mountNode(ctx.doc, 'igs-ws-next');
                    const next = ctx.doc.createElement('button');
                    next.type = 'button';
                    next.className = 'igs-ws-chip';
                    next.textContent = '下一关';
                    next.addEventListener('click', () => renderLevel(level + 1));
                    row.appendChild(next);
                    ctx.board.appendChild(row);
                    return;
                }
                ctx.setNote(waitStageGameLine('wrong', ctx.random));
                ctx.timers.setTimeout(() => {
                    if (aNode) hide(a, aNode);
                    if (bNode) hide(b, bNode);
                    opened.length = 0;
                }, 620);
            });
            nodes.push(button);
            grid.appendChild(button);
        }
        ctx.board.appendChild(grid);
    };
    renderLevel(0);
}

function startMood(ctx) {
    const model = ctx.model || {};
    const round = buildMoodRound(model.art && model.art.sprites, { random: ctx.random });
    const status = gameShell(ctx, WAIT_STAGE_GAME_LABELS.mood);
    if (!round) {
        say(ctx, status, '立绘差分还不够，先去补几张表情。');
        return;
    }
    const face = mountNode(ctx.doc, 'igs-ws-face');
    const image = ctx.doc.createElement('img');
    showImage(ctx, image, round.sprite.url);
    image.alt = '';
    face.appendChild(image);
    ctx.board.appendChild(face);
    status.textContent = '这是什么心情？';
    chipRow(ctx, 'igs-ws-choices', round.options.map((mood) => ({ id: mood, label: mood })), (item) => {
        if (ctx.isSettled()) return;
        const right = item.id === round.answer;
        say(ctx, status, right ? `是${round.answer}。` : `其实是${round.answer}。`, right ? 'right' : 'wrong');
        ctx.markDone();
    });
}

const STARTERS = Object.freeze({
    rps: startRps,
    whosaid: startWhoSaid,
    memory: startMemory,
    mood: startMood,
    mahjong: startMahjong,
    tiles: startTiles,
    snake: startSnake,
    ludo: startLudo,
});

export function ensureWaitStageGameStyle(doc, style = WAIT_STAGE_GAME_STYLE_TEXT) {
    if (!doc || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function' || !style) return;
    const parent = doc.head || doc.documentElement;
    if (!parent || typeof parent.appendChild !== 'function') return;
    let node = doc.getElementById(GAME_STYLE_ID);
    if (!node) {
        node = doc.createElement('style');
        node.id = GAME_STYLE_ID;
        parent.appendChild(node);
    }
    if (node.textContent !== style) node.textContent = style;
}

export function createWaitStageGamePack() {
    return {
        id: 'igs-wait-games',
        style: WAIT_STAGE_GAME_STYLE_TEXT,
        list(model) {
            const art = model && model.art || {};
            const lines = model && (model.replay || model.lines) || [];
            const names = model && model.names || [];
            return availableWaitStageGames(art, lines, names);
        },
        label(id) {
            return WAIT_STAGE_GAME_LABELS[id] || id;
        },
        // 把主体画好的文字按钮换成卡片，序号是在列表里的位置。
        decorate(button, id, index = 0) {
            if (!WAIT_STAGE_GAME_CARDS[id] || !button) return;
            button.className = 'igs-ws-game';
            button.setAttribute('data-game', id);
            button.innerHTML = gameCardHtml(id, (Number(index) || 0) + 1);
        },
        ensureStyle(doc) {
            ensureWaitStageGameStyle(doc, this.style);
        },
        start(ctx) {
            const starter = STARTERS[ctx && ctx.id];
            if (!starter || !ctx.doc || !ctx.board) return;
            ensureWaitStageGameStyle(ctx.doc, this.style);
            starter(ctx);
        },
    };
}
