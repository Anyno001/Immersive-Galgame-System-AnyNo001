// 牌桌自己摆画面：画布、头像、气泡、手牌、按钮、工具栏、结算卡、出牌标记、惩罚表单、惩罚图、相册。
// 立直和成都只交局面。手机防抖照原样：CPU 画布、气泡和按钮硬切、头像节点不重建、同一次询问的按钮不重画。
import { ORIGINAL_READER_ICONS as ICONS } from './reader-icons.js';

const CG_KEY = 'igs-wait-mahjong-cg-v1';
const CG_LIMIT = 60;

function shelf(ctx) {
    if (ctx && ctx.storage) return ctx.storage;
    try { return globalThis.localStorage || null; } catch (error) { return null; }
}

function readCgs(storage) {
    if (!storage || typeof storage.getItem !== 'function') return [];
    try {
        const list = JSON.parse(storage.getItem(CG_KEY) || '[]');
        return Array.isArray(list) ? list.filter((item) => item && item.id) : [];
    } catch (error) {
        return [];
    }
}

function rememberCg(storage, entry) {
    if (!storage || typeof storage.setItem !== 'function' || !entry.id) return;
    const list = [entry, ...readCgs(storage)].slice(0, CG_LIMIT);
    try { storage.setItem(CG_KEY, JSON.stringify(list)); } catch (error) { /* 存满了就只是相册少记一张，图还在 CG 库。 */ }
}

function keptPrompt(result) {
    const prompt = result && result.prompt;
    const clip = (text) => String(text || '').slice(0, 4000);
    if (!prompt && !result.request) return undefined;
    return { positive: clip(prompt && prompt.positive), negative: clip(prompt && prompt.negative), request: clip(result.request) };
}

function savePicture(doc, url, caption) {
    if (!url || !doc) return;
    const type = (String(url).match(/^data:image\/(png|jpeg|webp|gif)/) || [])[1] || 'png';
    const link = doc.createElement('a');
    link.href = url;
    link.download = `${String(caption || '惩罚CG').replace(/[\\/:*?"<>|\s·]+/g, '_').slice(0, 40)}.${type === 'jpeg' ? 'jpg' : type}`;
    (doc.body || doc.documentElement).appendChild(link);
    link.click();
    link.remove();
}

function watchVisible(doc) {
    const View = doc.defaultView && doc.defaultView.IntersectionObserver;
    if (typeof View !== 'function') return null;
    const jobs = new Map();
    const observer = new View((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const job = jobs.get(entry.target);
            jobs.delete(entry.target);
            observer.unobserve(entry.target);
            if (job) job();
        }
    }, { rootMargin: '160px 0px' });
    return (node, job) => {
        jobs.set(node, job);
        observer.observe(node);
    };
}

function dom(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function press(doc, className, text) {
    const node = dom(doc, 'button', className, text);
    node.type = 'button';
    return node;
}

const CROP_PER_WIDTH = 0.72;
let imageLoader = null;

export function setMahjongImageLoader(loader) {
    imageLoader = typeof loader === 'function' ? loader : null;
}

export function avatarCrop(width, height, head, aspect = 1, reach = 0.5, headroom = 0.45) {
    const fit = (w, h) => {
        if (w > width) [w, h] = [width, width / aspect];
        if (h > height) [w, h] = [height * aspect, height];
        return [w, h];
    };
    if (head && [head.x, head.top, head.w, head.hh].every(Number.isFinite) && head.w > 0) {
        const headW = head.w * width;
        const headH = head.hh * width;
        const tall = Math.max(headH * 2.3 * (reach / 0.5), (headW * 2) / aspect);
        const [w, h] = fit(tall * aspect, tall);
        const x = Math.min(Math.max(head.x * width - w / 2, 0), width - w);
        const y = Math.min(Math.max(head.top * height - headH * headroom, 0), height - h);
        return { x, y, w, h };
    }
    const band = Math.min(height * reach, width * CROP_PER_WIDTH * (reach / 0.5));
    if (width / band >= aspect) return { x: (width - band * aspect) / 2, y: 0, w: band * aspect, h: band };
    const [w, h] = fit(width, width / aspect);
    return { x: 0, y: 0, w, h };
}

export function faceFor(person, mood) {
    const faces = person && person.faces;
    const face = faces && (faces[mood] || faces['平和']);
    if (face && face.url) return face;
    return person && person.url ? { url: person.url } : null;
}

export function cropInto(doc, frame, face, onReady, shape = {}) {
    const img = dom(doc, 'img', 'igs-mj-crop');
    img.alt = '';
    img.decoding = 'async';
    let placed = false;
    const place = () => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        if (placed || !(width > 0 && height > 0)) return;
        placed = true;
        const box = (shape.boxFor && shape.boxFor(width, height, face))
            || avatarCrop(width, height, face.head, shape.aspect, shape.reach, shape.headroom);
        img.style.width = `${(width / box.w) * 100}%`;
        img.style.left = `${(-box.x / box.w) * 100}%`;
        img.style.top = `${(-box.y / box.h) * 100}%`;
        const show = () => {
            img.className = 'igs-mj-crop is-ready';
            // 立绘多是透明底，首字不藏起来会从图后面透出来。
            const initial = frame.querySelector('.igs-mj-initial');
            if (initial) initial.hidden = true;
            if (onReady) onReady(img);
        };
        if (typeof img.decode === 'function') img.decode().then(show, show);
        else show();
    };
    img.addEventListener('load', place);
    img.addEventListener('error', () => img.remove());
    frame.appendChild(img);
    const apply = (src) => { if (src) img.src = src; else img.remove(); };
    const value = imageLoader ? imageLoader(face.url) : face.url;
    if (typeof value === 'string') apply(value);
    else Promise.resolve(value).then(apply, () => img.remove());
    if (img.complete) place();
    return img;
}

