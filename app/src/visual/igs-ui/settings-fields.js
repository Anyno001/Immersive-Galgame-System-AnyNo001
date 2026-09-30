import { esc } from './reader-value-utils.js';
import { TOOLBAR_ACTIONS } from './reader-host-constants.js';
import { STAGE_SHAKE_INTENSITIES } from './stage-shake-runtime.js';
import { CHAT_SHOW_DIM_LEVELS, CHAT_SHOW_PROMPT_RULE } from './chat-show-runtime.js';
import { CHAT_SFX_PRESET_LABELS } from './chat-sfx.js';
import { renderCharacterSlotTabs } from './settings-outfit-fields.js';


const encSeg = (value) => encodeURIComponent(String(value == null ? '' : value));

const STATUS_AVATAR_PLACEHOLDER_SVG = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="3.4"/><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/></svg>';
const STATUS_AVATAR_UPLOAD_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>';

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

export function hiddenAttr(hidden) {
    return hidden ? ' hidden' : '';
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

export function numberInput(path, value, min, max, disabled, step) {
    return `<input data-path="${esc(path)}" type="number" min="${esc(min)}" max="${esc(max)}"${step == null ? '' : ` step="${esc(step)}"`} value="${esc(value)}"${disabledAttr(disabled)}>`;
}

export function rangeInput(path, value, label = '音量') {
    const percent = Math.round(Number(value) * 100);
    return `<span class="igs-settings-range"><input data-path="${esc(path)}" type="range" min="0" max="1" step="0.05" value="${esc(value)}" aria-label="${esc(label)}"><output data-range-value="${esc(path)}">${esc(percent)}%</output></span>`;
}

export function checkbox(path, value, label) {
    return `<button type="button" class="igs-switch${value ? ' is-on' : ''}" data-switch="${esc(path)}" aria-pressed="${value ? 'true' : 'false'}"><i></i><span>${esc(label)}</span></button>`;
}

export function tableMultiSelect(paths, selected, catalog, options = {}) {
    const picked = Array.isArray(selected) ? selected : [];
    const normalize = (value) => String(value == null ? '' : value).trim();
    const isPicked = (uid, name) => picked.some((item) => (uid && normalize(item.uid) === normalize(uid))
        || (!uid && name && normalize(item.name) === normalize(name)));
    const rows = [];
    for (const table of Array.isArray(catalog) ? catalog : []) {
        const uid = normalize(table && table.uid);
        const name = normalize(table && table.name) || uid;
        if (!uid && !name) continue;
        const on = isPicked(uid, name);
        const action = `status-hud-toggle-table:${encSeg(uid)}:${encSeg(name)}`;
        rows.push(`<button type="button" class="igs-table-pick${on ? ' is-on' : ''}" data-action="${esc(action)}" data-table-uid="${esc(uid)}" data-table-name="${esc(name)}" aria-pressed="${on ? 'true' : 'false'}"><i></i><span>${esc(name)}</span></button>`);
    }
    for (const item of picked) {
        const uid = normalize(item.uid);
        const name = normalize(item.name) || uid;
        const exists = (Array.isArray(catalog) ? catalog : []).some((table) => (uid && normalize(table && table.uid) === uid)
            || (!uid && name && normalize(table && table.name) === name));
        if (!exists) {
            const action = `status-hud-toggle-table:${encSeg(uid)}:${encSeg(name)}`;
            rows.push(`<button type="button" class="igs-table-pick is-on is-missing" data-action="${esc(action)}" data-table-uid="${esc(uid)}" data-table-name="${esc(name)}" aria-pressed="true"><i></i><span>${esc(name)}（未找到）</span></button>`);
        }
    }
    const empty = options.emptyText || '未检测到可读表格';
    const note = options.note ? `<em>${esc(options.note)}</em>` : '';
    return `<div class="igs-status-hud-tables" data-status-hud-tables data-path="${esc(paths)}">${rows.join('') || `<div class="igs-scene-empty">${esc(empty)}</div>`}${note}</div>`;
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

export function renderStageShakeSettings(settings) {
    const source = settings && typeof settings === 'object' ? settings : {};
    const emotions = Array.isArray(source.emotions) ? source.emotions : [];
    const intensity = STAGE_SHAKE_INTENSITIES.includes(source.intensity) ? source.intensity : 'medium';
    const intensityField = field('readerSettings.stageShake.intensity', '震动强度', segmentedInput(
        'readerSettings.stageShake.intensity',
        intensity,
        [['weak', '弱'], ['medium', '中'], ['strong', '强']],
        '震动强度',
    ));
    const tags = emotions.map((emotion) => `<span class="igs-mood-word-tag">${esc(emotion)}<button type="button" class="igs-mood-word-del" data-action="stage-shake-remove-emotion:${encSeg(emotion)}" title="删除触发情绪">×</button></span>`).join('');
    return `<div class="igs-settings-sub igs-stage-shake-settings">${intensityField}<div class="igs-settings-field"><span>触发情绪</span><div class="igs-mood-word-list">${tags || '<div class="igs-scene-empty">暂无触发情绪</div>'}<button type="button" class="igs-btn-mgr-icon" data-action="stage-shake-add-emotion" title="添加触发情绪">+</button></div></div></div>`;
}

export function renderChatShowSettings(settings, options = {}) {
    const s = settings;
    const p = 'readerSettings.chatShow';
    const segment = (key, label, items) => field(`${p}.${key}`, label, segmentedInput(`${p}.${key}`, s[key], items, label));
    const dimItems = CHAT_SHOW_DIM_LEVELS.includes(s.dim) ? CHAT_SHOW_DIM_LEVELS : CHAT_SHOW_DIM_LEVELS.concat(s.dim).sort((a, b) => a - b);
    const grid = [
        '<div class="igs-source-filter-grid">',
        segment('frame', '聊天外框', [['phone', '手机框'], ['none', '无框']]),
        segment('revealMode', '冒泡节奏', [['click', '点击逐条'], ['auto', '自动连发']]),
        s.revealMode === 'auto' ? segment('autoSpeed', '连发速度', [['fast', '快'], ['medium', '中'], ['slow', '慢']]) : '',
        segment('returnMode', '返回看过的聊天页', [['full', '一次平铺'], ['replay', '逐条重播'], ['restart', '重新点击']]),
        field(`${p}.dim`, '背景压暗', selectInput(`${p}.dim`, s.dim, dimItems.map((n) => [n, `${Math.round(n * 100)}%`]))),
        field(`${p}.selfName`, '自己的名字', textInput(`${p}.selfName`, s.selfName, '留空使用 {{user}}')),
        segment('unknownSide', '未登记发送者', [['left', '左'], ['right', '右']]),
        s.followTheme ? '' : field(`${p}.defaultColors.left`, '对方气泡色', colorInput(`${p}.defaultColors.left`, s.defaultColors.left)),
        s.followTheme ? '' : field(`${p}.defaultColors.right`, '自己气泡色', colorInput(`${p}.defaultColors.right`, s.defaultColors.right)),
        '</div>',
    ].join('');
    const toggles = checkbox(`${p}.followTheme`, s.followTheme, '气泡跟随对话框主题')
        + checkbox(`${p}.showAvatars`, s.showAvatars, '显示头像')
        + (s.revealMode === 'auto' ? checkbox(`${p}.typingIndicator`, s.typingIndicator, '对方消息前显示「正在输入」') : '')
        + checkbox(`${p}.hideSprites`, s.hideSprites, '聊天时隐藏立绘')
        + checkbox(`${p}.sound.enabled`, s.sound.enabled, '启用收发音效')
        + (s.sound.enabled ? `<div class="igs-settings-sub">${field(`${p}.sound.preset`, '音色', selectInput(`${p}.sound.preset`, s.sound.preset, CHAT_SFX_PRESET_LABELS))}${field(`${p}.sound.volume`, '音效音量', rangeInput(`${p}.sound.volume`, s.sound.volume, '音效音量'))}<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="chat-show-preview-sound">试听</button></div>` : '');
    const contacts = Object.entries(s.contacts).map(([name, c]) => {
        const n = encSeg(name);
        const aliasTags = c.aliases.map((alias) => `<span class="igs-mood-word-tag">${esc(alias)}<button type="button" class="igs-mood-word-del" data-action="chat-show-remove-alias:${n}:${encSeg(alias)}" title="删除别名">×</button></span>`).join('');
        const side = segmentedInput(`${p}.contacts.${name}.side`, c.side, [['auto', '自动'], ['left', '固定左'], ['right', '固定右']], '气泡位置');
        return `<div class="igs-chat-contact"><div class="igs-chat-contact-head"><b>${esc(name)}</b>${colorInput(`${p}.contacts.${name}.color`, c.color || s.defaultColors.left)}${side}<button type="button" class="igs-mood-word-del" data-action="chat-show-remove-contact:${n}" title="删除联系人">×</button></div><div class="igs-mood-word-list"><span class="igs-chat-contact-label">别名</span>${aliasTags}<button type="button" class="igs-btn-mgr-icon" data-action="chat-show-add-alias:${n}" title="添加别名">+</button></div></div>`;
    }).join('');
    const contactList = `<div class="igs-settings-field"><span>联系人</span><div class="igs-chat-contacts">${contacts || '<div class="igs-scene-empty">暂无联系人</div>'}<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="chat-show-add-contact">添加联系人</button></div></div>`;
    const promptDraft = typeof options.promptDraft === 'string' ? options.promptDraft : (s.promptRule || CHAT_SHOW_PROMPT_RULE);
    const promptStatus = options.promptStatus || (s.promptRule ? '正在使用自定义提示词。' : '正在使用默认提示词。');
    const promptField = `<div class="igs-settings-field"><span>注入提示词（开启线上交流时追加给 AI）</span><textarea class="igs-chat-prompt" data-chat-prompt-draft="1" aria-label="线上交流注入提示词" placeholder="聊天标签规则...">${esc(promptDraft)}</textarea><div class="igs-chat-prompt-actions"><button type="button" class="igs-settings-action igs-settings-inline-action" data-action="chat-show-save-prompt">保存提示词</button><button type="button" class="igs-settings-action igs-settings-inline-action" data-action="chat-show-reset-prompt">恢复默认</button></div><div class="igs-settings-result" data-result="chat-prompt">${esc(promptStatus)}</div></div>`;
    return `<div class="igs-settings-sub igs-chat-show-settings">${grid}${toggles}${contactList}${promptField}</div>`;
}

export function renderSystemRoleSettings(settings, options = {}) {
    const s = settings;
    const p = 'readerSettings.systemRole';
    const disabled = options.disabled === true;
    const fontItems = [['', '跟随旁白']].concat((options.fontOptions || []).filter(([value]) => value !== 'inherit'));
    const tags = s.words.map((word) => `<span class="igs-mood-word-tag">${esc(word)}<button type="button" class="igs-mood-word-del" data-action="system-role-remove-word:${encSeg(word)}" title="删除">×</button></span>`).join('');
    const colorNote = s.color ? '<button type="button" class="igs-settings-action igs-settings-inline-action" data-action="system-role-follow-color">跟随旁白</button>' : '<em>跟随旁白</em>';
    return [
        '<div class="igs-settings-row">',
        field(`${p}.font`, '字体', selectInput(`${p}.font`, s.font, fontItems, disabled)),
        `<label class="igs-settings-field"><span>颜色</span>${colorInput(`${p}.color`, s.color || options.narrationColor, disabled)}${colorNote}</label>`,
        field(`${p}.align`, '对齐', selectInput(`${p}.align`, s.align, [['left', '左对齐'], ['center', '居中'], ['indent', '首行缩进']], disabled)),
        '</div>',
        checkbox(`${p}.showName`, s.showName, '显示角色名'),
        `<div class="igs-settings-field"><span>角色词池（这些发送者的台词用本样式；线上交流里显示为居中提示条；自动忽略【】等括号）</span><div class="igs-mood-word-list">${tags || '<div class="igs-scene-empty">暂无</div>'}<button type="button" class="igs-btn-mgr-icon" data-action="system-role-add-word" title="添加系统类角色">+</button></div></div>`,
    ].join('');
}

export function renderWeatherFxSettings(settings) {
    const source = settings && typeof settings === 'object' ? settings : {};
    const intensity = ['weak', 'medium', 'strong'].includes(source.intensity) ? source.intensity : 'medium';
    const intensityField = field('readerSettings.weatherFx.intensity', '演出强度', segmentedInput(
        'readerSettings.weatherFx.intensity',
        intensity,
        [['weak', '弱'], ['medium', '中'], ['strong', '强']],
        '演出强度',
    ));
    const wordList = (scene, label, words) => {
        const tags = (Array.isArray(words) ? words : []).map((word) => `<span class="igs-mood-word-tag">${esc(word)}<button type="button" class="igs-mood-word-del" data-action="weather-fx-remove-${scene}:${encSeg(word)}" title="删除${label}">×</button></span>`).join('');
        return `<div class="igs-mood-word-list">${tags || `<div class="igs-scene-empty">暂无${label}</div>`}<button type="button" class="igs-btn-mgr-icon" data-action="weather-fx-add-${scene}" title="添加${label}">+</button></div>`;
    };
    return `<div class="igs-settings-sub igs-weather-fx-settings">${intensityField}<div class="igs-source-filter-note">天气演出开启时，背景与立绘也会随天气调色；回忆、梦境期间暂停。</div><div class="igs-settings-field"><span>室内地点词</span>${wordList('indoor', '室内地点词', source.indoorWords)}</div><div class="igs-settings-field"><span>室外地点词</span>${wordList('outdoor', '室外地点词', source.outdoorWords)}</div></div>`;
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
    const folderSelect = typeof options.folderSelect === 'function' ? options.folderSelect : () => '';
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
                return `<div class="igs-sprite-slot"><div class="igs-btn-mgr-row igs-scene-mood-row igs-scene-weather-row">`
                    + badge('天气')
                    + `<span class="igs-btn-mgr-label">${esc(weatherName)}</span>`
                    + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-rename-weather:${encSeg(sceneName)}:${encSeg(timeName)}:${encSeg(weatherName)}" title="重命名">${pencil}</button>`
                    + `<input class="igs-scene-url-input" data-scene-weather-bg="${esc(sceneName)}" data-scene-time="${esc(timeName)}" data-scene-weather="${esc(weatherName)}" value="${esc(weatherObj.url || '')}" placeholder="URL 或 data:image/...">`
                    + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-remove-weather:${encSeg(sceneName)}:${encSeg(timeName)}:${encSeg(weatherName)}" title="删除">${trash}</button>`
                    + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-toggle-weather:${encSeg(sceneName)}:${encSeg(timeName)}:${encSeg(weatherName)}" title="展开/折叠">${wExpanded ? chevronUp : chevronDown}</button>`
                    + `</div>${wBody}</div>`;
            }).join('');
            const timeBody = timeExpanded ? renderSceneGroupExpansion('time', timeName, timeObj.url || '', timeGroups) : '';
            return `<div class="igs-scene-char-group igs-scene-time-group"><div class="igs-sprite-slot"><div class="igs-btn-mgr-row">`
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
            + folderSelect(sceneName)
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
    const tags = words.map((alias) =>
        `<span class="igs-mood-word-tag">${esc(alias)}<button type="button" class="igs-mood-word-del" data-action="scene-remove-bg-word:${encSeg(sceneName)}:${encSeg(alias)}" title="删除别名">×</button></span>`
    ).join('');
    const wHtml = `<div class="igs-sprite-words"><div class="igs-source-filter-note">场景别名</div><div class="igs-mood-word-list">${tags || '<div class="igs-scene-empty">暂无别名</div>'}<button type="button" class="igs-btn-mgr-icon" data-action="scene-add-bg-word:${encSeg(sceneName)}" title="添加别名">+</button></div></div>`;
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
    const folderSelect = typeof options.folderSelect === 'function' ? options.folderSelect : () => '';
    const expandedSlots = options.expandedSlots instanceof Set ? options.expandedSlots : new Set();
    const aliasesByCharacter = options.aliases && typeof options.aliases === 'object' && !Array.isArray(options.aliases)
        ? options.aliases : {};
    const statusAvatars = options.statusAvatars && typeof options.statusAvatars === 'object' && !Array.isArray(options.statusAvatars)
        ? options.statusAvatars : {};
    const dnaMap = options.characterDna && typeof options.characterDna === 'object' && !Array.isArray(options.characterDna)
        ? options.characterDna : {};
    const outfitMap = options.characterOutfits && typeof options.characterOutfits === 'object' && !Array.isArray(options.characterOutfits)
        ? options.characterOutfits : {};
    const outfitTabs = options.outfitTabs && typeof options.outfitTabs === 'object' ? options.outfitTabs : {};
    const upload = STATUS_AVATAR_UPLOAD_ICON;
    const pencil = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const trash = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    const chevronDown = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    const chevronUp = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
    const charEntries = Object.entries(characters || {});
    if (!charEntries.length) return '<div class="igs-scene-empty">暂无角色立绘配置</div>';
    return charEntries.map(([charName, moods]) => {
        const aliases = Array.isArray(aliasesByCharacter[charName]) ? aliasesByCharacter[charName] : [];
        const aliasTags = aliases.map((alias) => (
            `<span class="igs-mood-word-tag">${esc(alias)}<button type="button" class="igs-mood-word-del" data-action="scene-remove-char-alias:${encSeg(charName)}:${encSeg(alias)}" title="删除别名">×</button></span>`
        )).join('');
        const aliasesHtml = `<div class="igs-sprite-words"><div class="igs-mood-word-list">${aliasTags || '<div class="igs-scene-empty">暂无别名</div>'}<button type="button" class="igs-btn-mgr-icon" data-action="scene-add-char-alias:${encSeg(charName)}" title="添加别名">+</button></div></div>`;
        const avatarUrl = String(statusAvatars[charName] || '').trim();
        const avatarPreview = avatarUrl
            ? `<img class="igs-status-avatar-thumb" src="${esc(avatarUrl)}" loading="lazy" alt="" data-action="sprite-preview:${encSeg(avatarUrl)}" onerror="this.classList.add('igs-sprite-thumb-broken')">`
            : `<span class="igs-status-avatar-thumb igs-status-avatar-empty" aria-hidden="true">${STATUS_AVATAR_PLACEHOLDER_SVG}</span>`;
        const avatarHtml = `<div class="igs-btn-mgr-row igs-status-avatar-row"><span class="igs-btn-mgr-label">状态栏头像</span>${avatarPreview}<input class="igs-scene-url-input igs-status-avatar-url" data-status-avatar-char="${esc(charName)}" value="${esc(avatarUrl)}" placeholder="https://... 或 data:image/..."><button type="button" class="igs-btn-mgr-icon" data-action="status-avatar-pick:${encSeg(charName)}" title="上传头像">${upload}</button><button type="button" class="igs-btn-mgr-icon" data-action="status-avatar-clear:${encSeg(charName)}" title="清除头像">${trash}</button></div>`;
        const dnaHtml = renderCharacterDnaEditor(charName, Object.prototype.hasOwnProperty.call(dnaMap, charName) ? dnaMap[charName] : null);
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
        const slotArea = renderCharacterSlotTabs({
            charName,
            baseMoods: moodEntries.map(([mood]) => mood),
            baseListHtml: `<div class="igs-btn-mgr-list">${moodRows || '<div class="igs-scene-empty">暂无情绪</div>'}</div>`,
            outfits: Object.prototype.hasOwnProperty.call(outfitMap, charName) ? outfitMap[charName] : null,
            activeOutfit: Object.prototype.hasOwnProperty.call(outfitTabs, charName) ? outfitTabs[charName] : '',
            sceneAssets: options.sceneAssets || { characters, characterAliases: aliasesByCharacter, characterOutfits: outfitMap, moodGroups },
            icons: { pencil, trash },
        });
        return `<div class="igs-scene-char-group"><div class="igs-btn-mgr-row"><span class="igs-btn-mgr-label" style="font-weight:600">${esc(charName)}</span>${folderSelect(charName)}<button type="button" class="igs-btn-mgr-icon" data-action="scene-rename-char:${encSeg(charName)}" title="重命名">${pencil}</button><button type="button" class="igs-btn-mgr-icon" data-action="scene-add-mood:${encSeg(charName)}" title="添加情绪">+</button><button type="button" class="igs-btn-mgr-icon" data-action="scene-remove-char:${encSeg(charName)}" title="删除角色">${trash}</button></div>${aliasesHtml}${avatarHtml}${dnaHtml}${slotArea}</div>`;
    }).join('');
}

