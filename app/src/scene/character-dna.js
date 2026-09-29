// 角色 DNA：结构化文本角色资料的规范化、别名解析与提示词片段合并。
// 数据位于 sceneAssets.characterDna，与情绪槽映射 sceneAssets.characters 并列，互不混入。

export const CHARACTER_DNA_FIELDS = Object.freeze(['identity', 'defaultAppearance', 'negative', 'triggerWords']);

// 预设与导入文件属于不可信输入，拒绝原型污染键。
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const plainObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

function cleanText(value) {
    return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
}

export function normalizeCharacterDna(raw) {
    const source = plainObject(raw) || {};
    const dna = {};
    for (const field of CHARACTER_DNA_FIELDS) dna[field] = cleanText(source[field]);
    return dna;
}

export function isCharacterDnaEmpty(dna) {
    return CHARACTER_DNA_FIELDS.every((field) => !cleanText(dna?.[field]));
}

// 空记录保留：DNA-only 角色可以先登记名字、后补资料。
export function normalizeCharacterDnaMap(raw) {
    const out = {};
    const source = plainObject(raw);
    if (!source) return out;
    for (const [key, value] of Object.entries(source)) {
        const name = cleanText(key);
        if (!name || FORBIDDEN_KEYS.has(name) || hasOwn(out, name)) continue;
        out[name] = normalizeCharacterDna(value);
    }
    return out;
}

// resolveCanonical 由调用方注入既有别名归约，不维护第二套身份解析。
export function resolveCharacterDna(dnaMap, name, resolveCanonical) {
    const raw = cleanText(name);
    const map = plainObject(dnaMap);
    if (!raw || !map) return null;
    const mapped = typeof resolveCanonical === 'function' ? cleanText(resolveCanonical(raw)) : '';
    const canonical = mapped || raw;
    const key = hasOwn(map, canonical) ? canonical : (hasOwn(map, raw) ? raw : '');
    if (!key) return null;
    return { name: key, dna: normalizeCharacterDna(map[key]) };
}

// 改名保序迁移；目标名已有 DNA 时拒绝，避免覆盖另一角色资料。
export function renameCharacterDna(dnaMap, oldName, newName) {
    const map = plainObject(dnaMap) || {};
    const target = cleanText(newName);
    if (!target || FORBIDDEN_KEYS.has(target)) return { ok: false, reason: 'invalid-name', map };
    if (!hasOwn(map, oldName) || target === oldName) return { ok: true, map };
    if (hasOwn(map, target)) return { ok: false, reason: 'name-exists', map };
    const next = {};
    for (const [key, value] of Object.entries(map)) next[key === oldName ? target : key] = value;
    return { ok: true, map: next };
}

export function removeCharacterDna(dnaMap, name) {
    const map = plainObject(dnaMap) || {};
    if (!hasOwn(map, name)) return map;
    const next = { ...map };
    delete next[name];
    return next;
}

// 按顶层逗号/换行切分；括号内的逗号属于权重语法，不切分。
export function splitPromptTags(text) {
    const tags = [];
    let depth = 0;
    let buf = '';
    for (const ch of cleanText(text)) {
        if ('([{'.includes(ch)) depth += 1;
        else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1);
        if (depth === 0 && (ch === ',' || ch === '，' || ch === '\n')) {
            if (buf.trim()) tags.push(buf.trim());
            buf = '';
        } else {
            buf += ch;
        }
    }
    if (buf.trim()) tags.push(buf.trim());
    return tags;
}

// 保序合并并稳定去重（大小写与空白不敏感），不改写单项内容。
export function mergePromptTags(...parts) {
    const seen = new Set();
    const out = [];
    for (const part of parts.flat()) {
        for (const tag of splitPromptTags(part)) {
            const key = tag.toLowerCase().replace(/\s+/g, ' ');
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(tag);
        }
    }
    return out.join(', ');
}

// 固定顺序：triggerWords → identity →（立绘链才追加）defaultAppearance；空字段不注入。
export function buildCharacterDnaPromptParts(dna, { includeDefaultAppearance = false } = {}) {
    const d = normalizeCharacterDna(dna);
    const positive = [d.triggerWords, d.identity];
    if (includeDefaultAppearance) positive.push(d.defaultAppearance);
    return { positive: mergePromptTags(positive), negative: mergePromptTags(d.negative) };
}

