import { IMAGE_PROMPT_FORMATS, IMAGE_PROMPT_TASKS, PROMPT_DATA_FIELDS } from '../../presets/prompt-preset.js';
import { collapsible, perfItem } from './fx-settings-fields.js';
import { menuItem } from './settings-outfit-fields.js';
import { field as settingsField, segmentedInput } from './settings-fields.js';
import { blockTitle, dataFieldLabel, describeFailure, describeIssues, formatLabel, imagePromptStatusClass, imagePromptStatusText,
    moduleTitle, ROLE_LABELS, SLOT_LABELS, taskLabel } from './settings-image-prompt-labels.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const act = (verb, args = []) => `image-prompt:${verb}${args.map(v => ':' + encodeURIComponent(v)).join('')}`;
const button = (verb, label, args = [], { disabled = false, danger = false } = {}) => `<button type="button" class="igs-settings-action igs-settings-inline-action${danger ? ' is-danger' : ''}" data-action="${act(verb, args)}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
const note = text => `<div class="igs-source-filter-note">${esc(text)}</div>`;
const choices = (items, value) => items.map(item => {
    const [id, label] = Array.isArray(item) ? item : [item, item];
    return `<option value="${esc(id)}"${id === value ? ' selected' : ''}>${esc(label)}</option>`;
}).join('');
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const addr = (group, id, key) => JSON.stringify([group, id, key]);
const setAction = (address, on) => act('set', [address, on ? '1' : '0']);

// 文本框开头补一个换行：HTML 解析会吞掉 textarea 的第一个换行，不补会让以换行开头的正文被改写。
const textareaHtml = (attrs, value, rows) => `<textarea class="igs-image-prompt-text" ${attrs} rows="${rows}">\n${esc(value)}</textarea>`;
function field(state, group, id, key, label, value, type = 'text', items = []) {
    const address = addr(group, id, key);
    if (Object.hasOwn(state.rawFields, address)) value = state.rawFields[address];
    const attrs = `data-image-prompt-field="${esc(address)}" aria-label="${esc(label)}"`;
    const input = type === 'select' ? `<select ${attrs}>${choices(items, value)}</select>`
        : type === 'textarea' ? textareaHtml(attrs, value, 6)
            : type === 'textarea-small' ? textareaHtml(attrs, value, 4)
                : `<input ${attrs} type="text" value="${esc(value)}">`;
    return `<label class="igs-settings-field"><span>${esc(label)}</span>${input}</label>`
        + (state.errors[address] ? note(`${label}：${describeFailure(state.errors[address])}`) : '');
}
// 开关沿用设置器的 igs-switch；点击走动作并立即自动保存。
const switchHtml = (address, on, label) => `<button type="button" class="igs-switch${on ? ' is-on' : ''}" data-action="${setAction(address, !on)}" aria-pressed="${on ? 'true' : 'false'}"><i></i><span>${esc(label)}</span></button>`;
const pill = (address, on, label) => `<button type="button" class="igs-table-pick${on ? ' is-on' : ''}" data-action="${setAction(address, !on)}" aria-pressed="${on ? 'true' : 'false'}"><i></i><span>${esc(label)}</span></button>`;
const group = (key, open, title, count, body) => `<div class="igs-source-filter igs-perf-group"><details data-advanced="${esc(key)}"${open ? ' open' : ''}><summary><b>${esc(title)}</b>${count === '' ? '' : `<span class="igs-perf-count">${esc(count)}</span>`}</summary><div class="igs-perf-group-body">${open ? body() : ''}</div></details></div>`;

// 分场合附加规则：每个场合一个独立文本框，「添加场合规则」只列尚未存在的场合。
function occasionRules(state, kind, block, ui, allowAdd = true) {
    const rules = isObject(block.contentByFormat) ? block.contentByFormat : {};
    const pending = IMAGE_PROMPT_FORMATS.filter(fmt => !Object.hasOwn(rules, fmt) && state.pendingFormats?.[`${kind}|${block.identifier}|${fmt}`]);
    let html = '';
    // 每个场合一行折叠：场合名 + 正文首句 + ›，点开才渲染文本框与删除操作。
    for (const fmt of [...Object.keys(rules), ...pending]) {
        const key = `ip-occrow-${kind}-${block.identifier}-${fmt}`, label = formatLabel(fmt, Object.keys(rules));
        const body = () => field(state, kind, block.identifier, 'format:' + fmt, label, rules[fmt] ?? '', 'textarea-small')
            + `<div class="igs-image-prompt-actions">${button('format-remove', '删除此场合规则', [kind, block.identifier, fmt], { danger: true })}</div>`;
        html += perfItem(ui.more, key, `<span class="igs-image-prompt-row-name">${esc(label)}</span>`,
            { detail: ui.isOpen(key) ? body() : '-' });
    }
    const free = IMAGE_PROMPT_FORMATS.filter(fmt => !Object.hasOwn(rules, fmt) && !pending.includes(fmt));
    if (allowAdd && free.length) html += `<label class="igs-settings-field"><span>添加场合规则</span><select data-image-prompt-format-add="${esc(kind + '|' + block.identifier)}" aria-label="添加场合规则"><option value="">请选择场合</option>${choices(free.map(fmt => [fmt, formatLabel(fmt)]), '')}</select></label>`;
    return ui.collapsible(`ip-occ-${block.identifier}`, `分场合附加规则（${Object.keys(rules).length}）`, html);
}
const restorable = (state, kind, id) => Boolean(state.preset.data.defaultState?.baseline?.[kind]?.some?.(block => block.identifier === id));

function rangeTable(module) {
    const allowed = module.dataFields || [], required = module.requiredFields || [], id = module.identifier;
    let html = '<div class="igs-perf-item-subhead">资料范围</div>';
    for (const name of PROMPT_DATA_FIELDS) {
        html += `<div class="igs-image-prompt-range-row"><span>${esc(dataFieldLabel(name))}</span>`
            + pill(addr('modules', id, 'allow:' + name), allowed.includes(name), '允许')
            + pill(addr('modules', id, 'require:' + name), required.includes(name), '必填') + '</div>';
    }
    return html;
}

function versionBody(state, data, module, modules, used, ui) {
    const id = module.identifier, multi = modules.length > 1;
    let html = '';
    if (multi) html += `<div class="igs-perf-item-subhead">${esc(moduleTitle(data, module))}${module === used ? '（使用中）' : ''}</div>`;
    html += field(state, 'modules', id, 'content', '主规则', module.content, 'textarea');
    if (restorable(state, 'modules', id)) html += `<div class="igs-image-prompt-actions">${button('restore', '恢复默认', ['modules', id, 'baseline'])}</div>`;
    html += occasionRules(state, 'modules', module, ui);
    let adv = rangeTable(module) + `<div class="igs-image-prompt-actions">${button('module-copy', '复制为新版本', [id])}`
        + (multi && module !== used ? button('block-delete', '删除此版本', ['modules', id], { danger: true }) : '') + '</div>';
    html += ui.collapsible(`ip-adv-${id}`, '高级', adv);
    return html;
}

function taskRow(state, data, task, ui) {
    const modules = (data.modules || []).filter(module => module.task === task);
    const key = `ip-task-${task}`, open = ui.isOpen(key);
    if (!modules.length) return perfItem(ui.more, key, `<span class="igs-image-prompt-row-name">${esc(taskLabel(task))}</span>`, { hint: '暂无规则' });
    const used = modules.find(module => module.identifier === data.taskMap?.[task]) || modules[0];
    const body = () => {
        let html = modules.map(module => versionBody(state, data, module, modules, used, ui)).join('');
        if (modules.length > 1) html += ui.collapsible(`ip-version-${task}`, '高级',
            field(state, 'taskMap', '', task, '使用哪一版', data.taskMap?.[task] || '', 'select',
                [['', '未选择'], ...modules.map((module, i) => [module.identifier, `版本${i + 1}`])]));
        return html;
    };
    return perfItem(ui.more, key, `<span class="igs-image-prompt-row-name">${esc(taskLabel(task))}</span>`,
        { detail: open ? body() : '-' });
}

function ruleRow(state, data, block, sent, ui) {
    const id = block.identifier, key = `ip-rule-${id}`, open = ui.isOpen(key);
    const body = () => {
        let html = field(state, 'prompts', id, 'content', '正文', block.content, 'textarea');
        if (restorable(state, 'prompts', id)) html += `<div class="igs-image-prompt-actions">${button('restore', '恢复默认', ['prompts', id, 'baseline'])}</div>`;
        if (isObject(block.contentByFormat) || Object.keys(state.pendingFormats || {}).some(k => k.startsWith(`prompts|${id}|`)))
            html += occasionRules(state, 'prompts', block, ui, true);
        html += ui.collapsible(`ip-adv-prompts-${id}`, '高级',
            field(state, 'prompts', id, 'name', '段名', block.name || blockTitle(data, block))
            + field(state, 'prompts', id, 'role', '发送身份', block.role, 'select', Object.entries(ROLE_LABELS))
            + `<div class="igs-image-prompt-actions">${button('block-delete', '删除此段', ['prompts', id], { danger: true })}</div>`);
        return html;
    };
    return perfItem(ui.more, key, `<span class="igs-image-prompt-row-name">${esc(blockTitle(data, block))}</span>`,
        { hint: sent ? '' : '未发送', detail: open ? body() : '-' });
}

// 发送顺序与段落管理：普通段落带启用开关与上移/下移，两个插入位置标记只有上移/下移；新增、未发送段的加入也在这里。
function orderManager(state, data, ordered, unordered, ui) {
    const moves = (id, index) => `<span class="igs-image-prompt-order-btns">${button('move', '上移', [id, ordered[index - 1]?.block.identifier || ''], { disabled: index <= 0 })}${button('move', '下移', [id, ordered[index + 1]?.block.identifier || ''], { disabled: index === ordered.length - 1 })}</span>`;
    let html = '';
    html += ordered.map(({ block, entry }, index) => {
        const on = block.enabled !== false && entry.enabled !== false;
        // 插入位置标记固定存在：只能调整顺序，不渲染启用开关。
        const slot = Object.hasOwn(SLOT_LABELS, block.kind);
        const lead = slot ? `<span class="igs-image-prompt-row-name">${esc(SLOT_LABELS[block.kind])}</span>`
            : switchHtml(addr('prompts', block.identifier, 'enabledCombined'), on, blockTitle(data, block));
        return `<div class="igs-perf-item"><div class="igs-perf-item-head">${lead}${moves(block.identifier, index)}</div></div>`;
    }).join('');
    html += `<div class="igs-image-prompt-actions">${button('add', '新增一段通用规则', ['prompts'])}</div>`;
    if (unordered.length) {
        html += '<div class="igs-perf-item-subhead">未发送</div>';
        html += unordered.map(block => `<div class="igs-perf-item"><div class="igs-perf-item-head"><span class="igs-image-prompt-row-name">${esc(blockTitle(data, block))}</span>${button('include', '加入发送', [block.identifier])}</div></div>`).join('');
    }
    return ui.collapsible('ip-order', '发送顺序与段落管理', html);
}

function renderImport(state) {
    const preview = state.importPreview;
    let html = '<div class="igs-source-filter-title">导入预览</div>';
    for (const entry of preview.accepted || []) {
        const name = entry.manifest?.name || '未命名提示词组';
        html += note(`${name} · ${entry.activatable ? '可使用' : '内容未填完整，仅保存为草稿'}${entry.conflict ? ' · 与现有提示词组冲突' : ''}`);
        const issues = describeIssues(entry.issues, entry.manifest?.data);
        if (issues.length) html += note(issues.join('；'));
        if (entry.conflict) html += `<label class="igs-settings-field"><span>「${esc(name)}」冲突处理</span><select data-image-prompt-import-choice="${esc(entry.id)}">${choices([['skip', '跳过'], ['replace', '覆盖已有版本']], state.importChoices[entry.id] || 'skip')}</select></label>`;
    }
    for (const entry of [...(preview.rejected || []), ...(preview.skipped || [])])
        html += note(`${entry.id ? '提示词组 ' : ''}${describeFailure(entry)}`);
    if (!preview.ok) html += note(preview.reason ? describeFailure(preview) : '导入校验失败');
    return html + `<div class="igs-image-prompt-actions">${button('import-commit', '确认导入', [], { disabled: !preview.ok })}</div>`;
}

export function renderImagePromptPanel(editor, advancedOpen = {}) {
    const view = editor?.view();
    if (!view?.ok) return `<div class="igs-source-filter" data-image-prompt-panel>${note('写词预设读取不可用，未初始化或重置存量数据。')}<div class="igs-image-prompt-actions">${button('reload', '重新读取')}</div></div>`;
    const { state, items, currentId } = view;
    const isOpen = key => advancedOpen['perf-' + key] === true;
    const ui = { more: { isOpen }, isOpen, collapsible: (key, label, body) => collapsible(key, label, body, isOpen(key)) };
    const label = item => `${item.name || '未命名提示词组'}${item.id === currentId ? '（使用中）' : ''}${item.draftOnly ? ' · 仅草稿' : ''}`;
    if (state.preset && state.draftRevision !== null && !state.save) {
        const checked = view.activation;
        if (checked && !checked.ok) state.save = { kind: 'draft', messages: describeIssues(checked.errors, state.preset.data) };
    }
    const own = Boolean(state.preset);
    let head = '<div class="igs-source-filter"><div class="igs-source-filter-title">生图提示词组</div>';
    // 下拉一选中即设为使用中；复制与导入/导出/删除收在「更多」里。
    head += `<label class="igs-settings-field"><span>提示词组</span><select data-image-prompt-select aria-label="提示词组">${own ? '' : '<option value="">请选择</option>'}${choices(items.map(p => [p.id, label(p)]), state.preset?.id)}</select></label>`;
    head += `<div class="igs-image-prompt-actions igs-image-prompt-preset-actions">${button('new', '新建')}${button('rename', '重命名', [], { disabled: !own })}${button('reset', '恢复默认', [], { disabled: !own })}`
        + `<details class="igs-add-menu igs-image-prompt-more"><summary class="igs-settings-action igs-settings-inline-action" aria-label="更多">更多 ▾</summary><div class="igs-add-menu-list" role="menu">`
        + [menuItem(act('copy'), '复制'), menuItem(act('import'), '导入文件'), menuItem(act('import-text'), '从剪贴板导入'),
            menuItem(act('export'), '导出文件'), menuItem(act('delete'), '删除', ' is-danger')].join('') + '</div></details></div>';
    // 演绎档位、CG主体、补标签只在灵动方案下出现；缺省为现实、角色、关闭。
    if (state.preset?.data.spriteScheme === 'lively')
        head += settingsField('', '演绎', segmentedInput('', state.preset.data.performance === 'expressive' ? 'expressive' : 'subtle',
            [['subtle', '现实'], ['expressive', '夸张']], '演绎', { action: act('performance') }))
            + settingsField('', 'CG主体', segmentedInput('', state.preset.data.cgSubject === 'user' ? 'user' : 'character',
                [['character', '角色'], ['user', 'User']], 'CG主体', { action: act('cg-subject') }))
            + settingsField('', '补标签', segmentedInput('', state.preset.data.tagFill === true ? 'on' : 'off',
                [['off', '关闭'], ['on', '开启']], '补标签', { action: act('tag-fill') }));
    head += `<div class="igs-settings-result${imagePromptStatusClass(state) ? ' ' + imagePromptStatusClass(state) : ''}" data-image-prompt-status role="status">${esc(imagePromptStatusText(state))}</div>`;
    if (state.importPreview) head += renderImport(state);
    head += '</div>';
    if (!own) return `<div class="igs-settings-full igs-image-prompt-stack" data-image-prompt-panel>${head}</div>`;

    const data = state.preset.data;
    const ordered = (data.prompt_order || []).map(entry => ({ entry, block: data.prompts.find(b => b.identifier === entry.identifier) })).filter(row => row.block);
    const unordered = data.prompts.filter(b => !ordered.some(row => row.block.identifier === b.identifier));
    const shared = [...ordered.filter(row => !row.block.kind || row.block.kind === 'shared').map(row => ({ block: row.block, sent: true })),
        ...unordered.map(block => ({ block, sent: false }))];
    let html = `<div class="igs-settings-full igs-image-prompt-stack" data-image-prompt-panel>${head}`;
    html += group('image-prompt-group-tasks', advancedOpen['image-prompt-group-tasks'] !== false, '各任务规则', IMAGE_PROMPT_TASKS.length,
        () => IMAGE_PROMPT_TASKS.map(task => taskRow(state, data, task, ui)).join(''));
    html += group('image-prompt-group-rules', advancedOpen['image-prompt-group-rules'] === true, '通用规则', shared.length,
        () => shared.map(row => ruleRow(state, data, row.block, row.sent, ui)).join('') + orderManager(state, data, ordered, unordered, ui));
    return html + '</div>';
}
