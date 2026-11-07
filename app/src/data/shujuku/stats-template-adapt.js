// IGS 数值系统适配版 shujuku 模板（docs/STATS_TABLE_REFINE_PLAN.md）：以基准恋爱 gal 模板为底，
// 角色数值表、才艺技能表改成「由 IGS 程序维护」的记录表（不进填表请求），AI 填的表只描述本表自己的内容。
// 其余表、列、DDL、导出配置原样保留。纯函数，不改入参。
// 每条修改都带锚点：基准模板改版导致锚点对不上时抛错，不生成改了一半的模板。
import { buildIgsSheet } from './combat-tables.js';
import { IGS_MANAGED_MARK } from './igs-managed.js';

export const STATS_TEMPLATE_FILE = 'TavernDB_template_恋爱Gal_IGS数值系统适配版.json';
// 适配结果里一定带有的标记（两张 IGS 记录表的 note）；基准模板里出现它说明已被适配过。
export const STATS_TEMPLATE_MARK = IGS_MANAGED_MARK;

const VALUES = 'sheet_jue_se_shu_zhi_biao';
const SKILLS = 'sheet_cai_yi_ji_neng_biao';
const CHECKS = 'sheet_jian_ding_jian_yi_biao';
const MAIN = 'sheet_zhu_jue_xin_xi_biao';
const NPCS = 'sheet_zhong_yao_jue_se_biao';
const ITEMS = 'sheet_wu_pin_biao';

function templateError(code, extra = {}) {
    const error = new Error(code);
    error.code = code;
    Object.assign(error, extra);
    return error;
}

function countOf(text, find) {
    let n = 0;
    for (let i = text.indexOf(find); i >= 0; i = text.indexOf(find, i + find.length)) n += 1;
    return n;
}

function sheetOf(out, uid, field) {
    const sheet = out[uid];
    if (!sheet || !sheet.sourceData || (field && typeof sheet.sourceData[field] !== 'string')) throw templateError('stats-template-field-missing', { sheet: uid, field });
    return sheet;
}

function replaceOnce(text, find, replace, uid, field) {
    if (countOf(text, find) !== 1) throw templateError('stats-template-anchor-missing', { sheet: uid, field, count: countOf(text, find) });
    return text.replace(find, () => replace);
}

function dropLine(text, prefix, uid, field) {
    const lines = text.split('\n');
    const kept = lines.filter((line) => !line.startsWith(prefix));
    if (kept.length !== lines.length - 1) throw templateError('stats-template-anchor-missing', { sheet: uid, field });
    return kept.join('\n');
}

// 取 [from, to) 之间的文字换成 insert；to 为空表示换到末尾。
function spliceBetween(text, from, to, insert, uid, field) {
    const a = text.indexOf(from);
    const b = to === null ? text.length : text.indexOf(to);
    if (a < 0 || b < 0) throw templateError('stats-template-anchor-missing', { sheet: uid, field });
    return text.slice(0, a) + insert + text.slice(b);
}

function removeColumns(sheet, names) {
    const header = sheet.content[0];
    for (const name of names) {
        const at = header.indexOf(name);
        if (at < 0) throw templateError('stats-template-anchor-missing', { sheet: sheet.uid, field: 'content' });
        for (const row of sheet.content) if (Array.isArray(row)) row.splice(at, 1);
    }
}

function insertColumns(sheet, after, names) {
    const header = sheet.content[0];
    const at = after === null ? header.length - 1 : header.indexOf(after);
    if (at < 0) throw templateError('stats-template-anchor-missing', { sheet: sheet.uid, field: 'content' });
    for (const row of sheet.content) if (Array.isArray(row)) row.splice(at + 1, 0, ...names.map(() => ''));
    names.forEach((name, i) => { header[at + 1 + i] = name; });
}