const CHARACTER_DNA_FIELD_LABELS = [
    ['identity', '固定身份', '发色、瞳色、脸型、体型、年龄感、标志特征'],
    ['defaultAppearance', '默认外观', '默认发型、服装、饰品；剧情明确换装时可被覆盖'],
    ['negative', '负面词', '防漂移与禁止增加的特征'],
    ['triggerWords', '触发词', '模型 token / LoRA 触发词等纯文本'],
];

// 角色 DNA 折叠编辑器：角色名只进 data 属性，不拼入点号路径；输入只更新草稿。
export function renderCharacterDnaEditor(charName, dna) {
    const source = dna && typeof dna === 'object' && !Array.isArray(dna) ? dna : {};
    const valueOf = (field) => (typeof source[field] === 'string' ? source[field] : '');
    const filled = CHARACTER_DNA_FIELD_LABELS.some(([field]) => valueOf(field).trim());
    const rows = CHARACTER_DNA_FIELD_LABELS.map(([field, label, hint]) => (
        `<label class="igs-dna-field"><span class="igs-btn-mgr-label">${esc(label)}</span>`
        + `<textarea class="igs-scene-url-input igs-dna-input" rows="2" data-dna-char="${esc(charName)}" data-dna-field="${field}" placeholder="${esc(hint)}">${esc(valueOf(field))}</textarea></label>`
    )).join('');
    return `<details class="igs-dna-editor" data-dna-editor="${esc(charName)}"><summary class="igs-dna-summary">角色 DNA${filled ? '' : '（未填写）'}</summary><div class="igs-dna-fields">${rows}</div></details>`;
}

