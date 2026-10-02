import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLDVIEWS, DEFAULT_WORLDVIEW, isReadyWorldview, normalizeWorldview, resolveWorldview, applyWorldview } from '../src/scene/worldview.js';
import { isAncientEra, applyFxEra, applyFxWorldview, resolveWorldviewPromptRule, ANCIENT_ERA_PROMPT_RULE } from '../src/scene/fx-era.js';

test('gate:worldview:registry-ids-unique-and-default-modern', () => {
    const ids = WORLDVIEWS.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(DEFAULT_WORLDVIEW, 'modern');
    assert.equal(isReadyWorldview('modern'), true);
    assert.equal(isReadyWorldview('ancient'), true);
    for (const id of ['fantasy', 'scifi', 'apocalypse', 'taisho']) {
        assert.ok(ids.includes(id), id);
        assert.equal(isReadyWorldview(id), true, id);
        assert.equal(normalizeWorldview(id), id, id);
    }
    assert.equal(normalizeWorldview('bogus'), 'modern');
    assert.equal(normalizeWorldview('ancient'), 'ancient');
});

test('gate:worldview:reads-legacy-scene-assets-as-modern', () => {
    assert.equal(resolveWorldview(undefined), 'modern');
    assert.equal(resolveWorldview({}), 'modern');
    assert.equal(resolveWorldview({ ancient: 'true' }), 'modern');
    assert.equal(resolveWorldview({ ancient: true }), 'ancient');
    assert.equal(resolveWorldview({ worldview: 'fantasy' }), 'fantasy');
    assert.equal(resolveWorldview({ worldview: 'bogus' }), 'modern');
    assert.equal(resolveWorldview({ ancient: true, worldview: 'scifi' }), 'ancient', 'ancient:true 优先');
    assert.equal(resolveWorldview({ ancient: false, worldview: 'ancient' }), 'modern', 'ancient 被置假时不按古代');
});

test('gate:worldview:apply-writes-existing-ancient-field-and-round-trips', () => {
    const sceneAssets = { enabled: true, characters: { a: 1 } };
    assert.equal(applyWorldview(sceneAssets, 'ancient'), true);
    assert.equal(sceneAssets.ancient, true);
    assert.equal(isAncientEra(sceneAssets), true);
    assert.equal(resolveWorldview(sceneAssets), 'ancient');
    assert.deepEqual(sceneAssets.characters, { a: 1 });
    assert.equal(applyWorldview(sceneAssets, 'modern'), true);
    assert.equal(sceneAssets.ancient, false);
    assert.equal(resolveWorldview(sceneAssets), 'modern');
});

test('gate:worldview:apply-rejects-unknown-ids-without-mutating', () => {
    const sceneAssets = { ancient: true };
    for (const id of ['bogus', 'Fantasy', '']) {
        assert.equal(applyWorldview(sceneAssets, id), false, id);
        assert.equal(sceneAssets.ancient, true, id);
    }
    assert.equal(applyWorldview(null, 'ancient'), false);
    assert.equal(applyWorldview([], 'ancient'), false);
});

test('gate:worldview:dropdown-lists-every-worldview-and-disables-reserved', async () => {
    const { renderWorldviewRow } = await import('../src/visual/igs-ui/worldview-fields.js');
    const modern = renderWorldviewRow(undefined);
    assert.match(modern, /<select data-worldview-select aria-label="适配世界">/);
    assert.match(modern, /<span>适配世界<\/span>/);
    for (const { id, ready } of WORLDVIEWS) {
        const option = new RegExp(`<option value="${id}"[^>]*>`).exec(modern);
        assert.ok(option, id);
        assert.equal(option[0].includes(' disabled'), !ready, id);
    }
    assert.match(modern, /<option value="modern" selected>现代<\/option>/);
    assert.match(modern, /<option value="apocalypse">末日<\/option>/);
    assert.doesNotMatch(modern, /igs-source-filter-note/);
    assert.match(renderWorldviewRow({ ancient: true }), /<option value="ancient" selected>古代<\/option>/);
});

test('gate:worldview:preset-bar-dropdown-switches-worldview-and-ignores-unknown', async () => {
    const { bootstrapIGS } = await import('../src/index.js');
    const vn = bootstrapIGS({ global: {}, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'basic', mode: 'pc' }).controller;
        let html = controller.getSnapshot().html;
        const bar = html.indexOf('igs-perf-presets');
        assert.ok(bar >= 0 && html.indexOf('data-worldview-select') > bar, 'worldview dropdown sits inside the preset bar');
        assert.match(html, /<option value="modern" selected>/);
        const applied = await controller.invoke('worldview:ancient');
        assert.notEqual(applied && applied.ok, false);
        html = controller.getSnapshot().html;
        assert.match(html, /<option value="ancient" selected>/);
        await controller.invoke('worldview:bogus');
        assert.match(controller.getSnapshot().html, /<option value="ancient" selected>/);
        await controller.invoke('worldview:apocalypse');
        assert.match(controller.getSnapshot().html, /<option value="apocalypse" selected>/);
        controller.close();
    } finally {
        vn.destroy();
    }
});

