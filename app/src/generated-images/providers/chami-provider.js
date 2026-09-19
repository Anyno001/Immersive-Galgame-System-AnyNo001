import { collectDomImageCandidates, resolveDomRoots } from '../dom-image-candidates.js';

const CHAMI_IMAGE_SELECTOR = '.tsp-generated-image';

export const chamiProvider = Object.freeze({
    id: 'builtin.chami',
    label: 'chami_tavern-scene-plugin',
    type: 'image-provider',
    providerType: 'extension-dom',
    adapterKey: 'chami',
    builtin: true,
    detachable: true,
    defaultPresetType: 'image-provider-preset',
    permissions: [],
    async detect(context) {
        if (collectChamiNodes(resolveDomRoots(context)).length > 0) return true;
        return collectDomImageCandidates(resolveDomRoots(context), {
            adapterKeys: ['chami'],
            scopePolicy: context.scopePolicy,
        }).length > 0;
    },
    async generate() {
        return { ok: false, reason: 'external-provider' };
    },
    async poll(task) {
        return task || null;
    },
    async extractImages(messageContext) {
        const roots = resolveDomRoots(messageContext);
        const nodes = collectChamiNodes(roots);
        const fromDb = await extractFromChamiDb(nodes, messageContext);
        if (fromDb.length) return fromDb;
        return collectDomImageCandidates(roots, {
            adapterKeys: ['chami'],
            scopePolicy: messageContext.scopePolicy,
        }).map((candidate) => ({
            url: candidate.url,
            providerId: 'builtin.chami',
            source: 'provider-dom',
            imageId: candidate.imageId,
            locationHash: candidate.locationHash,
            slotIndex: candidate.slotIndex,
            buttonIndex: candidate.buttonIndex,
            order: candidate.order,
        }));
    },
});

function collectChamiNodes(roots) {
    const seen = new Set();
    const nodes = [];
    for (const root of Array.isArray(roots) ? roots : []) {
        if (!root || typeof root.querySelectorAll !== 'function') continue;
        let found = [];
        try {
            found = Array.from(root.querySelectorAll(CHAMI_IMAGE_SELECTOR));
        } catch (error) {
            found = [];
        }
        for (const node of found) {
            if (!node || seen.has(node)) continue;
            seen.add(node);
            nodes.push(node);
        }
    }
    return nodes;
}

async function extractFromChamiDb(nodes, messageContext) {
    const db = resolveChamiDb(messageContext);
    if (!db || typeof db.getImageDataBatch !== 'function') return [];

    const entries = [];
    const idSet = new Set();
    for (const node of nodes) {
        const id = readNumericId(node);
        if (id == null || idSet.has(id)) continue;
        idSet.add(id);
        entries.push({ id, locationHash: safeAttr(node, 'data-location-hash') });
    }
    if (!entries.length) return [];

    entries.sort((left, right) => left.id - right.id);

    let records = null;
    try {
        records = await db.getImageDataBatch(entries.map((entry) => entry.id));
    } catch (error) {
        return [];
    }
    if (!Array.isArray(records)) return [];

    const recordById = new Map();
    for (const record of records) {
        if (record && record.id != null) recordById.set(Number(record.id), record);
    }

    const images = [];
    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const record = recordById.get(entry.id);
        const url = recordImageUrl(record);
        if (!url) continue;
        images.push({
            url,
            providerId: 'builtin.chami',
            source: 'provider-db',
            imageId: String(entry.id),
            locationHash: String((record && record.locationHash) || entry.locationHash || '').trim(),
            slotIndex: null,
            buttonIndex: null,
            order: entry.id,
        });
    }
    return images;
}

function recordImageUrl(record) {
    if (!record) return '';
    const data = record.imageData;
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
        try {
            return URL.createObjectURL(data);
        } catch (error) {
            return '';
        }
    }
    if (typeof data === 'string' && data) {
        return data.startsWith('data:') ? data : `data:image/png;base64,${data}`;
    }
    if (typeof record.serverPath === 'string' && record.serverPath) return record.serverPath;
    return '';
}

function resolveChamiDb(messageContext) {
    for (const win of candidateWindows(messageContext)) {
        const plugin = win && win.TavernScenePlugin;
        if (plugin && plugin.db) return plugin.db;
    }
    return null;
}

function candidateWindows(messageContext) {
    const wins = [];
    const add = (win) => {
        if (win && !wins.includes(win)) wins.push(win);
    };
    const globalObject = messageContext && messageContext.global;
    add(globalObject);
    try { add(globalObject && globalObject.top); } catch (error) { /* cross-origin */ }
    try { add(globalObject && globalObject.parent); } catch (error) { /* cross-origin */ }
    if (typeof window !== 'undefined') {
        add(window);
        try { add(window.top); } catch (error) { /* cross-origin */ }
    }
    return wins;
}

function readNumericId(node) {
    const raw = safeAttr(node, 'data-image-id');
    if (raw === '') return null;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
}

function safeAttr(node, name) {
    try {
        return node && typeof node.getAttribute === 'function'
            ? String(node.getAttribute(name) || '').trim()
            : '';
    } catch (error) {
        return '';
    }
}
