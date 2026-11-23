// S1 第二幕：可保真条目登记原版模型；来源待证与已知能力限制分别保留，不用占位模型填池。
import { enemy, unavailableEnemy, skill, passive, atk, blk, st, ap, op, cycle } from './dsl.js';

const research = '.limcode/cache/enemy-research/';
const rows = [
    ['Byrd', '翎风鸟', 'normal', [25, 31], 'release', 23, 18, 71, '开场飞行3；啄击1×5、啼鸣力量+1、俯冲12按5:3:2选招，啄击禁三连、其余禁二连；首招只在啄击与啼鸣间按5:3重新归一，为项目选择，不宣称复现原作RNG。飞行归零立即改写为停顿，依次头槌3、重飞3，再回常规招池，不重走首招。沿用既有飞行逐段减伤及计数；零伤害、完全格挡、重置锚点与破空交互未获来源闭合。A2/A17数值只记备注。'],
    ['Chosen', '烙印祭司', 'normal', [95, 99], 'release', 23, 19, 72, '组间交替、组内随机已可用循环随机节点表达；S1妖术hex已支持非攻击牌后向持有者抽牌堆洗入层数张眩晕。23:29未给施加层数，持续及来源死亡清除也未闭合；value:5仅为每层估值、max:3仅为单次层数上限，不是来源初值。保持excluded，不套用S2 Hex，见缓存161。'],
    ['Spheric Guardian', '封垒浮卫', 'normal', 20, 'release', 23, 20, 73, '开场人工制品3、格挡40与固守；启动、削弱打击后按重击、硬化循环。固守解除规则来源未闭合，S1 单体无解除来源；A2/A17 数值只记备注。'],
    ['Shelled Parasite', '甲壳寄生兽', 'normal', [68, 72], 'release', 23, 21, 74, '开场甲层14：自身回合末获得等量格挡，不受敏捷/脆弱影响，未格挡的攻击伤害逐段减1层。首招双击6×2或吸血10，来源只证首回合禁重坠，等权为未补证的项目选择；此后双击/吸血/重坠18并脆弱2按2:2:1，前两招禁三连、重坠禁二连。甲层归零立即改写为停顿，每场一次，之后进入常规选招；吸血按实际失血回复。受限候选采用本地重新归一加权，不宣称复刻原作RNG；非攻击、零失血破甲与致死结算边界未闭合。A2伤害7×2/12/21、高阶HP70–75及A17首招重坠只记备注。'],
    ['Centurion', '执阵卫士', 'normal', [76, 80], 'release', 24, 17, 75, '仅随固定双体遭遇「执阵与祈愈」（enc-centurion-mystic）同场，不单独入池。祈愈术士存活时按65:35选长矛劈斩12或盾阵护卫（protect-ally 15，独处时回落自保）；独处时将护卫替换为狂怒连斩6×3，任意招式禁三连（maxRepeat:2）。来源24:17,24、Centurion and Mystic修订68368与168；受限加权采用本地确定性实现，A2/A17数值及进阶HP78–83只记备注。'],
    ['Mystic', '祈愈术士', 'normal', [48, 56], 'release', 24, 18, 76, '仅随固定双体遭遇「执阵与祈愈」（enc-centurion-mystic）同场，不单独入池。同阵营任一存活单位失血达到16点时施放祈光愈合（全体回复16），至多连用两次；其余回合按60:40选裂甲法击8+脆弱2或战意鼓舞（全体力量+2），禁三连（maxRepeat:2）。来源24:18,25、Centurion and Mystic修订68368与168；受限加权采用本地确定性实现，A2/A17/A19数值及进阶HP50–58只记备注。'],
    ['Snake Plant', '裂叶蛇株', 'normal', [75, 79], 'pending', 24, 19, 77, '开场Malleable3及通常65:35选招、攻击禁三连/孢子禁二连已有来源；Malleable逐击触发、递增、完全格挡与重置语义未证，A17后续序列另有编辑疑问。不套用相似受击加盾，保持pending，见缓存161。'],
    ['Snecko', '惑视蛇', 'normal', [114, 120], 'release', 24, 20, 78, '首招惑视施加不叠加的混乱1，之后撕咬15/尾鞭8并易伤2按60:40；撕咬禁三连，尾鞭不加来源未给的连用限制。真实抽牌时数字费用随机为0–3，X费与不可打出牌跳过；回手/直接生成不重掷，复制保留随机费用，费用型升级复位，见缓存166。受限候选采用本项目种子加权，不宣称复现原作RNG；A2伤害18/10、高阶HP120–125与A17尾鞭虚弱2只记备注。'],
    ['Book of Stabbing', '穿刺残卷', 'elite', [160, 164], 'release', 25, 17, 79, '开场刺痛1（stabs，攻击造成未格挡生命损失时每段向目标弃牌堆塞1张伤口）；每回合按85:15选连刺（foe-volley，6×(已用次数+2)，禁三连）或重刺21（禁二连）。官方页Book of Stabbing修订68334明确非进阶计数起点为已用次数+2，消除了旧矩阵笔误；来源25:17、68334、Buffs修订66351与169。受限加权采用本地确定性实现，A3(7×N/24)、A18按回合计数及进阶HP168–172只记备注。'],
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
    Centurion: {
        skills: [
            skill('slash', '长矛劈斩', 'attack', [atk(12)], fields),
            skill('protect', '盾阵护卫', 'defend', [op('protect-ally', { amount: 15 })], fields),
            skill('fury', '狂怒连斩', 'attack', [atk(6, 3)], fields),
        ],
        script: {
            cycle: [[
                { skill: 'slash', weight: 65 },
                { skill: 'protect', weight: 35, when: { kind: 'allies-gte', value: 1 } },
                { skill: 'fury', weight: 35, when: { kind: 'allies-lt', value: 1 } },
            ]],
        },
    },
    Mystic: {
        skills: [
            skill('attack', '裂甲法击', 'attack-debuff', [atk(8), st('frail', 2, 'enemy')], fields),
            skill('buff', '战意鼓舞', 'buff', [st('strength', 2, 'all-allies')], fields),
            skill('heal', '祈光愈合', 'heal', [op('heal', { amount: 16, target: 'all-allies' })], fields),
        ],
        script: {
            cycle: [
                { skill: 'heal', when: { kind: 'ally-missing-hp-gte', value: 16 } },
                { skill: 'heal', when: { kind: 'ally-missing-hp-gte', value: 16 } },
                [{ skill: 'attack', weight: 60 }, { skill: 'buff', weight: 40 }],
            ],
        },
    },
    Snecko: {
        skills: [
            skill('glare', '惑视', 'debuff', [ap('confused', 1, 'enemy')], fields),
            skill('bite', '撕咬', 'attack', [atk(15)], { ...fields, weight: 6 }),
            skill('tail', '尾鞭', 'attack-debuff', [atk(8), st('vulnerable', 2, 'enemy')], { ...fields, weight: 4, maxRepeat: 0 }),
        ],
        script: { opener: 'glare', next: Object.fromEntries(['glare', 'bite', 'tail'].map((id) => [id,
            [{ skill: 'bite', weight: 60 }, { skill: 'tail', weight: 40 }]])) },
    },
    Taskmaster: {
        skills: [skill('whip', '鞭笞', 'attack-debuff', [atk(7), op('create', { card: 'status-wound', amount: 1, to: 'discard' })], fields)],
        script: cycle(['whip']),
    },
    'Book of Stabbing': {
        skills: [
            skill('multi', '连刺', 'attack', [op('foe-volley', { amount: 6, hits: 2, per: 1, every: 1, source: 'uses', track: 'stab' })], { ...fields, maxRepeat: 2 }),
            skill('big', '重刺', 'attack', [atk(21)], { ...fields, maxRepeat: 1 }),
        ],
        script: { cycle: [[{ skill: 'multi', weight: 85 }, { skill: 'big', weight: 15 }]] },
        passives: [passive('painful-stabs', '刺痛残页', 'battle-start', [ap('stabs', 1, 'self')])],
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

const ENCOUNTER_ONLY = new Set(['Centurion', 'Mystic']);

export const STS1_ACT2 = Object.freeze(rows.map(([sourceKey, name, tier, hp, status, file, line, matrixLine, reason], index) => {
    const evidence = [{ file: `${research}${files[file]}`, lines: [line, line] },
        { file: `${research}136-capability-matrix.md`, lines: [matrixLine, matrixLine] }];
    if (sourceKey === 'Snecko') evidence.push({ file: `${research}166-snecko-confused-wiring.md`, lines: [5, 12] });
    if (ENCOUNTER_ONLY.has(sourceKey)) evidence.push({ file: `${research}168-spire-growth-centurion-mystic-wiring.md`, lines: [5, 16] });
    if (sourceKey === 'Book of Stabbing') evidence.push({ file: `${research}169-sts1-book-maw-awakened-wiring.md`, lines: [5, 18] });
    return MODELS[sourceKey]
        ? enemy('sts1', 'act2', index + 1, name, tier, status, MODELS[sourceKey], { sourceKey, hp, evidence, notes: [reason], ...(ENCOUNTER_ONLY.has(sourceKey) ? { encounterOnly: true } : {}) })
        : unavailableEnemy('sts1', 'act2', index + 1, name, tier, status, { sourceKey, hp, reason, evidence });
}));
