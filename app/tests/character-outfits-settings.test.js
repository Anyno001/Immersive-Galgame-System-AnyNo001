import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSpriteKeys } from '../src/visual/igs-ui/sprite-key-migration.js';
import { handleOutfitAction } from '../src/visual/igs-ui/settings-outfit-actions.js';
import { handleSettingsAction } from '../src/visual/igs-ui/settings-actions.js';
import { renderCharacterAssetList } from '../src/visual/igs-ui/settings-fields.js';

const L = (o) => ({ posX: o, posY: o, scale: 100 + o });
const H = (o) => ({ x: o / 10, top: o / 10, w: 0.2 });

function sampleSettings() {
    return {
        spriteLayouts: {
            pc: L(1),
            'pc::小林海斗': L(2),
            'pc::小林海斗::喜悦': L(3),
            'mobile::小林海斗::喜悦': L(4),
            'pc::小林海斗|泳装': L(5),
            'pc::小林海斗|泳装::喜悦': L(6),
            'pc::小林海斗|校服::喜悦': L(7),
            'pc::小林': L(8),
            'pc::小林::喜悦': L(9),
        },
        spriteHeads: {
            小林海斗: H(2),
            '小林海斗::喜悦': H(3),
            '小林海斗|泳装': H(5),
            '小林海斗|泳装::喜悦': H(6),
            小林: H(8),
        },
    };
}

test('gate:outfits:migrate-keys-character-rename-moves-all-identities-not-prefix-lookalikes', () => {
    const rs = sampleSettings();
    const report = migrateSpriteKeys(rs, { character: '小林海斗' }, { character: '海斗' });
    assert.deepEqual(Object.keys(rs.spriteLayouts).sort(), ['mobile::海斗::喜悦', 'pc', 'pc::小林', 'pc::小林::喜悦', 'pc::海斗', 'pc::海斗::喜悦', 'pc::海斗|校服::喜悦', 'pc::海斗|泳装', 'pc::海斗|泳装::喜悦'].sort());
    assert.deepEqual(rs.spriteLayouts['pc::海斗|泳装::喜悦'], L(6));
    assert.deepEqual(Object.keys(rs.spriteHeads).sort(), ['小林', '海斗', '海斗::喜悦', '海斗|泳装', '海斗|泳装::喜悦'].sort());
    assert.equal(report.moved, 10);
});

test('gate:outfits:migrate-keys-character-delete-leaves-no-orphans', () => {
    const rs = sampleSettings();
    migrateSpriteKeys(rs, { character: '小林海斗' }, null);
    assert.deepEqual(Object.keys(rs.spriteLayouts).sort(), ['pc', 'pc::小林', 'pc::小林::喜悦']);
    assert.deepEqual(Object.keys(rs.spriteHeads), ['小林']);
});

test('gate:outfits:migrate-keys-base-mood-scope-skips-outfit-slots', () => {
    const rs = sampleSettings();
    migrateSpriteKeys(rs, { character: '小林海斗', outfit: '', mood: '喜悦' }, { mood: '开心' });
    assert.ok(rs.spriteLayouts['pc::小林海斗::开心'] && rs.spriteLayouts['mobile::小林海斗::开心']);
    assert.ok(!rs.spriteLayouts['pc::小林海斗::喜悦']);
    assert.deepEqual(rs.spriteLayouts['pc::小林海斗|泳装::喜悦'], L(6));
    assert.deepEqual(rs.spriteHeads['小林海斗::开心'], H(3));
    assert.deepEqual(rs.spriteHeads['小林海斗|泳装::喜悦'], H(6));
    migrateSpriteKeys(rs, { character: '小林海斗', outfit: '', mood: '开心' }, null);
    assert.ok(!Object.keys(rs.spriteLayouts).some((k) => k.endsWith('::小林海斗::开心')));
    assert.ok(!rs.spriteHeads['小林海斗::开心']);
});

test('gate:outfits:migrate-keys-outfit-and-outfit-mood-scopes', () => {
    const rs = sampleSettings();
    migrateSpriteKeys(rs, { character: '小林海斗', outfit: '泳装' }, { outfit: '比基尼' });
    assert.deepEqual(rs.spriteLayouts['pc::小林海斗|比基尼'], L(5));
    assert.deepEqual(rs.spriteLayouts['pc::小林海斗|比基尼::喜悦'], L(6));
    assert.deepEqual(rs.spriteHeads['小林海斗|比基尼::喜悦'], H(6));
    assert.deepEqual(rs.spriteLayouts['pc::小林海斗::喜悦'], L(3));
    migrateSpriteKeys(rs, { character: '小林海斗', outfit: '比基尼', mood: '喜悦' }, { mood: '害羞' });
    assert.deepEqual(rs.spriteLayouts['pc::小林海斗|比基尼::害羞'], L(6));
    assert.deepEqual(rs.spriteLayouts['pc::小林海斗|比基尼'], L(5));
    migrateSpriteKeys(rs, { character: '小林海斗', outfit: '比基尼' }, null);
    assert.ok(!Object.keys(rs.spriteLayouts).some((k) => k.includes('比基尼')));
    assert.ok(!Object.keys(rs.spriteHeads).some((k) => k.includes('比基尼')));
    assert.deepEqual(rs.spriteLayouts['pc::小林海斗|校服::喜悦'], L(7));
});

