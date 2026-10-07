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
    assert.match(html, /aria-label="使用衣柜">晚礼服</);
    assert.match(html, /is-current" data-action="scene-set-outfit-wardrobe-url:%E5%B0%8F%E6%9E%97:%E6%A0%A1%E6%9C%8D:%E6%99%9A%E7%A4%BC%E6%9C%8D"/);
    assert.equal(html.match(/scene-set-outfit-wardrobe-url:%E5%B0%8F%E6%9E%97:%E6%A0%A1%E6%9C%8D:%E6%A0%A1%E6%9C%8D"/g).length, 1);
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
