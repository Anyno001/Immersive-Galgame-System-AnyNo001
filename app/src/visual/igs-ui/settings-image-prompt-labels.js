// 生图提示词组界面用的中文名对照与错误翻译：界面、状态行、错误提示统一从这里取。
// 只服务显示；提示词正文、数据结构与校验语义不在此处。

export const TASK_LABELS = Object.freeze({
    sprite: '默认立绘', dna: '外貌资料', expression: '表情差分', avatar: 'Q版头像', wardrobe: '衣柜服装',
    outfit: '换装差分', background: '背景', item: '物品图标', cg: '剧情CG', consistency: 'CG局部重绘',
    creature: '非人角色立绘',
});
// 输出格式在界面上叫「场合」：对应规则仅在该场合与主规则一并发送。
export const FORMAT_LABELS = Object.freeze({
    'sprite-data': '登记角色资料时', 'expression-fragments': '编写表情差分时', 'dna-template': '按角色模板出图时',
    'caption-slots': '直接撰写画面提示词时', 'asset-plan': '规划素材清单时', 'cg-plan': '规划剧情CG时',
});
export const DATA_FIELD_LABELS = Object.freeze({
    description: '任务说明', promptTask: '任务参数', characterContext: '角色资料', outfitCatalog: '衣柜清单',
    userPrompts: '用户补充词', writingRequirements: '写作要求', numberedText: '编号正文', previousText: '前文',
    lore: '世界设定', characters: '角色名单', scenes: '场景列表', originalPrompt: '原提示词', layout: '构图',
    outputs: '输出要求',
});
export const ROLE_LABELS = Object.freeze({ system: '系统', user: '用户', assistant: '助手' });
// 内置预设中各通用段的显示名；用户自建段使用自己填写的名称。
export const BLOCK_LABELS = Object.freeze({
    'igs-image-framework': '总规则', 'igs-image-task': '任务规则插入位置', 'igs-image-world': '世界书参考',
    'igs-image-data': '本轮资料插入位置', 'igs-image-protocol': '输出协议', 'igs-image-submit': '交付要求',
});
export const SLOT_LABELS = Object.freeze({ 'task-slot': '任务规则插入位置', 'data-slot': '本轮资料插入位置' });

// 未知键不露出内部名：显示「其他场合」等；同一批键里有多个未知项时加序号（其他场合2）。
export function labelOf(table, key, noun = '项', siblings = []) {
    if (typeof key === 'string' && Object.hasOwn(table, key)) return table[key];
    const unknown = [...new Set([...siblings, key])].filter(item => !Object.hasOwn(table, item));
    return unknown.length > 1 ? `其他${noun}${unknown.indexOf(key) + 1}` : `其他${noun}`;
}
export const taskLabel = (key, siblings) => labelOf(TASK_LABELS, key, '任务', siblings);
export const formatLabel = (key, siblings) => labelOf(FORMAT_LABELS, key, '场合', siblings);
export const dataFieldLabel = (key, siblings) => labelOf(DATA_FIELD_LABELS, key, '字段', siblings);
export const roleLabel = (key, siblings) => labelOf(ROLE_LABELS, key, '身份', siblings);

// 同一任务有多个模块时的版本标题（按模块在预设中的先后编号）。
export function moduleTitle(data, module) {
    const same = (data?.modules || []).filter(item => item.task === module.task);
    const base = taskLabel(module.task);
    return same.length > 1 ? `${base} · 版本${same.indexOf(module) + 1}` : base;
}
export function blockTitle(data, block) {
    if (typeof block.name === 'string' && block.name.trim()) return block.name;
    if (Object.hasOwn(BLOCK_LABELS, block.identifier)) return BLOCK_LABELS[block.identifier];
    if (Object.hasOwn(SLOT_LABELS, block.kind)) return SLOT_LABELS[block.kind];
    return `通用规则${(data?.prompts || []).indexOf(block) + 1}`;
}

