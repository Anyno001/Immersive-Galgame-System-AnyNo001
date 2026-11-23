import { buildCombatSheet, encodeCombatRecord } from '../../../src/data/shujuku/combat-tables.js';
import { planInventoryTemplate } from '../../../src/data/shujuku/inventory-tables.js';
import { parseTables } from '../../../src/data/shujuku/table-parser.js';
import { chatEntries, diffChatRecords, initRecord } from '../../../src/scene/stats/stat-log.js';
import { createCharacter, createStatsState } from '../../../src/scene/stats/stat-state.js';

// coc：'investigator' / 'daily' 时带一份医生调查员档并设为对应模式；'empty' 为 CoC 规则未建档；缺省不建档。
const PREVIEW_COC = {
    v: 1, source: 'roll', at: 0, luck: 55, san: 60, occupation: '医生(原作向)', occId: 'doctor', occFormula: 'edu4', occPoints: 0, occPicks: ['侦查', '神秘学'],
    attrs: { 力量: 45, 体质: 60, 体型: 55, 敏捷: 50, 外貌: 65, 智力: 80, 意志: 60, 教育: 85 },
    alloc: { 信用评级: { occ: 45, hobby: 0 }, 医学: { occ: 70, hobby: 0 }, 急救: { occ: 40, hobby: 0 }, 心理学: { occ: 50, hobby: 0 }, '科学(生物学)': { occ: 50, hobby: 0 }, 侦查: { occ: 45, hobby: 10 }, 图书馆使用: { occ: 0, hobby: 40 }, 聆听: { occ: 0, hobby: 30 }, 闪避: { occ: 0, hobby: 20 }, 神秘学: { occ: 40, hobby: 0 } },
};

const PREVIEW_NPC_COC = {
    v: 1, source: 'ai', at: 0, luck: 45, san: 70, occupation: '记者', occFormula: 'edu4', occPoints: 0,
    attrs: { 力量: 40, 体质: 55, 体型: 50, 敏捷: 65, 外貌: 60, 智力: 75, 意志: 70, 教育: 70 },
    totals: { 侦查: 60, 话术: 55, 图书馆使用: 65, 说服: 50, 心理学: 40 },
};
const PREVIEW_CULTIST_COC = {
    v: 1, source: 'module', at: 0, luck: 50, san: 40, occupation: '邪教徒', occFormula: 'edu4', occPoints: 0,
    attrs: { 力量: 65, 体质: 60, 体型: 70, 敏捷: 50, 外貌: 45, 智力: 50, 意志: 40, 教育: 50 },
    totals: { '格斗(斗殴)': 60, 潜行: 45, 神秘学: 50 },
};
const PREVIEW_DAILY_SHEET = { rank: '老手', attributes: { 力量: 9, 敏捷: 12, 体质: 10, 智力: 14, 感知: 13, 魅力: 11 }, scale: 'score', skills: { 说服: 55, 侦查: 40 }, provisional: {}, signature: [], source: 'llm' };

export function createStatsPreview({ retry = false, coc = '' } = {}) {
    const currency = { name: '铜钱', table: { 少量: 7, 普通: 30, 昂贵: 90, 巨额: 300 }, rate: 0.25, initial: 100, seeded: true };
    const catalog = coc === 'investigator' || coc === 'daily'
        ? { protagonistCoc: PREVIEW_COC, cocMode: coc, npcCoc: { 小雪: PREVIEW_NPC_COC, 邪教头目: PREVIEW_CULTIST_COC }, sheets: { 老周: PREVIEW_DAILY_SHEET } } : null;
    const initial = createStatsState({ money: 525 });
    if (catalog) initial.characters = { 小雪: createCharacter(1), 老周: createCharacter(1) };
    const records = [initRecord(initial),
        ...diffChatRecords(chatEntries(), chatEntries({ chatEnabled: true, catalog, currency: retry ? null : currency }), { tag: 'preview' })];
    const tables = {};
    for (const [order, kind] of ['profile', 'ledger', 'attribute', 'stats'].entries()) {
        const sheet = buildCombatSheet(kind, order);
        if (kind === 'stats') {
            for (const record of records) {
                for (const row of encodeCombatRecord(kind, record).rows) {
                    sheet.content.push(sheet.content[0].map((column) => column === 'row_id' ? String(sheet.content.length) : row[column] ?? ''));
                }
            }
        }
        tables[sheet.uid] = sheet;
    }
    tables.sheet_previewbag = { uid: 'sheet_previewbag', name: '背包物品表', orderNo: 5,
        content: [['row_id', '物品名称', '数量', '描述/效果', '类别'], ['1', '铜钱', '240', '', '货币']] };
    tables.sheet_previewhero = { uid: 'sheet_previewhero', name: '主角信息表', orderNo: 6,
        content: [['姓名', '积分', '铜钱'], ['主角', '525', '240']] };
    const inventory = planInventoryTemplate(tables, parseTables(tables));
    if (!inventory.ok) throw new Error(`stats-preview-inventory:${inventory.reason}`);
    Object.assign(tables, inventory.template);
    const reject = () => false;
    const api = {
        exportTableAsJson: () => structuredClone(tables), getTableTemplate: () => structuredClone(tables),
        insertRow: reject, updateRow: reject, deleteRow: reject, updateCell: reject,
        importTemplateFromData: reject, refreshDataAndWorldbook: reject,
        registerTableUpdateCallback() {}, unregisterTableUpdateCallback() {},
    };
    const context = {
        name1: '主角', name2: '小雪', chatId: 'preview-stats', getCurrentChatId() { return this.chatId; },
        chat: [{ is_user: false, mes: '古城开场。', swipe_id: 0 }], chatMetadata: {},
        eventSource: { on() {}, removeListener() {} }, eventTypes: { CHAT_CHANGED: 'chat' }, saveMetadataDebounced() {},
    };
    return { api, context, bridge: { stats: { enabled: true, ...(catalog || coc === 'empty' ? { ruleset: 'coc7' } : {}), sheetGen: 'off', backfill: 'off', push: { enabled: true } } },
        secondaryLlm: { request: async () => { throw new Error('preview-model-disabled'); } } };
}
