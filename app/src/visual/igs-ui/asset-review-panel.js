export const ASSET_REVIEW_STYLE_TEXT = `
#igs-asset-review{position:absolute;right:16px;bottom:calc(var(--igs-dialog-h,180px) + 16px);z-index:40;width:min(360px,calc(100% - 32px));max-height:60%;overflow:auto;padding:12px;border-radius:12px;background:rgba(20,22,30,.86);color:#fff;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.35);backdrop-filter:blur(8px);}
#igs-asset-review[hidden]{display:none;}
.igs-asset-review-title{font-weight:600;margin-bottom:8px;}
.igs-asset-review-item{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid rgba(255,255,255,.12);}
.igs-asset-review-thumb{width:72px;height:72px;flex:none;border-radius:8px;background:rgba(255,255,255,.08);object-fit:contain;}
.igs-asset-review-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;}
.igs-asset-review-body select{width:100%;box-sizing:border-box;padding:4px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.25);color:inherit;}
.igs-asset-review-body select option{background:#1e2028;color:#fff;}
.igs-asset-review-body input{width:100%;box-sizing:border-box;padding:4px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.25);color:inherit;}
.igs-asset-review-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;}
.igs-asset-review-actions button{min-height:28px;padding:4px 8px;border-radius:6px;border:0;background:rgba(255,255,255,.1);color:inherit;cursor:pointer;font-size:12px;line-height:18px;text-align:center;}
.igs-asset-review-actions button.is-primary{grid-column:1/-1;background:rgba(255,255,255,.2);font-weight:600;}
.igs-asset-review-actions button.is-wide{grid-column:1/-1;}
.igs-asset-review-actions button:hover{background:rgba(255,255,255,.26);}
.igs-asset-review-actions button:focus-visible{outline:2px solid rgba(255,255,255,.6);outline-offset:1px;}
`;

const TYPE_LABEL = { sprite: '立绘', background: '背景' };

