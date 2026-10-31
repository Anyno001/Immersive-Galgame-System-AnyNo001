// 随身系统（Origin 系统移植）设置：存放在 bridge.origin。总开关默认关闭；规范化只读入参、返回新对象。
// 原插件的独立 API 地址 / 密钥 / 模型不保留，系统请求未单独指定时跟随酒馆当前连接。
// Origin 系统 原作 vicliaaa，经授权移植：https://github.com/vicliaaa/origin-sillytavern

export const ORIGIN_CREDIT = 'Origin 系统 原作 vicliaaa，经授权移植';
export const ORIGIN_REPO_URL = 'https://github.com/vicliaaa/origin-sillytavern';

// 悬浮窗分页：id 与原插件 renderPanel 一致；mods 里关掉的不显示。
// place = tab：首屏页签；place = menu：页头「⋯」里的二级页（属性含技能、权限、奖励流水）。
export const ORIGIN_TABS = Object.freeze([
    Object.freeze({ id: 'task', label: '任务', mod: '', place: 'tab' }),
    Object.freeze({ id: 'bag', label: '背包', mod: 'bag', place: 'tab' }),
    Object.freeze({ id: 'shop', label: '商城', mod: 'shop', place: 'tab' }),
    Object.freeze({ id: 'gacha', label: '抽奖', mod: 'gacha', place: 'tab' }),
    Object.freeze({ id: 'chat', label: '对话', mod: 'chat', place: 'tab' }),
    Object.freeze({ id: 'stat', label: '属性', mod: 'stat', place: 'menu' }),
    Object.freeze({ id: 'ach', label: '成就', mod: 'ach', place: 'menu' }),
    Object.freeze({ id: 'log', label: '记录', mod: '', place: 'menu' }),
]);
export const ORIGIN_DEFAULT_NAME = '随身系统';

export const ORIGIN_MODS = Object.freeze(['stat', 'bag', 'shop', 'gacha', 'ach', 'chat']);
export const ORIGIN_MOD_LABELS = Object.freeze({ stat: '属性', bag: '背包', shop: '商城', gacha: '抽奖', ach: '成就', chat: '对话' });
export const ORIGIN_PERSONALITIES = Object.freeze(['冷澈', '毒舌', '傲娇', '温和']);
// 仅供窗口顶部展示；注入提示词用的人格文案在引擎里。
export const ORIGIN_PERSONA_TEXT = Object.freeze({
    冷澈: '冷静、克制、公事公办，偶尔一针见血。',
    毒舌: '爱吐槽、损，但损得有分寸，刀子嘴。',
    傲娇: '嘴上嫌弃、其实上心，会别扭地关心宿主。',
    温和: '温和耐心，像个可靠的向导。',
});

export const ORIGIN_SETTINGS_DEFAULTS = Object.freeze({
    enabled: false,
    freq: 3,
    limitMin: 0,
    limitMax: 0,
    blockWhenUnfinished: true,
    taskSource: 'auto',
    punishEvent: true,
    achieveOn: true,
    shopRefresh: 0,
    gachaRefresh: 0,
    rewardPref: '',
    penaltyPref: '',
    fourthWall: 0,
    drawCost: 300,
    bindTo: '宿主',
    autoEcon: false,
    chatToStory: true,
    rpChat: 'auto',
    sysName: ORIGIN_DEFAULT_NAME,
    personality: '冷澈',
    personaText: '',
    mods: Object.freeze({ stat: true, bag: true, shop: true, gacha: true, ach: true, chat: true }),
    // 「系统」类型的模型分配（替代原插件的 chatMode 与独立 API 三项）：
    // tavern = 跟随酒馆当前连接（默认）；llm = 走备用模型：llmProfile 为「模型预设」里副 LLM 预设的 id，空则用「备用模型」页当前连接。
    // model 是旧版手填的模型名，界面已不再提供，留着兼容旧设置。
    route: 'tavern',
    llmProfile: '',
    model: '',
    // 每楼存档只保留最近 N 个 AI 楼（0 = 全部保留）；更早的楼合成一份底稿，那些楼不能再切换回复重算。
    keepFloors: 30,
});

const TASK_SOURCES = new Set(['auto', 'direction', 'manual']);
const RP_CHAT = new Set(['auto', 'manual']);
export const ORIGIN_ROUTES = Object.freeze(['tavern', 'llm']);
const TEXT_MAX = 400;

function bool(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}

function int(value, min, max, fallback) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function text(value, fallback, max = TEXT_MAX) {
    return typeof value === 'string' ? value.slice(0, max) : fallback;
}

