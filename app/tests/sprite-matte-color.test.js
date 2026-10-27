import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAssetSlot } from '../src/generated-images/illustration/asset-prompt.js';
import { buildItemSlot } from '../src/generated-images/illustration/item-prompt.js';
import { resolveMatteGround } from '../src/generated-images/illustration/prompt-kit.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';

const sprite = (opts) => buildAssetSlot({ need: { type: 'sprite', name: '' }, tags: 'smile', uc: '' }, opts);

test('抠图底色：自动沿用白底 / 浅灰底，自选底色优先，透明底不受影响', () => {
    assert.equal(resolveMatteGround({ whiteBackground: true }), 'white');
    assert.equal(resolveMatteGround({}), 'grey');
    assert.equal(resolveMatteGround({ whiteBackground: true, matteColor: 'green' }), 'green');
    assert.equal(resolveMatteGround({ matteColor: 'bogus' }), 'grey');
    assert.equal(resolveMatteGround({ transparent: true, matteColor: 'purple' }), '');
});

test('抠图底色：立绘与物品图写入所选底色词', () => {
    const green = sprite({ whiteBackground: true, matteColor: 'green' });
    assert.match(green.scene, /green background/);
    assert.doesNotMatch(green.scene, /white background|grey background/);
    assert.match(green.sceneUc, /white background/);
    const white = sprite({ matteColor: 'white' });
    assert.match(white.scene, /white background/);
    assert.doesNotMatch(white.sceneUc, /(^|, )white background/);
    assert.match(sprite({ matteColor: 'purple' }).scene, /purple background/);
    assert.match(sprite({}).scene, /light grey background/);
    assert.match(buildItemSlot('apple', { matteColor: 'green' }).scene, /green background/);
    assert.match(sprite({ transparent: true, matteColor: 'green' }).scene, /transparent background/);
});

test('抠图底色设置值只认五档', () => {
    assert.equal(normalizeSettingsValue('bridge.imageApi.spriteMatteColor', 'purple'), 'purple');
    assert.equal(normalizeSettingsValue('bridge.imageApi.spriteMatteColor', 'red'), 'auto');
});
