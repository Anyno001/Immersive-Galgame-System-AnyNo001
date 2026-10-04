// 地点栏左侧的两根竖线：平时看着像地点栏的起始左描边，有背景音乐在放时轻轻跳动（均衡器）。
// 音乐在左、地点在右：点竖线在竖线与地点之间展开「曲名 · 作者」和换一首；8 秒后自动收起。
// 状态栏每次重建都会清掉子节点，展开状态按阅读器记在这里，重建后照样恢复。
const OPEN_MS = 8000;
const NEXT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l10 7-10 7z" fill="currentColor"/><path d="M19 5v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

const openState = new WeakMap();

export const BGM_NOTE_STYLE_TEXT = `
#igs-status-hud .igs-hud-bgm-bars{position:relative;display:flex;align-items:center;justify-content:center;gap:calc(2px * var(--igs-hud-scale,1));flex:none;align-self:stretch;width:calc(14px * var(--igs-hud-scale,1));min-height:calc(16px * var(--igs-hud-scale,1));margin:0 calc(1px * var(--igs-hud-scale,1)) 0 0;padding:0;border:0;background:transparent;color:rgba(232,230,226,.82);cursor:pointer;pointer-events:auto;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6));}
#igs-status-hud .igs-hud-bgm-bars i{display:block;width:calc(2px * var(--igs-hud-scale,1));height:calc(14px * var(--igs-hud-scale,1));border-radius:1px;background:currentColor;opacity:.62;transform-origin:50% 100%;animation:igs-hud-bgm-bar 1.1s ease-in-out infinite alternate;}
#igs-status-hud .igs-hud-bgm-bars i+i{animation-duration:.8s;animation-delay:-.35s;}
#igs-status-hud .igs-hud-bgm-bars:hover i,#igs-status-hud .igs-hud-location.is-bgm-open .igs-hud-bgm-bars i{opacity:.95;}
#igs-overlay[data-igs-paused] #igs-status-hud .igs-hud-bgm-bars i{animation-play-state:paused;}
@keyframes igs-hud-bgm-bar{from{transform:scaleY(1);}to{transform:scaleY(.45);}}
#igs-status-hud .igs-hud-bgm{display:flex;align-items:center;flex:0 1 auto;min-width:0;gap:calc(3px * var(--igs-hud-scale,1));color:rgba(232,230,226,.82);font-size:calc(11px * var(--igs-hud-scale,1) * var(--igs-hud-location-scale,1));line-height:1.5;text-shadow:0 1px 3px rgba(0,0,0,.72);}
#igs-status-hud .igs-hud-location:not(.is-bgm-open) .igs-hud-bgm{display:none;}
#igs-status-hud .igs-hud-bgm-sep{flex:none;margin-right:calc(2px * var(--igs-hud-scale,1));opacity:.5;}
#igs-status-hud .igs-hud-bgm-title{min-width:0;max-width:calc(150px * var(--igs-hud-scale,1));overflow:hidden;white-space:nowrap;text-overflow:ellipsis;animation:igs-hud-bgm-in .24s ease-out;}
#igs-status-hud .igs-hud-bgm-next{display:grid;place-items:center;flex:none;width:calc(18px * var(--igs-hud-scale,1));height:calc(18px * var(--igs-hud-scale,1));margin:0;padding:0;border:0;background:transparent;color:inherit;cursor:pointer;pointer-events:auto;opacity:.78;}
#igs-status-hud .igs-hud-bgm-next:hover{opacity:1;}
#igs-status-hud .igs-hud-bgm-next svg{width:calc(11px * var(--igs-hud-scale,1));height:calc(11px * var(--igs-hud-scale,1));}
@keyframes igs-hud-bgm-in{from{opacity:0;transform:translateX(-4px);}to{opacity:1;transform:none;}}
@media (prefers-reduced-motion:reduce){#igs-status-hud .igs-hud-bgm-bars i{animation:none;}#igs-status-hud .igs-hud-bgm-bars i+i{transform:scaleY(.6);}#igs-status-hud .igs-hud-bgm-title{animation:none;}}
`;

