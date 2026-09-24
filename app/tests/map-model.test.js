import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMapModel, getMapChildren, locateMapScene, readMapModel } from '../src/data/shujuku/map-model.js';

const columns = ['地点ID', '上级地点ID', '名称', 'x', 'y', '说明', '角色', '排序'];
const row = (id, parent, name, x, y, description = '', characters = '') => [id, parent, name, x, y, description, characters, ''];
const table = (uid, name, rows, headers = columns) => ({ uid, name, columns: headers, rows });

test('map model ignores non-map tables and preserves original rows and headers', () => {
  const source = table('sheet_a', '世界地图', [row('home', '', '我家', '0.25', '0.75', '家', '小明')]);
  const result = buildMapModel([table('sheet_other', '人物', [row('x', '', '别处', 0, 0)]), source]);
  assert.equal(result.status, 'ready');
  assert.equal(result.tables.length, 1);
  assert.deepEqual(result.tables[0].columns, columns);
  assert.deepEqual(result.tables[0].rows, source.rows);
  assert.equal(result.tables[0].locations[0].id, 'sheet_a:home');
  assert.equal(result.tables[0].locations[0].x, 0.25);
  assert.deepEqual(result.tables[0].locations[0].characters, ['小明']);
});

test('map model distinguishes no matching tables and multiple independent roots', () => {
  assert.deepEqual(buildMapModel([table('sheet_people', '人物', [])]), { status: 'no-tables', tables: [] });
  const result = buildMapModel([
    table('sheet_a', '城镇地图', [row('1', '', '广场', 0, 1)]),
    table('sheet_b', '室内地图', [row('1', '', '广场', 1, 0)]),
  ]);
  assert.equal(result.tables.length, 2);
  assert.notEqual(result.tables[0].locations[0].id, result.tables[1].locations[0].id);
});

test('map hierarchy rejects orphan, duplicate and cyclic parents without synthesizing points', () => {
  const rows = [row('root', '', '我家', '.5', '.5'), row('one', 'root', '一楼', '', ''),
    row('room', 'one', '房间', '0', '1'), row('lost', 'missing', '失踪', '2', ''),
    row('duplicate', '', '同名', '', ''), row('duplicate', '', '同名', '', ''),
    row('cycle-a', 'cycle-b', '甲', '', ''), row('cycle-b', 'cycle-a', '乙', '', '')];
  const map = buildMapModel([table('sheet_home', '我家地图', rows)]).tables[0];
  assert.deepEqual(getMapChildren(map).map(location => location.name), ['我家', '失踪', '同名', '同名', '甲', '乙']);
  assert.equal(getMapChildren(map, 'sheet_home:root')[0].name, '一楼');
  assert.equal(getMapChildren(map, 'sheet_home:one')[0].name, '房间');
  assert.equal(map.locations[1].x, null);
  assert.deepEqual(map.locations[1].characters, []);
  assert.ok(map.locations[3].issues.includes('坐标超出 0–1'));
  assert.ok(map.locations[3].issues.includes('坐标未成对填写'));
  assert.ok(map.locations[3].issues.includes('上级地点不存在或不唯一'));
  assert.equal(map.locations[3].x, null);
  assert.equal(map.locations[2].x, 0);
  assert.equal(map.locations[2].y, 1);
  assert.ok(map.locations[4].issues.includes('地点ID重复'));
  assert.notEqual(map.locations[4].id, map.locations[5].id);
  assert.ok(map.locations[6].issues.includes('父级循环'));
  assert.ok(map.locations[7].issues.includes('父级循环'));
});

test('map diagnostics distinguish empty sheets, missing headers and failed reads', () => {
  assert.deepEqual(readMapModel({ ok: false, reason: 'unavailable' }),
    { status: 'read-error', reason: 'unavailable', tables: [] });
  assert.ok(buildMapModel([table('sheet_empty', '空地图', [])]).tables[0].diagnostics.includes('地图表为空'));
  const incomplete = buildMapModel([table('sheet_bad', '残缺地图', [['x']], ['名称'])]).tables[0];
  assert.ok(incomplete.missingColumns.includes('地点ID'));
  assert.ok(incomplete.locations[0].issues.includes('缺少地点ID'));
});

test('scene highlighting requires exactly one location match across map tables', () => {
  const model = buildMapModel([table('sheet_a', '甲地图', [row('a', '', '广场', '', '')]),
    table('sheet_b', '乙地图', [row('b', '', '广场', '', '')])]);
  assert.deepEqual(locateMapScene(model, '广场'), { location: null, ambiguous: true });
  assert.equal(locateMapScene(model, '不存在').location, null);
  assert.equal(locateMapScene(model, '').ambiguous, false);
});


