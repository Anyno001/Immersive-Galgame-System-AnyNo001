import test from 'node:test';
import assert from 'node:assert/strict';

import { withTavernIllustrationFiles, CG_RECORDS_FILE } from '../src/media/tavern-image-files.js';
import { createMemoryIllustrationStore } from '../src/media/illustration-store.js';

// 假酒馆：user/files 下的 JSON 与 user/images/igs-cg 的文件名列表，记录上传。
function fakeTavern({ backup = null, names = [] } = {}) {
    const state = { backup, uploads: [] };
    const globalObject = {
        setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)),
        clearTimeout,
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        SillyTavern: { getContext: () => ({ getRequestHeaders: () => ({ 'Content-Type': 'application/json' }) }) },
        async fetch(url, options = {}) {
            if (String(url).startsWith(`/user/files/${CG_RECORDS_FILE}`)) {
                return state.backup ? { ok: true, status: 200, json: async () => state.backup } : { ok: false, status: 404 };
            }
            if (url === '/api/files/upload') {
                const body = JSON.parse(options.body);
                state.backup = JSON.parse(Buffer.from(body.data, 'base64').toString('utf8'));
                state.uploads.push(body.name);
                return { ok: true };
            }
            if (url === '/api/images/list') return { ok: true, json: async () => names };
            return { ok: false, status: 404 };
        },
    };
    return { globalObject, state };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('gate:cg-backup:records-are-mirrored-and-restored-after-cache-clear', async () => {
    const { globalObject, state } = fakeTavern();
    const first = withTavernIllustrationFiles(createMemoryIllustrationStore(), globalObject);
    await first.putSlot('角色 - 2026|3|0', { slot: 1, status: 'done', caption: 'rain', dataUrl: 'user/images/igs-cg/a.png' });
    await wait(30);
    assert.deepEqual(state.uploads, [CG_RECORDS_FILE]);
    assert.equal(state.backup.slots['角色 - 2026|3|0|1'].caption, 'rain');

    // 清缓存：换一个空的本地库，备份文件还在。
    const fresh = createMemoryIllustrationStore();
    const second = withTavernIllustrationFiles(fresh, globalObject);
    assert.deepEqual(await second.listSlotKeys(), ['角色 - 2026|3|0|1']);
    const raw = await fresh.getSlotRecord('角色 - 2026|3|0|1');
    assert.equal(raw.dataUrl, 'user/images/igs-cg/a.png', '记录补回本地，图仍指向酒馆文件');

    await second.deleteSlot('角色 - 2026|3|0', 1);
    await wait(30);
    assert.deepEqual(Object.keys(state.backup.slots), [], '删除同步进备份');
});

test('gate:cg-backup:existing-local-records-seed-the-backup-and-network-errors-never-overwrite-it', async () => {
    const store = createMemoryIllustrationStore();
    await store.putSlot('chat|1|0', { slot: 1, status: 'done', dataUrl: 'user/images/igs-cg/x.png' });
    await store.putSlot('chat|2|0', { slot: 1, status: 'done', dataUrl: 'data:image/png;base64,AAAA' });
    const { globalObject, state } = fakeTavern();
    await withTavernIllustrationFiles(store, globalObject).listSlotKeys();
    await wait(30);
    assert.deepEqual(Object.keys(state.backup.slots), ['chat|1|0|1'], '只备份已搬进酒馆文件夹的');

    const broken = fakeTavern({ backup: { version: 1, slots: { 'old|1|0|1': { slot: 1, dataUrl: 'user/images/igs-cg/o.png' } } } });
    const realFetch = broken.globalObject.fetch;
    broken.globalObject.fetch = async (url, options) => (String(url).startsWith('/user/files/') ? Promise.reject(new Error('net')) : realFetch(url, options));
    const wrapped = withTavernIllustrationFiles(createMemoryIllustrationStore(), broken.globalObject);
    await wrapped.putSlot('chat|9|0', { slot: 1, status: 'done', dataUrl: 'user/images/igs-cg/n.png' });
    await wait(30);
    assert.deepEqual(broken.state.uploads, [], '读不到备份时不上传，免得盖掉');
});

