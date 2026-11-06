// 数值标签的档位白名单与近义词归一。AI 只能给离散档位，任何数字都不采纳；归一不了的整条丢弃（易错点 C2）。

export const FAVOR_DELTA = Object.freeze({ 开心: 2, 感动: 3, 心动: 3, 平淡: 0, 失望: -2, 反感: -4, 吃醋: -3, 受伤: -6 });
export const FAVOR_DIRECTIONS = Object.freeze(Object.keys(FAVOR_DELTA));
// 好感强度档（可选第四段）：正向基础值与负向固定值；省略强度时按方向推定，平淡无强度。
export const FAVOR_STRENGTHS = Object.freeze(['小', '中', '大', '重大']);
export const FAVOR_POS_BASE = Object.freeze({ 小: 2, 中: 5, 大: 10, 重大: 15 });
export const FAVOR_NEG_BASE = Object.freeze({ 小: -3, 中: -8, 大: -15, 重大: -25 });
export const FAVOR_INFERRED = Object.freeze({ 开心: '小', 感动: '中', 心动: '中', 失望: '小', 反感: '中', 吃醋: '中', 受伤: '大' });
// 信任强度（可选第四段，省略按「小」）：上升慢、下降快，新三档专用；旧楼仍走 baseDelta。
export const TRUST_UP_BASE = Object.freeze({ 小: 1, 中: 3, 大: 6, 重大: 10 });
export const TRUST_DOWN_BASE = Object.freeze({ 小: -3, 中: -8, 大: -15, 重大: -30 });
// 亲密档位：基础体力扣除与设置倍率（不消耗时不结算）。
export const INTIMATE_LEVELS = Object.freeze(['轻', '中', '重']);
export const INTIMATE_BASE = Object.freeze({ 轻: 5, 中: 10, 重: 20 });
export const INTIMATE_COST_MODES = Object.freeze(['off', 'light', 'standard', 'heavy']);
export const INTIMATE_MULT = Object.freeze({ off: 0, light: 0.5, standard: 1, heavy: 1.5 });
export const DIM_DIRECTIONS = Object.freeze(['上升', '下降']);
export const STAMINA_EVENTS = Object.freeze(['轻', '中', '重', '熬夜', '受伤', '进食', '小憩']);
export const MONEY_FLOWS = Object.freeze(['收入', '花费']);
export const MONEY_TIERS = Object.freeze(['少量', '普通', '昂贵', '巨额']);
export const HURT_TIERS = Object.freeze(['轻伤', '中伤', '重伤']);
// 伤势档占最大生命的百分比；伤势只交给战斗账本记录，不再扣数值侧生命条。
export const HURT_PCT = Object.freeze({ 轻伤: 15, 中伤: 30, 重伤: 50 });
export const ENEMY_TIERS = Object.freeze(['杂兵', '精英', '头目']);
export const KEY_EVENTS = Object.freeze(['约会', '告白', '共患难']);
export const ROLL_DIFFICULTIES = Object.freeze(['简单', '普通', '困难', '极难']);
// 起始关系档 → 好感初值：角色第一次出场时按人设与既往关系定，之后只按方向增减。
export const START_FAVOR = Object.freeze({ 仇视: -40, 疏远: -15, 陌生: 0, 熟人: 15, 朋友: 30, 亲密: 55, 恋人: 80 });
export const START_RELATIONS = Object.freeze(Object.keys(START_FAVOR));
// 起始关系同时定了解与信任：朋友、亲密、恋人必须彼此熟悉，不能只有好感。
export const START_DIMS = Object.freeze({
    仇视: Object.freeze({ 好感: -40, 信任: -30, 了解: 10 }),
    疏远: Object.freeze({ 好感: -15, 信任: -10, 了解: 5 }),
    陌生: Object.freeze({ 好感: 0, 信任: 0, 了解: 0 }),
    熟人: Object.freeze({ 好感: 15, 信任: 10, 了解: 15 }),
    朋友: Object.freeze({ 好感: 30, 信任: 25, 了解: 35 }),
    亲密: Object.freeze({ 好感: 55, 信任: 45, 了解: 55 }),
    恋人: Object.freeze({ 好感: 80, 信任: 60, 了解: 70, 欲望: 15 }),
});

