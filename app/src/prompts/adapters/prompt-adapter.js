export function createPromptAdapter(builders = {}) {
    return {
        selectBuilder(providerType) {
            return builders[providerType] || null;
        },

        createPromptContext(scene = {}, runtimeState = {}) {
            return {
                scene,
                speaker: scene.speaker || '',
                emotion: scene.emotion || '',
                location: scene.location || '',
                time: scene.time || '',
                weather: scene.weather || '',
                runtime: runtimeState,
            };
        },

        buildRequest(providerType, promptContext, promptPreset, providerPreset) {
            const builder = this.selectBuilder(providerType);
            if (!builder) {
                return { ok: false, reason: 'missing-request-builder', providerType };
            }
            const request = builder.buildRequest(promptContext, promptPreset, providerPreset);
            return {
                ok: builder.validateRequest(request),
                request,
            };
        },
    };
}
