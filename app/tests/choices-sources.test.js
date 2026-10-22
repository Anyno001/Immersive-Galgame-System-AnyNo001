import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildItemActionText,
    extractBodyChoices,
    listPresentNames,
    normalizeOptionSources,
    normalizeQuickActions,
    splitQuickActions,
} from '../src/choices/option-sources.js';
import { normalizeOptionBubble } from '../src/visual/igs-ui/settings-host-normalize.js';

test('choices-sources: item action text', () => {
    assert.equal(buildItemActionText('use', '回复药'), '我使用了【回复药】');
    assert.equal(buildItemActionText('give', '手帕', '白露'), '我把【手帕】递给了白露');
    assert.equal(buildItemActionText('give', '手帕', ''), '我把【手帕】递给了');
    assert.equal(buildItemActionText('inspect', '手帕'), '我仔细查看了【手帕】');
    assert.equal(buildItemActionText('use', '  '), '');
});

test('choices-sources: present characters from sprite and cast, protagonist excluded', () => {
    const names = listPresentNames({ spriteImage: 'a.png', spriteCharacter: '白露', castSprites: [{ character: '林夏' }, { character: '白露' }, { character: '陈屿' }] }, '陈屿');
    assert.deepEqual(names, ['白露', '林夏']);
    assert.deepEqual(listPresentNames({ spriteImage: null, spriteCharacter: '白露', castSprites: [] }), []);
    assert.deepEqual(listPresentNames(null), []);
});
