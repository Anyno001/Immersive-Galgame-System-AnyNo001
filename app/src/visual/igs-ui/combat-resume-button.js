// 「返回战斗 / 返回挑战」悬浮按钮：有未打完的战斗时挂在阅读器画面右下、对话框上沿之上，外观随战斗面板皮肤（样式在 combat-entry-skin-style.js）。
import { combatEntryHtml } from './combat-entry.js';

export const COMBAT_RESUME_ID = 'igs-combat-resume';

// show 为 null 时移除；否则 { kind, skin, onResume }。点击不冒泡到翻页层。
export function syncCombatResume(overlay, show) {
    if (!overlay || typeof overlay.querySelector !== 'function') return;
    let node = overlay.querySelector(`#${COMBAT_RESUME_ID}`);
    if (!show) {
        if (node) node.remove();
        return;
    }
    if (!node) {
        node = overlay.ownerDocument.createElement('div');
        node.id = COMBAT_RESUME_ID;
        node.addEventListener('click', (event) => {
            event.stopPropagation?.();
            event.preventDefault?.();
            if (event.target?.closest?.('[data-combat-entry]') && typeof node.onResume === 'function') node.onResume();
        });
        overlay.appendChild(node);
    }
    const kind = show.kind === 'challenge' ? 'challenge' : 'combat';
    if (node.getAttribute('data-kind') !== kind) {
        node.setAttribute('data-kind', kind);
        node.innerHTML = combatEntryHtml({ kind });
    }
    if (show.skin) node.setAttribute('data-combat-skin', show.skin);
    node.onResume = show.onResume;
}
