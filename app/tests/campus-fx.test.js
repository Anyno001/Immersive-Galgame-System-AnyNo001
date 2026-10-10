import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPUS_FX_KINDS, CAMPUS_AMBIENCE_HTML, CAMPUS_AMBIENCE_KINDS, CAMPUS_TRIGGER_WORDS, examMinutesOf, resolveCampusAmbience } from '../src/scene/campus-fx.js';
import { DAILY_FX_KINDS, dailyFxOf, parseDailyFxBody } from '../src/scene/daily-fx-directives.js';
import { resolveDateAmbience } from '../src/scene/date-ambience.js';
import { extractFxDirectives, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { applyFxWorldview } from '../src/scene/fx-era.js';
import { detectPromptTriggers } from '../src/scene/prompt-triggers.js';
import { DAILY_SFX } from '../src/visual/igs-ui/fx-daily-sfx.js';
import { CAMPUS_BUILDERS } from '../src/visual/igs-ui/fx-daily-campus.js';
import { CAMPUS_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-daily-campus-style.js';
import { DAILY_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-daily-style.js';
import { DAILY_GRAMMAR_LINES, campusDetailedBlock, campusGrammarLines, resolveDailyFxPromptRule } from '../src/visual/igs-ui/fx-daily-prompt.js';
import { DAILY_FX_LABELS, enabledDailyFxKinds, normalizeDailyFxSettings } from '../src/visual/igs-ui/fx-daily-model.js';
import { resolveAmbientPlan } from '../src/visual/igs-ui/scene-audio.js';
import { collectGrammarBlocks } from '../src/visual/igs-ui/tag-grammar.js';

const parse = (kind, fields) => dailyFxOf(parseDailyFxBody(kind, fields));
const doc = { createElement: () => ({ className: '', innerHTML: '', style: {} }) };
const ON = { dailyFx: { enabled: true, ...Object.fromEntries(CAMPUS_FX_KINDS.map((kind) => [kind, true])) } };

test('gate:campus-fx parse is lenient and requires only the passnote text', () => {
    assert.deepEqual(parse('chalk', ['明天小测']), { type: 'chalk', text: '明天小测' });
    assert.deepEqual(parse('chalk', []), { type: 'chalk', text: '' });
    assert.equal(parse('chalk', ['一二三四五六七八九十一二三四五六七八九十甲乙']).text.length, 20);
    assert.deepEqual(parse('passnote', ['放学后天台见']), { type: 'passnote', text: '放学后天台见' });
    assert.equal(parseDailyFxBody('passnote', []), null);
    assert.deepEqual(parse('drawer', ['情书']), { type: 'drawer', item: '情书' });
    assert.deepEqual(parse('drawer', []), { type: 'drawer', item: '' });
    assert.deepEqual(parse('rollcall', ['林小雨', '到']), { type: 'rollcall', who: '林小雨', reply: '到' });
    assert.deepEqual(parse('rollcall', []), { type: 'rollcall', who: '', reply: '' });
    assert.deepEqual(parse('exam', ['数学', '90分钟']), { type: 'exam', subject: '数学', minutes: 90 });
    assert.deepEqual(parse('exam', []), { type: 'exam', subject: '', minutes: 0 });
    assert.equal(examMinutesOf('1小时'), 60);
    assert.equal(examMinutesOf('999'), 0);
    assert.deepEqual(parse('festival', ['社团招新', '开幕！']), { type: 'festival', title: '社团招新', sub: '开幕！' });
    assert.deepEqual(parse('graduate', []), { type: 'graduate', text: '' });
    assert.deepEqual(parse('button', ['林小雨']), { type: 'button', who: '林小雨' });
});

test('gate:campus-fx tags are recognised by the fx directive parser', () => {
    const text = '[igs-fx:chalk|期末加油]\n正文\n[igs-fx:button|小雨]';
    const fx = resolveFxAtPage(extractFxDirectives(text), text.length, -1);
    assert.deepEqual(fx.daily.map((d) => d.type), ['chalk', 'button']);
});

test('gate:campus-fx kinds are opt-in, labelled, styled, modern-only and have builders', () => {
    for (const kind of CAMPUS_FX_KINDS) {
        assert.ok(DAILY_FX_KINDS.includes(kind), kind);
        assert.ok(DAILY_FX_LABELS[kind], kind);
        assert.ok(DAILY_FX_STYLE_TEXT.includes(`igs-dfx-${kind}`), kind);
        assert.equal(typeof CAMPUS_BUILDERS[kind], 'function', kind);
        assert.equal(normalizeDailyFxSettings({ enabled: true })[kind], false, `${kind} stays opt-in`);
        const all = { dailyFx: { enabled: true, [kind]: true } };
        assert.equal(applyFxWorldview(all, 'ancient').dailyFx[kind], false);
        assert.equal(applyFxWorldview(all, 'fantasy').dailyFx[kind], false);
        assert.equal(applyFxWorldview(all, 'modern').dailyFx[kind], true);
        assert.equal(applyFxWorldview(all, 'magic').dailyFx[kind], true);
    }
    assert.doesNotMatch(CAMPUS_FX_STYLE_TEXT, /filter:\s*blur|backdrop-filter|mix-blend-mode/);
});

test('gate:campus-fx prompts: full and short lines exist for every kind and the kinds leave the daily block', () => {
    const settings = ON.dailyFx;
    assert.deepEqual(enabledDailyFxKinds(settings).filter((k) => CAMPUS_FX_KINDS.includes(k)), [...CAMPUS_FX_KINDS]);
    const short = campusGrammarLines(settings);
    assert.equal(short.length, CAMPUS_FX_KINDS.length);
    const full = campusDetailedBlock(settings);
    for (const kind of CAMPUS_FX_KINDS) {
        assert.ok(DAILY_GRAMMAR_LINES[kind].startsWith(`${kind}|`) || DAILY_GRAMMAR_LINES[kind].startsWith(`${kind}：`), kind);
        assert.ok(full.includes(`[igs-fx:${kind}`), kind);
    }
    // 校园类不占每轮必发的日常块。
    assert.doesNotMatch(resolveDailyFxPromptRule(settings), /igs-fx:chalk|igs-fx:exam/);
    const blocks = collectGrammarBlocks(ON);
    assert.ok(blocks.some((b) => b.key === 'campus' && b.adaptive), 'campus block registered');
});

test('gate:campus-fx triggers on school words only', () => {
    assert.ok(detectPromptTriggers({ userText: '她在黑板上写下了名字' }).has('campus'));
    assert.ok(detectPromptTriggers({ userText: '期末考试开始了' }).has('campus'));
    assert.ok(detectPromptTriggers({ recentAiTexts: ['[igs-fx:drawer|情书]'] }).has('campus'));
    assert.ok(!detectPromptTriggers({ userText: '今天天气不错' }).has('campus'));
    for (const words of Object.values(CAMPUS_TRIGGER_WORDS)) assert.ok(words.length >= 3);
});

test('gate:campus-fx ambience resolves school places, defers bare rooftops to the date layer', () => {
    assert.deepEqual(resolveCampusAmbience('二年级的教室'), { kind: 'classroom', variant: '' });
    assert.deepEqual(resolveCampusAmbience('文艺部社团教室'), { kind: 'classroom', variant: 'club' });
    assert.deepEqual(resolveCampusAmbience('学校图书馆'), { kind: 'library', variant: '' });
    assert.deepEqual(resolveCampusAmbience('自习室'), { kind: 'library', variant: '' });
    assert.deepEqual(resolveCampusAmbience('学校操场'), { kind: 'playground', variant: '' });
    assert.deepEqual(resolveCampusAmbience('教学楼天台'), { kind: 'rooftop', variant: '' });
    assert.deepEqual(resolveCampusAmbience('樱花校门口'), { kind: 'campusgate', variant: '' });
    // 单独的天台仍是约会夜景；上班族的屋顶不是学校。
    assert.equal(resolveCampusAmbience('大厦天台'), null);
    assert.equal(resolveCampusAmbience('公司上班的屋顶花园'), null);
    assert.deepEqual(resolveDateAmbience('大厦天台'), { kind: 'nightview', variant: '' });
    // 古代与西幻没有现代校园，魔法学院照常。
    assert.equal(resolveCampusAmbience('教室', { worldview: 'ancient' }), null);
    assert.equal(resolveCampusAmbience('教室', { worldview: 'fantasy' }), null);
    assert.deepEqual(resolveCampusAmbience('魔法学院的教室', { worldview: 'magic' }), { kind: 'classroom', variant: '' });
    for (const kind of CAMPUS_AMBIENCE_KINDS) assert.ok(CAMPUS_AMBIENCE_HTML[kind].includes('igs-dfx-amb-'), kind);
    for (const cls of ['sunbeam', 'chalkdust', 'libwindow', 'libmote', 'fieldsun', 'fence', 'fencelight', 'gatepetals']) {
        assert.ok(DAILY_FX_STYLE_TEXT.includes(`igs-dfx-amb-${cls}`), cls);
    }
});

test('gate:campus-fx ambient audio plan for classroom, library, playground and rooftop', () => {
    const plan = (location) => resolveAmbientPlan({ location }, { enabled: true }).map((l) => l.kind);
    assert.ok(plan('教室').includes('classroom'));
    assert.ok(plan('学校图书馆').includes('library'));
    assert.ok(plan('学校操场').includes('playground'));
    assert.ok(plan('学校天台').includes('nightview'));
    assert.ok(!plan('教室').includes('library'));
});

test('gate:campus-fx sfx have full envelopes, noise or inharmonic partials and modest gain', () => {
    const kinds = ['campus-chalk', 'campus-pass', 'campus-drawer', 'campus-rollcall', 'campus-exam', 'campus-festival', 'campus-graduate', 'campus-button'];
    for (const kind of kinds) {
        const { partials, noise } = DAILY_SFX[kind];
        assert.ok(noise.length > 0, `${kind} needs noise`);
        for (const q of [...partials, ...noise]) {
            assert.ok(q.gain > 0 && q.gain <= 0.7, `${kind} gain ${q.gain}`);
            assert.ok(q.attack > 0, `${kind} attack`);
            assert.notEqual(q.env, 'flat', `${kind} must not ramp to 0`);
            assert.ok(q.start >= 0 && q.duration > 0, `${kind} timing`);
        }
        // 钟音类至少带一个非整数倍的泛音，不是单一正弦 beep。
        const sines = partials.filter((q) => q.wave === 'sine');
        if (sines.length > 4) assert.ok(sines.some((q) => !Number.isInteger(q.from / sines[0].from)), `${kind} inharmonic`);
    }
    // 粉笔是一串长短不一的刮擦。
    const strokes = DAILY_SFX['campus-chalk'].noise.filter((q) => q.filter === 'highpass');
    assert.ok(strokes.length >= 8);
    assert.ok(new Set(strokes.map((q) => q.duration.toFixed(3))).size >= 6);
    // 毕业典礼的掌声是很多个零散的短拍击。
    assert.ok(DAILY_SFX['campus-graduate'].noise.length >= 40);
});

test('gate:campus-fx builders produce the right nodes, sounds and escape text', () => {
    const env = { doc, hold: 1 };
    const chalk = CAMPUS_BUILDERS.chalk({ text: '<b>期末</b>加油' }, env);
    assert.deepEqual(chalk.sounds, ['campus-chalk']);
    assert.match(chalk.node.innerHTML, /--igs-n:\d+/);
    assert.doesNotMatch(chalk.node.innerHTML, /<b>期末/);
    assert.match(CAMPUS_BUILDERS.chalk({ text: '' }, env).node.innerHTML, /chalk-scribble/);
    assert.match(CAMPUS_BUILDERS.passnote({ text: '放学见' }, env).node.innerHTML, /放学见/);
    assert.match(CAMPUS_BUILDERS.drawer({ item: '情书' }, env).node.className, /is-letter/);
    assert.match(CAMPUS_BUILDERS.drawer({ item: '巧克力' }, env).node.className, /is-gift/);
    assert.match(CAMPUS_BUILDERS.rollcall({ who: '小雨', reply: '到' }, env).node.innerHTML, /小雨[\s\S]*到/);
    assert.match(CAMPUS_BUILDERS.exam({ subject: '数学', minutes: 90 }, env).node.innerHTML, /限时 90 分钟/);
    assert.doesNotMatch(CAMPUS_BUILDERS.exam({ subject: '', minutes: 0 }, env).node.innerHTML, /限时/);
    assert.equal((CAMPUS_BUILDERS.festival({ title: '', sub: '' }, env).node.innerHTML.match(/igs-dfx-festival-conf[ "]/g) || []).length, 34);
    assert.match(CAMPUS_BUILDERS.graduate({ text: '毕业典礼' }, env).node.innerHTML, /graduate-cap/);
    const enroll = CAMPUS_BUILDERS.graduate({ text: '入学典礼' }, env);
    assert.doesNotMatch(enroll.node.innerHTML, /graduate-cap/);
    assert.match(enroll.node.className, /is-enroll/);
    assert.match(CAMPUS_BUILDERS.button({ who: '小雨' }, env).node.innerHTML, /给 小雨/);
    for (const kind of CAMPUS_FX_KINDS) {
        const built = CAMPUS_BUILDERS[kind]({}, env);
        assert.equal(built.layer, 'front');
        assert.ok(built.life >= 3000, kind);
        for (const sound of built.sounds) assert.ok(DAILY_SFX[sound], `${kind} sound ${sound}`);
    }
});
