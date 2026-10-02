import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ONBOARDING_STEPS, getOnboardingStep, nextOnboardingStep, prevOnboardingStep, isLastOnboardingStep,
} from '../src/visual/igs-ui/onboarding-guide.js';
import {
    SETTINGS_TAB_DEFS, READER_SUBTAB_DEFS, SCENE_SUBTAB_DEFS, IMAGE_SUBTAB_DEFS,
} from '../src/visual/igs-ui/settings-tabs.js';

test('onboarding steps: 九步顺序、翻页教学与可选生图', () => {
    assert.deepEqual(ONBOARDING_STEPS.map((step) => step.id),
        ['welcome', 'paging', 'mode', 'performance', 'dialog', 'scene', 'assets', 'image', 'done']);
    assert.ok(getOnboardingStep(1).body.includes('右半边') && getOnboardingStep(1).body.includes('左半边'));
    assert.equal(getOnboardingStep(7).optional, true);
    assert.ok(getOnboardingStep(8).body.includes('标签解析'));
    assert.ok(getOnboardingStep(6).body.includes('下载默认素材'));
});

test('onboarding steps: 前后导航边界', () => {
    assert.equal(prevOnboardingStep(0), 0);
    assert.equal(nextOnboardingStep(0), 1);
    assert.equal(nextOnboardingStep(8), 8);
    assert.equal(isLastOnboardingStep(8), true);
    assert.equal(isLastOnboardingStep(7), false);
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
