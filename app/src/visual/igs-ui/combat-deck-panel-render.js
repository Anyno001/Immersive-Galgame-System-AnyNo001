import { renderCombatGenerationForm } from './combat-generation-form.js';
import { esc } from './reader-value-utils.js';
import { combatReasonText } from './combat-panel-render.js';
import { recordPageHeadHtml } from './record-page-shell.js';
import { renderSettingsThemeSwitch } from './settings-theme.js';
import { DECK_PAGES, DECK_PAGE_LABELS } from './combat-deck-panel-model.js';
import { ASCEND_TIERS, REBUILD_COST, RESPEC_COST, TRAIT_DRAW_COST } from '../../combat/points.js';
import { TRAIT_LINK_LABELS } from '../../combat/traits.js';

// 人物状态面板的 HTML：动作走 data-deck-act / data-deck-id；只输出字段、状态、错误与操作确认。
const REASON_TEXT = Object.freeze({
    'combat-deck-invalid': '卡组不合规，不能保存',
    'combat-deck-readonly': '战斗进行中，卡组只读',
    'combat-deck-no-floor': '当前聊天没有楼层，无法保存卡组',
    'combat-profile-exists': '该角色已有卡组档案',
    'combat-generate-unavailable': '当前无法生成卡组档案',
    'combat-deck-generation-failed': '卡组档案生成失败',
    'combat-profile-unverified': '档案写入后未能读回确认',
    'combat-disabled': '卡牌战斗未开启',
    'combat-growth-incomplete': '部分成长未能整理，可稍后重试',
    'combat-profile-write-pending': '档案写入尚未确认，请稍后重试',
    'combat-tier-invalid': '强度档无效',
    'combat-gear-missing': '没有这件装备',
    'combat-card-art-invalid': '无法为这张卡生成卡面',
    'combat-card-art-unavailable': '当前无法生成卡面',
    'combat-card-art-failed': '卡面生成失败',
    'card-art-invalid': '无法为这张卡生成卡面',
    'card-image-unavailable': '生图服务不可用，无法生成卡面',
    'card-image-stopped': '卡面服务已停止',
    'no-chat': '当前没有打开的聊天',
    'combat-attribute-table-missing': '属性表未创建',
    'combat-alloc-not-protagonist': '只有主角可以分配属性点',
    'combat-alloc-over-balance': '可分配点数不足',
    'combat-alloc-over-cap': '已到属性上限',
    'combat-alloc-empty': '还没有分配属性点',
    'combat-alloc-invalid': '加点无效',
    'combat-alloc-no-floor': '当前聊天没有楼层，无法加点',
    'combat-alloc-unavailable': '当前无法分配属性点',
    'combat-manual-invalid': '加点无效',
    'combat-init-invalid': '建档内容无效',
    'combat-init-write-failed': '建档写入失败',
    'combat-page-invalid': '没有这一页',
    'combat-gear-equipped': '穿戴中的装备要先卸下才能卖出',
    'combat-keepsake-missing': '背包里没有这件物品',
    'combat-points-not-protagonist': '只有主角可以卖出',
    'combat-sell-no-floor': '当前聊天没有楼层，无法卖出',
    'combat-sell-unavailable': '当前无法卖出',
    'combat-rebuild-unavailable': '当前无法重新生成卡组',
    'combat-rebuild-invalid': '新卡组不合规',
    'combat-rebuild-no-floor': '当前聊天没有楼层，无法重新生成',
    'combat-rebuild-kind-mismatch': '只有卡组角色可以重新生成',
    'combat-material-loading': '正在读取参考素材，请稍候',
    'combat-material-read-failed': '参考素材读取失败，请展开参考素材重试，或关闭失败的来源后继续',
    'combat-material-path-invalid': 'MVU 路径不存在或不可读取，请检查额外路径并重读素材',
    'combat-material-table-missing': '选中的技能表已不存在，请重开生成面板选择',
    'combat-material-too-large': '选中素材超过 14000 字符，请减少路径或技能表后重试',
    'combat-generation-hint-too-long': '生成方向过长，请控制在 1600 字以内',
    'combat-respec-unavailable': '当前无法转职',
    'combat-respec-same-class': '已经是这个职业',
    'combat-respec-no-floor': '当前聊天没有楼层，无法转职',
    'combat-respec-kind-mismatch': '只有卡组角色可以转职',
    'combat-class-missing': '没有这个职业',
    'combat-class-generation-failed': '新职业生成失败',
    'combat-ascend-unavailable': '当前无法升阶',
    'combat-ascend-max': '职业已到最高阶',
    'combat-ascend-level-unreached': '等级不足，无法升阶',
    'combat-ascend-generation-failed': '升阶内容生成失败',
    'combat-ascend-no-floor': '当前聊天没有楼层，无法升阶',
    'combat-ascend-kind-mismatch': '只有卡组角色可以升阶',
    'combat-ascend-class-mismatch': '职业已变化，请重试',
    'combat-ascend-tier-invalid': '职业阶已变化，请重试',
    'combat-trait-unavailable': '当前无法抽取人物特性',
    'combat-trait-pending': '先决定替换或放弃新特性',
    'combat-trait-generation-failed': '人物特性生成失败',
    'combat-trait-no-floor': '当前聊天没有楼层，无法抽取人物特性',
    'combat-trait-kind-mismatch': '只有卡组角色可以抽取人物特性',
    'combat-trait-pick-invalid': '特性已变化，请重试',
    'combat-trait-duplicate': '特性已存在，请重试',
    'combat-trait-damage-cap': '特性被动超出上限，请重试',
    'combat-trait-pick-blocked': '替换后会挤掉其他固有特性或主动特性超出上限',
    'combat-trait-slot-unavailable': '当前无法解锁特性槽',
    'combat-trait-slot-invalid': '特性槽已变化，请重试',
    'combat-trait-slot-cost-invalid': '特性槽价格已变化，请重试',
    'combat-trait-slot-kind-mismatch': '只有卡组角色可以解锁特性槽',
    'combat-trait-slot-no-floor': '当前聊天没有楼层，无法解锁特性槽',
    'combat-character-missing': '没有这个角色',
    'combat-item-insufficient': '道具数量不足',
    'combat-use-battle-only': '这件道具只能在战斗中使用',
    'combat-use-full-hp': '没有伤势，不需要使用',
    'combat-use-unavailable': '当前无法使用道具',
    'combat-use-no-floor': '最新楼层不是 AI 回复，无法写入说明',
    'combat-floor-stale': '最新楼层已变化，请重试',
    'combat-floor-unverified': '正文写入后未能读回确认',
    'floor-note-unsafe': '无法在正文中安全写入说明',
});
export const deckReasonText = (reason) => REASON_TEXT[reason] || combatReasonText(reason);
const CARD_ERROR = Object.freeze({ 'copy-limit': '同名超过上限', 'not-owned': '未拥有', 'owned-exceeded': '超过拥有数', 'unknown-card': '图鉴中没有' });

