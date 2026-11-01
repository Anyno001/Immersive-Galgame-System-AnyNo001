// 差分测试：floor-note、combat-chat-record、combat-report-regex、combat-story-context 与 v0.39 原包同输入同输出。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { insertFloorNote, sanitizeFloorNote, withFloorNote } from '../src/combat/floor-note.js';
import { COMBAT_CHAT_RECORD_KEY, createCombatChatRecord } from '../src/host/combat-chat-record.js';
import { COMBAT_REPORT_FIND, COMBAT_REPORT_REGEX_ID, COMBAT_REPORT_REPLACE, combatReportRegex, ensureCombatReportRegex } from '../src/host/combat-report-regex.js';
import { COMBAT_STORY_FLOORS, COMBAT_STORY_MAX_CHARS, COMBAT_WORLD_INFO_MAX_CHARS, createCombatStoryContext } from '../src/host/combat-story-context.js';

globalThis.window = globalThis.window || { IGS_AUTO_BOOTSTRAP: false };
globalThis.window.IGS_AUTO_BOOTSTRAP = false;
const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const orig = (path) => globalThis.__igsRequire(path);
const oFloor = orig('src/combat/floor-note.js');
const oRecord = orig('src/host/combat-chat-record.js');
const oRegex = orig('src/host/combat-report-regex.js');
const oStory = orig('src/host/combat-story-context.js');

const clone = (value) => JSON.parse(JSON.stringify(value));

test('floor-note：insertFloorNote 各分支与原包一致', () => {
    const start = '[igs-combat:start|史莱姆*2|草原]';
    const awaken = '[igs-combat:awaken|怒火|她握紧了剑]';
    const cases = [
        ['', '备注'],
        ['正文第一行\n正文第二行', '获得了药水'],
        ['正文\n\n', '尾部备注'],
        [`开场白\n${start}\n后续`, '战前备注'],
        [`开场白\n${awaken}\n${start}\n后续`, '觉醒前备注'],
        [`开场白\n${start}\n${start}`, '重复标签'],
        ['正文 [igs-combat:exp|10] 结尾', '带标签行'],
        ['正文', '  [含括号]\n换行  '],
        ['正文', ''],
        ['正文', null],
        ['正文', 'x'.repeat(300)],
        [null, '空正文'],
        ['<details>折叠</details>\n正文', '含卡片'],
    ];
    for (const [text, note] of cases) {
        assert.deepEqual(insertFloorNote(text, note), oFloor.insertFloorNote(text, note), JSON.stringify([text, note]));
    }
    assert.equal(sanitizeFloorNote('  a[b]\nc  '), oFloor.sanitizeFloorNote('  a[b]\nc  '));
    assert.equal(sanitizeFloorNote(undefined), oFloor.sanitizeFloorNote(undefined));
});

// 构造一个可回读的楼层宿主，用于 withFloorNote 回滚分支
function floorHost(initial, { failWriteAt = -1, mutateAfterWrite = null } = {}) {
    const floor = { chatId: 'c1', messageId: 3, swipeId: 0, isAi: true, isLatest: true, text: initial };
    let writes = 0;
    const log = [];
    return {
        log,
        readFloor: () => ({ ...floor }),
        writeFloor: async (messageId, text) => {
            const index = writes;
            writes += 1;
            log.push(text);
            if (index === failWriteAt) return { ok: false, reason: 'boom' };
            floor.text = text;
            if (mutateAfterWrite && index === 0) mutateAfterWrite(floor);
            return { ok: true };
        },
    };
}

async function runWith(impl, setup, action, extra = {}) {
    const host = setup();
    const result = await impl({ readFloor: host.readFloor, writeFloor: host.writeFloor, messageId: 3, note: '使用了药水', action, ...extra });
    return { result, log: host.log };
}

