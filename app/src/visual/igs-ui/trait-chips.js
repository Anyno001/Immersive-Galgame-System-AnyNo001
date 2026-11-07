// 角色卡的特质区：标题行（特质 + 计数）、一行胶囊（含「+」）、整行下方的说明卡。
// 数据来自 statsArchiveModel 的 traitList / traitNsfw / aptitude；按钮直接写聊天存档：
//   特质 stats-op:trait-id:<编码名>|<编码键>|<1挂上 0摘下>；悟性 stats-op:aptitude:<编码名>:<编码档>（摘下即回平庸）。
// 悟性在界面上并入「天资」组的两个互斥胶囊，仍读写 catalog.aptitude，不占格位。
import { TRAIT_DEFS, TRAIT_GROUPS, TRAIT_LIMITS, PROTAGONIST_NAME, getTraitDef, isComboKey, slotUsage } from '../../scene/stats/stat-traits.js';
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

const tag = (text, attr = '') => '<span class="igs-mood-review-chip igs-trait-chip is-tag"' + attr + '><b>' + esc(text) + '</b></span>';

// 编辑列表的一行：左名字（加粗）与浅色说明，右小号操作按钮。
export function editRow(title, desc, buttonsHtml = '') {
    return '<div class="igs-edit-row"><div class="igs-edit-main"><b>' + esc(title) + '</b>' + (desc ? '<span>' + esc(desc) + '</span>' : '') + '</div>' + (buttonsHtml ? '<div class="igs-edit-ops">' + buttonsHtml + '</div>' : '') + '</div>';
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
function addPanel(name, hungIds, nsfwOn, usage, level) {
    const hero = name === PROTAGONIST_NAME;
    const hung = new Set(hungIds);
    const groups = TRAIT_GROUPS.map((group) => {
        const defs = TRAIT_DEFS.filter((d) => d.group === group && !hung.has(d.id) && (nsfwOn || !d.nsfw) && (!hero || d.protagonist));
        const chips = defs.map((d) => {
            const swap = d.exclusive.filter((id) => hung.has(id)).map((id) => (getTraitDef(id) || {}).name).filter(Boolean);
            return pickChip(action(name, d.id, true), d.name, swap.join('、'), d.desc || '');
        });
        if (group === APTITUDE_GROUP) {
            for (const x of APTITUDE_DEFS) if (x.level !== level) chips.push(pickChip(aptAction(name, x.level), x.level, level || '', x.desc));
        }
        if (!chips.length) return '';
        return '<details class="igs-trait-group"><summary><b>' + esc(group) + '</b><span>' + chips.length + '</span></summary><div class="igs-trait-pick">' + chips.join('') + '</div></details>';
    }).join('');
    const limits = '<div class="igs-trait-limits">同挂' + usage.slots + '/' + TRAIT_LIMITS.total + ' · 自动' + usage.auto + '/' + TRAIT_LIMITS.auto + ' · 成就' + usage.achieve + '/' + TRAIT_LIMITS.achieve + '</div>';
    const id = 'igs-edit-a' + (++toggleSeq);
    return '<input type="checkbox" class="igs-edit-toggle igs-add-toggle" id="' + id + '"><label for="' + id + '" class="igs-edit-add">＋ 添加特质</label><div class="igs-trait-panel">' + limits + groups + '</div>';
}

// 角色当前显示的特质条目：合成整体一条（组成项并入），NSFW 关时不显示 nsfw 项，悟性（出众、天纵）作为一条。
function shownTraits(name, model) {
    const nsfwOn = model.traitNsfw === true;
    const items = ownItems(model, name);
    const usage = usageOf(model, name, items);
    const own = model.aptitude && model.aptitude[name];
    const level = own === '出众' || own === '天纵' ? own : '';
    const folded = new Set(items.filter((t) => isComboKey(t.id)).flatMap((t) => t.parts || []));
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
        shown.push({ id: t.id, title: def.name, desc: def.desc || '', buttons: t.src === 'achieve' ? '<span class="igs-edit-note">成就</span>' : dropButton(action(name, t.id, false)) });
    }
    if (level) shown.push({ id: 'apt:' + level, title: level, desc: APTITUDE_DEFS.find((d) => d.level === level).desc, buttons: dropButton(aptAction(name, '平庸')) });
    return { shown, items, usage, level, nsfwOn };
}

// 观赏区：特质只读小标签（我的角色页用）。
export function renderTraitView(name, model) {
    const { shown, usage } = shownTraits(name, model);
    return viewBlock('data-traits-of="' + esc(name) + '"', '特质', usage.slots + '/' + TRAIT_LIMITS.total, shown.map((x) => tag(x.title)).join(''));
}

// 编辑区：特质编辑列表（每行 名字 + 说明 + 摘下，末行「＋ 添加特质」）。
export function renderTraitEdit(name, model) {
    const { shown, items, usage, level, nsfwOn } = shownTraits(name, model);
    const full = usage.slots >= TRAIT_LIMITS.total;
    const add = full ? '<span class="igs-edit-add is-off" title="已满格，请先摘下一项">＋ 添加特质</span>' : addPanel(name, items.map((t) => t.id), nsfwOn, usage, level);
    return editCard('特质', usage.slots + '/' + TRAIT_LIMITS.total, shown.map((x) => editRow(x.title, x.desc, x.buttons)).join(''), add);
}

// 「其他角色」折叠头里的只读小胶囊：最多 2 个，其余收成「+N」；按名字与阶段的字数给预算，窄屏单行放不下时少显示几个。
const CHIP_MAX = 2;
const CHIP_BUDGET = 22;
export function renderPersonChips(name, stage, model) {
    const { shown } = shownTraits(name, model);
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
    return '<span class="igs-person-chips">' + keep.map((x) => tag(x.title)).join('') + (rest > 0 ? '<span class="igs-person-more">+' + rest + '</span>' : '') + '</span>';
}
