// IGS 数值系统适配版 shujuku 模板（§8C）：以基准恋爱 gal 模板为底，只改与数值系统冲突的填表规则；
// 其余表、列、DDL、导出配置原样保留。纯函数，不改入参。
// 每条修改都带锚点：基准模板改版导致锚点对不上时抛错，不生成改了一半的模板。
export const STATS_TEMPLATE_FILE = 'TavernDB_template_恋爱Gal_IGS数值系统适配版.json';
export const STATS_TEMPLATE_MARK = '【IGS 数值系统】';

const M = STATS_TEMPLATE_MARK;
const VALUES = 'sheet_jue_se_shu_zhi_biao';
const CHECKS = 'sheet_jian_ding_jian_yi_biao';
const MAIN = 'sheet_zhu_jue_xin_xi_biao';
const NPCS = 'sheet_zhong_yao_jue_se_biao';

// append：追加到字段末尾；find/replace：恰好命中一次才替换；anchor/set：字段含锚点才整段替换。
export const STATS_TEMPLATE_EDITS = Object.freeze([
    { sheet: VALUES, field: 'note', find: '- 已知秘密：已查明或获知的具体秘密内容', replace: '- 已知秘密：主角已经掌握的关于该角色的情报，即该角色刻意隐瞒、外人不易知道的事实，如真实身份、过往经历、隐藏关系、真实目的；不记录该角色当前的行动、身体状态或情绪' },
    { sheet: VALUES, field: 'note', find: '- 未知秘密：尚未探明或仅见端倪的秘密线索/悬念内容', replace: '- 未知秘密：主角尚未查明、仅见端倪的情报疑点，写成待解的问题或线索；不记录该角色当前的行动、身体状态或情绪' },
    { sheet: VALUES, field: 'note', find: '- 了解程度：百分比%格式', replace: '- 了解程度：百分比%格式\n- 芥蒂程度：角色对主角的不满与心结，百分比%格式' },
    { sheet: VALUES, field: 'ddl', find: '  understanding_level TEXT, -- 了解程度\n', replace: '  understanding_level TEXT, -- 了解程度\n  grudge_level TEXT, -- 芥蒂程度\n' },
    { sheet: VALUES, field: 'note', append: `${M}好感度、信任度、了解程度、芥蒂程度由前端维护，填表时禁止修改这四列；已知秘密、未知秘密仍按剧情维护。` },
    { sheet: VALUES, field: 'initNode', find: '赋予初始好感度、信任度、了解程度（均使用百分比%格式）', replace: '好感度、信任度、了解程度、芥蒂程度一律填 0%（由前端维护）' },
    { sheet: VALUES, field: 'updateNode', anchor: '单次事件变动', set: '主角获得关于该角色的新情报或秘密被揭露时，更新已知秘密与未知秘密；未知秘密查明后移入已知秘密。本轮没有新情报时两列保持不变。好感度、信任度、了解程度、芥蒂程度由前端维护，禁止修改。' },
    { sheet: CHECKS, field: 'note', find: '- 成长后属性最高不得超过90；若成长结果会超过90，按90记录。\n', replace: '' },
    { sheet: CHECKS, field: 'note', find: '普通检定、对抗检定和成长检定', replace: '普通检定和对抗检定' },
    { sheet: CHECKS, field: 'note', append: `${M}属性成长由前端结算，填表时不要自行提高或降低任何属性数值。` },
    { sheet: MAIN, field: 'note', append: `${M}基础属性、特有属性由前端维护，禁止修改；其余列照常维护。` },
    { sheet: MAIN, field: 'updateNode', anchor: 'base_attributes=', set: "字段变化时更新；基础属性、特有属性由前端维护，禁止修改。\n\nSQL示例: UPDATE protagonist_info SET current_condition='左膝擦伤，有点烦躁' WHERE row_id=1;" },
    { sheet: NPCS, field: 'note', append: `${M}基础属性、特有属性只在角色登场建档时填写一次，之后禁止修改；恋爱对象对主角的好感、信任、了解由前端维护（见角色数值表）。` },
    { sheet: NPCS, field: 'updateNode', anchor: '各项状态变化时更新', set: '各项状态变化时更新；基础属性、特有属性只在登场建档时填写一次，之后禁止修改。' },
]);

