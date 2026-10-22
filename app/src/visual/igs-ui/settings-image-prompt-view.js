import { IMAGE_PROMPT_TASKS, PROMPT_DATA_FIELDS } from '../../presets/prompt-preset.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const action = (verb, label, args = [], disabled = false) => `<button type="button" class="igs-settings-action" data-action="image-prompt:${verb}${args.map(v => ':' + encodeURIComponent(v)).join('')}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
const MORE_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
// 次要操作收进 ⋯：与「角色」「情绪」页的行菜单同一套样式与关闭逻辑。
const menuItem = (verb, label, args = [], disabled = false) => `<button type="button" class="igs-add-menu-item" role="menuitem" data-action="image-prompt:${verb}${args.map(v => ':' + encodeURIComponent(v)).join('')}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
const moreMenu = items => `<details class="igs-add-menu igs-row-menu"><summary class="igs-btn-mgr-icon" title="更多操作" aria-label="更多操作">${MORE_SVG}</summary><div class="igs-add-menu-list" role="menu">${items.join('')}</div></details>`;
const note = text => `<div class="igs-source-filter-note">${esc(text)}</div>`;
const choices = (items, value) => items.map(item => {
    const [id, label] = Array.isArray(item) ? item : [item, item];
    return `<option value="${esc(id)}"${id === value ? ' selected' : ''}>${esc(label)}</option>`;
}).join('');

function field(state, group, id, key, label, value, type = 'text', items = []) {
    const address = JSON.stringify([group, id, key]);
    if (Object.hasOwn(state.rawFields, address)) value = state.rawFields[address];
    const attrs = `data-image-prompt-field="${esc(address)}" aria-label="${esc(label)}"`;
    const input = type === 'select' ? `<select ${attrs}>${choices(items, value)}</select>`
        : type === 'boolean' ? `<input type="checkbox" ${attrs}${value !== false ? ' checked' : ''}>`
            : type === 'textarea' || type === 'json' ? `<textarea ${attrs} rows="${type === 'json' ? 3 : 8}">${esc(type === 'json' && typeof value !== 'string' ? JSON.stringify(value, null, 2) : value)}</textarea>`
                : `<input ${attrs} type="${type}" value="${esc(value)}">`;
    return `<label class="igs-settings-field"><span>${esc(label)}</span>${input}</label>`
        + (state.errors[address] ? note(`${label}：${state.errors[address].reason}`) : '');
}
const roles = ['system', 'user', 'assistant'];
const kinds = [['shared', '共享框架'], ['task-slot', '任务槽'], ['data-slot', '资料槽']];

export function renderImagePromptPanel(editor, advancedOpen = {}) {
    const view = editor?.view();
    if (!view?.ok) return `<div class="igs-source-filter" data-image-prompt-panel>${note('写词预设读取不可用，未初始化或重置存量数据。')}${action('reload', '重新读取')}</div>`;
    const { state, items, current, saved, activation } = view;
    let html = `<div class="igs-source-filter igs-settings-full" data-image-prompt-panel><div class="igs-source-filter-title">生图提示词组</div>`;
    html += note(`当前生效：${current?.name || '未选择'}`);
    // 编辑器是少数人用的进阶功能：整块收进一层折叠，首屏只露当前生效的预设。
    html += `<details class="igs-settings-sub igs-settings-advanced" data-advanced="image-prompt-editor"${advancedOpen['image-prompt-editor'] === true ? ' open' : ''}><summary>编辑提示词组</summary>`;

    html += `<label class="igs-settings-field"><span>编辑预设</span><select data-image-prompt-select aria-label="编辑预设"><option value="">请选择</option>${choices(items.map(p => [p.id, `${p.name || p.id}${p.draftOnly ? ' · 仅草稿' : ''}`]), state.preset?.id)}</select></label>`;
    html += `<div class="igs-image-prompt-actions">${action('new', '新建')}${moreMenu([menuItem('copy', '复制', [], !state.preset), menuItem('import', '导入JSON'), menuItem('import-text', '粘贴JSON'), menuItem('export', '导出保存版本', [], !saved), menuItem('reload', '重新读取')])}</div>`;
    html += `<div data-image-prompt-status role="status">${esc(state.status)}</div>`;
    if (state.preset) {
        const p = state.preset, data = p.data;
        html += note(`编辑：${p.id} · 保存版本：${saved ? 'r' + saved.data.revision : '尚未保存'} · 草稿：${state.draftRevision === null ? '未存档' : 'd' + state.draftRevision}${state.dirty ? ' · 有未存档修改' : ''} · 来源版本：${state.baseRevision ?? '新建'}`);
        html += field(state, 'preset', '', 'name', '名称', p.name);
        html += `<div class="igs-image-prompt-actions">${action('save', '保存版本')}${action('activate', '启用', [], state.dirty || state.draftRevision !== null || !saved)}${moreMenu([menuItem('draft', '存档草稿'), menuItem('discard', '放弃草稿'), menuItem('delete', '删除预设')])}</div>`;
        if (!activation?.ok) html += note('尚不可激活：' + (activation?.errors || []).map(e => `${e.field}：${e.reason}`).join('；'));
        const ordered = (data.prompt_order || []).map(entry => ({ entry, block: data.prompts.find(b => b.identifier === entry.identifier) })).filter(row => row.block);
        const unordered = data.prompts.filter(b => !ordered.some(row => row.block.identifier === b.identifier));
        html += `<div class="igs-source-filter-title">共享框架与中间槽</div>${action('add', '新增提示块', ['prompts'])}`;
        html += ordered.map(({ block, entry }, index) => renderBlock(state, 'prompts', block, advancedOpen, entry, ordered, index)).join('');
        html += unordered.map(block => renderBlock(state, 'prompts', block, advancedOpen)).join('');
        html += `<div class="igs-source-filter-title">任务模块</div>${action('add', '新增任务模块', ['modules'])}`;
        html += (data.modules || []).map(block => renderBlock(state, 'modules', block, advancedOpen)).join('');

        html += `<div class="igs-source-filter-title">显式任务映射</div>`;
        for (const task of IMAGE_PROMPT_TASKS) html += field(state, 'taskMap', '', task, task,
            data.taskMap?.[task] || '', 'select', [['', '未映射'], ...(data.modules || []).map(m => [m.identifier, `${m.identifier} · ${m.task}`])]);
        html += note(`可用资料字段：${PROMPT_DATA_FIELDS.join('、')}`);
        html += field(state, 'data', '', 'variables', '声明变量（JSON 数组）', data.variables || [], 'json');
        html += field(state, 'data', '', 'literalVariables', '保留字面变量（JSON 数组）', data.literalVariables || [], 'json');
        html += `<label class="igs-settings-field"><span>本地预览任务</span><select data-image-prompt-preview-task>${choices(IMAGE_PROMPT_TASKS, state.previewTask)}</select></label>`;
        html += `<label class="igs-settings-field"><span>本地预览资料（JSON，不联网）</span><textarea data-image-prompt-preview-input rows="6">${esc(state.previewInput)}</textarea></label>${action('preview', '装配预览')}`;
        if (state.preview) html += `<pre class="igs-settings-result" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(state.preview.ok ? state.preview.request.messages : state.preview, null, 2))}</pre>`;
    }
    if (state.importPreview) {
        const preview = state.importPreview;
        html += `<div class="igs-source-filter-title">导入预览</div>`;
        html += note('导入不会自动启用；同ID默认跳过。');
        for (const entry of preview.accepted || []) {
            html += note(`${entry.id} · ${entry.activatable ? '可激活' : '仅存档'}${entry.conflict ? ' · 同 ID 冲突' : ''}`);
            html += note((entry.issues || []).map(e => `${e.field}：${e.reason}`).join('；'));
            if (entry.conflict) html += `<label class="igs-settings-field"><span>${esc(entry.id)} 冲突处理</span><select data-image-prompt-import-choice="${esc(entry.id)}">${choices([['skip', '跳过'], ['replace', '覆盖保存版本']], state.importChoices[entry.id] || 'skip')}</select></label>`;
        }
        for (const entry of [...(preview.rejected || []), ...(preview.skipped || [])]) html += note(`${entry.id || '未知项'}：${entry.reason}`);
        if (!preview.ok) html += note(preview.reason || '导入校验失败');
        html += action('import-commit', '确认导入', [], !preview.ok);
    }
    return html + '</details></div>';
}

function renderBlock(state, group, block, advancedOpen, entry, ordered = [], index = -1) {
    const id = block.identifier, module = group === 'modules';
    const key = 'image-prompt-' + group + '-' + id;
    let html = `<details data-advanced="${esc(key)}" class="igs-settings-full igs-settings-advanced"${advancedOpen[key] === true ? ' open' : ''}><summary>${esc(block.name || id)} · ${esc(module ? block.task : block.kind || '未映射')} · ${esc(block.role)}</summary><div class="igs-perf-group-body">`;
    html += note(`稳定 ID：${id}`);
    if (!module) html += field(state, group, id, 'name', '块名称', block.name || id);
    html += field(state, group, id, 'role', '消息角色', block.role, 'select', roles);
    html += field(state, group, id, 'enabled', '启用此块', block.enabled, 'boolean');
    html += field(state, group, id, module ? 'task' : 'kind', module ? '任务用途' : '块用途', module ? block.task : block.kind || '', 'select', module ? IMAGE_PROMPT_TASKS : [['', '未映射'], ...kinds]);
    html += field(state, group, id, 'content', module ? '任务正文' : '提示块正文', block.content, 'textarea');
    if (module || block.kind === 'shared') {
        html += field(state, group, id, 'contentByFormat', '分格式规则（JSON 对象，留空仅用正文）',
            block.contentByFormat === undefined ? '' : block.contentByFormat, 'json');
    }
    if (module) {
        html += field(state, group, id, 'dataFields', '允许资料字段（JSON 数组）', block.dataFields || [], 'json');
        html += field(state, group, id, 'requiredFields', '必填资料字段（JSON 数组）', block.requiredFields || [], 'json');
    } else {
        html += field(state, group, id, 'workbenchOnly', '工作台标记（存档元数据）', block.workbenchOnly === true, 'boolean');
        for (const key of ['injection_position', 'injection_depth', 'injection_order']) html += field(state, group, id, key, key, block[key] ?? 0, 'number');
        if (entry) {
            html += `<label class="igs-settings-field"><span>启用顺序项</span><input type="checkbox" data-image-prompt-order-enabled="${esc(id)}"${entry.enabled !== false ? ' checked' : ''}></label>`;
            html += action('move', '上移', [id, ordered[index - 1]?.block.identifier || ''], index === 0);
            html += action('move', '下移', [id, ordered[index + 1]?.block.identifier || ''], index === ordered.length - 1);
        } else html += action('include', '加入声明顺序', [id]);
    }
    html += field(state, group, id, 'metadata', '元数据（JSON）', block.metadata || {}, 'json');
    html += action('block-delete', '删除此块', [group, id]);
    if (state.preset.data.defaultState) {
        html += action('restore', '恢复默认正文', [group, id, 'baseline']);
        for (const backup of state.preset.data.defaultState.backups || []) html += action('restore', `恢复 r${backup.revision} 正文`, [group, id, String(backup.revision)]);
    }
    return html + '</div></details>';
}
