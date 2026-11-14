// 卡组素材的纯选择逻辑：路径、角色归属、预算与摘要，不读宿主、不改原始对象。
export const MATERIAL_CHAR_LIMIT = 14000;
export const GENERATION_HINT_LIMIT = 1600;
const RELEVANT = /技能|能力|天赋|职业|血统|装备|武器|法术|功法|异能|skill|abilit|talent|class|equipment|spell/i;
const PRIVATE = /密码|密钥|token|password|api.?key|secret/i;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const own = (o, k) => o && Object.hasOwn(o, k);
const escapePart = (s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1');
const object = (v) => v !== null && typeof v === 'object';

export function materialPath(parts) { return `/${parts.map(escapePart).join('/')}`; }

export function readMaterialPath(data, path) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.length > 500) return undefined;
    const parts = path.slice(1).split('/').map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
    let value = data;
    for (const part of parts) {
        if (BLOCKED_KEYS.has(part) || PRIVATE.test(part) || !own(value, part)) return undefined;
        value = value[part];
    }
    return value;
}

// 主角别称只在目标确实为用户时采用；其他角色不继承「主角」节点。
export function materialActorNames(name, protagonist) {
    return [...new Set([name, ...(name === protagonist ? ['主角', '玩家', 'user', '{{user}}'] : [])].filter(Boolean))];
}

export function discoverMvuMaterials(data, names) {
    const candidates = [];
    let visited = 0;
    const walk = (value, parts, actor) => {
        if (!object(value) || parts.length > 10 || visited++ > 2500 || candidates.length >= 80) return;
        for (const [key, child] of Object.entries(value)) {
            if (candidates.length >= 80) break;
            if (BLOCKED_KEYS.has(key) || PRIVATE.test(key) || key.startsWith('$')) continue;
            const path = [...parts, key];
            const belongs = actor || names.includes(key);
            if (RELEVANT.test(key)) {
                candidates.push({ id: materialPath(path), label: path.join(' → '), selected: belongs, value: child });
            } else walk(child, path, belongs);
        }
    };
    walk(data, [], false);
    return candidates;
}

// 限制遍历深度和字段数；字符串完整保留，让模型区分已学会与未解锁。
export function compactMaterial(value, depth = 0, budget = { nodes: 0 }) {
    if (budget.nodes++ > 600 || depth > 7) return '（内容省略）';
    if (typeof value === 'string') return value;
    if (!object(value)) return value ?? null;
    if (Array.isArray(value)) return [...value.slice(0, 50).map((v) => compactMaterial(v, depth + 1, budget)), ...(value.length > 50 ? ['（其余条目省略）'] : [])];
    const entries = Object.entries(value).filter(([k]) => !PRIVATE.test(k) && !BLOCKED_KEYS.has(k) && !k.startsWith('$'));
    return Object.fromEntries([...entries.slice(0, 60).map(([k, v]) => [k, compactMaterial(v, depth + 1, budget)]),
        ...(entries.length > 60 ? [['_素材提示', '其余字段省略，可改选更具体的路径']] : [])]);
}

export function selectGenerationMaterials(source, selection = {}) {
    const candidates = source.candidates || [];
    const requestedPaths = Array.isArray(selection.mvuPaths) ? [...new Set(selection.mvuPaths)].slice(0, 40) : null;
    const paths = selection.useMvu === false ? [] : requestedPaths || candidates.filter((c) => c.selected).map((c) => c.id);
    const tableIds = selection.useTables === false ? [] : Array.isArray(selection.tableIds) ? selection.tableIds : (source.tables || []).filter((t) => t.selected).map((t) => t.id);
    const mvu = paths.map((path) => ({ path, value: readMaterialPath(source.statData, path) }));
    const invalid = mvu.filter((item) => item.value === undefined).map((item) => item.path);
    if (invalid.length) return { ok: false, reason: 'combat-material-path-invalid', invalid };
    const allTables = source.tables || [];
    if (tableIds.some((id) => !allTables.some((t) => t.id === id))) return { ok: false, reason: 'combat-material-table-missing' };
    const tables = allTables.filter((t) => tableIds.includes(t.id));
    const errors = [];
    if (selection.useMvu !== false && source.mvuStatus === 'error') errors.push('MVU 读取失败');
    if (selection.useTables !== false && source.tableStatus === 'error') errors.push('技能表读取失败');
    if (errors.length) return { ok: false, reason: 'combat-material-read-failed', errors };
    const materials = {
        mvu: selection.useMvu === false ? [] : mvu.map(({ path, value }) => ({ path, value: compactMaterial(value) })),
        tables: selection.useTables === false ? [] : tables.map((t) => ({ name: t.name, ownership: t.ownership, rows: compactMaterial(t.rows) })),
        priority: selection.priority === 'tables' ? 'tables' : 'mvu',
    };
    if (JSON.stringify(materials).length > MATERIAL_CHAR_LIMIT) return { ok: false, reason: 'combat-material-too-large' };
    return { ok: true, materials, selection: { ...selection, mvuPaths: paths, tableIds },
        summary: `${materials.mvu.length} 项变量 · ${materials.tables.length} 张技能表` };
}
