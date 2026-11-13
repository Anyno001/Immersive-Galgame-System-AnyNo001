// S1 第一幕：基础难度；来源区间保留，归一化参考取区间中点。
import { enemy, unavailableEnemy, skill, passive, atk, blk, st, ap, op, cycle } from './dsl.js';

const fields = (weight = 1) => ({ weight, cooldown: 0, maxRepeat: 2 });
const flags = (sourceKey, hp, file, lines, notes = []) => ({ sourceKey, hp, evidence: [{ file, lines }], notes });
const slimeSource = '.limcode/cache/enemy-research/19-sts1-slimes.md';
const gremlinSource = '.limcode/cache/enemy-research/20-sts1-gremlins.md';
const slaverSource = '.limcode/cache/enemy-research/21-sts1-slavers-thieves.md';
const research = '.limcode/cache/enemy-research/';
const unavailable = (no, sourceKey, name, tier, hp, status, file, lines, matrixLine, reason) => unavailableEnemy(
    'sts1', 'act1', no, name, tier, status,
    { sourceKey, hp, reason,
        evidence: [{ file: `${research}${file}`, lines }, { file: `${research}136-capability-matrix.md`, lines: [matrixLine, matrixLine] }],
    },
);

// 无法准入的来源记录显式保留空模型；不以可运行的近似招式冒充原行为。
const UNAVAILABLE = [
    [1, 'Cultist', '祭火信徒', 'normal', [48, 54], 'pending', '17-sts1-cultist-query-check.md', [14, 26], 39, 'S1 Ritual 获得当回合是否成长未闭合；不能套用 S2 跳过首次回合末的机制。'],
    [3, 'Red Louse', '赤背蜷虫', 'normal', [10, 15], 'pending', '18-sts1-act1-small.md', [17, 25], 41, 'Curl Up 的完全格挡、零伤害和移除边界未闭合；Bite 另有开战定值随机范围。'],
    [4, 'Green Louse', '青背蜷虫', 'normal', [11, 17], 'pending', '18-sts1-act1-small.md', [18, 25], 42, 'Curl Up 边界同 Red Louse，不能用普通受击加盾替代；进阶连用冲突只保留来源备注。'],
    [6, 'Spike Slime (L)', '巨刺黏体', 'normal', [64, 70], 'release', '19-sts1-slimes.md', [15, 28], 44, '半血打断当前意图后生成两只不同技能的中型子体；现有 split 即时复制自身，语义不等价。'],
    [9, 'Acid Slime (L)', '巨蚀黏体', 'normal', [65, 69], 'release', '19-sts1-slimes.md', [18, 28], 47, '半血改写意图并分裂为两只中型子体，不能用受伤即时复制自身替代。'],
    [11, 'Acid Slime (S)', '幼蚀黏体', 'normal', [8, 12], 'pending', '19-sts1-slimes.md', [20, 30], 49, '基础招式已知，但首招、循环和概率未给，不能按技能表顺序推断。'],
    [13, 'Mad Gremlin', '暴怒小妖', 'normal', [20, 24], 'pending', '20-sts1-gremlins.md', [16, 27], 51, 'Angry 的逐段、完全格挡和间接伤害边界未给，不能替换为现有受击成长。'],
    [14, 'Shield Gremlin', '护盾小妖', 'normal', [12, 15], 'release', '20-sts1-gremlins.md', [17, 24], 52, '选招依赖同伴存活且涉及随机同伴目标；单体模板不能保留该遭遇关系。'],
    [18, 'Red Slaver', '赤衣役使者', 'normal', [46, 50], 'release', '21-sts1-slavers-thieves.md', [14, 22], 56, '一次性概率插入束缚且用后切换选招策略，现有回合/血量阶段无法表达。'],
    [24, 'Slime Boss', '聚胶王', 'boss', 140, 'release', '29-sts1-act1-bosses.md', [17, 20], 62, '半血改写意图并生成酸/刺两类大型子体；现有召唤和分裂不能保留子体技能与继承。'],
    [26, 'Hexaghost', '六焰幽核', 'boss', 250, 'release', '29-sts1-act1-bosses.md', [33, 37], 64, 'Divider 每段伤害依玩家回合开始HP计算，无对应数值算子；战斗内升级全部灼痕亦不支持。'],
];

