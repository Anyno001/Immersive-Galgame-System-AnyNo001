import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ONBOARDING_STEPS, getOnboardingStep, nextOnboardingStep, prevOnboardingStep, isLastOnboardingStep,
} from '../src/visual/igs-ui/onboarding-guide.js';
import {
    SETTINGS_TAB_DEFS, READER_SUBTAB_DEFS, SCENE_SETTINGS_SUBTAB_DEFS, SCENE_SUBTAB_DEFS, IMAGE_SUBTAB_DEFS,
} from '../src/visual/igs-ui/settings-tabs.js';

test('onboarding steps: 八步顺序与可选生图', () => {
    assert.deepEqual(ONBOARDING_STEPS.map((step) => step.id),
        ['welcome', 'mode', 'performance', 'dialog', 'scene', 'assets', 'image', 'done']);
    assert.equal(getOnboardingStep(6).optional, true);
    assert.ok(getOnboardingStep(7).body.includes('标签解析'));
    assert.ok(getOnboardingStep(5).body.includes('下载默认素材'));
});

test('onboarding steps: 前后导航边界', () => {
    assert.equal(prevOnboardingStep(0), 0);
    assert.equal(nextOnboardingStep(0), 1);
    assert.equal(nextOnboardingStep(7), 7);
    assert.equal(isLastOnboardingStep(7), true);
    assert.equal(isLastOnboardingStep(6), false);
    assert.equal(getOnboardingStep(-1).id, 'welcome');
});

test('onboarding steps: 只指向已注册的设置页签与子页签', () => {
    const ids = (defs) => defs.map(([id]) => id);
    const subDefs = { reader: READER_SUBTAB_DEFS, sceneSettings: SCENE_SETTINGS_SUBTAB_DEFS, scene: SCENE_SUBTAB_DEFS, image: IMAGE_SUBTAB_DEFS };
    for (const step of ONBOARDING_STEPS) {
        assert.ok(ids(SETTINGS_TAB_DEFS).includes(step.tab), step.id);
        for (const [kind, id] of step.subTabs) {
            assert.ok(subDefs[kind] && ids(subDefs[kind]).includes(id), `${step.id}:${kind}:${id}`);
        }
    }
});
