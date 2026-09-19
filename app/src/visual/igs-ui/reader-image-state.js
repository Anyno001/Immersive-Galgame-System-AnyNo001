import {
    cloneData,
    firstDefined,
    normalizeFiniteIndex,
    normalizeNullableNumber,
} from './reader-value-utils.js';
import {
    INITIAL_IMAGE_POLL_ATTEMPTS,
    INITIAL_IMAGE_POLL_INTERVAL_MS,
} from './reader-host-constants.js';

export function shouldPollReaderImages(content = {}) {
    const expected = Number(content.imageExpectedCount || content.imageCount || 0) || 0;
    if (!expected) return false;
    const slots = Array.isArray(content.imageSlots) ? content.imageSlots : [];
    if (!slots.length) return false;
    const bound = Number(content.imageBoundCount || 0) || countBoundImageSlots({ slots });
    return bound < expected || !String(content.currentSlotImageUrl || content.currentImageUrl || '').trim();
}

export function countBoundImageSlots(imageState = {}) {
    return (Array.isArray(imageState.slots) ? imageState.slots : [])
        .filter((slot) => String(slot && slot.url || '').trim())
        .length;
}

export function normalizePollInterval(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return INITIAL_IMAGE_POLL_INTERVAL_MS;
    return Math.max(50, Math.min(750, Math.floor(numeric)));
}

export function normalizePollAttempts(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return INITIAL_IMAGE_POLL_ATTEMPTS;
    return Math.max(1, Math.min(20, Math.floor(numeric)));
}

export function waitForReaderImagePoll(duration, globalObject) {
    return new Promise((resolve) => {
        const timeout = globalObject && typeof globalObject.setTimeout === 'function'
            ? globalObject.setTimeout.bind(globalObject)
            : setTimeout;
        timeout(resolve, duration);
    });
}

export function buildProgressText(currentIndex, totalSegments, imageState) {
    const segmentProgress = `${currentIndex + 1} / ${totalSegments}`;
    if (!imageState || !imageState.count) return segmentProgress;
    const expected = Number(imageState.expectedCount || imageState.count || 0) || 0;
    const bound = Number(imageState.boundCount || 0) || 0;
    const unbound = Number(imageState.unboundCount || 0) || 0;
    const hasSlots = Array.isArray(imageState.slots) && imageState.slots.length > 0;
    if (!hasSlots) return `${segmentProgress}   [${imageState.currentIndex + 1}/${imageState.count} 图]`;
    const currentUrl = String(imageState.slotUrl || imageState.currentUrl || imageState.displayUrl || '').trim();
    const slotText = currentUrl
        ? `图位 ${imageState.currentIndex + 1}/${expected}`
        : '当前图位未生成';
    const suffix = !currentUrl && unbound > 0 ? `，未匹配 ${unbound}` : '';
    return `${segmentProgress}   [${slotText}，已绑定 ${bound}/${expected}${suffix}]`;
}

export function normalizeSnapshotImageState(imageState, fallbackIndex = 0) {
    const unboundImages = Array.isArray(imageState && imageState.unboundImages)
        ? imageState.unboundImages
            .map((image, index) => mapSnapshotImageEntry(image, index, true))
            .filter(Boolean)
        : [];
    const slots = Array.isArray(imageState && imageState.slots)
        ? imageState.slots
            .map((image, index) => mapSnapshotImageEntry(image, index, false))
            .filter(Boolean)
        : [];
    const images = slots.length
        ? cloneData(slots)
        : Array.isArray(imageState && imageState.images)
            ? imageState.images
                .map((image, index) => mapSnapshotImageEntry(image, index, true))
                .filter(Boolean)
            : [];
    const totalCount = slots.length || images.length;
    const activeIndex = totalCount
        ? Math.max(0, Math.min(totalCount - 1, normalizeFiniteIndex(
            firstDefined(fallbackIndex, imageState && imageState.currentIndex),
        )))
        : 0;
    const displayImage = slots.length
        ? resolveSnapshotDisplayImage(slots, activeIndex) || resolveIndexedSnapshotUnboundImage(unboundImages, activeIndex, slots.length)
        : images[activeIndex] || null;
    const expectedCount = Number(firstDefined(imageState && imageState.expectedCount, totalCount)) || totalCount;
    const boundCount = slots.length
        ? slots.filter((slot) => String(slot && slot.url || '').trim()).length
        : images.length;
    const unboundCount = unboundImages.length;
    return {
        slots,
        images,
        unboundImages,
        count: totalCount,
        expectedCount,
        boundCount,
        unboundCount,
        availableCount: boundCount + unboundCount,
        signature: String(imageState && imageState.signature || ''),
        currentIndex: activeIndex,
        currentUrl: String(displayImage && displayImage.url || ''),
        displayUrl: String(displayImage && displayImage.url || ''),
        slotUrl: String(slots[activeIndex] && slots[activeIndex].url || displayImage && displayImage.url || ''),
    };
}

