import { clonePromptData, validatePromptActivation } from './prompt-preset.js';

const fail = (reason) => ({ ok: false, reason });
const clean = (data) => {
    const copy = clonePromptData(data);
    delete copy.defaultState;
    return copy;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// 内置预设改名前的显示名：存量仍是旧名时升级顺带改成新名，用户改过的名字不动。
const LEGACY_DEFAULT_NAMES = new Map([['igs-imagegen-default-v1', ['IGS 内置生图框架']]]);

// 基线与备份随同一个预设快照保存，绝不另写一份 current。
export function promptDefaultState(preset) {
    const copy = clonePromptData(preset);
    if (!copy.data.defaultState) copy.data.defaultState = {
        version: copy.data.defaultVersion,
        baseline: clean(copy.data), backups: [],
    };
    return copy;
}

// 已存在却仍是旧默认名的内置预设只改名（不动内容与版本），就地修改传入的快照；返回是否改动。
export function renameLegacyDefaultNames(snapshot, presets) {
    let changed = false;
    for (const preset of presets) {
        const record = snapshot.items['prompt-preset']?.[preset?.id];
        if (record && typeof preset.name === 'string' && LEGACY_DEFAULT_NAMES.get(preset.id)?.includes(record.name)) {
            record.name = preset.name; changed = true;
        }
    }
    return changed;
}

export function stagePromptDefaultUpgrade(snapshot, preset) {
    const records = snapshot.items['prompt-preset'] || {};
    const current = records[preset.id];
    if (!current) return fail('prompt-default-not-found');
    const state = current.data.defaultState;
    if (!state || !Number.isSafeInteger(state.version) || !state.baseline
        || !Array.isArray(state.backups)) return { ok: true, changed: false, reason: 'prompt-default-baseline-unknown' };
    const version = preset.data.defaultVersion;
    if (!Number.isSafeInteger(version) || version < 1) return fail('invalid-prompt-default');
    if (version <= state.version) return { ok: true, changed: false };
    const candidate = clonePromptData(current), old = state.baseline;
    // 未修改默认正文按 ID 替换；不变更用户角色、开关、自定义顺序或白名单。
    for (const group of ['prompts', 'modules']) {
        if (!Array.isArray(old[group])) return fail('invalid-prompt-default-baseline');
        for (const block of candidate.data[group]) {
            const previous = old[group].find(b => b.identifier === block.identifier);
            const latest = preset.data[group].find(b => b.identifier === block.identifier);
            if (!previous || !latest) continue;
            // CG 新目录只补到未改动的旧白名单；用户删改的资料范围保持不变。
            if (group === 'modules' && block.task === 'cg'
                && same(block.dataFields, previous.dataFields)
                && Array.isArray(previous.dataFields) && !previous.dataFields.includes('outfitCatalog')
                && latest.dataFields?.includes('outfitCatalog')) {
                block.dataFields = [...block.dataFields, 'outfitCatalog'];
            }
            // 正文和分模式正文作为一个整体迁移；手改任一项均保留整块。
            if (same(block.content, previous.content) && same(block.contentByFormat, previous.contentByFormat)) {
                block.content = latest.content;
                if (latest.contentByFormat === undefined) delete block.contentByFormat;
                else block.contentByFormat = clonePromptData(latest.contentByFormat);
            }
        }
    }
    if (typeof preset.name === 'string' && LEGACY_DEFAULT_NAMES.get(preset.id)?.includes(candidate.name)) candidate.name = preset.name;
    upgradeUnmodifiedPromptOrder(candidate.data, old, preset.data);
    addNewReferenceBlocks(candidate.data, old, preset.data);
    candidate.data.revision += 1;
    candidate.data.defaultVersion = version;
    candidate.data.defaultState = { version, baseline: clean(preset.data),
        backups: [...state.backups, { revision: current.data.revision, data: clean(current.data) }] };
    const checked = validatePromptActivation(candidate.data);
    if (!checked.ok) return { ok: false, reason: 'prompt-not-activatable', errors: checked.errors };
    const next = clonePromptData(snapshot);
    next.items['prompt-preset'][candidate.id] = candidate;
    return { ok: true, next, changed: true, item: candidate };
}

// 仅跟随已知基线的块 ID 顺序；复用原顺序项，保留开关及其他配置。
function upgradeUnmodifiedPromptOrder(data, old, latest) {
    if (!Array.isArray(old.prompt_order)) return;
    const ids = order => order.map(entry => entry.identifier);
    if (!same(ids(data.prompt_order), ids(old.prompt_order))) return;
    const entries = new Map(data.prompt_order.map(entry => [entry.identifier, entry]));
    const ordered = latest.prompt_order.filter(entry => entries.has(entry.identifier))
        .map(entry => entries.get(entry.identifier));
    // 不丢弃新版未声明的存量项，也不恢复已删除的项。
    if (ordered.length !== data.prompt_order.length) return;
    data.prompt_order = ordered;
}

// 只补新版首次引入的参考块；旧基线已有但用户删除的块不复活。
function addNewReferenceBlocks(data, old, latest) {
    for (const block of latest.prompts) {
        if (!/\{\{\s*世界书\s*\}\}/.test(block.content)
            || old.prompts.some(item => item.identifier === block.identifier)) continue;
        if (data.prompts.some(item => item.identifier === block.identifier)) continue;
        const order = latest.prompt_order.find(item => item.identifier === block.identifier);
        if (!order) continue;
        data.prompts.push(clonePromptData(block));
        const nextIds = latest.prompt_order.slice(latest.prompt_order.indexOf(order) + 1)
            .map(item => item.identifier);
        const anchor = nextIds.map(id => data.prompt_order.findIndex(item => item.identifier === id))
            .find(index => index >= 0);
        data.prompt_order.splice(anchor ?? data.prompt_order.length, 0, clonePromptData(order));
        data.variables ||= [];
        if (!data.variables.includes('世界书')) data.variables.push('世界书');
    }
}

// 恢复按稳定块 ID 定位；备份版本由用户显式选择，不按数组位置猜测。
export function stagePromptDefaultRestore(snapshot, id, options = {}) {
    const current = snapshot.items['prompt-preset']?.[id];
    if (!current) return fail('missing-image-prompt-preset');
    const state = current.data.defaultState;
    if (!state?.baseline || !Array.isArray(state.backups)) return fail('prompt-default-baseline-unknown');
    const source = options.backupRevision === undefined ? state.baseline
        : state.backups.find(backup => backup.revision === options.backupRevision)?.data;
    if (!source) return fail('prompt-default-backup-not-found');
    const group = options.group;
    if (!['prompts', 'modules'].includes(group) || typeof options.identifier !== 'string')
        return fail('invalid-prompt-restore');
    const saved = source[group]?.find(block => block.identifier === options.identifier);
    const candidate = clonePromptData(current);
    const target = candidate.data[group]?.find(block => block.identifier === options.identifier);
    if (!saved || !target || typeof saved.content !== 'string') return fail('prompt-restore-block-not-found');
    if (target.content === saved.content && same(target.contentByFormat, saved.contentByFormat))
        return { ok: true, changed: false, item: candidate };
    target.content = saved.content;
    if (saved.contentByFormat === undefined) delete target.contentByFormat;
    else target.contentByFormat = clonePromptData(saved.contentByFormat);
    candidate.data.revision += 1;
    candidate.data.defaultState.backups.push({ revision: current.data.revision, data: clean(current.data) });
    const checked = validatePromptActivation(candidate.data);
    if (!checked.ok) return { ok: false, reason: 'prompt-not-activatable', errors: checked.errors };
    const next = clonePromptData(snapshot);
    next.items['prompt-preset'][id] = candidate;
    return { ok: true, next, changed: true, item: candidate };
}
