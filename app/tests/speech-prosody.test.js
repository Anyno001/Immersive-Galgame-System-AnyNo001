import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildProsody, emotionPitch, emotionProfile, isVoicedText, prosodySeed,
    punctuationPauseAfter, sentenceKind, splitSentences, stutterMarks, wordStarts,
} from '../src/visual/igs-ui/speech-prosody.js';

const chars = (text) => Array.from(text);
const steps = (text, tfx = {}) => chars(text).map((ch, i) => (tfx[i] ? { text: ch, tfx: tfx[i] } : { text: ch }));
const gaps = (notes) => notes.map((n, i) => n.timeMs - (i ? notes[i - 1].timeMs : 0));

// fake DOM：文本节点挂在 span.igs-tfx 下，逐字 rect 横向排开。
function tfxTarget(runs) {
    const root = { childNodes: [] };
    for (const [text, className, inner] of runs) {
        const node = { nodeType: 3, nodeValue: text, parentNode: root };
        if (!className) { root.childNodes.push(node); continue; }
        const span = { nodeType: 1, className, childNodes: [], parentNode: root };
        if (inner) {
            const ch = { nodeType: 1, className: inner, childNodes: [node], parentNode: span };
            node.parentNode = ch;
            span.childNodes.push(ch);
        } else {
            node.parentNode = span;
            span.childNodes.push(node);
        }
        root.childNodes.push(span);
    }
    let count = 0;
    root.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 20, width: 400, height: 20 });
    root.ownerDocument = {
        createRange: () => ({
            setStart() {}, setEnd() {},
            getClientRects: () => { const i = count++; return [{ left: i * 10, right: i * 10 + 10, top: 0, bottom: 20, width: 10, height: 20 }]; },
        }),
    };
    return root;
}

test('prosody text fx: classic reveal reads .igs-tfx kind from the DOM', async () => {
    const { measureClassicReveal } = await import('../src/visual/igs-ui/typewriter-classic.js');
    const base = measureClassicReveal(tfxTarget([['我好生气。']]), 20, { prosody: true });
    const roar = measureClassicReveal(tfxTarget([['我好'], ['生气', 'igs-tfx igs-tfx-roar'], ['。']]), 20, { prosody: true });
    assert.ok(roar.events[2].gain > base.events[2].gain, '吼：音量加重');
    assert.equal(roar.events[2].force, true);
    const shake = measureClassicReveal(tfxTarget([['抖', 'igs-tfx igs-tfx-shake', 'igs-tfx-ch']]), 20, { prosody: true });
    assert.equal(shake.events[0].jitter, 0.15, '逐字包装 igs-tfx-ch 不遮住外层类型');
    const off = measureClassicReveal(tfxTarget([['我好'], ['生气', 'igs-tfx igs-tfx-roar'], ['。']]), 20);
    assert.deepEqual(Object.keys(off.events[2]), ['timeMs', 'text'], '关闭时事件结构不变');
    assert.deepEqual(off.events.map((e) => e.timeMs), [20, 40, 60, 80, 100]);
});


test('prosody: sentence split and kind', () => {
    assert.deepEqual(splitSentences(chars('好啦～今天天气不错。')), [
        { start: 0, end: 2, runStart: 2, kind: 'drawl' },
        { start: 3, end: 9, runStart: 9, kind: 'statement' },
    ]);
    assert.deepEqual(splitSentences(chars('笨蛋！你？！')), [
        { start: 0, end: 2, runStart: 2, kind: 'exclaim' },
        { start: 3, end: 5, runStart: 4, kind: 'exclaim-question' },
    ]);
    assert.deepEqual(splitSentences(chars('我……我其实……')), [{ start: 0, end: 7, runStart: 6, kind: 'ellipsis' }]);
    assert.deepEqual(splitSentences(chars('你好')), [{ start: 0, end: 1, runStart: 2, kind: 'statement' }]);
    assert.deepEqual(['？！', '……', '～', '？', '！', ''].map(sentenceKind),
        ['exclaim-question', 'ellipsis', 'drawl', 'question', 'exclaim', 'statement']);
});

test('prosody: word starts fall back to every grapheme', () => {
    assert.deepEqual(wordStarts(['我', '们'], null), [true, true]);
    const fake = { segment: () => [{ index: 0 }, { index: 2 }] };
    assert.deepEqual(wordStarts(['今', '天', '好'], fake), [true, false, true]);
});

