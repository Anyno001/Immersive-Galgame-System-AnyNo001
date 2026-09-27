import { hashString } from './seed-random.js';
import { classifyMapPlace, detectMapTheme, resolveMapScale } from './place-semantics.js';
import { generateCitySteps } from './city.js';
import { renderCitySteps, renderLightSteps } from './render-canvas.js';

// 升级生成算法或画风时加一，旧缓存与旧种子序列随之失效。
export const MAP_GEN_VERSION = 1;
export const MAP_GEN_WORLD = Object.freeze({ width: 1600, height: 900 });

const round4 = value => Math.round(Number(value) * 10000) / 10000;

// 生成输入只取已排好位置的指针；缓存键覆盖种子、地点签名、世界观与尺度。
export function buildMapGenInput(options = {}) {
    const width = options.width || MAP_GEN_WORLD.width;
    const height = options.height || MAP_GEN_WORLD.height;
    const points = (options.points || []).map((point, index) => ({
        id: String(point.id ?? index),
        name: String(point.name ?? ''),
        description: String(point.description ?? ''),
        x: round4(point.x),
        y: round4(point.y),
        category: classifyMapPlace(point.name, point.description),
    }));
    const scale = resolveMapScale(options.parentName, points.map(point => point.name));
    const theme = options.theme || detectMapTheme(options.themeTexts || points.flatMap(point => [point.name, point.description]));
    const seed = hashString([MAP_GEN_VERSION, options.chatId, options.tableUid, options.parentId, options.salt || 0].map(part => String(part ?? '')).join('\u0001'));
    const signature = hashString(points.map(point => [point.id, point.name, point.category, point.x, point.y].join('|')).join(';'));
    return {
        kind: 'city', key: `city:${seed}:${signature}:${theme}:${scale}:${width}x${height}`,
        seed, scale, theme, width, height, points,
    };
}

// 无生成数据的外部底图只按指针位置点灯，避免夜里整张图死黑。
export function buildMarkerLightsInput(points, width, height) {
    const lights = (points || []).map(point => ({ x: Math.round(point.x * width), y: Math.round(point.y * height), r: 70, a: 0.75 }));
    return { kind: 'lights', key: `lights:${hashString(lights.map(l => `${l.x},${l.y}`).join(';'))}:${width}x${height}`, width, height, lights };
}

export function createMapBasemapGenerator(options = {}) {
    const doc = options.doc || null;
    const view = doc?.defaultView || globalThis;
    const budget = options.budgetMs ?? 10;
    const timeout = options.timeoutMs ?? 8000;
    const limit = options.cacheSize ?? 4;
    const now = options.now || (() => (view.performance || globalThis.performance || Date).now());
    const schedule = options.schedule || (fn => (view.setTimeout || setTimeout)(fn, 0));
    const createCanvas = options.createCanvas || ((w, h) => {
        if (!doc?.createElement) return null;
        const canvas = doc.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        return canvas;
    });
    const renderScale = options.scale ?? ((view.devicePixelRatio || 1) >= 1.5 ? 2 : 1.5);
    const cache = new Map();
    let disposed = false;

    const revoke = entry => {
        for (const url of [entry?.result?.url, entry?.result?.lightsUrl]) {
            if (url && url.startsWith('blob:')) try { view.URL?.revokeObjectURL?.(url); } catch (error) { /* 宿主已卸载时忽略 */ }
        }
    };
    const remember = (key, entry) => {
        cache.delete(key);
        cache.set(key, entry);
        while (cache.size > limit) {
            const [oldKey, old] = cache.entries().next().value;
            if (old.status === 'pending') break;
            cache.delete(oldKey);
            revoke(old);
        }
    };

    // 按时间预算推进生成器：每片不超过 budget 毫秒，其余交回宿主事件循环。
    const drive = iterator => new Promise((resolve, reject) => {
        const started = now();
        const tick = () => {
            if (disposed) { reject(new Error('disposed')); return; }
            try {
                const t0 = now();
                let step = iterator.next();
                while (!step.done && now() - t0 < budget) step = iterator.next();
                if (step.done) resolve(step.value);
                else if (now() - started > timeout) reject(new Error('timeout'));
                else schedule(tick);
            } catch (error) { reject(error); }
        };
        schedule(tick);
    });

    const toUrl = canvas => new Promise(resolve => {
        if (typeof canvas.toBlob === 'function' && view.URL?.createObjectURL) {
            canvas.toBlob(blob => resolve(blob ? view.URL.createObjectURL(blob) : canvas.toDataURL('image/png')), 'image/webp', 0.9);
        } else resolve(canvas.toDataURL('image/png'));
    });

    function* cityJob(input) {
        const scene = yield* generateCitySteps(input);
        const canvas = createCanvas(Math.round(input.width * renderScale), Math.round(input.height * renderScale));
        const ctx = canvas?.getContext?.('2d');
        if (!ctx) throw new Error('canvas-unavailable');
        yield* renderCitySteps(ctx, scene, { scale: renderScale, seed: input.seed, createCanvas });
        const lights = createCanvas(input.width, input.height);
        const lctx = lights?.getContext?.('2d');
        if (lctx) renderLightSteps(lctx, scene.lights, input.width, input.height, { createCanvas });
        return { canvas, lights: lctx ? lights : null };
    }

    function* lightsJob(input) {
        const lights = createCanvas(input.width, input.height);
        const lctx = lights?.getContext?.('2d');
        if (!lctx) throw new Error('canvas-unavailable');
        yield 'lights';
        renderLightSteps(lctx, input.lights, input.width, input.height, { createCanvas });
        return { canvas: null, lights };
    }

    function peek(key) {
        const entry = cache.get(key);
        if (!entry) return null;
        cache.delete(key);
        cache.set(key, entry);
        return entry;
    }

    function request(input) {
        const existing = peek(input.key);
        if (existing) return existing;
        const entry = { status: 'pending', result: null, error: '' };
        entry.promise = drive(input.kind === 'lights' ? lightsJob(input) : cityJob(input))
            .then(async ({ canvas, lights }) => {
                const url = canvas ? await toUrl(canvas) : '';
                const lightsUrl = lights ? await toUrl(lights) : '';
                entry.result = { url, lightsUrl, width: input.width, height: input.height };
                entry.status = 'ready';
                if (disposed) revoke(entry);
                return entry;
            })
            .catch(error => {
                entry.status = 'failed';
                entry.error = String(error?.message || error);
                return entry;
            });
        remember(input.key, entry);
        return entry;
    }

    function dispose() {
        disposed = true;
        for (const entry of cache.values()) revoke(entry);
        cache.clear();
    }

    return { request, peek, dispose };
}
