import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTidy, buildTidyPrompt, extractTidyArray, parseTidyReply } from '../src/scene/stats/stat-story-tidy.js';
import { createSkillRegistry } from '../src/scene/stats/stat-registry.js';

const story = (name, attribute = '力量') => ({ name, attribute, category: 'general', aliases: [], createdAt: 1, guessed: false });
const catalog = () => ({ story: [story('御剑'), story('剑舞'), story('炼金术师手艺', '智力'), story('驭兽')], merged: {}, protagonistBase: { 御剑: 40 }, protagonistEdit: {} });

test('解析：代码围栏与前后废话仍能取出数组', () => {
    const reply = '好的：\n```json\n[{"type":"merge-story","from":"剑舞","to":"御剑","reason":"同类"}]\n```\n以上。';
    assert.equal(extractTidyArray(reply).length, 1);
    assert.equal(extractTidyArray({ text: '{"suggestions":[{"a":1}]}' }).length, 1);
    assert.deepEqual(extractTidyArray('没有'), []);
});

test('过滤：目标不存在、源不是剧情技能、重名、重复源都丢弃', () => {
    const reply = JSON.stringify([
        { type: 'merge-builtin', from: '御剑', to: '不存在的技能' },
        { type: 'merge-story', from: '剑术', to: '御剑' },
        { type: 'merge-story', from: '剑舞', to: '没有这项' },
        { type: 'rename', from: '驭兽', to: '剑术' },
        { type: 'rename', from: '驭兽', to: '这个名字实在太长了吧' },
        { type: 'merge-story', from: '剑舞', to: '御剑', reason: '同类' },
        { type: 'rename', from: '剑舞', to: '剑影' },
        { type: 'other', from: '驭兽', to: '御剑' },
    ]);
    const items = parseTidyReply(reply, catalog());
    assert.deepEqual(items.map((i) => `${i.type}:${i.from}>${i.to}`), ['merge-story:剑舞>御剑']);
});

test('过滤：from 为数组时展开，空回复无建议', () => {
    const items = parseTidyReply('[{"type":"merge-story","from":["剑舞","驭兽"],"to":"御剑"}]', catalog());
    assert.equal(items.length, 2);
    assert.equal(parseTidyReply('[]', catalog()).length, 0);
});

test('提示词包含剧情技能与内置技能', () => {
    const p = buildTidyPrompt([{ name: '御剑', attribute: '力量', value: 40 }, { name: '驭兽', attribute: '魅力', value: 30 }]);
    assert.match(p, /御剑（力量，40）/);
    assert.match(p, /内置技能：.*剑术/);
});

test('应用 merge-builtin：剧情条目删除，旧名成别名，底数并入取高', () => {
    const base = { ...catalog(), protagonistBase: { 御剑: 40, 剑术: 30 } };
    const { catalog: next, applied } = applyTidy(base, [{ type: 'merge-builtin', from: '御剑', to: '剑术' }]);
    assert.equal(applied, 1);
    assert.equal(next.story.some((s) => s.name === '御剑'), false);
    assert.equal(createSkillRegistry(next).resolve('御剑'), '剑术');
    assert.equal(next.protagonistBase.剑术, 40);
    assert.equal(next.protagonistBase.御剑, undefined);
});

test('应用 merge-story 与 rename', () => {
    const merged = applyTidy(catalog(), [{ type: 'merge-story', from: '剑舞', to: '御剑' }]);
    assert.equal(merged.applied, 1);
    assert.equal(merged.catalog.merged.剑舞, '御剑');
    const renamed = applyTidy(catalog(), [{ type: 'rename', from: '炼金术师手艺', to: '炼金' }]);
    assert.equal(renamed.applied, 1);
    assert.ok(renamed.catalog.story.some((s) => s.name === '炼金'));
    assert.equal(renamed.catalog.merged.炼金术师手艺, '炼金');
    const renameHero = applyTidy(catalog(), [{ type: 'rename', from: '御剑', to: '剑道' }]);
    assert.equal(renameHero.catalog.protagonistBase.剑道, 40);
});

test('应用时再校验：源已不存在则跳过', () => {
    const { applied } = applyTidy(catalog(), [{ type: 'merge-story', from: '不在', to: '御剑' }]);
    assert.equal(applied, 0);
});