test('gate:outfits:migrate-keys-never-overwrites-existing-target', () => {
    const rs = sampleSettings();
    const report = migrateSpriteKeys(rs, { character: '小林海斗', outfit: '泳装' }, { outfit: '校服' });
    assert.deepEqual(rs.spriteLayouts['pc::小林海斗|校服::喜悦'], L(7));
    assert.deepEqual(rs.spriteLayouts['pc::小林海斗|校服'], L(5));
    assert.ok(!Object.keys(rs.spriteLayouts).some((k) => k.includes('泳装')));
    assert.equal(report.kept, 1);
    assert.deepEqual(migrateSpriteKeys(null, { character: 'x' }, null), { moved: 0, removed: 0, kept: 0 });
});

function createCtx(prompts = []) {
    const alerts = [];
    const state = {
        activeSettings: {
            tab: 'scene',
            asyncState: {},
            draft: {
                bridge: {
                    sceneAssets: {
                        characters: { 小林海斗: { 喜悦: 'base.png' }, 雪乃: { 喜悦: 'y.png' } },
                        characterAliases: { 小林海斗: [], 雪乃: [] },
                        characterOutfits: {},
                        moodGroups: [{ label: '喜悦', words: ['喜悦'] }],
                    },
                },
                readerSettings: sampleSettings(),
            },
        },
    };
    let persisted = 0;
    const global = { prompt: () => prompts.shift() ?? '', alert: (m) => alerts.push(m) };
    const ctx = {
        state,
        options: { global },
        closeSettings: () => ({ ok: true }),
        persistSettingsDraft: () => { persisted++; return { ok: true }; },
        rerenderSettings: () => ({ ok: true, rerendered: true }),
        buildRegexPreview: () => '',
    };
    return { ctx, state, alerts, prompts, persisted: () => persisted, sa: () => state.activeSettings.draft.bridge.sceneAssets, rs: () => state.activeSettings.draft.readerSettings };
}

const enc = (...parts) => parts.map((p) => encodeURIComponent(p)).join(':');

test('gate:outfits:settings-actions-add-rename-remove-outfit-words-and-slots', async () => {
    const t = createCtx();
    const run = (action, ...answers) => { t.prompts.push(...answers); return handleSettingsAction(action, t.ctx); };
    await run(`scene-add-outfit:${enc('小林海斗')}`, '泳装');
    await run(`scene-add-outfit:${enc('小林海斗')}`, '校服');
    assert.deepEqual(Object.keys(t.sa().characterOutfits.小林海斗), ['泳装', '校服']);
    for (const bad of ['默认', 'a|b', '泳装', '']) await run(`scene-add-outfit:${enc('小林海斗')}`, bad);
    assert.deepEqual(Object.keys(t.sa().characterOutfits.小林海斗), ['泳装', '校服']);
    assert.equal(t.alerts.length, 3);

    await run(`scene-add-outfit-word:${enc('小林海斗', '泳装')}`, '比基尼');
    await run(`scene-add-outfit-word:${enc('小林海斗', '校服')}`, '比基尼');
    await run(`scene-add-outfit-word:${enc('小林海斗', '校服')}`, '泳装');
    await run(`scene-add-outfit-word:${enc('小林海斗', '校服')}`, '制服');
    assert.deepEqual(t.sa().characterOutfits.小林海斗.泳装.words, ['比基尼']);
    assert.deepEqual(t.sa().characterOutfits.小林海斗.校服.words, ['制服']);
    await run(`scene-add-outfit:${enc('小林海斗')}`, '制服');
    assert.ok(!t.sa().characterOutfits.小林海斗.制服);

    await run(`scene-add-outfit-mood:${enc('小林海斗', '泳装')}`, '喜悦');
    await run(`scene-add-outfit-mood:${enc('小林海斗', '泳装')}`, '默认');
    await run(`scene-add-outfit-mood:${enc('小林海斗', '泳装')}`, '害羞');
    assert.deepEqual(t.sa().characterOutfits.小林海斗.泳装.moods, { 喜悦: '', 害羞: '' });
    assert.ok(t.sa().moodGroups.some((g) => g.label === '害羞'));
    const before = t.persisted();
    const setResult = await handleSettingsAction(`scene-set-outfit-mood-url:${enc('小林海斗', '泳装', '喜悦')}:https://x/a.png?q=1:2`, t.ctx);
    assert.deepEqual(setResult, { ok: true });
    assert.equal(t.persisted(), before);
    assert.equal(t.sa().characterOutfits.小林海斗.泳装.moods.喜悦, 'https://x/a.png?q=1:2');

    await run(`scene-rename-outfit-mood:${enc('小林海斗', '泳装', '喜悦')}`, '开心');
    assert.deepEqual(Object.keys(t.sa().characterOutfits.小林海斗.泳装.moods), ['开心', '害羞']);
    assert.deepEqual(t.rs().spriteLayouts['pc::小林海斗|泳装::开心'], L(6));
    assert.deepEqual(t.rs().spriteHeads['小林海斗|泳装::开心'], H(6));

    await run(`scene-rename-outfit:${enc('小林海斗', '泳装')}`, '沙滩装');
    assert.deepEqual(Object.keys(t.sa().characterOutfits.小林海斗), ['沙滩装', '校服']);
    assert.deepEqual(t.rs().spriteLayouts['pc::小林海斗|沙滩装'], L(5));
    assert.ok(!Object.keys(t.rs().spriteLayouts).some((k) => k.includes('泳装')));

    await run(`scene-remove-outfit-mood:${enc('小林海斗', '沙滩装', '开心')}`);
    assert.ok(!t.rs().spriteLayouts['pc::小林海斗|沙滩装::开心']);
    await run(`scene-remove-outfit-word:${enc('小林海斗', '校服', '制服')}`);
    assert.deepEqual(t.sa().characterOutfits.小林海斗.校服.words, []);
    await run(`scene-remove-outfit:${enc('小林海斗', '沙滩装')}`);
    assert.deepEqual(Object.keys(t.sa().characterOutfits.小林海斗), ['校服']);
    assert.ok(!Object.keys(t.rs().spriteLayouts).some((k) => k.includes('沙滩装')));
    assert.deepEqual(t.rs().spriteLayouts['pc::小林海斗::喜悦'], L(3));

    assert.equal(handleOutfitAction('scene-add-char', t.ctx), null);
    assert.deepEqual(await run(`scene-add-outfit:${enc('不存在')}`, '泳装'), { ok: true, rerendered: true });
    assert.ok(!t.sa().characterOutfits.不存在);

    // 服装可以直接叫「裸体」：新建 / 改名都放行，并自动引用内置裸体。
    t.prompts.length = 0;
    await run(`scene-add-outfit:${enc('小林海斗')}`, '裸体');
    assert.deepEqual(t.sa().characterOutfits.小林海斗.裸体, { words: [], moods: {}, wardrobe: '裸体' });
    await run(`scene-remove-outfit:${enc('小林海斗', '裸体')}`);
    await run(`scene-rename-outfit:${enc('小林海斗', '校服')}`, '裸体');
    assert.deepEqual(Object.keys(t.sa().characterOutfits.小林海斗), ['裸体']);
    assert.equal(t.sa().characterOutfits.小林海斗.裸体.wardrobe, '裸体');
});

