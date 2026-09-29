// igs 行内指令名的唯一登记点：分段、正文清洗、DOM 对比与聊天块收口都从这里构造正则，
// 新增指令只改这一处，避免标签漏进正文。聊天标签（igs-chat/msg）是块级结构，由 chat-blocks 单独处理。
export const IGS_INLINE_DIRECTIVE_NAMES = Object.freeze(['scene', 'char', 'thought', 'img', 'fx']);

const NAMES = IGS_INLINE_DIRECTIVE_NAMES.join('|');

// 「[igs-名:」起始，用于判断是否含指令、查找下一条指令。
export const IGS_DIRECTIVE_START_RE = new RegExp(`\\[igs-(?:${NAMES}):`);
// 行首完整指令（到第一个 "]"）。
export const IGS_DIRECTIVE_LINE_RE = new RegExp(`^\\[igs-(?:${NAMES}):[^\\]]*\\]`);
// 指令闭合后同行残留文字（捕获组 1），供正文格式化在 "]" 后断行。
export const IGS_DIRECTIVE_CLOSE_SOURCE = `\\[\\s*igs-(?:${NAMES})\\s*:[^\\]\\n]*\\]([^\\n]*)`;

// 分页阶段需要从正文剥离的纯标记类指令（scene 与 fx 不承载可见文字）。
// scene 沿用既有剥离规则；fx 字段不跨行，漏写 "]" 时以行尾收口。
const SCENE_INLINE_RE = /\[igs-scene:[^\]]*\]/g;
const FX_INLINE_RE = /\[igs-fx:[^\]\n]*(?:\]|$)/gm;
const MARKER_LINE_RE = /^\[igs-(?:scene:[^\]]*\]|fx:)/;

export function hasIgsDirectiveTags(text) {
    return IGS_DIRECTIVE_START_RE.test(String(text || ''));
}

export function stripMarkerDirectives(text) {
    return String(text || '').replace(SCENE_INLINE_RE, '').replace(FX_INLINE_RE, '');
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
    const m = String(text || '').match(OUTFIT_DIRECTIVE_AT_RE);
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
    const source = String(text || '');
    if (typeof outfitResolver !== 'function') return source;
    return source.replace(new RegExp(OUTFIT_DIRECTIVE_GLOBAL_SOURCE, 'gm'), (all, type, name, mood, outfit, body, close) => {
        const field = classifyOutfitField(outfitResolver, name.trim(), outfit.trim());
        const kept = field.kind === 'text' ? `${outfit}|${body}` : body;
        return `[igs-${type}:${name}|${mood}|${kept.split('|').join(DISPLAY_BAR)}${close}`;
    });
}
