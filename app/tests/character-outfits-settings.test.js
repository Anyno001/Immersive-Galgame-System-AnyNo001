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
    assert.deepEqual(t.rs().spriteLayouts['pc::海斗|泳装::喜悦'], L(6));
    assert.deepEqual(t.rs().spriteHeads['海斗'], H(2));
    assert.deepEqual(t.rs().spriteLayouts['pc::小林'], L(8));
    assert.ok(!Object.keys(t.rs().spriteLayouts).some((k) => k.includes('小林海斗')));

    await run(`scene-remove-char:${enc('海斗')}`);
    assert.deepEqual(t.sa().characterOutfits, {});
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
    assert.match(html, /data-action="scene-outfit-dna:%E5%B0%8F%E6%9E%97:%E6%A0%A1%E6%9C%8D"/);
    const missing = render({}, { moods: {} });
    assert.match(missing, /data-action="scene-outfit-dna:%E5%B0%8F%E6%9E%97:%E6%A0%A1%E6%9C%8D"/);
});


test('gate:outfits:wardrobe-prompt-editor-saves-and-cancel-keeps-text', async () => {
    const t = createCtx();
    t.sa().wardrobe = { 校服: { prompt: 'uniform', promptHalfBody: 'uniform collar', nsfwBoost: true } };
    const action = `wardrobe-prompt:${enc('校服')}`;
    const ctx = { ...t.ctx, settingsState: t.state.activeSettings };
    let opened = null;
    ctx.dialogs = { edit: async (message, value) => { opened = [message, value]; return null; } };
    await handleOutfitAction(action, ctx);
    assert.deepEqual(opened, ['「校服」的提示词', 'uniform']);
    assert.equal(t.sa().wardrobe.校服.prompt, 'uniform');
    assert.equal(t.sa().wardrobe.校服.promptHalfBody, 'uniform collar');
    ctx.dialogs.edit = async () => '  sailor fuku  ';
    await handleOutfitAction(action, ctx);
    assert.equal(t.sa().wardrobe.校服.prompt, 'sailor fuku');
    assert.equal(Object.hasOwn(t.sa().wardrobe.校服, 'promptHalfBody'), false);
    assert.equal(t.sa().wardrobe.校服.nsfwBoost, true);
});

test('outfit-description: 角色和衣柜入口双向编辑同一条记录，不复制或改绑', async () => {
    const t = createCtx();
    const linked = '小林海斗·初始衣装';
    t.sa().characterOutfits = { 小林海斗: { 初始衣装: { words: [], moods: {}, wardrobe: linked } } };
    t.sa().wardrobe = { [linked]: { prompt: 'red dress', nsfwBoost: true, reference: 'igs-gen:ref' } };
    const ctx = { ...t.ctx, settingsState: t.state.activeSettings };
    const role = `scene-outfit-dna:${enc('小林海斗', '初始衣装')}`;
    const wardrobe = `wardrobe-prompt:${enc(linked)}`;
    let opened;
    ctx.dialogs = { edit: async (_title, value) => { opened = value; return 'blue dress'; } };
    await handleOutfitAction(role, ctx);
    assert.equal(opened, 'red dress');
    assert.equal(t.sa().wardrobe[linked].prompt, 'blue dress');
    ctx.dialogs.edit = async (_title, value) => { opened = value; return 'green dress'; };
    await handleOutfitAction(wardrobe, ctx);
    assert.equal(opened, 'blue dress');
    ctx.dialogs.edit = async (_title, value) => { opened = value; return null; };
    await handleOutfitAction(role, ctx);
    assert.equal(opened, 'green dress');
    ctx.dialogs.edit = async (_title, value) => { opened = value; return 'green dress, ribbon'; };
    await handleOutfitAction(`scene-outfit-half-dna:${enc('小林海斗', '初始衣装')}`, ctx);
    assert.equal(opened, '');
    assert.equal(t.sa().wardrobe[linked].prompt, 'green dress');
    assert.equal(t.sa().wardrobe[linked].promptHalfBody, 'green dress, ribbon');
    ctx.dialogs.edit = async (_title, value) => { opened = value; return null; };
    await handleOutfitAction(`wardrobe-half-prompt:${enc(linked)}`, ctx);
    assert.equal(opened, 'green dress, ribbon');
    assert.equal(t.sa().wardrobe[linked].promptHalfBody, 'green dress, ribbon');
    assert.equal(t.sa().characterOutfits.小林海斗.初始衣装.wardrobe, linked);
    assert.deepEqual(Object.keys(t.sa().wardrobe), [linked]);
    assert.equal(t.sa().wardrobe[linked].reference, 'igs-gen:ref');
    assert.equal(t.sa().wardrobe[linked].nsfwBoost, true);
});