function trackLabel(track) {
    const name = String(track && track.name || '').trim();
    const credit = String(track && track.credit || '').trim();
    return credit ? `${name} · ${credit}` : name;
}

function isOpen(root) {
    const entry = openState.get(root);
    return Boolean(entry && entry.until > Date.now());
}

function locationOf(root) {
    const host = root && typeof root.querySelector === 'function' ? root.querySelector('#igs-status-hud') : null;
    return host ? host.querySelector('.igs-hud-location') : null;
}

function syncOpen(location, open) {
    location.classList.toggle('is-bgm-open', open);
    const bars = location.querySelector('.igs-hud-bgm-bars');
    if (bars) bars.setAttribute('aria-expanded', String(open));
}

function setOpen(root, open) {
    const prev = openState.get(root);
    if (prev && prev.timer) clearTimeout(prev.timer);
    if (!open) {
        openState.delete(root);
        return;
    }
    const timer = setTimeout(() => {
        openState.delete(root);
        const location = locationOf(root);
        if (location) syncOpen(location, false);
    }, OPEN_MS);
    openState.set(root, { until: Date.now() + OPEN_MS, timer });
}

export function applyBgmNoteToDom(root, track, { open } = {}) {
    const location = locationOf(root);
    if (!track || !location) {
        // 状态栏重建时旧节点已随之清掉；这里只处理音乐停了但地点栏还在的情况。
        if (location) {
            for (const selector of ['.igs-hud-bgm-bars', '.igs-hud-bgm']) {
                const stale = location.querySelector(selector);
                if (stale) stale.remove();
            }
            syncOpen(location, false);
        }
        return;
    }
    if (open !== undefined) setOpen(root, open);
    const doc = location.ownerDocument;
    let bars = location.querySelector('.igs-hud-bgm-bars');
    if (!bars) {
        bars = doc.createElement('button');
        bars.type = 'button';
        bars.className = 'igs-hud-bgm-bars';
        bars.setAttribute('data-act', 'bgm-note');
        bars.setAttribute('aria-label', '正在播放的音乐');
        bars.appendChild(doc.createElement('i'));
        bars.appendChild(doc.createElement('i'));
        location.insertBefore(bars, location.children[0] || null);
    }
    let note = location.querySelector('.igs-hud-bgm');
    if (!note) {
        note = doc.createElement('span');
        note.className = 'igs-hud-bgm';
        const sep = doc.createElement('span');
        sep.className = 'igs-hud-bgm-sep';
        sep.textContent = '·';
        const title = doc.createElement('span');
        title.className = 'igs-hud-bgm-title';
        const next = doc.createElement('button');
        next.type = 'button';
        next.className = 'igs-hud-bgm-next';
        next.setAttribute('data-act', 'bgm-next');
        next.setAttribute('aria-label', '换一首');
        next.innerHTML = NEXT_ICON;
        note.appendChild(title);
        note.appendChild(next);
        note.appendChild(sep);
        // 竖线之后、地点图钉之前。
        location.insertBefore(note, location.querySelector('.igs-hud-location-icon') || location.querySelector('.igs-hud-location-label'));
    }
    const label = trackLabel(track);
    const title = note.querySelector('.igs-hud-bgm-title');
    if (title && title.textContent !== label) title.textContent = label;
    if (title) title.setAttribute('title', label);
    syncOpen(location, isOpen(root));
}

// 点竖线：展开 / 收起曲名。返回展开后的状态；没有音乐时返回 null。
export function toggleBgmNote(root) {
    const location = locationOf(root);
    if (!location || !location.querySelector('.igs-hud-bgm-bars')) return null;
    const open = !isOpen(root);
    setOpen(root, open);
    syncOpen(location, open);
    return open;
}
