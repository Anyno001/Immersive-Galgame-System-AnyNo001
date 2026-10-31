// 随身系统悬浮窗的页面标记：只由状态与设置生成 HTML 字符串，不碰 DOM、不写内联样式。
// 操作统一用 data-oa（动作名）与 data-id / data-i（对象）标记，事件在 origin-panel.js 里委托处理。
// 页签与按钮对照原插件 renderPanel（Origin 系统 原作 vicliaaa，经授权移植）。
// 版式照「任务页合成方案」（随身系统预览/重排方案/合成.png）：
// - 任务页：主线置顶成一块浅底大卡，其余任务每条两行（标题 / 类型 · 进度，右边剩几回合）；点开一行原位展开成浅底块，同时只开一行。
// - 每页底部固定一个主按钮，次要操作是下面一行小字链接。
// - 无描边，类型不做小标签；行与行之间一条淡线。
import { esc } from './reader-value-utils.js';
import { originBoundRole, visibleOriginMenuPages, visibleOriginTabs } from './origin-settings.js';

// 剩余回合：引擎给 remain 就直接用，否则按 limit 与当前回合推算；不限时返回 null。
export function taskRemain(task, turn) {
    if (!task || !(task.limit > 0)) return null;
    if (Number.isFinite(task.remain)) return task.remain;
    if (!Number.isFinite(turn)) return null;
    return task.limit - (turn - (task.startTurn || task.turn || turn));
}

const num = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const btn = (action, label, extra = '', mod = '') => `<button type="button" class="igs-or-op${mod ? ` is-${mod}` : ''}" data-oa="${action}"${extra}>${esc(label)}</button>`;
const link = (action, label) => `<button type="button" class="igs-or-link" data-oa="${action}">${esc(label)}</button>`;
const empty = (text) => `<div class="igs-or-empty">${esc(text)}</div>`;
const heading = (text, count) => `<div class="igs-or-sub">${esc(text)}${count == null ? '' : ` · ${num(count)}`}</div>`;
const bar = (value) => `<progress class="igs-or-bar" max="100" value="${Math.max(0, Math.min(100, Math.round(num(value))))}"></progress>`;
const meta = (text, mod = '') => (text ? `<span class="igs-or-meta${mod ? ` is-${mod}` : ''}">${text}</span>` : '');
const hbtn = (action, label, icon, extra = '') => `<button type="button" class="igs-or-hbtn" data-oa="${action}" aria-label="${esc(label)}" title="${esc(label)}"${extra}>${icon}</button>`;
const headAttrs = (key, open) => ` data-oa="row" data-id="${esc(key)}" role="button" tabindex="0" aria-expanded="${open ? 'true' : 'false'}"`;

// 一行：头部（主文字 + 第二行小字 + 右侧元信息）；有 detail / ops 时整行头可点开，点开后原位变浅底块。
// desc 常显（背包、商城这类短说明）；只想点开才看的内容放进 detail。
function row(ui, key, { title, side = '', sub = '', desc = '', detail = '', ops = '' }) {
    const open = ui.openRows && ui.openRows.has(key);
    const can = Boolean(ops || detail);
    return `<div class="igs-or-row${open ? ' is-open' : ''}" data-or-open-key="${esc(key)}">`
        + `<div class="igs-or-row-head"${can ? headAttrs(key, open) : ''}>`
        + `<div class="igs-or-row-main"><div class="igs-or-title">${title}</div>${sub ? `<div class="igs-or-line">${sub}</div>` : ''}</div>`
        + (side ? `<div class="igs-or-side">${side}</div>` : '')
        + '</div>'
        + (desc ? `<div class="igs-or-desc">${desc}</div>` : '')
        + (open ? `${detail}${ops ? `<div class="igs-or-ops">${ops}</div>` : ''}` : '')
        + '</div>';
}