// Looter / Mugger：前两回合 Mug，第三回合等概率 Lunge 或 Smoke Bomb；Lunge 后接 Smoke Bomb，Smoke Bomb 后 Escape（21:23-24）。
// 两次 Mug 用两个技能 ID 区分，供 next 转移表定位第三回合分叉；Escape 自挂 1 层遁逃，本回合结束撤离并带走盗金（M7）。
const thief = (steal, mug, lunge, smoke) => ({
    skills: [
        skill('mug', '劫掠', 'attack', [atk(mug), op('steal-gold', { amount: steal })], fields()),
        skill('mug2', '再劫', 'attack', [atk(mug), op('steal-gold', { amount: steal })], fields()),
        skill('lunge', '扑刺', 'attack', [atk(lunge), op('steal-gold', { amount: steal })], fields()),
        skill('smoke', '烟幕弹', 'defend', [blk(smoke)], fields()),
        skill('escape', '遁走', 'special', [ap('flee', 1, 'self')], fields()),
    ],
    script: { opener: 'mug', next: {
        mug: [{ skill: 'mug2', weight: 1 }],
        mug2: [{ skill: 'lunge', weight: 1 }, { skill: 'smoke', weight: 1 }],
        lunge: [{ skill: 'smoke', weight: 1 }],
        smoke: [{ skill: 'escape', weight: 1 }],
        escape: [{ skill: 'escape', weight: 1 }],
    } },
});
const thiefNotes = ['Thievery 每次攻击盗金，击倒返还实际盗取额、撤离带走（M7 steal-gold）；来源未给是否须造成失血、零金币与多段边界（21:29），按项目选择出招即偷、按余额封顶。', 'A2/A17 数值及进阶HP只记备注；与 Louse/中型黏体、Mugger 的同场组合属遭遇层。'];

