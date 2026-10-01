import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutfitGroupsText, NO_OUTFIT_GROUPS_TEXT, normalizeCharacterOutfits, OUTFIT_GROUPS_PLACEHOLDER } from '../src/scene/character-outfits.js';
import {
    DEFAULT_SCENE_PROMPT_RULE,
    LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3,
    PROMPT_RULE_OUTFIT_HINT,
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
});

test('gate:outfits:prompt-custom-rule-without-placeholder-gets-hint', () => {
    assert.equal(scenePromptRuleOutfitHint(DEFAULT_SCENE_PROMPT_RULE), '');
    assert.equal(scenePromptRuleOutfitHint('自定义 {{outfit_groups}}'), '');
    assert.equal(scenePromptRuleOutfitHint('自定义规则'), PROMPT_RULE_OUTFIT_HINT);
    assert.equal(scenePromptRuleOutfitHint('没有服装占位符的旧规则'), PROMPT_RULE_OUTFIT_HINT);
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
