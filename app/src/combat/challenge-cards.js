// 日常挑战卡组：领域与技能值 → 20 张牌与卡牌目录；各领域拥有专属模板池与程序缝合副效果，支持专精技能加减值与准备期世界观命名。
import { BASIC_CARDS, BASIC_DEFEND_ID, BASIC_STRIKE_ID, COMBAT_RULES } from './rules.js';
import { CARD_TEMPLATES, solveCardTemplate } from './card-templates.js';
import { normalizeCard } from './schema.js';
import { hash32, nextRandom } from './random.js';

export const CHALLENGE_RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic']);
export const CHALLENGE_GENERAL_DOMAIN = '通用';

// 专精技能值 → 实时卡牌倍率（以 50 分为 1.00× 基准：0 分 0.70×，100 分 1.50×）。
export const DOMAIN_SCALING_BASE = 50;
export const DOMAIN_SCALING_MIN = 0.7;
export const DOMAIN_SCALING_MAX = 1.5;

export function domainSkillMultiplier(skillValue) {
    const raw = Number(skillValue);
    const v = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : DOMAIN_SCALING_BASE;
    const mult = v >= DOMAIN_SCALING_BASE
        ? 1 + (v - DOMAIN_SCALING_BASE) * 0.01
        : 1 - (DOMAIN_SCALING_BASE - v) * 0.006;
    return Math.round(Math.min(DOMAIN_SCALING_MAX, Math.max(DOMAIN_SCALING_MIN, mult)) * 100) / 100;
}

export function createDomainScaling(domain, skillValue) {
    const key = normalizeChallengeDomain(domain);
    const raw = Number(skillValue);
    const clamped = Number.isFinite(raw) ? Math.min(100, Math.max(0, Math.round(raw))) : DOMAIN_SCALING_BASE;
    return { domain: key, skillValue: clamped, multiplier: domainSkillMultiplier(clamped) };
}

export function validDomainScaling(value) {
    return Boolean(
        value && typeof value === 'object' && !Array.isArray(value)
        && typeof value.domain === 'string' && value.domain.trim().length > 0 && [...value.domain.trim()].length <= 20
        && Number.isInteger(value.skillValue) && value.skillValue >= 0 && value.skillValue <= 100
        && typeof value.multiplier === 'number' && Number.isFinite(value.multiplier)
        && value.multiplier >= DOMAIN_SCALING_MIN && value.multiplier <= DOMAIN_SCALING_MAX,
    );
}

// 技能值 → 稀有度档位序号：0–29 / 30–59 / 60–79 / 80 以上。
export function challengeTierIndex(skillValue) {
    const value = Number(skillValue);
    if (!(value >= 30)) return 0;
    if (value < 60) return 1;
    return value < 80 ? 2 : 3;
}

// 五个领域牌位：张数、费用、各档模板键（初始牌组压低泛滥回血，留出战利品与升级的成长空间）。
const SLOTS = Object.freeze({
    push: Object.freeze({ copies: 3, cost: 1, ladder: Object.freeze(['strike', 'quick', 'bash']) }),
    hold: Object.freeze({ copies: 3, cost: 1, ladder: Object.freeze(['guard', 'brace', 'brace']) }),
    combo: Object.freeze({ copies: 2, cost: 2, ladder: Object.freeze(['twin', 'cripple', 'venom']) }),
    tempo: Object.freeze({ copies: 1, cost: 1, ladder: Object.freeze(['prepare', 'brace', 'surge']) }),
    ace: Object.freeze({ copies: 1, cost: 2, ladder: Object.freeze(['bash', 'rend', 'shatter']) }),
});

const names = (push, hold, combo, tempo, ace, ladders = {}) => Object.freeze({ push, hold, combo, tempo, ace, ladders: Object.freeze(ladders) });

