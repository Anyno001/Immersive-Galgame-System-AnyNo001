// S2 Underdocks：基础难度；可保真条目登记原版模型，其余保留来源、HP、证据与原因，不写占位技能。
import { enemy, unavailableEnemy, skill, passive, atk, blk, st, ap, op, cycle } from './dsl.js';

const research = '.limcode/cache/enemy-research/';
const ref = (file, from, to = from) => ({ file: `${research}${file}`, lines: [from, to] });
const base = (line) => ref('13-sts2-underdocks.md', line);
const matrix = (line) => ref('136-capability-matrix.md', line);

const ROWS = [
    [1, 'Calcified Cultist', '钙壳信徒', [38, 41], 'release', 15, ref('77-sts2-cultists-slug-behavior.md', 18, 21), 173, '首招咒唱获得仪式2，之后每回合暗袭9；仪式在获得当回合不成长，之后每个自身回合末力量+2。', ['A9暗袭11及高阶HP39–42只记备注；与湿苔信徒同场属遭遇层。']],
    [2, 'Corpse Slug', '尸食蛞蝓', [25, 27], 'release', 16, ref('77-sts2-cultists-slug-behavior.md', 26, 30), 174, '同伴死亡吞食、自身眩晕并成长不支持；多实例错位起手依赖多体遭遇。'],
    [3, 'Damp Cultist', '湿苔信徒', [51, 53], 'release', 17, ref('77-sts2-cultists-slug-behavior.md', 18, 20), 175, '首招咒唱获得仪式5，之后每回合暗袭1；仪式在获得当回合不成长，之后每个自身回合末力量+5。', ['A9仪式6、暗袭3及高阶HP52–54只记备注；与钙壳信徒同场属遭遇层。']],
    [4, 'Fossil Stalker', '化石潜猎者', [51, 53], 'pending', 18, ref('78-sts2-fossil-stalker-suck.md', 15, 26), 176, '吸取成长的多段合并、目标归并与反伤时序未决；允许无限连用，不能写成连用上限。'],
    [5, 'Gremlin Merc', '佣兵小妖', [47, 49], 'release', 19, ref('79-sts2-gremlin-merc-heist.md', 14, 22), 177, '战斗内无金币可盗，死亡生成两种指定随从不支持。', ['三招高阶伤害阈值为A8，与其他招A9分开，只记备注。']],
    [6, 'Fat Gremlin（S2）', '携金小妖', [13, 17], 'release', 20, ref('79-sts2-gremlin-merc-heist.md', 24, 26), 178, '仅由佣兵小妖死亡生成，携金逃跑与击杀返金不支持。', ['开场 Heist：79:24 明确、13:20 未列，以单页正文为准记录冲突。']],
    [7, 'Sneaky Gremlin（S2）', '潜袭小妖（S2）', [10, 14], 'release', 21, ref('79-sts2-gremlin-merc-heist.md', 23), 179, '仅由佣兵小妖死亡生成的随从，不单独成档。'],
    [8, 'Haunted Ship', '幽灵船', 63, 'release', 22, ref('80-sts2-haunted-ship-living-fog.md', 18, 22), 180, '首招作祟向弃牌堆塞眩晕5张并虚弱3，之后横扫13、践踏4×3交替；造牌单次上限3张，拆为3张加2张两个效果。', ['47 的脆弱来源清单与本页冲突，保留备注。', 'A9伤害14与5×3、高阶HP67只记备注。']],
    [9, 'Living Fog', '活雾', 80, 'release', 23, ref('80-sts2-haunted-ship-living-fog.md', 26, 29), 181, '召唤指定随从气爆弹；每回合只能打出1张技能牌的雾霭与既有限制状态语义不同。'],
    [10, 'Gas Bomb', '气爆弹', 7, 'release', 24, ref('80-sts2-haunted-ship-living-fog.md', 30, 31), 182, '仅由活雾召唤，先爆炸后自毁，不单独成档。'],
    [11, 'Punch Construct', '拳击构装', 55, 'release', 25, ref('81-sts2-punch-seapunk-clam.md', 19, 23), 183, '预备（格挡10）、快拳5×2加脆弱1、重拳14三步循环，预备每轮都出；开场人工制品1。', ['A9伤害6×2与16、高阶HP60只记备注；Punch Off 事件的初始缺血覆写与跨区域同场不收录。']],
    [12, 'Seapunk', '海潮浪客', [44, 46], 'release', 26, ref('81-sts2-punch-seapunk-clam.md', 27, 31), 184, '海踢11、回旋踢2×4、嗝泡（格挡7并力量+1）三步循环，四段攻击保留；累计力量不写回基础值。', ['格挡高阶阈值A8/A9标注冲突、A9海踢13与力量2及高阶HP47–49只记备注。']],
    [13, 'Sewer Clam', '暗渠蚌', 56, 'release', 27, ref('81-sts2-punch-seapunk-clam.md', 36, 39), 185, '首招喷射10，之后增压（力量+4）与喷射交替；开场镀甲8：自身回合末获得层数格挡，自身回合开始减1层。', ['A8镀甲9、A9喷射11及高阶HP58只记备注。']],
    [14, 'Sludge Spinner', '淤泥纺蛛', [37, 39], 'pending', 28, ref('82-sts2-spinner-toadpole-behavior.md', 18, 22), 186, '首招后三招随机禁连用但权重未给，不补等权；历史HP上限冲突未解。'],
    [15, 'Toadpole', '蝌刺蟾', [21, 25], 'release', 29, ref('82-sts2-spinner-toadpole-behavior.md', 26, 29), 187, '回旋7、生刺（荆棘+2）、刺吐3×3并移除自身2层荆棘三步循环。', ['弱池前方实例从生刺起手属遭遇层；来源未说明荆棘不足2层时的处理，引擎按现有层数移除。', 'A9伤害8与4×3、高阶HP22–26只记备注。']],
    [16, 'Two-Tailed Rat', '双尾鼠', [17, 21], 'release', 30, ref('83-sts2-two-tailed-rat-summons.md', 14, 25), 188, '召唤同类且有单体与整组次数上限，召唤概率与选招权重未给。'],
];