function avatarNode(doc, person, name, mood) {
    const frame = dom(doc, 'div', 'igs-mj-avatar');
    const face = dom(doc, 'div', 'igs-mj-face');
    face.appendChild(dom(doc, 'span', 'igs-mj-initial', String(name || '?').slice(0, 1)));
    const shot = faceFor(person, mood || '平和');
    if (shot) cropInto(doc, face, shot);
    frame.appendChild(face);
    return frame;
}

function iconButton(doc, glyph, title, run) {
    const node = press(doc, 'igs-mj-icon');
    node.innerHTML = glyph;
    node.title = title;
    node.setAttribute('aria-label', title);
    if (run) {
        node.addEventListener('click', (event) => {
            event.stopPropagation();
            run(node);
        });
    }
    return node;
}

// 受罚的人、动手的人、旁观的人。present 是这一桌的角色；没交 present 时只画受罚的人，和原来一样。
function penaltyCast({ targets, target, punisher, present = null, stage = 'hand', basis = '' } = {}) {
    const list = (Array.isArray(targets) && targets.length ? targets : [target]).filter(Boolean);
    const self = list.includes('你');
    const others = list.filter((name) => name !== '你');
    const names = others.join('、');
    const final = stage === 'final';
    const negative = basis === 'negative';
    const low = negative ? (final ? '终局总分为负' : '这一局分数为负') : (final ? '垫底' : '这一局输得最多');
    const tie = negative ? (final ? '终局总分都为负' : '这一局分数都为负') : (final ? '并列垫底' : '这一局输得一样多');
    const top = final ? `第一名的${punisher}` : `这一局赢分的${punisher}`;
    const seated = (Array.isArray(present) ? present : []).filter((name) => name && name !== '你');
    const spectators = seated.filter((name) => name !== punisher && !others.includes(name));
    const drawn = [];
    const push = (name) => {
        if (name && name !== '你' && !drawn.includes(name)) drawn.push(name);
    };
    if (seated.length) {
        if (punisher && punisher !== '你') push(punisher);
        others.forEach(push);
        spectators.forEach(push);
    } else {
        if (self) push(punisher);
        others.forEach(push);
    }
    return { self, others, names, spectators, drawn, seated, low, tie, top, final };
}

// 惩罚图要写给画图的那段话。scene 是这一场的那一句，由牌局交进来。
// present 里的每名女性要么受罚、要么旁观、要么动手，三人都要入镜。
export function pictureBrief({ targets, target, punisher, request, nsfw = false, stage = 'hand', outfits = {}, scene = '', present = null, basis = '' }) {
    const cast = penaltyCast({ targets, target, punisher, present, stage, basis });
    const { self, others, names, spectators, drawn, seated, low, tie, top } = cast;
    const worn = Object.fromEntries(drawn.filter((name) => outfits && outfits[name]).map((name) => [name, outfits[name]]));
    const extra = String(request || '').trim();
    let who;
    if (self && others.length) who = `玩家（主角）和${names}${tie}，由${top}来惩罚他们。画面以${punisher}和${names}为主体，主角只以第一人称视角或局部入镜，不露脸。`;
    else if (self) who = `玩家（主角）${low}，由${top}来惩罚主角。画面以${punisher}为主体，主角只以第一人称视角或局部入镜，不露脸。`;
    else if (others.length > 1) who = `${names}${tie}，一起接受惩罚游戏。画面以${names}为主体，每个人都要入镜。`;
    else who = `${names}${low}，正在接受惩罚游戏。画面以${names}为主体。`;
    if (seated.length) {
        const watching = spectators.length ? spectators.join('、') : '没有';
        const punished = others.length ? others.join('、') : '没有';
        const actor = punisher && punisher !== '你'
            ? `${punisher}在画面里动手执行惩罚，她不是旁观，也不是受罚。`
            : '玩家动手时只以第一人称或局部入镜，不露脸。';
        who += `在场的女性角色${seated.join('、')}必须全部入镜，每人只处于一种状态：受惩罚的是${punished}，旁观的是${watching}。${actor}旁观的人站在旁边看，要画出她们的表情和反应，不能省略，也不能画成一起受罚。`;
    }
    const how = self
        ? `怎么罚由${punisher}按她的性格自己决定，画出她正在惩罚${others.length ? '大家' : '主角'}的那一刻。${extra ? `\n玩家补充：${extra}` : ''}`
        : `惩罚内容：${extra}`;
    const fidelity = extra
        ? '\n写词要求：把玩家写下的内容最大化地细化。按照玩家写的方向补细节，画的就是这一幕。不要另画一张意思相近的图，不要替换玩家指定的人物、动作和情节。'
        : '';
    const label = self ? `${punisher}罚你${others.length ? `和${names}` : ''}` : names;
    return {
        characters: drawn,
        outfits: worn,
        strip: nsfw ? others : [],
        description: `${scene}，${who}\n${how}${fidelity}`,
        caption: `麻将惩罚 · ${label} · ${extra || `由${punisher}决定`}`.slice(0, 60),
    };
}

