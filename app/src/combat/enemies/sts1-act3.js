// S1 第三幕普通、精英与首领：可保真条目登记原版模型，其余保留来源记录与原因。
import { enemy, unavailableEnemy, skill, passive, atk, st, op, cycle } from './dsl.js';

const research = '.limcode/cache/enemy-research/';
const files = { 26: '26-sts1-act3-shapes-darkling.md', 27: '27-sts1-act3-reactive-scaling.md', 28: '28-sts1-act3-elites.md', 33: '33-sts1-act3-bosses-recheck.md' };
const rows = [
    ['Exploder', '爆裂浮核', 'normal', 30, 'release', 26, 17, 93, '撞击两次后爆裂30并自身倒下（self-destruct），固定三步。A2伤害11及进阶HP只记备注。'],
    ['Repulsor', '扰念浮核', 'normal', [29, 35], 'release', 26, 18, 94, '斥击/扰念 1:4，斥击不连用两次；扰念向抽牌堆洗入眩晕2，不限连用（maxRepeat:0）。来源 26:26、143:26；A2伤害13及进阶HP只记备注。'],
    ['Spiker', '棘壳浮核', 'normal', [42, 56], 'release', 26, 19, 95, '开场荆棘3；攻击7/荆棘+2基础权重1:1，攻击不连用两次，荆棘不限连用但每场最多6次，耗尽后只攻击（26:27、143:25）。荆棘逐段反伤且可被格挡（143:22–24）；零伤害、完全格挡及致死命中的先后边界仍未闭合（143:30），保留既有 thorns 结算，不宣称这些边界与原作等同。受限选招使用本地加权，不复刻原作RNG。A2/A17数值只记备注。'],
    ['Darkling', '暗生团', 'normal', [48, 56], 'release', 26, 20, 96, '生命链接、同类存活时重生和最后一体倒下才判胜依赖群体遭遇；复活计时来源亦冲突。'],
    ['Orb Walker', '焚迹行者', 'normal', [90, 96], 'release', 26, 21, 97, '灼光/爪击 3:2，同招不连用三次；灼光向抽牌堆与弃牌堆各塞灼痕1，自身回合末力量+3。来源页施工中，A2/A17 数值只记备注。'],
    ['The Maw', '渊喉兽', 'normal', 300, 'release', 27, 18, 98, 'script.next已支持按上一招条件转移，foe-volley已支持每两回合加段；Nom Nom原作回合计数与项目玩家回合、自身行动次数的对应仍未闭合，保持排除，不据公式相似直接接线。'],
    ['Spire Growth', '缠塔藤', 'normal', 170, 'release', 27, 19, 99, '依目标是否已被缠绕替换候选；缠绕持续伤害和来源死亡解除未闭合。'],
    ['Transient', '将逝巨影', 'normal', 999, 'release', 27, 20, 100, '攻击按回合线性增长、失血临时减力量及消逝死亡的组合无法表达，不改成逃跑。'],
    ['Writhing Mass', '翻涌肉团', 'normal', 160, 'release', 27, 21, 101, '受攻击即重掷意图，寄生牌永久修改长期牌组；本场造牌和固定循环均不等价。'],
    ['Giant Head', '迟暮巨首', 'elite', 500, 'release', 28, 17, 102, '按技能使用次数递增并封顶的伤害与每张牌增伤的 Slow 均无法保真。'],
    ['Nemesis', '虚相刑者', 'elite', 185, 'pending', 28, 18, 103, '项目无实体已有伤害封顶1及自身回合开始衰减；来源28:33仍未给隔回合首次生效、获得/移除和伤害限制边界，不据项目时序补造原作状态机，保持pending，见缓存163。'],
    ['Reptomancer', '蛇刃唤使', 'elite', [180, 190], 'release', 28, 19, 104, '指定kin召唤、初始绑定随从、数量条件与新生等待已有；来源满员是Spawn改用Snake Strike，不是替换存活单位。28:26未闭合改招与连用限制的优先级，过滤后重归一不能冒充原始候选重定向；保留开场两把Dagger及完整主从关系要求，保持excluded，见缓存163。'],
    ['Dagger', '悬命短刃', 'normal', [20, 25], 'release', 28, 20, 105, '仅随Reptomancer完整接线的Minion，不独立成档。伤口攻击9并塞伤口1、随后爆炸25后自死可由随从脚本和既有算子表达；新生等待自身行动间隔及绑定退场沿用助手批准约定，精确爆炸/自死队列与槽位仍缺证，召唤者未闭合前保持excluded，见缓存163。'],
    ['Time Eater', '蚀刻时兽', 'boss', 456, 'release', 33, 18, 112, 'Time Warp 的出牌计数跨回合累计，既有 time-warp 每回合重置；半血一次性 Haste 的意图刷新亦未核实，不放行。'],
    ['Donu', '环辉构体', 'boss', 250, 'pending', 33, 36, 113, '两招交替已知，但起手招未明示；全体增益还依赖双体同场关系。'],
    ['Deca', '方辉构体', 'boss', 250, 'pending', 33, 36, 114, '两招交替已知，但起手招未明示；全体格挡还依赖双体同场关系。'],
    ['Awakened One', '蜕羽醒者', 'boss', 300, 'release', 33, 47, 115, '生命归零后原地重生并切换整套招式，现有阶段不能表达归零不死；第二阶段再生是否保留未决。'],
];

const fields = { weight: 1, cooldown: 0, maxRepeat: 2 };
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
};

export const STS1_ACT3 = Object.freeze(rows.map(([sourceKey, name, tier, hp, status, file, line, matrixLine, reason], index) => {
    const evidence = [{ file: `${research}${files[file]}`, lines: [line, line] },
        { file: `${research}136-capability-matrix.md`, lines: [matrixLine, matrixLine] }];
    if (sourceKey === 'Spiker' || sourceKey === 'Repulsor') evidence.push({ file: `${research}143-sts1-thorns-repeat-recheck.md`, lines: [22, 32] });
    return MODELS[sourceKey]
        ? enemy('sts1', 'act3', index + 1, name, tier, status, MODELS[sourceKey], { sourceKey, hp, evidence, notes: [reason] })
        : unavailableEnemy('sts1', 'act3', index + 1, name, tier, status, { sourceKey, hp, reason, evidence });
}));
