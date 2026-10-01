// 新手引导样式。引导卡挂在 #igs-unified-settings 内，复用设置面板的底色与圆角变量；
// 邀请条挂在阅读器 overlay 内，复用对话框底色。高亮只加 outline，不改布局，不新增色值。
export const ONBOARDING_STYLE_ID = 'igs-onboarding-style';

const SOFT_LINE = 'color-mix(in srgb,currentColor 24%,transparent)';

const STYLE_TEXT = `
#igs-onboarding-card{position:absolute;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:5;box-sizing:border-box;width:min(520px,calc(100% - 24px));padding:12px 14px;border-radius:var(--igs-settings-radius-shell,12px);background:var(--igs-settings-shell-bg);color:inherit;border:1px solid ${SOFT_LINE}}
#igs-onboarding-card .igs-onboarding-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
#igs-onboarding-card .igs-onboarding-title{margin:0;font-size:15px;font-weight:600;outline:none}
#igs-onboarding-card .igs-onboarding-count{font-size:12px;opacity:.7;white-space:nowrap}
#igs-onboarding-card .igs-onboarding-body{margin:6px 0 10px;font-size:13px;line-height:1.6}
#igs-onboarding-card .igs-onboarding-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.igs-onboarding-btn{min-height:32px;padding:0 12px;border-radius:var(--igs-settings-radius-control,8px);border:1px solid ${SOFT_LINE};background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer}
.igs-onboarding-btn.is-primary{border-color:currentColor;font-weight:600}
.igs-onboarding-btn.is-quiet{border-color:transparent;opacity:.75}
.igs-onboarding-btn:focus-visible{outline:2px solid currentColor;outline-offset:2px}
#igs-unified-settings [data-igs-guide-active]{outline:2px solid currentColor;outline-offset:3px;border-radius:var(--igs-settings-radius-small,6px)}
#igs-onboarding-invite{position:absolute;left:50%;top:max(12px,env(safe-area-inset-top));transform:translateX(-50%);z-index:30;box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;max-width:calc(100% - 24px);padding:8px 12px;border-radius:12px;background:var(--igs-dialog-bg,Canvas);color:inherit;border:1px solid ${SOFT_LINE};font-size:13px}
#igs-onboarding-invite .igs-onboarding-btn{border-radius:8px}
@media (pointer:coarse){.igs-onboarding-btn{min-height:44px;min-width:44px}}
@media (prefers-reduced-motion:reduce){#igs-onboarding-card,#igs-onboarding-invite,.igs-onboarding-btn{transition:none;animation:none}}
`.trim();

export function getOnboardingStyleText() {
    return STYLE_TEXT;
}
