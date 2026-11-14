const MARKER_RE = /\[igs-img:\s*(\d+)\s*\]|<IMG>\s*(\d+)\s*<\/IMG>/gi;
const VOID_HTML = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function opaqueRanges(source) {
    const out = [];
    // 思维链是文本块，里面提到的标签、括号和代码示例不参与正文结构配对。
    const pattern = /<(thinking|think|subtext_think)\b[^>]*>[\s\S]*?<\/\1\s*>|```[\s\S]*?(?:```|$)|<!--[\s\S]*?(?:-->|$)/gi;
    for (const match of source.matchAll(pattern)) {
        const closed = match[1] || (match[0].startsWith('```') ? match[0].length >= 6 && match[0].endsWith('```') : match[0].endsWith('-->'));
        out.push({ start: match.index, end: closed ? match.index + match[0].length : null });
    }
    return out;
}

// 正文容器是结构检查的独立作用域；前面的未闭合示例不能延伸到这一段正文。
export function imageMarkerContentRanges(raw) {
    const source = String(raw || '');
    const opaque = opaqueRanges(source);
    const ranges = [];
    let body = null, depth = 0;
    for (const match of source.matchAll(/<content(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*>|<\/content\s*>/gi)) {
        if (opaque.some(range => range.start <= match.index && (range.end == null || match.index < range.end))) continue;
        if (match[0].startsWith('</')) {
            if (body && --depth === 0) {
                ranges.push({ ...body, closeStart: match.index, end: match.index + match[0].length });
                body = null;
            }
        } else if (!/\/\s*>$/.test(match[0])) {
            if (!body) body = { start: match.index, openEnd: match.index + match[0].length };
            depth++;
        }
    }
    if (body) ranges.push({ ...body, closeStart: source.length, end: source.length });
    return ranges;
}

function structureRanges(source) {
    const bodies = imageMarkerContentRanges(source);
    if (!bodies.length) return scanStructureRanges(source);
    const ranges = [];
    const append = (from, to) => {
        for (const range of scanStructureRanges(source.slice(from, to))) ranges.push({ ...range,
            start: from + range.start, end: range.end == null ? null : from + range.end,
            ...(range.openEnd != null && { openEnd: from + range.openEnd }),
            ...(range.closeStart != null && { closeStart: from + range.closeStart }), scopeEnd: to });
    };
    let from = 0;
    for (const body of bodies) {
        if (body.start > from) append(from, body.start);
        append(body.start, body.end);
        from = body.end;
    }
    if (from < source.length) append(from, source.length);
    return ranges;
}

function scanStructureRanges(source) {
    const ranges = [];
    const opaque = opaqueRanges(source);
    ranges.push(...opaque);
    const hidden = at => opaque.some(range => range.start <= at && (range.end == null || at < range.end));
    const brackets = [], closes = { '[': ']', '【': '】', '［': '］' };
    for (let i = 0; i < source.length; i++) {
        if (hidden(i)) continue;
        const ch = source[i];
        if (closes[ch]) brackets.push({ start: i, close: closes[ch], kind: 'bracket' });
        else if (brackets.length && brackets.at(-1).close === ch) ranges.push({ ...brackets.pop(), end: i + 1 });
    }
    // 正文里漏写闭合的括号只影响它所在的那一行，不把后面整楼都判成不能插图。
    for (const range of brackets) {
        const newline = source.indexOf('\n', range.start);
        ranges.push({ ...range, end: newline < 0 ? null : newline });
    }
    // 中文名的尖括号（<杨振宇>、<旁白>）没有闭合时是正文写法，不是 HTML 结构。
    const unclosed = range => /^[a-z]/i.test(range.name) ? { ...range, end: null } : null;
    const html = [];
    for (const match of source.matchAll(/<\/?([\p{L}_][\p{L}\p{N}_.:-]*)(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*>/gu)) {
        if (hidden(match.index)) continue;
        const name = match[1].toLowerCase();
        ranges.push({ start: match.index, end: match.index + match[0].length });
        if (match[0].startsWith('</')) {
            const at = html.findLastIndex(range => range.name === name);
            if (at < 0) continue;
            for (const unfinished of html.slice(at + 1)) { const range = unclosed(unfinished); if (range) ranges.push(range); }
            ranges.push({ ...html[at], closeStart: match.index, end: match.index + match[0].length });
            html.length = at;
        } else if (!VOID_HTML.has(name) && !/\/\s*>$/.test(match[0])) {
            html.push({ name, start: match.index, openEnd: match.index + match[0].length, container: name === 'content' });
        }
    }
    for (const pending of html) { const range = unclosed(pending); if (range) ranges.push(range); }
    return ranges;
}

export function imageMarkerBoundary(raw, index) {
    const source = String(raw || '');
    const start = Math.max(0, Math.min(source.length, Number(index) || 0));
    const ranges = structureRanges(source);
    let limit = source.length;
    for (const range of ranges) {
        if (range.container && start >= range.openEnd && (range.end == null || start <= range.end)) limit = Math.min(limit, range.closeStart ?? source.length);
    }
    let at = Math.min(start, limit);
    while (true) {
        let next = at;
        for (const range of ranges) {
            if (range.container || next <= range.start || (range.end != null && next >= range.end)
                || (range.scopeEnd != null && next >= range.scopeEnd)) continue;
            if (range.end == null) return -1;
            next = Math.max(next, range.end);
        }
        if (next > limit) return -1;
        const lineStart = source.lastIndexOf('\n', next - 1) + 1;
        if (source.slice(lineStart, next).trim()) {
            const newline = source.indexOf('\n', next);
            let end = newline < 0 ? source.length : newline;
            if (end > next && source[end - 1] === '\r') end--;
            next = Math.min(end, limit);
        }
        if (next === at) return next;
        at = next;
    }
}

export function insertImageMarkerOnLine(raw, index, token) {
    const source = String(raw || '');
    const at = imageMarkerBoundary(source, index);
    if (at < 0) return source;
    const before = source.slice(0, at), after = source.slice(at);
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    const lead = !before || /\r?\n$/.test(before) ? '' : newline;
    const trail = !after || /^\r?\n/.test(after) ? '' : newline;
    return before + lead + token + trail + after;
}

// 旧插件把标记插进标签时，只在阅读副本中移出；原消息、槽号与图片绑定保持原样。
export function normalizeImageMarkerLayout(raw) {
    let source = String(raw || '');
    const markers = [...source.matchAll(MARKER_RE)];
    for (const marker of markers.reverse()) {
        const from = marker.index, to = from + marker[0].length;
        const ranges = structureRanges(source);
        const enclosing = ranges.filter(range => !range.container && range.start < from && (range.end == null || range.end > to)
            && (range.scopeEnd == null || from < range.scopeEnd));
        const lineStart = source.lastIndexOf('\n', from - 1) + 1;
        const lineEnd = source.indexOf('\n', to);
        const ownLine = !source.slice(lineStart, from).trim() && !source.slice(to, lineEnd < 0 ? source.length : lineEnd).trim();
        const token = marker[1] ? `[igs-img:${marker[1]}]` : `<IMG>${marker[2]}</IMG>`;
        if (ownLine && !enclosing.length) {
            // 旧楼插入独占行 CG 标记时，可能在标记前后留下一行没有配对的闭括号。
            // 只清理紧贴标记、且不闭合任何括号的孤立闭符，保留原消息及其他位置的括号文本。
            const paired = at => ranges.some(range => range.kind === 'bracket' && range.end === at + 1);
            let preceding = source.slice(0, from), following = source.slice(to);
            const orphanAfter = following.match(/^(?:[ \t]*\r?\n)+[ \t]*[\]】］][ \t]*(?=\r?\n|$)/);
            if (orphanAfter && !paired(to + orphanAfter[0].search(/[\]】］]/))) following = following.slice(orphanAfter[0].length);
            const orphanBefore = preceding.match(/(?:^|\r?\n)[ \t]*([\]】］])[ \t]*(?:\r?\n[ \t]*)+$/);
            if (orphanBefore && !paired(orphanBefore.index + orphanBefore[0].indexOf(orphanBefore[1]))) preceding = preceding.slice(0, orphanBefore.index) + (orphanBefore.index ? preceding.slice(orphanBefore.index).match(/^\r?\n/)[0] : '');
            source = preceding + token + following;
            continue;
        }
        let before = source.slice(0, from), after = source.slice(to);
        if (enclosing.some(range => range.kind === 'bracket')) {
            before = before.replace(/[ \t]*(?:\r?\n[ \t]*)+$/, '');
            after = after.replace(/^(?:[ \t]*\r?\n)+[ \t]*/, '');
        }
        const clean = before + after;
        if (imageMarkerBoundary(clean, before.length) >= 0) source = insertImageMarkerOnLine(clean, before.length, token);
    }
    return source;
}