export function applyImageCountOverride(imageState, override) {
    const expected = normalizeNullableNumber(override);
    if (!expected || expected <= 0 || !imageState || !Array.isArray(imageState.slots) || !imageState.slots.length) {
        return imageState;
    }
    const slots = imageState.slots.slice(0, expected);
    while (slots.length < expected) {
        const slotIndex = slots.length;
        slots.push({
            url: '',
            providerId: '',
            source: 'manual-image-count',
            filename: '',
            imageId: '',
            locationHash: '',
            slotIndex,
            buttonIndex: null,
            title: `图 ${slotIndex + 1}`,
            promptText: '',
            rawBlock: '',
            tagName: 'image',
            order: null,
        });
    }
    const currentIndex = Math.max(0, Math.min(slots.length - 1, normalizeFiniteIndex(imageState.currentIndex)));
    const currentSlot = slots[currentIndex] || null;
    const boundCount = slots.filter((slot) => String(slot && slot.url || '').trim()).length;
    const unboundImages = Array.isArray(imageState.unboundImages) ? cloneData(imageState.unboundImages) : [];
    return {
        ...imageState,
        slots,
        images: cloneData(slots),
        count: slots.length,
        expectedCount: slots.length,
        boundCount,
        unboundCount: unboundImages.length,
        availableCount: boundCount + unboundImages.length,
        currentIndex,
        currentUrl: String(currentSlot && currentSlot.url || ''),
        displayUrl: String(currentSlot && currentSlot.url || ''),
        slotUrl: String(currentSlot && currentSlot.url || ''),
    };
}

export function buildImageActionContext(current, unifiedSettings = null) {
    const snapshot = current && current.snapshot || {};
    const content = snapshot.content || {};
    return {
        mode: current && current.mode || 'pc',
        message: current && current.payload && current.payload.message || null,
        messageId: snapshot.messageId,
        prompt: content.text || '',
        currentIndex: content.currentIndex || 0,
        textIndex: normalizeFiniteIndex(content.currentIndex || 0),
        imageIndex: normalizeFiniteIndex(firstDefined(content.activeImageIndex, content.currentIndex, 0)),
        imageState: {
            images: cloneData(content.images || []),
            slots: cloneData(content.imageSlots || []),
            unboundImages: cloneData(content.unboundImages || []),
            count: Number(content.imageCount || 0) || 0,
            expectedCount: Number(content.imageExpectedCount || content.imageCount || 0) || 0,
            boundCount: Number(content.imageBoundCount || 0) || 0,
            unboundCount: Number(content.imageUnboundCount || 0) || 0,
            availableCount: Number(content.imageAvailableCount || 0) || 0,
            signature: String(content.imageSignature || ''),
            currentIndex: normalizeFiniteIndex(firstDefined(content.activeImageIndex, content.currentIndex, 0)),
            currentUrl: String(content.currentImageUrl || content.backgroundImage || ''),
            displayUrl: String(content.currentImageUrl || content.backgroundImage || ''),
            slotUrl: String(content.currentSlotImageUrl || ''),
        },
        currentUrl: String(content.currentImageUrl || content.backgroundImage || ''),
        scene: current && current.payload && current.payload.scene || null,
        render: current && current.payload && current.payload.render || null,
        unifiedSettings: unifiedSettings || null,
    };
}

export function resolveSegmentImageIndex(payload, textIndex) {
    const segmentImageSlots = Array.isArray(payload && payload.segmentImageSlots)
        ? payload.segmentImageSlots
        : [];
    const mapped = Number(segmentImageSlots[textIndex]);
    if (Number.isFinite(mapped) && mapped >= 0) return Math.floor(mapped);
    return normalizeFiniteIndex(firstDefined(
        payload && payload.imageState && payload.imageState.currentIndex,
        textIndex,
        0,
    ));
}

export function mapSnapshotImageEntry(image, fallbackIndex, requireUrl) {
    const url = String(image && image.url || '').trim();
    if (requireUrl && !url) return null;
    return {
        url,
        providerId: String(image && image.providerId || '').trim(),
        source: String(image && image.source || '').trim(),
        filename: String(image && image.filename || '').trim(),
        imageId: String(image && image.imageId || '').trim(),
        locationHash: String(image && image.locationHash || '').trim(),
        slotIndex: normalizeFiniteIndex(firstDefined(image && image.slotIndex, fallbackIndex, 0)),
        buttonIndex: normalizeNullableNumber(image && image.buttonIndex),
        title: String(image && image.title || '').trim(),
        promptText: String(image && image.promptText || '').trim(),
        rawBlock: String(image && image.rawBlock || '').trim(),
        tagName: String(image && image.tagName || '').trim(),
        order: normalizeNullableNumber(image && image.order),
    };
}

export function resolveSnapshotDisplayImage(slots, activeIndex) {
    const source = Array.isArray(slots) ? slots : [];
    const slot = source[activeIndex];
    return String(slot && slot.url || '').trim() ? slot : null;
}

export function resolveIndexedSnapshotUnboundImage(unboundImages, activeIndex, slotCount) {
    const source = Array.isArray(unboundImages) ? unboundImages : [];
    if (!source.length || source.length !== slotCount) return null;
    return source[normalizeFiniteIndex(activeIndex)] || null;
}
