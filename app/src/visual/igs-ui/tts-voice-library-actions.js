import { editTtsVoices, normalizeTtsSettings, ttsVoiceEntries } from './tts.js';
import { editTtsVoiceLibrary, normalizeTtsVoiceLibrary, renameTtsVoiceLibraryItem, TTS_VOICE_LANGUAGES } from './tts-voice-library.js';

const decode = value => { try { return decodeURIComponent(value || ''); } catch { return String(value || ''); } };
const COMMANDS = ['add', 'remove', 'edit', 'folder-add', 'folder-rename', 'folder-remove', 'folder-toggle', 'folder-move'];

export async function handleTtsVoiceLibraryAction(action, { settingsState, dialogs, persistSettingsDraft, rerenderSettings, isCurrent = () => true }) {
    const [commandText, source, ...parts] = action.split(':');
    const command = commandText.replace(/^tts-voice-/, '');
    if (!commandText.startsWith('tts-voice-') || !COMMANDS.includes(command)) return null;
    if (source !== 'api' && source !== 'narratorApi') return { ok: false, error: '未知的声音库' };
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
    return rerenderSettings();
}
