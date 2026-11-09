// 数值系统提示词编辑（§9）：每段一个可编辑模板，可单独关闭，可恢复默认；阶段文案同样可改。
// 留空表示使用默认值（默认值作为占位提示显示），整块默认折叠在高级分区里。
import { DEFAULT_STAGE_TEXT, DEFAULT_STAT_PROMPTS, STAT_PROMPT_SEGMENTS } from '../../scene/stats/stat-prompt.js';
import { BUILD_ABILITY_OPTIONS, BUILD_CUSTOM_MAX, BUILD_CUSTOM_OPTION, BUILD_PREF_FIELDS, BUILD_PREF_LABELS, BUILD_ROLE_OPTIONS, BUILD_GOOD_VALUE, BUILD_PICK_SLOTS, BUILD_STRONG_VALUE, buildSummary, manualBuildSummary, groupPickCandidates, normalizeBuild, pickCandidates, pickSummary } from '../../scene/stats/stat-build.js';
import { ABILITY_KEYS, ABILITY_LABELS, MANUAL_BUILD } from '../../combat/abilities.js';
import { rulesetOptions } from '../../scene/stats/rulesets/index.js';
import { checkbox, field, hiddenAttr, numberInput, segmentedInput, selectInput, textInput, textareaInput } from './settings-fields.js';
import { esc } from './reader-value-utils.js';
import { CHANGE_CAP_TEXT, WORLD_GENRES } from '../../scene/stats/stat-status-defs.js';
import { BASE_ATTRIBUTES, grudgeTier } from '../../scene/stats/stat-state.js';
import { FAME_BAR_MAX } from '../../scene/stats/stat-fame.js';
import { compileCaptureRegex } from '../../scene/stats/stat-date.js';
import { dropButton, editCard, editFold, editRow, renderNameStatus, renderPersonChips, renderTraitEdit, renderTraitView, sectionHead, viewBlock } from './trait-chips.js';
import { renderTraitCodex } from './trait-codex-panel.js';

// 提示词分组：每段可单独开关。「roll」是 CoC 沿用的旧段名，「dice」是 v0.39 的新段名，两者哪个存在就显示哪个。
export const STAT_PROMPT_LABELS = Object.freeze({
    source: '数值来源声明',
    protagonist: '主角状态',
    fame: '声望',
    skills: '主角技能',
    perception: '主角感知',
    present: '在场角色',
    sheets: '在场角色的本事',
    check: '本轮检定',
    roll: '本轮检定骰面',
    dice: '骰序与检定写法',
    tags: '标签说明',
    combat: '战斗标签（卡牌战斗开启时）',
    party: '主角团状态（卡牌战斗开启时）',
    mandates: '强制事项',
});
// 不单独开关的模板：手动掷骰规则随检定骰面一起开关；后台请求不进主生成。sheets、sheetGen 已恢复为可编辑。
export const STAT_EXTRA_PROMPT_LABELS = Object.freeze({
    rollManual: '手动掷骰规则',
    diceManual: '手动掷骰规则',
    presentRule: '在场角色·阶段约束（全体一次）',
    breakthrough: '在场角色·好感到阶段上限时追加',
    intimacy: '在场角色·未到亲密阶段时追加（NSFW）',
    intimacyForced: '在场角色·已豁免亲密门槛时追加（NSFW）',
    sheetGen: '角色卡生成（后台请求）',
    backfill: '新技能补全（后台请求）',
    heroSkills: '主角技能分配（后台请求）',
    startRelations: '起始关系补填（后台请求）',
});

// 失效提示词的显示名：只有被新版本弃用的几项（STAT_STALE_PROMPT_KEYS）会进入 stalePrompts。
const STALE_PROMPT_NAMES = Object.freeze({ roll: '掷骰规则', rollManual: '手动掷骰规则', protagonist: '主角状态' });

// 设置里 stalePrompts 非空（且不为空串）的项 → 显示名列表；用于「旧版提示词覆盖已失效」提示。
export function staleStatsPromptNames(stats) {
    const stale = (stats && stats.stalePrompts) || {};
    return Object.keys(stale).filter((key) => typeof stale[key] === 'string' && stale[key].trim()).map((key) => STALE_PROMPT_NAMES[key] || key);
}

function textOf(map, key) {
    const value = map && typeof map[key] === 'string' ? map[key] : '';
    return value;
}

// stats：normalizeStatsSettings 的结果；advancedOpen(key) 返回 ' open' 或 ''。
export function renderStatsPromptFields(stats, advancedOpen = () => '') {
    const prompts = (stats && stats.prompts) || {};
    const segments = (stats && stats.segments) || {};
    const stageText = (stats && stats.stageText) || {};
    const rows = STAT_PROMPT_SEGMENTS.map((id) => {
        const custom = textOf(prompts, id);
        const effective = custom || DEFAULT_STAT_PROMPTS[id];
        const label = STAT_PROMPT_LABELS[id] || id;
        return `<div class="igs-settings-section" data-stats-prompt="${esc(id)}">`
            + checkbox(`bridge.stats.segments.${id}`, segments[id] !== false, `注入「${label}」（约 ${Array.from(effective).length} 字）`)
            + `<div class="igs-settings-full">${textareaInput(`bridge.stats.prompts.${id}`, effective, '')}</div>`
            + `<div class="igs-settings-row"><button class="igs-settings-action" data-action="stats-prompt-reset:${esc(id)}" type="button"${custom ? '' : ' disabled'}>恢复默认</button></div>`
            + '</div>';
    }).join('');
    const extras = Object.entries(STAT_EXTRA_PROMPT_LABELS).filter(([id]) => typeof DEFAULT_STAT_PROMPTS[id] === 'string').map(([id, label]) => {
        const custom = textOf(prompts, id);
        return `<div class="igs-settings-section" data-stats-prompt="${esc(id)}">`
            + field(`bridge.stats.prompts.${id}`, label, textareaInput(`bridge.stats.prompts.${id}`, custom || DEFAULT_STAT_PROMPTS[id], ''))
            + `<div class="igs-settings-row"><button class="igs-settings-action" data-action="stats-prompt-reset:${esc(id)}" type="button"${custom ? '' : ' disabled'}>恢复默认</button></div>`
            + '</div>';
    }).join('');
    const stages = Object.keys(DEFAULT_STAGE_TEXT).map((name) => field(
        `bridge.stats.stageText.${name}`,
        name,
        textareaInput(`bridge.stats.stageText.${name}`, textOf(stageText, name) || DEFAULT_STAGE_TEXT[name], ''),
    )).join('');
    const stale = stats && stats.staleNoticeSeen === true ? [] : staleStatsPromptNames(stats);
    const staleRow = stale.length
        ? `<div class="igs-settings-row" data-stats-prompt-stale><span class="igs-source-filter-note">旧版提示词覆盖已失效，改用内置内容：${esc(stale.join('、'))}</span><button class="igs-settings-action" data-action="stats-prompt-stale-ack" type="button">知道了</button></div>`
        : '';
    return staleRow + `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-prompts"${advancedOpen('stats-prompts')}>`
        + '<summary>高级：注入给 AI 的提示词</summary>'
        + '<div class="igs-source-filter-note">框里是当前生效的提示词，可直接修改；点「恢复默认」回到内置内容。模板里的 {{变量}} 写错时会原样保留，不会中断。</div>'
        + rows
        + extras
        + `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-stage-text"${advancedOpen('stats-stage-text')}><summary>关系阶段文案</summary><div class="igs-source-filter-grid">${stages}</div></details>`
        + '</details>';
}

