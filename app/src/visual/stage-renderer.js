import { createReaderState } from './reader-state.js';
import { createStageModel } from './stage-model.js';

export function createStageRenderer(layerController) {
    if (!layerController || typeof layerController.render !== 'function') {
        throw new Error('IGS stage renderer requires a layer controller.');
    }

    return {
        render(scene, options = {}) {
            const readerState = createReaderState(options);
            const stage = createStageModel(scene, readerState, options);
            const layerResult = layerController.render(stage);

            return {
                ok: layerResult.ok !== false,
                stage,
                renderedLayers: layerResult.renderedLayers || [],
                layerResults: layerResult.layerResults || {},
            };
        },
    };
}
