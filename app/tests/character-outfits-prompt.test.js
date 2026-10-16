import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutfitGroupsText, NO_OUTFIT_GROUPS_TEXT, normalizeCharacterOutfits, OUTFIT_GROUPS_PLACEHOLDER } from '../src/scene/character-outfits.js';
import { buildPreviousOutfitDnaText } from '../src/scene/previous-outfit-dna.js';
import { resolvePromptRuleContent } from '../src/scene/prompt-rule-content.js';
import { collectPromptContext } from '../src/host/prompt-context.js';
import {
    DEFAULT_SCENE_PROMPT_RULE,
    LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3,
    LEGACY_DEFAULT_SCENE_PROMPT_RULE_V4,
    PROMPT_RULE_OUTFIT_HINT,
    PROMPT_RULE_OUTFIT_DNA_HINT,
    normalizeScenePromptRule,
    scenePromptRuleOutfitHint,
} from '../src/visual/igs-ui/reader-host-constants.js';

test('gate:outfits:prompt-default-rule-declares-outfit-column-and-placeholder', () => {
    assert.match(DEFAULT_SCENE_PROMPT_RULE, /\[igs-char:角色名\|表情\|服装\|对白\]/);
    assert.match(DEFAULT_SCENE_PROMPT_RULE, /\[igs-thought:角色名\|表情\|服装\|心里话\]/);
    assert.match(DEFAULT_SCENE_PROMPT_RULE, /不能省，也不要照抄上一句/);
    assert.match(DEFAULT_SCENE_PROMPT_RULE, /看这个角色现在在什么地方、正在做什么，去对下面括号里的说明：对上哪套就写哪套的名字；一套都对不上，就新起一个1至12字的短名，不要空格和标点/);
    assert.match(DEFAULT_SCENE_PROMPT_RULE, /剧情里写明这个角色换了衣服、穿上另一套、脱了或披上，服装栏必须改成换上的那套，不许再写原来那套/);
    assert.match(DEFAULT_SCENE_PROMPT_RULE, /换衣服示例：上一句 \[igs-char:林小雨\|平和\|校服\|走吧。\] 回到家换上睡衣，写成 \[igs-char:林小雨\|平和\|睡衣\|我回来了。\]/);
    assert.match(DEFAULT_SCENE_PROMPT_RULE, /新衣服示例：去宴会，上面没有能对上的说明，新起短名，写成 \[igs-char:林小雨\|喜悦\|晚礼服\|到了。\]/);
    assert.match(LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3, /剧情里写明这个角色换了衣服、穿上另一套、脱了或披上，服装栏必须改成换上的那套，不许再写原来那套/);
    assert.match(LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3, /新衣服示例：去宴会，上面没有能对上的说明，新起短名，写成 \[igs-char:林小雨\|喜悦\|晚礼服\|到了。\]/);
    assert.doesNotMatch(LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3, /禁止自造；每轮/);
    assert.doesNotMatch(LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3, /换回原有外观写「默认」/);
    assert.doesNotMatch(DEFAULT_SCENE_PROMPT_RULE, /原装/);
    assert.doesNotMatch(DEFAULT_SCENE_PROMPT_RULE, /不要新造/);
    assert.doesNotMatch(DEFAULT_SCENE_PROMPT_RULE, /省略该栏/);
    assert.ok(DEFAULT_SCENE_PROMPT_RULE.includes(OUTFIT_GROUPS_PLACEHOLDER));
});

test('gate:outfits:prompt-keeps-saved-rule-and-fills-only-empty', () => {
    for (const value of ['', null, undefined]) {
        assert.equal(normalizeScenePromptRule(value), DEFAULT_SCENE_PROMPT_RULE);
    }
    const saved = '服装：只用下列已登记名称，不自造';
    assert.equal(normalizeScenePromptRule(saved), saved);
    assert.equal(normalizeScenePromptRule(DEFAULT_SCENE_PROMPT_RULE), DEFAULT_SCENE_PROMPT_RULE);
    assert.equal(normalizeScenePromptRule(LEGACY_DEFAULT_SCENE_PROMPT_RULE_V4), DEFAULT_SCENE_PROMPT_RULE);
});

test('gate:outfits:prompt-custom-rule-without-placeholder-gets-hint', () => {
    assert.equal(scenePromptRuleOutfitHint(DEFAULT_SCENE_PROMPT_RULE), '');
    assert.equal(scenePromptRuleOutfitHint('自定义 {{outfit_groups}}'), PROMPT_RULE_OUTFIT_DNA_HINT);
    assert.equal(scenePromptRuleOutfitHint('自定义 {{outfit_groups}} {{previous_outfit_dna}}'), '');
    assert.equal(scenePromptRuleOutfitHint('自定义规则'), `${PROMPT_RULE_OUTFIT_HINT}\n${PROMPT_RULE_OUTFIT_DNA_HINT}`);
    assert.equal(scenePromptRuleOutfitHint('没有服装占位符的旧规则'), `${PROMPT_RULE_OUTFIT_HINT}\n${PROMPT_RULE_OUTFIT_DNA_HINT}`);
});