export const DOMAIN_CARDS = Object.freeze({
    烹饪: names('拿手菜', '掌控火候', '精心装盘', '备料', '招牌秘方', { push: ['strike', 'bash', 'bash'], combo: ['bash', 'bash', 'cripple'] }),
    话术: names('据理力争', '以退为进', '层层递进', '理清脉络', '一语中的', { hold: ['guard', 'brace', 'brace'], ace: ['rend', 'rend', 'shatter'] }),
    学习: names('融会贯通', '稳扎稳打', '一气呵成', '灵感闪现', '举一反三', { combo: ['twin', 'twin', 'flurry'], tempo: ['prepare', 'quick', 'quick'] }),
    应变: names('随机应变', '见招拆招', '连环对策', '急中生智', '绝处逢生'),
    魅力: names('真诚相待', '温柔以对', '软硬兼施', '恰到好处', '打动人心'),
    照顾: names('悉心安排', '耐心守候', '体贴入微', '细致周到', '无微不至', { hold: ['guard', 'brace', 'mend'] }),
    艺术: names('灵感挥洒', '沉心打磨', '笔走龙蛇', '即兴发挥', '神来之笔'),
    运动: names('全力以赴', '保持节奏', '一鼓作气', '调匀气息', '突破极限'),
    家务: names('手脚麻利', '有条不紊', '干净利落', '随手收拾', '焕然一新'),
    [CHALLENGE_GENERAL_DOMAIN]: names('全力应对', '沉着应对', '连番应对', '抓紧时机', '孤注一掷'),
});

// 各领域专属卡牌模板池：对应领域卡组与战利品只会从本领域池子里抽取与缝合，不跨领域串牌。
export const DOMAIN_CARD_POOLS = Object.freeze({
    烹饪: Object.freeze(['strike', 'bash', 'mend', 'brace', 'rend', 'cripple', 'might', 'regrow', 'prepare', 'surge', 'plating', 'rampage']),
    话术: Object.freeze(['quick', 'cripple', 'rend', 'shatter', 'expose', 'trip', 'brace', 'prepare', 'execute', 'counter', 'echo', 'wail']),
    学习: Object.freeze(['quick', 'twin', 'flurry', 'prepare', 'brace', 'quicken', 'sift', 'cull', 'finisher', 'echo', 'opener', 'surge']),
    应变: Object.freeze(['quick', 'bash', 'brace', 'opener', 'counter', 'sift', 'purge', 'quicken', 'encore', 'frenzy', 'desperate', 'surge']),
    魅力: Object.freeze(['cripple', 'trip', 'expose', 'mend', 'brace', 'rally', 'might', 'agility', 'rhythm', 'prepare', 'surge', 'echo']),
    照顾: Object.freeze(['guard', 'mend', 'brace', 'rally', 'regrow', 'plating', 'bulwark', 'counter', 'agility', 'prepare', 'spikes', 'bash']),
    艺术: Object.freeze(['twin', 'flurry', 'bash', 'shatter', 'rampage', 'momentum', 'finisher', 'encore', 'rhythm', 'might', 'prepare', 'surge']),
    运动: Object.freeze(['strike', 'twin', 'flurry', 'bash', 'quick', 'momentum', 'finisher', 'frenzy', 'agility', 'opener', 'desperate', 'mend']),
    家务: Object.freeze(['guard', 'brace', 'bash', 'prepare', 'sift', 'purge', 'cull', 'plating', 'agility', 'mend', 'quicken', 'surge']),
    [CHALLENGE_GENERAL_DOMAIN]: Object.freeze(['strike', 'guard', 'bash', 'quick', 'brace', 'mend', 'twin', 'cripple', 'rend', 'prepare', 'surge', 'shatter']),
});

