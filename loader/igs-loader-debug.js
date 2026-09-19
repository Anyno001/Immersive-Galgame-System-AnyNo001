(function () {
    'use strict';

    const REPOSITORY = 'Anyno001/Immersive-Galgame-System-AnyNo001';
    const DEFAULT_REF = 'main';
    const MAIN_BASE = `https://cdn.jsdelivr.net/gh/${REPOSITORY}@main`;
    const MAIN_BRANCH_URL = `https://api.github.com/repos/${REPOSITORY}/branches/main`;
    const INSTANCE_KEY = '__IGS_AUTO_UPDATE_LOADER_DEBUG__';
    const QR_BINDING_KEY = '__IGS_QR_ENTRY_BINDING__';
    const QR_BUTTON_NAME = 'Gal模拟';
    const CSS_ID = 'igs-auto-loader-css';
    const SCRIPT_ID = 'igs-auto-loader-js';
    const MAGIC_MENU_SELECTORS = ['#extensionsMenu', '#extensions_menu', '.extensions_block .list-group'];
    const LOADER_ENTRY_SELECTOR = '[data-igs-loader-entry="1"]';
    const TRACE_IDS = [CSS_ID, SCRIPT_ID, 'igs-root', 'igs-stage'];

    const root = resolveRootWindow();
    try { root.IGS_DEBUG = true; } catch (vnDebugError) { /* ignore */ }
    const doc = getRootDocument();

    if (!doc) {
        console.warn('[IGS Loader] 未找到可访问的文档，无法加载 Immersive Galgame System。');
        return;
    }

    const existingRuntime = reconcileExistingRuntime();
    ensureQrButtonBinding();
    if (existingRuntime.done) {
        return;
    }

    root[INSTANCE_KEY] = {
        repository: REPOSITORY,
        loadedAt: Date.now(),
    };
    scheduleLoaderMagicWandEntry();

    load().catch((error) => {
        console.error('[IGS Loader] 启动失败。', error);
        try {
            if (typeof root.alert === 'function') root.alert(`Immersive Galgame System 启动失败：${error && error.message || String(error)}`);
        } catch (alertError) {
            // Ignore blocked alert calls.
        }
    });

    function resolveRootWindow() {
        try {
            if (window.parent && window.parent.document) return window.parent;
        } catch (error) {
            // Cross-origin parent is not usable inside Tavern.
        }
        return window;
    }

    function getRootDocument() {
        try {
            return root.document || document;
        } catch (error) {
            return document;
        }
    }

    async function load() {
        const config = await resolveLoaderConfig();
        const attempts = buildLoadAttempts(config);
        let lastError = null;

        for (const attempt of attempts) {
            const cssUrl = withCacheBust(`${attempt.base}/app/dist/igs.bundle.css`, attempt);
            const scriptUrl = withCacheBust(`${attempt.base}/app/dist/igs.bundle.js`, attempt);
            if (shouldProbeBundleAttempt(attempt, config)) {
                const probe = await probeBundleUrl(scriptUrl);
                if (!probe.ok) {
                    lastError = probe.error || new Error(`remote bundle not available: ${scriptUrl}`);
                    console.warn('[IGS Loader] 远程 bundle 探测失败，尝试下一个地址。', attempt.ref, scriptUrl, lastError);
                    continue;
                }
            }
            try {
                injectCss(cssUrl);
                await injectScript(scriptUrl);
                scheduleMagicWandEnsure();
                schedulePendingQrOpen();
                console.info('[IGS Loader] 使用远程版本。', attempt.ref, attempt.base);
                return { ...config, activeRef: attempt.ref, activeBase: attempt.base };
            } catch (error) {
                lastError = error;
                clearTraceElements();
                console.warn('[IGS Loader] 远程 bundle 加载失败，尝试下一个地址。', attempt.ref, scriptUrl, error);
            }
        }

        throw lastError || new Error('没有可用的 Immersive Galgame System 远程 bundle。');
    }

    async function resolveLoaderConfig() {
        const userConfig = getObject(root.IGS_LOADER_CONFIG);
        const explicitRef = String(userConfig.ref || root.IGS_LOADER_REF || '').trim();
        const latestRef = !explicitRef && !userConfig.base && !root.IGS_LOADER_BASE
            ? await fetchLatestRef()
            : null;
        const ref = explicitRef || latestRef || DEFAULT_REF;
        const defaultBase = `https://cdn.jsdelivr.net/gh/${REPOSITORY}@${ref}`;
        const hasCustomBase = Boolean(userConfig.base || root.IGS_LOADER_BASE);
        const base = String(userConfig.base || root.IGS_LOADER_BASE || defaultBase).replace(/\/+$/, '');
        const cacheBust = userConfig.cacheBust === undefined ? ref === 'main' || Boolean(explicitRef && !/^v\d+\.\d+\.\d+$/.test(ref)) : userConfig.cacheBust !== false;
        return { ref, base, cacheBust, hasCustomBase, latestRef };
    }

    function buildLoadAttempts(config) {
        const attempts = [
            {
                ref: config.ref,
                base: config.base,
                cacheBust: config.cacheBust,
            },
        ];
        if (!config.hasCustomBase && config.latestRef && config.latestRef !== config.ref) {
            attempts.push({
                ref: config.latestRef,
                base: `https://cdn.jsdelivr.net/gh/${REPOSITORY}@${config.latestRef}`,
                cacheBust: false,
                fallbackOf: config.ref,
            });
        }
        if (!config.hasCustomBase && config.ref !== 'main') {
            attempts.push({
                ref: 'main',
                base: MAIN_BASE,
                cacheBust: true,
                fallbackOf: config.ref,
            });
        }
        return dedupeAttempts(attempts);
    }

    function shouldProbeBundleAttempt(attempt, config) {
        if (config.hasCustomBase) return true;
        return attempt.ref !== 'main';
    }

    async function fetchLatestRef() {
        const fetchFn = getFetch();
        if (!fetchFn) return '';
        const branchUrl = withTimestamp(MAIN_BRANCH_URL);
        try {
            const response = await fetchFn(branchUrl, { cache: 'no-store' });
            if (!response || !response.ok) {
                console.warn('[IGS Loader] 最新 main 提交读取失败，改用 @main。', response && response.status || 'unknown');
                return '';
            }
            const branch = await readResponseJson(response);
            const ref = normalizeCommitRef(branch && branch.commit && branch.commit.sha);
            if (ref) {
                console.info('[IGS Loader] 发现最新远程提交。', ref, branchUrl);
            }
            return ref;
        } catch (error) {
            console.warn('[IGS Loader] 最新 main 提交读取异常，改用 @main。', error);
            return '';
        }
    }

    async function readResponseJson(response) {
        if (response && typeof response.json === 'function') return response.json();
        if (response && typeof response.text === 'function') {
            const text = await response.text();
            return JSON.parse(text);
        }
        return null;
    }

    function normalizeCommitRef(value) {
        const sha = String(value || '').trim();
        return /^[a-f0-9]{40}$/i.test(sha) ? sha : '';
    }

    function dedupeAttempts(attempts) {
        const seen = new Set();
        return attempts.filter((attempt) => {
            const key = `${attempt.ref}|${attempt.base}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function getQrBindingState() {
        let state = root[QR_BINDING_KEY];
        if (!state || typeof state !== 'object') {
            state = { bound: false, pendingOpen: false, attempts: 0, provider: '', subscription: null, retryScheduled: false, warnedUnavailable: false };
            try {
                root[QR_BINDING_KEY] = state;
            } catch (error) {
                // Root window may reject writes; fall back to a local state object.
            }
        }
        if (typeof state.retryScheduled !== 'boolean') state.retryScheduled = false;
        if (typeof state.warnedUnavailable !== 'boolean') state.warnedUnavailable = false;
        state.flushPendingOpen = schedulePendingQrOpen;
        return state;
    }

    function resolveQrButtonApi() {
        const lexical = resolveLexicalQrButtonApi();
        if (lexical) return lexical;

        const candidates = [];
        try {
            if (root) candidates.push(root);
        } catch (error) { /* ignore */ }
        try {
            if (root && root.parent && root.parent !== root) candidates.push(root.parent);
        } catch (error) { /* ignore */ }
        try {
            if (root && root.top && root.top !== root) candidates.push(root.top);
        } catch (error) { /* ignore */ }

        for (const candidate of candidates) {
            const direct = matchQrApi(candidate);
            if (direct) return direct;
            const stApi = safeReadProperty(candidate, 'SillyTavern');
            const nested = matchQrApi(stApi);
            if (nested) return nested;
        }
        return null;
    }

    function resolveLexicalQrButtonApi() {
        try {
            if (typeof eventOn === 'function' && typeof getButtonEvent === 'function') {
                return { eventOn, getButtonEvent };
            }
        } catch (error) { /* lexical host APIs are optional */ }
        return null;
    }

    function matchQrApi(target) {
        if (!target) return null;
        const eventOn = safeReadProperty(target, 'eventOn');
        const getButtonEvent = safeReadProperty(target, 'getButtonEvent');
        if (typeof eventOn !== 'function' || typeof getButtonEvent !== 'function') return null;
        return { eventOn, getButtonEvent };
    }

    function safeReadProperty(target, key) {
        try {
            return target ? target[key] : undefined;
        } catch (error) {
            return undefined;
        }
    }

    function ensureQrButtonBinding(options = {}) {
        const state = getQrBindingState();
        if (state.bound) return { ok: true, reason: 'already-bound', provider: state.provider };

        const api = resolveQrButtonApi();
        if (!api) {
            if (options.scheduleRetry !== false) scheduleQrBindingRetry();
            return { ok: false, reason: 'qr-api-not-found' };
        }

        try {
            const subscription = api.eventOn(api.getButtonEvent(QR_BUTTON_NAME), handleQrButtonClick);
            state.bound = true;
            state.provider = QR_BUTTON_NAME;
            state.subscription = subscription || null;
            console.info('[IGS Loader] 已注册 QR 按钮事件。', QR_BUTTON_NAME);
            schedulePendingQrOpen();
            return { ok: true, reason: 'bound' };
        } catch (error) {
            console.warn('[IGS Loader] QR 按钮事件注册失败，继续加载主程序。', error);
            return { ok: false, reason: 'qr-register-failed' };
        }
    }

    function scheduleQrBindingRetry() {
        const state = getQrBindingState();
        const maxAttempts = 20;
        if (state.bound || state.retryScheduled) return;
        if (state.attempts >= maxAttempts) {
            if (!state.warnedUnavailable) {
                state.warnedUnavailable = true;
                console.warn('[IGS Loader] 未能获取酒馆助手 QR 按钮 API，QR 入口不可用。');
            }
            return;
        }
        state.retryScheduled = true;
        let callbackWasAsync = false;
        setHostTimeout(() => {
            state.retryScheduled = false;
            state.attempts += 1;
            const result = ensureQrButtonBinding({ scheduleRetry: false });
            if (!result.ok && result.reason === 'qr-api-not-found' && callbackWasAsync) {
                scheduleQrBindingRetry();
            }
        }, 500);
        callbackWasAsync = true;
    }

    function handleQrButtonClick() {
        const api = root.IGS || root.ImmersiveGalgameSystem;
        if (api && typeof api.openLatestAvailable === 'function') {
            return safeOpenLatestAvailable(api);
        }
        const state = getQrBindingState();
        state.pendingOpen = true;
        console.info('[IGS Loader] 主程序尚未就绪，已记录 QR 待打开请求。');
        schedulePendingQrOpen();
        return { ok: false, reason: 'runtime-not-ready' };
    }

    function safeOpenLatestAvailable(api) {
        try {
            const result = api.openLatestAvailable();
            Promise.resolve(result).catch((error) => {
                console.warn('[IGS Loader] QR 入口打开阅读器失败。', error);
            });
            return result;
        } catch (error) {
            console.warn('[IGS Loader] QR 入口打开阅读器异常。', error);
            return { ok: false, reason: 'qr-open-failed' };
        }
    }

    function schedulePendingQrOpen() {
        const state = getQrBindingState();
        if (!state.pendingOpen) return { ok: true, reason: 'no-pending-open' };
        const api = root.IGS || root.ImmersiveGalgameSystem;
        if (!api || typeof api.openLatestAvailable !== 'function') {
            return { ok: false, reason: 'runtime-not-ready' };
        }
        state.pendingOpen = false;
        safeOpenLatestAvailable(api);
        return { ok: true, reason: 'pending-open-flushed' };
    }

    function scheduleLoaderMagicWandEntry() {
        let attempts = 0;
        const maxAttempts = 24;
        const tick = () => {
            attempts += 1;
            const result = ensureLoaderMagicWandEntry();
            if (!result.ok && attempts < maxAttempts) {
                setHostTimeout(tick, 250);
            }
        };
        setHostTimeout(tick, 0);
    }

    function ensureLoaderMagicWandEntry() {
        const api = root.IGS || root.ImmersiveGalgameSystem;
        if (api && typeof api.ensureMagicWandEntry === 'function') {
            return { ok: true, reason: 'runtime-ready' };
        }
        const menus = findMagicWandMenus();
        if (!menus.length) return { ok: false, reason: 'menu-not-found' };
        for (const found of menus) {
            if (found.menu.querySelector(LOADER_ENTRY_SELECTOR)) continue;
            found.menu.appendChild(createLoaderMagicEntry(found.doc));
        }
        return { ok: true, entries: menus.length };
    }

    function findMagicWandMenus() {
        const found = [];
        for (const candidateDoc of getCandidateDocuments()) {
            for (const selector of MAGIC_MENU_SELECTORS) {
                safeQueryAll(candidateDoc, selector).forEach((menu) => {
                    if (menu && !found.some((item) => item.menu === menu)) {
                        found.push({ doc: candidateDoc, menu });
                    }
                });
            }
        }
        return found;
    }

    function createLoaderMagicEntry(candidateDoc) {
        const button = candidateDoc.createElement('a');
        button.className = 'list-group-item igs-magic-entry is-loading';
        button.href = 'javascript:void(0)';
        button.setAttribute('data-igs-magic-entry', '1');
        button.setAttribute('data-igs-loader-entry', '1');
        button.setAttribute('data-igs-version', 'loader');
        button.setAttribute('title', '沉浸式Galgame系统 正在加载');
        button.setAttribute('aria-label', '沉浸式Galgame系统 正在加载');
        button.innerHTML = '<span class="fa-solid fa-book-open" aria-hidden="true"></span> 沉浸式Galgame系统';
        button.addEventListener('click', (event) => {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            const api = root.IGS || root.ImmersiveGalgameSystem;
            if (api && typeof api.openLatestAvailable === 'function') {
                api.openLatestAvailable();
                return;
            }
            notifyLoaderPending();
        });
        return button;
    }

    function getCandidateDocuments() {
        const docs = [];
        const addDoc = (candidateDoc) => {
            if (candidateDoc && !docs.includes(candidateDoc)) docs.push(candidateDoc);
        };
        addDoc(doc);
        try {
            addDoc(root.document);
        } catch (error) {
            // Cross-origin documents are ignored.
        }
        try {
            addDoc(root.top && root.top.document);
        } catch (error) {
            // Cross-origin top window is ignored.
        }
        if (typeof document !== 'undefined') addDoc(document);
        return docs;
    }

    function safeQueryAll(candidateDoc, selector) {
        try {
            return candidateDoc && typeof candidateDoc.querySelectorAll === 'function'
                ? Array.from(candidateDoc.querySelectorAll(selector))
                : [];
        } catch (error) {
            return [];
        }
    }

    function notifyLoaderPending() {
        const message = '沉浸式Galgame系统 仍在加载远程脚本，请稍等几秒后再点。';
        try {
            if (root.toastr && typeof root.toastr.info === 'function') {
                root.toastr.info(message, 'IGS');
                return;
            }
            if (typeof root.alert === 'function') {
                root.alert(message);
                return;
            }
        } catch (error) {
            // Fall through to console.
        }
        console.info('[IGS Loader]', message);
    }

    function getObject(value) {
        return value && typeof value === 'object' ? value : {};
    }

    function withCacheBust(url, config) {
        if (!config.cacheBust) return url;
        const mark = `igs_t=${Date.now()}`;
        return `${url}${url.includes('?') ? '&' : '?'}${mark}`;
    }

    async function probeBundleUrl(url) {
        const fetchFn = getFetch();
        if (!fetchFn) return { ok: true, skipped: true };
        try {
            const response = await fetchFn(url, { method: 'HEAD', cache: 'no-store' });
            return response && response.ok
                ? { ok: true }
                : { ok: false, error: new Error(`HTTP ${response && response.status || 'unknown'}`) };
        } catch (error) {
            return { ok: false, error };
        }
    }

    function getFetch() {
        return root.fetch
            ? root.fetch.bind(root)
            : (typeof fetch === 'function' ? fetch : null);
    }

    function withTimestamp(url) {
        const mark = `igs_t=${Date.now()}`;
        return `${url}${url.includes('?') ? '&' : '?'}${mark}`;
    }

    function injectCss(href) {
        let link = doc.querySelector(`#${CSS_ID}`);
        if (!link) {
            link = doc.createElement('link');
            link.id = CSS_ID;
            link.rel = 'stylesheet';
            doc.head.appendChild(link);
        }
        link.href = href;
    }

    function injectScript(src) {
        const existing = doc.querySelector(`#${SCRIPT_ID}`);
        if (existing && existing.src === src) return Promise.resolve(existing);
        if (existing && existing.remove) existing.remove();
        return new Promise((resolve, reject) => {
            const script = doc.createElement('script');
            script.id = SCRIPT_ID;
            script.type = 'module';
            script.src = src;
            script.onload = () => {
                console.info('[IGS Loader] Immersive Galgame System bundle 已加载。', src);
                resolve(script);
            };
            script.onerror = () => {
                reject(new Error(`remote script load failed: ${src}`));
            };
            doc.head.appendChild(script);
        });
    }

    function reconcileExistingRuntime() {
        const api = root.IGS || root.ImmersiveGalgameSystem;
        if (api && typeof api.ensureMagicWandEntry === 'function') {
            const result = safeEnsureMagicWandEntry(api);
            root[INSTANCE_KEY] = {
                repository: REPOSITORY,
                loadedAt: Date.now(),
                status: 'ready',
                reused: true,
                magicWandEntry: result,
            };
            console.info('[IGS Loader] Immersive Galgame System 已加载，已重扫魔法棒入口。', result);
            scheduleMagicWandEnsure();
            return { done: true, reason: 'reused-existing-runtime' };
        }

        if (api) {
            console.warn('[IGS Loader] 检测到旧版 IGS 残留，准备重新加载。');
            try {
                if (typeof api.destroy === 'function') api.destroy();
            } catch (error) {
                console.warn('[IGS Loader] 旧版 IGS 销毁失败，继续清理残留。', error);
            }
            clearGlobalApi(api);
        }

        const staleTrace = root[INSTANCE_KEY] || TRACE_IDS.find((id) => doc.querySelector(`#${id}`));
        if (staleTrace) {
            console.info('[IGS Loader] 清理旧 loader 残留后重新加载。', staleTrace);
            clearTraceElements();
            try {
                delete root[INSTANCE_KEY];
            } catch (error) {
                root[INSTANCE_KEY] = null;
            }
        }

        return { done: false };
    }

    function safeEnsureMagicWandEntry(api) {
        try {
            return api.ensureMagicWandEntry();
        } catch (error) {
            console.warn('[IGS Loader] 重扫魔法棒入口失败。', error);
            return { ok: false, reason: error && error.message || String(error) };
        }
    }

    function scheduleMagicWandEnsure() {
        let attempts = 0;
        const maxAttempts = 20;
        const tick = () => {
            attempts += 1;
            const api = root.IGS || root.ImmersiveGalgameSystem;
            if (api && typeof api.ensureMagicWandEntry === 'function') {
                const result = safeEnsureMagicWandEntry(api);
                if (result && result.ok) return;
            }
            if (attempts < maxAttempts) {
                setHostTimeout(tick, 500);
            }
        };
        setHostTimeout(tick, 0);
    }

    function clearGlobalApi(api) {
        try {
            if (root.IGS === api) delete root.IGS;
        } catch (error) {
            root.IGS = undefined;
        }
        try {
            if (root.ImmersiveGalgameSystem === api) delete root.ImmersiveGalgameSystem;
        } catch (error) {
            root.ImmersiveGalgameSystem = undefined;
        }
    }

    function clearTraceElements() {
        for (const id of TRACE_IDS) {
            const element = doc.querySelector(`#${id}`);
            if (element && element.remove) element.remove();
        }
    }

    function setHostTimeout(callback, ms) {
        const setter = root && typeof root.setTimeout === 'function'
            ? root.setTimeout.bind(root)
            : setTimeout;
        setter(callback, ms);
    }
})();