test('gate:outfits:prompt-outfit-groups-text-lists-registered-outfits-only', () => {
    assert.equal(buildOutfitGroupsText({}), NO_OUTFIT_GROUPS_TEXT);
    assert.equal(buildOutfitGroupsText(null), NO_OUTFIT_GROUPS_TEXT);
    assert.equal(NO_OUTFIT_GROUPS_TEXT, '（暂无登记服装。）');
    const outfits = normalizeCharacterOutfits({
        小林海斗: { 泳装: { words: ['比基尼'] }, '睡衣 ': {}, 默认: {}, 'a|b': {}, '坏]名': {} },
        雪乃: {},
        '「特殊」角色': { '和服·振袖': {} },
    });
    assert.equal(buildOutfitGroupsText(outfits), '小林海斗：泳装 / 睡衣\n「特殊」角色：和服·振袖');
    const noted = normalizeCharacterOutfits({ 乙: { 校服: { note: ' 上学\n在教室 ' }, 泳装: { note: '' }, 睡衣: { note: '在家睡觉|休息' } } });
    assert.equal(noted.乙.校服.note, '上学 在教室');
    assert.equal(noted.乙.睡衣.note, '在家睡觉 休息');
    assert.equal(noted.乙.泳装.note, undefined);
    assert.equal(buildOutfitGroupsText(noted), '乙：校服（上学 在教室） / 泳装 / 睡衣（在家睡觉 休息）');
});

const clothingAssets = () => ({
    characterAliases: { 林澄: ['小澄'] },
    characterOutfits: {
        林澄: { 制服: { words: ['执勤服'], wardrobe: '制服资料' }, 便服: { wardrobe: '便服资料' }, 空衣装: {} },
        周岚: { 便服: { wardrobe: '周岚便服' } },
    },
    characterDefaultOutfits: { 林澄: { version: 1, outfitName: '制服' } },
    wardrobe: {
        制服资料: { prompt: 'wears a light-blue cotton shirt with navy trousers' },
        便服资料: { prompt: 'wears an ivory cardigan over a green dress' },
        周岚便服: { prompt: 'wears a red jacket' },
    },
});

test('衣装注入：上一轮最后穿着、别名与跨轮继承，共享衣柜只读', () => {
    const assets = clothingAssets(), before = structuredClone(assets);
    const previousAiTexts = [
        '[igs-char:小澄|平和|执勤服|出门。]\n[igs-char:周岚|平和|便服|再见。]',
        '[igs-char:林澄|平和|回来。]\n[igs-thought:小澄|平和|便服|换好衣服了。]',
    ];
    const value = buildPreviousOutfitDnaText(assets, { previousAiTexts });
    assert.ok(value.includes(JSON.stringify(assets.wardrobe.便服资料.prompt)));
    assert.equal(value.split('角色 "林澄"').length - 1, 1);
    assert.ok(!value.includes(assets.wardrobe.制服资料.prompt));
    assert.ok(!value.includes('周岚'));
    const inherited = buildPreviousOutfitDnaText(assets, { previousAiTexts: previousAiTexts.slice(0, 1).concat('[igs-char:林澄|平和|继续。]') });
    assert.ok(inherited.includes(assets.wardrobe.制服资料.prompt));
    assert.deepEqual(assets, before);
});

test('衣装注入：只显示已有非空 DNA，无匹配时整段为空', () => {
    const assets = clothingAssets();
    for (const previousAiTexts of [null, [], ['旁白。'], ['[igs-char:林澄|平和|新裙|你好。]'],
        ['[igs-char:林澄|平和|空衣装|你好。]'], ['[igs-char:林澄|平和|你好。]']]) {
        assert.equal(buildPreviousOutfitDnaText(assets, { previousAiTexts }), '');
    }
    assets.wardrobe.制服资料.prompt = '   ';
    assert.equal(buildPreviousOutfitDnaText(assets, { previousAiTexts: ['[igs-char:林澄|平和|默认|你好。]'] }), '');
});

test('衣装注入：显式默认映射、过滤正文与单次占位展开', () => {
    const assets = clothingAssets();
    assets.wardrobe.制服资料.prompt += ' {{mood_groups}} {{previous_outfit_dna}}';
    assets.promptRule = '开始\n{{previous_outfit_dna}}\n结束';
    const context = collectPromptContext({ chat: [
        { is_user: false, mes: '<think>[igs-char:周岚|平和|便服|忽略。]</think><content>[igs-char:小澄|平和|默认|走吧。]</content>' },
        { is_user: true, mes: '[igs-char:林澄|平和|便服|本轮输入。]' },
        { is_system: true, mes: '[igs-char:周岚|平和|便服|系统。]' },
    ] });
    const value = resolvePromptRuleContent(assets, context);
    assert.ok(value.includes(JSON.stringify(assets.wardrobe.制服资料.prompt)));
    assert.ok(!value.includes('角色 "周岚"'));
    assert.ok(!value.includes(assets.wardrobe.便服资料.prompt));
    assert.ok(value.endsWith('\n结束'));
    assert.equal(buildPreviousOutfitDnaText(assets, { previousAiTexts: ['<content></content>'] }), '');
});
