import { esc } from './reader-value-utils.js';
import { normalizeMoodGroups } from '../../scene/mood-groups.js';
import { TOOLBAR_ACTIONS } from './reader-host-constants.js';
import { STAGE_SHAKE_INTENSITIES } from './stage-shake-runtime.js';
import { CHAT_SHOW_BUBBLE_RADIUS_LEVELS, CHAT_SHOW_DIM_LEVELS, CHAT_SHOW_PROMPT_RULE } from './chat-show-runtime.js';
import { CHAT_SFX_PRESET_LABELS } from './chat-sfx.js';
import { menuItem, renderCharacterSlotTabs, renderReviewCard, renderRowMenu } from './settings-outfit-fields.js';
import { MAGIC_HOUSES, normalizeMagicHouse } from './dialog-theme-css-skins.js';
import { resolveCharacterMagicHouse } from './magic-house.js';


const encSeg = (value) => encodeURIComponent(String(value == null ? '' : value));

// 「本卡 / 全局」标签由素材页按当前角色卡给出；没打开角色卡时没有标签。
function scopeTag(options, collection, name) {
    return options && typeof options.scopeTag === 'function' ? options.scopeTag(collection, name) : '';
}

const STORED_IMAGE_DOWNLOAD_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

function storedImageId(url) {
    const raw = String(url || '').trim();
    return raw.startsWith('igs-gen:') ? raw.slice('igs-gen:'.length) : '';
}

// 「下载 / 提示词」只进 ⋯ 菜单，行内不再单独放图标按钮。
function storedImageDownloadItem(url, fileName) {
    const id = storedImageId(url);
    if (!id) return '';
    return menuItem(`gen-asset-download:${encSeg(id)}:${encSeg(fileName)}`, '下载');
}

function storedImagePromptItem(url) {
    const id = storedImageId(url);
    if (!id) return '';
    return menuItem(`gen-asset-prompt:${encSeg(id)}`, '提示词');
}

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

// 把「主文案（补充说明）」拆成主文案与辅助说明；无尾部括号时原样返回。
export function splitLabelNote(label) {
    const text = String(label ?? '');
    const match = text.match(/^(.+?)\s*[（(]([^（）()]+)[）)]$/);
    return match ? [match[1], match[2]] : [text, ''];
}

