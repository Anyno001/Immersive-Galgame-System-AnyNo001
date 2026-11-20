// 设置面板内的提示、确认与输入框，替代浏览器 alert / confirm / prompt。
// 浏览器弹窗会退出全屏。面板重绘会整体替换 innerHTML，挂起的对话记在控制器里，由 remount 在重绘后补回（含输入框里已打的字）。
import { normalizeCurrencyEditInput } from '../../scene/stats/stat-currency-edit.js';
import { CURRENCY_NAME_MAX, CURRENCY_RATE_MIN, CURRENCY_RATE_MAX } from '../../scene/stats/stat-currency.js';
import { MONEY_TIERS } from '../../scene/stats/stat-vocab.js';

export const SETTINGS_DIALOG_STYLE_TEXT = `
#igs-unified-settings .igs-settings-dialog{position:absolute;left:50%;top:50%;bottom:auto;transform:translate(-50%,-50%);z-index:6;box-sizing:border-box;width:min(480px,calc(100% - 32px));max-height:min(80%,calc(var(--igs-settings-vh,100dvh) - 48px));overflow:auto;padding:14px 16px;border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-panel);color:var(--igs-settings-ink);border:1px solid var(--igs-settings-line-strong);display:flex;flex-direction:column;gap:10px;pointer-events:auto}
#igs-unified-settings .igs-settings-dialog.is-view,#igs-unified-settings .igs-settings-dialog.is-edit{width:min(640px,calc(100% - 32px))}
#igs-unified-settings .igs-settings-dialog-text{width:100%;min-height:220px;max-height:min(46vh,320px);box-sizing:border-box;resize:vertical;padding:8px 10px;border:1px solid var(--igs-settings-line,rgba(128,128,128,.22));border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-field);color:var(--igs-settings-ink);font:inherit;font-size:12px;line-height:1.5;outline:none}
#igs-unified-settings .igs-settings-dialog-text:focus{border-color:var(--igs-settings-accent)}
#igs-unified-settings .igs-settings-dialog-msg{font-size:13px;line-height:1.6;white-space:pre-line;word-break:break-word}
#igs-unified-settings .igs-settings-dialog-msg.is-scroll{max-height:min(50vh,360px);overflow:auto;white-space:pre-wrap}
#igs-unified-settings .igs-settings-dialog .igs-settings-field{margin:0}
#igs-unified-settings .igs-settings-dialog-actions{display:flex;justify-content:flex-end;gap:8px}
#igs-unified-settings .igs-settings-dialog-actions [data-settings-dialog="ok"]{background:var(--igs-settings-accent);color:var(--igs-settings-on-accent)}
#igs-unified-settings .igs-settings-dialog.is-choose .igs-settings-dialog-msg{font-size:14px;font-weight:600}
#igs-unified-settings .igs-settings-dialog-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:8px}
#igs-unified-settings .igs-settings-dialog-choice{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:58px;padding:8px 4px;border:1px solid var(--igs-settings-line);border-radius:var(--igs-settings-radius-control);background:var(--igs-settings-raised);color:var(--igs-settings-ink);font:inherit;cursor:pointer}
#igs-unified-settings .igs-settings-dialog-choice b{font-size:20px;line-height:1.1;font-weight:600;font-variant-numeric:tabular-nums}
#igs-unified-settings .igs-settings-dialog-choice span{font-size:12px;line-height:1.3;opacity:.72}
#igs-unified-settings .igs-settings-dialog-choice.is-current{border-color:var(--igs-settings-accent)}
#igs-unified-settings .igs-settings-dialog-choice.is-current b{color:var(--igs-settings-accent)}
#igs-unified-settings .igs-settings-dialog.is-pick .igs-settings-dialog-choices{grid-template-columns:repeat(auto-fill,minmax(72px,1fr));max-height:min(46vh,320px);overflow:auto}
#igs-unified-settings .igs-settings-dialog.is-pick .igs-settings-dialog-choice{min-height:40px;font-size:13px}
#igs-unified-settings .igs-settings-dialog.is-pick .igs-settings-dialog-choice.is-current{background:var(--igs-settings-accent);color:var(--igs-settings-on-accent)}
#igs-unified-settings .igs-settings-dialog-actions [data-settings-dialog="all"]{margin-right:auto}
#igs-unified-settings .igs-settings-dialog-select{display:block;box-sizing:border-box;min-width:0;max-width:100%;width:100%;margin:10px 0 4px;padding:6px 8px;font-size:14px}
#igs-unified-settings .igs-settings-dialog-choice:focus-visible{outline:2px solid var(--igs-settings-accent);outline-offset:2px}
#igs-unified-settings .igs-settings-dialog.is-form{width:min(560px,calc(100% - 32px))}
#igs-unified-settings .igs-settings-dialog-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}
#igs-unified-settings .igs-settings-dialog-form .igs-settings-field{min-width:0}
#igs-unified-settings .igs-settings-dialog-form .igs-settings-field.is-wide{grid-column:1/-1}
#igs-unified-settings .igs-settings-dialog-form .igs-settings-field[hidden]{display:none}
#igs-unified-settings .igs-settings-dialog-form input,#igs-unified-settings .igs-settings-dialog-form select{width:100%;box-sizing:border-box;min-width:0}
#igs-unified-settings .igs-settings-dialog-form textarea{width:100%;box-sizing:border-box;min-height:56px;resize:vertical;padding:6px 8px;border:1px solid var(--igs-settings-line,rgba(128,128,128,.22));border-radius:var(--igs-settings-radius-small);background:var(--igs-settings-field);color:var(--igs-settings-ink);font:inherit;font-size:12px;line-height:1.5;outline:none}
#igs-unified-settings .igs-settings-dialog-form input[readonly]{opacity:.7}
#igs-unified-settings .igs-settings-dialog-form-advanced{grid-column:1/-1}
#igs-unified-settings .igs-settings-dialog-form-advanced>.igs-settings-dialog-form{margin-top:8px}
@media (max-width:520px){#igs-unified-settings .igs-settings-dialog-form{grid-template-columns:minmax(0,1fr)}}
`;

