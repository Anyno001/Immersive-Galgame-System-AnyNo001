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

test('gate:fx-directives:parse-known-kinds-and-reject-bad-args', () => {
    assert.deepEqual(parseFxBody('call|爱丽丝'), { kind: 'call', end: false, args: ['爱丽丝'] });
    assert.deepEqual(parseFxBody('call-end'), { kind: 'call', end: true, args: [] });
    assert.deepEqual(parseFxBody('dream'), { kind: 'dream', end: false, args: [] });
    assert.deepEqual(parseFxBody('dream-end'), { kind: 'dream', end: true, args: [] });
    assert.deepEqual(parseFxBody('eye|OPEN'), { kind: 'eye', end: false, args: ['open'] });
    assert.equal(parseFxBody('eye|blink'), null);
    assert.equal(parseFxBody('call'), null);
    assert.equal(parseFxBody('sfx'), null);
    assert.equal(parseFxBody('sfx-end'), null);
    assert.equal(parseFxBody('explode|x'), null);
});

test('gate:fx-directives:extract-offsets-and-tolerate-missing-bracket', () => {
    const source = '开头\n[igs-fx:sfx|砰]\n正文一\n[igs-fx:flashback\n回忆\n[igs-fx:dream]\n梦境\n[igs-fx:bogus]\n';
    const list = extractFxDirectives(source);
    assert.deepEqual(list.map((d) => d.kind), ['sfx', 'flashback', 'dream']);
    assert.equal(list[0].offset, source.indexOf('[igs-fx:sfx'));
});

test('gate:fx-directives:instants-attach-to-next-page-ranges-follow-open-close', () => {
    const source = '[igs-fx:call|爱丽丝]第一页\n[igs-fx:dream]梦境页\n[igs-fx:dream-end]现实页';
    const list = extractFxDirectives(source);
    const p1 = source.indexOf('第一页');
    const p2 = source.indexOf('梦境页');
    const p3 = source.indexOf('现实页');
    const first = resolveFxAtPage(list, p1, -1);
    assert.deepEqual(first.instants, [{ kind: 'call', name: '爱丽丝' }]);
    assert.deepEqual(first.call, { name: '爱丽丝' });
    const second = resolveFxAtPage(list, p2, p1);
    assert.deepEqual(second.instants, []);
    assert.equal(second.dream, true);
    const third = resolveFxAtPage(list, p3, p2);
    assert.deepEqual(third.instants, []);
    assert.equal(third.dream, false);
    assert.deepEqual(third.call, { name: '爱丽丝' });
    assert.deepEqual(resolveFxAtPage(list, -1, -1).instants, []);
});

test('gate:fx-directives:filter-by-enabled-kinds', () => {
    const fx = { instants: [{ kind: 'sfx', text: '砰' }, { kind: 'call-end' }], call: { name: 'A' }, flashback: true, dream: true, letterbox: true };
    const filtered = filterFxByKinds(fx, ['call', 'dream', 'letterbox']);
    assert.deepEqual(filtered.instants, [{ kind: 'call-end' }]);
    assert.deepEqual(filtered.call, { name: 'A' });
    assert.equal(filtered.flashback, false);
    assert.equal(filtered.dream, true);
    assert.equal(filtered.letterbox, true);
});

test('gate:fx-directives:tags-never-leak-into-text', () => {
    assert.equal(hasIgsDirectiveTags('x[igs-fx:sfx|砰]'), true);
    assert.equal(stripMarkerDirectives('前[igs-fx:sfx|砰]后[igs-scene:教室|白天|晴]尾').trim(), '前后尾');
    assert.equal(stripMarkerDirectives('前[igs-fx:flashback\n下一行'), '前\n下一行');
    const scene = extractSceneDirectives('[igs-fx:sfx|砰][igs-char:爱丽丝|惊讶|啊！]');
    assert.equal(scene.directives.length, 1);
    assert.equal(scene.directives[0].type, 'char');
});

test('gate:fx-directives:fx-lines-move-out-of-explicit-chat-blocks', () => {
    const { text, chats } = extractChatBlocks('[igs-chat:群]\n[igs-msg:A|在吗]\n[igs-fx:sfx|叮]\n[igs-msg:B|在]\n[igs-chat-end]');
    assert.equal(chats.length, 1);
    assert.deepEqual(chats[0].messages.map((m) => m.kind), ['msg', 'msg']);
    assert.ok(text.indexOf('[igs-fx:sfx|叮]') < text.indexOf('[igs-chat#0]'));
});

test('gate:fx-directives:prompt-rule-only-lists-enabled-kinds', () => {
    assert.equal(resolveFxPromptRule({ enabled: false }), '');
    const rule = resolveFxPromptRule({ enabled: true, call: false, notify: false, flashback: true, dream: true, letterbox: false, sfx: true, eye: false });
    assert.match(rule, /igs-fx:flashback/);
    assert.match(rule, /igs-fx:dream/);
    assert.match(rule, /igs-fx:sfx/);
    assert.doesNotMatch(rule, /igs-fx:call/);
    assert.equal(resolveFxPromptRule({ enabled: true, call: false, notify: false, flashback: false, dream: false, letterbox: false, sfx: false, eye: false }), '');
});
