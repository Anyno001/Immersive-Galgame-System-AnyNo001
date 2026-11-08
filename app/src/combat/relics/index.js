// 规则 v6 遗物表汇总（G5f）：只读索引、按 ID 取条目、把战斗内模型物化为被动。
// 原版模型与拆解模型的 1:1 抽取由 draw.js 按种子决定，这里只管数据。
import { COMMON_RELICS } from './common.js';
import { UNCOMMON_RELICS } from './uncommon.js';
import { RARE_RELICS } from './rare.js';
import { SHOP_RELICS } from './shop.js';
import { CLASS_RELICS } from './class.js';
import { OFF_COMBAT_KINDS } from './dsl.js';

export { OFF_COMBAT_KINDS };
export const RELIC_MODELS = Object.freeze(['original', 'split']);
export const RELICS = Object.freeze([...COMMON_RELICS, ...UNCOMMON_RELICS, ...RARE_RELICS, ...SHOP_RELICS, ...CLASS_RELICS]);

const BY_ID = new Map(RELICS.map((item) => [item.id, item]));
export const relicById = (id) => (typeof id === 'string' ? BY_ID.get(id) ?? null : null);

// 模型是否为战斗内被动（有触发器）；战斗外模型带 kind。
export const isCombatModel = (model) => Boolean(model && typeof model.trigger === 'string');
const FILTER_KEYS = ['cardType', 'status', 'orb', 'cause'];

// 战斗内模型 → 被动对象（效果为新拷贝）；战斗外模型返回 null。
export function relicPassive(item, modelKey) {
    const model = item?.[modelKey];
    if (!isCombatModel(model)) return null;
    const filters = Object.fromEntries(FILTER_KEYS.filter((key) => model[key] !== undefined).map((key) => [key, model[key]]));
    return {
        id: `${item.id}-${modelKey === 'original' ? 'o' : 's'}`, name: item.name, trigger: model.trigger, ...filters,
        effects: JSON.parse(JSON.stringify(model.effects)), description: model.text,
    };
}
