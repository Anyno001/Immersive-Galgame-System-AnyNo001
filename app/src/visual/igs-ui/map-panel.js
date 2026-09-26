import { createShujukuClient } from '../../data/shujuku/client.js';
import { getMapChildren, hasInvalidBasemap, locateMapScene, readMapModel, resolveMapBasemap, sanitizeMapBasemapUrl } from '../../data/shujuku/map-model.js';
import { normalizeMapTime, resolveMapTimeBasemap } from '../../data/shujuku/map-time.js';
import { applyTransparentGlassMaterial } from '../../styles/glass-material.js';
import { lookupSceneAssetUrls } from '../../scene/scene-directives.js';
import { RECORD_ICONS } from './record-icons.js';
import { recordPageHeadHtml, watchRecordPageLayout } from './record-page-shell.js';
import { MAP_FALLBACK_WORLD, autoPlaceMapPoints, centerMapCamera, fitMapCamera, mapPinWorldPoint, panMapCamera, zoomMapCamera } from './map-viewport.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const personInitial = value => escapeHtml(String(value ?? '').trim().charAt(0) || '·');
const DEFAULT_MAP_BASEMAP = new URL('../../../fixtures/record-pages/assets/map-demo-clean-night.png', import.meta.url).href;

export function createMapPanelController(doc, global, fillDraft) {
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
    let sceneAssets = null;
    let message = '';
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

    function open(overlay, settings, scene = '', time = '') {
        if (root) return { ok: true, reason: 'already-open' };
        if (!overlay || !doc?.createElement) return { ok: false, reason: 'missing-map-container' };
        message = '';
        const container = overlay.querySelector?.('#igs-db-layer') || overlay;
        previousFocus = doc.activeElement || null;
        sceneName = String(scene || '').trim();
        sceneTime = String(time || '').trim();
        sceneAssets = settings?._sceneAssets || settings?.sceneAssets || null;
        pageOverlay = overlay;
        currentId = null;
        root = doc.createElement('div');
        root.id = 'igs-map-panel';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '地点地图');
        root.setAttribute('data-map-time', normalizeMapTime(sceneTime) || 'night');
        root.addEventListener('click', onClick);
        container.appendChild(root);
        overlay.classList?.toggle('igs-record-screen-open', true);
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
        unwatchLayout?.();
        unwatchLayout = null;
        root.removeEventListener('click', onClick);
        root.remove();
        root = null;
        pageOverlay?.classList?.remove('igs-record-screen-open');
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
            if (selectedId !== id || !selected() || !getMapChildren(activeTable(), id).length) return;
            parentId = id; selectedId = null; message = ''; camera = null;
        }
        if (action === 'back') {
            parentId = activeTable()?.locations.find(loc => loc.id === parentId)?.parentId || null;
            selectedId = null; message = ''; camera = null;
        }
        if (action === 'travel') return travel();
        if (action === 'zoom-in') zoomViewport(1.4);
        if (action === 'zoom-out') zoomViewport(1 / 1.4);
        if (action === 'reset-view') { camera = null; applyCamera(); }
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
        const tabs = model.tables.length > 1 ? `<nav class="igs-map-tabs" aria-label="选择地图">${model.tables.map(item =>
            `<button type="button" class="igs-rp-chip" aria-pressed="${item.uid === activeUid ? 'true' : 'false'}" data-map-act="table" data-map-id="${escapeHtml(item.uid)}" ${item.uid === activeUid ? 'aria-current="true"' : ''}>${escapeHtml(item.name)}</button>`).join('')}</nav>` : '';
        const baseResolution = table ? resolveMapBasemap(table, parentId) : { status: 'none', url: '', reason: '' };
        const resolution = baseResolution.status === 'none'
            ? { status: 'ok', url: resolveMapTimeBasemap(DEFAULT_MAP_BASEMAP, sceneTime), reason: '' }
            : baseResolution.status === 'ok' ? { ...baseResolution, url: resolveMapTimeBasemap(baseResolution.url, sceneTime) } : baseResolution;
        const invalidBasemap = table ? hasInvalidBasemap(table, parentId) : false;
        const basemapNotice = resolution.status === 'conflict' ? resolution.reason
            : invalidBasemap ? (baseResolution.status === 'none' ? '底图地址不可用，已使用内置地图' : '底图地址不可用，已回退为坐标平面')
                : basemapState === 'failed' ? '底图加载失败，已回退为坐标平面' : '';
        const pinsHtml = markers.map(({ loc, x, y, auto }) => {
            const pt = mapPinWorldPoint(x, y, world.width, world.height);
            const stateClass = [loc.id === currentId ? 'igs-map-current' : '', loc.id === selectedId ? 'igs-map-selected' : '', auto ? 'igs-map-auto' : ''].filter(Boolean).join(' ');
            const people = loc.characters || [];
            const peopleHtml = people.length ? `<span class="igs-map-people" aria-hidden="true">${people.slice(0, 3).map(name => `<i>${personInitial(name)}</i>`).join('')}${people.length > 3 ? `<i>+${people.length - 3}</i>` : ''}</span>` : '';
            const label = `查看${loc.name}${loc.id === currentId ? '（你在这里）' : ''}${people.length ? `，${people.length} 位角色在此` : ''}${auto ? '，位置为示意' : ''}`;
            return `<div class="igs-map-marker ${stateClass}" style="left:${pt.x}px;top:${pt.y}px">` +
                (loc.id === currentId ? '<span class="igs-map-here" aria-hidden="true">你在这里</span>' : '') +
                `<button type="button" data-map-act="select" data-map-id="${escapeHtml(loc.id)}" aria-label="${escapeHtml(label)}" ${loc.id === selectedId ? 'aria-current="location"' : ''}>${RECORD_ICONS.pin}</button><span class="igs-map-label">${escapeHtml(loc.name)}${peopleHtml}</span></div>`;
        }).join('');
        const diagnostics = table ? [...table.diagnostics, ...table.locations.flatMap(loc => loc.issues.map(issue => `${loc.name || `第${loc.rowIndex + 1}行`}: ${issue}`))] : [];
        const notice = model.status === 'read-error' ? `地图读取失败：${model.reason}` :
            model.status === 'no-tables' ? '未找到名称含“地图”或“地点”的表' : '';
        const detailLocation = place || current;
        const detailKicker = detailLocation && detailLocation.id === currentId ? '你在这里' : place ? '已选地点' : '当前位置';
        const detailAuto = Boolean(detailLocation && floating.includes(detailLocation));
        const detailSceneImage = sceneAssetUrl(detailLocation?.name || sceneName);
        const detailArtHtml = detailSceneImage ? `<img class="igs-map-detail-art" src="${escapeHtml(detailSceneImage)}" alt="" aria-hidden="true" draggable="false" referrerpolicy="no-referrer">` : '';
        const detailPeople = detailLocation?.characters || [];
        const peopleLabel = table?.place ? '位于此处的角色' : '在场人物';
        const peopleHtml = detailPeople.length ? `<div class="igs-map-card-people"><p>${peopleLabel}</p><div>${detailPeople.map(name => `<span class="igs-map-card-person"><span class="igs-map-card-person-avatar" aria-hidden="true">${personInitial(name)}</span><span>${escapeHtml(name)}</span></span>`).join('')}</div></div>` : '';
        const childButton = place && getMapChildren(table, place.id).length
            ? `<button class="igs-map-card-secondary" type="button" data-map-act="enter" data-map-id="${escapeHtml(place.id)}">查看子地点</button>` : '';
        const travelButton = place && place.name && place.rowId && !place.issues.includes('地点ID重复')
            ? '<button class="igs-map-card-travel" type="button" data-map-act="travel">前往</button><small class="igs-map-card-note">将地点填入草稿，不会自动发送</small>' : '';
        const card = detailLocation ? `<section class="igs-map-card"><p class="igs-map-card-kicker">${detailKicker}</p><h3>${escapeHtml(detailLocation.name || '未命名地点')}</h3>` +
            `<p class="igs-map-card-description">${escapeHtml(detailLocation.description || '暂无地点说明')}</p>${detailAuto ? '<p class="igs-map-card-note igs-map-card-auto">表格未记录坐标，图上位置仅为示意</p>' : ''}${peopleHtml}<div class="igs-map-card-actions">${childButton}${travelButton}</div></section>` : '';
        const notes = [notice, basemapNotice, table && !children.length ? '这一层没有子地点' : ''].filter(Boolean);
        root.innerHTML = `<div class="igs-rp-page igs-map-window">${recordPageHeadHtml('地点地图', { closeAttr: 'data-map-act', backAriaLabel: '关闭地图' })}` +
            tabs + `<div class="igs-rp-body igs-map-body"><div class="igs-map-main"><div class="igs-map-overlay-top">${parentId ? `<button type="button" class="igs-rp-chip igs-map-back" data-map-act="back">${RECORD_ICONS.back}<span>返回上级：${escapeHtml(parent?.name || table?.name || '地图')}</span></button>` : ''}` +
            notes.map(text => `<p class="igs-rp-notice" role="status">${escapeHtml(text)}</p>`).join('') + '</div>' +
            `<div class="igs-map-viewport" aria-label="地图视口"><div class="igs-map-world" style="width:${world.width}px;height:${world.height}px">` +
            (basemapState === 'ready' && basemapUrl ? `<img class="igs-map-basemap" src="${escapeHtml(basemapUrl)}" alt="" draggable="false" referrerpolicy="no-referrer" width="${world.width}" height="${world.height}">` : '') +
            pinsHtml + `</div><div class="igs-map-controls"><button type="button" data-map-act="zoom-in" aria-label="放大">${RECORD_ICONS.zoomIn}</button><button type="button" data-map-act="zoom-out" aria-label="缩小">${RECORD_ICONS.zoomOut}</button><button type="button" data-map-act="reset-view" aria-label="归位">${RECORD_ICONS.locate}</button></div>` +
            `<p class="igs-map-hint">拖动浏览 · 点击定位针查看</p></div>` +
            `<p class="igs-map-feedback" role="status" aria-live="polite">${escapeHtml(message)}</p>` +
            '</div>' +
            `<aside class="igs-map-detail${card ? '' : ' is-empty'}">${detailArtHtml}${card || '<p class="igs-map-detail-empty">选择地点查看详情</p>'}` +
            (diagnostics.length ? `<details><summary>地图数据提示（${diagnostics.length}）</summary><ul>${diagnostics.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>` : '') + '</aside></div></div>';
        const viewport = root.querySelector?.('.igs-map-viewport');
        bindViewportGestures(viewport);
        prepareBasemap(resolution);
        if (!camera && viewport) {
            const rect = viewport.getBoundingClientRect?.() || { width: 0, height: 0 };
            const viewW = rect.width || world.width;
            const viewH = rect.height || world.height;
            camera = fitMapCamera(viewW, viewH, world.width, world.height, 'cover');
            baseK = camera.k;
            // 首次镜头与「归位」对准当前地点（其次是已选地点），竖屏裁切时也能看到“你在这里”。
            const focus = markers.find(item => item.loc.id === currentId) || markers.find(item => item.loc.id === selectedId);
            if (focus) {
                const pt = mapPinWorldPoint(focus.x, focus.y, world.width, world.height);
                camera = centerMapCamera(camera, viewW, viewH, world.width, world.height, pt.x, pt.y);
            }
        }
        if (camera) applyCamera();
    }

    return { open, close, reload, isOpen: () => Boolean(root), getState: () => ({ model, activeUid, parentId, selectedId, currentId, sceneName, sceneTime, message, basemapState, basemapUrl, camera }) };
}
