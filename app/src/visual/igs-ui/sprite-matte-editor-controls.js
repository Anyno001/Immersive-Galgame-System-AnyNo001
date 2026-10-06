// 遮罩修复编辑器工具与画布：画笔坐标始终映射回原像素；保存失败时保留编辑内容。
import { applyBrushStroke, mapPointerToImage } from '../../media/matte-brush.js';

export function mountEditControls({ doc, editor, el, btn, bar, msg, stage, close, onSaved, confirm }) {
    const s = editor.session;
    const brush = { mode: 'keep', radius: 12, strength: 0.6 };
    const modes = [['keep', '保留'], ['erase', '删除'], ['soft', '软边发丝']];
    if (editor.aiAvailable) modes.push(['ai', 'AI 选区']);
    // AI 选区单独保存，不进入遮罩历史；只用于生成修复遮罩。
    const selection = new Uint8ClampedArray(s.width * s.height);
    const modeButtons = modes.map(([mode, label]) => {
        const b = btn(label, () => { brush.mode = mode; syncModes(); });
        b.setAttribute('data-mode', mode);
        return b;
    });
    const syncModes = () => modeButtons.forEach((b) => {
        const on = b.getAttribute('data-mode') === brush.mode;
        if (b.classList) b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
    });
    const size = el('input');
    size.type = 'range';
    size.min = '2';
    size.max = '64';
    size.value = String(brush.radius);
    size.setAttribute('aria-label', '画笔大小');
    size.addEventListener('input', () => { brush.radius = Number(size.value) || 12; });
    bar.appendChild(size);
    const undo = btn('撤销', () => { s.undo(); draw(); });
    const redo = btn('重做', () => { s.redo(); draw(); });
    btn('恢复自动抠图', () => { s.resetToAuto(); draw(); });
    if (editor.aiAvailable) {
        const note = el('input');
        note.type = 'text';
        note.placeholder = 'AI 修复说明（可留空）';
        note.setAttribute('aria-label', 'AI 修复说明');
        bar.appendChild(note);
        const candidateImg = el('img', 'igs-matte-candidate');
        candidateImg.alt = 'AI 修复候选';
        stage.appendChild(candidateImg);
        let acceptAi = null;
        let discardAi = null;
        const showCandidate = (url) => {
            candidateImg.src = url || '';
            if (url) candidateImg.removeAttribute('hidden'); else candidateImg.setAttribute('hidden', '');
            if (acceptAi) acceptAi.disabled = !url;
            if (discardAi) discardAi.disabled = !url;
        };
        const runAi = btn('AI 修复选区', async () => {
            if (!selection.some((v) => v > 0)) { msg.textContent = '请先用「AI 选区」画出需要重建的区域。'; return; }
            runAi.disabled = true;
            msg.textContent = '正在请求 AI 局部重绘…';
            let r = null;
            try { r = await editor.aiRepair(selection, note.value); } catch (error) { r = null; }
            runAi.disabled = false;
            if (r && r.ok) {
                showCandidate(r.candidateDataUrl);
                msg.textContent = 'AI 候选已生成（生成式重建，不是恢复原始像素）。接受前不会修改素材。';
            } else {
                showCandidate('');
                msg.textContent = (r && r.message) || 'AI 局部重绘失败，素材未改动。';
            }
        });
        acceptAi = btn('接受 AI 结果', async () => {
            acceptAi.disabled = true;
            let r = null;
            try { r = await editor.acceptAi(); } catch (error) { r = null; }
            if (r && r.ok) { if (typeof onSaved === 'function') onSaved(r); close(); return; }
            msg.textContent = (r && r.message) || 'AI 结果未保存，素材未改动。';
            if (r && (r.reason === 'stale-revision' || r.reason === 'no-candidate')) showCandidate(''); else acceptAi.disabled = false;
        });
        discardAi = btn('放弃 AI 结果', () => { editor.cancelAi(); showCandidate(''); msg.textContent = '已放弃 AI 候选，素材未改动。'; });
        showCandidate('');
    } else if (editor.aiUnavailableReason) {
        const off = btn('AI 修复选区', () => {});
        off.disabled = true;
        off.title = editor.aiUnavailableReason;
    }
    const save = btn('保存', async () => {
        save.disabled = true;
        msg.textContent = '正在保存…';
        let result = null;
        try { result = await editor.save(); } catch (error) { result = null; }
        if (result && result.ok) {
            if (typeof onSaved === 'function') onSaved(result);
            close();
            return;
        }
        msg.textContent = (result && result.message) || '保存失败，当前修改仍保留在编辑器中。';
        save.disabled = false;
    });
    btn('取消', () => {
        if (!s.isDirty()) { close(); return; }
        const answer = typeof confirm === 'function' ? confirm('放弃未保存的修改？') : true;
        if (answer && typeof answer.then === 'function') {
            answer.then((ok) => { if (ok) close(); }).catch(() => {});
            return;
        }
        if (answer) close();
    });
    const canvas = el('canvas', 'igs-matte-canvas');
    canvas.width = s.width;
    canvas.height = s.height;
    stage.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const draw = () => {
        const p = editor.preview();
        const img = ctx.createImageData(p.width, p.height);
        img.data.set(p.data);
        for (let i = 0; i < selection.length; i += 1) {
            if (!selection[i]) continue;
            const k = i * 4;
            img.data[k] = (img.data[k] + 255) >> 1;
            img.data[k + 1] >>= 1;
            img.data[k + 2] >>= 1;
            img.data[k + 3] = Math.max(img.data[k + 3], 160);
        }
        ctx.putImageData(img, 0, 0);
        undo.disabled = !s.canUndo();
        redo.disabled = !s.canRedo();
    };
    let points = null;
    const at = (e) => mapPointerToImage(e.clientX, e.clientY, canvas.getBoundingClientRect(), s.width, s.height);
    canvas.addEventListener('pointerdown', (e) => {
        if (e.preventDefault) e.preventDefault();
        const p = at(e);
        if (!p) return;
        points = [p];
        if (typeof canvas.setPointerCapture === 'function') canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => { if (!points) return; const p = at(e); if (p) points.push(p); });
    canvas.addEventListener('pointerup', () => {
        if (!points) return;
        if (brush.mode === 'ai') applyBrushStroke(selection, s.width, s.height, points, { mode: 'keep', radius: brush.radius });
        else s.stroke(points, brush);
        points = null;
        draw();
    });
    canvas.addEventListener('pointercancel', () => { points = null; });
    syncModes();
    draw();
}
