// 规则 v6 通用遗物 · 普通（G5f）。原版模型对照原版效果，拆解模型为自有组合；名称与描述自有。
import { P, X, aoe, ap, blk, cnt, draw, energy, heal, mod, op, relic, st, when } from './dsl.js';

const r = (...args) => relic('c', ...args);

export const COMMON_RELICS = Object.freeze([
    r(1, '紫晶果', 'c', 't', X('win-points', { add: 5 }, '战斗胜利多得 5 金钱'), P('kill', [blk(4)], '击倒敌人时获得 4 点格挡'), { approx: true }),
    r(2, '沉船铁锚', 'c', 't', P('battle-start', [blk(10)], '开战获得 10 点格挡'), P('battle-start', [blk(5), ap('plated', 2)], '开战获得 5 点格挡与 2 层甲层')),
    r(3, '琉璃弹袋', 'c', 't', P('battle-start', [st('vulnerable', 1, 'all-enemies')], '开战使全体敌人易伤 1 层'), P('turn-start', [when('turn-eq', 2, [st('vulnerable', 1, 'all-enemies')])], '第 2 回合开始使全体敌人易伤 1 层')),
    r(4, '行囊', 'c', 't', P('battle-start', [draw(2)], '开战多抽 2 张牌'), P('battle-start', [draw(1), energy(1)], '开战多抽 1 张牌并获得 1 点能量')),
    r(5, '血珀小瓶', 'c', 't', P('battle-start', [heal(2)], '开战回复 2 点生命'), P('battle-start', [st('regen', 1, 'self')], '开战获得 1 层再生')),
    r(6, '五环剑谱', 'c', 't', X('card-added', { every: 5, heal: 20 }, '每有 5 张牌加入卡组，回复 20 点生命'), P('card-played', [cnt('every', 8, [heal(3)])], '每打出 8 张牌回复 3 点生命')),
    r(7, '青铜鳞甲', 'c', 't', P('battle-start', [st('thorns', 3, 'self')], '开战获得 3 层荆棘'), P('battle-start', [st('thorns', 1, 'self'), blk(4)], '开战获得 1 层荆棘与 4 点格挡')),
    r(8, '百年木扣', 'c', 't', P('hp-loss', [cnt('battle-first', 0, [draw(3)])], '每场第一次失去生命时抽 3 张牌'), P('hp-loss', [cnt('turn-first', 0, [draw(1)])], '每回合第一次失去生命时抽 1 张牌')),
    r(9, '庆典礼炮', 'c', 't', P('battle-start', [aoe(9)], '开战对全体敌人造成 9 点伤害'), P('turn-start', [when('turn-eq', 2, [aoe(6)])], '第 2 回合开始对全体敌人造成 6 点伤害')),
    r(10, '护颈甲片', 'c', 't', P('battle-start', [ap('plated', 4)], '开战获得 4 层甲层'), P('battle-start', [ap('plated', 2), st('dexterity', 1, 'self')], '开战获得 2 层甲层与 1 层防御力')),
    r(11, '向阳花', 'c', 'g', P('turn-start', [cnt('every', 3, [energy(1)])], '每 3 个回合获得 1 点能量'), P('turn-start', [cnt('every', 4, [energy(1), draw(1)])], '每 4 个回合获得 1 点能量并抽 1 张牌')),
    r(12, '引路灯', 'c', 't', P('battle-start', [energy(1)], '开战多获得 1 点能量'), P('turn-start', [when('turn-eq', 2, [energy(1)])], '第 2 回合开始获得 1 点能量')),
    r(13, '圆润卵石', 'c', 't', P('battle-start', [st('dexterity', 1, 'self')], '开战获得 1 层防御力'), P('turn-start', [when('turn-eq', 2, [st('dexterity', 1, 'self')])], '第 2 回合开始获得 1 层防御力')),
    r(14, '摆钟', 'c', 'g', P('turn-start', [cnt('every', 3, [draw(1)])], '每 3 个回合多抽 1 张牌'), P('turn-end', [cnt('every', 3, [blk(6)])], '每 3 个回合结束时获得 6 点格挡')),
    r(16, '朱漆面具', 'c', 't', P('battle-start', [st('weak', 1, 'all-enemies')], '开战使全体敌人虚弱 1 层'), P('turn-start', [when('turn-eq', 2, [st('weak', 1, 'all-enemies')])], '第 2 回合开始使全体敌人虚弱 1 层')),
    r(17, '山莓', 'c', 't', X('pickup', { hpMax: 7 }, '获得时最大生命 +7'), P('battle-start', [heal(3)], '开战回复 3 点生命')),
    r(18, '木桩靶', 'c', 'g', P('battle-start', [mod('damage-add', 3, { name: '击' })], '本场牌名含「击」的牌造成的伤害 +3'), P('card-played', [cnt('turn-first', 0, [blk(3)])], '每回合第一次打出攻击牌获得 3 点格挡', { cardType: 'attack' }), { approx: true }),
    r(19, '降魔杵', 'c', 't', P('battle-start', [st('strength', 1, 'self')], '开战获得 1 层攻击力'), P('battle-start', [ap('vigor', 4)], '开战获得 4 层蓄势')),
    r(20, '战纹油彩', 'c', 't', X('pickup', { upgrade: { cardType: 'skill', count: 2 } }, '获得时随机升级卡组中的 2 张技能牌'), P('battle-start', [op('upgrade-pile', { from: 'draw', amount: 2 })], '开战本场随机升级抽牌堆中的 2 张牌')),
    r(21, '磨刀砺石', 'c', 't', X('pickup', { upgrade: { cardType: 'attack', count: 2 } }, '获得时随机升级卡组中的 2 张攻击牌'), P('battle-start', [mod('damage-add', 2, { upgraded: true })], '本场已升级的牌造成的伤害 +2')),
]);
