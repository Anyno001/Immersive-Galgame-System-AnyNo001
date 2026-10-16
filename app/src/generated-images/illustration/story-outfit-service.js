import { adoptCharacterSeed } from '../../scene/generation-seeds.js';
// 剧情衣装候选：发现时仅登记，用户选择后才写词、入库及按需生成立绘。
import { resolveCharacterKey } from '../../scene/scene-directives.js';
import { createOutfitResolver, isValidOutfitName, isBuiltinNudeOutfit } from '../../scene/character-outfits.js';
import { assetOwnerKey, effectiveSceneAssets, ensureCardLibrary } from '../../scene/asset-scope.js';
import { prepareStoryOutfitAdoption, prepareOutfitAdoption } from '../../scene/outfit-identity.js';
import { prepareInitialDefaultOutfitSelection } from '../../scene/character-appearance.js';
import { loadStoryOutfitCandidates, saveStoryOutfitCandidate, removeStoryOutfitCandidate, storyOutfitId } from '../../scene/outfit-review-store.js';
import { normalizeCharacterDna, readCharacterDnaView } from '../../scene/character-dna.js';
import { GENERATED_ASSET_URL_PREFIX, setGeneratedExpressionNote } from '../../scene/asset-match.js';
import { promptProvenance } from '../generation-prompt.js';
import { characterPromptRecovery } from './character-prompt-task.js';

const fields = ['characters', 'characterDna', 'characterOutfits'];
const fail = (reason, error = '衣装处理未完成，候选保留，请重试') => ({ ok: false, reason, error });