test('gate:outfits:legacy-character-and-mood-actions-migrate-and-clean-sprite-keys', async () => {
    const t = createCtx();
    t.sa().characterOutfits = { 小林海斗: { 泳装: { words: [], moods: { 喜悦: 's.png' } } } };
    t.sa().characterDefaultOutfits = { 小林海斗: { version: 1, outfitName: '泳装' } };
    t.sa().characters.雪乃 = { 喜悦: 'y.png' };
    t.rs().spriteLayouts['pc::雪乃::喜悦'] = L(20);
    t.rs().spriteHeads['雪乃::喜悦'] = H(20);
    const run = (action, ...answers) => { t.prompts.push(...answers); return handleSettingsAction(action, t.ctx); };

    // 情绪槽改名按情绪组全局改名，其他角色同名槽的位置与标定一起迁移；服装槽不受影响。
    await run(`scene-rename-mood:${enc('小林海斗', '喜悦')}`, '开心');
    assert.deepEqual(t.rs().spriteLayouts['pc::小林海斗::开心'], L(3));
    assert.deepEqual(t.rs().spriteLayouts['mobile::小林海斗::开心'], L(4));
    assert.deepEqual(t.rs().spriteLayouts['pc::雪乃::开心'], L(20));
    assert.deepEqual(t.rs().spriteHeads['雪乃::开心'], H(20));
    assert.deepEqual(t.rs().spriteLayouts['pc::小林海斗|泳装::喜悦'], L(6));
    assert.deepEqual(t.rs().spriteLayouts['pc::小林::喜悦'], L(9));

    await run(`scene-remove-mood:${enc('雪乃', '开心')}`);
    assert.ok(!t.rs().spriteLayouts['pc::雪乃::开心']);
    assert.ok(!t.rs().spriteHeads['雪乃::开心']);

    await run(`scene-rename-char:${enc('小林海斗')}`, '海斗');
    assert.deepEqual(Object.keys(t.sa().characterOutfits), ['海斗']);
    assert.deepEqual(t.sa().characterDefaultOutfits, { 海斗: { version: 1, outfitName: '泳装' } });
    assert.deepEqual(t.rs().spriteLayouts['pc::海斗|泳装::喜悦'], L(6));
    assert.deepEqual(t.rs().spriteHeads['海斗'], H(2));
    assert.deepEqual(t.rs().spriteLayouts['pc::小林'], L(8));
    assert.ok(!Object.keys(t.rs().spriteLayouts).some((k) => k.includes('小林海斗')));

    await run(`scene-remove-char:${enc('海斗')}`);
    assert.deepEqual(t.sa().characterOutfits, {});
    assert.deepEqual(t.sa().characterDefaultOutfits, {});
    assert.ok(!Object.keys(t.rs().spriteLayouts).some((k) => k.includes('海斗')));
    assert.ok(!Object.keys(t.rs().spriteHeads).some((k) => k.includes('海斗')));
    assert.deepEqual(t.rs().spriteHeads['小林'], H(8));
});

