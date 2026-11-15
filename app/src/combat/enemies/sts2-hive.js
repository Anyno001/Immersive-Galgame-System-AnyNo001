// S2 Hive：基础难度；可保真条目登记原版模型，其余保留来源、HP、证据与原因。Beta 内容保留 beta 状态，不进正式池。
import { enemy, unavailableEnemy, skill, passive, atk, blk, st, ap, op, cycle } from './dsl.js';

const research = '.limcode/cache/enemy-research/';
const ref = (file, from, to = from) => ({ file: `${research}${file}`, lines: [from, to] });
const base = (line) => ref('08-sts2-hive.md', line);
const audit = (line) => ref('96-sts2-hive-behavior-audit.md', line);
const matrix = (line) => ref('136-capability-matrix.md', line);

const ROWS = [
    [1, 'Bowlbug (Rock)', '岩壳碗虫', [45, 48], 'release', 17, audit(16), 202, '每回合头槌15；开场失重：对方有格挡且整次攻击被完全防住时自身眩晕1回合，之后恢复头槌。', ['失重能否转移给其他敌人的来源互相冲突，不实现传播；A9伤害16及高阶HP46–49只记备注。']],
    [2, 'Bowlbug (Egg)', '卵壳碗虫', [21, 22], 'release', 18, audit(17), 203, '每回合啃咬：伤害7并自身格挡7。', ['A9伤害与格挡8及高阶HP23–24只记备注。']],
    [3, 'Bowlbug (Silk)', '丝壳碗虫', [40, 43], 'pending', 19, audit(18), 204, '织网与连打交替，但独立正文未明确首招。'],
    [4, 'Bowlbug (Nectar)', '蜜壳碗虫', [35, 38], 'release', 20, audit(19), 205, '首招甩击3，随后增益一次力量+15，之后每回合甩击、不再增益；单效果层数上限10，拆为10层加5层。', ['A9力量16及高阶HP36–39只记备注。']],
    [5, 'Chomper', '咬钳兽', [60, 64], 'release', 21, audit(20), 206, '钳咬8×2与尖啸（弃牌堆塞眩晕3张）交替；开场人工制品2。', ['双体错位起手属遭遇层，单体从钳咬起手。', 'A9伤害9×2及高阶HP63–67只记备注。']],
    [6, 'Exoskeleton', '外骨甲虫', [24, 28], 'beta', 22, audit(21), 207, 'Beta 内容；碎步随机表与禁连用规则自相矛盾。'],
    [7, 'Hunter Killer', '猎杀者', 121, 'pending', 23, audit(22), 208, '穿刺连用规则未给，嫩化的嵌套出牌与来源死亡生命周期未闭合。'],
    [8, 'Louse Progenitor', '蜷虫始祖', [134, 136], 'beta', 24, audit(23), 209, 'Beta 内容；蜷身命中与清除时序未补。'],
    [9, 'Mysterious Knight（事件）', '神秘骑士', 101, 'release', 25, ref('95-sts2-mysterious-knight-event.md', 23, 25), 210, '首招冲撞15；之后破势（力量+3）、连枷9×2、冲撞按1:2:2选招，同招不连用；开场力量6与镀甲6。', ['灯笼钥匙事件战斗；事件奖励不收录，Type=Normal 按普通档登记。', '采用本地受限加权选择，不宣称复现原作随机数消耗；A9伤害10×2与17、高阶HP108只记备注。']],
    [10, 'Myte', '螨蚁', [61, 67], 'pending', 31, audit(25), 211, '双体首招与后续循环相位的衔接未给；Toxic 卡牌定义未核。'],
    [11, 'Ovicopter', '产卵飞蛾', [124, 130], 'release', 32, audit(26), 212, '召唤指定随从并按存活同伴数分支选招，不支持。'],
    [12, 'Tough Egg', '硬壳卵', [14, 18], 'release', 33, audit(27), 213, '仅由产卵飞蛾召唤；孵化变形不支持。'],
    [13, 'Slumbering Beetle', '眠甲虫', 86, 'release', 34, ref('90-sts2-slumbering-beetle-spiny-toad.md', 18, 39), 214, '开场镀甲15、睡眠3；自身回合结束或每次失血减一层，醒来卸甲，之后每回合滚击16并力量+2。', ['复用 M4 sleep.hurt:tick：完全格挡不减睡眠，减完立即重排意图、不附晕厥；自身回合末仍自然减层。失血与回合末的合并顺序、已行动/未行动的唤醒差异为项目既有语义，不宣称原作已证。', '来源未闭合开场格挡，不额外施加；A8镀甲18、A9伤害18及高阶HP89只记备注。']],
    [14, 'Spiny Toad', '棘背蟾', [116, 119], 'release', 35, audit(29), 215, '突刺（荆棘+5）、棘爆23并移除自身5层荆棘、舌鞭17三步循环；棘爆是单次攻击，不是自毁。', ['A9伤害25与19、高阶HP121–124只记备注。']],
    [15, 'The Obscura', '晦影', 123, 'release', 36, audit(30), 216, '召唤指定随从；之后三招随机权重未给。'],
    [16, 'Parafright', '惧影', 21, 'release', 37, audit(31), 217, '仅由晦影召唤的幻影随从，不单独成档。'],
    [17, 'Thieving Hopper', '窃牌跳虫', 79, 'release', 38, audit(32), 218, '偷取长期牌组成员并逃跑，依赖战斗外牌组。'],
    [18, 'Tunneler', '掘地虫', 87, 'release', 39, ref('93-sts2-tunneler-burrow-loop.md', 14, 32), 219, '首招啃咬13，之后潜地获得Burrowed与格挡32，持续每回合地底突袭23；潜地保留自身回合开始格挡，破盾后停顿一次，再从啃咬重启。', ['复用block-broken打断、shed与then:restart，按既有逐段伤害后立即改写意图；不额外叠加晕厥。移除潜地清空格挡，非伤害清盾与状态移除的联动、反伤/已行动时停顿消费、致死和Doom竞争仍保留来源边界。', 'A7/A8格挡37阈值冲突只记备注；A9伤害15/26及高阶HP92不混入基础档。现行固定搭档未证，不登记历史双体遭遇。']],
];

