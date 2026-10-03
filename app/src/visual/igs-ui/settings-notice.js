// 设置面板内的失败提示：保存失败、动作抛异常时在面板底部弹一条，几秒后自动收起。
// 面板重绘会整体替换 innerHTML，所以提示内容记在调用方状态里，由 remountSettingsNotice 在重绘后补回。
export const SETTINGS_NOTICE_MS = 6000;
const SAVE_FAILURE_REASONS = new Set(['save-failed', 'generated-asset-persist-failed', 'legacy-storage-write-failed', 'store-write-failed']);

export const SETTINGS_NOTICE_STYLE_TEXT = `
#igs-unified-settings .igs-settings-notice{position:absolute;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:3;max-width:min(520px,calc(100% - 48px));padding:10px 16px;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-danger,#c0392b);color:#fff;font-size:13px;line-height:1.5;pointer-events:auto;}
#igs-unified-settings .igs-settings-notice.is-info{background:var(--igs-settings-raised);color:var(--igs-settings-ink);border:1px solid var(--igs-settings-line-strong)}
#igs-unified-settings .igs-settings-shell>.igs-settings-progress{position:absolute;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2;width:max-content;min-width:148px;max-width:min(240px,calc(100% - 48px));margin:0;padding:10px 18px 12px;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-raised);color:var(--igs-settings-ink);box-shadow:var(--igs-settings-shell-shadow);font-size:13px;font-weight:500;letter-spacing:.04em;line-height:1.4;text-align:center;pointer-events:none}
#igs-unified-settings .igs-settings-progress-track{height:3px;margin-top:8px;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-field);overflow:hidden}
#igs-unified-settings .igs-settings-progress-fill{height:100%;width:0;border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-accent)}
#igs-unified-settings .igs-settings-progress.is-writing .igs-settings-progress-fill{width:38%;animation:igs-settings-progress-slide 1.1s ease-in-out infinite}
@keyframes igs-settings-progress-slide{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}
`;

export function isQuotaError(error) {
    if (!error) return false;
    const name = String(error.name || '');
    const message = String(error.message || error.reason || error || '');
    return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || Number(error.code) === 22 || /quota|exceeded the quota/i.test(message);
}

export function describeSaveError(error) {
    if (!error) return '未知原因';
    if (isQuotaError(error)) return '浏览器本地存储已满。可以删掉不用的素材条目后再试，生成的图片存在另一处，不受影响';
    const message = typeof error === 'string' ? error : String(error.message || error.reason || '').trim();
    return message || '未知原因';
}

// 只对「确实没存上」或「动作本身抛错」给提示；正常的 ok:false（已经排第一、没有文件之类）交给面板自己的状态文字。
export function describeSettingsFailure(result) {
    if (!result || typeof result !== 'object' || result.ok !== false) return '';
    if (result.thrown) return `操作失败：${describeSaveError(result.thrown)}`;
    if (result.saveError || SAVE_FAILURE_REASONS.has(result.reason)) {
        const detail = describeSaveError(result.saveError || result.message || result.reason);
        return `保存失败：${detail}${result.rollbackFailed ? '。部分设置可能已写入，请勿关闭设置，检查后重试' : ''}`;
    }
    return '';
}

export function remountSettingsNotice(container, notice, now = Date.now()) {
    if (!container || typeof container.querySelector !== 'function') return null;
    const host = container.querySelector('#igs-unified-settings') || container;
    const existing = host.querySelector('.igs-settings-notice');
    if (!notice || !notice.message || now >= notice.until) {
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        return null;
    }
    const doc = container.ownerDocument;
    const el = existing || (doc && typeof doc.createElement === 'function' ? doc.createElement('div') : null);
    if (!el) return null;
    el.className = notice.tone === 'info' ? 'igs-settings-notice is-info' : 'igs-settings-notice';
    el.setAttribute('role', notice.tone === 'info' ? 'status' : 'alert');
    el.textContent = notice.message;
    if (!existing) host.appendChild(el);
    return el;
}

// 需要等网络的设置动作：点击后按钮先禁用并换成进行中文案，动作结束（面板重绘或原按钮仍在时复原）前不接受重复点击。
const SETTINGS_BUSY_LABELS = Object.freeze({
    'test-image': '测试中…',
    'fetch-llm-models': '拉取中…',
    'fetch-image-models': '拉取中…',
    'mood-review-ai-classify': '分类中…',
});

