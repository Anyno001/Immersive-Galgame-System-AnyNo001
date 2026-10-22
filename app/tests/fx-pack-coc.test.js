// 先加载 scene-audio：其他包清单经 chat-sfx 回引 scene-audio，按此顺序才不会读到暂存死区。
import '../src/visual/igs-ui/scene-audio.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { getPack, packFxOf, parsePackFxBody, packOfKind, validatePacks, FX_PACKS } from '../src/scene/fx-packs.js';
import { normalizeDailyFxSettings } from '../src/visual/igs-ui/fx-daily-model.js';
import { PACK } from '../src/visual/igs-ui/fx-pack-coc.js';
import { COC_BUILDERS } from '../src/visual/igs-ui/fx-pack-coc-build.js';
import { COC_KINDS, parseBoardLinks, resolveCocAmbience } from '../src/visual/igs-ui/fx-pack-coc-model.js';
import { COC_SFX_DEFS } from '../src/visual/igs-ui/fx-pack-coc-sfx.js';
import { makeStage } from './helpers/fake-dom.js';

const SAMPLES = {
    san: ['55', '-8'],
    symptom: ['恐惧症', '看见墙在呼吸', '重'],
    clue: ['带血的怀表', '停在三点十分'],
    casebook: ['怀表;脚印;遗书', '新增:1', '失踪案'],
    kp: ['你推开了地下室的门。', 'KP'],
    ending: ['撕卡', '林默', '被深潜者拖入水中'],
    dungeon: ['新副本', '存活到天亮;不要回头', '限时 72 小时'],
    portal: ['雾港小镇', '第一幕'],
    rating: ['S', '击杀:12;探索度:87', '副本结算'],
    alive: ['3', '8'],
    rules: ['不要照镜子;夜里别开窗;听到敲门不要应答', '篡改:2', '违规:3'],
    board: ['怀表;管家;遗书;脚印', '连线:1-2,2-3', '庄园案'],
    magnify: ['', '手', '指甲缝里有泥'],
    accuse: ['管家', '凶手就是你！'],
    stats: ['林默', 'STR:60;CON:55;SIZ:70;DEX:65;APP:50;INT:80;POW:45;EDU:75', '对比:STR:50;INT:70', '条:HP:12/14;SAN:55/99'],
};

function env(extra = {}) {
    const root = makeStage();
    return { root, doc: root.ownerDocument, reduced: false, hold: 1, ancient: false, worldview: 'modern', speaker: '', play() {}, ...extra };
}

function htmlOf(node) {
    return `${node.className} ${node.innerHTML}${node.children.map(htmlOf).join('')}`;
}

function built(kind, extra) {
    const args = parsePackFxBody(kind, SAMPLES[kind]);
    assert.ok(args, `${kind} parses`);
    const item = packFxOf(args);
    return COC_BUILDERS[kind](item, env(extra));
}

test('gate: coc pack registers every kind with label, trigger, prompt and builder, default off', () => {
    const pack = getPack('coc');
    assert.deepEqual([...pack.kinds], [...COC_KINDS]);
    assert.equal(PACK.era, null);
    for (const kind of COC_KINDS) {
        assert.ok(pack.labels[kind], `${kind} label`);
        const words = pack.triggers[kind];
        assert.ok(words.length >= 2 && words.length <= 4, `${kind} trigger words`);
        assert.ok(pack.promptLines[kind].startsWith(`[igs-fx:${kind}|`), `${kind} prompt line`);
        assert.equal(typeof pack.builders[kind], 'function');
        assert.equal(packOfKind(kind).id, 'coc', `${kind} owned by coc`);
        assert.ok(SAMPLES[kind], `${kind} has a test sample`);
    }
    assert.deepEqual(validatePacks(FX_PACKS).filter((line) => line.startsWith('coc')), []);
    const settings = normalizeDailyFxSettings({ enabled: true });
    for (const kind of COC_KINDS) assert.equal(settings[kind], false, kind);
    assert.equal(settings.packCoc, false);
});

