import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMoodReclassification, buildMoodReclassifyRequest } from '../src/scene/mood-classify.js';

const groups = [
    { label: '开心', words: ['高兴', '点头', '愉快'] },
    { label: '难过', words: ['伤心', '（叹气）', '开心'] },
];

test('gate:mood-reclassify:moves-removes-and-keeps-missing', () => {
    const raw = '说明\n{"assignments":[{"word":"愉快","group":"开心"},{"word":"伤心","group":"难过"},{"word":"高兴","group":"难过"},{"word":"新词","group":"开心"},{"word":"伤心","group":"不存在"}],"removed":["点头","（叹气）","开心","陌生"]}';
    const out = applyMoodReclassification(groups, raw);
    assert.deepEqual(out.removed, ['点头', '（叹气）'], '只剔除库里有的词；组名本身不剔除');
    assert.equal(out.moved, 1);
    assert.deepEqual(out.groups.find((g) => g.label === '开心').words, ['愉快']);
    assert.deepEqual(out.groups.find((g) => g.label === '难过').words, ['高兴', '伤心', '开心'], '漏掉的词留在原组');
    assert.deepEqual(groups[0].words, ['高兴', '点头', '愉快'], '不改输入');
});

test('gate:mood-reclassify:rejects-garbage-and-builds-request', () => {
    assert.throws(() => applyMoodReclassification(groups, 'not json'));
    assert.throws(() => applyMoodReclassification(groups, '{"foo":1}'));
    const req = buildMoodReclassifyRequest(groups);
    assert.match(req.system, /剔除/);
    assert.deepEqual(JSON.parse(req.user).groups.map((g) => g.label), ['开心', '难过']);
});
