const sessions = new WeakMap();

export function installReaderFullscreen(runtime, syncViewport) {
    const { doc, win, root } = runtime;
    const target = doc.documentElement || doc.body;
    const request = target && (target.requestFullscreen || target.webkitRequestFullscreen);
    const session = {};
    sessions.set(doc, session);
    const cleanup = [];
    let disposed = false, pending = false, suspended = false, restoreWanted = false, frame = null;
    const nativeElement = () => doc.fullscreenElement || doc.webkitFullscreenElement;
    const active = () => !disposed && sessions.get(doc) === session;
    let owned = nativeElement() === target;

    function listen(owner, type, fn, options) {
        if (typeof owner?.addEventListener !== 'function') return;
        owner.addEventListener(type, fn, options);
        cleanup.push(() => owner.removeEventListener?.(type, fn, options));
    }

    function refresh() {
        if (!active()) return;
        syncViewport();
        if (frame !== null || typeof win.requestAnimationFrame !== 'function') return;
        let fired = false;
        const id = win.requestAnimationFrame(() => {
            fired = true;
            frame = null;
            if (active()) syncViewport();
        });
        if (!fired) frame = id;
    }

    function settled(failed) {
        pending = false;
        if (!active()) {
            // 旧请求迟到时只释放自己的全屏，不退出后来打开的新阅读器。
            if (disposed && sessions.get(doc) === session) {
                if (!failed && nativeElement() === target) exitDocumentFullscreen(doc);
                sessions.delete(doc);
            }
            return;
        }
        owned = nativeElement() === target;
        restoreWanted = !owned;
        refresh();
    }

    function enter() {
        if (!active() || pending || doc.hidden || nativeElement() || typeof request !== 'function') return;
        pending = true;
        restoreWanted = false;
        try {
            preserveAudioActivation(win);
            Promise.resolve(request.call(target)).then(() => settled(false), () => settled(true));
        } catch (error) {
            settled(true);
        }
    }

    function suspend() {
        if (!active()) return;
        if (nativeElement() === target || owned || pending) restoreWanted = true;
        suspended = true;
    }

    function resume() {
        if (!active() || doc.hidden) return;
        suspended = false;
        if (nativeElement() === target) {
            owned = true;
            restoreWanted = false;
        } else if (owned && !nativeElement()) {
            restoreWanted = true;
            owned = false;
        }
        refresh();
    }

    function changed() {
        if (!active()) return;
        if (nativeElement() === target) {
            owned = true;
            restoreWanted = false;
        } else {
            if (owned && (suspended || doc.hidden)) restoreWanted = true;
            owned = false;
        }
        refresh();
    }

    function restore(event) {
        if (!restoreWanted || event.isTrusted === false || event.button > 0) return;
        if (event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
        enter();
    }

    listen(doc, 'visibilitychange', () => doc.hidden ? suspend() : resume());
    listen(doc, 'fullscreenchange', changed);
    listen(doc, 'webkitfullscreenchange', changed);
    listen(win, 'blur', suspend);
    listen(win, 'focus', resume);
    listen(win, 'pagehide', suspend);
    listen(win, 'pageshow', resume);
    listen(win, 'resize', refresh);
    listen(win.visualViewport, 'resize', refresh);
    listen(win.visualViewport, 'scroll', refresh);
    // capture 保留原点击的翻页/按钮行为，同时在有效用户手势内申请恢复。
    listen(root, 'click', restore, { capture: true, passive: true });
    refresh();
    enter();

    return () => {
        disposed = true;
        for (const off of cleanup) off();
        if (frame !== null) win.cancelAnimationFrame?.(frame);
        if (!pending && sessions.get(doc) === session) sessions.delete(doc);
    };
}

function preserveAudioActivation(win) {
    // 全屏申请会改变音频播放许可；沿用进入全屏时的手势内解锁，恢复时也执行。
    try {
        const AudioCtor = win.AudioContext || win.webkitAudioContext;
        if (AudioCtor) {
            const audio = new AudioCtor();
            audio.resume().catch(() => {});
            audio.close().catch(() => {});
        }
    } catch (error) { /* AudioContext may be unavailable. */ }
}

export function exitDocumentFullscreen(doc) {
    if (!doc) return;
    const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
    if ((doc.fullscreenElement || doc.webkitFullscreenElement) && typeof exit === 'function') {
        try {
            const result = exit.call(doc);
            if (result && typeof result.catch === 'function') result.catch(() => {});
        } catch (error) {
            // Browser teardown can race the exit request.
        }
    }
}
