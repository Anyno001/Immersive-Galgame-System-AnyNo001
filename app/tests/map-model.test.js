import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMapModel, getMapChildren, locateMapScene, readMapModel } from '../src/data/shujuku/map-model.js';
import { normalizeMapTime, resolveMapTimeBasemap } from '../src/data/shujuku/map-time.js';

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

import { hasInvalidBasemap, resolveMapBasemap, sanitizeMapBasemapUrl } from '../src/data/shujuku/map-model.js';

const baseColumns = [...columns, '地图底图'];
const brow = (id, parent, name, x, y, basemap) => [id, parent, name, x, y, '', '', '1', basemap];

test('map basemap binds only when the current level agrees on one validated url', () => {
    const url = 'https://example.com/map.webp';
    const rootRows = [brow('a', '', '甲', '.2', '.3', url), brow('b', '', '乙', '.4', '.5', url),
        brow('c', 'a', '甲内', '.5', '.5', 'https://example.com/inner.webp')];
    const map = buildMapModel([table('sheet_m', '城镇地图', rootRows, baseColumns)]).tables[0];
    // 同层两行相同地址 → 绑定
    assert.deepEqual(resolveMapBasemap(map, null), { status: 'ok', url, reason: '' });
    // 子层使用子层自己的地址，不继承父行
    assert.equal(resolveMapBasemap(map, 'sheet_m:a').url, 'https://example.com/inner.webp');
    // 冲突：同层不同地址不猜选
    const conflict = buildMapModel([table('sheet_c', '城镇地图',
        [brow('a', '', '甲', '.2', '.3', url), brow('b', '', '乙', '.4', '.5', 'https://example.com/other.webp')], baseColumns)]).tables[0];
    assert.equal(resolveMapBasemap(conflict, null).status, 'conflict');
    assert.equal(resolveMapBasemap(conflict, null).reason, '本层底图配置不一致');
    // 无字段/无值 → none，不是错误
    assert.equal(resolveMapBasemap(buildMapModel([table('sheet_n', '城镇地图', [row('a', '', '甲', '.2', '.3')])]).tables[0], null).status, 'none');
});

test('map basemap url validation rejects scripts, html, svg and oversized data urls', () => {
    assert.equal(sanitizeMapBasemapUrl('https://example.com/a.png'), 'https://example.com/a.png');
    assert.equal(sanitizeMapBasemapUrl('http://example.com/a.webp'), 'http://example.com/a.webp');
    assert.ok(sanitizeMapBasemapUrl('data:image/png;base64,AAAA').startsWith('data:image/png'));
    assert.equal(sanitizeMapBasemapUrl('javascript:alert(1)'), '');
    assert.equal(sanitizeMapBasemapUrl('data:image/svg+xml;base64,AAAA'), '');
    assert.equal(sanitizeMapBasemapUrl('data:text/html;base64,AAAA'), '');
    assert.equal(sanitizeMapBasemapUrl('file:///c:/a.png'), '');
    assert.equal(sanitizeMapBasemapUrl(''), '');
    assert.equal(sanitizeMapBasemapUrl('data:image/webp;base64,' + 'A'.repeat(12_000_001)), '');
    const invalid = buildMapModel([table('sheet_i', '城镇地图', [brow('a', '', '甲', '.2', '.3', 'javascript:alert(1)')], baseColumns)]).tables[0];
    assert.equal(hasInvalidBasemap(invalid, null), true);
    assert.equal(resolveMapBasemap(invalid, null).status, 'none');
});

test('map time variants follow igs-scene time and unknown values keep the base map', () => {
  const base = 'assets/map-demo-clean-night.png';
  assert.equal(normalizeMapTime('清晨'), 'dawn');
  assert.equal(normalizeMapTime('白天'), 'day');
  assert.equal(normalizeMapTime('傍晚'), 'dusk');
  assert.equal(normalizeMapTime('夜晚'), 'night');
  assert.equal(normalizeMapTime('深夜'), 'minight');
  assert.equal(resolveMapTimeBasemap(base, '清晨'), 'assets/map-demo-clean-dawn.png');
  assert.equal(resolveMapTimeBasemap(base, '白天'), 'assets/map-demo-clean-day.png');
  assert.equal(resolveMapTimeBasemap(base, '傍晚'), 'assets/map-demo-clean-dusk.png');
  assert.equal(resolveMapTimeBasemap(base, '夜晚'), 'assets/map-demo-clean-night.png');
  assert.equal(resolveMapTimeBasemap(base, '深夜'), 'assets/map-demo-clean-minight.png');
  assert.equal(resolveMapTimeBasemap(base, '未知时间'), base);
  assert.equal(resolveMapTimeBasemap('assets/map-demo-clean.png', '夜晚'), 'assets/map-demo-clean-night.png');
  assert.equal(resolveMapTimeBasemap('https://example.com/map.webp', '深夜'), 'https://example.com/map.webp');
});



