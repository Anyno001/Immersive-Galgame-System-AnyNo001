export const INTIMATE_LAUNCH_ID = 'igs-combat-launch';

export function syncIntimateLaunch(overlay, show) {
    if (!overlay || typeof overlay.querySelector !== 'function') return;
    let node = overlay.querySelector(`#${INTIMATE_LAUNCH_ID}`);
    if (!show) {
        if (node) node.remove();
        return;
    }
    if (!node) {
        node = overlay.ownerDocument.createElement('div');
        node.id = INTIMATE_LAUNCH_ID;
        node.addEventListener('click', (event) => {
            event.stopPropagation?.();
            event.preventDefault?.();
            if (event.target?.closest?.('[data-intimate-launch]') && typeof node.onLaunch === 'function') node.onLaunch();
        });
        node.innerHTML = '<button type="button" class="igs-combat-entry-btn igs-combat-entry-return" data-intimate-launch="">发起</button>';
        overlay.appendChild(node);
    }
    if (show.skin) node.setAttribute('data-combat-skin', show.skin);
    node.onLaunch = show.onLaunch;
}
