import { esc } from './reader-value-utils.js';
import { TOOLBAR_ACTIONS } from './reader-host-constants.js';

const encSeg = (value) => encodeURIComponent(String(value == null ? '' : value));

export function renderTemplate(template, values) {
    return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : '';
    });
}

export function field(path, label, inputHtml, note) {
    return `<label class="igs-settings-field"><span>${esc(label)}</span>${inputHtml}${note ? `<em>${esc(note)}</em>` : ''}</label>`;
}

export function disabledAttr(disabled) {
    return disabled ? ' disabled aria-disabled="true"' : '';
}

export function textInput(path, value, placeholder, type = 'text', disabled = false) {
    return `<input data-path="${esc(path)}" type="${esc(type)}" value="${esc(value || '')}" placeholder="${esc(placeholder || '')}"${disabledAttr(disabled)}>`;
}

export function colorInput(path, value, disabled = false) {
    return `<input data-path="${esc(path)}" type="color" value="${esc(value || '#ffffff')}"${disabledAttr(disabled)}>`;
}

export function textareaInput(path, value, placeholder = '') {
    return `<textarea data-path="${esc(path)}" placeholder="${esc(placeholder)}">${esc(value || '')}</textarea>`;
}

export function secretInput(path, value, placeholder, disabled) {
    return `<div class="igs-settings-secret">${textInput(path, value, placeholder, 'password', disabled)}<button type="button" class="igs-settings-secret-toggle" data-action="toggle-secret" aria-label="显示或隐藏密钥" aria-pressed="false"${disabledAttr(disabled)}>显示</button></div>`;
}

export function numberInput(path, value, min, max, disabled) {
    return `<input data-path="${esc(path)}" type="number" min="${esc(min)}" max="${esc(max)}" value="${esc(value)}"${disabledAttr(disabled)}>`;
}

export function checkbox(path, value, label) {
    return `<button type="button" class="igs-switch${value ? ' is-on' : ''}" data-switch="${esc(path)}" aria-pressed="${value ? 'true' : 'false'}"><i></i><span>${esc(label)}</span></button>`;
}

export function selectInput(path, value, items, disabled = false) {
    const options = items.map(([itemValue, itemLabel]) => {
        const selected = String(itemValue) === String(value) ? ' selected' : '';
        return `<option value="${esc(itemValue)}"${selected}>${esc(itemLabel)}</option>`;
    }).join('');
    return `<select data-path="${esc(path)}"${disabled ? ' disabled' : ''}>${options}</select>`;
}

export function segmentedInput(path, value, items, label) {
    const activeIndex = Math.max(0, items.findIndex((item) => String(item[0]) === String(value)));
    return `<div class="igs-segmented" role="radiogroup" aria-label="${esc(label || '')}" data-count="${esc(items.length)}" data-active-index="${esc(activeIndex)}" style="--igs-segment-count:${esc(items.length)};--igs-active-index:${esc(activeIndex)};"><span class="igs-segmented-indicator" aria-hidden="true"></span>${items.map((item) => {
        const selected = String(item[0]) === String(value);
        const icon = item[2] ? `<span class="igs-segmented-btn-icon" aria-hidden="true">${item[2]}</span>` : '';
        return `<button type="button" class="igs-segmented-btn${item[2] ? ' has-icon' : ''}${selected ? ' is-active' : ''}" data-segment-path="${esc(path)}" data-segment-value="${esc(item[0])}" role="radio" aria-checked="${selected ? 'true' : 'false'}" aria-pressed="${selected ? 'true' : 'false'}">${icon}<span class="igs-segmented-btn-label">${esc(item[1])}</span></button>`;
    }).join('')}</div>`;
}

export function modelPicker(path, value, models, action, placeholder, disabled) {
    const items = Array.isArray(models) ? models.filter(Boolean) : [];
    const options = ['<option value="">从已拉取模型中选择</option>'].concat(items.map((model) => {
        const selected = model === value ? ' selected' : '';
        return `<option value="${esc(model)}"${selected}>${esc(model)}</option>`;
    })).join('');
    return `<div class="igs-settings-model"><div class="igs-settings-model-row"><input data-path="${esc(path)}" value="${esc(value || '')}" placeholder="${esc(placeholder || '')}"${disabledAttr(disabled)}><button type="button" class="igs-settings-action igs-settings-inline-action" data-action="${esc(action)}"${disabledAttr(disabled)}>拉取模型</button></div><select data-model-sync="${esc(path)}"${items.length && !disabled ? '' : ' disabled'}>${options}</select></div>`;
}

