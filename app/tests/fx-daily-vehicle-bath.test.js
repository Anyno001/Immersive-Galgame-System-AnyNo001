import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyFxOf, parseDailyFxBody } from '../src/scene/daily-fx-directives.js';
import { resolvePlaceAmbience } from '../src/scene/place-ambience.js';
import { applyFxEra, applyFxWorldview } from '../src/scene/fx-era.js';
import { normalizeDailyFxSettings } from '../src/visual/igs-ui/fx-daily-model.js';
import { DAILY_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-daily-style.js';
import { cancelDailyFx, renderDailyFx } from '../src/visual/igs-ui/fx-daily.js';
import { resolveAmbientPlan } from '../src/visual/igs-ui/scene-audio.js';
import { makeStage, makeTimers } from './helpers/fake-dom.js';

const KINDS = ['brake', 'depart', 'arrive', 'ticket', 'steam', 'shower', 'splash', 'hairdry'];

test('gate:fx-daily-vehicle-bath parse: optional fields, ticket single field is the destination', () => {
    assert.deepEqual(dailyFxOf(parseDailyFxBody('brake', [])), { type: 'brake' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('depart', [])), { type: 'depart', to: '' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('arrive', ['涩谷'])), { type: 'arrive', station: '涩谷' });
    assert.equal(parseDailyFxBody('ticket', []), null);
    assert.deepEqual(dailyFxOf(parseDailyFxBody('ticket', ['京都'])), { type: 'ticket', from: '', to: '京都', note: '' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('ticket', ['东京', '京都', '7车12A'])), { type: 'ticket', from: '东京', to: '京都', note: '7车12A' });
    for (const kind of ['steam', 'shower', 'splash']) assert.deepEqual(dailyFxOf(parseDailyFxBody(kind, [])), { type: kind });
});

test('gate:fx-daily-vehicle-bath kinds are opt-in and styled; ambience defaults on', () => {
    const legacy = normalizeDailyFxSettings({ enabled: true });
    for (const kind of KINDS) {
        assert.equal(legacy[kind], false, kind);
        assert.ok(DAILY_FX_STYLE_TEXT.includes(`igs-dfx-${kind}`), kind);
    }
    assert.equal(legacy.ambience, true);
    assert.equal(normalizeDailyFxSettings({ ambience: false }).ambience, false);
});

test('gate:fx-daily-vehicle-bath era: no tickets, showers or hair dryers before modern times', () => {
    const all = { dailyFx: { enabled: true, ...Object.fromEntries(KINDS.map((k) => [k, true])) } };
    const ancient = applyFxEra(all, true).dailyFx;
    for (const kind of ['ticket', 'shower', 'hairdry']) assert.equal(ancient[kind], false, kind);
    for (const kind of ['brake', 'depart', 'arrive', 'steam', 'splash']) assert.equal(ancient[kind], true, kind);
    assert.equal(applyFxWorldview(all, 'magic').dailyFx.hairdry, false);
    assert.equal(applyFxWorldview(all, 'magic').dailyFx.ticket, true);
    assert.equal(applyFxWorldview(all, 'taisho').dailyFx.ticket, true);
});

test('gate:fx-daily-vehicle-bath place words: vehicles, baths and false friends', () => {
    assert.deepEqual(resolvePlaceAmbience('地铁车厢'), { kind: 'train', variant: 'subway' });
    assert.deepEqual(resolvePlaceAmbience('新干线'), { kind: 'train', variant: '' });
    assert.deepEqual(resolvePlaceAmbience('出租车后座'), { kind: 'car', variant: '' });
    assert.deepEqual(resolvePlaceAmbience('马车车厢'), { kind: 'carriage', variant: '' });
    assert.deepEqual(resolvePlaceAmbience('车里', { worldview: 'ancient' }), { kind: 'carriage', variant: '' });
    assert.deepEqual(resolvePlaceAmbience('列车', { worldview: 'fantasy' }), { kind: 'carriage', variant: '' });
    assert.deepEqual(resolvePlaceAmbience('游轮甲板'), { kind: 'ship', variant: '' });
    assert.deepEqual(resolvePlaceAmbience('游轮上的浴场'), { kind: 'bath', variant: '' });
    assert.deepEqual(resolvePlaceAmbience('露天温泉'), { kind: 'bath', variant: 'onsen' });
    assert.deepEqual(resolvePlaceAmbience('宿舍淋浴间'), { kind: 'bath', variant: 'shower' });
    for (const place of ['温泉街', '海水浴场', '车站', '停车场', '船坞', '浴衣店', '摩天轮', '']) assert.equal(resolvePlaceAmbience(place), null, place);
});

test('gate:fx-daily-vehicle-bath ambient sound follows the same place table', () => {
    const on = { enabled: true };
    const kinds = (location, extra = {}) => resolveAmbientPlan({ location, ...extra }, on).map((l) => l.kind);
    assert.ok(kinds('出租车后座').includes('car'));
    assert.ok(kinds('马车里').includes('carriage'));
    assert.ok(kinds('车里', { worldview: 'ancient' }).includes('carriage'));
    assert.ok(kinds('地铁车厢').includes('train'));
    assert.ok(kinds('甲板').includes('ship'));
    const bath = resolveAmbientPlan({ location: '浴室淋浴间' }, on).find((l) => l.kind === 'bath');
    assert.equal(bath.variant, 'shower');
    assert.equal(kinds('出租车后座', {}).includes('bath'), false);
    assert.equal(resolveAmbientPlan({ location: '出租车' }, { enabled: true, car: false }).some((l) => l.kind === 'car'), false);
});

function render(content, { readerSettings = {}, root = makeStage({ waapi: true }), timers = makeTimers(), reducedMotion = false } = {}) {
    const sounds = [];
    const result = renderDailyFx(root, {
        messageId: 7,
        readerSettings: { dailyFx: { enabled: true, petals: false, ...Object.fromEntries([...KINDS, 'dive', 'bubble', 'vacuum'].map((k) => [k, true])) }, ...readerSettings },
        content: { currentIndex: 0, ...content },
    }, { schedule: timers.schedule, clear: timers.clear, reducedMotion, playSfx: (k) => sounds.push(k) });
    return { root, result, sounds, timers };
}

const ambienceOf = (root) => root.querySelector('#igs-fx-stage').children.find((n) => String(n.className).includes('igs-dfx-amb'));

test('gate:fx-daily-vehicle-bath sounds and words follow the vehicle in the scene', () => {
    const train = render({ sceneLocation: '电车车厢', fx: { daily: [{ type: 'brake' }, { type: 'arrive', station: '<b>涩谷</b>' }] } });
    assert.deepEqual(train.sounds, ['screech', 'arrive-chime']);
    const board = train.root.querySelector('#igs-fx-front').children[0];
    assert.match(board.className, /is-train/);
    assert.doesNotMatch(board.innerHTML, /<b>涩谷/);
    assert.ok(train.root.querySelector('#igs-sprite').animations.length, 'sprite jolts on brake');
    cancelDailyFx(train.root);
    const carriage = render({ sceneLocation: '马车里', fx: { daily: [{ type: 'brake' }, { type: 'depart', to: '长安' }] } });
    assert.deepEqual(carriage.sounds, ['rein', 'giddyup']);
    assert.match(carriage.root.querySelector('#igs-fx-stage').children.map((n) => n.innerHTML).join(''), /吁——[\s\S]*启程/);
    cancelDailyFx(carriage.root);
    // 认不出地点时：古代按马车，现代按汽车。
    assert.deepEqual(render({ fx: { daily: [{ type: 'depart', to: '' }] } }, { readerSettings: { _ancientEra: true } }).sounds, ['giddyup']);
    assert.deepEqual(render({ fx: { daily: [{ type: 'depart', to: '' }] } }).sounds, ['engine']);
});

test('gate:fx-daily-vehicle-bath ticket label and reduced motion skips sprite jolt', () => {
    const plane = render({ fx: { daily: [{ type: 'ticket', from: '成田机场', to: '那霸', note: 'JL901' }] } });
    assert.match(plane.root.querySelector('#igs-fx-front').children[0].innerHTML, /登机牌/);
    assert.deepEqual(plane.sounds, ['punch']);
    const ship = render({ sceneLocation: '渡轮', fx: { daily: [{ type: 'ticket', from: '', to: '小豆岛', note: '' }] } });
    assert.match(ship.root.querySelector('#igs-fx-front').children[0].innerHTML, /船票/);
    const calm = render({ sceneLocation: '出租车', fx: { daily: [{ type: 'brake' }] } }, { reducedMotion: true });
    assert.equal((calm.root.querySelector('#igs-sprite').animations || []).length, 0);
    assert.deepEqual(calm.result.played, ['brake']);
});

test('gate:fx-daily-vehicle-bath ambience layer persists across pages and swaps on location change', () => {
    const root = makeStage();
    const timers = makeTimers();
    const first = render({ sceneLocation: '夜里的出租车', sceneTime: '深夜' }, { root, timers });
    assert.equal(first.result.ambience, 'car');
    const node = ambienceOf(root);
    assert.match(node.className, /is-car/);
    assert.match(node.className, /is-night/);
    render({ sceneLocation: '夜里的出租车', sceneTime: '深夜', currentIndex: 1 }, { root, timers });
    assert.equal(ambienceOf(root), node, 'same place keeps the same node across page turns');
    render({ sceneLocation: '家里的浴室', currentIndex: 2 }, { root, timers });
    const bath = root.querySelector('#igs-fx-stage').children.filter((n) => String(n.className).includes('igs-dfx-amb'));
    assert.equal(bath.length, 2, 'old layer fades out while the new one fades in');
    timers.advance(1000);
    assert.match(ambienceOf(root).className, /is-bath/);
    assert.equal(root.querySelector('#igs-fx-stage').children.filter((n) => String(n.className).includes('igs-dfx-amb')).length, 1);
    cancelDailyFx(root);
    assert.equal(ambienceOf(root), undefined);
});

test('gate:fx-daily-vehicle-bath ambience: nsfw keeps only bath steam, chat pages and switch-off drop it', () => {
    assert.equal(render({ sceneLocation: '温泉', sceneNsfw: true }).result.ambience, 'bath');
    assert.equal(render({ sceneLocation: '车里', sceneNsfw: true }).result.ambience, '');
    assert.equal(render({ sceneLocation: '温泉', sceneNsfw: true, fx: { daily: [{ type: 'steam' }] } }).result.played.length, 0);
    assert.equal(render({ sceneLocation: '电车', chatPage: true }).result.ambience, '');
    assert.equal(render({ sceneLocation: '电车' }, { readerSettings: { dailyFx: { enabled: true, ambience: false } } }).result.ambience, '');
    assert.equal(render({ sceneLocation: '车站' }).result.ambience, '');
});

test('gate:fx-daily-vehicle-bath ambience css stays cheap: transform/opacity only, frozen in power-saving mode', () => {
    const css = DAILY_FX_STYLE_TEXT.slice(DAILY_FX_STYLE_TEXT.indexOf('.igs-dfx-amb{'));
    const keyframes = [...css.matchAll(/@keyframes igs-amb-[\w-]+\{([\s\S]*?\})\}/g)].map((m) => m[1]);
    assert.ok(keyframes.length >= 5);
    for (const body of keyframes) {
        const props = [...body.matchAll(/([a-z-]+):/g)].map((m) => m[1]);
        for (const prop of props) assert.ok(prop === 'transform' || prop === 'opacity', `animated ${prop}`);
    }
    assert.doesNotMatch(css, /backdrop-filter|mix-blend-mode|filter:blur/);
    assert.match(css, /\[data-igs-quality="low"\] \.igs-dfx-amb>i/);
    assert.match(css, /\.igs-dfx-amb\.is-reduced>i/);
});

