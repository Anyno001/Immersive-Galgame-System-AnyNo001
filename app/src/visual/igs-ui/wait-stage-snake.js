// 等待过场小游戏：贪吃蛇。一张 canvas，颜色取自主题变量，循环只走 ctx.timers。

export const SNAKE_COLS = 16;
export const SNAKE_ROWS = 16;

const DIRS = Object.freeze({
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
});
const OPPOSITE = Object.freeze({ up: 'down', down: 'up', left: 'right', right: 'left' });

export function isOpposite(a, b) {
    return OPPOSITE[a] === b;
}

function pickFood(cols, rows, snake, random) {
    const taken = new Set(snake.map((cell) => cell.y * cols + cell.x));
    const free = [];
    for (let i = 0; i < cols * rows; i += 1) if (!taken.has(i)) free.push(i);
    if (!free.length) return null;
    const index = free[Math.min(free.length - 1, Math.floor(random() * free.length))];
    return { x: index % cols, y: Math.floor(index / cols) };
}

// 蛇头在数组首位，开局三节、朝右，居中偏左。
export function createSnakeState(cols = SNAKE_COLS, rows = SNAKE_ROWS, random = Math.random) {
    const y = Math.floor(rows / 2);
    const x = Math.max(2, Math.floor(cols / 3));
    const snake = [{ x, y }, { x: x - 1, y }, { x: x - 2, y }];
    return { cols, rows, snake, dir: 'right', food: pickFood(cols, rows, snake, random), score: 0, alive: true, won: false };
}

// 走一步，返回新状态（不改入参）。反向的指令忽略，沿用原方向。
export function stepSnake(state, dir, random = Math.random) {
    if (!state || !state.alive) return state;
    const turn = DIRS[dir] && !isOpposite(state.dir, dir) ? dir : state.dir;
    const vec = DIRS[turn];
    const head = state.snake[0];
    const next = { x: head.x + vec.x, y: head.y + vec.y };
    if (next.x < 0 || next.y < 0 || next.x >= state.cols || next.y >= state.rows) {
        return { ...state, dir: turn, alive: false };
    }
    const eat = Boolean(state.food) && next.x === state.food.x && next.y === state.food.y;
    // 不吃食物时尾巴同时挪走，允许头进入原尾巴的格子。
    const body = eat ? state.snake : state.snake.slice(0, -1);
    if (body.some((cell) => cell.x === next.x && cell.y === next.y)) {
        return { ...state, dir: turn, alive: false };
    }
    const snake = [next, ...body];
    if (!eat) return { ...state, snake, dir: turn };
    const food = pickFood(state.cols, state.rows, snake, random);
    return { ...state, snake, dir: turn, food, score: state.score + 1, won: !food, alive: Boolean(food) };
}

// 越长越快，设下限避免手忙脚乱。
export function snakeDelay(length) {
    return Math.max(80, 180 - Math.max(0, length - 3) * 4);
}

const KEY_DIR = Object.freeze({
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right',
});

export function snakeKeyDir(key) {
    return KEY_DIR[key] || '';
}

