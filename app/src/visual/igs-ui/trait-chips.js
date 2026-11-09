// 角色卡的特质区：标题行（特质 + 计数）、一行胶囊（含「+」）、整行下方的说明卡。
// 数据来自 statsArchiveModel 的 traitList / traitNsfw / aptitude；按钮直接写聊天存档：
//   特质 stats-op:trait-id:<编码名>|<编码键>|<1挂上 0摘下>；悟性 stats-op:aptitude:<编码名>:<编码档>（摘下即回平庸）。
// 悟性在界面上并入「天资」组的两个互斥胶囊，仍读写 catalog.aptitude，不占格位。
import { TRAIT_DEFS, TRAIT_GROUPS, TRAIT_LIMITS, PROTAGONIST_NAME, getTraitDef, isComboKey, slotUsage, traitReqStatus } from '../../scene/stats/stat-traits.js';
import { CYCLE_DEFS, STATUS_DEFS, STATUS_GROUPS, STATUS_URGENCY, getStatusDef, subInWorlds } from '../../scene/stats/stat-status-defs.js';
import { landmineView } from '../../scene/stats/stat-trait-landmines.js';
import { TRAIT_RECIPES } from '../../scene/stats/stat-trait-recipes.js';
import { esc } from './reader-value-utils.js';

const SRC_TEXT = Object.freeze({ auto: '自动评定', manual: '手动', story: '剧情', achieve: '成就' });
const COMBO_PREFIX = 'combo:';
const APTITUDE_GROUP = '天资';
const APTITUDE_DEFS = Object.freeze([
    Object.freeze({ level: '出众', desc: '成长检定掷两次，取较好的一次' }),
    Object.freeze({ level: '天纵', desc: '成长检定掷两次取较好，判定线再放宽十点' }),
]);

// 区块标题行：左标题，右计数或操作；技能、特质、声望共用。
export function sectionHead(title, right = '', hint = '') {
    return `<div class="igs-stats-sec-head"${hint ? ` title="${esc(hint)}"` : ''}><b>${esc(title)}</b>${right}</div>`;
}

let toggleSeq = 0;
// 一枚可展开的项：隐藏勾选框、胶囊标签、说明卡三个同级节点；说明卡靠 order 排在整行胶囊之后。
export function traitItem(chipInner, bodyHtml, cls = '') {
    const id = 'igs-trait-t' + (++toggleSeq);
    const extra = cls ? ' ' + cls : '';
    return '<input type="checkbox" class="igs-trait-toggle" id="' + id + '"><label for="' + id + '" class="igs-mood-review-chip igs-trait-chip' + extra + '">' + chipInner + '</label><div class="igs-trait-body' + extra + '">' + bodyHtml + '</div>';
}

// 说明卡：第一行特质名（加粗）、浅色来源后缀、右侧操作按钮；第二行说明正文。
export function traitCard(title, srcText, desc, actionHtml = '', extra = '') {
    return `<div class="igs-trait-card-head"><b>${esc(title)}</b>${srcText ? `<span>· ${esc(srcText)}</span>` : ''}${actionHtml}</div>${desc ? `<p>${esc(desc)}</p>` : ''}${extra}`;
}

const action = (name, id, on) => `stats-op:trait-id:${encodeURIComponent(name)}|${encodeURIComponent(id)}|${on ? 1 : 0}`;
const aptAction = (name, level) => `stats-op:aptitude:${encodeURIComponent(name)}:${encodeURIComponent(level)}`;

// 角色已挂条目：优先用运行时给的 traitList，旧模型只有勾选表时按手动补出。
function ownItems(model, name) {
    const given = model.traitList && model.traitList[name];
    if (given && Array.isArray(given.items)) return given.items;
    const marks = (model.traits && model.traits[name]) || {};
    return Object.keys(marks).filter((id) => marks[id] === true && getTraitDef(id)).map((id) => ({ id, src: 'manual' }));
}

