import {
    getMessagePrimaryText,
    getVisibleMessageTextFromElement,
    looksLikeHostUiHtml,
} from '../scene/message-source.js';
import { collectDomRegenerateButtonCandidates } from '../generated-images/dom-image-candidates.js';

const INTERNAL_READER_ATTR = 'data-igs-internal-reader';
const HIDDEN_CACHE_WINDOW_MS = 300;
const VN_IMAGE_PLACEHOLDER_SELECTOR = '[data-igs-image-placeholder="1"], .igs-image-placeholder';
const LEGACY_IMAGE_PLACEHOLDER_SELECTOR = '.igs-img-ph';

export function createTavernHelperAdapter(globalObject = globalThis.window || globalThis) {
    let hiddenMessageCache = { at: 0, ids: null };

    return {
        async getLastMessageId() {
            return getLastMessageId(globalObject);
        },

        async getCurrentMessage() {
            const normalizedMessages = getNormalizedMessages(globalObject, hiddenMessageCache);
            return pickCurrentMessage(normalizedMessages) || normalizedMessages[normalizedMessages.length - 1] || null;
        },

        async getMessageById(messageId) {
            const normalizedId = normalizeMessageId(messageId);
            if (normalizedId == null) return null;
            const domMessageMap = createDomMessageMap(globalObject);
            const hiddenIds = getHiddenMessageIdSet(globalObject, hiddenMessageCache);
            const direct = getChatMessages(globalObject, normalizedId, normalizedId).find((message, index) => {
                return resolveMessageId(message, normalizedId + index) === normalizedId;
            });
            if (direct) return normalizeMessage(direct, normalizedId, domMessageMap, hiddenIds);

            const entries = getChatMessageEntries(globalObject);
            const fallback = entries.find((item) => item.id === normalizedId);
            return normalizeMessage(fallback && fallback.message, normalizedId, domMessageMap, hiddenIds);
        },

        async listMessages() {
            return getNormalizedMessages(globalObject, hiddenMessageCache);
        },

        async getAdjacentMessage(messageId, delta = 1) {
            const normalizedId = normalizeMessageId(messageId);
            if (normalizedId == null) return null;
            const step = Number(delta) < 0 ? -1 : 1;
            const messages = getNormalizedMessages(globalObject, hiddenMessageCache).filter(isTurnCandidate);
            const currentIndex = messages.findIndex((message) => message.id === normalizedId);
            if (currentIndex < 0) return null;
            return messages[currentIndex + step] || null;
        },

        async jumpToMessage(messageId) {
            const helper = getTavernHelper(globalObject);
            if (!helper) return { ok: false, reason: 'missing-tavern-helper' };
            const normalizedId = normalizeMessageId(messageId);
            if (normalizedId == null) return { ok: false, reason: 'invalid-message-id', messageId };
            if (typeof helper.triggerSlash !== 'function') {
                return { ok: false, reason: 'missing-trigger-slash', messageId: normalizedId };
            }
            await helper.triggerSlash(`/chat-jump ${normalizedId}`);
            return { ok: true, messageId: normalizedId };
        },

        async findRegenerateButton(messageId, imageIndex = 0, imageState = null) {
            const message = await this.getMessageById(messageId);
            if (!message) return null;
            return findMessageRegenerateButton(message, imageIndex, imageState);
        },

        async ensureMessageImagePlaceholders(messageId, imageSlots = [], message = null) {
            const scopedMessage = message || await this.getMessageById(messageId);
            return ensureMessageImagePlaceholders(scopedMessage, imageSlots);
        },

        async removeMessageImagePlaceholders(messageId, message = null) {
            const scopedMessage = message || await this.getMessageById(messageId);
            return removeMessageImagePlaceholders(scopedMessage);
        },

        async typeAndSend(text) {
            const helper = getTavernHelper(globalObject);
            if (helper && typeof helper.typeAndSend === 'function') {
                await helper.typeAndSend(text);
                return { ok: true };
            }
            if (helper && typeof helper.setInputText === 'function' && typeof helper.send === 'function') {
                await helper.setInputText(text);
                await helper.send();
                return { ok: true };
            }
            const domResult = sendViaHostDom(globalObject, text);
            if (domResult.ok) return domResult;
            if (!helper) return { ok: false, reason: 'missing-tavern-helper' };
            return { ok: false, reason: domResult.reason || 'missing-send-api' };
        },
    };
}

