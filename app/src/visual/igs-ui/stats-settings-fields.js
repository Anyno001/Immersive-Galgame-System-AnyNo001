// 数值系统提示词编辑（§9）：每段一个可编辑模板，可单独关闭，可恢复默认；阶段文案同样可改。
// 留空表示使用默认值（默认值作为占位提示显示），整块默认折叠在高级分区里。
import { DEFAULT_STAGE_TEXT, DEFAULT_STAT_PROMPTS, STAT_PROMPT_SEGMENTS } from '../../scene/stats/stat-prompt.js';
import { BUILD_MAX, BUILD_MIN, BUILD_SPECIAL_COUNT, buildSummary, normalizeBuild } from '../../scene/stats/stat-build.js';
import { BASE_ATTRIBUTES, DEFAULT_SPECIAL_SKILLS } from '../../scene/stats/stat-state.js';
import { checkbox, field, numberInput, selectInput, textareaInput } from './settings-fields.js';
import { esc } from './reader-value-utils.js';

export const STAT_PROMPT_LABELS = Object.freeze({
    source: '数值来源声明',
    protagonist: '主角状态',
    present: '在场角色',
    check: '本轮检定',
    tags: '标签说明',
    mandates: '强制事项',
});

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
            + `<div class="igs-settings-full">${textareaInput(`bridge.stats.prompts.${id}`, custom, DEFAULT_STAT_PROMPTS[id])}</div>`
            + `<div class="igs-settings-row"><button class="igs-settings-action" data-action="stats-prompt-reset:${esc(id)}" type="button"${custom ? '' : ' disabled'}>恢复默认</button></div>`
            + '</div>';
    }).join('');
    const stages = Object.keys(DEFAULT_STAGE_TEXT).map((name) => field(
        `bridge.stats.stageText.${name}`,
        name,
        textareaInput(`bridge.stats.stageText.${name}`, textOf(stageText, name), DEFAULT_STAGE_TEXT[name]),
    )).join('');
    return `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-prompts"${advancedOpen('stats-prompts')}>`
        + '<summary>高级：注入给 AI 的提示词</summary>'
        + '<div class="igs-source-filter-note">留空即使用默认内容。模板里的 {{变量}} 写错时会原样保留，不会中断。</div>'
        + rows
        + `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-stage-text"${advancedOpen('stats-stage-text')}><summary>关系阶段文案</summary><div class="igs-source-filter-grid">${stages}</div></details>`
        + '</details>';
}

// 存档区（§10）：当前数值一目了然；技能与变动记录折叠，低频信息不平铺。model 为 statsArchiveModel 的结果。
const MAPPING_TARGETS = Object.freeze({ health: '生命', stamina: '体力', money: '金钱', stress: '压力', base: '基础属性', special: '特有属性' });

// 建卡分配（§6、§10A）：默认折叠；超点或多选时「按分配启用」禁用并说明原因。
export function renderStatsBuildFields(build, advancedOpen = () => '') {
    const b = normalizeBuild(build);
    const s = buildSummary(b);
    const base = BASE_ATTRIBUTES.map((name) => field(`bridge.stats.build.base.${name}`, name, numberInput(`bridge.stats.build.base.${name}`, b.base[name], BUILD_MIN, BUILD_MAX))).join('');
    const special = DEFAULT_SPECIAL_SKILLS.map((name) => checkbox(`bridge.stats.build.special.${name}`, b.special[name], name)).join('');
    const pointNote = s.left < 0 ? `超出 ${-s.left} 点，请调低几项。` : `剩余 ${s.left} 点（每项 ${BUILD_MIN}–${BUILD_MAX}）`;
    const specialNote = s.picked.length > BUILD_SPECIAL_COUNT
        ? `特有技能最多选 ${BUILD_SPECIAL_COUNT} 项（已选 ${s.picked.length} 项）。`
        : `特有技能已选 ${s.picked.length}/${BUILD_SPECIAL_COUNT}，每项 50 起步。`;
    return `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-build"${advancedOpen('stats-build')}>`
        + '<summary>分配点数（基础属性各 40 起，另有 60 点）</summary>'
        + `<div class="igs-source-filter-note" data-result="stats-build">${esc(pointNote)}</div>`
        + `<div class="igs-source-filter-grid">${base}</div>`
        + `<div class="igs-source-filter-note">${esc(specialNote)}</div>`
        + `<div class="igs-settings-section">${special}</div>`
        + `<div class="igs-settings-row"><button class="igs-settings-action" data-action="stats-chat-enable-build" type="button"${s.ok ? '' : ' disabled'}>按分配启用</button></div>`
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

export function renderStatsArchive(model, advancedOpen = () => '') {
    if (!model) return '<div class="igs-source-filter-note">本聊天还没有数值存档。启用后从当前楼开始记录。</div>';
    const n = (v) => esc(String(Math.round(Number(v) || 0)));
    const bars = model.bars || {};
    const head = `<div class="igs-source-filter-note">${model.day != null ? `第 ${n(model.day)} 天 · ` : ''}生命 ${n(bars.health)} · 体力 ${n(bars.stamina)} · 压力 ${n(bars.stress)} · 金钱 ${n(bars.money)}</div>`;
    const people = model.characters.length
        ? model.characters.map((c) => {
            const dims = Object.entries(c.dims).map(([k, v]) => `${esc(k)} ${n(v)}`).join(' · ');
            return `<div class="igs-source-filter-note"><b>${esc(c.name)}</b>　${esc(c.stage)}　${dims}</div>`;
        }).join('')
        : '<div class="igs-source-filter-note">还没有登记的角色。</div>';
    const skills = model.skills.map((s) => `${esc(s.name)} ${n(s.value)}${s.marked ? '✓' : ''}`).join(' · ');
    const log = model.log.length
        ? model.log.map((r) => `<div class="igs-source-filter-note">#${n(r.messageId)} ${esc(r.target)} ${esc(r.key)} ${n(r.from)}→${n(r.to)}${r.note ? `（${esc(r.note)}）` : ''}</div>`).join('')
        : '<div class="igs-source-filter-note">暂无变动。</div>';
    return head + people
        + `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-skills"${advancedOpen('stats-skills')}><summary>主角技能（✓ 表示今天有成长机会）</summary><div class="igs-source-filter-note">${skills || '无'}</div></details>`
        + `<details class="igs-settings-sub igs-settings-advanced" data-advanced="stats-log"${advancedOpen('stats-log')}><summary>变动记录（最近 ${n(model.log.length)} / 共 ${n(model.total)} 条）</summary>${log}</details>`;
}
