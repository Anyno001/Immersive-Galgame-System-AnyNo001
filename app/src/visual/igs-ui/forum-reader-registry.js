import { emptyForum, normalizeForum } from './forum-reader-model.js';

// 论坛登记（标题、板块、楼主、代号）随聊天存在 chatMetadata.igs_forum。
// 渲染只读；兜底值与解析出的登记先放内存，一批渲染完再 flush 写回，写之前核对聊天没换。读不到 chatMetadata（预览页等）时全部留在内存。
export const FORUM_METADATA_KEY = 'igs_forum';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createForumRegistry({ getContext, getChatId }) {
    const pending = new Map();
    const metaOf = () => {
        let context = null;
        try { context = getContext(); } catch (_) { context = null; }
        const metadata = context && context.chatMetadata;
        return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { context, metadata } : null;
    };
    const chatKey = () => String(getChatId() || '');

    function read() {
        const held = metaOf();
        const stored = held ? normalizeForum(held.metadata[FORUM_METADATA_KEY]) : emptyForum();
        const mem = pending.get(chatKey());
        return mem ? normalizeForum(mem) : stored;
    }

    // 登记有变化才暂存；返回是否有变化。
    function stage(next) {
        const data = normalizeForum(next);
        if (same(data, read())) return false;
        pending.set(chatKey(), data);
        return true;
    }

    // 立即写（设置器里手动改）：先暂存再落盘。
    function commit(next) {
        if (!stage(next)) return false;
        flush();
        return true;
    }

    function flush() {
        const key = chatKey();
        const data = pending.get(key);
        const held = metaOf();
        if (!data || !held || !key) return false;
        if (chatKey() !== key) return false;
        held.metadata[FORUM_METADATA_KEY] = data;
        pending.delete(key);
        const save = held.context.saveMetadataDebounced || held.context.saveMetadata;
        if (typeof save === 'function') Promise.resolve(save.call(held.context)).catch(() => null);
        return true;
    }

    return { read, stage, commit, flush };
}
