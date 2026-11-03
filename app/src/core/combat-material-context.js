import { compactMaterial, GENERATION_HINT_LIMIT, selectGenerationMaterials } from '../combat/generation-materials.js';

// 预览与发送共用同一个读取入口；确认时重读，切聊天或选中的资料消失就停止。
export function createCombatMaterialContext({ read, getChatId, getUserName }) {
    async function inspect({ name, selection, signal } = {}) {
        const chatId = getChatId();
        let source;
        try { source = typeof read === 'function' ? await read({ name, protagonist: getUserName(), signal })
            : { ok: true, candidates: [], tables: [], mvuStatus: 'absent', tableStatus: 'absent' }; }
        catch { return { ok: false, reason: 'combat-material-read-failed' }; }
        if (signal?.aborted || getChatId() !== chatId) return { ok: false, reason: 'request-stale' };
        if (source?.ok !== true) return source || { ok: false, reason: 'combat-material-read-failed' };
        const chosen = selectGenerationMaterials(source, selection);
        return { ...chosen, chatId, name, mvuStatus: source.mvuStatus, mvuFloor: source.mvuFloor, tableStatus: source.tableStatus,
            candidates: source.candidates.map(({ value, ...item }) => ({ ...item, preview: JSON.stringify(compactMaterial(value)) })),
            tables: source.tables.map(({ rows, ...item }) => ({ ...item, count: rows.length, preview: JSON.stringify(compactMaterial(rows)) })) };
    }
    async function load({ name, generationHint = '', materialSelection, materialChatId, signal } = {}) {
        if (materialChatId !== undefined && materialChatId !== getChatId()) return { ok: false, reason: 'request-stale' };
        const hint = String(generationHint || '').trim();
        if (hint.length > GENERATION_HINT_LIMIT) return { ok: false, reason: 'combat-generation-hint-too-long' };
        const result = await inspect({ name, selection: materialSelection, signal });
        if (!result.ok) return result;
        return { ok: true, context: { ...(hint ? { generationHint: hint } : {}),
            ...(result.materials.mvu.length || result.materials.tables.length ? { characterMaterials: result.materials } : {}) } };
    }
    return { inspect, load };
}
