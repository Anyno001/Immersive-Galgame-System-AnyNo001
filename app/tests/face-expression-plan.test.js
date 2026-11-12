import test from 'node:test';
import assert from 'node:assert/strict';
import { blendFaceInto, buildFaceMask, faceBlendWeight, normalizeExpressionRoute, planFaceCrop } from '../src/generated-images/illustration/face-edit-plan.js';

test('表情差分方式：未设置时沿用导演工具开关', () => {
    assert.equal(normalizeExpressionRoute({ directorEmotion: true }), 'director');
    assert.equal(normalizeExpressionRoute({}), 'full');
    assert.equal(normalizeExpressionRoute({ expressionRoute: 'face', directorEmotion: true }), 'face');
});

test('脸部裁切：靠边平移不缩小，边长为较长半径的三倍', () => {
    const crop = planFaceCrop(800, 1200, { cx: 0.02, cy: 0.1, rx: 0.1, ry: 0.05 });
    assert.equal(crop.side, 240);
    assert.equal(crop.x, 0);
    assert.ok(crop.y >= 0 && crop.y + crop.side <= 1200);
});

test('重绘遮罩按 8 像素网格对齐且覆盖椭圆中心', () => {
    const crop = planFaceCrop(800, 1200, { cx: 0.5, cy: 0.2, rx: 0.1, ry: 0.06 });
    const mask = buildFaceMask(crop);
    const c = Math.round(crop.ellipse.cy * crop.scale) * crop.work + Math.round(crop.ellipse.cx * crop.scale);
    assert.equal(mask[c * 4], 255);
    assert.equal(mask[3], 255);
    assert.equal(mask[0], 0);
    assert.equal(mask[(0 * crop.work + 0) * 4], mask[(7 * crop.work + 7) * 4]);
});

test('羽化回贴：椭圆外与 alpha 不变，中心完全替换', () => {
    const w = 40, h = 40, base = new Uint8ClampedArray(w * h * 4).fill(10);
    const crop = planFaceCrop(w, h, { cx: 0.5, cy: 0.5, rx: 0.2, ry: 0.2 });
    const painted = new Uint8ClampedArray(crop.side * crop.side * 4).fill(200);
    const before = new Uint8ClampedArray(base);
    blendFaceInto(base, w, crop, painted);
    const mid = ((crop.y + crop.side / 2) * w + crop.x + crop.side / 2) * 4;
    assert.equal(base[mid], 200);
    assert.equal(base[mid + 3], 10);
    assert.equal(base[0], before[0]);
    assert.equal(faceBlendWeight(crop.ellipse, 0, 0), 0);
});

test('只改脸部从 DNA 取眼色与瞳孔词加权，不取表情与形状类眼睛词', async () => {
    const { eyeColorTags } = await import('../src/generated-images/illustration/face-edit-plan.js');
    assert.deepEqual(eyeColorTags('1girl, 1.2::blue eyes::, big eyes, starry eyes, closed eyes, heart-shaped pupils', '(red eyes:1.1), heterochromia, blue eyes'),
        ['blue eyes', 'heart-shaped pupils', 'red eyes', 'heterochromia']);
    assert.deepEqual(eyeColorTags('', null, 'pink hair, smile'), []);
});
