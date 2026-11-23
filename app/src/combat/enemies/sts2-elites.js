// S2 精英：基础难度；Knight Gang 为组合占位不建条目。可保真条目登记原版模型，Beta 保留 beta 状态。
import { enemy, unavailableEnemy, skill, passive, atk, st, ap, op, cycle } from './dsl.js';

const research = '.limcode/cache/enemy-research/';
const ref = (file, from, to = from) => ({ file: `${research}${file}`, lines: [from, to] });
const base = (line) => ref('10-sts2-elites.md', line);
const audit = (line) => ref('114-sts2-elite-behavior-audit.md', line);
const matrix = (line) => ref('136-capability-matrix.md', line);

const ROWS = [
    [1, 'Bygone Effigy', '旧日神像', 127, 'release', 17, 16, 259, '开场减速1（slow，对手本回合每已打出一张牌受到攻击伤害+10%，向下取整、仅限攻击牌、每回合重置）；固定行动：沉睡（纯待机，不挂睡眠状态）→苏醒（力量+10）→此后每回合斩击13。官方页修订72459（2026-11-14）已明确Slow逐张加10%向下取整及纯待机无状态；A9斩击15及高阶HP132只记备注。'],
    [2, 'Byrdonis', '巢鸟领主', [81, 84], 'release', 18, 17, 260, '俯冲17与啄击3×3交替；领地1：每个自身回合结束力量+1，力量逐段加到啄击。A9伤害19与4×3、高阶HP90只记备注。'],
    [3, 'Phrog Parasite', '寄生蛙', [61, 64], 'release', 19, 18, 261, '固定交替：感染（弃牌堆洗入3张「感染」status-infection，回合末在手牌中造成3点伤害）→鞭击4×4；倒下触发deathSpawns生成4只非爪牙扭蠕虫（生命中点19，首回合晕厥待机，之后奇偶错位交替撕咬6与扭动塞感染1+力量+2），须击败全部扭蠕虫才判胜。官方页修订73081与Infection修订74066补全卡牌定义；玩家/敌方回合致死时点差异保留为来源边界，A9伤害5×4/7及高阶HP66–68只记备注。'],
    [4, 'Phantasmal Gardener', '幻影园丁', [26, 31], 'release', 20, 19, 262, '仅随固定四体遭遇幻影园丁同场：从左到右Flail、Bite、Lash、Enlarge起手，之后各自沿Bite→Lash→Flail→Enlarge循环；开场Skittish6，首次完整打出后给盾，不在多段之间给盾。', ['四体均为非爪牙；经批准仅该固定编组例外完整同场，不拆后备。', '每回合重置归属、完全格挡/零伤害、致死、多目标与Osty边界未闭合，沿用skittish项目口径，见59。A8/A9与高阶HP不混入基础模型。'], { encounterOnly: true }],
    [5, 'Skulking Colony', '潜伏虫群', 75, 'release', 21, 20, 263, '固定循环疾冲14、疾冲、惯性9并力量+2、穿刺7×2；硬化外壳20经 M6 shell（两次重置间累计失血≤层数，主角与自身回合开始各重置）。Boot/Doom 特例来源未闭合；A9力量3/4冲突、高阶数值与HP80只记备注。'],
    [6, 'Terror Eel', '恐鳗', 140, 'pending', 22, 21, 264, '阈值插入眩晕后的意图替换时点与恢复位置未给；易伤99层超状态上限。'],
    [7, 'Decimillipede', '十节蜈', [40, 46], 'release', 23, 22, 265, '多节段同场复活，复活后随机续招未给。'],
    [8, 'Entomancer', '驭虫师', 145, 'beta', 24, 23, 266, 'Beta 内容，隔离不入池；3×7 段数已可表达，个体蜂巢按伤害实例塞眩晕的边界未闭合。'],
    [9, 'Infested Prism', '寄生晶棱', 161, 'pending', 25, 24, 267, '玷污附着文本、施加时点与覆盖范围未给。'],
    [10, 'Flail Knight', '连枷骑士', 101, 'pending', 27, 26, 268, '后续三招权重未给，不套用事件骑士的权重。'],
    [11, 'Spectral Knight', '幽灵骑士', 93, 'pending', 28, 27, 269, '咒缚对战斗中生成牌的覆盖范围未核。'],
    [12, 'Magi Knight', '法师骑士', 82, 'pending', 29, 28, 270, '抑能解除时的升级恢复与临时升级交互未核。'],
    [13, 'Mecha Knight', '机甲骑士', 300, 'beta', 30, 29, 271, 'Beta 内容；手牌满时造牌及伤害与塞牌顺序未闭合。'],
    [14, 'Soul Nexus', '魂枢', 234, 'release', 31, 30, 272, '首招魂灼29；之后魂灼、魂涡6×4、汲命（18并易伤2、虚弱2）等权，同招不连用；汲命不带治疗。采用本地受限等权选择，不宣称复现原作随机数消耗；A9伤害31、7×4与19及高阶HP254只记备注。'],
];

