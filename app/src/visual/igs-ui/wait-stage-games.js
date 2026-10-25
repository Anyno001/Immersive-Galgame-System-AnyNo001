// 等待过场里的小游戏。这段不进 Gal 前端主体，只由独立导入脚本登记后才会玩。
import { MAHJONG_STYLE, startMahjong } from './wait-stage-mahjong.js';
import { SCMJ_STYLE } from './wait-stage-scmj.js';
export const WAIT_STAGE_GAME_LINES = Object.freeze({
    win: ['……这局算你的。', '运气不错嘛。', '好吧，你赢了。', '再来，我不信了。'],
    lose: ['承让了。', '还是我比较稳。', '再来一局？', '下次可别怪我不客气。'],
    draw: ['想到一块去了。', '平手，再来。', '这么巧？'],
    right: ['答对了。', '没错，是我说的。', '记得挺清楚嘛。'],
    wrong: ['……不是这句。', '再想想？', '记岔了吧。'],
    start: ['闲着也是闲着，来一局？', '要不要玩点什么？', '等着的工夫，来一把？'],
});

export function waitStageGameLine(kind, random = Math.random) {
    const pool = WAIT_STAGE_GAME_LINES[kind] || WAIT_STAGE_GAME_LINES.start;
    return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

export const WAIT_STAGE_GAMES = Object.freeze(['rps', 'mahjong', 'whosaid', 'memory', 'mood']);

export const WAIT_STAGE_GAME_LABELS = Object.freeze({
    rps: '猜拳',
    mahjong: '麻将',
    whosaid: '这句是谁说的',
    memory: '翻牌配对',
    mood: '心情猜猜',
});

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
        if (id === 'rps' || id === 'mahjong') return true;
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

// 翻牌：取若干张不同的图，每种两张，打乱成牌堆。
export function buildMemoryDeck(pictures, pairCount = 6, random = Math.random) {
    const unique = [];
    const seen = new Set();
    for (const item of Array.isArray(pictures) ? pictures : []) {
        const url = item && item.url ? String(item.url) : '';
        if (!url || seen.has(url)) continue;
        seen.add(url);
        unique.push(item);
        if (unique.length >= pairCount) break;
    }
    const deck = [];
    for (const item of unique) {
        deck.push({ ...item, id: `${item.url}#a` });
        deck.push({ ...item, id: `${item.url}#b` });
    }
    for (let i = deck.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        const swap = deck[i];
        deck[i] = deck[j];
        deck[j] = swap;
    }
    return deck;
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
.igs-ws-games{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;margin-top:-2px;}
.igs-ws-board{box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;max-width:min(440px,94%);padding:16px;border-radius:14px;background:color-mix(in srgb,var(--igs-dialog-bg,#1f2225) 72%,transparent);box-shadow:0 10px 30px rgba(0,0,0,.28);animation:igs-ws-rise .38s ease-out both;}
.igs-ws-games[hidden],.igs-ws-board[hidden]{display:none;}
.igs-ws-board-head{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;color:color-mix(in srgb,var(--igs-bar-ink,#e8e5df) 60%,transparent);font-size:11px;letter-spacing:.14em;}
.igs-ws-close{border:0;background:transparent;color:inherit;font:inherit;font-size:14px;line-height:1;cursor:pointer;opacity:.6;}
.igs-ws-close:hover{opacity:1;}
.igs-ws-status{min-height:2.6em;display:flex;align-items:center;justify-content:center;color:var(--igs-bar-ink,#e8e5df);font-size:13px;line-height:1.6;letter-spacing:.06em;}
.igs-ws-hands,.igs-ws-choices{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;}
.igs-ws-hands .igs-ws-chip,.igs-ws-choices .igs-ws-chip{height:34px;padding:0 18px;font-size:13px;}
.igs-ws-grid{display:grid;grid-template-columns:repeat(var(--igs-ws-cols,4),1fr);gap:8px;width:100%;}
.igs-ws-card{position:relative;box-sizing:border-box;aspect-ratio:3/4;border:0;padding:0;border-radius:8px;overflow:hidden;background:color-mix(in srgb,var(--igs-bar-ink,#fff) 10%,transparent);cursor:pointer;transition:background .18s ease,opacity .3s ease;}
.igs-ws-card:hover{background:color-mix(in srgb,var(--igs-bar-ink,#fff) 18%,transparent);}
.igs-ws-card.is-open{background:color-mix(in srgb,var(--igs-dialog-bg,#1f2225) 60%,transparent);cursor:default;}
.igs-ws-card img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 12%;animation:igs-ws-flip .3s ease-out both;}
.igs-ws-card.is-done{opacity:.42;}
.igs-ws-card::after{content:"";position:absolute;inset:0;border-radius:8px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--igs-bar-ink,#fff) 12%,transparent);pointer-events:none;}
.igs-ws-card:not(.is-open)::after{background:repeating-linear-gradient(135deg,transparent 0 6px,color-mix(in srgb,var(--igs-bar-ink,#fff) 5%,transparent) 6px 12px);}
.igs-ws-face{display:flex;align-items:center;justify-content:center;width:100%;}
.igs-ws-face img{display:block;max-height:34vh;max-width:100%;object-fit:contain;border-radius:10px;}
@media (prefers-reduced-motion: reduce){
.igs-ws-board,.igs-ws-card img{animation:none!important;}
}
` + MAHJONG_STYLE + SCMJ_STYLE;

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
    const deck = buildMemoryDeck(model.art && model.art.pictures, 6, ctx.random);
    const status = gameShell(ctx, WAIT_STAGE_GAME_LABELS.memory);
    if (!deck.length) {
        say(ctx, status, '图库里还没有能用的图。');
        return;
    }
    // 开局先把这几张读起来，翻牌时多半已经到了。
    if (typeof ctx.loadImage === 'function') for (const url of new Set(deck.map((card) => card.url))) ctx.loadImage(url);
    const columns = deck.length >= 12 ? 4 : 3;
    const grid = mountNode(ctx.doc, 'igs-ws-grid');
    grid.style.setProperty('--igs-ws-cols', String(columns));
    const opened = [];
    const done = new Set();
    const nodes = [];
    const total = deck.length / 2;
    let pairs = 0;
    let moves = 0;
    status.textContent = `配对 0 / ${total}`;
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
                status.textContent = `配对 ${pairs} / ${total}`;
                if (pairs >= total) {
                    ctx.setNote(waitStageGameLine('right', ctx.random));
                    status.textContent = `配对完成，共 ${moves} 手。`;
                    ctx.markDone();
                }
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