const btn = (act, label, { id = '', primary = false, disabled = false, pressed = null } = {}) =>
    `<button type="button" class="igs-deck-btn${primary ? ' is-primary' : ''}" data-deck-act="${esc(act)}"${id ? ` data-deck-id="${esc(id)}"` : ''}${pressed === null ? '' : ` aria-pressed="${pressed}"`}${disabled ? ' aria-disabled="true"' : ''}>${esc(label)}</button>`;
// 字段行：左侧固定宽度的小标签，右侧内容自动换行；标签为空时只占位，保证各行内容左边对齐。
const row = (label, body) => `<div class="igs-deck-row"><span class="igs-deck-label">${esc(label)}</span><div class="igs-deck-row-body">${body}</div></div>`;
const chip = (text) => `<span class="igs-deck-chip">${esc(text)}</span>`;
// 分组：小标题（日记页「篇目」同款字距小字）+ 内容，用于装备、被动、特性等列表。
const section = (title, body) => `<section class="igs-deck-section"><h4 class="igs-deck-section-title">${esc(title)}</h4>${body}</section>`;
const expText = (d) => (d.next ? `Lv${d.level} · ${d.into}/${d.next}` : `Lv${d.level} · 满级`);
const initial = (name) => esc(Array.from(String(name || '?'))[0] || '?');

// 角色名单：与日记页人物名单同款，圆形首字头像 + 名字 + 一行小字。
const personBtn = (act, id, name, sub, current) => `<button type="button" class="igs-deck-person" data-deck-act="${act}" data-deck-id="${esc(id)}" aria-pressed="${current}">`
    + `<span class="igs-deck-avatar" aria-hidden="true">${initial(name)}</span><span class="igs-deck-person-meta"><span>${esc(name)}</span><small>${esc(sub)}</small></span></button>`;
function rosterHtml(v) {
    const people = v.roster.map((r) => personBtn('select', r.id, r.name, `${r.kindLabel} · ${expText(r)}${r.needsAdjust ? ' · 需调整' : ''}`, !v.selectedBuild && r.id === v.selectedId));
    const builds = (v.builds || []).map((b) => personBtn('select-build', b.name, b.name, '待建档', b.name === v.selectedBuild));
    return `<nav class="igs-deck-roster" aria-label="角色">${[...people, ...builds].join('')}</nav>`;
}

const PENDING_KIND = Object.freeze({ learn: '习得', upgrade: '精进', class: '转职' });

// 卡面缩略：本地卡面图地址已在面板层过滤协议，这里转义写入 src；无图用程序常量 SVG（不含档案文本，可直接拼入）。
const artThumb = (a) => (a ? `<span class="igs-deck-art" aria-hidden="true">${a.url ? `<img src="${esc(a.url)}" alt="" decoding="async">` : a.svg}</span>` : '');
// 卡面操作：失败原因按卡显示；只在注入了生成能力且不在战斗中时给按钮，生成中按钮置灰。
function artAction(c, readonly) {
    const a = c.art;
    if (!a) return '';
    const err = a.error ? `<span class="igs-deck-err" role="status">卡面：${esc(a.error)}</span>` : '';
    if (readonly || !a.canGenerate) return err;
    return err + btn('card-art', a.pending ? '生成中' : a.error ? '重试卡面' : a.url ? '重画卡面' : '生成卡面', { id: c.cardId, disabled: a.pending });
}

