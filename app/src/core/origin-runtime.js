// 随身系统宿主层（Origin 系统 原作 vicliaaa，经授权移植）：把 scene/origin 的核心接到 IGS。
// 只做四件事：给核心提供 host（上下文、设置、存盘、生成、通知）、按总开关挂/卸监听、登记到界面接入点、设置变化时同步。
// 设置只读：bridge.origin 来自共享只读快照，这里不改它；本聊天数据（世界名、任务方向）核心自己存在 chatMetadata.origin_v2。
import { getSharedOriginEngine } from '../scene/origin/origin-engine.js';
import { attachOriginEngine } from '../visual/igs-ui/origin-attach.js';
import { normalizeOriginSettings, originRequestRoute } from '../visual/igs-ui/origin-settings.js';
import { runBackgroundGeneration, isBackgroundGenerationActive } from '../host/background-generation.js';

// 核心的通知类别 → 阅读器细线的级别。
const NOTICE_LEVEL = Object.freeze({ warn: 'warn', info: 'info' });

export function createOriginRuntime({ getContext, readSettings, readLlm, readProfiles, secondaryLlm, notice, openSettings, saveSetting, legacyActive }) {
    const ctx = () => { try { return getContext() || null; } catch (error) { return null; } };

    async function viaTavern(prompt) {
        const c = ctx();
        if (!c) throw new Error('酒馆上下文不可用');
        // 与原插件一致优先 generateQuietPrompt（带角色卡与聊天上下文）；新版接受对象参数，旧版只认字符串。
        if (typeof c.generateQuietPrompt === 'function') {
            try { return String(await c.generateQuietPrompt({ quietPrompt: prompt }) || ''); } catch (error) {
                return String(await c.generateQuietPrompt(prompt) || '');
            }
        }
        if (typeof c.generateRaw === 'function') return String(await c.generateRaw({ prompt }) || '');
        throw new Error('当前酒馆不支持后台生成');
    }

    // 设置快照引用不变就复用上次规范化的结果：核心按引用缓存 fillSettings，每次给新对象会让它每次都重新序列化比对。
    let lastRaw;
    let lastNorm = null;
    const host = {
        getContext: ctx,
        // 核心内部 fillSettings 会返回新对象，不会改这里给出的快照。
        settings: () => {
            const raw = readSettings();
            if (!lastNorm || raw !== lastRaw) { lastRaw = raw; lastNorm = Object.freeze(normalizeOriginSettings(raw)); }
            return lastNorm;
        },
        saveMetadata: () => {
            const c = ctx();
            const save = c && (c.saveMetadataDebounced || c.saveMetadata);
            if (typeof save === 'function') save.call(c);
        },
        // 经酒馆发起的后台请求会触发全局生成事件；包在 runBackgroundGeneration 里，核心据 isBackground 跳过。
        generate: async (kind, prompt) => {
            const s = normalizeOriginSettings(readSettings());
            // 选了副 LLM 预设才读预设文件；读失败按没选处理（回落「备用模型」页当前连接）。
            let profiles = null;
            if (s.route === 'llm' && s.llmProfile && typeof readProfiles === 'function') {
                try { profiles = await readProfiles(); } catch (error) { profiles = null; }
            }
            const route = originRequestRoute(s, readLlm(), profiles);
            // 备用模型直接发请求，不触发酒馆生成事件，不必标后台；标了反而会让这期间用户正常发的消息漏掉注入。
            if (route.via === 'llm' && secondaryLlm) return secondaryLlm.request({ system: '', user: prompt }, route.llm);
            return runBackgroundGeneration(() => viaTavern(prompt));
        },
        isBackground: () => isBackgroundGenerationActive(),
        notify: ({ kind, text }) => {
            if (!text || typeof notice !== 'function') return;
            try { notice(NOTICE_LEVEL[kind] || 'info', String(text)); } catch (error) { /* 细线出错不影响结算 */ }
        },
        legacyActive: () => { try { return Boolean(legacyActive && legacyActive()); } catch (error) { return false; } },
    };

    const engine = getSharedOriginEngine(host);
    const detach = attachOriginEngine(engine, {
        settings: readSettings,
        notice: (level, text) => host.notify({ kind: level, text }),
        openSettings,
        saveSetting,
    });

    return {
        engine,
        // 总开关或其他设置变化后调用：开就挂监听并读存档，关就解绑。
        sync: () => engine.sync(),
        destroy: () => { try { engine.release(); } catch (error) { /* */ } detach(); },
    };
}

// 原版 Origin 扩展在页面里时会挂 #origin-root 悬浮层并在 extension_settings.origin 里开着。
export function originLegacyActive(globalObject) {
    try {
        const doc = globalObject && globalObject.document;
        if (!doc || !doc.getElementById('origin-root')) return false;
        const ext = globalObject.extension_settings || (globalObject.SillyTavern && globalObject.SillyTavern.getContext && globalObject.SillyTavern.getContext().extensionSettings);
        return !ext || !ext.origin || ext.origin.enabled !== false;
    } catch (error) {
        return false;
    }
}
