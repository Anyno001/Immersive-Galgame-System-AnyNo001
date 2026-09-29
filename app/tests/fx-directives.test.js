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
    assert.deepEqual(parseFxBody('call|爱丽丝'), { kind: 'call', end: false, args: ['爱丽丝', 'in', 'voice'] });
    assert.deepEqual(parseFxBody('call-end'), { kind: 'call', end: true, args: ['end'] });
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
    assert.deepEqual(first.instants, [{ kind: 'call', name: '爱丽丝', dir: 'in', mode: 'voice' }]);
    assert.deepEqual(first.call, { name: '爱丽丝', dir: 'in', mode: 'voice', at: 0 });
    const second = resolveFxAtPage(list, p2, p1);
    assert.deepEqual(second.instants, []);
    assert.equal(second.dream, true);
    const third = resolveFxAtPage(list, p3, p2);
    assert.deepEqual(third.instants, []);
    assert.equal(third.dream, false);
    assert.deepEqual(third.call, { name: '爱丽丝', dir: 'in', mode: 'voice', at: 0 });
    assert.deepEqual(resolveFxAtPage(list, -1, -1).instants, []);
});

test('gate:fx-directives:dial-video-and-call-end-reasons', () => {
    assert.deepEqual(parseFxBody('dial|爱丽丝'), { kind: 'call', end: false, args: ['爱丽丝', 'out', 'voice'] });
    assert.deepEqual(parseFxBody('call|爱丽丝|视频'), { kind: 'call', end: false, args: ['爱丽丝', 'in', 'video'] });
    assert.deepEqual(parseFxBody('video|爱丽丝'), { kind: 'call', end: false, args: ['爱丽丝', 'in', 'video'] });
    assert.deepEqual(parseFxBody('dial|爱丽丝|video'), { kind: 'call', end: false, args: ['爱丽丝', 'out', 'video'] });
    assert.deepEqual(parseFxBody('call-end|未接'), { kind: 'call', end: true, args: ['missed'] });
    assert.deepEqual(parseFxBody('dial-end|拒接'), { kind: 'call', end: true, args: ['reject'] });
    assert.deepEqual(parseFxBody('call-end|对方挂断'), { kind: 'call', end: true, args: ['cut'] });
    assert.deepEqual(parseFxBody('call-end|随便写'), { kind: 'call', end: true, args: ['end'] });
    assert.equal(parseFxBody('dial'), null);
    assert.equal(parseFxBody('video'), null);
    // 挂断沿用被结束那通电话的对象、方向和类型；同页拨出又未接时两个瞬时演出都保留。
    const source = '[igs-fx:dial|爱丽丝|视频]\n[igs-fx:call-end|未接]\n第一页';
    const page = resolveFxAtPage(extractFxDirectives(source), source.indexOf('第一页'), -1);
    assert.deepEqual(page.instants, [
        { kind: 'call', name: '爱丽丝', dir: 'out', mode: 'video' },
        { kind: 'call-end', reason: 'missed', name: '爱丽丝', dir: 'out', mode: 'video' },
    ]);
    assert.equal(page.call, null);
    const rule = resolveFxPromptRule({ enabled: true, call: true });
    assert.match(rule, /igs-fx:dial\|/);
    assert.match(rule, /igs-fx:call-end\|未接/);
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


test('gate:fx-directives:item-parse-actions-and-reject-bad-args', () => {
    assert.deepEqual(parseFxBody('item|获得|黄铜钥匙|旧钥匙'), { kind: 'item', end: false, args: ['gain', '黄铜钥匙', '旧钥匙'] });
    assert.deepEqual(parseFxBody('item|失去|信'), { kind: 'item', end: false, args: ['lose', '信', ''] });
    assert.deepEqual(parseFxBody('item|USE|药水'), { kind: 'item', end: false, args: ['use', '药水', ''] });
    assert.equal(parseFxBody('item|丢弃|信'), null);
    assert.equal(parseFxBody('item|获得'), null);
    assert.equal(parseFxBody('item|获得|'), null);
    assert.equal(parseFxBody('item-end'), null);
    assert.deepEqual(parseFxBody('item|获得|星之坠饰|遗物|重要'), { kind: 'item', end: false, args: ['gain', '星之坠饰', '遗物', 'rare'] });
    assert.deepEqual(parseFxBody('item|获得|星之坠饰||RARE').args, ['gain', '星之坠饰', '', 'rare']);
    assert.deepEqual(parseFxBody('item|获得|星之坠饰|遗物|普通').args, ['gain', '星之坠饰', '遗物']);
});

test('gate:fx-directives:item-collects-up-to-three-per-page-with-overflow', () => {
    const source = '[igs-fx:sfx|砰][igs-fx:item|获得|A][igs-fx:item|获得|B][igs-fx:sfx|叮][igs-fx:item|获得|C][igs-fx:item|使用|D][igs-fx:item|获得|E]第一页\n[igs-fx:item|失去|F]第二页';
    const list = extractFxDirectives(source);
    const p1 = source.indexOf('第一页');
    const p2 = source.indexOf('第二页');
    const first = resolveFxAtPage(list, p1, -1);
    assert.deepEqual(first.items.map((i) => i.name), ['A', 'B', 'C']);
    assert.equal(first.itemOverflow, 2);
    assert.deepEqual(first.instants, [{ kind: 'sfx', text: '砰' }]);
    const second = resolveFxAtPage(list, p2, p1);
    assert.deepEqual(second.items, [{ action: 'lose', name: 'F', description: '' }]);
    assert.equal(second.itemOverflow, 0);
    assert.deepEqual(resolveFxAtPage([], 0, -1).items, []);
    const rare = resolveFxAtPage(extractFxDirectives('[igs-fx:item|获得|坠饰|遗物|重要]正文'), 5, -1);
    assert.deepEqual(rare.items, [{ action: 'gain', name: '坠饰', description: '遗物', rarity: 'rare' }]);
});

test('gate:fx-directives:item-filtered-only-when-allowed-and-never-leaks', () => {
    const fx = { instants: [], call: null, flashback: false, dream: false, letterbox: false, items: [{ action: 'gain', name: 'A', description: '' }], itemOverflow: 1 };
    assert.deepEqual(filterFxByKinds(fx, ['sfx']).items, []);
    assert.equal(filterFxByKinds(fx, ['sfx']).itemOverflow, 0);
    assert.equal(filterFxByKinds(fx, ['item']).items.length, 1);
    assert.equal(stripMarkerDirectives('前[igs-fx:item|获得|钥匙|旧的]后').trim(), '前后');
});

test('gate:fx-directives:item-prompt-rule-follows-own-switch', async () => {
    const { resolveItemFxPromptRule } = await import('../src/visual/igs-ui/fx-prompt.js');
    assert.equal(resolveItemFxPromptRule(false), '');
    assert.equal(resolveItemFxPromptRule(undefined), '');
    assert.match(resolveItemFxPromptRule(true), /igs-fx:item\|获得/);
    assert.match(resolveItemFxPromptRule(true), /重要/);
    assert.doesNotMatch(resolveFxPromptRule({ enabled: true, call: true, notify: true, flashback: true, dream: true, letterbox: true, sfx: true, eye: true }), /igs-fx:item/);
});

test('gate:fx-era:ancient-turns-off-modern-only-fx-without-mutating-input', async () => {
    const { applyFxEra, isAncientEra, FX_ERA_MODERN_ONLY } = await import('../src/scene/fx-era.js');
    const reader = { fxTags: { enabled: true, call: true }, dailyFx: { enabled: true }, chatShow: { enabled: true, frame: 'phone' } };
    assert.equal(applyFxEra(reader, false), reader);
    const ancient = applyFxEra(reader, true);
    assert.notEqual(ancient, reader);
    assert.equal(reader.fxTags.call, true, 'input untouched');
    for (const kind of FX_ERA_MODERN_ONLY.fxTags) assert.equal(ancient.fxTags[kind], false, kind);
    for (const kind of FX_ERA_MODERN_ONLY.dailyFx) assert.equal(ancient.dailyFx[kind], false, kind);
    assert.equal(ancient.fxTags.flashback, undefined, 'universal kinds keep their own switch');
    assert.deepEqual(ancient.chatShow, { enabled: true, frame: 'phone' }, 'chat becomes letters instead of being turned off');
    assert.equal(ancient.fxTags.notify, undefined, 'notify becomes a servant report instead of being turned off');
    assert.equal(resolveFxPromptRule(ancient.fxTags).includes('igs-fx:call'), false);
    assert.match(resolveFxPromptRule(ancient.fxTags, { ancient: true }), /igs-fx:notify\|来人\|/);
    assert.match(resolveFxPromptRule(ancient.fxTags), /手机弹出/);
    assert.equal(isAncientEra({ ancient: true }), true);
    assert.equal(isAncientEra({ ancient: 'true' }), false);
    assert.equal(isAncientEra(null), false);
});