// 审核卡带来的 DNA 候选：只展示，用户点「采用」才写入 defaultAppearance（不覆盖已填内容）。
export function renderDnaCandidateBar(candidate) {
    const name = candidate && typeof candidate.name === 'string' ? candidate.name.trim() : '';
    if (!name) return '';
    const tags = String(candidate.tags || '').trim();
    return `<div class="igs-dna-candidate" data-dna-candidate="${esc(name)}"><div class="igs-settings-subhead">「${esc(name)}」的 DNA 候选</div>`
        + `<div class="igs-source-filter-note">${tags ? `生成时使用的 tag：${esc(tags)}` : '生成记录没有可用 tag，可直接在下方手动填写。'}</div>`
        + `<div class="igs-settings-row"><button type="button" class="igs-settings-action" data-action="scene-accept-dna-candidate">采用为默认外观</button>`
        + `<button type="button" class="igs-settings-action" data-action="scene-dismiss-dna-candidate">忽略</button></div></div>`;
}

// 仅有 DNA、尚无立绘的角色：先登记资料，后由手动素材补全生成立绘。
export function renderDnaOnlyCharacterList(characterDna, characters) {
    const dnaMap = characterDna && typeof characterDna === 'object' && !Array.isArray(characterDna) ? characterDna : {};
    const chars = characters && typeof characters === 'object' && !Array.isArray(characters) ? characters : {};
    const pencil = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const trash = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    const names = Object.keys(dnaMap).filter((name) => !Object.prototype.hasOwnProperty.call(chars, name));
    const head = `<div class="igs-settings-section-head"><div class="igs-settings-subhead">仅有 DNA 的角色</div><button class="igs-btn-mgr-icon" data-action="scene-add-dna-char" type="button" title="新增角色 DNA">+</button></div>`;
    if (!names.length) return `<div class="igs-dna-only-list">${head}<div class="igs-scene-empty">暂无。可先录入角色资料，再通过素材补全生成立绘</div></div>`;
    const rows = names.map((name) => (
        `<div class="igs-scene-char-group igs-dna-only-char"><div class="igs-btn-mgr-row"><span class="igs-btn-mgr-label" style="font-weight:600">${esc(name)}</span>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-rename-dna-char:${encSeg(name)}" title="重命名">${pencil}</button>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-remove-dna-char:${encSeg(name)}" title="删除角色 DNA">${trash}</button></div>`
        + `${renderCharacterDnaEditor(name, dnaMap[name])}</div>`
    )).join('');
    return `<div class="igs-dna-only-list">${head}${rows}</div>`;
}

