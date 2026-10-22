// 等待小游戏的安装位。主体只留这个登记表；具体玩法在独立脚本里，装上之后才登记进来。
export const WAIT_GAMES_GLOBAL_KEY = '__IGS_WAIT_GAME_PACK__';
export const WAIT_GAMES_QUEUE_KEY = 'IGS_WAIT_GAMES';

let current = null;
const listeners = new Set();

function emit(pack) {
    for (const listener of listeners) {
        try { listener(pack); } catch (error) { /* 单个等待层出错不影响登记 */ }
    }
}

export function getWaitStageGamePack() {
    return current;
}

export function registerWaitStageGamePack(pack) {
    if (!pack || typeof pack.list !== 'function' || typeof pack.start !== 'function') {
        return { ok: false, reason: 'invalid-wait-game-pack' };
    }
    current = pack;
    emit(current);
    return { ok: true, id: pack.id || '' };
}

export function unregisterWaitStageGamePack(pack) {
    if (pack && current && pack !== current) return { ok: false, reason: 'different-pack' };
    if (!current) return { ok: true };
    current = null;
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

// IGS 启动时认领已经挂在窗口上的小游戏包；之后再推进来的包立刻登记。
// 关掉 IGS 只摘掉本次登记，窗口上的包还留着，下次启动再认领。
export function attachWaitStageGames(globalObject) {
    if (!globalObject) return current;
    const queued = Array.isArray(globalObject[WAIT_GAMES_QUEUE_KEY]) ? globalObject[WAIT_GAMES_QUEUE_KEY].filter(Boolean) : [];
    const external = globalObject[WAIT_GAMES_GLOBAL_KEY] || queued[queued.length - 1] || null;
    if (external) registerWaitStageGamePack(external);
    const queue = [];
    queue.push = (pack) => {
        if (!pack) return 0;
        globalObject[WAIT_GAMES_GLOBAL_KEY] = pack;
        registerWaitStageGamePack(pack);
        return 1;
    };
    globalObject[WAIT_GAMES_QUEUE_KEY] = queue;
    return current;
}

export function detachWaitStageGames(globalObject) {
    unregisterWaitStageGamePack();
    if (!globalObject) return;
    const pack = globalObject[WAIT_GAMES_GLOBAL_KEY];
    globalObject[WAIT_GAMES_QUEUE_KEY] = pack ? [pack] : [];
}
