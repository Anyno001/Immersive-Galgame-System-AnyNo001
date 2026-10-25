// 等待过场小游戏「消消乐」：叠层牌堆，只有没被压住的牌能点，进底槽凑三消。牌面沿用麻将牌的字形。
import { waitStageGameLine } from './wait-stage-game-lines.js';

export const TILES_SLOT_SIZE = 7;
export const TILES_BOARD = Object.freeze({ bw: 16, bh: 16, tileW: 2, tileH: 2.5 });

const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HONOR = ['东', '南', '西', '北', '白', '发', '中'];
// 牌种：万筒索各取前几张，再加字牌。
export const TILES_KINDS = Object.freeze([
    ...NUM.slice(0, 5).map((n, i) => ({ id: `m${i + 1}`, top: n, bottom: '万' })),
    ...NUM.slice(0, 5).map((n, i) => ({ id: `p${i + 1}`, top: n, bottom: '筒' })),
    ...NUM.slice(0, 4).map((n, i) => ({ id: `s${i + 1}`, top: n, bottom: '索' })),
    ...HONOR.map((h, i) => ({ id: `z${i + 1}`, top: h, bottom: '' })),
]);

// 每关：各层张数（都是 3 的倍数）、牌种数。
export const TILES_LEVELS = Object.freeze([
    { layers: [18, 12, 6], kinds: 9 },
    { layers: [22, 20, 12], kinds: 13 },
]);

const LAYER_SHIFT = [[0, 0], [1, 1.25], [0, 2.5]];
const COLS = 7;
const ROWS = 5;

// 两张牌是否重叠（z 更高的那张才会压住另一张）。
export function tilesOverlap(a, b) {
    return Math.abs(a.x - b.x) < TILES_BOARD.tileW && Math.abs(a.y - b.y) < TILES_BOARD.tileH;
}

export function isTileCovered(tile, tiles, removed = new Set()) {
    return tiles.some((other) => other.id !== tile.id && other.z > tile.z && !removed.has(other.id) && tilesOverlap(tile, other));
}

export function freeTiles(tiles, removed = new Set()) {
    return tiles.filter((tile) => !removed.has(tile.id) && !isTileCovered(tile, tiles, removed));
}

function shuffle(list, random) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function pickPositions(random, level) {
    const spec = TILES_LEVELS[Math.max(0, Math.min(TILES_LEVELS.length - 1, (Number(level) || 1) - 1))];
    const tiles = [];
    spec.layers.forEach((count, z) => {
        const [dx, dy] = LAYER_SHIFT[z];
        const cols = z === 1 ? COLS - 1 : COLS;
        const rows = z === 0 ? ROWS : ROWS - 1;
        const cells = [];
        for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) cells.push([1 + c * 2 + dx, r * TILES_BOARD.tileH + dy]);
        for (const [x, y] of shuffle(cells, random).slice(0, count)) tiles.push({ id: tiles.length, x, y, z, kind: '' });
    });
    return { tiles, spec };
}

// 倒推出牌：反复从当前没被压住的牌里取 3 张配成同一种，保证至少存在一种逐组清空的解。
function assignKinds(tiles, spec, random) {
    const removed = new Set();
    const kinds = shuffle(TILES_KINDS, random).slice(0, spec.kinds);
    let step = 0;
    while (removed.size < tiles.length) {
        const free = freeTiles(tiles, removed);
        if (free.length < 3) return false;
        const kind = kinds[step % kinds.length].id;
        step += 1;
        for (const tile of shuffle(free, random).slice(0, 3)) {
            tile.kind = kind;
            removed.add(tile.id);
        }
    }
    return true;
}

export function buildTilesLayout(random = Math.random, level = 1) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const { tiles, spec } = pickPositions(random, level);
        if (tiles.length % 3 === 0 && assignKinds(tiles, spec, random)) {
            return { level: Number(level) || 1, bw: TILES_BOARD.bw, bh: TILES_BOARD.bh, tiles };
        }
    }
    // 兜底：单层整齐排布，每种 3 张。
    const tiles = [];
    for (let i = 0; i < 18; i += 1) {
        tiles.push({ id: i, x: 1 + (i % COLS) * 2, y: Math.floor(i / COLS) * TILES_BOARD.tileH, z: 0, kind: TILES_KINDS[Math.floor(i / 3)].id });
    }
    return { level: Number(level) || 1, bw: TILES_BOARD.bw, bh: TILES_BOARD.bh, tiles };
}

