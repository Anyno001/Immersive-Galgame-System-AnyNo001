import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresetRegistry } from '../src/presets/preset-registry.js';
import { createMemoryStorage } from '../src/storage/preset-store.js';
import { IMAGE_PROMPT_TASKS, IMAGE_PROMPT_FORMATS, PROMPT_DATA_FIELDS, validatePromptActivation } from '../src/presets/prompt-preset.js';
import { renderImagePromptPreset } from '../src/presets/prompt-preset-renderer.js';
import { createDefaultImagePromptPreset, IMAGE_PROMPT_DEFAULT_ID } from '../src/generated-images/image-prompt-defaults.js';
import { createImagePromptEditor, buildPreviewInput } from '../src/visual/igs-ui/settings-image-prompt-editor.js';
import { renderImagePromptPanel } from '../src/visual/igs-ui/settings-image-prompt-view.js';
import { handleImagePromptAction } from '../src/visual/igs-ui/settings-image-prompt-actions.js';
import { describeIssues, describeFailure, imagePromptStatusText } from '../src/visual/igs-ui/settings-image-prompt-labels.js';
import { editImagePromptField } from '../src/visual/igs-ui/settings-image-prompt-fields.js';

const TYPE = 'prompt-preset';
const clone = value => JSON.parse(JSON.stringify(value));
const addr = (group, id, key) => JSON.stringify([group, id, key]);
function setup() {
    const registry = createPresetRegistry({ storage: createMemoryStorage() });
    const editor = createImagePromptEditor(registry);
    assert.equal(editor.initialize().ok, true);
    return { registry, editor };
}
const withoutRevision = data => { const copy = clone(data); delete copy.revision; return copy; };
// 自定义预设：多版本模块、metadata、workbenchOnly、injection_*、未排序块、未知字段。
function customPreset() {
    const preset = createDefaultImagePromptPreset();
    preset.id = 'custom-roundtrip'; preset.name = '自建组';
    const data = preset.data;
    delete data.defaultState; delete data.defaultVersion;
    data.futureField = { keep: ['me'] };
    data.prompts[0].metadata = { note: '备注', nested: { a: 1 } };
    data.prompts[0].workbenchOnly = true;
    data.prompts[0].injection_order = 7;
    data.prompts[5].injection_position = 0; data.prompts[5].injection_depth = 0;
    data.prompts.push({ identifier: 'loose-block', name: '游离段', kind: 'shared', role: 'user', content: '游离正文 {{世界书}}', enabled: false,
        contentByFormat: { 'cg-plan': '游离格式规则' } });
    const second = clone(data.modules.find(m => m.task === 'sprite'));
    second.identifier = 'igs-task-sprite-alt'; second.content = '第二版精灵规则'; second.metadata = { v: 2 }; second.workbenchOnly = true;
    second.dataFields = ['outputs', 'description', 'lore']; second.requiredFields = ['outputs', 'description'];
    data.modules.push(second);
    data.modules[2].futureModuleField = 'x';
    return preset;
}
// 展开所有组、行与折叠项（折叠的内容不渲染）。
function openAllFor(data) {
    const open = { 'image-prompt-group-tasks': true, 'image-prompt-group-rules': true, 'image-prompt-group-preview': true, 'perf-ip-order': true };
    for (const task of IMAGE_PROMPT_TASKS) { open['perf-ip-task-' + task] = true; open['perf-ip-version-' + task] = true; }
    for (const m of data.modules) { open['perf-ip-occ-' + m.identifier] = true; open['perf-ip-adv-' + m.identifier] = true; }
    for (const b of data.prompts) { open['perf-ip-rule-' + b.identifier] = true; open['perf-ip-occ-' + b.identifier] = true; open['perf-ip-adv-prompts-' + b.identifier] = true; }
    return open;
}
const openAll = (editor) => openAllFor(editor.state.preset.data);
function messagesFor(data) {
    const out = {};
    for (const task of IMAGE_PROMPT_TASKS) {
        const module = data.modules.find(m => m.identifier === data.taskMap[task]);
        const formats = module.contentByFormat ? Object.keys(module.contentByFormat) : ['sprite-data'];
        for (const format of formats) {
            const result = renderImagePromptPreset(data, task, buildPreviewInput(data, task, format));
            assert.equal(result.ok, true, `${task}/${format} ${JSON.stringify(result)}`);
            out[`${task}/${format}`] = result.request.messages;
        }
    }
    return out;
}