import { buildRelationshipModel } from '../src/data/shujuku/record-model.js';

test('relationship model keeps explicit people and edges isolated by source', () => {
  const read = { ok: true, data: {
    a: { uid: 'sheet_rel_a', name: '示例关系', content: [
      ['姓名', '身份', '人物描述', '相关人员', '人物A', '人物B', '关系'],
      ['林夏', '书店常客', '<描述>', '', '', '', ''],
      ['陈屿', '旧友', '多年旧友', '', '', '', ''],
      ['', '', '', '', '林夏', '陈屿', '同学'],
      ['', '', '', '', '陈屿', '林夏', '同学'],
      ['林夏', '', '', '许宁（旧识）', '', '', ''],
    ] },
    b: { uid: 'sheet_rel_b', name: '另一关系', content: [
      ['姓名', '身份', '人物描述'],
      ['林夏', '另一来源人物', '不应与 rel_a 合并'],
    ] },
    c: { uid: 'sheet_rel_legacy', name: '旧关系', content: [
      ['名称', '关系'],
      ['商会', '<敌视>'],
    ] },
  } };
  const result = buildRelationshipModel(read);
  assert.equal(result.status, 'ready');
  assert.equal(result.people.filter(person => person.uid === 'sheet_rel_a' && person.name === '林夏').length, 2);
  assert.equal(result.people.filter(person => person.uid === 'sheet_rel_b' && person.name === '林夏').length, 1);
  assert.equal(result.edges.filter(edge => edge.uid === 'sheet_rel_a' && edge.label === '同学').length, 1);
  assert.deepEqual(result.edges.filter(edge => edge.uid === 'sheet_rel_a' && edge.label === '旧识').map(edge => [edge.from, edge.to]), [['林夏', '许宁']]);
  assert.ok(result.people.some(person => person.uid === 'sheet_rel_a' && person.name === '许宁' && person.synthetic));
  assert.equal(result.edges.some(edge => edge.uid === 'sheet_rel_legacy'), false);
  assert.ok(result.people.some(person => person.uid === 'sheet_rel_legacy' && person.name === '商会' && person.detailCells.some(cell => cell.value === '<敌视>')));
  assert.equal(result.edges.some(edge => edge.uid === 'sheet_rel_b'), false);
});

test('relationship model distinguishes empty and failed reads without inventing data', () => {
  assert.deepEqual(buildRelationshipModel({ ok: false, reason: 'offline' }), { status: 'read-error', reason: 'offline', tables: [], people: [], edges: [] });
  assert.equal(buildRelationshipModel({ ok: true, data: {
    empty: { uid: 'sheet_rel_empty', name: '空关系', content: [['姓名', '关系']] },
  } }).status, 'empty');
  assert.deepEqual(buildRelationshipModel({ ok: true, data: {} }), { status: 'no-tables', tables: [], reason: '', people: [], edges: [] });
});


test('scene place sheet uses its own schema and locates NPCs from important characters', () => {
  const data = {
    place: { uid: 'sheet_chang_jing_di_dian_biao', name: '场景地点表', content: [
      ['row_id', '地点名称', '场景描述', '上级地点ID', 'x', 'y'],
      [1, '街区', '热闹的街区', '', '', ''],
      [2, '咖啡馆', '街角小店', 1, '0.3', '0.7'],
      [3, '图书馆', '临街阅览室', 1, '0.8', '0.2'],
    ] },
    characters: { uid: 'sheet_zhong_yao_jue_se_biao', name: '重要角色表', content: [
      ['row_id', '姓名', '所在地点', '在场状态'],
      [1, '爱丽丝', '咖啡馆', '离场'],
      [2, '木下', '图书馆', '在场'],
      [3, '未知', '不存在', '在场'],
    ] },
  };
  const model = readMapModel({ ok: true, data });
  const map = model.tables[0];
  assert.deepEqual(map.missingColumns, []);
  assert.deepEqual(map.locations.map(loc => loc.characters), [[], ['爱丽丝'], ['木下']]);
  assert.equal(map.locations[1].parentId, 'sheet_chang_jing_di_dian_biao:1');
  assert.equal(map.locations[1].description, '街角小店');
  assert.deepEqual(getMapChildren(map, 'sheet_chang_jing_di_dian_biao:1').map(loc => loc.name), ['咖啡馆', '图书馆']);
  assert.equal(map.locations[1].x, 0.3);
  // Refresh reads location anew; presence is not a map-position filter.
  data.characters.content[1][2] = '图书馆';
  const refreshed = readMapModel({ ok: true, data }).tables[0];
  assert.deepEqual(refreshed.locations.map(loc => loc.characters), [[], [], ['爱丽丝', '木下']]);
  assert.deepEqual(map.locations[1].characters, ['爱丽丝']);
});