export function renderSceneAssetList(scenes, options = {}) {
    const expandedSlots = options.expandedSlots instanceof Set ? options.expandedSlots : new Set();
    const timeGroups = Array.isArray(options.timeGroups) ? options.timeGroups : [];
    const weatherGroups = Array.isArray(options.weatherGroups) ? options.weatherGroups : [];
    const pencil = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const trash = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    const chevronDown = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    const chevronUp = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
    const entries = Object.entries(scenes || {});
    if (!entries.length) return '<div class="igs-scene-empty">暂无背景图配置</div>';
    return entries.map(([sceneName, sceneVal]) => {
        const sceneObj = typeof sceneVal === 'string' ? { url: sceneVal, times: {} } : (sceneVal || { url: '', times: {} });
        const sceneWords = Array.isArray(sceneObj.words) ? sceneObj.words : [];
        const bgExpanded = expandedSlots.has('bg\x00' + sceneName);
        const badge = (text) => `<span style="font-size:10px;opacity:.5;flex-shrink:0;margin-right:2px">${text}</span>`;
        const timeEntries = Object.entries(sceneObj.times || {});
        const timeRows = timeEntries.map(([timeName, timeVal]) => {
            const timeObj = typeof timeVal === 'string' ? { url: timeVal, weathers: {} } : (timeVal || { url: '', weathers: {} });
            const timeExpanded = expandedSlots.has('time\x00' + sceneName + '\x00' + timeName);
            const weatherEntries = Object.entries(timeObj.weathers || {});
            const weatherRows = weatherEntries.map(([weatherName, weatherVal]) => {
                const weatherObj = typeof weatherVal === 'string' ? { url: weatherVal } : (weatherVal || { url: '' });
                const wExpanded = expandedSlots.has('weather\x00' + sceneName + '\x00' + timeName + '\x00' + weatherName);
                const wBody = wExpanded ? renderSceneGroupExpansion('weather', weatherName, weatherObj.url || '', weatherGroups) : '';
                return `<div class="igs-sprite-slot"><div class="igs-btn-mgr-row igs-scene-mood-row" style="margin-left:32px">`
                    + badge('天气')
                    + `<span class="igs-btn-mgr-label">${esc(weatherName)}</span>`
                    + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-rename-weather:${encSeg(sceneName)}:${encSeg(timeName)}:${encSeg(weatherName)}" title="重命名">${pencil}</button>`
                    + `<input class="igs-scene-url-input" data-scene-weather-bg="${esc(sceneName)}" data-scene-time="${esc(timeName)}" data-scene-weather="${esc(weatherName)}" value="${esc(weatherObj.url || '')}" placeholder="URL 或 data:image/...">`
                    + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-remove-weather:${encSeg(sceneName)}:${encSeg(timeName)}:${encSeg(weatherName)}" title="删除">${trash}</button>`
                    + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-toggle-weather:${encSeg(sceneName)}:${encSeg(timeName)}:${encSeg(weatherName)}" title="展开/折叠">${wExpanded ? chevronUp : chevronDown}</button>`
                    + `</div>${wBody}</div>`;
            }).join('');
            const timeBody = timeExpanded ? renderSceneGroupExpansion('time', timeName, timeObj.url || '', timeGroups) : '';
            return `<div class="igs-scene-char-group" style="margin-left:16px"><div class="igs-sprite-slot"><div class="igs-btn-mgr-row">`
                + badge('时间')
                + `<span class="igs-btn-mgr-label">${esc(timeName)}</span>`
                + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-rename-time:${encSeg(sceneName)}:${encSeg(timeName)}" title="重命名">${pencil}</button>`
                + `<input class="igs-scene-url-input" data-scene-time-bg="${esc(sceneName)}" data-scene-time="${esc(timeName)}" value="${esc(timeObj.url || '')}" placeholder="URL 或 data:image/...">`
                + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-add-weather:${encSeg(sceneName)}:${encSeg(timeName)}" title="添加天气">+</button>`
                + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-remove-time:${encSeg(sceneName)}:${encSeg(timeName)}" title="删除">${trash}</button>`
                + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-toggle-time:${encSeg(sceneName)}:${encSeg(timeName)}" title="展开/折叠">${timeExpanded ? chevronUp : chevronDown}</button>`
                + `</div>${timeBody}</div>${weatherRows}</div>`;
        }).join('');
        const bgBody = bgExpanded ? renderSceneBgExpansion(sceneName, sceneObj.url || '', sceneWords) : '';
        return `<div class="igs-scene-char-group"><div class="igs-sprite-slot"><div class="igs-btn-mgr-row">`
            + badge('场景')
            + `<span class="igs-btn-mgr-label" style="font-weight:600">${esc(sceneName)}</span>`
            + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-rename-bg:${encSeg(sceneName)}" title="重命名">${pencil}</button>`
            + `<input class="igs-scene-url-input" data-scene-bg="${esc(sceneName)}" value="${esc(sceneObj.url || '')}" placeholder="URL 或 data:image/...">`
            + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-add-time:${encSeg(sceneName)}" title="添加时间">+</button>`
            + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-remove-bg:${encSeg(sceneName)}" title="删除场景">${trash}</button>`
            + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-toggle-bg:${encSeg(sceneName)}" title="展开/折叠">${bgExpanded ? chevronUp : chevronDown}</button>`
            + `</div>${bgBody}</div>${timeRows}</div>`;
    }).join('');
}