// 入槽：同种牌挨在一起放；凑够 3 张立即消除。返回新槽、是否消除、是否判负。
export function slotAdd(slot, kind, size = TILES_SLOT_SIZE) {
    const next = slot.slice();
    let at = next.length;
    for (let i = next.length - 1; i >= 0; i -= 1) if (next[i] === kind) { at = i + 1; break; }
    next.splice(at, 0, kind);
    if (next.filter((item) => item === kind).length >= 3) {
        return { slot: next.filter((item) => item !== kind), cleared: true, lost: false };
    }
    return { slot: next, cleared: false, lost: next.length >= size };
}

export function tilesCleared(tiles, removed) {
    return tiles.every((tile) => removed.has(tile.id));
}

// 道具：把槽里最早入槽的 n 张退回牌堆原位（它们入槽时没被压住，退回后仍不会被压）。
export function slotReturn(entries, n = 3) {
    return { back: entries.slice(0, n), slot: entries.slice(n) };
}

export const TILES_STYLE = `
.igs-tl{display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;}
.igs-tl-field{position:relative;box-sizing:border-box;width:min(100%,360px);aspect-ratio:var(--bw)/var(--bh);border-radius:12px;background:color-mix(in srgb,var(--igs-bar-ink,#fff) 5%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--igs-bar-ink,#fff) 10%,transparent);}
.igs-tl-tile,.igs-tl-cell.is-full{--face:color-mix(in srgb,var(--igs-bar-ink,#fff) 90%,var(--igs-dialog-bg,#1f2225));--tint:color-mix(in oklch,var(--face) 82%,oklch(.72 .12 var(--h,0)));background:linear-gradient(160deg,var(--tint),var(--face));color:var(--igs-dialog-bg,#1f2225);}
.igs-tl-tile{position:absolute;box-sizing:border-box;left:calc(var(--x) / var(--bw) * 100%);top:calc(var(--y) / var(--bh) * 100%);width:calc(2 / var(--bw) * 100%);height:calc(2.5 / var(--bh) * 100%);z-index:var(--z);margin:0;padding:0;border:0;border-radius:7%/6%;display:flex;flex-direction:column;align-items:center;justify-content:center;font:inherit;cursor:pointer;box-shadow:0 0 0 1px color-mix(in srgb,var(--igs-dialog-bg,#1f2225) 30%,transparent),0 2px 0 color-mix(in srgb,var(--igs-dialog-bg,#1f2225) 45%,transparent),0 4px 7px rgba(0,0,0,.22);transition:transform .16s ease,filter .2s ease,opacity .2s ease;}
.igs-tl-tile:not(.is-covered):hover{transform:translateY(-2px);}
.igs-tl-tile.is-covered{filter:brightness(.55) saturate(.7);cursor:default;}
.igs-tl-tile.is-gone{opacity:0;pointer-events:none;transform:scale(.7);}
.igs-tl-top{font-size:clamp(13px,4.2vw,19px);font-weight:700;line-height:1;}
.igs-tl-bottom{font-size:clamp(8px,2.4vw,11px);line-height:1.1;opacity:.75;}
.igs-tl-slot{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;box-sizing:border-box;width:min(100%,360px);padding:6px;border-radius:10px;background:color-mix(in srgb,var(--igs-dialog-bg,#1f2225) 60%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--igs-bar-ink,#fff) 14%,transparent);}
.igs-tl-cell{aspect-ratio:4/5;border-radius:6px;background:color-mix(in srgb,var(--igs-bar-ink,#fff) 6%,transparent);display:flex;flex-direction:column;align-items:center;justify-content:center;}
.igs-tl-cell.is-full{animation:igs-tl-pop .18s ease-out both;}
@keyframes igs-tl-pop{0%{transform:scale(.7);}100%{transform:scale(1);}}
.igs-tl-tools{display:flex;gap:8px;align-items:center;justify-content:center;}
.igs-tl-tools .igs-ws-chip[disabled]{opacity:.4;cursor:default;}
@media (prefers-reduced-motion: reduce){
.igs-tl-tile,.igs-tl-cell.is-full{animation:none!important;transition:none!important;}
}
`;

function kindOf(id) {
    return TILES_KINDS.find((kind) => kind.id === id) || TILES_KINDS[0];
}

function hueOf(id) {
    return String(Math.max(0, TILES_KINDS.findIndex((kind) => kind.id === id)) * 360 / TILES_KINDS.length);
}

function fillFace(doc, node, id) {
    const kind = kindOf(id);
    node.style.setProperty('--h', hueOf(id));
    const top = doc.createElement('span');
    top.className = 'igs-tl-top';
    top.textContent = kind.top;
    node.appendChild(top);
    if (kind.bottom) {
        const bottom = doc.createElement('span');
        bottom.className = 'igs-tl-bottom';
        bottom.textContent = kind.bottom;
        node.appendChild(bottom);
    }
}

