// S1 第三幕普通、精英与首领：可保真条目登记原版模型，其余保留来源记录与原因。
import { enemy, unavailableEnemy, skill, passive, atk, blk, st, ap, op, cycle } from './dsl.js';

const research = '.limcode/cache/enemy-research/';
const files = { 26: '26-sts1-act3-shapes-darkling.md', 27: '27-sts1-act3-reactive-scaling.md', 28: '28-sts1-act3-elites.md', 33: '33-sts1-act3-bosses-recheck.md' };
const rows = [
    ['Exploder', '爆裂浮核', 'normal', 30, 'release', 26, 17, 93, '撞击两次后爆裂30并自身倒下（self-destruct），固定三步。A2伤害11及进阶HP只记备注。'],
    ['Repulsor', '扰念浮核', 'normal', [29, 35], 'release', 26, 18, 94, '斥击/扰念 1:4，斥击不连用两次；扰念向抽牌堆洗入眩晕2，不限连用（maxRepeat:0）。来源 26:26、143:26；A2伤害13及进阶HP只记备注。'],
    ['Spiker', '棘壳浮核', 'normal', [42, 56], 'release', 26, 19, 95, '开场荆棘3；攻击7/荆棘+2基础权重1:1，攻击不连用两次，荆棘不限连用但每场最多6次，耗尽后只攻击（26:27、143:25）。荆棘逐段反伤且可被格挡（143:22–24）；零伤害、完全格挡及致死命中的先后边界仍未闭合（143:30），保留既有 thorns 结算，不宣称这些边界与原作等同。受限选招使用本地加权，不复刻原作RNG。A2/A17数值只记备注。'],
    ['Darkling', '暗生团', 'normal', [48, 56], 'release', 26, 20, 96, '生命链接、同类存活时重生和最后一体倒下才判胜依赖群体遭遇；复活计时来源亦冲突。'],
    ['Orb Walker', '焚迹行者', 'normal', [90, 96], 'release', 26, 21, 97, '灼光/爪击 3:2，同招不连用三次；灼光向抽牌堆与弃牌堆各塞灼痕1，自身回合末力量+3。来源页施工中，A2/A17 数值只记备注。'],
    ['The Maw', '渊喉兽', 'normal', 300, 'release', 27, 18, 98, '首招咆哮（虚弱3、脆弱3），之后按转移表行动：咆哮/流涎后按1:1选重砸25或啃噬（foe-volley，5×ceil(turn/2)）；重砸后按1:1选啃噬或流涎（力量+3）；啃噬后必接流涎。foe-volley按项目当前回合state.turn（第1回合起计）计算1+floor((turn-1)/2)=ceil(turn/2)，与官方页修订69349回合公式一致。来源27:18、The Maw修订69349与169；A2(30)与A17(5)只记备注。'],
    ['Spire Growth', '缠塔藤', 'normal', 170, 'release', 27, 19, 99, '每回合在快触鞭击16与缠绕束缚（缠绕10）间按1:1选招；上回合刚施放缠绕或对方已带缠绕（target-status）时将缠绕候选替换为重藤砸击22，两种攻击均禁三连（maxRepeat:2）。缠绕由既有来源绑定 constrict 实现，施加者倒下自动移除份额。来源27:19,26、Spire Growth修订68820、Debuffs修订65857与168；受限加权采用本地确定性实现，不宣称复现原作RNG，A2伤害18/25、缠绕12及进阶HP190只记备注。'],
    ['Transient', '将逝巨影', 'normal', 999, 'release', 27, 20, 100, '开场消逝5（fading，自身回合末减1、归零倒下，不走逃跑）与变形1（shifting，失去生命获得等量本回合减攻 shackle，自身回合末清零）；每回合重压一击 20+10×当前回合（foe-surge source:turn，第1回合30，第5回合后消逝）。来源27:20、Buffs修订66351与167；消逝不进入缝合素材；回合起算、失血暂降减攻结算边界沿用项目M5/M6实现，A2伤害30+10N及A17消逝6只记备注。'],
    ['Writhing Mass', '翻涌肉团', 'normal', 160, 'release', 27, 21, 101, '受攻击即重掷意图，寄生牌永久修改长期牌组；本场造牌和固定循环均不等价。'],
    ['Giant Head', '迟暮巨首', 'elite', 500, 'release', 28, 17, 102, '开场减速1（slow，攻击者本回合每已打出一张牌受击攻击伤害+10%，玩家回合开始重置）；前4回合在倒数重击13与沉凝注视（虚弱1）间按1:1选招、同招禁三连，第5回合起循环时辰已到（foe-surge source:uses，30起每次+5、上限60，不限连用）。来源28:17,24、Debuffs修订65857与167；受限随机采用项目确定性加权，不宣称复现原作RNG；Vault额外回合与非卡修正边界沿用项目M6实现，A3(40/70)、A18(前3回合)及进阶HP520只记备注。'],
    ['Nemesis', '虚相刑者', 'elite', 185, 'pending', 28, 18, 103, '项目无实体已有伤害封顶1及自身回合开始衰减；来源28:33仍未给隔回合首次生效、获得/移除和伤害限制边界，不据项目时序补造原作状态机，保持pending，见缓存163。'],
    ['Reptomancer', '蛇刃唤使', 'elite', [180, 190], 'release', 28, 19, 104, '指定kin召唤、初始绑定随从、数量条件与新生等待已有；来源满员是Spawn改用Snake Strike，不是替换存活单位。28:26未闭合改招与连用限制的优先级，过滤后重归一不能冒充原始候选重定向；保留开场两把Dagger及完整主从关系要求，保持excluded，见缓存163。'],
    ['Dagger', '悬命短刃', 'normal', [20, 25], 'release', 28, 20, 105, '仅随Reptomancer完整接线的Minion，不独立成档。伤口攻击9并塞伤口1、随后爆炸25后自死可由随从脚本和既有算子表达；新生等待自身行动间隔及绑定退场沿用助手批准约定，精确爆炸/自死队列与槽位仍缺证，召唤者未闭合前保持excluded，见缓存163。'],
    ['Time Eater', '蚀刻时兽', 'boss', 456, 'release', 33, 18, 112, '开场时间扭曲2（chrono，主角跨回合累计每打出12张牌强制结束回合、自身力量+2，灼痕回合末不计）；常规按45:35:20在回响三击7×3（禁三连）、重颅撞击26+少抽1（禁二连）、时空涟漪格挡20+易伤1+虚弱1（禁二连）间选招；生命严格低于50%时触发一次时空加速（清除自身全部减益并回复至50%最大生命，maxUses:1）并立即刷新意图。来源Time Eater修订69917、Buffs修订66351、Debuffs修订65857、131与167；即时改写意图、自动/嵌套出牌边界与受限随机采用项目确定性实现，不宣称复现原作RNG，A4/A19数值与进阶HP480只记备注。'],
    ['Donu', '环辉构体', 'boss', 250, 'pending', 33, 36, 113, '两招交替已知，但起手招未明示；全体增益还依赖双体同场关系。'],
    ['Deca', '方辉构体', 'boss', 250, 'pending', 33, 36, 114, '两招交替已知，但起手招未明示；全体格挡还依赖双体同场关系。'],
    ['Awakened One', '蜕羽醒者', 'boss', 300, 'release', 33, 47, 115, '开场再生10（regenerate，每回合末回复等量生命且不衰减，二阶段保留）与好奇1（curiosity，对手每打出一张能力牌自身力量+1，二阶段卸除）。一阶段首招斩击20，之后按75:25选斩击（禁三连）或魂击6×4（禁二连）。生命归零触发onDefeat重生：立即卸除好奇、清除全部减益、保留已得力量与再生并将意图改为重生（净化减益并回复至满血）；随后进入二阶段，首招暗影回响40，之后按50:50选猛冲10×3或淤泥18+抽牌堆塞空洞1（均禁三连）。原战双信徒同场留待祭火信徒Ritual首回合边界闭合后再行遭遇编组；来源Awakened One修订73795、Buffs修订66351与169，A4/A19与进阶HP320只记备注。'],
];