test('gate:fx-daily-underwater-space place words ignore worldview and skip air-filled false friends', () => {
    for (const worldview of ['', 'ancient', 'magic', 'scifi']) {
        assert.equal(resolvePlaceAmbience('深海人鱼宫殿', { worldview }).kind, 'underwater', worldview);
        assert.equal(resolvePlaceAmbience('外太空', { worldview }).kind, 'space', worldview);
    }
    assert.equal(resolvePlaceAmbience('沉船甲板（海底）').kind, 'underwater');
    assert.equal(resolvePlaceAmbience('太空站舱外').kind, 'space');
    for (const place of ['海底捞', '海底隧道水族馆', '太空站餐厅', '太空舱']) assert.equal(resolvePlaceAmbience(place), null, place);
});

test('gate:fx-daily-underwater-space ambient sound replaces every other layer and muffles music underwater', async () => {
    const { resolveAmbientTone } = await import('../src/visual/igs-ui/scene-audio.js');
    const on = { enabled: true };
    assert.deepEqual(resolveAmbientPlan({ location: '海底', weather: '暴雨' }, on).map((l) => l.kind), ['underwater']);
    assert.deepEqual(resolveAmbientPlan({ location: '外太空', weather: '大风' }, on).map((l) => l.kind), ['space']);
    assert.deepEqual(resolveAmbientPlan({ location: '外太空' }, { enabled: true, space: false }), []);
    assert.equal(resolveAmbientTone({ location: '湖底' }), 'underwater');
    assert.equal(resolveAmbientTone({ location: '湖底', fxRanges: { dream: true } }), 'dream');
    assert.equal(resolveAmbientTone({ location: '外太空' }), '');
});

