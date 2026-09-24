// Project-owned, static SVG paths; database values never enter SVG markup.
const svg = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
export const RECORD_ICONS = Object.freeze({
    map: svg('<path d="M12 22s7-6 7-13a7 7 0 1 0-14 0c0 7 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/>'),
    diary: svg('<path d="M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 0v18m3-13h8m-8 4h8"/>'),
    inventory: svg('<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-4 0v14"/>'),
    relationships: svg('<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 20v-2a5 5 0 0 1 10 0v2m0 0v-2a5 5 0 0 1 10 0v2"/>'),
    generic: svg('<path d="M4 7h16v14H4zM4 7l3-4h10l3 4M8 12h8"/>'),
    key: svg('<circle cx="8" cy="9" r="4"/><path d="m11 12 9 9m-3-3 2-2"/>'),
    weapon: svg('<path d="M4 20 19 5l2-2-5 1L3 17l4 4"/>'),
    book: svg('<path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14"/>'),
    potion: svg('<path d="M9 3h6m-5 0v6l-4 6a4 4 0 0 0 4 6h4a4 4 0 0 0 4-6l-4-6V3M8 15h8"/>'),
});

export function inventoryIconKey(name) {
    const text = String(name || '');
    if (/钥匙|锁匙/.test(text)) return 'key';
    if (/剑|刀|弓|枪|匕首/.test(text)) return 'weapon';
    if (/书|卷轴|笔记/.test(text)) return 'book';
    if (/药|药水|试剂/.test(text)) return 'potion';
    return 'generic';
}
