// 数值系统存档模型（§3）：默认状态与写时浅拷 helper。
// 六维属性取自战斗底座，不再存在 skills 里；skills 只放 8 个特有技能，prefs 记六维倾向（主擅长/次擅长/短板）。
// 状态对象共享只读，修改只复制被改动的路径，不深拷整份存档（易错点 B4）。
export const STATS_VERSION = 2;
export const BASE_ATTRIBUTES = Object.freeze(['力量', '敏捷', '体质', '智力', '感知', '魅力']);
export const DEFAULT_SPECIAL_SKILLS = Object.freeze(['烹饪', '家务', '学习', '运动', '艺术', '话术', '照顾', '应变']);
export const DEFAULT_DIMS = Object.freeze(['好感', '信任', '了解', '芥蒂']);
export const SKILL_MIN = 10;
export const SKILL_MAX = 90;
export const DIM_MIN = -100;
export const DIM_MAX = 100;
// 欲望不设负数，反感交给好感与芥蒂。
export const dimMin = (dim) => (dim === '欲望' ? 0 : DIM_MIN);

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function skillTable(names, value) {
    return Object.fromEntries(names.map((name) => [name, { value, marked: false }]));
}

// 生活条初值：主角与角色共用；旧存档里没有 bars 的角色读取时按初值补齐。
export function defaultBars(money = 0) {
    return { stamina: 100, money, stress: 0 };
}

// skills：起始技能名（默认 8 项日常技能各 special 点）；新聊天传空数组，由玩家选擅长技能。
export function createStatsState({ day = 1, special = 50, money = 0, prefs = null, skills = DEFAULT_SPECIAL_SKILLS } = {}) {
    return {
        version: STATS_VERSION,
        clock: { day, lastHour: null, lastDate: null, floorsSinceDay: 0, stayedUp: false, challenges: 0, lastChallengeFloor: null, lastChallengeReport: null },
        protagonist: {
            skills: skillTable(skills, special),
            prefs: prefs && typeof prefs === 'object' ? { ...prefs } : null,
            bars: defaultBars(money),
        },
        characters: {},
    };
}

// 新登记角色用默认值：各维度 0；欲望维度只在开启 NSFW 时加入（易错点 E5）。
export function createCharacter(day, { nsfw = false } = {}) {
    const dims = Object.fromEntries(DEFAULT_DIMS.map((dim) => [dim, 0]));
    if (nsfw) dims.欲望 = 0;
    return { dims, daily: { day, gained: {} }, recent: [], lastSeenDay: day, unlocked: [], bars: defaultBars(), heart: 0 };
}

// 角色生活条：旧存档的角色没有 bars 时按初值补齐（不改原对象）。
export function barsOf(character) {
    const own = character && character.bars;
    return own && typeof own === 'object' ? { ...defaultBars(), ...own } : defaultBars();
}

export function withCharacterBars(state, name, bars) {
    const cur = state.characters[name];
    return cur ? withCharacter(state, name, { ...cur, bars }) : state;
}

export const GRUDGE_TIERS = Object.freeze([{ name: '不满', min: 1 }, { name: '记恨', min: 26 }, { name: '怨恨', min: 51 }, { name: '积怨', min: 76 }]);

export function grudgeTier(value) {
    const v = Math.round(Number(value) || 0);
    let name = '';
    for (const tier of GRUDGE_TIERS) if (v >= tier.min) name = tier.name;
    return name;
}

export function grudgeOfCharacter(state, name) {
    const character = state && state.characters && state.characters[name];
    const value = Number(character && character.dims && character.dims.芥蒂);
    return Number.isFinite(value) ? clamp(Math.round(value), 0, DIM_MAX) : 0;
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

// 角色标记（随身 companion、无实体 bodiless、亲人 kin）：角色档案里的标记或聊天级 catalog.traits 勾选，任一为真即生效。
export function hasMark(character, traits, name, key) {
    if (character && character[key] === true) return true;
    const own = traits && typeof traits === 'object' ? traits[name] : null;
    return Boolean(own && own[key] === true);
}

// 当过恋爱对象：character.romance 为真；从未判定过（undefined）时，演出层记录的 romanceSeen 名单也算。结束恋爱后为 false，不再被名单覆盖。
export function isRomance(character, name, seen) {
    if (character && character.romance === true) return true;
    return Boolean(character && character.romance === undefined && Array.isArray(seen) && seen.includes(name));
}
