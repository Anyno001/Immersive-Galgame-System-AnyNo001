import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFavorOverviewModel } from '../src/data/shujuku/favor-overview-model.js';
import { createRecordPanelController } from '../src/visual/igs-ui/record-panel.js';

const FAVOR_TABLE = { uid: 'sheet_favor', name: '角色好感信任表', content: [
    ['row_id', '角色姓名', '好感度', '信任度', '已知秘密'],
    [1, '林夏', '35%', '60%', '她会弹琴'],
    [2, '陈屿', '72%', '40%', ''],
    [3, '<b>x', '10/100', '', ''],
] };
const OTHER_TABLE = { uid: 'sheet_other', name: '其他数值表', content: [['row_id', '姓名', '好感'], [1, '路人', '99%']] };
const DATA = { sheet_favor: FAVOR_TABLE, sheet_other: OTHER_TABLE };
const PICK = [{ uid: 'sheet_favor', name: '角色好感信任表' }];

test('favor-overview:no-selected-table-reports-no-selection', () => {
    assert.equal(buildFavorOverviewModel({ ok: true, data: DATA }, []).status, 'no-selection');
});

test('favor-overview:reads-only-user-selected-tables-and-favor-columns', () => {
    const model = buildFavorOverviewModel({ ok: true, data: DATA }, PICK);
    assert.equal(model.status, 'ready');
    assert.deepEqual(model.tables, [{ uid: 'sheet_favor', name: '角色好感信任表' }]);
    assert.deepEqual(model.people.map(person => person.name), ['林夏', '陈屿', '<b>x']);
    assert.ok(!model.people.some(person => person.name === '路人'), '未选的表不读');
    for (const person of model.people) assert.deepEqual(person.metrics.map(metric => metric.label), ['好感度']);
    assert.equal(model.people[1].metrics[0].percent, 72);
});

test('favor-overview:read-error-missing-table-and-no-favor-columns-are-distinct', () => {
    assert.equal(buildFavorOverviewModel({ ok: false, reason: 'missing-api' }, PICK).status, 'read-error');
    assert.equal(buildFavorOverviewModel({ ok: true, data: { sheet_other: OTHER_TABLE } }, PICK).status, 'no-tables');
    const noFavor = { sheet_t: { uid: 'sheet_t', name: '信任表', content: [['row_id', '姓名', '信任度'], [1, '林夏', '50%']] } };
    assert.equal(buildFavorOverviewModel({ ok: true, data: noFavor }, [{ uid: 'sheet_t', name: '信任表' }]).status, 'empty');
});

function fakeElement(doc, tag) {
    const attrs = new Map();
    const el = {
        tagName: String(tag).toUpperCase(), ownerDocument: doc, children: [], parentNode: null,
        innerHTML: '', id: '', scrollTop: 0,
        style: { setProperty(k, v) { this[k] = String(v); }, removeProperty(k) { this[k] = ''; } },
        classList: { toggle() {}, remove() {}, add() {}, contains() { return false; } },
        setAttribute(k, v) { attrs.set(k, String(v)); if (k === 'id') el.id = String(v); },
        getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; },
        removeAttribute(k) { attrs.delete(k); },
        addEventListener() {}, removeEventListener() {},
        appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
        remove() { if (el.parentNode) el.parentNode.children = el.parentNode.children.filter(c => c !== el); el.parentNode = null; },
        contains(node) { return node === el || el.children.some(c => c.contains && c.contains(node)); },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        getBoundingClientRect() { return { width: 1280, height: 800 }; },
        focus() {},
    };
    return el;
}

function openFavor(readerSettings) {
    const doc = { activeElement: null, defaultView: null };
    doc.createElement = tag => fakeElement(doc, tag);
    const overlay = doc.createElement('div');
    const api = { exportTableAsJson: () => DATA, registerTableUpdateCallback() {}, unregisterTableUpdateCallback() {} };
    const panel = createRecordPanelController(doc, { AutoCardUpdaterAPI: api }, null);
    assert.equal(panel.open(overlay, readerSettings, 'favor').ok, true);
    return { panel, root: overlay.children.find(c => c.id === 'igs-record-panel') };
}

test('favor-overview:panel-lists-everyone-sorted-escaped-with-theme-switch', () => {
    const { panel, root } = openFavor({ statusHud: { tables: PICK } });
    const html = root.innerHTML;
    assert.match(html, /好感总览/);
    assert.ok(html.indexOf('陈屿') < html.indexOf('林夏'), '好感高的在前');
    assert.match(html, /&lt;b&gt;x/);
    assert.doesNotMatch(html, /<b>x/);
    assert.doesNotMatch(html, /信任度/);
    assert.match(html, /igs-rp-theme-switch/);
    assert.equal(root.getAttribute('data-record-category'), 'favor');
    panel.close();
});

test('favor-overview:panel-without-selected-table-shows-guidance', () => {
    const { panel, root } = openFavor({ statusHud: { tables: [] } });
    assert.match(root.innerHTML, /状态栏还没有选择读取表格/);
    assert.doesNotMatch(root.innerHTML, /igs-record-favor-row/);
    panel.close();
});
