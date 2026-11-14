// 战斗生成用的剧情上下文：最近几条 AI 楼层正文、原生触发世界书与用户人设。
import { getSillyTavernContext } from './tavern-helper-adapter.js';
import { stripIllustrationMarkers } from '../scene/scene-directives.js';

export const COMBAT_STORY_FLOORS = 3;

// 清洗正文：去插图标记、[igs-...] 指令与 HTML 标签，压缩空白与空行
const cleanStory = (text) => stripIllustrationMarkers(String(text || ''))
    .replace(/\[igs-[^\]\n]*\]/g, ' ')
    .replace(/<[^>\n]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

// 取最后 limit 条非用户、非系统、有内容的消息正文（保持时间顺序）
function recentAiMessages(chat, limit) {
    const result = [];
    for (let i = chat.length - 1; i >= 0 && result.length < limit; i -= 1) {
        const message = chat[i];
        if (message && !message.is_user && !message.is_system && typeof message.mes === 'string' && message.mes.trim()) {
            result.unshift(message.mes);
        }
    }
    return result;
}

const squashSpaces = (text) => String(text || '').replace(/\s+/g, ' ').trim();

// 创建上下文读取函数。resolveWorldInfo 可选，用于按角色名与上文解析世界书。
// 返回的函数参数：names 角色名、signal 中止信号、persona 是否带用户人设。
export function createCombatStoryContext(host = globalThis, { resolveWorldInfo } = {}) {
    return async function readStoryContext({ names = [], signal, persona = false } = {}) {
        const context = getSillyTavernContext(host);
        const chat = Array.isArray(context?.chat) ? context.chat : [];
        const messages = recentAiMessages(chat, COMBAT_STORY_FLOORS);
        const storyText = cleanStory(messages.join('\n'));
        // 角色名去重去空
        const nameList = [...new Set((Array.isArray(names) ? names : []).map((name) => String(name || '').trim()).filter(Boolean))];

        let worldInfo = '';
        if (typeof resolveWorldInfo === 'function' && (storyText || nameList.length) && !signal?.aborted) {
            let resolved = null;
            try {
                resolved = await resolveWorldInfo({ description: nameList.join('、'), previousText: messages.join('\n'), signal });
            } catch {
                resolved = null;
            }
            if (resolved?.ok === true && typeof resolved.text === 'string') {
                worldInfo = resolved.text.trim();
            }
        }
        const userPersona = persona ? squashSpaces(context?.powerUserSettings?.persona_description) : '';
        return {
            ...(storyText ? { story: storyText } : {}),
            ...(worldInfo ? { worldInfo } : {}),
            ...(userPersona ? { userPersona } : {}),
        };
    };
}
