import { pickImagePromptFile, downloadImagePromptPreset } from './settings-image-prompt-io.js';

const fail = reason => ({ ok: false, reason });

// 异步确认绑定面板实例与编辑版本，迟到动作不作用于另一份编辑副本。
export async function handleImagePromptAction(action, ctx) {
    const { editor, dialogs, isCurrent, global: globalObj } = ctx;
    const state = editor.state, target = state.preset, revision = state.editRevision;
    const current = () => isCurrent() && target === state.preset && revision === state.editRevision;
    let verb, args;
    try { [, verb, ...args] = action.split(':').map(decodeURIComponent); }
    catch { return fail('invalid-prompt-action'); }
    if (!current()) return fail('prompt-editor-stale');
    if (verb === 'new' || verb === 'copy') {
        const id = await dialogs.prompt('新预设的稳定 ID（不能与现有 ID 重复）', '');
        if (id === null) return { ok: true, cancelled: true };
        if (!current()) return fail('prompt-editor-stale');
        const name = await dialogs.prompt('预设名称', id);
        if (name === null) return { ok: true, cancelled: true };
        return current() ? editor.create(id, name, verb === 'copy') : fail('prompt-editor-stale');
    }
    if (verb === 'add') {
        const id = await dialogs.prompt('新块的稳定 ID', '');
        if (id === null) return { ok: true, cancelled: true };
        return current() ? editor.blockAction('add', args[0], id) : fail('prompt-editor-stale');
    }
    if (verb === 'import' || verb === 'import-text') {
        const file = verb === 'import-text'
            ? { ok: true, text: await dialogs.edit('粘贴生图预设原始 JSON', '') }
            : await (ctx.readFile || pickImagePromptFile)(globalObj);
        if (!current()) return fail('prompt-editor-stale');
        if (!file.ok) return file;
        if (file.cancelled || file.text === null) return { ok: true, cancelled: true };
        return editor.previewImport(file.text);
    }
    if (verb === 'export') {
        const preset = editor.view().saved;
        if (!preset) return fail('missing-image-prompt-preset');
        return (ctx.download || downloadImagePromptPreset)(globalObj, preset);
    }

    if (['delete', 'discard', 'block-delete', 'restore', 'activate', 'reload', 'import-commit'].includes(verb)) {
        const messages = { delete: '删除此预设及对应草稿？当前生效项需先切换。',
            discard: '放弃编辑内容和存档草稿，回到保存版本？', 'block-delete': '删除此提示块？',
            restore: '将此块正文恢复到所选默认／备份版本？', activate: '启用此保存版本？草稿不参与运行。',
            reload: '重新读取存储？未存档的编辑将被放弃。', 'import-commit': '按预览及冲突选项导入？不会自动激活。' };
        const preview = state.importPreview, choices = JSON.stringify(state.importChoices);
        if (!await dialogs.confirm(messages[verb])) return { ok: true, cancelled: true };
        if (!current() || (verb === 'import-commit' && (preview !== state.importPreview
            || choices !== JSON.stringify(state.importChoices)))) return fail('prompt-editor-stale');
    }
    if (verb === 'select') return editor.select(args[0]);
    if (verb === 'draft') return editor.saveDraft();
    if (verb === 'save') return editor.save();
    if (verb === 'activate') return editor.activate();
    if (verb === 'delete') return editor.remove();
    if (verb === 'discard') return editor.discardDraft();
    if (verb === 'reload') return editor.reload();
    if (verb === 'preview') return editor.preview();
    if (verb === 'import-commit') return editor.commitImport();
    if (verb === 'block-delete') return editor.blockAction('delete', args[0], args[1]);
    if (verb === 'move') return editor.blockAction('move', 'prompts', args[0], args[1]);
    if (verb === 'include') return editor.blockAction('include', 'prompts', args[0]);
    if (verb === 'restore') {
        if (args[2] !== 'baseline' && !/^\d+$/.test(args[2] || '')) return fail('invalid-prompt-restore');
        return editor.restore(args[0], args[1], args[2] === 'baseline' ? undefined : Number(args[2]));
    }
    return fail('invalid-prompt-action');
}
