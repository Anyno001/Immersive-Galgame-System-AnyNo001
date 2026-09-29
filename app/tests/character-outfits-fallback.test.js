import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFallbackOutfit, resolveSpriteOutfit } from '../src/scene/character-outfits.js';
import { collectOutfitClues, isWornStatus } from '../src/data/shujuku/outfit-clues.js';

const outfits = {
    校服: { words: ['制服', '水手服'], moods: { 喜悦: 'school.png' } },
    泳装: { words: ['泳衣', '比基尼'], moods: { 喜悦: 'swim.png' } },
    睡衣: { words: ['睡裙'], moods: {} },
};
const sceneAssets = {
    characters: { 小林海斗: { 默认: 'base.png' } },
    characterAliases: { 小林海斗: ['小林'] },
    characterOutfits: { 小林海斗: outfits },
};

function sheet(uid, name, columns, rows, orderNo = 0) {
    return { uid, name, orderNo, content: [columns, ...rows] };
}
function tables(...sheets) {
    return { ok: true, data: Object.fromEntries(sheets.map((s) => [s.uid, s])) };
}
const roleTable = (outfitText) => sheet('sheet_role', '重要角色表', ['姓名', '穿着打扮'], [['小林', outfitText], ['雪乃', '和服']], 1);
const itemTable = (status, holderCol = '持有者') => sheet('sheet_item', '物品与装备表', ['物品名称', holderCol, '状态', '描述'],
    [['蓝色比基尼', '小林海斗', status, '海边用'], ['水手服', '雪乃', '已穿戴', '']], 2);
const noHolderItemTable = sheet('sheet_item', '物品表', ['物品名称', '状态', '描述'], [['水手服', '已穿戴', '小林海斗的']], 2);

test('gate:outfits:fallback-clues-read-role-profile-and-worn-items', () => {
    const clues = collectOutfitClues(tables(roleTable('白衬衫配水手服'), itemTable('已装备')), ['小林海斗', '小林']);
    assert.equal(clues.status, 'ready');
    assert.deepEqual(clues.profile, ['白衬衫配水手服']);
    assert.deepEqual(clues.worn, ['蓝色比基尼 海边用']);
});

test('gate:outfits:fallback-equipment-requires-holder-column-and-worn-status', () => {
    for (const status of ['已收纳', '脱下', '未穿戴', '已装备但损坏', '遗失', '']) {
        assert.deepEqual(collectOutfitClues(tables(itemTable(status)), ['小林海斗']).worn, [], status);
    }
    assert.deepEqual(collectOutfitClues(tables(noHolderItemTable), ['小林海斗']).worn, []);
    assert.deepEqual(collectOutfitClues(tables(itemTable('正在穿', '穿戴者')), ['小林海斗']).worn, ['蓝色比基尼 海边用']);
    assert.equal(isWornStatus('装备中'), true);
    assert.equal(isWornStatus('收纳中'), false);
});

test('gate:outfits:fallback-read-error-differs-from-empty-data', () => {
    const failed = collectOutfitClues({ ok: false, reason: 'missing-api' }, ['小林海斗']);
    assert.equal(failed.status, 'read-error');
    assert.equal(failed.reason, 'missing-api');
    const empty = collectOutfitClues(tables(), ['小林海斗']);
    assert.equal(empty.status, 'empty');
    assert.equal(empty.reason, '');
    const withDna = resolveFallbackOutfit(outfits, { clues: failed, dnaAppearance: '穿着睡裙' });
    assert.deepEqual(withDna, { outfit: '睡衣', source: 'dna', reason: 'missing-api' });
    assert.deepEqual(resolveFallbackOutfit(outfits, { clues: empty }), { outfit: '', source: '', reason: '' });
});

test('gate:outfits:fallback-priority-profile-then-equipment-then-dna', () => {
    const all = { status: 'ready', profile: ['水手服'], worn: ['比基尼'] };
    assert.equal(resolveFallbackOutfit(outfits, { clues: all, dnaAppearance: '睡裙' }).source, 'profile');
    assert.equal(resolveFallbackOutfit(outfits, { clues: { ...all, profile: ['普通便装'] }, dnaAppearance: '睡裙' }).outfit, '泳装');
    assert.equal(resolveFallbackOutfit(outfits, { clues: { profile: [], worn: [] }, dnaAppearance: '睡裙' }).outfit, '睡衣');
    // 同一来源里两套等长命中视为冲突，交给下一来源。
    assert.equal(resolveFallbackOutfit(outfits, { clues: { profile: ['制服或泳衣'], worn: [] }, dnaAppearance: '睡裙' }).outfit, '睡衣');
    // 单字不误配、未登记文本不制造服装。
    assert.equal(resolveFallbackOutfit(outfits, { clues: { profile: ['衣'], worn: ['运动衫'] }, dnaAppearance: '风衣' }).outfit, '');
});

test('gate:outfits:sprite-outfit-tag-overrides-fallback-and-reset-skips-it', () => {
    let reads = 0;
    const readClues = (names) => { reads++; assert.deepEqual(names, ['小林海斗', '小林']); return collectOutfitClues(tables(roleTable('水手服')), names); };
    const resolveDna = () => ({ defaultAppearance: '睡裙' });
    const base = { character: '小林', offset: 100, sceneAssets, readClues, resolveDna };
    const tag = (outfit) => [{ type: 'char', character: '小林海斗', outfit, offset: 0 }];

    assert.deepEqual(resolveSpriteOutfit({ ...base, directives: tag('泳装') }), { outfit: '泳装', source: 'tag', reason: '' });
    assert.deepEqual(resolveSpriteOutfit({ ...base, directives: tag('默认') }), { outfit: '', source: 'reset', reason: '' });
    assert.deepEqual(resolveSpriteOutfit({ ...base, directives: [], inheritedOutfits: { 小林海斗: '默认' } }), { outfit: '', source: 'reset', reason: '' });
    assert.equal(reads, 0);
    assert.deepEqual(resolveSpriteOutfit({ ...base, directives: [] }), { outfit: '校服', source: 'profile', reason: '' });
    assert.deepEqual(resolveSpriteOutfit({ ...base, directives: [], readClues: () => { throw new Error('boom'); } }),
        { outfit: '睡衣', source: 'dna', reason: 'boom' });
    assert.deepEqual(resolveSpriteOutfit({ ...base, character: '路人', directives: [] }), { outfit: '', source: '', reason: '' });
});
