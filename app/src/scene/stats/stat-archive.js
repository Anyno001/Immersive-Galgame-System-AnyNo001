// 设置页「存档」区的数据（§10）：当前数值与变动记录。纯函数，只读账本。
// 变动记录取自当前生效的各楼快照（active swipe），切换 swipe、删楼后自动一致，不依赖单独维护的日志。
import { stageOf } from './stat-favor.js';
import { currentStatsState, ledgerKey } from './stat-ledger.js';

export const ARCHIVE_LOG_MAX = 30;

export function statsArchiveModel(ledger, { logMax = ARCHIVE_LOG_MAX } = {}) {
    if (!ledger) return null;
    const state = currentStatsState(ledger);
    const rows = [];
    const floors = [...ledger.active.entries()].sort((a, b) => a[0] - b[0]);
    for (const [messageId, swipeId] of floors) {
        const entry = ledger.entries.get(ledgerKey(ledger, messageId, swipeId));
        for (const c of (entry && entry.changes) || []) {
            rows.push({ messageId, target: String(c.target ?? ''), key: String(c.key ?? ''), from: c.from, to: c.to, note: String(c.note ?? '') });
        }
    }
    const characters = Object.entries(state.characters || {}).map(([name, c]) => ({
        name, stage: stageOf(Number(c.dims && c.dims.好感) || 0).name, dims: { ...(c.dims || {}) },
    }));
    const skills = Object.entries((state.protagonist && state.protagonist.skills) || {}).map(([name, s]) => ({
        name, value: Number(s && s.value) || 0, marked: Boolean(s && s.marked),
    }));
    return {
        day: state.clock ? state.clock.day : null,
        bars: { ...((state.protagonist && state.protagonist.bars) || {}) },
        skills,
        characters,
        log: rows.slice(-logMax).reverse(),
        total: rows.length,
    };
}