test('prosody: stutter detection', () => {
    const a = stutterMarks(chars('我、我才没有！'));
    assert.deepEqual([...a.gaps], [1]);
    assert.deepEqual([...a.repeats], [2]);
    const b = stutterMarks(chars('我……我其实'));
    assert.deepEqual([...b.gaps], []);
    assert.deepEqual([...b.repeats], [3]);
    const c = stutterMarks(chars('好、走'));
    assert.equal(c.gaps.size + c.repeats.size, 0);
});

test('prosody: disabled matches legacy timeline exactly', () => {
    const list = steps('好，走。');
    const off = buildProsody(list, { speed: 10 });
    const paused = buildProsody(list, { speed: 10, punctuationPause: true });
    assert.deepEqual(off.map((n) => n.timeMs), [10, 20, 30, 40]);
    assert.deepEqual(paused.map((n) => n.timeMs), [10, 20, 60, 70]);
    assert.ok(paused.every((n) => n.pitch === 1 && n.gain === 1 && n.hold === 1));
    assert.equal(punctuationPauseAfter('，', 10), 30);
    assert.equal(punctuationPauseAfter('。', 10), 70);
});

test('prosody: emotion table keeps legacy character voice pitch', () => {
    assert.deepEqual(['开心地笑', '有点难过', '平静', '', '很生气'].map(emotionPitch), [1.06, 0.92, 1, 1, 1]);
    assert.equal(emotionProfile('有点紧张').id, 'nervous');
    assert.equal(emotionProfile('').id, 'neutral');
    assert.equal(isVoicedText('，'), false);
    assert.equal(prosodySeed('你好'), prosodySeed('你好'));
});


test('prosody: negated emotion words do not count', () => {
    assert.deepEqual(['不开心', '有点不高兴', '没那么紧张', '开心又不安'].map((text) => emotionProfile(text).id), ['neutral', 'neutral', 'neutral', 'happy']);
    assert.equal(emotionPitch('不开心'), 1);
    assert.equal(emotionProfile('不开心，很难过').id, 'sad');
});

test('prosody rhythm: without word info the pace stays even and nothing is forced', () => {
    const notes = buildProsody(steps('啊啊啊啊啊啊啊啊'), { speed: 20, rhythm: true, intonation: true, seed: 5, segmenter: null });
    const legacy = buildProsody(steps('啊啊啊啊啊啊啊啊'), { speed: 20 });
    const ratio = notes.at(-1).timeMs / legacy.at(-1).timeMs;
    // 只剩句尾拖长与 ±8% 微抖，不再整体 ×1.2。
    assert.ok(ratio > 0.95 && ratio < 1.15, `ratio ${ratio}`);
    assert.equal(notes.filter((note) => note.force).length, 1, '只有句首音必响');
});

const fakeWords = (...indexes) => ({ segment: () => indexes.map((index) => ({ index })) });

test('prosody rhythm: word grouping and sentence-tail stretch', () => {
    const notes = buildProsody(steps('今天天气不错。'), { speed: 20, rhythm: true, seed: 7, segmenter: fakeWords(0, 2, 4, 6) });
    const g = gaps(notes);
    assert.ok(g[1] < g[2], '词内字距比词首短');
    assert.ok(g[3] < g[5], '句尾字拖长');
    assert.ok(g[2] < g[4], '倒数第二字也变长');
});

test('prosody rhythm: question pauses longer than exclamation', () => {
    const opts = { speed: 10, rhythm: true, punctuationPause: true, seed: 1, segmenter: null };
    const q = gaps(buildProsody(steps('你？好'), opts));
    const e = gaps(buildProsody(steps('你！好'), opts));
    assert.ok(q[2] > e[2]);
});

test('prosody rhythm: total duration stays within 0.8-1.25x legacy and is deterministic', () => {
    const samples = ['你真的要走吗？', '笨蛋！', '我……我其实……', '好啦～', '我、我才没有！', '今天天气不错。', '啊啊啊啊啊啊啊啊啊啊啊啊。'];
    for (const text of samples) {
        for (const emotion of ['', '很难过', '生气', '紧张', '犯困']) {
            for (const punctuationPause of [false, true]) {
                const legacy = buildProsody(steps(text), { speed: 28, punctuationPause });
                const notes = buildProsody(steps(text), { speed: 28, punctuationPause, rhythm: true, intonation: true, emotion });
                const ratio = notes.at(-1).timeMs / legacy.at(-1).timeMs;
                assert.ok(ratio >= 0.8 - 1e-9 && ratio <= 1.25 + 1e-9, `${text}/${emotion}/${punctuationPause}: ${ratio}`);
                assert.ok(gaps(notes).every((gap) => gap > 0));
                assert.ok(notes.every((n) => n.pitch >= 0.8 && n.pitch <= 1.2), '语调幅度不超过 ±20%');
                assert.deepEqual(buildProsody(steps(text), { speed: 28, punctuationPause, rhythm: true, intonation: true, emotion }), notes);
            }
        }
    }
});