// 素材页传进来的是本卡盖在全局上的一份衣柜，下拉里每个名字只出现一次，旁边的按钮跳到规则页编辑。
test('gate:outfits:binding-lists-merged-wardrobe-and-jumps-to-rules', () => {
    const render = (wardrobe, outfit) => renderCharacterAssetList({ 小林: { 默认: '' } }, {
        characterOutfits: { 小林: { 校服: outfit } },
        outfitTabs: { 小林: '校服' },
        isOpen: () => true,
        sceneAssets: { wardrobe, characters: { 小林: { 默认: '' } }, characterOutfits: { 小林: { 校服: outfit } } },
    });
    const html = render({ 校服: { prompt: 'card' }, 晚礼服: { prompt: 'gown' } }, { moods: {}, wardrobe: '晚礼服' });
    // 衣柜改为原生下拉：当前引用的那项 selected，同名服装只列一次。
    assert.match(html, /aria-label="使用衣柜" data-outfit-wardrobe-char="小林" data-outfit-wardrobe="校服">/);
    assert.match(html, /<option value="晚礼服" selected>晚礼服<\/option>/);
    assert.equal(html.match(/<option value="校服"/g).length, 1);
    assert.match(html, /data-action="wardrobe-for-outfit:%E5%B0%8F%E6%9E%97:%E6%A0%A1%E6%9C%8D">编辑提示词</);
    const missing = render({}, { moods: {} });
    assert.match(missing, /data-action="wardrobe-for-outfit:%E5%B0%8F%E6%9E%97:%E6%A0%A1%E6%9C%8D">写提示词</);
});


test('gate:outfits:wardrobe-prompt-editor-saves-and-cancel-keeps-text', async () => {
    const t = createCtx();
    t.sa().wardrobe = { 校服: { prompt: 'uniform', nsfwBoost: true } };
    const action = `wardrobe-prompt:${enc('校服')}`;
    const ctx = { ...t.ctx, settingsState: t.state.activeSettings };
    let opened = null;
    ctx.dialogs = { edit: async (message, value) => { opened = [message, value]; return null; } };
    await handleOutfitAction(action, ctx);
    assert.deepEqual(opened, ['「校服」的提示词', 'uniform']);
    assert.equal(t.sa().wardrobe.校服.prompt, 'uniform');
    ctx.dialogs.edit = async () => '  sailor fuku  ';
    await handleOutfitAction(action, ctx);
    assert.equal(t.sa().wardrobe.校服.prompt, 'sailor fuku');
    assert.equal(t.sa().wardrobe.校服.nsfwBoost, true);
});

test('gate:outfits:reference-replacement-preserves-old-image-until-save-and-reports-delete-failure', async () => {
    const t = createCtx();
    t.sa().wardrobe = { 校服: { prompt: 'uniform', reference: 'igs-gen:old-ref' } };
    const deleted = [];
    let saveSucceeds = false;
    let deleteSucceeds = true;
    t.ctx.dialogs = { confirm: async () => true };
    t.ctx.options.generatedAssets = {
        paintWardrobeReference: async () => ({ ok: true, imageId: 'new-ref' }),
        deleteImages: async (ids) => { deleted.push(...ids); return { ok: deleteSucceeds }; },
    };
    t.ctx.persistSettingsDraft = () => {
        if (!saveSucceeds) return { ok: false, reason: 'save-failed' };
        assert.deepEqual(deleted, ['new-ref'], '旧图只能在成功提交后删除');
        return { ok: true };
    };
    const action = `wardrobe-reference:${enc('校服')}`;
    assert.equal((await handleOutfitAction(action, { ...t.ctx, settingsState: t.state.activeSettings })).ok, false);
    assert.equal(t.sa().wardrobe.校服.reference, 'igs-gen:old-ref');
    assert.deepEqual(deleted, ['new-ref']);
    saveSucceeds = true;
    deleteSucceeds = false;
    assert.equal((await handleOutfitAction(action, { ...t.ctx, settingsState: t.state.activeSettings })).ok, true);
    assert.equal(t.sa().wardrobe.校服.reference, 'igs-gen:new-ref');
    assert.deepEqual(deleted, ['new-ref', 'old-ref']);
    assert.ok(t.alerts.some((message) => message.includes('旧参考图未能从本机清除')));
});


function defaultOutfitCtx() {
    const t = createCtx();
    t.sa().characterOutfits = { 小林海斗: {
        校服: { words: [], moods: { 平和: 'igs-gen:uniform' }, wardrobe: '校服' },
        泳装: { words: [], moods: { 喜悦: 'igs-gen:swim' }, wardrobe: '泳装' },
    } };
    t.sa().wardrobe = { 校服: { prompt: 'uniform' }, 泳装: { prompt: 'swimsuit' } };
    t.ctx.options.global.Image = class {
        naturalWidth = 100; naturalHeight = 200;
        set src(value) { if (value) queueMicrotask(() => this.onload?.()); }
    };
    t.ctx.options.generatedAssets = {
        async readStoredImage(id) { return { id, type: 'sprite', dataUrl: 'data:image/png;base64,AA==', revision: 1 }; },
    };
    t.run = (action, ...parts) => handleSettingsAction(`${action}:${enc('小林海斗', ...parts)}`, t.ctx);
    return t;
}

test('gate:outfits:default-selection-verifies-sprite-without-copying-old-assets', async () => {
    const t = defaultOutfitCtx();
    const before = structuredClone(t.sa());
    assert.equal((await t.run('scene-set-default-outfit', '校服')).ok, true);
    assert.deepEqual(t.sa().characterDefaultOutfits, { 小林海斗: { version: 1, outfitName: '校服' } });
    assert.deepEqual(t.sa().characters, before.characters);
    assert.deepEqual(t.sa().characterOutfits, before.characterOutfits);
    assert.equal(t.persisted(), 1);
    assert.equal((await t.run('scene-set-default-outfit', '泳装')).ok, true);
    assert.equal(t.sa().characterDefaultOutfits.小林海斗.outfitName, '泳装');
});