test('往返：内置默认预设渲染后不改直接保存，数据深相等', () => {
    const { registry, editor } = setup();
    const before = registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID);
    const html = renderImagePromptPanel(editor, openAll(editor));
    assert.ok(html.includes('data-image-prompt-panel'));
    const sentBefore = messagesFor(before.data);
    assert.equal(editor.save().ok, true);
    const after = registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID);
    assert.equal(after.data.revision, before.data.revision + 1);
    assert.deepEqual(withoutRevision(after.data), withoutRevision(before.data));
    assert.deepEqual(messagesFor(after.data), sentBefore);
});

test('往返：自建预设（多版本模块/元数据/工作台/注入/未排序块/未知字段）渲染后保存深相等，发送逐字一致', () => {
    const { registry, editor } = setup();
    assert.equal(registry.savePromptPreset(customPreset(), null).ok, true);
    assert.equal(editor.select('custom-roundtrip').ok, true);
    const before = registry.get(TYPE, 'custom-roundtrip');
    const html = renderImagePromptPanel(editor, openAll(editor));
    assert.ok(html.includes('游离段'));
    assert.ok(html.includes('版本2'));
    assert.ok(html.includes('分场合附加规则'));
    const sentBefore = messagesFor(before.data);
    assert.equal(editor.save().ok, true);
    const after = registry.get(TYPE, 'custom-roundtrip');
    assert.deepEqual(withoutRevision(after.data), withoutRevision(before.data));
    assert.deepEqual(messagesFor(after.data), sentBefore);
    // 无改动时自动保存不写入
    assert.deepEqual(editor.autoSave(), { ok: true, changed: false });
});

test('发送一致：改后恢复原文，每个任务 x 每种格式的发送内容逐字相同', () => {
    const { registry, editor } = setup();
    const original = registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data;
    const sentBefore = messagesFor(original);
    const task = original.modules.find(m => m.task === 'cg');
    const fmt = 'cg-plan';
    const text = task.contentByFormat[fmt];
    assert.equal(editor.edit(addr('modules', task.identifier, 'format:' + fmt), '临时').ok, true);
    assert.equal(editor.autoSave().saved, true);
    assert.notDeepEqual(messagesFor(registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data), sentBefore);
    assert.equal(editor.edit(addr('modules', task.identifier, 'format:' + fmt), text).ok, true);
    assert.equal(editor.autoSave().saved, true);
    assert.deepEqual(messagesFor(registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data), sentBefore);
});

test('字段映射：改某格式文本框只改对应键，清空最后一格式删除字段', () => {
    const { editor } = setup();
    const data = editor.state.preset.data;
    const sprite = data.modules.find(m => m.task === 'sprite');
    const others = clone(sprite.contentByFormat);
    assert.equal(editor.edit(addr('modules', sprite.identifier, 'format:dna-template'), '新模板规则').ok, true);
    assert.equal(sprite.contentByFormat['dna-template'], '新模板规则');
    assert.equal(sprite.contentByFormat['sprite-data'], others['sprite-data']);
    assert.equal(sprite.contentByFormat['caption-slots'], others['caption-slots']);
    assert.deepEqual(Object.keys(sprite.contentByFormat), Object.keys(others));
    // 新增格式
    assert.equal(editor.edit(addr('modules', sprite.identifier, 'format:asset-plan'), '追加').ok, true);
    assert.equal(sprite.contentByFormat['asset-plan'], '追加');
    // 清空 = 删除键
    assert.equal(editor.edit(addr('modules', sprite.identifier, 'format:asset-plan'), '  ').ok, true);
    assert.equal(Object.hasOwn(sprite.contentByFormat, 'asset-plan'), false);
    // 清空最后一个格式 = 删除字段
    const item = data.modules.find(m => m.task === 'item');
    assert.deepEqual(Object.keys(item.contentByFormat), ['asset-plan']);
    editor.edit(addr('modules', item.identifier, 'format:asset-plan'), '');
    assert.equal(Object.hasOwn(item, 'contentByFormat'), false);
    // 非法格式地址不写入
    assert.equal(editor.edit(addr('modules', item.identifier, 'format:'), 'x').ok, false);
});

