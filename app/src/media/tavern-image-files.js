// 图片本体存进酒馆本地 user/images/igs-*/（/api/images/upload），IndexedDB 只留文件路径，不占浏览器存储。
// 读出时取回还原成 dataUrl，消费方仍拿到 data:image/...;base64；酒馆接口不可用时原样存浏览器，不丢图。
// 旧记录里的 base64 在读到时顺手搬家（记录未被并发改写才落盘）。
import { getSillyTavernContext } from '../host/tavern-helper-adapter.js';

const DATA_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;
const PATH_RE = /^\/?user\/images\/igs-[^?#]+$/;

const isData = (v) => typeof v === 'string' && DATA_RE.test(v);
const isPath = (v) => typeof v === 'string' && PATH_RE.test(v);

// 字符串哈希（不依赖 crypto.subtle，局域网 http 下也可用）；文件名含记录键与内容，内容变就换文件。
function hashText(text) {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 2654435761);
        h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

function createTavernImageFiles(globalObject, dir) {
    const headers = () => {
        const ctx = getSillyTavernContext(globalObject);
        return ctx && typeof ctx.getRequestHeaders === 'function' ? ctx.getRequestHeaders() : null;
    };
    const post = (url, body) => {
        const h = headers();
        if (!h || typeof globalObject.fetch !== 'function') return Promise.resolve(null);
        return globalObject.fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) }).catch(() => null);
    };
    const upload = async (dataUrl, name, old) => {
        const reuse = Object.values(old || {}).find((v) => isPath(v) && v.includes(`/${name}.`));
        if (reuse) return reuse;
        const m = DATA_RE.exec(dataUrl);
        const ext = m[1].toLowerCase();
        const res = await post('/api/images/upload', {
            image: dataUrl.slice(m[0].length), ch_name: dir, filename: name, format: ext === 'jpeg' ? 'jpg' : ext,
        });
        const path = res && res.ok ? String(((await res.json().catch(() => null)) || {}).path || '').replace(/\\/g, '/') : '';
        return isPath(path) ? path : dataUrl;
    };
    const read = async (path) => {
        try {
            const res = await globalObject.fetch(`/${path.replace(/^\//, '')}`, { cache: 'no-store' });
            if (!res.ok) return '';
            const blob = await res.blob();
            return await new Promise((resolve) => {
                const reader = new globalObject.FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => resolve('');
                reader.readAsDataURL(blob);
            });
        } catch {
            return '';
        }
    };
    const pathsOf = (rec) => new Set(Object.values(rec || {}).filter(isPath));
    return {
        hasData: (rec) => Boolean(rec) && Object.values(rec).some(isData),
        sameData: (a, b) => Boolean(a && b) && Object.keys(a).every((k) => !isData(a[k]) || a[k] === b[k]),
        // 只换顶层 data:image 字段；old 里已有同名文件时直接复用，读出再写回不会重复上传。
        async offload(rec, key, old) {
            if (!rec || !Object.values(rec).some(isData) || !headers()) return rec;
            const next = { ...rec };
            for (const [field, value] of Object.entries(rec)) {
                if (isData(value)) next[field] = await upload(value, hashText(`${key}\n${value}`), old);
            }
            return next;
        },
        async hydrate(rec) {
            if (!rec || !Object.values(rec).some(isPath)) return rec;
            const next = { ...rec };
            await Promise.all(Object.entries(rec).filter(([, v]) => isPath(v)).map(async ([field, v]) => { next[field] = await read(v); }));
            return next;
        },
        // 删掉 old 引用而 next 不再引用的文件；失败忽略（旧版酒馆无删除接口时只留孤儿文件，不影响使用）。
        dropUnused(old, next) {
            const keep = pathsOf(next);
            for (const p of pathsOf(old)) if (!keep.has(p)) post('/api/images/delete', { path: p.replace(/^\//, '') });
        },
        later(task) { Promise.resolve().then(task).catch(() => {}); },
    };
}

export function withTavernGeneratedAssetFiles(store, globalObject = globalThis) {
    const files = createTavernImageFiles(globalObject, 'igs-assets');
    const migrate = async (raw) => {
        const next = await files.offload(raw, raw.id);
        const now = await store.getImage(raw.id);
        if (now && now.revision === raw.revision && files.sameData(raw, now)) await store.putImage(next);
    };
    return {
        ...store,
        async getImage(id) {
            const raw = await store.getImage(id);
            if (files.hasData(raw)) files.later(() => migrate(raw));
            return files.hydrate(raw);
        },
        async putImage(value) {
            const old = await store.getImage(value.id);
            const next = await files.offload(value, value.id, old);
            await store.putImage(next);
            files.dropUnused(old, next);
        },
        async deleteImage(id) {
            const old = await store.getImage(id);
            await store.deleteImage(id);
            files.dropUnused(old, null);
        },
        async updateImage(id, expectedRevision, patch, updatedAt) {
            const old = await store.getImage(id);
            const next = await files.offload(patch || {}, id, old);
            const result = await store.updateImage(id, expectedRevision, next, updatedAt);
            if (!result || !result.ok) { files.dropUnused(next, old); return result; }
            files.dropUnused(old, result.record);
            return { ...result, record: await files.hydrate(result.record) };
        },
    };
}

export function withTavernIllustrationFiles(store, globalObject = globalThis) {
    const files = createTavernImageFiles(globalObject, 'igs-cg');
    const keyOf = (floorKey, slot) => `${floorKey}|${slot}`;
    const rawSlot = async (floorKey, slot) => (await store.getSlots(floorKey)).find((s) => s.slot === slot) || null;
    const migrate = async (floorKey, raw) => {
        const next = await files.offload(raw, keyOf(floorKey, raw.slot));
        if (files.sameData(raw, await rawSlot(floorKey, raw.slot))) await store.putSlot(floorKey, next);
    };
    return {
        ...store,
        async getSlots(floorKey) {
            const list = await store.getSlots(floorKey);
            for (const s of list) if (files.hasData(s)) files.later(() => migrate(floorKey, s));
            return Promise.all(list.map(files.hydrate));
        },
        async putSlot(floorKey, value) {
            const old = await rawSlot(floorKey, value.slot);
            const next = await files.offload(value, keyOf(floorKey, value.slot), old);
            await store.putSlot(floorKey, next);
            files.dropUnused(old, next);
        },
        async deleteSlot(floorKey, slot) {
            const old = await rawSlot(floorKey, slot);
            const result = await store.deleteSlot(floorKey, slot);
            files.dropUnused(old, null);
            return result;
        },
        async listDoneSlotsPage(options) {
            const page = await store.listDoneSlotsPage(options);
            return { ...page, items: await Promise.all(page.items.map(files.hydrate)) };
        },
    };
}

export function withTavernPhotoFiles(store, globalObject = globalThis) {
    const files = createTavernImageFiles(globalObject, 'igs-photos');
    const migrate = async (raw) => {
        const next = await files.offload(raw, raw.id);
        if (files.sameData(raw, await store.get(raw.id))) await store.put(next);
    };
    const load = async (raw) => {
        if (files.hasData(raw)) files.later(() => migrate(raw));
        const photo = await files.hydrate(raw);
        return photo && photo.dataUrl ? photo : null;
    };
    return {
        ...store,
        async list() { return (await Promise.all((await store.list()).map(load))).filter(Boolean); },
        async get(id) { return load(await store.get(id)); },
        async put(value) {
            const old = await store.get(value && value.id);
            const next = await files.offload(value, value && value.id, old);
            const result = await store.put(next);
            if (!result || !result.ok) return result;
            files.dropUnused(old, next);
            return { ...result, photo: { ...result.photo, dataUrl: value.dataUrl } };
        },
        async remove(id) {
            const old = await store.get(id);
            const result = await store.remove(id);
            files.dropUnused(old, null);
            return result;
        },
    };
}
