// S2 首领与事件：首领18个模块键按矩阵合并为15条记录（Kin、Test Subject 各合一条；Kaiser Crab 拆成两爪成员条目，
// 只经遭遇条目 enc-kaiser-crab 同场出现，encounterOnly 不独立入池）；事件4条。
// 机制可表达且来源闭合的首领登记原版模型；Beta / Deprecated 保留原状态，不进正式池。
import { enemy, unavailableEnemy, skill, passive, atk, blk, heal, st, ap, op, cycle } from './dsl.js';

const research = '.limcode/cache/enemy-research/';
const ref = (file, from, to = from) => ({ file: `${research}${file}`, lines: [from, to] });
const matrix = (line) => ref('136-capability-matrix.md', line);
const bossBase = (from, to) => ref('11-sts2-bosses.md', from, to);
const bossAudit = (from, to) => ref('115-sts2-boss-behavior-audit.md', from, to);

const BOSSES = [
    [1, 'Ceremonial Beast', '祭仪巨兽', 252, 'pending', [17], [16], 285, '扰鸣定义及持续期来源冲突，失血阈值插招的意图时机未闭合。'],
    [2, 'Kin Priest / Kin Follower', '血亲祭司', 190, 'release', [18, 19], [17, 18], 286, '首领遭遇由祭司与两名随从三体构成，随从不能按身份召唤。', ['随从 HP 58–59 只记备注；HP 字段取祭司。']],
    [3, 'Vantom', '墨魇', 173, 'pending', [20], [19], 287, '基础伤害27/26与滑溜9/8存在版本冲突。'],
    [4, 'Lagavulin Matriarch', '酣眠石卫母', 222, 'release', [21], [20], 288, '开场镀甲12、睡眠3（M4 sleep：失血即醒或睡满自然醒，醒来移除镀甲）；醒后斩击19→剖腹9×2→回斩12并格挡12→汲魂（对方攻击力/防御力各降2、自身力量+2）循环。', ['三回合计时锚点、失血唤醒是否占空行动与意图刷新未闭合（116:30），按 M4 实现：不带晕厥、自身回合结束计时、完全格挡不唤醒（116:23）。', '汲魂按 S1 已醒型先例以 atk-down/def-down 表达力量/敏捷-2；A8/A9 数值与高阶HP233只记备注。']],
    [5, 'Soul Fysh', '魂鱼', 211, 'beta', [22], [21], 289, 'Beta 内容；召引卡牌定义未读。'],
    [6, 'Waterfall Giant', '瀑流巨人', 240, 'release', [23], [22], 290, '首招增压（蒸汽+15），之后践踏15并虚弱1→冲撞10→虹吸回复10→压力炮20（每用一次+5，M5 foe-surge uses）→加压13循环，五招各蒸汽+3；被击杀时持有蒸汽则转「将爆」（M4 归零重生 needs steam + brace，清全部状态），下一次出手按记下的蒸汽量爆炸后自毁，无蒸汽时正常倒下。', ['回复取 52:22 基础值10（11:23 的15为旧版/高阶）；单人局取每名玩家10。', '致死时点（玩家/敌方回合）对将爆是否占行动、爆炸与力量/虚弱/无形的关系、同死判定未闭合（52:41–47），按 M4 项目选择；末形态展示为无限HP、实际999999999（52:32），此处将爆期间失血截为0。A8/A9数值与高阶HP250只记备注。']],
    [7, 'The Insatiable', '无餍者', 321, 'release', [29], [23], 291, '沙坑倒计时吞食玩家与专属逃脱卡牌不支持。'],
    [8, 'Knowledge Demon', '知识恶魔', 379, 'release', [30], [24], 292, '固定循环知识诅咒→掌掴17→知识压顶8×3→沉思（11伤害、回复30、力量+2）；三次诅咒依次给出（瓦解6/心智腐朽1）、（瓦解7/怠惰3）、（瓦解8/衰竭1）由玩家二选一（M7 offer-curse），三套给完后跳过诅咒，只循环后三招。', ['四种诅咒的触发时点、多轮瓦解叠加/替换与来源解除未闭合（117:30–37），按 M7 项目选择：本场状态、层数叠加。', '“每名玩家回复30”按单人局取30；A9数值与高阶HP399只记备注。']],
    [9, 'Kaiser Crab（Crusher）', '帝蟹碎爪', 209, 'release', [31], [25], 293, '帝蟹左爪，只作遭遇「帝蟹」成员：碾压12→膨胀打击4→虫刺6×2并虚弱/脆弱各2→适应（力量+2）→护击12并格挡18循环；背袭（M8 flank：玩家朝向另一爪时受其攻击×1.5）；蟹怒（mate-down：同伴倒下时力量+6、格挡99）。',
        ['初始朝向（出手顺序第一名存活敌人）、自动打牌随机目标转向、伤害加成取整、同回合双爪死亡与死亡/转向/蟹怒先后未闭合（118:31–32），按 M8 项目选择。', 'A9数值与高阶HP219只记备注。'], { encounterOnly: true }],
    [15, 'Kaiser Crab（Rocket）', '帝蟹火箭爪', 199, 'release', [32], [26], 293, '帝蟹右爪，只作遭遇「帝蟹」成员：瞄准3→精准光束18→充能（力量+2）→激光31→再充能（不行动）循环；背袭与蟹怒同碎爪。',
        ['未闭合项同碎爪（118:31–32），按 M8 项目选择。', 'A9数值与高阶HP209只记备注。'], { encounterOnly: true }],
    [10, 'Aeonglass', '永劫沙漏', 512, 'beta', [39], [33], 294, 'Beta 内容；X 的首次求值与递增顺序、凋零定义及跨回合计数未决。'],
    [11, 'Queen', '女王', 400, 'beta', [34], [28], 295, 'Beta 内容；按随从存亡即时切换意图与束缚牌生命周期不能由当前脚本表达。'],
    [12, 'Torch Head Amalgam', '炬首聚合体', 199, 'release', [35], [29], 296, '仅为女王随从，不独立成档；指定随从及领袖联动不能表达。'],
    [13, 'Test Subject（Phase 1 / 2 / 3）', '实验体', 100, 'release', [36, 38], [30, 32], 297, '同一本体三阶段零HP转阶段并清全部状态不支持；第二阶段多爪段数按使用次数增长已可表达，但跨阶段的计数重置/继承规则未列。', ['阶段 HP 100 / 200 / 300 不相加；HP 字段取第一阶段。']],
    [14, 'Doormaker', '造门者', 489, 'deprecated', [33], [27], 298, '已废弃；门形态与本体变身及出牌限制切换不能表达。'],
];