function renderSceneBgExpansion(sceneName, url, words) {
    const trimmedUrl = String(url || '').trim();
    const thumb = trimmedUrl
        ? `<img class="igs-sprite-thumb" src="${esc(trimmedUrl)}" loading="lazy" alt="" data-action="sprite-preview:${encSeg(trimmedUrl)}" onerror="this.classList.add('igs-sprite-thumb-broken')">`
        : `<div class="igs-sprite-thumb igs-sprite-thumb-empty">未配置</div>`;
    const tags = words.map((w) =>
        `<span class="igs-mood-word-tag">${esc(w)}<button type="button" class="igs-mood-word-del" data-action="scene-remove-bg-word:${encSeg(sceneName)}:${encSeg(w)}" title="删除词">×</button></span>`
    ).join('');
    const wHtml = `<div class="igs-sprite-words"><div class="igs-mood-word-list">${tags || '<div class="igs-scene-empty">暂无词</div>'}<button type="button" class="igs-btn-mgr-icon" data-action="scene-add-bg-word:${encSeg(sceneName)}" title="添加词">+</button></div></div>`;
    return `<div class="igs-sprite-slot-body">${thumb}${wHtml}</div>`;
}

function renderSceneGroupExpansion(type, label, url, groups) {
    const trimmedUrl = String(url || '').trim();
    const thumb = trimmedUrl
        ? `<img class="igs-sprite-thumb" src="${esc(trimmedUrl)}" loading="lazy" alt="" data-action="sprite-preview:${encSeg(trimmedUrl)}" onerror="this.classList.add('igs-sprite-thumb-broken')">`
        : `<div class="igs-sprite-thumb igs-sprite-thumb-empty">未配置</div>`;
    const isTime = type === 'time';
    const addAction = isTime ? `time-add-word:${encSeg(label)}` : `weather-add-word:${encSeg(label)}`;
    const removePrefix = isTime ? `time-remove-word:${encSeg(label)}` : `weather-remove-word:${encSeg(label)}`;
    const createAction = isTime ? `time-create-group:${encSeg(label)}` : `weather-create-group:${encSeg(label)}`;
    const typeName = isTime ? '时间' : '天气';
    const group = groups.find((g) => g && g.label === label);
    let wHtml;
    if (group) {
        const words = Array.isArray(group.words) ? group.words : [];
        const tags = words.map((w) =>
            `<span class="igs-mood-word-tag">${esc(w)}<button type="button" class="igs-mood-word-del" data-action="${removePrefix}:${encSeg(w)}" title="删除词">×</button></span>`
        ).join('');
        wHtml = `<div class="igs-sprite-words"><div class="igs-mood-word-list">${tags || '<div class="igs-scene-empty">暂无词</div>'}<button type="button" class="igs-btn-mgr-icon" data-action="${addAction}" title="添加词">+</button></div></div>`;
    } else {
        wHtml = `<div class="igs-sprite-words"><div class="igs-source-filter-note">「${esc(label)}」在${typeName}词库中无对应组。</div><button type="button" class="igs-settings-action" data-action="${createAction}">建为${typeName}组</button></div>`;
    }
    return `<div class="igs-sprite-slot-body">${thumb}${wHtml}</div>`;
}

