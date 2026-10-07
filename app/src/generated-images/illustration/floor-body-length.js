// 正文空回（只剩思考、状态栏，或寥寥一两句）时不自动生图：按正文过滤规则取出阅读器会显示的正文，
// 台词 / 心理只数说出口的那句，角色名、表情、场景和特效指令、空白都不算。手动点「生成」不受这条限制。
import { readerBodyText } from '../../scene/message-source.js';
import { stripIllustrationMarkers } from '../../scene/scene-directives.js';

export const MIN_AUTO_IMAGE_BODY_CHARS = 50;

// 柏宝绘 / 智绘姬写回楼层的生图词不是正文。
const WRITTEN_BACK_PROMPT_RE = /<bbi_image>[\s\S]*?<\/bbi_image>|image###[\s\S]*?###/gi;
const SPOKEN_DIRECTIVE_RE = /\[igs-(?:char|thought|msg):([^\]\n]*)\]?/g;
const OTHER_DIRECTIVE_RE = /\[igs-[\w-]+(?::[^\]\n]*)?\]?/g;

export function floorBodyLength(text, sourceFilter) {
    const raw = stripIllustrationMarkers(text).replace(WRITTEN_BACK_PROMPT_RE, '');
    return readerBodyText(raw, sourceFilter)
        .replace(SPOKEN_DIRECTIVE_RE, (_, fields) => fields.slice(fields.lastIndexOf('|') + 1))
        .replace(OTHER_DIRECTIVE_RE, '')
        .replace(/\s+/g, '')
        .length;
}
