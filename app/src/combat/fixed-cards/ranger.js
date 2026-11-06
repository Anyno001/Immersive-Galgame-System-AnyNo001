// 规则 v6 游侠固定卡（对照原版缝合池：静默猎手 + 铁甲战士的弃牌、小刀、多段向牌；自有中文名，数值经 dsl.fitCard 按 IGS 预算窗口复核）。
// 收录缝合池全部 51 张；与守护池交集的 5 张在本表另建 ID。IGS 无对应时机的效果按可结算的近似写法改写
// （如「每层易伤加伤」改为「目标每种减益加伤」，「抽到时触发」改为每回合触发）。
import { ap, aoe, atk, blk, buff, card, draw, energy, ex, op, rnd, st, turn, when } from './dsl.js';

const c = (...args) => card('ranger', ...args);
const shiv = (amount) => op('shiv', { amount });
const discard = (amount) => op('discard', { amount, mode: 'choose' });
const tally = (amount, per, source, extra = {}) => op('tally-strike', { amount, per, source, ...extra });

export const RANGER_CARDS = Object.freeze([
    c(1, '磨棘', 'p', 3, 'r', [st('dexterity', 1, 'self'), st('thorns', 4, 'self')], [st('dexterity', 1, 'self'), st('thorns', 6, 'self')], { sly: true }),
    c(2, '校准', 'p', 1, 'u', [op('hone-shiv', { mode: 'edge', amount: 4 })], [op('hone-shiv', { mode: 'edge', amount: 6 })]),
    c(3, '轻身', 's', 1, 'u', [draw(3), discard(1)], [draw(4), discard(1)]),
    c(4, '激涌', 's', 1, 'r', [energy(1), draw(1), ex()], [energy(2), draw(1), ex()]),
    c(5, '后翻', 's', 1, 'c', [blk(5), draw(2)], [blk(8), draw(2)]),
    c(6, '飞刃舞', 's', 1, 'c', [shiv(2), ex()], [shiv(2), blk(2), ex()]),
    c(7, '墨锋', 's', 1, 'r', [shiv(2)], [shiv(2), st('weak', 2, 'enemy')]),
    c(8, '子弹时间', 's', 2, 'r', [st('no-draw', 1, 'self'), op('hand-cost', { amount: -3 })], 1),
    c(9, '欺凌', 'a', 0, 'u', [tally(4, 2, 'target-debuffs')], [tally(4, 3, 'target-debuffs')]),
    c(10, '孤掷', 's', 0, 'u', [op('discard-hand', { redraw: true }), ex()], [op('discard-hand', { redraw: true })]),
    c(11, '披风匕首', 's', 1, 'c', [blk(6), shiv(1)], [blk(6), shiv(2)]),
    c(12, '燎原', 'a', 1, 'r', [aoe(2, 4)], [aoe(2, 5)]),
    c(13, '残忍', 'p', 1, 'u', [turn([st('vulnerable', 1, 'random-enemy')])], [turn([st('vulnerable', 1, 'all-enemies')])]),
    c(14, '飞匕', 'a', 1, 'c', [atk(9), draw(1), discard(1)], [atk(12), draw(1), discard(1)]),
    c(15, '拆解', 'a', 1, 'u', [atk(8), when('target-has', 'vulnerable', [atk(8)])], [atk(10), when('target-has', 'vulnerable', [atk(10)])]),
    c(16, '退路', 's', 0, 'u', [draw(1), when('skills-played-gte', 1, [blk(1)])], [draw(1), when('skills-played-gte', 1, [blk(2)])]),
    c(17, '老练', 's', 1, 'u', [draw(1), op('grant-flag', { flag: 'retain' })], [draw(1), op('grant-flag', { flag: 'retain' }), blk(1)]),
    c(18, '刀扇', 'p', 2, 'r', [op('hone-shiv', { mode: 'fan' }), shiv(2)], [op('hone-shiv', { mode: 'fan' }), shiv(3)]),
    c(19, '翻跃斩', 'a', 1, 'c', [aoe(7)], [aoe(9)], { sly: true }),
    c(20, '谢幕', 'a', 2, 'r', [op('requires', { when: 'draw-empty', then: [aoe(14)] })], [op('requires', { when: 'draw-empty', then: [aoe(18)] })]),
    c(21, '巧手', 's', 1, 'u', [blk(7), op('grant-flag', { flag: 'sly', scope: 'random', cardType: 'skill' })], [blk(10), op('grant-flag', { flag: 'sly', scope: 'random', cardType: 'skill' })]),
    c(22, '炼狱行者', 'p', 2, 'r', [ap('draw-strike', 1)], [ap('draw-strike', 1), blk(5)]),
    c(23, '暗匕', 's', 0, 'u', [discard(1), shiv(1)], [shiv(1)]),
    c(24, '无穷刃', 'p', 2, 'u', [turn([shiv(1)])], [turn([shiv(1)]), shiv(1)]),
    c(25, '刃阱', 's', 2, 'r', [tally(4, 1, 'exhausted', { mode: 'hits' })], [tally(6, 1, 'exhausted', { mode: 'hits' })]),
    c(26, '先锋刺', 'a', 1, 'c', [atk(3), shiv(1)], [atk(5), shiv(1)]),
    c(27, '筹策', 'p', 2, 'r', [turn([op('grant-flag', { flag: 'sly', cardType: 'skill' })])], 1),
    c(28, '逝者铭', 'a', 1, 'u', [tally(9, 4, 'discards')], [tally(11, 5, 'discards')]),
    c(29, '绝杀', 'a', 3, 'r', [tally(10, 3, 'played')], 2),
    c(30, '魅刃', 'p', 1, 'u', [op('hone-shiv', { mode: 'keep' }), op('hone-shiv', { mode: 'first', amount: 3 })], [op('hone-shiv', { mode: 'keep' }), op('hone-shiv', { mode: 'first', amount: 5 })]),
    c(31, '掠食', 'a', 2, 'c', [atk(15), op('next-turn', { gain: 'draw', amount: 2 })], [atk(20), op('next-turn', { gain: 'draw', amount: 2 })]),
    c(32, '预备', 's', 0, 'c', [draw(1), discard(1), blk(1)], [draw(2), discard(2)]),
    c(33, '应激', 's', 3, 'u', [draw(2)], [draw(3)], { sly: true }),
    c(34, '弹射', 'a', 2, 'c', [rnd(3, 4)], [rnd(3, 5)], { sly: true }),
    c(35, '影跃', 's', 1, 'r', [op('discard-hand'), ap('vigor', 8)], 0),
    c(36, '疾行者', 'p', 2, 'u', [turn([aoe(2)])], [turn([aoe(3)])]),
    c(37, '怨刺', 'a', 0, 'u', [tally(2, 1, 'hp-losses-turn', { max: 1 })], [tally(2, 2, 'hp-losses-turn', { max: 1 })]),
    c(38, '奔袭', 'p', 2, 'u', [turn([op('autoplay', { from: 'hand', amount: 1, cardType: 'attack' })], 'end')], [turn([op('autoplay', { from: 'hand', amount: 1, cardType: 'attack' })], 'end'), blk(2)]),
    c(39, '践踏', 'a', 3, 'u', [aoe(12)], [aoe(15)]),
    c(40, '钢刃风暴', 's', 1, 'r', [op('discard-hand'), shiv(3)], [op('discard-hand'), shiv(3), draw(1)]),
    c(41, '回旋镖', 'a', 1, 'c', [rnd(3, 3)], [rnd(3, 4)]),
    c(42, '谋略家', 's', 3, 'u', [energy(3)], 2, { sly: true }),
    c(43, '雷击', 'a', 1, 'c', [aoe(4), st('vulnerable', 1, 'all-enemies')], [aoe(7), st('vulnerable', 1, 'all-enemies')]),
    c(44, '行当', 'p', 1, 'r', [turn([draw(1), op('discard', { amount: 1 })]), draw(1)], [turn([draw(1)])]),
    c(45, '双击', 'a', 1, 'c', [atk(5, 2)], [atk(7, 2)]),
    c(46, '无从触及', 's', 2, 'c', [blk(6)], [blk(9)], { sly: true }),
    c(47, '袖中刃', 's', 2, 'u', [shiv(2), op('self-cost', { amount: -1 })], [shiv(3), op('self-cost', { amount: -1 })]),
    c(48, '上勾拳', 'a', 2, 'u', [atk(13), st('weak', 1, 'enemy'), st('vulnerable', 1, 'enemy')], [atk(13), st('weak', 2, 'enemy'), st('vulnerable', 2, 'enemy')]),
    c(49, '狠辣', 'p', 1, 'u', [ap('rend-draw', 1)], [ap('rend-draw', 2)]),
    c(50, '周全', 'p', 2, 'r', [turn([op('retain-hand', { amount: 1 })], 'end'), draw(1)], 1),
    c(51, '旋风斩', 'a', 'X', 'u', [aoe(5)], [aoe(8)]),
]);