test('字段映射：资料范围勾选顺序与联动，未改动保持原样', () => {
    const { editor } = setup();
    const module = editor.state.preset.data.modules.find(m => m.task === 'dna');
    const allowed0 = [...module.dataFields], required0 = [...module.requiredFields];
    // 与现状一致的写入不改数组
    assert.equal(editor.edit(addr('modules', module.identifier, 'allow:lore'), true).ok, true);
    assert.deepEqual(module.dataFields, allowed0);
    // 取消允许：从两个数组中移除，并要求重绘
    editor.edit(addr('modules', module.identifier, 'require:outputs'), true);
    const result = editImagePromptField(editor.state, addr('modules', module.identifier, 'allow:outputs'), false);
    assert.equal(result.rerender, true);
    assert.equal(module.dataFields.includes('outputs'), false);
    assert.equal(module.requiredFields.includes('outputs'), false);
    // 必填联动允许，且按 PROMPT_DATA_FIELDS 顺序重排
    module.dataFields = ['outputs', 'description'];
    module.requiredFields = ['description'];
    const linked = editImagePromptField(editor.state, addr('modules', module.identifier, 'require:lore'), true);
    assert.equal(linked.rerender, true);
    assert.deepEqual(module.dataFields, ['description', 'lore', 'outputs']);
    assert.deepEqual(module.requiredFields, ['description', 'lore']);
    assert.deepEqual(required0, ['description', 'outputs']);
    assert.equal(editor.edit(addr('modules', module.identifier, 'allow:notAField'), true).ok, false);
    assert.ok(module.dataFields.every(name => PROMPT_DATA_FIELDS.includes(name)));
});

test('字段映射：合并后的启用开关读写', () => {
    const { editor } = setup();
    const data = editor.state.preset.data;
    const block = data.prompts.find(b => b.identifier === 'igs-image-submit');
    const entry = data.prompt_order.find(e => e.identifier === 'igs-image-submit');
    const address = addr('prompts', block.identifier, 'enabledCombined');
    const tag = () => renderImagePromptPanel(editor, openAll(editor)).match(/<button[^>]*igs-switch[^>]*>/g)
        .find(t => t.includes(encodeURIComponent(address)));
    assert.match(tag(), /is-on/);
    // 关闭：只设顺序项
    editor.edit(address, false);
    assert.equal(entry.enabled, false);
    assert.equal(block.enabled, true);
    assert.doesNotMatch(tag(), /is-on/);
    // 块被关闭、顺序项开启：显示为关；打开后两者都为 true
    entry.enabled = true; block.enabled = false;
    assert.doesNotMatch(tag(), /is-on/);
    editor.edit(address, true);
    assert.equal(block.enabled, true); assert.equal(entry.enabled, true);
    assert.match(tag(), /is-on/);
});

test('自动保存：可生效则写正式版本，否则只存草稿且正在使用的版本不变', () => {
    const { registry, editor } = setup();
    const id = IMAGE_PROMPT_DEFAULT_ID;
    const revision = registry.get(TYPE, id).data.revision;
    editor.edit(addr('modules', 'igs-task-background', 'content'), '新的背景规则');
    assert.equal(imagePromptStatusText(editor.state), '');
    assert.equal(editor.autoSave().saved, true);
    assert.equal(registry.get(TYPE, id).data.revision, revision + 1);
    assert.equal(registry.get(TYPE, id).data.modules.find(m => m.task === 'background').content, '新的背景规则');
    assert.equal(registry.getCurrent(TYPE).id, id);
    assert.match(imagePromptStatusText(editor.state), /^已自动保存 · \d\d:\d\d$/);
    // 清空必填的任务规则：只写草稿
    editor.edit(addr('modules', 'igs-task-background', 'content'), '');
    const draft = editor.autoSave();
    assert.equal(draft.ok, true); assert.equal(draft.draftOnly, true);
    assert.equal(registry.get(TYPE, id).data.modules.find(m => m.task === 'background').content, '新的背景规则');
    assert.ok(registry.getPromptDraft(id));
    assert.equal(editor.state.save.kind, 'draft');
    const text = imagePromptStatusText(editor.state);
    assert.match(text, /暂未生效/); assert.match(text, /背景/);
    assert.doesNotMatch(text, /[a-z]/);
    // 补全后再次自动保存：写正式版本并清掉草稿
    editor.edit(addr('modules', 'igs-task-background', 'content'), '补全后的背景规则');
    assert.equal(editor.autoSave().saved, true);
    assert.equal(registry.getPromptDraft(id), null);
});

test('自动保存：切换预设前冲刷；新建/重命名/复制不要求用户填 ID', async () => {
    const { registry, editor } = setup();
    const id = editor.newId();
    assert.match(id, /^igs-imagegen-[a-z0-9]{6}$/);
    assert.equal(editor.create(id, '我的组').ok, true);
    assert.equal(editor.state.preset.id, id);
    assert.equal(registry.get(TYPE, id).name, '我的组');
    assert.equal(editor.rename('改名后').ok, true);
    assert.equal(registry.get(TYPE, id).name, '改名后');
    editor.edit(addr('modules', 'igs-task-item', 'content'), '切换前的物品规则');
    assert.equal(editor.select(IMAGE_PROMPT_DEFAULT_ID).ok, true);
    assert.equal(registry.get(TYPE, id).data.modules.find(m => m.task === 'item').content, '切换前的物品规则');
    const copyId = editor.newId();
    assert.equal(editor.create(copyId, '副本', true).ok, true);
    assert.equal(registry.get(TYPE, copyId).data.modules.length, IMAGE_PROMPT_TASKS.length);
    // 新建的组不是使用中，下拉选中才切换并设为使用中
    assert.equal(registry.getCurrent(TYPE).id, IMAGE_PROMPT_DEFAULT_ID);
    const ctx = { editor, dialogs: {}, isCurrent: () => true, global: {} };
    assert.equal((await handleImagePromptAction(`image-prompt:select:${encodeURIComponent(IMAGE_PROMPT_DEFAULT_ID)}`, ctx)).ok, true);
    assert.equal((await handleImagePromptAction(`image-prompt:select:${encodeURIComponent(copyId)}`, ctx)).ok, true);
    assert.equal(registry.getCurrent(TYPE).id, copyId);
    assert.equal(editor.state.preset.id, copyId);
});

