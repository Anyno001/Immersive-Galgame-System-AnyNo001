export function appendInputDraft(existing, text) {
    const current = String(existing ?? ''), command = String(text ?? '');
    if (!current) return command;
    if (current === command || current.endsWith(`\n${command}`)) return current;
    return `${current}${current.endsWith('\n') ? '' : '\n'}${command}`;
}

export function createInputChannel(hostAdapter) {
    if (!hostAdapter || typeof hostAdapter.typeAndSend !== 'function') {
        throw new Error('IGS input channel requires a host adapter with typeAndSend(text).');
    }

    return {
        // options 原样透传给宿主适配层（如 matches 回执认领）；不传时调用形状与旧版一致。
        async typeAndSend(text, options) {
            if (typeof text !== 'string' || !text.trim()) {
                return { ok: false, reason: 'empty-input' };
            }
            return options === undefined ? hostAdapter.typeAndSend(text) : hostAdapter.typeAndSend(text, options);
        },
        async typeIntoInputAndSend(text) {
            return this.typeAndSend(text);
        },
    };
}
