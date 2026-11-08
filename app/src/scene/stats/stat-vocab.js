// 数值标签的档位白名单与近义词归一。AI 只能给离散档位，任何数字都不采纳；归一不了的整条丢弃（易错点 C2）。

import { DEFAULT_MOOD_GROUPS, resolveMoodGroup } from '../mood-groups.js';

export const FAVOR_DELTA = Object.freeze({ 开心: 2, 感动: 3, 心动: 3, 平淡: 0, 失望: -2, 反感: -4, 吃醋: -3, 受伤: -6 });
// 旧方向词表：没有 strengthRev 的旧楼重算只认这些；FAVOR_DELTA 的旧值只给 legacy / legacyHard 档与旧楼用。
export const FAVOR_DIRECTIONS_LEGACY = Object.freeze(Object.keys(FAVOR_DELTA));
// 新方向词 18 个：sign 为对好感的正负，strength 为省略强度时的默认档；平淡不结算。
export const FAVOR_WORDS = Object.freeze({
    喜悦: Object.freeze({ sign: 1, strength: '小' }),
    大笑: Object.freeze({ sign: 1, strength: '小' }),
    欣赏: Object.freeze({ sign: 1, strength: '小' }),
    安心: Object.freeze({ sign: 1, strength: '小' }),
    害羞: Object.freeze({ sign: 1, strength: '中' }),
    感动: Object.freeze({ sign: 1, strength: '中' }),
    爱恋: Object.freeze({ sign: 1, strength: '中' }),
    平淡: Object.freeze({ sign: 0, strength: null }),
    悲伤: Object.freeze({ sign: -1, strength: '小' }),
    冷淡: Object.freeze({ sign: -1, strength: '小' }),
    委屈: Object.freeze({ sign: -1, strength: '小' }),
    怀疑: Object.freeze({ sign: -1, strength: '小' }),
    不满: Object.freeze({ sign: -1, strength: '中' }),
    嫌弃: Object.freeze({ sign: -1, strength: '中' }),
    愤怒: Object.freeze({ sign: -1, strength: '中' }),
    吃醋: Object.freeze({ sign: -1, strength: '中' }),
    害怕: Object.freeze({ sign: -1, strength: '中' }),
    受伤: Object.freeze({ sign: -1, strength: '大' }),
});
// 旧方向词仍认：开心、心动、失望、反感分别等同喜悦、爱恋、悲伤、嫌弃的正负与默认强度（见 FAVOR_DELTA、FAVOR_INFERRED）。
export const FAVOR_LEGACY_WORDS = Object.freeze(['开心', '心动', '失望', '反感']);
export const FAVOR_DIRECTIONS = Object.freeze([...Object.keys(FAVOR_WORDS), ...FAVOR_LEGACY_WORDS]);
// 提示词里按正负分组列出的方向词。
export const FAVOR_PROMPT_GROUPS = Object.freeze([
    Object.freeze({ label: '正向', words: Object.freeze(['喜悦', '大笑', '欣赏', '安心', '害羞', '感动', '爱恋']) }),
    Object.freeze({ label: '中性', words: Object.freeze(['平淡']) }),
    Object.freeze({ label: '负向', words: Object.freeze(['悲伤', '冷淡', '委屈', '怀疑', '不满', '嫌弃', '愤怒', '吃醋', '害怕', '受伤']) }),
]);
// 情绪组兜底：词不在方向词与近义词里时，按它所在的情绪组取值；表外的用户自建组一律按平淡。
export const MOOD_GROUP_FAVOR = Object.freeze({
    喜悦: '喜悦', 大笑: '大笑', 害羞: '害羞', 爱恋: '爱恋', 悲伤: '悲伤', 冷淡: '冷淡', 委屈: '委屈', 怀疑: '怀疑', 不满: '不满', 嫌弃: '嫌弃', 愤怒: '愤怒',
    哭泣: '受伤', 平和: '平淡', 紧张: '平淡', 惊讶: '平淡', 思考: '平淡', 得意: '平淡', 无奈: '平淡', 心虚: '平淡', 动情: '平淡', 默认: '平淡',
});
// rev≥2 的新楼用的兜底表：哭泣组改悲伤（哭的原因太杂，误判损失要小），大笑组改平淡（发疯大笑、嘲笑都在这一组）。
export const MOOD_GROUP_FAVOR_REV2 = Object.freeze({ ...MOOD_GROUP_FAVOR, 哭泣: '悲伤', 大笑: '平淡' });
// 好感强度档（可选第四段）：正向基础值与负向固定值；省略强度时按方向推定，平淡无强度。
export const FAVOR_STRENGTHS = Object.freeze(['小', '中', '大', '重大']);
export const FAVOR_POS_BASE = Object.freeze({ 小: 2, 中: 5, 大: 10, 重大: 15 });
export const FAVOR_NEG_BASE = Object.freeze({ 小: -3, 中: -8, 大: -15, 重大: -25 });
export const FAVOR_INFERRED = Object.freeze({ 开心: '小', 感动: '中', 心动: '中', 失望: '小', 反感: '中', 吃醋: '中', 受伤: '大' });
// 普通档、困难档各自的正向表（鲜明档仍用 FAVOR_POS_BASE）；负向三档共用 FAVOR_NEG_BASE。没有 strengthRev 的旧楼不用这两张表。
export const FAVOR_POS_BASE_NORMAL = Object.freeze({ 小: 2, 中: 4, 大: 6, 重大: 8 });
export const FAVOR_POS_BASE_HARD = Object.freeze({ 小: 1, 中: 2, 大: 4, 重大: 6 });
// 芥蒂强度（可选第四段，省略按「小」）：上升不掷骰、不设上限，下降每日有封顶；三档好感成长共用。
export const GRUDGE_UP_BASE = Object.freeze({ 小: 2, 中: 5, 大: 10, 重大: 20 });
export const GRUDGE_DOWN_BASE = Object.freeze({ 小: -2, 中: -5, 大: -10, 重大: -15 });
// 压力强度（可选，省略按「中」＝原 ±10），不设重大。
export const STRESS_STRENGTHS = Object.freeze(['小', '中', '大', '极大']);
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
// 关键事件：rev≥2 的新楼才认「交心」（友情向），旧楼仍只认前三项。
export const KEY_EVENTS_LEGACY = Object.freeze(['约会', '告白', '共患难']);
export const KEY_EVENTS = Object.freeze([...KEY_EVENTS_LEGACY, '交心']);
// 特质事件（rev≥2，解析成 traitEvent 而非 event）：只记录发生了什么，不进好感关口；吸血、歌唱、发情只当环境词。
export const TRAIT_EVENTS = Object.freeze(['夸奖', '批评', '拒绝', '背叛', '求助', '信仰质疑', '耳语', '重逢', '提起', '守约', '失约', '吸血', '歌唱', '发情']);
export const TRAIT_WORD_EVENTS = Object.freeze(['吸血', '歌唱', '发情']);
// 主角离体标签的取值；rev≥2 才解析。
export const HERO_STATES = Object.freeze(['离体', '复归']);
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

