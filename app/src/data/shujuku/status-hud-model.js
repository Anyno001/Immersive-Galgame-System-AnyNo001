import { parseTables } from '../../shujuku-panel/panel-model.js';
import { resolveCharacterKey } from '../../scene/scene-directives.js';

export const STATUS_HUD_MAX_METRICS = 4;
export const STATUS_HUD_SIZE_IDS = Object.freeze(['small', 'medium', 'large']);
export const STATUS_HUD_SIZE_SCALE = Object.freeze({ small: 0.86, medium: 1, large: 1.16 });
// 地点栏独立档位系数：状态栏 size 已通过 --igs-hud-scale 影响地点栏，但整体偏小，
// 因此在地点栏上再叠加一档系数，最小档即为当前观感的 120%。
export const STATUS_HUD_LOCATION_SCALE = Object.freeze({ small: 1.2, medium: 1.45, large: 1.7 });
const STATUS_HUD_OVERALL_SCALE = 0.8;
export const STATUS_HUD_AVATAR_RADIUS_IDS = Object.freeze(['square', 'soft', 'small', 'medium', 'large', 'circle']);
export const STATUS_HUD_AVATAR_RADIUS_PX = Object.freeze({ square: 0, soft: 6, small: 10, medium: 16, large: 24, circle: '50%' });
export const STATUS_HUD_BACKGROUND_IDS = Object.freeze(['none', 'dialog']);
export const STATUS_HUD_BAR_COLOR_IDS = Object.freeze(['color', 'grayscale']);

export const STATUS_HUD_DEFAULTS = Object.freeze({
    enabled: false,
    collapsed: false,
    size: 'medium',
    showEmotion: true,
    showLocation: false,
    showLocationDetails: false,
    showSpriteOnNsfw: true,
    dimSpriteOnNarration: true,
    avatarRadius: 'circle',
    background: 'none',
    barColor: 'color',
    tables: [],
});

export function normalizeStatusHudSettings(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
        enabled: src.enabled === true,
        collapsed: src.collapsed === true,
        size: STATUS_HUD_SIZE_IDS.includes(src.size) ? src.size : STATUS_HUD_DEFAULTS.size,
        showEmotion: src.showEmotion === false ? false : true,
        showLocation: src.showLocation === true,
        showLocationDetails: src.showLocationDetails === true,
        showSpriteOnNsfw: src.showSpriteOnNsfw === false ? false : true,
        dimSpriteOnNarration: src.dimSpriteOnNarration === false ? false : true,
        avatarRadius: STATUS_HUD_AVATAR_RADIUS_IDS.includes(src.avatarRadius) ? src.avatarRadius : STATUS_HUD_DEFAULTS.avatarRadius,
        background: STATUS_HUD_BACKGROUND_IDS.includes(src.background) ? src.background : STATUS_HUD_DEFAULTS.background,
        barColor: STATUS_HUD_BAR_COLOR_IDS.includes(src.barColor) ? src.barColor : STATUS_HUD_DEFAULTS.barColor,
        tables: normalizeStatusHudTables(src.tables),
    };
}

export function normalizeStatusHudTables(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const uid = String(item.uid || '').trim();
        const name = String(item.name || '').trim();
        if (!uid && !name) continue;
        const key = uid || 'name:' + name;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ uid, name });
    }
    return out;
}

export function resolveStatusHudAvatarRadius(avatarRadius) {
    return STATUS_HUD_AVATAR_RADIUS_PX[avatarRadius] != null
        ? STATUS_HUD_AVATAR_RADIUS_PX[avatarRadius]
        : STATUS_HUD_AVATAR_RADIUS_PX.circle;
}

export function resolveStatusHudScale(size, viewportWidth, viewportHeight) {
    const width = Number(viewportWidth) > 0 ? Number(viewportWidth) : 0;
    const height = Number(viewportHeight) > 0 ? Number(viewportHeight) : 0;
    const widthFactor = width > 0 ? width / 900 : 1;
    const heightFactor = height > 0 ? height / 600 : 1;
    const base = clampNumber(Math.min(widthFactor, heightFactor), 0.78, 1.18, 1);
    const tier = STATUS_HUD_SIZE_SCALE[size] != null ? STATUS_HUD_SIZE_SCALE[size] : 1;
    return clampNumber(base * tier, 0.72, 1.28, 1) * STATUS_HUD_OVERALL_SCALE;
}

