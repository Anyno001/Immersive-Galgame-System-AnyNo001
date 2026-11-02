import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicApi } from '../src/api/public-api.js';
import { CHARACTER_API_VERSION, createCharactersApi } from '../src/api/character-api.js';

const dnaOf = (subject) => ({ version: 2, views: { full_body: { subject, negative: 'bad' }, half_body: { subject: '' } }, personality: '温柔' });
const ctx = { characterId: 0, characters: [{ name: '卡A', avatar: 'a.png' }] };

function make(assets, context = ctx) {
    const saves = [];
    const readers = { readAssets: () => assets, readContext: () => context, saveAssets: (...a) => saves.push(a) };
    return { api: createCharactersApi(readers), saves };
}
const globalAssets = () => ({
    characterDna: { 艾拉: dnaOf('银发少女'), 空白: dnaOf('') },
    characterAliases: { 艾拉: ['小艾'] },
    cards: {},
});

test('createPublicApi：api.characters 带 version，缺读取器返回 null', () => {
    const api = createPublicApi({ version: 'test' }).api;
    assert.equal(api.characters.version, CHARACTER_API_VERSION);
    assert.equal(api.characters.dna('艾拉'), null);
});

test('命中与别名命中', () => {
    const { api } = make(globalAssets());
    const hit = api.dna('艾拉');
    assert.equal(hit.name, '艾拉');
    assert.equal(hit.dna.views.full_body.subject, '银发少女');
    assert.equal(api.dna('小艾').name, '艾拉');
});

test('本卡覆盖全局', () => {
    const assets = globalAssets();
    assets.cards = { 'card:卡A': { characterDna: { 艾拉: dnaOf('黑发少女') } } };
    const { api } = make(assets);
    const result = api.dna('艾拉');
    assert.ok(result);
    assert.equal(result.dna.views.full_body.subject, '黑发少女');
    assert.equal(make(globalAssets()).api.dna('艾拉').dna.views.full_body.subject, '银发少女');
});

test('isUser：取本卡 User 角色，未设返回 null', () => {
    const assets = globalAssets();
    const { api } = make({ ...assets, userCharacter: '艾拉' });
    assert.equal(api.dna('忽略我', { isUser: true }).name, '艾拉');
    assert.equal(make(assets).api.dna('艾拉', { isUser: true }), null);
});

test('无 DNA、空名、views 全空返回 null', () => {
    const { api } = make(globalAssets());
    assert.equal(api.dna('不存在'), null);
    assert.equal(api.dna(''), null);
    assert.equal(api.dna(undefined), null);
    assert.equal(api.dna('空白'), null);
});

test('读取器抛错返回 null', () => {
    const api = createCharactersApi({ readAssets: () => { throw new Error('x'); }, readContext: () => ctx });
    assert.equal(api.dna('艾拉'), null);
    const api2 = createCharactersApi({ readAssets: () => globalAssets(), readContext: () => { throw new Error('y'); } });
    assert.equal(api2.dna('艾拉'), null);
});

test('返回深拷贝，改返回值不影响源，源对象不被修改', () => {
    const assets = globalAssets();
    const before = JSON.stringify(assets);
    const { api } = make(assets);
    const hit = api.dna('艾拉');
    hit.dna.views.full_body.subject = '被改了';
    hit.dna.personality = 'x';
    assert.equal(assets.characterDna.艾拉.views.full_body.subject, '银发少女');
    assert.equal(api.dna('艾拉').dna.views.full_body.subject, '银发少女');
    assert.equal(JSON.stringify(assets), before);
});

test('不调用任何保存函数', () => {
    const { api, saves } = make(globalAssets());
    api.dna('艾拉'); api.dna('小艾'); api.dna('x', { isUser: true });
    assert.equal(saves.length, 0);
});

// —— outfit() ——
const outfitAssets = (extra = {}) => ({
    ...globalAssets(),
    characterOutfits: { 艾拉: {
        校服: { words: [], moods: { 平和: 'school.png' } },
        睡衣: { words: [], moods: { 平和: 'pajama.png' } },
        空衣: { words: [], moods: { 平和: 'blank.png' } },
    } },
    wardrobe: { 校服: { prompt: 'school uniform' }, 睡衣: { prompt: 'pajamas' } },
    characterDefaultOutfits: { 艾拉: { version: 1, outfitName: '校服' } },
    ...extra,
});
const chatCtx = (...floors) => ({ ...ctx, chat: floors.map(([mes, is_user = false, is_system = false]) => ({ mes, is_user, is_system })) });
const makeOutfit = (assets, context, readClues) => {
    const saves = [];
    const api = createCharactersApi({ readAssets: () => assets, readContext: () => context, readClues, saveAssets: (...a) => saves.push(a) });
    return { api, saves };
};

test('outfit：版本号为 2，dna 行为不变', () => {
    assert.equal(CHARACTER_API_VERSION, 2);
    assert.equal(makeOutfit(outfitAssets(), ctx).api.dna('艾拉').name, '艾拉');
});

test('outfit：正文最新楼写了衣装标签 → current（别名也行）', () => {
    const context = chatCtx(['[igs-char:艾拉|平和|校服|早]'], ['你好', true], ['[igs-char:小艾|平和|睡衣|晚安]']);
    const hit = makeOutfit(outfitAssets(), context).api.outfit('艾拉');
    assert.deepEqual(hit, { name: '艾拉', outfit: { name: '睡衣', description: 'pajamas' }, source: 'current' });
});

test('outfit：本楼没写，继承前面 AI 楼的衣装 → current；用户楼跳过', () => {
    const context = chatCtx(['[igs-char:艾拉|平和|睡衣|晚安]'], ['用户说话', true], ['[igs-char:艾拉|平和|对白]']);
    const hit = makeOutfit(outfitAssets(), context).api.outfit('艾拉');
    assert.equal(hit.source, 'current');
    assert.equal(hit.outfit.name, '睡衣');
});

