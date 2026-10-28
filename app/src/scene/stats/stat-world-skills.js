// 世界观附加特有技能（§6 扩展）：建卡时在默认 8 项之外，按当前世界观追加一组候选（现代不追加）。
// 只作候选、默认不选；选中后与默认特有技能一样 50 起步写进存档。词表结构同 stat-skill-match.js 的 BASE_LEXICON。
const s = (...solo) => Object.freeze({ solo: Object.freeze(solo) });

export const WORLDVIEW_SPECIAL_SKILLS = Object.freeze({
    ancient: Object.freeze({
        武艺: s('习武', '练武', '比武', '舞剑', '出招', '点穴', '施展轻功'),
        医术: s('把脉', '诊脉', '施针', '针灸', '开方子', '抓药', '煎药'),
        书画: s('挥毫', '题字', '泼墨', '临帖'),
        礼仪: s('行礼', '请安', '奉茶', '敬茶', '拜见'),
    }),
    fantasy: Object.freeze({
        剑术: s('挥剑', '拔剑', '格挡', '刺击', '对剑'),
        魔法: s('施法', '咏唱', '念咒', '释放法术'),
        骑术: s('骑马', '策马', '驯马'),
        野外求生: s('生火', '扎营', '打猎', '狩猎', '追踪足迹'),
    }),
    magic: Object.freeze({
        咒语: s('施咒', '念咒', '咏唱', '挥动魔杖', '施法'),
        魔药: s('熬魔药', '调配魔药', '调配药剂', '熬制药水'),
        飞行: s('骑扫帚', '飞行', '御风'),
        占卜: s('占卜', '看水晶球', '解读星象', '算塔罗'),
    }),
    scifi: Object.freeze({
        驾驶: s('驾驶', '开飞船', '操纵机甲', '驾驶飞船'),
        骇入: s('骇入', '黑进', '入侵系统', '破解密码'),
        机械: s('修理', '维修', '改装', '拆解'),
        医疗: s('急救', '注射', '缝合', '做手术'),
    }),
    apocalypse: Object.freeze({
        求生: s('搜刮', '觅食', '找水', '生火', '扎营'),
        枪械: s('开枪', '射击', '瞄准', '上膛', '换弹'),
        急救: s('急救', '止血', '缝合', '处理伤口'),
        潜行: s('潜行', '悄悄靠近', '摸过去'),
    }),
    taisho: Object.freeze({
        茶道: s('点茶', '泡茶', '茶道'),
        剑道: s('挥刀', '拔刀', '居合', '剑道'),
        文学: s('写信', '作俳句', '写小说', '吟诗'),
        礼法: s('行礼', '鞠躬', '奉茶'),
    }),
    horror: Object.freeze({
        驱邪: s('驱邪', '画符', '念经', '超度', '驱鬼'),
        灵感: s('通灵', '感应', '察觉异样'),
        潜行: s('潜行', '悄悄靠近', '摸过去'),
        急救: s('急救', '止血', '处理伤口'),
    }),
});

// 当前世界观追加的候选名；现代、未知 id 返回空数组。
export function worldSkillNames(worldview) {
    return Object.hasOwn(WORLDVIEW_SPECIAL_SKILLS, String(worldview)) ? Object.keys(WORLDVIEW_SPECIAL_SKILLS[worldview]) : [];
}

// 检定词表：各世界观的同名技能（急救、潜行）合并词条；只有存档里真有该技能时 matchSkill 才会采用。
export const WORLD_SKILL_LEXICON = (() => {
    const merged = {};
    for (const table of Object.values(WORLDVIEW_SPECIAL_SKILLS)) {
        for (const [name, entry] of Object.entries(table)) {
            const prev = merged[name] ? merged[name].solo : [];
            merged[name] = Object.freeze({ solo: Object.freeze([...new Set([...prev, ...entry.solo])]) });
        }
    }
    return Object.freeze(merged);
})();
