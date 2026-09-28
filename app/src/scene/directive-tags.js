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
