// S1 第二幕：可保真条目登记原版模型；来源待证与已知能力限制分别保留，不用占位模型填池。
import { enemy, unavailableEnemy, skill, passive, atk, blk, st, ap, op, cycle } from './dsl.js';

const research = '.limcode/cache/enemy-research/';
const rows = [
    ['Byrd', '翎风鸟', 'normal', [25, 31], 'release', 23, 18, 71, '开场飞行3；啄击1×5、啼鸣力量+1、俯冲12按5:3:2选招，啄击禁三连、其余禁二连；首招只在啄击与啼鸣间按5:3重新归一，为项目选择，不宣称复现原作RNG。飞行归零立即改写为停顿，依次头槌3、重飞3，再回常规招池，不重走首招。沿用既有飞行逐段减伤及计数；零伤害、完全格挡、重置锚点与破空交互未获来源闭合。A2/A17数值只记备注。'],
    ['Chosen', '烙印祭司', 'normal', [95, 99], 'release', 23, 19, 72, '组间交替、组内随机已可用循环随机节点表达；S1妖术hex已支持非攻击牌后向持有者抽牌堆洗入层数张眩晕。23:29未给施加层数，持续及来源死亡清除也未闭合；value:5仅为每层估值、max:3仅为单次层数上限，不是来源初值。保持excluded，不套用S2 Hex，见缓存161。'],
    ['Spheric Guardian', '封垒浮卫', 'normal', 20, 'release', 23, 20, 73, '开场人工制品3、格挡40与固守；启动、削弱打击后按重击、硬化循环。固守解除规则来源未闭合，S1 单体无解除来源；A2/A17 数值只记备注。'],
    ['Shelled Parasite', '甲壳寄生兽', 'normal', [68, 72], 'release', 23, 21, 74, '开场甲层14：自身回合末获得等量格挡，不受敏捷/脆弱影响，未格挡的攻击伤害逐段减1层。首招双击6×2或吸血10，来源只证首回合禁重坠，等权为未补证的项目选择；此后双击/吸血/重坠18并脆弱2按2:2:1，前两招禁三连、重坠禁二连。甲层归零立即改写为停顿，每场一次，之后进入常规选招；吸血按实际失血回复。受限候选采用本地重新归一加权，不宣称复刻原作RNG；非攻击、零失血破甲与致死结算边界未闭合。A2伤害7×2/12/21、高阶HP70–75及A17首招重坠只记备注。'],
    ['Centurion', '执阵卫士', 'normal', [76, 80], 'release', 24, 17, 75, '同伴存活决定技能替换，随机同伴目标和独处行为不能保留为单体模板。'],
    ['Mystic', '祈愈术士', 'normal', [48, 56], 'release', 24, 18, 76, '选招依赖同伴失血与连续治疗条件；不能用独立技能权重替代。'],
    ['Snake Plant', '裂叶蛇株', 'normal', [75, 79], 'pending', 24, 19, 77, '开场Malleable3及通常65:35选招、攻击禁三连/孢子禁二连已有来源；Malleable逐击触发、递增、完全格挡与重置语义未证，A17后续序列另有编辑疑问。不套用相似受击加盾，保持pending，见缓存161。'],
    ['Snecko', '惑视蛇', 'normal', [114, 120], 'pending', 24, 20, 78, 'Confused 的费用范围、X费、不可打出牌及临时费用修正交互未定义。'],
    ['Book of Stabbing', '穿刺残卷', 'elite', [160, 164], 'release', 25, 17, 79, '连刺段数按使用次数增长的计数起点来源冲突（矩阵记+1、来源记+2且A18改按回合），不择一硬编；Painful Stabs 初值未给。'],
    ['Gremlin Leader', '妖群督领', 'elite', [140, 148], 'release', 25, 18, 80, '按随从数和上一招条件选招，且召唤指定种类随从，不能用现有随机池保真。'],
    ['Taskmaster', '鞭策监工', 'elite', [54, 60], 'release', 25, 19, 81, '每回合鞭笞7并向弃牌堆塞伤口1，来源只列这一招；页面带 ToUpdate，A2/A18 伤口张数与力量只记备注。'],
    ['The Champ', '傲战冠王', 'boss', 420, 'release', 30, 15, 82, '首招、每四回合Taunt的起算相位、重复Defensive候选的转移及半血与Taunt优先级来源未闭合。现有cycle随机节点可表达两随机一Execute，hpBelowPct可表达严格低于半血；inserts仅为概率插招，afterTurns仅为一次性阶段，不等于周期Taunt。next按限制过滤后重归一，不直接表达原始候选重定向；不猜取相位或用近似模型放行，核对见缓存152。'],
    ['The Collector', '薪魂收集者', 'boss', 282, 'release', 30, 23, 83, '首招召唤并补至两只炬首侍从；缺员时召唤/火球18/强化按25:45:30，满员时火球/强化按70:30。强化给同阵营全体力量3、自身格挡15，禁二连；火球禁三连。第四个自身回合固定施加虚弱/易伤/脆弱各3，仅一次，随后恢复数量分支。随从生命区间38–40按既有中点39换算，仅攻击7；按助手批准的行动条等待自身间隔，绑定爪牙随召唤者倒下退场、不计额外击杀，继承最终伤害倍率且不重复叠乘首领倍率。受限候选按本地种子重归一，不宣称复刻原作RNG；A4/A9/A19数值只记备注。'],
    ['Torch Head', '炬首侍从', 'normal', [38, 40], 'release', 30, 26, 84, '已在收集者 en-sts1-act2-13 的 kin.torch 中实现：生命区间中点39、冲撞7、绑定爪牙；不作为独立档案、遭遇成员或抽取候选。目录保留排除标记仅用于禁止单独入池，不代表随从行为未实现。'],
    ['Bronze Automaton', '铜铸战偶', 'boss', 300, 'release', 30, 31, 85, '召唤指定铜球且涉及暂扣牌返还；来源施工中，不能删去随从机制放行。'],
    ['Bronze Orb', '铜铸浮球', 'normal', [52, 58], 'release', 30, 33, 86, '仅作为随从；抽牌堆优先暂扣最高稀有度牌并死亡返手不能用永久夺牌替代。'],
];
const files = { 23: '23-sts1-act2-flight-guard.md', 24: '24-sts1-act2-support-confusion.md', 25: '25-sts1-act2-elites.md', 30: '30-sts1-act2-bosses.md' };