function cardRow(c, readonly) {
    const err = c.errors.length ? `<span class="igs-deck-err">${esc(c.errors.map((r) => CARD_ERROR[r] || r).join('、'))}</span>` : '';
    const up = c.upgraded ? ` · 已升级 ${c.upgraded}` : '';
    // 卡牌属性性能预览：要求属性与要求值，倍率高于 1 青绿、低于 1 灰色。
    const sc = c.scaling;
    const scale = sc ? `<span class="igs-deck-req${sc.multiplier > 1 ? ' is-up' : sc.multiplier < 1 ? ' is-down' : ''}" data-ability="${esc(sc.ability)}">${esc(sc.label)} ${esc(sc.required)} · ×${esc(sc.multiplier)}</span>` : '';
    const effectText = (text, cost) => `${cost === 'X' ? '消耗全部能量，每点能量结算一次：' : ''}${text || '暂无效果资料'}`;
    const upgraded = c.upgradedText ? `<details class="igs-deck-effect"><summary>升级后 · ${esc(c.upgradedCost)} 费</summary>${esc(effectText(c.upgradedText, c.upgradedCost))}</details>` : '';
    const effect = effectText(c.text, c.cost);
    // 一张卡一块：费用、卡面、名称与效果在左；来源、属性要求、数量与操作收在右侧一栏（窄屏整栏移到下方），不与下一张卡混在一起。
    const count = `<span class="igs-deck-count" aria-label="卡组中 / 拥有">${c.owned ? `${c.inDeck}/${c.owned}${up}` : '未拥有'}</span>`;
    const acts = artAction(c, readonly) + (readonly ? '' : `${btn('remove', '移出', { id: c.cardId, disabled: c.inDeck === 0 })}${btn('add', '加入', { id: c.cardId, disabled: !c.canAdd })}`);
    return `<li class="igs-deck-card${c.errors.length ? ' is-error' : ''}" data-card-type="${esc(c.type)}"${c.rarity ? ` data-rarity="${esc(c.rarity)}"` : ''}><span class="igs-deck-cost">${esc(c.cost)}</span>${artThumb(c.art)}`
        + `<div class="igs-deck-card-info"><div class="igs-deck-card-title"><span class="igs-deck-name">${esc(c.name)}</span><span class="igs-deck-tag">${esc(c.source)}</span></div><p class="igs-deck-effect">${esc(effect)}</p>${upgraded}${err}</div>`
        + `<div class="igs-deck-card-side"><div class="igs-deck-card-stats">${scale}${count}</div>${acts ? `<div class="igs-deck-card-acts">${acts}</div>` : ''}</div>`
        + '</li>';
}

// 重新生成基础卡组：只主角、不在战斗中且注入了生成能力时给按钮，金钱不足置灰；点后在原处确认或取消。
function rebuildHtml(v, d) {
    if (v.readonly || !v.canRebuild || !d.canSell) return '';
    const busy = Boolean(v.pending) || v.generationForm?.loading === true;
    const inner = v.rebuild
        ? btn('rebuild-confirm', v.pending === 'rebuild' ? '生成中' : `确认重新生成 · ${REBUILD_COST} 金钱`, { primary: true, disabled: busy }) + btn('rebuild-cancel', '取消', { disabled: busy })
        : btn('rebuild-open', `重新生成基础卡组（消耗${REBUILD_COST}金钱）`, { disabled: busy || (d.points || 0) < REBUILD_COST });
    return `<p class="igs-deck-help">重新生成只更换个人牌并重组起始卡组，保留当前职业牌；个人卡池不一定全部加入起始卡组。</p>${v.rebuild ? renderCombatGenerationForm(v.generationForm, Boolean(v.pending)) : ''}<div class="igs-deck-actions">${inner}</div>`;
}

// 转职与职业升阶（只主角、不在战斗中且注入了对应能力时显示）：转职展开后列出其他已登记职业与「新职业」，选定后确认或取消；
// 升阶按钮写下一阶的等级门槛与花费，已到三阶不显示，等级或金钱不足置灰，点后在原处确认或取消。
function classActionsHtml(v, d) {
    if (v.readonly || !d.canSell || d.kind !== 'deck-character') return '';
    const busy = Boolean(v.pending) || v.generationForm?.loading === true;
    const next = ASCEND_TIERS[(d.classTier || 1) + 1];
    if (v.respec && v.canRespec) {
        const picks = v.classes.filter((c) => c.id !== d.classRef).map((c) => btn('respec-pick', c.name, { id: c.id, pressed: v.respec.picked && v.respec.classRef === c.id, disabled: busy })).join('')
            + btn('respec-pick', '新职业', { pressed: v.respec.picked && !v.respec.classRef, disabled: busy });
        const confirm = v.respec.picked ? btn('respec-confirm', v.pending === 'respec' ? '转职中' : `确认转职 · ${RESPEC_COST} 金钱`, { primary: true, disabled: busy }) : '';
        return `<p class="igs-deck-help">转职切换职业和职业被动，保留已有卡组；新职业牌进入候选池，不会直接获得。职业阶数重置为一阶。</p>${row('转职', picks)}${v.respec.picked && !v.respec.classRef ? renderCombatGenerationForm(v.generationForm, Boolean(v.pending)) : ''}<div class="igs-deck-actions">${confirm}${btn('respec-cancel', '取消', { disabled: busy })}</div>`;
    }
    if (v.ascend && v.canAscend && next) {
        return `${renderCombatGenerationForm(v.generationForm, Boolean(v.pending))}<div class="igs-deck-actions">${btn('ascend-confirm', v.pending === 'ascend' ? '生成中' : `确认升阶 · ${next.cost} 金钱`, { primary: true, disabled: busy })}${btn('ascend-cancel', '取消', { disabled: busy })}</div>`;
    }
    const acts = [];
    if (v.canRespec) acts.push(btn('respec-open', `转职（消耗${RESPEC_COST}金钱）`, { disabled: busy || (d.points || 0) < RESPEC_COST }));
    if (v.canAscend && next) acts.push(btn('ascend-open', `职业升阶（需 Lv${next.level} · 消耗${next.cost}金钱）`, { disabled: busy || (d.expLevel || 1) < next.level || (d.points || 0) < next.cost }));
    return acts.length ? `<div class="igs-deck-actions">${acts.join('')}</div>` : '';
}

