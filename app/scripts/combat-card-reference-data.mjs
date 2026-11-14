// D-2 有限参考样本；数值来自既有 wiki Cargo 快照，不从 fitCard 的结果反推。
// 来源：.limcode/plans/combat-gameplay-overhaul/cards-{ironclad,silent}.md（2026-11-06，CC BY-SA）。
import { ap, aoe, atk, blk, draw, energy, ex, heal, lose, op, rnd, st, turn, when } from '../src/combat/fixed-cards/dsl.js';

const rows = [];
function ref(pool, line, no, name, type, cost, rarity, effects, up, flags = {}) {
    const upgraded = Array.isArray(up) ? { effects: up } : typeof up === 'object' ? up : { cost: up };
    const id = typeof no === 'string' ? no : `fx-${pool === 'ironclad' ? 'warrior' : 'assassin'}-${String(no).padStart(2, '0')}`;
    rows.push({ ref: name, source: `.limcode/plans/combat-gameplay-overhaul/cards-${pool}.md`, line,
        card: { id, name, type, cost, rarity, effects, upgraded, ...flags } });
}
const w = (...args) => ref('ironclad', ...args);
const s = (...args) => ref('silent', ...args);
w(7, 'basic-defend', 'Defend (Ironclad)', 'skill', 1, 'basic', [blk(5)], [blk(8)]);
w(8, 'basic-strike', 'Strike (Ironclad)', 'attack', 1, 'basic', [atk(6)], [atk(9)]);
w(31, 6, 'Battle Trance', 'skill', 0, 'uncommon', [draw(3), st('no-draw', 1, 'self')], [draw(4), st('no-draw', 1, 'self')]);
w(27, 7, 'Blood Wall', 'skill', 2, 'common', [lose(2), blk(16)], [lose(2), blk(20)]);
w(64, 9, 'Bludgeon', 'attack', 3, 'uncommon', [atk(32)], [atk(42)]);
w(12, 10, 'Body Slam', 'attack', 1, 'common', [op('damage-from-block')], 0);
w(13, 12, 'Breakthrough', 'attack', 1, 'common', [lose(1), aoe(9)], [lose(1), aoe(13)]);
w(28, 16, 'Cinder', 'attack', 2, 'common', [atk(18), op('exhaust-other', { amount: 1, from: 'hand', mode: 'random' })], [atk(24), op('exhaust-other', { amount: 1, from: 'hand', mode: 'random' })]);
w(74, 18, 'Conflagration', 'attack', 1, 'rare', [aoe(2, 4)], [aoe(2, 5)]);
w(75, 19, 'Crimson Mantle', 'power', 1, 'rare', [turn([lose(1), blk(7)])], [turn([lose(1), blk(10)])]);
w(42, 23, 'Dismantle', 'attack', 1, 'uncommon', [atk(8), when('target-has', 'vulnerable', [atk(8)])], [atk(10), when('target-has', 'vulnerable', [atk(10)])]);
w(15, 35, 'Headbutt', 'attack', 1, 'common', [atk(9), op('retrieve', { amount: 1, from: 'discard', to: 'top' })], [atk(12), op('retrieve', { amount: 1, from: 'discard', to: 'top' })]);

