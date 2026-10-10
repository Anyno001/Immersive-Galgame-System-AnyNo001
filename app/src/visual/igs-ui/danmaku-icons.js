// 直播间图标：统一 24 视框、1.6 细描边、圆角端点，描边随 currentColor；禁止用 emoji 代替。
const svg = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const LIVE_ICONS = Object.freeze({
    close: svg('<path d="M7 7l10 10M17 7 7 17"/>'),
    heart: svg('<path d="M12 20.2s-7.4-4.5-7.4-10.1A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.4 2.7c0 5.6-7.4 10.1-7.4 10.1z" fill="currentColor" stroke="none"/>'),
    gift: svg('<rect x="3.8" y="8.2" width="16.4" height="4" rx="1.1"/><path d="M5.3 12.2v6.9c0 .9.7 1.6 1.6 1.6h10.2c.9 0 1.6-.7 1.6-1.6v-6.9M12 8.2v12.5"/><path d="M12 8.2C10.9 5.6 7.7 4.9 7.2 6.6c-.4 1.4 2 1.6 4.8 1.6zm0 0c1.1-2.6 4.3-3.3 4.8-1.6.4 1.4-2 1.6-4.8 1.6z"/>'),
    flame: svg('<path d="M12 21.4c3.5 0 5.9-2.3 5.9-5.7 0-2.6-1.5-4.5-2.9-6.1-.4 1.5-1.2 2.5-2.3 2.9.5-2.9-.6-6-3.1-8.3-.2 3.1-1.8 4.9-3.1 6.5-1.2 1.4-2.3 3-2.3 5 0 3.4 2.4 5.7 5.8 5.7z" fill="currentColor" stroke="none"/>'),
    mic: svg('<rect x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M6 11.2a6 6 0 0 0 12 0M12 17.2v3.3M9.2 20.5h5.6"/>'),
    flip: svg('<path d="M4.5 9.5a7.8 7.8 0 0 1 13.6-2.3M19.5 14.5a7.8 7.8 0 0 1-13.6 2.3"/><path d="M18.6 3.8v3.6H15M5.4 20.2v-3.6H9"/>'),
    beauty: svg('<path d="M5 19.5 14.2 10.3"/><path d="M15.8 4.2l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9zM19 12.6l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5z" fill="currentColor" stroke="none"/>'),
    shield: svg('<path d="M12 3.5 5 6.2v5.3c0 4.4 2.9 7.6 7 9 4.1-1.4 7-4.6 7-9V6.2z"/><path d="M12 8.6v4.4M12 15.8v.2"/>'),
    ban: svg('<circle cx="12" cy="12" r="8"/><path d="M6.4 6.4l11.2 11.2"/>'),
    ship: svg('<circle cx="12" cy="5.2" r="1.9"/><path d="M12 7.1v13.4M8.4 10.6h7.2M4.8 13.6a7.2 7.2 0 0 0 14.4 0"/>'),
    viewers: svg('<circle cx="12" cy="8.3" r="3.3"/><path d="M5.6 19.6c.7-3.4 3.3-5.3 6.4-5.3s5.7 1.9 6.4 5.3"/>'),
    more: svg('<circle cx="6" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.2" fill="currentColor" stroke="none"/>'),
    plus: svg('<path d="M12 7v10M7 12h10"/>'),
    swap: svg('<path d="M4.5 8h14M14.5 4l4 4-4 4"/><path d="M19.5 16h-14M9.5 12l-4 4 4 4"/>'),
});

const SIGNAL_ICON = '<svg viewBox="0 0 17 11" aria-hidden="true"><rect x="0" y="7" width="3" height="4" rx=".8"/><rect x="4.5" y="5" width="3" height="6" rx=".8"/><rect x="9" y="2.5" width="3" height="8.5" rx=".8"/><rect x="13.5" y="0" width="3" height="11" rx=".8"/></svg>';
const WIFI_ICON = '<svg viewBox="0 0 16 11" aria-hidden="true"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.1-1.2A10.2 10.2 0 0 0 8 .5 10.2 10.2 0 0 0 .9 3.4L2 4.6a8.6 8.6 0 0 1 6-2.4zm0 3.3c1.4 0 2.6.5 3.6 1.4l1.1-1.2A6.8 6.8 0 0 0 8 3.8a6.8 6.8 0 0 0-4.7 1.9l1.1 1.2c1-.9 2.2-1.4 3.6-1.4zm0 3.3c.5 0 1 .2 1.3.5L8 10.7 6.7 9.3c.3-.3.8-.5 1.3-.5z"/></svg>';
const batteryIcon = (low) => `<svg viewBox="0 0 26 12" aria-hidden="true"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" stroke-opacity=".4"/><rect x="2" y="2" width="${low ? 4 : 16}" height="8" rx="1.8"${low ? ' fill="#ff3b30"' : ''}/><path d="M24 4v4c.8-.3 1.3-1.1 1.3-2S24.8 4.3 24 4z" fill-opacity=".45"/></svg>`;

const statusParts = new WeakMap();

function realClock(now) {
    const date = new Date(now());
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// 状态栏随剧情：status = { time, night, battery: { low, pct }, signal: 'none' }；只在内容变化时写 DOM。
export function setPhoneStatus(bar, status) {
    const parts = statusParts.get(bar);
    if (!parts || !status) return;
    const low = Boolean(status.battery && status.battery.low);
    const pct = low ? Math.max(1, Math.min(99, Number(status.battery.pct) || 5)) : 0;
    const key = `${status.time}|${low ? pct : ''}|${status.signal === 'none' ? 1 : 0}`;
    if (parts.key !== key) {
        parts.key = key;
        parts.time.textContent = status.time;
        parts.icons.innerHTML = (status.signal === 'none' ? '<span class="igs-phone-nosig">无服务</span>' : SIGNAL_ICON + WIFI_ICON)
            + (low ? `<span class="igs-phone-lowbat">${pct}%</span>` : '') + batteryIcon(low);
        bar.setAttribute('data-battery', low ? 'low' : 'full');
    }
    if (status.night) bar.setAttribute('data-night', '1');
    else bar.removeAttribute('data-night');
}

// 手机状态栏：左侧时间，右侧信号 / Wi-Fi / 电量；灵动岛与底部横条由样式伪元素绘制。
// 不传 status 时用真实时间与满格；传了就按剧情（时间、低电量、无服务）。
export function buildPhoneStatus(doc, now = Date.now, status = null) {
    const bar = doc.createElement('div');
    bar.className = 'igs-phone-status';
    const time = doc.createElement('span');
    const icons = doc.createElement('span');
    icons.className = 'igs-phone-status-icons';
    bar.append(time, icons);
    statusParts.set(bar, { time, icons, key: '' });
    setPhoneStatus(bar, status || { time: realClock(now), night: false, battery: { low: false }, signal: 'ok' });
    return bar;
}
