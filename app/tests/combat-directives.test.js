// 与 v0.39.0 原版的差分测试：scene/combat-directives 的全部导出（含各种标签的正文样本）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as mine from '../src/scene/combat-directives.js';

const require = createRequire(import.meta.url);
require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');
const orig = globalThis.__igsRequire('src/scene/combat-directives.js');

const CONSTS = ['COMBAT_TAG_LIMITS', 'COMBAT_GROWTH_KINDS', 'COMBAT_ABILITY_WORDS', 'COMBAT_STAT_CAP_PER_FLOOR', 'COMBAT_REL_TIERS', 'COMBAT_GEAR_SLOTS', 'COMBAT_ITEM_COUNT_MAX', 'COMBAT_RARITY_WORDS', 'COMBAT_TIERS', 'COMBAT_AWAKEN_TYPES', 'COMBAT_GAIN_CATEGORIES'];

const START_TAGS = [
    '[igs-combat:start|林间遭遇|哥布林*3、狼人|艾拉、贝卡|elite]',
    '[igs-combat:START|山贼|山贼*２|]',
    '[igs-combat:start|遭遇|史莱姆*0]',
    '[igs-combat:start|遭遇|史莱姆*100]',
    '[igs-combat:start|遭遇|a*30、b*30]',
    '[igs-combat:start||哥布林]',
    '[igs-combat:start|遭遇|哥布林|甲、乙、丙、丁]',
    '[igs-combat:start|遭遇|哥布林||legend]',
    '[igs-combat:start|a|b|c|boss|extra]',
    '[igs-combat:start|遭遇|哥布林*2、哥布林*3]',
    '[igs-combat:start|这个遭遇名字实在是太长了超过二十个字符的限制啊啊|哥布林]',
    '[igs-combat:start|遭遇]',
];
const AWAKEN_TAGS = [
    '[igs-combat:awaken|艾拉|怒火|不会再退了]',
    '[igs-combat:awaken|艾拉|rage]',
    '[igs-combat:awaken|艾拉|未知|x]',
    '[igs-combat:awaken|艾拉||x]',
    '[igs-combat:awaken|艾拉|守护|' + '很长'.repeat(20) + ']',
    '[igs-combat:awaken|a|b|c|d]',
];
const GROWTH_TAGS = [
    '[igs-combat:exp|艾拉|30|击败哥布林]', '[igs-combat:exp|艾拉|40]', '[igs-combat:exp|艾拉|２０]', '[igs-combat:exp|艾拉|0]',
    '[igs-combat:exp|艾拉|1001]', '[igs-combat:exp||5]', '[igs-combat:exp|艾拉|abc]', '[igs-combat:exp|艾拉|5|' + 'x'.repeat(81) + ']',
    '[igs-combat:learn|艾拉|火球术|范围伤害|rare]', '[igs-combat:learn|艾拉|火球术|描述|神话]', '[igs-combat:learn|艾拉|火球术|描述|bad]', '[igs-combat:learn|艾拉]',
    '[igs-combat:upgrade|艾拉|火球术|更强]', '[igs-combat:upgrade|艾拉|火球术|更强|rare]',
    '[igs-combat:class|艾拉|剑士]', '[igs-combat:class|艾拉|超过十二个字的职业名称啊啊啊]', '[igs-combat:class|艾拉]',
    '[igs-combat:equip|艾拉|铁剑|武器|锋利|稀有]', '[igs-combat:equip|艾拉|铁剑|bad]', '[igs-combat:equip|艾拉|铁剑]', '[igs-combat:equip|艾拉|护符|饰品]',
    '[igs-combat:unequip|艾拉|铁剑]', '[igs-combat:unequip|艾拉|铁剑|x]',
    '[igs-combat:item|艾拉|药水|2|回血|普通]', '[igs-combat:item|艾拉|药水|9]', '[igs-combat:item|艾拉|药水]', '[igs-combat:item|艾拉|药水|0]',
    '[igs-combat:rel|艾拉|强敌]', '[igs-combat:rel|艾拉|OVERWHELMING]', '[igs-combat:rel|艾拉|x]', '[igs-combat:rel|艾拉]',
    '[igs-combat:stat|艾拉|力量|1|锻炼]', '[igs-combat:stat|艾拉|dex|2]', '[igs-combat:stat|艾拉|dex|2]', '[igs-combat:stat|艾拉|自由|1]', '[igs-combat:stat|艾拉|x|1]', '[igs-combat:stat|艾拉|力量|3]', '[igs-combat:stat|艾拉]',
    '[igs-combat:loot|艾拉|r1abc|2|reserve]', '[igs-combat:loot|艾拉|r1abc|2]', '[igs-combat:loot|艾拉|bad!|2]', '[igs-combat:loot|艾拉|r1abc|9]', '[igs-combat:loot|艾拉|r1abc|1|other]',
    '[igs-combat:heal|艾拉|30%|休息]', '[igs-combat:heal|艾拉|３０％]', '[igs-combat:heal|艾拉|500]', '[igs-combat:heal|艾拉|101%]', '[igs-combat:heal|艾拉|0]', '[igs-combat:heal|艾拉|10000]',
    '[igs-combat:bogus|艾拉|1]', '[igs-combat:|x]', '[igs-combat:EXP|艾拉|8]',
];
const GAIN_TAGS = [
    '[igs-fx:item|获得|铁剑|锋利|武器|稀有]', '[igs-fx:item|得到|药水|回血|道具]', '[igs-fx:item|gain|旧信|来自母亲|杂物|rare]', '[igs-fx:item|获得|护符||宝物|bad]',
    '[igs-fx:item|获得|铁剑|x|未知类]', '[igs-fx:item|失去|铁剑|x|武器]', '[igs-fx:item|获得||x|武器]', '[igs-fx:item|获得|a|b|武器|rare|extra]',
    '[igs-fx:item|获得|' + '长'.repeat(21) + '|x|道具]', '[igs-fx:ITEM|获得|铁甲|x|防具]',
];