// 待确认情绪词：每个词一枚紧凑标签，点「加入」填写情绪组（模糊匹配到的组会预填），加入后从列表移除；× 忽略。
export function renderMoodReviewList(items) {
    const list = Array.isArray(items) ? items : [];
    const head = `<div class="igs-settings-section-head"><div class="igs-settings-subhead">待确认情绪词</div>${list.length ? '<button type="button" class="igs-review-clear" data-action="mood-review-clear">清空</button>' : ''}</div>`;
    if (!list.length) return `<div class="igs-mood-review">${head}<div class="igs-scene-empty">暂无。词库外的情绪词出现时会记在这里</div></div>`;
    const chips = list.map((item) => `<span class="igs-mood-review-chip"><b>${esc(item.word)}</b>`
        + (item.character ? `<span class="igs-mood-review-who">${esc(item.character)}</span>` : '')
        + `<button type="button" class="igs-review-link" data-action="mood-review-assign:${encSeg(item.word)}">加入</button>`
        + `<button type="button" class="igs-mood-word-del" data-action="mood-review-dismiss:${encSeg(item.word)}" title="忽略" aria-label="忽略「${esc(item.word)}」">×</button>`
        + `</span>`).join('');
    return `<div class="igs-mood-review">${head}<div class="igs-mood-review-list">${chips}</div></div>`;
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
    return `<div class="igs-scene-preset-bar"><select class="igs-scene-preset-select" data-preset-select>${opts}</select><button type="button" class="igs-btn-mgr-icon" data-action="scene-preset-save" title="保存当前配置为预设">${save}</button><button type="button" class="igs-btn-mgr-icon" data-action="scene-preset-rename"${dis} title="重命名">${pencil}</button><button type="button" class="igs-btn-mgr-icon" data-action="scene-preset-import" title="导入">${upload}</button><button type="button" class="igs-btn-mgr-icon" data-action="scene-preset-export"${dis} title="导出">${download}</button><button type="button" class="igs-btn-mgr-icon" data-action="scene-preset-delete"${dis} title="删除">${trash}</button></div>`;
}

