import { buildCombatSheet, encodeCombatRecord } from '../../../src/data/shujuku/combat-tables.js';
import { chatEntries, diffChatRecords, initRecord } from '../../../src/scene/stats/stat-log.js';
import { createStatsState } from '../../../src/scene/stats/stat-state.js';

export function createStatsPreview({ retry = false } = {}) {
    const currency = { name: '铜钱', table: { 少量: 7, 普通: 30, 昂贵: 90, 巨额: 300 }, rate: 0.25, initial: 100, seeded: true };
    const records = [initRecord(createStatsState({ money: 525 })),
        ...diffChatRecords(chatEntries(), chatEntries({ chatEnabled: true, currency: retry ? null : currency }), { tag: 'preview' })];
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
    return { api, context, bridge: { stats: { enabled: true, sheetGen: 'off', backfill: 'off', push: { enabled: true } } },
        secondaryLlm: { request: async () => { throw new Error('preview-model-disabled'); } } };
}
