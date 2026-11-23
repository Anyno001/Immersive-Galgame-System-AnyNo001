// 主角开局「自行填写」独立弹窗（六维属性 + 擅长项），不依赖人物状态页，未开启卡片战斗时也可正常使用。
// 超出常规上限（单项 3–18 或合计 > 72）时，弹出带深红色感叹号的「是否需要开挂」确认；选择「是」后解除上限。
import { ABILITY_KEYS, ABILITY_LABELS, MANUAL_BUILD, MANUAL_TOTAL } from '../../combat/abilities.js';
import { BUILD_PICK_SLOTS, groupPickCandidates, pickSummary } from '../../scene/stats/stat-build.js';

const MODAL_ID = 'igs-hero-manual-modal';
const STYLE_ID = 'igs-hero-manual-modal-style';

const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const MODAL_STYLE = `
#${MODAL_ID} {
    position: fixed; inset: 0; z-index: 99992;
    display: flex; align-items: center; justify-content: center;
    background: rgba(12, 14, 20, 0.72); backdrop-filter: blur(6px);
    padding: 16px; box-sizing: border-box; font-family: inherit;
}
#${MODAL_ID} .igs-hm-card {
    width: min(560px, 100%); max-height: min(88vh, 720px); overflow-y: auto;
    background: #181b24; color: #f1f5f9; border: 1px solid rgba(255,255,255,0.14);
    border-radius: 14px; padding: 18px 20px; box-shadow: 0 20px 50px rgba(0,0,0,0.55);
}
#${MODAL_ID} .igs-hm-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
#${MODAL_ID} .igs-hm-title { font-size: 16px; font-weight: 700; margin: 0; }
#${MODAL_ID} .igs-hm-close {
    background: transparent; border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1;
    border-radius: 8px; padding: 4px 10px; cursor: pointer; font-size: 13px;
}
#${MODAL_ID} .igs-hm-note { font-size: 12.5px; color: #94a3b8; line-height: 1.5; margin-bottom: 12px; }
#${MODAL_ID} .igs-hm-sec { margin: 12px 0; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); }
#${MODAL_ID} .igs-hm-sec-title { font-size: 13.5px; font-weight: 600; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
#${MODAL_ID} .igs-hm-budget { font-size: 12px; color: #93c5fd; font-weight: 500; }
#${MODAL_ID} .igs-hm-budget.is-over { color: #f87171; font-weight: 700; }
#${MODAL_ID} .igs-hm-budget.is-cheat { color: #fca5a5; font-weight: 700; }
#${MODAL_ID} .igs-hm-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
#${MODAL_ID} .igs-hm-skill-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
#${MODAL_ID} .igs-hm-field { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: #cbd5e1; }
#${MODAL_ID} .igs-hm-field input, #${MODAL_ID} .igs-hm-field select {
    background: rgba(255,255,255,0.07); color: #f8fafc; border: 1px solid rgba(255,255,255,0.16);
    border-radius: 8px; padding: 6px 8px; font-size: 13.5px; box-sizing: border-box; width: 100%;
}
#${MODAL_ID} .igs-hm-cheat-box {
    margin: 12px 0; padding: 12px 14px; border-radius: 10px;
    background: rgba(127, 29, 29, 0.28); border: 1.5px solid #991b1b;
    display: flex; align-items: flex-start; gap: 12px;
}
#${MODAL_ID} .igs-hm-bang {
    flex: 0 0 auto; width: 28px; height: 28px; border-radius: 50%;
    background: #991b1b; color: #fef2f2; font-weight: 900; font-size: 18px;
    display: inline-flex; align-items: center; justify-content: center;
    box-shadow: 0 0 0 3px rgba(153, 27, 27, 0.35);
}
#${MODAL_ID} .igs-hm-cheat-body { flex: 1; font-size: 13px; line-height: 1.5; color: #fee2e2; }
#${MODAL_ID} .igs-hm-cheat-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
#${MODAL_ID} .igs-hm-err { font-size: 12.5px; color: #fca5a5; margin-top: 8px; min-height: 16px; }
#${MODAL_ID} .igs-hm-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
#${MODAL_ID} .igs-hm-btn {
    border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.08);
    color: #f8fafc; border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer;
}
#${MODAL_ID} .igs-hm-btn.is-primary { background: #2563eb; border-color: #3b82f6; font-weight: 600; }
#${MODAL_ID} .igs-hm-btn.is-danger { background: #991b1b; border-color: #b91c1c; color: #fff; font-weight: 600; }
#${MODAL_ID} .igs-hm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
`;

export function checkHeroScoresOverCap(scores) {
    const total = ABILITY_KEYS.reduce((sum, key) => sum + (Number(scores?.[key]) || 0), 0);
    const overSingle = ABILITY_KEYS.some((key) => {
        const v = Number(scores?.[key]);
        return !Number.isInteger(v) || v < MANUAL_BUILD.min || v > MANUAL_BUILD.max;
    });
    return { total, max: MANUAL_TOTAL, overSingle, overTotal: total > MANUAL_TOTAL, over: overSingle || total > MANUAL_TOTAL };
}