const fields = { weight: 1, cooldown: 0, maxRepeat: 2 };
const daze = (amount) => op('create', { card: 'status-daze', amount, to: 'discard' });
const cultist = (ritual, damage) => ({
    skills: [skill('incant', '咒唱', 'buff', [ap('ritual', ritual, 'self')], fields), skill('strike', '暗袭', 'attack', [atk(damage)], fields)],
    script: { opener: 'incant', ...cycle(['strike']) },
});
// 已收录条目的原版模型，按来源键对应上表同一行；该行的说明与附注一并作备注。
const MODELS = {
    'Calcified Cultist': cultist(2, 9),
    'Damp Cultist': cultist(5, 1),
    'Haunted Ship': {
        skills: [
            skill('haunt', '作祟', 'debuff', [daze(3), daze(2), st('weak', 3, 'enemy')], fields),
            skill('swipe', '横扫', 'attack', [atk(13)], fields),
            skill('stomp', '践踏', 'attack', [atk(4, 3)], fields),
        ],
        script: { opener: 'haunt', ...cycle(['swipe', 'stomp']) },
    },
    'Punch Construct': {
        skills: [
            skill('ready', '预备', 'defend', [blk(10)], fields),
            skill('fast', '快拳', 'attack-debuff', [atk(5, 2), st('frail', 1, 'enemy')], fields),
            skill('strong', '重拳', 'attack', [atk(14)], fields),
        ],
        script: cycle(['ready', 'fast', 'strong']),
        passives: [passive('artifact', '护符', 'battle-start', [st('artifact', 1, 'self')])],
    },
    Seapunk: {
        skills: [
            skill('kick', '海踢', 'attack', [atk(11)], fields),
            skill('spin', '回旋踢', 'attack', [atk(2, 4)], fields),
            skill('burp', '嗝泡', 'buff', [blk(7), st('strength', 1, 'self')], fields),
        ],
        script: cycle(['kick', 'spin', 'burp']),
    },
    'Sewer Clam': {
        skills: [skill('jet', '喷射', 'attack', [atk(10)], fields), skill('pressurize', '增压', 'buff', [st('strength', 4, 'self')], fields)],
        script: cycle(['jet', 'pressurize']),
        passives: [passive('plating', '镀甲', 'battle-start', [ap('plating', 8, 'self')])],
    },
    Toadpole: {
        skills: [
            skill('whirl', '回旋', 'attack', [atk(7)], fields),
            skill('spiken', '生刺', 'buff', [st('thorns', 2, 'self')], fields),
            skill('spit', '刺吐', 'attack', [atk(3, 3), op('shed', { status: 'thorns', stacks: 2 })], fields),
        ],
        script: cycle(['whirl', 'spiken', 'spit']),
    },
};

export const STS2_UNDERDOCKS = Object.freeze(ROWS.map(([no, sourceKey, name, hp, status, line, detail, matrixLine, reason, notes = []]) => {
    const evidence = [base(line), detail, matrix(matrixLine)];
    return MODELS[sourceKey]
        ? enemy('sts2', 'underdocks', no, name, 'normal', status, MODELS[sourceKey], { sourceKey, hp, evidence, notes: [reason, ...notes] })
        : unavailableEnemy('sts2','underdocks', no, name, 'normal', status, { sourceKey, hp, reason, notes, evidence });
}));