function nativeFallback(globalObj) {
    return (kind, message, value, fields = []) => {
        if (kind === 'busy') return true;
        if (kind === 'currency') {
            if (typeof globalObj?.prompt !== 'function') return null;
            const values = {};
            for (const field of fields) {
                const answer = globalObj.prompt(`${message}\n${field.label}`, field.value);
                if (answer === null || !String(answer).trim()) return null;
                values[field.key] = field.key === 'name' ? String(answer).trim() : Number(answer);
            }
            const clean = normalizeCurrencyEditInput({ name: values.name, rate: values.rate,
                table: Object.fromEntries(MONEY_TIERS.map(tier => [tier, values[tier]])), base: 'form' });
            return clean ? { name: clean.name, table: clean.table, rate: clean.rate } : null;
        }
        // 数字表单退回逐项输入框；有一项取消或不合格就整体作废。
        if (kind === 'numbers') {
            if (!globalObj || typeof globalObj.prompt !== 'function') return null;
            const values = {};
            for (const field of fields) {
                const answer = globalObj.prompt(`${message}\n${field.label}（${field.min}到${field.max}的整数）`, field.value);
                const v = Number(String(answer == null ? '' : answer).trim());
                if (answer == null || !String(answer).trim() || !Number.isInteger(v) || v < field.min || v > field.max) return null;
                values[field.key] = v;
            }
            return values;
        }
        // 表单退回逐项输入框；有一项取消就整体作废，不合格的由调用方的校验兜底。
        if (kind === 'form') {
            if (!globalObj || typeof globalObj.prompt !== 'function') return null;
            const values = {};
            for (const field of fields) {
                const answer = globalObj.prompt(`${message}\n${field.label}`, field.value);
                if (answer == null) return null;
                values[field.key] = String(answer).trim();
            }
            return values;
        }
        if (kind === 'confirm') return globalObj && typeof globalObj.confirm === 'function' ? Boolean(globalObj.confirm(message)) : true;
        if (kind === 'alert' || kind === 'view') {
            if (globalObj && typeof globalObj.alert === 'function') globalObj.alert(message);
            return true;
        }
        if (kind === 'choose') {
            if (!globalObj || typeof globalObj.prompt !== 'function') return value;
            const answer = globalObj.prompt(message, value);
            return answer == null ? null : String(answer).trim();
        }
        if (kind === 'pick') {
            if (!globalObj || typeof globalObj.prompt !== 'function') return null;
            const answer = globalObj.prompt(`${message}（用顿号或逗号分隔）`, value);
            return answer == null ? null : String(answer).split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean);
        }
        if (kind === 'edit') {
            if (!globalObj || typeof globalObj.prompt !== 'function') return null;
            const edited = globalObj.prompt(message, value);
            return edited == null ? null : String(edited);
        }
        if (!globalObj || typeof globalObj.prompt !== 'function') return null;
        const answer = globalObj.prompt(message, value);
        return answer == null ? null : String(answer);
    };
}