// 存档区（§10）：当前数值一目了然；技能与变动记录折叠，低频信息不平铺。model 为 statsArchiveModel 的结果。
const MAPPING_TARGETS = Object.freeze({ stamina: '体力', money: '金钱', stress: '压力', base: '基础属性', special: '特有属性', skills: '才艺技能' });

// 骰子手感：面向只懂 RPG 的玩家，底层仍是 bridge.stats.ruleset（coc7 百分骰 / dnd5e 二十面骰），选项来自规则集登记表。
const DICE_FEEL = Object.freeze({ coc7: '百分骰（结果更看运气）', dnd5e: '二十面骰（属性越高越稳）' });

export function renderStatsRulesetField(ruleset) {
    const rank = (id) => { const i = Object.keys(DICE_FEEL).indexOf(id); return i < 0 ? 99 : i; };
    const items = rulesetOptions().sort(([x], [y]) => rank(x) - rank(y)).map(([id, label]) => [id, DICE_FEEL[id] || label]);
    return field('bridge.stats.ruleset', '骰子手感', segmentedInput('bridge.stats.ruleset', ruleset, items, '骰子手感'));
}

// 建卡区提示文案与可用状态：渲染和输入时就地刷新共用同一份计算。mode 为 'manual' 时按手动六维算。
export function statsBuildStatus(build, worldview, mode = null) {
    const s = mode === 'manual' ? manualBuildSummary(build) : buildSummary(build);
    let pointNote;
    if (mode === 'manual') {
        const problem = s.errors.includes('stats-build-over-total') ? `总分超过 ${s.max}` : s.errors.includes('stats-build-score-range') ? `单项须在 ${MANUAL_BUILD.min}–${MANUAL_BUILD.max}` : '';
        const prefs = s.prefs ? ` · 主擅长 ${ABILITY_LABELS[s.prefs.major]} · 次擅长 ${ABILITY_LABELS[s.prefs.minor]} · 短板 ${ABILITY_LABELS[s.prefs.weak]}` : '';
        pointNote = `剩余 ${Math.max(0, s.left)} 点 · 总分 ${s.total}/${s.max}${problem ? ` · ${problem}` : prefs}`;
    } else {
        pointNote = s.errors.includes('stats-build-prefs-duplicate') ? '主擅长、次擅长、短板须是三项不同的属性。' : '主擅长 15、次擅长 14、短板 8，其余三项 13 / 12 / 10。';
    }
    return { ok: s.ok, pointNote };
}

// 技能格提示：擅长三格必选、同一技能不能占两格；起步说明按骰子分开写。
function pickNote(errors = [], ruleset = 'coc7') {
    if (errors.includes('stats-build-pick-duplicate')) return '同一项技能只能选一次。';
    if (errors.includes('stats-build-strong-missing')) return '擅长技能须选满3项。';
    const head = ruleset === 'dnd5e'
        ? '擅长技能加全额熟练加值，比较擅长加一半（向下取整），其余技能只加属性调整值。'
        : `擅长技能${BUILD_STRONG_VALUE}起步，比较擅长${BUILD_GOOD_VALUE}起步，其余技能按未学的基础值计算。`;
    return `${head}世界观技能与剧情技能另外计算。`;
}

// 擅长 3 格、比较擅长 5 格：下拉写设置草稿 bridge.stats.build.picks.<格>，建卡与新聊天选择共用。
export function renderSkillPicks(build, ruleset = 'coc7') {
    const b = normalizeBuild(build);
    const { custom, groups } = groupPickCandidates(b);
    const taken = new Set(BUILD_PICK_SLOTS.map((slot) => b.picks[slot]).filter(Boolean));
    const label = (slot) => `${slot.startsWith('strong') ? '擅长' : '比较擅长'}${'一二三四五'[Number(slot.replace(/\D/g, '')) - 1]}`;
    // 其他格已选的技能在本格下拉里置灰（仍显示）；「自定义…」选中后弹框填名字与所属六维。
    const canAddCustom = b.custom.length < BUILD_CUSTOM_MAX;
    const select = (slot) => {
        const path = `bridge.stats.build.picks.${slot}`;
        const option = (name) => {
            const off = taken.has(name) && b.picks[slot] !== name;
            return `<option value="${esc(name)}"${name === b.picks[slot] ? ' selected' : ''}${off ? ' disabled' : ''}>${esc(name)}</option>`;
        };
        // 顺序：未选 → 自定义… → 已建自定义技能 → 按类分组。
        const options = [`<option value="">未选</option>`, ...(canAddCustom ? [`<option value="${BUILD_CUSTOM_OPTION}">自定义…</option>`] : []), ...custom.map(option),
            ...groups.map((g) => `<optgroup label="${esc(g.label)}">${g.items.map(option).join('')}</optgroup>`)].join('');
        return `<select data-path="${esc(path)}" data-stats-pick-slot="${slot}">${options}</select>`;
    };
    const grid = BUILD_PICK_SLOTS.map((slot) => field(`bridge.stats.build.picks.${slot}`, label(slot), select(slot))).join('');
    return `<div class="igs-source-filter-note" data-result="stats-build-special" data-stats-ruleset="${esc(ruleset)}">${esc(pickNote(pickSummary(b).errors, ruleset))}</div><div class="igs-source-filter-grid">${grid}</div>`;
}

