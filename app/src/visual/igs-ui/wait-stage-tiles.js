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

// 牌面皮肤：情绪（默认）在麻将牌种之上换画法，一局里每种牌对应一个情绪符号；麻将即原牌面。
export const TILES_SKINS = Object.freeze([
    { id: 'emote', label: '情绪' },
    { id: 'mahjong', label: '麻将' },
]);
// 情绪符号，32×32 画布，扁平单色。f 实心、l 粗线、core 花心。颜色在样式表里按 id 取。数量须不少于单关最多牌种。
export const TILES_EMOTES = Object.freeze([
    { id: 'heart', label: '爱心', svg: '<path class="f" d="M16 27C6.5 20.5 3.5 14.5 6 9.8 8.4 5.6 13.5 5.8 16 10c2.5-4.2 7.6-4.4 10-.2 2.5 4.7-.5 10.7-10 17.2Z"/>' },
    { id: 'anger', label: '青筋', svg: '<path class="l" d="M13 5q0 8-8 8M19 5q0 8 8 8M13 27q0-8-8-8M19 27q0-8 8-8"/>' },
    { id: 'exclaim', label: '感叹', svg: '<path class="f" d="M12.6 5.2h6.8l-1.5 15.2h-3.8Z"/><circle class="f" cx="16" cy="25.6" r="2.7"/>' },
    { id: 'question', label: '疑问', svg: '<path class="l" d="M10.8 11.2a5.3 5.3 0 1 1 7.4 4.8c-1.6.8-2.2 1.8-2.2 3.8"/><circle class="f" cx="16" cy="25.8" r="2.5"/>' },
    { id: 'sparkle', label: '闪光', svg: '<path class="f" d="M14 4c1 8.5 3.6 11 11.5 12-7.9 1-10.5 3.5-11.5 12-1-8.5-3.6-11-11.5-12C10.4 15 13 12.5 14 4Z"/><path class="f" d="M25 3.5c.4 3 1.4 4 4 4.5-2.6.5-3.6 1.5-4 4.5-.4-3-1.4-4-4-4.5 2.6-.5 3.6-1.5 4-4.5Z"/>' },
    { id: 'bolt', label: '闪电', svg: '<path class="f" d="M19 3 7.5 18h7.2l-2.4 11L25 13.4h-7.3Z"/>' },
    { id: 'clover', label: '四叶草', svg: '<path class="l l-thin" d="M16 17q3 7 9 10"/><circle class="f" cx="11.2" cy="11.2" r="5"/><circle class="f" cx="20.8" cy="11.2" r="5"/><circle class="f" cx="11.2" cy="20.8" r="5"/><circle class="f" cx="20.8" cy="20.8" r="5"/>' },
    { id: 'sweat', label: '汗滴', svg: '<path class="f" d="M16 3.8S7 14.6 7 20.2a9 9 0 0 0 18 0C25 14.6 16 3.8 16 3.8Z"/>' },
    { id: 'moon', label: '困倦', svg: '<path class="f" d="M19.5 4.5a11.5 11.5 0 1 0 8 18.4A9.5 9.5 0 0 1 19.5 4.5Z"/>' },
    { id: 'note', label: '音符', svg: '<path class="f" d="M12.4 7.6 27.6 4v5l-15.2 3.6Z"/><path class="f" d="M12.4 9h2.6v14h-2.6ZM25 5h2.6v14.6H25Z"/><ellipse class="f" cx="10.2" cy="23.6" rx="4.4" ry="3.5"/><ellipse class="f" cx="22.8" cy="20" rx="4.4" ry="3.5"/>' },
    { id: 'swirl', label: '眩晕', svg: '<path class="l l-swirl" d="M16 16a2 2 0 0 1 4 0 4 4 0 0 1-8 0 6 6 0 0 1 12 0 8 8 0 0 1-16 0"/>' },
    { id: 'flower', label: '花', svg: '<circle class="f" cx="16" cy="8.6" r="5"/><circle class="f" cx="23" cy="13.7" r="5"/><circle class="f" cx="20.3" cy="22" r="5"/><circle class="f" cx="11.7" cy="22" r="5"/><circle class="f" cx="9" cy="13.7" r="5"/><circle class="core" cx="16" cy="16" r="3.6"/>' },
    { id: 'puff', label: '叹气', svg: '<path class="f" d="M9.5 24a5 5 0 0 1-.8-9.9 7 7 0 0 1 13.4-2.4 5.6 5.6 0 0 1 1.6 12.3Z"/>' },
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
.igs-tl.is-emote .igs-tl-tile,.igs-tl.is-emote .igs-tl-cell.is-full{background:color-mix(in srgb,currentColor 10%,color-mix(in srgb,var(--igs-bar-ink,#fff) 35%,#fff));}
.igs-tl-ico{display:block;width:72%;height:auto;}
.igs-tl-ico .f{fill:currentColor;}
.igs-tl-ico .l{fill:none;stroke:currentColor;stroke-width:3.6;stroke-linecap:round;stroke-linejoin:round;}
.igs-tl-ico .l-thin{stroke-width:2.4;}
.igs-tl-ico .l-swirl{stroke-width:3;}
.igs-tl-ico .core{fill:#ffc629;}
.igs-tl.is-emote [data-emote="heart"]{color:#ff4f8f;}
.igs-tl.is-emote [data-emote="anger"]{color:#f03a47;}
.igs-tl.is-emote [data-emote="exclaim"]{color:#ff8a1f;}
.igs-tl.is-emote [data-emote="question"]{color:#16b9a6;}
.igs-tl.is-emote [data-emote="sparkle"]{color:#f5b800;}
.igs-tl.is-emote [data-emote="bolt"]{color:#ff9f0a;}
.igs-tl.is-emote [data-emote="clover"]{color:#36c46a;}
.igs-tl.is-emote [data-emote="sweat"]{color:#3aa6f5;}
.igs-tl.is-emote [data-emote="moon"]{color:#5a68ff;}
.igs-tl.is-emote [data-emote="note"]{color:#9a58ff;}
.igs-tl.is-emote [data-emote="swirl"]{color:#d64ee6;}
.igs-tl.is-emote [data-emote="flower"]{color:#ff7fb6;}
.igs-tl.is-emote [data-emote="puff"]{color:#7fb2e6;}
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

const SKIN_KEY = 'igs:wait-games:tiles-skin';

function storeOf(doc) {
    try { return (doc && doc.defaultView && doc.defaultView.localStorage) || null; } catch (error) { return null; }
}

export function readTilesSkin(doc) {
    let saved = '';
    try { saved = String(storeOf(doc)?.getItem(SKIN_KEY) || ''); } catch (error) { /* 读不到就用默认 */ }
    return TILES_SKINS.some((skin) => skin.id === saved) ? saved : TILES_SKINS[0].id;
}

function writeTilesSkin(doc, skin) {
    try { storeOf(doc)?.setItem(SKIN_KEY, skin); } catch (error) { /* 存不下只影响下次 */ }
}

// 一局里出现的牌种按出场顺序配上打乱后的情绪符号。
export function mapTilesEmotes(tiles, random = Math.random) {
    const emotes = shuffle(TILES_EMOTES, random);
    const map = new Map();
    for (const tile of tiles) if (!map.has(tile.kind)) map.set(tile.kind, emotes[map.size % emotes.length]);
    return map;
}

function fillFace(doc, node, id, emote) {
    if (emote) {
        node.setAttribute('data-emote', emote.id);
        node.setAttribute('aria-label', emote.label);
        node.innerHTML = `<svg class="igs-tl-ico" viewBox="0 0 32 32" aria-hidden="true">${emote.svg}</svg>`;
        return;
    }
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
    let skin = readTilesSkin(doc);
    const paintSkin = () => { root.className = `igs-tl is-${skin}`; };
    paintSkin();
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
        const emotes = mapTilesEmotes(tiles, ctx.random);
        const emoteOf = (kind) => (skin === 'emote' ? emotes.get(kind) : null);
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
        // 换牌面皮肤：只换画法，牌局不动；选择记在本机。
        const skinButton = doc.createElement('button');
        skinButton.type = 'button';
        skinButton.className = 'igs-ws-chip';
        tools.appendChild(skinButton);
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
                    fillFace(doc, cell, slot[i].kind, emoteOf(slot[i].kind));
                }
                slotRow.appendChild(cell);
            }
            help.disabled = !rescue || slot.length < 1;
            skinButton.textContent = `牌面：${(TILES_SKINS.find((item) => item.id === skin) || TILES_SKINS[0]).label}`;
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
            fillFace(doc, node, tile.kind, emoteOf(tile.kind));
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
        skinButton.addEventListener('click', () => {
            const at = TILES_SKINS.findIndex((item) => item.id === skin);
            skin = TILES_SKINS[(at + 1) % TILES_SKINS.length].id;
            writeTilesSkin(doc, skin);
            paintSkin();
            for (const tile of tiles) {
                const node = nodes.get(tile.id);
                node.innerHTML = '';
                if (node.removeAttribute) { node.removeAttribute('data-emote'); node.removeAttribute('aria-label'); }
                fillFace(doc, node, tile.kind, emoteOf(tile.kind));
            }
            refresh();
        });
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
