import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ONBOARDING_STEPS, getOnboardingStep, nextOnboardingStep, prevOnboardingStep, isLastOnboardingStep,
} from '../src/visual/igs-ui/onboarding-guide.js';
import {
    SETTINGS_TAB_DEFS, READER_SUBTAB_DEFS, SCENE_SUBTAB_DEFS, IMAGE_SUBTAB_DEFS,
} from '../src/visual/igs-ui/settings-tabs.js';

test('onboarding steps: 十一步顺序、欢迎后快速配置演出、翻页教学、工具栏管理与可选生图', () => {
    assert.deepEqual(ONBOARDING_STEPS.map((step) => step.id),
        ['welcome', 'quick', 'paging', 'mode', 'performance', 'dialog', 'toolbar', 'scene', 'assets', 'image', 'search', 'done']);
    assert.equal(getOnboardingStep(1).title, '想不想快速配置演出？');
    assert.equal(getOnboardingStep(1).quiz, true);
    assert.ok(getOnboardingStep(2).body.includes('右半边') && getOnboardingStep(2).body.includes('左半边'));
    assert.ok(getOnboardingStep(4).body.includes('省电模式'));
    assert.equal(getOnboardingStep(6).title, '工具栏');
    assert.ok(getOnboardingStep(8).body.includes('下载默认素材') && getOnboardingStep(8).body.includes('多选'));
    assert.equal(getOnboardingStep(9).optional, true);
    assert.ok(getOnboardingStep(10).body.includes('黑边'));
    assert.ok(getOnboardingStep(11).body.includes('标签解析'));
});

test('onboarding steps: 前后导航边界', () => {
    assert.equal(prevOnboardingStep(0), 0);
    assert.equal(nextOnboardingStep(0), 1);
    assert.equal(nextOnboardingStep(11), 11);
    assert.equal(isLastOnboardingStep(11), true);
    assert.equal(isLastOnboardingStep(10), false);
    assert.equal(getOnboardingStep(-1).id, 'welcome');
});

test('onboarding steps: 只指向已注册的设置页签与子页签', () => {
    const ids = (defs) => defs.map(([id]) => id);
    const subDefs = { reader: READER_SUBTAB_DEFS, scene: SCENE_SUBTAB_DEFS, image: IMAGE_SUBTAB_DEFS };
    for (const step of ONBOARDING_STEPS) {
        assert.ok(ids(SETTINGS_TAB_DEFS).includes(step.tab), step.id);
        for (const [kind, id] of step.subTabs) {
            assert.ok(subDefs[kind] && ids(subDefs[kind]).includes(id), `${step.id}:${kind}:${id}`);
        }
    }
});