function usageOf(model, name, items) {
    const given = model.traitList && model.traitList[name];
    if (given && Number.isFinite(given.slots)) return given;
    return slotUsage({ traits: { [name]: Object.fromEntries(items.map((t) => [t.id, { on: true, src: t.src, ...(t.parts ? { parts: t.parts } : {}) }])) } }, name);
}

export const dropButton = (href, label = '摘下') => `<button type="button" class="igs-settings-action is-small" data-action="${esc(href)}">${esc(label)}</button>`;

const tag = (text, off = false) => '<span class="igs-mood-review-chip igs-trait-chip is-tag' + (off ? ' is-off' : '') + '"><b>' + esc(text) + '</b></span>';

// 编辑列表的一行：左名字（加粗）与浅色说明，右小号操作按钮。
export function editRow(title, desc, buttonsHtml = '', off = false) {
    return '<div class="igs-edit-row' + (off ? ' is-off' : '') + '"><div class="igs-edit-main"><b>' + esc(title) + '</b>' + (desc ? '<span>' + esc(desc) + '</span>' : '') + '</div>' + (buttonsHtml ? '<div class="igs-edit-ops">' + buttonsHtml + '</div>' : '') + '</div>';
}

// 观赏区：标题行（左标题，右计数）与一排只读小标签；没有项时显示「未设置」。不放任何按钮。
export function viewBlock(attr, title, count, tagsHtml) {
    return '<div class="igs-settings-section igs-stats-sec" ' + attr + '>' + sectionHead(title, '<em>' + esc(count) + '</em>')
        + '<div class="igs-edit-tags">' + (tagsHtml || '<span class="igs-edit-empty">未设置</span>') + '</div></div>';
}

// 编辑区的一块：标题行（左标题，右计数）与一张编辑列表卡（每行名字 + 说明 + 操作，末行「＋ 添加」）。
export function editCard(title, count, rows, addHtml) {
    return '<div class="igs-stats-sec">' + sectionHead(title, '<em>' + esc(count) + '</em>') + '<div class="igs-edit-card">' + rows + addHtml + '</div></div>';
}

// 「编辑」折叠：沿用「高级」那种 details 样式，默认折叠；内容由调用方给出。
export function editFold(key, advancedOpen, inner) {
    return '<details class="igs-settings-sub igs-settings-advanced igs-edit-fold" data-advanced="' + esc(key) + '"' + advancedOpen(key) + '><summary>编辑</summary>' + inner + '</details>';
}

const pickChip = (href, label, swap, title) => '<button type="button" class="igs-mood-review-chip igs-trait-chip is-pick" data-action="' + esc(href) + '" title="' + esc(title) + '"><b>' + esc(label) + '</b>' + (swap ? '<small>替换' + esc(swap) + '</small>' : '') + '</button>';

// 「＋ 添加特质」：点开分组面板，顶部一行格位上限；分组默认折叠，标题行右侧计数；NSFW 关时不列 nsfw 项，主角只列主角可用项；
// 已挂项不再列出，与已挂项互斥的注明「替换」。
function addPanel(name, hungIds, nsfwOn, usage, level, attrs, advancedOpen = () => '') {
    const hero = name === PROTAGONIST_NAME;
    const hung = new Set(hungIds);
    const groups = TRAIT_GROUPS.map((group) => {
        const defs = TRAIT_DEFS.filter((d) => d.group === group && !d.boundOnly && !hung.has(d.id) && (nsfwOn || !d.nsfw) && (!hero || d.protagonist) && traitReqStatus(d, attrs).ok);
        const chips = defs.map((d) => {
            const swap = d.exclusive.filter((id) => hung.has(id)).map((id) => (getTraitDef(id) || {}).name).filter(Boolean);
            return pickChip(action(name, d.id, true), d.name, swap.join('、'), d.desc || '');
        });
        if (group === APTITUDE_GROUP) {
            for (const x of APTITUDE_DEFS) if (x.level !== level) chips.push(pickChip(aptAction(name, x.level), x.level, level || '', x.desc));
        }
        if (!chips.length) return '';
        const key = 'trait-group:' + name + ':' + group;
        return '<details class="igs-trait-group" data-advanced="' + esc(key) + '"' + advancedOpen(key) + '><summary><b>' + esc(group) + '</b><span>' + chips.length + '</span></summary><div class="igs-trait-pick">' + chips.join('') + '</div></details>';
    }).join('');
    const limits = '<div class="igs-trait-limits">同挂' + usage.slots + '/' + TRAIT_LIMITS.total + ' · 自动' + usage.auto + '/' + TRAIT_LIMITS.auto + ' · 成就' + usage.achieve + '/' + TRAIT_LIMITS.achieve + '</div>';
    // 展开状态按角色记在 advancedOpen 里：挂上一项后整页重绘，面板与分组保持展开，页面不跳。
    const key = 'trait-add:' + name;
    return '<details class="igs-add-fold" data-advanced="' + esc(key) + '"' + advancedOpen(key) + '><summary class="igs-edit-add">＋ 添加特质</summary><div class="igs-trait-panel">' + limits + groups + '</div></details>';
}

