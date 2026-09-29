import { createShujukuClient } from '../../data/shujuku/client.js';
import { getMapChildren, hasInvalidBasemap, locateMapScene, mapAncestors, readMapModel, resolveMapBasemap, sanitizeMapBasemapUrl } from '../../data/shujuku/map-model.js';
import { normalizeMapTime, resolveMapTimeBasemap } from '../../data/shujuku/map-time.js';
import { applyTransparentGlassMaterial } from '../../styles/glass-material.js';
import { lookupSceneAssetUrls } from '../../scene/scene-directives.js';
import { RECORD_ICONS } from './record-icons.js';
import { recordPageHeadHtml, watchRecordPageLayout } from './record-page-shell.js';
import { setStagePauseReason } from './stage-pause.js';
import { MAP_FALLBACK_WORLD, autoPlaceMapPoints, centerMapCamera, fitMapCamera, mapPinWorldPoint, panMapCamera, zoomMapCamera } from './map-viewport.js';
import { buildMapGenInput, buildMarkerLightsInput, createMapBasemapGenerator } from '../map-gen/index.js';
import { resolveMapLighting } from '../map-gen/lighting.js';
import { mapBasemapFilter, mapLightLayersHtml } from './map-light-layers.js';
import { MAP_BUILTIN_BASEMAPS, getBuiltinBasemap, resolveBuiltinBasemap } from './map-basemap-styles.js';
import { applyWeatherFx, cancelWeatherFx, normalizeWeatherFxSettings, resolveWeatherFxTime } from './weather-fx-runtime.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const personInitial = value => escapeHtml(String(value ?? '').trim().charAt(0) || '·');
const BASEMAP_SOURCE_KEY = 'igs-map-basemap-source';
const GEN_SALT_KEY = 'igs-map-gen-salt:';
// map-demo 全套自带分时段美术，不再二次调色与点灯。
const OWN_TIME_ART = /map-demo-(?:clean|day)/i;
// 「17:40」等钟点也归入五档时段，内置分时段底图才能跟着切换。
const timeBucket = time => resolveWeatherFxTime(time) || time;
const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

