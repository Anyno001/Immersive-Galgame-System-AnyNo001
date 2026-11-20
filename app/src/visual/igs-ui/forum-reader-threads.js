// 论坛体多楼主：按楼取帖子与标题的纯查表函数（不依赖别的论坛模块，避免循环引用）。
// data = { threads:[{ id, po, titles:[{from,title}], ... }], timeline:[{from,thread}] }，from 是酒馆楼 messageId。

// 第 N 楼属于哪个帖子：timeline 里 from<=N 的最后一条；一条都没有时退回第一个帖子。
export function threadAt(data, messageId) {
    const threads = data && Array.isArray(data.threads) ? data.threads : [];
    if (!threads.length) return null;
    const n = Number.isFinite(Number(messageId)) ? Number(messageId) : Infinity;
    let hit = null;
    for (const entry of Array.isArray(data.timeline) ? data.timeline : []) if (entry.from <= n) hit = entry;
    return (hit && threads.find((t) => t.id === hit.thread)) || threads[0];
}

// 第 N 楼该帖用哪个标题：titles 里 from<=N 的最后一条；没有就用第一条。
export function titleAt(thread, messageId) {
    const titles = thread && Array.isArray(thread.titles) ? thread.titles : [];
    if (!titles.length) return '';
    const n = Number.isFinite(Number(messageId)) ? Number(messageId) : Infinity;
    let hit = titles[0];
    for (const entry of titles) if (entry.from <= n) hit = entry;
    return hit.title;
}

export function samePo(a, b) {
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === 'char') return a.key === b.key;
    if (a.kind === 'witness') return String(a.note || '') === String(b.note || '');
    return true;
}

export function describePo(po) {
    if (!po) return '';
    if (po.kind === 'user') return '{{user}}';
    if (po.kind === 'witness') return `路人${po.note ? `:${po.note}` : ''}`;
    return po.key || '';
}