// 角色当前显示的特质条目：合成整体一条（组成项并入），NSFW 关时不显示 nsfw 项，悟性（出众、天纵）作为一条。
function shownTraits(name, model) {
    const nsfwOn = model.traitNsfw === true;
    const items = ownItems(model, name);
    const usage = usageOf(model, name, items);
    const own = model.aptitude && model.aptitude[name];
    const level = own === '出众' || own === '天纵' ? own : '';
    const folded = new Set(items.filter((t) => isComboKey(t.id)).flatMap((t) => t.parts || []));
    const attrs = (model.traitAttrs && model.traitAttrs[name]) || null;
    const shown = [];
    for (const t of items) {
        if (isComboKey(t.id)) {
            const title = t.id.slice(COMBO_PREFIX.length);
            const recipe = TRAIT_RECIPES.find((r) => r.id === title);
            const parts = (t.parts || []).map((id) => getTraitDef(id)).filter(Boolean);
            shown.push({ id: t.id, title, desc: (recipe ? recipe.effect.text : '') + '（组成：' + parts.map((p) => p.name).join('、') + '）', buttons: parts.map((p) => dropButton(action(name, p.id, false), '摘下' + p.name)).join('') });
            continue;
        }
        const def = getTraitDef(t.id);
        if (!def || folded.has(t.id) || (def.nsfw && !nsfwOn)) continue;
        const bound = t.src === 'bound';
        const lack = bound ? [] : traitReqStatus(def, attrs).lacks;
        const note = lack.length ? lack.map((x) => x.属性 + ' ' + x.现值 + ' / 需 ' + x.需).join('、') + '，暂不生效' : '';
        const extra = [bound ? '随' + ((getTraitDef(t.by) || {}).name || t.by) + '附带，不能单独摘下' : '', note].filter(Boolean).join('；');
        const buttons = t.src === 'achieve' ? '<span class="igs-edit-note">成就</span>' : bound ? '' : dropButton(action(name, t.id, false));
        shown.push({ id: t.id, title: def.name, off: lack.length > 0, desc: extra ? (def.desc ? def.desc + '（' + extra + '）' : extra) : def.desc || '', buttons });
        for (const w of t.waived || []) {
            const wd = getTraitDef(w);
            if (wd) shown.push({ id: 'waived:' + w, title: wd.name, waived: true, desc: '随' + def.name + '附带，因人设已豁免', buttons: '' });
        }
    }
    if (level) shown.push({ id: 'apt:' + level, title: level, desc: APTITUDE_DEFS.find((d) => d.level === level).desc, buttons: dropButton(aptAction(name, '平庸')) });
    return { shown, items, usage, level, nsfwOn, attrs };
}

// 观赏区：出身 / 特质 / 成就 / 状态 / 关系五栏，全部只读小标签（我的角色页、其他角色卡用）；出身、成就、状态、关系为空时整栏不显示。
const isOrigin = (x) => { const d = getTraitDef(x.id); return Boolean(d && d.group === '出身'); };
const isAchieve = (x) => { const d = getTraitDef(x.id); return Boolean(d && d.group === '成就') || x.src === 'achieve'; };

