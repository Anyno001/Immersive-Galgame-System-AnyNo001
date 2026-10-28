import { combatExpReward } from './rules.js';
import { GEAR_SLOTS, REWARD_SLOT_COUNT } from './schema.js';
import { hash32, nextRandom } from './random.js';

// 胜利翻牌的准备阶段（v3 §5.1–5.2，按助手 2026-10-27 反馈调整）：程序按遭遇档位与种子定每槽类别、稀有度、费用、部位与数量；
// 副模型只给名称、模板键与来历，组装见 generation-assembly.js 的 assembleReward。不出属性点、卡牌升级与人物特性。掉率暂定，实机后调。纯函数，不读写存储。
const RARITY_STEPS = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'mythic']);
const rank = (rarity) => RARITY_STEPS.indexOf(rarity);
const atLeast = (rarity, floor) => rank(rarity) >= rank(floor);
// 类别：keepsake 杂物（没有战斗效果，稀有度只决定品相与翻牌爆光）、card 卡牌、gear 装备（武器 / 防具 / 饰品）、treasure 宝物（宝物部位装备，稀有以上）、item 一次性道具。
// keepsake：非保底槽为杂物的概率；guaranteed：前几槽保底非杂物；floor：保底槽最低稀有度；rarity：稀有度权重；keepsakeRarity：杂物稀有度权重（缺省同 rarity）；
// kinds：非杂物类别权重；cardCap：卡牌稀有度上限。
const REWARD_TABLES = Object.freeze({
    normal: Object.freeze({ keepsake: 0.85, guaranteed: 0, cardCap: 'uncommon',
        rarity: Object.freeze([['common', 75], ['uncommon', 22], ['rare', 3]]),
        kinds: Object.freeze([['item', 4], ['card', 3], ['gear', 2], ['treasure', 1]]) }),
    elite: Object.freeze({ keepsake: 0.8, guaranteed: 1,
        rarity: Object.freeze([['uncommon', 40], ['rare', 40], ['epic', 20]]),
        kinds: Object.freeze([['card', 3], ['gear', 3], ['item', 2], ['treasure', 2]]) }),
    // 首领：保底槽史诗以上，杂物品质另行拉高。
    boss: Object.freeze({ keepsake: 0.8, guaranteed: 1, floor: 'epic',
        rarity: Object.freeze([['rare', 50], ['epic', 40], ['mythic', 10]]),
        keepsakeRarity: Object.freeze([['rare', 20], ['epic', 50], ['mythic', 30]]),
        kinds: Object.freeze([['card', 3], ['gear', 3], ['treasure', 3], ['item', 1]]) }),
});
const CARD_COST_WEIGHTS = Object.freeze([[0, 1], [1, 3], [2, 3], [3, 2]]);
const ARMS = Object.freeze(GEAR_SLOTS.filter((s) => s !== 'treasure'));

function sequence(seed) {
    let state = hash32(seed);
    return () => { const r = nextRandom(state); state = r.state; return r.value; };
}
function draw(rng, entries) {
    let x = rng() * entries.reduce((sum, [, w]) => sum + w, 0);
    for (const [value, w] of entries) { x -= w; if (x < 0) return value; }
    return entries[entries.length - 1][0];
}
const pickIndex = (rng, size) => Math.min(size - 1, Math.floor(rng() * size));

// 胜利 EXP：与战报同口径（按敌人档位求和，上限 1000）。
export const victoryExpFor = (enemyTiers) => Math.min(combatExpReward(enemyTiers), 1000);

const normLinks = (links) => ({ reveal: links?.reveal === 2 ? 2 : links?.reveal ? 1 : 0, reflip: links?.reflip === true, fortune: links?.fortune === true });
const bump = (slot) => { slot.rarity = RARITY_STEPS[Math.min(RARITY_STEPS.length - 1, rank(slot.rarity) + 1)]; };

// 一套槽位：按 rng 依次抽类别、稀有度、费用与部位。
function drawSlots(rng, table, kinds, count, fortune) {
    const slots = [];
    for (let index = 0; index < count; index += 1) {
        if (index >= table.guaranteed && rng() < table.keepsake) {
            slots.push({ index, kind: 'keepsake', rarity: draw(rng, table.keepsakeRarity || table.rarity) });
            continue;
        }
        let rarity = draw(rng, table.rarity);
        if (index < table.guaranteed && table.floor && rank(rarity) < rank(table.floor)) rarity = table.floor;
        // 宝物按稀有以上口径：稀有以下抽到宝物时改为武器 / 防具 / 饰品。
        let pick = draw(rng, kinds);
        if (pick === 'treasure' && !atLeast(rarity, 'rare')) pick = 'gear';
        if (pick === 'card' && table.cardCap && rank(rarity) > rank(table.cardCap)) rarity = table.cardCap;
        const slot = { index, kind: pick === 'treasure' ? 'gear' : pick, rarity };
        if (pick === 'card') slot.cost = draw(rng, CARD_COST_WEIGHTS);
        if (pick === 'gear') slot.gearSlot = ARMS[pickIndex(rng, ARMS.length)];
        if (pick === 'treasure') slot.gearSlot = 'treasure';
        slots.push(slot);
    }
    // 天运：把 1 个非杂物槽位的稀有度上调一档。
    const ranked = slots.filter((s) => s.kind !== 'keepsake');
    if (fortune) {
        const open = ranked.filter((s) => rank(s.rarity) < RARITY_STEPS.length - 1);
        if (open.length) bump(open[pickIndex(rng, open.length)]);
    }
    // 一次性道具数量：史诗以上 2，其余 1。
    for (const s of ranked) if (s.kind === 'item') s.count = atLeast(s.rarity, 'epic') ? 2 : 1;
    return slots;
}

// 槽位计划：同一 combatId 与角色重算得到同一计划。tier 为遭遇档位；links 为准备时生效的翻牌联动 { reveal:0|1|2, reflip, fortune }（第 12 步接入，开战后换装不影响本场）。
// 返回 { seed, tier, exp, links, slots, reserve }，槽位形如 { index, kind:'keepsake'|'card'|'gear'|'item', rarity, cost?, gearSlot?, count? }；宝物是 gearSlot 为 treasure 的 gear。
// reserve 是翻牌花积分重抽时换上的备用套：规则、槽位数与联动同主套，种子由主套派生。
export function planRewardSlots({ combatId, tier, enemyTiers = [], character = null, links } = {}) {
    const key = Object.hasOwn(REWARD_TABLES, tier) ? tier : 'normal';
    const table = REWARD_TABLES[key];
    const link = normLinks(links);
    const seed = `reward|${combatId ?? ''}|${character?.id ?? ''}`;
    // 技能角色没有卡组：不出卡牌。
    const deck = character?.kind === 'deck-character';
    const kinds = table.kinds.filter(([kind]) => kind !== 'card' || deck);
    const count = REWARD_SLOT_COUNT + (link.reflip ? 1 : 0);
    const slots = drawSlots(sequence(seed), table, kinds, count, link.fortune);
    const reserve = drawSlots(sequence(`${seed}|reserve`), table, kinds, count, link.fortune);
    return { seed, tier: key, exp: victoryExpFor(enemyTiers), links: link, slots, reserve };
}

