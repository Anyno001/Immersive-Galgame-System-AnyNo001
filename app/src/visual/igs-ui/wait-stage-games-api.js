// 内置与旧外挂共用登记写口；内置包的同 ID 登记优先。
export const WAIT_GAMES_GLOBAL_KEY = '__IGS_WAIT_GAME_PACK__';
export const WAIT_GAMES_QUEUE_KEY = 'IGS_WAIT_GAMES';

let current = null;
let builtin = null;
let builtinStart = null;
let attachedRoot = null;
const listeners = new Set();

function syncGlobalPack() {
    if (attachedRoot) attachedRoot[WAIT_GAMES_GLOBAL_KEY] = current;
}

function emit(pack) {
    for (const listener of listeners) {
        try { listener(pack); } catch (error) { /* 单个等待层出错不影响登记 */ }
    }
}

export function getWaitStageGamePack() {
    return current;
}

export function startWaitStageGamePack(ctx, rounds) {
    if (!current) return;
    return current === builtin && builtinStart
        ? builtinStart(ctx, rounds) : current.start(ctx);
}

export function registerWaitStageGamePack(pack) {
    if (!pack || typeof pack.list !== 'function' || typeof pack.start !== 'function') {
        return { ok: false, reason: 'invalid-wait-game-pack' };
    }
    const selected = builtin && pack.id === builtin.id ? builtin : pack;
    if (current === selected || (selected !== builtin && current && selected.id && current.id === selected.id)) {
        syncGlobalPack();
        return { ok: true, id: current.id || '', duplicate: true };
    }
    current = selected;
    syncGlobalPack();
    emit(current);
    return { ok: true, id: current.id || '' };
}

export function unregisterWaitStageGamePack(pack) {
    if (current && current === builtin) return { ok: false, reason: 'builtin-wait-game-pack' };
    if (pack && current && pack !== current) return { ok: false, reason: 'different-pack' };
    if (!current) return { ok: true };
    current = null;
    syncGlobalPack();
    emit(null);
    return { ok: true };
}

export function subscribeWaitStageGamePack(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function listWaitStageGameIds(model) {
    if (!current || typeof current.list !== 'function') return [];
    const list = current.list(model || {});
    return Array.isArray(list) ? list.filter(Boolean) : [];
}

export function createWaitGamesApi() {
    return {
        register(pack) { return registerWaitStageGamePack(pack); },
        unregister(pack) { return unregisterWaitStageGamePack(pack); },
        installed() { return Boolean(current); },
        id() { return current && current.id || ''; },
    };
}

export function attachWaitStageGames(globalObject, builtinPack = null, trustedStart = null) {
    if (!globalObject) return current;
    const queued = Array.isArray(globalObject[WAIT_GAMES_QUEUE_KEY]) ? globalObject[WAIT_GAMES_QUEUE_KEY].filter(Boolean) : [];
    const external = globalObject[WAIT_GAMES_GLOBAL_KEY] || queued[queued.length - 1] || null;
    attachedRoot = globalObject;
    builtin = builtinPack;
    builtinStart = typeof trustedStart === 'function' ? trustedStart : null;
    if (builtin) registerWaitStageGamePack(builtin);
    else if (external) registerWaitStageGamePack(external);
    const queue = [];
    queue.push = (pack) => {
        if (!pack) return 0;
        registerWaitStageGamePack(pack);
        return 1;
    };
    globalObject[WAIT_GAMES_QUEUE_KEY] = queue;
    return current;
}

export function detachWaitStageGames(globalObject) {
    const wasBuiltin = builtin;
    builtin = null;
    builtinStart = null;
    attachedRoot = null;
    if (current) { current = null; emit(null); }
    if (!globalObject) return;
    const pack = globalObject[WAIT_GAMES_GLOBAL_KEY];
    if (pack === wasBuiltin) delete globalObject[WAIT_GAMES_GLOBAL_KEY];
    globalObject[WAIT_GAMES_QUEUE_KEY] = pack && pack !== wasBuiltin ? [pack] : [];
}
