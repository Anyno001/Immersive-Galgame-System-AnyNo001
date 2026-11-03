// 战斗敌人图集：下载与管理。
// 图集不进 bundle，用户在设置页点击「下载」后才从 jsDelivr 的固定 tag 地址拉取，
// 图片本体经现有的酒馆图片存储（user/images/igs-media/）落盘，这里只记录路径清单。
import { createTavernImageFiles } from '../../media/tavern-image-files.js';
import { isImagePath, normalizeImagePath } from '../../media/image-identity.js';
import { esc } from './reader-value-utils.js';

const REPOSITORY = 'Anyno001/Immersive-Galgame-System-AnyNo001';
// 图集所在的固定发布 tag。仓库里 app/assets/combat-enemy-atlas/ 必须在该 tag 下存在。
export const ENEMY_ATLAS_TAG = 'v0.39.4';
export const ENEMY_ATLAS_STORAGE_KEY = 'igs-combat-enemy-atlas';
export const ENEMY_ATLAS_COLS = 6;
// 三张图集各自的行数，与 v0.39 保持一致。
export const ENEMY_ATLAS_ROWS = Object.freeze({ western: 6, urban: 3, wuxia: 3 });
export const ENEMY_ATLAS_THEMES = Object.freeze(Object.keys(ENEMY_ATLAS_ROWS));
// 约略体积（字节），仅用于设置页提示。
export const ENEMY_ATLAS_APPROX_BYTES = 434394;
const ATLAS_VAR = theme => `--igs-enemy-atlas-${theme}`;

export const ENEMY_ATLAS_REASONS = Object.freeze({
    network: '网络错误',
    'cdn-404': 'CDN上找不到图集文件',
    storage: '存储失败',
});

export function enemyAtlasUrl(theme, tag = ENEMY_ATLAS_TAG) {
    return `https://cdn.jsdelivr.net/gh/${REPOSITORY}@${tag}/app/assets/combat-enemy-atlas/${theme}.webp`;
}

function failure(reason, detail = '') {
    return Object.assign(new Error(detail || reason), { reason });
}

function bytesToDataUrl(bytes, globalObject) {
    const encode = globalObject.btoa || globalThis.btoa;
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return `data:image/webp;base64,${encode(binary)}`;
}

function localManifestStore(globalObject) {
    const storage = () => { try { return globalObject.localStorage || null; } catch { return null; } };
    return {
        load() { try { return JSON.parse(storage()?.getItem(ENEMY_ATLAS_STORAGE_KEY) || 'null'); } catch { return null; } },
        save(value) { storage()?.setItem(ENEMY_ATLAS_STORAGE_KEY, JSON.stringify(value)); },
        clear() { storage()?.removeItem(ENEMY_ATLAS_STORAGE_KEY); },
    };
}

// 依赖都可注入：fetchImpl、files（offload / release / dropUnused）、manifestStore（load / save / clear）。
export function createEnemyAtlasManager(options = {}) {
    const globalObject = options.globalObject || globalThis;
    const tag = options.tag || ENEMY_ATLAS_TAG;
    const fetchImpl = options.fetch || ((...args) => globalObject.fetch(...args));
    const files = options.files || createTavernImageFiles(globalObject, 'igs-media');
    const store = options.manifestStore || localManifestStore(globalObject);
    const listeners = new Set();
    let installed = {};
    let phase = 'idle';
    let error = null;
    let running = null;

    function restore() {
        const saved = store.load();
        installed = {};
        if (!saved || typeof saved !== 'object' || !saved.files) return;
        for (const theme of ENEMY_ATLAS_THEMES) {
            const path = saved.files[theme];
            if (isImagePath(path)) installed[theme] = normalizeImagePath(path);
        }
    }
    const notify = () => { for (const listener of [...listeners]) { try { listener(); } catch { /* 订阅方出错不影响状态 */ } } };
    const complete = () => ENEMY_ATLAS_THEMES.every(theme => installed[theme]);

    async function fetchTheme(theme) {
        let response;
        try { response = await fetchImpl(enemyAtlasUrl(theme, tag), { cache: 'force-cache' }); }
        catch (cause) { throw failure('network', `${theme}：${cause?.message || '请求失败'}`); }
        if (response?.status === 404) throw failure('cdn-404', theme);
        if (!response?.ok) throw failure('network', `${theme}：HTTP ${response?.status ?? '未知'}`);
        let bytes;
        try { bytes = new Uint8Array(await response.arrayBuffer()); }
        catch (cause) { throw failure('network', `${theme}：${cause?.message || '读取失败'}`); }
        const head = String.fromCharCode(...bytes.subarray(0, 4)) + String.fromCharCode(...bytes.subarray(8, 12));
        if (head !== 'RIFFWEBP') throw failure('network', `${theme}：下载内容不是有效的 webp 图片`);
        return bytes;
    }
    async function storeTheme(theme, bytes) {
        let record;
        try { record = await files.offload({ dataUrl: bytesToDataUrl(bytes, globalObject) }, theme, null); }
        catch (cause) { throw failure('storage', `${theme}：${cause?.message || '写入失败'}`); }
        if (!isImagePath(record?.dataUrl)) throw failure('storage', `${theme}：酒馆图片存储不可用`);
        return record;
    }

    async function runInstall() {
        phase = 'downloading'; error = null; notify();
        const fresh = {};
        const records = {};
        try {
            for (const theme of ENEMY_ATLAS_THEMES) {
                if (installed[theme]) continue;
                const record = await storeTheme(theme, await fetchTheme(theme));
                records[theme] = record;
                fresh[theme] = normalizeImagePath(record.dataUrl);
            }
            const next = { ...installed, ...fresh };
            try { store.save({ tag, files: next, installedAt: Date.now() }); }
            catch (cause) { throw failure('storage', `清单写入失败：${cause?.message || ''}`); }
            installed = next;
            phase = 'idle';
        } catch (cause) {
            // 全有或全无：失败时撤销本次新写入的文件，已有的保持不变。
            for (const record of Object.values(records)) await Promise.resolve(files.dropUnused(record, {})).catch(() => {});
            phase = 'failed';
            error = { reason: ENEMY_ATLAS_REASONS[cause?.reason] ? cause.reason : 'network', message: cause?.message || '' };
        } finally {
            for (const record of Object.values(records)) await Promise.resolve(files.release(record)).catch(() => {});
        }
        notify();
        return manager.status();
    }

    const manager = {
        // 状态：missing 未安装 / downloading 下载中 / installed 已安装 / failed 失败。
        status() {
            const state = phase === 'downloading' ? 'downloading' : complete() ? 'installed' : phase === 'failed' ? 'failed' : 'missing';
            return { state, tag, reason: state === 'failed' ? error.reason : '', reasonText: state === 'failed' ? ENEMY_ATLAS_REASONS[error.reason] : '', detail: state === 'failed' ? error.message : '' };
        },
        isInstalled: () => complete(),
        url: theme => installed[theme] ? `/${installed[theme]}` : '',
        // 只在用户点击时调用；并发调用共享同一次下载。
        download() { if (!running) running = runInstall().finally(() => { running = null; }); return running; },
        async remove() {
            if (running) await running.catch(() => {});
            const old = installed;
            installed = {}; phase = 'idle'; error = null;
            store.clear();
            // 文件回收失败不影响已清除的安装记录，图片由存储层稍后重试回收。
            for (const path of Object.values(old)) await Promise.resolve(files.dropUnused({ dataUrl: path }, {})).catch(() => {});
            notify();
            return manager.status();
        },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    };
    restore();
    return manager;
}