// 各领域专属缝合副效果：稀有/史诗档由程序按预算缝合到主模板上，经 normalizeCard 校验兜底。
export const DOMAIN_STITCH_RIDERS = Object.freeze({
    烹饪: Object.freeze([
        Object.freeze({ op: 'heal', amount: 2, target: 'self' }),
        Object.freeze({ op: 'block', amount: 3, target: 'self' }),
        Object.freeze({ op: 'status', status: 'strength', stacks: 1, target: 'self' }),
    ]),
    话术: Object.freeze([
        Object.freeze({ op: 'status', status: 'weak', stacks: 1, target: 'enemy' }),
        Object.freeze({ op: 'status', status: 'vulnerable', stacks: 1, target: 'enemy' }),
        Object.freeze({ op: 'draw', amount: 1 }),
    ]),
    学习: Object.freeze([
        Object.freeze({ op: 'draw', amount: 1 }),
        Object.freeze({ op: 'block', amount: 3, target: 'self' }),
        Object.freeze({ op: 'energy', amount: 1 }),
    ]),
    应变: Object.freeze([
        Object.freeze({ op: 'block', amount: 3, target: 'self' }),
        Object.freeze({ op: 'draw', amount: 1 }),
        Object.freeze({ op: 'status', status: 'weak', stacks: 1, target: 'enemy' }),
    ]),
    魅力: Object.freeze([
        Object.freeze({ op: 'status', status: 'weak', stacks: 1, target: 'enemy' }),
        Object.freeze({ op: 'heal', amount: 2, target: 'self' }),
        Object.freeze({ op: 'block', amount: 3, target: 'self' }),
    ]),
    照顾: Object.freeze([
        Object.freeze({ op: 'heal', amount: 3, target: 'self' }),
        Object.freeze({ op: 'block', amount: 4, target: 'self' }),
        Object.freeze({ op: 'status', status: 'regen', stacks: 1, target: 'self' }),
    ]),
    艺术: Object.freeze([
        Object.freeze({ op: 'draw', amount: 1 }),
        Object.freeze({ op: 'damage', amount: 2, hits: 1, target: 'enemy' }),
        Object.freeze({ op: 'status', status: 'strength', stacks: 1, target: 'self' }),
    ]),
    运动: Object.freeze([
        Object.freeze({ op: 'damage', amount: 3, hits: 1, target: 'enemy' }),
        Object.freeze({ op: 'draw', amount: 1 }),
        Object.freeze({ op: 'block', amount: 3, target: 'self' }),
    ]),
    家务: Object.freeze([
        Object.freeze({ op: 'block', amount: 4, target: 'self' }),
        Object.freeze({ op: 'draw', amount: 1 }),
        Object.freeze({ op: 'heal', amount: 2, target: 'self' }),
    ]),
    [CHALLENGE_GENERAL_DOMAIN]: Object.freeze([
        Object.freeze({ op: 'block', amount: 3, target: 'self' }),
        Object.freeze({ op: 'draw', amount: 1 }),
        Object.freeze({ op: 'damage', amount: 2, hits: 1, target: 'enemy' }),
    ]),
});

export const DOMAIN_CARD_KEYS = Object.freeze(Object.fromEntries(Object.entries(DOMAIN_CARD_POOLS).map(([domain, pool]) => [
    domain,
    Object.freeze([...new Set([
        ...pool,
        ...Object.keys(SLOTS).flatMap((slot) => DOMAIN_CARDS[domain]?.ladders?.[slot] || SLOTS[slot].ladder),
    ])]),
])));

// 与领域无关的生活牌，所有人都有（避免初始自带过多无代价回血，保留防守/过牌节奏）。
export const LIFE_CARDS = Object.freeze([
    Object.freeze({ id: 'ch-life-1', name: '深呼吸', key: 'guard', cost: 1 }),
    Object.freeze({ id: 'ch-life-2', name: '暂作休息', key: 'brace', cost: 1 }),
    Object.freeze({ id: 'ch-life-3', name: '温习要点', key: 'prepare', cost: 1 }),
    Object.freeze({ id: 'ch-life-4', name: '整理思路', key: 'quick', cost: 1 }),
]);

export const CHALLENGE_DOMAIN_KEYS = Object.freeze(Object.keys(DOMAIN_CARDS));

export const normalizeChallengeDomain = (domain) => (Object.hasOwn(DOMAIN_CARDS, domain) && domain !== CHALLENGE_GENERAL_DOMAIN ? domain : CHALLENGE_GENERAL_DOMAIN);
const domainKeyOf = normalizeChallengeDomain;

const cloneJson = (value) => JSON.parse(JSON.stringify(value));

function rngOf(seed) {
    let state = hash32(seed);
    return () => {
        const next = nextRandom(state);
        state = next.state;
        return next.value;
    };
}