// 角色当前的状态条目：{ title, rank }；受伤读战斗生命（仅主角有数据），其余读 model.statusMap（catalog.statuses），timer 带剩余天数、cycle 写「周期」。
export function statusRows(name, model) {
    const rows = [];
    const v = name === PROTAGONIST_NAME && model.vitals;
    if (v && Number(v.maxHp) > 0 && (v.down || Number(v.hp) < Number(v.maxHp))) {
        const pct = v.down ? 0 : Math.max(0, Math.round((Number(v.hp) / Number(v.maxHp)) * 100));
        rows.push({ title: '受伤 ' + pct + '%', rank: STATUS_URGENCY.受伤 });
    }
    const own = (model.statusMap && model.statusMap[name]) || {};
    for (const [key, e] of Object.entries(own)) {
        if (!e) continue;
        let text = key + (e.toward ? '·' + e.toward : '');
        if (e.kind === 'cycle') text += ' 周期';
        else if (e.kind === 'timer' && Number.isFinite(Number(e.until)) && Number.isFinite(Number(model.day))) text += ' ' + Math.max(0, Number(e.until) - Number(model.day)) + '天';
        rows.push({ title: text, rank: Object.hasOwn(STATUS_URGENCY, key) ? STATUS_URGENCY[key] : 3 });
    }
    return rows.sort((a, b) => a.rank - b.rank);
}

// 状态编辑：来源小字、状态列表（改天数、摘下、注入开关）、周期设置、「＋ 挂上状态」分组面板。
const STATUS_SRC_TEXT = Object.freeze({ setting: '设定', story: '剧情', system: '系统', cycle: '周期', manual: '手动' });
export const statusSourceText = (e) => '来源：' + (STATUS_SRC_TEXT[e && e.src] || '剧情') + (e && Number.isFinite(Number(e.floor)) && Number(e.floor) > 0 ? ' · 第' + Number(e.floor) + '楼' : '');
const statusAction = (op, name, key, extra = '') => 'stats-op:' + op + ':' + encodeURIComponent(name) + '|' + encodeURIComponent(key) + (extra === '' ? '' : '|' + extra);
const dayOf = (model) => (Number.isFinite(Number(model.day)) ? Number(model.day) : Number(model.statusDay) || 0);

function statusRow(name, key, e, model) {
    const def = getStatusDef(key);
    const left = Number.isFinite(Number(e.until)) ? Math.max(0, Number(e.until) - dayOf(model)) : null;
    const title = key + (e.toward ? '·' + e.toward : '') + (left !== null ? ' · 剩余' + left + '天' : '');
    const timed = e.kind === 'timer' || e.kind === 'cycle';
    const buttons = (timed ? dropButton(statusAction('status-days', name, key), '改天数') : '')
        + dropButton(statusAction('status-drop', name, key), '摘下')
        + dropButton(statusAction('status-inject', name, key, e.inject === false ? '1' : '0'), e.inject === false ? '注入：关' : '注入：开');
    return '<div class="igs-edit-row igs-status-row"><div class="igs-edit-main"><b>' + esc(title) + '</b>' + (def && def.desc ? '<span>' + esc(def.desc) + '</span>' : '') + '<span class="igs-status-src">' + esc(statusSourceText(e)) + '</span></div><div class="igs-edit-ops">' + buttons + '</div></div>';
}

function cycleRow(name, def, model) {
    const own = (model.cycleMap && model.cycleMap[name] && model.cycleMap[name][def.id]) || null;
    const v = own || { period: def.period, length: def.length, last: 0 };
    const input = (field, label, value) => '<label class="igs-settings-field"><span>' + label + '</span><input type="number" min="' + (field === 'last' ? 0 : 1) + '" data-stats-cycle="' + esc(encodeURIComponent(name) + '|' + encodeURIComponent(def.id)) + '" data-cycle-field="' + field + '" value="' + esc(value) + '" aria-label="' + esc(def.id + label) + '"></label>';
    return '<div class="igs-edit-row igs-cycle-row"><div class="igs-edit-main"><b>' + esc(def.id + '周期') + '</b></div><div class="igs-edit-ops">' + dropButton(statusAction('cycle-start', name, def.id), '今天开始') + '</div></div>'
        + '<div class="igs-cycle-box">' + input('period', '周期天数', v.period) + input('length', '持续天数', v.length) + input('last', '上次开始日', v.last) + '</div>';
}