function sendViaHostDom(globalObject, text) {
    const value = String(text == null ? '' : text);
    for (const doc of getCandidateDocuments(globalObject)) {
        const textarea = safeQuery(doc, '#send_textarea');
        const button = safeQuery(doc, '#send_but');
        if (!textarea || !button) continue;
        try {
            const setter = resolveNativeValueSetter(textarea, doc);
            if (setter) {
                setter.call(textarea, value);
            } else {
                textarea.value = value;
            }
            dispatchInputEvents(textarea, doc);
            button.click();
            return { ok: true, reason: 'host-dom-send' };
        } catch (error) {
            return { ok: false, reason: 'host-dom-send-failed' };
        }
    }
    return { ok: false, reason: 'missing-host-dom-send' };
}

function resolveNativeValueSetter(element, doc) {
    const view = (doc && doc.defaultView) || globalThis.window || globalThis;
    const proto = element && typeof element.tagName === 'string' && element.tagName.toLowerCase() === 'textarea'
        ? view.HTMLTextAreaElement && view.HTMLTextAreaElement.prototype
        : view.HTMLInputElement && view.HTMLInputElement.prototype;
    const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'value');
    return descriptor && typeof descriptor.set === 'function' ? descriptor.set : null;
}

function dispatchInputEvents(element, doc) {
    if (!element || typeof element.dispatchEvent !== 'function') return;
    const view = (doc && doc.defaultView) || globalThis.window || globalThis;
    const EventCtor = view && view.Event || globalThis.Event;
    for (const type of ['input', 'change']) {
        try {
            if (typeof EventCtor === 'function') {
                element.dispatchEvent(new EventCtor(type, { bubbles: true }));
                continue;
            }
        } catch (error) {
            // Fall back to plain-object dispatch for fake documents.
        }
        try {
            element.dispatchEvent({ type, bubbles: true });
        } catch (error) {
            // Ignore dispatch failures from host shims.
        }
    }
}

function safeQuery(root, selector) {
    try {
        return root && typeof root.querySelector === 'function'
            ? root.querySelector(selector)
            : null;
    } catch (error) {
        return null;
    }
}

export function getTavernHelper(globalObject = globalThis.window || globalThis) {
    try {
        return globalObject && globalObject.TavernHelper
            || globalObject && globalObject.top && globalObject.top.TavernHelper
            || (typeof window !== 'undefined' ? window.TavernHelper : null)
            || null;
    } catch (error) {
        return null;
    }
}

export function getSillyTavernContext(globalObject = globalThis.window || globalThis) {
    return (
        getContextFromTarget(globalObject) ||
        getContextFromTarget(globalObject && globalObject.parent) ||
        getContextFromTarget(globalObject && globalObject.top) ||
        null
    );
}

export function getChatFromContext(globalObject = globalThis.window || globalThis) {
    const context = getSillyTavernContext(globalObject);
    return context && Array.isArray(context.chat) ? context.chat : null;
}

export function getCandidateDocuments(globalObject = globalThis.window || globalThis) {
    const docs = [];
    const addDoc = (doc) => {
        if (doc && !docs.includes(doc)) docs.push(doc);
    };

    addDoc(safeDocument(globalObject));
    try {
        addDoc(safeDocument(globalObject && globalObject.top));
    } catch (error) {
        // Cross-origin top windows are ignored.
    }
    if (typeof document !== 'undefined') addDoc(document);
    return docs;
}

export function getMessageScopedRoots(message, targetDocument = null) {
    const roots = [];
    const seen = new Set();
    const addRoot = (root) => {
        if (!root || typeof root.querySelectorAll !== 'function' || seen.has(root)) return;
        seen.add(root);
        roots.push(root);
    };

    const element = message && message.element;
    if (element) {
        addRoot(element);
        addRoot(getMessageTextRoot(element));
        getMessageScopedDocs(element).forEach(addRoot);
        if (targetDocument && documentBelongsToMessage(targetDocument, element)) {
            addRoot(targetDocument);
        }
        return roots;
    }

    addRoot(targetDocument);
    return roots;
}