function cgStage(doc, { lead = [], tail = [] } = {}) {
    const node = dom(doc, 'div', 'igs-mj-cgview');
    const img = dom(doc, 'img');
    img.alt = '';
    img.decoding = 'async';
    const bar = dom(doc, 'div', 'igs-mj-cgbar');
    const note = dom(doc, 'div', 'igs-mj-cgnote');
    const panel = dom(doc, 'div', 'igs-mj-cgprompt');
    panel.hidden = true;
    let current = {};
    const icon = (glyph, title, run) => iconButton(doc, glyph, title, run);
    const leads = lead.map((tool) => icon(tool.icon, tool.title, tool.run));
    const promptButton = icon(ICONS.promptText, '查看提示词', () => {
        panel.hidden = !panel.hidden;
        promptButton.setAttribute('aria-pressed', String(!panel.hidden));
    });
    const saveButton = icon(ICONS.save, '保存图片', () => savePicture(doc, current.url, current.caption));
    const groups = [leads, [promptButton, saveButton], tail.map((tool) => icon(tool.icon, tool.title, tool.run))].filter((group) => group.length);
    groups.forEach((group, index) => {
        if (index) bar.appendChild(dom(doc, 'span', 'igs-mj-cgbar-gap'));
        group.forEach((item) => bar.appendChild(item));
    });
    node.appendChild(img);
    node.appendChild(panel);
    node.appendChild(note);
    node.appendChild(bar);
    const say = (text, error) => {
        note.textContent = text || '';
        note.className = `igs-mj-cgnote${error ? ' is-error' : ''}`;
    };
    return {
        node,
        show(shot) {
            current = shot || {};
            img.src = current.url || '';
            img.alt = current.caption || '';
            panel.textContent = '';
            const prompt = current.prompt || {};
            const parts = [['正向提示词', prompt.positive], ['负向提示词', prompt.negative], ['交给写词的要求', current.request || prompt.request]]
                .filter(([, text]) => String(text || '').trim());
            for (const [label, text] of parts) {
                panel.appendChild(dom(doc, 'b', '', label));
                panel.appendChild(dom(doc, 'p', '', String(text).trim()));
            }
            promptButton.disabled = !parts.length;
            if (!parts.length) panel.hidden = true;
            leads.forEach((item) => { item.disabled = false; });
            say(current.note);
        },
        busy(text) {
            leads.forEach((item) => { item.disabled = true; });
            say(text);
        },
        fail(text) {
            leads.forEach((item) => { item.disabled = false; });
            say(text, true);
        },
    };
}

