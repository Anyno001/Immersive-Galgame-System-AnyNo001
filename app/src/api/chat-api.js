// 只读接口：IGS.api.chats（正文里的聊天块，即 [igs-chat:] / [igs-msg:] / [igs-chat-time:] 标签）。
// 只放纯函数：不存状态、不发事件、不碰 DOM、存储和宿主；入参不合法返回空数组，不抛错；
// 返回值全部是新对象，调用方随便改也不会影响 IGS 内部。跨楼继承不在这里做，由调用方逐楼自己读。
// 接口只增不破：CHAT_API_VERSION 往后只升不降，旧字段一直保留。
import { extractChatBlocks } from '../scene/chat-blocks.js';
import { extractHtmlCards } from '../scene/html-cards.js';
import { normalizeImageMarkerLayout } from '../scene/image-marker-layout.js';
import { normalizeSourceFilter, parseTagList } from '../scene/message-source.js';
import { SYSTEM_ROLE_DEFAULTS, isSystemRole } from '../visual/igs-ui/system-role.js';

export const CHAT_API_VERSION = 1;

const textOf = (value) => (typeof value === 'string' ? value : '');

function messageView(message, systemSettings) {
    if (message.kind !== 'msg') return { kind: message.kind, text: textOf(message.text) };
    return {
        kind: 'msg',
        sender: textOf(message.sender),
        text: textOf(message.text),
        type: textOf(message.type),
        system: isSystemRole(message.sender, systemSettings),
    };
}

export function createChatsApi() {
    return {
        version: CHAT_API_VERSION,
        // 解析顺序与阅读器一致：图片标记排版 → 剥掉 HTML 卡片（卡片里的聊天标签不算）→ 抽聊天块。
        // 返回 [{ index, title, messages }]，index 是块在本楼的序号（从 0）。
        // messages 里 kind 为 'msg' 的带 sender / text / type / system（发送者是否系统角色）；
        // kind 为 'time'（[igs-chat-time:]）或 'note'（显式块内的旁白）的只有 kind 和 text。
        // options.htmlCardTags 为字符串时替换默认的 HTML 卡片标签；options.systemWords 为数组时替换系统角色词池。
        collect(text, options) {
            const source = textOf(text);
            if (!source) return [];
            const opts = options && typeof options === 'object' ? options : {};
            const cardTags = typeof opts.htmlCardTags === 'string' ? opts.htmlCardTags : normalizeSourceFilter(undefined).htmlCardTags;
            const systemSettings = { words: Array.isArray(opts.systemWords) ? opts.systemWords : SYSTEM_ROLE_DEFAULTS.words };
            const cards = extractHtmlCards(normalizeImageMarkerLayout(source), parseTagList(cardTags));
            return extractChatBlocks(cards.text).chats.map((chat, index) => ({
                index,
                title: textOf(chat.title),
                messages: chat.messages.map((message) => messageView(message, systemSettings)),
            }));
        },
    };
}
