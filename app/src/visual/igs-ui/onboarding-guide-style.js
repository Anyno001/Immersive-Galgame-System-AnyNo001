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
#igs-onboarding-card .igs-onboarding-quiz{display:flex;flex-direction:column;gap:8px;max-height:min(46vh,360px);overflow-y:auto;margin:0 0 6px}
#igs-onboarding-card .igs-onboarding-q-title{font-size:12px;opacity:.85;margin-bottom:4px}
#igs-onboarding-card .igs-onboarding-q-title span{margin-left:6px;opacity:.6}
#igs-onboarding-card .igs-onboarding-q-note{margin:-2px 0 4px;font-size:11px;opacity:.6}
#igs-onboarding-card .igs-onboarding-section{display:flex;justify-content:space-between;align-items:center;width:100%;min-height:30px;margin-top:4px;padding:0 10px;border:1px dashed ${SOFT_LINE};border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
#igs-onboarding-card .igs-onboarding-section span{opacity:.6;font-size:11px}
#igs-onboarding-card .igs-onboarding-section.is-open{border-style:solid}
#igs-onboarding-card .igs-onboarding-q-opts{display:flex;flex-wrap:wrap;gap:6px}
.igs-onboarding-chip{min-height:28px;padding:0 10px;border-radius:999px;border:1px solid ${SOFT_LINE};background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}
.igs-onboarding-chip.is-active{border-color:currentColor;background:color-mix(in srgb,currentColor 14%,transparent);font-weight:600}
.igs-onboarding-chip:focus-visible{outline:2px solid currentColor;outline-offset:2px}
#igs-onboarding-card .igs-onboarding-quiz-result{margin:0 0 10px;font-size:12px;line-height:1.5;opacity:.8}
#igs-unified-settings [data-igs-guide-active]{outline:2px solid currentColor;outline-offset:3px;border-radius:var(--igs-settings-radius-small,6px)}
#igs-onboarding-invite{position:absolute;left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%);z-index:30;box-sizing:border-box;display:flex;flex-wrap:nowrap;align-items:center;gap:2px;max-width:calc(100% - 24px);height:30px;padding:0 3px 0 14px;border:0;border-radius:999px;background:var(--igs-dialog-bg,Canvas);color:inherit;box-shadow:0 4px 14px rgba(0,0,0,.18);font-size:12px;line-height:1;white-space:nowrap}
#igs-onboarding-invite .igs-onboarding-invite-text{flex:1 1 auto;min-width:0;margin-right:6px;overflow:hidden;text-overflow:ellipsis;letter-spacing:.02em}
#igs-onboarding-invite .igs-onboarding-btn{position:relative;flex:none;min-height:24px;min-width:0;padding:0 10px;border:0;border-radius:999px;background:transparent;font-size:12px}
#igs-onboarding-invite .igs-onboarding-btn.is-primary{background:color-mix(in srgb,currentColor 14%,transparent)}
#igs-onboarding-invite .igs-onboarding-btn.is-quiet{opacity:.6}
#igs-onboarding-invite .igs-onboarding-btn:hover{background:color-mix(in srgb,currentColor 10%,transparent)}
#igs-onboarding-invite .igs-onboarding-btn.is-primary:hover{background:color-mix(in srgb,currentColor 20%,transparent)}
@media (pointer:coarse){#igs-onboarding-invite .igs-onboarding-btn::after{content:"";position:absolute;inset:-10px -2px}}
@media (pointer:coarse){.igs-onboarding-btn{min-height:44px;min-width:44px}.igs-onboarding-chip{min-height:36px}}
@media (prefers-reduced-motion:reduce){#igs-onboarding-card,#igs-onboarding-invite,.igs-onboarding-btn{transition:none;animation:none}}
`.trim();

export function getOnboardingStyleText() {
    return STYLE_TEXT;
}
