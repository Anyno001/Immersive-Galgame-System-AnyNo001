import test from 'node:test';
import assert from 'node:assert/strict';
import { kindArtist, normalizeArtistByKind, promptKindOf } from '../src/generated-images/prompt-artists.js';
import { BUILTIN_PROMPTS } from '../src/generated-images/prompt-registry.js';
import { DEFAULT_ASSET_TEMPLATES } from '../src/generated-images/illustration/prompt-kit.js';

const conf = { enabled: true, kinds: { sprite: { positive: 'artist:aaa, 1.2::artist:bbb::', negative: 'lowres' }, cg: { positive: '', negative: '' } } };

test('gate: 分区画师串开关关着或这一类留空时退回全局', () => {
    assert.equal(kindArtist({ ...conf, enabled: false }, { promptKind: 'sprite' }), null);
    assert.equal(kindArtist(conf, { imageKind: 'cg' }), null);
    assert.deepEqual(kindArtist(conf, { promptKind: 'sprite' }), { positive: 'artist:aaa, 1.2::artist:bbb::', negative: 'lowres' });
});

const artistRow = (extra = {}) => ({ id: 'ink', name: '墨色', positivePrompt: 'artist:ink', negativePrompt: 'lowres', ...extra });

test('gate:artist-library:两种兼容格式仅导入文本，不改原库', async () => {
    const { importArtistLibrary, readArtistLibrary } = await import('../src/generated-images/artist-library.js');
    const raw = JSON.stringify([artistRow({ sequence: 4, referenceImage: 'data:image/png;base64,X', apiKey: 'ignored' })]);
    const imported = importArtistLibrary(raw);
    assert.equal(imported.ok, true);
    assert.deepEqual(imported.value.entries, [artistRow()]);
    const before = structuredClone(imported.value);
    const next = importArtistLibrary(JSON.stringify({ presets: { 水彩: { fixedPrompt: 'artist:water', fixedPrompt_end: 'soft', negativePrompt: 'noise' } }, images: { 水彩: 'ignored' } }), imported.value);
    assert.equal(next.ok, true);
    assert.deepEqual(imported.value, before);
    assert.deepEqual(next.value.entries[1], { id: 'artist-水彩', name: '水彩', positivePrompt: 'artist:water, soft', negativePrompt: 'noise' });
    assert.deepEqual(readArtistLibrary(undefined), { ok: true, value: [] });
});

test('gate:artist-library:覆盖确认后面板过期不写入旧草稿', async () => {
    const { handleArtistLibraryAction } = await import('../src/visual/igs-ui/settings-artist-library.js');
    const panel = { draft: { bridge: { autoIllustration: { nai: { artistLibrary: { version: 1, entries: [artistRow()] } } } } }, asyncState: {} };
    const before = structuredClone(panel.draft);
    let current = true;
    const result = await handleArtistLibraryAction('artist-library:import', {
        panel, isCurrent: () => current,
        readFile: async () => ({ ok: true, text: JSON.stringify([artistRow({ positivePrompt: 'new' })]) }),
        dialogs: { confirm: async () => { current = false; return true; } },
    });
    assert.equal(result.ok, false);
    assert.deepEqual(panel.draft, before);
});
