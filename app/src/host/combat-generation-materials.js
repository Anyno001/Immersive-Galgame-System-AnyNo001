import { getSillyTavernContext, getTavernHelper } from './tavern-helper-adapter.js';
import { createShujukuClient } from '../data/shujuku/client.js';
import { collectCombatSkillMaterials } from '../data/shujuku/combat-skill-materials.js';
import { discoverMvuMaterials, materialActorNames } from '../combat/generation-materials.js';

const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function findMvu(host) {
    for (const get of [() => host, () => host.parent, () => host.top]) {
        try { const target = get(); if (typeof target?.Mvu?.getMvuData === 'function') return target.Mvu; } catch { /* 跨域窗口不可读 */ }
    }
    return null;
}

// 只读当前聊天的最新有效楼层快照；不解析更新命令、不回写变量、不读全局变量。
async function readMvu(host, chat) {
    const mvu = findMvu(host);
    const helper = getTavernHelper(host);
    const read = mvu ? (options) => mvu.getMvuData(options)
        : typeof helper?.getVariables === 'function' ? (options) => helper.getVariables(options) : null;
    let error = false;
    if (read) {
        for (let i = chat.length - 1; i >= Math.max(0, chat.length - 40); i -= 1) {
            try {
                const swipe = chat[i]?.swipe_id;
                const data = await read({ type: 'message', message_id: i });
                if (chat[i]?.swipe_id !== swipe) return { status: 'error', data: {}, floor: null };
                if (record(data?.stat_data)) return { status: 'ready', data: data.stat_data, floor: i };
            } catch { error = true; break; }
        }
        try {
            const data = await read({ type: 'chat' });
            if (record(data?.stat_data)) return { status: 'ready', data: data.stat_data, floor: 'chat' };
        } catch { error = true; }
    }
    // 禁止使用 swipe 之外的旧快照；直存 stat_data 的旧版卡无需安装新 MVU 接口。
    if (!read) {
        for (let i = chat.length - 1; i >= 0; i -= 1) {
            if (record(chat[i]?.stat_data)) return { status: 'ready', data: chat[i].stat_data, floor: i };
        }
    }
    return { status: error || mvu ? 'error' : 'absent', data: {}, floor: null };
}

export function createCombatGenerationMaterials(host = globalThis) {
    return async function read({ name, protagonist, signal } = {}) {
        const ctx = getSillyTavernContext(host);
        const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
        const names = materialActorNames(name, protagonist);
        const mvu = await readMvu(host, chat);
        if (signal?.aborted) return { ok: false, reason: 'request-stale' };
        const api = host.AutoCardUpdaterAPI;
        const tableRead = createShujukuClient(api).readTables();
        const tableStatus = !api ? 'absent' : tableRead.ok && record(tableRead.data) && Object.keys(tableRead.data).length ? 'ready' : 'error';
        return { ok: true, name, mvuStatus: mvu.status, mvuFloor: mvu.floor, statData: mvu.data,
            candidates: discoverMvuMaterials(mvu.data, names), tableStatus,
            tables: tableStatus === 'ready' ? collectCombatSkillMaterials(tableRead.data, names) : [] };
    };
}