function deckHtml(v, d) {
    const c = d.check;
    const sizeBad = c.errors.some((e) => e.reason === 'deck-too-small' || e.reason === 'deck-too-large');
    const summary = `<span class="igs-deck-size${c.ok ? '' : ' is-error'}" role="status">${c.size} 张 · ${c.min}–${c.max}${sizeBad ? ' · 张数不符' : ''}${c.ok ? '' : ' · 不合规'}</span>`;
    const actions = v.readonly ? chip('战斗进行中 · 只读')
        : `${btn('reset', '还原', { disabled: !d.dirty || Boolean(v.pending) })}${btn('save', v.pending === 'save' ? '保存中' : '保存卡组', { primary: true, disabled: !d.dirty || !c.ok || Boolean(v.pending) })}`;
    const locked = (d.signature || []).filter((s) => !s.unlocked);
    // 未解锁的专属卡不透露名称、费用与类型，只标解锁等级（v0.39.2）。
    const sig = locked.length
        ? row('专属', locked.map((s) => `<span class="igs-deck-chip is-locked" data-rarity="signature">??? · Lv${esc(s.level)} 解锁</span>`).join(''))
        : '';
    const candidates = d.classCandidates || [];
    const pool = candidates.length ? `<details class="igs-deck-pool"><summary>${esc(d.className)} · 未拥有的职业牌（${candidates.length} 种）</summary><p class="igs-deck-help">以下是候选，并非已持有。可在升级奖励三选一中抽到；转职保留旧牌，不自动换牌。重建基础卡组会按当前职业重新组牌，另收页面标示的费用。</p><ul class="igs-deck-cards">${candidates.map((x) => cardRow(x, true)).join('')}</ul></details>` : '';
    const passive = d.classPassive ? row('职业被动', chip(`${d.classPassive.name}：${d.classPassive.text}`)) : '';
    return `<section class="igs-deck-build">${row('卡组', summary)}${passive}<p class="igs-deck-help">数量为「卡组中 / 拥有」。效果按当前属性预览，实战还受增益、减益和目标状态影响。</p>${sig}<ul class="igs-deck-cards">${d.owned.map((x) => cardRow(x, v.readonly)).join('')}</ul>${pool}<div class="igs-deck-actions">${actions}</div>${rebuildHtml(v, d)}${classActionsHtml(v, d)}</section>`;
}

// 装备栏：四个部位各一行内的标签，已装备的可卸下（卸下后进背包页）；道具只列余量。
// 有本聊天物品图（P7d，与背包同键）时标签前加小图，没有时形状不变。
// 小图是按钮：点开放大查看（面板按物品名现取地址，不读这里的 src）。
const itemArt = (x) => (x?.imageUrl ? `<button type="button" class="igs-deck-chip-art" data-deck-zoom="${esc(x.name)}" aria-label="${esc(`放大查看${x.name}`)}"><img src="${esc(x.imageUrl)}" alt="" decoding="async"></button>` : '');
function gearHtml(v, d) {
    const g = d.gear;
    if (!g) return '';
    const busy = v.readonly || Boolean(v.pending);
    // 一个部位一行：部位名、物品名与加成 / 被动说明（直接写出，不只放在悬停提示里）、右侧操作。
    const gearRow = (label, x, rarity, act) => bagRow(rarity, `<span class="igs-deck-slot">${esc(label)}</span>`
        + `<span class="igs-deck-name${x ? '' : ' is-empty'}">${x ? itemArt(x) : ''}${esc(x ? x.name : '空')}</span>${x?.text ? `<span class="igs-deck-count">${esc(x.text)}</span>` : ''}`, act);
    const slots = g.slots.map((s) => gearRow(s.label, s.item, '', s.item && !v.readonly ? btn('unequip', '卸下', { id: s.item.gearId, disabled: busy }) : ''));
    const parts = [section('装备', `<ul class="igs-deck-collection">${slots.join('')}</ul>`)];
    // 背包页取消后（v0.39.2）：主角的物品统一在阅读器背包页查看、换装与卖出；队友没有外部背包，未装备的装备在这里列出并可装上。
    if (!d.canSell && g.bag.length) {
        parts.push(section('可装备', `<ul class="igs-deck-collection">${g.bag.map((b) => gearRow(b.slotLabel, b, b.rarity, v.readonly ? '' : btn('equip', '装上', { id: b.gearId, disabled: busy }))).join('')}</ul>`));
    }
    if (g.items.length) parts.push(section('道具', `<ul class="igs-deck-collection">${g.items.map((i) => bagRow('', `<span class="igs-deck-name">${itemArt(i)}${esc(i.name)}</span><span class="igs-deck-count">×${esc(i.count)}</span>`, '')).join('')}</ul>`));
    if (d.canSell) parts.push('<p class="igs-deck-help">背包里的装备在资料菜单「物品」页换装与卖出。</p>');
    return parts.join('');
}

function generateHtml(v, d) {
    if (v.readonly) return '';
    const g = v.generate;
    if (!g || g.id !== d.id) return `<div class="igs-deck-actions">${btn('generate-open', '为该角色生成卡组档案', { id: d.id, disabled: Boolean(v.pending) })}</div>`;
    const classes = v.classes.length
        ? row('职业', v.classes.map((c) => btn('generate-class', `沿用 ${c.name}`, { id: c.id, pressed: g.classRef === c.id })).join('') + btn('generate-class', '新职业', { pressed: !g.classRef }))
        : '';
    return `<div class="igs-deck-generate">${classes}${g.classRef ? row('', chip('沿用已有职业特性')) : ''}`
        + `${renderCombatGenerationForm(v.generationForm, Boolean(v.pending))}<div class="igs-deck-actions">${btn('cancel', '取消')}${btn('generate', v.pending === 'generate' ? '生成中' : '确认生成', { primary: true, disabled: Boolean(v.pending) || v.generationForm?.loading === true })}</div></div>`;
}

// 缺表修复「重试」（retry-tables）：读表时服务已自动补建；未注入 ensureTables 时不给按钮。
const tablesRetryBtn = (v) => (v.canEnsureTables
    ? btn('retry-tables', v.pending === 'tables' ? '处理中' : '重试', { primary: true, disabled: Boolean(v.pending) }) : '');

