(function () {
    'use strict';

    const REPOSITORY = 'Anyno001/Immersive-Galgame-System-AnyNo001';
    const PINNED_REF = '';
    const DEFAULT_REF = 'main';
    const MAIN_BRANCH_URL = `https://api.github.com/repos/${REPOSITORY}/branches/main`;
    const LATEST_REF_CACHE_KEY = 'igs:loader:latest-ref';
    const LATEST_REF_TTL_MS = 60 * 60 * 1000;
    const INSTANCE_KEY = '__IGS_AUTO_UPDATE_LOADER_DEBUG__';
    const QR_BINDING_KEY = '__IGS_QR_ENTRY_BINDING__';
    const QR_BUTTON_NAME = 'Gal模拟';
    const CSS_ID = 'igs-auto-loader-css';
    const SCRIPT_ID = 'igs-auto-loader-js';
    const MAGIC_MENU_SELECTORS = ['#extensionsMenu', '#extensions_menu', '.extensions_block .list-group'];
    const LOADER_ENTRY_SELECTOR = '[data-igs-loader-entry="1"]';
    const TRACE_IDS = [CSS_ID, SCRIPT_ID, 'igs-root', 'igs-stage'];
    const PLUGIN_VIEWPORT_KEY = '__IGS_PLUGIN_VIEWPORT__';

    const loaderWindow = window;
    const root = resolveRootWindow();
    try { root.IGS_DEBUG = true; } catch (vnDebugError) { /* ignore */ }
    const doc = getRootDocument();
    exposePluginViewport();

    if (!doc) {
        console.warn('[IGS Loader] 未找到可访问的文档，无法加载 Immersive Galgame System。');
        return;
    }

    ensureQrButtonBinding();
    Promise.resolve(resolveLoaderConfig()).then(async config => {
        const existingRuntime = await reconcileExistingRuntime(config);
        if (existingRuntime.done) return;
        root[INSTANCE_KEY] = { repository: REPOSITORY, loadedAt: Date.now(), requestedRef: config.ref };
        scheduleLoaderMagicWandEntry();
        return load(config);
    }).catch((error) => {
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

    function readPluginViewportHeight() {
        try {
            const frame = loaderWindow.frameElement;
            if (frame) {
                const clientHeight = Number(frame.clientHeight);
                if (clientHeight > 0) return clientHeight;
                if (typeof frame.getBoundingClientRect === 'function') {
                    const rectHeight = Number(frame.getBoundingClientRect().height);
                    if (rectHeight > 0) return rectHeight;
                }
            }
        } catch (error) {
            // Fall back to the iframe window viewport.
        }
        const innerHeight = Number(loaderWindow.innerHeight);
        return innerHeight > 0 ? innerHeight : 0;
    }

    function exposePluginViewport() {
        const initialHeight = readPluginViewportHeight();
        try {
            root[PLUGIN_VIEWPORT_KEY] = {
                source: 'loader-iframe',
                initialHeight,
                getHeight() {
                    return readPluginViewportHeight() || initialHeight;
                },
            };
        } catch (error) {
            // The application will fall back to its owner window when unavailable.
        }
    }

    function getRootDocument() {
        try {
            return root.document || document;
        } catch (error) {
            return document;
        }
    }

    async function load(config) {
        if (config.embeddedRuntime) return loadEmbeddedRuntime(config);
        const attempts = buildLoadAttempts(config);
        const bundleFiles = root.IGS_DEBUG === true ? ['igs.bundle.debug.js', 'igs.bundle.js'] : ['igs.bundle.js'];
        let lastError = null;

        for (const attempt of attempts) {
            const cssBase = attempt.fetched ? `https://cdn.jsdelivr.net/gh/${REPOSITORY}@${attempt.ref}` : attempt.base;
            const cssUrl = withCacheBust(`${cssBase}/app/dist/igs.bundle.css`, attempt);
            for (const bundleFile of bundleFiles) {
                const scriptUrl = withCacheBust(`${attempt.base}/app/dist/${bundleFile}`, attempt);
                if (shouldProbeBundleAttempt(attempt, config)) {
                    const probe = await probeBundleUrl(scriptUrl);
                    if (!probe.ok) {
                        lastError = probe.error || new Error(`remote bundle not available: ${scriptUrl}`);
                        console.warn('[IGS Loader] 当前地址不可用，尝试同版本备用地址。', attempt.ref, scriptUrl, lastError);
                        continue;
                    }
                }
                try {
                    injectCss(cssUrl);
                    if (attempt.fetched) await injectFetchedScript(scriptUrl, config.version);
                    else await injectScript(scriptUrl, config.version);
                    if (attempt.ref === config.latestRef && !config.latestFromCache) rememberLatestRef(attempt.ref);
                    root[INSTANCE_KEY] = {
                        repository: REPOSITORY, loadedAt: Date.now(), status: 'ready', reused: false,
                        activeRef: attempt.ref, activeBase: attempt.base, version: (root.IGS || root.ImmersiveGalgameSystem).version,
                    };
                    scheduleMagicWandEnsure();
                    schedulePendingQrOpen();
                    console.info('[IGS Loader] 使用远程版本。', attempt.ref, attempt.base);
                    return { ...config, activeRef: attempt.ref, activeBase: attempt.base };
                } catch (error) {
                    lastError = error;
                    await releaseRuntime(root.IGS || root.ImmersiveGalgameSystem);
                    clearTraceElements();
                    console.warn('[IGS Loader] 当前地址加载失败，尝试同版本备用地址。', attempt.ref, scriptUrl, error);
                }
            }
            if (attempt.ref === config.latestRef) forgetLatestRef(attempt.ref);
        }

        const failure = lastError || new Error('没有可用的 Immersive Galgame System 远程 bundle。');
        throw config.locked ? new Error(`固定版本 ${config.ref} 加载失败：${failure.message}`) : failure;
    }

    async function loadEmbeddedRuntime(config) {
        const payload = config.embeddedRuntime;
        const Url = root.URL || globalThis.URL;
        const BlobType = root.Blob || globalThis.Blob;
        let blobUrl;
        try {
            const previousCss = doc.querySelector('#' + CSS_ID);
            previousCss?.remove?.();
            const style = doc.createElement('style');
            style.id = CSS_ID;
            style.textContent = payload.style;
            doc.head.appendChild(style);
            blobUrl = Url.createObjectURL(new BlobType([payload.script], { type: 'text/javascript' }));
            await injectScript(blobUrl, config.version);
            root[INSTANCE_KEY] = {
                repository: REPOSITORY, loadedAt: Date.now(), status: 'ready', reused: false,
                activeRef: config.ref, activeBase: config.base, embedded: true,
                version: (root.IGS || root.ImmersiveGalgameSystem).version,
            };
            scheduleMagicWandEnsure();
            schedulePendingQrOpen();
            console.info('[IGS Loader] Live2D 内嵌前端已启动；不需要本地服务。', config.version);
            return config;
        } catch (error) {
            await releaseRuntime(root.IGS || root.ImmersiveGalgameSystem);
            clearTraceElements();
            throw new Error('Live2D 内嵌前端启动失败：' + (error?.message || String(error))
                + '。无需启动 18086 服务；请检查脚本是否完整导入，或浏览器是否阻止了 blob 模块。');
        } finally {
            if (blobUrl) Url.revokeObjectURL(blobUrl);
        }
    }

    async function resolveLoaderConfig() {
        const userConfig = getObject(root.IGS_LOADER_CONFIG);
        // 内嵌发行版只复用启动/关闭/快捷入口，不从远端下载任何前端代码。
        // 固定版忽略页面遗留配置，不能被内嵌配置覆盖。
        const embeddedRuntime = !PINNED_REF && userConfig.embeddedRuntime || null;
        if (embeddedRuntime) {
            const headerVersion = /^\/\/ Generated by app\/scripts\/build\.js\.[^\n]*\n\/\/ IGS version: (\d+\.\d+\.\d+)\r?\n/.exec(String(embeddedRuntime.script || ''))?.[1];
            if (!headerVersion || headerVersion !== embeddedRuntime.version || typeof embeddedRuntime.style !== 'string') {
                throw new Error('内嵌前端内容损坏或版本不一致，请重新导入完整的 Live2D 导入即用 JSON。');
            }
            return { ref: String(userConfig.ref || 'embedded-live2d'), base: String(userConfig.base || ''),
                version: headerVersion, locked: true, cacheBust: false, hasCustomBase: true,
                latestRef: null, latestFromCache: false, embeddedRuntime };
        }
        const explicitRef = String(PINNED_REF || userConfig.ref || root.IGS_LOADER_REF || '').trim();
        const latest = !explicitRef && !userConfig.base && !root.IGS_LOADER_BASE
            ? await resolveLatestRef()
            : { ref: '', fromCache: false };
        const latestRef = latest.ref || null;
        const ref = explicitRef || latestRef || DEFAULT_REF;
        const version = /^(?:test-v|v)?(\d+\.\d+\.\d+)(?:-test)?$/.exec(ref)?.[1] || '';
        const locked = Boolean(PINNED_REF || version);
        const defaultBase = `https://cdn.jsdelivr.net/gh/${REPOSITORY}@${ref}`;
        const hasCustomBase = !PINNED_REF && Boolean(userConfig.base || root.IGS_LOADER_BASE);
        const base = String(PINNED_REF ? defaultBase : userConfig.base || root.IGS_LOADER_BASE || defaultBase).replace(/\/+$/, '');
        const cacheBust = userConfig.cacheBust === undefined ? ref === 'main' || Boolean(explicitRef && !version) : userConfig.cacheBust !== false;
        return { ref, base, version, locked, cacheBust, hasCustomBase, latestRef, latestFromCache: latest.fromCache };
    }

    function buildLoadAttempts(config) {
        const attempts = [
            {
                ref: config.ref,
                base: config.base,
                cacheBust: config.cacheBust,
            },
        ];
        if (!config.hasCustomBase) {
            attempts.push({
                ref: config.ref,
                base: `https://raw.githubusercontent.com/${REPOSITORY}/${config.ref}`,
                cacheBust: config.cacheBust,
                fetched: true,
                fallbackOf: config.ref,
            });
        }
        return dedupeAttempts(attempts);
    }

    // 自动发现的提交 SHA 不探测：加载失败时 onerror 会落到下一个地址，省一次 HEAD。
    function shouldProbeBundleAttempt(attempt, config) {
        if (attempt.fetched) return false;
        if (config.hasCustomBase) return true;
        return attempt.ref !== 'main' && attempt.ref !== config.latestRef;
    }

    // 最新提交 SHA 在 localStorage 缓存 1 小时，避免每次启动都打 GitHub API（未认证每 IP 每小时 60 次）；
    // 调试版 loader 不用缓存，push 后立即可验。查询失败时沿用旧 SHA。
    async function resolveLatestRef() {
        const cached = readCachedLatestRef();
        if (cached && root.IGS_DEBUG !== true && Date.now() - cached.at < LATEST_REF_TTL_MS) {
            return { ref: cached.ref, fromCache: true };
        }
        const ref = await fetchLatestRef();
        if (ref) return { ref, fromCache: false };
        if (cached) {
            console.info('[IGS Loader] 沿用缓存的远程提交。', cached.ref);
            return { ref: cached.ref, fromCache: true };
        }
        return { ref: '', fromCache: false };
    }

    function readCachedLatestRef() {
        try {
            const parsed = JSON.parse(root.localStorage.getItem(LATEST_REF_CACHE_KEY) || 'null');
            const ref = normalizeCommitRef(parsed && parsed.ref);
            const at = Number(parsed && parsed.at);
            return ref && Number.isFinite(at) ? { ref, at } : null;
        } catch (error) {
            return null;
        }
    }

    function rememberLatestRef(ref) {
        try {
            root.localStorage.setItem(LATEST_REF_CACHE_KEY, JSON.stringify({ ref, at: Date.now() }));
        } catch (error) {
            // Storage may be unavailable or full; the next launch simply queries again.
        }
    }

    function forgetLatestRef(ref) {
        try {
            if (readCachedLatestRef()?.ref === ref) root.localStorage.removeItem(LATEST_REF_CACHE_KEY);
        } catch (error) {
            // Storage may be unavailable.
        }
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

    // 取整到小时：一小时内重复启动命中浏览器缓存，不再每次重下整个 bundle。
    function withCacheBust(url, config) {
        if (!config.cacheBust) return url;
        const mark = `igs_t=${Math.floor(Date.now() / LATEST_REF_TTL_MS)}`;
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

    async function injectFetchedScript(src, expectedVersion = '') {
        const fetchFn = getFetch();
        if (!fetchFn) throw new Error('当前环境无法下载备用程序。');
        const Controller = root.AbortController || globalThis.AbortController;
        let source;
        for (let attempt = 0; attempt < 2; attempt++) {
            const controller = new Controller();
            const timer = setHostTimeout(() => controller.abort(), 20000);
            let terminal = false;
            try {
                const response = await fetchFn(src, { cache: 'no-store', signal: controller.signal });
                terminal = response && response.status === 404;
                if (!response || !response.ok) throw new Error(`备用程序下载失败：HTTP ${response && response.status || 'unknown'}`);
                source = await response.text();
                break;
            } catch (error) {
                if (terminal || attempt === 1) throw error;
            } finally {
                clearHostTimeout(timer);
            }
        }
        const version = /^\/\/ Generated by app\/scripts\/build\.js\.[^\n]*\n\/\/ IGS version: (\d+\.\d+\.\d+)\r?\n/.exec(source)?.[1];
        if (!version || (expectedVersion && version !== expectedVersion)) {
            throw new Error(`备用地址未返回所需 IGS 程序（要求 ${expectedVersion || '有效程序'}，实际 ${version || '错误正文'}）。`);
        }
        // raw 的 MIME 不能直接作为模块；保留原始资源基址，避免 blob 地址破坏图片和音频路径。
        const Url = root.URL || globalThis.URL;
        const BlobType = root.Blob || globalThis.Blob;
        const blobUrl = Url.createObjectURL(new BlobType([source.replace(/\bimport\.meta\.url\b/g, JSON.stringify(src))], { type: 'text/javascript' }));
        try {
            await injectScript(blobUrl, version);
        } finally {
            Url.revokeObjectURL(blobUrl);
        }
    }

    function injectScript(src, expectedVersion = '') {
        const existing = doc.querySelector(`#${SCRIPT_ID}`);
        const runtimeReady = () => {
            const api = root.IGS || root.ImmersiveGalgameSystem;
            return api && typeof api.openSettings === 'function' && typeof api.openLatestAvailable === 'function'
                && (!expectedVersion || api.version === expectedVersion);
        };
        if (existing && existing.src === src && runtimeReady()) return Promise.resolve(existing);
        if (existing && existing.remove) existing.remove();
        return new Promise((resolve, reject) => {
            const script = doc.createElement('script');
            let settled = false;
            let timer;
            const finish = (error) => {
                if (settled) return;
                settled = true;
                clearHostTimeout(timer);
                root.removeEventListener?.('error', onRuntimeError);
                script.onload = null;
                script.onerror = null;
                if (error) { script.remove(); reject(error); }
                else resolve(script);
            };
            const onRuntimeError = (event) => {
                if (event.filename === src) finish(new Error(`remote script startup failed: ${event.message || 'module error'} (${src})`));
            };
            script.id = SCRIPT_ID;
            script.type = 'module';
            script.src = src;
            script.onload = () => {
                if (!runtimeReady()) {
                    const actual = (root.IGS || root.ImmersiveGalgameSystem)?.version || '未启动';
                    finish(new Error(expectedVersion
                        ? `固定版本加载失败：要求 ${expectedVersion}，实际 ${actual}。${src}`
                        : `remote script did not start IGS: ${src}`));
                    return;
                }
                console.info('[IGS Loader] Immersive Galgame System bundle 已加载。', src);
                finish();
            };
            script.onerror = () => {
                finish(new Error(`remote script load failed: ${src}`));
            };
            root.addEventListener?.('error', onRuntimeError);
            timer = setHostTimeout(() => finish(new Error(`remote script load timeout: ${src}`)), 15000);
            doc.head.appendChild(script);
        });
    }

    async function reconcileExistingRuntime(config) {
        const api = root.IGS || root.ImmersiveGalgameSystem;
        const previous = root[INSTANCE_KEY];
        const sameSource = previous?.repository === REPOSITORY && buildLoadAttempts(config).some((attempt) => previous?.activeRef === attempt.ref && previous?.activeBase === attempt.base);
        const sameVersion = !config.version || api?.version === config.version;
        if (api && typeof api.ensureMagicWandEntry === 'function' && typeof api.openSettings === 'function'
            && typeof api.openLatestAvailable === 'function' && sameSource && sameVersion) {
            const result = safeEnsureMagicWandEntry(api);
            root[INSTANCE_KEY] = {
                ...previous,
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
                await releaseRuntime(api);
            } catch (error) {
                console.error('[IGS Loader] 旧版 IGS 尚未完成销毁，停止重新加载。', error);
                throw error;
            }
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

    async function releaseRuntime(api) {
        if (!api) return;
        const release = typeof api.shutdown === 'function' ? api.shutdown : api.destroy;
        if (typeof release !== 'function') throw new Error('旧 IGS 无法安全关闭，停止加载新实例。');
        const result = await release.call(api);
        if (result?.ok === false) throw new Error(result.error || result.reason || 'media-shutdown-failed');
        clearGlobalApi(api);
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
        return setter(callback, ms);
    }

    function clearHostTimeout(timer) {
        const clear = typeof root.clearTimeout === 'function' ? root.clearTimeout.bind(root)
            : typeof clearTimeout === 'function' ? clearTimeout : null;
        if (clear) clear(timer);
    }
})();
