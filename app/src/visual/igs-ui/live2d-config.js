import { resolveMoodGroup } from '../../scene/mood-groups.js';
import { resolveCharacterKey } from '../../scene/scene-directives.js';
// 独立按角色卡隔离；不修改上游图包/桥接设置 schema。
export const LIVE2D_STORAGE_KEY = 'igs:live2d:v1:';
export const LIVE2D_RUNTIME = Object.freeze({
    core2: 'https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js',
    core4: 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
});
export function live2dUrl(value) {
    const url = new URL(String(value || '').trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('模型与运行库只接受不含账号密码的 HTTP(S) 地址');
    return url.href;
}
export function normalizeLive2dConfig(raw = {}) {
    const bindings = Object.create(null);
    for (const [name, entry] of Object.entries(raw.bindings || {})) {
        if (!name.trim() || !entry || entry.enabled === false) continue;
        const moods = Object.create(null);
        for (const [mood, action] of Object.entries(entry.moods || {})) {
            if (!action || typeof action !== 'object') throw new Error('每个情绪映射必须是对象');
            const out = {};
            if (typeof action.expression === 'string') out.expression = action.expression;
            if (typeof action.motion === 'string' && action.motion) {
                out.motion = action.motion;
                out.index = Number(action.index == null ? 0 : action.index);
                if (!Number.isInteger(out.index) || out.index < 0) throw new Error('动作 index 必须是非负整数');
            }
            moods[mood] = out;
        }
        const layout = {};
        for (const key of ['scale', 'posX', 'posY']) {
            if (entry.layout?.[key] == null || entry.layout[key] === '') continue;
            const v = Number(entry.layout[key]);
            if (!Number.isFinite(v) || (key === 'scale' ? v < 1 || v > 500 : v < -200 || v > 300)) throw new Error('模型位置或缩放超出范围');
            layout[key] = v;
        }
        const modelId = typeof entry.modelId === 'string' ? entry.modelId : '';
        if (modelId && !/^[a-zA-Z0-9_-]{1,100}$/.test(modelId)) throw new Error('本地模型标识无效');
        bindings[name.trim()] = { ...(modelId ? { modelId, modelName: String(entry.modelName || '').slice(0, 300) } : { url: live2dUrl(entry.url) }), moods, layout };
    }
    return { version: 1, enabled: raw.enabled !== false, bindings, runtime: {
        core2: live2dUrl(raw.runtime?.core2 || LIVE2D_RUNTIME.core2),
        core4: live2dUrl(raw.runtime?.core4 || LIVE2D_RUNTIME.core4),
    } };
}
export function readLive2dConfig(storage, scope = '') {
    try { return normalizeLive2dConfig(JSON.parse(storage?.getItem(LIVE2D_STORAGE_KEY + scope) || '{}')); }
    catch { return normalizeLive2dConfig(); }
}
export function saveLive2dConfig(storage, scope, config) {
    const normalized = normalizeLive2dConfig(config);
    if (!storage?.setItem) throw new Error('浏览器存储不可用，未保存');
    storage.setItem(LIVE2D_STORAGE_KEY + scope, JSON.stringify(normalized));
    return normalized;
}
export function resolveLive2dBinding(config, character, mood, alias = '', moodGroups = null) {
    if (!config?.enabled) return null;
    const binding = config.bindings?.[character] || config.bindings?.[alias];
    if (!binding) return null;
    const group = resolveMoodGroup(mood, moodGroups);
    return { ...binding, character, mood, action: binding.moods[mood] || (group && binding.moods[group]) || binding.moods['*'] || binding.moods['默认'] || {}, runtime: config.runtime };
}

// 在读取任何静态差分前判断；原角色别名也适用于仅有模型、没有静态图的角色。
export function resolveCharacterLive2dBinding(config, sceneAssets, character, mood = '') {
    if (!config?.enabled) return null;
    const names = { ...sceneAssets?.characters, ...config.bindings };
    const key = resolveCharacterKey(sceneAssets?.characters, sceneAssets?.characterAliases, character)
        || resolveCharacterKey(names, sceneAssets?.characterAliases, character);
    const direct = resolveLive2dBinding(config, character, mood, key || '', sceneAssets?.moodGroups);
    if (direct || !key) return direct;
    // 兼容旧配置把模型绑定在别名上的情况，主名称也必须暂停静态差分。
    const boundAlias = Object.keys(config.bindings || {}).find(name => resolveCharacterKey(sceneAssets?.characters, sceneAssets?.characterAliases, name) === key);
    return boundAlias ? resolveLive2dBinding(config, character, mood, boundAlias, sceneAssets?.moodGroups) : null;
}
