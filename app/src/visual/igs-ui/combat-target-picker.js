// 双击出牌的目标决策与头像选择浮层。决策为纯函数（无 DOM），浮层结构与样式独立，供战斗面板复用。

// 双击一张牌时的目标决策。view 为 battleView 的结果，front 为圆环当前前排敌人的 id（可空）。
// 返回 { kind, ids }：play 为无需选目标（ids[0] 为承受方，没有则空）、target 为直接打 ids[0]、pick 为需弹出头像选择（ids 为候选）、none 为不可出。
export function autoTargetFor(view, cardId, front = '') {
    const card = (view?.hand || []).find((c) => c.inst === cardId);
    if (!card || !card.playable) return { kind: 'none', ids: [] };
    const units = [...(view.allies || []), ...(view.enemies || [])];
    const sideOf = new Map(units.map((u) => [u.id, u.side]));
    const alive = new Set(units.filter((u) => u.alive).map((u) => u.id));
    const targets = (card.targets || []).filter((id) => alive.has(id));
    if (!card.targets?.length) return { kind: 'play', ids: (card.affects || []).slice(0, 1) };
    if (!targets.length) return { kind: 'none', ids: [] };
    if (targets.length === 1) return { kind: 'target', ids: targets };
    const foes = targets.filter((id) => sideOf.get(id) === 'enemy');
    if (foes.length === targets.length) {
        // 圆环前排：前排不在候选里（已倒下等）时取候选第一个；初始方案没有圆环，同样按第一个存活敌人。
        const enemies = view.enemies || [];
        const frontId = enemies.some((u) => u.id === front) ? front : enemies.find((u) => u.alive)?.id;
        return { kind: 'target', ids: [targets.includes(frontId) ? frontId : targets[0]] };
    }
    return { kind: 'pick', ids: targets };
}

// 读取当前皮肤的取色：画布皮肤的变量在 #igs-cx-canvas 上，初始方案取面板 --igs-cb-* 变量；读不到时给中性近黑保底。
export function skinPickerVars(panel) {
    const canvas = panel?.querySelector?.('.igs-cx-canvas') || panel;
    const win = panel?.ownerDocument?.defaultView;
    const cs = canvas && win?.getComputedStyle ? win.getComputedStyle(canvas) : null;
    const pick = (...names) => { for (const n of names) { const v = cs?.getPropertyValue?.(n)?.trim(); if (v) return v; } return ''; };
    return {
        '--tp-bg': pick('--surf', '--ink') || '#1c1c1e',
        '--tp-fg': pick('--cream', '--igs-cb-ink') || '#f2f2f7',
        '--tp-sub': pick('--cream-2', '--igs-cb-ink-soft') || '#c7c7cc',
        '--tp-ac': pick('--pink', '--tray-ac', '--igs-cb-warm') || '#f2a1ac',
        '--tp-r': pick('--cx-r') || '14px',
    };
}

// 弹出头像选择浮层：items 为 [{ id, name, hp, maxHp, url }]；点头像回调 onPick(id)，点外面或 Esc 回调 onCancel()。返回 { close, node }。
export function openTargetPicker({ doc, host, items, vars = {}, onPick, onCancel }) {
    if (!doc?.createElement || !host) return null;
    const layer = doc.createElement('div');
    layer.className = 'igs-target-picker';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-label', '选择目标');
    for (const [k, v] of Object.entries(vars)) layer.style.setProperty(k, v);
    const box = doc.createElement('div');
    box.className = 'igs-target-picker-box';
    for (const it of items) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'igs-target-picker-item';
        b.setAttribute('data-picker-id', it.id);
        const face = doc.createElement('span');
        face.className = 'igs-target-picker-face';
        if (it.url) { const img = doc.createElement('img'); img.src = it.url; img.alt = ''; face.appendChild(img); } else face.textContent = String(it.name || '?').slice(0, 1);
        const name = doc.createElement('b');
        name.textContent = it.name;
        const hp = doc.createElement('small');
        hp.textContent = `${it.hp}/${it.maxHp}`;
        b.append(face, name, hp);
        box.appendChild(b);
    }
    layer.appendChild(box);
    let done = false;
    const close = () => {
        if (done) return;
        done = true;
        doc.removeEventListener('keydown', onKey, true);
        layer.remove();
    };
    const cancel = () => { if (done) return; close(); onCancel?.(); };
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault?.(); e.stopPropagation?.(); cancel(); } }
    layer.addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = e.target?.closest?.('[data-picker-id]');
        if (!btn) { cancel(); return; }
        const id = btn.getAttribute('data-picker-id');
        close();
        onPick?.(id);
    });
    // 浮层内的指针事件不进入拖牌流程。
    for (const t of ['pointerdown', 'pointerup', 'pointermove']) layer.addEventListener(t, (e) => e.stopPropagation());
    doc.addEventListener('keydown', onKey, true);
    host.appendChild(layer);
    return { close, node: layer };
}

export const TARGET_PICKER_STYLE_TEXT = `
#igs-combat-panel>.igs-target-picker{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(18,18,20,.55);pointer-events:auto;touch-action:none;}
#igs-combat-panel .igs-target-picker-box{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:min(92%,520px);padding:14px;border-radius:var(--tp-r,14px);background:var(--tp-bg,#1c1c1e);color:var(--tp-fg,#f2f2f7);}
#igs-combat-panel .igs-target-picker-item{all:unset;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:4px;width:76px;padding:8px 4px;border-radius:var(--tp-r,14px);color:var(--tp-fg,#f2f2f7);cursor:pointer;font-size:13px;line-height:1.3;text-align:center;}
#igs-combat-panel .igs-target-picker-item:is(:hover,:focus-visible){background:var(--tp-ac,#f2a1ac);color:var(--tp-bg,#1c1c1e);}
#igs-combat-panel .igs-target-picker-item small{color:var(--tp-sub,#c7c7cc);font-size:12px;}
#igs-combat-panel .igs-target-picker-item:is(:hover,:focus-visible) small{color:var(--tp-bg,#1c1c1e);}
#igs-combat-panel .igs-target-picker-face{display:flex;align-items:center;justify-content:center;width:52px;height:52px;overflow:hidden;border-radius:50%;background:var(--tp-sub,#c7c7cc);color:var(--tp-bg,#1c1c1e);font-size:20px;font-weight:700;}
#igs-combat-panel .igs-target-picker-face img{width:100%;height:100%;object-fit:cover;object-position:top;}
`;
