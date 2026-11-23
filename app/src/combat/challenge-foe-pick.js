// 日常挑战备战生成：
// 1. 敌人从与战斗模式一致的 enemyPool（本档位原版 + 等量程序缝合项）中挑选并物化；
// 2. 程序先从本领域专属池拼合初始牌（首次挑战该领域时）与本场 3 张战利品候选卡；
// 3. 在同一次副模型请求中一并完成：敌人编码/起名 + 初始牌/战利品牌按模板与世界观起名和写来历；
// 4. 无模型、超时或校验不通过时无缝回退本地敌人池抽签与领域默认卡名，不阻断日常挑战。
import { generateWithRetry } from './generation-retry.js';
import { hashString } from './random.js';
import { enemyPool, fallbackChoice, materializeChoice } from './enemies/pool.js';
import { CHALLENGE_FOES, pickFoe } from './challenge-foes.js';
import { CHALLENGE_TIER_RULES } from './challenge-setup.js';
import { DOMAIN_CARDS, normalizeChallengeDomain } from './challenge-cards.js';
import { DAILY_LOOT_NAMES } from './challenge-reward.js';

export const CHALLENGE_FOE_SYSTEM = [
    '- challenge-foe：{"foe":"input.foes 中的分类键","name":"难关名称，≤20 字","code":"input.pool 中最贴合的敌人特性编码（如 E01）","art":"可选外观格位","deckCards":[{"id":"与 input.deckCards 对应","name":"2~8字世界观卡名","origin":"≤24字简短来历"}],"lootCards":[{"index":0,"name":"2~8字世界观卡名","origin":"≤24字简短来历"}]}。',
    '  说明：所有卡牌模板与数值、敌人出招与强度都已由程序拼合固定，你只负责：① 从 input.pool 选最贴合剧情与事件（input.event、领域 input.domain）的敌人编码并起名；② 严格对照每张卡的 summary（实际效果）并参考 input.styleSamples 的命名气质，结合当前世界观与剧情为 input.deckCards（如有）和 input.lootCards 逐一拟定贴切的卡名与来历。',
].join('\n');

function styleSamplesFor(domainKey) {
    const base = DOMAIN_CARDS[domainKey];
    const core = base ? [base.push, base.hold, base.combo, base.tempo, base.ace] : [];
    const loot = (DAILY_LOOT_NAMES[domainKey] || []).slice(0, 4);
    return [...new Set([...core, ...loot])];
}

// 构造单次备战请求实体：携带 enemyPool、难关分类、已拼合的初始牌/战利品牌摘要与风格参考。
export function challengeFoeEntity({ event, domain = '', tier = '普通', seed = '', deckCards = [], lootCards = [] } = {}) {
    const domainKey = normalizeChallengeDomain(domain);
    const tierKey = Object.hasOwn(CHALLENGE_TIER_RULES, tier) ? tier : '普通';
    const engineTier = CHALLENGE_TIER_RULES[tierKey].engineTier;
    const id = `challenge-${hashString([event, domainKey, tierKey, seed].join('|'))}`;
    const poolSeed = seed || id;
    const pool = enemyPool({ tier: engineTier, seed: poolSeed });
    const foes = Object.entries(CHALLENGE_FOES).map(([key, foe]) => ({ key, name: foe.name, hints: foe.words.slice(0, 4) }));
    const input = {
        event,
        domain: domainKey,
        tier: tierKey,
        foes,
        pool: pool.map(({ code, text, fit }) => ({ code, text, fit })),
        styleSamples: styleSamplesFor(domainKey),
        ...(Array.isArray(deckCards) && deckCards.length ? { deckCards } : {}),
        ...(Array.isArray(lootCards) && lootCards.length ? { lootCards } : {}),
    };
    return {
        key: `challenge-foe:${id}`,
        kind: 'challenge-foe',
        role: 'challenge',
        owner: id,
        input,
        fixed: { id, tier: engineTier, poolSeed, pool },
    };
}

function materializeChallengeEnemy({ pool, poolSeed, id, code = '', name = '', art = '' }) {
    if (!Array.isArray(pool) || !pool.length) return { enemyProfile: null, enemyCode: '', enemyKind: 'legacy' };
    const byCode = new Map(pool.map((item) => [item.code, item]));
    const picked = (code && byCode.get(code)) || fallbackChoice(pool, poolSeed);
    if (!picked) return { enemyProfile: null, enemyCode: '', enemyKind: 'legacy' };
    const profile = materializeChoice(picked, { id, name: name || picked.profile.name, art });
    return {
        enemyProfile: profile,
        enemyCode: picked.code,
        enemyKind: picked.kind,
    };
}

// 返回 { foe, name, enemyProfile, enemyCode, enemyKind, deckCards, lootCards, source: 'llm' | 'local', reason? }。
export async function chooseChallengeFoe({
    event, domain = '', tier = '普通', seed = '', deckCards = [], lootCards = [],
    request, llm, signal, context = {}, retryDelays, maxRounds, shouldStart,
} = {}) {
    const entity = challengeFoeEntity({ event, domain, tier, seed, deckCards, lootCards });
    const localFoe = (reason) => {
        const foe = pickFoe(event, domain);
        const enemy = materializeChallengeEnemy({
            pool: entity.fixed.pool,
            poolSeed: entity.fixed.poolSeed,
            id: entity.fixed.id,
            name: CHALLENGE_FOES[foe]?.name || '',
        });
        return { foe, name: '', ...enemy, deckCards: [], lootCards: [], source: 'local', reason };
    };
    if (typeof request !== 'function') return localFoe('combat-llm-unavailable');
    const withLine = (req, config) => request({ ...req, system: `${req.system}\n${CHALLENGE_FOE_SYSTEM}` }, config);
    let result;
    try {
        result = await generateWithRetry([entity], {
            request: withLine, llm, signal, context, maxRounds, shouldStart,
            ...(retryDelays ? { retryDelays } : {}),
        });
    } catch {
        return localFoe('combat-llm-request-failed');
    }
    const picked = result?.accepted?.find((item) => item.kind === 'challenge-foe')?.challengeFoe;
    if (picked && Object.hasOwn(CHALLENGE_FOES, picked.foe)) {
        const enemy = materializeChallengeEnemy({
            pool: entity.fixed.pool,
            poolSeed: entity.fixed.poolSeed,
            id: entity.fixed.id,
            code: picked.code,
            name: picked.name || CHALLENGE_FOES[picked.foe]?.name || '',
            art: picked.art,
        });
        return {
            foe: picked.foe,
            name: picked.name,
            ...enemy,
            deckCards: picked.deckCards || [],
            lootCards: picked.lootCards || [],
            source: 'llm',
        };
    }
    return localFoe(result?.reason || result?.rejected?.[0]?.errors?.[0]?.reason || 'combat-llm-rejected');
}
