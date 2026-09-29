import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOutfitGroupsText, normalizeCharacterOutfits, OUTFIT_GROUPS_PLACEHOLDER } from '../src/scene/character-outfits.js';
import {
    DEFAULT_SCENE_PROMPT_RULE,
    LEGACY_DEFAULT_SCENE_PROMPT_RULE,
    LEGACY_DEFAULT_SCENE_PROMPT_RULE_V2,
    LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3,
    PROMPT_RULE_OUTFIT_HINT,
    normalizeScenePromptRule,
    scenePromptRuleOutfitHint,
} from '../src/visual/igs-ui/reader-host-constants.js';

test('gate:outfits:prompt-default-rule-declares-outfit-column-and-placeholder', () => {
    assert.match(DEFAULT_SCENE_PROMPT_RULE, /\[igs-char:角色名\|表情\|服装\|对白\]/);
    assert.match(DEFAULT_SCENE_PROMPT_RULE, /\[igs-thought:角色名\|表情\|服装\|心里话\]/);
    assert.match(DEFAULT_SCENE_PROMPT_RULE, /服装：只用下列已登记名称/);
    assert.match(DEFAULT_SCENE_PROMPT_RULE, /换回原外观写「默认」/);
    assert.ok(DEFAULT_SCENE_PROMPT_RULE.includes(OUTFIT_GROUPS_PLACEHOLDER));
    assert.ok(!LEGACY_DEFAULT_SCENE_PROMPT_RULE_V2.includes(OUTFIT_GROUPS_PLACEHOLDER));
    assert.match(LEGACY_DEFAULT_SCENE_PROMPT_RULE_V2, /\[igs-char:角色名\|表情\|对白\]/);
});

test('gate:outfits:prompt-upgrades-only-empty-or-verbatim-legacy-defaults', () => {
    for (const value of ['', null, undefined, LEGACY_DEFAULT_SCENE_PROMPT_RULE, LEGACY_DEFAULT_SCENE_PROMPT_RULE_V2, LEGACY_DEFAULT_SCENE_PROMPT_RULE_V3, DEFAULT_SCENE_PROMPT_RULE]) {
        assert.equal(normalizeScenePromptRule(value), DEFAULT_SCENE_PROMPT_RULE);
    }
    const custom = [
        '自定义规则',
        `${LEGACY_DEFAULT_SCENE_PROMPT_RULE_V2}\n补充一行`,
        LEGACY_DEFAULT_SCENE_PROMPT_RULE_V2.replace('禁止发明新标签', '禁止发明新的标签'),
        ` ${LEGACY_DEFAULT_SCENE_PROMPT_RULE_V2}`,
    ];
    for (const value of custom) assert.equal(normalizeScenePromptRule(value), value);
});

test('gate:outfits:prompt-custom-rule-without-placeholder-gets-hint', () => {
    assert.equal(scenePromptRuleOutfitHint(DEFAULT_SCENE_PROMPT_RULE), '');
    assert.equal(scenePromptRuleOutfitHint('自定义 {{outfit_groups}}'), '');
    assert.equal(scenePromptRuleOutfitHint('自定义规则'), PROMPT_RULE_OUTFIT_HINT);
    assert.equal(scenePromptRuleOutfitHint(LEGACY_DEFAULT_SCENE_PROMPT_RULE_V2), PROMPT_RULE_OUTFIT_HINT);
});

test('gate:outfits:prompt-outfit-groups-text-lists-registered-outfits-only', () => {
    assert.equal(buildOutfitGroupsText({}), '（暂无登记服装，省略服装栏）');
    assert.equal(buildOutfitGroupsText(null), '（暂无登记服装，省略服装栏）');
    const outfits = normalizeCharacterOutfits({
        小林海斗: { 泳装: { words: ['比基尼'] }, '睡衣 ': {}, 默认: {}, 'a|b': {}, '坏]名': {} },
        雪乃: {},
        '「特殊」角色': { '和服·振袖': {} },
    });
    assert.equal(buildOutfitGroupsText(outfits), '小林海斗：泳装 / 睡衣\n「特殊」角色：和服·振袖');
});
