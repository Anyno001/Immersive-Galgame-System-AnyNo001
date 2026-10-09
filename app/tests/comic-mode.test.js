import test from 'node:test';
import assert from 'node:assert/strict';
import { planVerticalColumns, splitBubbleChunks, tokenizeVertical, prefersHorizontal } from '../src/visual/igs-ui/comic-typeset.js';
import { resolveComicTone } from '../src/visual/igs-ui/text-tone.js';
import { normalizeComicModeSettings } from '../src/visual/igs-ui/comic-settings.js';
import { arrangeChain, placeComicGroup } from '../src/visual/igs-ui/comic-layout.js';
import { bodyPath, makeRand } from '../src/visual/igs-ui/comic-shapes.js';

const cols = (text, opts) => {
    const plan = planVerticalColumns(text, opts);
    return plan.columns.map(([a, b]) => text.slice(a, b));
};

test('comic: 竖排断列遵守避头尾，句读不落在列首、前引号不留在列尾', () => {
    for (const text of ['「等一下！」她拉住我的袖子，小声说：「其实……我有话想告诉你。」', '你今天也来了啊，我还以为你不会来的。', '喂喂，那可是我排了3个小时的队才买到的限定版啊！！']) {
        const parts = cols(text);
        assert.equal(parts.join(''), text);
        for (const part of parts) {
            assert.doesNotMatch(part[0], /[，。、！？；：」』）…]/, `${text} → ${parts.join('|')}`);
            assert.doesNotMatch(part[part.length - 1], /[「『（]/, `${text} → ${parts.join('|')}`);
        }
    }
});

test('comic: 优先在句读处换列，每列不超过上限，短句一列到底', () => {
    assert.deepEqual(cols('什么？！'), ['什么？！']);
    const parts = cols('你今天也来了啊，我还以为你不会来的。', { maxLen: 10 });
    assert.ok(parts.some((part) => part.endsWith('，')), parts.join('|'));
    for (const len of planVerticalColumns('其实我一直都很想对你说从第一次在图书馆遇见你开始', { maxLen: 8 }).lengths) assert.ok(len <= 9);
});

test('comic: 两位数字与「!!」直立成一格（纵中横），手写换行即换列', () => {
    const tokens = tokenizeVertical('排了12小时！！');
    assert.ok(tokens.some((t) => t.text === '12' && t.tcy));
    assert.ok(tokens.some((t) => t.text === '！！' && t.tcy));
    assert.deepEqual(cols('这里是第一行\n这是第二行'), ['这里是第一行', '这是第二行']);
    assert.equal(prefersHorizontal('Hello, how are you today?'), true);
    assert.equal(prefersHorizontal('你今天也来了啊'), false);
});

test('comic: 长台词在句末拆成至多三个连着的泡', () => {
    const text = '其实我一直都很想对你说。从第一次在图书馆遇见你开始，我就没办法不去注意你了。可是我又害怕，害怕说出口之后，连朋友都做不成。所以今天，我想鼓起勇气。';
    const chunks = splitBubbleChunks(text, { limit: 30, maxParts: 3 });
    assert.ok(chunks.length >= 2 && chunks.length <= 3);
    assert.equal(chunks.map(([a, b]) => text.slice(a, b)).join(''), text);
    assert.deepEqual(splitBubbleChunks('短句。'), [[0, 3]]);
});

test('comic: 泡的外形按文本类型、语气记号与情绪词决定', () => {
    const tones = normalizeComicModeSettings({}).tones;
    assert.equal(resolveComicTone({ textType: 'narration', text: '天台。' }), 'narration');
    assert.equal(resolveComicTone({ textType: 'thought', text: '嗯' }), 'thought');
    assert.equal(resolveComicTone({ textType: 'dialogue', text: '站住！！' }), 'shout');
    assert.equal(resolveComicTone({ textType: 'dialogue', text: '那边……', emotion: '害怕', tones }), 'fear');
    assert.equal(resolveComicTone({ textType: 'dialogue', text: '呵', emotion: '冷笑', tones }), 'dark');
    assert.equal(resolveComicTone({ textType: 'dialogue', text: '你好', whisper: true }), 'whisper');
    assert.equal(resolveComicTone({ textType: 'dialogue', text: '你好' }), 'speech');
});

test('comic: 设置默认值——黑白、画格开、留上一句、不画尾巴、线条与距离居中', () => {
    const s = normalizeComicModeSettings(undefined);
    assert.deepEqual([s.enabled, s.palette, s.frame, s.keepPrev, s.tail, s.line, s.gap, s.inkMode], [false, 'mono', true, true, false, 'medium', 'medium', 'auto']);
    assert.equal(normalizeComicModeSettings({ inkColor: 'red' }).inkColor, '#141414');
});

test('comic: 泡贴在说话人头旁、不挡脸；同一种子画出同样的外形', () => {
    const head = { cx: 300, top: 60, w: 80, h: 88 };
    const sizes = [{ ax: 60, by: 90 }];
    const placed = placeComicGroup({ stageW: 900, stageH: 540, safe: { left: 14, top: 14, right: 886, bottom: 526 }, head, kind: 'speech', chains: [arrangeChain(sizes, 800)] });
    const [cx] = placed.centers[0];
    assert.ok(Math.abs(cx - head.cx) > head.w / 2 + 40, `bubble center ${cx} overlaps head`);
    const a = bodyPath('shout', { cx: 0, cy: 0, a: 50, b: 80 }, makeRand(7));
    assert.equal(a, bodyPath('shout', { cx: 0, cy: 0, a: 50, b: 80 }, makeRand(7)));
});

test('comic: 单字后缀不离开前文，上下排列的泡留缝待连线', () => {
    const parts = cols('从第一次在图书馆遇见你开始，我就没办法不去注意你了。', { maxLen: 12 });
    assert.ok(!parts.some((part) => part.startsWith('馆')), parts.join('|'));
    const sizes = [{ ax: 50, by: 100 }, { ax: 50, by: 100 }];
    assert.equal(arrangeChain(sizes, 800).mode, 'row');
    const column = arrangeChain(sizes, 800, 'column', [false, true]);
    assert.equal(column.mode, 'column');
    assert.ok(column.centers[1][1] - column.centers[0][1] > 200);
    const row = arrangeChain(sizes, 800, 'auto', [false, true]);
    assert.ok(row.centers[0][0] - row.centers[1][0] > 100);
    const bitten = arrangeChain(sizes, 800, 'column');
    assert.ok(bitten.centers[1][1] - bitten.centers[0][1] < 200);
});