test('恢复默认先冲刷保存再恢复', () => {
    const { registry, editor } = setup();
    const baseline = registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data.modules.find(m => m.task === 'avatar').content;
    editor.edit(addr('modules', 'igs-task-avatar', 'content'), '改过的头像规则');
    const result = editor.restore('modules', 'igs-task-avatar');
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data.modules.find(m => m.task === 'avatar').content, baseline);
    assert.equal(editor.state.preset.data.modules.find(m => m.task === 'avatar').content, baseline);
    // 当前内容未填完整时不恢复
    editor.edit(addr('modules', 'igs-task-sprite', 'content'), '');
    assert.equal(editor.restore('modules', 'igs-task-avatar').reason, 'prompt-save-before-restore');
});

test('多版本：复制为新版本、不可删除使用中的版本、使用哪一版写 taskMap', () => {
    const { editor } = setup();
    const data = editor.state.preset.data;
    assert.equal(editor.blockAction('copy', 'modules', 'igs-task-cg').ok, true);
    const copy = data.modules.find(m => m.identifier === 'igs-task-cg-v2');
    assert.ok(copy);
    assert.equal(copy.content, data.modules.find(m => m.identifier === 'igs-task-cg').content);
    assert.equal(editor.blockAction('delete', 'modules', 'igs-task-cg').reason, 'module-in-use');
    editor.edit(addr('taskMap', '', 'cg'), 'igs-task-cg-v2');
    assert.equal(data.taskMap.cg, 'igs-task-cg-v2');
    assert.equal(editor.blockAction('delete', 'modules', 'igs-task-cg').ok, true);
    assert.equal(editor.autoSave().saved, true);
});

test('{{变量}} 原样显示与保存；以换行开头的正文不被吞', () => {
    const { registry, editor } = setup();
    const html = renderImagePromptPanel(editor, openAll(editor));
    assert.ok(html.includes('{{世界书}}'));
    // 两个插入位置只作为标记出现在「发送顺序与段落管理」里，不是可编辑正文
    assert.ok(html.includes('任务规则插入位置') && html.includes('本轮资料插入位置'));
    assert.equal(html.includes('{{任务提示词}}'), false);
    editor.edit(addr('modules', 'igs-task-sprite', 'content'), '\n  前导换行 {{世界书}} {{不存在}}');
    const shown = renderImagePromptPanel(editor, openAll(editor));
    assert.ok(shown.includes('aria-label="主规则" rows="6">\n\n  前导换行 {{世界书}} {{不存在}}</textarea>'));
    assert.equal(editor.autoSave().draftOnly, true);
    assert.equal(registry.getPromptDraft(IMAGE_PROMPT_DEFAULT_ID).preset.data.modules[0].content, '\n  前导换行 {{世界书}} {{不存在}}');
});

test('性能：折叠时视图不拷贝快照；激活校验按编辑版本缓存', () => {
    const { registry, editor } = setup();
    const calls = { snapshot: 0, list: 0, get: 0, getCurrent: 0 };
    for (const name of Object.keys(calls)) {
        const original = registry[name];
        registry[name] = (...args) => { calls[name] += 1; return original(...args); };
    }
    for (let i = 0; i < 3; i += 1) renderImagePromptPanel(editor, {});
    editor.view();
    assert.deepEqual(calls, { snapshot: 0, list: 0, get: 0, getCurrent: 0 });
    assert.equal(/<textarea/.test(renderImagePromptPanel(editor, {})), false, '行折叠时不渲染文本框');
    const folded = renderImagePromptPanel(editor, { 'image-prompt-group-tasks': false });
    assert.equal(folded.includes('igs-perf-item'), false, '组折叠时不渲染行');
    assert.ok(folded.includes('data-image-prompt-select'));
    const first = editor.view().activation;
    assert.equal(editor.view().activation, first);
    editor.edit(addr('modules', 'igs-task-item', 'content'), '变更');
    assert.notEqual(editor.view().activation, first);
});

