export const REQUIRED_VISUAL_SLOTS = Object.freeze([
    '.igs-stage',
    '.igs-background-layer',
    '.igs-generated-layer',
    '.igs-character-layer',
    '.igs-dialogue-layer',
    '.igs-hud-layer',
    '.igs-toolbar',
    '.igs-choice-layer',
    '.igs-system-layer',
]);

export const REQUIRED_READER_BRIDGE = Object.freeze([
    'data-igs-toolbar-layout',
    'data-igs-toolbar-placement',
    'data-igs-dialogue-style',
    'data-igs-nameplate-visible',
    'data-igs-avatar-visible',
]);

export function checkStyleContract(target = {}) {
    const missingSlots = REQUIRED_VISUAL_SLOTS.filter((selector) => !hasSelector(target, selector));
    const missingData = REQUIRED_READER_BRIDGE.filter((name) => !hasDataBridge(target, name));

    return {
        ok: missingSlots.length === 0 && missingData.length === 0,
        missingSlots,
        missingData,
    };
}

function hasSelector(target, selector) {
    if (typeof target.querySelector === 'function') return !!target.querySelector(selector);
    return Array.isArray(target.slots) && target.slots.includes(selector);
}

function hasDataBridge(target, name) {
    if (target.datasetKeys && target.datasetKeys.includes(name)) return true;
    if (target.attributes && Object.prototype.hasOwnProperty.call(target.attributes, name)) return true;
    return false;
}
