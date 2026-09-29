import test from 'node:test';
import assert from 'node:assert/strict';
import { spriteIdentity } from '../src/scene/character-outfits.js';
import { resolveSpriteLayout } from '../src/visual/igs-ui/settings-normalize.js';
import { resolveSpriteHead, spriteHeadKey } from '../src/visual/igs-ui/fx-anchor.js';

const L = (n) => ({ posX: n, posY: n, scale: n });

test('gate:outfits:sprite-identity-keeps-legacy-key-without-outfit', () => {
    assert.equal(spriteIdentity('小林', ''), '小林');
    assert.equal(spriteIdentity('小林', '默认'), '小林');
    assert.equal(spriteIdentity('小林', '泳装'), '小林|泳装');
    assert.equal(spriteHeadKey('小林', '喜悦'), '小林::喜悦');
    assert.equal(spriteHeadKey('小林', '喜悦', '泳装'), '小林|泳装::喜悦');
    assert.equal(spriteHeadKey('小林', '', '泳装'), '小林|泳装');
});

test('gate:outfits:layout-isolated-by-outfit-with-character-fallback', () => {
    const layouts = {
        pc: L(1),
        'pc::小林': L(2),
        'pc::小林::喜悦': L(3),
        'pc::小林|泳装': L(4),
        'pc::小林|泳装::害羞': L(5),
    };
    assert.deepEqual(resolveSpriteLayout(layouts, 'pc', '小林', '喜悦'), L(3));
    assert.deepEqual(resolveSpriteLayout(layouts, 'pc', '小林', '平和'), L(2));
    assert.deepEqual(resolveSpriteLayout(layouts, 'pc', '小林', '害羞', '泳装'), L(5));
    assert.deepEqual(resolveSpriteLayout(layouts, 'pc', '小林', '喜悦', '泳装'), L(4));
    assert.deepEqual(resolveSpriteLayout(layouts, 'pc', '小林', '喜悦', '睡衣'), L(2));
    assert.deepEqual(resolveSpriteLayout({ pc: L(1), 'pc::小林::喜悦': L(3) }, 'pc', '小林', '喜悦', '睡衣'), L(1));
    assert.deepEqual(resolveSpriteLayout(layouts, 'pc', '小林', '喜悦', '默认'), L(3));
});

test('gate:outfits:head-isolated-by-outfit-with-character-fallback', () => {
    const head = (x) => ({ x, top: 0.1, w: 0.2 });
    const heads = { 小林: head(1), '小林::喜悦': head(2), '小林|泳装': head(3), '小林|泳装::害羞': head(4) };
    assert.equal(resolveSpriteHead(heads, '小林', '喜悦').x, 2);
    assert.equal(resolveSpriteHead(heads, '小林', '害羞', '泳装').x, 4);
    assert.equal(resolveSpriteHead(heads, '小林', '喜悦', '泳装').x, 3);
    assert.equal(resolveSpriteHead(heads, '小林', '喜悦', '睡衣').x, 1);
    assert.equal(resolveSpriteHead({}, '小林', '喜悦', '泳装'), null);
});