const fields = { weight: 1, cooldown: 0, maxRepeat: 2 };
const giantHeadPick = [{ skill: 'count', weight: 1 }, { skill: 'glare', weight: 1 }];
const spireGrowthPick = [
    { skill: 'tackle', weight: 1 },
    { skill: 'constrict', weight: 1, when: { kind: 'target-no-status', status: 'constricted' } },
    { skill: 'smash', weight: 1, when: { kind: 'target-status', status: 'constricted' } },
];
// 已收录条目的原版模型，按来源键对应上表同一行；该行末项改作备注。
const MODELS = {
    Exploder: {
        skills: [skill('strike', '撞击', 'attack', [atk(9)], fields), skill('explode', '爆裂', 'attack', [atk(30), op('self-destruct')], fields)],
        script: cycle(['strike', 'strike', 'explode']),
    },
    Repulsor: {
        skills: [
            skill('strike', '斥击', 'attack', [atk(11)], { ...fields, maxRepeat: 1 }),
            skill('daze', '扰念', 'debuff', [op('create', { card: 'status-daze', amount: 2, to: 'draw' })], { ...fields, weight: 4, maxRepeat: 0 }),
        ],
    },
    Spiker: {
        skills: [
            skill('strike', '棘刺撞击', 'attack', [atk(7)], { ...fields, maxRepeat: 1 }),
            skill('spikes', '增生荆棘', 'buff', [st('thorns', 2, 'self')], { ...fields, maxRepeat: 0, maxUses: 6 }),
        ],
        passives: [passive('thorns', '荆棘', 'battle-start', [st('thorns', 3, 'self')])],
    },
    'Orb Walker': {
        skills: [
            skill('laser', '灼光', 'attack-debuff', [atk(10), op('create', { card: 'status-burn', amount: 1, to: 'draw' }),
                op('create', { card: 'status-burn', amount: 1, to: 'discard' })], { ...fields, weight: 3 }),
            skill('claw', '爪击', 'attack', [atk(15)], { ...fields, weight: 2 }),
        ],
        passives: [passive('strength-up', '增幅', 'turn-end', [st('strength', 3, 'self')])],
    },
    'The Maw': {
        skills: [
            skill('roar', '咆哮', 'debuff', [st('weak', 3, 'enemy'), st('frail', 3, 'enemy')], { ...fields, maxRepeat: 0 }),
            skill('slam', '重砸', 'attack', [atk(25)], { ...fields, maxRepeat: 0 }),
            skill('nom', '啃噬', 'attack', [op('foe-volley', { amount: 5, hits: 1, per: 1, every: 2, source: 'turn', track: 'nom' })], { ...fields, maxRepeat: 0 }),
            skill('drool', '流涎', 'buff', [st('strength', 3, 'self')], { ...fields, maxRepeat: 0 }),
        ],
        script: {
            opener: 'roar',
            next: {
                roar: [{ skill: 'slam', weight: 50 }, { skill: 'nom', weight: 50 }],
                drool: [{ skill: 'slam', weight: 50 }, { skill: 'nom', weight: 50 }],
                slam: [{ skill: 'nom', weight: 50 }, { skill: 'drool', weight: 50 }],
                nom: [{ skill: 'drool', weight: 100 }],
            },
        },
    },
    'Spire Growth': {
        skills: [
            skill('tackle', '快触鞭击', 'attack', [atk(16)], fields),
            skill('constrict', '缠绕束缚', 'debuff', [op('constrict', { stacks: 10, target: 'enemy' })], { ...fields, maxRepeat: 1 }),
            skill('smash', '重藤砸击', 'attack', [atk(22)], fields),
        ],
        script: {
            openers: [{ skill: 'tackle', weight: 1 }, { skill: 'constrict', weight: 1 }],
            next: {
                constrict: [{ skill: 'tackle', weight: 1 }, { skill: 'smash', weight: 1 }],
                tackle: spireGrowthPick,
                smash: spireGrowthPick,
            },
        },
    },
    Transient: {
        skills: [
            skill('attack', '重压一击', 'attack', [op('foe-surge', { amount: 20, hits: 1, per: 10, source: 'turn' })], { ...fields, maxRepeat: 0 }),
        ],
        script: cycle(['attack']),
        passives: [passive('transient', '将逝虚影', 'battle-start', [ap('fading', 5, 'self'), ap('shifting', 1, 'self')])],
    },
    'Giant Head': {
        skills: [
            skill('count', '倒数重击', 'attack', [atk(13)], fields),
            skill('glare', '沉凝注视', 'debuff', [st('weak', 1, 'enemy')], fields),
            skill('time', '时辰已到', 'attack', [op('foe-surge', { amount: 30, hits: 1, per: 5, cap: 60, source: 'uses', track: 'time' })], { ...fields, maxRepeat: 0 }),
        ],
        script: { cycle: [giantHeadPick, giantHeadPick, giantHeadPick, giantHeadPick, 'time'], loopFrom: 4 },
        passives: [passive('slow', '迟缓巨躯', 'battle-start', [ap('slow', 1, 'self')])],
    },
    'Time Eater': {
        skills: [
            skill('reverberate', '回响三击', 'attack', [atk(7, 3)], { ...fields, weight: 9, maxRepeat: 2 }),
            skill('slam', '重颅撞击', 'attack-debuff', [atk(26), ap('draw-down', 1, 'enemy')], { ...fields, weight: 7, maxRepeat: 1 }),
            skill('ripple', '时空涟漪', 'debuff', [blk(20), st('vulnerable', 1, 'enemy'), st('weak', 1, 'enemy')], { ...fields, weight: 4, maxRepeat: 1 }),
        ],
        passives: [passive('time-warp', '时间扭曲', 'battle-start', [ap('chrono', 2, 'self')])],
        phases: [{
            hpBelowPct: 50,
            addSkills: [skill('haste', '时空加速', 'buff', [op('cleanse', { target: 'self' }), op('heal-to', { pct: 50 })], { ...fields, maxRepeat: 1, maxUses: 1 })],
            intent: 'haste',
        }],
    },
    'Awakened One': {
        skills: [
            skill('slash', '暗羽斩击', 'attack', [atk(20)], { ...fields, maxRepeat: 2 }),
            skill('soul', '魂击', 'attack', [atk(6, 4)], { ...fields, maxRepeat: 1 }),
            skill('rebirth', '蜕羽重生', 'buff', [op('cleanse', { target: 'self' }), op('heal-to', { pct: 100 })], { ...fields, maxRepeat: 1, maxUses: 1 }),
        ],
        script: {
            opener: 'slash',
            next: {
                slash: [{ skill: 'slash', weight: 75 }, { skill: 'soul', weight: 25 }],
                soul: [{ skill: 'slash', weight: 75 }, { skill: 'soul', weight: 25 }],
            },
        },
        passives: [passive('awakened', '沉眠神性', 'battle-start', [ap('regenerate', 10, 'self'), ap('curiosity', 1, 'self')])],
        phases: [{
            onDefeat: true,
            maxHpPct: 100,
            clear: 'debuffs',
            shed: ['curiosity'],
            removeSkills: ['slash', 'soul'],
            addSkills: [
                skill('dark-echo', '暗影回响', 'attack', [atk(40)], { ...fields, maxRepeat: 1 }),
                skill('sludge', '蚀羽淤泥', 'attack-debuff', [atk(18), op('create', { card: 'status-void', amount: 1, to: 'draw' })], { ...fields, maxRepeat: 2 }),
                skill('tackle', '狂羽猛冲', 'attack', [atk(10, 3)], { ...fields, maxRepeat: 2 }),
            ],
            script: {
                opener: 'dark-echo',
                next: {
                    'dark-echo': [{ skill: 'tackle', weight: 50 }, { skill: 'sludge', weight: 50 }],
                    tackle: [{ skill: 'tackle', weight: 50 }, { skill: 'sludge', weight: 50 }],
                    sludge: [{ skill: 'tackle', weight: 50 }, { skill: 'sludge', weight: 50 }],
                },
            },
            intent: 'rebirth',
        }],
    },
};

