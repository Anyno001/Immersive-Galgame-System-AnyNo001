import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFxDirectives, parseFxBody, resolveFxAtPage } from '../src/scene/fx-directives.js';
import { stripMarkerDirectives } from '../src/scene/directive-tags.js';
import { buildTagGrammar } from '../src/visual/igs-ui/tag-grammar.js';
import { resolveCreatureFxPromptRule } from '../src/visual/igs-ui/fx-creature-model.js';
import { ADAPTIVE_PROMPT_BLOCKS, resolvePromptTriggers } from '../src/scene/prompt-triggers.js';

const args = (body) => parseFxBody(body).args;

test('creature directive: synonyms map to canonical values', () => {
    assert.deepEqual(parseFxBody('creature|史莱姆|兽|小型|悬浮'), { kind: 'creature', end: false, args: ['史莱姆', 'beast', 'small', 'float'] });
    assert.deepEqual(args('creature|甲|非人|中|落地'), ['甲', 'beast', 'medium', 'ground']);
    assert.deepEqual(args('creature|乙|beast|large|ground'), ['乙', 'beast', 'large', 'ground']);
    assert.deepEqual(args('creature|丙|半人|巨型|飞行'), ['丙', 'humanoid', 'giant', 'float']);
    assert.deepEqual(args('creature|丁|humanoid|giant|float'), ['丁', 'humanoid', 'giant', 'float']);
});

test('creature directive: omitted or unknown fields give empty strings', () => {
    assert.deepEqual(args('creature|小龙'), ['小龙', '', '', '']);
    assert.deepEqual(args('creature|小龙|半人形'), ['小龙', 'humanoid', '', '']);
    assert.deepEqual(args('creature|小龙|乱写|乱写|乱写'), ['小龙', '', '', '']);
});

test('creature directive: empty name and creature-end return null', () => {
    assert.equal(parseFxBody('creature'), null);
    assert.equal(parseFxBody('creature||兽|大'), null);
    assert.equal(parseFxBody('creature-end'), null);
    assert.equal(parseFxBody('creature-end|甲'), null);
});

test('creature directive: tag is stripped from the text', () => {
    assert.equal(stripMarkerDirectives('前[igs-fx:creature|甲|兽|大]后').trim(), '前后');
});

test('creature directive: resolveFxAtPage collects creatures on the tagged page only', () => {
    const text = 'a[igs-fx:creature|甲|兽|大]b[igs-fx:creature|乙]c[igs-fx:creature|甲|半人|小]';
    const ds = extractFxDirectives(text);
    assert.equal(ds.length, 3);
    const last = ds[2].offset;
    const page = resolveFxAtPage(ds, last, -1);
    assert.deepEqual(page.creatures, [
        { name: '甲', form: 'humanoid', size: 'small', anchor: '' },
        { name: '乙', form: '', size: '', anchor: '' },
    ]);
    const next = resolveFxAtPage(ds, last + 100, last);
    assert.deepEqual(next.creatures, []);
    assert.deepEqual(resolveFxAtPage([], 0, -1).creatures, []);
});

test('creature directive: at most four per page', () => {
    const text = ['一', '二', '三', '四', '五'].map((n) => `[igs-fx:creature|${n}]`).join('');
    const ds = extractFxDirectives(text);
    const page = resolveFxAtPage(ds, ds[4].offset, -1);
    assert.deepEqual(page.creatures.map((c) => c.name), ['一', '二', '三', '四']);
});

test('creature directive: existing directives are unaffected', () => {
    const ds = extractFxDirectives('[igs-fx:battle|狼|首领][igs-fx:creature|狼|兽|中]');
    const page = resolveFxAtPage(ds, ds[1].offset, -1);
    assert.equal(page.battleStart, true);
    assert.equal(page.battle.foe, '狼');
    assert.equal(page.creatures.length, 1);
});

test('creature prompt rule follows the battle switch', () => {
    assert.equal(resolveCreatureFxPromptRule(false), '');
    assert.match(resolveCreatureFxPromptRule(true), /igs-fx:creature\|名字\|形态\|体型\|落地/);
    const on = buildTagGrammar({ readerSettings: { battleFx: { enabled: true } }, expand: new Set(['creature']) });
    const off = buildTagGrammar({ readerSettings: { battleFx: { enabled: false } }, expand: new Set(['creature']) });
    assert.ok(`${on.system}\n${on.depth0}`.includes('igs-fx:类型|参数'), 'grammar present');
    assert.ok(`${on.system}\n${on.depth0}`.includes('creature|名字|形态|体型|落地'));
    assert.ok(on.expanded.includes('creature'));
    assert.ok(!`${off.system}\n${off.depth0}`.includes('creature'));
    assert.ok(!off.expanded.includes('creature'));
});

test('creature prompt block is adaptive and triggered by tag or word', () => {
    assert.ok(ADAPTIVE_PROMPT_BLOCKS.includes('creature'));
    assert.ok(resolvePromptTriggers({ recentAiTexts: ['[igs-fx:creature|甲]'] }).hits.has('creature'));
    assert.ok(resolvePromptTriggers({ userText: '森林里有一只怪物' }).hits.has('creature'));
    assert.ok(!resolvePromptTriggers({ userText: '今天天气很好' }).hits.has('creature'));
});
