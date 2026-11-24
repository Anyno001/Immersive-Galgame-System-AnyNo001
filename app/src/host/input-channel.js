export function appendInputDraft(existing, text, replace = '') {
    const current = String(existing ?? ''), command = String(text ?? '');
    if (!current) return command;
    // replace：草稿里还留着上一次填入的那一行（整行精确匹配）时原地替换，找不到再追加。
    if (replace) {
        const lines = current.split('\n');
        const at = lines.indexOf(String(replace));
        if (at >= 0) {
            if (command) lines[at] = command; else lines.splice(at, 1);
            return lines.join('\n');
        }
    }
    if (!command) return current;
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