test('gate: coc pack parses fields into items', () => {
    const item = (kind, fields) => packFxOf(parsePackFxBody(kind, fields));
    assert.deepEqual(item('san', ['55', '-8']), { type: 'san', value: 55, delta: -8, label: 'SAN', max: null });
    assert.equal(item('san', ['HP 9', '-3', 'HP', '12']).max, 12);
    assert.equal(parsePackFxBody('san', ['很低']), null);
    assert.equal(item('symptom', ['恐惧症', '', '重']).level, 'heavy');
    assert.equal(item('symptom', ['恐惧症']).level, 'medium');
    assert.equal(parsePackFxBody('clue', []), null);
    assert.deepEqual(item('casebook', ['A;B;C', '新增:2', '标题:案卷']), { type: 'casebook', items: ['A', 'B', 'C'], fresh: 2, title: '案卷' });
    assert.equal(item('kp', ['开门', 'dm']).role, 'DM');
    assert.equal(item('ending', ['团灭', '', '']).mode, 'wipe');
    assert.deepEqual([item('ending', ['撕卡', '林默', '溺亡']).name, item('ending', ['林默', '溺亡']).mode], ['林默', 'tear']);
    assert.deepEqual(item('rules', ['a;b;c', '篡改:2', '违规:3']).tamper, [2]);
    assert.deepEqual(item('rules', ['a;b;c', '违规:3,9']).violate, [3]);
    assert.deepEqual(item('board', ['x;y;z', '连线:1-3']).links, [[0, 2]]);
    assert.deepEqual(parseBoardLinks('1-2, 2-9, 3-3', 3), [[0, 1]]);
    assert.equal(item('magnify', ['A', '嘴唇']).region, 'lip');
    assert.equal(item('accuse', ['管家']).line, '就是你！');
    assert.equal(item('rating', ['s', '击杀:12']).tier, 's');
    assert.equal(item('alive', ['3', '8']).total, 8);
    assert.equal(item('alive', ['5', '3']).total, null);
});

test('gate: coc builders return static nodes under reduced motion and scale life by hold', () => {
    for (const kind of COC_KINDS) {
        const normal = built(kind);
        const still = built(kind, { reduced: true });
        const long = built(kind, { hold: 2 });
        assert.ok(['front', 'stage'].includes(still.layer), kind);
        assert.ok(htmlOf(still.node).length > 0, `${kind} renders content`);
        assert.ok(still.node.className.includes('igs-coc'), kind);
        assert.ok(still.life > 0 && long.life > normal.life, `${kind} life scales with hold`);
        for (const sound of still.sounds) assert.ok(Object.hasOwn(COC_SFX_DEFS, sound), `${kind} sound ${sound}`);
    }
    assert.doesNotMatch(htmlOf(built('kp', { reduced: true }).node), /animation-delay/);
});

test('gate: coc rules cover tampered lines with a solid block and mark violations', () => {
    const html = htmlOf(built('rules').node);
    assert.equal((html.match(/igs-coc-smear/g) || []).length, 1);
    assert.match(html, /<li class="is-tamper"[^>]*><b>2<\/b>/);
    assert.match(html, /<li class="is-violate"[^>]*><b>3<\/b>/);
    assert.match(html, /<li class=""[^>]*><b>1<\/b>/);
});

test('gate: coc board draws a thread for every link and falls back to a chain', () => {
    assert.equal((htmlOf(built('board').node).match(/<path /g) || []).length, 2);
    const chain = COC_BUILDERS.board({ type: 'board', items: ['a', 'b', 'c'], links: [], title: '' }, env());
    assert.equal((htmlOf(chain.node).match(/<path /g) || []).length, 2);
});

test('gate: coc skins follow worldview without adding an era', () => {
    assert.match(built('clue', { worldview: 'horror' }).node.className, /is-horror/);
    assert.match(built('clue', { ancient: true }).node.className, /is-ancient/);
    assert.match(built('clue').node.className, /is-modern/);
    assert.match(htmlOf(built("symptom", { worldview: "horror" }).node), /is-horror/);
    assert.match(htmlOf(built('symptom', { ancient: true }).node), /is-ancient/);
});

test('gate: coc ambience resolves three places and retro variant for taisho', () => {
    assert.deepEqual(resolveCocAmbience('主神空间'), { kind: 'zonehub', variant: '' });
    assert.deepEqual(resolveCocAmbience('雾港小镇的码头', 'taisho'), { kind: 'fogport', variant: 'retro' });
    assert.equal(resolveCocAmbience('警戒线外').kind, 'cordon');
    assert.equal(resolveCocAmbience('教室'), null);
    for (const kind of Object.keys(PACK.ambience.html)) assert.ok(PACK.ambience.html[kind].length > 0, kind);
    assert.deepEqual([...PACK.ambience.still], ['zonehub']);
});

