// 翻牌奖励：翻哪几张、选哪张、重抽备选组、可见性。选择状态 pick = { set, flipped, choice, card?, purge?, upgrade? }。
// card（规则 v6）：选定的是带 choices 的卡牌槽时，再从候选里取第几张（0 起）或 'skip' 放弃；旧进度不带。
// purge（规则 v6 删卡）：本场胜利正好满 5 场普通胜利时，要删的卡组副本 ID 或 'skip' 不删；没有删卡机会时不带。
// upgrade（规则 v6 G3c）：同场的升级机会，要升级的卡组副本 ID 或 'skip' 不升；与 purge 互不占用，但不能选同一张副本。没有升级机会时不带。
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
export const flipOrder = (reward, set) => shuffledIndexes(slotsOf(reward, set).length, `flip|${reward.combatId}|${set}`);
// 透视：开局即可见的展示位置，最多 2 个。
export const revealedOf = (reward, set) => shuffledIndexes(slotsOf(reward, set).length, `reveal|${reward.combatId}|${set}`).slice(0, Math.min(Number(reward.reveal) || 0, 2));

// 选定位置对应的槽位（未选时为 null）。
const chosenSlot = (reward, set, choice) => (choice === null ? null : slotsOf(reward, set)[flipOrder(reward, set)[choice]] || null);
// 槽位是否要再三选一（规则 v6 卡牌槽）。
export const hasCardChoices = (slot) => slot?.kind === 'card' && Array.isArray(slot.choices) && slot.choices.length > 0;
const validCardPick = (value, slot) => value === 'skip' || (Number.isInteger(value) && value >= 0 && value < (slot?.choices?.length || 0));
// 删卡 / 升级选择：卡组副本 ID（与账本副本 ID 同字符集）或 'skip'。
const validCopyPick = (value) => typeof value === 'string' && (value === 'skip' || /^[A-Za-z0-9_:.-]{1,200}$/.test(value));

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
    if (pick.purge !== undefined && !validCopyPick(pick.purge)) return null;
    if (pick.upgrade !== undefined && !validCopyPick(pick.upgrade)) return null;
    // 同一张副本不能既删又升（skip 除外）。
    if (pick.purge !== undefined && pick.purge !== 'skip' && pick.purge === pick.upgrade) return null;
    const extra = { ...(pick.purge === undefined ? {} : { purge: pick.purge }), ...(pick.upgrade === undefined ? {} : { upgrade: pick.upgrade }) };
    if (pick.card === undefined) return { set, flipped: [...flipped], choice, ...extra };
    const slot = chosenSlot(reward, set, choice);
    if (!hasCardChoices(slot) || !validCardPick(pick.card, slot)) return null;
    return { set, flipped: [...flipped], choice, card: pick.card, ...extra };
}

// 进度分：用于两份选择状态取较新者。备选组远大于主组，其次看翻开数，再看是否已选，再看是否已定候选，最后看是否已定删牌 / 升级。
const progressOf = (pick) => (pick.set === 'reserve' ? 100 : 0) + pick.flipped.length * 8 + (pick.choice === null ? 0 : 4) + (pick.card === undefined ? 0 : 2)
    + (pick.purge === undefined ? 0 : 1) + (pick.upgrade === undefined ? 0 : 1);
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

// 规则 v6：选定卡牌槽后在候选里取一张（value 为 0 起的序号）或放弃（'skip'）；可在发送前改选。
export function pickCardChoice(reward, pick, value) {
    if (pick.choice === null) return { ok: false, reason: 'combat-flip-not-ready' };
    const slot = chosenSlot(reward, pick.set, pick.choice);
    if (!hasCardChoices(slot)) return { ok: false, reason: 'combat-flip-card-unavailable' };
    if (!validCardPick(value, slot)) return { ok: false, reason: 'combat-flip-position-invalid' };
    return { ok: true, pick: { ...pick, card: value } };
}

// 规则 v6 删卡：在本场的删卡机会里选一张卡组副本（copyId）或放弃（'skip'）；可在发送前改选。
// purge 为会话算出的机会 { available, cards: [{ copyId, ... }] }。
export function pickPurgeChoice(purge, pick, value) {
    if (!purge?.available) return { ok: false, reason: purge?.reason || 'combat-purge-not-due' };
    if (value !== 'skip' && !(purge.cards || []).some((c) => c.copyId === value)) return { ok: false, reason: 'combat-purge-copy-missing' };
    if (value !== 'skip' && pick.upgrade === value) return { ok: false, reason: 'combat-purge-upgrade-conflict' };
    return { ok: true, pick: { ...pick, purge: value } };
}

// 规则 v6 G3c 升级：在本场的升级机会里选一张卡组副本（copyId）或不升（'skip'）；可在发送前改选，不能选本场要删的那张。
// upgrade 为会话算出的机会 { available, cards: [{ copyId, ... }] }。
export function pickUpgradeChoice(upgrade, pick, value) {
    if (!upgrade?.available) return { ok: false, reason: upgrade?.reason || 'combat-card-upgrade-not-due' };
    if (value !== 'skip' && !(upgrade.cards || []).some((c) => c.copyId === value)) return { ok: false, reason: 'combat-card-upgrade-copy-missing' };
    if (value !== 'skip' && pick.purge === value) return { ok: false, reason: 'combat-card-upgrade-purge-conflict' };
    return { ok: true, pick: { ...pick, upgrade: value } };
}