test('gate:outfits:default-selection-rejects-missing-unreadable-and-non-sprite-images', async () => {
    for (const record of [null, { id: 'uniform', type: 'background', dataUrl: 'x' }, new Error('offline')]) {
        const t = defaultOutfitCtx();
        t.ctx.options.generatedAssets.readStoredImage = async () => { if (record instanceof Error) throw record; return record; };
        assert.equal((await t.run('scene-set-default-outfit', '校服')).ok, false);
        assert.equal(Object.hasOwn(t.sa(), 'characterDefaultOutfits'), false);
        assert.equal(t.persisted(), 0);
    }
    const t = defaultOutfitCtx();
    t.sa().characterOutfits.小林海斗.校服 = { words: [], moods: {}, avatar: 'igs-gen:avatar', wardrobe: '校服' };
    t.sa().wardrobe.校服.reference = 'igs-gen:still-life';
    assert.equal((await t.run('scene-set-default-outfit', '校服')).ok, false);
    assert.equal(t.persisted(), 0);
});

test('gate:outfits:default-removal-needs-a-readable-remaining-sprite', async () => {
    const t = defaultOutfitCtx();
    await t.run('scene-set-default-outfit', '校服');
    t.sa().characterOutfits.小林海斗.校服.moods.喜悦 = 'igs-gen:missing';
    const read = t.ctx.options.generatedAssets.readStoredImage;
    t.ctx.options.generatedAssets.readStoredImage = id => id === 'missing' ? null : read(id);
    const before = structuredClone(t.sa());
    for (const [action, parts] of [
        ['scene-remove-outfit', ['校服']],
        ['scene-remove-outfit-mood', ['校服', '平和']],
        ['scene-set-outfit-mood-url', ['校服', '平和', '']],
    ]) {
        assert.equal((await t.run(action, ...parts)).reason, 'default-outfit-protected');
        assert.deepEqual(t.sa(), before);
    }
    t.sa().characterOutfits.小林海斗.校服.moods.喜悦 = 'igs-gen:other';
    assert.equal((await t.run('scene-remove-outfit-mood', '校服', '平和')).ok, true);
    assert.deepEqual(t.sa().characterOutfits.小林海斗.校服.moods, { 喜悦: 'igs-gen:other' });
});

test('gate:outfits:failed-default-save-and-rename-restore-selection-and-layout', async () => {
    const t = defaultOutfitCtx();
    await t.run('scene-set-default-outfit', '泳装');
    const before = structuredClone(t.state.activeSettings.draft);
    const failure = { ok: false, reason: 'save-failed', rollbackFailed: true };
    t.ctx.persistSettingsDraft = () => failure;
    assert.equal(await t.run('scene-set-default-outfit', '校服'), failure);
    assert.deepEqual(t.state.activeSettings.draft, before);
    t.prompts.push('泳衣');
    assert.equal(await t.run('scene-rename-outfit', '泳装'), failure);
    assert.deepEqual(t.state.activeSettings.draft, before);
    t.ctx.persistSettingsDraft = () => { throw new Error('offline'); };
    assert.equal((await t.run('scene-set-default-outfit', '校服')).reason, 'save-failed');
    assert.deepEqual(t.state.activeSettings.draft, before);
});

test('gate:outfits:default-selection-rejects-changed-target-after-image-read', async () => {
    const t = defaultOutfitCtx();
    let release;
    t.ctx.options.generatedAssets.readStoredImage = () => new Promise(resolve => { release = resolve; });
    const pending = t.run('scene-set-default-outfit', '校服');
    t.sa().characterOutfits.小林海斗.校服.moods.平和 = 'igs-gen:replacement';
    release({ id: 'uniform', type: 'sprite', dataUrl: 'x' });
    assert.equal((await pending).reason, 'OUTFIT_ADOPTION_CONFLICT');
    assert.equal(t.persisted(), 0);
    assert.equal(t.sa().characterDefaultOutfits, undefined);
});

test('gate:outfits:default-dna-delete-clear-and-unlink-preserve-effective-description', async () => {
    const t = defaultOutfitCtx();
    await t.run('scene-set-default-outfit', '校服');
    const before = structuredClone(t.sa());
    assert.equal((await handleSettingsAction('wardrobe-remove:校服', t.ctx)).reason, 'default-outfit-dna-protected');
    assert.deepEqual(t.sa(), before);
    t.ctx.dialogs = { edit: async () => '' };
    assert.equal((await handleSettingsAction('wardrobe-prompt:校服', t.ctx)).reason, 'default-outfit-dna-protected');
    assert.deepEqual(t.sa(), before);
    t.sa().wardrobe.专属 = { prompt: 'private uniform' };
    t.sa().characterOutfits.小林海斗.校服.wardrobe = '专属';
    assert.equal((await t.run('scene-set-outfit-wardrobe-url', '校服', '缺失')).reason, 'default-outfit-dna-protected');
    assert.equal(t.sa().characterOutfits.小林海斗.校服.wardrobe, '专属');
    delete t.sa().wardrobe.校服;
    assert.equal((await t.run('scene-set-outfit-wardrobe-url', '校服', '')).reason, 'default-outfit-dna-protected');
    assert.equal(t.sa().characterOutfits.小林海斗.校服.wardrobe, '专属');
});