export function startTiles(ctx) {
    const { doc, board } = ctx;
    board.innerHTML = '';
    const head = doc.createElement('div');
    head.className = 'igs-ws-board-head';
    const name = doc.createElement('span');
    name.textContent = '消消乐';
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
    const root = doc.createElement('div');
    root.className = 'igs-tl';
    board.appendChild(root);

    let level = 1;
    let over = false;

    const play = () => {
        root.innerHTML = '';
        const layout = buildTilesLayout(ctx.random, level);
        const tiles = layout.tiles;
        const removed = new Set();
        let slot = [];
        let rescue = true;
        const field = doc.createElement('div');
        field.className = 'igs-tl-field';
        field.style.setProperty('--bw', String(layout.bw));
        field.style.setProperty('--bh', String(layout.bh));
        const slotRow = doc.createElement('div');
        slotRow.className = 'igs-tl-slot';
        const tools = doc.createElement('div');
        tools.className = 'igs-tl-tools';
        const help = doc.createElement('button');
        help.type = 'button';
        help.className = 'igs-ws-chip';
        help.textContent = '移出 3 张';
        tools.appendChild(help);
        root.appendChild(field);
        root.appendChild(slotRow);
        root.appendChild(tools);
        const nodes = new Map();

        const refresh = () => {
            for (const tile of tiles) {
                const node = nodes.get(tile.id);
                const gone = removed.has(tile.id);
                node.className = `igs-tl-tile${gone ? ' is-gone' : ''}${!gone && isTileCovered(tile, tiles, removed) ? ' is-covered' : ''}`;
                node.disabled = gone;
            }
            slotRow.innerHTML = '';
            for (let i = 0; i < TILES_SLOT_SIZE; i += 1) {
                const cell = doc.createElement('div');
                cell.className = 'igs-tl-cell';
                if (slot[i]) {
                    cell.className += ' is-full';
                    fillFace(doc, cell, slot[i].kind);
                }
                slotRow.appendChild(cell);
            }
            help.disabled = !rescue || slot.length < 1;
            status.textContent = `第 ${level} 关 · 剩 ${tiles.length - removed.size} 张`;
        };

        const finish = (won) => {
            if (won && level < TILES_LEVELS.length) {
                status.textContent = `第 ${level} 关通过。`;
                ctx.setNote(waitStageGameLine('right', ctx.random));
                level += 1;
                // 面板关掉后不再起下一关。
                ctx.timers.setTimeout(() => { if (!ctx.isSettled() && board.contains(root)) play(); }, 900);
                return;
            }
            over = true;
            status.textContent = won ? '全部清空，通关了。' : '槽满了，这局输了。';
            ctx.setNote(waitStageGameLine(won ? 'right' : 'wrong', ctx.random));
            try { ctx.onVoice(null); } catch (error) { /* 语气音失败不影响这一局 */ }
            ctx.markDone();
        };

        for (const tile of tiles) {
            const node = doc.createElement('button');
            node.type = 'button';
            node.style.setProperty('--x', String(tile.x));
            node.style.setProperty('--y', String(tile.y));
            node.style.setProperty('--z', String(tile.z));
            fillFace(doc, node, tile.kind);
            node.addEventListener('click', () => {
                if (over || ctx.isSettled() || removed.has(tile.id) || isTileCovered(tile, tiles, removed)) return;
                removed.add(tile.id);
                const entries = slot.concat([{ kind: tile.kind, id: tile.id }]);
                const result = slotAdd(slot.map((item) => item.kind), tile.kind);
                // 按 slotAdd 排出的牌种顺序重排槽内条目，保留各牌的原位编号。
                const pool = entries.slice();
                slot = result.slot.map((kind) => pool.splice(pool.findIndex((item) => item.kind === kind), 1)[0]);
                refresh();
                if (tilesCleared(tiles, removed)) finish(true);
                else if (result.lost) finish(false);
            });
            nodes.set(tile.id, node);
            field.appendChild(node);
        }
        help.addEventListener('click', () => {
            if (over || ctx.isSettled() || !rescue || !slot.length) return;
            rescue = false;
            const moved = slotReturn(slot, 3);
            slot = moved.slot;
            for (const item of moved.back) removed.delete(item.id);
            refresh();
        });
        refresh();
    };

    ctx.setNote(waitStageGameLine('start', ctx.random));
    play();
}
