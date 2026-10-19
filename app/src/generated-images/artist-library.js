// 画师库只保存文本；应用复制到既有配置，运行时不按库条目另行拼词。
import { parsePromptImportJson } from '../presets/prompt-import-json.js';
import { PROMPT_KINDS, normalizeArtistByKind } from './prompt-artists.js';

const fail = reason => ({ ok: false, reason });
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const reserved = new Set(['__proto__', 'prototype', 'constructor']);
const validId = id => typeof id === 'string' && id.trim() === id && id.length > 0
    && id.length <= 160 && !reserved.has(id) && !/[\u0000-\u001f]/.test(id);
const nameKey = name => name.trim().toLocaleLowerCase();

function rowsToEntries(rows, requireId = false, allowDuplicates = false) {
    if (!Array.isArray(rows) || rows.length > 500) return fail('画师库必须是最多 500 条的数组');
    const entries = [], ids = new Set(), names = new Set();
    for (const row of rows) {
        if (!plain(row) || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 120)
            return fail('画师条目缺少有效名称（最多 120 字）');
        const name = row.name.trim();
        const id = row.id === undefined && !requireId ? `artist-${name}` : row.id;
        if (!validId(id)) return fail('画师条目 ID 无效');
        if (typeof row.positivePrompt !== 'string' || typeof row.negativePrompt !== 'string'
            || row.positivePrompt.length > 20000 || row.negativePrompt.length > 20000)
            return fail('画师正负向必须是文本，且各不超过 20000 字');
        if (!allowDuplicates && (ids.has(id) || names.has(nameKey(name))))
            return fail('画师 ID 或名称重复，整批未导入');
        ids.add(id); names.add(nameKey(name));
        entries.push({ id, name, positivePrompt: row.positivePrompt, negativePrompt: row.negativePrompt });
    }
    return { ok: true, value: entries };
}

export function readArtistLibrary(value) {
    if (value === undefined) return { ok: true, value: [] };
    if (!plain(value) || value.version !== 1) return fail('画师库版本或结构无效，未覆盖原资料');
    return rowsToEntries(value.entries, true);
}

// 非法持久资料原样保留，UI 明示错误并拒绝修改，不能用空库覆盖它。
export function normalizeArtistLibrary(value) {
    const result = readArtistLibrary(value);
    return result.ok ? { version: 1, entries: result.value } : value;
}

export function importArtistLibrary(raw, library, { overwrite = false } = {}) {
    const current = readArtistLibrary(library);
    if (!current.ok) return current;
    let payload;
    try { payload = parsePromptImportJson(raw); }
    catch { return fail('JSON 无效或包含重复字段，整批未导入'); }
    // 不复制外部对象或图像；危险键整批拒绝，未知普通字段不进入配置。
    const unsafe = value => value && typeof value === 'object'
        && Object.keys(value).some(key => reserved.has(key) || unsafe(value[key]));
    if (unsafe(payload)) return fail('JSON 包含危险字段，整批未导入');
    let rows;
    if (Array.isArray(payload)) rows = payload;
    else if (plain(payload) && payload.version === 1) rows = payload.entries;
    else if (plain(payload) && plain(payload.presets)) {
        rows = [];
        for (const [name, preset] of Object.entries(payload.presets)) {
            if (!plain(preset) || ['fixedPrompt', 'fixedPrompt_end', 'negativePrompt']
                .some(key => preset[key] !== undefined && typeof preset[key] !== 'string'))
                return fail('presets 中的画师正负向必须是文本');
            rows.push({ name, positivePrompt: [preset.fixedPrompt, preset.fixedPrompt_end]
                .filter(value => value !== undefined && value !== '').join(', '),
            negativePrompt: preset.negativePrompt || '' });
        }
    } else return fail('不支持的画师 JSON 格式');
    const imported = rowsToEntries(rows, false, true);
    if (!imported.ok) return imported;
    if (!imported.value.length) return fail('文件中没有画师条目');
    let entries = [...current.value];
    let added = 0, overwritten = 0, skipped = 0, conflicts = 0;
    for (const entry of imported.value) {
        const matches = row => row.id === entry.id || nameKey(row.name) === nameKey(entry.name);
        const index = entries.findIndex(matches);
        if (index < 0) {
            entries.push(entry);
            added++;
            continue;
        }
        conflicts++;
        if (!overwrite) {
            skipped++;
            continue;
        }
        entries = entries.filter(row => !matches(row));
        entries.splice(index, 0, entry);
        overwritten++;
    }
    const merged = rowsToEntries(entries, true);
    return merged.ok ? { ok: true, value: { version: 1, entries: merged.value },
        count: added + overwritten, added, overwritten, skipped, conflicts } : merged;
}

