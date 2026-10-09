// 漫画对话泡的竖排排版（纯函数 + 少量 DOM 工具）。
// 规则照日漫 / 港台官方中文版：竖排、天揃え（各列顶端对齐）、文字块在泡里居中；
// 列长中间略长两侧略短、读序靠前的列略长；断列优先落在标点与虚词之后；
// 避头尾：句读与后引号不出现在列首（放不下时挂在上一列末尾），前引号不留在列尾；末列不孤字。

// 列首禁则：这些符号不能开始一列。
const NO_START = new Set('，。、．,.！？!?；：:;）)」』】〕》〉’”…—～ー々ぁぃぅぇぉっゃゅょ'.split(''));
// 列尾禁则：这些符号不能结束一列。
const NO_END = new Set('（(「『【〔《〈‘“'.split(''));
// 允许挂在列尾超出一格的句读（ぶら下げ）。
const HANG = new Set('，。、,.'.split(''));
// 句读之后是最好的断点，虚词之后次之。
const SENTENCE_AFTER = new Set('。！？!?…」』）)”'.split(''));
const CLAUSE_AFTER = new Set('，、；：,;:'.split(''));
const PARTICLES = new Set('的了吗呢吧啊呀哦嘛着过地得'.split(''));
// 修饰后文的字（不、很、也、把……）后面断开会把词组拆散。
const BIND_AFTER = new Set('不没别很最太再更都也还又才就把被让给向从在对跟和与是一这那'.split(''));
// 单字后缀（图书「馆」、他「们」、家「里」）分词器常切成独立的词，换列时仍要跟着前文。
const SUFFIX = new Set('馆室店厅院场楼园站部局所班们家者员里边面时候性化式型'.split(''));
const LATIN_RUN = /[A-Za-z][A-Za-z0-9'’.\-]*/y;
const DIGIT_RUN = /[0-9]+/y;
const BANG_RUN = /[！？!?]{2,3}/y;

// 竖排里的计量单位是「格」（一个汉字的高度）。拉丁字母横躺占约半格；两位以内的数字、「!?」组合直立成一格（纵中横）。
export function tokenizeVertical(text) {
    const src = String(text == null ? '' : text);
    const tokens = [];
    let i = 0;
    while (i < src.length) {
        const ch = src[i];
        if (ch === '\n') {
            tokens.push({ start: i, end: i + 1, len: 0, hard: true, text: ch });
            i += 1;
            continue;
        }
        if (ch === ' ' || ch === '　' || ch === '\t') {
            tokens.push({ start: i, end: i + 1, len: 0.5, space: true, text: ch });
            i += 1;
            continue;
        }
        BANG_RUN.lastIndex = i;
        const bang = BANG_RUN.exec(src);
        if (bang) {
            const raw = bang[0];
            // 全角感叹问号两枚直立成一格；三枚以上前两枚成格，余下照常。
            const take = raw.length >= 2 ? 2 : raw.length;
            tokens.push({ start: i, end: i + take, len: 1, tcy: true, text: raw.slice(0, take) });
            i += take;
            continue;
        }
        DIGIT_RUN.lastIndex = i;
        const digits = DIGIT_RUN.exec(src);
        if (digits) {
            const raw = digits[0];
            if (raw.length <= 2) tokens.push({ start: i, end: i + raw.length, len: 1, tcy: raw.length === 2, text: raw });
            else tokens.push({ start: i, end: i + raw.length, len: raw.length * 0.55, latin: true, text: raw });
            i += raw.length;
            continue;
        }
        LATIN_RUN.lastIndex = i;
        const latin = LATIN_RUN.exec(src);
        if (latin) {
            const raw = latin[0];
            tokens.push({ start: i, end: i + raw.length, len: Math.max(1, raw.length * 0.55), latin: true, text: raw });
            i += raw.length;
            continue;
        }
        // 省略号、破折号成对出现时不拆开。
        if ((ch === '…' || ch === '—') && src[i + 1] === ch) {
            tokens.push({ start: i, end: i + 2, len: 2, text: ch + ch, noStart: true });
            i += 2;
            continue;
        }
        const cp = src.codePointAt(i);
        const width = cp > 0xffff ? 2 : 1;
        tokens.push({ start: i, end: i + width, len: 1, text: src.slice(i, i + width) });
        i += width;
    }
    for (const token of tokens) {
        const first = token.text[0];
        const last = token.text[token.text.length - 1];
        if (NO_START.has(first)) token.noStart = true;
        if (NO_END.has(last)) token.noEnd = true;
        if (token.text.length === 1 && HANG.has(first)) token.hang = true;
    }
    return tokens;
}

// 西文为主（字母占可见字符四成以上）的句子不竖排，改横排。
export function prefersHorizontal(text) {
    const visible = String(text || '').replace(/\s+/g, '');
    if (!visible) return false;
    const letters = (visible.match(/[A-Za-z]/g) || []).length;
    return letters / visible.length >= 0.4;
}

// 中文分词边界（浏览器自带 ICU 词典）：换列尽量落在词与词之间。不支持时返回 null，退回逐字。
export function wordBoundaries(text) {
    try {
        if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null;
        const seg = new Intl.Segmenter('zh', { granularity: 'word' });
        const set = new Set();
        for (const part of seg.segment(String(text || ''))) set.add(part.index);
        return set;
    } catch {
        return null;
    }
}

function breakBonus(prev, next, words) {
    if (!prev) return 0;
    // 把一个词拆到两列：仅次于禁则的大忌。
    if (words && next && !words.has(next.start)) return 12;
    if (next && next.text.length === 1 && SUFFIX.has(next.text)) return 4;
    const last = prev.text[prev.text.length - 1];
    // 语气词、助词粘着前文：换列后落在列首很难看。
    if (next && PARTICLES.has(next.text[0])) return 3;
    // 官方嵌字几乎总在句读处换列：奖励要大到能压过一两格的长短差。
    if (SENTENCE_AFTER.has(last)) return -8;
    if (CLAUSE_AFTER.has(last)) return -6.5;
    if (PARTICLES.has(last)) return -1;
    if (BIND_AFTER.has(last)) return 2.5;
    return 0;
}

// 列长目标：读序第 i 列（右起）。顶端对齐时中间列略长、两侧略短，越往后越收一点，整体贴合椭圆泡。
export function columnTargets(total, count) {
    if (count <= 1) return [total];
    const weights = [];
    for (let i = 0; i < count; i += 1) {
        const x = (2 * i - (count - 1)) / (count - 1);
        weights.push((0.8 + 0.2 * Math.sqrt(Math.max(0, 1 - x * x))) * (1 - 0.06 * i / (count - 1)));
    }
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => total * w / sum);
}