w(47, 37, 'Hemokinesis', 'attack', 1, 'uncommon', [lose(2), atk(15)], [lose(2), atk(20)]);
w(85, 39, 'Impervious', 'skill', 2, 'rare', [blk(30), ex()], [blk(40), ex()]);
w(16, 43, 'Iron Wave', 'attack', 1, 'common', [blk(5), atk(5)], [blk(7), atk(7)]);
w(87, 48, 'Not Yet', 'skill', 2, 'rare', [heal(10), ex()], [heal(13), ex()]);
w(18, 54, 'Pommel Strike', 'attack', 1, 'common', [atk(9), draw(1)], [atk(10), draw(2)]);
w(88, 56, 'Pyre', 'power', 2, 'rare', [turn([energy(1)])], [turn([energy(2)])]);
w(20, 62, 'Shrug It Off', 'skill', 1, 'common', [blk(8), draw(1)], [blk(11), draw(1)]);
w(56, 67, 'Stone Armor', 'power', 1, 'uncommon', [ap('plated', 4)], [ap('plated', 6)]);
w(23, 72, 'Thunderclap', 'attack', 1, 'common', [aoe(4), st('vulnerable', 1, 'all-enemies')], [aoe(7), st('vulnerable', 1, 'all-enemies')]);
w(26, 75, 'Twin Strike', 'attack', 1, 'common', [atk(5, 2)], [atk(7, 2)]);
w(63, 78, 'Uppercut', 'attack', 2, 'uncommon', [atk(13), st('weak', 1, 'enemy'), st('vulnerable', 1, 'enemy')], [atk(13), st('weak', 2, 'enemy'), st('vulnerable', 2, 'enemy')]);
w(30, 80, 'Whirlwind', 'attack', 'X', 'uncommon', [aoe(5)], [aoe(8)]);
w(50, 42, 'Inflame', 'power', 1, 'uncommon', [st('strength', 2, 'self')], [st('strength', 3, 'self')]);
w(92, 22, 'Demon Form', 'power', 3, 'rare', [turn([st('strength', 3, 'self')])], [turn([st('strength', 4, 'self')])]);
s(90, 1, 'Abrasive', 'power', 3, 'rare', [st('dexterity', 1, 'self'), st('thorns', 4, 'self')], [st('dexterity', 1, 'self'), st('thorns', 6, 'self')], { sly: true });
s(43, 4, 'Acrobatics', 'skill', 1, 'uncommon', [draw(3), op('discard', { amount: 1, mode: 'choose' })], [draw(4), op('discard', { amount: 1, mode: 'choose' })]);

s(15, 9, 'Backflip', 'skill', 1, 'common', [blk(5), draw(2)], [blk(8), draw(2)]);
s(32, 10, 'Backstab', 'attack', 0, 'uncommon', [atk(11), ex()], [atk(15), ex()], { innate: true });
s(59, 14, 'Bouncing Flask', 'skill', 2, 'uncommon', [st('poison', 3, 'random-enemy'), st('poison', 3, 'random-enemy'), st('poison', 3, 'random-enemy')], [st('poison', 3, 'random-enemy'), st('poison', 3, 'random-enemy'), st('poison', 3, 'random-enemy'), st('poison', 3, 'random-enemy')]);
s(18, 21, 'Dagger Spray', 'attack', 1, 'common', [aoe(4, 2)], [aoe(6, 2)]);
s(19, 22, 'Dagger Throw', 'attack', 1, 'common', [atk(9), draw(1), op('discard', { amount: 1, mode: 'choose' })], [atk(12), draw(1), op('discard', { amount: 1, mode: 'choose' })]);
s(60, 23, 'Dash', 'attack', 2, 'uncommon', [blk(10), atk(10)], [blk(13), atk(13)]);
s(20, 24, 'Deadly Poison', 'skill', 1, 'common', [st('poison', 5, 'enemy')], [st('poison', 7, 'enemy')]);
s(55, 51, 'Noxious Fumes', 'power', 1, 'uncommon', [turn([st('poison', 2, 'all-enemies')])], [turn([st('poison', 3, 'all-enemies')])]);
s(25, 56, 'Poisoned Stab', 'attack', 1, 'common', [atk(6), st('poison', 3, 'enemy')], [atk(8), st('poison', 4, 'enemy')]);
s(27, 59, 'Predator', 'attack', 2, 'common', [atk(15), op('next-turn', { gain: 'draw', amount: 2 })], [atk(20), op('next-turn', { gain: 'draw', amount: 2 })]);
s(14, 68, 'Slice', 'attack', 0, 'common', [atk(6)], [atk(9)]);
s(26, 73, 'Sucker Punch', 'attack', 1, 'common', [atk(8), st('weak', 1, 'enemy')], [atk(10), st('weak', 2, 'enemy')]);
s(62, 44, 'Leg Sweep', 'skill', 2, 'uncommon', [st('weak', 2, 'enemy'), blk(11)], [st('weak', 3, 'enemy'), blk(14)]);
s(50, 36, 'Footwork', 'power', 1, 'uncommon', [st('dexterity', 2, 'self')], [st('dexterity', 3, 'self')]);

// Whirlwind 按一次 X 投入单位估值；持续收益沿用估值器的预期触发次数，不表示只持续这些回合。
export const REFERENCE_CARDS = Object.freeze(rows);