// ---- IGS 记录表：角色数值表、才艺技能表（更新频率 0、不注入世界书，AI 不得填写） ----
const VALUES_COLUMNS = Object.freeze(['角色姓名', '好感度', '信任度', '了解程度', '芥蒂程度', '体力', '金钱', '压力']);
const SKILLS_COLUMNS = Object.freeze(['角色姓名', '技能', '数值']);
const VALUES_DDL = 'CREATE TABLE sheet_jue_se_shu_zhi_biao (\n  row_id INTEGER PRIMARY KEY,\n  character_name TEXT NOT NULL, -- 角色姓名\n'
    + '  favorability TEXT, -- 好感度\n  trust TEXT, -- 信任度\n  understanding_level TEXT, -- 了解程度\n  grudge_level TEXT, -- 芥蒂程度\n'
    + '  stamina TEXT, -- 体力\n  money TEXT, -- 金钱\n  stress TEXT -- 压力\n);';
const SKILLS_DDL = 'CREATE TABLE sheet_cai_yi_ji_neng_biao (\n  row_id INTEGER PRIMARY KEY,\n  character_name TEXT NOT NULL, -- 角色姓名\n  skill_name TEXT NOT NULL, -- 技能\n  skill_value TEXT -- 数值\n);';

function igsRecordSheet(name, columns, ddl, orderNo, uid) {
    const sheet = buildIgsSheet({ name, columns, note: name }, orderNo, uid);
    sheet.sourceData.ddl = ddl;
    return sheet;
}

// ---- AI 填的表：删去与 IGS 有关的说明，只描述本表自己 ----
function refineRoles(out) {
    const hero = sheetOf(out, MAIN, 'note');
    let s = hero.sourceData;
    let n = dropLine(dropLine(s.note, '- 基础属性：', MAIN, 'note'), '- 特有属性：', MAIN, 'note');
    n = `${n.replace(/\s+$/, '')}\n`;
    s.note = `${replaceOnce(n, '  √ 抑制剂快到时间了，后颈发热\n', '  √ 抑制剂快到时间了，后颈发热\n- 已知秘密：主角已经暴露给他人的秘密，如真实身份、过往经历、隐藏关系；不记录当前的行动、身体状态或情绪\n- 未知秘密：主角仍然隐藏、尚未被他人察觉的秘密；被他人知晓后移入已知秘密\n', MAIN, 'note').replace(/\s+$/, '')}\n`;
    s.updateNode = "字段变化时更新；秘密被他人察觉时，把对应内容从未知秘密移入已知秘密。\n\nSQL示例: UPDATE protagonist_info SET current_condition='左膝擦伤，有点烦躁' WHERE row_id=1;";
    s.ddl = replaceOnce(s.ddl, '  base_attributes TEXT NOT NULL, -- 基础属性\n  special_attributes TEXT, -- 特有属性\n', '', MAIN, 'ddl');
    s.ddl = replaceOnce(s.ddl, '  location_name TEXT, -- 所在地点\n  belongings TEXT -- 随身财物\n', '  location_name TEXT, -- 所在地点\n  known_secrets TEXT, -- 已知秘密\n  unknown_secrets TEXT -- 未知秘密\n', MAIN, 'ddl');
    removeColumns(hero, ['基础属性', '特有属性', '随身财物']);
    insertColumns(hero, null, ['已知秘密', '未知秘密']);

    const npc = sheetOf(out, NPCS, 'note');
    s = npc.sourceData;
    n = dropLine(dropLine(s.note, '- 基础属性：', NPCS, 'note'), '- 特有属性：', NPCS, 'note');
    s.note = replaceOnce(n, '- 当下想法：≤60字，恋爱对象必填，其余可NULL\n', '- 当下想法：≤60字，恋爱对象必填，其余可NULL\n- 已知秘密：主角已经掌握的关于该角色的情报，即该角色刻意隐瞒、外人不易知道的事实，如真实身份、过往经历、隐藏关系、真实目的；不记录该角色当前的行动、身体状态或情绪\n- 未知秘密：主角尚未查明、仅见端倪的情报疑点，写成待解的问题或线索；不记录该角色当前的行动、身体状态或情绪\n', NPCS, 'note');
    s.initNode = '为已登场角色各插入一条，已存在角色有update；同时初始化已知与未知秘密。';
    s.updateNode = '各项状态变化时更新；主角获得关于该角色的新情报时更新已知秘密，未知秘密查明后移入已知秘密，没有新情报时两列保持不变。';
    s.ddl = replaceOnce(s.ddl, '  base_attributes TEXT, -- 基础属性\n  special_attributes TEXT, -- 特有属性\n', '', NPCS, 'ddl');
    s.ddl = replaceOnce(s.ddl, '  past_experience TEXT, -- 过往经历\n  interaction_options TEXT -- 交互选项\n', '  past_experience TEXT, -- 过往经历\n  known_secrets TEXT, -- 已知秘密\n  unknown_secrets TEXT -- 未知秘密\n', NPCS, 'ddl');
    removeColumns(npc, ['基础属性', '特有属性', '交互选项']);
    insertColumns(npc, '过往经历', ['已知秘密', '未知秘密']);
}

