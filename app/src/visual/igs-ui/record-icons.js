// Project-owned, static SVG paths; database values never enter SVG markup.
// 统一细线描边：24 网格、圆角端点，粗细由样式层 stroke-width 控制（默认 1.3）。
const svg = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const ITEM_ICONS = Object.freeze({
    key: svg('<circle cx="7.5" cy="16.5" r="3.5"/><path d="M10 14 20 4M16.5 7.5 19 10M18.5 5.5l2 2"/>'),
    card: svg('<rect x="3" y="5.5" width="18" height="13" rx="2"/><circle cx="8.5" cy="11" r="1.8"/><path d="M5.8 15.5c.5-1.2 1.5-1.9 2.7-1.9s2.2.7 2.7 1.9M14 10h4M14 13.5h3"/>'),
    ticket: svg('<path d="M3.5 8.5V6.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v2a2.5 2.5 0 0 0 0 5v2a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-2a2.5 2.5 0 0 0 0-5Z"/><path d="M15 6v1.5M15 11.2v1.6M15 16.5V18"/>'),
    note: svg('<path d="M5.5 3.5h9l4 4v13h-13Z"/><path d="M14.5 3.5v4h4M8.5 11.5h7M8.5 14.5h7M8.5 17.5h4"/>'),
    envelope: svg('<rect x="3" y="5.5" width="18" height="13" rx="1.8"/><path d="m3.6 6.6 8.4 6.4 8.4-6.4"/>'),
    notebook: svg('<path d="M6.5 3.5h11a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-11Z"/><path d="M4.5 7.5h3.5M4.5 12h3.5M4.5 16.5h3.5M11 8h4.5M11 11.5h4.5"/>'),
    book: svg('<path d="M12 6.8C10.2 5.2 7.4 4.6 4 4.8v13c3.4-.2 6.2.4 8 2 1.8-1.6 4.6-2.2 8-2v-13c-3.4-.2-6.2.4-8 2Z"/><path d="M12 6.8v13"/>'),
    photo: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="1.8"/><circle cx="15.5" cy="9" r="1.6"/><path d="m3.8 16.2 4.7-4.2 4 3.5 2.8-2.3 4.9 4.3"/>'),
    map: svg('<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2Z"/><path d="M9 4.5v13M15 6.5v13"/>'),
    pen: svg('<path d="m16.5 3.5 4 4L8 20H4v-4Z"/><path d="m14 6 4 4"/>'),
    potion: svg('<path d="M9.5 3.5h5M10.5 3.5v5.2L5.4 18.2a1.9 1.9 0 0 0 1.7 2.8h9.8a1.9 1.9 0 0 0 1.7-2.8l-5.1-9.5V3.5"/><path d="M7.6 14.5h8.8"/>'),
    pill: svg('<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>'),
    bottle: svg('<path d="M10 3h4M10.5 3v3.5L8 10v9.5A1.5 1.5 0 0 0 9.5 21h5a1.5 1.5 0 0 0 1.5-1.5V10l-2.5-3.5V3"/><path d="M8 13.5h8"/>'),
    food: svg('<path d="M12 7.8c-1.6-1.1-4.6-1.5-6.3.5-2.2 2.6-1.2 8 1.3 11 1.3 1.6 3 2 5 1 2 1 3.7.6 5-1 2.5-3 3.5-8.4 1.3-11-1.7-2-4.7-1.6-6.3-.5Z"/><path d="M12 7.8c0-2 .8-3.5 2.5-4.4"/>'),
    cup: svg('<path d="M5 9h11v5.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 5 14.5Z"/><path d="M16 10.5h1.3a2.3 2.3 0 0 1 0 4.6H16M8.5 3.5c-.6.8-.6 1.7 0 2.5M12 3.5c-.6.8-.6 1.7 0 2.5M4 21h13"/>'),
    weapon: svg('<path d="M14.5 17.5 3.5 6.5v-3h3l11 11"/><path d="m13 19 6-6M16 16l3.5 3.5M18.5 21l2.5-2.5"/>'),
    bow: svg('<path d="M5 3.5c8 1.5 14 7.5 15.5 15.5"/><path d="M5 3.5 20.5 19M4 20l11.5-11.5M15.5 5.5v3h3"/>'),
    armor: svg('<path d="M12 3 5 6v5.5c0 4.4 2.9 7.9 7 9.5 4.1-1.6 7-5.1 7-9.5V6Z"/><path d="M12 7.5v9"/>'),
    clothing: svg('<path d="M8.5 4 4 6.5l1.6 4 2-1V20h8.8V9.5l2 1 1.6-4L15.5 4c-.5 1.5-1.8 2.5-3.5 2.5S9 5.5 8.5 4Z"/>'),
    bag: svg('<path d="M5 8.5h14l-1 12H6Z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>'),
    umbrella: svg('<path d="M3 12a9 9 0 0 1 18 0Z"/><path d="M12 12v6.5a2 2 0 0 1-4 0M12 3v.01"/>'),
    glasses: svg('<circle cx="6.8" cy="15" r="3.3"/><circle cx="17.2" cy="15" r="3.3"/><path d="M10.1 15h3.8M3.5 14.5 5 8.5M20.5 14.5 19 8.5"/>'),
    ring: svg('<circle cx="12" cy="15" r="6"/><path d="m9.5 5.3 2.5-2 2.5 2L12 9Z"/>'),
    gem: svg('<path d="M6.5 4h11l3.5 5-9 11.5L3 9Z"/><path d="M3 9h18M10 4 8.5 9l3.5 11.5L15.5 9 14 4"/>'),
    crown: svg('<path d="M4.5 17.5 3 7.5l5 4 4-6.5 4 6.5 5-4-1.5 10Z"/><path d="M5 20.5h14"/>'),
    money: svg('<circle cx="12" cy="12" r="8.5"/><path d="M14.6 9.6c-.4-.9-1.4-1.5-2.6-1.5-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.2 0-2.2-.6-2.6-1.5M12 6.6v1.5M12 15.9v1.5"/>'),
    wallet: svg('<path d="M4 7.5h14.5A1.5 1.5 0 0 1 20 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V6a1.5 1.5 0 0 1 1.5-1.5H16.5"/><path d="M15.5 13.8h1.5"/>'),
    tool: svg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9Z"/>'),
    flashlight: svg('<path d="M8 3.5h8v3.5l-2 3v10a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V10L8 7Z"/><path d="M8 7h8M12 13.5V15"/>'),
    lantern: svg('<path d="M9 3.5h6M12 3.5V5M8.5 5h7l1.5 3v9.5L15.5 20.5h-7L7 17.5V8Z"/><path d="M7 8h10M7 17.5h10M12 11v3.5"/>'),
    candle: svg('<path d="M9.5 10.5h5v10h-5Z"/><path d="M12 10.5V8.8M12 3.5c1.3 1.4 1.5 2.6 0 4-1.5-1.4-1.3-2.6 0-4ZM7 20.5h10"/>'),
    flame: svg('<path d="M12 21c3.5 0 6-2.3 6-5.8 0-3.2-2.3-5.2-3.5-8.2-1 2-2 3-3.5 3.5.5-2.5 0-5-2-7C9 6 6 9 6 15.2 6 18.7 8.5 21 12 21Z"/>'),
    watch: svg('<circle cx="12" cy="13.5" r="6.5"/><path d="M12 10.5v3l2 1.5M10.5 4h3M12 4v3"/>'),
    phone: svg('<rect x="6.5" y="2.5" width="11" height="19" rx="2.2"/><path d="M11 18.5h2"/>'),
    camera: svg('<path d="M4 7.5h3l1.5-2.5h7L17 7.5h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/>'),
    compass: svg('<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>'),
    box: svg('<path d="M3.5 8.5h17v11a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z"/><path d="M2.5 4.5h19v4h-19ZM10 12.5h4"/>'),
    gift: svg('<path d="M4.5 11h15v9.5h-15ZM3.5 7.5h17V11h-17ZM12 7.5v13"/><path d="M12 7.5c-.8-2.4-3.2-3.8-4.6-2.8-1.4 1 0 2.8 4.6 2.8 4.6 0 6-1.8 4.6-2.8-1.4-1-3.8.4-4.6 2.8Z"/>'),
    dice: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01"/>'),
    flower: svg('<path d="M7 4.5 9.5 6.5 12 3.5l2.5 3 2.5-2V9a5 5 0 0 1-10 0Z"/><path d="M12 14v7M12 18.5c-2 0-3.5-1-4-3 2 0 3.5 1 4 3Zm0 0c2 0 3.5-1 4-3-2 0-3.5 1-4 3Z"/>'),
    generic: svg('<path d="M9 3.5h6l-1 3h-4ZM8 6.5h8"/><path d="M8 6.5C5 9 4 12.5 4.5 16A4.5 4.5 0 0 0 9 20.5h6a4.5 4.5 0 0 0 4.5-4.5c.5-3.5-.5-7-3.5-9.5"/>'),
});