export function saveArtistEntry(library, entry, { create = false } = {}) {
    const current = readArtistLibrary(library);
    if (!current.ok) return current;
    if (!plain(entry)) return fail('画师条目无效');
    const found = current.value.some(row => row.id === entry.id);
    if (create ? found : !found) return fail(create ? '画师 ID 已存在' : '所选画师条目不存在');
    const rows = create ? [...current.value, entry]
        : current.value.map(row => row.id === entry.id ? entry : row);
    const checked = rowsToEntries(rows, true);
    return checked.ok ? { ok: true, value: { version: 1, entries: checked.value } } : checked;
}

export function removeArtistEntry(library, id) {
    const current = readArtistLibrary(library);
    if (!current.ok) return current;
    if (!current.value.some(row => row.id === id)) return fail('所选画师条目不存在');
    return { ok: true, value: { version: 1, entries: current.value.filter(row => row.id !== id) } };
}

// 仅迁移设置草稿中的管理资料；成功保存后才持久化，不改当前生效画师文本。
export function preserveConfiguredArtists(nai) {
    const current = readArtistLibrary(nai.artistLibrary);
    if (!current.ok) return current;
    if (nai.artistLibraryArchived === true) return { ok: true, value: nai };
    let library = { version: 1, entries: current.value };
    const add = (name, positivePrompt, negativePrompt) => {
        if (!positivePrompt && !negativePrompt) return { ok: true };
        if (library.entries.some(row => row.positivePrompt === positivePrompt
            && row.negativePrompt === negativePrompt)) return { ok: true };
        let suffix = 1, title = name, id = `saved-${name}`;
        while (library.entries.some(row => row.id === id || nameKey(row.name) === nameKey(title))) {
            suffix++; title = `${name} ${suffix}`; id = `saved-${name}-${suffix}`;
        }
        const result = saveArtistEntry(library, { id, name: title, positivePrompt, negativePrompt }, { create: true });
        if (result.ok) library = result.value;
        return result;
    };
    const text = value => typeof value === 'string' ? value : '';
    const rows = [['原全局画师', text(nai.artistPrefix), text(nai.artistNegativePrefix)],
        ...PROMPT_KINDS.map(([kind, label]) => [`原${label}画师`,
            text(nai.artistByKind?.kinds?.[kind]?.positive), text(nai.artistByKind?.kinds?.[kind]?.negative)]),
        ['旧通用负面（归档）', '', text(nai.negativePrompt)]];
    for (const row of rows) {
        const result = add(...row);
        if (!result.ok) return result;
    }
    return { ok: true, value: { ...nai, artistLibrary: library, artistLibraryArchived: true } };
}

export function applyLibraryArtist(nai, id, target) {
    const library = readArtistLibrary(nai?.artistLibrary);
    if (!library.ok) return library;
    const entry = library.value.find(item => item.id === id);
    if (!entry) return fail('所选画师条目不存在');
    if (target === 'global') return { ok: true, value: {
        ...nai, artistPrefix: entry.positivePrompt, artistNegativePrefix: entry.negativePrompt,
    } };
    if (!PROMPT_KINDS.some(([kind]) => kind === target)) return fail('画师应用目标无效');
    const artistByKind = normalizeArtistByKind(nai.artistByKind);
    artistByKind.kinds[target] = { positive: entry.positivePrompt, negative: entry.negativePrompt };
    return { ok: true, value: { ...nai, artistByKind } };
}