// 选完之后常驻的八格：显示聊天里每格当前占的技能，换格直接写聊天存档（data-stats-hero-slot），不进设置草稿。
// 其他格已占的技能置灰；空格可选「未选」以外的任意候选。
export function renderHeroSlots(build, slots, ruleset = 'coc7') {
    const b = normalizeBuild(build);
    const held = slots && typeof slots === 'object' ? slots : {};
    const taken = new Set(Object.values(held));
    const known = new Set(pickCandidates(b));
    const extra = [...taken].filter((name) => !known.has(name));
    const label = (slot) => `${slot.startsWith('strong') ? '擅长' : '比较擅长'}${'一二三四五'[Number(slot.replace(/[^0-9]/g, '')) - 1]}`;
    const { custom, groups } = groupPickCandidates(b);
    const select = (slot) => {
        const cur = held[slot] || '';
        const option = (name) => `<option value="${esc(name)}"${name === cur ? ' selected' : ''}${taken.has(name) && name !== cur ? ' disabled' : ''}>${esc(name)}</option>`;
        const options = [`<option value=""${cur ? ' disabled' : ' selected'}>未选</option>`, `<option value="${BUILD_CUSTOM_OPTION}">自定义…</option>`,
            ...[...extra, ...custom].map(option), ...groups.map((g) => `<optgroup label="${esc(g.label)}">${g.items.map(option).join('')}</optgroup>`)].join('');
        return `<select data-stats-hero-slot="${slot}" data-stats-hero-slot-old="${esc(cur)}" aria-label="${esc(label(slot))}">${options}</select>`;
    };
    const grid = BUILD_PICK_SLOTS.map((slot) => field('', label(slot), select(slot))).join('');
    const head = ruleset === 'dnd5e'
        ? '擅长技能加全额熟练加值，比较擅长加一半（向下取整）。更换技能时，原技能回到未学，新技能按该格起步。'
        : `擅长技能${BUILD_STRONG_VALUE}起步，比较擅长${BUILD_GOOD_VALUE}起步。更换技能时，原技能回到未学，新技能按该格起步。`;
    return `<div class="igs-settings-section" data-stats-hero-slots><div class="igs-source-filter-title">擅长技能</div><div class="igs-source-filter-note">${esc(head)}</div><div class="igs-source-filter-grid">${grid}</div></div>`;
}

// 数字框输入只写草稿、不整页重绘（保焦点）；剩余点数、技能提示与「按分配启用」在这里就地更新。
export function refreshStatsBuildStatus(root, build, worldview) {
    if (!root || typeof root.querySelector !== 'function') return false;
    const holder = root.querySelector('[data-advanced="stats-build"]');
    const attr = (name) => (holder && typeof holder.getAttribute === 'function' ? holder.getAttribute(name) || undefined : undefined);
    const st = statsBuildStatus(build, worldview === undefined ? attr('data-stats-worldview') : worldview, attr('data-stats-mode') || null);
    const point = root.querySelector('[data-result="stats-build"]');
    if (point) point.textContent = st.pointNote;
    const notes = typeof root.querySelectorAll === 'function' ? root.querySelectorAll('[data-result="stats-build-special"]') : [];
    const errors = pickSummary(build).errors;
    for (const note of notes) note.textContent = pickNote(errors, (typeof note.getAttribute === 'function' && note.getAttribute('data-stats-ruleset')) || 'coc7');
    // 技能格去重：按各下拉当前值，同步其余下拉里已被占用的选项（不整页重绘）。
    const selects = typeof root.querySelectorAll === 'function' ? [...root.querySelectorAll('select[data-stats-pick-slot]')] : [];
    const chosen = selects.map((el) => el.value).filter(Boolean);
    for (const el of selects) {
        for (const option of el.options || []) option.disabled = Boolean(option.value) && option.value !== BUILD_CUSTOM_OPTION && option.value !== el.value && chosen.includes(option.value);
    }
    const button = root.querySelector('[data-action="stats-chat-enable-build"]');
    if (button) button.disabled = !st.ok;
    const pick = root.querySelector('[data-action="stats-op:hero-pick"]');
    if (pick) pick.disabled = !pickSummary(build).ok;
    return true;
}

// 建档方式三选一（自动生成 / 手动建档 / 相对数值）：只切界面状态，由 data-action="stats-build-mode:<值>" 处理。
export const STATS_BUILD_MODE_ITEMS = Object.freeze([['auto', '自动生成'], ['manual', '手动建档'], ['relative', '相对数值']]);

export function renderStatsBuildModeField(mode) {
    return field('', '建档方式', segmentedInput('', mode || 'auto', STATS_BUILD_MODE_ITEMS, '建档方式', { action: 'stats-build-mode' }));
}

// 建卡（§6、§10A）：默认折叠。自动/相对数值选六维倾向；手动建档填职业与六维加点（总分 72 以内）。
// 超分或多选时「按分配启用」禁用并说明原因。
export function renderStatsBuildFields(build, advancedOpen = () => '', { worldview, mode = null, ruleset = 'coc7' } = {}) {
    const b = normalizeBuild(build);
    const manual = mode === 'manual';
    const st = statsBuildStatus(b, worldview, manual ? 'manual' : null);
    const base = manual
        ? field('bridge.stats.build.className', '职业名', textInput('bridge.stats.build.className', b.className, ''))
            + field('bridge.stats.build.role', '定位', selectInput('bridge.stats.build.role', b.role, BUILD_ROLE_OPTIONS))
            + ABILITY_KEYS.map((key) => field(`bridge.stats.build.scores.${key}`, ABILITY_LABELS[key], numberInput(`bridge.stats.build.scores.${key}`, b.scores[key], MANUAL_BUILD.min, MANUAL_BUILD.max, false, 1))).join('')
        : BUILD_PREF_FIELDS.map((key) => field(`bridge.stats.build.prefs.${key}`, BUILD_PREF_LABELS[key], selectInput(`bridge.stats.build.prefs.${key}`, b.prefs[key], BUILD_ABILITY_OPTIONS))).join('');
    // 自定义技能出现在下拉候选里，这一行只放增删按钮。
    const addSkill = b.custom.length < BUILD_CUSTOM_MAX
        ? '<button type="button" class="igs-btn-mgr-icon" data-action="stats-build-add-skill" title="新增自定义技能" aria-label="新增自定义技能">+</button>'
        : '';
    const removeSkill = b.custom.length
        ? '<button type="button" class="igs-btn-mgr-icon" data-action="stats-build-remove-skill" title="删除自定义技能" aria-label="删除自定义技能">−</button>'
        : '';
    const customRow = `<div class="igs-settings-field igs-stats-custom-row"><span>自定义技能</span><div class="igs-mood-word-list">${addSkill}${removeSkill}</div></div>`;
    return `<details class="igs-settings-sub igs-settings-advanced" data-stats-worldview="${esc(worldview || 'modern')}"${manual ? ' data-stats-mode="manual"' : ''} data-advanced="stats-build"${advancedOpen('stats-build')}>`
        + `<summary>${manual ? '建卡（六维加点与特有技能）' : '建卡（六维倾向与特有技能）'}</summary>`
        + `<div class="igs-source-filter-note" data-result="stats-build">${esc(st.pointNote)}</div>`
        + `<div class="igs-source-filter-grid">${base}</div>`
        + renderSkillPicks(b, ruleset)
        + customRow
        + `<div class="igs-settings-row"><button class="igs-settings-action" data-action="stats-chat-enable-build" type="button"${st.ok ? '' : ' disabled'}>按分配启用</button></div>`
        + '</details>';
}
const MAPPING_FORMS = Object.freeze({ number: '数字', stage: '阶段名', attrs: '多属性格' });

