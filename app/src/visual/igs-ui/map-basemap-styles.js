import { normalizeMapTime, resolveMapTimeBasemap } from '../../data/shujuku/map-time.js';

// 自带底图款式注册表：新增一款只需把图片放进 ./assets/map-styles/ 并在这里加一项。
//   url：默认（或唯一）一张图；只有一张时由光照层按场景时间调色、夜间点灯。
//   times：可选，按时段给整套美术（dawn/day/dusk/night/minight 任意子集）；有它时不再二次调色。
//   resolveTime：可选，自定义按时段换图（map-demo 沿用旧的文件名规则）。
// 图片路径必须写成 new URL('字面量', import.meta.url)：构建脚本据此改写并复制到 dist/maps/。
// 例：{ id: 'town', name: '小镇', url: new URL('./assets/map-styles/<文件名>.webp', import.meta.url).href }

export const MAP_BUILTIN_BASEMAPS = Object.freeze([
    Object.freeze({
        id: 'demo', name: '都市', url: new URL('../../../fixtures/record-pages/assets/map-demo-clean-night.png', import.meta.url).href, timeArt: true,
        resolveTime: (url, time) => resolveMapTimeBasemap(url, time),
    }),
]);

export function getBuiltinBasemap(id) {
    return MAP_BUILTIN_BASEMAPS.find(style => style.id === id) || MAP_BUILTIN_BASEMAPS[0];
}

// 返回 { url, ownTimeArt }：ownTimeArt 为真时底图自带分时段美术，光照层只叠天气。
export function resolveBuiltinBasemap(style, time) {
    if (style.resolveTime) return { url: style.resolveTime(style.url, time), ownTimeArt: Boolean(style.timeArt) };
    const variant = normalizeMapTime(time);
    const timed = style.times && (style.times[variant] || style.times.day);
    if (timed) return { url: timed, ownTimeArt: true };
    return { url: style.url, ownTimeArt: false };
}