const EVENTS = [
    [1, 'The Merchant???', '假商人', 165, 17, 16, 309, '撒币2×8已可表达；但“不连续同招、狂怒三回合一次、掷物后只接两招”的受限随机候选权重与冷却锚点未给。'],
    [2, 'Battle Friend V1.0', '战斗伙伴一型', 75, 18, 17, 310, '胜负由倒计时与事件奖励决定，持续不行动，不是常规战斗。'],
    [3, 'Battle Friend V2.0', '战斗伙伴二型', 150, 19, 18, 310, '同一型：倒计时挑战，不是常规战斗。'],
    [4, 'Battle Friend V3.0', '战斗伙伴三型', 300, 20, 19, 310, '同一型：倒计时挑战，不是常规战斗。'],
];

const fields = { weight: 1, cooldown: 0, maxRepeat: 2 };
const steam = (n) => ap('steam', n, 'self');
const curse = (id, name, stacks, other, otherStacks) => skill(id, name, 'debuff',
    [op('offer-curse', { options: [{ status: 'disintegration', stacks }, { status: other, stacks: otherStacks }] })], fields);
// 已收录首领的原版模型，按来源键对应上表同一行；该行 reason 改作备注首项。
const MODELS = {
    'Lagavulin Matriarch': {
        skills: [
            skill('sleep', '酣眠', 'idle', [op('idle')], fields),
            skill('slash', '斩击', 'attack', [atk(19)], fields),
            skill('disembowel', '剖腹', 'attack', [atk(9, 2)], fields),
            skill('slash2', '回斩', 'attack-defend', [atk(12), blk(12)], fields),
            skill('siphon', '汲魂', 'debuff', [ap('atk-down', 2, 'enemy'), ap('def-down', 2, 'enemy'), st('strength', 2, 'self')], fields),
        ],
        script: { ...cycle(['slash', 'disembowel', 'slash2', 'siphon']), sleep: { skill: 'sleep', turns: 3, shed: ['plating'], hurt: 'wake' } },
        passives: [passive('plating', '镀甲', 'battle-start', [ap('plating', 12, 'self')])],
    },
    'Waterfall Giant': {
        skills: [
            skill('pressurize', '增压', 'buff', [steam(15)], fields),
            skill('stomp', '践踏', 'attack-debuff', [atk(15), st('weak', 1, 'enemy'), steam(3)], fields),
            skill('ram', '冲撞', 'attack', [atk(10), steam(3)], fields),
            skill('siphon', '虹吸', 'heal', [heal(10), steam(3)], fields),
            skill('gun', '压力炮', 'attack', [op('foe-surge', { amount: 20, hits: 1, per: 5, source: 'uses', track: 'gun' }), steam(3)], fields),
            skill('up', '加压', 'attack', [atk(13), steam(3)], fields),
        ],
        script: { opener: 'pressurize', ...cycle(['stomp', 'ram', 'siphon', 'gun', 'up']) },
        phases: [{
            onDefeat: true, needs: 'steam', brace: true,
            addSkills: [skill('explode', '爆发', 'attack', [op('release'), op('self-destruct')], fields)],
            intent: 'explode',
        }],
    },
    // 12 步循环：三轮诅咒各出现一次，第 9 步（掌掴）起只循环后三招。
    'Knowledge Demon': {
        skills: [
            curse('curse1', '知识诅咒', 6, 'mind-rot', 1),
            curse('curse2', '知识诅咒', 7, 'sloth', 3),
            curse('curse3', '知识诅咒', 8, 'waste-away', 1),
            skill('slap', '掌掴', 'attack', [atk(17)], fields),
            skill('overwhelm', '知识压顶', 'attack', [atk(8, 3)], fields),
            skill('ponder', '沉思', 'attack-buff', [atk(11), heal(30), st('strength', 2, 'self')], fields),
        ],
        script: cycle(['curse1', 'slap', 'overwhelm', 'ponder', 'curse2', 'slap', 'overwhelm', 'ponder', 'curse3', 'slap', 'overwhelm', 'ponder'], 9),
    },
    // 帝蟹两爪：各自固定五步循环；开战背袭（M8 flank），同组同伴倒下触发蟹怒（mate-down）。
    'Kaiser Crab（Crusher）': {
        skills: [
            skill('thrash', '碾压', 'attack', [atk(12)], fields),
            skill('enlarge', '膨胀打击', 'attack', [atk(4)], fields),
            skill('sting', '虫刺', 'attack-debuff', [atk(6, 2), st('weak', 2, 'enemy'), st('frail', 2, 'enemy')], fields),
            skill('adapt', '适应', 'buff', [st('strength', 2, 'self')], fields),
            skill('guarded', '护击', 'attack-defend', [atk(12), blk(18)], fields),
        ],
        script: cycle(['thrash', 'enlarge', 'sting', 'adapt', 'guarded']),
        passives: [
            passive('flank', '背袭', 'battle-start', [ap('flank', 1, 'self')]),
            passive('crab-rage', '蟹怒', 'mate-down', [st('strength', 6, 'self'), blk(99)]),
        ],
    },
    'Kaiser Crab（Rocket）': {
        skills: [
            skill('reticle', '瞄准', 'attack', [atk(3)], fields),
            skill('beam', '精准光束', 'attack', [atk(18)], fields),
            skill('charge', '充能', 'buff', [st('strength', 2, 'self')], fields),
            skill('laser', '激光', 'attack', [atk(31)], fields),
            skill('recharge', '再充能', 'idle', [op('idle')], fields),
        ],
        script: cycle(['reticle', 'beam', 'charge', 'laser', 'recharge']),
        passives: [
            passive('flank', '背袭', 'battle-start', [ap('flank', 1, 'self')]),
            passive('crab-rage', '蟹怒', 'mate-down', [st('strength', 6, 'self'), blk(99)]),
        ],
    },
};
const crabSource = ref('118-sts2-kaiser-crab-source-recheck.md', 12, 32);
const EXTRA_EVIDENCE = {
    'Lagavulin Matriarch': ref('116-sts2-matriarch-source-recheck.md', 12, 30),
    'Waterfall Giant': ref('52-sts2-waterfall-giant-death.md', 12, 47),
    'Knowledge Demon': ref('117-sts2-knowledge-demon-source-recheck.md', 12, 37),
    'Kaiser Crab（Crusher）': crabSource,
    'Kaiser Crab（Rocket）': crabSource,
};