export function checkbox(path, value, label) {
    const [main, note] = splitLabelNote(label);
    const noteHtml = note ? `<small class="igs-switch-note">${esc(note)}</small>` : '';
    const ariaLabel = note ? ` aria-label="${esc(label)}"` : '';
    return `<button type="button" class="igs-switch${value ? ' is-on' : ''}" data-switch="${esc(path)}" aria-pressed="${value ? 'true' : 'false'}"${ariaLabel}><i></i><span>${esc(main)}${noteHtml}</span></button>`;
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
        const [main, note] = splitLabelNote(item[1]);
        const noteHtml = note ? `<small class="igs-segmented-btn-note">${esc(note)}</small>` : '';
        const ariaLabel = note ? ` aria-label="${esc(item[1])}"` : '';
        return `<button type="button" class="igs-segmented-btn${item[2] ? ' has-icon' : ''}${selected ? ' is-active' : ''}" data-segment-path="${esc(path)}" data-segment-value="${esc(item[0])}" role="radio" aria-checked="${selected ? 'true' : 'false'}" aria-pressed="${selected ? 'true' : 'false'}"${ariaLabel}>${icon}<span class="igs-segmented-btn-label">${esc(main)}${noteHtml}</span></button>`;
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
    const radiusItems = CHAT_SHOW_BUBBLE_RADIUS_LEVELS.includes(s.bubbleRadius) ? CHAT_SHOW_BUBBLE_RADIUS_LEVELS : CHAT_SHOW_BUBBLE_RADIUS_LEVELS.concat(s.bubbleRadius).sort((a, b) => a - b);
    const grid = [
        '<div class="igs-source-filter-grid">',
        segment('frame', '聊天外框', [['phone', '手机框'], ['none', '无框']]),
        segment('revealMode', '冒泡节奏', [['click', '点击逐条'], ['auto', '自动连发']]),
        s.revealMode === 'auto' ? segment('autoSpeed', '连发速度', [['fast', '快'], ['medium', '中'], ['slow', '慢']]) : '',
        segment('returnMode', '返回看过的聊天页', [['full', '一次平铺'], ['replay', '逐条重播'], ['restart', '重新点击']]),
        field(`${p}.dim`, '背景压暗', selectInput(`${p}.dim`, s.dim, dimItems.map((n) => [n, `${Math.round(n * 100)}%`]))),
        field(`${p}.bubbleRadius`, '气泡圆角', selectInput(`${p}.bubbleRadius`, s.bubbleRadius, radiusItems.map((n) => [n, n === 0 ? '直角' : `${n}px`]))),
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
    const promptField = `<div class="igs-settings-field"><span>线上交流规则（启用后随消息发送至 AI）</span><textarea class="igs-chat-prompt" data-chat-prompt-draft="1" aria-label="线上交流规则" placeholder="聊天标签规则...">${esc(promptDraft)}</textarea><div class="igs-chat-prompt-actions"><button type="button" class="igs-settings-action igs-settings-inline-action" data-action="chat-show-save-prompt">保存提示词</button><button type="button" class="igs-settings-action igs-settings-inline-action" data-action="chat-show-reset-prompt">恢复默认</button></div><div class="igs-settings-result" data-result="chat-prompt">${esc(promptStatus)}</div></div>`;
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
                const wBody = wExpanded ? renderSceneGroupExpansion('weather', weatherName, weatherObj.url || '', weatherGroups, options.resolveUrl) : '';
                return `<div class="igs-sprite-slot"><div class="igs-btn-mgr-row igs-scene-mood-row igs-scene-weather-row">`
                    + badge('天气')
                    + `<span class="igs-btn-mgr-label">${esc(weatherName)}</span>`
                    + `<input class="igs-scene-url-input" data-scene-weather-bg="${esc(sceneName)}" data-scene-time="${esc(timeName)}" data-scene-weather="${esc(weatherName)}" value="${esc(weatherObj.url || '')}" placeholder="URL 或 data:image/...">`
                    + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-pick-weather:${encSeg(sceneName)}:${encSeg(timeName)}:${encSeg(weatherName)}" title="上传天气背景图">${STATUS_AVATAR_UPLOAD_ICON}</button>`
                    + renderRowMenu([
                        menuItem(`scene-rename-weather:${encSeg(sceneName)}:${encSeg(timeName)}:${encSeg(weatherName)}`, '重命名'),
                        storedImageDownloadItem(weatherObj.url, `${sceneName}-${timeName}-${weatherName}-背景.png`),
                        storedImagePromptItem(weatherObj.url),
                        menuItem(`scene-remove-weather:${encSeg(sceneName)}:${encSeg(timeName)}:${encSeg(weatherName)}`, '删除', ' is-danger'),
                    ], `「${weatherName}」的操作`)
                    + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-toggle-weather:${encSeg(sceneName)}:${encSeg(timeName)}:${encSeg(weatherName)}" title="展开/折叠">${wExpanded ? chevronUp : chevronDown}</button>`
                    + `</div>${wBody}</div>`;
            }).join('');
            const timeBody = timeExpanded ? renderSceneGroupExpansion('time', timeName, timeObj.url || '', timeGroups, options.resolveUrl) : '';
            return `<div class="igs-scene-char-group igs-scene-time-group"><div class="igs-sprite-slot"><div class="igs-btn-mgr-row">`
                + badge('时间')
                + `<span class="igs-btn-mgr-label">${esc(timeName)}</span>`
                + `<input class="igs-scene-url-input" data-scene-time-bg="${esc(sceneName)}" data-scene-time="${esc(timeName)}" value="${esc(timeObj.url || '')}" placeholder="URL 或 data:image/...">`
                + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-pick-time:${encSeg(sceneName)}:${encSeg(timeName)}" title="上传时间背景图">${STATUS_AVATAR_UPLOAD_ICON}</button>`
                + renderRowMenu([
                    menuItem(`scene-rename-time:${encSeg(sceneName)}:${encSeg(timeName)}`, '重命名'),
                    storedImageDownloadItem(timeObj.url, `${sceneName}-${timeName}-背景.png`),
                    storedImagePromptItem(timeObj.url),
                    menuItem(`scene-add-weather:${encSeg(sceneName)}:${encSeg(timeName)}`, '添加天气'),
                    menuItem(`scene-remove-time:${encSeg(sceneName)}:${encSeg(timeName)}`, '删除', ' is-danger'),
                ], `「${timeName}」的操作`)
                + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-toggle-time:${encSeg(sceneName)}:${encSeg(timeName)}" title="展开/折叠">${timeExpanded ? chevronUp : chevronDown}</button>`
                + `</div>${timeBody}</div>${weatherRows}</div>`;
        }).join('');
        const bgBody = bgExpanded ? renderSceneBgExpansion(sceneName, sceneObj.url || '', sceneWords, options.resolveUrl) : '';
        return `<div class="igs-scene-char-group"><div class="igs-sprite-slot"><div class="igs-btn-mgr-row">`
            + badge('场景')
            + `<span class="igs-btn-mgr-label" style="font-weight:600">${esc(sceneName)}</span>`
            + scopeTag(options, 'scenes', sceneName)
            + `<input class="igs-scene-url-input" data-scene-bg="${esc(sceneName)}" value="${esc(sceneObj.url || '')}" placeholder="URL 或 data:image/...">`
            + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-pick-bg:${encSeg(sceneName)}" title="上传场景背景图">${STATUS_AVATAR_UPLOAD_ICON}</button>`
            + renderRowMenu([
                menuItem(`scene-rename-bg:${encSeg(sceneName)}`, '重命名'),
                folderSelect(sceneName, { menu: true }),
                storedImageDownloadItem(sceneObj.url, `${sceneName}-背景.png`),
                storedImagePromptItem(sceneObj.url),
                menuItem(`scene-add-time:${encSeg(sceneName)}`, '添加时间'),
                menuItem(`scene-remove-bg:${encSeg(sceneName)}`, '删除场景', ' is-danger'),
            ], `「${sceneName}」的操作`)
            + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-toggle-bg:${encSeg(sceneName)}" title="展开/折叠">${bgExpanded ? chevronUp : chevronDown}</button>`
            + `</div>${bgBody}</div>${timeRows}</div>`;
    }).join('');
}

