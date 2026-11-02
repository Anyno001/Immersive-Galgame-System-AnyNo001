// 日常挑战说法映射：只改显示，内部字段名（hp、damage、block）不变。纯常量与查表，不含逻辑。
export const CHALLENGE_LABELS = Object.freeze({
    enemy: '难关', hp: '意志', damage: '进展', block: '稳住', battle: '挑战', energy: '精力', turn: '回合', escape: '放弃', victory: '成功', defeat: '失败',
});

export const CHALLENGE_STATUS_NAMES = Object.freeze({ weak: '慌乱', vulnerable: '破绽', poison: '煎熬' });

// 难关出招的日常别名，键为 SKILL_TEMPLATES 的模板键。
export const CHALLENGE_SKILL_NAMES = Object.freeze({
    slash: '施压', heavy: '重压', combo: '连番追问', curse: '刁难', guard: '拖延', crush: '挑刺', gash: '揭短',
});

export const challengeStatusName = (status) => (Object.hasOwn(CHALLENGE_STATUS_NAMES, status) ? CHALLENGE_STATUS_NAMES[status] : null);
export const challengeSkillName = (templateKey) => (Object.hasOwn(CHALLENGE_SKILL_NAMES, templateKey) ? CHALLENGE_SKILL_NAMES[templateKey] : null);
