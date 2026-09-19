const ALLOWED_TYPES = new Set([
    'image-provider',
    'image-provider-preset',
    'image-request-builder',
    'image-request-builder-preset',
    'workflow-preset',
    'ui-component',
    'choice-component',
    'ui-skin-preset',
    'ui-layout-preset',
    'theme-preset',
    'css-preset',
    'scene-regex-preset',
    'text-filter-preset',
    'text-format-preset',
    'choice-parser-preset',
    'background-pack',
    'character-pack',
    'background-rule-preset',
    'prompt-preset',
]);

const FORBIDDEN_TYPES = new Set(['global-mod-manager', 'hotkey-preset', 'shujuku-template']);

export function dispatchImportBundle(bundle = {}, handlers = {}) {
    const accepted = [];
    const rejected = [];
    const items = Array.isArray(bundle.items) ? bundle.items : [];

    for (const item of items) {
        if (!item || !item.type || FORBIDDEN_TYPES.has(item.type) || !ALLOWED_TYPES.has(item.type)) {
            rejected.push({ item, reason: 'unsupported-type' });
            continue;
        }
        const handler = handlers[item.type];
        if (handler) handler(item);
        accepted.push(item);
    }

    return { ok: rejected.length === 0, accepted, rejected };
}