export function resolveStatusHudLocationScale(size) {
    return STATUS_HUD_LOCATION_SCALE[size] != null ? STATUS_HUD_LOCATION_SCALE[size] : STATUS_HUD_LOCATION_SCALE.medium;
}


export function listStatusHudTables(readResult) {
    if (!readResult || readResult.ok === false) {
        return { ok: false, reason: String((readResult && readResult.reason) || 'missing-api'), tables: [] };
    }
    const tables = parseTables(readResult.data);
    return { ok: true, reason: '', tables: tables.map((table) => ({ uid: table.uid, name: table.name })) };
}

export function resolveStatusAvatar(statusAvatars, character) {
    if (!statusAvatars || typeof statusAvatars !== 'object' || !character) return '';
    const value = statusAvatars[character];
    if (typeof value !== 'string') return '';
    const url = value.trim();
    if (!url) return '';
    if (!/^(?:https?:\/\/|data:image\/)\S+$/i.test(url)) return '';
    return url;
}

export function normalizeStatusAvatars(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [key, value] of Object.entries(raw)) {
        const name = String(key || '').trim();
        if (!name || typeof value !== 'string') continue;
        const url = value.trim();
        if (!url || !/^(?:https?:\/\/|data:image\/)\S+$/i.test(url)) continue;
        out[name] = url;
    }
    return out;
}

function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, numeric));
}


export const STATUS_HUD_TITLE_KEYS = Object.freeze(['姓名', '名称', '角色', '角色名', '名字', '物品名称', '任务名称', '地点名称', '标题']);
const TIME_LABEL_RE = /时间|日期|时长|时刻|钟点|分钟|小时|距今|经过|历时|时段|倒计时/;
const TIME_LIKE_RE = /\d{1,2}:\d{2}|\d{2,4}[-/.]\d{1,2}[-/.]\d{1,2}/;
const RATIO_RE = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/;
const PERCENT_RE = /^(-?\d+(?:\.\d+)?)\s*([%％])?$/;
const COLOR_RULES = Object.freeze([
    [/信任|信赖/, 'trust'],
    [/好感|喜欢|爱意|爱慕/, 'like'],
    [/了解|认知|熟悉/, 'know'],
]);

export function buildStatusHudModel(input = {}) {
    const settings = normalizeStatusHudSettings(input.settings);
    const sceneAssets = input.sceneAssets && typeof input.sceneAssets === 'object' ? input.sceneAssets : {};
    const characters = sceneAssets.characters && typeof sceneAssets.characters === 'object' ? sceneAssets.characters : {};
    const rawCharacter = String(input.character || '').trim();
    // 未在场景素材注册的角色也用原始名作为显示名：状态栏照常显示头像占位、情绪与 HUD 条，
    // 只是取不到自定义头像。
    const character = resolveCharacterKey(characters, sceneAssets.characterAliases, rawCharacter) || rawCharacter;
    const emotion = character ? String(input.emotion || '').trim() : '';
    // 地点栏只在没有角色的旁白页显示；内心页属于角色页，与对白页同样不显示地点。
    const showSceneInfo = settings.showLocation && input.isNarration === true && !rawCharacter;
    const model = {
        enabled: settings.enabled,
        character,
        emotion: settings.showEmotion ? emotion : '',
        location: showSceneInfo ? String(input.location || '').trim() : '',
        time: showSceneInfo && settings.showLocationDetails ? String(input.time || '').trim() : '',
        weather: showSceneInfo && settings.showLocationDetails ? String(input.weather || '').trim() : '',
        showLocationDetails: settings.showLocationDetails,
        avatar: resolveStatusAvatar(sceneAssets.statusAvatars, character),
        avatarRadius: settings.avatarRadius,
        background: settings.background,
        barColor: settings.barColor,
        metrics: [],
        hiddenCount: 0,
        loadState: 'idle',
        loadReason: '',
    };
    if (!settings.enabled || !character) return model;
    if (!settings.tables.length) return model;
    const readResult = input.readResult;
    if (!readResult || readResult.ok === false) {
        model.loadState = 'error';
        model.loadReason = String((readResult && readResult.reason) || 'missing-api');
        return model;
    }
    const resolved = resolveSelectedStatusHudTables(settings.tables, readResult);
    const metrics = [];
    let missingTables = 0;
    for (const entry of resolved) {
        if (!entry.table) { missingTables += 1; continue; }
        metrics.push(...extractStatusHudMetrics(entry.table, character, sceneAssets.characterAliases, entry.pick));
    }
    model.metrics = metrics.slice(0, STATUS_HUD_MAX_METRICS);
    model.hiddenCount = Math.max(0, metrics.length - model.metrics.length);
    if (metrics.length) model.loadState = missingTables ? 'partial' : 'ready';
    else model.loadState = missingTables ? 'missing-table' : 'no-data';
    return model;
}

