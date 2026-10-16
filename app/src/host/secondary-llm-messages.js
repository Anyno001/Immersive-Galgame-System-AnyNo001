// 双字段调用保持历史形状；显式消息不压平、不修改调用方快照。
const roles = new Set(['system', 'user', 'assistant']);

function invalid() {
    const error = new Error('副 LLM 有序消息无效或与旧请求字段冲突');
    error.reason = 'invalid-llm-messages';
    throw error;
}

export function secondaryLlmMessages(request, settings = {}) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) invalid();
    const head = String(settings.jailbreakHead || '').trim();
    const tail = String(settings.jailbreakTail || '').trim();
    if (!Object.hasOwn(request, 'messages')) {
        const { system, user } = request;
        return [
            { role: 'system', content: head ? `${head}\n\n${system}` : system },
            { role: 'user', content: tail ? `${user}\n\n${tail}` : user },
        ];
    }
    if (Object.hasOwn(request, 'system') || Object.hasOwn(request, 'user')
        || !Array.isArray(request.messages) || !request.messages.length) invalid();
    const messages = request.messages.map((message) => {
        if (!message || typeof message !== 'object' || Array.isArray(message)
            || !roles.has(message.role) || typeof message.content !== 'string'
            || Object.keys(message).some((key) => !['role', 'content'].includes(key))) invalid();
        return { role: message.role, content: message.content };
    });
    // 用户显式配置的附加词独立成消息，原预设各块正文和相对顺序不变。
    if (head) messages.unshift({ role: 'system', content: head });
    if (tail) messages.push({ role: 'user', content: tail });
    return messages;
}