// 检定建议表：骰子命令只写角色名与技能名，不写数值；不给技能清单，技能名由 AI 按剧情拟定。
const CHECK_RULE_BLOCK = '检定使用的技能由你根据剧情自行拟定：技能名要短、明确、可用于检定，不要写成一句设定描述。骰子命令只写角色名与技能名，不写任何数值。\n\n';
const CHECK_SKILL_BLOCK = '【技能选择原则】\n'
    + '1. 一个行动只选择最关键、最有不确定性的一个技能，不要同时堆多个技能。\n'
    + '2. 技能要与行动直接对应：身体行动写身体相关的技能，判断、观察、周旋写头脑与社交相关的技能，照料、家务、才艺写对应的生活或才艺技能。\n'
    + '3. 信任、亲密、边界、暧昧程度、占有欲、公开程度、稳定度、共同回忆等是关系状态，不作为检定技能。它们只用于调整难度、奖惩骰和结果解释。\n\n';
const CHECK_CONTEST_BLOCK = '常见对抗结构：\n'
    + '- 察觉 vs 掩饰：对抗 <user> 察言观色 vs 角色 伪装平静\n'
    + '- 沟通 vs 回避：对抗 <user> 沟通 vs 角色 回避\n'
    + '- 照顾 vs 逞强：对抗 <user> 照顾 vs 角色 逞强\n'
    + '- 主动靠近 vs 保持距离：对抗 <user> 调情 vs 角色 克制\n'
    + '- 稳住场面 vs 外部介入：对抗 <user> 话术 vs 旁人 周旋\n\n';
const CHECK_NAMES_BLOCK = '【角色名单】\n每次生成行动建议前必须获取以下查询的最新数据，骰子命令中的角色名只允许使用查询结果中已有的角色名，不得临时编造角色。\n\n'
    + '角色名单：\n'
    + '{[sql "SELECT 姓名, 角色状态, 所在地点 FROM (SELECT 0 AS sort_order, name AS 姓名, \'主角\' AS 角色状态, location_name AS 所在地点 FROM important_characters WHERE role_type=\'主角\' UNION ALL SELECT CASE WHEN presence_status=\'在场\' THEN 1 ELSE 2 END AS sort_order, name AS 姓名, \'恋爱对象:\' || presence_status AS 角色状态, location_name AS 所在地点 FROM important_characters WHERE role_type=\'恋爱对象\' UNION ALL SELECT CASE WHEN presence_status=\'在场\' THEN 3 ELSE 4 END AS sort_order, name AS 姓名, \'重要角色:\' || presence_status AS 角色状态, location_name AS 所在地点 FROM important_characters WHERE role_type=\'重要角色\') ORDER BY sort_order, 姓名"]}\n\n';

