const INJECTION_ID = 'igs-scene-assets-format-rule';
const EXTENSION_PROMPT_IN_PROMPT = 0;
const EXTENSION_PROMPT_IN_CHAT = 1;
const EXTENSION_PROMPT_NONE = -1;
const EXTENSION_PROMPT_SYSTEM = 0;

export function createPromptInjector(globalObject) {
    const root = globalObject || globalThis.window || globalThis;
    let handle = null;
    let active = false;

    function getTavernHelper() {
        try {
            if (root.TavernHelper) return root.TavernHelper;
            if (globalThis.TavernHelper) return globalThis.TavernHelper;
            if (typeof window !== 'undefined' && window.TavernHelper) return window.TavernHelper;
            if (root.top && root.top.TavernHelper) return root.top.TavernHelper;
        } catch (error) { /* cross-origin */ }
        return null;
    }

    function getContext() {
        try {
            if (root.SillyTavern && typeof root.SillyTavern.getContext === 'function') {
                return root.SillyTavern.getContext();
            }
            if (globalThis.SillyTavern && typeof globalThis.SillyTavern.getContext === 'function') {
                return globalThis.SillyTavern.getContext();
            }
            if (typeof window !== 'undefined' && window.SillyTavern && typeof window.SillyTavern.getContext === 'function') {
                return window.SillyTavern.getContext();
            }
        } catch (error) { /* */ }
        return null;
    }

    function inject(content) {
        clear();
        if (!content) return { ok: false, reason: 'empty-content' };

        const context = getContext();
        if (context && typeof context.setExtensionPrompt === 'function') {
            try {
                context.setExtensionPrompt(
                    INJECTION_ID,
                    content,
                    EXTENSION_PROMPT_IN_CHAT,
                    0,
                    false,
                    EXTENSION_PROMPT_SYSTEM,
                );
                const verification = verifyContextPrompt(context, content);
                if (verification.ok) {
                    active = true;
                    return { ok: true, method: 'extension-prompt', verified: true };
                }
                return {
                    ok: false,
                    method: 'extension-prompt',
                    reason: verification.reason,
                };
            } catch (error) { /* fall through */ }
        }

        const helper = getTavernHelper();
        if (helper && typeof helper.injectPrompts === 'function') {
            try {
                handle = helper.injectPrompts([{
                    id: INJECTION_ID,
                    position: 'none',
                    depth: 0,
                    role: 'system',
                    content,
                    should_scan: false,
                }]);
                active = true;
                return { ok: false, method: 'tavern-helper', reason: 'unverified-in-prompt-position' };
            } catch (error) { /* fall through */ }
        }

        if (typeof root.injectPrompts === 'function') {
            try {
                handle = root.injectPrompts([{
                    id: INJECTION_ID,
                    position: 'none',
                    depth: 0,
                    role: 'system',
                    content,
                    should_scan: false,
                }]);
                active = true;
                return { ok: false, method: 'global-inject', reason: 'unverified-in-prompt-position' };
            } catch (error) { /* fall through */ }
        }

        return { ok: false, reason: 'no-injection-api' };
    }

    function clear() {
        if (handle && typeof handle.uninject === 'function') {
            try { handle.uninject(); } catch (error) { /* */ }
            handle = null;
        }
        handle = null;
        active = false;
        const context = getContext();
        if (context && context.extensionPrompts && typeof context.extensionPrompts === 'object') {
            try { delete context.extensionPrompts[INJECTION_ID]; } catch (error) { /* */ }
        }
        if (context && typeof context.setExtensionPrompt === 'function' && context.extensionPrompts && context.extensionPrompts[INJECTION_ID]) {
            try {
                context.setExtensionPrompt(
                    INJECTION_ID,
                    '',
                    EXTENSION_PROMPT_NONE,
                    0,
                    false,
                    EXTENSION_PROMPT_SYSTEM,
                );
            } catch (error) { /* */ }
        }
    }

    function isActive() {
        const context = getContext();
        return active || !!getPromptRecord(context);
    }

    return { inject, clear, isActive };
}

function verifyContextPrompt(context, content) {
    const record = getPromptRecord(context);
    if (!record) return { ok: false, reason: 'extension-prompt-not-registered' };
    if (String(record.value || '') !== String(content || '')) {
        return { ok: false, reason: 'extension-prompt-content-mismatch' };
    }
    if (Number(record.position) !== EXTENSION_PROMPT_IN_CHAT) {
        return { ok: false, reason: 'extension-prompt-position-mismatch' };
    }
    return { ok: true };
}

function getPromptRecord(context) {
    if (!context || !context.extensionPrompts || typeof context.extensionPrompts !== 'object') return null;
    const record = context.extensionPrompts[INJECTION_ID];
    if (!record || !String(record.value || '').trim()) return null;
    return record;
}
