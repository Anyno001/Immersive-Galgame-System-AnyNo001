// Project-owned, static SVG paths; database values never enter SVG markup.
const svg = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const filledSvg = paths => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${paths}</svg>`;
// Curated from @tabler/icons@3.48.0; only fixed path data is retained in the runtime bundle.
const TABLER_FILLED_ICONS = Object.freeze({
    book: filledSvg('<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M21.5 5.134a1 1 0 0 1 .493 .748l.007 .118v13a1 1 0 0 1 -1.5 .866a8 8 0 0 0 -7.5 -.266v-15.174a10 10 0 0 1 8.5 .708m-10.5 -.707l.001 15.174a8 8 0 0 0 -7.234 .117l-.327 .18l-.103 .044l-.049 .016l-.11 .026l-.061 .01l-.117 .006h-.042l-.11 -.012l-.077 -.014l-.108 -.032l-.126 -.056l-.095 -.056l-.089 -.067l-.06 -.056l-.073 -.082l-.064 -.089l-.022 -.036l-.032 -.06l-.044 -.103l-.016 -.049l-.026 -.11l-.01 -.061l-.004 -.049l-.002 -13.068a1 1 0 0 1 .5 -.866a10 10 0 0 1 8.5 -.707" />'),
    bottle: filledSvg('<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M13 1a2 2 0 0 1 1.995 1.85l.005 .15v.5c0 1.317 .381 2.604 1.094 3.705l.17 .25l.05 .072a9.093 9.093 0 0 1 1.68 4.92l.006 .354v6.199a3 3 0 0 1 -2.824 2.995l-.176 .005h-6a3 3 0 0 1 -2.995 -2.824l-.005 -.176v-6.2a9.1 9.1 0 0 1 1.486 -4.982l.2 -.292l.05 -.069a6.823 6.823 0 0 0 1.264 -3.957v-.5a2 2 0 0 1 1.85 -1.995l.15 -.005h2zm.362 5h-2.724a8.827 8.827 0 0 1 -1.08 2.334l-.194 .284l-.05 .069a7.091 7.091 0 0 0 -1.307 3.798l-.003 .125a3.33 3.33 0 0 1 1.975 -.61a3.4 3.4 0 0 1 2.833 1.417c.27 .375 .706 .593 1.209 .583a1.4 1.4 0 0 0 1.166 -.583a3.4 3.4 0 0 1 .81 -.8l.003 .183c0 -1.37 -.396 -2.707 -1.137 -3.852l-.228 -.332a8.827 8.827 0 0 1 -1.273 -2.616z" />'),
    bow: filledSvg('<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M21 2l.081 .003l.12 .017l.111 .03l.111 .044l.098 .052l.096 .067l.09 .08q .054 .053 .097 .112l.071 .11l.031 .062l.034 .081l.024 .076l.03 .148l.006 .118v4a1 1 0 0 1 -2 0v-1.586l-2.07 2.07c1.301 1.624 2.07 3.706 2.07 6.016c0 2.703 -1.047 5.462 -2.793 7.207a1 1 0 0 1 -1.414 0l-5.543 -5.542l-3.25 3.249v2.586a1 1 0 0 1 -2 0v-2h-2a1 1 0 0 1 -.993 -.883l-.007 -.117a1 1 0 0 1 1 -1h2.584l3.251 -3.25l-5.542 -5.543a1 1 0 0 1 -.002 -1.412c1.745 -1.755 4.489 -2.795 7.209 -2.795c2.31 0 4.393 .768 6.015 2.07l2.069 -2.07h-1.584a1 1 0 0 1 -.993 -.883l-.007 -.117a1 1 0 0 1 1 -1zm-4.495 6.91l-4.09 4.09l4.595 4.594a9.1 9.1 0 0 0 .985 -3.795l.005 -.299c0 -1.754 -.55 -3.336 -1.495 -4.59m-6.005 -2.91c-1.44 0 -2.89 .36 -4.098 .987l4.598 4.598l4.09 -4.09c-1.254 -.945 -2.836 -1.495 -4.59 -1.495" />'),
    candle: filledSvg('<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M14 9a2 2 0 0 1 2 2v10a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-10a2 2 0 0 1 2 -2z" /><path d="M11.254 1.334a1 1 0 0 1 1.491 0l1.452 1.623a3 3 0 0 1 -4.196 4.28c-1.195 -1.07 -1.339 -2.889 -.297 -4.166z" />'),
    coin: filledSvg('<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M17 3.34a10 10 0 1 1 -15 8.66l.005 -.324a10 10 0 0 1 14.995 -8.336zm-5 2.66a1 1 0 0 0 -1 1a3 3 0 1 0 0 6v2a1.024 1.024 0 0 1 -.866 -.398l-.068 -.101a1 1 0 1 0 -1.732 .998a3 3 0 0 0 2.505 1.5h.161a1 1 0 0 0 .883 .994l.117 .007a1 1 0 0 0 1 -1l.176 -.005a3 3 0 0 0 -.176 -5.995v-2c.358 -.012 .671 .14 .866 .398l.068 .101a1 1 0 0 0 1.732 -.998a3 3 0 0 0 -2.505 -1.501h-.161a1 1 0 0 0 -1 -1zm1 7a1 1 0 0 1 0 2v-2zm-2 -4v2a1 1 0 0 1 0 -2z" />'),
    compass: filledSvg('<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M17 3.34a10 10 0 1 1 -15 8.66l.005 -.324a10 10 0 0 1 14.995 -8.336zm-5 14.66a1 1 0 1 0 0 2a1 1 0 0 0 0 -2m3.684 -10.949l-6 2a1 1 0 0 0 -.633 .633l-2.007 6.026l-.023 .086l-.017 .113l-.004 .068v.044l.009 .111l.012 .07l.04 .144l.045 .1l.054 .095l.064 .09l.069 .075l.084 .074l.098 .07l.1 .054l.078 .033l.105 .033l.109 .02l.043 .005l.068 .004h.044l.111 -.009l.07 -.012l.02 -.006l.019 -.002l.074 -.022l6 -2a1 1 0 0 0 .633 -.633l2 -6a1 1 0 0 0 -1.265 -1.265zm-1.265 2.529l-1.21 3.629l-3.629 1.21l1.21 -3.629l3.629 -1.21zm-9.419 1.42a1 1 0 1 0 0 2a1 1 0 0 0 0 -2m14 0a1 1 0 1 0 0 2a1 1 0 0 0 0 -2m-7 -7a1 1 0 1 0 0 2a1 1 0 0 0 0 -2" />'),
    crown: filledSvg('<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M19 19h-14c-.5 0 -.9 -.3 -1 -.8l-2 -10c0 -.4 .1 -.8 .5 -1.1c.4 -.2 .8 -.2 1.1 0l4.1 3.3l3.4 -5.1c.4 -.6 1.3 -.6 1.7 0l3.4 5.1l4.1 -3.3c.3 -.3 .8 -.3 1.1 0c.4 .2 .5 .6 .5 1.1l-2 10c0 .5 -.5 .8 -1 .8z" />'),
    dice: filledSvg('<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M18.333 2c1.96 0 3.56 1.537 3.662 3.472l.005 .195v12.666c0 1.96 -1.537 3.56 -3.472 3.662l-.195 .005h-12.666a3.667 3.667 0 0 1 -3.662 -3.472l-.005 -.195v-12.666c0 -1.96 1.537 -3.56 3.472 -3.662l.195 -.005h12.666zm-2.833 12a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0 -3m-7 0a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0 -3m0 -7a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0 -3m7 0a1.5 1.5 0 1 0 0 3a1.5 1.5 0 0 0 0 -3" />'),
    flask: filledSvg('<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M15 2a1 1 0 0 1 0 2v5.674l.062 .03a7 7 0 0 1 3.85 5.174l.037 .262a7 7 0 0 1 -3.078 6.693a1 1 0 0 1 -.553 .167h-6.635a1 1 0 0 1 -.552 -.166a7 7 0 0 1 .807 -12.134l.062 -.028v-5.672a1 1 0 1 1 0 -2h6zm-2 2h-2v6.34a1 1 0 0 1 -.551 .894l-.116 .049a5 5 0 0 1 -2.92 2.717h9.172a5 5 0 0 1 -2.918 -2.715a1 1 0 0 1 -.667 -.943v-6.342z" />'),
    key: filledSvg('<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M14.52 2c1.029 0 2.015 .409 2.742 1.136l3.602 3.602a3.877 3.877 0 0 1 0 5.483l-2.643 2.643a3.88 3.88 0 0 1 -4.941 .452l-.105 -.078l-5.882 5.883a3 3 0 0 1 -1.68 .843l-.22 .027l-.221 .009h-1.172c-1.014 0 -1.867 -.759 -1.991 -1.823l-.009 -.177v-1.172c0 -.704 .248 -1.386 .73 -1.96l.149 -.161l.414 -.414a1 1 0 0 1 .707 -.293h1v-1a1 1 0 0 1 .883 -.993l.117 -.007h1v-1a1 1 0 0 1 .206 -.608l.087 -.1l1.468 -1.469l-.076 -.103a3.9 3.9 0 0 1 -.678 -1.963l-.007 -.236c0 -1.029 .409 -2.015 1.136 -2.742l2.643 -2.643a3.88 3.88 0 0 1 2.741 -1.136m.495 5h-.02a2 2 0 1 0 0 4h.02a2 2 0 1 0 0 -4" />'),
    shield: filledSvg('<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M11.884 2.007l.114 -.007l.118 .007l.059 .008l.061 .013l.111 .034a.993 .993 0 0 1 .217 .112l.104 .082l.255 .218a11 11 0 0 0 7.189 2.537l.342 -.01a1 1 0 0 1 1.005 .717a13 13 0 0 1 -9.208 16.25a1 1 0 0 1 -.502 0a13 13 0 0 1 -9.209 -16.25a1 1 0 0 1 1.005 -.717a11 11 0 0 0 7.531 -2.527l.263 -.225l.096 -.075a.993 .993 0 0 1 .217 -.112l.112 -.034a.97 .97 0 0 1 .119 -.021z" />'),
    box: filledSvg('<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M6 5.667a3.667 3.667 0 0 1 3.667 -3.667h8.666a3.667 3.667 0 0 1 3.667 3.667v8.666a3.667 3.667 0 0 1 -3.667 3.667h-8.666a3.667 3.667 0 0 1 -3.667 -3.667z" /><path d="M2 9c0 -1.094 .533 -1.828 1.514 -2.374a1 1 0 1 1 .972 1.748c-.398 .221 -.486 .342 -.486 .626v10c0 .548 .452 1 1 1h9.998c.32 0 .618 -.154 .805 -.407l.065 -.1a1 1 0 1 1 1.738 .99a3 3 0 0 1 -2.606 1.517h-10c-1.652 0 -3 -1.348 -3 -3z" />'),
    apple: filledSvg('<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M15 2a1 1 0 0 1 .117 1.993l-.117 .007c-.693 0 -1.33 .694 -1.691 1.552a5.1 5.1 0 0 1 1.982 -.544l.265 -.008c2.982 0 5.444 3.053 5.444 6.32c0 3.547 -.606 5.862 -2.423 8.578c-1.692 2.251 -4.092 2.753 -6.41 1.234a.31 .31 0 0 0 -.317 -.01c-2.335 1.528 -4.735 1.027 -6.46 -1.27c-1.783 -2.668 -2.39 -4.984 -2.39 -8.532l.004 -.222c.108 -3.181 2.526 -6.098 5.44 -6.098c.94 0 1.852 .291 2.688 .792c.419 -1.95 1.818 -3.792 3.868 -3.792m-7.034 6.154c-1.36 .858 -1.966 2.06 -1.966 3.846a1 1 0 0 0 2 0c0 -1.125 .28 -1.678 1.034 -2.154a1 1 0 1 0 -1.068 -1.692" />'),
    diamond: filledSvg('<path stroke="none" d="M0 0h24v24H0z" fill="none" /><path d="M18 4a1 1 0 0 1 .783 .378l.074 .108l3 5a1 1 0 0 1 -.032 1.078l-.08 .103l-8.53 9.533a1.7 1.7 0 0 1 -1.215 .51c-.4 0 -.785 -.14 -1.11 -.417l-.135 -.126l-8.5 -9.5a1 1 0 0 1 -.172 -1.067l.06 -.115l3.013 -5.022l.064 -.09a.982 .982 0 0 1 .155 -.154l.089 -.064l.088 -.05l.05 -.023l.06 -.025l.109 -.032l.112 -.02l.117 -.005h12zm-8.886 3.943a1 1 0 0 0 -1.371 .343l-.6 1l-.06 .116a1 1 0 0 0 .177 1.07l2 2.2l.09 .088a1 1 0 0 0 1.323 -.02l.087 -.09a1 1 0 0 0 -.02 -1.323l-1.501 -1.65l.218 -.363l.055 -.103a1 1 0 0 0 -.398 -1.268z" />'),
});
const TABLER_OUTLINE_ICONS = Object.freeze({
    sword: svg('<path d="M20 4v5l-9 7l-4 4l-3 -3l4 -4l7 -9l5 0"/><path d="M6.5 11.5l6 6"/>'),
    tool: svg('<path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5"/>'),
});
export const RECORD_ICONS = Object.freeze({
    map: svg('<circle cx="12" cy="12" r="9"/><path d="M6.5 9.5c1.8-1.6 4-1.8 5.5-.6 1.2 1 2.6 1 3.6.1M7 15c1.6-.8 3.4-.5 4.4.8.9 1.2 2.3 1.6 3.8 1M13 4.2c-.8 1.8-.6 3.6.6 4.8"/>'),
    pin: svg('<path d="M12 22s7-6 7-13a7 7 0 1 0-14 0c0 7 7 13 7 13Z"/><circle cx="12" cy="9" r="2.5"/>'),
    back: svg('<path d="m15 18-6-6 6-6"/>'),
    diary: svg('<path d="M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 0v18m3-13h8m-8 4h8"/>'),
    inventory: svg('<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-4 0v14"/>'),
    relationships: svg('<circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M2 20v-2a5 5 0 0 1 10 0v2m0 0v-2a5 5 0 0 1 10 0v2"/>'),
    generic: svg('<path d="M4 7h16v14H4zM4 7l3-4h10l3 4M8 12h8"/>'),
    key: TABLER_FILLED_ICONS.key,
    weapon: TABLER_OUTLINE_ICONS.sword,
    book: TABLER_FILLED_ICONS.book,
    potion: TABLER_FILLED_ICONS.flask,
    bottle: TABLER_FILLED_ICONS.bottle,
    bow: TABLER_FILLED_ICONS.bow,
    candle: TABLER_FILLED_ICONS.candle,
    box: TABLER_FILLED_ICONS.box,
    crown: TABLER_FILLED_ICONS.crown,
    dice: TABLER_FILLED_ICONS.dice,
    food: TABLER_FILLED_ICONS.apple,
    armor: TABLER_FILLED_ICONS.shield,
    money: TABLER_FILLED_ICONS.coin,
    tool: TABLER_OUTLINE_ICONS.tool,
    gem: TABLER_FILLED_ICONS.diamond,
    zoomIn: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M11 8v6M8 11h6"/>'),
    zoomOut: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3M8 11h6"/>'),
    locate: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>'),
    compass: TABLER_FILLED_ICONS.compass,
});

const INVENTORY_ICON_RULES = Object.freeze([
    { key: 'key', priority: 100, keywords: ['黄铜钥匙圈', '钥匙扣', '门禁卡', '钥匙', '锁匙', '门卡', '门禁'] },
    { key: 'potion', priority: 90, keywords: ['药瓶', '药水', '药剂', '试剂', '灵药', '药'] },
    { key: 'bottle', priority: 85, keywords: ['墨水瓶', '水瓶', '瓶子', '瓶'] },
    { key: 'weapon', priority: 80, keywords: ['长矛', '匕首', '武器', '棍棒', '锤子', '剑', '刀', '枪'] },
    { key: 'bow', priority: 82, keywords: ['弓箭', '弓'] },
    { key: 'book', priority: 75, keywords: ['卷轴', '笔记', '日记', '书籍', '档案', '信件', '信封', '纸条', '书', '册'] },
    { key: 'food', priority: 70, keywords: ['食物', '面包', '苹果', '水果', '饮料', '牛奶', '肉', '饭'] },
    { key: 'armor', priority: 68, keywords: ['护甲', '铠甲', '盔甲', '盾牌', '披风', '服装', '鞋', '铠', '盔', '盾', '衣'] },
    { key: 'money', priority: 66, keywords: ['金币', '硬币', '货币', '银币', '铜币', '钱'] },
    { key: 'tool', priority: 64, keywords: ['工具箱', '扳手', '钳子', '火柴', '绳子', '提灯', '工具', '斧'] },
    { key: 'gem', priority: 62, keywords: ['宝石', '水晶', '钻石', '翡翠', '玉石', '宝珠', '珠'] },
    { key: 'candle', priority: 60, keywords: ['蜡烛', '烛'] },
    { key: 'box', priority: 58, keywords: ['宝箱', '木箱', '盒子', '箱'] },
    { key: 'dice', priority: 56, keywords: ['骰子', '骰'] },
    { key: 'crown', priority: 54, keywords: ['王冠', '皇冠', '冠'] },
    { key: 'compass', priority: 52, keywords: ['指南针', '罗盘'] },
]);

export function inventoryIconKey(name) {
    const text = String(name ?? '').trim();
    let best = null;
    for (const rule of INVENTORY_ICON_RULES) {
        for (const keyword of rule.keywords) {
            if (!keyword || !text.includes(keyword)) continue;
            const candidate = { key: rule.key, length: keyword.length, priority: rule.priority };
            if (!best || candidate.length > best.length || (candidate.length === best.length && candidate.priority > best.priority)) best = candidate;
        }
    }
    return best?.key || 'generic';
}
