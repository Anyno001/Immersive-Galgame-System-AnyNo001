import test from 'node:test';
import assert from 'node:assert/strict';
import { MYTH_BUILDERS, FORMATION_LAYOUTS, formationLayoutOf, sealToneOf } from '../src/visual/igs-ui/fx-myth.js';
import { MYTH_PROMPT_LINES, mythFxOf, parseMythBody } from '../src/visual/igs-ui/fx-myth-model.js';
import { MYTH_STYLE_TEXT } from '../src/visual/igs-ui/fx-myth-style.js';
import { extractFxDirectives, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { confirmedCreatureOf } from '../src/scene/creature-profile.js';
import { makeStage, makeTimers } from './helpers/fake-dom.js';

const envOf = (extra = {}) => {
    const root = makeStage({ waapi: true });
    return { root, doc: root.ownerDocument, layers: { motion: root.querySelector('#igs-stage-motion') }, reduced: false, hold: 1, worldview: '', speaker: '', creatureOf: null, ...extra };
};

const SUBDUE_MODES = ['talisman', 'bowl', 'gourd', 'chain'];

test('封印类演出不再画几何线稿：法阵、结界、降妖构建结果里没有 SVG，样式里没有无限循环', () => {
    const built = [
        ...['open', 'enter', 'break'].map((mode) => MYTH_BUILDERS.formation({ name: '九宫阵', mode }, envOf())),
        ...['open', 'break'].map((mode) => MYTH_BUILDERS.barrier({ mode }, envOf())),
        ...SUBDUE_MODES.map((mode) => MYTH_BUILDERS.subdue({ mode, who: '小林' }, envOf())),
    ];
    for (const item of built) {
        assert.ok(item && item.node && item.life > 0);
        assert.doesNotMatch(item.node.innerHTML, /<svg(?![^>]*igs-fx-svg)|igs-myth-line|igs-myth-shard|igs-myth-chain|igs-myth-vortex|igs-myth-ring/);
        assert.ok(item.node.innerHTML.split('<i ').length - 1 <= 12, '新增节点不超过 12 个');
    }
    const sealRules = MYTH_STYLE_TEXT.split('\n').filter((line) => /igs-myth-(sheet|ground|halo|gglow|rise|cone|corner|band|edge|dometint|throw|slip|mark)/.test(line));
    assert.ok(sealRules.length > 10);
    assert.doesNotMatch(sealRules.join('\n'), /infinite/);
    assert.doesNotMatch(MYTH_STYLE_TEXT, /igs-myth-vortex/);
});

test('血契印记换成漫画印记，不再是线稿圆环三角', () => {
    const item = MYTH_BUILDERS.pact({ a: '小林', b: '小雪' }, envOf());
    assert.equal(item.node.innerHTML.split('igs-myth-mark').length - 1, 2);
    assert.match(item.node.innerHTML, /igs-fx-sigil-ring/);
    assert.doesNotMatch(item.node.innerHTML, /polygon|igs-myth-seal/);
});

test('法阵是地面上的大片光幕：四种阵型各三层光幕、同名阵每次同一阵型，样式里贴地透视且不再有光点', () => {
    for (const key of ['ring', 'bagua', 'qixing', 'square']) assert.equal(FORMATION_LAYOUTS[key].length, 3, key);
    assert.equal(formationLayoutOf('八卦阵'), 'bagua');
    assert.equal(formationLayoutOf('北斗阵'), 'qixing');
    assert.equal(formationLayoutOf('九宫阵'), 'square');
    assert.ok(Object.hasOwn(FORMATION_LAYOUTS, formationLayoutOf('锁灵')));
    assert.equal(formationLayoutOf('锁灵'), formationLayoutOf('锁灵'));
    for (const [name, key] of [['锁灵', formationLayoutOf('锁灵')], ['八卦阵', 'bagua'], ['北斗阵', 'qixing'], ['九宫阵', 'square']]) {
        const html = MYTH_BUILDERS.formation({ name, mode: 'open' }, envOf()).node.innerHTML;
        assert.equal(html.split('igs-myth-sheet"').length - 1, 3, name);
        assert.match(html, new RegExp(`igs-myth-ground is-${key}`));
        assert.doesNotMatch(html, /igs-myth-orb|igs-myth-aur/);
    }
    assert.match(MYTH_STYLE_TEXT, /\.igs-myth-ground\{[^}]*perspective\([^}]*rotateX\(/);
    for (const key of ['ring', 'bagua', 'qixing', 'square']) assert.ok(MYTH_STYLE_TEXT.includes(`.is-${key} .igs-myth-sheet:nth-child(3)`), key);
});

test('光色参数：带与不带都能解析，阵名含「血」兜底为赤', () => {
    assert.deepEqual(parseMythBody('formation', ['血月阵', '展开', '青']), ['formation', '血月阵', 'open', 'azure']);
    assert.deepEqual(parseMythBody('formation', ['血月阵', '展开']), ['formation', '血月阵', 'open', '']);
    assert.deepEqual(parseMythBody('barrier', ['展开', '赤']), ['barrier', 'open', 'crimson']);
    assert.deepEqual(parseMythBody('barrier', ['破碎']), ['barrier', 'break', '']);
    assert.deepEqual(parseMythBody('subdue', ['金钵', '小林', '紫']), ['subdue', 'bowl', '小林', 'violet']);
    assert.deepEqual(parseMythBody('subdue', ['小林']), ['subdue', 'talisman', '小林', '']);
    assert.equal(mythFxOf(['formation', '血月阵', 'open', 'azure']).tone, 'azure');
    assert.equal(mythFxOf(['barrier', 'open', 'crimson']).tone, 'crimson');
    assert.equal(mythFxOf(['subdue', 'bowl', '小林', 'violet']).tone, 'violet');
    assert.equal(sealToneOf('formation', { name: '血月阵', mode: 'open', tone: '' }, {}), 'crimson');
    assert.equal(sealToneOf('formation', { name: '血月阵', mode: 'open', tone: 'azure' }, {}), 'azure');
    assert.equal(sealToneOf('formation', { name: '九宫阵', mode: 'open', tone: '' }, {}), 'gold');
    assert.equal(sealToneOf('formation', { name: '九宫阵', mode: 'enter', tone: '' }, {}), 'violet');
    assert.equal(sealToneOf('formation', { name: '九宫阵', mode: 'open', tone: '' }, { worldview: 'magic' }), 'azure');
    assert.equal(sealToneOf('barrier', { mode: 'open', tone: '' }, {}), 'azure');
    assert.equal(sealToneOf('subdue', { mode: 'chain', tone: '' }, {}), 'gold');
    for (const kind of ['formation', 'barrier', 'subdue']) assert.match(MYTH_PROMPT_LINES[kind], /光色/);
    const text = '[igs-fx:formation|血色大阵|展开|赤]a[igs-fx:barrier|展开]b[igs-fx:subdue|锁链|小林|青]c';
    const list = extractFxDirectives(text);
    const daily = resolveFxAtPage(list, text.length, -1).daily;
    assert.equal(daily.length, 3);
    assert.equal(daily[0].tone, 'crimson');
    assert.equal(daily[1].tone, '');
    assert.equal(daily[2].tone, 'azure');
    const html = MYTH_BUILDERS.formation(daily[0], envOf()).node;
    assert.match(html.className, /is-crimson/);
});

test('非人角色收服：四种法器都仍然调用吸入动画，立绘被吸入后保持到翻页', async () => {
    const { renderDailyFx } = await import('../src/visual/igs-ui/fx-daily.js');
    const dna = { 野猪: { creature: { form: 'beast', size: 'medium', anchor: 'ground' } } };
    assert.ok(confirmedCreatureOf(dna.野猪));
    for (const mode of SUBDUE_MODES) {
        const root = makeStage({ waapi: true });
        const sprite = root.querySelector('#igs-sprite');
        sprite.style.backgroundImage = 'url("boar.png")';
        const timers = makeTimers();
        const snapshot = {
            messageId: `m-${mode}`,
            readerSettings: { dailyFx: { enabled: true, packMyth: true, subdue: true }, _sceneAssets: { enabled: true, characterDna: dna }, fxSound: { enabled: false, volume: 0 } },
            content: { spriteCharacter: '野猪', speaker: '野猪', currentIndex: 0, fx: { daily: [{ type: 'subdue', mode, who: '野猪' }] } },
        };
        renderDailyFx(root, snapshot, { reducedMotion: false, schedule: timers.schedule, clear: timers.clear, playSfx: () => {} });
        const held = (sprite.animations || []).filter((a) => a.options && a.options.fill === 'forwards');
        assert.ok(held.length >= 1, `${mode} 吸入动画`);
    }
});
