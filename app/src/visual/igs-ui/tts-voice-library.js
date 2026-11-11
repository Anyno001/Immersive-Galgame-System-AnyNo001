import { editFolderState, groupFolderItems, normalizeFolderState } from './folder-state.js';

export const TTS_VOICE_LANGUAGES = Object.freeze([
    ['', '未设置'], ['zh', '中文'], ['ja', '日文'], ['en', '英文'], ['ko', '韩文'],
    ['fr', '法文'], ['de', '德文'], ['es', '西班牙文'], ['pt', '葡萄牙文'],
    ['ru', '俄文'], ['it', '意大利文'], ['ar', '阿拉伯文'], ['yue', '粤语'],
]);

export function normalizeTtsVoiceLibrary(value, voiceIds = null) {
    const source = value && typeof value === 'object' ? value : {};
    const allowed = voiceIds ? new Set(voiceIds) : null;
    const languages = Object.create(null);
    if (source.languages && typeof source.languages === 'object') {
        for (const [id, language] of Object.entries(source.languages)) {
            if ((!allowed || allowed.has(id)) && language && TTS_VOICE_LANGUAGES.some(([code]) => code === language)) languages[id] = language;
        }
    }
    const folders = normalizeFolderState(source.folders);
    folders.view = 'list';
    for (const id of Object.keys(folders.assign)) if (allowed && !allowed.has(id)) delete folders.assign[id];
    return { languages, folders };
}

export function editTtsVoiceLibrary(value, operation, params = {}) {
    const next = normalizeTtsVoiceLibrary(value);
    if (operation === 'language') {
        if (TTS_VOICE_LANGUAGES.some(([code]) => code === params.language) && params.item) {
            if (params.language) next.languages[params.item] = params.language;
            else delete next.languages[params.item];
        }
    } else next.folders = editFolderState(next.folders, operation, params);
    return next;
}

export function renameTtsVoiceLibraryItem(value, from, to) {
    const next = normalizeTtsVoiceLibrary(value);
    if (Object.prototype.hasOwnProperty.call(next.languages, from)) {
        next.languages[to] = next.languages[from]; delete next.languages[from];
    }
    next.folders = editFolderState(next.folders, 'rename-item', { item: from, to });
    return next;
}

export function groupTtsVoiceOptions(entries, value) {
    const library = normalizeTtsVoiceLibrary(value, entries.map(([id]) => id));
    // 选声处只显示名称和语言，不带声音 ID；没起名的显示 ID，名称与语言都相同的几个保留 ID 以便区分。
    const languageOf = id => TTS_VOICE_LANGUAGES.find(([code]) => code === library.languages[id])?.[1];
    const text = (name, id) => (languageOf(id) ? `${name} · ${languageOf(id)}` : name);
    const count = new Map();
    for (const [id, title] of entries) count.set(text(title || id, id), (count.get(text(title || id, id)) || 0) + 1);
    const options = new Map(entries.map(([id, title]) => [id, [id,
        title && count.get(text(title, id)) > 1 ? text(`${title}（${id}）`, id) : text(title || id, id)]]));
    if (!library.folders.folders.length) return [{ label: '', items: [...options.values()] }];
    return groupFolderItems(library.folders, [...options.keys()]).filter(group => group.items.length)
        .map(group => ({ label: group.folder || '未分类', items: group.items.map(id => options.get(id)) }));
}