const EFFECT_STATUS_CN = Object.freeze({
    weak: '虚弱', vulnerable: '易伤', poison: '中毒', frail: '脆弱',
    strength: '攻击力', dexterity: '防御力', thorns: '荆棘', regen: '再生',
});
const RARITY_CN = Object.freeze({ basic: '基础', common: '普通', uncommon: '罕见', rare: '稀有', epic: '史诗' });
const TYPE_CN = Object.freeze({ attack: '攻击', skill: '技能', power: '能力' });

function describeSimpleEffect(effect) {
    if (!effect || typeof effect !== 'object') return '';
    switch (effect.op) {
        case 'damage': return effect.hits > 1 ? `造成${effect.amount}×${effect.hits}点伤害` : `造成${effect.amount}点伤害`;
        case 'block': return `获得${effect.amount}点格挡`;
        case 'heal': return `回复${effect.amount}点意志`;
        case 'draw': return `抽${effect.amount}张牌`;
        case 'energy': return `获得${effect.amount}点精力`;
        case 'status':
        case 'apply-status': {
            const label = EFFECT_STATUS_CN[effect.status] || effect.status;
            return effect.target === 'self' ? `自身获得${effect.stacks}层${label}` : `施加${effect.stacks}层${label}`;
        }
        case 'exhaust-self': return '消耗';
        case 'grow': return `每次打出伤害+${effect.amount}`;
        case 'repeat-last': return '重复上一张牌效果';
        case 'replay-next': return '下一张攻击牌多结算1次';
        case 'cost-mod': return '降低手牌费用';
        case 'discard': return `弃${effect.amount}张牌`;
        case 'discard-hand': return '重抽全部手牌';
        case 'each-turn': return `每回合${(effect.then || []).map(describeSimpleEffect).filter(Boolean).join('、')}`;
        case 'buff': return `数回合内触发${(effect.then || []).map(describeSimpleEffect).filter(Boolean).join('、')}`;
        case 'conditional': return `满足条件追加${(effect.then || []).map(describeSimpleEffect).filter(Boolean).join('、')}`;
        default: return '';
    }
}

// 供准备期 LLM 根据实际拼合好的模板起名与写来历的精简说明。
export function describeDailyCardSummary(card) {
    if (!card || typeof card !== 'object') return '';
    const head = `${card.cost}费·${RARITY_CN[card.rarity] || card.rarity}·${TYPE_CN[card.type] || card.type}`;
    const body = (card.effects || []).map(describeSimpleEffect).filter(Boolean).join('，');
    const flags = [card.innate ? '固有' : '', card.ethereal ? '虚无' : ''].filter(Boolean).join('/');
    return `${head}${flags ? `(${flags})` : ''}：${body || '应对技巧'}`;
}

function sameRiderEffect(existing, rider) {
    if (!existing || !rider) return false;
    if (existing.op !== rider.op) return false;
    if (rider.op === 'status' || rider.op === 'apply-status') return existing.status === rider.status;
    return true;
}