export function renderAssetReviewPanel(container, items = [], handlers = {}) {
    if (!container || !container.ownerDocument) return;
    const doc = container.ownerDocument;
    // 图片读回与设置保存会重绘审核框；只保留仍在待确认列表里的改名草稿。
    const drafts = new Map();
    const activeInput = doc.activeElement;
    const activeKey = activeInput?.getAttribute?.('data-asset-review-key');
    let focusTarget = null;
    if (typeof container.querySelectorAll === 'function') {
        for (const input of container.querySelectorAll('input')) {
            const key = input.getAttribute('data-asset-review-key');
            if (key) drafts.set(key, input.value);
        }
    }
    while (container.firstChild) container.removeChild(container.firstChild);
    const outfitAsks = Array.isArray(handlers.outfitAsks) ? handlers.outfitAsks : [];
    if (!items.length && !outfitAsks.length) {
        container.setAttribute('hidden', '');
        return;
    }
    const title = doc.createElement('div');
    title.className = 'igs-asset-review-title';
    title.textContent = items.length ? `本层待确认素材 ${items.length}${handlers.hasMore ? '+' : ''} 项，是否入库？` : '正文出现了衣柜里没有的衣服';
    container.appendChild(title);
    // 多件新衣服时一键全部稍后：逐件走与单行「稍后」相同的回调，全部留在「待确认」。
    if (outfitAsks.length > 1) {
        const bulk = doc.createElement('div');
        bulk.className = 'igs-asset-review-actions';
        const deferAll = doc.createElement('button');
        deferAll.type = 'button';
        deferAll.className = 'is-wide';
        deferAll.textContent = '全部稍后';
        deferAll.setAttribute('data-outfit-ask-act', 'later-all');
        deferAll.addEventListener('click', (event) => {
            event.stopPropagation();
            if (deferAll.disabled || typeof handlers.onOutfit !== 'function') return;
            deferAll.disabled = true;
            for (const ask of outfitAsks) if (!ask.busy) handlers.onOutfit(ask, '');
        });
        bulk.appendChild(deferAll);
        container.appendChild(bulk);
    }
    // 新衣服：「角色」穿了「衣服」+ 下拉菜单 + 加入/稍后；点过即从列表移除，不另显示状态。
    for (const ask of outfitAsks) {
        const row = doc.createElement('div');
        row.className = 'igs-asset-review-item';
        const body = doc.createElement('div');
        body.className = 'igs-asset-review-body';
        const label = doc.createElement('div');
        label.textContent = `「${ask.character}」穿了「${ask.word}」`;
        const select = doc.createElement('select');
        select.setAttribute('aria-label', '新衣服加入方式');
        select.addEventListener('keydown', (event) => event.stopPropagation());
        for (const choice of ask.choices || []) {
            const option = doc.createElement('option');
            option.value = choice.value;
            option.textContent = choice.label;
            select.appendChild(option);
        }
        const actions = doc.createElement('div');
        actions.className = 'igs-asset-review-actions';
        const acts = [['ok', '加入'], ['later', '稍后']];
        select.disabled = !ask.id && Boolean(ask.busy);
        let submitted = false;
        for (const [act, text] of acts) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.textContent = text;
            button.setAttribute('data-outfit-ask-act', act);
            button.disabled = Boolean(ask.busy) && (!ask.id || act === 'retry');
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                if (!submitted && !button.disabled && typeof handlers.onOutfit === 'function') {
                    submitted = true;
                    select.disabled = true;
                    for (const control of actions.querySelectorAll('button')) control.disabled = true;
                    handlers.onOutfit(ask, act === 'ok' ? select.value : act === 'retry' ? 'retry' : '');
                }
            });
            actions.appendChild(button);
        }
        for (const node of [label, select, actions]) body.appendChild(node);
        row.appendChild(body);
        container.appendChild(row);
    }
    for (const item of items) {
        const row = doc.createElement('div');
        row.className = 'igs-asset-review-item';
        const thumb = doc.createElement('img');
        thumb.className = 'igs-asset-review-thumb';
        thumb.alt = `${TYPE_LABEL[item.type] || '素材'}${item.time ? ` · ${item.time}` : ''}`;
        thumb.src = String(item.previewUrl || '');
        const body = doc.createElement('div');
        body.className = 'igs-asset-review-body';
        const label = doc.createElement('div');
        label.textContent = thumb.alt;
        const input = doc.createElement('input');
        input.type = 'text';
        input.setAttribute('data-asset-review-key', String(item.key || ''));
        input.value = drafts.has(item.key) ? drafts.get(item.key) : String(item.name || '');
        input.setAttribute('aria-label', '素材名称');
        input.addEventListener('keydown', (event) => event.stopPropagation());
        if (activeKey && activeKey === item.key) focusTarget = input;
        const actions = doc.createElement('div');
        actions.className = 'igs-asset-review-actions';
        // 立绘经统一采用入口核验并保存身份；「入库并编辑 DNA」打开采用后的景别资料。
        const acts = [['library', item.type === 'background' ? '入库到场景' : '入库到角色'], ['chat', '仅本聊天'], ['discarded', '丢弃']];
        if (item.type === 'sprite') acts.splice(1, 0, ['library-dna', '入库并编辑 DNA']);
        for (const [act, text] of acts) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.textContent = text;
            // 入库类为主操作，各占一整行；「仅本聊天 / 丢弃」两列并排，保证按钮对齐。
            if (act === 'library' || act === 'library-dna') button.className = 'is-primary';
            button.setAttribute('data-asset-review-act', act);
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                if (typeof handlers.onResolve === 'function') handlers.onResolve(item, act, input.value.trim());
            });
            actions.appendChild(button);
        }
        body.append(label, input, actions);
        row.append(thumb, body);
        container.appendChild(row);
    }
    if (handlers.hasMore) {
        const more = doc.createElement('button');
        more.type = 'button'; more.textContent = '到待确认页查看其余素材';
        more.addEventListener('click', event => { event.stopPropagation(); handlers.onMore?.(); });
        container.appendChild(more);
    }
    container.removeAttribute('hidden');
    if (focusTarget && typeof focusTarget.focus === 'function') {
        const start = activeInput.selectionStart, end = activeInput.selectionEnd;
        focusTarget.focus();
        if (Number.isInteger(start) && Number.isInteger(end)) focusTarget.setSelectionRange?.(start, end);
    }
}