test('gate:outfits:clearing-default-dna-cannot-use-deletion-fallback', async () => {
    const t = defaultOutfitCtx();
    await t.run('scene-set-default-outfit', '校服');
    t.sa().wardrobe.专属 = { prompt: 'uniform' };
    t.sa().characterOutfits.小林海斗.校服.wardrobe = '专属';
    t.ctx.dialogs = { edit: async () => '' };
    assert.equal((await handleSettingsAction('wardrobe-prompt:专属', t.ctx)).reason, 'default-outfit-dna-protected');
    assert.equal(t.sa().wardrobe.专属.prompt, 'uniform');
});

test('gate:outfits:wardrobe-rename-save-failure-restores-linked-outfits', async () => {
    const t = defaultOutfitCtx();
    await t.run('scene-set-default-outfit', '校服');
    const before = structuredClone(t.sa());
    t.prompts.push('制服');
    t.ctx.persistSettingsDraft = () => ({ ok: false, reason: 'save-failed' });
    assert.equal((await handleSettingsAction('wardrobe-rename:校服', t.ctx)).ok, false);
    assert.deepEqual(t.sa(), before);
});

test('gate:outfits:rename-and-delete-keep-expression-notes-with-their-outfit', async () => {
    const t = defaultOutfitCtx();
    const note = { positive: 'pending', promptTask: { purpose: 'expression', original: '泳装' } };
    t.sa().generated = { expressionNotes: {
        '小林海斗\u0001泳装': { 喜悦: note }, '小林\u0001泳装': { 喜悦: { positive: 'other' } },
    } };
    await t.run('scene-set-default-outfit', '泳装');
    t.prompts.push('泳衣');
    await t.run('scene-rename-outfit', '泳装');
    assert.equal(t.sa().characterDefaultOutfits.小林海斗.outfitName, '泳衣');
    assert.deepEqual(t.sa().generated.expressionNotes['小林海斗\u0001泳衣'].喜悦, note);
    assert.equal(t.sa().generated.expressionNotes['小林海斗\u0001泳装'], undefined);
    t.prompts.push('开心');
    await t.run('scene-rename-outfit-mood', '泳衣', '喜悦');
    assert.deepEqual(t.sa().generated.expressionNotes['小林海斗\u0001泳衣'], { 开心: note });
    await t.run('scene-set-default-outfit', '校服');
    await t.run('scene-remove-outfit', '泳衣');
    assert.equal(t.sa().generated.expressionNotes['小林海斗\u0001泳衣'], undefined);
    assert.equal(t.sa().generated.expressionNotes['小林\u0001泳装'].喜悦.positive, 'other');
});

test('gate:outfits:character-delete-and-rename-rollback-and-isolate-global-namesake', async () => {
    for (const rename of [false, true]) {
        const t = defaultOutfitCtx();
        const root = t.sa();
        const globalBefore = structuredClone(root);
        const card = structuredClone(root);
        card.characterDefaultOutfits = { 小林海斗: { version: 1, outfitName: '校服' } };
        card.generated = { expressionNotes: { '小林海斗\u0001校服': { 喜悦: { positive: 'pending' } } } };
        root.cards = { 'card:测试': card };
        t.ctx.options.global.SillyTavern = { getContext: () => ({ characterId: 0, characters: [{ name: '测试' }] }) };
        const action = rename ? 'scene-rename-char' : 'scene-remove-char';
        const before = structuredClone(root);
        t.ctx.persistSettingsDraft = () => ({ ok: false, reason: 'save-failed' });
        if (rename) t.prompts.push('海斗');
        assert.equal((await t.run(action)).ok, false);
        assert.deepEqual(root, before);
        t.ctx.persistSettingsDraft = () => ({ ok: true });
        if (rename) t.prompts.push('海斗');
        assert.equal((await t.run(action)).ok, true);
        const { cards, ...globalAfter } = root;
        assert.deepEqual(globalAfter, globalBefore);
        assert.equal(card.characterDefaultOutfits.小林海斗, undefined);
        assert.equal(card.generated.expressionNotes['小林海斗\u0001校服'], undefined);
        if (rename) {
            assert.equal(card.characterDefaultOutfits.海斗.outfitName, '校服');
            assert.equal(card.generated.expressionNotes['海斗\u0001校服'].喜悦.positive, 'pending');
        }
    }
});

test('gate:outfits:default-panel-is-a-view-of-named-outfit-and-never-legacy-images', async () => {
    const t = defaultOutfitCtx();
    t.sa().characters.小林海斗.喜悦 = 'https://example.invalid/legacy.png';
    t.sa().characterOutfits.小林海斗.校服.moods.喜悦 = '';
    await t.run('scene-set-default-outfit', '校服');
    const render = active => renderCharacterAssetList(t.sa().characters, {
        sceneAssets: t.sa(), characterOutfits: t.sa().characterOutfits,
        outfitTabs: active ? { 小林海斗: active } : {}, isOpen: () => true,
    });
    const mapped = render('');
    const named = render('校服');
    const panel = html => html.slice(html.indexOf('<div class="igs-outfit-panel"'));
    assert.equal(panel(mapped), panel(named));
    assert.ok(mapped.includes('校服（默认）'));
    assert.ok(mapped.includes(`outfit-expression-retry:${enc('小林海斗', '校服', '平和')}`));
    assert.ok(mapped.includes(`scene-pick-outfit-mood:${enc('小林海斗', '校服', '喜悦')}`));
    assert.ok(!mapped.includes('https://example.invalid/legacy.png'));
    assert.equal(Object.hasOwn(t.sa().characterOutfits.小林海斗, '校服（默认）'), false);
});

