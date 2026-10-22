import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BGM_SILENCE_MAX_PAGES, BGM_TRANSITIONS, bgmPackOfWorldview, inferBgmMood, isConfessionLine, normalizeBgmCue, normalizeBgmMood, normalizeBgmTags,
    resolveBgmMood, resolveBgmScene, resolveBgmSilence, resolveBgmTransition, selectBgmTrack,
} from '../src/visual/igs-ui/bgm-library.js';
import { applySceneAudio, cancelSceneAudio, normalizeBgmSettings, skipBgmTrack } from '../src/visual/igs-ui/scene-audio.js';
import { extractFxDirectives, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { bgmMoodTagEnabled, resolveBgmPromptRule } from '../src/visual/igs-ui/fx-prompt.js';
import { buildTagGrammar } from '../src/visual/igs-ui/tag-grammar.js';
import { DEFAULT_BGM_PACK } from '../src/bgm/default-bgm-pack.js';
import { defaultBgmPackTracks, isDefaultBgmTrack, mergeDefaultBgm, removeDefaultBgm } from '../src/bgm/merge-default-bgm.js';
import { BGM_ACTION_RE } from '../src/visual/igs-ui/bgm-settings-actions.js';
import { isTavernAudioPath } from '../src/media/tavern-audio-files.js';

const pool = (id, moods, extra = {}) => ({ id, name: id, url: `https://x/${id}.mp3`, keywords: [], moods, ...extra });

test('bgm moods: Chinese words and aliases normalize, unknown words are dropped', () => {
    assert.equal(normalizeBgmMood('悲'), 'sad');
    assert.equal(normalizeBgmMood(' 甜蜜 '), 'sweet');
    assert.equal(normalizeBgmMood('battle'), 'battle');
    assert.equal(normalizeBgmMood('乱写'), '');
    assert.deepEqual(normalizeBgmTags({ moods: ['悲', 'sad', 'x'], packs: ['magic', 'y'], scenes: ['school'] }).moods, ['sad']);
});

test('bgm worldview maps to a pack and locations map to scene categories', () => {
    assert.equal(bgmPackOfWorldview('ancient'), 'ancient');
    assert.equal(bgmPackOfWorldview('fantasy'), 'magic');
    assert.equal(bgmPackOfWorldview('magic'), 'magic');
    assert.equal(bgmPackOfWorldview('scifi'), 'modern');
    assert.equal(resolveBgmScene('学校天台'), 'school');
    assert.equal(resolveBgmScene('神社前的夜市'), 'festival');
    assert.equal(resolveBgmScene('河堤'), 'nature');
    assert.equal(resolveBgmScene('不认识的地方'), '');
});

test('bgm mood inference: battle and romance ranges beat time of day', () => {
    assert.equal(inferBgmMood({ battle: true, time: '夜晚' }), 'battle');
    assert.equal(inferBgmMood({ romance: true }), 'sweet');
    assert.equal(inferBgmMood({ fxRanges: { flashback: true } }), 'sad');
    assert.equal(inferBgmMood({ time: '深夜' }), 'calm');
    assert.equal(inferBgmMood({ time: '中午' }), 'daily');
});

function fakeAudioFactory() {
    const created = [];
    return {
        created,
        factory: () => {
            const audio = { src: '', loop: false, volume: 1, play() { return Promise.resolve(); }, pause() {} };
            created.push(audio);
            return audio;
        },
    };
}