function albumSheet(ctx, list, onClose) {
    const { doc } = ctx;
    const root = dom(doc, 'div', 'igs-mj-album');
    const head = dom(doc, 'div', 'igs-mj-album-head');
    head.appendChild(dom(doc, 'span', '', `惩罚相册 · ${list.length} 张`));
    const close = press(doc, 'igs-mj-album-close', '✕');
    head.appendChild(close);
    root.appendChild(head);
    const grid = dom(doc, 'div', 'igs-mj-album-grid');
    const lazy = watchVisible(doc);
    const urls = new Map();
    const show = (entry) => {
        const url = urls.get(entry.id);
        if (!url) return;
        const viewer = cgStage(doc, { tail: [{ icon: ICONS.close, title: '返回相册', run() { viewer.node.remove(); } }] });
        viewer.show({ url, caption: entry.caption, prompt: entry.prompt, note: entry.caption });
        root.appendChild(viewer.node);
    };
    for (const entry of list) {
        const item = press(doc, 'igs-mj-album-item');
        item.title = entry.caption || '';
        const pic = dom(doc, 'span', 'igs-mj-album-pic');
        item.appendChild(pic);
        item.appendChild(dom(doc, 'span', 'igs-mj-album-cap', entry.caption || ''));
        if (entry.nsfw) item.appendChild(dom(doc, 'span', 'igs-mj-album-tag', '成人向'));
        const load = () => Promise.resolve(ctx.penalty.read(entry.id)).then((got) => {
            if (!got || !got.ok || !got.url) {
                pic.textContent = 'CG 库里已经没有这张';
                return;
            }
            urls.set(entry.id, got.url);
            const img = dom(doc, 'img');
            img.alt = '';
            img.src = got.url;
            pic.appendChild(img);
        }).catch(() => { pic.textContent = '读不到这张图'; });
        if (lazy) lazy(item, load);
        else load();
        item.addEventListener('click', () => show(entry));
        grid.appendChild(item);
    }
    root.appendChild(grid);
    close.addEventListener('click', () => {
        root.remove();
        if (onClose) onClose();
    });
    return root;
}

export function openMahjongAlbum(ctx, container, cover) {
    const api = ctx && ctx.penalty;
    if (!api || typeof api.read !== 'function' || !container) return null;
    const open = press(ctx.doc, 'igs-ws-chip igs-mj-album-open', '惩罚相册');
    const refresh = () => {
        const count = readCgs(shelf(ctx)).length;
        open.textContent = `惩罚相册 ${count}`;
        open.hidden = !count;
    };
    open.addEventListener('click', () => {
        const restore = cover ? cover() : null;
        container.appendChild(albumSheet(ctx, readCgs(shelf(ctx)), restore));
    });
    open.refresh = refresh;
    refresh();
    return open;
}

const BEAT = new Set(['discard', 'riichi', 'call', 'kan', 'draw', 'win', 'lose', 'dealin']);

function pondOf(seat) {
    return (seat && seat.pond ? seat.pond : []).map((tile) => (
        typeof tile === 'string' ? { code: tile, spent: false } : { code: tile.code || '', spent: Boolean(tile.spent) }
    ));
}

function meldSizes(seat) {
    return (seat && seat.melds ? seat.melds : []).map((group) => group.length);
}

function winKey(win) {
    return `${win.seat}:${win.kind}:${win.from}:${win.key || ''}`;
}

// 前后两幅局面差出声音。第一幅不把已经在河里的牌当成刚打出。
export function mahjongBeat(before, after) {
    const sounds = [];
    if (!after) return { sounds, beat: false };
    const seats = after.seats || [];
    const opening = (scene) => {
        const rows = (scene && scene.seats) || [];
        return scene && scene.left != null && !rows.some((seat) => pondOf(seat).length)
            && rows.some((seat) => seat.hand && (seat.hand.zimo || seat.hand.backs || (seat.hand.tiles || []).length));
    };
    if (opening(after) && !opening(before)) return { sounds: ['deal'], beat: false };
    if (!before) return { sounds, beat: false };
    const seen = new Set((before.wins || []).map(winKey));
    seats.forEach((seat, index) => {
        const was = (before.seats || [])[index] || {};
        const pond = pondOf(seat);
        const prevPond = pondOf(was);
        if (pond.length > prevPond.length) {
            const tile = pond[pond.length - 1];
            sounds.push(/[*]/.test(tile.code) ? 'riichi' : 'discard');
        }
        const sizes = meldSizes(seat);
        const prevSizes = meldSizes(was);
        if (sizes.length > prevSizes.length) sounds.push(sizes[sizes.length - 1] >= 4 ? 'kan' : 'call');
        else if (sizes.some((size, at) => size >= 4 && size > (prevSizes[at] || 0))) sounds.push('kan');
        const zimo = seat.hand && seat.hand.zimo || '';
        const prevZimo = was.hand && was.hand.zimo || '';
        if (index === 0 && zimo && zimo !== prevZimo) sounds.push('draw');
    });
    for (const win of after.wins || []) {
        if (seen.has(winKey(win))) continue;
        sounds.push(win.seat === 0 ? 'win' : (win.from === 0 && win.kind !== 'zimo' ? 'dealin' : 'lose'));
    }
    if (after.end && after.end !== before.end) sounds.push(after.end);
    return { sounds, beat: sounds.some((name) => BEAT.has(name)) };
}

