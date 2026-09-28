export const CHAT_SHOW_FRAMES = Object.freeze(['phone', 'none']);
export const CHAT_SHOW_REVEAL_MODES = Object.freeze(['click', 'auto']);
export const CHAT_SHOW_SPEEDS = Object.freeze({ fast: 0.6, medium: 1, slow: 1.5 });
export const CHAT_SHOW_SIDES = Object.freeze(['auto', 'left', 'right']);
export const CHAT_SHOW_DIM_LEVELS = Object.freeze([0, 0.2, 0.35, 0.45, 0.6, 0.8]);
export const CHAT_SHOW_AVATAR_PALETTE = Object.freeze(['#f38ba8', '#74aef0', '#7cc98f', '#f2b35f', '#a98ef0', '#5cc4c4', '#ef8a7d']);
export const CHAT_SHOW_LEFT_PALETTE = Object.freeze(['#ffffff', '#ffe1ec', '#e0efff', '#e5f6df', '#fff1d0', '#ece3ff', '#dcf4f3']);
export const CHAT_SHOW_DEFAULTS = Object.freeze({
    enabled: false,
    frame: 'phone',
    revealMode: 'click',
    autoSpeed: 'medium',
    dim: 0.45,
    hideSprites: true,
    sound: Object.freeze({ enabled: true, volume: 0.6 }),
    selfName: '',
    unknownSide: 'left',
    defaultColors: Object.freeze({ left: '#ffffff', right: '#95ec69' }),
    followTheme: false,
    typingIndicator: true,
    showAvatars: false,
    contacts: Object.freeze({}),
});

const SELF_TOKENS = Object.freeze(['{{user}}', '<user>']);
const MESSAGE_TYPE_ALIASES = Object.freeze({
    image: ['image', 'img', 'photo', '图片', '照片'],
    voice: ['voice', 'audio', '语音'],
    recall: ['recall', 'revoke', '撤回'],
    sticker: ['sticker', 'emoji', '表情', '表情包'],
});

export const CHAT_SHOW_PROMPT_RULE = `[igs线上聊天标签]
角色之间通过手机、网络等线上方式发送消息时，用以下标签输出聊天记录（属于允许使用的igs标签）：

[igs-chat:会话标题]
[igs-chat-time:时间]
[igs-msg:发送者|消息内容]
[igs-msg:发送者|消息内容|类型]
[igs-chat-end]

语法要求：
1. 每条标签独立成行；一段聊天以[igs-chat]开始、以[igs-chat-end]结束
2. 会话标题填写群名或对方名字
3. 每条消息使用一个[igs-msg]；发送者填写完整角色名，{{user}}发送的消息发送者填写{{user}}
4. 普通文字消息只写两栏；特殊消息在第三栏填写类型：图片（内容写画面描述）、语音（内容写语音说的话）、表情包（内容写表情描述）、撤回（内容可留空）
5. 需要标出时间间隔时单独输出一行[igs-chat-time]，如[igs-chat-time:昨天 22:14]
6. 消息内容不得换行，不得含 | 或 ]
7. 仅用于线上消息；当面对话仍使用[igs-char]`;

export function normalizeChatMessageType(value) {
    const key = String(value == null ? '' : value).trim().toLowerCase();
    if (!key) return 'text';
    for (const [type, aliases] of Object.entries(MESSAGE_TYPE_ALIASES)) {
        if (aliases.includes(key)) return type;
    }
    return 'text';
}

export function chatVoiceSeconds(text) {
    return Math.max(1, Math.min(60, Math.ceil(Array.from(String(text || '')).length / 4)));
}

function isColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ''));
}

function normalizeName(value) {
    return String(value == null ? '' : value).trim();
}

export function isValidChatContactName(value) {
    const name = normalizeName(value);
    return Boolean(name) && !/[.|\]\[]/.test(name);
}

function normalizeAliases(value, name) {
    const output = [];
    for (const item of Array.isArray(value) ? value : []) {
        const alias = normalizeName(item);
        if (alias && alias !== name && !output.includes(alias)) output.push(alias);
    }
    return output;
}

function normalizeContacts(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const output = {};
    for (const [rawName, entry] of Object.entries(source)) {
        const name = normalizeName(rawName);
        if (!isValidChatContactName(name)) continue;
        const item = entry && typeof entry === 'object' ? entry : {};
        output[name] = {
            aliases: normalizeAliases(item.aliases, name),
            color: isColor(item.color) ? item.color.toLowerCase() : '',
            side: CHAT_SHOW_SIDES.includes(item.side) ? item.side : 'auto',
        };
    }
    return output;
}

export function normalizeChatShowSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const sound = source.sound && typeof source.sound === 'object' ? source.sound : {};
    const colors = source.defaultColors && typeof source.defaultColors === 'object' ? source.defaultColors : {};
    const dim = Number(source.dim);
    const volume = Number(sound.volume);
    return {
        enabled: source.enabled === true,
        frame: CHAT_SHOW_FRAMES.includes(source.frame) ? source.frame : CHAT_SHOW_DEFAULTS.frame,
        revealMode: CHAT_SHOW_REVEAL_MODES.includes(source.revealMode) ? source.revealMode : CHAT_SHOW_DEFAULTS.revealMode,
        autoSpeed: Object.hasOwn(CHAT_SHOW_SPEEDS, source.autoSpeed) ? source.autoSpeed : CHAT_SHOW_DEFAULTS.autoSpeed,
        dim: Number.isFinite(dim) ? Math.max(0, Math.min(0.8, dim)) : CHAT_SHOW_DEFAULTS.dim,
        hideSprites: source.hideSprites !== false,
        sound: {
            enabled: sound.enabled !== false,
            volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : CHAT_SHOW_DEFAULTS.sound.volume,
        },
        selfName: normalizeName(source.selfName),
        unknownSide: source.unknownSide === 'right' ? 'right' : 'left',
        defaultColors: {
            left: isColor(colors.left) ? colors.left.toLowerCase() : CHAT_SHOW_DEFAULTS.defaultColors.left,
            right: isColor(colors.right) ? colors.right.toLowerCase() : CHAT_SHOW_DEFAULTS.defaultColors.right,
        },
        followTheme: source.followTheme === true,
        typingIndicator: source.typingIndicator !== false,
        showAvatars: source.showAvatars === true,
        contacts: normalizeContacts(source.contacts),
    };
}