export function settingsBusyLabel(action) {
    const name = String(action || '');
    if (SETTINGS_BUSY_LABELS[name]) return SETTINGS_BUSY_LABELS[name];
    if (/^(?:char-generate-sprite|outfit-generate-nude|status-avatar-generate|(?:char|outfit)-expression-retry):/.test(name)) return '生图中';
    return '';
}

// 表情差分写词和逐张出图都要几分钟。进度条挂在设置层上，面板重绘前一直看得见。
// 面板重绘会冲掉进度条；单张重画只报一次进度，所以记住最后一次，重绘后由 remountSettingsProgress 补回。
let liveProgress = null;

// 同时画好几格时进度条只有一条：按任务记着，全部结束才收起，免得先画完的那格把还在画的进度一起清掉。
const progressTasks = new Map();
let progressTaskSeq = 0;

function progressTaskSummary() {
    const texts = [...progressTasks.values()].filter(Boolean);
    if (!texts.length) return null;
    const text = texts.length === 1 ? texts[0] : `${texts[texts.length - 1]}（共 ${texts.length} 项在画）`;
    return { text, indeterminate: true, button: '生图中' };
}

// getHost 每次现取：任务跑着时面板可能重绘或关掉。返回 { update(text), end() }。
export function beginSettingsProgress(getHost, text) {
    const id = ++progressTaskSeq;
    const host = () => (typeof getHost === 'function' ? getHost() : getHost);
    const refresh = () => showSettingsProgress(host(), progressTaskSummary());
    progressTasks.set(id, String(text || '生图中'));
    refresh();
    return {
        update(next) {
            if (!progressTasks.has(id) || !next) return;
            progressTasks.set(id, String(next));
            refresh();
        },
        end() {
            if (!progressTasks.delete(id)) return;
            refresh();
        },
    };
}

export function remountSettingsProgress(container) {
    return liveProgress ? showSettingsProgress(container, liveProgress) : null;
}

export function showSettingsProgress(container, progress) {
    liveProgress = progress && progress.text ? progress : null;
    if (!container || typeof container.querySelector !== 'function') return null;
    const host = container.id === 'igs-unified-settings'
        ? container
        : (container.querySelector('#igs-unified-settings') || container);
    const existing = host.querySelector('.igs-settings-progress');
    if (!progress || !progress.text) {
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
        return null;
    }
    const doc = host.ownerDocument;
    if ((!existing) && (!doc || typeof doc.createElement !== 'function')) return null;
    const shell = host.querySelector('.igs-settings-shell');
    const parent = shell || host;
    const el = existing || doc.createElement('div');
    const writing = progress.indeterminate === true;
    el.className = `igs-settings-progress${writing ? ' is-writing' : ''}`;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    let textEl = el.querySelector('.igs-settings-progress-text');
    let track = el.querySelector('.igs-settings-progress-track');
    let fill = el.querySelector('.igs-settings-progress-fill');
    if (!textEl || !track || !fill) {
        textEl = doc.createElement('div');
        textEl.className = 'igs-settings-progress-text';
        track = doc.createElement('div');
        track.className = 'igs-settings-progress-track';
        track.setAttribute('aria-hidden', 'true');
        fill = doc.createElement('div');
        fill.className = 'igs-settings-progress-fill';
        if (fill.style) fill.style.width = '0%';
        track.appendChild(fill);
        el.appendChild(textEl);
        el.appendChild(track);
    }
    textEl.textContent = progress.text;
    const ratio = writing ? 0 : Math.max(0, Math.min(1, Number(progress.ratio) || 0));
    fill.setAttribute('data-ratio', String(ratio));
    if (fill.style) fill.style.width = writing ? '' : `${Math.round(ratio * 100)}%`;
    if (el.parentNode !== parent) parent.appendChild(el);
    if (progress.button) {
        const busy = host.querySelector('[aria-busy="true"]');
        if (busy) busy.textContent = progress.button;
    }
    return el;
}

export function markSettingsButtonBusy(button, label) {
    if (!button || !label) return () => {};
    const previous = { text: button.textContent, disabled: button.disabled === true };
    button.disabled = true;
    if (typeof button.setAttribute === 'function') button.setAttribute('aria-busy', 'true');
    button.textContent = label;
    return () => {
        if (button.isConnected === false) return;
        button.disabled = previous.disabled;
        if (typeof button.removeAttribute === 'function') button.removeAttribute('aria-busy');
        button.textContent = previous.text;
    };
}
