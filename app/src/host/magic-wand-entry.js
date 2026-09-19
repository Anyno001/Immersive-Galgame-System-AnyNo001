const DEFAULT_MENU_SELECTORS = Object.freeze([
    '#extensionsMenu',
    '#extensions_menu',
    '.extensions_block .list-group',
]);

const ENTRY_SELECTOR = '[data-igs-magic-entry="1"]';

export function createMagicWandEntry(options = {}) {
    const globalObject = options.global || globalThis.window || globalThis;
    const label = options.label || '沉浸式Galgame系统';
    const version = String(options.version || '');
    const menuSelectors = options.menuSelectors || DEFAULT_MENU_SELECTORS;
    const retryIntervalMs = options.retryIntervalMs === false
        ? 0
        : normalizePositiveNumber(options.retryIntervalMs, 5000);
    const open = typeof options.open === 'function' ? options.open : null;
    const resolveMode = typeof options.resolveMode === 'function' ? options.resolveMode : () => 'pc';
    const notify = typeof options.notify === 'function' ? options.notify : defaultNotify;

    let observer = null;
    let retryTimer = null;
    let delegatedDocs = [];
    let attached = false;
    let lastEnsureResult = { ok: false, reason: 'not-attached', menus: 0, entries: 0 };

    return {
        attach,
        ensure,
        destroy,
        getState,
    };

    function attach() {
        if (attached) return ensure();
        attached = true;
        const result = ensure();
        attachObserver();
        attachDelegatedClicks();
        attachRetryTimer();
        return result;
    }

    function ensure() {
        const menus = findMagicWandMenus();
        if (!menus.length) {
            lastEnsureResult = { ok: false, reason: 'menu-not-found', menus: 0, entries: 0 };
            return lastEnsureResult;
        }

        const menuElements = menus.map((item) => item.menu);
        for (const candidateDoc of getCandidateDocuments()) {
            cleanupMagicEntries(candidateDoc, menuElements);
        }

        let entries = 0;
        for (const found of menus) {
            const existing = found.menu.querySelector(ENTRY_SELECTOR);
            if (existing) {
                existing.removeEventListener('click', handleMagicEntryClick);
                existing.addEventListener('click', handleMagicEntryClick);
                entries += 1;
                continue;
            }
            const usePrimaryId = !found.doc.getElementById('igs-magic-entry-btn');
            found.menu.appendChild(createMagicEntryButton(found.doc, usePrimaryId));
            entries += 1;
        }

        lastEnsureResult = { ok: true, menus: menus.length, entries };
        return lastEnsureResult;
    }

    function destroy() {
        attached = false;
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        if (retryTimer) {
            clearHostInterval(retryTimer);
            retryTimer = null;
        }
        for (const doc of delegatedDocs) {
            try {
                doc.removeEventListener('click', handleMagicEntryDelegatedClick, true);
            } catch (error) {
                // Ignore detached documents.
            }
        }
        delegatedDocs = [];
        for (const candidateDoc of getCandidateDocuments()) {
            cleanupMagicEntries(candidateDoc, []);
        }
        lastEnsureResult = { ok: true, reason: 'destroyed', menus: 0, entries: 0 };
        return lastEnsureResult;
    }

    function getState() {
        return {
            attached,
            selector: ENTRY_SELECTOR,
            label,
            version,
            lastEnsureResult: { ...lastEnsureResult },
        };
    }

    function findMagicWandMenus() {
        const found = [];
        for (const doc of getCandidateDocuments()) {
            for (const selector of menuSelectors) {
                safeQueryAll(doc, selector).forEach((menu) => {
                    if (menu && !found.some((item) => item.menu === menu)) {
                        found.push({ doc, menu });
                    }
                });
            }
        }
        return found;
    }

    function createMagicEntryButton(doc, usePrimaryId) {
        const button = doc.createElement('a');
        if (usePrimaryId) button.id = 'igs-magic-entry-btn';
        button.className = 'list-group-item igs-magic-entry';
        button.href = 'javascript:void(0)';
        button.setAttribute('data-igs-magic-entry', '1');
        button.setAttribute('data-igs-version', version);
        button.setAttribute('title', `打开${label}`);
        button.setAttribute('aria-label', `打开${label}`);
        button.innerHTML = `<span class="fa-solid fa-book-open" aria-hidden="true"></span> ${escapeHtml(label)}`;
        button.addEventListener('click', handleMagicEntryClick);
        return button;
    }

    function handleMagicEntryClick(event, forcedCurrentTarget) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        const mode = resolveSafeMode();
        if (!open) {
            notify('IGS 入口尚未绑定打开函数。', 'error');
            return { ok: false, reason: 'missing-open-handler' };
        }

        const result = open(mode);
        Promise.resolve(result).then((resolved) => {
            if (!resolved || resolved.ok === false) {
                notify(`IGS 阅读器打开失败：${resolveErrorMessage(resolved)}`, 'error');
            }
        }).catch((error) => {
            notify(`IGS 阅读器打开失败：${error && error.message || String(error)}`, 'error');
        });

        closeMagicWandMenu(forcedCurrentTarget || event && event.currentTarget);
        return result;
    }

    function handleMagicEntryDelegatedClick(event) {
        const target = event && event.target && event.target.closest
            ? event.target.closest(ENTRY_SELECTOR)
            : null;
        if (!target) return;
        handleMagicEntryClick(event, target);
    }

    function attachObserver() {
        if (observer) return;
        const MutationObserverCtor = resolveMutationObserver();
        if (!MutationObserverCtor) return;
        observer = new MutationObserverCtor(() => {
            ensure();
        });
        for (const doc of getCandidateDocuments()) {
            if (doc && doc.body) {
                observer.observe(doc.body, { childList: true, subtree: true });
            }
        }
    }

    function attachDelegatedClicks() {
        for (const doc of getCandidateDocuments()) {
            if (!doc || delegatedDocs.includes(doc)) continue;
            doc.addEventListener('click', handleMagicEntryDelegatedClick, true);
            delegatedDocs.push(doc);
        }
    }

    function attachRetryTimer() {
        if (retryTimer || !retryIntervalMs) return;
        retryTimer = setHostInterval(() => {
            ensure();
        }, retryIntervalMs);
    }

    function getCandidateDocuments() {
        const docs = [];
        const addDoc = (doc) => {
            if (doc && !docs.includes(doc)) docs.push(doc);
        };

        addDoc(options.document);
        addDoc(safeDocument(globalObject));
        try {
            addDoc(safeDocument(globalObject.top));
        } catch (error) {
            // Cross-origin top windows are ignored.
        }
        try {
            let cursor = globalObject;
            while (cursor && cursor.parent && cursor.parent !== cursor) {
                cursor = cursor.parent;
                addDoc(safeDocument(cursor));
            }
        } catch (error) {
            // Cross-origin parent windows are ignored.
        }
        if (typeof document !== 'undefined') addDoc(document);
        return docs;
    }

    function closeMagicWandMenu(currentTarget) {
        try {
            const menu = currentTarget && currentTarget.closest
                ? currentTarget.closest(menuSelectors.join(', '))
                : null;
            if (menu && menu.parentElement && typeof menu.parentElement.click === 'function') {
                menu.parentElement.click();
            }
        } catch (error) {
            // Menu close is best-effort only.
        }
    }

    function resolveSafeMode() {
        try {
            return resolveMode() || 'pc';
        } catch (error) {
            return 'pc';
        }
    }

    function resolveMutationObserver() {
        return options.MutationObserver
            || globalObject.MutationObserver
            || safeDocument(globalObject) && safeDocument(globalObject).defaultView && safeDocument(globalObject).defaultView.MutationObserver
            || globalThis.MutationObserver
            || null;
    }

    function setHostInterval(callback, ms) {
        const setter = globalObject && typeof globalObject.setInterval === 'function'
            ? globalObject.setInterval.bind(globalObject)
            : globalThis.setInterval;
        return setter(callback, ms);
    }

    function clearHostInterval(timer) {
        const clearer = globalObject && typeof globalObject.clearInterval === 'function'
            ? globalObject.clearInterval.bind(globalObject)
            : globalThis.clearInterval;
        clearer(timer);
    }

    function cleanupMagicEntries(candidateDoc, menuElements) {
        safeQueryAll(candidateDoc, ENTRY_SELECTOR).forEach((button) => {
            const shouldRemove = !menuElements.includes(button.parentNode)
                || !isMagicEntryListItem(button)
                || button.getAttribute('data-igs-version') !== version;
            if (shouldRemove) {
                button.removeEventListener('click', handleMagicEntryClick);
                button.remove();
            }
        });
    }
}

function safeDocument(target) {
    try {
        return target && target.document || null;
    } catch (error) {
        return null;
    }
}

function safeQueryAll(doc, selector) {
    try {
        return doc && typeof doc.querySelectorAll === 'function'
            ? Array.from(doc.querySelectorAll(selector))
            : [];
    } catch (error) {
        return [];
    }
}

function isMagicEntryListItem(element) {
    return Boolean(
        element
        && element.tagName === 'A'
        && element.classList
        && element.classList.contains('list-group-item'),
    );
}

function normalizePositiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function resolveErrorMessage(result) {
    if (!result) return 'no-result';
    return result.reason
        || result.error
        || result.message
        || result.diagnosis && result.diagnosis.error
        || 'unknown';
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[char]);
}

function defaultNotify(message, type = 'info') {
    const root = globalThis.window || globalThis;
    if (root.toastr && typeof root.toastr[type] === 'function') {
        root.toastr[type](message, 'IGS');
        return;
    }
    const logger = type === 'error' ? console.error : console.info;
    logger('[IGS]', message);
}
