// Project-owned, static SVG paths; database values never enter SVG markup.
const svg = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
export const RECORD_ICONS = Object.freeze({
    map: svg('<circle cx="12" cy="12" r="9"/><path d="M6.5 9.5c1.8-1.6 4-1.8 5.5-.6 1.2 1 2.6 1 3.6.1M7 15c1.6-.8 3.4-.5 4.4.8.9 1.2 2.3 1.6 3.8 1M13 4.2c-.8 1.8-.6 3.6.6 4.8"/>'),
    pin: svg('<path d="M12 22s7-6 7-13a7 7 0 1 0-14 0c0 7 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/>'),
    back: svg('<path d="m15 18-6-6 6-6"/>'),
    diary: svg('<path d="M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 0v18m3-13h8m-8 4h8"/>'),
    inventory: svg('<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-4 0v14"/>'),
    relationships: svg('<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 20v-2a5 5 0 0 1 10 0v2m0 0v-2a5 5 0 0 1 10 0v2"/>'),
    generic: svg('<path d="M4 7h16v14H4zM4 7l3-4h10l3 4M8 12h8"/>'),
    key: svg('<circle cx="8" cy="9" r="4"/><path d="m11 12 9 9m-3-3 2-2"/>'),
    weapon: svg('<path d="M4 20 19 5l2-2-5 1L3 17l4 4"/>'),
    book: svg('<path d="M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14"/>'),
    potion: svg('<path d="M9 3h6m-5 0v6l-4 6a4 4 0 0 0 4 6h4a4 4 0 0 0 4-6l-4-6V3M8 15h8"/>'),
    food: svg('<path d="M6 3v7m3-7v7m-1.5 0V21M18 3v18m0-18c-3 2-3 6 0 8"/>'),
    armor: svg('<path d="m12 3 7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z"/><path d="M9 11h6m-3-3v6"/>'),
    money: svg('<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5c-.7-.7-1.5-1-2.5-1-1.7 0-3 .8-3 2s1.3 2 3 2 3 .8 3 2-1.3 2-3 2c-1 0-1.8-.3-2.5-1M12 6v12"/>'),
    tool: svg('<path d="m14.5 6.5 3-3a4 4 0 0 1-5 5L5 16a2.8 2.8 0 1 0 4 4l7.5-7.5a4 4 0 0 1 5-5l-3 3"/>'),
    gem: svg('<path d="m4 9 4-5h8l4 5-8 10L4 9Z"/><path d="M4 9h16M8 4l4 15 4-15"/>'),
});

const INVENTORY_ICON_RULES = Object.freeze([
    ['key', /钥匙|锁匙|钥匙扣|门卡|门禁/],
    ['weapon', /剑|刀|弓|枪|匕首|武器|长矛|棍棒|锤子/],
    ['book', /书|卷轴|笔记|日记|册|档案|信件|信封|纸条/],
    ['potion', /药|药水|药剂|试剂|灵药|药瓶/],
    ['food', /食物|面包|苹果|饭|水果|肉|饮料|牛奶/],
    ['armor', /铠|护甲|盔|盾|衣|服装|鞋|披风/],
    ['money', /钱|金币|硬币|货币|银币|铜币/],
    ['tool', /工具|扳手|斧|钳|火柴|绳|提灯/],
    ['gem', /宝石|水晶|钻石|珠|玉石/],
]);

export function inventoryIconKey(name) {
    const text = String(name || '').trim();
    const matched = INVENTORY_ICON_RULES.find(([, pattern]) => pattern.test(text));
    if (matched) return matched[0];
    return 'generic';
}
