// 数值标签的档位白名单与近义词归一。AI 只能给离散档位，任何数字都不采纳；归一不了的整条丢弃（易错点 C2）。

export const FAVOR_DELTA = Object.freeze({ 开心: 2, 感动: 3, 心动: 3, 平淡: 0, 失望: -2, 反感: -4, 吃醋: -3, 受伤: -6 });
export const FAVOR_DIRECTIONS = Object.freeze(Object.keys(FAVOR_DELTA));
export const DIM_DIRECTIONS = Object.freeze(['上升', '下降']);
export const STAMINA_EVENTS = Object.freeze(['轻', '中', '重', '熬夜', '受伤', '进食', '小憩']);
export const MONEY_FLOWS = Object.freeze(['收入', '花费']);
export const MONEY_TIERS = Object.freeze(['少量', '普通', '昂贵', '巨额']);
export const HURT_TIERS = Object.freeze(['轻伤', '中伤', '重伤']);
export const ENEMY_TIERS = Object.freeze(['杂兵', '精英', '头目']);
export const KEY_EVENTS = Object.freeze(['约会', '告白', '共患难']);

// 维度类标签：英文名与中文名都映射到规范维度名。
export const DIM_KINDS = Object.freeze({ trust: '信任', 信任: '信任', know: '了解', 了解: '了解', desire: '欲望', 欲望: '欲望' });

const UP_DOWN = { 提升: '上升', 增加: '上升', 升高: '上升', 上涨: '上升', 变高: '上升', 降低: '下降', 减少: '下降', 下跌: '下降', 变低: '下降' };

const SYNONYMS = Object.freeze({
    favor: { 高兴: '开心', 愉快: '开心', 欣喜: '开心', 感激: '感动', 动容: '感动', 悸动: '心动', 心跳: '心动', 害羞: '心动', 普通: '平淡', 一般: '平淡', 无感: '平淡', 失落: '失望', 沮丧: '失望', 讨厌: '反感', 厌恶: '反感', 嫌弃: '反感', 生气: '反感', 嫉妒: '吃醋', 醋意: '吃醋', 伤心: '受伤', 难过: '受伤', 心碎: '受伤' },
    dim: UP_DOWN,
    stamina: { 轻度: '轻', 轻微: '轻', 中度: '中', 中等: '中', 重度: '重', 剧烈: '重', 通宵: '熬夜', 吃饭: '进食', 用餐: '进食', 午睡: '小憩', 打盹: '小憩' },
    flow: { 支出: '花费', 消费: '花费', 花钱: '花费', 进账: '收入', 赚钱: '收入', 获得: '收入' },
    moneyTier: { 小额: '少量', 一点: '少量', 中等: '普通', 大额: '昂贵', 很贵: '昂贵', 天价: '巨额' },
    hurt: { 擦伤: '轻伤', 轻: '轻伤', 中: '中伤', 重: '重伤' },
    enemy: { 小怪: '杂兵', 喽啰: '杂兵', 强敌: '精英', boss: '头目', 首领: '头目' },
    event: { 表白: '告白', 患难: '共患难', 并肩作战: '共患难' },
});

const NUMERIC = /[0-9０-９+＋\-－%％]/;
const INTENSIFIER = /^(超级|非常|特别|十分|极其|极度|有点|有些|略微|稍微|稍稍|很|略)/;

function lookup(group, allowed, text) {
    if (allowed.includes(text)) return text;
    const mapped = SYNONYMS[group] && SYNONYMS[group][text.toLowerCase()];
    return mapped && allowed.includes(mapped) ? mapped : null;
}

// 返回规范档位；含数字、为空或不在白名单内返回 null。程度副词（超级、有点）先整词查，查不到再去掉重查。
export function normalizeTier(group, allowed, raw) {
    const text = String(raw ?? '').trim();
    if (!text || NUMERIC.test(text)) return null;
    const direct = lookup(group, allowed, text);
    if (direct) return direct;
    const bare = text.replace(INTENSIFIER, '');
    return bare && bare !== text ? lookup(group, allowed, bare) : null;
}