// 六维格：属性名、当前值（加点草稿已计入）与调整值；editable 时两侧给 − / + 逐点加减，动作进行中置灰。
const stepBtn = (act, r, text, label, disabled) =>
    `<button type="button" class="igs-deck-btn is-step" data-deck-act="${act}" data-deck-id="${esc(r.key)}" aria-label="${esc(`${r.label}${label}`)}"${disabled ? ' aria-disabled="true"' : ''}>${text}</button>`;
function abilityGrid(rows, editable, busy = false, prefix = 'alloc') {
    if (!rows?.length) return '';
    return `<ul class="igs-deck-abilities${editable ? ' is-alloc' : ''}">${rows.map((r) => `<li class="igs-deck-ability${r.add ? ' is-added' : ''}" data-ability="${esc(r.key)}">`
        + `<span class="igs-deck-ability-name">${esc(r.label)}</span>${editable ? stepBtn(`${prefix}-remove`, r, '−', '减一点', busy || !r.canRemove) : ''}`
        + `<span class="igs-deck-ability-score">${esc(r.score)}</span>${editable ? stepBtn(`${prefix}-add`, r, '+', '加一点', busy || !r.canAdd) : ''}`
        + `<span class="igs-deck-ability-mod">${esc(r.modText)}</span></li>`).join('')}</ul>`;
}

const passiveRow = (label, p) => bagRow('', `<span class="igs-deck-slot">${esc(label)}</span><span class="igs-deck-name">${esc(p.name)}</span>${p.text ? `<span class="igs-deck-count">${esc(p.text)}</span>` : ''}`, '');

// 列表行：稀有度标色、名称与说明、右侧操作；人物特性逐槽复用。
const bagRow = (rarity, head, acts) => `<li class="igs-deck-keepsake"${rarity ? ` data-rarity="${esc(rarity)}"` : ''}>${head}${acts ? `<span class="igs-deck-bag-acts">${acts}</span>` : ''}</li>`;


// 人物特性（只主角有）：特性槽（v4）逐槽列出保留着的固有特性（人物技能 / 个人被动）、抽到的特性、空槽与未解锁的槽；按稀有度标色，写名称、种类、效果与联动，来历放在名称提示里。
// 下一个未解锁的槽给「解锁 · 价格」，金钱不足置灰。主角不在战斗中时给「抽人物特性」，点后在原处确认或取消，金钱不足置灰；
// 装不下时抽到的新特性列在「新特性」，每个特性给「替换」（替换后会挤掉其他固有特性或主动超上限的置灰）、新特性给「放弃」，被替换或放弃的永久消失。
const traitTags = (t) => [t.innate ? '固有' : '', t.kind === 'active' ? `主动 · ${t.cost}费` : ''].filter(Boolean);
const traitHead = (t) => `<span class="igs-deck-name"${t.origin ? ` title="${esc(t.origin)}"` : ''}>${esc(t.name)}</span>`
    + `<span class="igs-deck-count">${esc([...traitTags(t), t.text, t.link ? TRAIT_LINK_LABELS[t.link] : ''].filter(Boolean).join(' · '))}</span>`;
const ownTraits = (d) => [...(d.traitSlots?.innate || []), ...(d.traits || [])];
const replaceableOf = (d, own) => new Set(d.traitSlots ? d.traitSlots.replaceable : own.map((t) => t.traitId));
function traitsHtml(v, d) {
    const hero = d.canSell && d.kind === 'deck-character';
    const slots = hero ? d.traitSlots : null;
    const list = hero ? ownTraits(d) : d.traits || [];
    const fresh = hero ? d.pendingTrait : null;
    const busy = v.readonly || Boolean(v.pending);
    const canPick = Boolean(fresh) && !v.readonly && v.canPickTrait;
    const ok = replaceableOf(slots ? d : {}, list);
    const rows = list.map((t) => bagRow(t.rarity, traitHead(t), canPick ? btn('trait-drop', '替换', { id: t.traitId, disabled: busy || !ok.has(t.traitId) }) : ''));
    if (slots) {
        for (let i = list.length; i < slots.slots; i += 1) rows.push(bagRow('', '<span class="igs-deck-name is-empty">空槽</span>', ''));
        slots.locked.forEach((s, i) => {
            const unlock = i === 0 && !v.readonly && v.canUnlockSlot ? btn('trait-slot', `解锁 · ${s.cost} 金钱`, { id: String(s.slot), disabled: busy || (d.points || 0) < s.cost }) : '';
            rows.push(bagRow('', `<span class="igs-deck-name is-locked">第 ${s.slot} 槽</span><span class="igs-deck-count">${esc(`未解锁 · ${s.cost} 金钱`)}</span>`, unlock));
        });
    }
    const parts = [];
    if (rows.length) parts.push(section(slots ? `人物特性 · ${list.length}/${slots.slots}` : '人物特性', `<ul class="igs-deck-collection">${rows.join('')}</ul>`));
    if (fresh) parts.push(section('新特性', `<ul class="igs-deck-collection">${bagRow(fresh.rarity, traitHead(fresh), canPick ? btn('trait-drop', '放弃', { id: fresh.traitId, disabled: busy }) : '')}</ul>`));
    if (hero && !fresh && !v.readonly && v.canDrawTrait) {
        const inner = v.trait
            ? btn('trait-confirm', v.pending === 'trait' ? '生成中' : `确认抽取 · ${TRAIT_DRAW_COST} 金钱`, { primary: true, disabled: busy }) + btn('trait-cancel', '取消', { disabled: busy })
            : btn('trait-open', `抽人物特性（消耗${TRAIT_DRAW_COST}金钱）`, { disabled: busy || (d.points || 0) < TRAIT_DRAW_COST });
        parts.push(`<div class="igs-deck-actions">${inner}</div>`);
    }
    return parts.join('');
}