// 页头只有两层：第一层「关闭 · 标题居中 · 设置 / ⋯」，第二层「积分 1240 · Lv.3 · 经验条」。二级页只有一层「返回 · 页名」。
export function renderOriginHead(state, settings, ui) {
    const sub = ui.page ? visibleOriginMenuPages(settings).find((p) => p.id === ui.page) : null;
    if (sub) {
        return `<div class="igs-or-head" data-or-drag="1">${hbtn('back', '返回', ui.icons.back)}<span class="igs-or-name">${esc(sub.label)}</span><span class="igs-or-hside"></span></div>`;
    }
    const expMax = num(state.expMax, 100) || 100;
    return `<div class="igs-or-head" data-or-drag="1">${hbtn('close', '收起', ui.icons.close)}<span class="igs-or-name">${esc(settings.sysName)}</span>`
        + `<span class="igs-or-hside">${ui.canOpenSettings ? hbtn('settings', '设置', ui.icons.gear) : ''}${hbtn('menu', '更多', ui.icons.more, ` aria-haspopup="menu" aria-expanded="${ui.menuOpen ? 'true' : 'false'}"`)}</span></div>`
        + (ui.menuOpen ? renderMenu(state, settings) : '')
        + `<div class="igs-or-stats" title="经验${num(state.exp)}/${expMax}"><span class="igs-or-stat-k">积分</span><b class="igs-or-stat-v">${num(state.points)}</b>`
        + `<span class="igs-or-stat-lv">Lv.${num(state.level, 1)}</span>${bar(num(state.exp) / expMax * 100)}</div>`;
}

// ⋯ 菜单：三个二级页（模块关掉的不显示），其后是暂停 / 恢复与清空对话。
function renderMenu(state, settings) {
    const item = (action, label, id = '') => `<button type="button" role="menuitem" class="igs-or-mitem" data-oa="${action}"${id ? ` data-id="${id}"` : ''}>${esc(label)}</button>`;
    const pages = visibleOriginMenuPages(settings).map((p) => item('page', p.label, p.id)).join('');
    const tools = item('pause', state.paused ? '恢复系统' : '暂停系统')
        + (visibleOriginTabs(settings).some((t) => t.id === 'chat') ? item('chat-clear', originBoundRole(settings) ? '清空私聊' : '清空对话') : '');
    return `<div class="igs-or-menu" role="menu">${pages}${pages ? '<i class="igs-or-msep"></i>' : ''}${tools}</div>`;
}

export function renderOriginTabs(settings, tab, page) {
    if (page) return '';
    return `<div class="igs-or-tabs" role="tablist">${visibleOriginTabs(settings).map((t) => `<button type="button" role="tab" class="igs-or-tab${t.id === tab ? ' is-on' : ''}" aria-selected="${t.id === tab ? 'true' : 'false'}" data-oa="tab" data-id="${t.id}">${esc(t.label)}</button>`).join('')}</div>`;
}

// 内容上方的提示：暂停、旧存档（不占页头）。
function renderNotices(state, ui) {
    return (state.paused ? '<div class="igs-or-banner">已暂停：系统退出剧情，不派发任务，时限冻结。</div>' : '')
        + (ui.legacy ? `<div class="igs-or-banner"><span>检测到原版Origin存档。</span>${btn('legacy-import', '导入')}${btn('legacy-dismiss', '忽略')}</div>` : '');
}

// ---- 组头与分类下拉（分类取舍.png 方案乙）----
// 组头左边「XX · N」，右边「当前分类 ⌄」；点开是右对齐小菜单。kind 区分是哪个下拉（task / gacha），
// 点击走 data-oa="dd-toggle" / "dd-pick"（data-kind、data-id）。