function shownAssetUrl(url, resolveUrl) {
    const raw = String(url || '').trim();
    if (!raw.startsWith('igs-gen:') || typeof resolveUrl !== 'function') return raw;
    try { return String(resolveUrl(raw) || ''); } catch (error) { return ''; }
}

function renderSceneBgExpansion(sceneName, url, words, resolveUrl) {
    const trimmedUrl = String(url || '').trim();
    const shown = shownAssetUrl(trimmedUrl, resolveUrl);
    const thumb = /^(?:https?:\/\/|data:image\/|blob:)/i.test(shown)
        ? `<img class="igs-sprite-thumb" src="${esc(shown)}" alt="" data-action="sprite-preview:${encSeg(shown)}" onerror="this.classList.add('igs-sprite-thumb-broken')">`
        : `<div class="igs-sprite-thumb igs-sprite-thumb-empty">${trimmedUrl ? '等待载入' : '未配置'}</div>`;
    const tags = words.map((alias) =>
        `<span class="igs-mood-word-tag">${esc(alias)}<button type="button" class="igs-mood-word-del" data-action="scene-remove-bg-word:${encSeg(sceneName)}:${encSeg(alias)}" title="删除别名">×</button></span>`
    ).join('');
    const wHtml = `<div class="igs-sprite-words"><div class="igs-source-filter-note">场景别名</div><div class="igs-mood-word-list">${tags || '<div class="igs-scene-empty">暂无别名</div>'}<button type="button" class="igs-btn-mgr-icon" data-action="scene-add-bg-word:${encSeg(sceneName)}" title="添加别名">+</button></div></div>`;
    return `<div class="igs-sprite-slot-body">${thumb}${wHtml}</div>`;
}