test('gate:outfits:rename-preserves-implicit-dna-binding-and-rejects-late-dialog', async () => {
    const t = defaultOutfitCtx();
    delete t.sa().characterOutfits.小林海斗.校服.wardrobe;
    await t.run('scene-set-default-outfit', '校服');
    t.prompts.push('制服');
    assert.equal((await t.run('scene-rename-outfit', '校服')).ok, true);
    assert.equal(t.sa().characterOutfits.小林海斗.制服.wardrobe, '校服');
    assert.equal(t.sa().characterDefaultOutfits.小林海斗.outfitName, '制服');
    let release;
    t.ctx.dialogs = { prompt: () => new Promise(resolve => { release = resolve; }) };
    const pending = t.run('scene-rename-outfit', '制服');
    t.sa().characterDefaultOutfits.小林海斗 = { version: 1, outfitName: '泳装' };
    release('迟到');
    assert.equal((await pending).reason, 'OUTFIT_ADOPTION_CONFLICT');
    assert.ok(t.sa().characterOutfits.小林海斗.制服);
    assert.equal(t.sa().characterOutfits.小林海斗.迟到, undefined);
});

function legacyGeneratedOutfitCtx() {
    const t = defaultOutfitCtx();
    t.sa().characters.小林海斗.默认 = 'legacy-user.png';
    t.sa().characterDna = { 小林海斗: { defaultAppearance: 'legacy clothes' } };
    t.sa().generated = { characters: { 小林海斗: { 默认: 'igs-gen:legacy', 喜悦: 'igs-gen:legacy-joy' } },
        characterAliases: { 小林海斗: ['小林'] }, expressionNotes: {} };
    t.adopt = () => t.run('gen-adopt-sprite');
    return t;
}

test('gate:outfits:legacy-adoption-explicitly-files-named-outfit-without-setting-default', async () => {
    const { fileGeneratedHoldings } = await import('../src/scene/asset-match.js');
    for (const hasDefault of [false, true]) {
        const t = legacyGeneratedOutfitCtx();
        if (hasDefault) t.sa().characterDefaultOutfits = { 小林海斗: { version: 1, outfitName: '校服' } };
        const before = structuredClone(t.sa());
        t.prompts.push('归档衣装');
        let saves = 0;
        t.ctx.persistSettingsDraft = () => { saves++; fileGeneratedHoldings(t.sa()); return { ok: true }; };
        assert.equal((await t.adopt()).ok, true);
        assert.equal(saves, 1);
        assert.deepEqual(t.sa().characterOutfits.小林海斗.归档衣装, { words: [], moods: { 平和: 'igs-gen:legacy' } });
        assert.deepEqual(t.sa().characters, before.characters);
        assert.deepEqual(t.sa().generated.characters, before.generated.characters);
        assert.deepEqual(t.sa().characterDna, before.characterDna);
        assert.deepEqual(t.sa().wardrobe, before.wardrobe);
        assert.equal(Object.hasOwn(t.sa(), 'characterDefaultOutfits'), hasDefault);
        assert.deepEqual(t.sa().characterDefaultOutfits, before.characterDefaultOutfits);
        assert.deepEqual(t.sa().characterAliases.小林海斗, ['小林']);
    }
});

test('gate:outfits:legacy-adoption-cancel-invalid-name-and-unreadable-image-do-not-write', async () => {
    for (const answer of [null, '', '默认', '校服', 'a|b']) {
        const t = legacyGeneratedOutfitCtx();
        const before = structuredClone(t.sa());
        t.ctx.dialogs = { prompt: async () => answer, alert: async () => true };
        assert.equal((await t.adopt()).ok, false);
        assert.deepEqual(t.sa(), before);
        assert.equal(t.persisted(), 0);
    }
    for (const value of [null, new Error('offline'), { id: 'legacy', type: 'background', dataUrl: 'x' }]) {
        const t = legacyGeneratedOutfitCtx();
        t.prompts.push('归档衣装');
        t.ctx.options.generatedAssets.readStoredImage = async () => { if (value instanceof Error) throw value; return value; };
        const before = structuredClone(t.sa());
        assert.equal((await t.adopt()).ok, false);
        assert.deepEqual(t.sa(), before);
        assert.equal(t.persisted(), 0);
    }
});