// 新增列：插在 after 列之后（表头 content[0]），与上面 ddl 的同名字段对应。表内已有数据行时同位置补空格。
export const STATS_TEMPLATE_COLUMNS = Object.freeze([
    { sheet: VALUES, after: '了解程度', column: '芥蒂程度' },
]);

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

// ---- 数值表解耦（docs/STATS_TABLE_DECOUPLE_PLAN.md）：在上面的适配结果上再改表结构 ----
const SKILLS = 'sheet_cai_yi_ji_neng_biao';
const ITEMS = 'sheet_wu_pin_biao';

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

function decoupleValues(out) {
    const V = sheetOf(out, VALUES, 'note');
    const s = V.sourceData;
    let n = replaceOnce(s.note, '记录各角色对主角的信任度与好感度，多行表，一行代表一个角色。', '记录各角色对主角的关系数值与生活状态，多行表，一行代表一个角色。主角也占一行，主角行的好感度、信任度、了解程度、芥蒂程度留空。', VALUES, 'note');
    n = spliceBetween(n, '- 已知秘密：', '\n\n# 数值具体说明', '- 体力：整数，新角色建档填初值 100\n- 金钱：整数，新角色建档填 0\n- 压力：整数，新角色建档填 0', VALUES, 'note');
    n = spliceBetween(n, M, null, `${M}本表所有数值列（好感度、信任度、了解程度、芥蒂程度、体力、金钱、压力）由前端维护，AI 禁止修改任何一格；新角色建档时好感度、信任度、了解程度、芥蒂程度、金钱、压力填 0，体力填 100（初值），之后一律不动。已知秘密、未知秘密已移到重要角色表与主角信息表。`, VALUES, 'note');
    s.note = n;
    s.initNode = '故事初始化或新角色登场建档时，插入一行：好感度、信任度、了解程度、芥蒂程度、金钱、压力一律填 0，体力填 100，这些数值由前端维护。主角也建一行，关系四列留空。';
    s.insertNode = '剧情中出现新的重要角色或需要追踪数值的NPC登场时新增一行，数值填初值；主角行只建一次。';
    s.updateNode = '本表所有数值列由前端维护，禁止修改。';
    s.deleteNode = '角色彻底退场、关系不再追踪或设定重置时删除。';
    s.ddl = 'CREATE TABLE sheet_jue_se_shu_zhi_biao (\n  row_id INTEGER PRIMARY KEY,\n  character_name TEXT NOT NULL, -- 角色姓名\n'
        + '  favorability TEXT, -- 好感度\n  trust TEXT, -- 信任度\n  understanding_level TEXT, -- 了解程度\n  grudge_level TEXT, -- 芥蒂程度\n'
        + '  stamina TEXT, -- 体力\n  money TEXT, -- 金钱\n  stress TEXT -- 压力\n);';
    removeColumns(V, ['已知秘密', '未知秘密']);
    insertColumns(V, '芥蒂程度', ['体力', '金钱', '压力']);
    // 才艺技能表：沿用角色数值表的配置外壳（更新频率、导出配置），内容全部重写。
    const K = JSON.parse(JSON.stringify(V));
    K.uid = SKILLS;
    K.name = '才艺技能表';
    K.content = [['row_id', '角色姓名', '技能', '数值']];
    K.exportConfig.entryName = '才艺技能表';
    K.exportConfig.extraIndexEntryName = '才艺技能表-索引';
    K.exportConfig.keywords = '角色姓名';
    K.sourceData = {
        note: `记录各角色的基础六维与特有技能，多行表，一行一项（一个角色的一项技能占一行）。\n\n【列说明】\n- 角色姓名：与角色数值表一致的角色全名；主角使用主角的姓名\n- 技能：技能名，如 力量、敏捷、体质、智力、感知、魅力 六维，或烹饪、园艺、钢琴、话术 等特有技能\n- 数值：整数，范围 1-99\n\n${M}本表数值由前端维护，AI 禁止修改任何已有行。基础六维由前端补全，AI 不要自行填写六维。仅当剧情中出现新本领、且本表该角色没有对应技能行时，AI 可以新增一行并给初值；技能名要短、明确、可用于检定，不要写成一句设定描述。已有行一律不动。\n\n检定取值：普通检定与对抗检定的数值，一律从本表按 角色姓名 + 技能 取得。`,
        initNode: '故事初始化或新角色登场建档时，可为该角色新增其特有技能行（技能与初值），初值参考角色设定，普通人常见 40-65；六维由前端补全，不要填写。',
        insertNode: '剧情中出现新本领、且本表该角色没有对应技能行时新增一行，给初值；本表已有的技能不得重复新增。',
        updateNode: '禁止修改已有行，技能数值的成长与变动由前端结算。',
        deleteNode: '禁止。',
        ddl: 'CREATE TABLE sheet_cai_yi_ji_neng_biao (\n  row_id INTEGER PRIMARY KEY,\n  character_name TEXT NOT NULL, -- 角色姓名\n  skill_name TEXT NOT NULL, -- 技能\n  skill_value TEXT -- 数值\n);',
    };
    return K;
}

