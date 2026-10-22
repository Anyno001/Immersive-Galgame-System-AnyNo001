// igs 行内指令名的唯一登记点：分段、正文清洗、DOM 对比与聊天块收口都从这里构造正则，
// 新增指令只改这一处，避免标签漏进正文。聊天标签（igs-chat/msg）是块级结构，由 chat-blocks 单独处理。
export const IGS_INLINE_DIRECTIVE_NAMES = Object.freeze(['scene', 'char', 'thought', 'img', 'fx']);

const NAMES = IGS_INLINE_DIRECTIVE_NAMES.join('|');
const LOOSE_START_SOURCE = `[\\[［【]\\s*igs\\s*-?\\s*(${NAMES}|chat(?:-end|-time)?|msg)\\s*[:：]`;
const DIALOGUE_START_RE = /([\[［【])\s*igs\s*-?\s*(?:char|thought)\s*[:：]/gi;
const DIRECTIVE_AT_RE = new RegExp(LOOSE_START_SOURCE, 'iy');
const CONTENT_BOUNDARY_AT_RE = /<\/?(?:content|now_plot)\b/iy;
const BRACKET_CLOSE = { '[': ']', '［': '］', '【': '】' };

function closedDialogueEnd(source, start, opener) {
    const closes = [BRACKET_CLOSE[opener]];
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (BRACKET_CLOSE[ch]) {
            DIRECTIVE_AT_RE.lastIndex = i;
            const directive = DIRECTIVE_AT_RE.exec(source);
            if (directive && directive[1].toLowerCase() !== 'img') return -1;
            closes.push(BRACKET_CLOSE[ch]);
        } else if (ch === closes.at(-1) || (closes.length === 1 && opener !== '[' && ch === ']')) {
            closes.pop();
            if (!closes.length) return i;
        } else if (ch === '<') {
            CONTENT_BOUNDARY_AT_RE.lastIndex = i;
            if (CONTENT_BOUNDARY_AT_RE.test(source)) return -1;
        }
    }
    return -1;
}

export function normalizeClosedIgsDialogueLines(text) {
    const source = String(text || '');
    if (!/[\r\n]/.test(source)) return source;
    const out = [];
    let from = 0;
    DIALOGUE_START_RE.lastIndex = 0;
    let match;
    while ((match = DIALOGUE_START_RE.exec(source))) {
        const end = closedDialogueEnd(source, DIALOGUE_START_RE.lastIndex, match[1]);
        if (end < 0) continue;
        out.push(source.slice(from, match.index), source.slice(match.index, end + 1).replace(/[\r\n]/g, ' '));
        from = end + 1;
        DIALOGUE_START_RE.lastIndex = from;
    }
    return out.length ? out.join('') + source.slice(from) : source;
}

export function splitIgsDirectiveLines(text) {
    const source = String(text || '');
    const lines = normalizeClosedIgsDialogueLines(source).split('\n');
    let offset = 0;
    let lineIndex = 0;
    return lines.map((line) => {
        const entry = { text: line, offset, lineIndex };
        const end = offset + line.length + 1;
        lineIndex += (source.slice(offset, end).match(/\n/g) || []).length;
        offset = end;
        return entry;
    });
}

// 「[igs-名:」起始，用于判断是否含指令、查找下一条指令。
export const IGS_DIRECTIVE_START_RE = new RegExp(`\\[igs-(?:${NAMES}):`);
// 行首完整指令（到第一个 "]"）。
export const IGS_DIRECTIVE_LINE_RE = new RegExp(`^\\[igs-(?:${NAMES}):[^\\]]*\\]`);
// 指令闭合后同行残留文字（捕获组 1），供正文格式化在 "]" 后断行。
export const IGS_DIRECTIVE_CLOSE_SOURCE = `\\[\\s*igs-(?:${NAMES})\\s*:[^\\]\\n]*\\]([^\\n]*)`;

// 分页阶段需要从正文剥离的纯标记类指令（scene、fx 与恐怖档位 dread 不承载可见文字）。
// scene 沿用既有剥离规则；fx 字段不跨行，漏写 "]" 时以行尾收口。
const SCENE_INLINE_RE = /\[igs-scene:[^\]]*\]/g;
const FX_INLINE_RE = /\[igs-fx:[^\]\n]*(?:\]|$)/gm;
const DREAD_INLINE_RE = /\[igs-dread:[^\]\n]*\]/g;
// 数值标签 [igs-stat:…] 只给脚本结算用，任何出口都不显示；容错写法与 scene/stats/stat-directives.js 一致（全角括号、全角冒号、字段可换行）。
const STAT_INLINE_RE = /[\[【]\s*igs\s*-?\s*stat\s*[:：][^\]】]*[\]】]/gi;
const MARKER_LINE_RE = /^(?:\[igs-(?:scene:[^\]]*\]|fx:|dread:)|[\[【]\s*igs\s*-?\s*stat\s*[:：])/i;

export function hasIgsDirectiveTags(text) {
    return IGS_DIRECTIVE_START_RE.test(String(text || ''));
}