export function renderCharacterAssetList(characters, options = {}) {
    const moodGroups = Array.isArray(options.moodGroups) ? options.moodGroups : [];
    const expandedSlots = options.expandedSlots instanceof Set ? options.expandedSlots : new Set();
    const pencil = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const trash = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    const chevronDown = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    const chevronUp = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
    const charEntries = Object.entries(characters || {});
    if (!charEntries.length) return '<div class="igs-scene-empty">暂无角色立绘配置</div>';
    return charEntries.map(([charName, moods]) => {
        const moodEntries = Object.entries(moods || {});
        const moodRows = moodEntries.map(([mood, url]) => {
            const expanded = expandedSlots.has(charName + "\x00" + mood);
            const collapsedRow = `<div class="igs-btn-mgr-row igs-scene-mood-row">`
                + `<span class="igs-btn-mgr-label">${esc(mood)}</span>`
                + `<input class="igs-scene-url-input" data-scene-char="${esc(charName)}" data-scene-mood="${esc(mood)}" value="${esc(url || '')}" placeholder="URL 或 data:image/...">`
                + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-rename-mood:${encSeg(charName)}:${encSeg(mood)}" title="重命名">${pencil}</button>`
                + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-remove-mood:${encSeg(charName)}:${encSeg(mood)}" title="删除">${trash}</button>`
                + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-toggle-mood:${encSeg(charName)}:${encSeg(mood)}" title="展开/折叠">${expanded ? chevronUp : chevronDown}</button>`
                + `</div>`;
            const expandedBody = expanded ? renderSpriteSlotExpansion(charName, mood, url, moodGroups, { pencil, trash }) : '';
            return `<div class="igs-sprite-slot">${collapsedRow}${expandedBody}</div>`;
        }).join('');
        return `<div class="igs-scene-char-group"><div class="igs-btn-mgr-row"><span class="igs-btn-mgr-label" style="font-weight:600">${esc(charName)}</span><button type="button" class="igs-btn-mgr-icon" data-action="scene-rename-char:${encSeg(charName)}" title="重命名">${pencil}</button><button type="button" class="igs-btn-mgr-icon" data-action="scene-add-mood:${encSeg(charName)}" title="添加情绪">+</button><button type="button" class="igs-btn-mgr-icon" data-action="scene-remove-char:${encSeg(charName)}" title="删除角色">${trash}</button></div><div class="igs-btn-mgr-list">${moodRows || '<div class="igs-scene-empty">暂无情绪</div>'}</div></div>`;
    }).join('');
}

function renderSpriteSlotExpansion(charName, mood, url, moodGroups, icons) {
    const trimmedUrl = String(url || '').trim();
    const thumb = trimmedUrl
        ? `<img class="igs-sprite-thumb" src="${esc(trimmedUrl)}" loading="lazy" alt="${esc(mood)}" data-action="sprite-preview:${encSeg(trimmedUrl)}" onerror="this.classList.add('igs-sprite-thumb-broken')">`
        : `<div class="igs-sprite-thumb igs-sprite-thumb-empty">未配置</div>`;
    const group = moodGroups.find((g) => g && g.label === mood);
    let wordsHtml;
    if (group) {
        const words = Array.isArray(group.words) ? group.words : [];
        const tags = words.map((word) => {
            return `<span class="igs-mood-word-tag">${esc(word)}<button type="button" class="igs-mood-word-del" data-action="mood-remove-word:${encSeg(mood)}:${encSeg(word)}" title="删除词">×</button></span>`;
        }).join('');
        wordsHtml = `<div class="igs-sprite-words"><div class="igs-mood-word-list">${tags || '<div class="igs-scene-empty">暂无情绪词</div>'}<button type="button" class="igs-btn-mgr-icon" data-action="mood-add-word:${encSeg(mood)}" title="添加词">+</button></div></div>`;
    } else {
        wordsHtml = `<div class="igs-sprite-words"><div class="igs-source-filter-note">「${esc(mood)}」在词库中无对应情绪组。</div><button type="button" class="igs-settings-action" data-action="mood-create-group:${encSeg(mood)}">建为情绪组</button></div>`;
    }
    return `<div class="igs-sprite-slot-body">${thumb}${wordsHtml}</div>`;
}


