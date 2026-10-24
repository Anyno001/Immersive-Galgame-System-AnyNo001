// 偶像包的构建器：打歌舞台、直拍框、应援色灯海、选秀出道位、一位颁奖、签售会、狗仔偷拍、练习室镜墙、后台候场、应援手幅。
// 样式见 fx-idol-style.js，音效见 fx-idol-sfx.js，解析见 fx-idol-model.js。每个构建器返回 { node, life, layer, sounds }；
// env.reduced 时只出静态终态（动画由 .is-reduced 统一关掉），life 乘 env.hold。读立绘只经 stage-snapshot（读当前 DOM，跟随服装表情）。
import { esc } from './reader-value-utils.js';
import { noteGlyph } from './fx-glyphs.js';
import { charSpans, make } from './fx-daily-kit.js';
import { buildPanel } from './fx-panel-kit.js';
import { cloneSpriteLayer, layerStyle, readStageBackground, resolveHeadAnchor, spriteElOf } from './stage-snapshot.js';
import { BACKSTAGE_FIRST_MS, BACKSTAGE_STEP_MS, BPM_STEPS, DEBUT_STEP_MS, SHUTTER_STEP_MS, SIGN_STEP_MS } from './fx-idol-sfx.js';
import { DEFAULT_LIGHT_COLOR, parseRanks, resolveLightColor } from './fx-idol-model.js';

export const IDOL_LIFE_MS = Object.freeze({
    onstage: 5200, fancam: 5200, lightsea: 5600, debut: 4200, award: 4800, fansign: 4200,
    paparazzi: 3600, practice: 5400, backstage: 3000, banner: 5200,
});

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const num = (n) => Math.round(n * 10) / 10;
const PALETTE = Object.freeze(['#ff6fae', '#5fc8ff', '#ffd83a', '#9bff7a', '#c59bff']);

function el(doc, className, html = '', tag = 'div') {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (html) node.innerHTML = html;
    return node;
}

function shell(env, kind, extra = '') {
    return make(env.doc, ['igs-dfx', 'igs-id', `igs-id-${kind}`, extra, env.reduced ? 'is-reduced' : ''].filter(Boolean).join(' '));
}

const lifeOf = (kind, env, extra = 0) => Math.round((IDOL_LIFE_MS[kind] + extra) * (env.hold || 1));
const snap = (value, steps) => steps.reduce((best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best), steps[0]);

function headAt(env, who) {
    try {
        const a = resolveHeadAnchor(env, who);
        return { x: clamp(Number(a.x) || 50, 6, 94), y: clamp(Number(a.y) || 26, 8, 70) };
    } catch {
        return { x: 50, y: 26 };
    }
}

// 当前舞台的缩影：背景加指名角色立绘，外层 transform-origin 对准头部，由样式放大。
function miniature(env, who, className) {
    const zoom = el(env.doc, className);
    const stage = readStageBackground(env.root);
    if (stage.bg && stage.bg.visible) {
        const bg = el(env.doc, 'igs-id-mini-bg');
        bg.setAttribute('style', `${layerStyle(stage.bg)};position:absolute;inset:0;background-repeat:no-repeat`);
        zoom.appendChild(bg);
    }
    const sprite = cloneSpriteLayer(env.root, who, { speaker: env.speaker });
    if (sprite) zoom.appendChild(sprite);
    const head = headAt(env, who);
    zoom.setAttribute('style', `transform-origin:${num(head.x)}% ${num(head.y)}%`);
    return { zoom, head, hasSprite: Boolean(sprite) };
}

function liftSprite(env, who, delay) {
    const target = spriteElOf(env, who);
    if (!target || typeof target.animate !== 'function' || env.reduced) return;
    try {
        target.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: 'translate(0,-1.6%) scale(1.03)' }, { transform: 'translate(0,0) scale(1)' }], { duration: 700, delay, easing: 'ease-out', composite: 'add' });
    } catch { /* 元素不支持 WAAPI */ }
}

function timecode(env) {
    const t = Number(env.messageId) || 0;
    const two = (v) => String(v % 60).padStart(2, '0');
    return `${two(t * 3 + 7)}:${two(t * 11 + 20)}:${two(t * 5 + 9)}`;
}

// 金字塔座位行：1 / 2 / 3 个一行，人少时缩行。
function pyramidRows(count) {
    const shapes = { 2: [1, 1], 3: [1, 2], 4: [1, 2, 1], 5: [1, 2, 2], 6: [1, 2, 3] };
    return shapes[clamp(count, 2, 6)];
}

