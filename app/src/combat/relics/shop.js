// 规则 v6 通用遗物 · 商店（G5f）。原版模型对照原版效果，拆解模型为自有组合；名称与描述自有。
import { P, X, aoe, ap, blk, cnt, draw, energy, heal, loseEnergy, mod, op, rc, relic, st, when } from './dsl.js';

const r = (...args) => relic('s', ...args);
const ATK = { cardType: 'attack' };

export const SHOP_RELICS = Object.freeze([
    r(1, '束带扣', 's', 'g', P('battle-start', [st('dexterity', 2, 'self')], '开战获得 2 层防御力'), P('battle-start', [st('dexterity', 1, 'self'), blk(3)], '开战获得 1 层防御力与 3 点格挡'), { approx: true }),
    r(2, '硬面包', 's', 't', P('turn-start', [when('turn-eq', 1, [loseEnergy(2)]), when('turn-gte', 2, [energy(1)])], '第 1 回合少 2 点能量，之后每回合开始多 1 点能量'), P('turn-start', [when('turn-eq', 1, [loseEnergy(1)]), when('turn-gte', 2, [draw(1)])], '第 1 回合少 1 点能量，之后每回合开始多抽 1 张牌')),
    r(3, '燃木枝', 's', 'g', P('exhaust', [cnt('battle-first', 0, [op('copy-exhausted', { amount: 1, cardType: 'skill' })])], '每场第一次消耗牌时，复制消耗堆中 1 张技能牌入手'), P('exhaust', [cnt('every', 4, [blk(5)])], '每消耗 4 张牌获得 5 点格挡'), { approx: true }),
    r(5, '虚数药剂', 's', 'g', P('battle-start', [mod('damage-add', 6, { xcost: true })], '本场 X 费牌造成的伤害 +6'), P('battle-start', [mod('damage-add', 3, { xcost: true }), energy(1)], '开战多 1 点能量，本场 X 费牌造成的伤害 +3'), { approx: true }),
    r(6, '旧毯', 's', 't', X('flip', { choices: 1 }, '卡牌奖励多 1 张候选'), P('battle-start', [rc(1, { pool: 'general' })], '开战随机 1 张无色牌作临时牌入手'), { approx: true }),
    r(7, '人偶镜', 's', 't', X('pickup', { copy: 1 }, '获得时复制卡组中 1 张牌'), P('battle-start', [rc(1)], '开战随机 1 张卡组中的牌作临时牌入手')),
    r(8, '赤鳞果', 's', 't', X('win-points', { hpMax: 1 }, '每场战斗胜利得到金钱时最大生命 +1'), P('kill', [heal(2)], '击倒敌人时回复 2 点生命'), { approx: true }),
    r(9, '幽种', 's', 'g', P('battle-start', [op('grant-flag', { flag: 'ethereal', scope: 'hand' })], '开战手牌本场获得虚无'), P('exhaust', [blk(3)], '每消耗 1 张牌获得 3 点格挡'), { approx: true }),
    r(10, '虬木锤', 's', 't', X('pickup', { inscribe: { key: 'sharp', cardType: 'attack', count: 3 } }, '获得时为卡组中 3 张攻击牌刻印'), P('battle-start', [mod('damage-add', 3, { inscribed: true })], '本场带刻印的牌造成的伤害 +3')),
    r(11, '木札', 's', 't', X('pickup', { inscribe: { key: 'deft', count: 3 } }, '获得时为卡组中 3 张牌刻印'), P('turn-start', [when('turn-eq', 2, [draw(2)])], '第 2 回合开始多抽 2 张牌')),
    r(12, '流焰灯', 's', 't', X('flip', { upgrade: true, noDamage: true }, '战斗中没有失去生命时，卡牌奖励的候选全部升级'), P('battle-start', [op('upgrade-pile', { from: 'drawn', amount: 4 })], '开战后接下来抽到的 4 张牌本场升级')),
    r(13, '蜜格饼', 's', 't', X('pickup', { hpMax: 7, healFull: true }, '获得时最大生命 +7 并回满生命'), P('battle-start', [heal(6)], '开战回复 6 点生命')),
    r(14, '秘火匣', 's', 'g', P('battle-start', [mod('damage-add', 9, { inscribed: true })], '本场带刻印的攻击造成的伤害 +9'), P('battle-start', [mod('damage-add', 4, { inscribed: true }), draw(1)], '开战多抽 1 张牌，本场带刻印的牌造成的伤害 +4'), { approx: true }),
    r(16, '拳刺', 's', 't', X('pickup', { inscribe: { key: 'momentum', cardType: 'attack', count: 1 } }, '获得时为卡组中 1 张攻击牌刻印'), P('card-played', [cnt('battle-first', 0, [ap('vigor', 5)])], '每场第一次打出攻击牌后获得 5 层蓄势', ATK), { approx: true }),
    r(17, '定音铃', 's', 'g', P('turn-end', [when('turn-eq', 1, [op('grant-flag', { flag: 'retain', scope: 'hand' })])], '第 1 回合结束时保留全部手牌'), P('battle-start', [draw(1), op('grant-flag', { flag: 'retain', scope: 'random' })], '开战多抽 1 张牌，随机 1 张手牌本场获得保留'), { approx: true }),
    r(18, '御印', 's', 't', X('pickup', { inscribe: { key: 'sovereign', cardType: ['attack', 'skill'], count: 1, choose: true } }, '获得时为卡组中选定的 1 张牌刻印'), P('card-played', [cnt('battle-first', 0, [draw(2)])], '每场第一次打出牌后抽 2 张牌')),
    r(19, '啸角酒壶', 's', 'g', P('turn-end', [when('hand-lte', 0, [aoe(20)])], '回合结束时手牌为空，对全体敌人造成 20 点伤害'), P('turn-end', [when('hand-lte', 1, [aoe(8)])], '回合结束时手牌不超过 1 张，对全体敌人造成 8 点伤害')),
    r(20, '壮胆石囊', 's', 't', P('battle-start', [when('battle-tier', 'elite', [st('strength', 2, 'self')])], '对面有精英时开战获得 2 层攻击力'), P('battle-start', [when('battle-tier', 'elite', [blk(12)])], '对面有精英时开战获得 12 点格挡')),
    r(21, '算筹', 's', 'g', P('shuffle', [blk(6)], '每次洗牌获得 6 点格挡'), P('shuffle', [draw(1), blk(2)], '每次洗牌抽 1 张牌并获得 2 点格挡')),
    r(22, '百宝箱', 's', 't', P('battle-start', [rc(1, { pool: 'general', free: true })], '开战随机 1 张无色牌作临时牌入手，本回合 0 费'), P('turn-start', [when('turn-eq', 2, [rc(1, { pool: 'general' })])], '第 2 回合开始随机 1 张无色牌作临时牌入手'), { approx: true }),
    r(23, '羽饰', 's', 't', X('flip', { inscribe: 1 }, '卡牌奖励的候选中随机 1 张带刻印'), P('battle-start', [mod('damage-add', 2, { inscribed: true }), blk(4)], '开战获得 4 点格挡，本场带刻印的牌造成的伤害 +2')),
]);