const fields = { weight: 1, cooldown: 0, maxRepeat: 2 };
const collectorPicks = [
    { skill: 'spawn', weight: 25, when: { kind: 'kin-lt', value: 2 } },
    { skill: 'fireball', weight: 45, when: { kind: 'kin-lt', value: 2 } },
    { skill: 'buff', weight: 30, when: { kind: 'kin-lt', value: 2 } },
    { skill: 'fireball', weight: 70, when: { kind: 'kin-gte', value: 2 } },
    { skill: 'buff', weight: 30, when: { kind: 'kin-gte', value: 2 } },
];
// 已收录条目的原版模型，按来源键对应上表同一行；该行末项改作备注。
const MODELS = {
    Byrd: {
        skills: [
            skill('peck', '啄击', 'attack', [atk(1, 5)], { ...fields, weight: 5 }),
            skill('caw', '啼鸣', 'buff', [st('strength', 1, 'self')], { ...fields, weight: 3, maxRepeat: 1 }),
            skill('swoop', '俯冲', 'attack', [atk(12)], { ...fields, weight: 2, maxRepeat: 1 }),
            skill('down', '击落停顿', 'idle', [op('idle')], fields),
            skill('butt', '头槌', 'attack', [atk(3)], fields),
            skill('fly', '重新升空', 'buff', [ap('flying', 3, 'self')], fields),
        ],
        script: {
            openers: [{ skill: 'peck', weight: 5 }, { skill: 'caw', weight: 3 }],
            next: Object.fromEntries(['peck', 'caw', 'swoop', 'down', 'butt', 'fly'].map((id) => [id,
                [{ skill: 'peck', weight: 5 }, { skill: 'caw', weight: 3 }, { skill: 'swoop', weight: 2 }]])),
            interrupts: [{ on: 'status-lost', status: 'flying', seq: ['down', 'butt', 'fly'], then: 'main', unstun: true }],
        },
        passives: [passive('airborne', '飞行', 'battle-start', [ap('flying', 3, 'self')])],
    },
    'Spheric Guardian': {
        skills: [
            skill('activate', '启动', 'defend', [blk(25)], fields),
            skill('debuff', '削弱打击', 'attack-debuff', [atk(10), st('frail', 5, 'enemy')], fields),
            skill('slam', '重击', 'attack', [atk(10, 2)], fields),
            skill('harden', '硬化', 'attack-defend', [atk(10), blk(15)], fields),
        ],
        script: cycle(['activate', 'debuff', 'slam', 'harden'], 2),
        passives: [passive('bulwark', '封垒', 'battle-start', [st('artifact', 3, 'self'), blk(40), ap('barricade', 1, 'self')])],
    },
    'Shelled Parasite': {
        skills: [
            skill('double', '双击', 'attack', [atk(6, 2)], { ...fields, weight: 2 }),
            skill('suck', '吸血', 'attack-buff', [op('drain', { amount: 10, hits: 1, target: 'enemy' })], { ...fields, weight: 2 }),
            skill('fell', '重坠', 'attack-debuff', [atk(18), st('frail', 2, 'enemy')], { ...fields, maxRepeat: 1 }),
            skill('down', '破甲停顿', 'idle', [op('idle')], { ...fields, maxUses: 1 }),
        ],
        script: { openers: [{ skill: 'double', weight: 1 }, { skill: 'suck', weight: 1 }],
            next: Object.fromEntries(['double', 'suck', 'fell', 'down'].map((id) => [id, [{ skill: 'double', weight: 2 }, { skill: 'suck', weight: 2 }, { skill: 'fell', weight: 1 }]])),
            interrupts: [{ on: 'status-lost', status: 'plated', seq: ['down'], then: 'main', once: true }] },
        passives: [passive('armor', '层叠甲壳', 'battle-start', [ap('plated', 14, 'self')])],
    },
    Taskmaster: {
        skills: [skill('whip', '鞭笞', 'attack-debuff', [atk(7), op('create', { card: 'status-wound', amount: 1, to: 'discard' })], fields)],
        script: cycle(['whip']),
    },
    'The Collector': {
        skills: [
            skill('spawn', '召来炬首', 'special', [op('summon-kin', { kin: ['torch'], amount: 2, cap: 2 })], { ...fields, weight: 5, maxRepeat: 0 }),
            skill('fireball', '火球', 'attack', [atk(18)], { ...fields, weight: 9 }),
            skill('buff', '薪魂强化', 'buff', [st('strength', 3, 'all-allies'), blk(15)], { ...fields, weight: 6, maxRepeat: 1 }),
            skill('mega', '衰败诅咒', 'debuff', [st('weak', 3, 'enemy'), st('vulnerable', 3, 'enemy'), st('frail', 3, 'enemy')], { ...fields, maxUses: 1 }),
        ],
        script: { opener: 'spawn', next: Object.fromEntries(['spawn', 'fireball', 'buff', 'mega'].map((id) => [id, collectorPicks])) },
        phases: [{ afterTurns: 4, intent: 'mega' }],
        kin: {
            torch: { name: '炬首侍从', maxHp: 39, minion: true,
                skills: [skill('tackle', '冲撞', 'attack', [atk(7)], { ...fields, maxRepeat: 0 })],
                script: cycle(['tackle']) },
        },
    },
};

export const STS1_ACT2 = Object.freeze(rows.map(([sourceKey, name, tier, hp, status, file, line, matrixLine, reason], index) => {
    const evidence = [{ file: `${research}${files[file]}`, lines: [line, line] },
        { file: `${research}136-capability-matrix.md`, lines: [matrixLine, matrixLine] }];
    return MODELS[sourceKey]
        ? enemy('sts1', 'act2', index + 1, name, tier, status, MODELS[sourceKey], { sourceKey, hp, evidence, notes: [reason] })
        : unavailableEnemy('sts1', 'act2', index + 1, name, tier, status, { sourceKey, hp, reason, evidence });
}));