test('界面无内部英文：渲染文本、选项、标签全是中文', () => {
    const { registry, editor } = setup();
    assert.equal(registry.savePromptPreset(customPreset(), null).ok, true);
    editor.select('custom-roundtrip');
    editor.state.previewTask = 'cg'; editor.state.previewFormat = 'cg-plan';
    assert.equal(editor.preview().ok, true);
    editor.state.importPreview = registry.previewPromptImport(JSON.stringify(registry.get(TYPE, 'custom-roundtrip')));
    const html = renderImagePromptPanel(editor, openAll(editor));
    assert.ok(html.includes('igs-image-prompt-result'));
    assert.ok(html.includes('分场合附加规则'));
    // 去掉用户正文（文本框、预览内容、行摘要），其余可见文字、选项、标签都不得含小写英文
    const visible = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<textarea[\s\S]*?<\/textarea>/g, '')
        .replace(/<div class="igs-settings-preview">[\s\S]*?<\/div>/g, '').replace(/<small class="igs-perf-item-hint">[\s\S]*?<\/small>/g, '');
    const attrs = [...visible.matchAll(/(?:aria-label|title|placeholder)="([^"]*)"/g)].map(m => m[1]).join(' ');
    const text = visible.replace(/<[^>]*>/g, ' ') + ' ' + attrs;
    const stripped = text.replace(/\{\{[^{}]*\}\}/g, '');
    assert.doesNotMatch(stripped, /[a-z]/, stripped.match(/\S*[a-z]\S*/g)?.slice(0, 8).join(' '));
    for (const word of [...IMAGE_PROMPT_TASKS, ...IMAGE_PROMPT_FORMATS, ...PROMPT_DATA_FIELDS, 'system', 'user', 'assistant', 'JSON', 'injection_', 'slot-count', '格式']) {
        assert.equal(stripped.includes(word), false, word);
    }
    for (const hidden of ['metadata', 'literalVariables', 'workbenchOnly', 'injection_position']) assert.equal(visible.includes(hidden), false, hidden);
    // 中文对照：英文与数字之间不加空格
    for (const label of ['Q版头像', '剧情CG', 'CG局部重绘']) assert.ok(html.includes(label), label);
});