import { selectRecordTables } from '../src/data/shujuku/record-tables.js';
import { buildRecordModel } from '../src/data/shujuku/record-model.js';

test('record selection uses name substrings, retains multiple sources and distinguishes errors', () => {
  const data = {
    a: { uid: 'sheet_a', name: '恋爱日记表', content: [['标题', '正文'], ['春日', '第一天']] },
    b: { uid: 'sheet_b', name: '旧日记', content: [['标题'], ['再见']] },
    c: { uid: 'sheet_c', name: '城镇地点', content: [['名称'], ['大街']] },
    d: { uid: 'sheet_d', name: '商会势力', content: [['名称'], ['商会']] },
    e: { uid: 'sheet_e', name: '随身物品', content: [['物品名称'], ['钥匙']] },
    other: { uid: 'sheet_other', name: '人物', content: [['名称'], ['无关']] },
  };
  const read = { ok: true, data };
  assert.deepEqual(selectRecordTables(read, 'diary').tables.map(item => item.uid), ['sheet_a', 'sheet_b']);
  assert.deepEqual(selectRecordTables(read, 'map').tables.map(item => item.uid), ['sheet_c']);
  assert.deepEqual(selectRecordTables(read, 'relationships').tables.map(item => item.uid), ['sheet_d']);
  assert.deepEqual(selectRecordTables(read, 'inventory').tables.map(item => item.uid), ['sheet_e']);
  assert.equal(selectRecordTables(read, 'invalid').status, 'invalid-category');
  assert.equal(selectRecordTables({ ok: false, reason: 'offline' }, 'diary').status, 'read-error');
  assert.equal(selectRecordTables({ ok: true, data: {} }, 'diary').status, 'no-tables');
  assert.equal(selectRecordTables({ ok: true, data: { a: { ...data.a, content: [['标题']] } } }, 'diary').status, 'empty');
  const diary = buildRecordModel(read, 'diary');
  assert.deepEqual(diary.entries.map(entry => entry.title), ['春日', '再见']);
  assert.equal(diary.entries[0].body, '第一天');
  assert.equal(diary.entries[0].date, '');
  assert.equal(diary.entries[0].source, '恋爱日记表');
  assert.equal(buildRecordModel(read, 'inventory').entries[0].title, '钥匙');
  assert.equal(buildRecordModel({ ok: true, data: { a: { ...data.a, content: [['标题'], ['']] } } }, 'diary').status, 'empty');
});

test('record model keeps independent sheet identities, diagnoses missing fields and only sorts valid dates', () => {
  const read = { ok: true, data: {
    a: { uid: 'sheet_a', name: '旅行日记', content: [['标题', '日期', '正文'], ['晚', '2024-03-02', '<script>text</script>'], ['早', '2024-03-01', '第一天']] },
    b: { uid: 'sheet_b', name: '旧日记', content: [['随笔'], ['无日期']] },
    c: { uid: 'sheet_c', name: '随身物品', content: [['不明字段'], ['钥匙']] },
    d: { uid: 'sheet_d', name: '空关系', content: [] },
  } };
  const diary = buildRecordModel(read, 'diary');
  assert.deepEqual(diary.entries.map(entry => entry.title), ['早', '晚', '无日期']);
  assert.notEqual(diary.entries[0].id, diary.entries[2].id);
  assert.equal(diary.entries[1].body, '<script>text</script>');
  assert.ok(diary.tables[1].diagnostics.some(item => item.includes('字段不足')));
  const inventory = buildRecordModel(read, 'inventory');
  assert.equal(inventory.status, 'insufficient-fields');
  assert.equal(inventory.entries[0].title, '钥匙');
  assert.ok(inventory.tables[0].diagnostics.some(item => item.includes('字段不足')));
  assert.equal(buildRecordModel(read, 'relationships').status, 'empty');
  assert.equal(buildRecordModel({ ok: false, reason: 'offline' }, 'diary').status, 'read-error');
});

test('place sheets without coordinate schema remain readable as list, never invented pins', () => {
  const result = buildMapModel([table('sheet_place', '城镇地点', [['', '广场']], ['序号', '名称'])]);
  assert.equal(result.status, 'ready');
  assert.ok(result.tables[0].missingColumns.includes('x'));
  assert.equal(result.tables[0].locations[0].name, '广场');
  assert.equal(result.tables[0].locations[0].x, null);
});
