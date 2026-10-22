import { normalizeMoodGroups, resolveMoodGroup } from '../../scene/mood-groups.js';
import { normalizeLive2dConfig, readLive2dConfig, saveLive2dConfig, LIVE2D_STORAGE_KEY } from './live2d-config.js';
import { importModelZip, importModelFolder, prepareModelPackage, readModelPackage, saveModelPackage, deleteModelPackage, exportModelZip, resolveModelBackup, LIVE2D_LIMITS } from './live2d-model-store.js';
import { syncLive2dStage, disposeLive2dStage } from './live2d-stage.js';
import { LIVE2D_EDITOR_STYLE } from './live2d-editor-style.js';
import { setStagePauseReason } from './stage-pause.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
export function renderLive2dLibrary(config, scopeLabel = '当前角色卡') {
    const entries = Object.entries(config.bindings || {});
    return `<div class="igs-settings-section igs-source-filter" data-live2d-library><div class="igs-settings-section-head"><div class="igs-settings-subhead">Live2D 角色模型 <span style="opacity:.55;font-size:12px">${entries.length}</span></div><button type="button" class="igs-settings-action igs-asset-zip" data-action="live2d-edit:">＋ 导入模型</button></div><p style="font-size:12px;opacity:.65;margin:0 0 12px">${esc(scopeLabel)} · 导入普通模型或已绑差分的成品 ZIP / 文件夹，成品自动恢复差分。</p>${entries.length ? entries.map(([name, b]) => `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid #ffffff12"><span style="background:#ebadc21a;color:#ebadc2;border-radius:9px;padding:10px">◇</span><div style="flex:1;min-width:0"><b>${esc(name)}</b><div style="font-size:12px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.modelId ? b.modelName || '本地模型' : '远程模型')} · ${Object.keys(b.moods).filter(m => m !== '*').length} 个差分绑定</div></div><button class="igs-settings-action" type="button" data-action="live2d-edit:${encodeURIComponent(name)}">编辑模型 / 差分</button></div>`).join('') : '<div style="padding:18px;text-align:center;border:1px dashed #ffffff25;border-radius:10px;font-size:13px;opacity:.7">还没有 Live2D 模型<br><small>无需上传到图床，直接导入完整模型包即可开始绑定。</small></div>'}${config.enabled ? '' : '<p style="color:#e9b7a2;font-size:12px">本卡 Live2D 已关闭，可在编辑器底部重新启用。</p>'}</div>`;
}

