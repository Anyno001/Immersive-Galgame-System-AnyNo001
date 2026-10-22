import test from 'node:test';
import assert from 'node:assert/strict';
import {
    extractFxDirectives,
    filterFxByKinds,
    parseFxBody,
    resolveFxAtPage,
} from '../src/scene/fx-directives.js';
import { hasIgsDirectiveTags, stripMarkerDirectives } from '../src/scene/directive-tags.js';
import { extractSceneDirectives } from '../src/scene/scene-directives.js';
import { extractChatBlocks } from '../src/scene/chat-blocks.js';
import { resolveFxPromptRule } from '../src/visual/igs-ui/fx-prompt.js';

test('gate:fx-directives:tags-never-leak-into-text', () => {
    assert.equal(hasIgsDirectiveTags('x[igs-fx:sfx|砰]'), true);
    assert.equal(stripMarkerDirectives('前[igs-fx:sfx|砰]后[igs-scene:教室|白天|晴]尾').trim(), '前后尾');
    assert.equal(stripMarkerDirectives('前[igs-fx:flashback\n下一行'), '前\n下一行');
    const scene = extractSceneDirectives('[igs-fx:sfx|砰][igs-char:爱丽丝|惊讶|啊！]');
    assert.equal(scene.directives.length, 1);
    assert.equal(scene.directives[0].type, 'char');
});

test('gate:fx-directives:item-filtered-only-when-allowed-and-never-leaks', () => {
    const fx = { instants: [], call: null, flashback: false, dream: false, letterbox: false, items: [{ action: 'gain', name: 'A', description: '' }], itemOverflow: 1 };
    assert.deepEqual(filterFxByKinds(fx, ['sfx']).items, []);
    assert.equal(filterFxByKinds(fx, ['sfx']).itemOverflow, 0);
    assert.equal(filterFxByKinds(fx, ['item']).items.length, 1);
    assert.equal(stripMarkerDirectives('前[igs-fx:item|获得|钥匙|旧的]后').trim(), '前后');
});
