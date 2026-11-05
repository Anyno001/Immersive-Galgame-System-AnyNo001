import { esc } from './reader-value-utils.js';
import { renderAssetFolderSelect, renderAssetFolderView } from './asset-folder-view.js';
import { TTS_VOICE_MAX, ttsVoiceEntries } from './tts.js';
import { normalizeTtsVoiceLibrary, TTS_VOICE_LANGUAGES } from './tts-voice-library.js';

export function renderTtsVoiceLibrary(source, api, { fetchable = false, message = '', batch = null } = {}) {
    const entries = ttsVoiceEntries(api.voices);
    const indexes = new Map(entries.map(([id], index) => [id, index]));
    const library = normalizeTtsVoiceLibrary(api.voiceLibrary, [...indexes.keys()]);
    const renderList = group => '<div class="igs-tts-voice-list">' + Object.entries(group).map(([id, title]) => {
        const index = indexes.get(id);
        const language = library.languages[id] || '';
        const languages = TTS_VOICE_LANGUAGES.map(([code, label]) => `<option value="${code}"${code === language ? ' selected' : ''}>${label}</option>`).join('');
        return `<div class="igs-tts-voice-item">`
            + `<input class="igs-asset-move" type="text" data-tts-voice="${source}" data-voice-index="${index}" data-voice-part="title" value="${esc(title)}" placeholder="名称" aria-label="声音名称">`
            + `<input class="igs-asset-move" type="text" data-tts-voice="${source}" data-voice-index="${index}" data-voice-part="id" value="${esc(id)}" placeholder="声音 ID" aria-label="声音 ID">`
            + `<select class="igs-asset-move igs-tts-voice-language" data-tts-voice="${source}" data-voice-index="${index}" data-voice-part="language" aria-label="声音语言">${languages}</select>`
            + `<span class="igs-tts-voice-tools">${renderAssetFolderSelect(source, id, library.folders, { moveAttribute: 'data-tts-folder-move' })}`
            + `<button type="button" class="igs-btn-mgr-icon" data-action="tts-voice-remove:${source}:${index}" title="删除" aria-label="删除这个声音">×</button></span></div>`;
    }).join('') + '</div>';
    const rows = renderAssetFolderView(source, Object.fromEntries(entries), {
        kindState: library.folders, actionPrefix: 'tts-voice', allowGrid: false, allowEmpty: true, emptyText: entries.length ? '文件夹为空' : '暂无声音',
        lead: `<span>声音库<small class="igs-switch-note">${entries.length} / ${TTS_VOICE_MAX}</small></span>`, renderList,
    });
    const actions = `<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="tts-voice-add:${source}"${entries.length >= TTS_VOICE_MAX ? ' disabled' : ''}>添加声音</button>`
        + `<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="tts-voice-batch:${source}"${entries.length >= TTS_VOICE_MAX ? ' disabled' : ''}>批量识别</button>`
        + (fetchable ? `<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="${source === 'api' ? 'tts-fetch-voices' : 'tts-fetch-voices-narrator'}">获取音色列表</button>` : '');
    const batchBox = batch?.open
        ? `<textarea data-tts-batch="${source}" aria-label="批量识别声音" placeholder="每行一个声音：名称 ID、名称：ID、Fish 网址，或 JSON 列表">${esc(batch.text || '')}</textarea>`
            + `<div class="igs-tts-voice-actions"><button type="button" class="igs-settings-action igs-settings-inline-action" data-action="tts-voice-batch-run:${source}">识别并加入</button><button type="button" class="igs-settings-action igs-settings-inline-action" data-action="tts-voice-batch-cancel:${source}">取消</button></div>` : '';
    return `<div class="igs-settings-field igs-tts-voice-lib">${rows}<div class="igs-tts-voice-actions">${actions}</div>${batchBox}`
        + (message ? `<div class="igs-source-filter-note">${esc(message)}</div>` : '') + '</div>';
}