function statusAddPanel(name, model, advancedOpen) {
    const own = (model.statusMap && model.statusMap[name]) || {};
    const worlds = (model.worldsManual && model.worldsManual.length ? model.worldsManual : model.worlds) || [];
    const groups = STATUS_GROUPS.map((group) => {
        const defs = STATUS_DEFS.filter((d) => d.group === group && d.kind !== 'cycle' && !own[d.id] && subInWorlds(d.sub, worlds));
        if (!defs.length) return '';
        const key = 'status-group:' + name + ':' + group;
        return '<details class="igs-trait-group" data-advanced="' + esc(key) + '"' + advancedOpen(key) + '><summary><b>' + esc(group) + '</b><span>' + defs.length + '</span></summary><div class="igs-trait-pick">'
            + defs.map((d) => pickChip(statusAction('status-pick', name, d.id), d.name, '', d.desc || '')).join('') + '</div></details>';
    }).join('');
    const key = 'status-add:' + name;
    return '<details class="igs-add-fold" data-advanced="' + esc(key) + '"' + advancedOpen(key) + '><summary class="igs-edit-add">＋ 挂上状态</summary><div class="igs-trait-panel">' + (groups || '<div class="igs-trait-limits">没有可挂的状态</div>') + '</div></details>';
}

// 编辑区：状态列表与周期设置（默认随「编辑」折叠）。
export function renderStatusEdit(name, model, advancedOpen = () => '') {
    const own = (model.statusMap && model.statusMap[name]) || {};
    const entries = Object.entries(own).filter(([, e]) => e);
    const worlds = (model.worldsManual && model.worldsManual.length ? model.worldsManual : model.worlds) || [];
    // 周期设置只给已挂上或已设过周期的状态，避免每个角色都列出生理期、发情期等；首次设置先经「＋ 挂上状态」。
    const cycles = CYCLE_DEFS.filter((c) => subInWorlds(c.sub, worlds) && (own[c.id] || (model.cycleMap && model.cycleMap[name] && model.cycleMap[name][c.id]))).map((c) => cycleRow(name, c, model)).join('');
    return editCard('状态', String(entries.length), entries.map(([key, e]) => statusRow(name, key, e, model)).join('') + cycles, statusAddPanel(name, model, advancedOpen));
}

// 角色的关系状态：toward 优先写「对 X：结怨」；否则 ta 写「对主角」、me 写「主角对其」、both 写「与主角」。
export function relationRows(name, model) {
    const list = model.relMap && model.relMap[name];
    return (Array.isArray(list) ? list : []).filter((r) => r && r.id).map((r) => (r.toward ? '对' + r.toward + '：' + r.id : r.dir === 'me' ? '主角对其：' + r.id : r.dir === 'both' ? '与主角：' + r.id : '对主角：' + r.id));
}

// 已知雷点：踩过的恒显示，了解过半时显示全部；只对角色卡的人物（非主角）。
function landmineRows(name, model) {
    const person = (model.characters || []).find((c) => c.name === name);
    if (!person) return [];
    const holders = ownItems(model, name).filter((t) => !isComboKey(t.id)).map((t) => (getTraitDef(t.id) || {}).name).filter(Boolean);
    return landmineView(holders, model.landmineKnown && model.landmineKnown[name], person.dims && person.dims.了解);
}