test('gate:fx-daily-underwater-space ambience shows on nsfw pages and one-shots play with their sounds', () => {
    assert.equal(render({ sceneLocation: '海底', sceneNsfw: true }).result.ambience, 'underwater');
    assert.equal(render({ sceneLocation: '舱外', sceneNsfw: true }).result.ambience, 'space');
    const deep = render({ sceneLocation: '海底', fx: { daily: [{ type: 'dive' }, { type: 'bubble' }] } });
    assert.deepEqual(deep.result.played, ['dive', 'bubble']);
    assert.deepEqual(deep.sounds, ['dive', 'blub']);
    // 认不出载具时水下不当成船：刹车按汽车。
    assert.deepEqual(render({ sceneLocation: '海底', fx: { daily: [{ type: 'brake' }] } }).sounds, ['screech']);
    assert.deepEqual(render({ fx: { daily: [{ type: 'vacuum' }] } }, { readerSettings: { _ancientEra: true } }).sounds, ['vacuum']);
    for (const kind of ['dive', 'bubble', 'vacuum']) assert.equal(normalizeDailyFxSettings({ enabled: true })[kind], false, kind);
});

test('gate:fx-daily-underwater-space mermaid places, abyss variant and submarines', () => {
    for (const place of ['人鱼王国', '海藻林', '亚特兰蒂斯遗迹', '湖中']) assert.equal(resolvePlaceAmbience(place).kind, 'underwater', place);
    assert.equal(resolvePlaceAmbience('海底').variant, '');
    assert.equal(resolvePlaceAmbience('海沟底部').variant, 'abyss');
    for (const place of ['海底潜艇内', '深海潜水艇', '海底世界水族馆']) assert.equal(resolvePlaceAmbience(place), null, place);
    assert.match(ambienceOf(render({ sceneLocation: '深海' }).root).className, /is-abyss/);
    assert.match(DAILY_FX_STYLE_TEXT, /\.is-abyss \.igs-dfx-amb-rays\{[^}]*animation:igs-amb-drift/);
    // 立绘漂浮只换呼吸的关键帧，仍受呼吸开关、低画质与减少动态约束，亲密呼吸优先。
    assert.match(DAILY_FX_STYLE_TEXT, /@media \(prefers-reduced-motion: no-preference\)\{\n#igs-overlay\[data-igs-underwater\]\[data-igs-sd-breathe\]:not\(\[data-igs-quality="low"\]\) #igs-stage-motion:not\(\[data-igs-rm-breathe\]\) #igs-sprite/);
    assert.match(DAILY_FX_STYLE_TEXT, /@keyframes igs-uw-float\{[^}]*transform:/);
});

test('gate:fx-daily-underwater-space changing place into or out of the water plays dive / surface once', () => {
    const root = makeStage({ waapi: true });
    const timers = makeTimers();
    const page = (index, content, readerSettings) => render({ currentIndex: index, ...content }, { root, timers, readerSettings });
    assert.deepEqual(page(0, { sceneLocation: '海底' }).result.played, [], 'first page after opening stays quiet');
    assert.deepEqual(page(1, { sceneLocation: '海滩' }).sounds, ['splash']);
    const dive = page(2, { sceneLocation: '珊瑚礁' });
    assert.deepEqual(dive.result.played, ['dive']);
    assert.deepEqual(dive.sounds, ['dive']);
    assert.deepEqual(page(2, { sceneLocation: '珊瑚礁' }).result.played, [], 'same page re-render');
    assert.deepEqual(page(3, { sceneLocation: '深海' }).result.played, [], 'still underwater');
    assert.deepEqual(page(4, { sceneLocation: '海滩', sceneNsfw: true }).result.played, [], 'nsfw pages stay quiet');
    assert.deepEqual(page(5, { sceneLocation: '海底', fx: { daily: [{ type: 'dive' }] } }).result.played, ['dive'], 'tag and crossing do not double up');
    assert.deepEqual(page(6, { sceneLocation: '海滩' }, { dailyFx: { enabled: true, ambience: false } }).result.played, [], 'follows the ambience switch');
    assert.match(DAILY_FX_STYLE_TEXT, /\.igs-dfx-surface-veil\{/);
});
