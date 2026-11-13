// S1 第四幕与事件遭遇：事件单位按对应档位登记，遭遇奖励与多体编组不进入模板。
import { enemy, unavailableEnemy, skill, atk, blk, st, ap, op, cycle } from './dsl.js';

const research = '.limcode/cache/enemy-research/';
const matrix = (line) => ({ file: `${research}136-capability-matrix.md`, lines: [line, line] });
const source = (file, line, end = line) => ({ file: `${research}${file}`, lines: [line, end] });
const act4File = '32-sts1-act4.md';
const banditFile = '35-sts1-masked-bandits.md';
const eliteFile = '22-sts1-act1-elites.md';
const unavailable = (group, rows) => rows.map(([no, sourceKey, name, tier, hp, file, line, matrixLine, reason, notes = []]) => unavailableEnemy(
    'sts1', group, no, name, tier, 'release',
    { sourceKey, hp, reason, notes, evidence: [source(file, line), matrix(matrixLine)] },
));

export const STS1_ACT4 = Object.freeze(unavailable('act4', [
    [1, 'Spire Shield', '塔卫坚盾', 'elite', 110, act4File, 21, 116, '每三回合固定插招，其余回合随机抽定两步组合，不是固定循环；背袭增伤依赖双体包围。'],
    [2, 'Spire Spear', '塔卫锐矛', 'elite', 160, act4File, 31, 117, '固定首招、周期插招与随机两步组合并存，首招与组合的衔接来源未明示；背袭依赖双体包围。'],
    [3, 'Corrupt Heart', '塔心恶核', 'boss', 750, act4File, 46, 118, '血弹2×12段数已可表达；但每三回合插招与随机两步组合、增益按使用次数递进（第6次后未给）、每回合失血上限与逐牌反伤均不支持。'],
]));

const fields = { weight: 1, cooldown: 0, maxRepeat: 2 };
export const STS1_EVENTS = Object.freeze([
    enemy('sts1', 'event', 1, '锐刺蒙面客', 'normal', 'release',
        { skills: [skill('special', '双刺突袭', 'attack', [atk(5, 2)], fields)], script: cycle(['special']) },
        { sourceKey: 'Pointy（事件）', hp: 30, evidence: [source(banditFile, 19), source(banditFile, 21), matrix(119)],
            notes: ['事件单位按普通档位登记；三人同场、事件奖励与战斗分类属遭遇层，不进入模板。', 'A2 伤害6×2与高阶HP34只记备注，进阶阈值来源未给。'] }),
    enemy('sts1', 'event', 2, '嘲斩蒙面客', 'normal', 'release',
        { skills: [
            skill('mock', '嘲弄', 'idle', [op('idle')], fields),
            skill('agonize', '痛楚斩', 'attack-debuff', [atk(10), st('weak', 2, 'enemy')], fields),
            skill('cross', '交叉斩', 'attack', [atk(15)], fields),
        ], script: { opener: 'mock', ...cycle(['agonize', 'cross']) } },
        { sourceKey: 'Romeo（事件）', hp: [35, 39], evidence: [source(banditFile, 25, 30), matrix(120)],
            notes: ['首招嘲弄为真正不行动（idle），之后痛楚斩10加虚弱2、交叉斩15交替。', 'A17 循环改为痛楚斩、交叉斩、交叉斩，A2 伤害12/17、A17 虚弱3及高阶HP只记备注。'] }),
    enemy('sts1', 'event', 3, '熊抱蒙面客', 'normal', 'release',
        { skills: [
            skill('hug', '熊抱', 'debuff', [ap('def-down', 2, 'enemy')], fields),
            skill('lunge', '突进', 'attack-defend', [atk(9), blk(9)], fields),
            skill('maul', '重殴', 'attack', [atk(18)], fields),
        ], script: { opener: 'hug', ...cycle(['lunge', 'maul']) } },
        { sourceKey: 'Bear（事件）', hp: [38, 42], evidence: [source(banditFile, 34, 38), matrix(121)],
            notes: ['首招熊抱使对方防御力下降2（def-down 无衰减，对应敏捷-2），之后突进9加格挡9、重殴18交替。', 'A17 敏捷-4、A2 伤害10/20及高阶HP只记备注。'] }),
    enemy('sts1', 'event', 4, '醒觉石卫', 'elite', 'release',
        { skills: [
            skill('siphon', '汲魂', 'debuff', [ap('atk-down', 1, 'enemy'), ap('def-down', 1, 'enemy')], fields),
            skill('attack', '重击', 'attack', [atk(18)], fields),
        ], script: cycle(['siphon', 'attack', 'attack']) },
        { sourceKey: 'Lagavulin（Dead Adventurer 已醒型）', hp: [109, 111], evidence: [source(eliteFile, 18), source(eliteFile, 25), matrix(122)],
            notes: ['已醒型从汲魂起手，按汲魂、重击、重击循环；汲魂使对方攻击力、防御力各下降1（无衰减），不带睡眠、金属化与唤醒状态机。',
                '事件版HP未单独给出，取常规遭遇区间；A3 伤害20、A18 各降2只记备注。'] }),
]);
