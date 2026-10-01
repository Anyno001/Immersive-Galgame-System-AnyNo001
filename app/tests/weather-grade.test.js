import test from 'node:test';
import assert from 'node:assert/strict';
import {
    WEATHER_FX_GRADES,
    applyWeatherFx,
    resolveWeatherFxGrade,
    resolveWeatherFxLevel,
    resolveWeatherFxPlan,
} from '../src/visual/igs-ui/weather-fx-runtime.js';
import { resolveSceneGradePlan } from '../src/visual/igs-ui/scene-grade.js';
import { normalizeTimeTintSettings } from '../src/visual/igs-ui/stage-direction-settings.js';
import { renderStageDirectionFields } from '../src/visual/igs-ui/stage-direction-fields.js';
import { resolveMapLighting } from '../src/visual/map-gen/lighting.js';

// 细分前的三档判定，用来确认旧消费方拿到的 level 不变。
const OLD_HEAVY = ['暴', '大', '倾盆', '瓢泼', '狂', '猛', '强', '浓', '密', 'heavy', 'torrential', 'storm', 'blizzard', 'dense', 'thick'];
const OLD_LIGHT = ['小', '细', '毛毛', '微', '薄', '零星', '轻', '淡', '疏', 'light', 'drizzle', 'slight', 'mist'];
const oldLevel = (weather) => {
    const text = String(weather || '').trim().toLowerCase();
    if (OLD_HEAVY.some((w) => text.includes(w))) return 'heavy';
    if (OLD_LIGHT.some((w) => text.includes(w))) return 'light';
    return 'medium';
};
const WEATHER_ON = { enabled: true };

test('gate: weather grade splits rain into drizzle, light, medium, heavy and storm', () => {
    assert.deepEqual(WEATHER_FX_GRADES, ['drizzle', 'light', 'medium', 'heavy', 'storm']);
    const cases = [
        ['毛毛雨', 'drizzle'], ['零星小雨', 'drizzle'], ['小雨', 'light'], ['细雨', 'light'],
        ['中雨', 'medium'], ['雨', 'medium'], ['雷阵雨', 'medium'], ['大雨', 'heavy'],
        ['暴雨', 'storm'], ['雷暴雨', 'storm'], ['倾盆大雨', 'storm'], ['大暴雨', 'storm'],
        ['大雪', 'heavy'], ['暴雪', 'storm'], ['heavy rain', 'heavy'], ['drizzle', 'drizzle'], ['', 'medium'],
    ];
    for (const [weather, grade] of cases) assert.equal(resolveWeatherFxGrade(weather), grade, weather);
});

test('gate: legacy three-level weather level is unchanged by the finer grades', () => {
    const samples = ['毛毛雨', '零星小雨', '小雨', '细雨', '薄雾', '轻雪', '中雨', '雨', '雷阵雨', '大雨', '暴雨', '雷暴雨', '倾盆大雨',
        '瓢泼大雨', '狂风暴雨', '浓雾', '密云', '大雪', '暴雪', '沙尘暴', '强风', 'heavy rain', 'light snow', 'drizzle', 'mist', 'thick fog', '晴', ''];
    for (const weather of samples) assert.equal(resolveWeatherFxLevel(weather), oldLevel(weather), weather);
    const plan = resolveWeatherFxPlan({ weather: '雷暴雨', settings: WEATHER_ON });
    assert.equal(plan.kind, 'rain');
    assert.equal(plan.grade, 'storm');
    assert.equal(plan.level, 'heavy');
    assert.equal(plan.thunder, true);
});

test('gate: weather fx passes the grade to particles and marks it on the layer', () => {
    const attrs = new Map();
    const layer = {
        setAttribute: (name, value) => attrs.set(name, value),
        removeAttribute: (name) => attrs.delete(name),
        classList: { add() {}, remove() {} },
    };
    let captured = null;
    const result = applyWeatherFx(layer, {
        settings: WEATHER_ON, weather: '暴雨', location: '公园', reducedMotion: false,
        particles: (options) => { captured = options; return { stop() {} }; },
        schedule: () => 0, clear: () => {},
    });
    assert.equal(result.active, true);
    assert.equal(captured.plan.grade, 'storm');
    assert.equal(attrs.get('data-igs-weather-fx-grade'), 'storm');
    assert.equal(attrs.get('data-igs-weather-fx-level'), 'heavy');
    applyWeatherFx(layer, { settings: { enabled: false } });
    assert.equal(attrs.has('data-igs-weather-fx-grade'), false);
});

test('gate: weather grade orders scene grade and map lighting from drizzle to storm', () => {
    const sat = (weather) => resolveSceneGradePlan({ weatherSettings: WEATHER_ON, time: '中午', weather, location: '公园' }).bg.s;
    const order = ['毛毛雨', '小雨', '中雨', '大雨', '暴雨'].map(sat);
    for (let i = 1; i < order.length; i += 1) assert.ok(order[i] < order[i - 1], `saturation ${order.join(',')}`);
    const clouds = (weather) => resolveMapLighting({ time: '12:00', weather }).clouds;
    assert.ok(clouds('毛毛雨') < clouds('小雨'));
    assert.ok(clouds('大雨') < clouds('暴雨'));
    assert.equal(resolveMapLighting({ weather: '暴雨' }).level, 'heavy');
});

test('gate: night tint toggle defaults on and only skips night and midnight grading', () => {
    assert.equal(normalizeTimeTintSettings({ enabled: true }).night, true);
    assert.equal(normalizeTimeTintSettings(null).night, true);
    assert.equal(normalizeTimeTintSettings({ enabled: true, night: false }).night, false);
    const on = { enabled: true, strength: 'medium' };
    const off = { ...on, night: false };
    assert.equal(resolveSceneGradePlan({ settings: on, time: '夜晚' }).time, 'night');
    assert.equal(resolveSceneGradePlan({ settings: off, time: '夜晚' }), null);
    assert.equal(resolveSceneGradePlan({ settings: off, time: '深夜' }), null);
    assert.equal(resolveSceneGradePlan({ settings: off, time: '黄昏' }).time, 'dusk');
    assert.equal(resolveSceneGradePlan({ settings: off, time: '清晨' }).time, 'dawn');
    const rainy = resolveSceneGradePlan({ settings: off, weatherSettings: WEATHER_ON, time: '夜晚', weather: '大雨' });
    assert.equal(rainy.time, '');
    assert.equal(rainy.weather, 'rain');
});

test('gate: night tint checkbox renders only under the enabled scene filter', () => {
    assert.ok(renderStageDirectionFields({ timeTint: { enabled: true } }).tint.includes('readerSettings.timeTint.night'));
    assert.ok(!renderStageDirectionFields({ timeTint: { enabled: false } }).tint.includes('readerSettings.timeTint.night'));
});
