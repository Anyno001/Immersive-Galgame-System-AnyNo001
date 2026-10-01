const SETTINGS_SHELL_TEMPLATE = `
<div class="igs-settings-shell" role="dialog" aria-modal="true" aria-label="设置">
  <div class="igs-settings-head">
    <div class="igs-settings-title">设置</div>
    <div class="igs-settings-theme-switch" role="radiogroup" aria-label="设置配色">{{settingsThemeSwitch}}</div>
    <div class="igs-settings-head-spacer"></div>
    <div class="igs-settings-badge">{{version}}</div>
    <button class="igs-settings-close" data-action="close" aria-label="关闭">×</button>
  </div>
  <div class="igs-settings-tabs">{{tabs}}</div>
  <div class="igs-settings-search">
    <input type="search" class="igs-settings-search-input" data-settings-search placeholder="搜索设置，例如：镜头、音效、打字机" aria-label="搜索设置" autocomplete="off">
    <div class="igs-settings-search-results" data-settings-search-results role="list" aria-live="polite"></div>
  </div>
  <div class="igs-settings-body">{{body}}</div>
</div>
`.trim();

export function getSettingsShellTemplate() {
    return SETTINGS_SHELL_TEMPLATE;
}
