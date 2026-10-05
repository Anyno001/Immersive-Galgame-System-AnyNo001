import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeCharacterOutfits, normalizeWardrobe, resolveWardrobePrompt, isValidOutfitName, outfitNamesOf, resolveOutfitToken,
    createOutfitResolver, matchOutfitByText, buildOutfitGroupsText,
} from '../src/scene/character-outfits.js';

test('gate:outfits:normalize-drops-invalid-names-default-slot-and-proto-keys', () => {
    const raw = JSON.parse('{"小林":{"泳装":{"words":[" 泳衣 ","泳衣","a|b",""],"moods":{"默认":"x.png","喜悦":"e.png","__proto__":"p.png","害羞":3}},"默认":{"moods":{}},"a|b":{},"__proto__":{},"睡衣":{"words":["泳衣","睡裙"]}},"__proto__":{"x":{}},"空":[]}');
    const out = normalizeCharacterOutfits(raw);
    assert.deepEqual(Object.keys(out), ['小林']);
    assert.deepEqual(out['小林'], {
        泳装: { words: ['泳衣'], moods: { 喜悦: 'e.png' } },
        睡衣: { words: ['睡裙'], moods: {} },
    });
    assert.equal(isValidOutfitName('默认'), false);
    assert.equal(isValidOutfitName('原装'), false);
    assert.equal(isValidOutfitName('校服'), true);
});

test('gate:outfits:alias-reduces-to-main-name-and-words-resolve-outfit', () => {
    const sceneAssets = {
        characterAliases: { 小林海斗: ['小林'] },
        characterOutfits: { 小林海斗: { 泳装: { words: ['泳衣'], moods: {} }, 校服: { words: [], moods: {} } } },
    };
    assert.deepEqual(outfitNamesOf(sceneAssets.characterOutfits, sceneAssets.characterAliases, '小林'), ['泳装', '校服']);
    const resolve = createOutfitResolver(sceneAssets);
    assert.equal(resolve('小林', '泳衣'), '泳装');
    assert.equal(resolve('小林海斗', '校服'), '校服');
    assert.equal(resolve('小林海斗', '默认'), '默认');
    assert.equal(resolve('小林海斗', '原装'), '默认');
    assert.equal(resolve('小林海斗', '前半句'), '');
    assert.equal(resolve('路人', '泳装'), '');
    assert.equal(resolveOutfitToken({}, ''), '');
});

test('gate:outfits:text-match-prefers-longest-and-rejects-conflict-and-single-char', () => {
    const outfits = {
        校服: { words: ['衬衫', '百褶裙'], moods: {} },
        睡衣: { words: ['睡裙'], moods: {} },
        泳装: { words: ['衣'], moods: {} },
    };
    assert.equal(matchOutfitByText('白色衬衫，深蓝百褶裙', outfits), '校服');
    assert.equal(matchOutfitByText('一件睡衣', outfits), '睡衣');
    assert.equal(matchOutfitByText('破旧的衣服', outfits), '');
    assert.equal(matchOutfitByText('衬衫外披着睡裙', outfits), '');
    assert.equal(matchOutfitByText('', outfits), '');
});

test('gate:outfits:wardrobe-prompt-is-shared-and-named-link-wins', () => {
    const wardrobe = normalizeWardrobe({
        校服: { prompt: '  school uniform, pleated skirt  ' },
        泳装: 'swimsuit',
        默认: { prompt: 'nope' },
        'a|b': { prompt: 'bad' },
    });
    assert.deepEqual(wardrobe, {
        校服: { prompt: 'school uniform, pleated skirt' },
        泳装: { prompt: 'swimsuit' },
    });
    assert.deepEqual(resolveWardrobePrompt(wardrobe, { wardrobe: '泳装' }, '校服'), { name: '泳装', prompt: 'swimsuit' });
    assert.deepEqual(resolveWardrobePrompt(wardrobe, {}, '校服'), { name: '校服', prompt: 'school uniform, pleated skirt' });
    assert.equal(resolveWardrobePrompt(wardrobe, { wardrobe: '没有' }, '便服'), null);
    assert.deepEqual(normalizeWardrobe({ 校服: { prompt: 'a', reference: 'igs-gen:ref' } }).校服, { prompt: 'a', reference: 'igs-gen:ref' });
    assert.equal(normalizeWardrobe({ 校服: { prompt: 'a', reference: 'https://x' } }).校服.reference, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(normalizeWardrobe({ 裸体: { prompt: 'nude' }, 校服: { prompt: 'a' } }), '裸体'), false);
    assert.deepEqual(normalizeWardrobe({ 校服: { prompt: 'a', nsfwBoost: true } }).校服, { prompt: 'a', nsfwBoost: true });
    assert.equal(normalizeWardrobe({ 校服: { prompt: 'a', nsfwBoost: false } }).校服.nsfwBoost, undefined);
    assert.deepEqual(resolveWardrobePrompt({ 校服: { prompt: 'a', nsfwBoost: true } }, {}, '校服'), { name: '校服', prompt: 'a', nsfwBoost: true });
    const kept = normalizeCharacterOutfits({ 冬月: { 日常: { words: [], moods: {}, wardrobe: '裸体', base: 'igs-gen:nude' }, 裸体: { words: [], moods: {} } } });
    assert.equal(kept['冬月']['日常'].wardrobe, '裸体');
    assert.equal(kept['冬月']['日常'].base, 'igs-gen:nude');
    assert.equal(kept['冬月']['裸体'], undefined);
});

