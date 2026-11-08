// 规则 v6 通用遗物 · 罕见（G5f）。原版模型对照原版效果，拆解模型为自有组合；名称与描述自有。
import { P, X, aoe, ap, blk, cnt, draw, energy, heal, mod, op, relic, rnd, st, when } from './dsl.js';

const r = (...args) => relic('u', ...args);
const ATK = { cardType: 'attack' };
const SKL = { cardType: 'skill' };
const PWR = { cardType: 'power' };

export const UNCOMMON_RELICS = Object.freeze([
    r(1, '青牛角饰', 'u', 't', P('battle-start', [ap('vigor', 8)], '开战获得 8 层蓄势'), P('battle-start', [ap('vigor', 4), st('strength', 1, 'self')], '开战获得 4 层蓄势与 1 层攻击力')),
    r(2, '绅士礼帽', 'u', 't', X('win-points', { percent: 25 }, '战斗胜利所得金钱 +25%'), P('kill', [draw(1)], '击倒敌人时抽 1 张牌')),
    r(3, '三枝烛台', 'u', 't', P('turn-start', [when('turn-eq', 2, [energy(2)])], '第 2 回合开始获得 2 点能量'), P('turn-start', [when('turn-eq', 3, [energy(1), draw(1)])], '第 3 回合开始获得 1 点能量并抽 1 张牌')),
    r(4, '小鬼号角', 'u', 'g', P('defeated', [energy(1), draw(1)], '敌人倒下时获得 1 点能量并抽 1 张牌'), P('defeated', [blk(6)], '敌人倒下时获得 6 点格挡')),
    r(5, '系缆角', 'u', 't', P('turn-start', [when('turn-eq', 2, [blk(14)])], '第 2 回合开始获得 14 点格挡'), P('turn-start', [when('turn-eq', 3, [blk(9), ap('plated', 1)])], '第 3 回合开始获得 9 点格挡与 1 层甲层')),
    r(6, '冥纸', 'u', 'g', P('exhaust', [cnt('every', 5, [draw(1)])], '每消耗 5 张牌抽 1 张牌'), P('exhaust', [cnt('every', 3, [blk(4)])], '每消耗 3 张牌获得 4 点格挡')),
    r(7, '锁链镰', 'u', 'g', P('card-played', [cnt('turn-every', 3, [rnd(6)])], '同一回合每打出 3 张攻击牌，对随机敌人造成 6 点伤害', ATK), P('card-played', [cnt('turn-every', 4, [aoe(4)])], '同一回合每打出 4 张攻击牌，对全体敌人造成 4 点伤害', ATK)),
    r(8, '长效糖果', 'u', 't', X('flip', { every: 2, choices: 1 }, '每两场胜利，卡牌奖励多 1 张候选'), P('card-played', [blk(4)], '打出能力牌时获得 4 点格挡', PWR), { approx: true }),
    r(9, '拆信匕', 'u', 'g', P('card-played', [cnt('turn-every', 3, [aoe(5)])], '同一回合每打出 3 张技能牌，对全体敌人造成 5 点伤害', SKL), P('card-played', [cnt('turn-every', 3, [blk(5)])], '同一回合每打出 3 张技能牌，获得 5 点格挡', SKL)),
    r(10, '招财鱼符', 'u', 't', X('card-added', { points: 15 }, '每有一张牌加入卡组，得 15 金钱'), P('card-played', [cnt('every', 10, [blk(6)])], '每打出 10 张牌获得 6 点格挡')),
    r(11, '水银漏', 'u', 'g', P('turn-start', [aoe(3)], '回合开始对全体敌人造成 3 点伤害'), P('turn-end', [rnd(4)], '回合结束对随机敌人造成 4 点伤害')),
    r(12, '袖珍炮', 'u', 'g', P('battle-start', [mod('damage-add', 3, { upgraded: true })], '本场已升级的牌造成的伤害 +3'), P('battle-start', [mod('damage-add', 1)], '本场牌造成的伤害 +1'), { approx: true }),
    r(13, '双节铁棍', 'u', 'g', P('card-played', [cnt('every', 10, [energy(1)])], '每打出 10 张攻击牌获得 1 点能量', ATK), P('card-played', [cnt('every', 6, [draw(1)])], '每打出 6 张攻击牌抽 1 张牌', ATK)),
    r(14, '赤铜环', 'u', 'g', P('turn-end', [when('self-block-lte', 0, [blk(6)])], '回合结束时没有格挡则获得 6 点格挡'), P('turn-end', [when('self-block-lte', 4, [blk(4)])], '回合结束时格挡不超过 4 点则获得 4 点格挡')),
    r(15, '描金折扇', 'u', 'g', P('card-played', [cnt('turn-every', 3, [blk(4)])], '同一回合每打出 3 张攻击牌，获得 4 点格挡', ATK), P('card-played', [cnt('turn-every', 2, [blk(2)])], '同一回合每打出 2 张攻击牌，获得 2 点格挡', ATK)),
    r(16, '缩影铜规', 'u', 't', P('battle-start', [when('battle-tier', 'boss', [heal(25)])], '首领战开战回复 25 点生命'), P('battle-start', [when('battle-tier', 'elite', [heal(12)])], '对面有精英时开战回复 12 点生命')),
    r(17, '拨挡盾', 'u', 'g', P('turn-end', [when('self-block-gte', 10, [rnd(6)])], '回合结束时格挡至少 10 点，对随机敌人造成 6 点伤害'), P('turn-end', [when('self-block-gte', 6, [rnd(3)])], '回合结束时格挡至少 6 点，对随机敌人造成 3 点伤害')),
    r(18, '雪梨', 'u', 't', X('pickup', { hpMax: 10 }, '获得时最大生命 +10'), P('battle-start', [heal(4)], '开战回复 4 点生命')),
    r(19, '鹅毛笔尖', 'u', 'g', P('card-played', [cnt('every', 9, [ap('empower', 1)])], '每打出 9 张攻击牌，下一张攻击牌伤害翻倍', ATK), P('card-played', [cnt('every', 5, [ap('vigor', 4)])], '每打出 5 张攻击牌获得 4 层蓄势', ATK), { approx: true }),
    r(20, '寒晶', 'u', 't', P('card-played', [cnt('battle-first', 0, [blk(7)])], '每场第一次打出能力牌时获得 7 点格挡', PWR), P('card-played', [blk(3)], '打出能力牌时获得 3 点格挡', PWR)),
    r(22, '蜥纹挂坠', 'u', 'g', P('item-used', [ap('flex', 3)], '每使用一件道具，本回合获得 3 层临时攻击力'), P('item-used', [draw(1)], '每使用一件道具抽 1 张牌')),
    r(23, '涟漪铜盆', 'u', 'g', P('turn-end', [when('attacks-played-lte', 0, [blk(4)])], '本回合没有打出攻击牌，回合结束时获得 4 点格挡'), P('turn-end', [when('cards-played-lte', 2, [blk(5)])], '本回合打出的牌不超过 2 张，回合结束时获得 5 点格挡')),
    r(24, '胭脂盒', 'u', 't', P('turn-start', [when('turn-eq', 3, [st('strength', 1, 'self'), st('dexterity', 1, 'self')])], '第 3 回合开始获得 1 层攻击力与 1 层防御力'), P('turn-start', [when('turn-eq', 2, [st('strength', 1, 'self')])], '第 2 回合开始获得 1 层攻击力')),
    r(25, '凿石钎', 'u', 't', P('battle-start', [op('upgrade-pile', { from: 'draw', amount: 2 })], '开战本场随机升级抽牌堆中的 2 张牌'), P('battle-start', [op('upgrade-pile', { from: 'drawn', amount: 2 })], '开战后接下来抽到的 2 张牌本场升级')),
    r(26, '律管', 'u', 'g', P('card-played', [cnt('every', 10, [blk(7)])], '每打出 10 张技能牌获得 7 点格挡', SKL), P('card-played', [cnt('every', 5, [blk(3)])], '每打出 5 张技能牌获得 3 点格挡', SKL)),
    r(27, '缠臂', 'u', 't', P('battle-start', [mod('first-block-double')], '本场第一次获得格挡时翻倍'), P('battle-start', [blk(4), mod('first-block-double')], '开战获得 4 点格挡，本场第一次获得格挡时翻倍'), { approx: true }),
]);
