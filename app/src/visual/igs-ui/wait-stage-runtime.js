import { extractSceneDirectives } from '../../scene/scene-directives.js';
import { getMessagePrimaryText } from '../../scene/message-source.js';
import { createOutfitResolver, isBuiltinNudeOutfit, outfitsOfCharacter } from '../../scene/character-outfits.js';
import { outfitSpriteSlots, readDefaultOutfit } from '../../scene/character-appearance.js';
import { moodFallbackChain, moodPresetWords } from '../../scene/mood-groups.js';
import { HEAD_ASPECT, resolveSpriteHead } from './fx-anchor.js';
import {
    WAIT_STAGE_FALLBACK_LINES,
    WAIT_STAGE_FAILURES,
    normalizeWaitStageSettings,
    weaveWaitStageLines,
} from './wait-stage.js';
import { getWaitStageGamePack, listWaitStageGameIds, subscribeWaitStageGamePack } from './wait-stage-games-api.js';
import { ORIGINAL_READER_ICONS } from './reader-icons.js';

const QUOTE_MAX = 34;
const TURN_LOOKBACK = 6;

// 回放池：最近几楼的 AI 正文里角色说过的话（去标签、截断、去重）。
export function collectWaitStageLines(turns, options = {}) {
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const list = Array.isArray(turns) ? turns : [];
    const out = [];
    const seen = new Set();
    // 带服装栏的四栏标签 [igs-char:角色|表情|服装|对白] 只有传了 resolver 才识别；不传就整条当正文，台词池常年是空的。
    const outfitResolver = createOutfitResolver(options.sceneAssets);
    for (const turn of list.slice(-Math.max(1, Math.round(options.turns || TURN_LOOKBACK)))) {
        const raw = getMessagePrimaryText(turn && (turn.raw || turn)) || getMessagePrimaryText(turn);
        if (!raw) continue;
        let directives = [];
        try {
            directives = extractSceneDirectives(raw, { outfitResolver }).directives || [];
        } catch (error) {
            directives = [];
        }
        for (const item of directives) {
            if (!item || item.type !== 'char') continue;
            const who = String(item.character || '').trim();
            const full = String(item.dialogue || '').replace(/\s+/g, ' ').trim();
            // 长句截断而不是丢掉：正经对白大多超过一行，丢掉后回放池常年是空的。
            const text = Array.from(full).length > QUOTE_MAX ? `${Array.from(full).slice(0, QUOTE_MAX - 1).join('')}…` : full;
            if (!who || !text) continue;
            const key = `${who}\u0000${text}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ who, text, mood: String(item.mood || '').trim() });
        }
    }
    // 越靠后的楼越贴近当下语境，打散后也不会整轮都是老台词。
    const pool = (out.slice(-14).length ? out.slice(-14) : out).slice();
    for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        const swap = pool[i];
        pool[i] = pool[j];
        pool[j] = swap;
    }
    return pool;
}

// 牌面素材：本卡的立绘差分（带情绪标签）、服装底图与场景图。小游戏脚本装上后按这些素材决定能玩哪些。
export function collectWaitStageArt(sceneAssets, options = {}) {
    const assets = sceneAssets && typeof sceneAssets === 'object' ? sceneAssets : {};
    const resolveUrl = typeof options.resolveUrl === 'function' ? options.resolveUrl : (url) => String(url || '');
    const sprites = [];
    const pictures = [];
    const addSprite = (character, outfit, mood, url) => {
        const resolved = url ? String(resolveUrl(url) || '') : '';
        if (!resolved) return;
        if (mood && mood !== '默认') sprites.push({ character, outfit, mood, url: resolved });
        pictures.push({ character, label: mood, url: resolved });
    };
    for (const [character, moods] of Object.entries(assets.characters || {})) {
        for (const [mood, url] of Object.entries(moods || {})) addSprite(character, '', mood, url);
    }
    for (const character of Object.keys(assets.characterOutfits || {})) {
        const { outfits } = outfitsOfCharacter(assets.characterOutfits, assets.characterAliases, character);
        for (const [outfitName, outfit] of Object.entries(outfits || {})) {
            for (const [mood, url] of Object.entries((outfit && outfit.moods) || {})) {
                addSprite(character, outfitName, String(mood || '').trim(), url);
            }
            const base = outfit && outfit.base ? String(resolveUrl(outfit.base) || '') : '';
            if (base) pictures.push({ character, label: outfitName, url: base });
        }
    }
    const addPicture = (url) => {
        const resolved = url ? String(resolveUrl(url) || '') : '';
        if (resolved) pictures.push({ character: '', label: '', url: resolved });
    };
    for (const scene of Object.values(assets.scenes || {})) {
        if (typeof scene === 'string') { addPicture(scene); continue; }
        if (!scene || typeof scene !== 'object') continue;
        addPicture(scene.url);
        for (const time of Object.values(scene.times || {})) {
            if (typeof time === 'string') { addPicture(time); continue; }
            if (!time || typeof time !== 'object') continue;
            addPicture(time.url);
            for (const weather of Object.values(time.weathers || {})) addPicture(typeof weather === 'string' ? weather : weather && weather.url);
        }
    }
    for (const entry of Array.isArray(options.pictures) ? options.pictures : []) {
        if (entry && entry.url) pictures.push(entry);
    }
    return { sprites, pictures };
}

export const WAIT_STAGE_FACE_MOODS = ['平和', '喜悦', '愤怒', '悲伤', '惊讶', '害羞', '紧张', '思考'];

function faceSlot(slots, label) {
    for (const name of [label, ...moodPresetWords(label)]) if (slots[name]) return name;
    return '';
}

// 小游戏头像：每人一套当前衣装（默认衣装优先，没设取第一套），八种基本表情各给一张图，缺的按回退链落到平和。
// wardrobe 列出这个人所有能换的衣装（裸体除外，当前那套排第一），nude 是裸体那套，留给成人向惩罚后的下一场。
export function collectWaitStageCast(sceneAssets, options = {}) {
    const assets = sceneAssets && typeof sceneAssets === 'object' ? sceneAssets : {};
    const resolveUrl = typeof options.resolveUrl === 'function' ? options.resolveUrl : (url) => String(url || '');
    const heads = options.spriteHeads && typeof options.spriteHeads === 'object' ? options.spriteHeads : null;
    const names = Array.from(new Set([...Object.keys(assets.characterOutfits || {}), ...Object.keys(assets.characters || {})]
        .map((name) => String(name || '').trim()).filter(Boolean)));
    const cast = [];
    for (const name of names) {
        const { outfits } = outfitsOfCharacter(assets.characterOutfits, assets.characterAliases, name);
        const keys = Object.keys(outfits || {});
        const preferred = readDefaultOutfit(assets, name);
        const lead = preferred.ok ? preferred.outfitName : (keys.find((key) => !isNudeOutfit(key, outfits[key])) || '');
        const wardrobe = [];
        for (const key of [lead, ...keys.filter((key) => key !== lead)]) {
            if (!key || !outfits[key] || (isNudeOutfit(key, outfits[key]) && key !== lead)) continue;
            const faces = outfitFaces(outfitSpriteSlots(outfits[key]), name, key, resolveUrl, heads);
            if (faces) wardrobe.push({ outfit: key, faces });
        }
        if (!wardrobe.length) {
            const raw = assets.characters && assets.characters[name] && typeof assets.characters[name] === 'object' ? assets.characters[name] : {};
            const faces = outfitFaces(raw, name, '', resolveUrl, heads);
            if (faces) wardrobe.push({ outfit: '', faces });
        }
        if (!wardrobe.length) continue;
        const { outfit, faces } = wardrobe[0];
        const bare = keys.find((key) => key !== outfit && isNudeOutfit(key, outfits[key]));
        const nude = bare ? outfitFaces(outfitSpriteSlots(outfits[bare]), name, bare, resolveUrl, heads) : null;
        cast.push({ name, outfit, faces, wardrobe, ...(nude && { nude }) });
    }
    return cast;
}

function isNudeOutfit(name, entry) {
    return isBuiltinNudeOutfit(name) || isBuiltinNudeOutfit(entry && entry.wardrobe);
}

function outfitFaces(raw, name, outfit, resolveUrl, heads) {
    const slots = {};
    for (const [mood, url] of Object.entries(raw)) {
        const resolved = url ? String(resolveUrl(url) || '') : '';
        if (resolved) slots[String(mood).trim()] = resolved;
    }
    const base = ['默认', '裸体'].find((label) => slots[label]) || '';
    const fallback = faceSlot(slots, '平和') || base || Object.keys(slots)[0];
    if (!fallback) return null;
    const faces = {};
    for (const label of WAIT_STAGE_FACE_MOODS) {
        let slot = faceSlot(slots, label);
        for (const parent of moodFallbackChain(label)) slot = slot || faceSlot(slots, parent);
        slot = slot || fallback;
        const head = resolveSpriteHead(heads, name, slot === base ? '' : slot, outfit);
        faces[label] = {
            url: slots[slot],
            ...(head && { head: { x: head.x, top: head.top, w: head.w, hh: head.w * HEAD_ASPECT } }),
        };
    }
    return faces;
}

export function buildWaitStageModel(options = {}) {
    const settings = normalizeWaitStageSettings(options.settings);
    const lines = collectWaitStageLines(options.turns, options);
    const art = collectWaitStageArt(options.sceneAssets, options);
    const cast = collectWaitStageCast(options.sceneAssets, options);
    const fallback = Array.isArray(options.fallback) && options.fallback.length ? options.fallback : WAIT_STAGE_FALLBACK_LINES;
    const playlist = weaveWaitStageLines(lines, fallback, { limit: 14, random: options.random });
    // 名字池把本卡角色也算进去，装了小游戏之后可以拿来当干扰项。
    const assets = options.sceneAssets && typeof options.sceneAssets === 'object' ? options.sceneAssets : {};
    const names = Array.from(new Set([
        ...lines.map((line) => line.who),
        ...Object.keys(assets.characters || {}),
        ...Object.keys(assets.characterOutfits || {}),
    ].map((name) => String(name || '').trim()).filter(Boolean)));
    return {
        settings,
        playlist: playlist.length ? playlist : [{ who: '', text: fallback[0] }],
        replay: lines,
        names,
        art,
        cast,
        games: listWaitStageGameIds({ art, replay: lines, names }),
    };
}

function mountNode(doc, className, html) {
    const node = doc.createElement('div');
    node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
}

// 等待过场本体：五种模式共用一层；回复结束由宿主直接关闭。
export function createWaitStageRuntime(options = {}) {
    // 内嵌模式的宿主文档与主文档可能不是同一份，开层时现取。
    const resolveDoc = typeof options.getDoc === 'function'
        ? options.getDoc
        : () => options.doc || (typeof document !== 'undefined' ? document : null);
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const onVoice = typeof options.onVoice === 'function' ? options.onVoice : () => {};
    const onExitReady = typeof options.onExitReady === 'function' ? options.onExitReady : () => {};
    const onDismiss = typeof options.onDismiss === 'function' ? options.onDismiss : () => {};
    // 全屏等待层盖住了工具栏的退出键：右上角另放一个，生成照常在酒馆里跑。
    const onClose = typeof options.onClose === 'function' ? options.onClose : null;
    const loadImage = typeof options.loadImage === 'function' ? options.loadImage : (url) => String(url || '');
    const releaseImages = typeof options.releaseImages === 'function' ? options.releaseImages : () => {};
    const timers = options.timers || globalThis;
    let doc = null;
    let root = null;
    let body = null;
    let lineBox = null;
    let noteBox = null;
    let gamesRow = null;
    let board = null;
    let actions = null;
    let timer = null;
    let phase = 'wait';
    let model = null;
    let settings = normalizeWaitStageSettings(null);
    let index = 0;
    let game = null;
    let gameState = null;
    let backButton = null;
    let nextButton = null;
    let replyReady = false;
    // 关掉等待过场时退化成纯三点：等还是要有反馈，只是不轮台词、不给小游戏。
    let minimal = false;
    // 从工具栏主动打开的「小游戏」：没有在等的回复，返回就是收起这一层。
    let play = false;
    let dotsBox = null;

    function clearTimer() {
        if (timer != null) timers.clearTimeout(timer);
        timer = null;
    }

    function scheduleLine() {
        clearTimer();
        if (minimal || play || !root || phase !== 'wait' || game) return;
        timer = timers.setTimeout(() => {
            timer = null;
            if (!root || phase !== 'wait' || game) return;
            index += 1;
            renderLine();
            scheduleLine();
        }, Math.max(2000, (settings.lineSeconds || 6) * 1000));
    }

    function renderLine() {
        if (!lineBox || minimal) return;
        // 兜底台词都是「正在写」的口吻，没在等回复时不轮播。
        if (play) {
            lineBox.innerHTML = '';
            lineBox.appendChild(mountNode(doc, 'igs-ws-note', '挑一个玩吧'));
            return;
        }
        if (!model) return;
        const line = model.playlist[index % model.playlist.length] || { who: '', text: '' };
        lineBox.innerHTML = '';
        const text = doc.createElement('div');
        text.className = line.who ? 'igs-ws-quote' : 'igs-ws-note';
        text.textContent = line.text;
        lineBox.appendChild(text);
        if (line.who) {
            const who = doc.createElement('div');
            who.className = 'igs-ws-who';
            who.textContent = line.who;
            lineBox.appendChild(who);
            if (settings.voice) {
                try {
                    onVoice(line);
                } catch (error) {
                    // 语气音失败不影响过场。
                }
            }
        }
    }

    function setNote(text) {
        if (noteBox) noteBox.textContent = text || '';
    }

    function syncGameAttr() {
        if (root) root.setAttribute('data-igs-waitstage-game', game ? game.id : '');
    }

    function hostState() {
        const shown = (node) => Boolean(node && actions && !actions.hidden && !node.hidden);
        return {
            back: shown(backButton) ? backButton.textContent : '',
            next: shown(nextButton),
            nextBusy: Boolean(nextButton && nextButton.disabled),
        };
    }

    function notifyHost() {
        if (!gameState) return;
        const state = hostState();
        for (const listener of [...gameState.hostListeners]) {
            try { listener(state); } catch (error) { /* 游戏工具栏出错不影响等待层 */ }
        }
    }

    function closeRoot() {
        clearTimer();
        releaseImages();
        if (root && root.parentNode && typeof root.parentNode.removeChild === 'function') {
            root.parentNode.removeChild(root);
        }
        doc = null;
        root = null;
        body = null;
        lineBox = null;
        noteBox = null;
        gamesRow = null;
        board = null;
        actions = null;
        backButton = null;
        nextButton = null;
        game = null;
        gameState = null;
        replyReady = false;
        phase = 'wait';
        play = false;
        dotsBox = null;
    }

    // 玩着的时候开始等回复：层留着、牌局不断，只把它变回等待过场。
    function enterWait() {
        if (!root || !play) return false;
        play = false;
        root.classList.remove('is-play');
        if (dotsBox) dotsBox.hidden = false;
        if (backButton) backButton.textContent = '返回当前楼';
        if (actions) actions.hidden = true;
        root.setAttribute('role', 'status');
        if (!game) setNote('');
        renderLine();
        scheduleLine();
        notifyHost();
        return true;
    }

    function showNextFloorAction() {
        if (!nextButton || !actions) return;
        nextButton.hidden = false;
        if (backButton) backButton.hidden = true;
        actions.hidden = false;
        notifyHost();
    }

    function confirmNextFloor() {
        if (!root || !replyReady) return;
        replyReady = false;
        if (nextButton) nextButton.disabled = true;
        setNote('正在打开下一楼…');
        notifyHost();
        onExitReady();
    }

    function closeGame() {
        if (!board) return;
        releaseImages();
        board.innerHTML = '';
        board.hidden = true;
        game = null;
        gameState = null;
        syncGameAttr();
        renderGames();
        scheduleLine();
    }

    // model 是开局那一刻的；图库里的立绘读回后模型会重建，玩着的游戏用 onModel 接新的。
    function gameContext(id) {
        const own = gameState;
        return {
            id,
            doc,
            board,
            model,
            getModel: () => model,
            onModel(listener) {
                if (!own || typeof listener !== 'function') return () => {};
                own.listeners.add(listener);
                return () => own.listeners.delete(listener);
            },
            random,
            timers,
            settings,
            setNote(text) {
                if (replyReady) return;
                setNote(text);
            },
            onVoice(line) {
                if (!settings.voice) return;
                try { onVoice(line); } catch (error) { /* 语气音失败不影响这一局 */ }
            },
            // 牌面地址可能是图库原地址：返回能直接显示的地址，还没读回时返回 Promise，读不到给空串。
            loadImage: (url) => loadImage(url),
            penalty: options.penalty || null,
            persona: options.persona || null,
            // 主程序混音总线：{ context(), input(), resume() }，游戏音效接进 sfx 子总线。
            audio: options.audio || null,
            isExiting: () => phase === 'exit',
            isSettled: () => Boolean(gameState && gameState.done),
            markDone() {
                if (!gameState || gameState.done) return;
                gameState.done = true;
            },
            requestClose: () => closeGame(),
            // 等待层自己的「返回」「加载下一楼」：铺满整层的游戏把它们放进自己的工具栏，底栏就不用留。
            // state().back 是按钮文字（返回阅读 / 返回当前楼），空串表示这会儿不给返回。
            host: {
                state: hostState,
                back() {
                    if (!hostState().back) return;
                    if (play) closeRoot();
                    else onDismiss();
                },
                next() {
                    if (hostState().next) confirmNextFloor();
                },
                onChange(listener) {
                    if (!own || typeof listener !== 'function') return () => {};
                    own.hostListeners.add(listener);
                    return () => own.hostListeners.delete(listener);
                },
            },
        };
    }

    function openGame(id) {
        const pack = getWaitStageGamePack();
        if (!pack || typeof pack.start !== 'function' || !board || !model || phase !== 'wait') return;
        clearTimer();
        game = { id };
        gameState = { listeners: new Set(), hostListeners: new Set() };
        board.hidden = false;
        if (gamesRow) gamesRow.hidden = true;
        syncGameAttr();
        if (typeof pack.ensureStyle === 'function') pack.ensureStyle(doc);
        try {
            pack.start(gameContext(id));
        } catch (error) {
            closeGame();
        }
    }

    function renderGames() {
        if (!gamesRow) return;
        gamesRow.innerHTML = '';
        const pack = getWaitStageGamePack();
        const list = (!minimal && (play || settings.games) && pack && model) ? listWaitStageGameIds(model) : [];
        if (play && !game) {
            if (!pack) setNote('还没装小游戏脚本。');
            else if (!model) setNote('正在摆桌…');
            else setNote(list.length ? '' : '最近几楼里还凑不齐小游戏要的角色和台词，多读几楼再来。');
        }
        if (!list.length) {
            gamesRow.hidden = true;
            return;
        }
        if (typeof pack.ensureStyle === 'function') pack.ensureStyle(doc);
        gamesRow.hidden = Boolean(game) || phase !== 'wait';
        list.forEach((id, index) => {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'igs-ws-chip';
            button.textContent = (pack.label && pack.label(id)) || id;
            // 游戏包可以把按钮画成卡片；旧版游戏包没有这一项，照旧用文字按钮。
            if (typeof pack.decorate === 'function') {
                try { pack.decorate(button, id, index); } catch (error) { /* 卡片画失败就留文字按钮 */ }
            }
            button.addEventListener('click', () => openGame(id));
            gamesRow.appendChild(button);
        });
    }

    subscribeWaitStageGamePack(() => {
        if (!root || phase !== 'wait' || game) return;
        renderGames();
    });

    return {
        open(host, opts = {}) {
            if (!host || !host.appendChild) return null;
            const nextDoc = host.ownerDocument || resolveDoc();
            if (!nextDoc || typeof nextDoc.createElement !== 'function') return null;
            closeRoot();
            doc = nextDoc;
            model = opts.model || null;
            phase = 'wait';
            settings = normalizeWaitStageSettings(opts.settings || settings);
            play = Boolean(opts.play);
            // 关掉等待过场时内嵌也不能开天窗：退化成纯三点，等还是要有反馈。主动来玩的不受这个开关管。
            minimal = !play && settings.enabled === false;
            index = 0;
            game = null;
            gameState = null;
            root = mountNode(doc, `igs-waitstage${opts.embedded ? ' igs-embedded-loading' : ''}${play ? ' is-play' : ''}`);
            root.setAttribute('data-igs-waitstage-phase', phase);
            root.setAttribute('role', play ? 'dialog' : 'status');
            root.setAttribute('aria-live', 'polite');
            body = mountNode(doc, 'igs-ws-body');
            dotsBox = mountNode(doc, 'igs-ws-dots', '<span class="igs-embedded-loading-dot"></span><span class="igs-embedded-loading-dot"></span><span class="igs-embedded-loading-dot"></span>');
            dotsBox.hidden = play;
            body.appendChild(dotsBox);
            lineBox = mountNode(doc, 'igs-ws-line');
            lineBox.hidden = minimal;
            noteBox = mountNode(doc, 'igs-ws-note igs-ws-state');
            body.appendChild(lineBox);
            body.appendChild(noteBox);
            if (!minimal) {
                gamesRow = mountNode(doc, 'igs-ws-games');
                board = mountNode(doc, 'igs-ws-board');
                board.hidden = true;
                body.appendChild(gamesRow);
                body.appendChild(board);
            }
            actions = mountNode(doc, 'igs-ws-actions');
            actions.hidden = !play;
            backButton = doc.createElement('button');
            backButton.type = 'button';
            backButton.className = 'igs-ws-chip';
            backButton.textContent = play ? '返回阅读' : '返回当前楼';
            backButton.setAttribute('data-igs-waitstage-back', '1');
            const openedRoot = root;
            backButton.addEventListener('click', () => {
                if (root !== openedRoot) return;
                if (play) closeRoot();
                else onDismiss();
            });
            nextButton = doc.createElement('button');
            nextButton.type = 'button';
            nextButton.className = 'igs-ws-chip';
            nextButton.textContent = '加载下一楼';
            nextButton.hidden = true;
            nextButton.setAttribute('data-igs-waitstage-next', '1');
            nextButton.addEventListener('click', () => { if (root === openedRoot) confirmNextFloor(); });
            actions.appendChild(backButton);
            actions.appendChild(nextButton);
            body.appendChild(actions);
            if (onClose && !opts.embedded) {
                const closeButton = doc.createElement('button');
                closeButton.type = 'button';
                closeButton.className = 'igs-ws-close';
                closeButton.title = '关闭';
                closeButton.setAttribute('aria-label', '关闭');
                closeButton.setAttribute('data-igs-waitstage-close', '1');
                closeButton.innerHTML = ORIGINAL_READER_ICONS.close;
                closeButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    if (root !== openedRoot) return;
                    // 主动来玩时只收起这一层回到阅读；等回复时才交给宿主关阅读器。
                    if (play) closeRoot();
                    else onClose();
                });
                root.appendChild(closeButton);
            }
            root.appendChild(body);
            host.appendChild(root);
            syncGameAttr();
            renderLine();
            if (minimal) setNote('正在等待回复…');
            renderGames();
            scheduleLine();
            return root;
        },
        // 楼层读完后再补一遍回放台词与牌面素材：开层时不等数据，先显示兜底句。
        // 图片每读回一张就会补一次模型：台词池只在回放首次到位时换，否则每次都洗牌重画、计时不重置，台词忽快忽慢地乱跳。
        update(nextModel) {
            if (!nextModel || !root) return;
            const prev = model;
            const swap = !prev || (!(prev.replay || []).length && (nextModel.replay || []).length > 0);
            model = swap ? nextModel : { ...nextModel, playlist: prev.playlist, replay: prev.replay };
            if (game && gameState) {
                for (const listener of [...gameState.listeners]) {
                    try { listener(model); } catch (error) { /* 游戏换图失败不影响等待层 */ }
                }
            }
            if (!game && phase === 'wait') {
                if (swap) {
                    renderLine();
                    scheduleLine();
                }
                renderGames();
            }
        },
        // 正在玩就不切楼。下一楼先备好，等玩家自己点「加载下一楼」。
        replyArrived() {
            if (phase === 'error') return false;
            if (replyReady) return false;
            if (!root || !game) return true;
            replyReady = true;
            setNote('下一楼已经写好，点「加载下一楼」再进去。');
            showNextFloorAction();
            return false;
        },
        showFailure(kind = 'failed') {
            if (!root) return false;
            const failure = WAIT_STAGE_FAILURES[kind] || WAIT_STAGE_FAILURES.failed;
            phase = 'error';
            clearTimer();
            game = null;
            gameState = null;
            syncGameAttr();
            root.classList.remove('is-exit');
            root.classList.add('is-error');
            root.setAttribute('data-igs-waitstage-phase', phase);
            root.setAttribute('data-igs-waitstage-error', kind);
            root.setAttribute('role', 'alert');
            if (gamesRow) gamesRow.hidden = true;
            if (board) board.hidden = true;
            replyReady = false;
            if (backButton) backButton.hidden = false;
            if (nextButton) nextButton.hidden = true;
            lineBox.hidden = false;
            lineBox.innerHTML = '';
            const mark = mountNode(doc, 'igs-ws-error-mark');
            mark.textContent = '!';
            mark.setAttribute('aria-hidden', 'true');
            const title = mountNode(doc, 'igs-ws-error-title');
            title.textContent = failure.title;
            lineBox.appendChild(mark);
            lineBox.appendChild(title);
            setNote(failure.text);
            actions.hidden = false;
            return true;
        },
        showSlow() {
            if (!root || play || phase !== 'wait' || replyReady) return;
            setNote('等待较久，尚未确认回复写完。请求可能仍在进行，可返回酒馆检查。');
            actions.hidden = false;
            notifyHost();
        },
        // 生成期间宿主每 150ms 报一次活动：层已经挂着就别重建，否则台词永远停在第一句、点开的小游戏会被抹掉。
        isOpen(host) {
            if (!root) return false;
            if (host && root.parentNode !== host) return false;
            return true;
        },
        isPlaying: () => Boolean(root && play),
        enterWait,
        close: closeRoot,
    };
}