test('prosody intonation: question rises, exclaim louder, ellipsis fades, drawl holds', () => {
    const q = buildProsody(steps('你真的要走吗？'), { speed: 28, intonation: true }).filter((n) => n.voiced);
    assert.ok(q.at(-3).pitch < q.at(-2).pitch && q.at(-2).pitch < q.at(-1).pitch);
    const loud = buildProsody(steps('笨蛋！'), { speed: 28, intonation: true });
    const plain = buildProsody(steps('笨蛋。'), { speed: 28, intonation: true });
    assert.ok(loud[0].gain > plain[0].gain && loud[1].gain > plain[1].gain);
    assert.equal(loud[0].accent, true);
    const fade = buildProsody(steps('我其实……'), { speed: 28, intonation: true });
    assert.ok(fade[0].gain > fade[1].gain && fade[1].gain > fade[2].gain);
    const drawl = buildProsody(steps('好啦～'), { speed: 28, intonation: true });
    assert.equal(drawl[1].hold, 1.8);
    assert.ok(drawl[1].glide > 0);
});

test('prosody text fx: roar is louder, slower and always voiced; grow ramps up', () => {
    const opts = { speed: 20, rhythm: true, intonation: true, seed: 3, segmenter: null };
    const base = buildProsody(steps('我好生气。'), opts);
    const roar = buildProsody(steps('我好生气。', { 2: 'roar', 3: 'roar' }), opts);
    assert.ok(roar[2].gain > base[2].gain);
    assert.equal(roar[2].force, true);
    assert.ok(gaps(roar)[2] > gaps(base)[2]);
    const grow = buildProsody(steps('一二三四', { 0: 'grow', 1: 'grow', 2: 'grow', 3: 'grow' }), { speed: 20, intonation: true });
    assert.ok(grow[0].gain < grow[1].gain && grow[1].gain < grow[2].gain && grow[2].gain < grow[3].gain);
});


test('prosody audio: scheduler receives per-note intonation, forced word starts and legacy timesMs', async () => {
    const { scheduleTypewriterAudio } = await import('../src/visual/igs-ui/typewriter-audio.js');
    const calls = [];
    const audioScheduler = (info) => { calls.push(info); return { stop() {} }; };
    // 慢速档 48ms：高于必响字 40ms 最小间隔，低于关闭时的 80ms 丢音间隔。
    // 分词：你 / 真的 / 要 / 走 / 吗 / ？——「的」是词内字，不足 80ms 被丢，其余词首必响。
    const notes = buildProsody(steps('你真的要走吗？'), { speed: 48, intonation: true, segmenter: fakeWords(0, 1, 3, 4, 5, 6) });
    const events = notes.map((n, i) => ({ ...n, text: chars('你真的要走吗？')[i] }));
    scheduleTypewriterAudio(events, { textType: 'dialogue', volume: 0.5, audioScheduler, prosody: true, pitch: 1.1 });
    const [on] = calls;
    assert.equal(on.notes.length, 5, '每个词首都必响（40ms 间隔内不丢），词内字按 80ms 丢');
    assert.deepEqual(on.timesMs, on.notes.map((n) => n.timeMs));
    const tail = on.notes.slice(-3).map((n) => n.pitch);
    assert.ok(tail[0] < tail[1] && tail[1] < tail[2], '疑问句末音递增');
    assert.ok(Math.abs(on.notes[0].pitch / 1.1 - notes[0].pitch) < 1e-9, '乘以整页说话人音高');
    scheduleTypewriterAudio([{ text: '甲', timeMs: 0 }, { text: '乙', timeMs: 100 }], { textType: 'dialogue', volume: 0.5, audioScheduler });
    assert.deepEqual(calls[1].timesMs, [0, 100]);
    assert.ok(calls[1].notes.every((n) => n.pitch === 1 && n.gain === 1 && n.hold === 1), '关闭时逐音符语调为 1');
    const legacyDrop = [];
    scheduleTypewriterAudio(events, { textType: 'dialogue', volume: 0.5, audioScheduler: (info) => { legacyDrop.push(info); return null; } });
    assert.equal(legacyDrop[0].timesMs.length, 3, '关闭时仍按 80ms 丢音');
});
