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
    { sheet: VALUES, field: 'note', append: `${M}好感度、信任度、了解程度由前端维护，填表时禁止修改这三列；已知秘密、未知秘密仍按剧情维护。` },
    { sheet: VALUES, field: 'initNode', find: '赋予初始好感度、信任度、了解程度（均使用百分比%格式）', replace: '好感度、信任度、了解程度一律填 0%（由前端维护）' },
    { sheet: VALUES, field: 'updateNode', anchor: '单次事件变动', set: '与主角互动产生认知加深或秘密揭露时，只更新已知秘密与未知秘密。好感度、信任度、了解程度由前端维护，禁止修改。' },
    { sheet: CHECKS, field: 'note', find: '- 成长后属性最高不得超过90；若成长结果会超过90，按90记录。\n', replace: '' },
    { sheet: CHECKS, field: 'note', find: '普通检定、对抗检定和成长检定', replace: '普通检定和对抗检定' },
    { sheet: CHECKS, field: 'note', append: `${M}属性成长由前端结算，填表时不要自行提高或降低任何属性数值。` },
    { sheet: MAIN, field: 'note', append: `${M}基础属性、特有属性由前端维护，禁止修改；其余列照常维护。` },
    { sheet: MAIN, field: 'updateNode', anchor: 'base_attributes=', set: "字段变化时更新；基础属性、特有属性由前端维护，禁止修改。\n\nSQL示例: UPDATE protagonist_info SET current_condition='左膝擦伤，有点烦躁' WHERE row_id=1;" },
    { sheet: NPCS, field: 'note', append: `${M}基础属性、特有属性只在角色登场建档时填写一次，之后禁止修改；恋爱对象对主角的好感、信任、了解由前端维护（见角色数值表）。` },
    { sheet: NPCS, field: 'updateNode', anchor: '各项状态变化时更新', set: '各项状态变化时更新；基础属性、特有属性只在登场建档时填写一次，之后禁止修改。' },
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
    return out;
}
