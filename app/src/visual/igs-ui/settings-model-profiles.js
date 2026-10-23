// 设置器「模型预设」：生图 / 副 LLM 两组接口配置的存取，数据在酒馆文件里（见 storage/model-profiles-file.js）。
import { createModelProfilesStore } from '../../storage/model-profiles-file.js';
import { esc } from './reader-value-utils.js';
import { getPath, normalizeSettingsValue, setPath } from './settings-normalize.js';

const PROFILE_PATHS = Object.freeze({
    image: [
        'bridge.autoIllustration.nai.transport', 'bridge.autoIllustration.nai.endpoint', 'bridge.autoIllustration.nai.apiKey',
        'bridge.autoIllustration.nai.model', 'bridge.imageApi.mode', 'bridge.imageApi.cgModel', 'bridge.imageApi.spriteModel',
        'bridge.imageApi.backgroundModel', 'bridge.imageApi.itemModel',
    ],
    llm: ['bridge.autoIllustration.llm.endpoint', 'bridge.autoIllustration.llm.apiKey', 'bridge.autoIllustration.llm.model'],
});
const KIND_LABEL = Object.freeze({ image: '生图', llm: '副 LLM' });

// 这些字段在 change 事件后立即落盘：后台生图任务读的是已保存配置。
const IMMEDIATE_SAVE_PATH = /^bridge\.(?:autoIllustration\.nai\.(?:endpoint|apiKey|transport|model)|autoIllustration\.llm\.(?:endpoint|apiKey|model)|imageApi\.(?:mode|\w+Model))$/;
export function isImmediateSavePath(path) {
    return IMMEDIATE_SAVE_PATH.test(String(path || ''));
}

export function collectProfileValues(kind, draft) {
    const values = {};
    for (const path of PROFILE_PATHS[kind] || []) {
        const value = getPath(draft, path);
        if (value !== undefined && value !== null) values[path] = value;
    }
    return values;
}

export function applyProfileValues(kind, values, draft) {
    for (const path of PROFILE_PATHS[kind] || []) {
        if (Object.hasOwn(values || {}, path)) setPath(draft, path, normalizeSettingsValue(path, values[path]));
    }
}

export function renderModelProfileRow(kind, profileState) {
    const profiles = profileState || {};
    const list = (profiles.list || []).filter((item) => item.kind === kind);
    const selected = list.some((item) => item.id === profiles.sel?.[kind]) ? profiles.sel[kind] : '';
    const empty = profiles.status === 'loading' || !profileState ? '读取中…' : (list.length ? '选择预设以切换' : '暂无预设');
    const options = [`<option value="">${empty}</option>`]
        .concat(list.map((item) => `<option value="${esc(item.id)}"${item.id === selected ? ' selected' : ''}>${esc(item.name)}</option>`)).join('');
    const message = profiles.status === 'error' ? `预设读取失败：${profiles.error || '未知原因'}` : (profiles.message || '');
    return `<div class="igs-settings-sub" data-model-profiles="${kind}">`
        + `<label class="igs-settings-field"><span>模型预设</span><select data-model-profile-select="${kind}" aria-label="${KIND_LABEL[kind]}模型预设">${options}</select></label>`
        + '<div class="igs-settings-row">'
        + `<button class="igs-settings-action" type="button" data-action="model-profile:save:${kind}">存为预设</button>`
        + `<button class="igs-settings-action" type="button" data-action="model-profile:delete:${kind}">删除</button></div>`
        + `<div class="igs-settings-result" data-result="model-profile-${kind}">${esc(message)}</div></div>`;
}

// 打开页面时异步读一次，结果缓存在 asyncState.modelProfiles。
export function ensureModelProfilesLoaded(panel, { global, onChange }) {
    const asyncState = panel.asyncState;
    if (asyncState.modelProfiles) return;
    const profiles = asyncState.modelProfiles = { status: 'loading', list: [], sel: {}, message: '', error: '' };
    createModelProfilesStore(global).read().then((list) => {
        profiles.list = list; profiles.status = 'ready';
    }, (error) => {
        profiles.status = 'error'; profiles.error = String(error?.message || error || '');
    }).then(() => onChange(panel));
}

export function setModelProfileSelection(panel, kind, id) {
    const profiles = panel.asyncState.modelProfiles;
    if (profiles && PROFILE_PATHS[kind]) (profiles.sel ||= {})[kind] = String(id || '');
}

export async function handleModelProfileAction(action, ctx) {
    const { panel, dialogs, persistSettingsDraft, rerenderSettings, isCurrent } = ctx;
    const [, op, kind] = String(action).split(':');
    if (!PROFILE_PATHS[kind]) return { ok: false, reason: 'model-profile-kind' };
    const profiles = panel.asyncState.modelProfiles ||= { status: 'ready', list: [], sel: {}, message: '', error: '' };
    const store = createModelProfilesStore(ctx.global);
    const selected = profiles.list.find((item) => item.kind === kind && item.id === profiles.sel?.[kind]);
    const done = (message, list) => {
        if (list) { profiles.list = list; profiles.status = 'ready'; }
        profiles.message = message;
        if (isCurrent()) rerenderSettings();
        return { ok: true };
    };
    if (op === 'apply') {
        if (!selected) return done('请先选择预设');
        applyProfileValues(kind, selected.values, panel.draft);
        const saved = persistSettingsDraft();
        if (saved.ok === false) return saved;
        return done(`已应用「${selected.name}」`);
    }
    try {
        if (op === 'save') {
            const name = String((await dialogs.prompt(`${KIND_LABEL[kind]}预设名称（同名覆盖）：`, selected ? selected.name : '')) || '').trim();
            if (!name) return done('');
            const list = await store.save({ name, kind, values: collectProfileValues(kind, panel.draft) });
            const entry = list.find((item) => item.kind === kind && item.name === name);
            if (entry) (profiles.sel ||= {})[kind] = entry.id;
            return done(`已存为「${name}」`, list);
        }
        if (op === 'delete') {
            if (!selected) return done('请先选择预设');
            if (typeof dialogs.confirm === 'function' && !(await dialogs.confirm(`删除预设「${selected.name}」？`))) return done('');
            const list = await store.remove(selected.id);
            profiles.sel[kind] = '';
            return done(`已删除「${selected.name}」`, list);
        }
    } catch (error) {
        return done(`操作失败：${String(error?.message || error || '未知原因')}`);
    }
    return { ok: false, reason: 'model-profile-op' };
}
