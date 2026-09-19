import { chamiProvider } from './providers/chami-provider.js';
import { domGenericProvider } from './providers/dom-generic-provider.js';
import { naiProvider } from './providers/nai-provider.js';
import { stChatu8Provider } from './providers/st-chatu8-provider.js';

const BUILTIN_IMAGE_PROVIDERS = Object.freeze([
    stChatu8Provider,
    chamiProvider,
    domGenericProvider,
    naiProvider,
]);

export function listBuiltinImageProviders() {
    return BUILTIN_IMAGE_PROVIDERS.slice();
}

export async function collectProviderImages(messageContext = {}, providers = BUILTIN_IMAGE_PROVIDERS) {
    const activeProviders = normalizeProviders(providers);
    const images = [];

    for (const provider of activeProviders) {
        if (!provider || typeof provider.extractImages !== 'function') continue;

        let detected = true;
        if (typeof provider.detect === 'function') {
            try {
                detected = await provider.detect(messageContext);
            } catch (error) {
                detected = false;
            }
        }
        if (!detected) continue;

        let extracted = [];
        try {
            extracted = await provider.extractImages(messageContext) || [];
        } catch (error) {
            extracted = [];
        }
        for (const image of Array.isArray(extracted) ? extracted : []) {
            const url = String(image && image.url || '').trim();
            if (!url) continue;
            images.push({
                url,
                providerId: String(image.providerId || provider.id || '').trim(),
                source: String(image.source || 'provider-dom').trim(),
                filename: String(image.filename || '').trim(),
                imageId: String(image.imageId || '').trim(),
                locationHash: String(image.locationHash || '').trim(),
                slotIndex: normalizeOptionalIndex(image.slotIndex),
                buttonIndex: normalizeOptionalIndex(image.buttonIndex),
                order: normalizeOptionalIndex(image.order),
            });
        }
    }

    return uniqueImages(images);
}

function normalizeProviders(providers) {
    const source = Array.isArray(providers) ? providers : [];
    const output = [];
    const seen = new Set();

    for (const provider of source) {
        if (!provider || typeof provider !== 'object') continue;
        const id = String(provider.id || '').trim();
        const key = id || `${provider.label || 'provider'}:${output.length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(provider);
    }

    return output;
}

function uniqueImages(images) {
    const output = [];
    const seen = new Map();
    for (const image of Array.isArray(images) ? images : []) {
        const url = String(image && image.url || '').trim();
        if (!url) continue;
        const nextImage = {
            url,
            providerId: String(image.providerId || '').trim(),
            source: String(image.source || '').trim(),
            filename: String(image.filename || '').trim(),
            imageId: String(image.imageId || '').trim(),
            locationHash: String(image.locationHash || '').trim(),
            slotIndex: normalizeOptionalIndex(image.slotIndex),
            buttonIndex: normalizeOptionalIndex(image.buttonIndex),
            order: normalizeOptionalIndex(image.order),
        };
        const existingIndex = seen.get(url);
        if (existingIndex == null) {
            seen.set(url, output.length);
            output.push(nextImage);
            continue;
        }
        output[existingIndex] = mergeImageMetadata(output[existingIndex], nextImage);
    }
    return output;
}

function mergeImageMetadata(current, next) {
    return {
        ...current,
        ...next,
        providerId: current.providerId || next.providerId,
        source: current.source || next.source,
        filename: current.filename || next.filename,
        imageId: current.imageId || next.imageId,
        locationHash: current.locationHash || next.locationHash,
        slotIndex: current.slotIndex ?? next.slotIndex ?? null,
        buttonIndex: current.buttonIndex ?? next.buttonIndex ?? null,
        order: current.order ?? next.order ?? null,
    };
}

function normalizeOptionalIndex(value) {
    if (value == null || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return null;
    return Math.floor(numeric);
}
