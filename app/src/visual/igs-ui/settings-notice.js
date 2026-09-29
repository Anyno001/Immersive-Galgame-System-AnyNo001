// 设置面板内的失败提示：保存失败、动作抛异常时在面板底部弹一条，几秒后自动收起。
// 面板重绘会整体替换 innerHTML，所以提示内容记在调用方状态里，由 remountSettingsNotice 在重绘后补回。
export const SETTINGS_NOTICE_MS = 6000;
const SAVE_FAILURE_REASONS = new Set(['save-failed', 'generated-asset-persist-failed', 'legacy-storage-write-failed', 'store-write-failed']);

export const SETTINGS_NOTICE_STYLE_TEXT = `
#igs-unified-settings .igs-settings-notice{position:absolute;left:50%;bottom:calc(24px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:3;max-width:min(520px,calc(100% - 48px));padding:10px 16px;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-danger,#c0392b);color:#fff;font-size:13px;line-height:1.5;pointer-events:auto;}
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
    return SETTINGS_BUSY_LABELS[String(action || '')] || '';
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
