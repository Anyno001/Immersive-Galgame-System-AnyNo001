import test from 'node:test';
import assert from 'node:assert/strict';
import { createShujukuClient } from '../src/data/shujuku/client.js';
import { describeStatMappings, mappingKey, pushStats } from '../src/data/shujuku/stats-push.js';
import { normalizeStatsSettings } from '../src/scene/stats/stat-settings.js';
import { createCharacter, createStatsState } from '../src/scene/stats/stat-state.js';
import { renderStatsMappingFields } from '../src/visual/igs-ui/stats-settings-fields.js';
import { normalizeSettingsValue } from '../src/visual/igs-ui/settings-normalize.js';

function raw() {
    return { v: { uid: 'sheet_v', name: '角色.数值表', content: [['角色姓名', '好感度', '信任度'], ['小雪', '20%', '0%']], orderNo: 1 } };
}

function fakeApi(data) {
    const calls = [];
    return {
        calls,
        exportTableAsJson: () => data,
        updateCell(t, i, c, v) { calls.push({ c, v }); const s = Object.values(data).find((x) => x.name === t); s.content[i][s.content[0].indexOf(c)] = v; return true; },
        refreshDataAndWorldbook() {},
    };
}

function stateWith(dims) {
    const s = createStatsState();
    const c = createCharacter(1);
    return { ...s, characters: { 小雪: { ...c, dims: { ...c.dims, ...dims } } } };
}

test('映射键对表名里的「.」编码，可安全放进设置路径；映射覆盖设置只收合法指纹与取值', () => {
    const key = mappingKey('角色.数值表', '好感度');
    assert.doesNotMatch(key, /\./);
    assert.equal(decodeURIComponent(key), '角色.数值表|好感度');
    const s = normalizeStatsSettings({ push: { mappings: { 'tpl-1a2b': { [key]: 'skip', bad: 'delete' }, 'tpl-ffff': {}, 'not-a-fp': { x: 'skip' } } } });
    assert.deepEqual(s.push.mappings, { 'tpl-1a2b': { [key]: 'skip' }, 'tpl-ffff': {} });
    assert.deepEqual(normalizeStatsSettings(null).push.mappings, {});
    assert.equal(normalizeSettingsValue(`bridge.stats.push.mappings.tpl-1a2b.${key}`, 'skip'), 'skip');
});

test('映射页数据：列出自动识别结果与当前覆盖值、区分新模板；读失败单独报告（§8B、F7）', () => {
    const read = createShujukuClient(fakeApi(raw())).readTables();
    const fresh = describeStatMappings(read, {});
    assert.equal(fresh.ok, true);
    assert.equal(fresh.known, false);
    const favor = fresh.rows.find((r) => r.column === '好感度');
    assert.deepEqual([favor.value, favor.stageAllowed, favor.form], ['auto', true, 'number']);
    assert.equal(fresh.rows.find((r) => r.column === '信任度').stageAllowed, false);
    const known = describeStatMappings(read, { [fresh.fingerprint]: { [favor.key]: 'skip' } });
    assert.equal(known.known, true);
    assert.equal(known.rows.find((r) => r.column === '好感度').value, 'skip');
    assert.equal(describeStatMappings({ ok: false, reason: 'missing-api' }).reason, 'stats-push-read-failed');
});

test('推送按当前模板指纹取覆盖：不推送的列不写、改成阶段名的好感列写阶段名', async () => {
    const data = raw();
    const api = fakeApi(data);
    const fp = describeStatMappings(createShujukuClient(api).readTables()).fingerprint;
    const overridesByFingerprint = { [fp]: { [mappingKey('角色.数值表', '信任度')]: 'skip', [mappingKey('角色.数值表', '好感度')]: 'stage' } };
    const r = await pushStats(createShujukuClient(api), stateWith({ 好感: 34, 信任: -20 }), { overridesByFingerprint });
    assert.equal(r.ok, true);
    assert.deepEqual(data.v.content[1], ['小雪', '明确喜欢', '0%']);
    assert.ok(api.calls.every((c) => c.c !== '信任度'));
    const other = fakeApi(raw());
    await pushStats(createShujukuClient(other), stateWith({ 好感: 34 }), { overridesByFingerprint: { 'tpl-0': { [mappingKey('角色.数值表', '好感度')]: 'skip' } } });
    assert.ok(other.calls.some((c) => c.c === '好感度' && c.v === '34%'));
});

test('映射页渲染：同步关闭时不显示；新模板有确认按钮；好感可选阶段名、信任不可；读失败与无插件各一行说明', () => {
    const read = createShujukuClient(fakeApi(raw())).readTables();
    const described = describeStatMappings(read, {});
    assert.equal(renderStatsMappingFields(described, () => '', { pushEnabled: false }), '');
    const html = renderStatsMappingFields(described, () => '', { pushEnabled: true });
    assert.match(html, /<details[^>]*data-advanced="stats-mappings">/);
    assert.match(html, new RegExp(`data-action="stats-mapping-confirm:${described.fingerprint}"`));
    const favorKey = mappingKey('角色.数值表', '好感度');
    const trustKey = mappingKey('角色.数值表', '信任度');
    assert.match(html, new RegExp(`data-path="bridge\\.stats\\.push\\.mappings\\.${described.fingerprint}\\.${favorKey}"[^>]*>(?:(?!</select>).)*value="stage"`));
    assert.doesNotMatch(html, new RegExp(`data-path="bridge\\.stats\\.push\\.mappings\\.${described.fingerprint}\\.${trustKey}"[^>]*>(?:(?!</select>).)*value="stage"`));
    const known = renderStatsMappingFields(describeStatMappings(read, { [described.fingerprint]: {} }), () => '', { pushEnabled: true });
    assert.doesNotMatch(known, /stats-mapping-confirm/);
    assert.match(renderStatsMappingFields({ ok: false, reason: 'x', detail: '<坏>' }, () => '', { pushEnabled: true }), /读取表格失败（&lt;坏&gt;）/);
    assert.match(renderStatsMappingFields(null, () => '', { pushEnabled: true }), /没有检测到数据库插件/);
});