const fields = { weight: 1, cooldown: 0, maxRepeat: 2 };
// 已收录条目的原版模型，按来源键对应上表同一行；该行的说明与附注一并作备注。
const MODELS = {
    'Bowlbug (Rock)': {
        skills: [skill('headbutt', '头槌', 'attack', [atk(15)], fields)],
        script: cycle(['headbutt']),
        passives: [passive('imbalanced', '失重', 'battle-start', [ap('imbalanced', 1, 'self')])],
    },
    'Bowlbug (Egg)': {
        skills: [skill('bite', '啃咬', 'attack-defend', [atk(7), blk(7)], fields)],
        script: cycle(['bite']),
    },
    'Bowlbug (Nectar)': {
        skills: [
            skill('thrash', '甩击', 'attack', [atk(3)], fields),
            skill('buff', '蜜涌', 'buff', [st('strength', 10, 'self'), st('strength', 5, 'self')], fields),
        ],
        script: cycle(['thrash', 'buff', 'thrash'], 2),
    },
    Chomper: {
        skills: [
            skill('clamp', '钳咬', 'attack', [atk(8, 2)], fields),
            skill('screech', '尖啸', 'debuff', [op('create', { card: 'status-daze', amount: 3, to: 'discard' })], fields),
        ],
        script: cycle(['clamp', 'screech']),
        passives: [passive('artifact', '护符', 'battle-start', [st('artifact', 2, 'self')])],
    },
    'Mysterious Knight（事件）': {
        skills: [
            skill('ram', '冲撞', 'attack', [atk(15)], { ...fields, weight: 2, maxRepeat: 1 }),
            skill('breaker', '破势', 'buff', [st('strength', 3, 'self')], { ...fields, maxRepeat: 1 }),
            skill('flail', '连枷', 'attack', [atk(9, 2)], { ...fields, weight: 2, maxRepeat: 1 }),
        ],
        script: { opener: 'ram' },
        passives: [passive('armament', '武备', 'battle-start', [st('strength', 6, 'self'), ap('plating', 6, 'self')])],
    },
    'Slumbering Beetle': {
        skills: [
            skill('snore', '鼾眠', 'idle', [op('idle')], fields),
            skill('roll', '滚击', 'attack-buff', [atk(16), st('strength', 2, 'self')], fields),
        ],
        script: { ...cycle(['roll']), sleep: { skill: 'snore', turns: 3, hurt: 'tick', shed: ['plating'] } },
        passives: [passive('plating', '镀甲', 'battle-start', [ap('plating', 15, 'self')])],
    },
    'Spiny Toad': {
        skills: [
            skill('spikes', '突刺', 'buff', [st('thorns', 5, 'self')], fields),
            skill('explosion', '棘爆', 'attack', [atk(23), op('shed', { status: 'thorns', stacks: 5 })], fields),
            skill('lash', '舌鞭', 'attack', [atk(17)], fields),
        ],
        script: cycle(['spikes', 'explosion', 'lash']),
    },
    Tunneler: {
        skills: [
            skill('bite', '啃咬', 'attack', [atk(13)], fields),
            skill('burrow', '潜地', 'defend', [ap('burrowed', 1, 'self'), blk(32)], fields),
            skill('below', '地底突袭', 'attack', [atk(23)], { ...fields, maxRepeat: 0 }),
            skill('emerge', '破盾停顿', 'idle', [op('idle')], fields),
        ],
        script: { opener: 'bite', cycle: ['burrow', 'below'], loopFrom: 1,
            interrupts: [{ on: 'block-broken', status: 'burrowed', seq: ['emerge'], then: 'restart', shed: ['burrowed'] }] },
    },
};

export const STS2_HIVE = Object.freeze(ROWS.map(([no, sourceKey, name, hp, status, line, detail, matrixLine, reason, notes = []]) => {
    const evidence = [base(line), detail, matrix(matrixLine)];
    return MODELS[sourceKey]
        ? enemy('sts2', 'hive', no, name, 'normal', status, MODELS[sourceKey], { sourceKey, hp, evidence, notes: [reason, ...notes] })
        : unavailableEnemy('sts2', 'hive', no, name, 'normal', status, { sourceKey, hp, reason, notes, evidence });
}));
