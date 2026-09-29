import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, parseFxBody, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { applyFxEra } from '../src/scene/fx-era.js';
import { normalizeFxTagsSettings } from '../src/visual/igs-ui/fx-settings.js';
import { fxGrammarLines } from '../src/visual/igs-ui/fx-prompt.js';
import { CUTIN_RATIO, resolveCutinCrop } from '../src/visual/igs-ui/fx-runtime.js';

test('gate:fx-relation contact and cutin parse; contact needs a name, cutin name optional', () => {
    assert.equal(parseFxBody('contact'), null);
    assert.equal(parseFxBody('contact-end'), null);
    const page = resolveFxAtPage(extractFxDirectives('[igs-fx:contact|林晚]\n[igs-fx:cutin]\n[igs-fx:cutin|白墨]'), 80);
    assert.deepEqual(page.instants, [{ kind: 'contact', name: '林晚' }, { kind: 'cutin', name: '' }]);
});

test('gate:fx-relation contact/cutin are opt-in and contact is modern only', () => {
    const legacy = normalizeFxTagsSettings({ enabled: true });
    assert.equal(legacy.contact, false);
    assert.equal(legacy.cutin, false);
    assert.doesNotMatch(fxGrammarLines({ enabled: true }).join('\n'), /contact|cutin/);
    const lines = fxGrammarLines({ enabled: true, contact: true, cutin: true }).join('\n');
    assert.match(lines, /contact\|角色名/);
    assert.match(lines, /cutin\|角色名/);
    const ancient = applyFxEra({ fxTags: { enabled: true, contact: true, cutin: true } }, true);
    assert.equal(ancient.fxTags.contact, false);
    assert.equal(ancient.fxTags.cutin, true);
});

test('gate:fx-relation cutin crop centers the head inside the panel', () => {
    const head = { x: 0.5, top: 0.08, w: 0.2 };
    const aspect = 1.6;
    const crop = resolveCutinCrop(head, aspect);
    // background-size：头宽约占分格 1/2.4。
    const k = crop.size / 100;
    assert.ok(Math.abs(head.w * k - 1 / 2.4) < 0.01);
    // 横向：头中心对齐分格中心。
    const offsetX = (1 - k) * crop.x / 100;
    assert.ok(Math.abs(offsetX + head.x * k - 0.5) < 0.01);
    // 纵向：头中心（按 1.1 高宽比）对齐分格中心。
    const imgH = k * aspect;
    const offsetY = (CUTIN_RATIO - imgH) * crop.y / 100;
    const headCenter = head.top * imgH + head.w * k * 1.1 / 2;
    assert.ok(Math.abs(offsetY + headCenter - CUTIN_RATIO / 2) < 0.01);
});

test('gate:fx-relation cutin crop falls back without head or aspect and stays finite', () => {
    for (const crop of [resolveCutinCrop(null, null), resolveCutinCrop({ w: 0 }, 0), resolveCutinCrop({ x: 0.3, top: 0.1, w: 0.25 }, undefined)]) {
        for (const value of [crop.size, crop.x, crop.y]) assert.ok(Number.isFinite(value));
        assert.ok(crop.size > 100);
    }
});

test('gate:fx-relation promise needs time, place optional, opt-in and era-neutral', () => {
    assert.equal(parseFxBody('promise'), null);
    const page = resolveFxAtPage(extractFxDirectives('[igs-fx:promise|周六下午|车站]\n[igs-fx:promise|明天]'), 60);
    assert.deepEqual(page.instants, [{ kind: 'promise', time: '周六下午', place: '车站' }]);
    const bare = resolveFxAtPage(extractFxDirectives('[igs-fx:promise|明天]'), 30);
    assert.deepEqual(bare.instants, [{ kind: 'promise', time: '明天', place: '' }]);
    assert.equal(normalizeFxTagsSettings({ enabled: true }).promise, false);
    assert.doesNotMatch(fxGrammarLines({ enabled: true }).join('\n'), /promise/);
    assert.match(fxGrammarLines({ enabled: true, promise: true }).join('\n'), /promise\|时间\|地点/);
    assert.equal(applyFxEra({ fxTags: { enabled: true, promise: true } }, true).fxTags.promise, true);
});