export function ensureMessageImagePlaceholders(message, imageSlots = []) {
    const placeholders = normalizeImagePlaceholderBlocks(imageSlots);
    if (!placeholders.length) {
        return removeMessageImagePlaceholders(message);
    }
    const mesText = getMessageTextRoot(resolveMessageElementFromInput(message));
    if (!mesText || typeof mesText.appendChild !== 'function') {
        return {
            ok: false,
            reason: 'message-text-root-not-found',
            count: placeholders.length,
        };
    }
    const owned = getOwnedImagePlaceholders(mesText);
    const legacy = !owned.length && typeof mesText.querySelector === 'function'
        ? mesText.querySelector(LEGACY_IMAGE_PLACEHOLDER_SELECTOR)
        : null;
    if (legacy) {
        return {
            ok: true,
            reason: 'placeholder-present-legacy',
            count: placeholders.length,
        };
    }
    const signature = placeholders.map(buildImagePlaceholderSignature).join('\n');
    const ownedSignature = owned.map((node) => String(
        node && typeof node.getAttribute === 'function'
            ? node.getAttribute('data-igs-placeholder-signature') || ''
            : '',
    )).join('\n');
    if (owned.length === placeholders.length && ownedSignature === signature) {
        return {
            ok: true,
            reason: 'placeholder-present',
            count: placeholders.length,
        };
    }
    owned.forEach(removeNodeSafely);
    for (const placeholder of placeholders) {
        mesText.appendChild(createMessageImagePlaceholderNode(mesText.ownerDocument, placeholder));
    }
    dispatchMessagePlaceholderMutation(mesText);
    return {
        ok: true,
        reason: 'placeholder-injected',
        count: placeholders.length,
    };
}

export function removeMessageImagePlaceholders(message) {
    const mesText = getMessageTextRoot(resolveMessageElementFromInput(message));
    if (!mesText) {
        return {
            ok: false,
            reason: 'message-text-root-not-found',
            count: 0,
        };
    }
    const owned = getOwnedImagePlaceholders(mesText);
    owned.forEach(removeNodeSafely);
    return {
        ok: true,
        reason: owned.length ? 'placeholder-removed' : 'placeholder-none',
        count: owned.length,
    };
}

function getLastMessageId(globalObject) {
    const helper = getTavernHelper(globalObject);
    if (helper && typeof helper.getLastMessageId === 'function') {
        try {
            return normalizeMessageId(helper.getLastMessageId());
        } catch (error) {
            return resolveContextLastMessageId(globalObject);
        }
    }
    return resolveContextLastMessageId(globalObject);
}

function resolveContextLastMessageId(globalObject) {
    const chat = getChatFromContext(globalObject);
    return Array.isArray(chat) && chat.length ? chat.length - 1 : null;
}

function resolveMessageElementFromInput(message) {
    if (!message || typeof message !== 'object') return null;
    if (isDomLikeMessageElement(message.element)) return message.element;
    return isDomLikeMessageElement(message) ? message : null;
}

function normalizeImagePlaceholderBlocks(imageSlots) {
    const output = [];
    for (const slot of Array.isArray(imageSlots) ? imageSlots : []) {
        const rawBlock = String(slot && slot.rawBlock || '').trim();
        const promptText = String(slot && slot.promptText || '').trim();
        const block = rawBlock || promptText;
        if (!block || output.some((item) => item.block === block)) continue;
        const slotIndex = normalizeMessageSlotIndex(slot && slot.slotIndex, output.length);
        output.push({
            block,
            slotIndex,
            imageId: String(slot && slot.imageId || `igs-slot-${slotIndex + 1}`).trim(),
            locationHash: String(slot && slot.locationHash || '').trim(),
            title: String(slot && slot.title || `图 ${slotIndex + 1}`).trim(),
        });
    }
    return output;
}

function getOwnedImagePlaceholders(mesText) {
    if (!mesText || typeof mesText.querySelectorAll !== 'function') return [];
    try {
        return Array.from(mesText.querySelectorAll(VN_IMAGE_PLACEHOLDER_SELECTOR));
    } catch (error) {
        return [];
    }
}

function createMessageImagePlaceholderNode(ownerDocument, placeholder) {
    const node = ownerDocument && typeof ownerDocument.createElement === 'function'
        ? ownerDocument.createElement('div')
        : buildFallbackPlaceholderNode();
    if (typeof node.setAttribute === 'function') {
        node.setAttribute('data-igs-placeholder', '1');
        node.setAttribute('data-igs-image-placeholder', '1');
        node.setAttribute('data-igs-image-slot', String(placeholder.slotIndex));
        node.setAttribute('data-slot-index', String(placeholder.slotIndex));
        node.setAttribute('data-image-index', String(placeholder.slotIndex));
        node.setAttribute('data-image-id', placeholder.imageId);
        node.setAttribute('data-igs-image-id', placeholder.imageId);
        if (placeholder.locationHash) {
            node.setAttribute('data-location-hash', placeholder.locationHash);
            node.setAttribute('data-igs-location-hash', placeholder.locationHash);
        }
        node.setAttribute('data-igs-placeholder-signature', buildImagePlaceholderSignature(placeholder));
    }
    node.className = 'igs-img-ph igs-image-placeholder';
    node.style = node.style || {};
    node.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;font-size:0';
    node.textContent = String(placeholder.block || '');
    return node;
}

