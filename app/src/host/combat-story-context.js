import { getSillyTavernContext } from './tavern-helper-adapter.js';
import { stripIllustrationMarkers } from '../scene/scene-directives.js';

// 卡牌战斗生成的剧情与世界书参考：最近几楼 AI 正文作剧情节选；世界书条目经注入的原生扫描器（与写词同一 getWorldInfoPrompt 链路）
// 按剧情与角色名触发，关键词、常量、概率及递归规则由宿主决定。默认两者都有长度上限，控制生成请求体积；
// 卡组生成传 full 时整楼正文与整段扫描结果都不截断，传 persona 时另附用户人设。
// 读取失败或扫描不可用时只返回读到的部分，不阻断生成（战斗档案生成本身不依赖世界书）。
export const COMBAT_STORY_FLOORS = 3;
export const COMBAT_STORY_MAX_CHARS = 1600;
export const COMBAT_WORLD_INFO_MAX_CHARS = 3000;

// 去掉 IGS 标签、HTML 标签与插图标记，只留叙述文本。
const clean = (text) => stripIllustrationMarkers(String(text || ''))
    .replace(/\[igs-[^\]\n]*\]/g, ' ')
    .replace(/<[^>\n]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

function recentAiTexts(chat, count) {
    const out = [];
    for (let i = chat.length - 1; i >= 0 && out.length < count; i -= 1) {
        const m = chat[i];
        if (m && !m.is_user && !m.is_system && typeof m.mes === 'string' && m.mes.trim()) out.unshift(m.mes);
    }
    return out;
}

// 剧情节选取最近内容（截尾部），世界书取扫描结果的开头部分。
const tail = (text, max) => (text.length > max ? text.slice(text.length - max) : text);
const head = (text, max) => (text.length > max ? text.slice(0, max) : text);
const flat = (text) => String(text || '').replace(/\s+/g, ' ').trim();

export function createCombatStoryContext(globalObject = globalThis, { resolveWorldInfo } = {}) {
    return async function read({ names = [], signal, full = false, persona = false } = {}) {
        const ctx = getSillyTavernContext(globalObject);
        const chat = Array.isArray(ctx?.chat) ? ctx.chat : [];
        const recent = recentAiTexts(chat, COMBAT_STORY_FLOORS);
        const text = clean(recent.join('\n'));
        const story = full ? text : tail(text, COMBAT_STORY_MAX_CHARS);
        const who = [...new Set((Array.isArray(names) ? names : []).map((n) => String(n || '').trim()).filter(Boolean))];
        let worldInfo = '';
        if (typeof resolveWorldInfo === 'function' && (story || who.length) && !signal?.aborted) {
            let r = null;
            try { r = await resolveWorldInfo({ description: who.join('、'), previousText: recent.join('\n'), signal }); } catch (error) { r = null; }
            if (r?.ok === true && typeof r.text === 'string') worldInfo = full ? r.text.trim() : head(r.text.trim(), COMBAT_WORLD_INFO_MAX_CHARS);
        }
        // 用户人设与 readCharacterLore 同源（powerUserSettings.persona_description）。
        const userPersona = persona ? flat(ctx?.powerUserSettings?.persona_description) : '';
        return { ...(story ? { story } : {}), ...(worldInfo ? { worldInfo } : {}), ...(userPersona ? { userPersona } : {}) };
    };
}
