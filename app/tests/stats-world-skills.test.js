import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialState, buildSummary, normalizeBuild, specialCandidates, validCustomSkillName } from '../src/scene/stats/stat-build.js';
import { worldSkillNames } from '../src/scene/stats/stat-world-skills.js';
import { matchSkill } from '../src/scene/stats/stat-skill-match.js';
import { renderStatsBuildFields } from '../src/visual/igs-ui/stats-settings-fields.js';
import { checkbox } from '../src/visual/igs-ui/settings-fields.js';
import { DEFAULT_SPECIAL_SKILLS } from '../src/scene/stats/stat-state.js';

test('世界观候选：现代不追加；魔法追加咒语等且默认不选；默认 3 项不变', () => {
    assert.deepEqual(worldSkillNames('modern'), []);
    assert.equal(specialCandidates(undefined).length, 8);
    const c = specialCandidates(undefined, { worldview: 'magic' });
    assert.ok(c.includes('咒语') && c.includes('魔药'));
    assert.deepEqual(buildSummary(undefined, { worldview: 'magic' }).picked, ['烹饪', '家务', '学习']);
});

test('选世界观技能建卡：只在该世界观下计入；切换世界观后选择保留', () => {
    const build = { special: { 烹饪: false, 咒语: true } };
    const r = buildInitialState(build, { worldview: 'magic' });
    assert.equal(r.ok, true);
    assert.equal(r.state.protagonist.skills.咒语.value, 50);
    assert.equal(normalizeBuild(build).special.咒语, true);
    assert.deepEqual(buildSummary(build).picked, ['家务', '学习']);
    assert.equal(matchSkill('我念咒', { skills: Object.keys(r.state.protagonist.skills) }).skill, '咒语');
    assert.equal(matchSkill('我念咒').skill, null);
});

test('自定义技能：名字校验、去重；选中后写进存档；按技能名触发检定', () => {
    assert.equal(validCustomSkillName(' 钓鱼 '), '钓鱼');
    for (const bad of ['', '健康', '烹饪', 'a.b', '射击3', '__proto__', '一二三四五六七八九']) assert.equal(validCustomSkillName(bad), null, bad);
    const b = normalizeBuild({ custom: ['钓鱼', '钓鱼', '健康'], special: { 钓鱼: true, 烹饪: false } });
    assert.deepEqual(b.custom, ['钓鱼']);
    const r = buildInitialState(b);
    assert.equal(r.ok, true);
    assert.equal(r.state.protagonist.skills.钓鱼.value, 50);
    assert.equal(matchSkill('我去河边钓鱼', { skills: Object.keys(r.state.protagonist.skills) }).skill, '钓鱼');
    assert.equal(matchSkill('我去河边钓鱼').skill, null);
});

test('建卡区渲染：技能选择沿用原有开关样式（默认 8 项与 v0.36.117 逐字一致，附加技能无附注）；自定义技能在下方单独一行增删', () => {
    const original = `<div class="igs-settings-section">${DEFAULT_SPECIAL_SKILLS.map((name, i) => checkbox(`bridge.stats.build.special.${name}`, i < 3, name)).join('')}</div>`;
    assert.ok(renderStatsBuildFields(undefined).includes(original));
    const html = renderStatsBuildFields({ custom: ['钓鱼'] }, () => '', { worldview: 'magic' });
    assert.match(html, /data-stats-worldview="magic"/);
    assert.match(html, /data-switch="bridge\.stats\.build\.special\.咒语" aria-pressed="false"><i><\/i><span>咒语<\/span><\/button>/);
    assert.match(html, /data-switch="bridge\.stats\.build\.special\.钓鱼" aria-pressed="false"><i><\/i><span>钓鱼<\/span><\/button>/);
    assert.doesNotMatch(html, /本世界|自定义）|igs-switch-note|igs-stats-custom-skill/);
    // 自定义技能只在上方开关列表出现一次；下方一行只有增删按钮，整行居中。
    assert.equal(html.split('>钓鱼<').length - 1, 1);
    assert.doesNotMatch(html, /igs-mood-word-tag/);
    assert.match(html, /class="igs-settings-field igs-stats-custom-row"/);
    assert.match(html, /data-action="stats-build-remove-skill"/);
    assert.match(html, /data-action="stats-build-add-skill"/);
});

test('设置页新增与删除自定义技能：写入草稿、默认不选，删除后清掉选择', async () => {
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
        assert.equal(build().special.钓鱼, false);
        controller.toggle('bridge.stats.build.special.钓鱼');
        assert.equal(build().special.钓鱼, true);
        await controller.invoke('stats-build-remove-skill');
        assert.deepEqual(build().custom, []);
        assert.equal(Object.hasOwn(build().special, '钓鱼'), false);
        assert.notEqual(controller.close().ok, false);
    } finally {
        vn.destroy?.();
    }
});
