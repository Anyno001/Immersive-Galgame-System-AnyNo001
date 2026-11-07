// 「由 IGS 程序维护」的数据库表格判定（docs/STATS_TABLE_REFINE_PLAN.md 第一、四节）。
// 适配版模板中的角色数值表、才艺技能表：更新频率为 0（数据库插件不让 AI 填），note 写明由 IGS 程序维护。
// 纯函数，只读数据库插件导出的整份表格 JSON。
export const IGS_MANAGED_MARK = '由 IGS 程序维护';
export const IGS_MANAGED_TABLES = Object.freeze(['角色数值表', '才艺技能表']);

const sheetEntries = (raw) => Object.values(raw && typeof raw === 'object' ? raw : {})
    .filter((s) => s && typeof s === 'object' && typeof s.uid === 'string' && s.uid.startsWith('sheet_'));

// 单张表是否已按 IGS 维护的写法配置：note 含标记；更新频率若有记录则必须为 0（用户改回非 0 视为让 AI 填表，不再自动写回）。
export function isIgsManagedSheet(sheet) {
    const note = sheet && sheet.sourceData && typeof sheet.sourceData.note === 'string' ? sheet.sourceData.note : '';
    if (!note.includes(IGS_MANAGED_MARK)) return false;
    const frequency = sheet.updateConfig && sheet.updateConfig.updateFrequency;
    return frequency === undefined || frequency === null || Number(frequency) === 0;
}

// 本聊天用的是 IGS 适配版模板：角色数值表与才艺技能表同时在场且都由 IGS 维护。
export function igsManagedTablesReady(raw) {
    const sheets = sheetEntries(raw);
    return IGS_MANAGED_TABLES.every((name) => {
        const sheet = sheets.find((s) => s.name === name);
        return Boolean(sheet) && isIgsManagedSheet(sheet);
    });
}

// 写回是否生效：设置里手动开启，或本聊天用了 IGS 适配版模板（自动开启）。
export function statsPushActive(manualEnabled, raw) {
    return Boolean(manualEnabled) || igsManagedTablesReady(raw);
}
