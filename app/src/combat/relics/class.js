// 规则 v6 职业专属遗物（G5f）：五个原版职业各 7 件，按 D-14 归入 IGS 职业（战士 / 刺客 / 法师 / 召唤 / 祈司）。
// 原版模型对照原版效果，拆解模型为自有组合；名称与描述自有。星辰为圣辉（radiance），锻造为锻刃（smith）。
import { P, aoe, ap, blk, cnt, draw, energy, heal, mod, op, rc, relic, rnd, st, th, when } from './dsl.js';

const ATK = { cardType: 'attack' };
const DOOM = { cause: 'doom' };
const STR = { status: 'strength' };
const POISON = { status: 'poison' };
const group = (key) => (...args) => relic(key, ...args);
const w = group('warrior');
const a = group('assassin');
const m = group('mage');
const n = group('summoner');
const p = group('priest');
const orb = (kind, amount = 1) => op('channel', { orb: kind, amount });

export const CLASS_RELICS = Object.freeze([
    w(1, '赤颅', 'c', 't', P('turn-start', [when('self-hp-below', 50, [ap('flex', 3)])], '回合开始时生命不高于一半，本回合获得 3 层临时攻击力'), P('hp-loss', [cnt('battle-first', 0, [st('strength', 1, 'self')])], '每场第一次失去生命时获得 1 层攻击力'), { approx: true }),
    w(2, '纸蛙', 'u', 'g', P('battle-start', [mod('vuln-up', 25)], '易伤的敌人再多受 25% 伤害'), P('turn-start', [when('turn-eq', 3, [st('vulnerable', 1, 'all-enemies')])], '第 3 回合开始使全体敌人易伤 1 层')),
    w(3, '自塑泥', 'u', 't', P('hp-loss', [blk(3)], '每次失去生命获得 3 点格挡'), P('hp-loss', [cnt('turn-first', 0, [blk(4)])], '每回合第一次失去生命获得 4 点格挡'), { approx: true }),
    w(4, '渡魂灰', 'r', 'g', P('exhaust', [aoe(3)], '每消耗 1 张牌，对全体敌人造成 3 点伤害'), P('exhaust', [rnd(5)], '每消耗 1 张牌，对随机敌人造成 5 点伤害')),
    w(5, '魔舌', 'r', 't', P('hp-loss', [cnt('turn-first', 0, [th('hp-lost-turn', 1)])], '每回合第一次失去生命时，回复等量生命'), P('hp-loss', [cnt('battle-first', 0, [heal(6)])], '每场第一次失去生命时回复 6 点生命'), { approx: true }),
    w(6, '残盔', 'r', 'g', P('status-gained', [cnt('battle-first', 0, [st('strength', 1, 'self')])], '每场第一次获得攻击力时再获得 1 层', STR), P('status-gained', [cnt('battle-first', 0, [blk(6)])], '每场第一次获得攻击力时获得 6 点格挡', STR), { approx: true }),
    w(7, '硫火石', 's', 't', P('turn-start', [st('strength', 2, 'self'), st('strength', 1, 'all-enemies')], '回合开始获得 2 层攻击力，全体敌人获得 1 层攻击力'), P('turn-start', [ap('vigor', 3)], '回合开始获得 3 层蓄势')),
    a(1, '蛇颅', 'c', 'g', P('debuff-applied', [st('poison', 1, 'enemy')], '每次使敌人中毒，再多施加 1 层中毒', POISON), P('battle-start', [st('poison', 2, 'all-enemies')], '开战使全体敌人中毒 2 层'), { approx: true }),
    a(2, '铜磬', 'u', 'g', P('discard', [rnd(3)], '每弃 1 张牌，对随机敌人造成 3 点伤害'), P('discard', [cnt('every', 3, [aoe(3)])], '每弃 3 张牌，对全体敌人造成 3 点伤害')),
    a(3, '扭颈漏斗', 'u', 't', P('battle-start', [st('poison', 4, 'all-enemies')], '开战使全体敌人中毒 4 层'), P('turn-start', [when('turn-eq', 2, [st('poison', 3, 'all-enemies')])], '第 2 回合开始使全体敌人中毒 3 层')),
    a(4, '螺旋镖', 'r', 'g', P('card-played', [cnt('turn-every', 4, [st('dexterity', 1, 'self')])], '同一回合每打出 4 张攻击牌，获得 1 层防御力', ATK), P('card-played', [cnt('turn-every', 3, [blk(3)])], '同一回合每打出 3 张攻击牌，获得 3 点格挡', ATK), { approx: true }),
    a(5, '纸鹤', 'r', 't', P('battle-start', [mod('weak-up', 15)], '虚弱的敌人再少造成 15% 伤害'), P('battle-start', [st('weak', 1, 'all-enemies'), blk(3)], '开战使全体敌人虚弱 1 层并获得 3 点格挡')),
    a(6, '韧绷带', 'r', 'g', P('discard', [blk(3)], '每弃 1 张牌获得 3 点格挡'), P('discard', [cnt('every', 2, [draw(1)])], '每弃 2 张牌抽 1 张牌')),
    a(7, '忍术卷', 's', 't', P('battle-start', [op('shiv', { amount: 3 })], '开战获得 3 张飞刀'), P('battle-start', [op('shiv', { amount: 1 }), draw(1)], '开战获得 1 张飞刀并多抽 1 张牌')),
    m(1, '数据碟', 'c', 't', P('battle-start', [op('focus', { amount: 1 })], '开战获得 1 点专注'), P('turn-start', [when('turn-eq', 2, [op('focus', { amount: 1 })])], '第 2 回合开始获得 1 点专注')),
    m(2, '镀金线缆', 'u', 'g', P('turn-end', [op('orb-pulse', { amount: 1 })], '回合结束时最前一颗法珠的被动额外触发 1 次'), P('orb-channel', [cnt('every', 4, [op('orb-pulse', { amount: 1 })])], '每凝结 4 颗法珠，最前一颗法珠的被动额外触发 1 次'), { approx: true }),
    m(3, '共生病毒', 'u', 't', P('battle-start', [orb('dark')], '开战凝结 1 颗蚀珠'), P('battle-start', [orb('frost'), blk(2)], '开战凝结 1 颗霜珠并获得 2 点格挡')),
    m(4, '情绪芯片', 'r', 'g', P('hp-loss', [cnt('turn-first', 0, [op('orb-pulse', { amount: 2 })])], '每回合第一次失去生命时，最前一颗法珠的被动额外触发 2 次'), P('hp-loss', [cnt('turn-first', 0, [orb('frost')])], '每回合第一次失去生命时凝结 1 颗霜珠'), { approx: true }),
    m(5, '节拍器', 'r', 'g', P('orb-channel', [cnt('every', 7, [aoe(30)])], '每凝结 7 颗法珠，对全体敌人造成 30 点伤害'), P('orb-channel', [cnt('every', 4, [aoe(8)])], '每凝结 4 颗法珠，对全体敌人造成 8 点伤害'), { approx: true }),
    m(6, '能量电池', 'r', 't', P('battle-start', [op('search', { amount: 2, cost: 0 })], '开战从抽牌堆取 2 张 0 费牌入手'), P('battle-start', [draw(1), op('orb-slot', { amount: 1 })], '开战多抽 1 张牌并多 1 个法珠槽')),
    m(7, '符文电容', 's', 't', P('battle-start', [op('orb-slot', { amount: 2 }), op('orb-slot', { amount: 1 })], '开战多 3 个法珠槽'), P('battle-start', [op('orb-slot', { amount: 1 }), orb('lightning')], '开战多 1 个法珠槽并凝结 1 颗雷珠')),
    n(1, '骨笛', 'c', 'g', P('minion-act', [blk(2)], '随从每次出手获得 2 点格挡'), P('minion-act', [cnt('every', 3, [blk(5)])], '随从每出手 3 次获得 5 点格挡')),
    n(2, '补书刀', 'u', 't', P('defeated', [heal(3)], '敌人死于灾厄时回复 3 点生命', DOOM), P('defeated', [blk(5)], '敌人死于灾厄时获得 5 点格挡', DOOM), { approx: true }),
    n(3, '殓面', 'u', 't', P('battle-start', [op('soul', { amount: 3 })], '开战获得 3 份魂'), P('battle-start', [op('soul', { amount: 1 }), blk(3)], '开战获得 1 份魂与 3 点格挡'), { approx: true }),
    n(4, '高礼帽', 'r', 'g', P('battle-start', [rc(2)], '开战随机 2 张卡组中的牌作临时牌入手'), P('battle-start', [rc(1, { pool: 'class' })], '开战随机 1 张本职业牌作临时牌入手'), { approx: true }),
    n(5, '书签', 'r', 'g', P('turn-end', [op('discount-card', { amount: 1, count: 1 })], '回合结束时随机 1 张手牌费用 -1 直到打出'), P('turn-end', [op('grant-flag', { flag: 'retain', scope: 'random' })], '回合结束时随机 1 张手牌本场获得保留'), { approx: true }),
    n(6, '象牙牌', 'r', 't', P('card-played', [cnt('every', 4, [energy(1)])], '每打出 4 张牌获得 1 点能量'), P('card-played', [cnt('every', 6, [draw(1)])], '每打出 6 张牌抽 1 张牌'), { approx: true }),
    n(7, '不灭印', 's', 'g', P('battle-start', [st('weak', 1, 'all-enemies'), mod('weak-up', 25)], '开战使全体敌人虚弱 1 层，虚弱的敌人再少造成 25% 伤害'), P('turn-start', [ap('doom', 3, 'random-enemy')], '回合开始使随机敌人获得 3 层灾厄'), { approx: true }),
    p(1, '剑术手札', 'c', 't', P('battle-start', [op('smith', { amount: 10 })], '开战锻刃 10'), P('battle-start', [op('smith', { amount: 4 }), blk(4)], '开战锻刃 4 并获得 4 点格挡')),
    p(2, '银河尘', 'u', 'g', P('radiance-spent', [cnt('every', 5, [blk(10)])], '每消耗 5 次圣辉获得 10 点格挡'), P('radiance-spent', [blk(2)], '每次消耗圣辉获得 2 点格挡'), { approx: true }),
    p(3, '御石', 'u', 'g', P('create', [cnt('turn-first', 0, [blk(4)])], '每回合第一次生成临时牌时获得 4 点格挡'), P('create', [cnt('every', 3, [draw(1)])], '每生成 3 张临时牌抽 1 张牌')),
    p(4, '月饼', 'r', 't', P('turn-end', [op('radiance', { amount: 1 })], '回合结束时获得 1 点圣辉'), P('turn-start', [when('turn-eq', 2, [op('radiance', { amount: 2 })])], '第 2 回合开始获得 2 点圣辉')),
    p(5, '小储君', 'r', 'g', P('radiance-spent', [cnt('turn-first', 0, [st('strength', 1, 'self')])], '每回合第一次消耗圣辉时获得 1 层攻击力'), P('radiance-spent', [cnt('turn-first', 0, [blk(4)])], '每回合第一次消耗圣辉时获得 4 点格挡')),
    p(6, '橙面团', 'r', 't', P('battle-start', [rc(2, { pool: 'general' })], '开战随机 2 张无色牌作临时牌入手'), P('battle-start', [rc(1, { pool: 'class' }), draw(1)], '开战随机 1 张本职业牌作临时牌入手并多抽 1 张牌')),
    p(7, '比例侍从', 's', 'g', P('create', [cnt('turn-every', 2, [ap('vigor', 3)])], '同一回合每生成 2 张临时牌获得 3 层蓄势'), P('create', [blk(3)], '每生成 1 张临时牌获得 3 点格挡'), { approx: true }),
]);
