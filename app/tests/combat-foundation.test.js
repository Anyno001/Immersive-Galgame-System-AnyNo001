// 与 v0.39.0 原版的差分测试：random / rules / abilities / combat-prompt / check-rolls 的全部导出。
// 运行需加 --test-force-exit（原包留有句柄）。
// check-rolls 依赖 src/choices/dice-check.js 的 D20_DC_RANGE / d20Bonus / d20Outcome。
// 为了只验证 check-rolls 本身，测试把源码拷到临时目录，并用原包的 dice-check 垫片替代工作区版本；
// 工作区 dice-check.js 与原包的一致性由单独的用例检查。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadV039, makeRng } from './helpers/combat-diff-fixtures.js';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V039 = loadV039('src/combat/random.js') ? (p) => loadV039(p) : null;
const skip = !V039;

const random = await import('../src/combat/random.js');
const rules = await import('../src/combat/rules.js');
const abilities = await import('../src/combat/abilities.js');
const prompt = await import('../src/scene/combat-prompt.js');

// check-rolls：始终走临时目录垫片。
async function loadCheckRolls() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'igs-check-rolls-'));
    for (const rel of ['src/combat/random.js', 'src/combat/rules.js', 'src/combat/abilities.js', 'src/scene/combat-prompt.js', 'src/scene/check-rolls.js']) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.copyFileSync(path.join(APP, rel), path.join(root, rel));
    }
    fs.mkdirSync(path.join(root, 'src/choices'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    fs.writeFileSync(path.join(root, 'src/choices/dice-check.js'), [
        "import { createRequire } from 'node:module';",
        "const require = createRequire(import.meta.url);",
        "require('G:/奶龙Code/gal/v0.39.0拆解/igs-v039-modules.js');",
        "const d = globalThis.__igsRequire('src/choices/dice-check.js');",
        'export const { D20_DC_RANGE, d20Bonus, d20Outcome } = d;',
    ].join('\n'));
    return import(pathToFileURL(path.join(root, 'src/scene/check-rolls.js')).href);
}
const checkRolls = await loadCheckRolls();

const rng = makeRng(20261031);
const int = (a, b) => a + Math.floor(rng() * (b - a + 1));
const pick = (list) => list[Math.floor(rng() * list.length)];

function sameExports(name, mine, path) {
    const old = V039(path);
    // v0.39.1 / v0.39.2 新增导出，原版没有
    const added = new Set(['crowdScaleFor', 'signatureSlotOf', 'signatureUnlockLevel', 'signatureCardAt', 'COMBAT_KINDS', 'combatKindOf', 'combatGrammarEnabled', 'dailyChallengeEnabled', 'CHALLENGE_SEGMENT_ID', 'CHALLENGE_GRAMMAR_LINE', 'resolveChallengePromptSegment']);
    assert.deepEqual(Object.keys(mine).filter((key) => !added.has(key)).sort(), Object.keys(old).sort(), `${name} 导出名一致`);
    return old;
}

// 逐个导出比较：函数用给定的参数组调用，常量直接 deepEqual。normalize 把本版的结果换回原版写法再比（只用于登记过的有意改动）。
function compareAll(mine, old, argSets, { normalize = (value) => value } = {}) {
    for (const key of Object.keys(old)) {
        if (typeof old[key] !== 'function') {
            // v0.39.1 在 COMBAT_RULES 新增 crowd、generatedScale，v0.39.2 新增 signatureUnlockLevels，原版没有；其余字段逐项相同。
            const { crowd, generatedScale, signatureUnlockLevels, ...rest } = key === 'COMBAT_RULES' ? mine[key] : {};
            assert.deepEqual(key === 'COMBAT_RULES' ? rest : normalize(mine[key]), old[key], `常量 ${key}`);
            continue;
        }
        const sets = argSets[key];
        assert.ok(sets, `缺少 ${key} 的参数组`);
        for (const args of sets) {
            const run = (fn, fix = (value) => value) => { try { return { ok: fix(fn(...structuredClone(args))) }; } catch (error) { return { err: error.constructor.name }; } };
            assert.deepEqual(run(mine[key], normalize), run(old[key]), `${key}(${JSON.stringify(args)})`);
        }
    }
}

// v0.39.2 开战规则新增一句「其他标签写在开战标签之前」，比对时去掉这一句。
const V0392_START_HINT = '本层要写的其他标签（rel、stat 等）都写在它之前；';
const withoutStartHint = (value) => (typeof value === 'string' ? value.split(V0392_START_HINT).join('')
    : value && typeof value === 'object' ? JSON.parse(JSON.stringify(value).split(V0392_START_HINT).join('')) : value);

const junk = [undefined, null, '', 'x', 0, 1, -5, 3.7, NaN, [], {}, '力量', ' STR ', '敏', '相当', '远逊', 'even'];
const names = ['艾琳', 'Bob', '', '主角', '赵云-1'];

test('random：全部导出', { skip }, () => {
    const old = sameExports('random', random, 'src/combat/random.js');
    const states = [0, 1, 123456789, 4294967295, ...Array.from({ length: 200 }, () => Math.floor(rng() * 4294967296))];
    compareAll(random, old, {
        hash32: [...junk, ...names, '一串很长的文本'.repeat(20)].map((v) => [v]),
        hashString: [...junk, ...names].map((v) => [v]),
        nextRandom: states.map((s) => [s]),
        randomInt: states.flatMap((s) => [0, 1, 5, 20, 100, -3].map((b) => [s, b])),
    });
});

test('rules：全部导出', { skip }, () => {
    const old = sameExports('rules', rules, 'src/combat/rules.js');
    const effects = [];
    for (const op of ['damage', 'block', 'heal', 'draw', 'energy', 'status', 'exhaust-self', 'conditional', 'damage-from-block', 'self-damage', 'double', 'next-turn', 'each-turn', 'hand-cost', 'cleanse', 'discard', 'discard-hand', 'copy', 'create', 'repeat-last', 'replay-next', 'grow', 'cost-mod', 'buff', 'nope']) {
        for (let i = 0; i < 12; i += 1) {
            effects.push({
                op, amount: int(1, 12), hits: pick([undefined, 2, 3]), stacks: int(1, 4), turns: int(1, 3),
                status: pick(['vulnerable', 'strength', 'poison', 'no-draw', 'zzz']), stat: pick(['poison', 'block', 'strength', 'x']),
                target: pick([undefined, 'enemy', 'all-enemies', 'all-allies', 'random-enemy', 'self']),
                strengthScale: pick([undefined, 2, 3]), gain: pick(['energy', 'draw', 'status']), mode: pick(['choose', 'random', 'self', undefined]),
                scope: pick(['combat', undefined]), redraw: pick([true, false]), from: pick(['self', 'other']), cardType: pick(['attack', undefined]),
                card: pick(Object.keys(rules.TOKEN_CARDS).concat('none')), trigger: pick(Object.keys(rules.COMBAT_RULES.tiers).concat(['card-played', 'kill', 'x'])),
                then: pick([undefined, [{ op: 'damage', amount: 5 }], [{ op: 'block', amount: 4, target: 'all-allies' }]]),
            });
        }
    }
    const cards = [];
    for (const cost of [0, 1, 2, 3, 'X', 4, undefined]) {
        for (const rarity of ['basic', 'common', 'uncommon', 'rare', 'epic', 'mythic', 'personal', 'signature', 'bad']) {
            for (let i = 0; i < 25; i += 1) {
                const list = Array.from({ length: int(0, 3) }, () => pick(effects));
                const card = { cost, rarity, effects: list, innate: rng() < 0.2, ethereal: rng() < 0.2, unplayable: rng() < 0.2, onDiscard: rng() < 0.2 ? [pick(effects)] : undefined };
                if (rng() < 0.5) card.upgraded = { cost: pick([undefined, cost, 0, 1, 2]), effects: pick([undefined, list.concat(pick(effects)), [pick(effects)]]) };
                cards.push(card);
            }
        }
    }
    const catalog = new Map(cards.slice(0, 40).map((c, i) => [`c${i}`, c]));
    const decks = Array.from({ length: 150 }, () => Array.from({ length: int(0, 34) }, () => `c${int(0, 45)}`));
    compareAll(rules, old, {
        estimateEffectsValue: [[undefined], [null], [[]], ...effects.map((e) => [[e]]), ...effects.slice(0, 80).map((e, i) => [[e, effects[i + 1]]])],
        estimateCardValue: [[undefined], [null], ...cards.map((c) => [c])],
        rarityWindow: [0, 1, 2, 3, 'X', 9].flatMap((c) => ['basic', 'rare', 'signature', 'zz', 3].map((r) => [c, r])),
        evaluateCardBudget: [[undefined], [{}], ...cards.map((c) => [c])],
        expToNextLevel: [1, 2, 10, 19, 20].map((v) => [v]),
        expProgress: [...junk, 39, 40, 99, 100, 5000, 100000, '77'].map((v) => [v]),
        levelFromExp: [...junk, 39, 40, 100, 100000].map((v) => [v]),
        cardCopyLimit: [...junk, 'signature', 'mythic', 'rare', 'basic'].map((v) => [v]),
        validateDeck: decks.map((d) => [d, pick([{ c1: 3, c2: 1 }, new Map([['c1', 2], ['c3', 3]]), undefined, Object.fromEntries(d.map((id) => [id, 3]))]), catalog]).map(([d, o, c]) => [d, o, c]),
        difficultyRule: [...junk, 'easy', 'hard', 'brutal', 'nightmare', 'normal'].map((v) => [v]),
        skillTarget: [1, 3, 4, 10, 30, 99, undefined, 'x'].flatMap((l) => ['normal', 'elite', 'boss', undefined].map((t) => [l, t])),
        allyFillCap: [0, 1, 5, 6, 10, 11, 20, undefined, 'x'].map((v) => [v]),
        scaleEnemyStats: ['normal', 'elite', 'boss', 'nope'].flatMap((tier) => [1, 5, 20, undefined].flatMap((level) => ['easy', 'normal', 'hard', 'brutal', 'nightmare', 'zz'].flatMap((d) => [0, 1, 4, undefined].map((gap) => [{ tier, base: { hp: 30 } }, level, d, { gap }])))).concat([[undefined], [{}]]),
        combatExpReward: [[undefined], [[]], [['normal', 'elite', 'boss', 'x']], [['boss', 'boss']]],
        combatSpeedFor: [[undefined], [{}], ...Object.keys(rules.COMBAT_RULES.archetypes).concat('zz').flatMap((archetype) => ['normal', 'boss', 'zz'].flatMap((tier) => ['a', 'b', '赵云', undefined].map((id) => [{ archetype, tier, id }])))],
        isCompatibleRulesVersion: [2, 3, 4, 5, '3', undefined].map((v) => [v]),
    });
    assert.equal(Object.isFrozen(rules.COMBAT_RULES.difficulty.nightmare.affixes), true);
});

test('abilities：全部导出', { skip }, () => {
    const old = sameExports('abilities', abilities, 'src/combat/abilities.js');
    const keys = abilities.ABILITY_KEYS;
    const prefsList = [undefined, null, 'x', {}, { major: 'str', minor: 'str', weak: 'dex' }, { major: '力量', minor: 'dex', weak: '魅' }, { major: 'int', minor: 'wis', weak: 'cha' }, { major: 'cha', minor: 'con', weak: 'str' }];
    const scoreSets = Array.from({ length: 60 }, () => Object.fromEntries(keys.map((k) => [k, int(1, 20)])));
    const manualSets = Array.from({ length: 60 }, () => Object.fromEntries(keys.map((k) => [k, int(3, 18)])));
    const roles = [...Object.keys(abilities.ROLE_DEFAULT_PREFS), 'zz', undefined, '战士'];
    compareAll(abilities, old, {
        abilityKeyOf: [...junk, ...keys, 'Cha', '魅力'].map((v) => [v]),
        relTierOf: [...junk, ...Object.keys(abilities.REL_TIERS), '稍强', '碾压', ' 强敌 '].map((v) => [v]),
        normalizePrefs: prefsList.map((v) => [v]),
        defaultPrefs: roles.map((v) => [v]),
        baseScores: prefsList.flatMap((p) => names.map((n) => [p, n])),
        normalizeManualScores: [...junk, ...scoreSets, ...manualSets, { ...manualSets[0], str: 3.5 }, { ...manualSets[0], extra: 8 }, Object.fromEntries(keys.map((k) => [k, 18]))].map((v) => [v]),
        prefsFromScores: scoreSets.map((v) => [v]),
        relOffset: names.flatMap((n) => [...Object.keys(abilities.REL_TIERS), 'zz', undefined].map((t) => [n, t])),
        relLevel: [undefined, ...names.flatMap((name) => ['outclassed', 'even', 'overwhelming', undefined].flatMap((tier) => [1, 5, 25, 99, undefined].map((anchorLevel) => [{ name, tier, anchorLevel }])))],
        asiCountAt: [0, 1, 4, 8, 19, 20, 28, 30].flatMap((l) => [true, false].map((p) => [l, p])),
        autoAllocate: scoreSets.flatMap((s) => [[s, prefsList[int(0, 7)], int(0, 6), pick([20, 30])]]),
        deriveAbilities: [undefined, ...names.flatMap((name) => [1, 4, 12, 20, 30].flatMap((level) => [true, false].flatMap((protagonist) => ['outclassed', 'even', 'overwhelming', 'zz'].map((tier) => [{ prefs: pick(prefsList), name, level, protagonist, tier, adjustments: pick([[], [{ ability: 'str', amount: 3 }, { ability: '魅', amount: -40 }, { ability: 'x', amount: 2 }], 'x']), base: pick([null, manualSets[int(0, 59)], scoreSets[0]]) }]))))],
        asiBalance: [1, 4, 8, 20].flatMap((l) => [0, 1, 3, 99, -2, undefined, 'x'].map((s) => [l, s])),
        parseCombatInit: [...junk, ...roles.flatMap((role) => [
            { className: '剑客', role, major: 'str', minor: 'dex', weak: 'int' }, { className: 'x'.repeat(13), role, major: 'str', minor: 'dex', weak: 'int' },
            { role, major: 'str', minor: 'str', weak: 'int' }, { role, major: 'zz', minor: 'dex', weak: 'int' }, { role, major: 1, minor: 'dex', weak: 'int' },
            { role, scores: manualSets[1] }, { role, scores: { str: 99 } }]).flatMap((v) => [[v], [v, { allowScores: true }]]).map((a) => a)].map((v) => (Array.isArray(v) ? v : [v])),
        isAsiLevel: [0, 4, 5, 19, 24, 28, '8', undefined].flatMap((l) => [[l], [l, false], [l, true]]),
        wantsAutoInit: [[undefined], ...['relative', 'manual', 'auto', null].flatMap((mode) => [null, 'auto', 'skip'].flatMap((choice) => [true, false].flatMap((protagonist) => [true, false].map((enemy) => [{ mode, choice, protagonist, enemy }]))))],
        abilityMod: [1, 10, 11, 20, 30, 'x', undefined].map((v) => [v]),
        proficiencyBonus: [0, 1, 4, 5, 20, 29, 99, 'x', undefined].map((v) => [v]),
        abilityCap: [true, false, undefined].map((v) => [v]),
        levelCap: [true, false, undefined].map((v) => [v]),
    });
});

const settingsList = [undefined, null, {}, { combatExpansion: { enabled: true } }, { combatExpansion: { enabled: true }, itemFx: { enabled: true } }, { combatExpansion: { enabled: true }, combatMerged: true }, { combatExpansion: { enabled: true }, combatMerged: true, itemFx: { enabled: true } }, { combatExpansion: { enabled: 'yes' } }, { combatExpansion: { enabled: false }, itemFx: { enabled: true } }];

test('combat-prompt：全部导出', { skip }, () => {
    const old = sameExports('combat-prompt', prompt, 'src/scene/combat-prompt.js');
    const reports = ['', null, 'x', '<igs-combat-report id="a" result="win">', '（战斗结束）<igs-combat-report result = "LOSE" encounter="x">', '<igs-combat-report result="escape"/>', '<igs-combat-report result="draw">'];
    const msgs = reports.map((text) => ({ user: true, text }));
    const msgLists = [undefined, [], ...msgs.map((m) => [m]), ...msgs.map((m) => [m, { user: false, text: 'ai' }]), [{ user: false, text: 'ai' }]];
    const members = [undefined, [], [null], [{ name: ' 艾 琳\n', level: 3, hp: 10, maxHp: 30, injury: '轻伤 \n', abilities: [['力量', 12], ['敏捷', 9]] }, { name: 'B', level: 1, down: true, maxHp: 20, hero: true }, { name: 'C', level: 2, down: true, maxHp: 20 }]];
    compareAll(prompt, old, {
        combatExpansionEnabled: settingsList.map((s) => [s]),
        itemFxPromptEnabled: settingsList.map((s) => [s]),
        combatGainInCombatBlock: settingsList.map((s) => [s]),
        combatPromptMerged: settingsList.map((s) => [s]),
        resolveCombatPromptRule: settingsList.map((s) => [s]),
        combatReportResult: [...junk, ...reports].map((v) => [v]),
        findPendingCombatReport: msgLists.flatMap((m) => [undefined, 'swipe', 'regenerate', 'continue', 'normal'].flatMap((generationType) => ['', ' ', ...reports.slice(2, 5)].map((inputText) => [m, { generationType, inputText }]))).concat([[undefined]]),
        resolveCombatNarrationSegment: settingsList.flatMap((s) => msgLists.map((m) => [s, m, { generationType: pick([undefined, 'swipe', 'normal']), inputText: pick(['', reports[3]]) }])),
        combatPartyLines: members.map((m) => [m]),
        resolveCombatPartySegment: settingsList.flatMap((s) => members.map((m) => [s, m])),
    }, { normalize: withoutStartHint });
    // 有意改动本身：开战规则带上这一句。
    assert.ok(prompt.resolveCombatPromptRule({ combatExpansion: { enabled: true } }).includes(V0392_START_HINT));
});

test('check-rolls：全部导出', { skip }, () => {
    const old = sameExports('check-rolls', checkRolls, 'src/scene/check-rolls.js');
    const aiMsg = (swipe) => ({ is_user: false, swipe_id: swipe });
    const userMsg = { is_user: true };
    const floors = [undefined, [], [userMsg], [aiMsg(0)], [userMsg, aiMsg(2), userMsg, aiMsg(0), aiMsg(1)], [{ user: true }, { user: false }]];
    const types = [undefined, null, 'normal', 'swipe', 'regenerate', 'continue', 'impersonate', 'quiet'];
    const bodies = [
        undefined, '', '无标签',
        '他出手[igs-check:艾琳|力量|15]成功了。然后[igs-check:艾琳|话术|DC 12|优势]失败，[igs-check:|力量|10][igs-check:甲|敏捷|99][igs-check:乙|a|b|c|d][igs-check:丙|魅力|１５|劣]大成功',
        '[igs-check:艾琳|力量|20]失败[igs-check:艾琳|智力|5|奇怪]' + Array.from({ length: 12 }, (_, i) => `[igs-check:甲|敏捷|${10 + i}]`).join(''),
        '[igs-check:艾琳|撬锁2|10]',
    ];
    const rollSets = Array.from({ length: 10 }, (_, k) => checkRolls.checkRollsFor('chat', k + 1, k % 3));
    const pairSets = Array.from({ length: 10 }, (_, k) => checkRolls.checkRollPairsFor('chat', k + 1, k % 3));
    const actor = { prefs: { major: 'str', minor: 'dex' }, scores: { str: 16, dex: 14, con: 10, int: 8, wis: 12, cha: 11 }, proficiency: 3 };
    const readers = [() => actor, () => null, (n) => (n === '艾琳' ? actor : null), () => { throw new Error('boom'); }];
    const skills = [undefined, () => ({ ability: 'int', bonus: 4.4 }), () => null, () => ({ ability: 'zz', bonus: 1 }), () => ({ ability: '力量', bonus: 'x' })];
    const replayCalls = [];
    for (const body of bodies) for (const rolls of [...rollSets.slice(0, 3), ...pairSets.slice(0, 4), undefined, [1, 2]]) for (const readAbilities of readers) for (const resolveSkill of skills.slice(0, 3)) {
        replayCalls.push([{ body, rolls, readAbilities, resolveSkill, edgeOf: pick([undefined, () => 1, () => -3, () => 0, () => { throw new Error('x'); }]), shiftOf: pick([undefined, () => 2, () => -1.6, () => 'x']) }]);
    }
    for (const resolveSkill of skills) replayCalls.push([{ body: bodies[8], rolls: rollSets[0], readAbilities: readers[0], resolveSkill }]);
    const actorSets = [undefined, null, actor, {}, { scores: { str: 'x' } }];
    const inputs = [undefined, null, { actors: [{ name: 'A' }], corrections: ['a'] }, { actors: [{ name: 'A' }, { name: 'B' }], corrections: [] }, { corrections: ['z'] }];
    const varArgs = [undefined, {}, { rolls: rollSets[0] }, { rolls: pairSets[1], actors: [{ name: '艾琳', attr: actor }, { name: 'B', attr: {} }, null, ...Array.from({ length: 8 }, (_, i) => ({ name: `N${i}`, attr: actor }))], edges: [{ name: '艾琳', edge: 3, shift: 2, reasons: ['祝福'] }, { name: 'B', edge: 0, shift: 0 }, { name: 'C', edge: -1, shift: -1.4 }, null], corrections: ['上次错了'] }, { rolls: [1, 2] }];
    compareAll(checkRolls, old, {
        upcomingCheckOrdinal: floors.flatMap((f) => types.map((t) => [f, t])),
        floorCheckOrdinal: floors.flatMap((f) => [-1, 0, 1, 2, 4, 9, '1', 'x', undefined].map((i) => [f, i])),
        upcomingCheckSwipe: floors.flatMap((f) => types.map((t) => [f, t])),
        floorCheckSwipe: floors.flatMap((f) => [-1, 0, 1, 2, 4, 9, 'x'].map((i) => [f, i])),
        floorIndexOfOrdinal: floors.flatMap((f) => [0, 1, 2, 3, 9].map((o) => [f, o])),
        checkRollsFor: ['chat', ' chat ', '', undefined, '角色卡'].flatMap((k) => [1, 2, 50, 0, -1, 1.5, 'x'].flatMap((o) => [0, 1, 3, -1, undefined].map((s) => [k, o, s]))),
        checkRollPairsFor: ['chat', '', undefined, '角色卡'].flatMap((k) => [1, 2, 50, 0].flatMap((o) => [0, 1, 3, undefined].map((s) => [k, o, s]))),
        pickDie: [[5, 0], [5, 1], [[3, 9], 1], [[3, 9], -1], [[3, 9], 0], [[3, 9]], [[3, 9], 'x'], [undefined, 0]],
        scanCheckTags: [...bodies, null, 5].map((b) => [b]),
        replayChecks: [[], [undefined], ...replayCalls],
        checkActorBonuses: actorSets.map((a) => [a]),
        checkCorrections: [undefined, [], [null], [{ mismatch: true, actor: 'A', label: '力量', dc: 12, edge: 1, die: 5, bonus: 3, total: 8, tier: '失败', written: '成功' }, { mismatch: false }, { mismatch: true, actor: 'B', label: '话术', dc: 9, edge: 0, die: 3, bonus: -2, total: 1, tier: '失败', written: '大成功' }]].map((a) => [a]),
        formatActorBonuses: actorSets.map((a) => [a]),
        mergeCheckInputs: inputs.flatMap((a) => inputs.map((b) => [a, b])),
        checkRollsVars: varArgs.map((a) => [a]),
        fillCheckRolls: [[checkRolls.CHECK_ROLLS_TEMPLATE, { 骰序: '1/2', 优劣势: '', 在场加值: 'x', 更正: '' }], [checkRolls.CHECK_ROLLS_TEMPLATE, undefined], [undefined, {}], ['a {{x}}\n{{ y }}\n{{y}}b', { x: 1, y: '' }], ['{{z}} 保留', { x: 1 }]],
        resolveCheckRollsSegment: settingsList.flatMap((s) => varArgs.concat([{ rolls: rollSets[2], statsActive: true }, { rolls: rollSets[2], statsActive: 'yes' }]).map((o) => [s, o])).concat([[undefined]]),
    });
});

test('工作区 dice-check 的 d20 部分与原包一致', { skip }, async () => {
    const mine = await import('../src/choices/dice-check.js');
    const old = V039('src/choices/dice-check.js');
    assert.deepEqual(mine.D20_DC_RANGE, old.D20_DC_RANGE);
    const abilitySets = [undefined, null, 0, 'x', {}, { scores: {} }, { scores: { str: 'x' } }, { scores: { str: 16, dex: 9 }, prefs: { major: 'str' }, proficiency: 3 }, { scores: { str: null } }];
    for (const abilities of abilitySets) {
        for (const key of ['str', 'dex', 'zz']) {
            assert.equal(mine.d20Bonus(abilities, key), old.d20Bonus(abilities, key), `d20Bonus(${JSON.stringify(abilities)}, ${key})`);
        }
    }
    for (const die of [1, 2, 10, 19, 20]) for (const bonus of [-3, 0, 4]) for (const dc of [5, 12, 30]) {
        assert.deepEqual(mine.d20Outcome(die, bonus, dc), old.d20Outcome(die, bonus, dc));
    }
});