// 下拉控件：独立成函数，换成别的筛选写法只改这里。options = [{ id, label }]，value 为当前项 id。
export function renderFilterDropdown(kind, options, value, open, icon) {
    const current = options.find((o) => o.id === value) || options[0];
    const toggle = `<button type="button" class="igs-or-dd" data-oa="dd-toggle" data-kind="${esc(kind)}" aria-haspopup="menu" aria-expanded="${open ? 'true' : 'false'}">${esc(current.label)}${icon}</button>`;
    if (!open) return toggle;
    return toggle + `<div class="igs-or-menu" role="menu">${options.map((o) => `<button type="button" role="menuitem" class="igs-or-mitem" data-oa="dd-pick" data-kind="${esc(kind)}" data-id="${esc(o.id)}"${o.id === current.id ? ' data-on="1"' : ''}>${esc(o.label)}</button>`).join('')}</div>`;
}

function groupHead(label, count, dropdown = '') {
    return `<div class="igs-or-ghd"><span class="igs-or-ghd-k">${esc(label)} · ${num(count)}</span>${dropdown}</div>`;
}

// 列表末尾的操作区：一个主按钮 + 下面一行小字链接，跟内容一起滚动（不固定在窗口底）。
function tail(mainAction, mainLabel, ...links) {
    return `<div class="igs-or-tail">${mainAction ? `<button type="button" class="igs-or-cta" data-oa="${mainAction}">${esc(mainLabel)}</button>` : ''}`
        + (links.length ? `<div class="igs-or-links">${links.map(([a, l]) => link(a, l)).join('<i class="igs-or-dot">·</i>')}</div>` : '') + '</div>';
}

// 展开区按钮：右对齐，删除最左、次要居中、主操作最右（墨色底）。
function ops(del, ...rest) {
    return del + rest.join('');
}

// ---- 任务页 ----

export const TASK_FILTERS = Object.freeze([
    Object.freeze({ id: 'all', label: '全部' }),
    Object.freeze({ id: '主线', label: '主线' }),
    Object.freeze({ id: '支线', label: '支线' }),
    Object.freeze({ id: '日常', label: '日常' }),
    Object.freeze({ id: 'owner', label: '给角色' }),
]);

const isOwned = (t) => Boolean(t.owner && t.owner !== '宿主');
export function taskMatches(task, filter) {
    if (!filter || filter === 'all') return true;
    if (filter === 'owner') return isOwned(task);
    return task.type === filter;
}

// 任务分类下拉：没有交给角色的任务时不出「给角色」。
export function renderTaskFilter(filter, tasks, open, icon) {
    const options = TASK_FILTERS.filter((f) => f.id !== 'owner' || tasks.some(isOwned));
    return renderFilterDropdown('task', options, filter, open, icon);
}

function remainText(remain) {
    return remain === null ? '' : meta(`剩${Math.max(0, remain)}回合`, remain <= 1 ? 'strong' : '');
}

// 任务内容分两段：概要（描述用正文字体 → 进度条）与奖惩（奖励 / 惩罚 / 条件小字）。
function taskSummary(t) {
    return (t.desc ? `<div class="igs-or-desc">${esc(t.desc)}</div>` : '')
        + `<div class="igs-or-prog">${bar(t.progress)}${meta(`${num(t.progress)}%`)}</div>`;
}
function taskTerms(t) {
    const kv = (label, text) => (text ? `<div class="igs-or-kv"><span class="igs-or-meta">${label}</span>${esc(text)}</div>` : '');
    return kv('奖励', t.reward) + kv('惩罚', t.penalty) + kv('条件', t.cond);
}

function taskOps(t) {
    const id = ` data-id="${esc(t.id)}"`;
    return ops(btn('task-del', '删除', id), btn('task-edit', '编辑', id), btn('task-done', '完成', id, 'main'));
}

// 主线大卡：标题、描述、进度常显；点卡头原位多出奖惩与按钮。
function renderHero(t, ui) {
    const key = `task:${t.id}`;
    const open = ui.openRows && ui.openRows.has(key);
    return `<div class="igs-or-hero${open ? ' is-open' : ''}" data-or-open-key="${esc(key)}">`
        + `<div class="igs-or-hero-head"${headAttrs(key, open)}><div class="igs-or-hero-top">${meta(esc(t.type))}<span class="igs-or-fill"></span>${remainText(taskRemain(t, ui.turn))}</div>`
        + `<div class="igs-or-hero-title">${esc(t.title)}</div></div>`
        + taskSummary(t)
        + (open ? `${taskTerms(t)}<div class="igs-or-ops">${taskOps(t)}</div>` : '')
        + '</div>';
}

