const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
// 仅用于进程内变更检测；不保留配置和凭据的序列化副本。
function fingerprint(value) {
    const text = JSON.stringify(canonical(value));
    let a = 1779033703, b = 3144134277, c = 1013904242, d = 2773480762;
    for (let i = 0; i < text.length; i += 1) {
        const k = text.charCodeAt(i);
        a = b ^ Math.imul(a ^ k, 597399067); b = c ^ Math.imul(b ^ k, 2869860233);
        c = d ^ Math.imul(c ^ k, 951274213); d = a ^ Math.imul(d ^ k, 2716044179);
    }
    return [text.length, a >>> 0, b >>> 0, c >>> 0, d >>> 0].join(':');
}
const ROUTE_EVENTS = ['MAIN_API_CHANGED', 'CHATCOMPLETION_SOURCE_CHANGED', 'CHATCOMPLETION_MODEL_CHANGED',
    'OAI_PRESET_CHANGED_AFTER', 'CONNECTION_PROFILE_CREATED',
    'CONNECTION_PROFILE_LOADED', 'CONNECTION_PROFILE_UPDATED', 'CONNECTION_PROFILE_DELETED',
    'SECRET_WRITTEN', 'SECRET_DELETED', 'SECRET_ROTATED', 'SECRET_EDITED'];

export function createModelRouteIdentity({ getContext, readConfig, owner = () => null }) {
    let signature, identity, heldOwner, refs = [], source = null, bindings = [], epoch = 0, disposed = false;
    const changed = () => { epoch += 1; };
    function unbind() {
        for (const [name, fn] of bindings) {
            if (typeof source?.removeListener === 'function') source.removeListener(name, fn);
            else source?.off?.(name, fn);
        }
        bindings = []; source = null;
    }
    function get() {
        if (disposed) return null;
        const config = readConfig() || {};
        const ctx = getContext() || {};
        const tavern = config.llm?.source !== 'openai';
        const bus = tavern ? ctx.eventSource : null;
        if (source !== bus) {
            unbind(); source = bus; changed();
            const types = ctx.eventTypes || ctx.event_types || {};
            for (const key of ROUTE_EVENTS) {
                const name = types[key];
                if (!name || !source?.on) continue;
                source.on(name, changed); bindings.push([name, changed]);
            }
        }
        const settings = ctx.chatCompletionSettings || {};
        const text = ctx.textCompletionSettings || {};
        const route = tavern ? { api: ctx.mainApi, model: ctx.getChatCompletionModel?.(),
            server: ctx.getTextGenServer?.(), text: Object.fromEntries(Object.entries(text)
                .filter(([key]) => key === 'type' || key === 'server_urls' || /_model$|_providers$/.test(key))),
            source: settings.chat_completion_source, custom: settings.custom_url,
            proxy: settings.reverse_proxy, password: settings.proxy_password,
            headers: settings.custom_include_headers, body: settings.custom_include_body,
            exclude: settings.custom_exclude_body, azure: [settings.azure_base_url, settings.azure_deployment_name, settings.azure_api_version],
            providers: settings.openrouter_providers, fallbacks: settings.openrouter_allow_fallbacks } : null;
        const next = fingerprint({ config, route, epoch });
        const nextOwner = owner();
        const nextRefs = tavern
            ? [ctx.generateRaw, ctx.generateQuietPrompt, ctx.ChatCompletionService, ctx.ChatCompletionService?.sendRequest]
            : [];
        if (!identity || signature !== next || heldOwner !== nextOwner || nextRefs.length !== refs.length || nextRefs.some((ref, i) => ref !== refs[i])) {
            signature = next; heldOwner = nextOwner; refs = nextRefs;
            identity = Object.freeze({});
        }
        return identity;
    }
    return { get, dispose() { disposed = true; unbind(); signature = undefined; identity = null; refs = []; heldOwner = null; } };
}
