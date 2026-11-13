// CG 下载：单张直接存原件（生成时是什么格式就是什么格式，通常 PNG），多张按原件打成 zip。
import { createArchiveDownload } from './archive-download.js';
import { writeZip } from './archive-zip.js';

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const clean = value => String(value ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();

export function cgDownloadBase(entry) {
    if (!entry) return 'CG';
    const time = clean(String(entry.updatedAt || '').slice(0, 19).replace('T', '_').replace(/:/g, '-'));
    if (entry.kind === 'photo') return `照片${time ? `_${time}` : ''}_${clean(entry.photoId).slice(0, 8)}`;
    return `CG_${entry.messageId}楼_${entry.slot}${entry.swipeId ? `_分支${entry.swipeId}` : ''}${time ? `_${time}` : ''}`;
}

const extOf = blob => EXT[String(blob?.type || '').toLowerCase()] || 'png';

export async function downloadCgEntry(service, entry, globalObject = globalThis) {
    if (typeof service?.readOriginalBlob !== 'function') return { ok: false, reason: 'download-unavailable' };
    const got = await service.readOriginalBlob(entry);
    if (!got?.ok) return got || { ok: false, reason: 'file-unreadable' };
    const doc = globalObject.document, urlApi = globalObject.URL || globalThis.URL;
    if (!doc?.createElement || typeof urlApi?.createObjectURL !== 'function') return { ok: false, reason: 'download-unavailable' };
    const fileName = `${cgDownloadBase(entry)}.${extOf(got.blob)}`;
    const url = urlApi.createObjectURL(got.blob), link = doc.createElement('a');
    link.href = url; link.download = fileName; doc.body.appendChild(link); link.click(); doc.body.removeChild(link);
    (globalObject.setTimeout || setTimeout)(() => urlApi.revokeObjectURL(url), 60000);
    return { ok: true, fileName };
}

// 读不到的那几张跳过不打断，最后告诉调用方缺了几张。
export async function downloadCgZip(service, entries, globalObject = globalThis, { onProgress, signal } = {}) {
    const list = (entries || []).filter(Boolean);
    if (!list.length) return { ok: true, images: 0, missing: 0 };
    if (typeof service?.readOriginalBlob !== 'function') return { ok: false, reason: 'download-unavailable' };
    const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
    const fileName = `IGS-CG_${stamp}.zip`;
    const sink = await createArchiveDownload(globalObject, fileName);
    let missing = 0, done = 0;
    async function* files() {
        const names = new Set();
        for (const entry of list) {
            const got = await service.readOriginalBlob(entry);
            done += 1; onProgress?.({ done, total: list.length });
            if (!got?.ok) { missing += 1; continue; }
            const base = cgDownloadBase(entry), ext = extOf(got.blob);
            let name = `${base}.${ext}`;
            for (let i = 2; names.has(name); i += 1) name = `${base}-${i}.${ext}`;
            names.add(name);
            yield { name, blob: got.blob };
        }
    }
    const result = await writeZip(files(), sink, { signal });
    return { ...result, fileName, images: list.length - missing, missing };
}
