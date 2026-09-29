// 遮罩修复编辑器控制层：加载可编辑立绘、驱动编辑会话并按 revision 保存；不直接操作存储。
import { composeMattedPixels, readAlphaFromMaskPixels } from '../../media/matte-brush.js';
import { buildAlphaMaskPixels } from '../../media/alpha-matte.js';
import { createMatteEditSession } from '../../media/matte-edit-session.js';
import { describeMatteSaveError, resolveMatteEditorMode } from './sprite-matte-editor-state.js';

function cropPixels(image, crop) {
    if (!crop) return image.data;
    const out = new Uint8ClampedArray(crop.width * crop.height * 4);
    for (let y = 0; y < crop.height; y += 1) {
        const from = ((crop.y + y) * image.width + crop.x) * 4;
        out.set(image.data.subarray(from, from + crop.width * 4), y * crop.width * 4);
    }
    return out;
}

// decodeImage(dataUrl) -> { width, height, data(RGBA) }；encodePixels({ width, height, data }) -> dataUrl。
// inpaint：createInpaintTransaction 的实例；为空时 AI 修复不可用，aiUnavailableReason 给出原因。
export async function loadMatteEditor(service, imageId, { decodeImage, encodePixels, historyLimit, inpaint = null, aiUnavailableReason = '', dna = null } = {}) {
    if (!service || typeof service.getEditableImage !== 'function') {
        return { mode: 'missing', reason: 'no-service', message: '生成素材服务不可用。' };
    }
    const loaded = await service.getEditableImage(imageId);
    const pre = resolveMatteEditorMode(loaded);
    if (pre.mode !== 'edit') return { ...pre, record: loaded && loaded.record };
    const record = loaded.record;
    let mask;
    let source;
    try {
        mask = await decodeImage(record.alphaMaskDataUrl);
        source = await decodeImage(record.workingDataUrl || record.originalDataUrl);
    } catch (error) {
        return { mode: 'readonly', reason: 'decode-failed', message: '图片解码失败，无法编辑。', record };
    }
    const state = resolveMatteEditorMode(loaded, { maskSize: mask, originalSize: source });
    if (state.mode !== 'edit') return { ...state, record };
    const alpha = readAlphaFromMaskPixels(mask.data);
    const session = createMatteEditSession({ width: mask.width, height: mask.height, alpha, autoAlpha: alpha, historyLimit });
    const sourceRgba = cropPixels(source, state.crop);
    const preview = () => ({ width: session.width, height: session.height, data: composeMattedPixels(sourceRgba, session.alpha) });
    let revision = record.revision;
    let saving = null;
    return {
        mode: 'edit',
        record,
        session,
        preview,
        get revision() { return revision; },
        aiAvailable: Boolean(inpaint),
        aiUnavailableReason: inpaint ? '' : String(aiUnavailableReason || ''),
        // 选区（遮罩坐标）按裁边偏移写入原图尺寸的修复遮罩：白色 = 需要重建。
        async aiRepair(selection, prompt) {
            if (!inpaint) return { ok: false, reason: 'image-edit-unsupported', message: aiUnavailableReason || '当前图像来源不支持局部重绘。' };
            const crop = state.crop || { x: 0, y: 0, width: source.width, height: source.height };
            const maskData = new Uint8ClampedArray(source.width * source.height * 4);
            for (let i = 3; i < maskData.length; i += 4) maskData[i] = 255;
            for (let y = 0; y < session.height; y += 1) {
                for (let x = 0; x < session.width; x += 1) {
                    if (!selection[y * session.width + x]) continue;
                    const k = ((crop.y + y) * source.width + crop.x + x) * 4;
                    maskData[k] = 255; maskData[k + 1] = 255; maskData[k + 2] = 255;
                }
            }
            const maskDataUrl = await encodePixels({ width: source.width, height: source.height, data: maskData });
            return inpaint.preview(imageId, { maskDataUrl, width: source.width, height: source.height, prompt, dna });
        },
        async acceptAi() {
            if (!inpaint) return { ok: false, reason: 'no-candidate', message: '没有可接受的 AI 候选。' };
            const r = await inpaint.accept();
            if (r && r.ok) { revision = r.revision; return r; }
            return { ...(r || {}), ok: false, message: r && r.reason === 'no-candidate' ? '没有可接受的 AI 候选。' : describeMatteSaveError(r && r.reason) };
        },
        cancelAi() { if (inpaint) inpaint.cancel(); },
        // 重复点击复用同一次提交；失败不改任何资产字段，编辑内容保留在会话中。
        save() {
            if (saving) return saving;
            saving = (async () => {
                const composed = preview();
                const dataUrl = await encodePixels(composed);
                const alphaMaskDataUrl = await encodePixels({ width: composed.width, height: composed.height, data: buildAlphaMaskPixels(composed.data) });
                const result = await service.saveMatteEdit(imageId, revision, { dataUrl, alphaMaskDataUrl });
                if (result && result.ok) {
                    revision = result.revision;
                    return result;
                }
                return { ...(result || {}), ok: false, message: describeMatteSaveError(result && result.reason) };
            })().finally(() => { saving = null; });
            return saving;
        },
    };
}
