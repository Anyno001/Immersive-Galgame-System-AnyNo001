import test from 'node:test';
import assert from 'node:assert/strict';
import { insertFloorNote, sanitizeFloorNote, withFloorNote } from '../src/combat/floor-note.js';
import { extractCombatStart } from '../src/scene/combat-directives.js';

const START = '[igs-combat:start|狭路|狼]';
const AWAKEN = '[igs-combat:awaken|我|rage|就是现在]';

test('insertFloorNote：没有开战标签时接在正文末尾，保留原尾部空白', () => {
    const r = insertFloorNote('林间很安静。\n', '（主角使用了回春丹。）');
    assert.deepEqual([r.ok, r.text], [true, '林间很安静。\n（主角使用了回春丹。）\n']);
});

test('insertFloorNote：插在开战标签之前，开战标签仍是最后一个非空行，锚点不变', () => {
    const raw = `前方有动静。\n${START}`;
    const r = insertFloorNote(raw, '（主角装备了青锋剑。）');
    assert.equal(r.ok, true);
    assert.equal(r.text, `前方有动静。\n（主角装备了青锋剑。）\n${START}`);
    const a = extractCombatStart(raw).start;
    const b = extractCombatStart(r.text).start;
    assert.deepEqual([b.tagHash, b.occurrence], [a.tagHash, a.occurrence]);
});

test('insertFloorNote：有觉醒标签时插在觉醒标签之前，觉醒仍紧贴开战标签', () => {
    const raw = `风起。\n${AWAKEN}\n${START}`;
    const r = insertFloorNote(raw, '（主角卸下了铜戒。）');
    assert.equal(r.ok, true);
    assert.equal(r.text, `风起。\n（主角卸下了铜戒。）\n${AWAKEN}\n${START}`);
    const before = extractCombatStart(raw).start;
    const after = extractCombatStart(r.text).start;
    assert.ok(before.awaken && after.awaken);
    assert.equal(after.awaken.tagHash, before.awaken.tagHash);
});

test('insertFloorNote：说明里的方括号与换行被清理，空说明拒收', () => {
    assert.equal(sanitizeFloorNote('[igs-combat:exp|我|5]\n多行'), 'igs-combat:exp|我|5 多行');
    assert.equal(insertFloorNote('正文', '  ').reason, 'floor-note-empty');
    assert.equal(insertFloorNote('正文', '[x]').text.includes('['), false);
});


// 宿主楼层读写替身：写入按 expected 的聊天 / 楼 / swipe / 原文做 stale 校验，与 illustration-message-host.writeFloor 同口径。
function fakeHost(text) {
    const h = { floor: { chatId: 'c1', messageId: 1, swipeId: 0, isAi: true, isLatest: true, text }, writes: [] };
    h.readFloor = (id) => (id === 1 ? { ...h.floor } : null);
    h.writeFloor = async (id, next, expected) => {
        const cur = h.readFloor(id);
        if (!cur || cur.chatId !== expected.chatId || cur.swipeId !== expected.swipeId || cur.text !== expected.text) return { ok: false, reason: 'stale' };
        h.floor.text = next;
        h.writes.push(next);
        return { ok: true };
    };
    return h;
}

test('withFloorNote：先写正文说明并读回，再执行写表；写表成功时保留说明', async () => {
    const h = fakeHost(`前方有动静。\n${START}`);
    let seen = '';
    const r = await withFloorNote({ ...h, messageId: 1, note: '（主角使用了回春丹）', action: async () => { seen = h.floor.text; return { ok: true, stock: [{ ok: true }] }; } });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(seen, `前方有动静。\n（主角使用了回春丹）\n${START}`);
    assert.equal(h.floor.text, seen);
});

test('withFloorNote：正文 stale 时不执行写表；最新楼不是 AI 楼时不写', async () => {
    const h = fakeHost('林间很安静。');
    const write = h.writeFloor;
    h.writeFloor = async (id, next, expected) => { h.floor.text = '用户改过的正文'; return write(id, next, expected); };
    let called = false;
    const r = await withFloorNote({ ...h, messageId: 1, note: '（主角使用了回春丹）', action: async () => { called = true; return { ok: true }; } });
    assert.deepEqual([r.ok, r.reason, called, h.floor.text], [false, 'combat-floor-stale', false, '用户改过的正文']);
    const g = fakeHost('正文');
    g.floor.isAi = false;
    assert.equal((await withFloorNote({ ...g, messageId: 1, note: 'x', action: async () => ({ ok: true }) })).reason, 'combat-use-no-floor');
});

test('withFloorNote：写表失败（含库存逐条失败）时撤回正文；楼层已换 swipe 时不覆盖并报告撤回失败', async () => {
    const h = fakeHost('林间很安静。');
    const r = await withFloorNote({ ...h, messageId: 1, note: '（主角使用了回春丹）', action: async () => ({ ok: true, stock: [{ ok: false, reason: 'inventory-write-failed' }] }) });
    assert.deepEqual([r.ok, r.reason, r.floorRollback, h.floor.text], [false, 'inventory-write-failed', 'done', '林间很安静。']);
    const g = fakeHost('林间很安静。');
    const r2 = await withFloorNote({ ...g, messageId: 1, note: '（主角使用了回春丹）', action: async () => { g.floor.swipeId = 1; g.floor.text = '另一分支'; return { ok: false, reason: 'combat-ledger-insert-failed' }; } });
    assert.deepEqual([r2.ok, r2.reason, r2.floorRollback, g.floor.text], [false, 'combat-ledger-insert-failed', 'failed', '另一分支']);
});