// 维度类标签：英文名与中文名都映射到规范维度名。
export const DIM_KINDS = Object.freeze({ trust: '信任', 信任: '信任', know: '了解', 了解: '了解', desire: '欲望', 欲望: '欲望', grudge: '芥蒂', 芥蒂: '芥蒂', 仇怨: '芥蒂', 怨气: '芥蒂', 恨: '芥蒂', 怨: '芥蒂', 怨恨: '芥蒂', 敌意: '芥蒂', 仇恨: '芥蒂', 记恨: '芥蒂', 心结: '芥蒂', 隔阂感: '芥蒂' });

const UP_DOWN = { 提升: '上升', 增加: '上升', 升高: '上升', 上涨: '上升', 变高: '上升', 降低: '下降', 减少: '下降', 下跌: '下降', 变低: '下降' };

const SYNONYMS = Object.freeze({
    favor: { 高兴: '开心', 愉快: '开心', 欣喜: '开心', 感激: '感动', 动容: '感动', 悸动: '心动', 心跳: '心动', 害羞: '心动', 普通: '平淡', 一般: '平淡', 无感: '平淡', 失落: '失望', 沮丧: '失望', 讨厌: '反感', 厌恶: '反感', 嫌弃: '反感', 生气: '反感', 嫉妒: '吃醋', 醋意: '吃醋', 伤心: '受伤', 难过: '受伤', 心碎: '受伤' },
    strength: { 轻微: '小', 轻: '小', 稍微: '小', 一般: '中', 中等: '中', 强烈: '大', 很大: '大', 较大: '大', 决定性: '重大', 极大: '重大', 巨大: '重大', 特大: '重大' },
    dim: UP_DOWN,
    intimate: { 轻微: '轻', 轻度: '轻', 亲吻: '轻', 爱抚: '轻', 中度: '中', 中等: '中', 重度: '重', 激烈: '重', 剧烈: '重' },
    stamina: { 轻度: '轻', 轻微: '轻', 中度: '中', 中等: '中', 重度: '重', 剧烈: '重', 通宵: '熬夜', 吃饭: '进食', 用餐: '进食', 午睡: '小憩', 打盹: '小憩' },
    flow: { 支出: '花费', 消费: '花费', 花钱: '花费', 进账: '收入', 赚钱: '收入', 获得: '收入' },
    moneyTier: { 小额: '少量', 一点: '少量', 中等: '普通', 大额: '昂贵', 很贵: '昂贵', 天价: '巨额' },
    hurt: { 擦伤: '轻伤', 轻: '轻伤', 中: '中伤', 重: '重伤' },
    enemy: { 小怪: '杂兵', 喽啰: '杂兵', 强敌: '精英', boss: '头目', 首领: '头目' },
    event: { 表白: '告白', 患难: '共患难', 并肩作战: '共患难' },
    difficulty: { 容易: '简单', 一般: '普通', 中等: '普通', 难: '困难', 较难: '困难', 很难: '极难', 极其困难: '极难', 不可能: '极难' },
    start: { 敌人: '仇视', 仇人: '仇视', 敌对: '仇视', 仇恨: '仇视', 冷淡: '疏远', 反感: '疏远', 不熟: '陌生', 初见: '陌生', 初识: '陌生', 路人: '陌生', 认识: '熟人', 同学: '熟人', 同事: '熟人', 邻居: '熟人', 好友: '朋友', 友人: '朋友', 挚友: '亲密', 青梅竹马: '亲密', 家人: '亲密', 知己: '亲密', 情侣: '恋人', 恋爱: '恋人', 伴侣: '恋人', 夫妻: '恋人', 未婚妻: '恋人', 未婚夫: '恋人' },
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