function decoupleRoles(out) {
    const hero = sheetOf(out, MAIN, 'note');
    let s = hero.sourceData;
    let n = dropLine(dropLine(s.note, '- 基础属性：', MAIN, 'note'), '- 特有属性：', MAIN, 'note');
    n = replaceOnce(n, '  √ 抑制剂快到时间了，后颈发热\n', '  √ 抑制剂快到时间了，后颈发热\n- 已知秘密：主角已经暴露给他人的秘密，如真实身份、过往经历、隐藏关系；不记录当前的行动、身体状态或情绪\n- 未知秘密：主角仍然隐藏、尚未被他人察觉的秘密；被他人知晓后移入已知秘密\n', MAIN, 'note');
    s.note = spliceBetween(n, M, null, `${M}主角的基础六维与特有技能记在才艺技能表，随身钱款记在角色数值表的金钱，实物记在物品表，本表不再记录；这三项由前端维护，禁止在本表补写。`, MAIN, 'note');
    s.updateNode = "字段变化时更新；秘密被他人察觉时，把对应内容从未知秘密移入已知秘密。\n\nSQL示例: UPDATE protagonist_info SET current_condition='左膝擦伤，有点烦躁' WHERE row_id=1;";
    s.ddl = replaceOnce(s.ddl, '  base_attributes TEXT NOT NULL, -- 基础属性\n  special_attributes TEXT, -- 特有属性\n', '', MAIN, 'ddl');
    s.ddl = replaceOnce(s.ddl, '  location_name TEXT, -- 所在地点\n  belongings TEXT -- 随身财物\n', '  location_name TEXT, -- 所在地点\n  known_secrets TEXT, -- 已知秘密\n  unknown_secrets TEXT -- 未知秘密\n', MAIN, 'ddl');
    removeColumns(hero, ['基础属性', '特有属性', '随身财物']);
    insertColumns(hero, null, ['已知秘密', '未知秘密']);

    const npc = sheetOf(out, NPCS, 'note');
    s = npc.sourceData;
    n = dropLine(dropLine(s.note, '- 基础属性：', NPCS, 'note'), '- 特有属性：', NPCS, 'note');
    n = replaceOnce(n, '- 当下想法：≤60字，恋爱对象必填，其余可NULL\n', '- 当下想法：≤60字，恋爱对象必填，其余可NULL\n- 已知秘密：主角已经掌握的关于该角色的情报，即该角色刻意隐瞒、外人不易知道的事实，如真实身份、过往经历、隐藏关系、真实目的；不记录该角色当前的行动、身体状态或情绪\n- 未知秘密：主角尚未查明、仅见端倪的情报疑点，写成待解的问题或线索；不记录该角色当前的行动、身体状态或情绪\n', NPCS, 'note');
    s.note = spliceBetween(n, M, null, `${M}角色的基础六维与特有技能记在才艺技能表，由前端维护，本表不再记录；恋爱对象对主角的好感、信任、了解由前端维护（见角色数值表）。`, NPCS, 'note');
    s.initNode = '为已登场角色各插入一条，已存在角色有update；同时初始化已知与未知秘密。';
    s.updateNode = '各项状态变化时更新；主角获得关于该角色的新情报时更新已知秘密，未知秘密查明后移入已知秘密，没有新情报时两列保持不变。';
    s.ddl = replaceOnce(s.ddl, '  base_attributes TEXT, -- 基础属性\n  special_attributes TEXT, -- 特有属性\n', '', NPCS, 'ddl');
    s.ddl = replaceOnce(s.ddl, '  past_experience TEXT, -- 过往经历\n', '  past_experience TEXT, -- 过往经历\n  known_secrets TEXT, -- 已知秘密\n  unknown_secrets TEXT, -- 未知秘密\n', NPCS, 'ddl');
    removeColumns(npc, ['基础属性', '特有属性']);
    insertColumns(npc, '过往经历', ['已知秘密', '未知秘密']);

    const items = sheetOf(out, ITEMS, 'note').sourceData;
    items.note = `${items.note.replace(/\s+$/, '')}\n4. 钱不记在这里，金钱记在角色数值表。`;
}

