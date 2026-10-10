import test from 'node:test';
import assert from 'node:assert/strict';
import {
    TEXT_FX_KINDS,
    armTextFx,
    disarmTextFx,
    TEXT_FX_STYLE_TEXT,
    applyTextFxMarkup,
    normalizeTextFxSettings,
    resolveTextFxPromptRule,
    stripTextFxMarkup,
} from '../src/visual/igs-ui/text-fx.js';
import { esc } from '../src/visual/igs-ui/reader-value-utils.js';

test('gate: text fx kinds map chinese markers to class ids', () => {
    assert.deepEqual({ ...TEXT_FX_KINDS }, {
        抖: 'shake', 波: 'wave', 大: 'big', 小: 'small', 淡: 'whisper', 强: 'strong', 吼: 'roar', 渐大: 'grow', 渐小: 'fade',
    });
});

test('gate: text fx settings default to disabled', () => {
    assert.deepEqual(normalizeTextFxSettings(), { enabled: false });
    assert.deepEqual(normalizeTextFxSettings({ enabled: 'yes' }), { enabled: false });
    assert.deepEqual(normalizeTextFxSettings({ enabled: true, extra: 1 }), { enabled: true });
});

test('gate: text fx wraps whole-run effects in a single span', () => {
    assert.equal(applyTextFxMarkup('我说：{大:站住！}', true), '我说：<span class="igs-tfx igs-tfx-big">站住！</span>');
    assert.equal(applyTextFxMarkup('{小:才没有}', true), '<span class="igs-tfx igs-tfx-small">才没有</span>');
    assert.equal(applyTextFxMarkup('{淡:嘘}', true), '<span class="igs-tfx igs-tfx-whisper">嘘</span>');
    assert.equal(applyTextFxMarkup('{强:钥匙}', true), '<span class="igs-tfx igs-tfx-strong">钥匙</span>');
    assert.equal(applyTextFxMarkup('{大：全角}', true), '<span class="igs-tfx igs-tfx-big">全角</span>');
});

test('gate: shake and wave wrap each grapheme with an index', () => {
    assert.equal(
        applyTextFxMarkup('{抖:别过}', true),
        '<span class="igs-tfx igs-tfx-shake"><span class="igs-tfx-ch" style="--i:0">别</span><span class="igs-tfx-ch" style="--i:1">过</span></span>',
    );
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
    const wave = applyTextFxMarkup(`{波:a b${family}}`, true);
    assert.ok(wave.startsWith('<span class="igs-tfx igs-tfx-wave">'));
    assert.ok(wave.includes(`--i:0">a</span> <span class="igs-tfx-ch" style="--i:1">b</span><span class="igs-tfx-ch" style="--i:2">${family}</span>`));
});

