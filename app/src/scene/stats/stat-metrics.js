// 数值系统 → 状态栏 / 人际关系页的 metrics（§10、易错点 H3）。
// 输出与 status-hud-model 的 extractStatusHudMetrics 同形（label / percent / display / colorKey），
// 与 character-metrics 的 lookup 同形（{ metrics, stages }），视觉层只换数据源、不换样式。
import { stageOf } from './stat-favor.js';
import { stageLabel } from './stat-relation-label.js';
import { DEFAULT_MONEY_TABLE, walletBalance } from './stat-bars.js';
import { isProtagonist } from './stat-engine.js';
import { barsOf, grudgeTier } from './stat-state.js';
import { strainBarLook } from './stat-strain.js';

const FAVOR_LABEL_RE = /好感|喜欢|爱意|爱慕|信任|信赖|了解|认知|熟悉|欲望|芥蒂|仇怨|怨恨|关系/;

export function isUserName(name, userName = '') {
    const n = String(name || '').trim();
    return Boolean(n) && (isProtagonist(n) || n === String(userName || '').trim());
}

// 主角对自己没有人际数值：主角说话时状态栏去掉好感、信任、了解等条（表格里主角那一行同样不显示）。
export function dropUserFavor(model, speaker, userName = '') {
    if (!model || !Array.isArray(model.metrics) || !isUserName(speaker, userName)) return model;
    const metrics = model.metrics.filter((metric) => !FAVOR_LABEL_RE.test(String((metric && metric.label) || '')));
    return metrics.length === model.metrics.length ? model : { ...model, metrics };
}

const DIM_COLOR = Object.freeze({ 好感: 'like', 信任: 'trust', 了解: 'know', 欲望: 'desire', 芥蒂: 'grudge' });
export const BAR_LABEL = Object.freeze({ health: '生命', stamina: '体力', stress: '压力', money: '金钱' });
// 状态栏条色沿用现有 slot 色板：生命红、体力绿、金钱黄、压力紫。
const BAR_COLOR = Object.freeze({ health: 'slot-5', stamina: 'slot-2', money: 'slot-3', stress: 'slot-4' });
// 金钱没有上限：条长按「巨额」档位折算，数字照实显示。
const MONEY_FULL = DEFAULT_MONEY_TABLE.巨额;

