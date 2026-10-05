// 生图插件自己写好、插回楼层正文的提示词。剧情 CG 选柏宝绘 / 智绘姬来源时优先用这些词，读不到再用 IGS 的词。
// 两个插件都是 AI 回复结束后才开始写，所以开着自动写词时要等一会儿。
export const FLOOR_PROMPT_WAIT_MS = 90000;

function readStContext(globalObject) {
    for (const read of [() => globalObject, () => globalObject.parent, () => globalObject.top]) {
        try {
            const win = read();
            const context = win && win.SillyTavern && typeof win.SillyTavern.getContext === 'function' ? win.SillyTavern.getContext() : null;
            if (context) return context;
        } catch (error) { /* 跨域窗口 */ }
    }
    return null;
}

function floorText(context, messageId) {
    const message = context && Array.isArray(context.chat) ? context.chat[Number(messageId)] : null;
    return String((message && message.mes) || '');
}

function joinTags(parts) {
    return parts.map((part) => String(part || '').trim().replace(/^,+|,+$/g, '').trim()).filter(Boolean).join(', ');
}

// 柏宝绘：<bbi_image>tag<nl>自然语言</nl></bbi_image>，角色外貌已由它的角色库展开。
export function parseBaibaiFloorTags(text) {
    return (String(text || '').match(/<bbi_image>[\s\S]+?<\/bbi_image>/gi) || []).map((block) => {
        const inner = block.replace(/^<bbi_image>|<\/bbi_image>$/gi, '');
        const nl = (inner.match(/<nl>([\s\S]*?)<\/nl>/i) || [])[1] || '';
        const explicit = (inner.match(/<tag>([\s\S]*?)<\/tag>/i) || [])[1] || '';
        const bare = inner.replace(/<nl>[\s\S]*?<\/nl>|<tag>[\s\S]*?<\/tag>/gi, '');
        return { tag: joinTags([explicit, bare]), nl: nl.trim() };
    }).filter((item) => item.tag);
}

// 智绘姬：<image>image###tag###</image>（起止符可在它的设置里改）。词里的角色只写名字，
// 原样交回智绘姬出图时由它按角色库展开外貌，所以这里不拆。
export function parseChatu8FloorTags(text, { startTag = 'image###', endTag = '###' } = {}) {
    const escape = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${escape(startTag)}([\\s\\S]+?)${escape(endTag)}`, 'g');
    return Array.from(String(text || '').matchAll(pattern), (m) => ({ tag: m[1].trim(), nl: '' })).filter((item) => item.tag);
}

const SOURCES = {
    baibai: {
        parse: (text) => parseBaibaiFloorTags(text),
        // 柏宝绘开着且开了自动写词才等。
        willWrite(context) {
            const settings = context && context.extensionSettings && context.extensionSettings.baibai_image;
            return !!(settings && settings.enabled !== false && settings.autoTag && settings.autoTag.enabled);
        },
    },
    chatu8: {
        parse(text, context) {
            const settings = (context && context.extensionSettings && context.extensionSettings['st-chatu8']) || {};
            return parseChatu8FloorTags(text, { startTag: settings.startTag || 'image###', endTag: settings.endTag || '###' });
        },
        // 智绘姬的设置值是字符串 "true"。只有写回正文时才等：insertOriginalText 关着时它把词存进聊天元数据，
        // 但正文超过 500 字它会自己打开写回。
        willWrite(context, text) {
            const settings = context && context.extensionSettings && context.extensionSettings['st-chatu8'];
            const on = (value) => value === true || value === 'true';
            return !!(settings && on(settings.scriptEnabled) && on(settings.autoLLMImageGen) && (on(settings.insertOriginalText) || text.length > 500));
        },
    },
};

export function readFloorPromptTags(globalObject, source, messageId) {
    const spec = SOURCES[source];
    const context = readStContext(globalObject);
    return spec && context ? spec.parse(floorText(context, messageId), context) : [];
}

// 本楼还没有插件的词、插件又开着自动写词时，等它写完；超时返回空数组，由调用方用 IGS 自己的词。
export async function waitFloorPromptTags(globalObject, source, messageId, { timeoutMs = FLOOR_PROMPT_WAIT_MS, intervalMs = 1500, sleep } = {}) {
    const spec = SOURCES[source];
    if (!spec || messageId == null) return [];
    const pause = typeof sleep === 'function' ? sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let tags = readFloorPromptTags(globalObject, source, messageId);
    const context = readStContext(globalObject);
    if (tags.length || !context || !spec.willWrite(context, floorText(context, messageId))) return tags;
    for (let waited = 0; waited < timeoutMs && !tags.length; waited += intervalMs) {
        await pause(intervalMs);
        tags = readFloorPromptTags(globalObject, source, messageId);
    }
    return tags;
}
