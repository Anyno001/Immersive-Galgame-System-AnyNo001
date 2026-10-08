// 生成细线：对话框顶边一条 2px 渐变线，颜色取对话框文字色（换皮肤自动跟随），不压正文、不碰关闭键。
// 在画：线慢慢流动；画完：亮一下淡出；失败：停成偏红的一段，点开看原因，点过即收。
// 线上下留透明的可点区域，点一下在线上方弹一行小字说明在画什么。手动出图时也弹一下小字代替原来常驻的「生图中」提示。
const KIND_LABEL = { cg: 'CG', sprite: '立绘', background: '背景', item: '物品', edit: '局部重绘' };
const DONE_FLASH_MS = 1200;
const NOTE_MS = 1800;
const MANUAL_HOLD_MS = 6000;
// 楼层进度没发「完成」（服务中途跳过 / 出错）时的兜底：这么久没更新就当它结束。
const FLOOR_STALE_MS = 120000;

export function createGenerationStrip(options = {}) {
    const timers = options.timers || globalThis;
    const now = () => (typeof options.now === 'function' ? options.now() : Date.now());
    const jobs = new Map();
    const floors = new Map();
    let manualUntil = 0;
    let failure = null;
    let phase = 'idle';
    let tipOpen = false;
    let noteText = '';
    let timer = null;
    let noteTimer = null;

    function liveFloors() {
        const at = now();
        for (const [key, seen] of floors) if (at - seen >= FLOOR_STALE_MS) floors.delete(key);
        return floors.size;
    }
    const busy = () => jobs.size > 0 || liveFloors() > 0 || manualUntil > now();
    // 只靠楼层进度或手动保持在忙时，到期后回来再看一次。
    function nextRecheck() {
        const at = now();
        let soonest = manualUntil > at ? manualUntil - at : Infinity;
        for (const seen of floors.values()) soonest = Math.min(soonest, seen + FLOOR_STALE_MS - at);
        return Number.isFinite(soonest) ? Math.max(20, soonest + 20) : 0;
    }

    function summary() {
        const counts = {};
        for (const job of jobs.values()) counts[job.kind] = (counts[job.kind] || 0) + 1;
        if (floors.size && !counts.cg) counts.cg = floors.size;
        const parts = Object.entries(counts).map(([kind, n]) => `${KIND_LABEL[kind] || kind}${n > 1 ? ` ×${n}` : ''}`);
        return parts.length ? `正在画：${parts.join(' · ')}` : '正在准备出图…';
    }

    function tipText() {
        if (noteText) return noteText;
        if (!tipOpen) return '';
        if (phase === 'failed' && failure) return `${KIND_LABEL[failure.kind] || '图片'}没画成：${failure.error}`;
        if (phase === 'busy') return summary();
        return '';
    }

    function element(create) {
        const dialog = typeof options.getDialog === 'function' ? options.getDialog() : null;
        if (!dialog || typeof dialog.querySelector !== 'function') return null;
        let el = dialog.querySelector('#igs-gen-strip');
        if (!el && create && dialog.ownerDocument) {
            const doc = dialog.ownerDocument;
            el = doc.createElement('div');
            el.id = 'igs-gen-strip';
            el.setAttribute('role', 'status');
            el.setAttribute('hidden', '');
            const line = doc.createElement('span');
            line.className = 'igs-gen-line';
            el.appendChild(line);
            const tip = doc.createElement('span');
            tip.className = 'igs-gen-tip';
            tip.setAttribute('hidden', '');
            el.appendChild(tip);
            el.addEventListener('click', onClick);
            dialog.appendChild(el);
        }
        return el;
    }

    function render() {
        const el = element(phase !== 'idle');
        if (!el) return;
        el.setAttribute('data-state', phase);
        if (phase === 'idle') el.setAttribute('hidden', '');
        else el.removeAttribute('hidden');
        el.setAttribute('aria-label', phase === 'busy' ? summary() : phase === 'failed' ? '有图没画成，点开看原因' : '');
        const tip = el.querySelector ? el.querySelector('.igs-gen-tip') : null;
        if (tip) {
            const text = tipText();
            tip.textContent = text;
            if (text) tip.removeAttribute('hidden');
            else tip.setAttribute('hidden', '');
        }
    }

    function schedule(ms) {
        if (timer) timers.clearTimeout(timer);
        timer = ms > 0 ? timers.setTimeout(() => { timer = null; settle(); }, ms) : null;
    }

    // 忙闲变化后定下当前状态：忙 → busy；刚忙完 → done 闪一下再 idle；有失败 → failed 停住。
    function settle() {
        if (busy()) {
            phase = 'busy';
            if (!jobs.size) schedule(nextRecheck());
        } else if (failure) {
            phase = 'failed';
        } else if (phase === 'busy') {
            phase = 'done';
            tipOpen = false;
            schedule(DONE_FLASH_MS);
        } else if (phase === 'done' && !timer) {
            phase = 'idle';
        }
        render();
    }

    function onClick(event) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        if (phase === 'failed' && tipOpen) {
            failure = null;
            tipOpen = false;
            phase = 'idle';
            settle();
            return;
        }
        tipOpen = !tipOpen;
        render();
    }

    function note(text) {
        noteText = String(text || '');
        if (noteTimer) timers.clearTimeout(noteTimer);
        noteTimer = timers.setTimeout(() => { noteTimer = null; noteText = ''; render(); }, NOTE_MS);
        render();
    }

    return {
        // 后端活动事件：{ type: 'start'|'end', id, kind, ok, error }
        activity(event) {
            if (!event || !event.id) return;
            if (event.type === 'start') {
                jobs.set(event.id, { kind: event.kind || 'cg' });
                if (phase === 'done') schedule(0);
            } else if (event.type === 'end') {
                jobs.delete(event.id);
                if (event.ok === false) failure = { kind: event.kind || 'cg', error: event.error || '出图失败' };
                else if (event.ok === true && failure && !jobs.size) failure = null;
            }
            settle();
        },
        // 插图服务的楼层进度（写词阶段还没调到后端时也算在画）。
        floor(messageId, done) {
            const key = String(messageId);
            if (done) floors.delete(key);
            else floors.set(key, now());
            settle();
        },
        // 手动出图：先亮起来并弹一下小字，后端事件接手后由它决定何时结束。
        manual(text = '生图中…') {
            manualUntil = now() + MANUAL_HOLD_MS;
            if (phase === 'done') schedule(0);
            settle();
            note(text);
        },
        // 阅读器重建对话框后补挂。
        remount: render,
        getState: () => ({ phase, jobs: jobs.size, floors: floors.size, failure: failure ? { ...failure } : null, tip: tipText() }),
        dispose() {
            if (timer) timers.clearTimeout(timer);
            if (noteTimer) timers.clearTimeout(noteTimer);
            timer = null;
            noteTimer = null;
        },
    };
}

