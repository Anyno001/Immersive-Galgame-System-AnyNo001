const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const statusText = (s) => ({ ready: '已读取', absent: '未发现', error: '读取失败，请重试或关闭该来源' })[s] || '未读取';
const field = (key, value, checked, label, disabled) => `<label class="igs-generation-check"><input type="checkbox" data-generation-field="${key}" value="${esc(value)}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>${esc(label)}</label>`;

export function renderCombatGenerationForm(form, busy = false) {
    if (!form) return '';
    const disabled = busy || form.loading;
    const attr = disabled ? ' disabled' : '';
    const p = form.preview;
    const selectedPaths = new Set(form.selection.mvuPaths || []);
    const selectedTables = new Set(form.selection.tableIds || []);
    const extraPaths = String(form.paths || '').split('\n').map((v) => v.trim()).filter(Boolean);
    const pathCount = form.selection.useMvu ? new Set([...selectedPaths, ...extraPaths]).size : 0;
    const tableCount = form.selection.useTables ? selectedTables.size : 0;
    const summary = `已选 ${pathCount} 组变量 · ${tableCount} 张技能表`;
    const candidates = (p?.candidates || []).map((c) => `<div>${field('path', c.id, selectedPaths.has(c.id), c.label, disabled || !form.selection.useMvu)}<details><summary>查看内容</summary><pre>${esc(c.preview)}</pre></details></div>`).join('');
    const tables = (p?.tables || []).map((t) => `<div>${field('table', t.id, selectedTables.has(t.id), `${t.name} · ${t.count} 条 · ${t.ownership}`, disabled || !form.selection.useTables)}<details><summary>查看内容</summary><pre>${esc(t.preview)}</pre></details></div>`).join('');
    return `<div class="igs-generation-form">
        <label>生成方向（可留空）<textarea data-generation-field="hint" rows="3" placeholder="例如：雷系近战，保留雷步和雷刃，多些连击，少些防御。"${attr}>${esc(form.hint)}</textarea></label>
        <p>方向影响卡牌与技能设计；费用、张数和强度仍按战斗规则。成功后才扣费，失败保留旧卡组。</p>
        <details${form.detailsOpen ? ' open' : ''} data-generation-details><summary data-generation-summary>参考素材 · ${form.loading ? '读取中…' : esc(summary)}</summary>
            ${form.error ? `<p role="alert">${esc(form.error)}</p>` : ''}
            ${field('useMvu', '', form.selection.useMvu, `MVU：${statusText(p?.mvuStatus)}${p?.mvuFloor != null ? ` · ${p.mvuFloor === 'chat' ? '聊天变量' : `第 ${p.mvuFloor + 1} 楼快照`}` : ''}`, disabled)}
            ${candidates || '<p>未识别到技能等路径，可在下面手动指定。</p>'}
            <label>额外 MVU 路径（每行一个，使用 / 分隔；~1 表示名称中的 /）<textarea rows="2" data-generation-field="paths" placeholder="/主角/技能"${attr}>${esc(form.paths)}</textarea></label>
            ${field('useTables', '', form.selection.useTables, `数据库技能表：${statusText(p?.tableStatus)}`, disabled)}
            ${tables || '<p>没有发现技能／能力类表。</p>'}
            <label>资料冲突时优先参考 <select data-generation-field="priority"${attr}><option value="mvu"${form.selection.priority !== 'tables' ? ' selected' : ''}>MVU 变量</option><option value="tables"${form.selection.priority === 'tables' ? ' selected' : ''}>数据库技能表</option></select></label>
            <p>只把已掌握的能力当作现有技能；未解锁和归属不明的内容仅作参考。关闭来源表示本次不直接纳入该来源，正文与世界书中已有的内容仍会参考。</p>
            <button type="button" class="igs-deck-btn" data-deck-act="generation-refresh"${attr}>重读并预览选中素材</button>
            ${form.dirty ? '<p>素材选择已修改，点击「重读并预览」查看更新后的摘要。</p>' : p?.materials ? `<details><summary>本次选中素材（${JSON.stringify(p.materials).length} 字符，确认时重读最新数据）</summary><pre>${esc(JSON.stringify(p.materials, null, 2))}</pre></details>` : ''}
        </details>
    </div>`;
}

