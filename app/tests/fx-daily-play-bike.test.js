import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyFxOf, parseDailyFxBody, PLAY_FX_KINDS } from '../src/scene/daily-fx-directives.js';
import { GAME_FX_KINDS } from '../src/scene/game-console.js';
import { resolvePlaceAmbience, VEHICLE_KINDS } from '../src/scene/place-ambience.js';
import { applyFxEra, applyFxWorldview } from '../src/scene/fx-era.js';
import { normalizeDailyFxSettings } from '../src/visual/igs-ui/fx-daily-model.js';
import { DAILY_FX_STYLE_TEXT } from '../src/visual/igs-ui/fx-daily-style.js';
import { cancelDailyFx, renderDailyFx } from '../src/visual/igs-ui/fx-daily.js';
import { resolveAmbientPlan } from '../src/visual/igs-ui/scene-audio.js';
import { makeStage, makeTimers } from './helpers/fake-dom.js';

const PLAY = ['sing', 'dance', 'fish', 'draw', 'music', 'ride', 'clean', 'shopping', 'stroll', ...GAME_FX_KINDS];

test('gate:fx-daily-play parse: optional field kinds, no-field kinds', () => {
    // 带一个可省字段的：省略时字段为空串，不整条丢弃。
    assert.deepEqual(dailyFxOf(parseDailyFxBody('sing', ['明天你好'])), { type: 'sing', song: '明天你好' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('sing', [])), { type: 'sing', song: '' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('dance', ['华尔兹'])), { type: 'dance', style: '华尔兹' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('fish', ['鲤鱼'])), { type: 'fish', catch: '鲤鱼' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('draw', ['海边夕阳'])), { type: 'draw', subject: '海边夕阳' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('music', ['钢琴'])), { type: 'music', instrument: '钢琴' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('ride', ['摩天轮'])), { type: 'ride', name: '摩天轮' });
    assert.deepEqual(dailyFxOf(parseDailyFxBody('shopping', ['新裙子'])), { type: 'shopping', item: '新裙子' });
    // 不带字段的：
    for (const kind of ['clean', 'stroll']) assert.deepEqual(dailyFxOf(parseDailyFxBody(kind, [])), { type: kind });
});

test('gate:fx-daily-play PLAY_FX_KINDS matches the nine play kinds plus the home-console kinds', () => {
    assert.deepEqual([...PLAY_FX_KINDS].sort(), [...PLAY].sort());
});

test('gate:fx-daily-play kinds are opt-in and styled', () => {
    const legacy = normalizeDailyFxSettings({ enabled: true });
    for (const kind of PLAY) {
        assert.equal(legacy[kind], false, `${kind} 应为显式勾选`);
        assert.ok(DAILY_FX_STYLE_TEXT.includes(`igs-dfx-${kind}`), `${kind} 缺 CSS`);
    }
});

test('gate:fx-daily-play era: amusement rides only in modern-type worldviews', () => {
    const all = { dailyFx: { enabled: true, ...Object.fromEntries(PLAY.map((k) => [k, true])) } };
    // 古代、西幻、末日、魔法没有游乐园：ride 拨掉。
    assert.equal(applyFxEra(all, true).dailyFx.ride, false);
    assert.equal(applyFxWorldview(all, 'fantasy').dailyFx.ride, false);
    assert.equal(applyFxWorldview(all, 'apocalypse').dailyFx.ride, false);
    assert.equal(applyFxWorldview(all, 'magic').dailyFx.ride, false);
    // 大正(浅草花屋敷)、科幻、现代保留。
    assert.equal(applyFxWorldview(all, 'taisho').dailyFx.ride, true);
    assert.equal(applyFxWorldview(all, 'scifi').dailyFx.ride, true);
    // 唱歌、跳舞等通用演出不分世界观，都保留。
    for (const kind of ['sing', 'dance', 'fish', 'draw', 'music', 'clean', 'shopping', 'stroll']) {
        assert.equal(applyFxEra(all, true).dailyFx[kind], true, `古代应保留 ${kind}`);
    }
});

test('gate:fx-daily-play bike: bicycle and motorbike are open-air vehicles', () => {
    assert.ok(VEHICLE_KINDS.includes('bike'));
    assert.deepEqual(resolvePlaceAmbience('自行车后座'), { kind: 'bike', variant: '' });
    assert.deepEqual(resolvePlaceAmbience('骑着单车'), { kind: 'bike', variant: '' });
    assert.deepEqual(resolvePlaceAmbience('山地车'), { kind: 'bike', variant: '' });
    assert.deepEqual(resolvePlaceAmbience('摩托车后座'), { kind: 'bike', variant: 'moto' });
    assert.deepEqual(resolvePlaceAmbience('电动车'), { kind: 'bike', variant: 'moto' });
    // 「自行车上」含「车上」，必须判成 bike 不是 car。
    assert.deepEqual(resolvePlaceAmbience('自行车上'), { kind: 'bike', variant: '' });
    // 马车世界没有两轮车：回落马车。
    assert.deepEqual(resolvePlaceAmbience('自行车', { worldview: 'ancient' }), { kind: 'carriage', variant: '' });
    assert.deepEqual(resolvePlaceAmbience('摩托车', { worldview: 'fantasy' }), { kind: 'carriage', variant: '' });
});

