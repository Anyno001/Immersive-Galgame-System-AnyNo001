import test from 'node:test';
import assert from 'node:assert/strict';
import { handleArtistLibraryAction } from '../src/visual/igs-ui/settings-artist-library.js';
import { PROMPT_KINDS } from '../src/generated-images/prompt-artists.js';

const kindA = PROMPT_KINDS[0][0];
const kindB = PROMPT_KINDS[1][0];

function setup(entry, nai) {
    const panel = { asyncState: {}, draft: { bridge: { autoIllustration: { nai: { artistLibrary: { version: 1, entries: [entry] }, ...nai } } } } };
    const answers = ['名称', '新正向', '新负向'];
    const dialogs = { choose: async () => entry.id, edit: async () => answers.shift() };
    return { panel, ctx: { panel, dialogs, isCurrent: () => true, persistSettingsDraft: () => ({ ok: true }) } };
}

test('编辑画师串后全局与分区中等于旧内容的槽同步，其余不变', async () => {
    const entry = { id: 'a1', name: '名称', positivePrompt: '旧正', negativePrompt: '旧负' };
    const { panel, ctx } = setup(entry, {
        artistPrefix: '旧正', artistNegativePrefix: '旧负',
        artistByKind: { enabled: true, kinds: { [kindA]: { positive: '旧正', negative: '旧负' }, [kindB]: { positive: '旧正', negative: '别的' } } },
    });
    const result = await handleArtistLibraryAction('artist-library:edit', ctx);
    assert.equal(result.ok, true);
    const nai = panel.draft.bridge.autoIllustration.nai;
    assert.equal(nai.artistPrefix, '新正向');
    assert.equal(nai.artistNegativePrefix, '新负向');
    assert.deepEqual(nai.artistByKind.kinds[kindA], { positive: '新正向', negative: '新负向' });
    assert.deepEqual(nai.artistByKind.kinds[kindB], { positive: '旧正', negative: '别的' });
    assert.equal(panel.asyncState.artistLibrary.status, '已更新，正在使用这条的画师串已同步。');
});

test('旧内容为空时不同步未设置的槽', async () => {
    const entry = { id: 'a1', name: '名称', positivePrompt: '', negativePrompt: '' };
    const { panel, ctx } = setup(entry, { artistPrefix: '', artistNegativePrefix: '' });
    await handleArtistLibraryAction('artist-library:edit', ctx);
    const nai = panel.draft.bridge.autoIllustration.nai;
    assert.equal(nai.artistPrefix, '');
    assert.equal(nai.artistByKind?.kinds?.[kindA]?.positive || '', '');
    assert.equal(panel.asyncState.artistLibrary.status, '已更新。');
});