// 抽人物特性揭晓（P-f）：主区换成揭晓舞台，标题栏与关闭保留。蓄力：背面卡居中，光圈旋转、粒子向中心聚拢，颜色按预定稀有度；
// 翻开：第一次画出时翻面爆光（神话另有整面板闪白与震屏），之后重绘为静止终态；写名称、效果与来历。新特性待定（已满）时下方并排已装的特性，点一个替换，或放弃新特性。
const TRAIT_RARITY_LABELS = Object.freeze({ common: '普通', uncommon: '罕见', rare: '稀有', epic: '史诗', mythic: '神话' });
const REVEAL_DOTS = 12;
const dots = (cls) => `<span class="${cls}" aria-hidden="true">${Array.from({ length: REVEAL_DOTS }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</span>`;
const REVEAL_BACK = '<span class="igs-deck-reveal-back" aria-hidden="true"></span>';
const traitLine = (t) => [t.text, t.link ? TRAIT_LINK_LABELS[t.link] : ''].filter(Boolean).join(' · ');
function revealHtml(v) {
    const r = v.reveal;
    const d = v.detail;
    if (!r || !d) return '';
    const still = v.reduced ? ' data-still' : '';
    if (r.phase === 'charge') {
        return `<section class="igs-deck-reveal" data-phase="charge" data-rarity="${esc(r.rarity)}"${still} aria-busy="true">`
            + `<div class="igs-deck-reveal-stage"><span class="igs-deck-reveal-ring" aria-hidden="true"></span>${dots('igs-deck-reveal-motes')}<div class="igs-deck-reveal-card">${REVEAL_BACK}</div></div>`
            + '<p class="igs-deck-reveal-state" role="status">生成中</p></section>';
    }
    const waiting = d.pendingTrait?.traitId === r.traitId;
    const t = waiting ? d.pendingTrait : (d.traits || []).find((x) => x.traitId === r.traitId);
    if (!t) return '';
    const busy = v.readonly || Boolean(v.pending);
    const canPick = waiting && !v.readonly && v.canPickTrait;
    const face = `<span class="igs-deck-reveal-face"><span class="igs-deck-reveal-tag">${esc(TRAIT_RARITY_LABELS[t.rarity] || '')}</span><span class="igs-deck-reveal-name">${esc(t.name)}</span></span>`;
    const fx = r.fresh ? `<span class="igs-deck-reveal-burst" aria-hidden="true"></span>${dots('igs-deck-reveal-sparks')}` : '';
    const line = traitLine(t);
    const info = `<div class="igs-deck-reveal-info">${line ? `<p class="igs-deck-reveal-text">${esc(line)}</p>` : ''}${t.origin ? `<p class="igs-deck-reveal-origin">${esc(t.origin)}</p>` : ''}</div>`;
    const own = ownTraits(d);
    const ok = replaceableOf(d, own);
    const slots = waiting
        ? `<ul class="igs-deck-reveal-slots">${own.map((x) => `<li class="igs-deck-reveal-slot"${x.rarity ? ` data-rarity="${esc(x.rarity)}"` : ''}><span class="igs-deck-name"${x.origin ? ` title="${esc(x.origin)}"` : ''}>${esc(x.name)}</span>`
            + `<span class="igs-deck-count">${esc([...traitTags(x), traitLine(x)].filter(Boolean).join(' · '))}</span>${canPick ? btn('trait-drop', '替换', { id: x.traitId, disabled: busy || !ok.has(x.traitId) }) : ''}</li>`).join('')}</ul>`
        : '';
    const acts = canPick ? btn('trait-drop', '放弃', { id: t.traitId, disabled: busy }) : btn('trait-done', '确定', { primary: true, disabled: Boolean(v.pending) });
    return `<section class="igs-deck-reveal" data-phase="open" data-rarity="${esc(t.rarity)}"${r.fresh ? ' data-fresh' : ''}${still}>`
        + `<div class="igs-deck-reveal-stage"><div class="igs-deck-reveal-card">${r.fresh ? REVEAL_BACK : ''}${face}</div>${fx}</div>${info}${slots}<div class="igs-deck-actions">${acts}</div></section>`;
}

// 状态页：相对档（非主角）、开战换算、六维与调整值、熟练加值、被动与人物特性。主角的个人被动占特性槽，只在特性槽里列（被替换后不再出现）。
function statusPage(v, d) {
    const a = d.attributes;
    const parts = [];
    if (a && !a.protagonist && d.relLabel) parts.push(row('相对', chip(d.relLabel)));
    // 生命：当前 / 上限（持续伤势已计入）与伤势词；满血时只写上限。
    const hp = d.combat && (d.combat.current ?? d.combat.hp) < d.combat.hp ? `生命 ${d.combat.current}/${d.combat.hp}` : `生命 ${d.combat?.hp}`;
    if (d.combat) parts.push(row('开战', chip(hp) + (d.combat.injury && d.combat.injury !== '无伤' ? chip(d.combat.injury) : '') + chip(`速度 ${d.combat.speed}`)));
    if (a && Number.isFinite(a.proficiency)) parts.push(row('熟练', chip(`+${a.proficiency}`)));
    // 没有属性表时六维是按定位推算的默认值，照常用于战斗；说明写在属性格上方，不与数值并列成「未创建」。
    const abilities = `${a?.table === 'missing' ? '<p class="igs-deck-help">属性表未创建，以下为按定位推算的默认值。</p>' : ''}${abilityGrid(d.abilities, false)}`;
    if (d.abilities?.length) parts.push(section('六维', abilities));
    // 被动：名称与效果一并写出（不只放在悬停提示里，触屏也能看到）。
    const passiveRows = d.kind === 'skill-character'
        ? (d.passives || []).map((p) => bagRow('', `<span class="igs-deck-name">${esc(p.name)}</span>`, ''))
        : [d.classPassive && passiveRow('职业', d.classPassive), d.personalPassive && !d.traitSlots && passiveRow('个人', d.personalPassive)].filter(Boolean);
    if (passiveRows.length) parts.push(section('被动', `<ul class="igs-deck-collection">${passiveRows.join('')}</ul>`));
    const traits = traitsHtml(v, d);
    if (traits) parts.push(traits);
    return parts.join('');
}