export function renderPinnedButtons(pinnedValue, hiddenValue, orderValue) {
    const pins = Array.isArray(pinnedValue) ? pinnedValue : [];
    const hidden = Array.isArray(hiddenValue) ? hiddenValue : [];
    const canonical = TOOLBAR_ACTIONS.map(([id]) => id);
    // 旧顺序缺少的新按钮补到末尾，保证每个按钮都能在这里显示 / 隐藏。
    const saved = Array.isArray(orderValue) ? orderValue.filter((id) => canonical.includes(id)) : [];
    const order = saved.concat(canonical.filter((id) => !saved.includes(id)));
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
        return `<div class="igs-btn-mgr-row${isHidden ? ' is-hidden-btn' : ''}"><span class="igs-btn-mgr-handle" data-action="toolbar-move-up:${esc(id)}" title="上移">☰</span><span class="igs-btn-mgr-label">${esc(label)}</span>${eyeBtn}<button type="button" class="igs-btn-mgr-icon${isPinned ? ' is-on' : ''}" data-action="toggle-toolbar-pin:${esc(id)}" title="常驻">${pinIcon}</button></div>`;
    }).join('');
    return `<div class="igs-settings-field"><span>按钮管理</span><div class="igs-btn-mgr-list">${rows}</div></div>`;
}


