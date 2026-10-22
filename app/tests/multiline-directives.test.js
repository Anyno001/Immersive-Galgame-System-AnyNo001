import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIgsTextPayload, applyImmersiveGalgameSystemBodyFormat } from '../src/scene/message-source.js';
import { normalizeClosedIgsDialogueLines, canonicalizeIgsDirectives, normalizeIgsDirectiveLayout } from '../src/scene/directive-tags.js';
import { extractSceneDirectives } from '../src/scene/scene-directives.js';
import { createOutfitResolver } from '../src/scene/character-outfits.js';
import { normalizeImageMarkerLayout } from '../src/scene/image-marker-layout.js';
import { numberParagraphs, paragraphNoForAnchor, insertMarkers, insertMarkersAtAnchors, transplantMarkers } from '../src/generated-images/illustration/marker-placer.js';
import { applyTextFxMarkup } from '../src/visual/igs-ui/text-fx.js';

const sceneAssets = { enabled: true, characters: { 角色: { 默认: 'base.png' } }, characterOutfits: { 角色: { 便服: { words: [], moods: { 平和: 'outfit.png' } } } } };
const payloadOf = (body, options = {}) => buildIgsTextPayload({ id: 1, text: `<content>\n${body}\n</content>` }, { sceneAssets, ...options });

test('gate:marker-layout:legacy-cg-with-many-blank-lines-restores-complete-dialogue', () => {
    for (const type of ['char', 'thought']) {
        for (const gap of ['\n\n', '\n \n\t\n', '\r\n\r\n\r\n']) {
            for (const marker of ['<IMG>\n19\n</IMG>', '[igs-img:19]']) {
                const raw = `<content>\n[igs-${type}:角色|平和|第一句。${gap}${marker}${gap}第二句。${gap}]\n</content>`;
                const payload = buildIgsTextPayload({ text: raw }, { sceneAssets });
                assert.deepEqual(payload.textSegments, [type === 'char' ? '[角色]：第一句。第二句。' : '*第一句。第二句。*']);
                assert.equal(payload.raw, raw);
                assert.equal(normalizeImageMarkerLayout(payload.markerLayoutSource), payload.markerLayoutSource);
                const token = marker.startsWith('<') ? '<IMG>19</IMG>' : marker;
                assert.ok(payload.markerLayoutSource.replace(/\r\n/g, '\n').includes(`]\n${token}`));
            }
        }
    }
});

test('gate:marker-layout:multiple-legacy-cg-points-retain-slots-after-one-speech', () => {
    const raw = '<content>\n[igs-char:角色|平和|第一句。\n\n<IMG>19</IMG>\n\n第二句。\n\n[igs-img:20]\n\n第三句。\n\n]\n</content>';
    const payload = buildIgsTextPayload({ text: raw }, { sceneAssets });
    assert.deepEqual(payload.textSegments, ['[角色]：第一句。第二句。第三句。']);
    assert.ok(payload.markerLayoutSource.includes(']\n<IMG>19</IMG>\n[igs-img:20]'));
    assert.equal(payload.raw, raw);
    assert.equal(normalizeImageMarkerLayout(payload.markerLayoutSource), payload.markerLayoutSource);
});