export const GENERATION_STRIP_STYLE_TEXT = `
#igs-gen-strip{position:absolute;left:12%;right:12%;top:-7px;height:14px;z-index:2;cursor:pointer;pointer-events:auto;color:inherit;}
#igs-gen-strip[hidden]{display:none!important;}
#igs-gen-strip .igs-gen-line{position:absolute;left:0;right:0;top:6px;height:2px;border-radius:2px;opacity:.55;background:linear-gradient(90deg,transparent,currentColor,transparent);background-size:40% 100%;background-repeat:no-repeat;}
#igs-gen-strip[data-state="busy"] .igs-gen-line{animation:igs-gen-flow 2.4s ease-in-out infinite;}
#igs-gen-strip[data-state="done"] .igs-gen-line{background-size:100% 100%;opacity:0;animation:igs-gen-done 1.2s ease-out;}
#igs-gen-strip[data-state="failed"] .igs-gen-line{left:35%;right:35%;background:linear-gradient(90deg,transparent,#e07070,transparent);background-size:100% 100%;opacity:.85;}
#igs-gen-strip .igs-gen-tip{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);max-width:min(420px,80vw);padding:3px 10px;border-radius:999px;background:var(--igs-dialog-bg,rgba(20,20,24,.82));font-size:12px;line-height:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#igs-gen-strip .igs-gen-tip[hidden]{display:none;}
@keyframes igs-gen-flow{0%{background-position:-60% 0;}100%{background-position:160% 0;}}
@keyframes igs-gen-done{0%{opacity:.9;}100%{opacity:0;}}
@media (prefers-reduced-motion:reduce){#igs-gen-strip[data-state="busy"] .igs-gen-line{animation:none;background-size:100% 100%;opacity:.4;}}
`;
