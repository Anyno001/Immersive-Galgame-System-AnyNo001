import { collectDomImageCandidates, resolveDomRoots } from '../dom-image-candidates.js';

export const domGenericProvider = Object.freeze({
    id: 'builtin.dom-generic',
    label: 'dom-generic',
    type: 'image-provider',
    providerType: 'extension-dom',
    adapterKey: 'generic',
    builtin: true,
    detachable: false,
    permissions: [],

    async detect(context) {
        return collectDomImageCandidates(resolveDomRoots(context), {
            adapterKeys: ['generic'],
            scopePolicy: context.scopePolicy,
        }).length > 0;
    },

    async generate() {
        return { ok: false, reason: 'external-provider' };
    },

    async poll(task) {
        return task || null;
    },

    extractImages(messageContext) {
        const candidates = collectDomImageCandidates(resolveDomRoots(messageContext), {
            adapterKeys: ['generic'],
            scopePolicy: messageContext.scopePolicy,
        });
        const slots = messageContext.imageState && Array.isArray(messageContext.imageState.slots)
            ? messageContext.imageState.slots
            : Array.isArray(messageContext.imageSlots) ? messageContext.imageSlots : [];
        const assignSlotIndex = slots.length > 0 && candidates.length === slots.length;
        return candidates.map((candidate, index) => ({
            url: candidate.url,
            providerId: 'builtin.dom-generic',
            source: 'provider-dom',
            imageId: candidate.imageId,
            locationHash: candidate.locationHash,
            slotIndex: candidate.slotIndex ?? (assignSlotIndex ? index : null),
            buttonIndex: candidate.buttonIndex,
            order: candidate.order,
        }));
    },
});
