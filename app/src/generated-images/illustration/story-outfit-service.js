import { recoverOperation } from '../../storage/automatic-recovery.js';
import { adoptCharacterSeed } from '../../scene/generation-seeds.js';
// 剧情衣装候选：手动选择或显式开启自动流程后，沿同一入口写词、入库及生成立绘。
import { resolveCharacterKey } from '../../scene/scene-directives.js';
import { createOutfitResolver, isValidOutfitName, isBuiltinNudeOutfit, resolveWardrobePrompt } from '../../scene/character-outfits.js';
import { assetOwnerKey, effectiveSceneAssets, ensureCardLibrary } from '../../scene/asset-scope.js';
import { prepareStoryOutfitAdoption, prepareOutfitAdoption, prepareOutfitDnaSave } from '../../scene/outfit-identity.js';
import { prepareInitialDefaultOutfitSelection } from '../../scene/character-appearance.js';
import { loadStoryOutfitCandidates, saveStoryOutfitCandidate, removeStoryOutfitCandidate, storyOutfitId, storyOutfitKey } from '../../scene/outfit-review-store.js';
import { normalizeCharacterDna, readCharacterDnaView } from '../../scene/character-dna.js';
import { GENERATED_ASSET_URL_PREFIX, setGeneratedExpressionNote } from '../../scene/asset-match.js';
import { promptProvenance } from '../generation-prompt.js';
import { characterPromptRecovery } from './character-prompt-task.js';

const fields = ['characters', 'characterDna', 'characterOutfits'];
const fail = (reason, error = '正在自动完成衣装处理') => ({ ok: false, reason, error });