function findHost(container) {
    if (!container || typeof container.querySelector !== 'function') return null;
    return container.querySelector('#igs-unified-settings') || container;
}

export function createSettingsDialogs({ getContainer = () => null, global: globalObj = globalThis, fallback } = {}) {
    const askNative = fallback || nativeFallback(globalObj);
    let pending = null;

    function cancelValue(entry) {
        if (entry.kind === 'alert') return true;
        return entry.kind === 'confirm' ? false : null;
    }

    function detach(entry) {
        const el = entry && entry.el;
        if (el && el.parentNode) el.parentNode.removeChild(el);
        if (entry) entry.el = null;
    }

    function settle(entry, result) {
        if (!entry || pending !== entry) return;
        pending = null;
        detach(entry);
        entry.resolve(result);
    }

    function build(host, entry) {
        const doc = host.ownerDocument;
        if (!doc || typeof doc.createElement !== 'function') return null;
        const el = doc.createElement('div');
        el.className = ['view', 'edit', 'choose', 'pick', 'numbers', 'form', 'currency'].includes(entry.kind)
            ? `igs-settings-dialog is-${entry.kind}`
            : 'igs-settings-dialog';
        el.setAttribute('role', entry.kind === 'busy' ? 'status' : entry.kind === 'confirm' || entry.kind === 'alert' ? 'alertdialog' : 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.setAttribute('aria-label', entry.kind === 'view' || entry.kind === 'edit' ? '生图提示词' : entry.message);
        const msg = doc.createElement('div');
        msg.className = entry.kind === 'view' ? 'igs-settings-dialog-msg is-scroll' : 'igs-settings-dialog-msg';
        msg.textContent = entry.message;
        el.appendChild(msg);
        let input = null;
        if (entry.kind === 'prompt' || entry.kind === 'edit') {
            const wrap = doc.createElement('label');
            wrap.className = 'igs-settings-field';
            input = doc.createElement(entry.kind === 'edit' ? 'textarea' : 'input');
            if (entry.kind === 'prompt') input.type = 'text';
            input.className = entry.kind === 'edit' ? 'igs-settings-dialog-text' : 'igs-settings-dialog-input';
            input.setAttribute('aria-label', entry.message);
            input.value = entry.value;
            input.addEventListener('input', () => { entry.value = input.value; });
            wrap.appendChild(input);
            el.appendChild(wrap);
        }
        // 数字表单：每项一个数字框，填的值记在 entry.fields[i].value，重绘补回时保留。
        let numberInputs = [];
        let numberError = null;
        let totalNote = null;
        // 合计行（可选 labels.total）：随输入实时刷新，超出上限时保存键禁用；没有合计行时是空操作。
        let syncTotal = () => {};
        if (entry.kind === 'numbers' || entry.kind === 'currency') {
            // 沿用设置器的字段样式：两列网格，每项「名称 + 数字框」，与「我的角色」技能值同一写法。
            const grid = doc.createElement('div');
            grid.className = 'igs-source-filter-grid';
            numberInputs = entry.fields.map((field) => {
                const wrap = doc.createElement('label');
                wrap.className = 'igs-settings-field';
                const name = doc.createElement('span');
                name.textContent = entry.kind === 'currency' ? field.label : `${field.label}（${field.min}到${field.max}）`;
                const box = doc.createElement('input');
                box.type = field.key === 'name' && entry.kind === 'currency' ? 'text' : 'number';
                box.inputMode = box.type === 'text' ? 'text' : field.step === 0.01 ? 'decimal' : 'numeric';
                if (box.type === 'text') box.maxLength = CURRENCY_NAME_MAX * 2;
                else { box.min = String(field.min); box.max = String(field.max); box.step = String(field.step || 1); }
                box.setAttribute('data-dialog-field', field.key);
                box.value = field.value;
                box.setAttribute('aria-label', name.textContent);
                box.addEventListener('input', () => { field.value = box.value; box.removeAttribute('aria-invalid'); syncTotal(); });
                wrap.append(name, box);
                grid.appendChild(wrap);
                return box;
            });
            el.appendChild(grid);
            numberError = doc.createElement('div');
            numberError.className = 'igs-source-filter-note';
            numberError.hidden = true;
            el.appendChild(numberError);
            if (entry.total) {
                totalNote = doc.createElement('div');
                totalNote.className = 'igs-source-filter-note';
                totalNote.setAttribute('data-result', 'dialog-total');
                el.appendChild(totalNote);
            }
        }
        // 表单：每项按 type 画成单行输入、下拉、数字框或多行框，值记在 entry.fields[i].value，重绘补回时保留。
        // field.when = { key, is } 时，只有另一项取到该值才显示；field.group === 'advanced' 的收进折叠；field.readonly 只读。
        const formInputs = [];
        let formFirst = null;
        let formError = null;
        if (entry.kind === 'form') {
            const grid = doc.createElement('div');
            grid.className = 'igs-settings-dialog-form';
            const advancedGrid = doc.createElement('div');
            advancedGrid.className = 'igs-settings-dialog-form';
            const wraps = [];
            const syncWhen = () => {
                for (const { field, wrap } of wraps) {
                    if (!field.when) continue;
                    const src = entry.fields.find((f) => f.key === field.when.key);
                    wrap.hidden = !src || String(src.value) !== field.when.is;
                }
            };
            for (const field of entry.fields) {
                const wrap = doc.createElement('label');
                wrap.className = field.type === 'area' ? 'igs-settings-field is-wide' : 'igs-settings-field';
                const name = doc.createElement('span');
                name.textContent = field.label;
                let box;
                if (field.type === 'select') {
                    box = doc.createElement('select');
                    box.className = 'igs-asset-move';
                    for (const choice of field.options) {
                        const opt = doc.createElement('option');
                        opt.value = choice.value;
                        opt.textContent = choice.label;
                        if (choice.value === field.value) opt.selected = true;
                        box.appendChild(opt);
                    }
                    box.disabled = field.readonly;
                } else if (field.type === 'area') {
                    box = doc.createElement('textarea');
                    box.value = field.value;
                    if (field.max) box.maxLength = field.max;
                    if (field.placeholder) box.placeholder = field.placeholder;
                } else {
                    box = doc.createElement('input');
                    box.type = field.type === 'number' ? 'number' : 'text';
                    if (field.type === 'number') {
                        box.inputMode = 'numeric';
                        box.step = '1';
                        if (Number.isFinite(field.min)) box.min = String(field.min);
                        if (Number.isFinite(field.maxValue)) box.max = String(field.maxValue);
                    } else if (field.max) box.maxLength = field.max;
                    if (field.placeholder) box.placeholder = field.placeholder;
                    box.value = field.value;
                    box.readOnly = field.readonly;
                    if (!field.readonly) formInputs.push(box);
                }
                box.setAttribute('aria-label', field.label);
                if (field.note) box.title = field.note;
                const onChange = () => { field.value = box.value; if (formError) formError.hidden = true; syncWhen(); };
                box.addEventListener(field.type === 'select' ? 'change' : 'input', onChange);
                wrap.append(name, box);
                (field.group === 'advanced' ? advancedGrid : grid).appendChild(wrap);
                wraps.push({ field, wrap });
                if (!formFirst && !field.readonly) formFirst = box;
            }
            el.appendChild(grid);
            if (advancedGrid.childNodes.length) {
                const fold = doc.createElement('details');
                fold.className = 'igs-settings-sub igs-settings-advanced igs-settings-dialog-form-advanced';
                const sum = doc.createElement('summary');
                sum.textContent = entry.advancedLabel;
                fold.append(sum, advancedGrid);
                el.appendChild(fold);
            }
            formError = doc.createElement('div');
            formError.className = 'igs-source-filter-note';
            formError.setAttribute('data-result', 'dialog-form-error');
            formError.hidden = true;
            el.appendChild(formError);
            syncWhen();
        }
        let current = null;
        // 下拉式选择：一个下拉框加确定 / 取消，选项少而说明短时比一排大按钮清爽。
        if (entry.kind === 'choose' && entry.dropdown) {
            const select = doc.createElement('select');
            select.className = 'igs-asset-move igs-settings-dialog-select';
            select.setAttribute('aria-label', entry.message);
            for (const choice of entry.choices) {
                const opt = doc.createElement('option');
                opt.value = choice.value;
                opt.textContent = choice.note ? `${choice.label} · ${choice.note}` : choice.label;
                if (choice.value === entry.value) opt.selected = true;
                select.appendChild(opt);
            }
            select.addEventListener('change', () => { entry.value = select.value; });
            el.appendChild(select);
            current = select;
        } else if (entry.kind === 'choose') {
            const list = doc.createElement('div');
            list.className = 'igs-settings-dialog-choices';
            for (const choice of entry.choices) {
                const btn = doc.createElement('button');
                btn.type = 'button';
                btn.className = choice.value === entry.value ? 'igs-settings-dialog-choice is-current' : 'igs-settings-dialog-choice';
                btn.setAttribute('data-settings-dialog', 'choice');
                btn.setAttribute('data-settings-choice', choice.value);
                if (choice.value === entry.value) { btn.setAttribute('aria-current', 'true'); current = btn; }
                const big = doc.createElement('b');
                big.textContent = choice.label;
                btn.appendChild(big);
                if (choice.note) {
                    const small = doc.createElement('span');
                    small.textContent = choice.note;
                    btn.appendChild(small);
                }
                list.appendChild(btn);
            }
            el.appendChild(list);
        }
        // 多选：点一下选中、再点取消，选中的记在 entry.selected，面板重绘补回时照样亮着。
        if (entry.kind === 'pick') {
            const list = doc.createElement('div');
            list.className = 'igs-settings-dialog-choices';
            for (const choice of entry.choices) {
                const on = entry.selected.has(choice.value);
                const btn = doc.createElement('button');
                btn.type = 'button';
                btn.className = on ? 'igs-settings-dialog-choice is-current' : 'igs-settings-dialog-choice';
                btn.setAttribute('data-settings-dialog', 'toggle');
                btn.setAttribute('data-settings-choice', choice.value);
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                btn.textContent = choice.label;
                if (choice.note) btn.title = choice.note;
                if (!current) current = btn;
                list.appendChild(btn);
            }
            el.appendChild(list);
        }
        const actions = doc.createElement('div');
        actions.className = 'igs-settings-dialog-actions';
        // 忙碌提示没有按钮，由调用方 close；Esc 只关掉提示，后台计算照常进行。
        const buttons = entry.kind === 'busy' ? []
            : entry.kind === 'view' || entry.kind === 'alert' ? [['ok', entry.okLabel]]
            : entry.kind === 'choose' && !entry.dropdown ? [['cancel', entry.cancelLabel]]
            : entry.kind === 'pick' ? [['all', '全选/清空'], ['cancel', entry.cancelLabel], ['ok', entry.okLabel]]
                : [['cancel', entry.cancelLabel], ['ok', entry.okLabel]];
        for (const [role, label] of buttons) {
            const btn = doc.createElement('button');
            btn.type = 'button';
            btn.className = 'igs-settings-action';
            btn.setAttribute('data-settings-dialog', role);
            btn.textContent = label;
            actions.appendChild(btn);
        }
        if (buttons.length) el.appendChild(actions);
        if (totalNote) {
            const okButton = actions.querySelector('[data-settings-dialog="ok"]');
            syncTotal = () => {
                const total = entry.fields.reduce((sum, field) => sum + (Number.isFinite(Number(field.value)) ? Math.round(Number(field.value)) : 0), 0);
                const left = entry.total.max - total;
                totalNote.textContent = entry.total.note(left, total);
                if (okButton) okButton.disabled = left < 0;
            };
            syncTotal();
        }
        const picked = () => entry.choices.map((choice) => choice.value).filter((value) => entry.selected.has(value));
        const syncPick = () => {
            for (const btn of el.querySelectorAll('[data-settings-dialog="toggle"]')) {
                const on = entry.selected.has(btn.getAttribute('data-settings-choice'));
                btn.classList.toggle('is-current', on);
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            }
        };
        // 数字表单：全部为范围内整数才确定，否则标红第一个不合格的框并提示。
        const acceptNumbers = () => {
            const values = {};
            for (let i = 0; i < entry.fields.length; i += 1) {
                const field = entry.fields[i];
                const text = String(field.value).trim();
                const v = Number(text);
                if (!text || !Number.isInteger(v) || v < field.min || v > field.max) {
                    numberInputs[i].setAttribute('aria-invalid', 'true');
                    numberError.textContent = `${field.label}须为${field.min}到${field.max}的整数。`;
                    numberError.hidden = false;
                    numberInputs[i].focus();
                    return;
                }
                values[field.key] = v;
            }
            if (entry.total && Object.values(values).reduce((sum, v) => sum + v, 0) > entry.total.max) return;
            settle(entry, values);
        };
        // 表单：取各项文字交给调用方校验；校验不过则在表单内提示，不关掉。
        const acceptForm = () => {
            const values = {};
            for (const field of entry.fields) values[field.key] = String(field.value == null ? '' : field.value).trim();
            const problem = typeof entry.validate === 'function' ? entry.validate(values) : null;
            if (problem) {
                formError.textContent = String(problem);
                formError.hidden = false;
                return;
            }
            settle(entry, values);
        };
        const acceptCurrency = () => {
            const values = Object.fromEntries(entry.fields.map(field => [field.key,
                field.key === 'name' ? String(field.value).trim() : String(field.value).trim() ? Number(field.value) : NaN]));
            const clean = normalizeCurrencyEditInput({ name: values.name, rate: values.rate,
                table: Object.fromEntries(MONEY_TIERS.map(tier => [tier, values[tier]])), base: 'form' });
            if (!clean) {
                numberError.textContent = '名称须为1到6字且不含空白或标签符号；四档金额须为严格递增的正整数；兑换比例须为0.01到100，最多两位小数。';
                numberError.hidden = false;
                return;
            }
            settle(entry, { name: clean.name, table: clean.table, rate: clean.rate });
        };
        const accept = () => entry.kind === 'currency' ? acceptCurrency() : entry.kind === 'numbers' ? acceptNumbers()
            : entry.kind === 'form' ? acceptForm()
            : settle(entry, entry.kind === 'pick' ? picked() : entry.kind === 'confirm' || entry.kind === 'alert' ? true : (input ? input.value : entry.value));
        el.addEventListener('click', (event) => {
            event.stopPropagation();
            const btn = event.target && typeof event.target.closest === 'function' ? event.target.closest('[data-settings-dialog]') : null;
            if (!btn) return;
            const role = btn.getAttribute('data-settings-dialog');
            if (role === 'choice') settle(entry, btn.getAttribute('data-settings-choice'));
            else if (role === 'toggle') {
                const value = btn.getAttribute('data-settings-choice');
                if (entry.selected.has(value)) entry.selected.delete(value);
                else entry.selected.add(value);
                syncPick();
            } else if (role === 'all') {
                if (entry.selected.size === entry.choices.length) entry.selected.clear();
                else entry.choices.forEach((choice) => entry.selected.add(choice.value));
                syncPick();
            }
            else if (role === 'ok') accept();
            else settle(entry, cancelValue(entry));
        });
        el.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                settle(entry, cancelValue(entry));
            } else if (event.key === 'Enter' && entry.kind !== 'choose' && entry.kind !== 'busy' && !entry.multiline && !event.isComposing && (input ? event.target === input : ['numbers', 'currency'].includes(entry.kind) ? numberInputs.includes(event.target) : entry.kind === 'form' ? formInputs.includes(event.target) : true)) {
                event.preventDefault();
                event.stopPropagation();
                accept();
            }
        });
        entry.focusTarget = () => input || numberInputs[0] || formFirst || current || actions.lastChild || el;
        if (entry.kind === 'busy') el.tabIndex = -1;
        return el;
    }

    function mount(container) {
        const entry = pending;
        const host = findHost(container);
        if (!entry || !host) return null;
        if (entry.el && entry.el.parentNode === host) return entry.el;
        detach(entry);
        const el = build(host, entry);
        if (!el) return null;
        host.appendChild(el);
        entry.el = el;
        const target = entry.focusTarget();
        if (target && typeof target.focus === 'function') {
            try { target.focus({ preventScroll: true }); } catch (error) { target.focus(); }
            if ((entry.kind === 'prompt' || entry.kind === 'numbers') && typeof target.select === 'function') target.select();
        }
        return el;
    }

    function open(kind, message, value, labels = {}, choices = [], selected = [], fields = []) {
        const container = getContainer();
        if (!findHost(container)) return Promise.resolve(askNative(kind, message, value, fields));
        if (pending) settle(pending, cancelValue(pending));
        return new Promise((resolve) => {
            pending = {
                kind,
                message: String(message == null ? '' : message),
                value: String(value == null ? '' : value),
                okLabel: labels.okLabel || (kind === 'edit' ? '保存' : '确定'),
                cancelLabel: labels.cancelLabel || '取消',
                multiline: kind === 'edit',
                choices,
                fields,
                selected: new Set(selected),
                dropdown: kind === 'choose' && labels.dropdown === true,
                validate: kind === 'form' && typeof labels.validate === 'function' ? labels.validate : null,
                advancedLabel: labels.advancedLabel || '更多',
                total: kind === 'numbers' && labels.total && Number.isFinite(Number(labels.total.max)) && typeof labels.total.note === 'function' ? { max: Number(labels.total.max), note: labels.total.note } : null,
                resolve,
                el: null,
            };
            if (!mount(container)) {
                const entry = pending;
                pending = null;
                resolve(askNative(kind, entry.message, entry.value, entry.fields));
            }
        });
    }

    return {
        alert: (message, labels) => open('alert', message, '', labels),
        // 忙碌提示：不阻塞调用方，返回 close()；之后弹出的其他对话框会顶掉它。
        busy(message) {
            const shown = open('busy', message, '');
            const entry = pending && pending.kind === 'busy' ? pending : null;
            return { close() { if (entry) settle(entry, true); }, done: shown };
        },
        confirm: (message, labels) => open('confirm', message, '', labels),
        prompt: (message, value = '', labels) => open('prompt', message, value, labels),
        view: (message, labels) => open('view', message, '', { okLabel: '关闭', ...labels }),
        edit: (message, value = '', labels) => open('edit', message, value, { okLabel: '保存', ...labels }),
        // 几个固定选项直接点选，不用手打；choices 为 [{ value, label, note }]，value 等于当前值的高亮。原生兜底退回输入框。
        choose: (message, choices = [], value = '', labels) => open('choose', message, value, labels || {}, (Array.isArray(choices) ? choices : [])
            .map((item) => ({ value: String(item && item.value != null ? item.value : ''), label: String(item && item.label != null ? item.label : item && item.value), note: String((item && item.note) || '') }))
            .filter((item) => item.value)),
        // 多选：choices 同 choose，selected 为预先勾上的 value；确定返回勾选的 value 数组（按 choices 顺序），取消返回 null。
        pick: (message, choices = [], selected = [], labels) => open('pick', message, (Array.isArray(selected) ? selected : []).join('、'), labels || {}, (Array.isArray(choices) ? choices : [])
            .map((item) => ({ value: String(item && item.value != null ? item.value : ''), label: String(item && item.label != null ? item.label : item && item.value), note: String((item && item.note) || '') }))
            .filter((item) => item.value), (Array.isArray(selected) ? selected : []).map(String)),
        // 数字表单：fields 为 [{ key, label, value, min, max }]；确定返回 { key: 整数 }（全部项），取消返回 null。
        // labels.total = { max, note(剩余, 合计) => 文案 } 时多一行实时合计，合计超过 max 则保存键禁用。
        numbers: (message, fields = [], labels) => open('numbers', message, '', labels || {}, [], [], (Array.isArray(fields) ? fields : [])
            .map((f) => ({ key: String(f && f.key || ''), label: String(f && (f.label || f.key) || ''), value: f && f.value != null ? String(f.value) : '', min: Number(f && f.min), max: Number(f && f.max) }))
            .filter((f) => f.key && Number.isFinite(f.min) && Number.isFinite(f.max))),
        // 表单：fields 为 [{ key, label, type: text|select|number|area, value, options?, max?, min?, maxValue?, readonly?, group?: 'advanced', when?: { key, is }, note?, placeholder? }]。
        // labels.validate(values) 返回错误文字时留在表单里提示；labels.advancedLabel 为折叠标题。确定返回 { key: 文字 }，取消返回 null。
        form: (message, fields = [], labels) => open('form', message, '', labels || {}, [], [], (Array.isArray(fields) ? fields : [])
            .filter((f) => f && f.key)
            .map((f) => ({
                key: String(f.key),
                label: String(f.label || f.key),
                type: f.type === 'select' || f.type === 'number' || f.type === 'area' ? f.type : 'text',
                value: f.value != null ? String(f.value) : '',
                options: Array.isArray(f.options) ? f.options.map((o) => ({ value: String(o.value), label: String(o.label != null ? o.label : o.value) })) : [],
                max: Number(f.max) || 0,
                min: f.min == null ? NaN : Number(f.min),
                maxValue: f.maxValue == null ? NaN : Number(f.maxValue),
                readonly: f.readonly === true,
                group: f.group === 'advanced' ? 'advanced' : '',
                when: f.when && f.when.key ? { key: String(f.when.key), is: String(f.when.is) } : null,
                note: String(f.note || ''),
                placeholder: String(f.placeholder || ''),
            }))),
        currency: config => open('currency', '修改货币', '', { okLabel: '保存' }, [], [], [
            { key: 'name', label: '货币名称', value: config.name },
            ...MONEY_TIERS.map(key => ({ key, label: key, value: config.table[key], min: 1, max: Number.MAX_SAFE_INTEGER })),
            { key: 'rate', label: '兑换比例（1积分）', value: config.rate, min: CURRENCY_RATE_MIN, max: CURRENCY_RATE_MAX, step: 0.01 },
        ]),
        remount(container) {
            const el = mount(container || getContainer());
            if (!el && pending) settle(pending, cancelValue(pending));
            return el;
        },
        cancel() {
            if (pending) settle(pending, cancelValue(pending));
        },
        isOpen: () => Boolean(pending),
        hasTextInput: () => Boolean(pending && ['prompt', 'edit', 'numbers', 'form', 'currency'].includes(pending.kind)),
    };
}