function renderSceneGroupExpansion(type, label, url, groups, resolveUrl) {
    const trimmedUrl = String(url || '').trim();
    const shown = shownAssetUrl(trimmedUrl, resolveUrl);
    const thumb = /^(?:https?:\/\/|data:image\/|blob:)/i.test(shown)
        ? `<img class="igs-sprite-thumb" src="${esc(shown)}" alt="" data-action="sprite-preview:${encSeg(shown)}" onerror="this.classList.add('igs-sprite-thumb-broken')">`
        : `<div class="igs-sprite-thumb igs-sprite-thumb-empty">${trimmedUrl ? '等待载入' : '未配置'}</div>`;
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
    // 折叠区的展开状态由宿主按 data-advanced 记住，重渲染后不会收起。
    const isOpen = typeof options.isOpen === 'function' ? options.isOpen : () => false;
    // 魔法星夜才显示学院行；未指定时按 DNA 自动识别，识别不出用全局配色。
    const magicHouse = options.magicHouse && typeof options.magicHouse === 'object' ? options.magicHouse : null;
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
        const aliasesHtml = `<div class="igs-mood-word-list">${aliasTags}<button type="button" class="igs-btn-mgr-icon" data-action="scene-add-char-alias:${encSeg(charName)}" title="添加别名">+</button></div>`;
        const avatarUrl = String(statusAvatars[charName] || '').trim();
        const avatarPreview = avatarUrl
            ? `<img class="igs-status-avatar-thumb" src="${esc(avatarUrl)}" alt="" onerror="this.classList.add('igs-sprite-thumb-broken')">`
            : `<span class="igs-status-avatar-thumb igs-status-avatar-empty" aria-hidden="true">${STATUS_AVATAR_PLACEHOLDER_SVG}</span>`;
        const avatarHtml = `<div class="igs-char-info-value igs-status-avatar-row"><input class="igs-scene-url-input igs-status-avatar-url" data-status-avatar-char="${esc(charName)}" value="${esc(avatarUrl)}" placeholder="https://... 或 data:image/..."><button type="button" class="igs-btn-mgr-icon" data-action="status-avatar-pick:${encSeg(charName)}" title="上传头像">${upload}</button><button type="button" class="igs-settings-action igs-status-avatar-gen" data-action="status-avatar-generate:${encSeg(charName)}" title="按角色设定生成 Q 版头像">${avatarUrl ? '重画Q版' : '生成Q版'}</button>${avatarUrl ? `<button type="button" class="igs-btn-mgr-icon" data-action="status-avatar-clear:${encSeg(charName)}" title="清除头像">${trash}</button>` : ''}</div>`;
        const houseHtml = magicHouse ? renderCharacterHouseRow(charName, magicHouse) : '';
        const dna = Object.prototype.hasOwnProperty.call(dnaMap, charName) ? dnaMap[charName] : null;
        const dnaOpen = isOpen(`char-dna:${charName}`);
        const outfitForChar = Object.prototype.hasOwnProperty.call(outfitMap, charName) ? outfitMap[charName] : null;
        const outfitNames = outfitForChar && typeof outfitForChar === 'object' ? Object.keys(outfitForChar) : [];
        const activeOutfit = outfitNames.includes(outfitTabs[charName]) ? outfitTabs[charName] : '';
        const baseMenuItems = [
            menuItem(`char-generate-sprite:${encSeg(charName)}`, '生成立绘'),
            String((moods && moods['默认']) || '').startsWith('igs-gen:') ? menuItem(`char-expression-set:${encSeg(charName)}`, '表情差分') : '',
            menuItem(`scene-add-mood:${encSeg(charName)}`, '添加情绪'),
        ];
        const expressionNotes = options.expressionNotes && typeof options.expressionNotes === 'object' ? options.expressionNotes[charName] : null;
        const moodEntries = Object.entries(moods || {});
        const moodRows = moodEntries.map(([mood, url]) => {
            const expanded = expandedSlots.has(charName + "\x00" + mood);
            const note = expressionNotes && expressionNotes[mood];
            const rawUrl = String(url || '').trim();
            const imageId = rawUrl.startsWith('igs-gen:') ? rawUrl.slice('igs-gen:'.length) : '';
            const canPrompt = Boolean(imageId) || Boolean(note && (note.caption || note.positive || note.negative));
            const shown = imageId && typeof options.resolveUrl === 'function' ? String(options.resolveUrl(rawUrl) || '') : '';
            // 生成图的格子只留缩略图和名字：编号地址对用户没用，不再放输入框和「已绑定」说明；其余操作收进 ⋯。
            // 每格都留缩略图位置，名字才对得齐：生成图看解析结果，自填地址直接显示，没图放空位。
            const thumbUrl = imageId ? shown : rawUrl;
            const rowThumb = /^(?:https?:\/\/|data:image\/|blob:)/i.test(thumbUrl)
                ? `<img class="igs-outfit-thumb" src="${esc(thumbUrl)}" alt="${esc(mood)}" data-action="sprite-preview:${encSeg(thumbUrl)}" onerror="this.classList.add('igs-sprite-thumb-broken')">`
                : `<span class="igs-outfit-thumb igs-outfit-thumb-empty" aria-hidden="true">${imageId ? '载入中' : ''}</span>`;
            const c = encSeg(charName);
            const m = encSeg(mood);
            const slotMenu = renderRowMenu([
                canPrompt ? menuItem(`char-expression-prompt:${c}:${m}`, '提示词') : '',
                imageId ? menuItem(`gen-asset-download:${encSeg(imageId)}:${encSeg(`${charName}-${mood}-立绘.png`)}`, '下载') : '',
                mood !== '默认' && (imageId || (note && note.error)) ? menuItem(`char-expression-retry:${c}:${m}`, '重新生成') : '',
                mood === '默认' && rawUrl ? menuItem(`char-generate-sprite:${c}`, '重新生成') : '',
                menuItem(`scene-rename-mood:${c}:${m}`, '重命名'),
                menuItem(`scene-remove-mood:${c}:${m}`, '删除', ' is-danger'),
            ], `「${mood}」的操作`);
            const collapsedRow = `<div class="igs-btn-mgr-row igs-scene-mood-row">`
                + rowThumb
                + `<span class="igs-btn-mgr-label">${esc(mood)}</span>`
                + (imageId ? '' : `<input class="igs-scene-url-input" data-scene-char="${esc(charName)}" data-scene-mood="${esc(mood)}" value="${esc(url || '')}" placeholder="URL 或 data:image/...">`)
                + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-pick-mood:${c}:${m}" title="上传${esc(mood)}立绘">${STATUS_AVATAR_UPLOAD_ICON}</button>`
                + slotMenu
                + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-toggle-mood:${c}:${m}" title="展开/折叠">${expanded ? chevronUp : chevronDown}</button>`
                + `</div>`;
            const expandedBody = expanded ? renderSpriteSlotExpansion(charName, mood, url, moodGroups, { pencil, trash, resolveUrl: options.resolveUrl }) : '';
            return `<div class="igs-sprite-slot">${collapsedRow}${expandedBody}</div>`;
        }).join('');
        const slotArea = renderCharacterSlotTabs({
            charName,
            baseMoods: moodEntries.map(([mood]) => mood),
            baseListHtml: `<div class="igs-outfit-panel"><div class="igs-btn-mgr-list">${moodRows || '<div class="igs-scene-empty">暂无情绪，点页签右边的 ⋯ 添加</div>'}</div></div>`,
            baseMenuItems,
            outfits: outfitForChar,
            activeOutfit,
            expressionNotes: options.expressionNotes,
            resolveUrl: options.resolveUrl,
            sceneAssets: options.sceneAssets || { characters, characterAliases: aliasesByCharacter, characterOutfits: outfitMap, moodGroups },
            icons: { pencil, trash },
            isOpen,
        });
        // 和场景一样，每个角色平时只有一行；点名字或右边箭头才展开服装和立绘。
        const openKey = `char-open:${charName}`;
        const open = isOpen(openKey);
        const toggle = `ui-toggle-open:${encSeg(openKey)}`;
        const meta = aliases.join('、');
        const head = `<div class="igs-char-head"><button type="button" class="igs-char-avatar" data-action="status-avatar-pick:${encSeg(charName)}" title="上传状态栏头像">${avatarPreview}</button>`
            + `<button type="button" class="igs-char-title" data-action="${toggle}" aria-expanded="${open}"><b class="igs-char-name">${esc(charName)}</b><span class="igs-char-aliases">${esc(meta)}</span></button>`
            + `${scopeTag(options, 'characters', charName)}`
            + renderRowMenu([
                menuItem(`scene-toggle-dna:${encSeg(charName)}`, dnaOpen ? '收起角色设定' : `角色设定（别名、头像、DNA${characterDnaFilled(dna) ? '' : '，DNA 未填'}）`),
                folderSelect(charName, { menu: true }),
                menuItem(`scene-rename-char:${encSeg(charName)}`, '重命名'),
                menuItem(`scene-remove-char:${encSeg(charName)}`, '删除角色', ' is-danger'),
            ], `「${charName}」的操作`)
            + `<button type="button" class="igs-btn-mgr-icon" data-action="${toggle}" title="${open ? '收起' : '展开服装和立绘'}" aria-expanded="${open}">${open ? chevronUp : chevronDown}</button></div>`;
        const setup = dnaOpen
            ? renderCharacterSetupPanel(charName, dna, [
                `<div class="igs-char-info-row"><span class="igs-char-info-label">别名</span>${aliasesHtml}</div>`,
                `<div class="igs-char-info-row"><span class="igs-char-info-label">状态栏头像</span>${avatarHtml}</div>`,
                houseHtml,
            ].join(''))
            : '';
        return `<div class="igs-scene-char-group igs-char-card${open ? ' is-open' : ''}">${head}${setup}${open ? `<div class="igs-char-body">${slotArea}</div>` : ''}</div>`;
    }).join('');
}