test('gate:worldview:apply-writes-enum-and-keeps-ancient-in-sync', () => {
    const sceneAssets = { ancient: true };
    for (const id of ['fantasy', 'scifi', 'apocalypse', 'taisho']) {
        assert.equal(applyWorldview(sceneAssets, id), true, id);
        assert.equal(sceneAssets.worldview, id, id);
        assert.equal(sceneAssets.ancient, false, id);
        assert.equal(resolveWorldview(sceneAssets), id, id);
    }
    assert.equal(applyWorldview(sceneAssets, 'ancient'), true);
    assert.equal(sceneAssets.worldview, 'ancient');
    assert.equal(isAncientEra(sceneAssets), true);
});

test('gate:worldview:fx-filter-per-worldview-without-mutating-input', () => {
    const reader = {
        fxTags: { enabled: true, call: true, notify: true, movie: true },
        dailyFx: { enabled: true, photo: true, tv: true, broadcast: true, guqin: true },
        liveFx: { enabled: true },
    };
    const before = JSON.stringify(reader);
    assert.deepEqual(applyFxWorldview(reader, 'ancient'), applyFxEra(reader, true));
    assert.deepEqual(applyFxWorldview(reader, 'modern'), applyFxEra(reader, false));
    assert.deepEqual(applyFxWorldview(reader, 'bogus'), applyFxEra(reader, false));
    const fantasy = applyFxWorldview(reader, 'fantasy');
    assert.equal(fantasy.fxTags.call, false);
    assert.equal(fantasy.fxTags.notify, true);
    assert.equal(fantasy.dailyFx.photo, false);
    assert.equal(fantasy.dailyFx.guqin, false);
    assert.equal(fantasy.liveFx.enabled, false);
    const scifi = applyFxWorldview(reader, 'scifi');
    assert.equal(scifi.fxTags.call, true);
    assert.equal(scifi.dailyFx.tv, true);
    assert.equal(scifi.dailyFx.guqin, false);
    assert.equal(scifi.liveFx.enabled, true);
    const apocalypse = applyFxWorldview(reader, 'apocalypse');
    assert.equal(apocalypse.fxTags.call, true);
    assert.equal(apocalypse.fxTags.movie, false);
    assert.equal(apocalypse.dailyFx.tv, false);
    assert.equal(apocalypse.dailyFx.broadcast, true);
    assert.equal(apocalypse.liveFx.enabled, false);
    assert.equal(JSON.stringify(reader), before);
});

test('gate:worldview:era-prompt-rule-and-notify-sfx-per-worldview', async () => {
    assert.equal(resolveWorldviewPromptRule('modern'), '');
    assert.equal(resolveWorldviewPromptRule('bogus'), '');
    assert.equal(resolveWorldviewPromptRule('ancient'), ANCIENT_ERA_PROMPT_RULE);
    assert.match(resolveWorldviewPromptRule('fantasy'), /西方奇幻/);
    assert.match(resolveWorldviewPromptRule('scifi'), /科幻未来/);
    assert.match(resolveWorldviewPromptRule('apocalypse'), /末日之后/);
    assert.match(resolveWorldviewPromptRule('taisho'), /大正时代/);
    const taisho = applyFxWorldview({ fxTags: { enabled: true, call: true, voicemail: true }, dailyFx: { enabled: true, photo: true, tv: true, alarm: true }, liveFx: { enabled: true } }, 'taisho');
    assert.equal(taisho.fxTags.call, true, '大正保留座机来电');
    assert.equal(taisho.fxTags.voicemail, false);
    assert.equal(taisho.dailyFx.photo, true, '大正保留照相');
    assert.equal(taisho.dailyFx.tv, false);
    assert.equal(taisho.dailyFx.alarm, false);
    assert.equal(taisho.liveFx.enabled, false);
    const { FX_SFX_PARTIALS } = await import('../src/visual/igs-ui/fx-sfx.js');
    for (const id of ['ancient', 'fantasy', 'scifi', 'apocalypse', 'taisho']) {
        const partials = FX_SFX_PARTIALS[`notify-${id}`];
        assert.ok(Array.isArray(partials) && partials.length > 0, id);
    }
});

