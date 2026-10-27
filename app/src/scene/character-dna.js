// 角色 DNA：结构化文本角色资料的规范化、别名解析与提示词片段合并。
// 数据位于 sceneAssets.characterDna，与情绪槽映射 sceneAssets.characters 并列，互不混入。
import { normalizeCreatureProfile } from './creature-profile.js';

export const CHARACTER_DNA_FIELDS = Object.freeze(['identity', 'defaultAppearance', 'negative', 'triggerWords', 'personality']);
export const CHARACTER_DNA_REQUIRED_VIEWS = Object.freeze(['full_body', 'half_body', 'portrait']);
export const characterDnaNeedsViews = dna => dna?.version === 2
    && CHARACTER_DNA_REQUIRED_VIEWS.some(view => typeof dna.views?.[view]?.subject !== 'string'
        || !dna.views[view].subject.trim());
// partial 只兼容历史资料与明确的旧任务，不参与新建完整性要求。
export const CHARACTER_DNA_VIEWS = Object.freeze(['full_body', 'half_body', 'portrait', 'partial']);
export const CHARACTER_DNA_EDIT_FIELDS = Object.freeze([...CHARACTER_DNA_FIELDS,
    ...CHARACTER_DNA_VIEWS.flatMap((view) => [`views.${view}.subject`, `views.${view}.negative`])]);

export const hasLegacyCharacterIdentity = dna => dna?.version !== 2
    && ['identity', 'triggerWords'].some(key => typeof dna?.[key] === 'string' && dna[key].trim());

export function characterDnaIdentityCleared(dna) {
    if (dna?.identityInitialized !== true) return false;
    const views = Object.values(dna.views || {});
    if (!dna.identity?.trim() && !views.some(view => view.subject?.trim())) return true;
    if (Array.isArray(dna.clearedViews)) return dna.clearedViews.some(view => !dna.views?.[view]?.subject?.trim());
    // 旧资料没有逐景别编辑标记；负面词占位不代表用户清空过身份。
    return views.some(view => typeof view.subject === 'string' && !view.subject.trim() && !view.negative?.trim());
}

// 景别资料是同一身份的不同取景文本，不从旧自由文本自动推导。
export function checkDnaViews(raw, { complete = false, allowEmpty = false } = {}) {
    // 只输出程序定义的字段和原因，不携带身份正文或未知键。
    const fail = (field, issue, detail) => {
        const labels = { 'object-required': '必须是景别对象', 'unknown-view': '包含未知景别',
            'view-required': '缺少必需景别', 'subject-required': '缺少身份主语',
            'string-required': '必须是文本', 'empty-subject': '身份主语为空',
            'text-too-long': '文本超过4096字符', 'recursive-placeholder': '身份资料含递归占位符' };
        return { ok: false, reason: 'DNA_VIEW_INVALID',
            error: `景别 DNA 格式无效 [字段=${field}；原因=${labels[detail]}]`,
            diagnostic: { code: 'DNA_VIEW_INVALID', field, issue, detail } };
    };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return fail('dna.views', 'invalid', 'object-required');
    if (Object.keys(raw).some((key) => !CHARACTER_DNA_VIEWS.includes(key)))
        return fail('dna.views', 'invalid', 'unknown-view');
    const value = {};
    for (const view of CHARACTER_DNA_VIEWS) {
        const item = raw[view], field = `dna.views.${view}`;
        if (item === undefined && (!complete || !CHARACTER_DNA_REQUIRED_VIEWS.includes(view))) continue;
        if (item === undefined) return fail(field, 'missing', 'view-required');
        if (!item || typeof item !== 'object' || Array.isArray(item)) return fail(field, 'invalid', 'object-required');
        if (item.subject === undefined) return fail(`${field}.subject`, 'missing', 'subject-required');
        if (typeof item.subject !== 'string') return fail(`${field}.subject`, 'invalid', 'string-required');
        if (!allowEmpty && !item.subject.trim()) return fail(`${field}.subject`, 'invalid', 'empty-subject');
        if (item.subject.length > 4096) return fail(`${field}.subject`, 'invalid', 'text-too-long');
        if (item.negative !== undefined && typeof item.negative !== 'string')
            return fail(`${field}.negative`, 'invalid', 'string-required');
        if (item.negative?.length > 4096) return fail(`${field}.negative`, 'invalid', 'text-too-long');
        if (/<<dna(?:_uc)?:/i.test(item.subject + (item.negative || ''))) {
            const part = /<<dna(?:_uc)?:/i.test(item.subject) ? '.subject'
                : /<<dna(?:_uc)?:/i.test(item.negative || '') ? '.negative' : '';
            return fail(field + part, 'placeholder', 'recursive-placeholder');
        }
        value[view] = { subject: cleanText(item.subject), negative: cleanText(item.negative) };
    }
    return { ok: true, value };
}