// 逐条一次命中的替换（note）。
const CHECK_NOTE_EDITS = Object.freeze([
    ['掷 1d100，结果小于等于属性值则推进顺利。', '检定结果决定本次行动推进是否顺利。'],
    ['- 前端展示给用户看的自然语言行动选项', '- 展示给用户看的自然语言行动选项'],
    ['- 前端解析执行的极简DSL命令，不展示给用户', '- 极简DSL命令，不展示给用户'],
    ['5. dice_command 只给前端解析，不得写自然语言解释。', '5. dice_command 不得写自然语言解释。'],
    ['检定 <角色> <属性> [难度=困难|极难]', '检定 <角色> <技能> [难度=困难|极难]'],
    ['对抗 <发起者> <属性> vs <对手> <属性>', '对抗 <发起者> <技能> vs <对手> <技能>'],
    ['1. 普通检定和对抗检定的角色名必须来自角色属性来源查询结果，不得临时编造角色。', '1. 普通检定和对抗检定的角色名必须来自角色名单查询结果，不得临时编造角色。'],
    ['2. 普通检定和对抗检定的属性名必须来自该角色已有的 base_attributes 或 special_attributes，不得临时编造属性。', '2. 普通检定和对抗检定的技能名由你按剧情拟定，要短、明确、可用于检定；命令里只写角色名与技能名，不写任何数值。'],
    ['生成时必须根据当前剧情、角色与属性重新编写', '生成时必须根据当前剧情、角色与技能重新编写'],
    ['对抗 <user> 理智 vs 角色名 察言观色', '对抗 <user> 察言观色 vs 角色名 克制'],
]);

function refineChecks(out) {
    const checks = sheetOf(out, CHECKS, 'note').sourceData;
    let n = spliceBetween(checks.note, '普通检定与对抗检定都必须使用角色表中已有的基础属性', '【检定时机】', CHECK_RULE_BLOCK, CHECKS, 'note');
    n = spliceBetween(n, '【属性选择原则】', '【对抗检定原则】', CHECK_SKILL_BLOCK, CHECKS, 'note');
    n = spliceBetween(n, '常见对抗结构：', '【难度与奖惩】', CHECK_CONTEST_BLOCK, CHECKS, 'note');
    n = spliceBetween(n, '【角色属性来源】', '【生成要求】', CHECK_NAMES_BLOCK, CHECKS, 'note');
    for (const [find, replace] of CHECK_NOTE_EDITS) n = replaceOnce(n, find, replace, CHECKS, 'note');
    checks.note = n;
    checks.initNode = replaceOnce(checks.initNode, '对抗 <user> 理智 vs 她 察言观色', '对抗 <user> 察言观色 vs 她 克制', CHECKS, 'initNode');
    checks.updateNode = replaceOnce(checks.updateNode, '骰子命令必须严格从角色属性清单取角色名和属性名', '骰子命令的角色名必须来自角色名单，技能名按剧情拟定，只写角色名与技能名、不写数值', CHECKS, 'updateNode');
}

export function adaptStatsTemplate(base) {
    if (!base || typeof base !== 'object' || Array.isArray(base)) throw templateError('stats-template-invalid');
    if (JSON.stringify(base).includes(STATS_TEMPLATE_MARK)) throw templateError('stats-template-already-adapted');
    const out = JSON.parse(JSON.stringify(base));
    sheetOf(out, VALUES, null);
    sheetOf(out, ITEMS, 'note');
    refineRoles(out);
    refineChecks(out);
    // 两张 IGS 记录表：数值表原位替换，才艺技能表紧跟其后；orderNo 顺延。
    const ordered = {};
    for (const [key, value] of Object.entries(out)) {
        if (key === VALUES) {
            ordered[VALUES] = igsRecordSheet('角色数值表', VALUES_COLUMNS, VALUES_DDL, 0, VALUES);
            ordered[SKILLS] = igsRecordSheet('才艺技能表', SKILLS_COLUMNS, SKILLS_DDL, 0, SKILLS);
        } else ordered[key] = value;
    }
    let order = 0;
    for (const [key, value] of Object.entries(ordered)) if (key !== 'mate') { value.orderNo = order; order += 1; }
    return ordered;
}