const houseLabel = (id) => (MAGIC_HOUSES.find((house) => house.id === id) || {}).label || '';

function renderCharacterHouseRow(charName, { sceneAssets, fallback }) {
    const houses = sceneAssets && typeof sceneAssets.characterHouses === 'object' ? sceneAssets.characterHouses || {} : {};
    const manual = Object.prototype.hasOwnProperty.call(houses, charName) ? houses[charName] : '';
    const auto = resolveCharacterMagicHouse({ ...sceneAssets, characterHouses: {} }, charName).house;
    const autoText = auto ? `自动（DNA 识别为${houseLabel(auto)}）` : `自动（跟随全局：${houseLabel(normalizeMagicHouse(fallback))}）`;
    const opts = [['', autoText], ...MAGIC_HOUSES.map((house) => [house.id, house.label])]
        .map(([id, label]) => `<option value="${esc(id)}"${id === manual ? ' selected' : ''}>${esc(label)}</option>`).join('');
    return `<div class="igs-char-info-row igs-char-house-row"><span class="igs-char-info-label">学院</span><select class="igs-asset-move" data-char-house="${esc(charName)}" aria-label="角色学院">${opts}</select></div>`;
}

const CHARACTER_DNA_FIELD_LABELS = [
    ['identity', '固定身份', '发色、瞳色、脸型、体型、年龄感、标志特征'],
    ['defaultAppearance', '默认外观', '默认发型、服装、饰品；剧情明确换装时可被覆盖'],
    ['negative', '负面词', '防漂移与禁止增加的特征'],
    ['triggerWords', '触发词', '模型 token / LoRA 触发词等纯文本'],
];

// 角色 DNA 折叠编辑器：角色名只进 data 属性，不拼入点号路径；输入只更新草稿。
const dnaValue = (dna, field) => (dna && typeof dna === 'object' && !Array.isArray(dna) && typeof dna[field] === 'string' ? dna[field] : '');

function characterDnaFilled(dna) {
    return CHARACTER_DNA_FIELD_LABELS.some(([field]) => dnaValue(dna, field).trim());
}

function renderCharacterDnaFields(charName, dna) {
    const rows = CHARACTER_DNA_FIELD_LABELS.map(([field, label, hint]) => (
        `<label class="igs-dna-field"><span class="igs-btn-mgr-label">${esc(label)}</span>`
        + `<textarea class="igs-scene-url-input igs-dna-input" rows="2" data-dna-char="${esc(charName)}" data-dna-field="${field}" placeholder="${esc(hint)}">${esc(dnaValue(dna, field))}</textarea></label>`
    )).join('');
    return `<div class="igs-dna-fields" data-dna-editor="${esc(charName)}">${rows}</div>`;
}

