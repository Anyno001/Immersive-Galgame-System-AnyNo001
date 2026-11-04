// 数值系统提示词编辑（§9）：每段一个可编辑模板，可单独关闭，可恢复默认；阶段文案同样可改。
// 留空表示使用默认值（默认值作为占位提示显示），整块默认折叠在高级分区里。
import { DEFAULT_STAGE_TEXT, DEFAULT_STAT_PROMPTS, STAT_PROMPT_SEGMENTS } from '../../scene/stats/stat-prompt.js';
import { BUILD_ABILITY_OPTIONS, BUILD_CUSTOM_MAX, BUILD_PREF_FIELDS, BUILD_PREF_LABELS, BUILD_ROLE_OPTIONS, BUILD_SPECIAL_COUNT, buildSummary, manualBuildSummary, normalizeBuild, specialCandidates } from '../../scene/stats/stat-build.js';
import { ABILITY_KEYS, ABILITY_LABELS, MANUAL_BUILD } from '../../combat/abilities.js';
import { rulesetOptions } from '../../scene/stats/rulesets/index.js';
import { checkbox, field, hiddenAttr, numberInput, segmentedInput, selectInput, textInput, textareaInput } from './settings-fields.js';
import { esc } from './reader-value-utils.js';

// 提示词分组：每段可单独开关。「roll」是 CoC 沿用的旧段名，「dice」是 v0.39 的新段名，两者哪个存在就显示哪个。
export const STAT_PROMPT_LABELS = Object.freeze({
    source: '数值来源声明',
    protagonist: '主角状态',
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
    sheetGen: '角色卡生成（后台请求）',
    backfill: '新技能补全（后台请求）',
    heroSkills: '主角技能分配（后台请求）',
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
const MAPPING_TARGETS = Object.freeze({ stamina: '体力', money: '金钱', stress: '压力', base: '基础属性', special: '特有属性' });

// 骰子手感：面向只懂 RPG 的玩家，底层仍是 bridge.stats.ruleset（coc7 百分骰 / dnd5e 二十面骰），选项来自规则集登记表。
const DICE_FEEL = Object.freeze({ coc7: '百分骰（结果更看运气）', dnd5e: '二十面骰（属性越高越稳）' });

export function renderStatsRulesetField(ruleset) {
    const rank = (id) => { const i = Object.keys(DICE_FEEL).indexOf(id); return i < 0 ? 99 : i; };
    const items = rulesetOptions().sort(([x], [y]) => rank(x) - rank(y)).map(([id, label]) => [id, DICE_FEEL[id] || label]);
    return field('bridge.stats.ruleset', '骰子手感', segmentedInput('bridge.stats.ruleset', ruleset, items, '骰子手感'));
}

// 建卡区提示文案与可用状态：渲染和输入时就地刷新共用同一份计算。mode 为 'manual' 时按手动六维算。
export function statsBuildStatus(build, worldview, mode = null) {
    const s = mode === 'manual' ? manualBuildSummary(build, { worldview }) : buildSummary(build, { worldview });
    let pointNote;
    if (mode === 'manual') {
        const problem = s.errors.includes('stats-build-over-total') ? `总分超过 ${s.max}` : s.errors.includes('stats-build-score-range') ? `单项须在 ${MANUAL_BUILD.min}–${MANUAL_BUILD.max}` : '';
        const prefs = s.prefs ? ` · 主擅长 ${ABILITY_LABELS[s.prefs.major]} · 次擅长 ${ABILITY_LABELS[s.prefs.minor]} · 短板 ${ABILITY_LABELS[s.prefs.weak]}` : '';
        pointNote = `剩余 ${Math.max(0, s.left)} 点 · 总分 ${s.total}/${s.max}${problem ? ` · ${problem}` : prefs}`;
    } else {
        pointNote = s.errors.includes('stats-build-prefs-duplicate') ? '主擅长、次擅长、短板须是三项不同的属性。' : '主擅长 15、次擅长 14、短板 8，其余三项 13 / 12 / 10。';
    }
    const specialNote = s.picked.length > BUILD_SPECIAL_COUNT
        ? `特有技能最多选 ${BUILD_SPECIAL_COUNT} 项（已选 ${s.picked.length} 项）。`
        : `特有技能已选 ${s.picked.length}/${BUILD_SPECIAL_COUNT}，每项 50 起步。`;
    return { ok: s.ok, pointNote, specialNote };
}

// 数字框输入只写草稿、不整页重绘（保焦点）；剩余点数、技能提示与「按分配启用」在这里就地更新。
export function refreshStatsBuildStatus(root, build, worldview) {
    if (!root || typeof root.querySelector !== 'function') return false;
    const holder = root.querySelector('[data-advanced="stats-build"]');
    const attr = (name) => (holder && typeof holder.getAttribute === 'function' ? holder.getAttribute(name) || undefined : undefined);
    const st = statsBuildStatus(build, worldview === undefined ? attr('data-stats-worldview') : worldview, attr('data-stats-mode') || null);
    const point = root.querySelector('[data-result="stats-build"]');
    if (point) point.textContent = st.pointNote;
    const special = root.querySelector('[data-result="stats-build-special"]');
    if (special) special.textContent = st.specialNote;
    const button = root.querySelector('[data-action="stats-chat-enable-build"]');
    if (button) button.disabled = !st.ok;
    return true;
}

// 建档方式三选一（自动生成 / 手动建档 / 相对数值）：只切界面状态，由 data-action="stats-build-mode:<值>" 处理。
export const STATS_BUILD_MODE_ITEMS = Object.freeze([['auto', '自动生成'], ['manual', '手动建档'], ['relative', '相对数值']]);

export function renderStatsBuildModeField(mode) {
    return field('', '建档方式', segmentedInput('', mode || 'auto', STATS_BUILD_MODE_ITEMS, '建档方式', { action: 'stats-build-mode' }));
}

// 建卡（§6、§10A）：默认折叠。自动/相对数值选六维倾向；手动建档填职业与六维加点（总分 72 以内）。
// 超分或多选时「按分配启用」禁用并说明原因。
export function renderStatsBuildFields(build, advancedOpen = () => '', { worldview, mode = null } = {}) {
    const b = normalizeBuild(build);
    const manual = mode === 'manual';
    const st = statsBuildStatus(b, worldview, manual ? 'manual' : null);
    const base = manual
        ? field('bridge.stats.build.className', '职业名', textInput('bridge.stats.build.className', b.className, ''))
            + field('bridge.stats.build.role', '定位', selectInput('bridge.stats.build.role', b.role, BUILD_ROLE_OPTIONS))
            + ABILITY_KEYS.map((key) => field(`bridge.stats.build.scores.${key}`, ABILITY_LABELS[key], numberInput(`bridge.stats.build.scores.${key}`, b.scores[key], MANUAL_BUILD.min, MANUAL_BUILD.max, false, 1))).join('')
        : BUILD_PREF_FIELDS.map((key) => field(`bridge.stats.build.prefs.${key}`, BUILD_PREF_LABELS[key], selectInput(`bridge.stats.build.prefs.${key}`, b.prefs[key], BUILD_ABILITY_OPTIONS))).join('');
    // 技能选择沿用原有开关样式：默认 8 项、世界观附加与自定义技能同一种开关，不加附注、不加容器。
    const special = specialCandidates(b, { worldview }).map((name) => checkbox(`bridge.stats.build.special.${name}`, b.special[name], name)).join('');
    // 自定义技能已在上方开关列表里，下方这一行只放增删按钮，不重复列名字。
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
        + `<div class="igs-source-filter-note" data-result="stats-build-special">${esc(st.specialNote)}</div>`
        + `<div class="igs-settings-section">${special}</div>`
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
export function renderStatsHeroCard(model, advancedOpen = () => '') {
    if (!model) return '<div class="igs-source-filter-note">本聊天还没有数值存档。启用后从当前楼开始记录。</div>';
    const n = (v) => esc(String(Math.round(Number(v) || 0)));
    const bars = model.bars || {};
    // 生命来自战斗 vitals（当前/最大）；没有数据时不显示这一项，避免出现「未知」或 0。
    const life = model.vitals ? `生命 ${n(model.vitals.down ? 0 : model.vitals.hp)}/${n(model.vitals.maxHp)} · ` : '';
    const head = `<div class="igs-source-filter-note">${model.day != null ? `第 ${n(model.day)} 天 · ` : ''}${life}体力 ${n(bars.stamina)} · 压力 ${n(bars.stress)} · 金钱 ${n(model.wallet ?? bars.money)}</div>`;
    const attrs = (model.attributes || []).length ? `<div class="igs-source-filter-note">${model.attributes.map((a) => `${esc(a.name)} ${esc(a.display)}`).join(' · ')}</div>` : '';
    const skills = model.skills.map((s) => `${esc(s.name)} ${esc(s.display ?? String(Math.round(s.value)))}${s.marked ? '✓' : ''}`).join(' · ');
    return head + attrs
        + `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-skills"${advancedOpen('stats-skills')}><summary>技能（✓ 表示今天有成长机会）</summary><div class="igs-source-filter-note">${skills || '无'}</div></details>`
        + renderHeroSkillEditor(model, advancedOpen);
}

// CoC 主角技能表：已掌握的直接列出，未学的按所属属性折叠。改动写入聊天存档，不进设置草稿（data-stats-hero-skill）。
// 值为生效值（账本、分配底数、手改合并后）；改过的标「已手改」，清空输入框即清除手改。
function renderHeroSkillEditor(model, advancedOpen) {
    const rows = Array.isArray(model.heroSkills) ? model.heroSkills : [];
    if (!rows.length) return '';
    const row = (s) => field('', `${s.name}${s.edited ? '（已手改）' : ''}`, `<input data-stats-hero-skill="${esc(s.name)}" type="number" min="1" max="99" step="1" value="${esc(s.value)}">`);
    const byAttribute = new Map();
    for (const s of rows.filter((r) => !(r.learned && r.value >= 25))) {
        const key = s.attribute || '其他';
        byAttribute.set(key, [...(byAttribute.get(key) || []), s]);
    }
    const idle = [...byAttribute.entries()].map(([attribute, list]) => `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-hero-skills-${esc(attribute)}"${advancedOpen(`stats-hero-skills-${attribute}`)}><summary>${esc(attribute)}类未学（${list.length}项）</summary>${list.map(row).join('')}</details>`).join('');
    const known = rows.filter((r) => r.learned && r.value >= 25).sort((a, b) => b.value - a.value).map(row).join('');
    return '<div class="igs-settings-row"><button class="igs-settings-action" data-action="stats-op:hero-assign" type="button">按人设分配技能</button></div>'
        + (known ? `<div class="igs-settings-section">${known}</div>` : '<div class="igs-source-filter-note">暂无入门以上的技能。</div>')
        + idle;
}

export function renderStatsArchive(model, advancedOpen = () => '') {
    if (!model) return '<div class="igs-source-filter-note">本聊天还没有数值存档。启用后从当前楼开始记录。</div>';
    const n = (v) => esc(String(Math.round(Number(v) || 0)));
    const people = model.characters.length
        ? model.characters.map((c) => {
            const dims = Object.entries(c.dims).map(([k, v]) => `${esc(k)} ${n(v)}`).join(' · ');
            return `<div class="igs-source-filter-note"><b>${esc(c.name)}</b>　${esc(c.stage)}　${dims}</div>`;
        }).join('')
        : '<div class="igs-source-filter-note">还没有登记的角色。</div>';
    const log = model.log.length
        ? model.log.map((r) => `<div class="igs-source-filter-note">#${n(r.messageId)} ${esc(r.target)} ${esc(r.key)} ${n(r.from)}→${n(r.to)}${r.note ? `（${esc(r.note)}）` : ''}</div>`).join('')
        : '<div class="igs-source-filter-note">暂无变动。</div>';
    const checks = (model.checks || []).length
        ? model.checks.map((c) => `<div class="igs-source-filter-note">#${n(c.messageId)} ${esc(c.skill)}${c.difficulty !== '普通' ? `（${esc(c.difficulty)}）` : ''} ${esc(c.detail)} → ${esc(c.outcome)}${c.ruleset === 'dnd5e' ? ' · D&D' : ''}</div>`).join('')
        : '<div class="igs-source-filter-note">暂无检定。</div>';
    const story = (model.story || []).length
        ? model.story.map((s) => `<div class="igs-settings-field"><span>${esc(s.name)}（${esc(s.attribute)}${s.guessed ? '，猜测' : ''}）</span><div class="igs-mood-word-list">`
            + `<button class="igs-settings-action" data-action="stats-op:skill-attr:${esc(encodeURIComponent(s.name))}" type="button">改属性</button>`
            + `<button class="igs-settings-action" data-action="stats-op:skill-rename:${esc(encodeURIComponent(s.name))}" type="button">改名</button>`
            + `<button class="igs-settings-action" data-action="stats-op:skill-merge:${esc(encodeURIComponent(s.name))}" type="button">合并</button>`
            + `<button class="igs-settings-action" data-action="stats-op:skill-remove:${esc(encodeURIComponent(s.name))}" type="button">删除</button></div></div>`).join('')
        : '<div class="igs-source-filter-note">剧情里还没有出现新技能。</div>';
    const sheets = (model.sheets || []).length
        ? model.sheets.map((s) => {
            const attrs = s.attributes.map((a) => `${esc(a.name)} ${esc(a.display)}`).join(' · ');
            const own = s.skills.map((k) => `${esc(k.name)} ${esc(k.display)}${k.provisional ? '（待定）' : ''}`).join(' · ');
            const id = esc(encodeURIComponent(s.name));
            return `<div class="igs-source-filter-note"><b>${esc(s.name)}</b>　${esc(s.rank)}${s.source === 'user' ? '　已手改' : ''}</div>`
                + `<div class="igs-source-filter-note">${attrs}${own ? `<br>${own}` : ''}</div>`
                + `<div class="igs-settings-row"><button class="igs-settings-action" data-action="stats-op:sheet-edit:${id}" type="button">编辑</button>`
                + `<button class="igs-settings-action" data-action="stats-op:sheet-regen:${id}" type="button">重新生成</button>`
                + `<button class="igs-settings-action" data-action="stats-op:sheet-remove:${id}" type="button">删除角色卡</button></div>`;
        }).join('')
        : '<div class="igs-source-filter-note">还没有生成角色卡。</div>';
    const pending = (model.pendingPeople || []).length ? `<div class="igs-source-filter-note">待生成：${model.pendingPeople.map(esc).join('、')}</div>` : '';
    const backup = model.hasBackup ? '<div class="igs-settings-row"><button class="igs-settings-action" data-action="stats-op:backup" type="button">删除旧版备份</button></div>' : '';
    return people
        + `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-sheets"${advancedOpen('stats-sheets')}><summary>角色卡（${n((model.sheets || []).length)} 张）</summary>${pending}${sheets}</details>`
        + `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-story-skills"${advancedOpen('stats-story-skills')}><summary>剧情技能（${n((model.story || []).length)} 项）</summary>${story}</details>`
        + `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-checks"${advancedOpen('stats-checks')}><summary>检定记录（最近 ${n((model.checks || []).length)} 次）</summary>${checks}</details>`
        + `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-log"${advancedOpen('stats-log')}><summary>变动记录（最近 ${n(model.log.length)} / 共 ${n(model.total)} 条）</summary>${log}</details>`
        + backup;
}

// 数值页的模板变量（settings-tabs.js 的 STATS_TEMPLATE）。版面自上而下：我的角色、玩法、其他角色、高级。
// chat：statsChat() 的结果（可为 null）；archive：statsArchiveModel 的结果；mappings：推送映射的描述（可为 null）。
export function buildStatsPageValues({ stats, chat = null, combatOn = false, archive = null, mappings = null, advancedOpen = () => '', worldview = 'modern' } = {}) {
    const statsOn = Boolean(stats.enabled || combatOn);
    const chatReady = Boolean(statsOn && chat && chat.hasChat && !chat.blocked);
    const started = Boolean(chatReady && chat.enabled);
    const mode = (chatReady && (chat.buildMode || chat.pendingMode)) || null;
    const manual = chatReady && !started && mode === 'manual';
    const chatNote = !chat || !chat.hasChat ? '打开一个聊天后可以在这里开始。'
        : chat.blocked ? `本聊天的数值存档无法读取（${chat.blocked}），已停止写入，原存档保留。`
            : chat.enabled ? '本聊天已开始。暂停后数值冻结、不结算，存档保留。' : '本聊天尚未开始，可直接快速开始，或自己建卡。';
    const buildOpen = (key) => (key === 'stats-build' && manual ? ' open' : advancedOpen(key));
    const build = (open) => renderStatsBuildFields(stats.build, open, { worldview, mode });
    return {
        statsToggle: checkbox('bridge.stats.enabled', statsOn, '启用数值系统'),
        statsCombatNoteHidden: hiddenAttr(!combatOn),
        statsHidden: hiddenAttr(!statsOn),
        statsChatNote: esc(chatNote),
        statsStartHidden: hiddenAttr(!chatReady || started),
        statsMainBuildHidden: hiddenAttr(!manual),
        statsMainBuildFields: manual ? build(buildOpen) : '',
        statsHeroHidden: hiddenAttr(!started),
        statsHeroCard: renderStatsHeroCard(archive, advancedOpen),
        diceFeelField: renderStatsRulesetField(stats.ruleset),
        storyCheckField: field('bridge.stats.storyCheck', '剧情中的检定', selectInput('bridge.stats.storyCheck', stats.storyCheck, [['preroll', '自动'], ['manual', '关键时刻手动掷骰'], ['off', '关闭']])),
        optionChanceField: checkbox('bridge.stats.optionChance', stats.optionChance, '选项旁显示成功率'),
        checkFxField: checkbox('bridge.stats.checkFx', stats.checkFx, '显示掷骰卡'),
        intimacyField: checkbox('bridge.stats.intimacyGate', stats.intimacyGate, '好感不够时角色会拒绝'),
        favorModeField: field('bridge.stats.favorMode', '好感成长', segmentedInput('bridge.stats.favorMode', stats.favorMode, [['normal', '普通'], ['hard', '困难']], '好感成长'), '普通：单楼上限3、每日上限8；困难：单楼上限1、每日上限4。'),
        barsFields: checkbox('bridge.stats.bars.stamina', stats.bars.stamina, '体力')
            + checkbox('bridge.stats.bars.money', stats.bars.money, '金钱')
            + checkbox('bridge.stats.bars.stress', stats.bars.stress, '压力'),
        sheetGenField: field('bridge.stats.sheetGen', '新角色出场时', selectInput('bridge.stats.sheetGen', stats.sheetGen, [['auto', '自动生成数值'], ['prompt', '提醒'], ['off', '不生成']])),
        statsMoreOpen: advancedOpen('stats-more'),
        pushField: checkbox('bridge.stats.push.enabled', stats.push.enabled, '同步到数据库表格（需要数据库插件）'),
        statsMappingFields: renderStatsMappingFields(stats.push.enabled ? mappings : null, advancedOpen, { pushEnabled: stats.push.enabled }),
        statsPromptFields: renderStatsPromptFields(stats, advancedOpen),
        statsArchiveFields: renderStatsArchive(archive, advancedOpen),
        newChatField: field('bridge.stats.newChat', '新聊天', selectInput('bridge.stats.newChat', stats.newChat, [['ask', '询问'], ['auto', '自动快速开始'], ['off', '不启用']])),
        hudLabelField: field('bridge.stats.hudLabel', '好感条右侧显示', selectInput('bridge.stats.hudLabel', stats.hudLabel, [['stage', '阶段名'], ['number', '数字'], ['both', '两者']])),
        registerField: field('bridge.stats.register', '重要角色登记', selectInput('bridge.stats.register', stats.register, [['auto', '自动'], ['manual', '仅手动']])),
        backfillField: field('bridge.stats.backfill', '新技能补全方式', selectInput('bridge.stats.backfill', stats.backfill, [['auto', '每楼结束后自动'], ['manual', '手动'], ['off', '关闭']])),
        autoSkillField: checkbox('bridge.stats.autoSkill', stats.autoSkill, '按玩家输入匹配检定技能'),
        statsBuildAdvancedHidden: hiddenAttr(!chatReady || started),
        statsBuildModeField: chatReady && !started ? renderStatsBuildModeField(mode) : '',
        statsBuildFields: manual ? '' : build(advancedOpen),
    };
}
