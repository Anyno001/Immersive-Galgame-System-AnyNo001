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
.igs-asset-review-actions button:hover{background:rgba(255,255,255,.26);}
.igs-asset-review-actions button:focus-visible{outline:2px solid rgba(255,255,255,.6);outline-offset:1px;}
`;

const TYPE_LABEL = { sprite: '立绘', background: '背景' };

export function renderAssetReviewPanel(container, items = [], handlers = {}) {
    if (!container || !container.ownerDocument) return;
    const doc = container.ownerDocument;
    while (container.firstChild) container.removeChild(container.firstChild);
    const outfitAsks = Array.isArray(handlers.outfitAsks) ? handlers.outfitAsks : [];
    if (!items.length && !outfitAsks.length) {
        container.setAttribute('hidden', '');
        return;
    }
    const title = doc.createElement('div');
    title.className = 'igs-asset-review-title';
    title.textContent = items.length ? `本层生成了 ${items.length} 个新素材，是否入库？` : '正文出现了衣柜里没有的衣服';
    container.appendChild(title);
    // 新衣服：下拉菜单选去向，确认后交给宿主；「稍后」留在素材页「待确认」里。
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
        for (const [act, text] of [['ok', '加入'], ['later', '稍后']]) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.textContent = text;
            button.setAttribute('data-outfit-ask-act', act);
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                if (typeof handlers.onOutfit === 'function') handlers.onOutfit(ask, act === 'ok' ? select.value : '');
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
        input.value = String(item.name || '');
        input.setAttribute('aria-label', '素材名称');
        input.addEventListener('keydown', (event) => event.stopPropagation());
        const actions = doc.createElement('div');
        actions.className = 'igs-asset-review-actions';
        // 立绘额外提供「入库并编辑 DNA」：先收入角色立绘，再把 tags 作为 DNA 候选交给设置页，由用户确认后才写入。
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
    container.removeAttribute('hidden');
}