// 「角色立绘」标题旁的 ＋：和场景页一样是个下拉，新增角色或只有 DNA 的角色。
export const CHARACTER_ADD_MENU = `<details class="igs-add-menu" data-add-menu="characters"><summary class="igs-btn-mgr-icon" title="新增角色" aria-label="新增角色">+</summary>`
    + '<div class="igs-add-menu-list" role="menu"><button class="igs-add-menu-item" data-action="scene-add-char" type="button" role="menuitem">新增角色</button>'
    + '<button class="igs-add-menu-item" data-action="scene-add-dna-char" type="button" role="menuitem">新增只有 DNA 的角色（先登记长相）</button></div></details>';

function renderCharacterSetupPanel(charName, dna, profileRows) {
    return `<div class="igs-char-dna-panel"><div class="igs-char-dna-panel-head">角色设定`
        + `<button type="button" class="igs-review-link" data-action="scene-toggle-dna:${encSeg(charName)}">收起</button></div>`
        + profileRows
        + `<div class="igs-char-info-row is-block"><span class="igs-char-info-label">角色 DNA<span class="igs-outfit-muted">（生图时保持长相）</span></span>${renderCharacterDnaFields(charName, dna)}</div></div>`;
}

export function renderCharacterDnaEditor(charName, dna) {
    return `<details class="igs-dna-editor"><summary class="igs-dna-summary">角色 DNA${characterDnaFilled(dna) ? '' : '（未填写）'}</summary>${renderCharacterDnaFields(charName, dna)}</details>`;
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

// 仅有 DNA、尚无立绘的角色：在这里直接生成默认立绘，生成后进入角色立绘列表。
export function renderDnaOnlyCharacterList(characterDna, characters) {
    const dnaMap = characterDna && typeof characterDna === 'object' && !Array.isArray(characterDna) ? characterDna : {};
    const chars = characters && typeof characters === 'object' && !Array.isArray(characters) ? characters : {};
    const pencil = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
    const trash = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
    const names = Object.keys(dnaMap).filter((name) => !Object.prototype.hasOwnProperty.call(chars, name));
    const head = `<div class="igs-settings-section-head"><div class="igs-settings-subhead">仅有 DNA 的角色</div><button class="igs-btn-mgr-icon" data-action="scene-add-dna-char" type="button" title="新增只有 DNA 的角色">+</button></div>`;
    // 没有时整块不出现，入口在「角色立绘」标题旁的 ＋ 里。
    if (!names.length) return '';
    const rows = names.map((name) => (
        `<div class="igs-scene-char-group igs-dna-only-char"><div class="igs-btn-mgr-row"><span class="igs-btn-mgr-label" style="font-weight:600">${esc(name)}</span>`
        + `<button type="button" class="igs-settings-action" data-action="char-generate-sprite:${encSeg(name)}">生成立绘</button>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-rename-dna-char:${encSeg(name)}" title="重命名">${pencil}</button>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="scene-remove-dna-char:${encSeg(name)}" title="删除角色 DNA">${trash}</button></div>`
        + `${renderCharacterDnaEditor(name, dnaMap[name])}</div>`
    )).join('');
    return `<div class="igs-dna-only-list">${head}${rows}</div>`;
}

// 待确认情绪词：词库外的情绪词。标签里只放词本身，不带所属角色；「加入」「忽略」放在标签外，避免用户只注意到 ×。
function storedMoodGroups(value) {
    if (!Array.isArray(value)) return normalizeMoodGroups(value);
    return value.filter((group) => group && String(group.label || '').trim());
}

// 情绪组是词库里的容器，和角色上的表情槽分开列。标题上的数字就是当前有多少组。
export function renderMoodGroupList(groups, options = {}) {
    const list = storedMoodGroups(groups);
    const isOpen = typeof options.isOpen === 'function' ? options.isOpen : () => false;
    const chevronDown = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
    const chevronUp = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
    const rows = list.map((group) => {
        const label = String(group.label || '').trim();
        const words = Array.isArray(group.words) ? group.words.map((word) => String(word || '').trim()).filter(Boolean) : [];
        const key = `mood-group:${label}`;
        const open = isOpen(key);
        const toggle = `ui-toggle-open:${encSeg(key)}`;
        const tags = words.map((word) => (
            `<span class="igs-mood-word-tag">${esc(word)}<button type="button" class="igs-mood-word-del" data-action="mood-remove-word:${encSeg(label)}:${encSeg(word)}" title="删除词">×</button></span>`
        )).join('');
        const wordsHtml = open
            ? `<div class="igs-mood-word-list">${tags || '<div class="igs-scene-empty">暂无情绪词</div>'}<button type="button" class="igs-btn-mgr-icon" data-action="mood-add-word:${encSeg(label)}" title="添加词">+</button></div>`
            : '';
        return `<div class="igs-mood-group" data-mood-group="${esc(label)}">`
            + `<div class="igs-btn-mgr-row">`
            + `<span class="igs-btn-mgr-label">${esc(label)}</span>`
            + `<span class="igs-mood-group-words">${words.length} 个词</span>`
            + renderRowMenu([
                menuItem(`mood-rename-group:${encSeg(label)}`, '重命名'),
                menuItem(`mood-remove-group:${encSeg(label)}`, '删除', ' is-danger'),
            ], `情绪组「${label}」的操作`)
            + `<button type="button" class="igs-btn-mgr-icon" data-action="${toggle}" title="${open ? '收起' : '展开这个组里的词'}" aria-expanded="${open}">${open ? chevronUp : chevronDown}</button>`
            + `</div>${wordsHtml}</div>`;
    }).join('');
    return `<div class="igs-mood-groups" data-mood-group-count="${list.length}">`
        + `<div class="igs-settings-section-head"><div class="igs-settings-subhead">情绪组 <span class="igs-mood-group-total">${list.length}</span></div>`
        + `<button type="button" class="igs-btn-mgr-icon" data-action="mood-add-group" title="新增情绪组" aria-label="新增情绪组">+</button></div>`
        + `<div class="igs-source-filter-note">组名用来对表情槽。展开后是这个组里的词，正文里的叫法归到这里。</div>`
        + `<div class="igs-btn-mgr-list">${rows || '<div class="igs-scene-empty">还没有情绪组</div>'}</div>`
        + `</div>`;
}

export function renderMoodReviewList(items, groups, { busy = false } = {}) {
    const list = Array.isArray(items) ? items : [];
    const labels = storedMoodGroups(groups).map((group) => String(group.label || '').trim()).filter(Boolean);
    const rows = list.map((item) => {
        const suggested = item && labels.includes(String(item.group || '').trim()) ? String(item.group).trim() : '';
        const ordered = suggested ? [suggested, ...labels.filter((label) => label !== suggested)] : labels;
        const options = ordered.map((label) => `<option value="${esc(label)}">${esc(label)}</option>`).join('');
        const select = `<select class="igs-asset-move igs-review-select" data-mood-review-word="${esc(item.word)}" aria-label="把「${esc(item.word)}」归入哪一组"><option value="">加入…</option>${options}</select>`;
        return `<div class="igs-review-item"><span class="igs-mood-review-chip"><b>${esc(item.word)}</b></span>`
            + `<span class="igs-review-actions">${select}`
            + `<button type="button" class="igs-review-link" data-action="mood-review-dismiss:${encSeg(item.word)}" aria-label="忽略「${esc(item.word)}」">忽略</button>`
            + `</span></div>`;
    }).join('');
    return renderReviewCard({
        key: 'mood',
        title: '情绪词',
        count: list.length,
        headerAction: `<button type="button" class="igs-review-link" data-action="mood-review-ai-classify"${!list.length || busy ? ' disabled' : ''}${busy ? ' aria-busy="true"' : ''}${!list.length ? ' title="暂无待分类情绪词"' : ''}>${busy ? '分类中…' : 'AI 分类'}</button>`,
        hint: '词库里没有的情绪词。从已有情绪组里选一个加入，相近的组排在最前。',
        clearAction: 'mood-review-clear',
        body: rows ? `<div class="igs-review-list">${rows}</div>` : '',
        empty: '暂无，词库外的情绪词出现时会记在这里',
    });
}

function renderSpriteSlotExpansion(charName, mood, url, moodGroups, icons) {
    const trimmedUrl = String(url || '').trim();
    const shownUrl = trimmedUrl.startsWith('igs-gen:') && typeof icons.resolveUrl === 'function'
        ? String(icons.resolveUrl(trimmedUrl) || '')
        : trimmedUrl;
    const thumb = shownUrl
        ? `<img class="igs-sprite-thumb" src="${esc(shownUrl)}" alt="${esc(mood)}" data-action="sprite-preview:${encSeg(shownUrl)}" onerror="this.classList.add('igs-sprite-thumb-broken')">`
        : `<div class="igs-sprite-thumb igs-sprite-thumb-empty">${trimmedUrl ? '等待载入' : '未配置'}</div>`;
    const group = moodGroups.find((g) => g && g.label === mood);
    if (!group) return `<div class="igs-sprite-slot-body">${thumb}</div>`;
    const words = Array.isArray(group.words) ? group.words : [];
    const tags = words.map((word) => {
        return `<span class="igs-mood-word-tag">${esc(word)}<button type="button" class="igs-mood-word-del" data-action="mood-remove-word:${encSeg(mood)}:${encSeg(word)}" title="删除词">×</button></span>`;
    }).join('');
    const wordsHtml = `<div class="igs-sprite-words"><div class="igs-mood-word-list">${tags || '<div class="igs-scene-empty">暂无情绪词</div>'}<button type="button" class="igs-btn-mgr-icon" data-action="mood-add-word:${encSeg(mood)}" title="添加词">+</button></div></div>`;
    return `<div class="igs-sprite-slot-body">${thumb}${wordsHtml}</div>`;
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


function heldGeneratedIds(value) {
    const ids = [];
    const walk = (node) => {
        if (typeof node === 'string' && node.startsWith('igs-gen:')) ids.push(node);
        else if (node && typeof node === 'object') for (const child of Object.values(node)) walk(child);
    };
    walk(value);
    return ids;
}

// 生成库里还没放进角色 / 场景的条目名（图都已经放进去的不算）。
function generatedLeftovers(library, characters, scenes) {
    const source = library && typeof library === 'object' ? library : {};
    const pending = (bucket, placedIn) => Object.entries(bucket && typeof bucket === 'object' ? bucket : {})
        .filter(([name, value]) => {
            const placed = new Set(heldGeneratedIds(placedIn && placedIn[name]));
            return !heldGeneratedIds(value).every((url) => placed.has(url));
        })
        .map(([name]) => name);
    return { sprites: pending(source.characters, characters), backgrounds: pending(source.scenes, scenes) };
}

// 「待确认」页签上的数字：刚生成的临时图 + 还没入库的生成素材。
export function countGeneratedWaiting({ library = {}, temp = [], characters = {}, scenes = {} } = {}) {
    const left = generatedLeftovers(library, characters, scenes);
    return (Array.isArray(temp) ? temp.length : 0) + left.sprites.length + left.backgrounds.length;
}

export function renderGeneratedAssetPane({ library = {}, temp = [], resolveUrl, characters = {}, scenes = {} } = {}) {
    // 修复抠图只给刚生成的立绘，背景不提供入口。
    const resolve = (url) => {
        const raw = String(url || '').trim();
        if (!raw) return '';
        try { return typeof resolveUrl === 'function' ? String(resolveUrl(raw) || '') : raw; }
        catch (error) { return ''; }
    };
    // 每张图一张同样大小的卡：方形图框（立绘完整放进去，背景铺满裁切），下面是名字、类型和「入库」，修复抠图、丢弃收进 ⋯。
    const tile = ({ url, name, type, status, adopt, adoptLabel, extra = [] }) => {
        const resolved = resolve(url);
        const img = resolved
            ? `<img class="igs-gen-tile-img" src="${esc(resolved)}" alt="${esc(name)}" data-action="sprite-preview:${encSeg(resolved)}" onerror="this.classList.add('igs-sprite-thumb-broken')">`
            : '<span class="igs-gen-tile-img igs-gen-tile-empty">等待载入</span>';
        return `<div class="igs-gen-tile${type === 'background' ? ' is-wide' : ''}">${img}`
            + `<div class="igs-gen-tile-meta"><b title="${esc(name)}">${esc(name)}</b><span>${type === 'background' ? '背景' : '立绘'} · ${esc(status)}</span></div>`
            + `<div class="igs-gen-tile-actions"><button type="button" class="igs-review-link is-primary" data-action="${adopt}"${adopt ? '' : ' disabled'}>${adoptLabel}</button>${renderRowMenu(extra, `「${name}」的操作`)}</div></div>`;
    };
    const matteItem = (imageId, type) => {
        const id = String(imageId || '').trim();
        return id && type === 'sprite' ? menuItem(`gen-matte-edit:${encSeg(id)}`, '修复抠图') : '';
    };
    const source = library && typeof library === 'object' ? library : {};
    const left = generatedLeftovers(source, characters, scenes);
    const leftoverRows = [];
    for (const name of left.sprites) {
        const value = source.characters[name];
        const raw = value && typeof value === 'object' ? String(value['默认'] || '') : '';
        const imageId = raw.startsWith('igs-gen:') ? raw.slice('igs-gen:'.length) : '';
        leftoverRows.push(tile({ url: raw, name, type: 'sprite', status: '还没进角色', adopt: `gen-adopt-sprite:${encSeg(name)}`, adoptLabel: '入库到角色', extra: [matteItem(imageId, 'sprite')] }));
    }
    for (const name of left.backgrounds) {
        const value = source.scenes[name];
        const raw = value && typeof value === 'object' ? String(value.url || '') : '';
        leftoverRows.push(tile({ url: raw, name, type: 'background', status: '还没进场景', adopt: `gen-file-scene:${encSeg(name)}`, adoptLabel: '入库到场景' }));
    }
    const tempRows = (Array.isArray(temp) ? temp : []).map((record) => {
        const item = record && typeof record === 'object' ? record : {};
        const key = String(item.key || '');
        const type = item.type === 'background' ? 'background' : 'sprite';
        return tile({
            url: item.url || (item.imageId ? `igs-gen:${item.imageId}` : ''),
            name: item.name || '未命名素材',
            type,
            status: item.status || '临时',
            adopt: key ? `gen-temp-accept:${encSeg(key)}` : '',
            adoptLabel: type === 'background' ? '入库到场景' : '入库到角色',
            extra: [matteItem(item.imageId, item.type), key ? menuItem(`gen-temp-discard:${encSeg(key)}`, '丢弃', ' is-danger') : ''],
        });
    }).join('');
    const count = (Array.isArray(temp) ? temp.length : 0) + leftoverRows.length;
    return renderReviewCard({
        key: 'generated',
        title: '刚生成的图',
        count,
        hint: '入库后进入场景或角色，这里不再留一份。',
        body: count ? `<div class="igs-gen-grid">${tempRows}${leftoverRows.join('')}</div>` : '',
        empty: '暂无刚生成的素材',
    });
}
