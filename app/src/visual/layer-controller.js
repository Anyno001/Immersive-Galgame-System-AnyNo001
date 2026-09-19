export function createLayerController(layers) {
    return {
        render(stage) {
            const renderedLayers = [];
            const layerResults = {};

            for (const [name, layer] of Object.entries(layers || {})) {
                if (layer && typeof layer.render === 'function') {
                    renderedLayers.push(name);
                    layerResults[name] = layer.render(stage, stage && stage.scene);
                }
            }

            return { ok: true, renderedLayers, layerResults };
        },
    };
}
