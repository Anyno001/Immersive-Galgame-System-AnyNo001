import { hash32, randomInt } from './random.js';
import { REWARD_SLOT_COUNT } from './schema.js';
import { REROLL_COST } from './points.js';

// 胜利翻牌（v3 §5.3，助手反馈 3）：纯函数，不读写存储。offer 为开战楼日志表的 offer；pick 为翻牌进度 { set, flipped, choice }：
// set 是当前翻的套别（main 主套 / reserve 花积分换上的备用套），flipped 是已翻开的位置，choice 是选定的位置（未选定为 null）。
// 位置按 combatId 与套别的种子打乱，重开一致；透视（offer.reveal）先亮出几张，只亮不算翻；再翻（4 槽）时翻两张后二选一，否则翻一张即选定。
// 重抽每场一次：花 REROLL_COST 积分换上备用套重新翻，主套的翻牌作废；旧 offer 没有备用套、领取者不是主角或余额不足时不可用。
export const FLIP_SETS = Object.freeze(['main', 'reserve']);
export const emptyPick = () => ({ set: 'main', flipped: [], choice: null });

const slotsOf = (offer, set) => (set === 'reserve' ? offer.reserve : offer.slots) || [];
const hasReserve = (offer) => Array.isArray(offer.reserve) && offer.reserve.length === offer.slots.length;
export const flipCountOf = (offer) => (offer.slots.length > REWARD_SLOT_COUNT ? 2 : 1);

function shuffled(n, seedText) {
    const out = Array.from({ length: n }, (_, i) => i);
    let state = hash32(seedText);
    for (let i = n - 1; i > 0; i -= 1) {
        const r = randomInt(state, i + 1);
        state = r.state;
        [out[i], out[r.value]] = [out[r.value], out[i]];
    }
    return out;
}
// 位置 → 槽位下标；透视先亮的位置。
export const flipOrder = (offer, set) => shuffled(slotsOf(offer, set).length, `flip|${offer.combatId}|${set}`);
export const revealedOf = (offer, set) => shuffled(slotsOf(offer, set).length, `reveal|${offer.combatId}|${set}`).slice(0, Math.min(Number(offer.reveal) || 0, 2));

// 存档里的翻牌进度：形状不对或与 offer 不符时返回 null（调用方按记录损坏处理）。
export function normalizePick(raw, offer) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const { set } = raw;
    if (!FLIP_SETS.includes(set) || (set === 'reserve' && !hasReserve(offer))) return null;
    const n = slotsOf(offer, set).length;
    const flips = flipCountOf(offer);
    const flipped = Array.isArray(raw.flipped) ? raw.flipped : null;
    if (!flipped || flipped.length > flips || new Set(flipped).size !== flipped.length
        || !flipped.every((p) => Number.isInteger(p) && p >= 0 && p < n)) return null;
    const choice = raw.choice ?? null;
    if (choice !== null && !flipped.includes(choice)) return null;
    if (flips === 1 && flipped.length === 1 && choice !== flipped[0]) return null;
    if (flips === 2 && choice !== null && flipped.length < 2) return null;
    return { set, flipped: [...flipped], choice };
}

// 两份存档（会话存档与聊天记录）不一致时取进度更靠后的一份：换过备用套 > 翻开张数 > 已选定。
const progressOf = (p) => (p.set === 'reserve' ? 100 : 0) + p.flipped.length * 2 + (p.choice === null ? 0 : 1);
export const laterPick = (a, b) => (!a ? b : !b ? a : progressOf(b) > progressOf(a) ? b : a);

export function flipCard(offer, pick, position) {
    const n = slotsOf(offer, pick.set).length;
    if (!Number.isInteger(position) || position < 0 || position >= n) return { ok: false, reason: 'combat-flip-position-invalid' };
    if (pick.choice !== null) return { ok: false, reason: 'combat-flip-done' };
    if (pick.flipped.includes(position)) return { ok: false, reason: 'combat-flip-already' };
    const flips = flipCountOf(offer);
    if (pick.flipped.length >= flips) return { ok: false, reason: 'combat-flip-choose' };
    return { ok: true, pick: { ...pick, flipped: [...pick.flipped, position], choice: flips === 1 ? position : null } };
}

// 再翻：两张都翻开后从中选一张。
export function chooseCard(offer, pick, position) {
    if (pick.choice !== null) return { ok: false, reason: 'combat-flip-done' };
    if (flipCountOf(offer) < 2 || pick.flipped.length < 2) return { ok: false, reason: 'combat-flip-not-ready' };
    if (!pick.flipped.includes(position)) return { ok: false, reason: 'combat-flip-position-invalid' };
    return { ok: true, pick: { ...pick, choice: position } };
}

// payer：领取者是主角（积分只主角有）；locked：战利品已附进战报，不能再改。
export function rerollState(offer, pick, { points = 0, payer = false, locked = false } = {}) {
    const reason = locked ? 'combat-flip-locked' : pick.set === 'reserve' ? 'combat-reroll-used'
        : !hasReserve(offer) || !payer ? 'combat-reroll-unavailable' : points < REROLL_COST ? 'combat-points-insufficient' : null;
    return { cost: REROLL_COST, points, available: reason === null, ...(reason ? { reason } : {}) };
}

export function rerollPick(offer, pick, opts) {
    const state = rerollState(offer, pick, opts);
    return state.available ? { ok: true, pick: { set: 'reserve', flipped: [], choice: null } } : { ok: false, reason: state.reason };
}

// 选定的战利品 { set, index, slot }；未选定返回 null。
export function lootOf(offer, pick) {
    if (pick.choice === null) return null;
    const index = flipOrder(offer, pick.set)[pick.choice];
    const slot = slotsOf(offer, pick.set)[index];
    return slot ? { set: pick.set, index, slot } : null;
}

// 界面只读视图：未翻开、未亮出的牌不带内容；选定后全部翻开展示。
export function flipView(offer, pick, opts = {}) {
    const slots = slotsOf(offer, pick.set);
    const revealed = new Set(revealedOf(offer, pick.set));
    const done = pick.choice !== null;
    const flips = flipCountOf(offer);
    const cards = flipOrder(offer, pick.set).map((index, position) => {
        const flipped = pick.flipped.includes(position);
        const faceUp = done || flipped || revealed.has(position);
        return { position, faceUp, revealed: revealed.has(position), flipped, chosen: pick.choice === position, ...(faceUp ? { slot: JSON.parse(JSON.stringify(slots[index])) } : {}) };
    });
    return { status: 'ready', set: pick.set, flips, done, needChoice: !done && flips > 1 && pick.flipped.length >= flips, cards, reroll: rerollState(offer, pick, opts) };
}