function buildImagePlaceholderSignature(placeholder) {
    return [
        placeholder && placeholder.slotIndex,
        placeholder && placeholder.locationHash,
        placeholder && placeholder.imageId,
        placeholder && placeholder.block,
    ].map((part) => String(part || '')).join('|');
}

function buildFallbackPlaceholderNode() {
    return {
        className: '',
        style: {},
        textContent: '',
        attributes: new Map(),
        parentNode: null,
        parentElement: null,
        setAttribute(name, value) {
            this.attributes.set(name, String(value));
        },
        getAttribute(name) {
            return this.attributes.has(name) ? this.attributes.get(name) : null;
        },
        remove() {
            if (!this.parentNode || !Array.isArray(this.parentNode.children)) return;
            this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
            this.parentNode = null;
            this.parentElement = null;
        },
    };
}

function dispatchMessagePlaceholderMutation(mesText) {
    if (!mesText || typeof mesText.dispatchEvent !== 'function') return;
    const ownerWindow = mesText.ownerDocument && mesText.ownerDocument.defaultView || globalThis.window || globalThis;
    const EventCtor = ownerWindow && ownerWindow.Event || globalThis.Event;
    try {
        if (typeof EventCtor === 'function') {
            mesText.dispatchEvent(new EventCtor('DOMSubtreeModified', { bubbles: true }));
            return;
        }
    } catch (error) {
        // Fall back to plain-object dispatch for fake documents.
    }
    try {
        mesText.dispatchEvent({ type: 'DOMSubtreeModified', bubbles: true });
    } catch (error) {
        // Ignore dispatch failures from host shims.
    }
}

function removeNodeSafely(node) {
    if (!node) return;
    if (typeof node.remove === 'function') {
        node.remove();
        return;
    }
    if (node.parentNode && Array.isArray(node.parentNode.children)) {
        node.parentNode.children = node.parentNode.children.filter((child) => child !== node);
    }
}

function getChatMessages(globalObject, startId, endId, extraOptions = {}) {
    const helper = getTavernHelper(globalObject);
    const safeStart = normalizeMessageId(startId) ?? 0;
    const safeEnd = normalizeMessageId(endId) ?? safeStart;
    if (helper && typeof helper.getChatMessages === 'function') {
        try {
            const range = `${Math.min(safeStart, safeEnd)}-${Math.max(safeStart, safeEnd)}`;
            const messages = helper.getChatMessages(range, {
                include_swipes: false,
                ...extraOptions,
            });
            return Array.isArray(messages) ? messages : [];
        } catch (error) {
            return [];
        }
    }
    const chat = getChatFromContext(globalObject);
    if (!Array.isArray(chat)) return [];
    return chat.slice(Math.min(safeStart, safeEnd), Math.max(safeStart, safeEnd) + 1);
}

function getChatMessageEntries(globalObject, extraOptions = {}) {
    const output = [];
    const seen = new Set();
    const lastId = getLastMessageId(globalObject);
    const helperMessages = lastId != null ? getChatMessages(globalObject, 0, lastId, extraOptions) : [];

    helperMessages.forEach((message, index) => {
        const id = resolveMessageId(message, index);
        if (id == null || seen.has(id)) return;
        seen.add(id);
        output.push({ id, message, index });
    });
    if (output.length) return output;

    const chat = getChatFromContext(globalObject);
    if (!Array.isArray(chat)) return output;
    chat.forEach((message, index) => {
        const id = resolveMessageId(message, index);
        if (id == null || seen.has(id)) return;
        seen.add(id);
        output.push({ id, message, index });
    });
    return output;
}

