// 说话人性格 → 表情包 persona 标签（呆猫八条素材用的 11 个）。性格来源是数值系统的特质名；
// 没有启用数值系统、或特质对不上任何标签时返回空数组，挑图退回「人物名 + 楼号」的种子哈希。
const GROUPS = Object.freeze({
    软萌: ['傻白甜', '天然呆', '小笨蛋', '撒娇精', '兔系', '团宠', '爱哭鬼', '冒失鬼', '纯爱战士', '玻璃心'],
    高冷: ['冰山', '高岭之花', '清高', '冷血', '无口', '木头人', '低气压', '禁欲', '性冷淡', '不善言辞', '温柔疏离'],
    沙雕: ['显眼包', '吐槽役', '嘴替', '话痨', '键盘侠', '乐天派', '没心没肺', '中二病', '社牛', '不拘小节', '元气'],
    傲娇: ['傲娇', '口嫌体正直', '毒舌', '猫系'],
    腹黑: ['腹黑', '绿茶', '小恶魔', '狐系', '白莲', '钓系', '骗子', '疯批', '睚眦必报', '记仇'],
    黏人: ['黏人', '事后黏人', '恋爱脑', '病娇', '犬系', '舔狗', '占有狂', '花痴', '恋家'],
    温柔: ['包容', '贤惠', '老好人', '圣女', '圣职者', '宽容', '情绪稳定', '以德报怨'],
    得意: ['自恋', '女王', '御姐', '好胜'],
    佛系: ['佛系', '懒虫', '睡神', '瞌睡虫', '人间清醒'],
    害羞: ['害羞鬼', '社恐', '慢热', '一碰就软'],
    丧: ['自卑', '破碎感', '雨天忧郁', '社畜', '倒霉蛋', '穷光蛋'],
});

const PERSONA_OF_TRAIT = new Map();
for (const [persona, traits] of Object.entries(GROUPS)) for (const t of traits) PERSONA_OF_TRAIT.set(t, persona);

export const STICKER_PERSONAS = Object.freeze(Object.keys(GROUPS));

// 特质名数组 → persona 数组（按命中次数从多到少，次数相同按特质先后）。
export function personaOfTraits(traitNames) {
    if (!Array.isArray(traitNames)) return [];
    const count = new Map();
    for (const name of traitNames) {
        const persona = PERSONA_OF_TRAIT.get(String(name || '').trim());
        if (persona) count.set(persona, (count.get(persona) || 0) + 1);
    }
    return [...count].sort((a, b) => b[1] - a[1]).map(([persona]) => persona);
}