// 重抽状态：费用、当前点数、是否可用及不可用原因。locked 指已锁定（不可再改）。
// free 为真（特质免费重抽，见 trait-reward-bias.js）时本次重抽免 REROLL_COST。
export function rerollState(reward, pick, { points = 0, payer = false, locked = false, free = false } = {}) {
    const cost = free === true ? 0 : REROLL_COST;
    const reason = locked ? 'combat-flip-locked'
        : pick.set === 'reserve' ? 'combat-reroll-used'
            : !hasReserve(reward) || !payer ? 'combat-reroll-unavailable'
                : points < cost ? 'combat-points-insufficient' : null;
    return { cost, points, available: reason === null, ...(reason ? { reason } : {}) };
}

// 执行重抽：切到备选组并清空翻牌。
export function rerollPick(reward, pick, options) {
    const state = rerollState(reward, pick, options);
    const extra = { ...(pick.purge === undefined ? {} : { purge: pick.purge }), ...(pick.upgrade === undefined ? {} : { upgrade: pick.upgrade }) };
    return state.available ? { ok: true, pick: { set: 'reserve', flipped: [], choice: null, ...extra } } : { ok: false, reason: state.reason };
}

// 已选中的奖励：{ set, index（槽位下标）, slot, pick? }；未选或越界返回 null。带 choices 的卡牌槽附上候选选择（未定时不带）。
export function lootOf(reward, pick) {
    if (pick.choice === null) return null;
    const index = flipOrder(reward, pick.set)[pick.choice];
    const slot = slotsOf(reward, pick.set)[index];
    if (!slot) return null;
    return hasCardChoices(slot) && pick.card !== undefined ? { set: pick.set, index, slot, pick: pick.card } : { set: pick.set, index, slot };
}

// 翻牌界面的特质来源（只读 offer 记录的来源，实际生效才有）：[{ trait, kind: 'choices' | 'reveal' | 'reroll' | 'bias', category? }]。
// 免费重抽只在本次确实免费（rerollOptions.free）时列出；完美主义者无伤未达成时不列。
export function traitSourcesOf(reward, { free = false } = {}) {
    const out = [];
    const flip = reward?.traitFlip;
    if (flip && (flip.effect !== 'reroll' || free === true)) out.push({ trait: flip.trait, kind: flip.effect });
    const bias = reward?.traitBias;
    if (bias) out.push({ trait: bias.trait, kind: 'bias', category: bias.category });
    return out;
}

// 翻牌界面视图：每个展示位置是否正面朝上（已选/已翻/透视）。朝上的 slot 深拷贝，避免外部改动共享数据。
// purge（规则 v6 删卡机会，可选）：{ available, cost, battle, reason?, cards }；视图带 needPurge（机会可用且还没选或跳过）与当前选择。
// upgrade（规则 v6 G3c 升级机会，可选）：{ available, battle, reason?, cards }；视图带 needUpgrade 与当前选择，形状同 purge。
export function flipView(reward, pick, rerollOptions = {}, purge = null, upgrade = null) {
    const slots = slotsOf(reward, pick.set);
    const revealed = new Set(revealedOf(reward, pick.set));
    const done = pick.choice !== null;
    const flips = flipCountOf(reward);
    const cards = flipOrder(reward, pick.set).map((slotIndex, position) => {
        const flipped = pick.flipped.includes(position);
        const faceUp = done || flipped || revealed.has(position);
        return { position, faceUp, revealed: revealed.has(position), flipped, chosen: pick.choice === position, ...(faceUp ? { slot: JSON.parse(JSON.stringify(slots[slotIndex])) } : {}) };
    });
    // 规则 v6：选定的卡牌槽带候选时，needCard 表示还没在候选里取牌或放弃；card 为已定的选择。没有候选时视图形状不变。
    const cardChoices = done && hasCardChoices(chosenSlot(reward, pick.set, pick.choice));
    const card = cardChoices ? { needCard: pick.card === undefined, ...(pick.card !== undefined ? { card: pick.card } : {}) } : {};
    const purgeView = purge ? { purge: { ...JSON.parse(JSON.stringify(purge)), ...(pick.purge !== undefined ? { pick: pick.purge } : {}) }, needPurge: purge.available === true && pick.purge === undefined } : {};
    const upgradeView = upgrade ? { upgrade: { ...JSON.parse(JSON.stringify(upgrade)), ...(pick.upgrade !== undefined ? { pick: pick.upgrade } : {}) }, needUpgrade: upgrade.available === true && pick.upgrade === undefined } : {};
    const sources = traitSourcesOf(reward, rerollOptions);
    return { status: 'ready', set: pick.set, flips, done, ...(sources.length ? { traitSources: sources } : {}), needChoice: !done && flips > 1 && pick.flipped.length >= flips, ...card, cards, reroll: rerollState(reward, pick, rerollOptions), ...purgeView, ...upgradeView };
}