export function renderGeneratedAssetPane({ library = {}, temp = [], resolveUrl, presetNames = [], currentPreset = '' } = {}) {
    const pencil = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1-1-4 9.5-9.5z"/></svg>';
    const trash = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    const source = library && typeof library === 'object' ? library : {};
    const downloadIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
    // 下载 IGS 实际存储的图片：立绘为裁边后的版本（带原图 PNG 文本块），背景为原图。
    const downloadButton = (imageId, name, typeLabel) => {
        const id = String(imageId || '').trim();
        if (!id) return '';
        const fileName = `${String(name || '').trim() || '素材'}-${typeLabel}.png`;
        return `<button type="button" class="igs-btn-mgr-icon" data-action="gen-asset-download:${encSeg(id)}:${encSeg(fileName)}" title="下载">${downloadIcon}</button>`;
    };
    // 生成素材「移到 / 复制到其他场景预设」；没有其他预设时不显示。选项值为 move|copy:<编码后的预设名>。
    const otherPresets = (Array.isArray(presetNames) ? presetNames : []).filter((n) => n && n !== currentPreset);
    const transferSelect = (type, name) => {
        if (!otherPresets.length) return '';
        const opts = ['<option value="">移到 / 复制到预设…</option>']
            .concat(otherPresets.map((p) => `<option value="move:${esc(encSeg(p))}">移到「${esc(p)}」</option>`))
            .concat(otherPresets.map((p) => `<option value="copy:${esc(encSeg(p))}">复制到「${esc(p)}」</option>`))
            .join('');
        return `<select class="igs-asset-move" data-gen-transfer="${esc(type)}" data-gen-name="${esc(name)}" aria-label="移到或复制到其他预设">${opts}</select>`;
    };
    // 首版只修复 igs-gen: 生成立绘；背景不提供入口。
    const matteButton = (imageId, type) => {
        const id = String(imageId || '').trim();
        if (!id || type !== 'sprite') return '';
        return `<button type="button" class="igs-settings-action" data-action="gen-matte-edit:${encSeg(id)}" title="修复抠图">修复抠图</button>`;
    };
    const resolve = (url) => {

        const raw = String(url || '').trim();
        if (!raw) return '';
        try { return typeof resolveUrl === 'function' ? String(resolveUrl(raw) || '') : raw; }
        catch (error) { return ''; }
    };
    const firstUrl = (value) => {
        if (typeof value === 'string') return value.startsWith('igs-gen:') ? value : '';
        if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
        for (const child of Object.values(value)) {
            const found = firstUrl(child);
            if (found) return found;
        }
        return '';
    };
    const preview = (url, alt) => {
        const resolved = resolve(url);
        return resolved
            ? `<img class="igs-sprite-thumb" src="${esc(resolved)}" loading="lazy" alt="${esc(alt)}" onerror="this.classList.add('igs-sprite-thumb-broken')">`
            : '<div class="igs-sprite-thumb igs-sprite-thumb-empty">等待载入</div>';
    };
    const libraryRows = [];
    for (const [type, bucketName, title] of [['background', 'scenes', '背景'], ['sprite', 'characters', '立绘']]) {
        for (const [name, value] of Object.entries(source[bucketName] && typeof source[bucketName] === 'object' ? source[bucketName] : {})) {
            const url = firstUrl(value);
            const imageId = url.startsWith('igs-gen:') ? url.slice('igs-gen:'.length) : '';
            libraryRows.push(`<div class="igs-sprite-slot"><div class="igs-btn-mgr-row"><span class="igs-btn-mgr-label">${esc(name)}</span><span class="igs-source-filter-note">${title}</span>${downloadButton(imageId, name, title)}${matteButton(imageId, type)}${transferSelect(type, name)}<button type="button" class="igs-btn-mgr-icon" data-action="gen-lib-rename:${encSeg(type)}:${encSeg(name)}" title="重命名">${pencil}</button><button type="button" class="igs-btn-mgr-icon" data-action="gen-lib-remove:${encSeg(type)}:${encSeg(name)}" title="删除">${trash}</button></div>${preview(url, name)}</div>`);
        }
    }
    const tempRows = (Array.isArray(temp) ? temp : []).map((record) => {
        const item = record && typeof record === 'object' ? record : {};
        const url = item.url || (item.imageId ? `igs-gen:${item.imageId}` : '');
        const key = String(item.key || '');
        const typeLabel = item.type === 'background' ? '背景' : '立绘';
        return `<div class="igs-sprite-slot"><div class="igs-btn-mgr-row"><span class="igs-btn-mgr-label">${esc(item.name || '未命名素材')}</span><span class="igs-source-filter-note">${typeLabel} · ${esc(item.status || '临时')}</span><button type="button" class="igs-settings-action" data-action="gen-temp-accept:${encSeg(key)}"${key ? '' : ' disabled'}>入库</button>${downloadButton(item.imageId, item.name, typeLabel)}${matteButton(item.imageId, item.type)}<button type="button" class="igs-btn-mgr-icon" data-action="gen-temp-discard:${encSeg(key)}"${key ? '' : ' disabled'} title="丢弃">${trash}</button></div>${preview(url, item.name || '')}</div>`;
    }).join('');
    return `<div class="igs-settings-section"><div class="igs-settings-section-head"><div class="igs-settings-subhead">生成素材库</div></div>${libraryRows.join('') || '<div class="igs-scene-empty">暂无已入库素材</div>'}</div><div class="igs-settings-section"><div class="igs-settings-section-head"><div class="igs-settings-subhead">本聊天临时素材</div></div>${tempRows || '<div class="igs-scene-empty">暂无临时素材</div>'}</div>`;
}