// AI 偶尔把指令写走样：全角括号 / 冒号 / 竖线（【igs-char：名｜表情｜台词】）、括号和字段两边带空格、大写 IGS-CHAR、
// 漏掉连字符（igschar、igsfx）。统一成 [igs-名:a|b|c]，后面的分段、正文格式化和指令提取都只认这一种。
// 横杠可有可无：紧跟已登记指令名+冒号，正文误伤概率极低。半角 "[" 开头的只认 "]" 收口，
// 免得台词里的【】被当成指令结尾；漏写收口时照旧到行尾为止。已经用了半角 "|" 分隔的，台词里的「｜」原样保留。
const LOOSE_DIRECTIVE_RE = new RegExp(
    `\\[\\s*igs\\s*-?\\s*(${NAMES})\\s*[:：]([^\\]\\n]*)(\\]?)|[［【]\\s*igs\\s*-?\\s*(${NAMES})\\s*[:：]([^\\]］】\\n]*)([\\]］】]?)`,
    'gi',
);

export function canonicalizeIgsDirectives(text) {
    return normalizeClosedIgsDialogueLines(text).replace(LOOSE_DIRECTIVE_RE, (all, name, body, close, wideName, wideBody, wideClose) => {
        const inner = String(name ? body : wideBody);
        const fields = (inner.includes('|') ? inner : inner.replace(/｜/g, '|')).split('|').map((field) => field.trim());
        return `[igs-${String(name || wideName).toLowerCase()}:${fields.join('|')}${(name ? close : wideClose) ? ']' : ''}`;
    });
}

// 台词、心理、场景指令前面同一行还有字（旁白。[igs-char:…] 或两条指令首尾相连）时在指令前断行，
// 让每条指令都从行首开始、独占一页；指令后面的旁白由正文格式化在 "]" 后断行。
// fx / img 是给前面这句加的效果，留在原句后面不挪。
const BREAK_BEFORE_DIRECTIVE_RE = /(\S)[ \t]*(?=\[igs-(?:char|thought|scene):)/g;

export function normalizeIgsDirectiveLayout(text) {
    return canonicalizeIgsDirectives(text).replace(BREAK_BEFORE_DIRECTIVE_RE, '$1\n');
}

export function stripMarkerDirectives(text) {
    return String(text || '').replace(SCENE_INLINE_RE, '').replace(FX_INLINE_RE, '').replace(DREAD_INLINE_RE, '').replace(STAT_INLINE_RE, '');
}

export function isMarkerDirectiveLine(line) {
    return MARKER_LINE_RE.test(String(line || '').trim());
}


// 四栏角色标签「名|表情|服装|台词」，只在传入 resolver（场景素材模式）时识别，未传时结果与旧版一致。
// 第 3 栏分三种：已登记服装（含词池词与「默认」）→ 服装；像服装名的短词（无空白与句读，≤12 字）→ 未登记服装，
// 丢弃该栏、照常显示对白与原有立绘并记入待确认；其余视为对白里的「|」，拼回对白。
const OUTFIT_FIELDS = '\\[igs-(char|thought):([^|\\]\\n]+)\\|([^|\\]\\n]*)\\|([^|\\]\\n]+)\\|([^\\]\\n]+?)';
const OUTFIT_DIRECTIVE_AT_RE = new RegExp(`^${OUTFIT_FIELDS}(?:\\]|$)`);
const OUTFIT_DIRECTIVE_GLOBAL_SOURCE = `${OUTFIT_FIELDS}(\\]|$)`;
const OUTFIT_LIKE_RE = /^[^\s，。！？、；：,.!?;:…—~～「」『』“”"'（）()《》<>*]{1,12}$/u;
// 显示用：对白内残留的半角竖线换成全角，交给只认三栏的格式化正则时不再被当作分隔符。
const DISPLAY_BAR = '｜';

function classifyOutfitField(outfitResolver, character, token) {
    const outfit = outfitResolver(character, token);
    if (outfit) return { kind: 'outfit', outfit };
    return OUTFIT_LIKE_RE.test(token) ? { kind: 'unknown' } : { kind: 'text' };
}

export function matchOutfitDirectiveAt(text, outfitResolver) {
    if (typeof outfitResolver !== 'function') return null;
    const m = normalizeClosedIgsDialogueLines(text).match(OUTFIT_DIRECTIVE_AT_RE);
    if (!m) return null;
    const character = m[2].trim();
    const token = m[4].trim();
    const field = classifyOutfitField(outfitResolver, character, token);
    const base = { type: m[1], character, mood: m[3].trim(), outfit: '', raw: m[0] };
    if (field.kind === 'outfit') return { ...base, outfit: field.outfit, text: m[5].trim() };
    if (field.kind === 'unknown') return { ...base, unknownOutfit: token, text: m[5].trim() };
    return { ...base, text: `${m[4]}|${m[5]}`.trim() };
}

// 正文格式化前按同一规则改写四栏标签：服装与未登记服装栏剥掉，其余拼回对白，交给只认三栏的格式化正则。
export function stripOutfitFields(text, outfitResolver) {
    if (typeof outfitResolver !== 'function') return String(text || '');
    const source = normalizeClosedIgsDialogueLines(text);
    return source.replace(new RegExp(OUTFIT_DIRECTIVE_GLOBAL_SOURCE, 'gm'), (all, type, name, mood, outfit, body, close) => {
        const field = classifyOutfitField(outfitResolver, name.trim(), outfit.trim());
        const kept = field.kind === 'text' ? `${outfit}|${body}` : body;
        return `[igs-${type}:${name}|${mood}|${kept.split('|').join(DISPLAY_BAR)}${close}`;
    });
}
