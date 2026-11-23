// S2 Glory：基础难度；模块16键均为 Normal / Minion，按普通档登记。条目只登记原版模型。
import { enemy, unavailableEnemy, skill, passive, atk, st, ap, op, cycle } from './dsl.js';

const research = '.limcode/cache/enemy-research/';
const ref = (file, from, to = from) => ({ file: `${research}${file}`, lines: [from, to] });
const base = (line) => ref('09-sts2-glory.md', line);
const audit = (line) => ref('108-sts2-glory-behavior-audit.md', line);
const matrix = (line) => ref('136-capability-matrix.md', line);
const fields = { weight: 1, cooldown: 0, maxRepeat: 2 };
const lostSource = '107-sts2-lost-forgotten-stat-return.md';
const turretSource = '106-sts2-turret-living-shield.md';

const ROWS = [
    [2, 'Scroll of Biting', '噬咬卷轴', [31, 38], 'pending', 18, audit(16), 234, 'HP 与历史冲突；咀嚼后分支权重与禁连用作用域未展开；削减最大生命无算子。'],
    [3, 'Axebot', '斧械', [70, 78], 'beta', 19, audit(17), 235, 'Beta 内容；被杀后原位补货生成新实例不可表达。'],
    [4, 'Fabricator', '造械师', 150, 'release', 20, ref('149-fabricator-runtime-boundary.md', 5, 24), 236, 'allies数量分支与指定召唤已有；避免连续同种的历史规则、Guardbot绑定召唤者支援缺完整链路，High Voltage时点和Noise牌区数量仍缺证，整组保留excluded。'],
    [5, 'Zapbot', '电击机', [18, 23], 'release', 21, audit(19), 237, '仅随造械师实现；High Voltage2的回合开始/结束成长来源冲突未解，见101与149。'],
    [6, 'Stabbot', '刺击机', [18, 23], 'release', 22, audit(20), 237, '基础刺击11并脆弱1已证，须随造械师完整接线，不独立入池；本体仍被召唤规则及其他机器人缺口阻断，见149。'],
    [7, 'Guardbot', '护卫机', [16, 20], 'release', 23, audit(21), 237, '仅随造械师实现；格挡15必须绑定造械师，现有ally最低生命比例回落不能替代，见149。'],
    [8, 'Noisebot', '噪声机', [18, 23], 'release', 24, audit(22), 237, '仅随造械师实现；向抽牌堆和弃牌堆加入2张眩晕的各堆数量及位置未闭合，见101与149。'],
    [10, 'Globe Head', '球首', 148, 'pending', 26, audit(24), 239, '电涌附着牌区、新生成牌、来源死亡与复制交互未闭合。'],
    [12, 'Slimed Berserker', '黏浊狂战士', 266, 'pending', 28, ref('165-slimed-berserker-boundary.md', 5, 12), 241, 'S2 Slimed已独立定义；HP266/276与历史261/281冲突未解。档案单个create数量限1–4，合法分段仍共享接收方每回合10张生成额度，不能保证Vomit Ichor每次完整塞10张，见缓存165。'],
    [13, 'Living Shield', '活体盾', 55, 'release', 29, ref(turretSource, 16, 25), 242, '须与炮手固定同场；Rampart25在玩家回合开始给指定炮手格挡，不能用随机protect-ally、自保或伤害重定向替代。现有encounter只分组，allies条件只计数，缺指定搭档存活与护垒绑定链路；来源死亡解除、清盾/加盾顺序及炮手死亡后意图刷新仍待证，整组不可物化。'],
    [16, 'The Forgotten', '遗忘者', 106, 'pending', 32, ref(lostSource, 18, 27), 245, '敏捷伤害与逐来源返还已可表达；Miasma 格挡8与本次敏捷+2的结算顺序缺证，暂不收录；须与迷失者同场。'],
];