export function createMapPanelController(doc, global, fillDraft, options = {}) {
    let root = null;
    let client = null;
    let previousFocus = null;
    let model = { status: 'no-tables', tables: [] };
    let activeUid = '';
    let parentId = null;
    let selectedId = null;
    let currentId = null;
    let sceneName = '';
    let sceneTime = '';
    let sceneWeather = '';
    let weatherFxSettings = null;
    let weatherLayer = null;
    let sceneAssets = null;
    let message = '';
    let sourceOpen = false;
    let pageOverlay = null;
    let unwatchLayout = null;
    // 视口状态：世界尺寸（底图自然像素或中性平面）、相机与底图加载令牌。
    let world = { ...MAP_FALLBACK_WORLD };
    let camera = null;
    let baseK = 1;
    let basemapUrl = '';
    let basemapState = 'none';
    let basemapToken = 0;
    let dragMoved = false;
    let renderCount = 0;
    // 程序底图：生成器跨开关复用缓存；pendingKey 防止同一任务重复订阅完成回调。
    let generator = null;
    let pendingKey = '';
    let generation = { status: 'none', key: '', theme: '', scale: '' };
    const getChatId = () => { try { return String(options.getChatId?.() || ''); } catch (_) { return ''; } };
    const storage = () => { try { return (global || globalThis).localStorage || null; } catch (_) { return null; } };
    // 底图来源：'auto'（生成）或 'builtin:<款式>'；旧值 'demo' 视为第一款自带底图。
    const storedSource = () => { try { return String(storage()?.getItem(BASEMAP_SOURCE_KEY) || 'auto'); } catch (_) { return 'auto'; } };
    const basemapSource = () => (storedSource() === 'auto' ? 'auto' : 'builtin');
    const builtinStyle = () => getBuiltinBasemap(storedSource().replace(/^builtin:/, ''));
    const saltKey = () => GEN_SALT_KEY + (getChatId() || 'default');
    const readSalt = () => { try { return Number(storage()?.getItem(saltKey())) || 0; } catch (_) { return 0; } };
    const writeStored = (key, value) => { try { storage()?.setItem(key, String(value)); } catch (_) { /* 隐私模式下仅本次会话生效 */ } };
    const callback = () => { if (root) reload(); };
    const activeTable = () => model.tables.find(table => table.uid === activeUid) || null;
    const selected = () => activeTable()?.locations.find(loc => loc.id === selectedId) || null;
    const sceneAssetUrl = name => {
        const target = String(name || '').trim();
        const scenes = sceneAssets?.scenes;
        if (!sceneAssets?.enabled || !target || !scenes || typeof scenes !== 'object' || Array.isArray(scenes)) return '';
        return sanitizeMapBasemapUrl(lookupSceneAssetUrls({ scene: target }, sceneAssets)?.backgroundUrl);
    };

    function reload() {
        try { model = readMapModel(client.readTables()); }
        catch (error) { model = { status: 'read-error', reason: String(error?.message || '读取地图失败'), tables: [] }; }
        if (model.status !== 'ready') {
            activeUid = ''; parentId = null; selectedId = null; currentId = null;
        }
        if (!activeTable()) { activeUid = model.tables[0]?.uid || ''; parentId = null; selectedId = null; }
        const table = activeTable();
        if (table && parentId && !table.locations.some(loc => loc.id === parentId && !loc.issues.includes('地点ID重复') && !loc.issues.includes('父级循环'))) parentId = null;
        if (!selected()) selectedId = null;
        if (currentId && !table?.locations.some(loc => loc.id === currentId)) currentId = null;
        render();
    }

    function open(overlay, settings, scene = '', time = '', weather = '') {
        if (root) return { ok: true, reason: 'already-open' };
        if (!overlay || !doc?.createElement) return { ok: false, reason: 'missing-map-container' };
        message = '';
        sourceOpen = false;
        const container = overlay.querySelector?.('#igs-db-layer') || overlay;
        previousFocus = doc.activeElement || null;
        sceneName = String(scene || '').trim();
        sceneTime = String(time || '').trim();
        sceneWeather = String(weather || '').trim();
        weatherFxSettings = settings?.weatherFx || null;
        weatherLayer = doc.createElement('div');
        weatherLayer.className = 'igs-map-weather';
        weatherLayer.setAttribute('aria-hidden', 'true');
        sceneAssets = settings?._sceneAssets || settings?.sceneAssets || null;
        pageOverlay = overlay;
        currentId = null;
        root = doc.createElement('div');
        root.id = 'igs-map-panel';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '地点地图');
        root.setAttribute('data-map-time', normalizeMapTime(timeBucket(sceneTime)) || 'night');
        root.addEventListener('click', onClick);
        container.appendChild(root);
        overlay.classList?.toggle('igs-record-screen-open', true);
        setStagePauseReason(overlay, 'panel:map', true);
        unwatchLayout = watchRecordPageLayout(root, doc);
        applyTransparentGlassMaterial(root, settings?.glassOpacity, { backdropFilter: settings?.glassBackdropFilter });
        client = createShujukuClient((global || globalThis).AutoCardUpdaterAPI || null);
        try { client.registerCallback(callback); } catch (error) { /* Optional subscription must not block browsing. */ }
        reload();
        if (sceneName) {
            const match = locateMapScene(model, sceneName);
            if (match.location) {
                activeUid = match.location.table.uid;
                parentId = match.location.location.parentId;
                currentId = match.location.location.id;
            } else if (model.status === 'ready' && match.ambiguous) message = '场景名称重复，无法确定当前地点';
            else if (model.status === 'ready') message = '当前场景未在地图中定位';
            render();
        }
        root.querySelector?.('[data-map-act="close"]')?.focus?.();
        return { ok: true };
    }

    function close() {
        if (!root) return { ok: true, reason: 'not-open' };
        basemapToken++;
        basemapUrl = '';
        basemapState = 'none';
        pendingKey = '';
        if (weatherLayer) cancelWeatherFx(weatherLayer);
        weatherLayer = null;
        unwatchLayout?.();
        unwatchLayout = null;
        root.removeEventListener('click', onClick);
        root.remove();
        root = null;
        pageOverlay?.classList?.remove('igs-record-screen-open');
        setStagePauseReason(pageOverlay, 'panel:map', false);
        pageOverlay = null;
        sceneAssets = null;
        try { client?.unregisterCallback(callback); } catch (error) { /* Host may already be gone. */ }
        client = null;
        camera = null;
        const focus = previousFocus;
        previousFocus = null;
        focus?.focus?.();
        return { ok: true };
    }

    function onClick(event) {
        event.stopPropagation?.();
        if (event.target === root) { close(); return; }
        const control = event.target?.closest?.('[data-map-act]');
        if (!control || !root?.contains(control)) return;
        event.preventDefault?.();
        event.stopPropagation?.();
        const action = control.getAttribute('data-map-act');
        const id = control.getAttribute('data-map-id');
        if (action === 'close') return close();
        if (action === 'toggle-source') { sourceOpen = !sourceOpen; render(); return; }
        if (!['basemap-source', 'basemap-style', 'reroll', 'reroll-back'].includes(action)) sourceOpen = false;
        if (action === 'deselect') selectedId = null;
        if (action === 'refresh') return reload();
        if (action === 'table') {
            if (!model.tables.some(table => table.uid === id)) return;
            activeUid = id; parentId = null; selectedId = null; currentId = null; message = ''; camera = null;
        }
        if (action === 'select') {
            if (!getMapChildren(activeTable(), parentId).some(loc => loc.id === id)) return;
            selectedId = id; message = '';
        }
        if (action === 'enter') {
            const table = activeTable();
            if (!getMapChildren(table, parentId).some(loc => loc.id === id) || !getMapChildren(table, id).length) return;
            parentId = id; selectedId = null; message = ''; camera = null;
        }
        if (action === 'level') {
            if (id && !mapAncestors(activeTable(), parentId).includes(id)) return;
            parentId = id || null; selectedId = null; message = ''; camera = null;
        }
        if (action === 'back') {
            parentId = activeTable()?.locations.find(loc => loc.id === parentId)?.parentId || null;
            selectedId = null; message = ''; camera = null;
        }
        if (action === 'travel') return travel();
        if (action === 'zoom-in') zoomViewport(1.4);
        if (action === 'zoom-out') zoomViewport(1 / 1.4);
        if (action === 'reset-view') { camera = null; applyCamera(); }
        if (action === 'reroll') writeStored(saltKey(), readSalt() + 1);
        if (action === 'reroll-back') writeStored(saltKey(), Math.max(0, readSalt() - 1));
        if (action === 'basemap-source' && (id === 'auto' || id === 'builtin') && id !== basemapSource()) {
            writeStored(BASEMAP_SOURCE_KEY, id === 'auto' ? 'auto' : `builtin:${builtinStyle().id}`);
            camera = null;
        }
        if (action === 'basemap-style' && MAP_BUILTIN_BASEMAPS.some(style => style.id === id)) writeStored(BASEMAP_SOURCE_KEY, `builtin:${id}`);
        render();
    }

    async function travel() {
        const loc = selected();
        if (!loc?.name || !loc.rowId || loc.issues.includes('地点ID重复')) { message = '地点信息不完整，无法填入草稿'; render(); return; }
        try {
            const result = await fillDraft(`前往${loc.name}地点`);
            message = result?.ok ? '已填入草稿，尚未发送' : result?.reason === 'draft-not-empty'
                ? '输入框已有草稿，未覆盖' : `填入失败：${result?.reason || '输入框不可用'}`;
        } catch (error) { message = '填入失败：输入框不可用'; }
        render();
    }

    // 缩放控件：围绕视口中心缩放。
    function zoomViewport(factor) {
        const viewport = root?.querySelector?.('.igs-map-viewport');
        if (!viewport || !camera) return;
        const rect = viewport.getBoundingClientRect?.() || { width: 0, height: 0 };
        camera = zoomMapCamera(camera, factor, rect.width / 2, rect.height / 2, baseK);
        applyCamera();
    }

    // 把当前相机写入世界层 transform；针标签与触控命中区不随地图缩放。
    function applyCamera() {
        const worldLayer = root?.querySelector?.('.igs-map-world');
        if (worldLayer && camera) worldLayer.style.transform = `translate(${camera.tx}px, ${camera.ty}px) scale(${camera.k})`;
        if (camera) root?.querySelectorAll?.('.igs-map-marker').forEach(marker => {
            const inverseScale = camera.k > 0 ? 1 / camera.k : 1;
            marker.style.transform = `translate(-50%, -100%) scale(${inverseScale})`;
        });
    }

    // 视口指针交互：拖动平移、触屏双指缩放；超过 6 CSS px 不派发地点点击。
    function bindViewportGestures(viewport) {
        const view = doc?.defaultView;
        if (!viewport?.addEventListener) return;
        const pointers = new Map();
        let lastPinch = 0;
        viewport.addEventListener('pointerdown', event => {
            if (!camera) return;
            viewport.setPointerCapture?.(event.pointerId);
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                lastPinch = Math.hypot(a.x - b.x, a.y - b.y);
            }
            dragMoved = false;
        });
        viewport.addEventListener('pointermove', event => {
            if (!camera || !pointers.has(event.pointerId)) return;
            const prev = pointers.get(event.pointerId);
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (pointers.size === 1) {
                const dx = event.clientX - prev.x;
                const dy = event.clientY - prev.y;
                if (Math.abs(dx) + Math.abs(dy) > 0) {
                    if (!dragMoved && Math.abs(dx) + Math.abs(dy) < 1) return;
                    camera = panMapCamera(camera, dx, dy);
                    dragMoved = true;
                    applyCamera();
                }
            } else if (pointers.size === 2) {
                const [a, b] = [...pointers.values()];
                const pinch = Math.hypot(a.x - b.x, a.y - b.y);
                if (lastPinch > 0 && pinch > 0) {
                    const rect = viewport.getBoundingClientRect();
                    const fx = (a.x + b.x) / 2 - rect.left;
                    const fy = (a.y + b.y) / 2 - rect.top;
                    camera = zoomMapCamera(camera, pinch / lastPinch, fx, fy, baseK);
                    dragMoved = true;
                    applyCamera();
                }
                lastPinch = pinch;
            }
        });
        const release = event => {
            pointers.delete(event.pointerId);
            if (pointers.size < 2) lastPinch = 0;
            try { viewport.releasePointerCapture?.(event.pointerId); } catch (_) { /* not captured */ }
        };
        viewport.addEventListener('pointerup', release);
        viewport.addEventListener('pointercancel', release);
        // 阻断拖动后点击穿透为地点选择：针按钮自身 click 先记录位移。
        viewport.addEventListener('click', event => {
            if (!dragMoved) return;
            const pin = event.target?.closest?.('.igs-map-marker button');
            if (pin) { event.preventDefault?.(); event.stopPropagation?.(); }
        }, true);
        void view;
    }


    // 底图状态机：none/loading/ready/failed/conflict。异步加载用令牌丢弃过期结果。
    function prepareBasemap(resolution) {
        if (!root) return;
        if (resolution.status !== 'ok') {
            basemapUrl = '';
            world = { ...MAP_FALLBACK_WORLD };
            basemapState = resolution.status === 'conflict' ? 'conflict' : 'none';
            return;
        }
        if (resolution.url === basemapUrl && (basemapState === 'ready' || basemapState === 'loading' || basemapState === 'failed')) return;
        const Img = doc?.defaultView?.Image || (typeof Image !== 'undefined' ? Image : null);
        if (!Img) { basemapState = 'none'; return; }
        basemapUrl = resolution.url;
        basemapState = 'loading';
        const token = ++basemapToken;
        const img = new Img();
        img.referrerPolicy = 'no-referrer';
        img.onload = () => {
            if (token !== basemapToken || !root) return;
            const width = img.naturalWidth || 0;
            const height = img.naturalHeight || 0;
            if (!width || !height) { basemapState = 'failed'; world = { ...MAP_FALLBACK_WORLD }; camera = null; render(); return; }
            world = { width, height };
            basemapState = 'ready';
            camera = null;
            render();
        };
        img.onerror = () => {
            if (token !== basemapToken || !root) return;
            basemapState = 'failed';
            world = { ...MAP_FALLBACK_WORLD };
            camera = null;
            render();
        };
        img.src = basemapUrl;
    }

    function render() {
        if (!root) return;
        renderCount++;
        const table = activeTable();
        const parent = table?.locations.find(loc => loc.id === parentId);
        const children = table ? getMapChildren(table, parentId) : [];
        const pins = children.filter(loc => loc.x !== null && loc.y !== null && loc.rowId && loc.name && !loc.issues.length);
        // 未记录坐标但可唯一识别的地点按固定算法排布在示意位置，不再堆成列表卡片；缺名称/重复 ID 只进诊断。
        const floating = children.filter(loc => !pins.includes(loc) && loc.rowId && loc.name
            && !loc.issues.includes('地点ID重复') && !loc.issues.includes('父级循环'));
        const autoPoints = autoPlaceMapPoints(pins.map(loc => ({ x: loc.x, y: loc.y })), floating.length, world.width / world.height);
        const markers = [...pins.map(loc => ({ loc, x: loc.x, y: loc.y, auto: false })),
            ...floating.map((loc, index) => ({ loc, x: autoPoints[index]?.x ?? 0.5, y: autoPoints[index]?.y ?? 0.5, auto: true }))];
        const place = selected();
        const current = table?.locations.find(loc => loc.id === currentId) || null;
        // 当前地点在更深的子层时，本层标出包含它的那个地点，而不是显得“你不在这张图上”。
        const currentChain = currentId ? [currentId, ...mapAncestors(table, currentId)] : [];
        const hereId = markers.find(item => currentChain.includes(item.loc.id))?.loc.id || null;
        const hereInside = hereId && hereId !== currentId ? current : null;
        const hereTag = hereInside ? `你在这里 · ${hereInside.name}` : '你在这里';
        const tabs = model.tables.length > 1 ? `<nav class="igs-map-tabs" aria-label="选择地图">${model.tables.map(item =>
            `<button type="button" class="igs-rp-chip" aria-pressed="${item.uid === activeUid ? 'true' : 'false'}" data-map-act="table" data-map-id="${escapeHtml(item.uid)}" ${item.uid === activeUid ? 'aria-current="true"' : ''}>${escapeHtml(item.name)}</button>`).join('')}</nav>` : '';
        const baseResolution = table ? resolveMapBasemap(table, parentId) : { status: 'none', url: '', reason: '' };
        const generated = table && baseResolution.status === 'none' && basemapSource() === 'auto' ? requestGenerated(table, parent, markers) : null;
        // 生成失败（如宿主没有 Canvas）回退当前自带款式；生成中与室内层保持中性坐标平面。
        const builtin = baseResolution.status === 'none' ? resolveBuiltinBasemap(builtinStyle(), timeBucket(sceneTime)) : null;
        const resolution = generated && generated.status !== 'failed'
            ? (generated.status === 'ready' ? { status: 'ok', url: generated.result.url, reason: '' } : { status: 'none', url: '', reason: '' })
            : builtin
                ? { status: 'ok', url: builtin.url, reason: '', ownTimeArt: builtin.ownTimeArt }
                : baseResolution.status === 'ok' ? { ...baseResolution, url: resolveMapTimeBasemap(baseResolution.url, timeBucket(sceneTime)) } : baseResolution;
        const invalidBasemap = table ? hasInvalidBasemap(table, parentId) : false;
        const basemapNotice = resolution.status === 'conflict' ? resolution.reason
            : generated?.status === 'failed' ? '地图生成失败，已使用内置地图'
                : invalidBasemap ? (baseResolution.status !== 'none' ? '底图地址不可用，已回退为坐标平面' : generated ? '底图地址不可用，已改用自动生成地图' : '底图地址不可用，已使用内置地图')
                    : basemapState === 'failed' ? '底图加载失败，已回退为坐标平面' : '';
        // 先同步底图状态机再拼 HTML，避免切层时残留上一层底图。
        const renders = renderCount;
        prepareBasemap(resolution);
        // 缓存图片可能同步触发 onload 并已完成一次完整重绘，外层这次就作废。
        if (!root || renders !== renderCount) return;
        const ownTimeArt = resolution.ownTimeArt ?? OWN_TIME_ART.test(resolution.url || '');
        const lighting = resolveMapLighting({ time: sceneTime, weather: sceneWeather, defaultHour: 12 });
        const lightsUrl = generated?.status === 'ready' ? generated.result.lightsUrl : resolution.status === 'ok' && !ownTimeArt ? requestMarkerLights(markers) : '';
        const lit = basemapState === 'ready' && Boolean(basemapUrl);
        const basemapFilter = lit ? mapBasemapFilter(lighting, { ownTimeArt }) : '';
        const sourceHtml = table && baseResolution.status === 'none' ? basemapSourceHtml(generated) : '';
        const pinsHtml = markers.map(({ loc, x, y, auto }) => {
            const pt = mapPinWorldPoint(x, y, world.width, world.height);
            const stateClass = [loc.id === hereId ? 'igs-map-current' : '', loc.id === selectedId ? 'igs-map-selected' : '', auto ? 'igs-map-auto' : ''].filter(Boolean).join(' ');
            const people = loc.characters || [];
            const peopleHtml = people.length ? `<span class="igs-map-people" aria-hidden="true">${people.slice(0, 3).map(name => `<i>${personInitial(name)}</i>`).join('')}${people.length > 3 ? `<i>+${people.length - 3}</i>` : ''}</span>` : '';
            const label = `查看${loc.name}${loc.id === hereId ? `（${hereTag}）` : ''}${people.length ? `，${people.length} 位角色在此` : ''}${auto ? '，位置为示意' : ''}`;
            return `<div class="igs-map-marker ${stateClass}" style="left:${pt.x}px;top:${pt.y}px">` +
                (loc.id === hereId ? `<span class="igs-map-here" aria-hidden="true">${escapeHtml(hereTag)}</span>` : '') +
                `<button type="button" data-map-act="select" data-map-id="${escapeHtml(loc.id)}" aria-label="${escapeHtml(label)}" ${loc.id === selectedId ? 'aria-current="location"' : ''}>${RECORD_ICONS.pin}</button><span class="igs-map-label">${escapeHtml(loc.name)}${peopleHtml}</span></div>`;
        }).join('');
        const diagnostics = table ? [...table.diagnostics, ...table.locations.flatMap(loc => loc.issues.map(issue => `${loc.name || `第${loc.rowIndex + 1}行`}: ${issue}`))] : [];
        const notice = model.status === 'read-error' ? `地图读取失败：${model.reason}` :
            model.status === 'no-tables' ? '未找到名称含“地图”或“地点”的表' : '';
        const detailLocation = place || (hereId ? table.locations.find(loc => loc.id === hereId) : current);
        const detailKicker = detailLocation && detailLocation.id === hereId ? hereTag
            : detailLocation && detailLocation.id === currentId ? '你在这里' : place ? '已选地点' : '当前位置';
        const detailAuto = Boolean(detailLocation && floating.includes(detailLocation));
        const detailSceneImage = sceneAssetUrl(detailLocation?.name || sceneName);
        const detailArtHtml = detailSceneImage ? `<img class="igs-map-detail-art" src="${escapeHtml(detailSceneImage)}" alt="" aria-hidden="true" draggable="false" referrerpolicy="no-referrer">` : '';
        const detailPeople = detailLocation?.characters || [];
        const peopleLabel = table?.place ? '位于此处的角色' : '在场人物';
        const peopleHtml = detailPeople.length ? `<div class="igs-map-card-people"><p>${peopleLabel}</p><div>${detailPeople.map(name => `<span class="igs-map-card-person"><span class="igs-map-card-person-avatar" aria-hidden="true">${personInitial(name)}</span><span>${escapeHtml(name)}</span></span>`).join('')}</div></div>` : '';
        const enterable = detailLocation && children.includes(detailLocation) && getMapChildren(table, detailLocation.id).length;
        const childButton = enterable
            ? `<button class="igs-map-card-secondary" type="button" data-map-act="enter" data-map-id="${escapeHtml(detailLocation.id)}">查看子地点</button>` : '';
        const travelButton = place && place.name && place.rowId && !place.issues.includes('地点ID重复')
            ? '<button class="igs-map-card-travel" type="button" data-map-act="travel">前往</button><small class="igs-map-card-note">将地点填入草稿，不会自动发送</small>' : '';
        const dismiss = place ? `<button type="button" class="igs-map-card-close" data-map-act="deselect" aria-label="收起详情">${CLOSE_ICON}</button>` : '';
        const card = detailLocation ? `<section class="igs-map-card">${dismiss}<p class="igs-map-card-kicker">${detailKicker}</p><h3>${escapeHtml(detailLocation.name || '未命名地点')}</h3>` +
            `<p class="igs-map-card-description">${escapeHtml(detailLocation.description || '暂无地点说明')}</p>${detailAuto ? '<p class="igs-map-card-note igs-map-card-auto">表格未记录坐标，图上位置仅为示意</p>' : ''}${peopleHtml}<div class="igs-map-card-actions">${childButton}${travelButton}</div></section>` : '';
        // 提示、生成进度与操作反馈合并成页头下方一行，地图上不再叠多块浮层。
        const status = [message, generated?.status === 'pending' ? '正在生成地图…' : '', notice, basemapNotice,
            table && !children.length ? '这一层没有子地点' : ''].filter(Boolean);
        const tool = (act, label, icon, extra = '') => `<button type="button" data-map-act="${act}" aria-label="${label}" title="${label}"${extra}>${icon}</button>`;
        const tools = `<div class="igs-map-tools">${tool('zoom-out', '缩小', RECORD_ICONS.zoomOut, ' class="igs-map-zoom"')}${tool('zoom-in', '放大', RECORD_ICONS.zoomIn, ' class="igs-map-zoom"')}` +
            tool('reset-view', '归位', RECORD_ICONS.locate) +
            (sourceHtml ? tool('toggle-source', '底图', RECORD_ICONS.layers, ` aria-expanded="${sourceOpen ? 'true' : 'false'}"`) : '') + '</div>';
        const levels = levelsHtml(table);
        root.innerHTML = `<div class="igs-rp-page igs-map-window">${recordPageHeadHtml('地点地图', { closeAttr: 'data-map-act', backAriaLabel: '关闭地图', trailing: tools })}` +
            (sourceHtml ? `<div class="igs-map-source-menu"${sourceOpen ? '' : ' hidden'}>${sourceHtml}</div>` : '') +
            `<div class="igs-map-top">${tabs}<p class="igs-map-status" role="status" aria-live="polite">${escapeHtml(status.join(' · '))}</p></div>` +
            '<div class="igs-rp-body igs-map-body"><div class="igs-map-main">' +
            `<div class="igs-map-viewport" aria-label="地图视口"><div class="igs-map-world${lit && !ownTimeArt ? ' is-lit' : ''}" style="width:${world.width}px;height:${world.height}px">` +
            (lit ? `<img class="igs-map-basemap" src="${escapeHtml(basemapUrl)}" alt="" draggable="false" referrerpolicy="no-referrer" width="${world.width}" height="${world.height}"${basemapFilter ? ` style="filter:${basemapFilter}"` : ''}>` + mapLightLayersHtml(lighting, { ownTimeArt, lightsUrl }) : '') +
            pinsHtml + '</div></div></div>' +
            `<aside class="igs-map-detail${card ? '' : ' is-empty'}${place ? '' : ' is-passive'}${levels ? ' has-levels' : ''}">${levels}${detailArtHtml}${card || '<p class="igs-map-detail-empty">点击地点查看详情</p>'}` +
            (diagnostics.length ? `<details><summary>地图数据提示（${diagnostics.length}）</summary><ul>${diagnostics.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>` : '') + '</aside></div></div>';
        const viewport = root.querySelector?.('.igs-map-viewport');
        bindViewportGestures(viewport);
        // 天气层跨重绘复用同一节点，粒子不会因点选指针而重新开始。
        if (weatherLayer && viewport?.appendChild) {
            viewport.appendChild(weatherLayer);
            applyWeatherFx(weatherLayer, { weather: sceneWeather, time: sceneTime, location: '', settings: normalizeWeatherFxSettings(weatherFxSettings) });
        }
        if (!camera && viewport) {
            const rect = viewport.getBoundingClientRect?.() || { width: 0, height: 0 };
            const viewW = rect.width || world.width;
            const viewH = rect.height || world.height;
            camera = fitMapCamera(viewW, viewH, world.width, world.height, 'cover');
            baseK = camera.k;
            // 首次镜头与「归位」对准当前地点（其次是已选地点），竖屏裁切时也能看到“你在这里”。
            const focus = markers.find(item => item.loc.id === hereId) || markers.find(item => item.loc.id === selectedId);
            if (focus) {
                const pt = mapPinWorldPoint(focus.x, focus.y, world.width, world.height);
                camera = centerMapCamera(camera, viewW, viewH, world.width, world.height, pt.x, pt.y);
            }
        }
        if (camera) applyCamera();
    }

    // 生成与点灯任务完成后只重绘一次；面板已关闭则丢弃结果（缓存仍保留供下次打开）。
    function track(entry, key) {
        if (entry.status !== 'pending' || pendingKey === key) return;
        pendingKey = key;
        entry.promise.then(() => {
            if (pendingKey !== key) return;
            pendingKey = '';
            if (root) render();
        });
    }

    // 进入子层后，详情面板顶部显示层级路径：返回上级按钮 + 可点任意上层直接跳回；顶层不显示。
    function levelsHtml(table) {
        if (!table || !parentId) return '';
        const chain = [...mapAncestors(table, parentId).reverse(), parentId];
        const crumbs = [{ id: '', name: table.name || '地图' }, ...chain.map(id => ({ id, name: table.locations.find(loc => loc.id === id)?.name || '未命名地点' }))];
        const up = crumbs[crumbs.length - 2];
        const back = up ? `<button type="button" class="igs-map-levels-back" data-map-act="back" aria-label="返回上级：${escapeHtml(up.name)}">${RECORD_ICONS.back}</button>` : '';
        const trail = crumbs.map((crumb, index) => index === crumbs.length - 1
            ? `<span aria-current="page">${escapeHtml(crumb.name)}</span>`
            : `<button type="button" data-map-act="level" data-map-id="${escapeHtml(crumb.id)}">${escapeHtml(crumb.name)}</button>`).join('<i aria-hidden="true">›</i>');
        return `<nav class="igs-map-levels" aria-label="地图层级">${back}<div class="igs-map-levels-trail">${trail}</div></nav>`;
    }

    // 底图来源卡：本层表格没有底图时出现。上排切换「生成 / 自带」，下排按来源显示款式或“已固定 · 第 N 张”。
    function basemapSourceHtml(generated) {
        const source = basemapSource();
        const tab = (id, label) => `<button type="button" data-map-act="basemap-source" data-map-id="${id}" aria-pressed="${source === id ? 'true' : 'false'}">${label}</button>`;
        let sub;
        if (source === 'builtin') {
            const current = builtinStyle();
            sub = MAP_BUILTIN_BASEMAPS.length > 1
                ? MAP_BUILTIN_BASEMAPS.map(style => `<button type="button" class="igs-map-source-chip" data-map-act="basemap-style" data-map-id="${escapeHtml(style.id)}" aria-pressed="${style.id === current.id ? 'true' : 'false'}">${escapeHtml(style.name)}</button>`).join('')
                : `<span class="igs-map-source-state">款式：${escapeHtml(current.name)}</span>`;
        } else if (generated?.status === 'skipped') {
            sub = '<span class="igs-map-source-state">室内层不生成地图</span>';
        } else if (generated?.status === 'failed') {
            sub = `<span class="igs-map-source-state">生成失败，暂用「${escapeHtml(builtinStyle().name)}」</span>`;
        } else {
            const salt = readSalt();
            const state = generated?.status === 'pending' ? '生成中…' : `已固定 · 第 ${salt + 1} 张`;
            sub = `<span class="igs-map-source-state" title="本对话每次打开都是这张图；新增地点只改动它附近">${state}</span>`
                + (salt > 0 ? '<button type="button" class="igs-map-source-chip" data-map-act="reroll-back">上一张</button>' : '')
                + `<button type="button" class="igs-map-source-chip" data-map-act="reroll">${RECORD_ICONS.shuffle}<span>换一张</span></button>`;
        }
        return `<div class="igs-map-source" role="group" aria-label="底图"><div class="igs-map-source-switch">${tab('auto', '生成地图')}${tab('builtin', '自带底图')}</div><div class="igs-map-source-sub">${sub}</div></div>`;
    }

    function ensureGenerator() {
        generator ||= createMapBasemapGenerator({ doc });
        return generator;
    }

    function requestGenerated(table, parent, markers) {
        const input = buildMapGenInput({
            chatId: getChatId(), tableUid: table.uid, parentId: parentId || '', salt: readSalt(), parentName: parent?.name || '',
            points: markers.map(({ loc, x, y }) => ({ id: loc.id, name: loc.name, description: loc.description, x, y })),
            themeTexts: table.locations.flatMap(loc => [loc.name, loc.description]),
        });
        generation = { status: 'pending', key: input.key, theme: input.theme, scale: input.scale };
        // 室内层（楼层 / 房间）不套城市底图，保持中性坐标平面。
        if (input.scale !== 'city') { generation.status = 'skipped'; return { status: 'skipped', result: null }; }
        const entry = ensureGenerator().request(input);
        generation.status = entry.status;
        track(entry, input.key);
        return entry;
    }

    function requestMarkerLights(markers) {
        if (!markers.length) return '';
        const input = buildMarkerLightsInput(markers.map(({ x, y }) => ({ x, y })), MAP_FALLBACK_WORLD.width, MAP_FALLBACK_WORLD.height);
        const entry = ensureGenerator().request(input);
        track(entry, input.key);
        return entry.status === 'ready' ? entry.result.lightsUrl : '';
    }

    function dispose() {
        close();
        generator?.dispose();
        generator = null;
    }

    return { open, close, dispose, reload, isOpen: () => Boolean(root), getState: () => ({ model, activeUid, parentId, selectedId, currentId, sceneName, sceneTime, sceneWeather, message, basemapState, basemapUrl, basemapSource: basemapSource(), generation: { ...generation }, camera }) };
}
