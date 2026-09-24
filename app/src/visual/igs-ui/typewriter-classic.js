// Read the already-rendered text once. No text node is modified by the reveal.
const segmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

function* graphemes(value) {
    if (segmenter) {
        for (const part of segmenter.segment(value)) yield { text: part.segment, start: part.index, end: part.index + part.segment.length };
    } else {
        let offset = 0;
        for (const text of Array.from(value)) {
            yield { text, start: offset, end: offset += text.length };
        }
    }
}

function* textNodes(root) {
    for (const node of root.childNodes || []) {
        if (node.nodeType === 3) yield node;
        else yield* textNodes(node);
    }
}

const percent = (part, total) => `${Math.max(0, Math.min(100, part / total * 100)).toFixed(4)}%`;

function mask(rect, bounds, isFirst) {
    // 统一 6 顶点同构多边形：配合 steps(1, end)，避免相邻帧顶点数不一致时的离散跳变与插值形变。
    if (!rect) return 'polygon(0 0, 0 0, 0 0, 0 0, 0 0, 0 0)';
    const top = isFirst ? '0%' : percent(rect.top - bounds.top, bounds.height);
    const bottom = percent(rect.bottom - bounds.top, bounds.height);
    const right = percent(rect.right - bounds.left, bounds.width);
    return `polygon(0 0, 100% 0, 100% ${top}, ${right} ${top}, ${right} ${bottom}, 0 ${bottom})`;
}

function visualLineOverlap(line, rect) {
    const lineHeight = Math.max(1, line.bottom - line.top);
    const rectHeight = Math.max(1, rect.bottom - rect.top);
    const overlap = Math.max(0, Math.min(line.bottom, rect.bottom) - Math.max(line.top, rect.top));
    return overlap / Math.min(lineHeight, rectHeight);
}

export function measureClassicReveal(target, speed) {
    const doc = target && target.ownerDocument;
    if (!doc || typeof doc.createRange !== 'function' || typeof target.getBoundingClientRect !== 'function') return null;
    const bounds = target.getBoundingClientRect();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    const range = doc.createRange();
    const lines = [];
    // 字素按 DOM 遍历顺序保留；视觉行只提供垂直遮罩边界。
    const parts = [];
    try {
        for (const node of textNodes(target)) {
            for (const part of graphemes(String(node.nodeValue || ''))) {
                range.setStart(node, part.start);
                range.setEnd(node, part.end);
                const rect = Array.from(range.getClientRects()).find(item => item.width > 0 && item.height > 0);
                if (!rect) continue;
                if (rect.right < bounds.left || rect.left > bounds.right || rect.top < bounds.top || rect.bottom > bounds.bottom) return null;

                let line = null;
                let bestOverlap = 0;
                for (const candidate of lines) {
                    const overlap = visualLineOverlap(candidate, rect);
                    if (overlap > bestOverlap) {
                        line = candidate;
                        bestOverlap = overlap;
                    }
                }
                if (!line || bestOverlap < 0.5) {
                    line = { top: rect.top, bottom: rect.bottom, index: lines.length };
                    lines.push(line);
                } else {
                    line.top = Math.min(line.top, rect.top);
                    line.bottom = Math.max(line.bottom, rect.bottom);
                }
                parts.push({ text: part.text, line, rect });
            }
        }
    } catch {
        return null;
    } finally {
        range.detach?.();
    }
    if (!lines.length) return null;
    // Keep DOM traversal order; line metadata only supplies the vertical mask bounds.
    const steps = parts.map(part => ({
        text: part.text,
        isFirstLine: part.line.index === 0,
        rect: {
            top: part.line.top, bottom: part.line.bottom, right: part.rect.right,
        },
    }));
    const duration = steps.length * speed;
    const frames = [{ offset: 0, clipPath: mask(null), easing: 'steps(1, end)' }];
    const events = [];
    for (let index = 0; index < steps.length; index += 1) {
        const offset = (index + 1) / steps.length;
        const next = mask(steps[index].rect, bounds, steps[index].isFirstLine);
        frames.push({ offset, clipPath: next, easing: 'steps(1, end)' });
        events.push({ timeMs: (index + 1) * speed, text: steps[index].text });
    }
    // Complete when the last grapheme appears; cancellation always reveals the full DOM.
    frames.push({ offset: 1, clipPath: 'inset(0 0 0 0)' });
    return { frames, events, duration };
}
