import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyPerformanceProfile, profileDiff, profileFeatureStates, profileFromReader, SPECIAL_FEATURES,
} from '../src/visual/igs-ui/performance-profile.js';
import { PERFORMANCE_FEATURES, isPerformanceFeatureOn } from '../src/visual/igs-ui/performance-presets.js';
import { createOnboardingController } from '../src/visual/igs-ui/onboarding-guide-controller.js';
import { renderOnboardingCardHtml } from '../src/visual/igs-ui/onboarding-guide-runtime.js';
import { renderPerformancePresetBar } from '../src/visual/igs-ui/performance-settings-layout.js';

test('gate:performance-profile:types-gate-special-features-and-level-gates-the-rest', () => {
    const states = profileFeatureStates({ level: 'standard', types: ['battle'], sound: 'sfx', adult: 'no' });
    assert.equal(states.battleFx, true);
    assert.equal(states.liveFx, false, '没勾直播网络不开直播间');
    assert.equal(states.chatShow, false);
    assert.equal(states.romanceFx, false, '没选成人向不开亲密');
    assert.equal(states.typewriter, true);
    assert.equal(states.bgm, false);
    assert.equal(states.fxSound, true);
    const off = profileFeatureStates({ level: 'off', types: ['online'], sound: 'full', adult: 'yes' });
    assert.ok(Object.values(off).every((on) => on === false), '全部关闭时一律关');
    assert.ok(SPECIAL_FEATURES.every((key) => PERFORMANCE_FEATURES.find((f) => f.key === key).group === 'special'));
});

test('gate:performance-profile:apply-writes-switches-keeps-details-and-diff-lists-manual-changes', () => {
    const reader = { battleFx: { enabled: false, style: 'keep' } };
    applyPerformanceProfile(reader, { level: 'full', types: ['online'], sound: 'full', adult: 'yes', device: 'phone' });
    assert.equal(reader.battleFx.style, 'keep');
    assert.equal(isPerformanceFeatureOn(reader, 'liveFx'), true);
    assert.equal(isPerformanceFeatureOn(reader, 'romanceFx'), true);
    assert.equal(reader.performance.quality, 'low');
    assert.deepEqual(reader.performanceProfile.types, ['online']);
    assert.deepEqual(profileDiff(reader), { added: [], removed: [] });
    reader.battleFx.enabled = true;
    reader.bgm.enabled = false;
    // 「题材专属」开关归用户自己管：多开战斗不算偏离配置。
    assert.deepEqual(profileDiff(reader), { added: [], removed: ['背景音乐'] });
    const bar = renderPerformancePresetBar(reader);
    assert.match(bar, /关掉了：背景音乐/);
    assert.doesNotMatch(bar, /perf-type:|剧情题材|卡片类型/);
});

test('gate:performance-profile:preset-switch-keeps-special-switches-except-all-off', () => {
    const reader = {};
    applyPerformanceProfile(reader, { level: 'standard', types: ['online'], sound: 'sfx', adult: 'no' });
    reader.liveFx.enabled = false;
    reader.battleFx = { enabled: true };
    applyPerformanceProfile(reader, { ...reader.performanceProfile, level: 'full' }, { keepSpecial: true });
    assert.equal(isPerformanceFeatureOn(reader, 'liveFx'), false, '用户关掉的直播间不被档位打开');
    assert.equal(isPerformanceFeatureOn(reader, 'battleFx'), true, '用户开着的战斗不被档位关掉');
    assert.equal(isPerformanceFeatureOn(reader, 'textFx'), true);
    applyPerformanceProfile(reader, { ...reader.performanceProfile, level: 'off' }, { keepSpecial: true });
    assert.equal(isPerformanceFeatureOn(reader, 'battleFx'), false, '全部关闭仍一律关');
});

test('gate:performance-profile:first-chip-click-infers-profile-from-current-switches', () => {
    const reader = { bgm: { enabled: true }, romanceFx: { enabled: true } };
    const profile = profileFromReader(reader, 'light');
    assert.equal(profile.level, 'light');
    assert.ok(profile.sound.includes('bgm'));
    assert.equal(profile.adult, true);
    assert.deepEqual(profile.types, []);
});

test('gate:onboarding-quiz:choose-apply-then-next', () => {
    const applied = [];
    const storage = { getItem: () => null, setItem: () => {} };
    const ctl = createOnboardingController({
        getStorage: () => storage,
        openSettings: () => ({ ok: true }),
        getSettingsController: () => ({ switchTab() {} }),
        rerenderSettings: () => ({ ok: true }),
        applyPerformanceProfile: (answers) => { applied.push(answers); return { ok: true }; },
    });
    ctl.handleAction('onboarding-start');
    ctl.handleAction('onboarding-next');
    assert.equal(ctl.getState().step, 1);
    ctl.handleAction('onboarding-quiz:types:battle');
    ctl.handleAction('onboarding-quiz:types:online');
    ctl.handleAction('onboarding-quiz:types:battle');
    ctl.handleAction('onboarding-quiz:level:full');
    ctl.handleAction('onboarding-quiz:level:nope');
    ctl.handleAction('onboarding-quiz-apply');
    assert.deepEqual(applied, [{ types: ['online'], level: 'full', sound: ['fx', 'ui', 'typing'], adult: 'no' }]);
    assert.equal(ctl.getState().step, 1, '应用后停在这一步');
    ctl.handleAction('onboarding-next');
    assert.equal(ctl.getState().step, 2);
});

test('gate:onboarding-quiz:card-shows-options-and-apply-before-next', () => {
    const before = renderOnboardingCardHtml(1, { answers: { types: ['school'], level: 'light' } });
    assert.match(before, /是否快速配置演出？/);
    assert.match(before, /data-action="onboarding-quiz:types:school" aria-pressed="true"/);
    assert.match(before, /data-action="onboarding-quiz-apply"/);
    assert.match(before, /这样会开启 \d+ 项/);
    const after = renderOnboardingCardHtml(1, { answers: {}, quizApplied: true });
    assert.doesNotMatch(after, /onboarding-quiz-apply/);
    assert.match(after, /data-action="onboarding-next"[^>]*>下一步/);
    assert.doesNotMatch(renderOnboardingCardHtml(2, null), /onboarding-quiz/);
});

test('gate:performance-profile:sound-is-multi-select-with-legacy-mapping-and-typewriter', async () => {
    const { normalizePerformanceProfile, applyPerformanceProfile: apply, profileSummary: summary } = await import('../src/visual/igs-ui/performance-profile.js');
    assert.deepEqual(normalizePerformanceProfile({ sound: 'mute' }).sound, []);
    assert.deepEqual(normalizePerformanceProfile({ sound: 'full' }).sound, ['fx', 'ui', 'typing', 'ambient', 'bgm']);
    assert.deepEqual(normalizePerformanceProfile({ sound: ['bgm', 'bogus', 'fx'] }).sound, ['fx', 'bgm']);
    const reader = { typewriter: { speed: 30, sound: { volume: 0.4 } } };
    apply(reader, { level: 'standard', sound: ['bgm'] });
    assert.equal(reader.bgm.enabled, true);
    assert.equal(reader.fxSound.enabled, false);
    assert.equal(reader.typewriter.sound.enabled, false, '没选打字机音');
    assert.equal(reader.typewriter.speed, 30, '细项保留');
    assert.equal(reader.typewriter.sound.volume, 0.4);
    assert.ok(summary({ level: 'light', sound: ['typing'] }).includes('打字机音'));
});
