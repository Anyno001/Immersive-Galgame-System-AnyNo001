// 直播自动字幕的文字：把台词改成平台语音识别的样子。在阅读器写完正文之后、打字机量排版之前改文本节点，
// 打字机按改过的文字逐字揭示；离开字幕模式时换回原文。只动文本节点的值，不动标签结构（引号着色、双语注音、物品名都保留）。
// 去标点：句中标点变空格（字幕在空格处断行，见 danmaku-style 的 keep-all），引号括号省略号直接去掉。
// 识别错字（开关默认关）：偶尔把一个字换成同音字，这句打完后过一会儿自己改回来。

// 括号里的短动作提示（小声）（叹气）听不见，整段去掉；引号书名号去掉；停顿类标点和省略号、破折号变断句。
const ASIDE_RE = /[（(][^（）()]{1,12}[）)]/g;
const DROP_RE = /[“”‘’"「」『』《》【】（）()〔〕［］~～·•]+/g;
const BREAK_RE = /[，,。！!？?；;：:、…⋯—–]+/g;
// 时间里的冒号（9:30）不当标点：先换成占位符，断句后换回。
const KEEP_NUM_RE = /(\d)[:：](?=\d)/g;
const NUM_MARK = '\u0000';

// 同音、常被语音识别弄混的单字；只取不改语义理解难度的一类。
export const CC_HOMOPHONES = Object.freeze({
    的: '得', 得: '的', 在: '再', 再: '在', 做: '作', 他: '她', 她: '他', 已: '以', 那: '哪', 吗: '嘛',
    是: '事', 到: '道', 道: '到', 会: '回', 心: '新', 意: '义', 见: '件', 很: '狠', 带: '戴', 象: '像',
    像: '向', 进: '近', 近: '进', 话: '画', 知: '只', 想: '响', 晚: '碗', 今: '金', 天: '添', 说: '硕',
});
const TYPO_CHANCE = 0.4;
const TYPO_FIX_MIN_MS = 450;
const TYPO_FIX_SPAN_MS = 500;
const TYPEWRITER_WAIT_STEP_MS = 200;
const TYPEWRITER_WAIT_MAX_MS = 15000;

export function captionText(value) {
    return String(value == null ? '' : value)
        .replace(KEEP_NUM_RE, `$1${NUM_MARK}`)
        .replace(ASIDE_RE, ' ')
        .replace(DROP_RE, '')
        .replace(BREAK_RE, ' ')
        .replace(new RegExp(NUM_MARK, 'g'), ':')
        .replace(/[ \t　]+/g, ' ');
}

function hashOf(text) {
    let h = 2166136261;
    for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return h;
}

function* textNodes(root) {
    for (const node of Array.from(root.childNodes || [])) {
        if (node.nodeType === 3) yield node;
        else if (node.nodeType === 1) yield* textNodes(node);
    }
}

// 同一页每次算出的位置都一样（按页标记散列），重渲染不会换一个字错。
export function pickCaptionTypo(chars, seed) {
    const candidates = [];
    chars.forEach((ch, index) => { if (CC_HOMOPHONES[ch]) candidates.push(index); });
    if (!candidates.length) return -1;
    const h = hashOf(seed);
    if ((h % 1000) / 1000 >= TYPO_CHANCE) return -1;
    return candidates[(h >>> 10) % candidates.length];
}

const states = new WeakMap();

function restore(textEl, state) {
    if (state.fixTimer && state.clear) state.clear(state.fixTimer);
    if (state.html != null && textEl.dataset && textEl.dataset.igsTextRenderKey === state.key) textEl.innerHTML = state.html;
    states.delete(textEl);
}

// on：本页台词走自动字幕；key：阅读器写正文时记下的渲染标记（换页 / 正文变了就会变）。
export function applyCaptionText(textEl, { on, typos = false, seed = '', schedule = setTimeout, clear = clearTimeout } = {}) {
    if (!textEl || !textEl.dataset) return;
    const key = textEl.dataset.igsTextRenderKey || '';
    const prev = states.get(textEl);
    if (prev && (prev.key !== key || !on || prev.typos !== typos)) {
        restore(textEl, prev);
        // 正文已经换成新一页：上一页的原文不用写回，只清状态。
    }
    if (!on || !key) return;
    if (states.get(textEl)) return;
    const state = { key, typos, html: textEl.innerHTML, fixTimer: null, clear };
    states.set(textEl, state);
    const nodes = Array.from(textNodes(textEl));
    nodes.forEach((node, index) => {
        let value = captionText(node.nodeValue);
        if (index === 0) value = value.replace(/^ +/, '');
        if (index === nodes.length - 1) value = value.replace(/ +$/, '');
        if (value !== node.nodeValue) node.nodeValue = value;
    });
    if (!typos) return;
    const chars = [];
    const at = [];
    for (const node of nodes) {
        Array.from(String(node.nodeValue || '')).forEach((ch, offset) => { chars.push(ch); at.push([node, offset]); });
    }
    const index = pickCaptionTypo(chars, `${seed}|${key}`);
    if (index < 0) return;
    const [node, offset] = at[index];
    const swap = (from, to) => {
        const list = Array.from(String(node.nodeValue || ''));
        if (list[offset] !== from) return;
        list[offset] = to;
        node.nodeValue = list.join('');
    };
    const right = chars[index];
    swap(right, CC_HOMOPHONES[right]);
    // 这句打完再改回来；等打字机最多 15 秒。
    let waited = 0;
    const tick = () => {
        state.fixTimer = null;
        if (states.get(textEl) !== state) return;
        if (textEl.dataset.igsTypewriter === 'running' && waited < TYPEWRITER_WAIT_MAX_MS) {
            waited += TYPEWRITER_WAIT_STEP_MS;
            state.fixTimer = schedule(tick, TYPEWRITER_WAIT_STEP_MS);
            return;
        }
        state.fixTimer = schedule(() => {
            state.fixTimer = null;
            if (states.get(textEl) === state) swap(CC_HOMOPHONES[right], right);
        }, TYPO_FIX_MIN_MS + (hashOf(key) % TYPO_FIX_SPAN_MS));
    };
    state.fixTimer = schedule(tick, TYPEWRITER_WAIT_STEP_MS);
}

export function clearCaptionText(textEl) {
    const state = textEl && states.get(textEl);
    if (state) restore(textEl, state);
}