const smog = (make) => make('smog', '衰弱毒雾', 'debuff');
export const STS2_GLORY = Object.freeze([
    enemy('sts2', 'glory', 15, '迷失者', 'normal', 'release',
        { skills: [
            smog((id, name, intent) => skill(id, name, intent, [op('seize-might', { stat: 'strength', amount: 2, target: 'enemy' })], fields)),
            skill('lasers', '眼部激光', 'attack', [atk(4, 2)], fields),
        ], script: cycle(['smog', 'lasers']) },
        { sourceKey: 'The Lost', hp: 93, encounterOnly: true, evidence: [base(31), ref(lostSource, 15, 27), matrix(244)],
            notes: ['首招衰弱毒雾，之后与眼部激光交替；夺力2由既有夺力算子表达，倒下时归还实际夺得量。',
                '与遗忘者固定同场，仅作为遭遇成员，不独立抽取；搭档待证时整个遭遇不可物化。被人工制品抵消时的记账来源未闭合；A9伤害5×2及高阶HP99只记备注。'] }),
    enemy('sts2', 'glory', 1, '虔诚雕塑师', 'normal', 'release',
        { skills: [skill('incant', '禁忌咒唱', 'buff', [ap('ritual', 9, 'self')], fields), skill('savage', '凶击', 'attack', [atk(12)], fields)],
            script: { opener: 'incant', ...cycle(['savage']) } },
        { sourceKey: 'Devoted Sculptor', hp: 162, evidence: [base(17), ref('97-sts2-sculptor-ritual.md', 15, 17), matrix(233)],
            notes: ['首招禁忌咒唱获得仪式9，之后每回合凶击12；仪式按 S2 口径在获得当回合不成长，之后每个自身回合末力量+9。', 'A9凶击15及高阶HP172只记备注。'] }),
    enemy('sts2', 'glory', 14, '炮塔操作员', 'normal', 'release',
        { skills: [skill('unload', '倾泻火力', 'attack', [atk(3, 5)], fields), skill('loading', '装填', 'buff', [st('strength', 1, 'self')], fields)],
            script: cycle(['unload', 'unload', 'loading']) },
        { sourceKey: 'Turret Operator', hp: 41, encounterOnly: true, evidence: [base(30), ref(turretSource, 14, 25), matrix(243)],
            notes: ['倾泻、倾泻、装填三步循环；倾泻3×5五段保留，装填力量+1逐段生效。', '仅随固定遭遇「炮手与活体盾」物化，不独立抽取；活体盾的护垒绑定和时序待证时整组不可物化。两者均为Normal，不套用Minion绑定退场；A9伤害4×5及高阶HP51只记备注。'] }),
    enemy('sts2', 'glory', 11, '鸮法官', 'normal', 'release',
        { skills: [
            skill('scrutiny', '审视', 'attack', [atk(16)], fields),
            skill('peck', '啄击连审', 'attack', [atk(4, 6)], fields),
            skill('flight', '司法翱翔', 'buff', [ap('soar', 1, 'self')], fields),
            skill('verdict', '裁决', 'attack-debuff', [atk(33), st('vulnerable', 4, 'enemy'), op('shed', { status: 'soar', stacks: 1 })], fields),
        ], script: cycle(['scrutiny', 'peck', 'flight', 'verdict']) },
        { sourceKey: 'Owl Magistrate', hp: 234, evidence: [base(27), ref('104-sts2-owl-magistrate-soar.md', 15, 27), matrix(240)],
            notes: ['审视、啄击、司法翱翔、裁决四步固定循环；啄击4×6六段；翱翔使受到的攻击伤害减半，裁决结算伤害与易伤4后卸下翱翔。',
                '翱翔的准确移除锚点、被眩晕跳过裁决后的落地、减伤取整与其他修正顺序未闭合，按“持续到裁决卸下、每段向下取整”实现，为残余差异。',
                'HP 取信息框234，V0.104.0 历史231/247冲突保留；A9审视17、裁决36及高阶HP只记备注；旧审视附着与精英身份不混入。'] }),
    enemy('sts2', 'glory', 9, '蛙骑士', 'normal', 'release',
        { skills: [
            skill('lash', '舌鞭', 'attack-debuff', [atk(13), st('frail', 2, 'enemy')], fields),
            skill('smite', '斩邪', 'attack', [atk(21)], fields),
            skill('queen', '为了女王', 'buff', [st('strength', 5, 'self')], fields),
            skill('charge', '甲虫冲锋', 'attack', [atk(35)], { ...fields, maxUses: 1 }),
        ], script: { opener: 'lash', cycle: ['smite', 'queen', { skill: 'charge', when: { kind: 'self-hp-below', value: 50 } }, 'lash'] },
        passives: [passive('plating', '镀甲', 'battle-start', [ap('plating', 15, 'self')])] },
        { sourceKey: 'Frog Knight', hp: 191, evidence: [base(25), ref('102-sts2-frog-knight-charge.md', 15, 20), matrix(238)],
            notes: ['首招舌鞭，之后斩邪→为了女王→检查点：生命严格低于一半且未冲锋过则甲虫冲锋一次再舌鞭，否则直接舌鞭，循环往复；开场镀甲15。',
                '检查点按规划到该步时判定（为了女王出手后规划下一招），不在任意失血时改意图；精确时点、最大生命变化后的判定与眩晕后恢复来源未闭合。',
                '镀甲敌人开场等量格挡仅见历史线索，未实现；A8镀甲19、A9伤害14/23/40及高阶HP199只记备注。'] }),
    ...ROWS.map(([no, sourceKey, name, hp, status, line, detail, matrixLine, reason]) => unavailableEnemy(
        'sts2', 'glory', no, name, 'normal', status,
        { sourceKey, hp, reason, evidence: [base(line), detail, matrix(matrixLine)] })),
].sort((a, b) => a.id.localeCompare(b.id)));