const CHECK_RULE_BLOCK = '普通检定与对抗检定的数值，一律从才艺技能表按 角色姓名 + 技能 取得，不从角色表、主角表取值。表里没有该技能时，只能改用才艺技能表里该角色已有的技能或六维，禁止临时编造属性。\n\n'
    + '【六维规则】\n六维是所有角色在才艺技能表里应已具备的通用技能，用于保证任何角色都能参与普通检定和对抗检定。六维固定为以下6项，不得改名或新增：\n'
    + '- 力量：搬运、扶起、拉住、护住、撑住、推开障碍等身体力量相关行动。\n'
    + '- 敏捷：动作反应、身体协调、及时接住、避开、追上、抢先一步等即时行动。\n'
    + '- 体质：身体状态、疾病、恢复、受伤、疲劳、熬夜、酒量等身体承受力。\n'
    + '- 智力：在争执、误会、吃醋、诱惑、压力、修罗场中保持冷静判断。智力不是SAN，只表示日常关系场景里的判断和抗压。\n'
    + '- 感知：发现客观可见的细节、异常、环境变化、物品痕迹和对方外在状态。感知负责“注意到什么”，不直接等于理解对方情绪。\n'
    + '- 魅力：外貌、气质、声音、姿态、打扮、存在感和吸引他人注意的能力。魅力不强迫角色产生感情，只影响注意力、第一印象、暧昧机会和社交气氛。\n\n'
    + '旧写法“健康、理智、观察”分别对应现行的体质、智力、感知，命令里统一写现行名称。\n\n'
    + '【数值范围】\n才艺技能表里的数值为整数，范围 1-99，由前端维护，AI 只读取、不修改。\n\n'
    + '【特有技能规则】\n特有技能（如烹饪、园艺、钢琴、话术、调情、照顾）与六维同样记在才艺技能表，只有表里该角色已有的技能才能用于检定。角色没有精准的特有技能时，使用最接近的六维。\n\n';

