function normalizeIdentity(identity = {}) {
    const chatId = String(identity.chatId == null ? '' : identity.chatId).trim();
    const messageId = Number(identity.messageId);
    const swipeId = Number(identity.swipeId || 0);
    if (!chatId || !Number.isInteger(messageId) || messageId < 0 || !Number.isInteger(swipeId) || swipeId < 0) return null;
    return { chatId, messageId, swipeId };
}

export async function clearCurrentCg({ identity, slot, url, clear, forceRender } = {}) {
    const normalizedIdentity = normalizeIdentity(identity);
    const normalizedSlot = Number(slot);
    if (!normalizedIdentity || !Number.isInteger(normalizedSlot) || normalizedSlot < 1 || !String(url || '').trim()) {
        return { ok: true, reason: 'no-current-cg', removed: false, rendered: false };
    }
    if (typeof clear !== 'function') return { ok: false, reason: 'clear-unavailable', removed: false, rendered: false };
    if (typeof forceRender !== 'function') return { ok: false, reason: 'render-unavailable', removed: false, rendered: false };

    let cleared;
    try {
        cleared = await clear({ ...normalizedIdentity, slot: normalizedSlot });
    } catch (error) {
        return { ok: false, reason: 'clear-failed', error, removed: false, rendered: false };
    }
    if (cleared && cleared.ok === false) {
        return { ...cleared, ok: false, reason: cleared.reason || 'clear-failed', removed: false, rendered: false };
    }

    try {
        await forceRender({ force: true, reason: 'clear-current-cg' });
    } catch (error) {
        return { ok: false, reason: 'render-failed', error, removed: true, rendered: false };
    }
    return { ok: true, reason: 'cleared', removed: true, rendered: true };
}
