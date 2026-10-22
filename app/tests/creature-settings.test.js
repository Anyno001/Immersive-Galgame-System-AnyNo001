import test from 'node:test';
import assert from 'node:assert/strict';
import { editCharacterCreature, renderCharacterCreatureFold } from '../src/visual/igs-ui/creature-settings.js';
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

test('折叠项渲染：未启用只有开关，半人形才有差分', () => {
    const off = renderCharacterCreatureFold('狐', frozenDna());
    assert.match(off, /data-creature-field="enabled"/);
    assert.doesNotMatch(off, /data-creature-field="form"/);
    const beast = renderCharacterCreatureFold('狐', editCharacterCreature(frozenDna(), 'enabled', 'true'), () => true);
    assert.match(beast, /<details[^>]* open>/);
    assert.doesNotMatch(beast, /data-creature-field="tiers"/);
    const half = editCharacterCreature(editCharacterCreature(frozenDna(), 'enabled', 'true'), 'form', 'humanoid');
    assert.match(renderCharacterCreatureFold('狐', half), /data-creature-field="tiers"/);
});

test('角色立绘区含非人角色折叠项', () => {
    const html = renderCharacterAssetList({ 狐: { 默认: 'x.png' } }, { characterDna: { 狐: frozenDna() }, isOpen: (key) => key === 'char-open:狐', spriteHeight: null });
    assert.match(html, /data-advanced="char-creature:狐"/);
});
