// 设置面板内的失败提示：保存失败、动作抛异常时在面板底部弹一条，几秒后自动收起。
// 面板重绘会整体替换 innerHTML，所以提示内容记在调用方状态里，由 remountSettingsNotice 在重绘后补回。
export const SETTINGS_NOTICE_MS = 6000;
const SAVE_FAILURE_REASONS = new Set(['save-failed', 'generated-asset-persist-failed', 'legacy-storage-write-failed', 'store-write-failed']);

export const SETTINGS_NOTICE_STYLE_TEXT = `
#igs-unified-settings .igs-settings-notice{position:absolute;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:3;max-width:min(520px,calc(100% - 48px));padding:10px 16px;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-danger,#c0392b);color:#fff;font-size:13px;line-height:1.5;pointer-events:auto;}
#igs-unified-settings .igs-settings-shell>.igs-settings-progress{position:static;left:auto;right:auto;bottom:auto;transform:none;z-index:2;flex:0 0 auto;width:auto;max-width:none;margin:0;padding:10px 16px 12px;border-radius:0;background:var(--igs-settings-accent,#2f5f78);color:var(--igs-settings-on-accent,#fff);font-size:13px;line-height:1.4;pointer-events:none}
#igs-unified-settings .igs-settings-progress-track{height:6px;margin-top:8px;border-radius:999px;background:rgba(255,255,255,.28);overflow:hidden}
#igs-unified-settings .igs-settings-progress-fill{height:100%;width:0;border-radius:999px;background:#fff}
#igs-unified-settings .igs-settings-progress.is-writing .igs-settings-progress-fill{width:38%;animation:igs-settings-progress-slide 1s ease-in-out infinite}
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
    if (isQuotaError(error)) return '浏览器本地存储已满。可以删掉不用的场景预设或素材条目后再试，生成的图片存在另一处，不受影响';
    const message = typeof error === 'string' ? error : String(error.message || error.reason || '').trim();
    return message || '未知原因';
}

// 只对「确实没存上」或「动作本身抛错」给提示；正常的 ok:false（已经排第一、没有文件之类）交给面板自己的状态文字。
export function describeSettingsFailure(result) {
    if (!result || typeof result !== 'object' || result.ok !== false) return '';
    if (result.thrown) return `操作失败：${describeSaveError(result.thrown)}`;
    if (result.saveError || SAVE_FAILURE_REASONS.has(result.reason)) return `保存失败：${describeSaveError(result.saveError || result.message || result.reason)}`;
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
    el.className = 'igs-settings-notice';
    el.setAttribute('role', 'alert');
    el.textContent = notice.message;
    if (!existing) host.appendChild(el);
    return el;
}

// 需要等网络的设置动作：点击后按钮先禁用并换成进行中文案，动作结束（面板重绘或原按钮仍在时复原）前不接受重复点击。
const SETTINGS_BUSY_LABELS = Object.freeze({
    'test-image': '测试中…',
    'fetch-llm-models': '拉取中…',
    'fetch-image-models': '拉取中…',
});

export function settingsBusyLabel(action) {
    const name = String(action || '');
    if (SETTINGS_BUSY_LABELS[name]) return SETTINGS_BUSY_LABELS[name];
    if (/^(?:char|outfit)-expression-retry:/.test(name)) return '生成中…';
    return '';
}

// 表情差分写词和逐张出图都要几分钟。进度条挂在设置层上，面板重绘前一直看得见。
export function showSettingsProgress(container, progress) {
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
    pinSettingsProgress(el, track, fill);
    if (el.parentNode !== parent) parent.appendChild(el);
    if (progress.button) {
        const busy = host.querySelector('[aria-busy="true"]');
        if (busy) busy.textContent = progress.button;
    }
    return el;
}

function pinSettingsProgress(el, track, fill) {
    const bar = el && el.style;
    if (bar) {
        bar.position = 'static';
        bar.left = 'auto';
        bar.right = 'auto';
        bar.bottom = 'auto';
        bar.transform = 'none';
        bar.width = '100%';
        bar.maxWidth = 'none';
        bar.boxSizing = 'border-box';
        bar.flex = '0 0 auto';
        bar.margin = '0';
        bar.padding = '10px 16px 12px';
        bar.borderRadius = '0';
        bar.background = '#2f5f78';
        bar.color = '#fff';
        bar.fontSize = '13px';
        bar.lineHeight = '1.4';
        bar.zIndex = '2';
    }
    if (track && track.style) {
        track.style.height = '6px';
        track.style.marginTop = '8px';
        track.style.borderRadius = '999px';
        track.style.background = 'rgba(255,255,255,.28)';
        track.style.overflow = 'hidden';
    }
    if (fill && fill.style) {
        fill.style.height = '100%';
        fill.style.display = 'block';
        fill.style.background = '#fff';
        fill.style.borderRadius = '999px';
    }
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