// 开局修正：只扣信任、加芥蒂，每个角色每项只生效一次（「恋人＋猜忌」这类复合关系）。
export const START_FIX_DIMS = Object.freeze(['信任', '芥蒂']);
export const START_FIX_LEVELS = Object.freeze(['轻', '中', '重']);
export const START_FIX_VALUE = Object.freeze({
    信任: Object.freeze({ 轻: -10, 中: -25, 重: -45 }),
    芥蒂: Object.freeze({ 轻: 10, 中: 25, 重: 45 }),
});
export const START_MODIFIERS = Object.freeze({
    猜忌: Object.freeze({ 信任: '中', 芥蒂: '轻' }),
    戒备: Object.freeze({ 信任: '中' }),
    心结: Object.freeze({ 芥蒂: '中' }),
    积怨: Object.freeze({ 芥蒂: '重', 信任: '轻' }),
    背叛过: Object.freeze({ 信任: '重', 芥蒂: '中' }),
});
export const START_MODIFIER_NAMES = Object.freeze(Object.keys(START_MODIFIERS));
const START_MOD_MAX = 2;
// 家人类起始关系原文（rev≥2 才认）：归到「亲密」并给角色打 kin 标记。
export const KIN_WORDS = Object.freeze(['家人', '父母', '父亲', '母亲', '爸爸', '妈妈', '兄妹', '兄弟', '姐妹', '姐弟', '哥哥', '姐姐', '弟弟', '妹妹', '养父', '养母', '继父', '继母', '子女', '儿子', '女儿', '亲人', '亲戚']);
// 起始关系的两个角色标记（rev≥2 才认）：不改任何数值，只给角色打 companion / bodiless，不占猜忌类修饰名额。
export const START_MARKS = Object.freeze({ 随身: 'companion', 无实体: 'bodiless', 无身体: 'bodiless' });
const START_MARK_CANON = Object.freeze({ 无身体: '无实体' });