test('gate:cg-backup:floor-images-from-before-the-backup-are-recognised-by-file-name', async () => {
    const { globalObject } = fakeTavern({ names: ['chat_5_0_1@@dataUrl@0123456789abcdef.png', 'chat_5_0_2@@dataUrl@fedcba9876543210.webp', 'chat_50_0_1@@dataUrl@aaaaaaaaaaaaaaaa.png'] });
    const wrapped = withTavernIllustrationFiles(createMemoryIllustrationStore(), globalObject);
    globalObject.fetch = ((inner) => async (url, options) => (String(url).startsWith('/user/images/') ? { ok: true, blob: async () => new Blob(['x']) } : inner(url, options)))(globalObject.fetch);
    globalObject.FileReader = class { readAsDataURL() { this.result = 'data:image/png;base64,eA=='; this.onload(); } };
    const slots = await wrapped.getSlots('chat|5|0');
    assert.deepEqual(slots.map((s) => [s.slot, s.status]), [[1, 'done'], [2, 'done']], '只认这一楼的，第 50 楼的不算');
});


function candidateFilesFixture() {
    const f = fakeTavern();
    const files = new Map([['user/images/igs-cg/original.png', 'OLD']]);
    const deleted = [], uploaded = [];
    const originalFetch = f.globalObject.fetch;
    f.globalObject.FileReader = class { readAsDataURL(blob) { blob.text().then((data) => { this.result = `data:image/png;base64,${data}`; this.onload(); }); } };
    f.globalObject.fetch = async (url, options = {}) => {
        const body = options.body && JSON.parse(options.body);
        if (url === '/api/images/upload') {
            const path = `user/images/igs-cg/${body.filename}.png`;
            uploaded.push(path); files.set(path, body.image);
            return { ok: true, json: async () => ({ path }) };
        }
        if (url === '/api/images/delete') { deleted.push(body.path); files.delete(body.path); return { ok: true }; }
        if (String(url).startsWith('/user/images/')) return { ok: files.has(url.slice(1)), blob: async () => new Blob([files.get(url.slice(1))]) };
        return originalFetch(url, options);
    };
    return { ...f, files, deleted, uploaded };
}

test('gate:cg-accept:files-baseline-backup-and-restored-metadata', async () => {
    const f = candidateFilesFixture(), raw = createMemoryIllustrationStore();
    const before = await raw.putSlot('chat|5|0', { slot: 7, status: 'done', dataUrl: 'user/images/igs-cg/original.png',
        characterMeta: { version: 1, characters: [{ characterKey: 'A' }] }, caption: { scene: 'fixture' }, originalSize: { width: 128, height: 64 } });
    const wrapped = withTavernIllustrationFiles(raw, f.globalObject);
    const accepted = await wrapped.updateSlot('chat|5|0', 7, before.revision,
        { dataUrl: 'data:image/png;base64,NEW', updatedAt: 't1' }, { expectedToken: before.revisionToken, preserveBaseline: true });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.record.dataUrl, 'data:image/png;base64,NEW');
    const saved = await raw.getSlotRecord(before.key);
    assert.equal(saved.consistencyBaselineDataUrl, before.dataUrl);
    assert.deepEqual(saved.consistencyBaselineMeta.characterMeta, before.characterMeta);
    assert.equal(f.deleted.includes(before.dataUrl), false);
    await wait(30);
    const restored = createMemoryIllustrationStore();
    await withTavernIllustrationFiles(restored, f.globalObject).listSlotKeys();
    const copy = await restored.getSlotRecord(before.key);
    assert.deepEqual(copy.characterMeta, before.characterMeta);
    assert.deepEqual(copy.consistencyBaselineMeta, saved.consistencyBaselineMeta);
    assert.equal(copy.consistencyBaselineDataUrl, before.dataUrl);
    await wrapped.deleteSlot('chat|5|0', 7);
    assert.ok(f.deleted.includes(before.dataUrl));
    assert.ok(f.deleted.includes(saved.dataUrl));
});

