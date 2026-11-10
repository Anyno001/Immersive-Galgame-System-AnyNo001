import test from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_DEFS, STATUS_EFFECT, subInWorlds, WORLD_GENRES } from '../src/scene/stats/stat-status-defs.js';
import { STATUS_TAG_LINE, applyStatusChange, advanceStatuses } from '../src/scene/stats/stat-status.js';
import { autoStatuses, statusScale } from '../src/scene/stats/stat-status-auto.js';
import { createStatsState } from '../src/scene/stats/stat-state.js';
import { buildReviewPrompt, parseReviewWorlds } from '../src/core/trait-review.js';
import { sanitizeCatalog, emptyCatalog } from '../src/scene/stats/stat-persist.js';

const names = (d) => new Set(STATUS_DEFS.map((x) => x.name));
test('E1 状态全集与效果', () => {
    for (const n of ['感冒', '宿醉', '醉酒', '失眠', '受惊', '失恋期', '热恋期', '冷战中', '吃醋中', '心情很好', '赶工期', '手头紧', '身体不适', '中毒', '透支', '受祝福', '走火入魔', '闭关中', '渡劫', '被控制', '感染初期', '犯瘾', '信物']) {
        assert.ok(names().has(n), n);
        assert.ok(STATUS_EFFECT[n], `效果 ${n}`);
    }
    assert.equal(new Set(STATUS_DEFS.map((d) => d.name)).size, STATUS_DEFS.length);
    const cat = applyStatusChange({}, '主角', '受惊', { src: 'story', day: 1 }).catalog;
    assert.equal(statusScale(cat, '主角', 'stressUp'), 1.5);
    assert.equal(statusScale(cat, '主角', 'staminaRecover'), 1);
});
test('E1 自动挂：醉酒→宿醉、手头紧、心情很好、信物', () => {
    const state = createStatsState({ day: 3, money: 5 });
    const box = { cat: {} };
    autoStatuses(state, box, { day: 3, narration: '他喝醉了。', directives: [], changes: [] });
    assert.ok(box.cat.statuses['主角'].醉酒 && box.cat.statuses['主角'].手头紧);
    assert.equal(box.cat.statuses['主角'].醉酒.src, 'system');
    autoStatuses(state, box, { day: 4, narration: '', directives: [], changes: [] });
    assert.ok(!box.cat.statuses['主角'].醉酒 && box.cat.statuses['主角'].宿醉);
    const st2 = { ...state, characters: { 小雪: { bars: { stress: 10 }, dims: {} } } };
    const b2 = { cat: {} };
    autoStatuses(st2, b2, { day: 3, narration: '', directives: [{ kind: 'gift', target: '小雪', value: '银戒指' }, { kind: 'event', target: '小雪', value: '约会' }], changes: [] });
    assert.equal(b2.cat.statuses['小雪'].信物.toward, '主角');
    assert.ok(b2.cat.statuses['小雪'].心情很好);
});
test('E5 世界观过滤与提示词', () => {
    assert.ok(subInWorlds('', ['修仙']));
    assert.ok(subInWorlds('西幻', []));
    assert.ok(!subInWorlds('西幻', ['修仙']));
    assert.ok(subInWorlds('修仙/西幻', ['西幻']));
    assert.ok(!STATUS_TAG_LINE(['修仙']).includes('受祝福'));
    assert.ok(STATUS_TAG_LINE(['修仙']).includes('渡劫'));
    assert.ok(STATUS_TAG_LINE().includes('渡劫'));
    const p = buildReviewPrompt({ nsfw: false, chars: [], floors: [], summary: [] }, [], 'story', [], null, WORLD_GENRES);
    assert.ok(p.includes('"worlds"') && p.includes('worlds 写世界书'));
    assert.deepEqual(parseReviewWorlds('{"results":[],"worlds":["修仙","乱写","修仙"]}', WORLD_GENRES), ['修仙']);
    assert.equal(parseReviewWorlds('{"results":[]}', WORLD_GENRES), null);
    const cat = sanitizeCatalog({ ...emptyCatalog(), worlds: ['修仙', 'x'], worldsManual: ['西幻'] });
    assert.deepEqual(cat.worlds, ['修仙']);
    assert.deepEqual(cat.worldsManual, ['西幻']);
});