export const RECORD_ICONS = Object.freeze({
    ...ITEM_ICONS,
    pin: svg('<path d="M12 22s7-6 7-13a7 7 0 1 0-14 0c0 7 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/>'),
    back: svg('<path d="m15 18-6-6 6-6"/>'),
    diary: svg('<path d="M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 0v18m3-13h8m-8 4h8"/>'),
    inventory: svg('<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-4 0v14"/>'),
    relationships: svg('<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 20v-2a5 5 0 0 1 10 0v2m0 0v-2a5 5 0 0 1 10 0v2"/>'),
    zoomIn: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>'),
    zoomOut: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6"/>'),
    locate: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
    sort: svg('<path d="M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3"/>'),
    sliders: svg('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
    people: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M16 5.3a3 3 0 0 1 0 5.6M17.5 14.9c1.6.6 2.7 2.2 3 4.6"/>'),
    timeline: svg('<path d="M6 3.5v17"/><circle cx="6" cy="7" r="1.6"/><circle cx="6" cy="13" r="1.6"/><path d="M10 7h9M10 13h6M10 18.5h8"/>'),
    sparkle: svg('<path d="M12 3.5c.6 4.2 2.3 5.9 6.5 6.5-4.2.6-5.9 2.3-6.5 6.5-.6-4.2-2.3-5.9-6.5-6.5 4.2-.6 5.9-2.3 6.5-6.5Z"/>'),
});

// 物品名关键词 → 图标与展示分组；分组只在表格没有「类别」列时作为浏览归类，不改写物品属性。
const GROUPS = Object.freeze({
    papers: '文书', keys: '钥匙证件', medicine: '药品', food: '饮食', arms: '武具', wear: '服饰',
    treasure: '钱财珍宝', gear: '器物', other: '其他',
});
const INVENTORY_ICON_RULES = Object.freeze([
    { key: 'key', group: 'keys', priority: 100, keywords: ['黄铜钥匙圈', '钥匙扣', '门禁卡', '钥匙', '锁匙', '门卡', '门禁'] },
    { key: 'card', group: 'keys', priority: 96, keywords: ['身份证', '学生证', '工作证', '证件', '名片', '银行卡', '信用卡', '会员卡', '卡片', '通行证', '徽章'] },
    { key: 'potion', group: 'medicine', priority: 90, keywords: ['药瓶', '药水', '药剂', '试剂', '灵药', '魔药'] },
    { key: 'pill', group: 'medicine', priority: 88, keywords: ['药片', '胶囊', '药丸', '止痛药', '感冒药', '药品', '绷带', '药'] },
    { key: 'bottle', group: 'gear', priority: 85, keywords: ['墨水瓶', '水瓶', '瓶子', '瓶'] },
    { key: 'bow', group: 'arms', priority: 82, keywords: ['弓箭', '弓'] },
    { key: 'weapon', group: 'arms', priority: 80, keywords: ['长矛', '匕首', '武器', '棍棒', '锤子', '剑', '刀', '枪'] },
    { key: 'ticket', group: 'papers', priority: 78, keywords: ['车票', '门票', '船票', '机票', '电影票', '入场券', '优惠券', '票'] },
    { key: 'envelope', group: 'papers', priority: 77, keywords: ['信封', '信件', '情书', '来信', '书信', '邀请函', '信'] },
    { key: 'notebook', group: 'papers', priority: 76, keywords: ['笔记本', '日记本', '日记', '手账', '本子', '记事本', '笔记'] },
    { key: 'note', group: 'papers', priority: 75, keywords: ['便笺', '便签', '纸条', '字条', '卷轴', '档案', '文件', '合同', '收据', '纸'] },
    { key: 'book', group: 'papers', priority: 74, keywords: ['书籍', '小说', '画册', '书', '册'] },
    { key: 'photo', group: 'papers', priority: 73, keywords: ['照片', '相片', '明信片', '合影', '画像', '画'] },
    { key: 'map', group: 'papers', priority: 72, keywords: ['地图', '路线图'] },
    { key: 'pen', group: 'papers', priority: 71, keywords: ['钢笔', '铅笔', '羽毛笔', '笔'] },
    { key: 'cup', group: 'food', priority: 70, keywords: ['咖啡', '奶茶', '茶叶', '饮料', '牛奶', '果汁', '杯子', '茶', '杯'] },
    { key: 'food', group: 'food', priority: 69, keywords: ['食物', '面包', '便当', '饭团', '点心', '蛋糕', '糖果', '巧克力', '饼干', '苹果', '水果', '肉', '饭'] },
    { key: 'armor', group: 'arms', priority: 68, keywords: ['护甲', '铠甲', '盔甲', '盾牌', '铠', '盔', '盾'] },
    { key: 'clothing', group: 'wear', priority: 67, keywords: ['衣服', '外套', '衬衫', '围巾', '披风', '服装', '裙子', '制服', '手套', '鞋', '衣', '裙'] },
    { key: 'bag', group: 'wear', priority: 66, keywords: ['背包', '书包', '手提包', '挎包', '钱袋', '袋子', '包'] },
    { key: 'umbrella', group: 'wear', priority: 65, keywords: ['雨伞', '阳伞', '伞'] },
    { key: 'glasses', group: 'wear', priority: 64, keywords: ['眼镜', '墨镜'] },
    { key: 'ring', group: 'treasure', priority: 63, keywords: ['戒指', '指环'] },
    { key: 'gem', group: 'treasure', priority: 62, keywords: ['宝石', '水晶', '钻石', '翡翠', '玉石', '宝珠', '项链', '吊坠', '耳环', '手链', '发夹', '珠'] },
    { key: 'crown', group: 'treasure', priority: 61, keywords: ['王冠', '皇冠', '冠'] },
    { key: 'wallet', group: 'treasure', priority: 60, keywords: ['钱包', '皮夹'] },
    { key: 'money', group: 'treasure', priority: 59, keywords: ['金币', '硬币', '货币', '银币', '铜币', '现金', '零钱', '钱'] },
    { key: 'phone', group: 'gear', priority: 58, keywords: ['手机', '电话', '对讲机'] },
    { key: 'camera', group: 'gear', priority: 57, keywords: ['相机', '照相机', '摄像机'] },
    { key: 'watch', group: 'gear', priority: 56, keywords: ['怀表', '手表', '时钟', '闹钟', '钟', '表'] },
    { key: 'flashlight', group: 'gear', priority: 55, keywords: ['手电筒', '手电'] },
    { key: 'lantern', group: 'gear', priority: 54, keywords: ['提灯', '灯笼', '油灯', '灯'] },
    { key: 'flame', group: 'gear', priority: 53, keywords: ['打火机', '火柴', '火种', '火把'] },
    { key: 'candle', group: 'gear', priority: 52, keywords: ['蜡烛', '烛'] },
    { key: 'compass', group: 'gear', priority: 51, keywords: ['指南针', '罗盘'] },
    { key: 'tool', group: 'gear', priority: 50, keywords: ['工具箱', '扳手', '钳子', '螺丝刀', '绳子', '工具', '斧'] },
    { key: 'gift', group: 'gear', priority: 49, keywords: ['礼物', '礼盒', '礼品'] },
    { key: 'box', group: 'gear', priority: 48, keywords: ['宝箱', '木箱', '盒子', '箱'] },
    { key: 'dice', group: 'gear', priority: 47, keywords: ['骰子', '骰'] },
    { key: 'flower', group: 'gear', priority: 46, keywords: ['花束', '玫瑰', '鲜花', '干花', '花'] },
]);

function matchInventoryRule(name) {
    const text = String(name ?? '').trim();
    let best = null;
    for (const rule of INVENTORY_ICON_RULES) {
        for (const keyword of rule.keywords) {
            if (!keyword || !text.includes(keyword)) continue;
            const candidate = { rule, length: keyword.length };
            if (!best || candidate.length > best.length || (candidate.length === best.length && rule.priority > best.rule.priority)) best = candidate;
        }
    }
    return best?.rule || null;
}

export function inventoryIconKey(name) {
    return matchInventoryRule(name)?.key || 'generic';
}

export function inventoryGroupLabel(name) {
    return GROUPS[matchInventoryRule(name)?.group || 'other'];
}

export const INVENTORY_GROUP_ORDER = Object.freeze(Object.values(GROUPS));
