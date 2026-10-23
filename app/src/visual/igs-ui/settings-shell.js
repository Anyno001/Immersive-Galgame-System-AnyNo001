// 设置器外壳：头部（☰、标题、配色、版本、关闭）、左侧分类栏、搜索、内容。
// 窄屏时分类栏收起，点 ☰ 从左侧滑出（开关记在 #igs-unified-settings 的 data-igs-nav 上，重绘不会丢）。
const SETTINGS_SHELL_TEMPLATE = `
<div class="igs-settings-shell" role="dialog" aria-modal="true" aria-label="设置">
  <div class="igs-settings-head">
    <button type="button" class="igs-settings-nav-toggle" data-nav-toggle aria-label="分类菜单"><i></i></button>
    <div class="igs-settings-title">{{title}}</div>
    <div class="igs-settings-theme-switch" role="radiogroup" aria-label="设置配色">{{settingsThemeSwitch}}</div>
    <div class="igs-settings-head-spacer"></div>
    <div class="igs-settings-badge">{{version}}</div>
    <button type="button" class="igs-settings-close" data-action="close" aria-label="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  </div>
  <div class="igs-settings-main">
    <nav class="igs-settings-nav" aria-label="设置分类">{{nav}}</nav>
    <div class="igs-settings-nav-mask" data-nav-toggle></div>
    <div class="igs-settings-content">
      <div class="igs-settings-search">
        <input type="search" class="igs-settings-search-input" data-settings-search placeholder="搜索设置，如：黑边、打字音、卡顿" aria-label="搜索设置" autocomplete="off">
        <div class="igs-settings-search-results" data-settings-search-results role="list" aria-live="polite"></div>
      </div>
      <div class="igs-settings-body">{{body}}</div>
    </div>
  </div>
</div>
`.trim();

export function getSettingsShellTemplate() {
    return SETTINGS_SHELL_TEMPLATE;
}

// 侧边栏：一行一个分类的竖排扁平文字。
export function renderSettingsNav(categories, activeCategory, escape = (value) => String(value)) {
    return categories.map(([id, label]) => `<button type="button" class="igs-settings-nav-item${id === activeCategory ? ' is-active' : ''}" data-cat="${escape(id)}"${id === activeCategory ? ' aria-current="page"' : ''}>${escape(label)}</button>`).join('');
}
