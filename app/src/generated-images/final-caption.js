// 定稿发送边界：只允许画师前置及协议封装，不追加语义正文。
export function prefixFinalArtist(caption, artist) {
    const out = structuredClone(caption);
    for (const [side, field] of [['v4_prompt', 'positivePrompt'], ['v4_negative_prompt', 'negativePrompt']]) {
        const head = String(artist?.[field] || '').trim();
        const base = out[side].caption.base_caption;
        if (head) out[side].caption.base_caption = base.trim() ? `${head}, ${base}` : head;
    }
    return out;
}
export function promptSnapshotFromBody(body, artist) {
    const side = (node) => ({ caption: { base_caption: node.caption.base_caption,
        char_captions: node.caption.char_captions.map((c) => ({ char_caption: c.char_caption,
            ...(Array.isArray(c.centers) && { centers: c.centers.map(({ x, y }) => ({ x, y })) }) })) } });
    return { version: 1, model: body.model, action: body.action || 'generate',
        caption: { v4_prompt: side(body.parameters.v4_prompt), v4_negative_prompt: side(body.parameters.v4_negative_prompt) },
        artist: artist ? { positivePrompt: String(artist.positivePrompt || ''), negativePrompt: String(artist.negativePrompt || '') } : null };
}
