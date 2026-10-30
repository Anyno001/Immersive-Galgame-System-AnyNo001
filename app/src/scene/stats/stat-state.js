// 数值系统存档模型（§3）：默认状态与写时浅拷 helper。
// 状态对象共享只读，修改只复制被改动的路径，不深拷整份存档（易错点 B4）。
// 六维与生命统一为战斗规则（合并计划 Q1/Q4）：属性分值由战斗属性视图给出，这里只存主角的建卡倾向；
// 生活条只剩体力、压力、金钱，生命读战斗的生命上限与伤势。
export const STATS_VERSION = 2;
export const BASE_ATTRIBUTES = Object.freeze(['力量', '敏捷', '体质', '智力', '感知', '魅力']);
export const DEFAULT_SPECIAL_SKILLS = Object.freeze(['烹饪', '家务', '学习', '运动', '艺术', '话术', '照顾', '应变']);
export const DEFAULT_DIMS = Object.freeze(['好感', '信任', '了解']);
export const SKILL_MIN = 10;
export const SKILL_MAX = 90;
export const DIM_MIN = -100;
export const DIM_MAX = 100;

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function skillTable(names, value) {
    return Object.fromEntries(names.map((name) => [name, { value, marked: false }]));
}

// prefs：{ major, minor, weak }（六维键），null 表示按默认职业原型的倾向。
export function createStatsState({ day = 1, special = 50, money = 0, prefs = null } = {}) {
    return {
        version: STATS_VERSION,
        clock: { day, lastHour: null, floorsSinceDay: 0, stayedUp: false },
        protagonist: {
            skills: skillTable(DEFAULT_SPECIAL_SKILLS, special),
            prefs: prefs && typeof prefs === 'object' ? { ...prefs } : null,
            bars: { stamina: 100, money, stress: 0 },
        },
        characters: {},
    };
}

// 新登记角色用默认值：各维度 0；欲望维度只在开启 NSFW 时加入（易错点 E5）。
export function createCharacter(day, { nsfw = false } = {}) {
    const dims = Object.fromEntries(DEFAULT_DIMS.map((dim) => [dim, 0]));
    if (nsfw) dims.欲望 = 0;
    return { dims, daily: { day, gained: {} }, recent: [], lastSeenDay: day, unlocked: [] };
}

export function withBars(state, bars) {
    return bars === state.protagonist.bars ? state : { ...state, protagonist: { ...state.protagonist, bars } };
}

export function withSkills(state, skills) {
    return skills === state.protagonist.skills ? state : { ...state, protagonist: { ...state.protagonist, skills } };
}

export function withClock(state, patch) {
    return { ...state, clock: { ...state.clock, ...patch } };
}

export function withCharacter(state, name, character) {
    return state.characters[name] === character ? state : { ...state, characters: { ...state.characters, [name]: character } };
}