test('floor-note：withFloorNote 成功、失败回滚、校验失败与原包一致', async () => {
    const scenarios = [
        ['成功', () => floorHost('正文'), async () => ({ ok: true, stock: [{ ok: true }] })],
        ['动作失败回滚', () => floorHost('正文'), async () => ({ ok: false, reason: 'combat-item-insufficient' })],
        ['库存条目失败', () => floorHost('正文'), async () => ({ ok: true, stock: [{ ok: true }, { ok: false, reason: 'inv-x' }] })],
        ['动作抛错', () => floorHost('正文'), async () => { throw new Error('x'); }],
        ['写入失败', () => floorHost('正文', { failWriteAt: 0 }), async () => ({ ok: true })],
        ['回滚写失败', () => floorHost('正文', { failWriteAt: 1 }), async () => ({ ok: false, reason: 'r' })],
        ['写后被改（未核实）', () => floorHost('正文', { mutateAfterWrite: (f) => { f.text = '被别人改了'; } }), async () => ({ ok: true })],
        ['写后换滑页', () => floorHost('正文', { mutateAfterWrite: (f) => { f.swipeId = 1; } }), async () => ({ ok: true })],
    ];
    for (const [name, setup, action] of scenarios) {
        const mine = await runWith(withFloorNote, setup, action);
        const theirs = await runWith(oFloor.withFloorNote, setup, action);
        assert.deepEqual(mine, theirs, name);
    }
    // 楼层不可用与备注不安全
    const notAi = { readFloor: () => ({ isAi: false, isLatest: true, text: 'x' }), writeFloor: async () => ({ ok: true }), messageId: 1, note: 'n', action: async () => ({ ok: true }) };
    assert.deepEqual(await withFloorNote(notAi), await oFloor.withFloorNote(notAi));
    const empty = { ...notAi, readFloor: () => ({ isAi: true, isLatest: true, text: 'x' }), note: '' };
    assert.deepEqual(await withFloorNote(empty), await oFloor.withFloorNote(empty));
    const stale = { ...notAi, readFloor: () => ({ isAi: true, isLatest: true, text: 'x' }), writeFloor: async () => ({ ok: false, reason: 'stale' }) };
    assert.deepEqual(await withFloorNote(stale), await oFloor.withFloorNote(stale));
});

// 构造酒馆聊天宿主
function chatHost(chat, { saveChat = async () => {} } = {}) {
    return { SillyTavern: { getContext: () => ({ chat, saveChat }) } };
}

async function recordScenario(factory, build) {
    const log = [];
    const { chat, saveChat } = build(log);
    const record = factory(chatHost(chat, { saveChat }));
    const anchor = { messageId: 1, swipeId: 0 };
    log.push(record.read(anchor, 'b1'));
    log.push(await record.write(anchor, 'b1', { hp: 5, list: [1, 2] }));
    log.push(record.read(anchor, 'b1'));
    log.push(await record.write(anchor, 'b1', { extra: true }));
    log.push(record.read({ messageId: 0, swipeId: 0 }, 'b1'));
    log.push(record.read({ messageId: 9, swipeId: 0 }, 'b1'));
    log.push(await record.write({ messageId: 1, swipeId: 4 }, 'b1', { x: 1 }));
    log.push(clone(chat));
    return log;
}

test('combat-chat-record：读写、滑页、保存失败回滚与原包一致', async () => {
    assert.equal(COMBAT_CHAT_RECORD_KEY, oRecord.COMBAT_CHAT_RECORD_KEY);
    const builders = {
        正常带滑页: () => ({ chat: [{ is_user: true, mes: 'hi' }, { mes: 'ai', swipe_id: 0, swipe_info: [{ extra: {} }] }], saveChat: async () => {} }),
        无extra: () => ({ chat: [{ is_user: true }, { mes: 'ai' }], saveChat: async () => {} }),
        已有其他extra: () => ({ chat: [{ is_user: true }, { mes: 'ai', extra: { keep: 1, igsCombat: { b2: { a: 1 } } } }], saveChat: async () => {} }),
        保存失败: () => ({ chat: [{ is_user: true }, { mes: 'ai', extra: { keep: 1 } }], saveChat: async () => { throw new Error('disk'); } }),
        保存失败带既有记录: () => ({ chat: [{ is_user: true }, { mes: 'ai', swipe_info: [{ extra: { igsCombat: { b1: { old: 1 } } } }], extra: { igsCombat: { b1: { old: 1 } } } }], saveChat: async () => { throw new Error('disk'); } }),
        记录损坏: () => ({ chat: [{ is_user: true }, { mes: 'ai', extra: { igsCombat: 'oops' } }], saveChat: async () => {} }),
        记录项损坏: () => ({ chat: [{ is_user: true }, { mes: 'ai', extra: { igsCombat: { b1: [1] } } }], saveChat: async () => {} }),
    };
    for (const [name, build] of Object.entries(builders)) {
        const mine = await recordScenario(createCombatChatRecord, build);
        const theirs = await recordScenario(oRecord.createCombatChatRecord, build);
        assert.deepEqual(mine, theirs, name);
    }
    // 无上下文 / 无 saveChat
    for (const host of [{}, { SillyTavern: { getContext: () => ({ chat: [{}, {}] }) } }]) {
        const a = createCombatChatRecord(host);
        const b = oRecord.createCombatChatRecord(host);
        assert.deepEqual(a.read({ messageId: 1, swipeId: 0 }, 'k'), b.read({ messageId: 1, swipeId: 0 }, 'k'));
        assert.deepEqual(await a.write({ messageId: 1, swipeId: 0 }, 'k', { a: 1 }), await b.write({ messageId: 1, swipeId: 0 }, 'k', { a: 1 }));
    }
});

