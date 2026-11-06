// 规则 v6 无色通用固定卡（对照原版无色罕见、稀有牌；自有中文名，数值经 dsl.fitCard 按 IGS 预算窗口复核）。
// 只供「随机加入无色牌」一类卡牌效果造牌，不进奖励、积分抽卡、升级与升阶（D-15）。
// 剔除原 01（战斗外收益）、30、48（禁格挡、即死等规则破坏类）；选牌类改程序随机，IGS 无对应时机的效果按可结算的近似写法改写。
import { ap, aoe, atk, blk, buff, card, draw, energy, ex, op, rnd, st, turn } from './dsl.js';

const c = (...args) => card('general', ...args);
const tally = (amount, per, source, extra = {}) => op('tally-strike', { amount, per, source, ...extra });
const search = (amount, cardType) => op('search', { amount, ...(cardType ? { cardType } : {}) });

export const GENERAL_CARDS = Object.freeze([
    c(2, '圣膏', 's', 1, 'r', [search(2), ex()], [search(2), draw(1), ex()]),
    c(3, '自动机', 'p', 1, 'u', [turn([draw(1)])], [turn([draw(1)]), blk(1)]),
    c(4, '痛击连环', 's', 3, 'r', [op('autoplay', { from: 'hand', amount: 3, cardType: 'attack' })], [op('autoplay', { from: 'hand', amount: 3, cardType: 'attack' }), draw(1)]),
    c(5, '流星锤', 'a', 0, 'r', [atk(3), op('recur', { to: 'top' })], [atk(4), op('recur', { to: 'top' })]),
    c(6, '灾祸', 'p', 3, 'r', [buff('card-played', 5, [op('random-card', { amount: 1, cardType: 'attack' })], 'attack')], 2),
    c(7, '大灾变', 's', 2, 'u', [op('autoplay', { from: 'draw', amount: 2 })], [op('autoplay', { from: 'draw', amount: 3 })]),
    c(8, '暗缚', 's', 0, 'u', [ap('shackle', 2, 'enemy'), blk(1), ex()], [ap('shackle', 2, 'enemy'), blk(2), ex()]),
    c(9, '发现', 's', 1, 'u', [op('discover', { free: true }), ex()], [op('discover', { free: true })]),
    c(10, '登场', 'a', 0, 'u', [aoe(11), ex()], [aoe(15), ex()], { innate: true }),
    c(11, '熵变', 'p', 1, 'r', [turn([op('transmute', { amount: 1, mode: 'random' })]), draw(1)], [turn([op('transmute', { amount: 1, mode: 'random' })]), draw(1), blk(2)]),
    c(12, '均衡', 's', 2, 'u', [blk(13), op('retain-hand', { amount: 2 })], [blk(16), op('retain-hand', { amount: 2 })]),
    c(13, '恒铠', 'p', 3, 'r', [ap('plated', 9)], [ap('plated', 10)]),
    c(14, '勒束', 'p', 1, 'u', [buff('card-played', 5, [blk(1)], 'skill')], [buff('card-played', 5, [blk(1)], 'skill'), blk(1)]),
    c(15, '妙手', 's', 0, 'u', [draw(1)], [draw(1), blk(1)]),
    c(16, '拳斗', 'a', 1, 'u', [atk(7), blk(7)], [atk(9), blk(9)]),
    c(17, '钢闪', 'a', 1, 'u', [atk(5), draw(1)], [atk(8), draw(1)]),
    c(18, '金斧', 'a', 1, 'r', [tally(1, 1, 'played')], [tally(3, 1, 'played')], { retain: true }),
    c(19, '贪婪之手', 'a', 2, 'r', [atk(20), op('bounty', { reward: 'damage', amount: 3 })], [atk(25), op('bounty', { reward: 'damage', amount: 3 })]),
    c(20, '暗藏珠玉', 's', 1, 'r', [op('replay-next', { amount: 1 })], [op('replay-next', { amount: 1 }), draw(1)]),
    c(21, '急躁', 's', 0, 'u', [op('requires', { when: 'hand-lte', value: 3, then: [draw(1), blk(1)] })], [op('requires', { when: 'hand-lte', value: 3, then: [draw(2)] })]),
    c(22, '多面手', 's', 0, 'u', [op('random-card', { pool: 'general', amount: 1, free: true }), ex()], [op('random-card', { pool: 'general', amount: 1, free: true, upgraded: true }), ex()]),
    c(23, '头彩', 'a', 3, 'r', [atk(25), op('random-card', { amount: 3 })], [atk(25), op('random-card', { amount: 3, upgraded: true })]),
    c(24, '统筹', 's', 1, 'r', [draw(3), ex()], [draw(4), ex()]),
    c(25, '混乱', 'p', 2, 'r', [turn([op('autoplay', { from: 'draw', amount: 1 })])], [turn([op('autoplay', { from: 'draw', amount: 1 })]), blk(2)]),
    c(26, '心念爆', 'a', 1, 'u', [tally(4, 1, 'deck-attacks')], 0, { innate: true }),
    c(27, '怀旧', 'p', 1, 'r', [turn([op('topdeck', { amount: 1, mode: 'random' })]), draw(1), blk(1)], 0),
    c(28, '万象斩', 'a', 0, 'u', [op('splash', { amount: 8 })], [op('splash', { amount: 11 })]),
    c(29, '风度', 'p', 0, 'u', [turn([aoe(1)], 'end')], [turn([aoe(1)], 'end'), blk(1)]),
    c(31, '整装', 'p', 1, 'u', [turn([ap('vigor', 1)])], [turn([ap('vigor', 1)]), blk(2)]),
    c(32, '量产', 's', 0, 'u', [energy(1), ex()], [energy(1), blk(1), ex()]),
    c(33, '延展', 's', 0, 'u', [ap('retain-block', 1)], [ap('retain-block', 1), blk(1)]),
    c(34, '非凡', 'p', 1, 'u', [st('strength', 1, 'self'), st('dexterity', 1, 'self')], [st('strength', 1, 'self'), st('dexterity', 1, 'self'), blk(1)]),
    c(35, '净化', 's', 0, 'u', [op('exhaust-hand', { filter: 'status', gain: 'block', per: 1 }), ex()], [op('exhaust-hand', { filter: 'status', gain: 'block', per: 2 }), ex()], { retain: true }),
    c(36, '撕裂', 'a', 1, 'r', [tally(10, 5, 'target-debuffs')], [tally(12, 8, 'target-debuffs')]),
    c(37, '躁动', 's', 0, 'u', [op('requires', { when: 'hand-lte', value: 0, then: [draw(1), blk(1)] })], [op('requires', { when: 'hand-lte', value: 0, then: [draw(1), blk(2)] })], { retain: true }),
    c(38, '滚石', 'p', 3, 'r', [turn([aoe(5)])], [turn([aoe(7)])]),
    c(39, '齐射', 'a', 1, 'u', [atk(12), op('retain-hand', { amount: 2 })], [atk(16), op('retain-hand', { amount: 2 })]),
    c(40, '速记', 's', 1, 'r', [op('draw-until', { until: 'hand', value: 6 }), ex()], [op('draw-until', { until: 'hand', value: 7 }), ex()]),
    c(41, '秘技', 's', 0, 'r', [search(1, 'skill'), ex()], [search(1, 'skill')]),
    c(42, '秘器', 's', 0, 'r', [search(1, 'attack'), ex()], [search(1, 'attack')]),
    c(43, '索敌击', 'a', 1, 'u', [atk(9), search(1)], [atk(12), search(1)]),
    c(44, '震波', 's', 2, 'u', [st('weak', 3, 'all-enemies'), st('vulnerable', 3, 'all-enemies'), ex()], [st('weak', 5, 'all-enemies'), st('vulnerable', 5, 'all-enemies'), ex()]),
    c(45, '借锋', 's', 1, 'r', [op('random-card', { amount: 1, cardType: 'attack', free: true })], [op('random-card', { amount: 1, cardType: 'attack', free: true, upgraded: true })]),
    c(46, '谋局', 'p', 2, 'u', [turn([search(1)])], 1),
    c(47, '炸弹', 's', 2, 'u', [buff('turn-start', 3, [aoe(4)])], [buff('turn-start', 3, [aoe(5)])]),
    c(49, '未雨绸缪', 's', 0, 'u', [draw(2), op('topdeck', { amount: 1, mode: 'choose' }), ex()], [draw(2), op('topdeck', { amount: 1, mode: 'choose' })]),
    c(50, '嗡鸣斧', 'a', 1, 'u', [atk(11), op('recur', { to: 'top' })], [atk(14), op('recur', { to: 'top' })]),
    c(51, '极守', 's', 1, 'u', [blk(11)], [blk(15)]),
    c(52, '极击', 'a', 1, 'u', [atk(14)], [atk(20)]),
    c(53, '连弩', 'a', 'X', 'u', [rnd(10)], [rnd(14)]),
]);