// 在预算合法的前提下，把本领域的一个轻副效果缝合到主模板上（同时同步升级版），并经 normalizeCard 严格检验。
function tryStitchRider(card, domainKey, random) {
    if (!card || !Array.isArray(card.effects) || card.effects.length >= 3 || card.effects.some((e) => e.op === 'exhaust-self')) return card;
    const riders = DOMAIN_STITCH_RIDERS[domainKey] || DOMAIN_STITCH_RIDERS[CHALLENGE_GENERAL_DOMAIN];
    if (!riders?.length) return card;
    const primaryIndex = card.effects.findIndex((e) => (e.op === 'damage' || e.op === 'block') && Number.isFinite(e.amount) && e.amount >= 4);
    if (primaryIndex < 0) return card;
    const start = Math.floor((typeof random === 'function' ? random() : 0) * riders.length);
    for (let step = 0; step < riders.length; step += 1) {
        const rider = riders[(start + step) % riders.length];
        if (card.effects.some((e) => sameRiderEffect(e, rider))) continue;
        for (const trim of [0.85, 0.75, 0.65]) {
            const candidate = cloneJson(card);
            const main = candidate.effects[primaryIndex];
            main.amount = Math.max(1, Math.round(main.amount * trim));
            candidate.effects.push(cloneJson(rider));
            if (candidate.upgraded?.effects) {
                const upMain = candidate.upgraded.effects[primaryIndex];
                if (upMain && Number.isFinite(upMain.amount)) upMain.amount = Math.max(main.amount, Math.round(upMain.amount * trim));
                if (!candidate.upgraded.effects.some((e) => sameRiderEffect(e, rider))) {
                    const upRider = cloneJson(rider);
                    if (Number.isFinite(upRider.amount) && upRider.op !== 'draw' && upRider.op !== 'energy') upRider.amount += 1;
                    candidate.upgraded.effects.push(upRider);
                }
            }
            // 移除模板升级来源字段，避免与自定义缝合结构冲突
            delete candidate.upgradeModel;
            delete candidate.upgradeReason;
            delete candidate.sourceModel;
            const check = normalizeCard({ id: 'ch-stitch-check', name: '缝合牌', ...candidate });
            if (check.ok) return candidate;
        }
    }
    return card;
}

// 从指定领域专属池中按费用、稀有度解算并按需程序缝合一张卡牌。
export function stitchChallengeCard({ domain, key, cost = 1, rarity = 'common', random = null, allowStitch = true } = {}) {
    const domainKey = domainKeyOf(domain);
    const pool = DOMAIN_CARD_POOLS[domainKey] || DOMAIN_CARD_POOLS[CHALLENGE_GENERAL_DOMAIN];
    const resolvedKey = key && Object.hasOwn(CARD_TEMPLATES, key) ? key : pool[0];
    const solved = solveCardTemplate(resolvedKey, cost, rarity);
    if (!solved) return null;
    const base = { cost, rarity, ...solved };
    if (!allowStitch || (rarity !== 'rare' && rarity !== 'epic')) return base;
    return tryStitchRider(base, domainKey, random);
}

function buildCard(id, name, key, cost, rarity, { domain, random, allowStitch = false, flavor = '' } = {}) {
    const solved = allowStitch
        ? stitchChallengeCard({ domain, key, cost, rarity, random, allowStitch: true })
        : solveCardTemplate(key, cost, rarity);
    if (!solved) return null;
    return { id, name, cost: solved.cost ?? cost, rarity: solved.rarity ?? rarity, ...solved, ...(flavor ? { flavor } : {}) };
}

// 按领域与随机种子从本领域专属池为 5 个初始牌位挑选不重复模板（保持推/守/连/节/王牌结构）。
function pickDomainSlotKeys(domainKey, def, ladderAt, seed) {
    if (!seed) {
        return Object.fromEntries(Object.keys(SLOTS).map((slot) => [slot, (def.ladders[slot] || SLOTS[slot].ladder)[ladderAt]]));
    }
    const pool = DOMAIN_CARD_POOLS[domainKey] || DOMAIN_CARD_POOLS[CHALLENGE_GENERAL_DOMAIN];
    const random = rngOf(`daily-deck-slots|${domainKey}|${seed}`);
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const used = new Set();
    const take = (predicate, cost, rarity, fallback) => {
        const hit = shuffled.find((k) => !used.has(k) && predicate(CARD_TEMPLATES[k]) && solveCardTemplate(k, cost, rarity));
        if (hit) { used.add(hit); return hit; }
        used.add(fallback);
        return fallback;
    };
    const r = CHALLENGE_RARITIES[ladderAt];
    const push = take((t) => t?.type === 'attack', 1, r, (def.ladders.push || SLOTS.push.ladder)[ladderAt]);
    const hold = take((t) => t?.type === 'skill' || t?.type === 'power', 1, r, (def.ladders.hold || SLOTS.hold.ladder)[ladderAt]);
    const combo = take((t) => t?.type === 'attack', 2, r, (def.ladders.combo || SLOTS.combo.ladder)[ladderAt]);
    const tempo = take((t) => t?.type === 'skill' || t?.type === 'power', 1, r, (def.ladders.tempo || SLOTS.tempo.ladder)[ladderAt]);
    const ace = take((t) => Boolean(t), 2, r, (def.ladders.ace || SLOTS.ace.ladder)[ladderAt]);
    return { push, hold, combo, tempo, ace };
}

