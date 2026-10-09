// 图片本体存进酒馆 user/images/igs-*/（/api/images/upload）。记录里只留路径。
// 读出时取回还原成 dataUrl，并按路径留在浏览器里，云酒馆上同一张图不再重新下载。
// 酒馆接口不可用时原样存浏览器，不丢图。
// 旧记录里的 base64 在读到时顺手搬家（记录未被并发改写才落盘）。
// 文件名带「编号@类型@字段@哈希」：清掉浏览器缓存后按编号从文件夹找回；早期只有哈希的文件靠比对哈希认领。
import { getSillyTavernContext } from '../host/tavern-helper-adapter.js';
import { localImageCacheFor } from './tavern-image-cache.js';

const DATA_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;
const FETCH_TIMEOUT_MS = 30000;
const PATH_RE = /^\/?user\/images\/igs-[^?#]+$/;

const isData = (v) => typeof v === 'string' && DATA_RE.test(v);
const isPath = (v) => typeof v === 'string' && PATH_RE.test(v);
const LEGACY_RE = /^[0-9a-f]{16}\.\w+$/;
const slug = (v) => String(v || '').replace(/[^\w-]/g, '_').slice(0, 80);
const tick = (g) => new Promise((resolve) => g.setTimeout(resolve, 0));

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
    const cache = localImageCacheFor(globalObject);
    const flights = new Map();
    // 下载有期限：手机网络卡住时请求可能永远不回，到期中止并按失败处理，下次再读会重新下载。
    const fetchDataUrl = async (path) => {
        const Abort = globalObject.AbortController;
        const abort = typeof Abort === 'function' ? new Abort() : null;
        const timer = abort ? globalObject.setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS) : null;
        try {
            const res = await globalObject.fetch(`/${path.replace(/^\//, '')}`, abort ? { cache: 'no-store', signal: abort.signal } : { cache: 'no-store' });
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
        } finally {
            if (timer) globalObject.clearTimeout(timer);
        }
    };
    const read = (path) => {
        const key = String(path || '').replace(/^\//, '');
        if (!key) return Promise.resolve('');
        if (flights.has(key)) return flights.get(key);
        const job = (async () => {
            const cached = await cache.get(key);
            if (cached) return cached;
            const dataUrl = await fetchDataUrl(key);
            if (dataUrl) cache.put(key, dataUrl).catch(() => {});
            return dataUrl;
        })().finally(() => flights.delete(key));
        flights.set(key, job);
        return job;
    };
    const pathsOf = (rec) => new Set(Object.values(rec || {}).filter(isPath));
    const drop = (p) => {
        cache.drop(p);
        return post('/api/images/delete', { path: p.replace(/^\//, '') });
    };
    let listing = null;
    const listFiles = () => listing || (listing = (async () => {
        globalObject.setTimeout(() => { listing = null; }, 3000);
        const res = await post('/api/images/list', { folder: dir, sortField: 'date', sortOrder: 'asc' });
        const names = res && res.ok ? await res.json().catch(() => null) : null;
        return Array.isArray(names) ? names.map(String) : [];
    })());
    const hasAlpha = async (dataUrl) => {
        try {
            const bmp = await globalObject.createImageBitmap(await (await globalObject.fetch(dataUrl)).blob());
            const c = globalObject.document.createElement('canvas');
            c.width = 24; c.height = 24;
            const g = c.getContext('2d');
            g.drawImage(bmp, 0, 0, 24, 24);
            const px = g.getImageData(0, 0, 24, 24).data;
            for (let i = 3; i < px.length; i += 4) if (px[i] < 250) return true;
        } catch { /* 判断不了按不透明算 */ }
        return false;
    };
    // 旧哈希文件按上传先后排：立绘是 原图→透明结果→遮罩，透明的那张就是 dataUrl；只命中一张即为 dataUrl。
    const legacyRecord = async (key, urls) => {
        if (urls.length === 1) return { id: key, dataUrl: urls[0] };
        let i = 0;
        while (i < urls.length && !(await hasAlpha(urls[i]))) i += 1;
        if (i >= urls.length) i = 1;
        return {
            id: key, type: 'sprite', revision: 1, dataUrl: urls[i], workingDataUrl: '',
            originalDataUrl: i > 0 ? urls[0] : urls[i], alphaMaskDataUrl: i < urls.length - 1 ? urls[urls.length - 1] : '',
        };
    };
    // 同一时刻缺的编号攒一批，旧文件每张只下载一次、对每个编号比一次哈希。
    let batch = null;
    const scanLegacy = (key) => {
        if (!batch) {
            const keys = new Set();
            batch = { keys, done: tick(globalObject).then(async () => {
                batch = null;
                const hits = new Map([...keys].map((k) => [k, []]));
                for (const name of (await listFiles()).filter((n) => LEGACY_RE.test(n))) {
                    const path = `user/images/${dir}/${name}`;
                    const dataUrl = await read(path);
                    const want = name.slice(0, 16);
                    for (const [k, list] of hits) if (dataUrl && hashText(`${k}\n${dataUrl}`) === want) { list.push({ path, dataUrl }); break; }
                    await tick(globalObject);
                }
                return hits;
            }) };
        }
        batch.keys.add(key);
        return batch.done.then((hits) => hits.get(key) || []);
    };
    const missed = new Set();
    return {
        hasData: (rec) => Boolean(rec) && Object.values(rec).some(isData),
        sameData: (a, b) => Boolean(a && b) && Object.keys(a).every((k) => !isData(a[k]) || a[k] === b[k]),
        // 整条记录没被改过（提示词、状态等非图片字段也算）。搬家只在这时落盘，
        // 否则读图时排下的搬家会把刚保存的提示词用旧记录覆盖回去。
        sameRecord: (a, b) => {
            if (!a || !b) return false;
            const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
            for (const k of keys) {
                if (a[k] === b[k]) continue;
                if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
            }
            return true;
        },
        // 只换顶层 data:image 字段；old 里已有同名文件时直接复用，读出再写回不会重复上传。
        async offload(rec, key, old) {
            if (!rec || !Object.values(rec).some(isData) || !headers()) return rec;
            const next = { ...rec };
            for (const [field, value] of Object.entries(rec)) {
                if (isData(value)) next[field] = await upload(value, `${slug(key)}@${slug(rec.type)}@${field}@${hashText(`${key}\n${value}`)}`, old);
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
            for (const p of pathsOf(old)) if (!keep.has(p)) drop(p);
        },
        // 浏览器记录没了时从文件夹找回：先按编号前缀，再认领旧哈希文件；legacy 为认领后待删的旧文件。
        async recover(key) {
            if (!key || missed.has(key) || !headers()) return null;
            const head = `${slug(key)}@`;
            const tagged = (await listFiles()).filter((n) => n.startsWith(head));
            if (tagged.length) {
                const rec = { id: key };
                for (const n of tagged) {
                    const [, type, field] = n.replace(/\.\w+$/, '').split('@');
                    if (type) rec.type = type;
                    if (field) rec[field] = `user/images/${dir}/${n}`;
                }
                return { rec, legacy: [] };
            }
            const hits = await scanLegacy(key);
            if (!hits.length) { missed.add(key); return null; }
            return { rec: await legacyRecord(key, hits.map((h) => h.dataUrl)), legacy: hits.map((h) => h.path) };
        },
        drop,
        listFiles,
        headers,
        later(task) { Promise.resolve().then(task).catch(() => {}); },
    };
}

export function withTavernGeneratedAssetFiles(store, globalObject = globalThis) {
    const files = createTavernImageFiles(globalObject, 'igs-assets');
    const migrate = async (raw) => {
        const next = await files.offload(raw, raw.id);
        const now = await store.getImage(raw.id);
        if (now && now.revision === raw.revision && files.sameRecord(raw, now)) await store.putImage(next);
    };
    const restoring = new Map();
    const restore = async (id) => {
        const found = await files.recover(id);
        if (!found) return null;
        const now = await store.getImage(id);
        if (now) return files.hydrate(now);
        if (found.legacy.length) {
            const next = await files.offload(found.rec, id);
            await store.putImage(next);
            if (!files.hasData(next)) found.legacy.forEach(files.drop);
            return found.rec;
        }
        await store.putImage(found.rec);
        return files.hydrate(found.rec);
    };
    return {
        ...store,
        async getImage(id) {
            const raw = await store.getImage(id);
            if (!raw && id) {
                if (!restoring.has(id)) restoring.set(id, restore(id).catch(() => null).finally(() => restoring.delete(id)));
                return restoring.get(id);
            }
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

function utf8Base64(globalObject, text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return globalObject.btoa(binary);
}

// 插图记录（哪个聊天、哪一楼、第几张、提示词）在 IndexedDB，清浏览器缓存就没了；图本体在 user/images/igs-cg 但文件名
// 里的聊天名被转写截断，认不回来。所以记录（只含文件路径、不含图）另存一份 user/files/igs-cg-records.json，读之前先补回。
export const CG_RECORDS_FILE = 'igs-cg-records.json';
const CG_BACKUP_MS = 2000;
const CG_RESTORE_WAIT_MS = 8000;
const CG_NAME_SLOTS = 12;

export function withTavernIllustrationFiles(store, globalObject = globalThis) {
    const files = createTavernImageFiles(globalObject, 'igs-cg');
    const keyOf = (floorKey, slot) => `${floorKey}|${slot}`;
    const rawSlot = async (floorKey, slot) => (await store.getSlots(floorKey)).find((s) => s.slot === slot) || null;
    const migrate = async (floorKey, raw) => {
        const next = await files.offload(raw, keyOf(floorKey, raw.slot));
        if (files.sameRecord(raw, await rawSlot(floorKey, raw.slot))) {
            await store.putSlot(floorKey, next);
            remember(keyOf(floorKey, raw.slot), { ...next, floorKey });
        }
    };
    const backup = new Map();
    // 只有读到了备份文件（或确认没有）才允许上传，免得网络抖一下就用本机的半份记录盖掉备份。
    let canUpload = false;
    let timer = null;
    const lean = (rec) => {
        if (!rec || typeof rec !== 'object' || files.hasData(rec)) return null;
        const { key, ...rest } = rec;
        return rest;
    };
    const upload = async () => {
        timer = null;
        const h = files.headers();
        if (!h || typeof globalObject.fetch !== 'function') return;
        const text = JSON.stringify({ version: 1, savedAt: Date.now(), slots: Object.fromEntries(backup) });
        await globalObject.fetch('/api/files/upload', { method: 'POST', headers: h, body: JSON.stringify({ name: CG_RECORDS_FILE, data: utf8Base64(globalObject, text) }) }).catch(() => null);
    };
    const queue = () => {
        if (!canUpload || typeof globalObject.setTimeout !== 'function') return;
        if (timer) globalObject.clearTimeout(timer);
        timer = globalObject.setTimeout(() => { upload().catch(() => {}); }, CG_BACKUP_MS);
    };
    function remember(key, rec) {
        const value = lean(rec);
        if (value) backup.set(key, value);
        else backup.delete(key);
        queue();
    }
    let restoring = null;
    const restore = () => restoring || (restoring = (async () => {
        if (!files.headers() || typeof store.listSlotKeys !== 'function' || typeof globalObject.fetch !== 'function') return;
        let saved = null;
        try {
            const res = await globalObject.fetch(`/user/files/${CG_RECORDS_FILE}?t=${Date.now()}`, { cache: 'no-store' });
            if (res.ok) {
                const file = await res.json();
                saved = file && file.slots && typeof file.slots === 'object' ? file.slots : {};
            } else if (res.status === 404) saved = {};
        } catch { saved = null; }
        if (!saved) return;
        const have = new Set(await store.listSlotKeys());
        for (const [key, rec] of Object.entries(saved)) {
            const cut = key.lastIndexOf('|');
            if (!rec || typeof rec !== 'object' || cut <= 0) continue;
            backup.set(key, rec);
            if (!have.has(key)) await store.putSlot(String(rec.floorKey || key.slice(0, cut)), rec);
        }
        // 本机有、备份里没有的（更新前出的图、上次没传成功的）补进备份。
        const missing = [...have].filter((key) => !backup.has(key));
        let added = 0;
        if (missing.length && typeof store.getSlotRecords === 'function') {
            const records = await store.getSlotRecords(missing);
            missing.forEach((key, index) => {
                const value = lean(records[index]);
                if (value) { backup.set(key, value); added += 1; }
            });
        }
        canUpload = true;
        if (added) queue();
    })().catch(() => {}).finally(() => { restoreDone = true; }));
    let restoreDone = false;
    // 补回最多等 8 秒，网络卡住也不挡阅读器出图；补回结束后直接放行，不再排计时器。
    const restored = () => {
        if (restoreDone) return Promise.resolve();
        const job = restore();
        if (typeof globalObject.setTimeout !== 'function') return job;
        return Promise.race([job, new Promise((resolve) => globalObject.setTimeout(resolve, CG_RESTORE_WAIT_MS))]);
    };
    // 有备份之前就清过缓存的：按文件名「楼层键|张数@类型@字段@哈希」认回这一楼的图。聊天名太长被截断的分不清第几张，不认。
    const tried = new Set();
    const fromNames = async (floorKey) => {
        if (tried.has(floorKey) || !files.headers()) return [];
        tried.add(floorKey);
        const names = await files.listFiles();
        const out = [];
        for (let slot = 1; slot <= CG_NAME_SLOTS; slot += 1) {
            const head = slug(keyOf(floorKey, slot));
            if (head.length >= 80) break;
            const rec = { slot, status: 'done', updatedAt: '' };
            for (const n of names.filter((name) => name.startsWith(`${head}@`))) {
                const [, type, field] = n.replace(/\.\w+$/, '').split('@');
                if (type) rec.type = type;
                if (field) rec[field] = `user/images/igs-cg/${n}`;
            }
            if (!isPath(rec.dataUrl)) continue;
            await store.putSlot(floorKey, rec);
            remember(keyOf(floorKey, slot), { ...rec, floorKey });
            out.push(rec);
        }
        return out;
    };
    return {
        ...store,
        async getSlots(floorKey) {
            await restored();
            let list = await store.getSlots(floorKey);
            if (!list.length) list = await fromNames(floorKey).catch(() => []);
            for (const s of list) if (files.hasData(s)) files.later(() => migrate(floorKey, s));
            return Promise.all(list.map(files.hydrate));
        },
        async putSlot(floorKey, value) {
            await restored();
            const old = await rawSlot(floorKey, value.slot);
            const next = await files.offload(value, keyOf(floorKey, value.slot), old);
            await store.putSlot(floorKey, next);
            remember(keyOf(floorKey, value.slot), { ...next, floorKey });
            files.dropUnused(old, next);
        },
        async deleteSlot(floorKey, slot) {
            await restored();
            const old = await rawSlot(floorKey, slot);
            const result = await store.deleteSlot(floorKey, slot);
            remember(keyOf(floorKey, slot), null);
            files.dropUnused(old, null);
            return result;
        },
        ...(typeof store.listSlotKeys === 'function' ? { async listSlotKeys() { await restored(); return store.listSlotKeys(); } } : {}),
        ...(typeof store.getSlotRecord === 'function' ? { async getSlotRecord(key) { await restored(); return store.getSlotRecord(key); } } : {}),
        ...(typeof store.getSlotRecords === 'function' ? { async getSlotRecords(keys) { await restored(); return store.getSlotRecords(keys); } } : {}),
        hydrateSlot(rec) { return files.hydrate(rec); },
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
        async list(options) {
            const raw = await store.list();
            if (options && options.deferImages) return raw.filter(Boolean);
            return (await Promise.all(raw.map(load))).filter(Boolean);
        },
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
