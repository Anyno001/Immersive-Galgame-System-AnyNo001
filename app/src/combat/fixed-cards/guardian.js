// 规则 v6 守护固定卡（对照原版缝合池：铁甲战士 + 静默猎手的防御向牌；自有中文名，数值经 dsl.fitCard 按 IGS 预算窗口复核）。
// 收录缝合池全部 35 张；与游侠池交集的 5 张在本表另建 ID。IGS 无对应时机的效果按可结算的近似写法改写
// （如「下回合获得格挡」改为回合开始时触发一次的限时增益，「对易伤敌人受伤减半」改为本回合减攻）。
import { ap, atk, blk, buff, card, draw, ex, op, st, turn, when } from './dsl.js';

const c = (...args) => card('guardian', ...args);

export const GUARDIAN_CARDS = Object.freeze([
    c(1, '砂砺之躯', 'p', 3, 'r', [st('dexterity', 1, 'self'), st('thorns', 4, 'self')], [st('dexterity', 1, 'self'), st('thorns', 6, 'self')], { sly: true }),
    c(2, '残影护身', 'p', 1, 'r', [buff('card-played', 5, [blk(1)])], [buff('card-played', 5, [blk(2)])]),
    c(3, '预架', 's', 0, 'c', [ap('poise', 1), blk(1)], [ap('poise', 1), st('weak', 1, 'enemy')]),
    c(4, '整备', 's', 1, 'c', [blk(5), op('upgrade-card', { amount: 1, mode: 'choose' })], [blk(5), op('upgrade-card', { amount: 2, mode: 'choose' })]),
    c(5, '后撤步', 's', 1, 'c', [blk(5), draw(2)], [blk(8), draw(2)]),
    c(6, '壁垒', 'p', 3, 'r', [ap('barricade', 1)], 2),
    c(7, '模糊身形', 's', 1, 'u', [blk(5), ap('retain-block', 1)], [blk(8), ap('retain-block', 1)]),
    c(8, '盾击', 'a', 1, 'c', [op('damage-from-block')], [blk(2), op('damage-from-block')]),
    c(9, '巨像', 's', 1, 'u', [blk(4), ap('shackle', 3, 'enemy')], [blk(7), ap('shackle', 3, 'enemy')]),
    c(10, '冲阵', 'a', 2, 'u', [blk(10), atk(10)], [blk(13), atk(13)]),
    c(11, '偏斜', 's', 0, 'c', [blk(2), ap('bramble', 1)], [blk(3), ap('bramble', 1)]),
    c(12, '翻滚', 's', 1, 'c', [blk(3), buff('turn-start', 1, [blk(2)])], [blk(4), buff('turn-start', 1, [blk(3)])]),
    c(13, '脱身', 's', 0, 'u', [draw(1), when('skills-played-gte', 1, [blk(1)])], [draw(1), when('skills-played-gte', 1, [blk(2)])]),
    c(14, '凶眼', 's', 1, 'u', [blk(8), when('exhausted-gte', 1, [blk(8)])], [blk(11), when('exhausted-gte', 1, [blk(11)])]),
    c(15, '严阵', 's', 3, 'u', [op('tally-guard', { amount: 15, per: 5, source: 'strength' })], [op('tally-guard', { amount: 16, per: 8, source: 'strength' })]),
    c(16, '揭甲', 's', 0, 'u', [op('spread-debuff', { mode: 'strip-artifact' }), st('vulnerable', 2, 'enemy'), ex()], [op('spread-debuff', { mode: 'strip-artifact' }), st('vulnerable', 3, 'enemy'), ex()]),
    c(17, '无痛', 'p', 1, 'u', [buff('exhaust', 5, [blk(3)])], [buff('exhaust', 5, [blk(4)])]),
    c(18, '焰幕', 's', 2, 'u', [blk(12), ap('bramble', 4)], [blk(16), ap('bramble', 6)]),
    c(19, '步法', 'p', 1, 'u', [st('dexterity', 2, 'self')], [st('dexterity', 2, 'self'), blk(1)]),
    c(20, '掌中术', 's', 1, 'u', [blk(7), op('grant-flag', { flag: 'sly', scope: 'random', cardType: 'skill' })], [blk(10), op('grant-flag', { flag: 'sly', scope: 'random', cardType: 'skill' })]),
    c(21, '金刚不坏', 's', 2, 'r', [blk(30), ex()], [blk(40), ex()]),
    c(22, '铁浪', 'a', 1, 'c', [blk(5), atk(5)], [blk(7), atk(7)]),
    c(23, '碾压之势', 'p', 2, 'r', [ap('juggernaut', 5)], [ap('juggernaut', 5), blk(3)]),
    c(24, '扫腿', 's', 2, 'u', [st('weak', 2, 'enemy'), blk(11)], [st('weak', 3, 'enemy'), blk(14)]),
    c(25, '萎靡', 's', 'X', 'r', [ap('atk-down', 2), st('weak', 2, 'enemy'), ex()], [ap('atk-down', 3), st('weak', 3, 'enemy'), ex()]),
    c(26, '怒守', 's', 0, 'u', [buff('card-played', 1, [blk(3)], 'attack')], [buff('card-played', 1, [blk(5)], 'attack')]),
    c(27, '再振', 's', 1, 'u', [op('exhaust-hand', { filter: 'non-attack', gain: 'block', per: 5 })], [op('exhaust-hand', { filter: 'non-attack', gain: 'block', per: 7 })]),
    c(28, '影融', 's', 1, 'r', [ap('block-surge', 2)], 0),
    c(29, '耸肩', 's', 1, 'c', [blk(8), draw(1)], [blk(11), draw(1)]),
    c(30, '石甲', 'p', 1, 'u', [ap('plated', 4)], [ap('plated', 6)]),
    c(31, '偷袭', 'a', 1, 'c', [atk(8), st('weak', 1, 'enemy')], [atk(10), st('weak', 2, 'enemy')]),
    c(32, '挑衅', 's', 1, 'c', [blk(6), st('vulnerable', 1, 'enemy')], [blk(7), st('vulnerable', 2, 'enemy')]),
    c(33, '追猎', 'p', 2, 'r', [turn([st('vulnerable', 1, 'all-enemies')])], 1),
    c(34, '岿然', 'p', 2, 'r', [turn([ap('block-surge', 1)])], [turn([ap('block-surge', 1)]), blk(3)]),
    c(35, '触不可及', 's', 2, 'c', [blk(6)], [blk(9)], { sly: true }),
]);
