import { normalizeLive2dConfig } from './live2d-config.js';
import { unzipSync, zipSync } from '../../vendor/fflate.js';

export const LIVE2D_LIMITS = Object.freeze({ files: 5000, fileBytes: 128 * 1024 * 1024, totalBytes: 512 * 1024 * 1024, zipBytes: 256 * 1024 * 1024 });
const BACKUP = 'igs-live2d-binding.json';
const decoder = new TextDecoder();
export function safeModelPath(value) {
    const path = String(value || '').replace(/\\/g, '/');
    if (!path || path.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(path) || /[\u0000-\u001f?#]/.test(path) || path.split('/').some(p => p === '..')) throw new Error('不安全的模型文件路径：' + path);
    return path.split('/').filter(p => p && p !== '.').join('/');
}
export function resolveModelResource(manifest, resource) {
    if (typeof resource !== 'string' || !resource) throw new Error('模型资源路径为空');
    if (/^[a-z][a-z\d+.-]*:|^[/\\]/i.test(resource)) throw new Error('本地模型不能引用外部地址：' + resource);
    const base = manifest.split('/').slice(0, -1);
    for (const part of resource.replace(/\\/g, '/').split('/')) {
        let p; try { p = decodeURIComponent(part); } catch { throw new Error('模型资源路径编码错误'); }
        if (p === '..') { if (!base.length) throw new Error('模型资源越出导入目录'); base.pop(); }
        else if (p && p !== '.') { if (/[\\/]/.test(p)) throw new Error('非法编码路径'); base.push(p); }
    }
    return safeModelPath(base.join('/'));
}
export function modelResourcePaths(definition) {
    const refs = [];
    const add = (obj, key) => { if (obj?.[key]) refs.push({ object: obj, key, path: obj[key] }); };
    const r = definition.FileReferences;
    if (r?.Moc) {
        for (const key of ['Moc', 'Physics', 'Pose', 'UserData', 'DisplayInfo']) add(r, key);
        for (let i = 0; i < (r.Textures || []).length; i++) add(r.Textures, i);
        for (const e of r.Expressions || []) add(e, 'File');
        for (const list of Object.values(r.Motions || {})) for (const m of list) { add(m, 'File'); add(m, 'Sound'); }
    } else if (definition.model) {
        for (const key of ['model', 'physics', 'pose']) add(definition, key);
        for (let i = 0; i < (definition.textures || []).length; i++) add(definition.textures, i);
        for (const e of definition.expressions || []) add(e, 'file');
        for (const list of Object.values(definition.motions || {})) for (const m of list) { add(m, 'file'); add(m, 'sound'); }
    } else throw new Error('不是可加载的 Live2D 模型清单');
    return refs;
}
export function describeModel(definition) {
    const refs = definition.FileReferences;
    return { cubism: refs?.Moc ? '3/4' : '2', expressions: (refs?.Expressions || definition.expressions || []).map(e => e.Name || e.name).filter(Boolean), motions: Object.fromEntries(Object.entries(refs?.Motions || definition.motions || {}).map(([group, entries]) => [group, entries.map((m, index) => ({ index, file: m.File || m.file || '' }))])) };
}
function checkSize(size, total, count) {
    if (count > LIVE2D_LIMITS.files || size > LIVE2D_LIMITS.fileBytes || total > LIVE2D_LIMITS.totalBytes) throw new Error('模型包过大：最多 5000 文件、单文件 128MB、解压后共 512MB');
}
function isBackupPath(path) { return path === BACKUP || path.endsWith('/' + BACKUP); }
function inspectModelBackups(files, manifests) {
    const backups = [], seen = new Set();
    for (const [path, bytes] of Object.entries(files)) {
        if (!isBackupPath(path)) continue;
        if (bytes.byteLength > 1024 * 1024) throw new Error('差分绑定配置过大：' + path);
        let raw;
        try { raw = JSON.parse(decoder.decode(bytes)); } catch { throw new Error('差分绑定配置不是有效 JSON：' + path); }
        if (!raw || raw.format !== 'igs-live2d' || raw.version !== 1) throw new Error('不支持的成品绑定配置格式或版本：' + path);
        if (typeof raw.entry !== 'string' || !raw.entry.trim()) throw new Error('成品绑定配置缺少模型入口：' + path);
        const prefix = path.slice(0, -BACKUP.length);
        const entry = safeModelPath(prefix + safeModelPath(raw.entry));
        if (!manifests.includes(entry)) throw new Error('成品绑定配置引用的模型入口不存在：' + entry);
        if (seen.has(entry)) throw new Error('同一模型存在重复差分绑定配置：' + entry);
        seen.add(entry);
        for (const key of ['moods', 'layout']) {
            if (raw[key] !== undefined && (!raw[key] || typeof raw[key] !== 'object' || Array.isArray(raw[key]))) throw new Error('差分绑定配置的 ' + key + ' 必须是对象：' + path);
        }
        for (const [mood, action] of Object.entries(raw.moods || {})) {
            if (!mood.trim() || !action || typeof action !== 'object' || Array.isArray(action)) throw new Error('无效的差分绑定：' + mood);
            for (const key of ['expression', 'motion']) if (action[key] !== undefined && typeof action[key] !== 'string') throw new Error('差分 ' + mood + ' 的 ' + key + ' 必须是名称字符串');
        }
        const binding = normalizeLive2dConfig({ bindings: { imported: { modelId: 'import-validation', moods: raw.moods || {}, layout: raw.layout || {} } } }).bindings.imported;
        // 只接受声明式绑定，不导入运行库地址或包内脚本。
        backups.push({ format: 'igs-live2d', version: 1, name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 300) : '', entry, moods: Object.fromEntries(Object.entries(binding.moods)), layout: binding.layout });
    }
    return backups;
}
export function resolveModelBackup(source, entry) {
    return (source.backups || (source.backup ? [source.backup] : [])).find(backup => backup.entry === entry) || null;
}
export function inspectModelFiles(entries) {
    const files = Object.create(null); let total = 0, count = 0;
    for (const [raw, value] of Object.entries(entries)) {
        if (raw.endsWith('/')) continue;
        const name = safeModelPath(raw); const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
        total += bytes.byteLength; checkSize(bytes.byteLength, total, ++count);
        if (Object.hasOwn(files, name)) throw new Error('重复文件：' + name);
        files[name] = bytes;
    }
    const manifests = [];
    for (const [name, bytes] of Object.entries(files)) {
        if (!/\.(json|asset)$/i.test(name) || bytes.length > 8 * 1024 * 1024 || isBackupPath(name)) continue;
        try { const d = JSON.parse(decoder.decode(bytes)); if (d?.FileReferences?.Moc || typeof d?.model === 'string') manifests.push(name); } catch { /* 非模型 json 不作为入口 */ }
    }
    if (!manifests.length) throw new Error('没有找到 model.json / model3.json / buildData.asset。请导入完整模型 ZIP 或文件夹，不是单独一张纹理。');
    const backups = inspectModelBackups(files, manifests);
    return { files, manifests: manifests.sort(), total, backup: backups[0] || null, backups };
}
export function importModelZip(bytes) {
    if (bytes.byteLength > LIVE2D_LIMITS.zipBytes) throw new Error('ZIP 文件不能超过 256MB');
    let total = 0, count = 0; const seen = new Set();
    const files = unzipSync(bytes, { filter(entry) {
        const name = safeModelPath(entry.name); total += entry.originalSize; checkSize(entry.originalSize, total, ++count);
        if (seen.has(name)) throw new Error('ZIP 包含重复路径：' + name); seen.add(name);
        return !entry.name.endsWith('/');
    } });
    return inspectModelFiles(files);
}
export async function importModelFolder(fileList) {
    const entries = Object.create(null); let total = 0;
    const files = Array.from(fileList || []);
    for (const f of files) { total += f.size; checkSize(f.size, total, files.length); }
    for (const f of files) { const name = safeModelPath(f.webkitRelativePath || f.name); if (Object.hasOwn(entries, name)) throw new Error('重复文件：' + name); entries[name] = new Uint8Array(await f.arrayBuffer()); }
    return inspectModelFiles(entries);
}
export function prepareModelPackage(source, entry, id) {
    const bytes = source.files[entry]; if (!bytes) throw new Error('模型入口不存在');
    const definition = JSON.parse(decoder.decode(bytes));
    const selected = new Set([entry]); const missing = [];
    for (const ref of modelResourcePaths(definition)) {
        const path = resolveModelResource(entry, ref.path);
        if (!source.files[path]) missing.push(path); else selected.add(path);
    }
    if (missing.length) throw new Error('模型缺少 ' + missing.length + ' 个文件：\n' + missing.slice(0, 8).join('\n'));
    const files = Object.fromEntries([...selected].map(name => [name, source.files[name]]));
    return { id, entry, files, metadata: describeModel(definition), bytes: Object.values(files).reduce((n, b) => n + b.byteLength, 0) };
}
export function exportModelZip(pkg, name, binding) {
    const files = { ...pkg.files, [BACKUP]: new TextEncoder().encode(JSON.stringify({ format: 'igs-live2d', version: 1, name, entry: pkg.entry, moods: binding.moods, layout: binding.layout }, null, 2)) };
    return zipSync(files, { level: 0 });
}

function modelDb(win) {
    return new Promise((resolve, reject) => {
        if (!win?.indexedDB) return reject(new Error('当前浏览器无法使用模型存储（IndexedDB）'));
        const request = win.indexedDB.open('igs-live2d-models', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('models', { keyPath: 'id' });
        request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error('模型存储升级被其他页面阻塞，请关闭旧标签页后重试'));
        request.onsuccess = () => resolve(request.result);
    });
}
async function transact(win, mode, run) {
    const db = await modelDb(win);
    try { return await new Promise((resolve, reject) => { const tx = db.transaction('models', mode); const request = run(tx.objectStore('models')); tx.oncomplete = () => resolve(request.result); tx.onerror = tx.onabort = () => reject(tx.error || request.error || new Error('模型存储失败')); }); }
    finally { db.close(); }
}
export function saveModelPackage(win, pkg) { return transact(win, 'readwrite', store => store.put(pkg)); }
export async function readModelPackage(win, id) { const pkg = await transact(win, 'readonly', store => store.get(id)); if (!pkg) throw new Error('本地模型文件已丢失，请重新导入模型包'); return pkg; }
export function deleteModelPackage(win, id) { return transact(win, 'readwrite', store => store.delete(id)); }