// 条长只表示正向程度：负值按 0 画，数字与阶段名照实显示。
export function percentOfDim(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

export function displayOfFavor(value, hudLabel = 'number') {
    const v = Math.round(Number(value) || 0);
    const stage = stageOf(v).name;
    if (hudLabel === 'number') return String(v);
    if (hudLabel === 'both') return `${stage} · ${v}`;
    return stage;
}

const DIM_STAGES = Object.freeze({
    信任: ['警惕', '普通', '放心', '依赖'],
    了解: ['陌生', '初识', '熟知', '心有灵犀'],
    欲望: ['平静', '悸动', '渴求', '难以自持'],
    芥蒂: ['不满', '记恨', '怨恨', '积怨'],
});

export function stageOfDim(dim, value) {
    const names = DIM_STAGES[dim];
    if (!names) return '';
    const v = Math.round(Number(value) || 0);
    return names[v <= 25 ? 0 : v <= 50 ? 1 : v <= 75 ? 2 : 3];
}

export function displayOfDim(dim, value, hudLabel = 'number') {
    if (dim === '好感') return displayOfFavor(value, hudLabel);
    const v = Math.round(Number(value) || 0);
    const stage = stageOfDim(dim, v);
    if (!stage || hudLabel === 'number') return String(v);
    if (hudLabel === 'both') return `${stage} · ${v}`;
    return stage;
}

// 压力条：转换后换成状态名与对应颜色。
function stressMetric(bars) {
    const v = Math.max(0, Math.min(100, Math.round(Number(bars && bars.stress) || 0)));
    const look = strainBarLook(bars);
    return { label: look ? look.label : BAR_LABEL.stress, percent: v, display: String(v), colorKey: look ? look.colorKey : BAR_COLOR.stress, sourceUid: 'igs-stats' };
}

// stamina：设置「显示角色的体力与压力」开启时传真；体力、压力两条排在最上面。
export function characterStatMetrics(character, { hudLabel = 'number', nsfw = false, stamina = false, favorTier = 'vivid' } = {}) {
    if (!character || !character.dims) return [];
    const out = [];
    const dims = '芥蒂' in character.dims ? character.dims : { ...character.dims, 芥蒂: 0 };
    for (const [dim, value] of Object.entries(dims)) {
        if (dim === '欲望' && !nsfw) continue;
        if (dim === '芥蒂' && !grudgeTier(value)) continue;
        // 负好感：条长按绝对值画、换冷色，一眼能看出反感程度。
        const negativeFavor = dim === '好感' && Math.round(Number(value) || 0) < 0;
        out.push({
            label: dim,
            percent: negativeFavor ? percentOfDim(-value) : percentOfDim(value),
            display: displayOfDim(dim, value, hudLabel),
            colorKey: negativeFavor ? 'cold' : DIM_COLOR[dim] || 'like',
            sourceUid: 'igs-stats',
            // 原始值（含负数）：条长按 0 画，但演出层要按真实增减判断（负区间继续下降也要提示）。
            statValue: Math.round(Number(value) || 0),
            // 好感条显示阶段名时，飘字只出心形、不出数字（§10）。
            quiet: dim === '好感' && hudLabel === 'stage',
            // 心意槽：困难档不显示，好感条旁五个小点。
            ...(dim === '好感' && !negativeFavor && favorTier !== 'hard' ? { heart: Math.max(0, Math.min(4, Math.round(Number(character.heart) || 0))) } : {}),
        });
    }
    if (stamina) {
        const v = Math.max(0, Math.min(100, Math.round(Number(barsOf(character).stamina) || 0)));
        out.unshift({ label: BAR_LABEL.stamina, percent: v, display: String(v), colorKey: BAR_COLOR.stamina, sourceUid: 'igs-stats' }, stressMetric(barsOf(character)));
    }
    return out;
}

// 主角生命条取战斗 vitals（{hp, maxHp, down}），显示「当前/最大」；没有 vitals 就不出生命条。体力、压力仍按生活条。
// 金钱条只在 enabledBars.money 明确为真时出，显示合并余额（数值侧金钱 + walletExtra 战斗积分）。
export function protagonistStatMetrics(bars, { enabledBars = { stamina: true, stress: true }, vitals = null, walletExtra = 0, moneyUnit = '' } = {}) {
    const out = [];
    if (vitals && Number(vitals.maxHp) > 0) {
        const hp = vitals.down ? 0 : Math.max(0, Math.round(Number(vitals.hp) || 0));
        const max = Math.round(Number(vitals.maxHp));
        out.push({ label: BAR_LABEL.health, percent: Math.max(0, Math.min(100, Math.round((hp / max) * 100))), display: `${hp}/${max}`, colorKey: BAR_COLOR.health, sourceUid: 'igs-stats' });
    }
    for (const key of ['stamina', 'stress']) {
        if (enabledBars[key] === false) continue;
        if (key === 'stress') { out.push(stressMetric(bars)); continue; }
        const v = Math.round(Number(bars && bars[key]) || 0);
        out.push({ label: BAR_LABEL[key], percent: Math.max(0, Math.min(100, v)), display: String(v), colorKey: BAR_COLOR[key], sourceUid: 'igs-stats' });
    }
    if (enabledBars.money === true) {
        const wallet = Math.round(walletBalance(bars, walletExtra));
        out.push({ label: BAR_LABEL.money, percent: Math.max(0, Math.min(100, Math.round((wallet / MONEY_FULL) * 100))), display: `${wallet}${moneyUnit || ''}`, colorKey: BAR_COLOR.money, sourceUid: 'igs-stats' });
    }
    return out;
}

// 与 createCharacterMetricsLookup 同形；未登记的名字返回空，调用方可按原逻辑退回表格。
// sheets：聊天级 NPC 角色卡（v2 §9.3）；有卡时返回 sheet 段：资历、擅长项、是否待定。
export function createStatsMetricsLookup(state, { resolve = (name) => name, hudLabel = 'number', nsfw = false, stamina = false, sheets = null, engine = null, favorTier = 'vivid', isRomanceOf = null } = {}) {
    return (name) => {
        const key = state && resolve(String(name || '').trim());
        const c = key && state.characters[key];
        if (!c) return { metrics: [], stages: [] };
        const out = {
            metrics: characterStatMetrics(c, { hudLabel, nsfw, stamina, favorTier }),
            stages: [{ label: '关系阶段', value: isRomanceOf ? stageLabel(c.dims.好感, isRomanceOf(c, key)) : stageOf(c.dims.好感).name }],
        };
        if (sheets) out.sheet = sheetSummary(key, sheets[key], engine);
        return out;
    };
}

function sheetSummary(name, sheet, engine) {
    if (!sheet) return { name, missing: true };
    const strong = Object.entries(sheet.skills || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([skill, v]) => {
        if (engine && engine.ruleset.ID === 'dnd5e') {
            const prof = v >= 75 ? '专精' : v >= 50 ? '熟练' : '';
            return `${skill}${prof ? ` ${prof}` : ''}`;
        }
        return `${skill} ${Math.round(v)}`;
    });
    return { name, rank: sheet.rank || '普通人', strong, provisional: Object.keys(sheet.provisional || {}).length > 0 };
}

// 数值系统开启时 IGS 为唯一真值（易错点 H3）：已登记角色只用 IGS 数据，未登记的人才退回表格 lookup。
// 表格 lookup 抛错时按空结果处理，不影响已登记角色的显示。
export function preferStatsLookup(statsLookup, tableLookup) {
    const empty = () => ({ metrics: [], stages: [] });
    const stats = typeof statsLookup === 'function' ? statsLookup : empty;
    const table = typeof tableLookup === 'function' ? tableLookup : empty;
    return (name) => {
        const own = stats(name);
        if (own && own.metrics && own.metrics.length) return own;
        try { return table(name) || empty(); } catch (error) { return empty(); }
    };
}

// 状态栏数值叠加：状态栏关着（model.enabled 为假）时什么都不加；主角条只在主角说话时由叠加换上，旁白与其他角色页不加主角区。
export function composeStatsHud(model, { lookup, speaker } = {}) {
    if (!model || model.enabled !== true) return model;
    return overlayStatsMetrics(model, lookup, speaker);
}

// 状态栏模型叠加（易错点 H3）：已登记角色的 HUD 条换成 IGS 数值，关系文字仍沿用表格；未登记或 lookup 出错时原样返回。
export function overlayStatsMetrics(model, lookup, character) {
    if (!model || typeof lookup !== 'function' || !character) return model;
    let own = null;
    try { own = lookup(character); } catch (error) { own = null; }
    if (!own || !Array.isArray(own.metrics) || !own.metrics.length) return model;
    const stage = Array.isArray(own.stages) && own.stages[0] ? own.stages[0].value : '';
    return { ...model, metrics: own.metrics, hiddenCount: 0, loadState: 'ready', loadReason: '', relation: model.relation || stage };
}