function normalizeMessage(message, fallbackId, domMessageMap = new Map(), hiddenIds = null) {
    if (typeof message === 'string') {
        return { id: fallbackId, text: message, rawHtml: message, raw: message };
    }
    if (!message || typeof message !== 'object') return null;
    const id = resolveMessageId(message, fallbackId);
    if (id == null) return null;
    const element = resolveMessageElement(message, id, domMessageMap);
    const rawText = getMessagePrimaryText(message);
    const visibleText = normalizeText(
        message.visibleText
        || message.displayText
        || message.plainText
        || getVisibleMessageTextFromElement(element),
    );
    return {
        id,
        text: rawText,
        rawHtml: rawText,
        visibleText,
        looksLikeHostUiHtml: looksLikeHostUiHtml(rawText),
        element,
        isUser: isUserMessage(message, element),
        isSystem: isSystemMessage(message, element),
        isHidden: isHiddenMessage(message, id, element, hiddenIds),
        raw: message,
    };
}

function getNormalizedMessages(globalObject, hiddenMessageCache) {
    const domMessageMap = createDomMessageMap(globalObject);
    const hiddenIds = getHiddenMessageIdSet(globalObject, hiddenMessageCache);
    return getChatMessageEntries(globalObject)
        .map((entry) => normalizeMessage(entry.message, entry.id, domMessageMap, hiddenIds))
        .filter(Boolean)
        .sort((left, right) => (left.id ?? 0) - (right.id ?? 0));
}

function createDomMessageMap(globalObject) {
    const map = new Map();
    for (const doc of getCandidateDocuments(globalObject)) {
        const nodes = safeQueryAll(doc, '#chat .mes, .mes');
        for (const node of nodes) {
            const id = getElementMessageId(node);
            if (id == null || map.has(id)) continue;
            map.set(id, node);
        }
    }
    return map;
}

function getContextFromTarget(target) {
    try {
        if (target && target.SillyTavern && typeof target.SillyTavern.getContext === 'function') {
            return target.SillyTavern.getContext();
        }
    } catch (error) {
        return null;
    }
    return null;
}

function readHiddenMessageIdsFromTavernHelper(globalObject) {
    const helper = getTavernHelper(globalObject);
    if (!helper || typeof helper.getChatMessages !== 'function') return null;
    const lastId = getLastMessageId(globalObject);
    if (lastId == null) return null;
    try {
        const messages = helper.getChatMessages(`0-${lastId}`, { hide_state: 'hidden', include_swipes: false });
        if (!Array.isArray(messages)) return null;
        const ids = new Set();
        messages.forEach((entry) => {
            const id = resolveMessageId(entry);
            if (id != null) ids.add(id);
        });
        return ids;
    } catch (error) {
        return null;
    }
}

function getHiddenMessageIdSet(globalObject, hiddenMessageCache) {
    const now = Date.now();
    if (hiddenMessageCache.ids && now - hiddenMessageCache.at < HIDDEN_CACHE_WINDOW_MS) {
        return hiddenMessageCache.ids;
    }
    const ids = readHiddenMessageIdsFromTavernHelper(globalObject);
    hiddenMessageCache.at = now;
    hiddenMessageCache.ids = ids;
    return ids;
}

function pickCurrentMessage(messages) {
    const readable = messages.filter(isTurnCandidate);
    return readable[readable.length - 1] || null;
}

function isTurnCandidate(message) {
    return Boolean(
        message
        && !message.isSystem
        && !message.isHidden
        && !message.isUser,
    );
}

function findMessageRegenerateButton(message, imageIndex, imageState = null) {
    const candidates = collectDomRegenerateButtonCandidates(getMessageScopedRoots(message));
    const targetIndex = Math.max(0, Math.floor(Number(imageIndex) || 0));
    const currentSlot = imageState
        && Array.isArray(imageState.slots)
        && imageState.slots[targetIndex]
        ? imageState.slots[targetIndex]
        : null;
    if (currentSlot && currentSlot.locationHash) {
        const candidate = candidates.find((item) => item.locationHash && item.locationHash === currentSlot.locationHash);
        if (candidate) return candidate.button;
    }
    if (currentSlot && currentSlot.imageId) {
        const candidate = candidates.find((item) => item.imageId && item.imageId === currentSlot.imageId);
        if (candidate) return candidate.button;
    }
    if (currentSlot && currentSlot.buttonIndex != null) {
        const candidate = candidates.find((item) => item.buttonIndex === currentSlot.buttonIndex);
        if (candidate) return candidate.button;
    }
    const fallback = candidates[targetIndex] || candidates[0] || null;
    return fallback ? fallback.button : null;
}

