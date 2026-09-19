export const READER_MODE_ICONS = Object.freeze({
    pc: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    mobile: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="3"/><circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none"/></svg>',
    web: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M2 8h20"/><circle cx="6" cy="5.5" r="1" fill="currentColor" stroke="none"/><circle cx="9.5" cy="5.5" r="1" fill="currentColor" stroke="none"/><path d="M13 5.5h5"/></svg>',
    fullscreen: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V3h4M21 7V3h-4M3 17v4h4M21 17v4h-4"/></svg>',
});

export function getReaderModeIcon(mode) {
    return READER_MODE_ICONS[mode] || READER_MODE_ICONS.pc;
}