// 估一个合适的列数：竖排泡要细长（列长约为泡宽的两三倍），十来个字以内一列到底。
export function idealColumnCount(total, maxLen) {
    let count = Math.max(1, Math.round(Math.sqrt(total / 4.5)));
    while (total / count > maxLen) count += 1;
    return count;
}

function columnCost(len, target, maxLen, hangAllowed) {
    const limit = maxLen + (hangAllowed ? 1 : 0);
    if (len > limit + 1e-6) return Infinity;
    const dev = len - target;
    return dev > 0 ? dev * dev * 0.8 : dev * dev * 0.5;
}

// 动态规划选断点：返回每列的 token 区间 [from, to)。forced 的换行必须断开。
function solveColumns(tokens, count, maxLen, words) {
    const n = tokens.length;
    const total = tokens.reduce((sum, t) => sum + t.len, 0);
    const targets = columnTargets(total, count);
    const prefix = [0];
    for (const t of tokens) prefix.push(prefix[prefix.length - 1] + t.len);
    const hardAt = tokens.map((t) => t.hard === true);
    // 句读夹在列中间（明明可以在那里换列却没换）读起来别扭：按个数加代价。
    const pauses = [0];
    tokens.forEach((t, k) => {
        const last = t.text[t.text.length - 1];
        const next = tokens[k + 1];
        pauses.push(pauses[k] + ((SENTENCE_AFTER.has(last) || CLAUSE_AFTER.has(last)) && next && !next.noStart ? 1 : 0));
    });
    const INF = Infinity;
    // dp[c][j]：前 j 个 token 排成 c 列的最小代价。
    const dp = Array.from({ length: count + 1 }, () => new Array(n + 1).fill(INF));
    const from = Array.from({ length: count + 1 }, () => new Array(n + 1).fill(-1));
    dp[0][0] = 0;
    const boundaryOk = (j) => {
        if (j <= 0 || j >= n) return true;
        const prev = tokens[j - 1];
        const next = tokens[j];
        if (next.noStart && !next.hard) return false;
        if (prev.noEnd) return false;
        return true;
    };
    for (let c = 1; c <= count; c += 1) {
        for (let j = 1; j <= n; j += 1) {
            if (c === count && j !== n) continue;
            if (!boundaryOk(j)) continue;
            // 换行处若不是列的结尾，就不能出现在列中间。
            for (let i = j - 1; i >= 0; i -= 1) {
                if (dp[c - 1][i] === INF) continue;
                let crossesHard = false;
                for (let k = i; k < j - 1; k += 1) if (hardAt[k]) { crossesHard = true; break; }
                if (crossesHard) break;
                const last = tokens[j - 1];
                const len = prefix[j] - prefix[i];
                const cost = columnCost(len, targets[c - 1], maxLen, Boolean(last.hang));
                if (cost === INF) {
                    if (len > maxLen + 1) break;
                    continue;
                }
                let total2 = dp[c - 1][i] + cost + (pauses[j - 1] - pauses[i]) * 3.5 + (j < n ? breakBonus(tokens[j - 1], tokens[j], words) : 0);
                // 末列不孤字：只剩一个字（或一个标点）单独成列很难看。
                if (c === count && count > 1 && len < 1.6) total2 += 9;
                if (total2 < dp[c][j]) {
                    dp[c][j] = total2;
                    from[c][j] = i;
                }
            }
        }
    }
    if (dp[count][n] === INF) return null;
    const ranges = [];
    let j = n;
    for (let c = count; c >= 1; c -= 1) {
        const i = from[c][j];
        ranges.unshift([i, j]);
        j = i;
    }
    return { ranges, cost: dp[count][n] };
}