// personality: false 时身份主语不接性格（灵动方案的性格由手势表现，不进画图词）。
export function readCharacterDnaView(raw, framing, { personality: withPersonality = true } = {}) {
    if (!CHARACTER_DNA_VIEWS.includes(framing)) return { ok: false, reason: 'DNA_VIEW_INVALID', error: '未知人物景别' };
    const dna = normalizeCharacterDna(raw);
    if (!dna.identity && !CHARACTER_DNA_VIEWS.some((view) => dna.views?.[view]?.subject))
        return { ok: false, reason: 'DNA_MISSING', error: dna.identityInitialized
            ? '角色身份已手工清空，请先补齐 DNA' : '角色缺少 DNA，请先生成立绘' };
    if (raw?.version !== undefined && raw.version !== 2)
        return { ok: false, reason: 'DNA_VIEW_INVALID', error: '未知 DNA 版本' };
    if (raw?.version !== 2 || raw?.views === undefined)
        return { ok: false, reason: 'DNA_VIEW_MISSING', error: '角色缺少对应景别 DNA，请通过立绘补齐' };
    const checked = checkDnaViews(raw.views, { allowEmpty: true });
    if (!checked.ok) return checked;
    if (!checked.value[framing]?.subject) return { ok: false, reason: 'DNA_VIEW_MISSING', error: '角色缺少对应景别 DNA，请通过立绘补齐' };
    const personality = checkCharacterPersonality(raw.personality);
    if (!personality.ok) return personality;
    const view = checked.value[framing];
    return { ok: true, value: { ...view, subject: withPersonality && personality.value
        ? `${view.subject.replace(/[\s,]+$/, '')}, ${personality.value}` : view.subject } };
}

export function checkCharacterPersonality(value) {
    if (value === undefined) return { ok: true, value: '' };
    if (typeof value !== 'string' || value.length > 4096 || /<<\s*(?:dna|outfit)/i.test(value))
        return { ok: false, reason: 'DNA_VIEW_INVALID', error: '性格 DNA 必须是无占位符的独立文本',
            diagnostic: { code: 'DNA_VIEW_INVALID', field: 'dna.personality', issue: 'invalid' } };
    return { ok: true, value: cleanText(value) };
}

export function editCharacterDnaField(raw, field, value) {
    if (!CHARACTER_DNA_EDIT_FIELDS.includes(field) || typeof value !== 'string') return null;
    const next = { ...normalizeCharacterDna(raw) };
    if (CHARACTER_DNA_FIELDS.includes(field)) {
        next[field] = value;
        if (field === 'identity') next.identityInitialized = true;
    } else {
        const [, view, part] = field.split('.');
        next.version = 2;
        next.views = { ...next.views, [view]: { subject: '', negative: '', ...next.views?.[view], [part]: value } };
        // 手工编辑身份（包括主动清空）锁定资料；只填负面词不阻止首次立绘建档。
        if (part === 'subject') {
            const cleared = new Set(next.clearedViews || (next.identityInitialized ? Object.entries(next.views)
                .filter(([key, item]) => key !== view && !item.subject && !item.negative).map(([key]) => key) : []));
            next.identityInitialized = true;
            if (value.trim()) cleared.delete(view); else cleared.add(view);
            next.clearedViews = [...cleared];
        }
    }
    return next;
}

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
    for (const field of CHARACTER_DNA_FIELDS) {
        if (field !== 'personality' || hasOwn(source, field)) dna[field] = cleanText(source[field]);
    }
    if (source.identityInitialized === true) dna.identityInitialized = true;
    // 非人档案与 views 同级；缺省即人类，不产生该字段。
    const creature = normalizeCreatureProfile(source.creature);
    if (creature) dna.creature = creature;
    if (typeof source.identitySource === 'string' && source.identitySource) dna.identitySource = source.identitySource;
    if (source.version === 2) {
        dna.version = 2;
        dna.views = {};
        for (const view of CHARACTER_DNA_VIEWS) {
            const item = plainObject(source.views?.[view]);
            if (item) dna.views[view] = { subject: cleanText(item.subject), negative: cleanText(item.negative) };
        }
        if (Array.isArray(source.clearedViews)) dna.clearedViews = [...new Set(source.clearedViews)]
            .filter(view => CHARACTER_DNA_VIEWS.includes(view) && !dna.views[view]?.subject);
    }
    return dna;
}

export function isCharacterDnaEmpty(dna) {
    return CHARACTER_DNA_FIELDS.every((field) => !cleanText(dna?.[field])) && !normalizeCreatureProfile(dna?.creature)
        && CHARACTER_DNA_VIEWS.every((view) => !cleanText(dna?.views?.[view]?.subject));
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

// 性格独立保存，使用时与身份合并；不复制进各景别资料。
export function buildCharacterDnaPromptParts(dna, { includeDefaultAppearance = false } = {}) {
    const d = normalizeCharacterDna(dna);
    const positive = [d.triggerWords, d.identity, d.personality];
    if (includeDefaultAppearance) positive.push(d.defaultAppearance);
    return { positive: mergePromptTags(positive), negative: mergePromptTags(d.negative) };
}