function samples() {
    const list = [];
    list.push('', null, undefined, '没有标签的正文。', '[igs-combat:start|x|y]');
    for (const s of START_TAGS) {
        list.push(`正文。\n${s}`, `正文。\n${s}\n`, `${s}`, `正文${s}后面`, `${s}\n后面还有字`, `正文。\n${s}\n${s}`);
        for (const a of AWAKEN_TAGS) {
            list.push(`正文。\n${a}\n${s}`, `正文。${a}\n${s}`, `正文。\n${a}\n\n${s}`, `${a}\n${a}\n${s}`, `${s}\n${a}`, `正文。\n${a} 尾\n${s}`);
        }
    }
    for (const g of GROWTH_TAGS) list.push(g, `正文\n${g}`, `${g}\n${g}`, `${g}${g}`);
    list.push(GROWTH_TAGS.join('\n'), GROWTH_TAGS.slice(0, 12).join('，') + '\n' + START_TAGS[0]);
    for (const g of GAIN_TAGS) list.push(g, `正文\n${g}`, `${g}\n${g}`);
    list.push(GAIN_TAGS.join('\n'));
    // 被净化掉的区域：HTML 卡片、插图标记、聊天块。
    list.push(
        '<div class="card">[igs-combat:exp|艾拉|9]</div>\n[igs-combat:exp|艾拉|8]',
        '```\n[igs-combat:exp|艾拉|7]\n```\n[igs-combat:exp|艾拉|6]',
        '[IMG:场景]\n[igs-combat:exp|艾拉|5]',
        '<think>[igs-combat:exp|艾拉|4]</think>\n[igs-combat:exp|艾拉|3]\n' + START_TAGS[0],
        '<content>正文\n[igs-combat:exp|艾拉|2]</content>\n外面\n[igs-combat:start|x|y]',
    );
    return list;
}

test('导出名集合与常量一致', () => {
    // PR #18 新增的失去物品标签：COMBAT_LOSS_MAX、extractLossDirectives、scanLossTags；亲密对决台词：extractIntimateLines。原版都没有。
    const added = new Set(['COMBAT_LOSS_MAX', 'extractLossDirectives', 'scanLossTags', 'extractIntimateLines']);
    assert.deepStrictEqual(Object.keys(mine).filter((key) => !added.has(key)).sort(), Object.keys(orig).sort());
    assert.equal(mine.COMBAT_LOSS_MAX, 30);
    assert.equal(typeof mine.extractLossDirectives, 'function');
    assert.equal(typeof mine.scanLossTags, 'function');
    for (const k of CONSTS) {
        assert.deepStrictEqual(mine[k], orig[k], k);
        assert.ok(Object.isFrozen(mine[k]), `${k} frozen`);
    }
});

test('scanCombatTags / scanGainTags / combatBodyText', () => {
    for (const text of samples()) {
        assert.deepStrictEqual(mine.scanCombatTags(text), orig.scanCombatTags(text));
        assert.deepStrictEqual(mine.scanGainTags(text), orig.scanGainTags(text));
        assert.strictEqual(mine.combatBodyText(text), orig.combatBodyText(text));
    }
});

test('extractCombatStart', () => {
    for (const text of samples()) assert.deepStrictEqual(mine.extractCombatStart(text), orig.extractCombatStart(text), String(text));
});

test('extractGrowthDirectives（含 raw / expCap 选项）', () => {
    const optionSets = [undefined, {}, { raw: true }, { expCap: false }, { raw: true, expCap: false }];
    for (const text of samples()) {
        for (const opts of optionSets) assert.deepStrictEqual(mine.extractGrowthDirectives(text, opts), orig.extractGrowthDirectives(text, opts), String(text));
    }
});

test('extractGainDirectives', () => {
    for (const text of samples()) assert.deepStrictEqual(mine.extractGainDirectives(text), orig.extractGainDirectives(text), String(text));
});

test('sourceFilter 选项透传', () => {
    const text = '正文\n[igs-combat:exp|艾拉|9]\n' + START_TAGS[0];
    for (const sourceFilter of [undefined, {}, { htmlCardTags: 'div,span' }, { htmlCardTags: '' }]) {
        const opts = { sourceFilter };
        assert.strictEqual(mine.combatBodyText(text, opts), orig.combatBodyText(text, opts));
        assert.deepStrictEqual(mine.extractCombatStart(text, opts), orig.extractCombatStart(text, opts));
        assert.deepStrictEqual(mine.extractGrowthDirectives(text, opts), orig.extractGrowthDirectives(text, opts));
    }
});