export function renderTraitView(name, model) {
    const { shown, usage } = shownTraits(name, model);
    const mines = landmineRows(name, model);
    const list = shown.filter((x) => !x.waived);
    const block = (attr, title, items, count) => viewBlock(attr + '="' + esc(name) + '"', title, String(count ?? items.length), items.map((x) => tag(x.title, x.off)).join(''));
    const origin = list.filter(isOrigin);
    const achieve = list.filter((x) => !isOrigin(x) && isAchieve(x));
    const plainList = list.filter((x) => !isOrigin(x) && !isAchieve(x));
    const status = statusRows(name, model);
    const rel = relationRows(name, model);
    return (origin.length ? block('data-origin-of', '出身', origin) : '')
        + viewBlock('data-traits-of="' + esc(name) + '"', '特质', usage.slots + '/' + TRAIT_LIMITS.total, plainList.map((x) => tag(x.title, x.off)).join(''))
        + (achieve.length ? block('data-achieve-of', '成就', achieve) : '')
        + (mines.length ? viewBlock('data-landmine-of="' + esc(name) + '"', '已知雷点', String(mines.length), mines.map((x) => tag(x.text)).join('')) : '')
        + (status.length ? viewBlock('data-status-of="' + esc(name) + '"', '状态', String(status.length), status.map((x) => tag(x.title)).join('')) : '')
        + (rel.length ? viewBlock('data-rel-of="' + esc(name) + '"', '关系', String(rel.length), rel.map((x) => tag(x)).join('')) : '');
}

// 名字旁：只显示最紧急的 1 个状态，其余收成「+N」。
export function renderNameStatus(name, model) {
    const rows = statusRows(name, model);
    if (!rows.length) return '';
    return '<span class="igs-person-chips">' + tag(rows[0].title) + (rows.length > 1 ? '<span class="igs-person-more">+' + (rows.length - 1) + '</span>' : '') + '</span>';
}

// 编辑区：特质编辑列表（每行 名字 + 说明 + 摘下，末行「＋ 添加特质」）。
export function renderTraitEdit(name, model, advancedOpen = () => '') {
    const { shown, items, usage, level, nsfwOn, attrs } = shownTraits(name, model);
    const full = usage.slots >= TRAIT_LIMITS.total;
    const add = full ? '<span class="igs-edit-add is-off" title="已满格，请先摘下一项">＋ 添加特质</span>' : addPanel(name, items.map((t) => t.id), nsfwOn, usage, level, attrs, advancedOpen);
    return renderStatusEdit(name, model, advancedOpen) + editCard('特质', usage.slots + '/' + TRAIT_LIMITS.total, shown.map((x) => editRow(x.title, x.desc, x.buttons, x.waived)).join(''), add) + traitNoteField(name, model);
}

// 「评定注意」：用户写给特质评定的说明，失焦即写进聊天存档；只用于特质评定，不进正文提示词。
export const TRAIT_NOTE_MAX = 200;
function traitNoteField(name, model) {
    const value = (model.traitNotes && model.traitNotes[name]) || '';
    return '<label class="igs-settings-field"><span>评定注意</span><textarea data-stats-trait-note="' + esc(name) + '" maxlength="' + TRAIT_NOTE_MAX + '" rows="3" placeholder="例如：懦弱胆小，不记仇；虽然是蛇妖，但性格温顺" aria-label="评定注意">' + esc(value) + '</textarea></label>';
}

// 「其他角色」折叠头里的只读小胶囊：最多 2 个，其余收成「+N」；按名字与阶段的字数给预算，窄屏单行放不下时少显示几个。
const CHIP_MAX = 2;
const CHIP_BUDGET = 22;
export function renderPersonChips(name, stage, model) {
    const shown = shownTraits(name, model).shown.filter((x) => !x.waived);
    if (!shown.length) return '';
    let used = Array.from(name).length + Array.from(stage || '').length + 2;
    const keep = [];
    for (const x of shown) {
        const cost = Array.from(x.title).length + 2;
        if (keep.length >= CHIP_MAX || used + cost > CHIP_BUDGET) break;
        keep.push(x);
        used += cost;
    }
    const rest = shown.length - keep.length;
    return '<span class="igs-person-chips">' + keep.map((x) => tag(x.title, x.off)).join('') + (rest > 0 ? '<span class="igs-person-more">+' + rest + '</span>' : '') + '</span>';
}