export function renderScenePresetBar(presets, selectedName) {
    const names = Object.keys(presets || {});
    const opts = ['<option value="">— 选择预设 —</option>'].concat(names.map((n) =>
        `<option value="${esc(n)}"${n === selectedName ? ' selected' : ''}>${esc(n)}</option>`
    )).join('');
    const dis = (!selectedName || !(presets && presets[selectedName])) ? ' disabled' : '';
    const pencil = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const trash = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    const save = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
    const download = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>';
    const upload = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>';
    return `<div class="igs-source-filter"><div style="display:flex;align-items:center;gap:6px"><select class="igs-scene-preset-select" data-preset-select style="flex:1;min-width:0">${opts}</select><button type="button" class="igs-btn-mgr-icon" data-action="scene-preset-save" title="保存当前配置为预设">${save}</button><button type="button" class="igs-btn-mgr-icon" data-action="scene-preset-rename"${dis} title="重命名">${pencil}</button><button type="button" class="igs-btn-mgr-icon" data-action="scene-preset-import" title="导入">${upload}</button><button type="button" class="igs-btn-mgr-icon" data-action="scene-preset-export"${dis} title="导出">${download}</button><button type="button" class="igs-btn-mgr-icon" data-action="scene-preset-delete"${dis} title="删除">${trash}</button></div></div>`;
}

export function renderPinnedButtons(pinnedValue, hiddenValue, orderValue) {
    const pins = Array.isArray(pinnedValue) ? pinnedValue : [];
    const hidden = Array.isArray(hiddenValue) ? hiddenValue : [];
    const canonical = TOOLBAR_ACTIONS.map(([id]) => id);
    const order = Array.isArray(orderValue) && orderValue.length ? orderValue : canonical;
    const labelMap = Object.fromEntries(TOOLBAR_ACTIONS);
    const eyeOn = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    const eyeOff = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    const pinIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l1.09 3.27L16 6l-2.18 2.18L14.55 12 12 10.18 9.45 12l.73-3.82L8 6l2.91-.73z"/><line x1="12" y1="12" x2="12" y2="22"/></svg>';
    const rows = order.map((id) => {
        const label = labelMap[id] || id;
        const isHidden = hidden.includes(id);
        const isPinned = pins.includes(id) && !isHidden;
        const canHide = id !== 'settings';
        const eyeBtn = canHide
            ? `<button type="button" class="igs-btn-mgr-icon${isHidden ? '' : ' is-on'}" data-action="toolbar-toggle-visible:${esc(id)}" title="显示/隐藏">${isHidden ? eyeOff : eyeOn}</button>`
            : `<span class="igs-btn-mgr-icon" title="此按钮不可隐藏" style="opacity:.3;cursor:default">${eyeOn}</span>`;
        return `<div class="igs-btn-mgr-row${isHidden ? ' is-hidden-btn' : ''}"><span class="igs-btn-mgr-handle" data-action="toolbar-move-up:${esc(id)}">☰</span><span class="igs-btn-mgr-label">${esc(label)}</span>${eyeBtn}<button type="button" class="igs-btn-mgr-icon${isPinned ? ' is-on' : ''}" data-action="toggle-toolbar-pin:${esc(id)}" title="常驻">${pinIcon}</button></div>`;
    }).join('');
    return `<div class="igs-settings-field"><span>按钮管理</span><div class="igs-btn-mgr-list">${rows}</div><em>☰ 上移排序 · 眼睛切换显隐 · 星切换常驻。隐藏的按钮自动解除常驻。</em></div>`;
}
