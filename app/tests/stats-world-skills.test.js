import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialState, buildSummary, normalizeBuild, pickCandidates, validCustomSkillName } from '../src/scene/stats/stat-build.js';
import { worldSkillNames } from '../src/scene/stats/stat-world-skills.js';
import { matchSkill } from '../src/scene/stats/stat-skill-match.js';
import { renderStatsBuildFields } from '../src/visual/igs-ui/stats-settings-fields.js';
import { DEFAULT_SPECIAL_SKILLS } from '../src/scene/stats/stat-state.js';

test('世界观技能另外算：不进 3+5 下拉候选，建卡默认技能不变', () => {
    assert.deepEqual(worldSkillNames('modern'), []);
    assert.ok(worldSkillNames('magic').includes('咒语'));
    const c = pickCandidates(undefined);
    assert.deepEqual(c.slice(0, 8), [...DEFAULT_SPECIAL_SKILLS]);
    assert.equal(c.includes('咒语'), false);
    assert.deepEqual(buildSummary(undefined).picked.slice(0, 3), ['烹饪', '家务', '学习']);
});

test('自定义技能：名字校验、去重；选进格子后写进存档；按技能名触发检定', () => {
    assert.equal(validCustomSkillName(' 钓鱼 '), '钓鱼');
    for (const bad of ['', '体质', '烹饪', 'a.b', '射击3', '__proto__', '一二三四五六七八九']) assert.equal(validCustomSkillName(bad), null, bad);
    const b = normalizeBuild({ custom: ['钓鱼', '钓鱼', '体质'], picks: { strong1: '钓鱼', strong2: '家务', strong3: '学习' } });
    assert.deepEqual(b.custom, ['钓鱼']);
    assert.ok(pickCandidates(b).includes('钓鱼'));
    const r = buildInitialState(b);
    assert.equal(r.ok, true);
    assert.equal(r.state.protagonist.skills.钓鱼.value, 60);
    assert.equal(matchSkill('我去河边钓鱼', { skills: Object.keys(r.state.protagonist.skills) }).skill, '钓鱼');
    assert.equal(matchSkill('我去河边钓鱼').skill, null);
});

test('建卡区渲染：擅长 3 格、比较擅长 5 格下拉；提示按骰子分开写；自定义技能在下方单独一行增删', () => {
    const html = renderStatsBuildFields({ custom: ['钓鱼'] }, () => '', { worldview: 'magic' });
    assert.match(html, /data-stats-worldview="magic"/);
    for (const slot of ['strong1', 'strong3', 'good1', 'good5']) assert.match(html, new RegExp(`<select data-path="bridge\\.stats\\.build\\.picks\\.${slot}"`));
    assert.match(html, /<span>擅长一<\/span>/);
    assert.match(html, /<span>比较擅长五<\/span>/);
    assert.match(html, /<option value="钓鱼">钓鱼<\/option>/);
    assert.doesNotMatch(html, /<option value="咒语">/);
    assert.match(html, /擅长技能60起步/);
    assert.match(renderStatsBuildFields(undefined, () => '', { ruleset: 'dnd5e' }), /全额熟练加值/);
    assert.match(html, /class="igs-settings-field igs-stats-custom-row"/);
    assert.match(html, /data-action="stats-build-remove-skill"/);
    assert.match(html, /data-action="stats-build-add-skill"/);
});

test('设置页新增与删除自定义技能：写入草稿；删除后清掉占用它的格子', async () => {
    const { bootstrapIGS } = await import('../src/index.js');
    const answers = ['钓鱼', '钓鱼'];
    const global = { prompt: () => answers.shift() ?? '', confirm: () => true };
    const vn = bootstrapIGS({ global, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'reader', mode: 'pc' }).controller;
        const build = () => normalizeBuild(controller.getSnapshot().draft.bridge.stats.build);
        const added = await controller.invoke('stats-build-add-skill');
        assert.notEqual(added && added.ok, false);
        assert.deepEqual(build().custom, ['钓鱼']);
        assert.equal(Object.values(build().picks).includes('钓鱼'), false);
        controller.getSnapshot().draft.bridge.stats.build = { ...build(), picks: { ...build().picks, good5: '钓鱼' } };
        await controller.invoke('stats-build-remove-skill');
        assert.deepEqual(build().custom, []);
        assert.equal(Object.values(build().picks).includes('钓鱼'), false);
        assert.notEqual(controller.close().ok, false);
    } finally {
        vn.destroy?.();
    }
});