// 映射页（§8B 第 2、3、5 条）：同步关闭时不显示；默认折叠。described 为 describeStatMappings 的结果。
export function renderStatsMappingFields(described, advancedOpen = () => '', { pushEnabled = false } = {}) {
    if (!pushEnabled) return '';
    let body;
    if (!described) body = '<div class="igs-source-filter-note">没有检测到数据库插件，装好后这里会列出推送目标。</div>';
    else if (!described.ok) body = `<div class="igs-source-filter-note">读取表格失败（${esc(described.detail || described.reason)}），暂时无法显示映射。</div>`;
    else if (!described.rows.length) body = '<div class="igs-source-filter-note">当前表格模板里没有识别到可推送的列。</div>';
    else {
        const fresh = described.known ? ''
            : `<div class="igs-source-filter-note">检测到新的表格模板，请检查映射。</div><div class="igs-settings-row"><button class="igs-settings-action" data-action="stats-mapping-confirm:${esc(described.fingerprint)}" type="button">确认映射</button></div>`;
        body = fresh + described.rows.map((r) => {
            const path = `bridge.stats.push.mappings.${described.fingerprint}.${r.key}`;
            const items = [['auto', `自动（${MAPPING_FORMS[r.form] || r.form}）`]];
            if (r.kind === 'dim') items.push(['number', '数字']);
            if (r.stageAllowed) items.push(['stage', '阶段名']);
            items.push(['skip', '不推送']);
            const target = MAPPING_TARGETS[r.target] || r.target;
            return field(path, `${target} → ${r.table} · ${r.column}`, selectInput(path, r.value, items));
        }).join('');
    }
    return `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-mappings"${advancedOpen('stats-mappings')}><summary>高级：推送到哪张表哪一列</summary>${body}</details>`;
}

// 「我的角色」已开始时的角色卡一览：天数与生命、体力、压力、金钱，六维，主角技能（折叠）。
export function renderStatsHeroCard(model, advancedOpen = () => '', build = null) {
    if (!model) return '<div class="igs-source-filter-note">本聊天还没有数值存档。启用后从当前楼开始记录。</div>';
    // 新聊天还没选擅长技能：选择区放在最前，确定后不再显示。
    const pick = model.needsPick
        ? `<div class="igs-settings-section" data-stats-hero-pick><div class="igs-source-filter-title">选择擅长技能</div>${renderSkillPicks(build, model.ruleset)}`
            + `<div class="igs-stats-hero-actions"><button class="igs-settings-action" data-action="stats-op:hero-pick" type="button"${pickSummary(build).ok ? '' : ' disabled'}>确定</button></div></div>`
        : '';
    const n = (v) => String(Math.round(Number(v) || 0));
    const bars = model.bars || {};
    const cell = statCell;
    // 生命来自战斗 vitals（当前/最大）；没有数据时不显示这一项，避免出现「未知」或 0。
    const cells = [
        ...(model.day != null ? [cell('天数', `第${n(model.day)}天`)] : []),
        ...(model.vitals ? [cell('生命', `${n(model.vitals.down ? 0 : model.vitals.hp)}/${n(model.vitals.maxHp)}`)] : []),
        cell('体力', n(bars.stamina)), cell('压力', n(bars.stress)), cell('金钱', n(model.wallet ?? bars.money)),
    ];
    const head = `<div class="igs-stats-hero-grid">${cells.join('')}</div>`;
    const attrs = (model.attributes || []).length ? `<div class="igs-stats-hero-grid is-attrs">${model.attributes.map((a) => cell(a.name, a.display)).join('')}</div>` : '';
    // 技能与六维同一种数值格，一项一格；✓ 跟在技能名后。
    const skillCells = [...model.skills].sort((a, b) => b.value - a.value).map((s) => cell(`${s.name}${s.marked ? ' ✓' : ''}`, s.display ?? String(Math.round(s.value)))).join('');
    const skills = skillCells ? `<div class="igs-stats-hero-grid is-skills">${skillCells}</div>` : '<div class="igs-source-filter-note">无</div>';
    const d20 = model.ruleset === 'dnd5e' && skillCells ? '技能数值为检定加值，掷二十面骰后加上此值。' : '';
    // 技能与六维同一种数值格；编辑全部收在下方「高级」里。✓ 表示今天有成长机会，提示放在标题的 title 里。
    const skillHead = sectionHead('技能', `<em class="is-inline">${model.skills.length}</em>`,`✓ 表示今天有成长机会${d20 ? `。${d20}` : ''}`);
    return pick + `<div class="igs-settings-section igs-stats-sec" data-stats-numbers>${sectionHead('数值')}${head}${attrs}</div>`
        + `<div class="igs-settings-section igs-stats-sec" data-stats-skills>${skillHead}${skills}</div>`;
}

// 「我的角色」技能之后：观赏区（特质、声望只读小标签）与默认折叠的「编辑」（特质与声望编辑列表、修改属性）。
export function renderStatsHeroTail(model, advancedOpen = () => '') {
    if (!model) return '';
    const fame = Array.isArray(model.fame) ? model.fame : [];
    const attrEdit = model.heroAttrs ? '<div class="igs-stats-hero-actions"><button class="igs-settings-action" data-action="stats-op:hero-attrs" type="button">修改属性</button></div>' : '';
    return renderTraitView(PROTAGONIST_KEY, model)
        + viewBlock('data-stats-fame', '声望', `${fame.length}/${FAME_BAR_MAX}`, fame.map((r) => `<span class="igs-mood-review-chip igs-trait-chip is-tag" data-stats-fame-row="${esc(r.name)}"><b>${esc(r.owner && r.owner !== '主角' ? `${r.owner}·${r.name}` : r.name)} · ${esc(r.tier || r.kind)}</b></span>`).join(''))
        + editFold('stats-hero-edit', advancedOpen, advancedOpen('stats-hero-edit') ? renderTraitEdit(PROTAGONIST_KEY, model, advancedOpen) + renderFameEdit(fame) + attrEdit : '');
}

