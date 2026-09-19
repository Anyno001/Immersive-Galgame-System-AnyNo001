const STAGE_SLOTS = Object.freeze([
    '.igs-stage',
    '.igs-background-layer',
    '.igs-generated-layer',
    '.igs-effect-layer',
    '.igs-character-layer',
    '.igs-avatar-layer',
    '.igs-dialogue-layer',
    '.igs-hud-layer',
    '.igs-toolbar',
    '.igs-choice-layer',
    '.igs-system-layer',
]);

export function createStageModel(scene = {}, readerState, options = {}) {
    const safeScene = cloneData(scene || {});
    const safeReaderState = cloneData(readerState || {});
    const visualMode = safeScene.visualMode || 'background-character';
    const hasGenerated = Boolean(safeScene.generatedImage);
    const showDialogue = visualMode !== 'off';
    const showGenerated = shouldShowGenerated(visualMode, hasGenerated);
    const showBackground = shouldShowBackground(visualMode, hasGenerated, safeScene.background);
    const showCharacter = shouldShowCharacter(visualMode, hasGenerated, safeScene.character);
    const showAvatar = Boolean(safeReaderState.avatarVisible) && Boolean(safeScene.speaker) && visualMode !== 'off';
    const attributes = cloneData(safeReaderState.attributes || {});
    const cssVars = cloneData(safeReaderState.cssVars || {});

    return Object.freeze({
        type: 'igs-stage-model',
        layout: safeReaderState.layout || 'desktop',
        visualMode,
        scene: safeScene,
        readerState: safeReaderState,
        slots: STAGE_SLOTS.slice(),
        attributes,
        datasetKeys: Object.keys(attributes),
        cssVars,
        layers: {
            background: {
                slot: '.igs-background-layer',
                visible: showBackground,
                resource: cloneData(safeScene.background) || null,
            },
            generated: {
                slot: '.igs-generated-layer',
                visible: showGenerated,
                resource: cloneData(safeScene.generatedImage) || null,
            },
            effect: {
                slot: '.igs-effect-layer',
                visible: Boolean(safeScene.weather || safeScene.time || safeScene.location),
                weather: safeScene.weather || '',
                time: safeScene.time || '',
                location: safeScene.location || '',
            },
            character: {
                slot: '.igs-character-layer',
                visible: showCharacter,
                character: cloneData(safeScene.character) || null,
            },
            avatar: {
                slot: '.igs-avatar-layer',
                visible: showAvatar,
                speaker: safeScene.speaker || '',
                emotion: safeScene.emotion || '',
            },
            dialogue: {
                slot: '.igs-dialogue-layer',
                visible: showDialogue,
                style: safeReaderState.dialogueStyle || 'panel',
                speaker: safeScene.speaker || '',
                text: safeScene.text || '',
                nameplateVisible: Boolean(safeReaderState.nameplateVisible),
                avatarVisible: Boolean(safeReaderState.avatarVisible),
            },
            hud: {
                slot: '.igs-hud-layer',
                visible: showDialogue,
                toolbar: {
                    slot: '.igs-toolbar',
                    visible: showDialogue,
                    layout: safeReaderState.toolbarLayout || 'horizontal',
                    placement: safeReaderState.toolbarPlacement || 'top-right',
                    attributes: {
                        'data-placement': safeReaderState.toolbarPlacement || 'top-right',
                    },
                },
            },
            choice: {
                slot: '.igs-choice-layer',
                visible: Boolean(options.choiceState && options.choiceState.visible),
                items: cloneData(options.choiceState && options.choiceState.items) || [],
            },
            system: {
                slot: '.igs-system-layer',
                visible: true,
                messages: cloneData(options.systemMessages) || [],
            },
        },
    });
}

function shouldShowGenerated(visualMode, hasGenerated) {
    if (!hasGenerated) return false;
    return [
        'generated-only',
        'generated-first',
        'generated-with-avatar',
        'mixed-overlay',
    ].includes(visualMode);
}

function shouldShowBackground(visualMode, hasGenerated, background) {
    if (!background) return visualMode === 'default-background';
    if (visualMode === 'off' || visualMode === 'text-only' || visualMode === 'generated-only') return false;
    if (visualMode === 'generated-first' || visualMode === 'generated-with-avatar') return !hasGenerated;
    return true;
}

function shouldShowCharacter(visualMode, hasGenerated, character) {
    if (!character) return false;
    if (visualMode === 'off' || visualMode === 'text-only' || visualMode === 'generated-only') return false;
    if (visualMode === 'generated-first' || visualMode === 'generated-with-avatar') return !hasGenerated;
    return true;
}

function cloneData(value) {
    if (value == null) return value;
    if (Array.isArray(value)) return value.map(cloneData);
    if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneData(item)]));
    }
    return value;
}
