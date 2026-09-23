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
