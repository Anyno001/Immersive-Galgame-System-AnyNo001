import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, FX_REACT_PAGE_MAX, FX_TAG_KINDS, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { findCalledCast } from '../src/scene/stage-cast.js';
import { resolveFxPromptRule, resolveStageCastFxPromptRule, stageCastGrammarLines } from '../src/visual/igs-ui/fx-prompt.js';
import { buildTagGrammar } from '../src/visual/igs-ui/tag-grammar.js';
import { normalizeStageCastSettings } from '../src/visual/igs-ui/stage-direction-settings.js';
import { applyCastToDom, planCastReacts, playCastBeats } from '../src/visual/igs-ui/stage-cast-render.js';
import { normalizeMangaFxSettings } from '../src/visual/igs-ui/fx-settings.js';
import { normalizeSpriteActionSettings } from '../src/visual/igs-ui/stage-direction-settings.js';
import { CAST_CALLED_FRAME, CAST_DIM_FRAME, CAST_FOCUS_FRAME } from '../src/visual/igs-ui/stage-cast-motion.js';

function fxOf(text) {
    return resolveFxAtPage(extractFxDirectives(text), text.length, -1);
}

test('gate: react tag parses target and emotion', () => {
    const fx = fxOf('[igs-fx:react|Alice|害羞]\n[igs-fx:react|全员|惊讶]\n[igs-fx:react|Bob]\n台词');
    assert.deepEqual(fx.reacts, [
        { target: 'Alice', emotion: '害羞' },
        { target: '全员', emotion: '惊讶' },
        { target: 'Bob', emotion: '' },
    ]);
    // 缺角色名整条丢弃；react 不进入瞬时演出与通用标签类型。
    assert.deepEqual(fxOf('[igs-fx:react]\n[igs-fx:react||害羞]\n台词').reacts, []);
    assert.deepEqual(fx.instants, []);
    assert.ok(!FX_TAG_KINDS.includes('react'));
    // 超过同页上限的丢弃。
    const many = Array.from({ length: FX_REACT_PAGE_MAX + 2 }, (_, i) => `[igs-fx:react|角色${i}|开心]`).join('\n');
    assert.equal(fxOf(`${many}\n台词`).reacts.length, FX_REACT_PAGE_MAX);
    // 只归当前页：上一页的标签不带到本页。
    const text = '[igs-fx:react|Alice|害羞]\n第一页\n第二页';
    assert.deepEqual(resolveFxAtPage(extractFxDirectives(text), text.length, text.indexOf('第一页')).reacts, []);
});

test('gate: called cast matches names and aliases', () => {
    const members = [{ character: '爱丽丝' }, { character: '鲍勃' }, { character: '雪' }];
    const aliases = { 鲍勃: ['小鲍', '鲍'], 雪: ['小雪'] };
    assert.deepEqual(findCalledCast('爱丽丝，你怎么看？', members, aliases), ['爱丽丝']);
    assert.deepEqual(findCalledCast('小鲍也来了。', members, aliases), ['鲍勃']);
    // 单字名 / 单字别名不匹配。
    assert.deepEqual(findCalledCast('外面下雪了，鲍鱼很贵。', members, aliases), []);
    assert.deepEqual(findCalledCast('小雪和爱丽丝', members, aliases), ['爱丽丝', '雪']);
    assert.deepEqual(findCalledCast('', members, aliases), []);
    assert.deepEqual(findCalledCast('爱丽丝', [], aliases), []);
    assert.deepEqual(findCalledCast('爱丽丝', members, null), ['爱丽丝']);
});

test('gate: cast react switch defaults off and gates both prompt paths', () => {
    assert.equal(normalizeStageCastSettings({}).castReact, false);
    assert.equal(normalizeStageCastSettings({ castReact: true }).castReact, true);
    assert.equal(resolveStageCastFxPromptRule({ enabled: true }), '');
    assert.equal(resolveStageCastFxPromptRule({ castReact: true }), '');
    assert.ok(resolveStageCastFxPromptRule({ enabled: true, castReact: true }).includes('[igs-fx:react|'));
    assert.deepEqual(stageCastGrammarLines({ enabled: true }), []);
    assert.equal(stageCastGrammarLines({ enabled: true, castReact: true }).length, 1);
    assert.ok(!resolveFxPromptRule({ enabled: true }).includes('react'));
    assert.equal(buildTagGrammar({ readerSettings: { stageCast: { enabled: true } } }).system, '');
    assert.ok(buildTagGrammar({ readerSettings: { stageCast: { enabled: true, castReact: true } } }).system.includes('react|'));
});


function fakeCastStage() {
    const mk = () => {
        const attrs = new Map();
        const props = new Map();
        const el = {
            children: [], parentNode: null, className: '', anims: [],
            style: { setProperty(k, v) { props.set(k, String(v)); }, removeProperty(k) { props.delete(k); }, getPropertyValue(k) { return props.get(k) || ''; } },
            setAttribute(k, v) { attrs.set(k, String(v)); },
            getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
            hasAttribute(k) { return attrs.has(k); },
            removeAttribute(k) { attrs.delete(k); },
            appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
            removeChild(c) { el.children = el.children.filter((x) => x !== c); c.parentNode = null; return c; },
            animate(frames, opts) { const a = { frames, opts, cancelled: false, cancel() { this.cancelled = true; } }; el.anims.push(a); return a; },
        };
        return el;
    };
    const layer = mk();
    layer.ownerDocument = { createElement: () => mk() };
    const root = { querySelector: (s) => (s === '#igs-cast' ? layer : null) };
    const byChar = (n) => layer.children.find((c) => c.getAttribute('data-igs-cast-char') === n);
    return { root, layer, byChar };
}