// 声望编辑列表：每行名字 + 归属·谁在看·类·每日变化·档位 + 「修改」「关闭」，末行「＋ 新增声望」（最多十条）。按钮直接写聊天存档；类与每日变化在「修改」里改。
function renderFameEdit(list) {
    const rows = list.map((r) => {
        const pairs = r.pairs ? (r.pairs.length ? r.pairs.map((p) => `与${p.partner}的组合：${p.tier}`).join(' · ') : '暂无搭档') : '';
        const key = encodeURIComponent(r.name);
        const desc = [r.owner || '主角', r.watcher, r.cls || r.kind, r.daily ? (r.daily === '无' ? '无自然变化' : r.daily.startsWith('每天') ? r.daily : `每天${r.daily}`) : '', r.tier, pairs].filter(Boolean).join(' · ');
        return editRow(r.name, desc, dropButton(`stats-op:fame-edit:${key}`, '修改') + dropButton(`stats-op:fame-remove:${key}`, '关闭'));
    }).join('');
    const add = list.length < FAME_BAR_MAX ? '<button type="button" class="igs-edit-add" data-action="stats-op:fame-add" title="记录某一群体对主角或其他角色的看法，可用模板或一句话开条；开条后写进提示词并参与结算，最多十条">＋ 新增声望</button>' : '';
    return editCard('声望', `${list.length}/${FAME_BAR_MAX}`, rows, add);
}

// 「我的角色」技能下方的「高级」折叠：擅长技能八格（选完后）、编辑技能、检定记录。
export function renderStatsHeroMore(model, advancedOpen = () => '', build = null) {
    if (!model) return '';
    const live = model.needsPick ? '' : renderHeroSlots(build, model.heroSlots, model.ruleset);
    return `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-hero-more"${advancedOpen('stats-hero-more')}><summary>高级</summary>`
        + live + renderSkillEditor(model, advancedOpen) + renderStatsHeroRecords(model, advancedOpen) + '</details>';
}

const SKILL_TIER_ITEMS = Object.freeze(['未学', '入门', '熟练', '精通', '大师']);

// 下拉：改动直接写聊天存档，不进设置草稿（data-stats-skill-attr / data-stats-skill-tier）。
function skillSelect(kind, s, list, current, label, disabledOf = null) {
    const items = list.includes(current) || !current ? list : [current, ...list];
    return `<select data-stats-skill-${kind}="${esc(s.name)}" aria-label="${esc(`${s.name}${label}`)}">${items.map((a) => `<option value="${esc(a)}"${a === current ? ' selected' : ''}${a !== current && disabledOf && disabledOf(a) ? ' disabled' : ''}>${esc(a)}</option>`).join('')}</select>`;
}

// 「编辑技能」一项：名字与数值（与数值格同一种显示，CoC 百分值、D&D 检定加值）一行；所属属性、熟练度两个下拉一行；
// 按钮一行用分段按钮样式、等宽居中：剧情中出现的技能为改名、合并、删除，占 3+5 格的不出合并；内置技能只有删除。
// 非剧情技能（及占格技能）的熟练度不能高于封顶档；capTier 为空表示不限。
const tierDisabled = (s) => (s.capTier ? (a) => SKILL_TIER_ITEMS.indexOf(a) > SKILL_TIER_ITEMS.indexOf(s.capTier) : null);
function skillEditRow(s) {
    const id = esc(encodeURIComponent(s.name));
    const learned = s.tier !== '未学';
    const btn = (op, label) => `<button class="igs-segmented-btn" data-action="stats-op:skill-${op}:${id}" type="button"><span class="igs-segmented-btn-label">${label}</span></button>`;
    const ops = s.story ? [['rename', '改名'], ...(s.slotted ? [] : [['merge', '合并']]), ['remove', '删除']] : learned ? [['remove', '删除']] : [];
    const buttons = ops.length
        ? `<div class="igs-segmented igs-stats-skill-ops">${ops.map(([op, label]) => btn(op, label)).join('')}</div>`
        : '';
    return `<div class="igs-settings-section" data-stats-skill-row="${esc(s.name)}"><div class="igs-stats-person-head"><b>${esc(s.name)}</b><span>${learned ? esc(s.display ?? String(s.value)) : '未学'}${s.story ? ' · 剧情中出现' : ''}</span></div>`
        + `<div class="igs-stats-hero-actions">${skillSelect('attr', s, BASE_ATTRIBUTES, s.attribute, '所属属性')}${skillSelect('tier', s, SKILL_TIER_ITEMS, s.tier, '熟练度', tierDisabled(s))}</div>`
        + buttons + '</div>';
}

// 「编辑技能」折叠：已学技能（数值高的在前）与剧情中出现的技能；未学的内置技能不列，需要时在上方八格里选择。
function renderSkillEditor(model, advancedOpen) {
    const rows = Array.isArray(model.skillEdit) ? model.skillEdit : [];
    const known = rows.filter((r) => r.tier !== '未学' || r.story).sort((a, b) => b.value - a.value);
    const learned = known.filter((r) => r.tier !== '未学').length;
    return `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-skill-edit"${advancedOpen('stats-skill-edit')}><summary>编辑技能（${learned}项已学）</summary>`
        + (known.filter((r) => r.story).length >= 2 ? '<div class="igs-stats-hero-actions"><button class="igs-settings-action" data-action="stats-op:story-tidy" type="button">整理剧情技能</button></div>' : '')
        + (known.length ? known.map(skillEditRow).join('') : '<div class="igs-source-filter-note">暂无已学技能。</div>')
        + '</details>';
}

// 「我的角色」底部按钮：暂停本聊天、复制数值诊断。按人设分配主角技能已并入「设置 › 登记与补全」的「补全角色数值」。
export function renderStatsHeroActions(model) {
    return `<div class="igs-stats-hero-actions"><button class="igs-settings-action" data-action="stats-chat-disable" type="button">暂停本聊天</button><button class="igs-settings-action" data-action="stats-storage-report" type="button">复制数值诊断</button></div>`;
}


const NO_ARCHIVE = '<div class="igs-source-filter-note">本聊天还没有数值存档。启用后从当前楼开始记录。</div>';
const roundText = (v) => esc(String(Math.round(Number(v) || 0)));
// 数值格：括号里的调整值、熟练档与所属属性拆成浅色小字，主数值不被长括号挤大。
function statCell(label, value) {
    const m = /^(.*?)\s*[（(](.+)[)）]$/.exec(String(value));
    const shown = m ? `${esc(m[1])}<small>${esc(m[2])}</small>` : esc(value);
    return `<div class="igs-stats-hero-cell"><span>${esc(label)}</span><b>${shown}</b></div>`;
}

// 角色卡面板：六维与技能直接展开，和人际数值连在一起看；编辑按钮收进「编辑」折叠（sheetOps）。
function renderSheetPart(s) {
    const skills = s.skills.map((k) => statCell(`${k.name}${k.provisional ? '（待定）' : ''}`, k.display)).join('');
    return `<div class="igs-stats-sec">${sectionHead('角色卡', `<em class="is-inline">${esc(s.rank)}${s.source === 'user' ? ' · 已手改' : ''}</em>`)}`
        + `<div class="igs-stats-hero-grid is-attrs">${s.attributes.map((a) => statCell(a.name, a.display)).join('')}</div>`
        + (skills ? `<div class="igs-stats-hero-grid is-skills">${skills}</div>` : '') + '</div>';
}