test('gate: coc registers the haze state with aliases and a safe filter', () => {
    assert.ok(PACK.states.haze.aliases.length >= 2);
    assert.match(PACK.states.haze.filter, /^[a-z0-9(). %,-]+$/i);
    assert.match(PACK.states.haze.edge, /^#[0-9a-f]{6}$/i);
    assert.match(PACK.cssText, /data-igs-fx-state="haze"/);
});

const statsItem = (fields) => packFxOf(parsePackFxBody('stats', fields));
const countOf = (html, re) => (html.match(re) || []).length;

test('gate: coc stats parses the eight COC axes and the six DND axes', () => {
    const coc = statsItem(SAMPLES.stats);
    assert.equal(coc.rule, 'coc');
    assert.deepEqual(coc.axes.map((r) => r.key), ['STR', 'CON', 'SIZ', 'DEX', 'APP', 'INT', 'POW', 'EDU']);
    assert.equal(coc.axes[0].prev, 50);
    assert.deepEqual(coc.vitals.map((v) => [v.key, v.cur, v.max]), [['HP', 12, 14], ['SAN', 55, 99]]);
    const dnd = statsItem(['力量 16(+3);敏捷 12(+1);体质 14(+2);智力 10;感知 13;魅力 8(-1)', '条:HP:24/30;AC:15;LV:5']);
    assert.equal(dnd.rule, 'dnd');
    assert.deepEqual(dnd.axes.map((r) => r.key), ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);
    assert.deepEqual(dnd.axes.map((r) => r.mod), [3, 1, 2, null, null, -1]);
    assert.equal(statsItem(['STR 10;DEX 12;CON 14', '规则:dnd']).rule, 'dnd');
    assert.equal(parsePackFxBody('stats', ['x', 'STR:60;CON:55']), null);
});

test('gate: coc stats radar adapts polygon vertices to the axis count', () => {
    for (const n of [3, 6, 8, 10]) {
        const list = Array.from({ length: n }, (_, i) => `${String.fromCharCode(65 + i)}${String.fromCharCode(65 + i)}:${40 + i}`).join(';');
        const html = htmlOf(COC_BUILDERS.stats(statsItem(['', list]), env()).node);
        assert.equal(countOf(html, /<line class="igs-coc-st-spoke"/g), n, `${n} spokes`);
        const line = html.match(/<polygon class="igs-coc-st-line"[^>]*points="([^"]+)"/);
        assert.equal(line[1].trim().split(' ').length, n, `${n} vertices`);
    }
});

test('gate: coc stats compare mode draws the old polygon and signed deltas', () => {
    const withPrev = htmlOf(COC_BUILDERS.stats(statsItem(SAMPLES.stats), env()).node);
    assert.equal(countOf(withPrev, /igs-coc-st-old/g), 1);
    assert.ok(/igs-coc-st-d is-up"[^>]*>[+]10/.test(withPrev));
    const plain = htmlOf(COC_BUILDERS.stats(statsItem(['', 'STR:60;CON:55;DEX:70']), env()).node);
    assert.equal(countOf(plain, /igs-coc-st-old/g), 0);
});

test('gate: coc stats keeps every value visible under reduced motion and uses a parchment skin for DND', () => {
    const still = COC_BUILDERS.stats(statsItem(SAMPLES.stats), env({ reduced: true }));
    const html = htmlOf(still.node);
    assert.match(still.node.className, /is-reduced/);
    for (const v of [60, 55, 70, 65, 50, 80, 45, 75]) assert.match(html, new RegExp(`data-to="${v}"[^>]*>${v}<`));
    assert.match(html, /HP/);
    const dnd = htmlOf(COC_BUILDERS.stats(statsItem(['力量 16(+3);敏捷 12;体质 14', '条:HP:24/30;AC:15']), env({ reduced: true })).node);
    assert.match(dnd, /igs-coc-st-card is-dnd/);
    assert.ok(dnd.includes('+3'));
    assert.match(dnd, /AC/);
});