test('gate:worldview:magic-filters-modern-devices-and-owns-magic-daily-fx', async () => {
    const { parseDailyFxBody, dailyFxOf } = await import('../src/scene/daily-fx-directives.js');
    const { battleSfxKind, BATTLE_SFX_PARTIALS } = await import('../src/visual/igs-ui/fx-battle-sfx.js');
    assert.equal(isReadyWorldview('magic'), true);
    const sa = {};
    assert.equal(applyWorldview(sa, 'magic'), true);
    assert.equal(resolveWorldview(sa), 'magic');
    assert.equal(sa.ancient, false);
    assert.match(resolveWorldviewPromptRule('magic'), /猫头鹰/);
    const magicKinds = { spell: true, potion: true, owl: true, broom: true, howler: true };
    const settings = { fxTags: { enabled: true, call: true }, dailyFx: { enabled: true, photo: true, tv: true, guqin: true, ...magicKinds }, liveFx: { enabled: true } };
    const magic = applyFxWorldview(settings, 'magic');
    assert.equal(magic.fxTags.call, false);
    assert.equal(magic.dailyFx.tv, false);
    assert.equal(magic.dailyFx.photo, true, '魔法世界保留会动的照片');
    assert.equal(magic.dailyFx.alarm, false);
    assert.equal(magic.dailyFx.guqin, false, '古风专属在魔法世界拨掉');
    assert.equal(magic.liveFx.enabled, false);
    for (const kind of Object.keys(magicKinds)) assert.equal(magic.dailyFx[kind], true, kind);
    for (const id of ['modern', 'ancient', 'fantasy', 'scifi', 'apocalypse', 'taisho']) {
        const out = applyFxWorldview(settings, id);
        for (const kind of Object.keys(magicKinds)) assert.equal(out.dailyFx[kind], false, `${id} ${kind}`);
    }
    for (const kind of Object.keys(magicKinds)) assert.equal(applyFxEra(settings, true).dailyFx[kind], false, kind);
    assert.equal(settings.dailyFx.spell, true, '不改入参');
    assert.deepEqual(dailyFxOf(parseDailyFxBody('spell', ['除你武器'])), { type: 'spell', words: '除你武器' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('owl', [])), { type: 'owl', from: '' });
    assert.equal(battleSfxKind({ type: 'hit', result: 'hit' }, 'magic'), 'battle-hit-magic');
    assert.equal(battleSfxKind({ type: 'hit', result: 'miss' }, 'magic'), 'battle-miss');
    assert.equal(battleSfxKind({ type: 'hit', result: 'hit' }), 'battle-hit');
    assert.ok(BATTLE_SFX_PARTIALS['battle-encounter-magic'].length > 0);
});

