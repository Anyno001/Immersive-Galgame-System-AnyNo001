// 遮罩修复编辑器的状态判定（纯函数）：决定可编辑、只读或不可用，并给出面向用户的说明。
// 首版只编辑 igs-gen: 生成立绘；legacy 记录无原图，只能查看，不显示虚假的恢复按钮。

const validCrop = (c) => Boolean(c) && [c.x, c.y, c.width, c.height].every((v) => Number.isInteger(v) && v >= 0) && c.width > 0 && c.height > 0;

// maskSize / originalSize：{ width, height }，由调用方解码图片后提供。
export function resolveMatteEditorMode(loaded, { maskSize = null, originalSize = null } = {}) {
    if (!loaded || loaded.ok === false || !loaded.record) {
        return { mode: 'missing', reason: (loaded && loaded.reason) || 'not-found', message: '找不到这张生成立绘，可能已被删除。' };
    }
    const record = loaded.record;
    if (!loaded.editable) {
        return { mode: 'readonly', reason: 'source-unavailable', message: '这张立绘是旧版本生成的，没有保存原图，无法恢复已被抠掉的像素。可以下载当前结果，或重新生成 / 重新导入后再修复。' };
    }
    if (!record.alphaMaskDataUrl) {
        return { mode: 'readonly', reason: 'mask-missing', message: '这张立绘没有保存抠图遮罩，请使用「从原图重新自动抠图」后再编辑。', canRematte: true };
    }
    if (maskSize && originalSize) {
        const crop = validCrop(record.matteCrop)
            ? record.matteCrop
            : { x: 0, y: 0, width: originalSize.width, height: originalSize.height };
        const fits = crop.x + crop.width <= originalSize.width && crop.y + crop.height <= originalSize.height;
        if (!fits || crop.width !== maskSize.width || crop.height !== maskSize.height) {
            return { mode: 'readonly', reason: 'mask-size-mismatch', message: '原图与遮罩尺寸对不上，无法安全编辑。请使用「从原图重新自动抠图」。', canRematte: true };
        }
        return { mode: 'edit', reason: '', message: '', crop };
    }
    return { mode: 'edit', reason: '', message: '', crop: validCrop(record.matteCrop) ? record.matteCrop : null };
}

// 用户可见的保存失败说明；不包含原图、密钥或请求内容。
export function describeMatteSaveError(reason) {
    if (reason === 'stale-revision') return '这张立绘已在别处被修改，本次修改未保存。请关闭后重新打开再编辑。';
    if (reason === 'source-unavailable') return '这张立绘没有保存原图，无法保存修复结果。';
    if (reason === 'not-found') return '这张立绘已被删除，本次修改未保存。';
    if (reason === 'update-unsupported') return '当前存储不支持修复保存。';
    if (reason === 'empty-result') return '修复结果为空，已放弃保存。';
    return '保存失败，当前修改仍保留在编辑器中。';
}