test('版面：顶部「新建/重命名/恢复默认/更多」四按钮；各任务组默认展开 11 行；通用规则与预览默认折叠', () => {
    const { editor } = setup();
    const html = renderImagePromptPanel(editor, {});
    const top = html.slice(0, html.indexOf('igs-perf-group'));
    assert.equal(top.includes('data-action="image-prompt:activate"'), false, '不再有「使用」按钮，下拉选中即使用');
    for (const verb of ['new', 'rename', 'reset']) assert.ok(top.includes(`data-action="image-prompt:${verb}"`), verb);
    for (const label of ['新建', '重命名', '恢复默认']) assert.ok(top.includes(`>${label}</button>`), label);
    assert.ok(top.includes('>更多 ▾<'));
    for (const label of ['复制', '导入文件', '从剪贴板导入', '导出文件', '删除']) assert.ok(top.includes(`>${label}</button>`), label);
    assert.match(top, /is-danger" data-action="image-prompt:delete" role="menuitem"/);
    assert.equal((html.match(/igs-perf-item"/g) || []).length, IMAGE_PROMPT_TASKS.length);
    assert.match(html, /data-advanced="image-prompt-group-tasks" open/);
    assert.doesNotMatch(html, /data-advanced="image-prompt-group-rules" open/);
    assert.doesNotMatch(html, /data-advanced="image-prompt-group-preview" open/);
    assert.equal(/type="checkbox"/.test(renderImagePromptPanel(editor, openAll(editor))), false, '开关与胶囊不用原生复选框');
});

test('恢复默认框架：内置组按基线、自建组按内置默认；各任务x各场合发送与全新内置默认逐字一致', async () => {
    const { registry, editor } = setup();
    const fresh = messagesFor(createDefaultImagePromptPreset().data);
    // 内置组：大量改动后恢复
    editor.edit(addr('modules', 'igs-task-cg', 'content'), '乱改');
    editor.edit(addr('modules', 'igs-task-cg', 'format:cg-plan'), '乱改场合');
    editor.blockAction('copy', 'modules', 'igs-task-sprite');
    editor.blockAction('add', 'prompts', 'extra-rule', '额外');
    editor.edit(addr('modules', 'igs-task-dna', 'allow:lore'), false);
    assert.equal(editor.autoSave().saved, true);
    const before = registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID);
    assert.notDeepEqual(messagesFor(before.data), fresh);
    const dialogs = { confirm: async message => { dialogs.asked = message; return true; }, prompt: async () => 'x', edit: async () => '' };
    const ctx = { editor, dialogs, isCurrent: () => true, global: {} };
    assert.equal((await handleImagePromptAction('image-prompt:reset', ctx)).ok, true);
    assert.equal(dialogs.asked, '当前提示词组的全部内容将替换为内置默认，名称保持不变。如需保留现有内容，请先复制一份。');
    const restored = registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID);
    assert.equal(restored.name, before.name); assert.equal(restored.id, before.id);
    assert.deepEqual(messagesFor(restored.data), fresh);
    assert.deepEqual(withoutRevision(restored.data), withoutRevision(createDefaultImagePromptPreset().data));
    // 自建组（复制出来的，无基线）：恢复后与全新内置默认一致，名称保持
    const copyId = editor.newId();
    assert.equal(editor.create(copyId, '我的组', true).ok, true);
    editor.edit(addr('modules', 'igs-task-item', 'content'), '又乱改');
    assert.equal(editor.autoSave().saved, true);
    assert.equal(editor.restoreFramework().saved, true);
    const mine = registry.get(TYPE, copyId);
    assert.equal(mine.name, '我的组');
    assert.deepEqual(messagesFor(mine.data), fresh);
    assert.equal(Object.hasOwn(mine.data, 'defaultState'), false);
});

test('开关与胶囊动作：set 写入后立即自动保存', async () => {
    const { registry, editor } = setup();
    const ctx = { editor, dialogs: { confirm: async () => true }, isCurrent: () => true, global: {} };
    const address = addr('prompts', 'igs-image-submit', 'enabledCombined');
    const revision = registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data.revision;
    const result = await handleImagePromptAction(`image-prompt:set:${encodeURIComponent(address)}:0`, ctx);
    assert.equal(result.ok, true);
    const saved = registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data;
    assert.equal(saved.revision, revision + 1);
    assert.equal(saved.prompt_order.find(e => e.identifier === 'igs-image-submit').enabled, false);
    const pill = encodeURIComponent(addr('modules', 'igs-task-dna', 'require:lore'));
    assert.equal((await handleImagePromptAction(`image-prompt:set:${pill}:1`, ctx)).ok, true);
    const dna = registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data.modules.find(m => m.task === 'dna');
    assert.ok(dna.requiredFields.includes('lore') && dna.dataFields.includes('lore'));
});

test('校验错误码全部翻成中文句子并带中文定位', () => {
    const broken = [];
    const make = mutate => { const preset = createDefaultImagePromptPreset(); mutate(preset.data); return preset.data; };
    broken.push(make(d => { d.prompts = d.prompts.filter(b => b.kind !== 'task-slot'); d.prompt_order = d.prompt_order.filter(e => e.identifier !== 'igs-image-task'); }));
    broken.push(make(d => { d.modules[0].content = ''; d.modules[1].dataFields = ['nope']; d.modules[2].requiredFields = ['lore']; d.modules[2].dataFields = ['outputs']; }));
    broken.push(make(d => { d.taskMap.sprite = 'ghost'; d.prompts[0].content = '{{陌生变量}}'; d.prompts[0].injection_position = 1; d.prompts[0].extra = 1; }));
    broken.push(make(d => { d.prompts[3].content = 'x'; d.modules[3].role = 'user'; d.modules[4].contentByFormat = { 'bad-format': '' }; d.prompts[0].contentByFormat = { 'cg-plan': '{{任务提示词}}' }; }));
    broken.push(make(d => { d.prompts[0].role = 'robot'; d.prompt_order.push({ identifier: 'ghost' }); d.taskMap.zzz = 'igs-task-sprite'; delete d.taskMap.cg; }));
    const sentences = [];
    for (const data of broken) {
        const result = validatePromptActivation(data);
        assert.equal(result.ok, false);
        sentences.push(...describeIssues(result.errors, data));
    }
    assert.ok(sentences.length >= 8);
    for (const sentence of sentences) {
        assert.doesNotMatch(sentence.replace(/\{\{[^{}]*\}\}/g, ''), /[a-z]/, sentence);
        assert.ok(!sentence.includes('未识别的问题'), sentence);
    }
    assert.ok(sentences.some(s => s.includes('「默认立绘」')));
    assert.match(describeFailure({ reason: 'prompt-not-activatable', errors: [{ field: 'task-slot', reason: 'slot-count' }] }), /任务规则插入位置/);
    assert.doesNotMatch(describeFailure({ reason: 'something-new' }), /[a-z]/);
});

// ---- 返工新增 ----
import { readFileSync } from 'node:fs';
import { labelOf, formatLabel } from '../src/visual/igs-ui/settings-image-prompt-labels.js';
const golden = () => JSON.parse(readFileSync(new URL('./fixtures/image-prompt-default-messages.json', import.meta.url), 'utf8')).messages;

test('黄金样本：往返、改后恢复、恢复默认框架后发送内容都与固定文件逐字一致', async () => {
    const expected = golden();
    const { registry, editor } = setup();
    assert.deepEqual(messagesFor(registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data), expected);
    assert.equal(editor.save().ok, true);
    assert.deepEqual(messagesFor(registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data), expected);
    editor.edit(addr('modules', 'igs-task-cg', 'content'), '乱改');
    assert.equal(editor.autoSave().saved, true);
    assert.notDeepEqual(messagesFor(registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data), expected);
    assert.equal(editor.restoreFramework().saved, true);
    assert.deepEqual(messagesFor(registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data), expected);
});

test('发送顺序里的插入位置标记没有启用开关，普通段落有', () => {
    const { editor } = setup();
    const html = renderImagePromptPanel(editor, openAll(editor));
    const order = html.slice(html.indexOf('发送顺序与段落管理'));
    const slotRow = label => order.match(new RegExp(`<div class="igs-perf-item"><div class="igs-perf-item-head">(?:(?!igs-perf-item">).)*?${label}.*?</div></div>`))[0];
    for (const label of ['任务规则插入位置', '本轮资料插入位置']) {
        assert.doesNotMatch(slotRow(label), /igs-switch/);
        assert.match(slotRow(label), /image-prompt:move/);
    }
    assert.match(slotRow('总规则'), /igs-switch/);
});

test('文案：汉字与英文数字之间不加空格；未知键不露出内部名', () => {
    const { registry, editor } = setup();
    assert.equal(registry.savePromptPreset(customPreset(), null).ok, true);
    editor.select('custom-roundtrip');
    editor.preview();
    const html = renderImagePromptPanel(editor, openAll(editor));
    const visible = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<textarea[\s\S]*?<\/textarea>/g, '')
        .replace(/<div class="igs-settings-preview">[\s\S]*?<\/div>/g, '').replace(/<small class="igs-perf-item-hint">[\s\S]*?<\/small>/g, '')
        .replace(/IGS 内置生图框架/g, '');
    const attrs = [...visible.matchAll(/(?:aria-label|title)="([^"]*)"/g)].map(m => m[1]).join(' ');
    const text = (visible.replace(/<[^>]*>/g, ' ') + ' ' + attrs).replace(/\{\{[^{}]*\}\}/g, '').replace(/\s*\|\s*/g, '|');
    assert.doesNotMatch(text.replace(/\s{2,}/g, '|'), /[\u4e00-\u9fa5] [A-Za-z0-9]|[A-Za-z0-9] [\u4e00-\u9fa5]/);
    // 所有中文对照与错误文案同样检查
    const mod = readFileSync(new URL('../src/visual/igs-ui/settings-image-prompt-labels.js', import.meta.url), 'utf8');
    const literals = [...mod.matchAll(/'([^'\n]*[\u4e00-\u9fa5][^'\n]*)'/g)].map(m => m[1]);
    for (const text of literals) assert.doesNotMatch(text.replace(/\$\{[^}]*\}|\{\{[^{}]*\}\}/g, ''), /[\u4e00-\u9fa5] [A-Za-z0-9]|[A-Za-z0-9] [\u4e00-\u9fa5]/, text);
    assert.equal(formatLabel('weird-one'), '其他场合');
    assert.equal(formatLabel('weird-two', ['weird-one', 'weird-two']), '其他场合2');
    assert.equal(labelOf({}, 'x', '字段'), '其他字段');
});

