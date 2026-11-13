// S2 Overgrowth：基础难度；来源区间保留，进阶差异只入备注。条目只登记原版模型。
import { enemy, unavailableEnemy, skill, passive, atk, blk, st, op, cycle } from './dsl.js';

const research = '.limcode/cache/enemy-research/';
const ref = (file, from, to = from) => ({ file: `${research}${file}`, lines: [from, to] });
const base = (line) => ref('12-sts2-overgrowth.md', line);
const matrix = (line) => ref('136-capability-matrix.md', line);
const fields = { weight: 1, cooldown: 0, maxRepeat: 2 };
const flags = (sourceKey, hp, evidence, notes) => ({ sourceKey, hp, evidence, notes });
const raiders = '67-sts2-ruby-raiders-cycles.md';

const UNAVAILABLE = [
    [7, 'Eye With Teeth', '齿眼幻影', 6, 'release', [base(22), ref('70-sts2-fogmog-illusion-gaps.md', 17), matrix(143)], '仅由雾沼兽召唤的随从，带死亡后复活的幻影特性，不单独成档。'],
    [9, 'Fogmog', '雾沼兽', 74, 'pending', [base(24), ref('70-sts2-fogmog-illusion-gaps.md', 24, 28), matrix(145)], '开场召唤后的选招禁连用作用域自相矛盾，状态机未闭合。'],
    [11, 'Inklet', '墨滴灵', [11, 17], 'release', [base(26), ref('71-sts2-cubex-inklet-behavior.md', 27, 30), matrix(147)], '固定步与随机节点交替已可表达；但滑溜特性不支持（M6），且首招按三体阵位区分（M8）。'],
    [12, 'Leaf Slime (M)', '中叶黏体', [32, 35], 'pending', [base(27), ref('68-sts2-slimes-behavior.md', 20), matrix(148)], 'S2 黏液状态牌当前定义未核实，不能用本项目同名状态牌冒充。'],
    [13, 'Leaf Slime (S)', '小叶黏体', [11, 15], 'pending', [base(28), ref('68-sts2-slimes-behavior.md', 19), matrix(149)], '首招权重未给；黏液状态牌定义同样未核实。'],
    [16, 'Shrinker Beetle', '缩身甲虫', [38, 40], 'pending', [base(31), ref('73-sts2-mawler-shrinker-behavior.md', 27, 29), matrix(152)], '交替段起始相位未给；缩身需绑定施加者存活的状态。'],
    [19, 'Twig Slime (M)', '中枝黏体', [26, 28], 'pending', [base(35), ref('68-sts2-slimes-behavior.md', 22), matrix(155)], '黏液状态牌未核实；猛咬可无限连用，不能用连用上限近似，67:33 也不改写。'],
    [21, 'Vine Shambler', '蔓行者', 61, 'pending', [base(37), ref('75-sts2-jaxfruit-vine-cycles.md', 27, 29), matrix(157)], '缠蔓层数与持续期、加费优先级未给，不能用既有加费状态冒充。'],
    [22, 'Wriggler（事件版）', '扭蠕虫', [17, 21], 'pending', [base(38), ref('58-sts2-phrog-wriggler-spawn.md', 29, 31), matrix(158)], '感染卡牌定义未读取；召唤版先眩晕与多体错位起手属遭遇层。'],
];

