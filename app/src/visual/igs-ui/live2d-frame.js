// 只在 sandbox iframe 内运行；不把 PIXI / Cubism 写到酒馆父窗口。
export function live2dFrameDocument(channel) {
    return '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}canvas{display:block}</style><script>(' + live2dFrameMain.toString() + ')(' + JSON.stringify(channel) + ')<\/script>';
}
function live2dFrameMain(channel) {
    let app, model, state, started = false, lastAction = '', paused = false;
    const objectUrls = [];
    const releaseUrls = () => { for (const url of objectUrls) URL.revokeObjectURL(url); objectUrls.length = 0; };
    const report = (type, extra = {}) => parent.postMessage({ channel, type, ...extra }, '*');
    const script = (src) => new Promise((resolve, reject) => {
        const el = document.createElement('script'); el.src = src;
        el.onload = resolve; el.onerror = () => reject(new Error('运行库加载失败：' + src)); document.head.append(el);
    });
    function layout() {
        if (!model || !state) return;
        const box = state.layout || {};
        const h = innerHeight * Number(box.scale || 100) / 100;
        const ratio = h / model.internalModel.height;
        model.scale.set(ratio);
        model.position.set((innerWidth - model.internalModel.width * ratio) * Number(box.posX ?? 50) / 100, (innerHeight - h) * Number(box.posY ?? 100) / 100);
    }
    let actionVersion = 0, actionBusy = false, destroyed = false;
    async function applyAction() {
        if (!model || destroyed) return;
        const key = JSON.stringify([state.action || {}, state.replay || 0]);
        if (key === lastAction) return;
        lastAction = key; actionVersion++;
        if (actionBusy) return;
        actionBusy = true;
        try {
            // 串行应用，只追赶最新状态：慢速旧表情/动作不能最后覆盖新的一页。
            while (!destroyed) {
                const version = actionVersion;
                const action = state.action || {};
                const mm = model.internalModel.motionManager;
                mm.stopAllMotions();
                const em = mm.expressionManager;
                if (em) {
                    // 0.4.0 的 resetExpression 不清 currentExpression，必须同时复位，
                    // 否则「微笑→默认→微笑」会被 SDK 的重复表情检查忽略。
                    em.reserveExpressionIndex = -1;
                    em.currentExpression = em.defaultExpression;
                    em.resetExpression();
                }
                if (action.expression) {
                    const ok = await model.expression(action.expression);
                    if (destroyed) return;
                    if (version !== actionVersion) continue;
                    if (!ok) report('warning', { message: '表情不存在或加载失败：' + action.expression });
                }
                if (version !== actionVersion) continue;
                if (action.motion) {
                    const ok = await model.motion(action.motion, action.index || 0, 3);
                    if (destroyed) return;
                    if (version !== actionVersion) continue;
                    if (!ok) report('warning', { message: '动作不存在或加载失败：' + action.motion + '[' + (action.index || 0) + ']' });
                }
                report('action', { action });
                break;
            }
        } finally { actionBusy = false; }
    }
    function update() {
        if (!app || !model) return;
        layout();
        paused = Boolean(state.paused);
        if (model.autoUpdate !== !paused) model.autoUpdate = !paused;
        if (paused) app.stop(); else app.start();
        applyAction().catch((e) => report('warning', { message: String(e.message || e) }));
        if (paused) app.render();
    }
    async function load() {
        const input = state;
        let definition;
        if (input.package) {
            const pkg = input.package;
            definition = JSON.parse(new TextDecoder().decode(pkg.files[pkg.entry]));
            definition.url = 'https://igs-local.invalid/' + pkg.entry.split('/').map(encodeURIComponent).join('/');
            const urls = new Map();
            function localUrl(path) {
                const key = decodeURIComponent(new URL(path.replace(/\\/g, '/'), definition.url).pathname.slice(1));
                if (!Object.hasOwn(pkg.files, key)) throw new Error('缺少本地模型资源：' + path);
                if (!urls.has(key)) {
                    const ext = key.split('.').pop().toLowerCase();
                    const type = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', json:'application/json', wav:'audio/wav', mp3:'audio/mpeg' }[ext] || 'application/octet-stream';
                    const url = URL.createObjectURL(new Blob([pkg.files[key]], { type }));
                    urls.set(key, url); objectUrls.push(url);
                }
                return urls.get(key);
            }
            const rewrite = (obj, key) => { if (obj?.[key]) obj[key] = localUrl(obj[key]); };
            const r = definition.FileReferences;
            if (r?.Moc) {
                for (const key of ['Moc', 'Physics', 'Pose', 'UserData', 'DisplayInfo']) rewrite(r, key);
                for (let i = 0; i < (r.Textures || []).length; i++) rewrite(r.Textures, i);
                for (const e of r.Expressions || []) rewrite(e, 'File');
                for (const list of Object.values(r.Motions || {})) for (const m of list) { rewrite(m, 'File'); rewrite(m, 'Sound'); }
            } else {
                for (const key of ['model', 'physics', 'pose']) rewrite(definition, key);
                for (let i = 0; i < (definition.textures || []).length; i++) rewrite(definition.textures, i);
                for (const e of definition.expressions || []) rewrite(e, 'file');
                for (const list of Object.values(definition.motions || {})) for (const m of list) { rewrite(m, 'file'); rewrite(m, 'sound'); }
            }
        } else {
            const response = await fetch(input.url, { credentials: 'omit' });
            if (!response.ok) throw new Error('模型清单 HTTP ' + response.status);
            definition = await response.json(); definition.url = response.url || input.url;
        }
        const cubism4 = Boolean(definition.FileReferences?.Moc);
        if (!cubism4 && !definition.model) throw new Error('不是 model.json / model3.json / buildData.asset 模型清单');
        if (destroyed) return;
        await script('https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js');
        if (destroyed) return;
        await script(cubism4 ? input.runtime.core4 : input.runtime.core2);
        if (destroyed) return;
        await script('https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/' + (cubism4 ? 'cubism4' : 'cubism2') + '.min.js');
        if (destroyed) return;
        app = new PIXI.Application({ resizeTo: window, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, autoStart: false });
        document.body.append(app.view);
        model = await PIXI.live2d.Live2DModel.from(definition, { autoInteract: false, autoUpdate: false, autoFocus: false, autoHitTest: false, crossOrigin: 'anonymous' });
        if (destroyed) { model.destroy({ children: true, texture: true, baseTexture: true }); releaseUrls(); return; }
        app.stage.addChild(model);
        const refs = definition.FileReferences;
        const expressions = (refs?.Expressions || definition.expressions || []).map((e) => e.Name || e.name);
        const motions = Object.fromEntries(Object.entries(refs?.Motions || definition.motions || {}).map(([name, list]) => [name, list.length]));
        update();
        report('ready', { expressions, motions, cubism: cubism4 ? '3/4' : '2' });
    }
    addEventListener('message', (event) => {
        if (event.source !== parent || event.data?.channel !== channel || event.data.type !== 'update') return;
        state = event.data.state;
        if (!started) { started = true; load().catch((e) => { model?.destroy({ children: true, texture: true, baseTexture: true }); app?.destroy(true); releaseUrls(); report('error', { message: String(e.message || e) }); }); }
        else update();
    });
    addEventListener('resize', () => { layout(); if (paused && app) requestAnimationFrame(() => app.render()); });
    addEventListener('pagehide', () => { destroyed = true; model?.destroy({ children: true, texture: true, baseTexture: true }); app?.destroy(true); releaseUrls(); });
    report('boot');
}
