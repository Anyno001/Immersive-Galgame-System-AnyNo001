import { editTtsVoices, normalizeTtsSettings, ttsVoiceEntries } from './tts.js';
import { editTtsVoiceLibrary, normalizeTtsVoiceLibrary, renameTtsVoiceLibraryItem, TTS_VOICE_LANGUAGES } from './tts-voice-library.js';

function collapseRows(settingsState, source) {
    const open = settingsState.asyncState && settingsState.asyncState.advancedOpen;
    if (!open) return;
    settingsState.asyncState.advancedOpen = Object.fromEntries(Object.entries(open).filter(([key]) => !key.startsWith(`perf-tts-voice-${source}-`)));
}

const decode = value => { try { return decodeURIComponent(value || ''); } catch { return String(value || ''); } };
const BULK = ['select', 'pick', 'pick-all', 'bulk-delete', 'bulk-move', 'bulk-language'];
// 选择对话框会丢掉空值选项，「未分类」「未设置」用占位值。
const NONE = '__none__';

// 多选只记在界面状态 asyncState.ttsVoiceSelect = { source, ids } 里；批量删除、移文件夹、设语言一次写回。
async function handleBulk(command, source, parts, { settingsState, dialogs, persistSettingsDraft, rerenderSettings, isCurrent = () => true }) {
    const asyncState = settingsState.asyncState || (settingsState.asyncState = {});
    const cur = asyncState.ttsVoiceSelect && asyncState.ttsVoiceSelect.source === source ? asyncState.ttsVoiceSelect : null;
    if (command === 'select') {
        asyncState.ttsVoiceSelect = cur ? null : { source, ids: new Set() };
        return rerenderSettings();
    }
    if (!cur) return rerenderSettings();
    const reader = settingsState.draft.readerSettings || (settingsState.draft.readerSettings = {});
    const tts = normalizeTtsSettings(reader.tts);
    const api = tts[source];
    const all = ttsVoiceEntries(api.voices).map(([id]) => id);
    if (command === 'pick') {
        const id = decode(parts[0]);
        if (cur.ids.has(id)) cur.ids.delete(id); else if (all.includes(id)) cur.ids.add(id);
        return rerenderSettings();
    }
    if (command === 'pick-all') {
        cur.ids = cur.ids.size === all.length ? new Set() : new Set(all);
        return rerenderSettings();
    }
    const ids = all.filter(id => cur.ids.has(id));
    if (!ids.length) return rerenderSettings();
    let library = api.voiceLibrary, voices = api.voices;
    if (command === 'bulk-delete') {
        if (!await dialogs.confirm(`删除选中的 ${ids.length} 个声音？`)) return rerenderSettings();
        for (let index = all.length - 1; index >= 0; index -= 1) if (cur.ids.has(all[index])) voices = editTtsVoices(voices, { index, remove: true }).text;
    } else if (command === 'bulk-move') {
        const folders = library.folders.folders;
        if (!folders.length) { await dialogs.alert('尚无文件夹，请先新建文件夹。'); return rerenderSettings(); }
        const to = await dialogs.choose(`将 ${ids.length} 个声音移到：`, [{ value: NONE, label: '未分类' }, ...folders.map(name => ({ value: name, label: name }))]);
        if (to === null || to === undefined || to === '') return rerenderSettings();
        if (to !== NONE && !folders.includes(to)) return { ok: false, error: '文件夹已不存在' };
        for (const item of ids) library = editTtsVoiceLibrary(library, 'move', { item, to: to === NONE ? '' : to });
    } else {
        const language = await dialogs.choose(`将 ${ids.length} 个声音的语言设为：`, TTS_VOICE_LANGUAGES.map(([code, label]) => ({ value: code || NONE, label })));
        if (language === null || language === undefined || language === '') return rerenderSettings();
        const code = language === NONE ? '' : language;
        if (!TTS_VOICE_LANGUAGES.some(([known]) => known === code)) return { ok: false, error: '无效的语言' };
        for (const item of ids) library = editTtsVoiceLibrary(library, 'language', { item, language: code });
    }
    if (!isCurrent()) return { ok: false, reason: 'settings-not-open' };
    library = normalizeTtsVoiceLibrary(library, ttsVoiceEntries(voices).map(([id]) => id));
    const before = reader.tts;
    reader.tts = { ...tts, [source]: { ...api, voices, voiceLibrary: library } };
    const persisted = persistSettingsDraft();
    if (persisted.ok === false) { reader.tts = before; return persisted; }
    asyncState.ttsVoiceSelect = null;
    if (command === 'bulk-delete') collapseRows(settingsState, source);
    return rerenderSettings();
}