function sheetOps(name, hasSheet) {
    const id = esc(encodeURIComponent(name));
    const ops = hasSheet ? [['edit', '编辑角色卡'], ['regen', '重新生成'], ['remove', '删除角色卡']] : [['new', '生成角色卡']];
    return ops.map(([op, label]) => `<button class="igs-settings-action" data-action="stats-op:sheet-${op}:${id}" type="button">${label}</button>`).join('');
}

// 悟性已并入特质胶囊（trait-chips.js），主角键为「主角」。
const PROTAGONIST_KEY = '主角';

// 「我对TA」：输入框内容先存界面草稿（drafts），点「保存」才写进聊天存档；「按剧情拟写」只填草稿。
function heroNoteField(name, notes, drafts) {
    const id = esc(encodeURIComponent(name));
    const value = drafts && typeof drafts[name] === 'string' ? drafts[name] : (notes && notes[name]) || '';
    return `<label class="igs-settings-field"><span>我对TA</span><input type="text" data-stats-note="${esc(name)}" maxlength="${HERO_NOTE_MAX}" value="${esc(value)}" aria-label="我对TA"></label>`
        + `<div class="igs-stats-hero-actions"><button class="igs-settings-action" data-action="stats-op:note-draft:${id}" type="button">按剧情拟写</button>`
        + `<button class="igs-settings-action" data-action="stats-op:note-save:${id}" type="button">保存</button></div>`;
}
const HERO_NOTE_MAX = 40;

// 「编辑」折叠里的内容：特质编辑列表，之后是备注。数值与角色卡按钮由调用方放在前面。
function personEdit(name, model, drafts, lead = '', advancedOpen = () => '') {
    return lead + renderTraitEdit(name, model, advancedOpen) + heroNoteField(name, model.heroNotes, drafts);
}

// 「其他角色」：每人一张卡，人际数值在上，角色卡折叠在下。
export function renderStatsPeople(model, advancedOpen = () => '', { noteDrafts = null } = {}) {
    if (!model) return NO_ARCHIVE;
    const n = roundText;
    const sheetOf = new Map((model.sheets || []).map((s) => [s.name, s]));
    const people = model.characters.map((c) => {
        const cells = Object.entries(c.dims).filter(([k, v]) => k !== '芥蒂' || grudgeTier(v))
            .map(([k, v]) => statCell(k, k === '芥蒂' ? grudgeTier(v) : n(v))).join('');
        const id = esc(encodeURIComponent(c.name));
        const sheet = sheetOf.get(c.name);
        sheetOf.delete(c.name);
        const key = `stats-person-${c.name}`;
        // 面板在前（人际数值、角色卡六维与技能），所有编辑集中在末尾一个「编辑」折叠里；没有角色卡时可补生成。
        const editKey = `stats-edit-${c.name}`;
        return `<details class="igs-settings-advanced igs-stats-person" data-advanced="${esc(key)}"${advancedOpen(key)}><summary class="igs-stats-person-head"><b>${esc(c.name)}</b><span>${esc(c.stage)}</span>${renderNameStatus(c.name, model) || renderPersonChips(c.name, c.stage, model)}</summary>`
            + `<div class="igs-stats-hero-grid">${cells}</div>`
            + renderTraitView(c.name, model)
            + (sheet ? renderSheetPart(sheet) : '')
            + editFold(editKey, advancedOpen, advancedOpen(editKey) ? personEdit(c.name, model, noteDrafts, `<div class="igs-stats-hero-actions">`
                + `<button class="igs-settings-action" data-action="stats-op:relation-set:${id}|${['好感', '信任', '了解', ...(Object.hasOwn(c.dims, '欲望') ? ['欲望'] : [])].map((k) => n(c.dims[k])).join(',')}" type="button">修改数值</button>`
                + sheetOps(c.name, Boolean(sheet)) + '</div>', advancedOpen) : '')
            + '</details>';
    });
    const sheetOnly = [...sheetOf.values()].map((s) => {
        const key = `stats-person-${s.name}`;
        const editKey = `stats-edit-${s.name}`;
        return `<details class="igs-settings-advanced igs-stats-person" data-advanced="${esc(key)}"${advancedOpen(key)}><summary class="igs-stats-person-head"><b>${esc(s.name)}</b>${renderPersonChips(s.name, '', model)}</summary>${renderSheetPart(s)}`
            + `${editFold(editKey, advancedOpen, advancedOpen(editKey) ? personEdit(s.name, model, noteDrafts, `<div class="igs-stats-hero-actions">${sheetOps(s.name, true)}</div>`, advancedOpen) : '')}</details>`;
    });
    const list = [...people, ...sheetOnly].join('') || '<div class="igs-source-filter-note">还没有登记的角色。</div>';
    const pending = (model.pendingPeople || []).length ? `<div class="igs-source-filter-note">待生成角色卡：${model.pendingPeople.map(esc).join('、')}</div>` : '';
    // 全员类操作（导入、补填关系、生成数值、补全技能与特质）在「设置 › 登记与补全」。
    return list + pending;
}

// 「我的角色」下方：检定记录（折叠）。
export function renderStatsHeroRecords(model, advancedOpen = () => '') {
    if (!model) return '';
    const n = roundText;
    const checks = (model.checks || []).length
        ? model.checks.map((c) => `<div class="igs-source-filter-note">#${n(c.messageId)} ${esc(c.skill)}${c.difficulty !== '普通' ? `（${esc(c.difficulty)}）` : ''} ${esc(c.detail)} → ${esc(c.outcome)}${c.ruleset === 'dnd5e' ? ' · D&D' : ''}</div>`).join('')
        : '<div class="igs-source-filter-note">暂无检定。</div>';
    // 剧情技能已并入上方「技能」折叠（renderStorySkills）。
    return `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-checks"${advancedOpen('stats-checks')}><summary>检定记录（最近 ${n((model.checks || []).length)} 次）</summary>${checks}</details>`;
}