test('gate:cg-accept:conflict-storage-failure-and-concurrent-accept-only-drop-new-files', async () => {
    for (const mode of ['conflict', 'storage', 'concurrent']) {
        const f = candidateFilesFixture(), raw = createMemoryIllustrationStore();
        const before = await raw.putSlot('chat|5|0', { slot: 7, status: 'done', dataUrl: 'user/images/igs-cg/original.png' });
        const underlying = mode === 'storage' ? { ...raw, updateSlot: async () => { throw new Error('fixture'); } } : raw;
        const wrapped = withTavernIllustrationFiles(underlying, f.globalObject);
        let live = true;
        if (mode === 'conflict') {
            const fetch = f.globalObject.fetch;
            f.globalObject.fetch = async (url, options) => { const result = await fetch(url, options);if (url === '/api/images/upload') live = false; return result; };
        }
        const write = () => wrapped.updateSlot('chat|5|0', 7, before.revision, { dataUrl: 'data:image/png;base64,NEW' },
            { expectedToken: before.revisionToken, preserveBaseline: true, shouldCommit: () => live });
        if (mode === 'storage') await assert.rejects(write(), /fixture/);
        else if (mode === 'conflict') assert.equal((await write()).reason, 'stale-target');
        else {
            const results = await Promise.all([write(), write()]);
            assert.equal(results.filter((r) => r.ok).length, 1);
            assert.equal(results.find((r) => !r.ok).reason, 'stale-revision');
        }
        assert.equal(f.deleted.includes(before.dataUrl), false, mode);
        assert.equal(f.uploaded.length, 1);
        if (mode !== 'concurrent') {
            assert.deepEqual(await raw.getSlotRecord(before.key), before);
            assert.deepEqual(f.deleted, f.uploaded);
        }
    }
});

