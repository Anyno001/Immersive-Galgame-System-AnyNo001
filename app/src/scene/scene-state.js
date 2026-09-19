export const EMPTY_SCENE_STATE = Object.freeze({
    messageId: null,
    speaker: '',
    emotion: '',
    text: '',
    textSource: '',
    formattedText: '',
    sourceKind: 'raw-text',
    formatSourceKind: 'raw-text',
    textPipelineWarnings: [],
    textPipelineErrors: [],
    time: '',
    weather: '',
    location: '',
    background: null,
    character: null,
    generatedImage: null,
    visualMode: 'background-character',
});

export function createSceneState(patch = {}) {
    return Object.freeze({
        ...EMPTY_SCENE_STATE,
        ...patch,
    });
}