// 多个修饰同一项取最重的一档，不叠加。返回 { 信任: 负数, 芥蒂: 正数 }，没有修正的项不出现。
export function startFixOffsets(mods) {
    const order = START_FIX_LEVELS;
    const picked = {};
    for (const mod of mods || []) {
        for (const [dim, level] of Object.entries(START_MODIFIERS[mod] || {})) {
            if (!picked[dim] || order.indexOf(level) > order.indexOf(picked[dim])) picked[dim] = level;
        }
    }
    return Object.fromEntries(Object.entries(picked).map(([dim, level]) => [dim, START_FIX_VALUE[dim][level]]));
}

// 维度类标签：英文名与中文名都映射到规范维度名。
export const DIM_KINDS = Object.freeze({ trust: '信任', 信任: '信任', know: '了解', 了解: '了解', desire: '欲望', 欲望: '欲望', grudge: '芥蒂', 芥蒂: '芥蒂', 仇怨: '芥蒂', 怨气: '芥蒂', 恨: '芥蒂', 怨: '芥蒂', 怨恨: '芥蒂', 敌意: '芥蒂', 仇恨: '芥蒂', 记恨: '芥蒂', 心结: '芥蒂', 隔阂感: '芥蒂' });

const UP_DOWN = { 提升: '上升', 增加: '上升', 升高: '上升', 上涨: '上升', 变高: '上升', 降低: '下降', 减少: '下降', 下跌: '下降', 变低: '下降' };

const SYNONYMS = Object.freeze({
    favor: { 高兴:'开心', 愉快: '开心', 欣喜: '开心', 感激: '感动', 动容: '感动', 悸动: '心动', 心跳: '心动', 害羞: '心动', 普通: '平淡', 一般: '平淡', 无感: '平淡', 失落: '失望', 沮丧: '失望', 讨厌: '反感', 厌恶: '反感', 嫌弃: '反感', 生气: '反感', 嫉妒: '吃醋', 醋意: '吃醋', 伤心: '受伤', 难过: '受伤', 心碎: '受伤' },
    // 新规则（strengthRev≥1）才认的近义词，旧楼重算不读。
    favorNew: { 敬佩: '欣赏', 佩服: '欣赏', 赞赏: '欣赏', 认可: '欣赏', 钦佩: '欣赏', 放心: '安心', 依赖: '安心', 信赖: '安心', 踏实: '安心', 欣慰: '安心', 恐惧: '害怕', 畏惧: '害怕', 惊恐: '害怕', 胆怯: '害怕', 心疼: '感动', 冷漠: '冷淡', 疏离: '冷淡', 憋屈: '委屈', 冤枉: '委屈', 猜疑: '怀疑', 戒备: '怀疑', 提防: '怀疑' },
    // rev≥2 才认的近义词。
    favorNew2: { 崇拜: '欣赏', 敬畏: '欣赏', 仰慕: '欣赏', 狂热: '爱恋' },
    event: { 表白: '告白', 患难: '共患难', 并肩作战: '共患难' },
    hero: { 回归: '复归', 归体: '复归', 出窍: '离体', 魂离: '离体', 灵魂出窍: '离体' },
    strength: { 轻微: '小', 轻: '小', 稍微: '小', 一般: '中', 中等: '中', 强烈: '大', 很大: '大', 较大: '大', 决定性: '重大', 极大: '重大', 巨大: '重大', 特大: '重大' },
    stressStrength: { 轻微: '小', 轻: '小', 稍微: '小', 一般: '中', 中等: '中', 强烈: '大', 很大: '大', 较大: '大', 重大: '大', 巨大: '极大', 特大: '极大', 决定性: '大' },
    dim: UP_DOWN,
    intimate: { 轻微: '轻', 轻度: '轻', 亲吻: '轻', 爱抚: '轻', 中度: '中', 中等: '中', 重度: '重', 激烈: '重', 剧烈: '重' },
    stamina: { 轻度: '轻', 轻微: '轻', 中度: '中', 中等: '中', 重度: '重', 剧烈: '重', 通宵: '熬夜', 吃饭: '进食', 用餐: '进食', 午睡: '小憩', 打盹: '小憩' },
    flow: { 支出: '花费', 消费: '花费', 花钱: '花费', 进账: '收入', 赚钱: '收入', 获得: '收入' },
    moneyTier: { 小额: '少量', 一点: '少量', 中等: '普通', 大额: '昂贵', 很贵: '昂贵', 天价: '巨额' },
    hurt: { 擦伤: '轻伤', 轻: '轻伤', 中: '中伤', 重: '重伤' },
    enemy: { 小怪: '杂兵', 喽啰: '杂兵', 强敌: '精英', boss: '头目', 首领: '头目' },
    difficulty: { 容易: '简单', 一般: '普通', 中等: '普通', 难: '困难', 较难: '困难', 很难: '极难', 极其困难: '极难', 不可能: '极难' },
    start: { 敌人: '仇视', 仇人: '仇视', 敌对: '仇视', 仇恨: '仇视', 冷淡: '疏远', 反感: '疏远', 不熟: '陌生', 初见: '陌生', 初识: '陌生', 路人: '陌生', 认识: '熟人', 同学: '熟人', 同事: '熟人', 邻居: '熟人', 好友: '朋友', 友人: '朋友', 挚友: '亲密', 青梅竹马: '亲密', 家人: '亲密', 知己: '亲密', 情侣: '恋人', 恋爱: '恋人', 伴侣: '恋人', 夫妻: '恋人', 未婚妻: '恋人', 未婚夫: '恋人' },
    startMod: { 怀疑: '猜忌', 疑心: '猜忌', 怀疑出轨: '猜忌', 多疑: '猜忌', 不信任: '戒备', 提防: '戒备', 防备: '戒备', 警惕: '戒备', 隔阂: '心结', 疙瘩: '心结', 芥蒂: '心结', 旧怨: '积怨', 宿怨: '积怨', 怨恨: '积怨', 背叛: '背叛过', 被背叛: '背叛过', 曾背叛: '背叛过' },
    fixDim: { trust: '信任', grudge: '芥蒂', 不满: '芥蒂', 心结: '芥蒂' },
    fixLevel: { 小: '轻', 轻微: '轻', 一点: '轻', 中等: '中', 一般: '中', 大: '重', 严重: '重', 很重: '重', 深: '重' },
});