export function createStoryOutfitService(deps) {
    const candidates = new Map(), adoptions = new Map(), deferred = new Set();
    let disposed = false;
    const loaded = loadStoryOutfitCandidates(deps.storage);
    if (loaded.ok) for (const row of loaded.items) candidates.set(row.id, { ...row,
        saved: row.status === 'saved', status: row.status === 'saved' ? 'saved' : row.prompt ? 'ready' : 'pending' });
    const current = (row) => {
        const ctx = deps.getContext(row);
        return !disposed && ctx && ctx.scopeKey === row.scopeKey && ctx.floorKey === row.floorKey
            && ctx.sourceHash === row.sourceHash
            && ctx.messageId === row.messageId
            && assetOwnerKey(ctx.root, ctx.scopeKey, fields, row.character) === row.ownerKey;
    };
    const persist = (row) => {
        const result = saveStoryOutfitCandidate(deps.storage, row);
        if (!result.ok) row.reason = result.reason;
        return result;
    };
    const notify = () => { if (!disposed) deps.onChanged?.(); };
    // 正式衣装与首次立绘审核各有采用入口；这里只排除同人物、同衣装，不借其他衣装图。
    const handled = (row) => {
        const ctx = deps.getContext(row);
        if (!ctx) return false;
        const assets = effectiveSceneAssets(ctx.root, ctx.scopeKey);
        return Boolean(createOutfitResolver(assets)(row.character, row.word)
            || deps.assets.tempSpriteForOutfit?.(row.character, row.word));
    };
    async function write(row) {
        if (!current(row)) return fail('stale-target');
        row.status = 'writing';
        const saved = persist(row);
        if (!saved.ok) return saved;
        notify();
        const context = deps.getContext(row);
        const result = await deps.assets.writeWardrobePrompt({ character: row.character, outfit: row.word,
            ...(context?.text !== undefined && { sourceText: context.text }),
            shouldStart: () => current(row),
            ...(deps.signal && { signal: deps.signal }),
            messageId: row.messageId, note: '仅从本楼正文提取这套衣服的款式、颜色、材质与配饰；未知细节不编造。' });
        if (!current(row)) return fail('stale-target');
        const prompt = result?.prompt;
        if (!result?.ok || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4096
            || /<<\s*(?:dna|outfit)/i.test(prompt)) {
            row.status = 'failed'; persist(row);
            return fail(safeReason(result?.reason) || 'outfit-write-failed');
        }
        row.prompt = prompt; row.status = 'ready'; row.reason = '';
        return persist(row);
    }

    function observe(directives) {
        if (disposed) return fail('disposed');
        const fresh = loadStoryOutfitCandidates(deps.storage);
        if (!fresh.ok) return fresh;
        // CG 完成可在服务创建后暂存新候选；同步时不覆盖在途任务和同图恢复状态。
        for (const row of fresh.items) {
            if (!candidates.has(row.id)) candidates.set(row.id, { ...row,
                saved: row.status === 'saved', status: row.status === 'saved' ? 'saved' : row.prompt ? 'ready' : 'pending' });
        }
        const ctx = deps.getContext();
        if (!ctx || !Number.isSafeInteger(ctx.messageId) || !ctx.floorKey || !ctx.sourceHash) return fail('stale-target');
        const assets = effectiveSceneAssets(ctx.root, ctx.scopeKey);
        if (assets.wardrobeAutoFlow === false) return { ok: true };
        const resolver = createOutfitResolver(assets);
        const known = { ...assets.characterDna, ...assets.characters, ...assets.characterOutfits };
        for (const directive of directives || []) {
            const word = directive?.unknownOutfit;
            if (!word || !isValidOutfitName(word) || isBuiltinNudeOutfit(word)) continue;
            const character = resolveCharacterKey(known, assets.characterAliases, directive.character);
            if (!character || resolver(character, word)) continue;
            const ownerKey = assetOwnerKey(ctx.root, ctx.scopeKey, fields, character);
            const id = storyOutfitId({ ...ctx, ownerKey, character, word });
            if (candidates.has(id)) continue;
            const row = { id, character, word, ownerKey, scopeKey: ctx.scopeKey, floorKey: ctx.floorKey,
                sourceHash: ctx.sourceHash, messageId: ctx.messageId, status: 'pending' };
            candidates.set(id, row);
            const saved = persist(row);
            if (!saved.ok) return saved;
        }
        return { ok: true };
    }

    function list({ includeDeferred = false } = {}) {
        return [...candidates.values()].filter(row => current(row) && (!deps.isVisible || deps.isVisible(row))
            && (includeDeferred || (!deferred.has(row.id) && !adoptions.has(row.id) && row.status !== 'saved'))
            && row.status !== 'done' && (row.saved || !handled(row)))
            .map(row => ({ ...row, choices: [
                { value: 'save', label: '仅入库衣柜' },
                { value: 'sprite', label: row.imageId ? '入库并采用已生成立绘' : '入库并用保存 DNA 生成立绘' },
            ] }));
    }

    function savedOutfit(row) {
        const ctx = deps.getContext(row);
        const assets = ctx && effectiveSceneAssets(ctx.root, row.scopeKey);
        const entry = assets?.characterOutfits?.[row.character]?.[row.word];
        return current(row) && assets?.wardrobe?.[entry?.wardrobe]?.prompt === row.prompt;
    }
    function finish(row) {
        row.status = 'saved';
        const removed = removeStoryOutfitCandidate(deps.storage, row.id);
        if (removed.ok) candidates.delete(row.id);
        else persist(row);
        return removed.ok ? {} : { warning: removed.reason };
    }
    async function commit(row, plan, expected) {
        if (!current(row)) return fail('stale-target');
        return plan.changed ? await deps.commit(plan.sceneAssets, expected, () => current(row), row) : { ok: true };
    }
    async function savePaintFailure(row, item, reason) {
        if (!current(row) || !savedOutfit(row) || !item?.caption) return {};
        const ctx = deps.getContext(row), next = structuredClone(ctx.root);
        const target = row.ownerKey ? ensureCardLibrary(next, row.ownerKey) : next;
        const entry = target.characterOutfits?.[row.character]?.[row.word];
        if (!entry || entry.moods?.平和) return {};
        entry.moods = { ...entry.moods, 平和: '' };
        const noted = setGeneratedExpressionNote(target.generated, `${row.character}\u0001${row.word}`, '平和', {
            positive: item.prompt?.positive || '', negative: item.prompt?.negative || '',
            error: reason, caption: item.caption, ...promptProvenance(item.prompt || item), ...characterPromptRecovery(item),
        });
        if (!noted.ok) return { warning: noted.reason };
        target.generated = noted.library;
        const result = await commit(row, { changed: true, sceneAssets: next }, ctx.root);
        return result?.ok ? { recoverySaved: true }
            : { recoverySaved: false, warning: safeReason(result?.reason) || 'save-failed' };
    }
    async function adopt(row, withSprite) {
        if (!current(row)) return fail('stale-target');
        if (!row.saved && handled(row)) return { ok: true, alreadyHandled: true,
            // 临时图可能被丢弃：保留候选来源，但不在此重复写词或生图。
            saved: false };
        if (!row.prompt) {
            const written = await write(row);
            if (!written.ok) return written;
        }
        let ctx = deps.getContext(row);
        let plan = prepareStoryOutfitAdoption(ctx.root, ctx.scopeKey, row);
        if (!plan.ok) return plan;
        const saved = await commit(row, plan, ctx.root);
        if (!saved?.ok) return saved || fail('save-failed');
        row.saved = true; row.status = 'saved';
        if (!savedOutfit(row)) return fail('save-readback-failed');
        const checkpoint = persist(row);
        if (!checkpoint.ok) return { ...checkpoint, saved: true, reopen: false };
        if (withSprite) {
            ctx = deps.getContext(row);
            const assets = effectiveSceneAssets(ctx.root, ctx.scopeKey);
            const dna = normalizeCharacterDna(assets.characterDna?.[row.character]);
            const view = readCharacterDnaView(dna, 'half_body');
            if (!view.ok) return view;
            const baseline = JSON.stringify(ctx.root);
            if (!row.imageId) {
                row.status = 'painting'; notify();
                const result = await deps.assets.generateExpressionSet({ name: row.character, dna,
                    outfit: { name: row.word, prompt: row.prompt }, moods: ['平和'],
                    messageId: row.messageId, ...(deps.signal && { signal: deps.signal }),
                    shouldStart: () => current(row) && savedOutfit(row) && JSON.stringify(deps.getContext(row).root) === baseline });
                const image = result?.items?.find(item => item.ok && item.mood === '平和' && item.imageId);
                if (!image) {
                    const item = result?.items?.[0];
                    const reason = safeReason(result?.reason || item?.reason) || 'outfit-image-failed';
                    const recovery = await savePaintFailure(row, item, reason);
                    return { ...fail(reason), ...recovery };
                }
                // 即使切楼，仍保留已完成图的 ID；不提交迟到结果，也不自动重画。
                row.imageId = image.imageId;
                const saved = persist(row);
                if (!saved.ok) return saved;
            }
            const record = await deps.assets.readStoredImage(row.imageId);
            if (!current(row)) return fail('stale-target');
            ctx = deps.getContext(row);
            if (JSON.stringify(ctx.root) !== baseline) return fail('OUTFIT_ADOPTION_CONFLICT');
            const identity = record?.outfitContext?.filter(c => c.characterKey === row.character);
            const clothing = record?.outfitSnapshot?.characters?.filter(c => c.characterKey === row.character);
            if (!record?.dataUrl || record.id !== row.imageId || record.type !== 'sprite'
                || record.promptEdited || record.edited || record.dnaCandidates !== undefined
                || identity?.length !== 1 || clothing?.length !== 1
                || clothing[0].name !== row.word || clothing[0].description !== row.prompt
                || JSON.stringify(normalizeCharacterDna(identity[0].dna)) !== JSON.stringify(dna))
                return fail('outfit-image-evidence-invalid');
            const checked = prepareOutfitAdoption(assets, row.character, row.imageId, record);
            if (!checked.ok) return checked;
            plan = { changed: true, sceneAssets: structuredClone(ctx.root) };
            const target = row.ownerKey ? ensureCardLibrary(plan.sceneAssets, row.ownerKey) : plan.sceneAssets;
            const outfit = target.characterOutfits?.[row.character]?.[row.word];
            if (!outfit) return fail('OUTFIT_ADOPTION_CONFLICT');
            const url = `${GENERATED_ASSET_URL_PREFIX}${row.imageId}`;
            if (outfit.moods?.平和 && outfit.moods.平和 !== url) return fail('outfit-image-slot-exists');
            outfit.moods = { ...outfit.moods, 平和: url };
            const selection = prepareInitialDefaultOutfitSelection(target, row.character, row.word,
                image => image === url ? 'available' : 'unverified');
            if (!selection.ok) return selection;
            Object.assign(target, selection.patch);
            Object.assign(target, adoptCharacterSeed(target, row.character, record.seed));
            plan.changed = true;
        }
        const result = withSprite ? await commit(row, plan, ctx.root) : { ok: true };
        if (!result?.ok) return result || fail('save-failed');
        const readback = deps.getContext(row);
        const savedAssets = readback && effectiveSceneAssets(readback.root, row.scopeKey);
        const entry = savedAssets?.characterOutfits?.[row.character]?.[row.word];
        const wardrobe = savedAssets?.wardrobe?.[entry?.wardrobe];
        if (!current(row) || wardrobe?.prompt !== row.prompt
            || (withSprite && entry?.moods?.平和 !== `${GENERATED_ASSET_URL_PREFIX}${row.imageId}`)) return fail('save-readback-failed');
        return { ok: true, saved: true, ...finish(row) };
    }

    return { observe, list,
        retry(id) {
            const row = candidates.get(id);
            if (!row) return Promise.resolve(fail('not-found'));
            if (!row.mode) return Promise.resolve(fail('choice-required'));
            return this.adopt(id, row.mode);
        },
        adopt(id, mode) {
            const row = candidates.get(id);
            if (!row || !['save', 'sprite'].includes(mode)) return Promise.resolve(fail('invalid-action'));
            if (adoptions.has(id)) return adoptions.get(id);
            row.mode = mode;
            const pending = Promise.resolve().then(async () => {
                return adopt(row, mode === 'sprite');
            }).catch(() => fail('story-outfit-failed')).then(result => {
                if (!result?.ok) {
                    const saved = row.saved === true || result?.saved === true;
                    row.status = saved ? 'saved' : 'failed';
                    row.reason = safeReason(result.reason) || 'story-outfit-failed';
                    result = { ...result, saved, reopen: !saved };
                    const stored = persist(row);
                    if (!stored.ok) result.warning = stored.reason;
                    if (result.reopen) deferred.delete(id);
                }
                return result;
            }).finally(() => { adoptions.delete(id); notify(); });
            adoptions.set(id, pending);
            notify();
            return pending;
        },
        defer(id) { deferred.add(id); notify(); },
        resume() { deferred.clear(); },
        dispose() { disposed = true; },
    };
}

const safeReason = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : '';
