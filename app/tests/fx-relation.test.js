import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, parseFxBody, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { applyFxEra } from '../src/scene/fx-era.js';
import { normalizeFxTagsSettings } from '../src/visual/igs-ui/fx-settings.js';
import { fxGrammarLines } from '../src/visual/igs-ui/fx-prompt.js';
import { createFxMemory, planPageFx } from '../src/visual/igs-ui/fx-runtime.js';

const TEXT = [
    '她靠过来。',
    '[igs-fx:whisper]',
    '[igs-char:林晚|害羞|其实……我一直记得。]',
    '[igs-fx:whisper-end]',
    '[igs-fx:nickname|林晚|阿屿]',
    '[igs-fx:voicemail|林晚|到家了回我一句]',
].join('\n');

function offsetOf(needle) {
    return TEXT.indexOf(needle);
}

test('gate:fx-relation parse whisper range, nickname and voicemail', () => {
    const directives = extractFxDirectives(TEXT);
    assert.deepEqual(directives.map((d) => `${d.kind}${d.end ? '-end' : ''}`), ['whisper', 'whisper-end', 'nickname', 'voicemail']);
    assert.equal(resolveFxAtPage(directives, offsetOf('[igs-char')).whisper, true);
    assert.equal(resolveFxAtPage(directives, TEXT.length).whisper, false);
    const page = resolveFxAtPage(directives, TEXT.length);
    assert.deepEqual(page.instants, [
        { kind: 'nickname', name: '林晚', nick: '阿屿' },
        { kind: 'voicemail', sender: '林晚', text: '到家了回我一句' },
    ]);
    const unclosed = extractFxDirectives('[igs-fx:whisper]\n耳语');
    assert.equal(resolveFxAtPage(unclosed, 20).whisper, true);
});

test('gate:fx-relation incomplete tags are dropped; voicemail sender optional', () => {
    assert.equal(parseFxBody('nickname|林晚'), null);
    assert.equal(parseFxBody('nickname'), null);
    assert.equal(parseFxBody('voicemail'), null);
    assert.equal(parseFxBody('nickname-end'), null);
    const page = resolveFxAtPage(extractFxDirectives('[igs-fx:voicemail|回电话]'), 30);
    assert.deepEqual(page.instants, [{ kind: 'voicemail', sender: '', text: '回电话' }]);
});

test('gate:fx-relation new sub-switches are opt-in; legacy kinds stay default-on', () => {
    const legacy = normalizeFxTagsSettings({ enabled: true });
    assert.equal(legacy.call, true);
    assert.equal(legacy.eye, true);
    assert.equal(legacy.whisper, false);
    assert.equal(legacy.nickname, false);
    assert.equal(legacy.voicemail, false);
    const on = normalizeFxTagsSettings({ enabled: true, whisper: true, nickname: 'yes' });
    assert.equal(on.whisper, true);
    assert.equal(on.nickname, false);
});

test('gate:fx-relation prompt lines appear only when opted in; ancient era drops voicemail', () => {
    const legacyLines = fxGrammarLines({ enabled: true }).join('\n');
    assert.doesNotMatch(legacyLines, /whisper|nickname|voicemail/);
    const lines = fxGrammarLines({ enabled: true, whisper: true, nickname: true, voicemail: true }).join('\n');
    assert.match(lines, /whisper … whisper-end/);
    assert.match(lines, /nickname\|角色名\|新称呼/);
    assert.match(lines, /voicemail\|发送者/);
    const ancient = applyFxEra({ fxTags: { enabled: true, whisper: true, voicemail: true } }, true);
    assert.equal(ancient.fxTags.voicemail, false);
    assert.equal(ancient.fxTags.whisper, true);
});

function snapshotOf(fxTags) {
    return {
        messageId: 7,
        readerSettings: { fxTags },
        content: { currentIndex: 0, fx: resolveFxAtPage(extractFxDirectives(TEXT), offsetOf('[igs-char')) },
    };
}

test('gate:fx-relation plan keeps whisper range and filters by sub-switch', () => {
    const on = planPageFx(snapshotOf({ enabled: true, whisper: true }), createFxMemory());
    assert.equal(on.whisper, true);
    assert.equal('whisper' in on.ranges, false);
    const off = planPageFx(snapshotOf({ enabled: true }), createFxMemory());
    assert.equal(off.whisper, false);
    const late = {
        messageId: 7,
        readerSettings: { fxTags: { enabled: true, nickname: true } },
        content: { currentIndex: 1, fx: resolveFxAtPage(extractFxDirectives(TEXT), TEXT.length) },
    };
    const plan = planPageFx(late, createFxMemory());
    assert.deepEqual(plan.effects.filter((e) => e.type === 'nickname' || e.type === 'voicemail').map((e) => e.type), ['nickname']);
});