// 起始关系可带修饰：「恋人+猜忌」「恋人＋猜忌、心结」。档位归一不了返回 null；修饰词归一不了的单个丢弃。
// opts.marks 为真（rev≥2）时额外识别「随身」「无实体」（旧写法「无身体」归一为无实体），结果放在 marks（只在有时出现）。
export function parseStartRelation(raw, extra = '', opts = {}) {
    const parts = [raw, extra].map((s) => String(s ?? '')).join('+').split(/[+＋、，,;；]/).map((s) => s.trim()).filter(Boolean);
    const kin = Boolean(opts.marks) && KIN_WORDS.includes(parts[0]);
    const tier = kin ? '亲密' : normalizeTier('start', START_RELATIONS, parts[0]);
    if (!tier) return null;
    const mods = [];
    const marks = [];
    for (const part of parts.slice(1)) {
        if (opts.marks && Object.hasOwn(START_MARKS, part)) { const m = START_MARK_CANON[part] || part; if (!marks.includes(m)) marks.push(m); continue; }
        const mod = normalizeTier('startMod', START_MODIFIER_NAMES, part);
        if (mod && !mods.includes(mod) && mods.length < START_MOD_MAX) mods.push(mod);
    }
    return { tier, mods, ...(marks.length ? { marks } : {}), ...(kin ? { kin: true } : {}) };
}

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

// 情绪组兜底：词不在任何情绪组返回 null；valued 为假表示用户自建组（按平淡）。
export function favorFromMoodGroup(word, moodGroups, rev = 0) {
    const groups = Array.isArray(moodGroups) && moodGroups.length ? moodGroups : DEFAULT_MOOD_GROUPS;
    const group = resolveMoodGroup(word, groups);
    if (!group) return null;
    const value = (rev >= 2 ? MOOD_GROUP_FAVOR_REV2 : MOOD_GROUP_FAVOR)[group];
    return value ? { group, value, valued: true } : { group, value: '平淡', valued: false };
}

// 新规则的好感方向词识别：方向词（含旧四词与旧近义词）→ 新近义词 → 情绪组；都不中返回 null，不猜正负。
// 经情绪组命中时带 group 与 valued。
// rev≥2 另认 favorNew2 近义词，情绪组兜底读 MOOD_GROUP_FAVOR_REV2；rev 1 的楼仍按原表。
export function resolveFavorWord(raw, moodGroups, rev = 0) {
    const text = String(raw ?? '').trim();
    if (!text || NUMERIC.test(text)) return null;
    const direct = normalizeTier('favor', FAVOR_DIRECTIONS, text) || normalizeTier('favorNew', FAVOR_DIRECTIONS, text) || (rev >= 2 ? normalizeTier('favorNew2', FAVOR_DIRECTIONS, text) : null);
    if (direct) return { value: direct };
    const bare = text.replace(INTENSIFIER, '');
    for (const word of bare && bare !== text ? [text, bare] : [text]) {
        const hit = favorFromMoodGroup(word, moodGroups, rev);
        if (hit) return hit;
    }
    return null;
}