// 高级「存档与记录」：变动记录与旧版备份。
export function renderStatsArchive(model, advancedOpen = () => '', { logByRole = false } = {}) {
    if (!model) return NO_ARCHIVE;
    const n = roundText;
    const head = (r, withTarget) => `#${n(r.messageId)} ${withTarget ? `${esc(r.target)} ` : ''}${esc(r.key)} ${n(r.from)}→${n(r.to)}${r.note ? `（${esc(r.note)}）` : ''}`;
    // 带明细的记录可展开：完整公式、被截原因、同楼丢弃的那条、参与的特质。
    const logLine = (r, withTarget) => {
        const rows = Array.isArray(r.calc) ? r.calc : [];
        const extra = [];
        if (r.capped && CHANGE_CAP_TEXT[r.capped]) extra.push(`被截住：${CHANGE_CAP_TEXT[r.capped]}`);
        if (r.dropped) extra.push(`同楼丢弃：${esc(r.dropped)}`);
        if (Array.isArray(r.traitTags) && r.traitTags.length) extra.push(`特质：${r.traitTags.map(esc).join('、')}`);
        if (!rows.length && !extra.length) return `<div class="igs-source-filter-note">${head(r, withTarget)}</div>`;
        const lines = [...rows.map((c) => `${esc(c.label)}：${esc(c.value)}`), ...extra];
        return `<details class="igs-log-calc"><summary class="igs-source-filter-note">${head(r, withTarget)}</summary>${lines.map((t) => `<div class="igs-source-filter-note">${t}</div>`).join('')}</details>`;
    };
    const groups = model.logGroups || [];
    const logView = segmentedInput('', logByRole ? 'role' : 'time', [['time', '按时间'], ['role', '按角色']], '变动记录排列', { action: 'stats-log-view' });
    let log;
    if (!model.log.length) log = '<div class="igs-source-filter-note">暂无变动。</div>';
    else if (logByRole) {
        log = groups.map((g) => {
            const key = `stats-log-role-${g.name}`;
            return `<details class="igs-settings-sub igs-settings-advanced" data-advanced="${esc(key)}"${advancedOpen(key)}><summary>${esc(g.name)}（${n(g.total)} 条）</summary>${g.log.map((r) => logLine(r, false)).join('')}</details>`;
        }).join('');
    } else log = model.log.map((r) => logLine(r, true)).join('');
    if (model.log.length) log = `<div class="igs-settings-row">${logView}</div>${log}`;
    const backup = model.hasBackup ? '<div class="igs-settings-row"><button class="igs-settings-action" data-action="stats-op:backup" type="button">删除旧版备份</button></div>' : '';
    return `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-log"${advancedOpen('stats-log')}><summary>变动记录（最近 ${n(model.log.length)} / 共 ${n(model.total)} 条）</summary>${log}</details>`
        + backup;
}

// 状态栏日期、时间正则：留空按现行规则；正则非法时输入框旁给出一行提示，结算时当作未填写。
function captureRegexField(path, label, value, placeholder, note) {
    const invalid = compileCaptureRegex(value).invalid;
    const hint = invalid ? '<em>正则无法解析，已按未填写处理。</em>' : '';
    return `<label class="igs-settings-field"><span>${esc(label)}</span>${textInput(path, value, placeholder)}${note ? `<em>${esc(note)}</em>` : ''}${hint}</label>`;
}

// 特质图鉴页：图鉴存储与当前聊天各角色的特质由运行时随存档模型给出（traitCodex、traitList），没有时按空图鉴显示。
export function renderStatsCodex(model, advancedOpen = () => '') {
    const list = (model && model.traitList) || {};
    const characters = Object.entries(list).map(([charName, own]) => ({ charName, traits: (own.items || []).map((t) => t.id) }));
    return renderTraitCodex(model && model.traitCodex, { characters, nsfwOn: Boolean(model && model.traitNsfw), advancedOpen });
}

// 「世界观」：自动由辅助模型读世界书判定；手动多选覆盖（再点已选项取消，全部取消回到自动）。
function renderWorldsField(model) {
    const manual = (model && Array.isArray(model.worldsManual)) ? model.worldsManual : [];
    const auto = (model && Array.isArray(model.worlds)) ? model.worlds : [];
    const mode = manual.length ? 'manual' : 'auto';
    const act = (list) => 'stats-op:set-worlds:' + list.map(encodeURIComponent).join(',');
    const manualList = manual.length ? manual : auto.length ? auto : [WORLD_GENRES[0]];
    const modeBar = segmentedInput('', mode, [['auto', '自动'], ['manual', '手动']], '世界观', { action: 'stats-op:set-worlds' }).replace('set-worlds:auto', 'set-worlds:').replace('set-worlds:manual', 'set-worlds:' + manualList.map(encodeURIComponent).join(','));
    const picks = mode === 'manual'
        ? '<div class="igs-world-pick">' + WORLD_GENRES.map((w) => {
            const on = manual.includes(w);
            const next = on ? manual.filter((x) => x !== w) : [...manual, w];
            return '<button type="button" class="igs-settings-action is-small' + (on ? ' is-on' : '') + '" data-action="' + esc(act(next)) + '" aria-pressed="' + on + '">' + esc(w) + '</button>';
        }).join('') + '</div>'
        : '<div class="igs-edit-empty">' + (auto.length ? '当前判定：' + esc(auto.join('、')) : '尚未判定，将在剧情评定时读取世界书。') + '</div>';
    return '<div class="igs-settings-field"><span>世界观</span>' + modeBar + picks + '<small>决定候选特质与状态按哪些题材过滤；手动选择优先于自动判定。</small></div>';
}