function parseColor(text, fallback) {
    const raw = String(text || '').trim();
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
    if (m) {
        const hex = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
        return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
    m = /^rgba?\(\s*(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/i.exec(raw);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
    // color-mix 等算出来的值，浏览器可能报成 color(srgb r g b)，分量是 0–1。
    m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i.exec(raw);
    if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255];
    return fallback;
}

function rgba(rgb, alpha) {
    return `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${alpha})`;
}

function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

export const SNAKE_STYLE = `
.igs-snake{display:flex;flex-direction:column;align-items:center;gap:10px;width:100%;}
.igs-snake-probe{position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;}
.igs-snake-probe.is-ink{color:var(--igs-bar-ink,#e8e5df);}
.igs-snake-probe.is-bg{color:var(--igs-dialog-bg,#1f2225);}
.igs-snake-canvas{display:block;box-sizing:border-box;width:min(100%,320px);aspect-ratio:1/1;border-radius:10px;background:color-mix(in srgb,var(--igs-dialog-bg,#1f2225) 80%,var(--igs-bar-ink,#e8e5df) 6%);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--igs-bar-ink,#e8e5df) 14%,transparent);touch-action:none;-webkit-tap-highlight-color:transparent;}
.igs-snake-pad{display:grid;grid-template-columns:repeat(3,44px);grid-template-rows:repeat(2,36px);gap:6px;justify-content:center;}
.igs-snake-pad .igs-ws-chip{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:0;font-size:15px;}
.igs-snake-pad .is-up{grid-column:2;grid-row:1;}
.igs-snake-pad .is-left{grid-column:1;grid-row:2;}
.igs-snake-pad .is-down{grid-column:2;grid-row:2;}
.igs-snake-pad .is-right{grid-column:3;grid-row:2;}
.igs-snake-ctl{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;}
.igs-snake-ctl .igs-ws-chip{height:34px;padding:0 18px;font-size:13px;}
.igs-snake-ctl [hidden]{display:none;}
@media (max-width:480px){
.igs-snake-canvas{width:100%;}
}
@media (prefers-reduced-motion: reduce){
.igs-snake-canvas{transition:none;}
}
`;

const ARROWS = [['up', '↑'], ['left', '←'], ['down', '↓'], ['right', '→']];
const SWIPE_MIN = 24;

function isTyping(target) {
    if (!target) return false;
    const tag = String(target.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target.isContentEditable);
}

export function startSnake(ctx) {
    if (!ctx || !ctx.doc || !ctx.board) return null;
    const { doc, board } = ctx;
    const view = doc.defaultView || globalThis;
    const timers = ctx.timers || globalThis;
    const random = typeof ctx.random === 'function' ? ctx.random : Math.random;

    board.innerHTML = '';
    const head = doc.createElement('div');
    head.className = 'igs-ws-board-head';
    const title = doc.createElement('span');
    title.textContent = '贪吃蛇';
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'igs-ws-close';
    close.textContent = '✕';
    head.appendChild(title);
    head.appendChild(close);
    board.appendChild(head);

    const status = doc.createElement('div');
    status.className = 'igs-ws-status';
    board.appendChild(status);

    const root = doc.createElement('div');
    root.className = 'igs-snake';
    const canvas = doc.createElement('canvas');
    canvas.className = 'igs-snake-canvas';
    root.appendChild(canvas);

    const ctl = doc.createElement('div');
    ctl.className = 'igs-snake-ctl';
    const makeChip = (label) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'igs-ws-chip';
        button.textContent = label;
        ctl.appendChild(button);
        return button;
    };
    const startBtn = makeChip('开始');
    const pauseBtn = makeChip('暂停');
    pauseBtn.hidden = true;
    const againBtn = makeChip('再来一局');
    againBtn.hidden = true;
    root.appendChild(ctl);

    const pad = doc.createElement('div');
    pad.className = 'igs-snake-pad';
    for (const [dir, label] of ARROWS) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = `igs-ws-chip is-${dir}`;
        button.textContent = label;
        button.setAttribute('aria-label', dir);
        button.addEventListener('click', () => queueDir(dir));
        pad.appendChild(button);
    }
    root.appendChild(pad);
    board.appendChild(root);

    let state = createSnakeState(SNAKE_COLS, SNAKE_ROWS, random);
    let phase = 'idle'; // idle | run | pause | over
    let queue = [];
    let timer = null;
    let pulseTimer = null;
    let disposed = false;
    let tick = 0;
    let best = 0;
    let palette = null;
    let reduceMotion = false;
    try { reduceMotion = Boolean(view.matchMedia && view.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (error) { reduceMotion = false; }

    const alive = () => !disposed && board.hidden !== true && (board.isConnected !== false) && board.contains(root);

    // 主题变量可能写成 color-mix / var()，用探针元素让浏览器算成实际颜色再读。
    function probeColor(kind) {
        const probe = doc.createElement('span');
        probe.className = `igs-snake-probe is-${kind}`;
        root.appendChild(probe);
        let value = '';
        try { value = view.getComputedStyle(probe).color; } catch (error) { value = ''; }
        probe.remove();
        return value;
    }

    function readPalette() {
        const ink = parseColor(probeColor('ink'), [232, 229, 223]);
        const bg = parseColor(probeColor('bg'), [31, 34, 37]);
        palette = { ink, bg };
    }

    function fit() {
        const css = canvas.clientWidth || canvas.offsetWidth || 320;
        const dpr = Math.min(2, view.devicePixelRatio || 1);
        const px = Math.max(160, Math.round(css * dpr));
        if (canvas.width !== px) {
            canvas.width = px;
            canvas.height = px;
        }
    }

    function setStatus(text) {
        status.textContent = text;
    }

    function summary() {
        const length = state.snake.length;
        return `长度 ${length} · 得分 ${state.score}` + (best ? ` · 最高 ${best}` : '');
    }

    function draw() {
        if (!canvas.getContext) return;
        const g = canvas.getContext('2d');
        if (!g) return;
        if (!palette) readPalette();
        fit();
        const size = canvas.width;
        const cell = size / state.cols;
        const { ink, bg } = palette;
        g.clearRect(0, 0, size, size);
        // 棋盘暗纹
        for (let y = 0; y < state.rows; y += 1) {
            for (let x = 0; x < state.cols; x += 1) {
                if ((x + y) % 2) continue;
                g.fillStyle = rgba(ink, 0.05);
                g.fillRect(x * cell, y * cell, cell, cell);
            }
        }
        // 食物：带呼吸的圆点加外圈
        if (state.food) {
            const breath = reduceMotion ? 0.5 : (Math.sin(tick / 2.5) + 1) / 2;
            const cx = (state.food.x + 0.5) * cell;
            const cy = (state.food.y + 0.5) * cell;
            g.fillStyle = rgba(ink, 0.18 + breath * 0.14);
            g.beginPath();
            g.arc(cx, cy, cell * (0.42 + breath * 0.06), 0, Math.PI * 2);
            g.fill();
            g.fillStyle = rgba(ink, 0.95);
            g.beginPath();
            g.arc(cx, cy, cell * (0.24 + breath * 0.03), 0, Math.PI * 2);
            g.fill();
        }
        // 蛇身：从头到尾渐淡，圆角方块互相略有重叠
        const total = state.snake.length;
        const pad = cell * 0.06;
        for (let i = total - 1; i >= 0; i -= 1) {
            const part = state.snake[i];
            const fade = total > 1 ? 1 - (i / (total - 1)) * 0.45 : 1;
            const dead = !state.alive && phase === 'over';
            g.fillStyle = rgba(ink, (dead ? 0.55 : 1) * fade);
            roundRect(g, part.x * cell + pad, part.y * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.3);
            g.fill();
        }
        // 蛇头眼睛，用底色挖出来
        const first = state.snake[0];
        const vec = DIRS[state.dir];
        const hx = (first.x + 0.5) * cell;
        const hy = (first.y + 0.5) * cell;
        g.fillStyle = rgba(bg, 0.92);
        for (const side of [-1, 1]) {
            const ex = hx + vec.x * cell * 0.16 - vec.y * side * cell * 0.19;
            const ey = hy + vec.y * cell * 0.16 + vec.x * side * cell * 0.19;
            g.beginPath();
            g.arc(ex, ey, cell * 0.07, 0, Math.PI * 2);
            g.fill();
        }
        if (phase === 'pause' || phase === 'idle') {
            g.fillStyle = rgba(bg, 0.35);
            g.fillRect(0, 0, size, size);
        }
    }

    function clearLoop() {
        if (timer != null) { timers.clearTimeout(timer); timer = null; }
        if (pulseTimer != null) { timers.clearTimeout(pulseTimer); pulseTimer = null; }
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        clearLoop();
        doc.removeEventListener('keydown', onKey, true);
        doc.removeEventListener('visibilitychange', onVisibility);
    }

    function hiddenPage() {
        return doc.hidden === true || doc.visibilityState === 'hidden';
    }

    function schedule() {
        if (disposed || phase !== 'run') return;
        timer = timers.setTimeout(loop, snakeDelay(state.snake.length));
    }

    function loop() {
        timer = null;
        if (!alive()) { dispose(); return; }
        if (phase !== 'run') return;
        if (hiddenPage()) { pause(); return; }
        const dir = queue.length ? queue.shift() : state.dir;
        tick += 1;
        state = stepSnake(state, dir, random);
        if (!state.alive) { finish(); return; }
        setStatus(summary());
        draw();
        schedule();
    }

    // 食物呼吸：只在运行/暂停以外的静止画面不重绘，运行中随步进重绘，所以无需单独循环。
    function finish() {
        phase = 'over';
        clearLoop();
        best = Math.max(best, state.score);
        setStatus(state.won ? `铺满了！得分 ${state.score}` : `撞到了。${summary()}`);
        pauseBtn.hidden = true;
        againBtn.hidden = false;
        draw();
        ctx.markDone();
        try { ctx.setNote(state.won ? '……全满了，厉害。' : '再来一局？'); } catch (error) { /* 提示失败不影响这一局 */ }
    }

    function start() {
        state = createSnakeState(SNAKE_COLS, SNAKE_ROWS, random);
        queue = [];
        palette = null; // 每局重新取色，中途换皮肤也跟得上。
        phase = 'run';
        startBtn.hidden = true;
        againBtn.hidden = true;
        pauseBtn.hidden = false;
        pauseBtn.textContent = '暂停';
        setStatus(summary());
        draw();
        clearLoop();
        schedule();
    }

    function pause() {
        if (phase !== 'run') return;
        phase = 'pause';
        clearLoop();
        pauseBtn.textContent = '继续';
        setStatus('已暂停。' + summary());
        draw();
    }

    function resume() {
        if (phase !== 'pause') return;
        phase = 'run';
        pauseBtn.textContent = '暂停';
        setStatus(summary());
        schedule();
    }

    function queueDir(dir) {
        if (phase !== 'run') return;
        const last = queue.length ? queue[queue.length - 1] : state.dir;
        if (dir === last || isOpposite(last, dir)) return;
        if (queue.length < 2) queue.push(dir);
    }

    function onKey(event) {
        if (!alive()) { dispose(); return; }
        if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
        const dir = snakeKeyDir(event.key);
        if (dir && phase === 'run') {
            event.preventDefault();
            queueDir(dir);
        } else if ((event.key === ' ' || event.key === 'p' || event.key === 'P') && (phase === 'run' || phase === 'pause')) {
            event.preventDefault();
            if (phase === 'run') pause(); else resume();
        }
    }

    function onVisibility() {
        if (hiddenPage() && phase === 'run') pause();
    }

    // 触屏滑动
    let touch = null;
    canvas.addEventListener('touchstart', (event) => {
        const point = event.touches && event.touches[0];
        touch = point ? { x: point.clientX, y: point.clientY } : null;
    }, { passive: true });
    canvas.addEventListener('touchmove', (event) => {
        if (phase === 'run' && event.cancelable) event.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', (event) => {
        const point = event.changedTouches && event.changedTouches[0];
        if (!touch || !point) return;
        const dx = point.clientX - touch.x;
        const dy = point.clientY - touch.y;
        touch = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
        queueDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }, { passive: true });

    startBtn.addEventListener('click', start);
    againBtn.addEventListener('click', start);
    pauseBtn.addEventListener('click', () => { if (phase === 'run') pause(); else resume(); });
    close.addEventListener('click', () => { dispose(); ctx.requestClose(); });
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('visibilitychange', onVisibility);

    setStatus('方向键 / WASD / 滑动控制，吃到圆点变长。');
    try { ctx.setNote('闲着也是闲着，来一局？'); } catch (error) { /* 同上 */ }
    draw();
    return { dispose, get state() { return state; } };
}