test('outfit-description: 首次填写沿当前引用建档，取消或保存失败不留副本', async () => {
    for (const scenario of ['cancel', 'save-failed', 'saved']) {
        const t = createCtx();
        const linked = '小林海斗·初始衣装';
        t.sa().characterOutfits = { 小林海斗: { 初始衣装: { words: [], moods: {}, wardrobe: linked } } };
        t.sa().wardrobe = {};
        const ctx = { ...t.ctx, settingsState: t.state.activeSettings,
            dialogs: { edit: async () => scenario === 'cancel' ? null : 'red dress' } };
        if (scenario === 'save-failed') ctx.persistSettingsDraft = () => ({ ok: false, reason: 'save-failed' });
        await handleOutfitAction(`scene-outfit-dna:${enc('小林海斗', '初始衣装')}`, ctx);
        assert.deepEqual(Object.keys(t.sa().wardrobe), scenario === 'saved' ? [linked] : []);
        assert.equal(t.sa().characterOutfits.小林海斗.初始衣装.wardrobe, linked);
    }
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

test('gate:outfits:wardrobe-prompt-continues-to-selected-character-sprite', async () => {
    const t = createCtx();
    t.sa().wardrobe = { 校服: { prompt: '' } };
    t.sa().characters.雪乃 = { 默认: 'igs-gen:base' };
    const choices = [], generated = [], saves = [];
    t.ctx.persistSettingsDraft = (options = {}) => {
        saves.push({ assets: structuredClone(t.sa()), spriteAssetChanged: options.spriteAssetChanged === true });
        return { ok: true };
    };
    t.ctx.dialogs = {
        edit: async (_message, value) => value,
        confirm: async () => true,
        choose: async (message, items, current, labels) => {
            choices.push({ message, items, current, labels });
            return items.some((item) => item.value === '雪乃') ? '雪乃' : '1';
        },
    };
    t.ctx.options.generatedAssets = {
        writeWardrobePrompt: async () => ({ ok: true, prompt: 'school uniform' }),
        getImagePrompt: async () => ({ positive: '1girl, black hair', negative: '' }),
        generateExpressionSet: async (input) => {
            generated.push(input);
            return { ok: true, items: [{ mood: '平和', ok: true, imageId: 'uniform-sprite' }] };
        },
        paintWardrobeReference: async () => { throw new Error('手动写词无需先画参考图'); },
    };
    const result = await handleSettingsAction(`wardrobe-generate-prompt:${enc('校服')}`, t.ctx);
    assert.equal(result.ok, true);
    assert.equal(choices[0].labels.dropdown, true);
    assert.equal(choices[0].labels.cancelLabel, '暂不生成');
    assert.equal(choices[0].current, choices[0].items[0].value);
    assert.equal(generated.length, 1);
    assert.equal(generated[0].name, '雪乃');
    assert.equal(generated[0].outfit.name, '校服');
    assert.equal(generated[0].outfit.prompt, 'school uniform');
    assert.deepEqual(generated[0].moods, ['平和']);
    assert.equal(saves[0].assets.wardrobe.校服.prompt, 'school uniform');
    assert.equal(saves.at(-1).assets.characterOutfits.雪乃.校服.moods.平和, 'igs-gen:uniform-sprite');
    assert.equal(saves.at(-1).spriteAssetChanged, true);
    assert.equal(t.sa().characters.雪乃.默认, 'igs-gen:base');
    assert.equal(t.sa().characterOutfits.小林海斗, undefined);
    assert.equal(t.state.activeSettings.asyncState.outfitTabs.雪乃, '校服');
});


test('gate:outfits:wardrobe-prompt-cancel-and-failure-do-not-start-sprites', async () => {
    for (const scenario of ['cancel', 'write-failed', 'save-failed']) {
        const t = createCtx();
        t.sa().wardrobe = { 校服: { prompt: 'old' } };
        let asked = 0, rerun = 0;
        const ctx = { ...t.ctx, settingsState: t.state.activeSettings,
            dialogs: { edit: async () => '', choose: async () => { asked++; return null; }, alert: async () => true },
            rerun: async () => { rerun++; return { ok: true }; },
        };
        ctx.options.generatedAssets = { writeWardrobePrompt: async () => scenario === 'write-failed'
            ? { ok: false } : { ok: true, prompt: 'new uniform' } };
        if (scenario === 'save-failed') ctx.persistSettingsDraft = () => ({ ok: false });
        await handleOutfitAction(`wardrobe-generate-prompt:${enc('校服')}`, ctx);
        assert.equal(asked, scenario === 'cancel' ? 1 : 0);
        assert.equal(rerun, 0);
        assert.deepEqual(t.sa().characterOutfits, {});
        if (scenario === 'cancel') assert.equal(t.sa().wardrobe.校服.prompt, 'new uniform');
    }
});

test('gate:outfits:wardrobe-auto-offers-character-once-after-reference', async () => {
    const t = createCtx();
    const steps = [];
    const ctx = { ...t.ctx, settingsState: t.state.activeSettings,
        dialogs: {
            prompt: async () => '校服', edit: async () => '',
            choose: async (_message, _choices, _current, labels) => {
                assert.equal(labels.dropdown, true);
                steps.push('choose'); return '雪乃';
            },
        },
        rerun: async (action) => { steps.push(action); return { ok: true }; },
    };
    ctx.options.generatedAssets = {
        writeWardrobePrompt: async () => { steps.push('prompt'); return { ok: true, prompt: 'uniform' }; },
        paintWardrobeReference: async () => { steps.push('reference'); return { ok: true, imageId: 'ref' }; },
    };
    assert.equal((await handleOutfitAction('wardrobe-add', ctx)).ok, true);
    assert.deepEqual(steps, ['prompt', 'reference', 'choose', `outfit-expression-set:${enc('雪乃', '校服')}`]);
    assert.equal(t.sa().characterOutfits.雪乃.校服.wardrobe, '校服');
});


test('gate:outfits:wardrobe-review-prompt-continues-with-known-character', async () => {
    const { recordOutfitReview, loadOutfitReview } = await import('../src/scene/outfit-review-store.js');
    const t = createCtx();
    const stored = new Map();
    t.ctx.options.global.localStorage = {
        getItem: (key) => stored.get(key) || null,
        setItem: (key, value) => stored.set(key, value),
    };
    recordOutfitReview(t.ctx.options.global.localStorage, { character: '雪乃', word: '校服' });
    const seen = [];
    const ctx = { ...t.ctx, settingsState: t.state.activeSettings,
        dialogs: { confirm: async () => true, choose: async () => { throw new Error('已知角色不再询问'); } },
        rerun: async (action) => { seen.push(action); return { ok: true }; },
    };
    ctx.options.generatedAssets = { writeWardrobePrompt: async (input) => {
        assert.equal(input.character, '雪乃');
        return { ok: true, prompt: 'school uniform, skirt, black shoes', promptHalfBody: 'school uniform' };
    } };
    assert.equal((await handleOutfitAction(`wardrobe-generate-prompt:${enc('雪乃', '校服')}`, ctx)).ok, true);
    assert.deepEqual(seen, [`outfit-expression-set:${enc('雪乃', '校服')}`]);
    assert.equal(t.sa().wardrobe.校服.prompt, 'school uniform, skirt, black shoes');
    assert.equal(t.sa().wardrobe.校服.promptHalfBody, 'school uniform');
    assert.equal(t.sa().characterOutfits.雪乃.校服.wardrobe, '校服');
    assert.deepEqual(loadOutfitReview(t.ctx.options.global.localStorage), []);
});

for (const command of ['wardrobe-prompt', 'wardrobe-rename', 'scene-outfit-dna'])
test(`无关资料并行保存：${command} 等待输入时其它衣装和图片更新仍合并`, async () => {
    const f = createCtx(), assets = f.sa();
    assets.wardrobe = { A: { prompt: 'blue dress', reference: 'igs-gen:old-reference' } };
    assets.characterOutfits.小林海斗 = { 礼服: { wardrobe: 'A', words: [], moods: {} } };
    const change = () => {
        assets.wardrobe = { ...assets.wardrobe, B: { prompt: 'yellow raincoat' } };
        assets.wardrobe.A = { ...assets.wardrobe.A, reference: 'igs-gen:new-reference' };
        assets.characterOutfits.小林海斗.礼服.moods.喜悦 = 'arriving-sprite.png';
    };
    f.ctx.dialogs = {
        async edit() { change(); return 'red dress'; },
        async prompt() { change(); return '新名字'; }, alert() {},
    };
    const action = command === 'scene-outfit-dna' ? `${command}:${enc('小林海斗', '礼服')}` : `${command}:A`;
    const result = await handleSettingsAction(action, f.ctx);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(assets.wardrobe.B.prompt, 'yellow raincoat');
    const name = command === 'wardrobe-rename' ? '新名字' : 'A';
    assert.equal(assets.wardrobe[name].reference, 'igs-gen:new-reference');
    assert.equal(assets.wardrobe[name].prompt, command === 'wardrobe-rename' ? 'blue dress' : 'red dress');
    assert.equal(assets.characterOutfits.小林海斗.礼服.moods.喜悦, 'arriving-sprite.png');
    assert.equal(assets.characterOutfits.小林海斗.礼服.wardrobe, name);
});

test('无关资料并行保存：角色改名等待输入时其它角色保存，改名合并最新资料', async () => {
    const f = createCtx(), assets = f.sa();
    f.ctx.dialogs = { async prompt() {
        assets.characters.雪乃.平和 = 'new-y.png';
        assets.characters.小林海斗.平和 = 'arriving-sprite.png';
        return '海斗';
    }, alert() {} };
    const result = await handleSettingsAction(`scene-rename-char:${enc('小林海斗')}`, f.ctx);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(assets.characters.雪乃.平和, 'new-y.png');
    assert.equal(assets.characters.海斗.平和, 'arriving-sprite.png');
});
