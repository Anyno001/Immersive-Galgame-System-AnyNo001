// S2 精英：基础难度；Knight Gang 为组合占位不建条目。可保真条目登记原版模型，Beta 保留 beta 状态。
import { enemy, unavailableEnemy, skill, passive, atk, st, ap, cycle } from './dsl.js';

const research = '.limcode/cache/enemy-research/';
const ref = (file, from, to = from) => ({ file: `${research}${file}`, lines: [from, to] });
const base = (line) => ref('10-sts2-elites.md', line);
const audit = (line) => ref('114-sts2-elite-behavior-audit.md', line);
const matrix = (line) => ref('136-capability-matrix.md', line);

const ROWS = [
    [1, 'Bygone Effigy', '旧日神像', 127, 'pending', 17, 16, 259, '迟缓是否计入当前牌及重置事件未证，不借相近倍率补足。'],
    [2, 'Byrdonis', '巢鸟领主', [81, 84], 'release', 18, 17, 260, '俯冲17与啄击3×3交替；领地1：每个自身回合结束力量+1，力量逐段加到啄击。A9伤害19与4×3、高阶HP90只记备注。'],
    [3, 'Phrog Parasite', '寄生蛙', [61, 64], 'release', 19, 18, 261, '死亡召唤4只指定随从且须继续击败；感染卡牌定义未读。'],
    [4, 'Phantasmal Gardener', '幻影园丁', [26, 31], 'release', 20, 19, 262, '精英强度由四体错位同场构成，单体模板失真。'],
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
const MODELS = {
    Byrdonis: {
        skills: [skill('swoop', '俯冲', 'attack', [atk(17)], fields), skill('peck', '啄击', 'attack', [atk(3, 3)], fields)],
        script: cycle(['swoop', 'peck']),
        passives: [passive('territorial', '领地', 'turn-end', [st('strength', 1, 'self')])],
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

export const STS2_ELITES = Object.freeze(ROWS.map(([no, sourceKey, name, hp, status, line, auditLine, matrixLine, reason]) => {
    const evidence = [base(line), audit(auditLine), matrix(matrixLine)];
    return MODELS[sourceKey]
        ? enemy('sts2', 'elite', no, name, 'elite', status, MODELS[sourceKey], { sourceKey, hp, evidence, notes: [reason] })
        : unavailableEnemy('sts2', 'elite', no, name, 'elite', status, { sourceKey, hp, reason, evidence });
}));