for (const source of ['saved', 'candidate']) test(`gate:cg-catalog:文件恢复后重画与采用-${source}`, async () => {
    const { createIndexedDbIllustrationStore } = await import('../src/media/illustration-store.js');
    const { createTransactionalIdb } = await import('./helpers/transactional-idb.js');
    const { characterViewsFixture } = await import('./helpers/prompt-provenance.js');
    const { cgPromptTask, cgPaintRequests, completedCgOutfitAnchor } = await import('../src/generated-images/illustration/cg-character-bindings.js');
    const { buildCgOutfitCatalog } = await import('../src/generated-images/illustration/cg-outfit-catalog.js');
    const { parseTemplateCaptionSlots } = await import('../src/generated-images/illustration/template-caption-parser.js');
    const { prepareCharacterCaption } = await import('../src/generated-images/character-caption.js');
    const { promptSnapshotFromBody } = await import('../src/generated-images/final-caption.js');
    const { promptProvenance, storedPromptFromResult } = await import('../src/generated-images/generation-prompt.js');
    const { outfitAdoptionEvidence, prepareOutfitAdoption, savedCharacterOutfits } = await import('../src/scene/outfit-identity.js');
    const assets = { characterDna: { Alice: { version: 2, views: characterViewsFixture() } },
        characterOutfits: { Alice: { Coat: { wardrobe: 'coat', moods: {} } } },
        wardrobe: { coat: { prompt: 'wears a 1.2::navy coat:: with $1 trim' } } };
    const task = cgPromptTask([{ characterKey: 'Alice', dna: assets.characterDna.Alice,
        outfits: savedCharacterOutfits(assets, 'Alice'), outfit: { name: 'Story dress', description: '' } }],
    { outfitSelection: 'catalog' });
    const reply = ['slotid: 1', 'at: 1', 'prompt_mode: dna_template', 'outfit_mode: template',
        'scene: A quiet studio.', 'scene_uc:', 'char: 0.5,0.5 | <<dna:r0>> <<outfit:r0>> and waves.', 'char_uc:',
        'meta_kind: 0 | named', 'meta_key: 0 | Alice', 'meta_token: 0 | r0', 'meta_frame: 0 | half_body',
        `meta_outfit_id: 0 | ${source === 'saved' ? '1' : ''}`,
        `meta_outfit_name: 0 | ${source === 'saved' ? 'Coat' : 'New shirt'}`,
        'meta_outfit_description: 0 | wears a red shirt'].join('\n');
    const parsed = parseTemplateCaptionSlots(reply, { ...task,
        outfitCatalog: buildCgOutfitCatalog(task.characterContext), outputs: { selection: 'numbered-text', paragraphCount: 1 } });
    assert.equal(parsed.ok, true, parsed.error);
    const request = { ...task, ...parsed.captions[0], outfitAnchor: { version: 1, offset: 12, characters: [] } };
    const prepared = prepareCharacterCaption(request);
    assert.equal(prepared.ok, true, prepared.error);
    const sentPrompt = promptSnapshotFromBody({ model: 'nai-diffusion-5-full', action: 'generate', parameters: prepared.caption }, null);
    const result = { ...prepared, sentPrompt };
    const fixture = { ...promptProvenance(result), caption: prepared.caption, characterMeta: prepared.characterMeta,
        prompt: storedPromptFromResult(result), ...outfitAdoptionEvidence(request, result),
        ...completedCgOutfitAnchor(request, result) };
    const f = candidateFilesFixture();
    const first = withTavernIllustrationFiles(createIndexedDbIllustrationStore({ indexedDB: createTransactionalIdb() }), f.globalObject);
    await first.putSlot('catalog|3|0', { ...fixture, slot: 1, status: 'done', dataUrl: 'data:image/png;base64,T0xE' });
    await wait(40);
    const fresh = createIndexedDbIllustrationStore({ indexedDB: createTransactionalIdb() });
    const restored = withTavernIllustrationFiles(fresh, f.globalObject);
    await restored.listSlotKeys();
    const record = await fresh.getSlotRecord('catalog|3|0|1');
    for (const field of ['promptRecipe', 'outfitSnapshot', 'outfitContext', 'outfitAnchor', 'promptTask', 'sentPrompt'])
        assert.deepEqual(record[field], fixture[field], field);
    assert.match(record.dataUrl, /^user\/images\/igs-cg\//);
    const adoption = prepareOutfitAdoption(assets, 'Alice', record.key, record);
    assert.equal(adoption.ok, true, JSON.stringify(adoption));
    if (source === 'saved') assert.deepEqual(adoption.patch, {});
    else assert.ok(adoption.patch.characterOutfits.Alice['New shirt']);
    const changed = structuredClone(assets);
    changed.wardrobe.coat.prompt = 'wears a green coat';
    const repaint = cgPaintRequests([record], changed)[0];
    assert.equal(repaint.preflightFailure, null);
    const rerolled = prepareCharacterCaption(repaint);
    assert.equal(rerolled.ok, true, rerolled.error);
    assert.deepEqual(rerolled.outfitSnapshot, record.outfitSnapshot);
    assert.deepEqual(rerolled.caption, prepared.caption);
    const evidence = outfitAdoptionEvidence(repaint, rerolled);
    assert.deepEqual(evidence.outfitContext[0].outfits, savedCharacterOutfits(changed, 'Alice'));
    const adoptedAfterReroll = prepareOutfitAdoption(changed, 'Alice', record.key,
        { ...record, ...evidence, ...rerolled });
    assert.equal(adoptedAfterReroll.ok, true, JSON.stringify(adoptedAfterReroll));
});

test('gate:cg-backup:三阶段资料经 IDB 写口、文件备份和清缓存恢复', async () => {
    const { createIndexedDbIllustrationStore } = await import('../src/media/illustration-store.js');
    const { createTransactionalIdb } = await import('./helpers/transactional-idb.js');
    const { provenanceFixture } = await import('./helpers/prompt-provenance.js');
    const { promptProvenance } = await import('../src/generated-images/generation-prompt.js');
    const fixture = provenanceFixture(), f = candidateFilesFixture();
    const first = withTavernIllustrationFiles(createIndexedDbIllustrationStore({ indexedDB: createTransactionalIdb() }), f.globalObject);
    const before = await first.putSlot('fixture|3|0', { slot: 1, status: 'done', dataUrl: 'data:image/png;base64,T0xE',
        caption: fixture.caption, prompt: fixture.prompt, characterMeta: fixture.characterMeta, ...promptProvenance(fixture) });
    const saved = await first.updateSlot('fixture|3|0', 1, before.revision,
        { dataUrl: 'data:image/png;base64,TkVX' }, { expectedToken: before.revisionToken, preserveBaseline: true });
    assert.equal(saved.ok, true);
    await wait(40);
    const fresh = createIndexedDbIllustrationStore({ indexedDB: createTransactionalIdb() });
    const restored = withTavernIllustrationFiles(fresh, f.globalObject);
    await restored.listSlotKeys();
    const raw = await fresh.getSlotRecord('fixture|3|0|1');
    for (const field of ['promptRecipe', 'dnaSnapshot', 'sentPrompt']) {
        assert.deepEqual(raw[field], fixture[field], field);
        assert.deepEqual(raw.consistencyBaselineMeta[field], fixture[field], `baseline:${field}`);
    }
    assert.match(raw.dataUrl, /^user\/images\/igs-cg\//);
    assert.equal(JSON.stringify(raw.sentPrompt).includes('base64'), false);
    assert.equal((await restored.getSlots('fixture|3|0'))[0].dataUrl, 'data:image/png;base64,TkVX');
});

for (const variant of ['旧记录', '校正', '衣装来源']) test(`gate:cg-consistency:文件 offload 清除整图 wire 并保真恢复轮次与基线-${variant}`, async () => {
    const appearanceCorrection = variant !== '旧记录', appearance = variant === '衣装来源';
    const { createIndexedDbIllustrationStore } = await import('../src/media/illustration-store.js');
    const { createTransactionalIdb } = await import('./helpers/transactional-idb.js');
    const { provenanceFixture, consistencyProvenanceFixture } = await import('./helpers/prompt-provenance.js');
    const { promptProvenance, storedPromptFromResult } = await import('../src/generated-images/generation-prompt.js');
    const fixture = provenanceFixture(), consistencyPrompt = consistencyProvenanceFixture({ appearanceCorrection, appearance });
    assert.deepEqual(promptProvenance({ consistencyPrompt }).consistencyPrompt, consistencyPrompt);
    const f = candidateFilesFixture(), indexedDB = createTransactionalIdb();
    const rawStore = createIndexedDbIllustrationStore({ indexedDB });
    const first = withTavernIllustrationFiles(rawStore, f.globalObject);
    const before = await first.putSlot('fixture|3|0', { slot: 1, status: 'done', dataUrl: 'data:image/png;base64,T0xE',
        caption: fixture.caption, prompt: fixture.prompt, characterMeta: fixture.characterMeta,
        ...promptProvenance(fixture), consistencyPrompt });
    const { sentPrompt, ...scene } = fixture;
    const accepted = await first.updateSlot('fixture|3|0', 1, before.revision,
        { dataUrl: 'data:image/png;base64,TkVX', ...promptProvenance(scene),
            prompt: storedPromptFromResult({ ...scene, prompt: undefined }), consistencyPrompt },
        { expectedToken: before.revisionToken, preserveBaseline: true, clearSentPrompt: true });
    assert.equal(accepted.ok, true);
    const stored = await createIndexedDbIllustrationStore({ indexedDB }).getSlotRecord(before.key);
    assert.equal(stored.sentPrompt, undefined);
    assert.equal(stored.prompt.sentPrompt, undefined);
    assert.deepEqual(stored.consistencyPrompt, consistencyPrompt);
    assert.deepEqual(stored.consistencyBaselineMeta.consistencyPrompt, consistencyPrompt);
    assert.deepEqual(stored.consistencyBaselineMeta.sentPrompt, sentPrompt);
    assert.match(stored.dataUrl, /^user\/images\/igs-cg\//);
    assert.equal(f.deleted.includes(stored.consistencyBaselineDataUrl), false);
    await wait(40);
    const fresh = createIndexedDbIllustrationStore({ indexedDB: createTransactionalIdb() });
    const restored = withTavernIllustrationFiles(fresh, f.globalObject);
    await restored.listSlotKeys();
    const copy = await fresh.getSlotRecord(before.key);
    for (const field of ['prompt', 'promptRecipe', 'dnaSnapshot', 'consistencyPrompt', 'consistencyBaselineMeta'])
        assert.deepEqual(copy[field], stored[field], field);
    assert.equal(copy.sentPrompt, undefined);
    assert.equal(Object.hasOwn(copy.promptRecipe, 'identityMode'), false, '正式场景不成为工作模板');
    const round = copy.consistencyPrompt.rounds[0];
    assert.equal(round.promptRecipe.identityMode, appearanceCorrection ? 'appearance_correction' : undefined);
    if (appearance) {
        assert.equal(round.appearance.requestedOutfit, 'Coat');
        assert.equal(round.appearance.effectiveOutfit, 'Coat');
        assert.equal(round.appearance.reference.url, 'igs-gen:wardrobe-source');
        assert.match(round.appearance.reference.sourceId, /^[0-9a-f]{16}$/);
        assert.equal(round.appearance.reference.revision, 3);
        assert.equal(round.appearance.ownerKey, 'card:A');
        assert.equal(JSON.stringify(round.appearance).includes('sourceToken'), false);
    } else assert.equal(Object.hasOwn(round, 'appearance'), false, '旧记录不补来源');
    for (const c of round.dnaSnapshot.characters) {
        assert.equal(c.application, appearanceCorrection ? 'appearance_correction' : undefined);
        assert.deepEqual(c.profile, fixture.dnaSnapshot.characters[0].profile);
        if (appearanceCorrection) {
            assert.equal(c.subject, round.promptRecipe.bindings[c.captionIndex].correction.subject);
            assert.equal(c.negative, round.promptRecipe.bindings[c.captionIndex].correction.negative);
        }
    }
    assert.equal((await restored.getSlots('fixture|3|0'))[0].dataUrl, 'data:image/png;base64,TkVX');
});


for (const phase of ['upload', 'preflight', 'transaction', 'accepted']) test(`gate:cg-consistency:文件上传与提交租约 ${phase}`, async () => {
    const { createIndexedDbIllustrationStore } = await import('../src/media/illustration-store.js');
    const { createTransactionalIdb } = await import('./helpers/transactional-idb.js');
    const { provenanceFixture } = await import('./helpers/prompt-provenance.js');
    const { promptProvenance } = await import('../src/generated-images/generation-prompt.js');
    const fixture = provenanceFixture(), f = candidateFilesFixture();
    const indexedDB = createTransactionalIdb(), raw = createIndexedDbIllustrationStore({ indexedDB });
    const before = await raw.putSlot('fixture|3|0', { slot: 1, status: 'done', dataUrl: 'user/images/igs-cg/original.png',
        caption: fixture.caption, prompt: fixture.prompt, ...promptProvenance(fixture) });
    let current = true, checks = 0, commits = 0;
    const fetch = f.globalObject.fetch;
    f.globalObject.fetch = async (url, options) => {
        const result = await fetch(url, options);
        if (url === '/api/images/upload' && phase === 'upload') current = false;
        return result;
    };
    const update = raw.updateSlot;
    raw.updateSlot = async (...args) => {
        commits++;
        assert.equal(args[4].beforeCommit, undefined, '文件层消费异步复核，事务内不重复等待');
        const result = update(...args);
        if (phase === 'transaction') current = false;
        return result;
    };
    const wrapped = withTavernIllustrationFiles(raw, f.globalObject);
    const save = () => wrapped.updateSlot('fixture|3|0', 1, before.revision,
        { dataUrl: 'data:image/png;base64,TkVX' }, { expectedToken: before.revisionToken, preserveBaseline: true,
            async beforeCommit() {
                checks++;
                assert.equal(f.uploaded.length, 1, '复核必须在上传后');
                if (phase === 'preflight') throw new Error('fixture-config-read-failed');
                if (!current) throw new Error('stale-config');
            }, shouldCommit: () => current });
    if (['upload', 'preflight'].includes(phase)) await assert.rejects(save(), /stale-config|fixture-config-read-failed/);
    else assert.equal((await save()).ok, phase === 'accepted');
    assert.equal(checks, 1);
    assert.equal(commits, ['upload', 'preflight'].includes(phase) ? 0 : 1);
    assert.equal(f.deleted.includes(before.dataUrl), false);
    const saved = await createIndexedDbIllustrationStore({ indexedDB }).getSlotRecord(before.key);
    if (phase === 'accepted') {
        assert.notEqual(saved.revisionToken, before.revisionToken);
        assert.equal(saved.consistencyBaselineDataUrl, before.dataUrl);
    } else {
        assert.deepEqual(saved, before, '拒绝后正文、来源与原图逐字段保真');
        assert.deepEqual(f.deleted, f.uploaded, '只清理本次新上传文件');
    }
});


for (const fault of ['network', 'schema', 'record', 'pending']) test(`gate:cg-backup:引用未读全拒绝清理-${fault}`, async () => {
    const f = fakeTavern({ backup: fault === 'schema' ? { slots: {} }
        : { version: 1, slots: { 'chat|1|0|1': null } } });
    let finish;
    if (fault === 'network') f.globalObject.fetch = async () => { throw new Error('fixture-network'); };
    if (fault === 'pending') f.globalObject.fetch = () => new Promise(resolve => { finish = resolve; });
    const raw = createMemoryIllustrationStore();
    const wrapped = withTavernIllustrationFiles(raw, f.globalObject);
    await assert.rejects(wrapped.listSlotKeys({ requireComplete: true }), /image-reference-unavailable/);
    assert.deepEqual(await raw.listSlotKeys(), []);
    assert.deepEqual(f.state.uploads, []);
    if (finish) {
        finish({ ok: false, status: 404 });
        await wait(20);
        assert.deepEqual(await wrapped.listSlotKeys({ requireComplete: true }), []);
    }
});

test('gate:cg-consistency:衣装来源严格拒收并剔除私有租约', async () => {
    const { consistencyProvenanceFixture } = await import('./helpers/prompt-provenance.js');
    const { promptProvenance } = await import('../src/generated-images/generation-prompt.js');
    const valid = consistencyProvenanceFixture({ appearanceCorrection: true, appearance: true });
    assert.deepEqual(promptProvenance({ consistencyPrompt: valid }).consistencyPrompt, valid);
    const changes = [
        a => { a.version = 2; },
        a => { a.effectiveOutfit = 'Other'; },
        a => { a.selectionSource = 'legacy-default'; },
        a => { a.selectionSource = 'default-fallback'; a.confirmed = false; },
        a => { a.reference.sourceId = 'invalid'; },
        a => { a.reference.url = 'https://fixture.invalid/image?token=private'; },
        a => { a.reference.url = 'data:image/png;base64,QQ=='; },
        a => { a.reference.revision = {}; },
    ];
    for (const change of changes) {
        const consistencyPrompt = structuredClone(valid);
        change(consistencyPrompt.rounds[0].appearance);
        assert.throws(() => promptProvenance({ consistencyPrompt }));
    }
    const privateFields = structuredClone(valid);
    privateFields.rounds[0].appearance.sourceToken = 'memory-only';
    privateFields.rounds[0].appearance.reference.dataUrl = 'private-pixels';
    assert.deepEqual(promptProvenance({ consistencyPrompt: privateFields }).consistencyPrompt, valid);
    const fallback = structuredClone(valid);
    Object.assign(fallback.rounds[0].appearance, { requestedOutfit: 'Dress', selectionSource: 'default-fallback',
        fallbackReason: 'outfit-image-missing', confirmed: true });
    assert.deepEqual(promptProvenance({ consistencyPrompt: fallback }).consistencyPrompt, fallback);
});