export function openLive2dPanel(current, storage, onSave, options = {}) {
    current.live2dPanel?.close(true);
    const root = options.root || current.dom?.overlay;
    const doc = root?.ownerDocument;
    if (!doc?.createElement) return { ok: false, reason: 'dom-unavailable' };
    const win = doc.defaultView;
    const scope = options.scope ?? current.snapshot?.readerSettings?._live2dScope ?? '';
    let config = readLive2dConfig(storage, scope);
    let pkg = null, source = null, sourceName = '', modelId = '', remoteUrl = '', staged = false, busy = false, closed = false, dirty = false, generation = 0, replay = 0;
    let metadata = { expressions: [], motions: {} }, originalName = '', activeRow = null, restoredBackup = null;
    const preview = { snapshot: { content: {} } };
    const panel = doc.createElement('dialog'); panel.className = 'igs-live2d-panel';
    panel.innerHTML = `<style>${LIVE2D_EDITOR_STYLE}</style><form><header><div><h2>Live2D 角色工作台</h2><p>角色 / Live2D / 模型与差分 · <span data-scope></span></p></div><button type="button" data-close aria-label="关闭 Live2D 编辑器">✕</button></header><div class="igs-l2-workspace"><section class="igs-l2-left"><div class="igs-l2-heading"><h3>实时预览</h3><button type="button" data-background style="padding:4px 9px;font-size:12px">切换底色</button></div><div class="igs-l2-preview" data-preview><div data-sprite></div><div class="igs-l2-empty"><b>◇</b><strong>让角色动起来</strong><span>导入模型后在这里预览<br>右侧绑定差分，点击 ▶ 试播</span></div></div><div class="igs-l2-status" role="status" aria-live="polite" data-status>等待导入模型</div><div class="igs-l2-import" data-drop><div class="igs-l2-buttons"><button class="primary" type="button" data-import>导入模型 / 成品 ZIP</button><button type="button" data-folder>选择文件夹</button></div><p>普通模型或已绑差分的成品包都可导入<br>成品 ZIP / 文件夹自动恢复表情、动作与位置</p><input type="file" accept=".zip,application/zip" data-zip-input hidden><input type="file" webkitdirectory multiple data-folder-input hidden></div><label class="igs-l2-field" data-entry-field hidden><span>模型包包含多个入口，请选择</span><select data-entry></select></label><div class="igs-l2-model" data-model>支持 Cubism 2 / 3 / 4 模型。文件保存在当前浏览器，不上传至第三方。</div><small>模型资源可本地读取；首次加载运行库仍需联网。请确认模型与 SDK 的使用授权。</small></section><section class="igs-l2-right"><section><div class="igs-l2-heading"><h3>01　角色与模型</h3><span class="igs-l2-tag">启用后暂停该角色静态差分</span></div><div class="igs-l2-row"><label class="igs-l2-field"><span>绑定角色名</span><input data-name list="igs-live2d-character-names" placeholder="与剧情中的角色名一致" required><datalist id="igs-live2d-character-names"></datalist></label><label class="igs-l2-field"><span>编辑已保存角色</span><select data-list><option value="">新建绑定</option></select></label></div></section><section><div class="igs-l2-heading"><h3>02　差分 → 表情 / 动作</h3><button type="button" data-add style="font-size:12px;padding:5px 9px">＋ 添加差分</button></div><p class="muted" style="margin-bottom:14px">沿用原情绪预设，如“平和、喜悦、愤怒”。剧情同义词自动归组；表情和动作可单独绑定，也可同时播放。</p><div class="igs-l2-map labels"><span>差分名称</span><span>模型表情</span><span>动作 / 序号</span><span>试播</span><span></span></div><div class="igs-l2-maps" data-maps></div><p class="muted" style="margin-top:12px">“默认 / 未匹配”用于没有单独绑定的情绪。动作名称由模型提供；▶ 可重复试播。</p></section><section><div class="igs-l2-heading"><h3>03　舞台位置</h3><button type="button" data-reset-layout style="font-size:12px;padding:5px 9px">重置</button></div><div class="igs-l2-layout">${[['scale','高度',1,250,90],['posX','横向',-100,200,50],['posY','纵向',-100,200,100]].map(([key,label,min,max,value]) => `<label class="igs-l2-field"><span>${label}<output data-output="${key}">${value}%</output></span><input data-${key} type="range" min="${min}" max="${max}" value="${value}"></label>`).join('')}</div></section><details><summary>高级：远程模型与运行库</summary><p>本地导入不需要填写网址。保留旧版远程模型兼容；自定义运行库只填写可信地址。</p><label>模型清单 URL<input data-url type="url" placeholder="https://…/model3.json"></label><button type="button" data-remote>加载远程模型</button><label>Cubism 2 Core<input data-core2 type="url"></label><label>Cubism 3/4 Core<input data-core4 type="url"></label></details></section></div><footer><p class="igs-l2-error" role="alert" data-error></p><div class="igs-l2-footer-actions"><label class="igs-l2-enable"><input type="checkbox" data-enabled>本卡启用 Live2D</label><div class="igs-l2-buttons"><button type="button" data-export>导出成品包</button><button class="danger" type="button" data-disable>移除绑定</button><button class="primary" type="submit" data-save>保存并应用</button></div></div><small>保存在本浏览器；保存不会上传模型。成品包包含模型与差分绑定，可直接导入；原“本卡素材包”暂不包含 Live2D。</small></footer></form>`;
    const q = name => panel.querySelector('[data-' + name + ']');
    q('scope').textContent = options.scopeLabel || (scope ? '当前角色卡' : '未选卡范围');
    q('enabled').checked = config.enabled; q('core2').value = config.runtime.core2; q('core4').value = config.runtime.core4;
    const characters = options.characters || {};
    const knownNames = [...new Set([...Object.keys(characters), ...Object.keys(config.bindings)])];
    function option(select, value, label) { const el = doc.createElement('option'); el.value = value; el.textContent = label; select.append(el); }
    for (const name of knownNames) option(panel.querySelector('#igs-live2d-character-names'), name, name);
    for (const name of Object.keys(config.bindings)) option(q('list'), name, name);
    const moodGroups = normalizeMoodGroups(options.moodGroups);
    const moodNames = [...new Set(moodGroups.map(group => group.label))];
    function error(e) { if (!closed) q('error').textContent = e?.message || String(e || ''); }
    function setBusy(value) { busy = value; for (const name of ['save','import','folder','entry','list','remote','export','disable']) q(name).disabled = value; }
    function layout() { return Object.fromEntries(['scale', 'posX', 'posY'].map(key => [key, Number(q(key).value)])); }
    function runtime() { return { core2: q('core2').value, core4: q('core4').value }; }
    function selectedAction(row) { const action = {}; const expression = row.querySelector('[data-expression]').value; const motion = row.querySelector('[data-motion]').value; if (expression) action.expression = expression; if (motion) Object.assign(action, JSON.parse(motion)); return action; }
    function fillSelects(row, action = {}) {
        const expressions = row.querySelector('[data-expression]'), motions = row.querySelector('[data-motion]'); expressions.replaceChildren(); motions.replaceChildren();
        option(expressions, '', '基础表情'); for (const name of metadata.expressions || []) option(expressions, name, name);
        if (action.expression && !Array.from(expressions.options).some(o => o.value === action.expression)) option(expressions, action.expression, action.expression + '（未检测到）');
        expressions.value = action.expression || '';
        option(motions, '', '自动待机');
        for (const [group, entries] of Object.entries(metadata.motions || {})) for (const item of (typeof entries === 'number' ? Array.from({ length: entries }, (_, index) => ({ index })) : entries)) option(motions, JSON.stringify({ motion: group, index: item.index }), group + ' / ' + (item.index + 1));
        const value = action.motion ? JSON.stringify({ motion: action.motion, index: action.index || 0 }) : '';
        if (value && !Array.from(motions.options).some(o => o.value === value)) option(motions, value, action.motion + ' / ' + ((action.index || 0) + 1) + '（未检测到）'); motions.value = value;
    }
    function refreshSelects() { for (const row of q('maps').children) fillSelects(row, selectedAction(row)); }
    function previewAction(row = activeRow, force = false) {
        if (closed || (!modelId && !remoteUrl)) return;
        if (force) replay++;
        if (row) { for (const r of q('maps').children) r.classList.toggle('is-playing', r === row); activeRow = row; }
        syncLive2dStage(q('preview'), q('sprite'), preview, { ...(modelId ? { modelId, package: pkg } : { url: remoteUrl }), runtime: runtime(), action: row ? selectedAction(row) : {}, replay, layout: layout() }, layout());
    }
    function addRow(name = '', action = {}) {
        const row = doc.createElement('div'); row.className = 'igs-l2-map';
        row.innerHTML = '<select data-mood aria-label="差分名称"></select><select data-expression aria-label="模型表情"></select><select data-motion aria-label="模型动作"></select><button type="button" data-play title="试播此差分" aria-label="试播此差分">▶</button><button type="button" data-remove title="删除此差分" aria-label="删除此差分">×</button>';
        const field = row.querySelector('[data-mood]');
        if (name === '*') {
            option(field, '*', '默认 / 未匹配'); row.dataset.default = 'true'; field.disabled = true; row.querySelector('[data-remove]').disabled = true;
        } else {
            option(field, '', '选择原预设差分');
            for (const preset of moodNames) option(field, preset, preset);
            if (name && !moodNames.includes(name)) option(field, name, name + '（已有绑定）');
            if (!name) {
                const used = new Set(Array.from(q('maps').children, r => r.querySelector('[data-mood]').value));
                name = moodNames.find(preset => preset !== '默认' && !used.has(preset)) || '';
            }
            field.value = name;
        }
        fillSelects(row, action);
        row.querySelector('[data-play]').onclick = () => previewAction(row, true);
        row.querySelector('[data-remove]').onclick = () => { if (activeRow === row) activeRow = null; row.remove(); dirty = true; previewAction(activeRow || q('maps').firstElementChild, true); };
        row.addEventListener('change', () => { dirty = true; previewAction(row); }); q('maps').append(row); return row;
    }
    function setRows(moods = {}, name = '', includeStatic = true) {
        q('maps').replaceChildren(); activeRow = null; addRow('*', moods['*'] || moods['默认'] || {});
        // 旧绑定保留精确词；新导入静态槽按原情绪组归约，不造另一套名称。
        const staticNames = (includeStatic ? Object.keys(characters[name] || {}) : []).map(m => resolveMoodGroup(m, moodGroups)).filter(Boolean);
        const names = [...new Set([...Object.keys(moods), ...staticNames])].filter(m => m !== '*' && m !== '默认');
        for (const mood of names) addRow(mood, moods[mood] || {});
        if (moods['默认']) addRow('默认', moods['默认']);
    }
    function collect() {
        const name = q('name').value.trim(); if (!name) throw new Error('请填写绑定角色名');
        if (!modelId && !remoteUrl) throw new Error('请先导入完整模型 ZIP / 文件夹');
        const moods = Object.create(null);
        for (const row of q('maps').children) { const mood = row.dataset.default ? '*' : row.querySelector('[data-mood]').value.trim(); if (!mood) throw new Error('差分名称不能为空'); if (Object.hasOwn(moods, mood)) throw new Error('差分名称重复：' + mood); moods[mood] = selectedAction(row); }
        const binding = { ...(modelId ? { modelId, modelName: sourceName || pkg?.entry || '本地模型' } : { url: remoteUrl }), moods, layout: layout() };
        const normalized = normalizeLive2dConfig({ runtime: runtime(), bindings: { [name]: binding } });
        return { name, binding: normalized.bindings[name], runtime: normalized.runtime };
    }
    function modelInfo() { q('model').textContent = pkg ? 'Cubism ' + metadata.cubism + ' · ' + Object.keys(pkg.files).length + ' 个资源 · ' + (pkg.bytes / 1048576).toFixed(1) + ' MB\n' + pkg.entry + '\n' + metadata.expressions.length + ' 个表情 · ' + Object.values(metadata.motions).reduce((n, list) => n + list.length, 0) + ' 个动作' : remoteUrl ? '远程模型\n' + remoteUrl : '支持 Cubism 2 / 3 / 4。请导入包含纹理与动作文件的完整模型包。'; if (restoredBackup) q('model').textContent += '\n成品绑定已恢复 · ' + Object.keys(restoredBackup.moods).filter(m => m !== '*').length + ' 个差分 · 表情 / 动作 / 位置\n原角色：' + (restoredBackup.name || '未命名') + '；可改为本卡角色名，保存并应用后生效。'; }
    async function selectCharacter(name) {
        const token = ++generation; disposeLive2dStage(preview); pkg = source = null; modelId = remoteUrl = ''; staged = false; metadata = { expressions: [], motions: {} }; originalName = name; restoredBackup = null;
        q('name').value = name; q('list').value = config.bindings[name] ? name : ''; q('entry-field').hidden = true;
        const binding = config.bindings[name] || {}; q('url').value = binding.url || ''; sourceName = binding.modelName || '';
        setRows(binding.moods || {}, name, !config.bindings[name]); for (const key of ['scale','posX','posY']) { const value = binding.layout?.[key] ?? ({ scale:90,posX:50,posY:100 }[key]); q(key).min = key === 'scale' ? 1 : -200; q(key).max = key === 'scale' ? 500 : 300; q(key).value = value; panel.querySelector('[data-output="' + key + '"]').textContent = value + '%'; }
        error(''); modelInfo(); q('status').textContent = '等待导入模型'; dirty = false;
        if (binding.modelId) { setBusy(true); try { const loaded = await readModelPackage(win, binding.modelId); if (closed || token !== generation) return; pkg = loaded; modelId = loaded.id; metadata = loaded.metadata; refreshSelects(); modelInfo(); previewAction(q('maps').firstElementChild); } catch (e) { error(e); } finally { if (!closed && token === generation) setBusy(false); } }
        else if (binding.url) { remoteUrl = binding.url; modelInfo(); previewAction(q('maps').firstElementChild); }
    }
    function useEntry(entry) {
        const backup = resolveModelBackup(source, entry);
        const next = prepareModelPackage(source, entry, win.crypto?.randomUUID?.() || ('local-' + Date.now() + '-' + Math.random().toString(36).slice(2)));
        let backupBinding = null;
        if (backup && backup.entry === entry) backupBinding = normalizeLive2dConfig({ bindings: { imported: { modelId: next.id, moods: backup.moods || {}, layout: backup.layout || {} } } }).bindings.imported;
        disposeLive2dStage(preview); pkg = next; modelId = next.id; remoteUrl = ''; staged = true; metadata = pkg.metadata; q('url').value = ''; dirty = true;
        if (backup && backup.entry === entry) {
            if (!q('name').value.trim() || q('name').value.trim() === restoredBackup?.name) q('name').value = backup.name;
            const c = backupBinding;
            setRows(c.moods, q('name').value, false); for (const key of ['scale','posX','posY']) { q(key).value = c.layout[key] ?? ({ scale:90,posX:50,posY:100 }[key]); panel.querySelector('[data-output="' + key + '"]').textContent = q(key).value + '%'; }
        } else refreshSelects();
        restoredBackup = backup;
        modelInfo(); previewAction(q('maps').firstElementChild); error('');
    }
    async function importFiles(files, folder = false) {
        if (busy || !files?.length) return; setBusy(true); error(''); q('status').textContent = '正在读取并检查模型资源…';
        const token = ++generation;
        const previous = { source, sourceName, entry: q('entry').value, entryHidden: q('entry-field').hidden };
        try {
            // 先让导入状态绘制出来；限制压缩包大小，在解压前检查每个条目预算。
            await new Promise(resolve => win.setTimeout(resolve, 0));
            if (!folder && files[0].size > LIVE2D_LIMITS.zipBytes) throw new Error('ZIP 文件不能超过 256MB');
            const imported = folder ? await importModelFolder(files) : importModelZip(new Uint8Array(await files[0].arrayBuffer()));
            if (closed || token !== generation) return;
            source = imported; sourceName = folder ? (files[0].webkitRelativePath.split('/')[0] || files[0].name) : files[0].name;
            q('entry').replaceChildren(); for (const entry of source.manifests) option(q('entry'), entry, entry);
            const entry = source.manifests.includes(source.backup?.entry) ? source.backup.entry : source.manifests[0]; q('entry').value = entry; q('entry-field').hidden = source.manifests.length < 2;
            useEntry(entry);
        } catch (e) {
            source = previous.source; sourceName = previous.sourceName; q('entry').replaceChildren();
            for (const entry of source?.manifests || []) option(q('entry'), entry, entry);
            q('entry').value = previous.entry; q('entry-field').hidden = previous.entryHidden;
            error(e); q('status').textContent = '导入未完成，原绑定未修改';
        }
        finally { if (!closed && token === generation) setBusy(false); q('zip-input').value = ''; q('folder-input').value = ''; }
    }
    async function cleanup(id) {
        if (!id) return;
        try { for (let i = 0; i < storage.length; i++) { const key = storage.key(i); if (key?.startsWith(LIVE2D_STORAGE_KEY) && Object.values(JSON.parse(storage.getItem(key)).bindings || {}).some(b => b.modelId === id)) return; } await deleteModelPackage(win, id); } catch { /* 清理失败不破坏已保存配置 */ }
    }
    async function save() {
        if (busy) return;
        let inserted = false;
        try {
            const { name, binding, runtime: nextRuntime } = collect();
            const next = readLive2dConfig(storage, scope);
            if (name !== originalName && next.bindings[name] && !win.confirm('角色「' + name + '」已有模型绑定，确定替换？')) return;
            setBusy(true);
            if (staged && pkg) { await saveModelPackage(win, pkg); inserted = true; }
            if (closed) { if (inserted) await cleanup(pkg.id); return; }
            const old = next.bindings[originalName]?.modelId, replaced = next.bindings[name]?.modelId;
            if (originalName && originalName !== name) delete next.bindings[originalName];
            next.bindings[name] = binding; next.enabled = q('enabled').checked; next.runtime = nextRuntime;
            config = saveLive2dConfig(storage, scope, next); staged = false; dirty = false;
            close(true); onSave?.(); if (old !== binding.modelId) cleanup(old); if (replaced !== binding.modelId) cleanup(replaced);
        } catch (e) { if (inserted) await cleanup(pkg.id); error(e); } finally { if (!closed) setBusy(false); }
    }
    async function remove() {
        if (busy || !config.bindings[originalName]) { error('当前还没有已保存的绑定'); return; }
        if (!win.confirm('移除「' + originalName + '」的 Live2D 绑定？将恢复原静态立绘。请先导出需要保留的模型。')) return;
        try { const next = readLive2dConfig(storage, scope); const id = next.bindings[originalName]?.modelId; delete next.bindings[originalName]; saveLive2dConfig(storage, scope, next); dirty = false; close(true); onSave?.(); cleanup(id); } catch (e) { error(e); }
    }
    function close(force = false) {
        if (closed) return true;
        if (!force && (busy || dirty) && !win.confirm(busy ? '操作尚未完成，确定关闭编辑器？' : '放弃尚未保存的修改？')) return false;
        closed = true; generation++; win.clearInterval(timer); disposeLive2dStage(preview); panel.close?.(); panel.remove(); setStagePauseReason(root, 'panel:live2d', false);
        if (current.live2dPanel?.element === panel) current.live2dPanel = null;
        options.onClose?.(); return true;
    }
    let lastStatus = '', statusVersion = '';
    const timer = win.setInterval(() => {
        const status = preview.live2dStatus; if (!status || closed) return;
        const signature = JSON.stringify(status);
        if (signature === lastStatus) return; lastStatus = signature;
        q('status').textContent = status.type === 'ready' ? '● 模型已就绪 · 点击右侧 ▶ 试播差分' + (status.warning ? '\n' + status.warning : '') : status.message || '正在加载运行库…';
        const version = JSON.stringify([status.expressions, status.motions]);
        if (!pkg && status.type === 'ready' && version !== statusVersion) { statusVersion = version; metadata = { expressions: status.expressions, motions: status.motions }; refreshSelects(); }
    }, 250);
    q('import').onclick = () => q('zip-input').click(); q('folder').onclick = () => q('folder-input').click();
    q('zip-input').onchange = () => importFiles(q('zip-input').files); q('folder-input').onchange = () => importFiles(q('folder-input').files, true);
    q('drop').ondragover = e => { e.preventDefault(); q('drop').classList.add('is-drag'); }; q('drop').ondragleave = () => q('drop').classList.remove('is-drag');
    q('drop').ondrop = e => { e.preventDefault(); q('drop').classList.remove('is-drag'); const files = e.dataTransfer.files; if (files.length !== 1 || !/\.zip$/i.test(files[0].name)) return error('拖放请使用一个 ZIP；文件夹请点击“选择文件夹”。'); importFiles(files); };
    q('entry').onchange = () => { try { useEntry(q('entry').value); } catch (e) { error(e); } };
    q('list').onchange = () => { if (dirty && !win.confirm('切换角色会放弃未保存修改，继续？')) { q('list').value = originalName; return; } selectCharacter(q('list').value); };
    q('add').onclick = () => { dirty = true; const row = addRow(); row.querySelector('[data-mood]').focus(); row.scrollIntoView?.({ block: 'nearest' }); };
    for (const key of ['scale','posX','posY']) q(key).oninput = () => { dirty = true; panel.querySelector('[data-output="' + key + '"]').textContent = q(key).value + '%'; previewAction(); };
    q('reset-layout').onclick = () => { for (const [key, value] of Object.entries({ scale:90,posX:50,posY:100 })) { q(key).value = value; q(key).oninput(); } };
    q('background').onclick = () => q('preview').classList.toggle('is-light');
    q('remote').onclick = () => { try { const normalized = normalizeLive2dConfig({ runtime: runtime(), bindings: { temp: { url: q('url').value } } }); disposeLive2dStage(preview); pkg = source = restoredBackup = null; modelId = ''; remoteUrl = normalized.bindings.temp.url; staged = false; dirty = true; q('entry-field').hidden = true; metadata = { expressions:[],motions:{} }; modelInfo(); previewAction(q('maps').firstElementChild); error(''); } catch(e) { error(e); } };
    q('export').onclick = async () => { if (busy) return; try { const { name, binding } = collect(); if (!pkg) throw new Error('远程模型需先下载完整资源并导入，才能连同模型一起导出'); setBusy(true); const bytes = exportModelZip(pkg, name, binding); const url = win.URL.createObjectURL(new Blob([bytes], { type:'application/zip' })); const a = doc.createElement('a'); a.href = url; a.download = name.replace(/[\\/:*?"<>|]/g, '_') + '-Live2D.zip'; a.click(); win.setTimeout(() => win.URL.revokeObjectURL(url), 30000); error(''); } catch(e) { error(e); } finally { if (!closed) setBusy(false); } };
    q('disable').onclick = remove; q('close').onclick = () => close();
    panel.addEventListener('input', () => { dirty = true; }); panel.addEventListener('change', e => { if (!e.target.matches('[data-list],[data-zip-input],[data-folder-input]')) dirty = true; });
    panel.addEventListener('cancel', e => { e.preventDefault(); close(); }); panel.addEventListener('click', e => e.stopPropagation());
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
    panel.querySelector('form').onsubmit = e => { e.preventDefault(); save(); };
    const api = { ok:true, element:panel, close }; current.live2dPanel = api;
    doc.body.append(panel); setStagePauseReason(root, 'panel:live2d', true); panel.showModal ? panel.showModal() : panel.setAttribute('open', '');
    selectCharacter(options.character ?? current.snapshot?.content?.spriteCharacter ?? current.snapshot?.content?.speaker ?? '');
    q('name').focus(); return api;
}
