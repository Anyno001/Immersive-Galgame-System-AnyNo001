import test from 'node:test';
import assert from 'node:assert/strict';
import {
    bgmPackOfWorldview, inferBgmMood, normalizeBgmMood, normalizeBgmTags, resolveBgmMood, resolveBgmScene, selectBgmTrack,
} from '../src/visual/igs-ui/bgm-library.js';
import { applySceneAudio, cancelSceneAudio, normalizeBgmSettings, skipBgmTrack } from '../src/visual/igs-ui/scene-audio.js';
import { extractFxDirectives, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { bgmMoodTagEnabled, resolveBgmPromptRule } from '../src/visual/igs-ui/fx-prompt.js';
import { buildTagGrammar } from '../src/visual/igs-ui/tag-grammar.js';
import { DEFAULT_BGM_PACK } from '../src/bgm/default-bgm-pack.js';
import { isDefaultBgmTrack, mergeDefaultBgm, removeDefaultBgm } from '../src/bgm/merge-default-bgm.js';
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

test('bgm mood memory: an explicit tag sticks within the same scene and resets on a new scene', () => {
    const memory = {};
    assert.equal(resolveBgmMood({ mood: '悲', location: '教室' }, memory), 'sad');
    assert.equal(resolveBgmMood({ location: '教室走廊' }, memory), 'sad');
    assert.equal(resolveBgmMood({ location: '海边', time: '中午' }, memory), 'daily');
    assert.equal(resolveBgmMood({ mood: '甜', location: '教室' }, memory), 'sweet');
    assert.equal(resolveBgmMood({ location: '教室', battle: true }, memory), 'battle');
});

test('bgm selection: mood pool first, scene bonus breaks ties, pack filter applies', () => {
    const tracks = [
        pool('daily-a', ['daily'], { packs: ['modern'] }),
        pool('sad-school', ['sad'], { packs: ['modern'], scenes: ['school'] }),
        pool('sad-any', ['sad'], { packs: ['modern'] }),
        pool('sad-ancient', ['sad'], { packs: ['ancient'] }),
    ];
    assert.equal(selectBgmTrack(tracks, { mood: 'sad', location: '教室', pack: 'modern' }, {}).id, 'sad-school');
    assert.equal(selectBgmTrack(tracks, { mood: 'sad', location: '', pack: 'ancient' }, {}).id, 'sad-ancient');
    assert.equal(selectBgmTrack(tracks, { mood: 'daily', pack: 'modern' }, {}).id, 'daily-a');
});

test('bgm selection: user place keywords win over mood pools', () => {
    const tracks = [pool('sad', ['sad']), { id: 'mine', name: '我的', url: 'https://x/m.mp3', keywords: ['天台'] }];
    assert.equal(selectBgmTrack(tracks, { mood: 'sad', location: '学校天台' }, {}).id, 'mine');
    assert.equal(selectBgmTrack(tracks, { mood: 'sad', location: '教室' }, {}).id, 'sad');
});

test('bgm selection: keeps the current track while nothing changes, rotates the pool without repeats', () => {
    const tracks = [pool('a', ['calm']), pool('b', ['calm']), pool('c', ['calm'])];
    const memory = { seed: 0 };
    const first = selectBgmTrack(tracks, { mood: 'calm' }, memory).id;
    assert.equal(selectBgmTrack(tracks, { mood: 'calm' }, memory).id, first);
    const seen = new Set([first]);
    seen.add(selectBgmTrack(tracks, { mood: 'calm', skip: true }, memory).id);
    seen.add(selectBgmTrack(tracks, { mood: 'calm', skip: true }, memory).id);
    assert.equal(seen.size, 3, 'each skip plays a track not yet heard this round');
    assert.ok(selectBgmTrack(tracks, { mood: 'calm', skip: true }, memory), 'after a full round the pool starts over');
});

test('bgm selection: a borrowed nearby pool and any tagged track keep music going', () => {
    const tracks = [pool('tense', ['tense']), pool('calm', ['calm'])];
    assert.equal(selectBgmTrack(tracks, { mood: 'eerie' }, {}).id, 'tense');
    assert.ok(selectBgmTrack([pool('only', ['battle'])], { mood: 'sweet' }, {}));
    assert.equal(selectBgmTrack([{ id: 'k', name: 'k', url: 'https://x/k.mp3', keywords: ['海'] }], { location: '教室' }, {}), null);
});

test('bgm fx tag: parsed per floor, carries to later pages, bad moods ignored', () => {
    const text = 'a\n[igs-fx:bgm|悲]\nb\n[igs-fx:bgm|乱写]\nc\n[igs-fx:bgm|战斗]\nd';
    const directives = extractFxDirectives(text);
    assert.equal(directives.length, 2);
    assert.equal(resolveFxAtPage(directives, text.indexOf('a'), -1).bgmMood, '');
    assert.equal(resolveFxAtPage(directives, text.indexOf('c'), text.indexOf('b')).bgmMood, 'sad');
    assert.equal(resolveFxAtPage(directives, text.indexOf('d'), text.indexOf('c')).bgmMood, 'battle');
});

test('bgm prompt: only injected when music, mood tag and a mood-tagged track are all on', () => {
    const tagged = { enabled: true, tracks: [pool('a', ['sad'])] };
    assert.equal(bgmMoodTagEnabled(tagged), true);
    assert.equal(bgmMoodTagEnabled({ ...tagged, moodTag: false }), false);
    assert.equal(bgmMoodTagEnabled({ ...tagged, enabled: false }), false);
    assert.equal(bgmMoodTagEnabled({ enabled: true, tracks: [{ url: 'https://x', keywords: ['海'] }] }), false);
    assert.match(resolveBgmPromptRule(tagged), /\[igs-fx:bgm\|情绪\]/);
    const grammar = buildTagGrammar({ readerSettings: { bgm: tagged } });
    assert.match(grammar.system, /【配乐】/);
    assert.match(grammar.system, /bgm\|情绪/);
    assert.equal(buildTagGrammar({ readerSettings: { bgm: { ...tagged, moodTag: false } } }).system, '');
});

test('bgm settings: keep mood tags, credits and tavern upload paths; old tracks keep their shape', () => {
    const settings = normalizeBgmSettings({
        enabled: true,
        moodTag: false,
        tracks: [
            { id: 'p', name: 'x', url: 'https://cdn/x.mp3', moods: ['悲', 'sweet'], packs: ['magic'], credit: '魔王魂', source: 'https://maou.audio/x/' },
            { id: 'u', name: 'u', url: '/user/files/igs-bgm-abc.mp3', keywords: ['教室'] },
            { id: 'bad', url: '/user/files/other.mp3' },
            { id: 'evil', url: 'https://x/e.mp3', source: 'javascript:alert(1)' },
        ],
    });
    assert.equal(settings.moodTag, false);
    assert.deepEqual(settings.tracks[0].moods, ['sad', 'sweet']);
    assert.deepEqual(settings.tracks[0].packs, ['magic']);
    assert.equal(settings.tracks[0].credit, '魔王魂');
    assert.equal(settings.tracks[1].url, '/user/files/igs-bgm-abc.mp3');
    assert.equal(settings.tracks.length, 3);
    assert.equal(settings.tracks[2].source, undefined);
    assert.deepEqual(Object.keys(settings.tracks[1]).sort(), ['id', 'keywords', 'name', 'url']);
    assert.equal(isTavernAudioPath('/user/files/igs-bgm-abc.mp3'), true);
    assert.equal(isTavernAudioPath('/user/files/../secret'), false);
});

test('bgm default pack: every pack covers every mood, files follow the license naming', () => {
    assert.ok(DEFAULT_BGM_PACK.length >= 50);
    assert.equal(new Set(DEFAULT_BGM_PACK.map((t) => t.id)).size, DEFAULT_BGM_PACK.length);
    for (const pack of ['modern', 'ancient', 'magic']) {
        for (const mood of ['daily', 'cheerful', 'sweet', 'calm', 'sad', 'tense', 'battle', 'eerie']) {
            assert.ok(DEFAULT_BGM_PACK.some((t) => t.packs.includes(pack) && t.moods.includes(mood)), `${pack} lacks ${mood}`);
        }
    }
    for (const track of DEFAULT_BGM_PACK) {
        assert.ok(track.credit && /^https:\/\//.test(track.source), track.id);
        if (track.credit === '魔王魂') assert.match(track.url, /maoudamashii-/);
    }
});

test('bgm default pack: merge adds only the chosen pack, never duplicates, remove keeps user tracks', () => {
    const mine = { id: 'mine', name: 'm', url: 'https://x/m.mp3', keywords: [] };
    const ancient = mergeDefaultBgm([mine], 'ancient');
    assert.ok(ancient.added.length > 0);
    assert.ok(ancient.added.every((t) => t.packs.includes('ancient')));
    assert.equal(mergeDefaultBgm(ancient.tracks, 'ancient').added.length, 0);
    const all = mergeDefaultBgm(ancient.tracks, 'all');
    assert.equal(all.tracks.length, DEFAULT_BGM_PACK.length + 1);
    assert.ok(all.tracks.filter(isDefaultBgmTrack).length === DEFAULT_BGM_PACK.length);
    const removed = removeDefaultBgm(all.tracks);
    assert.deepEqual(removed.tracks, [mine]);
});

test('bgm settings actions: action names route to the bgm handler', () => {
    for (const action of ['bgm-track-add', 'bgm-track-upload', 'bgm-track-edit:t1', 'bgm-track-remove:t1', 'bgm-pack-download', 'bgm-pack-remove']) {
        assert.ok(BGM_ACTION_RE.test(action), action);
    }
    assert.equal(BGM_ACTION_RE.test('bgm-note'), false);
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

test('scene audio: mood-tagged tracks go through the pool, and skip changes the track', () => {
    const root = { ownerDocument: { addEventListener() {}, removeEventListener() {} } };
    const audio = fakeAudioFactory();
    const timers = { schedule: () => 0, clear: () => {} };
    const tracks = [pool('s1', ['sad']), pool('s2', ['sad']), pool('d1', ['daily'])];
    const opts = (context) => ({ bgm: { enabled: true, volume: 0.5, tracks }, context, audioFactory: audio.factory, ...timers });
    const first = applySceneAudio(root, opts({ location: '教室', bgmMood: '悲' })).track;
    assert.ok(['s1', 's2'].includes(first.id));
    assert.equal(applySceneAudio(root, opts({ location: '教室' })).track.id, first.id, 'mood sticks within the scene');
    const skipped = skipBgmTrack();
    assert.ok(skipped && skipped.track && skipped.track.id !== first.id && skipped.track.moods.includes('sad'));
    const off = applySceneAudio(root, { ...opts({ location: '教室', bgmMood: '悲' }), bgm: { enabled: true, volume: 0.5, moodTag: false, tracks } }).track;
    assert.equal(off.id, 'd1', 'with the mood tag off, the tag is ignored and the mood is inferred');
    cancelSceneAudio(root);
});
