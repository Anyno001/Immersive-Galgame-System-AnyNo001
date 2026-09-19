import { createPresetGroup, createPresetRegistry } from '../presets/preset-registry.js';
import { createIgsCompatApi } from './igs-compat.js';

const API_GROUPS = [
    'imageProviders',
    'imageRequestBuilders',
    'actions',
    'components',
    'choiceComponents',
    'themePresets',
    'uiSkins',
    'sceneRegexPresets',
    'textFilterPresets',
    'textFormatPresets',
    'backgroundPacks',
    'characterPacks',
    'promptPresets',
];

const PRESET_GROUP_TO_TYPE = Object.freeze({
    sceneRegexPresets: 'scene-regex-preset',
    textFilterPresets: 'text-filter-preset',
    textFormatPresets: 'text-format-preset',
});

export function createPublicApi(app) {
    const presetRegistry = resolvePresetRegistry(app);
    const groupedApi = Object.fromEntries(API_GROUPS.map((name) => [
        name,
        createApiGroup(name, presetRegistry),
    ]));
    const igsCompatApi = createIgsCompatApi(app);

    return {
        name: 'Immersive Galgame System',
        version: app.version,
        api: groupedApi,

        refresh: app.refresh,
        renderScene(textScene) {
            return app.refresh({ textScene });
        },
        typeAndSend: app.typeAndSend,
        getState: app.getState,
        ensureMagicWandEntry() {
            if (!app.magicWandEntry || typeof app.magicWandEntry.ensure !== 'function') {
                return { ok: false, reason: 'magic-wand-entry-not-mounted' };
            }
            return app.magicWandEntry.ensure();
        },
        getMagicWandEntryState() {
            return app.magicWandEntry && typeof app.magicWandEntry.getState === 'function'
                ? app.magicWandEntry.getState()
                : { attached: false, reason: 'magic-wand-entry-not-mounted' };
        },
        destroy: app.destroy,
        ...igsCompatApi,
    };
}

export function attachPublicApi(globalObject, api) {
    if (!globalObject) return api;
    globalObject.IGS = api;
    globalObject.ImmersiveGalgameSystem = api;
    return api;
}

export function detachPublicApi(globalObject, api) {
    if (!globalObject) return;
    if (globalObject.IGS === api) delete globalObject.IGS;
    if (globalObject.ImmersiveGalgameSystem === api) delete globalObject.ImmersiveGalgameSystem;
}

function createApiGroup(groupName, presetRegistry) {
    const presetType = PRESET_GROUP_TO_TYPE[groupName];
    if (presetType) {
        return createPresetGroup(presetRegistry, presetType);
    }
    return createRegistryGroup(groupName);
}

function createRegistryGroup(groupName) {
    const items = new Map();

    return {
        register(item) {
            if (!item || !item.id) {
                return { ok: false, reason: 'missing-id', groupName };
            }
            items.set(item.id, item);
            return { ok: true, item };
        },
        unregister(id) {
            return { ok: items.delete(id), id };
        },
        get(id) {
            return items.get(id) || null;
        },
        list() {
            return Array.from(items.values());
        },
    };
}

function resolvePresetRegistry(app) {
    if (app && app.presetRegistry) return app.presetRegistry;
    if (app && typeof app.getPresetRegistry === 'function') {
        const registry = app.getPresetRegistry();
        if (registry) return registry;
    }
    return createPresetRegistry();
}