// 手动建档（P8c）：尚无建档记录的角色逐项分配六维，选定位、填职业名；擅长项按分值推导，「确认建档」写入属性表 init。
function manualPage(v) {
    const m = v.manual;
    if (m.table !== 'ok') {
        const retry = v.readonly ? '' : tablesRetryBtn(v);
        return `${row('属性', chip('属性表未创建'))}${retry ? `<div class="igs-deck-actions">${retry}</div>` : ''}`;
    }
    const busy = Boolean(v.pending);
    const off = busy || !m.editable;
    const roles = m.roles.map((r) => btn('manual-role', r.label, { id: r.key, pressed: r.key === m.role, disabled: off })).join('');
    const name = `<input type="text" class="igs-deck-input" data-deck-input="manual-class" maxlength="12" value="${esc(m.className)}" aria-label="职业名"${m.editable ? '' : ' disabled'}>`;
    const prefs = chip(`主擅长 ${m.prefLabels.major}`) + chip(`次擅长 ${m.prefLabels.minor}`) + chip(`短板 ${m.prefLabels.weak}`);
    const actions = v.readonly ? chip('战斗进行中 · 只读')
        : `${btn('manual-reset', '还原', { disabled: !m.dirty || busy })}${btn('manual-confirm', v.pending === 'manual' ? '保存中' : '确认建档', { primary: true, disabled: !m.ok || busy })}`;
    return `${row('点数', `<span class="igs-deck-size" role="status">剩余 ${m.left} 点 · 总分 ${m.total}/${m.max}</span>`)}${row('职业名', name)}${row('定位', roles)}`
        + `${abilityGrid(m.rows, m.editable, busy, 'manual')}${row('擅长', prefs)}<div class="igs-deck-actions">${actions}</div>`;
}

// 加点页：主角逐点分配属性提升点，「确认加点」后写一条 alloc 记录；非主角与战斗进行中只读；缺属性表（自动补建未成）时给「重试」。
function allocPage(v) {
    if (v.manual) return manualPage(v);
    const a = v.alloc;
    if (!a) return '';
    if (a.table !== 'ok') {
        const retry = v.readonly ? '' : tablesRetryBtn(v);
        return `<p class="igs-deck-help">属性表未创建，暂时不能加点；以下为按定位推算的默认值。</p>${abilityGrid(a.rows, false)}${retry ? `<div class="igs-deck-actions">${retry}</div>` : ''}`;
    }
    if (!a.protagonist) return `<p class="igs-deck-help">只有主角可以分配属性点。</p>${abilityGrid(a.rows, false)}`;
    const busy = Boolean(v.pending);
    const actions = v.readonly ? chip('战斗进行中 · 只读')
        : `${btn('alloc-reset', '还原', { disabled: !a.dirty || busy })}${btn('alloc-confirm', v.pending === 'alloc' ? '保存中' : '确认加点', { primary: true, disabled: !a.dirty || busy })}`;
    return `${row('可分配', `<span class="igs-deck-size" role="status">剩余 ${a.left} 点 · 共 ${a.balance} 点</span>`)}${abilityGrid(a.rows, a.editable, busy)}<div class="igs-deck-actions">${actions}</div>`;
}

// 卡组页：卡组角色为现构筑；技能角色为强度档、技能与手动生成卡组档案。
function deckPage(v, d) {
    if (d.kind !== 'skill-character') return deckHtml(v, d);
    const tiers = !v.readonly && d.tiers ? row('强度', d.tiers.map((t) => btn('set-tier', t.label, { id: t.key, pressed: t.key === d.tier, disabled: Boolean(v.pending) })).join('')) : '';
    return `${tiers}${row('技能', d.skills.map((s) => chip(s.name)).join(''))}${generateHtml(v, d)}`;
}

const PAGE_HTML = Object.freeze({ status: statusPage, alloc: allocPage, gear: gearHtml, deck: deckPage });

// 页签：日记页「按人物 / 时间线」同款分段按钮。
function tabsHtml(page, d) {
    return `<div class="igs-deck-tabs" role="tablist" aria-label="人物状态">${DECK_PAGES.map((p) => `<button type="button" class="igs-deck-tab" role="tab" id="igs-deck-tab-${p}" aria-controls="igs-deck-page" data-deck-act="page" data-deck-id="${p}" aria-selected="${p === page}">`
        + `${esc(p === 'deck' && d.kind === 'skill-character' ? '技能' : DECK_PAGE_LABELS[p])}</button>`).join('')}</div>`;
}

// 详情卡片页头：大号首字头像、名字，下方一行标签（等级、职业、金钱）。生命只在状态页「开战」行写一次（已计入体质与伤势），页头不再另写基础血量。
const tag = (text) => `<span class="igs-deck-tag">${esc(text)}</span>`;
function detailHead(name, tags) {
    return `<header class="igs-deck-detail-head"><span class="igs-deck-avatar is-large" aria-hidden="true">${initial(name)}</span>`
        + `<div class="igs-deck-detail-title"><h3>${esc(name)}</h3><div class="igs-deck-tags">${tags.filter(Boolean).map(tag).join('')}</div></div></header>`;
}