function taskRow(t, ui) {
    const kind = isOwned(t) ? `给${esc(t.owner)}` : esc(t.type);
    return row(ui, `task:${t.id}`, { title: esc(t.title), sub: meta(`${kind} · 进度${num(t.progress)}%`), side: remainText(taskRemain(t, ui.turn)), detail: taskSummary(t) + taskTerms(t), ops: taskOps(t) });
}

// 「全部」：第一条主线（非交给角色）置顶成大卡，下面组头「其他任务 · N」；选了分类：组头「支线任务 · N」，只列这一类，不出大卡。
function renderTasks(state, ui) {
    const active = (state.tasks || []).filter((t) => t.status === 'active');
    const tailHtml = tail('task-gen', '请求新任务', ['task-add', '添加任务'], ['task-direction', '设定任务方向']);
    if (!active.length) return empty('暂无进行中的任务') + tailHtml;
    const options = TASK_FILTERS.filter((f) => f.id !== 'owner' || active.some(isOwned));
    const filter = options.some((f) => f.id === ui.taskFilter) ? ui.taskFilter : 'all';
    const dropdown = renderTaskFilter(filter, active, ui.ddOpen === 'task', ui.icons.chevron);
    const hero = filter === 'all' ? active.find((t) => t.type === '主线' && !isOwned(t)) : null;
    const rest = active.filter((t) => t !== hero && taskMatches(t, filter));
    const label = filter === 'all' ? (hero ? '其他任务' : '全部任务') : `${options.find((f) => f.id === filter).label}任务`;
    let h = hero ? renderHero(hero, ui) : '';
    h += groupHead(label, rest.length, dropdown);
    h += rest.length ? rest.map((t) => taskRow(t, ui)).join('') : `<div class="igs-or-center">暂无${filter === 'all' ? '其他' : options.find((f) => f.id === filter).label}任务</div>`;
    return h + tailHtml;
}

// ---- 其他页 ----

function renderStats(state, ui) {
    const del = (action, i) => btn(action, '删除', ` data-i="${i}"`);
    const stats = state.stats || [];
    let h = heading('属性') + (stats.length ? '' : empty('暂无属性'));
    stats.forEach((x, i) => { h += row(ui, `stat:${i}:${x.name}`, { title: esc(x.name), side: `<b class="igs-or-num">${num(x.val)}</b>`, ops: del('stat-del', i) }); });
    h += `<div class="igs-or-links">${link('stat-add', '自定义属性')}</div>`;
    h += heading('技能');
    const skills = state.skills || [];
    h += skills.length ? '' : empty('暂无技能。任务奖励、抽奖与剧情中解锁的技能记录在此。');
    skills.forEach((k, i) => { h += row(ui, `skill:${i}:${k.name}`, { title: esc(k.name), desc: k.desc ? esc(k.desc) : '', ops: del('skill-del', i) }); });
    h += `<div class="igs-or-links">${link('skill-add', '添加技能')}</div>`;
    h += heading('权限与特权');
    const perks = state.perks || [];
    h += perks.length ? '' : empty('暂无权限。系统开启的权限、称号与功能记录在此。');
    perks.forEach((k, i) => { h += row(ui, `perk:${i}:${k.name}`, { title: esc(k.name), sub: meta(esc(k.kind || '权限')), desc: k.desc ? esc(k.desc) : '', ops: del('perk-del', i) }); });
    h += `<div class="igs-or-links">${link('perk-add', '添加权限')}</div>`;
    const all = state.rewardsLog || [];
    const rewards = all.slice(-15).reverse();
    h += `<details class="igs-or-fold"><summary>奖励流水 · ${all.length}条原文</summary>`
        + (rewards.length ? rewards.map((r) => `<div class="igs-or-log"><span class="igs-or-meta">#${num(r.turn)} · ${esc(r.kind)}</span>${esc(r.text)}</div>`).join('') : empty('暂无记录。正文中的「任务奖励」「奖励已发放」原样保存在此，无法解析的也会保留。'))
        + '</details>';
    return h;
}