test('结构性操作成功后自动保存，状态行显示已保存', async () => {
    const { registry, editor } = setup();
    const ctx = { editor, dialogs: { confirm: async () => true, prompt: async () => '新增段' }, isCurrent: () => true, global: {} };
    const revision = () => registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data.revision;
    let before = revision();
    assert.equal((await handleImagePromptAction('image-prompt:add:prompts', ctx)).ok, true);
    assert.equal(revision(), before + 1);
    assert.match(imagePromptStatusText(editor.state), /^已自动保存/);
    before = revision();
    assert.equal((await handleImagePromptAction('image-prompt:move:igs-image-submit:igs-image-protocol', ctx)).ok, true);
    assert.equal(revision(), before + 1);
    before = revision();
    assert.equal((await handleImagePromptAction('image-prompt:module-copy:igs-task-cg', ctx)).ok, true);
    assert.equal(revision(), before + 1);
    assert.ok(registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data.modules.some(m => m.identifier === 'igs-task-cg-v2'));
    // 连续保存后版本号仍然正确（不整份重新读取）
    editor.edit(addr('modules', 'igs-task-item', 'content'), 'a'); assert.equal(editor.autoSave().saved, true);
    editor.edit(addr('modules', 'igs-task-item', 'content'), 'b'); assert.equal(editor.autoSave().saved, true);
    assert.equal(editor.state.baseRevision, revision());
    assert.equal(editor.state.dirty, false);
});

