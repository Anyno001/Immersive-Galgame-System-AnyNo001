import test from 'node:test';
import assert from 'node:assert/strict';
import { editCharacterCreature, renderCharacterCreatureMenuItem, renderCharacterCreatureRows, renderCharacterCreatureTag } from '../src/visual/igs-ui/creature-settings.js';
import { renderCharacterAssetList } from '../src/visual/igs-ui/settings-fields.js';
import { normalizeCharacterDna } from '../src/scene/character-dna.js';

const frozenDna = () => Object.freeze({ ...normalizeCharacterDna({ identity: 'fox girl' }), views: Object.freeze({ portrait: { subject: 'a', negative: 'b' } }) });

test('开关开：写入规范化的 creature 档案', () => {
    const raw = frozenDna();
    const next = editCharacterCreature(raw, 'enabled', 'true');
    assert.deepEqual(next.creature, { form: 'beast', size: 'medium', anchor: 'ground', temp: false, group: false, canvas: 'portrait', tiers: 'four' });
    assert.equal('creature' in raw, false);
    assert.equal(next.identity, 'fox girl');
});

test('形态/体型/落地/画布/差分改动生效并归一化', () => {
    let dna = editCharacterCreature(frozenDna(), 'enabled', 'true');
    dna = editCharacterCreature(dna, 'form', 'humanoid');
    assert.equal(dna.creature.form, 'humanoid');
    assert.equal(dna.creature.tiers, 'full');
    dna = editCharacterCreature(dna, 'tiers', 'four');
    dna = editCharacterCreature(dna, 'size', 'giant');
    dna = editCharacterCreature(dna, 'anchor', 'float');
    dna = editCharacterCreature(dna, 'canvas', 'landscape');
    assert.deepEqual(dna.creature, { form: 'humanoid', size: 'giant', anchor: 'float', temp: false, group: false, canvas: 'landscape', tiers: 'four' });
    assert.equal(editCharacterCreature(dna, 'size', '乱写').creature.size, 'medium');
    assert.equal(editCharacterCreature(frozenDna(), 'size', 'giant'), null);
});

test('开关关：移除 creature，其余字段原样保留', () => {
    const base = frozenDna();
    const on = editCharacterCreature(base, 'enabled', 'true');
    const off = editCharacterCreature(on, 'enabled', 'false');
    assert.equal('creature' in off, false);
    assert.deepEqual(off, { ...base });
    assert.equal(off.views, base.views);
});

test('人类角色未开开关：不出现 creature 键', () => {
    const raw = frozenDna();
    assert.equal(editCharacterCreature(raw, 'enabled', 'false'), raw);
    assert.equal(editCharacterCreature(null, 'enabled', 'false'), null);
    assert.equal('creature' in normalizeCharacterDna({ identity: 'x' }), false);
});

test('⋯ 菜单开关与设定面板：未启用只有菜单项，半人形才有差分', () => {
    const off = frozenDna();
    assert.match(renderCharacterCreatureMenuItem('狐', off), /data-action="char-creature:enabled:%E7%8B%90:true"[^>]*>设为非人角色</);
    assert.equal(renderCharacterCreatureRows('狐', off), '');
    assert.equal(renderCharacterCreatureTag(off), '');
    const beast = editCharacterCreature(frozenDna(), 'enabled', 'true');
    assert.match(renderCharacterCreatureMenuItem('狐', beast), /char-creature:enabled:%E7%8B%90:false"[^>]*>取消非人角色</);
    assert.match(renderCharacterCreatureRows('狐', beast), /data-creature-field="form"/);
    assert.doesNotMatch(renderCharacterCreatureRows('狐', beast), /data-creature-field="tiers"/);
    assert.match(renderCharacterCreatureTag(beast), />非人</);
    const half = editCharacterCreature(beast, 'form', 'humanoid');
    assert.match(renderCharacterCreatureRows('狐', half), /data-creature-field="tiers"/);
});

test('角色立绘区不再有非人折叠项，入口在 ⋯ 菜单，档案在角色设定', () => {
    const base = { characterDna: { 狐: editCharacterCreature(frozenDna(), 'enabled', 'true') }, spriteHeight: null };
    const closed = renderCharacterAssetList({ 狐: { 默认: 'x.png' } }, { ...base, isOpen: (key) => key === 'char-open:狐' });
    assert.doesNotMatch(closed, /data-advanced="char-creature:/);
    assert.match(closed, /取消非人角色/);
    assert.match(closed, /igs-char-user-tag[^>]*>非人</);
    assert.doesNotMatch(closed, /data-creature-field="form"/);
    const setup = renderCharacterAssetList({ 狐: { 默认: 'x.png' } }, { ...base, isOpen: (key) => key === 'char-dna:狐' });
    assert.match(setup, /igs-char-dna-panel[\s\S]*data-creature-field="form"/);
});

test('⋯ 菜单设为非人角色：写入档案并展开角色设定，取消后移除', async () => {
    const { bootstrapIGS } = await import('../src/index.js');
    const global = { prompt: () => '', confirm: () => true };
    const vn = bootstrapIGS({ global, autoAttachMagicWand: false, hostAdapter: { getCurrentMessage: async () => null, typeAndSend: async () => ({ ok: true }) } });
    try {
        const controller = vn.openSettings({ tab: 'reader', mode: 'pc' }).controller;
        controller.setValue('bridge.sceneAssets.characters', { 狐: { 默认: '' } });
        controller.setValue('bridge.sceneAssets.characterDna', { 狐: { identity: 'fox' } });
        controller.switchTab('scene');
        let html = controller.switchSceneSubTab('characters').html || controller.getSnapshot().html;
        assert.match(html, />设为非人角色</);
        const name = encodeURIComponent('狐');
        html = (await controller.invoke(`char-creature:enabled:${name}:true`)).snapshot.html;
        assert.ok(controller.getSnapshot().draft.bridge.sceneAssets.characterDna.狐.creature);
        assert.match(html, /igs-char-dna-panel[\s\S]*data-creature-field="form"/);
        assert.match(html, />取消非人角色</);
        html = (await controller.invoke(`char-creature:enabled:${name}:false`)).snapshot.html;
        assert.equal('creature' in controller.getSnapshot().draft.bridge.sceneAssets.characterDna.狐, false);
        assert.doesNotMatch(html, /data-creature-field="form"/);
    } finally { vn.destroy?.(); }
});