// 衣柜提示词在规则页：只列已有的条目；AI 写出的陌生服装词在「待确认」页处理，不在这里。
test('gate:outfits:wardrobe-rules-list-and-scope-tag', async () => {
    const { renderWardrobe } = await import('../src/visual/igs-ui/settings-outfit-fields.js');
    const html = renderWardrobe({});
    assert.match(html, /还没有衣柜提示词/);
    assert.doesNotMatch(html, /待确认|outfit-review-dismiss/);
    // 和场景页一样：「+」在标题右边，筛选在下一行左边。
    const { SCENE_RULES_TEMPLATE } = await import('../src/visual/igs-ui/settings-tabs.js');
    assert.match(SCENE_RULES_TEMPLATE, /衣柜提示词<span[^>]*>（只在生图时用）<\/span><button[^>]*data-action="wardrobe-add"/);
    assert.match(renderWardrobe({}, { lead: '<b>筛选</b>' }), /^<div class="igs-wardrobe-group"><div class="igs-asset-folder-bar"><b>筛选<\/b><\/div>/);
    const tagged = renderWardrobe({ 校服: { prompt: '' } }, { scopeTag: (collection, name) => `<i>${collection}:${name}</i>`, focus: '校服' });
    assert.match(tagged, /<i>wardrobe:校服<\/i>/);
    assert.match(tagged, /igs-wardrobe-item is-focus/);
    const filled = renderWardrobe({ 校服: { prompt: 'uniform', reference: 'igs-gen:ref' } }, { resolveUrl: () => 'data:image/png;base64,QQ==' });
    assert.match(filled, /data-action="wardrobe-reference:%E6%A0%A1%E6%9C%8D"/);
    assert.match(filled, /data-action="wardrobe-nsfw:%E6%A0%A1%E6%9C%8D"/);
    assert.match(filled, /aria-pressed="false"/);
    const spicy = renderWardrobe({ 校服: { prompt: 'uniform', nsfwBoost: true } });
    assert.match(spicy, /igs-wardrobe-nsfw is-on/);
    assert.match(spicy, /aria-pressed="true"/);
    assert.match(filled, /src="data:image\/png;base64,QQ=="/);
    const empty = renderWardrobe({ 冬月星见日常: { prompt: '' } });
    assert.match(empty, new RegExp(`data-action="wardrobe-generate-prompt:${encodeURIComponent('冬月星见日常')}"`));
    assert.match(empty, /<input class="igs-scene-url-input igs-wardrobe-prompt"/);
    assert.match(empty, /igs-row-menu[\s\S]*wardrobe-generate-prompt:/);
    assert.doesNotMatch(empty, /igs-settings-action/);
    assert.doesNotMatch(empty, /<textarea/);
    const hidden = renderWardrobe({ 裸体: { prompt: 'nude, nude' }, 校服: { prompt: '' } });
    assert.equal(hidden.includes('裸体'), false);
    assert.equal(hidden.includes('nude'), false);
    const { renderCharacterSlotTabs } = await import('../src/visual/igs-ui/settings-outfit-fields.js');
    const tabs = renderCharacterSlotTabs({
        charName: '冬月',
        baseMoods: [],
        baseListHtml: '',
        outfits: { 日常: { words: [], moods: {}, wardrobe: '裸体' } },
        activeOutfit: '日常',
        sceneAssets: { wardrobe: { 冬月星见日常: { prompt: 'daily' } } },
        isOpen: () => true,
    });
    assert.match(tabs, /igs-wardrobe-pick/);
    assert.match(tabs, /scene-set-outfit-wardrobe-url:[^"]*%E8%A3%B8%E4%BD%93/);
    assert.match(tabs, /outfit-expression-set:/);
    assert.doesNotMatch(tabs, /生成立绘|outfit-generate-nude:|char-generate-sprite:/);
    assert.equal(tabs.includes('scene-outfit-tab:%E5%86%AC%E6%9C%88:%E8%A3%B8%E4%BD%93'), false);
    assert.equal(tabs.includes('编辑提示词'), false);
});

test('gate:outfits:prompt-groups-text', () => {
    assert.equal(buildOutfitGroupsText({}), '（暂无登记服装。）');
    assert.equal(buildOutfitGroupsText({ 甲: {}, 乙: { 校服: {}, 泳装: {} } }), '乙：校服 / 泳装');
});


test('gate:outfits:four-field-tag-parses-only-registered-outfit', async () => {
    const { extractSceneDirectives } = await import('../src/scene/scene-directives.js');
    const outfitResolver = createOutfitResolver({
        characterOutfits: { 小林: { 泳装: { words: ['泳衣'], moods: {} } } },
    });
    const [char] = extractSceneDirectives('[igs-char:小林|喜悦|泳装|你好]', { outfitResolver }).directives;
    assert.equal(char.type, 'char');
    assert.equal(char.mood, '喜悦');
    assert.equal(char.outfit, '泳装');
    assert.equal(char.dialogue, '你好');
    const [thought] = extractSceneDirectives('[igs-thought:小林|害羞|泳衣|嗯]', { outfitResolver }).directives;
    assert.deepEqual([thought.type, thought.outfit, thought.thought], ['thought', '泳装', '嗯']);
    const [reset] = extractSceneDirectives('[igs-char:小林|平和|默认|回来了]', { outfitResolver }).directives;
    assert.equal(reset.outfit, '默认');
    const legacy = ['[igs-char:小林|喜悦|你好]', '[igs-char:小林|你好]', '[igs-char:小林|喜悦|前半|后半]', '旁白\n[igs-thought:小林|害羞|嗯]\n[igs-scene:教室|上午|晴天]'];
    assert.equal(extractSceneDirectives('[igs-char:小林|喜悦|泳装|你好]').directives.some((d) => d.outfit), false);
    for (const text of legacy.filter((t) => !t.includes('前半'))) {
        assert.deepEqual(extractSceneDirectives(text, { outfitResolver }), extractSceneDirectives(text), text);
    }
    // 未传 resolver（旧调用方）时四栏标签与旧版一致：不产出指令。
    assert.deepEqual(extractSceneDirectives('[igs-char:小林|喜悦|前半|后半]').directives, []);
});

test('gate:outfits:unregistered-outfit-field-keeps-dialogue-and-is-flagged', async () => {
    const { extractSceneDirectives } = await import('../src/scene/scene-directives.js');
    const outfitResolver = createOutfitResolver({ characterOutfits: { 小林: { 泳装: { words: [], moods: {} } } } });
    const parse = (text) => extractSceneDirectives(text, { outfitResolver }).directives[0];
    const unknown = parse('[igs-char:小林|喜悦|浴衣|看烟花吧。]');
    assert.deepEqual([unknown.type, unknown.mood, unknown.outfit, unknown.unknownOutfit, unknown.dialogue], ['char', '喜悦', '', '浴衣', '看烟花吧。']);
    const thought = parse('[igs-thought:雪乃|害羞|和服|好紧张]');
    assert.deepEqual([thought.character, thought.unknownOutfit, thought.thought], ['雪乃', '和服', '好紧张']);
    // 第 3 栏像句子（含空白或句读、过长）时按对白里的「|」拼回，不当服装。
    const sentence = parse('[igs-char:小林|喜悦|等等，你听我说|真的]');
    assert.deepEqual([sentence.outfit, sentence.unknownOutfit, sentence.dialogue], ['', undefined, '等等，你听我说|真的']);
    assert.equal(parse('[igs-char:小林|喜悦|这是一段超过十二个字的很长很长的话|后半]').unknownOutfit, undefined);
    assert.equal(parse('[igs-char:小林|喜悦|泳装|你好]').unknownOutfit, undefined);
});

test('gate:outfits:strip-outfit-field-before-body-format', async () => {
    const { stripOutfitFields } = await import('../src/scene/directive-tags.js');
    const outfitResolver = createOutfitResolver({
        characterOutfits: { 小林: { 泳装: { words: ['泳衣'], moods: {} } } },
    });
    assert.equal(
        stripOutfitFields('[igs-char:小林|喜悦|泳装|你好]\n[igs-thought:小林|害羞|泳衣|嗯]\n[igs-char:小林|喜悦|浴衣|后半]\n[igs-char:小林|喜悦|等等，听我说|后半|再后]\n[igs-char:小林|喜悦|泳装|没收口', outfitResolver),
        '[igs-char:小林|喜悦|你好]\n[igs-thought:小林|害羞|嗯]\n[igs-char:小林|喜悦|后半]\n[igs-char:小林|喜悦|等等，听我说｜后半｜再后]\n[igs-char:小林|喜悦|没收口',
    );

    assert.equal(stripOutfitFields('[igs-char:小林|喜悦|泳装|你好]'), '[igs-char:小林|喜悦|泳装|你好]');
});


test('gate:outfits:body-format-hides-outfit-field-with-default-regex', async () => {
    const { applyImmersiveGalgameSystemBodyFormat, DEFAULT_VIRTUAL_REGEX } = await import('../src/scene/message-source.js');
    const outfitResolver = createOutfitResolver({ characterOutfits: { 小林: { 泳装: { words: [], moods: {} } } } });
    const text = '[igs-char:小林|喜悦|泳装|你好]\n[igs-thought:小林|害羞|泳装|嗯]\n[igs-char:小林|喜悦|你好]';
    const out = applyImmersiveGalgameSystemBodyFormat(text, DEFAULT_VIRTUAL_REGEX, outfitResolver).formattedRaw;
    assert.equal(out, '[小林]：你好\n*嗯*\n[小林]：你好');
    assert.equal(applyImmersiveGalgameSystemBodyFormat('[igs-char:小林|喜悦|你好]', DEFAULT_VIRTUAL_REGEX).formattedRaw, '[小林]：你好');
});
