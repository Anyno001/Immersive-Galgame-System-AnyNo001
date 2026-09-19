import {
    fetchModels as fetchImageModelsFromApi,
    generateImage as generateImageFromApi,
} from '../image-api-client.js';

export const naiProvider = {
    id: 'vn.provider.nai',
    type: 'image-provider',
    providerType: 'nai',
    label: 'NAI',
    permissions: ['network'],

    async detect(context = {}) {
        return resolveImageApiSettings(context).mode === 'nai';
    },

    async fetchModels(_request = {}, context = {}) {
        const imageApi = resolveImageApiSettings(context);
        return fetchImageModelsFromApi(imageApi, buildNetworkDependencies(context));
    },

    async generate(request = {}, context = {}) {
        const imageApi = resolveImageApiSettings(context);
        if (imageApi.mode !== 'nai') {
            return { ok: false, reason: 'provider-not-enabled', request };
        }
        const result = await generateImageFromApi(request, imageApi, buildNetworkDependencies(context));
        return {
            ok: true,
            ...result,
            providerId: 'vn.provider.nai',
            source: 'generated-image',
        };
    },

    async poll(task) {
        return task;
    },

    extractImages() {
        return [];
    },
};

function resolveImageApiSettings(context = {}) {
    const unifiedSettings = context.unifiedSettings || context.settings || {};
    const bridge = unifiedSettings.bridge && typeof unifiedSettings.bridge === 'object'
        ? unifiedSettings.bridge
        : {};
    const imageApi = unifiedSettings.imageApi && typeof unifiedSettings.imageApi === 'object'
        ? unifiedSettings.imageApi
        : bridge.imageApi && typeof bridge.imageApi === 'object'
            ? bridge.imageApi
            : {};
    return {
        mode: String(imageApi.mode || 'nai').trim() || 'nai',
        ...imageApi,
    };
}

function buildNetworkDependencies(context = {}) {
    return {
        fetch: context.fetch,
        AbortController: context.AbortController,
        setTimeout: context.setTimeout,
        clearTimeout: context.clearTimeout,
        global: context.global,
    };
}
