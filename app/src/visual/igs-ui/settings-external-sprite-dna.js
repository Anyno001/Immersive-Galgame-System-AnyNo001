import { spriteDnaPreparationState, mergeGeneratedCharacterDna } from '../../scene/character-dna-preparation.js';
import { normalizeCharacterDna } from '../../scene/character-dna.js';
import { resolveAssetScope, ensureCardLibrary } from '../../scene/asset-scope.js';
import { getSillyTavernContext } from '../../host/tavern-helper-adapter.js';

const generationAction = /^(?:char-(?:generate|redraw)-sprite|outfit-generate-nude|(?:char|outfit)-expression-(?:set|retry|resume)|status-avatar-generate):([^:]+)/;
const failed = result => result?.ok !== true;
const stale = () => ({ ok: false, reason: 'DNA_ADOPTION_CONFLICT', error: '角色、角色卡或 DNA 开关已变化，未继续生成' });

export function needsSettingsExternalSpriteDna(action, settingsState) {
    const api = settingsState.draft.bridge?.imageApi || {};
    return generationAction.test(action) && ['dbgen', 'extension', 'baibai'].includes(api.mode) && api.externalSpriteDna === true;
}

// 这是 DNA 保存适配器：检查覆盖冲突、同步草稿，不参与生成任务的有效性判断。
// 生成任务的 isCurrent 始终由 core 的已生效资料与角色归属决定。
export function withCharacterDnaDraftSync(target, readPanel) {
    if (!target) return target;
    const root = panel => panel?.draft.bridge?.sceneAssets || {};
    return { ...target,
        save(dna) {
            const panel = readPanel();
            const result = target.save(dna);
            if (result?.ok !== true) return result;
            if (panel && readPanel() === panel) {
                const live = target.owner ? ensureCardLibrary(root(panel), target.owner) : root(panel);
                const merged = mergeGeneratedCharacterDna(target.dna, live.characterDna?.[target.name], result.dna || dna);
                live.characterDna = { ...live.characterDna, [target.name]: merged };
            }
            return result;
        },
        // 设置器开着时把新衣装同步进草稿，免得之后保存草稿把刚存的衣装盖掉。
        saveOutfit(clothing) {
            const panel = readPanel();
            const result = target.saveOutfit(clothing);
            if (result?.ok !== true || !result.created || !panel || readPanel() !== panel) return result;
            const live = target.owner ? ensureCardLibrary(root(panel), target.owner) : root(panel);
            live.characterOutfits = { ...live.characterOutfits,
                [target.name]: { ...live.characterOutfits?.[target.name], [result.name]: structuredClone(result.entry) } };
            if (result.wardrobeKey) live.wardrobe = { ...live.wardrobe, [result.wardrobeKey]: structuredClone(result.wardrobe) };
            return result;
        } };

}

// 所有手动立绘入口共用一次提示与独立资料保存，之后原生成动作读取已保存的 DNA。
export async function prepareSettingsExternalSpriteDna(action, { settingsState, options, dialogs,
    resolveTarget, isOpen, persist, startProgress, note }) {
    const match = generationAction.exec(action);
    const api = settingsState.draft.bridge?.imageApi || {};
    if (!needsSettingsExternalSpriteDna(action, settingsState)) return { ok: true };
    let requested;
    try { requested = decodeURIComponent(match[1]); } catch { return stale(); }
    const target = resolveTarget(requested);
    let library = target.library;
    if (!library || (!library.characters?.[target.name] && !library.characterDna?.[target.name]
        && !library.characterOutfits?.[target.name])) return { ok: true };
    const dna = normalizeCharacterDna(library.characterDna?.[target.name]);
    const preparation = spriteDnaPreparationState(dna);
    if (!preparation.needed) return { ok: true };
    if (target.borrowed) return { ok: false, reason: 'DNA_ADOPTION_SCOPE', error: '角色资料来自其他角色卡，请先复制到当前卡后再补 DNA' };
    if (preparation.cleared) return { ok: false, reason: 'dna-manually-cleared',
        error: '角色身份已手动清空，请先在「素材 → 角色立绘 → 角色设定」填写 DNA，再生成立绘' };
    const service = options.generatedAssets;
    if (typeof service?.prepareExternalSpriteDna !== 'function') return { ok: false, reason: 'dna-unavailable', error: '副 API 补 DNA 当前不可用' };
    const config = JSON.stringify(api);
    const contextScope = resolveAssetScope(getSillyTavernContext(options.global || globalThis)).key;
    const current = () => isOpen()
        && resolveTarget(requested).scope === target.scope
        && JSON.stringify(settingsState.draft.bridge?.imageApi) === config
        && resolveAssetScope(getSillyTavernContext(options.global || globalThis)).key === contextScope;
    const confirmed = await dialogs.confirm(`「${target.name}」缺少可用的角色 DNA。已开启「外部生图前补齐角色 DNA」，是否先用「备用模型」（副 API）补齐并保存 DNA，再继续生成？\n取消后可在该角色的「角色设定」中手动填写。`);
    if (!confirmed) return { ok: false, reason: 'dna-cancelled' };
    if (!current()) return stale();
    // 把本次选择的来源和开关先持久化，副 API 与外部后端读取同一份生效设置。
    if (failed(persist())) return { ok: false, reason: 'dna-save-failed', error: '配置保存失败，未开始补 DNA 或出图' };
    if (!current()) return stale();
    const progress = startProgress(target.name);
    try {
        return await service.prepareExternalSpriteDna({ name: target.name, dna, shouldStart: current,
            note: note ?? library.characterSpriteNotes?.[target.name] ?? '',
            onProgress: progress.onProgress,
            async onSaveDna(nextDna) {
                if (!current()) return stale();
                library = resolveTarget(requested).library;
                const previous = library.characterDna;
                const present = Object.hasOwn(library, 'characterDna');
                const merged = mergeGeneratedCharacterDna(dna, previous?.[target.name], nextDna);
                library.characterDna = { ...previous, [target.name]: merged };
                if (failed(persist())) {
                    if (present) library.characterDna = previous;
                    else delete library.characterDna;
                    return { ok: false, reason: 'dna-save-failed', error: '角色 DNA 保存失败，未发起立绘生成' };
                }
                return current() ? { ok: true, dna: merged } : stale();
            } });
    } catch {
        return { ok: false, reason: 'dna-write-failed', error: '副 API 补 DNA 失败，未发起立绘生成' };
    } finally { progress.end(); }
}
