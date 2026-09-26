import { parseTables } from './table-parser.js';
import { findStatusHudRow, normalizeStatusHudTables, parseMetricCell } from './status-hud-model.js';

// 人际关系页的人物数值：读取名称含「数值」的表与状态栏已选表，只展示单元格里明确的数值与「阶段」文字。
const METRIC_TABLE_KEYWORDS = Object.freeze(['数值']);
const PLAIN_METRIC_LABEL_RE = /好感|信任|了解|亲密|爱意|依赖|依恋|心动|羁绊|默契|警惕|敌意/;
const STAGE_LABEL_RE = /阶段/;
const PLAIN_NUMBER_RE = /^-?\d+(?:\.\d+)?$/;
const MAX_METRICS = 6;

function isRowIdColumn(name) {
    const normalized = String(name || '').trim().toLowerCase();
    return normalized === 'row_id' || normalized === 'rowid' || normalized === 'id' || normalized === '序号';
}

function readMetricTables(readResult, selectedTables) {
    if (!readResult || readResult.ok === false) return [];
    const tables = parseTables(readResult.data);
    const picks = normalizeStatusHudTables(selectedTables);
    const chosen = [];
    const push = table => { if (table && !chosen.includes(table)) chosen.push(table); };
    for (const pick of picks) push(tables.find(table => pick.uid && table.uid === pick.uid) || tables.find(table => pick.name && table.name === pick.name));
    for (const table of tables) if (METRIC_TABLE_KEYWORDS.some(word => String(table.name || '').includes(word))) push(table);
    return chosen;
}

export function createCharacterMetricsLookup(readResult, options = {}) {
    const tables = readMetricTables(readResult, options.selectedTables);
    const aliases = options.characterAliases && typeof options.characterAliases === 'object' ? options.characterAliases : {};
    return name => {
        const character = String(name || '').trim();
        const metrics = [];
        const stages = [];
        if (!character) return { metrics, stages };
        for (const table of tables) {
            const row = findStatusHudRow(table, character, aliases);
            if (!row) continue;
            row.values.forEach((raw, index) => {
                const header = String(table.columns[index] || '').trim();
                if (index === row.headerIndex || isRowIdColumn(header)) return;
                const text = String(raw ?? '').trim();
                if (!text) return;
                if (STAGE_LABEL_RE.test(header)) {
                    if (!stages.some(item => item.label === header)) stages.push({ label: header, value: text });
                    return;
                }
                let parsed = parseMetricCell(text, header);
                if (!parsed && PLAIN_METRIC_LABEL_RE.test(header) && PLAIN_NUMBER_RE.test(text)) {
                    const value = Number(text);
                    if (value >= 0 && value <= 100) parsed = [{ label: header, percent: value, display: String(Math.round(value * 10) / 10) }];
                }
                for (const metric of parsed || []) {
                    if (metrics.length < MAX_METRICS && !metrics.some(item => item.label === metric.label))
                        metrics.push({ label: metric.label, percent: metric.percent, display: metric.display });
                }
            });
        }
        return { metrics, stages };
    };
}