const REASONS = Object.freeze({
    'unsupported-version': '预设版本不受支持', 'invalid-revision': '预设版本号无效', 'missing-blocks': '缺少通用规则',
    'missing-id': '缺少标识', 'duplicate-id': '标识重复', 'invalid-role': '发送身份无效',
    'invalid-content': '正文不能为空', 'invalid-boolean': '启用设置无效', 'missing-order': '缺少发送顺序',
    'dangling-order': '发送顺序引用了不存在的段', 'duplicate-order': '发送顺序中重复出现同一段',
    'not-imagegen': '不是生图提示词组', 'unmapped-block': '段落用途未识别',
    'unsupported-injection': '含有暂不支持的插入设置', 'unknown-execution-field': '含有暂不支持的设置项',
    'invalid-slot-content': '插入位置的内容被改动', 'unknown-task': '任务无法识别',
    'module-role-mismatch': '发送身份与任务规则插入位置不一致', 'invalid-data-fields': '资料范围无效',
    'invalid-required-fields': '必填资料必须在允许范围内', 'invalid-format-content': '场合附加规则不能为空',
    'unsupported-variable': '正文含有不受支持的变量', 'missing-task-map': '缺少任务对应关系',
    'module-task-mismatch': '所选版本不可用', 'missing-task-module': '该任务没有可用规则',
    'unmapped-format': '所选场合没有对应规则', 'required': '缺少必填资料',
});
const FAILURES = Object.freeze({
    'preset-store-unreadable': '预设存储无法读取', 'prompt-not-activatable': '内容未填完整，暂不能生效',
    'invalid-prompt-preset': '预设内容无效', 'preset-id-conflict': '已存在同名标识的预设',
    'prompt-editor-busy': '上一项操作尚未完成', 'prompt-editor-stale': '界面已更新，请重试',
    'missing-image-prompt-preset': '尚未选择预设', 'prompt-block-not-found': '找不到对应的规则',
    'invalid-or-duplicate-id': '规则标识无效或重复', 'prompt-save-before-restore': '当前内容未填完整，需先补全再恢复默认',
    'prompt-default-baseline-unknown': '此预设没有内置默认可恢复', 'prompt-restore-block-not-found': '此规则没有对应的内置默认',
    'prompt-default-backup-not-found': '找不到对应的备份', 'invalid-prompt-restore': '恢复请求无效',
    'invalid-prompt-fields': '有内容格式不正确', 'invalid-json': '文件不是有效的JSON',
    'duplicate-json-field': '文件中存在重复字段', 'no-imagegen-presets': '文件中没有可导入的生图提示词组',
    'invalid-prompt-import': '导入内容校验未通过', 'invalid-import-preview': '导入预览已失效',
    'prompt-import-preview-stale': '当前有未保存的修改，请重新导入', 'unsupported-prompt-format': '文件格式不受支持',
    'recall-not-executed': '回忆类条目不会导入', 'not-imagegen': '不是生图提示词组',
    'invalid-prompt-field': '字段无效', 'invalid-prompt-action': '操作无效',
    'prompt-editor-unavailable': '编辑器不可用', 'nai-settings-source-required': '需先在生图来源中选择NovelAI',
    'prompt-file-picker-unavailable': '无法打开文件选择', 'prompt-file-read-unavailable': '无法读取文件',
    'prompt-file-read-failed': '读取文件失败', 'prompt-download-unavailable': '无法导出文件',
    'prompt-download-failed': '导出文件失败', 'unknown-image-prompt-task': '任务无法识别',
    'invalid-prompt-data': '示例资料无效', 'missing-prompt-data': '示例资料缺少必填项',
    'invalid-prompt-draft': '草稿无效', 'invalid-preset-snapshot': '预设存储校验未通过',
    'prompt-default-not-found': '找不到内置默认', 'module-in-use': '该版本正在使用，需先改选其他版本', 'prompt-block-not-ordered': '该规则不在发送顺序中',
});

function locate(field, data) {
    const text = String(field ?? '');
    const parts = text.split('.');
    if (parts[0] === 'prompts' && parts.length >= 2) {
        const block = /^\d+$/.test(parts[1]) ? data?.prompts?.[Number(parts[1])] : data?.prompts?.find(b => b.identifier === parts[1]);
        return block ? `通用规则「${blockTitle(data, block)}」` : '通用规则';
    }
    if (parts[0] === 'modules' && parts.length >= 2) {
        const module = /^\d+$/.test(parts[1]) ? data?.modules?.[Number(parts[1])] : data?.modules?.find(m => m.identifier === parts[1]);
        return module ? `任务规则「${moduleTitle(data, module)}」` : '任务规则';
    }
    if (parts[0] === 'taskMap' && parts[1]) return `任务规则「${taskLabel(parts[1])}」`;
    return '';
}

// 单条校验问题翻成中文句子，带中文定位（任务名 / 段名）。
export function describeIssue(issue, data) {
    const field = String(issue?.field ?? ''), reason = issue?.reason;
    if (reason === 'slot-count') {
        if (Object.hasOwn(SLOT_LABELS, field)) return `「${SLOT_LABELS[field]}」必须恰好启用一处`;
        return `正文中的「{{${field}}}」必须恰好出现一次`;
    }
    if (reason === 'required' || (reason === 'missing-prompt-data')) return `缺少必填资料「${dataFieldLabel(field)}」`;
    const where = locate(field, data);
    const what = Object.hasOwn(REASONS, reason) ? REASONS[reason] : '存在未识别的问题';
    if (field === 'usage') return REASONS['not-imagegen'];
    if (/contentByFormat\.([\w-]+)/.test(field)) {
        const format = field.match(/contentByFormat\.([\w-]+)/)[1];
        return `${where || '规则'}的「${formatLabel(format)}」：${what}`;
    }
    if (field === 'outputs.format') return what;
    return where ? `${where}：${what}` : what;
}
export function describeIssues(issues, data) {
    return [...new Set((issues || []).map(issue => describeIssue(issue, data)))];
}
// 操作失败的统一中文说明。
export function describeFailure(result, data) {
    const base = Object.hasOwn(FAILURES, result?.reason) ? FAILURES[result.reason] : '操作未完成';
    const details = describeIssues(result?.errors, data);
    return details.length ? `${base}：${details.join('；')}` : base;
}

const pad = n => String(n).padStart(2, '0');
export const clockText = at => { const d = new Date(at); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// 状态行：操作提示 + 自动保存结果。输入时只就地更新这一行，不重绘。
export function imagePromptStatusText(state) {
    const parts = [];
    if (state?.status) parts.push(state.status);
    const save = state?.save;
    if (save?.kind === 'saved') parts.push(`已自动保存 · ${clockText(save.at)}`);
    else if (save?.kind === 'draft') parts.push(`有内容未填完整，暂未生效：${(save.messages || []).join('；') || '请检查各项规则'}`);
    else if (save?.kind === 'error') parts.push(`自动保存失败：${save.message || '请稍后重试'}`);
    return parts.join(' | ');
}
// 状态行配色：刚保存为 is-ok，出错或草稿为 is-error，其余为空（空文本时整行隐藏）。
export function imagePromptStatusClass(state) {
    if (state?.status || state?.save?.kind === 'draft' || state?.save?.kind === 'error') return 'is-error';
    return state?.save?.kind === 'saved' ? 'is-ok' : '';
}