export const IDOL_BUILDERS = {
    // 打歌舞台登场：全场压暗，升降台从台下升起，两束舞台灯交扫，立绘剪影被点亮；安可版先有台下喊声与荧光棒。
    onstage(item, env) {
        const node = shell(env, 'onstage', item.encore ? 'is-encore' : '');
        const lead = item.encore ? 1700 : 0;
        node.style.setProperty('--igs-id-lead', `${lead}ms`);
        node.appendChild(el(env.doc, 'igs-id-os-scrim'));
        if (item.encore) {
            node.appendChild(el(env.doc, 'igs-id-os-chant', charSpans('安可！安可！', 150, 100)));
            node.appendChild(el(env.doc, 'igs-id-os-sticks'));
        }
        node.appendChild(el(env.doc, 'igs-id-os-beam is-a'));
        node.appendChild(el(env.doc, 'igs-id-os-beam is-b'));
        const head = headAt(env, item.who);
        const lit = el(env.doc, 'igs-id-os-lit');
        const sprite = cloneSpriteLayer(env.root, item.who, { speaker: env.speaker });
        if (sprite) lit.appendChild(sprite);
        lit.setAttribute('style', `transform-origin:${num(head.x)}% 100%`);
        node.appendChild(lit);
        node.appendChild(el(env.doc, 'igs-id-os-lift', '<i></i><i></i>'));
        node.appendChild(el(env.doc, 'igs-id-os-flash'));
        if (item.song) node.appendChild(el(env.doc, 'igs-id-os-song', `<small>NOW</small><b>${noteGlyph(0)} ${esc(item.song)}</b>`));
        liftSprite(env, item.who, lead + 1500);
        return { layer: 'front', life: lifeOf('onstage', env, lead), sounds: item.encore ? ['id-encore', 'id-lift'] : ['id-lift'], node };
    },

    // 直拍框：竖屏取景框里复刻当前立绘，轻晃跟拍，REC、时间码、电量，底部“××直拍”标题条。
    fancam(item, env) {
        const node = shell(env, 'fancam');
        const frame = el(env.doc, 'igs-id-fc-frame');
        const mini = miniature(env, item.who, 'igs-id-fc-zoom');
        const holder = el(env.doc, 'igs-id-fc-shake');
        holder.appendChild(mini.zoom);
        frame.appendChild(holder);
        frame.appendChild(el(env.doc, 'igs-id-fc-grid', '<i></i><i></i><i></i><i></i>'));
        frame.appendChild(el(env.doc, 'igs-id-fc-hud',
            `<span class="igs-id-fc-rec"><i></i>REC</span><span class="igs-id-fc-tc">${timecode(env)}</span><span class="igs-id-fc-batt"><i></i><i></i><i></i></span>`));
        const title = item.title || (item.who ? `${item.who} 直拍` : '直拍');
        frame.appendChild(el(env.doc, 'igs-id-fc-title', `<b>${esc(title)}</b><small>FANCAM</small>`));
        frame.appendChild(el(env.doc, 'igs-id-fc-focus'));
        node.appendChild(el(env.doc, 'igs-id-fc-dim'));
        node.appendChild(frame);
        return { layer: 'front', life: lifeOf('fancam', env), sounds: ['id-rec'], node };
    },

    // 应援色灯海：观众席整片换成应援色，前后三排荧光棒（共 18 根，各排按节拍同步摆动、排间错相），顶端一条应援名。
    lightsea(item, env) {
        const color = resolveLightColor(item.color);
        const node = shell(env, 'lightsea');
        node.style.setProperty('--c', color);
        node.appendChild(el(env.doc, 'igs-id-ls-wash'));
        // 三排荧光棒：每排一个元素，棒身与位置全在样式里（前排 4、中排 6、后排 8，共 18 根）。
        const rows = [0, 1, 2].map((r) => `<div class="igs-id-ls-row is-r${r}"></div>`).join('');
        node.appendChild(el(env.doc, 'igs-id-ls-crowd', rows));
        if (item.name) node.appendChild(el(env.doc, 'igs-id-ls-name', `<i></i><b>${esc(item.name)}</b><i></i>`));
        return { layer: 'stage', life: lifeOf('lightsea', env), sounds: ['id-lightsea'], node };
    },

    // 选秀出道位：金字塔座位从最末名次开始逐个揭晓亮起，第一名前停顿，再以金色收尾。
    debut(item, env) {
        const rows = parseRanks(item.rows.map((r) => `${r.name}:${r.rank}`).join(';'), 6).sort((a, b) => a.rank - b.rank);
        const n = rows.length;
        const board = buildPanel(env.doc, { title: item.title || '出道位', rows: [], tone: 'variety', skin: env.panelSkin, className: 'igs-id-db-board' });
        const tiers = el(env.doc, 'igs-id-db-tiers');
        const layout = pyramidRows(n);
        let cursor = 0;
        for (const size of layout) {
            const tier = el(env.doc, 'igs-id-db-tier');
            for (let k = 0; k < size; k += 1) {
                const row = rows[cursor];
                cursor += 1;
                if (!row) continue;
                const order = n - 1 - rows.indexOf(row);
                const delay = 800 + order * DEBUT_STEP_MS + (row.rank === rows[0].rank ? 500 : 0);
                const seat = el(env.doc, `igs-id-db-seat${row === rows[0] ? ' is-first' : ''}`, `<em>${row.rank}</em><b>${esc(row.name)}</b>`);
                seat.style.setProperty('--igs-id-d', `${delay}ms`);
                tier.appendChild(seat);
            }
            tiers.appendChild(tier);
        }
        board.appendChild(tiers);
        const node = shell(env, 'debut');
        node.appendChild(el(env.doc, 'igs-id-db-dim'));
        node.appendChild(board);
        const key = `id-debut${clamp(n, 2, 6)}`;
        return { layer: 'front', life: lifeOf('debut', env, n * DEBUT_STEP_MS), sounds: [key], node };
    },

    // 一位颁奖：（可选）一道细金线先展开；舞台柔光下“一位”逐字浮现，金色细光粒缓缓上升，获奖者名字在下方。文字让在人物远侧。
    award(item, env) {
        const lead = item.envelope ? 1900 : 0;
        const node = shell(env, 'award', item.envelope ? 'has-envelope' : '');
        node.style.setProperty('--igs-id-lead', `${lead}ms`);
        node.appendChild(el(env.doc, 'igs-id-aw-dim'));
        node.appendChild(el(env.doc, 'igs-id-aw-halo'));
        if (item.envelope) node.appendChild(el(env.doc, 'igs-id-aw-env', '<i></i>'));
        const motes = Array.from({ length: 14 }, (_, i) => `<i style="--x:${(i * 37 + 8) % 100}%;--d:${lead + 300 + (i % 7) * 260}ms;--w:${3 + (i % 3)}px"></i>`).join('');
        node.appendChild(el(env.doc, 'igs-id-aw-motes', motes));
        const plate = el(env.doc, 'igs-id-aw-plate');
        plate.appendChild(el(env.doc, 'igs-id-aw-word', charSpans(item.word || '一位', 120, lead + 700)));
        plate.appendChild(el(env.doc, 'igs-id-aw-rule'));
        if (item.who) plate.appendChild(el(env.doc, 'igs-id-aw-who', `<small>WINNER</small><b>${esc(item.who)}</b>`));
        node.appendChild(plate);
        return { layer: 'front', life: lifeOf('award', env, lead), sounds: item.envelope ? ['id-envelope', 'id-award'] : ['id-award'], node };
    },

    // 签售会：签名板上名字逐字被笔划写出，粉丝的便利贴留言从下方依次飘起贴住。
    fansign(item, env) {
        const node = shell(env, 'fansign');
        const chars = Array.from(item.name);
        const letters = chars.map((ch, i) => `<span style="--igs-id-d:${500 + i * SIGN_STEP_MS}ms">${esc(ch)}</span>`).join('');
        node.appendChild(el(env.doc, 'igs-id-fs-board', `<small>TO. YOU</small><div class="igs-id-fs-name">${letters}</div>`));
        const base = 600 + chars.length * SIGN_STEP_MS;
        item.notes.slice(0, 3).forEach((note, i) => {
            const sticky = el(env.doc, `igs-id-fs-note is-n${i}`, `<span>${esc(note)}</span>`);
            sticky.style.setProperty('--igs-id-d', `${base + i * 520}ms`);
            node.appendChild(sticky);
        });
        return { layer: 'front', life: lifeOf('fansign', env, chars.length * SIGN_STEP_MS), sounds: [`id-sign${clamp(chars.length, 1, 8)}`], node };
    },

    // 狗仔偷拍：长焦取景暗角，对焦框从大收紧锁住角色头部，快门连拍每次一闪，边缘有模糊的前景遮挡。
    paparazzi(item, env) {
        const node = shell(env, 'paparazzi');
        const head = headAt(env, item.who);
        const view = el(env.doc, 'igs-id-pp-view');
        view.appendChild(miniature(env, item.who, 'igs-id-pp-zoom').zoom);
        node.appendChild(view);
        node.appendChild(el(env.doc, 'igs-id-pp-vignette'));
        node.appendChild(el(env.doc, 'igs-id-pp-fg is-l', '<i></i><i></i><i></i>'));
        node.appendChild(el(env.doc, 'igs-id-pp-fg is-r', '<i></i><i></i>'));
        const focus = el(env.doc, 'igs-id-pp-focus', '<i class="is-tl"></i><i class="is-tr"></i><i class="is-bl"></i><i class="is-br"></i><b>AF</b>');
        focus.setAttribute('style', `left:${num(head.x)}%;top:min(${num(head.y + 4)}%,calc(var(--igs-fx-vis) - 8%))`);
        node.appendChild(focus);
        node.appendChild(el(env.doc, 'igs-id-pp-hud', `<span>1/500</span><span>F5.6</span><span class="igs-id-pp-count">×${item.shots}</span>`));
        const flashes = Array.from({ length: item.shots }, (_, i) => `<i style="animation-delay:${1000 + i * SHUTTER_STEP_MS}ms"></i>`).join('');
        node.appendChild(el(env.doc, 'igs-id-pp-flashes', flashes));
        return { layer: 'front', life: lifeOf('paparazzi', env, item.shots * SHUTTER_STEP_MS), sounds: [`id-shutter${clamp(item.shots, 3, 8)}`], node };
    },

    // 练习室镜墙：三面镜子各映出一个相位错开的角色（中间那面水平镜像），随节拍器上下律动。
    practice(item, env) {
        const bpm = snap(item.bpm, BPM_STEPS);
        const node = shell(env, 'practice');
        node.style.setProperty('--igs-id-beat', `${num(60000 / bpm)}ms`);
        const wall = el(env.doc, 'igs-id-pr-wall');
        for (let i = 0; i < 3; i += 1) {
            const pane = el(env.doc, `igs-id-pr-pane is-p${i}`);
            const inner = el(env.doc, 'igs-id-pr-inner');
            inner.style.setProperty('--igs-id-phase', `${-i * 0.33}`);
            const mini = miniature(env, item.who, `igs-id-pr-zoom${i === 1 ? ' is-flip' : ''}`);
            inner.appendChild(mini.zoom);
            pane.appendChild(inner);
            pane.appendChild(el(env.doc, 'igs-id-pr-glint'));
            wall.appendChild(pane);
        }
        node.appendChild(wall);
        node.appendChild(el(env.doc, 'igs-id-pr-rail'));
        node.appendChild(el(env.doc, 'igs-id-pr-bpm', `<b class="igs-id-pr-tick"></b><span>${noteGlyph(2)} = ${bpm}</span>`));
        return { layer: 'front', life: lifeOf('practice', env), sounds: [`id-metro${bpm}`], node };
    },

    // 后台候场：细金线镜框里是角色特写，右侧耳返依次跳出“3、2、1”，最后点亮“上台”。
    backstage(item, env) {
        const count = item.count;
        const node = shell(env, 'backstage');
        node.appendChild(el(env.doc, 'igs-id-bs-dim'));
        const mirror = el(env.doc, 'igs-id-bs-mirror');
        const mini = miniature(env, item.who, 'igs-id-bs-zoom');
        const glass = el(env.doc, 'igs-id-bs-glass');
        glass.appendChild(mini.zoom);
        mirror.appendChild(glass);
        node.appendChild(mirror);
        const digits = Array.from({ length: count }, (_, i) => `<b style="animation-delay:${BACKSTAGE_FIRST_MS + i * BACKSTAGE_STEP_MS}ms;animation-duration:${BACKSTAGE_STEP_MS}ms">${count - i}</b>`).join('');
        const goDelay = BACKSTAGE_FIRST_MS + count * BACKSTAGE_STEP_MS;
        node.appendChild(el(env.doc, 'igs-id-bs-ear', `<small>耳返 IN-EAR</small><div class="igs-id-bs-digits">${digits}<strong style="animation-delay:${goDelay}ms">上台</strong></div>`));
        return { layer: 'front', life: lifeOf('backstage', env, count * BACKSTAGE_STEP_MS), sounds: [`id-backstage${clamp(count, 3, 5)}`], node };
    },

    // 应援手幅：一到三块手幅 / 灯牌从画面下方先后升起，升到位后轻轻左右摇。
    banner(item, env) {
        const node = shell(env, 'banner');
        const lines = item.lines.length ? item.lines : ['加油'];
        const base = item.color ? resolveLightColor(item.color) : DEFAULT_LIGHT_COLOR;
        const total = lines.length;
        lines.forEach((line, i) => {
            const color = item.color || total === 1 ? base : PALETTE[i % PALETTE.length];
            const sign = el(env.doc, `igs-id-bn-sign is-s${i}`, `<div class="igs-id-bn-board"><span>${esc(line)}</span><em></em></div><i class="igs-id-bn-stick"></i>`);
            sign.style.setProperty('--c', color);
            sign.style.setProperty('--igs-id-d', `${i * 380}ms`);
            sign.style.setProperty('--x', `${total === 1 ? 50 : 22 + i * (56 / Math.max(1, total - 1))}%`);
            node.appendChild(sign);
        });
        return { layer: 'front', life: lifeOf('banner', env, total * 380), sounds: ['id-banner'], node };
    },
};