test('ambiguous place names do not claim an NPC; legacy map retains explicit character column', () => {
  const places = table('sheet_chang_jing_di_dian_biao', '场景地点表',
    [[1, '同名', '', '', '', ''], [2, '同名', '', '', '', '']],
    ['row_id', '地点名称', '场景描述', '上级地点ID', 'x', 'y']);
  const characters = table('sheet_zhong_yao_jue_se_biao', '重要角色表',
    [[1, '小明', '同名', '离场']], ['row_id', '姓名', '所在地点', '在场状态']);
  const legacy = table('sheet_old', '旧地图', [row('old', '', '旧地点', '', '', '', '老友')]);
  const model = buildMapModel([places, characters, legacy]);
  assert.deepEqual(model.tables[0].locations.map(loc => loc.characters), [[], []]);
  assert.deepEqual(model.tables[1].locations[0].characters, ['老友']);
});

test('invalid pin coordinates do not hide a character at a uniquely named place', () => {
  const places = table('sheet_chang_jing_di_dian_biao', '场景地点表',
    [[1, '咖啡馆', '', '', '2', '']], ['row_id', '地点名称', '场景描述', '上级地点ID', 'x', 'y']);
  const characters = table('sheet_zhong_yao_jue_se_biao', '重要角色表',
    [[1, '爱丽丝', '咖啡馆', '离场']], ['row_id', '姓名', '所在地点', '在场状态']);
  const location = buildMapModel([places, characters]).tables[0].locations[0];
  assert.ok(location.issues.includes('坐标未成对填写'));
  assert.deepEqual(location.characters, ['爱丽丝']);
});

test('relationship page prefers full important-character profiles over network records', () => {
  const read = { ok: true, data: {
    chars: { uid: 'sheet_zhong_yao_jue_se_biao', name: '重要角色表', content: [
      ['row_id', '姓名', '角色类型', '一句话介绍', '所在地点', '人际关系'],
      [1, '爱丽丝', '恋爱对象', '图书管理员', '图书馆', '木下:同学,邻居; 林夏:旧识'],
      [2, '木下', '家人', '咖啡馆店员', '咖啡馆', '爱丽丝:同学'],
    ] },
    networks: { uid: 'sheet_guan_xi_wang_luo_biao', name: '关系网络表', content: [
      ['row_id', '名称', '立场', '关联角色'], [1, '学生会', '友好', '爱丽丝'],
    ] },
  } };
  const selection = selectRecordTables(read, 'relationships');
  assert.deepEqual(selection.tables.map(item => item.name), ['重要角色表']);
  const model = buildRelationshipModel(read);
  assert.equal(model.status, 'ready');
  assert.equal(model.people.find(person => person.name === '爱丽丝').role, '恋爱对象');
  assert.equal(model.people.find(person => person.name === '爱丽丝').description, '图书管理员');
  assert.deepEqual(model.edges.map(edge => [edge.from, edge.to, edge.label]),
    [['爱丽丝', '木下', '同学'], ['爱丽丝', '木下', '邻居'], ['爱丽丝', '林夏', '旧识']]);
  assert.equal(model.people.some(person => person.name === '学生会'), false);
  assert.ok(model.people.some(person => person.name === '林夏' && person.synthetic));
  assert.equal(selectRecordTables({ ok: true, data: { networks: read.data.networks } }, 'relationships').status, 'no-tables');
  assert.equal(selectRecordTables({ ok: true, data: { networks: {
    ...read.data.networks, name: '学生会关系',
  } } }, 'relationships').status, 'no-tables');
  assert.equal(selectRecordTables({ ok: true, data: {
    chars: { ...read.data.chars, content: [read.data.chars.content[0]] }, networks: read.data.networks,
  } }, 'relationships').status, 'empty');
});