// 表单独立管理草稿和预览；输入时不重绘，防止中文输入法和光标被打断。
export function createCombatGenerationForm({ inspect, render, errorText }) {
    let state = null;
    let revision = 0;
    const reset = () => { revision += 1; state = null; };
    async function refresh(initial = false) {
        if (!state || state.loading) return;
        const current = state;
        const my = ++revision;
        current.loading = true;
        current.error = '';
        render();
        let result;
        try { result = typeof inspect === 'function' ? await inspect({ name: current.name, ...(initial ? {} : { selection: selection() }) })
            : { ok: true, candidates: [], tables: [], mvuStatus: 'absent', tableStatus: 'absent' }; }
        catch { result = { ok: false, reason: 'combat-material-read-failed' }; }
        if (my !== revision || state !== current) return;
        current.loading = false;
        current.dirty = false;
        current.preview = result;
        if (initial) current.selection = { ...current.selection,
            mvuPaths: (result.candidates || []).filter((c) => c.selected).map((c) => c.id),
            tableIds: (result.tables || []).filter((t) => t.selected).map((t) => t.id) };
        current.error = result.ok === false ? errorText(result.reason) : '';
        if (current.error) current.detailsOpen = true;
        render();
    }
    function open(name, kind) {
        if (state?.name === name && state?.kind === kind) return;
        reset();
        state = { name, kind, hint: '', paths: '', selection: { useMvu: true, useTables: true, priority: 'mvu' }, loading: false, preview: null, error: '' };
        void refresh(true);
    }
    function selection() {
        const extra = String(state?.paths || '').split('\n').map((v) => v.trim()).filter(Boolean);
        return { ...state?.selection, mvuPaths: [...new Set([...(state?.selection.mvuPaths || []), ...extra])] };
    }
    function captureDetails(root) {
        if (state) state.detailsOpen = root?.querySelector?.('[data-generation-details]')?.open === true;
    }
    function updateCount(el) {
        const root = el.closest?.('.igs-generation-form');
        const summary = root?.querySelector?.('[data-generation-summary]');
        if (!summary) return;
        const selected = selection();
        summary.textContent = `参考素材 · 已选 ${selected.useMvu ? selected.mvuPaths.length : 0} 组变量 · ${selected.useTables ? (selected.tableIds || []).length : 0} 张技能表`;
    }
    function input(event) {
        const el = event.target;
        const key = el?.getAttribute?.('data-generation-field');
        if (!key) return false;
        if (!state || state.loading) return true;
        if (key === 'hint') state.hint = String(el.value || '');
        else if (key === 'paths') state.paths = String(el.value || '');
        else if (key === 'priority') state.selection.priority = el.value === 'tables' ? 'tables' : 'mvu';
        else if (key === 'useMvu' || key === 'useTables') state.selection[key] = el.checked;
        else if (key === 'path' || key === 'table') {
            const k = key === 'path' ? 'mvuPaths' : 'tableIds';
            const ids = new Set(state.selection[k] || []);
            if (el.checked) ids.add(el.value); else ids.delete(el.value);
            state.selection[k] = [...ids];
        }
        if (key !== 'hint') state.dirty = true;
        if (key === 'paths') updateCount(el);
        // 勾选来源后需更新其子项可操作状态；文本输入保持 DOM 不动。
        if (key !== 'hint' && key !== 'paths') render();
        return true;
    }
    function options() {
        if (!state || state.loading) return { ok: false, reason: 'combat-material-loading' };
        return { ok: true, generationHint: state.hint, materialSelection: selection(), materialChatId: state.preview?.chatId };
    }
    return { open, reset, refresh, input, options, captureDetails, view: () => state };
}