export const STS2_BOSSES = Object.freeze(BOSSES.map(([no, sourceKey, name, hp, status, [b1, b2 = b1], [a1, a2 = a1], matrixLine, reason, notes = [], extra = {}]) => {
    const evidence = [bossBase(b1, b2), bossAudit(a1, a2), matrix(matrixLine), ...(EXTRA_EVIDENCE[sourceKey] ? [EXTRA_EVIDENCE[sourceKey]] : [])];
    return MODELS[sourceKey]
        ? enemy('sts2', 'boss', no, name, 'boss', status, MODELS[sourceKey], { sourceKey, hp, evidence, notes: [reason, ...notes], ...extra })
        : unavailableEnemy('sts2', 'boss', no, name, 'boss', status, { sourceKey, hp, reason, notes, evidence });
}));

// Mysterious Knight、Wriggler、Punch Construct 的事件配置已在所属区域登记，不重复建条目（136:311）。
export const STS2_EVENTS = Object.freeze(EVENTS.map(([no, sourceKey, name, hp, line, auditLine, matrixLine, reason]) => unavailableEnemy(
    'sts2', 'event', no, name, 'normal', 'release',
    { sourceKey, hp, reason, evidence: [ref('14-sts2-events.md', line), ref('113-sts2-event-behavior-audit.md', auditLine), matrix(matrixLine)] },
)));