// 竖排断列：返回各列在原文里的字符偏移 [start, end)、列长（格）与纵中横区间。
export function planVerticalColumns(text, { maxLen = 10 } = {}) {
    const tokens = tokenizeVertical(text);
    const visible = tokens.filter((t) => !t.hard);
    if (!visible.length) return { columns: [], tcy: [], lengths: [] };
    const total = visible.reduce((sum, t) => sum + t.len, 0);
    const hardCount = tokens.filter((t) => t.hard).length;
    const base = Math.max(idealColumnCount(total, maxLen), hardCount + 1);
    const words = wordBoundaries(text);
    let best = null;
    for (let count = base; count <= base + 3; count += 1) {
        const solved = solveColumns(tokens, count, maxLen, words);
        if (!solved) continue;
        // 多一列多一点代价：能少一列就少一列。
        const score = solved.cost + (count - base) * 6;
        if (!best || score < best.score) best = { ...solved, score };
        if (best && count > base) break;
    }
    if (!best) {
        // 实在排不进（超长西文单词等）：按 maxLen 硬切。
        const ranges = [];
        let start = 0;
        let len = 0;
        tokens.forEach((t, index) => {
            if (len + t.len > maxLen && index > start) {
                ranges.push([start, index]);
                start = index;
                len = 0;
            }
            len += t.len;
        });
        ranges.push([start, tokens.length]);
        best = { ranges };
    }
    const columns = [];
    const lengths = [];
    for (const [i, j] of best.ranges) {
        const slice = tokens.slice(i, j).filter((t) => !t.hard);
        if (!slice.length) continue;
        columns.push([slice[0].start, slice[slice.length - 1].end]);
        lengths.push(slice.reduce((sum, t) => sum + t.len, 0));
    }
    const tcy = tokens.filter((t) => t.tcy).map((t) => [t.start, t.end]);
    return { columns, tcy, lengths };
}

