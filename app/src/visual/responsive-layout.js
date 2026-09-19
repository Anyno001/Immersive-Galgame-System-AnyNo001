export function getResponsiveLayout(viewport, settings = {}) {
    const width = viewport && viewport.width ? viewport.width : 0;
    const height = viewport && viewport.height ? viewport.height : 0;
    const isLandscape = width > height;
    const mode = settings.mode || 'pc';

    if ((mode === 'web' || mode === 'fullscreen') && settings.isMobile && isLandscape) {
        return 'mobile-landscape';
    }

    if (settings.isMobile) return 'mobile-portrait';
    return 'desktop';
}
