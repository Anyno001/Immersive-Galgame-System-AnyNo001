// CDP 截图与探针：驱动本机 Edge（无头）访问 record-pages preview，
// 收集控制台错误、核对 DOM 状态、按容器尺寸截图。
// 用法：node scripts/record-pages-capture.mjs [--page map] [--size desktop] [--select <data-record-id>] [--out <file>] [--probe-only]
// 依赖：Node >= 22（内置 WebSocket）；Edge 以 --remote-debugging-port 启动。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const page = arg('page', 'map');
const size = arg('size', 'desktop');
const bg = arg('bg', '');
const selectId = arg('select', '');
const outFile = arg('out', path.join(appRoot, '..', 'docs', 'ui', 'record-pages', 'verification', `step2-shell-${page}-${size}.png`));
const probeOnly = args.includes('--probe-only');
const exerciseMap = args.includes('--exercise-map');
const exerciseRecord = args.includes('--exercise-record');

const SIZES = { desktop: [1440, 900], ref: [1672, 941], mid: [1024, 768], mobile: [390, 844], short: [390, 500], tiny: [320, 568] };
const [width, height] = SIZES[size] || SIZES.desktop;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CDP_PORT = 9333;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${process.env.TEMP}\\igs-cdp-profile`, 'about:blank'], { stdio: 'ignore' });
let failed = false;
try {
    let version = null;
    for (let i = 0; i < 30; i++) {
        try { version = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(); break; }
        catch { await sleep(300); }
    }
    if (!version) throw new Error('CDP endpoint not reachable');
    const target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let seq = 0;
    const pending = new Map();
    const consoleErrors = [];
    const failedRequests = [];
    ws.onmessage = event => {
        const msg = JSON.parse(event.data);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
        if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push('exception: ' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text));
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') consoleErrors.push('console.error: ' + msg.params.args.map(a => a.value ?? a.description).join(' '));
        if (msg.method === 'Network.responseReceived' && msg.params.response?.status >= 400) failedRequests.push(msg.params.response.status + ' ' + msg.params.response.url);
    };
    const send = (method, params = {}) => new Promise(resolve => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    const url = `http://127.0.0.1:4173/fixtures/record-pages/preview.html?page=${page}&size=${size}${bg ? '&bg=' + bg : ''}${selectId ? '&select=' + encodeURIComponent(selectId) : ''}`;
    await send('Page.navigate', { url });
    const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
    // 等待面板挂载且地图底图状态机收敛（loading → ready/failed/none），替代固定时长猜测。
    let settled = false;
    for (let i = 0; i < 40 && !settled; i++) {
        await sleep(250);
        settled = await evaluate(`(() => {
            const panel = document.querySelector('#igs-map-panel,#igs-record-panel');
            if (!panel) return false;
            if (panel.id !== 'igs-map-panel') return true;
            const state = window.__preview?.map?.getState?.();
            return !!state && state.basemapState !== 'loading';
        })()`);
    }
    if (!settled) consoleErrors.push('capture: panel or basemap state did not settle in time');
    const mapInteraction = page === 'map' && exerciseMap ? await (async () => {
        const readMapInteractionState = () => evaluate(`(() => {
            const map = window.__preview?.map?.getState?.();
            const viewport = document.querySelector('.igs-map-viewport')?.getBoundingClientRect?.();
            return {
                selectedId: map?.selectedId || '',
                camera: map?.camera ? { tx: map.camera.tx, ty: map.camera.ty, k: map.camera.k } : null,
                viewport: viewport ? { left: viewport.left, top: viewport.top, width: viewport.width, height: viewport.height } : null,
            };
        })()`);
        const before = await readMapInteractionState();
        await evaluate(`(() => { document.querySelector('[data-map-act="zoom-in"]')?.click(); return true; })()`);
        await sleep(80);
        const afterZoom = await readMapInteractionState();
        const rect = afterZoom?.viewport;
        if (rect?.width && rect?.height) {
            const x = rect.left + rect.width * 0.2;
            const y = rect.top + rect.height * 0.78;
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + 24, y: y + 12, button: 'left', buttons: 1 });
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + 24, y: y + 12, button: 'left', clickCount: 1 });
            await sleep(80);
        }
        const afterDrag = await readMapInteractionState();
        const travelButton = await evaluate(`(() => {
            const button = document.querySelector('[data-map-act="travel"]');
            if (!button) return false;
            button.click();
            return true;
        })()`);
        await sleep(100);
        const feedback = await evaluate(`document.querySelector('.igs-map-feedback')?.textContent || ''`);
        const stats = await evaluate(`window.__preview?.stats || null`);
        return {
            before, afterZoom, afterDrag,
            zoomChanged: Boolean(before?.camera && afterZoom?.camera && before.camera.k !== afterZoom.camera.k),
            dragChanged: Boolean(afterZoom?.camera && afterDrag?.camera && (afterZoom.camera.tx !== afterDrag.camera.tx || afterZoom.camera.ty !== afterDrag.camera.ty)),
            travelButton, feedback, stats,
        };
    })() : null;
    const recordInteraction = page !== 'map' && exerciseRecord ? await (async () => {
        const readRecordInteractionState = () => evaluate(`(() => {
            const record = window.__preview?.record?.getState?.();
            const active = document.querySelector('[data-record-act="select"][aria-current="true"],[data-record-act="person"][aria-current="true"]');
            const book = document.querySelector('.igs-record-book[aria-current="true"]');
            const detailTitle = document.querySelector('.igs-record-item-detail h3,.igs-record-diary-detail h3,.igs-record-relationship-detail h3')?.textContent?.trim() || '';
            return {
                state: record ? { category: record.category, activeUid: record.activeUid || '', selectedId: record.selectedId || '', relationshipPersonId: record.relationshipPersonId || '' } : null,
                activeId: active?.getAttribute('data-record-id') || '',
                activeBookId: book?.getAttribute('data-record-id') || '',
                detailTitle,
            };
        })()`);
        const before = await readRecordInteractionState();
        let alternateId = '';
        let restored = false;
        if (page === 'diary') {
            const bookIds = await evaluate(`Array.from(document.querySelectorAll('.igs-record-book')).map(item => item.getAttribute('data-record-id')).filter(Boolean)`);
            const initialBookId = before?.activeBookId || '';
            alternateId = bookIds?.find(id => id !== initialBookId) || '';
            if (alternateId) {
                await evaluate(`(() => { const id = ${JSON.stringify(alternateId)}; const item = Array.from(document.querySelectorAll('.igs-record-book')).find(node => node.getAttribute('data-record-id') === id); item?.click(); return Boolean(item); })()`);
                await sleep(80);
                if (initialBookId) await evaluate(`(() => { const id = ${JSON.stringify(initialBookId)}; const item = Array.from(document.querySelectorAll('.igs-record-book')).find(node => node.getAttribute('data-record-id') === id); item?.click(); return Boolean(item); })()`);
                await sleep(80);
            }
            if (selectId) {
                await evaluate(`(() => { const id = ${JSON.stringify(selectId)}; const item = Array.from(document.querySelectorAll('[data-record-act="select"]')).find(node => node.getAttribute('data-record-id') === id); item?.click(); return Boolean(item); })()`);
                await sleep(80);
            }
            const after = await readRecordInteractionState();
            restored = Boolean(after?.state?.selectedId === selectId && (!initialBookId || after.activeBookId === initialBookId));
            return { before, alternateId, after, restored };
        }
        const targetId = selectId;
        const candidates = await evaluate(`Array.from(document.querySelectorAll('[data-record-act="select"],[data-record-act="person"]')).map(item => item.getAttribute('data-record-id')).filter(Boolean)`);
        alternateId = candidates?.find(id => id !== targetId) || '';
        if (alternateId) {
            await evaluate(`(() => { const id = ${JSON.stringify(alternateId)}; const item = Array.from(document.querySelectorAll('[data-record-act="select"],[data-record-act="person"]')).find(node => node.getAttribute('data-record-id') === id); item?.click(); return Boolean(item); })()`);
            await sleep(80);
        }
        if (targetId) {
            await evaluate(`(() => { const id = ${JSON.stringify(targetId)}; const item = Array.from(document.querySelectorAll('[data-record-act="select"],[data-record-act="person"]')).find(node => node.getAttribute('data-record-id') === id); item?.click(); return Boolean(item); })()`);
            await sleep(80);
        }
        const after = await readRecordInteractionState();
        restored = page === 'relationships'
            ? after?.state?.relationshipPersonId === targetId
            : after?.state?.selectedId === targetId;
        return { before, alternateId, after, restored };
    })() : null;
    const state = await evaluate(`(() => {
        const panel = document.querySelector('#igs-map-panel,#igs-record-panel');
        const title = document.querySelector('.igs-rp-title');
        const back = document.querySelector('.igs-rp-back');
      const tRect = title?.getBoundingClientRect(), bRect = back?.getBoundingClientRect(), stage = document.getElementById('stage')?.getBoundingClientRect();
        return {
            panel: !!panel, panelId: panel?.id || '', errors: document.getElementById('errlog')?.textContent || '',
            titleCenterDelta: tRect && stage ? Math.abs((tRect.left + tRect.right) / 2 - (stage.left + stage.right) / 2) : null,
            backSize: bRect ? [bRect.width, bRect.height] : null,
            stageSize: stage ? [stage.width, stage.height] : null,
            narrow: panel?.classList?.contains('igs-rp-narrow') ?? null,
            short: panel?.classList?.contains('igs-rp-short') ?? null,
            overlayHidden: getComputedStyle(document.getElementById('igs-overlay')).display !== 'none',
            stats: window.__preview?.stats || null,
            overflowX: panel ? panel.scrollWidth > panel.clientWidth + 1 : null,
            overlayClass: document.getElementById('igs-overlay').className,
            fontSerif: document.fonts.check('16px "Source Han Serif CN"'),
            fontLatin: document.fonts.check('16px "Cormorant Garamond"'),
            recordState: window.__preview?.record?.getState?.() ? (() => {
                const record = window.__preview.record.getState();
                return { category: record.category, activeUid: record.activeUid, relationshipPersonId: record.relationshipPersonId || '', selectedId: record.selectedId || '' };
            })() : null,
            mapState: window.__preview?.map?.getState?.() ? (() => {
                const map = window.__preview.map.getState();
                const markers = [...(panel?.querySelectorAll?.('.igs-map-marker') || [])].map(marker => {
                    const button = marker.querySelector('button');
                    const rect = button?.getBoundingClientRect?.();
                    return {
                        id: button?.getAttribute('data-map-id') || '',
                        selected: marker.classList.contains('igs-map-selected'),
                        current: marker.classList.contains('igs-map-current'),
                        buttonSize: rect ? [rect.width, rect.height] : null,
                    };
                });
                return {
                    activeUid: map.activeUid || '', parentId: map.parentId || '',
                    selectedId: map.selectedId || '', currentId: map.currentId || '',
                    basemapState: map.basemapState || '',
                    camera: map.camera ? { tx: map.camera.tx, ty: map.camera.ty, k: map.camera.k } : null,
                    markerCount: markers.length, markers,
                };
            })() : null,
            mapInteraction: ${JSON.stringify(mapInteraction)},
            recordInteraction: ${JSON.stringify(recordInteraction)},
            relationshipNodeCount: panel?.querySelectorAll?.('.igs-record-relationship-node')?.length ?? null,
            relationshipLabelCount: panel?.querySelectorAll?.('.igs-record-relationship-label')?.length ?? null,
        };
    })()`);
    console.log(JSON.stringify({ url, ...state, consoleErrors, failedRequests }, null, 1));
    if (state.errors || consoleErrors.length || failedRequests.length) failed = true;
    if (!probeOnly) {
        await document_fonts_ready();
        async function document_fonts_ready() { await evaluate('document.fonts.ready.then(()=>1)'); }
        await sleep(400);
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.writeFileSync(outFile, Buffer.from(shot.result.data, 'base64'));
        console.log('screenshot:', outFile, fs.statSync(outFile).size, 'bytes');
    }
    await send('Target.closeTarget', { targetId: target.id }).catch(() => { });
    ws.close();
} finally {
    edge.kill();
}
process.exit(failed ? 1 : 0);
