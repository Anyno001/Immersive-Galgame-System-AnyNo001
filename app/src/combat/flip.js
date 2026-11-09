// 翻牌奖励：翻哪几张、选哪张、重抽备选组、可见性。选择状态 pick = { set, flipped, choice }。
import { hash32, randomInt } from './random.js';
import { REWARD_SLOT_COUNT } from './schema.js';
import { REROLL_COST } from './points.js';

// 奖励组：main 主组，reserve 重抽后的备选组。
export const FLIP_SETS = Object.freeze(['main', 'reserve']);

export const emptyPick = () => ({ set: 'main', flipped: [], choice: null });

const slotsOf = (reward, set) => (set === 'reserve' ? reward.reserve : reward.slots) || [];
// 备选组可用：存在且与主组等长。
const hasReserve = (reward) => Array.isArray(reward.reserve) && reward.reserve.length === reward.slots.length;
// 可翻张数：槽位多于基础数（有「再翻」关联）时翻 2 张再选一，否则翻 1 张直接选中。
export const flipCountOf = (reward) => (reward.slots.length > REWARD_SLOT_COUNT ? 2 : 1);

// 固定种子的 Fisher-Yates 洗牌，返回 0..count-1 的排列。
function shuffledIndexes(count, seed) {
    const order = Array.from({ length: count }, (_, i) => i);
    let state = hash32(seed);
    for (let i = count - 1; i > 0; i -= 1) {
        const pick = randomInt(state, i + 1);
        state = pick.state;
        [order[i], order[pick.value]] = [order[pick.value], order[i]];
    }
    return order;
}

// 展示位置到槽位下标的映射（洗牌后的顺序）。
export const flipOrder = (reward, set) => shuffledIndexes(slotsOf(reward, set).length, `flip|${reward.randomKey ?? reward.combatId}|${set}`);
// 透视：开局即可见的展示位置，最多 2 个。
export const revealedOf = (reward, set) => shuffledIndexes(slotsOf(reward, set).length, `reveal|${reward.randomKey ?? reward.combatId}|${set}`).slice(0, Math.min(Number(reward.reveal) || 0, 2));

// 校验并规范化存档里的选择状态；非法返回 null。
export function normalizePick(pick, reward) {
    if (!pick || typeof pick !== 'object' || Array.isArray(pick)) return null;
    const { set } = pick;
    if (!FLIP_SETS.includes(set) || (set === 'reserve' && !hasReserve(reward))) return null;
    const size = slotsOf(reward, set).length;
    const flips = flipCountOf(reward);
    const flipped = Array.isArray(pick.flipped) ? pick.flipped : null;
    if (!flipped || flipped.length > flips || new Set(flipped).size !== flipped.length || !flipped.every((p) => Number.isInteger(p) && p >= 0 && p < size)) return null;
    const choice = pick.choice ?? null;
    if (choice !== null && !flipped.includes(choice)) return null;
    // 单翻必须已选中翻开的那张；双翻未翻满不能有选择。
    if ((flips === 1 && flipped.length === 1 && choice !== flipped[0]) || (flips === 2 && choice !== null && flipped.length < 2)) return null;
    return { set, flipped: [...flipped], choice };
}

// 进度分：用于两份选择状态取较新者。备选组远大于主组，其次看翻开数，最后看是否已选。
const progressOf = (pick) => (pick.set === 'reserve' ? 100 : 0) + pick.flipped.length * 2 + (pick.choice === null ? 0 : 1);
// 取进度更靠后的选择状态（任一为空取另一个；进度相同取先者）。
export const laterPick = (a, b) => (a ? (b && progressOf(b) > progressOf(a) ? b : a) : b);

// 翻开一个展示位置。成功 { ok: true, pick }，失败 { ok: false, reason }。
export function flipCard(reward, pick, position) {
    const size = slotsOf(reward, pick.set).length;
    if (!Number.isInteger(position) || position < 0 || position >= size) return { ok: false, reason: 'combat-flip-position-invalid' };
    if (pick.choice !== null) return { ok: false, reason: 'combat-flip-done' };
    if (pick.flipped.includes(position)) return { ok: false, reason: 'combat-flip-already' };
    const flips = flipCountOf(reward);
    if (pick.flipped.length >= flips) return { ok: false, reason: 'combat-flip-choose' };
    return { ok: true, pick: { ...pick, flipped: [...pick.flipped, position], choice: flips === 1 ? position : null } };
}

// 在翻开的牌里选定一张（仅双翻翻满后）。
export function chooseCard(reward, pick, position) {
    if (pick.choice !== null) return { ok: false, reason: 'combat-flip-done' };
    if (flipCountOf(reward) < 2 || pick.flipped.length < 2) return { ok: false, reason: 'combat-flip-not-ready' };
    return pick.flipped.includes(position) ? { ok: true, pick: { ...pick, choice: position } } : { ok: false, reason: 'combat-flip-position-invalid' };
}

// 重抽状态：费用、当前点数、是否可用及不可用原因。locked 指已锁定（不可再改）。
export function rerollState(reward, pick, { points = 0, payer = false, locked = false } = {}) {
    const reason = locked ? 'combat-flip-locked'
        : pick.set === 'reserve' ? 'combat-reroll-used'
            : !hasReserve(reward) || !payer ? 'combat-reroll-unavailable'
                : points < REROLL_COST ? 'combat-points-insufficient' : null;
    return { cost: REROLL_COST, points, available: reason === null, ...(reason ? { reason } : {}) };
}

// 执行重抽：切到备选组并清空翻牌。
export function rerollPick(reward, pick, options) {
    const state = rerollState(reward, pick, options);
    return state.available ? { ok: true, pick: { set: 'reserve', flipped: [], choice: null } } : { ok: false, reason: state.reason };
}

// 已选中的奖励：{ set, index（槽位下标）, slot }；未选或越界返回 null。
export function lootOf(reward, pick) {
    if (pick.choice === null) return null;
    const index = flipOrder(reward, pick.set)[pick.choice];
    const slot = slotsOf(reward, pick.set)[index];
    return slot ? { set: pick.set, index, slot } : null;
}

// 翻牌界面视图：每个展示位置是否正面朝上（已选/已翻/透视）。朝上的 slot 深拷贝，避免外部改动共享数据。
export function flipView(reward, pick, rerollOptions = {}) {
    const slots = slotsOf(reward, pick.set);
    const revealed = new Set(revealedOf(reward, pick.set));
    const done = pick.choice !== null;
    const flips = flipCountOf(reward);
    const cards = flipOrder(reward, pick.set).map((slotIndex, position) => {
        const flipped = pick.flipped.includes(position);
        const faceUp = done || flipped || revealed.has(position);
        return { position, faceUp, revealed: revealed.has(position), flipped, chosen: pick.choice === position, ...(faceUp ? { slot: JSON.parse(JSON.stringify(slots[slotIndex])) } : {}) };
    });
    return { status: 'ready', set: pick.set, flips, done, needChoice: !done && flips > 1 && pick.flipped.length >= flips, cards, reroll: rerollState(reward, pick, rerollOptions) };
}
