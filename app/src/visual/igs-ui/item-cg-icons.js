// 工具栏「CG 库」「补全物品图」图标：与既有工具栏 SVG 同规格（18px、currentColor 描边、2px 线宽）。
const svg = (body) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block">${body}</svg>`;

export const ITEM_CG_ICONS = Object.freeze({
    cgGallery: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
    fillItemImages: svg('<path d="M4 8h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/><path d="M12 12v5"/><path d="M9.5 14.5h5"/>'),
});