// 联系人主名 → 联系人别名 → 场景预设的角色别名归约后再找联系人。
export function findChatContact(name, settings, characterAliases) {
    const target = normalizeName(name);
    const contacts = (settings && settings.contacts) || {};
    if (!target) return null;
    if (contacts[target]) return target;
    for (const [key, entry] of Object.entries(contacts)) {
        if (entry.aliases.includes(target)) return key;
    }
    const aliases = characterAliases && typeof characterAliases === 'object' ? characterAliases : {};
    for (const [main, values] of Object.entries(aliases)) {
        if (Array.isArray(values) && values.some((v) => normalizeName(v) === target)) {
            if (contacts[main]) return main;
            for (const [key, entry] of Object.entries(contacts)) {
                if (entry.aliases.includes(main)) return key;
            }
        }
    }
    return null;
}

function isSelfName(name, settings, userName) {
    const target = normalizeName(name).toLowerCase();
    if (!target) return false;
    const names = [...SELF_TOKENS, normalizeName(userName), settings.selfName].filter(Boolean).map((n) => n.toLowerCase());
    return names.includes(target);
}

function hashIndex(text, size) {
    let h = 0;
    for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % size;
}

export function readableTextColor(hex) {
    if (!isColor(hex)) return '#1f1f1f';
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1f1f1f' : '#ffffff';
}

// AI 只决定发送者名字；左右只由设置决定：联系人固定侧 → 自己在右 → 未登记发送者默认侧。
export function resolveChatSender(name, settings, ctx = {}) {
    const normalized = normalizeChatShowSettings(settings);
    const key = findChatContact(name, normalized, ctx.characterAliases);
    const contact = key ? normalized.contacts[key] : null;
    const self = isSelfName(name, normalized, ctx.userName)
        || (key != null && isSelfName(key, normalized, ctx.userName));
    const side = contact && contact.side !== 'auto' ? contact.side : self ? 'right' : normalized.unknownSide;
    const displayName = key || (self && ctx.userName ? ctx.userName : normalizeName(name));
    return { key: key || displayName, displayName, side, self, color: contact && contact.color ? contact.color : '' };
}

// ctx.theme：跟随对话框主题时的配色；ctx.avatarFor：按联系人主名取头像地址。
export function buildChatPageModel(chat, settings, ctx = {}) {
    const normalized = normalizeChatShowSettings(settings);
    const theme = normalized.followTheme && ctx.theme ? ctx.theme : null;
    const defaults = theme ? { left: theme.left, right: theme.right } : normalized.defaultColors;
    const avatarFor = typeof ctx.avatarFor === 'function' ? ctx.avatarFor : () => '';
    const items = chat && Array.isArray(chat.messages) ? chat.messages : [];
    const messages = items.map((item) => {
        if (item.kind === 'note' || item.kind === 'time') return { kind: item.kind, text: item.text };
        const sender = resolveChatSender(item.sender, normalized, ctx);
        const type = normalizeChatMessageType(item.type);
        if (type === 'recall') {
            return { kind: 'recall', key: sender.key, text: `${sender.self ? '你' : sender.displayName}撤回了一条消息` };
        }
        const message = { kind: 'msg', type, text: item.text, ...sender };
        if (type === 'voice') message.seconds = chatVoiceSeconds(item.text);
        if (normalized.showAvatars) {
            message.avatar = avatarFor(sender.key) || '';
            message.initial = Array.from(sender.displayName || '?')[0] || '?';
            message.avatarColor = CHAT_SHOW_AVATAR_PALETTE[hashIndex(sender.key, CHAT_SHOW_AVATAR_PALETTE.length)];
        }
        return message;
    });
    const msgs = messages.filter((m) => m.kind === 'msg');
    const leftKeys = [...new Set(msgs.filter((m) => m.side === 'left').map((m) => m.key))];
    const senderKeys = [...new Set(msgs.map((m) => m.key))];
    const group = senderKeys.length > 2;
    for (const m of msgs) {
        if (!m.color) {
            m.color = m.side === 'right'
                ? defaults.right
                : leftKeys.length > 1 ? CHAT_SHOW_LEFT_PALETTE[hashIndex(m.key, CHAT_SHOW_LEFT_PALETTE.length)] : defaults.left;
        }
        m.textColor = readableTextColor(m.color);
        m.showName = group && m.side === 'left';
    }
    const others = senderKeys.filter((k) => !msgs.some((m) => m.key === k && m.self));
    const title = normalizeName(chat && chat.title) || (others.length === 1 ? others[0] : '');
    return { title, group, messages, theme };
}

export function chatRevealDelayMs(previousText, autoSpeed) {
    const factor = CHAT_SHOW_SPEEDS[autoSpeed] || 1;
    const length = Array.from(String(previousText || '')).length;
    return Math.round(Math.max(500, Math.min(2200, 500 + 35 * length)) * factor);
}