export function resolveSelectedStatusHudTables(selected, readResult) {
    const wanted = normalizeStatusHudTables(selected);
    if (!wanted.length) return [];
    const available = readResult && readResult.ok !== false ? parseTables(readResult.data) : [];
    return wanted.map((pick) => {
        const table = available.find((item) => (pick.uid && item.uid === pick.uid))
            || available.find((item) => pick.name && item.name === pick.name)
            || null;
        return { pick, table };
    });
}

export function extractStatusHudMetrics(table, character, characterAliases, pick) {
    if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) return [];
    const row = findStatusHudRow(table, character, characterAliases);
    if (!row) return [];
    const metrics = [];
    for (let index = 0; index < row.values.length; index += 1) {
        if (index === row.headerIndex) continue;
        const parsed = parseMetricCell(row.values[index], table.columns[index]);
        if (!parsed) continue;
        for (const metric of parsed) {
            metrics.push({
                label: metric.label,
                percent: metric.percent,
                display: metric.display,
                colorKey: resolveMetricColorKey(metric.label, index),
                sourceUid: String((pick && pick.uid) || table.uid || ''),
                sourceName: String((pick && pick.name) || table.name || ''),
            });
        }
    }
    return metrics;
}

export function findStatusHudRow(table, character, characterAliases) {
    const columns = Array.isArray(table.columns) ? table.columns : [];
    const names = buildCharacterNameSet(character, characterAliases);
    if (!names.size || !Array.isArray(table.rows)) return null;
    for (let index = 0; index < columns.length; index += 1) {
        if (!isTitleColumn(columns[index], index)) continue;
        for (const values of table.rows) {
            if (!Array.isArray(values)) continue;
            const cell = String(values[index] == null ? '' : values[index]).trim();
            if (cell && names.has(cell)) return { values, headerIndex: index };
        }
    }
    for (const values of table.rows) {
        if (!Array.isArray(values)) continue;
        const titles = collectRowTitles(columns, values);
        for (const title of titles) {
            if (names.has(title)) return { values, headerIndex: resolveTitleColumnIndex(columns, values, title) };
        }
    }
    return null;
}

export function collectRowTitles(columns, values) {
    const out = [];
    const idIndex = columns.findIndex((column) => isRowIdColumn(column));
    for (const key of STATUS_HUD_TITLE_KEYS) {
        const index = columns.indexOf(key);
       if (index < 0 || index === idIndex) continue;
        const cell = String(values[index] == null ? '' : values[index]).trim();
        if (cell && !parseMetricCell(values[index], columns[index]) && !isImageCell(values[index])) {
            out.push(cell);
        }
    }
    if (idIndex >= 0) {
        const next = idIndex + 1;
        const cell = next < values.length ? String(values[next] == null ? '' : values[next]).trim() : '';
        if (cell && !parseMetricCell(values[next], columns[next]) && !isImageCell(values[next])
            && !/^\\s*-?\\d+(?:\\.\\d+)?\\s*$/.test(cell)) {
            out.push(cell);
        }
    }
    for (let index = 0; index < values.length; index += 1) {
        if (index === idIndex) continue;
        const raw = values[index];
        if (typeof raw !== 'string') continue;
        const cell = raw.trim();
        if (!cell || cell.length > 40) continue;
        if (parseMetricCell(raw, columns[index]) || isImageCell(raw)) continue;
        if (/^\\s*-?\\d+(?:\\.\\d+)?\\s*$/.test(cell)) continue;
        out.push(cell);
    }
    return out;
}