const CHECK_SOURCE_BLOCK = '【角色属性来源】\n每次生成行动建议前必须获取以下查询的最新数据，并只允许使用查询结果中已有的角色名和才艺技能表里该角色已有的技能。若某个角色没有对应技能，则不得为其临时编造，应退回使用该角色已有的最接近的技能或六维。\n\n'
    + '角色名单：\n'
    + '{[sql "SELECT 姓名, 角色状态, 所在地点 FROM (SELECT 0 AS sort_order, name AS 姓名, \'主角\' AS 角色状态, location_name AS 所在地点 FROM important_characters WHERE role_type=\'主角\' UNION ALL SELECT CASE WHEN presence_status=\'在场\' THEN 1 ELSE 2 END AS sort_order, name AS 姓名, \'恋爱对象:\' || presence_status AS 角色状态, location_name AS 所在地点 FROM important_characters WHERE role_type=\'恋爱对象\' UNION ALL SELECT CASE WHEN presence_status=\'在场\' THEN 3 ELSE 4 END AS sort_order, name AS 姓名, \'重要角色:\' || presence_status AS 角色状态, location_name AS 所在地点 FROM important_characters WHERE role_type=\'重要角色\') ORDER BY sort_order, 姓名"]}\n\n'
    + '才艺技能表（按 角色姓名 + 技能 取数值）：\n'
    + '{[sql "SELECT character_name AS 角色姓名, skill_name AS 技能, skill_value AS 数值 FROM talent_skills ORDER BY character_name, row_id"]}\n\n';

// 检定建议表：数值来源从角色表的基础属性、特殊属性改成才艺技能表。
const CHECK_NOTE_EDITS = Object.freeze([
    ['1. 普通检定与对抗检定必须使用角色表中已有的基础属性或特殊属性，禁止临时编造属性。', '1. 普通检定与对抗检定的数值从才艺技能表按 角色姓名 + 技能 取得，必须使用该角色在才艺技能表中已有的技能或六维，禁止临时编造属性。'],
    ['2. 有精准特殊属性时，优先使用特殊属性；没有精准特殊属性时，使用最接近的基础属性。', '2. 才艺技能表里该角色有精准的特有技能时，优先使用特有技能；没有时，使用最接近的六维。'],
    ['身体状态、疲劳、生病、受伤优先用健康', '身体状态、疲劳、生病、受伤优先用体质'],
    ['争执、吃醋、诱惑、修罗场、压力判断优先用理智；发现外部细节和异常优先用观察', '争执、吃醋、诱惑、修罗场、压力判断优先用智力；发现外部细节和异常优先用感知'],
    ['如果角色有对应特殊属性，优先使用对应特殊属性；没有时退回最接近的基础属性。', '如果才艺技能表里该角色有对应特有技能，优先使用；没有时退回最接近的六维。'],
    ['- 察觉 vs 掩饰：对抗 <user> 观察 vs 角色 克制 / 伪装平静 / 理智', '- 察觉 vs 掩饰：对抗 <user> 感知 vs 角色 克制 / 伪装平静 / 智力'],
    ['沟通 vs 回避：对抗 <user> 沟通 vs 角色 理智 / 克制 / 拒绝', '沟通 vs 回避：对抗 <user> 沟通 vs 角色 智力 / 克制 / 拒绝'],
    ['照顾 vs 逞强：对抗 <user> 照顾 vs 角色 理智 / 健康 / 克制', '照顾 vs 逞强：对抗 <user> 照顾 vs 角色 智力 / 体质 / 克制'],
    ['主动靠近 vs 保持距离：对抗 <user> 魅力 / 调情 / 沟通 vs 角色 理智 / 克制', '主动靠近 vs 保持距离：对抗 <user> 魅力 / 调情 / 沟通 vs 角色 智力 / 克制'],
    ['旁人 话术 / 魅力 / 观察', '旁人 话术 / 魅力 / 感知'],
    ['对抗 <user> 理智 vs 角色名 察言观色', '对抗 <user> 智力 vs 角色名 察言观色'],
    ['普通检定和对抗检定的角色名必须来自角色属性来源查询结果，不得临时编造角色。', '普通检定和对抗检定的角色名必须来自角色名单查询结果，不得临时编造角色。'],
    ['2. 普通检定和对抗检定的属性名必须来自该角色已有的 base_attributes 或 special_attributes，不得临时编造属性。', '2. 普通检定和对抗检定的属性名（即技能名）必须来自才艺技能表中该角色已有的技能或六维，数值由前端按 角色姓名 + 技能 从才艺技能表取得，不得临时编造属性。'],
]);