export function normalizeOriginSettings(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const d = ORIGIN_SETTINGS_DEFAULTS;
    const mods = src.mods && typeof src.mods === 'object' ? src.mods : {};
    const limitMin = int(src.limitMin, 0, 99, d.limitMin);
    const limitMax = int(src.limitMax, 0, 99, d.limitMax);
    const sysName = text(src.sysName, d.sysName, 24).trim() || d.sysName;
    return {
        enabled: bool(src.enabled, d.enabled),
        freq: int(src.freq, 1, 10, d.freq),
        limitMin,
        limitMax,
        blockWhenUnfinished: bool(src.blockWhenUnfinished, d.blockWhenUnfinished),
        taskSource: TASK_SOURCES.has(src.taskSource) ? src.taskSource : d.taskSource,
        punishEvent: bool(src.punishEvent, d.punishEvent),
        achieveOn: bool(src.achieveOn, d.achieveOn),
        shopRefresh: int(src.shopRefresh, 0, 99, d.shopRefresh),
        gachaRefresh: int(src.gachaRefresh, 0, 99, d.gachaRefresh),
        rewardPref: text(src.rewardPref, d.rewardPref),
        penaltyPref: text(src.penaltyPref, d.penaltyPref),
        fourthWall: int(src.fourthWall, 0, 100, d.fourthWall),
        drawCost: int(src.drawCost, 0, 99999, d.drawCost),
        bindTo: text(src.bindTo, d.bindTo, 24).trim() || d.bindTo,
        autoEcon: bool(src.autoEcon, d.autoEcon),
        chatToStory: bool(src.chatToStory, d.chatToStory),
        rpChat: RP_CHAT.has(src.rpChat) ? src.rpChat : d.rpChat,
        sysName,
        personality: ORIGIN_PERSONALITIES.includes(src.personality) ? src.personality : d.personality,
        personaText: text(src.personaText, d.personaText, 1200),
        mods: Object.fromEntries(ORIGIN_MODS.map((id) => [id, bool(mods[id], d.mods[id])])),
        route: ORIGIN_ROUTES.includes(src.route) ? src.route : d.route,
        llmProfile: text(src.llmProfile, d.llmProfile, 80).trim(),
        model: text(src.model, d.model, 120).trim(),
        keepFloors: int(src.keepFloors, 0, 9999, d.keepFloors),
    };
}

const LLM_PROFILE_PREFIX = 'bridge.autoIllustration.llm.';

// 副 LLM 预设（storage/model-profiles-file.js 的条目）→ 备用模型连接字段。
export function llmFromProfile(profile, base) {
    if (!profile || profile.kind !== 'llm' || !profile.values) return null;
    const out = { ...(base && typeof base === 'object' ? base : {}), source: 'openai' };
    for (const [path, value] of Object.entries(profile.values)) {
        if (path.startsWith(LLM_PROFILE_PREFIX)) out[path.slice(LLM_PROFILE_PREFIX.length)] = value;
    }
    return out;
}

// 宿主 generate(kind, prompt) 用：系统请求走哪条连接。llmConfig 是 bridge.autoIllustration.llm，profiles 是模型预设列表。
// 选了预设：用预设的地址、密钥、模型（预设已删时回落「备用模型」页当前连接）。
// 返回 { via: 'tavern' } 或 { via: 'llm', llm }（llm 为新对象或原对象，不改入参）；没有可用的备用连接时回落 tavern。
export function originRequestRoute(settings, llmConfig, profiles) {
    const s = normalizeOriginSettings(settings);
    const llm = llmConfig && typeof llmConfig === 'object' ? llmConfig : null;
    if (s.route !== 'llm') return { via: 'tavern' };
    const profile = s.llmProfile && Array.isArray(profiles) ? profiles.find((p) => p && p.kind === 'llm' && p.id === s.llmProfile) : null;
    const picked = llmFromProfile(profile, llm);
    if (picked) return { via: 'llm', llm: picked };
    if (!llm || llm.source !== 'openai') return { via: 'tavern' };
    return { via: 'llm', llm: s.model ? { ...llm, model: s.model } : llm };
}

// 反串模式：系统绑定到某个角色（不是「宿主」）。
export function originBoundRole(settings) {
    const bind = String(settings && settings.bindTo || '').trim();
    return bind && bind !== '宿主' ? bind : '';
}

export function originPersona(settings) {
    const s = normalizeOriginSettings(settings);
    return s.personaText.trim() || ORIGIN_PERSONA_TEXT[s.personality] || ORIGIN_PERSONA_TEXT.冷澈;
}

function visibleOriginPages(settings, place) {
    const s = normalizeOriginSettings(settings);
    const role = originBoundRole(s);
    return ORIGIN_TABS
        .filter((tab) => tab.place === place && (!tab.mod || s.mods[tab.mod] !== false))
        .map((tab) => (tab.id === 'chat' && role ? { ...tab, label: '私聊' } : tab));
}

// 首屏页签：对话页在反串模式下改称「私聊」。
export function visibleOriginTabs(settings) {
    return visibleOriginPages(settings, 'tab');
}

// 页头「⋯」里的二级页。
export function visibleOriginMenuPages(settings) {
    return visibleOriginPages(settings, 'menu');
}
