import { IGS_DIRECTIVE_START_RE } from './directive-tags.js';

const CHAT_MARKER_RE =/^\s*\[igs-chat#(\d+)\]\s*$/;
const CHAT_OPEN_RE = /^\[igs-chat:([^|\]\n]*)\]/;
const CHAT_END_RE = /^\[igs-chat-end\]/;
const CHAT_TIME_RE = /^\[igs-chat-time:([^|\]\n]+)\]/;
// 与 igs-char 一致：字段不跨行，漏写 "]" 时以行尾收口；第三栏为消息类型。
const MSG_RE = /^\[igs-msg:([^|\]\n]+)\|([^|\]\n]*)(?:\|([^\]\n]*))?(?:\]|$)/;
const CHAT_TAG_RE = /\[igs-(?:chat-end\]|chat:|chat-time:|msg:)/g;
const CLOSING_DIRECTIVE_RE = new RegExp(`^${IGS_DIRECTIVE_START_RE.source}`);
const FX_LINE_RE = /^\[igs-fx:/;

export function buildChatMarker(index) {
    return `[igs-chat#${index}]`;
}

export function parseChatMarker(segment) {
    const match = String(segment == null ? '' : segment).match(CHAT_MARKER_RE);
    return match ? Number(match[1]) : -1;
}

export function hasChatTags(text) {
    return /\[igs-(?:chat-end\]|chat:|chat-time:|msg:)/.test(String(text || ''));
}

// 标签可能与正文同行：先把每条聊天标签断到行首，并把标签后的残留文字断到下一行。
function isolateChatTags(text) {
    return String(text || '')
        .replace(CHAT_TAG_RE, (tag, offset, src) => (offset > 0 && src[offset - 1] !== '\n' ? `\n${tag}` : tag))
        .split('\n')
        .flatMap((line) => {
            const trimmed = line.trim();
            const m = trimmed.match(CHAT_OPEN_RE) || trimmed.match(CHAT_END_RE) || trimmed.match(CHAT_TIME_RE) || trimmed.match(MSG_RE);
            if (!m) return [line];
            const rest = trimmed.slice(m[0].length).trim();
            return rest ? [m[0], rest] : [m[0]];
        })
        .join('\n');
}

// 聊天块整块换成独占一行的占位符，让它单独成页且不被格式化/分页拆碎。
// 显式块内的旁白保留为块内注释行；隐式块（无 [igs-chat]）遇到旁白即收口。
// 缺 [igs-chat-end] 时遇到场景/台词/心里话/插图标签或正文结束自动收口，兼容流式输出。
export function extractChatBlocks(raw) {
    const source = String(raw || '');
    if (!hasChatTags(source)) return { text: source, chats: [] };
    const chats = [];
    const out = [];
    let block = null;
    const open = () => block || (block = { title: '', explicit: false, messages: [] });
    const close = () => {
        if (!block) return;
        if (block.messages.some((m) => m.kind === 'msg')) {
            chats.push({ title: block.title, messages: block.messages });
            out.push(buildChatMarker(chats.length - 1));
        } else {
            for (const m of block.messages) out.push(m.text);
        }
        block = null;
    };
    for (const line of isolateChatTags(source).split('\n')) {
        const trimmed = line.trim();
        let m;
        if ((m = trimmed.match(CHAT_OPEN_RE))) {
            close();
            block = { title: m[1].trim(), explicit: true, messages: [] };
        } else if (CHAT_END_RE.test(trimmed)) {
            close();
        } else if ((m = trimmed.match(CHAT_TIME_RE))) {
            open().messages.push({ kind: 'time', text: m[1].trim() });
        } else if ((m = trimmed.match(MSG_RE))) {
            const text = m[2].trim();
            const type = String(m[3] || '').trim();
            if (text || type) open().messages.push({ kind: 'msg', sender: m[1].trim(), text, type });
        } else if (!block) {
            out.push(line);
        } else if (!trimmed) {
            continue;
        } else if (FX_LINE_RE.test(trimmed)) {
            // 演出标签不属于聊天内容：移到块前，由分页按偏移归属到聊天页。
            out.push(line);
        } else if (block.explicit && !CLOSING_DIRECTIVE_RE.test(trimmed)) {
            block.messages.push({ kind: 'note', text: trimmed });
        } else {
            close();
            out.push(line);
        }
    }
    close();
    return { text: out.join('\n'), chats };
}

export function formatChatBlockAsText(chat) {
    const messages = chat && Array.isArray(chat.messages) ? chat.messages : [];
    // 输入中是瞬时提示，纯文字回放时略去。
    return messages.filter((m) => !(m.kind === 'msg' && !m.text && /^(?:typing|输入中|正在输入)$/i.test(m.type || ''))).map((m) => (m.kind === 'msg' ? `${m.sender}：${m.text}` : m.text)).join('\n');
}