function resolveTitleColumnIndex(columns, values, title) {
    for (let index = 0; index < values.length; index += 1) {
        const cell = String(values[index] == null ? '' : values[index]).trim();
        if (cell === title) return index;
    }
    return 0;
}

export function isImageCell(value) {
    return typeof value === 'string' && /^(?:https?:\/\/|data:image\/)\S+$/i.test(value.trim());
}

export function parseMetricCell(raw, header) {
    if (typeof raw !== 'string') return null;
    const text = raw.trim();
    if (!text || TIME_LIKE_RE.test(text)) return null;
    const segments = text.split(/[;；]/);
    const out = [];
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index].trim();
        if (!segment) continue;
        const parsed = parseMetricSegment(segment, header, segments.length, index);
        if (parsed) out.push(parsed);
    }
    return out.length ? out : null;
}

function parseMetricSegment(segment, header, segmentCount, index) {
    let label = '';
    let rest = segment;
    let hasLabel = false;
    const colon = segment.search(/[:：]/);
    if (colon === 0) return null;
    if (colon > 0) {
        label = segment.slice(0, colon).trim();
        rest = segment.slice(colon + 1).trim();
        hasLabel = true;
    } else {
        const inline = segment.match(/^([^\d\s][^\s]{0,11})\s+(-?\d+(?:\.\d+)?\s*(?:[%％]|\/\s*\d+(?:\.\d+)?))$/);
        if (inline && !/[，。！？、；]/.test(inline[1])) {
            label = inline[1].trim();
            rest = inline[2].trim();
        } else {
            if (!header) return null;
            label = String(header).trim() + (segmentCount > 1 ? String(index + 1) : '');
        }
    }
    if (!label || TIME_LABEL_RE.test(label)) return null;
    const ratio = rest.match(RATIO_RE);
    if (ratio) {
        const current = parseFloat(ratio[1]);
        const cap = parseFloat(ratio[2]);
        if (!hasLabel && cap < 10) return null;
        const percent = toPercent(current, cap);
        if (percent == null) return null;
        return { label, percent, display: formatNumber(current) + '/' + formatNumber(cap) };
    }
    const single = rest.match(PERCENT_RE);
    if (!single) return null;
    const hasPercentSign = Boolean(single[2]);
    if (!hasLabel && !hasPercentSign) return null;
    const value = parseFloat(single[1]);
    if (!Number.isFinite(value)) return null;
    if (value < 0 || value > 100) return null;
    const percent = value;
    return { label, percent, display: formatNumber(percent) + '%' };
}

function buildCharacterNameSet(character, characterAliases) {
    const names = new Set();
    const main = String(character || '').trim();
    if (!main) return names;
    names.add(main);
    const aliases = characterAliases && typeof characterAliases === 'object' ? characterAliases : {};
    const values = Array.isArray(aliases[main]) ? aliases[main] : [];
    for (const value of values) {
        const alias = String(value || '').trim();
        if (alias) names.add(alias);
    }
    return names;
}

function isTitleColumn(column, index) {
    if (index === 0) return false;
    const normalized = String(column || '').trim();
    return Boolean(normalized) && STATUS_HUD_TITLE_KEYS.includes(normalized);
}

function isRowIdColumn(name) {
    const normalized = String(name || '').trim().toLowerCase();
    return normalized === 'row_id' || normalized === 'rowid' || normalized === 'id' || normalized === '序号';
}

function resolveMetricColorKey(label, columnIndex) {
    const text = String(label || '');
    for (const [pattern, key] of COLOR_RULES) {
        if (pattern.test(text)) return key;
    }
    return 'slot-' + ((Math.max(0, columnIndex) % 6) + 1);
}

function toPercent(current, cap) {
    if (!Number.isFinite(current) || !Number.isFinite(cap) || cap <= 0) return null;
    return clampNumber((current / cap) * 100, 0, 100, null);
}

function formatNumber(value) {
    if (!Number.isFinite(value)) return '';
    return Math.abs(value - Math.round(value)) < 0.05
        ? String(Math.round(value))
        : String(Math.round(value * 10) / 10);
}