function decoupleChecks(out) {
    const checks = sheetOf(out, CHECKS, 'note').sourceData;
    let n = spliceBetween(checks.note, '普通检定与对抗检定都必须使用角色表中已有的基础属性', '【检定时机】', CHECK_RULE_BLOCK, CHECKS, 'note');
    for (const [find, replace] of CHECK_NOTE_EDITS) n = replaceOnce(n, find, replace, CHECKS, 'note');
    checks.note = spliceBetween(n, '【角色属性来源】', '【生成要求】', CHECK_SOURCE_BLOCK, CHECKS, 'note');
    checks.initNode = replaceOnce(checks.initNode, '对抗 <user> 理智 vs 她', '对抗 <user> 智力 vs 她', CHECKS, 'initNode');
    checks.updateNode = replaceOnce(checks.updateNode, '骰子命令必须严格从角色属性清单取角色名和属性名', '骰子命令必须严格从角色名单取角色名、从才艺技能表取该角色已有的技能名作为属性名', CHECKS, 'updateNode');
}

// 在适配结果上改表结构；才艺技能表紧跟角色数值表，orderNo 顺延。
function decoupleStatsTables(out) {
    decoupleRoles(out);
    decoupleChecks(out);
    const skills = decoupleValues(out);
    const ordered = {};
    for (const [key, value] of Object.entries(out)) {
        ordered[key] = value;
        if (key === VALUES) ordered[SKILLS] = skills;
    }
    let order = 0;
    for (const [key, value] of Object.entries(ordered)) if (key !== 'mate') { value.orderNo = order; order += 1; }
    return ordered;
}

export function adaptStatsTemplate(base) {
    if (!base || typeof base !== 'object' || Array.isArray(base)) throw templateError('stats-template-invalid');
    if (JSON.stringify(base).includes(M)) throw templateError('stats-template-already-adapted');
    const out = JSON.parse(JSON.stringify(base));
    for (const e of STATS_TEMPLATE_EDITS) {
        const src = out[e.sheet] && out[e.sheet].sourceData;
        const text = src && typeof src[e.field] === 'string' ? src[e.field] : null;
        if (text === null) throw templateError('stats-template-field-missing', { sheet: e.sheet, field: e.field });
        let next;
        if (e.append) {
            next = `${text.replace(/\s+$/, '')}\n\n${e.append}`;
        } else if (e.set !== undefined) {
            if (!text.includes(e.anchor)) throw templateError('stats-template-anchor-missing', { sheet: e.sheet, field: e.field });
            next = e.set;
        } else {
            const count = countOf(text, e.find);
            if (count !== 1) throw templateError('stats-template-anchor-missing', { sheet: e.sheet, field: e.field, count });
            next = text.replace(e.find, () => e.replace);
        }
        src[e.field] = next;
    }
    for (const c of STATS_TEMPLATE_COLUMNS) {
        const rows = out[c.sheet] && out[c.sheet].content;
        const header = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : null;
        const at = header ? header.indexOf(c.after) : -1;
        if (at < 0) throw templateError('stats-template-anchor-missing', { sheet: c.sheet, field: 'content' });
        for (const row of rows) if (Array.isArray(row)) row.splice(at + 1, 0, row === header ? c.column : '');
    }
    return decoupleStatsTables(out);
}
