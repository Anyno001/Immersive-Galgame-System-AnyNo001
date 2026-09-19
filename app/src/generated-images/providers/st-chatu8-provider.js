import { collectDomImageCandidates, resolveDomRoots } from '../dom-image-candidates.js';

export const stChatu8Provider = Object.freeze({
    id: 'builtin.st-chatu8',
    label: 'st-chatu8',
    type: 'image-provider',
    providerType: 'extension-dom',
    adapterKey: 'chatu8',
    builtin: true,
    detachable: true,
    defaultPresetType: 'image-provider-preset',
    permissions: [],
    async detect(context) {
        return collectDomImageCandidates(resolveDomRoots(context), {
            adapterKeys: ['chatu8'],
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
        return collectDomImageCandidates(resolveDomRoots(messageContext), {
            adapterKeys: ['chatu8'],
            scopePolicy: messageContext.scopePolicy,
        }).map((candidate, index) => ({
            url: candidate.url,
            providerId: 'builtin.st-chatu8',
            source: 'provider-dom',
            imageId: candidate.imageId,
            locationHash: candidate.locationHash,
            slotIndex: candidate.slotIndex ?? index,
            buttonIndex: candidate.buttonIndex,
            order: candidate.order,
        }));
    },
});
