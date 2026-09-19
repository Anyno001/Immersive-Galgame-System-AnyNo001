export const VISUAL_MODES = Object.freeze({
    OFF: 'off',
    TEXT_ONLY: 'text-only',
    DEFAULT_BACKGROUND: 'default-background',
    BACKGROUND_CHARACTER: 'background-character',
    GENERATED_ONLY: 'generated-only',
    GENERATED_FIRST: 'generated-first',
    GENERATED_WITH_AVATAR: 'generated-with-avatar',
    MIXED_OVERLAY: 'mixed-overlay',
});

export function resolveVisualMode(scene, settings = {}) {
    if (settings.visualMode) return settings.visualMode;
    if (scene.generatedImage) return VISUAL_MODES.GENERATED_FIRST;
    return VISUAL_MODES.BACKGROUND_CHARACTER;
}