test('gate:worldview:magic-refinements-spell-hue-house-colors-and-world-scoped-daily-list', async () => {
    const { spellHue } = await import('../src/visual/igs-ui/fx-daily.js');
    const { MAGIC_HOUSES, normalizeMagicHouse, magicHouseVars, CSS_DIALOG_STYLE_BY_SKIN } = await import('../src/visual/igs-ui/dialog-theme-css-skins.js');
    const { renderStageDirectionFields } = await import('../src/visual/igs-ui/stage-direction-fields.js');
    const { parseDailyFxBody, dailyFxOf } = await import('../src/scene/daily-fx-directives.js');
    assert.equal(spellHue('除你武器'), '#ff6b5a');
    assert.equal(spellHue('呼神护卫'), '#e4ecff');
    assert.equal(spellHue('Avada Kedavra'), '#4dff6e');
    assert.equal(spellHue('某个自创咒语'), spellHue('某个自创咒语'));
    assert.deepEqual(MAGIC_HOUSES.map((h) => h.id), ['starlight', 'scarlet', 'emerald', 'sapphire', 'amber']);
    assert.equal(normalizeMagicHouse('nope'), 'starlight');
    assert.equal(magicHouseVars('emerald')['--igs-ma-veil'], '#0f2b2c');
    assert.match(CSS_DIALOG_STYLE_BY_SKIN['magic-academy'], /var\(--igs-ma-veil,#1b1a44\)/);
    const reader = { dailyFx: { enabled: true } };
    const list = (worldview) => renderStageDirectionFields(reader, (key, label, body) => body, { worldview }).daily;
    assert.ok(list('magic').includes('dailyFx.spell') && !list('magic').includes('dailyFx.guqin'));
    assert.ok(list('ancient').includes('dailyFx.guqin') && !list('ancient').includes('dailyFx.howler'));
    assert.ok(!list('modern').includes('dailyFx.spell') && list('modern').includes('dailyFx.photo'));
    assert.deepEqual(dailyFxOf(parseDailyFxBody('howler', ['罗恩', '你竟敢偷开飞车'])), { type: 'howler', from: '罗恩', text: '你竟敢偷开飞车' });
    assert.equal(parseDailyFxBody('howler', []), null);
});

test('gate:worldview:magic-house-follows-speaker-manual-then-dna-then-global', async () => {
    const { normalizeCharacterHouses, detectMagicHouse, resolveSpeakerMagicHouse } = await import('../src/visual/igs-ui/magic-house.js');
    const { renderCharacterAssetList } = await import('../src/visual/igs-ui/settings-fields.js');
    assert.deepEqual(normalizeCharacterHouses({ 哈利: 'scarlet', 坏值: 'pink', __proto__: 'emerald', ' ': 'amber' }), { 哈利: 'scarlet' });
    assert.equal(detectMagicHouse('七年级，Slytherin 级长，后来被分到格兰芬多'), 'emerald');
    assert.equal(detectMagicHouse('普通麻瓜'), '');
    const assets = {
        characters: { 德拉科: {}, 赫敏: {} },
        characterAliases: { 德拉科: ['马尔福'] },
        characterHouses: { 赫敏: 'sapphire' },
        characterDna: { 德拉科: { identity: '铂金色头发，斯莱特林学生' }, 赫敏: { identity: '格兰芬多' }, 卢娜: { identity: '金发' } },
    };
    assert.equal(resolveSpeakerMagicHouse(assets, '赫敏', 'amber'), 'sapphire', '手动指定优先于 DNA');
    assert.equal(resolveSpeakerMagicHouse(assets, '马尔福', 'amber'), 'emerald', '别名按主名识别 DNA');
    assert.equal(resolveSpeakerMagicHouse(assets, '卢娜', 'amber'), 'amber', 'DNA 没写学院用全局');
    assert.equal(resolveSpeakerMagicHouse(assets, '', 'nope'), 'starlight', '旁白用全局，全局非法回默认');
    const withRow = renderCharacterAssetList({ 赫敏: {} }, { magicHouse: { sceneAssets: assets, fallback: 'amber' } });
    assert.match(withRow, /data-char-house="赫敏"/);
    assert.match(withRow, /<option value="sapphire" selected>/);
    assert.match(renderCharacterAssetList({ 德拉科: {} }, { magicHouse: { sceneAssets: assets, fallback: 'amber' } }), /自动（DNA 识别为绿银）/);
    assert.doesNotMatch(renderCharacterAssetList({ 赫敏: {} }, {}), /data-char-house/);
});

test('gate:worldview:magic-house-vars-switch-with-speaker-on-render', async () => {
    const { applyReaderSettingsToDom } = await import('../src/visual/igs-ui/reader-dom-render.js');
    const props = {};
    const root = {
        style: { setProperty: (key, value) => { props[key] = value; }, removeProperty() {} },
        querySelector: () => null, querySelectorAll: () => [], classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
        setAttribute() {}, removeAttribute() {}, getAttribute: () => null, ownerDocument: null, getBoundingClientRect: () => ({ width: 800, height: 600 }),
    };
    const readerSettings = { dialogSkin: 'magic-academy', magicHouse: 'scarlet', _worldview: 'magic', _sceneAssets: { characters: { 德拉科: {} }, characterDna: { 德拉科: { identity: '斯莱特林' } } } };
    const veil = (content) => {
        applyReaderSettingsToDom(root, { mode: 'mobile', readerSettings, content }, null, {});
        return props['--igs-ma-veil'];
    };
    assert.equal(veil({ speaker: '德拉科', spriteCharacter: '德拉科', textType: 'dialogue' }), '#0f2b2c');
    assert.equal(veil({ speaker: '德拉科', textType: 'narration' }), '#36172f');
    assert.equal(veil({ speaker: '路人', textType: 'dialogue' }), '#36172f');
    readerSettings._worldview = 'modern';
    assert.equal(veil({ speaker: '德拉科', spriteCharacter: '德拉科', textType: 'dialogue' }), '#36172f', '非魔法世界观不按角色换色');
});

test('gate:worldview:house-settings-only-in-magic-worldview', async () => {
    const { bootstrapIGS } = await import('../src/index.js');
    const vn = bootstrapIGS({ global: {}, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'reader', mode: 'pc' }).controller;
        controller.setValue('readerSettings.dialogSkin', 'magic-academy');
        controller.setValue('bridge.sceneAssets.characters', { 赫敏: { 默认: '' } });
        const view = () => {
            controller.switchTab('reader');
            const reader = controller.getSnapshot().html;
            controller.switchTab('scene');
            return { reader, chars: controller.switchSceneSubTab('characters').html || controller.getSnapshot().html };
        };
        let html = view();
        assert.ok(!/学院配色/.test(html.reader) && />配色</.test(html.reader), '非魔法世界观只叫「配色」');
        assert.doesNotMatch(html.chars, /data-char-house/, '非魔法世界观不显示角色学院');
        await controller.invoke('worldview:magic');
        html = view();
        assert.match(html.reader, /学院配色/);
        assert.match(html.chars, /data-char-house="赫敏"/);
        controller.close();
    } finally {
        vn.destroy();
    }
});