export const STS2_OVERGROWTH = Object.freeze([
    enemy('sts2', 'overgrowth', 1, '赤晶刺客', 'normal', 'release',
        { skills: [skill('killshot', '绝命一击', 'attack', [atk(10)], fields)], script: cycle(['killshot']) },
        flags('Assassin Raider', [18, 23], [base(17), ref(raiders, 21), matrix(137)],
            ['A9伤害11及高阶HP19–24只记备注。', '五选三同场属遭遇层；单体出场是否仍存在未核实，不影响单位模板。'])),
    enemy('sts2', 'overgrowth', 4, '赤晶弩手', 'normal', 'release',
        { skills: [skill('reload', '上弦', 'defend', [blk(3)], fields), skill('fire', '穿甲射击', 'attack', [atk(14)], fields)], script: cycle(['reload', 'fire']) },
        flags('Crossbow Raider', [18, 21], [base(20), ref(raiders, 23), matrix(140)],
            ['首招上弦，之后与射击交替；A9射击16及高阶HP19–22只记备注。'])),
    enemy('sts2', 'overgrowth', 5, '赤晶猎犬师', 'normal', 'release',
        { skills: [skill('track', '追猎标记', 'debuff', [st('frail', 2, 'enemy')], fields), skill('hounds', '纵犬撕咬', 'attack', [atk(1, 8)], fields)],
            script: { opener: 'track', ...cycle(['hounds']) } },
        flags('Tracker Raider', [21, 25], [base(34), ref(raiders, 24, 28), matrix(141)],
            ['首招追猎标记施加脆弱2，之后每回合纵犬撕咬1×8；八段逐段结算，虚弱等修正按每段取整，不合并整招再取整。',
                'A9为1×9及高阶HP22–26只记备注；五选三同场属遭遇层。'])),
    enemy('sts2', 'overgrowth', 8, '浮孢菌', 'normal', 'release',
        { skills: [
            skill('frail', '脆化孢', 'attack-debuff', [atk(8), st('frail', 2, 'enemy')], { ...fields, weight: 2, maxRepeat: 1 }),
            skill('smash', '重砸', 'attack', [atk(11)], { ...fields, weight: 1, maxRepeat: 1 }),
            skill('weaken', '蚀弱孢', 'debuff', [st('vulnerable', 2, 'enemy')], { ...fields, weight: 3, maxRepeat: 1 }),
        ], script: { openers: [{ skill: 'frail', weight: 2 }, { skill: 'smash', weight: 1 }] } },
        flags('Flyconid', [47, 49], [base(23), ref('69-sts2-flyconid-fuzzy-behavior.md', 19, 22), matrix(144)],
            ['首招只在脆化孢与重砸间按2:1抽取，不能起手蚀弱孢；之后蚀弱孢、脆化孢、重砸按3:2:1，同一招不连续两回合。',
                '蚀弱孢施加易伤2（不是虚弱）。禁连用按滤掉上一招后再加权实现，页面未说明排除、重抽或转移概率，不宣称复现原作随机数消耗。',
                'A9伤害9/12及高阶HP51–53只记备注。'])),
    enemy('sts2', 'overgrowth', 15, '啃啮兽', 'normal', 'release',
        { skills: [
            skill('butt', '顶撞', 'attack', [atk(12)], fields),
            skill('slice', '迟疑斩', 'attack-defend', [atk(6), blk(5)], fields),
            skill('hiss', '嘶鸣', 'buff', [st('strength', 2, 'self')], fields),
        ], script: cycle(['butt', 'slice', 'hiss']) },
        flags('Nibbit', [42, 46], [base(30), ref('72-sts2-nibbit-encounter-openers.md', 15, 23), matrix(151)],
            ['单体从顶撞起手；双体错位起手属遭遇层。', '格挡高阶阈值A8/A9标注冲突、A9伤害13/7与力量3及高阶HP44–48只记备注；累计力量不写回基础值。'])),
    enemy('sts2', 'overgrowth', 20, '小枝黏体', 'normal', 'release',
        { skills: [skill('tackle', '冲撞', 'attack', [atk(4)], fields)], script: cycle(['tackle']) },
        flags('Twig Slime (S)', [7, 11], [base(36), ref('68-sts2-slimes-behavior.md', 21), matrix(156)],
            ['A9伤害5及高阶HP8–12只记备注；遭遇组合不进入模板。'])),
    enemy('sts2', 'overgrowth', 2, '赤晶斧手', 'normal', 'release',
        { skills: [skill('swing', '挥斧', 'attack-defend', [atk(5), blk(5)], fields), skill('big', '重斧', 'attack', [atk(12)], fields)],
            script: cycle(['swing', 'swing', 'big']) },
        flags('Axe Raider', [20, 22], [base(18), ref(raiders, 20), matrix(138)],
            ['挥斧、挥斧、重斧三步循环，保留两次挥斧；挥斧伤害5并自身格挡5。', 'A9 挥斧伤害与格挡6、重斧13及高阶HP21–23只记备注。'])),
    enemy('sts2', 'overgrowth', 3, '赤晶蛮兵', 'normal', 'release',
        { skills: [skill('beat', '痛殴', 'attack', [atk(7)], fields), skill('clap', '震掌', 'buff', [st('strength', 3, 'self')], fields)],
            script: cycle(['beat', 'clap']) },
        flags('Brute Raider', [30, 33], [base(19), ref(raiders, 22), matrix(139)],
            ['首招痛殴，之后与震掌（力量+3）交替。', 'A9痛殴8及高阶HP31–34只记备注。'])),
    enemy('sts2', 'overgrowth', 6, '方匣构装', 'normal', 'release',
        { skills: [
            skill('charge', '蓄能', 'buff', [st('strength', 2, 'self')], fields),
            skill('repeater', '连发冲击', 'attack-buff', [atk(7), st('strength', 2, 'self')], fields),
            skill('expel', '倾泻冲击', 'attack', [atk(5, 2)], fields),
        ], script: { opener: 'charge', ...cycle(['repeater', 'repeater', 'expel']) },
        passives: [passive('artifact', '护符', 'battle-start', [st('artifact', 1, 'self')])] },
        flags('Cubex Construct', 65, [base(21), ref('71-sts2-cubex-inklet-behavior.md', 19, 21), matrix(142)],
            ['首招蓄能力量+2，之后连发、连发、倾泻循环，不再蓄能；连发先结算伤害7再获得力量2，开场人工制品1。', 'A9伤害8与6×2、高阶HP70只记备注；跨区域同场属遭遇层。'])),
    enemy('sts2', 'overgrowth', 10, '绒蠕爬虫', 'normal', 'release',
        { skills: [skill('goop', '酸涎', 'attack', [atk(4)], fields), skill('inhale', '吸气', 'buff', [st('strength', 7, 'self')], fields)],
            script: cycle(['goop', 'inhale', 'goop']) },
        flags('Fuzzy Wurm Crawler', [55, 57], [base(25), ref('69-sts2-flyconid-fuzzy-behavior.md', 28, 29), matrix(146)],
            ['酸涎、吸气、酸涎三步循环，循环边界连续两次酸涎；吸气力量+7并保留，基础伤害仍为4。', 'A9酸涎6及高阶HP58–59只记备注。'])),
    enemy('sts2', 'overgrowth', 14, '裂喉兽', 'normal', 'release',
        { skills: [
            skill('claw', '爪击', 'attack', [atk(4, 2)], { ...fields, maxRepeat: 1 }),
            skill('rip', '撕裂', 'attack', [atk(14)], { ...fields, maxRepeat: 1 }),
            skill('roar', '咆哮', 'debuff', [st('vulnerable', 3, 'enemy')], { ...fields, maxRepeat: 1, maxUses: 1 }),
        ], script: { opener: 'claw' } },
        flags('Mawler', 72, [base(29), ref('73-sts2-mawler-shrinker-behavior.md', 19, 21), matrix(150)],
            ['首招爪击4×2；之后撕裂14、咆哮（易伤3）、爪击等权，同招不连用，咆哮每场一次。', '采用本地受限等权选择，不宣称复现原作随机数消耗；A9伤害16与5×2、高阶HP76只记备注。'])),
    enemy('sts2', 'overgrowth', 18, '咬合棘果', 'normal', 'release',
        { skills: [skill('orb', '聚能弹', 'attack-buff', [atk(3), st('strength', 2, 'self')], fields)], script: cycle(['orb']) },
        flags('Snapping Jaxfruit', [31, 33], [base(33), ref('75-sts2-jaxfruit-vine-cycles.md', 19, 20), matrix(154)],
            ['每回合聚能弹：伤害3结算后获得力量2，累计力量不写回基础值。', 'A9伤害4及高阶HP34–36只记备注；遭遇连续限制属遭遇层。'])),
    enemy('sts2', 'overgrowth', 17, '游绞蛇藤', 'normal', 'release',
        { skills: [
            skill('constrict', '绞缠', 'debuff', [op('constrict', { stacks: 3, target: 'enemy' })], { ...fields, maxRepeat: 0 }),
            skill('thwack', '藤鞭', 'attack-defend', [atk(7), blk(5)], { ...fields, maxRepeat: 0 }),
            skill('lash', '抽击', 'attack', [atk(12)], { ...fields, maxRepeat: 0 }),
        ], script: cycle(['constrict', [{ skill: 'thwack', weight: 1 }, { skill: 'lash', weight: 1 }]]) },
        flags('Slithering Strangler', [53, 55], [base(32), ref('74-sts2-strangler-constrict-cycle.md', 14, 30), matrix(153)],
            ['首招绞缠3，之后等权选藤鞭（伤害7、格挡5）或抽击12，再绞缠，交替循环；不同攻击节点可重复同招，不额外限制连用。',
                '绞缠在受害者自身回合末造成可格挡的层数伤害，绑定施加者存活；本地采用重复施加累计、按来源移除份额，回合末先镀甲及持续效果再绞缠。',
                '多来源份额及同时死亡边界、眩晕后的节点恢复未获原作证实；等权节点使用本地种子，不宣称复现原作随机数消耗。A9伤害8/13及高阶HP54–56只记备注。'])),
    ...UNAVAILABLE.map(([no, sourceKey, name, hp, status, evidence, reason]) => unavailableEnemy(
        'sts2', 'overgrowth', no, name, 'normal', status, { sourceKey, hp, reason, evidence })),
].sort((a, b) => a.id.localeCompare(b.id)));