test('gate:fx-daily-play bike ambient sound follows the place table', () => {
    const on = { enabled: true };
    const bike = resolveAmbientPlan({ location: '自行车后座' }, on).find((l) => l.kind === 'bike');
    assert.ok(bike, '自行车应出骑行环境音');
    assert.ok(!bike.variant, '自行车无 variant');
    const moto = resolveAmbientPlan({ location: '摩托车' }, on).find((l) => l.kind === 'bike');
    assert.equal(moto.variant, 'moto');
    // 关掉 bike 这一层就没有。
    assert.equal(resolveAmbientPlan({ location: '自行车' }, { enabled: true, bike: false }).some((l) => l.kind === 'bike'), false);
});

// 载具标签 depart/brake/arrive 也是 opt-in，bike 场景测试要一起开。
const VEHICLE = ['depart', 'brake', 'arrive'];
function render(content, { readerSettings = {}, root = makeStage({ waapi: true }), timers = makeTimers(), reducedMotion = false } = {}) {
    const sounds = [];
    const result = renderDailyFx(root, {
        messageId: 9,
        readerSettings: { dailyFx: { enabled: true, petals: false, ...Object.fromEntries([...PLAY, ...VEHICLE].map((k) => [k, true])) }, ...readerSettings },
        content: { currentIndex: 0, ...content },
    }, { schedule: timers.schedule, clear: timers.clear, reducedMotion, playSfx: (k) => sounds.push(k) });
    return { root, result, sounds, timers };
}

// 卡片经 appendChild 挂上，父节点 innerHTML 取不到，要取 children 各自的 innerHTML。
const htmlOf = (layer) => layer.children.map((n) => n.innerHTML).join('');
const frontOf = (root) => htmlOf(root.querySelector('#igs-fx-front'));
const stageOf = (root) => htmlOf(root.querySelector('#igs-fx-stage'));

test('gate:fx-daily-play builders render with the right sound and label', () => {
    // 唱歌：front 层，带歌名，出 sing 音。
    const sing = render({ fx: { daily: [{ type: 'sing', song: '明天你好' }] } });
    assert.deepEqual(sing.sounds, ['sing']);
    assert.match(frontOf(sing.root), /igs-dfx-sing[\s\S]*明天你好/);
    cancelDailyFx(sing.root);
    // 打扫：音效键是 sweep(不是 clean)。
    const clean = render({ fx: { daily: [{ type: 'clean' }] } });
    assert.deepEqual(clean.sounds, ['sweep']);
    assert.match(frontOf(clean.root), /igs-dfx-clean/);
    cancelDailyFx(clean.root);
    // 游乐设施：带设施名。
    const ride = render({ fx: { daily: [{ type: 'ride', name: '摩天轮' }] } });
    assert.deepEqual(ride.sounds, ['ride']);
    assert.match(frontOf(ride.root), /igs-dfx-ride[\s\S]*摩天轮/);
    cancelDailyFx(ride.root);
    // 跳舞、散步在 stage 层。
    const dance = render({ fx: { daily: [{ type: 'dance', style: '' }] } });
    assert.deepEqual(dance.sounds, ['dance']);
    assert.match(stageOf(dance.root), /igs-dfx-dance/);
    cancelDailyFx(dance.root);
    const stroll = render({ fx: { daily: [{ type: 'stroll' }] } });
    assert.deepEqual(stroll.sounds, ['stroll']);
    assert.match(stageOf(stroll.root), /igs-dfx-stroll/);
    cancelDailyFx(stroll.root);
});

test('gate:fx-daily-play bike vehicle verbs and sounds in the scene', () => {
    // 自行车场景里起步 / 刹停 / 到了的声音与字样跟着 bike 换。
    const r = render({ sceneLocation: '自行车后座', fx: { daily: [{ type: 'depart', to: '学校' }, { type: 'brake' }] } });
    assert.deepEqual(r.sounds, ['bike-ride', 'bike-skid']);
    assert.match(stageOf(r.root), /骑往[\s\S]*叮铃——/);
    cancelDailyFx(r.root);
    const arr = render({ sceneLocation: '骑着单车', fx: { daily: [{ type: 'arrive', station: '' }] } });
    assert.deepEqual(arr.sounds, ['bike-bell']);
    cancelDailyFx(arr.root);
    // 骑行是开放式氛围层，NSFW 页不挂（和其他载具一致）。
    assert.equal(render({ sceneLocation: '自行车后座', sceneNsfw: true }).result.ambience, '');
});
