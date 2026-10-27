import { pickImagePromptFile, downloadImagePromptPreset } from './settings-image-prompt-io.js';

const fail = reason => ({ ok: false, reason });

// 结构性操作成功后立即自动保存（状态行随之显示保存结果）。
function structural(editor, result) {
    if (!result.ok) return result;
    const saved = editor.autoSave();
    return saved.ok ? result : saved;
}

// 优先读系统剪贴板；浏览器不允许时退回粘贴框。
async function readClipboardText(globalObj, dialogs) {
    try {
        const text = await globalObj?.navigator?.clipboard?.readText?.();
        if (typeof text === 'string' && text.trim()) return text;
    } catch { /* 无权限时走粘贴框 */ }
    return dialogs.edit('粘贴提示词组内容', '');
}

// 异步确认绑定面板实例与编辑版本，迟到动作不作用于另一份编辑副本。
export async function handleImagePromptAction(action, ctx) {
    const { editor, dialogs, isCurrent, global: globalObj } = ctx;
    const state = editor.state, targetId = state.preset?.id;
    const current = () => isCurrent() && targetId === state.preset?.id;
    let verb, args;
    try { [, verb, ...args] = action.split(':').map(decodeURIComponent); }
    catch { return fail('invalid-prompt-action'); }
    if (!current()) return fail('prompt-editor-stale');
    if (verb === 'new' || verb === 'copy') {
        // 只问名称；稳定 ID 由程序生成且不显示。
        const name = await dialogs.prompt('提示词组名称', verb === 'copy' ? `${state.preset?.name || ''}（副本）` : '新提示词组');
        if (name === null) return { ok: true, cancelled: true };
        const text = String(name).trim();
        if (!text) return fail('invalid-prompt-preset');
        return current() ? editor.create(editor.newId(), text, verb === 'copy') : fail('prompt-editor-stale');
    }
    if (verb === 'rename') {
        const name = await dialogs.prompt('提示词组名称', state.preset?.name || '');
        if (name === null) return { ok: true, cancelled: true };
        return current() ? editor.rename(name) : fail('prompt-editor-stale');
    }
    if (verb === 'add') {
        const name = await dialogs.prompt('通用规则名称', '新规则');
        if (name === null) return { ok: true, cancelled: true };
        if (!current()) return fail('prompt-editor-stale');
        const used = new Set((state.preset?.data.prompts || []).map(block => block.identifier));
        let id = `igs-rule-${Date.now().toString(36)}`;
        for (let n = 2; used.has(id); n += 1) id = `igs-rule-${Date.now().toString(36)}-${n}`;
        return structural(editor, editor.blockAction('add', args[0], id, String(name).trim()));
    }
    if (verb === 'set') {
        // 开关类控件：立即写入并自动保存。
        const result = editor.edit(args[0], args[1] === '1');
        if (!result.ok) return result;
        const saved = editor.autoSave();
        return saved.ok ? result : saved;
    }
    if (verb === 'performance') {
        // 演绎档位只属于灵动方案；写入预设数据后走自动保存。
        if (state.preset?.data.spriteScheme !== 'lively') return fail('invalid-prompt-field');
        const result = editor.edit(JSON.stringify(['data', '', 'performance']), args[0]);
        return result.ok ? structural(editor, result) : result;
    }
    if (verb === 'module-copy') return structural(editor, editor.blockAction('copy', 'modules', args[0]));
    if (verb === 'format-remove') {
        delete editor.state.pendingFormats[`${args[0]}|${args[1]}|${args[2]}`];
        const result = editor.edit(JSON.stringify([args[0], args[1], 'format:' + args[2]]), '');
        return result.ok ? structural(editor, { ...result, structural: true }) : result;
    }
    if (verb === 'format-add') return editor.blockAction('format-add', args[0], args[1], args[2]);
    if (verb === 'import' || verb === 'import-text') {
        const file = verb === 'import-text'
            ? { ok: true, text: await readClipboardText(globalObj, dialogs) }
            : await (ctx.readFile || pickImagePromptFile)(globalObj);
        if (!current()) return fail('prompt-editor-stale');
        if (!file.ok) return file;
        if (file.cancelled || file.text === null) return { ok: true, cancelled: true };
        return editor.previewImport(file.text);
    }
    if (verb === 'export') {
        const preset = editor.saved();
        if (!preset) return fail('missing-image-prompt-preset');
        return (ctx.download || downloadImagePromptPreset)(globalObj, preset);
    }

    if (['delete', 'discard', 'block-delete', 'restore', 'reset', 'activate', 'reload', 'import-commit'].includes(verb)) {
        const messages = { delete: '删除此提示词组及其草稿？删除后会自动选用其他可用的提示词组。',
            discard: '放弃未保存的内容，回到已保存版本？', 'block-delete': args[0] === 'modules' ? '删除此版本？' : '删除这段通用规则？',
            restore: '将此规则恢复为内置默认？', reset: '当前提示词组的全部内容将替换为内置默认，名称保持不变。如需保留现有内容，请先复制一份。', activate: '改用此提示词组生成图片？',
            reload: '重新读取存储？未保存的修改将被放弃。', 'import-commit': '按预览及冲突选项导入？导入后不会自动使用。' };
        if (!await dialogs.confirm(messages[verb])) return { ok: true, cancelled: true };
        if (!current()) return fail('prompt-editor-stale');
    }
    if (verb === 'select') {
        // 选中即设为使用中；不能使用时回到原来的提示词组，把原因交给状态行，不静默切换。
        const previous = state.preset?.id;
        const selected = editor.select(args[0]);
        if (!selected.ok) return selected;
        const activated = editor.activate();
        if (!activated.ok && previous && previous !== args[0]) editor.select(previous);
        return activated;
    }
    if (verb === 'draft') return editor.saveDraft();
    if (verb === 'save') return editor.save();
    if (verb === 'activate') return editor.activate();
    if (verb === 'delete') return editor.remove();
    if (verb === 'discard') return editor.discardDraft();
    if (verb === 'reload') return editor.reload();
    if (verb === 'reset') return editor.restoreFramework();
    if (verb === 'import-commit') return editor.commitImport();
    if (verb === 'block-delete') return structural(editor, editor.blockAction('delete', args[0], args[1]));
    if (verb === 'move') return structural(editor, editor.blockAction('move', 'prompts', args[0], args[1]));
    if (verb === 'include') return structural(editor, editor.blockAction('include', 'prompts', args[0]));
    if (verb === 'restore') {
        if (args[2] !== 'baseline' && !/^\d+$/.test(args[2] || '')) return fail('invalid-prompt-restore');
        return editor.restore(args[0], args[1], args[2] === 'baseline' ? undefined : Number(args[2]));
    }
    return fail('invalid-prompt-action');
}