export const STS1_ACT1 = Object.freeze([
    enemy('sts1', 'act1', 2, '裂颚虫', 'normal', 'release',
        { skills: [
            skill('chomp', '撕咬', 'attack', [atk(11)], fields()),
            skill('bellow', '咆哮', 'buff', [st('strength', 3, 'self'), blk(6)], fields()),
            skill('thrash', '翻滚', 'attack-defend', [atk(7), blk(5)], fields()),
        ], script: { opener: 'chomp', next: {
            chomp: [{ skill: 'bellow', weight: 59 }, { skill: 'thrash', weight: 41 }],
            bellow: [{ skill: 'thrash', weight: 56 }, { skill: 'chomp', weight: 44 }],
            thrash: [{ skill: 'bellow', weight: 45 }, { skill: 'thrash', weight: 30 }, { skill: 'chomp', weight: 25 }],
        } } },
        { sourceKey: 'Jaw Worm（第一幕）', hp: [40, 44],
            evidence: [{ file: `${research}18-sts1-act1-small.md`, lines: [16, 16] }, { file: `${research}37-sts1-opening-behavior.md`, lines: [28, 36] },
                { file: `${research}136-capability-matrix.md`, lines: [40, 40] }],
            notes: ['第一幕常规型首招固定撕咬；之后按上一招转移：撕咬后咆哮59/翻滚41，咆哮后翻滚56/撕咬44，翻滚后咆哮45/翻滚30/撕咬25；翻滚连用两次后由连用上限滤掉，余下按45:25即约64/36，与来源一致。',
                '转移概率为页面展示值，未证明底层重抽与随机数消耗，按本地受限加权实现；页面未把转移表单独标给常规型或第三幕 Hard 型，按共用处理。',
                '第三幕 Hard 型（开场已得咆哮效果、首招分布不同）不在本条；A2/A17 数值及进阶HP只记备注。'] }),
    enemy('sts1', 'act1', 8, '小刺黏体', 'normal', 'release',
        { skills: [skill('tackle', '短距冲撞', 'attack', [atk(5)], fields())], script: cycle(['tackle']) },
        flags('Spike Slime (S)', [10, 14], slimeSource, [17, 29], ['基础伤害5；A2伤害6及进阶HP不混入基准。'])),
    enemy('sts1', 'act1', 12, '迟钝小妖', 'normal', 'release',
        { skills: [skill('smash', '迟滞重拍', 'attack-debuff', [atk(4), st('weak', 1, 'enemy')], fields())], script: cycle(['smash']) },
        flags('Fat Gremlin', [13, 17], gremlinSource, [15, 23], ['A2伤害5、A17额外脆弱1及进阶HP只作来源备注。'])),
    enemy('sts1', 'act1', 15, '潜袭小妖', 'normal', 'release',
        { skills: [skill('puncture', '暗步穿刺', 'attack', [atk(9)], fields())], script: cycle(['puncture']) },
        flags('Sneaky Gremlin', [10, 14], gremlinSource, [18, 23], ['A2伤害10及进阶HP不混入基准。'])),
    enemy('sts1', 'act1', 17, '蓝衣役使者', 'normal', 'release',
        { skills: [skill('stab', '直刺', 'attack', [atk(12)], fields(3)), skill('rake', '钩刃拖斩', 'attack-debuff', [atk(7), st('weak', 1, 'enemy')], fields(2))] },
        flags('Blue Slaver', [46, 50], slaverSource, [13, 20], ['基础权重3:2、同招最多连用2次；采用本地受限加权，不宣称复现原作RNG。', 'A2伤害13/8、A17虚弱2并禁连钩斩及进阶HP只记备注。'])),
    enemy('sts1', 'act1', 5, '孢冠兽', 'normal', 'release',
        { skills: [skill('bite', '撕咬', 'attack', [atk(6)], fields(3)), skill('grow', '滋长', 'buff', [st('strength', 3, 'self')], { ...fields(2), maxRepeat: 1 })],
            passives: [passive('spores', '孢云', 'battle-start', [ap('death-curse', 2, 'self')])] },
        flags('Fungi Beast', [22, 28], `${research}18-sts1-act1-small.md`, [19, 19],
            ['Bite/Grow 3:2，Bite 不连用三次、Grow 不连用两次（136:43）；孢云死亡时对方易伤2由 death-curse 表达。', 'A2/A17 力量4/5 及进阶HP只记备注。'])),
    enemy('sts1', 'act1', 7, '中刺黏体', 'normal', 'release',
        { skills: [
            skill('lick', '舔舐', 'debuff', [st('frail', 1, 'enemy')], fields(7)),
            skill('tackle', '焰撞', 'attack-debuff', [atk(8), op('create', { card: 'status-slime', amount: 1, to: 'discard' })], fields(3)),
        ] },
        flags('Spike Slime (M)', [28, 32], slimeSource, [16, 24], ['Lick/Flame Tackle 7:3、同招不连用三次（19:24 沿用 L 的模式，不继承分裂）。', 'A2伤害10及进阶HP只记备注。'])),
    enemy('sts1', 'act1', 10, '中蚀黏体', 'normal', 'release',
        { skills: [
            skill('spit', '蚀液', 'attack-debuff', [atk(7), op('create', { card: 'status-slime', amount: 1, to: 'discard' })], fields(3)),
            skill('lick', '舔舐', 'debuff', [st('weak', 1, 'enemy')], fields(3)),
            skill('tackle', '冲撞', 'attack', [atk(10)], { ...fields(4), maxRepeat: 1 }),
        ] },
        flags('Acid Slime (M)', [28, 32], slimeSource, [19, 26], ['Corrosive Spit/Lick/Tackle 3:3:4；Tackle 不连用两次、其余不连用三次（19:25-26）。', 'A17 权重4:2:4 与 Lick 禁连、A2伤害8/12及进阶HP只记备注。'])),
    enemy('sts1', 'act1', 16, '蓄咒小妖', 'normal', 'release',
        { skills: [skill('charge', '蓄咒', 'idle', [op('idle')], fields()), skill('blast', '终极爆裂', 'attack', [atk(25)], fields())],
            script: cycle(['charge', 'charge', 'blast', 'charge', 'charge', 'charge', 'blast'], 3) },
        flags('Gremlin Wizard', [21, 25], gremlinSource, [19, 25], ['开场蓄咒两次后爆裂，此后蓄咒三次、爆裂一次循环；蓄咒为真正不行动（idle）。', 'A17 改为首次爆裂后每回合爆裂、A2伤害30及进阶HP只记备注。'])),
    enemy('sts1', 'act1', 21, '蛮怒魁妖', 'elite', 'release',
        { skills: [
            skill('bellow', '咆哮', 'buff', [ap('rile', 2, 'self')], { ...fields(), maxUses: 1 }),
            skill('bash', '碎颅击', 'attack-debuff', [atk(6), st('vulnerable', 2, 'enemy')], { ...fields(1), maxRepeat: 3 }),
            skill('rush', '蛮牛冲', 'attack', [atk(14)], fields(2)),
        ], script: { opener: 'bellow' } },
        flags('Gremlin Nob', [82, 86], `${research}22-sts1-act1-elites.md`, [17, 23],
            ['首招咆哮（恼怒2：对方打出技能牌时力量+2，能力牌不计）；之后碎颅击/蛮牛冲 1:2，蛮牛冲不连用三次。', '来源未限制碎颅击连用，按引擎上限取3（四连禁止为残余差异）；A3/A18 数值与循环只记备注。'])),
    enemy('sts1', 'act1', 23, '巡弋光哨', 'elite', 'release',
        { skills: [
            skill('bolt', '眩光', 'debuff', [op('create', { card: 'status-daze', amount: 2, to: 'discard' })], fields()),
            skill('beam', '射线', 'attack', [atk(9)], fields()),
        ], script: cycle(['bolt', 'beam']), passives: [passive('artifact', '护符', 'battle-start', [st('artifact', 1, 'self')])] },
        flags('Sentry', [38, 42], `${research}22-sts1-act1-elites.md`, [19, 26], ['单体按两侧个体 Bolt、Beam 循环；三体中间个体错位属遭遇层。', 'A3/A18 数值及进阶HP只记备注。'])),
    enemy('sts1', 'act1', 19, '逐金窃客', 'normal', 'release', thief(15, 10, 12, 6),
        { sourceKey: 'Looter', hp: [44, 48],
            evidence: [{ file: slaverSource, lines: [15, 29] }, { file: `${research}136-capability-matrix.md`, lines: [57, 57] }],
            notes: ['Mug 10 ×2 → Lunge 12 / Smoke Bomb 格挡6 各半；Lunge 后 Smoke Bomb，之后 Escape。', ...thiefNotes] }),
    enemy('sts1', 'act1', 20, '拦路掠客', 'normal', 'release', thief(15, 10, 16, 11),
        { sourceKey: 'Mugger', hp: [48, 52],
            evidence: [{ file: slaverSource, lines: [16, 31] }, { file: `${research}136-capability-matrix.md`, lines: [58, 58] }],
            notes: ['行动同 Looter：Mug 10、Lunge 16、Smoke Bomb 格挡11；实际第二幕出场，随共享来源页登记于此。', ...thiefNotes] }),
    enemy('sts1', 'act1', 22, '酣眠石卫', 'elite', 'release',
        { skills: [
            skill('sleep', '酣眠', 'idle', [op('idle')], fields()),
            skill('attack', '重击', 'attack', [atk(18)], fields()),
            skill('siphon', '汲魂', 'debuff', [ap('atk-down', 1, 'enemy'), ap('def-down', 1, 'enemy')], fields()),
        ],
        script: { ...cycle(['attack', 'attack', 'siphon']), sleep: { skill: 'sleep', turns: 3, shed: ['metallicize'], groggy: true, hurt: 'wake' } },
        passives: [passive('metallicize', '金属化', 'battle-start', [ap('metallicize', 8, 'self'), blk(8)])] },
        { sourceKey: 'Lagavulin', hp: [109, 111],
            evidence: [{ file: `${research}22-sts1-act1-elites.md`, lines: [18, 25] }, { file: `${research}136-capability-matrix.md`, lines: [60, 60] }],
            notes: ['开场金属化8（metallicize：每个自身回合结束得层数格挡，不衰减、不因受击减层）并带格挡8；睡眠3回合（M4 sleep），失血即醒并眩晕1回合，自然醒直接进入重击、重击、汲魂循环；醒来移除金属化。',
                '汲魂按已醒型先例以攻击力/防御力各降1（atk-down/def-down）表达力量/敏捷-1。',
                '受伤唤醒的格挡/中毒边界与三回合计时锚点来源未闭合（22:33），按 M4 实现：格挡完全吸收不唤醒、自身回合结束计时。A3/A18 数值只记备注。'] }),
    // The Guardian：通常四步循环；累计失血达 Mode Shift 阈值时格挡 20 并改出防御形态序列（M4 hp-lost 打断），
    // 双重猛击卸下尖壳并恢复 Mode Shift（rearm 3），旋风斩后通常循环从头开始（then restart）。
    enemy('sts1', 'act1', 25, '折甲巨像', 'boss', 'release',
        { skills: [
            skill('charge', '蓄能', 'defend', [blk(9)], fields()),
            skill('bash', '猛力撞击', 'attack', [atk(32)], fields()),
            skill('vent', '排气', 'debuff', [st('weak', 2, 'enemy'), st('vulnerable', 2, 'enemy')], fields()),
            skill('whirl', '旋风斩', 'attack', [atk(5, 4)], fields()),
            skill('defensive', '防御形态', 'buff', [ap('barbed', 3, 'self')], fields()),
            skill('roll', '翻滚撞击', 'attack', [atk(9)], fields()),
            skill('twin', '双重猛击', 'attack', [atk(8, 2), op('shed', { status: 'barbed', stacks: 6 })], fields()),
        ],
        script: { ...cycle(['charge', 'bash', 'vent', 'whirl']),
            interrupts: [{ on: 'hp-lost', amount: 30, step: 10, block: 20, seq: ['defensive', 'roll', 'twin', 'whirl'], rearm: 3, then: 'restart' }] } },
        { sourceKey: 'The Guardian', hp: 240,
            evidence: [{ file: `${research}29-sts1-act1-bosses.md`, lines: [24, 29] }, { file: `${research}136-capability-matrix.md`, lines: [63, 63] }],
            notes: ['Mode Shift 初值30、每触发一次+10：累计失去生命达阈值时格挡20并立即改出防御形态（尖壳3）→翻滚撞击9→双重猛击8×2（卸下尖壳、恢复 Mode Shift）→旋风斩5×4，之后从蓄能重启通常循环。',
                '尖壳按 E07 刺甲（barbed）：每张命中它的攻击牌反伤一次，不按段数。',
                'Mode Shift 累计范围、恢复时点与多段中途转型来源未闭合（29:29），按 M4 项目选择：格挡吸收不计、防御序列中不累计、双重猛击出手后恢复计数、多段攻击逐段检测；阈值与格挡随档位生命/格挡比例换算。A4/A9/A19 数值与进阶HP250只记备注。'] }),
    ...UNAVAILABLE.map((row) => unavailable(...row)),
].sort((a, b) => a.id.localeCompare(b.id)));