test('gate: text fx keeps escaped input escaped and never splits entities', () => {
    const html = applyTextFxMarkup(esc('{抖:<b>&"}'), true);
    assert.doesNotMatch(html, /<b>/);
    assert.match(html, /--i:0">&lt;<\/span>/);
    assert.match(html, /--i:1">b<\/span>/);
    assert.match(html, /--i:2">&gt;<\/span>/);
    assert.match(html, /--i:3">&amp;<\/span>/);
    assert.match(html, /--i:4">&quot;<\/span>/);
    assert.doesNotMatch(html, /">&<\/span>|">amp;/);
    assert.equal(applyTextFxMarkup(esc('{大:<script>}'), true), '<span class="igs-tfx igs-tfx-big">&lt;script&gt;</span>');
});

test('gate: unknown effects, oversize and multi-line markers stay untouched', () => {
    assert.equal(applyTextFxMarkup('{慢:慢慢说}', true), '{慢:慢慢说}');
    assert.equal(applyTextFxMarkup('{抖:第一行\n第二行}', true), '{抖:第一行\n第二行}');
    const long = `{大:${'啊'.repeat(41)}}`;
    assert.equal(applyTextFxMarkup(long, true), long);
    assert.match(applyTextFxMarkup(`{大:${'啊'.repeat(40)}}`, true), /igs-tfx-big/);
    assert.equal(applyTextFxMarkup('{大:  }', true), '{大:  }');
    assert.match(applyTextFxMarkup(`{大:${'&amp;'.repeat(40)}}`, true), /igs-tfx-big/);
});

test('gate: text fx never matches across tags', () => {
    const html = '{抖:<span class="igs-thought">心声</span>}';
    assert.equal(applyTextFxMarkup(html, true), html);
    assert.equal(
        applyTextFxMarkup('<span class="igs-thought">{强:心声}</span>', true),
        '<span class="igs-thought"><span class="igs-tfx igs-tfx-strong">心声</span></span>',
    );
});

test('gate: nested markers only apply the innermost effect', () => {
    const html = applyTextFxMarkup('{抖:{大:站住}}', true);
    assert.match(html, /igs-tfx-big/);
    assert.doesNotMatch(html, /igs-tfx-shake/);
});

test('gate: disabled text fx strips known markers only', () => {
    assert.equal(applyTextFxMarkup('她{抖:颤抖}着说{慢:x}', false), '她颤抖着说{慢:x}');
    assert.equal(applyTextFxMarkup('<i>{大:a}</i>', false), '<i>a</i>');
    assert.equal(stripTextFxMarkup('{波:啦啦}和{强:名字}'), '啦啦和名字');
    assert.equal(stripTextFxMarkup('{抖:<b>}'), '<b>');
    assert.equal(stripTextFxMarkup(null), '');
    assert.equal(applyTextFxMarkup('无标记 & 文本', true), '无标记 & 文本');
});

test('gate: text fx prompt rule only when enabled', () => {
    assert.equal(resolveTextFxPromptRule(false), '');
    assert.equal(resolveTextFxPromptRule('true'), '');
    const rule = resolveTextFxPromptRule(true);
    assert.match(rule, /^【文字演出】/);
    for (const kind of Object.keys(TEXT_FX_KINDS)) assert.ok(rule.includes(`{${kind}:`), kind);
    assert.match(rule, /最多使用2处/);
    assert.match(rule, /不得嵌套/);
    assert.match(rule, /不得换行/);
    assert.doesNotMatch(rule, /\{慢/);
});

test('gate: text fx css is scoped and honours reduced motion', () => {
    for (const id of Object.values(TEXT_FX_KINDS)) assert.ok(TEXT_FX_STYLE_TEXT.includes(`.igs-tfx-${id}`), id);
    assert.match(TEXT_FX_STYLE_TEXT, /\.igs-tfx-ch\{display:inline-block/);
    assert.match(TEXT_FX_STYLE_TEXT, /var\(--i,0\)/);
    assert.match(TEXT_FX_STYLE_TEXT, /@media \(prefers-reduced-motion: reduce\)\{\s*#igs-overlay :is\(#igs-text,\.igs-comic-text\) \.igs-tfx-ch\{animation:none/);
    for (const line of TEXT_FX_STYLE_TEXT.split('\n')) {
        if (line.includes('{') && !line.startsWith('@')) assert.ok(line.startsWith('#igs-overlay'), line);
    }
});

test('gate: roar wraps whole run and grow/fade carry grapheme count', () => {
    assert.equal(applyTextFxMarkup('{吼:给我滚！}', true), '<span class="igs-tfx igs-tfx-roar">给我滚！</span>');
    assert.equal(
        applyTextFxMarkup('{渐大:啊 啊}', true),
        '<span class="igs-tfx igs-tfx-grow" style="--n:2"><span class="igs-tfx-ch" style="--i:0">啊</span> <span class="igs-tfx-ch" style="--i:1">啊</span></span>',
    );
    assert.match(applyTextFxMarkup('{渐小：算了}', true), /^<span class="igs-tfx igs-tfx-fade" style="--n:2">/);
    assert.equal(stripTextFxMarkup('{吼:滚}{渐大:啊}{渐小:嗯}'), '滚啊嗯');
});

test('gate: pop effects animate only after arming with reveal delay', () => {
    assert.match(TEXT_FX_STYLE_TEXT, /:is\(#igs-text,\.igs-comic-text\)\[data-igs-tfx-armed="1"\] \.igs-tfx-roar\{animation:igs-tfx-roar [^;]*var\(--igs-tfx-delay,0ms\)/);
    assert.doesNotMatch(TEXT_FX_STYLE_TEXT, /^#igs-overlay :is\(#igs-text,\.igs-comic-text\) \.igs-tfx-roar\{[^}]*animation/m);
    const reduced = TEXT_FX_STYLE_TEXT.slice(TEXT_FX_STYLE_TEXT.indexOf('prefers-reduced-motion'));
    assert.match(reduced, /\.igs-tfx-big,#igs-overlay :is\(#igs-text,\.igs-comic-text\) \.igs-tfx-roar\{animation:none/);
    const props = [];
    const pop = (name) => ({ name, style: { setProperty: (key, value) => props.push([name, key, value]) } });
    const textEl = { dataset: {}, querySelectorAll: () => [pop('roar'), pop('big')] };
    armTextFx(textEl, (el) => (el.name === 'roar' ? 364.4 : -5));
    assert.equal(textEl.dataset.igsTfxArmed, '1');
    assert.deepEqual(props, [['roar', '--igs-tfx-delay', '364ms'], ['big', '--igs-tfx-delay', '0ms']]);
    armTextFx(textEl, () => 999);
    assert.equal(props.length, 2);
    disarmTextFx(textEl);
    assert.equal(textEl.dataset.igsTfxArmed, undefined);
    armTextFx(textEl, null);
    assert.deepEqual(props.slice(2).map(p => p[2]), ['0ms', '0ms']);
});
