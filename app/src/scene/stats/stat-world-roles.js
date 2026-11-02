// 世界书角色登记（数值系统）：结算里的解析器是同步的，不能查世界书；这里只存「已确认」缓存，
// 标签里出现过但还不认识的名字，由 confirm 异步查询，每个名字只查一次，缓存按聊天作废。
const NOT_ROLES = Object.freeze(['系统', '旁白', '主角', '我', '你', '玩家', 'user', '{{user}}', '<user>']);
const NAME_MAX = 20;
const RETRY_MAX = 2;

export function createWorldRoles({ lookup } = {}) {
    let scope = '';
    let found = new Set();
    let done = new Set();
    let tries = new Map();

    function sync(chatId) {
        const id = String(chatId ?? '');
        if (id === scope) return;
        scope = id;
        found = new Set();
        done = new Set();
        tries = new Map();
    }

    const usable = (name, exclude) => {
        const text = String(name ?? '').trim();
        return text && text.length <= NAME_MAX && !NOT_ROLES.includes(text.toLowerCase()) && !exclude.has(text);
    };

    // lookup(名字) 返回 true（有条目）、false（没有）；读不到世界书时返回 null，不记入「已查」，最多再试 RETRY_MAX 次。
    async function confirm(names, { chatId = scope, exclude = [] } = {}) {
        sync(chatId);
        const skip = new Set(exclude.map((n) => String(n ?? '').trim()).filter(Boolean));
        const fresh = [...new Set(names)].map((n) => String(n ?? '').trim()).filter((n) => usable(n, skip) && !found.has(n) && !done.has(n));
        const result = { found: [], missing: [] };
        if (typeof lookup !== 'function') return result;
        for (const name of fresh) {
            const attempt = (tries.get(name) || 0) + 1;
            tries.set(name, attempt);
            let hit = null;
            try { hit = await lookup(name); } catch (error) { hit = null; }
            if (String(chatId ?? '') !== scope) return result;
            if (hit === true) { found.add(name); result.found.push(name); }
            else if (hit === false || attempt >= RETRY_MAX) { done.add(name); result.missing.push(name); }
        }
        return result;
    }

    return { sync, confirm, has: (name) => found.has(name) };
}
