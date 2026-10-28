import { hash32, nextRandom } from './random.js';

// 人物特性（P-d，助手反馈 3）：只主角、只能花积分抽（TRAIT_DRAW_COST，points.js），最多装 TRAIT_SLOTS 个，已满时替换一个或放弃（都永久消失）。
// 稀有度按 TRAIT_RARITY_WEIGHTS 抽，种子为主角 ID 与已生效的抽取次数（traitSeed）：楼层回退后再抽得到同一稀有度，不能靠回退刷稀有度。
// 特性可带一种翻牌联动（透视 reveal / 再翻 reflip / 天运 fortune），由日志载荷的 link 给定；抽取时附带联动的比例待助手确认，确认前抽到的特性不带联动。
// 纯常量与纯函数，不读写存储；名称、来历与被动模板由副 LLM 按剧情生成，程序组装（generation.js 的 trait 实体）。
export const TRAIT_SLOTS = 2;
export const TRAIT_RARITY_WEIGHTS = Object.freeze({ common: 50, uncommon: 30, rare: 14, epic: 5, mythic: 1 });
export const TRAIT_RARITIES = Object.freeze(Object.keys(TRAIT_RARITY_WEIGHTS));
export const TRAIT_LINKS = Object.freeze(['reveal', 'reflip', 'fortune']);
export const TRAIT_LINK_LABELS = Object.freeze({ reveal: '透视', reflip: '再翻', fortune: '天运' });

export const traitSeed = (heroId, draws) => `${heroId ?? ''}|${Number.isInteger(draws) ? draws : 0}`;

// 按种子确定性抽稀有度：同一种子结果相同。
export function planTrait(seed = '') {
    let x = nextRandom(hash32(`trait:${seed}`)).value * Object.values(TRAIT_RARITY_WEIGHTS).reduce((s, w) => s + w, 0);
    for (const [rarity, w] of Object.entries(TRAIT_RARITY_WEIGHTS)) {
        if (x < w) return { rarity };
        x -= w;
    }
    return { rarity: TRAIT_RARITIES.at(-1) };
}

// 翻牌联动汇总（准备阶段按当时装着的特性，开战后换特性不影响本场）：透视取最大（神话特性亮 2 张），再翻与天运任一即生效；每场每种最多一次。
export function traitLinks(traits) {
    const out = { reveal: 0, reflip: false, fortune: false };
    for (const t of Array.isArray(traits) ? traits : []) {
        if (t?.link === 'reveal') out.reveal = Math.max(out.reveal, t.rarity === 'mythic' ? 2 : 1);
        else if (t?.link === 'reflip') out.reflip = true;
        else if (t?.link === 'fortune') out.fortune = true;
    }
    return out;
}

// 装着的特性的战斗被动，随角色进入 setup；待定（尚未决定替换或放弃）的特性不生效。
export const traitPassives = (view) => (Array.isArray(view?.traits) ? view.traits : []).map((t) => t?.passive).filter(Boolean);