function detailHtml(v) {
    if (v.selectedBuild) return buildDetailHtml(v);
    const d = v.detail;
    if (!d) return '';
    const classText = d.className && d.tierName ? `${d.className} · ${d.tierName}` : d.className;
    // 金钱只主角有：解锁特性槽、抽特性、转职等按钮按它置灰，页头直接写出余额。
    const head = detailHead(d.name, [expText(d), classText, d.tierLabel && v.readonly ? `强度 · ${d.tierLabel}` : '', d.canSell ? `金钱 ${d.points || 0}` : '']);
    const page = DECK_PAGES.includes(v.page) ? v.page : 'status';
    return `<section class="igs-deck-detail">${head}${tabsHtml(page, d)}`
        + `<div class="igs-deck-page" id="igs-deck-page" role="tabpanel" aria-labelledby="igs-deck-tab-${page}" data-page="${page}">${PAGE_HTML[page](v, d)}</div></section>`;
}

// 待建档角色（P8c）：只有建档页（逐项加点、定位与职业名），确认后写属性表 init，之后按档案或数值系统角色列出。
function buildDetailHtml(v) {
    if (!v.manual) return '';
    return `<section class="igs-deck-detail">${detailHead(v.selectedBuild, ['待建档'])}<div class="igs-deck-page" id="igs-deck-page" data-page="build">${manualPage(v)}</div></section>`;
}

// 主角卡组预生成：生成中 / 自动重试中只显示状态；失败显示原因与手动重试。就绪或未开始时不显示。
function protagonistHtml(v) {
    const p = v.protagonist;
    if (!p) return '';
    if (p.status === 'generating') return row('主角卡组', chip('生成中'));
    if (p.status === 'retrying') return row('主角卡组', chip(`请求失败，自动重试第 ${p.attempt} 次`));
    if (p.status !== 'failed') return '';
    const editing = v.generationForm?.kind === 'protagonist';
    const retry = v.readonly || !v.canRetryProtagonist ? '' : btn('retry-protagonist', editing ? '确认重试' : '重试', { primary: true, disabled: Boolean(v.pending) || v.generationForm?.loading === true });
    return row('主角卡组', `<span class="igs-deck-err" role="status">${esc(deckReasonText(p.reason))}</span>${retry}${editing ? btn('generation-cancel', '取消') : ''}`) + (editing ? renderCombatGenerationForm(v.generationForm, Boolean(v.pending)) : '');
}

function pendingHtml(v) {
    const parts = [];
    const hero = protagonistHtml(v);
    if (hero) parts.push(hero);
    const items = v.pendingGeneration || [];
    if (items.length) {
        const list = items.map((p) => chip(`${p.character || p.characterId || ''} · ${PENDING_KIND[p.kind] || p.kind}${p.skill || p.className ? ` ${p.skill || p.className}` : ''}`)).join('');
        parts.push(row('待整理', list + (v.readonly ? '' : btn('retry-growth', v.pending === 'growth' ? '整理中' : '重试', { disabled: Boolean(v.pending) }))));
    }
    if (v.sendFailed) parts.push(row('战报', chip('未发送') + btn('retry-send', v.pending === 'send' ? '发送中' : '重新发送', { primary: true, disabled: Boolean(v.pending) })));
    return parts.length ? `<section class="igs-deck-pending">${parts.join('')}</section>` : '';
}

const STATE_TEXT = Object.freeze({ loading: '正在读取', unavailable: '卡牌战斗不可用' });

export function renderCombatDeckPanelHtml(v) {
    // 页头与日记、目录同一外壳：左返回、居中标题、右侧配色色板（注入了保存配色时才给）。
    const themeSwitch = v.canTheme ? `<div class="igs-rp-theme-switch" role="radiogroup" aria-label="界面配色">${renderSettingsThemeSwitch(v.theme, {
        optionClass: 'igs-rp-theme-option', attrs: (value) => `data-deck-act="theme" data-deck-id="${value}"` })}</div>` : '';
    const head = recordPageHeadHtml('人物状态', { closeAttr: 'data-deck-act', backAriaLabel: '关闭', trailing: themeSwitch });
    const notice = v.notice ? `<p class="igs-rp-notice igs-deck-notice" role="alert">${esc(v.notice)}</p>` : '';
    let main;
    const stage = v.status === 'ready' ? revealHtml(v) : '';
    if (v.status === 'error') {
        // 数据库表原因（缺表、未载入、建表失败等）且注入了 ensureTables：「重试」先补建表再重读；其余原因只重读。
        const tableRetry = String(v.reason).startsWith('combat-table-') ? tablesRetryBtn(v) : '';
        main = `<p class="igs-deck-state">${esc(deckReasonText(v.reason))}</p><div class="igs-deck-actions">${tableRetry || btn('reload', '重试', { primary: true })}</div>`;
    }
    else if (v.status !== 'ready') main = `<p class="igs-deck-state"${v.status === 'loading' ? ' aria-busy="true"' : ''}>${esc(STATE_TEXT[v.status] || '')}</p>`;
    else if (stage) main = stage;
    else if (!v.roster.length && !(v.builds || []).length) main = `<p class="igs-deck-state">还没有角色档案</p>${pendingHtml(v)}`;
    // 日记页同款两栏：左侧人物名单，右侧详情卡片（窄屏名单变成横向一排）。
    else main = `${pendingHtml(v)}<div class="igs-deck-layout"><aside class="igs-deck-side">${rosterHtml(v)}</aside>${detailHtml(v)}</div>`;
    // 神话第一次翻开：整面板闪白，挂在主区之外以铺满面板（低画质与减少动态效果不出）。
    const flash = stage && v.reveal.fresh && v.reveal.rarity === 'mythic' ? '<span class="igs-deck-reveal-flash" aria-hidden="true"></span>' : '';
    return `<div class="igs-rp-page">${head}<div class="igs-rp-body"><div class="igs-deck-main" data-status="${esc(v.status)}">${notice}${main}</div></div></div>${flash}`;
}

