// 特质钩子用的本楼环境读取（纯函数，不 import 特质登记表）：
// - 天气、地点：取自现有场景指令 [igs-scene:地点|时间|天气]（scene-directives 解析），本楼没写就沿用之前最近一条；
// - 演出标签：ABO 包 [igs-fx:suppress|…] 等，原样取字段，不另造标签；
// - 吸血、歌唱、发情：由 event 标签（traitEvent）给出，不再读正文关键词。
import { extractSceneDirectives, resolveLatestSceneDirective } from '../scene-directives.js';
const FX_TAG = /\[igs-fx:(suppress|soothe|bond|phase|inhibitor)((?:\|[^\]\n|]*)*)\]/gi;

const clean = (v) => String(v ?? '').trim();

// 文本里最后一条场景指令（复用场景指令解析）：{ place, time, weather } 或 null。
export function lastSceneOf(text) {
    const scene = resolveLatestSceneDirective(extractSceneDirectives(String(text ?? '')).directives);
    return scene ? { place: clean(scene.scene), time: clean(scene.time), weather: clean(scene.weather) } : null;
}

// 演出标签：[{ kind, args: [字段...] }]，只收 ABO 一组。
export function fxTagsOf(text) {
    const out = [];
    for (const m of String(text ?? '').matchAll(FX_TAG)) out.push({ kind: m[1].toLowerCase(), args: m[2].split('|').slice(1).map(clean) });
    return out;
}

// 组装本楼环境。history：此前各楼正文（由近到远），本楼没有场景指令时沿用。
export function traitEnvOf(text, history = []) {
    let scene = lastSceneOf(text);
    for (const earlier of history) { if (scene && scene.place) break; scene = lastSceneOf(earlier) || scene; }
    const body = String(text ?? '');
    return {
        place: scene ? scene.place : '',
        time: scene ? scene.time : '',
        weather: scene ? scene.weather : '',
        fx: fxTagsOf(body),
    };
}