const COMMANDS = ['add', 'remove', 'edit', 'folder-add', 'folder-rename', 'folder-remove', 'folder-toggle', 'folder-move'];

export async function handleTtsVoiceLibraryAction(action, { settingsState, dialogs, persistSettingsDraft, rerenderSettings, isCurrent = () => true }) {
    const [commandText, source, ...parts] = action.split(':');
    const command = commandText.replace(/^tts-voice-/, '');
    if (!commandText.startsWith('tts-voice-') || !(COMMANDS.includes(command) || BULK.includes(command))) return null;
    if (source !== 'api' && source !== 'narratorApi') return { ok: false, error: '未知的声音库' };
    if (BULK.includes(command)) return handleBulk(command, source, parts, { settingsState, dialogs, persistSettingsDraft, rerenderSettings, isCurrent });
    let change, folderParams;
    if (command === 'add') {
        const id = String(await dialogs.prompt('声音 ID（接口里的声音名、音色 ID 或参考音频）：', '') || '').trim();
        if (!id) return rerenderSettings();
        const title = String(await dialogs.prompt('显示名称（可留空）：', '') || '').trim();
        change = { id, title };
    } else if (command === 'folder-add' || command === 'folder-rename') {
        const name = command === 'folder-add' ? '' : decode(parts[0]);
        const to = String(await dialogs.prompt(name ? `重命名文件夹「${name}」为：` : '新文件夹名称：', name) || '').trim().slice(0, 40);
        if (!to || to === name) return rerenderSettings();
        folderParams = command === 'folder-add' ? { name: to } : { name, to };
    } else if (command === 'folder-remove') {
        const name = decode(parts[0]);
        if (!await dialogs.confirm(`删除文件夹「${name}」？里面的声音会移回未分类，不会被删除。`)) return rerenderSettings();
        folderParams = { name };
    } else if (command === 'folder-toggle') folderParams = { name: decode(parts[0]) };
    else if (command === 'folder-move') folderParams = { item: decode(parts[0]), to: decode(parts[1]) };
    else if (command === 'remove') change = { index: Number(parts[0]), remove: true };
    else {
        const part = parts[1];
        if (!['title', 'id', 'language'].includes(part)) return { ok: false, error: '未知的声音字段' };
        change = { index: Number(parts[0]), [part]: decode(parts[2]) };
    }
    if (!isCurrent()) return { ok: false, reason: 'settings-not-open' };
    const reader = settingsState.draft.readerSettings || (settingsState.draft.readerSettings = {});
    const tts = normalizeTtsSettings(reader.tts);
    const api = tts[source];
    const entries = ttsVoiceEntries(api.voices);
    let library = api.voiceLibrary, voices = api.voices;
    const fail = async error => { await dialogs.alert(error); return rerenderSettings(); };
    if (folderParams) {
        if (command === 'folder-add' && library.folders.folders.includes(folderParams.name)) return fail(`文件夹「${folderParams.name}」已存在`);
        if (command === 'folder-rename' && library.folders.folders.includes(folderParams.to)) return fail(`文件夹「${folderParams.to}」已存在`);
        if (command === 'folder-move' && !entries.some(([id]) => id === folderParams.item)) return { ok: false, error: '声音已不存在' };
        library = editTtsVoiceLibrary(library, command.slice(7), folderParams);
    } else if (change.language !== undefined) {
        const id = entries[change.index]?.[0];
        if (!id || !TTS_VOICE_LANGUAGES.some(([code]) => code === change.language)) return { ok: false, error: '无效的声音或语言' };
        library = editTtsVoiceLibrary(library, 'language', { item: id, language: change.language });
    } else {
        const result = editTtsVoices(voices, change);
        if (!result.ok) return fail(result.error);
        const oldId = entries[change.index]?.[0];
        if (oldId && change.id && oldId !== change.id.trim()) library = renameTtsVoiceLibraryItem(library, oldId, change.id.trim());
        voices = result.text;
    }
    library = normalizeTtsVoiceLibrary(library, ttsVoiceEntries(voices).map(([id]) => id));
    const before = reader.tts;
    reader.tts = { ...tts, [source]: { ...api, voices, voiceLibrary: library } };
    const persisted = persistSettingsDraft();
    if (persisted.ok === false) { reader.tts = before; return persisted; }
    if (command === 'remove') collapseRows(settingsState, source);
    return rerenderSettings();
}