// 领域之外的相关技能：技能值不低于 RELATED_MIN 时，最多两项各顶替一张领域牌。
export const RELATED_SKILLS = Object.freeze({
    烹饪: Object.freeze(['应变', '家务', '照顾']),
    话术: Object.freeze(['魅力', '应变', '学习']),
    学习: Object.freeze(['话术', '艺术', '应变']),
    应变: Object.freeze(['运动', '话术', '魅力']),
    魅力: Object.freeze(['话术', '艺术', '照顾']),
    照顾: Object.freeze(['家务', '魅力', '应变']),
    艺术: Object.freeze(['学习', '魅力', '应变']),
    运动: Object.freeze(['应变', '照顾', '家务']),
    家务: Object.freeze(['烹饪', '照顾', '应变']),
    [CHALLENGE_GENERAL_DOMAIN]: Object.freeze([]),
});
export const RELATED_MIN = 50;
export const RELATED_MAX = 2;
// 顶替的是领域的第几类牌位：第一项换掉一张进攻牌，第二项换掉一张防守牌，张数不变。
const RELATED_REPLACES = Object.freeze(['push', 'hold']);

function relatedPicks(key, otherSkills) {
    const picks = [];
    for (const name of RELATED_SKILLS[key] || []) {
        const value = Number(otherSkills?.[name]?.value ?? otherSkills?.[name]);
        if (Object.hasOwn(DOMAIN_CARDS, name) && value >= RELATED_MIN) picks.push({ name, value });
    }
    return picks.sort((a, b) => b.value - a.value).slice(0, RELATED_MAX);
}

// 给已建好的牌组目录套用 LLM 按世界观起的名称与来历（缺项或非法项保持原名）。
export function applyDailyDeckNaming(built, namedCards) {
    if (!built?.catalog || !namedCards) return built;
    const entries = namedCards instanceof Map ? namedCards : new Map(Object.entries(namedCards));
    if (!entries.size) return built;
    const catalog = cloneJson(built.catalog);
    for (const [id, info] of entries) {
        if (!catalog[id] || Object.hasOwn(BASIC_CARDS, id)) continue;
        const name = typeof info?.name === 'string' ? info.name.trim() : '';
        const flavor = typeof (info?.origin ?? info?.flavor) === 'string' ? String(info.origin ?? info.flavor).trim() : '';
        if (name && [...name].length <= 12) catalog[id].name = name;
        if (flavor && [...flavor].length <= 60) catalog[id].flavor = flavor;
    }
    return { ...built, catalog };
}