// 与阅读器一致：被 /hide 的 AI 楼（酒馆记成 is_system）照样参与继承；旁白、注释、role=system 跳过。
test('outfit：继承计入被隐藏的 AI 楼，跳过旁白与注释楼', () => {
    const hidden = chatCtx(['[igs-char:艾拉|平和|睡衣|晚安]'], ['[igs-char:艾拉|平和|校服|隐藏楼]', false, true],
        ['用户说话', true], ['[igs-char:艾拉|平和|对白]']);
    assert.equal(makeOutfit(outfitAssets(), hidden).api.outfit('艾拉').outfit.name, '校服');
    for (const extra of [{ extra: { type: 'narrator' } }, { extra: { type: 'comment' } }, { role: 'system' }]) {
        const context = chatCtx(['[igs-char:艾拉|平和|睡衣|晚安]'], ['[igs-char:艾拉|平和|校服|旁白]', false, true], ['[igs-char:艾拉|平和|对白]']);
        Object.assign(context.chat[1], extra);
        assert.equal(makeOutfit(outfitAssets(), context).api.outfit('艾拉').outfit.name, '睡衣', JSON.stringify(extra));
    }
});

test('outfit：当前楼按阅读器口径取最新一条未隐藏的 AI 楼', () => {
    // 最新一楼被隐藏：当前楼退到前一楼，隐藏楼的衣装不算当前。
    const context = chatCtx(['[igs-char:艾拉|平和|睡衣|晚安]'], ['[igs-char:艾拉|平和|校服|隐藏]', false, true]);
    assert.equal(makeOutfit(outfitAssets(), context).api.outfit('艾拉').outfit.name, '睡衣');
    const flagged = chatCtx(['[igs-char:艾拉|平和|睡衣|晚安]'], ['[igs-char:艾拉|平和|校服|隐藏]']);
    flagged.chat[1].is_hidden = true;
    assert.equal(makeOutfit(outfitAssets(), flagged).api.outfit('艾拉').outfit.name, '睡衣');
});

test('outfit：未登记衣装 / 描述为空 → default', () => {
    const unknown = chatCtx(['[igs-char:艾拉|平和|泳装|嗨]']);
    assert.deepEqual(makeOutfit(outfitAssets(), unknown).api.outfit('艾拉'),
        { name: '艾拉', outfit: { name: '校服', description: 'school uniform' }, source: 'default' });
    const blank = chatCtx(['[igs-char:艾拉|平和|空衣|嗨]']);
    assert.equal(makeOutfit(outfitAssets(), blank).api.outfit('艾拉').source, 'default');
});

test('outfit：没有标签或没有聊天 → default', () => {
    assert.equal(makeOutfit(outfitAssets(), chatCtx(['[igs-char:艾拉|平和|你好]'])).api.outfit('艾拉').source, 'default');
    const hit = makeOutfit(outfitAssets(), ctx).api.outfit('小艾');
    assert.deepEqual(hit, { name: '艾拉', outfit: { name: '校服', description: 'school uniform' }, source: 'default' });
});

test('outfit：默认被本卡隐藏 → 顶替那套', () => {
    const assets = outfitAssets({ cards: { 'card:卡A': { hiddenOutfits: { 艾拉: ['校服'] } } } });
    const hit = makeOutfit(assets, ctx).api.outfit('艾拉');
    assert.equal(hit.source, 'default');
    assert.equal(hit.outfit.name, '睡衣');
    assert.equal(hit.outfit.description, 'pajamas');
});

test('outfit：无衣装、空名、不存在 → null', () => {
    const { api } = makeOutfit(globalAssets(), chatCtx(['[igs-char:艾拉|平和|校服|早]']));
    assert.equal(api.outfit('艾拉'), null);
    assert.equal(makeOutfit(outfitAssets(), ctx).api.outfit(''), null);
    assert.equal(makeOutfit(outfitAssets(), ctx).api.outfit('不存在'), null);
});

test('outfit：isUser 取本卡 User 角色，未设返回 null', () => {
    const context = chatCtx(['[igs-char:艾拉|平和|睡衣|晚安]']);
    const hit = makeOutfit(outfitAssets({ userCharacter: '艾拉' }), context).api.outfit('忽略我', { isUser: true });
    assert.equal(hit.name, '艾拉');
    assert.equal(hit.source, 'current');
    assert.equal(makeOutfit(outfitAssets(), context).api.outfit('艾拉', { isUser: true }), null);
});

test('outfit：读取器抛错 → null；线索读取抛错不影响', () => {
    assert.equal(createCharactersApi({ readAssets: () => { throw new Error('x'); }, readContext: () => ctx }).outfit('艾拉'), null);
    assert.equal(createCharactersApi({ readAssets: () => outfitAssets(), readContext: () => { throw new Error('y'); } }).outfit('艾拉'), null);
    const hit = makeOutfit(outfitAssets(), chatCtx(['旁白']), () => { throw new Error('z'); }).api.outfit('艾拉');
    assert.equal(hit.source, 'default');
});

test('outfit：返回深拷贝、源不被修改、不调用保存', () => {
    const assets = outfitAssets();
    const context = chatCtx(['[igs-char:艾拉|平和|睡衣|晚安]']);
    const before = JSON.stringify(assets);
    const { api, saves } = makeOutfit(assets, context);
    const hit = api.outfit('艾拉');
    hit.outfit.description = '被改了';
    assert.equal(api.outfit('艾拉').outfit.description, 'pajamas');
    api.outfit('x', { isUser: true });
    assert.equal(JSON.stringify(assets), before);
    assert.equal(saves.length, 0);
});
