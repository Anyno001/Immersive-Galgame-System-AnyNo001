// 规则 v6 通用遗物 · 稀有（G5f）。原版模型对照原版效果，拆解模型为自有组合；名称与描述自有。
import { P, X, aoe, ap, blk, cnt, draw, energy, heal, mod, next, op, rc, relic, rnd, st, tg, when } from './dsl.js';

const r = (...args) => relic('r', ...args);
const ATK = { cardType: 'attack' };
const SKL = { cardType: 'skill' };
const PWR = { cardType: 'power' };

export const RARE_RELICS = Object.freeze([
    r(1, '兵家残卷', 'r', 'g', P('turn-end', [when('attacks-played-lte', 0, [next('energy', 1)])], '本回合没有打出攻击牌，下回合多 1 点能量'), P('turn-end', [when('attacks-played-lte', 0, [next('draw', 2)])], '本回合没有打出攻击牌，下回合多抽 2 张牌')),
    r(2, '余烬心核', 'r', 'g', P('battle-start', [mod('turn-hp-cap', 20)], '每回合最多失去 20 点生命'), P('battle-start', [mod('hp-loss-reduce', 1), blk(4)], '开战获得 4 点格挡，每次失去生命少失去 1 点')),
    r(3, '鼓风皮囊', 'r', 't', P('battle-start', [op('upgrade-card', { amount: 2, mode: 'random' })], '开战本场随机升级 2 张手牌'), P('battle-start', [op('upgrade-pile', { from: 'drawn', amount: 3 })], '开战后接下来抽到的 3 张牌本场升级'), { approx: true }),
    r(4, '掌舵轮', 'r', 't', P('turn-start', [when('turn-eq', 3, [blk(18)])], '第 3 回合开始获得 18 点格挡'), P('turn-start', [when('turn-eq', 2, [blk(10), st('dexterity', 1, 'self')])], '第 2 回合开始获得 10 点格挡与 1 层防御力')),
    r(5, '琉璃吊灯', 'r', 't', P('turn-start', [when('turn-eq', 3, [energy(3)])], '第 3 回合开始获得 3 点能量'), P('turn-start', [when('turn-eq', 2, [energy(1), draw(2)])], '第 2 回合开始获得 1 点能量并抽 2 张牌')),
    r(6, '披风扣', 'r', 'g', P('turn-end', [tg('hand', 1)], '回合结束时手牌每有 1 张，获得 1 点格挡'), P('turn-end', [when('hand-gte', 3, [blk(5)])], '回合结束时手牌至少 3 张，获得 5 点格挡')),
    r(7, '霜壳蛋', 'r', 't', X('card-added', { upgrade: 'power' }, '能力牌加入卡组时自动升级'), P('card-played', [st('dexterity', 1, 'self')], '打出能力牌时获得 1 层防御力', PWR)),
    r(8, '博戏筹', 'r', 't', P('battle-start', [op('discard-hand', { redraw: true })], '开战弃掉手牌并抽同样多的牌'), P('battle-start', [draw(1), op('discard', { amount: 1, mode: 'random' })], '开战多抽 1 张牌再随机弃 1 张'), { approx: true }),
    r(9, '棋卒', 'r', 'g', P('card-played', [draw(1)], '打出能力牌时抽 1 张牌', PWR), P('card-played', [energy(1)], '打出能力牌时获得 1 点能量', PWR)),
    r(10, '冰酪', 'r', 'g', P('battle-start', [ap('conserve', 1)], '本场未用完的能量留到下回合'), P('turn-end', [when('cards-played-lte', 1, [next('energy', 1)])], '本回合打出的牌不超过 1 张，下回合多 1 点能量'), { approx: true }),
    r(11, '狰狞铁盔', 'r', 'g', P('card-played', [cnt('turn-every', 2, [blk(4)])], '同一回合每打出 2 张牌，获得 4 点格挡'), P('card-played', [blk(2)], '打出攻击牌时获得 2 点格挡', ATK), { approx: true }),
    r(12, '袖箭', 'r', 'g', P('card-played', [cnt('turn-every', 3, [st('dexterity', 1, 'self')])], '同一回合每打出 3 张攻击牌，获得 1 层防御力', ATK), P('card-played', [cnt('turn-every', 3, [blk(6)])], '同一回合每打出 3 张攻击牌，获得 6 点格挡', ATK)),
    r(13, '断尾守宫', 'r', 'g', P('on-low-hp', [heal(30)], '濒危时回复 30 点生命'), P('battle-start', [ap('buffer', 1)], '开战获得 1 层护命'), { approx: true }),
    r(14, '金芒果', 'r', 't', X('pickup', { hpMax: 14 }, '获得时最大生命 +14'), P('battle-start', [heal(5)], '开战回复 5 点生命')),
    r(15, '炖骨', 'r', 't', P('battle-start', [ap('after-mend', 6)], '战斗胜利后回复生命'), P('turn-end', [when('self-hp-below', 50, [heal(2)])], '回合结束时生命低于一半则回复 2 点生命'), { approx: true }),
    r(16, '熔岩蛋', 'r', 't', X('card-added', { upgrade: 'attack' }, '攻击牌加入卡组时自动升级'), P('battle-start', [mod('damage-add', 2, { upgraded: true })], '本场已升级的牌造成的伤害 +2')),
    r(17, '枯手护符', 'r', 'g', P('card-played', [op('discount-card', { amount: 3, count: 1 })], '打出能力牌时，随机 1 张手牌费用 -3 直到打出', PWR), P('card-played', [blk(6)], '打出能力牌时获得 6 点格挡', PWR), { approx: true }),
    r(18, '古旧金币', 'r', 't', X('win-points', { add: 8 }, '战斗胜利多得 8 金钱'), P('kill', [energy(1)], '击倒敌人时获得 1 点能量'), { approx: true }),
    r(19, '怀表', 'r', 'g', P('turn-end', [when('cards-played-lte', 3, [next('draw', 3)])], '本回合打出的牌不超过 3 张，下回合多抽 3 张牌'), P('turn-end', [when('cards-played-lte', 3, [blk(6)])], '本回合打出的牌不超过 3 张，回合结束时获得 6 点格挡')),
    r(20, '转经筒', 'r', 't', X('flip', { battle: 'normal', extra: 1 }, '普通战斗胜利多一次卡牌奖励'), P('kill', [draw(2)], '击倒敌人时抽 2 张牌')),
    r(21, '虹彩指环', 'r', 'g', P('card-played', [cnt('turn-first', 0, [st('strength', 1, 'self'), st('dexterity', 1, 'self')])], '每回合第一次打出能力牌，获得 1 层攻击力与 1 层防御力', PWR), P('card-played', [cnt('turn-first', 0, [blk(3)])], '每回合第一次打出技能牌获得 3 点格挡', SKL), { approx: true }),
    r(22, '锯齿兽牙', 'r', 'g', P('card-played', [op('upgrade-card', { amount: 1, mode: 'random' })], '打出攻击牌时本场随机升级 1 张手牌', ATK), P('card-played', [cnt('every', 4, [op('upgrade-card', { amount: 1, mode: 'random' })])], '每打出 4 张攻击牌，本场随机升级 1 张手牌', ATK), { approx: true }),
    r(23, '星镖', 'r', 'g', P('card-played', [cnt('turn-every', 3, [st('strength', 1, 'self')])], '同一回合每打出 3 张攻击牌，获得 1 层攻击力', ATK), P('card-played', [cnt('turn-every', 3, [ap('vigor', 3)])], '同一回合每打出 3 张攻击牌，获得 3 层蓄势', ATK)),
    r(24, '石历', 'r', 't', P('turn-end', [when('turn-eq', 7, [aoe(52)])], '第 7 回合结束时对全体敌人造成 52 点伤害'), P('turn-start', [when('turn-eq', 4, [aoe(14)])], '第 4 回合开始对全体敌人造成 14 点伤害')),
    r(25, '铁箍', 'r', 'g', P('turn-end', [when('self-block-lte', 10, [ap('retain-block', 1)])], '回合结束时格挡不超过 10 点，则下回合不清空'), P('battle-start', [ap('retain-block', 1)], '开战后第一次换回合格挡不清空'), { approx: true }),
    r(26, '毒囊蛋', 'r', 't', X('card-added', { upgrade: 'skill' }, '技能牌加入卡组时自动升级'), P('card-played', [cnt('every', 6, [st('dexterity', 1, 'self')])], '每打出 6 张技能牌获得 1 层防御力', SKL)),
    r(27, '钨铁杖', 'r', 'g', P('battle-start', [mod('hp-loss-reduce', 1)], '每次失去生命少失去 1 点'), P('battle-start', [mod('turn-hp-cap', 25)], '每回合最多失去 25 点生命')),
    r(28, '不倒陀螺', 'r', 'g', P('card-played', [when('hand-lte', 0, [draw(1)])], '打出牌后手牌为空则抽 1 张牌'), P('turn-end', [when('hand-lte', 0, [next('draw', 2)])], '回合结束时手牌为空，下回合多抽 2 张牌'), { approx: true }),
    r(29, '诡灯', 'r', 't', P('battle-start', [mod('vuln-up', 25), mod('weak-up', 25)], '易伤的敌人再多受 25% 伤害，虚弱的敌人再少造成 25% 伤害'), P('debuff-applied', [cnt('battle-first', 0, [draw(2)])], '每场第一次使敌人陷入减益时抽 2 张牌'), { approx: true }),
    r(30, '机关匣', 'r', 't', P('battle-start', [rc(1, { free: true })], '开战随机 1 张卡组中的牌作临时牌入手，本回合 0 费'), P('battle-start', [rc(1, { upgraded: true })], '开战随机 1 张升级过的卡组中的牌作临时牌入手')),
    r(32, '晨星', 'r', 't', X('flip', { battle: 'elite', extra: 1, rarity: 'rare' }, '精英战胜利多一次稀有卡牌奖励'), P('battle-start', [when('battle-tier', 'elite', [st('strength', 1, 'self')])], '对面有精英时开战获得 1 层攻击力')),
]);