// 长台词拆成几个连着的泡：在句末断开，句子太长再退到逗号；最多 maxParts 个泡，返回各段的 [start, end)。
const SENTENCE_END = /[。！？!?…]+[」』”"’）)]*/g;
const CLAUSE_END = /[，、；,;：:]+/g;

function cutPoints(text, pattern) {
    const points = [];
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text))) {
        const at = m.index + m[0].length;
        if (at > 0 && at < text.length) points.push(at);
    }
    return points;
}

function visibleLength(text) {
    return String(text).replace(/\s+/g, '').length;
}

export function splitBubbleChunks(text, { limit = 30, maxParts = 3 } = {}) {
    const src = String(text == null ? '' : text);
    if (visibleLength(src) <= limit * 1.2) return [[0, src.length]];
    let points = cutPoints(src, SENTENCE_END);
    const pieces = [];
    let start = 0;
    for (const at of [...points, src.length]) {
        pieces.push([start, at]);
        start = at;
    }
    // 一句就超长：在逗号处再切。
    const fine = [];
    for (const [a, b] of pieces) {
        if (visibleLength(src.slice(a, b)) <= limit * 1.3) { fine.push([a, b]); continue; }
        let s = a;
        for (const at of cutPoints(src.slice(a, b), CLAUSE_END).map((p) => p + a)) {
            if (visibleLength(src.slice(s, at)) >= limit * 0.5) { fine.push([s, at]); s = at; }
        }
        fine.push([s, b]);
    }
    // 贪心合并到不超过 limit。
    const chunks = [];
    let cur = null;
    for (const piece of fine) {
        if (!cur) { cur = piece.slice(); continue; }
        if (visibleLength(src.slice(cur[0], piece[1])) <= limit) cur[1] = piece[1];
        else { chunks.push(cur); cur = piece.slice(); }
    }
    if (cur) chunks.push(cur);
    // 太短的尾巴并回前一个泡。
    if (chunks.length > 1 && visibleLength(src.slice(...chunks[chunks.length - 1])) < 4) {
        const tail = chunks.pop();
        chunks[chunks.length - 1][1] = tail[1];
    }
    while (chunks.length > maxParts) {
        // 合并相邻最短的一对，保持泡的大小相近。
        let bestIndex = 0;
        let bestLen = Infinity;
        for (let i = 0; i < chunks.length - 1; i += 1) {
            const len = visibleLength(src.slice(chunks[i][0], chunks[i + 1][1]));
            if (len < bestLen) { bestLen = len; bestIndex = i; }
        }
        chunks.splice(bestIndex, 2, [chunks[bestIndex][0], chunks[bestIndex + 1][1]]);
    }
    return chunks.filter(([a, b]) => visibleLength(src.slice(a, b)) > 0);
}

// —— DOM 工具 ——
// 注音（rt / rp）不计入正文偏移：它们随所在的 ruby 整体复制。
function isSkipped(node) {
    const tag = node && node.nodeType === 1 ? String(node.tagName || '').toLowerCase() : '';
    return tag === 'rt' || tag === 'rp';
}