test('combat-report-regex：定义与 ensure 各分支与原包一致', async () => {
    assert.equal(COMBAT_REPORT_REGEX_ID, oRegex.COMBAT_REPORT_REGEX_ID);
    assert.equal(COMBAT_REPORT_FIND, oRegex.COMBAT_REPORT_FIND);
    assert.equal(COMBAT_REPORT_REPLACE, oRegex.COMBAT_REPORT_REPLACE);
    assert.deepEqual(combatReportRegex(), oRegex.combatReportRegex());
    const makeHost = (initial, { failRead = false, failWrite = false } = {}) => {
        const state = { list: clone(initial), writes: 0 };
        return {
            state,
            host: {
                TavernHelper: {
                    getTavernRegexes: () => { if (failRead) throw new Error('r'); return clone(state.list); },
                    replaceTavernRegexes: async (list) => { if (failWrite) throw new Error('w'); state.writes += 1; state.list = clone(list); },
                },
            },
        };
    };
    const variants = [
        [[]],
        [[{ id: 'other' }]],
        [[{ id: COMBAT_REPORT_REGEX_ID, old: true }, { id: 'other' }]],
        [[oRegex.combatReportRegex()]],
        [[], { failRead: true }],
        [[], { failWrite: true }],
    ];
    for (const [initial, flags] of variants) {
        const a = makeHost(initial, flags);
        const b = makeHost(initial, flags);
        assert.deepEqual(await ensureCombatReportRegex(a.host), await oRegex.ensureCombatReportRegex(b.host));
        assert.deepEqual(a.state, b.state);
    }
    assert.deepEqual(await ensureCombatReportRegex({}), await oRegex.ensureCombatReportRegex({}));
    assert.deepEqual(await ensureCombatReportRegex({ TavernHelper: {} }), await oRegex.ensureCombatReportRegex({ TavernHelper: {} }));
});

test('combat-story-context：取楼层、世界书、人设与原包一致', async () => {
    assert.equal(COMBAT_STORY_FLOORS, oStory.COMBAT_STORY_FLOORS);
    assert.equal(COMBAT_STORY_MAX_CHARS, oStory.COMBAT_STORY_MAX_CHARS);
    assert.equal(COMBAT_WORLD_INFO_MAX_CHARS, oStory.COMBAT_WORLD_INFO_MAX_CHARS);
    const long = '长'.repeat(2500);
    const chat = [
        { mes: '第一条 AI' },
        { is_user: true, mes: '用户说话' },
        { is_system: true, mes: '系统' },
        { mes: '  <b>第二条</b>   [igs-fx:item|获得|药水] 带  标签  \n\n\n尾' },
        { mes: '   ' },
        { mes: long },
        { mes: '最后一条' },
    ];
    const host = { SillyTavern: { getContext: () => ({ chat, powerUserSettings: { persona_description: '  勇者   人设 ' } }) } };
    const calls = [];
    const resolveWorldInfo = async (arg) => { calls.push(clone({ ...arg, signal: undefined })); return { ok: true, text: ` ${'世'.repeat(3500)} ` }; };
    const optionSets = [{}, { full: true }, { persona: true }, { names: ['A', ' A ', '', 'B', null] }, { full: true, persona: true, names: ['X'] }];
    for (const opts of optionSets) {
        calls.length = 0;
        const mine = await createCombatStoryContext(host, { resolveWorldInfo })(opts);
        const mineCalls = clone(calls);
        calls.length = 0;
        const theirs = await oStory.createCombatStoryContext(host, { resolveWorldInfo })(opts);
        assert.deepEqual(mine, theirs, JSON.stringify(opts));
        assert.deepEqual(mineCalls, calls);
    }
    const aborted = new AbortController();
    aborted.abort();
    const failing = async () => { throw new Error('x'); };
    const notOk = async () => ({ ok: false });
    for (const resolver of [undefined, failing, notOk, resolveWorldInfo]) {
        for (const opts of [{ signal: aborted.signal }, {}]) {
            assert.deepEqual(await createCombatStoryContext(host, { resolveWorldInfo: resolver })(opts), await oStory.createCombatStoryContext(host, { resolveWorldInfo: resolver })(opts));
        }
    }
    // 无聊天
    assert.deepEqual(await createCombatStoryContext({})(), await oStory.createCombatStoryContext({})());
});