export const STS1_ACT3 = Object.freeze(rows.map(([sourceKey, name, tier, hp, status, file, line, matrixLine, reason], index) => {
    const evidence = [{ file: `${research}${files[file]}`, lines: [line, line] },
        { file: `${research}136-capability-matrix.md`, lines: [matrixLine, matrixLine] }];
    if (sourceKey === 'Spiker' || sourceKey === 'Repulsor') evidence.push({ file: `${research}143-sts1-thorns-repeat-recheck.md`, lines: [22, 32] });
    if (sourceKey === 'Transient' || sourceKey === 'Giant Head' || sourceKey === 'Time Eater') evidence.push({ file: `${research}167-sts1-act3-trio-wiring.md`, lines: [5, 18] });
    if (sourceKey === 'Spire Growth') evidence.push({ file: `${research}168-spire-growth-centurion-mystic-wiring.md`, lines: [5, 16] });
    if (sourceKey === 'The Maw' || sourceKey === 'Awakened One') evidence.push({ file: `${research}169-sts1-book-maw-awakened-wiring.md`, lines: [5, 22] });
    return MODELS[sourceKey]
        ? enemy('sts1', 'act3', index + 1, name, tier, status, MODELS[sourceKey], { sourceKey, hp, evidence, notes: [reason] })
        : unavailableEnemy('sts1', 'act3', index + 1, name, tier, status, { sourceKey, hp, reason, evidence });
}));