function renderBag(state, ui) {
    const bag = state.bag || [];
    const h = bag.length ? bag.map((b, i) => {
        const at = ` data-i="${i}"`;
        return row(ui, `bag:${i}:${b.name}`, { title: esc(b.name), side: meta(`×${num(b.count, 1)}`), desc: b.desc ? esc(b.desc) : '', ops: ops(btn('bag-del', '删除', at), btn('bag-use', '使用', at, 'main')) });
    }).join('') : empty('背包为空');
    return h + tail('', '', ['bag-add', '添加物品']);
}

// 商城：积分已在页头，这里不再重复。
function renderShop(state, ui) {
    const shop = state.shop || [];
    let h = shop.length ? '' : empty('商城暂无商品');
    shop.forEach((it, i) => {
        const at = ` data-i="${i}"`;
        h += row(ui, `shop:${i}:${it.name}`, { title: esc(it.name), side: `<b class="igs-or-num">${num(it.price)}</b>${meta('积分')}`, desc: it.desc ? esc(it.desc) : '', detail: it.effect ? `<div class="igs-or-kv"><span class="igs-or-meta">效果</span>${esc(it.effect)}</div>` : '', ops: ops(btn('shop-del', '删除', at), btn('shop-buy', '购买', at, 'main')) });
    });
    return h + tail('shop-gen', '按世界与方向刷新商城', ['shop-add', '添加商品']);
}

// 抽奖：奖池组头右边是稀有度下拉（只列奖池里出现过的稀有度）。下标始终指原奖池里的位置，删除不会删错。
function renderGacha(state, settings, ui) {
    const pool = state.gachaPool || [];
    const total = pool.reduce((sum, g) => sum + num(g.weight), 0) || 1;
    const tiers = [...new Set(pool.map((g) => String(g.tier || '').trim()).filter(Boolean))];
    const options = [{ id: 'all', label: '全部' }, ...tiers.map((t) => ({ id: t, label: t }))];
    const filter = options.some((o) => o.id === ui.gachaFilter) ? ui.gachaFilter : 'all';
    const shown = pool.map((g, i) => ({ g, i })).filter(({ g }) => filter === 'all' || String(g.tier || '').trim() === filter);
    let h = groupHead(filter === 'all' ? '奖池' : `${filter}奖品`, shown.length, tiers.length > 1 ? renderFilterDropdown('gacha', options, filter, ui.ddOpen === 'gacha', ui.icons.chevron) : '');
    if (!pool.length) h += `<div class="igs-or-center">奖池为空</div>`;
    else if (!shown.length) h += `<div class="igs-or-center">暂无${esc(filter)}奖品</div>`;
    for (const { g, i } of shown) {
        h += row(ui, `gacha:${i}:${g.name}`, {
            title: esc(g.name), sub: meta(`${g.tier ? `${esc(g.tier)} · ` : ''}概率${Math.round(num(g.weight) / total * 100)}%`),
            desc: g.desc ? esc(g.desc) : '', detail: g.effect ? `<div class="igs-or-kv"><span class="igs-or-meta">效果</span>${esc(g.effect)}</div>` : '', ops: btn('gacha-del', '删除', ` data-i="${i}"`),
        });
    }
    return h + tail('gacha-draw', `抽奖一次 · ${settings.drawCost}积分`, ['gacha-gen', '重出奖池'], ['gacha-add', '添加奖品']);
}

function renderAchievements(state, ui) {
    const list = state.achievements || [];
    if (!list.length) return empty('暂无成就。达成里程碑或剧情高光时解锁。');
    return list.map((a, i) => row(ui, `ach:${i}`, { title: esc(a.name), desc: a.desc ? esc(a.desc) : '' })).join('');
}