// 领域不在映射表里时走通用牌组；技能值决定稀有度档位，并在提供 seed 时从本领域专属池抽取与缝合模板。
// otherSkills 为 { 技能名: 值 } 或 { 技能名: { value } }，相关技能高时用其应急牌顶替领域牌，总数仍是 20 张。
export function buildChallengeDeck({ domain, skillValue, otherSkills, seed = '', cardNames = null } = {}) {
    const key = domainKeyOf(domain);
    const def = DOMAIN_CARDS[key];
    const tier = challengeTierIndex(skillValue);
    const ladderAt = Math.min(tier, 2);
    const random = seed ? rngOf(`daily-deck-stitch|${key}|${seed}`) : null;
    const slotKeys = pickDomainSlotKeys(key, def, ladderAt, seed);
    const catalog = Object.fromEntries(Object.entries(BASIC_CARDS).map(([id, card]) => [id, cloneJson(card)]));
    const deck = [...Array(COMBAT_RULES.starterDeckShape.basicAttack).fill(BASIC_STRIKE_ID), ...Array(COMBAT_RULES.starterDeckShape.basicDefend).fill(BASIC_DEFEND_ID)];
    const swaps = relatedPicks(key, otherSkills).map((pick, index) => ({ ...pick, slot: RELATED_REPLACES[index] }));
    // 初始 20 张卡保持克制的起手稀有度（与专精倍率 domainScaling 避免双重膨胀；高稀有卡由战利品三选一与升级获取）。
    const starterRarityFor = (slot) => {
        if (slot === 'ace') return tier >= 3 ? 'rare' : tier >= 1 ? 'uncommon' : 'common';
        if (slot === 'combo') return tier >= 2 ? 'uncommon' : 'common';
        return tier >= 3 ? 'uncommon' : 'common';
    };
    const domainCardIds = [];
    for (const [slot, spec] of Object.entries(SLOTS)) {
        const rarity = starterRarityFor(slot);
        const card = buildCard(`ch-${slot}`, def[slot], slotKeys[slot], spec.cost, rarity, {
            domain: key, random, allowStitch: Boolean(seed) && slot === 'ace' && tier >= 2,
        });
        const swap = swaps.find((item) => item.slot === slot);
        catalog[card.id] = card;
        domainCardIds.push(card.id);
        deck.push(...Array(spec.copies - (swap ? 1 : 0)).fill(card.id));
        if (!swap) continue;
        const other = DOMAIN_CARDS[swap.name];
        const swapAt = Math.min(challengeTierIndex(swap.value), 2);
        const swapCard = buildCard(`ch-rel-${slot}`, other.tempo, (other.ladders.tempo || SLOTS.tempo.ladder)[swapAt], SLOTS.tempo.cost, CHALLENGE_RARITIES[swapAt]);
        catalog[swapCard.id] = swapCard;
        domainCardIds.push(swapCard.id);
        deck.push(swapCard.id);
    }
    for (const life of LIFE_CARDS) {
        catalog[life.id] = buildCard(life.id, life.name, life.key, life.cost, 'common');
        deck.push(life.id);
    }
    const built = { domain: key, rarity: CHALLENGE_RARITIES[tier], deck, catalog, related: swaps.map((swap) => swap.name), domainCardIds };
    return cardNames ? applyDailyDeckNaming(built, cardNames) : built;
}

// 从账本已固定的领域日常牌组还原开战牌库与目录（保留副本 ID 与升级状态）。
export function buildFixedChallengeDeck(fixedDeck) {
    const domain = domainKeyOf(fixedDeck?.domain);
    const catalog = Object.fromEntries(Object.entries(BASIC_CARDS).map(([id, card]) => [id, cloneJson(card)]));
    const sourceCatalog = fixedDeck?.catalog instanceof Map ? fixedDeck.catalog : new Map(Object.entries(fixedDeck?.catalog || {}));
    const deck = [];
    for (const entry of Array.isArray(fixedDeck?.deckEntries) ? fixedDeck.deckEntries : []) {
        const cardId = typeof entry === 'string' ? entry : entry?.cardId;
        if (!cardId) continue;
        if (!catalog[cardId] && sourceCatalog.has(cardId)) catalog[cardId] = cloneJson(sourceCatalog.get(cardId));
        if (!catalog[cardId]) continue;
        if (typeof entry === 'string') deck.push(cardId);
        else deck.push({ cardId, ...(entry.upgraded === true ? { upgraded: true } : {}), ...(entry.copyId ? { copyId: entry.copyId } : {}) });
    }
    return { domain, deck, catalog };
}

// 提取首次完成该领域挑战时要落账固定的 20 张初始牌组快照（不含临时协助者牌与内置基础牌定义）。
export function initialDailyDeckSnapshot(built) {
    if (!built || !Array.isArray(built.deck) || !built.deck.length) return null;
    const deck = built.deck.map((item) => (typeof item === 'string' ? item : item?.cardId)).filter(Boolean);
    const seen = new Set();
    const cards = [];
    for (const id of deck) {
        if (seen.has(id) || Object.hasOwn(BASIC_CARDS, id)) continue;
        const def = built.catalog?.[id];
        if (!def) continue;
        seen.add(id);
        cards.push(cloneJson(def));
    }
    return { domain: domainKeyOf(built.domain), deck, cards };
}
