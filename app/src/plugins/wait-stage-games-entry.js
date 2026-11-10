import { createWaitStageGamePack } from '../visual/igs-ui/wait-stage-games.js';
import { attachWaitStageGames, detachWaitStageGames } from '../visual/igs-ui/wait-stage-games-api.js';

export function installWaitStageGames(root) {
    let trustedStart;
    const pack = createWaitStageGamePack(start => { trustedStart = start; });
    return attachWaitStageGames(root, pack, trustedStart);
}

export function uninstallWaitStageGames(root) {
    detachWaitStageGames(root);
}