// 记录页顶部一行小字：上一楼数据块情况（「有数据块」是整套界面唯一用成功色的地方）。
function renderLog(state, ui) {
    const last = ui.lastFloor;
    let h = '';
    if (last) {
        const body = last.has ? `<span class="igs-or-ok">有数据块</span> · ${num(last.lines)}行` : last.wroteNone ? '数据块为「无」' : '没有数据块 · 仅按正文兜底解析';
        h += `<div class="igs-or-note">上一楼 · ${body}</div>`;
    }
    const log = state.log || [];
    if (!log.length) return h + empty('暂无记录');
    for (let i = log.length - 1; i >= 0; i -= 1) h += `<div class="igs-or-log">${log[i].mark && log[i].mark !== '·' ? `<span class="igs-or-meta">${esc(log[i].mark)}</span>` : ''}${esc(log[i].text)}</div>`;
    return h;
}

// 对话：消息列表在内容区；输入框与发送在底栏（renderOriginFoot）。反串且手动生成时，「生成一段私聊」在列表末尾。
function renderChat(state, settings) {
    const role = originBoundRole(settings);
    const list = (state.chat || []).slice(-40);
    let h = '<div class="igs-or-chat">';
    if (!list.length) h += empty(role ? `暂无${role}与系统的私聊。${settings.rpChat === 'manual' ? '' : '私聊随正文生成。'}` : '可向系统询问提示、讨价还价或闲谈。');
    let lastTurn = null;
    for (const c of list) {
        if (role && c.who !== 'call' && c.turn != null && c.turn !== lastTurn) { h += `<div class="igs-or-turn">第${num(c.turn)}楼</div>`; lastTurn = c.turn; }
        const cls = c.who === 'me' ? 'me' : c.who === 'sys' ? 'sys' : c.who === 'call' ? 'call' : 'char';
        const who = c.who === 'char' ? esc(c.name || role) : c.who === 'call' ? '以系统身份喊话 · 下回合生效' : '';
        h += `<div class="igs-or-bub is-${cls}">${who ? `<span class="igs-or-bub-who">${who}</span>` : ''}${esc(c.text)}${c.note ? `<span class="igs-or-bub-note">${esc(c.note)}</span>` : ''}</div>`;
    }
    if (role && settings.rpChat === 'manual') h += `<div class="igs-or-turn">${btn('chat-gen', '生成一段私聊')}</div>`;
    return `${h}</div>`;
}

export function renderOriginBody(tab, state, settings, ui) {
    switch (tab) {
    case 'stat': return renderStats(state, ui);
    case 'ach': return renderAchievements(state, ui);
    case 'log': return renderLog(state, ui);
    case 'bag': return renderNotices(state, ui) + renderBag(state, ui);
    case 'shop': return renderNotices(state, ui) + renderShop(state, ui);
    case 'gacha': return renderNotices(state, ui) + renderGacha(state, settings, ui);
    case 'chat': return renderNotices(state, ui) + renderChat(state, settings);
    default: return renderNotices(state, ui) + renderTasks(state, ui);
    }
}

// 固定底栏：只有对话页（输入框与发送）。
export function renderOriginFoot(tab, settings) {
    switch (tab) {
    case 'chat': {
        const role = originBoundRole(settings);
        return `<div class="igs-or-chatin"><input type="text" data-or-chat placeholder="${role ? `以系统的口吻对${esc(role)}说话` : '对系统说的话'}" aria-label="${role ? '喊话内容' : '对系统说的话'}">${btn(role ? 'chat-call' : 'chat-send', role ? '喊话' : '发送', '', 'main')}</div>`;
    }
    default: return '';
    }
}

export function renderOriginEmpty(settings, icons) {
    return `<div class="igs-or-head" data-or-drag="1">${hbtn('close', '收起', icons.close)}<span class="igs-or-name">${esc(settings.sysName)}</span><span class="igs-or-hside"></span></div>`
        + empty('请先打开一个聊天');
}
