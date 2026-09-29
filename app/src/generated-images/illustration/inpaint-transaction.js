// AI 局部重绘事务：必须由用户显式触发；预览只在内存中，接受时按 revision 原子写入。
// 取消、失败、超时、过期都不写任何资产字段；originalDataUrl 永不改写。AI 结果是生成式重建，不是像素恢复。
import { buildCharacterDnaPromptParts, mergePromptTags } from '../../scene/character-dna.js';

export const INPAINT_KEEP_TAGS = 'same character, consistent hair color, consistent hairstyle, same face, same viewpoint, same lighting, detailed hair strands';

// 顺序：DNA（triggerWords → identity）→ 用户修复说明 → 固定保持项；负向只用 DNA negative。
export function buildInpaintPrompt({ prompt = '', dna = null } = {}) {
    const parts = dna ? buildCharacterDnaPromptParts(dna) : { positive: '', negative: '' };
    return { positive: mergePromptTags(parts.positive, prompt, INPAINT_KEEP_TAGS), negative: parts.negative };
}

function normalizeMatteResult(raw, fallback) {
    if (typeof raw === 'string') return { dataUrl: raw || fallback, alphaMaskDataUrl: '', crop: null };
    const r = raw && typeof raw === 'object' ? raw : {};
    return {
        dataUrl: typeof r.dataUrl === 'string' && r.dataUrl ? r.dataUrl : fallback,
        alphaMaskDataUrl: typeof r.alphaMaskDataUrl === 'string' ? r.alphaMaskDataUrl : '',
        crop: r.diagnostics && r.diagnostics.crop ? { ...r.diagnostics.crop } : null,
    };
}

// service：getEditableImage / saveMatteEdit；backend：describeEdit / edit；matte：自动抠图（支持 detailed）。
export function createInpaintTransaction({ service, backend, matte }) {
    let inflight = null;
    let candidate = null;
    const rematte = async (dataUrl) => normalizeMatteResult(await matte(dataUrl, { detailed: true }), dataUrl);

    // options：{ maskDataUrl, width, height, prompt, dna, strength }；遮罩为原图尺寸，由调用方提供。
    function preview(imageId, options = {}) {
        if (inflight) return inflight;
        inflight = (async () => {
            const capability = backend && typeof backend.describeEdit === 'function'
                ? backend.describeEdit()
                : { supported: false, reason: 'image-edit-unsupported', message: '当前图像来源不支持局部重绘' };
            if (!capability.supported) return { ok: false, reason: capability.reason, message: capability.message };
            const loaded = await service.getEditableImage(imageId);
            if (!loaded || !loaded.ok) return { ok: false, reason: (loaded && loaded.reason) || 'not-found' };
            if (!loaded.editable) return { ok: false, reason: 'source-unavailable', message: '这张立绘没有保存原图，无法局部重绘。' };
            const record = loaded.record;
            const prompt = buildInpaintPrompt({ prompt: options.prompt, dna: options.dna });
            const result = await backend.edit({
                sourceDataUrl: record.workingDataUrl || record.originalDataUrl,
                maskDataUrl: options.maskDataUrl,
                prompt: prompt.positive,
                negative: prompt.negative,
                width: options.width,
                height: options.height,
                strength: options.strength,
            });
            if (!result || !result.ok || !result.dataUrl) {
                candidate = null;
                return { ok: false, reason: (result && result.reason) || 'edit-failed', message: (result && result.error) || '局部重绘失败' };
            }
            candidate = { imageId, revision: record.revision, dataUrl: result.dataUrl };
            return { ok: true, candidateDataUrl: result.dataUrl };
        })().catch(() => {
            candidate = null;
            return { ok: false, reason: 'edit-failed', message: '局部重绘失败' };
        }).finally(() => { inflight = null; });
        return inflight;
    }

    async function accept() {
        if (!candidate) return { ok: false, reason: 'no-candidate' };
        const c = candidate;
        const matted = await rematte(c.dataUrl);
        const saved = await service.saveMatteEdit(c.imageId, c.revision, {
            workingDataUrl: c.dataUrl,
            dataUrl: matted.dataUrl,
            alphaMaskDataUrl: matted.alphaMaskDataUrl,
            matteCrop: matted.crop,
        });
        // 成功或已过期都丢弃候选；其他失败保留候选以便重试接受。
        if ((saved && saved.ok) || (saved && saved.reason === 'stale-revision')) candidate = null;
        return saved || { ok: false, reason: 'update-failed' };
    }

    function cancel() { candidate = null; }

    // 恢复首次原图：清除 workingDataUrl 并从原图重新自动抠图。
    async function restoreOriginal(imageId) {
        const loaded = await service.getEditableImage(imageId);
        if (!loaded || !loaded.ok) return { ok: false, reason: (loaded && loaded.reason) || 'not-found' };
        if (!loaded.editable) return { ok: false, reason: 'source-unavailable' };
        const record = loaded.record;
        const matted = await rematte(record.originalDataUrl);
        candidate = null;
        return service.saveMatteEdit(imageId, record.revision, {
            workingDataUrl: '',
            dataUrl: matted.dataUrl,
            alphaMaskDataUrl: matted.alphaMaskDataUrl,
            matteCrop: matted.crop,
        });
    }

    return { preview, accept, cancel, restoreOriginal, hasCandidate: () => Boolean(candidate) };
}
