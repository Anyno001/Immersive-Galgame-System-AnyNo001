// S2 Underdocks：基础难度；可保真条目登记原版模型，其余保留来源、HP、证据与原因，不写占位技能。
import { enemy, unavailableEnemy, skill, passive, atk, blk, st, ap, op, cycle } from './dsl.js';

const research = '.limcode/cache/enemy-research/';
const ref = (file, from, to = from) => ({ file: `${research}${file}`, lines: [from, to] });
const base = (line) => ref('13-sts2-underdocks.md', line);
const matrix = (line) => ref('136-capability-matrix.md', line);

const ROWS = [
    [1, 'Calcified Cultist', '钙壳信徒', [38, 41], 'release', 15, ref('77-sts2-cultists-slug-behavior.md', 18, 21), 173, '首招咒唱获得仪式2，之后每回合暗袭9；仪式在获得当回合不成长，之后每个自身回合末力量+2。', ['A9暗袭11及高阶HP39–42只记备注；与湿苔信徒同场属遭遇层。']],
    [2, 'Corpse Slug', '尸食蛞蝓', [25, 27], 'release', 16, ref('148-corpse-slug-opening-boundary.md', 5, 24), 174, 'ravenous即时吞食、眩晕成长与逐只首招配置已有；双体起手集合及三体阵位映射未由来源闭合，保留excluded，不以技能表顺序补造遭遇。', ['三招固定循环及开场Ravenous4已证；多名吞食者响应、同时死亡竞争、晕厥消费与恢复相位继续保留来源边界，见77与148。']],
    [3, 'Damp Cultist', '湿苔信徒', [51, 53], 'release', 17, ref('77-sts2-cultists-slug-behavior.md', 18, 20), 175, '首招咒唱获得仪式5，之后每回合暗袭1；仪式在获得当回合不成长，之后每个自身回合末力量+5。', ['A9仪式6、暗袭3及高阶HP52–54只记备注；与钙壳信徒同场属遭遇层。']],
    [4, 'Fossil Stalker', '化石潜猎者', [51, 53], 'pending', 18, ref('78-sts2-fossil-stalker-suck.md', 14, 31), 176, '开场Suck3是造成未格挡攻击伤害后获得力量，不是drain吸血；当前未登记Suck专用状态/结算。maxRepeat:0已支持不限连用，attack-after/action-after提供逐段及行动后钩子，但多段累计量与提交时点、Osty穿透去重、目标归并及致死/反伤顺序仍未闭合，保持pending、不可物化，不用逐段加力量或治疗近似，见缓存157。'],
    [5, 'Gremlin Merc', '佣兵小妖', [47, 49], 'release', 19, ref('79-sts2-gremlin-merc-heist.md', 14, 39), 177, 'setup.purse盗金、指定死亡生成及遁逃已有；现有steal-gold在持有者倒下钩子中返金，先于deathSpawns，不能表达Merc盗金转交指定Fat后由Fat被击杀返还。Thievery20按段/行动及完全格挡判定、金币转交与致死回调顺序仍待证，整组保留excluded，见缓存155。', ['三招高阶伤害阈值为A8，与其他招A9分开，只记备注。']],
    [6, 'Fat Gremlin（S2）', '携金小妖', [13, 17], 'release', 20, ref('79-sts2-gremlin-merc-heist.md', 22, 39), 178, '仅随Merc死亡生成，不独立入池；首个自身行动Spawned不做事，之后Flee。flee回合末倒计时及持有者倒下返金已有，但缺Merc向指定Fat转交盗金的链路；Type=Minion不等于随死去的Merc绑定退场，Heist与奖励边界见155。', ['开场 Heist：79:24 明确、13:20 未列，以单页正文为准记录冲突。']],
    [7, 'Sneaky Gremlin（S2）', '潜袭小妖（S2）', [10, 14], 'release', 21, ref('79-sts2-gremlin-merc-heist.md', 22, 26), 179, '仅随Merc死亡生成，首个自身行动Spawned不做事，此后每回合Tackle9；指定生成已有，但须随本体和Fat完整接线，不独立入池，不因Type=Minion套用绑定退场，见155。'],
    [8, 'Haunted Ship', '幽灵船', 63, 'release', 22, ref('80-sts2-haunted-ship-living-fog.md', 18, 22), 180, '首招作祟向弃牌堆塞眩晕5张并虚弱3，之后横扫13、践踏4×3交替；造牌单次上限3张，拆为3张加2张两个效果。', ['47 的脆弱来源清单与本页冲突，保留备注。', 'A9伤害14与5×3、高阶HP67只记备注。']],
    [9, 'Living Fog', '活雾', 80, 'release', 23, ref('146-sts2-living-fog-wiring.md', 5, 19), 181, '首招进阶毒气8并施加烟雾1；之后膨胀5并召唤一只气态炸弹、超级气爆8交替。', ['烟雾复用smoggy，每个自身回合最多打出1张技能牌，不叠加；额度重置、强制自动打牌与来源死亡解除沿用现有项目语义，来源精确事件边界仍保留。', '气态炸弹仅在kin.bomb实现：基础HP7、爆炸8后自毁；新随从等待自身行动间隔，继承最终damageScale，随本体倒下退场且不另计击杀，沿用已批准约定。', '交替段按正文Bloat、Super Gas Blast的顺序接线，不宣称独立验证原作第二回合与精确调度；场上容量沿用既有总位置限制，不另补同种数量上限。A8生命82/8、A9伤害9/6/9只记备注。']],
    [10, 'Gas Bomb', '气态炸弹', 7, 'release', 24, ref('146-sts2-living-fog-wiring.md', 5, 19), 182, '已在活雾kin.bomb实现，先爆炸8后自毁；保留禁止独立入池的目录标记。'],
    [11, 'Punch Construct', '拳击构装', 55, 'release', 25, ref('81-sts2-punch-seapunk-clam.md', 19, 23), 183, '预备（格挡10）、快拳5×2加脆弱1、重拳14三步循环，预备每轮都出；开场人工制品1。', ['A9伤害6×2与16、高阶HP60只记备注；Punch Off 事件的初始缺血覆写与跨区域同场不收录。']],
    [12, 'Seapunk', '海潮浪客', [44, 46], 'release', 26, ref('81-sts2-punch-seapunk-clam.md', 27, 31), 184, '海踢11、回旋踢2×4、嗝泡（格挡7并力量+1）三步循环，四段攻击保留；累计力量不写回基础值。', ['格挡高阶阈值A8/A9标注冲突、A9海踢13与力量2及高阶HP47–49只记备注。']],
    [13, 'Sewer Clam', '暗渠蚌', 56, 'release', 27, ref('81-sts2-punch-seapunk-clam.md', 36, 39), 185, '首招喷射10，之后增压（力量+4）与喷射交替；开场镀甲8：自身回合末获得层数格挡，自身回合开始减1层。', ['A8镀甲9、A9喷射11及高阶HP58只记备注。']],
    [14, 'Sludge Spinner', '淤泥纺蛛', [37, 39], 'pending', 28, ref('82-sts2-spinner-toadpole-behavior.md', 18, 22), 186, '首招后三招随机禁连用但权重未给，不补等权；历史HP上限冲突未解。'],
    [15, 'Toadpole', '蝌刺蟾', [21, 25], 'release', 29, ref('82-sts2-spinner-toadpole-behavior.md', 26, 29), 187, '回旋7、生刺（荆棘+2）、刺吐3×3并移除自身2层荆棘三步循环。', ['弱池前方实例从生刺起手属遭遇层；来源未说明荆棘不足2层时的处理，引擎按现有层数移除。', 'A9伤害8与4×3、高阶HP22–26只记备注。']],
    [16, 'Two-Tailed Rat', '双尾鼠', [17, 21], 'release', 30, ref('83-sts2-two-tailed-rat-summons.md', 14, 31), 188, '指定召唤与单体技能maxUses:1已有；summon-kin的cap只限同一召唤者同种在场数，不是整组累计三次额度。createKin继承同一kin表，不能因禁止嵌套定义而断言新生鼠无法召唤；其召唤资格仍待来源确认。三体首招阵位、普通选招权重、召唤概率/优先级、两回合起算、共享计数生命周期与Screech额外冷却未闭合，保留excluded，不补等权或近似遭遇，见缓存154。'],
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
    'Living Fog': {
        skills: [
            skill('advanced', '进阶毒气', 'attack-debuff', [atk(8), ap('smoggy', 1, 'enemy')], fields),
            skill('bloat', '膨胀', 'attack', [atk(5), op('summon-kin', { kin: ['bomb'], amount: 1 })], fields),
            skill('blast', '超级气爆', 'attack', [atk(8)], fields),
        ],
        script: { opener: 'advanced', ...cycle(['bloat', 'blast']) },
        kin: {
            bomb: { name: '气态炸弹', maxHp: 7, minion: true,
                skills: [skill('explode', '爆炸', 'attack', [atk(8), op('self-destruct')], { ...fields, maxRepeat: 0 })],
                script: cycle(['explode']) },
        },
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