const fields = { weight: 1, cooldown: 0, maxRepeat: 2 };
const once = { ...fields, maxRepeat: 1 };
// 已收录条目的原版模型，按来源键对应上表同一行；该行末项改作备注。
const wrigglerSkills = [
    skill('stunned', '初生晕厥', 'idle', [op('idle')], fields),
    skill('bite', '恶咬', 'attack', [atk(6)], fields),
    skill('wriggle', '扭动', 'buff', [op('create', { card: 'status-infection', amount: 1, to: 'discard' }), st('strength', 2, 'self')], fields),
];
const MODELS = {
    'Bygone Effigy': {
        skills: [
            skill('sleep', '沉睡', 'idle', [op('idle')], fields),
            skill('wake', '苏醒', 'buff', [st('strength', 10, 'self')], fields),
            skill('slashes', '斩击', 'attack', [atk(13)], { ...fields, maxRepeat: 0 }),
        ],
        script: cycle(['sleep', 'wake', 'slashes'], 2),
        passives: [passive('slow', '迟缓', 'battle-start', [ap('slow', 1, 'self')])],
    },
    Byrdonis: {
        skills: [skill('swoop', '俯冲', 'attack', [atk(17)], fields), skill('peck', '啄击', 'attack', [atk(3, 3)], fields)],
        script: cycle(['swoop', 'peck']),
        passives: [passive('territorial', '领地', 'turn-end', [st('strength', 1, 'self')])],
    },
    'Phrog Parasite': {
        skills: [
            skill('infect', '寄生感染', 'debuff', [op('create', { card: 'status-infection', amount: 3, to: 'discard' })], fields),
            skill('lash', '鞭击', 'attack', [atk(4, 4)], fields),
        ],
        script: cycle(['infect', 'lash']),
        kin: {
            wrigglerOdd: { name: '扭蠕虫', maxHp: 19, skills: wrigglerSkills, script: { opener: 'stunned', ...cycle(['bite', 'wriggle']) } },
            wrigglerEven: { name: '扭蠕虫', maxHp: 19, skills: wrigglerSkills, script: { opener: 'stunned', ...cycle(['wriggle', 'bite']) } },
        },
        deathSpawns: ['wrigglerOdd', 'wrigglerEven', 'wrigglerOdd', 'wrigglerEven'],
    },
    'Phantasmal Gardener': {
        skills: [
            skill('bite', '撕咬', 'attack', [atk(5)], fields),
            skill('lash', '抽击', 'attack', [atk(7)], fields),
            skill('flail', '乱舞', 'attack', [atk(1, 3)], fields),
            skill('enlarge', '膨胀', 'buff', [st('strength', 2, 'self')], fields),
        ],
        script: { opener: 'bite', next: { bite: [{ skill: 'lash', weight: 1 }], lash: [{ skill: 'flail', weight: 1 }],
            flail: [{ skill: 'enlarge', weight: 1 }], enlarge: [{ skill: 'bite', weight: 1 }] } },
        passives: [passive('skittish', '胆怯', 'battle-start', [ap('skittish', 6, 'self')])],
    },
    'Skulking Colony': {
        skills: [
            skill('zoom', '疾冲', 'attack', [atk(14)], fields),
            skill('inertia', '惯性', 'attack-buff', [atk(9), st('strength', 2, 'self')], fields),
            skill('stabs', '穿刺', 'attack', [atk(7, 2)], fields),
        ],
        script: cycle(['zoom', 'zoom', 'inertia', 'stabs']),
        passives: [passive('shell', '硬化外壳', 'battle-start', [ap('shell', 20, 'self')])],
    },
    'Soul Nexus': {
        skills: [
            skill('burn', '魂灼', 'attack', [atk(29)], once),
            skill('maelstrom', '魂涡', 'attack', [atk(6, 4)], once),
            skill('drain', '汲命', 'attack-debuff', [atk(18), st('vulnerable', 2, 'enemy'), st('weak', 2, 'enemy')], once),
        ],
        script: { opener: 'burn' },
    },
};

export const STS2_ELITES = Object.freeze(ROWS.map(([no, sourceKey, name, hp, status, line, auditLine, matrixLine, reason, notes = [], flags = {}]) => {
    const evidence = [base(line), audit(auditLine), matrix(matrixLine)];
    if (sourceKey === 'Phantasmal Gardener') evidence.push(ref('59-sts2-gardener-card-boundary.md', 14, 29));
    if (sourceKey === 'Bygone Effigy') evidence.push(ref('170-sts2-vantom-effigy-insatiable-wiring.md', 5, 24));
    if (sourceKey === 'Phrog Parasite') evidence.push(ref('58-sts2-phrog-wriggler-spawn.md', 12, 31), ref('171-sts2-phrog-wriggler-wiring.md', 5, 18));
    return MODELS[sourceKey]
        ? enemy('sts2', 'elite', no, name, 'elite', status, MODELS[sourceKey], { ...flags, sourceKey, hp, evidence, notes: [reason, ...notes] })
        : unavailableEnemy('sts2', 'elite', no, name, 'elite', status, { sourceKey, hp, reason, evidence });
}));
