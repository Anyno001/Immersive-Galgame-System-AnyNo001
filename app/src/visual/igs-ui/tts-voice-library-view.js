import { esc } from './reader-value-utils.js';
import { renderAssetFolderSelect, renderAssetFolderView } from './asset-folder-view.js';
import { perfItem } from './fx-settings-fields.js';
import { TTS_VOICE_MAX, ttsVoiceEntries } from './tts.js';
import { normalizeTtsVoiceLibrary, TTS_VOICE_LANGUAGES } from './tts-voice-library.js';
import { renderTtsVoiceSearch } from './tts-voice-search.js';

// 声音达到这个数量才显示搜索框。
const SEARCH_FROM = 8;
const LANGUAGE_LABEL = new Map(TTS_VOICE_LANGUAGES);

// isOpen(key)：某一行是否展开（键为 perf-tts-voice-<source>-<index>）；select：多选模式下已勾选的声音 ID 集合，不在多选模式为 null。
export function renderTtsVoiceLibrary(source, api, { fetchable = false, message = '', batch = null, isOpen = () => false, select = null } = {}) {
    const entries = ttsVoiceEntries(api.voices);
    const indexes = new Map(entries.map(([id], index) => [id, index]));
    const library = normalizeTtsVoiceLibrary(api.voiceLibrary, [...indexes.keys()]);
    const picked = select instanceof Set ? select : null;
    const more = { isOpen: key => Boolean(isOpen(`perf-${key}`)) };
    const renderList = group => '<div class="igs-tts-voice-list">' + Object.entries(group).map(([id, title]) => {
        const index = indexes.get(id);
        const language = library.languages[id] || '';
        const languageLabel = language ? LANGUAGE_LABEL.get(language) || '' : '';
        const text = (title ? `${title}（${id}）` : id) + (languageLabel ? ` · ${languageLabel}` : '');
        if (picked) {
            const on = picked.has(id);
            return `<button type="button" class="igs-table-pick${on ? ' is-on' : ''}" data-tts-voice-row="${esc(text)}" data-action="tts-voice-pick:${source}:${encodeURIComponent(id)}" aria-pressed="${on ? 'true' : 'false'}"><i></i><span>${esc(text)}</span></button>`;
        }
        const languages = TTS_VOICE_LANGUAGES.map(([code, label]) => `<option value="${code}"${code === language ? ' selected' : ''}>${label}</option>`).join('');
        const detail = `<div class="igs-tts-voice-item">`
            + `<input class="igs-asset-move" type="text" data-tts-voice="${source}" data-voice-index="${index}" data-voice-part="title" value="${esc(title)}" placeholder="名称" aria-label="声音名称">`
            + `<input class="igs-asset-move" type="text" data-tts-voice="${source}" data-voice-index="${index}" data-voice-part="id" value="${esc(id)}" placeholder="声音 ID" aria-label="声音 ID">`
            + `<select class="igs-asset-move igs-tts-voice-language" data-tts-voice="${source}" data-voice-index="${index}" data-voice-part="language" aria-label="声音语言">${languages}</select>`
            + `<span class="igs-tts-voice-tools">${renderAssetFolderSelect(source, id, library.folders, { moveAttribute: 'data-tts-folder-move' })}`
            + `<button type="button" class="igs-btn-mgr-icon" data-action="tts-voice-remove:${source}:${index}" title="删除" aria-label="删除这个声音">×</button></span></div>`;
        return `<div data-tts-voice-row="${esc(text)}">`
            + perfItem(more, `tts-voice-${source}-${index}`, `<span class="igs-image-prompt-row-name">${esc(title || id)}</span>`, { hint: languageLabel, detail }) + '</div>';
    }).join('') + '</div>';
    const rows = renderAssetFolderView(source, Object.fromEntries(entries), {
        kindState: library.folders, actionPrefix: 'tts-voice', allowGrid: false, allowEmpty: true, emptyText: entries.length ? '文件夹为空' : '暂无声音',
        lead: `<span>声音库<small class="igs-switch-note">${entries.length} / ${TTS_VOICE_MAX}</small></span>`, renderList,
    });
    const list = entries.length >= SEARCH_FROM ? renderTtsVoiceSearch(`lib:${source}`, rows, { kind: 'lib', label: '声音库' }) : rows;
    const bulk = (verb, label, { danger = false, always = false } = {}) => `<button type="button" class="igs-settings-action${danger ? ' is-danger' : ''}" data-action="tts-voice-${verb}:${source}"${always || picked.size ? '' : ' disabled'}>${label}</button>`;
    const selectBar = picked ? `<div class="igs-asset-select-bar igs-tts-voice-select-bar"><span>已选 ${picked.size} 项</span>`
        + bulk('pick-all', picked.size === entries.length ? '全不选' : '全选', { always: true })
        + bulk('bulk-move', '移到文件夹') + bulk('bulk-language', '设置语言') + bulk('bulk-delete', '删除', { danger: true }) + '</div>' : '';
    const full = entries.length >= TTS_VOICE_MAX ? ' disabled' : '';
    const action = (name, label, attrs = '') => `<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="${name}"${attrs}>${label}</button>`;
    const actions = action(`tts-voice-add:${source}`, '添加声音', full) + action(`tts-voice-batch:${source}`, '批量识别', full)
        + (fetchable ? action(source === 'api' ? 'tts-fetch-voices' : 'tts-fetch-voices-narrator', '获取音色列表') : '')
        + (picked || entries.length > 1 ? action(`tts-voice-select:${source}`, picked ? '完成' : '多选') : '');
    const batchBox = batch?.open
        ? `<textarea data-tts-batch="${source}" aria-label="批量识别声音" placeholder="每行一个声音：名称 ID、名称：ID、Fish 网址，或 JSON 列表">${esc(batch.text || '')}</textarea>`
            + `<div class="igs-tts-voice-actions"><button type="button" class="igs-settings-action igs-settings-inline-action" data-action="tts-voice-batch-run:${source}">识别并加入</button><button type="button" class="igs-settings-action igs-settings-inline-action" data-action="tts-voice-batch-cancel:${source}">取消</button></div>` : '';
    return `<div class="igs-settings-field igs-tts-voice-lib">${selectBar}${list}<div class="igs-tts-voice-actions">${actions}</div>${batchBox}`
        + (message ? `<div class="igs-source-filter-note">${esc(message)}</div>` : '') + '</div>';
}