export function createStoryOutfitService(deps) {
    const candidates = new Map(), adoptions = new Map(), deferred = loadDeferred(deps.storage);
    let disposed = false;
    const recoveryController = new AbortController();
    const loaded = loadStoryOutfitCandidates(deps.storage);
    if (loaded.ok) for (const row of loaded.items) candidates.set(row.id, { ...row,
        saved: row.status === 'saved', status: row.status === 'saved' || row.status === 'failed' ? row.status : row.prompt ? 'ready' : 'pending' });
    const current = (row) => {
        const ctx = deps.getContext(row);
        return !disposed && ctx && ctx.scopeKey === row.scopeKey && ctx.floorKey === row.floorKey
            && ctx.messageId === row.messageId;
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
        row.prompt = prompt;
        if (result.promptHalfBody !== undefined) row.promptHalfBody = result.promptHalfBody;
        row.status = 'ready'; row.reason = '';
        return persist(row);
    }

    // 正文指纹记录来源；同一回复里的同角色、同衣装只处理一次。
    // 旧重复项优先使用已生成图片、完整衣装及半身资料，其余记录仍保留。
    function rowsForContext(context) {
        const rows = new Map();
        for (const row of candidates.values()) {
            if (!context || row.floorKey !== context.floorKey || row.scopeKey !== context.scopeKey || !current(row)) continue;
            const key = storyOutfitKey(row);
            const rank = (row.imageId ? 4 : 0) + (row.prompt ? 2 : 0) + (row.promptHalfBody ? 1 : 0);
            if (!rows.has(key) || rank > rows.get(key).rank) rows.set(key, { row, rank });
        }
        return [...rows.values()].map(value => value.row);
    }

    function observe(directives, ctx = deps.getContext()) {
        if (disposed) return fail('disposed');
        const fresh = loadStoryOutfitCandidates(deps.storage);
        if (!fresh.ok) return fresh;
        // CG 完成可在服务创建后暂存新候选；同步时不覆盖在途任务和同图恢复状态。
        for (const row of fresh.items) {
            if (!candidates.has(row.id)) candidates.set(row.id, { ...row,
                saved: row.status === 'saved', status: row.status === 'saved' || row.status === 'failed' ? row.status : row.prompt ? 'ready' : 'pending' });
        }
        if (!ctx || !Number.isSafeInteger(ctx.messageId) || !ctx.floorKey || !ctx.sourceHash) return fail('stale-target');
        const assets = effectiveSceneAssets(ctx.root, ctx.scopeKey);
        if (assets.wardrobeAutoFlow === false && ctx.autoGenerate !== true) return { ok: true };
        const resolver = createOutfitResolver(assets);
        const known = { ...assets.characterDna, ...assets.characters, ...assets.characterOutfits };
        const seen = new Set([...candidates.values()].map(storyOutfitKey));
        for (const directive of directives || []) {
            const word = directive?.unknownOutfit;
            if (!word || !isValidOutfitName(word) || isBuiltinNudeOutfit(word)) continue;
            const character = resolveCharacterKey(known, assets.characterAliases, directive.character);
            if (!character || resolver(character, word)) continue;
            const ownerKey = assetOwnerKey(ctx.root, ctx.scopeKey, fields, character);
            const id = storyOutfitId({ ...ctx, ownerKey, character, word });
            const row = { id, character, word, ownerKey, scopeKey: ctx.scopeKey, floorKey: ctx.floorKey,
                sourceHash: ctx.sourceHash, messageId: ctx.messageId, status: 'pending' };
            const key = storyOutfitKey(row);
            if (seen.has(key)) continue;
            candidates.set(id, row);
            const saved = persist(row);
            if (!saved.ok) return saved;
            seen.add(key);
        }
        return { ok: true };
    }

    function list({ includeDeferred = false, context = deps.getContext() } = {}) {
        return rowsForContext(context).filter(row => (!deps.isVisible || deps.isVisible(row))
            && (includeDeferred || (!deferred.has(deferKey(row)) && !adoptions.has(storyOutfitKey(row)) && row.status !== 'saved'))
            && row.status !== 'done' && (row.saved || !handled(row)))
            .map(row => ({ ...row, choices: [
                { value: 'save', label: '仅入库衣柜' },
                { value: 'sprite', label: row.imageId ? '入库并采用已生成立绘' : '入库并用保存 DNA 生成立绘' },
                ...aliasChoices(row),
            ] }));
    }

    // 归入已有衣装：默认衣装排第一，正文写法记成该衣装的别名；不写词、不出图。
    function aliasChoices(row) {
        const ctx = deps.getContext(row);
        if (!ctx) return [];
        const assets = effectiveSceneAssets(ctx.root, row.scopeKey);
        const outfits = assets.characterOutfits?.[row.character] || {};
        const names = Object.keys(outfits).filter(isValidOutfitName);
        const selected = assets.characterDefaultOutfits?.[row.character];
        const def = selected?.version === 1 && names.includes(selected.outfitName) ? selected.outfitName
            : names.find(name => outfits[name]?.default === true) || '';
        return [...(def ? [def] : []), ...names.filter(name => name !== def)].map(name => ({ value: `o:${name}`,
            label: name === def ? `归入默认衣装「${name}」（加别名）` : `归入「${name}」（加别名）` }));
    }
    async function aliasOutfit(row, name) {
        if (!current(row)) return fail('stale-target');
        const ctx = deps.getContext(row), next = structuredClone(ctx.root);
        const owner = assetOwnerKey(ctx.root, row.scopeKey, fields, row.character);
        const target = owner ? ensureCardLibrary(next, owner) : next;
        const entry = target.characterOutfits?.[row.character]?.[name];
        if (!entry || typeof entry !== 'object') return fail('OUTFIT_ADOPTION_CONFLICT');
        entry.words = Array.isArray(entry.words) ? entry.words : [];
        if (!entry.words.includes(row.word)) entry.words.push(row.word);
        const saved = await commit(row, { changed: true, sceneAssets: next }, ctx.root);
        if (!saved?.ok) return saved || fail('save-failed');
        const readback = deps.getContext(row);
        if (!readback || createOutfitResolver(effectiveSceneAssets(readback.root, row.scopeKey))(row.character, row.word) !== name)
            return fail('save-readback-failed');
        return { ok: true, saved: true, aliased: name, ...finish(row) };
    }

    function savedOutfit(row) {
        const ctx = deps.getContext(row);
        const assets = ctx && effectiveSceneAssets(ctx.root, row.scopeKey);
        const entry = assets?.characterOutfits?.[row.character]?.[row.word];
        const clothing = resolveWardrobePrompt(assets?.wardrobe, entry, row.word);
        if (clothing?.prompt) {
            row.prompt = clothing.prompt;
            if (clothing.promptHalfBody !== undefined) row.promptHalfBody = clothing.promptHalfBody;
        }
        return current(row) && Boolean(clothing?.prompt);
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
        const owner = assetOwnerKey(ctx.root, row.scopeKey, fields, row.character);
        const target = owner ? ensureCardLibrary(next, owner) : next;
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
            if (!row.imageId && typeof deps.assets.prepareExternalSpriteDna === 'function') {
                const prepared = await deps.assets.prepareExternalSpriteDna({ name: row.character,
                    dna: effectiveSceneAssets(ctx.root, ctx.scopeKey).characterDna?.[row.character],
                    ...(deps.signal && { signal: deps.signal }),
                    shouldStart: () => current(row),
                });
                if (!prepared?.ok) return prepared || fail('dna-write-failed');
                if (!current(row)) return fail('stale-target');
                ctx = deps.getContext(row);
            }
            const assets = effectiveSceneAssets(ctx.root, ctx.scopeKey);
            const dna = normalizeCharacterDna(assets.characterDna?.[row.character]);
            const template = deps.assets.usesCharacterTemplates?.(dna) === true;
            if (template) {
                const view = readCharacterDnaView(dna, 'half_body');
                if (!view.ok) return view;
            }
            // 本次只写该衣装的平和图；其它角色、衣装和设置在生成中可以正常保存。
            const paintCurrent = () => current(row);
            if (!row.imageId) {
                row.status = 'painting'; notify();
                const result = await deps.assets.generateExpressionSet({ name: row.character, dna,
                    outfit: { name: row.word, prompt: row.prompt,
                        ...(row.promptHalfBody !== undefined && { promptHalfBody: row.promptHalfBody }) }, moods: ['平和'],
                    messageId: row.messageId, ...(deps.signal && { signal: deps.signal }),
                    shouldStart: paintCurrent,
                    ...(template && { onOutfitDna: async clothing => {
                        if (!paintCurrent() || clothing.name !== row.word) return fail('stale-target');
                        const latest = deps.getContext(row), next = structuredClone(latest.root);
                        const effective = effectiveSceneAssets(latest.root, row.scopeKey);
                        const owner = assetOwnerKey(latest.root, row.scopeKey, fields, row.character);
                        const target = owner ? ensureCardLibrary(next, owner) : next;
                        const prepared = prepareOutfitDnaSave(target, row.character, row.word, clothing.description,
                            { readWardrobe: effective.wardrobe, descriptionHalfBody: clothing.descriptionHalfBody });
                        if (!prepared.ok) return prepared;
                        Object.assign(target, prepared.patch);
                        const saved = await commit(row, { changed: Object.keys(prepared.patch).length > 0,
                            sceneAssets: next }, latest.root);
                        if (!saved?.ok) return saved || fail('save-failed');
                        if (!paintCurrent()) return fail('stale-target');
                        const readback = effectiveSceneAssets(deps.getContext(row).root, row.scopeKey);
                        const actual = resolveWardrobePrompt(readback.wardrobe,
                            readback.characterOutfits?.[row.character]?.[row.word], row.word);
                        return actual?.prompt === clothing.description
                            && actual.promptHalfBody === clothing.descriptionHalfBody
                            ? { ok: true } : fail('save-readback-failed');
                    } }) });
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
            if (!paintCurrent()) return fail('stale-target');
            ctx = deps.getContext(row);
            const identity = record?.outfitContext?.filter(c => c.characterKey === row.character);
            const clothing = record?.outfitSnapshot?.characters?.filter(c => c.characterKey === row.character);
            if (!record?.dataUrl || record.id !== row.imageId || record.type !== 'sprite'
                || record.promptEdited || record.edited || record.dnaCandidates !== undefined
                || (template ? identity?.length !== 1 || clothing?.length !== 1
                    || clothing[0].name !== row.word
                    : record.generationTarget?.characterKey !== row.character
                        || record.generationTarget?.outfitName !== row.word))
                return fail('outfit-image-evidence-invalid');
            const checked = prepareOutfitAdoption(effectiveSceneAssets(ctx.root, row.scopeKey), row.character, row.imageId, record);
            if (!checked.ok) return checked;
            plan = { changed: true, sceneAssets: structuredClone(ctx.root) };
            const owner = assetOwnerKey(ctx.root, row.scopeKey, fields, row.character);
            const target = owner ? ensureCardLibrary(plan.sceneAssets, owner) : plan.sceneAssets;
            if (checked.patch.characterOutfits) target.characterOutfits = { ...target.characterOutfits,
                [row.character]: checked.patch.characterOutfits[row.character] };
            if (checked.patch.wardrobe) {
                const effective = effectiveSceneAssets(ctx.root, row.scopeKey);
                target.wardrobe = { ...target.wardrobe, ...Object.fromEntries(Object.entries(checked.patch.wardrobe)
                    .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(effective.wardrobe?.[key]))) };
            }
            const outfit = target.characterOutfits?.[row.character]?.[row.word];
            if (!outfit) return fail('OUTFIT_ADOPTION_CONFLICT');
            const url = `${GENERATED_ASSET_URL_PREFIX}${row.imageId}`;
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
        if (!current(row)
            || (withSprite && entry?.moods?.平和 !== `${GENERATED_ASSET_URL_PREFIX}${row.imageId}`)) return fail('save-readback-failed');
        return { ok: true, saved: true, ...finish(row) };
    }

    return { observe, list,
        // 只自动领取尚未处理的候选；在途、失败与已保存结果不因重绘重复付费。
        autoGenerate(ctx = deps.getContext()) {
            if (disposed || ctx?.autoGenerate !== true) return Promise.resolve([]);
            const rows = rowsForContext(ctx).filter(row => row.status === 'pending' && !row.reason && !row.mode
                && !deferred.has(deferKey(row)) && !adoptions.has(storyOutfitKey(row)) && !handled(row));
            return Promise.all(rows.map(async row => {
                let result;
                try { result = await this.adopt(row.id, 'sprite'); }
                catch (error) { result = { ok: false, reason: 'story-outfit-failed',
                    error: error?.message || '衣装自动处理失败' }; }
                try { await deps.onAutoResult?.({ ...row }, result); }
                catch { /* 展示异常不改变已完成的保存和生成结果。 */ }
                return result;
            }));
        },
        retry(id) {
            const row = candidates.get(id);
            if (!row) return Promise.resolve(fail('not-found'));
            if (!row.mode) return Promise.resolve(fail('choice-required'));
            return this.adopt(id, row.mode);
        },
        adopt(id, mode) {
            const row = candidates.get(id);
            if (!row || !['save', 'sprite'].includes(mode)) return Promise.resolve(fail('invalid-action'));
            const key = storyOutfitKey(row);
            if (adoptions.has(key)) return adoptions.get(key);
            row.mode = mode;
            const pending = recoverOperation(() => adopt(row, mode === 'sprite'), {
                signal: recoveryController.signal, isActive: () => current(row),
                onRecover: () => { row.status = row.saved ? 'saved' : 'recovering'; notify(); },
            }).then(result => {
                if (!result?.ok) {
                    const saved = row.saved === true || result?.saved === true;
                    row.status = saved ? 'saved' : 'failed';
                    row.reason = safeReason(result.reason) || 'story-outfit-failed';
                    result = { ...result, saved, reopen: !saved };
                    const stored = persist(row);
                    if (!stored.ok) result.warning = stored.reason;
                    if (result.reopen && deferred.delete(deferKey(row))) saveDeferred(deps.storage, deferred);
                }
                return result;
            }).finally(() => { adoptions.delete(key); notify(); });
            adoptions.set(key, pending);
            notify();
            return pending;
        },
        defer(id) {
            const row = candidates.get(id);
            if (row) { deferred.add(deferKey(row)); saveDeferred(deps.storage, deferred); }
            notify();
        },
        // 只从存储补齐其他实例记下的「稍后」，不清空。
        resume() { for (const key of loadDeferred(deps.storage)) deferred.add(key); },
        alias(id, name) {
            const row = candidates.get(id);
            if (!row || typeof name !== 'string' || !isValidOutfitName(name)) return Promise.resolve(fail('invalid-action'));
            const key = storyOutfitKey(row);
            if (adoptions.has(key)) return adoptions.get(key);
            const pending = aliasOutfit(row, name).then(result => {
                if (!result?.ok) { row.reason = safeReason(result?.reason) || 'story-outfit-failed'; persist(row); }
                return result;
            }).finally(() => { adoptions.delete(key); notify(); });
            adoptions.set(key, pending);
            notify();
            return pending;
        },
        dispose() { disposed = true; recoveryController.abort(); },
    };
}

const safeReason = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : '';

// 「稍后」按卡、归属、人物与衣装记，不含楼层与正文指纹：之后的回复再写同一件新衣服也不再弹，仍留在「素材 → 待确认」。
const DEFERRED_KEY = 'igs:story-outfit-deferred:v1';
const DEFERRED_LIMIT = 200;
const deferKey = row => JSON.stringify([row.scopeKey, row.ownerKey, row.character, row.word]);
function loadDeferred(storage) {
    try {
        const list = JSON.parse(storage?.getItem?.(DEFERRED_KEY) || '[]');
        return new Set(Array.isArray(list) ? list.filter(key => typeof key === 'string') : []);
    } catch { return new Set(); }
}
function saveDeferred(storage, set) {
    try { storage?.setItem?.(DEFERRED_KEY, JSON.stringify([...set].slice(-DEFERRED_LIMIT))); return true; }
    catch { return false; }
}
