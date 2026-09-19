import { createSceneState } from './scene-state.js';
import { matchBackgroundRule } from './background-rules.js';
import { matchCharacterRule } from './character-rules.js';

export function resolveScene(context = {}) {
    const scene = createSceneState({
        ...context.previousScene,
        ...context.shujukuScene,
        ...context.textScene,
    });

    return createSceneState({
        ...scene,
        background: context.background || matchBackgroundRule(scene, context.backgroundRules || []),
        character: context.character || matchCharacterRule(scene, context.characterRules || []),
    });
}
