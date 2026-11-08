import { createWaitStageGamePack } from '../visual/igs-ui/wait-stage-games.js';
import { attachWaitStageGames, detachWaitStageGames } from '../visual/igs-ui/wait-stage-games-api.js';

export function installWaitStageGames(root) {
    return attachWaitStageGames(root, createWaitStageGamePack());
}

export function uninstallWaitStageGames(root) {
    detachWaitStageGames(root);
}
