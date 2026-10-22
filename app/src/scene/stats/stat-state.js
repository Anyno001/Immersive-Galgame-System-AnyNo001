// 数值系统存档模型（§3）：默认状态与写时浅拷 helper。
// 状态对象共享只读，修改只复制被改动的路径，不深拷整份存档（易错点 B4）。
export const STATS_VERSION = 1;
export const BASE_ATTRIBUTES = Object.freeze(['健康', '力量', '敏捷', '理智', '观察', '魅力']);
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

export function createStatsState({ day = 1, base = 40, special = 50, money = 0 } = {}) {
    return {
        version: STATS_VERSION,
        clock: { day, lastHour: null, floorsSinceDay: 0, stayedUp: false },
        protagonist: {
            skills: { ...skillTable(BASE_ATTRIBUTES, base), ...skillTable(DEFAULT_SPECIAL_SKILLS, special) },
            bars: { health: 100, stamina: 100, money, stress: 0 },
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