export function readPlainText(root) {
    let out = '';
    const walk = (node) => {
        for (const child of Array.from(node.childNodes || [])) {
            if (child.nodeType === 3) out += child.nodeValue;
            else if (child.nodeType === 1 && !isSkipped(child)) {
                if (String(child.tagName).toLowerCase() === 'br') out += '\n';
                else walk(child);
            }
        }
    };
    walk(root);
    return out;
}

// 复制 root 里正文偏移 [start, end) 的部分，保留外层的特效、物品名等标签。
export function sliceRichText(root, start, end, doc) {
    const frag = doc.createDocumentFragment();
    let offset = 0;
    const copy = (node, parent) => {
        for (const child of Array.from(node.childNodes || [])) {
            if (offset >= end) return;
            if (child.nodeType === 3) {
                const text = child.nodeValue;
                const a = Math.max(start, offset);
                const b = Math.min(end, offset + text.length);
                if (b > a) parent.appendChild(doc.createTextNode(text.slice(a - offset, b - offset)));
                offset += text.length;
            } else if (child.nodeType === 1) {
                if (isSkipped(child)) {
                    if (offset > start && offset <= end) parent.appendChild(child.cloneNode(true));
                    continue;
                }
                if (String(child.tagName).toLowerCase() === 'br') {
                    if (offset >= start && offset < end) parent.appendChild(doc.createTextNode('\n'));
                    offset += 1;
                    continue;
                }
                const before = offset;
                const shell = child.cloneNode(false);
                copy(child, shell);
                if (offset > start && before < end && shell.childNodes.length) parent.appendChild(shell);
            }
        }
    };
    copy(root, frag);
    return frag;
}

// 在容器里按断列偏移插入换列，把纵中横区间包成直立的一格，并去掉原文换行（换行已作为断列）。
export function applyColumnBreaks(container, plan, doc) {
    const breaks = new Set(plan.columns.slice(1).map(([a]) => a));
    const tcyStarts = new Map(plan.tcy.map(([a, b]) => [a, b]));
    let offset = 0;
    const walk = (node) => {
        for (const child of Array.from(node.childNodes || [])) {
            if (child.nodeType === 1) {
                if (!isSkipped(child)) walk(child);
                continue;
            }
            if (child.nodeType !== 3) continue;
            const text = child.nodeValue;
            const base = offset;
            offset += text.length;
            const cuts = [];
            for (let k = 0; k < text.length; k += 1) {
                const at = base + k;
                if (breaks.has(at)) cuts.push({ at: k, kind: 'br' });
                if (tcyStarts.has(at)) cuts.push({ at: k, kind: 'tcy', end: tcyStarts.get(at) - base });
                if (text[k] === '\n') cuts.push({ at: k, kind: 'nl' });
            }
            if (!cuts.length) continue;
            const frag = doc.createDocumentFragment();
            let k = 0;
            const flush = (until) => { if (until > k) frag.appendChild(doc.createTextNode(text.slice(k, until))); k = Math.max(k, until); };
            // 换列位置若落在逐字特效的单字 span 内，要把 <br> 放到 span 外面。
            const charSpan = node.classList && node.classList.contains('igs-tfx-ch') ? node : null;
            for (const cut of cuts) {
                if (cut.at < k) continue;
                flush(cut.at);
                if (cut.kind === 'br') {
                    if (charSpan && cut.at === 0 && charSpan.parentNode) charSpan.parentNode.insertBefore(doc.createElement('br'), charSpan);
                    else frag.appendChild(doc.createElement('br'));
                } else if (cut.kind === 'nl') {
                    k = cut.at + 1;
                } else if (cut.kind === 'tcy') {
                    const end = Math.min(text.length, cut.end);
                    const span = doc.createElement('span');
                    span.className = 'igs-comic-tcy';
                    span.textContent = text.slice(cut.at, end).replace(/！/g, '!').replace(/？/g, '?');
                    frag.appendChild(span);
                    k = end;
                }
            }
            flush(text.length);
            node.replaceChild(frag, child);
        }
    };
    walk(container);
}
