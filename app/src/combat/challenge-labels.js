// 日常挑战说法映射：只改显示，内部字段名（hp、damage、block）不变。纯常量与查表，不含逻辑。
export const CHALLENGE_LABELS = Object.freeze({
    enemy: '难关', hp: '意志', damage: '进攻', block: '防守', battle: '挑战', energy: '精力', turn: '回合', escape: '放弃', victory: '成功', defeat: '失败',
});

export const CHALLENGE_STATUS_NAMES = Object.freeze({ weak: '慌乱', vulnerable: '破绽', poison: '煎熬' });

// 难关出招的日常别名，键为 SKILL_TEMPLATES 的模板键。
export const CHALLENGE_SKILL_NAMES = Object.freeze({
    slash: '施压', heavy: '重压', combo: '连番追问', curse: '刁难', guard: '拖延', crush: '挑刺', gash: '揭短',
});

export const challengeStatusName = (status) => (Object.hasOwn(CHALLENGE_STATUS_NAMES, status) ? CHALLENGE_STATUS_NAMES[status] : null);
export const challengeSkillName = (templateKey) => (Object.hasOwn(CHALLENGE_SKILL_NAMES, templateKey) ? CHALLENGE_SKILL_NAMES[templateKey] : null);

export const INTIMATE_LABELS = Object.freeze({
    合拍: Object.freeze({
        enemy: '对方', hp: '氛围', foeHp: '隔阂', damage: '靠近', block: '稳住', battle: '亲密', energy: '心绪', turn: '回合', escape: '停下', victory: '合拍', defeat: '错拍',
        statuses: Object.freeze({ weak: '慌乱', vulnerable: '心动', poison: '余温' }),
        intents: Object.freeze({ attack: '打乱', defend: '紧张', buff: '放松', debuff: '羞涩', heal: '平复', special: '特殊' }),
    }),
    主导: Object.freeze({
        enemy: '对方', hp: '掌控', foeHp: '对方掌控', damage: '进逼', block: '招架', battle: '亲密', energy: '心绪', turn: '回合', escape: '停下', victory: '占上风', defeat: '落下风',
        statuses: Object.freeze({ weak: '动摇', vulnerable: '破绽', poison: '沉溺' }),
        intents: Object.freeze({ attack: '反扑', defend: '观望', buff: '蓄势', debuff: '挑衅', heal: '平复', special: '特殊' }),
    }),
});

export const intimateLabelsOf = (mechanic) => (Object.hasOwn(INTIMATE_LABELS, mechanic) ? INTIMATE_LABELS[mechanic] : null);
