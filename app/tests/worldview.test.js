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