// 数值页的模板变量（settings-tabs.js 的 STATS_TEMPLATE）。版面自上而下：我的角色、玩法、其他角色、高级。
// chat：statsChat() 的结果（可为 null）；archive：statsArchiveModel 的结果；mappings：推送映射的描述（可为 null）。
export function buildStatsPageValues({ stats, chat = null, combatOn = false, archive = null, archiveError = '', mappings = null, advancedOpen = () => '', worldview = 'modern', noteDrafts = null } = {}) {
    const statsOn = Boolean(stats.enabled || combatOn);
    const chatReady = Boolean(statsOn && chat && chat.hasChat && !chat.blocked);
    const started = Boolean(chatReady && chat.enabled);
    const mode = (chatReady && (chat.buildMode || chat.pendingMode)) || null;
    const manual = chatReady && !started && mode === 'manual';
    const chatNote = !chat || !chat.hasChat ? '打开一个聊天后可以在这里开始。'
        : chat.blocked ? `本聊天的数值存档无法读取（${chat.blocked}），已停止写入，原存档保留。`
            : chat.enabled && archiveError ? `本聊天的数值存档读取出错，存档未被改动。错误信息：${archiveError}`
            : chat.enabled ? '本聊天已开始。暂停后数值冻结、不结算，存档保留。' : '本聊天尚未开始，可直接快速开始，或自己建卡。';
    const buildOpen = (key) => (key === 'stats-build' && manual ? ' open' : advancedOpen(key));
    const build = (open) => renderStatsBuildFields(stats.build, open, { worldview, mode, ruleset: stats.ruleset });
    return {
        statsToggle: checkbox('bridge.stats.enabled', statsOn, '启用数值系统'),
        statsCombatNoteHidden: hiddenAttr(!combatOn),
        statsHidden: hiddenAttr(!statsOn),
        statsOffNoteHidden: hiddenAttr(statsOn),
        statsChatNote: esc(chatNote),
        statsStartHidden: hiddenAttr(!chatReady || started),
        statsMainBuildHidden: hiddenAttr(!manual),
        statsMainBuildFields: manual ? build(buildOpen) : '',
        statsHeroHidden: hiddenAttr(!started),
        get statsHeroCard() { return renderStatsHeroCard(archive, advancedOpen, stats.build); },
        get statsHeroActions() { return renderStatsHeroActions(archive); },
        get statsHeroMore() { return renderStatsHeroMore(archive, advancedOpen, stats.build); },
        get statsHeroTail() { return renderStatsHeroTail(archive, advancedOpen); },
        get statsPeopleFields() { return renderStatsPeople(archive, advancedOpen, { noteDrafts }); },
        get statsCodexFields() { return renderStatsCodex(archive, advancedOpen); },
        diceFeelField: renderStatsRulesetField(stats.ruleset),
        storyCheckField: field('bridge.stats.storyCheck', '剧情中的检定', segmentedInput('bridge.stats.storyCheck', stats.storyCheck, [['preroll', '自动'], ['manual', '手动掷骰'], ['off', '关闭']], '剧情中的检定')),
        optionChanceField: checkbox('bridge.stats.optionChance', stats.optionChance, '选项旁显示成功率'),
        checkFxField: checkbox('bridge.stats.checkFx', stats.checkFx, '显示掷骰卡'),
        intimacyField: checkbox('bridge.stats.intimacyGate', stats.intimacyGate, '好感不够时角色会拒绝'),
        heroNotePromptField: checkbox('bridge.stats.heroNotePrompt', stats.heroNotePrompt, '「我对TA」注入提示词'),
        npcBarsField: checkbox('bridge.stats.npcBars', stats.npcBars, '显示角色的体力与压力'),
        // 两级开关：先开「状态栏显示声望」（汇总一行），才出现「显示细项」（每条、每一对各自成条）。
        hudFameField: checkbox('bridge.stats.hudFame', stats.hudFame, '状态栏显示声望')
            + (stats.hudFame ? checkbox('bridge.stats.hudFameDetail', stats.hudFameDetail, '显示细项') : ''),
        healModeField: field('bridge.stats.healMode', '回血方式', segmentedInput('bridge.stats.healMode', stats.healMode, [['day', '按天'], ['floor', '按楼']], '回血方式'), '按天：每天恢复一定比例的伤势；按楼：每个新楼层恢复一定比例。')
            + (stats.healMode === 'floor'
                ? field('bridge.stats.healFloor', '每楼恢复', segmentedInput('bridge.stats.healFloor', stats.healFloor, [[1, '1%'], [3, '3%'], [5, '5%']], '每楼恢复比例'))
                : field('bridge.stats.healDay', '每天恢复', segmentedInput('bridge.stats.healDay', stats.healDay, [[5, '5%'], [10, '10%'], [15, '15%']], '每天恢复比例'))),
        worldviewField: renderWorldsField(archive),
        intimateCostField: field('bridge.stats.intimateCost', '亲密消耗体力', segmentedInput('bridge.stats.intimateCost', stats.intimateCost, [['off', '不消耗'], ['light', '轻'], ['standard', '标准'], ['heavy', '重']], '亲密消耗体力'), '亲密行为同时消耗主角与角色的体力，档位越高消耗越大；仅在开启成人内容时生效。'),
        favorModeField: field('bridge.stats.favorMode', '好感成长', segmentedInput('bridge.stats.favorMode', stats.favorMode, [['vivid', '鲜明'], ['normal', '普通'], ['hard', '困难']], '好感成长'), '鲜明：变化明显，小事攒成心意；普通：稳步增长；困难：慢热难攻略。'),
        barsFields: checkbox('bridge.stats.bars.stamina', stats.bars.stamina, '体力')
            + checkbox('bridge.stats.bars.money', stats.bars.money, '金钱')
            + checkbox('bridge.stats.bars.stress', stats.bars.stress, '压力'),
        traitReviewField: field('bridge.stats.traitReviewN', '特质评定间隔', segmentedInput('bridge.stats.traitReviewN', stats.traitReviewN, [[0, '关闭'], [10, '10楼'], [20, '20楼'], [30, '30楼'], [50, '50楼']], '特质评定间隔'), '每隔这么多楼按最近出场的角色评定一次特质；重伤、背叛、恋情结束等大事件随时评定。'),
        sheetGenField: field('bridge.stats.sheetGen', '新角色出场时', segmentedInput('bridge.stats.sheetGen', stats.sheetGen, [['auto', '自动生成'], ['prompt', '提醒'], ['off', '不生成']], '新角色出场时')),
        statsMoreOpen: advancedOpen('stats-more'),
        dateRegexField: captureRegexField('bridge.stats.dateRegex', '日期标签', stats.dateRegex, 'date', '填写后按日期变化过天。'),
        timeRegexField: captureRegexField('bridge.stats.timeRegex', '时间标签', stats.timeRegex, 'time', '用于判断夜转晨与熬夜。'),
        pushField: checkbox('bridge.stats.push.enabled', stats.push.enabled, '同步到数据库表格（需要数据库插件）'),
        get statsMappingFields() { return renderStatsMappingFields(stats.push.enabled ? mappings : null, advancedOpen, { pushEnabled: stats.push.enabled }); },
        get statsPromptFields() { return renderStatsPromptFields(stats, advancedOpen); },
        get statsArchiveFields() { return renderStatsArchive(archive, advancedOpen, { logByRole: advancedOpen('stats-log-by-role') !== '' }); },
        newChatField: field('bridge.stats.newChat', '新聊天', segmentedInput('bridge.stats.newChat', stats.newChat, [['ask', '询问'], ['auto', '自动开始'], ['off', '不启用']], '新聊天')),
        hudLabelField: field('bridge.stats.hudLabel', '好感条右侧显示', segmentedInput('bridge.stats.hudLabel', stats.hudLabel, [['stage', '阶段名'], ['number', '数字'], ['both', '两者']], '好感条右侧显示')),
        registerField: field('bridge.stats.register', '重要角色登记', segmentedInput('bridge.stats.register', stats.register, [['auto', '自动'], ['manual', '仅手动']], '重要角色登记')),
        backfillField: field('bridge.stats.backfill', '新技能补全方式', segmentedInput('bridge.stats.backfill', stats.backfill, [['auto', '每楼自动'], ['manual', '手动'], ['off', '关闭']], '新技能补全方式')),
        autoSkillField: checkbox('bridge.stats.autoSkill', stats.autoSkill, '按玩家输入匹配检定技能'),
        statsBuildAdvancedHidden: hiddenAttr(!chatReady || started),
        statsBuildModeField: chatReady && !started ? renderStatsBuildModeField(mode) : '',
        statsBuildFields: manual ? '' : build(advancedOpen),
    };
}