const castMember = (character, posX, extra = {}) => ({ character, url: `https://example.com/${character}.png`, posX, posY: 100, scale: 100, ...extra });

test('gate: called cast member is lit one step, focus still wins', () => {
    const s = fakeCastStage();
    applyCastToDom(s.root, [castMember('A', 6, { called: true }), castMember('B', 94)], { reduced: true });
    assert.equal(s.byChar('A').style.filter, CAST_CALLED_FRAME);
    assert.equal(s.byChar('B').style.filter, CAST_DIM_FRAME);
    applyCastToDom(s.root, [castMember('A', 6, { called: true }), castMember('B', 94)], { reduced: true, focus: 'A' });
    assert.equal(s.byChar('A').style.filter, CAST_FOCUS_FRAME);
});

test('gate: cast beats play once per member and cancel previous beat', () => {
    const s = fakeCastStage();
    applyCastToDom(s.root, [castMember('A', 6), castMember('B', 94)], { reduced: true });
    const played = playCastBeats(s.root, [{ character: 'A', kind: 'sink' }, { character: 'A', kind: 'hop' }, { character: 'Z', kind: 'hop' }]);
    assert.deepEqual(played, [{ character: 'A', kind: 'sink' }]);
    const sinkAnim = s.byChar('A')._igsCastBeat;
    assert.equal(sinkAnim.opts.composite, 'add');
    // 下一页：上一轮 sink（fill:forwards）被取消，不会一直沉着。
    playCastBeats(s.root, [{ character: 'B', kind: 'hop' }]);
    assert.equal(sinkAnim.cancelled, true);
    assert.equal(s.byChar('A')._igsCastBeat, null);
    assert.ok(s.byChar('B')._igsCastBeat);
    // 减少动效：不播。
    assert.deepEqual(playCastBeats(s.root, [{ character: 'A', kind: 'hop' }], { reduced: true }), []);
    // 下台时取消动作。
    playCastBeats(s.root, [{ character: 'B', kind: 'hop' }]);
    const bBeat = s.byChar('B')._igsCastBeat;
    applyCastToDom(s.root, [castMember('A', 6)], { reduced: true });
    assert.equal(bBeat.cancelled, true);
});

test('gate: cast react plan maps emotion to symbol and action', () => {
    const symbols = normalizeMangaFxSettings({}).symbols;
    const actions = normalizeSpriteActionSettings({});
    const members = [{ character: '爱丽丝' }, { character: '鲍勃' }];
    const keyOf = (name) => (name === '小爱' ? '爱丽丝' : name);
    const base = { members, keyOf, symbols, actions };
    // 「生气」同时命中青筋符号与前冲动作。
    assert.deepEqual(planCastReacts({ ...base, reacts: [{ target: '小爱', emotion: '生气' }] }), {
        beats: [{ character: '爱丽丝', kind: 'lunge' }],
        marks: [{ character: '爱丽丝', kind: 'anger' }],
    });
    // 只中符号不小跳；都不中只小跳。
    assert.deepEqual(planCastReacts({ ...base, reacts: [{ target: '鲍勃', emotion: '尴尬' }] }), { beats: [], marks: [{ character: '鲍勃', kind: 'sweat' }] });
    assert.deepEqual(planCastReacts({ ...base, reacts: [{ target: '鲍勃', emotion: '' }] }), { beats: [{ character: '鲍勃', kind: 'hop' }], marks: [] });
    // 动作词：后退。
    assert.deepEqual(planCastReacts({ ...base, reacts: [{ target: '鲍勃', emotion: '戒备' }] }).beats, [{ character: '鲍勃', kind: 'retreat' }]);
    // 全员；不在台上的丢弃；同一角色只取第一条。
    const all = planCastReacts({ ...base, reacts: [{ target: '爱丽丝', emotion: '害怕' }, { target: '全员', emotion: '' }, { target: '卡拉', emotion: '开心' }] });
    assert.deepEqual(all.beats, [{ character: '爱丽丝', kind: 'tremble' }, { character: '鲍勃', kind: 'hop' }]);
    assert.deepEqual(all.marks, []);
    // 说话人惊讶类情绪：没有动作的陪衬全员小跳。
    assert.deepEqual(planCastReacts({ ...base, speakerEmotion: '疑惑' }).beats, [{ character: '爱丽丝', kind: 'hop' }, { character: '鲍勃', kind: 'hop' }]);
    assert.deepEqual(planCastReacts({ ...base, speakerEmotion: '平静' }), { beats: [], marks: [] });
    assert.deepEqual(planCastReacts({ ...base, members: [], reacts: [{ target: '全员', emotion: '' }], speakerEmotion: '疑惑' }), { beats: [], marks: [] });
});
