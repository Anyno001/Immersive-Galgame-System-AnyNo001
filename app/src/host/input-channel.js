export function createInputChannel(hostAdapter) {
    if (!hostAdapter || typeof hostAdapter.typeAndSend !== 'function') {
        throw new Error('IGS input channel requires a host adapter with typeAndSend(text).');
    }

    return {
        async typeAndSend(text) {
            if (typeof text !== 'string' || !text.trim()) {
                return { ok: false, reason: 'empty-input' };
            }
            return hostAdapter.typeAndSend(text);
        },
        async typeIntoInputAndSend(text) {
            return this.typeAndSend(text);
        },
    };
}
