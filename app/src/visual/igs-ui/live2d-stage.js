import { readModelPackage } from './live2d-model-store.js';
import { live2dFrameDocument } from './live2d-frame.js';

export function disposeLive2dStage(current) {
    const state = current.live2dStage;
    if (state) state.dispose();
    current.live2dStage = null;
    current.live2dStatus = null;
}
export function syncLive2dStage(root, sprite, current, binding, layout) {
    if (!sprite || !binding) { disposeLive2dStage(current); return; }
    const key = JSON.stringify([binding.modelId || binding.url, binding.runtime]);
    if (current.live2dStage?.key !== key) {
        disposeLive2dStage(current);
        const doc = sprite.ownerDocument;
        const win = doc.defaultView;
        const frame = doc.createElement('iframe');
        const channel = 'igs-live2d-' + (win.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
        frame.title = 'Live2D 角色立绘';
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
        frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;pointer-events:none;visibility:hidden';
        frame.srcdoc = live2dFrameDocument(channel);
        let booted = false, disposed = false, timer, packageReady = !binding.modelId, packageSent = false;
        let localPackage = binding.package || null;
        if (localPackage) packageReady = true;
        const state = { key, frame, ready: false, failed: false, pending: null,
            update() {
                if (!booted || disposed || state.failed || !packageReady) return;
                frame.contentWindow.postMessage({ channel, type: 'update', state: { ...state.pending, ...(!packageSent && localPackage ? { package: localPackage } : {}), paused: doc.hidden || root.hasAttribute('data-igs-paused') || root.hasAttribute('data-igs-stage-covered') || root.hasAttribute('data-igs-stage-rest') || root.classList.contains('igs-hidden') } }, '*');
                packageSent = true;
            },
            dispose() {
                disposed = true; win.clearTimeout(timer); observer?.disconnect();
                win.removeEventListener('message', receive); doc.removeEventListener('visibilitychange', state.update);
                frame.remove(); sprite.classList.remove('igs-live2d-ready');
            },
        };
        function fail(message) {
            if (disposed) return;
            state.failed = true; state.ready = false; win.clearTimeout(timer);
            frame.remove(); sprite.classList.remove('igs-live2d-ready');
            current.live2dStatus = { type: 'error', message };
            if (!current.snapshot?.content?.spriteImage) sprite.style.display = 'none';
            const button = root.querySelector('[data-act="live2d-settings"]');
            if (button) button.title = 'Live2D 加载失败（点此查看）：' + message;
        }
        function receive(event) {
            if (disposed || event.source !== frame.contentWindow || event.data?.channel !== channel) return;
            const data = event.data;
            if (data.type === 'boot') { booted = true; state.update(); }
            if (data.type === 'ready') {
                win.clearTimeout(timer); state.ready = true;
                sprite.classList.add('igs-live2d-ready'); frame.style.visibility = 'visible';
                current.live2dStatus = { ...current.live2dStatus, ...data };
                const button = root.querySelector('[data-act="live2d-settings"]');
                if (button) button.title = 'Live2D 角色绑定';
            }
            if (data.type === 'error') fail(data.message);
            if (data.type === 'action') current.live2dStatus = { ...current.live2dStatus, action: data.action };
            if (data.type === 'warning') current.live2dStatus = { ...current.live2dStatus, warning: data.message };
        }
        const observer = win.MutationObserver ? new win.MutationObserver(() => state.update()) : null;
        observer?.observe(root, { attributes: true, attributeFilter: ['class', 'data-igs-paused', 'data-igs-stage-covered', 'data-igs-stage-rest'] });
        win.addEventListener('message', receive); doc.addEventListener('visibilitychange', state.update);
        current.live2dStage = state; current.live2dStatus = { type: 'loading', message: '正在加载模型…' };
        timer = win.setTimeout(() => fail('加载超过 45 秒，请检查模型 CORS、网络和 SDK 地址；关闭阅读器后重开可重试。'), 45000);
        sprite.append(frame);
        if (binding.modelId && !localPackage) readModelPackage(win, binding.modelId).then(pkg => {
            if (disposed) return; localPackage = pkg; packageReady = true; state.update();
        }).catch(error => fail(error.message || String(error)));
    }
    const state = current.live2dStage;
    state.pending = { url: binding.url, runtime: binding.runtime, action: binding.action, replay: binding.replay, layout: { ...layout, ...binding.layout } };
    sprite.classList.toggle('igs-live2d-ready', state.ready);
    if (!state.failed) {
        Object.assign(sprite.style, { display: 'block', position: 'absolute', inset: '0', width: '100%', height: '100%', transform: 'none', bottom: 'auto', left: 'auto' });
        state.update();
    }
}
