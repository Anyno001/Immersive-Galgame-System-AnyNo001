const INJECTION_ID = 'igs-scene-assets-format-rule';
// system 位置时，本轮提醒与按需展开的块另用一个 key 注入到 depth 0。
const DEPTH0_INJECTION_ID = 'igs-scene-assets-depth0';
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

    // placement=system：content 进 prompt 区（IN_PROMPT，相对静态、可命中前缀缓存），depth0Content 进 depth 0；
    // placement=depth0（旧行为）：两段合并为一条 IN_CHAT depth 0。
    function inject(content, { placement = 'depth0', depth0Content = '' } = {}) {
        clear();
        if (!content) return { ok: false, reason: 'empty-content' };
        const split = placement === 'system';
        const merged = [content, depth0Content].filter(Boolean).join('\n\n');
        const main = split ? content : merged;
        const position = split ? EXTENSION_PROMPT_IN_PROMPT : EXTENSION_PROMPT_IN_CHAT;

        const context = getContext();
        if (context && typeof context.setExtensionPrompt === 'function') {
            try {
                context.setExtensionPrompt(
                    INJECTION_ID,
                    main,
                    position,
                    0,
                    false,
                    EXTENSION_PROMPT_SYSTEM,
                );
                if (split && depth0Content) {
                    context.setExtensionPrompt(DEPTH0_INJECTION_ID, depth0Content, EXTENSION_PROMPT_IN_CHAT, 0, false, EXTENSION_PROMPT_SYSTEM);
                }
                const verification = verifyContextPrompt(context, main, position);
                if (verification.ok) {
                    active = true;
                    return { ok: true, method: 'extension-prompt', verified: true, placement: split ? 'system' : 'depth0' };
                }
                return {
                    ok: false,
                    method: 'extension-prompt',
                    reason: verification.reason,
                };
            } catch (error) { /* fall through */ }
        }

        // 酒馆助手的注入只有聊天内位置，两段合并。
        const injectVia = (api, method) => {
            handle = api.injectPrompts([{
                id: INJECTION_ID,
                position: 'none',
                depth: 0,
                role: 'system',
                content: merged,
                should_scan: false,
            }]);
            active = true;
            return { ok: false, method, reason: 'unverified-in-prompt-position' };
        };

        const helper = getTavernHelper();
        if (helper && typeof helper.injectPrompts === 'function') {
            try { return injectVia(helper, 'tavern-helper'); } catch (error) { /* fall through */ }
        }

        if (typeof root.injectPrompts === 'function') {
            try { return injectVia(root, 'global-inject'); } catch (error) { /* fall through */ }
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
        for (const id of [INJECTION_ID, DEPTH0_INJECTION_ID]) {
            if (context && context.extensionPrompts && typeof context.extensionPrompts === 'object') {
                try { delete context.extensionPrompts[id]; } catch (error) { /* */ }
            }
            if (context && typeof context.setExtensionPrompt === 'function' && context.extensionPrompts && context.extensionPrompts[id]) {
                try {
                    context.setExtensionPrompt(
                        id,
                        '',
                        EXTENSION_PROMPT_NONE,
                        0,
                        false,
                        EXTENSION_PROMPT_SYSTEM,
                    );
                } catch (error) { /* */ }
            }
        }
    }

    function isActive() {
        const context = getContext();
        return active || !!getPromptRecord(context);
    }

    return { inject, clear, isActive };
}

function verifyContextPrompt(context, content, position = EXTENSION_PROMPT_IN_CHAT) {
    const record = getPromptRecord(context);
    if (!record) return { ok: false, reason: 'extension-prompt-not-registered' };
    if (String(record.value || '') !== String(content || '')) {
        return { ok: false, reason: 'extension-prompt-content-mismatch' };
    }
    if (Number(record.position) !== position) {
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
