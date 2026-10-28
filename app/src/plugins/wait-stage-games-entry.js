import { createWaitStageGamePack } from '../visual/igs-ui/wait-stage-games.js';

// 与 wait-stage-games-api.js 的两个键保持一致。这里不引用登记表，避免把主体的模块图打进小游戏脚本。
const WAIT_GAMES_GLOBAL_KEY = '__IGS_WAIT_GAME_PACK__';
const WAIT_GAMES_QUEUE_KEY = 'IGS_WAIT_GAMES';

function rootWindow() {
    const base = globalThis.window || globalThis;
    try {
        if (base.parent && base.parent.document) return base.parent;
    } catch (error) {
        // 跨域父页不可用时就挂在当前窗口。
    }
    return base;
}

export function installWaitStageGames(root = rootWindow()) {
    const pack = createWaitStageGamePack();
    root[WAIT_GAMES_GLOBAL_KEY] = pack;
    const api = root.IGS && root.IGS.api && root.IGS.api.waitGames;
    if (api && typeof api.register === 'function') api.register(pack);
    else if (root[WAIT_GAMES_QUEUE_KEY] && typeof root[WAIT_GAMES_QUEUE_KEY].push === 'function') root[WAIT_GAMES_QUEUE_KEY].push(pack);
    else root[WAIT_GAMES_QUEUE_KEY] = [pack];
    return pack;
}

export function uninstallWaitStageGames(root = rootWindow()) {
    const pack = root[WAIT_GAMES_GLOBAL_KEY];
    if (root[WAIT_GAMES_GLOBAL_KEY] === pack) delete root[WAIT_GAMES_GLOBAL_KEY];
    const api = root.IGS && root.IGS.api && root.IGS.api.waitGames;
    if (api && typeof api.unregister === 'function') api.unregister(pack);
    else if (Array.isArray(root[WAIT_GAMES_QUEUE_KEY])) {
        root[WAIT_GAMES_QUEUE_KEY] = root[WAIT_GAMES_QUEUE_KEY].filter((item) => item !== pack);
    }
}

if (typeof window !== 'undefined') {
    installWaitStageGames();
    window.addEventListener('pagehide', () => uninstallWaitStageGames());
}
