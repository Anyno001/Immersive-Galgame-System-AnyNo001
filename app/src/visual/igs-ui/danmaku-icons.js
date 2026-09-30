// 直播间图标：统一 24 视框、描边随 currentColor，禁止用 emoji 代替。
const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;

export const LIVE_ICONS = Object.freeze({
    close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor" stroke="none"/>'),
    gift: svg('<rect x="3.5" y="9" width="17" height="11" rx="1.5"/><path d="M2.5 9h19M12 9v11"/><path d="M12 9c-2.5 0-5-1-5-3a2 2 0 0 1 3.6-1.2L12 9l1.4-4.2A2 2 0 0 1 17 6c0 2-2.5 3-5 3z"/>'),
    flame: svg('<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3 2-5 3.3-6.4.4 1.7 1.3 2.7 2.4 3.2C11 8 12.3 5.2 14.6 3c.3 2.8 1.8 4.3 3 5.9 1 1.4 1.9 3.2 1.9 5.6 0 3.7-3.1 6.5-7.5 6.5z" fill="currentColor" stroke="none"/>'),
    mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
    flip: svg('<path d="M4 8h11l-3-3M20 16H9l3 3"/>'),
    beauty: svg('<path d="M5 19 15 9M13.5 5.5l1-2 1 2 2 1-2 1-1 2-1-2-2-1zM18 12l.7 1.3L20 14l-1.3.7L18 16l-.7-1.3L16 14l1.3-.7z"/>'),
    ship: svg('<path d="M12 3v9M8 6h8M4 13h16l-2.2 5.2a2 2 0 0 1-1.8 1.3H8a2 2 0 0 1-1.8-1.3z"/>'),
    viewers: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.3 3-5 6-5s5.4 1.7 6 5M16 5.2a3 3 0 0 1 0 5.6M18 14.2c1.7.6 2.8 2.1 3 4.8"/>'),
    more: svg('<circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>'),
    plus: svg('<path d="M12 6v12M6 12h12"/>'),
});