function markFresh(scene, before) {
    const seats = scene.seats || [];
    let at = null;
    if (before) {
        seats.forEach((seat, index) => {
            const pond = pondOf(seat);
            const prev = pondOf((before.seats || [])[index]);
            const claimed = pond.length < prev.length || pond.some((tile, i) => tile.spent && !(prev[i] && prev[i].spent));
            if (pond.length > prev.length) at = { seat: index, index: pond.length - 1 };
            else if (claimed) at = null;
        });
        if (!at && before.fresh) {
            const pond = seats[before.fresh.seat] && seats[before.fresh.seat].pond;
            if (pond && pond[before.fresh.index] && !pond[before.fresh.index].spent) at = before.fresh;
        }
    }
    if (at && seats[at.seat] && seats[at.seat].pond && seats[at.seat].pond[at.index]) seats[at.seat].pond[at.index].fresh = true;
    return at;
}

export function createMahjongTable(ctx, kit) {
    const {
        el, button, tileNode, liveFace, iconTool, toolBar, hostTools, labelTool,
        createMahjongFelt, createMahjongSound, ICONS, BAR_ICONS,
    } = kit;
    const { doc, board } = ctx;
    if (!doc || !board) return null;
    board.innerHTML = '';
    const root = el(doc, 'div', 'igs-mj');
    const table = el(doc, 'div', 'igs-mj-table');
    const scene = el(doc, 'div', 'igs-mj-scene');
    const felt = createMahjongFelt(doc, { faceSvg: (code) => kit.faceSvg(doc, code) });
    const sceneTop = el(doc, 'div', 'igs-mj-scene');
    const actions = el(doc, 'div', 'igs-mj-actions');
    const end = iconTool(doc, ICONS.stop, '结束这局（进度不留）');
    end.className += ' igs-mj-end';
    const close = iconTool(doc, BAR_ICONS.fold, '收起牌桌，这一局留着');
    close.className += ' igs-ws-close';
    const sound = createMahjongSound({ audio: ctx.audio, storage: kit.storage(ctx) });
    const soundToggle = iconTool(doc, '', '', () => { sound.setEnabled(!sound.enabled); syncSound(); });
    soundToggle.className += ' igs-mj-sound';
    const syncSound = () => {
        soundToggle.innerHTML = sound.enabled ? ICONS.replay : BAR_ICONS.muted;
        labelTool(soundToggle, sound.enabled ? '音效：开' : '音效：关');
        soundToggle.setAttribute('aria-pressed', String(sound.enabled));
    };
    syncSound();
    const leave = hostTools(doc);
    const tools = toolBar(doc, 'igs-mj-tools', [[soundToggle], [end, close], leave.group]);
    const banner = el(doc, 'div', 'igs-mj-banner');
    banner.hidden = true;
    const crowd = el(doc, 'div', 'igs-mj-scene igs-mj-crowd');
    table.appendChild(scene);
    table.appendChild(crowd);
    table.appendChild(actions);
    table.appendChild(tools);
    table.appendChild(banner);
    root.appendChild(table);
    board.appendChild(root);
    let host = ctx;
    if (host.setNote) host.setNote('');
    leave.bind(host);

    const heads = new Map();
    let foot = null;
    let shownAction = null;
    let shownMark = false;
    let silent = false;
    let shown = null;
    let holdTimer = 0;

    function attach(next) {
        const nextBoard = next && next.board;
        if (!nextBoard) return;
        host = next;
        nextBoard.innerHTML = '';
        nextBoard.appendChild(root);
        if (host.setNote) host.setNote('');
        leave.bind(host);
    }

    function ensureFelt() {
        if (felt.node.parentNode !== scene) {
            scene.innerHTML = '';
            scene.appendChild(felt.node);
            scene.appendChild(sceneTop);
        }
        sceneTop.innerHTML = '';
    }

    function ensureHead(id, person, name) {
        if (heads.has(id)) return heads.get(id);
        const node = el(doc, 'div', 'igs-mj-head');
        const avatar = el(doc, 'div', 'igs-mj-avatar');
        const face = liveFace(doc, person, name);
        const wind = el(doc, 'span', 'igs-mj-wind');
        avatar.appendChild(face.node);
        avatar.appendChild(wind);
        node.appendChild(avatar);
        node.appendChild(el(doc, 'span', 'igs-mj-name', name));
        const say = el(doc, 'div', 'igs-mj-say');
        node.appendChild(say);
        crowd.appendChild(node);
        const head = { node, face, wind, say, sayTimer: 0, nameNode: node.querySelector('.igs-mj-name') };
        heads.set(id, head);
        return head;
    }

    function renderHead(id, { place, turn, wind, dealer, mood }) {
        const head = heads.get(id);
        if (!head) return;
        head.node.className = `igs-mj-head is-${place}${turn ? ' is-turn' : ''}`;
        head.wind.className = `igs-mj-wind${dealer ? ' is-dealer' : ''}`;
        head.wind.textContent = wind || '';
        head.wind.style.display = wind ? '' : 'none';
        if (mood && head.face) head.face.show(mood);
    }

    function say(id, text) {
        const head = heads.get(id);
        if (!head || !text) return;
        if (head.say.className.includes('is-on')) {
            if (!head.pending) head.pending = [];
            head.pending.push(text);
            if (head.pending.length > 4) head.pending.shift();
            return;
        }
        showSay(head, text);
    }

    function showSay(head, text) {
        head.say.textContent = text;
        head.say.className = 'igs-mj-say is-on';
        clearTimeout(head.sayTimer);
        head.sayTimer = setTimeout(() => {
            const next = head.pending && head.pending.shift();
            if (next) showSay(head, next);
            else head.say.className = 'igs-mj-say';
        }, 1600);
    }

    function selfRail(spec) {
        const node = el(doc, 'div', 'igs-mj-rail is-self');
        const row = el(doc, 'div', `igs-mj-hand${spec.live ? ' is-live' : ''}`);
        for (const entry of spec.tiles || []) {
            const tile = tileNode(doc, entry.code, {
                button: Boolean(entry.button),
                zimo: Boolean(entry.zimo),
                hot: Boolean(entry.hot),
                side: Boolean(entry.side),
            });
            if (entry.className) tile.className += ` ${entry.className}`;
            if (entry.key != null) tile.setAttribute('data-igs-mj-tile', `${entry.key}`);
            if (entry.attrs) {
                for (const [key, value] of Object.entries(entry.attrs)) tile.setAttribute(key, String(value));
            }
            if (entry.onClick) tile.addEventListener('click', entry.onClick);
            row.appendChild(tile);
        }
        for (let i = 0; i < (spec.backs || 0); i += 1) row.appendChild(tileNode(doc, 'back'));
        node.appendChild(row);
        if (spec.melds && spec.melds.length) {
            const melds = el(doc, 'div', 'igs-mj-melds');
            for (const group of spec.melds) {
                const span = el(doc, 'span', 'igs-mj-meld');
                for (const tile of group) {
                    span.appendChild(tileNode(doc, tile.back ? 'back' : tile.code, { side: Boolean(tile.side) }));
                }
                melds.appendChild(span);
            }
            node.appendChild(melds);
        }
        return node;
    }

    function actButton(label, kind, tileCodes, onClick) {
        const node = button(doc, `igs-mj-act ${kind}`.trim());
        node.appendChild(el(doc, 'span', 'igs-mj-act-label', label));
        if (tileCodes && tileCodes.length) {
            const tiles = el(doc, 'span', 'igs-mj-act-tiles');
            for (const code of tileCodes) tiles.appendChild(tileNode(doc, code));
            node.appendChild(tiles);
        }
        if (onClick) node.addEventListener('click', onClick);
        return node;
    }

    function keepActions(token, mark, fill, chime) {
        if (token === shownAction && mark === shownMark) return false;
        shownAction = token;
        shownMark = mark;
        actions.innerHTML = '';
        if (token && fill) fill(actions);
        if (chime && token && !silent) sound.play('turn');
        return true;
    }

    function quiet(value) {
        silent = Boolean(value);
    }

    function show(scene) {
        const before = shown;
        const heard = mahjongBeat(before, scene);
        const fresh = markFresh(scene, before);
        felt.draw(scene);
        if (!silent) {
            for (const name of heard.sounds) sound.play(name);
        }
        shown = {
            left: scene.left,
            end: scene.end || '',
            wins: scene.wins || [],
            fresh,
            seats: (scene.seats || []).map((seat) => ({
                pond: pondOf(seat),
                melds: (seat.melds || []).map((group) => group.slice()),
                hand: { zimo: seat.hand && seat.hand.zimo || '', backs: seat.hand && seat.hand.backs || 0, tiles: (seat.hand && seat.hand.tiles) || [] },
            })),
        };
        return heard;
    }

    function hold(run, ms = 450) {
        clearTimeout(holdTimer);
        holdTimer = 0;
        if (!run) return;
        holdTimer = setTimeout(run, ms);
    }

    function stopHold() {
        clearTimeout(holdTimer);
        holdTimer = 0;
    }

    function announce(name) {
        if (!silent && name) sound.play(name);
    }

    function album(container, cover) {
        return openMahjongAlbum(host, container, cover);
    }

    // spec：targets、punisher、stage、scene、outfits，以及罚完之后牌局自己要做的 onStrip / onDone。
    function punish(card, spec) {
        const api = host && host.penalty;
        if (!card || !spec || !api || typeof api.paint !== 'function') return null;
        if (!spec.targets || !spec.targets.length || !spec.punisher) return null;
        let status = null;
        try { status = api.status(); } catch (error) { status = null; }
        if (!status || !status.ok) return null;
        const who = {
            targets: spec.targets,
            punisher: spec.punisher,
            stage: spec.stage || 'hand',
            present: spec.present || null,
            basis: spec.basis || '',
        };
        const others = who.targets.filter((name) => name !== '你');
        let label = `惩罚${others.join('、')}`;
        if (who.targets.includes('你')) label = others.length ? `和${others.join('、')}一起接受${who.punisher}的惩罚` : `接受${who.punisher}的惩罚`;
        const open = button(doc, 'igs-ws-chip igs-mj-punish', label);
        open.addEventListener('click', () => openSheet(card, who, { api, nsfw: status.nsfw === true }, spec));
        if (foot) foot.appendChild(open);
        return open;
    }

    function openSheet(card, who, { api, nsfw: nsfwAllowed }, spec) {
        card.hidden = true;
        const roles = penaltyCast(who);
        const self = roles.self;
        const others = roles.names;
        const final = roles.final;
        const sheet = el(doc, 'div', 'igs-mj-card is-penalty');
        sheet.appendChild(el(doc, 'div', 'igs-mj-card-title', '惩罚'));
        const form = el(doc, 'div', 'igs-mj-penalty-form');
        let lead = `${others}${roles.low}。`;
        if (self) lead = others ? `你和${others}${roles.tie}，由${roles.top}来罚你们。` : `你${roles.low}，由${roles.top}来罚你。`;
        else if (who.targets.length > 1) lead = `${others}${roles.tie}，一起受罚。`;
        if (roles.spectators.length) lead += `没受罚的${roles.spectators.join('、')}在旁边看。`;
        form.appendChild(el(doc, 'div', 'igs-mj-card-text', final ? lead : `${lead}每局的惩罚只能是全年龄的。`));
        let nsfw = false;
        if (final) {
            const modes = el(doc, 'div', 'igs-mj-penalty-modes');
            const pick = (value) => {
                nsfw = value;
                safe.className = `igs-mj-penalty-mode${nsfw ? '' : ' is-on'}`;
                adult.className = `igs-mj-penalty-mode${nsfw ? ' is-on' : ''}`;
            };
            const safe = button(doc, 'igs-mj-penalty-mode', '全年龄');
            const adult = button(doc, 'igs-mj-penalty-mode', '成人向');
            safe.addEventListener('click', () => pick(false));
            adult.addEventListener('click', () => pick(true));
            adult.disabled = !nsfwAllowed;
            if (!nsfwAllowed) adult.title = '主程序生图设置里的 NSFW 插图没有开启';
            modes.appendChild(safe);
            modes.appendChild(adult);
            form.appendChild(modes);
            pick(false);
        }
        const input = el(doc, 'textarea', 'igs-mj-penalty-input');
        input.rows = 3;
        input.maxLength = 300;
        input.placeholder = self ? `怎么罚由${who.punisher}决定，想加要求可以写在这里（选填）` : `写下要怎么罚${others}（必填）`;
        input.addEventListener('keydown', (event) => event.stopPropagation());
        form.appendChild(input);
        const status = el(doc, 'div', 'igs-mj-penalty-status');
        form.appendChild(status);
        const formFoot = el(doc, 'div', 'igs-mj-card-foot');
        const back = button(doc, 'igs-ws-chip', '返回');
        const go = button(doc, 'igs-ws-chip', '画惩罚 CG');
        const ready = () => self || Boolean(input.value.trim());
        go.disabled = !ready();
        formFoot.appendChild(back);
        formFoot.appendChild(go);
        form.appendChild(formFoot);
        sheet.appendChild(form);
        banner.appendChild(sheet);
        let busy = false;
        const leave = () => {
            sheet.remove();
            card.hidden = false;
        };
        input.addEventListener('input', () => { go.disabled = busy || !ready(); });
        back.addEventListener('click', () => { if (!busy) leave(); });
        const paintOnce = async (brief) => {
            let result;
            const { strip, ...request } = brief;
            try {
                result = await api.paint({ ...request, aspect: { width: table.clientWidth, height: table.clientHeight } });
            } catch (error) {
                result = { ok: false, error: (error && error.message) || String(error) };
            }
            if (!result || !result.ok || !result.url) return { ok: false, error: (result && result.error) || '图像来源没有交回图片' };
            if (result.id) {
                rememberCg(shelf(host), {
                    id: result.id,
                    caption: brief.caption,
                    at: Date.now(),
                    prompt: keptPrompt(result),
                });
            }
            if (strip.length && spec.onStrip) spec.onStrip(strip);
            return result;
        };
        const noteFor = (result, brief) => [result.id ? '已存进 CG 库。' : 'CG 库没有接上，这张只在这里看得到。',
            brief.strip.length ? `再来一局时${brief.strip.join('、')}换裸体立绘。` : ''].join('');
        go.addEventListener('click', async () => {
            const request = input.value.trim();
            if (!ready() || busy) return;
            busy = true;
            go.disabled = true;
            back.disabled = true;
            input.disabled = true;
            status.className = 'igs-mj-penalty-status';
            status.textContent = '正在写词和出图，一般要一两分钟。可以先收起牌桌，画好了回来看。';
            const worn = typeof spec.outfits === 'function' ? spec.outfits() : (spec.outfits || {});
            const brief = pictureBrief({ ...who, request, nsfw, outfits: worn, scene: spec.scene || '' });
            const result = await paintOnce(brief);
            busy = false;
            back.disabled = false;
            input.disabled = false;
            go.disabled = !ready();
            if (!result.ok) {
                status.className = 'igs-mj-penalty-status is-error';
                status.textContent = `没画成：${result.error}`;
                return;
            }
            status.textContent = '';
            sheet.hidden = true;
            const viewer = cgStage(doc, {
                lead: [
                    { icon: ICONS.rerollCg, title: '重画这张（要求不变，重新写词出图）', async run() {
                        viewer.busy('正在重画，一般要一两分钟。');
                        const again = await paintOnce(brief);
                        if (again.ok) viewer.show({ ...again, caption: brief.caption, note: noteFor(again, brief) });
                        else viewer.fail(`没画成：${again.error}`);
                    } },
                    { icon: ICONS.pencil, title: '改要求', run() {
                        viewer.node.remove();
                        sheet.hidden = false;
                        if (input.focus) input.focus();
                    } },
                ],
                tail: [{ icon: ICONS.next, title: final ? '回到终局' : '继续下一局', run() {
                    viewer.node.remove();
                    leave();
                    if (spec.onDone) spec.onDone(final);
                } }],
            });
            viewer.show({ ...result, caption: brief.caption, note: noteFor(result, brief) });
            table.appendChild(viewer.node);
        });
        input.focus && input.focus();
    }

    function clearActions() {
        shownAction = null;
        shownMark = false;
        actions.innerHTML = '';
    }

    function clearBanner() {
        banner.hidden = true;
        banner.textContent = '';
        foot = null;
    }

    function openCard(kind, title) {
        banner.hidden = false;
        banner.textContent = '';
        const card = el(doc, 'div', `igs-mj-card is-${kind}`);
        card.appendChild(el(doc, 'div', 'igs-mj-card-title', title));
        banner.appendChild(card);
        foot = el(doc, 'div', 'igs-mj-card-foot');
        return card;
    }

    function sealCard(card) {
        card.appendChild(foot);
    }

    function deltas(people) {
        const row = el(doc, 'div', 'igs-mj-card-delta');
        for (const person of people || []) {
            const delta = person.delta || 0;
            const item = el(doc, 'span', delta > 0 ? 'is-up' : (delta < 0 ? 'is-down' : ''));
            item.appendChild(avatarNode(doc, person.person, person.name, person.mood));
            item.appendChild(el(doc, 'i', '', person.name || ''));
            item.appendChild(el(doc, 'b', '', delta > 0 ? `+${delta}` : String(delta)));
            row.appendChild(item);
        }
        return row;
    }

    function played(spec) {
        const hand = el(doc, 'div', 'igs-mj-card-hand');
        const row = el(doc, 'div', 'igs-mj-hand');
        for (let i = 0; i < (spec.backs || 0); i += 1) row.appendChild(tileNode(doc, 'back'));
        for (const code of spec.tiles || []) row.appendChild(tileNode(doc, code));
        if (spec.zimo) row.appendChild(tileNode(doc, spec.zimo, { zimo: true }));
        hand.appendChild(row);
        if (spec.melds && spec.melds.length) {
            const melds = el(doc, 'div', 'igs-mj-melds');
            for (const group of spec.melds) {
                const span = el(doc, 'span', 'igs-mj-meld');
                for (const tile of group) span.appendChild(tileNode(doc, tile.back ? 'back' : tile.code, { side: Boolean(tile.side) }));
                melds.appendChild(span);
            }
            hand.appendChild(melds);
        }
        return hand;
    }

    function rank(people) {
        const list = el(doc, 'ol', 'igs-mj-card-rank');
        for (const person of people || []) {
            const li = el(doc, 'li');
            li.appendChild(el(doc, 'b', 'igs-mj-card-place', String(person.place || '')));
            li.appendChild(avatarNode(doc, person.person, person.name, person.mood));
            li.appendChild(el(doc, 'span', '', person.name || ''));
            li.appendChild(el(doc, 'b', '', String(person.score)));
            list.appendChild(li);
        }
        return list;
    }

    return {
        doc, root, table, scene, sceneTop, crowd, actions, banner, felt, sound, leave, end, close, el, button,
        get host() { return host; },
        get foot() { return foot; },
        set foot(value) { foot = value; },
        attach, ensureFelt, ensureHead, renderHead, say, selfRail, actButton,
        keepActions, clearActions, clearBanner, openCard, sealCard, deltas, played, rank,
        quiet, show, hold, stopHold, announce, album, punish,
    };
}
