export const naiRequestBuilder = {
    providerType: 'nai',
    schemaVersion: 1,

    buildRequest(promptContext = {}, promptPreset = {}, providerPreset = {}) {
        const data = promptPreset.data || {};
        const providerOptions = providerPreset.data || {};

        return {
            providerType: 'nai',
            prompt: renderTemplate(data.prompt || '', promptContext),
            negativePrompt: renderTemplate(data.negativePrompt || '', promptContext),
            model: providerOptions.model || data.model || '',
            parameters: {
                ...(data.parameters || {}),
                ...(providerOptions.parameters || {}),
            },
        };
    },

    validateRequest(request) {
        return !!(request && request.providerType === 'nai' && request.prompt);
    },
};

function renderTemplate(template, context) {
    return String(template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
        const value = key.split('.').reduce((current, part) => {
            if (!current || typeof current !== 'object') return '';
            return current[part];
        }, context);
        return value == null ? '' : String(value);
    });
}