let current = null;
export function getEnemyAtlas() { return current; }
export function setEnemyAtlas(manager) { current = manager || null; return current; }
// 首次用到时创建管理器（读回已安装清单），并把图集变量写到文档根节点、随下载 / 删除更新；设置页与战斗面板共用同一个。
export function ensureEnemyAtlas(globalObject = globalThis) {
    if (current) return current;
    const manager = setEnemyAtlas(createEnemyAtlasManager({ globalObject }));
    bindEnemyAtlasVars(globalObject?.document?.documentElement, manager);
    return manager;
}
export function enemyAtlasUrlOf(theme) { return current?.url(theme) || ''; }

// 把已安装的图集地址写成根节点上的 CSS 变量，样式文本只引用变量，不内嵌图片。
export function applyEnemyAtlasVars(root, manager = current) {
    if (!root?.style || !manager) return;
    for (const theme of ENEMY_ATLAS_THEMES) {
        const url = manager.url(theme);
        if (url) root.style.setProperty(ATLAS_VAR(theme), `url("${url}")`);
        else root.style.removeProperty(ATLAS_VAR(theme));
    }
}
export function bindEnemyAtlasVars(root, manager = current) {
    if (!manager) return () => {};
    applyEnemyAtlasVars(root, manager);
    return manager.subscribe(() => applyEnemyAtlasVars(root, manager));
}
export const enemyAtlasVarName = ATLAS_VAR;

const STATUS_TEXT = Object.freeze({
    missing: '未安装',
    downloading: '下载中',
    installed: '已安装',
    failed: '下载失败',
});
const sizeText = `约${(ENEMY_ATLAS_APPROX_BYTES / 1048576).toFixed(1)}MB`;

// 设置项：状态、下载、删除。按钮由设置页的 data-action 分发，接线见交接文档。
export function renderCombatEnemyAtlasField(manager = current) {
    const info = manager ? manager.status() : { state: 'missing' };
    const busy = info.state === 'downloading';
    const note = info.state === 'failed'
        ? `${STATUS_TEXT.failed}：${info.reasonText}${info.detail ? `（${info.detail}）` : ''}。`
        : info.state === 'installed' ? `已保存到酒馆图片目录，版本${info.tag}。`
            : info.state === 'downloading' ? '正在从jsDelivr拉取，请勿关闭页面。'
                : `敌人立绘图集${sizeText}，仅在点击下载后才会从仓库拉取。未安装时战斗使用中性剪影。`;
    return '<div class="igs-settings-section" data-combat-enemy-atlas>'
        + `<div class="igs-settings-row"><span>敌人图集</span><b data-result="combat-enemy-atlas">${esc(STATUS_TEXT[info.state] || STATUS_TEXT.missing)}</b></div>`
        + `<div class="igs-source-filter-note">${esc(note)}</div>`
        + '<div class="igs-settings-row">'
        + `<button class="igs-settings-action" data-action="combat-enemy-atlas-download" type="button"${busy || info.state === 'installed' ? ' disabled' : ''}>${info.state === 'failed' ? '重新下载' : '下载'}</button>`
        + `<button class="igs-settings-action is-danger" data-action="combat-enemy-atlas-remove" type="button"${busy || info.state === 'missing' ? ' disabled' : ''}>删除</button>`
        + '</div></div>';
}
