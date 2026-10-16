// 状态栏头像的图片放进 IndexedDB 图库（和立绘、背景同一处），设置和素材预设里只记 igs-gen:<编号>。
// 早先头像是整段 base64 直接写在设置里（上传的原图可达 700KB 文本），每存一份预设、每次套用前备份都再复制一遍，
// 几张头像就能把浏览器给酒馆的本地存储（几 MB，酒馆和各插件共用）撑满。
import { GENERATED_ASSET_URL_PREFIX } from '../../scene/asset-match.js';

const IMPORTABLE_IMAGE = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/i;
const AVATAR_INLINE_SIZE = 256;

// 缩到 256 见方（居中裁正方形，和头像框的 cover 效果一致）；没有画布或解码失败时原样返回。
export function shrinkAvatarDataUrl(globalObj, dataUrl, side = AVATAR_INLINE_SIZE) {
    const doc = globalObj && globalObj.document;
    const ImageCtor = globalObj && globalObj.Image;
    if (!doc || typeof doc.createElement !== 'function' || typeof ImageCtor !== 'function') return Promise.resolve(dataUrl);
    return new Promise((resolve) => {
        const img = new ImageCtor();
        img.onload = () => {
            try {
                const canvas = doc.createElement('canvas');
                canvas.width = side;
                canvas.height = side;
                const ctx = canvas.getContext('2d');
                const crop = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
                const sx = ((img.naturalWidth || img.width) - crop) / 2;
                const sy = ((img.naturalHeight || img.height) - crop) / 2;
                ctx.drawImage(img, sx, sy, crop, crop, 0, 0, side, side);
                resolve(canvas.toDataURL('image/webp', 0.9));
            } catch (error) {
                resolve(dataUrl);
            }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

async function importAvatar(service, dataUrl) {
    if (!service || typeof service.importAssetImage !== 'function' || !IMPORTABLE_IMAGE.test(dataUrl)) return '';
    try {
        const imported = await service.importAssetImage(dataUrl, 'avatar');
        return imported && imported.ok && imported.imageId ? `${GENERATED_ASSET_URL_PREFIX}${imported.imageId}` : '';
    } catch (error) {
        return '';
    }
}

// 新上传 / 新生成的头像 → 图库地址。shrink：先缩到 256 见方（生成的 1024 原图用不着）。
// 图库不可用时退回写进设置，但一定先缩小，免得一张头像就占几百 KB。
export async function storeAvatarImage(globalObj, service, dataUrl, { shrink = false } = {}) {
    const raw = String(dataUrl || '');
    const source = shrink || !IMPORTABLE_IMAGE.test(raw) ? await shrinkAvatarDataUrl(globalObj, raw) : raw;
    const url = await importAvatar(service, source);
    if (url) return url;
    return source === raw ? shrinkAvatarDataUrl(globalObj, raw) : source;
}

export function avatarHoldersOfRoot(root) {
    const cards = root && root.cards && typeof root.cards === 'object' && !Array.isArray(root.cards) ? Object.values(root.cards) : [];
    return [root, ...cards];
}

export function avatarHoldersOfPreset(preset) {
    const cards = preset && preset.scopeCards && typeof preset.scopeCards === 'object' && !Array.isArray(preset.scopeCards) ? Object.values(preset.scopeCards) : [];
    return [preset, ...cards.map((entry) => entry && entry.library)];
}

// holders 里各层 statusAvatars 中整段 base64 的头像原地换成图库地址；同一张图只存一次（seen 可跨多次调用共用）。
// 存不进图库的保持原样，返回 { moved, failed }。
export async function moveInlineAvatars(holders, service, seen = new Map()) {
    let moved = 0;
    let failed = 0;
    for (const holder of holders || []) {
        const avatars = holder && typeof holder === 'object' ? holder.statusAvatars : null;
        if (!avatars || typeof avatars !== 'object' || Array.isArray(avatars)) continue;
        for (const [name, value] of Object.entries(avatars)) {
            const raw = typeof value === 'string' ? value.trim() : '';
            if (!IMPORTABLE_IMAGE.test(raw)) continue;
            let url = seen.get(raw);
            if (!url) {
                url = await importAvatar(service, raw);
                if (!url) { failed += 1; continue; }
                seen.set(raw, url);
            }
            avatars[name] = url;
            moved += 1;
        }
    }
    return { moved, failed };
}