test('gate:outfits:legacy-adoption-rejects-late-dialog-read-and-image-revision', async () => {
    for (const change of ['closed', 'scope', 'source', 'default']) {
        const t = legacyGeneratedOutfitCtx();
        const panel = t.state.activeSettings;
        let release;
        t.ctx.dialogs = { prompt: () => new Promise(resolve => { release = resolve; }), alert: async () => true };
        const pending = t.adopt();
        if (change === 'closed') t.state.activeSettings = null;
        if (change === 'scope') panel.asyncState.assetScopeKey = 'card:other';
        if (change === 'source') t.sa().generated.characters.小林海斗.默认 = 'igs-gen:replacement';
        if (change === 'default') t.sa().characterDefaultOutfits = { 小林海斗: { version: 1, outfitName: '泳装' } };
        const before = structuredClone(panel.draft);
        release('归档衣装');
        assert.equal((await pending).reason, 'OUTFIT_ADOPTION_CONFLICT', change);
        assert.deepEqual(panel.draft, before, change);
        assert.equal(t.persisted(), 0);
    }
    const t = legacyGeneratedOutfitCtx();
    t.prompts.push('归档衣装');
    const image = { id: 'legacy', type: 'sprite', dataUrl: 'data:image/png;base64,AA==', revision: 1 };
    let loaded;
    t.ctx.options.global.Image = class {
        naturalWidth = 100; naturalHeight = 200;
        set src(value) { if (value) loaded = this; }
    };
    t.ctx.options.generatedAssets.readStoredImage = async () => image;
    const before = structuredClone(t.sa());
    const pending = t.adopt();
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(loaded, '回读后进入解码等待');
    image.revision = 2;
    loaded.onload();
    assert.equal((await pending).reason, 'OUTFIT_ADOPTION_CONFLICT');
    assert.deepEqual(t.sa(), before);
    assert.equal(t.persisted(), 0);
});


test('gate:outfits:legacy-adoption-save-failure-restores-fields-and-new-card-shape', async () => {
    for (const newCard of [false, true]) {
        for (const writeAttempted of [false, true]) {
            const t = legacyGeneratedOutfitCtx();
            const root = t.sa();
            if (newCard) {
                delete root.characters.小林海斗;
                delete root.characterAliases.小林海斗;
                delete root.characterDna.小林海斗;
                delete root.characterOutfits.小林海斗;
                t.ctx.options.global.SillyTavern = { getContext: () => ({ characterId: 0, characters: [{ name: '新卡' }] }) };
            }
            const before = structuredClone(root);
            let persisted = 0;
            const failure = { ok: false, reason: 'save-failed', writeAttempted };
            t.ctx.persistSettingsDraft = () => {
                persisted++;
                return persisted === 1 ? failure : { ok: true };
            };
            t.prompts.push('归档衣装');
            assert.equal(await t.adopt(), failure);
            assert.deepEqual(root, before, '保存失败恢复旧字段及原本不存在的 cards');
            assert.equal(persisted, writeAttempted ? 2 : 1);
        }
    }
    const t = legacyGeneratedOutfitCtx();
    const before = structuredClone(t.sa());
    t.prompts.push('归档衣装');
    t.ctx.persistSettingsDraft = () => ({ ok: false, reason: 'offline' });
    const result = await t.adopt();
    assert.equal(result.reason, 'generated-asset-accept-rollback-failed');
    assert.equal(result.rollbackFailed, true);
    assert.deepEqual(t.sa(), before, '持久化补偿失败仍恢复内存并准确报告');
});

test('gate:outfits:legacy-adoption-uses-source-entry-key-and-canonical-target-in-own-library', async () => {
    const t = legacyGeneratedOutfitCtx();
    t.sa().characterAliases.小林海斗 = ['小林'];
    t.sa().generated = { characters: { 小林: { 默认: 'igs-gen:legacy' } },
        characterAliases: { 小林: ['海斗'] }, expressionNotes: {} };
    const before = structuredClone(t.sa());
    t.prompts.push('归档衣装');
    assert.equal((await handleSettingsAction(`gen-adopt-sprite:${enc('小林')}`, t.ctx)).ok, true);
    assert.deepEqual(t.sa().characterOutfits.小林海斗.归档衣装, { words: [], moods: { 平和: 'igs-gen:legacy' } });
    assert.equal(Object.hasOwn(t.sa().characterOutfits, '小林'), false);
    assert.deepEqual(t.sa().characterAliases.小林海斗, ['小林', '海斗']);
    assert.deepEqual(t.sa().characters, before.characters);
    assert.deepEqual(t.sa().generated, before.generated);
    assert.equal(Object.hasOwn(t.sa(), 'characterDefaultOutfits'), false);

    const fresh = legacyGeneratedOutfitCtx();
    const root = fresh.sa();
    for (const field of ['characters', 'characterAliases', 'characterDna', 'characterOutfits']) delete root[field].小林海斗;
    fresh.ctx.options.global.SillyTavern = { getContext: () => ({ characterId: 0, characters: [{ name: '新卡' }] }) };
    const rootBefore = structuredClone(root);
    fresh.prompts.push('归档衣装');
    assert.equal((await fresh.adopt()).ok, true);
    const card = root.cards['card:新卡'];
    assert.deepEqual(card.characters.小林海斗, {}, '仅登记角色，不创建旧默认图槽');
    assert.deepEqual(card.characterAliases.小林海斗, ['小林']);
    assert.deepEqual(card.characterOutfits.小林海斗.归档衣装, { words: [], moods: { 平和: 'igs-gen:legacy' } });
    assert.equal(Object.hasOwn(card, 'characterDefaultOutfits'), false);
    const { cards, ...globalAfter } = root;
    assert.deepEqual(globalAfter, rootBefore, '新卡入库不改全局旧图槽及来源图库');
    assert.equal(fresh.persisted(), 1);
});