function getMessageScopedDocs(messageElement) {
    const docs = [];
    const seen = new Set();
    for (const frame of safeQueryAll(messageElement, 'iframe')) {
        const doc = getFrameDocument(frame);
        if (doc && !seen.has(doc)) {
            seen.add(doc);
            docs.push(doc);
        }
    }
    return docs;
}

function getFrameDocument(frame) {
    if (!frame || isInternalReaderFrame(frame)) return null;
    try {
        return frame.contentDocument || frame.contentWindow && frame.contentWindow.document || null;
    } catch (error) {
        return null;
    }
}

function isInternalReaderFrame(frame) {
    return Boolean(frame && typeof frame.getAttribute === 'function' && frame.getAttribute(INTERNAL_READER_ATTR) === '1');
}

function documentBelongsToMessage(doc, messageElement) {
    if (!doc || !messageElement) return false;
    if (getMessageScopedDocs(messageElement).includes(doc)) return true;
    try {
        const frame = doc.defaultView && doc.defaultView.frameElement;
        const owner = frame && !isInternalReaderFrame(frame) && typeof frame.closest === 'function'
            ? frame.closest('.mes[mesid]')
            : null;
        return Boolean(owner && sameMessageByMesId(owner, messageElement));
    } catch (error) {
        return false;
    }
}

function sameMessageByMesId(left, right) {
    if (!left || !right) return left === right;
    if (left === right) return true;
    const leftId = getElementMessageId(left);
    const rightId = getElementMessageId(right);
    return leftId != null && rightId != null && leftId === rightId;
}

function getMessageTextRoot(element) {
    try {
        return element && typeof element.querySelector === 'function'
            ? element.querySelector('.mes_text')
            : null;
    } catch (error) {
        return null;
    }
}

function getElementMessageId(element) {
    if (!element || typeof element.getAttribute !== 'function') return null;
    return normalizeMessageId(
        element.getAttribute('mesid')
        ?? element.getAttribute('data-mesid')
        ?? element.getAttribute('data-message-id')
        ?? element.getAttribute('data-id')
        ?? element.id,
    );
}

function resolveMessageElement(message, id, domMessageMap) {
    const direct = getMessageDomElement(message);
    if (direct) return direct;
    return id != null ? domMessageMap.get(id) || null : null;
}

function getMessageDomElement(message) {
    if (!message || typeof message !== 'object') return null;
    if (isDomLikeMessageElement(message.element)) return message.element;
    return isDomLikeMessageElement(message) ? message : null;
}

function isDomLikeMessageElement(value) {
    return Boolean(value && typeof value === 'object' && typeof value.getAttribute === 'function');
}

function resolveMessageId(message, fallbackId) {
    return normalizeMessageId(message && (message.id ?? message.message_id ?? message.mesid ?? fallbackId));
}

function normalizeMessageId(value) {
    const id = Number(value);
    if (!Number.isFinite(id) || id < 0) return null;
    return id;
}

function normalizeMessageSlotIndex(value, fallback) {
    const index = Number(value);
    if (!Number.isFinite(index) || index < 0) return Math.max(0, Math.floor(Number(fallback) || 0));
    return Math.floor(index);
}

function isUserMessage(message, element) {
    return Boolean(
        message && (
            isTruthyFlag(message.is_user)
            || isTruthyFlag(message.isUser)
            || isTruthyFlag(message.user)
            || message.role === 'user'
            || element && element.getAttribute('is_user') === 'true'
        ),
    );
}

function isSystemMessage(message, element) {
    return Boolean(
        message && (
            isTruthyFlag(message.is_system)
            || isTruthyFlag(message.isSystem)
            || isTruthyFlag(message.system)
            || element && element.getAttribute('is_system') === 'true'
        ),
    );
}

function isHiddenMessage(message, messageId, element, hiddenIds) {
    return Boolean(
        message && (
            isTruthyFlag(message.is_hidden)
            || isTruthyFlag(message.isHidden)
            || isTruthyFlag(message.hidden)
            || element && element.getAttribute('is_hidden') === 'true'
            || hiddenIds instanceof Set && hiddenIds.has(messageId)
        ),
    );
}

function isTruthyFlag(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
}

function safeDocument(target) {
    try {
        return target && target.document || null;
    } catch (error) {
        return null;
    }
}

function safeQueryAll(root, selector) {
    try {
        return root && typeof root.querySelectorAll === 'function'
            ? Array.from(root.querySelectorAll(selector))
            : [];
    } catch (error) {
        return [];
    }
}

function normalizeText(value) {
    return String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
