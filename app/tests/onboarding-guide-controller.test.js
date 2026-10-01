import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnboardingController } from '../src/visual/igs-ui/onboarding-guide-controller.js';
import { handleOnboardingKeydown } from '../src/visual/igs-ui/onboarding-guide-invite.js';
import { ONBOARDING_STORAGE_KEY as KEY } from '../src/visual/igs-ui/onboarding-guide.js';

function setup(initial = {}) {
    const data = new Map(Object.entries(initial));
    const storage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
    const calls = [];
    let open = false;
    const settings = {
        switchTab: (t) => calls.push(['tab', t]),
        switchReaderSubTab: (s) => calls.push(['reader', s]),
        switchSceneSettingsSubTab: (s) => calls.push(['sceneSettings', s]),
        switchSceneSubTab: (s) => calls.push(['scene', s]),
        switchImageSubTab: (s) => calls.push(['image', s]),
    };
    const warns = [];
    const ctl = createOnboardingController({
        getStorage: () => storage,
        openSettings: (tab) => { open = true; calls.push(['open', tab]); return { ok: true }; },
        getSettingsController: () => (open ? settings : null),
        rerenderSettings: () => ({ ok: true }),
        warn: (r) => warns.push(r),
    });
    return { ctl, data, calls, warns };
}

test('onboarding controller: 换步只切页签，不写设置', () => {
    const { ctl, calls } = setup();
    ctl.handleAction('onboarding-start');
    for (let i = 0; i < 7; i += 1) ctl.handleAction('onboarding-next');
    assert.deepEqual(calls.filter(([k]) => k !== 'tab').map((c) => c.join(':')),
        ['open:basic', 'reader:dialog', 'sceneSettings:assets', 'scene:scenes', 'sceneSettings:assets', 'scene:scenes', 'image:source']);
    assert.equal(ctl.getState().step, 7);
    ctl.handleAction('onboarding-prev');
    assert.equal(ctl.getState().step, 6);
});

test('onboarding controller: 完成写 done，跳过写 dismissed', () => {
    for (const [action, status] of [['onboarding-finish', 'done'], ['onboarding-skip', 'dismissed']]) {
        const { ctl, data } = setup();
        ctl.handleAction('onboarding-start');
        ctl.handleAction(action);
        assert.equal(JSON.parse(data.get(KEY)).status, status);
        assert.equal(ctl.getState().step, null);
    }
});

test('onboarding controller: 非引导动作返回 null；以后再说不写存储', () => {
    const { ctl, data } = setup();
    assert.equal(ctl.handleAction('settings-export-all'), null);
    ctl.chooseInvite('later', null);
    assert.equal(data.has(KEY), false);
    assert.equal(ctl.getState().answered, true);
    assert.equal(ctl.syncInvite({ ownerDocument: null }), false);
});

test('onboarding controller: 坏数据不邀请并告警', () => {
    const { ctl, warns } = setup({ [KEY]: '{bad' });
    assert.equal(ctl.syncInvite({ querySelector: () => null, ownerDocument: null }), false);
    assert.deepEqual(warns, ['invalid-json']);
});

test('onboarding keydown: 引导卡在时 Esc 只关卡片，卡内按键不外泄', () => {
    const inside = {};
    const card = { contains: (n) => n === inside };
    const doc = { getElementById: (id) => (id === 'igs-onboarding-card' ? card : null) };
    let closed = 0;
    let stopped = 0;
    const ev = (key, target) => ({ key, target, preventDefault() {}, stopPropagation() { stopped += 1; } });
    assert.equal(handleOnboardingKeydown(ev('Escape', {}), doc, () => { closed += 1; }), true);
    assert.equal(closed, 1);
    assert.equal(handleOnboardingKeydown(ev('ArrowRight', inside), doc, () => {}), true);
    assert.equal(handleOnboardingKeydown(ev('ArrowRight', {}), doc, () => {}), false);
    assert.equal(handleOnboardingKeydown(ev('Escape', {}), { getElementById: () => null }, () => {}), false);
    assert.equal(stopped, 2);
});