test('恢复默认框架：有 defaultState 无基线时保留 defaultState', () => {
    const { registry, editor } = setup();
    const id = editor.newId();
    assert.equal(editor.create(id, '组', true).ok, true);
    editor.state.preset.data.defaultState = { version: 3, backups: [] };
    editor.state.dirty = true; editor.state.editRevision += 1;
    assert.equal(editor.restoreFramework().ok, true);
    assert.deepEqual(registry.get(TYPE, id).data.defaultState, { version: 3, backups: [] });
});

test('按钮行首项为新建；提示词文本框带正文字体 class', () => {
    const { editor } = setup();
    const html = renderImagePromptPanel(editor, openAll(editor));
    assert.ok(html.indexOf('image-prompt:new"') > 0 && html.indexOf('image-prompt:new"') < html.indexOf('image-prompt:rename"'));
    assert.ok(/<textarea class="igs-image-prompt-text"/.test(html));
});

// ---- 附加写词要求精简 ----
import { normalizeAutoIllustrationSettings } from '../src/generated-images/illustration/auto-illustration-settings.js';
test('附加写词：旧存档的四项被容忍但不再产出；界面只剩头部、尾部附加词', () => {
    const normalized = normalizeAutoIllustrationSettings({ llm: { prompts: { illustration: '旧', asset: '旧' }, jailbreakHead: '头', jailbreakTail: '尾' } });
    assert.equal(Object.hasOwn(normalized.llm, 'prompts'), false);
    assert.equal(normalized.llm.jailbreakHead, '头'); assert.equal(normalized.llm.jailbreakTail, '尾');
    assert.doesNotThrow(() => normalizeAutoIllustrationSettings({ llm: { prompts: 5 } }));
    const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
    const tabs = read('../src/visual/igs-ui/settings-tabs.js'), constants = read('../src/visual/igs-ui/reader-host-constants.js');
    assert.doesNotMatch(tabs, /autoLlmPrompt(?:Illustration|Asset)|附加写词要求/);
    assert.match(tabs, /<summary><b>附加词<\/b><\/summary>/);
    assert.doesNotMatch(constants, /llm\.prompts\./);
    for (const file of ['auto-illustration-service.js', 'asset-generation-service.js'])
        assert.doesNotMatch(read('../src/generated-images/illustration/' + file), /llm\.prompts|DEFAULT_LLM_PROMPTS|用户写词要求/);
});

test('提示词组面板不含机制说明文字', () => {
    const { editor } = setup();
    editor.preview();
    const html = renderImagePromptPanel(editor, openAll(editor)).replace(/<div class="igs-settings-preview">[\s\S]*?<\/div>/g, '');
    for (const text of ['一并发送', '程序自动生成', '导入不会自动使用', '允许：可向', '按从上到下']) assert.equal(html.includes(text), false, text);
});

test('分场合附加规则：每个场合一行折叠，点开才渲染文本框，可删除', async () => {
    const { registry, editor } = setup();
    const open = { 'perf-ip-task-sprite': true, 'perf-ip-occ-igs-task-sprite': true };
    const key = 'perf-ip-occrow-modules-igs-task-sprite-dna-template';
    const field = '"format:dna-template"';
    const closed = renderImagePromptPanel(editor, open);
    assert.ok(closed.includes(encodeURIComponent(key.replace('perf-', 'perf-'))) || closed.includes('ui-toggle-open'));
    assert.equal(closed.includes('format:dna-template'), false, '未展开不渲染场合文本框');
    assert.ok(closed.includes('按角色模板出图时'));
    const opened = renderImagePromptPanel(editor, { ...open, [key]: true });
    assert.ok(opened.includes('format:dna-template'));
    assert.equal(opened.includes('format:sprite-data'), false);
    const ctx = { editor, dialogs: { confirm: async () => true }, isCurrent: () => true, global: {} };
    assert.equal((await handleImagePromptAction('image-prompt:format-remove:modules:igs-task-sprite:dna-template', ctx)).ok, true);
    const sprite = registry.get(TYPE, IMAGE_PROMPT_DEFAULT_ID).data.modules.find(m => m.task === 'sprite');
    assert.equal(Object.hasOwn(sprite.contentByFormat, 'dna-template'), false);
    assert.ok(field);
});
