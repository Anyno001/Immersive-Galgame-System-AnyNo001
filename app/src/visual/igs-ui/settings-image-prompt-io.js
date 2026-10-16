// 只读取用户显式选择的文件；原始文本交给预设解析器检测重复键。
export function pickImagePromptFile(globalObj = globalThis) {
    const doc = globalObj.document;
    if (!doc?.createElement) return Promise.resolve({ ok: false, reason: 'prompt-file-picker-unavailable' });
    return new Promise(resolve => {
        const input = doc.createElement('input');
        input.type = 'file'; input.accept = '.json,application/json'; input.style.display = 'none';
        let done = false;
        const finish = result => {
            if (done) return;
            done = true; clearTimeout(timer); input.remove?.(); resolve(result);
        };
        const timer = setTimeout(() => finish({ ok: true, cancelled: true }), 300000);
        input.addEventListener('cancel', () => finish({ ok: true, cancelled: true }));
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return finish({ ok: true, cancelled: true });
            try {
                if (typeof file.text === 'function') return finish({ ok: true, text: await file.text() });
                const Reader = globalObj.FileReader;
                if (!Reader) return finish({ ok: false, reason: 'prompt-file-read-unavailable' });
                const reader = new Reader();
                reader.onload = () => finish({ ok: true, text: String(reader.result) });
                reader.onerror = () => finish({ ok: false, reason: 'prompt-file-read-failed' });
                reader.readAsText(file, 'UTF-8');
            } catch { finish({ ok: false, reason: 'prompt-file-read-failed' }); }
        });
        try { doc.body?.appendChild(input); input.click(); }
        catch { finish({ ok: false, reason: 'prompt-file-picker-unavailable' }); }
    });
}

export function downloadImagePromptPreset(globalObj, preset) {
    const doc = globalObj?.document, urlApi = globalObj?.URL || globalThis.URL;
    const BlobClass = globalObj?.Blob || globalThis.Blob;
    if (!doc?.createElement || !urlApi?.createObjectURL || !BlobClass)
        return { ok: false, reason: 'prompt-download-unavailable' };
    let url, link;
    try {
        url = urlApi.createObjectURL(new BlobClass([JSON.stringify(preset, null, 2)], { type: 'application/json;charset=utf-8' }));
        link = doc.createElement('a'); link.href = url;
        link.download = `${String(preset.id).replace(/[\\/:*?"<>|]/g, '_')}.json`;
        doc.body?.appendChild(link); link.click();
        return { ok: true };
    } catch { return { ok: false, reason: 'prompt-download-failed' }; }
    finally { link?.remove?.(); if (url) setTimeout(() => urlApi.revokeObjectURL(url), 1000); }
}