function slotLabel(slot) {
    const idx = Number(slot.replace(/\D/g, '')) || 1;
    const cn = ['一', '二', '三', '四', '五'][idx - 1] || String(idx);
    return slot.startsWith('strong') ? `擅长 ${cn}` : `比较擅长 ${cn}`;
}

export function createHeroManualModal(doc, { onSubmit } = {}) {
    let root = null;
    let state = null;

    function ensureStyle() {
        if (!doc?.head || doc.getElementById?.(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = MODAL_STYLE;
        doc.head.appendChild(style);
    }

    function readDraftFromDom() {
        if (!root || !state) return;
        for (const key of ABILITY_KEYS) {
            const el = root.querySelector?.(`[data-hm-score="${key}"]`);
            if (el) {
                const n = Math.round(Number(el.value));
                state.scores[key] = Number.isFinite(n) && n >= 1 ? n : MANUAL_BUILD.min;
            }
        }
        for (const slot of BUILD_PICK_SLOTS) {
            const el = root.querySelector?.(`[data-hm-slot="${slot}"]`);
            if (el) state.picks[slot] = String(el.value || '').trim();
        }
    }

    function syncBudgetUi() {
        if (!root || !state) return;
        const check = checkHeroScoresOverCap(state.scores);
        const budget = root.querySelector?.('[data-hm-budget]');
        if (budget) {
            if (state.uncapped) {
                budget.textContent = `! 已开启开挂模式（不设上限 · 当前合计 ${check.total}）`;
                budget.className = 'igs-hm-budget is-cheat';
            } else if (check.over) {
                const extra = check.overTotal ? `超出总分上限 ${check.total - MANUAL_TOTAL} 点` : `单项超出 ${MANUAL_BUILD.min}–${MANUAL_BUILD.max}`;
                budget.textContent = `${extra} · 合计 ${check.total}/${MANUAL_TOTAL}`;
                budget.className = 'igs-hm-budget is-over';
            } else {
                budget.textContent = `剩余 ${MANUAL_TOTAL - check.total} 点 · 合计 ${check.total}/${MANUAL_TOTAL}`;
                budget.className = 'igs-hm-budget';
            }
        }
        const selects = [...(root.querySelectorAll?.('select[data-hm-slot]') || [])];
        const chosen = selects.map((el) => el.value).filter(Boolean);
        for (const el of selects) {
            for (const opt of el.options || []) {
                opt.disabled = Boolean(opt.value) && opt.value !== el.value && chosen.includes(opt.value);
            }
        }
    }

    function render() {
        if (!root || !state) return;
        const { groups } = groupPickCandidates({ custom: [] });
        const scoreInputs = ABILITY_KEYS.map((key) => `<label class="igs-hm-field"><span>${esc(ABILITY_LABELS[key])}</span>`
            + `<input type="number" inputmode="numeric" min="1" ${state.uncapped ? '' : `max="${MANUAL_BUILD.max}"`} data-hm-score="${key}" value="${esc(state.scores[key])}"></label>`).join('');
        const taken = new Set(Object.values(state.picks).filter(Boolean));
        const slotSelects = BUILD_PICK_SLOTS.map((slot) => {
            const cur = state.picks[slot] || '';
            const opt = (name) => `<option value="${esc(name)}"${name === cur ? ' selected' : ''}${taken.has(name) && name !== cur ? ' disabled' : ''}>${esc(name)}</option>`;
            const opts = [`<option value=""${cur ? '' : ' selected'}>未选</option>`,
                ...groups.map((g) => `<optgroup label="${esc(g.label)}">${g.items.map(opt).join('')}</optgroup>`)].join('');
            return `<label class="igs-hm-field"><span>${esc(slotLabel(slot))}</span><select data-hm-slot="${slot}">${opts}</select></label>`;
        }).join('');
        const cheatConfirm = state.askCheat ? `<div class="igs-hm-cheat-box" role="alertdialog" aria-label="是否开启开挂模式">`
            + `<span class="igs-hm-bang" aria-hidden="true">!</span>`
            + `<div class="igs-hm-cheat-body"><strong>超出属性上限！是否需要开挂？</strong><div>常规六维要求单项 ${MANUAL_BUILD.min}–${MANUAL_BUILD.max}、合计不超过 ${MANUAL_TOTAL} 点。选择「是」后将解除所有属性上限。</div>`
            + `<div class="igs-hm-cheat-actions">`
            + `<button type="button" class="igs-hm-btn is-danger" data-hm-act="cheat-yes"${state.busy ? ' disabled' : ''}>是，开启开挂（不设上限）</button>`
            + `<button type="button" class="igs-hm-btn" data-hm-act="cheat-no"${state.busy ? ' disabled' : ''}>否，返回修改</button>`
            + `</div></div></div>` : '';
        root.innerHTML = `<div class="igs-hm-card" role="dialog" aria-modal="true" aria-label="自行填写主角六维与擅长项">`
            + `<div class="igs-hm-head"><h3 class="igs-hm-title">主角属性与擅长项（自行填写）</h3>`
            + `<button type="button" class="igs-hm-close" data-hm-act="close"${state.busy ? ' disabled' : ''}>取消</button></div>`
            + `<div class="igs-hm-note">手动填写主角六维属性并选择擅长项；主角简介、初始货币及职业（开启卡片战斗时）仍会自动生成。</div>`
            + `<div class="igs-hm-sec"><div class="igs-hm-sec-title"><span>六维属性（单项 ${MANUAL_BUILD.min}–${MANUAL_BUILD.max}，总分 ≤ ${MANUAL_TOTAL}）</span><span class="igs-hm-budget" data-hm-budget></span></div>`
            + `<div class="igs-hm-grid">${scoreInputs}</div></div>`
            + `${cheatConfirm}`
            + `<div class="igs-hm-sec"><div class="igs-hm-sec-title"><span>擅长项（必选 3 项擅长，可选 5 项比较擅长）</span></div>`
            + `<div class="igs-hm-skill-grid">${slotSelects}</div></div>`
            + `<div class="igs-hm-err">${esc(state.error || '')}</div>`
            + `<div class="igs-hm-actions">`
            + `<button type="button" class="igs-hm-btn" data-hm-act="close"${state.busy ? ' disabled' : ''}>稍后</button>`
            + `<button type="button" class="igs-hm-btn is-primary" data-hm-act="submit"${state.busy ? ' disabled' : ''}>${state.busy ? '正在保存…' : '确认并生成其余设定'}</button>`
            + `</div></div>`;
        syncBudgetUi();
    }

    async function submitNow() {
        if (!state || state.busy) return;
        readDraftFromDom();
        const picked = pickSummary({ picks: state.picks, custom: [] });
        if (!picked.ok) {
            state.error = picked.errors.includes('stats-build-strong-missing')
                ? '请至少选满 3 项「擅长」技能'
                : '同一项技能不能重复占用两个格子';
            render();
            return;
        }
        const check = checkHeroScoresOverCap(state.scores);
        if (!state.uncapped && check.over) {
            state.askCheat = true;
            state.error = '';
            render();
            return;
        }
        state.busy = true;
        state.error = '';
        render();
        try {
            const res = typeof onSubmit === 'function'
                ? await onSubmit({
                    scores: { ...state.scores },
                    uncapped: state.uncapped === true,
                    skills: picked.skills,
                    attributes: picked.attributes,
                    slots: picked.slots,
                })
                : { ok: false, reason: 'stats-runtime-missing' };
            if (res && res.ok) { close(); return; }
            if (res && res.reason === 'stats-build-over-cap' && !state.uncapped) {
                state.busy = false;
                state.askCheat = true;
                render();
                return;
            }
            state.busy = false;
            state.error = `保存失败：${res?.reason || '未知错误'}`;
            render();
        } catch {
            state.busy = false;
            state.error = '保存失败，请重试';
            render();
        }
    }

    function open(overlay) {
        if (!overlay || !doc) return { ok: false, reason: 'hero-manual-modal-unavailable' };
        ensureStyle();
        close();
        state = {
            scores: Object.fromEntries(ABILITY_KEYS.map((key) => [key, 10])),
            picks: Object.fromEntries(BUILD_PICK_SLOTS.map((slot) => [slot, ''])),
            uncapped: false,
            askCheat: false,
            busy: false,
            error: '',
        };
        root = doc.createElement('div');
        root.id = MODAL_ID;
        root.addEventListener('input', () => { readDraftFromDom(); syncBudgetUi(); });
        root.addEventListener('change', () => { readDraftFromDom(); syncBudgetUi(); });
        root.addEventListener('click', (event) => {
            event.stopPropagation?.();
            const btn = event.target?.closest?.('[data-hm-act]');
            if (!btn) return;
            const act = btn.getAttribute('data-hm-act');
            if (act === 'close') { if (!state?.busy) close(); return; }
            if (act === 'cheat-no') { state.askCheat = false; render(); return; }
            if (act === 'cheat-yes') { state.uncapped = true; state.askCheat = false; void submitNow(); return; }
            if (act === 'submit') { void submitNow(); }
        });
        overlay.appendChild(root);
        render();
        return { ok: true };
    }

    function close() {
        if (root) { try { root.remove(); } catch { /* */ } root = null; }
        state = null;
    }

    return { open, close, isOpen: () => Boolean(root) };
}
