const SETTINGS_SHELL_TEMPLATE = `
<div class="igs-settings-shell" role="dialog" aria-modal="true" aria-label="设置">
  <div class="igs-settings-head">
    <div class="igs-settings-title">设置</div>
    <div class="igs-settings-badge">{{version}}</div>
    <button class="igs-settings-close" data-action="close" aria-label="关闭">×</button>
  </div>
  <div class="igs-settings-tabs">{{tabs}}</div>
  <div class="igs-settings-body">{{body}}</div>
</div>
`.trim();

export function getSettingsShellTemplate() {
    return SETTINGS_SHELL_TEMPLATE;
}
