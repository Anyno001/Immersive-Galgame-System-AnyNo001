// 服务只消费来源中立名称；旧注入后端在这一处转发，保留参数和原接收者。
const LEGACY_METHODS = {
    writePrompt: 'writeDbgenPrompt',
    writeFloorPrompts: 'writeDbgenFloorPrompts',
    generateCaption: 'generateDbgenCaption',
};

export function imageBackendMethod(backend, name) {
    const key = typeof backend?.[name] === 'function' ? name : LEGACY_METHODS[name];
    return key && typeof backend?.[key] === 'function'
        ? (...args) => backend[key](...args) : null;
}
