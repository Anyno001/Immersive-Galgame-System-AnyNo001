// 数值系统 → 状态栏 / 人际关系页的 metrics（§10、易错点 H3）。
// 输出与 status-hud-model 的 extractStatusHudMetrics 同形（label / percent / display / colorKey），
// 与 character-metrics 的 lookup 同形（{ metrics, stages }），视觉层只换数据源、不换样式。
import { stageOf } from './stat-favor.js';

const DIM_COLOR = Object.freeze({ 好感: 'favor', 信任: 'trust', 了解: 'know', 欲望: 'desire' });
const BAR_LABEL = Object.freeze({ health: '生命', stamina: '体力', stress: '压力' });

// 条长只表示正向程度：负值按 0 画，数字与阶段名照实显示。
export function percentOfDim(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

export function displayOfFavor(value, hudLabel = 'stage') {
    const v = Math.round(Number(value) || 0);
    const stage = stageOf(v).name;
    if (hudLabel === 'number') return String(v);
    if (hudLabel === 'both') return `${stage} · ${v}`;
    return stage;
}

export function characterStatMetrics(character, { hudLabel = 'stage', nsfw = false } = {}) {
    if (!character || !character.dims) return [];
    const out = [];
    for (const [dim, value] of Object.entries(character.dims)) {
        if (dim === '欲望' && !nsfw) continue;
        out.push({
            label: dim,
            percent: percentOfDim(value),
            display: dim === '好感' ? displayOfFavor(value, hudLabel) : String(Math.round(Number(value) || 0)),
            colorKey: DIM_COLOR[dim] || 'favor',
            sourceUid: 'igs-stats',
            // 原始值（含负数）：条长按 0 画，但演出层要按真实增减判断（负区间继续下降也要提示）。
            statValue: Math.round(Number(value) || 0),
            // 好感条显示阶段名时，飘字只出心形、不出数字（§10）。
            quiet: dim === '好感' && hudLabel === 'stage',
        });
    }
    return out;
}

export function protagonistStatMetrics(bars, { enabledBars = { stamina: true, stress: true } } = {}) {
    const out = [];
    for (const key of ['health', 'stamina', 'stress']) {
        if (key !== 'health' && enabledBars[key] === false) continue;
        const v = Math.round(Number(bars && bars[key]) || 0);
        out.push({ label: BAR_LABEL[key], percent: Math.max(0, Math.min(100, v)), display: String(v), colorKey: key, sourceUid: 'igs-stats' });
    }
    return out;
}

// 与 createCharacterMetricsLookup 同形；未登记的名字返回空，调用方可按原逻辑退回表格。
export function createStatsMetricsLookup(state, { resolve = (name) => name, hudLabel = 'stage', nsfw = false } = {}) {
    return (name) => {
        const key = state && resolve(String(name || '').trim());
        const c = key && state.characters[key];
        if (!c) return { metrics: [], stages: [] };
        return {
            metrics: characterStatMetrics(c, { hudLabel, nsfw }),
            stages: [{ label: '关系阶段', value: stageOf(c.dims.好感).name }],
        };
    };
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

// 状态栏模型叠加（易错点 H3）：已登记角色的 HUD 条换成 IGS 数值，关系文字仍沿用表格；未登记或 lookup 出错时原样返回。
export function overlayStatsMetrics(model, lookup, character) {
    if (!model || typeof lookup !== 'function' || !character) return model;
    let own = null;
    try { own = lookup(character); } catch (error) { own = null; }
    if (!own || !Array.isArray(own.metrics) || !own.metrics.length) return model;
    const stage = Array.isArray(own.stages) && own.stages[0] ? own.stages[0].value : '';
    return { ...model, metrics: own.metrics, hiddenCount: 0, loadState: 'ready', loadReason: '', relation: model.relation || stage };
}
